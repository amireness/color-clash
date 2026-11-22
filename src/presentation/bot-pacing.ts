import { useEffectEvent, useLayoutEffect, useRef } from "react";

export const botSpeeds = { Fast: 650, Normal: 2200, Relaxed: 4400 } as const;
export type BotSpeed = keyof typeof botSpeeds;

/** The initial decision is paced once per turn. Draw and Wild follow-ups are shorter. */
export function useBotPacing(
  turn: number | undefined,
  frame: object | undefined,
  paused: boolean,
  speed: BotSpeed,
  onStep: () => void,
) {
  const previousStep = useRef<number | undefined>(undefined);
  const step = useEffectEvent(onStep);
  useLayoutEffect(() => {
    if (turn === undefined) {
      previousStep.current = undefined;
      return;
    }
    if (paused) return;
    const timer = setTimeout(
      () => {
        previousStep.current = turn;
        step();
      },
      previousStep.current === turn ? 180 : botSpeeds[speed],
    );
    return () => clearTimeout(timer);
  }, [turn, frame, paused, speed]);
}
