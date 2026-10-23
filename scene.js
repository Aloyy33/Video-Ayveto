// AYVETO company access process — deterministic Three.js animation.
// Every frame is a pure function of time `t` (seconds), so the same scene can be
// played live in a browser or rendered frame-by-frame to video (see render.mjs).
import * as THREE from 'three';

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
scene.add(new THREE.HemisphereLight('#ffffff', '#aebfcf', 1.15));
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
const ledMat = new THREE.MeshStandardMaterial({ color: '#203040', emissive: '#6fa9d6', emissiveIntensity: 0.4 });
const checkMat = new THREE.MeshStandardMaterial({ color: '#1fbf4a', emissive: '#27e05a', emissiveIntensity: 1.2 });
const glowDiscMat = new THREE.MeshBasicMaterial({ color: '#35ff6e', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });

function makeXMark(parent, x, z, active) {
  const grp = new THREE.Group();
  grp.position.set(x, POD_H + 0.004, z);
  for (const a of [Math.PI / 4, -Math.PI / 4]) {
    const o = mesh(new THREE.BoxGeometry(0.27, 0.006, 0.075), M.darkOutline, 0, 0, 0, grp); o.rotation.y = a;
    const r = mesh(new THREE.BoxGeometry(0.245, 0.012, 0.05), M.red, 0, 0.002, 0, grp); r.rotation.y = a;
  }
  parent.add(grp);
  if (!active) return;
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

const ledIdleMat = new THREE.MeshStandardMaterial({ color: '#203040', emissive: '#6fa9d6', emissiveIntensity: 0.35 });
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
  if (lc === 0) gate.flaps.push({ pivot, openAngle: side < 0 ? -Math.PI / 2 : Math.PI / 2 });
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

// RFID reader pole at the front of the visitor's lane (right side, keeps the walk path clear)
const reader = new THREE.Group();
reader.position.set(POD_X, 0, -1.65);
addEdges(mesh(new THREE.BoxGeometry(0.09, 2.05, 0.09), M.poleGray, 0, 1.025, 0, reader));
addEdges(mesh(new THREE.BoxGeometry(0.3, 0.03, 0.3), M.poleGray, 0, 0.015, 0, reader));
const readerHead = new THREE.Group();
readerHead.position.set(0, 2.27, 0);
readerHead.rotation.y = -0.35;
reader.add(readerHead);
addEdges(mesh(new THREE.BoxGeometry(0.56, 0.56, 0.14), M.readerGray, 0, 0, 0, readerHead));
const screenTex = canvasTex(256, 256, () => {});
const screenMat = new THREE.MeshBasicMaterial({ map: screenTex });
for (const s of [-1, 1]) {
  const p = mesh(new THREE.PlaneGeometry(0.46, 0.46), screenMat, 0, 0, s * 0.0715, readerHead);
  if (s < 0) p.rotation.y = Math.PI;
}
scene.add(reader);

let lastScreenKey = '';
function drawScreen(state, t) {
  const key = state === 'scan' ? `scan${Math.floor(t * 30)}` : state;
  if (key === lastScreenKey) return;
  lastScreenKey = key;
  const { ctx: g } = screenTex.userData;
  const w = 256, c = 128;
  const bg = g.createLinearGradient(0, 0, 0, w);
  if (state === 'ok') { bg.addColorStop(0, '#0c5a2a'); bg.addColorStop(1, '#073d1c'); }
  else { bg.addColorStop(0, '#0f3b5f'); bg.addColorStop(1, '#082338'); }
  g.fillStyle = bg; g.fillRect(0, 0, w, w);
  g.fillStyle = '#ffffff'; g.font = 'bold 26px "Noto Sans", sans-serif'; g.textAlign = 'center';
  g.fillText('AYVETO', c, 40);
  g.lineCap = 'round';
  if (state === 'ok') {
    g.fillStyle = '#22d35b'; g.beginPath(); g.arc(c, 145, 62, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = 16;
    g.beginPath(); g.moveTo(c - 30, 147); g.lineTo(c - 8, 170); g.lineTo(c + 32, 122); g.stroke();
  } else {
    const active = state === 'scan';
    // RFID waves icon
    for (let i = 0; i < 3; i++) {
      const phase = active ? (t * 2.2 - i * 0.33) % 1 : 1;
      g.strokeStyle = active ? `rgba(80,180,255,${0.35 + 0.65 * (1 - Math.abs(phase - 0.5) * 2)})` : 'rgba(150,180,205,0.75)';
      g.lineWidth = 9;
      g.beginPath(); g.arc(c - 30, 150, 26 + i * 24, -Math.PI / 3.2, Math.PI / 3.2); g.stroke();
    }
    g.fillStyle = active ? '#5fc0ff' : '#9fb7cc';
    g.fillRect(c - 62, 120, 26, 60);
    if (active) { // spinner
      g.strokeStyle = '#5fc0ff'; g.lineWidth = 6;
      const a = t * 6;
      g.beginPath(); g.arc(c, 145, 92, a, a + Math.PI * 0.6); g.stroke();
    }
  }
  screenTex.needsUpdate = true;
}


// ---------------------------------------------------------------- security checkpoint table
const TABLE = { x: -1.25, z: -5.0, top: 1.0 };
{
  const t = new THREE.Group();
  t.position.set(TABLE.x, 0, TABLE.z);
  addEdges(mesh(new THREE.BoxGeometry(0.7, 0.07, 1.45), M.tableTop, 0, TABLE.top - 0.035, 0, t), 30, edgeMatSoft);
  for (const [lx, lz] of [[-0.29, -0.66], [0.29, -0.66], [-0.29, 0.66], [0.29, 0.66]])
    addEdges(mesh(new THREE.BoxGeometry(0.07, TABLE.top - 0.07, 0.07), M.tableLeg, lx, (TABLE.top - 0.07) / 2, lz, t), 30, edgeMatSoft);
  mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 32), M.darkOutline, -0.12, TABLE.top + 0.01, -0.45, t);
  mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.05, 32), M.red, -0.12, TABLE.top + 0.04, -0.45, t);
  scene.add(t);
}

// reception desk in the lobby, before the gate (visitor side faces the entrance and the walkway)
const RECEPTION = { x: 4.4, z: -5.6, ry: 0.5 };
const SOFAS = [[7.6, -9.5, -Math.PI / 2], [5.2, -11.6, 0]];
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

  // ---- glass entrance facade with automatic sliding doors
  const DX = -0.45, DW = 2.4; // door opening centred on the visitor's path
  const curtainSeg = (x0, x1) => {
    const w = x1 - x0, cx = (x0 + x1) / 2;
    noShadow(add(new THREE.BoxGeometry(w, WALL_H, 0.04), B.curtain, cx, WALL_H / 2, FZ));
    for (let x = x0; x <= x1 + 1e-6; x += w / Math.max(1, Math.round(w / 2))) add(new THREE.BoxGeometry(0.08, WALL_H, 0.12), B.frame, x, WALL_H / 2, FZ);
  };
  curtainSeg(-SIDE, DX - DW / 2);
  curtainSeg(DX + DW / 2, SIDE);
  for (const y of [0.05, 3.2, WALL_H - 0.05]) add(new THREE.BoxGeometry(SIDE * 2, 0.1, 0.14), B.frame, 0, y, FZ);
  noShadow(add(new THREE.BoxGeometry(DW, WALL_H - 3.2, 0.04), B.curtain, DX, (WALL_H + 3.2) / 2, FZ));
  for (const sd of [-1, 1]) {
    const d = new THREE.Group();
    d.position.set(DX + sd * DW / 4, 0, FZ + 0.12);
    const panel = mesh(new THREE.BoxGeometry(DW / 2, 3.1, 0.03), B.curtain, 0, 1.6, 0, d); panel.userData.noShadow = true;
    mesh(new THREE.BoxGeometry(DW / 2, 0.06, 0.06), B.frame, 0, 0.05, 0, d);
    mesh(new THREE.BoxGeometry(0.05, 3.1, 0.06), B.frame, -sd * DW / 4, 1.6, 0, d);
    mesh(new THREE.BoxGeometry(0.04, 0.6, 0.06), M.steel, -sd * (DW / 4 - 0.12), 1.1, 0.04, d);
    scene.add(d);
    entranceDoors.push({ obj: d, closedX: d.position.x, dir: sd });
  }
  add(new THREE.BoxGeometry(DW + 0.4, 0.3, 0.3), B.frame, DX, 3.3, FZ + 0.1); // door operator housing
  // AYVETO sign above the entrance (inside, facing the lobby)
  const sign = add(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshStandardMaterial({ map: logoTex, roughness: 0.4 }), DX, 4.55, FZ + 0.1);
  void sign;
  // entrance mat
  const matIn = add(new THREE.PlaneGeometry(3.0, 1.8), mat('#4a4f56', { roughness: 1 }), DX, 0.006, FZ + 1.1); matIn.rotation.x = -Math.PI / 2; matIn.userData.receiveOnly = true;

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
    add(new THREE.BoxGeometry(0.06, 1.5, 2.1), B.frame, -SIDE + 0.2, 3.3, z);
    const a = add(new THREE.PlaneGeometry(1.95, 1.35), new THREE.MeshStandardMaterial({ map: artTex, roughness: 0.5 }), -SIDE + 0.24, 3.3, z); a.rotation.y = Math.PI / 2;
  }
  add(new THREE.BoxGeometry(0.1, 2.0, 3.6), mat('#111820', { roughness: 0.3 }), SIDE - 0.2, 3.2, -6);
  const scr = add(new THREE.PlaneGeometry(3.4, 1.85), new THREE.MeshBasicMaterial({ map: logoTex }), SIDE - 0.26, 3.2, -6); scr.rotation.y = -Math.PI / 2;

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
  for (const mx of [-0.7, 0.7]) {
    mesh(new THREE.BoxGeometry(0.55, 0.34, 0.03), mat('#151b22', { roughness: 0.3 }), mx, 1.42, 0.25, desk).rotation.y = Math.PI;
    mesh(new THREE.BoxGeometry(0.05, 0.2, 0.05), B.frame, mx, 1.24, 0.27, desk);
  }
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
  for (const [x, z] of [[-4.2, 5], [3.4, 4.2], [-8.6, -12.6], [3.0, -12.8], [-4.8, 15], [-2.8, 21.5], [2.8, 21.5], [8.6, 18]]) {
    const p = new THREE.Group(); p.position.set(x, 0, z);
    addEdges(mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.55, 28), M.plantPot, 0, 0.275, 0, p), 35);
    for (const [lx, ly, lz, r] of [[0, 0.95, 0, 0.38], [0.18, 0.78, 0.12, 0.26], [-0.16, 0.8, -0.1, 0.27], [0.05, 1.25, -0.05, 0.24]])
      mesh(new THREE.IcosahedronGeometry(r, 1), M.leaf, lx, ly, lz, p);
    scene.add(p);
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
  const smileY = (x, lift) => my + lift * Math.abs(x / MW) ** 2.2;
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
    lip: '#6e3a2c', lipLine: '#3d1d16', brow: '#1a110b', iris: '#3b2414',
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
    lip: '#c08a7c', lipLine: '#7a4a40', brow: '#15171a', iris: '#2b1d14',
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
const GUARD_POS = new THREE.Vector3(-2.02, 0, -4.95);
guard.root.position.copy(GUARD_POS);
guard.root.rotation.y = Math.PI / 2; // faces the visitor across the table

// ---------------------------------------------------------------- people around the building
// Background people make the lobby and office feel alive: a receptionist, a visitor at the
// counter, people chatting, people sitting on the sofas and lounge chairs, an office worker walking.
const extras = [];
{
  const P = (o) => {
    const h = buildHuman({
      skin: mat(o.skin, { roughness: 0.6 }), skinShade: mat(new THREE.Color(o.skin).multiplyScalar(0.88).getStyle(), { roughness: 0.65 }),
      shirt: mat(o.shirt, { roughness: 0.65 }), collar: o.collar ? mat(o.collar, { roughness: 0.6 }) : null,
      pants: mat(o.pants, { roughness: 0.7 }), shoe: mat(o.shoe || '#1b1d21', { roughness: 0.4 }), shortSleeve: !!o.short,
      lip: o.lip || '#8a4c40', lipLine: o.lipLine || '#4a2620', brow: o.brow || '#1d140e', iris: '#3a2416',
    });
    styleHair(h, o.hair, mat(o.hairColor || '#16110d', { roughness: 0.6 }));
    h.root.position.set(o.x, 0, o.z);
    h.root.rotation.y = o.ry;
    scene.add(h.root);
    return h;
  };
  const faceTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
  const cup = (h, s = 1) => { // coffee cup in one hand
    const c = mesh(new THREE.CylinderGeometry(0.035, 0.028, 0.1, 16), mat('#f4f4f4', { roughness: 0.4 }), 0, -0.31, 0.045, h.arms[s].elbow);
    c.rotation.x = 1.6; // upright while the forearm is raised
    mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.02, 16), mat('#6b4a32'), 0, 0.045, 0, c);
  };
  const phone = (h) => {
    const g = mesh(new THREE.BoxGeometry(0.075, 0.15, 0.01), mat('#14181d', { roughness: 0.3 }), 0, -0.32, 0.05, h.arms[-1].elbow);
    g.rotation.x = 0.3;
    mesh(new THREE.PlaneGeometry(0.066, 0.135), new THREE.MeshBasicMaterial({ color: '#7fb8e8' }), 0, 0, 0.0055, g);
  };
  const sit = (h) => { // seated pose on a 0.42 m seat
    h.body.position.y = -0.43;
    for (const sd of [1, -1]) { h.legs[sd].hip.rotation.set(-Math.PI / 2 + 0.05, 0, sd * 0.06); h.legs[sd].knee.rotation.x = Math.PI / 2 - 0.1; }
    h.upper.rotation.x = -0.24; // leaning back against the backrest
  };
  const breathe = (h, t, ph) => { h.upper.rotation.x += Math.sin(t * 1.6 + ph) * 0.012; };
  // talking: alternating speaker, small arm gestures + nods, listeners look at the speaker
  const talk = (h, t, ph, speaking, look, baseArm = [-0.08, -0.15]) => {
    const g = speaking * (0.5 + 0.5 * Math.sin(t * 3.1 + ph));
    h.arms[1].shoulder.rotation.set(baseArm[0] - 0.45 * g, 0, 0.05 + 0.1 * g);
    h.arms[1].elbow.rotation.set(baseArm[1] - 1.0 * g, 0, 0);
    h.headPivot.rotation.set(0.05 + 0.06 * Math.sin(t * (speaking ? 4.2 : 1.3) + ph) * (0.4 + speaking), look, 0);
  };
  const speakerOf = (t, n, period = 3.4, ph = 0) => Math.floor((t + ph) / period) % n;
  const ease = (t, n, period, ph, i) => { // smooth 0..1 "is speaking" for person i
    const u = ((t + ph) / period) % n, d0 = Math.abs(u - i - 0.5), d = Math.min(d0, n - d0);
    return smooth(0.56, 0.38, d);
  };
  void speakerOf;

  // --- receptionist behind the lobby desk + a visitor asking something at the counter
  const R = RECEPTION, c = Math.cos(R.ry), sn = Math.sin(R.ry);
  const local = (lx, lz) => [R.x + lx * c + lz * sn, R.z - lx * sn + lz * c];
  const [rx, rz] = local(0, 0.72), [vx, vz] = local(0.35, -0.85);
  const recep = P({ x: rx, z: rz, ry: R.ry + Math.PI, skin: '#c68e64', shirt: '#203a5c', collar: '#f2f2f2', pants: '#1c2533', hair: 'bun', hairColor: '#1a120c', lip: '#a65a50' });
  const asker = P({ x: vx, z: vz, ry: faceTo(vx, vz, rx, rz), skin: '#e0b48c', shirt: '#8c96a0', collar: '#7a838c', pants: '#2e3a52', hair: 'short', hairColor: '#3a2a1e', short: true });
  extras.push({ update: t => {
    // greets the visitor coming in, then talks with the person at the counter / checks the monitor
    const greet = pulse(t, 0.6, 1.2, 2.6, 3.2);
    const toUser = faceTo(rx, rz, user.root.position.x, user.root.position.z) - (R.ry + Math.PI);
    const sp = ease(t, 2, 2.8, 0.4, 0);
    talk(recep, t, 0, sp * (1 - greet), lerp(-0.25, Math.atan2(Math.sin(toUser), Math.cos(toUser)), greet), [-0.35, -0.9]);
    recep.arms[-1].shoulder.rotation.set(lerp(-0.35, -0.2, greet), 0, lerp(-0.05, -1.2, greet));
    recep.arms[-1].elbow.rotation.set(lerp(-0.9, -1.6, greet) + 0.25 * greet * Math.sin(t * 9), 0, 0);
    recep.upper.rotation.x = 0.04; breathe(recep, t, 0.3);
    talk(asker, t, 1.7, 1 - sp, 0.0, [-0.45, -0.85]);
    asker.arms[-1].shoulder.rotation.set(-0.45, 0, -0.05); asker.arms[-1].elbow.rotation.set(-0.85, 0, 0);
    asker.upper.rotation.x = 0.03; breathe(asker, t, 1.1);
  } });

  // --- two people chatting on the long sofa, one reading a phone on the other sofa
  {
    const [sx, sz] = SOFAS[0];
    const a = P({ x: sx - 0.03, z: sz - 0.5, ry: -Math.PI / 2, skin: '#d9a77c', shirt: '#7a2e3a', pants: '#34363d', hair: 'hijab', hairColor: '#5e7d6a', lip: '#a35e55' });
    const b = P({ x: sx - 0.03, z: sz + 0.5, ry: -Math.PI / 2, skin: '#a06a45', shirt: '#e8ecef', collar: '#cfd6dc', pants: '#b39b72', hair: 'short' });
    sit(a); sit(b);
    const [qx, qz] = SOFAS[1];
    const d = P({ x: qx + 0.3, z: qz + 0.03, ry: 0, skin: '#6b4228', shirt: '#2f7f86', pants: '#25324a', hair: 'curly', short: true });
    sit(d); phone(d);
    extras.push({ update: t => {
      const sa = ease(t, 2, 3.0, 0.0, 0);
      sit(a); sit(b); sit(d);
      talk(a, t, 0.2, sa, -0.75, [-0.3, -0.75]); breathe(a, t, 0.1);
      talk(b, t, 2.1, 1 - sa, 0.75, [-0.3, -0.75]); breathe(b, t, 1.9);
      for (const h of [a, b]) { h.arms[-1].shoulder.rotation.set(-0.3, 0, -0.05); h.arms[-1].elbow.rotation.set(-0.75, 0, 0); }
      d.arms[-1].shoulder.rotation.set(-0.35, 0, 0.12); d.arms[-1].elbow.rotation.set(-1.25, 0, 0);
      d.arms[1].shoulder.rotation.set(-0.35, 0, -0.1); d.arms[1].elbow.rotation.set(-1.1, 0, 0);
      d.headPivot.rotation.set(0.42 + 0.03 * Math.sin(t * 0.9), 0.05, 0); breathe(d, t, 2.7);
    } });
  }

  // --- standing chat in the lobby (left side, by the artwork)
  {
    const pts = [[-6.0, -8.2], [-5.1, -8.9], [-6.2, -9.3]];
    const cx = -5.75, cz = -8.8;
    const ppl = [
      P({ x: pts[0][0], z: pts[0][1], ry: faceTo(...pts[0], cx, cz), skin: '#f0c9a6', shirt: '#9cc3e6', pants: '#3a3a44', hair: 'bob', hairColor: '#4a2f1d', lip: '#b8645c' }),
      P({ x: pts[1][0], z: pts[1][1], ry: faceTo(...pts[1], cx, cz), skin: '#a06a45', shirt: '#6d7a3a', collar: '#5b6630', pants: '#2b2b2b', hair: 'short', short: true }),
      P({ x: pts[2][0], z: pts[2][1], ry: faceTo(...pts[2], cx, cz), skin: '#e6b98f', shirt: '#d9d2c4', collar: '#bfb7a8', pants: '#3b4a63', hair: 'short', hairColor: '#2a2018' }),
    ];
    cup(ppl[1], -1); cup(ppl[2], 1);
    extras.push({ update: t => ppl.forEach((h, i) => {
      const spk = ease(t, 3, 2.6, 0.7, i);
      // look at the current speaker (or at the group centre when speaking)
      const u = Math.floor(((t + 0.7) / 2.6) % 3), sp = pts[u];
      const want = i === u ? 0 : Math.atan2(Math.sin(faceTo(...pts[i], ...sp) - h.root.rotation.y), Math.cos(faceTo(...pts[i], ...sp) - h.root.rotation.y));
      talk(h, t, i * 1.3, spk, clamp(want, -0.7, 0.7) * 0.8);
      h.arms[-1].shoulder.rotation.set(i === 1 ? -0.4 : -0.05, 0, -0.06); h.arms[-1].elbow.rotation.set(i === 1 ? -1.2 : -0.12, 0, 0);
      if (i === 2) { h.arms[1].shoulder.rotation.set(-0.4, 0, 0.06); h.arms[1].elbow.rotation.set(-1.2, 0, 0); }
      h.upper.rotation.x = 0.02; breathe(h, t, i);
    }) });
  }

  // --- office: a group of colleagues chatting, two people at the lounge table, a walker
  {
    const pts = [[3.6, 10.2], [4.6, 10.6], [4.1, 11.5]];
    const cx = 4.1, cz = 10.75;
    const ppl = [
      P({ x: pts[0][0], z: pts[0][1], ry: faceTo(...pts[0], cx, cz), skin: '#8d5a3a', shirt: '#ffffff', collar: '#e4e8ec', pants: '#2a3242', hair: 'short' }),
      P({ x: pts[1][0], z: pts[1][1], ry: faceTo(...pts[1], cx, cz), skin: '#efc7a1', shirt: '#2d5f8b', pants: '#2b2b2b', hair: 'bun', hairColor: '#20140d', lip: '#b8645c' }),
      P({ x: pts[2][0], z: pts[2][1], ry: faceTo(...pts[2], cx, cz), skin: '#c08a60', shirt: '#9e3b32', pants: '#3a3f4a', hair: 'hijab', hairColor: '#2c3e57', lip: '#a35e55' }),
    ];
    cup(ppl[0], 1);
    const [c1, c2] = LOUNGE_CHAIRS;
    const s1 = P({ x: c1[0] + 0.03, z: c1[1], ry: c1[2], skin: '#e0b48c', shirt: '#4d6b4a', pants: '#24282e', hair: 'short', hairColor: '#4a3524', short: true });
    const s2 = P({ x: c2[0], z: c2[1] - 0.03, ry: c2[2], skin: '#6b4228', shirt: '#e6c34a', pants: '#2e3a52', hair: 'curly' });
    sit(s1); sit(s2); cup(s1, -1);
    const walker = P({ x: 8, z: 18.5, ry: -Math.PI / 2, skin: '#d9a77c', shirt: '#3d4a5c', collar: '#ffffff', pants: '#1f242c', hair: 'short' });
    const folder = mesh(new THREE.BoxGeometry(0.03, 0.3, 0.23), mat('#2f7fc4'), 0.0, -0.28, 0.06, walker.arms[1].elbow); void folder;
    extras.push({ update: t => {
      ppl.forEach((h, i) => {
        const spk = ease(t, 3, 2.9, 0.2, i);
        talk(h, t, i * 0.9, spk, 0);
        h.arms[-1].shoulder.rotation.set(-0.05, 0, -0.06); h.arms[-1].elbow.rotation.set(-0.12, 0, 0);
        if (i === 0) { h.arms[1].shoulder.rotation.set(-0.4, 0, 0.06); h.arms[1].elbow.rotation.set(-1.2, 0, 0); }
        breathe(h, t, i);
      });
      sit(s1); sit(s2);
      const sa = ease(t, 2, 3.3, 1.0, 0);
      talk(s1, t, 0.4, sa, 0.35, [-0.3, -0.75]); talk(s2, t, 1.4, 1 - sa, -0.35, [-0.3, -0.75]);
      s1.arms[-1].shoulder.rotation.set(-0.45, 0, 0); s1.arms[-1].elbow.rotation.set(-1.1, 0, 0);
      s2.arms[-1].shoulder.rotation.set(-0.3, 0, -0.05); s2.arms[-1].elbow.rotation.set(-0.75, 0, 0);
      breathe(s1, t, 0.5); breathe(s2, t, 2.2);
      // office worker walking across the back of the office (right -> left), never near the visitor
      const wx = 8.5 - 0.7 * t;
      walker.root.position.set(wx, 0, 18.5);
      const sw = applyWalk(walker, (0.7 * t / 0.68) * Math.PI, 0.8, 0.3);
      walker.arms[-1].shoulder.rotation.set(-sw, 0, -0.05); walker.arms[-1].elbow.rotation.set(-0.2, 0, 0);
      walker.arms[1].shoulder.rotation.set(-0.15, 0, 0.04); walker.arms[1].elbow.rotation.set(-1.3, 0, 0);
    } });
  }
}

// ---------------------------------------------------------------- the visitor's bag
const bag = { root: new THREE.Group() };
{
  const r = bag.root;
  const W = 0.44, H = 0.3, D = 0.16, T = 0.018, top = -0.075;
  const bodyY = top - H / 2;
  mesh(new THREE.BoxGeometry(W, T, D), M.bag, 0, top - H + T / 2, 0, r);
  for (const s of [-1, 1]) {
    mesh(new THREE.BoxGeometry(W, H, T), M.bag, 0, bodyY, s * (D / 2 - T / 2), r);
    mesh(new THREE.BoxGeometry(T, H, D), M.bag, s * (W / 2 - T / 2), bodyY, 0, r);
  }
  mesh(new THREE.BoxGeometry(W - 0.01, 0.012, 0.012), M.steel, 0, top - 0.02, D / 2 + 0.002, r); // zipper trim
  // contents (visible when the guard opens the bag)
  mesh(new THREE.BoxGeometry(0.36, 0.22, 0.02), M.bagInner, 0, top - H + 0.13, -0.04, r);
  mesh(new THREE.BoxGeometry(0.14, 0.12, 0.06), mat('#2f7fc4'), -0.1, top - H + 0.08, 0.035, r);
  mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 14), mat('#d9e4ec', { roughness: 0.2 }), 0.12, top - H + 0.11, 0.035, r);
  // lid with handle, hinged along the back edge
  const lid = new THREE.Group(); lid.position.set(0, top, -D / 2); r.add(lid);
  mesh(new THREE.BoxGeometry(W + 0.01, 0.018, D + 0.01), M.bag, 0, 0.009, D / 2, lid);
  const handle = mesh(new THREE.TorusGeometry(0.055, 0.013, 10, 24, Math.PI), M.black, 0, 0.018, D / 2, lid);
  void handle;
  bag.lid = lid;
  scene.add(r);
}

// ---------------------------------------------------------------- RFID / verification effects
const fx = {};
{
  const blue = '#3fb0ff';
  const ringMat = () => new THREE.MeshBasicMaterial({ color: blue, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  fx.floorRings = [0, 1, 2].map(() => { const m = mesh(new THREE.RingGeometry(0.92, 1.0, 64), ringMat()); m.rotation.x = -Math.PI / 2; scene.add(m); return m; });
  fx.scanBand = mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 64, 1, true), ringMat()); scene.add(fx.scanBand);
  fx.scanField = mesh(new THREE.CylinderGeometry(0.62, 0.62, 2.5, 64, 1, true), ringMat()); scene.add(fx.scanField);
  fx.readerWaves = [0, 1, 2].map(() => { const m = mesh(new THREE.RingGeometry(0.3, 0.34, 48, 1, -Math.PI / 3, Math.PI * 2 / 3), ringMat()); scene.add(m); return m; });
  fx.particles = Array.from({ length: 8 }, () => { const m = mesh(new THREE.SphereGeometry(0.025, 10, 8), ringMat()); scene.add(m); return m; });
  fx.successRing = mesh(new THREE.RingGeometry(0.9, 1.0, 64), new THREE.MeshBasicMaterial({ color: '#35ff6e', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  fx.successRing.rotation.x = -Math.PI / 2; scene.add(fx.successRing);
  fx.gateLight = new THREE.PointLight('#3fb0ff', 0, 4, 2); fx.gateLight.position.set(0, 1.3, 0); scene.add(fx.gateLight);
}

// shadows for everything except helpers/glass/fx
scene.traverse(o => {
  if (o.isMesh) {
    const transparent = o.material && o.material.transparent;
    o.castShadow = !o.userData.noShadow && !o.userData.receiveOnly && !transparent;
    o.receiveShadow = !transparent;
  }
});

// ---------------------------------------------------------------- timeline
// Visitor speed profile (units/s). Distance along the path is the integral of speed,
// and leg swing is driven by distance, so feet never slide.
const SPEED_KEYS = [
  [0.0, 2.8, 1.6, 1.6],   // arriving at the checkpoint (already walking)
  [2.8, 4.0, 1.6, 0.0],   // slow down, stop in front of the guard
  [4.0, 11.4, 0.0, 0.0],  // bag inspection
  [11.4, 12.2, 0.0, 1.5], // set off toward the gate
  [12.2, 99, 1.5, 1.5],   // one continuous walk: gate -> inside the company (never stops)
];
function speedAt(t) {
  for (const [a, b, va, vb] of SPEED_KEYS) if (t >= a && t < b) return lerp(va, vb, (1 - Math.cos(Math.PI * (t - a) / (b - a))) / 2);
  return 0;
}
const DT = 1 / 1000;
const sTable = [0];
for (let i = 1; i <= 26 / DT; i++) sTable.push(sTable[i - 1] + 0.5 * (speedAt((i - 1) * DT) + speedAt(i * DT)) * DT);
const distAt = t => { const f = clamp(t, 0, 26) / DT, i = Math.floor(f); return lerp(sTable[i], sTable[Math.min(i + 1, sTable.length - 1)], f - i); };

const START_Z = -5.0 - distAt(4.0);
const pathX = z => -0.45 + 0.45 * smooth(-5.0, -2.6, z);
const PATH = [];
{
  let s = 0, pz = START_Z, px = pathX(START_Z);
  for (let z = START_Z; z <= 30; z += 0.004) { const x = pathX(z); s += Math.hypot(x - px, z - pz); PATH.push([s, x, z]); px = x; pz = z; }
}
function pathAt(s) {
  let lo = 0, hi = PATH.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (PATH[m][0] < s) lo = m; else hi = m; }
  const a = PATH[lo], b = PATH[hi], u = clamp((s - a[0]) / Math.max(1e-6, b[0] - a[0]));
  return { x: lerp(a[1], b[1], u), z: lerp(a[2], b[2], u), heading: Math.atan2(b[1] - a[1], b[2] - a[2]) };
}

// Key moments
const T = {
  // the card is detected from a distance as soon as the visitor leaves the checkpoint,
  // so the gate is fully open well before they reach it
  scanStart: 11.6, verified: 12.9,
  openStart: 13.0, openEnd: 13.9,
  closeStart: 16.6, closeEnd: 17.5,
};
const TABLE_SPOT = new THREE.Vector3(TABLE.x + 0.13, TABLE.top + 0.37, -4.68);

// Camera keyframes: [t, azimuth, height, radius, targetX, targetY, targetZ, follow]
const CAM_KEYS = [
  [0.0, -0.32, 7.2, 9.8, -0.6, 0.5, -4.2, 0],     // reference-image framing: gate in front, checkpoint behind
  [4.6, -0.2, 3.3, 6.4, -1.5, 1.1, -4.8, 0],      // closer on the inspection (faces readable)
  [10.3, -0.24, 3.4, 6.6, -1.4, 1.1, -4.6, 0],
  [12.0, -0.33, 5.8, 9.0, -0.5, 0.8, -3.0, 0],    // checkpoint + gate + visitor in frame (detection)
  [13.8, -0.5, 5.2, 8.6, -0.2, 0.8, -1.2, 0.25],  // gate already open as the visitor arrives
  [15.6, -1.2, 4.8, 8.0, 0, 0.9, 0.6, 0.5],       // walking straight through
  [17.4, -2.2, 3.9, 6.6, 0, 1.1, 2.5, 0.8],       // gate closing behind the visitor
  [19.8, -Math.PI + 0.04, 3.0, 5.4, 0, 1.2, 6, 1], // follow shot from behind
  [24.5, -Math.PI, 2.9, 5.2, 0, 1.2, 10, 1],
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

// ---------------------------------------------------------------- per-frame update
const tmpV = new THREE.Vector3();

function applyWalk(rig, phase, amp, armAmp = 0.35) {
  const sw = Math.sin(phase) * 0.42 * amp;
  rig.legs[1].hip.rotation.x = -sw;
  rig.legs[-1].hip.rotation.x = sw;
  rig.legs[1].knee.rotation.x = 0.75 * amp * Math.max(0, Math.cos(phase));
  rig.legs[-1].knee.rotation.x = 0.75 * amp * Math.max(0, -Math.cos(phase));
  rig.body.position.y = Math.abs(Math.sin(phase)) * 0.035 * amp - 0.015 * amp;
  return Math.sin(phase) * armAmp * amp; // arm swing (left arm sign)
}

function update(t) {
  // ---------------- visitor
  const s = distAt(t), v = speedAt(t);
  const p = pathAt(s);
  user.root.position.set(p.x, 0, p.z);
  // turn to face the inspection table (max 90°, never facing back toward the entrance)
  const faceTable = smoother(3.7, 4.6, t) * (1 - smoother(10.7, 11.5, t));
  user.root.rotation.y = p.heading - (Math.PI / 2) * faceTable;
  const amp = clamp(v / 1.5);
  const phase = (s / 0.72) * Math.PI;
  const armSw = applyWalk(user, phase, amp, 0.32);
  // right hand: holds the ID card in front of the chest throughout
  user.arms[-1].shoulder.rotation.set(-0.42 - 0.08 * armSw, 0, 0.05);
  user.arms[-1].elbow.rotation.set(-1.15, 0, 0);
  // left hand: carries the bag, puts it on the table, picks it back up
  const reach = smoother(4.55, 5.2, t) * (1 - smoother(5.5, 6.1, t)) + smoother(9.9, 10.4, t) * (1 - smoother(10.6, 11.2, t));
  user.arms[1].shoulder.rotation.set(lerp(armSw, -1.42, reach), 0, lerp(-0.12, -0.05, reach));
  user.arms[1].elbow.rotation.set(lerp(-0.12, -0.05, reach), 0, 0);
  // the card is subtly highlighted while it is being read (it never leaves the hand)
  const cardGlow = pulse(t, T.scanStart, T.scanStart + 0.4, T.verified + 0.2, T.verified + 0.8) * (0.55 + 0.45 * Math.sin(t * 12));
  user.cardMats.forEach(m => { m.emissiveIntensity = cardGlow * 0.6; });

  // ---------------- bag
  user.root.updateMatrixWorld(true);
  const hand = user.arms[1].tip.getWorldPosition(tmpV.set(0, 0, 0)).clone();
  const onTable = smoother(4.95, 5.3, t) * (1 - smoother(10.4, 10.65, t));
  bag.root.position.lerpVectors(hand, TABLE_SPOT, onTable);
  bag.root.rotation.y = onTable > 0.5 ? -Math.PI : user.root.rotation.y - Math.PI / 2;
  const lidOpen = smoother(5.85, 6.45, t) * (1 - smoother(8.95, 9.5, t));
  bag.lid.rotation.x = -1.95 * lidOpen;

  // ---------------- guard
  const g = guard;
  const breathe = Math.sin(t * 1.7) * 0.012;
  g.body.position.y = breathe * 0.3;
  const ask = pulse(t, 3.6, 4.2, 4.9, 5.5);           // polite "please" gesture
  const openLid = pulse(t, 5.45, 5.95, 6.3, 6.8);      // left hand opens the bag
  const closeLid = pulse(t, 8.7, 9.05, 9.45, 9.85);    // left hand closes it
  const inspect = pulse(t, 5.6, 6.3, 8.9, 9.5);        // leaning, looking inside
  const wandUse = pulse(t, 6.4, 6.9, 8.6, 9.0);        // sweeping the detector wand over the bag
  const allow = pulse(t, 9.7, 10.3, 11.4, 12.2);       // gestures toward the gate
  const watch = smoother(11.2, 12.6, t);
  g.upper.rotation.x = 0.04 + 0.3 * inspect + 0.04 * ask + breathe;
  g.headPivot.rotation.x = 0.42 * inspect - 0.06 * allow;
  g.headPivot.rotation.y = -0.55 * watch * (1 - 0.3 * inspect);
  const lh = Math.max(openLid, closeLid);
  g.arms[1].shoulder.rotation.set(-0.55 * ask - 1.0 * lh, 0, 0.06 + 0.1 * ask);
  g.arms[1].elbow.rotation.set(-1.15 * ask - 0.45 * lh, 0, 0);
  const sweep = Math.sin((t - 6.4) * 4.2) * 0.32 * wandUse;
  g.arms[-1].shoulder.rotation.set(-1.0 * wandUse - 0.35 * allow, 0, -0.06 + sweep - 0.95 * allow);
  g.arms[-1].elbow.rotation.set(-0.15 - 0.55 * wandUse - 0.25 * allow, 0, 0);
  g.wand.rotation.x = -0.6 * wandUse;
  const wandBlink = wandUse * (Math.sin(t * 18) > 0 ? 1 : 0.2);
  g.wandLedMat.emissive.set(t > 8.3 ? '#2ee860' : '#3aa0ff');
  g.wandLedMat.emissiveIntensity = Math.max(wandBlink, pulse(t, 8.3, 8.4, 9.2, 9.5)) * 2.5;
  for (const sd of [1, -1]) { g.legs[sd].hip.rotation.x = 0; g.legs[sd].knee.rotation.x = 0; }

  // ---------------- gate / RFID
  const scanning = t >= T.scanStart && t < T.verified;
  const granted = t >= T.verified && t < T.closeEnd;
  const scanFade = pulse(t, T.scanStart, T.scanStart + 0.5, T.verified - 0.1, T.verified + 0.35);
  drawScreen(granted ? 'ok' : scanning ? 'scan' : 'idle', t);
  for (const c of gate.checks) c.visible = granted;
  for (const x of gate.xMarks) x.visible = !granted;
  glowDiscMat.opacity = granted ? 0.35 + 0.15 * Math.sin(t * 6) : 0;
  if (granted) { ledMat.emissive.set('#27e05a'); ledMat.emissiveIntensity = 1.6; }
  else if (scanning) { ledMat.emissive.set('#3fb0ff'); ledMat.emissiveIntensity = 0.6 + 0.9 * (0.5 + 0.5 * Math.sin(t * 9)); }
  else { ledMat.emissive.set('#6fa9d6'); ledMat.emissiveIntensity = 0.35; }
  fx.gateLight.color.set(granted ? '#35ff6e' : '#3fb0ff');
  fx.gateLight.intensity = granted ? 2.2 * (1 - smooth(16.4, 17.5, t)) : 1.8 * scanFade;

  const flapU = smoother(T.openStart, T.openEnd, t) * (1 - smoother(T.closeStart, T.closeEnd, t));
  for (const f of gate.flaps) f.pivot.rotation.y = f.openAngle * flapU;

  // scanning effects around the visitor
  const up = user.root.position;
  fx.floorRings.forEach((r, i) => {
    const ph = ((t - T.scanStart) * 1.1 + i / 3) % 1;
    r.position.set(up.x, 0.02, up.z);
    r.scale.setScalar(0.35 + ph * 1.1);
    r.material.opacity = scanFade * (1 - ph) * 0.75;
  });
  const bandPh = (Math.sin((t - T.scanStart) * 3.2 - Math.PI / 2) + 1) / 2;
  fx.scanBand.position.set(up.x, 0.1 + bandPh * 2.25, up.z);
  fx.scanBand.material.opacity = scanFade * 0.85;
  fx.scanField.position.set(up.x, 1.25, up.z);
  fx.scanField.material.opacity = scanFade * 0.07;
  // waves from the reader toward the card + data particles from the card to the reader
  const card = user.card.getWorldPosition(new THREE.Vector3());
  const rd = readerHead.getWorldPosition(new THREE.Vector3());
  fx.readerWaves.forEach((w, i) => {
    const ph = ((t - T.scanStart) * 1.3 + i / 3) % 1;
    w.position.lerpVectors(rd, card, ph * 0.8);
    w.lookAt(card);
    w.rotation.z += Math.PI / 2;
    w.scale.setScalar(0.6 + ph * 1.6);
    w.material.opacity = scanFade * (1 - ph) * 0.8;
  });
  fx.particles.forEach((pt, i) => {
    const ph = ((t - T.scanStart) * 0.9 + i / fx.particles.length) % 1;
    pt.position.lerpVectors(card, rd, ph);
    pt.position.y += Math.sin(ph * Math.PI) * 0.25;
    pt.material.opacity = scanFade * Math.sin(ph * Math.PI) * 0.95;
  });
  const sr = clamp((t - T.verified) / 0.9);
  fx.successRing.position.set(0, 0.025, -0.9);
  fx.successRing.scale.setScalar(0.4 + sr * 1.8);
  fx.successRing.material.opacity = t >= T.verified ? (1 - sr) * 0.9 : 0;

  // ---------------- background people (after the visitor is placed, so they can look at them)
  for (const e of extras) e.update(t);

  // ---------------- entrance doors (visitor has just come in; they slide shut behind)
  const doorOpen = 1 - smoother(0.8, 2.6, t);
  for (const d of entranceDoors) d.obj.position.x = d.closedX + d.dir * 1.15 * doorOpen;

  // ---------------- camera
  const ch = i => camChannel(t, i);
  const follow = clamp(ch(7));
  const keyT = new THREE.Vector3(ch(4), ch(5), ch(6));
  const userAnchor = new THREE.Vector3(up.x, 1.2, up.z);
  const anchor = keyT.clone().lerp(userAnchor, follow);
  const az = ch(1), h = ch(2), r = ch(3);
  camera.position.set(anchor.x + Math.sin(az) * r, anchor.y + h, anchor.z + Math.cos(az) * r);
  const look = anchor.clone().add(new THREE.Vector3(0, 0, 2.2 * follow * follow));
  camera.lookAt(look);

  // shadow frustum follows the action
  sun.target.position.copy(anchor).setY(0);
  sun.position.copy(anchor).add(new THREE.Vector3(-7, 15, 6)).setY(15);
}

function renderAt(t) {
  update(t);
  if (params.has('cam')) { // debug-only: free camera "x,y,z,tx,ty,tz"
    const v = params.get('cam').split(',').map(Number);
    camera.position.set(v[0], v[1], v[2]); camera.lookAt(v[3], v[4], v[5]);
  } else if (location.search.includes('closeup')) { // debug-only face close-up
    const g = location.search.includes('closeupguard');
    const who = g ? guard.root : user.root;
    const hp = new THREE.Vector3(); who.getWorldPosition(hp); hp.y += 1.67;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(who.getWorldQuaternion(new THREE.Quaternion()));
    camera.position.copy(hp).addScaledVector(fwd, g ? 1.6 : 0.85).add(new THREE.Vector3(g ? 0 : 0.12, 0.05, g ? 0.7 : 0));
    camera.lookAt(hp);
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
