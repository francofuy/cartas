// Ventana de impresión (la usan la carta del editor y las cartas cerradas del buzón).
// Una «fuente» describe lo que se imprime: { sheets, pages, render(idx) -> Blob, note?, onPrinted?(res) }.
import { $, $$ } from './util.js';
import { printFaces } from './print.js';

const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

// trabajos de impresión según el modo (cada trabajo = lista de caras; null = hoja en blanco)
export function printJobs(sheets, pages, mode, only) {
  const sh = only ? sheets.filter((_, i) => only.has(i)) : sheets;
  const hasBack = sh.some((x) => x.back != null);
  if (!hasBack || mode === 'single') return [sh.flatMap((x) => (x.back != null ? [x.front, x.back] : [x.front]))];
  if (mode === 'manual') return [sh.map((x) => x.front), sh.slice().reverse().map((x) => (x.back != null ? x.back : null))];
  // automática: frente y dorso en pares; una hoja sin dorso lleva el dorso en blanco si después viene otra con dorso
  let lastBack = -1; sh.forEach((x, i) => { if (x.back != null) lastBack = i; });
  return [sh.flatMap((x, i) => (x.back != null ? [x.front, x.back] : i < lastBack ? [x.front, null] : [x.front]))];
}

// h = { S(), saveSettings(), toast, busy, unbusy }
export function createPrintFlow(h) {
  const dlg = $('#printdlg');
  let src = null, step = 1, only = null;

  const view = () => {
    const sheets = only ? src.sheets.filter((_, i) => only.has(i)) : src.sheets;
    return { sheets, nS: sheets.length, nB: sheets.filter((x) => x.back != null).length, faces: sheets.reduce((a, x) => a + (x.back != null ? 2 : 1), 0) };
  };
  const refresh = () => {
    const { nS, nB, faces } = view(), hasBack = nB > 0, S = h.S();
    $('#print-modes').hidden = !hasBack || step === 2;
    $$('input[name="pmode"]').forEach((r) => { r.checked = r.value === S.printMode; });
    const go = $('#print-go'), tip = $('#print-tip'), info = $('#print-info');
    const real = 'En el cuadro de impresión elegí tamaño real (100 %), sin márgenes ni encabezados.';
    const once = src.note ? `${src.note} ` : '';
    if (!hasBack) {
      info.textContent = `${once}Se va a imprimir ${plural(nS, `hoja ${src.fmt || 'A4'}`, `hojas ${src.fmt || 'A4'}`)}, una cara cada una. ${real}`;
      tip.textContent = ''; go.textContent = src.goLabel || 'Imprimir carta';
      return;
    }
    info.textContent = `${once}${only ? 'Se reimprimen' : 'Tu carta tiene'} ${plural(nS, `hoja ${src.fmt || 'A4'}`, `hojas ${src.fmt || 'A4'}`)}, ${nB === nS ? 'todas con dorso' : `${nB} con dorso y ${nS - nB} sin dorso`}. ${real}`;
    if (S.printMode === 'duplex') {
      tip.textContent = 'En el cuadro de impresión activá «Imprimir en ambas caras» y elegí «Voltear por el borde largo». Las hojas sin dorso salen con el dorso en blanco. El navegador no puede saber si tu impresora lo permite: si no aparece esa opción, volvé y elegí «Una cara por hoja».';
      go.textContent = src.goLabel || 'Imprimir carta';
    } else if (S.printMode === 'single') {
      tip.textContent = `Cada cara sale en su propia hoja: ${plural(faces, 'hoja', 'hojas')} en total.`;
      go.textContent = src.goLabel || 'Imprimir carta';
    } else if (step === 1) {
      tip.textContent = `Paso 1 de 2: se imprimen los frentes (${plural(nS, 'hoja', 'hojas')}). Dejá la impresión en una sola cara.`;
      go.textContent = 'Imprimir los frentes';
    } else {
      info.textContent = 'Paso 2 de 2: los dorsos.';
      tip.textContent = 'Tomá la pila tal como salió, dala vuelta como la página de un cuaderno (por el borde largo) y volvé a ponerla en la bandeja. Los dorsos salen en orden inverso para que cada uno caiga detrás de su frente.';
      go.textContent = 'Imprimir los dorsos';
    }
  };

  $$('input[name="pmode"]').forEach((r) => r.addEventListener('change', () => { h.S().printMode = r.value; h.saveSettings(); step = 1; if (src) refresh(); }));
  $('#print-go').addEventListener('click', async (e) => {
    e.preventDefault();
    if (!src) return;
    dlg.close();
    if (step === 1) await src.onStart?.(); // p. ej. marcar la carta cerrada como «imprimiendo»
    const jobs = printJobs(src.sheets, src.pages, h.S().printMode, only);
    const job = jobs[Math.min(step, jobs.length) - 1];
    h.busy('Preparando las hojas para imprimir…');
    let res = 'ok';
    try { res = await printFaces(src.render, job, src.fmt); } catch (err) { console.error(err); h.toast('No pude preparar la impresión.'); res = 'error'; }
    h.unbusy();
    if (res === 'blocked') h.toast('Este entorno no deja abrir la impresión. Abrí la app directamente en el navegador para imprimir.', 6500);
    if (res === 'ok' && h.S().printMode === 'manual' && jobs.length > 1 && step === 1) { step = 2; refresh(); dlg.showModal(); return; }
    step = 1;
    const s = src;
    s.onPrinted?.(res); // quien abrió la ventana decide qué hacer después (p. ej. pedir la confirmación)
  });

  return {
    // opts.only: conjunto de hojas (por posición) para reimprimir solo algunas
    open(source, opts = {}) { src = source; step = 1; only = opts.only || null; refresh(); dlg.showModal(); },
  };
}
