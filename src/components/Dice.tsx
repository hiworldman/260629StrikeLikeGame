interface DiceProps {
  value: number;
  isRolling?: boolean;
}

const pipPositions: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export function Dice({ value, isRolling = false }: DiceProps) {
  const isX = value === 1;

  return (
    <div
      className={`die ${isX ? "die--x" : ""} ${isRolling ? "die--rolling" : ""}`}
      aria-label={isX ? "X 주사위" : `주사위 ${value}`}
    >
      {isX ? (
        <span className="die__x">×</span>
      ) : (
        <div className="die__pips" aria-hidden="true">
          {Array.from({ length: 9 }, (_, index) => (
            <span
              className={
                pipPositions[value]?.includes(index)
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
