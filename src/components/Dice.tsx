import { useEffect, useState } from "react";

interface DiceProps {
  value: number;
  isRolling?: boolean;
  isRoulette?: boolean;
  rouletteOffset?: number;
}

const pipPositions: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

const rouletteFaces = [2, 5, 3, 6, 1, 4];

export function Dice({
  value,
  isRolling = false,
  isRoulette = false,
  rouletteOffset = 0,
}: DiceProps) {
  const [rouletteValue, setRouletteValue] = useState(value);

  useEffect(() => {
    if (!isRoulette) {
      setRouletteValue(value);
      return;
    }

    let cursor = rouletteOffset % rouletteFaces.length;
    setRouletteValue(rouletteFaces[cursor]);

    const intervalId = window.setInterval(() => {
      cursor = (cursor + 1) % rouletteFaces.length;
      setRouletteValue(rouletteFaces[cursor]);
    }, 80);

    return () => window.clearInterval(intervalId);
  }, [isRoulette, rouletteOffset, value]);

  const displayedValue = isRoulette ? rouletteValue : value;
  const isX = displayedValue === 1;

  return (
    <div
      className={[
        "die",
        isX ? "die--x" : "",
        isRolling ? "die--rolling" : "",
        isRoulette ? "die--roulette" : "",
      ].join(" ")}
      aria-label={
        isRoulette
          ? "주사위 굴리는 중"
          : isX
            ? "X 주사위"
            : `주사위 ${displayedValue}`
      }
    >
      {isX ? (
        <span className="die__x">×</span>
      ) : (
        <div className="die__pips" aria-hidden="true">
          {Array.from({ length: 9 }, (_, index) => (
            <span
              className={
                pipPositions[displayedValue]?.includes(index)
                  ? "die__pip die__pip--visible"
                  : "die__pip"
              }
              key={index}
            />
          ))}
        </div>
      )}
    </div>
  );
}
