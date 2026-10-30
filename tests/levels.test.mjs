import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyEndlessChunk, createEndless, endlessChunk, generateDaily } from '../js/levels.js';
import { buildAll } from '../tools/build-levels.mjs';
import { solve } from '../js/solver.js';

const data = JSON.parse(readFileSync(new URL('../data/levels.json', import.meta.url)));
const levels = data.levels;
const byWorld = (w) => levels.filter((l) => l.world === w);

test('the shipped campaign has 8 worlds of 25 levels', () => {
  assert.equal(levels.length, 200);
  for (let w = 1; w <= 8; w++) assert.deepEqual(byWorld(w).map((l) => l.index), Array.from({ length: 25 }, (_, i) => i + 1));
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
  };
  for (const [w, fn] of Object.entries(has)) {
    const count = byWorld(Number(w)).filter(fn).length;
    assert.ok(count >= 20, `world ${w}: only ${count}/25 levels use its mechanic`);
  }
  const w1 = byWorld(1);
  assert.ok(w1.every((l) => !l.asteroids.length && !l.lasers.length && !l.holes.length && !l.warps.length && l.planets.every((p) => !p.mx && !p.crumble)), 'world 1 is hazard-free');
  const w8 = byWorld(8);
  const kinds = (l) => [l.asteroids.length, l.lasers.length, l.holes.length, l.warps.length, l.planets.some((p) => p.mx), l.planets.some((p) => p.crumble)].filter(Boolean).length;
  assert.ok(w8.every((l) => kinds(l) >= 3), 'world 8 mixes at least three hazard types per level');
});

test('levels get longer through each world and across worlds', () => {
  for (let w = 1; w <= 8; w++) {
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
