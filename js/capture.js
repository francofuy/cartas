// Foto de la plantilla -> letras sueltas (solo tinta, sin fondo de papel)
import { PAGE_W, PAGE_H, PX_PER_MM as PXMM, MARKERS, GRID, CODE, pageCells } from './template.js';
import { TEMPLATE_PAGES } from './chars.js';
import { clamp, nextFrame, smoothstep } from './util.js';

export async function loadPhoto(file, maxSide = 4096) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const cw = Math.round(bmp.width * s), ch = Math.round(bmp.height * s);
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  c.getContext('2d', { willReadFrequently: true }).drawImage(bmp, 0, 0, cw, ch);
  if (bmp.close) bmp.close();
  return c;
}

/* ------------------------------------------------------------------ */
/* Detección de las 4 marcas                                           */
/* ------------------------------------------------------------------ */
function findBlobs(mask, w, h) {
  const blobs = [];
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    let area = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    let minx = w, maxx = 0, miny = h, maxy = 0;
    seen[i] = 1; stack.push(i);
    while (stack.length) {
      const c = stack.pop();
      const x = c % w, y = (c / w) | 0;
      area++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
      if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
      if (x > 0 && mask[c - 1] && !seen[c - 1]) { seen[c - 1] = 1; stack.push(c - 1); }
      if (x < w - 1 && mask[c + 1] && !seen[c + 1]) { seen[c + 1] = 1; stack.push(c + 1); }
      if (y > 0 && mask[c - w] && !seen[c - w]) { seen[c - w] = 1; stack.push(c - w); }
      if (y < h - 1 && mask[c + w] && !seen[c + w]) { seen[c + w] = 1; stack.push(c + w); }
    }
    blobs.push({ area, sx, sy, sxx, syy, sxy, minx, maxx, miny, maxy });
  }
  return blobs;
}

function solidBlob(b, minDim) {
  const minA = Math.pow(minDim * 0.012, 2), maxA = Math.pow(minDim * 0.22, 2);
  if (b.area < minA || b.area > maxA) return null;
  const bw = b.maxx - b.minx + 1, bh = b.maxy - b.miny + 1;
  if (b.area / (bw * bh) < 0.35) return null;
  const mx = b.sx / b.area, my = b.sy / b.area;
  const vxx = b.sxx / b.area - mx * mx, vyy = b.syy / b.area - my * my, vxy = b.sxy / b.area - mx * my;
  const tr = vxx + vyy, det = vxx * vyy - vxy * vxy;
  if (det <= 0) return null;
  const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
  if (l2 <= 0 || l1 / l2 > 5) return null;
  const solidity = b.area / Math.sqrt(det); // cuadrado = 12, círculo ≈ 12.6
  if (solidity < 9.5 || solidity > 13.8) return null;
  return { x: mx, y: my, area: b.area };
}

const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

function orderFromTL(tl, others) {
  const cx = (tl.x + others[0].x + others[1].x + others[2].x) / 4;
  const cy = (tl.y + others[0].y + others[1].y + others[2].y) / 4;
  const a0 = Math.atan2(tl.y - cy, tl.x - cx);
  const rel = (p) => (Math.atan2(p.y - cy, p.x - cx) - a0 + 4 * Math.PI) % (2 * Math.PI);
  const sorted = others.slice().sort((p, q) => rel(p) - rel(q));
  return [tl, ...sorted]; // TL, TR, BR, BL (en sentido horario)
}

export function detectMarkers(canvas) {
  const maxS = 1400;
  const s = Math.min(1, maxS / Math.max(canvas.width, canvas.height));
  const w = Math.max(16, Math.round(canvas.width * s)), h = Math.max(16, Math.round(canvas.height * s));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(canvas, 0, 0, w, h);
  const d = cx.getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  const W1 = w + 1;
  const I = new Float64Array(W1 * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) { row += g[y * w + x]; I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + row; }
  }
  const r = Math.max(10, Math.round(Math.min(w, h) / 12));
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum = I[(y1 + 1) * W1 + x1 + 1] - I[y0 * W1 + x1 + 1] - I[(y1 + 1) * W1 + x0] + I[y0 * W1 + x0];
      const mean = sum / area;
      if (mean > 35 && g[y * w + x] < mean * 0.58) mask[y * w + x] = 1;
    }
  }
  const minDim = Math.min(w, h);
  let cands = findBlobs(mask, w, h).map((b) => solidBlob(b, minDim)).filter(Boolean);
  cands.sort((a, b) => b.area - a.area);
  cands = cands.slice(0, 18);
  if (cands.length < 4) return null;

  let best = null, bestScore = 0;
  for (const tl of cands) {
    const others = cands.filter((b) => b !== tl && b.area < 0.92 * tl.area && b.area > 0.18 * tl.area);
    for (let i = 0; i < others.length; i++) for (let j = i + 1; j < others.length; j++) for (let k = j + 1; k < others.length; k++) {
      const tri = [others[i], others[j], others[k]];
      const areas = tri.map((t) => t.area);
      if (Math.max(...areas) / Math.min(...areas) > 1.9) continue;
      const q = orderFromTL(tl, tri);
      // convexo
      const sgn = [cross(q[0], q[1], q[2]), cross(q[1], q[2], q[3]), cross(q[2], q[3], q[0]), cross(q[3], q[0], q[1])];
      if (!(sgn.every((v) => v > 0) || sgn.every((v) => v < 0))) continue;
      let polyA = 0;
      for (let t = 0; t < 4; t++) { const a = q[t], b = q[(t + 1) % 4]; polyA += a.x * b.y - b.x * a.y; }
      polyA = Math.abs(polyA) / 2;
      const side1 = Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y), side2 = Math.hypot(q[2].x - q[1].x, q[2].y - q[1].y);
      const ar = side1 / side2; // página 186/273 ≈ 0.68
      if (ar < 0.35 || ar > 1.2) continue;
      const ratio = (areas[0] + areas[1] + areas[2]) / 3 / tl.area;
      const score = polyA / (1 + 2 * Math.abs(Math.log(ratio / 0.444)));
      if (score > bestScore) { bestScore = score; best = q; }
    }
  }
  if (!best) return null;
  return best.map((p) => [p.x / s, p.y / s]);
}

export function defaultCorners(canvas) {
  const w = canvas.width, h = canvas.height;
  const mx = w * 0.12, my = h * 0.08;
  return [[mx, my], [w - mx, my], [w - mx, h - my], [mx, h - my]];
}

/* ------------------------------------------------------------------ */
/* Homografía y enderezado                                             */
/* ------------------------------------------------------------------ */
function solveLinear(A, b) {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k;
    [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    for (let k = i + 1; k < n; k++) {
      const f = A[k][i] / A[i][i];
      for (let j = i; j < n; j++) A[k][j] -= f * A[i][j];
      b[k] -= f * b[i];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j];
    x[i] = s / A[i][i];
  }
  return x;
}

export function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = solveLinear(A, b);
  return [...h, 1];
}

// pts: centros de las 4 marcas en la foto (TL, TR, BR, BL)
export function warpPage(canvas, pts) {
  const H = homography(MARKERS.map((m) => [m.cx, m.cy]), pts);
  const sw = canvas.width, sh = canvas.height;
  const id = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, sw, sh).data;
  const R = new Uint8Array(sw * sh);
  for (let i = 0, n = sw * sh; i < n; i++) R[i] = id[i * 4]; // canal rojo: las guías claras casi desaparecen
  const W = Math.round(PAGE_W * PXMM), Hh = Math.round(PAGE_H * PXMM);
  const out = new Uint8Array(W * Hh);
  for (let y = 0; y < Hh; y++) {
    const Y = (y + 0.5) / PXMM;
    for (let x = 0; x < W; x++) {
      const X = (x + 0.5) / PXMM;
      const den = H[6] * X + H[7] * Y + 1;
      const u = (H[0] * X + H[1] * Y + H[2]) / den - 0.5;
      const v = (H[3] * X + H[4] * Y + H[5]) / den - 0.5;
      if (u < 0 || v < 0 || u >= sw - 1 || v >= sh - 1) { out[y * W + x] = 255; continue; }
      const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0;
      const i = y0 * sw + x0;
      const a = R[i] + (R[i + 1] - R[i]) * fx;
      const b = R[i + sw] + (R[i + sw + 1] - R[i + sw]) * fx;
      out[y * W + x] = a + (b - a) * fy;
    }
  }
  return { R: out, W, H: Hh };
}

/* ------------------------------------------------------------------ */
/* Fondo (iluminación) y extracción de tinta                           */
/* ------------------------------------------------------------------ */
function sepFilter(a, w, h, rad, kind) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = kind === 'max' ? -1 : 0;
      for (let k = -rad; k <= rad; k++) {
        const xx = clamp(x + k, 0, w - 1), q = a[y * w + xx];
        if (kind === 'max') { if (q > v) v = q; } else v += q;
      }
      tmp[y * w + x] = kind === 'max' ? v : v / (2 * rad + 1);
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = kind === 'max' ? -1 : 0;
      for (let k = -rad; k <= rad; k++) {
        const yy = clamp(y + k, 0, h - 1), q = tmp[yy * w + x];
        if (kind === 'max') { if (q > v) v = q; } else v += q;
      }
      out[y * w + x] = kind === 'max' ? v : v / (2 * rad + 1);
    }
  }
  return out;
}

function backgroundMap(R, W, H) {
  const bw = Math.ceil(W / PXMM), bh = Math.ceil(H / PXMM);
  const a = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let s = 0, n = 0;
      for (let y = by * PXMM; y < Math.min(H, (by + 1) * PXMM); y += 2) {
        for (let x = bx * PXMM; x < Math.min(W, (bx + 1) * PXMM); x += 2) { s += R[y * W + x]; n++; }
      }
      a[by * bw + bx] = n ? s / n : 255;
    }
  }
  const m = sepFilter(a, bw, bh, 4, 'max');
  const bl = sepFilter(m, bw, bh, 3, 'blur');
  return {
    bw, bh,
    at(px, py) {
      const fx = clamp(px / PXMM - 0.5, 0, bw - 1.001), fy = clamp(py / PXMM - 0.5, 0, bh - 1.001);
      const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
      const i = y0 * bw + x0;
      const v0 = bl[i] + (bl[i + 1] - bl[i]) * tx, v1 = bl[i + bw] + (bl[i + bw + 1] - bl[i + bw]) * tx;
      return v0 + (v1 - v0) * ty;
    },
  };
}

// Código de página (3 cuadraditos). Devuelve 0..6 o -1
export function detectPageCode(R, W, H) {
  const bg = backgroundMap(R, W, H);
  let code = 0;
  for (let b = 0; b < CODE.bits; b++) {
    const x0 = Math.round((CODE.x + b * CODE.step + 1) * PXMM), x1 = Math.round((CODE.x + b * CODE.step + CODE.size - 1) * PXMM);
    const y0 = Math.round((CODE.y + 1) * PXMM), y1 = Math.round((CODE.y + CODE.size - 1) * PXMM);
    let s = 0, n = 0, bgs = 0;
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { s += R[y * W + x]; bgs += bg.at(x, y); n++; }
    if (s / bgs < 0.55) code |= 1 << b;
  }
  return code < TEMPLATE_PAGES.length ? code : -1;
}

function components(bin, w, h) {
  const lab = new Int32Array(w * h).fill(-1);
  const comps = [];
  const stack = [];
  for (let i = 0; i < bin.length; i++) {
    if (!bin[i] || lab[i] !== -1) continue;
    const id = comps.length;
    let area = 0, minx = w, maxx = 0, miny = h, maxy = 0;
    lab[i] = id; stack.push(i);
    while (stack.length) {
      const c = stack.pop();
      const x = c % w, y = (c / w) | 0;
      area++;
      if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const n = yy * w + xx;
        if (bin[n] && lab[n] === -1) { lab[n] = id; stack.push(n); }
      }
    }
    comps.push({ area, minx, maxx, miny, maxy });
  }
  return { lab, comps };
}

export async function extractGlyphs(R, W, H, page, onProgress) {
  const bg = backgroundMap(R, W, H);
  const cells = pageCells(page);
  const ins = GRID.inset;

  // 1) razón de tinta por casillero
  const data = [];
  const hist = new Uint32Array(101);
  for (let ci = 0; ci < cells.length; ci++) {
    const cell = cells[ci];
    const x0 = Math.round((cell.x + ins) * PXMM), y0 = Math.round((cell.y + ins) * PXMM);
    const x1 = Math.round((cell.x + cell.w - ins) * PXMM), y1 = Math.round((cell.y + cell.h - ins) * PXMM);
    const cw = x1 - x0, ch = y1 - y0;
    const ratio = new Float32Array(cw * ch);
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const b = bg.at(x0 + x, y0 + y);
        const v = b > 40 ? clamp(1 - R[(y0 + y) * W + x0 + x] / b, 0, 1) : 0;
        ratio[y * cw + x] = v;
        if (v > 0.22) hist[Math.min(100, (v * 100) | 0)]++;
      }
    }
    data.push({ cell, x0, y0, cw, ch, ratio });
    if (ci % 12 === 0) { onProgress?.(`Leyendo casilleros… ${ci}/${cells.length}`); await nextFrame(); }
  }
  let tot = 0; for (const v of hist) tot += v;
  let inkMax = 0.6;
  if (tot > 200) {
    let acc = 0;
    for (let i = 0; i <= 100; i++) { acc += hist[i]; if (acc >= tot * 0.97) { inkMax = i / 100; break; } }
  }
  const lo = 0.17, hi = Math.max(0.42, inkMax * 0.8);

  // 2) alfa + limpieza + recorte
  const glyphs = [];
  const empty = [];
  for (let ci = 0; ci < data.length; ci++) {
    const { cell, y0, cw, ch, ratio } = data[ci];
    const alpha = new Uint8Array(cw * ch);
    const bin = new Uint8Array(cw * ch);
    for (let i = 0; i < alpha.length; i++) {
      const a = smoothstep(lo, hi, ratio[i]);
      alpha[i] = a * 255;
      if (a > 0.5) bin[i] = 1;
    }
    const { lab, comps } = components(bin, cw, ch);
    const keep = new Uint8Array(comps.length);
    comps.forEach((c, id) => {
      if (c.area < 20) return;
      const bw = c.maxx - c.minx + 1, bh = c.maxy - c.miny + 1;
      const touches = c.minx === 0 || c.miny === 0 || c.maxx === cw - 1 || c.maxy === ch - 1;
      if (touches && (bw > cw * 0.7 || bh > ch * 0.7) && Math.min(bw, bh) < 0.14 * Math.max(bw, bh)) return; // restos de las líneas
      keep[id] = 1;
    });
    // máscara de componentes conservados, un poco dilatada para no perder el borde suave
    const km = new Uint8Array(cw * ch);
    for (let i = 0; i < km.length; i++) if (lab[i] >= 0 && keep[lab[i]]) km[i] = 1;
    const dil = new Uint8Array(cw * ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      let on = 0;
      for (let dy = -2; dy <= 2 && !on; dy++) for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < cw && yy < ch && km[yy * cw + xx]) { on = 1; break; }
      }
      dil[y * cw + x] = on;
    }
    let minX = cw, minY = ch, maxX = -1, maxY = -1, count = 0;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const i = y * cw + x;
      if (!dil[i]) alpha[i] = 0;
      if (alpha[i] > 40) { count++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
    if (count < 20) { empty.push(cell.char); continue; }
    minX = Math.max(0, minX - 1); minY = Math.max(0, minY - 1); maxX = Math.min(cw - 1, maxX + 1); maxY = Math.min(ch - 1, maxY + 1);
    const w = maxX - minX + 1, h = maxY - minY + 1;
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = alpha[(y + minY) * cw + x + minX];
    glyphs.push({ char: cell.char, w, h, pxmm: PXMM, base: cell.baseY * PXMM - (y0 + minY), alpha: out, page });
    if (ci % 10 === 0) { onProgress?.(`Separando letras… ${ci}/${data.length}`); await nextFrame(); }
  }
  return { glyphs, empty };
}

export async function processPhoto(canvas, pts, pageHint, onProgress) {
  onProgress?.('Enderezando la hoja…');
  await nextFrame();
  const { R, W, H } = warpPage(canvas, pts);
  let page = pageHint;
  let autoPage = -1;
  if (page == null || page < 0) { autoPage = detectPageCode(R, W, H); page = autoPage; }
  if (page == null || page < 0) return { needPage: true, R, W, H };
  const res = await extractGlyphs(R, W, H, page, onProgress);
  return { page, autoPage, ...res };
}

// versión "ya enderezada" para continuar tras elegir la página a mano
export async function processWarped(warped, page, onProgress) {
  const res = await extractGlyphs(warped.R, warped.W, warped.H, page, onProgress);
  return { page, ...res };
}
