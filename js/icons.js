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
};
export function icon(name, size) {
  const s = size ? ` style="width:${size}px;height:${size}px"` : '';
  return `<svg viewBox="0 0 24 24" aria-hidden="true"${s} fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${P[name]}</svg>`;
}
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });
}
