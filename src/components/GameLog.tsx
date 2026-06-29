import { useEffect, useRef } from "react";

interface GameLogProps {
  logs: string[];
}

export function GameLog({ logs }: GameLogProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [logs]);

  return (
    <aside className="game-log">
      <div className="game-log__header">
        <h2>GAME LOG</h2>
        <span>LIVE</span>
      </div>
      <div className="game-log__list" ref={listRef} aria-live="polite">
        {logs.map((log, index) => (
          <div className="game-log__item" key={`${index}-${log}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <p>{log}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}
