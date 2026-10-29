import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const { Mesh, Group } = THREE;

/* ---------- shared scan uniforms (digital scan over the AYVETO gate) ---------- */
export const scanU = {
  uScanY: { value: -10 }, uScanAmt: { value: 0 }, uScanColor: { value: new THREE.Color(0.15, 0.75, 1.0) },
};
function addScan(mat) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, scanU);
    sh.vertexShader = 'varying vec3 vWPosS;\n' + sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n vWPosS = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform float uScanY; uniform float uScanAmt; uniform vec3 uScanColor; varying vec3 vWPosS;\n' +
      sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { float d = vWPosS.y - uScanY;
        float line = exp(-abs(d) * 140.0) * 7.0;
        float below = step(d, 0.0) * exp(d * 7.0) * 0.18;
        float grid = smoothstep(0.90, 1.0, fract(vWPosS.y * 36.0)) * step(d, 0.0) * exp(d * 9.0) * 0.55;
        totalEmissiveRadiance += uScanColor * (line + below + grid) * uScanAmt; }`);
  };
  mat.customProgramCacheKey = () => 'scan';
  return mat;
}

const wireMat = new THREE.ShaderMaterial({
  uniforms: { ...scanU, uWire: { value: 0 } },
  vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `uniform float uScanY; uniform float uWire; uniform vec3 uScanColor; varying vec3 vW;
    void main(){ float d = vW.y - uScanY; float a = uWire*(step(d,0.0)*exp(d*4.0)*0.9 + exp(-abs(d)*50.0)*2.5);
      gl_FragColor = vec4(uScanColor*a, 1.0); }`,
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
});
export const wireU = wireMat.uniforms;

function profile(r, h, b, steps = 6, dense = false) {
  const p = [new THREE.Vector2(0, 0), new THREE.Vector2(r - b, 0)];
  for (let i = 1; i <= steps; i++) { const a = (i / steps) * Math.PI / 2; p.push(new THREE.Vector2(r - b + Math.sin(a) * b, b - Math.cos(a) * b)); }
  if (dense) for (let y = 0.1; y < h - b; y += 0.1) p.push(new THREE.Vector2(r, y));
  for (let i = 0; i <= steps; i++) { const a = (i / steps) * Math.PI / 2; p.push(new THREE.Vector2(r - b + Math.cos(a) * b, h - b + Math.sin(a) * b)); }
  p.push(new THREE.Vector2(0, h));
  return p;
}
const lathe = (r, h, b) => new THREE.LatheGeometry(profile(r, h, b), 96);
const latheWire = (r, h, b) => new THREE.WireframeGeometry(new THREE.LatheGeometry(profile(r * 1.006, h + 0.002, b, 2, true), 20));

/* ---------- AYVETO gate: rebuilt from the supplied Tinkercad prototype ---------- */
export function makeGate() {
  const g = new Group();
  const white = addScan(new THREE.MeshPhysicalMaterial({ color: 0xe9edf2, roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1 }));
  const navy = addScan(new THREE.MeshPhysicalMaterial({ color: 0x0b2d4f, roughness: 0.26, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.06, emissive: 0x0aa8ff, emissiveIntensity: 0 }));
  const xMat = new THREE.MeshStandardMaterial({ color: 0xc8141c, emissive: 0xff1822, emissiveIntensity: 1.4, roughness: 0.35 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x8fc6ec, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.4, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.6 });
  const edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.75, 1.0) });
  const flaps = [];
  const cast = m => { m.castShadow = true; m.receiveShadow = true; return m; };
  for (const s of [-1, 1]) {
    const u = new Group(); u.position.x = s * 0.66; g.add(u);
    const body = cast(new Mesh(lathe(0.2, 0.985, 0.014), white)); body.scale.z = 2.75; u.add(body);
    const bw = new THREE.LineSegments(latheWire(0.2, 0.985, 0.014), wireMat); bw.scale.z = 2.75; u.add(bw);
    const bandB = new Mesh(new THREE.CylinderGeometry(0.2035, 0.2035, 0.21, 96, 1, true), navy); bandB.position.y = 0.615; bandB.scale.z = 2.75; u.add(bandB);
    for (const z of [-0.55, 0.55]) {
      const c = cast(new Mesh(lathe(0.165, 1.0, 0.014), white)); c.position.z = z; u.add(c);
      const cw = new THREE.LineSegments(latheWire(0.165, 1.0, 0.014), wireMat); cw.position.z = z; u.add(cw);
      const band = new Mesh(new THREE.CylinderGeometry(0.1685, 0.1685, 0.21, 96, 1, true), navy); band.position.set(0, 0.615, z); u.add(band);
      const xg = new Group(); xg.position.set(0, 1.0012, z);
      for (const a of [Math.PI / 4, -Math.PI / 4]) { const bar = new Mesh(new RoundedBoxGeometry(0.11, 0.003, 0.026, 2, 0.0012), xMat); bar.rotation.y = a; xg.add(bar); }
      u.add(xg);
    }
    const piv = new Group(); piv.position.set(-s * 0.2, 0, 0.05); u.add(piv);
    const fl = new Mesh(new RoundedBoxGeometry(0.44, 0.44, 0.016, 2, 0.006), glass); fl.position.set(-s * 0.22, 0.52, 0); fl.renderOrder = 2; piv.add(fl);
    const e1 = new Mesh(new THREE.BoxGeometry(0.004, 0.43, 0.017), edgeMat); e1.position.set(-s * 0.438, 0.52, 0); piv.add(e1);
    const e2 = new Mesh(new THREE.BoxGeometry(0.43, 0.004, 0.017), edgeMat); e2.position.set(-s * 0.22, 0.738, 0); piv.add(e2);
    flaps.push({ piv, s });
  }
  g.userData = {
    white, navy, xMat, glass, edgeMat, flaps,
    setOpen(a) { for (const f of flaps) f.piv.rotation.y = f.s * a * Math.PI / 2; },
  };
  return g;
}

/* ---------- conventional swing-arm gate with tap reader (problem scene) ---------- */
export function makeConvGate() {
  const g = new Group();
  const steel = new THREE.MeshPhysicalMaterial({ color: 0x9aa1aa, metalness: 0.92, roughness: 0.36 });
  const dark = new THREE.MeshPhysicalMaterial({ color: 0x101318, metalness: 0.2, roughness: 0.18, clearcoat: 1 });
  const led = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.15, 0.1) });
  for (const s of [-1, 1]) {
    const cab = new Mesh(new RoundedBoxGeometry(0.28, 0.98, 0.9, 4, 0.03), steel); cab.position.set(s * 0.47, 0.49, 0); cab.castShadow = cab.receiveShadow = true; g.add(cab);
    const top = new Mesh(new RoundedBoxGeometry(0.29, 0.025, 0.91, 2, 0.008), dark); top.position.set(s * 0.47, 0.99, 0); g.add(top);
  }
  // reader on right cabinet, front-top
  const reader = new Group(); reader.position.set(0.47, 1.0, -0.3); reader.rotation.x = -0.5; g.add(reader);
  const rb = new Mesh(new RoundedBoxGeometry(0.11, 0.035, 0.15, 3, 0.01), dark); rb.position.y = 0.02; reader.add(rb);
  const ring = new Mesh(new THREE.TorusGeometry(0.03, 0.0025, 8, 48), new THREE.MeshBasicMaterial({ color: 0x6b7480 })); ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.039, 0.01); reader.add(ring);
  const ledM = new Mesh(new THREE.BoxGeometry(0.07, 0.006, 0.008), led); ledM.position.set(0, 0.039, -0.06); reader.add(ledM);
  // swing arm bar
  const armP = new Group(); armP.position.set(0.33, 0.86, -0.05); g.add(armP);
  const hub = new Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 24), steel); hub.rotation.z = Math.PI / 2; hub.position.x = 0.01; armP.add(hub);
  const arm = new Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.6, 20), steel); arm.rotation.z = Math.PI / 2; arm.position.x = -0.3; arm.castShadow = true; armP.add(arm);
  g.userData = { reader, led, armP };
  return g;
}

/* ---------- professional office worker (replaces the yellow-shirt figure) ---------- */
export function makePerson(c) {
  const P = { root: new Group() };
  const mat = (col, r = 0.6, extra = {}) => new THREE.MeshPhysicalMaterial({ color: col, roughness: r, metalness: 0, sheen: extra.sheen ?? 0, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x7f93b8), clearcoat: extra.cc ?? 0, clearcoatRoughness: 0.2 });
  const suit = mat(c.suit, 0.62, { sheen: 0.35 }), shirt = mat(c.shirt, 0.55), pants = mat(c.pants, 0.7, { sheen: 0.2 }),
    skin = mat(c.skin, 0.5, { sheen: 0.15 }), hair = mat(c.hair, 0.55), shoes = mat(0x0b0b0d, 0.2, { cc: 1 }), tie = mat(c.tie ?? 0x0b1830, 0.4);
  const add = (parent, geo, m, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) => {
    const o = new Mesh(geo, m); o.position.set(...p); o.rotation.set(...r); o.scale.set(...s); o.castShadow = true; parent.add(o); return o;
  };
  const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 8, 20);
  const hips = new Group(); hips.position.y = 0.95; P.root.add(hips); P.hips = hips;
  add(hips, cap(0.14, 0.13), pants, [0, -0.02, 0], [0, 0, Math.PI / 2], [1, 1, 0.72]);
  P.legs = [];
  for (const s of [-1, 1]) {
    const th = new Group(); th.position.set(s * 0.095, -0.03, 0); hips.add(th);
    add(th, cap(0.072, 0.36), pants, [0, -0.22, 0]); add(th, new THREE.SphereGeometry(0.074, 18, 12), pants, [0, 0, 0]);
    const kn = new Group(); kn.position.y = -0.44; th.add(kn);
    add(kn, cap(0.058, 0.34), pants, [0, -0.2, 0]); add(kn, new THREE.SphereGeometry(0.062, 18, 12), pants, [0, 0, 0]);
    const an = new Group(); an.position.y = -0.43; kn.add(an);
    add(an, new RoundedBoxGeometry(0.1, 0.075, 0.27, 4, 0.032), shoes, [0, -0.04, 0.045]);
    P.legs.push({ th, kn, an });
  }
  const spine = new Group(); spine.position.y = 0.03; hips.add(spine); P.spine = spine;
  add(spine, cap(0.16, 0.3), suit, [0, 0.29, 0], [0, 0, 0], [1.2, 1, 0.66]);
  // shirt V + tie + collar
  const vShape = new THREE.Shape(); vShape.moveTo(-0.058, 0.0); vShape.lineTo(0.058, 0.0); vShape.lineTo(0, -0.2); vShape.closePath();
  add(spine, new THREE.ShapeGeometry(vShape), shirt, [0, 0.57, 0.1065], [-0.1, 0, 0]);
  const tShape = new THREE.Shape(); tShape.moveTo(-0.012, 0); tShape.lineTo(0.012, 0); tShape.lineTo(0.017, -0.13); tShape.lineTo(0, -0.155); tShape.lineTo(-0.017, -0.13); tShape.closePath();
  add(spine, new THREE.ShapeGeometry(tShape), tie, [0, 0.56, 0.1095], [-0.1, 0, 0]);
  add(spine, new THREE.TorusGeometry(0.05, 0.012, 8, 24), shirt, [0, 0.6, 0.0], [Math.PI / 2, 0, 0], [1, 0.9, 1]);
  for (const s of [-1, 1]) add(spine, new THREE.SphereGeometry(0.075, 20, 14), suit, [s * 0.185, 0.5, -0.005], [0, 0, 0], [1.05, 0.8, 0.95]);
  add(spine, new THREE.CylinderGeometry(0.043, 0.047, 0.11, 18), skin, [0, 0.64, -0.005]);
  const head = new Group(); head.position.set(0, 0.765, 0.0); spine.add(head); P.head = head;
  add(head, new THREE.SphereGeometry(0.1, 32, 24), skin, [0, 0, 0], [0, 0, 0], [0.9, 1.15, 1.0]);
  add(head, new THREE.SphereGeometry(0.1, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.5), hair, [0, 0.025, -0.012], [-0.42, 0, 0], [0.97, 1.12, 1.06]);
  add(head, new THREE.ConeGeometry(0.014, 0.04, 12), skin, [0, -0.012, 0.1], [Math.PI / 2 + 0.25, 0, 0]);
  for (const s of [-1, 1]) add(head, new THREE.SphereGeometry(0.022, 12, 10), skin, [s * 0.088, -0.005, -0.005], [0, 0, 0], [0.5, 1, 0.8]);
  P.arms = [];
  for (const s of [-1, 1]) {
    const sh = new Group(); sh.position.set(s * 0.215, 0.495, 0); spine.add(sh);
    add(sh, cap(0.052, 0.23), suit, [0, -0.15, 0]);
    const el = new Group(); el.position.y = -0.3; sh.add(el);
    add(el, cap(0.046, 0.21), suit, [0, -0.12, 0]); add(el, new THREE.SphereGeometry(0.05, 16, 12), suit, [0, 0, 0]);
    add(el, new THREE.CylinderGeometry(0.044, 0.044, 0.03, 18), shirt, [0, -0.255, 0]);
    const wr = new Group(); wr.position.y = -0.27; el.add(wr);
    add(wr, cap(0.03, 0.05), skin, [0, -0.05, 0.004], [0, 0, 0], [0.72, 1, 1.05]);
    add(wr, cap(0.011, 0.03), skin, [0, -0.035, 0.03], [0.5, 0, 0]);
    P.arms.push({ sh, el, wr, s });
  }
  // RFID card in right hand
  const cardTex = makeCardTexture();
  const cardMat = new THREE.MeshPhysicalMaterial({ map: cardTex, roughness: 0.25, clearcoat: 1, emissive: new THREE.Color(0.1, 0.7, 1.0), emissiveIntensity: 0 });
  const card = new Mesh(new RoundedBoxGeometry(0.0856, 0.054, 0.0016, 2, 0.0007), cardMat);
  card.position.set(0, -0.085, 0.03); card.rotation.set(0.1, Math.PI / 2, -1.25);
  if (c.card) P.arms[1].wr.add(card);
  P.card = card; P.cardMat = cardMat;
  return P;
}

function makeCardTexture() {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 324;
  const x = cv.getContext('2d');
  const g = x.createLinearGradient(0, 0, 512, 324); g.addColorStop(0, '#f4f6f9'); g.addColorStop(1, '#dfe5ec');
  x.fillStyle = g; x.fillRect(0, 0, 512, 324);
  x.fillStyle = '#0b2d4f'; x.fillRect(0, 230, 512, 46);
  x.fillStyle = '#1d43b0'; x.fillRect(0, 276, 512, 6);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function poseWalk(P, phase, amt = 1, carry = 1) {
  for (let k = 0; k < 2; k++) {
    const f = phase + (k ? Math.PI : 0), L = P.legs[k];
    L.th.rotation.x = -0.42 * Math.sin(f) * amt;
    L.kn.rotation.x = (0.05 + 0.78 * Math.pow(Math.max(0, Math.cos(f - 0.35)), 1.6)) * amt;
    L.an.rotation.x = (-L.th.rotation.x - L.kn.rotation.x) * 0.55 * amt + 0.1 * Math.sin(f) * amt;
    const A = P.arms[k], swing = (k === 1 ? 0.55 : 1) * (carry && k === 1 ? 0.5 : 1);
    A.sh.rotation.x = 0.3 * Math.sin(f) * amt * swing;
    A.sh.rotation.z = A.s * 0.07;
    A.el.rotation.x = -0.22 - 0.22 * Math.max(0, -Math.sin(f)) * amt - (k === 1 && carry ? 0.35 : 0);
    A.wr.rotation.set(0, 0, 0);
  }
  P.hips.position.y = 0.95 - 0.012 + 0.02 * Math.cos(2 * phase) * amt;
  P.hips.rotation.y = 0.07 * Math.sin(phase) * amt;
  P.spine.rotation.y = -0.11 * Math.sin(phase) * amt;
  P.spine.rotation.x = 0.04 * amt;
  P.head.rotation.set(-0.02, 0.05 * Math.sin(phase) * amt, 0);
}

export function poseTap(P, a) { // blend right arm to card-tap pose
  const A = P.arms[1];
  A.sh.rotation.x = THREE.MathUtils.lerp(A.sh.rotation.x, -0.72, a);
  A.sh.rotation.z = THREE.MathUtils.lerp(A.sh.rotation.z, -0.05, a);
  A.el.rotation.x = THREE.MathUtils.lerp(A.el.rotation.x, -0.95, a);
  A.wr.rotation.x = THREE.MathUtils.lerp(0, 0.25, a);
  P.head.rotation.x = THREE.MathUtils.lerp(P.head.rotation.x, 0.32, a);
  P.spine.rotation.x = THREE.MathUtils.lerp(P.spine.rotation.x, 0.08, a);
}

/* ---------- smartphone with the real AYVETO UI ---------- */
function roundedRectShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function fixUV(geo, w, h) {
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
  uv.needsUpdate = true; return geo;
}

export const UI_W = 390, UI_H = 844;
export function makePhone(tex, rects) {
  const G = new Group();
  const W = 0.485, H = 1.0, D = 0.03, bev = 0.011;
  const frame = new THREE.MeshPhysicalMaterial({ color: 0x2c3442, metalness: 1, roughness: 0.22, clearcoat: 0.6 });
  const backM = new THREE.MeshPhysicalMaterial({ color: 0x141b26, metalness: 0.3, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.15 });
  const body = new Mesh(new THREE.ExtrudeGeometry(roundedRectShape(W - 2 * bev, H - 2 * bev, 0.065), { depth: D, bevelEnabled: true, bevelSize: bev, bevelThickness: bev, bevelSegments: 8, curveSegments: 32 }), [backM, frame]);
  body.position.z = -D / 2; G.add(body);
  // black glass front
  const sw = W - 0.024, sh = H - 0.024;
  const glassBlack = new Mesh(new THREE.ShapeGeometry(roundedRectShape(W - 0.006, H - 0.006, 0.07), 32), new THREE.MeshPhysicalMaterial({ color: 0x020305, roughness: 0.05, clearcoat: 1 }));
  glassBlack.position.z = D / 2 + bev + 0.0004; G.add(glassBlack);
  const U = {
    tA: { value: tex.home }, tB: { value: tex.home }, p: { value: 0 },
    hl: { value: new THREE.Vector4(0, 0, 0, 0) }, hlR: { value: 12 }, hlAmt: { value: 0 }, uTime: { value: 0 }, bright: { value: 0.8 },
  };
  const screenMat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D tA, tB; uniform float p, hlAmt, hlR, uTime, bright; uniform vec4 hl; varying vec2 vUv;
      float rr(vec2 q, vec2 b, float r){ vec2 d = abs(q)-b+r; return length(max(d,0.0))+min(max(d.x,d.y),0.0)-r; }
      void main(){
        float e = p*p*(3.0-2.0*p);
        vec2 uA = (vUv-0.5)*(1.0+0.05*e)+0.5 - vec2(0.08*e,0.0);
        vec2 uB = vUv + vec2(0.14*(1.0-e),0.0);
        vec3 a = texture2D(tA, clamp(uA,0.001,0.999)).rgb, b = texture2D(tB, clamp(uB,0.001,0.999)).rgb;
        vec3 col = mix(a, b, e);
        vec2 px = vec2(vUv.x*${UI_W}.0, (1.0-vUv.y)*${UI_H}.0);
        float d = rr(px - (hl.xy+hl.zw*0.5), hl.zw*0.5 + 3.0, hlR + 3.0);
        float pulse = 0.75 + 0.25*sin(uTime*9.0);
        col += vec3(0.15,0.8,1.0) * hlAmt * (smoothstep(1.6,0.0,abs(d))*1.1 + exp(-max(d,0.0)/7.0)*0.35*step(0.0,d)) * pulse;
        float isl = rr(px - vec2(195.0, 28.0), vec2(61.0, 17.5), 17.5);
        col = mix(vec3(0.0), col, smoothstep(-0.6, 0.6, isl));
        gl_FragColor = vec4(col*bright, 1.0);
      }`,
  });
  const screen = new Mesh(fixUV(new THREE.ShapeGeometry(roundedRectShape(sw, sh, 0.058), 32), sw, sh), screenMat);
  screen.position.z = D / 2 + bev + 0.0012; G.add(screen);
  // glass sheen (fake studio reflection sweep)
  const sheenU = { off: { value: 0 }, amt: { value: 1 } };
  const sheen = new Mesh(fixUV(new THREE.ShapeGeometry(roundedRectShape(W - 0.006, H - 0.006, 0.07), 32), W, H), new THREE.ShaderMaterial({
    uniforms: sheenU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float off, amt; varying vec2 vUv; void main(){ float x = vUv.x*0.8 + vUv.y*0.45 - off;
      float a = exp(-pow((x-0.5)/0.07,2.0))*0.045 + exp(-pow((x-0.72)/0.025,2.0))*0.025; gl_FragColor = vec4(vec3(0.85,0.95,1.0)*a*amt,1.0); }`,
  }));
  sheen.position.z = D / 2 + bev + 0.002; G.add(sheen);
  // camera bump on back + buttons
  const bump = new Mesh(new RoundedBoxGeometry(0.2, 0.2, 0.012, 4, 0.004), new THREE.MeshPhysicalMaterial({ color: 0x1a2230, metalness: 0.4, roughness: 0.2, clearcoat: 1 }));
  bump.position.set(-W / 2 + 0.13, H / 2 - 0.13, -D / 2 - bev - 0.004); G.add(bump);
  const lensM = new THREE.MeshPhysicalMaterial({ color: 0x05070c, metalness: 0.2, roughness: 0.05, clearcoat: 1 });
  for (const [x, y] of [[-0.045, 0.045], [-0.045, -0.045], [0.048, 0]]) {
    const l = new Mesh(new THREE.CylinderGeometry(0.034, 0.036, 0.012, 32), lensM); l.rotation.x = Math.PI / 2;
    l.position.set(bump.position.x + x, bump.position.y + y, bump.position.z - 0.008); G.add(l);
  }
  for (const [x, y, h] of [[W / 2 + 0.004, 0.17, 0.12], [-W / 2 - 0.004, 0.24, 0.06], [-W / 2 - 0.004, 0.13, 0.09]]) {
    const b = new Mesh(new RoundedBoxGeometry(0.008, h, 0.014, 2, 0.003), frame); b.position.set(x, y, 0); G.add(b);
  }
  // floating holographic UI elements (cropped from the real screens)
  const floats = {};
  for (const [id, r] of Object.entries(rects)) {
    const m = 18, radius = { 'el-tapless': 13, 'el-vcard': 17, 'el-row1': 11, 'el-notif': 15, 'el-sec': 16, 'el-modal': 18, 'el-live': 15 }[id] ?? 12;
    const FU = { map: { value: tex[id] }, amt: { value: 0 }, size: { value: new THREE.Vector2(r.w, r.h) }, m: { value: m }, rad: { value: radius } };
    const fw = (r.w + 2 * m) / UI_W * sw, fh = (r.h + 2 * m) / UI_H * sh;
    const fm = new Mesh(new THREE.PlaneGeometry(fw, fh), new THREE.ShaderMaterial({
      uniforms: FU, transparent: true, depthWrite: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform sampler2D map; uniform float amt, m, rad; uniform vec2 size; varying vec2 vUv;
        float rr(vec2 q, vec2 b, float r){ vec2 d = abs(q)-b+r; return length(max(d,0.0))+min(max(d.x,d.y),0.0)-r; }
        void main(){ vec2 px = vec2(vUv.x, 1.0-vUv.y)*(size+2.0*m) - m;
          float d = rr(px - size*0.5, size*0.5, rad);
          vec2 tuv = clamp(px/size, 0.0, 1.0); vec3 c = texture2D(map, vec2(tuv.x, 1.0 - tuv.y)).rgb * 0.8;
          float inside = smoothstep(0.8, -0.8, d);
          float glow = exp(-max(d,0.0)/6.0)*(1.0-inside);
          float rim = smoothstep(1.5, 0.0, abs(d));
          vec3 col = mix(vec3(0.2,0.8,1.0)*1.2, c, inside) + vec3(0.2,0.8,1.0)*rim*0.35;
          float a = (inside + glow*0.3 + rim*0.6)*amt;
          gl_FragColor = vec4(col, clamp(a,0.0,1.0)); }`,
    }));
    fm.userData = { home: new THREE.Vector3(((r.x + r.w / 2) / UI_W - 0.5) * sw, (0.5 - (r.y + r.h / 2) / UI_H) * sh, D / 2 + bev + 0.003), U: FU };
    fm.position.copy(fm.userData.home); fm.renderOrder = 5; fm.visible = false; G.add(fm); floats[id] = fm;
  }
  G.userData = { U, sheenU, floats, sw, sh, screenZ: D / 2 + bev };
  return G;
}

/* ---------- glowing light trail ---------- */
export function makeTrail(points, radius, color, closed = false, segs = 600) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'catmullrom', 0.5);
  const U = { head: { value: -1 }, len: { value: 0.25 }, inten: { value: 4 }, base: { value: 0 }, color: { value: new THREE.Color(color) } };
  const m = new Mesh(new THREE.TubeGeometry(curve, segs, radius, 8, closed), new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float head, len, inten, base; uniform vec3 color; varying vec2 vUv;
      void main(){ float d = head - vUv.x; float a = (d > 0.0 && d < len) ? pow(1.0 - d/len, 2.2) : 0.0;
        a += exp(-abs(d)*900.0)*1.5; a += base;
        gl_FragColor = vec4(color*inten*a + vec3(1.0)*inten*0.25*exp(-abs(d)*600.0), 1.0); }`,
  }));
  m.userData = { U, curve };
  return m;
}

/* ---------- volumetric light shaft ---------- */
export function makeShaft(rTop, rBot, h, color) {
  const U = { amt: { value: 0 }, color: { value: new THREE.Color(color) }, uTime: { value: 0 } };
  const geo = new THREE.CylinderGeometry(rTop, rBot, h, 48, 1, true); geo.translate(0, -h / 2, 0);
  const m = new Mesh(geo, new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(position,1.0);
      vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float amt, uTime; uniform vec3 color; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.5);
        float v = smoothstep(0.0, 0.35, vUv.y) * (0.55 + 0.45*vUv.y);
        float n = 0.85 + 0.15*sin(vUv.x*40.0 + uTime*0.7)*sin(vUv.x*17.0 - uTime*0.4);
        gl_FragColor = vec4(color*f*v*n*amt, 1.0); }`,
  }));
  m.userData = { U }; return m;
}
