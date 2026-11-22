import type { GameCommand } from "../domain/model";

type SeatCommand = Extract<GameCommand, { playerId: string }>;
type WithoutSeat<T> = T extends SeatCommand ? Omit<T, "playerId"> : never;
export type MatchIntent = WithoutSeat<SeatCommand>;
