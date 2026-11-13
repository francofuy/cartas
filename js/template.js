// Geometría de la plantilla A4 donde escribís tu letra. Todo en milímetros.
import { TEMPLATE_PAGES } from './chars.js';

export const PAGE_W = 210;
export const PAGE_H = 297;
export const PX_PER_MM = 12; // resolución con la que se "endereza" la foto

// Cuatro marcas negras. La de arriba a la izquierda es más grande: así sé cómo está girada la foto.
export const MARKERS = [
  { id: 'TL', cx: 12, cy: 12, size: 12 },
  { id: 'TR', cx: 198, cy: 12, size: 8 },
  { id: 'BR', cx: 198, cy: 285, size: 8 },
  { id: 'BL', cx: 12, cy: 285, size: 8 },
];

export const GRID = {
  x0: 18, y0: 38, labelW: 10, cols: 7, boxW: 23.4, rowH: 16, rows: 15,
  baseline: 11, // mm desde el borde superior del casillero
  xh: 4,        // altura de la "x" sobre la base
  asc: 8,       // altura de mayúsculas / ascendentes
  inset: 0.9,   // margen que se descarta dentro de cada casillero (por las líneas)
};

// Código de página en 3 bits (cuadraditos)
export const CODE = { x: 170, y: 22, size: 4, step: 7, bits: 3 };

// Color de las guías: casi blanco en el canal rojo, así desaparecen al capturar la tinta
export const GUIDE = '#f8d6c8';

export function pageCells(p) {
  const chars = TEMPLATE_PAGES[p] || [];
  const cells = [];
  chars.forEach((ch, r) => {
    for (let c = 0; c < GRID.cols; c++) {
      cells.push({
        char: ch, page: p, r, c,
        x: GRID.x0 + GRID.labelW + c * GRID.boxW,
        y: GRID.y0 + r * GRID.rowH,
        w: GRID.boxW, h: GRID.rowH,
        baseY: GRID.y0 + r * GRID.rowH + GRID.baseline,
      });
    }
  });
  return cells;
}

export const pageCount = () => TEMPLATE_PAGES.length;

function el(tag, css, cls) {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (cls) e.className = cls;
  return e;
}
const mm = (v) => `${v}mm`;

// Construye la hoja imprimible (un <section> de 210x297mm exactos)
export function templatePageEl(p) {
  const page = el('section',
    `position:relative;width:${mm(PAGE_W)};height:${mm(PAGE_H)};background:#fff;overflow:hidden;break-after:page;page-break-after:always;`,
    'tpl-page');

  for (const m of MARKERS) {
    page.append(el('div',
      `position:absolute;left:${mm(m.cx - m.size / 2)};top:${mm(m.cy - m.size / 2)};width:${mm(m.size)};height:${mm(m.size)};background:#000;`));
  }

  const title = el('div',
    `position:absolute;left:${mm(24)};top:${mm(18)};width:${mm(130)};font:600 4.2mm/1.2 Georgia,'Times New Roman',serif;color:#222;`);
  title.textContent = `Puño y Letra · Mi letra · página ${p + 1} de ${TEMPLATE_PAGES.length}`;
  page.append(title);
  const sub = el('div',
    `position:absolute;left:${mm(24)};top:${mm(25)};width:${mm(140)};font:2.7mm/1.35 system-ui,Arial,sans-serif;color:#555;`);
  sub.textContent = 'Escribí cada carácter con tu lapicera, a tu tamaño natural y apoyado en la línea de base. Un casillero, una variante. Imprimí al 100 %.';
  page.append(sub);

  for (let b = 0; b < CODE.bits; b++) {
    const on = (p >> b) & 1;
    page.append(el('div',
      `position:absolute;left:${mm(CODE.x + b * CODE.step)};top:${mm(CODE.y)};width:${mm(CODE.size)};height:${mm(CODE.size)};box-sizing:border-box;` +
      (on ? 'background:#000;' : `border:0.3mm solid ${GUIDE};`)));
  }

  const chars = TEMPLATE_PAGES[p] || [];
  chars.forEach((ch, r) => {
    const y = GRID.y0 + r * GRID.rowH;
    const label = el('div',
      `position:absolute;left:${mm(GRID.x0)};top:${mm(y)};width:${mm(GRID.labelW - 1)};height:${mm(GRID.rowH)};display:flex;align-items:center;justify-content:center;font:500 6.5mm system-ui,Arial,sans-serif;color:#9a9a9a;`);
    label.textContent = ch;
    page.append(label);
    for (let c = 0; c < GRID.cols; c++) {
      const x = GRID.x0 + GRID.labelW + c * GRID.boxW;
      const box = el('div',
        `position:absolute;left:${mm(x)};top:${mm(y)};width:${mm(GRID.boxW)};height:${mm(GRID.rowH)};box-sizing:border-box;border:0.3mm solid ${GUIDE};`);
      const base = el('div', `position:absolute;left:0;right:0;top:${mm(GRID.baseline)};border-top:0.35mm solid ${GUIDE};`);
      const xh = el('div', `position:absolute;left:0;right:0;top:${mm(GRID.baseline - GRID.xh)};border-top:0.25mm dashed ${GUIDE};`);
      const asc = el('div', `position:absolute;left:0;right:0;top:${mm(GRID.baseline - GRID.asc)};border-top:0.25mm dotted ${GUIDE};`);
      box.append(base, xh, asc);
      page.append(box);
    }
  });
  return page;
}
