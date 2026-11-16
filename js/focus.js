// Modo foco: se apaga todo (barra, herramientas, botones) y una luz tibia acompaña la punta de la lapicera, siempre un poco más abajo
// de donde escribís. Se sale con Esc, con Ctrl + . o con el botón que aparece al mover el mouse.
import { $ } from './util.js';
import { createFocus3D, webglOk, TEX_W_PX, LINE_DELAY } from './focus3d.js';

export function setupFocus({ writer, toast, animOn, refit }) {
  const fx = $('#focus-fx'), exit = $('#focus-exit'), btn = $('#btn-focus');
  let f3 = null, use3d = false, texBoost = false;
  let on = false, raf = 0, lx = 0, ly = 0, tx = 0, ty = 0, rx = 300, init = false, hideT = 0;

  const set = () => {
    fx.style.setProperty('--lx', lx.toFixed(1) + 'px'); fx.style.setProperty('--ly', ly.toFixed(1) + 'px');
    fx.style.setProperty('--rx', rx.toFixed(0) + 'px'); fx.style.setProperty('--ry', (rx * 0.62).toFixed(0) + 'px');
  };
  function loop() {
    raf = 0; if (!on) return;
    const w = writer(), p = w?.penClient?.();
    if (p) {
      rx = Math.max(200, Math.min(480, p.k * 58));
      tx = p.x + rx * 0.06; ty = p.y + rx * 0.62 * 0.2; // la luz queda apenas por debajo de la punta
      if (!init) { lx = tx; ly = ty; init = true; }
    } else if (!init) { tx = lx = innerWidth / 2; ty = ly = innerHeight / 2; init = true; }
    if (animOn()) { lx += (tx - lx) * 0.16; ly += (ty - ly) * 0.16; } else { lx = tx; ly = ty; }
    set();
    raf = requestAnimationFrame(loop);
  }
  function showExit() {
    if (!on) return;
    exit.hidden = false; exit.classList.add('show'); clearTimeout(hideT);
    hideT = setTimeout(() => exit.classList.remove('show'), 2400);
  }
  let moving = false, vf = 1;
  const rectOf = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const sheetRect = () => rectOf($('#sheet')), scrollRect = () => rectOf($('#scroller'));
  async function enter() {
    if (on || moving) return;
    on = true; moving = true; init = false; use3d = false; document.body.classList.add('focus');
    btn?.setAttribute('aria-pressed', 'true');
    $('#cap')?.focus({ preventScroll: true });
    if (webglOk()) { // la hoja en 3D, como en una máquina de escribir; si algo falla, queda la luz simple
      try {
        const rect = sheetRect(), clip = scrollRect(); // dónde está la hoja normal, antes de cambiarle el tamaño
        const w = writer(); if (w) { w.noCaret = true; w.lineDelay = LINE_DELAY; }
        f3 = f3 || createFocus3D({ writer, animOn, viewFactor: () => vf });
        await f3.start({ rect, clip, dur: 1.35 }); use3d = true;
        // la hoja 3D ya está encima y es igual a la normal: se esconde la normal y se pasa a la textura grande
        setTimeout(() => { if (!on || !use3d) return; document.body.classList.add('f3-hide'); texBoost = true; refit?.(); }, 300);
      } catch (e) { console.warn('Modo foco 3D no disponible, uso la luz simple.', e); const w = writer(); if (w) { w.noCaret = false; w.lineDelay = 0; } }
    }
    if (!on) { moving = false; return; }
    if (!use3d) { fx.classList.add('on'); loop(); }
    $('#cap')?.focus({ preventScroll: true });
    toast(matchMedia('(pointer: coarse)').matches ? 'Modo foco. Tocá la pantalla para ver el botón de salir.' : 'Modo foco. Para salir: Esc o Ctrl + .', 3200);
    showExit(); moving = false;
  }
  async function leave() {
    if (!on || moving) return;
    on = false; moving = true; document.body.classList.remove('focus'); fx.classList.remove('on');
    btn?.setAttribute('aria-pressed', 'false');
    exit.classList.remove('show'); exit.hidden = true; clearTimeout(hideT);
    cancelAnimationFrame(raf); raf = 0;
    if (use3d) {
      use3d = false;
      // se mide dónde va a quedar la hoja normal (con su tamaño de siempre) y la 3D viaja hasta ahí
      texBoost = false; refit?.(); const rect = sheetRect(), clip = scrollRect(); texBoost = true; refit?.();
      await f3.stop({ rect, clip, dur: 1.0 });
      texBoost = false; refit?.(); document.body.classList.remove('f3-hide'); const w = writer(); if (w) { w.noCaret = false; w.lineDelay = 0; }
    }
    $('#cap')?.focus({ preventScroll: true });
    moving = false;
  }
  const toggle = () => (on ? leave() : enter());
  // al usar los botones (vista, hojas, referencias) el cursor vuelve a la hoja para seguir escribiendo
  document.addEventListener('click', (e) => { if (!on || document.querySelector('dialog[open]')) return; const t = e.target; if (t.closest && t.closest('.stage-bar, .dock, .top, .cajon') && !t.closest('input, textarea, select, #sealed-pop')) setTimeout(() => $('#cap')?.focus({ preventScroll: true }), 0); });
  btn?.addEventListener('click', toggle);
  $('#btn-focus-pop')?.addEventListener('click', () => { document.querySelector('.dock-btn.on[data-panel]')?.click(); setTimeout(enter, 60); });
  exit.addEventListener('click', leave);
  document.addEventListener('pointermove', showExit, { passive: true });
  document.addEventListener('pointerdown', showExit, { passive: true });
  return { toggle, leave, isOn: () => on, setView(i) { vf = [1, 1.5, 0.72][i] ?? 1; f3?.setView(vf); }, wantsTexture: () => texBoost, textureCssW: () => Math.round(TEX_W_PX / Math.min(window.devicePixelRatio || 1, 3)) };
}
