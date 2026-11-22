import { useLayoutEffect, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import { CardBack, CardFace } from "./Cards";
import { drawStaggerMs, movementMs } from "./match-playback";
import type { PlaybackEvent } from "./match-playback";

type Geometry = { source: DOMRect; target: DOMRect };

export function CardFlight({
  event,
  board,
  viewerId,
}: {
  event: PlaybackEvent;
  board: RefObject<HTMLElement | null>;
  viewerId: string;
}) {
  const [geometry, setGeometry] = useState<Geometry>();
  useLayoutEffect(() => {
    const root = board.current;
    if (!root || (event.type !== "played" && event.type !== "drew")) return;
    const seat = [...root.querySelectorAll<HTMLElement>("[data-seat]")].find(
      (node) => node.dataset.seat === event.playerId,
    );
    const ownCard =
      event.type === "played" && event.playerId === viewerId
        ? [...root.querySelectorAll<HTMLElement>("[data-hand-card]")].find(
            (node) => node.dataset.handCard === event.card.id,
          )
        : undefined;
    const source =
      event.type === "played"
        ? (ownCard ?? seat)
        : root.querySelector("[data-draw-pile]");
    const target =
      event.type === "played"
        ? root.querySelector("[data-discard]")
        : event.playerId === viewerId
          ? root.querySelector("[data-hand]")
          : seat;
    if (source && target)
      setGeometry({
        source: source.getBoundingClientRect(),
        target: target.getBoundingClientRect(),
      });
  }, [board, event, viewerId]);

  if (!geometry || (event.type !== "played" && event.type !== "drew"))
    return null;
  const { source, target } = geometry;
  const count = event.type === "drew" ? event.count : 1;
  return (
    <div className="flight-layer" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div
          className="card-flight"
          key={index}
          style={
            {
              left: source.left + source.width / 2,
              top: source.top + source.height / 2,
              "--flight-x": `${target.left + target.width / 2 - source.left - source.width / 2}px`,
              "--flight-y": `${target.top + target.height / 2 - source.top - source.height / 2}px`,
              animationDelay: `${index * drawStaggerMs}ms`,
              animationDuration: `${movementMs}ms`,
            } as CSSProperties
          }
        >
          {event.type === "played" ? (
            <CardFace card={event.card} />
          ) : (
            <CardBack />
          )}
        </div>
      ))}
    </div>
  );
}
