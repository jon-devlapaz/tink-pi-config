# tink-pi-config

Hey! If you use [Pi](https://github.com/badlogic/pi-mono) as your coding agent, this is a ready-to-roll configuration that turns it into a serious daily driver. No endless tweaking required—just clone it, install dependencies, and get back to writing code.

---

## What This Setup Gives You

Here is what makes this setup awesome:

* **Subagents:** Native delegation uses `/subagents`; optional visible Herdr panes use `/herdr-config`. Research providers load only in the researcher and evidence-auditor children.
* **⚡ Background Commands (`bg_start`):** Need to spin up a dev server, run a test watcher, or kick off a long build? The agent runs it in the background, keeps chatting and coding with you, and notifies you when the command finishes. You can inspect logs or kill processes anytime with `/ps`.
* **🔍 Lightning-Fast Search (`fd` & `rg`):** Blazing-fast file finding and code search powered by native `fd` and `ripgrep`. It respects `.gitignore` automatically so your agent doesn't waste time rummaging through `node_modules` or build artifacts.
* **🧠 Clean Memory & Context Tracking:** Smart context tracking keeps token bloat under control. Your agent stays sharp and doesn't forget important decisions or drown in chat history.

---

## What's in the Box

```text
.
├── AGENTS.md                 # Agent instructions (style, safety, git rules)
├── settings.json             # Core Pi configuration and plugin registry
├── models.json.example       # Template for custom/local OpenAI & Gemini models
├── bin/pi-doctor             # Post-update diagnostic command
├── extensions/               # Custom TypeScript extensions
│   ├── background-terminals/ # Long-running process manager & /ps viewer
│   ├── copy-all/             # /copy-all slash command
│   ├── file-search/          # Native fd and ripgrep integration
│   ├── git-info/             # Git status and branch viewer (/lg, /pr)
│   ├── model-info/           # Legacy metrics (disabled)
│   ├── statusline/           # Quiet attention-first footer
│   ├── todo-replay/          # Durable nested todo persistence
│   ├── herdr-commands/       # Herdr/native command separation
│   ├── herdr-naming/         # Collision-safe pane identity
│   ├── ui-customization/     # Quiet header, title, and theme styling
│   └── workflows/            # Multi-agent workflow runner
├── verification/             # Tested package pins and isolated smoke tests
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
   - Check Node.js version (`node -v`). We need Node 22.19 or higher and Pi 1.1.0.
   - Check if Homebrew is available (on macOS).
   - Check if `ripgrep` (`rg`), `fd`, `herdr`, `tmux`, and Python 3 are installed.
   - Ask before installing missing system tools using Homebrew (`brew install ripgrep fd herdr tmux`) or the platform equivalent.

2. Install Configuration:
   - Target folder is `~/.pi/agent`.
   - If `~/.pi/agent` already exists and has uncommitted changes, back it up first (e.g. `~/.pi/agent.backup.<timestamp>`).
   - Clone this configuration repo to `~/.pi/agent` (or copy these files into `~/.pi/agent`).
   - Navigate to `~/.pi/agent` and run:
     ```bash
     npm ci
     npm --prefix extensions/file-search ci
     ```
   - For a fresh installation, seed `~/.pi/agent/npm/package.json` from `verification/managed-npm.json` before installing plugins. This retains tested plugin versions and MCP security overrides. If a managed manifest already exists, merge the overrides and matching pinned dependencies; do not overwrite unrelated entries.
   - Install the managed npm dependencies with `npm --prefix ~/.pi/agent/npm install --omit=peer --ignore-scripts`, then start Pi to resolve the configured pinned Git packages.
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
Make sure you have Node 22.19+, Pi 1.1.0, Python 3, tmux, and the CLI utilities installed:

```bash
# Verify Node version
node -v   # Should be v22.19.0 or higher
pi --version

# macOS (Homebrew)
brew install ripgrep fd herdr tmux
```

### 2. Install to `~/.pi/agent`
Pi reads its user config and extensions from `~/.pi/agent`:

```bash
# Clone the repository
git clone https://github.com/jon-devlapaz/tink-pi-config.git ~/.pi/agent
cd ~/.pi/agent

# Install dependencies
npm ci
npm --prefix extensions/file-search ci

mkdir -p npm
if [ -e npm/package.json ]; then
  printf '%s\n' "Existing managed manifest: merge the template overrides and pins before reinstalling."
else
  cp verification/managed-npm.json npm/package.json
  npm --prefix npm install --omit=peer --ignore-scripts
fi
```

If an existing `npm/package.json` is present, merge the template's `overrides` and matching dependency pins instead of replacing unrelated entries. Start Pi once to resolve the pinned Git packages, then quit before verification. Authentication and browser/microphone permissions are separate, per-machine steps; credentials and runtime histories are not shipped.

### 3. Silence Pi runtime churn (per machine)
Pi rewrites machine-specific keys (`deviceId`, `lastChangelogVersion`) into the live `settings.json` on every run, and the enabled-model list (`enabledModels`) changes constantly as you try models. A clean filter strips these on stage so they can never leak into commits or show up as churn. The binding ships in `.gitattributes`; define the filter once per machine (requires `jq`):

```bash
git config filter.strip-pi-runtime.clean "jq 'del(.deviceId, .lastChangelogVersion, .enabledModels)'"
git config filter.strip-pi-runtime.smudge cat
```

`enabledModels` therefore lives only in your live `settings.json` and is not versioned. Back up live settings separately before a checkout, pull, or branch switch touches the file; those operations can replace the local model list with the committed copy. A fresh clone starts without it, so choose your models with `pi /model`.

After you change models, `git status` may still list `settings.json` as modified: git's quick size check runs before the filter. Nothing is actually different (`git diff` is empty); `git add settings.json` clears it and stages nothing unless another key really changed.

### 4. Verify and install the doctor command
From the configuration repository:

```bash
npm run verify:updates

mkdir -p ~/.local/bin
ln -s "$PWD/bin/pi-doctor" ~/.local/bin/pi-doctor
```

Put `~/.local/bin` on PATH. You can then run `pi-doctor` from any directory; `pi-doctor --help` describes its coverage. It resolves the global `pi` executable on PATH before npm changes PATH, excluding `node_modules/.bin` SDK binaries, and prints its absolute path. It checks source parity, tested Pi/plugin pins, types, regression tests, isolated runtime/TUI behavior, and dependency security. Model fixtures are local and unpaid; npm audits contact the registry. Python 3 and tmux are required for the TUI smoke test. A failing check returns a nonzero exit status; the doctor does not upgrade or repair installed packages.

Pi may rewrite `settings.json` formatting; the doctor validates its parsed contents without treating whitespace churn as a code failure. For intentional upgrades, update the tested pins in `settings.json`, `verification/packages.json`, and the managed manifest/template together, keep the development SDK aligned with the Pi CLI, then rerun the doctor. Do not blindly run `npm audit fix`.

The standard live location is `~/.pi/agent`. If you keep this repository elsewhere, link or synchronize the owned extensions and safe defaults into that live directory, preserving existing machine settings; the doctor rejects drift. `PI_VERIFY_AGENT_DIR` selects an alternate live config; `PI_VERIFY_CLI` selects an explicit executable (prefer an absolute path). A version mismatch fails verification instead of testing the local SDK CLI. Research paths currently assume the standard live directory.

### 5. Log in & Run
The saved default uses `openai-codex` OAuth. Log into that provider (or select and authenticate another supported provider):

```bash
pi /login
```

*(Optional)* If you want to use local models or custom endpoints, copy the template and edit your keys:

```bash
cp models.json.example models.json
```

Then fire up Pi:

```bash
pi
```
