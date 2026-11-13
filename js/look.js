// Panel «Aspecto»: edita el tema (paleta, colores, fondo, vidrio…) y lo guarda en este dispositivo.
import { $, $$ } from './util.js';
import { PALETTES, BACKGROUNDS, MATERIALS, DEFAULT_THEME, applyTheme, saveTheme, palette, isChromium } from './theme.js';

export function paintRange(input) {
  const min = parseFloat(input.min || '0'), max = parseFloat(input.max || '100'), v = parseFloat(input.value);
  input.style.setProperty('--p', (max > min ? ((v - min) / (max - min)) * 100 : 0) + '%');
}

const FMT = { aurO: (v) => `${v} %`, grain: (v) => `${v} %`, thick: (v) => `${v} %`, blur: (v) => `${v} px`, radius: (v) => `${v} px`, fs: (v) => `${v} px` };
const COLOR_KEYS = [['accent', 'Acento'], ['bg', 'Fondo'], ['paper', 'Papel'], ['accent2', 'Detalle']];

export function setupLook(theme, onChange) {
  const chips = (host, items, key) => {
    host.innerHTML = '';
    for (const [k, label] of items) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.dataset.key = k; b.textContent = label;
      b.addEventListener('click', () => { theme[key] = k; if (key === 'pal') theme.custom = {}; commit(); });
      host.append(b);
    }
  };
  chips($('#pal-chips'), Object.entries(PALETTES).map(([k, v]) => [k, v.name]), 'pal');
  chips($('#bg-chips'), BACKGROUNDS, 'bg');
  chips($('#mat-chips'), MATERIALS, 'mat');

  const pk = $('#pickers');
  pk.innerHTML = '';
  for (const [k, label] of COLOR_KEYS) {
    const l = document.createElement('label'); l.className = 'picker';
    const sw = document.createElement('i'); sw.dataset.k = k;
    const t = document.createElement('span'); t.textContent = label;
    const inp = document.createElement('input'); inp.type = 'color'; inp.dataset.k = k; inp.setAttribute('aria-label', 'Color: ' + label);
    inp.addEventListener('input', () => { theme.custom = { ...theme.custom, [k]: inp.value }; commit(false); });
    l.append(sw, t, inp); pk.append(l);
  }

  $$('#view-write [data-t]').forEach((el) => {
    el.addEventListener('input', () => {
      const k = el.dataset.t;
      theme[k] = el.type === 'checkbox' ? el.checked : parseFloat(el.value);
      if (el._out) el._out.textContent = (FMT[k] || String)(theme[k]);
      paintRange(el);
      commit(false);
    });
  });
  if (!isChromium) { const r = $('#row-refract'); r.hidden = true; }

  $('#look-reset').addEventListener('click', () => {
    Object.assign(theme, JSON.parse(JSON.stringify(DEFAULT_THEME)));
    commit();
  });

  function sync() {
    const p = palette(theme);
    $$('#pal-chips .chip').forEach((b) => b.setAttribute('aria-pressed', b.dataset.key === theme.pal));
    $$('#bg-chips .chip').forEach((b) => b.setAttribute('aria-pressed', b.dataset.key === theme.bg));
    $$('#mat-chips .chip').forEach((b) => b.setAttribute('aria-pressed', b.dataset.key === theme.mat));
    $$('#pickers input').forEach((i) => { i.value = p[i.dataset.k]; i.previousElementSibling.previousElementSibling.style.background = p[i.dataset.k]; });
    $$('[data-t]').forEach((el) => {
      const v = theme[el.dataset.t];
      if (el.type === 'checkbox') el.checked = !!v; else { el.value = v; if (el._out) el._out.textContent = (FMT[el.dataset.t] || String)(v); paintRange(el); }
    });
  }
  function commit(resync = true) {
    applyTheme(theme); saveTheme(theme);
    if (resync) sync();
    else $$('#pickers i').forEach((i) => { i.style.background = palette(theme)[i.dataset.k]; });
    onChange?.(theme);
  }
  sync();
  return { sync };
}
