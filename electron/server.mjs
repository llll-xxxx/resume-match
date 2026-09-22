import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { app } from "electron";

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function assetBinding(clientRoot) {
  const resolvedRoot = path.resolve(clientRoot);
  return {
    async fetch(request) {
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(request.url).pathname);
      } catch {
        return new Response("Bad request", { status: 400 });
      }
      const candidate = path.resolve(resolvedRoot, `.${pathname}`);
      if (candidate !== resolvedRoot && !candidate.startsWith(`${resolvedRoot}${path.sep}`)) {
        return new Response("Forbidden", { status: 403 });
      }
      if (!existsSync(candidate) || !statSync(candidate).isFile()) return new Response("Not found", { status: 404 });
      const stat = statSync(candidate);
      const headers = new Headers({
        "content-length": String(stat.size),
        "content-type": contentTypes.get(path.extname(candidate).toLowerCase()) || "application/octet-stream",
      });
      if (pathname.startsWith("/_next/static/")) headers.set("cache-control", "public, max-age=31536000, immutable");
      if (request.method === "HEAD") return new Response(null, { status: 200, headers });
      return new Response(Readable.toWeb(createReadStream(candidate)), { status: 200, headers });
    },
  };
}

async function requestBody(request) {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function copyHeaders(response, target) {
  response.headers.forEach((value, name) => target.setHeader(name, value));
  const cookies = response.headers.getSetCookie?.();
  if (cookies?.length) target.setHeader("set-cookie", cookies);
}

export async function startApplicationServer() {
  const appRoot = app.getAppPath();
  const serverRoot = path.join(appRoot, "dist", "server");
  const clientRoot = path.join(appRoot, "dist", "client");
  const workerPath = path.join(serverRoot, "index.js");
  if (!existsSync(workerPath)) throw new Error("缺少桌面应用构建文件，请先运行 npm run build");
  const worker = (await import(pathToFileURL(workerPath).href)).default;
  const assets = assetBinding(clientRoot);
  const server = createServer(async (incoming, outgoing) => {
    try {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const url = new URL(incoming.url || "/", `http://127.0.0.1:${port}`);
      const body = await requestBody(incoming);
      const request = new Request(url, {
        method: incoming.method,
        headers: incoming.headers,
        ...(body?.length ? { body } : {}),
      });
      const response = await worker.fetch(request, { ASSETS: assets }, {});
      outgoing.statusCode = response.status;
      outgoing.statusMessage = response.statusText;
      copyHeaders(response, outgoing);
      if (!response.body) return outgoing.end();
      Readable.fromWeb(response.body).pipe(outgoing);
    } catch (error) {
      console.error("ResumeMatch 本地服务错误：", error);
      if (!outgoing.headersSent) outgoing.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      outgoing.end("ResumeMatch 本地服务发生错误");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("无法确定本地服务地址");
  return {
    url: new URL(`http://127.0.0.1:${address.port}/`),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
