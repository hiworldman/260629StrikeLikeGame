import type { GameState } from "../types";

export type MultiplayerRole = "host" | "guest";

export interface LobbyState {
  roomCode: string;
  inviteUrl: string;
  participants: Array<{
    id: string;
    nickname: string;
    role: MultiplayerRole;
  }>;
  started: boolean;
}

export type ClientMessage =
  | { type: "createRoom"; nickname: string }
  | { type: "joinRoom"; roomCode: string; nickname: string }
  | { type: "startGame" }
  | { type: "roll" }
  | { type: "endTurn" };

export type ServerMessage =
  | {
      type: "session";
      role: MultiplayerRole;
      playerId: string;
      lobby: LobbyState;
    }
  | { type: "lobby"; lobby: LobbyState }
  | { type: "gameState"; state: GameState }
  | { type: "error"; message: string };
