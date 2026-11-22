import { createLocalGameService } from "../application/local-game";
import { browserRandom, inMemoryGame } from "../infrastructure/local-adapters";

export const localGame = createLocalGameService(
  inMemoryGame(),
  browserRandom,
  Date.now,
);
