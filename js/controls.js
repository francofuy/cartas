// Controles chicos reutilizables: grupos de botones y paletas de colores
import { $, $$ } from './util.js';

export function buildSwatches(host, list, getVal, onPick) {
  host.innerHTML = '';
  const mk = (name, color) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'sw'; b.style.background = color; b.title = name; b.setAttribute('aria-label', name);
    b.dataset.color = color;
    b.addEventListener('click', () => { onPick(color, false); refresh(); });
    return b;
  };
  list.forEach(([n, c]) => host.append(mk(n, c)));
  const cu = document.createElement('label');
  cu.className = 'sw custom'; cu.title = 'Otro color';
  const inp = document.createElement('input'); inp.type = 'color'; inp.setAttribute('aria-label', 'Elegir otro color');
  inp.addEventListener('input', () => { onPick(inp.value, true); refresh(); });
  cu.append(inp); host.append(cu);
  function refresh() {
    const v = getVal().toLowerCase();
    let found = false;
    $$('.sw[data-color]', host).forEach((b) => { const on = b.dataset.color.toLowerCase() === v; b.setAttribute('aria-pressed', on); if (on) found = true; });
    cu.classList.toggle('on', !found);
    if (!found) inp.value = v;
  }
  host._refresh = refresh;
  refresh();
}

export function buildChips(host, items, getVal, onPick) {
  host.innerHTML = '';
  for (const [key, label] of items) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = label; b.dataset.key = key;
    b.addEventListener('click', () => { onPick(key); refresh(); });
    host.append(b);
  }
  function refresh() { $$('.chip', host).forEach((b) => b.setAttribute('aria-pressed', b.dataset.key === getVal())); }
  host._refresh = refresh;
  refresh();
}
