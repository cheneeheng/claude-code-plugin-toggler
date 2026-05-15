# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running

See README.md for full usage. Quick reference:

**HTML version** — must be run from the target project root (`project_root = os.getcwd()` at startup):
```bash
cd /your/project
python3 /path/to/html/server.py        # port 7779
python3 /path/to/html/server.py 8080   # custom port
```
Convenience scripts: `html/start.sh` (Linux/macOS), `html/start.ps1` / `html/start.bat` (Windows).

**VSCode extension dev:** `F5` in VSCode → command palette → `Skills: Manage Plugins`

**Package extension:**
```bash
cd vscode-extension && vsce package
```
`prepackage` hook auto-runs CSS sync; no manual step needed before packaging.

**CSS sync** — `html/styles.css` is canonical. After any edit to it:
```bash
make sync-css   # or: powershell scripts/sync-css.ps1
```
Do not edit `vscode-extension/webview/styles.css` directly — it is overwritten by this command.

## Architecture

Two independent surfaces with shared file-based data contract — see README.md for the diagram. Key distinction:

- **HTML version:** stateless HTTP server; `project_root` is fixed at process start via `cwd`.
- **VSCode extension:** stateful webview panel; `projectRoot = vscode.workspace.workspaceFolders[0].uri.fsPath`.

Both surfaces use the same read/merge/write logic (implemented independently in Python and Node.js).

## Key implementation details

- `server.py` stdlib only — no pip dependencies.
- If `installed_plugins.json` is missing, `server.py` falls back to `MOCK_PLUGINS` and sets `"mock": true` in the API response.
- VSCode extension shows `showWarningMessage` confirmation before writing; on cancel, re-posts current state to reset the webview toggle.
- CORS in `server.py` is restricted to `http://localhost` only.
- No npm runtime dependencies — `@types/vscode` is dev-only.

## No test runner configured

No test framework is set up. Tests should be added before shipping.
