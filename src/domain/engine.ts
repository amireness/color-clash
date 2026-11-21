import { createDeck, shuffle } from "./deck";
import { colors } from "./model";
import type {
  ActiveGame,
  Card,
  Color,
  GameCommand,
  GameEvent,
  GameResult,
  GameState,
} from "./model";

export interface EngineDependencies {
  /** Supplies a value in [0, 1) only when shuffling is required. */
  random: () => number;
}

const success = (state: GameState, ...events: GameEvent[]): GameResult => ({
  ok: true,
  state,
  events,
});

export function createGame(names: readonly string[]): GameResult {
  const cleaned = names.map((name) => name.trim());
  if (
    cleaned.length < 2 ||
    cleaned.length > 4 ||
    cleaned.some((name) => !name || name.length > 24) ||
    new Set(cleaned.map((name) => name.toLowerCase())).size !== cleaned.length
  ) {
    return { ok: false, error: "invalid-players" };
  }
  return success({
    phase: "setup",
    players: cleaned.map((name, index) => ({
      id: `p${index + 1}`,
      name,
      hand: [],
    })),
  });
}

function start(state: GameState, random: () => number): GameResult {
  const deck = shuffle(createDeck(), random);
  const players = state.players.map((player) => ({
    ...player,
    hand: deck.splice(0, 7),
  }));
  const [opening] = deck.splice(
    deck.findIndex((card) => card.kind === "number"),
    1,
  );
  if (opening.kind !== "number")
    throw new Error("The deck must contain an opening number");
  return success(
    {
      phase: "playing",
      players,
      drawPile: deck,
      discard: [opening],
      color: opening.color,
      direction: 1,
      current: 0,
      turn: { kind: "ready" },
      turnNumber: 1,
    },
    { type: "started" },
  );
}

export function matches(card: Card, top: Card, color: Color): boolean {
  return (
    !("color" in card) ||
    card.color === color ||
    (card.kind === "number"
      ? top.kind === "number" && card.value === top.value
      : card.kind === top.kind)
  );
}

export function legalActions(state: ActiveGame, playerId: string) {
  const player = state.players[state.current];
  const active = state.phase === "playing" && player.id === playerId;
  const turn = state.turn;
  return {
    playableIds:
      active && turn.kind !== "wild"
        ? player.hand
            .filter(
              (card) =>
                (turn.kind === "ready" || card.id === turn.cardId) &&
                matches(card, state.discard[0], state.color),
            )
            .map((card) => card.id)
        : [],
    canDraw: active && turn.kind === "ready",
    canAdvance: active && turn.kind === "drawn",
    wildColors: active && turn.kind === "wild" ? [...colors] : [],
  };
}

function takeCards(
  state: ActiveGame,
  index: number,
  count: number,
  random: () => number,
) {
  let drawPile = [...state.drawPile];
  let discard = state.discard;
  const drawn: Card[] = [];
  while (drawn.length < count) {
    if (!drawPile.length && discard.length > 1) {
      drawPile = shuffle(discard.slice(1), random);
      discard = [discard[0]];
    }
    const card = drawPile.shift();
    if (!card) break;
    drawn.push(card);
  }
  return {
    drawn,
    state: {
      ...state,
      drawPile,
      discard,
      players: state.players.map((player, seat) =>
        seat === index
          ? { ...player, hand: [...player.hand, ...drawn] }
          : player,
      ),
    },
  };
}

function nextSeat(state: ActiveGame, distance: number) {
  const count = state.players.length;
  return (state.current + state.direction * distance + count) % count;
}

function advance(
  state: ActiveGame,
  distance: number,
  events: GameEvent[],
): GameResult {
  const current = nextSeat(state, distance);
  return success(
    {
      ...state,
      current,
      turn: { kind: "ready" },
      turnNumber: state.turnNumber + 1,
    },
    ...events,
    { type: "turn", playerId: state.players[current].id },
  );
}

function commitCard(
  state: ActiveGame,
  card: Card,
  color: Color,
  random: () => number,
): GameResult {
  const player = state.players[state.current];
  const hand = player.hand.filter((held) => held.id !== card.id);
  let next: ActiveGame = {
    ...state,
    discard: [card, ...state.discard],
    color,
    turn: { kind: "ready" },
    players: state.players.map((entry) =>
      entry.id === player.id ? { ...entry, hand } : entry,
    ),
  };
  const events: GameEvent[] = [
    { type: "played", playerId: player.id, card: { ...card } },
  ];
  if (card.kind === "reverse") {
    next = { ...next, direction: next.direction === 1 ? -1 : 1 };
    events.push({ type: "reversed" });
  }
  const penaltyCount =
    card.kind === "wild-draw-four" ? 4 : card.kind === "draw-two" ? 2 : 0;
  const skips =
    card.kind === "skip" ||
    penaltyCount > 0 ||
    (card.kind === "reverse" && next.players.length === 2);
  const target = nextSeat(next, 1);
  if (penaltyCount) {
    const penalty = takeCards(next, target, penaltyCount, random);
    next = penalty.state;
    events.push({
      type: "drew",
      playerId: next.players[target].id,
      count: penalty.drawn.length,
    });
  }
  if (skips)
    events.push({ type: "skipped", playerId: next.players[target].id });
  if (!hand.length)
    return success(
      {
        ...next,
        phase: "finished",
        result: { reason: "empty-hand", winnerId: player.id },
      },
      ...events,
      {
        type: "won",
        playerId: player.id,
      },
    );
  return advance(next, skips ? 2 : 1, events);
}

export function executeCommand(
  state: GameState,
  command: GameCommand,
  { random }: EngineDependencies,
): GameResult {
  if (!("playerId" in command)) {
    if (command.type === "end-and-score" && state.phase === "playing") {
      const fewest = Math.min(...state.players.map(({ hand }) => hand.length));
      const winnerIds = state.players
        .filter(({ hand }) => hand.length === fewest)
        .map(({ id }) => id);
      return success(
        {
          ...state,
          phase: "finished",
          turn: { kind: "ready" },
          result: { reason: "early-score", winnerIds },
        },
        { type: "scored", winnerIds: [...winnerIds] },
      );
    }
    if (
      (command.type === "start" && state.phase === "setup") ||
      (command.type === "restart" && state.phase === "finished")
    )
      return start(state, random);
    return { ok: false, error: "wrong-phase" };
  }
  if (state.phase !== "playing") return { ok: false, error: "wrong-phase" };
  const player = state.players[state.current];
  if (command.playerId !== player.id)
    return { ok: false, error: "wrong-player" };
  const actions = legalActions(state, player.id);
  switch (command.type) {
    case "play": {
      const card = player.hand.find((held) => held.id === command.cardId);
      if (!card || !actions.playableIds.includes(card.id))
        return { ok: false, error: "illegal-card" };
      if (!("color" in card))
        return success({ ...state, turn: { kind: "wild", cardId: card.id } });
      return commitCard(state, card, card.color, random);
    }
    case "choose-color": {
      if (state.turn.kind !== "wild")
        return { ok: false, error: "illegal-action" };
      if (!actions.wildColors.includes(command.color))
        return { ok: false, error: "invalid-color" };
      const { cardId } = state.turn;
      const card = player.hand.find((held) => held.id === cardId);
      if (!card) return { ok: false, error: "illegal-card" };
      return commitCard(state, card, command.color, random);
    }
    case "draw": {
      if (!actions.canDraw) return { ok: false, error: "illegal-action" };
      const { drawn, state: next } = takeCards(state, state.current, 1, random);
      const event: GameEvent = {
        type: "drew",
        playerId: player.id,
        count: drawn.length,
      };
      const [card] = drawn;
      if (card && matches(card, next.discard[0], next.color)) {
        return success(
          { ...next, turn: { kind: "drawn", cardId: card.id } },
          event,
        );
      }
      return advance(next, 1, [event]);
    }
    case "advance":
      return actions.canAdvance
        ? advance(state, 1, [])
        : { ok: false, error: "illegal-action" };
  }
  return { ok: false, error: "illegal-action" };
}
