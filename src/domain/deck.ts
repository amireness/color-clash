import { colors } from "./model";
import type { Card } from "./model";

export function createDeck(): Card[] {
  const cards: Card[] = [];
  for (const color of colors) {
    for (let value = 0; value <= 9; value++) {
      for (let copy = 0; copy < (value === 0 ? 1 : 2); copy++) {
        cards.push({
          id: `${color}-${value}-${copy}`,
          kind: "number",
          color,
          value,
        });
      }
    }
    for (const kind of ["skip", "reverse", "draw-two"] as const) {
      for (const copy of [0, 1])
        cards.push({ id: `${color}-${kind}-${copy}`, kind, color });
    }
  }
  for (let copy = 0; copy < 4; copy++)
    cards.push({
      id: "wild-four-" + copy,
      kind: "wild-draw-four",
    });
  for (let copy = 0; copy < 4; copy++)
    cards.push({ id: `wild-${copy}`, kind: "wild" });
  return cards;
}

export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return shuffled;
}
