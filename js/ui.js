// UI polish: scroll reveal, 3D card tilt, cursor light.
const fine = matchMedia('(pointer: fine)').matches;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initUI() {
  // scroll reveal
  const targets = document.querySelectorAll('.sec .card,.sec .sech,.step,.bx,.wi,.pt,.lr,.sch,.kp,.pn,.feat,.cta,.code');
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.06, rootMargin: '0px 0px -30px 0px' });
    targets.forEach((el, i) => { el.classList.add('rvl'); el.style.transitionDelay = ((i % 4) * 70) + 'ms'; io.observe(el); });
  }
  // tilt + glare
  if (fine && !reduce) {
    document.querySelectorAll('.bx,.wi,.pt,.step,.feat,.promo').forEach((el) => {
      el.classList.add('tilt');
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        el.style.setProperty('--rx', ((0.5 - py) * 7).toFixed(2) + 'deg'); el.style.setProperty('--ry', ((px - 0.5) * 9).toFixed(2) + 'deg');
        el.style.setProperty('--mx', (px * 100).toFixed(1) + '%'); el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      });
      el.addEventListener('pointerleave', () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
    });
    // cursor light
    const g = document.createElement('div'); g.className = 'cursor-glow'; document.body.appendChild(g);
    let tx = innerWidth / 2, ty = innerHeight / 3, x = tx, y = ty;
    addEventListener('pointermove', (e) => { tx = e.clientX; ty = e.clientY; });
    (function loop() { x += (tx - x) * 0.12; y += (ty - y) * 0.12; g.style.transform = `translate3d(${x - 260}px,${y - 260}px,0)`; requestAnimationFrame(loop); })();
  }
}
