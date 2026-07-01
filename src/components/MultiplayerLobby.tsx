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
  playerId: string | null;
  lobby: LobbyState | null;
  error: string | null;
  onCreate: (nickname: string) => void;
  onJoin: (code: string, nickname: string) => void;
  onStart: () => void;
  onRollForStart: () => void;
  onBack: () => void;
}

export function MultiplayerLobby({
  view,
  initialCode,
  connecting,
  connected,
  role,
  playerId,
  lobby,
  error,
  onCreate,
  onJoin,
  onStart,
  onRollForStart,
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
        <span className="eyebrow">ONLINE MULTIPLAYER · 2–5 PLAYERS</span>
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
              {lobby.participants.map((participant, index) => (
                <div key={participant.id}>
                  <small>
                    {participant.role === "host"
                      ? "HOST"
                      : `PLAYER ${index + 1}`}
                  </small>
                  <strong>{participant.nickname}</strong>
                  <span>READY</span>
                </div>
              ))}
              {Array.from(
                { length: Math.max(0, 2 - lobby.participants.length) },
                (_, index) => (
                  <div className="lobby-player-empty" key={`empty-${index}`}>
                    <small>PLAYER</small>
                    <strong>입장 대기 중…</strong>
                    <span>WAITING</span>
                  </div>
                ),
              )}
            </div>
            <p className="lobby-capacity">
              {lobby.participants.length} / 5명 · 시작 주사위{" "}
              {11 - Math.max(2, lobby.participants.length)}개
            </p>
            {lobby.rollOff ? (
              <div className="roll-off">
                <span>
                  ROUND {lobby.rollOff.round} ·{" "}
                  {lobby.rollOff.rule === "highest"
                    ? "가장 높은 눈"
                    : "가장 낮은 눈"}
                </span>
                <strong>선플레이어 결정</strong>
                <div className="roll-off__results">
                  {lobby.participants.map((participant) => (
                    <div key={participant.id}>
                      <small>{participant.nickname}</small>
                      <b>
                        {lobby.rollOff?.rolls[participant.id] ??
                          (lobby.rollOff?.eligibleIds.includes(participant.id)
                            ? "?"
                            : "—")}
                      </b>
                    </div>
                  ))}
                </div>
                {lobby.rollOff.winnerId ? (
                  <p>
                    {
                      lobby.participants.find(
                        (participant) =>
                          participant.id === lobby.rollOff?.winnerId,
                      )?.nickname
                    }
                    님이 먼저 시작합니다.
                  </p>
                ) : (
                  <button
                    className="start-button"
                    disabled={
                      !playerId ||
                      !lobby.rollOff.eligibleIds.includes(playerId) ||
                      lobby.rollOff.rolls[playerId] !== undefined
                    }
                    onClick={onRollForStart}
                    type="button"
                  >
                    {playerId && lobby.rollOff.rolls[playerId] !== undefined
                      ? "다른 플레이어 대기 중"
                      : "선플레이어 주사위 굴리기"}
                  </button>
                )}
              </div>
            ) : role === "host" ? (
              <button
                className="start-button"
                disabled={lobby.participants.length < 2 || !connected}
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
