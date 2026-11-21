import type { GameCommand } from "../domain/model";
import type { PlayerView } from "./player-view";

type SeatCommand = Extract<GameCommand, { playerId: string }>;
type WithoutSeat<T> = T extends SeatCommand ? Omit<T, "playerId"> : never;
export type MatchIntent = WithoutSeat<SeatCommand>;

export function chooseBotMove({
  actions,
  hand,
}: PlayerView): MatchIntent | undefined {
  const [firstColor] = actions.wildColors;
  if (firstColor) {
    const weight = (color: typeof firstColor) =>
      hand.filter((card) => "color" in card && card.color === color).length;
    const color = actions.wildColors.reduce(
      (best, candidate) =>
        weight(candidate) > weight(best) ? candidate : best,
      firstColor,
    );
    return { type: "choose-color", color };
  }
  const [cardId] = actions.playableIds;
  if (cardId) return { type: "play", cardId };
  if (actions.canDraw) return { type: "draw" };
  if (actions.canAdvance) return { type: "advance" };
}
