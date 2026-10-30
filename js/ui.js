// DOM rendering for menus, HUD and modals. Stateless helpers: main.js owns state and wiring.
import {
  ACHIEVEMENTS,
  DAILY_REWARDS,
  SHIPS,
  TRAILS,
  UPGRADES,
  achievementState,
  claimableCount,
  dailyOffer,
  isCleared,
  isEndlessUnlocked,
  isLevelUnlocked,
  levelRecord,
  nextLevel,
  starBits,
  totalStars,
  upgradePrice,
  worldLock,
  worldStars,
} from './progression.js';
import { LEVELS_PER_WORLD, WORLDS } from './worlds.js';
import { drawShip } from './ships.js';

export const $ = (sel) => document.querySelector(sel);
const fmt = (n) => Math.round(n).toLocaleString('en-US');

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

export function renderTitle(save, today) {
  bindCounters(save);
  const next = nextLevel(save);
  $('#play-sub').textContent = next ? `Level ${next.world}-${next.index}` : 'Pick any level';
  $('#endless-sub').textContent = isEndlessUnlocked(save) ? `Best ${save.stats.endlessBest}` : 'Clear world 1';
  $('#btn-endless').classList.toggle('locked', !isEndlessUnlocked(save));
  $('#daily-sub').textContent = save.daily.challengeDone === today ? 'Done ✓' : '+100 today';
  const claim = claimableCount(save);
  const badge = $('#trophy-badge');
  badge.hidden = claim === 0;
  badge.textContent = claim;
}

function worldArt(w) {
  const t = WORLDS[w - 1];
  const hue = t.planetHues[0];
  return `background: radial-gradient(circle at 34% 30%, hsl(${hue},90%,78%), hsl(${hue},70%,48%) 45%, hsl(${(hue + 30) % 360},70%,16%) 78%); box-shadow: 0 0 60px ${t.nebula[0]}88, inset -18px -18px 40px rgba(0,0,0,0.5);`;
}

export function renderWorlds(save, onPick) {
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
    card.innerHTML = `
      <span class="num">World ${w}</span>
      <h3 style="text-shadow:0 0 20px ${t.accent}">${t.name}</h3>
      <p>${t.blurb}</p>
      <div class="world-art" style="${worldArt(w)}"></div>
      <p><b>${cleared}</b>/${LEVELS_PER_WORLD} cleared · <span class="ico-star">★</span> <b>${stars}</b>/${LEVELS_PER_WORLD * 3}</p>
      <div class="progress"><i style="width:${(stars / (LEVELS_PER_WORLD * 3)) * 100}%"></i></div>`;
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

export function renderLevels(save, w, onPick) {
  const t = WORLDS[w - 1];
  $('#levels-title').textContent = `${w}. ${t.name}`;
  $('#levels-stars').textContent = `${worldStars(save, w)}/${LEVELS_PER_WORLD * 3}`;
  $('#levels-mech').textContent = t.mechanic;
  const grid = $('#level-grid');
  grid.innerHTML = '';
  const next = nextLevel(save);
  for (let i = 1; i <= LEVELS_PER_WORLD; i++) {
    const rec = levelRecord(save, w, i);
    const unlocked = isLevelUnlocked(save, w, i);
    const b = el('button', 'level-btn');
    const bits = rec ? rec.stars : 0;
    if (!unlocked) {
      b.classList.add('locked');
      b.innerHTML = `<span>🔒</span><span class="st">${i}</span>`;
    } else {
      b.innerHTML = `<span>${i}</span><span class="st">${[1, 2, 4].map((m) => `<b class="${bits & m ? 'on' : ''}">★</b>`).join('')}</span>`;
      if (bits === 7) b.classList.add('perfect');
      if (next && next.world === w && next.index === i) b.classList.add('current');
    }
    b.setAttribute('aria-label', `Level ${w}-${i}${unlocked ? `, ${starBits(bits)} stars` : ', locked'}`);
    b.addEventListener('click', () => onPick(w, i, unlocked));
    grid.appendChild(b);
  }
}

function previewCanvas(draw) {
  const c = el('canvas');
  c.width = 280;
  c.height = 200;
  const g = c.getContext('2d');
  draw(g);
  return c;
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
  const items = tab === 'ship' ? SHIPS : TRAILS;
  const owned = tab === 'ship' ? save.ships : save.trails;
  const equipped = tab === 'ship' ? save.ship : save.trail;
  const ship = SHIPS.find((s) => s.id === save.ship);
  for (const item of items) {
    const has = owned.includes(item.id);
    const card = el('div', `item ${equipped === item.id ? 'equipped' : ''}`);
    card.appendChild(
      previewCanvas((g) => {
        if (tab === 'ship') {
          g.translate(140, 100);
          g.rotate(-0.5);
          drawShip(g, item, 110);
        } else {
          actions.drawTrailPreview(g, item, ship);
        }
      }),
    );
    card.appendChild(el('div', 'name', item.name));
    const btn = el('button', 'btn');
    if (equipped === item.id) btn.textContent = 'Equipped';
    else if (has) {
      btn.textContent = 'Equip';
      btn.classList.add('primary');
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

export function renderSettings(save) {
  for (const input of document.querySelectorAll('[data-setting]')) input.checked = !!save.settings[input.dataset.setting];
  const s = save.stats;
  const rows = [
    ['Levels cleared', Object.values(save.levels).filter((r) => r.stars & 1).length],
    ['Stars', totalStars(save)],
    ['Hops landed', s.hops],
    ['Star shards', s.shards],
    ['Crashes', s.crashes],
    ['Endless best', s.endlessBest],
    ['Stardust earned', s.dustEarned],
  ];
  $('#stats').innerHTML = rows.map(([k, v]) => `<span>${k}</span><b>${fmt(v)}</b>`).join('');
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
  if (mode === 'endless') {
    shards.innerHTML = '';
    $('#hud-score').textContent = h.hops;
  } else if (shards.dataset.v !== String(h.shards)) {
    shards.dataset.v = String(h.shards);
    shards.innerHTML = Array.from({ length: h.shardCount }, (_, i) => `<b class="${h.shards & (1 << i) ? 'on' : ''}">★</b>`).join('');
  }
  const time = $('#hud-time');
  if (mode === 'level') {
    time.textContent = `${h.time.toFixed(1)}s / par ${h.par}s`;
    time.className = h.time > h.par ? 'over' : 'under';
  } else if (mode === 'daily') {
    time.textContent = `${h.time.toFixed(1)}s`;
    time.className = '';
  } else time.textContent = '';
  $('#hud-attempt').textContent = mode === 'endless' ? '' : `Attempt ${h.attempts}`;
  $('#hud-shields').textContent = h.shields > 0 ? `🛡 ${h.shields}` : '';
  const cr = $('#hud-crumble');
  cr.hidden = h.crumbleLeft == null;
  if (h.crumbleLeft != null) cr.textContent = `Crumbling! ${Math.max(0, h.crumbleLeft).toFixed(1)}s`;
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

export { fmt };
