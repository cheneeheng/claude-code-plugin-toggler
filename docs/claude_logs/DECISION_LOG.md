# Decision Log

---

### Entry 001

**Type:** Decision
**Mode:** Autonomous
**Timestamp:** 2026-05-15T00:00:00Z
**Task:** ITER_03 — `_parse_skill_frontmatter` fallback for agent files

**Context:** The plan says to reuse `_parse_skill_frontmatter` unchanged for agents. But the existing fallback is `path.parent.name`, which gives "agents" (the directory name) when called with an agent `.md` file path, not the file stem (e.g. `my-agent`).

**Decision / Action:** Added optional `fallback` parameter to `_parse_skill_frontmatter`. When absent it defaults to `path.parent.name` (existing behaviour for skills). `load_plugin_agents` passes `md_file.stem` explicitly.

**Rationale:** Minimum-change fix that keeps skills behaviour identical while giving agents the correct name. The JS version already used explicit fallback names in `parseSkillFrontmatter(text, stem)`.

**Impact / Risk:** Low — the change is backward-compatible. Only agent loading uses the new parameter.

**Outcome:** `_parse_skill_frontmatter` signature changed; all call sites updated.

---

### Entry 002

**Type:** Decision
**Mode:** Autonomous
**Timestamp:** 2026-05-15T00:00:00Z
**Task:** ITER_03 — Spurious `localIds.add(pluginId)` in plan draft for extension.js

**Context:** The plan's `loadInstalledPlugins` JS pseudocode contains `localIds.add(pluginId)` referencing a `localIds` Set that is never declared. It appears to be a leftover from an earlier draft and has no downstream usage in the plan.

**Decision / Action:** Dropped the line. The `local` and `global` arrays are returned directly; no intermediate Set is needed.

**Rationale:** The line would cause a ReferenceError at runtime. The downstream `buildPluginList` and `_onMessage` functions build local ID sets independently where needed.

**Impact / Risk:** None — the line was dead code in the plan.

**Outcome:** `loadInstalledPlugins` in extension.js omits the spurious line.

---

### Entry 003

**Type:** Decision
**Mode:** Autonomous
**Timestamp:** 2026-05-15T00:00:00Z
**Task:** ITER_03 — Keep `_send_json` name in server.py (plan used `_respond_json`)

**Context:** The plan's handler snippets use `self._respond_json(payload)`. The existing codebase uses `self._send_json`. Renaming would be no-value churn.

**Decision / Action:** Kept `_send_json` throughout server.py.

**Rationale:** Rename has zero functional value and increases diff noise. Existing name is clear.

**Impact / Risk:** None.

**Outcome:** `_send_json` retained.

---

### Entry 004

**Type:** Decision
**Mode:** Autonomous
**Timestamp:** 2026-05-15T00:00:00Z
**Task:** ITER_03 — `toggleSkills` renamed to `toggleDisclosure` with `data-label` attribute

**Context:** The plan reuses `toggleSkills` for agents, but the function hardcodes "skill" in the button label. Without a label hint, toggling an agents disclosure would show "N skills" incorrectly.

**Decision / Action:** Renamed `toggleSkills` to `toggleDisclosure` in both HTML files. Added `data-label="skill"` / `data-label="agent"` to the toggle buttons so the function reads the correct noun.

**Rationale:** Minimum change to support both disclosures with correct labels. No new CSS needed.

**Impact / Risk:** Low — internal function rename within the same files. No external callers.

**Outcome:** Both HTML files use `toggleDisclosure`; skills and agents show correct labels.

---

### Entry 005

**Type:** Decision
**Mode:** Autonomous
**Timestamp:** 2026-05-15T00:00:00Z
**Task:** ITER_04/05/06 — Rename `load()` to `fetchPlugins()` in index.html

**Context:** The ITER_04 plan references `fetchPlugins()` in `installPlugin()` and `connectEventStream()` but the existing codebase had a single `load()` function. The plan did not include a rename directive.

**Decision / Action:** Renamed `load()` to `fetchPlugins()` directly in index.html and updated all call sites. Did not create a wrapper alias — the rename is clean and there are no external callers.

**Rationale:** `fetchPlugins` is the name used throughout the new plan code. Keeping `load()` and adding an alias would leave dead names in the file with no benefit.

**Impact / Risk:** Low — purely internal to index.html.

**Outcome:** `load()` → `fetchPlugins()` in index.html; `load()` still works in index.html because project-apply handler previously called `load()` — updated to `fetchPlugins()` + `fetchMarketplace()`.

---

### Entry 006

**Type:** Decision
**Mode:** Autonomous
**Timestamp:** 2026-05-15T00:00:00Z
**Task:** ITER_05 — Sync VSCode styles.css diverged from canonical HTML styles.css

**Context:** Before ITER_05, `vscode-extension/webview/styles.css` had accumulated classes (`.project-picker`, `.mock-banner`) not present in `html/styles.css`, and was missing classes added in ITER_03 (`html/styles.css` is the more up-to-date file). ITER_05 designates `html/styles.css` as the canonical source.

**Decision / Action:** Replaced `vscode-extension/webview/styles.css` with the full content of `html/styles.css` (which now includes all ITER_04+05+06 additions). The old VSCode-only classes were dead code — no `panel.html` elements referenced them.

**Rationale:** ITER_05 explicitly states the VSCode file "becomes a generated file — never edit it directly." Preserving the dead VSCode-only classes would contradict this and add noise.

**Impact / Risk:** Low — verified no `panel.html` elements use `.project-picker` or `.mock-banner`.

**Outcome:** `vscode-extension/webview/styles.css` is now identical to `html/styles.css`.

---

### Entry 007

**Type:** Decision
**Mode:** Autonomous
**Timestamp:** 2026-05-15T00:00:00Z
**Task:** ITER_04 — `installPlugin()` in panel.html does not wait for a result message

**Context:** The plan says the VSCode webview posts `{ type: 'install' }` and then waits for the next `{ type: 'load' }` message to re-render. The button stays in "Installing…" state until that arrives. This is correct per spec. However, the plan also notes "No separate `{ type: 'installResult' }` message."

**Decision / Action:** `installPlugin()` in panel.html sets the button to "Installing…" and posts to the extension, then returns. The button stays in that state until the extension calls `_refresh()` which posts `{ type: 'load' }` — which triggers a full re-render and resets the button state.

**Rationale:** Exactly per spec. The full-refresh approach keeps webview stateless with respect to install outcomes.

**Impact / Risk:** None — matches the specified behaviour exactly.

**Outcome:** Implemented as described.
