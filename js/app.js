import { $, $$, clamp, debounce, uid } from './util.js';
import { HandLibrary, INSTRUMENTS, loadDemoFont, clearSpriteCache } from './glyphs.js';
import { Writer } from './writer.js';
import * as DB from './db.js';
import { PAPER_PRESETS } from './paper.js';
import { TEMPLATE_PAGES, CHAR_GROUPS, ALL_CHARS, pageLabel } from './chars.js';
import { loadPhoto, detectMarkers, defaultCorners, warpPage, detectPageCode, extractGlyphs } from './capture.js';
import { printLetter, printTemplates } from './print.js';

/* ------------------------------------------------------------------ */
/* Ajustes y almacenamiento simple                                     */
/* ------------------------------------------------------------------ */
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin espacio o bloqueado */ } },
};

const DEFAULTS = {
  instrument: 'ballpoint', color: INSTRUMENTS.ballpoint.color, colorCustom: false,
  thickness: INSTRUMENTS.ballpoint.thickness, pressure: INSTRUMENTS.ballpoint.pressure,
  size: 1, letterSpacing: 0, wordSpacing: 0.8, imperfection: 0.7,
  paper: { ...PAPER_PRESETS.rayado },
  animate: true, speed: 1, source: 'auto', seed: 1 + Math.floor(Math.random() * 1e6),
  noteSize: 17,
};
function loadSettings() {
  const saved = LS.get('pyl.settings', {});
  return { ...DEFAULTS, ...saved, paper: { ...DEFAULTS.paper, ...(saved.paper || {}) } };
}
let S = loadSettings();
const saveSettings = debounce(() => LS.set('pyl.settings', S), 250);

const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const setPath = (o, p, v) => { const ks = p.split('.'); const l = ks.pop(); ks.reduce((a, k) => a[k], o)[l] = v; };
const LAYOUT_KEYS = new Set(['size', 'letterSpacing', 'wordSpacing', 'imperfection', 'paper.lineSpacing', 'paper.margin', 'paper.marginX', 'paper.type', 'animate']);

/* ------------------------------------------------------------------ */
/* Estado                                                              */
/* ------------------------------------------------------------------ */
const lib = new HandLibrary();
let writer = null;
let zoom = 1;
const isMobile = () => matchMedia('(max-width: 759px)').matches;

function toast(msg, ms = 3600) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}
let busyEl = null;
function busy(msg) {
  if (!busyEl) { busyEl = document.createElement('div'); busyEl.className = 'busy'; document.body.append(busyEl); }
  busyEl.textContent = msg; busyEl.hidden = false;
}
function unbusy() { if (busyEl) busyEl.hidden = true; }

function applySource() {
  lib.useMine = S.source === 'mine' || (S.source === 'auto' && lib.hasMine());
}

async function reloadGlyphs() {
  let list = [];
  try { list = await DB.allGlyphs(); } catch (e) { console.warn('No pude leer la letra guardada', e); }
  lib.setMine(list);
  applySource();
  clearSpriteCache();
  if (writer) { writer.relayout(); writer.schedule(); writer.emit(); }
  renderCoverage();
  renderHandStatus();
}

/* ------------------------------------------------------------------ */
/* Controles de ajustes                                                */
/* ------------------------------------------------------------------ */
const INK_COLORS = [['Azul', '#1d2f8f'], ['Negro', '#16171c'], ['Azul medio', '#2f6fb5'], ['Rojo', '#a8222c'], ['Verde', '#1f5a3a'], ['Sepia', '#5a3a22'], ['Grafito', '#3a3a40']];
const PAPER_COLORS = [['Blanco cálido', '#fcfaf4'], ['Blanco', '#ffffff'], ['Crema', '#fbf6ea'], ['Amarillento', '#f3ead3'], ['Azulado', '#eef2f6'], ['Rosado', '#fbeff0']];
const LINE_COLORS = [['Azul', '#86a9d6'], ['Azul oscuro', '#5d82b8'], ['Beige', '#cfc6b0'], ['Gris', '#b8b8b8'], ['Rosado', '#d8a2a8']];

function buildSwatches(host, list, getVal, onPick) {
  host.innerHTML = '';
  host.setAttribute('role', 'radiogroup');
  const mk = (name, color) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'sw'; b.style.background = color; b.title = name; b.setAttribute('aria-label', name);
    b.setAttribute('role', 'radio');
    b.dataset.color = color;
    b.addEventListener('click', () => { onPick(color, false); refresh(); });
    return b;
  };
  list.forEach(([n, c]) => host.append(mk(n, c)));
  const cu = document.createElement('label');
  cu.className = 'sw custom'; cu.title = 'Otro color'; cu.setAttribute('role', 'radio');
  const inp = document.createElement('input'); inp.type = 'color'; inp.setAttribute('aria-label', 'Elegir otro color');
  inp.addEventListener('input', () => { onPick(inp.value, true); refresh(); });
  cu.append(inp); host.append(cu);
  function refresh() {
    const v = getVal().toLowerCase();
    let found = false;
    $$('.sw[data-color]', host).forEach((b) => { const on = b.dataset.color.toLowerCase() === v; b.setAttribute('aria-checked', on); if (on) found = true; });
    cu.setAttribute('aria-checked', !found);
    if (!found) inp.value = v;
  }
  host._refresh = refresh;
  refresh();
}

function buildChips(host, items, getVal, onPick) {
  host.innerHTML = '';
  for (const [key, label] of items) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = label; b.dataset.key = key; b.setAttribute('role', 'radio');
    b.addEventListener('click', () => { onPick(key); refresh(); });
    host.append(b);
  }
  function refresh() { $$('.chip', host).forEach((b) => b.setAttribute('aria-checked', b.dataset.key === getVal())); }
  host._refresh = refresh;
  refresh();
}

function settingChanged(path) {
  saveSettings();
  if (path === 'animate' && !S.animate) writer.settle();
  if (LAYOUT_KEYS.has(path)) writer.relayout(); else writer.inkDirty = true;
  writer.schedule();
}

function syncControls() {
  $$('[data-s]').forEach((el) => {
    const v = getPath(S, el.dataset.s);
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
  });
  ['#inst-chips', '#paper-chips', '#source-chips', '#ink-swatches', '#paper-swatches', '#line-swatches'].forEach((id) => $(id)._refresh?.());
}

function buildControls() {
  buildChips($('#inst-chips'), Object.entries(INSTRUMENTS).map(([k, v]) => [k, v.label]), () => S.instrument, (k) => {
    S.instrument = k;
    const d = INSTRUMENTS[k];
    S.thickness = d.thickness; S.pressure = d.pressure;
    if (!S.colorCustom) S.color = d.color;
    syncControls(); settingChanged('instrument');
  });
  buildSwatches($('#ink-swatches'), INK_COLORS, () => S.color, (c, custom) => { S.color = c; S.colorCustom = true; settingChanged('color'); });
  buildChips($('#paper-chips'), [['rayado', 'Rayada'], ['cuadriculado', 'Cuadriculada'], ['liso', 'Lisa']], () => S.paper.type, (k) => {
    const p = PAPER_PRESETS[k];
    Object.assign(S.paper, { type: k, lineSpacing: p.lineSpacing, margin: p.margin, grid: p.grid });
    syncControls(); settingChanged('paper.type');
  });
  buildSwatches($('#paper-swatches'), PAPER_COLORS, () => S.paper.color, (c) => { S.paper.color = c; settingChanged('paper.color'); });
  buildSwatches($('#line-swatches'), LINE_COLORS, () => S.paper.lineColor, (c) => { S.paper.lineColor = c; settingChanged('paper.lineColor'); });
  buildChips($('#source-chips'), [['auto', 'Automática'], ['mine', 'Mi letra'], ['demo', 'Ejemplo']], () => S.source, (k) => {
    S.source = k; applySource(); clearSpriteCache(); renderHandStatus(); settingChanged('source'); writer.relayout();
  });

  $$('[data-s]').forEach((el) => {
    el.addEventListener('input', () => {
      const path = el.dataset.s;
      const v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? parseFloat(el.value) : el.value;
      setPath(S, path, v);
      settingChanged(path);
    });
  });
  syncControls();
}

function renderHandStatus() {
  const el = $('#hand-status');
  if (!el) return;
  const mineChars = lib.mineChars();
  if (!mineChars) el.textContent = 'Todavía no cargaste tu letra: se usa una letra de ejemplo. Cargala en “Mi letra”.';
  else if (!lib.useMine) el.textContent = `Usando la letra de ejemplo. Tenés ${mineChars} caracteres de tu letra guardados.`;
  else el.textContent = `Usando tu letra: ${mineChars} de ${ALL_CHARS.length} caracteres.`;
}

/* ------------------------------------------------------------------ */
/* Hoja: tamaño, zoom, páginas                                         */
/* ------------------------------------------------------------------ */
function fit() {
  if (!writer) return;
  const sc = $('#scroller');
  const cs = getComputedStyle(sc);
  const availW = sc.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const availH = sc.clientHeight - parseFloat(cs.paddingTop) - 28;
  if (availW < 80 || availH < 80) return;
  const base = isMobile() ? availW : Math.min(availW, (availH * 210) / 297);
  const w = Math.round(base * zoom);
  if (Math.abs(w - writer.cssW) > 1) writer.resize(w);
}

function updatePager(info) {
  $('#pg-label').textContent = `Hoja ${info.page + 1} de ${info.pages}`;
  $('#pg-prev').disabled = info.page <= 0;
  $('#pg-next').disabled = info.page >= info.pages - 1;
  $('#empty-hint').hidden = info.text.length > 0;
  const hs = $('#hand-status');
  if (info.missing.length && lib.useMine) {
    hs.dataset.missing = info.missing.join('');
    hs.textContent = `Usando tu letra, pero faltan: ${info.missing.slice(0, 14).join(' ')}${info.missing.length > 14 ? '…' : ''} (se usa la letra de ejemplo en esos).`;
  } else renderHandStatus();
}

function ensureCaretVisible() {
  const y = writer.caretClientY();
  if (y == null) return;
  const sc = $('#scroller');
  const r = sc.getBoundingClientRect();
  const top = r.top + 40, bottom = r.bottom - (isMobile() ? 90 : 60);
  if (y > bottom) sc.scrollBy({ top: y - bottom + r.height * 0.18, behavior: 'smooth' });
  else if (y < top) sc.scrollBy({ top: y - top - r.height * 0.18, behavior: 'smooth' });
}

/* ------------------------------------------------------------------ */
/* Entrada de texto                                                    */
/* ------------------------------------------------------------------ */
function diff(a, b) {
  let s = 0;
  const m = Math.min(a.length, b.length);
  while (s < m && a[s] === b[s]) s++;
  let ea = a.length, eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  return { start: s, del: ea - s, ins: b.slice(s, eb) };
}

const persistDraft = debounce(() => LS.set('pyl.draft', { text: writer.text }), 350);

function setupInput() {
  const cap = $('#cap');
  let prev = '';
  const syncCap = () => { cap.value = writer.text; prev = cap.value; cap.setSelectionRange(writer.caret, writer.caret); };
  writer._syncCap = syncCap;

  cap.addEventListener('input', () => {
    const v = cap.value;
    const d = diff(prev, v);
    prev = v;
    writer.edit(d.start, d.del, d.ins, cap.selectionStart);
    persistDraft();
    ensureCaretVisible();
  });
  document.addEventListener('selectionchange', () => {
    if (document.activeElement === cap && cap.value === writer.text) writer.setCaret(cap.selectionStart);
  });
  cap.addEventListener('focus', () => { writer.focused = true; writer.blinkOn = true; writer.schedule(); });
  cap.addEventListener('blur', () => { writer.focused = false; writer.schedule(); });

  $('#sheet').addEventListener('click', (e) => {
    const k = writer.hit(e.clientX, e.clientY);
    if (cap.value !== writer.text) syncCap();
    cap.focus({ preventScroll: true });
    cap.setSelectionRange(k, k);
    writer.setCaret(k);
    if (isMobile()) closeDrawers();
  });
  $('#stage').addEventListener('pointerdown', (e) => { if (isMobile() && !e.target.closest('#sheet')) closeDrawers(); });
  syncCap();
}

/* ------------------------------------------------------------------ */
/* Cajones (celular) y vistas                                          */
/* ------------------------------------------------------------------ */
function closeDrawers() {
  $('#rail').classList.toggle('open', false);
  $('#note').classList.toggle('open', false);
  $$('.dock-btn[data-drawer]').forEach((b) => b.classList.toggle('active', false));
}
function toggleDrawer(id) {
  const el = $('#' + id);
  const open = !el.classList.contains('open');
  closeDrawers();
  el.classList.toggle('open', open);
  $$('.dock-btn[data-drawer]').forEach((b) => b.classList.toggle('active', open && b.dataset.drawer === id));
  if (open) $('#cap').blur();
}

function setView(v) {
  document.body.dataset.view = v;
  $$('.tab').forEach((b) => b.setAttribute('aria-pressed', b.dataset.view === v));
  $('#view-write').hidden = v !== 'write';
  $('#view-hand').hidden = v !== 'hand';
  $('#btn-print').hidden = v !== 'write' || isMobile();
  if (v === 'write') requestAnimationFrame(fit);
  closeDrawers();
}

/* ------------------------------------------------------------------ */
/* Nota de referencia                                                  */
/* ------------------------------------------------------------------ */
function setupNote() {
  const ta = $('#note-text');
  ta.value = LS.get('pyl.note', '');
  ta.style.fontSize = S.noteSize + 'px';
  ta.addEventListener('input', debounce(() => LS.set('pyl.note', ta.value), 300));
  $('#note-clear').addEventListener('click', () => { if (!ta.value || confirm('¿Borrar la nota de referencia?')) { ta.value = ''; LS.set('pyl.note', ''); } });
  const sz = (d) => { S.noteSize = clamp(S.noteSize + d, 13, 28); ta.style.fontSize = S.noteSize + 'px'; saveSettings(); };
  $('#note-smaller').addEventListener('click', () => sz(-1));
  $('#note-bigger').addEventListener('click', () => sz(1));
}

/* ------------------------------------------------------------------ */
/* Versiones                                                           */
/* ------------------------------------------------------------------ */
function renderVersions() {
  const list = LS.get('pyl.versions', []);
  const ul = $('#ver-list');
  ul.innerHTML = '';
  if (!list.length) { const li = document.createElement('li'); li.className = 'muted'; li.textContent = 'Todavía no guardaste ninguna versión.'; ul.append(li); return; }
  for (const v of list) {
    const li = document.createElement('li');
    const t = document.createElement('div'); t.className = 't';
    const b = document.createElement('b'); b.textContent = v.name;
    const sm = document.createElement('small'); sm.textContent = new Date(v.ts).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' }) + ` · ${v.text.length} caracteres`;
    t.append(b, sm);
    const open = document.createElement('button'); open.type = 'button'; open.className = 'btn'; open.textContent = 'Abrir';
    open.addEventListener('click', () => {
      if (writer.text && writer.text !== v.text && !confirm('Se reemplaza el texto actual por esta versión. ¿Seguimos?')) return;
      writer.setText(v.text); writer._syncCap(); persistDraft();
      $('#versions').close();
    });
    const del = document.createElement('button'); del.type = 'button'; del.className = 'btn danger'; del.textContent = 'Borrar';
    del.addEventListener('click', () => { LS.set('pyl.versions', LS.get('pyl.versions', []).filter((x) => x.id !== v.id)); renderVersions(); });
    li.append(t, open, del);
    ul.append(li);
  }
}
function setupVersions() {
  $('#btn-versions').addEventListener('click', () => { renderVersions(); $('#versions').showModal(); });
  $('#ver-save').addEventListener('click', () => {
    if (!writer.text.trim()) { toast('Escribí algo antes de guardar una versión.'); return; }
    const list = LS.get('pyl.versions', []);
    const name = $('#ver-name').value.trim() || writer.text.trim().split('\n')[0].slice(0, 40) || 'Sin título';
    list.unshift({ id: uid(), name, ts: Date.now(), text: writer.text });
    LS.set('pyl.versions', list.slice(0, 60));
    $('#ver-name').value = '';
    renderVersions();
    toast('Versión guardada.');
  });
}

/* ------------------------------------------------------------------ */
/* Imprimir                                                            */
/* ------------------------------------------------------------------ */
function setupPrint() {
  const open = () => {
    if (!writer.text.trim()) { toast('Escribí algo para poder imprimir.'); return; }
    const n = writer.layout.pages;
    $('#print-info').textContent = `Se van a imprimir ${n} hoja${n > 1 ? 's' : ''} A4. En el cuadro de impresión elegí tamaño real (100 %), sin márgenes ni encabezados.`;
    $('#printdlg').showModal();
  };
  $('#btn-print').addEventListener('click', open);
  $('#dock-print').addEventListener('click', open);
  $('#print-go').addEventListener('click', async (e) => {
    e.preventDefault();
    $('#printdlg').close();
    busy('Preparando las hojas para imprimir…');
    try { await printLetter(writer, [...Array(writer.layout.pages).keys()]); }
    catch (err) { console.error(err); toast('No pude preparar la impresión.'); }
    unbusy();
  });
}

/* ------------------------------------------------------------------ */
/* MI LETRA                                                            */
/* ------------------------------------------------------------------ */
function buildTemplateGrid() {
  const g = $('#tpl-grid');
  g.innerHTML = '';
  TEMPLATE_PAGES.forEach((_, p) => {
    const d = document.createElement('div'); d.className = 'tpl';
    d.innerHTML = `<b>Página ${p + 1}</b><small>${pageLabel(p)}</small>`;
    const b = document.createElement('button'); b.className = 'btn'; b.textContent = 'Imprimir';
    b.addEventListener('click', () => printTemplates([p]));
    d.append(b); g.append(d);
  });
  $('#tpl-all').addEventListener('click', () => printTemplates(TEMPLATE_PAGES.map((_, i) => i)));
}

function renderCoverage() {
  const host = $('#coverage');
  if (!host) return;
  host.innerHTML = '';
  let have = 0, total = 0;
  for (const grp of CHAR_GROUPS) {
    const div = document.createElement('div'); div.className = 'cov-group';
    div.innerHTML = `<h4>${grp.name}</h4>`;
    const row = document.createElement('div'); row.className = 'cov-chars';
    for (const c of grp.chars) {
      const n = lib.mineCount(c);
      if (n) have++; total++;
      const b = document.createElement('button'); b.type = 'button';
      b.className = 'cov ' + (n === 0 ? 'zero' : n < 5 ? 'few' : 'ok');
      b.innerHTML = `<b></b><i>${n || '–'}</i>`; b.firstChild.textContent = c;
      b.title = n ? `${n} variante${n > 1 ? 's' : ''} de “${c}”` : `Sin “${c}” todavía`;
      b.addEventListener('click', () => showVariants(c));
      row.append(b);
    }
    div.append(row); host.append(div);
  }
  const vars = ALL_CHARS.reduce((s, c) => s + lib.mineCount(c), 0);
  $('#cov-summary').textContent = have
    ? `Tenés ${have} de ${total} caracteres (${vars} variantes en total). Tocá un carácter para ver o borrar sus variantes. Con 5 o más por carácter ya se ve natural.`
    : 'Todavía no hay letras cargadas. Cuando subas la primera foto van a aparecer acá.';
}

async function showVariants(ch) {
  const list = (await DB.allGlyphs()).filter((g) => g.char === ch);
  $('#variants-title').textContent = list.length ? `“${ch}” · ${list.length} variante${list.length > 1 ? 's' : ''}` : `“${ch}” · sin variantes`;
  const host = $('#variants-list');
  host.innerHTML = '';
  if (!list.length) host.innerHTML = '<p class="muted">Todavía no cargaste este carácter.</p>';
  for (const g of list) {
    const d = document.createElement('div'); d.className = 'var';
    const c = document.createElement('canvas'); c.width = g.w; c.height = g.h;
    const id = new ImageData(g.w, g.h);
    for (let i = 0; i < g.alpha.length; i++) { id.data[i * 4] = 20; id.data[i * 4 + 1] = 24; id.data[i * 4 + 2] = 60; id.data[i * 4 + 3] = g.alpha[i]; }
    c.getContext('2d').putImageData(id, 0, 0);
    const x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.title = 'Borrar esta variante'; x.setAttribute('aria-label', 'Borrar esta variante');
    x.addEventListener('click', async () => { await DB.deleteGlyph(g.dbId); d.remove(); await reloadGlyphs(); });
    d.append(c, x); host.append(d);
  }
  $('#variants').showModal();
}

/* ---------- captura desde foto ---------- */
function reviewPhoto(canvas, pts, autoFound) {
  return new Promise((resolve) => {
    const dlg = $('#review'), cv = $('#review-canvas'), msg = $('#review-msg'), sel = $('#review-page');
    sel.innerHTML = '<option value="-1">Detectar sola</option>' + TEMPLATE_PAGES.map((_, i) => `<option value="${i}">${i + 1} · ${pageLabel(i)}</option>`).join('');
    const maxW = Math.min(680, window.innerWidth - 64);
    const sc = Math.min(1, maxW / canvas.width, (window.innerHeight * 0.52) / canvas.height);
    const w = Math.round(canvas.width * sc), h = Math.round(canvas.height * sc);
    cv.width = w; cv.height = h; cv.style.width = w + 'px'; cv.style.height = h + 'px';
    const ctx = cv.getContext('2d');
    let drag = -1;
    let warped = null;
    const P = pts.map(([x, y]) => [x * sc, y * sc]);
    msg.textContent = autoFound ? 'Marcas detectadas automáticamente. Revisá y tocá “Procesar”.' : 'No pude detectar las marcas: ubicá los puntos a mano.';
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(canvas, 0, 0, w, h);
      ctx.lineWidth = 2; ctx.strokeStyle = '#ffd24a'; ctx.beginPath();
      P.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke();
      P.forEach(([x, y], i) => {
        ctx.beginPath(); ctx.arc(x, y, i === 0 ? 11 : 9, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,210,74,.25)'; ctx.fill(); ctx.strokeStyle = '#ffd24a'; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5); ctx.stroke();
      });
      if (drag >= 0) { // lupa
        const [x, y] = P[drag];
        const R = 56, cx = x < w / 2 ? w - R - 8 : R + 8, cy = R + 8;
        ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
        ctx.fillStyle = '#000'; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
        const z = 4, sx = x / sc, sy = y / sc;
        ctx.drawImage(canvas, sx - R / z / sc, sy - R / z / sc, (2 * R) / z / sc, (2 * R) / z / sc, cx - R, cy - R, 2 * R, 2 * R);
        ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 10, cy); ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy + 10); ctx.stroke();
        ctx.restore();
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      }
    };
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * (w / r.width), (e.clientY - r.top) * (h / r.height)]; };
    const down = (e) => {
      const [x, y] = pos(e);
      let best = -1, bd = 40 * 40;
      P.forEach(([px, py], i) => { const d = (px - x) ** 2 + (py - y) ** 2; if (d < bd) { bd = d; best = i; } });
      if (best >= 0) { drag = best; cv.setPointerCapture(e.pointerId); warped = null; draw(); e.preventDefault(); }
    };
    const move = (e) => { if (drag < 0) return; const [x, y] = pos(e); P[drag] = [clamp(x, 0, w), clamp(y, 0, h)]; draw(); };
    const up = () => { drag = -1; draw(); };
    cv.onpointerdown = down; cv.onpointermove = move; cv.onpointerup = up; cv.onpointercancel = up;
    draw();

    const go = $('#review-go');
    const cancel = $('#review-cancel');
    let working = false;
    const finish = (val) => { go.onclick = null; cancel.onclick = null; dlg.onclose = null; resolve(val); };
    cancel.onclick = () => { if (!working) { dlg.close(); finish(null); } else cancel.blur(); };
    dlg.onclose = () => finish(null);
    go.onclick = async (e) => {
      e.preventDefault();
      if (working) return;
      working = true; go.disabled = true;
      try {
        const real = P.map(([x, y]) => [x / sc, y / sc]);
        const forced = parseInt(sel.value, 10);
        msg.textContent = 'Enderezando la hoja…';
        await new Promise((r) => requestAnimationFrame(r));
        if (!warped) warped = warpPage(canvas, real);
        let page = forced;
        if (page < 0) page = detectPageCode(warped.R, warped.W, warped.H);
        if (page < 0) { msg.textContent = 'No pude saber qué página es. Elegila en la lista y volvé a tocar “Procesar”.'; return; }
        sel.value = String(page);
        const res = await extractGlyphs(warped.R, warped.W, warped.H, page, (t) => { msg.textContent = t; });
        const src = 'foto-' + Date.now();
        const list = res.glyphs.map((g) => ({ ...g, source: src }));
        if (list.length) await DB.addGlyphs(list);
        await reloadGlyphs();
        dlg.onclose = null;
        dlg.close();
        finish({ page, added: list.length, empty: res.empty.length });
      } catch (err) {
        console.error(err);
        msg.textContent = 'Algo salió mal al procesar esta foto. Probá ajustar las esquinas o sacar otra foto.';
      } finally { working = false; go.disabled = false; }
    };
    dlg.showModal();
  });
}

async function handleFiles(files) {
  for (const f of files) {
    try {
      busy('Abriendo la foto…');
      await new Promise((r) => setTimeout(r, 30));
      const canvas = await loadPhoto(f);
      let pts = null;
      try { pts = detectMarkers(canvas); } catch (e) { console.warn(e); }
      unbusy();
      const res = await reviewPhoto(canvas, pts || defaultCorners(canvas), !!pts);
      if (res) {
        toast(`Página ${res.page + 1}: guardé ${res.added} ${res.added === 1 ? 'carácter' : 'caracteres'}${res.empty ? ` (${res.empty} casilleros vacíos)` : ''}.`, 5200);
        if (!S.sourceTouched && S.source === 'auto') applySource();
      }
    } catch (e) {
      unbusy(); console.error(e); toast('No pude abrir esa imagen.');
    }
  }
}

function setupHand() {
  buildTemplateGrid();
  $('#file-cam').addEventListener('change', (e) => { handleFiles([...e.target.files]); e.target.value = ''; });
  $('#file-pick').addEventListener('change', (e) => { handleFiles([...e.target.files]); e.target.value = ''; });
  $('#hand-export').addEventListener('click', async () => {
    try {
      const blob = await DB.exportHand();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'mi-letra.pyl.gz'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { console.error(e); toast('No pude exportar.'); }
  });
  $('#hand-import').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try { const n = await DB.importHand(f); await reloadGlyphs(); toast(`Importé ${n} variantes.`); }
    catch (err) { console.error(err); toast(err.message || 'No pude importar ese archivo.'); }
  });
  $('#hand-clear').addEventListener('click', async () => {
    if (!confirm('Se borra toda tu letra guardada en este dispositivo. ¿Seguro?')) return;
    await DB.clearGlyphs(); await reloadGlyphs(); toast('Listo, borré tu letra.');
  });
  // arrastrar y soltar fotos
  addEventListener('dragover', (e) => e.preventDefault());
  addEventListener('drop', (e) => {
    if (document.body.dataset.view !== 'hand') return;
    e.preventDefault();
    const fs = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (fs.length) handleFiles(fs);
  });
}

/* ------------------------------------------------------------------ */
/* Arranque                                                            */
/* ------------------------------------------------------------------ */
async function init() {
  await loadDemoFont();
  try { lib.setMine(await DB.allGlyphs()); } catch (e) { console.warn(e); }
  applySource();

  writer = new Writer($('#sheet'), lib, () => S);
  writer.onChange = updatePager;
  buildControls();
  setupInput();
  setupNote();
  setupVersions();
  setupPrint();
  setupHand();
  renderCoverage();
  renderHandStatus();

  $('#btn-new').addEventListener('click', () => {
    if (writer.text.trim() && !confirm('¿Empezar una carta nueva? Se descarta el borrador actual (si querés conservarlo, antes guardalo como versión).')) return;
    S.seed = 1 + Math.floor(Math.random() * 1e6); saveSettings();
    writer.setText(''); writer._syncCap(); persistDraft();
    if (!isMobile()) $('#cap').focus({ preventScroll: true });
  });
  $('#pg-prev').addEventListener('click', () => writer.setPage(writer.page - 1));
  $('#pg-next').addEventListener('click', () => writer.setPage(writer.page + 1));
  $('#z-in').addEventListener('click', () => { zoom = clamp(zoom * 1.2, 0.6, 3.2); fit(); });
  $('#z-out').addEventListener('click', () => { zoom = clamp(zoom / 1.2, 0.6, 3.2); fit(); });
  $('#z-fit').addEventListener('click', () => { zoom = 1; fit(); $('#scroller').scrollTo({ top: 0 }); });
  $$('.tab').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  $$('.dock-btn[data-drawer]').forEach((b) => b.addEventListener('click', () => toggleDrawer(b.dataset.drawer)));

  const draft = LS.get('pyl.draft', { text: '' });
  writer.setText(draft.text || '');
  writer._syncCap();
  setView('write');
  fit();
  new ResizeObserver(debounce(fit, 60)).observe($('#scroller'));

  const vv = window.visualViewport;
  if (vv) {
    const onVV = () => {
      document.documentElement.style.setProperty('--app-h', vv.height + 'px');
      document.body.classList.toggle('kb', isMobile() && vv.height < window.innerHeight * 0.78);
      fit();
    };
    vv.addEventListener('resize', onVV);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) LS.set('pyl.draft', { text: writer.text }); });

  if (!isMobile()) $('#cap').focus({ preventScroll: true });
  if (!lib.hasMine()) setTimeout(() => toast('Estás escribiendo con una letra de ejemplo. Cargá la tuya en “Mi letra”.', 6000), 1200);

  window.__pyl = { writer, lib, get S() { return S; }, reloadGlyphs, setView };

  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !location.hostname.includes('localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init().catch((e) => { console.error(e); document.body.insertAdjacentHTML('beforeend', `<pre style="padding:20px;color:#a33">Error al iniciar: ${e.message}</pre>`); });
