import { expect, it, vi } from "vitest";
import { createLocalGameService } from "../../src/application/local-game";
import { inMemoryGame } from "../../src/infrastructure/local-adapters";
import { projectPlayer } from "../../src/application/player-view";
import type { GameState } from "../../src/domain/model";

it("loads and saves via injected ports, rejects invalid commands without saving or consuming randomness", () => {
  let state: GameState | undefined;
  const save = vi.fn((next: GameState) => {
    state = next;
  });
  const load = vi.fn(() => state);
  const next = vi.fn(() => 0.999);
  const clear = vi.fn(() => {
    state = undefined;
  });
  const service = createLocalGameService(
    { load, save, clear },
    { next },
    () => 0,
  );
  expect(service.humanMove({ type: "draw" })).toEqual({
    ok: false,
    error: "wrong-phase",
  });
  expect(service.startBotMatch("A", 0)).toEqual({
    ok: false,
    error: "invalid-players",
  });
  expect(next).not.toHaveBeenCalled();
  expect(service.startBotMatch(" A ", 1).ok).toBe(true);
  expect(next).toHaveBeenCalledTimes(107);
  expect(service.humanMove({ type: "play", cardId: "fake" })).toEqual({
    ok: false,
    error: "illegal-card",
  });
  expect(load).toHaveBeenCalled();
  expect(save).toHaveBeenCalledTimes(2);
  expect(next).toHaveBeenCalledTimes(107);
  service.leaveGame();
  expect(clear).toHaveBeenCalledOnce();
  expect(service.getTableView()).toBeUndefined();
  expect(service.getHumanView()).toBeUndefined();
  expect(service.endAndScore()).toEqual({ ok: false, error: "wrong-phase" });
});

it("projects detached, personalized views with inactive actions and no hidden identities", () => {
  let state: GameState | undefined;
  const load = (): GameState | undefined => state;
  const service = createLocalGameService(
    {
      load,
      save: (next) => {
        state = next;
      },
      clear: () => {
        state = undefined;
      },
    },
    { next: () => 0.999 },
    () => 0,
  );
  service.startBotMatch("A", 1);
  const one = service.getHumanView()!;
  const snapshot = load();
  if (!snapshot || snapshot.phase === "setup")
    throw new Error("Expected playing match");
  const two = projectPlayer(snapshot, "p2")!;
  const publicView = service.getTableView();
  expect(one.players).toEqual([
    { id: "p1", name: "A", count: 7 },
    { id: "p2", name: "Bot 1", count: 7 },
  ]);
  expect(one.hand).toHaveLength(7);
  expect(two.actions).toEqual({
    canDraw: false,
    canAcceptPenalty: false,
    groups: [],
    canAdvance: false,
    playableIds: [],
    wildColors: [],
  });
  for (const held of two.hand)
    expect(JSON.stringify(one)).not.toContain(held.id);
  for (const held of one.hand)
    expect(JSON.stringify(publicView)).not.toContain(held.id);
  one.hand.splice(0);
  expect(service.getHumanView()?.hand).toHaveLength(7);
});

it("reports live draw counts when the pile is consumed and replenished", () => {
  let state: GameState | undefined;
  const repo = {
    load: () => state,
    save: (next: GameState) => {
      state = next;
    },
    clear: () => {
      state = undefined;
    },
  };
  const service = createLocalGameService(repo, { next: () => 0.999 }, () => 0);
  service.startBotMatch("A", 1);
  expect(service.getTableView()?.drawCount).toBe(93);
  expect(service.humanMove({ type: "draw" }).ok).toBe(true);
  expect(service.getTableView()?.drawCount).toBe(92);
  const snapshot = repo.load();
  if (snapshot?.phase !== "playing") throw new Error("Expected live match");
  repo.save({
    ...snapshot,
    turn: { kind: "ready" },
    drawPile: [],
    discard: [snapshot.discard[0], ...snapshot.drawPile],
  });
  expect(service.getTableView()?.drawCount).toBe(0);
  expect(service.humanMove({ type: "draw" }).ok).toBe(true);
  expect(service.getTableView()?.drawCount).toBe(91);
  expect(service.getTableView()?.discard).toEqual(snapshot.discard[0]);
});

it("uses the injected clock and preserves a pending draw when scoring early", () => {
  let now = 1000;
  const game = createLocalGameService(
    inMemoryGame(),
    { next: () => 0.999 },
    () => now,
  );
  expect(game.startBotMatch("Human", 1).ok).toBe(true);
  now = 2000;
  expect(game.humanMove({ type: "draw" }).ok).toBe(true);
  now = 6500;
  expect(game.endAndScore().ok).toBe(true);
  expect(game.getTableView()?.summary).toEqual({
    durationMs: 5500,
    turns: 0,
    played: 0,
    drawn: 1,
    actions: 0,
    wilds: 0,
    players: [
      { id: "p1", name: "Human", remaining: 8, played: 0, drawn: 1 },
      { id: "p2", name: "Bot 1", remaining: 7, played: 0, drawn: 0 },
    ],
  });
  now = 7000;
  expect(game.restartGame().ok).toBe(true);
  now = 8000;
  expect(game.endAndScore().ok).toBe(true);
  expect(game.getTableView()?.summary).toMatchObject({
    durationMs: 1000,
    drawn: 0,
  });
});
