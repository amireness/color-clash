import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PlayerView } from "../application/player-view";
import type { PublicEvent } from "../application/public-events";
import type { Card } from "../application/player-view";

export interface MatchFrame {
  view: PlayerView;
  events: readonly PublicEvent[];
  revision?: number;
}

export type PlaybackEvent = Extract<
  PublicEvent,
  { type: "played" | "drew" | "skipped" | "reversed" | "stacked" }
>;

export const movementMs = 440;
export const drawStaggerMs = 40;

export function playbackSequence(
  events: readonly PublicEvent[],
): PlaybackEvent[] {
  return events.filter(
    (event): event is PlaybackEvent =>
      event.type === "played" ||
      (event.type === "drew" && event.count > 0) ||
      event.type === "skipped" ||
      event.type === "stacked" ||
      event.type === "reversed",
  );
}

export function stepDuration(event: PlaybackEvent): number {
  if (event.type === "drew")
    return movementMs + drawStaggerMs * (event.count - 1);
  return event.type === "played" ? movementMs : 430;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () =>
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(Boolean(media?.matches));
    media?.addEventListener("change", update);
    return () => media?.removeEventListener("change", update);
  }, []);
  return reduced;
}

type Display = {
  frame?: MatchFrame;
  step?: PlaybackEvent;
  landed?: Card;
  key: number;
};
type Batch = { frame: MatchFrame; events: PlaybackEvent[] };

/** Buffers consecutive public transitions. Discontinuities snap to the latest projection. */
export function useMatchPlayback(
  frame: MatchFrame | undefined,
  session: string,
  connected: boolean,
) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState<Display>({ key: 0 });
  const control = useRef({
    session,
    observed: undefined as MatchFrame | undefined,
    display: { key: 0 } as Display,
    queued: [] as Batch[],
    running: undefined as Batch | undefined,
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
  });

  useLayoutEffect(() => {
    const playback = control.current;
    const previous = playback.observed;
    playback.observed = frame;
    function show(next: Display) {
      playback.display = next;
      setDisplay(next);
    }
    function advance() {
      const batch = playback.running ?? playback.queued.shift();
      if (!batch) return;
      playback.running = batch;
      const step = batch.events.shift();
      if (step) {
        const previousStep = playback.display.step;
        const landed =
          previousStep?.type === "played"
            ? previousStep.card
            : playback.display.landed;
        show({
          frame: playback.display.frame,
          step,
          landed,
          key: playback.display.key + 1,
        });
        playback.timer = setTimeout(advance, stepDuration(step));
      } else {
        show({ frame: batch.frame, key: playback.display.key });
        playback.running = undefined;
        advance();
      }
    }
    const gap =
      previous?.revision !== undefined &&
      frame?.revision !== undefined &&
      frame.revision > previous.revision + 1;
    if (
      playback.session !== session ||
      !connected ||
      reduced ||
      !previous ||
      !frame ||
      frame.events.some(({ type }) => type === "started") ||
      gap ||
      playback.queued.length >= 5
    ) {
      clearTimeout(playback.timer);
      playback.session = session;
      playback.running = undefined;
      playback.queued = [];
      show({ frame, key: playback.display.key });
    } else if (
      previous !== frame &&
      (frame.revision === undefined || frame.revision !== previous.revision)
    ) {
      playback.queued.push({ frame, events: playbackSequence(frame.events) });
      if (!playback.running) advance();
    }
  }, [frame, session, connected, reduced]);

  useLayoutEffect(() => {
    const playback = control.current;
    return () => {
      clearTimeout(playback.timer);
      playback.running = undefined;
      playback.queued = [];
      playback.observed = undefined;
    };
  }, []);

  return display;
}
