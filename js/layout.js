// Acomoda el texto en renglones y hojas, con las imperfecciones de la mano.
// Todo es determinista (hash de semilla + posición), así nada "salta" al re-dibujar.
import { hash } from './util.js';
import { normalizeChar } from './chars.js';
import { PAGE_W, PAGE_H } from './template.js';
import { PAGE_GEOM, textLeft } from './paper.js';

export function geometry(S) {
  const rowH = S.paper.lineSpacing, o = S.geom || {};
  const pw = o.pageW ?? PAGE_W, ph = o.pageH ?? PAGE_H;
  const top = o.top ?? PAGE_GEOM.top, left = o.left ?? textLeft(S.paper);
  const right = pw - (o.right ?? PAGE_GEOM.right), bottom = ph - (o.bottom ?? PAGE_GEOM.bottom);
  return { rowH, top, left, right, bottom, rows: Math.max(1, Math.floor((bottom - top) / rowH)) };
}

export function layoutText(text, lib, S) {
  const G = geometry(S);
  const seed = S.seed | 0;
  const imp = S.imperfection;
  const n = text.length;
  const items = new Array(n).fill(null);
  const caret = new Array(n + 1);
  const lines = []; // lines[l] = [índices]
  const lastVar = new Map();
  let line = 0, x = G.left;
  // cada cara nueva nace por desborde ('auto'), por «dar vuelta» (\v → 'flip') o por «hoja nueva» (\f → 'new')
  const faceKind = [];
  const advance = () => { line++; if (line % G.rows === 0) faceKind[line / G.rows] = 'auto'; };
  const forceFace = (kind) => { const f = Math.floor(line / G.rows) + 1; line = f * G.rows; faceKind[f] = kind; };
  const isSep = (c) => c === ' ' || c === '\n' || c === '\t' || c === '\f' || c === '\v';

  const lineBase = (ln) => {
    const row = ln % G.rows;
    return G.top + (row + 1) * G.rowH - 0.35;
  };
  const lineP = (ln) => ({ tilt: (hash(seed, ln, 11) - 0.5) * 0.009 * imp, off: (hash(seed, ln, 12) - 0.5) * 0.7 * imp });
  const addLine = (ln, k) => { (lines[ln] || (lines[ln] = [])).push(k); };

  const setCaret = (k, xl, xr, ln) => {
    caret[k] = { x: xl, xr, y: lineBase(ln), line: ln, page: Math.floor(ln / G.rows) };
    addLine(ln, k);
  };

  let i = 0;
  while (i < n) {
    const ch = text[i];
    if (ch === '\n') {
      setCaret(i, x, x, line);
      advance(); x = G.left; i++;
      continue;
    }
    if (ch === '\f' || ch === '\v') {
      setCaret(i, x, x, line);
      forceFace(ch === '\v' ? 'flip' : 'new'); x = G.left; i++;
      continue;
    }
    if (ch === ' ' || ch === '\t') {
      const sw = (3.4 * S.size * (0.85 + 0.4 * hash(seed, i, 21)) + S.wordSpacing) * (ch === '\t' ? 4 : 1);
      setCaret(i, x, x + sw, line);
      x += sw; i++;
      continue;
    }
    // palabra
    let j = i;
    while (j < n && !isSep(text[j])) j++;
    const ents = [];
    let wlen = 0;
    for (let k = i; k < j; k++) {
      const c = normalizeChar(text[k]);
      const vs = lib.variants(c);
      let idx = Math.floor(hash(seed, k, 31) * vs.length);
      const last = lastVar.get(c);
      if (vs.length > 1 && idx === last) idx = (idx + 1 + Math.floor(hash(seed, k, 32) * (vs.length - 1))) % vs.length;
      lastVar.set(c, idx);
      const g = vs[idx];
      const sc = 1 + (hash(seed, k, 6) - 0.5) * 0.08 * imp;
      const mm = (S.size / g.pxmm) * sc;
      const gap = 0.5 * S.size + S.letterSpacing + (hash(seed, k, 8) - 0.5) * 0.5 * imp;
      ents.push({ k, g, mm, w: g.w * mm, adv: g.w * mm + Math.max(-0.4, gap) });
      wlen += ents[ents.length - 1].adv;
    }
    if (x + wlen > G.right && x > G.left + 0.01) { advance(); x = G.left; }
    const wordOff = (hash(seed, i, 3) - 0.5) * 0.55 * imp;
    for (const e of ents) {
      if (x + e.w > G.right && x > G.left + 0.01) { advance(); x = G.left; }
      const lp = lineP(line);
      const yy = lineBase(line) + lp.off + lp.tilt * (x - G.left) + wordOff + (hash(seed, e.k, 4) - 0.5) * 0.5 * imp;
      items[e.k] = {
        k: e.k, g: e.g, mm: e.mm,
        x: x + e.w / 2, y: yy,
        rot: (hash(seed, e.k, 5) - 0.5) * 0.055 * imp + lp.tilt,
        alpha: 0.88 + 0.12 * hash(seed, e.k, 7),
        page: Math.floor(line / G.rows), line,
      };
      setCaret(e.k, x, x + e.adv, line);
      x += e.adv;
    }
    i = j;
  }
  caret[n] = { x, xr: x, y: lineBase(line), line, page: Math.floor(line / G.rows) };
  addLine(line, n);
  const pages = Math.floor(line / G.rows) + 1;
  // caras (lo que se ve y se imprime) agrupadas en hojas físicas: frente y, si hay, dorso
  const faces = [], sheets = [];
  for (let f = 0; f < pages; f++) {
    const kind = f === 0 ? 'new' : faceKind[f] || 'auto';
    const prev = faces[f - 1];
    const asBack = f > 0 && prev.side === 'front' && (kind === 'flip' || (kind === 'auto' && S.overflow !== 'new'));
    if (asBack) { faces.push({ sheet: prev.sheet, side: 'back' }); sheets[prev.sheet].back = f; }
    else { sheets.push({ front: f, back: null }); faces.push({ sheet: sheets.length - 1, side: 'front' }); }
  }
  return { items, caret, lines, pages, G, endLine: line, faces, sheets };
}

// índice de texto más cercano a un punto (en mm) de una hoja
export function hitTest(layout, page, mmX, mmY) {
  const { G, lines, caret } = layout;
  let row = Math.floor((mmY - G.top) / G.rowH);
  row = Math.max(0, Math.min(G.rows - 1, row));
  let ln = page * G.rows + row;
  if (ln > layout.endLine) ln = layout.endLine;
  const idxs = lines[ln];
  if (!idxs || !idxs.length) return caret.length - 1;
  let best = idxs[0], bd = Infinity;
  for (const k of idxs) {
    const c = caret[k];
    const d1 = Math.abs(mmX - c.x);
    if (d1 < bd) { bd = d1; best = k; }
    if (k < caret.length - 1) {
      const d2 = Math.abs(mmX - c.xr);
      if (d2 < bd) { bd = d2; best = k + 1; }
    }
  }
  return best;
}
