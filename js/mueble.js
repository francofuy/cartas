// El mueble del archivero: un objeto físico en el fondo de la app.
// Se recorre arrastrando el fondo, se abren los cajones, y las cartas se sacan con el mouse:
// se apoyan sobre el escritorio, vuelven al cajón o se sueltan sobre la referencia.
import { $, debounce } from './util.js';
import { icon } from './icons.js';
import { COLORS, norm, folderOf } from './refs.js';

const MW = 344; // ancho del mueble (px)
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

// h = { LS, isMobile, onFocus(on) }, R = API de refs.js
export function setupMueble(h, R) {
  const world = $('#world'), cam = $('#cam'), mueble = $('#mueble'), host = $('#cabinet'), desk = $('#desk');
  const openDrawers = new Set(h.LS.get('pyl.cabOpen', []));
  let q = '';
  let focus = false;
  let prev = null;
  const vw = () => window.innerWidth, vh = () => window.innerHeight;
  const saved = h.LS.get('pyl.cam', null);               // { rx, y }: distancia al borde derecho y arriba
  let RX = saved ? saved.rx : MW + 40;
  let C = { x: vw() - RX, y: saved ? saved.y : 136, z: 1 };

  /* ------------------------------------------------------------------ */
  /* Cámara: el fondo se arrastra                                        */
  /* ------------------------------------------------------------------ */
  function applyCam(animate = false) {
    cam.classList.toggle('moving', animate);
    cam.style.transform = `translate(${C.x}px, ${C.y}px) scale(${C.z})`;
  }
  const clampCam = () => { C.x = Math.max(-MW * C.z * 2.2, Math.min(vw() + 600, C.x)); C.y = Math.max(-1600, Math.min(vh() + 400, C.y)); };
  const saveCam = () => { if (!focus) { RX = vw() - C.x; h.LS.set('pyl.cam', { rx: RX, y: C.y }); } };
  function focusCam() {
    const mh = mueble.offsetHeight || 520, mob = h.isMobile();
    const z = Math.max(0.5, Math.min(1.12, (vw() - 24) / MW, (vh() - (mob ? 150 : 110)) / mh));
    const dock = mob ? 0 : 84;
    return { z, x: Math.round(dock + (vw() - dock - MW * z) / 2), y: Math.max(70, Math.round((vh() - mh * z) / 2 - (mob ? 34 : 0))) };
  }
  function setFocus(on) {
    if (on === focus) return;
    focus = on;
    if (on) { prev = { ...C }; C = focusCam(); document.activeElement?.blur?.(); }
    else { C = { x: vw() - RX, y: prev ? prev.y : C.y, z: 1 }; }
    document.body.classList.toggle('cab-focus', on);
    applyCam(true);
    h.onFocus?.(on);
  }

  let pan = null;
  world.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || e.target.closest('button, input, label, .sht, a, textarea')) return;
    pan = { x0: e.clientX, y0: e.clientY, cx: C.x, cy: C.y, id: e.pointerId };
    try { world.setPointerCapture(e.pointerId); } catch { /* nada */ }
    world.classList.add('panning'); cam.classList.remove('moving');
  });
  world.addEventListener('pointermove', (e) => {
    if (!pan || e.pointerId !== pan.id) return;
    C.x = pan.cx + (e.clientX - pan.x0); C.y = pan.cy + (e.clientY - pan.y0);
    clampCam(); applyCam(false);
  });
  const endPan = (e) => { if (!pan || (e && e.pointerId !== pan.id)) return; pan = null; world.classList.remove('panning'); saveCam(); };
  world.addEventListener('pointerup', endPan); world.addEventListener('pointercancel', endPan);
  world.addEventListener('dblclick', (e) => {
    if (e.target.closest('button, input, label, .sht, a, textarea')) return;
    C = focus ? focusCam() : { x: vw() - (MW + 40), y: 136, z: 1 }; applyCam(true); saveCam();
  });
  // la rueda sobre el fondo hace lo de siempre: desplazar la hoja (o la escena si la hoja está guardada)
  world.addEventListener('wheel', (e) => {
    if (e.ctrlKey) return;
    if (focus) { C.y -= e.deltaY; clampCam(); applyCam(false); return; }
    $('#scroller').scrollBy({ top: e.deltaY, left: e.deltaX });
  }, { passive: true });
  window.addEventListener('resize', debounce(() => { if (focus) { C = focusCam(); } else { C.x = vw() - RX; } applyCam(false); }, 80));

  /* ------------------------------------------------------------------ */
  /* Dibujo del mueble y el escritorio                                   */
  /* ------------------------------------------------------------------ */
  function cardEl(r, i, needle, onDesk) {
    const wrap = el('div', 'sht-w'); wrap.setAttribute('role', 'listitem');
    const b = el('button', 'sht'); b.type = 'button'; b.dataset.id = r.id;
    b.style.setProperty('--c', r.color || COLORS[0][1]);
    b.style.setProperty('--i', i);
    b.style.setProperty('--tilt', (onDesk ? (((r.id.charCodeAt(0) + r.id.length * 7) % 9) - 4) : (((r.id.charCodeAt(1) || 3) % 5) - 2)) + 'deg');
    b.setAttribute('aria-label', `${r.title}. ${onDesk ? 'Sobre el escritorio' : 'Cajón ' + folderOf(r)}`);
    b.classList.toggle('hit', !!needle);
    b.classList.toggle('on', R.activeId() === r.id);
    const chk = el('i', 'act'); chk.innerHTML = icon('check'); chk.setAttribute('aria-hidden', 'true');
    b.append(el('b', 'st', r.title || 'Sin título'), el('span', 'ss', r.text.replace(/\s+/g, ' ').slice(0, 150)), chk);
    b.addEventListener('pointerdown', (e) => pointerDown(e, r, b));
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); R.peek(r.id); } });
    wrap.append(b);
    return wrap;
  }

  function render() {
    const list = R.list(), needle = norm(q.trim());
    const match = (r) => !needle || norm(`${r.title} ${folderOf(r)} ${r.text}`).includes(needle);
    const shown = list.filter(match);
    $('#cab-count').textContent = !list.length ? '' : needle ? `${shown.length} de ${list.length} cartas` : `${list.length} ${list.length === 1 ? 'carta' : 'cartas'}`;

    // cartas apoyadas sobre el escritorio
    desk.innerHTML = '';
    list.filter((r) => r.pos).forEach((r, i) => {
      const w = cardEl(r, i, needle && match(r), true);
      w.classList.add('on-desk'); w.classList.toggle('dim', !!needle && !match(r));
      w.style.left = r.pos.x + 'px'; w.style.top = r.pos.y + 'px';
      desk.append(w);
    });

    // cajones: uno por cada grupo
    host.innerHTML = '';
    if (!list.length) {
      const e = el('div', 'cab-empty');
      e.append(el('b', '', 'El archivero está vacío'), el('span', 'muted', 'Sumá tu primera carta con «Nueva carta». Después sacala del cajón con el mouse y llevala adonde quieras o a la referencia.'));
      host.append(e); return;
    }
    const groups = new Map();
    for (const r of list) { const f = folderOf(r); if (!groups.has(f)) groups.set(f, []); if (!r.pos && match(r)) groups.get(f).push(r); }
    let names = [...groups.keys()].sort((a, b) => (a === 'Sueltas') - (b === 'Sueltas') || a.localeCompare(b, 'es'));
    if (needle) names = names.filter((n) => groups.get(n).length);
    if (!names.length) { host.append(el('div', 'cab-empty', 'Ninguna carta coincide con la búsqueda.')); return; }
    names.forEach((name) => {
      const cards = groups.get(name);
      const drw = el('section', 'drw');
      const isOpen = needle ? true : openDrawers.has(name);
      drw.classList.toggle('open', isOpen);
      const front = el('button', 'drw-front'); front.type = 'button'; front.setAttribute('aria-expanded', isOpen);
      front.append(el('span', 'knob'), el('b', 'nm', name), el('span', 'cnt', String(cards.length)));
      front.addEventListener('click', () => {
        const open = !drw.classList.contains('open');
        drw.classList.toggle('open', open); front.setAttribute('aria-expanded', open);
        if (open) openDrawers.add(name); else openDrawers.delete(name);
        h.LS.set('pyl.cabOpen', [...openDrawers]);
      });
      const tray = el('div', 'drw-tray'), inner = el('div', 'drw-inner'), strip = el('div', 'strip');
      strip.setAttribute('role', 'list');
      if (!cards.length) strip.append(el('span', 'drw-empty muted', 'Vacío: las cartas están sobre el escritorio.'));
      cards.forEach((r, i) => strip.append(cardEl(r, i, needle, false)));
      inner.append(strip); tray.append(inner);
      drw.append(front, tray); host.append(drw);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Sacar, mover y soltar cartas                                        */
  /* ------------------------------------------------------------------ */
  let drag = null;
  function pointerDown(e, r, node) {
    if (e.button > 0) return;
    drag = { r, node, x0: e.clientX, y0: e.clientY, id: e.pointerId, started: false, ghost: null };
  }
  function startDrag() {
    const g = drag.node.cloneNode(true);
    g.classList.add('drag-ghost'); g.removeAttribute('data-id');
    const b = drag.node.getBoundingClientRect();
    g.style.width = drag.node.offsetWidth * C.z + 'px'; g.style.height = drag.node.offsetHeight * C.z + 'px';
    document.body.append(g);
    drag.started = true; drag.ghost = g;
    drag.dx = Math.max(0, Math.min(b.width, drag.x0 - b.left)); drag.dy = Math.max(0, Math.min(b.height, drag.y0 - b.top));
    drag.node.classList.add('lifted');
    document.body.classList.add('dragging-ref');
    R.dragBegin();
    try { drag.node.setPointerCapture(drag.id); } catch { /* nada */ }
  }
  document.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.started) { if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return; startDrag(); }
    const tilt = Math.max(-9, Math.min(9, (e.clientX - drag.x0) / 36));
    drag.ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px) rotate(${tilt}deg) scale(1.05)`;
    R.dragOver(e.clientX, e.clientY);
  });
  document.addEventListener('touchmove', (e) => { if (drag && drag.started) e.preventDefault(); }, { passive: false });
  function end(e, cancelled) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const d = drag; drag = null;
    if (!d.started) { if (!cancelled) R.peek(d.r.id); return; }
    document.body.classList.remove('dragging-ref');
    d.node.classList.remove('lifted');
    const x = e ? e.clientX : 0, y = e ? e.clientY : 0;
    let outcome = 'back';
    if (R.dragEnd(x, y, d.r.id, cancelled)) outcome = 'land';
    else if (!cancelled) {
      const under = document.elementFromPoint(x, y);
      if (under && world.contains(under) || under === world) {
        if (under.closest?.('#mueble')) { if (d.r.pos) R.setPos(d.r.id, null); outcome = 'land'; }
        else {
          R.setPos(d.r.id, { x: Math.round((x - d.dx - C.x) / C.z), y: Math.round((y - d.dy - C.y) / C.z) });
          outcome = 'drop';
        }
      }
    }
    d.ghost.classList.add(outcome === 'drop' ? 'land' : outcome);
    setTimeout(() => d.ghost.remove(), outcome === 'drop' ? 60 : 240);
    d.node.dataset.swallow = '1'; setTimeout(() => delete d.node.dataset.swallow, 60);
  }
  document.addEventListener('pointerup', (e) => end(e, false));
  document.addEventListener('pointercancel', (e) => end(e, true));
  document.addEventListener('click', (e) => { const b = e.target.closest?.('.sht'); if (b && b.dataset.swallow) e.stopPropagation(); }, true);

  /* ------------------------------------------------------------------ */
  /* Controles del mueble                                                */
  /* ------------------------------------------------------------------ */
  $('#cab-add').addEventListener('click', () => R.openEditor());
  $('#cab-q').addEventListener('input', debounce((e) => { q = e.target.value; render(); }, 120));
  $('#cab-export').addEventListener('click', () => R.exportAll());
  $('#cab-import').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) R.importFile(f); });

  R.onChange(render);
  render(); applyCam(false);
  return { setFocus, isFocus: () => focus };
}
