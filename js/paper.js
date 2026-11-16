// Dibujo de la hoja (A4 en mm). Todo se escala con "ppm" = píxeles por milímetro.
import { PW as PAGE_W, PH as PAGE_H } from './format.js';
import { mulberry32 } from './util.js';

export const PAGE_GEOM = { top: 22, bottom: 12, right: 14, leftFree: 18 };

// Valores de fábrica de todo lo que se puede editar de una hoja
export const PAPER_BASE = {
  type: 'rayado', color: '#fcfaf4', lineColor: '#86a9d6', lineSpacing: 8, lineWidth: 0.17, lineOpacity: 0.62,
  margin: true, marginX: 28, marginColor: '#d9787a', grid: 5, grain: 0.3,
  deco: [], decoColor: '#3b4a8f',
  imageId: null, imageOpacity: 0.85, imageRot: 0,
};
export const PAPER_PRESETS = {
  rayado: { ...PAPER_BASE },
  cuadriculado: { ...PAPER_BASE, type: 'cuadriculado', lineColor: '#97b6df', lineSpacing: 10, margin: false },
  puntos: { ...PAPER_BASE, type: 'puntos', color: '#fbf8ef', lineColor: '#8d9bb3', lineSpacing: 8, margin: false, grid: 4, lineOpacity: 0.85 },
  liso: { ...PAPER_BASE, type: 'liso', color: '#fbf6ea', lineColor: '#cfc6b0', lineSpacing: 9, margin: false, grain: 0.35 },
};

// imágenes de fondo ya decodificadas (las carga papers.js); drawPaper las dibuja sin esperar
const images = new Map();
export function setPaperImage(id, bitmap) { if (bitmap) images.set(id, bitmap); else images.delete(id); }
export const hasPaperImage = (id) => images.has(id);

export const textLeft = (p) => (p.margin ? p.marginX + 4 : PAGE_GEOM.leftFree);

let grainTile = null;
function getGrain() {
  if (grainTile) return grainTile;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const x = c.getContext('2d');
  const img = x.createImageData(S, S);
  const rnd = mulberry32(99);
  // nubes de baja frecuencia
  const lf = document.createElement('canvas'); lf.width = 16; lf.height = 16;
  const lx = lf.getContext('2d'); const li = lx.createImageData(16, 16);
  for (let i = 0; i < 256; i++) { const v = 226 + rnd() * 14; li.data[i * 4] = li.data[i * 4 + 1] = li.data[i * 4 + 2] = v; li.data[i * 4 + 3] = 255; }
  lx.putImageData(li, 0, 0);
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  x.drawImage(lf, 0, 0, S, S);
  const base = x.getImageData(0, 0, S, S);
  for (let i = 0; i < S * S; i++) {
    const n = (rnd() - 0.5) * 26 + (rnd() < 0.012 ? -26 : 0);
    const v = base.data[i * 4] + n;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

const rr = (n) => Math.round(n);

/* decoraciones: todo en milímetros, dibujado por debajo del texto */
function decorate(ctx, ppm, key, col) {
  const W = PAGE_W, H = PAGE_H, m = (v) => v * ppm;
  ctx.save();
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (key === 'marco') {
    ctx.lineWidth = m(0.55); ctx.globalAlpha = 0.85; ctx.strokeRect(m(8), m(8), m(W - 16), m(H - 16));
    ctx.lineWidth = m(0.2); ctx.globalAlpha = 0.7; ctx.strokeRect(m(10), m(10), m(W - 20), m(H - 20));
  } else if (key === 'esquinas') {
    ctx.lineWidth = m(0.5); ctx.globalAlpha = 0.85;
    for (const [cx, cy, sx, sy] of [[9, 9, 1, 1], [W - 9, 9, -1, 1], [9, H - 9, 1, -1], [W - 9, H - 9, -1, -1]]) {
      ctx.beginPath(); ctx.moveTo(m(cx), m(cy + sy * 16)); ctx.lineTo(m(cx), m(cy)); ctx.lineTo(m(cx + sx * 16), m(cy)); ctx.stroke();
      ctx.beginPath(); ctx.arc(m(cx + sx * 4), m(cy + sy * 4), m(1.1), 0, 6.283); ctx.fill();
    }
  } else if (key === 'franja') {
    ctx.globalAlpha = 0.85; ctx.fillRect(0, 0, m(W), m(12));
    ctx.globalAlpha = 0.9; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, m(13.4), m(W), m(0.5));
    ctx.globalAlpha = 0.5; ctx.fillStyle = col; ctx.fillRect(0, m(14.6), m(W), m(0.35));
  } else if (key === 'perforaciones') {
    for (const y of [H * 0.2, H * 0.5, H * 0.8]) {
      ctx.globalAlpha = 0.16; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(m(10), m(y), m(3.2), 0, 6.283); ctx.fill();
      ctx.globalAlpha = 0.28; ctx.beginPath(); ctx.arc(m(10), m(y) + m(0.35), m(2.7), 0, 6.283); ctx.fill();
      ctx.globalAlpha = 0.4; ctx.lineWidth = m(0.25); ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.arc(m(10), m(y), m(3.2), 0, 6.283); ctx.stroke();
    }
  } else if (key === 'encabezado') {
    ctx.globalAlpha = 0.8; ctx.lineWidth = m(0.45); ctx.beginPath(); ctx.moveTo(m(18), m(17)); ctx.lineTo(m(W - 14), m(17)); ctx.stroke();
    ctx.lineWidth = m(0.18); ctx.beginPath(); ctx.moveTo(m(18), m(18.4)); ctx.lineTo(m(W - 14), m(18.4)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(m(W / 2), m(15.6)); ctx.lineTo(m(W / 2 + 2), m(17.7)); ctx.lineTo(m(W / 2), m(19.8)); ctx.lineTo(m(W / 2 - 2), m(17.7)); ctx.closePath(); ctx.fill();
  } else if (key === 'flores') {
    const sprig = (x, y, sc, rot) => {
      ctx.save(); ctx.translate(m(x), m(y)); ctx.rotate(rot); ctx.scale(sc, sc);
      ctx.globalAlpha = 0.8; ctx.lineWidth = m(0.45);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(m(10), m(-6), m(20), m(-4), m(30), m(-16)); ctx.stroke();
      for (const [t, d] of [[0.25, -1], [0.45, 1], [0.65, -1], [0.82, 1]]) {
        const px = m(30 * t) + m(2), py = m(-10 * t * (1 + t)) ;
        ctx.save(); ctx.translate(px, py); ctx.rotate(d * 0.9 - 0.4); ctx.globalAlpha = 0.55;
        ctx.beginPath(); ctx.ellipse(m(4), 0, m(4.4), m(1.8), 0, 0, 6.283); ctx.fill(); ctx.restore();
      }
      ctx.globalAlpha = 0.85; ctx.translate(m(30), m(-16));
      for (let i = 0; i < 5; i++) { ctx.rotate(6.283 / 5); ctx.beginPath(); ctx.ellipse(m(2.6), 0, m(2.6), m(1.5), 0, 0, 6.283); ctx.fill(); }
      ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(0, 0, m(1.1), 0, 6.283); ctx.fill();
      ctx.restore();
    };
    sprig(10, H - 10, 1, -0.15); sprig(W - 10, 10, 0.85, 3.0);
  }
  ctx.restore();
}

export function drawPaper(ctx, ppm, paper) {
  const W = PAGE_W * ppm, H = PAGE_H * ppm;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = paper.color;
  ctx.fillRect(0, 0, W, H);

  // imagen de fondo (de la galería, de internet o subida), recortada para cubrir la hoja
  const img = paper.imageId && images.get(paper.imageId);
  if (img) {
    const rot = ((paper.imageRot || 0) % 360 + 360) % 360;
    const iw = rot % 180 ? img.height : img.width, ih = rot % 180 ? img.width : img.height;
    const k = Math.max(W / iw, H / ih);
    ctx.save();
    ctx.globalAlpha = paper.imageOpacity ?? 0.85;
    ctx.translate(W / 2, H / 2); ctx.rotate((rot * Math.PI) / 180);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (-img.width * k) / 2, (-img.height * k) / 2, img.width * k, img.height * k);
    ctx.restore();
  }

  if (paper.grain > 0.01) {
    const pat = ctx.createPattern(getGrain(), 'repeat');
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = Math.min(1, paper.grain * 0.9);
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  const lw = Math.max(1, (paper.lineWidth ?? 0.17) * ppm);
  const lo = paper.lineOpacity ?? 0.62;
  ctx.strokeStyle = paper.lineColor;
  ctx.fillStyle = paper.lineColor;
  ctx.lineWidth = lw;
  ctx.globalAlpha = lo;
  if (paper.type === 'rayado') {
    ctx.beginPath();
    for (let y = PAGE_GEOM.top + paper.lineSpacing; y <= PAGE_H - 6; y += paper.lineSpacing) {
      const py = Math.round(y * ppm) + 0.5;
      ctx.moveTo(0, py); ctx.lineTo(W, py);
    }
    ctx.stroke();
  } else if (paper.type === 'cuadriculado') {
    const g = paper.grid;
    ctx.globalAlpha = Math.min(1, lo * 1.12);
    ctx.beginPath();
    const y0 = PAGE_GEOM.top + paper.lineSpacing - Math.ceil((PAGE_GEOM.top + paper.lineSpacing) / g) * g;
    for (let y = y0; y <= PAGE_H; y += g) { if (y < 0) continue; const py = Math.round(y * ppm) + 0.5; ctx.moveTo(0, py); ctx.lineTo(W, py); }
    for (let x = 0; x <= PAGE_W; x += g) { const px = Math.round(x * ppm) + 0.5; ctx.moveTo(px, 0); ctx.lineTo(px, H); }
    ctx.stroke();
  } else if (paper.type === 'puntos') {
    // cuadernola de puntos: un punto en cada cruce de una grilla cuadrada
    const g = Math.max(3, paper.grid), r = Math.max(0.6, 0.28 * ppm);
    const y0 = PAGE_GEOM.top + paper.lineSpacing - Math.ceil((PAGE_GEOM.top + paper.lineSpacing) / g) * g;
    for (let y = y0; y <= PAGE_H; y += g) for (let x = g; x < PAGE_W; x += g) { ctx.beginPath(); ctx.arc(rr(x * ppm), rr(y * ppm), r, 0, 6.283); ctx.fill(); }
  }
  if (paper.margin) {
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = paper.marginColor || '#d9787a';
    ctx.lineWidth = Math.max(1, 0.25 * ppm);
    const px = Math.round(paper.marginX * ppm) + 0.5;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const k of paper.deco || []) decorate(ctx, ppm, k, paper.decoColor || '#3b4a8f');
  ctx.restore();
}
