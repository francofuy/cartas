// Panel «Papel»: galería de modelos y de hojas propias, editor (líneas, margen, color, textura, imagen, decoraciones)
// y buscador de imágenes en internet.
import { $, $$, uid } from './util.js';
import * as DB from './db.js';
import { drawPaper, PAPER_BASE, PAPER_PRESETS, setPaperImage, hasPaperImage } from './paper.js';
import { PW as PAGE_W, PH as PAGE_H } from './format.js';
import { buildChips, buildSwatches } from './controls.js';
import { PROVIDERS, search, downloadImage } from './webpapers.js';

const PAPER_COLORS = [['Blanco cálido', '#fcfaf4'], ['Blanco', '#ffffff'], ['Crema', '#fbf6ea'], ['Amarillento', '#f3ead3'], ['Pergamino', '#f1e2bd'], ['Azulado', '#eef2f6'], ['Rosado', '#fbeff0'], ['Verdoso', '#eef5ec']];
const LINE_COLORS = [['Azul', '#86a9d6'], ['Azul oscuro', '#5d82b8'], ['Beige', '#cfc6b0'], ['Gris', '#b8b8b8'], ['Rosado', '#d8a2a8'], ['Sepia', '#b69a6a'], ['Verde', '#8fb89a']];
const MARGIN_COLORS = [['Rojo', '#d9787a'], ['Azul', '#7ea2d6'], ['Gris', '#a9a9a9'], ['Sepia', '#a8573d'], ['Verde', '#6aa282']];
const DECO_COLORS = [['Azul tinta', '#3b4a8f'], ['Celeste', '#9bbbe0'], ['Rosa', '#d98aa0'], ['Dorado', '#b28a3c'], ['Verde', '#5f9a78'], ['Gris', '#777a88'], ['Bordó', '#8d3a4a']];
const DECOS = [['marco', 'Marco'], ['esquinas', 'Esquinas'], ['franja', 'Franja'], ['encabezado', 'Encabezado'], ['perforaciones', 'Perforaciones'], ['flores', 'Flores']];
const TYPES = [['rayado', 'Rayada'], ['cuadriculado', 'Cuadriculada'], ['puntos', 'Puntos'], ['liso', 'Lisa']];
const SUGGEST = ['papel antiguo', 'pergamino', 'acuarela', 'papel de carta', 'textura de papel', 'flores', 'hojas secas'];

// modelos de fábrica
const MODELS = [
  { name: 'Cuaderno rayado', paper: { ...PAPER_PRESETS.rayado } },
  { name: 'Cuadriculada', paper: { ...PAPER_PRESETS.cuadriculado } },
  { name: 'Cuadernola de puntos', paper: { ...PAPER_PRESETS.puntos } },
  { name: 'Hoja lisa', paper: { ...PAPER_PRESETS.liso } },
  { name: 'Pergamino', paper: { ...PAPER_PRESETS.liso, color: '#f1e2bd', grain: 0.95, deco: ['marco'], decoColor: '#8a6a3b' } },
  { name: 'Sepia vintage', paper: { ...PAPER_PRESETS.rayado, color: '#efe0c2', lineColor: '#b69a6a', grain: 0.8, marginColor: '#a8573d' } },
  { name: 'Carta con marco', paper: { ...PAPER_PRESETS.liso, color: '#fffdf6', grain: 0.2, deco: ['marco'], decoColor: '#3b4a8f' } },
  { name: 'Celeste con franja', paper: { ...PAPER_PRESETS.rayado, color: '#eef4fb', lineColor: '#9bbbe0', margin: false, deco: ['franja', 'esquinas'], decoColor: '#9bbbe0' } },
  { name: 'Flores', paper: { ...PAPER_PRESETS.liso, color: '#fff8f3', grain: 0.2, deco: ['flores'], decoColor: '#d98aa0' } },
  { name: 'De carpeta', paper: { ...PAPER_PRESETS.cuadriculado, color: '#fdfdfb', margin: true, marginX: 30, deco: ['perforaciones'] } },
  { name: 'Membrete', paper: { ...PAPER_PRESETS.liso, color: '#fffefb', grain: 0.15, deco: ['encabezado', 'esquinas'], decoColor: '#3b4a8f' } },
  { name: 'Verde menta', paper: { ...PAPER_PRESETS.rayado, color: '#eef5ec', lineColor: '#8fb89a', marginColor: '#6aa282', deco: ['franja'], decoColor: '#5f9a78' } },
];

// h = { S(), writer(), settingChanged(path), syncControls(), toast, ask, LS, fitLeft() }
export function setupPapers(h) {
  const S = () => h.S();
  const memory = new Map(); // respaldo si el navegador no deja guardar en el dispositivo
  let tab = 'gallery';
  const keys = () => h.LS.get('pyl.keys', {});
  let provider = h.LS.get('pyl.wsprov', 'openverse');
  let state = { q: '', page: 1, items: [], more: false, busy: false };
  let picked = null;
  const urls = new Set();
  const objUrl = (blob) => { const u = URL.createObjectURL(blob); urls.add(u); return u; };

  /* ------------------------------------------------------------------ */
  /* Imágenes de fondo                                                   */
  /* ------------------------------------------------------------------ */
  async function getRec(id) {
    if (memory.has(id)) return memory.get(id);
    try { return await DB.getPaperImage(id); } catch { return null; }
  }
  async function ensureImage(id) {
    if (!id || hasPaperImage(id)) return true;
    const rec = await getRec(id);
    if (!rec) return false;
    try { setPaperImage(id, await createImageBitmap(rec.blob)); return true; } catch { return false; }
  }
  async function storeImage(rec) {
    try { await DB.putPaperImage(rec); } catch (e) { memory.set(rec.id, rec); console.warn('Hojas: no se pudo guardar en el dispositivo', e); }
    memory.set(rec.id, rec);
  }
  const repaint = () => { const w = h.writer(); if (w) { w.inkDirty = true; w.schedule(); } };
  async function applyImage(id) {
    const ok = await ensureImage(id);
    if (!ok) { h.toast('No pude leer esa imagen.'); return; }
    S().paper.imageId = id; S().paper.imageRot = 0;
    h.settingChanged('paper.imageId'); h.syncControls(); renderImageBox(); renderGallery();
  }
  async function shrink(blob) {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86));
  }

  let lastImg, renderTok = 0;
  async function renderImageBox() {
    const my = ++renderTok, id = S().paper.imageId;
    const rec = id ? await getRec(id) : null;
    const all = await recentList();
    if (my !== renderTok) return; // llegó otro pedido más nuevo
    urls.forEach((u) => URL.revokeObjectURL(u)); urls.clear();
    lastImg = id;
    const box = $('#img-thumb'), credit = $('#img-credit');
    box.innerHTML = ''; credit.textContent = '';
    $('#img-rot').disabled = $('#img-del').disabled = !id;
    $('#pp-edit [data-s="paper.imageOpacity"]').disabled = !id;
    if (!rec) { const s = document.createElement('span'); s.className = 'muted'; s.textContent = 'Sin imagen'; box.append(s); }
    else {
      const img = document.createElement('img'); img.alt = 'Imagen de fondo actual'; img.src = objUrl(rec.blob); box.append(img);
      const c = rec.credit;
      if (c && (c.author || c.title)) credit.textContent = `${c.title || 'Imagen'}${c.author ? ' — ' + c.author : ''}${c.license ? ' (' + c.license + ')' : ''}${c.source ? ' · ' + c.source : ''}`;
      else if (rec.name) credit.textContent = rec.name;
    }
    $('#img-recent-box').hidden = all.length === 0;
    const host = $('#img-recent'); host.innerHTML = '';
    for (const r of all) {
      const wrap = document.createElement('div'); wrap.className = 'rc';
      const b = document.createElement('button'); b.type = 'button'; b.className = 'rcb'; b.setAttribute('aria-label', 'Usar la imagen ' + (r.name || ''));
      b.setAttribute('aria-pressed', r.id === id);
      const im = document.createElement('img'); im.alt = ''; im.src = objUrl(r.blob); b.append(im);
      b.addEventListener('click', () => applyImage(r.id));
      const x = document.createElement('button'); x.type = 'button'; x.className = 'rcx'; x.setAttribute('aria-label', 'Borrar esta imagen'); x.textContent = '×';
      x.addEventListener('click', async () => {
        if (!(await h.ask('¿Borrar esta imagen?', 'Se saca de tu dispositivo. Las hojas guardadas que la usen quedan sin imagen.', 'Borrar imagen', true))) return;
        try { await DB.deletePaperImage(r.id); } catch { /* nada */ }
        memory.delete(r.id); setPaperImage(r.id, null);
        if (S().paper.imageId === r.id) { S().paper.imageId = null; h.settingChanged('paper.imageId'); h.syncControls(); }
        renderImageBox(); renderGallery();
      });
      wrap.append(b, x); host.append(wrap);
    }
  }
  async function recentList() {
    let list = [];
    try { list = await DB.allPaperImages(); } catch { /* nada */ }
    for (const r of memory.values()) if (!list.some((x) => x.id === r.id)) list.push(r);
    return list.sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 12);
  }

  $('#img-file').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const blob = await shrink(f);
      const id = 'u' + uid();
      await storeImage({ id, name: f.name.replace(/\.\w+$/, ''), blob, credit: { title: f.name.replace(/\.\w+$/, ''), source: 'Tu dispositivo' }, ts: Date.now() });
      await applyImage(id);
      h.toast('Imagen puesta como fondo de la hoja.', 2400);
    } catch (err) { console.warn(err); h.toast('No pude leer esa imagen.'); }
  });
  $('#img-rot').addEventListener('click', () => { S().paper.imageRot = ((S().paper.imageRot || 0) + 90) % 360; h.settingChanged('paper.imageRot'); });
  $('#img-del').addEventListener('click', () => { S().paper.imageId = null; h.settingChanged('paper.imageId'); h.syncControls(); renderImageBox(); renderGallery(); });

  /* ------------------------------------------------------------------ */
  /* Galería                                                             */
  /* ------------------------------------------------------------------ */
  const W = 108, H = Math.round((108 * PAGE_H) / PAGE_W);
  function thumb(paper) {
    const H = Math.round((108 * PAGE_H) / PAGE_W); // la miniatura sigue el tamaño de hoja en uso (A4 o A5)
    const c = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = W * dpr; c.height = H * dpr; c.style.width = W + 'px'; c.style.height = H + 'px';
    const ctx = c.getContext('2d');
    drawPaper(ctx, (W * dpr) / PAGE_W, { ...PAPER_BASE, ...paper });
    // un renglón de ejemplo para dar escala
    ctx.save(); ctx.strokeStyle = '#2a3a8f'; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.4 * dpr; ctx.lineCap = 'round';
    ctx.beginPath(); const y = 34 * dpr, x0 = ((paper.margin ? (paper.marginX || 28) + 4 : 18) * W * dpr) / PAGE_W;
    ctx.moveTo(x0, y); for (let i = 1; i <= 7; i++) ctx.lineTo(x0 + i * 7.5 * dpr, y + (i % 2 ? -3 : 2) * dpr); ctx.stroke(); ctx.restore();
    return c;
  }
  const mine = () => h.LS.get('pyl.papers', []);
  function applyPaper(p) {
    const imageId = p.imageId || null;
    Object.keys(S().paper).forEach((k) => { if (!(k in PAPER_BASE)) delete S().paper[k]; });
    Object.assign(S().paper, JSON.parse(JSON.stringify({ ...PAPER_BASE, ...p })));
    const done = () => { h.settingChanged('paper.type'); h.syncControls(); renderImageBox(); };
    if (imageId) ensureImage(imageId).then(done); else done();
  }
  function card(name, paper, onUse, onDel) {
    const w = document.createElement('div'); w.className = 'pcard';
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pthumb'; b.setAttribute('aria-label', 'Usar la hoja «' + name + '»');
    b.append(thumb(paper)); b.addEventListener('click', onUse);
    const n = document.createElement('span'); n.className = 'pname'; n.textContent = name;
    w.append(b, n);
    if (onDel) { const x = document.createElement('button'); x.type = 'button'; x.className = 'rcx'; x.setAttribute('aria-label', 'Borrar la hoja «' + name + '»'); x.textContent = '×'; x.addEventListener('click', onDel); w.append(x); }
    return w;
  }
  async function renderGallery() {
    const models = $('#pg-models'); models.innerHTML = '';
    MODELS.forEach((m) => models.append(card(m.name, m.paper, () => { applyPaper(m.paper); h.toast('Hoja «' + m.name + '» lista.', 1800); })));
    const host = $('#pg-mine'); host.innerHTML = '';
    const list = mine();
    $('#pg-empty').hidden = list.length > 0;
    for (const m of list) {
      if (m.paper.imageId) await ensureImage(m.paper.imageId);
      host.append(card(m.name, m.paper, () => { applyPaper(m.paper); h.toast('Hoja «' + m.name + '» lista.', 1800); }, async () => {
        if (!(await h.ask('¿Borrar esta hoja?', '«' + m.name + '» se saca de tus hojas guardadas.', 'Borrar hoja', true))) return;
        h.LS.set('pyl.papers', mine().filter((x) => x.id !== m.id)); renderGallery();
      }));
    }
  }
  $('#pg-saveform').addEventListener('submit', (e) => {
    e.preventDefault();
    const list = mine();
    const name = $('#pg-name').value.trim() || 'Mi hoja ' + (list.length + 1);
    list.unshift({ id: uid(), name, paper: JSON.parse(JSON.stringify(S().paper)) });
    h.LS.set('pyl.papers', list.slice(0, 40));
    $('#pg-name').value = ''; renderGallery(); h.toast('Hoja guardada en «Mis hojas».', 2200);
  });

  /* ------------------------------------------------------------------ */
  /* Editor                                                              */
  /* ------------------------------------------------------------------ */
  function setupEditor() {
    buildChips($('#paper-chips'), TYPES, () => S().paper.type, (k) => {
      const p = PAPER_PRESETS[k];
      Object.assign(S().paper, { type: k, lineSpacing: p.lineSpacing, grid: p.grid });
      if (k === 'cuadriculado' || k === 'puntos' || k === 'liso') S().paper.margin = false; else S().paper.margin = true;
      h.syncControls(); h.settingChanged('paper.type');
    });
    buildSwatches($('#paper-swatches'), PAPER_COLORS, () => S().paper.color, (c) => { S().paper.color = c; h.settingChanged('paper.color'); renderGallery(); });
    buildSwatches($('#line-swatches'), LINE_COLORS, () => S().paper.lineColor, (c) => { S().paper.lineColor = c; h.settingChanged('paper.lineColor'); });
    buildSwatches($('#margin-swatches'), MARGIN_COLORS, () => S().paper.marginColor, (c) => { S().paper.marginColor = c; h.settingChanged('paper.marginColor'); });
    buildSwatches($('#deco-swatches'), DECO_COLORS, () => S().paper.decoColor, (c) => { S().paper.decoColor = c; h.settingChanged('paper.decoColor'); });
    // decoraciones: se pueden combinar
    const dc = $('#deco-chips'); dc.innerHTML = '';
    for (const [k, label] of DECOS) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = label; b.dataset.key = k;
      b.addEventListener('click', () => {
        const d = new Set(S().paper.deco || []); if (d.has(k)) d.delete(k); else d.add(k);
        S().paper.deco = [...d]; refreshDeco(); h.settingChanged('paper.deco');
      });
      dc.append(b);
    }
    dc._refresh = refreshDeco;
  }
  function refreshDeco() { const d = new Set(S().paper.deco || []); $$('#deco-chips .chip').forEach((b) => b.setAttribute('aria-pressed', d.has(b.dataset.key))); }

  /* ------------------------------------------------------------------ */
  /* Pestañas                                                            */
  /* ------------------------------------------------------------------ */
  const isWide = () => tab !== 'edit';
  function setTab(t) {
    tab = t;
    $$('.ptabs [role="tab"]').forEach((b) => { const on = b.dataset.ptab === t; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
    $$('.ptab').forEach((p) => { p.hidden = p.dataset.ptab !== t; });
    if (t === 'gallery') renderGallery();
    if (t === 'edit') renderImageBox();
    if (t === 'search') { renderProviders(); if (!state.items.length) $('#ws-q').focus({ preventScroll: true }); }
    h.fitLeft(); $('#pop').scrollTo(0, 0);
  }
  $$('.ptabs [role="tab"]').forEach((b) => {
    b.addEventListener('click', () => setTab(b.dataset.ptab));
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const all = $$('.ptabs [role="tab"]'), i = all.indexOf(b), n = all[(i + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length];
      n.focus(); setTab(n.dataset.ptab);
    });
  });

  /* ------------------------------------------------------------------ */
  /* Buscar en internet                                                  */
  /* ------------------------------------------------------------------ */
  function renderProviders() {
    buildChips($('#ws-prov'), Object.entries(PROVIDERS).map(([k, v]) => [k, v.label]), () => provider, (k) => {
      provider = k; h.LS.set('pyl.wsprov', k); renderProviders();
    });
    const P = PROVIDERS[provider], has = !!keys()[provider];
    $('#ws-note').textContent = P.note;
    $('#ws-keybox').hidden = !P.key;
    if (P.key) {
      $('#ws-keylbl').textContent = 'Clave de ' + P.label + (has ? ' (guardada)' : '');
      $('#ws-keylink').href = P.url;
      $('#ws-key').value = '';
      $('#ws-key').placeholder = has ? 'Pegá una clave nueva para cambiarla' : 'Pegá tu clave acá';
    }
  }
  $('#ws-keybox').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#ws-key').value.trim();
    if (!v) { h.toast('Pegá la clave primero.'); return; }
    h.LS.set('pyl.keys', { ...keys(), [provider]: v });
    renderProviders(); h.toast('Clave guardada en este dispositivo.', 2200);
    if ($('#ws-q').value.trim()) runSearch(1);
  });

  const sugg = $('#ws-sugg');
  SUGGEST.forEach((t) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = t; b.addEventListener('click', () => { $('#ws-q').value = t; runSearch(1, t); }); sugg.append(b); });
  $('#ws-form').addEventListener('submit', (e) => { e.preventDefault(); runSearch(1); });
  $('#ws-more').addEventListener('click', () => runSearch(state.page + 1));

  async function runSearch(page, q) {
    if (state.busy) return;
    q = (q ?? $('#ws-q').value).trim();
    if (!q) { $('#ws-status').textContent = 'Escribí qué hoja querés buscar.'; return; }
    const P = PROVIDERS[provider];
    if (P.key && !keys()[provider]) { $('#ws-status').textContent = 'Primero pegá tu clave de ' + P.label + ' (es gratis).'; $('#ws-key').focus(); return; }
    state.busy = true; state.q = q; state.page = page;
    $('#ws-status').textContent = 'Buscando…';
    if (page === 1) { state.items = []; $('#ws-results').innerHTML = ''; }
    $('#ws-more').hidden = true;
    try {
      const r = await search(provider, q, page, keys());
      state.items = state.items.concat(r.items); state.more = r.more;
      renderResults(r.items);
      $('#ws-status').textContent = state.items.length ? `${state.items.length} resultados de ${P.label}. Tocá uno para verlo.` : 'No encontré nada. Probá con otras palabras (en inglés suele haber más).';
      $('#ws-more').hidden = !r.more;
    } catch (err) { $('#ws-status').textContent = err.message || 'No pude buscar.'; }
    state.busy = false;
  }
  function renderResults(items) {
    const host = $('#ws-results');
    for (const it of items) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'rcell'; b.setAttribute('aria-label', it.title + (it.author ? ', de ' + it.author : ''));
      const im = document.createElement('img'); im.loading = 'lazy'; im.alt = ''; im.src = it.thumb; im.referrerPolicy = 'no-referrer';
      im.addEventListener('error', () => b.classList.add('bad'));
      b.append(im); b.addEventListener('click', () => pick(it)); host.append(b);
    }
  }
  function pick(it) {
    picked = it;
    $('#ws-pick-img').src = it.thumb; $('#ws-pick-img').alt = it.title;
    $('#ws-pick-title').textContent = it.title;
    $('#ws-pick-credit').textContent = [it.author && 'De ' + it.author, it.license, it.source].filter(Boolean).join(' · ');
    const a = $('#ws-pick-link'); a.hidden = !it.link; if (it.link) a.href = it.link;
    $('#ws-pick').hidden = false; $('#pop').scrollTo(0, 0);
    $('#ws-pick-use').focus({ preventScroll: true });
  }
  $('#ws-pick-back').addEventListener('click', () => { $('#ws-pick').hidden = true; });
  $('#ws-pick-use').addEventListener('click', async () => {
    if (!picked) return;
    const btn = $('#ws-pick-use'); btn.disabled = true; btn.textContent = 'Bajando…';
    try {
      const { blob, reduced } = await downloadImage(picked);
      const id = 'w' + uid();
      await storeImage({ id, name: picked.title, blob, credit: { title: picked.title, author: picked.author, license: picked.license, source: picked.source, link: picked.link }, ts: Date.now() });
      await applyImage(id);
      $('#ws-pick').hidden = true; setTab('edit');
      h.toast(reduced ? 'Listo (se usó una versión reducida de la imagen).' : 'Imagen puesta como fondo de la hoja.', 3200);
    } catch (err) { h.toast(err.message || 'No pude bajar la imagen.'); }
    btn.disabled = false; btn.textContent = 'Usar como hoja';
  });

  /* ------------------------------------------------------------------ */
  setupEditor();
  renderImageBox(); renderGallery(); renderProviders();
  // al abrir la app, la imagen de la hoja actual se carga y se vuelve a dibujar
  ensureImage(S().paper.imageId).then((ok) => { if (ok) repaint(); });
  window.addEventListener('pagehide', () => urls.forEach((u) => URL.revokeObjectURL(u)));

  return {
    isWide,
    sync() { $('#paper-chips')._refresh?.(); refreshDeco(); if (lastImg !== S().paper.imageId) renderImageBox(); },
    onOpen() { setTab(tab); },
    refreshAll() { renderGallery(); renderImageBox(); },
    async imageBlob(id) { const r = await getRec(id); return r ? r.blob : null; },
    ensureImage,
  };
}
