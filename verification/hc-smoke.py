import json
import os
import pathlib
import shutil
import select
import subprocess
import sys
import tempfile
import time

ROOT = pathlib.Path(tempfile.mkdtemp(prefix="hc-", dir="/tmp"))
HC = shutil.which("hc")
assert HC, "hc is required for the isolated core protocol smoke"
ENV = {key: os.environ[key] for key in ["PATH", "LANG", "TMPDIR", "SYSTEMROOT"] if key in os.environ}
ENV.update({
    "HOME": str(ROOT / "home"),
    "XDG_CONFIG_HOME": str(ROOT / "config"),
    "XDG_DATA_HOME": str(ROOT / "data"),
    "XDG_STATE_HOME": str(ROOT / "state"),
    "XDG_CACHE_HOME": str(ROOT / "cache"),
    "XDG_RUNTIME_DIR": str(ROOT / "runtime"),
    "HC_SESSION": "pi-verify-" + str(os.getpid()),
    "TERM": "xterm-256color",
})
for key in ["HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME", "XDG_RUNTIME_DIR"]:
    pathlib.Path(ENV[key]).mkdir(parents=True, exist_ok=True)
assert not any(key.startswith("HC_TERMINAL") or key.startswith("HC_PARENT") for key in ENV)
EVIDENCE = []
CLEANUP_ERRORS = []


def cleanup(label, operation):
    try:
        operation()
        EVIDENCE.append({"cleanup": label, "ok": True})
    except Exception as error:
        CLEANUP_ERRORS.append(label + ": " + str(error))
        EVIDENCE.append({"cleanup": label, "ok": False, "error": str(error)})


def stop_process(label, process):
    if process.poll() is None:
        cleanup(label + " terminate", process.terminate)
        cleanup(label + " wait", lambda: process.wait(timeout=5))
    if process.poll() is None:
        cleanup(label + " kill", process.kill)
        cleanup(label + " reap", lambda: process.wait(timeout=5))


def hc(*args):
    result = subprocess.run([HC, *args], env=ENV, capture_output=True, text=True, timeout=15)
    EVIDENCE.append({"args": args, "code": result.returncode, "stdout": result.stdout, "stderr": result.stderr})
    assert result.returncode == 0, result.stdout + result.stderr
    return json.loads(result.stdout)


control = ROOT / "control"
os.mkfifo(control)
fixture = ROOT / "program.py"
fixture.write_text('''import sys, time
print("FIXTURE-READY", flush=True)
while True:
    with open(sys.argv[1]) as control:
        state = control.read().strip()
    time.sleep(0.2)
    sys.stdout.write("\\x1b]7501;state=" + state + ":app=pi\\x1b\\\\")
    print("STATUS-" + state, flush=True)
''')
terminal = None
watch = None
try:
    hc("server", "start")
    started = hc("run", "--bg", "--no-parent", "--no-notify", "--cwd", str(ROOT), "--name", "protocol-fixture", sys.executable, str(fixture), str(control))
    terminal = "protocol-fixture"
    watch = subprocess.Popen([HC, "events", "--terminal", terminal], env=ENV, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    buffer = b""
    for state in ["idle", "working", "blocked", "done", "error", "idle"]:
        subprocess.run([sys.executable, "-c", "import pathlib,sys; pathlib.Path(sys.argv[1]).write_text(sys.argv[2])", str(control), state], env=ENV, check=True, timeout=5)
        deadline = time.monotonic() + 5
        matched = False
        while not matched:
            remaining = deadline - time.monotonic()
            assert remaining > 0 and select.select([watch.stdout], [], [], remaining)[0], "missing OSC7501 event: " + state
            chunk = os.read(watch.stdout.fileno(), 65536)
            assert chunk, "hc event stream ended"
            buffer += chunk
            while b"\n" in buffer:
                line, buffer = buffer.split(b"\n", 1)
                event = json.loads(line)
                EVIDENCE.append({"event": event})
                params = event.get("params", {})
                if params.get("type") == "status" and params.get("terminal") == started["address"] and params.get("data", {}).get("status") == {"app": "pi", "state": state}:
                    matched = True
        observed = hc("get", terminal)
        assert observed["status"] == {"app": "pi", "state": state}, observed
        assert observed["state"] == "live", observed
        print("PASS observed OSC7501", state, flush=True)
    before = hc("get", terminal)
    for attempt in range(2):
        master, slave = os.openpty()
        attached = subprocess.Popen([HC, "attach", "--observe", terminal], env=ENV, stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
        os.close(slave)
        try:
            assert select.select([master], [], [], 5)[0], "attach produced no output"
            frame = os.read(master, 65536)
            assert frame, "empty attach frame"
            os.write(master, b"\x1c")
            attached.wait(timeout=5)
            assert attached.returncode == 0, "attach/detach failed"
        finally:
            try:
                cleanup("attachment", lambda: stop_process("attachment", attached))
            finally:
                cleanup("attachment PTY", lambda: os.close(master))
        after = hc("get", terminal)
        assert after["pid"] == before["pid"] and after["state"] == "live" and after["status"] == before["status"], after
        print("PASS detach/reattach persistence", attempt + 1, flush=True)
finally:
    try:
        if watch:
            cleanup("event watcher", lambda: stop_process("event watcher", watch))
        for args in ([("kill", terminal), ("rm", terminal)] if terminal else []) + [("server", "stop")]:
            cleanup("hc " + " ".join(args), lambda args=args: subprocess.run([HC, *args], env=ENV, capture_output=True, text=True, timeout=10, check=True))
    finally:
        (ROOT / "evidence.json").write_text(json.dumps(EVIDENCE, indent=2))
        print("Isolated core evidence:", ROOT, flush=True)
    assert not CLEANUP_ERRORS, "scratch cleanup failed: " + "; ".join(CLEANUP_ERRORS)
