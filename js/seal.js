// La animación de cerrar la carta: la hoja se dobla en tres (con curva y sombra), se vuelve un sobre chico con un puntito de lacre y entra al botón «Cerradas».
// Se puede saltar con un toque, Esc o el botón «Saltar».

const el = (cls, parent) => { const e = document.createElement('div'); e.className = cls; if (parent) parent.append(e); return e; };

// opts: { image (dataURL de la primera cara), style { paper, wax }, target (rect del botón de destino), sound { fold(), seal() }, speed (1 = normal; por defecto va lento, 2.4) }
export function playSeal(opts) {
  return new Promise((resolve) => {
    const K = opts.speed || 2.4;
    const W = Math.min(300, Math.round(window.innerWidth * 0.62)), Hh = Math.round(W * 1.414), T = Math.round(Hh / 3), lz = Math.round(W * 0.11);
    const root = el('sealfx'); root.setAttribute('role', 'presentation');
    const stage = el('sx-stage', root); stage.style.setProperty('--w', W + 'px'); stage.style.setProperty('--h', Hh + 'px'); stage.style.setProperty('--t', T + 'px');
    if (opts.style) { stage.style.setProperty('--ep', opts.style.paper); stage.style.setProperty('--wax', opts.style.wax); }
    const letter = el('sx-letter', stage);
    // un pedazo de franja: la cara con la imagen de la hoja y el dorso en blanco
    const seg = (parent, i, y, h, origin) => {
      const s = el('sx-seg', parent); s.style.top = y + 'px'; s.style.height = h + 'px'; if (origin) s.style.transformOrigin = origin;
      const f = el('sx-face', s); f.style.backgroundImage = `url(${opts.image})`; f.style.backgroundSize = `${W}px ${Hh}px`; f.style.backgroundPosition = `0 ${-(i * T + y)}px`; el('sx-shade', f);
      el('sx-back', s); return s;
    };
    const s0 = el('sx-strip s0', letter), s1 = el('sx-strip s1', letter), s2 = el('sx-strip s2', letter);
    seg(s1, 1, 0, T);
    seg(s2, 2, 0, T / 2); const o2 = seg(s2, 2, T / 2, T / 2, '50% 0');      // la mitad de afuera se curva, queda atrás al levantarse
    seg(s0, 0, T / 2, T / 2); const o0 = seg(s0, 0, 0, T / 2, '50% 100%');
    const shadow = el('sx-shadow', stage);
    // el sobre chico con el lacre: el paquete se vuelve esto
    const icon = el('sx-icon', stage);
    icon.innerHTML = '<svg viewBox="0 0 60 44" aria-hidden="true"><rect x="1" y="1" width="58" height="42" rx="5" class="ie"/><path d="M2 3 L30 26 L58 3" class="il"/><circle cx="30" cy="26" r="6.5" class="iw"/></svg>';
    icon.style.width = Math.round(W * 0.3) + 'px';
    const skip = document.createElement('button'); skip.type = 'button'; skip.className = 'sx-skip btn'; skip.textContent = 'Saltar';
    root.append(skip); document.body.append(root);

    let done = false, skipped = false;
    const finish = () => { if (done) return; done = true; root.classList.add('out'); setTimeout(() => { root.remove(); resolve(); }, 260); };
    const onSkip = () => { skipped = true; finish(); };
    root.addEventListener('pointerdown', onSkip); skip.addEventListener('click', onSkip);
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onSkip(); } };
    document.addEventListener('keydown', onKey, true);
    const cleanup = () => document.removeEventListener('keydown', onKey, true);

    const anim = (node, frames, o = {}) => node.animate(frames, { fill: 'forwards', easing: 'cubic-bezier(.4,.05,.2,1)', ...o, duration: (o.duration || 400) * K, delay: (o.delay || 0) * K }).finished.catch(() => {});
    const wait = (ms) => new Promise((r) => setTimeout(r, ms * K));
    const tf = (x = 0, y = 0, s = 1, r = 0) => `translate(${x}px, ${y}px) rotate(${r}deg) scale(${s})`;
    (async () => {
      try {
        await anim(stage, [{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
        if (skipped) return;
        await wait(140); if (skipped) return;
        // doblar en tres: la franja de abajo sube y después la de arriba baja; cada una se levanta, se curva y oscurece cerca del pliegue
        const dur = 780;
        opts.sound?.fold?.();
        anim(o2, [{ transform: 'rotateX(0)' }, { transform: 'rotateX(-34deg)', offset: .35 }, { transform: 'rotateX(-14deg)', offset: .72 }, { transform: 'rotateX(0)' }], { duration: dur, easing: 'ease-in-out' });
        s2.querySelectorAll('.sx-shade').forEach((s) => anim(s, [{ opacity: 0 }, { opacity: .6 }, { opacity: 0 }], { duration: dur }));
        await anim(s2, [{ transform: 'rotateX(0deg)' }, { transform: `translateZ(${lz}px) rotateX(90deg)`, offset: .5 }, { transform: 'rotateX(180deg)' }], { duration: dur, easing: 'ease-in-out' });
        if (skipped) return;
        opts.sound?.fold?.();
        anim(o0, [{ transform: 'rotateX(0)' }, { transform: 'rotateX(34deg)', offset: .35 }, { transform: 'rotateX(14deg)', offset: .72 }, { transform: 'rotateX(0)' }], { duration: dur, easing: 'ease-in-out' });
        s0.querySelectorAll('.sx-shade').forEach((s) => anim(s, [{ opacity: 0 }, { opacity: .6 }, { opacity: 0 }], { duration: dur }));
        await anim(s0, [{ transform: 'translateZ(1px) rotateX(0deg)' }, { transform: `translateZ(${lz + 1}px) rotateX(-90deg)`, offset: .5 }, { transform: 'translateZ(1px) rotateX(-180deg)' }], { duration: dur, easing: 'ease-in-out' });
        if (skipped) return;
        await anim(letter, [{ transform: 'scale(1)' }, { transform: 'scale(.985, .97)', offset: .5 }, { transform: 'scale(1)' }], { duration: 220 });
        await wait(120); if (skipped) return;
        // el paquete encoge y se vuelve el sobre del botón, con su puntito de lacre
        opts.sound?.seal?.();
        anim(shadow, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
        anim(letter, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.3)', opacity: 1, offset: .75 }, { transform: 'scale(.3)', opacity: 0 }], { duration: 480, easing: 'cubic-bezier(.4,0,.2,1)' });
        await anim(icon, [{ opacity: 0, transform: 'translate(-50%, -50%) scale(.6)' }, { opacity: 1, transform: 'translate(-50%, -50%) scale(1.1)', offset: .6 }, { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' }], { duration: 480, delay: 160 });
        if (skipped) return;
        await wait(200); if (skipped) return;
        // viaja en arco hacia «Cerradas»
        const r = opts.target, b = icon.getBoundingClientRect();
        if (r) {
          const dx = r.left + r.width / 2 - (b.left + b.width / 2), dy = r.top + r.height / 2 - (b.top + b.height / 2);
          const c = 'translate(-50%, -50%) ';
          await anim(icon, [{ transform: c + tf(0, 0, 1, 0), opacity: 1 }, { transform: c + tf(dx * .2, dy * .2 - 24, 1, -5), opacity: 1, offset: .3 }, { transform: c + tf(dx, dy, .36, 6), opacity: 0 }], { duration: 560, easing: 'cubic-bezier(.5,0,.25,1)' });
        }
      } finally { cleanup(); finish(); }
    })();
  });
}
