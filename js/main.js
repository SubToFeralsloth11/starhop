// App controller: boot, navigation, game sessions, progression updates and persistence.
import { Renderer } from './render.js';
import { Sound } from './audio.js';
import { Fx } from './fx.js';
import { Game } from './game.js';
import { GenClient } from './genclient.js';
import { applyEndlessChunk, createEndless } from './levels.js';
import { DAILY_WORLD, ENDLESS_WORLD, LEVELS_PER_WORLD, WORLDS } from './worlds.js';
import {
  ACHIEVEMENTS,
  SHIPS,
  TRAILS,
  achievementState,
  buyItem,
  buyUpgrade,
  claimAchievement,
  claimDaily,
  dateKey,
  defaultSave,
  equipItem,
  guideLength,
  isEndlessUnlocked,
  isLevelUnlocked,
  isWorldUnlocked,
  loadSave,
  magnetRadius,
  nextLevel,
  recordClear,
  recordCrash,
  recordDaily,
  recordEndless,
  shieldCharges,
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
let campaign = []; // 200 prebuilt levels
let screen = 'screen-loading';
const history = [];
let session = null; // { mode, world, index, level }
let hudKey = '';
let pickedWorld = save.lastWorld || 1;
let shopTab = 'ship';
let focusWorld = null;
let demoIndex = 0;

const game = new Game(renderer, sound, fx, {
  onEnd: (r) => (r.mode === 'demo' ? startDemo() : finishSession(r)),
  onHud: (h) => updateHud(h),
  onCrash: (s) => {
    if (session && session.mode !== 'endless') {
      recordCrash(save, s.hops, popcount(s.shards));
      persist();
    }
  },
  onFirstLaunch: () => {
    $('#tutorial').hidden = true;
    if (!save.tutorialDone) {
      save.tutorialDone = true;
      persist();
    }
  },
  haptic: (pattern) => {
    if (save.settings.haptics && navigator.vibrate) navigator.vibrate(pattern);
  },
  applyChunk: applyEndlessChunk,
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

/* ---------------- Progress notifications ---------------- */

function snapshot() {
  return {
    done: new Set(ACHIEVEMENTS.filter((a) => achievementState(save, a).done).map((a) => a.id)),
    worlds: WORLDS.map((_, i) => isWorldUnlocked(save, i + 1)),
    endless: isEndlessUnlocked(save),
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
}

/* ---------------- Navigation ---------------- */

function go(id, { push = true } = {}) {
  if (push && screen !== id && screen !== 'screen-loading') history.push(screen);
  screen = id;
  // The attract demo plays behind the title only; other menus get a calm starfield.
  if (id === 'screen-title') {
    if (!game.active) startDemo();
  } else if (game.active && game.opts.mode === 'demo') game.stop();
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
  if (id === 'screen-levels') ui.renderLevels(save, pickedWorld, onLevelPick);
  if (id === 'screen-shop') ui.renderShop(save, shopTab, shopActions);
  if (id === 'screen-trophies') ui.renderTrophies(save, onClaimTrophy);
  if (id === 'screen-settings') ui.renderSettings(save);
}

function onWorldPick(w, locked) {
  if (locked) {
    sound.play('deny');
    ui.toast(`World ${w} is locked: clear ${w - 1}-${LEVELS_PER_WORLD} and collect more ★`);
    return;
  }
  sound.play('click');
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
  playLevel(w, i);
}

function onClaimTrophy(id) {
  const reward = claimAchievement(save, id);
  if (reward == null) return;
  sound.play('coin');
  ui.toast(`+${reward} stardust`);
  persist();
  refresh('screen-trophies');
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
      equipItem(save, kind, id);
      sound.play('coin');
      announce(before);
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
    ship: SHIPS.find((s) => s.id === save.ship) || SHIPS[0],
    trail: TRAILS.find((t) => t.id === save.trail) || TRAILS[0],
  };
}

function runOpts(mode, theme) {
  return {
    mode,
    theme,
    ...equipped(),
    shields: shieldCharges(save.upgrades.shield),
    magnetR: magnetRadius(save.upgrades.magnet),
    aimLen: guideLength(save.upgrades.guide),
    reduced: save.settings.reduced,
    gen,
  };
}

function enterGame(label) {
  history.length = 0;
  history.push('screen-title');
  if (session.mode === 'level') history.push('screen-worlds', 'screen-levels');
  ui.showScreen(null);
  screen = 'game';
  hudKey = '';
  $('#hud').hidden = false;
  $('#hud-score').hidden = session.mode !== 'endless';
  $('#hud-shards').dataset.v = '';
  session.label = label;
}

function playLevel(w, i) {
  const level = campaign[(w - 1) * LEVELS_PER_WORLD + (i - 1)];
  session = { mode: 'level', world: w, index: i, level };
  pickedWorld = w;
  sound.setTheme(w - 1);
  game.start(level, runOpts('level', WORLDS[w - 1]));
  enterGame(`${w}-${i}`);
  $('#tutorial').hidden = !(w === 1 && i === 1 && !save.tutorialDone);
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

async function playDaily() {
  if (generatingJob) return;
  const key = today();
  const from = screen;
  sound.play('click');
  ui.toast('Generating today’s challenge…', 1400);
  let level;
  try {
    level = await generating(gen.daily(key));
  } catch {
    return;
  }
  if (screen !== from) return; // the player navigated away while it was generating
  session = { mode: 'daily', level, dateKey: key };
  sound.setTheme(8);
  game.start(level, runOpts('daily', DAILY_WORLD));
  enterGame(`Daily ${key.slice(5)}`);
  $('#tutorial').hidden = true;
}

async function playEndless() {
  if (generatingJob) return;
  if (!isEndlessUnlocked(save)) {
    sound.play('deny');
    ui.toast(`Clear level 1-${LEVELS_PER_WORLD} to unlock Endless`);
    return;
  }
  sound.play('click');
  const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
  const level = createEndless(seed);
  const from = screen;
  // The first two chunks are needed before the run can start; later ones stream in while playing.
  try {
    for (let c = 0; c < 2; c++) applyEndlessChunk(level, await generating(gen.endless(seed, c, level.planets[level.planets.length - 1])));
  } catch {
    return;
  }
  if (screen !== from) return; // the player navigated away while it was generating
  session = { mode: 'endless', level };
  sound.setTheme(9);
  game.start(level, runOpts('endless', ENDLESS_WORLD));
  enterGame('Endless');
  $('#tutorial').hidden = true;
}

function leaveGame() {
  $('#hud').hidden = true;
  $('#tutorial').hidden = true;
  $('#modal-pause').hidden = true;
  $('#modal-result').hidden = true;
  session = null;
  game.stop();
}

function quitToMenu() {
  sound.play('click');
  leaveGame();
  go(history.pop() || 'screen-title', { push: false });
}

function finishSession(r) {
  const before = snapshot();
  const s = r.s;
  const shards = popcount(s.shards);
  const modal = $('#modal-result');
  const starsBox = $('#result-stars');
  const reasons = $('#result-reasons');
  const breakdown = $('#result-breakdown');
  const score = $('#result-score');
  let dust = 0;
  let rows = [];
  starsBox.hidden = true;
  reasons.innerHTML = '';
  score.hidden = true;
  $('#btn-result-next').hidden = true;
  $('#btn-result-retry').hidden = false;
  $('#btn-result-map').textContent = session.mode === 'level' ? 'Map' : 'Menu';

  if (session.mode === 'level') {
    const { world, index, level } = session;
    const res = recordClear(save, { world, index, shards, time: r.time, par: level.par, hops: s.hops });
    dust = res.dust;
    rows = res.breakdown;
    $('#result-title').textContent = res.newStars > 0 ? 'Level clear!' : 'Cleared!';
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
    const nxt = index < LEVELS_PER_WORLD ? { w: world, i: index + 1 } : world < WORLDS.length ? { w: world + 1, i: 1 } : null;
    const canNext = nxt && isLevelUnlocked(save, nxt.w, nxt.i);
    $('#btn-result-next').hidden = !canNext;
    session.next = canNext ? nxt : null;
  } else if (session.mode === 'daily') {
    const res = recordDaily(save, session.dateKey, s.hops);
    dust = res.dust;
    $('#result-title').textContent = 'Daily clear!';
    rows = res.first ? [{ label: 'Daily challenge', amount: res.dust }] : [{ label: 'Already rewarded today', amount: 0 }];
    reasons.innerHTML = `<li class="ok">Time ${r.time.toFixed(1)}s · ${r.attempts} attempt${r.attempts === 1 ? '' : 's'}</li>`;
  } else {
    const res = recordEndless(save, s.hops);
    dust = res.dust;
    $('#result-title').textContent = res.best ? 'New best!' : 'Run over';
    score.hidden = false;
    score.textContent = s.hops;
    reasons.innerHTML = `<li class="ok">Best: ${save.stats.endlessBest}</li>`;
    rows = [{ label: 'Hops', amount: s.hops }];
  }
  persist();
  breakdown.innerHTML = rows.map((x) => `<span>${x.label}</span><b>+${x.amount}</b>`).join('');
  $('#result-dust').textContent = '0';
  modal.hidden = false;
  $('#hud').hidden = true;
  let last = 0;
  ui.countUp($('#result-dust'), dust, 900, (v) => {
    if (v - last >= Math.max(1, dust / 12)) {
      last = v;
      sound.play('coin');
    }
  });
  setTimeout(() => announce(before), 900);
}

/* ---------------- HUD ---------------- */

function updateHud(h) {
  if (!session) return;
  const key = `${h.maxPi}|${h.shards}|${h.time.toFixed(1)}|${h.attempts}|${h.shields}|${h.hops}|${h.crumbleLeft == null ? '' : h.crumbleLeft.toFixed(1)}`;
  if (key === hudKey) return;
  hudKey = key;
  ui.renderHud(h, session.label, session.mode);
}

function pause() {
  if (!session || game.paused || !$('#modal-result').hidden) return;
  game.paused = true;
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
  const w = Math.min(WORLDS.length, Math.max(1, pickedWorld));
  const level = campaign[(w - 1) * LEVELS_PER_WORLD + (demoIndex++ % 6)];
  sound.setTheme(w - 1);
  game.start(level, { ...runOpts('demo', WORLDS[w - 1]), aimLen: 0, shields: 0 });
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

/* ---------------- Wiring ---------------- */

function wire() {
  const click = (sel, fn) => $(sel).addEventListener('click', fn);
  for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', back);

  click('#btn-play', () => {
    sound.play('click');
    const n = nextLevel(save);
    if (n) playLevel(n.world, n.index);
    else go('screen-worlds');
  });
  click('#btn-worlds', () => {
    sound.play('click');
    go('screen-worlds');
  });
  click('#btn-endless', playEndless);
  click('#btn-daily', playDaily);
  click('#btn-shop', () => {
    sound.play('click');
    go('screen-shop');
  });
  click('#btn-trophies', () => {
    sound.play('click');
    go('screen-trophies');
  });
  click('#btn-settings', () => {
    sound.play('click');
    go('screen-settings');
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
    game.reset();
  });
  click('#btn-quit', quitToMenu);

  click('#btn-result-map', quitToMenu);
  click('#btn-result-retry', () => {
    sound.play('click');
    $('#modal-result').hidden = true;
    const s = session;
    if (s.mode === 'level') playLevel(s.world, s.index);
    else if (s.mode === 'daily') {
      game.start(s.level, runOpts('daily', DAILY_WORLD));
      enterGame(s.label);
    } else playEndless();
  });
  click('#btn-result-next', () => {
    sound.play('click');
    $('#modal-result').hidden = true;
    const n = session.next;
    if (n) playLevel(n.w, n.i);
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

  // Gameplay input: any press on the play area launches.
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    sound.unlock();
    if (session && !game.paused) game.launch();
  });
  window.addEventListener('pointerdown', () => sound.unlock(), { capture: true });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      if (session && !game.paused && $('#modal-result').hidden) {
        e.preventDefault();
        sound.unlock();
        game.launch();
      }
    } else if (e.code === 'Escape' || e.code === 'KeyP') {
      if (!session) return;
      if (game.paused) resume();
      else pause();
    }
  });
  window.addEventListener('resize', () => renderer.resize());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pause();
      sound.suspend();
    } else sound.resume();
  });
  window.addEventListener('storage', (e) => {
    if (e.key === null || e.key === 'starhop.save.v1') save = loadSave(localStorage);
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
  renderer.setTheme(WORLDS[0]);
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
  play: (w, i) => playLevel(w, i),
  get save() {
    return save;
  },
  get session() {
    return session;
  },
};

boot();
