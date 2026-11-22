import { expect, it } from "vitest";
import { chooseBotMove } from "../../src/application/bot";
import { createRoomService } from "../../src/application/rooms";
import { inMemoryRooms } from "../../src/infrastructure/room-memory";

it("runs a match through normal victory and expires inactive rooms", () => {
  let time = 0;
  let id = 0;
  const service = createRoomService({
    store: inMemoryRooms(),
    makeCode: () => "ABCDEF",
    makeToken: () => String(++id),
    random: { next: () => 0.999 },
    now: () => time,
    ttlMs: 1000,
  });
  const host = service.create("Host");
  const guest = service.join("ABCDEF", "Guest");
  if (!host.ok || !guest.ok) throw new Error("Room setup failed");
  const seats = [host.value, guest.value];
  const act = (
    seat: typeof host.value,
    action: Parameters<typeof service.act>[2],
  ) => service.act(seat, service.snapshot(seat)!.revision, action);
  for (const seat of seats)
    expect(act(seat, { type: "ready", ready: true }).ok).toBe(true);
  expect(act(host.value, { type: "start" }).ok).toBe(true);
  for (let n = 0; n < 300; n++) {
    const view = service.snapshot(host.value)!.match!;
    if (view.result) break;
    const seat = seats.find(
      (credential) =>
        service.snapshot(credential)?.viewerId === view.current.id,
    )!;
    const projection = service.snapshot(seat)!.match!;
    const move = chooseBotMove(projection);
    if (!move) throw new Error("No legal action");
    expect(act(seat, move).ok).toBe(true);
  }
  const result = service.snapshot(host.value)!.match!;
  expect(result.result?.reason).toBe("empty-hand");
  expect(result.players.some(({ count }) => count === 0)).toBe(true);
  time = 1001;
  expect(service.expireInactive()).toEqual(["ABCDEF"]);
  expect(service.snapshot(host.value)).toBeUndefined();
  expect(service.setConnected(guest.value, true)).toBe(false);
});
