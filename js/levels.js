// Procedural level generator. Every level is validated by the solver bot before it is returned,
// so all 250 campaign levels, the daily challenge, weekly stages, shard hunts and every endless
// chunk are provably beatable. Optional extras (stardust coins, gold shards) sit on alternative
// flights that the solver also proved can still be finished.
// Campaign levels are generated ahead of time by tools/build-levels.mjs into data/levels.json;
// everything else is generated at runtime in js/genworker.js.
import { hashSeed, makeRng } from './rng.js';
import { WORLD_W, cloneState, createState, step, syncState } from './sim.js';
import { findWindows, solve, traceRoute } from './solver.js';
import { LEVELS_PER_WORLD, WORLDS } from './worlds.js';

const MAX_ATTEMPTS = 40;
const HOP_TRIES = 14;
const ARRIVAL_OFFSETS = [0.8, 1.7];
export const ENDLESS_HOPS = 6;
const TAU = Math.PI * 2;

const NO_FEATURES = { move: 0, ast: 0, moon: 0, laser: 0, crumble: 0, hole: 0, warp: 0, giant: 0, bounce: 0, goalMove: 0, boss: 0 };

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
      const k = 0.8 + 0.2 * local;
      f.move = 0.5 * k;
      f.ast = 0.9 * k;
      f.moon = 0.25 * k;
      f.laser = 0.5 * k;
      f.crumble = 0.4 * k;
      f.hole = 0.4 * k;
      f.warp = local > 0.3 ? 1 : 0;
      break;
    }
    case 9:
      f.giant = 0.5 + 0.35 * local;
      f.move = 0.25 * late;
      f.ast = 0.3 * late;
      break;
    case 10:
      f.bounce = 1;
      f.move = 0.3 * late;
      f.laser = 0.25 * late;
      f.ast = 0.3 * late;
      break;
    default:
      break;
  }
  // Late levels of the hazard worlds may end on a drifting portal.
  if (world >= 2 && local >= 0.7) f.goalMove = 0.5;
  return f;
}

/** The world's level 25 is a boss: longer, a drifting portal and (from world 2) guardian rocks. */
export function bossMix(world) {
  return { ...featureMix(world, 1), goalMove: 1, boss: world >= 2 ? 1 : 0 };
}

/** Which campaign level of each world hides the gold shard. */
export function goldIndex(world) {
  return 6 + ((world * 7) % 17);
}

/** Which hazard types a level contains (moving planets and crumbling planets count as hazards). */
export function hazardKinds(level) {
  const kinds = [];
  if (level.planets.some((p) => p.mx > 0)) kinds.push('move');
  if (level.asteroids.length) kinds.push('ast');
  if (level.lasers.length) kinds.push('laser');
  if (level.planets.some((p) => p.crumble > 0)) kinds.push('crumble');
  if (level.holes.length) kinds.push('hole');
  if (level.warps.length) kinds.push('warp');
  if (level.planets.some((p) => p.g > 0)) kinds.push('giant');
  if (level.bounce) kinds.push('bounce');
  return kinds;
}

const WORLD_MECHANIC = [null, null, 'move', 'ast', 'laser', 'crumble', 'hole', 'warp', null, 'giant', 'bounce'];

/** A campaign level must show off its world: its own mechanic, or a mix of 3+ hazards in world 8. */
function showsWorld(world, level) {
  const kinds = hazardKinds(level);
  if (world === 8) return kinds.length >= 3;
  return !WORLD_MECHANIC[world] || kinds.includes(WORLD_MECHANIC[world]);
}

export function campaignDifficulty(world, index) {
  const local = (index - 1) / (LEVELS_PER_WORLD - 1);
  const boss = index === LEVELS_PER_WORLD ? 2 : 0;
  // Worlds 9 and 10 are bonus worlds: calmer than The Singularity, built around one new mechanic.
  if (world > 8) return { local, diff: 0.45 + 0.4 * local, hops: 5 + Math.round(local * 5) + boss };
  return { local, diff: Math.min(1, (world - 1 + local) / 8), hops: 3 + Math.round(local * 5) + Math.floor((world - 1) * 0.7) + boss };
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
  const r = goal ? 38 : rng.range(32, 56 - diff * 8);
  const orbit = goal ? 92 : r + rng.range(38, 54) - diff * 8;
  const margin = orbit + 18;
  let x = prev.x;
  for (let tries = 0; tries < 12; tries++) {
    x = prev.x + rng.sign() * rng.range(60, 170 + 150 * diff);
    if (x >= margin && x <= WORLD_W - margin) break;
  }
  x = Math.min(WORLD_W - margin, Math.max(margin, x));
  const y = prev.y - (rng.range(290, 360) + diff * 70);
  const p = { x, y, r, orbit, mx: 0, mf: 0, mp: 0, crumble: 0, goal, hue: rng.int(0, 3), ring: rng.chance(0.35) };
  if (goal && f.goalMove && rng.chance(f.goalMove)) {
    const room = Math.min(x - margin, WORLD_W - margin - x);
    const amp = Math.min(room, rng.range(60, 90 + 60 * diff));
    if (amp > 30) {
      p.mx = amp;
      p.mf = rng.range(0.45, 0.7 + 0.3 * diff);
      p.mp = rng.range(0, TAU);
    }
  }
  if (!goal && f.giant && rng.chance(f.giant)) {
    p.r = Math.round(p.r * 1.25);
    p.g = rng.range(2.2e6, 3.2e6 + 1.5e6 * diff);
  }
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
    const r = rng.range(17, 28);
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

/** Boss guardians: two rocks circling the portal's whole track, crossing every approach. */
function addGuardians(rng, level, p, diff) {
  const R = p.orbit + p.mx + rng.range(26, 34);
  const w = rng.sign() * rng.range(0.5, 0.75 + 0.35 * diff);
  const ph = rng.range(0, TAU);
  for (let k = 0; k < 2; k++) {
    level.asteroids.push({ kind: 'spin', x: p.x, y: p.y, R, w, ph: ph + k * Math.PI, r: rng.range(15, 20), spin: rng.range(-2, 2), seed: rng.int(0, 9999) });
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
    r: rng.range(13, 19),
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
      if (p.g) level.giants = true;
      const band = bandBetween(prev, p);
      if (band) addBandHazards(rng, level, band, diff, f);
      addMoon(rng, level, p, diff, f);
      if (goal && f.boss) addGuardians(rng, level, p, diff);
      level.top = p.y - 700;
      quantize(level);
      const found = findWindows(level, delayed(level, s, 0), 1);
      // Bounce worlds prefer hops whose first launch window is a bank shot off a wall.
      const wantBank = level.bounce && i % 2 === 1 && tries < HOP_TRIES - 4;
      const banked = !wantBank || (found.length && found[0].state.bounces > s.bounces);
      if (found.length && banked && ARRIVAL_OFFSETS.every((o) => findWindows(level, delayed(level, s, o), 1).length)) {
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
  return { x: WORLD_W / 2, y: 0, r: 50, orbit: 100, mx: 0, mf: 0, mp: 0, crumble: 0, goal: false, hue: 0, ring: true };
}

/** Replay a route from the level start (launch after waiting k frames on each planet). */
export function replayRoute(level, ks, opts = {}) {
  const s = createState(level, opts);
  for (const k of ks) {
    for (let i = 0; i < k && s.mode === 'orbit'; i++) step(level, s, false);
    if (s.mode !== 'orbit') break;
    step(level, s, true);
    for (let i = 0; i < 600 && s.mode === 'fly'; i++) step(level, s, false);
    if (s.mode !== 'orbit') break;
  }
  return s;
}

function flightOf(level, state, k) {
  const c = cloneState(state);
  for (let i = 0; i < k; i++) step(level, c, false);
  step(level, c, true);
  const pts = [{ x: c.x, y: c.y }];
  while (c.mode === 'fly') {
    step(level, c, false);
    pts.push({ x: c.x, y: c.y });
  }
  return pts;
}

/**
 * Alternative flights: windows the solver did NOT take, from each planet on its route, that still
 * land and from where the level can still be finished. Each comes with its distance from the main route.
 */
function altFlights(level, solution, limit) {
  const main = traceRoute(level, solution.route).flatMap((f) => f.pts);
  const out = [];
  for (const { state, k } of solution.route) {
    for (const w of findWindows(level, state, limit)) {
      if (Math.abs(w.k - k) < 12) continue;
      if (w.state.mode !== 'won' && !solve(level, { from: w.state, maxNodes: 25 }).ok) continue;
      const pts = flightOf(level, state, w.k);
      let best = { gap: 0, at: null };
      for (let i = Math.floor(pts.length * 0.2); i < pts.length * 0.8; i++) {
        let gap = Infinity;
        for (const m of main) gap = Math.min(gap, Math.hypot(m.x - pts[i].x, m.y - pts[i].y));
        if (gap > best.gap) best = { gap, at: i };
      }
      if (best.at != null) out.push({ pts, gap: best.gap, at: best.at });
    }
  }
  return out;
}

/** Stardust coins on up to two risky alternative flights, and optionally the world's gold shard. */
function addExtras(level, solution, seedParts, wantGold) {
  const rng = makeRng(hashSeed('extras', ...seedParts));
  const alts = altFlights(level, solution, 4).filter((a) => a.gap >= 45);
  level.coins = [];
  level.gold = null;
  if (wantGold) {
    const pick = alts.reduce((a, b) => (b.gap > (a ? a.gap : 0) ? b : a), null);
    if (pick) {
      const pt = pick.pts[pick.at];
      level.gold = { x: q(pt.x), y: q(pt.y) };
      alts.splice(alts.indexOf(pick), 1);
    }
  }
  for (let n = 0; n < 2 && alts.length; n++) {
    const a = alts.splice(rng.int(0, alts.length - 1), 1)[0];
    for (const f of [-0.12, 0, 0.12]) {
      const i = Math.max(0, Math.min(a.pts.length - 1, a.at + Math.round(f * a.pts.length)));
      const pt = a.pts[i];
      if (level.shards.some((sh) => Math.hypot(sh.x - pt.x, sh.y - pt.y) < 40)) continue;
      if (level.gold && Math.hypot(level.gold.x - pt.x, level.gold.y - pt.y) < 50) continue;
      level.coins.push({ x: q(pt.x), y: q(pt.y) });
    }
  }
  return level;
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

/**
 * Generate and validate a level. `accept(level, solution)` may reject a solved layout;
 * `finish(level, solution)` turns the solved layout into the final level (shards, par, extras).
 */
function buildValidated(seedParts, hops, diff, mix, accept = () => true, finish = null) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rng = makeRng(hashSeed(...seedParts, attempt));
    const f = typeof mix === 'function' ? mix(rng) : mix;
    const level = { ...emptyLevel(), planets: [startPlanet()], bottom: 450 };
    if (f.bounce) level.bounce = true;
    addMoon(rng, level, level.planets[0], diff, f);
    if (!grow(rng, level, hops, diff, f, true) || !accept(level, null)) continue;
    const solution = solve(level);
    if (!solution.ok || !accept(level, solution)) continue;
    level.attempts = attempt + 1;
    finishLevel(level, solution);
    if (finish) {
      if (!finish(level, solution)) continue;
    } else addExtras(level, solution, seedParts, false);
    return level;
  }
  return null;
}

/** Campaign level (world 1..10, index 1..25). Throws if no valid layout exists (caught by tests). */
export function generateLevel(world, index) {
  const { local, diff, hops } = campaignDifficulty(world, index);
  const boss = index === LEVELS_PER_WORLD;
  const accept = (l, sol) => showsWorld(world, l) && (!sol || world !== 10 || sol.end.bounces > 0);
  const gold = index === goldIndex(world);
  // The gold level must actually get its gold shard; otherwise try the next layout.
  const finish = (l, sol) => addExtras(l, sol, ['level', world, index], gold) && (!gold || !!l.gold);
  const level = buildValidated(['level', world, index], hops, diff, boss ? bossMix(world) : featureMix(world, local), accept, finish);
  if (!level) throw new Error(`level ${world}-${index}: no solvable layout in ${MAX_ATTEMPTS} attempts`);
  if (boss) level.boss = true;
  return Object.assign(level, { id: `${world}-${index}`, kind: 'level', world, index });
}

const DAILY_MECHS = ['move', 'ast', 'laser', 'crumble', 'hole', 'warp', 'moon'];

/** Date-seeded daily challenge (dateKey: YYYY-MM-DD). */
export function generateDaily(dateKey) {
  const mechs = pickMechs(makeRng(hashSeed('daily-mechs', dateKey)), 3);
  const f = { ...NO_FEATURES };
  for (const m of mechs) f[m] = m === 'warp' ? 1 : m === 'ast' ? 1.0 : 0.55;
  // Fall back to gentler versions of the same mix (ending hazard-free) rather than failing the day.
  let level = null;
  for (let soften = 0; soften <= 4 && !level; soften++) {
    const k = 1 - soften * 0.25;
    const mix = Object.fromEntries(Object.entries(f).map(([key, v]) => [key, key === 'warp' ? (k > 0 ? v : 0) : v * k]));
    level = buildValidated(['daily', dateKey, soften], 9, 0.55 * k, mix);
  }
  if (!level) throw new Error(`daily ${dateKey}: no solvable layout`);
  return Object.assign(level, { id: `daily-${dateKey}`, kind: 'daily', world: 0, index: 0, mechs, dateKey });
}

function pickMechs(rng, n) {
  const mechs = [];
  while (mechs.length < n) {
    const m = rng.pick(DAILY_MECHS);
    if (!mechs.includes(m)) mechs.push(m);
  }
  return mechs;
}

function mechMix(mechs, k) {
  const f = { ...NO_FEATURES };
  for (const m of mechs) f[m] = m === 'warp' ? (k > 0 ? 1 : 0) : (m === 'ast' ? 1.0 : 0.55) * k;
  return f;
}

export const WEEKLY_STAGES = 5;

/** Stage `stage` (0-based) of the week's five-stage event (weekKey: YYYY-Www). */
export function generateWeekly(weekKey, stage) {
  const mechs = pickMechs(makeRng(hashSeed('weekly-mechs', weekKey)), 3);
  let level = null;
  for (let soften = 0; soften <= 4 && !level; soften++) {
    const k = (0.6 + stage * 0.1) * (1 - soften * 0.25);
    level = buildValidated(['weekly', weekKey, stage, soften], 6 + stage, (0.35 + stage * 0.1) * Math.max(0, k), mechMix(mechs, k));
  }
  if (!level) throw new Error(`weekly ${weekKey}/${stage}: no solvable layout`);
  return Object.assign(level, { id: `weekly-${weekKey}-${stage}`, kind: 'weekly', world: 0, index: stage + 1, mechs, weekKey, stage });
}

export const HUNT_SHARDS = 10;
export const HUNT_TIME = 60;

/** Spread HUNT_SHARDS along the solver's flights and turn the level into a timed hunt (no portal). */
function finishHunt(level, solution) {
  const flights = traceRoute(level, solution.route);
  const pts = [];
  flights.forEach((f, fi) => {
    const last = fi === flights.length - 1;
    // The final flight ends in the top ring, so its shard must come before the capture.
    for (let i = Math.floor(f.pts.length * 0.25); i < f.pts.length * (last ? 0.6 : 0.85); i++) pts.push(f.pts[i]);
  });
  if (pts.length < HUNT_SHARDS * 4) return false;
  level.shards = Array.from({ length: HUNT_SHARDS }, (_, i) => {
    const pt = pts[Math.round(((i + 1) / HUNT_SHARDS) * (pts.length - 1))];
    return { x: q(pt.x), y: q(pt.y) };
  });
  level.planets[level.planets.length - 1].goal = false;
  level.hunt = true;
  level.timeLimit = HUNT_TIME;
  level.coins = [];
  level.gold = null;
  // Prove it: replaying the bot's launches must collect every shard well inside the time limit.
  const end = replayRoute(level, solution.route.map((r) => r.k));
  return end.mode === 'won' && end.t - (level.t0 || 0) <= HUNT_TIME - 15;
}

/** Date-seeded Shard Hunt: collect all ten shards within sixty seconds. */
export function generateHunt(dateKey) {
  const mechs = pickMechs(makeRng(hashSeed('hunt-mechs', dateKey)), 2);
  let level = null;
  for (let soften = 0; soften <= 4 && !level; soften++) {
    const k = 0.8 * (1 - soften * 0.25);
    level = buildValidated(['hunt', dateKey, soften], 7, 0.45 * Math.max(0, k), mechMix(mechs, k), () => true, finishHunt);
  }
  if (!level) throw new Error(`hunt ${dateKey}: no solvable layout`);
  return Object.assign(level, { id: `hunt-${dateKey}`, kind: 'hunt', world: 0, index: 0, mechs, dateKey });
}

/** Left-right mirror image of a level (the Mirror mutator). Start it with createState(..., { dir: -1 }). */
export function mirrorLevel(level) {
  const m = JSON.parse(JSON.stringify(level));
  const fx = (v) => WORLD_W - v;
  for (const p of m.planets) {
    p.x = fx(p.x);
    if (p.mx) p.mp += Math.PI;
  }
  for (const a of m.asteroids) {
    a.x = fx(a.x);
    if (a.kind === 'spin') {
      a.w = -a.w;
      a.ph = Math.PI - a.ph;
    } else a.vx = -a.vx;
    a.spin = -a.spin;
  }
  for (const l of m.lasers) {
    l.x1 = fx(l.x1);
    l.x2 = fx(l.x2);
  }
  for (const h of m.holes) h.x = fx(h.x);
  for (const w of m.warps) {
    w.ax = fx(w.ax);
    w.bx = fx(w.bx);
  }
  for (const s of m.shards) s.x = fx(s.x);
  for (const c of m.coins || []) c.x = fx(c.x);
  if (m.gold) m.gold.x = fx(m.gold.x);
  m.mirrored = true;
  return m;
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
export function endlessChunk(seed, chunk, start, zen = false) {
  const diff = Math.min(1, 0.1 + chunk * 0.09);
  const mix = endlessMix(chunk);
  const base = { ...start, crumble: 0, goal: false };
  for (let attempt = zen ? MAX_ATTEMPTS : 0; attempt < MAX_ATTEMPTS * 2; attempt++) {
    // After MAX_ATTEMPTS (or always in Zen), drop hazards: static planets validated hop by hop.
    const calm = attempt >= MAX_ATTEMPTS;
    const rng = makeRng(hashSeed(calm ? 'endless-calm' : 'endless', seed, chunk, attempt));
    const probe = { ...emptyLevel(), planets: [base], bottom: start.y + 450 };
    if (!grow(rng, probe, ENDLESS_HOPS, calm ? 0 : diff, calm ? NO_FEATURES : mix(rng), true)) continue;
    if (!solve(probe).ok) continue;
    probe.planets[probe.planets.length - 1].goal = false;
    const { planets, asteroids, lasers, holes, warps } = probe;
    return { chunk, calm, planets: planets.slice(1), asteroids, lasers, holes, warps };
  }
  throw new Error(`endless chunk ${chunk}: no solvable layout`);
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
