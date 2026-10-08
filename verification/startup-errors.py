import json
import os
import pathlib
import shlex
import subprocess
import sys
import time

REPO = pathlib.Path(__file__).resolve().parent.parent
SOCKET = "pi-startup-errors-" + str(os.getpid())
CHECKS = []
ROOTS = []


def tm(*args):
    return subprocess.run(["tmux", "-L", SOCKET, *args], capture_output=True, text=True, check=True).stdout


def capture(label):
    return tm("capture-pane", "-p", "-t", label)


def wait_ready(log, label):
    end = time.monotonic() + 30
    while time.monotonic() < end:
        if log.exists() and '"event":"ready"' in log.read_text():
            time.sleep(1.5)
            return
        time.sleep(0.1)
    raise RuntimeError("Startup timed out: " + capture(label))


try:
    tm("new-session", "-d", "-s", "harness", "-x", "120", "-y", "36", "sleep 180")
    tm("set-option", "-g", "remain-on-exit", "on")
    for kind in ["load", "hook", "notify"]:
        sandbox = json.loads(subprocess.check_output(["node", str(REPO / "verification/sandbox.mjs"), sys.argv[1]], text=True))
        root = pathlib.Path(sandbox["root"])
        config = pathlib.Path(sandbox["config"])
        ROOTS.append(str(root))
        log = root / "probe.jsonl"
        env = sandbox["env"]
        env["PROBE_LOG"] = str(log)
        (config / "extensions/000-probe.ts").symlink_to(REPO / "verification/tui-probe.ts")
        marker = "STARTUP-" + kind.upper() + "-FAILURE-7214"
        if kind == "load":
            fixture = 'export default function () { throw new Error("' + marker + '"); }'
        elif kind == "hook":
            fixture = 'export default function (pi) { pi.on("session_start", () => { const e = new Error("' + marker + '"); e.stack = e.message; throw e; }); }'
        else:
            fixture = 'export default function (pi) { pi.on("session_start", (_event, ctx) => { ctx.ui.notify("' + marker + '", "error"); }); }'
        (config / "extensions/999-startup-fault.js").write_text(fixture)
        args = [sys.argv[2], "--no-mcp", "--no-context-files", "--no-approve", "--provider", "footer-test", "--model", "fixture", "--thinking", "off"]
        tm("new-session", "-d", "-s", kind, "-x", "120", "-y", "36", "-c", sandbox["cwd"], shlex.join(["env", "-i"] + [key + "=" + value for key, value in env.items()] + args))
        if kind == "load":
            end = time.monotonic() + 30
            while time.monotonic() < end and tm("display-message", "-p", "-t", kind, "#{pane_dead}:#{pane_dead_status}").strip() != "1:1":
                time.sleep(0.1)
            assert tm("display-message", "-p", "-t", kind, "#{pane_dead}:#{pane_dead_status}").strip() == "1:1", "Load failure must exit nonzero"
            time.sleep(1.5)
        else:
            wait_ready(log, kind)
        for phase in (["settled-startup", "narrow"] if kind == "load" else ["settled-startup", "narrow", "reload"]):
            if phase == "narrow":
                tm("resize-window", "-t", kind, "-x", "60", "-y", "36")
                time.sleep(0.3)
            elif phase == "reload":
                tm("resize-window", "-t", kind, "-x", "120", "-y", "36")
                before = log.read_text().count('"event":"ready"')
                tm("send-keys", "-t", kind, "-l", "/reload")
                tm("send-keys", "-t", kind, "Enter")
                end = time.monotonic() + 30
                while time.monotonic() < end and log.read_text().count('"event":"ready"') <= before:
                    time.sleep(0.1)
                assert log.read_text().count('"event":"ready"') > before, "Reload timed out"
                time.sleep(1.5)
            screen = capture(kind)
            (root / (phase + ".txt")).write_text(screen)
            assert marker in screen.replace("\n", ""), kind + " error disappeared after " + phase + ": " + screen
            CHECKS.append({"name": kind + "-" + phase, "ok": True})
        tm("kill-session", "-t", kind)
except Exception as error:
    CHECKS.append({"name": "startup-errors", "ok": False, "error": str(error)})
finally:
    try:
        tm("kill-server")
    except Exception:
        pass
    for root in ROOTS:
        (pathlib.Path(root) / "startup-errors-results.json").write_text(json.dumps(CHECKS, indent=2))
    print(json.dumps(CHECKS), flush=True)
    print("Startup error evidence:", ROOTS, flush=True)
    if not CHECKS or any(not check["ok"] for check in CHECKS):
        raise SystemExit(1)
