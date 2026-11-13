// Juego de caracteres que cubre la plantilla (105 = 7 páginas x 15 filas)
const lower = 'abcdefghijklmnñopqrstuvwxyz'.split('');
const lowerAcc = 'áéíóúü'.split('');
const upper = lower.map((c) => c.toUpperCase());
const upperAcc = 'ÁÉÍÓÚÜ'.split('');
const digits = '0123456789'.split('');
const punct = ['.', ',', ';', ':', '¿', '?', '¡', '!', '(', ')', '-', '"', "'", '…', '/',
  '&', '@', '%', '$', '+', '=', '*', '#', '€', '♥', '~', '_', '°', '✓'];

export const ALL_CHARS = [...lower, ...lowerAcc, ...upper, ...upperAcc, ...digits, ...punct];
export const ROWS_PER_PAGE = 15;
export const TEMPLATE_PAGES = [];
for (let i = 0; i < ALL_CHARS.length; i += ROWS_PER_PAGE) TEMPLATE_PAGES.push(ALL_CHARS.slice(i, i + ROWS_PER_PAGE));

// Grupos para mostrar la cobertura
export const CHAR_GROUPS = [
  { name: 'Minúsculas', chars: [...lower, ...lowerAcc] },
  { name: 'Mayúsculas', chars: [...upper, ...upperAcc] },
  { name: 'Números', chars: digits },
  { name: 'Puntuación y símbolos', chars: punct },
];

const MAP = {
  '“': '"', '”': '"', '«': '"', '»': '"', '„': '"',
  '‘': "'", '’': "'", '`': "'", '´': "'",
  '–': '-', '—': '-', '−': '-',
  '·': '.', '•': '*', ' ': ' ',
  'º': '°', '❤': '♥', '✔': '✓', '☑': '✓',
};
export function normalizeChar(c) { return MAP[c] || c; }

const SET = new Set(ALL_CHARS);
export const isSupported = (c) => SET.has(c);

// Etiqueta corta para humanos
export function pageLabel(p) {
  const cs = TEMPLATE_PAGES[p];
  return `${cs[0]} … ${cs[cs.length - 1]}`;
}
