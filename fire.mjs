// Fire timeline shared by the fire scene (scene_kebakaran.js) and its sound track
// (audio_kebakaran.mjs). It exports the same names as quake.mjs, so the shared building effects
// (ceiling, lamps, cracks, shards) can be reused; the ground never shakes in this video.
import { GATE, FIRES } from './crowd_fire.mjs';
export { GATE, FIRES };

export const QUAKE = { start: GATE.detect, powerOut: 99, after: 99 }; // QUAKE.start = when people react (alarm)
export const intensity = () => 0;
export const ground = () => ({ x: 0, y: 0, z: 0 });
export const camShake = () => ({ pitch: 0, yaw: 0, roll: 0 });
export const sway = () => ({ x: 0, z: 0 });
export const swayAcc = () => ({ x: 0, z: 0 });

export const TILES = [];
export const PLANT_FALLS = [];
export const PAINTING_FALLS = [];
export const MONITOR_FALLS = [99, 99, 99, 99, 99, 99, 99, 99];
// heat cracks the glass and finally bursts the facade panel next to the burning lobby corner
export const GLASS = { t: 19.6, x0: -9.3, x1: -7.2, y0: 2.2, y1: 5.8 };
export const WALL_CRACKS_T = [99, 99, 99, 99, 99, 99];
export const FACADE_CRACKS_T = [99, 99, 18.4, 99];

// how big fire i is at time t (0..1): ignites, grows quickly, then keeps raging
export function fireSize(i, t) {
  const t0 = FIRES[i][3], u = Math.max(0, t - t0);
  if (t < t0) return 0;
  return i === 0 ? 0.3 + 0.7 * Math.min(1, (u + 0.3) / 3.2) : Math.min(1, 0.15 + u / 2.6);
}
// overall fire intensity for the sound mix
export const fireLoud = t => FIRES.reduce((s, f, i) => s + fireSize(i, t) * f[2], 0);

export function soundEvents() {
  const ev = [];
  for (let t = GATE.detect; t < GATE.shutdown - 0.05; t += 0.32) ev.push({ t, kind: 'beep', g: 1, f: Math.round((t - GATE.detect) / 0.32) % 2 ? 880 : 1175 });
  ev.push({ t: GATE.release, kind: 'chime', g: 1 });
  ev.push({ t: GATE.release + 0.05, kind: 'motor', g: 1, dur: GATE.openEnd - GATE.release });
  ev.push({ t: GATE.shutdown, kind: 'powerdown', g: 1 });
  FIRES.forEach(([, , , t0], i) => { if (i) ev.push({ t: t0, kind: 'whoosh', g: 0.9 }); });
  ev.push({ t: FACADE_CRACKS_T[2], kind: 'glasscrack', g: 0.8 });
  ev.push({ t: GLASS.t, kind: 'glass', g: 1.0 });
  ev.push({ t: GLASS.t + 0.08, kind: 'whoosh', g: 1.0 });
  for (const t of [7.4, 10.9, 14.2]) ev.push({ t, kind: 'crash', g: 0.7 }); // things collapsing in the fire
  return ev;
}
