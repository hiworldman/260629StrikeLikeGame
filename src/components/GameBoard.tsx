import { useEffect } from "react";
import type { GameState } from "../types";
import { Arena } from "./Arena";
import { GameLog } from "./GameLog";
import { PlayerCard } from "./PlayerCard";

interface GameBoardProps {
  state: GameState;
  isAiThinking: boolean;
  isResolvingTurn: boolean;
  scoreAnimationComplete: boolean;
  onRoll: () => void;
  onEndTurn: () => void;
  onNewGame: () => void;
  localPlayerId?: string;
}

export function GameBoard({
  state,
  isAiThinking,
  isResolvingTurn,
  scoreAnimationComplete,
  onRoll,
  onEndTurn,
  onNewGame,
  localPlayerId = "player",
}: GameBoardProps) {
  const currentPlayer = state.players[state.currentPlayerIndex];
  const localCanRoll =
    state.phase === "playing" &&
    currentPlayer?.id === localPlayerId &&
    !currentPlayer.eliminated &&
    currentPlayer.diceCount > 0;
  const humanIsChoosing =
    localCanRoll && state.awaitingTurnDecision && !isResolvingTurn;
  const winner = state.players.find((player) => player.id === state.winnerId);
  const animationActorIndex = state.lastAnimation
    ? state.players.findIndex(
        (player) => player.id === state.lastAnimation?.actorId,
      )
    : -1;
  const displayedPlayerIndex =
    isResolvingTurn && animationActorIndex >= 0
      ? animationActorIndex
      : state.currentPlayerIndex;
  const displayedPlayer = state.players[displayedPlayerIndex];
  const pendingScorePlayerId =
    isResolvingTurn &&
    !scoreAnimationComplete &&
    state.lastAnimation?.collectedDieIds.length
      ? state.lastAnimation.actorId
      : null;
  const getDisplayedDiceCount = (playerId: string) =>
    playerId === pendingScorePlayerId && state.lastAnimation
      ? Math.max(
          0,
          state.lastAnimation.actorDiceBefore -
            state.lastAnimation.thrownValues.length,
        )
      : undefined;
  const localPlayer =
    state.players.find((player) => player.id === localPlayerId) ??
    state.players[0];
  const localPlayerIndex = state.players.findIndex(
    (player) => player.id === localPlayer.id,
  );
  const opponentPlayers = state.players
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => player.id !== localPlayer.id);

  useEffect(() => {
    const activeCard = document.querySelector<HTMLElement>(
      `[data-player-id="${displayedPlayer?.id ?? ""}"]`,
    );
    const opponentRow = activeCard?.closest<HTMLElement>(
      ".players-grid--opponents",
    );
    if (activeCard && opponentRow) {
      opponentRow.scrollTo({
        behavior: "smooth",
        left:
          activeCard.offsetLeft -
          opponentRow.clientWidth / 2 +
          activeCard.clientWidth / 2,
      });
    }
  }, [displayedPlayer?.id]);

  return (
    <main className="game">
      <header className="game-header">
        <div className="game-header__brand">
          <span className="game-header__die">◆</span>
          <div>
            <h1>STRIKE</h1>
            <span>DICE ARENA</span>
          </div>
        </div>

        <div className="turn-indicator">
          <span>
            {state.phase === "finished"
              ? "GAME OVER"
              : isResolvingTurn
                ? "DICE SETTLING"
                : `TURN ${state.turnNumber}`}
          </span>
          <strong>
            {state.phase === "finished"
              ? `${winner?.name ?? "Unknown"} wins`
              : `${displayedPlayer.name}'s turn`}
          </strong>
          {isResolvingTurn ? (
            <small>정산이 끝난 후 다음 턴으로 넘어갑니다.</small>
          ) : (
            isAiThinking && <small>AI THINKING…</small>
          )}
        </div>

        <button className="new-game-button" onClick={onNewGame} type="button">
          ↻ <span>NEW GAME</span>
        </button>
      </header>

      <div className="game__content">
        <section className="table">
          <div className="players-grid players-grid--opponents">
            {opponentPlayers.map(({ player, index }) => (
              <PlayerCard
                isCurrent={
                  state.phase === "playing" && index === displayedPlayerIndex
                }
                isWinner={player.id === state.winnerId}
                displayDiceCount={getDisplayedDiceCount(player.id)}
                key={player.id}
                player={player}
              />
            ))}
          </div>

          <Arena
            dice={state.arenaDice}
            excludedDice={state.excludedDice}
            lastRolls={state.lastRolls}
            animation={state.lastAnimation}
            animationActorIndex={Math.max(0, animationActorIndex)}
          />

          <div className="bottom-player-zone">
            {localPlayer && (
              <div className="bottom-player-zone__card">
                <PlayerCard
                  isCurrent={
                    state.phase === "playing" &&
                    localPlayerIndex === displayedPlayerIndex
                  }
                  isWinner={localPlayer.id === state.winnerId}
                  displayDiceCount={getDisplayedDiceCount(localPlayer.id)}
                  player={localPlayer}
                />
              </div>
            )}
            <div className="action-panel">
              {state.phase === "finished" ? (
                <div className="winner-callout">
                  <span>CHAMPION</span>
                  <strong>{winner?.name}</strong>
                </div>
              ) : (
                <>
                  <div className="turn-actions">
                    <button
                      className="roll-button"
                      disabled={
                        !localCanRoll || isAiThinking || isResolvingTurn
                      }
                      onClick={onRoll}
                      type="button"
                    >
                      <span className="roll-button__icon">◆</span>
                      <span>
                        <strong>
                          {isAiThinking
                            ? "AI THINKING…"
                            : humanIsChoosing
                              ? "추가로 던지기"
                              : "주사위 던지기"}
                        </strong>
                        <small>
                          {localCanRoll
                            ? state.arenaDice.length === 0
                              ? `ROLL ALL ${currentPlayer.diceCount} DICE`
                              : "ROLL 1 DIE INTO THE ARENA"
                            : "WAIT FOR YOUR TURN"}
                        </small>
                      </span>
                    </button>
                    {humanIsChoosing && (
                      <button
                        className="end-turn-button"
                        onClick={onEndTurn}
                        type="button"
                      >
                        턴 종료
                      </button>
                    )}
                  </div>
                  <p>
                    내 주사위 <strong>{localPlayer?.diceCount ?? 0}</strong>개
                  </p>
                </>
              )}
            </div>
          </div>
        </section>

        <GameLog logs={state.logs} />
      </div>
    </main>
  );
}
