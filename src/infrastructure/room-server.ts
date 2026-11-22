import { WebSocket, WebSocketServer } from "ws";
import type { Server } from "node:http";
import type { createRoomService, SeatCredential } from "../application/rooms";
import type { RoomView } from "../application/online-game";
import { decodeClientMessage, roomSocketPath } from "./room-protocol";
import type { ServerMessage } from "./room-protocol";

export function serveRooms(
  rooms: ReturnType<typeof createRoomService>,
  httpServer: Server,
) {
  const server = new WebSocketServer({
    server: httpServer,
    path: roomSocketPath,
    maxPayload: 4096,
    verifyClient: (({ origin, req }) => {
      if (!origin) return true;
      try {
        return new URL(origin).host === req.headers.host;
      } catch {
        return false;
      }
    }) satisfies WebSocket.VerifyClientCallbackSync,
  });
  const claims = new Map<WebSocket, SeatCredential>();
  const active = new Map<string, WebSocket>();
  const alive = new WeakSet<WebSocket>();

  function send(socket: WebSocket, message: ServerMessage) {
    if (socket.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify(message));
  }

  function publish(code: string, events?: RoomView["events"]) {
    for (const [socket, credential] of claims) {
      if (credential.code !== code) continue;
      const room = rooms.snapshot(credential, events);
      if (room) send(socket, { type: "view", room });
    }
  }

  function bind(socket: WebSocket, credential: SeatCredential) {
    const previous = active.get(credential.token);
    if (previous) {
      // Remove the old claim first so its close event cannot mark the replacement offline.
      claims.delete(previous);
      send(previous, {
        type: "error",
        message: "This seat was opened in another session.",
        terminal: true,
      });
      previous.close(1000, "Seat moved");
    }
    active.set(credential.token, socket);
    claims.set(socket, credential);
    send(socket, { type: "seat", credential });
    publish(credential.code);
  }

  server.on("connection", (socket) => {
    alive.add(socket);
    socket.on("pong", () => alive.add(socket));
    socket.on("error", () => socket.terminate());
    let windowStart = Date.now();
    let messages = 0;
    socket.on("message", (raw, binary) => {
      if (Date.now() - windowStart >= 1000) {
        windowStart = Date.now();
        messages = 0;
      }
      if (++messages > 30) {
        socket.close(1008, "Too many messages");
        return;
      }
      let request;
      try {
        request = binary
          ? undefined
          : decodeClientMessage(JSON.parse(raw.toString()));
      } catch {
        /* malformed JSON */
      }
      if (!request) {
        send(socket, { type: "error", message: "Invalid request." });
        return;
      }
      const credential = claims.get(socket);
      if (!credential) {
        if (request.type === "resume") {
          if (rooms.setConnected(request.credential, true))
            bind(socket, request.credential);
          else
            send(socket, {
              type: "error",
              message: "That seat or room has expired.",
              terminal: true,
            });
          return;
        }
        if (request.type === "create" || request.type === "join") {
          const result =
            request.type === "create"
              ? rooms.create(request.name)
              : rooms.join(request.code, request.name);
          if (result.ok) bind(socket, result.value);
          else send(socket, { type: "error", message: result.error });
          return;
        }
        send(socket, {
          type: "error",
          message: "Join a room before taking an action.",
        });
        return;
      }

      if (request.type === "leave") {
        claims.delete(socket);
        active.delete(credential.token);
        rooms.leave(credential);
        publish(credential.code);
        socket.close(1000, "Left room");
      } else if (request.type === "action") {
        const outcome = rooms.act(credential, request.revision, request.action);
        if (outcome.ok) publish(credential.code, outcome.value);
        else {
          const room = rooms.snapshot(credential);
          if (room) send(socket, { type: "view", room });
          send(socket, { type: "error", message: outcome.error });
        }
      } else {
        send(socket, {
          type: "error",
          message: "This connection already has a seat.",
        });
      }
    });
    socket.on("close", () => {
      const credential = claims.get(socket);
      if (!credential) return;
      claims.delete(socket);
      active.delete(credential.token);
      if (rooms.setConnected(credential, false)) publish(credential.code);
    });
  });

  const heartbeat = setInterval(() => {
    const expired = new Set(rooms.expireInactive());
    for (const socket of server.clients) {
      const credential = claims.get(socket);
      if (credential && expired.has(credential.code)) {
        send(socket, {
          type: "error",
          message: "This room expired due to inactivity.",
          terminal: true,
        });
        socket.close(1000, "Room expired");
      } else if (!alive.delete(socket)) socket.terminate();
      else if (socket.readyState === WebSocket.OPEN) socket.ping();
    }
  }, 15_000);
  server.on("close", () => clearInterval(heartbeat));
  return server;
}
