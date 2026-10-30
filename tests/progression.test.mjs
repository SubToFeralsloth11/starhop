import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACHIEVEMENTS,
  DAILY_CHALLENGE_REWARD,
  DAILY_REWARDS,
  SAVE_KEY,
  SHIPS,
  UPGRADES,
  buyItem,
  buyUpgrade,
  claimAchievement,
  claimDaily,
  dailyOffer,
  defaultSave,
  equipItem,
  isEndlessUnlocked,
  isLevelUnlocked,
  isWorldUnlocked,
  loadSave,
  nextLevel,
  normalizeSave,
  recordClear,
  recordDaily,
  totalStars,
  worldLock,
} from '../js/progression.js';
import { WORLD_STAR_REQ } from '../js/worlds.js';

function clearWorld(save, w, shards = 0, time = 99, par = 10) {
  for (let i = 1; i <= 25; i++) recordClear(save, { world: w, index: i, shards, time, par, hops: 5 });
}

test('levels unlock one after another and worlds need the previous finale plus stars', () => {
  const s = defaultSave();
  assert.ok(isLevelUnlocked(s, 1, 1));
  assert.ok(!isLevelUnlocked(s, 1, 2));
  recordClear(s, { world: 1, index: 1, shards: 0, time: 99, par: 10, hops: 3 });
  assert.ok(isLevelUnlocked(s, 1, 2));

  clearWorld(s, 1); // 25 levels with one star each = 25 stars < 35
  assert.equal(totalStars(s), 25);
  assert.ok(!isWorldUnlocked(s, 2), 'finale cleared but too few stars');
  assert.deepEqual(worldLock(s, 2), { prevDone: true, needStars: WORLD_STAR_REQ[1], have: 25 });

  for (let i = 1; i <= 10; i++) recordClear(s, { world: 1, index: i, shards: 3, time: 99, par: 10, hops: 3 });
  assert.equal(totalStars(s), 35);
  assert.ok(isWorldUnlocked(s, 2));
  assert.ok(isLevelUnlocked(s, 2, 1));

  const starsOnly = defaultSave();
  for (let i = 1; i <= 24; i++) recordClear(starsOnly, { world: 1, index: i, shards: 3, time: 1, par: 10, hops: 3 });
  assert.ok(totalStars(starsOnly) >= 35);
  assert.ok(!isWorldUnlocked(starsOnly, 2), 'stars alone are not enough without clearing 1-25');
});

test('stars accumulate across runs and only new stars pay the star bonus', () => {
  const s = defaultSave();
  const a = recordClear(s, { world: 1, index: 1, shards: 3, time: 50, par: 10, hops: 4 });
  assert.equal(a.newStars, 2);
  assert.equal(a.dust, 4 + 15 + 12 + 30);
  const b = recordClear(s, { world: 1, index: 1, shards: 0, time: 5, par: 10, hops: 4 });
  assert.equal(b.newStars, 1, 'the par star is new even though shards were missed this time');
  assert.equal(b.total, 7);
  const c = recordClear(s, { world: 1, index: 1, shards: 3, time: 5, par: 10, hops: 4 });
  assert.equal(c.newStars, 0);
  assert.ok(!c.breakdown.some((x) => x.label === 'New stars'));
  assert.equal(s.levels['1-1'].best, 5);
  assert.equal(s.levels['1-1'].clears, 3);
});

test('next level points at the first uncleared level of the furthest open world', () => {
  const s = defaultSave();
  assert.deepEqual(nextLevel(s), { world: 1, index: 1 });
  clearWorld(s, 1, 3, 1, 10);
  assert.deepEqual(nextLevel(s), { world: 2, index: 1 });
  assert.ok(isEndlessUnlocked(s));
});

test('shop purchases spend stardust, refuse when poor or owned, and equip only owned items', () => {
  const s = defaultSave();
  const dart = SHIPS.find((x) => x.id === 'dart');
  assert.equal(equipItem(s, 'ship', 'dart'), 'locked');
  assert.equal(buyItem(s, 'ship', 'dart'), 'poor');
  s.dust = dart.price + 5;
  assert.equal(buyItem(s, 'ship', 'dart'), null);
  assert.equal(s.dust, 5);
  assert.equal(buyItem(s, 'ship', 'dart'), 'owned');
  assert.equal(equipItem(s, 'ship', 'dart'), null);
  assert.equal(s.ship, 'dart');
});

test('upgrades follow their price ladder and stop at max level', () => {
  const s = defaultSave();
  const shield = UPGRADES.find((u) => u.id === 'shield');
  s.dust = shield.prices.reduce((a, b) => a + b, 0);
  for (const price of shield.prices) {
    const before = s.dust;
    assert.equal(buyUpgrade(s, 'shield'), null);
    assert.equal(before - s.dust, price);
  }
  assert.equal(s.upgrades.shield, shield.prices.length);
  assert.equal(buyUpgrade(s, 'shield'), 'max');
});

test('daily reward streak grows on consecutive days, resets after a gap, and pays once per day', () => {
  const s = defaultSave();
  assert.equal(claimDaily(s, '2026-01-30').reward, DAILY_REWARDS[0]);
  assert.equal(dailyOffer(s, '2026-01-30'), null);
  assert.equal(claimDaily(s, '2026-01-30'), null);
  const day2 = claimDaily(s, '2026-01-31');
  assert.equal(day2.streak, 2);
  assert.equal(day2.reward, DAILY_REWARDS[1]);
  assert.equal(claimDaily(s, '2026-02-01').streak, 3, 'month boundary counts as consecutive');
  const afterGap = claimDaily(s, '2026-02-03');
  assert.equal(afterGap.streak, 1);
  assert.equal(afterGap.reward, DAILY_REWARDS[0]);
});

test('the streak cycles back to day one rewards after a week', () => {
  const s = defaultSave();
  for (let d = 1; d <= 7; d++) claimDaily(s, `2026-03-0${d}`);
  const eighth = claimDaily(s, '2026-03-08');
  assert.equal(eighth.streak, 8);
  assert.equal(eighth.reward, DAILY_REWARDS[0]);
  assert.equal(s.stats.bestStreak, 8);
});

test('daily challenge pays its reward only on the first clear of the day', () => {
  const s = defaultSave();
  assert.deepEqual(recordDaily(s, '2026-04-01', 9), { dust: DAILY_CHALLENGE_REWARD, first: true });
  assert.deepEqual(recordDaily(s, '2026-04-01', 9), { dust: 0, first: false });
  assert.equal(recordDaily(s, '2026-04-02', 9).first, true);
  assert.equal(s.stats.dailyClears, 2);
});

test('achievements can be claimed once, only after completion', () => {
  const s = defaultSave();
  assert.ok(ACHIEVEMENTS.length >= 20);
  assert.equal(claimAchievement(s, 'clear1'), null);
  recordClear(s, { world: 1, index: 1, shards: 0, time: 99, par: 10, hops: 3 });
  const reward = ACHIEVEMENTS.find((a) => a.id === 'clear1').reward;
  const before = s.dust;
  assert.equal(claimAchievement(s, 'clear1'), reward);
  assert.equal(s.dust - before, reward);
  assert.equal(claimAchievement(s, 'clear1'), null);
});

test('corrupt or foreign saves fall back to safe defaults', () => {
  assert.deepEqual(normalizeSave(null), defaultSave());
  assert.deepEqual(normalizeSave({ v: 99, dust: 5 }), defaultSave());
  const partial = normalizeSave({ v: 1, dust: -4, ship: 'ghost', ships: ['dart'], settings: { music: false } });
  assert.equal(partial.dust, 0);
  assert.deepEqual(partial.ships, ['comet', 'dart'], 'owned ships survive, comet is always owned');
  assert.equal(partial.ship, 'comet');
  assert.equal(partial.settings.music, false);
  assert.equal(partial.settings.sfx, true);

  const broken = { getItem: () => '{not json' };
  assert.deepEqual(loadSave(broken), defaultSave());
  const throwing = {
    getItem: () => {
      throw new Error('denied');
    },
  };
  assert.deepEqual(loadSave(throwing), defaultSave());
  const store = new Map([[SAVE_KEY, JSON.stringify({ ...defaultSave(), dust: 77 })]]);
  assert.equal(loadSave({ getItem: (k) => store.get(k) }).dust, 77);
});

test('corrupted fields inside an otherwise valid save are dropped without losing good progress', () => {
  const s = normalizeSave({
    v: 1,
    dust: 120,
    levels: { '1-1': null, '1-2': { stars: 'x' }, '1-3': { stars: 7, best: 4.2, clears: 2 }, bogus: { stars: 1 } },
    stats: { hops: 'many', crashes: 3 },
    upgrades: { shield: 99, magnet: -1 },
    daily: { lastClaim: 12, streak: 3 },
    claimed: { clear1: true, nope: true },
  });
  assert.deepEqual(Object.keys(s.levels), ['1-3']);
  assert.equal(totalStars(s), 3);
  assert.equal(s.dust, 120);
  assert.equal(s.stats.hops, 0);
  assert.equal(s.stats.crashes, 3);
  assert.equal(s.upgrades.shield, UPGRADES.find((u) => u.id === 'shield').prices.length);
  assert.equal(s.upgrades.magnet, 0);
  assert.equal(s.daily.lastClaim, null);
  assert.deepEqual(s.claimed, { clear1: true });
});
