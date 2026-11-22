export const colors = ["red", "yellow", "green", "blue"] as const;
export type Color = (typeof colors)[number];
export type Action = "skip" | "reverse" | "draw-two";
export type Card = Readonly<
  { id: string } & (
    | { kind: "number"; color: Color; value: number }
    | { kind: Action; color: Color }
    | { kind: "wild" }
    | { kind: "wild-draw-four" }
  )
>;
export interface Player {
  readonly id: string;
  readonly name: string;
  readonly hand: readonly Card[];
}
export type TurnState =
  | { readonly kind: "ready" }
  | { readonly kind: "drawn"; readonly cardId: string }
  | { readonly kind: "wild"; readonly cardId: string };
export type GamePhase = "setup" | "playing" | "finished";
export interface DrawPenalty {
  readonly kind: "draw-two" | "wild-draw-four";
  readonly count: number;
}
export type MatchResult =
  | { readonly reason: "empty-hand"; readonly winnerId: string }
  | { readonly reason: "early-score"; readonly winnerIds: readonly string[] };

export type GameState = Readonly<
  {
    players: readonly Player[];
    identicalNumbers: boolean;
  } & (
    | { phase: "setup" }
    | ({
        drawPile: readonly Card[];
        discard: readonly [Card, ...Card[]];
        color: Color;
        direction: 1 | -1;
        current: number;
        turn: TurnState;
        turnNumber: number;
        statistics: MatchStatistics;
        penalty?: DrawPenalty;
      } & ({ phase: "playing" } | { phase: "finished"; result: MatchResult }))
  )
>;
export type ActiveGame = Extract<GameState, { phase: "playing" | "finished" }>;
export type GameCommand =
  | { type: "start" | "restart" | "end-and-score" }
  | ({ playerId: string } & (
      | { type: "play"; cardId: string }
      | { type: "play-batch"; cardIds: readonly string[] }
      | { type: "draw" | "advance" | "accept-penalty" }
      | { type: "choose-color"; color: Color }
    ));
export type GameEvent =
  | { type: "started" }
  | { type: "played"; playerId: string; card: Card }
  | { type: "drew"; playerId: string; count: number; penalty?: number }
  | { type: "stacked"; playerId: string; count: number }
  | { type: "turn"; playerId: string }
  | { type: "skipped"; playerId: string }
  | { type: "reversed" }
  | { type: "won"; playerId: string }
  | { type: "scored"; winnerIds: readonly string[] };
export type GameError =
  | "invalid-players"
  | "wrong-phase"
  | "wrong-player"
  | "illegal-card"
  | "illegal-batch"
  | "illegal-action"
  | "invalid-color";
export type GameResult =
  | { ok: true; state: GameState; events: readonly GameEvent[] }
  | { ok: false; error: GameError };
export interface SeatStatistics {
  readonly played: number;
  readonly drawn: number;
}

export interface MatchStatistics {
  readonly startedAt: number;
  readonly endedAt?: number;
  readonly turns: number;
  readonly played: number;
  readonly drawn: number;
  readonly actions: number;
  readonly wilds: number;
  readonly byPlayer: Readonly<Record<string, SeatStatistics>>;
}
