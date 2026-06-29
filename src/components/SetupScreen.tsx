import { useState } from "react";
import type { AiDifficulty } from "../types";

interface SetupScreenProps {
  onStart: (playerCount: number, difficulty: AiDifficulty) => void;
}

const difficulties: {
  value: AiDifficulty;
  description: string;
}[] = [
  { value: "Easy", description: "가볍고 빠른 플레이" },
  { value: "Normal", description: "균형 잡힌 기본 전략" },
  { value: "Hard", description: "공격적인 도전" },
];

export function SetupScreen({ onStart }: SetupScreenProps) {
  const [playerCount, setPlayerCount] = useState(2);
  const [difficulty, setDifficulty] = useState<AiDifficulty>("Normal");

  return (
    <main className="setup">
      <div className="setup__glow" />
      <section className="setup__card">
        <header className="setup__brand">
          <span className="eyebrow">DICE ARENA</span>
          <h1>STRIKE</h1>
          <p>던지고, 매칭하고, 마지막까지 살아남으세요.</p>
        </header>

        <div className="setup__section">
          <div className="section-title">
            <span>01</span>
            <div>
              <h2>참가 인원</h2>
              <p>Player 1명 + AI</p>
            </div>
          </div>
          <div className="player-count-options">
            {[2, 3, 4].map((count) => (
              <button
                className={playerCount === count ? "option option--selected" : "option"}
                key={count}
                onClick={() => setPlayerCount(count)}
                type="button"
              >
                <strong>{count}</strong>
                <span>PLAYERS</span>
                <small>Player + AI {count - 1}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="setup__section">
          <div className="section-title">
            <span>02</span>
            <div>
              <h2>AI 난이도</h2>
              <p>모든 AI에 동일하게 적용됩니다.</p>
            </div>
          </div>
          <div className="difficulty-options">
            {difficulties.map((item) => (
              <button
                className={
                  difficulty === item.value
                    ? "difficulty-option difficulty-option--selected"
                    : "difficulty-option"
                }
                key={item.value}
                onClick={() => setDifficulty(item.value)}
                type="button"
              >
                <span className="difficulty-option__mark" />
                <span>
                  <strong>{item.value}</strong>
                  <small>{item.description}</small>
                </span>
              </button>
            ))}
          </div>
        </div>

        <button
          className="start-button"
          onClick={() => onStart(playerCount, difficulty)}
          type="button"
        >
          <span>ENTER THE ARENA</span>
          <strong>→</strong>
        </button>
        <p className="setup__footnote">SINGLE PLAYER · NO ACCOUNT REQUIRED</p>
      </section>
    </main>
  );
}
