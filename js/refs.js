// Archivero de cartas de referencia (mueble con cajones en 3D) y la referencia en uso:
// al costado, en una ventana flotante o «fantasma» sobre la hoja.
import { $, $$, uid, debounce, hash } from './util.js';
import * as DB from './db.js';
import { layoutText } from './layout.js';
import { getSprite, PAD } from './glyphs.js';
import { icon } from './icons.js';

const COLORS = [['Crema', '#fff4d6'], ['Celeste', '#dcefff'], ['Rosa', '#ffe1ea'], ['Menta', '#ddf6e6'], ['Lila', '#ebe3fb'], ['Blanco', '#ffffff']];
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const folderOf = (r) => (r.folder || '').trim() || 'Sueltas';
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const hexOf = (rgb) => { const m = rgb.match(/\d+(\.\d+)?/g); return m ? '#' + m.slice(0, 3).map((v) => Math.round(+v).toString(16).padStart(2, '0')).join('') : '#222222'; };

// h = { S(), saveSettings(), writer(), lib, toast, ask, isMobile, LS, isNoteOpen(), openNote(), download(blob, name) }
export function setupRefs(h) {
  let refs = [];
  let q = '';
  let activeId = h.LS.get('pyl.activeRef', null);
  let peekId = null;
  let editingId = null;
  const openDrawers = new Set(h.LS.get('pyl.cabOpen', []));
  const byId = (id) => refs.find((r) => r.id === id) || null;
  const active = () => byId(activeId);

  /* ------------------------------------------------------------------ */
  /* Datos                                                               */
  /* ------------------------------------------------------------------ */
  async function load() {
    try { refs = await DB.allRefs(); } catch (e) { console.warn('No pude leer el archivero', e); refs = []; }
    refs.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    if (activeId && !byId(activeId)) activeId = null;
    render(); applyActive();
  }
  async function save(r) {
    r.ts = Date.now();
    await DB.putRef(r);
    const i = refs.findIndex((x) => x.id === r.id);
    if (i >= 0) refs[i] = r; else refs.unshift(r);
    refs.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    render();
    if (activeId === r.id) applyActive();
  }
  async function remove(id) {
    await DB.deleteRef(id);
    refs = refs.filter((r) => r.id !== id);
    if (activeId === id) { activeId = null; h.LS.set('pyl.activeRef', null); }
    render(); applyActive();
  }

  /* ------------------------------------------------------------------ */
  /* El mueble                                                           */
  /* ------------------------------------------------------------------ */
  function render() {
    const host = $('#cabinet');
    const needle = norm(q.trim());
    const shown = refs.filter((r) => !needle || norm(`${r.title} ${folderOf(r)} ${r.text}`).includes(needle));
    $('#cab-count').textContent = !refs.length ? '' : needle ? `${shown.length} de ${refs.length} cartas` : `${refs.length} ${refs.length === 1 ? 'carta' : 'cartas'}`;
    host.innerHTML = '';
    if (!refs.length) {
      const e = el('div', 'cab-empty');
      e.append(el('b', '', 'El archivero está vacío'), el('span', 'muted', 'Sumá tu primera carta de referencia con «Nueva carta». Después podés buscarla, abrirla y arrastrarla a la referencia.'));
      host.append(e); return;
    }
    if (!shown.length) { host.append(el('div', 'cab-empty', 'Ninguna carta coincide con la búsqueda.')); return; }
    const groups = new Map();
    for (const r of shown) { const f = folderOf(r); if (!groups.has(f)) groups.set(f, []); groups.get(f).push(r); }
    const names = [...groups.keys()].sort((a, b) => (a === 'Sueltas') - (b === 'Sueltas') || a.localeCompare(b, 'es'));
    names.forEach((name, di) => {
      const list = groups.get(name);
      const drw = el('section', 'drw');
      const isOpen = needle ? true : openDrawers.has(name);
      drw.classList.toggle('open', isOpen);
      drw.style.setProperty('--d', di);
      const front = el('button', 'drw-front');
      front.type = 'button'; front.setAttribute('aria-expanded', isOpen);
      front.append(el('span', 'knob'), el('b', 'nm', name), el('span', 'cnt', String(list.length)));
      front.addEventListener('click', () => {
        const open = !drw.classList.contains('open');
        drw.classList.toggle('open', open); front.setAttribute('aria-expanded', open);
        if (open) openDrawers.add(name); else openDrawers.delete(name);
        h.LS.set('pyl.cabOpen', [...openDrawers]);
      });
      const tray = el('div', 'drw-tray'), inner = el('div', 'drw-inner'), strip = el('div', 'strip');
      strip.setAttribute('role', 'list');
      list.forEach((r, i) => strip.append(sheetEl(r, i, needle)));
      inner.append(strip); tray.append(inner);
      drw.append(front, tray); host.append(drw);
    });
    markActive();
  }

  function sheetEl(r, i, needle) {
    const wrap = el('div', 'sht-w'); wrap.setAttribute('role', 'listitem');
    const b = el('button', 'sht'); b.type = 'button'; b.dataset.id = r.id;
    b.style.setProperty('--c', r.color || COLORS[0][1]);
    b.style.setProperty('--i', i);
    b.style.setProperty('--tilt', ((hash(7, i + r.id.length, 3) - 0.5) * 5).toFixed(2) + 'deg');
    b.setAttribute('aria-label', `${r.title}. Carta del cajón ${folderOf(r)}`);
    b.classList.toggle('hit', !!needle);
    const t = el('b', 'st', r.title || 'Sin título');
    const sn = el('span', 'ss', r.text.replace(/\s+/g, ' ').slice(0, 150));
    const chk = el('i', 'act'); chk.innerHTML = icon('check'); chk.setAttribute('aria-hidden', 'true');
    b.append(t, sn, chk);
    b.addEventListener('pointerdown', (e) => pointerDown(e, r, b));
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); peek(r.id); } });
    b.addEventListener('contextmenu', (e) => { if (drag) e.preventDefault(); });
    wrap.append(b);
    return wrap;
  }
  const markActive = () => $$('.sht').forEach((b) => b.classList.toggle('on', b.dataset.id === activeId));

  /* ver de cerca */
  function peek(id) {
    const r = byId(id); if (!r) return;
    peekId = id;
    const p = $('#peek'), sh = $('#peek-sheet');
    sh.style.setProperty('--c', r.color || COLORS[0][1]);
    $('#peek-title').textContent = r.title || 'Sin título';
    $('#peek-folder').textContent = `Cajón: ${folderOf(r)}`;
    $('#peek-text').textContent = r.text;
    $('#peek-use').textContent = activeId === id ? 'Ya es la referencia' : 'Usar como referencia';
    $('#peek-use').disabled = activeId === id;
    p.hidden = false;
    sh.classList.remove('in'); void sh.offsetWidth; sh.classList.add('in');
    $('#peek-use').focus({ preventScroll: true });
  }
  function closePeek() { if ($('#peek').hidden) return false; $('#peek').hidden = true; const b = peekId && $(`.sht[data-id="${peekId}"]`); peekId = null; b?.focus({ preventScroll: true }); return true; }

  /* ------------------------------------------------------------------ */
  /* Arrastrar una carta hasta la referencia                             */
  /* ------------------------------------------------------------------ */
  let drag = null;
  const mode = () => (h.S().refMode === 'float' && h.isMobile() ? 'panel' : h.S().refMode);
  function pointerDown(e, r, node) {
    if (e.button > 0) return;
    drag = { r, node, x0: e.clientX, y0: e.clientY, id: e.pointerId, started: false, touch: e.pointerType === 'touch', timer: 0, ghost: null, moved: false };
    if (drag.touch && !h.isMobile()) drag.timer = setTimeout(() => { if (drag) startDrag(); }, 360);
  }
  function startDrag() {
    drag.started = true;
    const g = drag.node.cloneNode(true);
    g.classList.add('drag-ghost'); g.removeAttribute('data-id');
    const r = drag.node.getBoundingClientRect();
    g.style.width = r.width + 'px'; g.style.height = r.height + 'px';
    document.body.append(g);
    drag.ghost = g; drag.dx = drag.x0 - r.left; drag.dy = drag.y0 - r.top;
    drag.node.classList.add('lifted');
    document.body.classList.add('dragging-ref');
    const m = mode();
    if (m !== 'ghost') h.openNote(); // el destino tiene que estar a la vista
    $('#view-write').classList.add('drop-on');
    $('#view-write').dataset.drop = m;
    try { drag.node.setPointerCapture(drag.id); } catch { /* nada */ }
  }
  function overTarget(x, y) {
    const m = mode();
    if (m === 'float') { const b = $('#refwin').getBoundingClientRect(); return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom; }
    if (m === 'ghost') { const b = $('#scroller').getBoundingClientRect(); return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom; }
    return x > window.innerWidth - 372 && y > 64;
  }
  document.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dist = Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0);
    if (dist > 8) drag.moved = true;
    if (!drag.started) {
      if (drag.touch) { if (dist > 10) { clearTimeout(drag.timer); drag = null; } return; }
      if (dist > 7 && !h.isMobile()) startDrag(); else return;
    }
    drag.ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px) rotate(${Math.max(-8, Math.min(8, (e.clientX - drag.x0) / 40))}deg) scale(1.04)`;
    $('#view-write').classList.toggle('drop-over', overTarget(e.clientX, e.clientY));
  });
  document.addEventListener('touchmove', (e) => { if (drag && drag.started) e.preventDefault(); }, { passive: false });
  const endDrag = (e, cancelled) => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const d = drag; drag = null; clearTimeout(d.timer);
    const vw = $('#view-write');
    if (d.started) {
      const hit = !cancelled && e && overTarget(e.clientX, e.clientY);
      d.ghost.classList.add(hit ? 'land' : 'back');
      setTimeout(() => d.ghost.remove(), 240);
      d.node.classList.remove('lifted');
      document.body.classList.remove('dragging-ref');
      vw.classList.remove('drop-on', 'drop-over'); delete vw.dataset.drop;
      if (hit) useRef(d.r.id);
      d.node.dataset.swallow = '1'; setTimeout(() => delete d.node.dataset.swallow, 50);
    } else if (!cancelled && !d.moved) {
      peek(d.r.id);
    }
  };
  document.addEventListener('pointerup', (e) => endDrag(e, false));
  document.addEventListener('pointercancel', (e) => endDrag(e, true));

  /* ------------------------------------------------------------------ */
  /* La referencia en uso                                                */
  /* ------------------------------------------------------------------ */
  function useRef(id) {
    activeId = id; h.LS.set('pyl.activeRef', id);
    applyActive(); markActive();
    const r = byId(id);
    if (mode() !== 'ghost' && !h.isMobile()) h.openNote();
    h.toast(`«${r.title}» quedó como referencia.`, 2600);
    if (peekId) peek(peekId);
  }
  function dropRef() { activeId = null; h.LS.set('pyl.activeRef', null); applyActive(); markActive(); }

  function applyActive() {
    const r = active();
    $('#ref-title').textContent = r ? r.title : 'Nota de referencia';
    $('#note-text').hidden = !!r;
    $('#ref-view').hidden = !r;
    $('#note-clear').hidden = !!r;
    $('#ref-drop').hidden = !r;
    $('#ref-font').hidden = !r;
    if (r) renderView(r);
    refreshGhost();
    $('#refc').classList.toggle('is-ref', !!r);
  }

  let viewSig = '';
  function renderView(r, force = false) {
    const host = $('#ref-view'), font = h.S().refFont;
    const w = Math.round(host.clientWidth);
    const sig = [r.id, r.text.length, r.ts, font, h.S().noteSize, w, h.lib.useMine, hexOf(getComputedStyle(host).color)].join('|');
    if (!force && sig === viewSig && host.firstChild) return;
    if (font === 'hand' && w < 40) return; // todavía sin medidas (cajón cerrado)
    viewSig = sig;
    host.innerHTML = '';
    host.style.setProperty('--fs-ref', h.S().noteSize + 'px');
    const btn = $('#ref-font');
    btn.textContent = font === 'hand' ? 'Letra legible' : 'Mi letra';
    btn.setAttribute('aria-label', font === 'hand' ? 'Mostrar con letra legible' : 'Mostrar con mi letra');
    if (font === 'hand') {
      try { host.append(handCanvas(r, w)); } catch (e) { console.warn(e); host.append(el('div', 'txt', r.text)); }
    } else host.append(el('div', 'txt', r.text));
  }

  // la carta de referencia escrita a mano (con tus variantes), en una columna angosta
  function handCanvas(r, cssW) {
    const S0 = h.S();
    const size = Math.max(0.5, (S0.noteSize / 17) * 0.95);
    const rs = {
      ...S0, size, letterSpacing: 0, imperfection: Math.min(S0.imperfection, 0.6), seed: 11 + Math.floor(hash(3, r.id.length * 7 + r.text.length, 1) * 9000),
      paper: { ...S0.paper, lineSpacing: 8 * size },
      geom: { pageW: 100, pageH: 8000, top: 2, bottom: 2, left: 2, right: 2 },
    };
    const L = layoutText(r.text, h.lib, rs);
    const mmH = (L.endLine + 1) * rs.paper.lineSpacing + 6;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const ppm = (cssW * dpr) / 100;
    const c = document.createElement('canvas');
    c.width = Math.round(100 * ppm); c.height = Math.max(8, Math.round(mmH * ppm));
    c.style.width = cssW + 'px'; c.style.height = (c.height / dpr) + 'px';
    c.setAttribute('role', 'img'); c.setAttribute('aria-label', 'Carta de referencia escrita a mano: ' + r.text.slice(0, 120));
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const style = { inst: 'pencil', color: hexOf(getComputedStyle($('#ref-view')).color), thickness: 0.12, pressure: 0.55 };
    for (const it of L.items) {
      if (!it) continue;
      const sp = getSprite(it.g, style), s = it.mm * ppm;
      ctx.save(); ctx.translate(it.x * ppm, it.y * ppm); ctx.rotate(it.rot); ctx.scale(s, s);
      ctx.globalAlpha = it.alpha; ctx.drawImage(sp, -PAD - it.g.w / 2, -PAD - it.g.base); ctx.restore();
    }
    return c;
  }

  /* modo fantasma: lo que se ve tenue sobre la hoja es la carta en uso o, si no hay, la nota */
  function refreshGhost() {
    const w = h.writer(); if (!w) return;
    const S = h.S();
    const r = active();
    const src = r ? r.text : $('#note-text').value;
    if (S.refMode === 'ghost' && src.trim()) w.setGhost(src, S.ghostAlpha); else w.setGhost(null);
  }

  /* dónde vive la referencia: cajón, ventana flotante (o fantasma, que solo suma el texto tenue) */
  const win = () => $('#refwin');
  function placeRef() {
    const floating = mode() === 'float';
    const refc = $('#refc'), host = floating ? $('#refwin-body') : $('#note');
    if (refc.parentElement !== host) host.append(refc);
    showNote(h.isNoteOpen());
  }
  function showNote(open) {
    const floating = mode() === 'float';
    $('#note').classList.toggle('open', open && !floating);
    $('#view-write').classList.toggle('note-open', open && !floating);
    win().hidden = !(open && floating);
    if (open && floating) restoreWin();
    if (open) requestAnimationFrame(() => { const r = active(); if (r) renderView(r); });
  }
  function restoreWin() {
    const w = win(), p = h.LS.get('pyl.refwin', null), vw = $('#view-write').getBoundingClientRect();
    const W = Math.min(p?.w || 340, vw.width - 20), H = Math.min(p?.h || 420, vw.height - 20);
    w.style.width = W + 'px'; w.style.height = H + 'px';
    w.style.left = Math.max(4, Math.min(p ? p.x : vw.width - W - 24, vw.width - W - 4)) + 'px';
    w.style.top = Math.max(4, Math.min(p ? p.y : 72, vw.height - 80)) + 'px';
  }
  (function floatDrag() {
    const bar = $('#refwin-bar');
    let st = null;
    bar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const w = win(); st = { x: e.clientX - w.offsetLeft, y: e.clientY - w.offsetTop, id: e.pointerId };
      bar.setPointerCapture(e.pointerId);
    });
    bar.addEventListener('pointermove', (e) => {
      if (!st || e.pointerId !== st.id) return;
      const w = win(), vw = $('#view-write').getBoundingClientRect();
      w.style.left = Math.max(0, Math.min(vw.width - 80, e.clientX - st.x)) + 'px';
      w.style.top = Math.max(0, Math.min(vw.height - 60, e.clientY - st.y)) + 'px';
    });
    const end = () => { if (!st) return; st = null; const w = win(); h.LS.set('pyl.refwin', { x: w.offsetLeft, y: w.offsetTop, w: w.offsetWidth, h: w.offsetHeight }); };
    bar.addEventListener('pointerup', end); bar.addEventListener('pointercancel', end);
    new ResizeObserver(debounce(() => { if (!win().hidden) { const w = win(); h.LS.set('pyl.refwin', { x: w.offsetLeft, y: w.offsetTop, w: w.offsetWidth, h: w.offsetHeight }); const r = active(); if (r) renderView(r); } }, 150)).observe(win());
    $('#refwin-close').addEventListener('click', () => h.closeNote());
  })();
  // en modo «a mano», la columna se vuelve a dibujar si cambia su ancho
  new ResizeObserver(debounce(() => { const r = active(); if (r && h.S().refFont === 'hand') renderView(r); }, 150)).observe($('#ref-view'));

  /* ------------------------------------------------------------------ */
  /* Crear y editar                                                      */
  /* ------------------------------------------------------------------ */
  function openEditor(id = null) {
    editingId = id;
    const r = id ? byId(id) : null;
    $('#refdlg-title').textContent = r ? 'Editar carta' : 'Nueva carta';
    $('#ref-t').value = r ? r.title : '';
    $('#ref-f').value = r ? (r.folder || '') : '';
    $('#ref-x').value = r ? r.text : '';
    pickColor(r ? r.color : COLORS[0][1]);
    $('#ref-folders').innerHTML = '';
    [...new Set(refs.map(folderOf))].forEach((f) => { const o = document.createElement('option'); o.value = f; $('#ref-folders').append(o); });
    $('#refdlg').showModal();
    $('#ref-t').focus();
  }
  let pickedColor = COLORS[0][1];
  function pickColor(c) {
    pickedColor = c;
    $$('#ref-colors .sw').forEach((b) => b.setAttribute('aria-pressed', b.dataset.color === c));
  }
  const host = $('#ref-colors');
  COLORS.forEach(([n, c]) => {
    const b = el('button', 'sw'); b.type = 'button'; b.style.background = c; b.title = n; b.setAttribute('aria-label', n); b.dataset.color = c;
    b.addEventListener('click', () => pickColor(c)); host.append(b);
  });
  $('#ref-save').addEventListener('click', async (e) => {
    e.preventDefault();
    const text = $('#ref-x').value.replace(/[\f\v]/g, '').trim();
    if (!text) { h.toast('Escribí el texto de la carta.'); $('#ref-x').focus(); return; }
    const old = editingId ? byId(editingId) : null;
    const title = $('#ref-t').value.trim() || text.split('\n')[0].slice(0, 50);
    await save({ ...(old || {}), id: old ? old.id : uid(), title, folder: $('#ref-f').value.trim(), color: pickedColor, text });
    $('#refdlg').close();
    if (old && peekId === old.id) peek(old.id);
    h.toast(old ? 'Carta guardada.' : 'Carta sumada al archivero.', 2200);
  });
  $('#ref-fromsheet').addEventListener('click', () => {
    const t = h.writer().text.replace(/[\f\v]/g, '').trim();
    if (!t) { h.toast('La hoja está vacía.'); return; }
    $('#ref-x').value = t; if (!$('#ref-t').value) $('#ref-t').value = t.split('\n')[0].slice(0, 50);
  });

  /* ------------------------------------------------------------------ */
  /* Eventos                                                             */
  /* ------------------------------------------------------------------ */
  $('#cab-add').addEventListener('click', () => openEditor());
  $('#cab-q').addEventListener('input', debounce((e) => { q = e.target.value; render(); }, 120));
  $('#peek-close').addEventListener('click', closePeek);
  $('#peek-use').addEventListener('click', () => { if (peekId) useRef(peekId); });
  $('#peek-edit').addEventListener('click', () => { if (peekId) openEditor(peekId); });
  $('#peek-del').addEventListener('click', async () => {
    const r = byId(peekId); if (!r) return;
    if (!(await h.ask('¿Borrar esta carta?', `«${r.title}» se saca del archivero. Esto no se puede deshacer.`, 'Borrar carta', true))) return;
    closePeek(); await remove(r.id); h.toast('Carta borrada.', 2000);
  });
  $('#peek').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closePeek(); } });
  $('#ref-drop').addEventListener('click', dropRef);
  $('#ref-font').addEventListener('click', () => { h.S().refFont = h.S().refFont === 'hand' ? 'legible' : 'hand'; h.saveSettings(); h.syncControls(); const r = active(); if (r) renderView(r, true); });
  $('#note-text').addEventListener('input', debounce(refreshGhost, 250));

  $('#cab-export').addEventListener('click', async () => {
    if (!refs.length) { h.toast('Todavía no hay cartas para exportar.'); return; }
    try { h.download(await DB.exportRefs(), 'archivero.pyl.gz'); h.toast('Archivero exportado.', 2200); } catch (e) { console.error(e); h.toast('No pude exportar el archivero.'); }
  });
  $('#cab-import').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try { const n = await DB.importRefs(f); await load(); h.toast(`Se sumaron ${n} cartas.`, 3000); } catch (err) { h.toast(err.message || 'No pude importar ese archivo.'); }
  });
  // un click que viene de soltar una carta arrastrada no debe abrir la vista de cerca
  document.addEventListener('click', (e) => { const b = e.target.closest?.('.sht'); if (b && b.dataset.swallow) e.stopPropagation(); }, true);

  load();
  placeRef();
  return {
    peekOpen: () => !$('#peek').hidden,
    closePeek,
    showNote,
    placeRef,
    refreshGhost,
    refreshView: () => { const r = active(); if (r) renderView(r, true); },
    hasRefs: () => refs.length,
  };
}
