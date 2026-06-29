import type { Player } from "../types";

interface PlayerCardProps {
  player: Player;
  isCurrent: boolean;
  isWinner: boolean;
  displayDiceCount?: number;
}

export function PlayerCard({
  player,
  isCurrent,
  isWinner,
  displayDiceCount,
}: PlayerCardProps) {
  return (
    <article
      data-player-id={player.id}
      className={[
        "player-card",
        isCurrent ? "player-card--current" : "",
        player.eliminated ? "player-card--eliminated" : "",
        isWinner ? "player-card--winner" : "",
      ].join(" ")}
    >
      <div className="player-card__head">
        <div className="player-card__avatar">
          {player.type === "human" ? "P" : "AI"}
        </div>
        <div>
          <h3>{player.name}</h3>
          <span>{player.type === "human" ? "HUMAN" : "COMPUTER"}</span>
        </div>
      </div>
      <div className="player-card__status">
        <span className="player-card__dice-icon">◆</span>
        <strong>{displayDiceCount ?? player.diceCount}</strong>
        <small> DICE</small>
      </div>
      {isCurrent && !player.eliminated && (
        <div className="player-card__badge">CURRENT TURN</div>
      )}
      {player.eliminated && <div className="player-card__badge">ELIMINATED</div>}
      {isWinner && <div className="player-card__badge">WINNER</div>}
    </article>
  );
}
