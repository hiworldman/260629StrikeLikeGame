export type PlayerType = "human" | "ai";
export type AiDifficulty = "Easy" | "Normal" | "Hard";
export type GamePhase = "setup" | "playing" | "finished";

export interface Player {
  id: string;
  name: string;
  type: PlayerType;
  diceCount: number;
  eliminated: boolean;
}

export interface ArenaDie {
  id: string;
  value: number;
  x: number;
  y: number;
  rotation: number;
}

export interface ThrowVector {
  angle: number;
  power: number;
}

export interface DiceMotionPoint {
  x: number;
  y: number;
  rotation: number;
  time: number;
}

export interface DiceMotionTrack {
  dieId: string;
  points: DiceMotionPoint[];
  firstImpactTime: number | null;
}

export interface TurnAnimation {
  id: string;
  actorId: string;
  actorName: string;
  actorDiceBefore: number;
  thrownValues: number[];
  collectedValues: number[];
  excludedCount: number;
  arenaBeforeImpact: ArenaDie[];
  arenaAfterThrow: ArenaDie[];
  thrownDieIds: string[];
  collidedDieIds: string[];
  collectedDieIds: string[];
  excludedDieIds: string[];
  motionTracks: DiceMotionTrack[];
  motionDuration: number;
}

export interface GameState {
  players: Player[];
  arenaDice: ArenaDie[];
  excludedDice: ArenaDie[];
  currentPlayerIndex: number;
  phase: GamePhase;
  winnerId: string | null;
  logs: string[];
  aiDifficulty: AiDifficulty;
  turnNumber: number;
  lastRoll: number | null;
  lastRolls: number[];
  lastAnimation: TurnAnimation | null;
  awaitingTurnDecision: boolean;
  turnDeadline: number | null;
}

export interface TurnResult {
  state: GameState;
  rolledValue: number;
  rolledValues: number[];
  collectedCount: number;
}
