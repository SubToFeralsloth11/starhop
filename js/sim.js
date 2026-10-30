// Pure, deterministic game simulation. No DOM access: shared by the game loop, the solver bot and tests.
// Coordinates are world units: x in [0, WORLD_W], y grows downward (levels climb toward negative y).

export const WORLD_W = 720;
export const SHIP_R = 9;
export const FLY_SPEED = 560; // units/s while flying
export const ORBIT_SPEED = 290; // linear units/s while orbiting
export const DT = 1 / 60; // fixed simulation step
export const MAX_FLIGHT = 2.5; // seconds adrift before the ship is lost
export const SIDE_MARGIN = 30; // how far past the side edges the ship may go
export const INVULN = 0.9; // seconds of invulnerability after a shield absorbs a hit
export const WARP_COOLDOWN = 0.35;
export const SHARD_R = 16;
const HOLE_SOFTENING = 900;
const WRAP_PAD = 80;

const tmp = { x: 0, y: 0 };

export function planetPos(p, t, out = { x: 0, y: 0 }) {
  out.x = p.mx ? p.x + p.mx * Math.sin(p.mf * t + p.mp) : p.x;
  out.y = p.y;
  return out;
}

export function asteroidPos(a, t, out = { x: 0, y: 0 }) {
  if (a.kind === 'spin') {
    out.x = a.x + a.R * Math.cos(a.w * t + a.ph);
    out.y = a.y + a.R * Math.sin(a.w * t + a.ph);
  } else {
    const span = WORLD_W + WRAP_PAD * 2;
    const raw = (a.x + WRAP_PAD + a.vx * t) % span;
    out.x = (raw < 0 ? raw + span : raw) - WRAP_PAD;
    out.y = a.y;
  }
  return out;
}

/** Phase in [0, period) of a laser gate; it is lethal while phase < on. */
export function laserPhase(l, t) {
  const v = (t + l.ph) % l.period;
  return v < 0 ? v + l.period : v;
}

export function laserActive(l, t) {
  return laserPhase(l, t) < l.on;
}

function segDist2(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let u = len2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const ex = x1 + u * dx - px;
  const ey = y1 + u * dy - py;
  return ex * ex + ey * ey;
}

/**
 * Create a fresh run state for a level.
 * opts.shields: hazard hits absorbed; opts.magnetR: extra shard pickup radius; opts.events: collect events.
 */
export function createState(level, opts = {}) {
  const n = level.planets.length;
  const s = {
    t: level.t0 || 0,
    mode: 'orbit', // orbit | fly | dead | won
    pi: 0,
    ang: Math.PI / 2,
    dir: 1,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    flyT: 0,
    fromPi: -1,
    leftRing: true,
    shields: opts.shields || 0,
    inv: 0,
    shards: 0,
    hops: 0,
    maxPi: 0,
    launches: 0,
    crumbleAt: new Array(n).fill(Infinity),
    gone: new Array(n).fill(false),
    warpCd: 0,
    magnetR: opts.magnetR || 0,
    cause: null,
    ev: opts.events ? [] : null,
  };
  planetPos(level.planets[0], s.t, tmp);
  s.x = tmp.x + level.planets[0].orbit * Math.cos(s.ang);
  s.y = tmp.y + level.planets[0].orbit * Math.sin(s.ang);
  return s;
}

/** Extend per-planet arrays after planets were appended to the level (endless mode). */
export function syncState(level, s) {
  while (s.crumbleAt.length < level.planets.length) {
    s.crumbleAt.push(Infinity);
    s.gone.push(false);
  }
}

export function cloneState(s) {
  const c = { ...s };
  c.crumbleAt = s.crumbleAt.slice();
  c.gone = s.gone.slice();
  c.ev = null;
  return c;
}

function emit(s, type, data) {
  if (s.ev) s.ev.push({ type, x: s.x, y: s.y, ...data });
}

function die(s, cause) {
  s.mode = 'dead';
  s.cause = cause;
  emit(s, 'dead', { cause });
}

function hit(s, cause) {
  if (s.inv > 0) return;
  if (s.shields > 0) {
    s.shields--;
    s.inv = INVULN;
    emit(s, 'shield', { cause });
    return;
  }
  die(s, cause);
}

/** Tangent unit vector of the current orbit (the launch direction). */
export function launchDir(s) {
  return { x: -Math.sin(s.ang) * s.dir, y: Math.cos(s.ang) * s.dir };
}

/** Advance the simulation one fixed step. `launch` fires the ship if it is orbiting. */
export function step(level, s, launch) {
  if (s.mode !== 'orbit' && s.mode !== 'fly') return;
  const dt = DT;
  const planets = level.planets;
  s.t += dt;
  if (s.inv > 0) s.inv -= dt;
  if (s.warpCd > 0) s.warpCd -= dt;

  if (s.mode === 'orbit') {
    if (launch) {
      const d = launchDir(s);
      s.vx = d.x * FLY_SPEED;
      s.vy = d.y * FLY_SPEED;
      s.mode = 'fly';
      s.flyT = 0;
      s.fromPi = s.pi;
      s.leftRing = false;
      s.launches++;
      emit(s, 'launch', { pi: s.pi });
    } else {
      const p = planets[s.pi];
      s.ang += s.dir * (ORBIT_SPEED / p.orbit) * dt;
      planetPos(p, s.t, tmp);
      s.x = tmp.x + p.orbit * Math.cos(s.ang);
      s.y = tmp.y + p.orbit * Math.sin(s.ang);
      if (s.t >= s.crumbleAt[s.pi]) {
        s.gone[s.pi] = true;
        emit(s, 'crumble', { pi: s.pi });
        die(s, 'crumble');
        return;
      }
    }
  }

  // Planets crumble on schedule even when the ship is elsewhere.
  for (let i = 0; i < planets.length; i++) {
    if (!s.gone[i] && s.t >= s.crumbleAt[i]) {
      s.gone[i] = true;
      emit(s, 'crumble', { pi: i });
    }
  }

  if (s.mode === 'fly') {
    const holes = level.holes;
    if (holes.length) {
      for (const h of holes) {
        const dx = h.x - s.x;
        const dy = h.y - s.y;
        const d2 = dx * dx + dy * dy;
        const k = h.m / (d2 + HOLE_SOFTENING) / Math.sqrt(d2 + 1);
        s.vx += dx * k * dt;
        s.vy += dy * k * dt;
      }
      const sp = Math.hypot(s.vx, s.vy) || 1;
      s.vx = (s.vx / sp) * FLY_SPEED;
      s.vy = (s.vy / sp) * FLY_SPEED;
    }
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.flyT += dt;

    if (s.warpCd <= 0) {
      for (const w of level.warps) {
        const da = (s.x - w.ax) ** 2 + (s.y - w.ay) ** 2;
        const db = (s.x - w.bx) ** 2 + (s.y - w.by) ** 2;
        if (da < w.r * w.r) {
          emit(s, 'warp', { tx: w.bx, ty: w.by });
          s.x = w.bx + (s.x - w.ax);
          s.y = w.by + (s.y - w.ay);
          s.warpCd = WARP_COOLDOWN;
          break;
        }
        if (db < w.r * w.r) {
          emit(s, 'warp', { tx: w.ax, ty: w.ay });
          s.x = w.ax + (s.x - w.bx);
          s.y = w.ay + (s.y - w.by);
          s.warpCd = WARP_COOLDOWN;
          break;
        }
      }
    }

    for (let j = 0; j < planets.length; j++) {
      if (s.gone[j]) continue;
      const p = planets[j];
      planetPos(p, s.t, tmp);
      const dx = s.x - tmp.x;
      const dy = s.y - tmp.y;
      const d = Math.hypot(dx, dy);
      if (j === s.fromPi && !s.leftRing) {
        if (d > p.orbit + SHIP_R * 2) s.leftRing = true;
        continue;
      }
      if (d <= p.orbit) {
        s.mode = 'orbit';
        s.pi = j;
        s.ang = Math.atan2(dy, dx);
        s.dir = dx * s.vy - dy * s.vx >= 0 ? 1 : -1;
        s.x = tmp.x + p.orbit * Math.cos(s.ang);
        s.y = tmp.y + p.orbit * Math.sin(s.ang);
        if (j > s.maxPi) {
          s.maxPi = j;
          s.hops++;
        }
        if (p.crumble && s.crumbleAt[j] === Infinity) s.crumbleAt[j] = s.t + p.crumble;
        emit(s, 'capture', { pi: j, hops: s.hops });
        if (p.goal) {
          s.mode = 'won';
          emit(s, 'win', {});
          return;
        }
        break;
      }
    }

    if (s.mode === 'fly') {
      if (
        s.flyT > MAX_FLIGHT ||
        s.x < -SIDE_MARGIN ||
        s.x > WORLD_W + SIDE_MARGIN ||
        s.y > level.bottom ||
        s.y < level.top
      ) {
        die(s, 'lost');
        return;
      }
    }
  }

  // Hazards apply while orbiting and while flying.
  for (const h of level.holes) {
    const dx = h.x - s.x;
    const dy = h.y - s.y;
    if (dx * dx + dy * dy < h.core * h.core) {
      die(s, 'hole');
      return;
    }
  }
  if (s.inv <= 0) {
    for (const a of level.asteroids) {
      asteroidPos(a, s.t, tmp);
      const rr = a.r + SHIP_R;
      if ((tmp.x - s.x) ** 2 + (tmp.y - s.y) ** 2 < rr * rr) {
        hit(s, 'asteroid');
        if (s.mode === 'dead') return;
        break;
      }
    }
  }
  if (s.inv <= 0) {
    for (const l of level.lasers) {
      if (!laserActive(l, s.t)) continue;
      const rr = SHIP_R + 2;
      if (segDist2(s.x, s.y, l.x1, l.y1, l.x2, l.y2) < rr * rr) {
        hit(s, 'laser');
        if (s.mode === 'dead') return;
        break;
      }
    }
  }

  const shards = level.shards;
  if (shards.length) {
    const pr = SHARD_R + SHIP_R + s.magnetR;
    for (let i = 0; i < shards.length; i++) {
      if (s.shards & (1 << i)) continue;
      const sh = shards[i];
      if ((sh.x - s.x) ** 2 + (sh.y - s.y) ** 2 < pr * pr) {
        s.shards |= 1 << i;
        emit(s, 'shard', { i, sx: sh.x, sy: sh.y });
      }
    }
  }
}
