import { randomBytes, randomInt } from "node:crypto";
import { createRoomService } from "../application/rooms";
import { inMemoryRooms } from "../infrastructure/room-memory";
import { serveRooms } from "../infrastructure/room-server";
import { createWebServer } from "../infrastructure/web-server";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const rooms = createRoomService({
  store: inMemoryRooms(),
  random: { next: () => randomInt(2 ** 32) / 2 ** 32 },
  makeCode: () =>
    Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join(
      "",
    ),
  makeToken: () => randomBytes(32).toString("base64url"),
  now: Date.now,
  ttlMs: 60 * 60 * 1000,
});
const production = process.argv.includes("--production");
const host = production ? "0.0.0.0" : "127.0.0.1";
const port = Number(
  (production ? process.env.PORT : process.env.ROOM_PORT) ?? 8787,
);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Expected a port from 1 through 65535.");
const server = createWebServer(production ? "dist" : undefined);
serveRooms(rooms, server);
server.listen(port, host, () => {
  process.stdout.write(
    `Color Clash ${production ? "web" : "room"} server listening at http://${host}:${port}\n`,
  );
});
