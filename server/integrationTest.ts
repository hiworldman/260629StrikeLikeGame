import { WebSocket } from "ws";
import type { RawData } from "ws";
import { createMultiplayerServer } from "./index";
import { getStartingDiceCount } from "../src/game/gameLogic";
import type {
  ClientMessage,
  ServerMessage,
} from "../src/multiplayer/protocol";

function openClient(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function send(socket: WebSocket, message: ClientMessage) {
  socket.send(JSON.stringify(message));
}

function waitFor(
  socket: WebSocket,
  predicate: (message: ServerMessage) => boolean,
  timeoutMs = 3000,
): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error("Timed out waiting for server message"));
    }, timeoutMs);
    const onMessage = (raw: RawData) => {
      const message = JSON.parse(raw.toString()) as ServerMessage;
      if (!predicate(message)) return;
      clearTimeout(timer);
      socket.off("message", onMessage);
      resolve(message);
    };
    socket.on("message", onMessage);
  });
}

const server = await createMultiplayerServer(0);
const url = `ws://127.0.0.1:${server.port}/ws`;
const host = await openClient(url);
const guest = await openClient(url);
const extraGuests: WebSocket[] = [];

try {
  const expectedDiceCounts = [9, 8, 7, 6];
  expectedDiceCounts.forEach((expected, index) => {
    const playerCount = index + 2;
    if (getStartingDiceCount(playerCount) !== expected) {
      throw new Error(`Invalid starting dice count for ${playerCount} players`);
    }
  });
  const hostSessionPromise = waitFor(host, (message) => message.type === "session");
  send(host, { type: "createRoom", nickname: "Local Host" });
  const hostSession = await hostSessionPromise;
  if (hostSession.type !== "session") throw new Error("Host session missing");

  const guestSessionPromise = waitFor(
    guest,
    (message) => message.type === "session",
  );
  const hostLobbyPromise = waitFor(
    host,
    (message) =>
      message.type === "lobby" &&
      message.lobby.participants.some(
        (participant) => participant.nickname === "Local Guest",
      ),
  );
  send(guest, {
    type: "joinRoom",
    roomCode: hostSession.lobby.roomCode,
    nickname: "Local Guest",
  });
  const guestSession = await guestSessionPromise;
  await hostLobbyPromise;
  if (
    guestSession.type !== "session" ||
    !guestSession.lobby.participants.some(
      (participant) => participant.nickname === "Local Guest",
    )
  ) {
    throw new Error("Guest nickname was not synchronized");
  }

  for (let index = 2; index <= 4; index += 1) {
    const extraGuest = await openClient(url);
    extraGuests.push(extraGuest);
    const sessionPromise = waitFor(
      extraGuest,
      (message) => message.type === "session",
    );
    send(extraGuest, {
      type: "joinRoom",
      roomCode: hostSession.lobby.roomCode,
      nickname: `Local Guest ${index}`,
    });
    await sessionPromise;
  }

  const hostGamePromise = waitFor(host, (message) => message.type === "gameState");
  const guestGamePromise = waitFor(
    guest,
    (message) => message.type === "gameState",
  );
  send(host, { type: "startGame" });
  const [hostGame, guestGame] = await Promise.all([
    hostGamePromise,
    guestGamePromise,
  ]);
  if (
    hostGame.type !== "gameState" ||
    guestGame.type !== "gameState" ||
    hostGame.state.players.length !== 5 ||
    hostGame.state.players.some((player) => player.diceCount !== 6)
  ) {
    throw new Error("Game state did not synchronize");
  }

  const turnErrorPromise = waitFor(
    guest,
    (message) =>
      message.type === "error" && message.message.includes("자신의 턴"),
  );
  send(guest, { type: "roll" });
  await turnErrorPromise;

  const nextHostState = waitFor(host, (message) => message.type === "gameState");
  const nextGuestState = waitFor(
    guest,
    (message) => message.type === "gameState",
  );
  send(host, { type: "roll" });
  const [hostAfterRoll, guestAfterRoll] = await Promise.all([
    nextHostState,
    nextGuestState,
  ]);
  if (
    hostAfterRoll.type !== "gameState" ||
    guestAfterRoll.type !== "gameState" ||
    hostAfterRoll.state.lastAnimation?.id !==
      guestAfterRoll.state.lastAnimation?.id
  ) {
    throw new Error("Authoritative roll was not synchronized");
  }

  console.log("✓ room creation");
  console.log("✓ 2–5 player starting-dice rules");
  console.log("✓ guest nickname synchronization");
  console.log("✓ five-player room and six-dice setup");
  console.log("✓ host-only game start");
  console.log("✓ turn authorization");
  console.log("✓ authoritative game-state synchronization");
} finally {
  host.close();
  guest.close();
  extraGuests.forEach((socket) => socket.close());
  await new Promise((resolve) => setTimeout(resolve, 50));
  await server.close();
}
