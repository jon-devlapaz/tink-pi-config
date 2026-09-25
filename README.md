# tink-pi-config

Hey! If you use [Pi](https://github.com/badlogic/pi-mono) as your coding agent, this is a ready-to-roll configuration that turns it into a serious daily driver. No endless tweaking required—just clone it, install dependencies, and get back to writing code.

---

## What This Setup Gives You

Here is what makes this setup awesome:

* **👀 Visual Subagents in Terminal Splits (Herdr):** Instead of subagents running invisibly in the dark, they open in real, side-by-side terminal panes via Herdr. You can watch them write code, run commands, and test things live—and step in whenever you want.
* **⚡ Background Commands (`bg_start`):** Need to spin up a dev server, run a test watcher, or kick off a long build? The agent runs it in the background, keeps chatting and coding with you, and notifies you when the command finishes. You can inspect logs or kill processes anytime with `/ps`.
* **🔍 Lightning-Fast Search (`fd` & `rg`):** Blazing-fast file finding and code search powered by native `fd` and `ripgrep`. It respects `.gitignore` automatically so your agent doesn't waste time rummaging through `node_modules` or build artifacts.
* **🧠 Clean Memory & Context Tracking:** Smart context tracking keeps token bloat under control. Your agent stays sharp and doesn't forget important decisions or drown in chat history.
* **📝 Plain-English Summaries:** At the end of every run, you get a clean recap card telling you exactly what changed, what was tested, and what needs your attention next—straight facts, zero corporate filler.

---

## What's in the Box

```text
.
├── AGENTS.md                 # Agent instructions (style, safety, git rules)
├── settings.json             # Core Pi configuration and plugin registry
├── models.json.example       # Template for custom/local OpenAI & Gemini models
├── extension-settings/       # Plugin configs (e.g. model filters)
├── extensions/               # Custom TypeScript extensions
│   ├── ask-user/             # Multiple-choice question UI
│   ├── background-terminals/ # Long-running process manager & /ps viewer
│   ├── copy-all/             # /copy-all slash command
│   ├── file-search/          # Native fd and ripgrep integration
│   ├── git-info/             # Git status and branch viewer (/lg, /pr)
│   ├── model-info/           # Token metrics and context usage bar
│   ├── summaries/            # Plain-English run recap cards
│   ├── ui-customization/     # Custom status bar and styling
│   └── workflows/            # Multi-agent workflow runner
├── prompts/                  # Reusable prompts (/commit-msg, /jevify)
├── skills/                   # On-demand agent skills (subagents, terminals)
└── themes/                   # Clean terminal themes (github-dark, nord)
```

---

## 🤖 Agent Setup Prompt (Copy & Paste)

The easiest way to get this running is to let your AI coding agent do the legwork. Copy the prompt below, paste it into your coding agent, and let it handle the setup:

```markdown
Please inspect my system and set up this Pi coding agent configuration:

1. System Check:
   - Check Node.js version (`node -v`). We need Node 22 or higher.
   - Check if Homebrew is available (on macOS).
   - Check if the following CLI tools are installed: `ripgrep` (`rg`), `fd`, and `herdr`.
   - If any are missing, install them using Homebrew (`brew install ripgrep fd herdr`) or the platform equivalent.

2. Install Configuration:
   - Target folder is `~/.pi/agent`.
   - If `~/.pi/agent` already exists and has uncommitted changes, back it up first (e.g. `~/.pi/agent.backup.<timestamp>`).
   - Clone this configuration repo to `~/.pi/agent` (or copy these files into `~/.pi/agent`).
   - Navigate to `~/.pi/agent` and run:
     ```bash
     npm install
     npm --prefix extensions/file-search install
     ```

3. Verification:
   - Run type checks and tests:
     ```bash
     npm run check
     npm test
     ```
   - Report back confirming all tools are installed and all tests pass.
```

---

## Manual Setup (Do It Yourself)

Prefer running the commands yourself? Here is the quick walk-through:

### 1. Prerequisites
Make sure you have Node 22+ and the CLI utilities installed:

```bash
# Verify Node version
node -v   # Should be v22.0.0 or higher

# macOS (Homebrew)
brew install ripgrep fd herdr
```

### 2. Install to `~/.pi/agent`
Pi reads its user config and extensions from `~/.pi/agent`:

```bash
# Clone the repository
git clone https://github.com/jon-devlapaz/tink-pi-config.git ~/.pi/agent
cd ~/.pi/agent

# Install dependencies
npm install
npm --prefix extensions/file-search install
```

### 3. Verify
Run the test suite to make sure all extensions build and pass:

```bash
npm run check
npm test
```

### 4. Log in & Run
Log into your model provider of choice:

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
