import { clamp, lerp, ramp, eOutExpo, eOutCubic, eio, hash } from './util.js';

export const W = 1920, H = 1080;
const CYAN = '40,205,255';

export async function loadFonts() {
  const base = '/node_modules/@fontsource/montserrat/files/montserrat-latin-';
  const ws = [300, 400, 500, 600, 700, 800, 900];
  await Promise.all(ws.map(w => new FontFace('Montserrat', `url(${base}${w}-normal.woff2)`, { weight: String(w) }).load().then(f => document.fonts.add(f))));
}

/* Kinetic headline: slams in (scale + blur + tracking), holds with slow drift, exits with blur/tracking. */
function kinetic(ctx, t, o) {
  const { text, t0, t1 } = o;
  if (t < t0 || t > t1) return;
  const inD = o.inD ?? 0.2, outD = o.outD ?? 0.2, size = o.size ?? 120;
  const pin = clamp((t - t0) / inD), pout = clamp((t1 - t) / outD);
  const e = eOutExpo(pin), x = eOutCubic(pout);
  const sc = lerp(o.fromScale ?? 1.45, 1, e) * (1 + 0.025 * (t - t0)) * lerp(1.04, 1, x);
  const alpha = Math.min(clamp(pin * 3), x);
  const blur = (1 - e) * 16 + (1 - x) * 12;
  const ls = (lerp(o.fromLS ?? 0.45, o.ls ?? 0.04, e) + (1 - x) * 0.2) * size;
  ctx.save();
  ctx.translate(o.x, o.y + (o.rise ?? 0) * (1 - e));
  ctx.scale(sc, sc);
  ctx.font = `${o.weight ?? 800} ${size}px Montserrat`;
  ctx.letterSpacing = ls.toFixed(2) + 'px';
  ctx.textBaseline = 'middle';
  ctx.textAlign = o.align ?? 'center';
  const tw = ctx.measureText(text).width;
  const ox = (o.align ?? 'center') === 'center' ? ls / 2 : 0;
  ctx.globalAlpha = alpha;
  if (blur > 0.4) ctx.filter = `blur(${blur.toFixed(1)}px)`;
  const left = (o.align ?? 'center') === 'center' ? -tw / 2 : 0;
  const g = ctx.createLinearGradient(left, -size * 0.5, left, size * 0.5);
  (o.grad ?? ['#ffffff', '#d8f4ff']).forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
  ctx.shadowColor = `rgba(${CYAN},${0.55 * alpha})`; ctx.shadowBlur = o.glow ?? 34;
  ctx.fillStyle = g;
  ctx.fillText(text, ox, 0);
  ctx.shadowBlur = 0; ctx.filter = 'none';
  // light streak under the type on entry
  if (o.streak !== false) {
    const sp = clamp((t - t0) / 0.45);
    if (sp > 0 && sp < 1) {
      const sx = lerp(left - 200, left + tw + 200, eOutCubic(sp));
      const lg = ctx.createLinearGradient(sx - 260, 0, sx + 40, 0);
      lg.addColorStop(0, `rgba(${CYAN},0)`); lg.addColorStop(0.85, `rgba(${CYAN},0.9)`); lg.addColorStop(1, 'rgba(255,255,255,1)');
      ctx.globalAlpha = Math.sin(sp * Math.PI) * alpha;
      ctx.fillStyle = lg; ctx.fillRect(sx - 260, size * 0.58, 300, 3);
    }
  }
  ctx.restore();
}

function scrim(ctx, side, a) {
  if (a <= 0) return;
  let g;
  if (side === 'left') { g = ctx.createLinearGradient(0, 0, W * 0.65, 0); g.addColorStop(0, `rgba(1,4,12,${0.6 * a})`); g.addColorStop(1, 'rgba(1,4,12,0)'); }
  else { g = ctx.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, W * 0.6); g.addColorStop(0, `rgba(1,4,12,${0.55 * a})`); g.addColorStop(1, `rgba(1,4,12,${0.25 * a})`); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

/* AYVETO emblem (traced from the supplied logo), drawn with a stroke-on reveal */
function emblem(ctx, cx, cy, R, prog, alpha) {
  if (alpha <= 0) return;
  const s = R / 487;
  ctx.save(); ctx.translate(cx - 512 * s, cy - 512 * s); ctx.scale(s, s);
  ctx.globalAlpha = alpha * clamp(prog * 1.6 - 0.35);
  const g = ctx.createLinearGradient(0, 25, 0, 1000); g.addColorStop(0, '#faf8f5'); g.addColorStop(1, '#e1dcd6');
  ctx.shadowColor = `rgba(${CYAN},0.55)`; ctx.shadowBlur = 70 / s;
  ctx.beginPath(); ctx.arc(512, 512, 487, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  ctx.shadowBlur = 0;
  const paths = [
    [p => p.arc(512, 512, 487, -Math.PI / 2, Math.PI * 1.5), 3060],
    [p => { p.moveTo(25, 505); p.lineTo(999, 505); }, 974],
    [p => { p.moveTo(512, 25); p.lineTo(512, 562); }, 537],
    [p => { p.moveTo(258, 96); p.lineTo(258, 505); }, 409],
    [p => { p.moveTo(766, 96); p.lineTo(766, 505); }, 409],
    [p => { p.moveTo(512, 25); p.lineTo(230, 905); }, 925],
    [p => { p.moveTo(512, 25); p.lineTo(794, 905); }, 925],
    [p => { p.moveTo(512, 562); p.bezierCurveTo(392, 632, 285, 755, 230, 905); }, 420],
    [p => { p.moveTo(512, 562); p.bezierCurveTo(632, 632, 739, 755, 794, 905); }, 420],
  ];
  ctx.globalAlpha = alpha; ctx.strokeStyle = '#1b41b2'; ctx.lineWidth = 11; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  paths.forEach(([fn, L], i) => {
    const pp = clamp(prog * 1.5 - i * 0.055);
    if (pp <= 0) return;
    const p = new Path2D(); fn(p);
    ctx.setLineDash([L * pp + 0.01, L + 10]); ctx.stroke(p);
  });
  ctx.setLineDash([]);
  ctx.restore();
}

function energySweep(ctx, t, t0, dur, dir = 1) {
  const p = (t - t0) / dur; if (p < 0 || p > 1) return;
  const e = eio(p), x = dir > 0 ? lerp(-500, W + 500, e) : lerp(W + 500, -500, e);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(x - 420, 0, x + 420, 0);
  g.addColorStop(0, `rgba(${CYAN},0)`); g.addColorStop(0.4, 'rgba(20,110,255,0.45)'); g.addColorStop(0.5, 'rgba(235,252,255,1)');
  g.addColorStop(0.6, 'rgba(20,110,255,0.45)'); g.addColorStop(1, `rgba(${CYAN},0)`);
  ctx.fillStyle = g; ctx.globalAlpha = Math.sin(p * Math.PI); ctx.fillRect(x - 420, 0, 840, H);
  // horizontal energy filaments
  for (let i = 0; i < 9; i++) {
    const y = H * hash(i * 3.1 + 7), len = 300 + 500 * hash(i + 2), off = (hash(i * 9.7) - 0.5) * 300;
    const lg = ctx.createLinearGradient(x + off - len, 0, x + off, 0); lg.addColorStop(0, `rgba(${CYAN},0)`); lg.addColorStop(1, 'rgba(220,250,255,0.9)');
    ctx.fillStyle = lg; ctx.fillRect(x + off - len, y, len, 1.5 + 2 * hash(i + 11));
  }
  ctx.restore();
}

function zoomBurst(ctx, t, t0, dur) {
  const p = (t - t0) / dur; if (p < 0 || p > 1) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(W / 2, H / 2);
  const a = Math.sin(p * Math.PI);
  for (let i = 0; i < 70; i++) {
    const ang = hash(i * 1.7) * Math.PI * 2, r0 = lerp(80, 900, (p + hash(i * 5.3)) % 1), len = 120 + 380 * p;
    ctx.strokeStyle = `rgba(${hash(i) > 0.5 ? CYAN : '190,235,255'},${0.5 * a})`; ctx.lineWidth = 1 + 2 * hash(i * 2.2);
    ctx.beginPath(); ctx.moveTo(Math.cos(ang) * r0, Math.sin(ang) * r0); ctx.lineTo(Math.cos(ang) * (r0 + len), Math.sin(ang) * (r0 + len)); ctx.stroke();
  }
  ctx.restore();
}

let LAY = null, LAY2 = null;
export function drawOverlay(ctx, t, fade) {
  ctx.clearRect(0, 0, W, H);
  // ---- Scene 1
  scrim(ctx, 'center', ramp(t, 2.5, 2.7) * (1 - ramp(t, 3.75, 3.95)) * 0.8);
  if (!LAY) { ctx.save(); ctx.font = '800 118px Montserrat'; ctx.letterSpacing = (0.04 * 118) + 'px'; const a = ctx.measureText('ACCESS.').width, b = ctx.measureText('REIMAGINED.').width; ctx.restore(); const tot = a + 46 + b; LAY = { x1: W / 2 - tot / 2, x2: W / 2 - tot / 2 + a + 46 }; }
  kinetic(ctx, t, { text: 'ACCESS.', t0: 2.55, t1: 3.95, x: LAY.x1, y: H / 2, size: 118, align: 'left' });
  kinetic(ctx, t, { text: 'REIMAGINED.', t0: 2.8, t1: 3.95, x: LAY.x2, y: H / 2, size: 118, grad: ['#bff1ff', '#2fc8ff'], align: 'left' });
  // ---- Scene 2
  scrim(ctx, 'center', ramp(t, 6.1, 6.3) * (1 - ramp(t, 7.7, 7.9)));
  if (!LAY2) { ctx.save(); ctx.font = '800 132px Montserrat'; ctx.letterSpacing = (0.04 * 132) + 'px'; const ws = ['STOP.', 'TAP.', 'WAIT.'].map(w => ctx.measureText(w).width); ctx.restore(); const gap = 70, tot = ws[0] + ws[1] + ws[2] + 2 * gap; let x = W / 2 - tot / 2; LAY2 = ws.map(w => { const r = x; x += w + gap; return r; }); }
  kinetic(ctx, t, { text: 'STOP.', t0: 6.15, t1: 7.85, x: LAY2[0], y: H / 2, size: 132, align: 'left' });
  kinetic(ctx, t, { text: 'TAP.', t0: 6.6, t1: 7.85, x: LAY2[1], y: H / 2, size: 132, align: 'left' });
  kinetic(ctx, t, { text: 'WAIT.', t0: 7.05, t1: 7.85, x: LAY2[2], y: H / 2, size: 132, align: 'left', grad: ['#bff1ff', '#2fc8ff'] });
  energySweep(ctx, t, 7.8, 0.5, 1);
  // ---- Scene 3 (three beats)
  scrim(ctx, 'left', win(t, 9.45, 14.6, 0.2, 0.3));
  kinetic(ctx, t, { text: 'NO TAPPING.', t0: 9.5, t1: 10.95, x: 150, y: H / 2, size: 128, align: 'left' });
  kinetic(ctx, t, { text: 'AUTOMATIC', t0: 11.0, t1: 12.85, x: 150, y: H / 2 - 70, size: 118, align: 'left' });
  kinetic(ctx, t, { text: 'DETECTION.', t0: 11.12, t1: 12.85, x: 150, y: H / 2 + 70, size: 118, align: 'left', grad: ['#bff1ff', '#2fc8ff'] });
  kinetic(ctx, t, { text: 'SEAMLESS', t0: 12.9, t1: 14.6, x: 150, y: H / 2 - 70, size: 118, align: 'left' });
  kinetic(ctx, t, { text: 'ACCESS.', t0: 13.02, t1: 14.6, x: 150, y: H / 2 + 70, size: 118, align: 'left', grad: ['#bff1ff', '#2fc8ff'] });
  zoomBurst(ctx, t, 14.7, 0.5);
  // ---- Scene 4
  scrim(ctx, 'left', win(t, 15.45, 16.9, 0.2, 0.15) + win(t, 19.6, 21.0, 0.2, 0.15));
  kinetic(ctx, t, { text: 'SMARTER', t0: 15.5, t1: 16.85, x: 150, y: H / 2 - 62, size: 108, align: 'left' });
  kinetic(ctx, t, { text: 'ACCESS.', t0: 15.62, t1: 16.85, x: 150, y: H / 2 + 62, size: 108, align: 'left', grad: ['#bff1ff', '#2fc8ff'] });
  kinetic(ctx, t, { text: 'MORE', t0: 19.65, t1: 20.95, x: 150, y: H / 2 - 62, size: 108, align: 'left' });
  kinetic(ctx, t, { text: 'CONTROL.', t0: 19.77, t1: 20.95, x: 150, y: H / 2 + 62, size: 108, align: 'left', grad: ['#bff1ff', '#2fc8ff'] });
  energySweep(ctx, t, 21.75, 0.5, -1);
  // ---- Scene 5: brand reveal
  const br = ramp(t, 24.2, 24.5);
  scrim(ctx, 'center', br * 1.25);
  emblem(ctx, W / 2, 330, 92, ramp(t, 24.2, 25.2), br);
  if (t >= 24.35) {
    const p = eOutExpo(ramp(t, 24.35, 25.0));
    ctx.save(); ctx.translate(W / 2, 540); ctx.scale(lerp(1.12, 1, p) * (1 + 0.006 * (t - 24.35)), lerp(1.12, 1, p) * (1 + 0.006 * (t - 24.35)));
    ctx.font = '700 150px Montserrat'; ctx.letterSpacing = (lerp(110, 52, p)).toFixed(1) + 'px'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.globalAlpha = clamp(p * 1.5); if (p < 0.95) ctx.filter = `blur(${((1 - p) * 14).toFixed(1)}px)`;
    const g = ctx.createLinearGradient(0, -75, 0, 75); g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#e3f1ff'); g.addColorStop(1, '#9fc6ee');
    ctx.shadowColor = `rgba(${CYAN},0.5)`; ctx.shadowBlur = 40; ctx.fillStyle = g; ctx.fillText('AYVETO', 26, 0);
    ctx.restore();
    // thin rule under brand
    const rp = eOutCubic(ramp(t, 24.8, 25.6));
    ctx.save(); const rg = ctx.createLinearGradient(W / 2 - 300, 0, W / 2 + 300, 0); rg.addColorStop(0, `rgba(${CYAN},0)`); rg.addColorStop(0.5, `rgba(${CYAN},0.95)`); rg.addColorStop(1, `rgba(${CYAN},0)`);
    ctx.fillStyle = rg; ctx.fillRect(W / 2 - 300 * rp, 640, 600 * rp, 2); ctx.restore();
  }
  kinetic(ctx, t, { text: 'WALK IN. NO TAPPING.', t0: 25.5, t1: 31, x: W / 2, y: 718, size: 50, weight: 600, ls: 0.2, fromLS: 0.5, fromScale: 1.15, glow: 22, streak: false, outD: 0.01 });
  kinetic(ctx, t, { text: 'A Smarter Way to Access.', t0: 26.5, t1: 31, x: W / 2, y: 800, size: 32, weight: 400, ls: 0.06, fromLS: 0.3, fromScale: 1.05, glow: 10, streak: false, grad: ['#cfe3f5', '#9ab8d6'], outD: 0.01 });
  // global fade (also applies to the type)
  if (fade < 1) { ctx.fillStyle = `rgba(0,0,0,${1 - fade})`; ctx.fillRect(0, 0, W, H); }
}

function win(t, a, b, fi, fo) { return Math.min(ramp(t, a, a + fi), 1 - ramp(t, b - fo, b)); }
