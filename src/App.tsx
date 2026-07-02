import { useCallback, useEffect, useState } from "react";
import { GameBoard } from "./components/GameBoard";
import { MultiplayerLobby } from "./components/MultiplayerLobby";
import { SetupScreen } from "./components/SetupScreen";
import {
  chooseAiAction,
  chooseAiContinuation,
} from "./game/aiStrategy";
import {
  createInitialState,
  endTurn,
  expireTurn,
  getTurnAnimationDuration,
  playTurn,
} from "./game/gameLogic";
import type { AiDifficulty, GameState, ThrowVector } from "./types";
import { useMultiplayer } from "./multiplayer/useMultiplayer";

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
  turnDeadline: null,
});

const createAiThrowVector = (): ThrowVector => ({
  angle: -Math.PI / 2 + (Math.random() - 0.5) * 0.9,
  power: 0.55 + Math.random() * 0.4,
});

function App() {
  const [gameState, setGameState] = useState<GameState>(createSetupState);
  const initialRoomCode =
    new URLSearchParams(window.location.search)
      .get("room")
      ?.trim()
      .toUpperCase() ?? "";
  const [multiplayerView, setMultiplayerView] = useState<
    "host" | "join" | null
  >(initialRoomCode ? "join" : null);
  const multiplayer = useMultiplayer();
  const isMultiplayerGame = multiplayer.gameState !== null;
  const activeGameState = multiplayer.gameState ?? gameState;
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

  const rollCurrentTurn = useCallback((vector?: ThrowVector) => {
    setIsResolvingTurn(true);
    setGameState((current) =>
      playTurn(current, Math.random, vector).state,
    );
  }, []);

  const endCurrentTurn = useCallback(() => {
    setIsResolvingTurn(false);
    setGameState((current) => endTurn(current));
  }, []);

  useEffect(() => {
    if (
      isMultiplayerGame ||
      activeGameState.phase !== "playing" ||
      activeGameState.turnDeadline === null
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      setIsResolvingTurn(false);
      setGameState((current) => expireTurn(current));
    }, Math.max(0, activeGameState.turnDeadline - Date.now()));
    return () => window.clearTimeout(timer);
  }, [
    activeGameState.turnDeadline,
    activeGameState.phase,
    isMultiplayerGame,
  ]);

  useEffect(() => {
    if (!activeGameState.lastAnimation) {
      setIsResolvingTurn(false);
      setSettledScoreAnimationId(null);
      return;
    }

    setIsResolvingTurn(true);
    setSettledScoreAnimationId(
      activeGameState.lastAnimation.collectedDieIds.length === 0
        ? activeGameState.lastAnimation.id
        : null,
    );
    const animationDuration = getTurnAnimationDuration(
      activeGameState.lastAnimation,
    );
    const scoreTimer =
      activeGameState.lastAnimation.collectedDieIds.length > 0
        ? window.setTimeout(() => {
            setSettledScoreAnimationId(
              activeGameState.lastAnimation?.id ?? null,
            );
          }, animationDuration - 180)
        : null;
    const timer = window.setTimeout(() => {
      setIsResolvingTurn(false);
    }, animationDuration);

    return () => {
      window.clearTimeout(timer);
      if (scoreTimer !== null) window.clearTimeout(scoreTimer);
    };
  }, [activeGameState.lastAnimation]);

  useEffect(() => {
    if (isMultiplayerGame) {
      setIsAiThinking(false);
      return;
    }
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
      ? getTurnAnimationDuration(gameState.lastAnimation) + 120
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
            ? playTurn(
                withDecisionLog,
                Math.random,
                createAiThrowVector(),
              ).state
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
        return playTurn(
          withDecisionLog,
          Math.random,
          createAiThrowVector(),
        ).state;
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
    isMultiplayerGame,
  ]);

  if (!isMultiplayerGame && multiplayerView) {
    return (
      <MultiplayerLobby
        connected={multiplayer.connected}
        connecting={multiplayer.connecting}
        error={multiplayer.error}
        initialCode={initialRoomCode}
        lobby={multiplayer.lobby}
        onBack={() => {
          multiplayer.leave();
          setMultiplayerView(null);
        }}
        onCreate={multiplayer.createRoom}
        onJoin={multiplayer.joinRoom}
        onRollForStart={multiplayer.rollForStart}
        onStart={multiplayer.startGame}
        playerId={multiplayer.playerId}
        role={multiplayer.role}
        view={multiplayerView}
      />
    );
  }

  if (activeGameState.phase === "setup") {
    return (
      <SetupScreen
        onHostMultiplayer={() => setMultiplayerView("host")}
        onJoinMultiplayer={() => setMultiplayerView("join")}
        onStart={startGame}
      />
    );
  }

  return (
    <GameBoard
      isAiThinking={isAiThinking}
      isResolvingTurn={isResolvingTurn}
      scoreAnimationComplete={
        activeGameState.lastAnimation === null ||
        settledScoreAnimationId === activeGameState.lastAnimation.id
      }
      localPlayerId={isMultiplayerGame ? multiplayer.playerId ?? "host" : "player"}
      onNewGame={() => {
        setIsAiThinking(false);
        setIsResolvingTurn(false);
        setSettledScoreAnimationId(null);
        if (isMultiplayerGame) {
          multiplayer.leave();
          setMultiplayerView(null);
        } else {
          setGameState(createSetupState());
        }
      }}
      onRoll={
        isMultiplayerGame
          ? (vector?: ThrowVector) => {
              setIsResolvingTurn(true);
              multiplayer.roll(vector);
            }
          : rollCurrentTurn
      }
      onEndTurn={isMultiplayerGame ? multiplayer.endTurn : endCurrentTurn}
      state={activeGameState}
    />
  );
}

export default App;
