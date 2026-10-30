// Canvas renderer: parallax space background, planets, hazards, ship, trails and effects.
import { WORLD_W, asteroidPos, laserPhase, launchDir, planetPos } from './sim.js';
import { drawShip } from './ships.js';
import { makeRng } from './rng.js';

const TAU = Math.PI * 2;
const WARP_COLORS = ['#3dffd8', '#ff6bd6', '#ffd23f', '#7a8cff'];
const MAX_DPR = 2;
const tmp = { x: 0, y: 0 };

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.glows = new Map();
    this.sprites = new WeakMap();
    this.rocks = new Map();
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
    const ny = mod(-camY * this.scale * 0.08, h);
    ctx.drawImage(this.nebula, 0, ny - h, w, h);
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

  /** Set the world transform so world y `camY` sits at the screen's vertical center. */
  worldTransform(camY, shakeX = 0, shakeY = 0) {
    const { ctx, dpr, scale } = this;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (this.offX + shakeX), dpr * (this.h / 2 - camY * scale + shakeY));
  }

  planetSprite(p, hue) {
    let entry = this.sprites.get(p);
    if (entry) return entry;
    const pad = p.ring ? p.r * 1.9 : p.r * 1.5;
    const size = Math.ceil(pad * 2 * this.scale * this.dpr);
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
    entry = { canvas: c, half: pad };
    this.sprites.set(p, entry);
    return entry;
  }

  rockSprite(a) {
    const key = `${a.seed}:${Math.round(a.r)}`;
    let c = this.rocks.get(key);
    if (c) return c;
    const pad = a.r * 1.3;
    c = document.createElement('canvas');
    c.width = c.height = Math.max(4, Math.ceil(pad * 2 * this.scale * this.dpr));
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
   * view: { level, s, camY, time, fx, ship, trail, trailPts, aimLen, ghost, reduced }
   */
  draw(view) {
    const { ctx, theme } = this;
    const { level, s, camY, time, fx } = view;
    this.drawBackground(camY, time);
    const shake = view.reduced ? 0 : fx.shake;
    const sx = shake ? (Math.random() - 0.5) * shake : 0;
    const sy = shake ? (Math.random() - 0.5) * shake : 0;
    this.worldTransform(camY, sx, sy);
    const top = camY - this.viewH / 2 - 150;
    const bottom = camY + this.viewH / 2 + 150;
    const t = s.t;

    this.drawWalls(top, bottom);

    // Moving-planet tracks and orbit rings (behind everything).
    const target = s.mode === 'orbit' ? s.pi + 1 : -1;
    for (let i = 0; i < level.planets.length; i++) {
      const p = level.planets[i];
      if (p.y < top - p.orbit || p.y > bottom + p.orbit || s.gone[i]) continue;
      planetPos(p, t, tmp);
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
      this.drawOrbitRing(p, tmp.x, tmp.y, i === s.pi && s.mode === 'orbit', i === target, time);
    }

    this.drawHoles(level, top, bottom, time);
    this.drawWarps(level, top, bottom, time);
    this.drawLasers(level, t, top, bottom, time);

    for (let i = 0; i < level.planets.length; i++) {
      const p = level.planets[i];
      if (p.y < top - p.orbit || p.y > bottom + p.orbit || s.gone[i]) continue;
      planetPos(p, t, tmp);
      if (p.goal) {
        this.drawPortal(tmp.x, tmp.y, p.r, time);
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
      ctx.drawImage(spr.canvas, tmp.x - spr.half + jx, tmp.y - spr.half + jy, spr.half * 2, spr.half * 2);
      if (p.crumble) this.drawCrumble(p, tmp.x + jx, tmp.y + jy, s.crumbleAt[i] === Infinity ? 1 : Math.max(0, left / p.crumble));
    }

    this.drawShards(level, s, top, bottom, time);
    this.drawAsteroids(level, t, top, bottom);
    this.drawTrail(view.trailPts, view.trail, view.ship, time);
    if (s.mode === 'orbit' && view.aimLen > 0) this.drawAim(view.shipX, view.shipY, s, view.aimLen, time);
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
    this.drawVignette();
  }

  drawWalls(top, bottom) {
    const { ctx, theme } = this;
    for (const x of [0, WORLD_W]) {
      const dir = x === 0 ? 1 : -1;
      const grad = ctx.createLinearGradient(x, 0, x + dir * 40, 0);
      grad.addColorStop(0, hexA(theme.accent, 0.3));
      grad.addColorStop(1, hexA(theme.accent, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(Math.min(x, x + dir * 40), top, 40, bottom - top);
    }
    if (this.offX > 1) {
      // Dim the area outside the play column on wide screens.
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      const ext = this.offX / this.scale;
      ctx.fillRect(-ext, top, ext, bottom - top);
      ctx.fillRect(WORLD_W, top, ext, bottom - top);
    }
  }

  drawOrbitRing(p, x, y, current, target, time) {
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
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35;
      const gs = a.r * 2.4;
      ctx.drawImage(this.glow('#ff5a2a'), tmp.x - gs, tmp.y - gs, gs * 2, gs * 2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      const spr = this.rockSprite(a);
      const half = a.r * 1.3;
      ctx.save();
      ctx.translate(tmp.x, tmp.y);
      ctx.rotate(t * a.spin);
      ctx.drawImage(spr, -half, -half, half * 2, half * 2);
      ctx.restore();
    }
  }

  drawShards(level, s, top, bottom, time) {
    const { ctx } = this;
    level.shards.forEach((sh, i) => {
      if (s.shards & (1 << i) || sh.y < top || sh.y > bottom) return;
      const bob = Math.sin(time * 3 + i) * 4;
      ctx.save();
      ctx.translate(sh.x, sh.y + bob);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.8;
      ctx.drawImage(this.glow('#ffcf3f'), -34, -34, 68, 68);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.rotate(time * 1.5);
      drawStar(ctx, 0, 0, 4, 15, 6, '#fff3a8', '#ffb300');
      ctx.restore();
    });
  }

  drawAim(x, y, s, len, time) {
    const { ctx } = this;
    const d = launchDir(s);
    const step = 18;
    const offset = (time * 60) % step;
    for (let k = offset; k < len; k += step) {
      const a = 1 - k / len;
      ctx.globalAlpha = a * 0.9;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x + d.x * k, y + d.y * k, 3.2 * (0.5 + a * 0.5), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
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
    if (s.mode === 'fly') {
      ctx.globalCompositeOperation = 'lighter';
      const fl = 12 + Math.random() * 8;
      ctx.drawImage(this.glow('#ffb347'), -16 - fl, -8, fl + 6, 16);
      ctx.globalCompositeOperation = 'source-over';
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
