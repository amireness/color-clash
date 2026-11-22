import { createGame, executeCommand } from "../domain/engine";
import type { GameCommand, GameError, GameResult } from "../domain/model";
import { projectPlayer, projectTable } from "./player-view";
import { chooseBotMove } from "./bot";
import type { MatchIntent } from "./match-intent";
import type { GameStateRepository, RandomSource } from "./ports";
import { publicEvents } from "./public-events";
import type { PublicEvent } from "./public-events";

export type Outcome =
  | { ok: true; events: readonly PublicEvent[] }
  | { ok: false; error: GameError };

export function createLocalGameService(
  repository: GameStateRepository,
  random: RandomSource,
  now: () => number,
) {
  function save(result: GameResult): Outcome {
    if (!result.ok) return result;
    repository.save(result.state);
    return { ok: true, events: publicEvents(result.events) };
  }

  function dispatch(command: GameCommand): Outcome {
    const state = repository.load();
    if (!state) return { ok: false, error: "wrong-phase" };
    return save(
      executeCommand(state, command, {
        random: () => random.next(),
        at: now(),
      }),
    );
  }

  return {
    startBotMatch(name: string, count: number, identicalNumbers = false) {
      if (!Number.isInteger(count) || count < 1 || count > 3)
        return { ok: false, error: "invalid-players" } as const;
      const created = save(
        createGame(
          [name, ...Array.from({ length: count }, (_, i) => `Bot ${i + 1}`)],
          identicalNumbers,
        ),
      );
      return created.ok ? dispatch({ type: "start" }) : created;
    },
    getHumanView() {
      const state = repository.load();
      return state && state.phase !== "setup"
        ? projectPlayer(state, state.players[0].id)
        : undefined;
    },
    humanMove(intent: MatchIntent) {
      const state = repository.load();
      return state
        ? dispatch({ ...intent, playerId: state.players[0].id })
        : ({ ok: false, error: "wrong-phase" } as const);
    },
    botStep(): Outcome {
      const state = repository.load();
      if (!state || state.phase !== "playing" || state.current === 0)
        return { ok: false, error: "wrong-phase" };
      const playerId = state.players[state.current].id;
      const view = projectPlayer(state, playerId);
      const intent = view && chooseBotMove(view);
      return intent
        ? dispatch({ ...intent, playerId })
        : { ok: false, error: "illegal-action" };
    },
    restartGame: () => dispatch({ type: "restart" }),
    endAndScore: () => dispatch({ type: "end-and-score" }),
    leaveGame: () => repository.clear(),
    getTableView() {
      const state = repository.load();
      return state && state.phase !== "setup" ? projectTable(state) : undefined;
    },
  };
}

export type LocalGame = ReturnType<typeof createLocalGameService>;
