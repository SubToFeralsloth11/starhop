import test from 'node:test';
import assert from 'node:assert/strict';
import { DT, FLY_SPEED, cloneState, createState, launchDir, step } from '../js/sim.js';

const planet = (x, y, extra = {}) => ({ x, y, r: 40, orbit: 100, mx: 0, mf: 0, mp: 0, crumble: 0, goal: false, hue: 0, ...extra });

function level(planets, extra = {}) {
  return { planets, asteroids: [], lasers: [], holes: [], warps: [], shards: [], t0: 0, top: -3000, bottom: 600, ...extra };
}

function run(lv, s, frames, launchAt = -1) {
  for (let i = 0; i < frames && (s.mode === 'orbit' || s.mode === 'fly'); i++) step(lv, s, i === launchAt);
  return s;
}

// Start angle is PI/2 (below the planet), dir +1: the launch tangent points in -x.
test('launch flies along the orbit tangent and some timing lands in the next ring', () => {
  const lv = level([planet(360, 0), planet(60, -250, { goal: true })]);
  const s = createState(lv);
  assert.ok(launchDir(s).x < -0.99, 'tangent at the bottom of the orbit points left');
  const outcomes = new Set();
  for (let k = 0; k < 140; k++) {
    const probe = cloneState(s);
    run(lv, probe, 1, 0);
    run(lv, probe, 200);
    outcomes.add(probe.mode);
    step(lv, s, false);
  }
  assert.ok(outcomes.has('won'), 'some launch timing reaches the goal');
  assert.ok(outcomes.has('dead'), 'and badly timed launches miss');
});

test('capture sets the orbit direction from the approach and counts one hop per new planet', () => {
  const lv = level([planet(360, 0), planet(360, -400), planet(360, -800, { goal: true })]);
  const s = createState(lv);
  // Fly straight up through the right side of planet 1's ring.
  s.mode = 'fly';
  s.fromPi = 0;
  s.leftRing = true;
  s.x = 420;
  s.y = -150;
  s.vx = 0;
  s.vy = -FLY_SPEED;
  run(lv, s, 60);
  assert.equal(s.mode, 'orbit');
  assert.equal(s.pi, 1);
  assert.equal(s.hops, 1);
  // Passing the planet on its right while moving up is counter-clockwise in screen space: dir -1.
  assert.equal(s.dir, -1);
});

test('flying off the side of the playfield loses the ship', () => {
  const lv = level([planet(360, 0), planet(360, -400, { goal: true })]);
  const s = createState(lv);
  run(lv, s, 400, 0);
  assert.equal(s.mode, 'dead');
  assert.equal(s.cause, 'lost');
});

test('drifting longer than the flight limit is fatal even inside the playfield', () => {
  const lv = level([planet(360, 0), planet(360, -400, { goal: true })], { top: -1e6, bottom: 1e6 });
  const s = createState(lv);
  s.mode = 'fly';
  s.fromPi = 0;
  s.leftRing = true;
  s.x = 600;
  s.y = 300;
  s.vx = 0;
  s.vy = FLY_SPEED;
  run(lv, s, 60 * 5);
  assert.equal(s.mode, 'dead');
  assert.equal(s.cause, 'lost');
  assert.ok(s.flyT > 2 && s.flyT < 3);
});

test('asteroids kill, and a shield absorbs exactly one hit', () => {
  const rock = { kind: 'wrap', x: 360, y: 100, r: 20, vx: 0, spin: 0, seed: 1 };
  const lv = level([planet(360, 0), planet(360, -400, { goal: true })], { asteroids: [rock] });
  const bare = run(lv, createState(lv), 120);
  assert.equal(bare.mode, 'dead');
  assert.equal(bare.cause, 'asteroid');

  const shielded = createState(lv, { shields: 1 });
  run(lv, shielded, 30);
  assert.equal(shielded.shields, 0, 'the shield was spent on the first hit');
  assert.notEqual(shielded.mode, 'dead');
  run(lv, shielded, 600);
  assert.equal(shielded.mode, 'dead', 'the orbit keeps crossing the rock, so a second hit kills');
});

test('lasers are only lethal while switched on', () => {
  const laser = (ph) => ({ x1: 0, y1: 100, x2: 720, y2: 100, period: 2, on: 0.5, ph });
  const off = level([planet(360, 0), planet(360, -400, { goal: true })], { lasers: [laser(1.0)] });
  // The ship at the bottom of its orbit sits on y=100. Phase 1.0 keeps the gate off for ~1 s.
  const s1 = run(off, createState(off), 30);
  assert.equal(s1.mode, 'orbit');
  const on = level(off.planets, { lasers: [laser(0)] });
  const s2 = run(on, createState(on), 2);
  assert.equal(s2.mode, 'dead');
  assert.equal(s2.cause, 'laser');
});

test('a crumbling planet kills the ship if it is still orbiting when the timer ends', () => {
  const lv = level([planet(360, 0), planet(360, -400, { crumble: 1 }), planet(360, -800, { goal: true })]);
  const s = createState(lv);
  s.mode = 'fly';
  s.fromPi = 0;
  s.leftRing = true;
  s.x = 420;
  s.y = -150;
  s.vx = 0;
  s.vy = -FLY_SPEED;
  while (s.mode === 'fly') step(lv, s, false);
  assert.equal(s.pi, 1);
  const landed = s.t;
  run(lv, s, 600);
  assert.equal(s.mode, 'dead');
  assert.equal(s.cause, 'crumble');
  assert.ok(Math.abs(s.t - landed - 1) < 2 * DT);
  assert.equal(s.gone[1], true);
});

test('wormholes teleport the ship and keep its heading', () => {
  const lv = level([planet(360, 0), planet(360, -1200, { goal: true })], { warps: [{ ax: 360, ay: -300, bx: 360, by: -1000, r: 30 }] });
  const s = createState(lv);
  s.mode = 'fly';
  s.fromPi = 0;
  s.leftRing = true;
  s.x = 360;
  s.y = -200;
  s.vx = 0;
  s.vy = -FLY_SPEED;
  run(lv, s, 12);
  assert.ok(s.y < -950, `teleported near the exit (y=${s.y.toFixed(0)})`);
  assert.equal(s.vx, 0);
  assert.equal(s.vy, -FLY_SPEED);
});

test('black holes bend the flight at constant speed, and their core is fatal', () => {
  const hole = { x: 500, y: -300, m: 8e6, core: 20 };
  const lv = level([planet(360, 0), planet(360, -1200, { goal: true })], { holes: [hole] });
  const s = createState(lv);
  s.mode = 'fly';
  s.fromPi = 0;
  s.leftRing = true;
  s.x = 360;
  s.y = -150;
  s.vx = 0;
  s.vy = -FLY_SPEED;
  run(lv, s, 10);
  assert.ok(s.vx > 0, 'pulled toward the hole');
  assert.ok(Math.abs(Math.hypot(s.vx, s.vy) - FLY_SPEED) < 1e-6);

  const s2 = createState(lv);
  s2.mode = 'fly';
  s2.fromPi = 0;
  s2.leftRing = true;
  s2.x = 500;
  s2.y = -200;
  s2.vx = 0;
  s2.vy = -FLY_SPEED;
  run(lv, s2, 60);
  assert.equal(s2.mode, 'dead');
  assert.equal(s2.cause, 'hole');
});

test('magnet radius widens shard pickup', () => {
  const lv = level([planet(360, 0), planet(360, -800, { goal: true })], { shards: [{ x: 400, y: -300 }] });
  const fly = (magnetR) => {
    const s = createState(lv, { magnetR });
    s.mode = 'fly';
    s.fromPi = 0;
    s.leftRing = true;
    s.x = 360;
    s.y = -150;
    s.vx = 0;
    s.vy = -FLY_SPEED;
    run(lv, s, 30);
    return s.shards;
  };
  assert.equal(fly(0), 0, '40 units away is out of base reach');
  assert.equal(fly(24), 1, 'magnet level 2 reaches it');
});
