# claude-code-plugin-toggler

A developer tool for managing Claude Code skill plugins. Toggle plugins on/off per-project from a browser UI or directly inside VSCode.

## How it works

Reads installed plugins from `~/.claude/plugins/installed_plugins.json` (global, managed externally) and writes enabled/disabled state to `.claude/settings.local.json` in your current project root. Claude Code picks up the updated settings on the next session.

```
~/.claude/plugins/installed_plugins.json   (global — source of installed plugins)
        │
        ├──▶ html/server.py  ←HTTP→  html/index.html
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

> If `~/.claude/plugins/installed_plugins.json` doesn't exist, the server returns mock data flagged with `"mock": true`.

### VSCode extension

1. Open `vscode-extension/` in VSCode.
2. Press `F5` to launch the Extension Development Host.
3. Run **Skills: Manage Plugins** from the command palette.

To install locally:

```bash
cd vscode-extension
vsce package   # produces claude-code-plugin-toggler-*.vsix
```

Then install the `.vsix` via **Extensions: Install from VSIX...**.

## Data format

**`~/.claude/plugins/installed_plugins.json`**
```json
{ "plugins": ["frontend-design@anthropic", "docx@anthropic"] }
```

**`.claude/settings.local.json`** (written by this tool)
```json
{ "enabledPlugins": { "frontend-design@anthropic": true, "docx@anthropic": false } }
```

Plugin ID format: `name@marketplace`.

## Requirements

- **HTML version:** Python 3.13+ (stdlib only, no pip installs)
- **VSCode extension:** VSCode 1.80+, Node.js (bundled with VSCode — no separate install needed)
