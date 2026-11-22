import type { MatchIntent } from "./match-intent";
import type { PlayerView } from "./player-view";

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
  const [group] = actions.groups;
  if (group) return { type: "play-batch", cardIds: group };
  const [cardId] = actions.playableIds;
  if (cardId) return { type: "play", cardId };
  if (actions.canAcceptPenalty) return { type: "accept-penalty" };
  if (actions.canDraw) return { type: "draw" };
  if (actions.canAdvance) return { type: "advance" };
}
