// Dar vuelta la hoja con el gesto de una esquina: se mantiene apretada la esquina inferior (derecha = siguiente,
// izquierda = anterior), se arrastra y la hoja se despega como la de un cuaderno. Al soltar pasada la mitad, termina de darse vuelta.
import { $ } from './util.js';
import { icon } from './icons.js';

// h = { writer(), targets() -> { fwd, back } (cada uno { idx, apply() } o null), animOn(), toast(), onTurned() }
export function setupCurl(h) {
  const view = $('#view-write'), scroller = $('#scroller'), sheetEl = $('#sheet');
  const cv = document.createElement('canvas'); cv.id = 'curl'; cv.setAttribute('aria-hidden', 'true'); cv.hidden = true; view.append(cv);
  const mk = (dir) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = `curl-hot g ${dir === 'fwd' ? 'br' : 'bl'}`;
    b.dataset.dir = dir;
    b.title = dir === 'fwd' ? 'Hoja siguiente: mantené apretado y arrastrá hacia la izquierda (o tocá)' : 'Hoja anterior: mantené apretado y arrastrá hacia la derecha (o tocá)';
    b.setAttribute('aria-label', dir === 'fwd' ? 'Pasar a la hoja siguiente' : 'Volver a la hoja anterior');
    b.innerHTML = icon(dir === 'fwd' ? 'turnR' : 'turnL', 22);
    view.append(b); return b;
  };
  const hot = { fwd: mk('fwd'), back: mk('back') };
  let V = null, drag = null, raf = 0, busy = false;

  /* ---- dónde está lo visible de la hoja (sin lo que tapa la barra flotante) ---- */
  function visibleRect() {
    const s = sheetEl.getBoundingClientRect(), c = scroller.getBoundingClientRect();
    const bar = $('.stage-bar');
    const barTop = bar && bar.getBoundingClientRect().height ? bar.getBoundingClientRect().top - 8 : c.bottom;
    const left = Math.max(s.left, c.left), right = Math.min(s.right, c.right), top = Math.max(s.top, c.top), bottom = Math.min(s.bottom, c.bottom, barTop);
    return { left, top, right, bottom, w: right - left, h: bottom - top, s };
  }
  function place() {
    raf = 0;
    const writeOn = document.body.dataset.view === 'write' && !view.hidden;
    const t = h.targets();
    const v = visibleRect();
    const ok = writeOn && v.w > 140 && v.h > 140;
    for (const dir of ['fwd', 'back']) {
      const b = hot[dir], tg = dir === 'fwd' ? t.fwd : t.back;
      b.hidden = !ok || !tg;
      if (!b.hidden) { b.style.left = (dir === 'fwd' ? v.right - 52 : v.left + 12) + 'px'; b.style.top = (v.bottom - 52) + 'px'; }
    }
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(place); };
  scroller.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  new ResizeObserver(schedule).observe(scroller);

  /* ---- geometría del doblez ---- */
  const dot = (a, b) => a.x * b.x + a.y * b.y;
  function clipHalf(poly, M, n) { // se queda con los puntos donde (X-M)·n <= 0
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const da = dot({ x: a.x - M.x, y: a.y - M.y }, n), db = dot({ x: b.x - M.x, y: b.y - M.y }, n);
      if (da <= 0) out.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) { const t = da / (da - db); out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); }
    }
    return out;
  }
  const path = (ctx, poly) => { ctx.beginPath(); poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); };

  function draw(P) {
    const { w, h: H, C } = drag, ctx = cv.getContext('2d'), dpr = drag.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, H);
    const dx = P.x - C.x, dy = P.y - C.y, dist = Math.hypot(dx, dy);
    if (dist < 1.5) return;
    const n = { x: dx / dist, y: dy / dist }, M = { x: (C.x + P.x) / 2, y: (C.y + P.y) / 2 };
    const rect = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: H }, { x: 0, y: H }];
    const L = clipHalf(rect, M, n);                    // la parte levantada (del lado de la esquina)
    if (L.length < 3) return;
    const refl = (p) => { const k = 2 * dot({ x: p.x - M.x, y: p.y - M.y }, n); return { x: p.x - k * n.x, y: p.y - k * n.y }; };
    const F = L.map(refl);                             // la solapa: la parte levantada, vista de atrás
    const ox = drag.sheet.left - V.left, oy = drag.sheet.top - V.top, sw = drag.sheet.width, sh = drag.sheet.height;

    // 1) lo que queda a la vista abajo: la hoja que sigue
    ctx.save(); path(ctx, L); ctx.clip();
    if (drag.next) ctx.drawImage(drag.next, ox, oy, sw, sh); else { ctx.fillStyle = '#e9e6dc'; ctx.fillRect(0, 0, w, H); }
    const g1 = ctx.createLinearGradient(M.x, M.y, M.x - n.x * 34, M.y - n.y * 34);
    g1.addColorStop(0, 'rgba(0,0,0,.34)'); g1.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g1; ctx.fillRect(0, 0, w, H);
    ctx.restore();

    // 2) la solapa: el reverso de la hoja actual, espejado sobre el doblez
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, H); ctx.clip(); path(ctx, F); ctx.clip();
    ctx.save();
    ctx.transform(1 - 2 * n.x * n.x, -2 * n.x * n.y, -2 * n.x * n.y, 1 - 2 * n.y * n.y, 2 * dot(M, n) * n.x, 2 * dot(M, n) * n.y);
    ctx.drawImage(sheetEl, ox, oy, sw, sh);
    ctx.restore();
    ctx.fillStyle = 'rgba(252,249,240,.62)'; ctx.fillRect(0, 0, w, H);                 // el papel por detrás
    const g2 = ctx.createLinearGradient(M.x, M.y, M.x + n.x * 46, M.y + n.y * 46);
    g2.addColorStop(0, 'rgba(0,0,0,.26)'); g2.addColorStop(0.5, 'rgba(255,255,255,.14)'); g2.addColorStop(1, 'rgba(0,0,0,.04)');
    ctx.fillStyle = g2; ctx.fillRect(0, 0, w, H);
    ctx.restore();
  }

  /* ---- animación ---- */
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  function animate(from, to, ms, done) {
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms), e = ease(k);
      drag.P = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
      draw(drag.P);
      if (k < 1) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  }
  function close() {
    drag = null; busy = false; cv.hidden = true; document.body.classList.remove('curling'); schedule();
  }
  function finish(turn) {
    const d = drag, { w, h: H, C } = d;
    busy = true;
    if (turn) {
      const to = d.dir === 'fwd' ? { x: -w, y: C.y } : { x: 2 * w, y: C.y };
      const go = () => { d.tgt.apply(); h.onTurned?.(); requestAnimationFrame(() => requestAnimationFrame(close)); };
      if (!h.animOn()) { go(); return; }
      animate(d.P, to, 300, go);
    } else {
      if (!h.animOn()) { close(); return; }
      animate(d.P, { x: C.x, y: C.y }, 220, close);
    }
  }

  /* ---- el gesto ---- */
  function begin(dir, e) {
    if (busy || e.button > 0) return;
    const t = h.targets(), tgt = dir === 'fwd' ? t.fwd : t.back;
    if (!tgt) return;
    V = visibleRect();
    if (V.w < 140 || V.h < 140) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(V.w * dpr); cv.height = Math.round(V.h * dpr);
    cv.style.left = V.left + 'px'; cv.style.top = V.top + 'px'; cv.style.width = V.w + 'px'; cv.style.height = V.h + 'px';
    const next = document.createElement('canvas');
    h.writer().renderPageTo(next, tgt.idx, 2.2);
    const C = dir === 'fwd' ? { x: V.w, y: V.h } : { x: 0, y: V.h };
    drag = { dir, tgt, w: V.w, h: V.h, C, P: { ...C }, dpr, next, sheet: V.s, pid: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, samples: [] };
    cv.hidden = false; document.body.classList.add('curling');
    try { hot[dir].setPointerCapture(e.pointerId); } catch { /* nada */ }
  }
  function move(e) {
    if (!drag || e.pointerId !== drag.pid || busy) return;
    const px = Math.max(0, Math.min(drag.w, e.clientX - V.left)), py = Math.max(0, Math.min(drag.h, e.clientY - V.top));
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 5) drag.moved = true;
    if (!drag.moved) return;
    drag.P = { x: px, y: py };
    drag.samples.push({ t: performance.now(), x: px }); if (drag.samples.length > 6) drag.samples.shift();
    draw(drag.P);
  }
  function up(e) {
    if (!drag || (e && e.pointerId !== drag.pid) || busy) return;
    const d = drag;
    if (!d.moved) { // un toque: la hoja se da vuelta sola
      d.P = { ...d.C }; cv.hidden = false; finish(true); return;
    }
    const prog = d.dir === 'fwd' ? (d.C.x - d.P.x) / d.w : (d.P.x - d.C.x) / d.w;
    const s = d.samples, v = s.length > 1 ? (s[s.length - 1].x - s[0].x) / Math.max(1, s[s.length - 1].t - s[0].t) : 0; // px/ms
    const toward = d.dir === 'fwd' ? -v : v;
    finish(prog > 0.4 || (prog > 0.12 && toward > 0.9));
  }
  for (const dir of ['fwd', 'back']) {
    const b = hot[dir];
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); begin(dir, e); });
    b.addEventListener('pointermove', move);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', () => { if (drag && !busy) finish(false); });
    // con teclado, Enter o espacio: la hoja se da vuelta sola
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault(); begin(dir, { pointerId: -1, button: 0, clientX: 0, clientY: 0 });
      if (drag) { drag.P = { ...drag.C }; finish(true); }
    });
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  schedule();
  return { place: schedule };
}
