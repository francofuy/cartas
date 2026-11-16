// El "escritor": mantiene el texto, el ritmo con que se va escribiendo y dibuja la hoja.
import { layoutText, hitTest } from './layout.js';
import { drawPaper } from './paper.js';
import { getSprite, revealSprite, PAD } from './glyphs.js';
import { PAGE_W, PAGE_H } from './template.js';
import { clamp } from './util.js';
import { normalizeChar } from './chars.js';

const now = () => performance.now() / 1000;
const ease = (u) => { const s = u * u * (3 - 2 * u); return 0.45 * u + 0.55 * s; };

export class Writer {
  constructor(canvas, lib, getS) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.lib = lib;
    this.getS = getS;
    this.text = '';
    this.times = [];       // por carácter: null (ya escrito) o {t0, dur, drawn}
    this.caret = 0;
    this.page = 0;
    this.layout = null;
    this.ink = document.createElement('canvas');
    this.inkCtx = this.ink.getContext('2d');
    this.ppm = 3; this.cssW = 0; this.dpr = 1;
    this.nextT = 0;
    this.erasing = [];
    this.focused = false;
    this.blinkOn = true;
    this.raf = 0;
    this.inkDirty = true;
    this.onChange = null;   // (info) => void
    this.onStroke = null;   // (char, durSeconds) => void  (para el sonido)
    this.onErase = null;
    this.ghostText = null;  // texto de referencia que se ve tenue sobre la hoja
    this.ghostLayout = null;
    this.ghostAlpha = 0.3;
    setInterval(() => { if (this.focused) { this.blinkOn = !this.blinkOn; this.schedule(); } }, 540);
  }

  get S() { return this.getS(); }

  style() {
    const S = this.S;
    return { inst: S.instrument, color: S.color, thickness: S.thickness, pressure: S.pressure };
  }

  /* ---------- tamaño ---------- */
  resize(cssW) {
    cssW = Math.max(120, Math.round(cssW));
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    let ppm = (cssW * dpr) / PAGE_W;
    if (PAGE_H * ppm > 5600) ppm = 5600 / PAGE_H;
    this.cssW = cssW; this.dpr = dpr; this.ppm = ppm;
    const w = Math.round(PAGE_W * ppm), h = Math.round(PAGE_H * ppm);
    for (const c of [this.cv, this.ink]) { c.width = w; c.height = h; }
    this.cv.style.width = `${cssW}px`;
    this.cv.style.height = `${(cssW * PAGE_H) / PAGE_W}px`;
    this.inkDirty = true;
    this.schedule();
  }

  /* ---------- texto ---------- */
  setText(text, { instant = true } = {}) {
    this.text = text;
    this.times = new Array(text.length).fill(null);
    this.caret = text.length;
    this.erasing = [];
    this.relayout();
    this.page = this.layout.caret[this.caret].page;
    this.inkDirty = true;
    this.emit();
    this.schedule();
  }

  relayout() {
    this.lib.usedFallback.clear();
    this.layout = layoutText(this.text, this.lib, this.S);
    this.page = clamp(this.page, 0, this.layout.pages - 1);
    this.inkDirty = true;
    this.cachePageItems();
    this.ghostLayout = this.ghostText ? layoutText(this.ghostText, this.lib, this.S) : null;
  }

  // modo fantasma: la referencia se dibuja tenue en el mismo lugar donde saldrá cada letra (misma semilla = mismas formas)
  setGhost(text, alpha = this.ghostAlpha) {
    this.ghostText = text ? text.replace(/[\f\v]/g, '') : null;
    this.ghostAlpha = alpha;
    this.ghostLayout = this.ghostText ? layoutText(this.ghostText, this.lib, this.S) : null;
    this.inkDirty = true;
    this.schedule();
  }

  drawGhost(ctx) {
    const G = this.ghostLayout;
    if (!G) return;
    const typed = this.text.replace(/[\f\v]/g, '').length;
    const style = { inst: 'pencil', color: '#6d7691', thickness: 0.05, pressure: 0.45 };
    for (const it of G.items) {
      if (!it || it.page !== this.page || it.k < typed) continue;
      this.drawItem(ctx, it, this.ppm, getSprite(it.g, style), this.ghostAlpha);
    }
  }

  cachePageItems() {
    const L = this.layout;
    this.pageItems = L.items.filter((it) => it && it.page === this.page);
  }

  emit() {
    const L = this.layout;
    this.onChange?.({ pages: L.pages, page: this.page, text: this.text, missing: [...this.lib.usedFallback], faces: L.faces, sheets: L.sheets });
  }

  setPage(p) {
    p = clamp(p, 0, this.layout.pages - 1);
    if (p === this.page) return;
    this.page = p;
    this.cachePageItems();
    this.inkDirty = true;
    this.emit();
    this.schedule();
  }

  setCaret(k) {
    this.caret = clamp(k, 0, this.text.length);
    this.blinkOn = true;
    const c = this.layout.caret[this.caret];
    if (c && c.page !== this.page) this.setPage(c.page);
    this.schedule();
  }

  // Edición: se reemplazan delLen caracteres desde start por ins
  edit(start, delLen, ins, caretAfter) {
    const t = now();
    const L = this.layout;
    if (this.S.animate) {
      for (let k = start; k < start + delLen; k++) {
        const it = L.items[k];
        if (it && it.page === this.page) {
          const tm = this.times[k];
          if (!tm || t >= tm.t0 + tm.dur * 0.4) this.erasing.push({ it, t0: t, dur: 0.24 });
        }
      }
    }
    if (delLen > 0 && ins.length === 0) this.onErase?.(delLen);
    this.text = this.text.slice(0, start) + ins + this.text.slice(start + delLen);
    this.times = this.times.slice(0, start).concat(this.times.slice(start + delLen));
    this.recomputeNext(t);
    this.times = this.times.slice(0, start).concat(this.scheduleChars(ins, t), this.times.slice(start));
    this.caret = clamp(caretAfter, 0, this.text.length);
    this.relayout();
    const c = this.layout.caret[this.caret];
    if (c) { this.page = c.page; this.cachePageItems(); }
    if (this.ghostLayout) this.inkDirty = true;
    this.blinkOn = true;
    this.emit();
    this.schedule();
  }

  // Ritmo humano y parejo: escribas rápido o lento, la mano tarda lo mismo en cada letra.
  // Lo que tipeás se acumula y la tinta lo va escribiendo a su paso; solo si se juntan muchísimos
  // segundos de espera (por ejemplo al pegar una página) acelera de a poco para no tardar una eternidad.
  scheduleChars(str, t) {
    const S = this.S;
    const out = [];
    if (!S.animate) return str.split('').map(() => null);
    const spd = S.speed;
    let tcur = Math.max(t, this.nextT);
    for (const c of str) {
      const backlog = tcur - t;
      const catchUp = 1 + Math.min(2.2, Math.max(0, backlog - 25) * 0.05);
      // la velocidad de la mano varía despacio (se apura y se afloja), nunca de golpe
      this.paceN = (this.paceN || 0) + 1;
      const drift = 1 + 0.09 * Math.sin(this.paceN * 0.19) + 0.05 * Math.sin(this.paceN * 0.47 + 1.3);
      const hurry = (catchUp * spd * drift) / 1.9; // 1.9: ritmo de mano real (unas 6 letras por segundo con la velocidad en ×1,0)
      const r = Math.random();
      if (c === ' ' || c === '\n' || c === '\t' || c === '\f' || c === '\v') {
        out.push({ t0: tcur, dur: 0, drawn: true, ws: true });
        // entre palabras la mano se despega un instante; al cambiar de renglón o de hoja, un poco más
        tcur += (c === '\f' || c === '\v' ? 0.5 : c === '\n' ? 0.38 : 0.07 + 0.09 * r) / hurry;
        continue;
      }
      const vs = this.lib.variants(normalizeChar(c));
      const g = vs[0];
      const len = ((g.w + g.h) / g.pxmm) * S.size;
      const dur = clamp((0.07 + len / 210) * (0.85 + 0.35 * r), 0.085, 0.45) / hurry;
      out.push({ t0: tcur, dur, drawn: false });
      tcur += dur * 0.55 + (0.03 + 0.05 * Math.random()) / hurry;
      if (/[.!?]/.test(c)) tcur += 0.22 / hurry;
      else if (/[,;:]/.test(c)) tcur += 0.11 / hurry;
    }
    this.nextT = tcur;
    return out;
  }

  // después de borrar texto que todavía no se había escrito, la fila de espera se acorta
  recomputeNext(t) {
    let last = t;
    for (const tm of this.times) if (tm) last = Math.max(last, tm.t0 + tm.dur * 0.55 + 0.04);
    this.nextT = last;
  }

  // instante en que todo lo escrito termina de dibujarse
  settle() {
    for (const tm of this.times) if (tm) { tm.t0 = -1; tm.dur = 0.0001; }
    this.erasing = [];
    this.inkDirty = true;
    this.schedule();
  }

  hit(clientX, clientY) {
    const r = this.cv.getBoundingClientRect();
    const mmX = ((clientX - r.left) / r.width) * PAGE_W;
    const mmY = ((clientY - r.top) / r.height) * PAGE_H;
    return hitTest(this.layout, this.page, mmX, mmY);
  }

  caretClientY() {
    const c = this.layout.caret[this.caret];
    if (!c) return null;
    const r = this.cv.getBoundingClientRect();
    return r.top + (c.y / PAGE_H) * r.height;
  }

  /* ---------- dibujo ---------- */
  drawItem(ctx, it, ppm, sprite, alphaMul = 1) {
    const sp = sprite || getSprite(it.g, this.style());
    const s = it.mm * ppm;
    ctx.save();
    ctx.translate(it.x * ppm, it.y * ppm);
    ctx.rotate(it.rot);
    ctx.scale(s, s);
    ctx.globalAlpha = clamp(it.alpha * alphaMul, 0, 1);
    ctx.drawImage(sp, -PAD - it.g.w / 2, -PAD - it.g.base);
    ctx.restore();
  }

  rebuildInk() {
    const t = now();
    const ctx = this.inkCtx;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    drawPaper(ctx, this.ppm, this.S.paper);
    this.drawGhost(ctx);
    for (const tm of this.times) if (tm) tm.drawn = tm.ws ? true : false;
    for (const it of this.pageItems) {
      const tm = this.times[it.k];
      if (!tm || t >= tm.t0 + tm.dur) { this.drawItem(ctx, it, this.ppm); if (tm) tm.drawn = true; }
    }
    this.inkDirty = false;
  }

  schedule() {
    if (!this.raf) this.raf = requestAnimationFrame(() => this.frame());
  }

  frame() {
    this.raf = 0;
    if (!this.layout) return;
    if (this.inkDirty) this.rebuildInk();
    const t = now();
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    let busy = false;
    const anim = [];
    let firstPending = Infinity;
    for (let k = 0; k < this.times.length; k++) {
      const tm = this.times[k];
      if (tm && !tm.ws && t < tm.t0 && k < firstPending) firstPending = k;
      if (tm && tm.ws && t < tm.t0 && k < firstPending) firstPending = k;
    }
    for (const it of this.pageItems) {
      const tm = this.times[it.k];
      if (!tm) continue;
      if (t >= tm.t0 + tm.dur) {
        if (!tm.drawn) { this.drawItem(this.inkCtx, it, this.ppm); tm.drawn = true; }
      } else {
        busy = true;
        if (t >= tm.t0) anim.push([it, tm]);
      }
    }
    // pendientes en otras hojas o espacios que aún no "llegaron"
    if (!busy && firstPending !== Infinity) busy = true;

    ctx.drawImage(this.ink, 0, 0);
    for (const [it, tm] of anim) {
      const p = clamp((t - tm.t0) / tm.dur, 0, 1);
      const sp = getSprite(it.g, this.style());
      const part = revealSprite(it.g, sp, ease(p) * 1.08);
      this.drawItem(ctx, it, this.ppm, part);
      if (!tm.started) { tm.started = true; this.onStroke?.(it.g.char, tm.dur); }
    }
    if (this.erasing.length) {
      this.erasing = this.erasing.filter((e) => t - e.t0 < e.dur);
      for (const e of this.erasing) this.drawItem(ctx, e.it, this.ppm, null, 1 - (t - e.t0) / e.dur);
      if (this.erasing.length) busy = true;
    }
    // cursor: nunca va más adelante de la tinta
    if (this.focused && this.blinkOn) {
      const ci = Math.min(this.caret, firstPending);
      const c = this.layout.caret[ci] || this.layout.caret[this.layout.caret.length - 1];
      if (c && c.page === this.page) {
        ctx.fillStyle = this.S.color;
        ctx.globalAlpha = 0.7;
        const ppm = this.ppm;
        ctx.fillRect(c.x * ppm - 0.18 * ppm, (c.y - 5.8) * ppm, 0.36 * ppm, 7.2 * ppm);
        ctx.globalAlpha = 1;
      }
    }
    if (busy) this.schedule();
  }

  /* ---------- salida a alta resolución (impresión) ---------- */
  renderPageTo(canvas, pageIdx, ppm) {
    canvas.width = Math.round(PAGE_W * ppm);
    canvas.height = Math.round(PAGE_H * ppm);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    drawPaper(ctx, ppm, this.S.paper);
    for (const it of this.layout.items) if (it && it.page === pageIdx) this.drawItem(ctx, it, ppm);
  }
}
