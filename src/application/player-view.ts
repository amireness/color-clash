import { legalActions } from "../domain/engine";
import type { ActiveGame, Card } from "../domain/model";

export function projectTable(state: ActiveGame) {
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
    discard: { ...state.discard[0] } as Card,
    color: state.color,
    drawCount: state.drawPile.length,
  };
}

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
