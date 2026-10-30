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

export class Sound {
  constructor() {
    this.ctx = null;
    this.musicOn = true;
    this.sfxOn = true;
    this.theme = 0;
    this.timer = null;
    this.nextBar = 0;
    this.bar = 0;
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

  noiseBurst(start, dur, { freq = 1200, q = 1, gain = 0.3, type = 'bandpass', sweep = 1 } = {}) {
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
    src.connect(f).connect(g).connect(this.sfx);
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

  /** Schedule ambient bars ahead of time: a slow pad chord plus sparse pentatonic plucks. */
  schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const barLen = 4.8;
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
      this.bar++;
      this.nextBar += barLen;
    }
  }
}
