// Impresión: se dibujan las hojas a 300 ppp y se mandan al diálogo de impresión del navegador.
import { templatePageEl } from './template.js';

const PRINT_PPM = 300 / 25.4;

function root() {
  let r = document.getElementById('print-root');
  if (!r) { r = document.createElement('div'); r.id = 'print-root'; document.body.append(r); }
  r.innerHTML = '';
  return r;
}

function doPrint(r) {
  return new Promise((resolve) => {
    const done = () => { window.removeEventListener('afterprint', done); r.innerHTML = ''; resolve(); };
    window.addEventListener('afterprint', done);
    // pequeña espera para que el navegador pinte las imágenes antes de abrir el diálogo
    setTimeout(() => window.print(), 250);
  });
}

export async function printTemplates(pages) {
  const r = root();
  for (const p of pages) r.append(templatePageEl(p));
  await doPrint(r);
}

export async function printLetter(writer, pageIdxs) {
  const r = root();
  const urls = [];
  for (const p of pageIdxs) {
    const c = document.createElement('canvas');
    writer.renderPageTo(c, p, PRINT_PPM);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.95));
    const url = URL.createObjectURL(blob);
    urls.push(url);
    const img = new Image();
    img.className = 'print-sheet';
    img.src = url;
    await img.decode().catch(() => {});
    r.append(img);
  }
  await doPrint(r);
  urls.forEach((u) => URL.revokeObjectURL(u));
}
