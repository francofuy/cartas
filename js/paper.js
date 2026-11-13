// Dibujo de la hoja (A4 en mm). Todo se escala con "ppm" = píxeles por milímetro.
import { PAGE_W, PAGE_H } from './template.js';
import { mulberry32 } from './util.js';

export const PAGE_GEOM = { top: 22, bottom: 12, right: 14, leftFree: 18 };

export const PAPER_PRESETS = {
  rayado: { type: 'rayado', color: '#fcfaf4', lineColor: '#86a9d6', lineSpacing: 8, margin: true, marginX: 28, grid: 5, grain: 0.3 },
  cuadriculado: { type: 'cuadriculado', color: '#fcfaf4', lineColor: '#97b6df', lineSpacing: 10, margin: false, marginX: 28, grid: 5, grain: 0.3 },
  liso: { type: 'liso', color: '#fbf6ea', lineColor: '#cfc6b0', lineSpacing: 9, margin: false, marginX: 28, grid: 5, grain: 0.35 },
};

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

export function drawPaper(ctx, ppm, paper) {
  const W = PAGE_W * ppm, H = PAGE_H * ppm;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = paper.color;
  ctx.fillRect(0, 0, W, H);

  if (paper.grain > 0.01) {
    const pat = ctx.createPattern(getGrain(), 'repeat');
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = Math.min(1, paper.grain * 0.9);
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  const lw = Math.max(1, 0.17 * ppm);
  ctx.strokeStyle = paper.lineColor;
  ctx.lineWidth = lw;
  ctx.globalAlpha = 0.62;
  if (paper.type === 'rayado') {
    ctx.beginPath();
    for (let y = PAGE_GEOM.top + paper.lineSpacing; y <= PAGE_H - 6; y += paper.lineSpacing) {
      const py = Math.round(y * ppm) + 0.5;
      ctx.moveTo(0, py); ctx.lineTo(W, py);
    }
    ctx.stroke();
  } else if (paper.type === 'cuadriculado') {
    const g = paper.grid;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    const y0 = PAGE_GEOM.top + paper.lineSpacing - Math.ceil((PAGE_GEOM.top + paper.lineSpacing) / g) * g;
    for (let y = y0; y <= PAGE_H; y += g) { if (y < 0) continue; const py = Math.round(y * ppm) + 0.5; ctx.moveTo(0, py); ctx.lineTo(W, py); }
    for (let x = 0; x <= PAGE_W; x += g) { const px = Math.round(x * ppm) + 0.5; ctx.moveTo(px, 0); ctx.lineTo(px, H); }
    ctx.stroke();
  }
  if (paper.margin) {
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = '#d9787a';
    ctx.lineWidth = Math.max(1, 0.25 * ppm);
    const px = Math.round(paper.marginX * ppm) + 0.5;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();
  }
  ctx.restore();
}
