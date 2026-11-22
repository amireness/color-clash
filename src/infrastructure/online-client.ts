import type { OnlineGame, OnlineState } from "../application/online-game";
import type { SeatCredential } from "../application/rooms";
import { isCredential } from "./room-protocol";
import type { ClientMessage, ServerMessage } from "./room-protocol";

export function createOnlineClient(url: string, storage: Storage): OnlineGame {
  const key = "color-clash-seat:" + url;
  const listeners = new Set<() => void>();
  let state: OnlineState = { status: "idle" };
  let socket: WebSocket | undefined;
  let credential: SeatCredential | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function update(next: OnlineState) {
    state = next;
    for (const listener of listeners) listener();
  }

  function remember(next: SeatCredential | undefined) {
    credential = next;
    try {
      if (next) storage.setItem(key, JSON.stringify(next));
      else storage.removeItem(key);
    } catch {
      /* The current socket still works when browser storage is unavailable. */
    }
  }

  function shutdown() {
    clearTimeout(timer);
    const previous = socket;
    socket = undefined;
    previous?.close();
  }

  function connect(request: ClientMessage) {
    shutdown();
    const resuming = request.type === "resume";
    update({
      ...state,
      error: undefined,
      status: resuming ? "reconnecting" : "connecting",
      pending: false,
    });
    const connection = new WebSocket(url);
    socket = connection;
    connection.addEventListener("open", () => {
      if (socket === connection) connection.send(JSON.stringify(request));
    });
    connection.addEventListener("message", (event) => {
      if (socket !== connection) return;
      let message: ServerMessage;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === "seat") {
        if (isCredential(message.credential)) remember(message.credential);
      } else if (message.type === "view") {
        update({ status: "connected", room: message.room, pending: false });
      } else if (message.type === "error") {
        if (message.terminal) {
          remember(undefined);
          shutdown();
          update({ status: "idle", error: message.message });
        } else {
          update({
            ...state,
            status: credential ? "connected" : "idle",
            error: message.message,
            pending: false,
          });
        }
      }
    });
    connection.addEventListener("close", () => {
      if (socket !== connection) return;
      socket = undefined;
      if (credential) {
        update({ ...state, status: "reconnecting", pending: false });
        timer = setTimeout(() => {
          if (credential) connect({ type: "resume", credential });
        }, 1200);
      } else {
        update({
          status: "idle",
          error: state.error ?? "Could not connect to the room server.",
        });
      }
    });
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    restore() {
      if (socket || credential) return;
      try {
        const saved: unknown = JSON.parse(storage.getItem(key) ?? "null");
        if (isCredential(saved)) {
          remember(saved);
          connect({ type: "resume", credential: saved });
        }
      } catch {
        /* Nothing to restore. */
      }
    },
    create: (name) => connect({ type: "create", name }),
    join: (code, name) => connect({ type: "join", code, name }),
    send(action) {
      if (
        !socket ||
        socket.readyState !== WebSocket.OPEN ||
        !state.room ||
        state.pending
      )
        return;
      const request: ClientMessage = {
        type: "action",
        revision: state.room.revision,
        action,
      };
      socket.send(JSON.stringify(request));
      update({ ...state, error: undefined, pending: true });
    },
    leave() {
      if (socket?.readyState === WebSocket.OPEN) {
        const request: ClientMessage = { type: "leave" };
        socket.send(JSON.stringify(request));
      }
      remember(undefined);
      shutdown();
      update({ status: "idle" });
    },
  };
}
