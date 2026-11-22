import type { PublicEvent } from "./public-events";
import type { MatchIntent } from "./match-intent";
import type { PlayerView } from "./player-view";

export interface LobbySeat {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
}
export interface RoomView {
  code: string;
  viewerId: string;
  hostId: string;
  revision: number;
  seats: readonly LobbySeat[];
  match?: PlayerView;
  events: readonly PublicEvent[];
}

export type RoomAction =
  | { type: "ready"; ready: boolean }
  | { type: "start"; identicalNumbers?: boolean }
  | { type: "end-and-score" | "restart" }
  | MatchIntent;

export type OnlineState = {
  status: "idle" | "connecting" | "connected" | "reconnecting";
  room?: RoomView;
  error?: string;
  pending?: boolean;
};

/** Browser-facing room session. Consumers see projections and submit intentions without seat credentials. */
export interface OnlineGame {
  getState(): OnlineState;
  subscribe(listener: () => void): () => void;
  restore(): void;
  create(name: string): void;
  join(code: string, name: string): void;
  send(action: RoomAction): void;
  leave(): void;
}
