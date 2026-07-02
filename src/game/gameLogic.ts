import type {
  AiDifficulty,
  ArenaDie,
  GameState,
  Player,
  ThrowVector,
  TurnAnimation,
  TurnResult,
} from "../types";
import { simulateThrow } from "./physics";

const DEFAULT_THROW: ThrowVector = { angle: -Math.PI / 2, power: 0.72 };

export function getStartingDiceCount(playerCount: number): number {
  if (playerCount <= 2) return 9;
  if (playerCount === 3) return 8;
  if (playerCount === 4) return 7;
  return 6;
}

export function generateDiceValue(random: () => number = Math.random): number {
  const result = random();
  if (result < 0.15) return 1;
  return Math.floor(((result - 0.15) / 0.85) * 5) + 2;
}

export function rollDice(random: () => number = Math.random): number {
  return generateDiceValue(random);
}

export function getTurnAnimationDuration(
  animation: TurnAnimation | null,
): number {
  if (!animation) return 0;
  const settlementStart = animation.motionDuration + 300;
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

function createTurnDeadline(delay = 0): number {
  return Date.now() + delay + 7_000;
}

function createArenaDie(
  value: number,
  position: Partial<Pick<ArenaDie, "x" | "y" | "rotation">> = {},
): ArenaDie {
  return {
    id: `die-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    value,
    x: position.x ?? 0.5,
    y: position.y ?? 0.5,
    rotation: position.rotation ?? 0,
  };
}

function createPlayers(
  playerCount: number,
  startingDice: number,
): Player[] {
  return [
    {
      id: "player",
      name: "Player",
      type: "human",
      diceCount: startingDice,
      eliminated: false,
    },
    ...Array.from({ length: playerCount - 1 }, (_, index) => ({
      id: `ai-${index + 1}`,
      name: `AI ${index + 1}`,
      type: "ai" as const,
      diceCount: startingDice,
      eliminated: false,
    })),
  ];
}

export function createInitialState(
  playerCount: number,
  aiDifficulty: AiDifficulty,
  random: () => number = Math.random,
): GameState {
  const safePlayerCount = Math.min(5, Math.max(2, playerCount));
  const startingDice = getStartingDiceCount(safePlayerCount);
  const startingValue = Math.floor(random() * 5) + 2;
  return {
    players: createPlayers(safePlayerCount, startingDice),
    arenaDice: [
      createArenaDie(startingValue, {
        x: 0.5 + (random() - 0.5) * 0.18,
        y: 0.48 + (random() - 0.5) * 0.18,
        rotation: random() * 360,
      }),
    ],
    excludedDice: [],
    currentPlayerIndex: 0,
    phase: "playing",
    winnerId: null,
    logs: [],
    aiDifficulty,
    turnNumber: 1,
    lastRoll: null,
    lastRolls: [],
    lastAnimation: null,
    awaitingTurnDecision: false,
    turnDeadline: createTurnDeadline(),
  };
}

export function createMultiplayerState(
  participants: Array<{ id: string; name: string }>,
  firstPlayerId?: string,
  random: () => number = Math.random,
): GameState {
  const safeParticipants = participants.slice(0, 5);
  const firstPlayerIndex = safeParticipants.findIndex(
    (participant) => participant.id === firstPlayerId,
  );
  const ordered =
    firstPlayerIndex > 0
      ? [
          ...safeParticipants.slice(firstPlayerIndex),
          ...safeParticipants.slice(0, firstPlayerIndex),
        ]
      : safeParticipants;
  const state = createInitialState(safeParticipants.length, "Normal", random);
  const startingDice = getStartingDiceCount(safeParticipants.length);
  return {
    ...state,
    players: ordered.map((participant) => ({
      id: participant.id,
      name: participant.name,
      type: "human",
      diceCount: startingDice,
      eliminated: false,
    })),
  };
}

export function getNextPlayerIndex(
  players: Player[],
  currentPlayerIndex: number,
): number {
  for (let offset = 1; offset <= players.length; offset += 1) {
    const index = (currentPlayerIndex + offset) % players.length;
    if (!players[index].eliminated && players[index].diceCount > 0) {
      return index;
    }
  }
  return currentPlayerIndex;
}

export function checkWinner(players: Player[]): Player | null {
  const active = players.filter(
    (player) => !player.eliminated && player.diceCount > 0,
  );
  return active.length === 1 ? active[0] : null;
}

function findMatchingValues(dice: ArenaDie[]): number[] {
  const counts = new Map<number, number>();
  dice.forEach((die) => counts.set(die.value, (counts.get(die.value) ?? 0) + 1));
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([value]) => value);
}

function resolveRolls(
  state: GameState,
  rolledValues: number[],
  random: () => number,
  throwVector: ThrowVector,
): TurnResult {
  const fallbackValue = rolledValues.at(-1) ?? 1;
  if (state.phase !== "playing") {
    return { state, rolledValue: fallbackValue, rolledValues, collectedCount: 0 };
  }

  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.eliminated || currentPlayer.diceCount <= 0) {
    const players = state.players.map((player, index) =>
      index === state.currentPlayerIndex
        ? { ...player, eliminated: true }
        : { ...player },
    );
    return {
      state: {
        ...state,
        players,
        currentPlayerIndex: getNextPlayerIndex(players, state.currentPlayerIndex),
        awaitingTurnDecision: false,
        turnDeadline: createTurnDeadline(),
      },
      rolledValue: fallbackValue,
      rolledValues,
      collectedCount: 0,
    };
  }

  const players = state.players.map((player) => ({ ...player }));
  players[state.currentPlayerIndex].diceCount -= rolledValues.length;
  const thrownDice = rolledValues.map((value) => createArenaDie(value));
  const physics = simulateThrow(
    state.arenaDice,
    thrownDice,
    throwVector,
    random,
  );
  const arenaBeforeImpact = [
    ...state.arenaDice.map((die) => ({ ...die })),
    ...thrownDice.map((die) => {
      const start = physics.motionTracks
        .find((track) => track.dieId === die.id)
        ?.points.at(0);
      return start
        ? {
            ...die,
            x: start.x,
            y: start.y,
            rotation: start.rotation,
          }
        : { ...die };
    }),
  ];
  let arenaDice = physics.dice;
  const arenaAfterThrow = arenaDice.map((die) => ({ ...die }));
  const excludedThisTurn = arenaDice.filter((die) => die.value === 1);
  const excludedDieIds = excludedThisTurn.map((die) => die.id);
  const excludedDice = [...state.excludedDice, ...excludedThisTurn];
  arenaDice = arenaDice.filter((die) => die.value !== 1);

  const matchingValues = findMatchingValues(arenaDice);
  const matchingDice = arenaDice.filter((die) =>
    matchingValues.includes(die.value),
  );
  const collectedCount = matchingDice.length;
  if (collectedCount > 0) {
    players[state.currentPlayerIndex].diceCount += collectedCount;
    arenaDice = arenaDice.filter(
      (die) => !matchingValues.includes(die.value),
    );
  }
  if (players[state.currentPlayerIndex].diceCount === 0) {
    players[state.currentPlayerIndex].eliminated = true;
  }

  const lastAnimation: TurnAnimation = {
    id: `turn-${state.turnNumber}-${Date.now()}`,
    actorId: currentPlayer.id,
    actorName: currentPlayer.name,
    actorDiceBefore: currentPlayer.diceCount,
    thrownValues: rolledValues,
    collectedValues: matchingDice.map((die) => die.value),
    excludedCount: excludedThisTurn.length,
    arenaBeforeImpact,
    arenaAfterThrow,
    thrownDieIds: thrownDice.map((die) => die.id),
    collidedDieIds: physics.collidedDieIds,
    collectedDieIds: matchingDice.map((die) => die.id),
    excludedDieIds,
    motionTracks: physics.motionTracks,
    motionDuration: physics.duration,
  };

  const winner = checkWinner(players);
  if (winner) {
    return {
      state: {
        ...state,
        players,
        arenaDice,
        excludedDice,
        phase: "finished",
        winnerId: winner.id,
        lastRoll: fallbackValue,
        lastRolls: rolledValues,
        lastAnimation,
        awaitingTurnDecision: false,
        turnDeadline: null,
      },
      rolledValue: fallbackValue,
      rolledValues,
      collectedCount,
    };
  }

  const canContinue =
    collectedCount === 0 &&
    arenaDice.length > 0 &&
    !players[state.currentPlayerIndex].eliminated;
  if (canContinue) {
    return {
      state: {
        ...state,
        players,
        arenaDice,
        excludedDice,
        lastRoll: fallbackValue,
        lastRolls: rolledValues,
        lastAnimation,
        awaitingTurnDecision: true,
        turnDeadline: createTurnDeadline(getTurnAnimationDuration(lastAnimation)),
      },
      rolledValue: fallbackValue,
      rolledValues,
      collectedCount,
    };
  }

  const nextIndex = getNextPlayerIndex(players, state.currentPlayerIndex);
  return {
    state: {
      ...state,
      players,
      arenaDice,
      excludedDice,
      currentPlayerIndex: nextIndex,
      turnNumber: state.turnNumber + 1,
      lastRoll: fallbackValue,
      lastRolls: rolledValues,
      lastAnimation,
      awaitingTurnDecision: false,
      turnDeadline: createTurnDeadline(getTurnAnimationDuration(lastAnimation)),
    },
    rolledValue: fallbackValue,
    rolledValues,
    collectedCount,
  };
}

export function endTurn(state: GameState): GameState {
  if (state.phase !== "playing" || !state.awaitingTurnDecision) return state;
  const nextIndex = getNextPlayerIndex(
    state.players,
    state.currentPlayerIndex,
  );
  return {
    ...state,
    currentPlayerIndex: nextIndex,
    awaitingTurnDecision: false,
    lastAnimation: null,
    turnDeadline: createTurnDeadline(),
    turnNumber: state.turnNumber + 1,
  };
}

export function expireTurn(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  const nextIndex = getNextPlayerIndex(
    state.players,
    state.currentPlayerIndex,
  );
  return {
    ...state,
    currentPlayerIndex: nextIndex,
    awaitingTurnDecision: false,
    lastAnimation: null,
    lastRolls: [],
    turnNumber: state.turnNumber + 1,
    turnDeadline: createTurnDeadline(),
  };
}

export function resolveTurn(
  state: GameState,
  rolledValue: number,
  random: () => number = Math.random,
  throwVector: ThrowVector = DEFAULT_THROW,
): TurnResult {
  return resolveRolls(state, [rolledValue], random, throwVector);
}

export function playTurn(
  state: GameState,
  random: () => number = Math.random,
  throwVector: ThrowVector = DEFAULT_THROW,
): TurnResult {
  if (state.phase !== "playing") {
    return resolveRolls(state, [], random, throwVector);
  }
  const player = state.players[state.currentPlayerIndex];
  const rollCount =
    state.arenaDice.length === 0 ? Math.max(1, player?.diceCount ?? 1) : 1;
  const rolledValues: number[] = [];
  for (let index = 0; index < rollCount; index += 1) {
    let value = rollDice(random);
    if (
      rollCount > 1 &&
      value !== 1 &&
      rolledValues.includes(value) &&
      random() < 0.28
    ) {
      value = rollDice(random);
    }
    rolledValues.push(value);
  }
  return resolveRolls(state, rolledValues, random, throwVector);
}
