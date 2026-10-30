// Synthesized sound effects and generative ambient music (WebAudio, no audio files).

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
// Four-chord progressions (semitone offsets of chord roots) and a base note per world/theme.
const KEYS = [57, 55, 52, 60, 53, 50, 58, 49, 54, 56];
const PROG = [
  [0, 7, 9, 5],
  [0, 5, 7, 3],
  [0, 8, 3, 10],
  [0, 3, 8, 7],
];

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const BAR_LEN = 4.8;
// Arpeggio walk (indexes into PENTA) for intensity level 2.
const ARP = [0, 2, 4, 5, 7, 5, 4, 2];
// Peak gain per hazard signature loop.
const HAZ_MAX = { laser: 0.08, hole: 0.12, warp: 0.07, ast: 0.1 };

export class Sound {
  constructor() {
    this.ctx = null;
    this.musicOn = true;
    this.sfxOn = true;
    this.theme = 0;
    this.timer = null;
    this.nextBar = 0;
    this.bar = 0;
    this.intensity = 0;
    this.sched = []; // bars scheduled ahead: { t, key, bar, lv }
    this.hz = null;
  }

  /** Create/resume the audio context. Must run inside a user gesture (iOS). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.connect(this.ctx.destination);
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(comp);
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = this.sfxOn ? 0.55 : 0;
      this.sfx.connect(this.master);
      this.mus = this.ctx.createGain();
      this.mus.gain.value = this.musicOn ? 0.22 : 0;
      this.mus.connect(this.master);
      // Gated buses for the intensity layers so they can drop out instantly.
      this.percBus = this.ctx.createGain();
      this.percBus.gain.value = this.intensity >= 1 ? 1 : 0;
      this.percBus.connect(this.mus);
      this.arpBus = this.ctx.createGain();
      this.arpBus.gain.value = this.intensity >= 2 ? 1 : 0;
      this.arpBus.connect(this.mus);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.musicOn && !this.timer) this.startMusic();
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMusic(on) {
    this.musicOn = on;
    if (!this.ctx) return;
    this.mus.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.2);
    if (on && !this.timer) this.startMusic();
    if (!on) this.stopMusic();
  }

  setSfx(on) {
    this.sfxOn = on;
    if (this.ctx) this.sfx.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.05);
  }

  setTheme(index) {
    this.theme = index;
  }

  tone(freq, start, dur, { type = 'sine', gain = 0.3, attack = 0.005, glide = 0, dest = this.sfx } = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * glide), start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(dest);
    o.start(start);
    o.stop(start + dur + 0.05);
  }

  noiseBurst(start, dur, { freq = 1200, q = 1, gain = 0.3, type = 'bandpass', sweep = 1, dest = this.sfx } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, start);
    if (sweep !== 1) f.frequency.exponentialRampToValueAtTime(freq * sweep, start + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(start);
    src.stop(start + dur + 0.05);
  }

  play(name, arg = 0) {
    if (!this.ctx || !this.sfxOn || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.005;
    switch (name) {
      case 'launch':
        this.noiseBurst(t, 0.25, { freq: 600, sweep: 4, gain: 0.25, q: 2 });
        this.tone(220, t, 0.18, { type: 'triangle', glide: 2.2, gain: 0.15 });
        break;
      case 'capture': {
        const n = 72 + PENTA[Math.min(arg, PENTA.length - 1)];
        this.tone(midi(n), t, 0.35, { type: 'sine', gain: 0.3 });
        this.tone(midi(n + 12), t, 0.25, { type: 'triangle', gain: 0.08 });
        break;
      }
      case 'shard':
        [84, 88, 91, 96].forEach((n, i) => this.tone(midi(n), t + i * 0.05, 0.22, { type: 'square', gain: 0.06 }));
        break;
      case 'crash':
        this.noiseBurst(t, 0.6, { freq: 900, sweep: 0.15, gain: 0.5, q: 0.7, type: 'lowpass' });
        this.tone(110, t, 0.5, { type: 'sawtooth', glide: 0.3, gain: 0.2 });
        break;
      case 'shield':
        this.tone(880, t, 0.3, { type: 'square', glide: 0.4, gain: 0.08 });
        this.noiseBurst(t, 0.2, { freq: 3000, gain: 0.15, q: 4 });
        break;
      case 'warp':
        this.tone(300, t, 0.35, { type: 'sine', glide: 3, gain: 0.2 });
        this.tone(450, t + 0.05, 0.3, { type: 'triangle', glide: 2.5, gain: 0.1 });
        break;
      case 'crumble':
        this.noiseBurst(t, 0.45, { freq: 400, sweep: 0.3, gain: 0.35, q: 0.8, type: 'lowpass' });
        break;
      case 'win':
        [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.tone(midi(67 + n), t + i * 0.07, 0.5, { type: 'triangle', gain: 0.18 }));
        this.tone(midi(55), t, 1.2, { type: 'sawtooth', gain: 0.05, attack: 0.05 });
        break;
      case 'star':
        this.tone(midi(84 + arg * 4), t, 0.4, { type: 'sine', gain: 0.25 });
        this.tone(midi(91 + arg * 4), t + 0.04, 0.35, { type: 'triangle', gain: 0.1 });
        break;
      case 'coin':
        this.tone(midi(88), t, 0.08, { type: 'square', gain: 0.07 });
        this.tone(midi(95), t + 0.06, 0.16, { type: 'square', gain: 0.07 });
        break;
      case 'click':
        this.tone(1400, t, 0.04, { type: 'sine', gain: 0.12 });
        break;
      case 'deny':
        this.tone(160, t, 0.18, { type: 'square', gain: 0.08 });
        this.tone(120, t + 0.1, 0.2, { type: 'square', gain: 0.08 });
        break;
      case 'unlock':
        [0, 7, 12, 19, 24].forEach((n, i) => this.tone(midi(72 + n), t + i * 0.09, 0.6, { type: 'sine', gain: 0.18 }));
        break;
      case 'boost':
        this.noiseBurst(t, 0.45, { freq: 400, sweep: 6, gain: 0.3, q: 1.5 });
        this.tone(140, t, 0.4, { type: 'sawtooth', glide: 2.5, gain: 0.1 });
        this.tone(280, t + 0.03, 0.35, { type: 'triangle', glide: 2.2, gain: 0.06 });
        break;
      case 'perfect': {
        const n = 79 + Math.min(arg, 12);
        this.tone(midi(n), t, 0.18, { type: 'sine', gain: 0.22 });
        this.tone(midi(n + 7), t + 0.07, 0.32, { type: 'sine', gain: 0.22 });
        this.tone(midi(n + 19), t + 0.07, 0.25, { type: 'triangle', gain: 0.05 });
        break;
      }
      case 'flip':
        this.tone(520, t, 0.12, { type: 'triangle', glide: 0.5, gain: 0.12 });
        this.tone(390, t + 0.06, 0.12, { type: 'triangle', glide: 1.8, gain: 0.1 });
        break;
      case 'bounce':
        this.tone(180, t, 0.18, { type: 'square', glide: 2.2, gain: 0.08 });
        this.tone(90, t, 0.14, { type: 'sine', glide: 1.6, gain: 0.2 });
        this.noiseBurst(t, 0.08, { freq: 2500, q: 3, gain: 0.12 });
        break;
      case 'pickup':
        this.tone(midi(96), t, 0.06, { type: 'square', gain: 0.05 });
        this.tone(midi(103), t + 0.04, 0.09, { type: 'sine', gain: 0.1 });
        break;
      case 'gold':
        [0, 4, 7, 11, 12, 16, 19, 24].forEach((n, i) => this.tone(midi(72 + n), t + i * 0.06, 0.9 - i * 0.05, { type: 'triangle', gain: 0.14 }));
        [0, 7, 12].forEach((n) => this.tone(midi(60 + n), t, 1.6, { type: 'sine', gain: 0.1, attack: 0.08 }));
        for (let i = 0; i < 6; i++) this.tone(midi(96 + PENTA[i]), t + 0.3 + i * 0.08, 0.25, { type: 'sine', gain: 0.06 });
        this.noiseBurst(t, 1.2, { freq: 5000, sweep: 1.8, q: 6, gain: 0.08 });
        break;
      case 'nearmiss':
        this.noiseBurst(t, 0.3, { freq: 900, sweep: 3.5, q: 1.2, gain: 0.22 });
        this.tone(midi(100), t + 0.08, 0.2, { type: 'sine', gain: 0.1 });
        break;
      case 'revive':
        [0, 4, 7, 12].forEach((n, i) => this.tone(midi(55 + n), t + i * 0.06, 0.9, { type: 'triangle', glide: 2, gain: 0.1, attack: 0.04 }));
        this.tone(midi(79), t + 0.45, 0.6, { type: 'sine', gain: 0.15 });
        this.noiseBurst(t, 0.8, { freq: 500, sweep: 8, q: 2, gain: 0.15 });
        break;
      case 'chest':
        this.noiseBurst(t, 0.5, { freq: 3000, sweep: 2.5, q: 1, gain: 0.12, type: 'highpass' });
        for (let i = 0; i < 6; i++) this.tone(midi(84 + PENTA[Math.floor(Math.random() * 8)]), t + 0.05 + i * 0.065, 0.3, { type: 'sine', gain: 0.1 });
        this.tone(midi(72), t, 0.25, { type: 'triangle', glide: 1.5, gain: 0.08 });
        break;
      case 'levelup':
        [0, 4, 7, 12, 16].forEach((n, i) => this.tone(midi(72 + n), t + i * 0.06, 0.25, { type: 'square', gain: 0.06 }));
        this.tone(midi(91), t + 0.3, 0.6, { type: 'triangle', gain: 0.16 });
        this.tone(midi(84), t + 0.3, 0.6, { type: 'sine', gain: 0.12 });
        break;
      case 'chain':
        this.tone(midi(84 + Math.min(arg, 12)), t, 0.08, { type: 'square', glide: 1.5, gain: 0.06 });
        break;
      case 'turn':
        this.tone(midi(76), t, 0.12, { type: 'sine', gain: 0.15 });
        this.tone(midi(71), t + 0.13, 0.16, { type: 'sine', gain: 0.15 });
        break;
      default:
        break;
    }
  }

  startMusic() {
    if (!this.ctx || this.timer) return;
    this.nextBar = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 200);
  }

  stopMusic() {
    clearInterval(this.timer);
    this.timer = null;
  }

  /** Music intensity 0 (ambient), 1 (+ percussion), 2 (+ fast arpeggio). Rises take effect mid-bar. */
  setIntensity(level) {
    const lv = Math.max(0, Math.min(2, Math.round(level) || 0));
    if (lv === this.intensity) return;
    this.intensity = lv;
    const c = this.ctx;
    if (!c) return;
    const now = c.currentTime;
    this.percBus.gain.setTargetAtTime(lv >= 1 ? 1 : 0, now, 0.04);
    this.arpBus.gain.setTargetAtTime(lv >= 2 ? 1 : 0, now, 0.04);
    if (!this.timer || c.state !== 'running') return;
    // Fill in the new layers for the rest of every bar already scheduled.
    const from = now + 0.06;
    for (const e of this.sched) {
      if (e.lv >= lv) continue;
      this.layers(e, from, e.t + BAR_LEN, e.lv, lv);
      e.lv = lv;
    }
  }

  /** Schedule intensity-layer hits of bar `e` in [from, to) for layers above `minLv` up to `lv`. */
  layers(e, from, to, minLv, lv) {
    const beat = BAR_LEN / 8;
    if (minLv < 1 && lv >= 1) {
      for (let i = 0; i < 16; i++) {
        const t = e.t + (i * beat) / 2;
        if (t < from || t >= to) continue;
        this.noiseBurst(t, 0.05, { freq: 7500, q: 0.7, type: 'highpass', gain: i % 2 ? 0.05 : 0.08, dest: this.percBus });
        if (i % 2 === 0) this.tone(115, t, 0.3, { type: 'sine', glide: 0.38, gain: i % 4 === 0 ? 0.3 : 0.18, dest: this.percBus });
      }
    }
    if (minLv < 2 && lv >= 2) {
      const off = e.bar % 4;
      for (let i = 0; i < 32; i++) {
        const t = e.t + (i * beat) / 4;
        if (t < from || t >= to) continue;
        this.tone(midi(e.key + 12 + PENTA[ARP[(i + off) % ARP.length]]), t, 0.16, { type: 'triangle', gain: 0.045, dest: this.arpBus });
      }
    }
  }

  /**
   * Continuous hazard signatures; `levels` = { laser, hole, warp, ast } proximities 0..1, or null to silence.
   * Call every frame while playing.
   */
  setHazards(levels) {
    const c = this.ctx;
    if (!c || (!levels && !this.hz)) return;
    if (!this.hz) this.buildHazards();
    const now = c.currentTime;
    const last = this.hz.last;
    for (const k in HAZ_MAX) {
      const raw = levels ? levels[k] || 0 : 0;
      const v = Math.max(0, Math.min(1, raw)) * HAZ_MAX[k];
      if (Math.abs(v - last[k]) < 0.002 && !(v === 0 && last[k] !== 0)) continue;
      last[k] = v;
      this.hz[k].gain.setTargetAtTime(v, now, 0.15);
    }
  }

  buildHazards() {
    const c = this.ctx;
    const gain = (v) => {
      const g = c.createGain();
      g.gain.value = v;
      return g;
    };
    const out = () => {
      const g = gain(0);
      g.connect(this.sfx);
      return g;
    };
    const filter = (type, freq, q) => {
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      return f;
    };
    const osc = (type, freq) => {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.start();
      return o;
    };
    const noise = (rate = 1) => {
      const s = c.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      s.playbackRate.value = rate;
      s.start();
      return s;
    };
    const lfo = (freq, depth, param) => osc('sine', freq).connect(gain(depth)).connect(param);
    const hz = { last: { laser: 0, hole: 0, warp: 0, ast: 0 } };

    // Laser: detuned saws around 110 Hz through a bandpass with a fast tremolo.
    hz.laser = out();
    const lbp = filter('bandpass', 900, 2.5);
    osc('sawtooth', 110).connect(lbp);
    osc('sawtooth', 111.4).connect(lbp);
    const trem = gain(0.6);
    lfo(9, 0.22, trem.gain);
    lbp.connect(trem).connect(hz.laser);

    // Black hole: deep sine rumble with a slow pitch wobble plus lowpassed noise.
    hz.hole = out();
    const sub = osc('sine', 46);
    lfo(0.17, 4, sub.frequency);
    sub.connect(gain(0.7)).connect(hz.hole);
    const oct = osc('sine', 92);
    lfo(0.17, 8, oct.frequency);
    oct.connect(gain(0.22)).connect(hz.hole);
    noise().connect(filter('lowpass', 140, 0.7)).connect(gain(0.9)).connect(hz.hole);

    // Wormhole: airy noise through a slowly sweeping resonant bandpass, with a faint shimmer.
    hz.warp = out();
    const wbp = filter('bandpass', 1800, 6);
    lfo(0.23, 1100, wbp.frequency);
    noise(0.9).connect(wbp).connect(gain(1.4)).connect(hz.warp);
    const shim = osc('triangle', 1320);
    lfo(5.5, 14, shim.frequency);
    shim.connect(gain(0.05)).connect(hz.warp);

    // Asteroids: gritty lowpassed noise whose amplitude jitters (a slow noise stream modulates it).
    hz.ast = out();
    const jit = gain(0.45);
    noise().connect(filter('lowpass', 420, 1.2)).connect(jit).connect(hz.ast);
    noise(0.03).connect(filter('lowpass', 30, 0.7)).connect(gain(2)).connect(jit.gain);

    this.hz = hz;
  }

  /** Schedule ambient bars ahead of time: a slow pad chord plus sparse pentatonic plucks, plus intensity layers. */
  schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const barLen = BAR_LEN;
    while (this.sched.length && this.sched[0].t + barLen < c.currentTime) this.sched.shift();
    while (this.nextBar < c.currentTime + 1.5) {
      const t = this.nextBar;
      const key = KEYS[this.theme % KEYS.length];
      const prog = PROG[this.theme % PROG.length];
      const root = key + prog[this.bar % 4];
      for (const iv of [0, 7, 12, 16]) {
        this.tone(midi(root - 12 + iv), t, barLen + 0.8, { type: iv ? 'triangle' : 'sawtooth', gain: iv ? 0.05 : 0.035, attack: 1.4, dest: this.mus });
      }
      const plucks = 5;
      for (let i = 0; i < plucks; i++) {
        if (Math.random() < 0.45) continue;
        const n = key + 12 + PENTA[Math.floor(Math.random() * 7)];
        this.tone(midi(n), t + (i * barLen) / plucks, 1.2, { type: 'sine', gain: 0.07, dest: this.mus });
      }
      const e = { t, key, bar: this.bar, lv: this.intensity };
      if (e.lv > 0) this.layers(e, t, t + barLen, 0, e.lv);
      this.sched.push(e);
      this.bar++;
      this.nextBar += barLen;
    }
  }
}
