const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const os = require("os");

const INSTALLED_PLUGINS_PATH = path.join(
  os.homedir(),
  ".claude",
  "plugins",
  "installed_plugins.json"
);

function loadInstalledPlugins() {
  if (!fs.existsSync(INSTALLED_PLUGINS_PATH)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(INSTALLED_PLUGINS_PATH, "utf8"));
    return Object.keys(data.plugins || {});
  } catch (e) {
    throw new Error(`Failed to parse ${INSTALLED_PLUGINS_PATH}: ${e.message}`);
  }
}

function loadSettingsLocal(projectRoot) {
  const p = path.join(projectRoot, ".claude", "settings.local.json");
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    throw new Error(`Failed to parse ${p}: ${e.message}`);
  }
}

function saveSettingsLocal(projectRoot, settings) {
  const dir = path.join(projectRoot, ".claude");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "settings.local.json"),
    JSON.stringify(settings, null, 2)
  );
}

function mergePlugins(pluginIds, settings) {
  const enabledMap = settings.enabledPlugins || {};
  return pluginIds.map((id) => {
    const [name, marketplace = ""] = id.split("@");
    const inLocal = id in enabledMap;
    return {
      id,
      name,
      marketplace,
      // Inherited plugins default to enabled until a global settings file says otherwise.
      enabled: inLocal ? enabledMap[id] === true : true,
      scope: inLocal ? "local" : "inherited",
    };
  });
}

const MOCK_PLUGINS = ["frontend-design@anthropic", "docx@anthropic"];

class SkillsViewProvider {
  static viewType = "skillsToggle.pluginList";

  constructor(extensionUri) {
    this._extensionUri = extensionUri;
  }

  resolveWebviewView(webviewView) {
    const stylesUri = webviewView.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "webview", "styles.css")
    );
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, "webview")],
    };
    webviewView.webview.html = this._getHtml(webviewView.webview, stylesUri);
    this._refresh(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((msg) =>
      this._onMessage(webviewView.webview, msg)
    );
  }

  _projectRoot() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return null;
    return folders[0].uri.fsPath;
  }

  _refresh(webview) {
    const projectRoot = this._projectRoot();
    if (!projectRoot) {
      webview.postMessage({ type: "error", message: "No workspace folder open." });
      return;
    }
    try {
      let pluginIds = loadInstalledPlugins();
      const mock = pluginIds === null;
      if (mock) pluginIds = MOCK_PLUGINS;
      const settings = loadSettingsLocal(projectRoot);
      const plugins = mergePlugins(pluginIds, settings);
      webview.postMessage({ type: "load", plugins, projectRoot, mock });
    } catch (e) {
      webview.postMessage({ type: "error", message: e.message });
    }
  }

  async _onMessage(webview, msg) {
    if (msg.type !== "toggle") return;

    const { id, enabled } = msg;
    const projectRoot = this._projectRoot();
    if (!projectRoot) return;

    const label = enabled ? "enable" : "disable";
    const answer = await vscode.window.showWarningMessage(
      `Pin "${id}" to local settings? (${label})`,
      "Yes",
      "No"
    );

    if (answer !== "Yes") {
      // Re-send current state to reset the webview toggle.
      this._refresh(webview);
      return;
    }

    const settings = loadSettingsLocal(projectRoot);
    if (!settings.enabledPlugins) settings.enabledPlugins = {};
    settings.enabledPlugins[id] = enabled;
    saveSettingsLocal(projectRoot, settings);
    this._refresh(webview);
  }

  _getHtml(webview, stylesUri) {
    const panelHtmlPath = vscode.Uri.joinPath(
      this._extensionUri,
      "webview",
      "panel.html"
    );
    let html = fs.readFileSync(panelHtmlPath.fsPath, "utf8");
    // Inject the resolved styles URI in place of the placeholder.
    html = html.replace("__STYLES_URI__", stylesUri.toString());
    return html;
  }
}

function activate(context) {
  const provider = new SkillsViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SkillsViewProvider.viewType,
      provider
    )
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
