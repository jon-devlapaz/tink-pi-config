import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function resolveCli(env = process.env, cwd = process.cwd()) {
  const explicit = env.PI_VERIFY_CLI !== undefined;
  const requested = explicit ? env.PI_VERIFY_CLI : "pi";
  if (!requested?.trim()) throw new Error("PI_VERIFY_CLI must not be empty");
  const directories = (env.PATH ?? "").split(path.delimiter);
  const candidates = /[/\\]/.test(requested)
    ? [path.resolve(cwd, requested)]
    : directories
        .filter(
          (directory) =>
            explicit ||
            !/[/\\]node_modules[/\\]\.bin[/\\]?$/.test(
              path.resolve(cwd, directory),
            ),
        )
        .map((directory) => path.resolve(cwd, directory, requested));
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch (error) {
      if (!["ENOENT", "ENOTDIR", "EACCES"].includes(error.code)) throw error;
    }
  }
  throw new Error(
    explicit
      ? `PI_VERIFY_CLI executable not found: ${requested}`
      : "Global Pi executable not found outside node_modules/.bin; set PI_VERIFY_CLI to the executable you launch",
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(resolveCli());
}
