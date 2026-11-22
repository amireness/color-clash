import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { roomSocketPath } from "./room-protocol";

const contentTypes: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

/** With no client directory, HTTP serves health checks while Vite handles the page. */
export function createWebServer(clientDirectory?: string) {
  const root = clientDirectory && resolve(clientDirectory);
  // Fail startup if the production frontend was not built.
  const index = root && readFileSync(resolve(root, "index.html"));

  return createServer(async (request, response) => {
    function send(
      status: number,
      body: string | Buffer,
      type = "text/plain; charset=utf-8",
      cache = "no-store",
    ) {
      response.writeHead(status, {
        "Content-Type": type,
        "Content-Length": Buffer.byteLength(body),
        "Cache-Control": cache,
        "X-Content-Type-Options": "nosniff",
      });
      response.end(request.method === "HEAD" ? undefined : body);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      return send(405, "Method not allowed");
    }

    let pathname: string;
    try {
      pathname = decodeURIComponent((request.url ?? "/").split("?", 1)[0]);
    } catch {
      return send(400, "Invalid path");
    }
    if (
      !pathname.startsWith("/") ||
      pathname.includes("\\") ||
      pathname.includes("\0") ||
      pathname.split("/").some((part) => part === ".." || part.startsWith("."))
    ) {
      return send(400, "Invalid path");
    }

    if (pathname === "/healthz") return send(200, "ok\n");
    if (pathname === roomSocketPath)
      return send(426, "WebSocket upgrade required");
    if (!root || !index) return send(404, "Not found");

    const extension = extname(pathname).toLowerCase();
    const isAsset = pathname === "/assets" || pathname.startsWith("/assets/");
    // Reserved asset paths and missing file requests must not receive the app shell.
    if (pathname === "/index.html" || (!extension && !isAsset)) {
      return send(200, index, contentTypes[".html"], "no-cache");
    }

    const file = resolve(root, "." + pathname);
    const location = relative(root, file);
    if (
      location === ".." ||
      location.startsWith(".." + sep) ||
      isAbsolute(location)
    )
      return send(400, "Invalid path");
    try {
      const body = await readFile(file);
      send(
        200,
        body,
        contentTypes[extension] ?? "application/octet-stream",
        "no-cache",
      );
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR" || code === "EISDIR")
        return send(404, "Not found");
      send(500, "Unable to serve the requested file");
    }
  });
}
