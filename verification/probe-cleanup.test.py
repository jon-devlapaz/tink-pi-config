import ast
import contextlib
import io
import json
import pathlib
import subprocess
import tempfile
import types
import unittest

HERE = pathlib.Path(__file__).resolve().parent


def source(name):
    return ast.parse((HERE / name).read_text())


def execute(nodes, state):
    exec(compile(ast.Module(body=nodes, type_ignores=[]), "isolated-probe-test", "exec"), state)


class ProbeCleanupTests(unittest.TestCase):
    def test_hc_cleanup_continues_after_watcher_and_command_timeouts(self):
        calls = []

        class Watch:
            live = True

            def poll(self):
                return None if self.live else 0

            def terminate(self):
                calls.append("terminate")

            def wait(self, timeout):
                if self.live:
                    raise subprocess.TimeoutExpired("watch", timeout)

            def kill(self):
                calls.append("kill-watch")
                self.live = False

        def run(argv, **kwargs):
            calls.append(argv[1:])
            if argv[1] == "kill":
                raise subprocess.TimeoutExpired(argv, kwargs["timeout"])
            return subprocess.CompletedProcess(argv, 0)

        tree = source("hc-smoke.py")
        with tempfile.TemporaryDirectory() as directory:
            state = dict(ROOT=pathlib.Path(directory), HC="fixture-hc", ENV={}, terminal="fixture", watch=Watch(), EVIDENCE=[], CLEANUP_ERRORS=[], json=json, subprocess=types.SimpleNamespace(run=run))
            execute([node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in ["cleanup", "stop_process"]], state)
            with self.assertRaisesRegex(AssertionError, "scratch cleanup failed"), contextlib.redirect_stdout(io.StringIO()):
                execute(tree.body[-1].finalbody, state)
            evidence = json.loads((pathlib.Path(directory) / "evidence.json").read_text())
            self.assertIn("kill-watch", calls)
            self.assertIn(["rm", "fixture"], calls)
            self.assertIn(["server", "stop"], calls)
            self.assertEqual(sum(item.get("ok") is False for item in evidence), 2)

    def test_tui_cleanup_failure_is_nonzero_and_saved(self):
        self.check_tmux_cleanup("tui.py", "tui-results.json")

    def test_startup_cleanup_failure_is_nonzero_and_saved(self):
        self.check_tmux_cleanup("startup-errors.py", "startup-errors-results.json")

    def check_tmux_cleanup(self, name, result_name):
        def tm(*args):
            raise subprocess.TimeoutExpired(args, 15)

        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            state = dict(tm=tm, ROOT=root, ROOTS=[str(root)], CHECKS=[{"name": "fixture", "ok": True}], json=json, pathlib=pathlib)
            with self.assertRaises(SystemExit) as failure, contextlib.redirect_stdout(io.StringIO()):
                execute(source(name).body[-1].finalbody, state)
            self.assertEqual(failure.exception.code, 1)
            checks = json.loads((root / result_name).read_text())
            self.assertEqual(checks[-1]["name"], "tmux-cleanup")
            self.assertFalse(checks[-1]["ok"])

    def test_tmux_helpers_use_empty_config_sanitized_environment_and_timeout(self):
        for name in ["tui.py", "startup-errors.py"]:
            with self.subTest(name=name):
                calls = []

                def run(argv, **kwargs):
                    calls.append((argv, kwargs))
                    return types.SimpleNamespace(stdout="fixture")

                env = {"HOME": "/fixture/home"}
                state = dict(SOCKET="unique-fixture", ENV=env, subprocess=types.SimpleNamespace(run=run))
                execute([node for node in source(name).body if isinstance(node, ast.FunctionDef) and node.name == "tm"], state)
                self.assertEqual(state["tm"]("new-session"), "fixture")
                argv, options = calls[0]
                self.assertEqual(argv[:5], ["tmux", "-L", "unique-fixture", "-f", "/dev/null"])
                self.assertIs(options["env"], env)
                self.assertEqual(options["timeout"], 15)
                self.assertTrue(options["check"])


if __name__ == "__main__":
    unittest.main()
