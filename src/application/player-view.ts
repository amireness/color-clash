import { legalActions } from "../domain/engine";
import type { ActiveGame, Card } from "../domain/model";

export function projectTable(state: ActiveGame) {
  const { startedAt, endedAt, byPlayer, turns, played, drawn, actions, wilds } =
    state.statistics;
  return {
    phase: state.phase,
    result:
      state.phase === "finished"
        ? state.result.reason === "early-score"
          ? { ...state.result, winnerIds: [...state.result.winnerIds] }
          : { ...state.result }
        : undefined,
    players: state.players.map(({ id, name, hand }) => ({
      id,
      name,
      count: hand.length,
    })),
    current: {
      id: state.players[state.current].id,
      name: state.players[state.current].name,
    },
    direction: state.direction,
    turnNumber: state.turnNumber,
    identicalNumbers: state.identicalNumbers,
    penalty: state.penalty && { ...state.penalty },
    discard: { ...state.discard[0] } as Card,
    color: state.color,
    drawCount: state.drawPile.length,
    summary:
      endedAt === undefined
        ? undefined
        : {
            durationMs: endedAt - startedAt,
            turns,
            played,
            drawn,
            actions,
            wilds,
            players: state.players.map(({ id, name, hand }) => ({
              id,
              name,
              remaining: hand.length,
              played: byPlayer[id]?.played ?? 0,
              drawn: byPlayer[id]?.drawn ?? 0,
            })),
          },
  };
}

/** Forms the private seat view; other hands and draw-pile identities never cross it. */
export function projectPlayer(state: ActiveGame, playerId: string) {
  const player = state.players.find(({ id }) => id === playerId);
  if (!player) return undefined;
  return {
    ...projectTable(state),
    viewerId: playerId,
    hand: player.hand.map((card) => ({ ...card })),
    actions: legalActions(state, playerId),
  };
}

export type TableView = ReturnType<typeof projectTable>;
export type PlayerView = NonNullable<ReturnType<typeof projectPlayer>>;
export type { Card, Color } from "../domain/model";
