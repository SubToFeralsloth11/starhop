// One play session: fixed-step simulation, input, camera, trail, effects and sound for a level,
// the daily challenge, endless mode, or the title-screen attract demo (autopilot).
import { DT, createState, launchDir, planetPos, syncState, step } from './sim.js';
import { findWindows } from './solver.js';

const TRAIL_LEN = 36;
const RESTART_DELAY = 0.9;
const WIN_DELAY = 1.0;
const ENDLESS_LOOKAHEAD = 5; // request a new chunk when this few planets remain above the ship
const MAX_FRAME = 0.1;

export class Game {
  /**
   * hooks: { onEnd(result), onHud(hud), onFirstLaunch(), haptic(pattern), onEndlessChunk(chunkIndex) }
   */
  constructor(renderer, sound, fx, hooks) {
    this.r = renderer;
    this.sound = sound;
    this.fx = fx;
    this.hooks = hooks;
    this.active = false;
    this.paused = false;
  }

  /**
   * opts: { mode: 'level'|'daily'|'endless'|'demo', theme, ship, trail, shields, magnetR, aimLen,
   *         reduced, tutorial, gen (GenClient, endless only) }
   */
  start(level, opts) {
    this.level = level;
    this.opts = opts;
    this.attempts = 0;
    this.active = true;
    this.paused = false;
    this.r.setTheme(opts.theme);
    this.chunkPending = false;
    this.reset();
    this.cam = this.s.y;
  }

  reset() {
    const { opts, level } = this;
    this.s = createState(level, { shields: opts.shields, magnetR: opts.magnetR, events: true });
    this.prevX = this.s.x;
    this.prevY = this.s.y;
    this.acc = 0;
    this.queued = false;
    this.endTimer = -1;
    this.trail = [];
    this.attempts++;
    this.combo = 0;
    this.fx.clear();
    this.demoLaunchAt = -1;
    this.ended = false;
  }

  stop() {
    this.active = false;
  }

  launch() {
    if (!this.active || this.paused || this.opts.mode === 'demo') return;
    if (this.s.mode === 'orbit') this.queued = true;
  }

  frame(rawDt, time) {
    if (!this.active) return;
    const dt = Math.min(MAX_FRAME, rawDt);
    if (!this.paused) {
      this.acc += dt;
      while (this.acc >= DT) {
        this.acc -= DT;
        this.tick();
      }
      this.fx.update(dt);
      this.updateTimers(dt);
    }
    this.render(dt, time);
  }

  tick() {
    const s = this.s;
    this.prevX = s.x;
    this.prevY = s.y;
    if (this.opts.mode === 'demo') this.autopilot();
    const launch = this.queued && s.mode === 'orbit';
    this.queued = false;
    step(this.level, s, launch);
    for (const e of s.ev) this.handle(e);
    s.ev.length = 0;
    if (this.opts.mode === 'endless') this.feedEndless();
  }

  autopilot() {
    const s = this.s;
    if (s.mode !== 'orbit') return;
    if (this.demoLaunchAt < 0) {
      const w = findWindows(this.level, s, 1);
      this.demoLaunchAt = w.length ? w[0].k : 9999;
      this.demoWait = 0;
    }
    if (this.demoWait++ >= this.demoLaunchAt) {
      this.queued = true;
      this.demoLaunchAt = -1;
    }
  }

  feedEndless() {
    const { level, s } = this;
    if (this.chunkPending || level.planets.length - 1 - s.maxPi > ENDLESS_LOOKAHEAD) return;
    this.chunkPending = true;
    const start = level.planets[level.planets.length - 1];
    const runLevel = level;
    this.opts.gen.endless(level.seed, level.chunks, start).then((chunk) => {
      if (this.level !== runLevel) return;
      this.hooks.applyChunk(level, chunk);
      syncState(level, this.s);
      this.chunkPending = false;
    });
  }

  handle(e) {
    const { fx, sound, opts } = this;
    const accent = opts.theme.accent;
    switch (e.type) {
      case 'launch':
        sound.play('launch');
        fx.burst(e.x, e.y, 10, 160, ['#ffffff', accent], 0.4, 4);
        this.hooks.haptic(8);
        if (opts.mode !== 'demo' && this.attempts === 1 && this.s.launches === 1) this.hooks.onFirstLaunch?.();
        break;
      case 'capture': {
        const p = this.level.planets[e.pi];
        this.combo++;
        sound.play('capture', this.combo);
        fx.ring(e.x, e.y, accent, 70, 0.45, 5);
        fx.burst(e.x, e.y, 14, 220, [accent, '#ffffff'], 0.5, 4);
        if (p && !p.goal && e.pi === this.s.maxPi) fx.text(e.x, e.y - 30, `+${e.hops}`, '#ffffff', 24);
        this.hooks.haptic(15);
        break;
      }
      case 'shard':
        sound.play('shard');
        fx.burst(e.sx, e.sy, 22, 260, ['#ffe066', '#ffffff', '#ffb300'], 0.7, 5);
        fx.ring(e.sx, e.sy, '#ffd23f', 60, 0.4, 4);
        fx.text(e.sx, e.sy - 26, '★', '#ffd23f', 30);
        this.hooks.haptic(20);
        break;
      case 'shield':
        sound.play('shield');
        fx.ring(e.x, e.y, '#7ee8ff', 60, 0.5, 6);
        fx.burst(e.x, e.y, 20, 240, ['#7ee8ff', '#ffffff'], 0.5, 4);
        fx.addShake(8);
        this.hooks.haptic([20, 30, 20]);
        break;
      case 'warp':
        sound.play('warp');
        fx.burst(e.x, e.y, 18, 200, ['#3dffd8', '#ffffff'], 0.5, 4);
        fx.ring(e.tx, e.ty, '#3dffd8', 60, 0.4, 4);
        break;
      case 'crumble': {
        const p = this.level.planets[e.pi];
        sound.play('crumble');
        if (p) {
          const hue = opts.theme.planetHues[p.hue % opts.theme.planetHues.length];
          for (let i = 0; i < 26; i++) {
            const a = Math.random() * Math.PI * 2;
            const v = 60 + Math.random() * 200;
            const at = planetPos(p, this.s.t);
            fx.spawn(at.x + Math.cos(a) * p.r * 0.5, at.y + Math.sin(a) * p.r * 0.5, Math.cos(a) * v, Math.sin(a) * v, 1.1, 5 + Math.random() * 6, `hsl(${hue},60%,${30 + Math.random() * 30}%)`, 0.96, false);
          }
          fx.addShake(6);
        }
        break;
      }
      case 'dead':
        sound.play('crash');
        fx.burst(e.x, e.y, 40, 380, ['#ff4d4d', '#ffb347', '#ffffff', opts.ship.color], 0.9, 6);
        fx.ring(e.x, e.y, '#ff6a3d', 110, 0.6, 8);
        fx.addShake(18);
        fx.addFlash(0.35, '#ff3b3b');
        this.hooks.haptic([40, 40, 80]);
        this.combo = 0;
        this.endTimer = RESTART_DELAY;
        break;
      case 'win':
        sound.play('win');
        fx.burst(e.x, e.y, 60, 420, [accent, '#ffffff', '#ffd23f'], 1.1, 6);
        fx.ring(e.x, e.y, '#ffd23f', 160, 0.8, 8);
        fx.addFlash(0.4, '#ffffff');
        this.hooks.haptic([30, 50, 30, 50, 60]);
        this.endTimer = WIN_DELAY;
        break;
      default:
        break;
    }
  }

  updateTimers(dt) {
    if (this.endTimer < 0 || this.ended) return;
    this.endTimer -= dt;
    if (this.endTimer > 0) return;
    const s = this.s;
    if (this.opts.mode === 'demo') {
      this.hooks.onEnd({ mode: 'demo', won: s.mode === 'won' });
      return;
    }
    if (s.mode === 'dead' && this.opts.mode !== 'endless') {
      this.hooks.onCrash?.(s);
      this.reset();
      return;
    }
    this.ended = true;
    this.hooks.onEnd({ mode: this.opts.mode, won: s.mode === 'won', s, attempts: this.attempts, time: s.t - (this.level.t0 || 0) });
  }

  shipPose() {
    const s = this.s;
    const a = this.paused ? 1 : Math.min(1, this.acc / DT);
    // Snap instead of interpolating across a teleport or a capture snap.
    const jump = Math.hypot(s.x - this.prevX, s.y - this.prevY) > 60;
    const x = jump ? s.x : this.prevX + (s.x - this.prevX) * a;
    const y = jump ? s.y : this.prevY + (s.y - this.prevY) * a;
    let ang;
    if (s.mode === 'fly') ang = Math.atan2(s.vy, s.vx);
    else {
      const d = launchDir(s);
      ang = Math.atan2(d.y, d.x);
    }
    return { x, y, ang };
  }

  render(dt, time) {
    const s = this.s;
    const pose = this.shipPose();
    if (!this.paused && s.mode !== 'dead') {
      this.trail.push({ x: pose.x, y: pose.y, a: pose.ang });
      if (this.trail.length > TRAIL_LEN) this.trail.shift();
    } else if (s.mode === 'dead' && this.trail.length) this.trail.shift();
    const target = pose.y - this.r.viewH * 0.14;
    this.cam += (target - this.cam) * (1 - Math.exp(-dt * 4.5));
    this.r.draw({
      level: this.level,
      s,
      camY: this.cam,
      time,
      fx: this.fx,
      ship: this.opts.ship,
      trail: this.opts.trail,
      trailPts: this.trail,
      aimLen: this.opts.aimLen,
      shipX: pose.x,
      shipY: pose.y,
      shipAngle: pose.ang,
      reduced: this.opts.reduced,
    });
    if (this.opts.mode !== 'demo') {
      this.hooks.onHud({
        hops: s.hops,
        total: this.level.planets.length - 1,
        maxPi: s.maxPi,
        shards: s.shards,
        shardCount: this.level.shards.length,
        time: s.t - (this.level.t0 || 0),
        par: this.level.par,
        attempts: this.attempts,
        shields: s.shields,
        crumbleLeft: s.mode === 'orbit' && Number.isFinite(s.crumbleAt[s.pi]) ? s.crumbleAt[s.pi] - s.t : null,
      });
    }
  }
}
