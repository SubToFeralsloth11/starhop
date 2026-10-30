// Procedural level generator. Every level is validated by the solver bot before it is returned,
// so all 200 campaign levels, the daily challenge and every endless chunk are provably beatable.
// Campaign levels are generated ahead of time by tools/build-levels.mjs into data/levels.json;
// the daily challenge and endless chunks are generated at runtime in js/genworker.js.
import { hashSeed, makeRng } from './rng.js';
import { WORLD_W, cloneState, createState, syncState } from './sim.js';
import { findWindows, solve, traceRoute } from './solver.js';
import { LEVELS_PER_WORLD, WORLDS } from './worlds.js';

const MAX_ATTEMPTS = 40;
const HOP_TRIES = 14;
const ARRIVAL_OFFSETS = [0.8, 1.7];
export const ENDLESS_HOPS = 6;
const TAU = Math.PI * 2;

const NO_FEATURES = { move: 0, ast: 0, moon: 0, laser: 0, crumble: 0, hole: 0, warp: 0 };

/** Hazard densities for a campaign level. `local` is 0..1 progress within the world. */
export function featureMix(world, local) {
  const late = local >= 0.4 ? (local - 0.4) / 0.6 : 0;
  const f = { ...NO_FEATURES };
  switch (world) {
    case 2:
      f.move = 0.45 + 0.55 * local;
      break;
    case 3:
      f.ast = 0.5 + 0.9 * local;
      f.moon = 0.15 + 0.35 * local;
      f.move = 0.3 * late;
      break;
    case 4:
      f.laser = 0.45 + 0.5 * local;
      f.ast = 0.35 * late;
      break;
    case 5:
      f.crumble = 0.5 + 0.5 * local;
      f.move = 0.35 * late;
      f.laser = 0.25 * late;
      break;
    case 6:
      f.hole = 0.45 + 0.4 * local;
      f.ast = 0.35 * late;
      f.move = 0.2 * late;
      break;
    case 7:
      f.warp = 1 + Math.round(2 * local);
      f.hole = 0.2 * late;
      f.move = 0.35 * late;
      f.laser = 0.2 * late;
      break;
    case 8: {
      const k = 0.6 + 0.4 * local;
      f.move = 0.5 * k;
      f.ast = 0.7 * k;
      f.moon = 0.2 * k;
      f.laser = 0.35 * k;
      f.crumble = 0.35 * k;
      f.hole = 0.3 * k;
      f.warp = local > 0.5 ? 1 : 0;
      break;
    }
    default:
      break;
  }
  return f;
}

export function campaignDifficulty(world, index) {
  const local = (index - 1) / (LEVELS_PER_WORLD - 1);
  return { local, diff: Math.min(1, (world - 1 + local) / 8), hops: 3 + Math.round(local * 5) + Math.floor((world - 1) * 0.7) };
}

function emptyLevel() {
  return { planets: [], asteroids: [], lasers: [], holes: [], warps: [], shards: [], t0: 0, top: 0, bottom: 0 };
}

function farFromPlanets(planets, x, y, clearance) {
  for (const p of planets) {
    const reach = p.orbit + (p.mx || 0) + clearance;
    if (Math.abs(p.y - y) < reach && Math.abs(p.x - x) < reach + (p.mx || 0) && Math.hypot(p.x - x, p.y - y) < reach) return false;
  }
  return true;
}

function makePlanet(rng, prev, diff, f, goal) {
  const r = goal ? 30 : rng.range(24, 44 - diff * 6);
  const orbit = goal ? 78 : r + rng.range(34, 50) - diff * 8;
  const margin = orbit + 18;
  let x = prev.x;
  for (let tries = 0; tries < 12; tries++) {
    x = prev.x + rng.sign() * rng.range(60, 170 + 150 * diff);
    if (x >= margin && x <= WORLD_W - margin) break;
  }
  x = Math.min(WORLD_W - margin, Math.max(margin, x));
  const y = prev.y - (rng.range(250, 320) + diff * 70);
  const p = { x, y, r, orbit, mx: 0, mf: 0, mp: 0, crumble: 0, goal, hue: rng.int(0, 3), ring: rng.chance(0.35) };
  if (!goal && rng.chance(f.move)) {
    const room = Math.min(x - margin, WORLD_W - margin - x);
    const amp = Math.min(room, rng.range(50, 80 + 120 * diff));
    if (amp > 25) {
      p.mx = amp;
      p.mf = rng.range(0.5, 0.9 + 0.6 * diff);
      p.mp = rng.range(0, TAU);
    }
  }
  if (!goal && rng.chance(f.crumble)) p.crumble = Math.max(1.8, rng.range(2.3, 3.6) - diff * 0.5);
  return p;
}

/** Vertical strip between two consecutive orbit rings where hazards may live, or null if too thin. */
function bandBetween(lower, upper) {
  const top = upper.y + upper.orbit;
  const bottom = lower.y - lower.orbit;
  return bottom - top > 60 ? { top, bottom } : null;
}

function addBandHazards(rng, level, band, diff, f) {
  const n = Math.floor(f.ast) + (rng.chance(f.ast % 1) ? 1 : 0);
  for (let k = 0; k < n; k++) {
    const r = rng.range(13, 22);
    const lo = band.top + r + 14;
    const hi = band.bottom - r - 14;
    if (hi <= lo) continue;
    level.asteroids.push({
      kind: 'wrap',
      x: rng.range(0, WORLD_W),
      y: rng.range(lo, hi),
      r,
      vx: rng.sign() * rng.range(90, 140 + 160 * diff),
      spin: rng.range(-2, 2),
      seed: rng.int(0, 9999),
    });
  }
  if (rng.chance(f.laser)) {
    const mid = (band.top + band.bottom) / 2;
    const half = (band.bottom - band.top) / 2 - 16;
    const len = rng.range(0.5, 1.0) * WORLD_W;
    const x1 = rng.range(0, WORLD_W - len);
    const tilt = rng.range(-1, 1) * Math.min(30, Math.max(0, half));
    const period = rng.range(1.5, 2.5);
    level.lasers.push({
      x1,
      y1: mid - tilt,
      x2: x1 + len,
      y2: mid + tilt,
      period,
      on: period * rng.range(0.35, 0.35 + 0.25 * diff),
      ph: rng.range(0, period),
    });
  }
  if (rng.chance(f.hole)) {
    for (let tries = 0; tries < 6; tries++) {
      const x = rng.range(90, WORLD_W - 90);
      const y = rng.range(band.top + 30, band.bottom - 30);
      if (!farFromPlanets(level.planets, x, y, 70)) continue;
      level.holes.push({ x, y, m: rng.range(3e6, 5e6 + 5e6 * diff), core: 20 });
      break;
    }
  }
}

/** A small asteroid circling just outside a static planet's ring: it crosses every launch path. */
function addMoon(rng, level, p, diff, f) {
  if (p.goal || p.mx || !rng.chance(f.moon)) return;
  level.asteroids.push({
    kind: 'spin',
    x: p.x,
    y: p.y,
    R: p.orbit + rng.range(24, 34),
    w: rng.sign() * rng.range(0.8, 1.4 + 0.8 * diff),
    ph: rng.range(0, TAU),
    r: rng.range(10, 15),
    spin: rng.range(-2, 2),
    seed: rng.int(0, 9999),
  });
}

function addWarps(rng, level, f) {
  const bands = [];
  for (let i = 0; i < level.planets.length - 1; i++) {
    const b = bandBetween(level.planets[i], level.planets[i + 1]);
    if (b && b.bottom - b.top >= 80) bands.push(b);
  }
  for (let k = 0; k < f.warp && bands.length >= 2; k++) {
    for (let tries = 0; tries < 10; tries++) {
      const ia = rng.int(0, bands.length - 2);
      const ib = rng.int(ia + 1, bands.length - 1);
      const A = bands[ia];
      const B = bands[ib];
      const ax = rng.range(70, WORLD_W - 70);
      const ay = rng.range(A.top + 34, A.bottom - 34);
      const bx = rng.range(70, WORLD_W - 70);
      const by = rng.range(B.top + 34, B.bottom - 34);
      if (!farFromPlanets(level.planets, ax, ay, 40) || !farFromPlanets(level.planets, bx, by, 40)) continue;
      if (level.holes.some((h) => Math.hypot(h.x - ax, h.y - ay) < 120 || Math.hypot(h.x - bx, h.y - by) < 120)) continue;
      level.warps.push({ ax, ay, bx, by, r: 30 });
      break;
    }
  }
}

const q = (v) => Math.round(v * 100) / 100;

/** Round every hazard/planet number to 0.01 so the validated level is exactly what gets stored. */
function quantize(level) {
  for (const key of ['planets', 'asteroids', 'lasers', 'holes', 'warps']) {
    for (const obj of level[key]) {
      for (const prop in obj) if (typeof obj[prop] === 'number') obj[prop] = q(obj[prop]);
    }
  }
  level.top = q(level.top);
}

/** A copy of state `s` that arrived `offset` seconds later (timers shifted to match). */
function delayed(level, s, offset) {
  const c = cloneState(s);
  syncState(level, c);
  c.t += offset;
  for (let i = 0; i < c.crumbleAt.length; i++) if (c.crumbleAt[i] !== Infinity) c.crumbleAt[i] += offset;
  return c;
}

/**
 * Grow `level` by `hops` planets above its current top planet, adding hazards as it goes.
 * Each new hop is checked with the solver from the bot's arrival state and from the same arrival
 * shifted by ARRIVAL_OFFSETS (a human arrives at different times than the bot). A hop is re-rolled
 * (up to HOP_TRIES times) unless every shifted arrival has a human-sized launch window.
 */
function grow(rng, level, hops, diff, f, lastIsGoal) {
  quantize(level);
  let s = createState(level);
  for (let i = 1; i <= hops; i++) {
    const goal = lastIsGoal && i === hops;
    const prev = level.planets[level.planets.length - 1];
    let ok = false;
    for (let tries = 0; tries < HOP_TRIES && !ok; tries++) {
      const marks = [level.asteroids.length, level.lasers.length, level.holes.length];
      const p = makePlanet(rng, prev, diff, f, goal);
      level.planets.push(p);
      const band = bandBetween(prev, p);
      if (band) addBandHazards(rng, level, band, diff, f);
      addMoon(rng, level, p, diff, f);
      level.top = p.y - 700;
      quantize(level);
      const found = findWindows(level, delayed(level, s, 0), 1);
      if (found.length && ARRIVAL_OFFSETS.every((o) => findWindows(level, delayed(level, s, o), 1).length)) {
        s = found[0].state;
        ok = true;
      } else {
        level.planets.pop();
        level.asteroids.length = marks[0];
        level.lasers.length = marks[1];
        level.holes.length = marks[2];
      }
    }
    if (!ok) return false;
  }
  addWarps(rng, level, f);
  quantize(level);
  return true;
}

function startPlanet() {
  return { x: WORLD_W / 2, y: 0, r: 40, orbit: 84, mx: 0, mf: 0, mp: 0, crumble: 0, goal: false, hue: 0, ring: true };
}

function finishLevel(level, solution) {
  const flights = traceRoute(level, solution.route);
  const m = flights.length;
  const picks = [Math.floor(m / 6), Math.floor(m / 2), Math.floor((5 * m) / 6)];
  const fractions = [0.5, 0.5, 0.5];
  if (picks[1] === picks[0]) fractions[0] = 0.3;
  if (picks[2] === picks[1]) fractions[2] = 0.75;
  level.shards = picks.map((fi, i) => {
    const pts = flights[Math.min(fi, m - 1)].pts;
    const pt = pts[Math.floor((pts.length - 1) * fractions[i])];
    return { x: q(pt.x), y: q(pt.y) };
  });
  level.botTime = q(solution.time);
  level.par = Math.ceil((solution.time * 1.45 + 2) * 2) / 2;
  return level;
}

function buildValidated(seedParts, hops, diff, mix) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rng = makeRng(hashSeed(...seedParts, attempt));
    const f = typeof mix === 'function' ? mix(rng) : mix;
    const level = { ...emptyLevel(), planets: [startPlanet()], bottom: 450 };
    addMoon(rng, level, level.planets[0], diff, f);
    if (!grow(rng, level, hops, diff, f, true)) continue;
    const solution = solve(level);
    if (solution.ok) {
      level.attempts = attempt + 1;
      return finishLevel(level, solution);
    }
  }
  return null;
}

/** Campaign level (world 1..8, index 1..25). Throws if no valid layout exists (caught by tests). */
export function generateLevel(world, index) {
  const { local, diff, hops } = campaignDifficulty(world, index);
  const level = buildValidated(['level', world, index], hops, diff, featureMix(world, local));
  if (!level) throw new Error(`level ${world}-${index}: no solvable layout in ${MAX_ATTEMPTS} attempts`);
  return Object.assign(level, { id: `${world}-${index}`, kind: 'level', world, index });
}

const DAILY_MECHS = ['move', 'ast', 'laser', 'crumble', 'hole', 'warp', 'moon'];

/** Date-seeded daily challenge (dateKey: YYYY-MM-DD). */
export function generateDaily(dateKey) {
  const pickRng = makeRng(hashSeed('daily-mechs', dateKey));
  const mechs = [];
  while (mechs.length < 3) {
    const m = pickRng.pick(DAILY_MECHS);
    if (!mechs.includes(m)) mechs.push(m);
  }
  const f = { ...NO_FEATURES };
  for (const m of mechs) f[m] = m === 'warp' ? 1 : m === 'ast' ? 1.0 : 0.55;
  // Fall back to gentler versions of the same mix rather than failing the day's challenge.
  let level = null;
  for (let soften = 0; !level; soften++) {
    const k = Math.max(0, 1 - soften * 0.25);
    const mix = Object.fromEntries(Object.entries(f).map(([key, v]) => [key, key === 'warp' ? (k > 0 ? v : 0) : v * k]));
    level = buildValidated(['daily', dateKey, soften], 9, 0.55 * k, mix);
  }
  return Object.assign(level, { id: `daily-${dateKey}`, kind: 'daily', world: 0, index: 0, mechs, dateKey });
}

function endlessMix(chunk) {
  return (rng) => {
    const f = { ...NO_FEATURES };
    if (chunk === 0) return f;
    const pool = ['move', 'ast', 'laser', 'hole', 'warp', 'moon'];
    const count = Math.min(3, 1 + Math.floor(chunk / 3));
    const strength = Math.min(1, 0.35 + chunk * 0.08);
    for (let i = 0; i < count; i++) {
      const m = rng.pick(pool);
      f[m] = m === 'warp' ? 1 : m === 'ast' ? 0.6 + strength : 0.3 + 0.5 * strength;
    }
    return f;
  };
}

/** Start an endless run: a level with only the start planet. Grow it with endlessChunk. */
export function createEndless(seed) {
  return { ...emptyLevel(), planets: [startPlanet()], bottom: 450, top: -700, id: 'endless', kind: 'endless', world: 0, index: 0, seed, chunks: 0 };
}

/**
 * Generate chunk number `chunk` of an endless run: ENDLESS_HOPS planets (plus hazards) above `start`.
 * Returns plain data so it can be posted from a worker and applied with applyEndlessChunk.
 */
export function endlessChunk(seed, chunk, start) {
  const diff = Math.min(1, 0.1 + chunk * 0.09);
  const mix = endlessMix(chunk);
  const base = { ...start, crumble: 0, goal: false };
  for (let attempt = 0; ; attempt++) {
    // After MAX_ATTEMPTS, drop hazards entirely: static planets validated hop by hop.
    const calm = attempt >= MAX_ATTEMPTS;
    const rng = makeRng(hashSeed(calm ? 'endless-calm' : 'endless', seed, chunk, attempt));
    const probe = { ...emptyLevel(), planets: [base], bottom: start.y + 450 };
    if (!grow(rng, probe, ENDLESS_HOPS, calm ? 0 : diff, calm ? NO_FEATURES : mix(rng), true)) continue;
    if (!solve(probe).ok) continue;
    probe.planets[probe.planets.length - 1].goal = false;
    const { planets, asteroids, lasers, holes, warps } = probe;
    return { chunk, calm, planets: planets.slice(1), asteroids, lasers, holes, warps };
  }
}

export function applyEndlessChunk(level, data) {
  level.planets.push(...data.planets);
  level.asteroids.push(...data.asteroids);
  level.lasers.push(...data.lasers);
  level.holes.push(...data.holes);
  level.warps.push(...data.warps);
  level.top = level.planets[level.planets.length - 1].y - 700;
  level.chunks = data.chunk + 1;
  return level;
}

export const TOTAL_LEVELS = WORLDS.length * LEVELS_PER_WORLD;
export { LEVELS_PER_WORLD };
