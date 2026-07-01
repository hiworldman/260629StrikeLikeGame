import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { CSSProperties } from "react";
import type { ArenaDie, TurnAnimation } from "../types";
import { Dice } from "./Dice";

interface ArenaProps {
  dice: ArenaDie[];
  excludedDice: ArenaDie[];
  lastRolls: number[];
  animation: TurnAnimation | null;
  animationActorIndex: number;
}

type AnimationPhase = "throwing" | "impact" | "settling" | "done";
interface MovementGeometry {
  x: number;
  y: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

function getLandingDuration(animation: TurnAnimation): number {
  return 1150 + Math.max(0, animation.thrownDieIds.length - 1) * 100;
}

function getSettlementDuration(animation: TurnAnimation): number {
  const movingCount = Math.max(
    animation.collectedDieIds.length,
    animation.excludedDieIds.length,
  );
  return movingCount > 0
    ? 1250 + Math.max(0, movingCount - 1) * 90
    : 0;
}

export function Arena({
  dice,
  excludedDice,
  lastRolls,
  animation,
  animationActorIndex,
}: ArenaProps) {
  const [phaseState, setPhaseState] = useState<{
    animationId: string | null;
    phase: AnimationPhase;
  }>({ animationId: null, phase: "done" });
  const dieRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const trayRef = useRef<HTMLElement>(null);
  const [throwVectors, setThrowVectors] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [collectVectors, setCollectVectors] = useState<
    Record<string, MovementGeometry>
  >({});
  const [outVectors, setOutVectors] = useState<
    Record<string, MovementGeometry>
  >({});

  const phase: AnimationPhase =
    animation && phaseState.animationId !== animation.id
      ? "throwing"
      : phaseState.phase;

  useLayoutEffect(() => {
    if (!animation) return;

    const sourceCard = document.querySelector<HTMLElement>(
      `[data-player-id="${animation.actorId}"]`,
    );
    if (!sourceCard) return;

    const sourceRect = sourceCard.getBoundingClientRect();
    const sourceCenter = {
      x: sourceRect.left + sourceRect.width / 2,
      y: sourceRect.top + sourceRect.height / 2,
    };
    const vectors: Record<string, { x: number; y: number }> = {};

    animation.thrownDieIds.forEach((dieId) => {
      const dieWrapper = dieRefs.current[dieId];
      if (!dieWrapper) return;
      const dieRect = dieWrapper.getBoundingClientRect();
      vectors[dieId] = {
        x: sourceCenter.x - (dieRect.left + dieRect.width / 2),
        y: sourceCenter.y - (dieRect.top + dieRect.height / 2),
      };
    });
    setThrowVectors(vectors);
  }, [animation]);

  useEffect(() => {
    if (!animation) {
      setPhaseState({ animationId: null, phase: "done" });
      return;
    }

    const landingDuration = getLandingDuration(animation);
    const impactDuration =
      680 + Math.max(0, animation.thrownDieIds.length - 1) * 100;
    const settlementDuration = getSettlementDuration(animation);
    setCollectVectors({});
    setOutVectors({});
    setPhaseState({ animationId: animation.id, phase: "throwing" });

    const impactTimer = window.setTimeout(() => {
      setPhaseState({ animationId: animation.id, phase: "impact" });
    }, impactDuration);
    const settleTimer = window.setTimeout(() => {
      const targetCard = document.querySelector<HTMLElement>(
        `[data-player-id="${animation.actorId}"]`,
      );
      if (targetCard) {
        const targetRect = targetCard.getBoundingClientRect();
        const targetCenter = {
          x: targetRect.left + targetRect.width / 2,
          y: targetRect.top + targetRect.height / 2,
        };
        const vectors: Record<string, MovementGeometry> = {};

        animation.collectedDieIds.forEach((dieId) => {
          const dieElement =
            dieRefs.current[dieId]?.querySelector<HTMLElement>(".die");
          if (!dieElement) return;
          const dieRect = dieElement.getBoundingClientRect();
          vectors[dieId] = {
            x: targetCenter.x - (dieRect.left + dieRect.width / 2),
            y: targetCenter.y - (dieRect.top + dieRect.height / 2),
            left: dieRect.left,
            top: dieRect.top,
            width: dieRect.width,
            height: dieRect.height,
          };
        });
        setCollectVectors(vectors);
      }
      if (trayRef.current) {
        const trayRect = trayRef.current.getBoundingClientRect();
        const trayCenter = {
          x: trayRect.left + trayRect.width / 2,
          y: trayRect.top + trayRect.height / 2,
        };
        const vectors: Record<string, MovementGeometry> = {};

        animation.excludedDieIds.forEach((dieId) => {
          const dieWrapper = dieRefs.current[dieId];
          if (!dieWrapper) return;
          const dieRect = dieWrapper.getBoundingClientRect();
          vectors[dieId] = {
            x: trayCenter.x - (dieRect.left + dieRect.width / 2),
            y: trayCenter.y - (dieRect.top + dieRect.height / 2),
            left: dieRect.left,
            top: dieRect.top,
            width: dieRect.width,
            height: dieRect.height,
          };
        });
        setOutVectors(vectors);
      }
      setPhaseState({ animationId: animation.id, phase: "settling" });
    }, landingDuration + 350);
    const doneTimer = window.setTimeout(() => {
      setPhaseState({ animationId: animation.id, phase: "done" });
    }, landingDuration + 350 + settlementDuration + 120);

    return () => {
      window.clearTimeout(impactTimer);
      window.clearTimeout(settleTimer);
      window.clearTimeout(doneTimer);
    };
  }, [animation]);

  const animationIsActive = animation !== null && phase !== "done";
  const displayedDice =
    animationIsActive && animation
      ? phase === "throwing"
        ? animation.arenaBeforeImpact
        : animation.arenaAfterThrow
      : dice;
  const displayedExcludedDice =
    animationIsActive && animation
      ? excludedDice.filter(
          (die) => !animation.excludedDieIds.includes(die.id),
        )
      : excludedDice;

  return (
    <section
      className={`arena-section arena-section--actor-${Math.max(0, animationActorIndex)}`}
      aria-label="Arena"
    >
      <div className="arena">
        <div className="arena__rim">
          <div className="arena__surface">
            <div className="arena__label">
              <span>THE</span>
              <strong>ARENA</strong>
            </div>
            {animationIsActive &&
              animation &&
              animation.thrownDieIds.length > 1 &&
              (phase === "throwing" || phase === "impact") && (
                <div className="slot-roll" aria-hidden="true">
                  {[0, 1, 2].map((reel) => (
                    <div className="slot-roll__reel" key={reel}>
                      <span>
                        {[1, 2, 3, 4, 5, 6, 2, 5, 3, 6].map(
                          (value, index) => (
                            <b key={`${value}-${index}`}>{value}</b>
                          ),
                        )}
                      </span>
                    </div>
                  ))}
                  <strong>ALL DICE</strong>
                </div>
              )}
            <div
              className={[
                "arena__dice",
                displayedDice.length > 24
                  ? "arena__dice--dense"
                  : displayedDice.length > 12
                    ? "arena__dice--medium"
                    : "arena__dice--normal",
              ].join(" ")}
            >
              {displayedDice.length === 0 ? (
                <p className="arena__empty">
                  <span>◇</span>
                  Arena is empty
                </p>
              ) : (
                displayedDice.map((die, index) => {
                  const isThrown =
                    animationIsActive &&
                    animation?.thrownDieIds.includes(die.id);
                  const isCollided =
                    phase === "impact" &&
                    animation?.collidedDieIds.includes(die.id);
                  const isCollected =
                    phase === "settling" &&
                    animation?.collectedDieIds.includes(die.id);
                  const isExcluded =
                    phase === "settling" &&
                    animation?.excludedDieIds.includes(die.id);
                  const movementIndex = animation
                    ? Math.max(
                        animation.collectedDieIds.indexOf(die.id),
                        animation.excludedDieIds.indexOf(die.id),
                        0,
                      )
                    : 0;
                  const collectVector = collectVectors[die.id];
                  const throwVector = throwVectors[die.id];
                  const outVector = outVectors[die.id];

                  return (
                    <Fragment key={die.id}>
                      {(isCollected || isExcluded) && (
                        <div
                          className="arena__die arena__die--placeholder"
                          aria-hidden="true"
                        />
                      )}
                      <div
                      className={[
                        "arena__die",
                        `arena__die--${index % 7}`,
                        isThrown &&
                        (phase === "throwing" || phase === "impact")
                          ? "arena__die--entering"
                          : "",
                        isCollided ? "arena__die--collided" : "",
                        isCollected ? "arena__die--leaving" : "",
                        isExcluded ? "arena__die--out" : "",
                      ].join(" ")}
                      ref={(element) => {
                        dieRefs.current[die.id] = element;
                      }}
                      style={{
                        animationDelay:
                          isThrown &&
                          (phase === "throwing" || phase === "impact")
                            ? `${Math.max(0, animation?.thrownDieIds.indexOf(die.id) ?? 0) * 100}ms`
                            : `${movementIndex * 90}ms`,
                        ...(throwVector
                          ? {
                              "--die-throw-x": `${throwVector.x}px`,
                              "--die-throw-y": `${throwVector.y}px`,
                            }
                          : {}),
                        ...(collectVector
                          ? {
                              "--die-collect-x": `${collectVector.x}px`,
                              "--die-collect-y": `${collectVector.y}px`,
                              "--die-start-left": `${collectVector.left}px`,
                              "--die-start-top": `${collectVector.top}px`,
                              "--die-start-width": `${collectVector.width}px`,
                              "--die-start-height": `${collectVector.height}px`,
                            }
                          : {}),
                        ...(outVector
                          ? {
                              "--die-out-x": `${outVector.x}px`,
                              "--die-out-y": `${outVector.y}px`,
                              "--die-start-left": `${outVector.left}px`,
                              "--die-start-top": `${outVector.top}px`,
                              "--die-start-width": `${outVector.width}px`,
                              "--die-start-height": `${outVector.height}px`,
                            }
                          : {}),
                      } as CSSProperties}
                    >
                      <Dice value={die.value} />
                      </div>
                    </Fragment>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="arena-meta">
        <span>
          IN ARENA{" "}
          <strong>
            {displayedDice.filter((die) => die.value !== 1).length}
          </strong>
        </span>
        <span>
          LAST ROLL{" "}
          <strong>
            {lastRolls.length === 0
              ? "—"
              : lastRolls
                  .map((value) => (value === 1 ? "X" : value))
                  .join(" · ")}
          </strong>
        </span>
      </div>
      <aside
        className="excluded-tray"
        aria-label="제외된 주사위"
        ref={trayRef}
      >
        <span className="excluded-tray__count">
          OUT <strong>× {displayedExcludedDice.length}</strong>
        </span>
        <div className="excluded-tray__dice">
          {displayedExcludedDice.map((die) => (
            <Dice key={die.id} value={1} />
          ))}
        </div>
      </aside>
    </section>
  );
}
