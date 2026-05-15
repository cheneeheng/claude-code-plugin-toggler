import json
import os
import queue
import re
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from socketserver import ThreadingMixIn

# ── Constants ──────────────────────────────────────────────────────────────
PLUGINS_BASE      = Path.home() / ".claude" / "plugins"
MARKETPLACES_JSON = PLUGINS_BASE / "known_marketplaces.json"


def _parse_skill_frontmatter(path: Path, fallback: str = "") -> tuple[str, str]:
    """
    Returns (name, description) from YAML front matter.
    Uses regex — no PyYAML dependency.
    fallback: used when name key is absent. Defaults to path.parent.name (skill folder name).
    Pass path.stem explicitly for agent .md files so the stem not the parent dir is used.
    """
    if not fallback:
        fallback = path.parent.name
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
        m = re.match(r"^---\s*\n(.*?)\n---", text, re.DOTALL)
        if not m:
            return fallback, ""
        fm = m.group(1)

        name_match = re.search(r"^name:\s*(.+)$", fm, re.MULTILINE)
        name = name_match.group(1).strip() if name_match else fallback

        block_match = re.search(
            r"^description:\s*(?:>-|>|[|][-]?)\s*\n((?:[ \t].+\n?)*)", fm, re.MULTILINE
        )
        if block_match:
            raw = block_match.group(1)
            description = " ".join(line.strip() for line in raw.splitlines() if line.strip())
        else:
            inline_match = re.search(r"^description:\s*(.+)$", fm, re.MULTILINE)
            description = inline_match.group(1).strip() if inline_match else ""

        return name, description
    except Exception:
        return fallback, ""


def _mock_plugins() -> dict:
    return {
        "local": [
            {"id": "ceh-dev-tools@ceh-plugins", "version": "1.1.0", "installPath": ""}
        ],
        "global": [
            {"id": "frontend-design@anthropic", "version": "2.0.1", "installPath": ""}
        ],
        "mock": True,
    }


def normalise_path(p: str) -> str:
    """
    Normalise a filesystem path for reliable comparison across platforms.
    On Windows: lowercases the drive letter and resolves separators.
    On all platforms: resolves symlinks, removes trailing slashes.
    Returns empty string for empty/None input.
    UNC paths (\\server\share\...) are handled by the platform resolver.
    """
    if not p:
        return ""
    try:
        resolved = Path(p).resolve()
        s = str(resolved)
        # Windows only: lowercase drive letter to normalise "C:\..." vs "c:\..."
        if len(s) >= 2 and s[1] == ":":
            s = s[0].lower() + s[1:]
        return s
    except Exception:
        return str(p)


def load_installed_plugins(project_root: Path) -> dict:
    """
    Returns { "local": [...], "global": [...] }
    Each entry: { "id", "version", "installPath" }

    Local  = scope=="local" and projectPath matches project_root (path-normalised).
    Global = scope!="local" OR no projectPath field.

    If a plugin id appears in both local (for this project) and global entries,
    it is placed in local only — local wins.

    If installed_plugins.json is missing, returns mock data (includes "mock": True).
    """
    installed_path = PLUGINS_BASE / "installed_plugins.json"
    if not installed_path.exists():
        return _mock_plugins()

    raw = json.loads(installed_path.read_text(encoding="utf-8"))['plugins']
    norm_project = normalise_path(str(project_root))

    local_result: list[dict] = []
    global_result: list[dict] = []

    for plugin_id, entries in raw.items():
        local_entry = None
        global_entry = None

        for entry in entries:
            is_local_scope = entry.get("scope") == "local"
            entry_project = entry.get("projectPath", "")
            matches_project = (
                normalise_path(entry_project) == norm_project if entry_project else False
            )

            if is_local_scope and matches_project:
                local_entry = entry
                break
            elif not is_local_scope and global_entry is None:
                global_entry = entry
            # local-scoped entries for OTHER projects are intentionally ignored

        if local_entry:
            local_result.append({
                "id": plugin_id,
                "version": local_entry.get("version", ""),
                "installPath": local_entry.get("installPath", ""),
            })
        elif global_entry:
            global_result.append({
                "id": plugin_id,
                "version": global_entry.get("version", ""),
                "installPath": global_entry.get("installPath", ""),
            })

    return {"local": local_result, "global": global_result}


def load_plugin_skills(install_path: str) -> list[dict]:
    """Reads all skill folders under <install_path>/skills/."""
    if not install_path:
        return []
    skills_dir = Path(install_path) / "skills"
    if not skills_dir.is_dir():
        return []

    skills = []
    for skill_folder in sorted(skills_dir.iterdir()):
        if not skill_folder.is_dir():
            continue
        skill_md = skill_folder / "SKILL.md"
        if not skill_md.exists():
            continue
        name, description = _parse_skill_frontmatter(skill_md)
        skills.append({"name": name, "description": description})
    return skills


def load_plugin_agents(install_path: str) -> list[dict]:
    """Reads all .md files directly under <install_path>/agents/."""
    if not install_path:
        return []
    agents_dir = Path(install_path) / "agents"
    if not agents_dir.is_dir():
        return []

    agents = []
    for md_file in sorted(agents_dir.glob("*.md")):
        name, description = _parse_skill_frontmatter(md_file, fallback=md_file.stem)
        agents.append({"name": name, "description": description})
    return agents


def load_settings_local(project_root: Path) -> dict:
    path = project_root / ".claude" / "settings.local.json"
    if not path.exists():
        return {}
    try:
        with open(path) as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        raise ValueError(str(path)) from e


def save_settings_local(project_root: Path, settings: dict) -> None:
    dir_ = project_root / ".claude"
    dir_.mkdir(parents=True, exist_ok=True)
    path = dir_ / "settings.local.json"
    with open(path, "w") as f:
        json.dump(settings, f, indent=2)


def merge(raw: dict, settings: dict) -> dict:
    """
    raw = { "local": [...], "global": [...] } from load_installed_plugins() (mock key already removed)
    settings = dict from load_settings_local()
    Returns { "local": [...], "global": [...] } with full plugin dicts.
    """
    enabled_map = settings.get("enabledPlugins", {})

    def build(entry: dict, plugin_scope: str) -> dict:
        pid = entry["id"]
        name, marketplace = pid.split("@", 1)
        install_path = entry.get("installPath", "")
        result: dict = {
            "id": pid,
            "name": name,
            "marketplace": marketplace,
            "version": entry.get("version", ""),
            "pluginScope": plugin_scope,
            "skills": load_plugin_skills(install_path),
            "agents": load_plugin_agents(install_path),
        }
        if plugin_scope == "local":
            result["enabled"] = enabled_map.get(pid, True)
        return result

    return {
        "local":  [build(e, "local")  for e in raw["local"]],
        "global": [build(e, "global") for e in raw["global"]],
    }


def load_known_marketplaces() -> list[dict]:
    """
    Reads ~/.claude/plugins/known_marketplaces.json.
    Returns list of { "key", "installLocation", "lastUpdated" } dicts.
    Returns [] if file is missing.
    """
    if not MARKETPLACES_JSON.exists():
        return []
    raw = json.loads(MARKETPLACES_JSON.read_text(encoding="utf-8"))
    result = []
    for key, info in raw.items():
        result.append({
            "key": key,
            "installLocation": info.get("installLocation", ""),
            "lastUpdated": info.get("lastUpdated", ""),
        })
    return result


def load_marketplace_plugins(marketplace_key: str, install_location: str) -> tuple[list, object]:
    """
    Reads <install_location>/.claude-plugin/marketplace.json.
    Returns (plugins_list, error_string_or_None).
    plugins_list entries: { "name", "description", "version", "author", "keywords" }
    """
    if not install_location:
        return [], "installLocation is empty"
    mp_json = Path(install_location) / ".claude-plugin" / "marketplace.json"
    if not mp_json.exists():
        return [], f"marketplace.json not found at {mp_json}"
    try:
        raw = json.loads(mp_json.read_text(encoding="utf-8"))
    except Exception as e:
        return [], f"Failed to parse marketplace.json: {e}"

    plugins = []
    for p in raw.get("plugins", []):
        plugins.append({
            "name": p.get("name", ""),
            "description": p.get("description", ""),
            "version": p.get("version", ""),
            "author": (p.get("author") or {}).get("name", ""),
            "keywords": p.get("keywords", []),
        })
    return plugins, None


def build_marketplace_response(project_root: Path) -> dict:
    """
    Combines known_marketplaces.json with each marketplace's marketplace.json.
    Annotates each plugin with installed/installedScope derived from
    installed_plugins.json for the current project_root.
    """
    raw_installed = load_installed_plugins(project_root)
    installed_local  = {e["id"] for e in raw_installed.get("local", [])}
    installed_global = {e["id"] for e in raw_installed.get("global", [])}

    marketplaces_meta = load_known_marketplaces()
    if not marketplaces_meta:
        return {"marketplaces": [], "error": "known_marketplaces.json not found"}

    result = []
    for m in marketplaces_meta:
        plugins_raw, err = load_marketplace_plugins(m["key"], m["installLocation"])
        entry: dict = {
            "key": m["key"],
            "lastUpdated": m["lastUpdated"],
        }
        if err:
            entry["plugins"] = []
            entry["error"] = err
        else:
            annotated = []
            for p in plugins_raw:
                pid = f"{p['name']}@{m['key']}"
                if pid in installed_local:
                    installed, scope = True, "local"
                elif pid in installed_global:
                    installed, scope = True, "global"
                else:
                    installed, scope = False, None
                annotated.append({
                    **p,
                    "marketplace": m["key"],
                    "id": pid,
                    "installed": installed,
                    "installedScope": scope,
                })
            entry["plugins"] = annotated
        result.append(entry)

    return {"marketplaces": result}


class SkillsServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

    def __init__(self, server_address, RequestHandlerClass, project_root: Path):
        super().__init__(server_address, RequestHandlerClass)
        self.project_root = project_root
        self.sse_clients: list[queue.Queue] = []
        self.sse_clients_lock = threading.Lock()
        self._watch_mtimes: dict[str, object] = {}
        self._start_watcher()

    def _watched_paths(self) -> list[Path]:
        return [
            PLUGINS_BASE / "installed_plugins.json",
            Path(self.project_root) / ".claude" / "settings.local.json",
        ]

    def _start_watcher(self) -> None:
        for p in self._watched_paths():
            self._watch_mtimes[str(p)] = p.stat().st_mtime if p.exists() else None
        self._schedule_watch()

    def _schedule_watch(self) -> None:
        t = threading.Timer(1.0, self._poll)
        t.daemon = True
        t.start()

    def _poll(self) -> None:
        changed = False
        for p in self._watched_paths():
            key = str(p)
            try:
                mtime = p.stat().st_mtime if p.exists() else None
            except OSError:
                mtime = None
            if mtime != self._watch_mtimes.get(key):
                self._watch_mtimes[key] = mtime
                changed = True
        if changed:
            self._broadcast_refresh()
        self._schedule_watch()

    def _broadcast_refresh(self) -> None:
        with self.sse_clients_lock:
            dead = []
            for q in self.sse_clients:
                try:
                    q.put_nowait("refresh")
                except Exception:
                    dead.append(q)
            for q in dead:
                self.sse_clients.remove(q)

    def add_sse_client(self, q: queue.Queue) -> None:
        with self.sse_clients_lock:
            self.sse_clients.append(q)

    def remove_sse_client(self, q: queue.Queue) -> None:
        with self.sse_clients_lock:
            if q in self.sse_clients:
                self.sse_clients.remove(q)


class RequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # suppress default request logging

    def _send_json(self, data: dict, status: int = 200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "http://localhost")
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length))

    def _serve_file(self, filename: str, content_type: str):
        path = Path(__file__).parent / filename
        if not path.exists():
            self.send_response(404)
            self.end_headers()
            return
        body = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "http://localhost")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/":
            self._serve_file("index.html", "text/html")

        elif self.path == "/styles.css":
            self._serve_file("styles.css", "text/css")

        elif self.path == "/api/plugins":
            project_root = self.server.project_root
            try:
                raw = load_installed_plugins(project_root)
                is_mock = raw.pop("mock", False)
                settings = load_settings_local(project_root)

                # Case 2: plugins in installed_plugins.json absent from settings → add enabled:true
                if not is_mock:
                    enabled_plugins = settings.get("enabledPlugins", {})
                    changed = False
                    for entry in raw.get("local", []):
                        if entry["id"] not in enabled_plugins:
                            enabled_plugins[entry["id"]] = True
                            changed = True
                    if changed:
                        settings["enabledPlugins"] = enabled_plugins
                        save_settings_local(project_root, settings)

                merged = merge(raw, settings)

                # Case 1: plugins in settings but not installed → orphans with install button
                installed_local_ids = {e["id"] for e in raw.get("local", [])}
                for pid in settings.get("enabledPlugins", {}):
                    if pid not in installed_local_ids:
                        at_idx = pid.find("@")
                        name = pid[:at_idx] if at_idx != -1 else pid
                        marketplace = pid[at_idx + 1:] if at_idx != -1 else ""
                        merged["local"].append({
                            "id": pid,
                            "name": name,
                            "marketplace": marketplace,
                            "version": "",
                            "pluginScope": "local",
                            "skills": [],
                            "agents": [],
                            "installed": False,
                        })

            except ValueError as exc:
                failed_path = str(exc)
                self._send_json(
                    {"error": f"Failed to parse {failed_path}", "path": failed_path}, 500
                )
                return
            payload = {**merged, "project_root": str(project_root)}
            if is_mock:
                payload["mock"] = True
            self._send_json(payload)

        elif self.path == "/api/marketplace":
            payload = build_marketplace_response(self.server.project_root)
            self._send_json(payload)

        elif self.path == "/api/events":
            q: queue.Queue = queue.Queue()
            self.server.add_sse_client(q)

            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.end_headers()

            try:
                self.wfile.write(b"data: connected\n\n")
                self.wfile.flush()
                while True:
                    try:
                        msg = q.get(timeout=15)
                        self.wfile.write(f"data: {msg}\n\n".encode())
                        self.wfile.flush()
                    except queue.Empty:
                        # Send SSE comment as keepalive to prevent proxy/browser timeouts
                        self.wfile.write(b": keepalive\n\n")
                        self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                pass
            finally:
                self.server.remove_sse_client(q)

        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == "/api/toggle":
            body = self._read_body()
            plugin_id = body.get("id")
            enabled = body.get("enabled")
            if not isinstance(plugin_id, str) or not isinstance(enabled, bool):
                self._send_json({"ok": False, "error": "invalid payload"}, 400)
                return
            project_root = self.server.project_root
            raw = load_installed_plugins(project_root)
            raw.pop("mock", None)
            local_ids = {e["id"] for e in raw.get("local", [])}
            if plugin_id not in local_ids:
                self._send_json(
                    {"ok": False, "error": "Plugin is not installed locally for this project"}, 400
                )
                return
            settings = load_settings_local(project_root)
            if "enabledPlugins" not in settings:
                settings["enabledPlugins"] = {}
            settings["enabledPlugins"][plugin_id] = enabled
            save_settings_local(project_root, settings)
            self._send_json({"ok": True})

        elif self.path == "/api/set-project":
            body = self._read_body()
            path_str = body.get("path", "")
            if not os.path.isdir(path_str):
                self._send_json(
                    {"ok": False, "error": f"Path does not exist: {path_str}"}, 400
                )
                return
            self.server.project_root = Path(path_str)
            # Re-seed the watcher so it picks up the new project's settings file
            self.server._watch_mtimes = {}
            self._send_json({"ok": True, "project_root": path_str})

        elif self.path == "/api/install":
            body = self._read_body()
            plugin_id = body.get("id", "")

            if "@" not in plugin_id:
                self._send_json({"ok": False, "error": "Invalid plugin id format"}, 400)
                return

            marketplace_key = plugin_id.split("@", 1)[1]

            known = load_known_marketplaces()
            known_keys = {m["key"] for m in known}
            if marketplace_key not in known_keys:
                self._send_json(
                    {"ok": False, "error": f"Unknown marketplace: {marketplace_key}"}, 400
                )
                return

            try:
                result = subprocess.run(
                    ["claude", "plugin", "install", plugin_id, "--scope", "local"],
                    capture_output=True,
                    text=True,
                    timeout=60,
                    cwd=self.server.project_root,
                )
            except FileNotFoundError:
                self._send_json({"ok": False, "error": "'claude' CLI not found on PATH"}, 500)
                return
            except subprocess.TimeoutExpired:
                self._send_json(
                    {"ok": False, "error": "Install timed out after 60 seconds"}, 500
                )
                return

            if result.returncode != 0:
                stderr = result.stderr.strip() or result.stdout.strip()
                self._send_json(
                    {"ok": False, "error": f"Exit code {result.returncode}: {stderr}"}, 500
                )
                return

            self._send_json({"ok": True, "id": plugin_id})

        elif self.path == "/api/shutdown":
            self._send_json({"ok": True})
            threading.Thread(target=self.server.shutdown, daemon=True).start()

        else:
            self.send_response(404)
            self.end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 7779
    project_root = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(os.getcwd())
    server = SkillsServer(("127.0.0.1", port), RequestHandler, project_root)
    print(f"Serving at http://127.0.0.1:{port}  (project root: {project_root})")
    server.serve_forever()
