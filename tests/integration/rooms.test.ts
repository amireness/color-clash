import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { afterEach, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createRoomService } from "../../src/application/rooms";
import type { RoomView } from "../../src/application/online-game";
import { inMemoryRooms } from "../../src/infrastructure/room-memory";
import { roomSocketPath } from "../../src/infrastructure/room-protocol";
import type {
  ClientMessage,
  ServerMessage,
} from "../../src/infrastructure/room-protocol";
import { serveRooms } from "../../src/infrastructure/room-server";

let server: ReturnType<typeof serveRooms> | undefined;
afterEach(async () => {
  if (!server) return;
  for (const socket of server.clients) socket.terminate();
  await new Promise<void>((resolve, reject) =>
    server!.close((error) => (error ? reject(error) : resolve())),
  );
  server = undefined;
});

async function fixture(next = () => 0.999) {
  const service = createRoomService({
    store: inMemoryRooms(),
    makeCode: () => "QWERTY",
    makeToken: () => randomBytes(32).toString("base64url"),
    random: { next },
    now: () => 0,
    ttlMs: 60_000,
  });
  server = serveRooms(service, { host: "127.0.0.1", port: 0 });
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Expected a TCP address");

  return async function connect() {
    const socket = new WebSocket(
      "ws://127.0.0.1:" + address.port + roomSocketPath,
    );
    let queue: ServerMessage[] = [];
    let wait: (() => void) | undefined;
    socket.on("message", (raw) => {
      queue.push(JSON.parse(raw.toString()));
      wait?.();
    });
    await once(socket, "open");
    async function next<T extends ServerMessage["type"]>(
      type: T,
      filter: (message: Extract<ServerMessage, { type: T }>) => boolean = () =>
        true,
    ) {
      for (;;) {
        const index = queue.findIndex(
          (message) =>
            message.type === type &&
            filter(message as Extract<ServerMessage, { type: T }>),
        );
        if (index >= 0) {
          const message = queue[index] as Extract<ServerMessage, { type: T }>;
          queue = queue.slice(index + 1);
          return message;
        }
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("No socket " + type + " message")),
            2000,
          );
          wait = () => {
            wait = undefined;
            clearTimeout(timeout);
            resolve();
          };
        });
      }
    }
    return {
      socket,
      next,
      send: (message: ClientMessage | Record<string, unknown>) =>
        socket.send(JSON.stringify(message)),
      view: async (filter: (view: RoomView) => boolean = () => true) =>
        (await next("view", ({ room }) => filter(room))).room,
    };
  };
}

it("creates, joins and starts a room, protects hands, serializes moves and resumes the same seat", async () => {
  const connect = await fixture();
  const host = await connect();
  const guest = await connect();
  const stranger = await connect();

  stranger.send({ type: "join", code: "XXXXXX", name: "Stranger" });
  expect((await stranger.next("error")).message).toMatch(/not found/);
  stranger.send({ type: "action", revision: 1, action: { type: "start" } });
  expect((await stranger.next("error")).message).toMatch(/Join a room/);

  host.send({ type: "create", name: "Host" });
  const hostSeat = (await host.next("seat")).credential;
  const initial = await host.view();
  expect(initial.code).toMatch(/^[A-Z2-9]{6}$/);
  expect(JSON.stringify(initial)).not.toContain(hostSeat.token);
  stranger.send({
    type: "resume",
    credential: { code: initial.code, token: "x".repeat(43) },
  });
  expect((await stranger.next("error")).terminal).toBe(true);
  guest.send({ type: "join", code: initial.code.toLowerCase(), name: "Guest" });
  const guestSeat = (await guest.next("seat")).credential;
  const lobby = await guest.view();
  expect(lobby.seats.map(({ name, ready }) => [name, ready])).toEqual([
    ["Host", false],
    ["Guest", false],
  ]);
  expect(JSON.stringify(lobby)).not.toContain(guestSeat.token);
  await host.view((view) => view.revision === lobby.revision);

  guest.send({
    type: "action",
    revision: lobby.revision,
    action: { type: "start" },
  });
  expect((await guest.next("error")).message).toMatch(/Only the host/);
  host.send({
    type: "action",
    revision: lobby.revision,
    action: { type: "ready", ready: true },
  });
  const hostReady = await guest.view((view) => view.revision > lobby.revision);
  guest.send({
    type: "action",
    revision: hostReady.revision,
    action: { type: "ready", ready: true },
  });
  const ready = await host.view((view) =>
    view.seats.every((seat) => seat.ready),
  );
  host.send({
    type: "action",
    revision: ready.revision,
    action: { type: "start" },
  });
  const first = await host.view((view) => Boolean(view.match));
  const second = await guest.view((view) => Boolean(view.match));
  expect(first.match?.hand).toHaveLength(7);
  expect(second.match?.hand).toHaveLength(7);
  for (const card of second.match!.hand)
    expect(JSON.stringify(first)).not.toContain(card.id);

  guest.send({
    type: "action",
    revision: first.revision,
    action: { type: "draw", playerId: first.viewerId },
  });
  expect((await guest.next("error")).message).toBe("wrong-player");
  const move = {
    type: "action",
    revision: first.revision,
    action: { type: "play", cardId: first.match!.actions.playableIds[0] },
  } as const;
  host.send(move);
  host.send(move);
  const played = await host.view((view) => view.revision > first.revision);
  expect((await host.next("error")).message).toMatch(/room changed/);
  const synchronized = await guest.view(
    (view) => view.revision === played.revision,
  );
  expect(synchronized.match?.discard.id).toBe(move.action.cardId);
  expect(synchronized.match?.players[0].count).toBe(6);
  expect(synchronized.match?.current.id).toBe(second.viewerId);

  guest.socket.close();
  await host.view((view) => view.seats.some((seat) => !seat.connected));
  const resumed = await connect();
  resumed.send({ type: "resume", credential: guestSeat });
  await resumed.next("seat");
  const restored = await resumed.view();
  expect(restored.viewerId).toBe(second.viewerId);
  expect(restored.match?.hand).toEqual(second.match?.hand);
  resumed.send({
    type: "action",
    revision: restored.revision,
    action: { type: "end-and-score" },
  });
  const scored = await host.view((view) => view.match?.phase === "finished");
  expect(scored.match?.result).toEqual({
    reason: "early-score",
    winnerIds: [first.viewerId],
  });
  expect(scored.match?.summary).toMatchObject({
    turns: 1,
    played: 1,
    drawn: 0,
    durationMs: 0,
    players: [
      { id: first.viewerId, remaining: 6, played: 1, drawn: 0 },
      { id: second.viewerId, remaining: 7, played: 0, drawn: 0 },
    ],
  });
  resumed.send({ type: "leave" });
  const left = await host.view((view) =>
    view.seats.some((seat) => !seat.connected),
  );
  expect(left.match?.result).toEqual(scored.match?.result);
  stranger.send({ type: "resume", credential: guestSeat });
  expect((await stranger.next("error")).terminal).toBe(true);
});

it("synchronizes an opted-in batch and a pending stack across reconnect, rejecting invalid or stale requests", async () => {
  let swaps = 0;
  const connect = await fixture(() =>
    ++swaps === 84 ? 7.25 / 25 : swaps === 85 ? 6.25 / 24 : 0.999,
  );
  const host = await connect();
  const guest = await connect();
  host.send({ type: "create", name: "Host" });
  const hostSeat = (await host.next("seat")).credential;
  guest.send({ type: "join", code: hostSeat.code, name: "Guest" });
  const guestSeat = (await guest.next("seat")).credential;
  const lobby = await host.view((view) => view.seats.length === 2);
  host.send({
    type: "action",
    revision: lobby.revision,
    action: { type: "ready", ready: true },
  });
  const guestReady = await guest.view((view) => view.revision > lobby.revision);
  guest.send({
    type: "action",
    revision: guestReady.revision,
    action: { type: "ready", ready: true },
  });
  const ready = await host.view((view) =>
    view.seats.every((seat) => seat.ready),
  );
  host.send({
    type: "action",
    revision: ready.revision,
    action: { type: "start", identicalNumbers: true },
  });
  const dealt = await host.view((view) => Boolean(view.match));
  expect(dealt.match?.identicalNumbers).toBe(true);
  const ids = dealt.match!.actions.groups[0];
  host.send({
    type: "action",
    revision: dealt.revision,
    action: { type: "play-batch", cardIds: [ids[0], 3] },
  });
  expect((await host.next("error")).message).toBe("Invalid request.");
  host.send({
    type: "action",
    revision: dealt.revision,
    action: { type: "play-batch", cardIds: [ids[0], ids[0]] },
  });
  expect((await host.next("error")).message).toBe("illegal-batch");
  host.send({
    type: "action",
    revision: dealt.revision,
    action: { type: "play-batch", cardIds: ids },
  });
  const batch = await guest.view(
    (view) => view.revision === dealt.revision + 1,
  );
  expect(batch.events.filter((event) => event.type === "played")).toHaveLength(
    2,
  );
  expect(batch.match?.discard.id).toBe(ids.at(-1));
  guest.send({
    type: "action",
    revision: batch.revision,
    action: { type: "play", cardId: "red-draw-two-1" },
  });
  const penalty = await host.view((view) => view.match?.penalty?.count === 2);
  host.send({
    type: "action",
    revision: penalty.revision,
    action: { type: "draw" },
  });
  expect((await host.next("error")).message).toBe("illegal-action");
  host.send({
    type: "action",
    revision: penalty.revision,
    action: { type: "play", cardId: "red-draw-two-0" },
  });
  const stacked = await guest.view((view) => view.match?.penalty?.count === 4);
  expect(stacked.match?.actions.canAcceptPenalty).toBe(true);
  expect(stacked.match?.actions.canDraw).toBe(false);
  expect(stacked.events).toContainEqual({
    type: "stacked",
    playerId: dealt.viewerId,
    count: 4,
  });
  guest.socket.close();
  await host.view((view) => view.seats.some((seat) => !seat.connected));
  const resumed = await connect();
  resumed.send({ type: "resume", credential: guestSeat });
  await resumed.next("seat");
  const restored = await resumed.view();
  expect(restored.match?.penalty).toEqual(stacked.match?.penalty);
  expect(restored.match?.hand).toEqual(stacked.match?.hand);
  const accept = {
    type: "action",
    revision: restored.revision,
    action: { type: "accept-penalty" },
  } as const;
  resumed.send(accept);
  resumed.send(accept);
  const next = await resumed.view(
    (view) => view.revision === restored.revision + 1,
  );
  expect(next.match?.penalty).toBeUndefined();
  expect(next.match?.hand).toHaveLength(stacked.match!.hand.length + 4);
  const other = await host.view((view) => view.revision === next.revision);
  expect(
    other.match?.players.find(({ id }) => id === next.viewerId)?.count,
  ).toBe(next.match?.hand.length);
  expect(other.events).toContainEqual({
    type: "drew",
    count: 4,
    playerId: restored.viewerId,
    penalty: 4,
  });
  expect((await resumed.next("error")).message).toMatch(/room changed/);
});
