// Save data and every progression rule (unlocks, rewards, shop, achievements, daily). Pure: no DOM.
import { LEVELS_PER_WORLD, WORLDS, WORLD_STAR_REQ } from './worlds.js';

export const SAVE_KEY = 'starhop.save.v1';
export const SAVE_VERSION = 1;

export const STAR_CLEAR = 1;
export const STAR_SHARDS = 2;
export const STAR_PAR = 4;

export const SHIPS = [
  { id: 'comet', name: 'Comet', price: 0, color: '#7df9ff', accent: '#ffffff', shape: 'arrow' },
  { id: 'dart', name: 'Dart', price: 100, color: '#ff5c8a', accent: '#ffd1e0', shape: 'dart' },
  { id: 'manta', name: 'Manta', price: 200, color: '#5cffb1', accent: '#d7fff0', shape: 'manta' },
  { id: 'saucer', name: 'Saucer', price: 350, color: '#c3a6ff', accent: '#ffffff', shape: 'saucer' },
  { id: 'phoenix', name: 'Phoenix', price: 500, color: '#ff9b3d', accent: '#ffe08a', shape: 'phoenix' },
  { id: 'beetle', name: 'Beetle', price: 700, color: '#3dff6e', accent: '#0b3d1a', shape: 'beetle' },
  { id: 'needle', name: 'Needle', price: 950, color: '#f2f2f2', accent: '#ff3d6e', shape: 'needle' },
  { id: 'crown', name: 'Crown', price: 1250, color: '#ffd23f', accent: '#fff6c2', shape: 'crown' },
  { id: 'hammer', name: 'Hammerhead', price: 1600, color: '#3d8bff', accent: '#bcd6ff', shape: 'hammer' },
  { id: 'specter', name: 'Specter', price: 2000, color: '#b8fff4', accent: '#4dffe1', shape: 'specter' },
  { id: 'nova', name: 'Nova', price: 2500, color: '#ff3df5', accent: '#ffe3fd', shape: 'nova' },
  { id: 'singularity', name: 'Singularity', price: 3200, color: '#1a1a2e', accent: '#ffd23f', shape: 'orb' },
];

export const TRAILS = [
  { id: 'basic', name: 'Stardust', price: 0, colors: ['#9fe8ff'], style: 'line' },
  { id: 'ember', name: 'Ember', price: 150, colors: ['#ffdf6b', '#ff7a2f', '#ff2f4f'], style: 'fire' },
  { id: 'aqua', name: 'Aqua', price: 300, colors: ['#5cfff1', '#2f8bff'], style: 'bubbles' },
  { id: 'rainbow', name: 'Rainbow', price: 500, colors: ['#ff4d4d', '#ffb84d', '#fff24d', '#4dff88', '#4dc3ff', '#b84dff'], style: 'rainbow' },
  { id: 'sparkle', name: 'Sparkle', price: 750, colors: ['#ffffff', '#fff3a8'], style: 'sparkle' },
  { id: 'plasma', name: 'Plasma', price: 1000, colors: ['#ff3df5', '#7a3dff'], style: 'zigzag' },
  { id: 'ghost', name: 'Ghost', price: 1400, colors: ['#e6fffb'], style: 'echo' },
  { id: 'starlight', name: 'Starlight', price: 2000, colors: ['#ffd23f', '#ffffff', '#7df9ff'], style: 'stars' },
];

export const UPGRADES = [
  { id: 'magnet', name: 'Magnet', desc: 'Grab star shards from farther away.', prices: [150, 350, 700, 1200, 1900] },
  { id: 'guide', name: 'Guide', desc: 'Longer aim line.', prices: [120, 300, 600, 1000, 1600] },
  { id: 'shield', name: 'Shield', desc: 'Absorb asteroid and laser hits each attempt.', prices: [500, 1500, 3500] },
];

export const DAILY_REWARDS = [50, 75, 100, 150, 200, 300, 500];
export const DAILY_CHALLENGE_REWARD = 100;

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
    upgrades: { magnet: 0, guide: 0, shield: 0 },
    claimed: {}, // achievement id -> true
    stats: { hops: 0, shards: 0, clears: 0, crashes: 0, launches: 0, endlessBest: 0, dailyClears: 0, bestStreak: 0, dustEarned: 0 },
    daily: { lastClaim: null, streak: 0, challengeDone: null },
    settings: { music: true, sfx: true, haptics: true, reduced: false },
    tutorialDone: false,
    lastWorld: 1,
  };
}

/** Merge a parsed save onto defaults so missing/new fields never crash. Invalid data yields defaults. */
export function normalizeSave(raw) {
  const base = defaultSave();
  if (!raw || typeof raw !== 'object' || raw.v !== SAVE_VERSION) return base;
  const out = { ...base, ...raw };
  out.stats = { ...base.stats, ...(raw.stats || {}) };
  out.daily = { ...base.daily, ...(raw.daily || {}) };
  out.settings = { ...base.settings, ...(raw.settings || {}) };
  out.upgrades = { ...base.upgrades, ...(raw.upgrades || {}) };
  out.levels = raw.levels && typeof raw.levels === 'object' ? raw.levels : {};
  out.claimed = raw.claimed && typeof raw.claimed === 'object' ? raw.claimed : {};
  out.ships = Array.isArray(raw.ships) && raw.ships.includes('comet') ? raw.ships : ['comet'];
  out.trails = Array.isArray(raw.trails) && raw.trails.includes('basic') ? raw.trails : ['basic'];
  if (!out.ships.includes(out.ship)) out.ship = 'comet';
  if (!out.trails.includes(out.trail)) out.trail = 'basic';
  if (!Number.isFinite(out.dust) || out.dust < 0) out.dust = 0;
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

/**
 * Record a finished campaign level. Stars accumulate across runs (best of each kind is kept).
 * result: { world, index, shards (count), time, par, hops }
 * Returns { stars (this run bitmask), newStars (count), total (bitmask after), dust, breakdown }.
 */
export function recordClear(save, result) {
  const { world, index, shards, time, par, hops } = result;
  const key = levelKey(world, index);
  const prev = save.levels[key] || { stars: 0, best: null, clears: 0 };
  let bits = STAR_CLEAR;
  if (shards >= 3) bits |= STAR_SHARDS;
  if (time <= par) bits |= STAR_PAR;
  const merged = prev.stars | bits;
  const newStars = starBits(merged) - starBits(prev.stars);
  const breakdown = [
    { label: 'Hops', amount: hops },
    { label: 'Star shards', amount: shards * 5 },
    { label: 'Clear bonus', amount: 10 + 2 * world },
  ];
  if (newStars > 0) breakdown.push({ label: 'New stars', amount: newStars * 15 });
  const dust = breakdown.reduce((a, b) => a + b.amount, 0);
  earn(save, dust);
  save.levels[key] = { stars: merged, best: prev.best == null ? time : Math.min(prev.best, time), clears: prev.clears + 1 };
  save.stats.clears++;
  save.stats.hops += hops;
  save.stats.shards += shards;
  return { stars: bits, newStars, total: merged, dust, breakdown };
}

/** Record a failed attempt (crash). Hops and shards from the attempt still count toward stats. */
export function recordCrash(save, hops, shards) {
  save.stats.crashes++;
  save.stats.hops += hops;
  save.stats.shards += shards;
}

export function recordEndless(save, score) {
  const best = score > save.stats.endlessBest;
  if (best) save.stats.endlessBest = score;
  save.stats.hops += score;
  earn(save, score);
  return { best, dust: score };
}

/** Daily challenge clear: pays once per calendar day. */
export function recordDaily(save, dateKey, hops) {
  save.stats.hops += hops;
  if (save.daily.challengeDone === dateKey) return { dust: 0, first: false };
  save.daily.challengeDone = dateKey;
  save.stats.dailyClears++;
  earn(save, DAILY_CHALLENGE_REWARD);
  return { dust: DAILY_CHALLENGE_REWARD, first: true };
}

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
  { id: 'all200', name: 'Star Sailor', desc: 'Clear all 200 levels.', target: 200, reward: 1000, value: (s) => Object.values(s.levels).filter((r) => r.stars & STAR_CLEAR).length },
  { id: 'perfect10', name: 'Perfectionist', desc: 'Get 3 stars on 10 levels.', target: 10, reward: 100, value: threeStarCount },
  { id: 'perfect100', name: 'Flawless', desc: 'Get 3 stars on 100 levels.', target: 100, reward: 500, value: threeStarCount },
  { id: 'stars150', name: 'Star Collector', desc: 'Own 150 stars.', target: 150, reward: 250, value: totalStars },
  { id: 'stars400', name: 'Constellation', desc: 'Own 400 stars.', target: 400, reward: 600, value: totalStars },
  { id: 'stars600', name: 'Galaxy Brain', desc: 'Own all 600 stars.', target: 600, reward: 1500, value: totalStars },
  { id: 'crash50', name: 'Crash Test Dummy', desc: 'Crash 50 times.', target: 50, reward: 50, value: (s) => s.stats.crashes },
  { id: 'crash500', name: 'Never Give Up', desc: 'Crash 500 times.', target: 500, reward: 150, value: (s) => s.stats.crashes },
  { id: 'endless25', name: 'Endless Rookie', desc: 'Reach 25 in Endless.', target: 25, reward: 100, value: (s) => s.stats.endlessBest },
  { id: 'endless75', name: 'Endless Veteran', desc: 'Reach 75 in Endless.', target: 75, reward: 300, value: (s) => s.stats.endlessBest },
  { id: 'endless150', name: 'Endless Myth', desc: 'Reach 150 in Endless.', target: 150, reward: 800, value: (s) => s.stats.endlessBest },
  { id: 'ships5', name: 'Hangar', desc: 'Own 5 ships.', target: 5, reward: 150, value: (s) => s.ships.length },
  { id: 'ships12', name: 'Fleet Admiral', desc: 'Own every ship.', target: SHIPS.length, reward: 800, value: (s) => s.ships.length },
  { id: 'trails4', name: 'Fashionista', desc: 'Own 4 trails.', target: 4, reward: 120, value: (s) => s.trails.length },
  { id: 'upgrades', name: 'Fully Loaded', desc: 'Max out every upgrade.', target: UPGRADES.length, reward: 500, value: maxedUpgrades },
  { id: 'streak7', name: 'Daily Devotee', desc: 'Reach a 7-day login streak.', target: 7, reward: 300, value: (s) => s.stats.bestStreak },
  { id: 'daily10', name: 'Challenger', desc: 'Clear 10 daily challenges.', target: 10, reward: 300, value: (s) => s.stats.dailyClears },
  { id: 'worlds8', name: 'World Tourist', desc: 'Unlock all 8 worlds.', target: 8, reward: 400, value: unlockedWorlds },
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
