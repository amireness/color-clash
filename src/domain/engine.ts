import { createDeck, shuffle } from "./deck";
import { recordStatistics, startStatistics } from "./match-statistics";
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
  /** Timestamp sampled by the caller for a committed command. */
  at: number;
  /** Supplies a value in [0, 1) only when shuffling is required. */
  random: () => number;
}

const success = (state: GameState, ...events: GameEvent[]): GameResult => ({
  ok: true,
  state,
  events,
});

export function createGame(
  names: readonly string[],
  identicalNumbers = false,
): GameResult {
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
    identicalNumbers,
    players: cleaned.map((name, index) => ({
      id: `p${index + 1}`,
      name,
      hand: [],
    })),
  });
}

function start(
  state: GameState,
  { random, at }: EngineDependencies,
): GameResult {
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
      identicalNumbers: state.identicalNumbers,
      players,
      drawPile: deck,
      discard: [opening],
      color: opening.color,
      direction: 1,
      current: 0,
      turn: { kind: "ready" },
      turnNumber: 1,
      statistics: startStatistics(at),
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
  const playable =
    active && turn.kind !== "wild"
      ? player.hand.filter((card) =>
          state.penalty
            ? card.kind === state.penalty.kind
            : (turn.kind === "ready" || card.id === turn.cardId) &&
              matches(card, state.discard[0], state.color),
        )
      : [];
  const groups = new Map<string, string[]>();
  if (state.identicalNumbers && turn.kind === "ready" && !state.penalty) {
    for (const card of playable) {
      if (card.kind !== "number") continue;
      const key = card.color + card.value;
      const ids = groups.get(key) ?? [];
      ids.push(card.id);
      groups.set(key, ids);
    }
  }
  return {
    playableIds: playable.map(({ id }) => id),
    groups: [...groups.values()].filter((ids) => ids.length > 1),
    canDraw: active && turn.kind === "ready" && !state.penalty,
    canAcceptPenalty: active && turn.kind === "ready" && Boolean(state.penalty),
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

function commitPlay(
  state: ActiveGame,
  cards: readonly [Card, ...Card[]],
  color: Color,
  random: () => number,
): GameResult {
  const player = state.players[state.current];
  const [card, ...older] = [...cards].reverse();
  const ids = new Set(cards.map(({ id }) => id));
  const hand = player.hand.filter((held) => !ids.has(held.id));
  let next: ActiveGame = {
    ...state,
    discard: [card, ...older, ...state.discard],
    color,
    turn: { kind: "ready" },
    players: state.players.map((entry) =>
      entry.id === player.id ? { ...entry, hand } : entry,
    ),
  };
  const events: GameEvent[] = cards.map((played) => ({
    type: "played",
    playerId: player.id,
    card: { ...played },
  }));
  if (card.kind === "reverse") {
    next = { ...next, direction: next.direction === 1 ? -1 : 1 };
    events.push({ type: "reversed" });
  }
  const skips =
    card.kind === "skip" ||
    (card.kind === "reverse" && next.players.length === 2);
  const target = nextSeat(next, 1);
  if (card.kind === "draw-two" || card.kind === "wild-draw-four") {
    const count =
      (state.penalty?.count ?? 0) + (card.kind === "draw-two" ? 2 : 4);
    if (state.penalty)
      events.push({ type: "stacked", playerId: player.id, count });
    if (hand.length)
      return advance(
        { ...next, penalty: { kind: card.kind, count } },
        1,
        events,
      );
    // The empty hand ends the chain. Settle its full amount before recording the win.
    next = settlePenalty(next, target, count, random, events);
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

function settlePenalty(
  state: ActiveGame,
  target: number,
  count: number,
  random: () => number,
  events: GameEvent[],
) {
  const { state: next, drawn } = takeCards(state, target, count, random);
  const playerId = state.players[target].id;
  events.push(
    { type: "drew", playerId, count: drawn.length, penalty: count },
    { type: "skipped", playerId },
  );
  return { ...next, penalty: undefined };
}

export function executeCommand(
  state: GameState,
  command: GameCommand,
  dependencies: EngineDependencies,
): GameResult {
  const result = transition(state, command, dependencies);
  if (
    !result.ok ||
    result.state.phase === "setup" ||
    result.events.some(({ type }) => type === "started")
  )
    return result;
  return {
    ...result,
    state: {
      ...result.state,
      statistics: recordStatistics(
        result.state.statistics,
        result.events,
        dependencies.at,
      ),
    },
  };
}

function transition(
  state: GameState,
  command: GameCommand,
  { random, at }: EngineDependencies,
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
          penalty: undefined,
          result: { reason: "early-score", winnerIds },
        },
        { type: "scored", winnerIds: [...winnerIds] },
      );
    }
    if (
      (command.type === "start" && state.phase === "setup") ||
      (command.type === "restart" && state.phase === "finished")
    )
      return start(state, { random, at });
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
      return commitPlay(state, [card], card.color, random);
    }
    case "play-batch": {
      const ids = new Set(command.cardIds);
      if (
        ids.size !== command.cardIds.length ||
        ids.size < 2 ||
        !actions.groups.some((group) =>
          command.cardIds.every((id) => group.includes(id)),
        )
      )
        return { ok: false, error: "illegal-batch" };
      const [first, ...rest] = command.cardIds.map((id) =>
        player.hand.find((card) => card.id === id)!,
      );
      if (first.kind !== "number") return { ok: false, error: "illegal-batch" };
      return commitPlay(state, [first, ...rest], first.color, random);
    }
    case "choose-color": {
      if (state.turn.kind !== "wild")
        return { ok: false, error: "illegal-action" };
      if (!actions.wildColors.includes(command.color))
        return { ok: false, error: "invalid-color" };
      const { cardId } = state.turn;
      const card = player.hand.find((held) => held.id === cardId);
      if (!card) return { ok: false, error: "illegal-card" };
      return commitPlay(state, [card], command.color, random);
    }
    case "accept-penalty": {
      if (!actions.canAcceptPenalty || !state.penalty)
        return { ok: false, error: "illegal-action" };
      const events: GameEvent[] = [];
      const next = settlePenalty(
        state,
        state.current,
        state.penalty.count,
        random,
        events,
      );
      return advance(next, 1, events);
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
