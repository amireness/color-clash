import type { RoomAction, RoomView } from "../application/online-game";
import type { SeatCredential } from "../application/rooms";
import { colors } from "../domain/model";

export const roomSocketPath = "/color-clash-ws";
export type ClientMessage =
  | { type: "create"; name: string }
  | { type: "join"; code: string; name: string }
  | { type: "resume"; credential: SeatCredential }
  | { type: "action"; revision: number; action: RoomAction }
  | { type: "leave" };
export type ServerMessage =
  | { type: "seat"; credential: SeatCredential }
  | { type: "view"; room: RoomView }
  | { type: "error"; message: string; terminal?: boolean };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isCredential(value: unknown): value is SeatCredential {
  return (
    record(value) &&
    typeof value.code === "string" &&
    /^[A-Z2-9]{6}$/.test(value.code) &&
    typeof value.token === "string" &&
    /^[A-Za-z0-9_-]{43}$/.test(value.token)
  );
}

function decodeAction(value: unknown): RoomAction | undefined {
  if (!record(value)) return;
  const { type, ready, cardId, cardIds, color, identicalNumbers } = value;
  switch (type) {
    case "ready":
      if (typeof ready === "boolean") return { type, ready };
      return;
    case "play":
      if (typeof cardId === "string" && cardId.length <= 40)
        return { type, cardId };
      return;
    case "play-batch":
      if (
        Array.isArray(cardIds) &&
        cardIds.every(
          (id): id is string => typeof id === "string" && id.length <= 40,
        )
      )
        return { type, cardIds };
      return;
    case "choose-color": {
      const selected = colors.find((entry) => entry === color);
      if (selected) return { type, color: selected };
      return;
    }
    case "start":
      if (
        identicalNumbers === undefined ||
        typeof identicalNumbers === "boolean"
      )
        return { type, identicalNumbers };
      return;
    case "accept-penalty":
    case "draw":
    case "advance":
    case "restart":
    case "end-and-score":
      return { type };
  }
}

export function decodeClientMessage(value: unknown): ClientMessage | undefined {
  if (!record(value)) return;
  const { type, name, code, credential, revision, action } = value;
  if (type === "leave") return { type };
  if (type === "create" && typeof name === "string") return { type, name };
  if (type === "join" && typeof name === "string" && typeof code === "string")
    return { type, name, code };
  if (type === "resume" && isCredential(credential))
    return { type, credential };
  if (
    type === "action" &&
    typeof revision === "number" &&
    Number.isSafeInteger(revision)
  ) {
    const move = decodeAction(action);
    if (move) return { type, revision, action: move };
  }
}
