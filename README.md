# tink-pi-config

Hey! If you use [Pi](https://github.com/earendil-works/pi) as your coding agent, this is a ready-to-roll configuration that turns it into a serious daily driver. No endless tweaking required—just clone it, install dependencies, and get back to writing code.

---

## What This Setup Gives You

Here is what makes this setup awesome:

* **Herdr Core-native agents:** Herdr Core runs persistent agents and programs through `hc`; Herdr Desktop shows them, with `herdr-app` controlling their window placement. Pi supplies coding tools and native OSC 7501 status/title reporting, without internal subagent, workflow, side-agent, or inspector layers.
* **Web access:** Web tools load globally. [web-search.json](web-search.json) restricts search to Exa/DuckDuckGo and fetching to direct HTTP; generated summaries, browser-cookie access, browser auto-open, GitHub cloning, and video/image features are off.
* **Persistent programs:** Start servers, watchers, and long builds with `hc run --bg`, collect output with `hc read`, and wait with `hc wait`. Desktop visibility is explicit; Pi does not maintain a second terminal dashboard or automatically rotate/delete shared session history.
* **Stock search:** Pi’s built-in `find`, `grep`, and `ls` tools are enabled. File and content searches respect `.gitignore`; system `fd` and `ripgrep` remain available through `bash` for advanced flags. No custom search extension is required.
* **Native session history:** Pi’s own compaction and saved-session handling manage context, without a custom history-rewriting or recall extension.

---

## What's in the Box

```text
.
├── AGENTS.md                 # Agent instructions (style, safety, git rules)
├── APPEND_SYSTEM.md          # Yohaku spirit, preserving Pi's default guidance
├── settings.json             # Core Pi configuration and plugin registry
├── web-search.json           # Credential-free web safety defaults
├── models.json.example       # Template for custom/local OpenAI & Gemini models
├── bin/pi-doctor             # Post-update diagnostic command
├── verification/             # Package sources and isolated smoke tests
├── prompts/                  # Reusable prompts (/commit-msg, /jevify)
├── skills/                   # On-demand agent skills (subagents, terminals)
└── themes/                   # Clean terminal themes (github-dark, nord)
```

---

## 🤖 Agent Setup Prompt (Copy & Paste)

The easiest way to get this running is to let your AI coding agent do the legwork. Copy the prompt below, paste it into your coding agent, and let it handle the setup:

````markdown
Please inspect my system and set up this Pi coding agent configuration:

1. System Check:
   - Check Node.js version (`node -v`). We need Node 22.19 or higher and Pi 1.5.0.
   - Check if Homebrew is available (on macOS).
   - Check if `ripgrep` (`rg`), `fd`, `tmux`, Python 3, `hc`, and `herdr-app` are installed. Herdr Desktop supplies the agent/program runtime; the verifier requires `hc`.
   - Ask before installing missing system tools using Homebrew (`brew install ripgrep fd tmux`) or the platform equivalent. Install Herdr Desktop separately; the legacy `herdr` CLI is not a substitute.

2. Install Configuration:
   - Keep this repository checkout separate from the live `~/.pi/agent` directory. Back up existing live settings before changing them; preserve credentials, model configuration, and sessions.
   - Copy or merge approved settings and safe defaults into the live directory. Keep live `settings.json` a regular file, not a symlink into the checkout. Include `web-search.json`, `APPEND_SYSTEM.md`, and the explicit-permission policy in `AGENTS.md`. Leave `SYSTEM.md` absent so Pi retains its default guidance.
   - Run `npm ci` in the source checkout for verification dependencies only.
   - Install configured upstream packages with `PI_CODING_AGENT_DIR="$HOME/.pi/agent" pi update --extensions --no-approve`. Package sources are unpinned; copy-all and git-info come from their standalone GitHub repositories, not local extension copies. Do not introduce local dependency overrides.
   - After review, copy all skills, prompts, and themes into the live directory; the doctor fails if live has extra, missing, or different files.
   - Link `bin/pi-doctor` into a directory on PATH (for example `~/.local/bin`). Do not overwrite an existing command.

3. Verification:
   - Run type checks and tests:
     ```bash
     npm run verify:updates
     ```
   - Report all failures and distinguish tested behavior from unavailable credentials or untested device interactions.
````

---

## Manual Setup (Do It Yourself)

Prefer running the commands yourself? Here is the quick walk-through:

### 1. Prerequisites
Make sure you have Node 22.19+, Pi 1.5.0, Python 3, tmux, and the CLI utilities installed. Herdr Desktop must supply `hc` and `herdr-app`; `hc` is required by the isolated core verification:

```bash
# Verify Node version
node -v   # Should be v22.19.0 or higher
pi --version

# macOS (Homebrew)
brew install ripgrep fd tmux
```

This repository does not patch Herdr Desktop itself. The tested macOS Desktop 0.1.11 needed a separate window-reopen fix; verify close/reopen behavior on your installed Desktop build.

### 2. Separate source and runtime

Keep the checkout outside `~/.pi/agent`, where Pi stores its live settings and installed upstream packages. Existing users should back up and detach any live settings symlink before updating; preserve auth, models, and session history.

```bash
mkdir -p ~/dev/tools
git clone https://github.com/jon-devlapaz/tink-pi-config.git ~/dev/tools/tink-pi-config
cd ~/dev/tools/tink-pi-config
npm ci

# Per-machine clean filter bound in .gitattributes (requires jq)
git config filter.strip-pi-runtime.clean "jq 'del(.deviceId, .lastChangelogVersion)'"
git config filter.strip-pi-runtime.smudge cat

mkdir -p "$HOME/.pi/agent"
for file in settings.json web-search.json next-prompt.json AGENTS.md APPEND_SYSTEM.md; do
  if [ ! -e "$HOME/.pi/agent/$file" ]; then
    cp "$file" "$HOME/.pi/agent/$file"
  fi
done

if [ ! -L "$HOME/.pi/agent/settings.json" ]; then
  PI_CODING_AGENT_DIR="$HOME/.pi/agent" pi update --extensions --no-approve
else
  printf '%s\n' "Back up and detach the live settings symlink before updating."
fi
```

The clean filter keeps Pi's machine-specific `deviceId` and `lastChangelogVersion` out of commits; `enabledModels` is versioned. Git does not copy filter definitions on clone, so `pi-doctor` fails until they are set.

Review and merge existing configuration instead of overwriting it. Installations live under `~/.pi/agent/npm` and `~/.pi/agent/git`, outside the source checkout. Copy-all and git-info are upstream Git packages; do not also load local copies. Authentication and browser/microphone permissions are separate, per-machine steps. Credentials and runtime histories are not shipped.

### 3. Runtime updates and permission policy

Live preferences and package updates stay in `~/.pi/agent`; they must not rewrite this checkout. Changes to the config repository, installed extension code, or new extensions/shims require explicit user permission. The instructions are a consent policy, not an OS security boundary.

Run the native updater manually with:

```bash
PI_CODING_AGENT_DIR="$HOME/.pi/agent" pi update --extensions --no-approve
```

On the configured Mac, the machine-local LaunchAgent `~/Library/LaunchAgents/dev.pi.extensions.nightly.plist` runs that command at 03:00 local time while logged in. Launchd coalesces missed sleep-time runs on wake. It updates extensions only, without reloading running agents; use `/reload` or start a new session to load updates. Logs are under `~/Library/Logs/Pi/`. Inspect the job with:

```bash
launchctl print "gui/$(id -u)/dev.pi.extensions.nightly"
```

The scheduler is separate from this repository and uses the stock Pi CLI, not a custom update extension or launcher wrapper. Automatic updates trust upstream maintainers and can introduce compatibility changes.

### 4. Verify and install the doctor command
From the configuration repository:

```bash
npm run verify:updates

mkdir -p ~/.local/bin
ln -s "$PWD/bin/pi-doctor" ~/.local/bin/pi-doctor
```

Put `~/.local/bin` on PATH. You can then run `pi-doctor` from any directory; `pi-doctor --help` describes its coverage. It resolves the global `pi` executable on PATH before npm changes PATH, excluding `node_modules/.bin` SDK binaries, and prints its absolute path. It checks infrastructure settings, the tested Pi host version, configured upstream package identities, types, regression tests, isolated runtime/TUI behavior, and dependency security. Model fixtures are local and unpaid; npm audits contact the registry. Python 3 and tmux are required for the TUI smoke test; `hc` is required for isolated status/persistence verification. A failing check returns a nonzero exit status; the doctor does not upgrade or repair installed packages.

The doctor checks the approved package list, resource exclusions, stock tools, and trust policy, and fails when the live configuration drifts from this repository: `AGENTS.md`, `APPEND_SYSTEM.md`, `next-prompt.json`, prompts, skills, and themes must match exactly, and `settings.json` may differ only in Pi's runtime keys (`deviceId`, `lastChangelogVersion`, `extensionChangelogVersions`). Commit model or preference changes here and copy them to the live directory. Extension sources are unpinned: upstream version changes do not require editing verification version pins. Installed npm manifests and lockfiles still record resolved versions; these do not pin Pi's configured sources. Keep the development SDK aligned with the Pi CLI independently of extension updates. Do not blindly run `npm audit fix`.

The standard live location is `~/.pi/agent`, separate from this source checkout. Copy or merge approved settings and safe defaults, including `web-search.json`; do not link live settings or extension code back into the repo. Keep provider credentials in per-machine environment variables, not in the tracked web defaults. `PI_VERIFY_AGENT_DIR` selects an alternate live config; `PI_VERIFY_CLI` selects an explicit executable (prefer an absolute path). A version mismatch fails verification instead of testing the local SDK CLI. Research paths currently assume the standard live directory.

### 5. Log in & Run
The saved default uses `openai-codex` OAuth. Log into that provider (or select and authenticate another supported provider):

```bash
pi /login
```

*(Optional)* If you want to use local models or custom endpoints, copy the template and configure your endpoint and key environment variables. Keep `models.json` private rather than linking it back to the public template:

```bash
cp -n models.json.example "$HOME/.pi/agent/models.json"
```

Then fire up Pi:

```bash
pi
```
