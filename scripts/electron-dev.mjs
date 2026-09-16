import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const electronCommand = require("electron");
const npmCli = process.env.npm_execpath || require.resolve("npm/bin/npm-cli.js");
const devUrl = "http://localhost:5173/";
let devServer;

async function serverIsReady() {
  try {
    const response = await fetch(devUrl);
    if (!response.ok) return false;
    const html = await response.text();
    return html.includes("ResumeMatch") || html.includes("/_next/") || html.includes("/@vite/client");
  } catch {
    return false;
  }
}

async function waitUntilReady() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (devServer?.exitCode !== null && devServer?.exitCode !== undefined) throw new Error("本地页面服务启动失败");
    if (await serverIsReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("等待本地页面服务超时");
}

let desktop;
try {
  if (!(await serverIsReady())) {
    devServer = spawn(process.execPath, [npmCli, "run", "dev", "--", "--port", "5173", "--strictPort"], { cwd: projectRoot, stdio: "inherit", windowsHide: true });
  } else {
    console.log(`复用本项目现有页面服务：${devUrl}`);
  }
  await waitUntilReady();
  desktop = spawn(electronCommand, ["electron/main.mjs"], {
    cwd: projectRoot,
    stdio: "inherit",
    env: { ...process.env, RESUME_MATCH_DEV_URL: devUrl },
  });
  const exitCode = await new Promise((resolve) => desktop.on("exit", (code) => resolve(code ?? 0)));
  process.exitCode = exitCode;
} finally {
  if (desktop && desktop.exitCode === null) desktop.kill();
  if (devServer?.exitCode === null) devServer.kill();
}
