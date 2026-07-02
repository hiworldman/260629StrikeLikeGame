import type {
  ArenaDie,
  DiceMotionTrack,
  ThrowVector,
} from "../types";

interface MovingDie extends ArenaDie {
  vx: number;
  vy: number;
  spin: number;
}

interface PhysicsResult {
  dice: ArenaDie[];
  collidedDieIds: string[];
  motionTracks: DiceMotionTrack[];
  duration: number;
}

const STEP = 1 / 60;
const MAX_SECONDS = 4.2;
const ARENA_RADIUS = 0.435;
const DIE_RADIUS = 0.043;
const STOP_SPEED = 0.018;
const FRICTION = 0.982;
const RESTITUTION = 0.78;

function generateImpactValue(random: () => number) {
  const result = random();
  if (result < 0.15) return 1;
  return Math.floor(((result - 0.15) / 0.85) * 5) + 2;
}

const speedOf = (die: MovingDie) => Math.hypot(die.vx, die.vy);

function safePosition(index: number, count: number) {
  const angle = -Math.PI / 2 + (index / Math.max(1, count)) * Math.PI * 2;
  const radius = 0.12 + (index % 3) * 0.09;
  return {
    x: 0.5 + Math.cos(angle) * radius,
    y: 0.5 + Math.sin(angle) * radius,
  };
}

function clampPower(power: number) {
  return Math.min(1, Math.max(0.18, power));
}

function changeFacesForImpact(
  a: MovingDie,
  b: MovingDie,
  impactSpeed: number,
  random: () => number,
): MovingDie[] {
  if (impactSpeed < 0.2) return [];
  if (impactSpeed < 0.48) {
    if (random() < 0.45) {
      const target = random() < 0.5 ? a : b;
      target.value = generateImpactValue(random);
      return [target];
    }
    return [];
  }
  a.value = generateImpactValue(random);
  b.value = generateImpactValue(random);
  return [a, b];
}

export function simulateThrow(
  arenaDice: ArenaDie[],
  thrownDice: ArenaDie[],
  vector: ThrowVector,
  random: () => number,
): PhysicsResult {
  const moving: MovingDie[] = [
    ...arenaDice.map((die, index) => {
      const fallback = safePosition(index, arenaDice.length);
      return {
        ...die,
        x: Number.isFinite(die.x) ? die.x : fallback.x,
        y: Number.isFinite(die.y) ? die.y : fallback.y,
        rotation: Number.isFinite(die.rotation) ? die.rotation : 0,
        vx: 0,
        vy: 0,
        spin: 0,
      };
    }),
  ];
  const power = clampPower(vector.power);
  const launchSpeed = 0.48 + power * 0.72;
  const spread = thrownDice.length > 1 ? 0.42 : 0;

  thrownDice.forEach((die, index) => {
    const ratio =
      thrownDice.length <= 1 ? 0 : index / (thrownDice.length - 1) - 0.5;
    const angle = vector.angle + ratio * spread;
    const columns = Math.min(5, thrownDice.length);
    const row = Math.floor(index / columns);
    const column = index % columns;
    const rowCount = Math.min(columns, thrownDice.length - row * columns);
    moving.push({
      ...die,
      x: 0.5 + (column - (rowCount - 1) / 2) * 0.082,
      y: 0.86 - row * 0.086,
      rotation: random() * 360,
      vx: Math.cos(angle) * launchSpeed * (0.92 + random() * 0.16),
      vy: Math.sin(angle) * launchSpeed * (0.92 + random() * 0.16),
      spin: (random() < 0.5 ? -1 : 1) * (260 + power * 520),
    });
  });

  const trackMap = new Map<string, DiceMotionTrack>(
    moving.map((die) => [
      die.id,
      {
        dieId: die.id,
        points: [{ x: die.x, y: die.y, rotation: die.rotation, time: 0 }],
        firstImpactTime: null,
      },
    ]),
  );
  const collidedIds = new Set<string>();
  const pairCooldown = new Map<string, number>();
  let elapsed = 0;
  let frame = 0;

  while (elapsed < MAX_SECONDS) {
    elapsed += STEP;
    frame += 1;

    moving.forEach((die) => {
      die.x += die.vx * STEP;
      die.y += die.vy * STEP;
      die.rotation += die.spin * STEP;

      const dx = die.x - 0.5;
      const dy = die.y - 0.5;
      const distance = Math.hypot(dx, dy);
      const limit = ARENA_RADIUS - DIE_RADIUS;
      if (distance > limit) {
        const nx = dx / distance;
        const ny = dy / distance;
        die.x = 0.5 + nx * limit;
        die.y = 0.5 + ny * limit;
        const normalSpeed = die.vx * nx + die.vy * ny;
        if (normalSpeed > 0) {
          die.vx -= (1 + RESTITUTION) * normalSpeed * nx;
          die.vy -= (1 + RESTITUTION) * normalSpeed * ny;
          die.spin *= -0.72;
        }
      }
    });

    for (let first = 0; first < moving.length; first += 1) {
      for (let second = first + 1; second < moving.length; second += 1) {
        const a = moving[first];
        const b = moving[second];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        const minimum = DIE_RADIUS * 2;
        if (distance >= minimum) continue;

        const nx = distance > 0.0001 ? dx / distance : 1;
        const ny = distance > 0.0001 ? dy / distance : 0;
        const overlap = minimum - Math.max(distance, 0.0001);
        a.x -= nx * overlap * 0.5;
        a.y -= ny * overlap * 0.5;
        b.x += nx * overlap * 0.5;
        b.y += ny * overlap * 0.5;

        const relativeNormal =
          (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (relativeNormal <= 0) continue;
        const impulse = ((1 + RESTITUTION) * relativeNormal) / 2;
        a.vx -= impulse * nx;
        a.vy -= impulse * ny;
        b.vx += impulse * nx;
        b.vy += impulse * ny;
        a.spin += (random() - 0.5) * relativeNormal * 420;
        b.spin += (random() - 0.5) * relativeNormal * 420;

        const pairKey = [a.id, b.id].sort().join(":");
        const lastImpact = pairCooldown.get(pairKey) ?? -1;
        if (elapsed - lastImpact >= 0.22) {
          pairCooldown.set(pairKey, elapsed);
          collidedIds.add(a.id);
          collidedIds.add(b.id);
          const changedDice = changeFacesForImpact(
            a,
            b,
            relativeNormal,
            random,
          );
          const impactTime = Math.round(elapsed * 1000);
          changedDice.forEach((changedDie) => {
            const track = trackMap.get(changedDie.id);
            if (track?.firstImpactTime === null) {
              track.firstImpactTime = impactTime;
            }
          });
        }
      }
    }

    moving.forEach((die) => {
      die.vx *= FRICTION;
      die.vy *= FRICTION;
      die.spin *= 0.975;
      if (speedOf(die) < STOP_SPEED) {
        die.vx = 0;
        die.vy = 0;
      }
    });

    if (frame % 4 === 0) {
      const time = Math.round(elapsed * 1000);
      moving.forEach((die) => {
        trackMap.get(die.id)?.points.push({
          x: die.x,
          y: die.y,
          rotation: die.rotation,
          time,
        });
      });
    }

    if (elapsed > 0.5 && moving.every((die) => speedOf(die) === 0)) break;
  }

  const duration = Math.max(650, Math.round(elapsed * 1000));
  moving.forEach((die) => {
    const track = trackMap.get(die.id);
    if (!track) return;
    const last = track.points[track.points.length - 1];
    if (last.time !== duration) {
      track.points.push({
        x: die.x,
        y: die.y,
        rotation: die.rotation,
        time: duration,
      });
    }
  });

  return {
    dice: moving.map(({ vx: _vx, vy: _vy, spin: _spin, ...die }) => die),
    collidedDieIds: [...collidedIds],
    motionTracks: [...trackMap.values()],
    duration,
  };
}
