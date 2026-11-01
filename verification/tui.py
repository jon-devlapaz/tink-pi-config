import json
import os
import pathlib
import shlex
import subprocess
import sys
import time

REPO = pathlib.Path(__file__).resolve().parent.parent
sandbox = json.loads(subprocess.check_output(["node", str(REPO / "verification/sandbox.mjs"), sys.argv[1]], text=True))
ROOT = pathlib.Path(sandbox["root"])
CONFIG = pathlib.Path(sandbox["config"])
WORKSPACE = pathlib.Path(sandbox["cwd"])
ENV = sandbox["env"]
CLI = sys.argv[2]
LOG = ROOT / "tui-probe.jsonl"
SOCKET = "pi-config-verify-" + str(os.getpid())
LABEL = "fixture"
CHECKS = []
ENV["PROBE_LOG"] = str(LOG)
(CONFIG / "extensions/000-probe.ts").symlink_to(REPO / "verification/tui-probe.ts")


def tm(*args):
    return subprocess.run(["tmux", "-L", SOCKET, "-f", "/dev/null", *args], env=ENV, capture_output=True, text=True, check=True, timeout=15).stdout


def events():
    return [json.loads(line) for line in LOG.read_text().splitlines()] if LOG.exists() else []


def wait(name, predicate, timeout=30):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        data = events()
        screen = tm("capture-pane", "-p", "-t", LABEL)
        if any(marker in screen for marker in ["Failed to load extension", "Error in extension", "Extension errors:", "Error:", "TodoOverlay is not a constructor"]):
            raise RuntimeError(screen)
        if predicate(data, screen):
            (ROOT / ("tui-" + name + ".txt")).write_text(screen)
            CHECKS.append({"name": name, "ok": True})
            return
        time.sleep(0.1)
    raise RuntimeError("Timed out " + name + ": " + tm("capture-pane", "-p", "-t", LABEL))


def command(text):
    tm("send-keys", "-t", LABEL, "C-u")
    tm("send-keys", "-t", LABEL, "-l", text)
    tm("send-keys", "-t", LABEL, "Enter")


try:
    args = [CLI, "--no-mcp", "--no-context-files", "--no-approve", "--provider", "footer-test", "--model", "fixture", "--thinking", "off"]
    tm("new-session", "-d", "-s", LABEL, "-x", "120", "-y", "36", "-c", str(WORKSPACE), shlex.join(["env", "-i"] + [key + "=" + value for key, value in ENV.items()] + args))
    version = json.loads((REPO / "verification/packages.json").read_text())["hostVersion"]
    wait("stock-startup", lambda e, s: any(x["event"] == "ready" for x in e) and "workspace" in s and "fixture" in s and "/200k" in s)
    assert "v" + version not in tm("capture-pane", "-p", "-t", LABEL), "quietStartup must suppress stock header"
    title = tm("display-message", "-p", "-t", LABEL, "#{pane_title}").strip()
    assert title == "π - workspace", "non-stock terminal title: " + title
    CHECKS.append({"name": "stock-quiet-startup-title-footer", "ok": True})
    command("Run synthetic fixture PLUMBING-TUI-7214.")
    wait("ghost", lambda e, s: "Inspect the next test." in s and "TURN-COMPLETE" in s and any(x["event"] == "settled" for x in e))
    tm("resize-window", "-t", LABEL, "-x", "60", "-y", "36")
    wait("narrow-ghost", lambda e, s: "Inspect the next test." in s and "fixture" in s and "/200k" in s)
    tm("send-keys", "-t", LABEL, "Escape", "/")
    wait("accepted", lambda e, s: any(x["event"] == "editor-text" and x["text"] == "Inspect the next test." for x in e))
    tm("send-keys", "-t", LABEL, "Enter")
    wait("submitted", lambda e, s: sum(x["event"] == "settled" for x in e) >= 2 and any(x["event"] == "input" and x["text"] == "Inspect the next test." for x in e))
    tm("resize-window", "-t", LABEL, "-x", "120", "-y", "36")
    before = sum(x["event"] == "settled" for x in events())
    command("PLUMBING-CREATE-TODO")
    wait("todo-widget", lambda e, s: sum(x["event"] == "settled" for x in e) > before and "TUI synthetic task" in s and any(x["event"] == "tool-end" and x["tool"] == "todo" and not x["isError"] for x in e))
    before = sum(x["event"] == "ready" for x in events())
    command("/reload")
    wait("todo-reload", lambda e, s: sum(x["event"] == "ready" for x in e) > before and "TUI synthetic task" in s and "Reloaded keybindings" in s)
    tm("resize-window", "-t", LABEL, "-x", "200", "-y", "36")
    wait("wide-stock-footer", lambda e, s: "fixture" in s and "/200k" in s and "workspace" in s)
    assert not any(x["event"] == "ui-override" and x["enabled"] for x in events()), "extension replaced stock title/header/footer"
    forbidden = ("subagent", "workflow", "bg_", "herdr_")
    assert not any(name.startswith(forbidden) for x in events() if x["event"] == "tools" for name in x["names"]), "Desktop-owned tool loaded"
    for event in (x for x in events() if x["event"] == "tools"):
        assert all(name in event["active"] for name in ("grep", "find", "ls")), "stock search tools inactive"
        assert not any(name in event["names"] for name in ("fd", "rg")), "custom search tool loaded"
    CHECKS.append({"name": "stock-search-tools-active-after-reload", "ok": True})
    CHECKS.append({"name": "no-ui-or-orchestration-overrides", "ok": True})
    config_file = CONFIG / "settings.json"
    isolated = json.loads(config_file.read_text())
    isolated["quietStartup"] = False
    config_file.write_text(json.dumps(isolated))
    LABEL = "header"
    tm("new-session", "-d", "-s", LABEL, "-x", "120", "-y", "36", "-c", str(WORKSPACE), shlex.join(["env", "-i"] + [key + "=" + value for key, value in ENV.items()] + args))
    wait("explicit-stock-header", lambda e, s: "v" + version in s and "fixture" in s and "/200k" in s)
    assert not any(x["event"] == "ui-override" and x["enabled"] for x in events()), "extension replaced stock UI on header startup"
except Exception as error:
    CHECKS.append({"name": "tui-run", "ok": False, "error": str(error)})
finally:
    try:
        tm("kill-server")
    except Exception as error:
        CHECKS.append({"name": "tmux-cleanup", "ok": False, "error": str(error)})
    (ROOT / "tui-results.json").write_text(json.dumps(CHECKS, indent=2))
    print(json.dumps(CHECKS), flush=True)
    print("TUI evidence:", ROOT, flush=True)
    if not CHECKS or any(not check["ok"] for check in CHECKS):
        raise SystemExit(1)
