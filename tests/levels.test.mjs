import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyEndlessChunk, createEndless, endlessChunk, generateDaily, generateHunt, generateWeekly, goldIndex, mirrorLevel, HUNT_SHARDS } from '../js/levels.js';
import { cloneState, createState, step, syncState } from '../js/sim.js';
import { findWindows } from '../js/solver.js';
import { buildAll } from '../tools/build-levels.mjs';
import { solve } from '../js/solver.js';

const data = JSON.parse(readFileSync(new URL('../data/levels.json', import.meta.url)));
const levels = data.levels;
const byWorld = (w) => levels.filter((l) => l.world === w);

test('the shipped campaign has 10 worlds of 25 levels', () => {
  assert.equal(levels.length, 250);
  for (let w = 1; w <= 10; w++) assert.deepEqual(byWorld(w).map((l) => l.index), Array.from({ length: 25 }, (_, i) => i + 1));
});

test('data/levels.json is exactly what the generator produces (run `npm run levels` after changing it)', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(buildAll())), levels);
});

test('every shipped level is beatable by the solver with human-sized timing windows', () => {
  const failed = levels.filter((l) => !solve(l).ok).map((l) => l.id);
  assert.deepEqual(failed, []);
});

test('every level has three star shards, a portal finish and a par above the solver time', () => {
  for (const l of levels) {
    assert.equal(l.shards.length, 3, l.id);
    assert.ok(l.planets.at(-1).goal, l.id);
    assert.equal(l.planets.filter((p) => p.goal).length, 1, l.id);
    assert.ok(l.par > l.botTime, l.id);
  }
});

test("each world's levels feature that world's mechanic", () => {
  const has = {
    2: (l) => l.planets.some((p) => p.mx > 0),
    3: (l) => l.asteroids.length > 0,
    4: (l) => l.lasers.length > 0,
    5: (l) => l.planets.some((p) => p.crumble > 0),
    6: (l) => l.holes.length > 0,
    7: (l) => l.warps.length > 0,
    9: (l) => l.planets.some((p) => p.g > 0),
    10: (l) => l.bounce === true,
  };
  for (const [w, fn] of Object.entries(has)) {
    const count = byWorld(Number(w)).filter(fn).length;
    assert.ok(count >= 20, `world ${w}: only ${count}/25 levels use its mechanic`);
  }
  // World 1 is hazard-free; its boss only adds a drifting portal.
  const w1 = byWorld(1).filter((l) => !l.boss);
  assert.ok(w1.every((l) => !l.asteroids.length && !l.lasers.length && !l.holes.length && !l.warps.length && l.planets.every((p) => !p.mx && !p.crumble)), 'world 1 is hazard-free');
  const w8 = byWorld(8);
  const kinds = (l) => [l.asteroids.length, l.lasers.length, l.holes.length, l.warps.length, l.planets.some((p) => p.mx), l.planets.some((p) => p.crumble)].filter(Boolean).length;
  assert.ok(w8.every((l) => kinds(l) >= 3), 'world 8 mixes at least three hazard types per level');
});

test('levels get longer through each world and across worlds', () => {
  for (let w = 1; w <= 10; w++) {
    const hops = byWorld(w).map((l) => l.planets.length - 1);
    for (let i = 1; i < hops.length; i++) assert.ok(hops[i] >= hops[i - 1], `world ${w} level ${i + 1}`);
  }
  assert.ok(byWorld(8)[24].planets.length > byWorld(1)[24].planets.length);
});

test('the daily challenge is deterministic per date, differs across dates and is beatable', () => {
  const a = generateDaily('2026-05-01');
  const b = generateDaily('2026-05-01');
  const c = generateDaily('2026-05-02');
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.planets, c.planets);
  for (const d of [a, c]) {
    assert.equal(d.kind, 'daily');
    assert.ok(solve(d).ok);
  }
});

test('endless chunks stack upward and each one is solved before it is handed out', () => {
  const seed = 1234;
  const level = createEndless(seed);
  for (let c = 0; c < 20; c++) {
    const before = level.planets.length;
    const top = level.planets.at(-1);
    const chunk = endlessChunk(seed, c, top);
    assert.equal(chunk.calm, false, `chunk ${c} needed the hazard-free fallback`);
    // Each chunk alone (starting from its base planet) must be solvable to its last planet.
    const probe = { ...chunk, planets: [{ ...top, goal: false }, ...chunk.planets.map((p, i) => ({ ...p, goal: i === chunk.planets.length - 1 }))], shards: [], t0: 0, bottom: top.y + 450, top: chunk.planets.at(-1).y - 700 };
    assert.ok(solve(probe).ok, `chunk ${c}`);
    applyEndlessChunk(level, chunk);
    assert.ok(level.planets.length > before);
    assert.ok(level.planets.at(-1).y < top.y);
    assert.ok(level.planets.every((p) => !p.goal && !p.crumble));
  }
});

test('every level 25 is a boss with a drifting portal, guarded by rocks from world 2 on', () => {
  for (let w = 1; w <= 10; w++) {
    const boss = byWorld(w)[24];
    assert.ok(boss.boss, `${w}-25`);
    assert.ok(boss.planets.at(-1).mx > 0, `${w}-25 portal drifts`);
    if (w >= 2) assert.ok(boss.asteroids.filter((a) => a.kind === 'spin' && a.x === boss.planets.at(-1).x).length >= 2, `${w}-25 guardians`);
    assert.equal(byWorld(w).filter((l) => l.boss).length, 1);
  }
});

test('Pinball Rim levels need a bank shot: the solver route bounces off a wall', () => {
  for (const l of byWorld(10)) assert.ok(solve(l).end.bounces > 0, l.id);
});

/** From any planet on the solver's route, is there a launch that grabs `pick` and still lets you finish? */
function reachable(l, pick) {
  for (const { state } of solve(l).route) {
    for (const w of findWindows(l, state, 4)) {
      const c = cloneState(state);
      for (let i = 0; i < w.k; i++) step(l, c, false);
      step(l, c, true);
      while (c.mode === 'fly') step(l, c, false);
      if (pick(c) && (c.mode === 'won' || solve(l, { from: c, maxNodes: 25 }).ok)) return true;
    }
  }
  return false;
}

test('each world hides exactly one gold shard, on its gold level, reachable on a line that can still be finished', () => {
  for (let w = 1; w <= 10; w++) {
    const golds = byWorld(w).filter((l) => l.gold);
    assert.deepEqual(golds.map((l) => l.index), [goldIndex(w)], `world ${w}`);
    assert.ok(reachable(golds[0], (c) => c.gold), `${golds[0].id} gold`);
  }
});

test('stardust coins sit on alternative flights that can still be finished', () => {
  const withCoins = levels.filter((l) => l.coins.length);
  assert.ok(withCoins.length >= 150, `${withCoins.length} levels with coins`);
  for (const l of withCoins.filter((_, i) => i % 25 === 0)) assert.ok(reachable(l, (c) => c.coins > 0), l.id);
});

test('shard hunts are deterministic, have ten shards and no portal, and the bot wins them in time', () => {
  const a = generateHunt('2026-06-01');
  assert.deepEqual(a, generateHunt('2026-06-01'));
  assert.equal(a.shards.length, HUNT_SHARDS);
  assert.ok(a.planets.every((p) => !p.goal));
  const r = solve(a);
  assert.ok(r.ok && r.time < a.timeLimit);
});

test('weekly stages are deterministic, get longer each stage and are beatable', () => {
  const s0 = generateWeekly('2026-W20', 0);
  const s4 = generateWeekly('2026-W20', 4);
  assert.deepEqual(s0, generateWeekly('2026-W20', 0));
  assert.ok(s4.planets.length > s0.planets.length);
  assert.ok(solve(s0).ok && solve(s4).ok);
});

test('mirrored levels (Mirror mutator) stay beatable when started on the reversed orbit', () => {
  for (const l of [byWorld(2)[20], byWorld(4)[12], byWorld(7)[24], byWorld(10)[5]]) {
    const m = mirrorLevel(l);
    assert.ok(solve(m, { from: createState(m, { dir: -1 }) }).ok, `${l.id} mirrored`);
  }
});

test('zen chunks are always hazard-free', () => {
  const level = createEndless(77);
  for (let c = 0; c < 6; c++) {
    const chunk = endlessChunk(77, c, level.planets.at(-1), true);
    assert.ok(chunk.calm);
    assert.equal(chunk.asteroids.length + chunk.lasers.length + chunk.holes.length + chunk.warps.length, 0);
    applyEndlessChunk(level, chunk);
  }
});

// Plays endless like the game does: chunks stream in five planets ahead, and the bot always takes its
// first launch window. A player must never be stranded on a planet with no way out.
test('a bot that always takes the first window climbs endless runs without getting stranded', () => {
  for (const seed of [6, 7, 4242]) {
    const level = createEndless(seed);
    const s = createState(level);
    let target = null;
    let key = '';
    while (s.pi < 40 && s.mode !== 'dead' && s.t < 400) {
      while (level.planets.length - 1 - s.maxPi <= 5) applyEndlessChunk(level, endlessChunk(seed, level.chunks, level.planets.at(-1)));
      syncState(level, s);
      if (s.mode === 'orbit') {
        const k = `${s.launches}:${level.planets.length}`;
        if (k !== key) {
          key = k;
          const w = findWindows(level, s, 1, { maxWait: 15 });
          target = w.length ? s.t + w[0].k / 60 : Infinity;
        }
        assert.notEqual(target, Infinity, `seed ${seed}: stranded on planet ${s.pi}`);
        if (s.t >= target - 1e-9) {
          step(level, s, true);
          continue;
        }
      }
      step(level, s, false);
    }
    assert.ok(s.pi >= 40, `seed ${seed}: stopped at planet ${s.pi} (${s.mode} ${s.cause ?? ''})`);
  }
});
