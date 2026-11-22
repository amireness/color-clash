import { createGame, executeCommand } from "../domain/engine";
import type { GameState } from "../domain/model";
import { publicEvents } from "./public-events";
import type { PublicEvent } from "./public-events";
import type { LobbySeat, RoomAction, RoomView } from "./online-game";
import type { RandomSource } from "./ports";
import { projectPlayer } from "./player-view";

export interface SeatCredential {
  code: string;
  token: string;
}

interface RoomSeat extends LobbySeat {
  token?: string;
}

export interface Room {
  code: string;
  seats: RoomSeat[];
  hostId: string;
  revision: number;
  touchedAt: number;
  nextSeat: number;
  game?: GameState;
}

/** Synchronous process-local storage. Loaded rooms are owned and mutated by the room service. */
export interface RoomStore {
  get(code: string): Room | undefined;
  put(room: Room): void;
  remove(code: string): void;
  values(): Iterable<Room>;
}

interface RoomDependencies {
  store: RoomStore;
  random: RandomSource;
  makeCode(): string;
  makeToken(): string;
  now(): number;
  ttlMs: number;
}

type Reply<T> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Reply<T> => ({ ok: true, value });
const fail = (error: string): Reply<never> => ({ ok: false, error });

export function createRoomService({
  store,
  random,
  makeCode,
  makeToken,
  now,
  ttlMs,
}: RoomDependencies) {
  function find(credential: SeatCredential) {
    const room = store.get(credential.code);
    const seat = room?.seats.find(({ token }) => token === credential.token);
    return room && seat ? { room, seat } : undefined;
  }

  function snapshot(
    credential: SeatCredential,
    events: readonly PublicEvent[] = [],
  ): RoomView | undefined {
    const found = find(credential);
    if (!found) return;
    const { room, seat } = found;
    return {
      code: room.code,
      viewerId: seat.id,
      hostId: room.hostId,
      revision: room.revision,
      seats: room.seats.map(({ id, name, connected, ready }) => ({
        id,
        name,
        connected,
        ready,
      })),
      match:
        room.game && room.game.phase !== "setup"
          ? projectPlayer(room.game, seat.id)
          : undefined,
      events,
    };
  }

  function joinRoom(room: Room, name: string): Reply<SeatCredential> {
    const clean = name.trim();
    if (!clean || clean.length > 24)
      return fail("Enter a name of 1–24 characters.");
    if (room.game || room.seats.length >= 4)
      return fail("This room is full or has already started.");
    if (
      room.seats.some((seat) => seat.name.toLowerCase() === clean.toLowerCase())
    )
      return fail("That name is already taken.");
    const token = makeToken();
    // Seat order may change before a match starts. The domain uses sequential IDs at deal time.
    const id = "lobby-" + room.nextSeat++;
    room.seats.push({ id, token, name: clean, ready: false, connected: true });
    if (!room.hostId) room.hostId = id;
    room.touchedAt = now();
    room.revision++;
    return ok({ code: room.code, token });
  }

  function act(
    credential: SeatCredential,
    revision: number,
    action: RoomAction,
  ): Reply<readonly PublicEvent[]> {
    const found = find(credential);
    if (!found || !found.seat.connected)
      return fail("This seat is unavailable.");
    const { room, seat } = found;
    // The check and commit share one synchronous call, so another socket cannot interleave.
    if (revision !== room.revision)
      return fail("The room changed. Review the latest state and try again.");
    let events: readonly PublicEvent[] = [];
    if (action.type === "ready") {
      if (room.game) return fail("Readiness is only available in the lobby.");
      seat.ready = action.ready;
    } else if (action.type === "start") {
      if (seat.id !== room.hostId) return fail("Only the host can start.");
      if (
        room.game ||
        room.seats.length < 2 ||
        room.seats.some((entry) => !entry.ready || !entry.connected)
      )
        return fail("At least two connected players must be ready.");
      const setup = createGame(
        room.seats.map(({ name }) => name),
        action.identicalNumbers,
      );
      if (!setup.ok) return fail(setup.error);
      const started = executeCommand(
        setup.state,
        { type: "start" },
        { random: () => random.next(), at: now() },
      );
      if (!started.ok) return fail(started.error);
      const host = room.seats.find((entry) => entry.id === room.hostId);
      room.seats.forEach((entry, index) => {
        entry.id = started.state.players[index].id;
      });
      if (host) room.hostId = host.id;
      room.game = started.state;
      events = publicEvents(started.events);
    } else {
      if (!room.game) return fail("The match has not started.");
      if (
        action.type === "restart" &&
        (seat.id !== room.hostId ||
          room.seats.some((entry) => !entry.connected))
      )
        return fail("Only the host can restart when everyone is connected.");
      const command =
        action.type === "restart" || action.type === "end-and-score"
          ? action
          : { ...action, playerId: seat.id };
      const result = executeCommand(room.game, command, {
        random: () => random.next(),
        at: now(),
      });
      if (!result.ok) return fail(result.error);
      room.game = result.state;
      events = publicEvents(result.events);
    }
    room.revision++;
    room.touchedAt = now();
    return ok(events);
  }

  return {
    create(name: string): Reply<SeatCredential> {
      for (let attempt = 0; attempt < 8; attempt++) {
        const code = makeCode();
        if (store.get(code)) continue;
        const room: Room = {
          code,
          seats: [],
          hostId: "",
          revision: 0,
          nextSeat: 1,
          touchedAt: now(),
        };
        const joined = joinRoom(room, name);
        if (joined.ok) store.put(room);
        return joined;
      }
      return fail("Could not allocate a room. Try again.");
    },
    join(code: string, name: string): Reply<SeatCredential> {
      const room = store.get(code.trim().toUpperCase());
      return room ? joinRoom(room, name) : fail("Room code not found.");
    },
    setConnected(credential: SeatCredential, connected: boolean) {
      const found = find(credential);
      if (!found) return false;
      found.seat.connected = connected;
      found.room.touchedAt = now();
      return true;
    },
    leave(credential: SeatCredential) {
      const found = find(credential);
      if (!found) return;
      const { room, seat } = found;
      if (room.game) {
        seat.connected = false;
        seat.token = undefined;
      } else {
        room.seats = room.seats.filter((entry) => entry !== seat);
        if (!room.seats.length) store.remove(room.code);
        else if (room.hostId === seat.id) room.hostId = room.seats[0].id;
      }
      room.touchedAt = now();
      room.revision++;
    },
    expireInactive(): string[] {
      const expired: string[] = [];
      const cutoff = now() - ttlMs;
      for (const room of store.values()) {
        if (room.touchedAt > cutoff) continue;
        store.remove(room.code);
        expired.push(room.code);
      }
      return expired;
    },
    snapshot,
    act,
  };
}
