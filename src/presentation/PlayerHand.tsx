import { useLayoutEffect, useState } from "react";
import type { MatchIntent } from "../application/match-intent";
import type { PlayerView } from "../application/player-view";
import { CardFace, cardName } from "./Cards";
import type { PlaybackEvent } from "./match-playback";

export function PlayerHand({
  view,
  blocked,
  waiting,
  step,
  landedId,
  move,
}: {
  view: PlayerView;
  blocked: boolean;
  waiting: boolean;
  step?: PlaybackEvent;
  landedId?: string;
  move(intent: MatchIntent): void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const { actions } = view;
  const groupFor = (id: string) =>
    actions.groups.find((group) => group.includes(id));
  const selectionGroup = selected.length ? groupFor(selected[0]) : undefined;
  const canPlaySelection =
    selected.length > 0 && selected.every((id) => selectionGroup?.includes(id));

  useLayoutEffect(() => {
    setSelected([]);
  }, [view]);

  function choose(cardId: string) {
    const group = groupFor(cardId);
    if (!group) return move({ type: "play", cardId });
    setSelected((previous) =>
      previous.includes(cardId)
        ? previous.filter((id) => id !== cardId)
        : [...previous.filter((id) => group.includes(id)), cardId],
    );
  }

  return (
    <section
      className={waiting ? "hand-area waiting" : "hand-area"}
      aria-label="Your hand"
      data-hand
    >
      <div className="hand-heading">
        <h2>Your hand</h2>
        {selected.length > 0 && (
          <button
            className="primary"
            disabled={blocked || !canPlaySelection}
            onClick={() =>
              move(
                selected.length === 1
                  ? { type: "play", cardId: selected[0] }
                  : { type: "play-batch", cardIds: selected },
              )
            }
          >
            Play {selected.length} {selected.length === 1 ? "card" : "cards"}
          </button>
        )}
        {actions.canAdvance && (
          <button
            className="quiet"
            disabled={blocked}
            onClick={() => move({ type: "advance" })}
          >
            End turn →
          </button>
        )}
      </div>
      {actions.groups.length > 0 && (
        <p className="group-hint">
          Select matching number cards, then play them together.
        </p>
      )}
      <div className="hand">
        {view.hand.map((card) => {
          const group = groupFor(card.id);
          const inFlight =
            (step?.type === "played" && step.card.id === card.id) ||
            landedId === card.id;
          return (
            <button
              key={card.id}
              data-hand-card={card.id}
              data-in-flight={inFlight || undefined}
              className="card-button"
              aria-label={`${group ? "Select" : view.penalty && actions.playableIds.includes(card.id) ? "Stack" : "Play"} ${cardName(card)}`}
              aria-pressed={group ? selected.includes(card.id) : undefined}
              disabled={
                blocked ||
                !actions.playableIds.includes(card.id) ||
                (selected.length > 0 && !group)
              }
              onClick={() => choose(card.id)}
            >
              <CardFace card={card} />
            </button>
          );
        })}
      </div>
    </section>
  );
}
