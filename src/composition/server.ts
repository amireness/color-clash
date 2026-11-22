import { randomBytes, randomInt } from "node:crypto";
import { createRoomService } from "../application/rooms";
import { inMemoryRooms } from "../infrastructure/room-memory";
import { serveRooms } from "../infrastructure/room-server";

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
const host = "127.0.0.1";
const port = Number(process.env.ROOM_PORT ?? 8787);
serveRooms(rooms, { host, port }).on("listening", () => {
  process.stdout.write(
    `Color Clash room server at ws://${host}:${port}/color-clash-ws\n`,
  );
});
