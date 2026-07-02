import type { GameState, ThrowVector } from "../types";

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
  rollOff: {
    rule: "highest" | "lowest";
    rolls: Record<string, number>;
    eligibleIds: string[];
    round: number;
    winnerId: string | null;
  } | null;
}

export type ClientMessage =
  | { type: "createRoom"; nickname: string }
  | { type: "joinRoom"; roomCode: string; nickname: string }
  | { type: "startGame" }
  | { type: "rollForStart" }
  | { type: "roll"; vector?: ThrowVector }
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
