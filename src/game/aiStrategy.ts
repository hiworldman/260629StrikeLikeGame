import type { AiDifficulty, GameState, Player } from "../types";

export interface AiDecision {
  action: "roll";
  log: string;
}

export interface AiContinuationDecision {
  action: "roll" | "end";
  log: string;
}

export function chooseAiAction(
  state: GameState,
  player: Player,
  difficulty: AiDifficulty,
): AiDecision {
  switch (difficulty) {
    case "Easy":
      return {
        action: "roll",
        log: `${player.name} · Easy AI가 주사위 1개를 던집니다.`,
      };
    case "Normal":
      return {
        action: "roll",
        log: `${player.name} · Normal AI가 Arena의 매칭 가능성을 계산합니다.`,
      };
    case "Hard": {
      const pressure =
        state.arenaDice.length >= 4
          ? "Arena가 붐빕니다. 공격적으로 승부합니다."
          : "다음 매칭 기회를 노립니다.";
      return {
        action: "roll",
        log: `${player.name} · Hard AI: ${pressure}`,
      };
    }
  }
}

export function chooseAiContinuation(
  state: GameState,
  player: Player,
  difficulty: AiDifficulty,
  random: () => number = Math.random,
): AiContinuationDecision {
  const continueChance = {
    Easy: 0.3,
    Normal: state.arenaDice.length >= 3 ? 0.58 : 0.45,
    Hard: state.arenaDice.length >= 2 ? 0.72 : 0.58,
  }[difficulty];
  const shouldRoll = player.diceCount > 1 && random() < continueChance;

  return shouldRoll
    ? {
        action: "roll",
        log: `${player.name} · ${difficulty} AI가 위험을 감수하고 추가로 던집니다.`,
      }
    : {
        action: "end",
        log: `${player.name} · ${difficulty} AI가 현재 상태를 유지하고 턴을 종료합니다.`,
      };
}
