import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ClientMessage,
  LobbyState,
  MultiplayerRole,
  ServerMessage,
} from "./protocol";
import type { GameState } from "../types";

export function useMultiplayer() {
  const socketRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [role, setRole] = useState<MultiplayerRole | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError("멀티플레이 서버에 연결되지 않았습니다.");
      return;
    }
    socket.send(JSON.stringify(message));
  }, []);

  const connectAndSend = useCallback((message: ClientMessage) => {
    socketRef.current?.close();
    setConnecting(true);
    setError(null);
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
    socketRef.current = socket;
    socket.addEventListener("open", () => {
      setConnected(true);
      setConnecting(false);
      socket.send(JSON.stringify(message));
    });
    socket.addEventListener("message", (event) => {
      const response = JSON.parse(event.data as string) as ServerMessage;
      if (response.type === "session") {
        setRole(response.role);
        setPlayerId(response.playerId);
        setLobby(response.lobby);
      } else if (response.type === "lobby") {
        setLobby(response.lobby);
      } else if (response.type === "gameState") {
        setGameState(response.state);
      } else if (response.type === "error") {
        setError(response.message);
      }
    });
    socket.addEventListener("close", () => {
      setConnected(false);
      setConnecting(false);
    });
    socket.addEventListener("error", () => {
      setError("서버 연결에 실패했습니다. 멀티플레이 서버로 접속했는지 확인하세요.");
      setConnecting(false);
    });
  }, []);

  const leave = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
    setConnected(false);
    setConnecting(false);
    setRole(null);
    setPlayerId(null);
    setLobby(null);
    setGameState(null);
    setError(null);
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  useEffect(() => () => socketRef.current?.close(), []);

  return {
    connected,
    connecting,
    role,
    playerId,
    lobby,
    gameState,
    error,
    createRoom: (nickname: string) =>
      connectAndSend({ type: "createRoom", nickname }),
    joinRoom: (roomCode: string, nickname: string) =>
      connectAndSend({ type: "joinRoom", roomCode, nickname }),
    startGame: () => send({ type: "startGame" }),
    rollForStart: () => send({ type: "rollForStart" }),
    roll: () => send({ type: "roll" }),
    endTurn: () => send({ type: "endTurn" }),
    leave,
  };
}
