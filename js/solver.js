// Solver bot: proves a level is beatable with human-sized timing windows by running the real simulation.
import { DT, createState, cloneState, step } from './sim.js';

export const MIN_WINDOW = 6; // consecutive frames (0.1 s) that must all succeed around the chosen launch frame
export const MIN_REACTION = 12; // frames (0.2 s) after landing before the bot may launch
export const MAX_WAIT = 4.5; // seconds the bot is willing to orbit before launching

function tryLaunch(level, base, fromPi) {
  const c = cloneState(base);
  step(level, c, true);
  for (let i = 0; i < 400 && c.mode === 'fly'; i++) step(level, c, false);
  if (c.mode === 'won') return c;
  if (c.mode === 'orbit' && c.pi > fromPi) return c;
  return null;
}

/**
 * Find up to `limit` launch windows from orbit state `s`.
 * Each window is MIN_WINDOW consecutive successful launch frames; the middle frame is returned.
 * Frames are sampled with a stride smaller than MIN_WINDOW, so no window can be skipped, and only
 * the neighbourhood of a successful sample is evaluated frame by frame.
 */
export function findWindows(level, s, limit, opts = {}) {
  const minWindow = opts.minWindow ?? MIN_WINDOW;
  const maxWait = opts.maxWait ?? MAX_WAIT;
  const stride = Math.max(1, minWindow >> 1);
  const fromPi = s.pi;
  const waitLimit = Math.min(maxWait, s.crumbleAt[fromPi] - s.t - DT * 2);
  const maxK = Math.floor(waitLimit / DT);

  // Orbit states for every candidate launch frame (cheap: no flight simulated yet).
  const bases = [cloneState(s)];
  for (let k = 1; k <= maxK; k++) {
    const b = cloneState(bases[k - 1]);
    step(level, b, false);
    if (b.mode !== 'orbit') break;
    bases.push(b);
  }
  const last = bases.length - 1;
  const memo = new Map();
  const ev = (k) => {
    if (!memo.has(k)) memo.set(k, tryLaunch(level, bases[k], fromPi));
    return memo.get(k);
  };

  const out = [];
  let k = MIN_REACTION;
  while (k <= last && out.length < limit) {
    if (!ev(k)) {
      k += stride;
      continue;
    }
    let lo = k;
    while (lo - 1 >= MIN_REACTION && ev(lo - 1)) lo--;
    let hi = k;
    while (hi + 1 <= last && hi - lo + 1 < minWindow && ev(hi + 1)) hi++;
    if (hi - lo + 1 >= minWindow) {
      const mid = lo + (minWindow >> 1);
      out.push({ k: mid, state: ev(mid) });
      // Skip past the rest of this run before looking for the next window.
      hi = lo + minWindow - 1;
      while (hi + 1 <= last && ev(hi + 1)) hi++;
    }
    k = hi + 1;
  }
  return out;
}

/**
 * Depth-first search over launch windows (with limited backtracking).
 * Returns { ok, time, route } where route[i] = { state, k } replays the solution.
 */
export function solve(level, opts = {}) {
  const ctx = {
    nodes: opts.maxNodes ?? 40,
    branch: opts.branch ?? 3,
    opts,
    deepest: 0,
  };
  const s0 = createState(level);
  const route = [];
  const end = dfs(level, s0, route, ctx, 0);
  if (!end) return { ok: false, deepest: ctx.deepest, route: [] };
  return { ok: true, time: end.t - s0.t, route };
}

function dfs(level, s, route, ctx, depth) {
  if (s.mode === 'won') return s;
  if (ctx.nodes-- <= 0) return null;
  ctx.deepest = Math.max(ctx.deepest, depth);
  const windows = findWindows(level, s, ctx.branch, ctx.opts);
  for (const w of windows) {
    route.push({ state: s, k: w.k });
    const end = dfs(level, w.state, route, ctx, depth + 1);
    if (end) return end;
    route.pop();
  }
  return null;
}

/** Replay a solved route and return each flight's sampled points. */
export function traceRoute(level, route) {
  const flights = [];
  for (const { state, k } of route) {
    const c = cloneState(state);
    for (let i = 0; i < k; i++) step(level, c, false);
    step(level, c, true);
    const pts = [{ x: c.x, y: c.y }];
    while (c.mode === 'fly') {
      step(level, c, false);
      pts.push({ x: c.x, y: c.y });
    }
    flights.push({ from: state.pi, to: c.pi, pts });
  }
  return flights;
}
