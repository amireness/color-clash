import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { LocalGame, Outcome } from "../application/local-game";
import type { Card, PlayerView, TableView } from "../application/player-view";

const symbols = { red: "◆", yellow: "✦", green: "●", blue: "▲" };
const actions = {
  skip: "⊘",
  reverse: "⇄",
  "draw-two": "+2",
  "wild-draw-four": "+4",
};
const names = {
  skip: "Skip",
  reverse: "Reverse",
  "draw-two": "Draw Two",
  wild: "Wild",
  "wild-draw-four": "Wild Draw Four",
};
const title = (word: string) => word[0].toUpperCase() + word.slice(1);

function cardName(card: Card) {
  const name = card.kind === "number" ? card.value : names[card.kind];
  return !("color" in card) ? name : `${title(card.color)} ${name}`;
}

function CardFace({ card }: { card: Card }) {
  const color = "color" in card ? card.color : "wild";
  return (
    <span className={`card face ${color}`} aria-hidden="true">
      {"color" in card ? (
        <span className="corner">{symbols[card.color]}</span>
      ) : (
        <span className="corner wild-mark" />
      )}
      <strong>
        {card.kind === "number" ? (
          card.value
        ) : card.kind === "wild" ? (
          <span className="wild-mark wild-emblem" />
        ) : (
          actions[card.kind]
        )}
      </strong>
    </span>
  );
}

function CardBack() {
  return (
    <span className="card back" aria-hidden="true">
      <strong>✦</strong>
    </span>
  );
}

function ConfirmMatchAction({
  action,
  onCancel,
  onConfirm,
}: {
  action: "leave" | "score";
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const leaving = action === "leave";

  return (
    <dialog
      ref={dialog}
      className="panel confirmation"
      aria-labelledby="confirmation-title"
      aria-describedby="confirmation-message"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id="confirmation-title">
        {leaving ? "Leave this game?" : "End and score this game?"}
      </h2>
      <p id="confirmation-message">
        {leaving
          ? "Your current match will end, and your progress won't be saved."
          : "Color Clash house rule: The fewest cards wins. Players with the same lowest count tie."}
      </p>
      <div className="button-row">
        <button className="quiet" autoFocus onClick={onCancel}>
          Cancel
        </button>
        <button className="primary" onClick={onConfirm}>
          {leaving ? "Leave Game" : "End & Score"}
        </button>
      </div>
    </dialog>
  );
}

const errors = {
  "invalid-players":
    "Enter two to four different names, up to 24 characters each.",
  "wrong-phase": "That action is unavailable at this stage.",
  "wrong-player": "It’s another player’s turn.",
  "illegal-card": "That card can’t be played right now.",
  "illegal-action": "That action is unavailable this turn.",
  "invalid-color": "Choose one of the four colors.",
};

function describe(outcome: Extract<Outcome, { ok: true }>, table: TableView) {
  const name = (id: string) =>
    table.players.find((player) => player.id === id)?.name ?? id;
  return outcome.events
    .flatMap((event) => {
      switch (event.type) {
        case "played":
          return [`${name(event.playerId)} played ${cardName(event.card)}.`];
        case "drew":
          return [
            event.count
              ? `${name(event.playerId)} drew ${event.count}.`
              : "The draw pile was empty.",
          ];
        case "reversed":
          return ["Direction reversed."];
        case "skipped":
          return [`${name(event.playerId)} was skipped.`];
        default:
          return [];
      }
    })
    .join(" ");
}

function resultTitle(
  table: TableView,
  result: NonNullable<TableView["result"]>,
) {
  const playerName = (id: string) =>
    table.players.find((player) => player.id === id)?.name ?? id;
  if (result.reason === "empty-hand")
    return `${playerName(result.winnerId)} wins!`;
  const winners = result.winnerIds.map(playerName);
  return winners.length === 1
    ? `${winners[0]} wins!`
    : `Tie: ${winners.join(", ")}`;
}

export function App({ game }: { game: LocalGame }) {
  const [screen, setScreen] = useState<"home" | "setup" | "game">("home");
  const [count, setCount] = useState(1);
  const [playerName, setPlayerName] = useState("Player 1");
  const [table, setTable] = useState<TableView>();
  const [view, setView] = useState<PlayerView>();
  const [message, setMessage] = useState("");
  const [rules, setRules] = useState(false);
  const [confirmation, setConfirmation] = useState<"leave" | "score">();
  const dialogTrigger = useRef<HTMLElement>(null);
  const focusTarget = useRef<HTMLHeadingElement>(null);
  const botTurn =
    table?.phase === "playing" && view?.viewerId !== table.current.id;
  const choosingWild = Boolean(view?.actions.wildColors.length);

  useLayoutEffect(() => {
    focusTarget.current?.focus();
  }, [screen, table?.phase, choosingWild]);

  function navigate(next: "home" | "setup") {
    setMessage("");
    setTable(undefined);
    setView(undefined);
    setScreen(next);
  }

  function cancelConfirmation() {
    setConfirmation(undefined);
  }

  useLayoutEffect(() => {
    if (!confirmation) {
      dialogTrigger.current?.focus();
      dialogTrigger.current = null;
    }
  }, [confirmation]);

  function confirm() {
    dialogTrigger.current = null;
    setConfirmation(undefined);
    if (confirmation === "leave") {
      game.leaveGame();
      setRules(false);
      navigate("home");
    } else {
      update(game.endAndScore());
    }
  }

  function update(outcome: Outcome) {
    if (!outcome.ok) {
      setMessage(errors[outcome.error]);
      return;
    }
    const next = game.getTableView();
    if (!next) return;
    setTable(next);
    setView(game.getHumanView());
    setMessage(describe(outcome, next));
    setScreen("game");
  }

  function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    update(game.startBotMatch(playerName, count));
  }

  useEffect(() => {
    if (!botTurn || confirmation) return;
    const timer = setTimeout(() => update(game.botStep()), 400);
    return () => clearTimeout(timer);
  }, [botTurn, view, confirmation, game]);

  return (
    <div className="shell">
      <header className="masthead">
        <div className="brand">
          <span aria-hidden="true">✦</span> COLOR CLASH
        </div>
        <nav className="header-controls" aria-label="Game controls">
          <button
            className="quiet"
            aria-expanded={rules}
            onClick={() => setRules(!rules)}
          >
            {rules ? "Close rules" : "How to Play"}
          </button>
          {screen === "game" && table?.phase === "playing" && (
            <>
              <button
                className="quiet"
                onClick={(event) => {
                  dialogTrigger.current = event.currentTarget;
                  setConfirmation("leave");
                }}
              >
                Exit Game
              </button>
              <details className="game-menu">
                <summary className="quiet">Game menu</summary>
                <div>
                  <button
                    className="quiet"
                    onClick={(event) => {
                      const menu = event.currentTarget.closest("details");
                      dialogTrigger.current =
                        menu?.querySelector("summary") ?? null;
                      menu?.removeAttribute("open");
                      setConfirmation("score");
                    }}
                  >
                    End &amp; Score
                  </button>
                </div>
              </details>
            </>
          )}
        </nav>
      </header>
      {confirmation && (
        <ConfirmMatchAction
          action={confirmation}
          onCancel={cancelConfirmation}
          onConfirm={confirm}
        />
      )}
      {rules && (
        <aside className="rules" aria-label="How to play">
          <p>
            Match the active color, number, or action. A Wild lets you pick any
            color. Empty your hand first to win.
          </p>
          <p>
            Skip passes over one player. Reverse flips direction and skips in a
            two-player match. Draw Two makes the next player draw two and miss
            their turn.
          </p>
          <p>
            You can draw instead of playing. Play the drawn card if it matches
            or end your turn. Wild Draw Four sets a color and makes the next
            player draw up to four cards and miss their turn.
          </p>
        </aside>
      )}
      <main
        className={
          screen === "game" && table?.phase === "playing"
            ? "game-main"
            : undefined
        }
      >
        {screen === "home" && (
          <section className="hero">
            <div>
              <p className="eyebrow">ONE HUMAN · UP TO THREE BOTS</p>
              <h1 ref={focusTarget} tabIndex={-1}>
                Color
                <br />
                <em>Clash.</em>
              </h1>
              <p className="lede">
                Match colors. Flip the turn. Be the first to empty your hand.
              </p>
              <button className="primary" onClick={() => navigate("setup")}>
                Play vs Bots <span aria-hidden="true">→</span>
              </button>
            </div>
            <div className="art" aria-hidden="true">
              <CardFace
                card={{
                  kind: "number",
                  id: "art-yellow",
                  color: "yellow",
                  value: 7,
                }}
              />
              <CardFace
                card={{ kind: "reverse", id: "art-blue", color: "blue" }}
              />
              <CardFace
                card={{
                  kind: "number",
                  id: "art-red",
                  color: "red",
                  value: 3,
                }}
              />
            </div>
          </section>
        )}
        {screen === "setup" && (
          <section className="panel setup">
            <button className="quiet" onClick={() => navigate("home")}>
              ← Home
            </button>
            <h1 ref={focusTarget} tabIndex={-1}>
              Set up the table
            </h1>
            <form onSubmit={start}>
              <fieldset>
                <legend>Computer opponents</legend>
                <div className="segments">
                  {[1, 2, 3].map((size) => (
                    <label key={size}>
                      <input
                        type="radio"
                        name="count"
                        checked={count === size}
                        onChange={() => setCount(size)}
                      />
                      <span>{size}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label>
                Your name
                <input
                  className="name-input"
                  value={playerName}
                  required
                  maxLength={24}
                  onChange={(event) => setPlayerName(event.target.value)}
                />
              </label>
              <p role="status">{message}</p>
              <button className="primary" type="submit">
                Deal cards <span aria-hidden="true">→</span>
              </button>
            </form>
          </section>
        )}
        {screen === "game" &&
          table &&
          (table.result ? (
            <section className="panel interlude">
              <div className="large-mark" aria-hidden="true">
                ✦
              </div>
              <p className="eyebrow">
                {table.result.reason === "early-score"
                  ? "COLOR CLASH HOUSE RULE · END & SCORE"
                  : "MATCH COMPLETE"}
              </p>
              <h1 ref={focusTarget} tabIndex={-1}>
                {resultTitle(table, table.result)}
              </h1>
              {table.result.reason === "early-score" && (
                <ul className="scores" aria-label="Remaining cards">
                  {table.players.map(({ id, name, count }) => (
                    <li key={id}>
                      <strong>{name}</strong>
                      <span>
                        {count} {count === 1 ? "card" : "cards"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p role="status">{message}</p>
              <div className="button-row">
                <button
                  className="primary"
                  onClick={() => update(game.restartGame())}
                >
                  Play again
                </button>
                <button className="quiet" onClick={() => navigate("setup")}>
                  Change players
                </button>
              </div>
            </section>
          ) : (
            <section className="board">
              <div className="board-heading">
                <div>
                  <p className="eyebrow">TURN {table.turnNumber}</p>
                  <h1 ref={view ? focusTarget : undefined} tabIndex={-1}>
                    {table.current.name}’s turn
                  </h1>
                </div>
                <p className="direction">
                  <span aria-hidden="true">
                    {table.direction === 1 ? "↻" : "↺"}
                  </span>{" "}
                  {table.direction === 1 ? "Clockwise" : "Counterclockwise"}
                </p>
              </div>
              <ul className="seats" aria-label="Players">
                {table.players.map((player) => (
                  <li
                    key={player.id}
                    aria-current={
                      player.id === table.current.id ? "true" : undefined
                    }
                  >
                    <strong>
                      <i
                        className={`seat-accent seat-${player.id}`}
                        aria-hidden="true"
                      />
                      {player.name}
                      {player.id === view?.viewerId ? " (you)" : ""}
                    </strong>
                    <span>
                      {player.count} {player.count === 1 ? "card" : "cards"}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="table">
                <div className="pile">
                  <button
                    className="card-button"
                    aria-label="Draw a card"
                    disabled={!view?.actions.canDraw}
                    onClick={() => update(game.humanMove({ type: "draw" }))}
                  >
                    <CardBack />
                  </button>
                  <span>
                    {table.drawCount} {table.drawCount === 1 ? "card" : "cards"}{" "}
                    left
                  </span>
                </div>
                <div className="pile">
                  <div
                    key={table.discard.id}
                    className="discard"
                    role="img"
                    aria-label={`Discard: ${cardName(table.discard)}`}
                  >
                    <CardFace card={table.discard} />
                  </div>
                  <span className={`active-color ${table.color}`}>
                    {symbols[table.color]} {title(table.color)}
                  </span>
                </div>
              </div>
              <p className="feedback" role="status">
                {message ||
                  (botTurn
                    ? `${table.current.name} is thinking…`
                    : "Choose a matching card or draw one.")}
              </p>
              {view ? (
                <>
                  {view.actions.wildColors.length > 0 && (
                    <fieldset className="wild-picker">
                      <legend>Choose the active color</legend>
                      <div className="button-row">
                        {view.actions.wildColors.map((color) => (
                          <button
                            key={color}
                            className={`swatch ${color}`}
                            onClick={() =>
                              update(
                                game.humanMove({ type: "choose-color", color }),
                              )
                            }
                          >
                            {symbols[color]} {title(color)}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  )}
                  <section
                    className={botTurn ? "hand-area waiting" : "hand-area"}
                    aria-label="Your hand"
                  >
                    <div className="hand-heading">
                      <h2>Your hand</h2>
                      {view.actions.canAdvance && (
                        <button
                          className="quiet"
                          onClick={() =>
                            update(game.humanMove({ type: "advance" }))
                          }
                        >
                          End turn →
                        </button>
                      )}
                    </div>
                    <div className="hand">
                      {view.hand.map((card) => (
                        <button
                          key={card.id}
                          className="card-button"
                          aria-label={`Play ${cardName(card)}`}
                          disabled={!view.actions.playableIds.includes(card.id)}
                          onClick={() =>
                            update(
                              game.humanMove({ type: "play", cardId: card.id }),
                            )
                          }
                        >
                          <CardFace card={card} />
                        </button>
                      ))}
                    </div>
                  </section>
                </>
              ) : null}
            </section>
          ))}
      </main>
      <footer>
        COLOR CLASH <span>◆ ✦ ● ▲</span> LOCAL PLAY
      </footer>
    </div>
  );
}
