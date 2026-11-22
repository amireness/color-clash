import type { GameEvent, MatchStatistics } from "./model";

export function startStatistics(at: number): MatchStatistics {
  return {
    startedAt: at,
    turns: 0,
    played: 0,
    drawn: 0,
    actions: 0,
    wilds: 0,
    byPlayer: {},
  };
}

/** Deals are excluded. A turn is counted when it advances or ends in a normal win. */
export function recordStatistics(
  previous: MatchStatistics,
  events: readonly GameEvent[],
  at: number,
): MatchStatistics {
  const byPlayer = { ...previous.byPlayer };
  const next = { ...previous, byPlayer };
  for (const event of events) {
    if (event.type === "turn" || event.type === "won") next.turns++;
    if (event.type === "played" || event.type === "drew") {
      const seat = byPlayer[event.playerId] ?? { played: 0, drawn: 0 };
      if (event.type === "played") {
        next.played++;
        if (!("color" in event.card)) next.wilds++;
        else if (event.card.kind !== "number") next.actions++;
        byPlayer[event.playerId] = { ...seat, played: seat.played + 1 };
      } else {
        next.drawn += event.count;
        byPlayer[event.playerId] = { ...seat, drawn: seat.drawn + event.count };
      }
    }
    if (event.type === "won" || event.type === "scored")
      next.endedAt = Math.max(next.startedAt, at);
  }
  return next;
}
