// Vault 3D engine: one shared WebGL renderer, many scissored views.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const TINT = {
  gold: ['#b8801a', '#ffd98a'], ember: ['#b3401a', '#ff9a6b'], blue: ['#1f5fbf', '#8ccbff'],
  violet: ['#6a3fc0', '#cdb2ff'], teal: ['#0f8b7a', '#7ef0da'], crim: ['#a3202a', '#ff8a90'], steel: ['#4b5565', '#cfd6e2'],
};
// prize key -> [model, tint, name, value]
const PRIZE = {
  chrono: ['watch', 'gold', 'Gold Chrono Diver', 4200], aurora: ['diamond', 'blue', 'Aurora Solitaire Pendant', 2600],
  steel: ['watch', 'steel', 'Steel Sport Chronograph', 1350], phones: ['phones', 'violet', 'Studio Pro Headphones', 420],
  console: ['console', 'teal', 'Titan Handheld Console', 380], drake: ['card', 'ember', 'Ember Drake Holo Card', 120],
  field: ['watch', 'teal', 'Field Watch Classic', 95], booster: ['pack', 'blue', 'Sealed Booster Pack', 48],
  cr25: ['credit', 'gold', 'Vault Credit', 25], gift: ['gift', 'violet', 'Gift Card', 10], cr5: ['credit', 'gold', 'Vault Credit', 5],
  coupe: ['car', 'crim', 'Apex GT Coupe', 128000], slab: ['card', 'violet', 'Holo Wyrm Graded Slab', 640],
};
const LOGO_URL = new URL('../assets/dt-mark.png', import.meta.url).href;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;

let renderer, canvas, envTex, glowTex, shadowTex, logoTex;
const views = [];

// ---------------------------------------------------------------- helpers
const C = (c) => new THREE.Color(c);
const metal = (c, r = 0.25, m = 1, ei = 1.3) => new THREE.MeshStandardMaterial({ color: c, metalness: m, roughness: r, envMapIntensity: ei });
const glossy = (c, m = 0.6, r = 0.25) => new THREE.MeshPhysicalMaterial({ color: c, metalness: m, roughness: r, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 1.25 });
const basic = (c, o = {}) => new THREE.MeshBasicMaterial(Object.assign({ color: c, toneMapped: false }, o));
const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function radialTex(stops) {
  return canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    stops.forEach(([o, c]) => gr.addColorStop(o, c)); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  });
}
function halo(color, size, opacity) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  s.scale.set(size, size, 1); return s;
}
function shadowBlob(size, y) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.75, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = y; return m;
}

// ---------------------------------------------------------------- particles
function makeParticles(scene, max, { size = 0.07, color = '#ffd98a', ambient = false, spread = 4 } = {}) {
  const pos = new Float32Array(max * 3).fill(-999), col = new Float32Array(max * 3), vel = new Float32Array(max * 3), life = new Float32Array(max), ml = new Float32Array(max);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ map: glowTex, size, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, toneMapped: false });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts);
  const base = C(color); let cursor = 0;
  if (ambient) for (let i = 0; i < max; i++) {
    pos[i * 3] = (Math.random() - 0.5) * spread * 2; pos[i * 3 + 1] = (Math.random() - 0.5) * spread; pos[i * 3 + 2] = (Math.random() - 0.5) * spread;
    vel[i * 3] = (Math.random() - 0.5) * 0.06; vel[i * 3 + 1] = 0.03 + Math.random() * 0.08; vel[i * 3 + 2] = (Math.random() - 0.5) * 0.06; life[i] = ml[i] = Math.random();
  }
  return {
    points: pts,
    emit(n, o, speed = 2.2, up = 2.2, tint = base) {
      for (let k = 0; k < n; k++) {
        const i = cursor++ % max, a = Math.random() * Math.PI * 2, r = Math.random();
        pos[i * 3] = o.x + Math.cos(a) * r * 0.35; pos[i * 3 + 1] = o.y; pos[i * 3 + 2] = o.z + Math.sin(a) * r * 0.35;
        const s = speed * (0.35 + Math.random() * 0.8);
        vel[i * 3] = Math.cos(a) * s * r; vel[i * 3 + 1] = up * (0.5 + Math.random()); vel[i * 3 + 2] = Math.sin(a) * s * r;
        life[i] = ml[i] = 1 + Math.random() * 1.3; col[i * 3] = tint.r; col[i * 3 + 1] = tint.g; col[i * 3 + 2] = tint.b;
      }
    },
    update(dt, t) {
      for (let i = 0; i < max; i++) {
        if (ambient) {
          pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
          if (pos[i * 3 + 1] > spread * 0.5) pos[i * 3 + 1] = -spread * 0.5;
          const f = 0.35 + 0.65 * Math.abs(Math.sin(t * 0.7 + i)); col[i * 3] = base.r * f; col[i * 3 + 1] = base.g * f; col[i * 3 + 2] = base.b * f; continue;
        }
        if (life[i] <= 0) continue;
        life[i] -= dt; vel[i * 3 + 1] -= 3.4 * dt;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        const f = Math.max(0, life[i] / ml[i]);
        col[i * 3] *= 0.985 + 0.015 * f; col[i * 3 + 1] *= 0.985 + 0.015 * f; col[i * 3 + 2] *= 0.985 + 0.015 * f;
        if (life[i] <= 0) { pos[i * 3 + 1] = -999; }
      }
      g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------- crate
function makeCrate(tint = 'gold') {
  const [c1, c2] = TINT[tint] || TINT.gold;
  const g = new THREE.Group();
  const W = 1.7, H = 0.95, D = 1.15;
  const shell = glossy(C(c1).multiplyScalar(0.3), 0.92, 0.36);
  const trim = metal(c2, 0.2, 1, 1.5);
  const add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  add(new RoundedBoxGeometry(W, H, D, 4, 0.07), shell, 0, -0.2, 0);
  add(new RoundedBoxGeometry(W + 0.05, 0.07, D + 0.05, 3, 0.03), trim, 0, -0.52, 0);
  add(new RoundedBoxGeometry(W + 0.04, 0.05, D + 0.04, 3, 0.02), trim, 0, 0.2, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new RoundedBoxGeometry(0.13, H + 0.03, 0.13, 3, 0.04), trim, sx * (W / 2 - 0.02), -0.2, sz * (D / 2 - 0.02));
  // slats on the sides
  const slat = glossy(C(c1).multiplyScalar(0.55), 0.9, 0.3);
  for (let i = -1; i <= 1; i++) { add(new RoundedBoxGeometry(0.03, 0.5, 0.7, 2, 0.012), slat, W / 2 + 0.005, -0.2 + i * 0.0, i * 0.0 + 0, g); break; }
  // emblem on the front of the body
  const emblemMat = new THREE.MeshBasicMaterial({ map: logoTex, color: c2, transparent: true, toneMapped: false, depthWrite: false });
  const emb = add(new THREE.PlaneGeometry(0.5, 0.5), emblemMat, 0, -0.2, D / 2 + 0.012); emb.scale.set(0.9, 0.9, 1);
  // light pool
  const poolMat = basic(c2, { transparent: true, opacity: 0, depthWrite: false });
  const pool = add(new THREE.PlaneGeometry(W - 0.2, D - 0.2), poolMat, 0, 0.2755, 0); pool.rotation.x = -Math.PI / 2;
  // lid on a back hinge
  const hinge = new THREE.Group(); hinge.position.set(0, 0.28, -D / 2); g.add(hinge);
  add(new RoundedBoxGeometry(W + 0.02, 0.36, D + 0.02, 4, 0.09), shell, 0, 0.18, D / 2, hinge);
  add(new RoundedBoxGeometry(W + 0.07, 0.06, D + 0.07, 3, 0.03), trim, 0, 0.04, D / 2, hinge);
  add(new RoundedBoxGeometry(0.34, 0.34, 0.07, 3, 0.03), trim, 0, 0.13, D + 0.03, hinge);
  add(new THREE.CircleGeometry(0.045, 20), basic('#10131a'), 0, 0.15, D + 0.07, hinge);
  add(new THREE.BoxGeometry(0.03, 0.09, 0.01), basic('#10131a'), 0, 0.1, D + 0.071, hinge);
  add(new THREE.BoxGeometry(W - 0.5, 0.018, 0.012), basic(c2), 0, 0.2, D + 0.012, hinge);
  const lidEmb = add(new THREE.PlaneGeometry(0.5, 0.5), emblemMat, 0, 0.366, D / 2, hinge); lidEmb.rotation.x = -Math.PI / 2; lidEmb.scale.set(0.8, 0.8, 1);
  // light, beam, halo
  const light = new THREE.PointLight(c2, 0, 5); light.position.set(0, 0.7, 0.2); g.add(light);
  const beam = add(new THREE.CylinderGeometry(0.62, 0.12, 2.6, 36, 1, true), basic(c2, { transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }), 0, 1.55, 0);
  const hl = halo(c2, 3.4, 0); hl.position.set(0, 0.5, 0); g.add(hl);
  g.userData = { hinge, pool: poolMat, beam: beam.material, light, halo: hl.material, open: 0, target: 0 };
  g.userData.step = (dt) => {
    const u = g.userData; u.open += (u.target - u.open) * Math.min(1, dt * 5.5);
    hinge.rotation.x = -u.open * 1.9; poolMat.opacity = clamp(u.open * 1.6, 0, 1); u.beam.opacity = u.open * 0.26;
    light.intensity = u.open * 22; u.halo.opacity = u.open * 0.95;
  };
  return g;
}

// ---------------------------------------------------------------- items
function mkWatch(tn) {
  const [c1, c2] = TINT[tn] || TINT.gold; const g = new THREE.Group(); const m = metal(c2, 0.18);
  g.add(new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.06, 24, 72), m));
  const cs = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.17, 64), metal(c1, 0.3)); cs.rotation.x = Math.PI / 2; g.add(cs);
  const ft = canvasTex(256, 256, (x, w, h) => {
    const gr = x.createRadialGradient(100, 90, 10, 128, 128, 130); gr.addColorStop(0, '#2a3342'); gr.addColorStop(1, '#090c12'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
    x.strokeStyle = c2; x.lineCap = 'round';
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, r1 = i % 3 === 0 ? 100 : 110, r2 = 122; x.lineWidth = i % 3 === 0 ? 7 : 3; x.beginPath(); x.moveTo(128 + Math.sin(a) * r1, 128 - Math.cos(a) * r1); x.lineTo(128 + Math.sin(a) * r2, 128 - Math.cos(a) * r2); x.stroke(); }
    x.fillStyle = c2; x.font = '700 16px sans-serif'; x.textAlign = 'center'; x.fillText('VAULT', 128, 86);
    x.strokeStyle = '#fff'; x.lineWidth = 9; x.beginPath(); x.moveTo(128, 128); x.lineTo(128, 56); x.stroke(); x.lineWidth = 7; x.beginPath(); x.moveTo(128, 128); x.lineTo(176, 152); x.stroke();
    x.strokeStyle = c2; x.lineWidth = 3; x.beginPath(); x.moveTo(128, 128); x.lineTo(96, 176); x.stroke(); x.fillStyle = c2; x.beginPath(); x.arc(128, 128, 9, 0, 7); x.fill();
  });
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.37, 64), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.4, metalness: 0.2 })); face.position.z = 0.087; g.add(face);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.375, 64), new THREE.MeshPhysicalMaterial({ transparent: true, opacity: 0.16, roughness: 0, metalness: 0, clearcoat: 1, envMapIntensity: 2 })); glass.position.z = 0.1; g.add(glass);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 20), m); crown.rotation.z = Math.PI / 2; crown.position.x = 0.46; g.add(crown);
  const strapM = glossy('#14161c', 0.1, 0.55);
  for (const s of [-1, 1]) {
    const st = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.6, 0.07, 3, 0.03), strapM); st.position.set(0, s * 0.68, -0.02); g.add(st);
    const lug = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.1), m); lug.position.set(0, s * 0.42, -0.02); g.add(lug);
  }
  g.scale.setScalar(0.95); return g;
}
function mkDiamond(tn) {
  const g = new THREE.Group(); const col = tn === 'blue' ? '#b9e4ff' : '#ffffff';
  const prof = [[0.001, -0.66], [0.52, 0], [0.56, 0.04], [0.34, 0.26], [0.001, 0.26]].map(([x, y]) => new THREE.Vector2(x, y));
  const m = new THREE.MeshPhysicalMaterial({ color: col, metalness: 0.05, roughness: 0.02, flatShading: true, envMapIntensity: 3.2, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.6, transparent: true, opacity: 0.96 });
  const d = new THREE.Mesh(new THREE.LatheGeometry(prof, 8), m); g.add(d);
  const inner = new THREE.Mesh(new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p.x * 0.72, p.y * 0.72)), 8), new THREE.MeshBasicMaterial({ color: '#9fd8ff', transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, toneMapped: false, depthWrite: false }));
  inner.rotation.y = Math.PI / 8; g.add(inner);
  const s = halo('#bfe6ff', 1.6, 0.35); g.add(s); g.userData.noTilt = true; g.scale.setScalar(1.05); return g;
}
function holoTex(c1, c2, label) {
  return canvasTex(512, 720, (x, w, h) => {
    x.fillStyle = '#0d1016'; x.fillRect(0, 0, w, h); x.strokeStyle = c2; x.lineWidth = 14; x.strokeRect(10, 10, w - 20, h - 20);
    const gr = x.createLinearGradient(40, 60, 470, 430); ['#5ef2ff', '#ff7ad9', '#ffd86b', '#7affb8', '#8f7aff'].forEach((c, i, a) => gr.addColorStop(i / (a.length - 1), c));
    x.fillStyle = gr; x.fillRect(44, 64, 424, 360);
    x.fillStyle = 'rgba(0,0,0,.28)'; x.fillRect(44, 64, 424, 360); x.fillStyle = gr; x.globalAlpha = .55; x.fillRect(44, 64, 424, 360); x.globalAlpha = 1;
    x.fillStyle = '#fff'; x.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 56 : 128, a = -Math.PI / 2 + i * Math.PI / 5; x.lineTo(256 + Math.cos(a) * r, 244 + Math.sin(a) * r); } x.closePath(); x.globalAlpha = .9; x.fill(); x.globalAlpha = 1;
    x.fillStyle = c2; x.fillRect(44, 462, 250, 24); x.fillStyle = 'rgba(255,255,255,.45)'; x.fillRect(44, 510, 424, 14); x.fillRect(44, 540, 360, 14); x.fillRect(44, 570, 300, 14);
    x.fillStyle = c2; x.font = '700 30px sans-serif'; x.fillText(label || 'HOLO', 44, 640);
  });
}
function backTex(c2) {
  return canvasTex(512, 720, (x, w, h) => { const gr = x.createRadialGradient(256, 360, 20, 256, 360, 420); gr.addColorStop(0, '#242a36'); gr.addColorStop(1, '#0b0d12'); x.fillStyle = gr; x.fillRect(0, 0, w, h); x.strokeStyle = c2; x.lineWidth = 14; x.strokeRect(10, 10, w - 20, h - 20);
    if (logoTex && logoTex.image) { x.globalAlpha = .9; x.drawImage(logoTex.image, 136, 250, 240, 240); x.globalCompositeOperation = 'source-atop'; x.globalAlpha = 1; } });
}
function mkCard(tn) {
  const [c1, c2] = TINT[tn] || TINT.ember; const g = new THREE.Group();
  g.add(new THREE.Mesh(new RoundedBoxGeometry(0.74, 1.04, 0.04, 3, 0.02), metal(c2, 0.25)));
  const fm = new THREE.MeshPhysicalMaterial({ map: holoTex(c1, c2, 'DRAKE'), roughness: 0.18, metalness: 0.3, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.8, envMapIntensity: 1.6 });
  const f = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.0), fm); f.position.z = 0.0215; g.add(f);
  const b = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.0), new THREE.MeshStandardMaterial({ map: backTex(c2), roughness: 0.4, metalness: 0.4 })); b.rotation.y = Math.PI; b.position.z = -0.0215; g.add(b);
  g.scale.setScalar(1.12); return g;
}
function mkConsole(tn) {
  const [c1, c2] = TINT[tn] || TINT.teal; const g = new THREE.Group();
  g.add(new THREE.Mesh(new RoundedBoxGeometry(1.3, 0.66, 0.15, 4, 0.08), glossy(c2, 0.5, 0.22)));
  const bez = new THREE.Mesh(new RoundedBoxGeometry(0.76, 0.5, 0.02, 2, 0.01), basic('#05070a')); bez.position.z = 0.078; g.add(bez);
  const st = canvasTex(256, 168, (x, w, h) => { const gr = x.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#1b2b5a'); gr.addColorStop(.5, '#ff6aa2'); gr.addColorStop(1, '#ffd86b'); x.fillStyle = gr; x.fillRect(0, 0, w, h); x.fillStyle = '#0a1230'; x.beginPath(); x.moveTo(0, 168); x.lineTo(70, 90); x.lineTo(120, 130); x.lineTo(180, 70); x.lineTo(256, 168); x.fill(); });
  const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.43), basic('#ffffff', { map: st })); sc.position.z = 0.09; g.add(sc);
  const dk = glossy('#0b0d12', 0.3, 0.35);
  for (const [w, h] of [[0.14, 0.04], [0.04, 0.14]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03), dk); p.position.set(-0.5, 0, 0.09); g.add(p); }
  [[0.5, 0.08], [0.58, -0.02], [0.5, -0.12]].forEach(([x, y]) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 20), dk); b.rotation.x = Math.PI / 2; b.position.set(x, y, 0.09); g.add(b); });
  g.scale.setScalar(0.95); return g;
}
function mkPhones(tn) {
  const [c1, c2] = TINT[tn] || TINT.violet; const g = new THREE.Group(); const m = glossy(c2, 0.7, 0.2);
  g.add(new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 18, 60, Math.PI), m));
  for (const s of [-1, 1]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.18, 40), m); cup.rotation.z = Math.PI / 2; cup.position.set(s * 0.5, -0.05, 0); g.add(cup);
    const pad = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.05, 16, 36), glossy('#14161c', 0.1, 0.6)); pad.rotation.y = Math.PI / 2; pad.position.set(s * 0.41, -0.05, 0); g.add(pad);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 30), metal(c1, 0.3)); cap.rotation.z = Math.PI / 2; cap.position.set(s * 0.6, -0.05, 0); g.add(cap);
  }
  g.position.y = 0.05; g.scale.setScalar(1.05); return g;
}
function mkCar(tn) {
  const [c1, c2] = TINT[tn] || TINT.crim; const g = new THREE.Group();
  const body = new THREE.Shape(); [[-0.72, -0.12], [0.72, -0.12], [0.76, 0], [0.62, 0.07], [0.4, 0.12], [0.18, 0.25], [-0.1, 0.27], [-0.4, 0.2], [-0.62, 0.12], [-0.76, 0.06]].forEach(([x, y], i) => (i ? body.lineTo(x, y) : body.moveTo(x, y)));
  const bg = new THREE.ExtrudeGeometry(body, { depth: 0.4, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 4 }); bg.translate(0, 0, -0.2);
  g.add(new THREE.Mesh(bg, glossy(c2, 0.55, 0.18)));
  const cab = new THREE.Shape(); [[0.34, 0.14], [0.17, 0.26], [-0.08, 0.28], [-0.34, 0.2], [-0.22, 0.13]].forEach(([x, y], i) => (i ? cab.lineTo(x, y) : cab.moveTo(x, y)));
  const cg = new THREE.ExtrudeGeometry(cab, { depth: 0.36, bevelEnabled: false }); cg.translate(0, 0.01, -0.18);
  g.add(new THREE.Mesh(cg, glossy('#0a0d13', 0.9, 0.06)));
  const wm = glossy('#0b0d12', 0.2, 0.5), rm = metal('#f0b73e', 0.2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 36), wm); w.rotation.x = Math.PI / 2; w.position.set(sx * 0.46, -0.12, sz * 0.25); g.add(w);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.11, 24), rm); r.rotation.x = Math.PI / 2; r.position.set(sx * 0.46, -0.12, sz * 0.25); g.add(r);
  }
  for (const sz of [-1, 1]) { const hl = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.1), basic('#ffffff')); hl.position.set(0.8, 0.0, sz * 0.14); g.add(hl); const tl = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.12), basic('#ff3b3b')); tl.position.set(-0.8, 0.03, sz * 0.14); g.add(tl); }
  g.rotation.y = -0.5; const o = new THREE.Group(); o.add(g); o.scale.setScalar(1.15); return o;
}
function mkGift(tn) {
  const [c1, c2] = TINT[tn] || TINT.violet; const g = new THREE.Group();
  g.add(new THREE.Mesh(new RoundedBoxGeometry(1.1, 0.7, 0.04, 3, 0.03), metal(c2, 0.25)));
  const t = canvasTex(512, 320, (x, w, h) => { const gr = x.createLinearGradient(0, 0, w, h); gr.addColorStop(0, c2); gr.addColorStop(1, c1); x.fillStyle = gr; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(8,10,14,.4)'; x.fillRect(0, 70, w, 60); x.fillStyle = 'rgba(255,255,255,.9)'; x.beginPath(); x.arc(90, 230, 38, 0, 7); x.fill(); x.fillRect(150, 214, 220, 14); x.globalAlpha = .6; x.fillRect(150, 244, 140, 10); x.globalAlpha = 1; x.fillStyle = '#fff'; x.font = '800 40px sans-serif'; x.fillText('VAULT', 24, 118); });
  const f = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 0.66), new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.2, metalness: 0.3, clearcoat: 1 })); f.position.z = 0.0215; g.add(f);
  const b = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 0.66), new THREE.MeshStandardMaterial({ color: '#12151b', metalness: .6, roughness: .4 })); b.rotation.y = Math.PI; b.position.z = -0.0215; g.add(b);
  g.scale.setScalar(1.0); return g;
}
function mkPack(tn) {
  const [c1, c2] = TINT[tn] || TINT.blue; const g = new THREE.Group();
  const t = canvasTex(256, 420, (x, w, h) => { const gr = x.createLinearGradient(0, 0, w, h); gr.addColorStop(0, c2); gr.addColorStop(.5, c1); gr.addColorStop(1, mixHex(c1, '#000', .5)); x.fillStyle = gr; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, 0, w, 40); x.fillRect(0, h - 40, w, 40); x.strokeStyle = 'rgba(0,0,0,.5)'; x.lineWidth = 3; for (let i = 0; i < w; i += 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 40); x.moveTo(i, h - 40); x.lineTo(i, h); x.stroke(); }
    x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.arc(128, 210, 62, 0, 7); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(128, 160); x.lineTo(168, 210); x.lineTo(128, 262); x.lineTo(88, 210); x.fill();
    x.fillStyle = 'rgba(255,255,255,.28)'; x.beginPath(); x.moveTo(0, 300); x.lineTo(180, 0); x.lineTo(256, 0); x.lineTo(60, 420); x.lineTo(0, 420); x.fill(); });
  const f = new THREE.MeshPhysicalMaterial({ map: t, metalness: 0.85, roughness: 0.28, clearcoat: 0.6, envMapIntensity: 1.5 });
  g.add(new THREE.Mesh(new RoundedBoxGeometry(0.64, 1.04, 0.1, 3, 0.04), f));
  g.scale.setScalar(1.0); return g;
}
function mixHex(a, b, k) { const A = C(a), B = C(b); return '#' + A.lerp(B, k).getHexString(); }
function mkCoin(tn) {
  const g = new THREE.Group(); const [c1, c2] = TINT.gold;
  const face = canvasTex(256, 256, (x, w, h) => { const gr = x.createRadialGradient(100, 90, 10, 128, 128, 140); gr.addColorStop(0, '#ffe9b0'); gr.addColorStop(1, '#b8801a'); x.fillStyle = gr; x.fillRect(0, 0, w, h); x.strokeStyle = 'rgba(60,35,0,.55)'; x.lineWidth = 8; x.beginPath(); x.arc(128, 128, 104, 0, 7); x.stroke();
    x.strokeStyle = '#2a1a04'; x.lineWidth = 26; x.lineJoin = 'round'; x.lineCap = 'round'; x.beginPath(); x.moveTo(80, 90); x.lineTo(128, 172); x.lineTo(176, 90); x.stroke(); });
  const side = metal('#e9b24a', 0.25), fm = new THREE.MeshStandardMaterial({ map: face, metalness: 0.9, roughness: 0.3, envMapIntensity: 1.3 });
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.09, 72), [side, fm, fm]); coin.rotation.x = Math.PI / 2; g.add(coin);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.03, 16, 72), metal('#ffd98a', 0.18)); g.add(rim);
  return g;
}
const MAKERS = { watch: mkWatch, diamond: mkDiamond, card: mkCard, console: mkConsole, phones: mkPhones, car: mkCar, gift: mkGift, pack: mkPack, credit: mkCoin };
function makeItem(key) {
  const p = PRIZE[key] || PRIZE.chrono; const g = MAKERS[p[0]](p[1]); g.userData.kind = p[0]; return g;
}

// ---------------------------------------------------------------- views
function baseScene(light = 1) {
  const scene = new THREE.Scene(); scene.environment = envTex;
  const key = new THREE.DirectionalLight('#fff1d6', 2.6 * light); key.position.set(3, 5, 4); scene.add(key);
  const rim = new THREE.DirectionalLight('#7fb6ff', 1.6 * light); rim.position.set(-4, 2, -3); scene.add(rim);
  scene.add(new THREE.HemisphereLight('#ffffff', '#1a1208', 0.35 * light));
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  return { scene, cam };
}
function fit(cam, aspect, w, h, lookY = 0, camY = 0.6, zoom = 1) {
  const t = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)); const d = Math.max(h / (2 * t), w / (2 * aspect * t)) / zoom;
  cam.position.set(0, camY * (d / 5), d); cam.lookAt(0, lookY, 0); return d;
}
const attr = (el, k, d) => (el.dataset[k] !== undefined ? el.dataset[k] : d);

const BUILD = {
  // single crate; hover cracks it, click opens it and reveals a prize
  crate(v) {
    const { scene, cam } = baseScene(); const tint = attr(v.el, 'tint', 'gold');
    const crate = makeCrate(tint); scene.add(crate); const sh = shadowBlob(3.4, -0.7); scene.add(sh);
    const reveal = attr(v.el, 'reveal', 'chrono,aurora,drake,console').split(','); let ri = 0, item = null, itemT = 0, closeAt = 0;
    const burst = makeParticles(scene, 120, { size: 0.09, color: TINT[tint][1] }); scene.add(burst.points);
    const auto = parseFloat(attr(v.el, 'auto', '0.35')), zoom = parseFloat(attr(v.el, 'zoom', '1')), hover = attr(v.el, 'hover', '1') === '1', clickOpen = attr(v.el, 'click', 'open') === 'open';
    const yaw0 = parseFloat(attr(v.el, 'yaw', '-0.6')); const initOpen = parseFloat(attr(v.el, 'open', '0'));
    crate.userData.open = crate.userData.target = initOpen;
    const open = () => { if (item) { crate.remove(item); item = null; } item = makeItem(reveal[ri++ % reveal.length]); item.position.set(0, 0.3, 0); item.scale.setScalar(0.01); crate.add(item); itemT = 0; crate.userData.target = 1; closeAt = v.time + 3.6; burst.emit(70, new THREE.Vector3(0, 0.4, 0), 1.6, 2.8); };
    v.onClick = () => { if (clickOpen) open(); };
    v.api = { open };
    v.update = (dt, t, r) => {
      const u = crate.userData; if (u.target >= 0.99 && v.time > closeAt && closeAt) { u.target = 0; closeAt = 0; }
      if (!closeAt) u.target = (v.ptr.over && hover && !coarse) ? 0.3 : (coarse && hover ? 0.1 + 0.1 * Math.sin(t * 1.5) * (Math.sin(t * 0.4) > 0.6 ? 1 : 0) : 0);
      if (!v.ptr.down) v.drag.yaw += v.drag.vel, v.drag.vel *= 0.94;
      const spin = reduceMotion ? 0 : (v.ptr.over || v.ptr.down ? 0.08 : auto);
      v.spinYaw = (v.spinYaw || 0) + spin * dt;
      crate.rotation.y = yaw0 + v.spinYaw + v.drag.yaw + v.ptr.x * 0.4; crate.rotation.x = v.ptr.y * 0.12 + 0.08;
      crate.position.y = Math.sin(t * 1.3) * 0.04; sh.scale.setScalar(1 - Math.sin(t * 1.3) * 0.03);
      u.step(dt); if (item) { itemT += dt; const k = ease(itemT / 1.1); item.position.y = 0.4 + k * 1.15 + Math.sin(t * 2) * 0.04; item.scale.setScalar(Math.max(0.01, k * (u.target > 0.5 ? 1 : Math.max(0, u.open)))); item.rotation.y = t * 1.2; if (u.open < 0.05 && u.target === 0) { crate.remove(item); item = null; } }
      burst.update(dt, t); fit(cam, r.width / r.height, 3.0, 3.3, 0.15, 0.55, zoom);
    };
    return { scene, cam };
  },
  // single prize
  item(v) {
    const { scene, cam } = baseScene(); const key = attr(v.el, 'item', 'chrono'); const it = makeItem(key); const wrap = new THREE.Group(); wrap.add(it); scene.add(wrap);
    const zoom = parseFloat(attr(v.el, 'zoom', '1')); const sh = shadowBlob(1.8, -0.85); scene.add(sh);
    v.update = (dt, t, r) => {
      if (!v.ptr.down) v.drag.yaw += v.drag.vel, v.drag.vel *= 0.94;
      const sp = reduceMotion ? 0 : (v.ptr.over ? 0.5 : 0.9); v.spinYaw = (v.spinYaw || 0) + sp * dt;
      wrap.rotation.y = v.spinYaw + v.drag.yaw + v.ptr.x * 0.5; wrap.rotation.x = v.ptr.y * 0.25 + Math.sin(t * 0.8) * 0.06;
      wrap.position.y = Math.sin(t * 1.4 + (v.seed || 0)) * 0.06; const s = 1 + (v.ptr.over ? 0.1 : 0); wrap.scale.setScalar(wrap.scale.x + (s - wrap.scale.x) * 0.12);
      fit(cam, r.width / r.height, 1.9, 2.0, 0, 0.3, zoom);
    };
    return { scene, cam };
  },
  // home hero: crate + orbiting prizes + dust
  hero(v) {
    const { scene, cam } = baseScene(); const tint = attr(v.el, 'tint', 'gold'); const crate = makeCrate(tint); crate.scale.setScalar(1.0); scene.add(crate);
    const sh = shadowBlob(4.2, -0.75); scene.add(sh); const orbit = attr(v.el, 'orbit', 'chrono,drake,aurora,console').split(',').map((k) => { const it = makeItem(k); const w = new THREE.Group(); w.add(it); scene.add(w); return { w, it }; });
    const burst = makeParticles(scene, 160, { size: 0.1, color: '#ffd98a' }); scene.add(burst.points);
    const dust = makeParticles(scene, 90, { size: 0.05, ambient: true, spread: 5 }); scene.add(dust.points);
    let closeAt = 0, nextPeek = 3; const reveal = ['chrono', 'aurora', 'steel', 'phones']; let ri = 0, item = null, itemT = 0;
    const open = () => { if (item) crate.remove(item); item = makeItem(reveal[ri++ % reveal.length]); item.scale.setScalar(0.01); item.position.set(0, 0.3, 0); crate.add(item); itemT = 0; crate.userData.target = 1; closeAt = v.time + 3.4; burst.emit(90, new THREE.Vector3(0, 0.4, 0), 2.2, 3.2); };
    v.onClick = open; v.api = { open };
    v.update = (dt, t, r) => {
      const u = crate.userData; if (closeAt && v.time > closeAt) { u.target = 0; closeAt = 0; nextPeek = v.time + 5; }
      if (!closeAt && v.time > nextPeek && !reduceMotion) { u.target = 0.35; if (v.time > nextPeek + 1.4) { u.target = 0; nextPeek = v.time + 5; } }
      if (!v.ptr.down) v.drag.yaw += v.drag.vel, v.drag.vel *= 0.94;
      crate.rotation.y = -0.55 + Math.sin(t * 0.35) * 0.25 + v.drag.yaw + v.ptr.x * 0.5; crate.rotation.x = v.ptr.y * 0.15 + 0.1; crate.position.y = Math.sin(t * 1.1) * 0.07;
      u.step(dt); if (item) { itemT += dt; const k = ease(itemT / 1.1); item.position.y = 0.45 + k * 1.2 + Math.sin(t * 2) * 0.05; item.scale.setScalar(Math.max(0.01, k * (closeAt ? 1 : Math.max(0, u.open)))); item.rotation.y = t * 1.3; if (!closeAt && u.open < 0.04) { crate.remove(item); item = null; } }
      orbit.forEach((o, i) => { const a = t * 0.32 + i * Math.PI / 2, rx = (r.width / r.height) < 1.1 ? 1.7 : 2.5, rz = 1.4; const z = Math.sin(a) * rz; o.w.position.set(Math.cos(a) * rx, 0.25 + Math.sin(t * 0.9 + i * 1.7) * 0.22 + (i % 2 ? 0.55 : 0.1), z - 0.2); o.w.scale.setScalar(0.62 + (z + rz) / (2 * rz) * 0.34); o.w.rotation.y = t * 0.7 + i; o.w.rotation.x = Math.sin(t * 0.6 + i) * 0.15; });
      burst.update(dt, t); dust.update(dt, t);
      const asp = r.width / r.height, d = fit(cam, asp, asp < 1.1 ? 4.6 : 6.0, asp < 1.1 ? 4.6 : 4.2, 0.1, 0.9, 1); cam.position.x = v.ptr.x * 0.7; cam.position.y = 0.9 * (d / 5) - v.ptr.y * 0.5; cam.lookAt(0, 0.1, 0);
    };
    return { scene, cam };
  },
  // reveal screen: crate shakes, opens, prize rises
  reveal(v) {
    const { scene, cam } = baseScene(1.1); const tint = attr(v.el, 'tint', 'gold'); const crate = makeCrate(tint); scene.add(crate); const sh = shadowBlob(4, -0.75); scene.add(sh);
    const key = attr(v.el, 'reveal', 'chrono'); let item = makeItem(key); item.scale.setScalar(0.01); crate.add(item);
    const burst = makeParticles(scene, 260, { size: 0.11, color: '#ffd98a' }); scene.add(burst.points); const dust = makeParticles(scene, 80, { size: 0.05, ambient: true, spread: 6 }); scene.add(dust.points);
    let t0 = 0, fired = false; const play = () => { t0 = v.time; fired = false; crate.userData.target = 0; crate.userData.open = 0; item.scale.setScalar(0.01); };
    v.onClick = play; v.api = { play }; play();
    v.update = (dt, t, r) => {
      const e = v.time - t0; const u = crate.userData;
      if (e < 1.1) { crate.rotation.z = Math.sin(e * 46) * 0.03 * (e / 1.1); crate.position.x = Math.sin(e * 52) * 0.03 * (e / 1.1); } else { crate.rotation.z = 0; crate.position.x = 0; }
      if (e > 1.2) u.target = 1;
      if (e > 1.25 && !fired) { fired = true; burst.emit(240, new THREE.Vector3(0, 0.4, 0), 3.4, 4.4, C('#ffd98a')); burst.emit(60, new THREE.Vector3(0, 0.4, 0), 2.6, 5, C('#ffffff')); }
      const k = ease((e - 1.5) / 1.4); item.position.set(0, 0.45 + k * 1.6 + Math.sin(t * 1.6) * 0.06, 0); item.scale.setScalar(Math.max(0.01, k * 1.45)); item.rotation.y = t * 0.9 + v.drag.yaw + v.ptr.x * 0.5;
      if (!v.ptr.down) v.drag.yaw += v.drag.vel, v.drag.vel *= 0.94;
      crate.rotation.y = -0.4 + Math.sin(t * 0.4) * 0.15; u.step(dt); burst.update(dt, t); dust.update(dt, t);
      const asp = r.width / r.height; const d = fit(cam, asp, 4.6, 4.6, 0.7, 0.5, 1); cam.position.x = v.ptr.x * 0.5; cam.position.y = 0.5 * (d / 5) + 0.35 - v.ptr.y * 0.3; cam.lookAt(0, 0.75, 0);
    };
    return { scene, cam };
  },
  // battles banner: two crates facing off
  arena(v) {
    const { scene, cam } = baseScene(); const a = makeCrate('gold'), b = makeCrate('blue'); a.position.x = -2.5; b.position.x = 2.5; a.rotation.y = 0.9; b.rotation.y = -0.9; scene.add(a, b);
    const mid = halo('#ff6a70', 3.2, 0.6); mid.position.set(0, 0.2, 0); scene.add(mid);
    const beamM = basic('#ff6a70', { transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }); const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.2, 12), beamM); beam.rotation.z = Math.PI / 2; beam.position.y = 0.2; scene.add(beam);
    const burst = makeParticles(scene, 200, { size: 0.09, color: '#ff9a6b' }); scene.add(burst.points); scene.add(shadowBlob(9, -0.75));
    let next = 1.5, side = 0;
    v.update = (dt, t, r) => {
      if (v.time > next) { next = v.time + 2.2; side ^= 1; (side ? a : b).userData.target = 1; setTimeout(() => { a.userData.target = 0; b.userData.target = 0; }, 1100); burst.emit(60, new THREE.Vector3((Math.random() - 0.5) * 1.5, 0.2, 0), 2.4, 2.6, C(side ? '#ffd98a' : '#8ccbff')); }
      a.position.y = Math.sin(t * 1.2) * 0.06; b.position.y = Math.sin(t * 1.2 + 1.5) * 0.06; a.rotation.y = 0.9 + v.ptr.x * 0.25; b.rotation.y = -0.9 + v.ptr.x * 0.25;
      beamM.opacity = 0.25 + 0.2 * Math.sin(t * 8); mid.material.opacity = 0.45 + 0.25 * Math.sin(t * 6); a.userData.step(dt); b.userData.step(dt); burst.update(dt, t);
      const asp = r.width / r.height; fit(cam, asp, 7.6, 2.8, 0.2, 0.7, 1);
    };
    return { scene, cam };
  },
  // live studio: pedestal, crate, volumetric cones, drifting camera
  studio(v) {
    const { scene, cam } = baseScene(1.2); const crate = makeCrate(attr(v.el, 'tint', 'ember')); crate.position.y = 0.5; scene.add(crate);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.5, 0.5, 64), glossy('#12151b', 0.9, 0.3)); ped.position.y = -0.25; scene.add(ped);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.03, 12, 96), basic('#ffd98a')); ring.rotation.x = Math.PI / 2; ring.position.y = 0.0; scene.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.015, 12, 96), basic('#ff9a6b', { transparent: true, opacity: 0.5 })); ring2.rotation.x = Math.PI / 2; ring2.position.y = -0.48; scene.add(ring2);
    const cones = [0, 1, 2].map((i) => { const m = new THREE.Mesh(new THREE.ConeGeometry(1.1, 6, 32, 1, true), basic(['#ff9a6b', '#ffd98a', '#8ccbff'][i], { transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.position.set((i - 1) * 2.6, 3.4, -1.4); m.rotation.z = (i - 1) * -0.28; scene.add(m); return m; });
    const burst = makeParticles(scene, 140, { size: 0.09, color: '#ffd98a' }); scene.add(burst.points); const dust = makeParticles(scene, 100, { size: 0.05, ambient: true, spread: 7 }); scene.add(dust.points);
    const reveal = ['aurora', 'chrono', 'console']; let ri = 0, item = null, itemT = 0, closeAt = 0, nextAuto = 2.5;
    const open = () => { if (item) crate.remove(item); item = makeItem(reveal[ri++ % 3]); item.scale.setScalar(0.01); item.position.set(0, 0.3, 0); crate.add(item); itemT = 0; crate.userData.target = 1; closeAt = v.time + 4; burst.emit(100, new THREE.Vector3(0, 1.0, 0), 2.4, 3.2); };
    v.onClick = open;
    v.update = (dt, t, r) => {
      const u = crate.userData; if (closeAt && v.time > closeAt) { u.target = 0; closeAt = 0; nextAuto = v.time + 4; } if (!closeAt && v.time > nextAuto && !reduceMotion) open();
      if (!v.ptr.down) v.drag.yaw += v.drag.vel, v.drag.vel *= 0.94; crate.rotation.y = -0.5 + t * 0.12 + v.drag.yaw;
      u.step(dt); if (item) { itemT += dt; const k = ease(itemT / 1.1); item.position.y = 0.45 + k * 1.25; item.scale.setScalar(Math.max(0.01, k * (closeAt ? 1 : Math.max(0, u.open)))); item.rotation.y = t * 1.3; if (!closeAt && u.open < 0.04) { crate.remove(item); item = null; } }
      cones.forEach((c, i) => { c.rotation.z = (i - 1) * -0.28 + Math.sin(t * 0.5 + i) * 0.1; c.material.opacity = 0.05 + 0.03 * Math.sin(t * 0.8 + i * 2); });
      burst.update(dt, t); dust.update(dt, t); const asp = r.width / r.height; const d = fit(cam, asp, 6.6, 5.0, 0.55, 0.55, 1); cam.position.x = Math.sin(t * 0.2) * 0.6 + v.ptr.x * 0.5; cam.lookAt(0, 0.05, 0);
    };
    return { scene, cam };
  },
  // wallet balance: spinning coin stack
  coins(v) {
    const { scene, cam } = baseScene(1.1); const stack = new THREE.Group(); scene.add(stack); const coins = [];
    for (let i = 0; i < 5; i++) { const c = mkCoin(); const w = new THREE.Group(); w.add(c); stack.add(w); coins.push(w); }
    const hl = halo('#ffd98a', 4, 0.35); hl.position.z = -1; scene.add(hl); const dust = makeParticles(scene, 60, { size: 0.05, ambient: true, spread: 4 }); scene.add(dust.points);
    v.update = (dt, t, r) => {
      if (!v.ptr.down) v.drag.yaw += v.drag.vel, v.drag.vel *= 0.94;
      coins.forEach((w, i) => { w.position.set(Math.sin(i * 1.7) * 0.35, i * 0.34 - 0.7 + Math.sin(t * 1.2 + i) * 0.06, Math.cos(i * 2.1) * 0.2); w.rotation.y = t * (0.6 + i * 0.12) + i + v.drag.yaw; w.rotation.x = 1.2 + Math.sin(t * 0.7 + i) * 0.15; w.rotation.z = Math.sin(i) * 0.3; });
      stack.rotation.y = v.ptr.x * 0.4; dust.update(dt, t); fit(cam, r.width / r.height, 2.6, 3.0, 0.1, 0.5, 1);
    };
    return { scene, cam };
  },
  // admin: 3D revenue towers with hover readout
  bars(v) {
    const { scene, cam } = baseScene(1.1); const vals = (attr(v.el, 'values', '18,22,19,26,31,28,35,33,38,41,37,45,49,52')).split(',').map(Number); const max = Math.max(...vals);
    const grp = new THREE.Group(); scene.add(grp); const bars = []; const grid = new THREE.GridHelper(16, 32, '#3a3f4b', '#23262e'); grid.position.y = 0; grp.add(grid);
    vals.forEach((val, i) => { const h = val / max * 3.6; const m = glossy(mixHex('#b8801a', '#ffd98a', val / max), 0.9, 0.22); const b = new THREE.Mesh(new RoundedBoxGeometry(0.62, h, 0.62, 3, 0.05), m); b.position.set((i - 6.5) * 0.9, h / 2, 0); b.userData = { i, val, h, tgt: 1 }; grp.add(b); bars.push(b);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.5), basic('#ffd98a')); cap.position.y = h / 2 + 0.005; b.add(cap); });
    const ray = new THREE.Raycaster(); const tip = document.createElement('div'); tip.className = 'gl-tip'; v.el.appendChild(tip); scene.add(shadowBlob(14, -0.01));
    v.update = (dt, t, r) => {
      if (!v.ptr.down) v.drag.yaw += v.drag.vel, v.drag.vel *= 0.94; grp.rotation.y = -0.5 + Math.sin(t * 0.25) * 0.12 + v.drag.yaw + v.ptr.x * 0.1;
      let hit = null; if (v.ptr.over) { ray.setFromCamera(new THREE.Vector2(v.ptr.x, -v.ptr.y), cam); const h = ray.intersectObjects(bars, false)[0]; if (h) hit = h.object; }
      bars.forEach((b, i) => { const grow = clamp((t - 0.2 - i * 0.05) * 1.2, 0, 1); const g = ease(grow); b.scale.y += ((hit === b ? 1.08 : 1) * Math.max(0.001, g) - b.scale.y) * 0.18; b.position.y = b.userData.h * b.scale.y / 2; });
      if (hit) { tip.style.opacity = 1; tip.innerHTML = '<b>Nov ' + (hit.userData.i + 1) + '</b> $' + hit.userData.val + 'K'; const p = hit.position.clone().add(new THREE.Vector3(0, hit.userData.h * hit.scale.y / 2, 0)); grp.localToWorld(p); p.project(cam); tip.style.left = ((p.x * 0.5 + 0.5) * r.width) + 'px'; tip.style.top = ((-p.y * 0.5 + 0.5) * r.height - 8) + 'px'; } else tip.style.opacity = 0;
      const asp = r.width / r.height; fit(cam, asp, 14.4, 6.2, 1.5, 1.4, 1);
    };
    return { scene, cam };
  },
  // faint gold dust across the whole page
  dust(v) {
    const { scene, cam } = baseScene(); const dust = makeParticles(scene, innerWidth < 820 ? 36 : 70, { size: 0.05, ambient: true, spread: 9 }); scene.add(dust.points); cam.position.set(0, 0, 8);
    v.update = (dt, t) => { dust.update(dt, t); cam.position.y = -scrollY * 0.002; };
    return { scene, cam };
  },
};

function attachPointer(v) {
  const el = v.el; v.ptr = { x: 0, y: 0, over: false, down: false, lx: 0, moved: 0 }; v.drag = { yaw: 0, vel: 0 }; v.seed = Math.random() * 6;
  if (v.kind === 'dust') return;
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect(); v.ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1; v.ptr.y = ((e.clientY - r.top) / r.height) * 2 - 1;
    if (v.ptr.down) { const dx = e.clientX - v.ptr.lx; v.drag.yaw += dx * 0.012; v.drag.vel = dx * 0.012; v.ptr.lx = e.clientX; v.ptr.moved += Math.abs(dx); }
  });
  el.addEventListener('pointerenter', (e) => { v.ptr.over = e.pointerType !== 'touch'; });
  el.addEventListener('pointerleave', () => { v.ptr.over = false; v.ptr.x = 0; v.ptr.y = 0; });
  el.addEventListener('pointerdown', (e) => { v.ptr.down = true; v.ptr.lx = e.clientX; v.ptr.moved = 0; });
  const up = () => { if (!v.ptr.down) return; v.ptr.down = false; if (v.ptr.moved < 8 && v.onClick) v.onClick(); };
  window.addEventListener('pointerup', up); window.addEventListener('pointercancel', () => { v.ptr.down = false; });
  el.addEventListener('click', (e) => { if (v.ptr.moved > 8) e.preventDefault(); }, true);
}

let last = 0;
function frame(ms) {
  requestAnimationFrame(frame); if (document.hidden) return;
  const dt = Math.min(0.05, (ms - last) / 1000); last = ms; const time = ms / 1000;
  renderer.setScissorTest(false); renderer.clear(); renderer.setScissorTest(true);
  const W = innerWidth, H = innerHeight;
  for (const v of views) {
    if (v.dead) continue;
    const r = v.el.getBoundingClientRect(); const vis = r.width > 4 && r.height > 4 && r.bottom > -40 && r.top < H + 40 && r.right > 0 && r.left < W;
    if (!vis) continue;
    try {
      v.time = time;
      if (!v.built) { const s = BUILD[v.kind](v); v.scene = s.scene; v.cam = s.cam; v.built = true; v.el.classList.add('gl-ready'); }
      v.time = time; v.cam.aspect = r.width / r.height;
      v.update(dt, time, r);
      // data-pad-top: draw extra pixels above the element so a prize can rise out of it over the text
      const pad = v.pad ? Math.min(v.pad * (W < 820 ? 0.6 : 1), Math.max(0, r.top)) : 0;
      if (pad) v.cam.setViewOffset(r.width, r.height, 0, -pad, r.width, r.height + pad); else if (v.cam.view) v.cam.clearViewOffset();
      v.cam.updateProjectionMatrix();
      // clip to scrolling/overflow:hidden ancestors (the shared canvas ignores CSS clipping)
      let sl = r.left, st = r.top - pad, sr = r.right, sb = r.bottom;
      for (const c of v.clips) { const cr = c.getBoundingClientRect(); sl = Math.max(sl, cr.left); st = Math.max(st, cr.top); sr = Math.min(sr, cr.right); sb = Math.min(sb, cr.bottom); }
      if (sr - sl < 1 || sb - st < 1) continue;
      renderer.setViewport(r.left, H - r.bottom, r.width, r.height + pad); renderer.setScissor(sl, H - sb, sr - sl, sb - st);
      renderer.render(v.scene, v.cam);
    } catch (err) { console.error('[vault3d]', v.kind, err); v.dead = true; v.el.classList.remove('gl-ready'); }
  }
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, innerWidth < 820 ? 1.5 : 2);
  renderer.setPixelRatio(dpr); renderer.setSize(innerWidth, innerHeight, false);
}

export async function initVault3D(onProgress = () => {}) {
  try {
    canvas = document.createElement('canvas'); canvas.className = 'gl-canvas'; canvas.setAttribute('aria-hidden', 'true'); document.body.appendChild(canvas);
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { console.warn('WebGL unavailable', e); if (canvas) canvas.remove(); return false; }
  renderer.autoClear = false; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08; renderer.setClearColor(0x000000, 0);
  onProgress(0.3);
  const logoReady = new Promise((res) => {
    logoTex = new THREE.TextureLoader().load(LOGO_URL, (t) => { t.colorSpace = THREE.SRGBColorSpace; res(); }, undefined, () => res());
    logoTex.colorSpace = THREE.SRGBColorSpace;
  });
  await new Promise((r) => setTimeout(r, 0));
  const pm = new THREE.PMREMGenerator(renderer); envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
  glowTex = radialTex([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,.4)'], [1, 'rgba(255,255,255,0)']]);
  shadowTex = radialTex([[0, 'rgba(0,0,0,.85)'], [0.6, 'rgba(0,0,0,.25)'], [1, 'rgba(0,0,0,0)']]);
  onProgress(0.6);
  await logoReady;
  onProgress(0.8);
  resize(); addEventListener('resize', resize);
  document.querySelectorAll('[data-gl]').forEach((el) => {
    const kind = el.dataset.gl; if (!BUILD[kind]) return; const v = { el, kind, pad: +(el.dataset.padTop || 0), clips: [] };
    if (kind !== 'dust' && !v.pad) for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') v.clips.push(p); }
    attachPointer(v); views.push(v);
  });
  requestAnimationFrame(frame);
  // wait until the first frames (scenes in view get built and drawn) are on screen
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
  onProgress(1);
  return true;
}
