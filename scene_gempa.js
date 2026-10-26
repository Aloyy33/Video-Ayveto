// AYVETO earthquake evacuation — deterministic Three.js animation.
// An earthquake hits the office: the building shakes, lamps swing, ceiling tiles fall, the power
// fails. The gate system is dead with every lane wide open, and everyone (including the visitor in
// the yellow shirt) takes cover, then runs out through the gates, the lobby and the entrance doors.
// Every frame is a pure function of time `t` (seconds), so the same scene can be
// played live in a browser or rendered frame-by-frame to video (see render.mjs).
import * as THREE from 'three';
import { runCrowd, sampler, DESKS, DOORS, PLANTS, GUARD_XZ } from './crowd_gempa.mjs';
import { QUAKE, GATE, intensity, ground, camShake, sway, swayAcc, MONITOR_FALLS, PLANT_FALLS, PAINTING_FALLS, GLASS, WALL_CRACKS_T, FACADE_CRACKS_T } from './quake.mjs';
const TAU = Math.PI * 2, TAU5 = TAU / 5;
const DOOR_XS = DOORS.map(d => d.x);
const DUST_C = new THREE.Color('#cbc3b4');
const plantGroups = [], paintings = [], recMonitors = [];

const params = new URLSearchParams(location.search);
const WIDTH = parseInt(params.get('w') || '1920', 10);
const HEIGHT = parseInt(params.get('h') || '1080', 10);
const RENDER_MODE = params.has('render');
export const DURATION = 24.0;

// ---------------------------------------------------------------- utilities
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, u) => a + (b - a) * u;
const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const smoother = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * u * (u * (u * 6 - 15) + 10); };
// rises a→b, holds, falls c→d
const pulse = (t, a, b, c, d) => smooth(a, b, t) * (1 - smooth(c, d, t));

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(WIDTH, HEIGHT);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
if (!RENDER_MODE) {
  const fit = () => {
    const s = Math.min(innerWidth / WIDTH, innerHeight / HEIGHT);
    renderer.domElement.style.width = `${WIDTH * s}px`;
    renderer.domElement.style.height = `${HEIGHT * s}px`;
    renderer.domElement.style.marginTop = `${(innerHeight - HEIGHT * s) / 2}px`;
  };
  addEventListener('resize', fit); fit();
}

const scene = new THREE.Scene();
const BG = new THREE.Color('#cfe2f1');
scene.background = BG;
scene.fog = new THREE.Fog(BG, 40, 110);

const camera = new THREE.PerspectiveCamera(38, WIDTH / HEIGHT, 0.1, 200);

// ---------------------------------------------------------------- lights
const hemi = new THREE.HemisphereLight('#ffffff', '#aebfcf', 1.15);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff6ea', 2.3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 60 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.025;
sun.shadow.radius = 4;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight('#e6f0ff', 0.9);
fill.position.set(4, 8, -12);
scene.add(fill);

// ---------------------------------------------------------------- materials
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, ...o });
const M = {
  podWhite: mat('#f7f9fb', { roughness: 0.35 }),
  navy: mat('#0f3b5f', { roughness: 0.4 }),
  glass: new THREE.MeshStandardMaterial({ color: '#7cc0e4', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide }),
  glassPartition: new THREE.MeshStandardMaterial({ color: '#a9d3ea', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
  steel: mat('#9aa7b3', { metalness: 0.6, roughness: 0.3 }),
  poleGray: mat('#5c6875', { roughness: 0.45 }),
  readerGray: mat('#c7ced5', { roughness: 0.4 }),
  red: mat('#e0283a', { roughness: 0.4 }),
  darkOutline: mat('#1e2a36'),
  tableTop: mat('#f0a63a', { roughness: 0.5 }),
  tableLeg: mat('#ddb57c', { roughness: 0.6 }),
  // user
  yellow: mat('#f2c81c', { roughness: 0.6 }),
  yellowDark: mat('#d9ad10', { roughness: 0.6 }),
  green: mat('#3fae3a', { roughness: 0.6 }),
  brown: mat('#8a5a2e', { roughness: 0.55 }),
  black: mat('#15181c', { roughness: 0.4 }),
  // guard
  suit: mat('#1f3354', { roughness: 0.6 }),        // navy security shirt
  suitShade: mat('#162540', { roughness: 0.6 }),
  pants: mat('#121a28', { roughness: 0.65 }),
  userHair: mat('#1c120b', { roughness: 0.75 }),
  skin: mat('#efc7a1', { roughness: 0.6 }),
  hair: mat('#121418', { roughness: 0.3 }),
  gold: mat('#d8aa3a', { metalness: 0.7, roughness: 0.3 }),
  // bag
  bag: mat('#2e3a48', { roughness: 0.7 }),
  bagInner: mat('#55606d', { roughness: 0.8 }),
  // building
  wall: mat('#eef2f6', { roughness: 0.8 }),
  wallDark: mat('#cfd8e0', { roughness: 0.8 }),
  plantPot: mat('#f4f6f8', { roughness: 0.5 }),
  leaf: mat('#3d9a57', { roughness: 0.7 }),
};
const edgeMat = new THREE.LineBasicMaterial({ color: '#2b3d4f', transparent: true, opacity: 0.85 });
const edgeMatSoft = new THREE.LineBasicMaterial({ color: '#5a4a36', transparent: true, opacity: 0.8 });

function addEdges(mesh, threshold = 30, m = edgeMat) {
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, threshold), m);
  e.userData.noShadow = true;
  mesh.add(e);
  return mesh;
}
function mesh(geo, material, x = 0, y = 0, z = 0, parent = null) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.userData = { canvas: c, ctx: g };
  return tex;
}

// ---------------------------------------------------------------- floor (polished lobby tiles)
{
  const tex = canvasTex(1024, 1024, (g, w, h) => {
    const n = 4, ts = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = 232 + ((i * 7 + j * 13) % 5) * 2;
      g.fillStyle = `rgb(${v},${v - 3},${v - 8})`;
      g.fillRect(i * ts, j * ts, ts, ts);
      const gr = g.createLinearGradient(i * ts, j * ts, (i + 1) * ts, (j + 1) * ts);
      gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(1, 'rgba(0,0,0,0.03)');
      g.fillStyle = gr; g.fillRect(i * ts, j * ts, ts, ts);
    }
    g.strokeStyle = '#cdc6bc'; g.lineWidth = 3;
    for (let i = 0; i <= n; i++) {
      g.beginPath(); g.moveTo(i * ts, 0); g.lineTo(i * ts, h); g.stroke();
      g.beginPath(); g.moveTo(0, i * ts); g.lineTo(w, i * ts); g.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(200 / 4.8, 200 / 4.8);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const floor = mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.userData.receiveOnly = true;
  scene.add(floor);
}

// ---------------------------------------------------------------- AYVETO gate
function stadiumGeo(halfW, halfL, height) {
  const s = halfL - halfW;
  const sh = new THREE.Shape();
  sh.moveTo(halfW, -s);
  sh.lineTo(halfW, s);
  sh.absarc(0, s, halfW, 0, Math.PI, false);
  sh.lineTo(-halfW, -s);
  sh.absarc(0, -s, halfW, Math.PI, Math.PI * 2, false);
  const g = new THREE.ExtrudeGeometry(sh, { depth: height, bevelEnabled: false, curveSegments: 40 });
  g.rotateX(-Math.PI / 2);
  return g;
}

const logoTex = canvasTex(512, 128, (g, w, h) => {
  g.fillStyle = '#0f3b5f'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffffff';
  g.font = 'bold 86px "Noto Sans", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('AYVETO', w / 2, h / 2 + 4);
});

const POD_H = 1.05;
const POD_X = 0.85;
const gate = { pods: [], flaps: [], xMarks: [], checks: [], leds: [], glows: [] };
const ledMat = new THREE.MeshStandardMaterial({ color: '#203040', emissive: '#6fa9d6', emissiveIntensity: 0.45 }); // all lanes, driven by the gate state
const checkMat = new THREE.MeshStandardMaterial({ color: '#1fbf4a', emissive: '#27e05a', emissiveIntensity: 1.2 });
const glowDiscMat = new THREE.MeshBasicMaterial({ color: '#35ff6e', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });

const indicatorOffMat = new THREE.MeshStandardMaterial({ color: '#e0283a', roughness: 0.4, emissive: '#ff2030', emissiveIntensity: 0.25 }); // lane status (X = closed)
function makeXMark(parent, x, z, active) {
  const grp = new THREE.Group();
  grp.position.set(x, POD_H + 0.004, z);
  for (const a of [Math.PI / 4, -Math.PI / 4]) {
    const o = mesh(new THREE.BoxGeometry(0.27, 0.006, 0.075), M.darkOutline, 0, 0, 0, grp); o.rotation.y = a;
    const r = mesh(new THREE.BoxGeometry(0.245, 0.012, 0.05), indicatorOffMat, 0, 0.002, 0, grp); r.rotation.y = a;
  }
  parent.add(grp);
  return;
  gate.xMarks.push(grp);
  // green check (shown after successful verification)
  const chk = new THREE.Group();
  chk.position.set(x, POD_H + 0.006, z);
  const stroke = (x1, z1, x2, z2) => {
    const len = Math.hypot(x2 - x1, z2 - z1) + 0.05;
    const m = mesh(new THREE.BoxGeometry(len, 0.014, 0.05), checkMat, (x1 + x2) / 2, 0, (z1 + z2) / 2, chk);
    m.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
  };
  stroke(-0.11, 0.0, -0.035, 0.075);  // short stroke (screen: down-right)
  stroke(-0.035, 0.075, 0.12, -0.09); // long stroke (screen: up-right)
  const disc = mesh(new THREE.CircleGeometry(0.3, 40), glowDiscMat, 0, -0.002, 0, chk); disc.rotation.x = -Math.PI / 2;
  chk.visible = false;
  parent.add(chk);
  gate.checks.push(chk);
}

const ledIdleMat = ledMat;
function makePod(cx, active) {
  const g = new THREE.Group();
  g.position.set(cx, 0, 0);
  const halfW = 0.30, halfL = 1.0, cylR = 0.34, cylZ = 0.92;
  addEdges(mesh(stadiumGeo(halfW, halfL, POD_H), M.podWhite, 0, 0, 0, g), 35);
  for (const z of [-cylZ, cylZ]) {
    addEdges(mesh(new THREE.CylinderGeometry(cylR, cylR, POD_H, 48), M.podWhite, 0, POD_H / 2, z, g), 35);
    addEdges(mesh(new THREE.CylinderGeometry(cylR + 0.012, cylR + 0.012, 0.3, 48), M.navy, 0, 0.67, z, g), 35);
    makeXMark(g, 0, z, active);
  }
  addEdges(mesh(stadiumGeo(halfW + 0.012, halfL + 0.012, 0.3), M.navy, 0, 0.52, 0, g), 35);
  // AYVETO branding on both long sides of the navy band
  for (const s of [-1, 1]) {
    const p = mesh(new THREE.PlaneGeometry(0.8, 0.2), new THREE.MeshStandardMaterial({ map: logoTex, roughness: 0.4 }), s * (halfW + 0.0135), 0.67, 0, g);
    p.rotation.y = s * Math.PI / 2;
  }
  // LED strips on both long sides (each faces a lane); only the visitor's lane reacts
  for (const sd of [-1, 1]) {
    const facesActive = active && sd === Math.sign(-cx);
    gate.leds.push(mesh(new THREE.BoxGeometry(0.02, 0.035, 1.3), facesActive ? ledMat : ledIdleMat, sd * (halfW + 0.006), 0.95, 0, g));
  }
  scene.add(g);
  gate.pods.push(g);
  return g;
}
// a bank of speed gates: 8 pods -> 7 lanes; the visitor uses the centre lane (x = 0)
const LANE_W = 2 * POD_X;
const LANES = [-3, -2, -1, 0, 1, 2, 3].map(k => k * LANE_W);
for (let k = -4; k <= 3; k++) { const x = POD_X + k * LANE_W; makePod(x, Math.abs(Math.abs(x) - POD_X) < 1e-6); }

// glass flap barriers, hinged on the inner faces of the pods of every lane
for (const lc of LANES) for (const side of [-1, 1]) {
  const pivot = new THREE.Group();
  pivot.position.set(lc + side * (POD_X - 0.30), 0.3, 0);
  const dir = -side; // extends toward the centre of the lane
  const panel = mesh(new THREE.BoxGeometry(0.52, 0.64, 0.025), M.glass, dir * 0.27, 0.32, 0, pivot);
  addEdges(panel, 30, new THREE.LineBasicMaterial({ color: '#2f6f96', transparent: true, opacity: 0.9 }));
  panel.userData.noShadow = true;
  mesh(new THREE.BoxGeometry(0.03, 0.66, 0.04), M.steel, dir * 0.015, 0.32, 0, pivot);
  scene.add(pivot);
  gate.flaps.push({ pivot, open: side < 0 ? -Math.PI / 2 : Math.PI / 2 }); // closed until the emergency release
}
// glass railings from the outer pods to the side walls, closing off the security line
{
  const x0 = POD_X + 3 * LANE_W + 0.34, x1 = 9.85;
  for (const sd of [-1, 1]) {
    const w = x1 - x0, cx = sd * (x0 + x1) / 2;
    const gl = mesh(new THREE.BoxGeometry(w, 0.85, 0.02), M.glassPartition, cx, 0.6, 0); gl.userData.noShadow = true; scene.add(gl);
    scene.add(mesh(new THREE.BoxGeometry(w, 0.05, 0.06), M.steel, cx, 1.05, 0));
    for (let i = 0; i <= 3; i++) scene.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.05, 12), M.steel, sd * (x0 + w * i / 3), 0.525, 0));
  }
}

// RFID reader built into the gate: no separate pole. Each pod of the visitor's lane carries a
// small tilted status display at the lane entrance; the antenna sits inside the gate itself.
const SW = 640, SH = 420;
const screenTex = canvasTex(SW, SH, () => {});
const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false });
for (let k = -4; k <= 3; k++) {
  const d = new THREE.Group();
  d.position.set(POD_X + k * 2 * POD_X, POD_H, -0.42);
  d.rotation.x = 0.42; // face tilts up toward people in the lobby (-z)
  addEdges(mesh(new THREE.BoxGeometry(0.46, 0.32, 0.05), M.readerGray, 0, 0.18, 0, d));
  mesh(new THREE.BoxGeometry(0.12, 0.05, 0.12), M.readerGray, 0, 0.025, 0.02, d);
  const p = mesh(new THREE.PlaneGeometry(0.42, 0.276), screenMat, 0, 0.18, -0.0265, d);
  p.rotation.y = Math.PI;
  scene.add(d);
}
const gateAlarmLight = new THREE.PointLight('#ff3020', 0, 5, 1.6); gateAlarmLight.position.set(0, 1.5, -0.9); scene.add(gateAlarmLight);

// status display content for each phase of the gate system
let lastScreenKey = '';
function drawScreen(t) {
  const st = t < GATE.detect ? 'idle' : t < GATE.release ? 'detect' : t < GATE.shutdown ? 'release' : t < GATE.dark ? 'off' : 'dark';
  const fl = ((t - GATE.detect) * 3.2) % 1 < 0.55;
  const flick = st === 'off' ? Math.floor(t * 20) : 0;
  const key = st === 'idle' ? 'idle' + Math.floor(t * 4) : st === 'dark' ? 'dark' : st + Math.floor(t * 15) + fl + flick;
  if (key === lastScreenKey) return;
  lastScreenKey = key;
  const g = screenTex.userData.ctx, W = SW, H = SH, c = W / 2;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineCap = 'round'; g.lineJoin = 'round';
  const font = (px, w = 'bold') => { g.font = `${w} ${px}px "Noto Sans", sans-serif`; };
  const header = (bg) => { g.fillStyle = bg; g.fillRect(0, 0, W, 62); g.fillStyle = '#fff'; font(34); g.fillText('AYVETO', 110, 33); font(22, '600'); g.textAlign = 'right'; g.fillText('GATE 04', W - 24, 33); g.textAlign = 'center'; };
  const seismo = (y0, amp, col) => { // live seismograph trace
    g.strokeStyle = col; g.lineWidth = 4; g.beginPath();
    for (let x = 20; x <= W - 20; x += 3) {
      const tt = t - (W - 20 - x) / 260, I = intensity(tt);
      const v = I * (Math.sin(tt * 47) * 0.6 + Math.sin(tt * 83 + 1) * 0.4) + (1 - I) * 0.04 * Math.sin(tt * 30);
      x === 20 ? g.moveTo(x, y0 - v * amp) : g.lineTo(x, y0 - v * amp);
    }
    g.stroke();
  };
  if (st === 'idle') {
    g.fillStyle = '#0a2a44'; g.fillRect(0, 0, W, H); header('#0f3b5f');
    // RFID icon + text
    g.strokeStyle = 'rgba(120,190,255,0.9)'; g.lineWidth = 11;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(150, 205, 30 + i * 26, -Math.PI / 3.2, Math.PI / 3.2); g.stroke(); }
    g.fillStyle = '#7fc0ff'; g.fillRect(96, 168, 26, 74);
    g.fillStyle = '#ffffff'; font(40); g.textAlign = 'left'; g.fillText('SIAP', 300, 175); font(26, '600'); g.fillText('Kartu terdeteksi', 300, 222); g.fillText('otomatis', 300, 254); g.textAlign = 'center';
    g.fillStyle = '#16a34a'; g.beginPath(); g.arc(W - 48, H - 40, 10, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.7)'; font(20, '600'); g.textAlign = 'right'; g.fillText('SISTEM NORMAL', W - 68, H - 39); g.textAlign = 'center';
    seismo(H - 40, 12, 'rgba(120,190,255,0.55)');
  } else if (st === 'detect') {
    g.fillStyle = fl ? '#c4101c' : '#7a0710'; g.fillRect(0, 0, W, H); header('#4d040a');
    // warning triangle
    g.fillStyle = '#ffd400'; g.beginPath(); g.moveTo(92, 108); g.lineTo(152, 214); g.lineTo(32, 214); g.closePath(); g.fill();
    g.fillStyle = '#111'; font(76); g.fillText('!', 92, 178);
    g.fillStyle = '#fff'; font(54); g.textAlign = 'left'; g.fillText('GEMPA', 180, 132); g.fillText('TERDETEKSI', 180, 188); g.textAlign = 'center';
    font(24, '600'); g.fillStyle = '#ffe1e1'; g.fillText('EARTHQUAKE DETECTED', c, 252);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(16, 282, W - 32, 120);
    seismo(342, 50, '#ffe14d');
    font(20, '600'); g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText('GETARAN: KUAT', 30, 300); g.textAlign = 'center';
  } else if (st === 'release' || (st === 'off' && flick % 3 !== 0)) {
    g.fillStyle = '#0c7a35'; g.fillRect(0, 0, W, H); header('#06451d');
    g.fillStyle = '#fff'; font(48); g.fillText('GATE DIBUKA', c, 122);
    font(24, '600'); g.fillText('EMERGENCY OPEN · SEMUA JALUR', c, 168);
    // arrows pointing out (down = toward the lobby)
    g.strokeStyle = '#fff'; g.lineWidth = 16;
    for (const ax of [c - 150, c, c + 150]) { const ph = ((t * 2) % 1) * 22; g.beginPath(); g.moveTo(ax, 205 + ph); g.lineTo(ax, 290 + ph); g.stroke(); g.beginPath(); g.moveTo(ax - 32, 258 + ph); g.lineTo(ax, 292 + ph); g.lineTo(ax + 32, 258 + ph); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, H - 62, W, 62);
    g.fillStyle = '#fff'; font(26); g.fillText(st === 'off' ? 'SISTEM DIMATIKAN…' : 'SEGERA EVAKUASI', c, H - 31);
  } else if (st === 'off') {
    g.fillStyle = '#05070a'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(c - 160, H / 2 - 2, 320, 4); // CRT-style collapse line
  } else {
    g.fillStyle = '#05070a'; g.fillRect(0, 0, W, H);
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, 'rgba(255,255,255,0.09)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  screenTex.needsUpdate = true;
}
function updateGate(t) {
  drawScreen(t);
  const detect = t >= GATE.detect && t < GATE.release, release = t >= GATE.release && t < GATE.shutdown;
  const fl = ((t - GATE.detect) * 3.2) % 1 < 0.55;
  const off = t >= GATE.shutdown + (Math.floor(t * 20) % 3 === 0 ? 0 : 0.35);
  // flaps: emergency release opens every lane; they stay open when the power is cut
  const u = smoother(GATE.release + 0.05, GATE.openEnd, t);
  for (const f of gate.flaps) f.pivot.rotation.y = f.open * u + (u < 1 ? 0.025 * intensity(t) * Math.sin(t * 31 + f.open) : 0);
  if (off) { ledMat.emissiveIntensity = 0; indicatorOffMat.color.set('#4a4f56'); indicatorOffMat.emissiveIntensity = 0; }
  else if (detect) { ledMat.emissive.set('#ff2a2a'); ledMat.emissiveIntensity = fl ? 2.2 : 0.3; indicatorOffMat.color.set('#e0283a'); indicatorOffMat.emissiveIntensity = fl ? 1.6 : 0.2; }
  else if (release) { ledMat.emissive.set('#27e05a'); ledMat.emissiveIntensity = 1.8; indicatorOffMat.color.set('#4a4f56'); indicatorOffMat.emissiveIntensity = 0; }
  else { ledMat.emissive.set('#6fa9d6'); ledMat.emissiveIntensity = 0.45; indicatorOffMat.color.set('#e0283a'); indicatorOffMat.emissiveIntensity = 0.25; }
  gateAlarmLight.color.set(release ? '#30ff6a' : '#ff3020');
  gateAlarmLight.intensity = off ? 0 : detect ? (fl ? 3.5 : 0.4) : release ? 2.0 : 0;
}

// reception desk in the lobby, before the gate (visitor side faces the entrance and the walkway)
const RECEPTION = { x: 4.4, z: -5.6, ry: 0.5 };
const SOFAS = [[7.6, -9.5, -Math.PI / 2], [7.6, -12.3, -Math.PI / 2]];
const LOUNGE_CHAIRS = [[-4.6, 10, Math.PI / 2], [-3.0, 11.6, Math.PI]];

// ---------------------------------------------------------------- building context
// Layout (z grows into the company): street/outside (z < -14) -> glass entrance with
// automatic sliding doors (z = -14) -> lobby with security checkpoint -> AYVETO gate (z = 0)
// -> office interior with reception, lounge, elevators and logo wall (z = 23).
const entranceDoors = [];
{
  const B = {
    wallWarm: mat('#f3f0ea', { roughness: 0.85 }),
    wood: mat('#b07a48', { roughness: 0.6 }),
    woodDark: mat('#8a5a33', { roughness: 0.6 }),
    frame: mat('#3b4552', { roughness: 0.35, metalness: 0.5 }),
    curtain: new THREE.MeshStandardMaterial({ color: '#9fc6de', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }),
    paving: mat('#b8bcc0', { roughness: 0.95 }),
    road: mat('#5d6268', { roughness: 0.95 }),
    stripe: mat('#f2f2f2', { roughness: 0.8 }),
    grass: mat('#8fc27a', { roughness: 1 }),
    trunk: mat('#7a5534', { roughness: 0.9 }),
    tower: mat('#c9d6e2', { roughness: 0.4, metalness: 0.2 }),
    towerGlass: mat('#8fb3cf', { roughness: 0.2, metalness: 0.3 }),
    sofa: mat('#36506b', { roughness: 0.8 }),
    screen: null,
  };
  const add = (geo, m, x, y, z, edges = false) => { const o = mesh(geo, m, x, y, z); if (edges) addEdges(o, 30, new THREE.LineBasicMaterial({ color: '#8d8478', transparent: true, opacity: 0.6 })); scene.add(o); return o; };
  const noShadow = o => { o.userData.noShadow = true; return o; };
  const WALL_H = 6, FZ = -14, SIDE = 10, BACK = 23;

  // ---- outside: paving, street, trees, distant office towers
  const pav = add(new THREE.PlaneGeometry(120, 60), B.paving, 0, 0.003, FZ - 30.15); pav.rotation.x = -Math.PI / 2; pav.userData.receiveOnly = true;
  const road = add(new THREE.PlaneGeometry(120, 7), B.road, 0, 0.006, FZ - 13); road.rotation.x = -Math.PI / 2; road.userData.receiveOnly = true;
  for (let x = -40; x < 40; x += 4) { const st = add(new THREE.PlaneGeometry(2, 0.18), B.stripe, x, 0.008, FZ - 13); st.rotation.x = -Math.PI / 2; st.userData.receiveOnly = true; }
  for (const x of [-9, -5, 4, 8]) { const gr = add(new THREE.PlaneGeometry(3, 2.2), B.grass, x, 0.007, FZ - 4.5); gr.rotation.x = -Math.PI / 2; gr.userData.receiveOnly = true; }
  const tree = (x, z, h = 1) => {
    add(new THREE.CylinderGeometry(0.12 * h, 0.16 * h, 1.8 * h, 12), B.trunk, x, 0.9 * h, z);
    add(new THREE.IcosahedronGeometry(1.1 * h, 1), M.leaf, x, 2.4 * h, z);
    add(new THREE.IcosahedronGeometry(0.8 * h, 1), M.leaf, x + 0.5 * h, 2.0 * h, z + 0.3 * h);
  };
  for (const x of [-9, -5, 4, 8]) tree(x, FZ - 4.5);
  for (let x = -30; x <= 30; x += 7) tree(x + 2, FZ - 19, 1.2);
  // canopy over the entrance (outside)
  add(new THREE.BoxGeometry(5.4, 0.18, 2.6), B.frame, -0.45, 3.6, FZ - 1.3);
  for (const x of [-2.9, 2.0]) add(new THREE.CylinderGeometry(0.07, 0.07, 3.6, 12), B.frame, x, 1.8, FZ - 2.5);
  for (const [x, z, w, h, d] of [[-24, -48, 10, 22, 10], [-8, -55, 12, 30, 10], [10, -50, 9, 18, 9], [26, -46, 11, 26, 10]]) {
    add(new THREE.BoxGeometry(w, h, d), B.tower, x, h / 2, z);
    for (let y = 2; y < h - 1; y += 2.4) add(new THREE.BoxGeometry(w + 0.05, 1.1, d + 0.05), B.towerGlass, x, y, z);
  }

  // ---- glass entrance facade with three automatic sliding doors (held open: power is out)
  const DX = -0.45, DW = 2.4;
  const curtainSeg = (x0, x1) => {
    const w = x1 - x0, cx = (x0 + x1) / 2;
    noShadow(add(new THREE.BoxGeometry(w, WALL_H, 0.04), B.curtain, cx, WALL_H / 2, FZ));
    for (let x = x0; x <= x1 + 1e-6; x += w / Math.max(1, Math.round(w / 2))) add(new THREE.BoxGeometry(0.08, WALL_H, 0.12), B.frame, x, WALL_H / 2, FZ);
  };
  { let prev = -SIDE; for (const x of DOOR_XS) { curtainSeg(prev, x - DW / 2); prev = x + DW / 2; } curtainSeg(prev, SIDE); }
  for (const y of [0.05, 3.2, WALL_H - 0.05]) add(new THREE.BoxGeometry(SIDE * 2, 0.1, 0.14), B.frame, 0, y, FZ);
  for (const ox of DOOR_XS) {
    noShadow(add(new THREE.BoxGeometry(DW, WALL_H - 3.2, 0.04), B.curtain, ox, (WALL_H + 3.2) / 2, FZ));
    for (const sd of [-1, 1]) {
      const d = new THREE.Group();
      d.position.set(ox + sd * DW / 4, 0, FZ + 0.12);
      const panel = mesh(new THREE.BoxGeometry(DW / 2, 3.1, 0.03), B.curtain, 0, 1.6, 0, d); panel.userData.noShadow = true;
      mesh(new THREE.BoxGeometry(DW / 2, 0.06, 0.06), B.frame, 0, 0.05, 0, d);
      mesh(new THREE.BoxGeometry(0.05, 3.1, 0.06), B.frame, -sd * DW / 4, 1.6, 0, d);
      mesh(new THREE.BoxGeometry(0.04, 0.6, 0.06), M.steel, -sd * (DW / 4 - 0.12), 1.1, 0.04, d);
      scene.add(d);
      entranceDoors.push({ obj: d, closedX: d.position.x, dir: sd });
    }
    add(new THREE.BoxGeometry(DW + 0.4, 0.3, 0.3), B.frame, ox, 3.3, FZ + 0.1); // door operator housing
    const matIn = add(new THREE.PlaneGeometry(3.0, 1.8), mat('#4a4f56', { roughness: 1 }), ox, 0.006, FZ + 1.1); matIn.rotation.x = -Math.PI / 2; matIn.userData.receiveOnly = true;
  }
  add(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshStandardMaterial({ map: logoTex, roughness: 0.4 }), DX, 4.55, FZ + 0.1); // AYVETO sign

  // ---- side walls (warm white with a wooden accent band)
  for (const sd of [-1, 1]) {
    const x = sd * SIDE, len = BACK - FZ, cz = (BACK + FZ) / 2;
    add(new THREE.BoxGeometry(0.3, WALL_H, len), B.wallWarm, x, WALL_H / 2, cz);
    add(new THREE.BoxGeometry(0.06, 1.2, len), B.wood, x - sd * 0.17, 1.6, cz);
    add(new THREE.BoxGeometry(0.08, 0.12, len), B.woodDark, x - sd * 0.18, 0.06, cz);
  }
  // framed artwork on the left wall, digital welcome screen on the right wall
  const artTex = canvasTex(256, 192, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#2b6c9e'); gr.addColorStop(1, '#9fd0e8');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.arc(w * 0.7, h * 0.35, 30, 0, 7); g.fill();
    g.fillStyle = '#1f4f73'; g.beginPath(); g.moveTo(0, h); g.lineTo(w * 0.35, h * 0.45); g.lineTo(w * 0.65, h); g.fill();
  });
  for (const z of [-9, -3, 8, 16]) {
    const g = new THREE.Group(); g.position.set(-SIDE + 0.2, 4.05, z);
    const tip = new THREE.Group(); tip.position.y = -1.5; g.add(tip);
    mesh(new THREE.BoxGeometry(0.06, 1.5, 2.1), B.frame, 0, 0.75, 0, tip);
    const a = mesh(new THREE.PlaneGeometry(1.95, 1.35), new THREE.MeshStandardMaterial({ map: artTex, roughness: 0.5 }), 0.035, 0.75, 0, tip); a.rotation.y = Math.PI / 2;
    scene.add(g); paintings.push(g);
  }
  add(new THREE.BoxGeometry(0.1, 2.0, 3.6), mat('#111820', { roughness: 0.3 }), SIDE - 0.2, 3.2, -6);

  // ---- waiting lounge in the lobby (right side, before the security area)
  const sofa = (x, z, ry) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
    mesh(new THREE.BoxGeometry(2.2, 0.42, 0.85), B.sofa, 0, 0.21, 0, g);
    mesh(new THREE.BoxGeometry(2.2, 0.5, 0.2), B.sofa, 0, 0.62, -0.33, g);
    for (const sx of [-1, 1]) mesh(new THREE.BoxGeometry(0.18, 0.62, 0.85), B.sofa, sx * 1.01, 0.31, 0, g);
    scene.add(g);
  };
  for (const [x, z, ry] of SOFAS) sofa(x, z, ry);
  add(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 32), B.wood, 5.6, 0.45, -9.3);
  add(new THREE.CylinderGeometry(0.06, 0.06, 0.42, 12), B.frame, 5.6, 0.21, -9.3);
  const rug = add(new THREE.PlaneGeometry(4.2, 3.4), mat('#c9b79c', { roughness: 1 }), 6.2, 0.006, -9.8); rug.rotation.x = -Math.PI / 2; rug.userData.receiveOnly = true;

  // ---- office interior beyond the gate
  add(new THREE.BoxGeometry(SIDE * 2, WALL_H, 0.3), B.wallWarm, 0, WALL_H / 2, BACK);
  // wooden feature wall with the AYVETO logo
  add(new THREE.BoxGeometry(7.2, 4.2, 0.12), B.wood, 0, 2.6, BACK - 0.2);
  for (let x = -3.4; x <= 3.4; x += 0.4) add(new THREE.BoxGeometry(0.04, 4.2, 0.03), B.woodDark, x, 2.6, BACK - 0.27);
  const logo = mesh(new THREE.PlaneGeometry(5.2, 1.3), new THREE.MeshStandardMaterial({ map: logoTex, roughness: 0.5 }), 0, 3.2, BACK - 0.3);
  logo.rotation.y = Math.PI;
  scene.add(logo);
  // elevators either side of the feature wall
  for (const x of [-6.2, -4.6, 4.6, 6.2]) {
    add(new THREE.BoxGeometry(1.4, 2.5, 0.08), B.frame, x, 1.25, BACK - 0.2);
    add(new THREE.BoxGeometry(1.2, 2.35, 0.06), M.steel, x, 1.18, BACK - 0.24);
    add(new THREE.BoxGeometry(0.02, 2.35, 0.08), B.frame, x, 1.18, BACK - 0.25);
    add(new THREE.BoxGeometry(0.4, 0.12, 0.04), new THREE.MeshStandardMaterial({ color: '#111', emissive: '#ffb347', emissiveIntensity: 1.2 }), x, 2.75, BACK - 0.24);
  }
  // pillars
  for (const [x, z] of [[-6.5, 7], [6.5, 7], [-6.5, 15], [6.5, 15]]) {
    add(new THREE.CylinderGeometry(0.38, 0.38, WALL_H, 32), B.wallWarm, x, WALL_H / 2, z);
    add(new THREE.CylinderGeometry(0.4, 0.4, 0.15, 32), B.woodDark, x, 0.075, z);
  }
  // reception desk with monitors
  const desk = new THREE.Group(); desk.position.set(RECEPTION.x, 0, RECEPTION.z); desk.rotation.y = RECEPTION.ry;
  addEdges(mesh(new THREE.BoxGeometry(3.2, 1.1, 0.8), B.wallWarm, 0, 0.55, 0, desk));
  mesh(new THREE.BoxGeometry(3.22, 0.14, 0.82), M.navy, 0, 0.75, 0, desk);
  mesh(new THREE.BoxGeometry(3.4, 0.06, 1.0), B.wood, 0, 1.13, 0, desk);
  [-0.7, 0.7].forEach((mx, i) => {
    const pv = new THREE.Group(); pv.position.set(mx, 1.16, 0.27); desk.add(pv);
    mesh(new THREE.BoxGeometry(0.55, 0.34, 0.03), mat('#151b22', { roughness: 0.3 }), 0, 0.26, -0.02, pv).rotation.y = Math.PI;
    mesh(new THREE.BoxGeometry(0.05, 0.2, 0.05), B.frame, 0, 0.08, 0, pv);
    mesh(new THREE.BoxGeometry(0.2, 0.012, 0.14), B.frame, 0, 0.006, 0, pv);
    recMonitors.push({ obj: pv, t: MONITOR_FALLS[i], dir: i ? 1 : -1, screen: null });
  });
  const recTex = canvasTex(512, 96, (g, w, h) => {
    g.fillStyle = '#0f3b5f'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.font = 'bold 54px "Noto Sans", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('RECEPTION', w / 2, h / 2 + 3);
  });
  const recSign = mesh(new THREE.PlaneGeometry(1.7, 0.32), new THREE.MeshStandardMaterial({ map: recTex, roughness: 0.5 }), 0, 0.42, -0.405, desk);
  recSign.rotation.y = Math.PI;
  scene.add(desk);
  // lounge chairs and coffee table in the office area (left)
  for (const [x, z, ry] of LOUNGE_CHAIRS) {
    const c = new THREE.Group(); c.position.set(x, 0, z); c.rotation.y = ry;
    mesh(new THREE.BoxGeometry(0.85, 0.42, 0.85), mat('#d58b3c', { roughness: 0.8 }), 0, 0.21, 0, c);
    mesh(new THREE.BoxGeometry(0.85, 0.5, 0.16), mat('#d58b3c', { roughness: 0.8 }), 0, 0.62, -0.35, c);
    scene.add(c);
  }
  add(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 32), B.wood, -3.2, 0.42, 9.8);
  add(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 12), B.frame, -3.2, 0.2, 9.8);
  // walkway runner leading into the company
  const runner = mesh(new THREE.PlaneGeometry(1.6, 21), mat('#2c4a66', { roughness: 1 }), 0, 0.005, 12.3);
  runner.rotation.x = -Math.PI / 2; runner.userData.receiveOnly = true; scene.add(runner);
  // plants
  for (const [x, z] of PLANTS) {
    const p = new THREE.Group(); p.position.set(x, 0, z);
    addEdges(mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.55, 28), M.plantPot, 0, 0.275, 0, p), 35);
    for (const [lx, ly, lz, r] of [[0, 0.95, 0, 0.38], [0.18, 0.78, 0.12, 0.26], [-0.16, 0.8, -0.1, 0.27], [0.05, 1.25, -0.05, 0.24]])
      mesh(new THREE.IcosahedronGeometry(r, 1), M.leaf, lx, ly, lz, p);
    scene.add(p); plantGroups.push(p);
  }
}

// ---------------------------------------------------------------- characters
function limb(rTop, rBot, len, material, parent, x = 0, y = 0, z = 0) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  const g = new THREE.CylinderGeometry(rTop, rBot, len, 20);
  g.translate(0, -len / 2, 0);
  mesh(g, material, 0, 0, 0, pivot);
  parent.add(pivot);
  return pivot;
}

// Shared human figure (~1.78 m tall, realistic proportions) used for the visitor and the guard.
const HIP_H = 0.93;
const TORSO_PROF = [[0.001, 0.0], [0.15, 0.0], [0.152, 0.08], [0.143, 0.18], [0.15, 0.28], [0.168, 0.38], [0.176, 0.45], [0.168, 0.5], [0.13, 0.54], [0.06, 0.565], [0.001, 0.57]];
const TORSO_SX = 1.13, TORSO_SZ = 0.66, TORSO_Y = 0.02;
function torsoR(y) { // lathe radius at height y (upper-body local)
  const yy = y - TORSO_Y;
  for (let i = 1; i < TORSO_PROF.length; i++) {
    const [r0, y0] = TORSO_PROF[i - 1], [r1, y1] = TORSO_PROF[i];
    if (yy <= y1) return lerp(r0, r1, clamp((yy - y0) / Math.max(1e-6, y1 - y0)));
  }
  return 0;
}
const torsoZ = (x, y) => { const r = torsoR(y); return TORSO_SZ * Math.sqrt(Math.max(0, r * r - (x / TORSO_SX) ** 2)); };

// head shape: a sphere remapped so the jaw narrows, the back of the skull is fuller
const HEAD = { HH: 0.126, HW: 0.085, HDF: 0.103, HDB: 0.112 };
const headWX = v => HEAD.HW * (v < 0 ? 1 - 0.3 * Math.pow(-v, 1.6) : 1 - 0.1 * v * v);
const headDF = v => HEAD.HDF * (v < 0 ? 1 - 0.18 * Math.pow(-v, 1.6) : 1 - 0.05 * v);
const headDB = v => HEAD.HDB * (v < 0 ? 1 - 0.35 * Math.pow(-v, 1.3) : 1);
function headGeo(geo, k = 1, off = 0) { // maps a unit-sphere geometry onto the (inflated) head surface
  const pa = geo.attributes.position, na = geo.attributes.normal;
  for (let i = 0; i < pa.count; i++) {
    const X = pa.getX(i), Y = pa.getY(i), Z = pa.getZ(i);
    const wx = headWX(Y) * k + off, hy = HEAD.HH * k + off, dz = (Z >= 0 ? headDF(Y) : headDB(Y)) * k + off;
    pa.setXYZ(i, X * wx, Y * hy, Z * dz);
    const n = new THREE.Vector3(X / wx, Y / hy, Z / dz).normalize();
    na.setXYZ(i, n.x, n.y, n.z);
  }
  pa.needsUpdate = true; na.needsUpdate = true;
  return geo;
}
const headPoint = (X, Y, Z, k = 1, off = 0) => new THREE.Vector3(X * (headWX(Y) * k + off), Y * (HEAD.HH * k + off), Z * ((Z >= 0 ? headDF(Y) : headDB(Y)) * k + off));
const faceZ = (x, y) => { const v = y / HEAD.HH, u = x / headWX(v); return headDF(v) * Math.sqrt(Math.max(0, 1 - u * u - v * v)); };

function buildHuman(o) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const legs = {}, arms = {};
  for (const s of [1, -1]) { // +1 = left (local +X), -1 = right
    const hip = limb(0.08, 0.06, 0.45, o.pants, body, s * 0.092, HIP_H, 0);
    mesh(new THREE.SphereGeometry(0.08, 18, 12), o.pants, 0, 0, 0, hip);
    const knee = limb(0.058, 0.044, 0.42, o.pants, hip, 0, -0.45, 0);
    mesh(new THREE.SphereGeometry(0.06, 16, 12), o.pants, 0, 0, 0, knee);
    const shoe = mesh(new THREE.SphereGeometry(1, 20, 14), o.shoe, 0, -0.448, 0.045, knee);
    shoe.scale.set(0.056, 0.043, 0.13);
    const sole = mesh(new THREE.BoxGeometry(0.1, 0.018, 0.25), M.black, 0, -0.478, 0.045, knee);
    void sole;
    legs[s] = { hip, knee };
  }
  const pelvis = mesh(new THREE.SphereGeometry(1, 28, 18), o.pants, 0, HIP_H + 0.03, 0, body);
  pelvis.scale.set(0.178, 0.115, 0.115);

  const upper = new THREE.Group(); upper.position.y = HIP_H; body.add(upper); // leans forward from the hips
  const torso = mesh(new THREE.LatheGeometry(TORSO_PROF.map(([r, y]) => new THREE.Vector2(r, y)), 36), o.shirt, 0, TORSO_Y, 0, upper);
  torso.scale.set(TORSO_SX, 1, TORSO_SZ);
  if (o.collar) { // shirt collar ring
    const c = mesh(new THREE.TorusGeometry(0.058, 0.016, 10, 28), o.collar, 0, 0.565, 0.005, upper);
    c.rotation.x = Math.PI / 2 - 0.25;
  }

  for (const s of [1, -1]) {
    const shoulder = new THREE.Group(); shoulder.position.set(s * 0.188, 0.49, 0); upper.add(shoulder);
    const splay = new THREE.Group(); splay.rotation.z = s * 0.12; shoulder.add(splay); // arms hang clear of the hips
    mesh(new THREE.SphereGeometry(0.06, 18, 12), o.shirt, 0, 0, 0, splay);
    if (o.shortSleeve) {
      limb(0.046, 0.04, 0.3, o.skin, splay);
      limb(0.061, 0.056, 0.15, o.shirt, splay);
    } else limb(0.052, 0.045, 0.3, o.shirt, splay);
    const elbow = limb(o.shortSleeve ? 0.04 : 0.045, o.shortSleeve ? 0.032 : 0.038, 0.25, o.shortSleeve ? o.skin : o.shirt, splay, 0, -0.29, 0);
    mesh(new THREE.SphereGeometry(o.shortSleeve ? 0.041 : 0.046, 14, 10), o.shortSleeve ? o.skin : o.shirt, 0, 0, 0, elbow);
    if (!o.shortSleeve) mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 14), o.skin, 0, -0.255, 0, elbow); // wrist
    const hand = mesh(new THREE.SphereGeometry(1, 16, 12), o.skin, 0, -0.3, 0.004, elbow);
    hand.scale.set(0.024, 0.068, 0.044);
    const thumb = mesh(new THREE.SphereGeometry(1, 12, 8), o.skin, -s * 0.004, -0.285, 0.042, elbow);
    thumb.scale.set(0.012, 0.03, 0.012); thumb.rotation.x = 0.4;
    const tip = new THREE.Object3D(); tip.position.set(0, -0.33, 0); elbow.add(tip);
    arms[s] = { shoulder, elbow, tip };
  }

  // neck + head
  mesh(new THREE.CylinderGeometry(0.054, 0.06, 0.12, 18), o.skin, 0, 0.59, 0.004, upper);
  const headPivot = new THREE.Group(); headPivot.position.set(0, 0.6, 0.012); upper.add(headPivot);
  const head = new THREE.Group(); head.position.set(0, 0.122, 0.004); headPivot.add(head);
  mesh(headGeo(new THREE.SphereGeometry(1, 56, 40)), o.skin, 0, 0, 0, head);
  buildFace(head, o);
  return { root, body, upper, headPivot, head, legs, arms };
}

function buildFace(head, o) {
  const white = mat('#f4f1ec', { roughness: 0.3 });
  const iris = mat(o.iris || '#3a2416', { roughness: 0.25 });
  const pupil = mat('#0b0806', { roughness: 0.2 });
  const shine = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const lipM = mat(o.lip, { roughness: 0.45 });
  const lipLine = mat(o.lipLine, { roughness: 0.5 });
  const browM = mat(o.brow, { roughness: 0.7 });
  const eyeY = 0.006;
  for (const sd of [1, -1]) {
    const ex = sd * 0.031, ez = faceZ(ex, eyeY);
    const yaw = sd * 0.32; // eyes follow the curve of the face
    const eg = new THREE.Group(); eg.position.set(ex, eyeY, ez - 0.005); eg.rotation.y = yaw; head.add(eg);
    mesh(new THREE.SphereGeometry(0.0132, 22, 16), white, 0, 0, 0, eg).scale.set(1.25, 0.86, 0.78);
    mesh(new THREE.SphereGeometry(0.0076, 18, 12), iris, -sd * 0.0012, -0.0005, 0.0068, eg).scale.set(1, 1, 0.55);
    mesh(new THREE.SphereGeometry(0.0039, 12, 10), pupil, -sd * 0.0012, -0.0005, 0.009, eg).scale.set(1, 1, 0.55);
    mesh(new THREE.SphereGeometry(0.0016, 8, 6), shine, -sd * 0.0012 + 0.0027, 0.0027, 0.0108, eg);
    // upper eyelid (skin) with a dark lash line, sits over the top of the iris
    const lid = mesh(new THREE.SphereGeometry(0.0143, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), o.skinShade, 0, 0.001, -0.0005, eg);
    lid.scale.set(1.3, 0.92, 0.84); lid.rotation.x = -0.95;
    // eyebrow: two segments forming a soft arch
    for (const [bx, by, len, rz] of [[0.016, 0.0255, 0.02, 0.1], [0.036, 0.024, 0.02, -0.22]]) {
      const x = sd * bx, y = eyeY + by;
      const br = mesh(new THREE.BoxGeometry(len, 0.0052, 0.006), browM, x, y, faceZ(x, y) + 0.0006, head);
      br.rotation.set(-0.3, sd * (0.15 + 7 * bx), sd * rz);
    }
    // ear
    const ear = mesh(new THREE.SphereGeometry(1, 16, 12), o.skin, sd * (headWX(-0.05) + 0.004), -0.006, -0.012, head);
    ear.scale.set(0.011, 0.027, 0.018); ear.rotation.y = sd * 0.35;
    const earIn = mesh(new THREE.SphereGeometry(1, 12, 8), o.skinShade, sd * (headWX(-0.05) + 0.009), -0.006, -0.009, head);
    earIn.scale.set(0.005, 0.018, 0.011); earIn.rotation.y = sd * 0.35;
  }
  // nose: bridge, rounded tip and nostril wings
  const nb = mesh(new THREE.SphereGeometry(1, 16, 12), o.skin, 0, -0.016, faceZ(0, -0.016) + 0.002, head);
  nb.scale.set(0.009, 0.024, 0.011); nb.rotation.x = -0.3;
  mesh(new THREE.SphereGeometry(0.0115, 18, 14), o.skin, 0, -0.035, faceZ(0, -0.035) + 0.0085, head);
  for (const sd of [1, -1]) {
    const x = sd * 0.0118;
    mesh(new THREE.SphereGeometry(0.0066, 14, 10), o.skin, x, -0.0395, faceZ(x, -0.0395) + 0.0012, head);
    mesh(new THREE.SphereGeometry(0.003, 8, 6), o.lipLine, sd * 0.0062, -0.043, faceZ(sd * 0.0062, -0.043) + 0.0072, head);
  }
  // mouth: closed-lip smile built from tubes that follow the face surface (corners raised)
  const my = -0.064, MW = 0.025;
  const K = o.smile ?? 1; // 1 = smile, ~0 = neutral / serious expression
  const smileY = (x, lift) => my + lift * K * Math.abs(x / MW) ** 2.2;
  const tube = (w, lift, dy, dz, r, m) => {
    const pts = [];
    for (let i = 0; i <= 16; i++) { const x = -w + 2 * w * i / 16, y = smileY(x, lift) + dy * (1 - (x / w) ** 2); pts.push(new THREE.Vector3(x, y, faceZ(x, y) + dz)); }
    return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, r, 8, false), m, 0, 0, 0, head);
  };
  tube(MW, 0.0095, 0, 0.0005, 0.0016, lipLine);              // lip parting line
  tube(MW * 0.92, 0.0085, 0.0034, -0.0006, 0.0032, lipM);    // upper lip
  tube(MW * 0.78, 0.006, -0.0052, -0.0008, 0.0045, lipM);    // lower lip
  for (const sd of [1, -1]) {                                // smile corners
    const x = sd * MW, y = smileY(x, 0.0095);
    mesh(new THREE.SphereGeometry(0.0022, 8, 6), lipLine, x, y, faceZ(x, y) + 0.0002, head);
  }
  // chin
  const chin = mesh(new THREE.SphereGeometry(1, 16, 12), o.skin, 0, -0.094, faceZ(0, -0.094) - 0.012, head);
  chin.scale.set(0.024, 0.016, 0.014);
}

// short hair cap following the head; optional curls
function buildHair(head, o) {
  const hm = o.hair;
  const capG = new THREE.SphereGeometry(1, 48, 28, 0, Math.PI * 2, 0, o.cap);
  capG.rotateX(o.tilt);
  mesh(headGeo(capG, 1.0, o.thick), hm, 0, 0, 0, head);
  if (o.curls) {
    const axis = new THREE.Vector3(0, Math.cos(o.tilt), Math.sin(o.tilt));
    const curl = new THREE.SphereGeometry(o.curlR, 10, 8), v = new THREE.Vector3();
    const N = o.curls;
    for (let i = 0; i < N; i++) {
      const yy = 1 - 2 * (i + 0.5) / N, rr = Math.sqrt(1 - yy * yy), ph = i * 2.39996;
      v.set(Math.cos(ph) * rr, yy, Math.sin(ph) * rr);
      if (v.dot(axis) < Math.cos(o.cap - 0.06)) continue;
      const pt = headPoint(v.x, v.y, v.z, 1.0, o.thick);
      mesh(curl, hm, pt.x, pt.y, pt.z, head);
    }
  }
}

// other hair styles for the background people
function styleHair(h, kind, m) {
  if (kind === 'short') buildHair(h.head, { hair: m, cap: 1.4, tilt: -0.3, thick: 0.004 });
  else if (kind === 'curly') buildHair(h.head, { hair: m, cap: 1.3, tilt: -0.4, thick: 0.004, curls: 380, curlR: 0.0095 });
  else if (kind === 'bob') {
    buildHair(h.head, { hair: m, cap: 1.5, tilt: -0.35, thick: 0.007 });
    mesh(new THREE.SphereGeometry(1, 32, 24), m, 0, -0.012, -0.035, h.head).scale.set(0.099, 0.108, 0.104);
  } else if (kind === 'bun') {
    buildHair(h.head, { hair: m, cap: 1.45, tilt: -0.3, thick: 0.005 });
    mesh(new THREE.SphereGeometry(0.043, 20, 14), m, 0, 0.075, -0.108, h.head);
  } else if (kind === 'hijab') {
    const g = new THREE.SphereGeometry(1, 48, 32, 0, Math.PI * 2, 0, 2.2); g.rotateX(-1.2);
    const hm = m.clone(); hm.side = THREE.DoubleSide;
    mesh(headGeo(g, 1.0, 0.01), hm, 0, 0, 0, h.head);
    mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.16, 24), hm, 0, 0.6, 0.0, h.upper);
    // shawl: follows the torso surface from the neck down over the shoulders and upper chest
    const prof = [];
    for (let y = 0.34; y <= 0.575; y += 0.015) prof.push(new THREE.Vector2(torsoR(y) + 0.012, y - TORSO_Y));
    prof.push(new THREE.Vector2(0.068, 0.6 - TORSO_Y));
    const shawl = mesh(new THREE.LatheGeometry(prof, 36), hm, 0, TORSO_Y, 0, h.upper);
    shawl.scale.set(TORSO_SX, 1, TORSO_SZ * 1.1);
  }
}

// The visitor: natural face, short curly hair, yellow polo shirt, green trousers.
function buildUser() {
  const skin = mat('#8d5a3a', { roughness: 0.6 });
  const h = buildHuman({
    skin, skinShade: mat('#7a4c30', { roughness: 0.65 }),
    shirt: M.yellow, collar: M.yellowDark, pants: M.green, shoe: M.black, shortSleeve: true,
    lip: '#6e3a2c', lipLine: '#3d1d16', brow: '#1a110b', iris: '#3b2414', smile: 0.12,
  });
  buildHair(h.head, { hair: M.userHair, cap: 1.28, tilt: -0.42, thick: 0.005, curls: 520, curlR: 0.0105 });
  // the visitor's own ID card, held in the right hand for the whole animation
  const cardTex = canvasTex(320, 208, (g, w, hh) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, hh);
    g.fillStyle = '#0f3b5f'; g.fillRect(0, 0, w, 54);
    g.fillStyle = '#fff'; g.font = 'bold 36px "Noto Sans", sans-serif'; g.fillText('AYVETO', 18, 40);
    g.fillStyle = '#8a5a2e'; g.fillRect(20, 72, 82, 108);
    g.fillStyle = '#9fb3c6'; for (let i = 0; i < 4; i++) g.fillRect(122, 82 + i * 26, 170 - i * 24, 12);
    g.strokeStyle = '#2f8fd8'; g.lineWidth = 5;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(262, 160, 10 + i * 11, -0.9, 0.9); g.stroke(); }
  });
  const cardMat = new THREE.MeshStandardMaterial({ map: cardTex, roughness: 0.35, emissive: '#3aa0ff', emissiveIntensity: 0 });
  const edgeCard = new THREE.MeshStandardMaterial({ color: '#dfe6ec', emissive: '#3aa0ff', emissiveIntensity: 0 });
  const card = new THREE.Group();
  card.position.set(0, -0.315, 0.035);
  const cardMesh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.084, 0.005), [edgeCard, edgeCard, edgeCard, edgeCard, cardMat, edgeCard]);
  cardMesh.rotation.z = Math.PI / 2;
  card.add(cardMesh);
  h.arms[-1].elbow.add(card);
  return { ...h, card, cardMats: [cardMat, edgeCard] };
}

// The security guard: same proportions, navy security uniform (peaked cap, badge,
// SECURITY name tab and back patch, epaulettes, belt, radio) and a handheld detector wand.
function buildGuard() {
  const h = buildHuman({
    skin: M.skin, skinShade: mat('#d9ab84', { roughness: 0.65 }),
    shirt: M.suit, collar: M.suitShade, pants: M.pants, shoe: M.black, shortSleeve: false,
    lip: '#c08a7c', lipLine: '#7a4a40', brow: '#15171a', iris: '#2b1d14', smile: 0,
  });
  buildHair(h.head, { hair: M.hair, cap: 1.42, tilt: -0.3, thick: 0.004 });
  const up = h.upper;
  const front = (x, y, d = 0.002) => torsoZ(x, y) + d;
  const yawAt = x => Math.asin(clamp(x / 0.2, -1, 1)) * 0.8;
  const onChest = (geo, m, x, y, d) => { const o = mesh(geo, m, x, y, front(x, y, d), up); o.rotation.y = yawAt(x); return o; };
  const secTex = (w, hh, size) => canvasTex(w, hh, (g, W, H) => {
    g.fillStyle = '#0d1626'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#d8aa3a'; g.lineWidth = Math.max(3, H * 0.06); g.strokeRect(2, 2, W - 4, H - 4);
    g.fillStyle = '#ffffff'; g.font = `bold ${size}px "Noto Sans", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SECURITY', W / 2, H / 2 + 2);
  });
  onChest(new THREE.BoxGeometry(0.012, 0.42, 0.005), M.suitShade, 0, 0.3, 0.0015);           // placket
  for (const s of [1, -1]) {
    onChest(new THREE.BoxGeometry(0.07, 0.075, 0.005), M.suitShade, s * 0.078, 0.37, 0.002); // pocket
    onChest(new THREE.BoxGeometry(0.074, 0.022, 0.008), M.suitShade, s * 0.078, 0.415, 0.004); // pocket flap
    const ep = mesh(new THREE.BoxGeometry(0.11, 0.012, 0.06), M.suitShade, s * 0.13, 0.535, 0, up); // epaulette
    ep.rotation.z = s * -0.32;
    const st = mesh(new THREE.BoxGeometry(0.012, 0.014, 0.062), M.gold, s * 0.17, 0.523, 0, up);
    st.rotation.z = s * -0.32;
  }
  const tie = onChest(new THREE.BoxGeometry(0.026, 0.16, 0.004), M.black, 0, 0.47, 0.005);
  void tie;
  onChest(new THREE.BoxGeometry(0.04, 0.048, 0.006), M.gold, 0.078, 0.46, 0.004);               // badge (left chest)
  onChest(new THREE.PlaneGeometry(0.085, 0.022), new THREE.MeshStandardMaterial({ map: secTex(256, 64, 40), roughness: 0.6 }), -0.078, 0.452, 0.004); // name tab
  const back = mesh(new THREE.PlaneGeometry(0.22, 0.055), new THREE.MeshStandardMaterial({ map: secTex(512, 128, 88), roughness: 0.6 }), 0, 0.4, -torsoZ(0, 0.4) - 0.003, up);
  back.rotation.y = Math.PI;
  // belt with buckle
  const belt = mesh(new THREE.CylinderGeometry(1, 1, 0.042, 36, 1, true), M.black, 0, 0.03, 0, up);
  belt.scale.set(0.152 * TORSO_SX + 0.006, 1, 0.152 * TORSO_SZ + 0.006);
  belt.material = M.black;
  mesh(new THREE.BoxGeometry(0.045, 0.032, 0.008), M.gold, 0, 0.03, 0.152 * TORSO_SZ + 0.01, up);
  // radio clipped to the left shoulder strap
  onChest(new THREE.BoxGeometry(0.036, 0.06, 0.022), M.black, 0.11, 0.5, 0.012);
  mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.05, 6), M.black, 0.115, 0.55, front(0.11, 0.5, 0.012), up);
  // shoulder patches
  for (const s of [1, -1]) {
    const pt = mesh(new THREE.CircleGeometry(0.026, 20), M.gold, s * 0.054, -0.09, 0, h.arms[s].shoulder.children[0]);
    pt.rotation.y = s * Math.PI / 2;
  }
  // peaked security cap
  const capG = new THREE.Group(); capG.position.set(0, 0.06, 0.004); capG.rotation.x = -0.1; h.head.add(capG);
  const crown = mesh(new THREE.CylinderGeometry(0.112, 0.093, 0.06, 32), M.suit, 0, 0.042, 0, capG); crown.scale.set(0.9, 1, 1.02);
  const top = mesh(new THREE.CylinderGeometry(0.112, 0.112, 0.008, 32), M.suit, 0, 0.074, 0, capG); top.scale.set(0.9, 1, 1.02);
  const band = mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.024, 32), M.black, 0, 0.012, 0, capG); band.scale.set(0.9, 1, 1.13);
  const visor = mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.006, 24, 1, false, -Math.PI / 2, Math.PI), M.black, 0, 0.0, 0.07, capG);
  visor.scale.set(0.95, 1, 0.65); visor.rotation.x = 0.28;
  mesh(new THREE.BoxGeometry(0.026, 0.028, 0.006), M.gold, 0, 0.045, 0.104, capG).rotation.x = -0.18;
  // detector wand in the right hand
  const wand = new THREE.Group(); wand.position.set(0, -0.3, 0.0); h.arms[-1].elbow.add(wand);
  mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 14).translate(0, -0.05, 0), M.black, 0, 0, 0, wand);
  const paddle = mesh(new THREE.BoxGeometry(0.06, 0.24, 0.025), M.poleGray, 0, -0.25, 0, wand);
  addEdges(paddle);
  const wandLedMat = new THREE.MeshStandardMaterial({ color: '#111', emissive: '#3aa0ff', emissiveIntensity: 0 });
  mesh(new THREE.SphereGeometry(0.014, 10, 8), wandLedMat, 0, -0.1, 0.017, wand);
  return { ...h, wand, wandLedMat };
}

const user = buildUser();
const guard = buildGuard();
scene.add(user.root, guard.root);
user.card.visible = false; // no access card needed: the gates are released

// entrance sliding doors are held open by the fire alarm
for (const d of entranceDoors) d.obj.position.x = d.closedX + d.dir * 1.15;

// ---------------------------------------------------------------- crowd simulation
const crowd = runCrowd();
const crowdTiles = crowd.tiles;

// ---------------------------------------------------------------- earthquake: set dressing + effects
// Ceiling with light panels, pendant lamps and hanging EXIT signs that swing, office desks with
// monitors and rolling chairs, falling ceiling tiles with dust, toppling plants and paintings,
// cracks in the walls and the glass facade, a shattering facade panel in the aftershock.
const seeded = s => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
const QF = { swingers: [], tiles: [], dust: [], chunks: [], cracks: [], plantsFx: [], paintFx: [], monitors: [], chairs: [], shards: [] };
{
  const rnd = seeded(4242);
  const softTex = canvasTex(128, 128, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  QF.softTex = softTex;
  const dustSprite = (color = '#d8d0c2') => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color, transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false; scene.add(s); return s;
  };

  // ---- pendulum tables (angle vs time) driven by the building's sway
  const pend = (L, axis, damp = 0.35) => {
    const H = 1 / 240, N = Math.ceil(25.5 / H), out = new Float32Array(Math.ceil(25.5 * 120) + 4);
    let th = 0, w = 0;
    for (let i = 0; i <= N; i++) {
      const t = i * H;
      if (i % 2 === 0) out[i / 2] = th;
      const a = swayAcc(t)[axis];
      w += (-(9.81 / L) * Math.sin(th) - damp * w - a * Math.cos(th) / L) * H;
      th += w * H;
    }
    return t => { const f = clamp(t, 0, 25.4) * 120, k = Math.floor(f); return lerp(out[k], out[k + 1], f - k); };
  };
  QF.pend = pend;

  // ---- ceiling (one-sided, faces down: seen from inside, invisible from cameras above it)
  const CZ0 = -14, CZ1 = 23, CY = 6.0;
  const ceilTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#ecebe6'; g.fillRect(0, 0, w, h);
    const r2 = seeded(77);
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(150,140,125,${0.05 + r2() * 0.08})`; g.fillRect(r2() * w, r2() * h, 2, 2); }
    g.strokeStyle = '#bdb7ab'; g.lineWidth = 5;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * w / 4, 0); g.lineTo(i * w / 4, h); g.stroke(); g.beginPath(); g.moveTo(0, i * h / 4); g.lineTo(w, i * h / 4); g.stroke(); }
  });
  ceilTex.wrapS = ceilTex.wrapT = THREE.RepeatWrapping; ceilTex.repeat.set(20 / 2.4, 37 / 2.4); ceilTex.offset.set(0.125, 0.125);
  const ceil = mesh(new THREE.PlaneGeometry(20, 37), new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.9 }), 0, CY, (CZ0 + CZ1) / 2);
  ceil.rotation.x = Math.PI / 2; ceil.userData.noShadow = true; scene.add(ceil);
  QF.panelMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff6e6', emissiveIntensity: 1.0, roughness: 0.4 });
  for (let x = -7.2; x <= 7.21; x += 3.6) for (let z = -11.7; z <= 21.5; z += 3.6) {
    const p = mesh(new THREE.PlaneGeometry(1.2, 0.6), QF.panelMat, x + 0.3, CY - 0.01, z); p.rotation.x = Math.PI / 2; p.userData.noShadow = true; scene.add(p);
  }

  // ---- pendant lamps (office + lobby), away from the camera paths
  QF.lampMat = new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#ffe7b8', emissiveIntensity: 1.4 });
  const shadeMat = mat('#2b3138', { roughness: 0.4, metalness: 0.4, side: THREE.DoubleSide });
  for (const [x, z] of [[-5, 5.5], [5, 5.5], [-5, 9.5], [5, 9.5], [-5, 13.5], [5, 13.5], [-4.6, 18], [4.6, 18], [-5.2, -5.5], [-5.2, -9.5], [5.6, -3.0]]) {
    const L = 1.15 + rnd() * 0.6;
    const pv = new THREE.Group(); pv.position.set(x, CY, z);
    mesh(new THREE.CylinderGeometry(0.006, 0.006, L, 5).translate(0, -L / 2, 0), M.black, 0, 0, 0, pv);
    mesh(new THREE.CylinderGeometry(0.07, 0.3, 0.26, 24, 1, true), shadeMat, 0, -L - 0.13, 0, pv);
    const bulb = mesh(new THREE.CircleGeometry(0.27, 24), QF.lampMat, 0, -L - 0.24, 0, pv); bulb.rotation.x = Math.PI / 2;
    mesh(new THREE.CircleGeometry(0.1, 12), M.steel, 0, -0.005, 0, pv).rotation.x = Math.PI / 2;
    scene.add(pv);
    QF.swingers.push({ obj: pv, ax: pend(L + 0.2, 'x', 0.25 + rnd() * 0.2), az: pend(L + 0.2, 'z', 0.25 + rnd() * 0.2) });
  }

  // ---- EXIT signs: hanging above the gate bank (double-sided, they swing) + above each door
  const exitTex = canvasTex(512, 192, (g, w, h) => {
    g.fillStyle = '#0b8a3e'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#ffffff'; g.strokeStyle = '#ffffff'; g.lineCap = 'round'; g.lineWidth = 15;
    const px = 92, py = 96;
    g.beginPath(); g.arc(px + 12, py - 54, 14, 0, 7); g.fill();
    g.beginPath(); g.moveTo(px + 4, py - 34); g.lineTo(px - 8, py + 10); g.stroke();
    g.beginPath(); g.moveTo(px - 8, py + 10); g.lineTo(px + 22, py + 26); g.lineTo(px + 18, py + 58); g.stroke();
    g.beginPath(); g.moveTo(px - 8, py + 10); g.lineTo(px - 26, py + 40); g.lineTo(px - 52, py + 44); g.stroke();
    g.beginPath(); g.moveTo(px - 36, py - 14); g.lineTo(px - 10, py - 30); g.lineTo(px + 18, py - 8); g.lineTo(px + 40, py - 18); g.stroke();
    g.font = 'bold 86px "Noto Sans", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('EXIT', 290, h / 2 + 4);
    g.lineWidth = 14; const ax = 440, ay = h / 2;
    g.beginPath(); g.moveTo(ax, ay - 46); g.lineTo(ax, ay + 40); g.stroke(); g.beginPath(); g.moveTo(ax - 30, ay + 12); g.lineTo(ax, ay + 44); g.lineTo(ax + 30, ay + 12); g.stroke();
  });
  const exitMat = new THREE.MeshBasicMaterial({ map: exitTex });
  const signFace = (parent, w, y, z, ry) => {
    mesh(new THREE.BoxGeometry(w + 0.06, w * 0.375 + 0.06, 0.05), mat('#e8ecef'), 0, y, z, parent);
    for (const s of [1, -1]) { const p = mesh(new THREE.PlaneGeometry(w, w * 0.375), exitMat, 0, y, z + s * 0.027, parent); p.rotation.y = s > 0 ? ry : ry + Math.PI; }
  };
  for (const x of [-3.4, 0, 3.4]) {
    const pv = new THREE.Group(); pv.position.set(x, CY, 0.6);
    signFace(pv, 1.2, -3.0, 0, 0);
    for (const cx of [-0.5, 0.5]) mesh(new THREE.CylinderGeometry(0.006, 0.006, 2.78, 4).translate(0, -1.39, 0), M.steel, cx, 0, 0, pv);
    scene.add(pv);
    QF.swingers.push({ obj: pv, ax: pend(3.0, 'x', 0.3), az: pend(3.0, 'z', 0.3) });
  }
  for (const d of DOOR_XS) { const g = new THREE.Group(); g.position.set(d, 3.78, -13.84); signFace(g, 1.1, 0, 0, 0); scene.add(g); }

  // ---- office desks with monitors and rolling chairs (along the back of the office)
  const deskM = mat('#e9e4da', { roughness: 0.6 }), legM = mat('#59616b', { metalness: 0.4, roughness: 0.4 }), chairM = mat('#2b2f36', { roughness: 0.7 });
  DESKS.forEach(([x, z], i) => {
    const d = new THREE.Group(); d.position.set(x, 0, z);
    addEdges(mesh(new THREE.BoxGeometry(1.4, 0.04, 0.7), deskM, 0, 0.74, 0, d), 30, edgeMatSoft);
    for (const sx of [-0.66, 0.66]) mesh(new THREE.BoxGeometry(0.05, 0.72, 0.62), legM, sx, 0.36, 0, d);
    mesh(new THREE.BoxGeometry(1.3, 0.35, 0.02), legM, 0, 0.52, 0.3, d);
    mesh(new THREE.BoxGeometry(0.45, 0.02, 0.15), mat('#1b1e22'), 0, 0.77, -0.12, d); // keyboard
    const mp = new THREE.Group(); mp.position.set(0, 0.76, 0.16); d.add(mp);
    mesh(new THREE.BoxGeometry(0.22, 0.015, 0.16), legM, 0, 0.008, 0, mp);
    mesh(new THREE.BoxGeometry(0.04, 0.2, 0.03), legM, 0, 0.1, 0.02, mp);
    mesh(new THREE.BoxGeometry(0.6, 0.36, 0.03), mat('#151b22', { roughness: 0.3 }), 0, 0.36, 0, mp);
    const scr = mesh(new THREE.PlaneGeometry(0.56, 0.32), new THREE.MeshBasicMaterial({ color: '#6f93b8' }), 0, 0.36, -0.016, mp); scr.rotation.y = Math.PI;
    scene.add(d);
    QF.monitors.push({ obj: mp, t: MONITOR_FALLS[2 + i], dir: i % 2 ? 1 : -1, screen: scr.material });
    const c = new THREE.Group(); c.position.set(x, 0, z - 0.75);
    mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.07, 20), chairM, 0, 0.47, 0, c);
    mesh(new THREE.BoxGeometry(0.44, 0.5, 0.06), chairM, 0, 0.78, -0.22, c);
    mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.38, 8), legM, 0, 0.25, 0, c);
    for (let k = 0; k < 5; k++) { const a = k * TAU5; const l = mesh(new THREE.BoxGeometry(0.03, 0.03, 0.3), legM, Math.sin(a) * 0.15, 0.05, Math.cos(a) * 0.15, c); l.rotation.y = a; }
    scene.add(c);
    QF.chairs.push({ obj: c, x0: x, z0: z - 0.75, dir: rnd() * TAU, dist: 0.35 + rnd() * 0.5, spin: (rnd() - 0.5) * 3 });
  });
  // reception monitors
  for (const m of recMonitors) QF.monitors.push(m);

  // ---- falling ceiling tiles: hole in the ceiling, tumbling tile, chunks, dust
  const tileM = mat('#e7e4dc', { roughness: 0.9 }), holeM = new THREE.MeshBasicMaterial({ color: '#25221e' });
  for (const tl of crowdTiles) {
    const hole = mesh(new THREE.PlaneGeometry(0.6, 0.6), holeM, tl.x, CY - 0.005, tl.z); hole.rotation.x = Math.PI / 2; hole.visible = false; hole.userData.noShadow = true; scene.add(hole);
    const pv = new THREE.Group(); scene.add(pv);
    const tm = mesh(new THREE.BoxGeometry(0.6, 0.025, 0.6), tileM, -0.3, 0, 0, pv); addEdges(tm, 30, edgeMatSoft);
    // a broken corner of the tile breaks off on impact
    const chunks = [0, 1, 2].map(() => { const c = mesh(new THREE.BoxGeometry(0.1 + rnd() * 0.1, 0.025, 0.08 + rnd() * 0.1), tileM, 0, 0, 0); c.visible = false; scene.add(c); return { obj: c, a: rnd() * TAU, v: 0.8 + rnd() * 1.2, ry: rnd() * 3 }; });
    const casc = Array.from({ length: 10 }, (_, k) => ({ s: dustSprite('#d9d1c3'), k, ox: (rnd() - 0.5) * 0.4, oz: (rnd() - 0.5) * 0.4 }));
    const cloud = Array.from({ length: 8 }, (_, k) => ({ s: dustSprite('#d6cdbd'), a: k * Math.PI / 4 + rnd() * 0.5, sp: 0.8 + rnd() * 0.6 }));
    QF.tiles.push({ tl, hole, pv, chunks, casc, cloud, ax: rnd() < 0.5 ? 'x' : 'z', sg: rnd() < 0.5 ? 1 : -1, w: 2.0 + rnd() * 2.2, dx: (rnd() - 0.5) * 0.5, dz: (rnd() - 0.5) * 0.5, ry: rnd() * TAU });
  }

  // ---- cracks: jagged dark lines on walls/pillars, radial cracks in the glass
  const crackTex = (seed, glass) => canvasTex(512, 512, (g, w) => {
    const r2 = seeded(seed);
    g.clearRect(0, 0, w, w);
    g.strokeStyle = glass ? 'rgba(255,255,255,0.85)' : 'rgba(52,46,40,0.95)'; g.lineCap = 'round';
    const branch = (x, y, a, len, wd, depth) => {
      g.lineWidth = wd; g.beginPath(); g.moveTo(x, y);
      let cx = x, cy = y;
      for (let s = 0; s < len; s += 14) { a += (r2() - 0.5) * 0.7; cx += Math.cos(a) * 14; cy += Math.sin(a) * 14; g.lineTo(cx, cy); if (depth < 3 && r2() < 0.09) branch(cx, cy, a + (r2() < 0.5 ? 0.8 : -0.8), len * 0.45, wd * 0.6, depth + 1); }
      g.stroke();
    };
    if (glass) {
      for (let k = 0; k < 11; k++) branch(w / 2, w / 2, k / 11 * TAU + r2() * 0.3, 140 + r2() * 110, 2.4, 2);
      g.lineWidth = 1.6; for (const rr of [28, 60, 105]) { g.beginPath(); for (let k = 0; k <= 11; k++) { const a = k / 11 * TAU; const q = rr * (0.85 + r2() * 0.3); k ? g.lineTo(w / 2 + Math.cos(a) * q, w / 2 + Math.sin(a) * q) : g.moveTo(w / 2 + Math.cos(a) * q, w / 2 + Math.sin(a) * q); } g.stroke(); }
    } else { branch(w * 0.15, w * 0.2, 0.9, 520, 5, 0); branch(w * 0.5, w * 0.45, -0.5 + Math.PI, 220, 3.5, 1); }
  });
  const crackAt = (x, y, z, ry, size, t, seed, glass = false) => {
    const m = mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: crackTex(seed, glass), transparent: true, opacity: 0, depthWrite: false, side: glass ? THREE.DoubleSide : THREE.FrontSide }), x, y, z);
    m.rotation.y = ry; m.userData.noShadow = true; scene.add(m);
    const debris = glass ? [] : [0, 1, 2, 3, 4].map(() => { const c = mesh(new THREE.BoxGeometry(0.06 + rnd() * 0.06, 0.04, 0.05 + rnd() * 0.05), mat('#e6e1d8'), 0, 0, 0); c.visible = false; scene.add(c); return { obj: c, o: (rnd() - 0.5) * size * 0.6, d: 0.2 + rnd() * 0.5, delay: rnd() * 0.6 }; });
    const puff = glass ? [] : [0, 1, 2, 3].map(() => ({ s: dustSprite('#ddd5c7'), o: (rnd() - 0.5) * size * 0.5 }));
    QF.cracks.push({ m, t, size, x, y, z, ry, debris, puff });
  };
  const W = 9.83;
  crackAt(-4.8, 3.6, 22.83, Math.PI, 2.2, WALL_CRACKS_T[0], 11);
  crackAt(-6.5, 2.6, 7 - 0.39, Math.PI, 1.1, WALL_CRACKS_T[1], 12);
  crackAt(W, 4.0, 10, -Math.PI / 2, 2.6, WALL_CRACKS_T[2], 13);
  crackAt(-W, 4.3, 1.8, Math.PI / 2, 2.4, WALL_CRACKS_T[3], 14);
  crackAt(W, 4.5, -10.5, -Math.PI / 2, 2.2, WALL_CRACKS_T[4], 15);
  crackAt(6.5, 2.4, 15 - 0.39, Math.PI, 1.1, WALL_CRACKS_T[5], 16);
  crackAt(-3.2, 2.0, -13.97, 0, 1.6, FACADE_CRACKS_T[0], 21, true);
  crackAt(6.8, 1.8, -13.97, 0, 1.5, FACADE_CRACKS_T[1], 22, true);
  crackAt(-8.25, 4.6, -14.03, 0, 2.2, FACADE_CRACKS_T[2], 23, true);
  crackAt(7.6, 4.4, -14.03, 0, 1.8, FACADE_CRACKS_T[3], 24, true);

  // ---- glass shards falling from the facade panel in the aftershock
  const shardM = new THREE.MeshStandardMaterial({ color: '#cfeaf6', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false });
  for (let k = 0; k < 46; k++) {
    const sh = new THREE.Shape(); const s = 0.08 + rnd() * 0.2;
    sh.moveTo(0, 0); sh.lineTo(s, rnd() * s * 0.4); sh.lineTo(s * (0.2 + rnd() * 0.6), s * (0.6 + rnd() * 0.8)); sh.lineTo(0, 0);
    const m = mesh(new THREE.ShapeGeometry(sh), shardM, 0, 0, 0); m.visible = false; m.userData.noShadow = true; scene.add(m);
    QF.shards.push({ m, x: lerp(GLASS.x0, GLASS.x1, rnd()), y: lerp(GLASS.y0, GLASS.y1, rnd()), t: GLASS.t + rnd() * 0.5, vz: -(0.4 + rnd() * 1.4), vx: (rnd() - 0.5) * 0.8, wx: (rnd() - 0.5) * 14, wy: (rnd() - 0.5) * 14, rest: rnd() * TAU });
  }
  QF.glassDust = Array.from({ length: 8 }, () => ({ s: dustSprite('#f2f6f8'), o: rnd() }));

  // ---- fine dust/particles falling from the ceiling while it shakes
  const N = 500, pos = new Float32Array(N * 3);
  QF.motes = { N, seeds: Array.from({ length: N }, () => [-9.6 + rnd() * 19.2, -13.8 + rnd() * 36.5, rnd(), 0.6 + rnd() * 0.8]), geo: new THREE.BufferGeometry() };
  QF.motes.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  QF.motes.mat = new THREE.PointsMaterial({ color: '#d9d2c5', size: 0.035, transparent: true, opacity: 0, depthWrite: false });
  const pts = new THREE.Points(QF.motes.geo, QF.motes.mat); pts.frustumCulled = false; scene.add(pts);

  // ---- dark lobby screen (power off), plants and paintings set up for toppling
  const scr = mesh(new THREE.PlaneGeometry(3.4, 1.85), new THREE.MeshBasicMaterial({ color: '#0d1116' }), 9.74, 3.2, -6); scr.rotation.y = -Math.PI / 2; scene.add(scr);
  plantGroups.forEach((p, i) => {
    const f = PLANT_FALLS.find(q => q[0] === i);
    const dir = f ? f[2] : rnd() * TAU;
    const ex = Math.sin(dir) * 0.24, ez = Math.cos(dir) * 0.24;
    const pv = new THREE.Group(); pv.position.set(p.position.x + ex, 0, p.position.z + ez); scene.add(pv);
    scene.remove(p); p.position.set(-ex, 0, -ez); pv.add(p);
    QF.plantsFx.push({ pv, t: f ? f[1] : 99, dir, axis: new THREE.Vector3(Math.cos(dir), 0, -Math.sin(dir)) });
  });
  paintings.forEach((g, i) => {
    const f = PAINTING_FALLS.find(q => q[0] === i);
    QF.paintFx.push({ g, t: f ? f[1] : 99, sw: pend(0.75, 'z', 0.6), y0: g.position.y });
  });
}

function updateQuake(t) {
  const I = intensity(t), sw = sway(t);
  // swinging lamps and signs
  for (const s of QF.swingers) { s.obj.rotation.z = s.ax(t); s.obj.rotation.x = -s.az(t); }
  // lights: flicker during the main shock, power out after QUAKE.powerOut
  const flick = (k) => { const h = Math.sin(k * 127.1 + 311.7) * 43758.5453; return h - Math.floor(h); };
  const fk = flick(Math.floor(t * 15));
  const on = t < QUAKE.start ? 1 : t < QUAKE.powerOut ? (fk < 0.32 * I ? 0.08 : 0.85 + 0.15 * fk) : (t < QUAKE.powerOut + 0.35 && fk < 0.5 ? 0.6 : 0);
  QF.panelMat.emissiveIntensity = on; QF.lampMat.emissiveIntensity = 1.4 * on;
  hemi.intensity = 1.15 * (0.78 + 0.22 * on);
  for (const m of QF.monitors) if (m.screen) m.screen.color.set(on > 0.5 ? '#6f93b8' : '#0e1218');
  // haze of dust inside
  const haze = smooth(2.2, 10, t);
  scene.fog.color.copy(BG).lerp(DUST_C, haze * 0.8); scene.background = scene.fog.color;
  scene.fog.near = lerp(40, 13, haze); scene.fog.far = lerp(110, 62, haze);
  // falling ceiling tiles
  for (const T of QF.tiles) {
    const { tl } = T, tau = t - tl.t;
    T.hole.visible = tau >= 0;
    T.pv.visible = tau >= 0;
    if (tau >= 0) {
      const H = 0.25, axis = T.ax === 'x' ? 'z' : 'x';
      let ang, cx = tl.x, cy, cz = tl.z;
      const ft = Math.max(0, tau - H);
      const yFall = 5.83 - 0.5 * 9.81 * ft * ft;
      const landT = Math.sqrt(2 * (5.83 - 0.05) / 9.81);
      if (tau < H) { ang = 0.55 * (tau / H) ** 2; cy = 6.0 - 0.3 * Math.sin(ang); }
      else if (ft < landT) { ang = 0.55 + T.w * ft; cy = yFall; cx += T.dx * ft; cz += T.dz * ft; }
      else {
        const a0 = 0.55 + T.w * landT, rest = Math.round(a0 / Math.PI) * Math.PI, u = smooth(0, 0.16, ft - landT);
        ang = lerp(a0, rest, u) + 0.04 * Math.exp(-(ft - landT) * 9) * Math.sin((ft - landT) * 40); cx += T.dx * landT; cz += T.dz * landT;
        cy = 0.014 + 0.3 * Math.abs(Math.sin(ang - rest)) * (1 - u);
      }
      T.pv.rotation.set(0, 0, 0);
      T.pv.rotation.y = T.ry * smooth(0, 1.4, tau);
      if (axis === 'z') T.pv.rotation.z = T.sg * ang; else T.pv.rotation.x = T.sg * ang;
      T.pv.updateMatrix();
      const off = new THREE.Vector3(-0.3, 0, 0).applyEuler(T.pv.rotation);
      T.pv.position.set(cx - off.x, cy - off.y, cz - off.z);
      // chunks + dust after landing
      const st = tau - H - landT;
      for (const c of T.chunks) {
        c.obj.visible = st > 0;
        if (st > 0) { const d = c.v * (1 - Math.exp(-st * 3)) / 3 * 3; c.obj.position.set(cx + Math.cos(c.a) * d * 0.5, 0.015 + Math.max(0, 0.25 * Math.sin(Math.min(st * 7, Math.PI))), cz + Math.sin(c.a) * d * 0.5); c.obj.rotation.y = c.ry * Math.min(1, st * 2); }
      }
      for (const d of T.casc) {
        const age = tau - d.k * 0.22;
        d.s.visible = age > 0 && age < 2.8;
        if (d.s.visible) { d.s.position.set(tl.x + d.ox * (1 + age), 5.85 - 1.1 * age - 0.25 * age * age, tl.z + d.oz * (1 + age)); const sc = 0.35 + 0.55 * age; d.s.scale.set(sc, sc, 1); d.s.material.opacity = 0.32 * (1 - age / 2.8); }
      }
      for (const d of T.cloud) {
        d.s.visible = st > 0 && st < 3.6;
        if (d.s.visible) { const r = 0.15 + 1.25 * d.sp * (1 - Math.exp(-st * 1.7)); d.s.position.set(cx + Math.cos(d.a) * r, 0.18 + 0.45 * Math.pow(st, 0.6), cz + Math.sin(d.a) * r); const sc = 0.6 + 1.3 * Math.pow(st, 0.6); d.s.scale.set(sc, sc, 1); d.s.material.opacity = 0.5 * (1 - st / 3.6); }
      }
    }
  }
  // cracks + plaster debris
  for (const c of QF.cracks) {
    const u = smooth(c.t, c.t + 0.18, t);
    c.m.material.opacity = u * (c.debris.length ? 0.9 : 0.75);
    const sc = 0.55 + 0.45 * u; c.m.scale.set(sc, sc, 1);
    const nx = Math.sin(c.ry), nz = Math.cos(c.ry), tx = Math.cos(c.ry), tz = -Math.sin(c.ry);
    for (const d of c.debris) {
      const tau = t - c.t - d.delay * 0.4;
      d.obj.visible = tau > 0;
      if (tau > 0) { const fall = Math.min(c.y - 0.02, 0.5 * 9.81 * tau * tau); const out = Math.min(tau, 0.75) * d.d; d.obj.position.set(c.x + tx * d.o + nx * out, c.y - fall, c.z + tz * d.o + nz * out); d.obj.rotation.set(tau * 6, tau * 4, 0); if (fall >= c.y - 0.02) d.obj.rotation.set(0, d.o * 5, 0); }
    }
    for (const p of c.puff) {
      const a = t - c.t; p.s.visible = a > 0 && a < 3;
      if (p.s.visible) { p.s.position.set(c.x + tx * p.o + nx * (0.2 + 0.3 * a), c.y - 0.6 * a, c.z + tz * p.o + nz * (0.2 + 0.3 * a)); const sc = 0.4 + 0.6 * a; p.s.scale.set(sc, sc, 1); p.s.material.opacity = 0.4 * (1 - a / 3); }
    }
  }
  // shards
  for (const s of QF.shards) {
    const tau = t - s.t; s.m.visible = tau > 0;
    if (tau <= 0) continue;
    const yy = s.y - 0.5 * 9.81 * tau * tau, landed = yy <= 0.012, tl = Math.sqrt(2 * (s.y - 0.012) / 9.81), tt = Math.min(tau, tl);
    s.m.position.set(s.x + s.vx * tt, Math.max(0.012, yy), -14.1 + s.vz * tt);
    if (landed) s.m.rotation.set(-Math.PI / 2, 0, s.rest); else s.m.rotation.set(s.wx * tau, s.wy * tau, 0);
  }
  for (const g of QF.glassDust) {
    const a = t - GLASS.t - g.o * 0.4; g.s.visible = a > 0 && a < 2.2;
    if (g.s.visible) { g.s.position.set(lerp(GLASS.x0, GLASS.x1, g.o), lerp(GLASS.y1, 0.4, Math.min(1, a / 1.0)), -14.4 - 0.4 * a); const sc = 0.5 + 0.9 * a; g.s.scale.set(sc, sc, 1); g.s.material.opacity = 0.45 * (1 - a / 2.2); }
  }
  // falling dust motes
  {
    const M_ = QF.motes, p = M_.geo.attributes.position.array;
    for (let i = 0; i < M_.N; i++) { const [x, z, ph, v] = M_.seeds[i]; p[i * 3] = x + 0.2 * Math.sin(t * v + ph * 9); p[i * 3 + 1] = 6 - ((t * v * 1.4 + ph * 6) % 6); p[i * 3 + 2] = z; }
    M_.geo.attributes.position.needsUpdate = true;
    M_.mat.opacity = 0.75 * smooth(0.05, 0.4, I) * (t > QUAKE.start ? 1 : 0);
  }
  // plants: rock onto their edge, then topple over
  const acc = swayAcc(t);
  for (const P of QF.plantsFx) {
    const push = -(acc.x * Math.sin(P.dir) + acc.z * Math.cos(P.dir));
    let a = Math.max(0, 0.022 * push) * I;
    if (t > P.t) { const tau = t - P.t; a = tau < 0.55 ? 1.35 * (tau / 0.55) ** 2 : 1.35 - 0.07 * Math.exp(-(tau - 0.55) * 8) * Math.abs(Math.sin((tau - 0.55) * 22)); }
    P.pv.quaternion.setFromAxisAngle(P.axis, a);
  }
  // paintings swing on their hook, two drop off and fall face down
  for (const P of QF.paintFx) {
    const g = P.g;
    if (t < P.t) { g.rotation.set(P.sw(t) * 0.8, 0, 0); g.position.y = P.y0; g.children[0].rotation.z = 0; continue; }
    const tau = t - P.t, drop = Math.min(P.y0 - 1.5 - 0.01, 0.5 * 9.81 * tau * tau), tl = Math.sqrt(2 * (P.y0 - 1.51) / 9.81);
    g.rotation.set(0, 0, 0); g.position.y = P.y0 - drop;
    const tip = tau < tl ? 0 : Math.min(1, ((tau - tl) / 0.42) ** 2);
    g.children[0].rotation.z = -(Math.PI / 2 - 0.04) * tip + (tip === 1 ? 0.03 * Math.exp(-(tau - tl - 0.42) * 10) * Math.sin((tau - tl) * 30) : 0);
  }
  // monitors topple
  for (const m of QF.monitors) {
    const tau = t - m.t;
    const wob = 0.05 * I * Math.sin(t * 17 + m.t * 5);
    m.obj.rotation.x = tau < 0 ? wob : m.dir * Math.min(1.42, 1.42 * (tau / 0.4) ** 2);
  }
  // chairs roll and spin across the floor
  for (const c of QF.chairs) {
    const u = smooth(1.2, 8, t) * 0.7 + smooth(15.6, 18, t) * 0.3;
    c.obj.position.set(c.x0 + Math.sin(c.dir) * c.dist * u + sw.x * 0.6, 0, c.z0 + Math.cos(c.dir) * c.dist * u + sw.z * 0.6);
    c.obj.rotation.y = c.spin * u;
  }
}

// ---------------------------------------------------------------- people
// Before the quake people chat in the office; when it hits most drop and cover their heads,
// others brace and look up at the ceiling; then everyone runs out through the open gates.
const sampleAgent = sampler(crowd);
const people = [];
{
  const r = seeded(7331);
  const pick = a => a[Math.floor(r() * a.length)];
  const SKINS = ['#f0c9a6', '#e6b98f', '#d9a77c', '#c68e64', '#a06a45', '#8d5a3a', '#6b4228', '#efc7a1'];
  const SHIRTS = ['#ffffff', '#9cc3e6', '#2d5f8b', '#7a2e3a', '#4d6b4a', '#d9d2c4', '#3d4a5c', '#9e3b32', '#e8ecef', '#5b4a7a', '#c97b3a', '#2f7f86', '#8c96a0', '#1f2a38'];
  const PANTS = ['#2a3242', '#2b2b2b', '#3a3f4a', '#1f242c', '#34363d', '#2e3a52', '#b39b72', '#5a5048'];
  const HAIRC = ['#16110d', '#2a2018', '#3a2a1e', '#4a2f1d', '#1d140e', '#6b4a32'];
  const HIJABC = ['#5e7d6a', '#2c3e57', '#7a2e3a', '#c9b79c', '#3b3b46'];
  const FIXED = {
    recep: { skin: '#c68e64', shirt: '#203a5c', collar: '#f2f2f2', pants: '#1c2533', hair: 'bun', hairColor: '#1a120c', lip: '#a65a50' },
    buddy1: { skin: '#e6b98f', shirt: '#2d5f8b', collar: '#244d72', pants: '#2a3242', hair: 'short', hairColor: '#2a2018' },
    buddy2: { skin: '#c68e64', shirt: '#ffffff', collar: '#e4e8ec', pants: '#34363d', hair: 'hijab', hairColor: '#7a2e3a', lip: '#a35e55' },
  };
  let curly = 0;
  crowd.agents.forEach((a, i) => {
    let h;
    if (a.id === 'user') h = user;
    else {
      let o = FIXED[a.id];
      if (!o) {
        const roll = r();
        let hair = roll < 0.45 ? 'short' : roll < 0.62 ? 'bob' : roll < 0.75 ? 'bun' : roll < 0.9 ? 'hijab' : 'curly';
        if (hair === 'curly' && curly++ > 3) hair = 'short';
        const shirt = pick(SHIRTS);
        o = {
          skin: pick(SKINS), shirt, collar: r() < 0.5 ? new THREE.Color(shirt).multiplyScalar(0.85).getStyle() : null, pants: pick(PANTS),
          hair, hairColor: hair === 'hijab' ? pick(HIJABC) : pick(HAIRC), short: r() < 0.35,
          lip: hair === 'bob' || hair === 'bun' || hair === 'hijab' ? '#b0645a' : '#8a4c40',
        };
      }
      h = buildHuman({
        skin: mat(o.skin, { roughness: 0.6 }), skinShade: mat(new THREE.Color(o.skin).multiplyScalar(0.88).getStyle(), { roughness: 0.65 }),
        shirt: mat(o.shirt, { roughness: 0.65 }), collar: o.collar ? mat(o.collar, { roughness: 0.6 }) : null,
        pants: mat(o.pants, { roughness: 0.7 }), shoe: mat('#1b1d21', { roughness: 0.4 }), shortSleeve: !!o.short,
        lip: o.lip || '#8a4c40', lipLine: '#4a2620', brow: '#1d140e', iris: '#3a2416', smile: 0,
      });
      styleHair(h, o.hair, mat(o.hairColor || '#16110d', { roughness: 0.6 }));
      scene.add(h.root);
    }
    const isUser = a.id === 'user';
    people.push({
      h, a, i,
      crouch: isUser || r() < 0.62,              // drop, cover, hold on
      coverRun: !isUser && r() < 0.3,           // keeps hands over the head while running
      react: 0.12 + r() * 0.35,
      ph: r() * 6.28, look: (r() - 0.5) * 1.2, talk: r() < 0.5,
    });
  });
}

// the security guard by the doors: takes cover, then waves everyone out, and leaves last
const GUARD_PATH = [[GUARD_XZ[0], GUARD_XZ[1]], [2.9, -12.6], [3.3, -14.0], [3.3, -17.2], [2.4, -19.6]];
const GUARD_LEAVE = 18.4;
guard.wand.visible = false;
const guardPathLen = []; { let s = 0; guardPathLen.push(0); for (let i = 1; i < GUARD_PATH.length; i++) { s += Math.hypot(GUARD_PATH[i][0] - GUARD_PATH[i - 1][0], GUARD_PATH[i][1] - GUARD_PATH[i - 1][1]); guardPathLen.push(s); } }
function guardAt(t) {
  const s = Math.min(guardPathLen.at(-1), Math.max(0, t - GUARD_LEAVE) * 2.8 * smooth(GUARD_LEAVE, GUARD_LEAVE + 0.6, t) + 0);
  let i = 1; while (i < guardPathLen.length - 1 && guardPathLen[i] < s) i++;
  const u = clamp((s - guardPathLen[i - 1]) / (guardPathLen[i] - guardPathLen[i - 1]));
  const [x0, z0] = GUARD_PATH[i - 1], [x1, z1] = GUARD_PATH[i];
  return { x: lerp(x0, x1, u), z: lerp(z0, z1, u), h: Math.atan2(x1 - x0, z1 - z0), s, moving: s > 0 && s < guardPathLen.at(-1) - 0.01 };
}

// shadows for everything except helpers/glass/fx; tiny face details don't cast shadows
{
  const sph = new THREE.Sphere(), sc = new THREE.Vector3();
  scene.traverse(o => {
    if (!o.isMesh) return;
    const transparent = o.material && o.material.transparent;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    o.updateWorldMatrix(true, false); o.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), sc);
    sph.copy(o.geometry.boundingSphere);
    const tiny = sph.radius * Math.max(sc.x, sc.y, sc.z) < 0.03;
    o.castShadow = !o.userData.noShadow && !o.userData.receiveOnly && !transparent && !tiny;
    o.receiveShadow = !transparent;
  });
}

// ---------------------------------------------------------------- camera
// Keys: [t, azimuth, height, radius, targetX, targetY, targetZ, follow, lookAhead]
// azimuth 0 = camera on the +z side of the target (behind people running out toward -z),
// azimuth PI = in front of them. follow blends the target onto the visitor in yellow.
const CAM_KEYS = [
  [0.0, Math.PI + 0.2, 0.2, 1.05, 0.85, 1.24, -0.52, 0, 0],   // close-up: the gate's status display (system normal)
  [1.4, Math.PI + 0.22, 0.2, 0.98, 0.85, 1.24, -0.52, 0, 0],
  [2.6, Math.PI + 0.24, 0.22, 1.02, 0.85, 1.24, -0.52, 0, 0],  // "GEMPA TERDETEKSI"
  [3.9, Math.PI + 0.3, 0.55, 3.0, 0.3, 1.05, -0.2, 0, 0],      // pull back: emergency release, every flap opens
  [5.8, Math.PI - 0.12, 1.6, 6.4, 0, 1.0, 1.5, 0, 0],          // system dead; office behind: people taking cover, then running
  [8.4, Math.PI - 0.3, 1.9, 6.2, 0, 1.1, 4, 0.75, -1.0],      // the crowd runs toward the open gates
  [11.0, Math.PI - 0.62, 2.6, 7.8, 0, 1.0, 0.4, 0.35, -0.4],  // all 7 gates open, system off, people streaming through
  [12.8, 1.35, 1.8, 5.4, 0, 1.2, -5, 0.9, 0.8],               // swing round behind the visitor in the lobby
  [14.8, 0.18, 1.7, 5.0, 0, 1.2, -11, 1, 2.0],                // out through the doors
  [16.7, 0.12, 1.6, 5.0, 0, 1.2, -17, 1, 2.0],
  [18.8, Math.PI - 0.38, 2.3, 9.2, -2.2, 1.6, -18.5, 0.45, -0.8], // turn back: the aftershock hits the building
  [24.5, Math.PI - 0.3, 2.5, 10.4, -2.4, 1.7, -18.5, 0.4, -1.0],
];
function camChannel(t, ch) {
  const K = CAM_KEYS;
  if (t <= K[0][0]) return K[0][ch];
  if (t >= K[K.length - 1][0]) return K[K.length - 1][ch];
  let i = 0; while (K[i + 1][0] < t) i++;
  const k0 = K[Math.max(0, i - 1)], k1 = K[i], k2 = K[i + 1], k3 = K[Math.min(K.length - 1, i + 2)];
  const h = k2[0] - k1[0], u = (t - k1[0]) / h;
  const tan = (a, b) => (b[ch] - a[ch]) / Math.max(1e-6, b[0] - a[0]);
  const m1 = (k1 === k0 ? 0 : tan(k0, k2)) * h, m2 = (k3 === k2 ? 0 : tan(k1, k3)) * h;
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * k1[ch] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * k2[ch] + (u3 - u2) * m2;
}

// ---------------------------------------------------------------- poses
// leg extension below the hip for given hip/knee angles (keeps the lowest foot on the floor)
const legReach = (hx, kx) => 0.45 * Math.cos(hx) + 0.478 * Math.cos(hx + kx);
function setLegs(h, l, r, spread = 0) {
  h.legs[1].hip.rotation.set(l[0], 0, spread); h.legs[1].knee.rotation.x = l[1];
  h.legs[-1].hip.rotation.set(r[0], 0, -spread); h.legs[-1].knee.rotation.x = r[1];
  return Math.max(legReach(l[0], l[1]), legReach(r[0], r[1])) * Math.cos(spread) - HIP_H;
}
const mixA = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];

function posePerson(p, t, s) {
  const { h, a } = p, I = intensity(t);
  const started = t >= a.delay, arrived = started && s.v < 0.35 && t > a.delay + 3;
  const amp = started && !arrived ? clamp(s.v / 2.7) : 0;
  // weights
  const quakeOn = smooth(QUAKE.start + p.react, QUAKE.start + p.react + 0.45, t);
  const getUp = smooth(a.delay - 0.45, a.delay + 0.05, t);
  const afterCrouch = p.crouch && arrived ? smooth(QUAKE.after + 0.2, QUAKE.after + 0.7, t) * (1 - smooth(18.6, 19.6, t)) : 0;
  const cw = p.crouch ? Math.max(quakeOn * (1 - getUp), afterCrouch) : 0;    // crouched, covering head
  const bw = Math.max(0, (p.crouch ? 0 : quakeOn * (1 - getUp)) + (arrived && !p.crouch ? I * 0.8 : 0)); // braced, looking up
  const rw = amp;                                                           // running
  // legs
  const ph = (s.d / 1.05) * Math.PI;
  const runL = [-Math.sin(ph) * 0.72 * rw - 0.1 * rw, rw * (0.3 + 1.15 * Math.max(0, Math.cos(ph)))];
  const runR = [Math.sin(ph) * 0.72 * rw - 0.1 * rw, rw * (0.3 + 1.15 * Math.max(0, -Math.cos(ph)))];
  const kneel = [-1.25, 2.05];
  const brace = [-0.12, 0.3];
  const lx = lerp(lerp(lerp(0, runL[0], rw), brace[0], bw), kneel[0], cw), lk = lerp(lerp(lerp(0, runL[1], rw), brace[1], bw), kneel[1], cw);
  const rx = lerp(lerp(lerp(0, runR[0], rw), brace[0], bw), kneel[0] + 0.25, cw), rk = lerp(lerp(lerp(0, runR[1], rw), brace[1], bw), kneel[1] - 0.2, cw);
  const drop = setLegs(h, [lx, lk], [rx, rk], 0.13 * bw);
  h.body.position.y = drop + 0.035 * rw * Math.abs(Math.sin(ph));
  // torso: lean forward when running/crouching, wobble with the shaking
  const wob = I * (1 - cw) * (1 - 0.5 * rw);
  h.upper.rotation.set(0.03 + 0.24 * rw + 0.62 * cw + Math.sin(t * 1.7 + p.ph) * 0.01, 0, 0.09 * wob * Math.sin(TAU * 1.3 * t + p.ph));
  h.body.rotation.z = 0.05 * wob * Math.sin(TAU * 0.9 * t + p.ph * 2);
  // arms
  const cover = Math.max(cw, p.coverRun ? rw : 0);
  for (const sd of [1, -1]) {
    const pump = sd * Math.sin(ph) * 0.8 * rw;
    let sh = [pump, 0, sd * 0.06], el = [-0.25 - 1.3 * rw, 0, 0];
    if (!started && !quakeOn && p.talk) { const g = 0.5 + 0.5 * Math.sin(t * 3.1 + p.ph); if (sd === 1) { sh = [-0.4 * g, 0, 0.08]; el = [-0.4 - 0.9 * g, 0, 0]; } }
    sh = mixA(sh, [-0.55, 0, sd * 0.95], bw); el = mixA(el, [-0.35, 0, 0], bw);
    const bob = p.coverRun ? 0.06 * Math.sin(ph * 2) * rw : 0;
    sh = mixA(sh, [-2.35 + bob, 0, sd * 0.85], cover); el = mixA(el, [-2.45, 0, 0], cover);
    h.arms[sd].shoulder.rotation.set(sh[0], sh[1], sh[2]);
    h.arms[sd].elbow.rotation.set(el[0], el[1], el[2]);
  }
  // head: looks up at the ceiling when bracing, ducks when covering, glances around when running
  let yaw = 0.3 * Math.sin(t * 1.1 + p.ph) * (1 - rw) * (1 - cw);
  if (!quakeOn && p.look) yaw = p.look * 0.5;
  h.headPivot.rotation.set(lerp(lerp(0.05, -0.45, bw), 0.5, cw) + 0.06 * rw, yaw + 0.25 * Math.sin(t * 2.3 + p.ph) * bw, 0);
}

// ---------------------------------------------------------------- per-frame update
const _gp = new THREE.Vector3();
function update(t) {
  const I = intensity(t);
  for (const p of people) {
    const s = sampleAgent(p.i, t);
    // a slight stagger when the floor moves under them
    const sw = sway(t);
    p.h.root.position.set(s.x + sw.x * 0.25 * (s.v < 0.3 ? 1 : 0.4), 0, s.z + sw.z * 0.25 * (s.v < 0.3 ? 1 : 0.4));
    p.h.root.rotation.y = s.h;
    posePerson(p, t, s);
  }

  // guard: takes cover, stands up and waves people out through the doors, leaves last
  {
    const g = guard, gp = guardAt(t);
    g.root.position.set(gp.x, 0, gp.z);
    const base = { h: g, a: { delay: 3.7 }, crouch: true, coverRun: false, react: 0.22, ph: 1.3, look: 0, talk: false };
    if (gp.s > 0) {
      g.root.rotation.y = gp.moving ? gp.h : 0;
      posePerson(base, t, { v: gp.moving ? 2.8 : 0, d: gp.s });
    } else {
      g.root.rotation.y = -0.3;
      posePerson(base, t, { v: 0, d: 0 });
      const wv = smooth(3.7, 4.2, t) * (1 - smooth(15.65, 15.95, t)), wave = Math.sin(t * 5.2);
      if (wv > 0) {
        const L = (o, v) => o.set(lerp(o.x, v[0], wv), lerp(o.y, v[1], wv), lerp(o.z, v[2], wv));
        L(g.arms[-1].shoulder.rotation, [-0.35, 0, -1.25 + 0.12 * wave]); L(g.arms[-1].elbow.rotation, [-0.35, 0, 0]);
        L(g.arms[1].shoulder.rotation, [-1.1, 0, 0.15]); L(g.arms[1].elbow.rotation, [-0.9 - 0.6 * (0.5 + 0.5 * wave), 0, 0]);
        L(g.headPivot.rotation, [0.05, 0.5 * Math.sin(t * 0.8), 0]);
      }
    }
  }

  updateQuake(t);
  updateGate(t);

  // ---------------- camera
  const ch = i => camChannel(t, i);
  const follow = clamp(ch(7));
  const up = user.root.position;
  const keyT = new THREE.Vector3(ch(4), ch(5), ch(6));
  const anchor = keyT.clone().lerp(new THREE.Vector3(up.x, 1.2, up.z), follow);
  const az = ch(1), hh = ch(2), r = ch(3);
  camera.position.set(anchor.x + Math.sin(az) * r, anchor.y + hh, anchor.z + Math.cos(az) * r);
  if (camera.position.z > -14) camera.position.y = Math.min(camera.position.y, 5.5);
  camera.lookAt(anchor.clone().add(new THREE.Vector3(0, 0, -ch(8))));
  // shaking: the camera moves with the building and rattles on its mount
  const gd = ground(t), cs = camShake(t);
  camera.position.x += gd.x; camera.position.y += gd.y; camera.position.z += gd.z;
  camera.rotateX(cs.pitch); camera.rotateY(cs.yaw); camera.rotateZ(cs.roll);

  sun.target.position.copy(anchor).setY(0);
  sun.position.copy(anchor).add(new THREE.Vector3(-7, 15, 6)).setY(15);
}

function renderAt(t) {
  update(t);
  if (params.has('cam')) { // debug-only: free camera "x,y,z,tx,ty,tz"
    const v = params.get('cam').split(',').map(Number);
    camera.position.set(v[0], v[1], v[2]); camera.lookAt(v[3], v[4], v[5]);
  }
  renderer.render(scene, camera);
}

window.DURATION = DURATION;
window.renderAt = renderAt;
window.sceneReady = true;

if (!RENDER_MODE) {
  const t0 = performance.now();
  const loop = () => { renderAt(((performance.now() - t0) / 1000) % DURATION); requestAnimationFrame(loop); };
  loop();
}
