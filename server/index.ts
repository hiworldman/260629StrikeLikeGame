import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { WebSocket, WebSocketServer } from "ws";
import {
  createMultiplayerState,
  endTurn,
  playTurn,
} from "../src/game/gameLogic";
import type {
  ClientMessage,
  LobbyState,
  MultiplayerRole,
  ServerMessage,
} from "../src/multiplayer/protocol";
import type { GameState } from "../src/types";

interface ClientIdentity {
  roomCode: string;
  playerId: "host" | "guest";
  role: MultiplayerRole;
}

interface Room {
  code: string;
  baseUrl: string;
  host: WebSocket;
  guest: WebSocket | null;
  hostNickname: string;
  guestNickname: string | null;
  state: GameState | null;
}

const rootDir = normalize(join(fileURLToPath(new URL(".", import.meta.url)), ".."));
const distDir = join(rootDir, "dist");
const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function getLanAddress(): string {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return "127.0.0.1";
}

function createCode(rooms: Map<string, Room>): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  do {
    const code = Array.from(
      { length: 6 },
      () => alphabet[Math.floor(Math.random() * alphabet.length)],
    ).join("");
    if (!rooms.has(code)) return code;
  } while (true);
}

function safeNickname(value: string): string {
  return value.trim().slice(0, 16);
}

export async function createMultiplayerServer(port = 8787) {
  const rooms = new Map<string, Room>();
  const identities = new Map<WebSocket, ClientIdentity>();
  const httpServer = createServer(async (request, response) => {
    try {
      const requestPath = new URL(
        request.url ?? "/",
        "http://localhost",
      ).pathname;
      const relativePath =
        requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
      const candidate = normalize(join(distDir, relativePath));
      const filePath = candidate.startsWith(distDir)
        ? candidate
        : join(distDir, "index.html");
      try {
        const body = await readFile(filePath);
        response.writeHead(200, {
          "content-type": mimeTypes[extname(filePath)] ?? "application/octet-stream",
        });
        response.end(body);
      } catch {
        const body = await readFile(join(distDir, "index.html"));
        response.writeHead(200, { "content-type": mimeTypes[".html"] });
        response.end(body);
      }
    } catch {
      response.writeHead(500);
      response.end("Server error");
    }
  });
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  const send = (socket: WebSocket, message: ServerMessage) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  };
  const lobbyFor = (room: Room): LobbyState => ({
    roomCode: room.code,
    inviteUrl: `${room.baseUrl}/?room=${room.code}`,
    hostNickname: room.hostNickname,
    guestNickname: room.guestNickname,
    started: room.state !== null,
  });
  const broadcastLobby = (room: Room) => {
    const message: ServerMessage = { type: "lobby", lobby: lobbyFor(room) };
    send(room.host, message);
    if (room.guest) send(room.guest, message);
  };
  const broadcastState = (room: Room) => {
    if (!room.state) return;
    const message: ServerMessage = { type: "gameState", state: room.state };
    send(room.host, message);
    if (room.guest) send(room.guest, message);
  };

  const alive = new WeakMap<WebSocket, boolean>();

  wss.on("connection", (socket, request) => {
    alive.set(socket, true);
    socket.on("pong", () => alive.set(socket, true));
    socket.on("message", (raw) => {
      let message: ClientMessage;
      try {
        message = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        send(socket, { type: "error", message: "잘못된 요청입니다." });
        return;
      }

      if (message.type === "createRoom") {
        const nickname = safeNickname(message.nickname) || "Host";
        const code = createCode(rooms);
        const room: Room = {
          code,
          baseUrl: (() => {
            const forwardedProtocol = request.headers["x-forwarded-proto"];
            const protocol = Array.isArray(forwardedProtocol)
              ? forwardedProtocol[0]
              : forwardedProtocol ?? "http";
            const host = request.headers.host ?? `localhost:${port}`;
            return `${protocol}://${host}`;
          })(),
          host: socket,
          guest: null,
          hostNickname: nickname,
          guestNickname: null,
          state: null,
        };
        rooms.set(code, room);
        identities.set(socket, { roomCode: code, playerId: "host", role: "host" });
        send(socket, {
          type: "session",
          role: "host",
          playerId: "host",
          lobby: lobbyFor(room),
        });
        return;
      }

      if (message.type === "joinRoom") {
        const code = message.roomCode.trim().toUpperCase();
        const room = rooms.get(code);
        const nickname = safeNickname(message.nickname);
        if (!room || room.state) {
          send(socket, { type: "error", message: "입장할 수 없는 초대 코드입니다." });
          return;
        }
        if (room.guest) {
          send(socket, { type: "error", message: "이미 참가자가 입장한 방입니다." });
          return;
        }
        if (!nickname) {
          send(socket, { type: "error", message: "닉네임을 입력하세요." });
          return;
        }
        room.guest = socket;
        room.guestNickname = nickname;
        identities.set(socket, { roomCode: code, playerId: "guest", role: "guest" });
        send(socket, {
          type: "session",
          role: "guest",
          playerId: "guest",
          lobby: lobbyFor(room),
        });
        broadcastLobby(room);
        return;
      }

      const identity = identities.get(socket);
      const room = identity ? rooms.get(identity.roomCode) : null;
      if (!identity || !room) {
        send(socket, { type: "error", message: "먼저 방에 입장하세요." });
        return;
      }

      if (message.type === "startGame") {
        if (identity.role !== "host" || !room.guest || !room.guestNickname) {
          send(socket, { type: "error", message: "게스트 입장 후 호스트만 시작할 수 있습니다." });
          return;
        }
        room.state = createMultiplayerState(
          room.hostNickname,
          room.guestNickname,
        );
        broadcastLobby(room);
        broadcastState(room);
        return;
      }

      if (!room.state || room.state.phase !== "playing") return;
      const current = room.state.players[room.state.currentPlayerIndex];
      if (current.id !== identity.playerId) {
        send(socket, { type: "error", message: "현재 자신의 턴이 아닙니다." });
        return;
      }
      if (message.type === "roll") {
        room.state = playTurn(room.state).state;
        broadcastState(room);
      } else if (message.type === "endTurn") {
        room.state = endTurn(room.state);
        broadcastState(room);
      }
    });

    socket.on("close", () => {
      const identity = identities.get(socket);
      identities.delete(socket);
      if (!identity) return;
      const room = rooms.get(identity.roomCode);
      if (!room) return;
      if (identity.role === "host") {
        if (room.guest) {
          send(room.guest, { type: "error", message: "호스트 연결이 종료되었습니다." });
        }
        rooms.delete(room.code);
      } else {
        room.guest = null;
        room.guestNickname = null;
        if (!room.state) broadcastLobby(room);
      }
    });
  });

  const heartbeatTimer = setInterval(() => {
    wss.clients.forEach((socket) => {
      if (alive.get(socket) === false) {
        socket.terminate();
        return;
      }
      alive.set(socket, false);
      socket.ping();
    });
  }, 30_000);
  wss.on("close", () => clearInterval(heartbeatTimer));

  await new Promise<void>((resolve) => {
    httpServer.listen(port, "0.0.0.0", resolve);
  });
  const address = httpServer.address() as { port: number };
  return {
    port: address.port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        clearInterval(heartbeatTimer);
        wss.close();
        httpServer.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.PORT ?? 8787);
  const server = await createMultiplayerServer(port);
  console.log(`STRIKE multiplayer server`);
  console.log(`Host:  http://localhost:${server.port}`);
  console.log(`Guest: http://${getLanAddress()}:${server.port}`);
}
