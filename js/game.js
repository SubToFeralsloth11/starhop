// One play session: fixed-step simulation, input, camera, trail, effects and sound for a level,
// the daily challenge, weekly stages, shard hunts, endless/zen runs, or the title-screen demo.
import { DT, cloneState, createState, hazardProximity, launchDir, nearMiss, planetPos, step, syncState } from './sim.js';
import { findWindows } from './solver.js';

const TRAIL_LEN = 36;
const RESTART_DELAY = 0.9;
const WIN_DELAY = 1.0;
const ENDLESS_LOOKAHEAD = 5; // request a new chunk when this few planets remain above the ship
const MAX_FRAME = 0.1;
const BOOST_HOLD = 0.15; // seconds a press must be held before it boosts (a normal tap never does)
const SLOWMO_TIME = 0.45; // real seconds of near-miss slow motion
const SLOWMO_SCALE = 0.35;
const HINT_AFTER = 5; // failed attempts on a level before the hint path appears
const ZOOM_OUT = 0.84;

/** Launch and crash effects per ship: [palette-driven pattern for launch, pattern for crash]. */
const SHIP_FX = {
  comet: ['ring', 'burst'],
  dart: ['sparks', 'sparks'],
  manta: ['spiral', 'spiral'],
  saucer: ['rings', 'rings'],
  phoenix: ['petals', 'phoenix'],
  beetle: ['sparks', 'burst'],
  needle: ['needle', 'sparks'],
  crown: ['crown', 'crown'],
  hammer: ['shock', 'shock'],
  specter: ['spiral', 'ghost'],
  nova: ['nova', 'nova'],
  singularity: ['implode', 'implode'],
  aurum: ['crown', 'petals'],
};

export class Game {
  /**
   * hooks: { onEnd(result), onHud(hud), onCrash(state, game), onFirstLaunch(), haptic(pattern), applyChunk(level, chunk), onDiscover(level) }
   */
  constructor(renderer, sound, fx, hooks) {
    this.r = renderer;
    this.sound = sound;
    this.fx = fx;
    this.hooks = hooks;
    this.active = false;
    this.paused = false;
    this.holding = false;
    this.holdT = 0;
    this.now = 0;
  }

  /**
   * opts: { mode: 'level'|'daily'|'weekly'|'hunt'|'endless'|'zen'|'attack'|'versus'|'demo', theme, ship, trail,
   *         mods (sim modifiers: shields, magnetR, shipR, revives, flightMax, crumbleMul, fuel, perfect),
   *         aimLen, speed (time scale), dir (start orbit direction), reduced, ghost (recorded run),
   *         hints (bool), oneLife (bool), gen (GenClient, endless/zen) }
   */
  start(level, opts) {
    this.level = level;
    this.opts = opts;
    this.attempts = 0;
    this.active = true;
    this.paused = false;
    this.r.setTheme(opts.theme);
    this.chunkPending = false;
    this.zoom = 1;
    this.reset();
    this.cam = this.s.y;
  }

  simOpts() {
    const { opts } = this;
    return { ...(opts.mods || {}), dir: opts.dir || 1, zen: opts.mode === 'zen', events: true };
  }

  reset() {
    const { opts, level } = this;
    this.s = createState(level, this.simOpts());
    this.startShields = this.s.shields;
    this.prevX = this.s.x;
    this.prevY = this.s.y;
    this.acc = 0;
    this.queued = false;
    this.flipQueued = false;
    this.endTimer = -1;
    this.trail = [];
    this.attempts++;
    this.combo = 0;
    this.fx.clear();
    this.demoLaunchAt = -1;
    this.ended = false;
    this.launchT = null; // sim time of this attempt's first launch: the level clock starts here
    this.tickN = 0;
    this.rec = { l: [], f: [], b: [] }; // this attempt's inputs, for the best-run ghost
    this.boostOn = false;
    this.lastLaunchAt = -Infinity;
    this.slow = 0;
    this.nearCd = 0;
    this.nearMisses = 0;
    this.hazardTick = 0;
    this.hint = null;
    this.sound.setIntensity(0);
    // Ghost: replay the stored best run alongside this attempt.
    const g = opts.ghost;
    this.ghost = g ? { rec: g, s: createState(level, { ...g.o, dir: opts.dir || 1 }), ship: g.shipObj } : null;
    if (this.ghost) this.ghost.boost = new Set(expandRanges(g.b));
    if (this.hintsOn()) this.computeHint();
  }

  /** Seconds since the first launch of this attempt (0 while still waiting on the start planet). */
  elapsed() {
    if (this.level.timeLimit) return this.s.t - (this.level.t0 || 0);
    return this.launchT == null ? 0 : this.s.t - this.launchT;
  }

  stop() {
    this.active = false;
    this.sound.setHazards(null);
    this.sound.setIntensity(0);
  }

  launch() {
    if (!this.active || this.paused || this.opts.mode === 'demo') return;
    if (this.s.mode === 'orbit') this.queued = true;
  }

  /** Reverse the orbit direction (only while orbiting). */
  flip() {
    if (!this.active || this.paused || this.opts.mode === 'demo') return;
    if (this.s.mode === 'orbit') this.flipQueued = true;
  }

  press() {
    this.holding = true;
    this.holdT = 0;
    this.launch();
  }

  release() {
    this.holding = false;
  }

  frame(rawDt, time) {
    if (!this.active) return;
    this.now = time;
    const dt = Math.min(MAX_FRAME, rawDt);
    if (!this.paused) {
      if (this.holding) this.holdT += dt;
      if (this.slow > 0) this.slow -= dt;
      if (this.nearCd > 0) this.nearCd -= dt;
      const scale = (this.opts.speed || 1) * (this.slow > 0 ? SLOWMO_SCALE : 1);
      this.acc += dt * scale;
      while (this.acc >= DT) {
        this.acc -= DT;
        this.tick();
      }
      this.fx.update(dt);
      this.updateTimers(dt);
      const flying = this.s.mode === 'fly' && this.s.flyT > 0.35;
      const target = flying ? ZOOM_OUT : 1;
      this.zoom += (target - this.zoom) * (1 - Math.exp(-dt * 2.2));
      if (++this.hazardTick % 3 === 0 && this.opts.mode !== 'demo') this.sound.setHazards(hazardProximity(this.level, this.s));
    }
    this.render(dt, time);
  }

  tick() {
    const s = this.s;
    this.prevX = s.x;
    this.prevY = s.y;
    if (this.opts.mode === 'demo') this.autopilot();
    const launch = this.queued && s.mode === 'orbit';
    const flip = this.flipQueued && s.mode === 'orbit' && !launch;
    this.queued = false;
    this.flipQueued = false;
    const boost = this.holding && this.holdT >= BOOST_HOLD && s.mode === 'fly';
    if (launch) this.rec.l.push(this.tickN);
    if (flip) this.rec.f.push(this.tickN);
    if (boost !== this.boostOn) {
      this.rec.b.push(this.tickN);
      this.boostOn = boost;
      if (boost && s.fuel > 0) this.sound.play('boost');
    }
    step(this.level, s, launch, boost, flip);
    if (launch && this.launchT == null) this.launchT = s.t - DT;
    for (const e of s.ev) this.handle(e);
    s.ev.length = 0;
    this.tickGhost();
    this.tickN++;
    // The trail samples simulation ticks, so its length in time is the same at any refresh rate.
    if (s.mode !== 'dead') {
      this.trail.push({ x: s.x, y: s.y, a: this.heading() });
      if (this.trail.length > TRAIL_LEN) this.trail.shift();
    } else if (this.trail.length) this.trail.shift();
    if (s.mode === 'fly' && this.nearCd <= 0 && this.opts.mode !== 'demo') {
      const kind = nearMiss(this.level, s);
      if (kind) {
        this.nearMisses++;
        this.nearCd = 0.9;
        this.sound.play('nearmiss');
        this.fx.text(s.x, s.y - 34, 'Close!', '#9fe8ff', 22);
        if (!this.opts.reduced) this.slow = SLOWMO_TIME;
      }
    }
    if (this.opts.mode === 'endless' || this.opts.mode === 'zen') this.feedEndless();
    if (this.hint && s.mode === 'fly') this.hint.active = false;
    // Missed the cue while still orbiting: point at the next window instead.
    if (this.hint && s.mode === 'orbit' && this.tickN > this.hint.at + 3) this.computeHint();
  }

  tickGhost() {
    const g = this.ghost;
    if (!g || g.s.mode === 'dead' || g.s.mode === 'won') return;
    const n = this.tickN;
    step(this.level, g.s, g.rec.l.includes(n), g.boost.has(n), g.rec.f.includes(n));
  }

  heading() {
    const s = this.s;
    if (s.mode === 'fly') return Math.atan2(s.vy, s.vx);
    const d = launchDir(s);
    return Math.atan2(d.y, d.x);
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

  hintsOn() {
    const m = this.opts.mode;
    return this.opts.hints && this.attempts > HINT_AFTER && (m === 'level' || m === 'daily' || m === 'weekly' || m === 'attack');
  }

  /** The solver's next launch from the current orbit: the path it flies and when to tap. */
  computeHint() {
    const s = this.s;
    if (s.mode !== 'orbit') return;
    const probe = cloneState(s);
    const w = findWindows(this.level, probe, 1);
    if (!w.length) {
      this.hint = null;
      return;
    }
    const c = cloneState(s);
    for (let i = 0; i < w[0].k; i++) step(this.level, c, false);
    step(this.level, c, true);
    const pts = [{ x: c.x, y: c.y }];
    for (let i = 0; i < 400 && c.mode === 'fly'; i++) {
      step(this.level, c, false);
      if (i % 3 === 0) pts.push({ x: c.x, y: c.y });
    }
    this.hint = { pts, at: this.tickN + w[0].k, active: false };
  }

  feedEndless() {
    const { level, s } = this;
    if (this.chunkPending || level.planets.length - 1 - s.maxPi > ENDLESS_LOOKAHEAD) return;
    this.chunkPending = true;
    const start = level.planets[level.planets.length - 1];
    const runLevel = level;
    this.opts.gen.endless(level.seed, level.chunks, start, this.opts.mode === 'zen').then((chunk) => {
      if (this.level !== runLevel) return;
      this.hooks.applyChunk(level, chunk);
      syncState(level, this.s);
      if (this.ghost) syncState(level, this.ghost.s);
      this.chunkPending = false;
    }, (err) => console.error(err)); // A failed chunk leaves the run parked on its top planet.
  }

  /** Ship-specific launch / crash effect. */
  shipFx(kind, x, y, crash) {
    const { fx } = this;
    const ship = this.opts.ship;
    const cols = [ship.color, ship.accent, '#ffffff'];
    const d = launchDir(this.s);
    const back = crash ? { x: 0, y: 0 } : { x: -d.x, y: -d.y };
    const n = crash ? 1.8 : 1;
    switch (kind) {
      case 'sparks':
        fx.sparks(x, y, back.x || 1, back.y, cols, Math.round(12 * n), 340);
        if (crash) fx.sparks(x, y, -1, 0, cols, 14, 340);
        break;
      case 'spiral':
        fx.spiral(x, y, cols, Math.round(14 * n), 220);
        break;
      case 'rings':
        fx.ring(x, y, ship.color, 50 * n, 0.4, 4);
        fx.ring(x, y, ship.accent, 80 * n, 0.55, 3);
        break;
      case 'petals':
        fx.petals(x, y, ['#ff9b3d', '#ffe08a', '#ff5c3d'], Math.round(12 * n));
        break;
      case 'phoenix':
        fx.burst(x, y, 30, 300, ['#ff9b3d', '#ffe08a', '#ff3d3d'], 0.9, 6);
        fx.petals(x, y, ['#ffb347', '#ff6a3d'], 18);
        break;
      case 'needle':
        fx.sparks(x, y, back.x || 1, back.y, [ship.accent, '#ffffff'], 8, 520);
        break;
      case 'crown':
        fx.burst(x, y, Math.round(14 * n), 200, ['#ffd23f', '#fff6c2', '#ffffff'], 0.7, 4);
        fx.text(x, y - 20, '✦', '#ffd23f', 26);
        break;
      case 'shock':
        fx.ring(x, y, ship.accent, 120 * n, 0.45, 7);
        fx.addShake(crash ? 0 : 3);
        break;
      case 'ghost':
        fx.spiral(x, y, [ship.color, '#ffffff'], 26, 160, 1.1);
        break;
      case 'nova':
        fx.burst(x, y, Math.round(20 * n), 320, ['#ff3df5', '#ffe3fd', '#ffffff'], 0.6, 5);
        fx.ring(x, y, '#ff3df5', 90 * n, 0.4, 4);
        break;
      case 'implode':
        fx.ring(x, y, ship.accent, 100 * n, 0.5, 6);
        fx.spiral(x, y, [ship.accent, '#7a3dff'], Math.round(16 * n), 180);
        break;
      default:
        if (crash) fx.burst(x, y, 20, 260, cols, 0.8, 5);
        else fx.ring(x, y, ship.color, 60, 0.4, 4);
        break;
    }
  }

  handle(e) {
    const { fx, sound, opts } = this;
    const accent = opts.theme.accent;
    const kinds = SHIP_FX[opts.ship.id] || SHIP_FX.comet;
    switch (e.type) {
      case 'launch':
        sound.play('launch');
        fx.burst(e.x, e.y, 10, 160, ['#ffffff', accent], 0.4, 4);
        this.shipFx(kinds[0], e.x, e.y, false);
        this.lastLaunchAt = this.now;
        this.hooks.haptic(8);
        if (e.chain) {
          sound.play('chain', this.s.chains);
          fx.text(e.x, e.y - 30, 'Chain!', '#7dffc4', 22);
        }
        if (opts.mode !== 'demo' && this.attempts === 1 && this.s.launches === 1) this.hooks.onFirstLaunch?.();
        break;
      case 'capture': {
        const p = this.level.planets[e.pi];
        this.combo++;
        sound.play('capture', this.combo);
        sound.setIntensity(this.combo >= 10 ? 2 : this.combo >= 5 ? 1 : 0);
        if (p) this.r.react(p, this.now);
        fx.ring(e.x, e.y, accent, 70, 0.45, 5);
        fx.burst(e.x, e.y, 14, 220, [accent, '#ffffff'], 0.5, 4);
        if (e.perfect) {
          sound.play('perfect', e.run);
          fx.text(e.x, e.y - 58, e.run > 1 ? `Perfect ×${e.run}` : 'Perfect!', '#ffd23f', 26);
          fx.ring(e.x, e.y, '#ffd23f', 110, 0.5, 4);
        }
        if (p && !p.goal && e.pi === this.s.maxPi) fx.text(e.x, e.y - 30, `+${e.hops}`, '#ffffff', 24);
        this.hooks.haptic(15);
        if (this.hintsOn() && p && !p.goal) this.computeHint();
        break;
      }
      case 'shard':
        sound.play('shard');
        fx.burst(e.sx, e.sy, 22, 260, ['#ffe066', '#ffffff', '#ffb300'], 0.7, 5);
        fx.ring(e.sx, e.sy, '#ffd23f', 60, 0.4, 4);
        fx.text(e.sx, e.sy - 26, '★', '#ffd23f', 30);
        this.hooks.haptic(20);
        break;
      case 'coin':
        sound.play('pickup');
        fx.burst(e.sx, e.sy, 8, 140, ['#ffd23f', '#fff3a8'], 0.4, 3);
        fx.text(e.sx, e.sy - 20, '+2', '#ffd23f', 18);
        break;
      case 'gold':
        sound.play('gold');
        fx.burst(e.sx, e.sy, 40, 360, ['#ffd23f', '#fff8d6', '#ffb300', '#ffffff'], 1.1, 6);
        fx.ring(e.sx, e.sy, '#ffd23f', 160, 0.8, 7);
        fx.text(e.sx, e.sy - 40, 'GOLD SHARD!', '#ffd23f', 30);
        fx.addFlash(0.3, '#ffd23f');
        this.hooks.haptic([30, 30, 60]);
        break;
      case 'shield':
        sound.play('shield');
        fx.ring(e.x, e.y, '#7ee8ff', 60, 0.5, 6);
        fx.burst(e.x, e.y, 20, 240, ['#7ee8ff', '#ffffff'], 0.5, 4);
        fx.addShake(8);
        this.hooks.haptic([20, 30, 20]);
        break;
      case 'revive':
        sound.play('revive');
        fx.petals(e.x, e.y, ['#ff9b3d', '#ffe08a', '#ff3d3d'], 20);
        fx.ring(this.s.x, this.s.y, '#ffb347', 90, 0.6, 6);
        fx.text(this.s.x, this.s.y - 36, 'Reborn!', '#ffb347', 26);
        this.hooks.haptic([20, 20, 40]);
        break;
      case 'respawn':
        sound.play('flip');
        fx.ring(this.s.x, this.s.y, accent, 60, 0.5, 4);
        break;
      case 'flip':
        sound.play('flip');
        fx.ring(e.x, e.y, accent, 40, 0.3, 3);
        if (this.hintsOn()) this.computeHint();
        break;
      case 'bounce':
        sound.play('bounce');
        fx.sparks(e.x, e.y, e.x < 360 ? 1 : -1, 0, ['#ff8af7', '#4dfcff', '#ffffff'], 12, 300);
        fx.addShake(3);
        this.hooks.haptic(10);
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
          const at = planetPos(p, this.s.t);
          for (let i = 0; i < 26; i++) {
            const a = Math.random() * Math.PI * 2;
            const v = 60 + Math.random() * 200;
            fx.spawn(at.x + Math.cos(a) * p.r * 0.5, at.y + Math.sin(a) * p.r * 0.5, Math.cos(a) * v, Math.sin(a) * v, 1.1, 5 + Math.random() * 6, `hsl(${hue},60%,${30 + Math.random() * 30}%)`, 0.96, false);
          }
          fx.addShake(6);
        }
        break;
      }
      case 'dead':
        sound.play('crash');
        fx.burst(e.x, e.y, 40, 380, ['#ff4d4d', '#ffb347', '#ffffff', opts.ship.color], 0.9, 6);
        this.shipFx(kinds[1], e.x, e.y, true);
        fx.ring(e.x, e.y, '#ff6a3d', 110, 0.6, 8);
        fx.addShake(18);
        fx.addFlash(0.35, '#ff3b3b');
        this.hooks.haptic([40, 40, 80]);
        this.combo = 0;
        sound.setIntensity(0);
        this.endTimer = RESTART_DELAY;
        this.failText = failMessage(e);
        if (this.failText) fx.text(e.x, e.y - 40, this.failText, '#ffd0d0', 22);
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

  /** Inputs of the current attempt, in the compact form stored as a ghost. */
  recording() {
    const b = this.rec.b.slice();
    if (b.length % 2) b.push(this.tickN);
    return { l: this.rec.l.slice(), f: this.rec.f.slice(), b, o: { ...(this.opts.mods || {}) }, ship: this.opts.ship.id };
  }

  /** Per-run stats for missions and records. */
  runStats() {
    const s = this.s;
    return { hops: s.hops, perfects: s.perfects, chains: s.chains, coins: s.coins, boostT: s.boostT, flips: s.flips, bounces: s.bounces, nearMisses: this.nearMisses, revives: this.opts.mods ? (this.opts.mods.revives || 0) - s.revives : 0, hits: this.startShields - s.shields };
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
    if (s.mode === 'dead' && !this.opts.oneLife) {
      this.hooks.onCrash?.(s, this);
      if (!this.active) return;
      this.reset();
      return;
    }
    this.ended = true;
    this.hooks.onEnd({ mode: this.opts.mode, won: s.mode === 'won', s, attempts: this.attempts, time: this.elapsed(), run: this.runStats(), ghost: this.recording() });
  }

  shipPose() {
    const s = this.s;
    const a = this.paused ? 1 : Math.min(1, this.acc / DT);
    // Snap instead of interpolating across a teleport or a capture snap.
    const jump = Math.hypot(s.x - this.prevX, s.y - this.prevY) > 60;
    const x = jump ? s.x : this.prevX + (s.x - this.prevX) * a;
    const y = jump ? s.y : this.prevY + (s.y - this.prevY) * a;
    return { x, y, ang: this.heading() };
  }

  ghostPose() {
    const g = this.ghost;
    if (!g || g.s.mode === 'dead' || g.s.mode === 'won' || this.opts.mode === 'demo') return null;
    const gs = g.s;
    const d = gs.mode === 'fly' ? Math.atan2(gs.vy, gs.vx) : Math.atan2(launchDir(gs).y, launchDir(gs).x);
    return { x: gs.x, y: gs.y, ang: d, ship: g.ship };
  }

  render(dt, time) {
    const s = this.s;
    const pose = this.shipPose();
    const target = pose.y - this.r.viewHeight(this.zoom) * 0.14;
    this.cam += (target - this.cam) * (1 - Math.exp(-dt * 4.5));
    if (this.hint) this.hint.active = s.mode === 'orbit' && Math.abs(this.tickN - this.hint.at) <= 3;
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
      ghost: this.ghostPose(),
      hint: this.hint && s.mode === 'orbit' ? this.hint : null,
      zoom: this.opts.reduced ? 1 : this.zoom,
      launchAge: time - this.lastLaunchAt,
      boosting: s.boosting,
      slowmo: this.slow > 0 ? Math.min(1, this.slow / SLOWMO_TIME) : 0,
    });
    if (this.opts.mode !== 'demo') {
      this.hooks.onHud({
        hops: s.hops,
        total: this.level.planets.length - 1,
        maxPi: s.maxPi,
        shards: s.shards,
        shardCount: this.level.shards.length,
        time: this.elapsed(),
        par: this.level.par,
        timeLimit: this.level.timeLimit || 0,
        attempts: this.attempts,
        shields: s.shields,
        fuel: s.fuelMax ? s.fuel / s.fuelMax : 0,
        flying: s.mode === 'fly',
        orbiting: s.mode === 'orbit',
        coins: s.coins,
        crumbleLeft: s.mode === 'orbit' && Number.isFinite(s.crumbleAt[s.pi]) ? s.crumbleAt[s.pi] - s.t : null,
      });
    }
  }
}

/** Expand [start, end, start, end, ...] tick ranges into the ticks inside them. */
function expandRanges(b) {
  const out = [];
  for (let i = 0; i + 1 < b.length; i += 2) for (let t = b[i]; t < b[i + 1]; t++) out.push(t);
  return out;
}

/** "Almost!" feedback for a crash. */
function failMessage(e) {
  if (e.cause === 'lost') {
    if (!Number.isFinite(e.miss)) return 'Lost in space';
    const px = Math.max(1, Math.round(e.miss));
    return px < 60 ? `Almost! Missed by ${px}` : `Missed by ${px}`;
  }
  return { asteroid: 'Hit an asteroid', laser: 'Zapped by a laser', hole: 'Swallowed by a black hole', crumble: 'The planet crumbled', time: 'Out of time' }[e.cause] || '';
}
