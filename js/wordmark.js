// El nombre de la app, escrito con tu propia letra (o la de ejemplo). Se "escribe" una sola vez por sesión.
import { getSprite, revealSprite, PAD } from './glyphs.js';
import { clamp } from './util.js';

const TEXT = 'Puño y Letra';
const CAP_H = 21;      // altura de las mayúsculas en px CSS
const BOX_H = 32;
let run = 0;

function rgbToHex(rgb) {
  const m = rgb.match(/\d+(\.\d+)?/g);
  if (!m) return '#1d2f8f';
  return '#' + m.slice(0, 3).map((v) => Math.round(+v).toString(16).padStart(2, '0')).join('');
}

function build(canvas, lib) {
  const color = rgbToHex(getComputedStyle(canvas).color);
  const style = { inst: 'ballpoint', color, thickness: 0.15, pressure: 0.65 };
  const chars = [...TEXT];
  const first = lib.variants('P')[0];
  const f = clamp(CAP_H / first.h, 0.12, 0.7); // px CSS por px de letra
  const items = [];
  let x = 2;
  chars.forEach((c, i) => {
    if (c === ' ') { x += 7; return; }
    const vs = lib.variants(c);
    const g = vs[(i * 5 + 1) % vs.length];
    items.push({ g, x, i, sprite: getSprite(g, style) });
    x += g.w * f + 1.8;
  });
  return { items, f, width: Math.ceil(x + 2), style };
}

function paint(ctx, plan, dpr, base, progressOf) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const s = plan.f * dpr;
  for (const it of plan.items) {
    const p = progressOf(it);
    if (p <= 0) continue;
    const sp = p >= 1 ? it.sprite : revealSprite(it.g, it.sprite, p * 1.08);
    ctx.drawImage(sp, (it.x - PAD * plan.f) * dpr, (base - (it.g.base + PAD) * plan.f) * dpr, sp.width * s, sp.height * s);
  }
}

export function drawWordmark(canvas, lib, { animate = false } = {}) {
  const id = ++run;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  let plan;
  try { plan = build(canvas, lib); } catch (e) { return; }
  canvas.style.width = plan.width + 'px';
  canvas.style.height = BOX_H + 'px';
  canvas.width = Math.round(plan.width * dpr);
  canvas.height = Math.round(BOX_H * dpr);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  const base = BOX_H * 0.74;
  if (!animate) { paint(ctx, plan, dpr, base, () => 1); return; }
  const t0 = performance.now();
  const STEP = 0.075, DUR = 0.22;
  const frame = () => {
    if (id !== run) return;
    const t = (performance.now() - t0) / 1000;
    let done = true;
    paint(ctx, plan, dpr, base, (it) => {
      const p = clamp((t - it.i * STEP) / DUR, 0, 1);
      if (p < 1) done = false;
      return p;
    });
    if (!done) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
