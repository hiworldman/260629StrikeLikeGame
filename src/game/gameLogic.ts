import type {
  AiDifficulty,
  ArenaDie,
  GameState,
  Player,
  TurnResult,
} from "../types";

export function getStartingDiceCount(playerCount: number): number {
  if (playerCount <= 2) return 9;
  if (playerCount === 3) return 8;
  if (playerCount === 4) return 7;
  return 6;
}

export function generateDiceValue(random: () => number = Math.random): number {
  const result = random();
  if (result < 0.08) return 1;
  return Math.floor(((result - 0.08) / 0.92) * 5) + 2;
}

export function rollDice(random: () => number = Math.random): number {
  return generateDiceValue(random);
}

function generateArenaStartValue(random: () => number): number {
  return Math.floor(random() * 5) + 2;
}

function createArenaDie(value: number): ArenaDie {
  return {
    id: `die-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    value,
  };
}

export function createInitialState(
  playerCount: number,
  aiDifficulty: AiDifficulty,
  random: () => number = Math.random,
): GameState {
  const safePlayerCount = Math.min(5, Math.max(2, playerCount));
  const startingDice = getStartingDiceCount(safePlayerCount);
  const startingValue = generateArenaStartValue(random);
  const players: Player[] = [
    {
      id: "player",
      name: "Player",
      type: "human",
      diceCount: startingDice,
      eliminated: false,
    },
    ...Array.from({ length: safePlayerCount - 1 }, (_, index) => ({
      id: `ai-${index + 1}`,
      name: `AI ${index + 1}`,
      type: "ai" as const,
      diceCount: startingDice,
      eliminated: false,
    })),
  ];

  return {
    players,
    arenaDice: [createArenaDie(startingValue)],
    excludedDice: [],
    currentPlayerIndex: 0,
    phase: "playing",
    winnerId: null,
    logs: [
      `${safePlayerCount}인 게임 시작 · AI ${aiDifficulty}`,
      `Arena에 시작 주사위 ${startingValue}이(가) 놓였습니다.`,
      "Player의 차례입니다.",
    ],
    aiDifficulty,
    turnNumber: 1,
    lastRoll: null,
    lastRolls: [],
    lastAnimation: null,
    awaitingTurnDecision: false,
  };
}

export function createMultiplayerState(
  participants: Array<{ id: string; name: string }>,
  random: () => number = Math.random,
): GameState {
  const safeParticipants = participants.slice(0, 5);
  const state = createInitialState(safeParticipants.length, "Normal", random);
  const startingDice = getStartingDiceCount(safeParticipants.length);
  return {
    ...state,
    players: safeParticipants.map((participant) => ({
        id: participant.id,
        name: participant.name,
        type: "human",
        diceCount: startingDice,
        eliminated: false,
      })),
    logs: [
      `${safeParticipants.map((participant) => participant.name).join(" vs ")} 멀티플레이 시작`,
      `Arena에 시작 주사위 ${state.arenaDice[0].value}이(가) 놓였습니다.`,
      `${safeParticipants[0].name}의 차례입니다.`,
    ],
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
  const activePlayers = players.filter(
    (player) => !player.eliminated && player.diceCount > 0,
  );
  return activePlayers.length === 1 ? activePlayers[0] : null;
}

function findMatchingValues(dice: ArenaDie[]): number[] {
  const counts = new Map<number, number>();
  dice.forEach((die) => counts.set(die.value, (counts.get(die.value) ?? 0) + 1));
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([value]) => value)
    .sort((a, b) => a - b);
}

function resolveRolls(
  state: GameState,
  rolledValues: number[],
  random: () => number,
): TurnResult {
  const fallbackValue =
    rolledValues.length > 0 ? rolledValues[rolledValues.length - 1] : 1;
  if (state.phase !== "playing") {
    return {
      state,
      rolledValue: fallbackValue,
      rolledValues,
      collectedCount: 0,
    };
  }

  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.eliminated || currentPlayer.diceCount <= 0) {
    const players = state.players.map((player, index) =>
      index === state.currentPlayerIndex
        ? { ...player, eliminated: true }
        : player,
    );
    const nextIndex = getNextPlayerIndex(players, state.currentPlayerIndex);
    return {
      state: {
        ...state,
        players,
        currentPlayerIndex: nextIndex,
        logs: [
          ...state.logs,
          `${currentPlayer?.name ?? "참가자"}은(는) 주사위가 없어 탈락했습니다.`,
          `${players[nextIndex].name}의 차례입니다.`,
        ],
        awaitingTurnDecision: false,
      },
      rolledValue: fallbackValue,
      rolledValues,
      collectedCount: 0,
    };
  }

  const players = state.players.map((player) => ({ ...player }));
  players[state.currentPlayerIndex].diceCount -= rolledValues.length;

  const isAllDiceRoll = state.arenaDice.length === 0 && rolledValues.length > 1;
  const rollLabel = rolledValues.map((value) => (value === 1 ? "X" : value)).join(", ");
  const turnLogs = [
    isAllDiceRoll
      ? `Arena가 비어 ${currentPlayer.name}이(가) 보유 주사위 ${rolledValues.length}개를 모두 던졌습니다: [${rollLabel}]`
      : `${currentPlayer.name}이(가) ${rollLabel}을(를) 던졌습니다.`,
  ];

  let arenaDice = state.arenaDice.map((die) => ({ ...die }));
  const arenaBeforeCollision = state.arenaDice.map((die) => ({ ...die }));
  const excludedDice = [...state.excludedDice];

  // 던진 주사위 수만큼 서로 다른 기존 주사위에 충돌시켜 눈을 다시 굴린다.
  const collisionCount = Math.min(arenaDice.length, rolledValues.length);
  const availableIndexes = arenaDice.map((_, index) => index);
  const collidedIndexes: number[] = [];

  for (let count = 0; count < collisionCount; count += 1) {
    const pick = Math.floor(random() * availableIndexes.length);
    collidedIndexes.push(availableIndexes.splice(pick, 1)[0]);
  }

  collidedIndexes.forEach((index) => {
    const previousValue = arenaDice[index].value;
    const nextValue = generateDiceValue(random);
    arenaDice[index].value = nextValue;
    turnLogs.push(
      `충돌! Arena 주사위 ${previousValue}의 눈이 ${nextValue === 1 ? "X" : nextValue}(으)로 바뀌었습니다.`,
    );
  });

  const collidedDieIds = collidedIndexes.map((index) => arenaDice[index].id);
  const thrownDice = rolledValues.map((value) => createArenaDie(value));
  const arenaBeforeImpact = [
    ...arenaBeforeCollision,
    ...thrownDice.map((die) => ({ ...die })),
  ];
  arenaDice.push(...thrownDice);
  const arenaAfterThrow = arenaDice.map((die) => ({ ...die }));

  const excludedThisTurn = arenaDice.filter((die) => die.value === 1);
  const excludedDieIds = excludedThisTurn.map((die) => die.id);
  const collidedXCount = excludedThisTurn.filter((die) =>
    collidedDieIds.includes(die.id),
  ).length;
  if (collidedXCount > 0) {
    turnLogs.push(`충돌로 X가 된 주사위 ${collidedXCount}개가 게임에서 제외되었습니다.`);
  }
  excludedDice.push(...excludedThisTurn);
  arenaDice = arenaDice.filter((die) => die.value !== 1);

  const thrownXCount = rolledValues.filter((value) => value === 1).length;
  if (thrownXCount > 0) {
    turnLogs.push(`X 주사위 ${thrownXCount}개가 게임에서 제외되었습니다.`);
  }

  const matchingValues = findMatchingValues(arenaDice);
  const matchingDice = arenaDice.filter((die) =>
    matchingValues.includes(die.value),
  );
  const collectedCount = matchingDice.length;
  const collectedValues = matchingDice.map((die) => die.value);
  const excludedCount = excludedDice.length - state.excludedDice.length;
  const lastAnimation = {
    id: `turn-${state.turnNumber}-${Date.now()}`,
    actorId: currentPlayer.id,
    actorName: currentPlayer.name,
    actorDiceBefore: currentPlayer.diceCount,
    thrownValues: rolledValues,
    collectedValues,
    excludedCount,
    arenaBeforeImpact,
    arenaAfterThrow,
    thrownDieIds: thrownDice.map((die) => die.id),
    collidedDieIds,
    collectedDieIds: matchingDice.map((die) => die.id),
    excludedDieIds,
  };

  if (collectedCount > 0) {
    players[state.currentPlayerIndex].diceCount += collectedCount;
    arenaDice = arenaDice.filter(
      (die) => !matchingValues.includes(die.value),
    );
    matchingValues.forEach((value) => {
      const count = matchingDice.filter((die) => die.value === value).length;
      turnLogs.push(
        `${currentPlayer.name}이(가) ${value} 주사위 ${count}개를 회수했습니다.`,
      );
    });
    if (arenaDice.length === 0) {
      turnLogs.push(
        "Arena의 모든 주사위가 회수되었습니다. 다음 참가자는 보유 주사위를 모두 던집니다.",
      );
    }
  } else if (arenaDice.length > 0) {
    turnLogs.push("같은 눈이 없어 주사위가 Arena에 남았습니다.");
  }

  if (players[state.currentPlayerIndex].diceCount === 0) {
    players[state.currentPlayerIndex].eliminated = true;
    turnLogs.push(`${currentPlayer.name}이(가) 주사위를 모두 잃고 탈락했습니다.`);
  }

  const winner = checkWinner(players);
  if (winner) {
    turnLogs.push(`${winner.name} 승리! 마지막 생존자가 되었습니다.`);
    return {
      state: {
        ...state,
        players,
        arenaDice,
        excludedDice,
        phase: "finished",
        winnerId: winner.id,
        logs: [...state.logs, ...turnLogs],
        lastRoll: fallbackValue,
        lastRolls: rolledValues,
        lastAnimation,
        awaitingTurnDecision: false,
      },
      rolledValue: fallbackValue,
      rolledValues,
      collectedCount,
    };
  }

  if (
    collectedCount === 0 &&
    arenaDice.length > 0 &&
    !players[state.currentPlayerIndex].eliminated
  ) {
    turnLogs.push(
      `${currentPlayer.name}은(는) 추가로 던지거나 턴을 종료할 수 있습니다.`,
    );
    return {
      state: {
        ...state,
        players,
        arenaDice,
        excludedDice,
        logs: [...state.logs, ...turnLogs],
        lastRoll: fallbackValue,
        lastRolls: rolledValues,
        lastAnimation,
        awaitingTurnDecision: true,
      },
      rolledValue: fallbackValue,
      rolledValues,
      collectedCount,
    };
  }

  const nextIndex = getNextPlayerIndex(players, state.currentPlayerIndex);
  if (collectedCount === 0 && arenaDice.length === 0) {
    turnLogs.push(
      `X 처리로 Arena가 비어 ${currentPlayer.name}의 턴이 자동 종료됩니다.`,
      `${players[nextIndex].name}은(는) 보유 주사위를 모두 던져야 합니다.`,
    );
  } else {
    turnLogs.push(`${players[nextIndex].name}의 차례입니다.`);
  }

  return {
    state: {
      ...state,
      players,
      arenaDice,
      excludedDice,
      currentPlayerIndex: nextIndex,
      logs: [...state.logs, ...turnLogs],
      turnNumber: state.turnNumber + 1,
      lastRoll: fallbackValue,
      lastRolls: rolledValues,
      lastAnimation,
      awaitingTurnDecision: false,
    },
    rolledValue: fallbackValue,
    rolledValues,
    collectedCount,
  };
}

export function endTurn(state: GameState): GameState {
  if (state.phase !== "playing" || !state.awaitingTurnDecision) {
    return state;
  }

  const currentPlayer = state.players[state.currentPlayerIndex];
  const nextIndex = getNextPlayerIndex(
    state.players,
    state.currentPlayerIndex,
  );

  return {
    ...state,
    currentPlayerIndex: nextIndex,
    awaitingTurnDecision: false,
    lastAnimation: null,
    turnNumber: state.turnNumber + 1,
    logs: [
      ...state.logs,
      `${currentPlayer.name}이(가) 턴을 종료했습니다.`,
      `${state.players[nextIndex].name}의 차례입니다.`,
    ],
  };
}

export function resolveTurn(
  state: GameState,
  rolledValue: number,
  random: () => number = Math.random,
): TurnResult {
  return resolveRolls(state, [rolledValue], random);
}

export function playTurn(
  state: GameState,
  random: () => number = Math.random,
): TurnResult {
  if (state.phase !== "playing") {
    return resolveRolls(state, [], random);
  }

  const player = state.players[state.currentPlayerIndex];
  const rollCount =
    state.arenaDice.length === 0 ? Math.max(1, player?.diceCount ?? 1) : 1;
  const rolledValues = Array.from({ length: rollCount }, () => rollDice(random));
  return resolveRolls(state, rolledValues, random);
}
