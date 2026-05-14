# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/cheneeheng/claude-code-plugin-toggler/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/cheneeheng/claude-code-plugin-toggler/compare/v0.0.2...v0.1.0
[0.0.2]: https://github.com/cheneeheng/claude-code-plugin-toggler/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/cheneeheng/claude-code-plugin-toggler/releases/tag/v0.0.1
