import { expect, it } from "vitest";
import { chooseBotMove } from "../../src/application/bot";
import { projectPlayer } from "../../src/application/player-view";
import { startStatistics } from "../../src/domain/match-statistics";
import { createDeck } from "../../src/domain/deck";
import type { ActiveGame, Card } from "../../src/domain/model";

it("chooses from the acting seat's legal actions and counts only its own colors", () => {
  const deck = createDeck();
  const get = (id: string) => deck.find((card) => card.id === id) as Card;
  const state: ActiveGame = {
    phase: "playing",
    identicalNumbers: false,
    current: 1,
    direction: 1,
    turn: { kind: "wild", cardId: "wild-0" },
    turnNumber: 2,
    statistics: startStatistics(0),
    color: "red",
    discard: [get("red-0-0")],
    drawPile: [],
    players: [
      {
        id: "p1",
        name: "Human",
        hand: [get("blue-2-0"), get("blue-3-0"), get("blue-4-0")],
      },
      {
        id: "p2",
        name: "Bot 1",
        hand: [
          get("blue-5-0"),
          get("green-2-0"),
          get("green-3-0"),
          get("wild-0"),
        ],
      },
    ],
  };
  expect(chooseBotMove(projectPlayer(state, "p1")!)).toBeUndefined();
  expect(chooseBotMove(projectPlayer(state, "p2")!)).toEqual({
    type: "choose-color",
    color: "green",
  });
  expect(
    chooseBotMove(projectPlayer({ ...state, turn: { kind: "ready" } }, "p2")!),
  ).toEqual({ type: "play", cardId: "wild-0" });
  const penalized: ActiveGame = {
    ...state,
    turn: { kind: "ready" },
    penalty: { kind: "draw-two", count: 4 },
  };
  expect(chooseBotMove(projectPlayer(penalized, "p2")!)).toEqual({
    type: "accept-penalty",
  });
  const withStack = {
    ...penalized,
    players: [
      state.players[0],
      {
        ...state.players[1],
        hand: [...state.players[1].hand, get("green-draw-two-0")],
      },
    ],
  };
  expect(chooseBotMove(projectPlayer(withStack, "p2")!)).toEqual({
    type: "play",
    cardId: "green-draw-two-0",
  });
});
