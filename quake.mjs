// Earthquake timeline shared by the scene (scene_gempa.js) and the sound track (audio_gempa.mjs).
// Everything is a pure function of time, so video and audio stay in sync.

export const QUAKE = { start: 1.0, powerOut: 6.2, after: 15.6 };
// gate system: running normally (lanes closed) -> detects the quake -> emergency release (all
// flaps open) -> shuts itself down (displays and lights go dark; flaps stay open)
export const GATE = { detect: 1.45, release: 2.75, openEnd: 3.55, shutdown: 4.35, dark: 5.0 };

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sm = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };

// shaking strength 0..1: sudden main shock, slowly fading tremor, then an aftershock
export function intensity(t) {
  const main = sm(1.0, 1.45, t) * (0.86 + 0.14 * Math.sin(t * 2.3) * Math.sin(t * 0.9 + 1)) *
    (1 - 0.62 * sm(6.4, 10.5, t) - 0.3 * sm(10.5, 14.5, t));
  const after = 0.72 * sm(15.6, 15.95, t) * (1 - sm(16.9, 19.6, t));
  const residual = 0.04 * sm(1, 2, t) * (1 - sm(19, 23, t));
  return Math.max(main, after, residual);
}

// ground displacement (m) of the building
const TAU = Math.PI * 2;
export function ground(t) {
  const I = intensity(t);
  return {
    x: I * (0.05 * Math.sin(TAU * 1.9 * t + 0.3) + 0.03 * Math.sin(TAU * 3.1 * t + 1.1) + 0.018 * Math.sin(TAU * 5.3 * t + 2.0)),
    z: I * (0.045 * Math.sin(TAU * 1.6 * t + 2.2) + 0.028 * Math.sin(TAU * 2.7 * t + 0.5) + 0.016 * Math.sin(TAU * 4.7 * t + 1.7)),
    y: I * (0.012 * Math.sin(TAU * 6.1 * t) + 0.008 * Math.sin(TAU * 8.3 * t + 1.0)),
  };
}
// low-frequency sway of the building (m): drives swinging lamps/signs, sliding chairs, toppling plants
export function sway(t) {
  const I = intensity(t);
  return {
    x: I * (0.14 * Math.sin(TAU * 0.75 * t + 0.4) + 0.09 * Math.sin(TAU * 1.25 * t + 1.7)),
    z: I * (0.12 * Math.sin(TAU * 0.68 * t + 2.5) + 0.08 * Math.sin(TAU * 1.4 * t + 0.9)),
  };
}
export function swayAcc(t) {
  const h = 1 / 120, a = sway(t - h), b = sway(t), c = sway(t + h);
  return { x: (a.x - 2 * b.x + c.x) / (h * h), z: (a.z - 2 * b.z + c.z) / (h * h) };
}
// camera shake (rad): rattle of the camera mount on top of the ground motion
export function camShake(t) {
  const I = intensity(t);
  return {
    pitch: I * (0.010 * Math.sin(TAU * 4.9 * t + 0.7) + 0.006 * Math.sin(TAU * 7.7 * t + 2.1) + 0.006 * Math.sin(TAU * 2.2 * t)),
    yaw: I * (0.011 * Math.sin(TAU * 3.7 * t + 1.9) + 0.006 * Math.sin(TAU * 6.3 * t + 0.4)),
    roll: I * (0.012 * Math.sin(TAU * 2.6 * t + 0.2) + 0.005 * Math.sin(TAU * 8.9 * t + 1.3)),
  };
}

// --------------------------------------------------------------- falling things (times in s)
const FALL = Math.sqrt(2 * 5.95 / 9.81); // ceiling (6 m) -> floor
export const TILES = [
  // office
  [-2.4, 13.2, 2.3], [2.2, 16.4, 2.9], [-7.4, 14.0, 3.0], [-5.0, 7.4, 3.4], [4.6, 8.6, 4.1], [-1.8, 20.6, 4.6], [5.2, 13.4, 5.2], [1.8, 5.4, 6.0],
  // lobby
  [-4.2, -6.4, 3.7], [3.1, -8.4, 4.4], [-6.8, -11.0, 5.5], [-2.6, -3.0, 9.6], [5.4, -2.6, 10.4], [-5.6, -4.2, 11.6],
  // aftershock
  [-3.6, 9.4, 16.1], [0.6, -6.6, 16.4], [6.2, -9.0, 16.8],
].map(([x, z, t]) => ({ x: Math.round((x - 0.3) / 0.6) * 0.6 + 0.3, z: Math.round((z - 0.3) / 0.6) * 0.6 + 0.3, t, land: t + 0.25 + FALL }));

// plants: index into the scene's plant list, fall time, fall direction (radians, 0 = +z)
export const PLANT_FALLS = [[0, 2.6, -Math.PI / 2], [4, 3.3, -Math.PI / 2], [5, 2.2, Math.PI], [7, 4.0, Math.PI / 2], [2, 5.0, -Math.PI / 2], [1, 16.3, Math.PI / 2]];
export const PAINTING_FALLS = [[2, 3.6], [1, 5.2]]; // [index along the left wall, time]
export const MONITOR_FALLS = [2.7, 3.1, 2.4, 3.8, 4.4, 2.9, 5.6, 3.5]; // reception (2) + office desks (6)
export const GLASS = { t: 18.2, x0: -9.3, x1: -7.2, y0: 3.4, y1: 5.8 }; // facade panel that shatters in the aftershock
export const WALL_CRACKS_T = [1.9, 2.6, 3.2, 4.0, 4.7, 5.9];
export const FACADE_CRACKS_T = [3.0, 4.4, 17.0, 17.5];

// sound events for the audio track
export function soundEvents() {
  const ev = [];
  for (const k of TILES) { ev.push({ t: k.t, kind: 'crack', g: 0.5 }); ev.push({ t: k.land, kind: 'thud', g: 0.9 }); }
  for (const [, t] of PLANT_FALLS) ev.push({ t: t + 0.55, kind: 'thud', g: 0.6 });
  for (const [, t] of PAINTING_FALLS) ev.push({ t: t + 0.9, kind: 'crash', g: 0.8 });
  for (const t of MONITOR_FALLS) ev.push({ t: t + 0.35, kind: 'crash', g: 0.45 });
  ev.push({ t: GLASS.t, kind: 'glass', g: 1.0 });
  ev.push({ t: GLASS.t + 0.9, kind: 'glass', g: 0.6 });
  // gate system sounds: alarm beeps while warning, chime + flap motors on release, power-down
  for (let t = GATE.detect; t < GATE.shutdown - 0.05; t += 0.32) ev.push({ t, kind: 'beep', g: 1, f: Math.round((t - GATE.detect) / 0.32) % 2 ? 880 : 1175 });
  ev.push({ t: GATE.release, kind: 'chime', g: 1 });
  ev.push({ t: GATE.release + 0.05, kind: 'motor', g: 1, dur: GATE.openEnd - GATE.release });
  ev.push({ t: GATE.shutdown, kind: 'powerdown', g: 1 });
  for (const t of WALL_CRACKS_T) ev.push({ t, kind: 'crack', g: 0.7 });
  for (const t of FACADE_CRACKS_T) ev.push({ t, kind: 'glasscrack', g: 0.6 });
  return ev;
}
