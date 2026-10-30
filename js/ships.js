// Ship artwork. Every ship is drawn pointing along +x, centered on the origin, `s` units long.

function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}

const SHAPES = {
  arrow(ctx, s, c, a) {
    poly(ctx, [s * 0.55, 0, -s * 0.45, s * 0.38, -s * 0.25, 0, -s * 0.45, -s * 0.38]);
    ctx.fillStyle = c;
    ctx.fill();
    poly(ctx, [s * 0.3, 0, -s * 0.15, s * 0.12, -s * 0.15, -s * 0.12]);
    ctx.fillStyle = a;
    ctx.fill();
  },
  dart(ctx, s, c, a) {
    poly(ctx, [s * 0.6, 0, -s * 0.1, s * 0.16, -s * 0.5, s * 0.42, -s * 0.35, 0, -s * 0.5, -s * 0.42, -s * 0.1, -s * 0.16]);
    ctx.fillStyle = c;
    ctx.fill();
    ctx.fillStyle = a;
    ctx.fillRect(-s * 0.05, -s * 0.05, s * 0.3, s * 0.1);
  },
  manta(ctx, s, c, a) {
    ctx.beginPath();
    ctx.moveTo(s * 0.5, 0);
    ctx.quadraticCurveTo(0, s * 0.6, -s * 0.45, s * 0.45);
    ctx.quadraticCurveTo(-s * 0.2, 0, -s * 0.45, -s * 0.45);
    ctx.quadraticCurveTo(0, -s * 0.6, s * 0.5, 0);
    ctx.fillStyle = c;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s * 0.15, 0, s * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = a;
    ctx.fill();
  },
  saucer(ctx, s, c, a) {
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.5, s * 0.22, 0, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(s * 0.05, 0, s * 0.2, s * 0.14, 0, 0, Math.PI * 2);
    ctx.fillStyle = a;
    ctx.fill();
    ctx.fillStyle = '#fff';
    for (let i = -1; i <= 1; i++) ctx.fillRect(-s * 0.3, i * s * 0.12 - 1, s * 0.06, 2);
  },
  phoenix(ctx, s, c, a) {
    poly(ctx, [s * 0.55, 0, s * 0.1, s * 0.12, -s * 0.2, s * 0.5, -s * 0.5, s * 0.25, -s * 0.3, 0, -s * 0.5, -s * 0.25, -s * 0.2, -s * 0.5, s * 0.1, -s * 0.12]);
    ctx.fillStyle = c;
    ctx.fill();
    poly(ctx, [s * 0.35, 0, -s * 0.1, s * 0.18, -s * 0.05, 0, -s * 0.1, -s * 0.18]);
    ctx.fillStyle = a;
    ctx.fill();
  },
  beetle(ctx, s, c, a) {
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.45, s * 0.32, 0, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
    ctx.strokeStyle = a;
    ctx.lineWidth = s * 0.05;
    ctx.beginPath();
    ctx.moveTo(-s * 0.4, 0);
    ctx.lineTo(s * 0.3, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s * 0.38, 0, s * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = a;
    ctx.fill();
  },
  needle(ctx, s, c, a) {
    poly(ctx, [s * 0.7, 0, -s * 0.4, s * 0.12, -s * 0.5, s * 0.3, -s * 0.5, -s * 0.3, -s * 0.4, -s * 0.12]);
    ctx.fillStyle = c;
    ctx.fill();
    ctx.fillStyle = a;
    ctx.fillRect(-s * 0.2, -s * 0.04, s * 0.5, s * 0.08);
  },
  crown(ctx, s, c, a) {
    poly(ctx, [s * 0.5, 0, -s * 0.2, s * 0.4, -s * 0.15, s * 0.15, -s * 0.5, s * 0.3, -s * 0.35, 0, -s * 0.5, -s * 0.3, -s * 0.15, -s * 0.15, -s * 0.2, -s * 0.4]);
    ctx.fillStyle = c;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s * 0.05, 0, s * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = a;
    ctx.fill();
  },
  hammer(ctx, s, c, a) {
    poly(ctx, [s * 0.35, s * 0.4, s * 0.55, s * 0.4, s * 0.55, -s * 0.4, s * 0.35, -s * 0.4, s * 0.3, -s * 0.1, -s * 0.5, -s * 0.15, -s * 0.5, s * 0.15, s * 0.3, s * 0.1]);
    ctx.fillStyle = c;
    ctx.fill();
    ctx.fillStyle = a;
    ctx.fillRect(s * 0.4, -s * 0.3, s * 0.08, s * 0.6);
  },
  specter(ctx, s, c, a) {
    ctx.beginPath();
    ctx.moveTo(s * 0.5, 0);
    ctx.quadraticCurveTo(s * 0.2, s * 0.45, -s * 0.5, s * 0.35);
    ctx.lineTo(-s * 0.3, s * 0.12);
    ctx.lineTo(-s * 0.5, 0);
    ctx.lineTo(-s * 0.3, -s * 0.12);
    ctx.lineTo(-s * 0.5, -s * 0.35);
    ctx.quadraticCurveTo(s * 0.2, -s * 0.45, s * 0.5, 0);
    ctx.globalAlpha *= 0.85;
    ctx.fillStyle = c;
    ctx.fill();
    ctx.globalAlpha /= 0.85;
    ctx.fillStyle = a;
    ctx.beginPath();
    ctx.arc(s * 0.15, -s * 0.08, s * 0.05, 0, Math.PI * 2);
    ctx.arc(s * 0.15, s * 0.08, s * 0.05, 0, Math.PI * 2);
    ctx.fill();
  },
  nova(ctx, s, c, a) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2;
      const r = i % 2 ? s * 0.22 : s * 0.5;
      pts.push(Math.cos(ang) * r, Math.sin(ang) * r);
    }
    poly(ctx, pts);
    ctx.fillStyle = c;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.15, 0, Math.PI * 2);
    ctx.fillStyle = a;
    ctx.fill();
  },
  orb(ctx, s, c, a) {
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.36, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
    ctx.strokeStyle = a;
    ctx.lineWidth = s * 0.08;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.55, s * 0.18, 0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-s * 0.1, -s * 0.1, s * 0.08, 0, Math.PI * 2);
    ctx.fillStyle = a;
    ctx.fill();
  },
};

/** Draw a ship skin at the current transform. `glow` adds a soft halo. */
export function drawShip(ctx, ship, size, glow = true) {
  ctx.save();
  if (glow) {
    ctx.shadowColor = ship.id === 'singularity' ? ship.accent : ship.color;
    ctx.shadowBlur = size * 0.6;
  }
  ctx.lineJoin = 'round';
  (SHAPES[ship.shape] || SHAPES.arrow)(ctx, size, ship.color, ship.accent);
  ctx.restore();
}
