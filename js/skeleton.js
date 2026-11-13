// Del bitmap de una letra a un "mapa de tiempo de trazo":
// cada píxel recibe un valor t en [0,1] que indica cuándo lo dibuja la lapicera.
// Se adelgaza la letra (Zhang-Suen), se recorre el esqueleto desde el punto de arranque
// y cada píxel de tinta hereda el tiempo del punto de esqueleto más cercano.

const N8 = (W) => [-W - 1, -W, -W + 1, -1, 1, W - 1, W, W + 1];

function thin(img, W, H) {
  const del = [];
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 80) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      del.length = 0;
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          if (!img[i]) continue;
          const p2 = img[i - W], p3 = img[i - W + 1], p4 = img[i + 1], p5 = img[i + W + 1];
          const p6 = img[i + W], p7 = img[i + W - 1], p8 = img[i - 1], p9 = img[i - W - 1];
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;
          const A = (!p2 && p3 ? 1 : 0) + (!p3 && p4 ? 1 : 0) + (!p4 && p5 ? 1 : 0) + (!p5 && p6 ? 1 : 0) +
            (!p6 && p7 ? 1 : 0) + (!p7 && p8 ? 1 : 0) + (!p8 && p9 ? 1 : 0) + (!p9 && p2 ? 1 : 0);
          if (A !== 1) continue;
          if (step === 0) { if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue; }
          else if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue;
          del.push(i);
        }
      }
      if (del.length) { changed = true; for (const i of del) img[i] = 0; }
    }
  }
}

export function computeStrokeMap(alpha, w, h, pad) {
  const W = w + 2 * pad, H = h + 2 * pad;
  const bin = new Uint8Array(W * H);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (alpha[y * w + x] > 90) bin[(y + pad) * W + x + pad] = 1;
  }
  const sk = bin.slice();
  thin(sk, W, H);

  const t = new Float32Array(W * H);
  const nb = N8(W);

  // componentes del esqueleto
  const comp = new Int32Array(W * H).fill(-1);
  const comps = [];
  const stack = [];
  for (let i = 0; i < sk.length; i++) {
    if (!sk[i] || comp[i] !== -1) continue;
    const id = comps.length, px = [];
    comp[i] = id; stack.push(i);
    while (stack.length) {
      const c = stack.pop(); px.push(c);
      for (const d of nb) {
        const n = c + d;
        if (n >= 0 && n < sk.length && sk[n] && comp[n] === -1) {
          // evita saltar de borde a borde de la imagen
          const dx = Math.abs((n % W) - (c % W));
          if (dx > 1) continue;
          comp[n] = id; stack.push(n);
        }
      }
    }
    comps.push(px);
  }

  if (!comps.length) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) t[y * W + x] = x / W;
    return { t, W, H, len: w };
  }
  comps.sort((a, b) => b.length - a.length);

  const geo = new Float32Array(W * H).fill(-1);
  let offset = 0;
  const GAP = 5;
  const seeds = [];
  comps.forEach((px, ci) => {
    // punto de arranque: extremos del esqueleto; si el mejor está muy abajo, arranca desde arriba a la izquierda
    let cminY = H, cmaxY = 0;
    for (const p of px) { const y = (p / W) | 0; if (y < cminY) cminY = y; if (y > cmaxY) cmaxY = y; }
    const score = (p) => ((p / W) | 0) + 0.45 * (p % W);
    let best = -1, bestS = Infinity, bestAny = -1, bestAnyS = Infinity;
    for (const p of px) {
      let deg = 0;
      for (const d of nb) { const n = p + d; if (n >= 0 && n < sk.length && sk[n]) deg++; }
      const s = score(p);
      if (s < bestAnyS) { bestAnyS = s; bestAny = p; }
      if (deg <= 1 && s < bestS) { bestS = s; best = p; }
    }
    let start = best;
    if (start < 0) start = bestAny;
    else if (((start / W) | 0) > cminY + 0.55 * (cmaxY - cminY) + 1) start = bestAny;

    // BFS geodésico sobre el esqueleto
    const q = [start];
    geo[start] = 0;
    let maxG = 0;
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi];
      for (const d of nb) {
        const n = c + d;
        if (n < 0 || n >= sk.length || !sk[n] || geo[n] >= 0) continue;
        if (Math.abs((n % W) - (c % W)) > 1) continue;
        const step = (d === -1 || d === 1 || d === -W || d === W) ? 1 : 1.414;
        geo[n] = geo[c] + step;
        if (geo[n] > maxG) maxG = geo[n];
        q.push(n);
      }
    }
    for (const p of px) seeds.push([p, offset + Math.max(0, geo[p])]);
    offset += maxG + GAP;
  });
  const total = Math.max(1, offset - GAP);

  // reparto por proximidad (BFS multi-fuente) sobre todo el rectángulo
  const seen = new Uint8Array(W * H);
  const queue = new Int32Array(W * H);
  let qh = 0, qt = 0;
  for (const [p, v] of seeds) { t[p] = Math.min(1, v / total); seen[p] = 1; queue[qt++] = p; }
  while (qh < qt) {
    const c = queue[qh++];
    for (const d of nb) {
      const n = c + d;
      if (n < 0 || n >= W * H || seen[n]) continue;
      if (Math.abs((n % W) - (c % W)) > 1) continue;
      seen[n] = 1; t[n] = t[c]; queue[qt++] = n;
    }
  }
  return { t, W, H, len: total };
}
