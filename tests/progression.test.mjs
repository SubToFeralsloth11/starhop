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
  const first = recordDaily(s, '2026-04-01', 9);
  assert.deepEqual([first.dust, first.first], [DAILY_CHALLENGE_REWARD, true]);
  const again = recordDaily(s, '2026-04-01', 9);
  assert.deepEqual([again.dust, again.first], [0, false]);
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

test('save records for levels that do not exist are dropped and never count as stars', () => {
  const rec = { stars: 7, best: 3, clears: 1 };
  const s = normalizeSave({ v: 1, levels: { '99-99': rec, '0-0': rec, '1-26': rec, '11-1': rec, '01-1': rec, '1-1': { stars: 6, clears: 1 }, '10-25': rec, '1-2': rec } });
  assert.deepEqual(Object.keys(s.levels).sort(), ['1-2', '10-25']);
  assert.equal(totalStars(s), 6);
});

import * as P from '../js/progression.js';

const clear = (s, w, i, extra = {}) => P.recordClear(s, { world: w, index: i, shards: 0, time: 99, par: 10, hops: 5, date: '2026-04-01', ...extra });

test('replaying one level pays full stardust three times a day, then less and less, and a new day resets it', () => {
  const s = defaultSave();
  const pays = [1, 2, 3, 4, 5, 6].map(() => clear(s, 1, 1).dust);
  // First clear also pays the new-star bonus; replays 2-3 pay the same farmable amount.
  assert.equal(pays[1], pays[2]);
  assert.ok(pays[3] < pays[2] && pays[4] < pays[3] && pays[5] < pays[4]);
  assert.ok(clear(s, 1, 1, { date: '2026-04-02' }).dust === pays[1], 'the next day pays in full again');
  assert.ok(clear(s, 1, 2).dust > pays[5], 'other levels are not affected');
});

test('mutator clears earn a medal once and never change stars or best time', () => {
  const s = defaultSave();
  clear(s, 1, 1, { time: 5 });
  const r = clear(s, 1, 1, { mutator: 1, time: 1, shards: 3 });
  assert.equal(r.medal, true);
  assert.equal(s.levels['1-1'].stars, P.STAR_CLEAR | P.STAR_PAR);
  assert.equal(s.levels['1-1'].best, 5);
  assert.equal(clear(s, 1, 1, { mutator: 1 }).medal, false);
  assert.equal(clear(s, 1, 1, { mutator: 2 }).medal, true);
  assert.equal(s.medals['1-1'], 3);
});

test('gold shards pay once each and finding every one unlocks the secret ship', () => {
  const s = defaultSave();
  assert.equal(P.buyItem(s, 'ship', 'aurum'), 'locked');
  const first = clear(s, 1, 13, { gold: true });
  assert.ok(first.goldNew);
  assert.ok(!clear(s, 1, 13, { gold: true }).goldNew);
  for (let w = 2; w < 10; w++) clear(s, w, 3, { gold: true });
  assert.ok(!s.ships.includes('aurum'));
  assert.ok(clear(s, 10, 8, { gold: true }).secret);
  assert.ok(s.ships.includes('aurum'));
});

test('a fully starred world unlocks its aurora trail and menu theme', () => {
  const s = defaultSave();
  for (let i = 1; i <= 24; i++) clear(s, 2, i, { shards: 3, time: 1 });
  assert.deepEqual(P.menuThemes(s), [0]);
  const r = clear(s, 2, 25, { shards: 3, time: 1 });
  assert.deepEqual(r.worldRewards, ['world2']);
  assert.deepEqual(P.menuThemes(s), [0, 2]);
});

test('missions are the same for everyone on a date, progress from runs and pay once', () => {
  const a = defaultSave();
  const b = defaultSave();
  assert.deepEqual(P.missionsFor(a, '2026-05-01'), P.missionsFor(b, '2026-05-01'));
  const list = P.missionsFor(a, '2026-05-01');
  assert.equal(new Set(list.map((m) => m.type)).size, 3);
  const big = { mode: 'level', world: list.find((m) => m.world)?.world || 1, hops: 999, shards: 999, perfects: 999, coins: 999, boostT: 999, chains: 999, cleared: true, stars: 7, hits: 0, score: 999 };
  for (let i = 0; i < 10; i++) P.trackMissions(a, '2026-05-01', big);
  P.trackMissions(a, '2026-05-01', { ...big, mode: 'daily' });
  P.trackMissions(a, '2026-05-01', { ...big, mode: 'endless' });
  list.forEach((m, i) => {
    assert.equal(m.progress, m.target, m.type);
    const dust = a.dust;
    assert.equal(P.claimMission(a, '2026-05-01', i).dust, m.reward);
    assert.ok(a.dust >= dust + m.reward);
    assert.equal(P.claimMission(a, '2026-05-01', i), null);
  });
  assert.notDeepEqual(P.missionsFor(a, '2026-05-02'), list, 'a new day brings new missions');
});

test('pilot XP levels up with escalating thresholds and pays a reward per level', () => {
  const s = defaultSave();
  s.ships.push('dart');
  s.ship = 'dart'; // no XP perk
  assert.deepEqual(P.pilotLevel(0), { level: 1, into: 0, need: 100, title: 'Cadet' });
  const ups = P.addXp(s, 100 + 140 + 5);
  assert.deepEqual(ups, [2, 3]);
  assert.equal(s.dust, P.levelUpReward(2) + P.levelUpReward(3));
  assert.equal(P.pilotLevel(s.xp).into, 5);
});

test('star chests: one per 25 stars earned, deterministic rewards, never more than earned', () => {
  const s = defaultSave();
  for (let i = 1; i <= 9; i++) clear(s, 1, i, { shards: 3, time: 1 });
  assert.equal(P.chestsAvailable(s), 1);
  const t = defaultSave();
  for (let i = 1; i <= 9; i++) clear(t, 1, i, { shards: 3, time: 1 });
  assert.deepEqual(P.openChest(s), P.openChest(t));
  assert.equal(P.openChest(s), null);
});

test('ascension needs every star, resets the campaign but keeps the shop, and raises stardust', () => {
  const s = defaultSave();
  assert.equal(P.prestige(s), false);
  for (let w = 1; w <= 10; w++) for (let i = 1; i <= 25; i++) clear(s, w, i, { shards: 3, time: 1 });
  assert.equal(totalStars(s), P.TOTAL_STARS);
  s.ships.push('dart');
  const dustBefore = s.dust;
  assert.equal(P.prestige(s), true);
  assert.equal(totalStars(s), 0);
  assert.ok(s.ships.includes('dart'));
  assert.equal(s.dust, dustBefore);
  assert.equal(P.prestigeDustMul(s), 1.25);
  const plain = defaultSave();
  assert.ok(clear(s, 1, 1, { date: '2026-09-09' }).dust > clear(plain, 1, 1, { date: '2026-09-09' }).dust);
});

test('save codes round-trip and reject tampering', () => {
  const s = defaultSave();
  clear(s, 1, 1, { shards: 3 });
  s.dust = 1234;
  const code = P.exportSave(s);
  const back = P.importSave(code);
  assert.equal(back.dust, 1234);
  assert.deepEqual(back.levels, s.levels);
  assert.equal(P.importSave(code.replace('STARHOP1:', 'STARHOP1:A')), null);
  assert.equal(P.importSave('hello'), null);
});

test('weekly event stages must be played in order; finishing all five grants the week trail, a new week restarts', () => {
  const s = defaultSave();
  assert.equal(P.recordWeekly(s, '2026-W10', 1, 5).dust, 0, 'cannot skip stage 1');
  for (let st = 0; st < 4; st++) assert.equal(P.recordWeekly(s, '2026-W10', st, 5).finished, false);
  const fin = P.recordWeekly(s, '2026-W10', 4, 5);
  assert.ok(fin.finished);
  assert.equal(fin.trail, P.weeklyTrail('2026-W10'));
  assert.ok(s.trails.includes(fin.trail));
  assert.equal(P.recordWeekly(s, '2026-W10', 4, 5).dust, 0);
  assert.equal(P.weeklyState(s, '2026-W11').stage, 0);
  assert.equal(P.weekKey(new Date(2026, 0, 1)), '2026-W01');
  assert.equal(P.weekKey(new Date(2027, 0, 1)), '2026-W53');
});

test('perks change the run options, paints cost stardust, and reward-only items cannot be bought', () => {
  const s = defaultSave();
  s.dust = 100000;
  const base = P.runModifiers(s);
  P.buyItem(s, 'ship', 'hammer');
  P.equipItem(s, 'ship', 'hammer');
  assert.equal(P.runModifiers(s).shields, base.shields + 1);
  P.buyItem(s, 'ship', 'needle');
  P.equipItem(s, 'ship', 'needle');
  assert.ok(P.runModifiers(s).shipR > 0 && P.runModifiers(s).shipR < 9);
  assert.equal(P.buyPaint(s, 'comet', 'ember'), null);
  assert.equal(P.paintedShip(s, 'comet').color, P.PAINTS.find((p) => p.id === 'ember').color);
  assert.equal(P.buyPaint(s, 'crown', 'ember'), 'locked');
  assert.equal(P.buyItem(s, 'trail', 'world1'), 'locked');
  assert.equal(P.buyItem(s, 'trail', 'helix'), 'locked');
});

test('new save fields that are corrupt fall back without losing the rest', () => {
  const s = normalizeSave({
    v: 1, dust: 50, gold: ['1-13', 'x', '1-13', '42-1'], medals: { '1-1': 3, '1-2': 99, nope: 1 }, xp: -5, prestige: 'lots',
    missions: { date: '2026-01-01', list: [{ type: 'hops', target: 30, reward: 60, progress: 999 }, { type: 'bogus', target: 1, reward: 1 }] },
    ghosts: { '1-1': { t: 3, l: [1, 2], f: [], b: [], o: {}, ship: 'comet' }, '1-2': { t: 'x' } },
    weekly: { week: 'bad' }, codex: ['planet', 'planet', 'dragon'], paint: { comet: 'ember' }, menuTheme: 77,
  });
  assert.equal(s.dust, 50);
  assert.deepEqual(s.gold, ['1-13']);
  assert.deepEqual(s.medals, { '1-1': 3 });
  assert.equal(s.xp, 0);
  assert.equal(s.prestige, 0);
  assert.deepEqual(s.missions.list.map((m) => [m.type, m.progress]), [['hops', 30]]);
  assert.deepEqual(Object.keys(s.ghosts), ['1-1']);
  assert.equal(s.weekly.week, null);
  assert.deepEqual(s.codex, ['planet']);
  assert.deepEqual(s.paint, {});
  assert.equal(s.menuTheme, 0);
});
