import type { Card, GameEvent } from "../domain/model";

/** Public command feedback. Draws deliberately carry counts only. */
export type PublicEvent =
  | { type: "started" }
  | { type: "reversed" }
  | { type: "played"; playerId: string; card: Card }
  | { type: "drew"; playerId: string; count: number; penalty?: number }
  | { type: "stacked"; playerId: string; count: number }
  | { type: "skipped"; playerId: string }
  | { type: "turn"; playerId: string }
  | { type: "won"; playerId: string }
  | { type: "scored"; winnerIds: readonly string[] };

export function publicEvents(events: readonly GameEvent[]): PublicEvent[] {
  return events.map((event) => {
    switch (event.type) {
      case "played":
        return {
          type: event.type,
          playerId: event.playerId,
          card: { ...event.card },
        };
      case "drew":
        return {
          type: event.type,
          playerId: event.playerId,
          count: event.count,
          ...(event.penalty === undefined ? {} : { penalty: event.penalty }),
        };
      case "stacked":
        return {
          type: event.type,
          playerId: event.playerId,
          count: event.count,
        };
      case "skipped":
      case "turn":
      case "won":
        return { type: event.type, playerId: event.playerId };
      case "started":
      case "reversed":
        return { type: event.type };
      case "scored":
        return { type: event.type, winnerIds: [...event.winnerIds] };
    }
  });
}
