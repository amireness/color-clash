import { createGame, executeCommand } from "../domain/engine";
import type {
  Color,
  GameCommand,
  GameError,
  GameEvent,
  GameResult,
} from "../domain/model";
import { projectPlayer, projectTable } from "./player-view";
import { chooseBotMove } from "./bot";
import type { MatchIntent } from "./bot";
import type { GameStateRepository, RandomSource } from "./ports";

export type Outcome =
  { ok: true; events: readonly GameEvent[] } | { ok: false; error: GameError };

export function createLocalGameService(
  repository: GameStateRepository,
  random: RandomSource,
) {
  function save(result: GameResult): Outcome {
    if (!result.ok) return result;
    repository.save(result.state);
    return { ok: true, events: result.events };
  }

  function dispatch(command: GameCommand): Outcome {
    const state = repository.load();
    if (!state) return { ok: false, error: "wrong-phase" };
    return save(
      executeCommand(state, command, { random: () => random.next() }),
    );
  }

  return {
    startBotMatch(name: string, count: number) {
      if (!Number.isInteger(count) || count < 1 || count > 3)
        return { ok: false, error: "invalid-players" } as const;
      const created = save(
        createGame([
          name,
          ...Array.from({ length: count }, (_, i) => `Bot ${i + 1}`),
        ]),
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
    createLocalGame: (names: readonly string[]) => save(createGame(names)),
    startGame: () => dispatch({ type: "start" }),
    playCard: (playerId: string, cardId: string) =>
      dispatch({ type: "play", playerId, cardId }),
    drawCard: (playerId: string) => dispatch({ type: "draw", playerId }),
    chooseWildColor: (playerId: string, color: Color) =>
      dispatch({ type: "choose-color", playerId, color }),
    advanceTurn: (playerId: string) => dispatch({ type: "advance", playerId }),
    restartGame: () => dispatch({ type: "restart" }),
    endAndScore: () => dispatch({ type: "end-and-score" }),
    leaveGame: () => repository.clear(),
    getTableView() {
      const state = repository.load();
      return state && state.phase !== "setup" ? projectTable(state) : undefined;
    },
    getPlayerView(playerId: string) {
      const state = repository.load();
      return state && state.phase !== "setup"
        ? projectPlayer(state, playerId)
        : undefined;
    },
  };
}

export type LocalGame = ReturnType<typeof createLocalGameService>;
