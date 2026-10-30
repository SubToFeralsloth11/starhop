// Save data and every progression rule (unlocks, rewards, shop, achievements, daily, missions,
// pilot XP, chests, codex, prestige, events). Pure: no DOM.
import { LEVELS_PER_WORLD, WORLDS, WORLD_STAR_REQ } from './worlds.js';
import { hashSeed, makeRng } from './rng.js';

export const SAVE_KEY = 'starhop.save.v1';
export const SAVE_VERSION = 1;

export const STAR_CLEAR = 1;
export const STAR_SHARDS = 2;
export const STAR_PAR = 4;

export const TOTAL_LEVELS = WORLDS.length * LEVELS_PER_WORLD;
export const TOTAL_STARS = TOTAL_LEVELS * 3;

/**
 * Ships. Every ship has a perk that only ever helps (so every level stays beatable):
 * aim (+aim line), magnet (+pickup reach), shields (+hits absorbed), shipR (hazard hitbox),
 * revives, flight (+seconds adrift), crumbleMul, fuelMul (boost fuel), perfect (precision needed),
 * dustMul (level stardust), xpMul (pilot XP).
 */
export const SHIPS = [
  { id: 'comet', name: 'Comet', price: 0, color: '#7df9ff', accent: '#ffffff', shape: 'arrow', perk: { desc: 'Steady: +10% pilot XP.', xpMul: 1.1 } },
  { id: 'dart', name: 'Dart', price: 100, color: '#ff5c8a', accent: '#ffd1e0', shape: 'dart', perk: { desc: 'Long sight: +80 aim line.', aim: 80 } },
  { id: 'manta', name: 'Manta', price: 200, color: '#5cffb1', accent: '#d7fff0', shape: 'manta', perk: { desc: 'Big tank: +60% boost fuel.', fuelMul: 1.6 } },
  { id: 'saucer', name: 'Saucer', price: 350, color: '#c3a6ff', accent: '#ffffff', shape: 'saucer', perk: { desc: 'Tractor beam: +14 shard and coin reach.', magnet: 14 } },
  { id: 'phoenix', name: 'Phoenix', price: 500, color: '#ff9b3d', accent: '#ffe08a', shape: 'phoenix', perk: { desc: 'Rebirth: revive once per attempt.', revives: 1 } },
  { id: 'beetle', name: 'Beetle', price: 700, color: '#3dff6e', accent: '#0b3d1a', shape: 'beetle', perk: { desc: 'Sturdy grip: crumbling planets last 30% longer.', crumbleMul: 1.3 } },
  { id: 'needle', name: 'Needle', price: 950, color: '#f2f2f2', accent: '#ff3d6e', shape: 'needle', perk: { desc: 'Slim hull: smaller hazard hitbox.', shipR: 6 } },
  { id: 'crown', name: 'Crown', price: 1250, color: '#ffd23f', accent: '#fff6c2', shape: 'crown', perk: { desc: 'Royal tax: +20% level stardust.', dustMul: 1.2 } },
  { id: 'hammer', name: 'Hammerhead', price: 1600, color: '#3d8bff', accent: '#bcd6ff', shape: 'hammer', perk: { desc: 'Armored: +1 shield.', shields: 1 } },
  { id: 'specter', name: 'Specter', price: 2000, color: '#b8fff4', accent: '#4dffe1', shape: 'specter', perk: { desc: 'Drifter: +1 s adrift before you are lost.', flight: 1 } },
  { id: 'nova', name: 'Nova', price: 2500, color: '#ff3df5', accent: '#ffe3fd', shape: 'nova', perk: { desc: 'Bullseye: perfect landings are easier.', perfect: 0.55 } },
  { id: 'singularity', name: 'Singularity', price: 3200, color: '#1a1a2e', accent: '#ffd23f', shape: 'orb', perk: { desc: 'Event horizon: +1 shield, +12 reach.', shields: 1, magnet: 12 } },
  { id: 'aurum', name: 'Aurum', price: null, secret: true, color: '#ffcf3f', accent: '#fff8d6', shape: 'aurum', perk: { desc: 'Midas: +50% level stardust.', dustMul: 1.5 } },
];

/** Paint jobs: every ship can be repainted; price scales with the ship's tier. */
export const PAINTS = [
  { id: 'base', name: 'Factory' },
  { id: 'ember', name: 'Ember', color: '#ff7a2f', accent: '#ffe08a', mul: 1 },
  { id: 'frost', name: 'Frost', color: '#c9f3ff', accent: '#3d8bff', mul: 1.5 },
  { id: 'void', name: 'Void', color: '#2b1650', accent: '#ff3df5', mul: 2 },
];

export function paintPrice(ship, paint) {
  if (!paint.mul) return 0;
  return Math.round((150 + 0.2 * (ship.price || 2000)) * paint.mul / 10) * 10;
}

/** Trails: bought (price), unlocked by a fully starred world (world), or earned in a weekly event (event). */
export const TRAILS = [
  { id: 'basic', name: 'Stardust', price: 0, colors: ['#9fe8ff'], style: 'line' },
  { id: 'ember', name: 'Ember', price: 150, colors: ['#ffdf6b', '#ff7a2f', '#ff2f4f'], style: 'fire' },
  { id: 'aqua', name: 'Aqua', price: 300, colors: ['#5cfff1', '#2f8bff'], style: 'bubbles' },
  { id: 'rainbow', name: 'Rainbow', price: 500, colors: ['#ff4d4d', '#ffb84d', '#fff24d', '#4dff88', '#4dc3ff', '#b84dff'], style: 'rainbow' },
  { id: 'sparkle', name: 'Sparkle', price: 750, colors: ['#ffffff', '#fff3a8'], style: 'sparkle' },
  { id: 'plasma', name: 'Plasma', price: 1000, colors: ['#ff3df5', '#7a3dff'], style: 'zigzag' },
  { id: 'ghost', name: 'Ghost', price: 1400, colors: ['#e6fffb'], style: 'echo' },
  { id: 'starlight', name: 'Starlight', price: 2000, colors: ['#ffd23f', '#ffffff', '#7df9ff'], style: 'stars' },
  ...WORLDS.map((w, i) => ({ id: `world${i + 1}`, name: `${w.name} Aurora`, price: null, world: i + 1, colors: [w.nebula[0], w.accent, w.nebula[1]], style: 'aurora' })),
  { id: 'helix', name: 'Ion Helix', price: null, event: true, colors: ['#4dfcff', '#ff4dd2'], style: 'helix' },
  { id: 'sonar', name: 'Sonar', price: null, event: true, colors: ['#7dffc4', '#ffffff'], style: 'pulse' },
  { id: 'cometTail', name: 'Comet Tail', price: null, event: true, colors: ['#ffffff', '#ffb347', '#ff5c8a'], style: 'comet' },
  { id: 'sakura', name: 'Sakura', price: null, event: true, colors: ['#ffc4e1', '#ff7ab8', '#ffffff'], style: 'petal' },
];

export const EVENT_TRAILS = TRAILS.filter((t) => t.event).map((t) => t.id);

export const UPGRADES = [
  { id: 'magnet', name: 'Magnet', desc: 'Grab star shards and coins from farther away.', prices: [150, 350, 700, 1200, 1900] },
  { id: 'guide', name: 'Guide', desc: 'Longer aim line.', prices: [120, 300, 600, 1000, 1600] },
  { id: 'shield', name: 'Shield', desc: 'Absorb asteroid and laser hits each attempt.', prices: [500, 1500, 3500] },
];

/** Mutators: replay a cleared world's levels with a twist for medals (they never give stars). */
export const MUTATORS = [
  { id: 'mirror', bit: 1, name: 'Mirror', desc: 'The level is flipped left to right.' },
  { id: 'turbo', bit: 2, name: 'Turbo', desc: 'Everything runs 1.5× faster.' },
  { id: 'blind', bit: 4, name: 'Blind', desc: 'No aim line.' },
];
export const MEDAL_REWARD = 40;

export const DAILY_REWARDS = [50, 75, 100, 150, 200, 300, 500];
export const DAILY_CHALLENGE_REWARD = 100;
export const HUNT_REWARD = 60;
export const WEEKLY_STAGE_REWARD = 60;
export const WEEKLY_FINISH_REWARD = 300;
export const GOLD_REWARD = 150;
export const CODEX_REWARD = 20;
export const STARS_PER_CHEST = 25;

export function magnetRadius(level) {
  return level * 12;
}

export function guideLength(level) {
  return 150 + level * 70;
}

export function shieldCharges(level) {
  return level;
}

export function defaultSave() {
  return {
    v: SAVE_VERSION,
    dust: 0,
    levels: {}, // "w-i" -> { stars: bitmask, best: seconds | null, clears }
    ships: ['comet'],
    ship: 'comet',
    trails: ['basic'],
    trail: 'basic',
    paints: {}, // ship id -> owned paint ids (besides 'base')
    paint: {}, // ship id -> equipped paint id
    upgrades: { magnet: 0, guide: 0, shield: 0 },
    claimed: {}, // achievement id -> true
    stats: {
      hops: 0, shards: 0, clears: 0, crashes: 0, endlessBest: 0, dailyClears: 0, bestStreak: 0, dustEarned: 0,
      perfects: 0, chains: 0, coins: 0, flips: 0, bounces: 0, nearMisses: 0, boostTime: 0, revives: 0,
      medals: 0, missions: 0, chests: 0, starsEarned: 0, huntClears: 0, weeklyDone: 0, attackRuns: 0, zenBest: 0,
    },
    daily: { lastClaim: null, streak: 0, challengeDone: null },
    gold: [], // level keys whose gold shard was collected
    medals: {}, // "w-i" -> mutator bitmask
    ghosts: {}, // "w-i" -> best run inputs (see recordClear)
    missions: { date: null, list: [] },
    replays: { date: null, counts: {} },
    weekly: { week: null, stage: 0, time: 0, done: false },
    hunt: { date: null, best: null },
    attack: {}, // world -> best total seconds
    codex: [], // discovered codex entry ids
    xp: 0,
    prestige: 0,
    menuTheme: 0, // 0 = default, n = world n palette (needs 75/75 stars there)
    installAsked: false,
    settings: { music: true, sfx: true, haptics: true, reduced: false, ghost: true, hints: true },
    tutorialDone: false,
    lastWorld: 1,
  };
}

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const count = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
const num = (v) => (Number.isFinite(v) && v >= 0 ? v : 0);
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isWeek = (v) => typeof v === 'string' && /^\d{4}-W\d{2}$/.test(v);

function realKey(key) {
  const [w, i] = key.split('-').map(Number);
  return Number.isInteger(w) && Number.isInteger(i) && w >= 1 && w <= WORLDS.length && i >= 1 && i <= LEVELS_PER_WORLD && levelKey(w, i) === key;
}

function cleanLevels(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const [key, r] of Object.entries(raw)) {
    // A record only exists once the level was cleared, so the clear bit must be set.
    if (!realKey(key) || !isObj(r) || !Number.isInteger(r.stars) || r.stars < 1 || r.stars > 7 || !(r.stars & STAR_CLEAR)) continue;
    out[key] = { stars: r.stars, best: Number.isFinite(r.best) && r.best >= 0 ? r.best : null, clears: Math.max(1, count(r.clears)) };
  }
  return out;
}

const isTicks = (a) => Array.isArray(a) && a.length <= 400 && a.every((v) => Number.isInteger(v) && v >= 0);

function cleanGhost(g) {
  if (!isObj(g) || !Number.isFinite(g.t) || g.t <= 0 || !isTicks(g.l) || !isTicks(g.f) || !isTicks(g.b) || !isObj(g.o)) return null;
  const o = {};
  for (const k of ['shields', 'magnetR', 'shipR', 'revives', 'flightMax', 'crumbleMul', 'fuel', 'perfect']) if (Number.isFinite(g.o[k])) o[k] = g.o[k];
  return { t: g.t, l: g.l, f: g.f, b: g.b, o, ship: typeof g.ship === 'string' ? g.ship : 'comet' };
}

/**
 * Merge a parsed save onto defaults, field by field, so missing, new or corrupted fields never crash
 * the game. Anything that cannot be read falls back to its default; valid progress is kept.
 */
export function normalizeSave(raw) {
  const base = defaultSave();
  if (!isObj(raw) || raw.v !== SAVE_VERSION) return base;
  const out = base;
  out.dust = Number.isFinite(raw.dust) && raw.dust >= 0 ? Math.floor(raw.dust) : 0;
  out.levels = cleanLevels(raw.levels);
  if (isObj(raw.stats)) for (const k in base.stats) out.stats[k] = k === 'boostTime' ? num(raw.stats[k]) : count(raw.stats[k]);
  if (isObj(raw.settings)) for (const k in base.settings) if (typeof raw.settings[k] === 'boolean') out.settings[k] = raw.settings[k];
  for (const up of UPGRADES) out.upgrades[up.id] = Math.min(up.prices.length, count(raw.upgrades?.[up.id]));
  if (isObj(raw.claimed)) for (const a of ACHIEVEMENTS) if (raw.claimed[a.id] === true) out.claimed[a.id] = true;
  if (isObj(raw.daily)) {
    const day = (v) => (isDay(v) ? v : null);
    out.daily = { lastClaim: day(raw.daily.lastClaim), streak: count(raw.daily.streak), challengeDone: day(raw.daily.challengeDone) };
  }
  const known = (list, ids) => ids.filter((id, i) => list.some((x) => x.id === id) && ids.indexOf(id) === i);
  if (Array.isArray(raw.ships)) out.ships = known(SHIPS, ['comet', ...raw.ships]);
  if (Array.isArray(raw.trails)) out.trails = known(TRAILS, ['basic', ...raw.trails]);
  out.ship = out.ships.includes(raw.ship) ? raw.ship : 'comet';
  out.trail = out.trails.includes(raw.trail) ? raw.trail : 'basic';
  if (isObj(raw.paints)) {
    for (const ship of SHIPS) {
      const list = raw.paints[ship.id];
      if (Array.isArray(list)) out.paints[ship.id] = known(PAINTS.filter((p) => p.id !== 'base'), list);
    }
  }
  if (isObj(raw.paint)) {
    for (const ship of SHIPS) {
      const p = raw.paint[ship.id];
      if (p === 'base' || (out.paints[ship.id] || []).includes(p)) out.paint[ship.id] = p;
    }
  }
  if (Array.isArray(raw.gold)) out.gold = raw.gold.filter((k, i) => typeof k === 'string' && realKey(k) && raw.gold.indexOf(k) === i);
  if (isObj(raw.medals)) for (const [k, v] of Object.entries(raw.medals)) if (realKey(k) && Number.isInteger(v) && v > 0 && v < 8) out.medals[k] = v;
  if (isObj(raw.ghosts)) {
    for (const [k, g] of Object.entries(raw.ghosts)) {
      const clean = realKey(k) ? cleanGhost(g) : null;
      if (clean) out.ghosts[k] = clean;
    }
  }
  if (isObj(raw.missions) && isDay(raw.missions.date) && Array.isArray(raw.missions.list)) {
    const list = raw.missions.list.filter((m) => isObj(m) && MISSION_TYPES[m.type] && Number.isInteger(m.target) && m.target > 0 && Number.isInteger(m.reward) && m.reward > 0);
    out.missions = {
      date: raw.missions.date,
      list: list.slice(0, 3).map((m) => ({ type: m.type, target: m.target, reward: m.reward, world: Number.isInteger(m.world) ? m.world : 0, progress: Math.min(m.target, count(m.progress)), claimed: m.claimed === true })),
    };
  }
  if (isObj(raw.replays) && isDay(raw.replays.date) && isObj(raw.replays.counts)) {
    out.replays.date = raw.replays.date;
    for (const [k, v] of Object.entries(raw.replays.counts)) if (realKey(k)) out.replays.counts[k] = count(v);
  }
  if (isObj(raw.weekly) && isWeek(raw.weekly.week)) {
    out.weekly = { week: raw.weekly.week, stage: Math.min(5, count(raw.weekly.stage)), time: num(raw.weekly.time), done: raw.weekly.done === true };
  }
  if (isObj(raw.hunt) && isDay(raw.hunt.date)) out.hunt = { date: raw.hunt.date, best: Number.isFinite(raw.hunt.best) && raw.hunt.best > 0 ? raw.hunt.best : null };
  if (isObj(raw.attack)) for (let w = 1; w <= WORLDS.length; w++) if (Number.isFinite(raw.attack[w]) && raw.attack[w] > 0) out.attack[w] = raw.attack[w];
  if (Array.isArray(raw.codex)) out.codex = raw.codex.filter((id, i) => CODEX.some((c) => c.id === id) && raw.codex.indexOf(id) === i);
  // Saves from before star chests existed: count the stars already owned as earned.
  out.stats.starsEarned = Math.max(out.stats.starsEarned, totalStars(out));
  out.xp = count(raw.xp);
  out.prestige = count(raw.prestige);
  out.menuTheme = Number.isInteger(raw.menuTheme) && raw.menuTheme >= 0 && raw.menuTheme <= WORLDS.length ? raw.menuTheme : 0;
  out.installAsked = raw.installAsked === true;
  out.tutorialDone = raw.tutorialDone === true;
  out.lastWorld = Number.isInteger(raw.lastWorld) && raw.lastWorld >= 1 && raw.lastWorld <= WORLDS.length ? raw.lastWorld : 1;
  return out;
}

export function loadSave(storage) {
  try {
    const text = storage.getItem(SAVE_KEY);
    return text ? normalizeSave(JSON.parse(text)) : defaultSave();
  } catch {
    return defaultSave();
  }
}

export function writeSave(storage, save) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

/* ---------------- Save codes (export / import between devices) ---------------- */

const CODE_PREFIX = 'STARHOP1:';

function checksum(text) {
  return hashSeed(text).toString(36);
}

/** A copy-paste code holding the whole save (ghost replays are left out to keep it short). */
export function exportSave(save) {
  const json = JSON.stringify({ ...save, ghosts: {} });
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return `${CODE_PREFIX}${b64}.${checksum(b64)}`;
}

/** Parse a save code. Returns a normalized save, or null if the code is damaged or not a save. */
export function importSave(code) {
  const text = String(code || '').replace(/\s+/g, '');
  if (!text.startsWith(CODE_PREFIX)) return null;
  const [b64, sum] = text.slice(CODE_PREFIX.length).split('.');
  if (!b64 || sum !== checksum(b64)) return null;
  try {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const raw = JSON.parse(new TextDecoder().decode(bytes));
    if (!isObj(raw) || raw.v !== SAVE_VERSION) return null;
    return normalizeSave(raw);
  } catch {
    return null;
  }
}

/* ---------------- Levels, stars, worlds ---------------- */

export function starBits(bits) {
  return (bits & 1) + ((bits >> 1) & 1) + ((bits >> 2) & 1);
}

export function levelKey(world, index) {
  return `${world}-${index}`;
}

export function levelRecord(save, world, index) {
  return save.levels[levelKey(world, index)] || null;
}

export function isCleared(save, world, index) {
  const r = levelRecord(save, world, index);
  return !!r && (r.stars & STAR_CLEAR) !== 0;
}

export function totalStars(save) {
  let n = 0;
  for (const key in save.levels) n += starBits(save.levels[key].stars);
  return n;
}

export function worldStars(save, world) {
  let n = 0;
  for (let i = 1; i <= LEVELS_PER_WORLD; i++) {
    const r = levelRecord(save, world, i);
    if (r) n += starBits(r.stars);
  }
  return n;
}

export function isWorldComplete(save, world) {
  return worldStars(save, world) === LEVELS_PER_WORLD * 3;
}

/** Why a world is locked, or null if it is open. */
export function worldLock(save, world) {
  if (world <= 1) return null;
  const needStars = WORLD_STAR_REQ[world - 1];
  const prevDone = isCleared(save, world - 1, LEVELS_PER_WORLD);
  const have = totalStars(save);
  if (prevDone && have >= needStars) return null;
  return { prevDone, needStars, have };
}

export function isWorldUnlocked(save, world) {
  return worldLock(save, world) === null;
}

export function isLevelUnlocked(save, world, index) {
  if (!isWorldUnlocked(save, world)) return false;
  return index === 1 || isCleared(save, world, index - 1);
}

export function isEndlessUnlocked(save) {
  return isCleared(save, 1, LEVELS_PER_WORLD);
}

/** Mutators and Time Attack open for a world once its boss (level 25) is beaten. */
export function isWorldBeaten(save, world) {
  return isCleared(save, world, LEVELS_PER_WORLD);
}

/** First level the player has not cleared yet (for "Continue"). */
export function nextLevel(save) {
  for (let w = 1; w <= WORLDS.length; w++) {
    if (!isWorldUnlocked(save, w)) return null;
    for (let i = 1; i <= LEVELS_PER_WORLD; i++) if (!isCleared(save, w, i)) return { world: w, index: i };
  }
  return null;
}

function earn(save, amount) {
  save.dust += amount;
  save.stats.dustEarned += amount;
}

/* ---------------- Ships, perks, paints ---------------- */

export function shipById(id) {
  return SHIPS.find((s) => s.id === id) || SHIPS[0];
}

/** The equipped ship with its paint job applied (what the renderer draws). */
export function paintedShip(save, id = save.ship) {
  const ship = shipById(id);
  const paint = PAINTS.find((p) => p.id === (save.paint[ship.id] || 'base'));
  return paint && paint.color ? { ...ship, color: paint.color, accent: paint.accent } : ship;
}

/** Run options for the simulation from upgrades and the equipped ship's perk. */
export function runModifiers(save) {
  const perk = shipById(save.ship).perk || {};
  return {
    shields: shieldCharges(save.upgrades.shield) + (perk.shields || 0),
    magnetR: magnetRadius(save.upgrades.magnet) + (perk.magnet || 0),
    aimLen: guideLength(save.upgrades.guide) + (perk.aim || 0),
    shipR: perk.shipR || 0,
    revives: perk.revives || 0,
    flightMax: perk.flight ? 2.5 + perk.flight : 0,
    crumbleMul: perk.crumbleMul || 1,
    fuel: 0.6 * (perk.fuelMul || 1),
    perfect: perk.perfect || 0,
  };
}

/** Stardust multiplier for campaign rewards: ship perk times ascension bonus. */
export function dustMultiplier(save) {
  const perk = shipById(save.ship).perk || {};
  return (perk.dustMul || 1) * prestigeDustMul(save);
}

export function buyPaint(save, shipId, paintId) {
  const ship = SHIPS.find((s) => s.id === shipId);
  const paint = PAINTS.find((p) => p.id === paintId);
  if (!ship || !paint || paint.id === 'base') return 'unknown';
  if (!save.ships.includes(shipId)) return 'locked';
  const owned = save.paints[shipId] || (save.paints[shipId] = []);
  if (owned.includes(paintId)) return 'owned';
  const price = paintPrice(ship, paint);
  if (save.dust < price) return 'poor';
  save.dust -= price;
  owned.push(paintId);
  save.paint[shipId] = paintId;
  return null;
}

export function equipPaint(save, shipId, paintId) {
  if (paintId !== 'base' && !(save.paints[shipId] || []).includes(paintId)) return 'locked';
  save.paint[shipId] = paintId;
  return null;
}

/* ---------------- Replay fatigue (diminishing returns when farming one level) ---------------- */

export const FREE_REPLAYS = 3;

/** Payout factor for the next clear of `key` today: full for the first 3 clears, then halving to 10%. */
export function replayFactor(save, key, date) {
  const n = save.replays.date === date ? save.replays.counts[key] || 0 : 0;
  return n < FREE_REPLAYS ? 1 : Math.max(0.1, 0.5 ** (n - FREE_REPLAYS + 1));
}

function countReplay(save, key, date) {
  if (save.replays.date !== date) save.replays = { date, counts: {} };
  save.replays.counts[key] = (save.replays.counts[key] || 0) + 1;
}

/* ---------------- Pilot XP ---------------- */

export const PILOT_TITLES = ['Cadet', 'Hopper', 'Navigator', 'Pathfinder', 'Starfarer', 'Comet Rider', 'Void Walker', 'Nebula Knight', 'Orbit Sage', 'Star Admiral', 'Cosmic Legend'];

export function xpForLevel(level) {
  return 100 + 40 * (level - 1);
}

/** { level, into (xp into this level), need (xp for the next), title } */
export function pilotLevel(xp) {
  let level = 1;
  let left = xp;
  while (left >= xpForLevel(level)) {
    left -= xpForLevel(level);
    level++;
  }
  return { level, into: left, need: xpForLevel(level), title: PILOT_TITLES[Math.min(PILOT_TITLES.length - 1, Math.floor((level - 1) / 5))] };
}

export function levelUpReward(level) {
  return 25 + 5 * level;
}

/** Add XP (scaled by the ship perk). Pays the level-up rewards and returns the levels reached. */
export function addXp(save, amount) {
  const perk = shipById(save.ship).perk || {};
  const before = pilotLevel(save.xp).level;
  save.xp += Math.round(amount * (perk.xpMul || 1));
  const after = pilotLevel(save.xp).level;
  const ups = [];
  for (let l = before + 1; l <= after; l++) {
    earn(save, levelUpReward(l));
    ups.push(l);
  }
  return ups;
}

/* ---------------- Ascension (prestige) ---------------- */

export function canPrestige(save) {
  return totalStars(save) >= TOTAL_STARS;
}

export function prestigeDustMul(save) {
  return 1 + 0.25 * save.prestige;
}

/** Game speed in ascended runs: every tier is 10% faster, up to 1.3×. */
export function prestigeSpeed(save) {
  return 1 + 0.1 * Math.min(3, save.prestige);
}

/** Reset the campaign (stars, best times, ghosts, medals stay) for a permanent dust bonus. */
export function prestige(save) {
  if (!canPrestige(save)) return false;
  save.prestige++;
  save.levels = {};
  save.ghosts = {};
  save.lastWorld = 1;
  return true;
}

/* ---------------- Rewards ---------------- */

/**
 * Record a finished campaign level. Stars accumulate across runs (best of each kind is kept).
 * result: { world, index, shards (count), time, par, hops, perfects, chains, coins, gold (bool),
 *           mutator (MUTATORS bit or 0), date, ghost (inputs of this run, optional) }
 * Returns { stars, added, newStars, total, dust, breakdown, medal, goldNew, xpUps, worldRewards, secret }.
 */
export function recordClear(save, result) {
  const { world, index, shards, time, par, hops } = result;
  const perfects = result.perfects || 0;
  const chains = result.chains || 0;
  const coins = result.coins || 0;
  const mutator = result.mutator || 0;
  const date = result.date || dateKey();
  const key = levelKey(world, index);
  const prev = save.levels[key] || { stars: 0, best: null, clears: 0 };
  let bits = 0;
  let merged = prev.stars;
  let newStars = 0;
  if (!mutator) {
    bits = STAR_CLEAR;
    if (shards >= 3) bits |= STAR_SHARDS;
    if (time <= par) bits |= STAR_PAR;
    merged = prev.stars | bits;
    newStars = starBits(merged) - starBits(prev.stars);
  }
  const fatigue = replayFactor(save, key, date);
  const farm = [
    { label: 'Hops', amount: hops },
    { label: 'Star shards', amount: shards * 5 },
    { label: 'Clear bonus', amount: 10 + 2 * world },
  ];
  if (perfects) farm.push({ label: 'Perfect landings', amount: perfects * 3 });
  if (chains) farm.push({ label: 'Chain hops', amount: chains });
  if (coins) farm.push({ label: 'Coins', amount: coins * 2 });
  const breakdown = [...farm];
  const farmSum = farm.reduce((a, b) => a + b.amount, 0);
  const farmPaid = Math.round(farmSum * fatigue);
  if (farmPaid < farmSum) breakdown.push({ label: `Replay fatigue ×${fatigue}`, amount: farmPaid - farmSum });
  let bonus = 0;
  if (newStars > 0) {
    bonus += newStars * 15;
    breakdown.push({ label: 'New stars', amount: newStars * 15 });
  }
  const goldNew = !!result.gold && !save.gold.includes(key);
  if (goldNew) {
    save.gold.push(key);
    bonus += GOLD_REWARD;
    breakdown.push({ label: 'Gold shard!', amount: GOLD_REWARD });
  }
  let medal = false;
  if (mutator) {
    const had = save.medals[key] || 0;
    medal = !(had & mutator);
    if (medal) {
      save.medals[key] = had | mutator;
      save.stats.medals++;
      bonus += MEDAL_REWARD;
      breakdown.push({ label: 'New medal', amount: MEDAL_REWARD });
    }
  }
  const mul = dustMultiplier(save);
  const base = farmPaid + bonus;
  const dust = Math.round(base * mul);
  if (dust !== base) breakdown.push({ label: `Bonus ×${Math.round(mul * 100) / 100}`, amount: dust - base });
  earn(save, dust);
  countReplay(save, key, date);
  if (!mutator) {
    const best = prev.best == null ? time : Math.min(prev.best, time);
    save.levels[key] = { stars: merged, best, clears: prev.clears + 1 };
    if (result.ghost && (prev.best == null || time < prev.best || !save.ghosts[key])) save.ghosts[key] = { ...result.ghost, t: time };
  }
  save.stats.clears++;
  save.stats.hops += hops;
  save.stats.shards += shards;
  save.stats.perfects += perfects;
  save.stats.chains += chains;
  save.stats.coins += coins;
  save.stats.starsEarned += newStars;
  const xpUps = addXp(save, 20 + hops * 2 + perfects * 5 + newStars * 10 + (medal ? 30 : 0) + (goldNew ? 50 : 0));
  return { stars: bits, added: merged & ~prev.stars, newStars, total: merged, dust, breakdown, medal, goldNew, xpUps, worldRewards: syncWorldRewards(save), secret: syncSecretShip(save) };
}

/** Record a failed attempt (crash). Hops, shards and coins from the attempt still count toward stats. */
export function recordCrash(save, hops, shards, run = {}) {
  save.stats.crashes++;
  save.stats.hops += hops;
  save.stats.shards += shards;
  save.stats.perfects += run.perfects || 0;
  save.stats.coins += run.coins || 0;
  return addXp(save, hops * 2);
}

/** Per-run stats every mode reports (boost time, flips, bounces, near misses, revives). */
export function recordRunStats(save, run) {
  save.stats.boostTime = Math.round((save.stats.boostTime + (run.boostT || 0)) * 100) / 100;
  save.stats.flips += run.flips || 0;
  save.stats.bounces += run.bounces || 0;
  save.stats.nearMisses += run.nearMisses || 0;
  save.stats.revives += run.revives || 0;
}

export function recordEndless(save, score) {
  const best = score > save.stats.endlessBest;
  if (best) save.stats.endlessBest = score;
  save.stats.hops += score;
  earn(save, score);
  return { best, dust: score, xpUps: addXp(save, score) };
}

export function recordZen(save, score) {
  const best = score > save.stats.zenBest;
  if (best) save.stats.zenBest = score;
  save.stats.hops += score;
  const dust = Math.floor(score / 2);
  earn(save, dust);
  return { best, dust, xpUps: addXp(save, score) };
}

/** Daily challenge clear: pays once per calendar day. */
export function recordDaily(save, dateKey, hops) {
  save.stats.hops += hops;
  if (save.daily.challengeDone === dateKey) return { dust: 0, first: false, xpUps: addXp(save, hops) };
  save.daily.challengeDone = dateKey;
  save.stats.dailyClears++;
  earn(save, DAILY_CHALLENGE_REWARD);
  return { dust: DAILY_CHALLENGE_REWARD, first: true, xpUps: addXp(save, 50 + hops) };
}

/** Shard Hunt clear: pays on the first clear each day; keeps the day's best time. */
export function recordHunt(save, date, time) {
  const first = save.hunt.date !== date;
  const best = first || save.hunt.best == null || time < save.hunt.best;
  save.hunt = { date, best: best ? time : save.hunt.best };
  if (!first) return { dust: 0, first, best, xpUps: [] };
  save.stats.huntClears++;
  earn(save, HUNT_REWARD);
  return { dust: HUNT_REWARD, first, best, xpUps: addXp(save, 40) };
}

/** Time Attack: a world's 25 levels on one clock. */
export function recordAttack(save, world, time) {
  const prev = save.attack[world];
  const first = prev == null;
  const best = first || time < prev;
  if (best) save.attack[world] = time;
  save.stats.attackRuns++;
  const dust = first ? 200 + 20 * world : 30;
  earn(save, dust);
  return { dust, first, best, xpUps: addXp(save, 100) };
}

/* ---------------- Weekly event ---------------- */

/** ISO-8601 week key, e.g. 2026-W44. */
export function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** The trail this week's event awards. */
export function weeklyTrail(week) {
  return EVENT_TRAILS[Number(week.slice(-2)) % EVENT_TRAILS.length];
}

/** This week's event progress (a new week starts from stage 0). */
export function weeklyState(save, week) {
  if (save.weekly.week !== week) return { week, stage: 0, time: 0, done: false };
  return save.weekly;
}

/** Clear stage `stage` (0-based, must be the next one). Finishing all five awards the week's trail. */
export function recordWeekly(save, week, stage, time, stages = 5) {
  const st = weeklyState(save, week);
  if (st.done || stage !== st.stage) return { dust: 0, finished: false, trail: null, xpUps: [] };
  save.weekly = { week, stage: stage + 1, time: Math.round((st.time + time) * 10) / 10, done: stage + 1 >= stages };
  let dust = WEEKLY_STAGE_REWARD;
  let trail = null;
  if (save.weekly.done) {
    dust += WEEKLY_FINISH_REWARD;
    save.stats.weeklyDone++;
    trail = weeklyTrail(week);
    if (!save.trails.includes(trail)) save.trails.push(trail);
  }
  earn(save, dust);
  return { dust, finished: save.weekly.done, trail, xpUps: addXp(save, 40) };
}

/** Shareable result line for the weekly event (a leaderboard without a server). */
export function weeklyShareCode(save) {
  const w = save.weekly;
  const sum = hashSeed('wk', w.week, w.stage, w.time).toString(36).slice(0, 4).toUpperCase();
  return `STARHOP ${w.week} · ${w.stage}/5 stages · ${w.time.toFixed(1)}s · #${sum}`;
}

/* ---------------- Daily login reward ---------------- */

export function dateKey(d = new Date()) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function previousDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d - 1));
}

/** The streak day (1..7 position) and reward the player would get today, or null if already claimed. */
export function dailyOffer(save, today) {
  if (save.daily.lastClaim === today) return null;
  const streak = save.daily.lastClaim === previousDay(today) ? save.daily.streak + 1 : 1;
  const slot = (streak - 1) % DAILY_REWARDS.length;
  return { streak, slot, reward: DAILY_REWARDS[slot] };
}

export function claimDaily(save, today) {
  const offer = dailyOffer(save, today);
  if (!offer) return null;
  save.daily.lastClaim = today;
  save.daily.streak = offer.streak;
  save.stats.bestStreak = Math.max(save.stats.bestStreak, offer.streak);
  earn(save, offer.reward);
  return offer;
}

/* ---------------- Missions (three daily tasks) ---------------- */

export const MISSION_TYPES = {
  hops: { text: (m) => `Land ${m.target} hops`, sizes: [30, 60, 100], reward: [60, 90, 130] },
  shards: { text: (m) => `Collect ${m.target} star shards`, sizes: [6, 12, 20], reward: [60, 100, 150] },
  worldShards: { text: (m) => `Collect ${m.target} star shards in World ${m.world}`, sizes: [4, 8, 12], reward: [80, 120, 170] },
  clears: { text: (m) => `Clear ${m.target} levels`, sizes: [3, 5, 8], reward: [60, 90, 140] },
  perfects: { text: (m) => `Land ${m.target} perfect landings`, sizes: [3, 6, 10], reward: [70, 110, 160] },
  clean: { text: (m) => `Clear ${m.target} levels without a hazard hit`, sizes: [2, 4], reward: [80, 130] },
  threeStar: { text: (m) => `Get all 3 stars in one run on ${m.target} level${m.target > 1 ? 's' : ''}`, sizes: [1, 2, 3], reward: [70, 120, 170] },
  coins: { text: (m) => `Grab ${m.target} stardust coins`, sizes: [4, 8, 12], reward: [60, 100, 140] },
  boost: { text: (m) => `Boost for ${m.target} seconds in total`, sizes: [4, 8], reward: [60, 100] },
  chains: { text: (m) => `Chain ${m.target} hops (launch right after landing)`, sizes: [3, 6], reward: [80, 130] },
  endless: { text: (m) => `Reach ${m.target} in one Endless run`, sizes: [10, 20, 35], reward: [70, 120, 180], needs: isEndlessUnlocked },
  daily: { text: () => 'Clear the daily challenge', sizes: [1], reward: [90] },
};

export function missionText(m) {
  return MISSION_TYPES[m.type].text(m);
}

/** Today's missions (generated once per day from the date and the player's unlocks). */
export function missionsFor(save, date) {
  if (save.missions.date === date) return save.missions.list;
  const rng = makeRng(hashSeed('missions', date));
  const types = Object.keys(MISSION_TYPES).filter((t) => !MISSION_TYPES[t].needs || MISSION_TYPES[t].needs(save));
  const openWorlds = WORLDS.map((_, i) => i + 1).filter((w) => isWorldUnlocked(save, w));
  const list = [];
  while (list.length < 3) {
    const type = rng.pick(types);
    if (list.some((m) => m.type === type)) continue;
    const def = MISSION_TYPES[type];
    const size = rng.int(0, def.sizes.length - 1);
    list.push({ type, target: def.sizes[size], reward: def.reward[size], world: type === 'worldShards' ? rng.pick(openWorlds) : 0, progress: 0, claimed: false });
  }
  save.missions = { date, list };
  return list;
}

/**
 * Feed one finished run into today's missions.
 * run: { mode, world, hops, shards, perfects, coins, boostT, chains, cleared, stars (bits), hits, score }
 */
export function trackMissions(save, date, run) {
  const add = (type, n, pred = () => true) => {
    for (const m of missionsFor(save, date)) if (m.type === type && pred(m) && n > 0) m.progress = Math.min(m.target, m.progress + n);
  };
  add('hops', run.hops || 0);
  add('shards', run.shards || 0);
  add('worldShards', run.mode === 'level' ? run.shards || 0 : 0, (m) => m.world === run.world);
  add('perfects', run.perfects || 0);
  add('coins', run.coins || 0);
  add('boost', Math.floor(run.boostT || 0));
  add('chains', run.chains || 0);
  if (run.cleared && (run.mode === 'level' || run.mode === 'attack')) {
    add('clears', 1);
    if (!run.hits) add('clean', 1);
    if (run.stars === 7) add('threeStar', 1);
  }
  if (run.mode === 'daily' && run.cleared) add('daily', 1);
  if (run.mode === 'endless') {
    for (const m of missionsFor(save, date)) if (m.type === 'endless') m.progress = Math.max(m.progress, Math.min(m.target, run.score || 0));
  }
}

export function claimMission(save, date, i) {
  const m = missionsFor(save, date)[i];
  if (!m || m.claimed || m.progress < m.target) return null;
  m.claimed = true;
  save.stats.missions++;
  earn(save, m.reward);
  return { dust: m.reward, xpUps: addXp(save, 40) };
}

export function claimableMissions(save, date) {
  return missionsFor(save, date).filter((m) => !m.claimed && m.progress >= m.target).length;
}

/* ---------------- Star chests ---------------- */

/** Chests earned: one per STARS_PER_CHEST stars ever earned (ascending keeps them), minus those opened. */
export function chestsAvailable(save) {
  return Math.max(0, Math.floor(save.stats.starsEarned / STARS_PER_CHEST) - save.stats.chests);
}

/** Open a chest: a paint job for an owned ship (if any left) or a stardust bundle. Deterministic per chest number. */
export function openChest(save) {
  if (chestsAvailable(save) <= 0) return null;
  const rng = makeRng(hashSeed('chest', save.stats.chests));
  save.stats.chests++;
  const missing = [];
  for (const id of save.ships) for (const p of PAINTS) if (p.id !== 'base' && !(save.paints[id] || []).includes(p.id)) missing.push([id, p.id]);
  if (missing.length && rng.chance(0.4)) {
    const [shipId, paintId] = rng.pick(missing);
    (save.paints[shipId] || (save.paints[shipId] = [])).push(paintId);
    return { kind: 'paint', ship: shipId, paint: paintId };
  }
  const dust = 100 + 20 * rng.int(0, 10);
  earn(save, dust);
  return { kind: 'dust', dust };
}

/* ---------------- World rewards, gold, secret ship ---------------- */

/** Fully starred worlds unlock their aurora trail. Returns the trail ids unlocked just now. */
export function syncWorldRewards(save) {
  const unlocked = [];
  for (let w = 1; w <= WORLDS.length; w++) {
    const id = `world${w}`;
    if (!save.trails.includes(id) && isWorldComplete(save, w)) {
      save.trails.push(id);
      unlocked.push(id);
    }
  }
  return unlocked;
}

/** Menu themes available: 0 (default) plus every fully starred world (its trail is the proof). */
export function menuThemes(save) {
  return [0, ...WORLDS.map((_, i) => i + 1).filter((w) => save.trails.includes(`world${w}`))];
}

/** Collecting every world's gold shard unlocks the secret ship. Returns true when unlocked just now. */
export function syncSecretShip(save) {
  if (save.gold.length >= WORLDS.length && !save.ships.includes('aurum')) {
    save.ships.push('aurum');
    return true;
  }
  return false;
}

/* ---------------- Codex ---------------- */

export const CODEX = [
  { id: 'planet', name: 'Planet', lore: 'Every world starts with a rock to circle. Tap to leave its orbit along the tangent.' },
  { id: 'ringed', name: 'Ringed Planet', lore: 'Pretty rings, same rules. The dashed circle is the orbit you land in, not the rings.' },
  { id: 'portal', name: 'Portal', lore: 'The swirl at the top of every level. Land in its ring to clear.' },
  { id: 'shard', name: 'Star Shard', lore: 'Three per level, always on a flight the bot really flew. Grab all three for a star.' },
  { id: 'coin', name: 'Stardust Coin', lore: 'Small change on the risky line. Worth 2 stardust each, if you dare take that launch.' },
  { id: 'gold', name: 'Gold Shard', lore: 'One per world, far off the safe path. Find all of them and something golden wakes up.' },
  { id: 'drifter', name: 'Drifting Planet', lore: 'Slides side to side forever. Lead your shot.' },
  { id: 'asteroid', name: 'Asteroid', lore: 'Streaks across the gaps and wraps around the edges. A shield takes one hit.' },
  { id: 'moon', name: 'Rock Moon', lore: 'Circles just outside a ring, crossing every launch path.' },
  { id: 'laser', name: 'Laser Gate', lore: 'Blinks on and off. It flickers just before switching on.' },
  { id: 'crumbler', name: 'Crumbling Planet', lore: 'Starts breaking the moment you land. The arc shows how long you have.' },
  { id: 'hole', name: 'Black Hole', lore: 'Bends every flight that passes. Its core is always fatal.' },
  { id: 'warp', name: 'Wormhole', lore: 'Fall in one mouth, fly out the other, heading unchanged.' },
  { id: 'giant', name: 'Giant Planet', lore: 'So heavy it pulls your flight toward it. Use the curve.' },
  { id: 'bounce', name: 'Bounce Wall', lore: 'In the Pinball Rim the edges push back. Bank your shots.' },
  { id: 'boss', name: 'Boss Portal', lore: 'Level 25 of every world: a drifting portal, guarded by circling rocks.' },
];

/** Codex entries present in a level. */
export function codexKinds(level) {
  const ids = ['planet', 'shard'];
  if (level.planets.some((p) => p.ring)) ids.push('ringed');
  if (level.planets.some((p) => p.goal)) ids.push('portal');
  if (level.coins && level.coins.length) ids.push('coin');
  if (level.gold) ids.push('gold');
  if (level.planets.some((p) => p.mx && !p.goal)) ids.push('drifter');
  if (level.asteroids.some((a) => a.kind !== 'spin')) ids.push('asteroid');
  if (level.asteroids.some((a) => a.kind === 'spin')) ids.push('moon');
  if (level.lasers.length) ids.push('laser');
  if (level.planets.some((p) => p.crumble)) ids.push('crumbler');
  if (level.holes.length) ids.push('hole');
  if (level.warps.length) ids.push('warp');
  if (level.planets.some((p) => p.g)) ids.push('giant');
  if (level.bounce) ids.push('bounce');
  if (level.boss) ids.push('boss');
  return ids;
}

/** Mark entries as discovered. Each new one pays CODEX_REWARD. Returns the new entries. */
export function discover(save, ids) {
  const fresh = CODEX.filter((c) => ids.includes(c.id) && !save.codex.includes(c.id));
  for (const c of fresh) {
    save.codex.push(c.id);
    earn(save, CODEX_REWARD);
  }
  return fresh;
}

/* ---------------- Shop ---------------- */

function catalog(kind) {
  return kind === 'ship' ? SHIPS : TRAILS;
}

function owned(save, kind) {
  return kind === 'ship' ? save.ships : save.trails;
}

/** Buy a ship or trail. Returns null on success, or an error string. */
export function buyItem(save, kind, id) {
  const item = catalog(kind).find((x) => x.id === id);
  if (!item) return 'unknown';
  if (owned(save, kind).includes(id)) return 'owned';
  if (item.price == null) return 'locked';
  if (save.dust < item.price) return 'poor';
  save.dust -= item.price;
  owned(save, kind).push(id);
  return null;
}

export function equipItem(save, kind, id) {
  if (!owned(save, kind).includes(id)) return 'locked';
  if (kind === 'ship') save.ship = id;
  else save.trail = id;
  return null;
}

export function upgradePrice(save, id) {
  const up = UPGRADES.find((u) => u.id === id);
  const lvl = save.upgrades[id];
  return lvl < up.prices.length ? up.prices[lvl] : null;
}

export function buyUpgrade(save, id) {
  const up = UPGRADES.find((u) => u.id === id);
  if (!up) return 'unknown';
  const price = upgradePrice(save, id);
  if (price == null) return 'max';
  if (save.dust < price) return 'poor';
  save.dust -= price;
  save.upgrades[id]++;
  return null;
}

/* ---------------- Achievements ---------------- */

function threeStarCount(save) {
  let n = 0;
  for (const key in save.levels) if (save.levels[key].stars === 7) n++;
  return n;
}

function unlockedWorlds(save) {
  let n = 0;
  for (let w = 1; w <= WORLDS.length; w++) if (isWorldUnlocked(save, w)) n++;
  return n;
}

const maxedUpgrades = (s) => UPGRADES.filter((u) => s.upgrades[u.id] >= u.prices.length).length;
const buyableShips = SHIPS.filter((s) => !s.secret).length;

export const ACHIEVEMENTS = [
  { id: 'hop1', name: 'Liftoff', desc: 'Land your first hop.', target: 1, reward: 20, value: (s) => s.stats.hops },
  { id: 'hop100', name: 'Frequent Flyer', desc: 'Land 100 hops.', target: 100, reward: 50, value: (s) => s.stats.hops },
  { id: 'hop1000', name: 'Orbit Addict', desc: 'Land 1,000 hops.', target: 1000, reward: 200, value: (s) => s.stats.hops },
  { id: 'hop5000', name: 'Light-Year Legend', desc: 'Land 5,000 hops.', target: 5000, reward: 600, value: (s) => s.stats.hops },
  { id: 'shard10', name: 'Shiny!', desc: 'Collect 10 star shards.', target: 10, reward: 40, value: (s) => s.stats.shards },
  { id: 'shard150', name: 'Shard Hoarder', desc: 'Collect 150 star shards.', target: 150, reward: 150, value: (s) => s.stats.shards },
  { id: 'shard500', name: 'Shard Dragon', desc: 'Collect 500 star shards.', target: 500, reward: 400, value: (s) => s.stats.shards },
  { id: 'clear1', name: 'Cadet', desc: 'Clear a level.', target: 1, reward: 20, value: (s) => s.stats.clears },
  { id: 'clear25', name: 'Pilot', desc: 'Clear 25 levels (replays count).', target: 25, reward: 100, value: (s) => s.stats.clears },
  { id: 'clear100', name: 'Ace', desc: 'Clear 100 levels (replays count).', target: 100, reward: 300, value: (s) => s.stats.clears },
  { id: 'all200', name: 'Star Sailor', desc: `Clear all ${TOTAL_LEVELS} levels.`, target: TOTAL_LEVELS, reward: 1000, value: (s) => Object.values(s.levels).filter((r) => r.stars & STAR_CLEAR).length },
  { id: 'perfect10', name: 'Perfectionist', desc: 'Get 3 stars on 10 levels.', target: 10, reward: 100, value: threeStarCount },
  { id: 'perfect100', name: 'Flawless', desc: 'Get 3 stars on 100 levels.', target: 100, reward: 500, value: threeStarCount },
  { id: 'stars150', name: 'Star Collector', desc: 'Own 150 stars.', target: 150, reward: 250, value: totalStars },
  { id: 'stars400', name: 'Constellation', desc: 'Own 400 stars.', target: 400, reward: 600, value: totalStars },
  { id: 'stars600', name: 'Galaxy Brain', desc: `Own all ${TOTAL_STARS} stars.`, target: TOTAL_STARS, reward: 1500, value: totalStars },
  { id: 'crash50', name: 'Crash Test Dummy', desc: 'Crash 50 times.', target: 50, reward: 50, value: (s) => s.stats.crashes },
  { id: 'crash500', name: 'Never Give Up', desc: 'Crash 500 times.', target: 500, reward: 150, value: (s) => s.stats.crashes },
  { id: 'endless25', name: 'Endless Rookie', desc: 'Reach 25 in Endless.', target: 25, reward: 100, value: (s) => s.stats.endlessBest },
  { id: 'endless75', name: 'Endless Veteran', desc: 'Reach 75 in Endless.', target: 75, reward: 300, value: (s) => s.stats.endlessBest },
  { id: 'endless150', name: 'Endless Myth', desc: 'Reach 150 in Endless.', target: 150, reward: 800, value: (s) => s.stats.endlessBest },
  { id: 'ships5', name: 'Hangar', desc: 'Own 5 ships.', target: 5, reward: 150, value: (s) => s.ships.length },
  { id: 'ships12', name: 'Fleet Admiral', desc: 'Buy every ship in the shop.', target: buyableShips, reward: 800, value: (s) => s.ships.filter((id) => !shipById(id).secret).length },
  { id: 'trails4', name: 'Fashionista', desc: 'Own 4 trails.', target: 4, reward: 120, value: (s) => s.trails.length },
  { id: 'upgrades', name: 'Fully Loaded', desc: 'Max out every upgrade.', target: UPGRADES.length, reward: 500, value: maxedUpgrades },
  { id: 'streak7', name: 'Daily Devotee', desc: 'Reach a 7-day login streak.', target: 7, reward: 300, value: (s) => s.stats.bestStreak },
  { id: 'daily10', name: 'Challenger', desc: 'Clear 10 daily challenges.', target: 10, reward: 300, value: (s) => s.stats.dailyClears },
  { id: 'worlds8', name: 'World Tourist', desc: `Unlock all ${WORLDS.length} worlds.`, target: WORLDS.length, reward: 400, value: unlockedWorlds },
  { id: 'gold1', name: 'Prospector', desc: 'Find a gold shard.', target: 1, reward: 100, value: (s) => s.gold.length },
  { id: 'goldAll', name: 'Midas Touch', desc: `Find all ${WORLDS.length} gold shards.`, target: WORLDS.length, reward: 600, value: (s) => s.gold.length },
  { id: 'perfects50', name: 'Bullseye', desc: 'Land 50 perfect landings.', target: 50, reward: 150, value: (s) => s.stats.perfects },
  { id: 'chains25', name: 'Chain Reaction', desc: 'Chain 25 hops.', target: 25, reward: 150, value: (s) => s.stats.chains },
  { id: 'bounces50', name: 'Pinball Wizard', desc: 'Bounce off 50 walls.', target: 50, reward: 150, value: (s) => s.stats.bounces },
  { id: 'medals10', name: 'Remixer', desc: 'Earn 10 mutator medals.', target: 10, reward: 200, value: (s) => s.stats.medals },
  { id: 'medals100', name: 'Mutator Master', desc: 'Earn 100 mutator medals.', target: 100, reward: 700, value: (s) => s.stats.medals },
  { id: 'missions15', name: 'Taskmaster', desc: 'Complete 15 missions.', target: 15, reward: 250, value: (s) => s.stats.missions },
  { id: 'codexAll', name: 'Cartographer', desc: 'Discover every codex entry.', target: CODEX.length, reward: 300, value: (s) => s.codex.length },
  { id: 'chests10', name: 'Treasure Hunter', desc: 'Open 10 star chests.', target: 10, reward: 200, value: (s) => s.stats.chests },
  { id: 'pilot20', name: 'Veteran Pilot', desc: 'Reach pilot level 20.', target: 20, reward: 400, value: (s) => pilotLevel(s.xp).level },
  { id: 'hunt5', name: 'Shard Hunter', desc: 'Win 5 Shard Hunts.', target: 5, reward: 200, value: (s) => s.stats.huntClears },
  { id: 'weekly1', name: 'Event Hero', desc: 'Finish a weekly event.', target: 1, reward: 200, value: (s) => s.stats.weeklyDone },
  { id: 'attack3', name: 'Speedrunner', desc: 'Finish 3 Time Attack runs.', target: 3, reward: 250, value: (s) => s.stats.attackRuns },
  { id: 'zen100', name: 'Inner Peace', desc: 'Reach 100 in Zen.', target: 100, reward: 150, value: (s) => s.stats.zenBest },
  { id: 'ascend1', name: 'Ascended', desc: 'Ascend once (New Game+).', target: 1, reward: 1000, value: (s) => s.prestige },
];

export function achievementState(save, a) {
  const value = Math.min(a.target, a.value(save));
  return { value, done: value >= a.target, claimed: !!save.claimed[a.id] };
}

export function claimAchievement(save, id) {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a) return null;
  const st = achievementState(save, a);
  if (!st.done || st.claimed) return null;
  save.claimed[id] = true;
  earn(save, a.reward);
  return a.reward;
}

export function claimableCount(save) {
  return ACHIEVEMENTS.filter((a) => {
    const st = achievementState(save, a);
    return st.done && !st.claimed;
  }).length;
}
