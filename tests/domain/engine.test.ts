import { describe, expect, it, vi } from "vitest";
import { createDeck, shuffle } from "../../src/domain/deck";
import { createGame, executeCommand } from "../../src/domain/engine";
import { colors } from "../../src/domain/model";
import type {
  ActiveGame,
  Card,
  Color,
  GameResult,
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
    current: 0,
    direction: 1,
    turn: { kind: "ready" },
    turnNumber: 1,
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
    { random },
  );
const draw = (state: ActiveGame) =>
  executeCommand(state, { type: "draw", playerId: "p1" }, { random });

describe("deck and setup", () => {
  it("creates 104 unique cards with exact per-color ranks and actions", () => {
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
        executeCommand(setup.state, { type: "start" }, { random }),
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
      { random },
    );
    const next = active(outcome);
    expect(next.color).toBe("blue");
    expect(next.discard[0].kind).toBe("wild-draw-four");
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
      executeCommand(state, { type: "draw", playerId: "p2" }, { random }),
    ).toEqual({ ok: false, error: "wrong-player" });
    expect(
      executeCommand(
        state,
        { type: "play", playerId: "p1", cardId: top.id },
        { random },
      ),
    ).toEqual({ ok: false, error: "illegal-card" });
    expect(
      executeCommand(state, { type: "advance", playerId: "p1" }, { random }),
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

  it("Draw Two forces two draws and skips without offering a response", () => {
    const next = active(play(table(card("red-draw-two-0"))));
    expect(next.players[1].hand).toHaveLength(3);
    expect(next.current).toBe(2);
    expect(next.drawPile).toHaveLength(0);
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
        { random },
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
          { random },
        ),
      ).discard[0],
    ).toEqual(drawn);
    expect(
      active(
        executeCommand(
          pending,
          { type: "advance", playerId: "p1" },
          { random },
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
        { random: source },
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
      const outcome = executeCommand(state, command, { random: randomSource });
      const next = active(outcome);
      if (next.phase !== "finished") throw new Error("Expected a result");
      expect(next.result).toEqual({ reason: "early-score", winnerIds });
      expect(outcome.ok && outcome.events).toEqual([
        { type: "scored", winnerIds },
      ]);
      expect(next.players.map(({ hand }) => hand.length)).toEqual(seatCounts);
      expect(next.discard).toEqual(state.discard);
      expect(randomSource).not.toHaveBeenCalled();
      expect(executeCommand(next, command, { random })).toEqual({
        ok: false,
        error: "wrong-phase",
      });
    },
  );
});
