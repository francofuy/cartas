// La animación de cerrar la carta: se dobla en tres, entra en un sobre, el sello de lacre la cierra y el sobre viaja al buzón.
// Se puede saltar con un toque, Esc o el botón «Saltar».

const el = (cls, html) => { const e = document.createElement('div'); e.className = cls; if (html) e.innerHTML = html; return e; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// opts: { image (dataURL de la primera cara), to (texto), target (rect del buzón), sound { fold(), seal() } }
export function playSeal(opts) {
  return new Promise((resolve) => {
    const W = Math.min(300, Math.round(window.innerWidth * 0.62)), Hh = Math.round(W * 1.414), T = Math.round(Hh / 3);
    const root = el('sealfx'); root.setAttribute('role', 'presentation');
    const stage = el('sx-stage'); stage.style.setProperty('--w', W + 'px'); stage.style.setProperty('--h', Hh + 'px'); stage.style.setProperty('--t', T + 'px');
    // la carta: tres franjas con la imagen de la hoja
    const letter = el('sx-letter');
    const strips = [0, 1, 2].map((i) => {
      const s = el('sx-strip s' + i);
      const face = el('sx-face'); face.style.backgroundImage = `url(${opts.image})`; face.style.backgroundSize = `${W}px ${Hh}px`; face.style.backgroundPosition = `0 ${-i * T}px`;
      const back = el('sx-back'); back.style.backgroundImage = `url(${opts.image})`; back.style.backgroundSize = `${W}px ${Hh}px`; back.style.backgroundPosition = `0 ${-i * T}px`;
      s.append(face, back); letter.append(s); return s;
    });
    // el sobre
    const env = el('sx-env');
    const eback = el('sx-eback'), eflap = el('sx-eflap'), efront = el('sx-efront');
    const seal = el('sx-seal', '<span>PyL</span>');
    if (opts.to) { const to = el('sx-to'); to.textContent = 'Para ' + opts.to; efront.append(to); }
    env.append(eback, letter, efront, eflap, seal);
    const skip = document.createElement('button'); skip.type = 'button'; skip.className = 'sx-skip btn'; skip.textContent = 'Saltar';
    stage.append(env); root.append(stage, skip); document.body.append(root);

    let done = false, skipped = false;
    const finish = () => { if (done) return; done = true; root.classList.add('out'); setTimeout(() => { root.remove(); resolve(); }, 260); };
    const onSkip = () => { skipped = true; finish(); };
    root.addEventListener('pointerdown', onSkip); skip.addEventListener('click', onSkip);
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onSkip(); } };
    document.addEventListener('keydown', onKey, true);
    const cleanup = () => document.removeEventListener('keydown', onKey, true);

    const anim = (node, frames, o) => node.animate(frames, { fill: 'forwards', ...o }).finished.catch(() => {});
    const ease = 'cubic-bezier(.23,1,.32,1)';
    (async () => {
      try {
        // arranca con la carta sola; el sobre todavía no se ve
        env.style.setProperty('--e', '0');
        await anim(stage, [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 320, easing: ease });
        if (skipped) return;
        opts.sound?.fold?.();
        // doblar en tres: la franja de abajo sube, después la de arriba baja
        await anim(strips[2], [{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(180deg)' }], { duration: 650, easing: 'ease-in-out' });
        if (skipped) return;
        opts.sound?.fold?.();
        await anim(strips[0], [{ transform: 'translateZ(1px) rotateX(0deg)' }, { transform: 'translateZ(1px) rotateX(-180deg)' }], { duration: 650, easing: 'ease-in-out' });
        if (skipped) return;
        // el paquete queda del tamaño de un tercio; aparece el sobre por detrás y por delante
        await Promise.all([
          anim(letter, [{ transform: 'translateY(0)' }, { transform: `translateY(${Math.round(T * 0.1)}px)` }], { duration: 300, easing: ease }),
          anim(eback, [{ opacity: 0 }, { opacity: 1 }], { duration: 300 }), anim(efront, [{ opacity: 0 }, { opacity: 1 }], { duration: 300 }), anim(eflap, [{ opacity: 0 }, { opacity: 1 }], { duration: 300 }),
        ]);
        if (skipped) return;
        // entra en el sobre
        await anim(letter, [{ transform: `translateY(${Math.round(T * 0.1)}px)` }, { transform: `translateY(${Math.round(T * 0.62)}px)` }], { duration: 700, easing: 'ease-in-out' });
        if (skipped) return;
        // el sobre se acomoda en el centro
        await anim(stage, [{ transform: 'scale(1) translateY(0)' }, { transform: `scale(1) translateY(${-Math.round(T * 0.72)}px)` }], { duration: 380, easing: ease });
        if (skipped) return;
        // se cierra la solapa y cae el sello
        await anim(eflap, [{ transform: 'rotateX(180deg)' }, { transform: 'rotateX(0deg)' }], { duration: 600, easing: 'ease-in-out' });
        if (skipped) return;
        opts.sound?.seal?.();
        await anim(seal, [{ opacity: 0, transform: 'translate(-50%, -50%) scale(2.2)' }, { opacity: 1, transform: 'translate(-50%, -50%) scale(.92)', offset: .7 }, { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' }], { duration: 420, easing: 'cubic-bezier(.34,1.56,.64,1)' });
        await wait(450);
        if (skipped) return;
        // viaja al buzón
        const r = opts.target, b = env.getBoundingClientRect();
        if (r) {
          const dx = r.left + r.width / 2 - (b.left + b.width / 2), dy = r.top + r.height / 2 - (b.top + b.height / 2);
          await anim(env, [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(.18)`, opacity: .2 }], { duration: 720, easing: 'cubic-bezier(.5,0,.2,1)' });
        }
      } finally { cleanup(); finish(); }
    })();
  });
}
