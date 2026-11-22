// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import { createLocalGameService } from "../../src/application/local-game";
import { inMemoryGame } from "../../src/infrastructure/local-adapters";
import { App } from "../../src/presentation/App";
import { useMatchPlayback } from "../../src/presentation/match-playback";
import type { MatchFrame } from "../../src/presentation/match-playback";

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// jsdom lacks the native dialog methods used to open and close the modal.
beforeAll(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = true;
      },
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = false;
      },
    },
  });
});

afterAll(() => {
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

async function startMatch() {
  const user = userEvent.setup();
  const game = createLocalGameService(
    inMemoryGame(),
    { next: () => 0.999 },
    () => 0,
  );
  render(<App game={game} />);
  await user.click(screen.getByRole("button", { name: "Play vs Bots" }));
  await user.click(screen.getByRole("button", { name: "Deal cards" }));
  return { user, game };
}

it("keeps the public board visible and draws with symbolic cards and accessible labels", async () => {
  const { user } = await startMatch();
  const discard = screen.getByRole("img", { name: /Discard: Red \d/ });
  expect(discard.textContent).toMatch(/^◆\d$/);
  expect(screen.getByText("93 cards left")).toBeTruthy();
  const hand = screen.getByRole("region", { name: "Your hand" });
  expect(
    within(hand)
      .getAllByRole("button", { name: /Play Red \d/ })
      .every((button) => /^◆\d$/.test(button.textContent ?? "")),
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "Draw a card" }));
  expect(screen.getByText("92 cards left")).toBeTruthy();
});

it("cancels exit without changing the match, then clears it on confirmation", async () => {
  const { user, game } = await startMatch();
  const current = game.getTableView();
  const exit = screen.getByRole("button", { name: "Exit Game" });
  await user.click(exit);
  let dialog = screen.getByRole("dialog", { name: "Leave this game?" });
  expect(
    within(dialog).getByText(
      "Your current match will end, and your progress won't be saved.",
    ),
  ).toBeTruthy();
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(exit);
  expect(game.getTableView()).toEqual(current);
  expect(screen.getByRole("region", { name: "Your hand" })).toBeTruthy();
  await user.click(exit);
  dialog = screen.getByRole("dialog", { name: "Leave this game?" });
  await user.click(within(dialog).getByRole("button", { name: "Leave Game" }));
  expect(screen.getByRole("button", { name: "Play vs Bots" })).toBeTruthy();
  expect(game.getTableView()).toBeUndefined();
  expect(screen.queryByRole("heading", { name: /wins!|Tie:/ })).toBeNull();
});

it("confirms the house rule separately and displays all remaining counts in a tie", async () => {
  const { user, game } = await startMatch();
  async function openScoring() {
    await user.click(screen.getByText("Game menu"));
    await user.click(screen.getByRole("button", { name: "End & Score" }));
    return screen.getByRole("dialog", { name: "End and score this game?" });
  }
  let dialog = await openScoring();
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(game.getTableView()?.phase).toBe("playing");
  dialog = await openScoring();
  await user.click(within(dialog).getByRole("button", { name: "End & Score" }));
  expect(
    screen.getByRole("heading", { name: "Tie: Player 1, Bot 1" }),
  ).toBeTruthy();
  expect(screen.getByText(/Color Clash house rule/i)).toBeTruthy();
  const scores = screen.getByRole("table", { name: "Player statistics" });
  expect(within(scores).getAllByRole("cell", { name: "7" })).toHaveLength(2);
});

it("renders the Wild color controls and shows the selected color during a bot turn", async () => {
  const user = userEvent.setup();
  let first = true;
  const game = createLocalGameService(
    inMemoryGame(),
    {
      next: () => {
        if (!first) return 0.999;
        first = false;
        return 0;
      },
    },
    () => 0,
  );
  render(<App game={game} />);
  await user.click(screen.getByRole("button", { name: "Play vs Bots" }));
  await user.click(screen.getByRole("radio", { name: "3" }));
  await user.click(screen.getByRole("button", { name: "Deal cards" }));
  expect(
    within(screen.getByRole("list", { name: "Players" })).getAllByRole(
      "listitem",
    ),
  ).toHaveLength(4);
  await user.click(screen.getByRole("button", { name: "Play Wild" }));
  const picker = screen.getByRole("group", { name: "Choose the active color" });
  expect(within(picker).getAllByRole("button")).toHaveLength(4);
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: "Draw a card" })
      .disabled,
  ).toBe(true);
  await user.click(within(picker).getByRole("button", { name: /Green/ }));
  const hand = screen.getByRole("region", { name: "Your hand" });
  expect(
    within(hand)
      .getAllByRole("button")
      .every((button) => (button as HTMLButtonElement).disabled),
  ).toBe(true);
  expect(screen.getByRole("heading", { name: /Bot 1/ })).toBeTruthy();
  expect(screen.getByRole("img", { name: "Discard: Wild" })).toBeTruthy();
  expect(screen.getByText("● Green")).toBeTruthy();
});

it.each([
  ["Fast", 650],
  ["Normal", 2200],
  ["Relaxed", 4400],
] as const)(
  "paces %s bots once per turn and cancels work on exit",
  async (speed, delay) => {
    const { game } = await startMatch();
    vi.useFakeTimers();
    const bot = vi.spyOn(game, "botStep");
    const select = screen.getByLabelText<HTMLSelectElement>("Bot speed");
    expect(select.value).toBe("Normal");
    fireEvent.change(select, { target: { value: speed } });
    fireEvent.click(screen.getAllByRole("button", { name: /Play Red/ })[0]);
    expect(screen.getByRole("heading", { name: /Bot 1/ })).toBeTruthy();
    expect(screen.getByText("Deciding…")).toBeTruthy();
    act(() => vi.advanceTimersByTime(delay - 1));
    expect(bot).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(bot).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: /Player 1/ })).toBeTruthy();
    expect(document.querySelector(".card-flight")).toBeNull();
    fireEvent.click(
      screen
        .getAllByRole<HTMLButtonElement>("button", { name: /Play Red/ })
        .find((button) => !button.disabled)!,
    );
    fireEvent.click(screen.getByRole("button", { name: "Exit Game" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave Game" }));
    act(() => vi.advanceTimersByTime(5000));
    expect(bot).toHaveBeenCalledOnce();
    expect(game.getHumanView()).toBeUndefined();
  },
);

it("stages play, face-down penalty and skip before highlighting the next player", async () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  const user = userEvent.setup();
  let swaps = 0;
  const game = createLocalGameService(
    inMemoryGame(),
    { next: () => (++swaps === 5 ? 0 : 0.999) },
    () => 0,
  );
  render(<App game={game} />);
  await user.click(screen.getByRole("button", { name: "Play vs Bots" }));
  await user.click(screen.getByRole("radio", { name: "2" }));
  await user.click(screen.getByRole("button", { name: "Deal cards" }));
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: "Play Wild Draw Four" }));
  fireEvent.click(screen.getByRole("button", { name: /Green/ }));
  expect(game.getHumanView()?.current.name).toBe("Bot 1");
  expect(screen.getByRole("heading", { name: /Player 1/ })).toBeTruthy();
  expect(document.querySelectorAll(".card-flight .face")).toHaveLength(1);
  act(() => vi.advanceTimersByTime(440));
  expect(screen.getByRole("heading", { name: /Bot 1/ })).toBeTruthy();
  act(() => vi.advanceTimersByTime(2200));
  expect(screen.getByText("Bot 1 accepted +4 and drew 4.")).toBeTruthy();
  expect(document.querySelectorAll(".card-flight .back")).toHaveLength(4);
  expect(document.querySelectorAll(".card-flight .face")).toHaveLength(0);
  act(() => vi.advanceTimersByTime(560));
  expect(screen.getByText("Bot 1 was skipped.")).toBeTruthy();
  expect(screen.getByRole("heading", { name: /Bot 1/ })).toBeTruthy();
  act(() => vi.advanceTimersByTime(430));
  expect(screen.getByRole("heading", { name: /Bot 2/ })).toBeTruthy();
  expect(
    screen.getByRole("img", { name: "Discard: Wild Draw Four" }),
  ).toBeTruthy();
});

it("highlights only the active seat and selects identical cards for one command", async () => {
  const style = document.createElement("style");
  style.textContent = readFileSync("src/presentation/styles.css", "utf8");
  document.head.append(style);
  const user = userEvent.setup();
  const game = createLocalGameService(
    inMemoryGame(),
    { next: () => 0.999 },
    () => 0,
  );
  const move = vi.spyOn(game, "humanMove");
  render(<App game={game} />);
  await user.click(screen.getByRole("button", { name: "Play vs Bots" }));
  await user.click(screen.getByRole("checkbox", { name: /Allow identical/ }));
  await user.click(screen.getByRole("button", { name: "Deal cards" }));
  const seats = screen.getByRole("list", { name: "Players" });
  expect(seats.querySelector("[aria-current]")?.textContent).toContain(
    "Player 1",
  );
  expect(
    getComputedStyle(seats.querySelector("[aria-current]")!).backgroundColor,
  ).toBe("rgb(53, 71, 25)");
  expect(
    getComputedStyle(seats.querySelector("li:not([aria-current])")!)
      .backgroundColor,
  ).toBe("rgb(32, 33, 59)");
  const pair = screen.getAllByRole("button", { name: "Select Red 1" });
  await user.click(pair[0]);
  expect(pair[0].getAttribute("aria-pressed")).toBe("true");
  await user.click(pair[1]);
  expect(move).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Play 2 cards" }));
  expect(move).toHaveBeenCalledExactlyOnceWith({
    type: "play-batch",
    cardIds: ["red-1-0", "red-1-1"],
  });
  expect(seats.querySelectorAll("[aria-current]")).toHaveLength(1);
  expect(seats.querySelector("[aria-current]")?.textContent).toContain("Bot 1");
  expect(
    getComputedStyle(seats.querySelector("[aria-current]")!).backgroundColor,
  ).toBe("rgb(53, 71, 25)");
  style.remove();
});

it("offers a draw button and only matching stack controls when a bot passes a penalty", async () => {
  const user = userEvent.setup();
  let swaps = 0;
  const game = createLocalGameService(
    inMemoryGame(),
    {
      next: () =>
        ++swaps === 84 ? 7.25 / 25 : swaps === 85 ? 6.25 / 24 : 0.999,
    },
    () => 0,
  );
  render(<App game={game} />);
  await user.click(screen.getByRole("button", { name: "Play vs Bots" }));
  await user.click(screen.getByRole("button", { name: "Deal cards" }));
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: "Play Red 0" }));
  act(() => vi.advanceTimersByTime(2200));
  const penalty = screen.getByRole("region", { name: "Draw penalty" });
  expect(penalty.textContent).toContain("Draw 2 cards or stack +2.");
  expect(
    screen.getByRole<HTMLButtonElement>("button", {
      name: "Stack Red Draw Two",
    }).disabled,
  ).toBe(false);
  expect(
    screen
      .getAllByRole<HTMLButtonElement>("button", { name: "Play Red 1" })
      .every((button) => button.disabled),
  ).toBe(true);
  fireEvent.click(
    within(penalty).getByRole("button", { name: "Draw 2 cards" }),
  );
  expect(game.getHumanView()?.penalty).toBeUndefined();
  expect(screen.queryByRole("region", { name: "Draw penalty" })).toBeNull();
});

it("drops an obsolete online animation on reconnect and does not replay its revision", () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.useFakeTimers();
  const game = createLocalGameService(
    inMemoryGame(),
    { next: () => 0.999 },
    () => 0,
  );
  game.startBotMatch("Human", 1);
  const initial: MatchFrame = {
    view: game.getHumanView()!,
    events: [],
    revision: 3,
  };
  const move = game.humanMove({
    type: "play",
    cardId: initial.view.actions.playableIds[0],
  });
  if (!move.ok) throw new Error(move.error);
  const next = { view: game.getHumanView()!, events: move.events, revision: 4 };
  const { result, rerender, unmount } = renderHook(
    ({ frame, connected }) => useMatchPlayback(frame, "ROOM", connected),
    { initialProps: { frame: initial, connected: true } },
  );
  rerender({ frame: next, connected: true });
  expect(result.current.step?.type).toBe("played");
  rerender({ frame: next, connected: false });
  expect(result.current.step).toBeUndefined();
  expect(result.current.frame?.view.current.name).toBe("Bot 1");
  rerender({ frame: { ...next }, connected: true });
  expect(result.current.step).toBeUndefined();
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
