const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const os = require("os");

function _mockPlugins() {
  return {
    local: [
      { id: "ceh-dev-tools@ceh-plugins", version: "1.1.0", installPath: "" },
    ],
    global: [
      { id: "frontend-design@anthropic", version: "2.0.1", installPath: "" },
    ],
    mock: true,
  };
}

function loadInstalledPlugins(projectRoot) {
  const installedPath = path.join(
    os.homedir(),
    ".claude",
    "plugins",
    "installed_plugins.json"
  );
  if (!fs.existsSync(installedPath)) return _mockPlugins();

  try {
    const raw = JSON.parse(fs.readFileSync(installedPath, "utf8"));
    const normProject = path.resolve(projectRoot);
    const local = [],
      global_ = [];

    for (const [pluginId, entries] of Object.entries(raw)) {
      let localEntry = null,
        globalEntry = null;

      for (const entry of entries) {
        const isLocal = entry.scope === "local";
        const entryProject = entry.projectPath
          ? path.resolve(entry.projectPath)
          : null;
        const matchesProject = entryProject === normProject;

        if (isLocal && matchesProject) {
          localEntry = entry;
          break;
        }
        if (!isLocal && !globalEntry) globalEntry = entry;
        // local-scoped entries for OTHER projects are intentionally ignored
      }

      if (localEntry) {
        local.push({
          id: pluginId,
          version: localEntry.version || "",
          installPath: localEntry.installPath || "",
        });
      } else if (globalEntry) {
        global_.push({
          id: pluginId,
          version: globalEntry.version || "",
          installPath: globalEntry.installPath || "",
        });
      }
    }

    return { local, global: global_ };
  } catch (e) {
    throw new Error(
      `Failed to parse installed_plugins.json: ${e.message}`
    );
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

function parseSkillFrontmatter(text, fallbackName) {
  const fmMatch = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) return { name: fallbackName, description: "" };
  const fm = fmMatch[1];

  const nameMatch = fm.match(/^name:\s*(.+)$/m);
  const name = nameMatch ? nameMatch[1].trim() : fallbackName;

  const descBlockMatch = fm.match(
    /^description:\s*(?:>-|>|[|][-]?)?\s*\n([\s\S]*?)(?=\n\S|\s*$)/m
  );
  let description = "";
  if (descBlockMatch) {
    description = descBlockMatch[1]
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join(" ");
  } else {
    const descInlineMatch = fm.match(/^description:\s*(.+)$/m);
    if (descInlineMatch) description = descInlineMatch[1].trim();
  }

  return { name, description };
}

function loadPluginSkills(installPath) {
  if (!installPath) return [];
  const skillsDir = path.join(installPath, "skills");
  if (!fs.existsSync(skillsDir)) return [];

  return fs
    .readdirSync(skillsDir)
    .filter((name) => fs.statSync(path.join(skillsDir, name)).isDirectory())
    .sort()
    .map((folderName) => {
      const skillMd = path.join(skillsDir, folderName, "SKILL.md");
      if (!fs.existsSync(skillMd)) return { name: folderName, description: "" };
      const text = fs.readFileSync(skillMd, "utf8");
      return parseSkillFrontmatter(text, folderName);
    });
}

function loadPluginAgents(installPath) {
  if (!installPath) return [];
  const agentsDir = path.join(installPath, "agents");
  if (!fs.existsSync(agentsDir)) return [];

  return fs
    .readdirSync(agentsDir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => {
      const stem = path.basename(f, ".md");
      const text = fs.readFileSync(path.join(agentsDir, f), "utf8");
      return parseSkillFrontmatter(text, stem);
    });
}

function buildPluginList(raw, enabledMap) {
  function build(entry, pluginScope) {
    const atIdx = entry.id.indexOf("@");
    const name = atIdx === -1 ? entry.id : entry.id.slice(0, atIdx);
    const marketplace = atIdx === -1 ? "" : entry.id.slice(atIdx + 1);
    const result = {
      id: entry.id,
      name,
      marketplace,
      version: entry.version || "",
      pluginScope,
      skills: loadPluginSkills(entry.installPath),
      agents: loadPluginAgents(entry.installPath),
    };
    if (pluginScope === "local") result.enabled = enabledMap[entry.id] ?? true;
    return result;
  }
  return {
    local: raw.local.map((e) => build(e, "local")),
    global: raw.global.map((e) => build(e, "global")),
  };
}

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
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) this._refresh(webviewView.webview);
    });
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
      const raw = loadInstalledPlugins(projectRoot);
      const isMock = raw.mock || false;
      const settings = loadSettingsLocal(projectRoot);
      const plugins = buildPluginList(
        { local: raw.local || [], global: raw.global || [] },
        settings.enabledPlugins || {}
      );
      webview.postMessage({ type: "load", plugins, projectRoot, mock: isMock });
    } catch (e) {
      webview.postMessage({ type: "error", message: e.message });
    }
  }

  _onMessage(webview, msg) {
    if (msg.type !== "toggle") return;

    const { id, enabled } = msg;
    const projectRoot = this._projectRoot();
    if (!projectRoot) return;

    // Guard: only local plugins can be toggled
    const raw = loadInstalledPlugins(projectRoot);
    const localIds = new Set((raw.local || []).map((e) => e.id));
    if (!localIds.has(id)) return;

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
