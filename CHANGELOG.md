# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-05-15

### Added
- Marketplace panel with SSE-streamed installs — `/api/install-stream` replaces `/api/install`; install output shown line-by-line in an inline log area (de12865)
- Uninstall flow for locally-installed plugins in both HTML and VSCode surfaces (de12865)
- VSCode webview parity with HTML surface: install/uninstall panel, streaming log area, and marketplace dropdown (de12865)
- Orphan plugins (present in `settings.json` but absent from `installed_plugins.json`) now appear with an Install button instead of a broken toggle (de12865)
- Auto-sync on startup: installed plugins missing from `settings.json` are added with `enabled: true` (de12865)
- Makefile and PowerShell scaffolding for VSCode extension packaging (de12865)
- VSCode extension icon (`icon.png`) for marketplace display (ec451c3)

### Fixed
- Install button and marketplace dropdown overflow at narrow panel widths (de12865)
- `ConnectionAbortedError` (Windows WinError 10053) now caught in SSE handler alongside `BrokenPipeError` (de12865)
- Plugin install error message now surfaces the actual failure reason from the CLI (de12865)
- Remove install confirmation popup in VSCode extension — installs proceed immediately on click (4dffec1)

### Chore
- Add `*.vsix` to `.gitignore` so packaged extension artifacts are not tracked

## [0.3.0] - 2026-05-15

### Added
- Marketplace panel with SSE-streamed installs — `/api/install-stream` replaces `/api/install`; install output is shown line-by-line in an inline log area (8bd7d91)
- Uninstall flow for locally-installed plugins in both HTML and VSCode surfaces (8bd7d91)
- VSCode webview parity with HTML surface: install/uninstall panel, streaming log area, and marketplace dropdown (8bd7d91)
- Orphan plugins (present in `settings.json` but absent from `installed_plugins.json`) now appear with an Install button instead of a broken toggle (09a8d29)
- Auto-sync on startup: installed plugins missing from `settings.json` are added with `enabled: true` so both files stay in sync without manual intervention (09a8d29)
- Makefile and PowerShell scaffolding for VSCode extension packaging (8bd7d91)

### Fixed
- Install button and marketplace dropdown overflow at narrow panel widths — `minmax(0,1fr)` grid column and `flex:1;min-width:0` on the select element (c18c31f)
- `ConnectionAbortedError` (Windows WinError 10053) now caught in SSE handler alongside `BrokenPipeError` (c18c31f)
- Plugin install error message now surfaces the actual failure reason from the CLI (9f4a857)

## [0.2.0] - 2026-05-15

### Added
- Load agents from `.md` files under `agents/` directory per plugin, displayed in a dedicated agents disclosure alongside skills (271f647)
- Version badge per plugin row showing the installed plugin version (271f647)
- Global badge on global-scope plugin rows to distinguish scope visually (271f647)
- Collapsible path picker (HTML) and card header (VSCode) in the redesigned project card (271f647)

### Changed
- Refactor plugin loading to return `{ local, global }` arrays based on scope and `projectPath` matching, replacing the previous inherited/scope terminology (271f647)
- Toggle disclosure label uses `data-label` attribute (renamed `toggleSkills` to `toggleDisclosure`) to display the correct noun per section (271f647)
- Guard toggle endpoint to reject non-local plugin IDs (271f647)
- Mock plugin structure updated to match `{ local, global }` shape of real data (271f647)

### Fixed
- Skip skill folders that lack a `SKILL.md` file in both `server.py` and `extension.js` (72ca34b)
- Remove redundant global badge from global plugin rows; section heading already conveys scope (72ca34b)
- Align version badge styling to match marketplace badge using shared design tokens (72ca34b)
- Remove `margin-left`/`vertical-align` from version badge to fix column-layout indent (72ca34b)

## [0.1.0] - 2026-05-14

### Added
- Collapsible skill list per plugin row with skill count shown in the disclosure toggle (6d11f43)

### Changed
- Skill path resolution now prefers `installPath` from `installed_plugins.json` over the legacy `marketplaces/<mp>/<name>/skills/` fallback (d11ee0e)
- Toggle confirmation dialog removed; state is written immediately on change (d11ee0e)

### Fixed
- Resolve correct plugin skills directory layout when scanning installed plugins (484172b)

## [0.0.2] - 2026-05-14

NOTE: Should have been 0.1.0 due to new features added.

### Added
- Shared CSS design tokens (`--toggle-on`, `--btn-danger`) applied across HTML and VSCode surfaces (c346d53)
- VSCode sidebar launcher — `Skills: Manage Plugins` registers as a sidebar view (c346d53)
- Section descriptions below Local and Inherited headings explaining each tier (5070d2c)
- `/api/shutdown` endpoint and Stop server button in HTML header for graceful shutdown (5070d2c)
- `start.sh` / `start.bat` / `start.ps1` convenience launcher scripts for the HTML server (c346d53)

### Changed
- Inherited plugin row simplified: removed disabled toggle and `global default` badge; CTA renamed from "Override locally" to "Localize" (5070d2c)
- Plugin name truncation replaced with `word-break: break-word` so long names wrap instead of clip (5070d2c)
- Plugin info layout changed from horizontal to vertical (name above marketplace badge) (5070d2c)
- Theme toggle moved into flex header row alongside title and Stop server button (5070d2c)
- Active toggle color changed from `--accent` to dedicated `--toggle-on` green token (5070d2c)
- VSCode sidebar refreshes automatically on panel visibility change (5070d2c)
- Inherited plugin tier shown in UI using global default state with Localize CTA (c346d53)

## [0.0.1] - 2026-05-14

### Added
- Implement HTML server (`server.py`) using stdlib only — no pip dependencies (ab4fad2)
- Implement VSCode extension with webview panel and `Skills: Manage Plugins` command (ab4fad2)
- Fall back to `MOCK_PLUGINS` when `installed_plugins.json` is absent, with `"mock": true` in API response (ab4fad2)
- CORS restriction in `server.py` to `http://localhost` only (ab4fad2)

### Fixed
- Parse plugins from dict keys instead of a list to match the actual `installed_plugins.json` schema (61ee55e)
- Remove toggle confirmation dialog from VSCode extension to streamline UX (61ee55e)
- Surface JSON parse errors to the caller instead of crashing silently (2d55100)

[Unreleased]: https://github.com/cheneeheng/claude-code-plugin-toggler/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/cheneeheng/claude-code-plugin-toggler/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/cheneeheng/claude-code-plugin-toggler/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/cheneeheng/claude-code-plugin-toggler/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/cheneeheng/claude-code-plugin-toggler/compare/v0.0.2...v0.1.0
[0.0.2]: https://github.com/cheneeheng/claude-code-plugin-toggler/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/cheneeheng/claude-code-plugin-toggler/releases/tag/v0.0.1
