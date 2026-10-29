import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { clamp, lerp, ramp, eio, eOutExpo, eOutCubic, eInOutSine, win, noise1, hash } from './util.js';
import { makeGate, makeConvGate, makePerson, poseWalk, poseTap, makePhone, makeTrail, makeShaft, scanU, wireU } from './builders.js';
import { drawOverlay, loadFonts, W, H } from './overlay.js';

const Q = new URLSearchParams(location.search);
const DPR = +(Q.get('dpr') || 1);
const FPS = 24;

/* ---------------- renderer & post ---------------- */
const wrap = document.getElementById('wrap');
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(DPR); renderer.setSize(W, H);
renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
wrap.appendChild(renderer.domElement);
const ov = document.createElement('canvas'); ov.width = W * DPR; ov.height = H * DPR; wrap.appendChild(ov);
const octx = ov.getContext('2d'); octx.scale(DPR, DPR);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x010309);
scene.fog = new THREE.FogExp2(0x020612, 0.05);
const camera = new THREE.PerspectiveCamera(35, W / H, 0.01, 200);

const rt = new THREE.WebGLRenderTarget(W * DPR, H * DPR, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(DPR); composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.75, 0.55, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finalPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uFade: { value: 1 }, uFlash: { value: 0 }, uTime: { value: 0 }, uCA: { value: 0.004 }, uVig: { value: 0.85 }, uRes: { value: new THREE.Vector2(W * DPR, H * DPR) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uFade, uFlash, uTime, uCA, uVig; uniform vec2 uRes; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime*7.13)*43758.5453); }
    void main(){ vec2 c = vUv-0.5; float r = length(c); vec2 off = c*uCA*r*2.0;
      vec3 col = vec3(texture2D(tDiffuse, vUv+off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv-off).b);
      col *= mix(1.0, smoothstep(0.98, 0.2, r), uVig);
      col += uFlash*vec3(0.72,0.9,1.0);
      col += (h(floor(vUv*uRes/${DPR.toFixed(1)}))-0.5)*0.03;
      gl_FragColor = vec4(col*uFade, 1.0); }`,
});
composer.addPass(finalPass);

/* ---------------- studio environment for reflections ---------------- */
{
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ color: 0x03060e, side: THREE.BackSide })));
  const panel = (w, h, c, p, look) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); m.position.set(...p); m.lookAt(...look); env.add(m); };
  panel(14, 3, new THREE.Color(2.2, 2.4, 2.6), [0, 12, 2], [0, 0, 0]);
  panel(2, 16, new THREE.Color(0.2, 1.4, 2.4), [-12, 3, 0], [0, 0, 0]);
  panel(2, 16, new THREE.Color(0.3, 0.6, 2.4), [12, 3, -3], [0, 0, 0]);
  panel(10, 1.2, new THREE.Color(1.6, 1.8, 2.0), [0, 4, -12], [0, 0, 0]);
  panel(6, 1.0, new THREE.Color(0.8, 1.0, 1.4), [3, 2, 12], [0, 0, 0]);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(env, 0.03).texture;
  scene.environmentIntensity = 0.55;
}

/* ---------------- floor: dark glossy reflective with subtle grid ---------------- */
const mirror = new Reflector(new THREE.PlaneGeometry(160, 160), { textureWidth: W * DPR * 0.5, textureHeight: H * DPR * 0.5, color: 0x6f7c8c, clipBias: 0.003 });
mirror.rotation.x = -Math.PI / 2; scene.add(mirror);
const gridTex = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 512; const x = cv.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 512, 512);
  x.strokeStyle = 'rgba(120,200,255,0.55)'; x.lineWidth = 2; x.strokeRect(0, 0, 512, 512);
  x.strokeStyle = 'rgba(120,200,255,0.16)'; x.lineWidth = 1.2;
  for (let i = 1; i < 5; i++) { x.beginPath(); x.moveTo(i * 102.4, 0); x.lineTo(i * 102.4, 512); x.moveTo(0, i * 102.4); x.lineTo(512, i * 102.4); x.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(160, 160); t.anisotropy = 16; return t;
})();
const floorMat = new THREE.MeshStandardMaterial({ color: 0x060b17, roughness: 0.42, metalness: 0.1, transparent: true, opacity: 0.8, emissive: 0xffffff, emissiveMap: gridTex, emissiveIntensity: 0.07 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), floorMat);
floor.rotation.x = -Math.PI / 2; floor.position.y = 0.001; floor.receiveShadow = true; scene.add(floor);

/* ---------------- main world (AYVETO gate) ---------------- */
const main = new THREE.Group(); scene.add(main);
const gate = makeGate(); main.add(gate);
const GU = gate.userData;
// background architecture: tall soft light panels and lobby strips, softened by fog
const bgMat = (c) => new THREE.MeshBasicMaterial({ color: c, fog: true });
for (let i = 0; i < 7; i++) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 6), bgMat(new THREE.Color(0.25, 0.65, 1.0).multiplyScalar(1.6)));
  m.position.set(-7.5 + i * 2.5, 3, -11); main.add(m);
  const g = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 6), bgMat(new THREE.Color(0.012, 0.03, 0.07)));
  g.position.set(-6.25 + i * 2.5, 3, -11.05); main.add(g);
}
for (const s of [-1, 1]) {
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 30), bgMat(new THREE.Color(0.6, 0.85, 1.2).multiplyScalar(0.3)));
  strip.position.set(s * 5.5, 3.2, -2); main.add(strip);
  const strip2 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 30), bgMat(new THREE.Color(0.1, 0.5, 1.4).multiplyScalar(0.5)));
  strip2.position.set(s * 5.5, 0.05, -2); main.add(strip2);
}
const shafts = [];
for (const [x, z, c] of [[-0.66, 0, 0x6fd6ff], [0.66, 0, 0x4f9dff], [0, -2.5, 0x2a7dff]]) {
  const s = makeShaft(0.08, 0.95, 5.5, c); s.position.set(x, 5.5, z); main.add(s); shafts.push(s);
}

/* lights */
const hemi = new THREE.HemisphereLight(0x29406e, 0x000000, 0.35); scene.add(hemi);
const key = new THREE.SpotLight(0xe6efff, 0, 18, 0.55, 0.85, 1.6); key.position.set(2.6, 5.2, 3.6); key.target.position.set(0, 0.5, 0);
key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0002; key.shadow.normalBias = 0.02; scene.add(key, key.target);
const rimL = new THREE.SpotLight(0x29c6ff, 0, 18, 0.6, 0.9, 1.6); rimL.position.set(-3.2, 3.2, -4.2); rimL.target.position.set(0, 0.6, 0); scene.add(rimL, rimL.target);
const rimR = new THREE.SpotLight(0x3d6bff, 0, 18, 0.6, 0.9, 1.6); rimR.position.set(3.4, 2.4, -4); rimR.target.position.set(0, 0.6, 0); scene.add(rimR, rimR.target);
const streakL1 = new THREE.PointLight(0x33ccff, 0, 3.5, 1.6), streakL2 = new THREE.PointLight(0x3a7bff, 0, 3.5, 1.6); scene.add(streakL1, streakL2);
const cardLight = new THREE.PointLight(0x33ccff, 0, 1.2, 2); scene.add(cardLight);

/* scene-1 reveal streaks */
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const trails1 = [
  makeTrail([V(-9, 0.02, 6), V(-3, 0.02, 2.2), V(-0.9, 0.62, 0.9), V(-0.66, 0.62, 0.72), V(-0.3, 0.62, 0.95), V(0.5, 0.05, 3), V(3, 0.02, 9)], 0.006, 0x3fd2ff),
  makeTrail([V(9, 0.02, -7), V(2.5, 0.02, -2), V(0.9, 0.62, -0.75), V(0.66, 0.62, -0.72), V(0.3, 0.62, -0.95), V(-0.6, 0.02, -3.5), V(-5, 0.02, -10)], 0.006, 0x3d7dff),
  makeTrail([V(-6, 0.012, -8), V(-1.2, 0.012, -1.5), V(-0.85, 0.012, 0), V(-1.2, 0.012, 1.6), V(-4, 0.012, 7)], 0.004, 0x2fe0ff),
  makeTrail([V(6, 0.012, 8), V(1.25, 0.012, 1.6), V(0.85, 0.012, 0), V(1.25, 0.012, -1.6), V(5, 0.012, -8)], 0.004, 0x5aa0ff),
  makeTrail([V(-0.66, 1.25, 2.5), V(-0.66, 1.06, 0.8), V(-0.66, 1.03, 0.0), V(-0.66, 1.06, -0.8), V(-0.66, 1.4, -3)], 0.003, 0x9be8ff),
];
trails1.forEach(t => main.add(t));

/* detection waves (scene 3) */
const ringMat = () => new THREE.MeshBasicMaterial({ color: 0x33ccff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const waves = [], ripples = [];
for (let i = 0; i < 6; i++) {
  const w = new THREE.Mesh(new THREE.TorusGeometry(1, 0.004, 6, 160, Math.PI), ringMat()); w.rotation.z = 0; main.add(w); waves.push(w);
  const r = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 160), ringMat()); r.rotation.x = -Math.PI / 2; r.position.set(0, 0.004, 0.75); main.add(r); ripples.push(r);
}
let beams = [];
const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.8, 1.0), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });

/* person: professional office worker (navy blazer, white shirt, charcoal trousers) */
const hero = makePerson({ suit: 0x15213a, shirt: 0xf3f5f8, pants: 0x2a2e35, skin: 0xb98463, hair: 0x15110e, tie: 0x0d1a33, card: true });
scene.add(hero.root);

/* ---------------- scene-2 area: conventional gate ---------------- */
const C2 = new THREE.Vector3(40, 0, 0);
const conv = new THREE.Group(); conv.position.copy(C2); scene.add(conv);
const cg = makeConvGate(); conv.add(cg);
const convKey = new THREE.SpotLight(0xd9e4f2, 0, 14, 0.7, 0.7, 1.6); convKey.position.set(C2.x + 1.5, 4.2, -2.5); convKey.target.position.set(C2.x, 0.6, -0.8);
convKey.castShadow = true; convKey.shadow.mapSize.set(2048, 2048); convKey.shadow.bias = -0.0002; scene.add(convKey, convKey.target);
const convRim = new THREE.SpotLight(0x5d86c9, 0, 14, 0.7, 0.9, 1.6); convRim.position.set(C2.x - 2, 2.6, 2.5); convRim.target.position.set(C2.x, 0.8, -1.2); scene.add(convRim, convRim.target);
for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.06), bgMat(new THREE.Color(0.7, 0.8, 0.95))); m.position.set(-4 + i * 1.8, 3.4, 3 - i * 1.2); m.rotation.x = Math.PI / 2; conv.add(m); }
for (let i = 0; i < 6; i++) { const g = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 5), bgMat(new THREE.Color(0.02, 0.035, 0.06))); g.position.set(-6 + i * 2.5, 2.5, 7); g.rotation.y = Math.PI; conv.add(g); }
const q1 = makePerson({ suit: 0x3a3f47, shirt: 0xdfe6ee, pants: 0x23262c, skin: 0x8f5f43, hair: 0x0e0b09, tie: 0x5a2230 });
const q2 = makePerson({ suit: 0x1f2a36, shirt: 0xc9d6e6, pants: 0x30343b, skin: 0xd4a27f, hair: 0x2a1a10, tie: 0x2b3b52 });
scene.add(q1.root, q2.root);
// stop position: hand above the reader. Reader world position is fixed; the person stands just behind it.
const READER = new THREE.Vector3(C2.x + 0.47, 1.0, -0.3);
const STOP2 = new THREE.Vector3(C2.x + 0.2, 0, -0.95);

/* ---------------- phone ---------------- */
const loader = new THREE.TextureLoader();
const loadTex = u => new Promise(r => loader.load(u, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16; r(t); }, undefined, e => { console.error('tex fail', u); r(null); }));
const rects = await (await fetch('/assets/ui/rects.json')).json();
const tex = {};
await Promise.all([...['home', 'card', 'block', 'report', 'reportmodal', 'history', 'profile'], ...Object.keys(rects)].map(async k => { tex[k] = await loadTex(`/assets/ui/${k}.png`); }));
const phone = makePhone(tex, rects); scene.add(phone);
const PU = phone.userData;
const P4 = new THREE.Vector3(-60, 1.6, 0);
const phoneKey = new THREE.SpotLight(0xeaf2ff, 0, 12, 0.6, 0.9, 1.6); scene.add(phoneKey, phoneKey.target);
const phoneRim = new THREE.SpotLight(0x22c4ff, 0, 12, 0.7, 0.9, 1.6); scene.add(phoneRim, phoneRim.target);
const phoneRim2 = new THREE.SpotLight(0x3a62ff, 0, 12, 0.7, 0.9, 1.6); scene.add(phoneRim2, phoneRim2.target);
// phone-stage backdrop glow
const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(30, 18), new THREE.ShaderMaterial({
  uniforms: { amt: { value: 1 } }, depthWrite: false, fog: false,
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform float amt; varying vec2 vUv; void main(){ vec2 c = (vUv-vec2(0.55,0.5))*vec2(1.7,1.0); float r = length(c);
    vec3 col = vec3(0.004,0.012,0.035) + vec3(0.02,0.11,0.22)*exp(-r*r*9.0) + vec3(0.0,0.05,0.12)*exp(-pow((vUv.y-0.32)*9.0,2.0));
    gl_FragColor = vec4(col*amt,1.0); }`,
}));
backdrop.position.copy(P4).add(V(0, 0, -6)); scene.add(backdrop);
// light trails orbiting the phone
const trails4 = [];
for (let k = 0; k < 4; k++) {
  const pts = []; const R = 0.62 + k * 0.12, tilt = [0.5, -0.35, 0.2, -0.6][k];
  for (let i = 0; i <= 80; i++) { const a = (i / 80) * Math.PI * 2.4 + k * 1.6; pts.push(V(Math.cos(a) * R * 1.25, Math.sin(a * 0.5) * 0.15 + Math.sin(a) * R * tilt, Math.sin(a) * R * 0.9 - 0.25)); }
  const tr = makeTrail(pts, 0.0035 + k * 0.001, [0x39d0ff, 0x2f7bff, 0x7fe6ff, 0x3aa0ff][k]); tr.position.copy(P4); scene.add(tr); trails4.push(tr);
}
for (let k = 0; k < 2; k++) {
  const tr = makeTrail([V(-6, -1.6 + k * 0.5, -3), V(-2, -0.7 + k * 0.3, -1.6), V(0, -0.45 + k * 0.9, -1.2), V(2.2, 0.2 + k * 0.6, -1.8), V(6, 1.0 + k * 0.4, -3.5)], 0.006, k ? 0x2f6bff : 0x34d2ff);
  tr.position.copy(P4); scene.add(tr); trails4.push(tr);
}
// scene-5 energy lines phone -> gate
const PH5 = V(-0.42, 0.92, 3.3);
const energy = [
  makeTrail([V(-0.42, 0.9, 3.28), V(-0.85, 0.85, 2.4), V(-0.8, 0.7, 1.4), V(-0.66, 0.62, 0.72)], 0.004, 0x40d4ff),
  makeTrail([V(-0.4, 0.97, 3.28), V(-0.2, 1.3, 2.6), V(0.45, 1.05, 1.5), V(0.66, 0.62, 0.72)], 0.004, 0x3f86ff),
  makeTrail([V(-0.42, 0.86, 3.28), V(-0.5, 0.4, 2.6), V(-0.15, 0.05, 1.6), V(0, 0.01, 0.8)], 0.003, 0x7fe3ff),
  makeTrail([V(-0.45, 0.99, 3.28), V(-1.3, 1.4, 2.2), V(-1.0, 1.2, 0.6), V(-0.66, 1.0, -0.2)], 0.003, 0x34b8ff),
];
energy.forEach(e => main.add(e));

/* ---------------- shots ---------------- */
function lookFrom(pos, tgt, fov, roll = 0) { camera.position.copy(pos); camera.up.set(Math.sin(roll), Math.cos(roll), 0); camera.lookAt(tgt); camera.fov = fov; camera.updateProjectionMatrix(); }
const IMPACTS = [0.35, 2.55, 2.8, 4.0, 6.15, 6.6, 7.05, 8.05, 9.5, 11.0, 12.9, 15.0, 22.0, 24.2];
function shake(t) {
  let a = 0; for (const i of IMPACTS) if (t >= i) a = Math.max(a, Math.exp(-(t - i) * 9) * 1.0);
  return V(noise1(t * 40) * a, noise1(t * 40 + 50) * a, 0).multiplyScalar(0.012);
}
const heroZ3 = t => -2.0 + 1.35 * (t - 10.5);

function shots(t) {
  const sh = shake(t);
  const hand = new THREE.Vector3();
  // ---------- SCENE 1 ----------
  if (t < 1.55) { const u = ramp(t, 0, 1.55); return lookFrom(V(lerp(-1.2, -0.95, u), lerp(1.24, 1.16, u), lerp(1.25, 1.02, u)).add(sh), V(-0.62, 0.95, 0.6), 32, -0.05); }
  if (t < 2.4) { const u = eInOutSine(ramp(t, 1.55, 2.4)); return lookFrom(V(lerp(1.9, 1.55, u), lerp(0.32, 0.48, u), lerp(-1.7, -1.05, u)).add(sh), V(0, 0.6, 0.15), 34, 0.04); }
  if (t < 4.0) { const u = eOutExpo(ramp(t, 2.4, 3.05)), v = ramp(t, 3.05, 4.0); return lookFrom(V(lerp(0.3, 0.05, u), lerp(1.7, 1.02, u), lerp(7.5, 2.9, u) - 0.35 * v).add(sh.multiplyScalar(2)), V(0, lerp(0.55, 0.62, u), 0), lerp(30, 38, u), 0); }
  // ---------- SCENE 2 ----------
  if (t < 8.05) {
    const pz = hero.root.position;
    if (t < 4.95) { const u = ramp(t, 4.0, 4.95); return lookFrom(V(pz.x + 1.35 - 0.15 * u, 1.3, pz.z + 2.1).add(sh), V(pz.x - 0.05, 1.05, pz.z + 0.1), 36, 0.02); }
    if (t < 5.95) { const u = ramp(t, 4.95, 5.95); return lookFrom(V(READER.x + 0.8 - 0.08 * u, READER.y + 0.38, READER.z + 0.6 - 0.05 * u).add(sh.multiplyScalar(0.3)), V(READER.x - 0.08, READER.y + 0.12, READER.z - 0.18), 32, 0); }
    if (t < 6.9) { const u = ramp(t, 5.95, 6.9); return lookFrom(V(C2.x + 2.4 - 0.3 * u, 2.1, STOP2.z - 4.2 + 0.4 * u).add(sh), V(C2.x + 0.1, 0.95, STOP2.z - 0.6), 36, 0); }
    { const u = ramp(t, 6.9, 8.05); return lookFrom(V(C2.x - 0.05, 0.42, 1.9 - 0.25 * u).add(sh), V(C2.x + 0.15, 0.95, STOP2.z - 1.0), 34, 0); }
  }
  // ---------- SCENE 3 ----------
  if (t < 15.0) {
    const z = heroZ3(t);
    if (t < 9.4) { const u = ramp(t, 8.05, 9.4); return lookFrom(V(2.2, 1.05, z + 0.1 + 0.15 * u).add(sh), V(-0.2, 0.9, z + 0.5), 36, 0); }
    if (t < 10.45) { const u = ramp(t, 9.4, 10.45); return lookFrom(V(0.15, 0.48 + 0.02 * u, 3.3 + 0.3 * u).add(sh), V(-0.6, 0.85, -2.0), 33, 0); }
    if (t < 11.0) { return lookFrom(V(3.0, 1.0, z + 1.0).add(sh), V(0, 0.75, z + 1.35), 36, 0); }
    if (t < 11.95) { const u = ramp(t, 11.0, 11.95); return lookFrom(V(0.25 - 0.05 * u, 1.6 - 0.1 * u, 1.75 - 0.15 * u).add(sh), V(-0.25, 0.45, -0.2), 34, 0); }
    if (t < 13.6) { const u = ramp(t, 11.95, 13.6); return lookFrom(V(-1.6 + 0.2 * u, 0.32, 2.7 + 0.9 * u).add(sh), V(0.35, 0.85, 0.2 + 0.6 * u), 34, 0); }
    { const u = ramp(t, 13.6, 15.0), push = eOutExpo(ramp(t, 14.72, 15.0)); return lookFrom(V(-0.5 + 0.2 * u, 1.45 + 0.25 * u, -3.4 + 0.5 * u + 2.0 * push).add(sh), V(0.25, 0.85, 2.4), 36 - 10 * push, 0); }
  }
  // ---------- SCENE 4 (phone) ----------
  if (t < 22.0) {
    const c = phone.position;
    if (t < 16.9) { const u = eOutCubic(ramp(t, 15.0, 16.9)); return lookFrom(V(c.x - 0.42 + 0.0, c.y + 0.02, c.z + lerp(2.3, 1.95, u)).add(sh), V(c.x - 0.42, c.y, c.z), 35, 0); }
    if (t < 18.2) { const u = eInOutSine(ramp(t, 16.9, 18.2)); return lookFrom(V(c.x + lerp(0.25, 0.08, u), c.y + 0.3, c.z + lerp(0.95, 0.85, u)), V(c.x - 0.02, c.y + 0.24, c.z), 32, 0); }
    if (t < 19.5) { const u = eInOutSine(ramp(t, 18.2, 19.5)); return lookFrom(V(c.x + lerp(-0.2, -0.05, u), c.y + 0.04, c.z + lerp(1.2, 1.1, u)), V(c.x, c.y - 0.02, c.z), 32, 0); }
    if (t < 21.0) { const u = eInOutSine(ramp(t, 19.5, 21.0)); return lookFrom(V(c.x - 0.36, c.y + lerp(0.12, -0.02, u), c.z + 1.55), V(c.x - 0.36, c.y + lerp(0.1, -0.04, u), c.z), 34, 0); }
    { const u = eInOutSine(ramp(t, 21.0, 22.0)); return lookFrom(V(c.x + 0.05, c.y + 0.1, c.z + lerp(1.2, 1.7, u)), V(c.x, c.y + 0.08, c.z), 33, 0); }
  }
  // ---------- SCENE 5 (hero) ----------
  { const u = eInOutSine(ramp(t, 22.0, 30.0)); return lookFrom(V(lerp(0.15, 0.05, u), lerp(1.06, 1.0, u), lerp(4.8, 4.38, u)).add(sh), V(-0.15, 0.78, 1.2), 38, 0); }
}

/* ---------------- per-frame state ---------------- */
function setTrail(tr, head, len, inten, base = 0) { const U = tr.userData.U; U.head.value = head; U.len.value = len; U.inten.value = inten; U.base.value = base; tr.visible = inten > 0 && (head > -0.05 || base > 0); }

function update(t) {
  const S = t < 4 ? 1 : t < 8.05 ? 2 : t < 15 ? 3 : t < 22 ? 4 : 5;
  main.visible = S === 1 || S === 3 || S === 5;
  conv.visible = S === 2; q1.root.visible = q2.root.visible = S === 2;
  hero.root.visible = S === 2 || S === 3;
  phone.visible = S === 4 || S === 5;
  mirror.visible = floor.visible = S !== 4;
  backdrop.visible = S === 4; trails4.forEach(x => x.visible = S === 4);
  scene.fog.density = S === 4 ? 0.0 : S === 2 ? 0.07 : 0.05;
  key.visible = rimL.visible = rimR.visible = S === 1 || S === 3 || S === 5;
  streakL1.visible = streakL2.visible = S === 1;
  convKey.visible = convRim.visible = S === 2;
  phoneKey.visible = phoneRim.visible = phoneRim2.visible = S === 4 || S === 5;
  cardLight.visible = S === 3;
  for (const s of shafts) s.userData.U.uTime.value = t;
  // defaults
  scanU.uScanAmt.value = 0; wireU.uWire.value = 0; GU.setOpen(0);
  GU.navy.emissiveIntensity = 0; GU.xMat.emissiveIntensity = 1.4; GU.xMat.color.setHex(0xc8141c);
  GU.edgeMat.color.setRGB(0.2, 0.75, 1.0).multiplyScalar(0.6);
  trails1.forEach(x => x.visible = false); energy.forEach(x => x.visible = false);
  waves.forEach(w => w.visible = false); ripples.forEach(w => w.visible = false);
  beams.forEach(b => { main.remove(b); b.geometry.dispose(); }); beams = [];
  hero.cardMat.emissiveIntensity = 0; cardLight.intensity = 0;
  let flash = 0, fade = 1;
  bloom.strength = 0.75;

  if (S === 1) {
    const lit = ramp(t, 0.35, 1.4), slam = ramp(t, 2.5, 2.65);
    key.intensity = 25 * lit * 0.35 + 70 * slam; rimL.intensity = 40 * lit + 60 * slam; rimR.intensity = 30 * lit + 50 * slam;
    hemi.intensity = 0.1 + 0.25 * slam;
    shafts.forEach(s => s.userData.U.amt.value = 0.22 * slam);
    trails1.forEach((tr, k) => {
      const a = 0.35 + k * 0.07, h = ramp(t, a, a + 0.9 + k * 0.1) * 1.35; setTrail(tr, h, 0.28, 5);
      if (t > 2.45 && k < 2) setTrail(tr, ramp(t, 2.45, 3.4) * 1.35, 0.3, 4);
    });
    const p1 = trails1[0].userData.curve.getPointAt(clamp(trails1[0].userData.U.head.value));
    const p2 = trails1[1].userData.curve.getPointAt(clamp(trails1[1].userData.U.head.value));
    streakL1.position.copy(p1); streakL2.position.copy(p2); streakL1.intensity = streakL2.intensity = 6 * win(t, 0.35, 2.6, 0.1, 0.4);
    scanU.uScanY.value = lerp(-0.05, 1.1, eInOutSine(ramp(t, 1.6, 2.35)));
    scanU.uScanAmt.value = win(t, 1.55, 2.7, 0.1, 0.3); wireU.uWire.value = win(t, 1.55, 2.6, 0.1, 0.35) * 0.9;
    GU.navy.emissiveIntensity = 0.9 * Math.exp(-Math.max(0, t - 2.55) * 3) * (t > 2.55 ? 1 : 0);
    flash = 0.5 * Math.exp(-Math.max(0, t - 0.35) * 14) * (t > 0.35 ? 1 : 0) + 0.35 * Math.exp(-Math.max(0, t - 2.55) * 10) * (t > 2.55 ? 1 : 0);
    fade = ramp(t, 0.3, 0.42);
    hero.root.visible = false;
  }

  if (S === 2) {
    convKey.intensity = 55; convRim.intensity = 30; hemi.intensity = 0.3;
    // hero walks in, decelerates, taps
    const v0 = 1.35;
    const s = t < 4.7 ? v0 * (t - 3.6) : v0 * 1.1 + v0 * (t - 4.7) - v0 * Math.pow(t - 4.7, 2) / (2 * 0.5) * (t < 5.2 ? 1 : 0);
    const sEnd = v0 * 1.1 + v0 * 0.25;
    const dist = t < 5.2 ? s : sEnd, vel = t < 4.7 ? 1 : clamp(1 - (t - 4.7) / 0.5);
    hero.root.position.set(STOP2.x, 0, STOP2.z - sEnd + dist); hero.root.rotation.y = 0;
    poseWalk(hero, dist / 1.46 * Math.PI * 2, vel, 1);
    const tap = eio(ramp(t, 5.05, 5.4)) * (1 - eio(ramp(t, 6.55, 6.95)));
    poseTap(hero, tap);
    hero.cardMat.emissiveIntensity = 0;
    // reader LED: red, blink (denied), then green
    const led = cg.userData.led.color;
    if (t < 5.45) led.setRGB(3, 0.12, 0.08);
    else if (t < 5.95) led.setRGB(Math.floor((t - 5.45) * 12) % 2 ? 0.3 : 4, 0.12, 0.08);
    else led.setRGB(0.15, 3.2, 0.6);
    cg.userData.armP.rotation.y = -eio(ramp(t, 6.1, 6.6)) * Math.PI / 2;
    // queue forms behind
    const qp = (P, stopZ, tStop, speed, ph0) => {
      const tt = Math.min(t, tStop) - 3.6; const decel = clamp((tStop - t) / 0.45);
      const z = stopZ - speed * (tStop - 3.6) + speed * tt;
      P.root.position.set(STOP2.x + 0.03 * Math.sin(ph0), 0, z);
      poseWalk(P, z / 1.46 * Math.PI * 2 + ph0, t < tStop ? Math.min(1, decel + 0.3) : 0, 0);
      P.hips.rotation.z = 0.02 * Math.sin(t * 1.3 + ph0); P.head.rotation.y = 0.15 * noise1(t * 0.7 + ph0);
    };
    qp(q1, STOP2.z - 1.05, 5.75, 1.25, 1.3);
    qp(q2, STOP2.z - 2.0, 6.3, 1.2, 2.2);
    if (t > 6.4) { const a = eio(ramp(t, 6.4, 6.8)); q2.arms[0].sh.rotation.x = -0.9 * a; q2.arms[0].el.rotation.x = -1.4 * a; q2.arms[0].sh.rotation.z = -0.3 * a; q2.head.rotation.x = 0.4 * a; }
    flash = 0.25 * Math.exp(-(t - 4.0) * 12) + 0.15 * Math.exp(-Math.max(0, t - 6.15) * 10) * (t > 6.15 ? 1 : 0);
    for (const x of [6.6, 7.05]) flash += 0.12 * Math.exp(-Math.max(0, t - x) * 10) * (t > x ? 1 : 0);
    flash += 0.7 * Math.exp(-Math.pow((t - 8.03) / 0.05, 2));
  }

  if (S === 3) {
    key.intensity = 75; rimL.intensity = 70; rimR.intensity = 55; hemi.intensity = 0.32;
    shafts.forEach(s => s.userData.U.amt.value = 0.2);
    const z = heroZ3(t);
    hero.root.position.set(0, 0, z); hero.root.rotation.y = 0;
    poseWalk(hero, (z + 10) / 1.46 * Math.PI * 2, 1, 1);
    // detection
    const det = ramp(t, 10.25, 10.5);
    const card = new THREE.Vector3(); hero.card.getWorldPosition(card);
    hero.cardMat.emissiveIntensity = 1.6 * win(t, 10.35, 11.4, 0.15, 0.4) + 0.25 * ramp(t, 10.35, 10.6) * (1 - ramp(t, 13.5, 14));
    cardLight.position.copy(card); cardLight.intensity = 0.35 * win(t, 10.35, 11.4, 0.15, 0.4);
    waves.forEach((w, i) => {
      const t0 = 10.2 + i * 0.13, a = t - t0;
      if (a < 0 || a > 0.9) return;
      w.visible = true; const r = 0.15 + a * 2.6; w.scale.set(r, r * 0.75, 1);
      w.position.set(0, 0.62, 0.74 + a * 1.4); w.material.opacity = (1 - a / 0.9) * 0.9; w.material.color.setRGB(0.2, 0.8, 1.0).multiplyScalar(2.5);
    });
    ripples.forEach((w, i) => {
      const t0 = 10.15 + i * 0.16, a = t - t0;
      if (a < 0 || a > 1.0) return;
      w.visible = true; const r = 0.2 + a * 2.2; w.scale.set(r, r, 1); w.material.opacity = (1 - a) * 0.7; w.material.color.setRGB(0.2, 0.8, 1.0).multiplyScalar(2);
    });
    const bAmt = win(t, 10.3, 11.1, 0.1, 0.3);
    if (bAmt > 0) for (const sx of [-0.66, 0.66]) {
      const from = V(sx * 0.82, 0.62, 0.74), mid = from.clone().lerp(card, 0.5).add(V(0, 0.12, 0));
      const g = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(from, mid, card), 40, 0.0025, 6);
      const b = new THREE.Mesh(g, beamMat); beamMat.opacity = bAmt * 0.9; beamMat.color.setRGB(0.2, 0.8, 1.0).multiplyScalar(3); main.add(b); beams.push(b);
    }
    GU.navy.emissiveIntensity = 1.6 * win(t, 10.45, 11.4, 0.1, 0.4) + 0.45 * ramp(t, 10.6, 11.0) * (1 - ramp(t, 14.0, 14.6));
    const ok = ramp(t, 10.95, 11.05);
    GU.xMat.emissiveIntensity = lerp(1.4, 0.0, ok); GU.xMat.color.setRGB(lerp(0.78, 0.12, ok), lerp(0.08, 0.12, ok), lerp(0.11, 0.14, ok));
    const open = eio(ramp(t, 11.05, 11.55)) * (1 - eio(ramp(t, 13.45, 13.95)));
    GU.setOpen(open);
    GU.edgeMat.color.setRGB(0.2, 0.75, 1.0).multiplyScalar(0.6 + 2.5 * win(t, 11.0, 11.8, 0.1, 0.4));
    flash = 0.6 * Math.exp(-Math.max(0, t - 8.05) * 9);
    flash += 0.12 * Math.exp(-Math.max(0, t - 9.5) * 10) * (t > 9.5 ? 1 : 0) + 0.12 * Math.exp(-Math.max(0, t - 11.0) * 10) * (t > 11 ? 1 : 0) + 0.12 * Math.exp(-Math.max(0, t - 12.9) * 10) * (t > 12.9 ? 1 : 0);
    flash += 0.9 * ramp(t, 14.85, 15.0);
  }

  // phone placement
  PU.U.uTime.value = t;
  if (S === 4) {
    phone.position.copy(P4).add(V(0, 0.015 * Math.sin(t * 1.6), 0));
    const yaw = t < 16.9 ? lerp(-1.0, -0.3, eOutCubic(ramp(t, 15.0, 16.4))) : t < 18.2 ? lerp(-0.22, 0.05, ramp(t, 16.9, 18.2)) : t < 19.5 ? lerp(0.28, 0.12, ramp(t, 18.2, 19.5)) : t < 21 ? lerp(-0.32, -0.2, ramp(t, 19.5, 21)) : lerp(0.1, -0.25, ramp(t, 21, 22));
    const pitch = t < 16.9 ? lerp(0.25, 0.04, eOutCubic(ramp(t, 15.0, 16.4))) : 0.05 * Math.sin(t * 0.9);
    phone.rotation.set(pitch, yaw, t < 16.9 ? lerp(-0.12, -0.03, eOutCubic(ramp(t, 15, 16.4))) : 0.02 * Math.sin(t));
    phone.position.y += t < 16.9 ? lerp(-0.25, 0, eOutCubic(ramp(t, 15.0, 16.2))) : 0;
    phone.scale.setScalar(1);
    phoneKey.position.copy(P4).add(V(-2.2, 2.8, 2.6)); phoneKey.target.position.copy(P4); phoneKey.intensity = 30;
    phoneRim.position.copy(P4).add(V(2.4, 1.2, -2.2)); phoneRim.target.position.copy(P4); phoneRim.intensity = 45;
    phoneRim2.position.copy(P4).add(V(-2.4, -0.6, -2.0)); phoneRim2.target.position.copy(P4); phoneRim2.intensity = 35;
    trails4.forEach((tr, k) => { const sp = k < 4 ? 0.32 + k * 0.05 : 0.45; setTrail(tr, ((t - 15 + k * 0.9) * sp) % 1.3, k < 4 ? 0.35 : 0.5, k < 4 ? 3.2 : 2.5, 0.0); });
    PU.sheenU.off.value = yaw * 0.6 + (t - 15) * 0.05;
    flash = 0.85 * Math.exp(-(t - 15.0) * 9) + 0.1 * Math.exp(-Math.max(0, t - 15.5) * 10) * (t > 15.5 ? 1 : 0) + 0.1 * Math.exp(-Math.max(0, t - 19.65) * 10) * (t > 19.65 ? 1 : 0);
    flash += 0.7 * Math.exp(-Math.pow((t - 21.99) / 0.05, 2));
    bloom.strength = 0.55;
  }
  // screen schedule
  const SCR = [[15.0, 'home'], [16.95, 'card'], [18.2, 'report'], [18.75, 'reportmodal'], [19.5, 'history'], [21.0, 'profile'], [22.0, 'home']];
  let A = 'home', B = 'home', p = 0;
  for (let i = 0; i < SCR.length; i++) { if (t >= SCR[i][0]) { A = i ? SCR[i - 1][1] : SCR[i][1]; B = SCR[i][1]; p = ramp(t, SCR[i][0], SCR[i][0] + 0.25); if (i === SCR.length - 1 || i === 0) p = 1; } }
  PU.U.tA.value = tex[A]; PU.U.tB.value = tex[B]; PU.U.p.value = p;
  // highlights + floating elements
  const HL = [['el-tapless', 15.4, 16.25], ['el-notif', 16.25, 16.9], ['el-vcard', 17.25, 18.15], ['el-modal', 18.95, 19.5], ['el-row1', 19.85, 20.95], ['el-sec', 21.2, 22.0]];
  PU.U.hlAmt.value = 0;
  for (const f of Object.values(PU.floats)) f.visible = false;
  if (S === 4) for (const [id, a, b] of HL) {
    const w = win(t, a, b, 0.2, 0.2); if (w <= 0) continue;
    const r = rects[id]; PU.U.hl.value.set(r.x, r.y, r.w, r.h); PU.U.hlR.value = id === 'el-vcard' ? 17 : 13; PU.U.hlAmt.value = w * 0.9;
    const f = PU.floats[id]; f.visible = true; f.userData.U.amt.value = w;
    const lift = eOutCubic(ramp(t, a, a + 0.35)) * (1 - eio(ramp(t, b - 0.2, b)));
    f.position.copy(f.userData.home).add(V(0, 0, 0.09 * lift)); f.scale.setScalar(1 + 0.07 * lift);
    f.userData.U.amt.value = Math.min(1, lift * 4);
  }

  if (S === 5) {
    key.intensity = 95; rimL.intensity = 90; rimR.intensity = 75; hemi.intensity = 0.4;
    shafts.forEach(s => s.userData.U.amt.value = 0.24 + 0.1 * ramp(t, 24.1, 24.3) * Math.exp(-(t - 24.2) * 2));
    phone.position.copy(PH5).add(V(0, 0.02 * Math.sin(t * 1.3), 0)); phone.scale.setScalar(0.42);
    phone.rotation.set(0.02, 0.32 + 0.05 * Math.sin(t * 0.6), 0.03);
    phoneKey.position.copy(PH5).add(V(-1.2, 2.0, 1.6)); phoneKey.target.position.copy(PH5); phoneKey.intensity = 10;
    phoneRim.position.copy(PH5).add(V(1.4, 0.6, -1.6)); phoneRim.target.position.copy(PH5); phoneRim.intensity = 18;
    phoneRim2.intensity = 0;
    PU.sheenU.off.value = 0.25 + (t - 22) * 0.04;
    GU.xMat.emissiveIntensity = 0; GU.xMat.color.setRGB(0.12, 0.12, 0.14);
    const conn = ramp(t, 22.3, 23.4);
    GU.navy.emissiveIntensity = 0.55 * conn + 1.2 * Math.exp(-Math.max(0, t - 24.2) * 2.5) * (t > 24.2 ? 1 : 0);
    energy.forEach((e, k) => {
      const draw = ramp(t, 22.3 + k * 0.12, 23.3 + k * 0.12);
      const loop = ((t - 22 + k * 0.37) * 0.8) % 1;
      if (draw < 1) setTrail(e, draw * 1.1, 1.1, 3.2);
      else setTrail(e, loop * 1.2, 0.22, 4.0, 0.12);
    });
    flash = 0.55 * Math.exp(-(t - 22.0) * 8) + 0.6 * Math.exp(-Math.max(0, t - 24.2) * 6) * (t > 24.2 ? 1 : 0);
    fade = 1 - ramp(t, 29.15, 29.95);
  }
  finalPass.uniforms.uFlash.value = flash;
  finalPass.uniforms.uFade.value = fade;
  finalPass.uniforms.uTime.value = t;
  return fade;
}

window.renderFrame = (f) => {
  const t = f / FPS;
  const fade = update(t);
  shots(t);
  composer.render();
  drawOverlay(octx, t, fade);
  return true;
};
await loadFonts();
// warm-up (compile all shader permutations)
for (const tt of [0.5, 2.0, 5, 10.5, 16, 23, 25]) window.renderFrame(tt * FPS);
window.ready = true;
