// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { createLocalGameService } from "../../src/application/local-game";
import { inMemoryGame } from "../../src/infrastructure/local-adapters";
import { App } from "../../src/presentation/App";

afterEach(cleanup);

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
  const game = createLocalGameService(inMemoryGame(), { next: () => 0.999 });
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
  const scores = screen.getByRole("list", { name: "Remaining cards" });
  expect(within(scores).getAllByText("7 cards")).toHaveLength(2);
});

it("renders the Wild color controls and shows the selected color during a bot turn", async () => {
  const user = userEvent.setup();
  let first = true;
  const game = createLocalGameService(inMemoryGame(), {
    next: () => {
      if (!first) return 0.999;
      first = false;
      return 0;
    },
  });
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

it("advances bot turns and cancels scheduled moves when leaving", async () => {
  const { user, game } = await startMatch();
  const bot = vi.spyOn(game, "botStep");
  await user.click(screen.getAllByRole("button", { name: /Play Red/ })[0]);
  expect(screen.getByRole("heading", { name: /Bot 1/ })).toBeTruthy();
  await screen.findByRole("heading", { name: /Player 1/ });
  expect(bot).toHaveBeenCalled();
  await user.click(
    screen
      .getAllByRole<HTMLButtonElement>("button", { name: /Play Red/ })
      .find((button) => !button.disabled)!,
  );
  await user.click(screen.getByRole("button", { name: "Exit Game" }));
  await user.click(screen.getByRole("button", { name: "Leave Game" }));
  const calls = bot.mock.calls.length;
  await new Promise((resolve) => setTimeout(resolve, 450));
  expect(bot).toHaveBeenCalledTimes(calls);
  expect(game.getHumanView()).toBeUndefined();
});
