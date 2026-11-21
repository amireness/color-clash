import { expect, it, vi } from "vitest";
import { createLocalGameService } from "../../src/application/local-game";
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
  const service = createLocalGameService({ load, save, clear }, { next });
  expect(service.startGame()).toEqual({ ok: false, error: "wrong-phase" });
  expect(service.createLocalGame(["A", "a"])).toEqual({
    ok: false,
    error: "invalid-players",
  });
  expect(service.createLocalGame([" A ", "B"]).ok).toBe(true);
  expect(next).not.toHaveBeenCalled();
  expect(service.startGame().ok).toBe(true);
  expect(next).toHaveBeenCalledTimes(107);
  expect(service.playCard("p2", "fake")).toEqual({
    ok: false,
    error: "wrong-player",
  });
  expect(service.playCard("p1", "fake")).toEqual({
    ok: false,
    error: "illegal-card",
  });
  expect(load).toHaveBeenCalled();
  expect(save).toHaveBeenCalledTimes(2);
  expect(next).toHaveBeenCalledTimes(107);
  service.leaveGame();
  expect(clear).toHaveBeenCalledOnce();
  expect(service.getTableView()).toBeUndefined();
  expect(service.getPlayerView("p1")).toBeUndefined();
  expect(service.endAndScore()).toEqual({ ok: false, error: "wrong-phase" });
});

it("projects detached, personalized views with inactive actions and no hidden identities", () => {
  let state: GameState | undefined;
  const service = createLocalGameService(
    {
      load: () => state,
      save: (next) => {
        state = next;
      },
      clear: () => {
        state = undefined;
      },
    },
    { next: () => 0.999 },
  );
  service.createLocalGame(["A", "B"]);
  service.startGame();
  const one = service.getPlayerView("p1")!;
  const two = service.getPlayerView("p2")!;
  const publicView = service.getTableView();
  expect(one.players).toEqual([
    { id: "p1", name: "A", count: 7 },
    { id: "p2", name: "B", count: 7 },
  ]);
  expect(one.hand).toHaveLength(7);
  expect(two.actions).toEqual({
    canDraw: false,
    canAdvance: false,
    playableIds: [],
    wildColors: [],
  });
  expect(service.getPlayerView("unknown")).toBeUndefined();
  for (const held of two.hand)
    expect(JSON.stringify(one)).not.toContain(held.id);
  for (const held of one.hand)
    expect(JSON.stringify(publicView)).not.toContain(held.id);
  one.hand.splice(0);
  expect(service.getPlayerView("p1")?.hand).toHaveLength(7);
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
  const service = createLocalGameService(repo, { next: () => 0.999 });
  service.createLocalGame(["A", "B"]);
  service.startGame();
  expect(service.getTableView()?.drawCount).toBe(93);
  expect(service.drawCard("p1").ok).toBe(true);
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
  expect(service.drawCard(snapshot.players[snapshot.current].id).ok).toBe(true);
  expect(service.getTableView()?.drawCount).toBe(91);
  expect(service.getTableView()?.discard).toEqual(snapshot.discard[0]);
});
