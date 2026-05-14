# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/cheneeheng/claude-code-plugin-toggler/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/cheneeheng/claude-code-plugin-toggler/releases/tag/v0.0.1
