// Íconos de un solo trazo (mismo grosor y terminaciones redondeadas en toda la app)
const P = {
  chevL: '<path d="m14 6-6 6 6 6"/>',
  chevR: '<path d="m10 6 6 6-6 6"/>',
  minus: '<path d="M6 12h12"/>',
  plus: '<path d="M12 6v12M6 12h12"/>',
  close: '<path d="m7 7 10 10M17 7 7 17"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  textMinus: '<path d="m3.5 18 5-12 5 12M5.4 13.5h6.2M16.5 12h4.5"/>',
  textPlus: '<path d="m3.5 18 5-12 5 12M5.4 13.5h6.2M16.5 12h4.5M18.75 9.75v4.5"/>',
  history: '<path d="M12 7v5l3 2M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v3.3h3.3"/>',
  printer: '<path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2M7 14h10v6H7z"/>',
  pen: '<path d="M4 20c2.2-.2 4.6-1.4 6.7-3.5l7.6-7.6a2.1 2.1 0 0 0-3-3L7.7 13.5C5.6 15.6 4.4 18 4 20Z"/><path d="m13.6 6.6 3.8 3.8"/>',
  aa: '<path d="m3 18 5-12 5 12M5 13.5h6M15 18c0-3 1.6-4.5 4-4.5M19 13.5V18"/>',
  paper: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5"/>',
  hand: '<path d="M4 17c3-.5 4-3 5-6s2-5 3.4-4.4c1.4.6.2 3.2-.6 5.2 1.8-1.6 3.6-3 4.6-2.2 1.2 1-1 2.8-2.4 4.4 2-.6 4.2-1 4.4.2.2 1.2-2.6 1.6-5.4 1.8C11.8 16.2 8 18.4 4 17Z"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 1.9-1 1.4-2-.6-1.2.2-2.5 1.6-2.5H17a3.5 3.5 0 0 0 3.5-3.5C20.5 7 16.8 3.5 12 3.5Z"/><circle cx="8" cy="11" r="1"/><circle cx="11" cy="7.5" r="1"/><circle cx="15.5" cy="8.5" r="1"/>',
  note: '<path d="M5 4h14v12l-4 4H5zM15 20v-4h4M8.5 9h7M8.5 12.5h4"/>',
  flip: '<path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18.5 3v4h-4M5.5 21v-4h4"/>',
  sheetPlus: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M12.5 12v6M9.5 15h6"/>',
  download: '<path d="M12 4v10M8 10.5l4 4 4-4M5 19h14"/>',
  upload: '<path d="M12 15V5M8 8.5l4-4 4 4M5 19h14"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.2-4.2"/>',
  pin: '<path d="M9 4h6l-1 5 3 3v1.5H7V12l3-3zM12 13.5V20"/>',
  cabinet: '<path d="M4 4h16v16H4zM4 12h16M10 8h4M10 16h4"/>',
};
export function icon(name, size) {
  const s = size ? ` style="width:${size}px;height:${size}px"` : '';
  return `<svg viewBox="0 0 24 24" aria-hidden="true"${s} fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${P[name]}</svg>`;
}
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });
}
