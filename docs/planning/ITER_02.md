---
artifact: ITER_02
status: ready
created: 2026-05-14
scope: Collapsible skill list per plugin — read skill metadata from plugin directories, display as expandable rows in both surfaces
sections_changed: [02, 04, 05]
sections_unchanged: [01, 03]
---

## §01 · Concept
> Unchanged — see SKELETON.md §01

---

## §02 · Architecture

### Component diagram
> Unchanged — see ITER_01.md §02

### Data model (updated)

**Skill** — new entity, nested inside `InstalledPlugin`:
- `name` — string, from SKILL.md front matter (`name` key) or filename stem as fallback
- `description` — string, from SKILL.md front matter (`description` key), empty string if absent

**InstalledPlugin** — one new field added to shape from ITER_01.md §02:
- `skills` — `Skill[]`, may be empty if no skill files found in plugin directory

Plugin directory layout assumed:
```
~/.claude/plugins/
└── frontend-design/      ← directory named after the plugin name part only (before @)
    ├── SKILL.md          ← one or more .md files at root of plugin dir
    ├── another-skill.md
    └── ...               ← subdirectories ignored in this iteration
```

> **⚠ Unresolved assumption — verify before implementing.** Plugin IDs contain `@` (e.g. `frontend-design@anthropic`). The `@` character is illegal in directory names on Windows and uncommon on Unix. This plan assumes plugin directories use the name portion only (`frontend-design/`). If the actual layout differs (e.g. full id, or `anthropic/frontend-design/` nested), update `load_plugin_skills()` in both `server.py` and `extension.js` accordingly. The key `PLUGINS_DIR` constant in both files is the single place to fix.

Front matter parsed from each `.md` file (YAML between `---` delimiters):
```yaml
---
name: frontend-design
description: >-
  Create distinctive, production-grade frontend interfaces...
---
```

If a `.md` file has no parseable front matter, it is included with `name` = filename stem and `description` = `""`.

**`GET /api/plugins` response — `skills` field added:**
```json
{
  "plugins": [
    {
      "id": "frontend-design@anthropic",
      "name": "frontend-design",
      "marketplace": "anthropic",
      "enabled": true,
      "scope": "local",
      "skills": [
        { "name": "frontend-design", "description": "Create distinctive, production-grade frontend interfaces..." }
      ]
    }
  ],
  "project_root": "/path/to/project"
}
```

### API surface
> Unchanged — see ITER_01.md §02. No new endpoints. `GET /api/plugins` response shape is extended as above.

---

## §03 · Tech Stack
> Unchanged — see ITER_01.md §03

---

## §04 · Backend

### `server.py` changes

**New helper: `load_plugin_skills(plugin_id)`**

Reads all `.md` files at the root of `~/.claude/plugins/<plugin_id>/` and extracts front matter.

```python
import re

PLUGINS_DIR = pathlib.Path.home() / ".claude" / "plugins"

def load_plugin_skills(plugin_id):
    """
    Returns a list of { "name": str, "description": str } dicts.
    Reads all .md files at root of ~/.claude/plugins/<plugin_name>/.
    plugin_name is the part before '@' in plugin_id.
    Parses YAML front matter (name, description keys only).
    Falls back to filename stem if front matter is absent or unparseable.
    """
    plugin_name = plugin_id.split("@", 1)[0]   # "frontend-design@anthropic" → "frontend-design"
    plugin_dir = PLUGINS_DIR / plugin_name
    if not plugin_dir.is_dir():
        return []

    skills = []
    for md_file in sorted(plugin_dir.glob("*.md")):
        name, description = _parse_skill_frontmatter(md_file)
        skills.append({"name": name, "description": description})
    return skills


def _parse_skill_frontmatter(path):
    """
    Returns (name, description) from YAML front matter.
    Uses regex — no PyYAML dependency.
    Falls back to (stem, "") if front matter is absent or keys are missing.
    """
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
        m = re.match(r"^---\s*\n(.*?)\n---", text, re.DOTALL)
        if not m:
            return path.stem, ""
        fm = m.group(1)

        # Extract name — simple single-line value
        name_match = re.search(r"^name:\s*(.+)$", fm, re.MULTILINE)
        name = name_match.group(1).strip() if name_match else path.stem

        # Extract description — two cases handled separately:
        # 1. Block scalar (>- or > or |): collect subsequent indented lines
        block_match = re.search(r"^description:\s*(?:>-|>|[|][-]?)\s*\n((?:[ \t].+\n?)*)", fm, re.MULTILINE)
        if block_match:
            raw = block_match.group(1)
            description = " ".join(line.strip() for line in raw.splitlines() if line.strip())
        else:
            # 2. Inline scalar: value on same line as key
            inline_match = re.search(r"^description:\s*(.+)$", fm, re.MULTILINE)
            description = inline_match.group(1).strip() if inline_match else ""

        return name, description
    except Exception:
        return path.stem, ""
```

> **No PyYAML.** stdlib only — regex covers the two front matter patterns that appear in real skill files (plain scalar and `>-` block scalar). Anything more exotic is handled gracefully by the fallback.

**`merge(plugins, settings)` — add `skills` field:**

```python
def merge(plugins, settings):
    enabled_map = settings.get("enabledPlugins", {})
    result = []
    for pid in plugins:
        name, marketplace = pid.split("@", 1)
        in_local = pid in enabled_map
        result.append({
            "id": pid,
            "name": name,
            "marketplace": marketplace,
            "enabled": enabled_map.get(pid, True),
            "scope": "local" if in_local else "inherited",
            "skills": load_plugin_skills(pid),   # ← new
        })
    return result
```

**Placeholder / mock data** — when `installed_plugins.json` is missing, the existing mock plugin dict should include a `skills` key so the collapsible UI is exercised during development. Add it to each entry in the hardcoded list:
```python
# In the mock data block (wherever mock plugins are defined in server.py)
{
    "id": "frontend-design@anthropic",
    "name": "frontend-design",
    "marketplace": "anthropic",
    "enabled": True,
    "scope": "inherited",
    "skills": [                              # ← add this
        {"name": "mock-skill", "description": "Placeholder skill for development."}
    ]
}
```

**`extension.js` — `_refresh()` change**

`loadInstalledPlugins()` already assembles the plugin list. Add a `loadPluginSkills(pluginId)` helper that mirrors the Python logic:

```js
// fs, path, os assumed already required at top of extension.js

function loadPluginSkills(pluginId) {
  const pluginName = pluginId.split('@')[0];   // "frontend-design@anthropic" → "frontend-design"
  const pluginDir = path.join(os.homedir(), '.claude', 'plugins', pluginName);
  if (!fs.existsSync(pluginDir)) return [];

  return fs.readdirSync(pluginDir)
    .filter(f => f.endsWith('.md'))
    .sort()
    .map(f => {
      const fullPath = path.join(pluginDir, f);
      const stem = path.basename(f, '.md');
      try {
        const text = fs.readFileSync(fullPath, 'utf8');
        return parseSkillFrontmatter(text, stem);
      } catch {
        return { name: stem, description: '' };
      }
    });
}

function parseSkillFrontmatter(text, fallbackName) {
  const fmMatch = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) return { name: fallbackName, description: '' };
  const fm = fmMatch[1];

  const nameMatch = fm.match(/^name:\s*(.+)$/m);
  const name = nameMatch ? nameMatch[1].trim() : fallbackName;

  // Handle >- block scalar: collect indented lines after "description:"
  const descBlockMatch = fm.match(/^description:\s*(?:>-|>|[|][-]?)?\s*\n([\s\S]*?)(?=\n\S|\s*$)/m);
  let description = '';
  if (descBlockMatch) {
    description = descBlockMatch[1]
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .join(' ');
  } else {
    const descInlineMatch = fm.match(/^description:\s*(.+)$/m);
    if (descInlineMatch) description = descInlineMatch[1].trim();
  }

  return { name, description };
}
```

Call `loadPluginSkills(pid)` for each plugin inside `_refresh()` and include it in the `{ type: 'load', plugins: [...] }` message payload.

---

## §05 · Frontend

### Component tree (updated)

```
App
├── Header                          — unchanged, see ITER_01.md §05
├── PluginList
│   ├── Section: "Local"
│   │   └── PluginRow (×N)
│   │       ├── PluginName
│   │       ├── MarketplaceBadge
│   │       ├── Toggle
│   │       └── SkillsDisclosure     ← new
│   │           ├── DisclosureToggle — "N skills ▸" / "N skills ▾" button
│   │           └── SkillList        — hidden until expanded
│   │               └── SkillRow (×N)
│   │                   ├── SkillName
│   │                   └── SkillDescription
│   └── Section: "Inherited"
│       └── PluginRow (×N)
│           ├── ...                 — unchanged fields
│           └── SkillsDisclosure    ← new (same component, same behaviour)
└── BulkActions                     — unchanged
```

**SkillsDisclosure** is not rendered if `plugin.skills.length === 0`.

### SkillsDisclosure behaviour

- Collapsed by default.
- The disclosure toggle shows the skill count: `"2 skills ▸"`. When expanded: `"2 skills ▾"`.
- Click toggles a CSS class (`is-open`) on the `SkillList` container.
- Expand/collapse state is per-row, in-memory only. Not persisted.
- Each `SkillRow` shows `SkillName` (bold) and `SkillDescription` (muted, wraps).
- If `description` is empty, only `SkillName` is shown (no empty line).

### CSS additions to `styles.css`

> **Reminder (from ITER_01 deferred):** `html/styles.css` and `vscode-extension/webview/styles.css` are kept in sync manually. Add the rules below to **both** files.

```css
/* SkillsDisclosure */
.skills-disclosure {
  margin-top: 6px;
}

.skills-toggle-btn {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0;
}

.skills-list {
  display: none;
  margin-top: 6px;
  padding-left: 12px;
  border-left: 2px solid var(--border);
}

.skills-list.is-open {
  display: block;
}

.skill-row {
  padding: 4px 0;
}

.skill-name {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--fg);
}

.skill-description {
  font-size: 0.75rem;
  color: var(--fg-muted);
  margin-top: 1px;
}
```

### DOM / JS pattern (vanilla)

```js
function renderSkillsDisclosure(skills) {
  if (!skills || skills.length === 0) return '';

  const skillRows = skills.map(s => `
    <div class="skill-row">
      <div class="skill-name">${escapeHtml(s.name)}</div>
      ${s.description
        ? `<div class="skill-description">${escapeHtml(s.description)}</div>`
        : ''}
    </div>
  `).join('');

  return `
    <div class="skills-disclosure">
      <button class="skills-toggle-btn" onclick="toggleSkills(this)">
        ${skills.length} skill${skills.length !== 1 ? 's' : ''} ▸
      </button>
      <div class="skills-list">
        ${skillRows}
      </div>
    </div>
  `;
}

function toggleSkills(btn) {
  const list = btn.nextElementSibling;
  const open = list.classList.toggle('is-open');
  // Re-derive count from DOM rather than parsing text, avoiding fragile string replacement
  const count = list.querySelectorAll('.skill-row').length;
  btn.textContent = `${count} skill${count !== 1 ? 's' : ''} ${open ? '▾' : '▸'}`;
}
```

`escapeHtml` should already exist in both `index.html` and `panel.html` — add it if missing:
```js
function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
```

The same markup and JS is used in both `index.html` and `panel.html` — no surface-specific divergence.

---

## Deferred

- Skills in subdirectories (e.g. `plugin/subdir/SKILL.md`) — ignored in this iteration; only root-level `.md` files are read
- Skill-level enable/disable toggling — skills inherit their plugin's enabled state; per-skill control is out of scope
- Skill metadata beyond `name` and `description` (version, triggers, icon) — deferred
- Animated expand/collapse transition — CSS `display: none` toggle is intentionally abrupt for now; a `max-height` animation can be added later without touching data or backend
- File watching for skill file changes — follows the same deferred status as `settings.local.json` watching from ITER_01.md