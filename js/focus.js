// Modo foco: se apaga todo (barra, herramientas, botones) y una luz tibia acompaña la punta de la lapicera, siempre un poco más abajo
// de donde escribís. Se sale con Esc, con Ctrl + . o con el botón que aparece al mover el mouse.
import { $ } from './util.js';

export function setupFocus({ writer, toast, animOn }) {
  const fx = $('#focus-fx'), exit = $('#focus-exit'), btn = $('#btn-focus');
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
  function enter() {
    if (on) return;
    on = true; init = false; document.body.classList.add('focus');
    btn?.setAttribute('aria-pressed', 'true');
    fx.classList.add('on'); loop();
    $('#cap')?.focus({ preventScroll: true });
    toast(matchMedia('(pointer: coarse)').matches ? 'Modo foco. Tocá la pantalla para ver el botón de salir.' : 'Modo foco. Para salir: Esc o Ctrl + .', 3200);
    showExit();
  }
  function leave() {
    if (!on) return;
    on = false; document.body.classList.remove('focus'); fx.classList.remove('on');
    btn?.setAttribute('aria-pressed', 'false');
    exit.classList.remove('show'); exit.hidden = true; clearTimeout(hideT);
    cancelAnimationFrame(raf); raf = 0;
    $('#cap')?.focus({ preventScroll: true });
  }
  const toggle = () => (on ? leave() : enter());
  btn?.addEventListener('click', toggle);
  $('#btn-focus-pop')?.addEventListener('click', () => { document.querySelector('.dock-btn.on[data-panel]')?.click(); setTimeout(enter, 60); });
  exit.addEventListener('click', leave);
  document.addEventListener('pointermove', showExit, { passive: true });
  document.addEventListener('pointerdown', showExit, { passive: true });
  return { toggle, leave, isOn: () => on };
}
