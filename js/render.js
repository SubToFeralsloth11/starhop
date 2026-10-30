// Canvas renderer: parallax space background, planets, hazards, ship, trails and effects.
import { WORLD_W, asteroidPos, laserPhase, launchDir, planetPos } from './sim.js';
import { drawShip } from './ships.js';
import { makeRng } from './rng.js';

const TAU = Math.PI * 2;
const WARP_COLORS = ['#3dffd8', '#ff6bd6', '#ffd23f', '#7a8cff'];
const MAX_DPR = 2;
const tmp = { x: 0, y: 0 };
const nrm = { x: 0, y: 0 };
const REACT_TIME = 0.45; // planet wobble / ring flash after a capture
const SQUASH_TIME = 0.18; // ship stretch after a launch
const LEAN = 0.28; // ship tilt toward the planet while orbiting
// Stable ids for trail points so per-point effects (rings, sparks, petals) don't crawl as the trail shifts.
const ptIds = new WeakMap();
let ptSerial = 0;

// Codex illustrations: world-unit extent of each scene and the stand-in objects they draw.
const CODEX_EXT = { planet: 190, ringed: 200, drifter: 230, giant: 290, crumbler: 190, asteroid: 150, moon: 180, laser: 210, hole: 350, warp: 260, portal: 230, boss: 260, shard: 80, gold: 120, coin: 40, bounce: 220 };
const CODEX_P = {
  planet: { x: 101, y: 7, r: 46, orbit: 80, hue: 0 },
  ringed: { x: 211, y: 13, r: 38, orbit: 84, hue: 1, ring: true },
  drifter: { x: 307, y: 3, r: 36, orbit: 60, hue: 2 },
  giant: { x: 419, y: 29, r: 44, orbit: 60, hue: 3, g: 1 },
  crumbler: { x: 523, y: 41, r: 44, orbit: 74, hue: 1, crumble: 1 },
  host: { x: 613, y: 5, r: 30, orbit: 0, hue: 2 },
};
const CODEX_ROCK = { seed: 9001, r: 42 };
const CODEX_MOON = { kind: 'spin', x: 0, y: 0, R: 66, w: 1.4, ph: 0.7, r: 15, seed: 4242, spin: 1.2 };
const CODEX_LASER = { lasers: [{ x1: -86, y1: 0, x2: 86, y2: 0, ph: 0, period: 2.4, on: 1.6 }] };
const CODEX_HOLE = { holes: [{ x: 0, y: 0, core: 26 }] };
const CODEX_WARP = { warps: [{ ax: -78, ay: 26, bx: 78, by: -26, r: 28 }] };

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.glows = new Map();
    this.sprites = new WeakMap();
    this.rocks = new Map();
    this.reacts = new WeakMap();
    this.theme = null;
    this.resize();
  }

  resize() {
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.dpr = dpr;
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.colW = Math.min(w, h * 0.72);
    this.scale = this.colW / WORLD_W;
    this.offX = (w - this.colW) / 2;
    this.viewH = h / this.scale;
    this.sprites = new WeakMap();
    this.rocks.clear();
    if (this.theme) this.buildBackground(this.theme);
  }

  /** World y shown at the vertical center of the screen for a camera focused on `y`. */
  setTheme(theme) {
    if (this.theme === theme) return;
    this.theme = theme;
    this.sprites = new WeakMap();
    this.buildBackground(theme);
  }

  /** World-unit height visible on screen at camera zoom `zoom`. */
  viewHeight(zoom = 1) {
    return this.viewH / zoom;
  }

  /** A planet was just captured: wobble its sprite and flash its orbit ring. */
  react(planet, time) {
    this.reacts.set(planet, time);
  }

  reactAge(p, time) {
    const t0 = this.reacts.get(p);
    if (t0 === undefined) return -1;
    const age = time - t0;
    return age >= 0 && age < REACT_TIME ? age : -1;
  }

  glow(color) {
    let c = this.glows.get(color);
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.2, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      this.glows.set(color, c);
    }
    return c;
  }

  buildBackground(theme) {
    const { w, h } = this;
    const rng = makeRng(theme.name.length * 7919 + 13);
    // Tileable nebula at half resolution: every blob is drawn three times (y - h, y, y + h).
    const neb = document.createElement('canvas');
    neb.width = Math.max(1, Math.round(w / 2));
    neb.height = Math.max(1, Math.round(h / 2));
    const g = neb.getContext('2d');
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) {
      const x = rng.range(-0.1, 1.1) * neb.width;
      const y = rng.range(0, 1) * neb.height;
      const r = rng.range(0.25, 0.6) * Math.max(neb.width, neb.height);
      const color = theme.nebula[i % 2];
      for (const dy of [-neb.height, 0, neb.height]) {
        const grad = g.createRadialGradient(x, y + dy, 0, x, y + dy, r);
        grad.addColorStop(0, hexA(color, 0.22));
        grad.addColorStop(0.5, hexA(color, 0.08));
        grad.addColorStop(1, hexA(color, 0));
        g.fillStyle = grad;
        g.fillRect(0, 0, neb.width, neb.height);
      }
    }
    this.nebula = neb;
    this.starLayers = [0.04, 0.1, 0.22].map((depth, li) => {
      const n = Math.round((w * h) / (li === 0 ? 2600 : li === 1 ? 5200 : 11000));
      const stars = [];
      for (let i = 0; i < n; i++) {
        stars.push({ x: rng.range(0, w), y: rng.range(0, h), s: rng.range(0.6, 1.4) * (li + 1) * 0.7, tw: rng.range(1, 4), ph: rng.range(0, TAU), c: rng.chance(0.15) ? theme.nebula[rng.int(0, 1)] : '#ffffff' });
      }
      return { depth, stars };
    });
  }

  drawBackground(camY, time) {
    const { ctx, w, h, dpr, theme } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, theme.sky[0]);
    sky.addColorStop(1, theme.sky[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    // Whole-pixel offset with a 1px overlap so the two tiles never leave a hairline seam.
    const ny = Math.round(mod(-camY * this.scale * 0.08, h));
    ctx.drawImage(this.nebula, 0, ny - h, w, h + 1);
    ctx.drawImage(this.nebula, 0, ny, w, h);
    for (const layer of this.starLayers) {
      const off = -camY * this.scale * layer.depth;
      for (const st of layer.stars) {
        const y = mod(st.y + off, h);
        const a = 0.55 + 0.45 * Math.sin(time * st.tw + st.ph);
        ctx.globalAlpha = a;
        if (st.s > 1.6) {
          const g = this.glow(st.c);
          const s = st.s * 4;
          ctx.drawImage(g, st.x - s / 2, y - s / 2, s, s);
        } else {
          ctx.fillStyle = st.c;
          ctx.fillRect(st.x, y, st.s, st.s);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Set the world transform so world y `camY` sits at the screen's vertical center, scaled by `zoom` around the screen center. */
  worldTransform(camY, shakeX = 0, shakeY = 0, zoom = 1) {
    const { ctx, dpr } = this;
    const k = this.scale * zoom;
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (this.w / 2 - (WORLD_W / 2) * k + shakeX), dpr * (this.h / 2 - camY * k + shakeY));
  }

  /** Cached planet sprite; `res` is device pixels per world unit. */
  planetSprite(p, hue, res = this.scale * this.dpr) {
    let entry = this.sprites.get(p);
    if (entry && entry.res === res) return entry;
    const pad = p.ring ? p.r * 1.9 : p.r * 1.5;
    const size = Math.ceil(pad * 2 * res);
    const c = document.createElement('canvas');
    c.width = c.height = Math.max(4, size);
    const g = c.getContext('2d');
    const k = c.width / (pad * 2);
    g.setTransform(k, 0, 0, k, c.width / 2, c.height / 2);
    const r = p.r;
    const rng = makeRng(Math.round(p.x * 31 + p.y * 17) >>> 0);
    // Atmosphere glow.
    const atm = g.createRadialGradient(0, 0, r * 0.9, 0, 0, r * 1.45);
    atm.addColorStop(0, `hsla(${hue},100%,70%,0.45)`);
    atm.addColorStop(1, `hsla(${hue},100%,60%,0)`);
    g.fillStyle = atm;
    g.beginPath();
    g.arc(0, 0, r * 1.45, 0, TAU);
    g.fill();
    const tilt = rng.range(-0.5, 0.5);
    if (p.ring) drawPlanetRing(g, r, hue, tilt, true);
    // Body.
    const body = g.createRadialGradient(-r * 0.4, -r * 0.45, r * 0.1, 0, 0, r);
    body.addColorStop(0, `hsl(${hue},85%,74%)`);
    body.addColorStop(0.55, `hsl(${hue},70%,50%)`);
    body.addColorStop(1, `hsl(${(hue + 25) % 360},70%,22%)`);
    g.save();
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.clip();
    g.fillStyle = body;
    g.fillRect(-r, -r, r * 2, r * 2);
    // Surface bands and craters.
    g.rotate(rng.range(-0.6, 0.6));
    for (let i = 0; i < 4; i++) {
      g.fillStyle = `hsla(${(hue + rng.range(-30, 30) + 360) % 360},80%,${rng.range(30, 75)}%,0.18)`;
      g.fillRect(-r, rng.range(-r, r), r * 2, rng.range(r * 0.08, r * 0.3));
    }
    for (let i = 0; i < 5; i++) {
      const cx = rng.range(-r * 0.7, r * 0.7);
      const cy = rng.range(-r * 0.7, r * 0.7);
      const cr = rng.range(r * 0.06, r * 0.18);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.beginPath();
      g.arc(cx, cy, cr, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.beginPath();
      g.arc(cx - cr * 0.25, cy - cr * 0.25, cr * 0.6, 0, TAU);
      g.fill();
    }
    g.restore();
    // Terminator shadow and rim light.
    const shade = g.createLinearGradient(-r, -r, r, r);
    shade.addColorStop(0.45, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,10,0.55)');
    g.fillStyle = shade;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fill();
    g.strokeStyle = `hsla(${hue},100%,85%,0.5)`;
    g.lineWidth = r * 0.06;
    g.beginPath();
    g.arc(0, 0, r * 0.97, Math.PI * 1.05, Math.PI * 1.6);
    g.stroke();
    if (p.ring) drawPlanetRing(g, r, hue, tilt, false);
    entry = { canvas: c, half: pad, res };
    this.sprites.set(p, entry);
    return entry;
  }

  rockSprite(a, res) {
    const key = res ? `${a.seed}:${Math.round(a.r)}:${res.toFixed(2)}` : `${a.seed}:${Math.round(a.r)}`;
    let c = this.rocks.get(key);
    if (c) return c;
    const pad = a.r * 1.3;
    c = document.createElement('canvas');
    c.width = c.height = Math.max(4, Math.ceil(pad * 2 * (res || this.scale * this.dpr)));
    const g = c.getContext('2d');
    const k = c.width / (pad * 2);
    g.setTransform(k, 0, 0, k, c.width / 2, c.height / 2);
    const rng = makeRng(a.seed);
    const n = rng.int(8, 12);
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * TAU;
      const rr = a.r * rng.range(0.78, 1.1);
      if (i === 0) g.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
      else g.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
    }
    g.closePath();
    const grad = g.createRadialGradient(-a.r * 0.4, -a.r * 0.4, 1, 0, 0, a.r * 1.1);
    grad.addColorStop(0, '#b9a596');
    grad.addColorStop(0.6, '#6d5a4e');
    grad.addColorStop(1, '#2b211c');
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = 'rgba(255,140,90,0.75)';
    g.lineWidth = 2;
    g.stroke();
    for (let i = 0; i < 3; i++) {
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath();
      g.arc(rng.range(-a.r * 0.5, a.r * 0.5), rng.range(-a.r * 0.5, a.r * 0.5), a.r * rng.range(0.1, 0.22), 0, TAU);
      g.fill();
    }
    this.rocks.set(key, c);
    return c;
  }

  /**
   * Draw one frame.
   * view: { level, s, camY, time, fx, ship, trail, trailPts, aimLen, shipX, shipY, shipAngle, reduced,
   *         ghost?, hint?, zoom?, launchAge?, boosting?, slowmo? }
   */
  draw(view) {
    const { ctx, theme } = this;
    const { level, s, camY, time, fx } = view;
    const zoom = view.zoom || 1;
    this.drawBackground(camY, time);
    const shake = view.reduced ? 0 : fx.shake;
    const sx = shake ? (Math.random() - 0.5) * shake : 0;
    const sy = shake ? (Math.random() - 0.5) * shake : 0;
    this.worldTransform(camY, sx, sy, zoom);
    const vh = this.viewHeight(zoom);
    const top = camY - vh / 2 - 150;
    const bottom = camY + vh / 2 + 150;
    const t = s.t;

    this.drawWalls(top, bottom, zoom, level.bounce === true, time);

    // Gravity wells, moving-planet tracks and orbit rings (behind everything).
    const target = s.mode === 'orbit' ? s.pi + 1 : -1;
    let goal = null;
    let goalX = 0;
    let goalY = 0;
    for (let i = 0; i < level.planets.length; i++) {
      const p = level.planets[i];
      const reach = p.g > 0 ? p.orbit * 2.2 : p.orbit;
      if (p.y < top - reach || p.y > bottom + reach || s.gone[i]) continue;
      planetPos(p, t, tmp);
      if (p.g > 0) this.drawGravityHalo(p, tmp.x, tmp.y, time);
      if (p.mx) {
        ctx.strokeStyle = hexA(theme.accent, 0.12);
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 10]);
        ctx.beginPath();
        ctx.moveTo(p.x - p.mx, p.y);
        ctx.lineTo(p.x + p.mx, p.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      this.drawOrbitRing(p, tmp.x, tmp.y, i === s.pi && s.mode === 'orbit', i === target, time, this.reactAge(p, time));
      if (p.goal) {
        goal = p;
        goalX = tmp.x;
        goalY = tmp.y;
      }
    }

    this.drawHoles(level, top, bottom, time);
    this.drawWarps(level, top, bottom, time);
    this.drawLasers(level, t, top, bottom, time);

    for (let i = 0; i < level.planets.length; i++) {
      const p = level.planets[i];
      if (p.y < top - p.orbit || p.y > bottom + p.orbit || s.gone[i]) continue;
      planetPos(p, t, tmp);
      if (p.goal) {
        if (level.boss) this.drawBossPortal(tmp.x, tmp.y, p.r, time);
        else this.drawPortal(tmp.x, tmp.y, p.r, time);
        continue;
      }
      const hue = theme.planetHues[p.hue % theme.planetHues.length];
      const spr = this.planetSprite(p, hue);
      let jx = 0;
      let jy = 0;
      const left = s.crumbleAt[i] - t;
      if (p.crumble && left < 1.2 && left > 0 && !view.reduced) {
        const amt = (1.2 - left) * 3;
        jx = (Math.random() - 0.5) * amt;
        jy = (Math.random() - 0.5) * amt;
      }
      const ra = this.reactAge(p, time);
      if (ra < 0) ctx.drawImage(spr.canvas, tmp.x - spr.half + jx, tmp.y - spr.half + jy, spr.half * 2, spr.half * 2);
      else {
        // Squash-wobble after a capture: decaying ±10% scale oscillation.
        const wob = 0.1 * Math.sin(ra * 38) * (1 - ra / REACT_TIME);
        const hx = spr.half * (1 + wob);
        const hy = spr.half * (1 - wob);
        ctx.drawImage(spr.canvas, tmp.x - hx + jx, tmp.y - hy + jy, hx * 2, hy * 2);
      }
      if (p.crumble) this.drawCrumble(p, tmp.x + jx, tmp.y + jy, s.crumbleAt[i] === Infinity ? 1 : Math.max(0, left / p.crumble));
    }

    this.drawShards(level, s, top, bottom, time);
    this.drawCoins(level, s, top, bottom, time);
    const gold = level.gold;
    if (gold && !s.gold && gold.y > top && gold.y < bottom) this.drawGold(gold.x, gold.y, time);
    this.drawAsteroids(level, t, top, bottom);
    if (goal && s.mode === 'fly') {
      const R = goal.orbit * 2.5;
      const d = Math.hypot(view.shipX - goalX, view.shipY - goalY);
      if (d < R) this.drawSuction(goalX, goalY, goal.r * (level.boss ? 1.35 : 1), R, 1 - d / R, time);
    }
    const hint = view.hint;
    if (hint && hint.pts && hint.pts.length > 1) this.drawHint(hint, time);
    this.drawTrail(view.trailPts, view.trail, view.ship, time);
    if (s.mode === 'orbit' && view.aimLen > 0) this.drawAim(view.shipX, view.shipY, s, view.aimLen, time, !!(hint && hint.active));
    if (view.ghost) this.drawGhost(view.ghost);
    if (s.mode !== 'dead') this.drawShipAt(view, time);
    fx.draw(ctx, (c) => this.glow(c));

    // Flash overlay.
    if (fx.flash > 0) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.globalAlpha = Math.min(0.6, fx.flash);
      ctx.fillStyle = fx.flashColor;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.globalAlpha = 1;
    }
    if (view.slowmo > 0) this.drawSlowmo(view.slowmo);
    this.drawVignette();
  }

  drawWalls(top, bottom, zoom = 1, bounce = false, time = 0) {
    const { ctx, theme } = this;
    for (const x of [0, WORLD_W]) {
      const dir = x === 0 ? 1 : -1;
      const grad = ctx.createLinearGradient(x, 0, x + dir * 40, 0);
      grad.addColorStop(0, hexA(theme.accent, 0.3));
      grad.addColorStop(1, hexA(theme.accent, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(Math.min(x, x + dir * 40), top, 40, bottom - top);
    }
    // Dim the area outside the play column (wide screens, or zoomed out).
    const ext = this.w / 2 / (this.scale * zoom) - WORLD_W / 2;
    if (ext * this.scale * zoom > 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-ext, top, ext, bottom - top);
      ctx.fillRect(WORLD_W, top, ext, bottom - top);
    }
    if (bounce) {
      this.drawBounceWall(0, 1, top, bottom, time);
      this.drawBounceWall(WORLD_W, -1, top, bottom, time);
    }
  }

  /** Solid neon bouncy wall at world x `x`; `dir` points into the play area. */
  drawBounceWall(x, dir, top, bottom, time) {
    const { ctx, theme } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const grad = ctx.createLinearGradient(x, 0, x + dir * 36, 0);
    grad.addColorStop(0, hexA(theme.accent, 0.55));
    grad.addColorStop(1, hexA(theme.accent, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(Math.min(x, x + dir * 36), top, 36, bottom - top);
    ctx.fillStyle = theme.accent;
    ctx.fillRect(x - 5, top, 10, bottom - top);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 1.5, top, 3, bottom - top);
    // Inward-pointing chevrons scrolling along the wall.
    const gap = 44;
    const off = (time * 110) % gap;
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let y = Math.floor(top / gap) * gap - gap + off; y < bottom + gap; y += gap) {
      ctx.globalAlpha = 0.45 + 0.4 * Math.sin(y * 0.045 + time * 5);
      ctx.beginPath();
      ctx.moveTo(x + dir * 8, y - 10);
      ctx.lineTo(x + dir * 18, y);
      ctx.lineTo(x + dir * 8, y + 10);
      ctx.stroke();
    }
    // Energy pulses racing along the bar, anchored in world space.
    ctx.globalAlpha = 0.9;
    const spark = this.glow('#ffffff');
    const span = 600;
    for (let base = Math.floor(top / span) * span; base < bottom; base += span) {
      const py = base + mod(time * 320 + (dir > 0 ? 0 : span / 2), span);
      ctx.drawImage(spark, x - 12, py - 34, 24, 68);
    }
    ctx.restore();
  }

  drawOrbitRing(p, x, y, current, target, time, react = -1) {
    const { ctx, theme } = this;
    ctx.lineWidth = current ? 3 : 2.5;
    if (current) {
      ctx.strokeStyle = hexA(theme.accent, 0.55);
      ctx.setLineDash([]);
    } else {
      const a = target ? 0.45 + 0.25 * Math.sin(time * 5) : 0.18;
      ctx.strokeStyle = p.goal ? `rgba(255,215,90,${a + 0.15})` : `rgba(255,255,255,${a})`;
      ctx.setLineDash([10, 12]);
      ctx.lineDashOffset = -time * 30;
    }
    ctx.beginPath();
    ctx.arc(x, y, p.orbit, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    if (react >= 0) {
      // Capture flash: a bright accent ring that pops outward and fades.
      const k = 1 - react / REACT_TIME;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = k;
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 3 + 6 * k;
      ctx.beginPath();
      ctx.arc(x, y, p.orbit * (1 + 0.12 * (1 - k)), 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5 + 2 * k;
      ctx.beginPath();
      ctx.arc(x, y, p.orbit, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Soft pulsing gravity well around a giant planet, with contour rings sinking inward. */
  drawGravityHalo(p, x, y, time) {
    const { ctx, theme } = this;
    const R = p.orbit * 2.2;
    const pulse = 0.5 + 0.5 * Math.sin(time * 1.8 + p.y * 0.013);
    const grad = ctx.createRadialGradient(x, y, p.r * 0.8, x, y, R);
    grad.addColorStop(0, hexA(theme.accent, 0.13 + 0.07 * pulse));
    grad.addColorStop(0.55, hexA(theme.accent, 0.05 + 0.03 * pulse));
    grad.addColorStop(1, hexA(theme.accent, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const prog = (time * 0.22 + i / 3) % 1;
      ctx.globalAlpha = 0.16 * Math.sin(prog * Math.PI);
      ctx.beginPath();
      ctx.arc(x, y, R - (R - p.r) * prog, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawCrumble(p, x, y, frac) {
    const { ctx } = this;
    // Cracks get wider as the timer runs out; the red arc shows time left.
    ctx.strokeStyle = `rgba(30,10,0,${0.35 + 0.5 * (1 - frac)})`;
    ctx.lineWidth = 2 + 2 * (1 - frac);
    ctx.beginPath();
    const rng = makeRng(Math.round(p.x * 13 + p.y * 7) >>> 0);
    for (let i = 0; i < 4; i++) {
      const a = rng.range(0, TAU);
      ctx.moveTo(x + Math.cos(a) * p.r * 0.15, y + Math.sin(a) * p.r * 0.15);
      ctx.lineTo(x + Math.cos(a + 0.3) * p.r * 0.6, y + Math.sin(a + 0.3) * p.r * 0.6);
      ctx.lineTo(x + Math.cos(a - 0.1) * p.r * 0.98, y + Math.sin(a - 0.1) * p.r * 0.98);
    }
    ctx.stroke();
    ctx.strokeStyle = frac < 0.35 ? '#ff3b3b' : '#ffb03b';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(x, y, p.r + 8, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
    ctx.stroke();
  }

  drawPortal(x, y, r, time) {
    const { ctx, theme } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = this.glow(theme.accent);
    ctx.globalAlpha = 0.9;
    ctx.drawImage(g, x - r * 3, y - r * 3, r * 6, r * 6);
    ctx.globalAlpha = 1;
    for (let i = 0; i < 6; i++) {
      const rr = r * (0.35 + i * 0.15);
      ctx.strokeStyle = i % 2 ? '#ffffff' : theme.accent;
      ctx.globalAlpha = 0.8 - i * 0.1;
      ctx.lineWidth = 4 - i * 0.4;
      const a0 = time * (2.6 - i * 0.3) * (i % 2 ? -1 : 1) + i;
      ctx.beginPath();
      ctx.arc(x, y, rr, a0, a0 + Math.PI * 1.2);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#0a0418';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.3, 0, TAU);
    ctx.fill();
  }

  /** Boss portal: a bigger portal ringed by rotating red-gold spikes. */
  drawBossPortal(x, y, r, time) {
    const { ctx } = this;
    const R = r * 1.35;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55 + 0.15 * Math.sin(time * 4);
    const gs = R * 3.6;
    ctx.drawImage(this.glow('#ff2e3b'), x - gs, y - gs, gs * 2, gs * 2);
    ctx.restore();
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = 0.9;
    ctx.rotate(time * 0.7);
    drawStar(ctx, 0, 0, 16, R * 1.62, R * 1.1, '#a8102a', '#ffcf3f');
    ctx.rotate(-time * 2);
    drawStar(ctx, 0, 0, 11, R * 1.32, R * 0.98, '#ff5a1f', '#fff1a8');
    ctx.restore();
    this.drawPortal(x, y, R, time);
    ctx.strokeStyle = `rgba(255,60,60,${0.55 + 0.35 * Math.sin(time * 6)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, R * 0.42, 0, TAU);
    ctx.stroke();
  }

  /** Particles spiralling into the goal portal while the ship approaches (`close` 0..1). */
  drawSuction(x, y, r, R, close, time) {
    const { ctx } = this;
    const ga = this.glow(this.theme.accent);
    const gb = this.glow('#ffffff');
    const strength = Math.min(1, close * 1.8);
    const inner = r * 0.35;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 28; i++) {
      const prog = (time * 0.8 + i / 28) % 1;
      const rad = inner + (R - inner) * (1 - prog * prog);
      const ang = i * 2.39996 + prog * prog * 7;
      const sz = 2.5 + 3.5 * prog;
      ctx.globalAlpha = strength * Math.sin(prog * Math.PI) * 0.85;
      ctx.drawImage(i % 3 ? ga : gb, x + Math.cos(ang) * rad - sz, y + Math.sin(ang) * rad - sz, sz * 2, sz * 2);
    }
    ctx.restore();
  }

  drawHoles(level, top, bottom, time) {
    const { ctx } = this;
    for (const h of level.holes) {
      if (h.y < top - 200 || h.y > bottom + 200) continue;
      ctx.save();
      // Gravity well hint.
      const well = ctx.createRadialGradient(h.x, h.y, h.core, h.x, h.y, 170);
      well.addColorStop(0, 'rgba(120,60,255,0.25)');
      well.addColorStop(1, 'rgba(120,60,255,0)');
      ctx.fillStyle = well;
      ctx.beginPath();
      ctx.arc(h.x, h.y, 170, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 18; i++) {
        const prog = (time * 0.35 + i / 18) % 1;
        const rad = 150 * (1 - prog) + h.core;
        const ang = i * 2.39 + prog * 9;
        ctx.globalAlpha = prog * 0.9;
        const s = 4 + 6 * prog;
        ctx.drawImage(this.glow(i % 2 ? '#ffd23f' : '#ff6a3d'), h.x + Math.cos(ang) * rad - s, h.y + Math.sin(ang) * rad - s, s * 2, s * 2);
      }
      ctx.globalAlpha = 1;
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = i === 0 ? '#ffd23f' : i === 1 ? '#ff6a3d' : '#a35bff';
        ctx.lineWidth = 5 - i;
        const a0 = time * (3 - i * 0.7) + i * 2;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.core * (1.35 + i * 0.35), a0, a0 + Math.PI * 1.3);
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.core, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,220,150,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  drawWarps(level, top, bottom, time) {
    const { ctx } = this;
    level.warps.forEach((w, i) => {
      const color = WARP_COLORS[i % WARP_COLORS.length];
      const visA = w.ay > top - 60 && w.ay < bottom + 60;
      const visB = w.by > top - 60 && w.by < bottom + 60;
      if (!visA && !visB) return;
      ctx.save();
      ctx.strokeStyle = hexA(color, 0.14);
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 14]);
      ctx.lineDashOffset = -time * 40;
      ctx.beginPath();
      ctx.moveTo(w.ax, w.ay);
      ctx.lineTo(w.bx, w.by);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalCompositeOperation = 'lighter';
      for (const [x, y, sgn] of [
        [w.ax, w.ay, 1],
        [w.bx, w.by, -1],
      ]) {
        ctx.globalAlpha = 0.6;
        ctx.drawImage(this.glow(color), x - w.r * 2, y - w.r * 2, w.r * 4, w.r * 4);
        ctx.globalAlpha = 1;
        for (let k = 0; k < 4; k++) {
          ctx.strokeStyle = k % 2 ? '#ffffff' : color;
          ctx.lineWidth = 3;
          const a0 = sgn * time * (3 + k) + k * 1.6;
          ctx.beginPath();
          ctx.arc(x, y, w.r * (0.35 + k * 0.2), a0, a0 + Math.PI);
          ctx.stroke();
        }
      }
      ctx.restore();
    });
  }

  drawLasers(level, t, top, bottom, time) {
    const { ctx } = this;
    for (const l of level.lasers) {
      if (Math.max(l.y1, l.y2) < top || Math.min(l.y1, l.y2) > bottom) continue;
      const ph = laserPhase(l, t);
      const on = ph < l.on;
      const warn = !on && l.period - ph < 0.45;
      ctx.save();
      if (on) {
        ctx.globalCompositeOperation = 'lighter';
        const jitter = 1 + 0.15 * Math.sin(time * 60);
        for (const [wid, col] of [
          [18 * jitter, 'rgba(255,40,90,0.25)'],
          [8, 'rgba(255,60,110,0.8)'],
          [2.5, '#ffffff'],
        ]) {
          ctx.strokeStyle = col;
          ctx.lineWidth = wid;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(l.x1, l.y1);
          ctx.lineTo(l.x2, l.y2);
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = warn ? `rgba(255,80,120,${0.45 + 0.4 * Math.sin(time * 40)})` : 'rgba(255,80,120,0.32)';
        ctx.lineWidth = warn ? 4 : 3;
        ctx.setLineDash([3, 9]);
        ctx.beginPath();
        ctx.moveTo(l.x1, l.y1);
        ctx.lineTo(l.x2, l.y2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
      for (const [x, y] of [
        [l.x1, l.y1],
        [l.x2, l.y2],
      ]) {
        ctx.fillStyle = '#2a0f1f';
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, TAU);
        ctx.fill();
        ctx.fillStyle = on || warn ? '#ff4d7d' : '#7a2945';
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, TAU);
        ctx.fill();
      }
    }
  }

  drawAsteroids(level, t, top, bottom) {
    const { ctx } = this;
    for (const a of level.asteroids) {
      if (a.kind === 'spin') {
        if (a.y + a.R < top || a.y - a.R > bottom) continue;
        ctx.strokeStyle = 'rgba(255,140,90,0.13)';
        ctx.lineWidth = 2;
        ctx.setLineDash([2, 10]);
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.R, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (a.y < top - 40 || a.y > bottom + 40) continue;
      asteroidPos(a, t, tmp);
      this.drawRock(a, tmp.x, tmp.y, t * a.spin);
    }
  }

  drawRock(a, x, y, rot, res) {
    const { ctx } = this;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35;
    const gs = a.r * 2.4;
    ctx.drawImage(this.glow('#ff5a2a'), x - gs, y - gs, gs * 2, gs * 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    const spr = this.rockSprite(a, res);
    const half = a.r * 1.3;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.drawImage(spr, -half, -half, half * 2, half * 2);
    ctx.restore();
  }

  drawShards(level, s, top, bottom, time) {
    level.shards.forEach((sh, i) => {
      if (s.shards & (1 << i) || sh.y < top || sh.y > bottom) return;
      this.drawShard(sh.x, sh.y + Math.sin(time * 3 + i) * 4, time);
    });
  }

  drawShard(x, y, time) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.8;
    ctx.drawImage(this.glow('#ffcf3f'), -34, -34, 68, 68);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.rotate(time * 1.5);
    drawStar(ctx, 0, 0, 4, 15, 6, '#fff3a8', '#ffb300');
    ctx.restore();
  }

  drawCoins(level, s, top, bottom, time) {
    const coins = level.coins;
    if (!coins) return;
    const got = s.coinGot;
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if ((got && got[i]) || c.y < top || c.y > bottom) continue;
      this.drawCoin(c.x, c.y + Math.sin(time * 3 + i * 1.7) * 3, time + i * 0.37);
    }
  }

  /** Spinning gold coin (the face narrows as it turns edge-on). */
  drawCoin(x, y, time, r = 9) {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
    const gs = r * 2.6;
    ctx.drawImage(this.glow('#ffc93f'), x - gs, y - gs, gs * 2, gs * 2);
    ctx.restore();
    const c = Math.cos(time * 4);
    const wx = Math.max(0.15, Math.abs(c)) * r;
    ctx.fillStyle = c > 0 ? '#ffd23f' : '#e8a11a';
    ctx.strokeStyle = '#fff4b8';
    ctx.lineWidth = r * 0.16;
    ctx.beginPath();
    ctx.ellipse(x, y, wx, r, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    if (wx > r * 0.35) {
      ctx.strokeStyle = 'rgba(150,90,0,0.7)';
      ctx.lineWidth = r * 0.12;
      ctx.beginPath();
      ctx.ellipse(x, y, wx * 0.58, r * 0.58, 0, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.ellipse(x - wx * 0.38, y - r * 0.38, wx * 0.16, r * 0.24, 0, 0, TAU);
      ctx.fill();
    }
  }

  /** The secret gold shard: big spinning 5-point star with rays, strong glow and orbiting sparkles. */
  drawGold(x, y, time) {
    const { ctx } = this;
    const pulse = 0.5 + 0.5 * Math.sin(time * 5);
    ctx.save();
    ctx.translate(x, y + Math.sin(time * 2.4) * 5);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.85;
    ctx.drawImage(this.glow('#ffb300'), -60, -60, 120, 120);
    ctx.globalAlpha = 0.35 + 0.3 * pulse;
    ctx.drawImage(this.glow('#fff3a8'), -30, -30, 60, 60);
    ctx.rotate(-time * 0.5);
    ctx.fillStyle = '#ffd86b';
    ctx.globalAlpha = 0.16 + 0.1 * pulse;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a - 0.07) * 56, Math.sin(a - 0.07) * 56);
      ctx.lineTo(Math.cos(a + 0.07) * 56, Math.sin(a + 0.07) * 56);
      ctx.closePath();
    }
    ctx.fill();
    ctx.rotate(time * 1.9);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    drawStar(ctx, 0, 0, 5, 24, 10, '#ffcf2e', '#fff6c2');
    drawStar(ctx, 0, 0, 5, 11, 4.6, '#fff8d6', '#ffb300');
    ctx.rotate(-time * 1.4);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 4; i++) {
      const a = time * 1.6 + (i / 4) * TAU;
      const rr = 32 + 5 * Math.sin(time * 3 + i);
      const tw = 0.5 + 0.5 * Math.sin(time * 7 + i * 2.3);
      ctx.globalAlpha = 0.4 + 0.6 * tw;
      sparkle(ctx, Math.cos(a) * rr, Math.sin(a) * rr, 2 + 5 * tw);
    }
    ctx.restore();
  }

  drawAim(x, y, s, len, time, green = false) {
    const { ctx } = this;
    const d = launchDir(s);
    const step = 18;
    const offset = (time * 60) % step;
    ctx.fillStyle = green ? '#6dff9a' : '#ffffff';
    for (let k = offset; k < len; k += step) {
      const a = 1 - k / len;
      ctx.globalAlpha = a * 0.9;
      ctx.beginPath();
      ctx.arc(x + d.x * k, y + d.y * k, 3.2 * (0.5 + a * 0.5), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Recommended flight path as a dotted line; bright pulsing green when `active`. */
  drawHint(hint, time) {
    const { ctx } = this;
    const pts = hint.pts;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (hint.active) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 8);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = '#3dff7a';
      ctx.globalAlpha = 0.12 + 0.08 * pulse;
      ctx.lineWidth = 12;
      ctx.stroke();
      ctx.strokeStyle = '#7dffa6';
      ctx.globalAlpha = 0.6 + 0.35 * pulse;
      ctx.lineWidth = 4 + 1.5 * pulse;
      ctx.setLineDash([1, 13]);
      ctx.lineDashOffset = -time * 60;
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#b8ffc8';
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 3.5;
      ctx.setLineDash([1, 13]);
      ctx.lineDashOffset = -time * 30;
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Static trail + ship preview for the shop, drawn onto another canvas context `g`. */
  drawTrailPreview(g, trail, ship) {
    const pts = [];
    for (let i = 0; i < 36; i++) {
      const k = i / 35;
      pts.push({ x: 20 + k * 200, y: 150 - Math.sin(k * 2.4) * 90 + k * 20, a: -0.6 });
    }
    this.drawTrail.call({ ctx: g, glow: (c) => this.glow(c) }, pts, trail, ship, 0.5);
    const end = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    g.save();
    g.translate(end.x, end.y);
    g.rotate(Math.atan2(end.y - prev.y, end.x - prev.x));
    drawShip(g, ship, 40);
    g.restore();
  }

  drawTrail(pts, trail, ship, time) {
    if (!pts || pts.length < 2) return;
    const { ctx } = this;
    const n = pts.length;
    ctx.save();
    ctx.lineCap = 'round';
    switch (trail.style) {
      case 'line':
      case 'rainbow':
      case 'zigzag': {
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 1; i < n; i++) {
          const k = i / n;
          let ax = pts[i - 1].x;
          let ay = pts[i - 1].y;
          let bx = pts[i].x;
          let by = pts[i].y;
          if (trail.style === 'zigzag') {
            const nx = -(by - ay);
            const ny = bx - ax;
            const nl = Math.hypot(nx, ny) || 1;
            const o1 = Math.sin((i - 1) * 1.3 + time * 20) * 6 * k;
            const o2 = Math.sin(i * 1.3 + time * 20) * 6 * k;
            ax += (nx / nl) * o1;
            ay += (ny / nl) * o1;
            bx += (nx / nl) * o2;
            by += (ny / nl) * o2;
          }
          ctx.strokeStyle = trail.colors[(trail.style === 'rainbow' ? Math.floor(i / 2) : i) % trail.colors.length];
          ctx.globalAlpha = k * 0.85;
          ctx.lineWidth = 1 + k * 7;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
        break;
      }
      case 'fire':
      case 'bubbles':
      case 'sparkle':
      case 'stars': {
        if (trail.style === 'fire' || trail.style === 'sparkle') ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < n; i += trail.style === 'stars' ? 3 : 1) {
          const k = i / n;
          const p = pts[i];
          const color = trail.colors[i % trail.colors.length];
          ctx.globalAlpha = k;
          if (trail.style === 'fire') {
            const s = 4 + k * 12;
            ctx.drawImage(this.glow(color), p.x - s, p.y - s, s * 2, s * 2);
          } else if (trail.style === 'bubbles') {
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(p.x + Math.sin(i + time * 4) * 3, p.y, 2 + k * 6, 0, TAU);
            ctx.stroke();
          } else if (trail.style === 'sparkle') {
            const tw = 0.5 + 0.5 * Math.sin(time * 18 + i * 2.1);
            const s = (3 + k * 7) * tw;
            ctx.drawImage(this.glow(color), p.x - s, p.y - s, s * 2, s * 2);
          } else {
            drawStar(ctx, p.x, p.y, 5, 3 + k * 7, 1.5 + k * 3, color, color);
          }
        }
        break;
      }
      case 'echo': {
        for (let i = 0; i < n; i += 5) {
          const k = i / n;
          const p = pts[i];
          ctx.globalAlpha = k * 0.35;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.a || 0);
          drawShip(ctx, { ...ship, color: trail.colors[0] }, 26, false);
          ctx.restore();
        }
        break;
      }
      case 'aurora': {
        // Wide wavy translucent ribbon, one band per color, fading toward the tail.
        ctx.globalCompositeOperation = 'lighter';
        const nc = trail.colors.length;
        for (let b = 0; b < nc; b++) {
          ctx.fillStyle = trail.colors[b];
          const shift = (b - (nc - 1) / 2) * 5;
          let plx = 0;
          let ply = 0;
          let prx = 0;
          let pry = 0;
          for (let i = 0; i < n; i++) {
            const k = i / (n - 1);
            const p = pts[i];
            normalAt(pts, i, nrm);
            const off = (Math.sin(i * 0.32 - time * 4 + b * 2.1) * 7 + shift) * k;
            const half = (3 + k * 15) * (0.65 + 0.35 * Math.sin(i * 0.21 + time * 3 + b));
            const cx = p.x + nrm.x * off;
            const cy = p.y + nrm.y * off;
            const lx = cx + nrm.x * half;
            const ly = cy + nrm.y * half;
            const rx = cx - nrm.x * half;
            const ry = cy - nrm.y * half;
            if (i > 0) {
              ctx.globalAlpha = k * k * 0.3;
              ctx.beginPath();
              ctx.moveTo(plx, ply);
              ctx.lineTo(lx, ly);
              ctx.lineTo(rx, ry);
              ctx.lineTo(prx, pry);
              ctx.closePath();
              ctx.fill();
            }
            plx = lx;
            ply = ly;
            prx = rx;
            pry = ry;
          }
        }
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = 0.22;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
        break;
      }
      case 'helix': {
        // Two thin strands twisting around the path, with glowing beads where they cross.
        ctx.globalCompositeOperation = 'lighter';
        const nc = trail.colors.length;
        for (let strand = 0; strand < 2; strand++) {
          ctx.strokeStyle = trail.colors[strand % nc];
          let px = 0;
          let py = 0;
          for (let i = 0; i < n; i++) {
            const k = i / (n - 1);
            normalAt(pts, i, nrm);
            const off = Math.sin(i * 0.55 - time * 12 + strand * Math.PI) * (3 + 7 * k);
            const x = pts[i].x + nrm.x * off;
            const y = pts[i].y + nrm.y * off;
            if (i > 0) {
              ctx.globalAlpha = k * 0.9;
              ctx.lineWidth = 1 + k * 1.8;
              ctx.beginPath();
              ctx.moveTo(px, py);
              ctx.lineTo(x, y);
              ctx.stroke();
            }
            px = x;
            py = y;
          }
        }
        const bead = this.glow(trail.colors[2 % nc]);
        for (let i = 0; i < n; i++) {
          if (Math.abs(Math.sin(i * 0.55 - time * 12)) > 0.28) continue;
          const k = i / (n - 1);
          const s = 2 + 4 * k;
          ctx.globalAlpha = k;
          ctx.drawImage(bead, pts[i].x - s, pts[i].y - s, s * 2, s * 2);
        }
        break;
      }
      case 'pulse': {
        // Hollow rings dropped along the path that expand as they age.
        ctx.globalCompositeOperation = 'lighter';
        const nc = trail.colors.length;
        ctx.strokeStyle = trail.colors[0];
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
        for (let i = 0; i < n; i++) {
          const id = ptId(pts[i]);
          if (id % 6) continue;
          const k = i / (n - 1);
          ctx.strokeStyle = trail.colors[Math.floor(id / 6) % nc];
          ctx.globalAlpha = k * 0.85;
          ctx.lineWidth = 0.8 + 2.6 * k;
          ctx.beginPath();
          ctx.arc(pts[i].x, pts[i].y, 3 + (1 - k) * 22, 0, TAU);
          ctx.stroke();
        }
        break;
      }
      case 'comet': {
        // One fat glowing head tapering to a thin tail, with sparks scattered off it.
        ctx.globalCompositeOperation = 'lighter';
        const nc = trail.colors.length;
        for (let i = 1; i < n; i++) {
          const k = i / (n - 1);
          ctx.strokeStyle = trail.colors[Math.min(nc - 1, Math.floor((1 - k) * nc))];
          ctx.globalAlpha = 0.1 + k * 0.8;
          ctx.lineWidth = 1 + k * k * k * 16;
          ctx.beginPath();
          ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
          ctx.lineTo(pts[i].x, pts[i].y);
          ctx.stroke();
        }
        const head = pts[n - 1];
        ctx.globalAlpha = 0.9;
        ctx.drawImage(this.glow(trail.colors[0]), head.x - 26, head.y - 26, 52, 52);
        ctx.drawImage(this.glow('#ffffff'), head.x - 10, head.y - 10, 20, 20);
        for (let i = 0; i < n; i++) {
          const id = ptId(pts[i]);
          if (id % 3) continue;
          const k = i / (n - 1);
          normalAt(pts, i, nrm);
          const off = (hash(id) - 0.5) * 2 * (4 + (1 - k) * 24);
          const s = 1 + 2.2 * hash(id + 0.5);
          ctx.fillStyle = trail.colors[id % nc];
          ctx.globalAlpha = k * (0.55 + 0.45 * Math.sin(time * 20 + id));
          ctx.fillRect(pts[i].x + nrm.x * off - s / 2, pts[i].y + nrm.y * off - s / 2, s, s);
        }
        break;
      }
      case 'petal': {
        // Small spinning petals shed alternately to each side, drifting away from the path.
        const nc = trail.colors.length;
        for (let i = 0; i < n; i++) {
          const id = ptId(pts[i]);
          if (id % 4) continue;
          const k = i / (n - 1);
          const age = 1 - k;
          const side = (id >> 2) & 1 ? 1 : -1;
          normalAt(pts, i, nrm);
          const drift = age * (10 + 14 * hash(id)) * side;
          const x = pts[i].x + nrm.x * drift + Math.sin(time * 2 + id) * age * 4;
          const y = pts[i].y + nrm.y * drift + age * 8;
          const sz = 0.5 + 0.5 * k;
          ctx.globalAlpha = Math.min(1, k * 1.2) * 0.9;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(time * 3 * side + id);
          ctx.fillStyle = trail.colors[id % nc];
          ctx.beginPath();
          ctx.ellipse(0, 0, 7 * sz, 2.8 * sz, 0, 0, TAU);
          ctx.fill();
          ctx.globalAlpha *= 0.5;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.ellipse(-1.5 * sz, 0, 3 * sz, 0.9 * sz, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
        break;
      }
      default:
        break;
    }
    ctx.restore();
  }

  drawShipAt(view, time) {
    const { ctx } = this;
    const { s, shipX: x, shipY: y, shipAngle: a, ship } = view;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    if (view.boosting) {
      ctx.globalCompositeOperation = 'lighter';
      this.drawBoostFlame(time);
      ctx.globalCompositeOperation = 'source-over';
    } else if (s.mode === 'fly') {
      ctx.globalCompositeOperation = 'lighter';
      const fl = 12 + Math.random() * 8;
      ctx.drawImage(this.glow('#ffb347'), -16 - fl, -8, fl + 6, 16);
      ctx.globalCompositeOperation = 'source-over';
    }
    // Lean into the orbit: the heading is the tangent, the planet lies on the `dir` side.
    if (s.mode === 'orbit') ctx.rotate(s.dir < 0 ? -LEAN : LEAN);
    const la = view.launchAge;
    if (la >= 0 && la < SQUASH_TIME) {
      const k = 1 - la / SQUASH_TIME;
      const e = k * k * (3 - 2 * k);
      ctx.scale(1 + 0.35 * e, 1 - 0.25 * e);
    }
    drawShip(ctx, ship, 32);
    ctx.restore();
    if (s.shields > 0 || s.inv > 0) {
      const blink = s.inv > 0 ? 0.3 + 0.3 * Math.sin(time * 40) : 0.35;
      ctx.strokeStyle = `rgba(120,220,255,${blink})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, 20, 0, TAU);
      ctx.stroke();
    }
  }

  /** Boost exhaust in ship space (pointing +x): a long layered flame plus speed streaks. */
  drawBoostFlame(time) {
    const { ctx } = this;
    const fl = 34 + Math.random() * 16;
    ctx.globalAlpha = 0.85;
    ctx.drawImage(this.glow('#ff5a2a'), -16 - fl * 1.5, -15, fl * 1.5 + 8, 30);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.glow('#ffb347'), -16 - fl, -10, fl + 6, 20);
    ctx.drawImage(this.glow('#ffffff'), -14 - fl * 0.5, -5, fl * 0.5 + 4, 10);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const ly = (i - 2) * 7 + ((i * 3) % 5) - 2;
      const ph = (time * 5 + i * 0.37) % 1;
      const x0 = -24 - ph * 70;
      ctx.globalAlpha = 0.5 * (1 - ph);
      ctx.beginPath();
      ctx.moveTo(x0, ly);
      ctx.lineTo(x0 - 18 - 10 * ((i * 7) % 3), ly);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** The best-run ghost ship: translucent, faint glow, no trail. */
  drawGhost(g) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.2;
    ctx.drawImage(this.glow(g.ship.color), -22, -22, 44, 44);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.35;
    ctx.rotate(g.ang);
    drawShip(ctx, g.ship, 32, false);
    ctx.restore();
  }

  /** Cool-blue screen-edge tint for slow motion (`v` 0..1). */
  drawSlowmo(v) {
    const { ctx, w, h, dpr } = this;
    if (!this.slowVig || this.slowVig.w !== w || this.slowVig.h !== h) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
      g.addColorStop(0, 'rgba(70,160,255,0)');
      g.addColorStop(0.65, 'rgba(70,160,255,0.22)');
      g.addColorStop(1, 'rgba(120,200,255,0.75)');
      this.slowVig = { g, w, h };
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = Math.min(1, v) * 0.6;
    ctx.fillStyle = this.slowVig.g;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  drawVignette() {
    const { ctx, w, h, dpr } = this;
    if (!this.vignette || this.vignette.w !== w || this.vignette.h !== h) {
      const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.55)');
      this.vignette = { g: v, w, h };
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = this.vignette.g;
    ctx.fillRect(0, 0, w, h);
  }

  /** Lightweight background-only frame for menus. */
  drawMenu(time, camY) {
    this.drawBackground(camY, time);
    this.drawVignette();
  }

  /**
   * Draw a centered codex illustration of `kind` onto another context `g` (w×h, in g's current units)
   * over a transparent background, using the current theme.
   */
  drawCodex(g, kind, w, h, time = 0) {
    const ext = CODEX_EXT[kind];
    if (!ext || !this.theme) return;
    const k = Math.min(w, h) / ext;
    const m = g.getTransform ? g.getTransform() : null;
    const res = k * (m ? Math.hypot(m.a, m.b) : 1);
    const saved = this.ctx;
    this.ctx = g;
    g.save();
    g.translate(w / 2, h / 2);
    g.scale(k, k);
    try {
      this.drawCodexScene(kind, time, res);
    } finally {
      g.restore();
      this.ctx = saved;
    }
  }

  drawCodexScene(kind, time, res) {
    const { ctx, theme } = this;
    const planet = (p, x, y) => {
      const spr = this.planetSprite(p, theme.planetHues[p.hue % theme.planetHues.length], res);
      ctx.drawImage(spr.canvas, x - spr.half, y - spr.half, spr.half * 2, spr.half * 2);
    };
    switch (kind) {
      case 'planet':
      case 'ringed':
      case 'crumbler':
      case 'giant': {
        const p = CODEX_P[kind];
        if (kind === 'giant') this.drawGravityHalo(p, 0, 0, time);
        this.drawOrbitRing(p, 0, 0, false, true, time);
        planet(p, 0, 0);
        if (kind === 'crumbler') this.drawCrumble(p, 0, 0, 0.55);
        break;
      }
      case 'drifter': {
        const p = CODEX_P.drifter;
        const span = 48;
        const x = Math.sin(time * 1.4) * span;
        ctx.save();
        ctx.strokeStyle = hexA(theme.accent, 0.35);
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 10]);
        ctx.beginPath();
        ctx.moveTo(-span, 0);
        ctx.lineTo(span, 0);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = hexA(theme.accent, 0.7);
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (const d of [-1, 1]) {
          const ax = d * (span + p.orbit - 4);
          ctx.moveTo(ax - d * 8, -10);
          ctx.lineTo(ax + d * 2, 0);
          ctx.lineTo(ax - d * 8, 10);
        }
        ctx.stroke();
        ctx.restore();
        this.drawOrbitRing(p, x, 0, false, true, time);
        planet(p, x, 0);
        break;
      }
      case 'asteroid':
        this.drawRock(CODEX_ROCK, 0, 0, time * 0.8 + 0.4, res);
        break;
      case 'moon': {
        const m = CODEX_MOON;
        planet(CODEX_P.host, 0, 0);
        ctx.strokeStyle = 'rgba(255,140,90,0.3)';
        ctx.lineWidth = 2;
        ctx.setLineDash([2, 10]);
        ctx.beginPath();
        ctx.arc(0, 0, m.R, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        asteroidPos(m, time, tmp);
        this.drawRock(m, tmp.x, tmp.y, time * m.spin, res);
        break;
      }
      case 'laser':
        this.drawLasers(CODEX_LASER, time, -1e9, 1e9, time);
        break;
      case 'hole':
        this.drawHoles(CODEX_HOLE, -1e9, 1e9, time);
        break;
      case 'warp':
        this.drawWarps(CODEX_WARP, -1e9, 1e9, time);
        break;
      case 'portal':
        this.drawPortal(0, 0, 40, time);
        break;
      case 'boss':
        this.drawBossPortal(0, 0, 40, time);
        break;
      case 'shard':
        this.drawShard(0, 0, time);
        break;
      case 'gold':
        this.drawGold(0, 0, time);
        break;
      case 'coin':
        this.drawCoin(0, 0, time, 12);
        break;
      case 'bounce': {
        this.drawBounceWall(-70, 1, -105, 105, time);
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([1, 11]);
        ctx.lineDashOffset = -time * 40;
        ctx.beginPath();
        ctx.moveTo(80, -90);
        ctx.lineTo(-58, 0);
        ctx.lineTo(80, 90);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = theme.accent;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(-58, 0, 12, 0, TAU);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
        ctx.translate(80, 90);
        ctx.rotate(Math.atan2(90, 138));
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(-8, 8);
        ctx.lineTo(-8, -8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
      }
      default:
        break;
    }
  }
}

function drawPlanetRing(g, r, hue, tilt, back) {
  g.save();
  g.rotate(tilt);
  g.beginPath();
  g.ellipse(0, 0, r * 1.75, r * 0.45, 0, back ? Math.PI : 0, back ? TAU : Math.PI);
  g.strokeStyle = `hsla(${(hue + 40) % 360},90%,80%,${back ? 0.35 : 0.7})`;
  g.lineWidth = r * 0.14;
  g.stroke();
  g.beginPath();
  g.ellipse(0, 0, r * 1.5, r * 0.36, 0, back ? Math.PI : 0, back ? TAU : Math.PI);
  g.strokeStyle = `hsla(${(hue + 60) % 360},90%,70%,${back ? 0.25 : 0.5})`;
  g.lineWidth = r * 0.06;
  g.stroke();
  g.restore();
}

export function drawStar(ctx, x, y, points, outer, inner, fill, stroke) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (i / (points * 2)) * TAU - Math.PI / 2;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.stroke();
}

export function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function mod(a, m) {
  return ((a % m) + m) % m;
}

/** Unit normal of the path at point `i` (from its neighbors), written into `out`. */
function normalAt(pts, i, out) {
  const a = pts[i > 0 ? i - 1 : 0];
  const b = pts[i < pts.length - 1 ? i + 1 : i];
  const nx = -(b.y - a.y);
  const ny = b.x - a.x;
  const l = Math.hypot(nx, ny) || 1;
  out.x = nx / l;
  out.y = ny / l;
  return out;
}

function ptId(p) {
  let id = ptIds.get(p);
  if (id === undefined) {
    id = ++ptSerial;
    ptIds.set(p, id);
  }
  return id;
}

/** Deterministic pseudo-random value in [0, 1) for `v`. */
function hash(v) {
  const x = Math.sin(v * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function sparkle(ctx, x, y, s) {
  ctx.fillRect(x - s, y - 0.8, s * 2, 1.6);
  ctx.fillRect(x - 0.8, y - s, 1.6, s * 2);
}
