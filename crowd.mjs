// Deterministic evacuation crowd simulation (social-force model, fixed time step).
// Pure JS with no dependencies, so it runs both in the browser (scene.js) and in Node (testing).
// Everyone walks forward toward the exit: office -> any open gate lane -> lobby -> entrance
// doors -> outside assembly point. Nobody walks backward.

export const SIM = { DT: 1 / 60, DURATION: 24.5, R: 0.25 };

export const LANE_XS = [-3, -2, -1, 0, 1, 2, 3].map(k => k * 1.7);
const DOOR = { x: -0.45, z: -14, xmin: -1.38, xmax: 0.48 };

function rng(seed) { // mulberry32
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// static obstacles as circles [x, z, r]
export const OBSTACLES = [
  // office
  [-6.5, 7, 0.42], [6.5, 7, 0.42], [-6.5, 15, 0.42], [6.5, 15, 0.42],
  [-4.2, 5, 0.35], [3.4, 4.2, 0.35], [-4.8, 15, 0.35], [-2.8, 21.5, 0.35], [2.8, 21.5, 0.35], [8.6, 18, 0.35],
  [-4.6, 10, 0.6], [-3.0, 11.6, 0.6], [-3.2, 9.8, 0.5],
  [6.8, 19.6, 1.8], // burning area
  // lobby
  [3.0, -4.83, 0.5], [3.7, -5.22, 0.5], [4.4, -5.6, 0.5], [5.1, -5.98, 0.5], [5.8, -6.37, 0.5], // reception desk
  [7.6, -10.1, 0.5], [7.6, -8.9, 0.5],                        // sofa 1
  [4.6, -11.6, 0.5], [5.8, -11.6, 0.5],                       // sofa 2
  [5.6, -9.3, 0.55],                                           // coffee table
  [-8.6, -12.6, 0.35], [3.0, -12.8, 0.35],                    // plants
  [2.1, -11.4, 0.3],                                           // guard directing people
  // outside
  [-2.9, -16.5, 0.12], [2.0, -16.5, 0.12], [-5, -18.5, 0.2], [4, -18.5, 0.2], [-9, -18.5, 0.2], [8, -18.5, 0.2],
  [-4.4, -21.6, 0.15], // assembly point sign
];
// gate pods (3 circles each) and the glass railings to the side walls
for (let k = -4; k <= 3; k++) {
  const px = 0.85 + k * 1.7;
  OBSTACLES.push([px, -0.92, 0.34], [px, 0, 0.3], [px, 0.92, 0.34]);
}
for (const sd of [-1, 1]) for (let x = 6.3; x <= 9.9; x += 0.35) OBSTACLES.push([sd * x, 0, 0.08]);
// glass facade either side of the entrance doors
for (let x = -9.8; x <= -1.75; x += 0.3) OBSTACLES.push([x, -14, 0.08]);
for (let x = 0.85; x <= 9.8; x += 0.3) OBSTACLES.push([x, -14, 0.08]);

// assembly-point spots outside (filled from the back row forward)
export const SPOTS = [];
{
  const rows = [-23.1, -22.3, -21.5, -20.7, -19.9, -19.1];
  for (const z of rows) for (let c = 0; c < 9; c++) SPOTS.push([-3.5 + c * 0.8 + (rows.indexOf(z) % 2) * 0.25, z]);
}

// ------------------------------------------------------------------ agents
export function makeAgents() {
  const r = rng(20261023);
  const agents = [];
  const okSpot = (x, z, list) => list.every(a => Math.hypot(a.x0 - x, a.z0 - z) > 0.85) &&
    OBSTACLES.every(([ox, oz, or]) => Math.hypot(ox - x, oz - z) > or + 0.45);
  // the main character (yellow shirt) starts in the middle of the office, uses the centre lane
  agents.push({ id: 'user', x0: 0.35, z0: 9.2, face: Math.PI, v0: 1.5, delay: 0.5, lane: 0 });
  // office workers spread around the office
  let tries = 0;
  while (agents.length < 37 && tries++ < 5000) {
    const x = -8.8 + r() * 17.6, z = 3.3 + Math.pow(r(), 1.3) * 14.5;
    if (x > 3.8 && z > 15.5) continue; // too close to the fire
    if (!okSpot(x, z, agents)) continue;
    agents.push({ id: 'o' + agents.length, x0: x, z0: z, face: r() * Math.PI * 2, v0: 1.32 + r() * 0.38, delay: 0.15 + r() * 2.3 });
  }
  // lanes: nearest lane, balanced (max 6 per lane), user fixed on lane 0
  const count = LANE_XS.map(() => 0);
  count[3] = 1; agents[0].lane = 0;
  const office = agents.slice(1).sort((a, b) => a.z0 - b.z0);
  for (const a of office) {
    const order = LANE_XS.map((lx, i) => [Math.abs(lx - a.x0) + count[i] * 0.55, i]).sort((p, q) => p[0] - q[0]);
    const i = order[0][1]; count[i]++; a.lane = LANE_XS[i];
  }
  // people already in the lobby
  const lobby = [
    { id: 'recep', x0: 4.75, z0: -4.97, face: 0.5 + Math.PI, pre: [[2.3, -4.3]] },
    { id: 'asker', x0: 4.3, z0: -6.51, face: 0.5 },
    { id: 'sofaA', x0: 6.85, z0: -9.9, face: -Math.PI / 2 },
    { id: 'sofaB', x0: 6.85, z0: -8.9, face: -Math.PI / 2 },
    { id: 'sofaC', x0: 5.4, z0: -10.85, face: 0 },
    { id: 'chatA', x0: -6.0, z0: -8.2, face: 2.6 },
    { id: 'chatB', x0: -5.1, z0: -8.9, face: -1.6 },
    { id: 'chatC', x0: -6.2, z0: -9.3, face: 0.4 },
  ];
  for (const a of lobby) agents.push({ ...a, v0: 1.3 + r() * 0.3, delay: 0.3 + r() * 1.2, lane: null });
  agents.forEach((a, i) => { a.idx = i; a.doorX = DOOR.x + (((i * 7) % 3) - 1) * 0.62; });
  return agents;
}

function waypoints(a, dest) {
  const w = [];
  if (a.lane !== null) {
    w.push({ x: a.lane, z: 3.1, passZ: 3.35, lane: true });
    w.push({ x: a.lane, z: -2.3, passZ: -2.0, lane: true });
  }
  if (a.pre) for (const [x, z] of a.pre) w.push({ x, z, rad: 0.6 });
  w.push({ x: a.doorX, z: -11.7, passZ: -11.4 });
  w.push({ x: a.doorX, z: -15.7, passZ: -15.4, door: true });
  w.push({ x: dest[0], z: dest[1], final: true });
  return w;
}

// ------------------------------------------------------------------ simulation
export function simulate(agents, dests) {
  const { DT, DURATION, R } = SIM;
  const N = agents.length, steps = Math.round(DURATION / DT);
  const st = agents.map((a, i) => ({
    x: a.x0, z: a.z0, vx: 0, vz: 0, h: a.face, dist: 0, wp: 0, w: waypoints(a, dests[i]), done: false, exitT: null,
  }));
  const out = agents.map(() => ({ x: new Float32Array(steps + 1), z: new Float32Array(steps + 1), h: new Float32Array(steps + 1), d: new Float32Array(steps + 1), v: new Float32Array(steps + 1) }));
  const rec = (k) => st.forEach((s, i) => { const o = out[i]; o.x[k] = s.x; o.z[k] = s.z; o.h[k] = s.h; o.d[k] = s.dist; o.v[k] = Math.hypot(s.vx, s.vz); });
  rec(0);
  let minGap = 9;
  for (let k = 1; k <= steps; k++) {
    const t = k * DT;
    const ax = new Float64Array(N), az = new Float64Array(N), dirs = [];
    for (let i = 0; i < N; i++) {
      const a = agents[i], s = st[i];
      if (t < a.delay || s.done) { dirs.push(null); continue; }
      // advance waypoints
      let wp = s.w[s.wp];
      while (!wp.final && ((wp.passZ !== undefined && s.z < wp.passZ) || Math.hypot(wp.x - s.x, wp.z - s.z) < (wp.rad || 0.45))) wp = s.w[++s.wp];
      let dx = wp.x - s.x, dz = wp.z - s.z;
      const dl = Math.hypot(dx, dz) || 1;
      dx /= dl; dz /= dl;
      dirs.push([dx, dz]);
      let v0 = a.v0 * Math.min(1, (t - a.delay) / 0.9 + 0.15); // gets going from standing
      if (wp.final) v0 *= Math.min(1, dl / 1.3);
      ax[i] += (v0 * dx - s.vx) / 0.45;
      az[i] += (v0 * dz - s.vz) / 0.45;
    }
    // agent-agent repulsion (anisotropic: people react mostly to those in front)
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const si = st[i], sj = st[j];
      let nx = si.x - sj.x, nz = si.z - sj.z;
      const d = Math.hypot(nx, nz);
      if (d > 2.2) continue;
      nx /= d || 1; nz /= d || 1;
      const f = 2.1 * Math.exp((2 * R - d) / 0.3);
      for (const [p, q, sg] of [[i, j, 1], [j, i, -1]]) {
        const di = dirs[p]; if (!di) continue;
        const cos = -(sg * nx * di[0] + sg * nz * di[1]); // >0 if q is in front of p
        const wgt = 0.3 + 0.7 * (1 + cos) / 2;
        ax[p] += sg * nx * f * wgt; az[p] += sg * nz * f * wgt;
      }
    }
    // obstacles + walls
    for (let i = 0; i < N; i++) {
      if (!dirs[i]) continue;
      const s = st[i];
      for (const [ox, oz, or] of OBSTACLES) {
        let nx = s.x - ox, nz = s.z - oz; const d = Math.hypot(nx, nz);
        if (d > or + 1.2) continue;
        nx /= d || 1; nz /= d || 1;
        const f = 3.0 * Math.exp((or + R - d) / 0.2);
        ax[i] += nx * f; az[i] += nz * f;
        // slide around obstacles instead of stalling in front of them
        const di = dirs[i], tx = -nz, tz = nx, side = Math.sign(tx * di[0] + tz * di[1]) || 1;
        ax[i] += side * tx * f * 0.6; az[i] += side * tz * f * 0.6;
      }
      for (const wx of [-9.7, 9.7]) { const d = Math.abs(s.x - wx); if (d < 1) ax[i] += Math.sign(s.x - wx) * 3 * Math.exp((R - d) / 0.2); }
    }
    // integrate
    for (let i = 0; i < N; i++) {
      const a = agents[i], s = st[i], di = dirs[i];
      if (!di) { s.vx = 0; s.vz = 0; continue; }
      s.vx += ax[i] * DT; s.vz += az[i] * DT;
      // forward only: never move against the walking direction
      const along = s.vx * di[0] + s.vz * di[1];
      if (along < 0) { s.vx -= along * di[0]; s.vz -= along * di[1]; }
      const sp = Math.hypot(s.vx, s.vz), cap = a.v0 * 1.2;
      if (sp > cap) { s.vx *= cap / sp; s.vz *= cap / sp; }
      const px = s.x, pz = s.z;
      s.x += s.vx * DT; s.z += s.vz * DT;
      // lanes through the gate and the doorway are physical openings
      if (a.lane !== null && s.z > -1.7 && s.z < 2.0) {
        s.x += (a.lane - s.x) * Math.min(1, 9 * DT);
        if (Math.abs(s.z) < 1.4) s.x = Math.min(a.lane + 0.22, Math.max(a.lane - 0.22, s.x));
      }
      if (s.z > -14.5 && s.z < -13.5) s.x = Math.min(DOOR.xmax, Math.max(DOOR.xmin, s.x));
      const wpNow = s.w[s.wp];
      if (wpNow.final && Math.hypot(wpNow.x - s.x, wpNow.z - s.z) < 0.4) { s.done = true; s.vx = s.vz = 0; }
      if (s.exitT === null && s.z < DOOR.z) s.exitT = t;
      s.dist += Math.hypot(s.x - px, s.z - pz);
    }
    // hard non-overlap
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
    // heading: turn smoothly toward the walking direction; at the assembly point face the building
    for (let i = 0; i < N; i++) {
      const s = st[i];
      const sp = Math.hypot(s.vx, s.vz);
      let target = null;
      if (s.done) target = Math.atan2(-s.x * 0.15, 1); // look back at the building, roughly toward the door
      else if (sp > 0.12) target = Math.atan2(s.vx, s.vz);
      else if (dirs[i]) target = Math.atan2(dirs[i][0], dirs[i][1]);
      if (target !== null) {
        let dh = target - s.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        const maxT = (s.done ? 1.6 : 4.5) * DT;
        s.h += Math.max(-maxT, Math.min(maxT, dh));
      }
    }
    rec(k);
  }
  return { out, st, minGap, steps };
}

// full pipeline: run once to learn the exit order, then assign assembly spots back-to-front
export function runCrowd() {
  const agents = makeAgents();
  const first = simulate(agents, agents.map(() => [-0.4, -21]));
  const order = agents.map((a, i) => i).sort((i, j) => (first.st[i].exitT ?? 99) - (first.st[j].exitT ?? 99) || first.st[i].z - first.st[j].z);
  const dests = agents.map(() => null);
  order.forEach((i, k) => { dests[i] = SPOTS[k % SPOTS.length]; });
  const res = simulate(agents, dests);
  return { agents, dests, ...res };
}

export function sampler(res) {
  const { DT } = SIM;
  return (i, t) => {
    const o = res.out[i], f = Math.min(Math.max(t, 0) / DT, res.steps), k = Math.min(Math.floor(f), res.steps - 1), u = f - k;
    let dh = o.h[k + 1] - o.h[k]; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    return { x: o.x[k] + (o.x[k + 1] - o.x[k]) * u, z: o.z[k] + (o.z[k + 1] - o.z[k]) * u, h: o.h[k] + dh * u, d: o.d[k] + (o.d[k + 1] - o.d[k]) * u, v: o.v[k] + (o.v[k + 1] - o.v[k]) * u };
  };
}
