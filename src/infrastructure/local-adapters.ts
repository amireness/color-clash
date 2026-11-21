import type { GameStateRepository, RandomSource } from "../application/ports";
import type { GameState } from "../domain/model";

export function inMemoryGame(): GameStateRepository {
  let state: GameState | undefined;
  return {
    load: () => state,
    save: (next) => {
      state = next;
    },
    clear: () => {
      state = undefined;
    },
  };
}

export const browserRandom: RandomSource = { next: () => Math.random() };
