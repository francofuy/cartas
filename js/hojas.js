// Pasar las hojas del cuaderno con sentido: el espiral queda quieto y la hoja gira alrededor de él.
//
// El cuaderno abierto tiene dos páginas, una a cada lado del espiral. La hoja de la derecha es el frente de una hoja; la de la izquierda, el dorso de la anterior.
//   frente → dorso (dar vuelta):       la hoja se levanta, cruza por encima del espiral y cae a la izquierda; la cámara se corre para quedar en esa página.
//   dorso → frente de la que sigue:    es la página de al lado del mismo cuaderno abierto: la cámara se desliza hacia la derecha, sin girar nada.
//   frente → frente (hoja nueva):      la hoja cruza el espiral y queda a la izquierda (se ve su dorso); abajo ya estaba la que sigue, en el mismo lugar. La cámara no se mueve.
// Y lo mismo al revés para volver.
// Además, del lado contrario al espiral asoma un pedazo de la página vecina, para que se vea el cuaderno abierto.
import { $ } from './util.js';
import { PW, PH } from './format.js';
import { drawPaper } from './paper.js';

const el = (c) => { const e = document.createElement('div'); e.className = c; return e; };

// h = { writer(), S(), animOn(), sound, isMobile() }
export function createTurner(h) {
  const wrap = () => $('.sheet-wrap');
  const cssW = () => h.writer().cssW;
  const ppmFor = () => Math.max(1, cssW() / PW) * Math.min(window.devicePixelRatio || 1, 1.5);
  const blankImg = () => { const c = document.createElement('canvas'), p = ppmFor(); c.width = Math.round(PW * p); c.height = Math.round(PH * p); drawPaper(c.getContext('2d'), p, h.S().paper); return c.toDataURL('image/jpeg', 0.8); };
  const faceImg = (idx) => { const c = document.createElement('canvas'); h.writer().renderPageTo(c, idx, ppmFor()); return c.toDataURL('image/jpeg', 0.82); };
  // la imagen de una cara: la de verdad si existe; si no (todavía no se escribió o es una hoja nueva), papel en blanco
  const sideImg = (sheet, side, blank) => { const L = h.writer().layout, idx = sheet >= 0 ? L.sheets[sheet]?.[side] : null; return idx != null ? faceImg(idx) : blank; };

  /* ---------- la página vecina, asomando del otro lado del espiral ---------- */
  // La imagen nueva se precarga y se cambia recién cuando está lista (y solo si cambió): así la tira del costado no parpadea.
  let nbrT = 0, nbrBusy = 0, lastUrl = '', lastKey = '';
  async function renderNeighbor() {
    const w = wrap(), wr = h.writer(); if (!w || !wr.layout) return;
    const my = ++nbrBusy;
    let n = $('.nbr', w); if (!n) { n = el('nbr'); n.setAttribute('aria-hidden', 'true'); n.hidden = true; w.append(n); }
    const sc = $('#scroller'), room = (sc.clientWidth - cssW()) / 2 - 8, strip = Math.min(cssW() * 0.3, room);
    if (h.isMobile() || strip < 36) { n.hidden = true; return; }
    const L = wr.layout, f = L.faces[wr.page], back = f.side === 'back', blank = blankImg();
    const img = back ? sideImg(f.sheet + 1, 'front', blank) : (f.sheet > 0 ? sideImg(f.sheet - 1, 'back', blank) : null);
    const key = `${back ? 'r' : 'l'}|${strip}|${cssW()}|${img ? img.length : 0}`;
    if (img && (img !== lastUrl || key !== lastKey)) { try { const im = new Image(); im.src = img; await im.decode(); } catch { /* sigue igual */ } }
    if (my !== nbrBusy) return; // llegó un pedido más nuevo
    n.style.transition = 'none';
    n.hidden = false; n.dataset.side = back ? 'right' : 'left'; n.style.width = strip + 'px';
    if (img !== lastUrl || n.style.backgroundImage === '') n.style.backgroundImage = img ? `url(${img})` : 'none';
    n.style.backgroundSize = `${cssW()}px 100%`; n.style.backgroundPosition = back ? 'left top' : 'right top';
    n.classList.toggle('cover', !img); lastUrl = img || ''; lastKey = key;
  }
  function updateNeighbor() { clearTimeout(nbrT); nbrT = setTimeout(() => { if (!running) renderNeighbor(); }, 260); }

  /* ---------- el giro ---------- */
  const EZ = 'cubic-bezier(.4,.05,.25,1)';
  let running = false;
  // src / dst: { sheet, side }. change(): hace el cambio de verdad (cambia de cara o crea la hoja)
  async function turn(src, dst, change) {
    const w = wrap(), wr = h.writer();
    if (running) { change(); return; }
    const kind = classify(src, dst);
    if (!h.animOn() || !w.animate || !kind || !wr.layout) { change(); return; }
    running = true;
    try {
      const W = cssW(), Hh = (W * PH) / PW, L = wr.layout, blank = blankImg();
      const img = (s, side) => sideImg(s, side, blank);
      const s = src.sheet, t = dst.sheet;
      const sheetsAfter = L.sheets;
      void sheetsAfter;
      const fx = el('fx'); fx.style.cssText = `width:${W}px;height:${Hh}px;`;
      const page = (x, src2, z, dim) => { const p = el('fxp'); p.style.cssText = `left:${x}px;width:${W}px;height:${Hh}px;transform:translateZ(${z}px);${src2 ? `background-image:url(${src2});` : ''}`; if (dim) p.style.filter = 'brightness(.86)'; p.append(el('fxs')); fx.append(p); return p; };
      const rings = (x) => { const r = el('bind'); r.style.cssText = `left:${x}px;right:auto;transform:translateZ(8px);`; const real = $('.bind', w); if (real) r.innerHTML = real.innerHTML; fx.append(r); };
      const leaf = (front, back, z) => { const l = el('fxl'); l.style.cssText = `width:${W}px;height:${Hh}px;transform:translateZ(${z}px);`; const a = el('fxf'), b = el('fxb'); a.style.backgroundImage = `url(${front})`; b.style.backgroundImage = `url(${back})`; a.append(el('fxs')); b.append(el('fxs')); l.append(a, b); fx.append(l); return l; };
      let pan = [0, 0], spin = null, ringX = 0, leafEl = null, under = null;
      if (kind === 'A') { // frente → dorso de la misma hoja
        page(-W, img(s - 1, 'back'), -2, true); under = page(0, img(s + 1, 'front'), -1); leafEl = leaf(img(s, 'front'), img(s, 'back'), 1); pan = [0, W]; spin = [0, -180]; ringX = 0;
      } else if (kind === 'A-') { // dorso → frente de la misma hoja
        page(-W, img(s - 1, 'back'), -2, true); under = page(0, img(s + 1, 'front'), -1); leafEl = leaf(img(s, 'front'), img(s, 'back'), 1); pan = [W, 0]; spin = [-180, 0]; ringX = 0;
      } else if (kind === 'B') { // dorso → frente de la hoja que sigue (se desliza)
        page(0, img(s, 'back'), -1); page(W, img(s + 1, 'front'), -1); pan = [0, -W]; ringX = W;
      } else if (kind === 'B-') { // frente → dorso de la hoja anterior (se desliza)
        page(-W, img(t, 'back'), -1); page(0, img(s, 'front'), -1); pan = [0, W]; ringX = 0;
      } else if (kind === 'C') { // frente → frente de la que sigue: la hoja cruza el espiral
        page(-W, img(s - 1, 'back'), -2, true); under = page(0, img(t, 'front'), -1); leafEl = leaf(img(s, 'front'), img(s, 'back'), 1); spin = [0, -180]; ringX = 0;
      } else { // 'C-': vuelve la hoja anterior sobre la actual
        page(-W, img(t - 1, 'back'), -2, true); page(0, img(s, 'front'), -1); leafEl = leaf(img(t, 'front'), img(t, 'back'), 1); spin = [-180, 0]; ringX = 0;
      }
      rings(ringX);
      // se esconde lo de verdad y se arma el giro encima
      const sheet = $('#sheet'), bind = $('.bind', w), nbr = $('.nbr', w);
      w.style.perspective = '2600px'; w.style.perspectiveOrigin = '50% 35%'; w.append(fx);
      sheet.style.visibility = 'hidden'; if (bind) bind.style.opacity = 0; if (nbr) nbr.style.opacity = 0;
      h.sound?.fold?.();
      const dur = leafEl ? 820 : 560, anims = [];
      anims.push(fx.animate([{ transform: `translateX(${pan[0]}px)` }, { transform: `translateX(${pan[1]}px)` }], { duration: pan[0] === pan[1] ? 1 : dur, easing: EZ, fill: 'both', delay: leafEl && pan[0] !== pan[1] ? 60 : 0 }));
      if (leafEl) {
        const [a0, a1] = spin, mid = (a0 + a1) / 2, dir = a1 < a0 ? -1 : 1;
        anims.push(leafEl.animate([{ transform: `translateZ(1px) rotateY(${a0}deg)` }, { transform: `translateZ(14px) rotateY(${mid}deg) skewY(${dir * 1.6}deg)`, offset: 0.5 }, { transform: `translateZ(1px) rotateY(${a1}deg)` }], { duration: dur, easing: EZ, fill: 'both' }));
        leafEl.querySelectorAll('.fxs').forEach((e) => anims.push(e.animate([{ opacity: 0 }, { opacity: 0.55, offset: 0.5 }, { opacity: 0 }], { duration: dur, easing: 'ease-in-out', fill: 'both' })));
      }
      // la sombra de la hoja que se levanta sobre la de abajo
      if (under) { const sh = el('fxsh'); under.append(sh); anims.push(sh.animate([{ opacity: 0 }, { opacity: 0.5, offset: 0.45 }, { opacity: 0 }], { duration: dur, easing: 'ease-in-out', fill: 'both' })); }
      await Promise.all(anims.map((a) => a.finished.catch(() => {})));
      change();
      // el giro queda tapando hasta que la hoja de verdad esté dibujada y la tira de la vecina ya sea la nueva (así nada parpadea)
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      for (let i = 0; i < 8 && wr.raf; i++) await new Promise((r) => requestAnimationFrame(r));
      await renderNeighbor();
      sheet.style.visibility = ''; if (bind) bind.style.opacity = ''; if (nbr) nbr.style.opacity = ''; const nn = $('.nbr', w); if (nn) nn.style.opacity = '';
      await new Promise((r) => requestAnimationFrame(r));
      fx.remove(); w.style.perspective = ''; w.style.perspectiveOrigin = '';
    } catch (e) {
      console.warn('Giro de hoja', e); const w2 = wrap(); w2?.querySelector('.fx')?.remove(); const sh = $('#sheet'); if (sh) sh.style.visibility = ''; const b = w2 && $('.bind', w2); if (b) b.style.opacity = ''; change();
    } finally { running = false; }
  }
  function classify(a, b) {
    if (!a || !b) return null;
    if (a.sheet === b.sheet) return a.side === 'front' && b.side === 'back' ? 'A' : a.side === 'back' && b.side === 'front' ? 'A-' : null;
    if (b.sheet === a.sheet + 1) return a.side === 'back' && b.side === 'front' ? 'B' : a.side === 'front' && b.side === 'front' ? 'C' : null;
    if (b.sheet === a.sheet - 1) return a.side === 'front' && b.side === 'back' ? 'B-' : a.side === 'front' && b.side === 'front' ? 'C-' : null;
    return null;
  }
  return { turn, updateNeighbor, isTurning: () => running };
}
