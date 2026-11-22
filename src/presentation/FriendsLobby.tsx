import { useState } from "react";
import type { OnlineGame, OnlineState } from "../application/online-game";

export function FriendsLobby({
  game,
  state,
  onBack,
}: {
  game: OnlineGame;
  state: OnlineState;
  onBack: () => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState(
    () => new URLSearchParams(window.location.search).get("room") ?? "",
  );
  const [copied, setCopied] = useState(false);
  const [identicalNumbers, setIdenticalNumbers] = useState(false);
  const room = state.room;
  const busy =
    state.status === "connecting" ||
    state.status === "reconnecting" ||
    state.pending;
  const me = room?.seats.find((seat) => seat.id === room.viewerId);
  const host = room?.viewerId === room?.hostId;

  async function copyInvite() {
    if (!room) return;
    const invite = new URL(window.location.href);
    invite.searchParams.set("room", room.code);
    try {
      await navigator.clipboard.writeText(invite.toString());
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="panel setup lobby">
      <button className="quiet" onClick={onBack}>
        {room ? "Leave room" : "← Home"}
      </button>
      <h1>{room ? "Private lobby" : "Play with Friends"}</h1>
      {room ? (
        <>
          <p>
            Room code <strong className="room-code">{room.code}</strong>
          </p>
          <button className="quiet" onClick={() => void copyInvite()}>
            {copied ? "Invite copied" : "Copy invite link"}
          </button>
          <ul className="scores" aria-label="Lobby players">
            {room.seats.map((seat) => (
              <li key={seat.id}>
                <strong>
                  {seat.name}
                  {seat.id === room.viewerId ? " (you)" : ""}
                  {seat.id === room.hostId ? " · Host" : ""}
                </strong>
                <span>
                  {!seat.connected
                    ? "Offline"
                    : seat.ready
                      ? "Ready"
                      : "Not ready"}
                </span>
              </li>
            ))}
          </ul>
          {host && (
            <label className="house-rule">
              <input
                type="checkbox"
                checked={identicalNumbers}
                onChange={(event) => setIdenticalNumbers(event.target.checked)}
              />{" "}
              Allow identical number cards to be played together
            </label>
          )}
          <div className="button-row">
            <button
              className="quiet"
              disabled={busy}
              onClick={() => game.send({ type: "ready", ready: !me?.ready })}
            >
              {me?.ready ? "Not ready" : "Ready"}
            </button>
            {host && (
              <button
                className="primary"
                disabled={
                  busy ||
                  room.seats.length < 2 ||
                  room.seats.some((seat) => !seat.ready || !seat.connected)
                }
                onClick={() => game.send({ type: "start", identicalNumbers })}
              >
                Start match
              </button>
            )}
          </div>
        </>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (code.trim()) game.join(code, name);
          }}
        >
          <label>
            Your name
            <input
              className="name-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={24}
            />
          </label>
          <label>
            Room code
            <input
              className="name-input"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              maxLength={6}
            />
          </label>
          <div className="button-row">
            <button
              className="primary"
              type="submit"
              disabled={busy || !name.trim() || code.trim().length !== 6}
            >
              Join room
            </button>
            <button
              className="quiet"
              type="button"
              disabled={busy || !name.trim()}
              onClick={() => game.create(name)}
            >
              Create private room
            </button>
          </div>
        </form>
      )}
      <p role="status">
        {state.error ??
          (state.status === "reconnecting"
            ? "Reconnecting to your seat…"
            : state.status === "connecting"
              ? "Connecting…"
              : "")}
      </p>
    </section>
  );
}
