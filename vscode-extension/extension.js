const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

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

function normalisePath(p) {
  if (!p) return "";
  try {
    const resolved = path.resolve(p);
    // Windows: lowercase drive letter to normalise "C:\..." vs "c:\..."
    // UNC paths (\\server\share\...) are handled by the platform resolver.
    if (/^[A-Z]:/.test(resolved)) {
      return resolved[0].toLowerCase() + resolved.slice(1);
    }
    return resolved;
  } catch {
    return p;
  }
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
    const raw = JSON.parse(fs.readFileSync(installedPath, "utf8"))["plugins"];
    const normProject = normalisePath(projectRoot);
    const local = [],
      global_ = [];

    for (const [pluginId, entries] of Object.entries(raw)) {
      let localEntry = null,
        globalEntry = null;

      for (const entry of entries) {
        const isLocal = entry.scope === "local";
        const entryProject = entry.projectPath
          ? normalisePath(entry.projectPath)
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
    throw new Error(`Failed to parse installed_plugins.json: ${e.message}`);
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
    .filter((folderName) =>
      fs.existsSync(path.join(skillsDir, folderName, "SKILL.md"))
    )
    .map((folderName) => {
      const text = fs.readFileSync(
        path.join(skillsDir, folderName, "SKILL.md"),
        "utf8"
      );
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

function loadKnownMarketplaces() {
  const mp = path.join(
    os.homedir(),
    ".claude",
    "plugins",
    "known_marketplaces.json"
  );
  if (!fs.existsSync(mp)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(mp, "utf8"));
    return Object.entries(raw).map(([key, info]) => ({
      key,
      installLocation: info.installLocation || "",
      lastUpdated: info.lastUpdated || "",
    }));
  } catch {
    return [];
  }
}

function loadMarketplacePlugins(marketplaceKey, installLocation) {
  if (!installLocation)
    return { plugins: [], error: "installLocation is empty" };
  const mpJson = path.join(
    installLocation,
    ".claude-plugin",
    "marketplace.json"
  );
  if (!fs.existsSync(mpJson))
    return { plugins: [], error: `marketplace.json not found at ${mpJson}` };
  try {
    const raw = JSON.parse(fs.readFileSync(mpJson, "utf8"));
    const plugins = (raw.plugins || []).map((p) => ({
      name: p.name || "",
      description: p.description || "",
      version: p.version || "",
      author: (p.author || {}).name || "",
      keywords: p.keywords || [],
    }));
    return { plugins, error: null };
  } catch (e) {
    return {
      plugins: [],
      error: `Failed to parse marketplace.json: ${e.message}`,
    };
  }
}

async function runInstall(pluginId, projectRoot) {
  await execFileAsync(
    "claude",
    ["plugin", "install", pluginId, "--scope", "local"],
    { cwd: projectRoot, timeout: 60_000 }
  );
}

class SkillsViewProvider {
  static viewType = "skillsToggle.pluginList";

  constructor(extensionUri, context) {
    this._extensionUri = extensionUri;
    this._context = context;
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

    // File watchers — auto-refresh on settings or installed_plugins change
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      const settingsPattern = new vscode.RelativePattern(
        folders[0],
        ".claude/settings.local.json"
      );
      const installedPath = path.join(
        os.homedir(),
        ".claude",
        "plugins",
        "installed_plugins.json"
      );

      const settingsWatcher =
        vscode.workspace.createFileSystemWatcher(settingsPattern);
      const installedWatcher =
        vscode.workspace.createFileSystemWatcher(installedPath);

      const onchange = () => this._refresh(webviewView.webview);

      settingsWatcher.onDidChange(onchange);
      settingsWatcher.onDidCreate(onchange);
      settingsWatcher.onDidDelete(onchange);

      installedWatcher.onDidChange(onchange);
      installedWatcher.onDidCreate(onchange);
      installedWatcher.onDidDelete(onchange);

      this._context.subscriptions.push(settingsWatcher, installedWatcher);
    }
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
      let settings = loadSettingsLocal(projectRoot);

      // Case 2: plugins in installed_plugins.json but absent from settings → add enabled:true
      if (!isMock) {
        const enabledPlugins = settings.enabledPlugins || {};
        let changed = false;
        for (const entry of (raw.local || [])) {
          if (!(entry.id in enabledPlugins)) {
            enabledPlugins[entry.id] = true;
            changed = true;
          }
        }
        if (changed) {
          settings.enabledPlugins = enabledPlugins;
          saveSettingsLocal(projectRoot, settings);
        }
      }

      const plugins = buildPluginList(
        { local: raw.local || [], global: raw.global || [] },
        settings.enabledPlugins || {}
      );

      // Case 1: plugins in settings but not installed → show as orphans with install button
      const installedLocalIds = new Set((raw.local || []).map((e) => e.id));
      const orphans = Object.keys(settings.enabledPlugins || {})
        .filter((id) => !installedLocalIds.has(id))
        .map((id) => {
          const atIdx = id.indexOf("@");
          const name = atIdx === -1 ? id : id.slice(0, atIdx);
          const marketplace = atIdx === -1 ? "" : id.slice(atIdx + 1);
          return { id, name, marketplace, version: "", pluginScope: "local", skills: [], agents: [], installed: false };
        });
      plugins.local = [...plugins.local, ...orphans];

      const installedLocal = new Set((raw.local || []).map((e) => e.id));
      const installedGlobal = new Set((raw.global || []).map((e) => e.id));

      const marketplacesMeta = loadKnownMarketplaces();
      const marketplaces = marketplacesMeta.map((m) => {
        const { plugins: mpPlugins, error } = loadMarketplacePlugins(
          m.key,
          m.installLocation
        );
        const entry = { key: m.key, lastUpdated: m.lastUpdated };
        if (error) {
          entry.plugins = [];
          entry.error = error;
        } else {
          entry.plugins = mpPlugins.map((p) => {
            const pid = `${p.name}@${m.key}`;
            let installed = false,
              installedScope = null;
            if (installedLocal.has(pid)) {
              installed = true;
              installedScope = "local";
            } else if (installedGlobal.has(pid)) {
              installed = true;
              installedScope = "global";
            }
            return { ...p, marketplace: m.key, id: pid, installed, installedScope };
          });
        }
        return entry;
      });

      webview.postMessage({
        type: "load",
        plugins,
        marketplaces,
        projectRoot,
        mock: isMock,
      });
    } catch (e) {
      webview.postMessage({ type: "error", message: e.message });
    }
  }

  async _onMessage(webview, msg) {
    if (msg.type === "toggle") {
      const { id, enabled } = msg;
      const projectRoot = this._projectRoot();
      if (!projectRoot) return;

      const raw = loadInstalledPlugins(projectRoot);
      const localIds = new Set((raw.local || []).map((e) => e.id));
      if (!localIds.has(id)) return;

      const settings = loadSettingsLocal(projectRoot);
      if (!settings.enabledPlugins) settings.enabledPlugins = {};
      settings.enabledPlugins[id] = enabled;
      saveSettingsLocal(projectRoot, settings);
      this._refresh(webview);
    } else if (msg.type === "install") {
      const { id } = msg;
      const projectRoot = this._projectRoot();
      if (!projectRoot) return;

      const confirmed = await vscode.window.showWarningMessage(
        `Install "${id}" locally for this project?`,
        "Install",
        "Cancel"
      );
      if (confirmed !== "Install") {
        this._refresh(webview);
        return;
      }

      try {
        await runInstall(id, projectRoot);
        this._refresh(webview);
      } catch (err) {
        vscode.window.showErrorMessage(`Install failed: ${err.message}`);
        this._refresh(webview);
      }
    }
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
  const provider = new SkillsViewProvider(context.extensionUri, context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SkillsViewProvider.viewType,
      provider
    )
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
