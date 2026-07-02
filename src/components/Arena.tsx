import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
} from "react";
import type {
  ArenaDie,
  ThrowVector,
  TurnAnimation,
} from "../types";
import { Dice } from "./Dice";

interface ArenaProps {
  dice: ArenaDie[];
  excludedDice: ArenaDie[];
  lastRolls: number[];
  animation: TurnAnimation | null;
  animationActorIndex: number;
  canThrow: boolean;
  onThrow: (vector: ThrowVector) => void;
}

type AnimationPhase = "motion" | "reveal" | "settling" | "done";

interface MovementGeometry {
  x: number;
  y: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

interface AimGesture {
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  originX: number;
  originY: number;
}

const RESULT_MOVE_DURATION = 1250;
const RESULT_REVEAL_DELAY = 700;

export function Arena({
  dice,
  excludedDice,
  lastRolls,
  animation,
  animationActorIndex,
  canThrow,
  onThrow,
}: ArenaProps) {
  const [phaseState, setPhaseState] = useState<{
    animationId: string | null;
    phase: AnimationPhase;
  }>({ animationId: null, phase: "done" });
  const [motionElapsed, setMotionElapsed] = useState(0);
  const [aim, setAim] = useState<AimGesture | null>(null);
  const dieRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const trayRef = useRef<HTMLElement>(null);
  const [collectVectors, setCollectVectors] = useState<
    Record<string, MovementGeometry>
  >({});
  const [outVectors, setOutVectors] = useState<
    Record<string, MovementGeometry>
  >({});

  const phase: AnimationPhase =
    animation && phaseState.animationId !== animation.id
      ? "motion"
      : phaseState.phase;
  const animationIsActive = animation !== null && phase !== "done";
  const displayedDice =
    animationIsActive && animation
      ? phase === "motion"
        ? animation.arenaBeforeImpact
        : animation.arenaAfterThrow
      : dice;
  const displayedExcludedDice =
    animationIsActive && animation
      ? excludedDice.filter(
          (die) => !animation.excludedDieIds.includes(die.id),
        )
      : excludedDice;

  useLayoutEffect(() => {
    if (!animation || phase !== "motion") return;
    const running: Animation[] = [];
    animation.motionTracks.forEach((track) => {
      const element = dieRefs.current[track.dieId];
      if (!element || track.points.length < 2) return;
      const keyframes = track.points.map((point) => ({
        left: `${point.x * 100}%`,
        top: `${point.y * 100}%`,
        transform: `translate(-50%, -50%) rotate(${point.rotation}deg)`,
        offset: point.time / animation.motionDuration,
      }));
      running.push(
        element.animate(keyframes, {
          duration: animation.motionDuration,
          easing: "linear",
          fill: "forwards",
        }),
      );
    });
    return () => running.forEach((item) => item.cancel());
  }, [animation, phase]);

  useEffect(() => {
    if (!animation) {
      setPhaseState({ animationId: null, phase: "done" });
      setMotionElapsed(0);
      return;
    }
    setPhaseState({ animationId: animation.id, phase: "motion" });
    setCollectVectors({});
    setOutVectors({});
    const startedAt = performance.now();
    const ticker = window.setInterval(() => {
      setMotionElapsed(performance.now() - startedAt);
    }, 50);
    const revealTimer = window.setTimeout(() => {
      window.clearInterval(ticker);
      setMotionElapsed(animation.motionDuration);
      setPhaseState({ animationId: animation.id, phase: "reveal" });
    }, animation.motionDuration);
    const settleTimer = window.setTimeout(() => {
      const targetCard = document.querySelector<HTMLElement>(
        `[data-player-id="${animation.actorId}"]`,
      );
      if (targetCard) {
        const targetRect = targetCard.getBoundingClientRect();
        const targetX = targetRect.left + targetRect.width / 2;
        const targetY = targetRect.top + targetRect.height / 2;
        const vectors: Record<string, MovementGeometry> = {};
        animation.collectedDieIds.forEach((dieId) => {
          const element = dieRefs.current[dieId];
          if (!element) return;
          const rect = element.getBoundingClientRect();
          vectors[dieId] = {
            x: targetX - (rect.left + rect.width / 2),
            y: targetY - (rect.top + rect.height / 2),
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          };
        });
        setCollectVectors(vectors);
      }
      if (trayRef.current) {
        const trayRect = trayRef.current.getBoundingClientRect();
        const targetX = trayRect.left + trayRect.width / 2;
        const targetY = trayRect.top + trayRect.height / 2;
        const vectors: Record<string, MovementGeometry> = {};
        animation.excludedDieIds.forEach((dieId) => {
          const element = dieRefs.current[dieId];
          if (!element) return;
          const rect = element.getBoundingClientRect();
          vectors[dieId] = {
            x: targetX - (rect.left + rect.width / 2),
            y: targetY - (rect.top + rect.height / 2),
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          };
        });
        setOutVectors(vectors);
      }
      setPhaseState({ animationId: animation.id, phase: "settling" });
    }, animation.motionDuration + RESULT_REVEAL_DELAY);
    const movingCount = Math.max(
      animation.collectedDieIds.length,
      animation.excludedDieIds.length,
    );
    const resultDuration =
      movingCount > 0
        ? RESULT_MOVE_DURATION + Math.max(0, movingCount - 1) * 90
        : 0;
    const doneTimer = window.setTimeout(() => {
      setPhaseState({ animationId: animation.id, phase: "done" });
    }, animation.motionDuration + RESULT_REVEAL_DELAY + resultDuration + 120);
    return () => {
      window.clearInterval(ticker);
      window.clearTimeout(revealTimer);
      window.clearTimeout(settleTimer);
      window.clearTimeout(doneTimer);
    };
  }, [animation]);

  useEffect(() => {
    if (!canThrow) setAim(null);
  }, [canThrow]);

  const beginAim = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!canThrow || animationIsActive) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    setAim({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      originX: (event.clientX - rect.left) / rect.width,
      originY: (event.clientY - rect.top) / rect.height,
    });
  };
  const moveAim = (event: ReactPointerEvent<HTMLDivElement>) => {
    setAim((current) =>
      current?.pointerId === event.pointerId
        ? { ...current, currentX: event.clientX, currentY: event.clientY }
        : current,
    );
  };
  const releaseAim = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!aim || aim.pointerId !== event.pointerId) return;
    if (!canThrow || animationIsActive) {
      setAim(null);
      return;
    }
    const dx = event.clientX - aim.startX;
    const dy = event.clientY - aim.startY;
    const distance = Math.hypot(dx, dy);
    setAim(null);
    onThrow({
      angle: distance < 16 ? -Math.PI / 2 : Math.atan2(dy, dx),
      power: Math.min(1, Math.max(0.18, distance / 170)),
      originX: aim.originX,
      originY: aim.originY,
    });
  };

  const aimDx = aim ? aim.currentX - aim.startX : 0;
  const aimDy = aim ? aim.currentY - aim.startY : 0;
  const aimLength = Math.min(170, Math.hypot(aimDx, aimDy));

  return (
    <section
      className={`arena-section arena-section--actor-${Math.max(0, animationActorIndex)}`}
      aria-label="Arena"
    >
      <div className="arena">
        <div className="arena__rim">
          <div
            className={`arena__surface ${canThrow ? "arena__surface--aimable" : ""}`}
            onPointerDown={beginAim}
            onPointerMove={moveAim}
            onPointerUp={releaseAim}
            onPointerCancel={() => setAim(null)}
          >
            <div className="arena__label">
              <span>THE</span>
              <strong>ARENA</strong>
            </div>
            {canThrow && !aim && !animationIsActive && (
              <div className="throw-hint">
                <strong>SWIPE TO THROW</strong>
                <span>방향과 거리를 정해 주사위를 굴리세요</span>
              </div>
            )}
            {aim && (
              <div
                className="aim-line"
                style={{
                  left: aim.startX,
                  top: aim.startY,
                  width: aimLength,
                  transform: `rotate(${Math.atan2(aimDy, aimDx)}rad)`,
                }}
              >
                <span style={{ width: `${Math.max(18, aimLength)}px` }} />
              </div>
            )}
            <div className="arena__dice arena__dice--free">
              {displayedDice.length === 0 ? (
                <p className="arena__empty">Arena is empty</p>
              ) : (
                displayedDice.map((die, index) => {
                  const track = animation?.motionTracks.find(
                    (item) => item.dieId === die.id,
                  );
                  const isThrown =
                    phase === "motion" &&
                    Boolean(animation?.thrownDieIds.includes(die.id));
                  const isImpactRolling =
                    phase === "motion" &&
                    track?.firstImpactTime !== null &&
                    track?.firstImpactTime !== undefined &&
                    motionElapsed >= track.firstImpactTime;
                  const isCollected =
                    phase === "settling" &&
                    Boolean(animation?.collectedDieIds.includes(die.id));
                  const isExcluded =
                    phase === "settling" &&
                    Boolean(animation?.excludedDieIds.includes(die.id));
                  const movementIndex = animation
                    ? Math.max(
                        animation.collectedDieIds.indexOf(die.id),
                        animation.excludedDieIds.indexOf(die.id),
                        0,
                      )
                    : 0;
                  const collectVector = collectVectors[die.id];
                  const outVector = outVectors[die.id];
                  const style = {
                    left: `${die.x * 100}%`,
                    top: `${die.y * 100}%`,
                    transform: `translate(-50%, -50%) rotate(${die.rotation}deg)`,
                    animationDelay: `${movementIndex * 90}ms`,
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
                  } as CSSProperties;
                  return (
                    <Fragment key={die.id}>
                      <div
                        className={[
                          "arena__die",
                          isCollected ? "arena__die--leaving" : "",
                          isExcluded ? "arena__die--out" : "",
                        ].join(" ")}
                        ref={(element) => {
                          dieRefs.current[die.id] = element;
                        }}
                        style={style}
                      >
                        <Dice
                          value={die.value}
                          isRoulette={isThrown || isImpactRolling}
                          rouletteOffset={index}
                        />
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
          IN ARENA <strong>{displayedDice.length}</strong>
        </span>
        <span>
          LAST ROLL{" "}
          <strong>
            {lastRolls.length
              ? lastRolls
                  .map((value) => (value === 1 ? "X" : value))
                  .join(" · ")
              : "—"}
          </strong>
        </span>
      </div>
      <aside className="excluded-tray" aria-label="제외된 주사위" ref={trayRef}>
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
