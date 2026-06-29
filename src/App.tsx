import { useCallback, useEffect, useState } from "react";
import { GameBoard } from "./components/GameBoard";
import { SetupScreen } from "./components/SetupScreen";
import {
  chooseAiAction,
  chooseAiContinuation,
} from "./game/aiStrategy";
import { createInitialState, endTurn, playTurn } from "./game/gameLogic";
import type { AiDifficulty, GameState, TurnAnimation } from "./types";

function getAnimationDuration(animation: TurnAnimation | null): number {
  if (!animation) return 0;

  const throwDuration =
    1150 + Math.max(0, animation.thrownDieIds.length - 1) * 100;
  const settlementStart = throwDuration + 350;
  const resultCount = Math.max(
    animation.collectedValues.length,
    animation.excludedCount,
  );
  const resultDuration =
    resultCount > 0
      ? settlementStart + 1250 + Math.max(0, resultCount - 1) * 90
      : settlementStart;

  return resultDuration + 180;
}

const createSetupState = (): GameState => ({
  players: [],
  arenaDice: [],
  excludedDice: [],
  currentPlayerIndex: 0,
  phase: "setup",
  winnerId: null,
  logs: [],
  aiDifficulty: "Normal",
  turnNumber: 0,
  lastRoll: null,
  lastRolls: [],
  lastAnimation: null,
  awaitingTurnDecision: false,
});

function App() {
  const [gameState, setGameState] = useState<GameState>(createSetupState);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isResolvingTurn, setIsResolvingTurn] = useState(false);
  const [settledScoreAnimationId, setSettledScoreAnimationId] = useState<
    string | null
  >(null);

  const startGame = useCallback(
    (playerCount: number, difficulty: AiDifficulty) => {
      setIsAiThinking(false);
      setIsResolvingTurn(false);
      setSettledScoreAnimationId(null);
      setGameState(createInitialState(playerCount, difficulty));
    },
    [],
  );

  const rollCurrentTurn = useCallback(() => {
    setIsResolvingTurn(true);
    setGameState((current) => playTurn(current).state);
  }, []);

  const endCurrentTurn = useCallback(() => {
    setIsResolvingTurn(false);
    setGameState((current) => endTurn(current));
  }, []);

  useEffect(() => {
    if (!gameState.lastAnimation) {
      setIsResolvingTurn(false);
      setSettledScoreAnimationId(null);
      return;
    }

    setIsResolvingTurn(true);
    setSettledScoreAnimationId(
      gameState.lastAnimation.collectedDieIds.length === 0
        ? gameState.lastAnimation.id
        : null,
    );
    const animationDuration = getAnimationDuration(gameState.lastAnimation);
    const scoreTimer =
      gameState.lastAnimation.collectedDieIds.length > 0
        ? window.setTimeout(() => {
            setSettledScoreAnimationId(gameState.lastAnimation?.id ?? null);
          }, animationDuration - 180)
        : null;
    const timer = window.setTimeout(() => {
      setIsResolvingTurn(false);
    }, animationDuration);

    return () => {
      window.clearTimeout(timer);
      if (scoreTimer !== null) window.clearTimeout(scoreTimer);
    };
  }, [gameState.lastAnimation]);

  useEffect(() => {
    if (gameState.phase !== "playing") {
      setIsAiThinking(false);
      return;
    }

    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.type !== "ai") {
      setIsAiThinking(false);
      return;
    }

    setIsAiThinking(true);
    const aiDelay = gameState.lastAnimation
      ? getAnimationDuration(gameState.lastAnimation) + 120
      : 800;

    const timer = window.setTimeout(() => {
      const continuationDecision = gameState.awaitingTurnDecision
        ? chooseAiContinuation(
            gameState,
            currentPlayer,
            gameState.aiDifficulty,
          )
        : null;
      setIsResolvingTurn(continuationDecision?.action !== "end");
      setGameState((current) => {
        if (current.phase !== "playing") return current;
        const activePlayer = current.players[current.currentPlayerIndex];
        if (!activePlayer || activePlayer.type !== "ai") return current;

        if (current.awaitingTurnDecision && continuationDecision) {
          const withDecisionLog: GameState = {
            ...current,
            logs: [...current.logs, continuationDecision.log],
          };
          return continuationDecision.action === "roll"
            ? playTurn(withDecisionLog).state
            : endTurn(withDecisionLog);
        }

        const decision = chooseAiAction(
          current,
          activePlayer,
          current.aiDifficulty,
        );
        const withDecisionLog: GameState = {
          ...current,
          logs: [...current.logs, decision.log],
        };
        return playTurn(withDecisionLog).state;
      });
      setIsAiThinking(false);
    }, aiDelay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    gameState.awaitingTurnDecision,
    gameState.currentPlayerIndex,
    gameState.lastAnimation?.id,
    gameState.phase,
    gameState.turnNumber,
  ]);

  if (gameState.phase === "setup") {
    return <SetupScreen onStart={startGame} />;
  }

  return (
    <GameBoard
      isAiThinking={isAiThinking}
      isResolvingTurn={isResolvingTurn}
      scoreAnimationComplete={
        gameState.lastAnimation === null ||
        settledScoreAnimationId === gameState.lastAnimation.id
      }
      onNewGame={() => {
        setIsAiThinking(false);
        setIsResolvingTurn(false);
        setSettledScoreAnimationId(null);
        setGameState(createSetupState());
      }}
      onRoll={rollCurrentTurn}
      onEndTurn={endCurrentTurn}
      state={gameState}
    />
  );
}

export default App;
