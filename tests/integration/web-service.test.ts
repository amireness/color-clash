import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createWebServer } from "../../src/infrastructure/web-server";

it("serves production assets, refresh routes, and health without masking missing files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "color-clash-web-test-"));
  const index = '<div id="root">Color Clash</div>';
  await mkdir(join(directory, "assets"));
  await writeFile(join(directory, "index.html"), index);
  await writeFile(join(directory, "assets", "app.js"), "export {};");
  const server = createWebServer(directory);
  server.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Expected TCP listener");
    const base = "http://127.0.0.1:" + address.port;

    const health = await fetch(base + "/healthz");
    expect(health.status).toBe(200);
    expect(await health.text()).toBe("ok\n");
    for (const path of ["/", "/index.html", "/rooms/lobby?room=ABCDE2"]) {
      const response = await fetch(base + path);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(await response.text()).toBe(index);
    }
    const asset = await fetch(base + "/assets/app.js");
    expect(asset.headers.get("content-type")).toContain("text/javascript");
    expect(await asset.text()).toBe("export {};");
    const head = await fetch(base + "/assets/app.js", { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect((await fetch(base + "/assets/missing.js")).status).toBe(404);
    expect((await fetch(base + "/color-clash-ws")).status).toBe(426);
    expect((await fetch(base + "/", { method: "POST" })).status).toBe(405);
    const unsafe = await new Promise<number | undefined>((resolve, reject) => {
      request(
        {
          hostname: "127.0.0.1",
          port: address.port,
          path: "/%2e%2e/package.json",
        },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      )
        .on("error", reject)
        .end();
    });
    expect(unsafe).toBe(400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
