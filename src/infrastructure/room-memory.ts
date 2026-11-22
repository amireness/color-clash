import type { Room, RoomStore } from "../application/rooms";

export function inMemoryRooms(): RoomStore {
  const rooms = new Map<string, Room>();
  return {
    get: (code) => rooms.get(code),
    put: (room) => {
      rooms.set(room.code, room);
    },
    remove: (code) => {
      rooms.delete(code);
    },
    values: () => rooms.values(),
  };
}
