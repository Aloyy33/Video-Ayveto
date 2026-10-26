// Synthesised sound track for the fire video (no samples, no voices), in sync with fire.mjs:
// gate system beeps/chime/flap motors/power-down, a whooping fire-alarm siren, the roar and crackle
// of the fire growing as it spreads, things collapsing, the facade glass bursting, wind outside.
//   node audio_kebakaran.mjs [out.wav]
import fs from 'node:fs';
import { soundEvents, fireLoud, GATE } from './fire.mjs';

const SR = 44100, DUR = 24, N = SR * DUR;
const L = new Float32Array(N), R = new Float32Array(N);
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff * 2 - 1; };
const onePole = fc => { const a = Math.exp(-2 * Math.PI * fc / SR); let y = 0; return x => (y = (1 - a) * x + a * y); };

// ---- fire roar (filtered noise) + crackle (random pops) + fire-alarm siren
{
  const lpA = onePole(220), lpB = onePole(900), hp = onePole(2500);
  let ph = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const inside = 1 - Math.min(1, Math.max(0, (t - 12) / 3)) * 0.55; // a bit quieter once outside
    const F = Math.min(1, fireLoud(t) / 7) * inside;
    const n = rnd();
    const roar = (lpA(n) * 3.2 + lpB(n) * 0.6) * (0.85 + 0.15 * Math.sin(t * 3.1) * Math.sin(t * 1.7));
    const pop = Math.abs(rnd()) > 0.9994 - 0.0012 * F ? rnd() * 3 : 0;
    const crackle = (n - hp(n)) * 0.08 + pop;
    // siren: whoop sweeping 600 -> 1200 Hz every 1.1 s (fire alarm), starts at detection
    const on = t >= GATE.detect ? 1 : 0, sw = ((t - GATE.detect) / 1.1) % 1;
    ph += 2 * Math.PI * (600 + 600 * sw) / SR;
    const siren = on * (Math.sin(ph) * 0.7 + Math.sin(ph * 2) * 0.12) * (0.55 + 0.45 * inside) * Math.min(1, sw / 0.04, (1 - sw) / 0.03);
    const v = F * (roar * 0.55 + crackle * 0.9) + siren * 0.28;
    const w = (rnd()) * 0.02 * F;
    L[i] += v + w; R[i] += v - w;
  }
}

// ---- events
const addBurst = (t0, dur, gain, gen, pan = 0) => {
  const i0 = Math.floor(t0 * SR), n = Math.floor(dur * SR);
  const gl = gain * (1 - pan) * 0.5 + gain * 0.5, gr = gain * (1 + pan) * 0.5 + gain * 0.5;
  for (let k = 0; k < n && i0 + k < N; k++) { if (i0 + k < 0) continue; const v = gen(k / SR); L[i0 + k] += v * gl; R[i0 + k] += v * gr; }
};
for (const e of soundEvents()) {
  const pan = rnd() * 0.6;
  if (e.kind === 'thud') {
    const lp = onePole(260), lp2 = onePole(1800);
    addBurst(e.t, 0.6, 1.1 * e.g, t => lp(rnd()) * 6 * Math.exp(-t * 11) + lp2(rnd()) * 0.5 * Math.exp(-t * 30), pan);
  } else if (e.kind === 'crash') {
    const lp = onePole(2500);
    addBurst(e.t, 0.9, 0.9 * e.g, t => (lp(rnd()) * 1.4 * Math.exp(-t * 7) + Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t * 18) * 0.5) * (1 + 0.5 * Math.sin(t * 90)), pan);
  } else if (e.kind === 'crack') {
    const hp = onePole(3000);
    addBurst(e.t, 0.35, 0.6 * e.g, t => { const n = rnd(); return (n - hp(n)) * Math.exp(-t * 25) * (t < 0.02 ? 1.6 : 1); }, pan);
  } else if (e.kind === 'glasscrack') {
    addBurst(e.t, 0.5, 0.45 * e.g, t => { const n = rnd(); return n * Math.exp(-t * 20) * 0.6 + Math.sin(2 * Math.PI * 4200 * t) * Math.exp(-t * 14) * 0.3; }, pan);
  } else if (e.kind === 'whoosh') {
    const lp = onePole(500);
    addBurst(e.t, 1.4, 1.1 * e.g, t => lp(rnd()) * 4 * Math.min(1, t / 0.15) * Math.exp(-t * 2.2), pan);
  } else if (e.kind === 'click') { // emergency button: heavy mechanical clack
    const lp = onePole(1200);
    addBurst(e.t, 0.12, 1.0, t => (lp(rnd()) * 2.5 + Math.sin(2 * Math.PI * 320 * t) * 0.6) * Math.exp(-t * 55), -0.3);
  } else if (e.kind === 'beep') {
    addBurst(e.t, 0.2, 0.55, t => (Math.sin(2 * Math.PI * e.f * t) * 0.8 + Math.sin(2 * Math.PI * e.f * 2 * t) * 0.15) * Math.min(1, t / 0.005, (0.2 - t) / 0.02), 0.25);
  } else if (e.kind === 'chime') {
    [784, 988, 1319].forEach((f, k) => addBurst(e.t + k * 0.12, 0.6, 0.45, t => Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 6) * Math.min(1, t / 0.004), 0.25));
  } else if (e.kind === 'motor') {
    const lp = onePole(700);
    addBurst(e.t, e.dur + 0.1, 0.5, t => (lp(rnd()) * 1.5 + Math.sin(2 * Math.PI * (150 + 60 * t) * t) * 0.25) * Math.min(1, t / 0.08, (e.dur + 0.1 - t) / 0.1), 0.2);
    addBurst(e.t + e.dur, 0.12, 0.6, t => rnd() * Math.exp(-t * 60), 0.2); // flaps reach their stops
  } else if (e.kind === 'powerdown') {
    let ph = 0;
    addBurst(e.t, 0.7, 0.5, t => { ph += 2 * Math.PI * (700 * Math.exp(-t * 4.5) + 40) / SR; return Math.sin(ph) * (1 - t / 0.7); }, 0.25);
    addBurst(e.t + 0.62, 0.06, 0.7, t => rnd() * Math.exp(-t * 90), 0.25); // relay click
  } else if (e.kind === 'glass') {
    // shatter: bright noise burst + many short random tinkles over ~1.5 s
    addBurst(e.t, 0.5, 0.9 * e.g, t => rnd() * Math.exp(-t * 9), pan);
    for (let k = 0; k < 40; k++) {
      const f = 2500 + Math.abs(rnd()) * 5500, dt = Math.abs(rnd()) * 1.4 + 0.05;
      addBurst(e.t + dt, 0.25, 0.25 * e.g * (1 - dt / 1.6), t => Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 28), rnd() * 0.8);
    }
  }
}

// ---- room tone before the quake, outdoor ambience (wind + distant traffic) at the end
{
  const lpA = onePole(400), lpW = onePole(250);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const room = lpA(rnd()) * 0.05 + Math.sin(2 * Math.PI * 120 * t) * 0.004; // office HVAC hum
    if (t > 99) continue;
    const out = lpW(rnd()) * 0.22 * (0.7 + 0.3 * Math.sin(t * 0.6));
    const inside = 1 - Math.min(1, Math.max(0, (t - 12) / 2.5));
    const v = room * (t < GATE.shutdown ? 1 : 0.3) * inside + out * (1 - inside);
    L[i] += v; R[i] += v * 0.95;
  }
}

// ---- master: soft limiter + fade in/out, 16-bit stereo WAV
let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const norm = 1.6 / peak, buf = Buffer.alloc(44 + N * 4);
const lim = x => Math.tanh(x * norm) * 0.93;
for (let i = 0; i < N; i++) {
  const t = i / SR, fade = Math.min(1, t / 0.3, (DUR - t) / 0.8);
  buf.writeInt16LE(Math.round(lim(L[i]) * fade * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(lim(R[i]) * fade * 32767), 46 + i * 4);
}
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
const out = process.argv[2] || 'kebakaran_audio.wav';
fs.writeFileSync(out, buf);
console.log('wrote', out, (buf.length / 1e6).toFixed(1), 'MB, peak before limiter', peak.toFixed(2));
