import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { FormEvent } from "react";
import type { LocalGame, Outcome } from "../application/local-game";
import type { OnlineGame, OnlineState } from "../application/online-game";
import type { MatchIntent } from "../application/match-intent";
import { FriendsLobby } from "./FriendsLobby";
import { PlayerHand } from "./PlayerHand";
import type { TableView } from "../application/player-view";

import { CardBack, CardFace, cardName, symbols, title } from "./Cards";
import { useMatchPlayback } from "./match-playback";
import type { MatchFrame } from "./match-playback";
import { CardFlight } from "./CardFlight";
import { MatchSummary } from "./MatchSummary";
import { botSpeeds, useBotPacing } from "./bot-pacing";
import type { BotSpeed } from "./bot-pacing";
import type { PublicEvent } from "../application/public-events";

function ConfirmMatchAction({
  action,
  online,
  onCancel,
  onConfirm,
}: {
  action: "leave" | "score";
  online: boolean;
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
          ? online
            ? "You will leave the room and this browser will forget your seat."
            : "Your current match will end, and your progress won't be saved."
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
  "illegal-batch": "Choose matching number cards of the same color and value.",
  "illegal-action": "That action is unavailable this turn.",
  "invalid-color": "Choose one of the four colors.",
};

function describe(events: readonly PublicEvent[], table: TableView) {
  const name = (id: string) =>
    table.players.find((player) => player.id === id)?.name ?? id;
  return events
    .flatMap((event) => {
      switch (event.type) {
        case "played":
          return [`${name(event.playerId)} played ${cardName(event.card)}.`];
        case "drew":
          if (event.penalty !== undefined)
            return [
              `${name(event.playerId)} accepted +${event.penalty} and drew ${event.count}.`,
            ];
          return [
            event.count
              ? `${name(event.playerId)} drew ${event.count}.`
              : "The draw pile was empty.",
          ];
        case "reversed":
          return ["Direction reversed."];
        case "stacked":
          return [
            `${name(event.playerId)} stacked the penalty to +${event.count}.`,
          ];
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

const idle: OnlineState = { status: "idle" };
const getIdle = () => idle;
const subscribeIdle = () => () => {};

export function App({
  game,
  online,
}: {
  game: LocalGame;
  online?: OnlineGame;
}) {
  const [screen, setScreen] = useState<"home" | "setup" | "game" | "online">(
    () =>
      online && new URLSearchParams(window.location.search).has("room")
        ? "online"
        : "home",
  );
  const onlineState = useSyncExternalStore(
    online?.subscribe ?? subscribeIdle,
    online?.getState ?? getIdle,
  );
  const remote = screen === "online";
  useEffect(() => {
    online?.restore();
  }, [online]);
  useEffect(() => {
    if (onlineState.room || onlineState.status === "reconnecting")
      setScreen("online");
  }, [onlineState.room, onlineState.status]);
  const [count, setCount] = useState(1);
  const [identicalNumbers, setIdenticalNumbers] = useState(false);
  const [playerName, setPlayerName] = useState("Player 1");
  const [localFrame, setFrame] = useState<MatchFrame>();
  const [speed, setSpeed] = useState<BotSpeed>("Normal");
  const [localMessage, setMessage] = useState("");
  const room = remote ? onlineState.room : undefined;
  const onlineFrame = useMemo(
    () =>
      room?.match
        ? { view: room.match, events: room.events, revision: room.revision }
        : undefined,
    [room],
  );
  const frame = remote ? onlineFrame : localFrame;
  const playback = useMatchPlayback(
    frame,
    room?.code ?? "local",
    !remote || onlineState.status === "connected",
  );
  const view = playback.frame?.view;
  const table = view;
  const discard = playback.landed ?? table?.discard;
  const actionMessage =
    table && playback.step ? describe([playback.step], table) : "";
  const message =
    (remote
      ? ((onlineState.error &&
          (Object.hasOwn(errors, onlineState.error)
            ? errors[onlineState.error as keyof typeof errors]
            : onlineState.error)) ??
        (onlineState.status === "reconnecting"
          ? "Reconnecting to your seat…"
          : ""))
      : localMessage) ||
    actionMessage ||
    (table && !playback.step
      ? describe(playback.frame?.events ?? [], table)
      : "");
  const animating = Boolean(playback.step);
  const blocked =
    animating ||
    (remote && (onlineState.status !== "connected" || onlineState.pending));
  const matchScreen = screen === "game" || (remote && Boolean(table));
  const [rules, setRules] = useState(false);
  const [confirmation, setConfirmation] = useState<"leave" | "score">();
  const dialogTrigger = useRef<HTMLElement>(null);
  const focusTarget = useRef<HTMLHeadingElement>(null);
  const otherTurn =
    table?.phase === "playing" && view?.viewerId !== table.current.id;
  const botTurn = !remote && otherTurn;
  const botActing =
    !remote &&
    localFrame?.view.viewerId !== localFrame?.view.current.id &&
    localFrame?.view.phase === "playing";
  const boardRef = useRef<HTMLElement>(null);
  const choosingWild = Boolean(view?.actions.wildColors.length);

  useLayoutEffect(() => {
    focusTarget.current?.focus();
  }, [screen, table?.phase, choosingWild]);

  function navigate(next: "home" | "setup") {
    setMessage("");
    setFrame(undefined);
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
      if (remote) online?.leave();
      else game.leaveGame();
      setRules(false);
      navigate("home");
    } else {
      if (remote) online?.send({ type: "end-and-score" });
      else update(game.endAndScore());
    }
  }

  function update(outcome: Outcome) {
    if (!outcome.ok) {
      setMessage(errors[outcome.error]);
      return;
    }
    const next = game.getHumanView();
    if (!next) return;
    setFrame({ view: next, events: outcome.events });
    setMessage("");
    setScreen("game");
  }

  function move(intent: MatchIntent) {
    if (blocked || confirmation) return;
    if (remote) online?.send(intent);
    else update(game.humanMove(intent));
  }

  function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    update(game.startBotMatch(playerName, count, identicalNumbers));
  }

  useBotPacing(
    botActing ? localFrame?.view.turnNumber : undefined,
    localFrame,
    animating || Boolean(confirmation),
    speed,
    () => update(game.botStep()),
  );

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
          {matchScreen && table?.phase === "playing" && (
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
                  {!remote && (
                    <label className="bot-speed">
                      Bot speed
                      <select
                        value={speed}
                        onChange={(event) =>
                          setSpeed(event.target.value as BotSpeed)
                        }
                      >
                        {Object.keys(botSpeeds).map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button
                    className="quiet"
                    disabled={blocked}
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
          <a
            className="quiet source-link"
            href="https://github.com/amireness/color-clash"
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38l-.01-1.49c-2.23.49-2.7-.95-2.7-.95-.36-.92-.88-1.17-.88-1.17-.73-.5.06-.49.06-.49.8.06 1.22.82 1.22.82.72 1.22 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.96 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.13 0 0 .67-.22 2.2.82A7.7 7.7 0 0 1 8 3.83c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.11.16 1.93.08 2.13.51.56.82 1.28.82 2.15 0 3.08-1.87 3.76-3.65 3.96.29.25.54.74.54 1.49l-.01 2.2c0 .21.14.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
            Source Code
          </a>
        </nav>
      </header>
      {confirmation && (
        <ConfirmMatchAction
          action={confirmation}
          online={remote}
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
            their turn unless they stack another Draw Two.
          </p>
          <p>
            You can draw instead of playing. Play the drawn card if it matches
            or end your turn. Wild Draw Four sets a color and makes the next
            player accept the penalty or stack another Wild Draw Four.
          </p>
        </aside>
      )}
      <main
        className={
          matchScreen && table?.phase === "playing" ? "game-main" : undefined
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
              {online && (
                <button
                  className="quiet friends-entry"
                  onClick={() => setScreen("online")}
                >
                  Play with Friends
                </button>
              )}
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
        {remote && online && !table && (
          <FriendsLobby
            game={online}
            state={onlineState}
            onBack={() => {
              online.leave();
              navigate("home");
            }}
          />
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
              <label className="house-rule">
                <input
                  type="checkbox"
                  checked={identicalNumbers}
                  onChange={(event) =>
                    setIdenticalNumbers(event.target.checked)
                  }
                />{" "}
                Allow identical number cards to be played together
              </label>
              <p role="status">{message}</p>
              <button className="primary" type="submit">
                Deal cards <span aria-hidden="true">→</span>
              </button>
            </form>
          </section>
        )}
        {matchScreen &&
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
              {table.summary && <MatchSummary summary={table.summary} />}
              <p role="status">{message}</p>
              <div className="button-row">
                <button
                  className="primary"
                  disabled={
                    blocked ||
                    (remote &&
                      (room?.viewerId !== room?.hostId ||
                        room?.seats.some((seat) => !seat.connected)))
                  }
                  onClick={() => {
                    if (remote) online?.send({ type: "restart" });
                    else update(game.restartGame());
                  }}
                >
                  Play again
                </button>
                <button
                  className="quiet"
                  onClick={() => {
                    if (remote) {
                      online?.leave();
                      navigate("home");
                    } else navigate("setup");
                  }}
                >
                  {remote ? "Leave room" : "Change players"}
                </button>
              </div>
            </section>
          ) : (
            <section className="board" ref={boardRef}>
              {playback.step && (
                <CardFlight
                  key={playback.key}
                  event={playback.step}
                  board={boardRef}
                  viewerId={view.viewerId}
                />
              )}
              <div className="board-heading">
                <div>
                  <p className="eyebrow">TURN {table.turnNumber}</p>
                  <h1 ref={view ? focusTarget : undefined} tabIndex={-1}>
                    {table.current.name}’s turn
                  </h1>
                  {botTurn && (
                    <p className="bot-status" role="status">
                      {animating ? "Playing…" : "Deciding…"}
                    </p>
                  )}
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
                    data-seat={player.id}
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
                      {room?.seats.find((seat) => seat.id === player.id)
                        ?.connected === false
                        ? " · Offline"
                        : ""}
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
                    data-draw-pile
                    disabled={blocked || !view?.actions.canDraw}
                    onClick={() => move({ type: "draw" })}
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
                    className="discard"
                    data-discard
                    role="img"
                    aria-label={
                      discard ? `Discard: ${cardName(discard)}` : undefined
                    }
                  >
                    {discard && <CardFace card={discard} />}
                  </div>
                  <span className={`active-color ${table.color}`}>
                    {symbols[table.color]} {title(table.color)}
                  </span>
                </div>
              </div>
              {table.penalty && (
                <div
                  className="penalty-banner"
                  role="region"
                  aria-label="Draw penalty"
                >
                  <strong>
                    {view.actions.canAcceptPenalty
                      ? `Draw ${table.penalty.count} cards${view.actions.playableIds.length ? ` or stack ${table.penalty.kind === "draw-two" ? "+2" : "+4"}` : ""}.`
                      : choosingWild
                        ? "Choose a color to finish stacking."
                        : `${table.current.name} faces a +${table.penalty.count} penalty.`}
                  </strong>
                  {view.actions.canAcceptPenalty && (
                    <button
                      className="primary"
                      disabled={blocked}
                      onClick={() => move({ type: "accept-penalty" })}
                    >
                      Draw {table.penalty.count} cards
                    </button>
                  )}
                </div>
              )}
              <p
                className={
                  playback.step ? "feedback action-feedback" : "feedback"
                }
                role="status"
              >
                {message ||
                  (botTurn
                    ? `${table.current.name} is thinking…`
                    : otherTurn
                      ? "Waiting for the next move…"
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
                            disabled={blocked}
                            onClick={() =>
                              move({ type: "choose-color", color })
                            }
                          >
                            {symbols[color]} {title(color)}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  )}
                  <PlayerHand
                    view={view}
                    blocked={Boolean(blocked)}
                    waiting={Boolean(otherTurn || blocked)}
                    step={playback.step}
                    landedId={playback.landed?.id}
                    move={move}
                  />
                </>
              ) : null}
            </section>
          ))}
      </main>
      <footer>
        COLOR CLASH <span>◆ ✦ ● ▲</span> {remote ? "ONLINE PLAY" : "LOCAL PLAY"}
      </footer>
    </div>
  );
}
