// Tamaño de la hoja que se está escribiendo (A4 o A5). Los módulos lo leen en vivo: al cambiar de cuaderno cambia para todos.
export const FORMATS = { A4: { w: 210, h: 297 }, A5: { w: 148, h: 210 } };
export let FMT = 'A4', PW = 210, PH = 297;
export function setFormat(f) { const k = FORMATS[f] ? f : 'A4'; FMT = k; PW = FORMATS[k].w; PH = FORMATS[k].h; }
export const dimsOf = (f) => FORMATS[FORMATS[f] ? f : 'A4'];
