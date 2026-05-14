# Decision Log

---

### Entry 001

**Type:** Decision
**Mode:** Autonomous
**Timestamp:** 2026-05-13T00:00:00Z
**Task:** Bind address for html/server.py

**Context:** SKELETON §02 specifies "CORS: localhost only" but does not explicitly set a bind address. `0.0.0.0` and `127.0.0.1` are both valid choices.
**Decision / Action:** Bound the server to `127.0.0.1` (loopback only).
**Rationale:** Binding to all interfaces contradicts the localhost-only intent and exposes unauthenticated file read/write to the local network with no upside — no spec use case requires LAN access.
**Impact / Risk:** Users who want to reach the server from another machine on the LAN cannot. Low risk given the tool's local-dev nature.
**Outcome:** Server starts on `127.0.0.1:{port}` as confirmed by startup log.

---

### Entry 002

**Type:** Decision
**Mode:** Autonomous
**Timestamp:** 2026-05-13T00:00:00Z
**Task:** Behaviour when installed_plugins.json is missing

**Context:** SKELETON §05 explicitly states: "server.py returns hardcoded plugin list if installed_plugins.json is missing, clearly marked as mock data in the response." The VSCode extension spec does not repeat this instruction.
**Decision / Action:** Applied the same mock-data fallback to both surfaces. `GET /api/plugins` returns `"mock": true`; the extension posts `mock: true` in its load message. Both UIs surface a banner.
**Rationale:** Consistent behaviour across surfaces; the spec intent is clearly developer convenience during setup, not HTML-only.
**Impact / Risk:** None — mock data is read-only and clearly labelled.
**Outcome:** Mock banner renders when `installed_plugins.json` is absent.

---

### Entry 003

**Type:** Decision
**Mode:** Autonomous
**Timestamp:** 2026-05-13T00:00:00Z
**Task:** VSCode bulk-toggle implementation

**Context:** The extension spec defines a single `{ type: 'toggle' }` message type with a per-toggle `showWarningMessage` confirmation. No bulk-toggle message type is specified. "Enable all" / "Disable all" buttons are required by §05.
**Decision / Action:** Bulk actions in the webview send one `postMessage` per plugin that needs changing, reusing the existing toggle path.
**Rationale:** Staying within the specified message contract; no bulk message type exists to handle.
**Impact / Risk:** N plugins requiring change = N confirmation dialogs — poor UX for bulk actions in VSCode. Not a problem in the HTML version which has no confirmation step.
**Outcome:** Functional but verbose. Recommend adding a `{ type: 'bulk-toggle', enabled }` message type with a single confirmation in a follow-up iteration.

---

### Entry 005

**Type:** Decision
**Mode:** Autonomous
**Timestamp:** 2026-05-14T00:00:00Z
**Task:** ITER_02 — Mock plugin skills injection

**Context:** ITER_02 §04 specifies that mock plugin dicts should include a `skills` key so the collapsible UI is exercised during development. However, `MOCK_PLUGINS` in both `server.py` and `extension.js` is a flat list of string IDs, not a list of dicts — the `merge()` functions construct dicts. The plan's mock skill note does not account for this structure.
**Decision / Action:** Added a separate `MOCK_PLUGIN_SKILLS` dict (keyed by plugin ID) in both files. Updated `merge()` in `server.py` to accept an optional `skill_overrides` parameter; the API handler passes `MOCK_PLUGIN_SKILLS` when `mock=True`. In `extension.js`, `_refresh()` checks `mock && MOCK_PLUGIN_SKILLS[p.id]` before calling `loadPluginSkills()`.
**Rationale:** Avoids restructuring the existing flat `MOCK_PLUGINS` list. Keeps mock skill injection explicit and isolated from the real `load_plugin_skills()` path.
**Impact / Risk:** None. Mock skills are only injected when `installed_plugins.json` is absent.
**Outcome:** Both surfaces show "1 skill ▸" per mock plugin in development mode.

---

### Entry 004

**Type:** Decision
**Mode:** Autonomous
**Timestamp:** 2026-05-13T00:00:00Z
**Task:** Default enabled state for plugins absent from settings.local.json

**Context:** The spec defines `enabledPlugins` as a map of `id → boolean` but does not state what to assume for a plugin that has no entry in the map.
**Decision / Action:** Plugins with no entry in `enabledPlugins` are treated as `enabled: false`.
**Rationale:** Opt-in is safer than opt-out — an unknown plugin should not be silently active. Consistent with typical permission defaults.
**Impact / Risk:** On first run before any toggles, all plugins appear disabled even if the user considers them "on by default." User must explicitly enable each one.
**Outcome:** `merge()` / `mergePlugins()` default missing keys to `false`.
