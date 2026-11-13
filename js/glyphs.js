// Biblioteca de letras: tu letra (capturada) + una letra de ejemplo para probar,
// y la fabricación de "sprites" (letra teñida con el instrumento elegido).
import { computeStrokeMap } from './skeleton.js';
import { clamp, hash, hexToRgb, mulberry32, smoothstep } from './util.js';

export const PAD = 6;
export const PXMM = 12;

export const INSTRUMENTS = {
  ballpoint: { label: 'Bolígrafo', color: '#1d2f8f', thickness: 0, pressure: 0.6 },
  pencil: { label: 'Lápiz', color: '#3a3a40', thickness: 0.1, pressure: 0.5 },
  fountain: { label: 'Pluma', color: '#13226b', thickness: 0.3, pressure: 0.7 },
  marker: { label: 'Fibrón', color: '#14161c', thickness: 0.65, pressure: 0.8 },
};

/* ------------------------------------------------------------------ */
/* Letra de ejemplo (fuente Caveat, libre) con variaciones aleatorias  */
/* ------------------------------------------------------------------ */
let fontPromise = null;
export function loadDemoFont(base = '') {
  if (!fontPromise) {
    fontPromise = (async () => {
      try {
        // window.__CAVEAT_URL lo define la versión empaquetada en un solo archivo (fuente embebida)
        const src = window.__CAVEAT_URL || `${base}fonts/caveat-500.woff2`;
        const ff = new FontFace('CaveatDemo', `url(${src})`, { weight: '500' });
        await ff.load();
        document.fonts.add(ff);
      } catch (e) { console.warn('No se pudo cargar la fuente de ejemplo', e); }
    })();
  }
  return fontPromise;
}

function charSeed(c) { return c.codePointAt(0) * 2654435761 >>> 0; }

function drawCustom(ctx, c) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (c === '♥') {
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(0, -30);
    ctx.bezierCurveTo(-52, -86, -78, -26, 0, 28);
    ctx.moveTo(0, -30);
    ctx.bezierCurveTo(52, -86, 78, -26, 0, 28);
    ctx.stroke();
    return true;
  }
  if (c === '✓') {
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(-34, -28); ctx.lineTo(-10, 0); ctx.lineTo(40, -74);
    ctx.stroke();
    return true;
  }
  return false;
}

export function makeDemoGlyph(c, vi) {
  const rnd = mulberry32(charSeed(c) + vi * 7919 + 13);
  const fs = 92, SS = 2;
  const CW = Math.ceil(fs * 2.4), CH = Math.ceil(fs * 2.4);
  const cv = document.createElement('canvas');
  cv.width = CW * SS; cv.height = CH * SS;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.scale(SS, SS);
  const baseY = fs * 1.55;
  ctx.translate(fs * 0.5, baseY);
  ctx.rotate((rnd() - 0.5) * 0.1);
  ctx.transform(1, 0, (rnd() - 0.5) * 0.2 - 0.03, 1, 0, 0);
  ctx.scale(1 + (rnd() - 0.5) * 0.12, 1 + (rnd() - 0.5) * 0.1);
  ctx.fillStyle = '#000'; ctx.strokeStyle = '#000';
  ctx.font = `500 ${fs}px CaveatDemo, cursive`;
  ctx.textBaseline = 'alphabetic';
  if (!drawCustom(ctx, c)) {
    ctx.fillText(c, 0, 0);
    ctx.fillText(c, (rnd() - 0.5) * 1.2, (rnd() - 0.5) * 1.2);
  }
  const src = ctx.getImageData(0, 0, cv.width, cv.height).data;
  const W = CW, H = CH;
  const a = new Uint8Array(W * H);
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let dy = 0; dy < SS; dy++) for (let dx = 0; dx < SS; dx++) s += src[(((y * SS + dy) * cv.width) + (x * SS + dx)) * 4 + 3];
      const v = s / (SS * SS);
      a[y * W + x] = v;
      if (v > 40) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
  }
  if (maxX < 0) { // carácter sin tinta (no debería pasar)
    return { id: `d${c}${vi}`, char: c, w: 4, h: 4, pxmm: PXMM, base: 4, alpha: new Uint8Array(16), demo: true };
  }
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const alpha = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) alpha[y * w + x] = a[(y + minY) * W + x + minX];
  return { id: `d${c}${vi}`, char: c, w, h, pxmm: PXMM, base: baseY - minY, alpha, demo: true };
}

/* ------------------------------------------------------------------ */
/* Biblioteca                                                          */
/* ------------------------------------------------------------------ */
export class HandLibrary {
  constructor() {
    this.mine = new Map();
    this.demo = new Map();
    this.useMine = true;
    this.usedFallback = new Set();
    this.version = 0;
  }
  setMine(list) {
    this.mine = new Map();
    for (const g of list) {
      if (!this.mine.has(g.char)) this.mine.set(g.char, []);
      this.mine.get(g.char).push(g);
    }
    this.version++;
  }
  mineChars() { return this.mine.size; }
  mineCount(c) { return (this.mine.get(c) || []).length; }
  hasMine() { return this.mine.size > 0; }
  demoVariants(c) {
    let v = this.demo.get(c);
    if (!v) {
      v = [];
      for (let i = 0; i < 6; i++) v.push(makeDemoGlyph(c, i));
      this.demo.set(c, v);
    }
    return v;
  }
  variants(c) {
    if (this.useMine && this.mine.size) {
      const v = this.mine.get(c);
      if (v && v.length) return v;
      this.usedFallback.add(c);
    }
    return this.demoVariants(c);
  }
}

/* ------------------------------------------------------------------ */
/* Sprites teñidos                                                     */
/* ------------------------------------------------------------------ */
function vnoise(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(seed, x0 * 7919 + y0, 1), b = hash(seed, (x0 + 1) * 7919 + y0, 1);
  const c = hash(seed, x0 * 7919 + y0 + 1, 1), d = hash(seed, (x0 + 1) * 7919 + y0 + 1, 1);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
}

function morph(src, W, H, r, dilate) {
  const R = Math.ceil(r);
  const offs = [];
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= r * r + 0.25) offs.push([dx, dy]);
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let m = dilate ? 0 : 255;
      for (const [dx, dy] of offs) {
        const xx = x + dx, yy = y + dy;
        const v = (xx < 0 || yy < 0 || xx >= W || yy >= H) ? 0 : src[yy * W + xx];
        if (dilate) { if (v > m) m = v; } else if (v < m) m = v;
      }
      out[y * W + x] = m;
    }
  }
  return out;
}

function box3(src, W, H) {
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) { n++; continue; }
        s += src[yy * W + xx]; n++;
      }
      out[y * W + x] = s / n;
    }
  }
  return out;
}

const spriteCache = new Map();
export function styleKey(st) {
  return `${st.inst}|${st.color}|${Math.round(st.thickness * 20)}|${Math.round(st.pressure * 10)}`;
}

export function getSprite(g, st) {
  const key = g.id + '#' + styleKey(st);
  let cv = spriteCache.get(key);
  if (cv) return cv;
  cv = makeSprite(g, st);
  spriteCache.set(key, cv);
  if (spriteCache.size > 2500) {
    const first = spriteCache.keys().next().value;
    spriteCache.delete(first);
  }
  return cv;
}
export function clearSpriteCache() { spriteCache.clear(); }

function makeSprite(g, st) {
  const W = g.w + 2 * PAD, H = g.h + 2 * PAD;
  let A = new Uint8Array(W * H);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) A[(y + PAD) * W + x + PAD] = g.alpha[y * g.w + x];

  // grosor: erosión / dilatación continuas
  const rad = clamp(st.thickness, -1, 1) * 2.8;
  if (Math.abs(rad) > 0.15) {
    const dil = rad > 0, ar = Math.abs(rad);
    const lo = Math.floor(ar), hi = Math.ceil(ar), f = ar - lo;
    const m1 = lo > 0 ? morph(A, W, H, lo, dil) : A;
    if (hi !== lo && f > 0.05) {
      const m2 = morph(A, W, H, hi, dil);
      const mix = new Uint8Array(W * H);
      for (let i = 0; i < mix.length; i++) mix[i] = m1[i] + (m2[i] - m1[i]) * f;
      A = mix;
    } else A = m1;
    A = box3(A, W, H);
  }

  const seed = charSeedFromId(g.id);
  const rgb = hexToRgb(st.color);
  const out = new ImageData(W, H);
  const d = out.data;
  const p = clamp(st.pressure, 0, 1);
  const inst = st.inst;
  let halo = null;
  if (inst === 'fountain') halo = box3(morph(A, W, H, 1.2, true), W, H);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let a = A[i] / 255;
      let lighten = 0;
      if (inst === 'ballpoint') {
        const n = vnoise(x / 5, y / 5, seed);
        a = Math.pow(a, 1.2 - 0.55 * p) * (0.9 + 0.1 * n);
        lighten = (1 - n) * 0.12 * (1 - p);
      } else if (inst === 'pencil') {
        const gr = 0.5 + 0.5 * hash(seed, i, 3);
        const gr2 = 0.7 + 0.3 * vnoise(x / 2.2, y / 2.2, seed + 5);
        a = a * (0.45 + 0.4 * p) * (0.35 + 0.65 * gr * gr2) * 1.35;
        lighten = 0.1;
      } else if (inst === 'fountain') {
        const n = vnoise(x / 9, y / 9, seed);
        const bleed = halo ? halo[i] / 255 * 0.22 : 0;
        a = Math.min(1, Math.max(a, bleed) * (0.95 + 0.1 * p));
        lighten = (1 - n) * 0.35 * (1 - a * 0.5) * (1 - p * 0.6);
        if (a > 0.85) lighten -= 0.12;
      } else if (inst === 'marker') {
        a = Math.min(1, a * 1.3);
        a = a * (0.94 + 0.06 * vnoise(x / 14, y / 14, seed));
        lighten = 0;
      }
      lighten = clamp(lighten, -0.2, 0.7);
      const o = i * 4;
      d[o] = rgb[0] + (255 - rgb[0]) * lighten;
      d[o + 1] = rgb[1] + (255 - rgb[1]) * lighten;
      d[o + 2] = rgb[2] + (255 - rgb[2]) * lighten;
      d[o + 3] = clamp(a, 0, 1) * 255;
    }
  }
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  cv.getContext('2d').putImageData(out, 0, 0);
  return cv;
}

function charSeedFromId(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* ------------------------------------------------------------------ */
/* Animación de trazo                                                  */
/* ------------------------------------------------------------------ */
export function strokeMap(g) {
  if (!g._map) g._map = computeStrokeMap(g.alpha, g.w, g.h, PAD);
  return g._map;
}
export const strokeLenMm = (g) => strokeMap(g).len / g.pxmm;

let scratch = null, maskC = null;
// Devuelve un canvas con la parte ya "escrita" de la letra (progreso p entre 0 y 1+)
export function revealSprite(g, sprite, p) {
  const m = strokeMap(g);
  const { W, H, t } = m;
  if (!scratch) { scratch = document.createElement('canvas'); maskC = document.createElement('canvas'); }
  if (scratch.width !== W || scratch.height !== H) { scratch.width = W; scratch.height = H; maskC.width = W; maskC.height = H; }
  const mctx = maskC.getContext('2d');
  const img = mctx.createImageData(W, H);
  const d = img.data;
  const EPS = 0.08;
  const lim = p;
  for (let i = 0, n = W * H; i < n; i++) {
    const v = (lim - t[i]) / EPS;
    d[i * 4 + 3] = v <= 0 ? 0 : v >= 1 ? 255 : v * 255;
  }
  mctx.putImageData(img, 0, 0);
  const sctx = scratch.getContext('2d');
  sctx.globalCompositeOperation = 'source-over';
  sctx.clearRect(0, 0, W, H);
  sctx.drawImage(sprite, 0, 0);
  sctx.globalCompositeOperation = 'destination-in';
  sctx.drawImage(maskC, 0, 0);
  sctx.globalCompositeOperation = 'source-over';
  return scratch;
}

export { smoothstep };
