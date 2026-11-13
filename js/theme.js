// Tema de la interfaz: paletas, vidrio, fondo y detalles. Se aplica con variables CSS en <html>.
// El valor por defecto es el diseño elegido en el constructor ("Mi diseño").

export const PALETTES = {
  P1: { name: 'Tinta y papel', bg: '#ebe6da', paper: '#fffdf6', ink: '#23222a', accent: '#1d2f8f', accent2: '#c4474c', rule: '#9ab6dc', margin: '#d9787a', aur1: '#ffd9a0', aur2: '#bcd0ff', aur3: '#ffc2cf', aurO: 0.6 },
  P2: { name: 'Clay rosa', bg: '#efe6ee', paper: '#fffafc', ink: '#2d2230', accent: '#c93e6e', accent2: '#7b6bff', rule: '#c9b8f0', margin: '#f08aa8', aur1: '#ffb3cf', aur2: '#c9b6ff', aur3: '#ffd6a8', aurO: 0.65 },
  P3: { name: 'Menta', bg: '#e2ece7', paper: '#fbfffc', ink: '#1c2b25', accent: '#1f7a60', accent2: '#d98a2b', rule: '#a4cdbb', margin: '#e08a7a', aur1: '#a8f0d0', aur2: '#bfe3ff', aur3: '#fff0b3', aurO: 0.65 },
  P4: { name: 'Cielo', bg: '#e3ebf6', paper: '#fcfdff', ink: '#1a2438', accent: '#2a63d4', accent2: '#ee7a4c', rule: '#aac6ee', margin: '#f0899a', aur1: '#a9ccff', aur2: '#c9b8ff', aur3: '#b0f0e8', aurO: 0.65 },
  P5: { name: 'Noche aurora', bg: '#101322', paper: '#f4f1e8', ink: '#e9ecfa', accent: '#8ea2ff', accent2: '#5de0c8', rule: '#9fb4d8', margin: '#d9787a', aur1: '#2fe0c0', aur2: '#6a4bff', aur3: '#2b7bff', aurO: 0.8 },
  P6: { name: 'Lavanda y tinta', bg: '#ebe7f6', paper: '#fffeff', ink: '#241e3a', accent: '#5b3df0', accent2: '#e8507a', rule: '#c3b8f0', margin: '#f08aa8', aur1: '#c7b8ff', aur2: '#ffc6e0', aur3: '#b8e6ff', aurO: 0.65 },
  P7: { name: 'Grafito y sello', bg: '#e7e7e8', paper: '#fdfdfb', ink: '#18181b', accent: '#b3262f', accent2: '#2b2b33', rule: '#b5bac6', margin: '#d9787a', aur1: '#d8d8e8', aur2: '#ffd0d4', aur3: '#e0e0ea', aurO: 0.5 },
};

export const BACKGROUNDS = [['dots', 'Puntos que reaccionan'], ['aurora', 'Aurora'], ['pastel', 'Aurora pastel sobre papel'], ['grain', 'Grano de papel'], ['plain', 'Liso']];
export const MATERIALS = [['frost', 'Esmerilado'], ['smoke', 'Ahumado'], ['lacre', 'Teñido de acento'], ['vellum', 'Papel vegetal']];

// Mi diseño (constructor): hoja protagonista, barra a la izquierda, paleta Grafito y sello editada, puntos, vidrio esmerilado fino
export const DEFAULT_THEME = {
  pal: 'P7', custom: { accent: '#0033ff', bg: '#ccccff', paper: '#ffffff', accent2: '#656161' },
  bg: 'dots', aurO: 100, grain: 100,
  mat: 'frost', thick: 0, blur: 5, edge: false, radius: 15,
  prim: 'B01', sec2: 'B12', ripple: true, tog: 'T3', sld: 'L4',
  font: 'inter', fs: 15, anim: true, list: true,
};

const KEY = 'pyl.theme';
export function loadTheme() {
  try {
    const t = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (t && PALETTES[t.pal]) return { ...DEFAULT_THEME, ...t, custom: { ...(t.custom || {}) } };
  } catch { /* sin guardado */ }
  return JSON.parse(JSON.stringify(DEFAULT_THEME));
}
export function saveTheme(t) { try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* nada */ } }

/* ---------- color ---------- */
export const hexToRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const rgbToHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export function mix(a, b, t) { const x = hexToRgb(a), y = hexToRgb(b); return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]); }
const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
export function ratio(a, b) { const l1 = lum(hexToRgb(a)), l2 = lum(hexToRgb(b)); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
export const bestInk = (bg) => (ratio('#ffffff', bg) >= ratio('#17171b', bg) ? '#ffffff' : '#17171b');

export function palette(theme) {
  const p = { ...PALETTES[theme.pal] };
  for (const k of ['bg', 'paper', 'ink', 'accent', 'accent2', 'aur1', 'aur2', 'aur3']) if (theme.custom && theme.custom[k]) p[k] = theme.custom[k];
  p.dark = lum(hexToRgb(p.bg)) < 0.25;
  return p;
}

// Modelo del vidrio (misma cuenta que el constructor), con el peor caso de contraste
export function glassModel(theme, p = palette(theme)) {
  const t = Math.pow(theme.thick / 100, 1.15);
  let a = 0.06 + 0.86 * t, tint;
  const back = theme.bg === 'pastel' ? mix(p.paper, p.bg, 0.55) : p.bg;
  if (theme.mat === 'frost') { tint = '#ffffff'; if (p.dark) a *= 0.55; }
  else if (theme.mat === 'smoke') { tint = '#12121a'; a = Math.min(0.95, a + 0.2); }
  else if (theme.mat === 'lacre') { tint = p.accent; a = Math.min(0.92, a + 0.12); }
  else { tint = '#faf6e8'; a = Math.min(0.95, a + 0.25); }
  const blur = theme.mat === 'vellum' ? Math.min(theme.blur, 8) : theme.blur;
  const text = bestInk(mix(back, tint, a));
  const backs = [back];
  if (theme.bg === 'aurora' || theme.bg === 'pastel') {
    const o = Math.min(1, (theme.aurO / 100) * (theme.bg === 'pastel' ? 0.85 : 1));
    [p.aur1, p.aur2, p.aur3].forEach((c) => backs.push(mix(back, c, o)));
  }
  let worst = 99;
  backs.forEach((bk) => { const r = ratio(text, mix(bk, tint, a)); if (r < worst) worst = r; });
  return { tint, a, blur, text, back, ratio: worst };
}

export const isChromium = (() => {
  const ua = navigator.userAgent, uad = navigator.userAgentData;
  if (uad && uad.brands) return uad.brands.some((b) => /Chromium/.test(b.brand));
  return /Chrome\//.test(ua) && !/Firefox|FxiOS|CriOS|EdgiOS/.test(ua);
})();

let current = null;
export const currentTheme = () => current;

// Aplica el tema al documento. Devuelve {p, g} (paleta y vidrio efectivos).
export function applyTheme(theme) {
  current = theme;
  const p = palette(theme), g = glassModel(theme, p);
  const root = document.documentElement, s = root.style;
  const set = (k, v) => s.setProperty(k, v);
  const dark = p.dark;
  const ink = p.ink;
  set('--bg', theme.bg === 'pastel' ? mix(p.paper, p.bg, 0.5) : p.bg);
  set('--ink', ink); set('--muted', mix(ink, p.bg, 0.4)); set('--line', mix(ink, p.bg, dark ? 0.82 : 0.86)); set('--chip', mix(p.bg, ink, dark ? 0.14 : 0.07));
  set('--panel', dark ? mix(p.bg, '#ffffff', 0.08) : mix(p.bg, '#ffffff', 0.7));
  set('--paper', p.paper);
  set('--accent', p.accent); set('--accent2', p.accent2); set('--accent-ink', bestInk(p.accent));
  set('--accent-d', mix(p.accent, '#000000', 0.34)); set('--accent-l', mix(p.accent, '#ffffff', 0.22));
  set('--danger', dark ? '#ff8a8f' : '#b3262f'); set('--ok', dark ? '#7fcf9c' : '#2f7a4d');
  set('--rule', p.rule); set('--margin', p.margin);
  set('--aur1', p.aur1); set('--aur2', p.aur2); set('--aur3', p.aur3);
  set('--aur-o', ((theme.aurO / 100) * (theme.bg === 'pastel' ? 0.85 : 1)).toFixed(2));
  set('--grain-o', ((theme.grain / 100) * (theme.bg === 'grain' ? 0.9 : theme.bg === 'pastel' ? 0.8 : 0.35)).toFixed(2));
  const rgb = hexToRgb(g.tint).join(' ');
  set('--g-tint', rgb); set('--g-a', g.a.toFixed(3)); set('--g-blur', g.blur + 'px'); set('--g-sat', theme.mat === 'smoke' ? '140%' : '170%');
  set('--g-edge', theme.edge ? '0.5' : '0.16'); set('--g-text', g.text);
  // los paneles con contenido (ventanas, cajón, barra) necesitan más cuerpo para que se lea lo que hay debajo
  // (en oscuro hace falta más: debajo puede pasar una hoja blanca y el texto claro se perdería)
  const ap = Math.max(g.a, dark || theme.mat === 'smoke' ? 0.82 : 0.58);
  set('--g-a-panel', Math.min(0.95, ap).toFixed(3)); set('--g-blur-panel', Math.max(g.blur, 14) + 'px');
  const ptint = theme.mat === 'frost' ? (dark ? '#232842' : '#ffffff') : g.tint;
  set('--g-tint-panel', hexToRgb(ptint).join(' '));
  set('--g-text-panel', bestInk(mix(g.back, ptint, Math.min(0.95, ap))));
  set('--r', theme.radius + 'px'); set('--fs', theme.fs + 'px');
  set('--font', theme.font === 'sys' ? 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' : '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif');
  const b = document.body;
  Object.assign(b.dataset, { prim: theme.prim, sec2: theme.sec2, tog: theme.tog, sld: theme.sld, bg: theme.bg, mat: theme.mat });
  b.classList.toggle('dk', dark || theme.mat === 'smoke');
  b.classList.toggle('vellum', theme.mat === 'vellum');
  b.classList.toggle('refract', isChromium && !!theme.refract);
  b.classList.toggle('noanim', !theme.anim || matchMedia('(prefers-reduced-motion: reduce)').matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', s.getPropertyValue('--bg'));
  return { p, g };
}

/* ---------- fondo: puntos que reaccionan (E15) ---------- */
export class Background {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.mx = -999; this.my = -999; this.raf = 0; this.on = true;
    this.resize = this.resize.bind(this);
    addEventListener('resize', this.resize);
    document.addEventListener('pointermove', (e) => {
      if (!this.on || !this.active()) return;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      this.mx = e.clientX; this.my = e.clientY; this.schedule();
    }, { passive: true });
    document.addEventListener('pointerleave', () => { this.mx = this.my = -999; this.schedule(); });
    this.resize();
  }
  active() { return document.body.dataset.bg === 'dots'; }
  resize() {
    const d = Math.min(window.devicePixelRatio || 1, 2);
    this.w = innerWidth; this.h = innerHeight;
    this.cv.width = Math.round(this.w * d); this.cv.height = Math.round(this.h * d);
    this.cv.style.width = this.w + 'px'; this.cv.style.height = this.h + 'px';
    this.ctx.setTransform(d, 0, 0, d, 0, 0);
    this.draw();
  }
  schedule() { if (!this.raf) this.raf = requestAnimationFrame(() => this.draw()); }
  draw() {
    this.raf = 0;
    const ctx = this.ctx, w = this.w, h = this.h;
    ctx.clearRect(0, 0, w, h);
    if (!this.active()) return;
    const cs = getComputedStyle(document.documentElement);
    const accent = cs.getPropertyValue('--accent').trim(), mut = cs.getPropertyValue('--muted').trim();
    const GAP = 26;
    for (let y = GAP / 2; y < h; y += GAP) {
      for (let x = GAP / 2; x < w; x += GAP) {
        const dd = Math.hypot(x - this.mx, y - this.my), k = Math.max(0, 1 - dd / 130);
        ctx.globalAlpha = 0.28 + 0.72 * k;
        ctx.fillStyle = k > 0.02 ? accent : mut;
        ctx.beginPath(); ctx.arc(x, y, 1.5 + 4 * k, 0, 6.283); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}
