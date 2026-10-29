export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ramp = (t, a, b) => clamp((t - a) / (b - a));
export const smooth = x => x * x * (3 - 2 * x);
export const eio = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const eOutExpo = x => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
export const eOutCubic = x => 1 - Math.pow(1 - x, 3);
export const eInCubic = x => x * x * x;
export const eInOutSine = x => -(Math.cos(Math.PI * x) - 1) / 2;
// 0 -> 1 -> 0 window with soft edges
export const win = (t, a, b, fi = 0.15, fo = 0.15) => Math.min(ramp(t, a, a + fi), 1 - ramp(t, b - fo, b));
export function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
export function noise1(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u) * 2 - 1; }
