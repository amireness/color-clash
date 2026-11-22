import { createOnlineClient } from "../infrastructure/online-client";
import { roomSocketPath } from "../infrastructure/room-protocol";

const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
export const onlineGame = createOnlineClient(
  protocol + "//" + window.location.host + roomSocketPath,
  window.sessionStorage,
);
