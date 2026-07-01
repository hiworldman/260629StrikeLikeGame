import { useEffect, useState } from "react";
import type {
  LobbyState,
  MultiplayerRole,
} from "../multiplayer/protocol";

interface MultiplayerLobbyProps {
  view: "host" | "join";
  initialCode: string;
  connecting: boolean;
  connected: boolean;
  role: MultiplayerRole | null;
  lobby: LobbyState | null;
  error: string | null;
  onCreate: (nickname: string) => void;
  onJoin: (code: string, nickname: string) => void;
  onStart: () => void;
  onBack: () => void;
}

export function MultiplayerLobby({
  view,
  initialCode,
  connecting,
  connected,
  role,
  lobby,
  error,
  onCreate,
  onJoin,
  onStart,
  onBack,
}: MultiplayerLobbyProps) {
  const [nickname, setNickname] = useState(view === "host" ? "Host" : "");
  const [roomCode, setRoomCode] = useState(initialCode);
  const [copied, setCopied] = useState(false);

  useEffect(() => setRoomCode(initialCode), [initialCode]);

  const copyInvite = async () => {
    if (!lobby) return;
    await navigator.clipboard.writeText(lobby.inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <main className="lobby-screen">
      <section className="lobby-card">
        <button className="lobby-back" onClick={onBack} type="button">
          ← BACK
        </button>
        <span className="eyebrow">ONLINE DUEL</span>
        <h1>{lobby ? "WAITING ROOM" : view === "host" ? "CREATE ROOM" : "JOIN ROOM"}</h1>

        {!lobby ? (
          <div className="lobby-form">
            {view === "join" && (
              <label>
                초대 코드
                <input
                  maxLength={6}
                  onChange={(event) =>
                    setRoomCode(event.target.value.toUpperCase())
                  }
                  placeholder="ABC123"
                  value={roomCode}
                />
              </label>
            )}
            <label>
              닉네임
              <input
                maxLength={16}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="닉네임 입력"
                value={nickname}
              />
            </label>
            <button
              className="start-button"
              disabled={connecting || !nickname.trim() || (view === "join" && roomCode.length !== 6)}
              onClick={() =>
                view === "host"
                  ? onCreate(nickname)
                  : onJoin(roomCode, nickname)
              }
              type="button"
            >
              {connecting ? "CONNECTING…" : view === "host" ? "방 만들기" : "입장하기"}
            </button>
          </div>
        ) : (
          <>
            <div className="invite-code">
              <span>INVITE CODE</span>
              <strong>{lobby.roomCode}</strong>
              <button onClick={copyInvite} type="button">
                {copied ? "복사됨" : "초대 주소 복사"}
              </button>
            </div>
            <div className="lobby-players">
              <div>
                <small>HOST</small>
                <strong>{lobby.hostNickname}</strong>
                <span>READY</span>
              </div>
              <b>VS</b>
              <div>
                <small>GUEST</small>
                <strong>{lobby.guestNickname ?? "입장 대기 중…"}</strong>
                <span>{lobby.guestNickname ? "READY" : "WAITING"}</span>
              </div>
            </div>
            {role === "host" ? (
              <button
                className="start-button"
                disabled={!lobby.guestNickname || !connected}
                onClick={onStart}
                type="button"
              >
                게임 시작
              </button>
            ) : (
              <p className="lobby-waiting">호스트가 게임을 시작하기를 기다리고 있습니다.</p>
            )}
          </>
        )}
        {error && <p className="lobby-error">{error}</p>}
      </section>
    </main>
  );
}
