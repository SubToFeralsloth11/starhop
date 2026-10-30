// Pure, deterministic game simulation. No DOM access: shared by the game loop, the solver bot and tests.
// Coordinates are world units: x in [0, WORLD_W], y grows downward (levels climb toward negative y).
// Every optional mechanic (boost, flips, perks, coins, gold, bounce walls, gravity planets, hunts)
// is off by default, so the solver and the stored levels see exactly the original physics.

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
export const COIN_R = 11;
export const GOLD_R = 22;
export const BOOST_MUL = 1.45; // flight speed multiplier while boosting
export const BOOST_FUEL = 0.6; // seconds of boost per flight (refilled on every landing)
export const CHAIN_WINDOW = 0.35; // launch this soon after landing to chain a hop
export const PERFECT = 0.7; // capture precision needed for a perfect landing
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

export function segDist2(px, py, x1, y1, x2, y2) {
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
 * opts: shields (hazard hits absorbed), magnetR (extra pickup radius), events (collect events),
 *       shipR (hazard hitbox), revives (respawns after a death), flightMax (seconds adrift),
 *       crumbleMul (crumble timer multiplier), fuel (boost seconds), dir (start orbit direction),
 *       perfect (precision needed for a perfect landing), zen (drifting off respawns instead of dying).
 */
export function createState(level, opts = {}) {
  const n = level.planets.length;
  const s = {
    t: level.t0 || 0,
    mode: 'orbit', // orbit | fly | dead | won
    pi: 0,
    ang: Math.PI / 2,
    dir: opts.dir || 1,
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
    shipR: opts.shipR || SHIP_R,
    revives: opts.revives || 0,
    flightMax: opts.flightMax || MAX_FLIGHT,
    crumbleMul: opts.crumbleMul || 1,
    fuelMax: opts.fuel ?? BOOST_FUEL,
    fuel: opts.fuel ?? BOOST_FUEL,
    boosting: false,
    perfectAt: opts.perfect || PERFECT,
    zen: !!opts.zen,
    perfects: 0,
    perfectRun: 0,
    chains: 0,
    capT: -Infinity,
    flips: 0,
    bounces: 0,
    boostT: 0,
    miss: Infinity,
    coinGot: new Array(level.coins ? level.coins.length : 0).fill(false),
    coins: 0,
    gold: false,
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
  c.coinGot = s.coinGot.slice();
  c.ev = null;
  return c;
}

function emit(s, type, data) {
  if (s.ev) s.ev.push({ type, x: s.x, y: s.y, ...data });
}

/** Put the ship back on planet `pi`'s ring at the point nearest to where it is now. */
function respawn(level, s, pi) {
  const p = level.planets[pi];
  planetPos(p, s.t, tmp);
  s.mode = 'orbit';
  s.pi = pi;
  s.ang = Math.atan2(s.y - tmp.y, s.x - tmp.x);
  s.x = tmp.x + p.orbit * Math.cos(s.ang);
  s.y = tmp.y + p.orbit * Math.sin(s.ang);
  s.vx = 0;
  s.vy = 0;
  s.flyT = 0;
  s.leftRing = true;
  s.inv = INVULN;
  s.boosting = false;
  s.fuel = s.fuelMax;
}

function die(level, s, cause) {
  const home = s.mode === 'fly' ? s.fromPi : s.pi;
  if (s.revives > 0 && cause !== 'crumble' && cause !== 'time' && home >= 0 && !s.gone[home]) {
    s.revives--;
    respawn(level, s, home);
    emit(s, 'revive', { cause, pi: home });
    return;
  }
  s.mode = 'dead';
  s.cause = cause;
  emit(s, 'dead', { cause, miss: s.miss });
}

function hit(level, s, cause) {
  if (s.inv > 0) return;
  if (s.shields > 0) {
    s.shields--;
    s.inv = INVULN;
    emit(s, 'shield', { cause });
    return;
  }
  die(level, s, cause);
}

/** Tangent unit vector of the current orbit (the launch direction). */
export function launchDir(s) {
  return { x: -Math.sin(s.ang) * s.dir, y: Math.cos(s.ang) * s.dir };
}

/**
 * Advance the simulation one fixed step. `launch` fires the ship if it is orbiting, `boost` speeds up
 * the current flight while fuel lasts, `flip` reverses the orbit direction.
 */
export function step(level, s, launch, boost = false, flip = false) {
  if (s.mode !== 'orbit' && s.mode !== 'fly') return;
  const dt = DT;
  const planets = level.planets;
  s.t += dt;
  if (s.inv > 0) s.inv -= dt;
  if (s.warpCd > 0) s.warpCd -= dt;

  if (s.mode === 'orbit') {
    if (flip && !launch) {
      s.dir = -s.dir;
      s.flips++;
      emit(s, 'flip', { pi: s.pi });
    }
    if (launch) {
      const d = launchDir(s);
      s.vx = d.x * FLY_SPEED;
      s.vy = d.y * FLY_SPEED;
      s.mode = 'fly';
      s.flyT = 0;
      s.fromPi = s.pi;
      s.leftRing = false;
      s.launches++;
      s.miss = Infinity;
      const chain = s.pi > 0 && s.t - s.capT <= CHAIN_WINDOW;
      if (chain) s.chains++;
      emit(s, 'launch', { pi: s.pi, chain });
    } else {
      const p = planets[s.pi];
      s.ang += s.dir * (ORBIT_SPEED / p.orbit) * dt;
      planetPos(p, s.t, tmp);
      s.x = tmp.x + p.orbit * Math.cos(s.ang);
      s.y = tmp.y + p.orbit * Math.sin(s.ang);
      if (s.t >= s.crumbleAt[s.pi]) {
        s.gone[s.pi] = true;
        emit(s, 'crumble', { pi: s.pi });
        die(level, s, 'crumble');
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
    let pulled = false;
    for (const h of holes) {
      const dx = h.x - s.x;
      const dy = h.y - s.y;
      const d2 = dx * dx + dy * dy;
      const k = h.m / (d2 + HOLE_SOFTENING) / Math.sqrt(d2 + 1);
      s.vx += dx * k * dt;
      s.vy += dy * k * dt;
      pulled = true;
    }
    if (level.giants) {
      // Giant planets pull like soft black holes (no core).
      for (let j = 0; j < planets.length; j++) {
        const p = planets[j];
        if (!p.g || s.gone[j]) continue;
        planetPos(p, s.t, tmp);
        const dx = tmp.x - s.x;
        const dy = tmp.y - s.y;
        const d2 = dx * dx + dy * dy;
        const k = p.g / (d2 + HOLE_SOFTENING) / Math.sqrt(d2 + 1);
        s.vx += dx * k * dt;
        s.vy += dy * k * dt;
        pulled = true;
      }
    }
    if (pulled) {
      const sp = Math.hypot(s.vx, s.vy) || 1;
      s.vx = (s.vx / sp) * FLY_SPEED;
      s.vy = (s.vy / sp) * FLY_SPEED;
    }
    s.boosting = boost && s.fuel > 0;
    if (s.boosting) {
      s.fuel = Math.max(0, s.fuel - dt);
      s.boostT += dt;
      s.x += s.vx * BOOST_MUL * dt;
      s.y += s.vy * BOOST_MUL * dt;
    } else {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    s.flyT += dt;

    if (level.bounce && (s.x < 0 || s.x > WORLD_W)) {
      s.x = s.x < 0 ? -s.x : 2 * WORLD_W - s.x;
      s.vx = -s.vx;
      s.bounces++;
      emit(s, 'bounce', {});
    }

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
      if (j > s.maxPi && d - p.orbit < s.miss) s.miss = d - p.orbit;
      if (d <= p.orbit) {
        // Precision: 1 when the flight line points straight at the planet centre, 0 when it grazes.
        const precision = 1 - Math.abs(dx * s.vy - dy * s.vx) / FLY_SPEED / p.orbit;
        s.mode = 'orbit';
        s.pi = j;
        s.ang = Math.atan2(dy, dx);
        s.dir = dx * s.vy - dy * s.vx >= 0 ? 1 : -1;
        s.x = tmp.x + p.orbit * Math.cos(s.ang);
        s.y = tmp.y + p.orbit * Math.sin(s.ang);
        s.capT = s.t;
        s.fuel = s.fuelMax;
        s.boosting = false;
        let perfect = false;
        if (j > s.maxPi) {
          s.maxPi = j;
          s.hops++;
          perfect = precision >= s.perfectAt;
          if (perfect) {
            s.perfects++;
            s.perfectRun++;
          } else s.perfectRun = 0;
        }
        if (p.crumble && s.crumbleAt[j] === Infinity) s.crumbleAt[j] = s.t + p.crumble * s.crumbleMul;
        emit(s, 'capture', { pi: j, hops: s.hops, precision, perfect, run: s.perfectRun });
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
        s.flyT > s.flightMax ||
        s.x < -SIDE_MARGIN ||
        s.x > WORLD_W + SIDE_MARGIN ||
        s.y > level.bottom ||
        s.y < level.top
      ) {
        if (s.zen) {
          const home = s.fromPi;
          respawn(level, s, home);
          emit(s, 'respawn', { pi: home });
          return;
        }
        die(level, s, 'lost');
        return;
      }
    }
  }

  if (level.timeLimit && s.t - (level.t0 || 0) >= level.timeLimit) {
    die(level, s, 'time');
    return;
  }

  // Hazards apply while orbiting and while flying.
  for (const h of level.holes) {
    const dx = h.x - s.x;
    const dy = h.y - s.y;
    if (dx * dx + dy * dy < h.core * h.core) {
      die(level, s, 'hole');
      return;
    }
  }
  if (s.inv <= 0) {
    for (const a of level.asteroids) {
      asteroidPos(a, s.t, tmp);
      const rr = a.r + s.shipR;
      if ((tmp.x - s.x) ** 2 + (tmp.y - s.y) ** 2 < rr * rr) {
        hit(level, s, 'asteroid');
        if (s.mode !== 'orbit' && s.mode !== 'fly') return;
        break;
      }
    }
  }
  if (s.inv <= 0) {
    for (const l of level.lasers) {
      if (!laserActive(l, s.t)) continue;
      const rr = s.shipR + 2;
      if (segDist2(s.x, s.y, l.x1, l.y1, l.x2, l.y2) < rr * rr) {
        hit(level, s, 'laser');
        if (s.mode !== 'orbit' && s.mode !== 'fly') return;
        break;
      }
    }
  }

  const shards = level.shards;
  const pr = SHIP_R + s.magnetR;
  if (shards.length) {
    const r = SHARD_R + pr;
    for (let i = 0; i < shards.length; i++) {
      if (s.shards & (1 << i)) continue;
      const sh = shards[i];
      if ((sh.x - s.x) ** 2 + (sh.y - s.y) ** 2 < r * r) {
        s.shards |= 1 << i;
        emit(s, 'shard', { i, sx: sh.x, sy: sh.y });
        if (level.hunt && s.shards === (1 << shards.length) - 1) {
          s.mode = 'won';
          emit(s, 'win', {});
          return;
        }
      }
    }
  }
  const coins = level.coins;
  if (coins && coins.length) {
    const r = COIN_R + pr;
    for (let i = 0; i < coins.length; i++) {
      if (s.coinGot[i]) continue;
      const c = coins[i];
      if ((c.x - s.x) ** 2 + (c.y - s.y) ** 2 < r * r) {
        s.coinGot[i] = true;
        s.coins++;
        emit(s, 'coin', { i, sx: c.x, sy: c.y });
      }
    }
  }
  const gold = level.gold;
  if (gold && !s.gold) {
    const r = GOLD_R + pr;
    if ((gold.x - s.x) ** 2 + (gold.y - s.y) ** 2 < r * r) {
      s.gold = true;
      emit(s, 'gold', { sx: gold.x, sy: gold.y });
    }
  }
}

/**
 * The closest hazard the flying ship is skimming past without touching it, or null.
 * Used for the near-miss slow-motion effect.
 */
export function nearMiss(level, s, margin = 16) {
  if (s.mode !== 'fly') return null;
  for (const a of level.asteroids) {
    asteroidPos(a, s.t, tmp);
    const d = Math.hypot(tmp.x - s.x, tmp.y - s.y) - a.r - s.shipR;
    if (d > 0 && d < margin) return 'asteroid';
  }
  for (const l of level.lasers) {
    if (!laserActive(l, s.t)) continue;
    const d = Math.sqrt(segDist2(s.x, s.y, l.x1, l.y1, l.x2, l.y2)) - s.shipR - 2;
    if (d > 0 && d < margin) return 'laser';
  }
  for (const h of level.holes) {
    const d = Math.hypot(h.x - s.x, h.y - s.y) - h.core;
    if (d > 0 && d < margin * 2) return 'hole';
  }
  return null;
}

/** 0..1 closeness of each hazard type to the ship (for hazard sound loops). */
export function hazardProximity(level, s, range = 380) {
  const out = { laser: 0, hole: 0, warp: 0, ast: 0 };
  const near = (d) => Math.max(0, 1 - d / range);
  for (const l of level.lasers) {
    if (Math.abs((l.y1 + l.y2) / 2 - s.y) > range) continue;
    const v = near(Math.sqrt(segDist2(s.x, s.y, l.x1, l.y1, l.x2, l.y2))) * (laserActive(l, s.t) ? 1 : 0.35);
    if (v > out.laser) out.laser = v;
  }
  for (const h of level.holes) out.hole = Math.max(out.hole, near(Math.hypot(h.x - s.x, h.y - s.y)));
  for (const w of level.warps) out.warp = Math.max(out.warp, near(Math.hypot(w.ax - s.x, w.ay - s.y)), near(Math.hypot(w.bx - s.x, w.by - s.y)));
  for (const a of level.asteroids) {
    if (Math.abs(a.y - s.y) > range) continue;
    asteroidPos(a, s.t, tmp);
    out.ast = Math.max(out.ast, near(Math.hypot(tmp.x - s.x, tmp.y - s.y)));
  }
  return out;
}
