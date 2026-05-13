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
    return data.plugins || [];
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
    return { id, name, marketplace, enabled: enabledMap[id] === true };
  });
}

const MOCK_PLUGINS = ["frontend-design@anthropic", "docx@anthropic"];

class SkillsPanel {
  constructor(context) {
    this._panel = vscode.window.createWebviewPanel(
      "skillsPanel",
      "Claude Code Plugin Toggler",
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    const panelHtml = path.join(
      context.extensionPath,
      "webview",
      "panel.html"
    );
    this._panel.webview.html = fs.readFileSync(panelHtml, "utf8");

    this._panel.webview.onDidReceiveMessage(
      (msg) => this._onMessage(msg),
      undefined,
      context.subscriptions
    );

    this._refresh();
  }

  _projectRoot() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return null;
    return folders[0].uri.fsPath;
  }

  _refresh() {
    const projectRoot = this._projectRoot();
    if (!projectRoot) {
      this._panel.webview.postMessage({
        type: "error",
        message: "No workspace folder open.",
      });
      return;
    }

    try {
      let pluginIds = loadInstalledPlugins();
      const mock = pluginIds === null;
      if (mock) pluginIds = MOCK_PLUGINS;

      const settings = loadSettingsLocal(projectRoot);
      const plugins = mergePlugins(pluginIds, settings);

      this._panel.webview.postMessage({
        type: "load",
        plugins,
        projectRoot,
        mock,
      });
    } catch (e) {
      this._panel.webview.postMessage({ type: "error", message: e.message });
    }
  }

  async _onMessage(msg) {
    if (msg.type !== "toggle") return;

    const { id, enabled } = msg;
    const label = enabled ? "enabled" : "disabled";
    const answer = await vscode.window.showWarningMessage(
      `Set "${id}" to ${label}?`,
      "Yes",
      "No"
    );

    if (answer === "Yes") {
      const projectRoot = this._projectRoot();
      if (projectRoot) {
        const settings = loadSettingsLocal(projectRoot);
        if (!settings.enabledPlugins) settings.enabledPlugins = {};
        settings.enabledPlugins[id] = enabled;
        saveSettingsLocal(projectRoot, settings);
      }
    }
    this._refresh();
  }
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "claude-code-plugin-toggler.manage",
      () => new SkillsPanel(context)
    )
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
