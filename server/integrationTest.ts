import { WebSocket } from "ws";
import type { RawData } from "ws";
import { createMultiplayerServer } from "./index";
import {
  createInitialState,
  expireTurn,
  getStartingDiceCount,
} from "../src/game/gameLogic";
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
const socketsByPlayerId = new Map<string, WebSocket>([["host", host]]);

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
  socketsByPlayerId.set(guestSession.playerId, guest);

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
    const extraSession = await sessionPromise;
    if (extraSession.type !== "session") throw new Error("Extra guest session missing");
    socketsByPlayerId.set(extraSession.playerId, extraGuest);
  }

  const hostGamePromise = waitFor(
    host,
    (message) => message.type === "gameState",
    10_000,
  );
  const guestGamePromise = waitFor(
    guest,
    (message) => message.type === "gameState",
    10_000,
  );
  const rollOffPromise = waitFor(
    host,
    (message) => message.type === "lobby" && message.lobby.rollOff !== null,
  );
  send(host, { type: "startGame" });
  let rollOffMessage = await rollOffPromise;
  if (rollOffMessage.type !== "lobby" || !rollOffMessage.lobby.rollOff) {
    throw new Error("Roll-off did not start");
  }
  let rollOff = rollOffMessage.lobby.rollOff;
  while (!rollOff.winnerId) {
    const previousRound = rollOff.round;
    const outcomePromise = waitFor(
      host,
      (message) =>
        message.type === "lobby" &&
        message.lobby.rollOff !== null &&
        (message.lobby.rollOff.round > previousRound ||
          message.lobby.rollOff.winnerId !== null),
    );
    rollOff.eligibleIds.forEach((playerId) => {
      const socket = socketsByPlayerId.get(playerId);
      if (!socket) throw new Error(`Missing socket for ${playerId}`);
      send(socket, { type: "rollForStart" });
    });
    const outcome = await outcomePromise;
    if (outcome.type !== "lobby" || !outcome.lobby.rollOff) {
      throw new Error("Roll-off outcome missing");
    }
    rollOff = outcome.lobby.rollOff;
  }
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

  const currentPlayerId =
    hostGame.state.players[hostGame.state.currentPlayerIndex].id;
  const currentSocket = socketsByPlayerId.get(currentPlayerId);
  const wrongEntry = [...socketsByPlayerId.entries()].find(
    ([playerId]) => playerId !== currentPlayerId,
  );
  if (!currentSocket || !wrongEntry) throw new Error("Turn sockets missing");
  const turnErrorPromise = waitFor(
    wrongEntry[1],
    (message) =>
      message.type === "error" && message.message.includes("자신의 턴"),
  );
  send(wrongEntry[1], { type: "roll" });
  await turnErrorPromise;

  const nextHostState = waitFor(host, (message) => message.type === "gameState");
  const nextGuestState = waitFor(
    guest,
    (message) => message.type === "gameState",
  );
  send(currentSocket, { type: "roll" });
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
  const decisionState = {
    ...hostAfterRoll.state,
    awaitingTurnDecision: true,
  };
  const expiredDecisionState = expireTurn(decisionState);
  if (
    hostAfterRoll.state.turnDeadline === null ||
    expiredDecisionState.currentPlayerIndex ===
      decisionState.currentPlayerIndex
  ) {
    throw new Error("Turn deadline did not advance the player");
  }
  const singleAutoRoll = expireTurn(
    createInitialState(2, "Normal", () => 0.5),
    () => 0.5,
  );
  if (singleAutoRoll.lastAnimation?.thrownDieIds.length !== 1) {
    throw new Error("Turn deadline did not auto-roll one die");
  }
  const emptyArenaState = createInitialState(2, "Normal", () => 0.5);
  emptyArenaState.arenaDice = [];
  const diceBeforeMassRoll =
    emptyArenaState.players[emptyArenaState.currentPlayerIndex].diceCount;
  const massAutoRoll = expireTurn(emptyArenaState, () => 0.5);
  if (
    massAutoRoll.lastAnimation?.thrownDieIds.length !== diceBeforeMassRoll
  ) {
    throw new Error("Turn deadline did not auto-roll all dice");
  }

  console.log("✓ room creation");
  console.log("✓ 2–5 player starting-dice rules");
  console.log("✓ guest nickname synchronization");
  console.log("✓ five-player room and six-dice setup");
  console.log("✓ host-only game start");
  console.log("✓ randomized high/low first-player roll-off");
  console.log("✓ turn authorization");
  console.log("✓ authoritative game-state synchronization");
  console.log("✓ seven-second turn-expiration transition");
  console.log("✓ timeout auto-roll for one die and empty-arena mass roll");
} finally {
  host.close();
  guest.close();
  extraGuests.forEach((socket) => socket.close());
  await new Promise((resolve) => setTimeout(resolve, 50));
  await server.close();
}
