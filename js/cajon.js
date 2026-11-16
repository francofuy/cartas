// El cajón del archivero: vive en una esquina, se abre al pasar el cursor y muestra las cartas de lomo.
// Al pasar por un lomo se levanta; al hacer clic la carta se muestra de frente para elegirla y arrastrarla a la referencia.
import { $, debounce } from './util.js';
import { icon } from './icons.js';
import { COLORS, norm, folderOf } from './refs.js';

const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

// h = { isMobile, onChange() }, R = API de refs.js
export function setupCajon(h, R) {
  const box = $('#cajon'), tray = $('#cabinet'), feat = $('#cj-feat'), fc = $('#fc'), handle = $('#cj-handle');
  let open = false, pinned = false, hover = false, searching = false, featId = null, q = '', closeT = 0;
  let drag = null;

  /* ------------------------------------------------------------------ */
  /* Abrir y cerrar                                                      */
  /* ------------------------------------------------------------------ */
  const wantOpen = () => pinned || hover || searching || !!featId || !!(drag && drag.started);
  function setOpen(v) {
    if (v === open) return;
    open = v;
    box.classList.toggle('open', v);
    handle.setAttribute('aria-expanded', v);
    if (!v) { setFeat(null); }
    h.onChange?.();
  }
  const scheduleClose = () => { clearTimeout(closeT); closeT = setTimeout(() => { if (!wantOpen()) setOpen(false); }, 450); };
  box.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'mouse') return; hover = true; clearTimeout(closeT); setOpen(true); });
  box.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'mouse') return; hover = false; scheduleClose(); });
  handle.addEventListener('click', () => { pinned = !pinned; if (pinned) setOpen(true); else if (!wantOpen()) setOpen(false); box.classList.toggle('pinned', pinned); });
  $('#cab-q').addEventListener('focus', () => { searching = true; });
  $('#cab-q').addEventListener('blur', () => { searching = false; scheduleClose(); });
  // la rueda recorre el cajón de lado a lado
  tray.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { tray.scrollLeft += e.deltaY; e.preventDefault(); }
  }, { passive: false });

  /* ------------------------------------------------------------------ */
  /* Las cartas de lomo                                                  */
  /* ------------------------------------------------------------------ */
  function render() {
    const list = R.list(), needle = norm(q.trim());
    const match = (r) => !needle || norm(`${r.title} ${folderOf(r)} ${r.text}`).includes(needle);
    const shown = list.filter(match);
    $('#cab-count').textContent = !list.length ? '' : needle ? `${shown.length} de ${list.length}` : String(list.length);
    tray.innerHTML = '';
    if (!list.length) { tray.append(el('p', 'cj-empty muted', 'El cajón está vacío. Sumá tu primera carta con «Nueva carta».')); return; }
    if (!shown.length) { tray.append(el('p', 'cj-empty muted', 'Ninguna carta coincide con la búsqueda.')); return; }
    const groups = new Map();
    for (const r of shown) { const f = folderOf(r); if (!groups.has(f)) groups.set(f, []); groups.get(f).push(r); }
    const names = [...groups.keys()].sort((a, b) => (a === 'Sueltas') - (b === 'Sueltas') || a.localeCompare(b, 'es'));
    names.forEach((name, gi) => {
      groups.get(name).forEach((r, i) => { const b = spine(r, i, needle); if (gi && !i) b.classList.add('gap'); tray.append(b); });
    });
    if (featId) markFeat();
  }

  function spine(r, i, needle) {
    const b = el('button', 'spine'); b.type = 'button'; b.dataset.id = r.id;
    b.style.setProperty('--c', r.color || COLORS[0][1]);
    b.style.setProperty('--h', 50 + ((r.id.charCodeAt(0) + i * 7) % 4) * 2 + 'px');
    b.setAttribute('aria-label', `${r.title}. Carta del cajón ${folderOf(r)}. Mostrar de frente`);
    b.classList.toggle('hit', !!needle);
    b.classList.toggle('on', R.activeId() === r.id);
    b.title = r.title || 'Sin título';
    const dot = el('i', 'act'); dot.innerHTML = icon('check'); dot.setAttribute('aria-hidden', 'true'); b.append(dot);
    b.addEventListener('click', () => setFeat(featId === r.id ? null : r.id, b));
    const say = () => { const hv = $('#cj-hover'); hv.textContent = ''; hv.append(el('b', '', r.title || 'Sin título'), document.createTextNode(` · ${folderOf(r)}`)); };
    b.addEventListener('pointerenter', say); b.addEventListener('focus', say);
    return b;
  }
  const markFeat = () => tray.querySelectorAll('.spine').forEach((s) => s.classList.toggle('out', s.dataset.id === featId));

 // flechas para recorrer las hojas con el teclado
  tray.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const all = [...tray.querySelectorAll('.spine')], i = all.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault(); all[Math.max(0, Math.min(all.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)))].focus();
  });
  tray.addEventListener('pointerleave', () => { $('#cj-hover').textContent = ''; });

  /* ------------------------------------------------------------------ */
  /* La carta de frente                                                  */
  /* ------------------------------------------------------------------ */
  function setFeat(id, from) {
    featId = id;
    if (!id) { feat.hidden = true; markFeat(); scheduleClose(); return; }
    const r = R.byId(id); if (!r) { featId = null; return; }
    fc.style.setProperty('--c', r.color || COLORS[0][1]);
    $('#fc-t').textContent = r.title || 'Sin título';
    $('#fc-s').textContent = r.text.replace(/[ \t]+\n/g, '\n').slice(0, 520) + (r.text.length > 520 ? '…' : '');
    $('#fc-use').textContent = R.activeId() === id ? 'Es la referencia' : 'Usar como referencia';
    $('#fc-use').disabled = R.activeId() === id;
    fc.classList.toggle('on', R.activeId() === id);
    // aparece sobre el lomo que se tocó
    if (from || feat.hidden) {
      const bw = box.getBoundingClientRect(), s = from ? from.getBoundingClientRect() : null;
      const x = s ? s.left - bw.left + s.width / 2 - 120 : 12;
      feat.style.left = Math.max(8, Math.min(bw.width - 256, x)) + 'px';
      feat.hidden = false;
      fc.classList.remove('in'); void fc.offsetWidth; fc.classList.add('in');
    }
    markFeat();
  }
  $('#fc-x').addEventListener('click', () => setFeat(null));
  $('#fc-use').addEventListener('click', () => { if (featId) { R.useRef(featId); setFeat(featId); } });
  $('#fc-open').addEventListener('click', () => { if (featId) R.peek(featId); });
  $('#fc-edit').addEventListener('click', () => { if (featId) R.openEditor(featId); });

  /* arrastrar la carta de frente hasta la referencia */
  fc.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || e.target.closest('button')) return;
    drag = { id: featId, x0: e.clientX, y0: e.clientY, pid: e.pointerId, started: false, ghost: null };
  });
  function startDrag() {
    const g = fc.cloneNode(true);
    g.removeAttribute('id'); g.classList.add('drag-ghost'); g.classList.remove('in');
    const b = fc.getBoundingClientRect();
    g.style.width = b.width + 'px'; g.style.height = b.height + 'px';
    document.body.append(g);
    drag.started = true; drag.ghost = g;
    drag.dx = Math.max(0, Math.min(b.width, drag.x0 - b.left)); drag.dy = Math.max(0, Math.min(b.height, drag.y0 - b.top));
    fc.classList.add('lifted');
    document.body.classList.add('dragging-ref');
    R.dragBegin();
    try { fc.setPointerCapture(drag.pid); } catch { /* nada */ }
  }
  document.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    if (!drag.started) { if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return; startDrag(); }
    const tilt = Math.max(-9, Math.min(9, (e.clientX - drag.x0) / 36));
    drag.ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px) rotate(${tilt}deg) scale(1.04)`;
    R.dragOver(e.clientX, e.clientY);
  });
  document.addEventListener('touchmove', (e) => { if (drag && drag.started) e.preventDefault(); }, { passive: false });
  function endDrag(e, cancelled) {
    if (!drag || (e && e.pointerId !== drag.pid)) return;
    const d = drag; drag = null;
    if (!d.started) { if (!cancelled && d.id) R.peek(d.id); return; }
    document.body.classList.remove('dragging-ref');
    fc.classList.remove('lifted');
    const hit = R.dragEnd(e ? e.clientX : 0, e ? e.clientY : 0, d.id, cancelled);
    d.ghost.classList.add(hit ? 'land' : 'back');
    setTimeout(() => d.ghost.remove(), 240);
    if (hit) setFeat(d.id);
    scheduleClose();
  }
  document.addEventListener('pointerup', (e) => endDrag(e, false));
  document.addEventListener('pointercancel', (e) => endDrag(e, true));

  /* ------------------------------------------------------------------ */
  /* Controles                                                           */
  /* ------------------------------------------------------------------ */
  $('#cab-add').addEventListener('click', () => R.openEditor());
  $('#cab-q').addEventListener('input', debounce((e) => { q = e.target.value; render(); }, 120));
  $('#cab-export').addEventListener('click', () => R.exportAll());
  $('#cab-import').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) R.importFile(f); });
  // clic fuera del cajón: la carta de frente vuelve a su lugar
  document.addEventListener('pointerdown', (e) => { if (featId && !box.contains(e.target) && !e.target.closest('#peek, #refdlg, #confirmdlg')) setFeat(null); });

  R.onChange(() => { render(); if (featId) { if (R.byId(featId)) setFeat(featId); else setFeat(null); } });
  render();

  return {
    isOpen: () => open,
    toggle() { pinned = !pinned; box.classList.toggle('pinned', pinned); setOpen(pinned || wantOpen()); if (!pinned) scheduleClose(); h.onChange?.(); },
    close() { pinned = false; hover = false; searching = false; box.classList.remove('pinned'); setFeat(null); setOpen(false); },
    // Esc: primero guarda la carta de frente, después cierra el cajón. Devuelve true si hizo algo.
    escape() {
      if (document.activeElement === $('#cab-q')) { $('#cab-q').blur(); if (!featId) return true; }
      if (featId) { setFeat(null); return true; }
      if (open) { this.close(); return true; }
      return false;
    },
  };
}
