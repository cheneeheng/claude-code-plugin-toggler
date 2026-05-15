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
