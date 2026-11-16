import { $, $$, clamp, debounce, uid } from './util.js';
import { HandLibrary, INSTRUMENTS, loadDemoFont, clearSpriteCache } from './glyphs.js';
import { Writer } from './writer.js';
import * as DB from './db.js';
import { PAPER_PRESETS } from './paper.js';
import { TEMPLATE_PAGES, CHAR_GROUPS, ALL_CHARS, pageLabel } from './chars.js';
import { loadPhoto, detectMarkers, defaultCorners, warpPage, detectPageCode, extractGlyphs } from './capture.js';
import { printTemplates, PRINT_DPI_PPM } from './print.js';
import { createPrintFlow, printJobs } from './printflow.js';
import { icon, hydrateIcons } from './icons.js';
import { DEFAULT_THEME, applyTheme, Background, paintRange } from './theme.js';
import { buildChips, buildSwatches } from './controls.js';
import { setupPapers } from './papers.js';
import { setupRefs } from './refs.js';
import { setupCajon } from './cajon.js';
import { setupCurl } from './curl.js';
import { PenSound } from './sound.js';
import { setupLetters } from './letters.js';
import { exportBackup, importBackup, describe as describeBackup } from './backup.js';

/* ------------------------------------------------------------------ */
/* Ajustes y almacenamiento simple                                     */
/* ------------------------------------------------------------------ */
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin espacio o bloqueado */ } },
};
const SS = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* nada */ } },
};

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const DEFAULTS = {
  instrument: 'ballpoint', color: INSTRUMENTS.ballpoint.color, colorCustom: false,
  thickness: INSTRUMENTS.ballpoint.thickness, pressure: INSTRUMENTS.ballpoint.pressure,
  size: 1, letterSpacing: 0, wordSpacing: 0.8, imperfection: 0.7,
  paper: { ...PAPER_PRESETS.rayado },
  // si el sistema pide reducir el movimiento, la escritura animada arranca apagada
  animate: !reduceMotion(), speed: 1, source: 'auto', seed: 1 + Math.floor(Math.random() * 1e6),
  noteSize: 17,
  overflow: 'back',      // al llenarse una cara: 'back' = sigue en el dorso, 'new' = otra hoja
  printMode: 'duplex',   // 'duplex' | 'single' | 'manual'
  refMode: 'panel',      // dónde se ve la referencia: 'panel' (al costado) | 'float' (ventana) | 'ghost' (tenue sobre la hoja)
  refFont: 'legible',    // 'legible' | 'hand' (con mi letra)
  ghostAlpha: 0.3,
  sound: true,           // sonido suave de la lapicera al escribir
  soundVol: 0.5,
};
function loadSettings() {
  const saved = LS.get('pyl.settings', {});
  return { ...DEFAULTS, ...saved, paper: { ...DEFAULTS.paper, ...(saved.paper || {}) } };
}
let S = loadSettings();
const saveSettings = debounce(() => LS.set('pyl.settings', S), 250);

const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const setPath = (o, p, v) => { const ks = p.split('.'); const l = ks.pop(); ks.reduce((a, k) => a[k], o)[l] = v; };
const LAYOUT_KEYS = new Set(['size', 'letterSpacing', 'wordSpacing', 'imperfection', 'paper.lineSpacing', 'paper.margin', 'paper.marginX', 'paper.type', 'animate', 'overflow']);

/* ------------------------------------------------------------------ */
/* Estado                                                              */
/* ------------------------------------------------------------------ */
const lib = new HandLibrary();
let writer = null;
let zoom = 1;
let fitMode = LS.get('pyl.fit', 'width');
const isMobile = () => matchMedia('(max-width: 899px)').matches; // "compacto": celular y tablet vertical
const isTouch = () => matchMedia('(pointer: coarse)').matches;

// aviso breve; con `action` suma un botón (p. ej. «Deshacer»)
function toast(msg, ms = 3600, action = null) {
  const t = $('#toast'), btn = $('.tact', t);
  $('.tmsg', t).textContent = msg;
  btn.hidden = !action;
  btn.onclick = action ? () => { clearTimeout(toast._t); t.classList.remove('show'); action.run(); } : null;
  if (action) btn.textContent = action.label;
  t.classList.add('show');
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
  renderPages();
  renderHandStatus();
  updateNotice();
  refsApi?.refreshView();
}

/* ------------------------------------------------------------------ */
/* Controles de ajustes                                                */
/* ------------------------------------------------------------------ */
const INK_COLORS = [['Azul', '#1d2f8f'], ['Negro', '#16171c'], ['Azul medio', '#2f6fb5'], ['Rojo', '#a8222c'], ['Verde', '#1f5a3a'], ['Sepia', '#5a3a22'], ['Grafito', '#3a3a40']];

const sound = new PenSound();
const previewSound = debounce(() => sound.preview(S.instrument), 180);
function applySound() {
  sound.configure({ enabled: S.sound, volume: S.soundVol });
  const v = $('[data-s="soundVol"]'); if (v) v.disabled = !S.sound;
}
function settingChanged(path) {
  saveSettings();
  if (path === 'sound' || path === 'soundVol' || path === 'instrument') {
    applySound();
    if (S.sound && (path !== 'sound' || S.sound)) previewSound(); // se oye cómo queda
  }
  if (path === 'ghostAlpha') refsApi?.refreshGhost();
  if (path === 'animate' && !S.animate) writer.settle();
  if (LAYOUT_KEYS.has(path)) writer.relayout(); else writer.inkDirty = true;
  writer.schedule();
}

/* valores visibles junto a cada deslizador (con coma decimal) */
const fmt = (n, d = 1) => n.toFixed(d).replace('.', ',');
const pct = (v) => `${Math.round(v * 100)} %`;
const FORMAT = {
  thickness: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)} %`,
  pressure: pct,
  size: (v) => `×${fmt(v, 2)}`,
  letterSpacing: (v) => `${fmt(v)} mm`,
  wordSpacing: (v) => `${fmt(v)} mm`,
  imperfection: pct,
  speed: (v) => `×${fmt(v)}`,
  ghostAlpha: pct,
  soundVol: pct,
  'paper.lineSpacing': (v) => `${fmt(v)} mm`,
  'paper.grain': pct,
  'paper.lineWidth': (v) => `${fmt(v, 2)} mm`,
  'paper.lineOpacity': pct,
  'paper.marginX': (v) => `${Math.round(v)} mm`,
  'paper.imageOpacity': pct,
};
function defaultFor(path) {
  if (path === 'thickness') return INSTRUMENTS[S.instrument].thickness;
  if (path === 'pressure') return INSTRUMENTS[S.instrument].pressure;
  if (path === 'paper.lineSpacing') return PAPER_PRESETS[S.paper.type].lineSpacing;
  return getPath(DEFAULTS, path);
}

function enhanceRanges() {
  $$('label.field.range').forEach((lab) => {
    const input = $('input[type="range"]', lab);
    const lbl = $('.lbl', lab);
    const row = document.createElement('div');
    row.className = 'lbl-row';
    const out = document.createElement('output');
    out.className = 'val';
    row.append(lbl, out);
    lab.prepend(row);
    input._out = out;
    // doble clic o doble toque: vuelve al valor de fábrica
    input.addEventListener('dblclick', () => {
      const path = input.dataset.s;
      setPath(S, path, defaultFor(path));
      syncControls(); settingChanged(path);
    });
  });
}

function syncControls() {
  $$('[data-s]').forEach((el) => {
    const v = getPath(S, el.dataset.s);
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
    if (el._out) el._out.textContent = (FORMAT[el.dataset.s] || String)(parseFloat(el.value));
    if (el.type === 'range') paintRange(el);
  });
  ['#inst-chips', '#overflow-chips', '#refmode-chips', '#source-chips', '#ink-swatches'].forEach((id) => $(id)._refresh?.());
  papersApi?.sync();
  ['#paper-swatches', '#line-swatches', '#margin-swatches', '#deco-swatches'].forEach((id) => $(id)?._refresh?.());
  const sv = $('[data-s="soundVol"]'); if (sv) sv.disabled = !S.sound;
}

function setupResets() {
  $$('[data-reset]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.reset === 'pen') {
      const d = INSTRUMENTS[S.instrument];
      Object.assign(S, { thickness: d.thickness, pressure: d.pressure, color: d.color, colorCustom: false });
    } else if (b.dataset.reset === 'paper') {
      S.paper = JSON.parse(JSON.stringify(DEFAULTS.paper));
      settingChanged('paper.type'); syncControls(); toast('Papel restablecido.', 1800);
      return;
    } else {
      Object.assign(S, { size: DEFAULTS.size, letterSpacing: DEFAULTS.letterSpacing, wordSpacing: DEFAULTS.wordSpacing, imperfection: DEFAULTS.imperfection, speed: DEFAULTS.speed, animate: DEFAULTS.animate });
    }
    syncControls(); settingChanged('size'); writer.relayout();
    toast('Valores restablecidos.', 1800);
  }));
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
  buildChips($('#overflow-chips'), [['back', 'En el dorso'], ['new', 'En otra hoja']], () => S.overflow, (k) => { S.overflow = k; settingChanged('overflow'); });
  buildChips($('#refmode-chips'), [['panel', 'Al costado'], ['float', 'Ventana flotante'], ['ghost', 'Fantasma en la hoja']], () => S.refMode, (k) => { S.refMode = k; saveSettings(); refsApi?.placeRef(); refsApi?.refreshGhost(); });
  buildChips($('#source-chips'), [['auto', 'Automática'], ['mine', 'Mi letra'], ['demo', 'Ejemplo']], () => S.source, (k) => {
    S.source = k; applySource(); clearSpriteCache(); renderHandStatus(); settingChanged('source'); writer.relayout();
  });

  enhanceRanges();
  $$('[data-s]').forEach((el) => {
    el.addEventListener('input', () => {
      const path = el.dataset.s;
      const v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? parseFloat(el.value) : el.value;
      setPath(S, path, v);
      if (el._out) el._out.textContent = (FORMAT[path] || String)(v);
      if (el.type === 'range') paintRange(el);
      settingChanged(path);
    });
  });
  syncControls();
  setupResets();
  $('#motion-hint').hidden = !(reduceMotion() && !S.animate);
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
  const availH = sc.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) + 20;
  if (availW < 80 || availH < 80) return;
  // por defecto la hoja usa todo el ancho (hasta 760 px) para que la letra se lea; "Hoja entera" la ajusta a la altura
  const base = isMobile() ? availW : fitMode === 'page' ? Math.min(availW, (availH * 210) / 297) : Math.min(availW, 760);
  const w = Math.round(base * zoom);
  if (Math.abs(w - writer.cssW) > 1) writer.resize(w);
  curlApi?.place();
}

function faceLabel(info) {
  const f = info.faces[info.page], n = info.sheets.length;
  const hasBack = info.sheets[f.sheet].back != null;
  const side = f.side === 'back' ? 'dorso' : hasBack ? 'frente' : '';
  return { long: `Hoja ${f.sheet + 1} de ${n}${side ? ' · ' + side : ''}`, short: `${f.sheet + 1}/${n}${side ? ' ' + side : ''}`, f, hasBack };
}
function updatePager(info) {
  curlApi?.place();
  const lb = faceLabel(info);
  $('#pg-label').innerHTML = `<span class="long">${lb.long}</span><span class="short" aria-hidden="true">${lb.short}</span>`;
  const flip = $('#btn-flip');
  flip.querySelector('.lab').textContent = lb.f.side === 'back' ? 'Ver el frente' : lb.hasBack ? 'Ver el dorso' : 'Dar vuelta';
  flip.setAttribute('aria-label', lb.f.side === 'back' ? 'Dar vuelta la hoja y ver el frente' : lb.hasBack ? 'Dar vuelta la hoja y ver el dorso' : 'Dar vuelta la hoja y escribir en el dorso');
  $('#pg-prev').disabled = info.page <= 0;
  $('#pg-next').disabled = info.page >= info.pages - 1;
  // con una sola cara, las flechas no sirven de nada: se ocultan
  $('#pg-prev').hidden = $('#pg-next').hidden = info.pages <= 1;
  $('#empty-hint').hidden = info.text.length > 0;
  $('#empty-hint').textContent = isTouch() ? 'Tocá la hoja y empezá a escribir' : 'Hacé clic en la hoja y empezá a escribir';
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

const persistDraft = debounce(() => lettersApi?.saveActive(), 350);

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
  cap.addEventListener('focus', () => {
    if (cap.value === writer.text) cap.setSelectionRange(writer.caret, writer.caret);
    writer.focused = true; writer.blinkOn = true; writer.schedule();
  });
  cap.addEventListener('blur', () => { writer.focused = false; writer.schedule(); });
  // el anillo de foco de la hoja solo aparece si se llegó con el teclado
  document.addEventListener('keydown', (e) => { if (e.key === 'Tab') document.body.dataset.kbd = '1'; });
  document.addEventListener('pointerdown', () => { delete document.body.dataset.kbd; });

  $('#sheet').addEventListener('click', (e) => {
    const k = writer.hit(e.clientX, e.clientY);
    if (cap.value !== writer.text) syncCap();
    cap.focus({ preventScroll: true });
    cap.setSelectionRange(k, k);
    writer.setCaret(k);
    if (isMobile()) closeDrawers();
  });
  $('#skip-sheet').addEventListener('click', (e) => { e.preventDefault(); if (cap.value !== writer.text) syncCap(); cap.focus(); });
  $('#stage').addEventListener('pointerdown', (e) => { if (isMobile() && !e.target.closest('#sheet')) closeDrawers(); });
  syncCap();
}

/* ------------------------------------------------------------------ */
/* Cajones (celular) y vistas                                          */
/* ------------------------------------------------------------------ */
// Izquierda: ajustes (en #pop). Derecha: la referencia (nota o carta). El archivero es el cajón de la esquina («Cartas» lo deja abierto).
let openPanel = null, noteOpen = false;
function markDock() {
  $$('.dock-btn[data-panel]').forEach((b) => {
    const on = b.dataset.panel === 'note' ? noteOpen : b.dataset.panel === 'cab' ? !!cajonApi?.isOpen() : b.dataset.panel === openPanel;
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
  });
}
// el panel de Papel es más ancho cuando muestra la galería o la búsqueda
function fitLeft() {
  const pop = $('#pop');
  const wide = openPanel === 'paper' && !!papersApi?.isWide();
  pop.classList.toggle('wide', wide);
  $('#view-write').style.setProperty('--left-w', openPanel ? (wide ? '500px' : '376px') : '0px');
}
function setLeft(name) {
  openPanel = name;
  const pop = $('#pop');
  const sec = name ? $(`.sec[data-sec="${name}"]`, pop) : null;
  $$('.sec', pop).forEach((s) => { s.classList.toggle('act', s === sec); s.classList.remove('go'); });
  if (sec) {
    [...sec.children].forEach((c, i) => c.style.setProperty('--i', i));
    void sec.offsetWidth; sec.classList.add('go');
  }
  pop.classList.toggle('open', !!sec);
  pop.setAttribute('aria-label', sec ? sec.querySelector('h2').textContent : 'Ajustes');
  fitLeft();
  if (name === 'paper') papersApi?.onOpen();
  if (name && isMobile()) { $('#cap').blur(); setNote(false); cajonApi?.close(); }
  markDock();
}
function setNote(open) {
  noteOpen = open;
  refsApi?.showNote(open);
  if (open && isMobile()) { setLeft(null); cajonApi?.close(); $('#cap').blur(); }
  markDock();
}
function togglePanel(name) {
  if (name === 'note') setNote(!noteOpen);
  else if (name === 'cab') { if (isMobile()) { setLeft(null); setNote(false); } cajonApi.toggle(); }
  else setLeft(openPanel === name ? null : name);
}
const closeDrawers = () => { setLeft(null); setNote(false); };
let refsApi = null, cajonApi = null, papersApi = null, curlApi = null, lettersApi = null;

/* ------------------------------------------------------------------ */
/* Hojas: dar vuelta, tomar otra, cambiar de cara                      */
/* ------------------------------------------------------------------ */
const animOn = () => !!(THEME && THEME.anim) && !reduceMotion();

// la hoja gira sobre su borde largo al pasar del frente al dorso; entre hojas desliza
async function changeFace(kind, change) {
  const wrap = $('.sheet-wrap');
  if (!animOn() || !wrap.animate) { change(); return; }
  const dx = kind === 'next' ? 28 : -28;
  const out = kind === 'flip' ? [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(88deg)' }] : [{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: `translateX(${-dx}px)` }];
  const inn = kind === 'flip' ? [{ transform: 'rotateY(-88deg)' }, { transform: 'rotateY(0deg)' }] : [{ opacity: 0, transform: `translateX(${dx}px)` }, { opacity: 1, transform: 'translateX(0)' }];
  try {
    await wrap.animate(out, { duration: kind === 'flip' ? 170 : 110, easing: 'ease-in' }).finished;
    change();
    await wrap.animate(inn, { duration: kind === 'flip' ? 230 : 170, easing: 'cubic-bezier(.23,1,.32,1)' }).finished;
  } catch { change(); }
}
function goPage(p) {
  const L = writer.layout;
  p = clamp(p, 0, L.pages - 1);
  if (p === writer.page) return;
  const a = L.faces[writer.page], b = L.faces[p];
  changeFace(a.sheet === b.sheet ? 'flip' : p > writer.page ? 'next' : 'prev', () => writer.setPage(p));
}
// dónde termina una cara: donde empieza la siguiente (o el final del texto)
function faceEnd(f) {
  const L = writer.layout, n = writer.text.length;
  let k = 0;
  while (k <= n && L.caret[k].page <= f) k++;
  if (k > n) return n;
  return /[\f\v]/.test(writer.text[k - 1] || '') ? k - 1 : k; // si la corta una marca, se inserta antes de ella
}
function insertMarker(ch, at) {
  writer.edit(at, 0, ch, at + 1);
  writer._syncCap(); persistDraft();
  if (!isMobile()) $('#cap').focus({ preventScroll: true });
}
// a qué cara lleva el gesto de la esquina: derecha = siguiente (o el dorso, si todavía no existe), izquierda = anterior
function turnTargets() {
  if (!writer || !writer.layout) return { fwd: null, back: null };
  const L = writer.layout, cur = writer.page;
  const back = cur > 0 ? { idx: cur - 1, apply: () => writer.setPage(cur - 1) } : null;
  let fwd = null;
  if (cur < L.pages - 1) fwd = { idx: cur + 1, apply: () => writer.setPage(cur + 1) };
  else if (L.faces[cur].side === 'front') fwd = { idx: L.pages, apply: () => insertMarker('\v', faceEnd(cur)) };
  return { fwd, back };
}
function setupSheetOps() {
  $('#btn-flip').addEventListener('click', () => {
    const L = writer.layout, f = L.faces[writer.page], sh = L.sheets[f.sheet];
    if (f.side === 'back') { goPage(sh.front); return; }
    if (sh.back != null) { goPage(sh.back); return; }
    changeFace('flip', () => insertMarker('\v', faceEnd(writer.page)));
  });
  $('#btn-sheet').addEventListener('click', () => {
    const L = writer.layout, f = L.faces[writer.page], i = f.sheet;
    if (L.sheets[i + 1]) { goPage(L.sheets[i + 1].front); return; }
    const last = L.pages - 1, n = writer.text.length;
    let a = 0; while (a <= n && L.caret[a].page < last) a++;
    if (!writer.text.slice(a).replace(/[\f\v\s]/g, '')) { toast('Esta hoja todavía está vacía: escribí algo antes de tomar otra.'); return; }
    changeFace('next', () => insertMarker('\f', n));
  });
}

let viewReady = false;
function setView(v) {
  const changed = document.body.dataset.view !== v;
  document.body.dataset.view = v;
  $$('.tab').forEach((b) => b.setAttribute('aria-pressed', b.dataset.view === v));
  $('#seg').style.setProperty('--i', v === 'hand' ? 1 : 0);
  $('#view-write').hidden = v !== 'write';
  $('#view-hand').hidden = v !== 'hand';
  $('#btn-print').hidden = v !== 'write';
  if (v !== 'write') cajonApi?.close();
  if (v === 'hand') updateBackupInfo();
  if (v === 'write') requestAnimationFrame(fit);
  closeDrawers();
  if (viewReady && changed) { // fundido corto, solo al cambiar de sección
    const el = $('#view-' + v);
    el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter');
  }
}

/* confirmación propia (los confirm() del navegador están bloqueados en algunos entornos) */
function ask(title, text, okLabel = 'Aceptar', danger = false) {
  return new Promise((resolve) => {
    const dlg = $('#confirmdlg');
    $('#confirm-title').textContent = title;
    $('#confirm-text').textContent = text;
    const ok = $('#confirm-ok');
    ok.textContent = okLabel;
    ok.classList.toggle('primary', !danger);
    ok.classList.toggle('danger', danger);
    dlg.returnValue = '';
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
    dlg.showModal();
  });
}

/* ------------------------------------------------------------------ */
/* Nota de referencia                                                  */
/* ------------------------------------------------------------------ */
function setupNote() {
  const ta = $('#note-text');
  ta.value = LS.get('pyl.note', '');
  ta.style.fontSize = S.noteSize + 'px';
  ta.addEventListener('input', debounce(() => LS.set('pyl.note', ta.value), 300));
  $('#note-clear').addEventListener('click', async () => {
    if (ta.value && !(await ask('¿Borrar la nota de referencia?', 'El texto de la nota se pierde. La carta de la hoja no se toca.', 'Borrar nota', true))) return;
    ta.value = ''; LS.set('pyl.note', '');
  });
  const sz = (d) => { S.noteSize = clamp(S.noteSize + d, 13, 28); ta.style.fontSize = S.noteSize + 'px'; saveSettings(); };
  $('#note-smaller').addEventListener('click', () => sz(-1));
  $('#note-bigger').addEventListener('click', () => sz(1));
}

/* ------------------------------------------------------------------ */
/* Versiones                                                           */
/* ------------------------------------------------------------------ */
let lastDeletedVersion = null; // { v, i }: se puede deshacer mientras la ventana siga abierta
function renderVersions() {
  const list = LS.get('pyl.versions', []).filter((v) => !v.draftId || v.draftId === lettersApi?.activeId());
  const ul = $('#ver-list');
  ul.innerHTML = '';
  if (lastDeletedVersion) {
    const li = document.createElement('li'); li.className = 'undo';
    const sp = document.createElement('span'); sp.className = 't'; sp.textContent = `«${lastDeletedVersion.v.name}» borrada.`;
    const un = document.createElement('button'); un.type = 'button'; un.className = 'btn'; un.textContent = 'Deshacer';
    un.addEventListener('click', () => { const l = LS.get('pyl.versions', []); l.splice(Math.min(lastDeletedVersion.i, l.length), 0, lastDeletedVersion.v); LS.set('pyl.versions', l); lastDeletedVersion = null; renderVersions(); });
    li.append(sp, un); ul.append(li);
  }
  if (!list.length) { const li = document.createElement('li'); li.className = 'muted'; li.textContent = 'Todavía no guardaste ninguna versión.'; ul.append(li); return; }
  for (const v of list) {
    const li = document.createElement('li');
    const t = document.createElement('div'); t.className = 't';
    const b = document.createElement('b'); b.textContent = v.name;
    const sm = document.createElement('small'); sm.textContent = new Date(v.ts).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' }) + ` · ${v.text.length} caracteres`;
    t.append(b, sm);
    const open = document.createElement('button'); open.type = 'button'; open.className = 'btn'; open.textContent = 'Abrir';
    open.addEventListener('click', async () => {
      if (writer.text && writer.text !== v.text) {
        $('#versions').close();
        if (!(await ask('¿Reemplazar la carta actual?', 'Se abre esta versión y el texto de la hoja se reemplaza. Si querés conservarlo, guardalo antes como versión.', 'Abrir versión'))) return;
      }
      writer.setText(v.text); writer._syncCap(); persistDraft();
      $('#versions').close();
    });
    const del = document.createElement('button'); del.type = 'button'; del.className = 'btn danger'; del.textContent = 'Borrar';
    del.addEventListener('click', () => {
      const all = LS.get('pyl.versions', []);
      lastDeletedVersion = { v, i: all.findIndex((x) => x.id === v.id) };
      LS.set('pyl.versions', all.filter((x) => x.id !== v.id)); renderVersions();
    });
    li.append(t, open, del);
    ul.append(li);
  }
}
function setupVersions() {
  $('#ver-save').addEventListener('click', () => {
    if (!writer.text.trim()) { toast('Escribí algo antes de guardar una versión.'); return; }
    const list = LS.get('pyl.versions', []);
    const name = $('#ver-name').value.trim() || writer.text.trim().split('\n')[0].slice(0, 40) || 'Sin título';
    list.unshift({ id: uid(), name, ts: Date.now(), text: writer.text, draftId: lettersApi?.activeId() });
    LS.set('pyl.versions', list.slice(0, 60));
    $('#ver-name').value = '';
    renderVersions();
    toast('Versión guardada.');
  });
}

/* ------------------------------------------------------------------ */
/* Imprimir                                                            */
/* ------------------------------------------------------------------ */
// lo que imprime el botón «Imprimir» de la barra: la carta que está en el editor
function editorSource() {
  const L = writer.layout;
  return {
    sheets: L.sheets, pages: L.pages,
    render: (i) => new Promise((res) => { const c = document.createElement('canvas'); writer.renderPageTo(c, i, PRINT_DPI_PPM); c.toBlob(res, 'image/jpeg', 0.95); }),
  };
}
let printflow = null;
function setupPrint() {
  printflow = createPrintFlow({ S: () => S, saveSettings, toast, busy, unbusy });
  $('#btn-print').addEventListener('click', () => {
    if (!writer.text.replace(/[\f\v\s]/g, '')) { toast('Escribí algo para poder imprimir.'); return; }
    printflow.open(editorSource());
  });
}

/* ------------------------------------------------------------------ */
/* MI LETRA                                                            */
/* ------------------------------------------------------------------ */
async function runTemplatePrint(pages) {
  const res = await printTemplates(pages);
  if (res === 'blocked') toast('Este entorno no deja abrir la impresión. Abrí la app directamente en el navegador para imprimir.', 6500);
}

// Lista de páginas de la plantilla, con cuántos caracteres de cada una ya cargaste
function renderPages() {
  const ul = $('#pages-list');
  if (!ul) return;
  ul.innerHTML = '';
  TEMPLATE_PAGES.forEach((chars, p) => {
    const have = chars.filter((c) => lib.mineCount(c) > 0).length;
    const done = have === chars.length;
    const li = document.createElement('li');
    const name = document.createElement('span'); name.className = 'pg-name'; name.textContent = `Página ${p + 1}`;
    const range = document.createElement('span'); range.className = 'pg-range'; range.textContent = pageLabel(p);
    const st = document.createElement('span'); st.className = 'pg-status' + (done ? ' done' : '');
    st.innerHTML = (done ? icon('check') : '') + `<span>${have} de ${chars.length}</span>`;
    const b = document.createElement('button'); b.className = 'btn sm'; b.textContent = 'Imprimir página';
    b.setAttribute('aria-label', `Imprimir página ${p + 1}`);
    b.addEventListener('click', () => runTemplatePrint([p]));
    li.append(name, range, st, b);
    ul.append(li);
  });
}

function buildTemplateGrid() {
  renderPages();
  $('#tpl-all').addEventListener('click', () => runTemplatePrint(TEMPLATE_PAGES.map((_, i) => i)));
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
    const x = document.createElement('button'); x.type = 'button'; x.innerHTML = icon('close'); x.title = 'Borrar esta variante'; x.setAttribute('aria-label', 'Borrar esta variante');
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
    let activeId = null;
    const down = (e) => {
      if (drag >= 0) return; // un segundo dedo no le saca el punto al primero
      const [x, y] = pos(e);
      let best = -1, bd = 40 * 40;
      P.forEach(([px, py], i) => { const d = (px - x) ** 2 + (py - y) ** 2; if (d < bd) { bd = d; best = i; } });
      if (best >= 0) { drag = best; activeId = e.pointerId; cv.setPointerCapture(e.pointerId); warped = null; draw(); e.preventDefault(); }
    };
    const move = (e) => { if (drag < 0 || e.pointerId !== activeId) return; const [x, y] = pos(e); P[drag] = [clamp(x, 0, w), clamp(y, 0, h)]; draw(); };
    const up = (e) => { if (e && e.pointerId !== undefined && e.pointerId !== activeId) return; drag = -1; activeId = null; draw(); };
    cv.onpointerdown = down; cv.onpointermove = move; cv.onpointerup = up; cv.onpointercancel = up; cv.onlostpointercapture = up;
    draw();

    const go = $('#review-go');
    const cancel = $('#review-cancel');
    let working = false;
    const finish = (val) => { go.onclick = null; cancel.onclick = null; dlg.onclose = null; dlg.oncancel = null; cancel.disabled = false; resolve(val); };
    cancel.onclick = () => { if (!working) { dlg.close(); finish(null); } };
    dlg.oncancel = (e) => { if (working) e.preventDefault(); }; // Escape no interrumpe el procesamiento
    dlg.onclose = () => finish(null);
    go.onclick = async (e) => {
      e.preventDefault();
      if (working) return;
      working = true; go.disabled = true; cancel.disabled = true;
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
      } finally { working = false; go.disabled = false; cancel.disabled = false; }
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
  // copia de seguridad única (letra, archivero, imágenes y hojas, versiones, nota)
  $('#backup-export').addEventListener('click', async () => {
    try {
      const { blob, counts } = await exportBackup(LS);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `puno-y-letra-copia-${new Date().toISOString().slice(0, 10)}.pyl.gz`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast(`Copia exportada: ${describeBackup({ ...counts, note: false }) || 'todavía no hay nada para guardar'}.`, 4200);
    } catch (e) { console.error(e); toast('No pude exportar la copia.'); }
  });
  $('#backup-import').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const c = await importBackup(f, LS);
      await reloadGlyphs(); await refsApi?.reload(); papersApi?.refreshAll(); updateBackupInfo();
      const d = describeBackup(c);
      toast(d ? `Importé ${d}.` : 'No había nada nuevo para sumar: ya lo tenías todo.', 4200);
    } catch (err) { console.error(err); toast(err.message || 'No pude importar ese archivo.'); }
  });
  $('#hand-clear').addEventListener('click', async () => {
    if (!(await ask('¿Borrar toda tu letra?', 'Se borran las letras guardadas en este dispositivo. Si no exportaste tu letra, para recuperarla vas a tener que fotografiar las plantillas de nuevo.', 'Borrar mi letra', true))) return;
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
/* resumen de lo que entra en la copia de seguridad */
async function updateBackupInfo() {
  const el = $('#backup-info'); if (!el) return;
  const refs = refsApi ? refsApi.list().length : 0, vers = LS.get('pyl.versions', []).length, papers = LS.get('pyl.papers', []).length;
  const d = describeBackup({ glyphs: lib.mineChars() ? (await DB.allGlyphs().catch(() => [])).length : 0, refs, papers: 0, savedPapers: papers, versions: vers, note: false });
  el.textContent = d ? `Hoy tenés: ${d}.` : 'Todavía no hay nada para guardar en una copia.';
}

/* aviso fijo mientras se use la letra de ejemplo */
function updateNotice() {
  const show = !lib.hasMine() && !LS.get('pyl.noticeHidden', false);
  $('#demo-notice').hidden = !show;
}
function setupNotice() {
  $('#notice-go').addEventListener('click', () => setView('hand'));
  $('#notice-close').addEventListener('click', () => { LS.set('pyl.noticeHidden', true); updateNotice(); fit(); });
  updateNotice();
}

/* onda al tocar el botón principal (E11) */
function setupRipple() {
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest?.('.btn.primary');
    if (!b || b.disabled || !document.body.classList.contains('anim-on')) return;
    const r = b.getBoundingClientRect(), s = document.createElement('span');
    const d = Math.max(r.width, r.height);
    s.className = 'r'; s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    b.append(s); s.addEventListener('animationend', () => s.remove());
  });
}

let THEME = null, BG = null;
function setupTheme() {
  THEME = JSON.parse(JSON.stringify(DEFAULT_THEME)); // el diseño elegido
  applyTheme(THEME);
  document.body.classList.toggle('anim-on', THEME.anim && !reduceMotion());
  BG = new Background($('#dots'));
}

async function init() {
  hydrateIcons();
  setupTheme();
  setupRipple();
  await loadDemoFont();
  try { lib.setMine(await DB.allGlyphs()); } catch (e) { console.warn(e); }
  applySource();

  writer = new Writer($('#sheet'), lib, () => S);
  writer.onChange = updatePager;
  writer.onStroke = (ch, dur) => sound.stroke(S.instrument, ch, dur);
  writer.onErase = (n) => sound.erase(n);
  applySound();
  // los navegadores solo dejan sonar después de un gesto: se destraba con el primer toque o tecla
  ['pointerdown', 'keydown'].forEach((ev) => addEventListener(ev, () => { if (S.sound) sound.unlock(); }, { once: true, capture: true }));
  buildControls();
  setupInput();
  setupNote();
  setupVersions();
  setupPrint();
  setupHand();
  renderCoverage();
  renderHandStatus();

  papersApi = setupPapers({ S: () => S, writer: () => writer, settingChanged, syncControls, toast, ask, LS, fitLeft });
  lettersApi = setupLetters({
    S: () => S, saveSettings, writer: () => writer, LS, toast, ask, busy, unbusy, get printflow() { return printflow; }, sound, animOn, isMobile,
    paperBlob: async (id) => papersApi?.imageBlob(id),
    onOpenDialog: () => { lastDeletedVersion = null; renderVersions(); },
  });
  refsApi = setupRefs({
    S: () => S, saveSettings, writer: () => writer, lib, toast, ask, isMobile, LS,
    inFocus: () => false, isNoteOpen: () => noteOpen, openNote: () => setNote(true), closeNote: () => setNote(false), syncControls,
    download: (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); },
  });
  cajonApi = setupCajon({ isMobile, onChange: () => markDock() }, refsApi);
  $('#pg-prev').addEventListener('click', () => goPage(writer.page - 1));
  $('#pg-next').addEventListener('click', () => goPage(writer.page + 1));
  setupSheetOps();
  curlApi = setupCurl({ writer: () => writer, targets: turnTargets, animOn, toast, onTurned: () => $('#scroller').scrollTo({ top: 0 }) });
  // un solo botón de vista: ancho completo → hoja entera → de cerca (en celular, sin «hoja entera»)
  const VIEWS = [{ fit: 'width', zoom: 1, label: 'Ancho' }, { fit: 'page', zoom: 1, label: 'Hoja entera' }, { fit: 'width', zoom: 1.5, label: 'De cerca' }];
  let viewIdx = clamp(LS.get('pyl.viewIdx', 0), 0, VIEWS.length - 1);
  if (isMobile() && VIEWS[viewIdx].fit === 'page') viewIdx = 0;
  const applyView = (scroll) => {
    const v = VIEWS[viewIdx];
    fitMode = v.fit; zoom = v.zoom;
    $('#btn-view .lab').textContent = v.label;
    $('#btn-view').setAttribute('aria-label', `Cambiar la vista de la hoja. Ahora: ${v.label.toLowerCase()}`);
    $('#btn-view').title = `Vista: ${v.label}. Tocá para cambiar.`;
    fit();
    if (scroll) $('#scroller').scrollTo({ top: 0 });
  };
  $('#btn-view').addEventListener('click', () => {
    do { viewIdx = (viewIdx + 1) % VIEWS.length; } while (isMobile() && VIEWS[viewIdx].fit === 'page');
    LS.set('pyl.viewIdx', viewIdx); applyView(true);
  });
  applyView(false);
  $$('.tab').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  $$('.dock-btn[data-panel]').forEach((b) => b.addEventListener('click', () => togglePanel(b.dataset.panel)));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
    if (refsApi?.peekOpen()) return; // la vista de cerca maneja su propio Esc
    if (cajonApi?.escape()) { $('.dock-btn[data-panel="cab"]')?.focus(); return; }
    if (openPanel) { const b = $(`.dock-btn[data-panel="${openPanel}"]`); setLeft(null); b?.focus(); }
    else if (noteOpen) { setNote(false); $('.dock-btn[data-panel="note"]')?.focus(); }
  });

  writer.setText(lettersApi.start());
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
  document.addEventListener('visibilitychange', () => { if (document.hidden) lettersApi?.saveActive(); });

  if (!isMobile()) $('#cap').focus({ preventScroll: true });
  setupNotice();
  viewReady = true;

  window.__pyl = { writer, lib, get S() { return S; }, reloadGlyphs, setView, printJobs: (mode) => printJobs(writer.layout.sheets, writer.layout.pages, mode) };

  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !location.hostname.includes('localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init().catch((e) => { console.error(e); document.body.insertAdjacentHTML('beforeend', `<pre style="padding:20px;color:#a33">Error al iniciar: ${e.message}</pre>`); });
