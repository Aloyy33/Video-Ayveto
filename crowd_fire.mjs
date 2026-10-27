// Deterministic fire-evacuation crowd simulation (social-force model, fixed time step).
// The fire alarm goes off and people panic and run out: office -> any of the 7 open gate lanes
// -> lobby -> one of the 3 entrance doors -> assembly point outside. Nobody runs backward.
// The gate stays locked after the fire is detected: the security guard runs to the reception desk
// and presses the emergency button, and only then does the system release every lane. People who
// reach the gates before that crowd up behind the closed flaps.
const intensity = () => 0, PLANT_FALLS = [], TILES = [];
// detect = the building's fire alarm goes off; the gate system itself runs normally (lanes locked)
// until the guard presses the emergency button: then it powers off and every flap swings open
export const GATE = { detect: 1.0, press: 3.15, release: 3.3, openEnd: 4.6, shutdown: 3.18, dark: 3.75 };

// ---- the security guard: post by the entrance -> runs to reception -> presses the emergency
// button -> runs back to the doors and waves everyone out -> leaves last
export const RECEPTION_DESK = { x: 4.4, z: -5.6, ry: 0.5 };
const deskPt = (lx, lz) => { const c = Math.cos(RECEPTION_DESK.ry), s = Math.sin(RECEPTION_DESK.ry); return [RECEPTION_DESK.x + lx * c + lz * s, RECEPTION_DESK.z - lx * s + lz * c]; };
export const BUTTON_LOCAL = [-0.9, -0.36];             // emergency button on the counter (desk-local x, z)
export const BUTTON_XZ = deskPt(...BUTTON_LOCAL);
const PRESS_XZ = deskPt(-0.9, -0.88), POST = [1.55, -10.7];
const G_SEG = [ // [t0, t1, from, to]
  [1.35, 3.0, POST, PRESS_XZ],
  [3.75, 5.25, PRESS_XZ, POST],
];
{ // leaving at the end: out through the right-hand door
  let t = 18.4, prev = POST;
  for (const p of [[2.9, -12.6], [3.3, -14.0], [3.3, -17.2], [2.4, -19.6]]) { const d = Math.hypot(p[0] - prev[0], p[1] - prev[1]); G_SEG.push([t, t + d / 2.8, prev, p]); t += d / 2.8; prev = p; }
}
const trap = u => { // distance fraction with a short acceleration and braking phase
  const a = 0.22, b = 0.18, vmax = 1 / (1 - a / 2 - b / 2);
  if (u <= a) return vmax * u * u / (2 * a);
  if (u <= 1 - b) return vmax * (a / 2 + (u - a));
  const w = 1 - u; return 1 - vmax * w * w / (2 * b);
};
const segLen = G_SEG.map(([, , f, to]) => Math.hypot(to[0] - f[0], to[1] - f[1]));
export function guardPos(t) {
  let d = 0, x = POST[0], z = POST[1], h = -0.3, v = 0, phase = 'post';
  for (let k = 0; k < G_SEG.length; k++) {
    const [t0, t1, f, to] = G_SEG[k], L = segLen[k];
    if (t < t0) break;
    const u = Math.min(1, (t - t0) / (t1 - t0)), w = trap(u);
    x = f[0] + (to[0] - f[0]) * w; z = f[1] + (to[1] - f[1]) * w; d += L * w;
    h = Math.atan2(to[0] - f[0], to[1] - f[1]);
    if (u < 1) { const e = 1e-3, w2 = trap(Math.min(1, u + e)); v = L * (w2 - w) / (e * (t1 - t0)); phase = 'run'; }
    else phase = k === 0 ? 'press' : k === 1 ? 'post' : 'out';
  }
  if (phase === 'press') h = RECEPTION_DESK.ry;
  else if (phase === 'post') h = -0.3;
  else if (phase === 'out') h = 0;
  return { x, z, h, v, d, phase };
}
// fire sources [x, z, radius, ignition time]: the fire starts in the back-right corner and spreads
export const FIRES = [[6.8, 19.6, 1.7, 0.0], [3.9, 21.3, 1.2, 3.0], [8.5, 15.6, 1.2, 4.6], [-0.4, 21.4, 1.2, 6.8], [-6.9, 20.3, 1.2, 8.8], [8.4, 10.6, 1.1, 10.2], [-8.4, 13.4, 1.1, 12.0], [-3.6, 17.4, 1.0, 13.6],
  [4.6, -6.6, 1.1, 16.8], [-7.6, -11.4, 1.2, 17.4], [7.3, -9.6, 1.0, 18.2]]; // last three: the fire reaches the lobby

export const SIM = { DT: 1 / 60, DURATION: 24.5, R: 0.25 };
export const LANE_XS = [-3, -2, -1, 0, 1, 2, 3].map(k => k * 1.7);
export const DOORS = [{ x: -6.0, xmin: -7.0, xmax: -5.0 }, { x: -0.45, xmin: -1.45, xmax: 0.55 }, { x: 3.4, xmin: 2.4, xmax: 4.4 }];
export const DESKS = [];
export const PLANTS = [[-4.2, 5], [3.4, 4.2], [-3.3, -12.8], [1.6, -12.8], [-4.8, 15], [-2.8, 21.5], [2.8, 21.5], [8.8, 16.2]];
export const GUARD_XZ = [1.55, -10.7];

function rng(seed) { // mulberry32
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// static obstacles [x, z, r, tOn]
export const OBSTACLES = [
  [-6.5, 7, 0.42], [6.5, 7, 0.42], [-6.5, 15, 0.42], [6.5, 15, 0.42],      // pillars
  [-4.6, 10, 0.6], [-3.0, 11.6, 0.6], [-3.2, 9.8, 0.5],                     // lounge
  [3.0, -4.83, 0.5], [3.7, -5.22, 0.5], [4.4, -5.6, 0.5], [5.1, -5.98, 0.5], [5.8, -6.37, 0.5], // reception desk
  [7.6, -10.1, 0.5], [7.6, -8.9, 0.5], [7.6, -12.9, 0.5], [7.6, -11.7, 0.5], // sofas
  [5.6, -9.3, 0.55],                                                          // coffee table
  ...FIRES.map(([x, z, r, t0]) => [x, z, r + 0.35, t0 + 0.4]),
  [-2.9, -16.5, 0.12], [2.0, -16.5, 0.12], [-5, -18.5, 0.25], [4, -18.5, 0.25], [-9, -18.5, 0.25], [8, -18.5, 0.25],
  [-4.4, -21.6, 0.15], [-3.2, 9.8, 0.5], // assembly sign, lounge table
];
for (const [x, z] of DESKS) OBSTACLES.push([x - 0.4, z, 0.45], [x + 0.4, z, 0.45], [x, z - 0.75, 0.3]);
PLANTS.forEach(([x, z], i) => {
  OBSTACLES.push([x, z, 0.32]);
  const f = PLANT_FALLS.find(p => p[0] === i);
  if (f) OBSTACLES.push([x + Math.sin(f[2]) * 0.9, z + Math.cos(f[2]) * 0.9, 0.42, f[1] + 0.3]);
});
for (let k = -4; k <= 3; k++) { const px = 0.85 + k * 1.7; OBSTACLES.push([px, -0.92, 0.34], [px, 0, 0.3], [px, 0.92, 0.34]); }
for (const sd of [-1, 1]) for (let x = 6.3; x <= 9.9; x += 0.35) OBSTACLES.push([sd * x, 0, 0.08]);
{ // glass facade between the doors
  const solid = [[-9.9, -7.25], [-4.75, -1.7], [0.8, 2.15], [4.65, 9.9]];
  for (const [a, b] of solid) for (let x = a; x <= b + 1e-6; x += 0.3) OBSTACLES.push([x, -14, 0.08]);
}

// open-area spots outside, well away from the building (filled from the far side first)
export const SPOTS = [];
for (const z of [-23.0, -22.2, -21.4, -20.6, -19.8, -19.0]) for (let c = 0; c < 10; c++) SPOTS.push([-3.3 + c * 0.75 + (Math.round(z * 1.25) % 2) * 0.3, z]);

// ------------------------------------------------------------------ agents
export function makeAgents() {
  const r = rng(20261027);
  const agents = [];
  const okSpot = (x, z, list) => list.every(a => Math.hypot(a.x0 - x, a.z0 - z) > 0.9) &&
    OBSTACLES.every(([ox, oz, or, on]) => on || Math.hypot(ox - x, oz - z) > or + 0.45);
  // the main character (yellow shirt) chats with two colleagues at the back of the office
  agents.push({ id: 'user', x0: 0.4, z0: 15.6, face: Math.PI, v0: 3.0, delay: 1.9, lane: 0 });
  agents.push({ id: 'buddy1', x0: -0.45, z0: 14.7, face: 0.75, v0: 2.9, delay: 1.8 });
  agents.push({ id: 'buddy2', x0: 1.35, z0: 14.75, face: -0.8, v0: 2.85, delay: 2.1 });
  let tries = 0;
  while (agents.length < 43 && tries++ < 8000) {
    const x = -9.0 + r() * 18, z = 3.4 + Math.pow(r(), 1.1) * 18;
    if (FIRES.some(([fx, fz, fr, ft]) => ft < 7 && Math.hypot(fx - x, fz - z) < fr + 1.6)) continue;
    if (!okSpot(x, z, agents)) continue;
    const slow = r() < 0.2;
    agents.push({ id: 'o' + agents.length, x0: x, z0: z, face: r() * Math.PI * 2, v0: slow ? 2.3 + r() * 0.4 : 2.8 + r() * 0.8, delay: 1.2 + Math.pow(r(), 1.6) * 2.0 });
  }
  // lanes: nearest lane, balanced; user fixed on the centre lane
  const count = LANE_XS.map(() => 0); count[3] = 1;
  for (const a of agents.slice(1).sort((p, q) => p.z0 - q.z0)) {
    const i = LANE_XS.map((lx, k) => [Math.abs(lx - a.x0) + count[k] * 0.6, k]).sort((p, q) => p[0] - q[0])[0][1];
    count[i]++; a.lane = LANE_XS[i];
  }
  const lobby = [
    { id: 'recep', x0: 4.75, z0: -4.97, face: 0.5 + Math.PI, pre: [[2.3, -4.3]] },
    { id: 'asker', x0: 4.3, z0: -6.51, face: 0.5 },
    { id: 'sofaA', x0: 6.85, z0: -9.9, face: -Math.PI / 2 },
    { id: 'sofaB', x0: 6.85, z0: -8.9, face: -Math.PI / 2 },
    { id: 'sofaC', x0: 6.9, z0: -12.3, face: -Math.PI / 2 },
    { id: 'chatA', x0: -6.0, z0: -8.2, face: 2.6 },
    { id: 'chatB', x0: -5.1, z0: -8.9, face: -1.6 },
    { id: 'chatC', x0: -6.2, z0: -9.3, face: 0.4 },
  ];
  for (const a of lobby) agents.push({ ...a, v0: 2.6 + r() * 0.7, delay: 1.3 + r() * 1.0, lane: null });
  // doors: nearest to where they come from, balanced
  const dc = [0, 0, 0];
  agents.forEach((a, i) => {
    a.idx = i;
    const fromX = a.lane !== null ? a.lane : a.x0;
    const k = a.id === 'user' ? 1 : DOORS.map((d, j) => [Math.abs(d.x - fromX) + dc[j] * 0.75, j]).sort((p, q) => p[0] - q[0])[0][1];
    dc[k]++; a.door = k; a.doorX = DOORS[k].x + ((i * 7) % 3 - 1) * 0.45;
  });
  return agents;
}

function waypoints(a, dest) {
  const w = [];
  if (a.lane !== null) {
    w.push({ x: a.lane, z: 3.1, passZ: 3.35 });
    w.push({ x: a.lane, z: -2.3, passZ: -2.0 });
  }
  if (a.pre) for (const [x, z] of a.pre) w.push({ x, z, rad: 0.6 });
  w.push({ x: a.doorX, z: -11.9, passZ: -11.6 });
  w.push({ x: a.doorX, z: -15.9, passZ: -15.6 });
  w.push({ x: dest[0], z: dest[1], final: true });
  return w;
}

// ------------------------------------------------------------------ simulation
export function simulate(agents, dests, tiles = []) {
  const OBS = OBSTACLES.concat(tiles.map(k => [k.x, k.z, 0.36, k.land]));
  const { DT, DURATION, R } = SIM;
  const N = agents.length, steps = Math.round(DURATION / DT);
  const st = agents.map((a, i) => ({ x: a.x0, z: a.z0, vx: 0, vz: 0, h: a.face, dist: 0, wp: 0, w: waypoints(a, dests[i]), done: false, exitT: null }));
  const out = agents.map(() => ({ x: new Float32Array(steps + 1), z: new Float32Array(steps + 1), h: new Float32Array(steps + 1), d: new Float32Array(steps + 1), v: new Float32Array(steps + 1) }));
  const rec = k => st.forEach((s, i) => { const o = out[i]; o.x[k] = s.x; o.z[k] = s.z; o.h[k] = s.h; o.d[k] = s.dist; o.v[k] = Math.hypot(s.vx, s.vz); });
  rec(0);
  let minGap = 9;
  for (let k = 1; k <= steps; k++) {
    const t = k * DT, shakeSlow = 1 - 0.22 * intensity(t);
    const ax = new Float64Array(N), az = new Float64Array(N), dirs = [];
    for (let i = 0; i < N; i++) {
      const a = agents[i], s = st[i];
      if (t < a.delay || s.done) { dirs.push(null); continue; }
      let wp = s.w[s.wp];
      while (!wp.final && ((wp.passZ !== undefined && s.z < wp.passZ) || Math.hypot(wp.x - s.x, wp.z - s.z) < (wp.rad || 0.45))) wp = s.w[++s.wp];
      let dx = wp.x - s.x, dz = wp.z - s.z;
      const dl = Math.hypot(dx, dz) || 1;
      dx /= dl; dz /= dl;
      dirs.push([dx, dz]);
      let v0 = a.v0 * shakeSlow * Math.min(1, (t - a.delay) / 0.7 + 0.2);
      if (wp.final) v0 *= Math.min(1, dl / 2.2);
      ax[i] += (v0 * dx - s.vx) / 0.38;
      az[i] += (v0 * dz - s.vz) / 0.38;
    }
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const si = st[i], sj = st[j];
      let nx = si.x - sj.x, nz = si.z - sj.z;
      const d = Math.hypot(nx, nz);
      if (d > 2.4) continue;
      nx /= d || 1; nz /= d || 1;
      const f = 2.4 * Math.exp((2 * R - d) / 0.32);
      for (const [p, sg] of [[i, 1], [j, -1]]) {
        const di = dirs[p]; if (!di) continue;
        const cos = -(sg * nx * di[0] + sg * nz * di[1]);
        const wgt = 0.3 + 0.7 * (1 + cos) / 2;
        ax[p] += sg * nx * f * wgt; az[p] += sg * nz * f * wgt;
      }
    }
    for (let i = 0; i < N; i++) {
      if (!dirs[i]) continue;
      const s = st[i];
      for (const [ox, oz, or, on] of OBS) {
        if (on && t < on) continue;
        let nx = s.x - ox, nz = s.z - oz; const d = Math.hypot(nx, nz);
        if (d > or + 1.3) continue;
        nx /= d || 1; nz /= d || 1;
        const f = 3.4 * Math.exp((or + R - d) / 0.2);
        ax[i] += nx * f; az[i] += nz * f;
        const di = dirs[i], tx = -nz, tz = nx, side = Math.sign(tx * di[0] + tz * di[1]) || 1;
        ax[i] += side * tx * f * 0.6; az[i] += side * tz * f * 0.6;
      }
      { const gp = guardPos(t); let nx = s.x - gp.x, nz = s.z - gp.z; const d = Math.hypot(nx, nz); if (d < 1.6) { nx /= d || 1; nz /= d || 1; const f = 3.4 * Math.exp((0.3 + R - d) / 0.2); ax[i] += nx * f; az[i] += nz * f; } }
      for (const wx of [-9.7, 9.7]) { const d = Math.abs(s.x - wx); if (d < 1) ax[i] += Math.sign(s.x - wx) * 3 * Math.exp((R - d) / 0.2); }
    }
    for (let i = 0; i < N; i++) {
      const a = agents[i], s = st[i], di = dirs[i];
      if (!di) { s.vx = 0; s.vz = 0; continue; }
      s.vx += ax[i] * DT; s.vz += az[i] * DT;
      const along = s.vx * di[0] + s.vz * di[1];
      if (along < 0) { s.vx -= along * di[0]; s.vz -= along * di[1]; }
      const sp = Math.hypot(s.vx, s.vz), cap = a.v0 * 1.15;
      if (sp > cap) { s.vx *= cap / sp; s.vz *= cap / sp; }
      const px = s.x, pz = s.z;
      s.x += s.vx * DT; s.z += s.vz * DT;
      if (a.lane !== null && t < GATE.release + 0.8 && s.z < 0.42 && pz > -0.3) { s.z = 0.42; s.vz = Math.max(0, s.vz); }
      if (a.lane !== null && s.z > -1.7 && s.z < 2.0) {
        s.x += (a.lane - s.x) * Math.min(1, 9 * DT);
        if (Math.abs(s.z) < 1.4) s.x = Math.min(a.lane + 0.22, Math.max(a.lane - 0.22, s.x));
      }
      const D = DOORS[a.door];
      if (s.z > -14.5 && s.z < -13.5) s.x = Math.min(D.xmax - 0.1, Math.max(D.xmin + 0.1, s.x));
      const wpNow = s.w[s.wp];
      if (wpNow.final && Math.hypot(wpNow.x - s.x, wpNow.z - s.z) < 0.4) { s.done = true; s.vx = s.vz = 0; }
      if (s.exitT === null && s.z < -14) s.exitT = t;
      s.dist += Math.hypot(s.x - px, s.z - pz);
    }
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const si = st[i], sj = st[j];
      const dx = si.x - sj.x, dz = si.z - sj.z, d = Math.hypot(dx, dz);
      if (d < minGap && (dirs[i] || dirs[j])) minGap = d;
      if (d < 2 * R * 0.92 && d > 1e-6) {
        const push = (2 * R * 0.92 - d) / 2, nx = dx / d, nz = dz / d;
        const mi = dirs[i] && !si.done ? 1 : 0, mj = dirs[j] && !sj.done ? 1 : 0;
        if (mi + mj === 0) continue;
        si.x += nx * push * 2 * mi / (mi + mj); si.z += nz * push * 2 * mi / (mi + mj);
        sj.x -= nx * push * 2 * mj / (mi + mj); sj.z -= nz * push * 2 * mj / (mi + mj);
      }
    }
    for (let i = 0; i < N; i++) {
      const s = st[i], sp = Math.hypot(s.vx, s.vz);
      let target = null;
      if (s.done) target = Math.atan2(-s.x * 0.12, 1); // look back at the building
      else if (sp > 0.15) target = Math.atan2(s.vx, s.vz);
      else if (dirs[i]) target = Math.atan2(dirs[i][0], dirs[i][1]);
      if (target !== null) {
        let dh = target - s.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        const maxT = (s.done ? 1.6 : 5.5) * DT;
        s.h += Math.max(-maxT, Math.min(maxT, dh));
      }
    }
    rec(k);
  }
  return { out, st, minGap, steps };
}

// closest anyone gets to (x, z) during the time window [t0, t1]
function nearest(res, x, z, t0, t1) {
  let best = 99;
  const k0 = Math.max(0, Math.round(t0 / SIM.DT)), k1 = Math.min(res.steps, Math.round(t1 / SIM.DT));
  for (const o of res.out) for (let k = k0; k <= k1; k += 3) best = Math.min(best, Math.hypot(o.x[k] - x, o.z[k] - z));
  return best;
}
// move each falling ceiling tile to a nearby ceiling cell where nobody is underneath when it lands
function placeTiles(res) {
  return TILES.map(tl => {
    let best = null;
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
      const x = tl.x + dx * 0.6, z = tl.z + dz * 0.6;
      if (Math.abs(x) > 9.3 || z > 22.4 || z < -13.4 || Math.abs(z) < 1.3) continue;
      if (OBSTACLES.some(([ox, oz, or]) => Math.hypot(ox - x, oz - z) < or + 0.35)) continue;
      const clear = nearest(res, x, z, tl.land - 0.5, tl.land + 0.35);
      const score = Math.min(clear, 1.3) * 10 - Math.hypot(dx, dz) * 0.6;
      if (!best || score > best.score) best = { score, x, z, clear };
    }
    return { ...tl, x: best.x, z: best.z, clear: best.clear };
  });
}

export function runCrowd() {
  const agents = makeAgents();
  const first = simulate(agents, agents.map(() => [0, -21]));
  const order = agents.map((a, i) => i).sort((i, j) => (first.st[i].exitT ?? 99) - (first.st[j].exitT ?? 99));
  const dests = agents.map(() => null);
  // assembly spots: far rows first, on the side of the door each person comes out of
  const free = SPOTS.map((p, k) => k);
  for (const i of order) {
    const dx = DOORS[agents[i].door].x * 0.55;
    let bk = 0, bs = 1e9;
    free.forEach((k, j) => { const [x, z] = SPOTS[k]; const sc = Math.abs(x - dx) * 1.0 + (z + 23) * 1.2; if (sc < bs) { bs = sc; bk = j; } });
    dests[i] = SPOTS[free.splice(bk, 1)[0]];
  }
  let tiles = placeTiles(simulate(agents, dests));
  let res = simulate(agents, dests, tiles);
  tiles = placeTiles(res).map((k, i) => (k.clear >= tiles[i].clear ? k : tiles[i]));
  res = simulate(agents, dests, tiles);
  tiles = tiles.map(k => ({ ...k, clear: nearest(res, k.x, k.z, k.land - 0.5, k.land + 0.35) }));
  return { agents, dests, tiles, ...res };
}

export function sampler(res) {
  const { DT } = SIM;
  return (i, t) => {
    const o = res.out[i], f = Math.min(Math.max(t, 0) / DT, res.steps), k = Math.min(Math.floor(f), res.steps - 1), u = f - k;
    let dh = o.h[k + 1] - o.h[k]; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    return { x: o.x[k] + (o.x[k + 1] - o.x[k]) * u, z: o.z[k] + (o.z[k + 1] - o.z[k]) * u, h: o.h[k] + dh * u, d: o.d[k] + (o.d[k + 1] - o.d[k]) * u, v: o.v[k] + (o.v[k + 1] - o.v[k]) * u };
  };
}
