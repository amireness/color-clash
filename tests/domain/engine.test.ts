import { describe, expect, it, vi } from "vitest";
import { createDeck, shuffle } from "../../src/domain/deck";
import { startStatistics } from "../../src/domain/match-statistics";
import { createGame, executeCommand } from "../../src/domain/engine";
import { colors } from "../../src/domain/model";
import type {
  ActiveGame,
  Card,
  Color,
  GameResult,
  GameCommand,
} from "../../src/domain/model";

const deck = createDeck();
const random = () => 0.999;
const card = (id: string) => {
  const found = deck.find((entry) => entry.id === id);
  if (!found) throw new Error(`Missing fixture card ${id}`);
  return found;
};
const top = card("red-5-0");
const yellow = card("yellow-8-0");
const green = card("green-8-0");
function table(
  held: Card,
  options: Partial<Extract<ActiveGame, { phase: "playing" }>> = {},
  winning = false,
): ActiveGame {
  return {
    phase: "playing",
    identicalNumbers: false,
    current: 0,
    direction: 1,
    turn: { kind: "ready" },
    turnNumber: 1,
    statistics: startStatistics(0),
    color: "red",
    discard: [top],
    drawPile: [green, card("green-2-0")],
    players: [
      {
        id: "p1",
        name: "One",
        hand: winning ? [held] : [held, card("blue-9-0")],
      },
      { id: "p2", name: "Two", hand: [yellow] },
      { id: "p3", name: "Three", hand: [card("yellow-9-0")] },
    ],
    ...options,
  };
}
function active(result: GameResult) {
  if (!result.ok || result.state.phase === "setup")
    throw new Error("Expected an active table");
  return result.state;
}
const play = (state: ActiveGame) =>
  executeCommand(
    state,
    { type: "play", playerId: "p1", cardId: state.players[0].hand[0].id },
    { random, at: 0 },
  );
const draw = (state: ActiveGame) =>
  executeCommand(state, { type: "draw", playerId: "p1" }, { random, at: 0 });
const command = (state: ActiveGame, move: GameCommand) =>
  executeCommand(state, move, { random, at: 0 });

describe("deck and setup", () => {
  it("creates 108 unique cards with exact per-color ranks and actions", () => {
    expect(deck).toHaveLength(108);
    expect(new Set(deck.map(({ id }) => id)).size).toBe(108);
    expect(deck.filter(({ kind }) => kind === "wild")).toHaveLength(4);
    for (const color of colors) {
      for (let value = 0; value <= 9; value++) {
        expect(
          deck.filter(
            (entry) =>
              entry.kind === "number" &&
              entry.color === color &&
              entry.value === value,
          ),
        ).toHaveLength(value === 0 ? 1 : 2);
      }
      for (const kind of ["skip", "reverse", "draw-two"]) {
        expect(
          deck.filter(
            (entry) =>
              "color" in entry && entry.kind === kind && entry.color === color,
          ),
        ).toHaveLength(2);
      }
    }
  });

  it("shuffles deterministically without mutating input", () => {
    const input = Object.freeze([1, 2, 3, 4]);
    expect(shuffle(input, () => 0)).toEqual([2, 3, 4, 1]);
    expect(input).toEqual([1, 2, 3, 4]);
  });

  it.each([2, 3, 4])(
    "deals seven cards for %s players and retains every card",
    (count) => {
      const setup = createGame(["A", "B", "C", "D"].slice(0, count));
      if (!setup.ok) throw new Error(setup.error);
      const state = active(
        executeCommand(setup.state, { type: "start" }, { random, at: 0 }),
      );
      expect(state.players.map(({ hand }) => hand.length)).toEqual(
        Array(count).fill(7),
      );
      expect(state.discard[0].kind).toBe("number");
      expect(state.current).toBe(0);
      expect(
        [
          ...state.players.flatMap(({ hand }) => hand),
          ...state.drawPile,
          ...state.discard,
        ]
          .map(({ id }) => id)
          .sort(),
      ).toEqual(deck.map(({ id }) => id).sort());
    },
  );
});

describe("turn rules", () => {
  it("resolves Wild Draw Four after color choice and skips the penalized player", () => {
    const state = table(card("wild-four-0"), {
      drawPile: [
        green,
        card("green-2-0"),
        card("green-3-0"),
        card("green-4-0"),
      ],
    });
    const pending = active(play(state));
    expect(pending.discard).toEqual(state.discard);
    const outcome = executeCommand(
      pending,
      { type: "choose-color", playerId: "p1", color: "blue" },
      { random, at: 0 },
    );
    const offered = active(outcome);
    expect(offered.current).toBe(1);
    expect(offered.penalty).toEqual({ kind: "wild-draw-four", count: 4 });
    const next = active(
      command(offered, { type: "accept-penalty", playerId: "p2" }),
    );
    expect(next.color).toBe("blue");
    expect(next.discard[0].kind).toBe("wild-draw-four");
    expect(next.statistics).toMatchObject({
      turns: 2,
      played: 1,
      drawn: 4,
      actions: 0,
      wilds: 1,
      byPlayer: { p1: { played: 1, drawn: 0 }, p2: { played: 0, drawn: 4 } },
    });
    expect(next.players[1].hand).toHaveLength(5);
    expect(next.current).toBe(2);
    expect(next.drawPile).toHaveLength(0);
  });
  it.each(["yellow-5-0", "red-8-0"])("plays %s and advances", (id) => {
    const state = table(card(id));
    const before = structuredClone(state);
    const next = active(play(state));
    expect(next.discard[0].id).toBe(id);
    expect(next.turnNumber).toBe(2);
    expect(next.current).toBe(1);
    expect(state).toEqual(before);
  });

  it("rejects wrong colors, wrong actors, unheld cards and premature advance", () => {
    const state = table(yellow);
    expect(play(state)).toEqual({ ok: false, error: "illegal-card" });
    expect(
      executeCommand(
        state,
        { type: "draw", playerId: "p2" },
        { random, at: 0 },
      ),
    ).toEqual({ ok: false, error: "wrong-player" });
    expect(
      executeCommand(
        state,
        { type: "play", playerId: "p1", cardId: top.id },
        { random, at: 0 },
      ),
    ).toEqual({ ok: false, error: "illegal-card" });
    expect(
      executeCommand(
        state,
        { type: "advance", playerId: "p1" },
        { random, at: 0 },
      ),
    ).toEqual({ ok: false, error: "illegal-action" });
  });

  it("matches action type and skips one seat", () => {
    const state = table(card("yellow-skip-0"), {
      discard: [card("red-skip-0")],
    });
    expect(active(play(state)).current).toBe(2);
  });

  it("reverses directional traversal with three seats", () => {
    const next = active(play(table(card("red-reverse-0"))));
    expect(next.direction).toBe(-1);
    expect(next.current).toBe(2);
  });

  it("reverses and skips the other seat with two players", () => {
    const state = table(card("red-reverse-0"));
    const next = active(play({ ...state, players: state.players.slice(0, 2) }));
    expect(next.direction).toBe(-1);
    expect(next.current).toBe(0);
    expect(next.turnNumber).toBe(2);
  });

  it("Draw Two can be accepted and is consumed once before skipping the seat", () => {
    const pending = active(play(table(card("red-draw-two-0"))));
    expect(pending.players[1].hand).toHaveLength(1);
    const accept = { type: "accept-penalty", playerId: "p2" } as const;
    const next = active(command(pending, accept));
    expect(next.penalty).toBeUndefined();
    expect(command(next, { ...accept, playerId: "p3" })).toEqual({
      ok: false,
      error: "illegal-action",
    });
    expect(next.players[1].hand).toHaveLength(3);
    expect(next.current).toBe(2);
    expect(next.drawPile).toHaveLength(0);
    expect(next.statistics).toMatchObject({
      turns: 2,
      played: 1,
      drawn: 2,
      actions: 1,
      wilds: 0,
    });
  });

  it("validates identical number batches atomically and counts a winning batch once", () => {
    const first = card("red-8-0");
    const second = card("red-8-1");
    const fixture = table(first, { identicalNumbers: true });
    const state = {
      ...fixture,
      players: [
        { ...fixture.players[0], hand: [first, second] },
        ...fixture.players.slice(1),
      ],
    };
    const batch = (ids: string[], game = state) =>
      command(game, { type: "play-batch", playerId: "p1", cardIds: ids });
    const before = structuredClone(state);
    for (const ids of [
      [first.id],
      [first.id, first.id],
      [first.id, yellow.id],
      [first.id, second.id, "unknown"],
    ]) {
      expect(batch(ids)).toEqual({ ok: false, error: "illegal-batch" });
      expect(state).toEqual(before);
    }
    expect(
      batch([first.id, second.id], { ...state, identicalNumbers: false }).ok,
    ).toBe(false);
    expect(
      batch([first.id, second.id], {
        ...state,
        turn: { kind: "drawn", cardId: first.id },
      }).ok,
    ).toBe(false);
    const result = active(batch([first.id, second.id]));
    expect(result.phase).toBe("finished");
    expect(result.discard.slice(0, 2)).toEqual([second, first]);
    expect(result.statistics).toMatchObject({ turns: 1, played: 2 });
    expect(result.players[0].hand).toEqual([]);
    const continuing = {
      ...state,
      players: [
        {
          ...state.players[0],
          hand: [
            first,
            second,
            green,
            card("red-9-0"),
            card("red-skip-0"),
            card("red-skip-1"),
          ],
        },
        ...state.players.slice(1),
      ],
    };
    for (const ids of [
      [first.id, "red-9-0"],
      ["red-skip-0", "red-skip-1"],
    ]) {
      expect(batch(ids, continuing)).toEqual({
        ok: false,
        error: "illegal-batch",
      });
    }
    expect(
      batch([first.id, green.id], {
        ...continuing,
        discard: [card("yellow-8-1")],
        color: "yellow",
      }),
    ).toEqual({ ok: false, error: "illegal-batch" });
    const nonmatchingTop = card("yellow-0-0");
    expect(
      batch([first.id, second.id], {
        ...continuing,
        discard: [nonmatchingTop],
        color: "yellow",
      }),
    ).toEqual({ ok: false, error: "illegal-batch" });
    expect(active(batch([second.id, first.id], continuing))).toMatchObject({
      current: 1,
      turnNumber: 2,
      discard: [first, second, top],
    });
  });

  it("follows a reversed direction and never permits a Reverse to break a penalty", () => {
    const fixture = table(card("red-draw-two-0"), { direction: -1 });
    const state = {
      ...fixture,
      players: [
        ...fixture.players.slice(0, 2),
        {
          ...fixture.players[2],
          hand: [card("red-reverse-0"), card("red-skip-0")],
        },
      ],
    };
    const pending = active(play(state));
    expect(pending.current).toBe(2);
    for (const id of ["red-reverse-0", "red-skip-0"])
      expect(
        command(pending, { type: "play", playerId: "p3", cardId: id }).ok,
      ).toBe(false);
    const next = active(
      command(pending, { type: "accept-penalty", playerId: "p3" }),
    );
    expect(next).toMatchObject({ current: 1, direction: -1 });
    const scored = active(command(pending, { type: "end-and-score" }));
    expect(scored.penalty).toBeUndefined();
    expect(scored.players).toEqual(pending.players);
    expect(scored.statistics.drawn).toBe(0);
  });

  it("accumulates same-kind Draw Two cards in a two-seat game and allows voluntary acceptance", () => {
    const start = table(card("red-draw-two-0"));
    const state = {
      ...start,
      players: [
        {
          ...start.players[0],
          hand: [...start.players[0].hand, card("red-draw-two-1")],
        },
        {
          ...start.players[1],
          hand: [yellow, card("green-draw-two-0"), card("wild-four-0")],
        },
      ],
    };
    const pending = active(play(state));
    expect(
      command(pending, { type: "play", playerId: "p2", cardId: "wild-four-0" })
        .ok,
    ).toBe(false);
    expect(
      command(pending, { type: "play", playerId: "p2", cardId: yellow.id }).ok,
    ).toBe(false);
    expect(command(pending, { type: "draw", playerId: "p2" }).ok).toBe(false);
    const stacked = active(
      command(pending, {
        type: "play",
        playerId: "p2",
        cardId: "green-draw-two-0",
      }),
    );
    expect(stacked).toMatchObject({
      current: 0,
      penalty: { kind: "draw-two", count: 4 },
    });
    const accepted = active(
      command(stacked, { type: "accept-penalty", playerId: "p1" }),
    );
    expect(accepted.players[0].hand).toHaveLength(6);
    expect(accepted.current).toBe(1);
    expect(accepted.penalty).toBeUndefined();
    expect(accepted.statistics).toMatchObject({
      played: 2,
      drawn: 4,
      turns: 3,
    });
  });

  it("requires color for a Wild Draw Four stack and settles a winning stack once", () => {
    const fixture = table(card("wild-four-0"));
    const state = {
      ...fixture,
      players: [
        fixture.players[0],
        { ...fixture.players[1], hand: [card("wild-four-1")] },
        fixture.players[2],
      ],
    };
    const choosing = active(play(state));
    const pending = active(
      command(choosing, {
        type: "choose-color",
        playerId: "p1",
        color: "blue",
      }),
    );
    const stackColor = active(
      command(pending, { type: "play", playerId: "p2", cardId: "wild-four-1" }),
    );
    expect(stackColor.turn.kind).toBe("wild");
    expect(stackColor.penalty?.count).toBe(4);
    expect(
      command(stackColor, { type: "accept-penalty", playerId: "p2" }).ok,
    ).toBe(false);
    const result = command(stackColor, {
      type: "choose-color",
      playerId: "p2",
      color: "green",
    });
    const finished = active(result);
    expect(finished).toMatchObject({
      phase: "finished",
      result: { winnerId: "p2" },
      color: "green",
    });
    expect(finished.penalty).toBeUndefined();
    expect(result.ok && result.events).toContainEqual({
      type: "drew",
      playerId: "p3",
      count: 4,
      penalty: 8,
    });
    expect(finished.statistics).toMatchObject({
      turns: 2,
      played: 2,
      wilds: 2,
      drawn: 4,
    });
  });

  it("holds a last Wild until a valid color is chosen", () => {
    const state = active(play(table(card("wild-0"), {}, true)));
    expect(state.turn.kind).toBe("wild");
    expect(state.players[0].hand).toHaveLength(1);
    expect(draw(state)).toEqual({ ok: false, error: "illegal-action" });
    const choose = (color: Color) =>
      executeCommand(
        state,
        { type: "choose-color", playerId: "p1", color },
        { random, at: 0 },
      );
    expect(choose("purple" as Color)).toEqual({
      ok: false,
      error: "invalid-color",
    });
    const next = active(choose("green"));
    expect(next.color).toBe("green");
    expect(next.phase).toBe("finished");
    expect(next.players[0].hand).toHaveLength(0);
  });

  it("offers only a legal drawn card or advance, and auto-passes an illegal draw", () => {
    const held = card("red-6-0");
    const drawn = card("yellow-5-1");
    const pending = active(draw(table(held, { drawPile: [drawn] })));
    expect(pending.turn).toEqual({ kind: "drawn", cardId: drawn.id });
    expect(play(pending)).toEqual({ ok: false, error: "illegal-card" });
    expect(
      active(
        executeCommand(
          pending,
          { type: "play", playerId: "p1", cardId: drawn.id },
          { random, at: 0 },
        ),
      ).discard[0],
    ).toEqual(drawn);
    expect(
      active(
        executeCommand(
          pending,
          { type: "advance", playerId: "p1" },
          { random, at: 0 },
        ),
      ).current,
    ).toBe(1);
    expect(active(draw(table(held))).current).toBe(1);
  });

  it("passes an empty draw when no discard is recyclable", () => {
    const next = active(draw(table(yellow, { drawPile: [] })));
    expect(next.players[0].hand).toHaveLength(2);
    expect(next.current).toBe(1);
    expect(next.discard).toEqual([top]);
  });

  it("recycles only older discards using injected randomness", () => {
    const source = vi.fn(() => 0);
    const state = table(yellow, {
      drawPile: [],
      discard: [top, green, card("green-3-0")],
    });
    const next = active(
      executeCommand(
        state,
        { type: "draw", playerId: "p1" },
        { random: source, at: 0 },
      ),
    );
    expect(next.discard).toEqual([top]);
    expect(next.players[0].hand.at(-1)?.id).toBe("green-3-0");
    expect(next.drawPile).toEqual([green]);
    expect(source).toHaveBeenCalledOnce();
  });

  it("resolves a last-card penalty before winning, with partial draws if necessary", () => {
    const result = play(table(card("red-draw-two-0"), { drawPile: [] }, true));
    const next = active(result);
    expect(next.phase).toBe("finished");
    if (next.phase !== "finished") throw new Error("Expected a result");
    expect(next.result).toEqual({ reason: "empty-hand", winnerId: "p1" });
    expect(next.current).toBe(0);
    expect(next.players[1].hand).toEqual([yellow, top]);
    expect(result.ok && result.events.map(({ type }) => type)).toEqual([
      "played",
      "drew",
      "skipped",
      "won",
    ]);
    expect(draw(next)).toEqual({ ok: false, error: "wrong-phase" });
  });

  it.each([
    { seatCounts: [2, 1, 3], winnerIds: ["p2"] },
    { seatCounts: [2, 1, 1], winnerIds: ["p2", "p3"] },
  ])(
    "scores remaining hands with counts $seatCounts",
    ({ seatCounts, winnerIds }) => {
      const initial = table(card("wild-0"));
      const randomSource = vi.fn(random);
      const state = table(card("wild-0"), {
        turn: { kind: "wild", cardId: "wild-0" },
        players: initial.players
          .map((player, index) => ({
            ...player,
            hand: deck.slice(index * 4, index * 4 + seatCounts[index]),
          }))
          .map((player, index) =>
            index === 0 ? { ...player, hand: initial.players[0].hand } : player,
          ),
      });
      const command = { type: "end-and-score" } as const;
      const outcome = executeCommand(state, command, {
        random: randomSource,
        at: 0,
      });
      const next = active(outcome);
      if (next.phase !== "finished") throw new Error("Expected a result");
      expect(next.result).toEqual({ reason: "early-score", winnerIds });
      expect(outcome.ok && outcome.events).toEqual([
        { type: "scored", winnerIds },
      ]);
      expect(next.players.map(({ hand }) => hand.length)).toEqual(seatCounts);
      expect(next.discard).toEqual(state.discard);
      expect(randomSource).not.toHaveBeenCalled();
      expect(executeCommand(next, command, { random, at: 0 })).toEqual({
        ok: false,
        error: "wrong-phase",
      });
    },
  );
});
