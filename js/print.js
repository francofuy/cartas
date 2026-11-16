// Impresión: se dibujan las hojas a 300 ppp y se mandan al diálogo de impresión del navegador.
import { templatePageEl } from './template.js';
import { dimsOf } from './format.js';

const PRINT_PPM = 300 / 25.4;

function root() {
  let r = document.getElementById('print-root');
  if (!r) { r = document.createElement('div'); r.id = 'print-root'; document.body.append(r); }
  r.innerHTML = '';
  return r;
}

// Devuelve 'ok' o 'blocked' (si el entorno no deja abrir el diálogo de impresión)
function doPrint(r) {
  return new Promise((resolve) => {
    let started = false;
    const onBefore = () => { started = true; };
    const done = (result) => {
      window.removeEventListener('beforeprint', onBefore);
      window.removeEventListener('afterprint', onAfter);
      r.innerHTML = '';
      resolve(result);
    };
    const onAfter = () => done('ok');
    window.addEventListener('beforeprint', onBefore);
    window.addEventListener('afterprint', onAfter);
    // pequeña espera para que el navegador pinte las imágenes antes de abrir el diálogo
    setTimeout(() => {
      try { window.print(); } catch (e) { /* bloqueado */ }
      setTimeout(() => { if (!started) done('blocked'); }, 500);
      setTimeout(() => done('ok'), 180000); // respaldo por si afterprint nunca llega
    }, 250);
  });
}

export async function printTemplates(pages) {
  const r = root();
  for (const p of pages) r.append(templatePageEl(p));
  return doPrint(r);
}

// render(idx) devuelve un Blob JPEG de la cara; null en la lista = hoja en blanco
export async function printFaces(render, idxs, fmt = 'A4') {
  const r = root();
  // el papel de la impresora tiene que ser del tamaño de la hoja (A4 o A5)
  const d = dimsOf(fmt); let st = document.getElementById('pp-style');
  if (!st) { st = document.createElement('style'); st.id = 'pp-style'; document.head.append(st); }
  st.textContent = `@page { size: ${d.w}mm ${d.h}mm; margin: 0; } @media print { .print-sheet { width: ${d.w}mm !important; height: ${d.h}mm !important; } }`;
  const urls = [];
  for (const p of idxs) {
    if (p == null) { // hoja en blanco: mantiene el orden cuando una hoja no tiene dorso
      const blank = document.createElement('div');
      blank.className = 'print-sheet';
      r.append(blank);
      continue;
    }
    const blob = await render(p);
    const url = URL.createObjectURL(blob);
    urls.push(url);
    const img = new Image();
    img.className = 'print-sheet';
    img.src = url;
    await img.decode().catch(() => {});
    r.append(img);
  }
  const res = await doPrint(r);
  urls.forEach((u) => URL.revokeObjectURL(u));
  return res;
}

export const PRINT_DPI_PPM = PRINT_PPM;
