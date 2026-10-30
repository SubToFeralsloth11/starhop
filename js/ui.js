// DOM rendering for menus, HUD and modals. Stateless helpers: main.js owns state and wiring.
import {
  ACHIEVEMENTS,
  CODEX,
  DAILY_REWARDS,
  MUTATORS,
  PAINTS,
  SHIPS,
  TRAILS,
  UPGRADES,
  achievementState,
  canPrestige,
  chestsAvailable,
  claimableCount,
  claimableMissions,
  dailyOffer,
  isCleared,
  isEndlessUnlocked,
  isLevelUnlocked,
  isWorldBeaten,
  levelKey,
  levelRecord,
  menuThemes,
  missionText,
  missionsFor,
  nextLevel,
  paintPrice,
  paintedShip,
  pilotLevel,
  prestigeDustMul,
  shipById,
  starBits,
  totalStars,
  upgradePrice,
  weeklyState,
  weeklyTrail,
  worldLock,
  worldStars,
} from './progression.js';
import { LEVELS_PER_WORLD, WORLDS } from './worlds.js';
import { drawShip } from './ships.js';

export const $ = (sel) => document.querySelector(sel);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const secs = (t) => (t == null ? '—' : `${t.toFixed(1)}s`);

export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

export function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === id);
}

export function bindCounters(save) {
  for (const n of document.querySelectorAll('[data-bind="dust"]')) n.textContent = fmt(save.dust);
  for (const n of document.querySelectorAll('[data-bind="stars"]')) n.textContent = fmt(totalStars(save));
}

function badge(node, n) {
  node.hidden = n === 0;
  node.textContent = n;
}

export function renderTitle(save, today) {
  bindCounters(save);
  const next = nextLevel(save);
  $('#play-sub').textContent = next ? `Level ${next.world}-${next.index}` : 'Pick any level';
  $('#endless-sub').textContent = isEndlessUnlocked(save) ? `Best ${save.stats.endlessBest}` : 'Clear world 1';
  $('#btn-endless').classList.toggle('locked', !isEndlessUnlocked(save));
  $('#daily-sub').textContent = save.daily.challengeDone === today ? 'Done ✓' : '+100 today';
  badge($('#trophy-badge'), claimableCount(save));
  const missions = missionsFor(save, today);
  const done = missions.filter((m) => m.claimed).length;
  $('#missions-sub').textContent = `${done}/${missions.length} done`;
  badge($('#missions-badge'), claimableMissions(save, today));
  badge($('#chest-badge'), chestsAvailable(save));
  const p = pilotLevel(save.xp);
  $('#pilot-level').textContent = p.level;
  $('#pilot-title').textContent = p.title;
  $('#pilot-bar').style.width = `${(p.into / p.need) * 100}%`;
  const asc = $('#pilot-asc');
  asc.hidden = save.prestige === 0;
  asc.textContent = `✦ Ascension ${save.prestige} · ×${prestigeDustMul(save)} dust`;
}

function worldArt(w) {
  const t = WORLDS[w - 1];
  const hue = t.planetHues[0];
  return `background: radial-gradient(circle at 34% 30%, hsl(${hue},90%,78%), hsl(${hue},70%,48%) 45%, hsl(${(hue + 30) % 360},70%,16%) 78%); box-shadow: 0 0 60px ${t.nebula[0]}88, inset -18px -18px 40px rgba(0,0,0,0.5);`;
}

export function renderWorlds(save, onPick) {
  bindCounters(save);
  const list = $('#world-list');
  const dots = $('#world-dots');
  list.innerHTML = '';
  dots.innerHTML = '';
  WORLDS.forEach((t, idx) => {
    const w = idx + 1;
    const card = el('div', 'world-card');
    card.style.background = `linear-gradient(180deg, ${t.sky[1]}ee, ${t.sky[0]}ee)`;
    card.style.borderColor = `${t.accent}66`;
    const stars = worldStars(save, w);
    const cleared = Array.from({ length: LEVELS_PER_WORLD }, (_, i) => isCleared(save, w, i + 1)).filter(Boolean).length;
    const gold = save.gold.some((k) => k.startsWith(`${w}-`));
    card.innerHTML = `
      <span class="num">World ${w}${w > 8 ? ' · Bonus' : ''}</span>
      <h3 style="text-shadow:0 0 20px ${t.accent}">${t.name}</h3>
      <p>${t.blurb}</p>
      <div class="world-art" style="${worldArt(w)}"></div>
      <p><b>${cleared}</b>/${LEVELS_PER_WORLD} cleared · <span class="ico-star">★</span> <b>${stars}</b>/${LEVELS_PER_WORLD * 3}${gold ? ' · <span class="ico-gold">✦</span>' : ''}</p>
      <div class="progress"><i style="width:${(stars / (LEVELS_PER_WORLD * 3)) * 100}%"></i></div>
      <p class="mech">${t.mechanic}</p>
      <span class="btn primary enter">Enter</span>`;
    const lock = worldLock(save, w);
    if (lock) {
      const ov = el('div', 'lock-overlay');
      ov.innerHTML = `<div class="lock"></div><b>Locked</b>
        <div class="req"><span class="${lock.prevDone ? 'done' : ''}">${lock.prevDone ? '✓' : '•'} Clear ${w - 1}-${LEVELS_PER_WORLD}</span><br>
        <span class="${lock.have >= lock.needStars ? 'done' : ''}">${lock.have >= lock.needStars ? '✓' : '•'} Own <b>${lock.needStars}</b> ★ (you have ${lock.have})</span></div>`;
      card.appendChild(ov);
    }
    card.addEventListener('click', () => onPick(w, !!lock));
    list.appendChild(card);
    dots.appendChild(el('i'));
  });
  const update = () => {
    const i = Math.round(list.scrollLeft / Math.max(1, list.scrollWidth / WORLDS.length));
    [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
  };
  list.onscroll = update;
  return (w) => {
    const card = list.children[w - 1];
    if (card) list.scrollLeft = card.offsetLeft - (list.clientWidth - card.clientWidth) / 2;
    update();
  };
}

const NODE_GAP = 96; // px between level nodes on the map
const nodeX = (i) => 50 + 30 * Math.sin(i * 0.85); // % across the map
const nodeY = (i) => 70 + (i - 1) * NODE_GAP; // px from the bottom

function shipCanvas(ship, size) {
  const c = el('canvas', 'map-ship-art');
  c.width = c.height = size * 2;
  const g = c.getContext('2d');
  g.translate(size, size);
  g.rotate(-Math.PI / 2);
  drawShip(g, ship, size * 1.1);
  return c;
}

/**
 * Winding level map for a world (level 1 at the bottom, the boss at the top).
 * opts: { mutator (0 = normal), onPick(w, i, unlocked), onMutator(bit), onAttack(), move: { from, to } | null }
 */
export function renderLevels(save, w, opts) {
  bindCounters(save);
  const t = WORLDS[w - 1];
  $('#levels-title').textContent = `${w}. ${t.name}`;
  $('#levels-stars').textContent = `${worldStars(save, w)}/${LEVELS_PER_WORLD * 3}`;
  $('#levels-mech').textContent = opts.mutator ? MUTATORS.find((m) => m.bit === opts.mutator).desc : t.mechanic;
  // Mutators and Time Attack once the boss is beaten.
  const muts = $('#mutators');
  muts.innerHTML = '';
  muts.hidden = !isWorldBeaten(save, w);
  if (!muts.hidden) {
    const chip = (label, active, fn, cls = '') => {
      const b = el('button', `chip ${active ? 'on' : ''} ${cls}`, label);
      b.addEventListener('click', fn);
      muts.appendChild(b);
    };
    chip('Normal', !opts.mutator, () => opts.onMutator(0));
    for (const m of MUTATORS) chip(m.name, opts.mutator === m.bit, () => opts.onMutator(m.bit));
    chip(`⏱ ${save.attack[w] ? secs(save.attack[w]) : 'Time Attack'}`, false, () => opts.onAttack(), 'attack');
  }
  const map = $('#level-map');
  map.innerHTML = '';
  map.style.setProperty('--accent', t.accent);
  const track = el('div', 'map-track');
  const height = nodeY(LEVELS_PER_WORLD) + 110;
  track.style.height = `${height}px`;
  // Dotted path through every node (x in %, y in px; the stroke ignores the non-uniform scale).
  const pts = Array.from({ length: LEVELS_PER_WORLD }, (_, k) => `${nodeX(k + 1)},${height - nodeY(k + 1)}`);
  track.innerHTML = `<svg class="map-path" viewBox="0 0 100 ${height}" preserveAspectRatio="none"><polyline points="${pts.join(' ')}" /></svg>`;
  const next = nextLevel(save);
  let current = next && next.world === w ? next.index : LEVELS_PER_WORLD;
  if (opts.move && opts.move.to) current = opts.move.to;
  for (let i = 1; i <= LEVELS_PER_WORLD; i++) {
    const rec = levelRecord(save, w, i);
    const unlocked = isLevelUnlocked(save, w, i);
    const boss = i === LEVELS_PER_WORLD;
    const b = el('button', `level-node ${boss ? 'boss' : ''}`);
    b.style.left = `${nodeX(i)}%`;
    b.style.bottom = `${nodeY(i)}px`;
    const bits = rec ? rec.stars : 0;
    const key = levelKey(w, i);
    if (!unlocked) {
      b.classList.add('locked');
      b.innerHTML = `<span class="n">🔒</span>`;
    } else if (opts.mutator) {
      const has = (save.medals[key] || 0) & opts.mutator;
      b.innerHTML = `<span class="n">${i}</span><span class="st">${has ? '<b class="on medal">◆</b>' : '<b>◆</b>'}</span>`;
      if (has) b.classList.add('perfect');
    } else {
      b.innerHTML = `<span class="n">${boss ? '♛' : i}</span><span class="st">${[1, 2, 4].map((m) => `<b class="${bits & m ? 'on' : ''}">★</b>`).join('')}</span>`;
      if (bits === 7) b.classList.add('perfect');
      if (next && next.world === w && next.index === i) b.classList.add('current');
    }
    if (save.gold.includes(key)) b.insertAdjacentHTML('beforeend', '<i class="gold-dot" title="Gold shard found">✦</i>');
    const medals = save.medals[key] || 0;
    if (medals && !opts.mutator) b.insertAdjacentHTML('beforeend', `<i class="medal-row">${MUTATORS.map((m) => (medals & m.bit ? '◆' : '')).join('')}</i>`);
    if (boss) b.insertAdjacentHTML('beforeend', `<em class="boss-name">${t.boss}</em>`);
    b.setAttribute('aria-label', `Level ${w}-${i}${boss ? ' (boss)' : ''}${unlocked ? `, ${starBits(bits)} stars` : ', locked'}`);
    b.addEventListener('click', () => opts.onPick(w, i, unlocked));
    track.appendChild(b);
  }
  // The player's ship sits on the current node and flies to the new one after a clear.
  const marker = el('div', 'map-ship');
  marker.appendChild(shipCanvas(paintedShip(save), 22));
  const from = opts.move ? opts.move.from : current;
  marker.style.left = `${nodeX(from)}%`;
  marker.style.bottom = `${nodeY(from) + 40}px`;
  track.appendChild(marker);
  map.appendChild(track);
  requestAnimationFrame(() => {
    map.scrollTop = height - nodeY(from) - map.clientHeight / 2;
    if (opts.move && opts.move.to !== opts.move.from) {
      setTimeout(() => {
        marker.classList.add('flying');
        marker.style.left = `${nodeX(opts.move.to)}%`;
        marker.style.bottom = `${nodeY(opts.move.to) + 40}px`;
        map.scrollTo({ top: height - nodeY(opts.move.to) - map.clientHeight / 2, behavior: 'smooth' });
      }, 350);
    }
  });
}

function previewCanvas(draw) {
  const c = el('canvas');
  c.width = 280;
  c.height = 200;
  const g = c.getContext('2d');
  draw(g);
  return c;
}

function trailLock(save, item) {
  if (item.world) return `Get all 75 ★ in World ${item.world}`;
  if (item.event) return 'Weekly event reward';
  return '';
}

export function renderShop(save, tab, actions) {
  bindCounters(save);
  for (const b of document.querySelectorAll('.tab')) b.classList.toggle('active', b.dataset.tab === tab);
  const grid = $('#shop-grid');
  grid.innerHTML = '';
  grid.classList.toggle('upgrades', tab === 'upgrade');
  if (tab === 'upgrade') {
    for (const up of UPGRADES) {
      const lvl = save.upgrades[up.id];
      const price = upgradePrice(save, up.id);
      const card = el('div', 'item upgrade');
      card.innerHTML = `<div class="info"><div class="name">${up.name}</div><p>${up.desc}</p>
        <p>${actions.upgradeEffect(up.id, lvl)}${price != null ? ` → <b>${actions.upgradeEffect(up.id, lvl + 1)}</b>` : ''}</p>
        <div class="pips">${up.prices.map((_, k) => `<i class="${k < lvl ? 'on' : ''}"></i>`).join('')}</div></div>`;
      const btn = el('button', `btn ${price == null ? '' : save.dust >= price ? 'gold' : 'locked'}`);
      btn.innerHTML = price == null ? 'MAX' : `<span class="ico-dust"></span>${fmt(price)}`;
      btn.disabled = price == null;
      btn.addEventListener('click', () => actions.buyUpgrade(up.id));
      card.appendChild(btn);
      grid.appendChild(card);
    }
    return;
  }
  if (tab === 'paint') {
    const ship = shipById(save.ship);
    const owned = save.paints[ship.id] || [];
    const equipped = save.paint[ship.id] || 'base';
    grid.insertAdjacentHTML('beforeend', `<p class="shop-note">Paint jobs for your <b>${ship.name}</b>. Equip another ship to repaint it.</p>`);
    for (const paint of PAINTS) {
      const has = paint.id === 'base' || owned.includes(paint.id);
      const look = paint.color ? { ...ship, color: paint.color, accent: paint.accent } : ship;
      const card = el('div', `item ${equipped === paint.id ? 'equipped' : ''}`);
      card.appendChild(
        previewCanvas((g) => {
          g.translate(140, 100);
          g.rotate(-0.5);
          drawShip(g, look, 110);
        }),
      );
      card.appendChild(el('div', 'name', paint.name));
      const btn = el('button', 'btn');
      const price = paintPrice(ship, paint);
      if (equipped === paint.id) btn.textContent = 'Equipped';
      else if (has) {
        btn.textContent = 'Equip';
        btn.classList.add('primary');
      } else {
        btn.innerHTML = `<span class="ico-dust"></span>${fmt(price)}`;
        btn.classList.add(save.dust >= price ? 'gold' : 'locked');
      }
      btn.addEventListener('click', () => actions.paint(ship.id, paint.id));
      card.appendChild(btn);
      grid.appendChild(card);
    }
    return;
  }
  const items = tab === 'ship' ? SHIPS : TRAILS;
  const owned = tab === 'ship' ? save.ships : save.trails;
  const equipped = tab === 'ship' ? save.ship : save.trail;
  const ship = paintedShip(save);
  for (const item of items) {
    const has = owned.includes(item.id);
    if (item.secret && !has) {
      const card = el('div', 'item secret');
      card.innerHTML = `<canvas width="280" height="200"></canvas><div class="name">???</div><p class="perk">Find a gold shard in every world (${save.gold.length}/${WORLDS.length}).</p>`;
      grid.appendChild(card);
      continue;
    }
    const card = el('div', `item ${equipped === item.id ? 'equipped' : ''}`);
    card.appendChild(
      previewCanvas((g) => {
        if (tab === 'ship') {
          g.translate(140, 100);
          g.rotate(-0.5);
          drawShip(g, has ? paintedShip(save, item.id) : item, 110);
        } else {
          actions.drawTrailPreview(g, item, ship);
        }
      }),
    );
    card.appendChild(el('div', 'name', item.name));
    if (item.perk) card.appendChild(el('p', 'perk', item.perk.desc));
    const btn = el('button', 'btn');
    if (equipped === item.id) btn.textContent = 'Equipped';
    else if (has) {
      btn.textContent = 'Equip';
      btn.classList.add('primary');
    } else if (item.price == null) {
      btn.textContent = trailLock(save, item);
      btn.classList.add('locked', 'small-text');
    } else {
      btn.innerHTML = `<span class="ico-dust"></span>${fmt(item.price)}`;
      btn.classList.add(save.dust >= item.price ? 'gold' : 'locked');
    }
    btn.addEventListener('click', () => actions.item(tab, item.id));
    card.appendChild(btn);
    grid.appendChild(card);
  }
}

export function renderTrophies(save, onClaim) {
  bindCounters(save);
  const list = $('#trophy-list');
  list.innerHTML = '';
  const states = ACHIEVEMENTS.map((a) => ({ a, st: achievementState(save, a) }));
  const done = states.filter((x) => x.st.claimed).length;
  $('#trophy-summary').textContent = `${done} of ${ACHIEVEMENTS.length} claimed`;
  // Ready-to-claim first, then in-progress, then claimed.
  const rank = ({ st }) => (st.done && !st.claimed ? 0 : st.claimed ? 2 : 1);
  states.sort((x, y) => rank(x) - rank(y));
  for (const { a, st } of states) {
    const ready = st.done && !st.claimed;
    const row = el('div', `trophy ${ready ? 'ready' : ''} ${st.claimed ? 'claimed' : ''}`);
    row.innerHTML = `<div><h4>${a.name}</h4><p>${a.desc} · ${fmt(st.value)}/${fmt(a.target)}</p></div>`;
    const btn = el('button', `btn ${ready ? 'gold' : ''}`);
    btn.innerHTML = st.claimed ? '✓' : `<span class="ico-dust"></span>${fmt(a.reward)}`;
    btn.disabled = !ready;
    btn.addEventListener('click', () => onClaim(a.id));
    row.appendChild(btn);
    const bar = el('div', 'progress');
    bar.innerHTML = `<i style="width:${(st.value / a.target) * 100}%"></i>`;
    row.appendChild(bar);
    list.appendChild(row);
  }
}

export function renderMissions(save, date, onClaim) {
  bindCounters(save);
  const list = $('#mission-list');
  list.innerHTML = '';
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const h = Math.floor((midnight - now) / 3600000);
  const m = Math.floor(((midnight - now) % 3600000) / 60000);
  $('#missions-reset').textContent = `New missions in ${h}h ${m}m`;
  missionsFor(save, date).forEach((mi, i) => {
    const ready = mi.progress >= mi.target && !mi.claimed;
    const row = el('div', `trophy ${ready ? 'ready' : ''} ${mi.claimed ? 'claimed' : ''}`);
    row.innerHTML = `<div><h4>${missionText(mi)}</h4><p>${fmt(mi.progress)}/${fmt(mi.target)}</p></div>`;
    const btn = el('button', `btn ${ready ? 'gold' : ''}`);
    btn.innerHTML = mi.claimed ? '✓' : `<span class="ico-dust"></span>${fmt(mi.reward)}`;
    btn.disabled = !ready;
    btn.addEventListener('click', () => onClaim(i));
    row.appendChild(btn);
    const bar = el('div', 'progress');
    bar.innerHTML = `<i style="width:${(mi.progress / mi.target) * 100}%"></i>`;
    row.appendChild(bar);
    list.appendChild(row);
  });
}

export function renderCodex(save, drawArt) {
  bindCounters(save);
  const grid = $('#codex-grid');
  grid.innerHTML = '';
  $('#codex-summary').textContent = `${save.codex.length} of ${CODEX.length} discovered · each new entry pays 20 stardust`;
  for (const c of CODEX) {
    const known = save.codex.includes(c.id);
    const card = el('div', `codex-card ${known ? '' : 'unknown'}`);
    const cv = el('canvas');
    cv.width = 240;
    cv.height = 160;
    if (known) drawArt(cv.getContext('2d'), c.id, 240, 160);
    card.appendChild(cv);
    card.appendChild(el('h4', '', known ? c.name : '???'));
    card.appendChild(el('p', '', known ? c.lore : 'Not discovered yet. Keep exploring the worlds.'));
    grid.appendChild(card);
  }
}

/**
 * Modes hub. actions: { weekly(), hunt(), zen(), versus(), endless(), attack(world) }
 * info: { week, weekLeft (days), today }
 */
export function renderModes(save, info, actions) {
  bindCounters(save);
  const list = $('#mode-list');
  list.innerHTML = '';
  const card = (title, sub, cls, fn, locked = false) => {
    const b = el('button', `mode-card ${cls} ${locked ? 'locked' : ''}`, `<h3>${title}</h3><p>${sub}</p>`);
    b.addEventListener('click', fn);
    list.appendChild(b);
    return b;
  };
  const wk = weeklyState(save, info.week);
  const trail = TRAILS.find((t) => t.id === weeklyTrail(info.week));
  card('Weekly Event', `${wk.done ? 'Finished ✓' : `Stage ${wk.stage + 1}/5`} · reward: ${trail.name} trail · ${info.weekLeft}d left`, 'weekly', actions.weekly);
  const huntToday = save.hunt.date === info.today;
  card('Shard Hunt', `10 shards, 60 seconds · ${huntToday ? `today's best ${secs(save.hunt.best)}` : '+60 today'}`, 'hunt', actions.hunt);
  card('Zen', `No hazards, no falling · best ${save.stats.zenBest}`, 'zen', actions.zen);
  card('Pass & Play', 'Two pilots, today’s daily level, three tries each', 'versus', actions.versus);
  const endless = isEndlessUnlocked(save);
  card('Endless', endless ? `One life · best ${save.stats.endlessBest}` : 'Clear world 1 to unlock', 'endless', actions.endless, !endless);
  const beaten = WORLDS.map((_, i) => i + 1).filter((w) => isWorldBeaten(save, w));
  const attack = card('Time Attack', beaten.length ? 'All 25 levels of a world on one clock' : 'Beat a world’s boss to unlock', 'attack', () => {}, !beaten.length);
  if (beaten.length) {
    const chips = el('div', 'chips');
    for (const w of beaten) {
      const c = el('span', 'chip', `${w} · ${secs(save.attack[w])}`);
      c.addEventListener('click', (e) => {
        e.stopPropagation();
        actions.attack(w);
      });
      chips.appendChild(c);
    }
    attack.appendChild(chips);
  }
}

/** Weekly event screen. actions: { play(), share(), drawTrailPreview(g, trail) } */
export function renderWeekly(save, week, daysLeft, actions) {
  bindCounters(save);
  const st = weeklyState(save, week);
  const trail = TRAILS.find((t) => t.id === weeklyTrail(week));
  $('#weekly-sub').textContent = `${week} · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
  const panel = $('#weekly-panel');
  panel.innerHTML = '';
  const stages = el('div', 'stages');
  for (let i = 0; i < 5; i++) {
    const cls = i < st.stage ? 'done' : i === st.stage && !st.done ? 'current' : '';
    stages.appendChild(el('div', `stage ${cls}`, `<b>${i + 1}</b><small>${i < st.stage ? '✓' : i === 4 ? 'final' : ''}</small>`));
  }
  panel.appendChild(stages);
  panel.appendChild(el('p', 'sub', `Total time ${secs(st.time)} · +60 per stage, +300 and the <b>${trail.name}</b> trail for finishing`));
  panel.appendChild(previewCanvas((g) => actions.drawTrailPreview(g, trail)));
  const play = el('button', 'btn big primary', st.done ? 'Finished!' : `Play stage ${st.stage + 1}`);
  play.disabled = st.done;
  play.addEventListener('click', actions.play);
  panel.appendChild(play);
  if (st.stage > 0) {
    const share = el('button', 'btn', 'Share result');
    share.addEventListener('click', actions.share);
    panel.appendChild(share);
  }
}

export function renderSettings(save, flags) {
  for (const input of document.querySelectorAll('[data-setting]')) input.checked = !!save.settings[input.dataset.setting];
  const s = save.stats;
  const rows = [
    ['Levels cleared', Object.values(save.levels).filter((r) => r.stars & 1).length],
    ['Stars', totalStars(save)],
    ['Pilot level', pilotLevel(save.xp).level],
    ['Hops landed', s.hops],
    ['Perfect landings', s.perfects],
    ['Star shards', s.shards],
    ['Gold shards', save.gold.length],
    ['Medals', s.medals],
    ['Crashes', s.crashes],
    ['Endless best', s.endlessBest],
    ['Stardust earned', s.dustEarned],
  ];
  $('#stats').innerHTML = rows.map(([k, v]) => `<span>${k}</span><b>${fmt(v)}</b>`).join('');
  const chips = $('#theme-chips');
  chips.innerHTML = '';
  for (const w of menuThemes(save)) {
    const c = el('button', `chip ${save.menuTheme === w ? 'on' : ''}`, w ? WORLDS[w - 1].name : 'Default');
    c.addEventListener('click', () => flags.onTheme(w));
    chips.appendChild(c);
  }
  if (chips.children.length === 1) chips.insertAdjacentHTML('beforeend', '<small>Get all 75 ★ in a world to unlock its theme</small>');
  $('#btn-install').hidden = !flags.canInstall;
  const asc = $('#btn-ascend');
  asc.hidden = !canPrestige(save);
  $('#ascend-sub').textContent = `Restart the campaign for ×${prestigeDustMul(save) + 0.25} stardust and faster levels`;
}

export function renderDailyModal(save, today) {
  const offer = dailyOffer(save, today);
  if (!offer) return false;
  $('#daily-streak').textContent = offer.streak > 1 ? `${offer.streak}-day streak! Come back tomorrow for more.` : 'Come back every day to grow your streak.';
  const strip = $('#daily-strip');
  strip.innerHTML = '';
  DAILY_REWARDS.forEach((r, i) => {
    const d = el('div', i < offer.slot ? 'past' : i === offer.slot ? 'today' : '');
    d.innerHTML = `<span>Day ${i + 1}</span><b>${r}</b>`;
    strip.appendChild(d);
  });
  $('#btn-claim-daily').innerHTML = `Claim <span class="ico-dust"></span> ${offer.reward}`;
  return true;
}

export function renderHud(h, label, mode) {
  $('#hud-title').textContent = label;
  $('#hud-bar').style.width = `${Math.min(100, (h.maxPi / Math.max(1, h.total)) * 100)}%`;
  const shards = $('#hud-shards');
  if (mode === 'endless' || mode === 'zen') {
    shards.innerHTML = '';
    $('#hud-score').textContent = h.hops;
  } else if (shards.dataset.v !== String(h.shards)) {
    shards.dataset.v = String(h.shards);
    shards.innerHTML = Array.from({ length: h.shardCount }, (_, i) => `<b class="${h.shards & (1 << i) ? 'on' : ''}">★</b>`).join('');
  }
  shards.classList.toggle('many', h.shardCount > 3);
  const time = $('#hud-time');
  if (h.timeLimit) {
    const left = Math.max(0, h.timeLimit - h.time);
    time.textContent = `${left.toFixed(1)}s left`;
    time.className = left < 10 ? 'over' : 'under';
  } else if (mode === 'level' || mode === 'attack') {
    time.textContent = mode === 'attack' ? `${h.time.toFixed(1)}s` : `${h.time.toFixed(1)}s / par ${h.par}s`;
    time.className = mode === 'level' && h.time > h.par ? 'over' : 'under';
  } else if (mode === 'daily' || mode === 'weekly' || mode === 'versus') {
    time.textContent = `${h.time.toFixed(1)}s`;
    time.className = '';
  } else time.textContent = '';
  $('#hud-attempt').textContent = mode === 'endless' || mode === 'zen' ? '' : `Attempt ${h.attempts}`;
  $('#hud-shields').textContent = `${h.shields > 0 ? `🛡 ${h.shields}` : ''}${h.coins ? ` ◎ ${h.coins}` : ''}`;
  const cr = $('#hud-crumble');
  cr.hidden = h.crumbleLeft == null;
  if (h.crumbleLeft != null) cr.textContent = `Crumbling! ${Math.max(0, h.crumbleLeft).toFixed(1)}s`;
  const fuel = $('#hud-fuel');
  fuel.classList.toggle('flying', h.flying);
  fuel.firstElementChild.style.width = `${h.fuel * 100}%`;
  $('#btn-flip').classList.toggle('dim', !h.orbiting);
}

export function toast(html, ms = 2600) {
  const t = el('div', 'toast', html);
  $('#toasts').appendChild(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 350);
  }, ms);
}

export function countUp(node, to, ms = 900, onTick) {
  const start = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - start) / ms);
    const v = Math.round(to * (1 - Math.pow(1 - k, 3)));
    node.textContent = fmt(v);
    onTick?.(v);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export { fmt, secs };
