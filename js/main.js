// App controller: boot, navigation, game sessions, progression updates and persistence.
import { Renderer } from './render.js';
import { Sound } from './audio.js';
import { Fx } from './fx.js';
import { Game } from './game.js';
import { GenClient } from './genclient.js';
import { WEEKLY_STAGES, applyEndlessChunk, createEndless, mirrorLevel } from './levels.js';
import { DAILY_WORLD, ENDLESS_WORLD, HUNT_WORLD, LEVELS_PER_WORLD, WEEKLY_WORLD, WORLDS, ZEN_WORLD } from './worlds.js';
import {
  ACHIEVEMENTS,
  MUTATORS,
  PAINTS,
  SAVE_KEY,
  TRAILS,
  achievementState,
  addXp,
  buyItem,
  buyPaint,
  buyUpgrade,
  chestsAvailable,
  claimAchievement,
  claimDaily,
  claimMission,
  CODEX_REWARD,
  codexKinds,
  levelUpReward,
  dateKey,
  defaultSave,
  discover,
  equipItem,
  equipPaint,
  exportSave,
  guideLength,
  importSave,
  isCleared,
  isEndlessUnlocked,
  isLevelUnlocked,
  isWorldBeaten,
  isWorldUnlocked,
  levelKey,
  loadSave,
  magnetRadius,
  nextLevel,
  openChest,
  paintedShip,
  pilotLevel,
  prestige,
  prestigeSpeed,
  recordAttack,
  recordClear,
  recordCrash,
  recordDaily,
  recordEndless,
  recordHunt,
  recordRunStats,
  recordWeekly,
  recordZen,
  runModifiers,
  shieldCharges,
  shipById,
  trackMissions,
  weekKey,
  weeklyShareCode,
  weeklyState,
  writeSave,
} from './progression.js';
import * as ui from './ui.js';

const { $ } = ui;

const canvas = $('#game');
const renderer = new Renderer(canvas);
const sound = new Sound();
const fx = new Fx();
const gen = new GenClient();

let save = loadSave(localStorage);
let campaign = []; // 250 prebuilt levels
let screen = 'screen-loading';
const history = [];
let session = null; // { mode, level, label, ... } (see the play* functions)
let hudKey = '';
let pickedWorld = save.lastWorld || 1;
let shopTab = 'ship';
let focusWorld = null;
let demoIndex = 0;
let levelMutator = 0; // mutator chosen on the level map (0 = normal)
let mapMove = null; // { world, from, to }: animate the map ship after a first clear
let deferredInstall = null; // beforeinstallprompt event
let installPending = false;

const game = new Game(renderer, sound, fx, {
  onEnd: (r) => (r.mode === 'demo' ? startDemo() : finishSession(r)),
  onHud: (h) => updateHud(h),
  onCrash: (s, g) => onCrash(s, g),
  onFirstLaunch: () => {
    $('#tutorial').hidden = true;
    $('#hud-bottom').hidden = false;
    if (!save.tutorialDone) {
      save.tutorialDone = true;
      persist();
    }
  },
  haptic: (pattern) => {
    if (save.settings.haptics && navigator.vibrate) navigator.vibrate(pattern);
  },
  applyChunk: (level, chunk) => {
    applyEndlessChunk(level, chunk);
    discoverLevel(level);
  },
});

function popcount(bits) {
  let n = 0;
  for (; bits; bits &= bits - 1) n++;
  return n;
}

function persist() {
  writeSave(localStorage, save);
}

function today() {
  return dateKey(new Date());
}

function daysLeftInWeek() {
  const d = new Date().getDay() || 7;
  return 8 - d;
}

/* ---------------- Progress notifications ---------------- */

function snapshot() {
  return {
    done: new Set(ACHIEVEMENTS.filter((a) => achievementState(save, a).done).map((a) => a.id)),
    worlds: WORLDS.map((_, i) => isWorldUnlocked(save, i + 1)),
    endless: isEndlessUnlocked(save),
    chests: chestsAvailable(save),
  };
}

function announce(before) {
  const after = snapshot();
  for (const a of ACHIEVEMENTS) {
    if (after.done.has(a.id) && !before.done.has(a.id)) ui.toast(`🏆 Trophy unlocked: <b>${a.name}</b><br><small>Claim it in Trophies</small>`);
  }
  after.worlds.forEach((open, i) => {
    if (open && !before.worlds[i]) {
      ui.toast(`🌌 New world unlocked: <b>${WORLDS[i].name}</b>`, 3400);
      sound.play('unlock');
    }
  });
  if (after.endless && !before.endless) ui.toast('♾️ <b>Endless mode</b> unlocked!', 3400);
  if (after.chests > before.chests) ui.toast('🎁 A <b>star chest</b> is ready to open!', 3000);
}

/** Toasts for pilot level-ups (rewards are already paid by addXp). */
function levelUps(ups) {
  if (!ups || !ups.length) return;
  const last = ups[ups.length - 1];
  const p = pilotLevel(save.xp);
  sound.play('levelup');
  ui.toast(`⭐ Pilot level <b>${last}</b> · ${p.title}`, 3000);
}

function discoverLevel(level) {
  const fresh = discover(save, codexKinds(level));
  if (!fresh.length) return;
  // Paid now; the result card lists it again so its total matches what the run earned.
  if (session) session.codexDust = (session.codexDust || 0) + fresh.length * CODEX_REWARD;
  // One toast per batch so a first level does not bury the screen in notifications.
  const names = fresh.map((c) => c.name).join(', ');
  ui.toast(fresh.length === 1 ? `📖 New codex entry: <b>${names}</b> · +${CODEX_REWARD}` : `📖 ${fresh.length} new codex entries · +${CODEX_REWARD * fresh.length}<br><small>${names}</small>`, 2600);
  persist();
}

/* ---------------- Navigation ---------------- */

function menuTheme() {
  return save.menuTheme ? WORLDS[save.menuTheme - 1] : WORLDS[Math.min(WORLDS.length, Math.max(1, pickedWorld)) - 1];
}

function go(id, { push = true } = {}) {
  if (push && screen !== id && screen !== 'screen-loading') history.push(screen);
  screen = id;
  // The attract demo plays behind the title only; other menus get a calm starfield.
  if (id === 'screen-title') {
    if (!game.active) startDemo();
  } else if (game.active && game.opts.mode === 'demo') {
    game.stop();
    renderer.setTheme(menuTheme());
  }
  refresh(id);
  ui.showScreen(id);
}

function back() {
  sound.play('click');
  go(history.pop() || 'screen-title', { push: false });
}

function refresh(id) {
  if (id === 'screen-title') {
    ui.renderTitle(save, today());
    // Checked on every visit, not just at boot, so a session left open past midnight still gets it.
    if ($('#modal-daily').hidden && ui.renderDailyModal(save, today())) setTimeout(() => ($('#modal-daily').hidden = screen !== 'screen-title'), 500);
  }
  if (id === 'screen-worlds') {
    const focus = ui.renderWorlds(save, onWorldPick);
    requestAnimationFrame(() => focus(focusWorld || pickedWorld));
    focusWorld = null;
  }
  if (id === 'screen-levels') {
    const move = mapMove && mapMove.world === pickedWorld && !levelMutator ? mapMove : null;
    mapMove = null;
    ui.renderLevels(save, pickedWorld, {
      mutator: levelMutator,
      move,
      onPick: onLevelPick,
      onMutator: (bit) => {
        sound.play('click');
        levelMutator = bit;
        refresh('screen-levels');
      },
      onAttack: () => playAttack(pickedWorld),
    });
  }
  if (id === 'screen-shop') ui.renderShop(save, shopTab, shopActions);
  if (id === 'screen-trophies') ui.renderTrophies(save, onClaimTrophy);
  if (id === 'screen-settings') ui.renderSettings(save, settingsFlags());
  if (id === 'screen-missions') ui.renderMissions(save, today(), onClaimMission);
  if (id === 'screen-codex') ui.renderCodex(save, (g, kind, w, h) => renderer.drawCodex(g, kind, w, h, 0));
  if (id === 'screen-modes') {
    ui.renderModes(save, { week: weekKey(), weekLeft: daysLeftInWeek(), today: today() }, {
      weekly: () => {
        sound.play('click');
        go('screen-weekly');
      },
      hunt: playHunt,
      zen: playZen,
      versus: playVersus,
      endless: playEndless,
      attack: (w) => playAttack(w),
    });
  }
  if (id === 'screen-weekly') {
    ui.renderWeekly(save, weekKey(), daysLeftInWeek(), {
      play: playWeekly,
      share: shareWeekly,
      drawTrailPreview: (g, trail) => renderer.drawTrailPreview(g, trail, paintedShip(save)),
    });
  }
}

function onWorldPick(w, locked) {
  if (locked) {
    sound.play('deny');
    ui.toast(`World ${w} is locked: clear ${w - 1}-${LEVELS_PER_WORLD} and collect more ★`);
    return;
  }
  sound.play('click');
  if (w !== pickedWorld) levelMutator = 0;
  pickedWorld = w;
  save.lastWorld = w;
  persist();
  go('screen-levels');
}

function onLevelPick(w, i, unlocked) {
  if (!unlocked) {
    sound.play('deny');
    ui.toast(i > 1 ? `Clear level ${w}-${i - 1} first` : 'This world is locked');
    return;
  }
  sound.play('click');
  playLevel(w, i, levelMutator);
}

function onClaimTrophy(id) {
  const reward = claimAchievement(save, id);
  if (reward == null) return;
  sound.play('coin');
  ui.toast(`+${reward} stardust`);
  persist();
  refresh('screen-trophies');
}

function onClaimMission(i) {
  const before = snapshot();
  const res = claimMission(save, today(), i);
  if (!res) return;
  sound.play('coin');
  ui.toast(`Mission complete · +${res.dust} stardust`);
  levelUps(res.xpUps);
  announce(before);
  persist();
  refresh('screen-missions');
}

const shopActions = {
  item(kind, id) {
    const owned = (kind === 'ship' ? save.ships : save.trails).includes(id);
    if (owned) {
      equipItem(save, kind, id);
      sound.play('click');
    } else {
      const before = snapshot();
      const err = buyItem(save, kind, id);
      if (err === 'poor') {
        sound.play('deny');
        ui.toast('Not enough stardust. Clear levels and earn stars to get more!');
        return;
      }
      if (err === 'locked') {
        sound.play('deny');
        const t = TRAILS.find((x) => x.id === id);
        ui.toast(t && t.world ? `Get all 75 ★ in World ${t.world} to unlock` : 'Finish a weekly event to earn this trail');
        return;
      }
      equipItem(save, kind, id);
      sound.play('coin');
      announce(before);
    }
    persist();
    refresh('screen-shop');
  },
  paint(shipId, paintId) {
    const has = paintId === 'base' || (save.paints[shipId] || []).includes(paintId);
    if (has) {
      equipPaint(save, shipId, paintId);
      sound.play('click');
    } else {
      const err = buyPaint(save, shipId, paintId);
      if (err === 'poor') {
        sound.play('deny');
        ui.toast('Not enough stardust');
        return;
      }
      if (err) return;
      sound.play('coin');
    }
    persist();
    refresh('screen-shop');
  },
  buyUpgrade(id) {
    const before = snapshot();
    const err = buyUpgrade(save, id);
    if (err === 'poor') {
      sound.play('deny');
      ui.toast('Not enough stardust');
      return;
    }
    if (err) return;
    sound.play('unlock');
    announce(before);
    persist();
    refresh('screen-shop');
  },
  upgradeEffect(id, lvl) {
    if (id === 'magnet') return `+${magnetRadius(lvl)} reach`;
    if (id === 'guide') return `${guideLength(lvl)} aim`;
    return `${shieldCharges(lvl)} shield${shieldCharges(lvl) === 1 ? '' : 's'}`;
  },
  drawTrailPreview(g, trail, ship) {
    renderer.drawTrailPreview(g, trail, ship);
  },
};

/* ---------------- Sessions ---------------- */

function equipped() {
  return {
    ship: paintedShip(save),
    trail: TRAILS.find((t) => t.id === save.trail) || TRAILS[0],
  };
}

/** Game options for a mode. Campaign-like modes run faster in ascended (New Game+) saves. */
function runOpts(mode, theme, extra = {}) {
  const m = runModifiers(save);
  const { aimLen, ...mods } = m;
  const campaignish = mode === 'level' || mode === 'attack';
  return {
    mode,
    theme,
    ...equipped(),
    mods,
    aimLen,
    speed: campaignish ? prestigeSpeed(save) : 1,
    reduced: save.settings.reduced,
    hints: save.settings.hints,
    oneLife: mode === 'endless' || mode === 'versus',
    gen,
    ...extra,
  };
}

function enterGame(label) {
  history.length = 0;
  history.push('screen-title');
  if (session.mode === 'level' || session.mode === 'attack') history.push('screen-worlds', 'screen-levels');
  if (['weekly', 'hunt', 'zen', 'versus'].includes(session.mode)) history.push('screen-modes');
  if (session.mode === 'weekly') history.push('screen-weekly');
  ui.showScreen(null);
  // A run can start while the title's delayed daily-reward prompt is pending; it waits for the next title visit.
  $('#modal-daily').hidden = true;
  screen = 'game';
  hudKey = '';
  $('#hud').hidden = false;
  $('#hud-bottom').hidden = false;
  $('#hud-score').hidden = session.mode !== 'endless' && session.mode !== 'zen';
  $('#hud-versus').hidden = session.mode !== 'versus';
  $('#hud-shards').dataset.v = '';
  $('#tutorial').hidden = true;
  $('#btn-quit').textContent = session.mode === 'zen' ? 'End run' : 'Quit';
  session.label = label;
  session.codexDust = 0;
  discoverLevel(session.level);
}

function campaignLevel(w, i) {
  return campaign[(w - 1) * LEVELS_PER_WORLD + (i - 1)];
}

function playLevel(w, i, mutator = 0) {
  let level = campaignLevel(w, i);
  const extra = {};
  if (mutator === 1) {
    level = mirrorLevel(level);
    extra.dir = -1;
  }
  if (mutator === 2) extra.speed = 1.5 * prestigeSpeed(save);
  if (mutator === 4) extra.aimLen = 0;
  const key = levelKey(w, i);
  const g = !mutator && save.settings.ghost ? save.ghosts[key] : null;
  if (g) extra.ghost = { ...g, shipObj: paintedShip(save, g.ship) };
  session = { mode: 'level', world: w, index: i, level, mutator };
  pickedWorld = w;
  sound.setTheme(w - 1);
  game.start(level, runOpts('level', WORLDS[w - 1], extra));
  const mut = MUTATORS.find((m) => m.bit === mutator);
  enterGame(`${w}-${i}${mut ? ` · ${mut.name}` : ''}${level.boss ? ' · BOSS' : ''}`);
  $('#tutorial').hidden = !(w === 1 && i === 1 && !save.tutorialDone);
  // The tutorial hint sits where the boost/flip controls go; they appear after the first launch.
  $('#hud-bottom').hidden = !$('#tutorial').hidden;
  if (level.boss) ui.toast(`♛ Boss: <b>${WORLDS[w - 1].boss}</b>`, 2200);
}

let generatingJob = false;

/** Await a worker generation job, blocking double taps and reporting failures to the player. */
async function generating(promise) {
  generatingJob = true;
  try {
    return await promise;
  } catch (err) {
    console.error(err);
    ui.toast('Could not build that level. Please try again.');
    throw err;
  } finally {
    generatingJob = false;
  }
}

/** Generate a level in the worker, then start it unless the player navigated away meanwhile. */
async function generated(job, message) {
  if (generatingJob) return null;
  const from = screen;
  sound.play('click');
  if (message) ui.toast(message, 1400);
  let level;
  try {
    level = await generating(job());
  } catch {
    return null;
  }
  return screen === from ? level : null;
}

async function playDaily() {
  const key = today();
  const level = await generated(() => gen.daily(key), 'Generating today’s challenge…');
  if (!level) return;
  session = { mode: 'daily', level, dateKey: key };
  sound.setTheme(8);
  game.start(level, runOpts('daily', DAILY_WORLD));
  enterGame(`Daily ${key.slice(5)}`);
}

async function playWeekly() {
  const week = weekKey();
  const st = weeklyState(save, week);
  if (st.done) return;
  const level = await generated(() => gen.weekly(week, st.stage), `Building stage ${st.stage + 1}…`);
  if (!level) return;
  session = { mode: 'weekly', level, week, stage: st.stage };
  sound.setTheme(3);
  game.start(level, runOpts('weekly', WEEKLY_WORLD));
  enterGame(`Weekly · stage ${st.stage + 1}/${WEEKLY_STAGES}`);
}

async function shareWeekly() {
  const text = weeklyShareCode(save);
  try {
    if (navigator.share) await navigator.share({ text });
    else {
      await navigator.clipboard.writeText(text);
      ui.toast('Result copied: paste it to your friends');
    }
  } catch {
    showCode('Your weekly result', 'Copy this and send it to your friends.', text, false);
  }
}

async function playHunt() {
  const key = today();
  const level = await generated(() => gen.hunt(key), 'Scattering shards…');
  if (!level) return;
  session = { mode: 'hunt', level, dateKey: key };
  sound.setTheme(5);
  game.start(level, runOpts('hunt', HUNT_WORLD));
  enterGame('Shard Hunt');
}

async function startEndlessRun(mode) {
  const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
  const level = createEndless(seed);
  const zen = mode === 'zen';
  // The first two chunks are needed before the run can start; later ones stream in while playing.
  const ok = await generated(async () => {
    for (let c = 0; c < 2; c++) applyEndlessChunk(level, await gen.endless(seed, c, level.planets[level.planets.length - 1], zen));
    return level;
  });
  if (!ok) return;
  session = { mode, level };
  sound.setTheme(zen ? 6 : 9);
  game.start(level, runOpts(mode, zen ? ZEN_WORLD : ENDLESS_WORLD));
  enterGame(zen ? 'Zen' : 'Endless');
}

function playEndless() {
  if (generatingJob) return;
  if (!isEndlessUnlocked(save)) {
    sound.play('deny');
    ui.toast(`Clear level 1-${LEVELS_PER_WORLD} to unlock Endless`);
    return;
  }
  startEndlessRun('endless');
}

function playZen() {
  if (!generatingJob) startEndlessRun('zen');
}

/** Pass & Play: two pilots alternate single attempts on today's daily level, three each. */
async function playVersus() {
  const key = today();
  const level = await generated(() => gen.daily(key), 'Setting up the duel…');
  if (!level) return;
  session = { mode: 'versus', level, dateKey: key, turn: 0, best: [null, null], tries: 3 };
  showTurn();
}

function versusPlayer() {
  return session.turn % 2;
}

function showTurn() {
  const v = session;
  const done = v.turn >= v.tries * 2;
  const board = v.best.map((t, i) => `<div class="${!done && versusPlayer() === i ? 'on' : ''}"><span>Player ${i + 1}</span><b>${ui.secs(t)}</b></div>`).join('');
  $('#turn-board').innerHTML = board;
  if (done) {
    const [a, b] = v.best;
    const win = a == null && b == null ? -1 : b == null || (a != null && a < b) ? 0 : a == null || b < a ? 1 : -1;
    $('#turn-title').textContent = win < 0 ? 'A draw!' : `Player ${win + 1} wins!`;
    $('#turn-text').textContent = 'Best time on today’s daily level.';
    $('#btn-turn-go').textContent = 'Rematch';
    sound.play('win');
  } else {
    $('#turn-title').textContent = `Player ${versusPlayer() + 1}`;
    $('#turn-text').textContent = `Try ${Math.floor(v.turn / 2) + 1} of ${v.tries}. Hand over the phone!`;
    $('#btn-turn-go').textContent = 'Go!';
    sound.play('turn');
  }
  $('#hud').hidden = true;
  $('#hud-bottom').hidden = true;
  $('#modal-turn').hidden = false;
}

function versusGo() {
  $('#modal-turn').hidden = true;
  if (session.turn >= session.tries * 2) {
    session.turn = 0;
    session.best = [null, null];
  }
  sound.setTheme(8);
  game.start(session.level, runOpts('versus', DAILY_WORLD));
  enterGame(`Player ${versusPlayer() + 1} · try ${Math.floor(session.turn / 2) + 1}`);
  $('#hud-versus').textContent = session.best.map((t, i) => `P${i + 1} ${ui.secs(t)}`).join('  ·  ');
}

/** Time Attack: all 25 levels of a beaten world back to back on one clock. */
function playAttack(w) {
  if (!isWorldBeaten(save, w)) {
    sound.play('deny');
    ui.toast('Beat this world’s boss first');
    return;
  }
  sound.play('click');
  session = { mode: 'attack', world: w, index: 1, total: 0, level: null };
  pickedWorld = w;
  startAttackLevel();
}

function startAttackLevel() {
  const { world, index } = session;
  session.level = campaignLevel(world, index);
  sound.setTheme(world - 1);
  game.start(session.level, runOpts('attack', WORLDS[world - 1]));
  enterGame(`⏱ ${world}-${index}`);
}

function attemptTime(s, level) {
  return s.t - (level.t0 || 0);
}

function onCrash(s, g) {
  if (!session) return;
  const run = g.runStats();
  recordRunStats(save, run);
  trackMissions(save, today(), { mode: session.mode, world: session.world, ...run, shards: popcount(s.shards), cleared: false });
  if (session.mode === 'attack') session.total += attemptTime(s, session.level);
  if (session.mode !== 'endless' && session.mode !== 'zen') levelUps(recordCrash(save, s.hops, popcount(s.shards), run));
  persist();
}

function leaveGame() {
  $('#hud').hidden = true;
  $('#hud-bottom').hidden = true;
  $('#tutorial').hidden = true;
  $('#modal-pause').hidden = true;
  $('#modal-result').hidden = true;
  $('#modal-turn').hidden = true;
  session = null;
  game.stop();
}

function quitToMenu() {
  sound.play('click');
  if (session && session.mode === 'zen' && $('#modal-result').hidden) {
    // Zen has no game over: ending the run banks the score.
    resume();
    game.stop();
    finishSession({ mode: 'zen', won: false, s: game.s, attempts: 1, time: game.elapsed(), run: game.runStats() });
    return;
  }
  leaveGame();
  maybeInstall();
  go(history.pop() || 'screen-title', { push: false });
}

/** Offer to install the app once, after the player has cleared five levels. */
function maybeInstall() {
  if (!installPending) return;
  installPending = false;
  save.installAsked = true;
  persist();
  $('#install-text').textContent = deferredInstall
    ? 'Install Starhop on your home screen: it starts instantly and works offline.'
    : 'Tap the Share button, then “Add to Home Screen” to keep Starhop one tap away (works offline).';
  $('#btn-install-yes').hidden = !deferredInstall;
  $('#modal-install').hidden = false;
}

function canInstall() {
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return !standalone && (!!deferredInstall || ios);
}

function settingsFlags() {
  return {
    canInstall: canInstall(),
    onTheme: (w) => {
      sound.play('click');
      save.menuTheme = w;
      renderer.setTheme(menuTheme());
      persist();
      refresh('screen-settings');
    },
  };
}

function finishSession(r) {
  const before = snapshot();
  const s = r.s;
  const run = r.run || {};
  const shards = popcount(s.shards);
  const date = today();
  const modal = $('#modal-result');
  const starsBox = $('#result-stars');
  const reasons = $('#result-reasons');
  const breakdown = $('#result-breakdown');
  const score = $('#result-score');
  let dust = 0;
  let rows = [];
  let ups = [];
  starsBox.hidden = true;
  reasons.innerHTML = '';
  score.hidden = true;
  $('#btn-result-next').hidden = true;
  $('#btn-result-next').textContent = 'Next';
  $('#btn-result-retry').hidden = false;
  $('#btn-result-map').textContent = session.mode === 'level' ? 'Map' : 'Menu';
  session.next = null;

  if (session.mode === 'versus') {
    const p = versusPlayer();
    if (r.won && (session.best[p] == null || r.time < session.best[p])) session.best[p] = r.time;
    session.turn++;
    recordRunStats(save, run);
    persist();
    showTurn();
    return;
  }
  if (session.mode === 'attack') {
    session.total += attemptTime(s, session.level);
    if (session.index < LEVELS_PER_WORLD) {
      recordRunStats(save, run);
      trackMissions(save, date, { mode: 'attack', world: session.world, ...run, shards, cleared: true, stars: 0 });
      persist();
      ui.toast(`✓ ${session.world}-${session.index} · ${session.total.toFixed(1)}s`, 1200);
      session.index++;
      startAttackLevel();
      return;
    }
  }
  recordRunStats(save, run);
  let stars = 0;

  if (session.mode === 'level') {
    const { world, index, level, mutator } = session;
    const wasCleared = isCleared(save, world, index);
    const res = recordClear(save, {
      world, index, shards, time: r.time, par: level.par, hops: s.hops,
      perfects: run.perfects, chains: run.chains, coins: run.coins, gold: s.gold, mutator, date,
      ghost: mutator ? null : r.ghost,
    });
    dust = res.dust;
    rows = res.breakdown;
    ups = res.xpUps;
    stars = res.stars;
    $('#result-title').textContent = mutator ? (res.medal ? 'Medal earned!' : 'Cleared!') : res.newStars > 0 ? 'Level clear!' : 'Cleared!';
    if (!mutator) {
      starsBox.hidden = false;
      [...starsBox.children].forEach((st, k) => {
        const bit = 1 << k;
        st.className = '';
        if (res.total & bit) {
          setTimeout(() => {
            st.className = `on ${res.added & bit ? 'new' : ''}`;
            sound.play('star', k);
          }, 300 + k * 260);
        }
      });
      reasons.innerHTML = `
        <li class="ok">Cleared the level</li>
        <li class="${shards >= 3 ? 'ok' : ''}">All star shards (${shards}/3)</li>
        <li class="${r.time <= level.par ? 'ok' : ''}">Under par (${r.time.toFixed(1)}s / ${level.par}s)</li>`;
    } else reasons.innerHTML = `<li class="ok">${MUTATORS.find((m) => m.bit === mutator).name} medal ${res.medal ? 'earned' : 'already owned'}</li>`;
    if (run.perfects) reasons.insertAdjacentHTML('beforeend', `<li class="ok">${run.perfects} perfect landing${run.perfects > 1 ? 's' : ''}</li>`);
    if (res.goldNew) ui.toast('✦ <b>Gold shard</b> found! +150', 3200);
    if (res.secret) ui.toast('🚀 Every gold shard found: the secret ship <b>Aurum</b> is in your hangar!', 4200);
    for (const id of res.worldRewards) ui.toast(`🌈 75/75 ★! <b>${TRAILS.find((t) => t.id === id).name}</b> trail and menu theme unlocked`, 4000);
    if (!wasCleared && !mutator && index < LEVELS_PER_WORLD) mapMove = { world, from: index, to: index + 1 };
    const nxt = index < LEVELS_PER_WORLD ? { w: world, i: index + 1 } : !mutator && world < WORLDS.length ? { w: world + 1, i: 1 } : null;
    const canNext = nxt && isLevelUnlocked(save, nxt.w, nxt.i);
    $('#btn-result-next').hidden = !canNext;
    session.next = canNext ? nxt : null;
    if (!save.installAsked && save.stats.clears >= 5 && canInstall()) installPending = true;
  } else if (session.mode === 'daily') {
    const res = recordDaily(save, session.dateKey, s.hops);
    dust = res.dust;
    ups = res.xpUps;
    $('#result-title').textContent = 'Daily clear!';
    rows = res.first ? [{ label: 'Daily challenge', amount: res.dust }] : [{ label: 'Already rewarded today', amount: 0 }];
    reasons.innerHTML = `<li class="ok">Time ${r.time.toFixed(1)}s · ${r.attempts} attempt${r.attempts === 1 ? '' : 's'}</li>`;
  } else if (session.mode === 'weekly') {
    const res = recordWeekly(save, session.week, session.stage, r.time, WEEKLY_STAGES);
    dust = res.dust;
    ups = res.xpUps;
    $('#result-title').textContent = res.finished ? 'Event complete!' : `Stage ${session.stage + 1} clear!`;
    rows = [{ label: 'Stage reward', amount: Math.min(dust, 60) }];
    if (res.finished) rows.push({ label: 'Event finished', amount: dust - 60 });
    reasons.innerHTML = `<li class="ok">Time ${r.time.toFixed(1)}s · total ${save.weekly.time.toFixed(1)}s</li>`;
    if (res.trail) ui.toast(`🎉 <b>${TRAILS.find((t) => t.id === res.trail).name}</b> trail unlocked!`, 4000);
    if (!res.finished) {
      $('#btn-result-next').hidden = false;
      $('#btn-result-next').textContent = 'Next stage';
      session.next = 'weekly';
    }
    $('#btn-result-retry').hidden = true;
  } else if (session.mode === 'hunt') {
    const time = attemptTime(s, session.level);
    const res = recordHunt(save, session.dateKey, time);
    dust = res.dust;
    ups = res.xpUps;
    $('#result-title').textContent = res.best ? 'New best hunt!' : 'Hunt complete!';
    rows = res.first ? [{ label: 'Shard Hunt', amount: res.dust }] : [{ label: 'Already rewarded today', amount: 0 }];
    reasons.innerHTML = `<li class="ok">All 10 shards in ${time.toFixed(1)}s · best ${ui.secs(save.hunt.best)}</li>`;
  } else if (session.mode === 'attack') {
    const res = recordAttack(save, session.world, session.total);
    dust = res.dust;
    ups = res.xpUps;
    $('#result-title').textContent = res.best ? 'New record!' : 'Time Attack done';
    score.hidden = false;
    score.textContent = `${session.total.toFixed(1)}s`;
    rows = [{ label: res.first ? 'First finish' : 'Run bonus', amount: res.dust }];
    reasons.innerHTML = `<li class="ok">World ${session.world} · best ${ui.secs(save.attack[session.world])}</li>`;
  } else if (session.mode === 'zen') {
    const res = recordZen(save, s.hops);
    dust = res.dust;
    ups = res.xpUps;
    $('#result-title').textContent = res.best ? 'New zen best!' : 'Zen run';
    score.hidden = false;
    score.textContent = s.hops;
    reasons.innerHTML = `<li class="ok">Best: ${save.stats.zenBest}</li>`;
    rows = [{ label: 'Hops (half rate)', amount: res.dust }];
  } else {
    const res = recordEndless(save, s.hops);
    dust = res.dust;
    ups = res.xpUps;
    $('#result-title').textContent = res.best ? 'New best!' : 'Run over';
    score.hidden = false;
    score.textContent = s.hops;
    reasons.innerHTML = `<li class="ok">Best: ${save.stats.endlessBest}</li>`;
    rows = [{ label: 'Hops', amount: s.hops }];
  }
  trackMissions(save, date, { mode: session.mode, world: session.world, ...run, shards, cleared: r.won, stars, score: s.hops });
  persist();
  // Everything else this run paid out, so the card's total equals the stardust actually gained.
  const extras = (ups || []).map((l) => ({ label: `Pilot level ${l}`, amount: levelUpReward(l) }));
  if (session.codexDust) extras.push({ label: 'Codex discoveries', amount: session.codexDust });
  rows = rows.concat(extras);
  dust += extras.reduce((a, x) => a + x.amount, 0);
  breakdown.innerHTML = rows.map((x) => `<span>${x.label}</span><b>${x.amount < 0 ? '−' : '+'}${Math.abs(x.amount)}</b>`).join('');
  $('#result-dust').textContent = '0';
  $('#swipe-hint').hidden = $('#btn-result-next').hidden || $('#btn-result-retry').hidden;
  modal.hidden = false;
  $('#hud').hidden = true;
  $('#hud-bottom').hidden = true;
  let last = 0;
  ui.countUp($('#result-dust'), dust, 900, (v) => {
    if (v - last >= Math.max(1, dust / 12)) {
      last = v;
      sound.play('coin');
    }
  });
  setTimeout(() => {
    announce(before);
    levelUps(ups);
  }, 900);
}

function resultRetry() {
  if ($('#modal-result').hidden || $('#btn-result-retry').hidden) return;
  sound.play('click');
  $('#modal-result').hidden = true;
  const s = session;
  if (s.mode === 'level') playLevel(s.world, s.index, s.mutator);
  else if (s.mode === 'daily' || s.mode === 'hunt') {
    game.start(s.level, runOpts(s.mode, s.mode === 'daily' ? DAILY_WORLD : HUNT_WORLD));
    enterGame(s.label);
  } else if (s.mode === 'attack') playAttack(s.world);
  else if (s.mode === 'zen') playZen();
  else playEndless();
}

function resultNext() {
  if ($('#modal-result').hidden || $('#btn-result-next').hidden) return;
  sound.play('click');
  $('#modal-result').hidden = true;
  maybeInstall();
  const n = session.next;
  if (n === 'weekly') playWeekly();
  else if (n) playLevel(n.w, n.i, session.mutator && n.w === session.world ? session.mutator : 0);
}

/* ---------------- HUD ---------------- */

function updateHud(h) {
  if (!session) return;
  if (session.mode === 'attack') h.time = session.total + attemptTime(game.s, session.level);
  const key = `${h.maxPi}|${h.shards}|${h.time.toFixed(1)}|${h.attempts}|${h.shields}|${h.hops}|${h.coins}|${h.flying}|${h.orbiting}|${h.fuel.toFixed(2)}|${h.crumbleLeft == null ? '' : h.crumbleLeft.toFixed(1)}`;
  if (key === hudKey) return;
  hudKey = key;
  ui.renderHud(h, session.label, session.mode);
}

function pause() {
  if (!session || game.paused || !$('#modal-result').hidden || !$('#modal-turn').hidden || !game.active) return;
  game.paused = true;
  sound.setHazards(null);
  $('#pause-info').textContent = session.mode === 'level' ? `Level ${session.world}-${session.index} · par ${session.level.par}s` : session.label;
  $('#modal-pause').hidden = false;
}

function resume() {
  $('#modal-pause').hidden = true;
  game.paused = false;
}

/* ---------------- Attract demo ---------------- */

function startDemo() {
  if (!campaign.length) return;
  const w = save.menuTheme || Math.min(WORLDS.length, Math.max(1, pickedWorld));
  const level = campaignLevel(w, (demoIndex++ % 6) + 1);
  sound.setTheme(w - 1);
  game.start(level, { ...runOpts('demo', WORLDS[w - 1]), aimLen: 0, mods: {}, hints: false });
}

/* ---------------- Settings ---------------- */

function applySettings() {
  sound.setMusic(save.settings.music);
  sound.setSfx(save.settings.sfx);
  document.body.classList.toggle('reduced', save.settings.reduced);
  game.opts && (game.opts.reduced = save.settings.reduced);
}

function confirm(title, text) {
  return new Promise((resolve) => {
    $('#confirm-title').textContent = title;
    $('#confirm-text').textContent = text;
    $('#modal-confirm').hidden = false;
    const done = (v) => {
      $('#modal-confirm').hidden = true;
      $('#btn-confirm-yes').onclick = null;
      $('#btn-confirm-no').onclick = null;
      resolve(v);
    };
    $('#btn-confirm-yes').onclick = () => done(true);
    $('#btn-confirm-no').onclick = () => done(false);
  });
}

/** Show a code box. `importing` turns it into a paste-and-load form. */
function showCode(title, text, value, importing) {
  $('#code-title').textContent = title;
  $('#code-text').textContent = text;
  const box = $('#code-box');
  box.value = value;
  box.readOnly = !importing;
  $('#btn-code-go').textContent = importing ? 'Load' : 'Copy';
  $('#btn-code-go').onclick = importing ? loadCode : copyCode;
  $('#modal-code').hidden = false;
  if (!importing) box.select();
}

async function copyCode() {
  const box = $('#code-box');
  box.select();
  try {
    await navigator.clipboard.writeText(box.value);
    ui.toast('Copied!');
  } catch {
    ui.toast('Select the text and copy it');
  }
}

async function loadCode() {
  const loaded = importSave($('#code-box').value);
  if (!loaded) {
    sound.play('deny');
    ui.toast('That code is damaged or not a Starhop save');
    return;
  }
  $('#modal-code').hidden = true;
  if (!(await confirm('Load this save?', 'Your current progress on this device will be replaced.'))) return;
  save = loaded;
  persist();
  applySettings();
  sound.play('unlock');
  ui.toast('Save loaded');
  refresh('screen-settings');
}

/* ---------------- Chests ---------------- */

function showChest() {
  sound.play('click');
  const n = chestsAvailable(save);
  $('#chest-art').className = 'chest';
  $('#chest-text').textContent = n ? `${n} chest${n > 1 ? 's' : ''} ready. One chest for every 25 stars you earn.` : 'Earn 25 more stars to fill the next chest.';
  $('#btn-chest-open').hidden = !n;
  $('#modal-chest').hidden = false;
}

function openOneChest() {
  const before = snapshot();
  const res = openChest(save);
  if (!res) return;
  sound.play('chest');
  $('#chest-art').className = 'chest open';
  if (res.kind === 'paint') {
    const ship = shipById(res.ship);
    $('#chest-text').innerHTML = `New paint: <b>${PAINTS.find((p) => p.id === res.paint).name}</b> for your ${ship.name}!`;
  } else $('#chest-text').innerHTML = `<b>+${res.dust}</b> stardust!`;
  $('#btn-chest-open').hidden = chestsAvailable(save) === 0;
  $('#btn-chest-open').textContent = 'Open another';
  persist();
  announce(before);
  ui.renderTitle(save, today());
}

/* ---------------- Wiring ---------------- */

function wire() {
  const click = (sel, fn) => $(sel).addEventListener('click', fn);
  const nav = (sel, id) =>
    click(sel, () => {
      sound.play('click');
      go(id);
    });
  for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', back);

  click('#btn-play', () => {
    sound.play('click');
    const n = nextLevel(save);
    if (n) playLevel(n.world, n.index);
    else go('screen-worlds');
  });
  nav('#btn-worlds', 'screen-worlds');
  nav('#btn-modes', 'screen-modes');
  nav('#btn-missions', 'screen-missions');
  nav('#btn-codex', 'screen-codex');
  nav('#btn-shop', 'screen-shop');
  nav('#btn-trophies', 'screen-trophies');
  nav('#btn-settings', 'screen-settings');
  click('#btn-endless', playEndless);
  click('#btn-daily', playDaily);
  click('#btn-chest', showChest);
  click('#btn-chest-open', openOneChest);
  click('#btn-chest-close', () => {
    sound.play('click');
    $('#modal-chest').hidden = true;
  });
  for (const t of document.querySelectorAll('.tab')) {
    t.addEventListener('click', () => {
      sound.play('click');
      shopTab = t.dataset.tab;
      refresh('screen-shop');
    });
  }
  for (const input of document.querySelectorAll('[data-setting]')) {
    input.addEventListener('change', () => {
      save.settings[input.dataset.setting] = input.checked;
      applySettings();
      persist();
      sound.play('click');
    });
  }
  click('#btn-reset', async () => {
    if (!(await confirm('Reset progress?', 'All levels, stars, stardust, ships and trophies will be erased.'))) return;
    if (!(await confirm('Really erase everything?', 'This cannot be undone.'))) return;
    const settings = save.settings;
    save = defaultSave();
    save.settings = settings;
    persist();
    ui.toast('Progress reset');
    refresh('screen-settings');
  });
  click('#btn-export', () => {
    sound.play('click');
    showCode('Your save code', 'Copy this code and import it on another device to continue there.', exportSave(save), false);
  });
  click('#btn-import', () => {
    sound.play('click');
    showCode('Import a save', 'Paste a save code from another device.', '', true);
  });
  click('#btn-code-close', () => {
    sound.play('click');
    $('#modal-code').hidden = true;
  });
  click('#btn-ascend', async () => {
    if (!(await confirm('Ascend?', 'Your campaign restarts from 1-1 (stars and best times reset). You keep stardust, ships, trails, medals and gold shards, and earn 25% more stardust forever. Levels also run faster.'))) return;
    const before = snapshot();
    if (!prestige(save)) return;
    levelUps(addXp(save, 500));
    persist();
    sound.play('unlock');
    ui.toast(`✦ Ascension ${save.prestige}! Stardust ×${1 + 0.25 * save.prestige}`, 3600);
    announce(before);
    refresh('screen-settings');
  });
  click('#btn-install', () => {
    installPending = true;
    maybeInstall();
  });
  click('#btn-install-yes', async () => {
    $('#modal-install').hidden = true;
    if (!deferredInstall) return;
    deferredInstall.prompt();
    await deferredInstall.userChoice.catch(() => null);
    deferredInstall = null;
  });
  click('#btn-install-no', () => {
    sound.play('click');
    $('#modal-install').hidden = true;
  });
  click('#btn-turn-go', () => {
    sound.play('click');
    versusGo();
  });
  click('#btn-turn-quit', () => {
    sound.play('click');
    leaveGame();
    go(history.pop() || 'screen-modes', { push: false });
  });

  click('#btn-pause', (e) => {
    e.stopPropagation();
    sound.play('click');
    pause();
  });
  click('#btn-resume', () => {
    sound.play('click');
    resume();
  });
  click('#btn-restart', () => {
    sound.play('click');
    resume();
    if (session.mode === 'attack') playAttack(session.world);
    else game.reset();
  });
  click('#btn-quit', quitToMenu);
  $('#btn-flip').addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (session && !game.paused) game.flip();
  });

  click('#btn-result-map', quitToMenu);
  click('#btn-result-retry', resultRetry);
  click('#btn-result-next', resultNext);
  // Swipe on the result card: left = next level, right = retry.
  let swipeX = null;
  const result = $('#modal-result');
  result.addEventListener('pointerdown', (e) => (swipeX = e.clientX));
  result.addEventListener('pointerup', (e) => {
    if (swipeX == null) return;
    const dx = e.clientX - swipeX;
    swipeX = null;
    if (dx < -70) resultNext();
    else if (dx > 70) resultRetry();
  });

  click('#btn-claim-daily', () => {
    const offer = claimDaily(save, today());
    $('#modal-daily').hidden = true;
    if (offer) {
      sound.play('coin');
      ui.toast(`+${offer.reward} stardust · day ${offer.streak} streak`);
      persist();
      refresh(screen);
    }
  });

  // Gameplay input: any press on the play area launches; holding it boosts the flight.
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    sound.unlock();
    if (session && !game.paused) game.press();
  });
  window.addEventListener('pointerup', () => game.release());
  window.addEventListener('pointercancel', () => game.release());
  window.addEventListener('pointerdown', () => sound.unlock(), { capture: true });
  window.addEventListener('keydown', (e) => {
    const playing = session && !game.paused && $('#modal-result').hidden && $('#modal-turn').hidden;
    if (!$('#modal-result').hidden) {
      if (e.code === 'KeyR') resultRetry();
      else if (e.code === 'KeyN' || e.code === 'Enter') {
        if (!$('#btn-result-next').hidden) resultNext();
        else resultRetry();
      }
      return;
    }
    if (e.code === 'Space' || e.code === 'Enter') {
      if (playing) {
        e.preventDefault();
        if (e.repeat) return;
        sound.unlock();
        game.press();
      }
    } else if (e.code === 'KeyF') {
      if (playing) game.flip();
    } else if (e.code === 'Escape' || e.code === 'KeyP') {
      if (!session) return;
      if (game.paused) resume();
      else pause();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') game.release();
  });
  window.addEventListener('resize', () => renderer.resize());
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pause();
      sound.suspend();
    } else sound.resume();
  });
  window.addEventListener('storage', (e) => {
    if (e.key === null || e.key === SAVE_KEY) save = loadSave(localStorage);
  });
}

/* ---------------- Main loop ---------------- */

let last = performance.now();
function loop(now) {
  const dt = (now - last) / 1000;
  last = now;
  const time = now / 1000;
  if (game.active) game.frame(dt, time);
  else renderer.drawMenu(time, -time * 40);
  requestAnimationFrame(loop);
}

async function boot() {
  wire();
  applySettings();
  renderer.setTheme(menuTheme());
  requestAnimationFrame(loop);
  try {
    const res = await fetch('data/levels.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    campaign = (await res.json()).levels;
  } catch (err) {
    $('#loading-text').textContent = 'Could not load levels. Check your connection and reload.';
    console.error(err);
    return;
  }
  await document.fonts?.ready;
  startDemo();
  go('screen-title', { push: false });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// Handle for debugging and automated play-testing from the browser console.
window.starhop = {
  game,
  play: (w, i, mutator = 0) => playLevel(w, i, mutator),
  get save() {
    return save;
  },
  get session() {
    return session;
  },
};

boot();
