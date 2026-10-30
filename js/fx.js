// Particle effects, shockwave rings and floating text in world coordinates. Pooled: no per-frame allocation.

const MAX_PARTICLES = 700;

export class Fx {
  constructor() {
    this.parts = [];
    this.free = [];
    this.rings = [];
    this.texts = [];
    this.shake = 0;
    this.flash = 0;
    this.flashColor = '#fff';
  }

  clear() {
    this.free.push(...this.parts);
    this.parts.length = 0;
    this.rings.length = 0;
    this.texts.length = 0;
    this.shake = 0;
    this.flash = 0;
  }

  spawn(x, y, vx, vy, life, size, color, drag = 0.9, glow = true, spin = 0) {
    if (this.parts.length >= MAX_PARTICLES) return;
    const p = this.free.pop() || {};
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.max = life;
    p.size = size;
    p.color = color;
    p.drag = drag;
    p.glow = glow;
    p.spin = spin;
    this.parts.push(p);
  }

  burst(x, y, n, speed, colors, life = 0.7, size = 4) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      this.spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, life * (0.6 + Math.random() * 0.6), size * (0.5 + Math.random()), colors[i % colors.length]);
    }
  }

  /** Particles curling outward on a spiral (velocity rotates over time). */
  spiral(x, y, colors, n = 16, speed = 220, life = 0.7) {
    n = Math.min(n, 40);
    const dir = Math.random() < 0.5 ? -1 : 1;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const v = speed * (0.6 + Math.random() * 0.4);
      this.spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, life * (0.7 + Math.random() * 0.5), 3.5 * (0.6 + Math.random() * 0.6), colors[i % colors.length], 0.94, true, dir * (4.5 + Math.random() * 2));
    }
  }

  /** A cone (±0.5 rad) of fast, small, non-glow sparks along (dirX, dirY). */
  sparks(x, y, dirX, dirY, colors, n = 12, speed = 320) {
    n = Math.min(n, 40);
    const base = Math.atan2(dirY, dirX);
    for (let i = 0; i < n; i++) {
      const a = base + (Math.random() * 2 - 1) * 0.5;
      const v = speed * (0.5 + Math.random() * 0.5);
      this.spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.25 + Math.random() * 0.25, 2 + Math.random() * 1.5, colors[i % colors.length], 0.88, false);
    }
  }

  /** Slow, large, gently drifting particles with low drag and a lazy swirl. */
  petals(x, y, colors, n = 14) {
    n = Math.min(n, 40);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 40 + Math.random() * 70;
      this.spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, 1.2 + Math.random() * 0.8, 6 + Math.random() * 4, colors[i % colors.length], 0.985, true, (Math.random() - 0.5) * 3);
    }
  }

  ring(x, y, color, maxR = 90, life = 0.5, width = 4) {
    this.rings.push({ x, y, color, maxR, life, max: life, width });
  }

  text(x, y, str, color = '#fff', size = 26) {
    this.texts.push({ x, y, str, color, size, life: 1, max: 1 });
  }

  addShake(v) {
    this.shake = Math.max(this.shake, v);
  }

  addFlash(v, color = '#fff') {
    this.flash = Math.max(this.flash, v);
    this.flashColor = color;
  }

  update(dt) {
    const parts = this.parts;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        parts[i] = parts[parts.length - 1];
        parts.pop();
        this.free.push(p);
        continue;
      }
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d;
      p.vy *= d;
      if (p.spin) {
        const r = p.spin * dt;
        const c = Math.cos(r);
        const sn = Math.sin(r);
        const vx = p.vx;
        p.vx = vx * c - p.vy * sn;
        p.vy = vx * sn + p.vy * c;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      this.rings[i].life -= dt;
      if (this.rings[i].life <= 0) this.rings.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y -= 50 * dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flash = Math.max(0, this.flash - dt * 2.5);
  }

  /** Draw in world space (caller has applied the camera transform). */
  draw(ctx, glowSprite) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      const k = p.life / p.max;
      ctx.globalAlpha = k;
      const s = p.size * (0.4 + 0.6 * k);
      if (p.glow) ctx.drawImage(glowSprite(p.color), p.x - s * 2.5, p.y - s * 2.5, s * 5, s * 5);
      else {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
    }
    for (const r of this.rings) {
      const k = 1 - r.life / r.max;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - k) + 0.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.maxR * (0.2 + 0.8 * Math.sqrt(k)), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const t of this.texts) {
      ctx.globalAlpha = Math.min(1, t.life * 2);
      ctx.font = `800 ${t.size}px "Baloo 2", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.restore();
  }
}
