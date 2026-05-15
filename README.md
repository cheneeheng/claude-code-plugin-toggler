# claude-code-plugin-toggler

A developer tool for managing Claude Code skill plugins. Toggle plugins on/off per-project from a browser UI or directly inside VSCode. Browse and install new plugins from known marketplaces without leaving the UI.

## How it works

Reads installed plugins from `~/.claude/plugins/installed_plugins.json` (global, managed externally) and writes enabled/disabled state to `.claude/settings.local.json` in your current project root. Claude Code picks up the updated settings on the next session.

```
~/.claude/plugins/installed_plugins.json   (global — source of installed plugins)
~/.claude/plugins/known_marketplaces.json  (global — marketplace registry)
        │
        ├──▶ html/server.py  ←HTTP/SSE→  html/index.html
        └──▶ vscode-extension/extension.js  ←Webview→  vscode-extension/webview/panel.html
                    │
                    ▼
        <project>/.claude/settings.local.json   (per-project — enabled state)
```

## Usage

### HTML version

Run from the root of the project you want to manage:

```bash
cd /your/project
python3 /path/to/claude-code-plugin-toggler/html/server.py        # port 7779
python3 /path/to/claude-code-plugin-toggler/html/server.py 8080   # custom port
```

Open `http://127.0.0.1:7779` in a browser.

To stop the server, click **Stop server** in the top-right of the UI or kill the process with `Ctrl+C`.

The browser UI auto-refreshes when `settings.local.json` or `installed_plugins.json` changes on disk (live dot indicator in header shows connection state).

> If `~/.claude/plugins/installed_plugins.json` doesn't exist, the server returns mock data flagged with `"mock": true`.

### VSCode extension

1. Open `vscode-extension/` in VSCode.
2. Press `F5` to launch the Extension Development Host.
3. Click the **Skills Toggle** icon in the activity bar to open the sidebar panel.

The panel auto-refreshes when either watched file changes on disk (no manual reload needed).

To install locally:

```bash
cd vscode-extension
vsce package   # produces claude-code-plugin-toggler-*.vsix
```

`vsce package` runs `make sync-css` (or `scripts/sync-css.ps1` on Windows) before packaging to ensure the webview CSS is up to date.

Then install the `.vsix` via **Extensions: Install from VSIX...**.

## Data format

**`~/.claude/plugins/installed_plugins.json`**
```json
{ "plugins": { "frontend-design@anthropic": {}, "docx@anthropic": {} } }
```

**`~/.claude/plugins/known_marketplaces.json`**
```json
{
  "ceh-plugins": {
    "installLocation": "C:\\Users\\Chen\\.claude\\plugins\\marketplaces\\ceh-plugins",
    "lastUpdated": "2026-05-14T14:18:52.841Z"
  }
}
```

**`.claude/settings.local.json`** (written by this tool)
```json
{ "enabledPlugins": { "frontend-design@anthropic": true, "docx@anthropic": false } }
```

Plugin ID format: `name@marketplace`.

**Plugin skills** are read from disk at load time:

```
~/.claude/plugins/marketplaces/<marketplace>/<name>/skills/<skill-dir>/SKILL.md
```

Each `SKILL.md` uses YAML front matter with `name` and `description` keys. The UI renders a collapsible skill count per plugin row (with smooth expand/collapse animation). If the skills directory is absent the disclosure is omitted.

**Marketplace plugins** are read from:

```
<installLocation>/.claude-plugin/marketplace.json
```

## UI behaviour

### Plugin list

Plugins are split into two sections:

- **Local** — plugins with a per-project override in `.claude/settings.local.json`. These have an enable/disable toggle.
- **Inherited** — plugins with no local override, shown as always-enabled. Click **Localize** to pin the current state into the local settings file before toggling.

Bulk **Enable all** / **Disable all** actions apply only to locally-pinned plugins.

### Install panel

Click **+ Install plugin** (right side of the bulk-actions row) to open the install panel. The panel shows:

- A **marketplace selector** — one option per entry in `known_marketplaces.json`.
- A **plugin list** for the selected marketplace: name, version badge, install-status indicator (`✓ local` / `✓ global`), description, and keyword tags.
- **Install ↓** button for uninstalled plugins. Runs `claude plugin install <id> --scope local`. VSCode shows a confirmation dialog before proceeding.
- Inline error message if install fails.

After a successful install the plugin list and marketplace panel both refresh automatically.

> `claude` CLI must be on `PATH` for install to work. The error surfaces at install time, not startup.

### Live updates

The HTML version connects an SSE stream (`GET /api/events`) on page load. A green dot in the header confirms the connection is live; it turns amber while reconnecting (3-second back-off). Any change to `settings.local.json` or `installed_plugins.json` triggers an automatic refresh without reloading the page.

The VSCode extension uses `vscode.workspace.createFileSystemWatcher` to watch both files; the panel refreshes silently on any change.

## CSS sync

`html/styles.css` is the canonical source. `vscode-extension/webview/styles.css` is generated — do not edit it directly.

To sync after editing `html/styles.css`:

```bash
make sync-css           # macOS / Linux
# or on Windows:
.\scripts\sync-css.ps1
```

`vsce package` runs this automatically via the `prepackage` npm script.

## Requirements

- **HTML version:** Python 3.13+ (stdlib only, no pip installs)
- **VSCode extension:** VSCode 1.80+, Node.js (bundled with VSCode — no separate install needed)
- **Install feature:** `claude` CLI on `PATH`
- **CSS sync:** `make` (macOS/Linux) or PowerShell (Windows — no `make` needed)
