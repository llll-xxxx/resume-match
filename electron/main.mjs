import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLocalDatabase } from "./database.mjs";
import { startApplicationServer } from "./server.mjs";

const electronDir = path.dirname(fileURLToPath(import.meta.url));
const localAppData = process.env.LOCALAPPDATA || app.getPath("appData");
const appRoot = path.join(localAppData, "ResumeMatch");
mkdirSync(appRoot, { recursive: true });
app.setPath("userData", path.join(appRoot, "runtime"));
const credentialsPath = path.join(appRoot, "api-credentials.json");
let applicationUrl;
let applicationServer;

let storage;
let mainWindow;
let stagedResumes;
let stagedProjects;

function flushStagedData() {
  if (!storage) return;
  if (Array.isArray(stagedResumes)) storage.saveResumes(stagedResumes);
  if (Array.isArray(stagedProjects)) storage.saveProjects(stagedProjects);
  stagedResumes = undefined;
  stagedProjects = undefined;
}

function revealMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.moveTop();
  mainWindow.focus();
  return true;
}

function isTrustedApplicationUrl(value) {
  try {
    return new URL(value).origin === applicationUrl.origin;
  } catch {
    return false;
  }
}

function trusted(event) {
  if (isTrustedApplicationUrl(event.senderFrame?.url || "")) return;
  throw new Error("拒绝来自未知页面的数据请求");
}

function openExternalUrl(value) {
  let target;
  try {
    target = new URL(value);
  } catch {
    return;
  }
  if (target.protocol === "https:" || target.protocol === "http:") void shell.openExternal(target.href);
}

function readEncryptedCredentials() {
  if (!existsSync(credentialsPath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(credentialsPath, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function credentialId(provider) {
  const value = String(provider || "");
  if (!/^[a-z0-9_-]{1,40}$/.test(value)) throw new Error("模型服务商无效");
  return value;
}

function loadApiKeys() {
  if (!safeStorage.isEncryptionAvailable()) return {};
  const encrypted = readEncryptedCredentials();
  return Object.fromEntries(Object.entries(encrypted).flatMap(([provider, value]) => {
    try {
      return typeof value === "string" ? [[provider, safeStorage.decryptString(Buffer.from(value, "base64"))]] : [];
    } catch {
      return [];
    }
  }));
}

function saveApiKey(provider, apiKey) {
  const id = credentialId(provider);
  const value = String(apiKey || "").trim();
  if (value.length < 8 || value.length > 512) throw new Error("API Key 格式无效");
  if (!safeStorage.isEncryptionAvailable()) throw new Error("当前系统无法使用安全凭据存储");
  const encrypted = readEncryptedCredentials();
  encrypted[id] = safeStorage.encryptString(value).toString("base64");
  writeFileSync(credentialsPath, JSON.stringify(encrypted), { encoding: "utf8", mode: 0o600 });
}

function deleteApiKey(provider) {
  const id = credentialId(provider);
  const encrypted = readEncryptedCredentials();
  delete encrypted[id];
  writeFileSync(credentialsPath, JSON.stringify(encrypted), { encoding: "utf8", mode: 0o600 });
}

function registerStorageHandlers() {
  const handle = (channel, operation) => ipcMain.handle(channel, (event, ...args) => {
    trusted(event);
    return operation(...args);
  });
  handle("storage:load", () => storage.load());
  handle("storage:save-resumes", (resumes) => storage.saveResumes(resumes));
  ipcMain.on("storage:stage-resumes", (event, resumes) => {
    trusted(event);
    if (!Array.isArray(resumes)) throw new Error("简历数据格式无效");
    stagedResumes = resumes;
  });
  handle("storage:save-projects", (projects) => storage.saveProjects(projects));
  ipcMain.on("storage:stage-projects", (event, projects) => {
    trusted(event);
    if (!Array.isArray(projects)) throw new Error("项目数据格式无效");
    stagedProjects = projects;
  });
  handle("storage:save-setting", (key, value) => storage.saveSetting(key, value));
  handle("credentials:load-api-keys", () => loadApiKeys());
  handle("credentials:save-api-key", (provider, apiKey) => saveApiKey(provider, apiKey));
  handle("credentials:delete-api-key", (provider) => deleteApiKey(provider));
  handle("storage:list-export-names", () => storage.listExportNames());
  handle("storage:record-export-name", (fileName) => storage.recordExportName(fileName));
  const defaultExportDirectory = path.join(app.getPath("documents"), "ResumeMatch", "Exports");
  handle("storage:info", () => ({ dataRoot: storage.dataRoot, databasePath: storage.databasePath, defaultExportDirectory }));
  handle("desktop:choose-export-directory", async (currentPath) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "选择简历导出文件夹",
      defaultPath: typeof currentPath === "string" && path.isAbsolute(currentPath) ? currentPath : defaultExportDirectory,
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0] || null;
  });
  handle("desktop:open-path", async (targetPath) => {
    if (typeof targetPath !== "string" || !path.isAbsolute(targetPath)) throw new Error("文件夹路径无效");
    mkdirSync(targetPath, { recursive: true });
    const error = await shell.openPath(targetPath);
    if (error) throw new Error(error);
  });
  handle("desktop:export-document", (directory, fileName, bytes) => {
    const targetDirectory = typeof directory === "string" && path.isAbsolute(directory) ? directory : defaultExportDirectory;
    const parsedName = path.parse(String(fileName));
    const safeStem = parsedName.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").trim() || "resume";
    mkdirSync(targetDirectory, { recursive: true });
    let candidate = `${safeStem}.docx`;
    let copy = 2;
    while (existsSync(path.join(targetDirectory, candidate))) candidate = `${safeStem} (${copy++}).docx`;
    const outputPath = path.join(targetDirectory, candidate);
    writeFileSync(outputPath, Buffer.from(bytes));
    storage.recordExportName(candidate);
    return { fileName: candidate, outputPath };
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    title: "ResumeMatch",
    width: 1500,
    height: 980,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: "#f3f5f9",
    show: false,
    webPreferences: {
      preload: path.join(electronDir, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.removeMenu();
  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    if (isTrustedApplicationUrl(targetUrl)) return;
    event.preventDefault();
    openExternalUrl(targetUrl);
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: "deny" };
  });
  mainWindow.once("ready-to-show", revealMainWindow);
  mainWindow.on("close", () => {
    try { flushStagedData(); } catch (error) { console.error("关闭前保存数据失败：", error); }
  });
  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });
  await mainWindow.loadURL(applicationUrl.href);
  const bridgeReady = await mainWindow.webContents.executeJavaScript("Boolean(window.resumeMatchDesktop)");
  if (!bridgeReady) throw new Error("本地数据接口未能加载");
  revealMainWindow();
  console.log(`ResumeMatch data: ${storage.databasePath}`);
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();
else {
  app.on("second-instance", () => {
    if (!revealMainWindow() && app.isReady()) void createWindow();
  });
  app.whenReady().then(() => {
    return process.env.RESUME_MATCH_DEV_URL
      ? { url: new URL(process.env.RESUME_MATCH_DEV_URL), close: async () => {} }
      : startApplicationServer();
  }).then((server) => {
    applicationServer = server;
    applicationUrl = server.url;
    storage = createLocalDatabase(path.join(appRoot, "data"));
    registerStorageHandlers();
    return createWindow();
  }).catch((error) => {
    console.error("ResumeMatch 启动失败：", error);
    dialog.showErrorBox("ResumeMatch 启动失败", error instanceof Error ? error.message : String(error));
    app.quit();
  });
  app.on("activate", () => {
    if (!revealMainWindow()) void createWindow();
  });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => {
    try { flushStagedData(); } catch (error) { console.error("退出前保存数据失败：", error); }
    storage?.close();
    void applicationServer?.close();
  });
}
