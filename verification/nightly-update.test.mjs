import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { resolveCli } from "./resolve-cli.mjs";

function checkJob(job, cli, agentDir) {
  assert.equal(job.Label, "dev.pi.extensions.nightly");
  const [executable, ...args] = job.ProgramArguments;
  assert(
    fs.existsSync(executable),
    "nightly Pi executable is missing: " + executable,
  );
  assert.equal(
    fs.realpathSync(executable),
    fs.realpathSync(cli),
    "nightly updater must use the installed Pi executable",
  );
  assert.deepEqual(args, ["update", "--extensions", "--no-approve"]);
  assert.equal(job.WorkingDirectory, agentDir);
  assert.equal(job.EnvironmentVariables.PI_CODING_AGENT_DIR, agentDir);
  assert.deepEqual(job.StartCalendarInterval, { Hour: 3, Minute: 0 });
}

const fixture = () => ({
  Label: "dev.pi.extensions.nightly",
  ProgramArguments: [
    process.execPath,
    "update",
    "--extensions",
    "--no-approve",
  ],
  WorkingDirectory: "/synthetic/agent",
  EnvironmentVariables: { PI_CODING_AGENT_DIR: "/synthetic/agent" },
  StartCalendarInterval: { Hour: 3, Minute: 0 },
});

test("nightly updater keeps the installed executable and extension-only schedule", () => {
  assert.doesNotThrow(() =>
    checkJob(fixture(), process.execPath, "/synthetic/agent"),
  );
});

test("nightly updater rejects a missing executable and changes to its approved command", () => {
  const missing = fixture();
  missing.ProgramArguments[0] = path.join(process.execPath, "missing-pi");
  assert.throws(
    () => checkJob(missing, process.execPath, "/synthetic/agent"),
    /executable is missing/,
  );
  const changed = fixture();
  changed.ProgramArguments[1] = "--version";
  assert.throws(() => checkJob(changed, process.execPath, "/synthetic/agent"));
});

const jobPath = path.join(
  process.env.HOME,
  "Library/LaunchAgents/dev.pi.extensions.nightly.plist",
);
test(
  "an existing macOS nightly updater matches the installed Pi",
  {
    skip: process.platform !== "darwin" || !fs.existsSync(jobPath),
  },
  () => {
    const job = JSON.parse(
      execFileSync("plutil", ["-convert", "json", "-o", "-", jobPath], {
        encoding: "utf8",
      }),
    );
    checkJob(
      job,
      resolveCli(),
      path.resolve(process.env.PI_VERIFY_AGENT_DIR ?? getAgentDir()),
    );
  },
);
