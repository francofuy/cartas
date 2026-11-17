// La mesa de cuadernos. Cada carta en curso es un cuaderno con espiral, del tamaño de su papel (A4 o A5).
// Al tocar «Cuadernos» el cuaderno que estás usando se cierra y viaja a la mesa; al elegir uno se acerca, se abre y queda en la primera hoja libre.
//
// Doble cara, como en un cuaderno de verdad: cada hoja tiene frente y dorso, y el cuaderno abierto muestra dos páginas.
// Se escribe en la página de la derecha (el frente de una hoja); al pasar la hoja queda a la izquierda su dorso, que es la página que sigue, y después la derecha.
// Es el mismo orden de siempre (frente, dorso, frente, dorso…), así que la impresión a doble cara no cambia: cada hoja se imprime con su frente y su dorso.
import { $ } from './util.js';
import { drawPaper } from './paper.js';
import { FMT, FORMATS, setFormat, dimsOf } from './format.js';

export const COLORS = { indigo: ['#3a4cb0', '#222f78'], vino: ['#94303f', '#5d1b27'], salvia: ['#58846b', '#33533f'], mostaza: ['#d1a03a', '#946d1c'], grafito: ['#52555f', '#2e3037'], petroleo: ['#2f7c8a', '#1b4852'] };
const el = (t, c) => { const e = document.createElement(t); if (c) e.className = c; return e; };
const Z = 0.9; // grosor de una hoja en el apilado (px)

// h = { lettersApi(), writer(), S(), animOn(), fit(), toast, sheetRect() }
export function setupCuadernos(h) {
  const mesa = $('#mesa'), stage = $('.mesa-stage', mesa), pop = $('#nb-pop'), chip = $('#letter-chip');
  let state = 'write', busy = false, kw = 3.6, rects = null; // kw: píxeles por milímetro con que se escribe
  let nFmt = 'A5', nColor = 'indigo';
  const reduce = () => !h.animOn();

  /* ---------- medidas ---------- */
  const mm = (f) => dimsOf(f);
  function mesaBox() { return mesa.getBoundingClientRect(); }
  function geometry(items) {
    const r = mesaBox(), W = r.width, H = r.height;
    const gap = 34, maxW = W * 0.92, labelH = 64;
    let ks = Math.min(1.1, kw * 0.55);
    const pack = (k) => { const out = []; let row = [], w = 0; for (const it of items) { const iw = mm(it.fmt).w * k; if (row.length && w + gap + iw > maxW) { out.push(row); row = []; w = 0; } row.push(it); w += (row.length > 1 ? gap : 0) + iw; } if (row.length) out.push(row); return out; };
    let rows;
    for (let i = 0; i < 24; i++) { rows = pack(ks); const th = rows.reduce((a, rw) => a + Math.max(...rw.map((it) => mm(it.fmt).h * ks)) + labelH, 0); if (th <= H - 40 || ks < 0.3) break; ks *= 0.92; }
    const heights = rows.map((rw) => Math.max(...rw.map((it) => mm(it.fmt).h * ks)) + labelH), total = heights.reduce((a, b) => a + b, 0);
    let y = Math.max(46, (H - total) / 2 + 12);
    rows.forEach((rw, ri) => {
      const tw = rw.reduce((a, it, i) => a + mm(it.fmt).w * ks + (i ? gap : 0), 0); let x = (W - tw) / 2; const rh = heights[ri] - labelH;
      for (const it of rw) { const w = mm(it.fmt).w * ks, hh = mm(it.fmt).h * ks; it.sx = x; it.sy = y + rh - hh; it.ss = ks / kw; it.sw = w; it.sh = hh; x += w + gap; }
      y += heights[ri];
    });
    return { W, H };
  }
  const tf = (x, y, s) => `translate(${x}px, ${y}px) scale(${s})`;

  /* ---------- las hojas: imágenes de las caras ---------- */
  function blankPaper(ppmPx) {
    const d = mm(FMT), c = document.createElement('canvas'); c.width = Math.round(d.w * ppmPx); c.height = Math.round(d.h * ppmPx);
    drawPaper(c.getContext('2d'), ppmPx, h.S().paper); return c.toDataURL('image/jpeg', 0.8);
  }
  function faceImg(w, idx, ppmPx) { const c = document.createElement('canvas'); w.renderPageTo(c, idx, ppmPx); return c.toDataURL('image/jpeg', 0.82); }

  /* ---------- un cuaderno ---------- */
  function setSize(root, f) {
    const d = mm(f), w = d.w * kw, hh = d.h * kw; root.style.setProperty('--w', w + 'px'); root.style.setProperty('--h', hh + 'px'); root.style.setProperty('--mm', kw + 'px');
  }
  function leaf(kind, frontImg, backImg) {
    const lf = el('div', 'nb-leaf'), f = el('div', 'nb-face front'), b = el('div', 'nb-face back');
    if (kind === 'cover') { f.classList.add('cv-front'); b.classList.add('cv-back'); f.innerHTML = '<i class="band"></i><div class="label"><b></b><small></small></div><span class="fmt"></span><i class="shade"></i>'; b.innerHTML = '<i class="shade"></i>'; }
    else {
      for (const [face, img] of [[f, frontImg], [b, backImg]]) { face.classList.add('pp'); if (img) face.style.backgroundImage = `url(${img})`; face.innerHTML = '<i class="shade"></i>'; }
    }
    lf.append(f, b); return lf;
  }
  // d: la carta. openAt: null (cerrado) o { j: hojas ya pasadas }. Devuelve { root, right[], left[] }
  function build(d, opt = {}) {
    const root = el('div', 'nb shelf'), inner = el('div', 'nb-in'), [c1, c2] = COLORS[d.color] || COLORS.indigo;
    root.style.setProperty('--c1', c1); root.style.setProperty('--c2', c2); setSize(root, d.fmt);
    const sheets = opt.sheets || 0, imgs = opt.imgs || {}; // imgs: { frente(n), dorso(n) }
    const right = [], left = [];
    const cover = leaf('cover'); $('.label b', cover).textContent = d.name || d.title || 'Carta sin título'; $('.label small', cover).textContent = `${d.fmt} · ${opt.pages || 0} ${opt.pages === 1 ? 'página' : 'páginas'}`; $('.fmt', cover).textContent = d.fmt;
    right.push({ el: cover, z: 0, cover: true });
    const j = opt.j || 0, first = Math.max(0, j - 6);
    for (let s = first; s < Math.max(sheets, j + 1); s++) right.push({ el: leaf('page', imgs.front?.(s), imgs.back?.(s)), z: 0 });
    for (let i = 0; i < 2; i++) right.push({ el: leaf('page', imgs.blank, imgs.blank), z: 0 });
    // grosor del cuaderno por las hojas que lleva
    const thick = Math.min(9, 2 + Math.round(sheets / 2)), edge = [];
    for (let i = 1; i <= thick; i++) edge.push(`${i}px ${i}px 0 ${i % 2 ? '#e4dfd0' : '#c8c2b0'}`);
    const block = el('div', 'nb-block'); block.style.boxShadow = edge.join(','); block.style.transform = 'translateZ(-8px)';
    const back = el('div', 'nb-back'); back.style.transform = 'translateZ(-12px)';
    const sh = el('div', 'nb-shadow');
    inner.append(sh, back, block, ...right.map((l) => l.el));
    const n = Math.max(8, Math.round(mm(d.fmt).h / 11)), sp = el('div', 'nb-spiral');
    for (let i = 0; i < n; i++) { const r = el('i'); r.style.top = `${((i + 0.5) / n) * 100}%`; sp.append(r); }
    inner.append(sp);
    const btn = el('button', 'nb-btn'); btn.type = 'button'; btn.setAttribute('aria-label', `Abrir ${d.name || d.title}, ${d.fmt}`); inner.append(btn);
    root.append(inner);
    const o = { root, inner, right, left, btn, d, sp };
    restack(o); return o;
  }
  function restack(o) {
    o.right.forEach((l, i) => { l.z = -i * Z; l.el.style.transform = `translateZ(${l.z}px)`; });
    o.left.forEach((l, i) => { l.z = i * Z; l.el.style.transform = `translateZ(${l.z}px) rotateY(-180deg)`; });
  }

  /* ---------- animación ---------- */
  const EZ = 'cubic-bezier(.45,.05,.2,1)';
  function anim(node, frames, o) { if (!node) return Promise.resolve(); if (reduce()) { const last = frames[frames.length - 1]; for (const k in last) if (k !== 'offset' && k !== 'easing') node.style[k] = last[k]; return Promise.resolve(); } const a = node.animate(frames, { fill: 'both', duration: o.duration, delay: o.delay || 0, easing: o.easing || EZ }); return a.finished.catch(() => {}); }
  function flip(l, toZ, delay, dur, dir) {
    const z0 = l.z, a0 = dir === 1 ? 0 : -180, a1 = dir === 1 ? -180 : 0;
    const fr = [{ transform: `translateZ(${z0}px) rotateY(${a0}deg)` }, { transform: `translateZ(${(z0 + toZ) / 2 + 2}px) rotateY(${(a0 + a1) / 2}deg) skewY(${dir * -1.6}deg)`, offset: 0.5 }, { transform: `translateZ(${toZ}px) rotateY(${a1}deg)` }];
    const p = anim(l.el, fr, { duration: dur, delay, easing: 'cubic-bezier(.4,.05,.25,1)' });
    l.el.querySelectorAll('.shade').forEach((s) => anim(s, [{ opacity: 0 }, { opacity: 0.55, offset: 0.5 }, { opacity: 0 }], { duration: dur, delay, easing: 'ease-in-out' }));
    l.z = toZ; return p;
  }

  /* ---------- la mesa ---------- */
  let books = [], tile = null, labels = [];
  function mount(active, openInfo) {
    stage.innerHTML = ''; books = []; labels = [];
    const drafts = h.lettersApi().drafts(), items = [...drafts.map((d) => ({ d, fmt: d.fmt })), { isNew: true, fmt: 'A5' }];
    geometry(items);
    for (const it of items) {
      if (it.isNew) {
        const t = el('button', 'nb-new'); t.type = 'button'; t.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg><span>Nuevo cuaderno</span>';
        t.style.cssText = `left:${it.sx}px; top:${it.sy}px; width:${it.sw}px; height:${it.sh}px;`; t.addEventListener('click', openPop); stage.append(t); tile = t; labels.push(t); continue;
      }
      const d = it.d, isA = active && d.id === active.id;
      const b = build(d, isA ? openInfo : { pages: pagesOf(d), sheets: Math.ceil(pagesOf(d) / 2) });
      b.it = it; b.root.style.transform = tf(it.sx, it.sy, it.ss); stage.append(b.root); books.push(b);
      b.btn.addEventListener('click', () => openBook(d.id));
      const l = el('div', 'nb-lbl'); l.style.cssText = `left:${it.sx - 22}px; top:${it.sy + it.sh + 10}px; width:${it.sw + 44}px;`;
      const np = pagesOf(d); l.innerHTML = '<b></b><span></span>'; $('b', l).textContent = d.name || d.title || 'Carta sin título'; $('span', l).textContent = `${d.fmt} · ${np} ${np === 1 ? 'página' : 'páginas'}${d.id === h.lettersApi().activeId() ? ' · en uso' : ''}`;
      stage.append(l); b.lbl = l; labels.push(l);
    }
  }
  function pagesOf(d) {
    const api = h.lettersApi();
    if (d.id === api.activeId()) { const w = h.writer(); return w.layout ? w.layout.pages : 1; }
    const t = String(d.text || '').replace(/[\f\v\s]/g, ''); if (!t) return 0;
    const faces = (String(d.text).match(/[\f\v]/g) || []).length + 1, approx = Math.max(faces, Math.ceil(String(d.text).length / 1100));
    return approx;
  }

  // snapshots de la carta en uso, para que las hojas del cuaderno abierto sean las de verdad
  function openInfoFor(d) {
    const w = h.writer(), L = w.layout, ppm = Math.min(kw * Math.min(devicePixelRatio || 1, 2), 760 / mm(d.fmt).w * 1);
    const blank = blankPaper(ppm), cache = {}, get = (idx) => (idx == null ? blank : (cache[idx] ??= faceImg(w, idx, ppm)));
    const f = L.faces[w.page], j = f.side === 'back' ? f.sheet + 1 : f.sheet;
    return { pages: L.pages, sheets: L.sheets.length, j, side: f.side, imgs: { blank, front: (s) => get(L.sheets[s]?.front ?? null), back: (s) => get(L.sheets[s]?.back ?? null) } };
  }

  async function openMesa() {
    if (busy || state !== 'write') return; busy = true;
    const api = h.lettersApi(), w = h.writer(); api.closePops?.(); api.saveActive();
    const d = api.activeDraft(), r = h.sheetRect(); kw = r.width / mm(d.fmt).w;
    const info = openInfoFor(d);
    mesa.getAnimations().forEach((x) => x.cancel()); mesa.hidden = false; const mb = mesaBox();
    document.body.classList.add('mesa-on');
    mount(d, info);
    const a = books.find((b) => b.d.id === d.id), open = info.side === 'back' ? r.right : r.left;
    // el cuaderno aparece abierto exactamente donde estaba la hoja
    const lv = a.right.slice(0, 1 + (info.j - Math.max(0, info.j - 6)));
    a.left = lv; a.right = a.right.slice(lv.length); restack(a);
    a.root.classList.remove('shelf'); a.btn.style.pointerEvents = 'none';
    const ox = open - mb.left, oy = r.top - mb.top, to = a.it;
    a.root.style.transform = tf(ox, oy, 1);
    stage.querySelectorAll('.nb:not(.sel)').forEach((n) => { if (n !== a.root) n.style.opacity = 0; });
    labels.forEach((l) => { if (l !== a.lbl) l.style.opacity = 0; }); if (a.lbl) a.lbl.style.opacity = 0;
    hint(false);
    anim(mesa, [{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
    // se cierra: las hojas vuelven (la última primero), la tapa y el cuaderno viaja a su lugar de la mesa
    const fl = []; let t = 120; const order = [...a.left].reverse();
    order.forEach((l, i) => { const last = i === order.length - 1; fl.push(flip(l, -(order.length - 1 - i) * Z, t, last ? 820 : 600, -1)); t += last ? 0 : 95; });
    const dest = tf(to.sx, to.sy, to.ss);
    const mv = anim(a.root, [{ transform: tf(ox, oy, 1) }, { transform: tf(ox, oy, 1), offset: 0.55 }, { transform: dest }], { duration: Math.max(900, t + 780), easing: 'cubic-bezier(.45,.05,.2,1)' });
    await Promise.all([...fl, mv]);
    mount(null); // se rearma limpio con el cuaderno cerrado en su lugar
    for (const n of stage.querySelectorAll('.nb, .nb-lbl, .nb-new')) anim(n, [{ opacity: n.style.opacity === '0' ? 0 : 1 }, { opacity: 1 }], { duration: 350 });
    state = 'mesa'; busy = false; hint(true);
    chip.setAttribute('aria-expanded', 'true'); books.find((b) => b.d.id === d.id)?.btn.focus({ preventScroll: true });
  }

  async function openBook(id) {
    if (busy || state !== 'mesa') return; busy = true;
    const api = h.lettersApi();
    if (id !== api.activeId()) api.switchTo(id); else h.writer().setPage(h.writer().layout.pages - 1);
    const w = h.writer(); await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))); h.fit();
    await new Promise((res) => requestAnimationFrame(res));
    const d = api.activeDraft(), r = h.sheetRect(); kw = r.width / mm(d.fmt).w; const mb = mesaBox();
    mesa.getAnimations().forEach((x) => x.cancel());
    const info = openInfoFor(d);
    mount(d, info);
    const a = books.find((b) => b.d.id === d.id); if (!a) { busy = false; return; }
    a.root.classList.remove('shelf'); a.root.classList.add('sel'); a.btn.style.pointerEvents = 'none';
    stage.querySelectorAll('.nb').forEach((n) => { if (n !== a.root) anim(n, [{ opacity: 1, filter: 'blur(0px)' }, { opacity: 0, filter: 'blur(6px)' }], { duration: 450 }); });
    labels.forEach((l) => anim(l, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 })); hint(false);
    const open = info.side === 'back' ? r.right : r.left, ox = open - mb.left, oy = r.top - mb.top, from = a.it;
    const cx = (mb.width - mm(d.fmt).w * kw) / 2; // el cuaderno cerrado pasa por el centro
    const lv = a.right.slice(0, 1 + (info.j - Math.max(0, info.j - 6)));
    const mv = anim(a.root, [{ transform: tf(from.sx, from.sy, from.ss) }, { transform: tf(cx, oy, 1), offset: 0.42 }, { transform: tf(ox, oy, 1) }], { duration: 1150, easing: 'cubic-bezier(.3,.8,.25,1)' });
    const fl = []; let t = 480;
    lv.forEach((l, i) => { fl.push(flip(l, i * Z, t, i === 0 ? 820 : 640, 1)); t += i === 0 ? 320 : 100; });
    await Promise.all([mv, ...fl]);
    // la hoja de verdad aparece debajo y el cuaderno se va; la interfaz vuelve
    document.body.classList.remove('mesa-on');
    await anim(mesa, [{ opacity: 1 }, { opacity: 0 }], { duration: 380, easing: 'ease' });
    mesa.hidden = true; stage.innerHTML = ''; mesa.style.opacity = ''; state = 'write'; busy = false;
    chip.setAttribute('aria-expanded', 'false'); h.focusSheet?.();
  }

  const hintEl = $('#mesa-hint');
  function hint(on) { hintEl.style.opacity = on ? 1 : 0; }

  /* ---------- nuevo cuaderno ---------- */
  const colorsEl = $('#nb-colors');
  for (const k of Object.keys(COLORS)) { const b = el('button', 'nb-sw'); b.type = 'button'; b.setAttribute('aria-label', 'Tapa ' + k); b.style.setProperty('--c1', COLORS[k][0]); b.style.setProperty('--c2', COLORS[k][1]); b.setAttribute('aria-pressed', String(k === nColor)); b.addEventListener('click', () => { nColor = k; colorsEl.querySelectorAll('.nb-sw').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }); colorsEl.append(b); }
  pop.querySelectorAll('[data-fmt]').forEach((b) => b.addEventListener('click', () => { nFmt = b.dataset.fmt; pop.querySelectorAll('[data-fmt]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }));
  function openPop() { if (busy || state !== 'mesa') return; pop.hidden = false; $('#nb-name').focus(); $('#nb-name').select(); }
  $('#nb-cancel').addEventListener('click', () => { pop.hidden = true; });
  $('#nb-ok').addEventListener('click', async () => {
    const name = $('#nb-name').value.trim(); pop.hidden = true;
    const api = h.lettersApi(); api.startBlank(true, { fmt: nFmt, color: nColor, name });
    // la carta nueva ya es la activa: se muestra en la mesa y se abre
    const id = api.activeId(); mount(null); await new Promise((res) => requestAnimationFrame(res)); await openBook(id);
  });
  $('#mesa-versions').addEventListener('click', () => h.lettersApi().openDialog());
  // si en «Borradores y versiones» se borró o cambió algo, la mesa se arma de nuevo con lo que quedó
  $('#versions')?.addEventListener('close', () => { if (state === 'mesa' && !busy) mount(null); });

  /* ---------- botones ---------- */
  function toggle() { if (state === 'write') openMesa(); else if (state === 'mesa') openBook(h.lettersApi().activeId()); }
  chip.addEventListener('click', toggle);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && state === 'mesa' && !pop.hidden) { pop.hidden = true; e.stopPropagation(); } }, true);
  let rz = 0; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (state === 'mesa' && !busy) mount(null); }, 150); });
  return { toggle, isOpen: () => state === 'mesa', openMesa, closeMesa: () => (state === 'mesa' ? openBook(h.lettersApi().activeId()) : null) };
}
