import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

INSTALLED_PLUGINS_PATH = Path.home() / ".claude" / "plugins" / "installed_plugins.json"
SETTINGS_LOCAL_PATH = ".claude" / Path("settings.local.json")

PROJECT_ROOT = Path(os.getcwd())


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
        result.append({
            "id": pid,
            "name": name,
            "marketplace": marketplace,
            "enabled": enabled_map.get(pid, False),
        })
    return result


MOCK_PLUGINS = ["frontend-design@anthropic", "docx@anthropic"]


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

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "http://localhost")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/":
            index = Path(__file__).parent / "index.html"
            body = index.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        elif self.path == "/api/plugins":
            try:
                plugin_ids = load_installed_plugins()
                mock = plugin_ids is None
                if mock:
                    plugin_ids = MOCK_PLUGINS
                settings = load_settings_local(PROJECT_ROOT)
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
                "project_root": str(PROJECT_ROOT),
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
            settings = load_settings_local(PROJECT_ROOT)
            if "enabledPlugins" not in settings:
                settings["enabledPlugins"] = {}
            settings["enabledPlugins"][plugin_id] = enabled
            save_settings_local(PROJECT_ROOT, settings)
            self._send_json({"ok": True})
        else:
            self.send_response(404)
            self.end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 7779
    server = HTTPServer(("127.0.0.1", port), RequestHandler)
    print(f"Serving at http://127.0.0.1:{port}  (project root: {PROJECT_ROOT})")
    server.serve_forever()
