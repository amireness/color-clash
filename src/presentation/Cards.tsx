import type { Card } from "../application/player-view";

export const symbols = { red: "◆", yellow: "✦", green: "●", blue: "▲" };
const actions = {
  skip: "⊘",
  reverse: "⇄",
  "draw-two": "+2",
  "wild-draw-four": "+4",
};
const names = {
  skip: "Skip",
  reverse: "Reverse",
  "draw-two": "Draw Two",
  wild: "Wild",
  "wild-draw-four": "Wild Draw Four",
};
export const title = (word: string) => word[0].toUpperCase() + word.slice(1);

export function cardName(card: Card) {
  const name = card.kind === "number" ? card.value : names[card.kind];
  return !("color" in card) ? name : `${title(card.color)} ${name}`;
}

export function CardFace({ card }: { card: Card }) {
  const color = "color" in card ? card.color : "wild";
  return (
    <span className={`card face ${color}`} aria-hidden="true">
      {"color" in card ? (
        <span className="corner">{symbols[card.color]}</span>
      ) : (
        <span className="corner wild-mark" />
      )}
      <strong>
        {card.kind === "number" ? (
          card.value
        ) : card.kind === "wild" ? (
          <span className="wild-mark wild-emblem" />
        ) : (
          actions[card.kind]
        )}
      </strong>
    </span>
  );
}

export function CardBack() {
  return (
    <span className="card back" aria-hidden="true">
      <strong>✦</strong>
    </span>
  );
}
