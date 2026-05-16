#!/usr/bin/env bash
set -euo pipefail

PORT=17779
PROJECT_DIR="$(mktemp -d)"
PLUGINS_DIR="$HOME/.claude/plugins"
SERVER_PID=""

cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  rm -rf "$PROJECT_DIR"
  rm -f "$PLUGINS_DIR/installed_plugins.json"
}
trap cleanup EXIT

# ── Set up fixture files ────────────────────────────────────────────

mkdir -p "$PLUGINS_DIR"
mkdir -p "$PROJECT_DIR/.claude"

# Substitute __PROJECT_ROOT__ with the actual temp dir.
# The | delimiter is safe here — mktemp paths never contain |.
sed "s|__PROJECT_ROOT__|$PROJECT_DIR|g" \
  tests/fixtures/installed_plugins.json > "$PLUGINS_DIR/installed_plugins.json"

cp tests/fixtures/settings.local.json "$PROJECT_DIR/.claude/settings.local.json"

# ── Start server ────────────────────────────────────────────────────

python3 html/server.py "$PORT" "$PROJECT_DIR" &
SERVER_PID=$!

# Poll until ready (max 10s)
READY=0
for i in $(seq 1 10); do
  sleep 1
  if curl -sf "http://localhost:$PORT/" > /dev/null 2>&1; then
    READY=1
    break
  fi
done

if [ "$READY" -eq 0 ]; then
  echo "FAIL: server did not start within 10 seconds"
  exit 1
fi

# ── Assertions ──────────────────────────────────────────────────────

RESPONSE=$(curl -sf "http://localhost:$PORT/api/plugins")

# 1. Response is valid JSON
echo "$RESPONSE" | python3 -c "import sys, json; json.load(sys.stdin)" \
  || { echo "FAIL: /api/plugins did not return valid JSON"; exit 1; }

# 2. Required top-level keys present
echo "$RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert 'local'        in d, 'missing key: local'
assert 'global'       in d, 'missing key: global'
assert 'project_root' in d, 'missing key: project_root'
" || { echo "FAIL: response shape incorrect"; exit 1; }

# 3. Exactly one local plugin, exactly one global plugin
echo "$RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert len(d['local'])  == 1, f'expected 1 local plugin,  got {len(d[\"local\"])}'
assert len(d['global']) == 1, f'expected 1 global plugin, got {len(d[\"global\"])}'
" || { echo "FAIL: plugin counts incorrect"; exit 1; }

# 4. Local plugin has correct id, pluginScope, and enabled state
echo "$RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
p = d['local'][0]
assert p['id']          == 'smoke-local@smoke-market', f'wrong id: {p[\"id\"]}'
assert p['pluginScope'] == 'local',                    f'wrong pluginScope: {p[\"pluginScope\"]}'
assert p['enabled']     == True,                       f'expected enabled=True, got {p[\"enabled\"]}'
" || { echo "FAIL: local plugin data incorrect"; exit 1; }

# 5. Global plugin has correct pluginScope and no 'enabled' key
echo "$RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
p = d['global'][0]
assert p['pluginScope'] == 'global', f'wrong pluginScope: {p[\"pluginScope\"]}'
assert 'enabled' not in p,           'global plugin must not have enabled key'
" || { echo "FAIL: global plugin data incorrect"; exit 1; }

# 6. POST /api/toggle — set local plugin to disabled
curl -sf -X POST "http://localhost:$PORT/api/toggle" \
  -H "Content-Type: application/json" \
  -d '{"id":"smoke-local@smoke-market","enabled":false}' \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert d.get('ok') == True, f'toggle response not ok: {d}'
" || { echo "FAIL: POST /api/toggle did not return ok:true"; exit 1; }

# Verify toggle was persisted (re-fetch)
RESPONSE2=$(curl -sf "http://localhost:$PORT/api/plugins")
echo "$RESPONSE2" | python3 -c "
import sys, json
d = json.load(sys.stdin)
p = d['local'][0]
assert p['enabled'] == False, f'expected enabled=False after toggle, got {p[\"enabled\"]}'
" || { echo "FAIL: toggle was not persisted"; exit 1; }

echo "OK: all smoke tests passed"
