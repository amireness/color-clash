import type { GameState } from "../domain/model";

export interface GameStateRepository {
  load(): GameState | undefined;
  save(state: GameState): void;
  clear(): void;
}

export interface RandomSource {
  next(): number;
}
