import { initUI } from './ui.js';
initUI();

// Preloader: stays up until Three.js and the first 3D frames are ready. Only 3D art is ever shown.
const pre = document.getElementById('preloader');
const bar = pre && pre.querySelector('.pl-bar i');
const label = pre && pre.querySelector('.pl-msg');
let shown = 0, target = 0.06, done = false;
const t0 = performance.now();
document.documentElement.classList.add('loading');
function tick() {
  if (done) return;
  shown += (target - shown) * 0.08;
  if (bar) bar.style.transform = 'scaleX(' + shown.toFixed(3) + ')';
  requestAnimationFrame(tick);
}
tick();
const setP = (p, msg) => { target = Math.max(target, p * 0.96); if (label && msg) label.textContent = msg; };
function finish() {
  if (done) return; done = true;
  if (bar) bar.style.transform = 'scaleX(1)';
  const wait = Math.max(0, 1100 - (performance.now() - t0));
  setTimeout(() => {
    document.documentElement.classList.remove('loading');
    if (pre) { pre.classList.add('out'); setTimeout(() => pre.remove(), 700); }
    document.dispatchEvent(new Event('vault:ready'));
  }, wait);
}
function fail() {
  done = true;
  if (label) label.textContent = 'This experience needs WebGL. Please open it in a current browser with hardware acceleration on.';
  if (pre) pre.classList.add('err');
}
const guard = setTimeout(() => { if (!done) { fail(); } }, 25000);
setP(0.15, 'Loading 3D engine');
import('./vault3d.js')
  .then((m) => { setP(0.4, 'Building the vault'); return m.initVault3D((p) => setP(0.4 + p * 0.6, p >= 1 ? 'Ready' : 'Building the vault')); })
  .then((ok) => { clearTimeout(guard); ok ? finish() : fail(); })
  .catch((e) => { console.error('3D failed', e); clearTimeout(guard); fail(); });
