import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

INSTALLED_PLUGINS_PATH = Path.home() / ".claude" / "plugins" / "installed_plugins.json"

MOCK_PLUGINS = ["frontend-design@anthropic", "docx@anthropic"]


def load_installed_plugins() -> list[str] | None:
    if not INSTALLED_PLUGINS_PATH.exists():
        return None  # signals mock data
    try:
        with open(INSTALLED_PLUGINS_PATH) as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        raise ValueError(str(INSTALLED_PLUGINS_PATH)) from e
    return list(data.get("plugins", {}).keys())


def load_settings_local(project_root: Path) -> dict[str, object]:
    path = project_root / ".claude" / "settings.local.json"
    if not path.exists():
        return {}
    try:
        with open(path) as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        raise ValueError(str(path)) from e


def save_settings_local(project_root: Path, settings: dict[str, object]) -> None:
    dir_ = project_root / ".claude"
    dir_.mkdir(parents=True, exist_ok=True)
    path = dir_ / "settings.local.json"
    with open(path, "w") as f:
        json.dump(settings, f, indent=2)


def merge(plugin_ids: list[str], settings: dict[str, object]) -> list[dict[str, object]]:
    enabled_map = settings.get("enabledPlugins", {})
    result = []
    for pid in plugin_ids:
        parts = pid.split("@", 1)
        name = parts[0]
        marketplace = parts[1] if len(parts) > 1 else ""
        in_local = pid in enabled_map
        result.append({
            "id": pid,
            "name": name,
            "marketplace": marketplace,
            # Inherited plugins default to enabled until a global settings file says otherwise.
            "enabled": enabled_map.get(pid, True),
            "scope": "local" if in_local else "inherited",
        })
    return result


class PluginServer(HTTPServer):
    def __init__(self, server_address, RequestHandlerClass, project_root: Path):
        super().__init__(server_address, RequestHandlerClass)
        self.project_root = project_root


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
                plugin_ids = load_installed_plugins()
                mock = plugin_ids is None
                if mock:
                    plugin_ids = MOCK_PLUGINS
                settings = load_settings_local(project_root)
            except ValueError as exc:
                failed_path = str(exc)
                self._send_json(
                    {"error": f"Failed to parse {failed_path}", "path": failed_path},
                    500,
                )
                return
            plugins = merge(plugin_ids, settings)
            payload = {
                "plugins": plugins,
                "project_root": str(project_root),
            }
            if mock:
                payload["mock"] = True
            self._send_json(payload)

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
            self._send_json({"ok": True, "project_root": path_str})

        else:
            self.send_response(404)
            self.end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 7779
    project_root = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(os.getcwd())
    server = PluginServer(("127.0.0.1", port), RequestHandler, project_root)
    print(f"Serving at http://127.0.0.1:{port}  (project root: {project_root})")
    server.serve_forever()
