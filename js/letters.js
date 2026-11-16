// Mis cartas: varias cartas en curso (borradores), cerrar una carta (sobre y sello), las cartas cerradas
// y la regla de oro: una carta cerrada se imprime UNA sola vez; después de imprimir y confirmar que salió bien, se elimina.
import { $, $$, uid } from './util.js';
import * as DB from './db.js';
import { drawPaper, setPaperImage } from './paper.js';
import { PAGE_W, PAGE_H } from './template.js';
import { PRINT_DPI_PPM } from './print.js';
import { playSeal } from './seal.js';

const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const isEmpty = (t) => !String(t || '').replace(/[\f\v\s]/g, '');
const titleOf = (t) => (String(t || '').replace(/[\f\v]/g, '').split('\n').map((x) => x.trim()).find(Boolean) || '').slice(0, 38) || 'Carta sin título';
const fmtDate = (ts) => new Date(ts).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const toBlob = (c, type, q) => new Promise((r) => c.toBlob(r, type, q));

// h = { S(), saveSettings(), writer(), LS, toast, ask, busy, unbusy, printflow, sound, animOn(), isMobile(), paperBlob(id), onOpenDialog() }
export function setupLetters(h) {
  const S = () => h.S(), W = () => h.writer(), LS = h.LS;

  /* ------------------------------------------------------------------ */
  /* Cartas en curso (borradores)                                        */
  /* ------------------------------------------------------------------ */
  let drafts = [], activeId = null, lastRemoved = null;
  const cur = () => drafts.find((d) => d.id === activeId) || null;
  const persist = () => { LS.set('pyl.drafts', drafts); LS.set('pyl.draftActive', activeId); };
  const newSeed = () => 1 + Math.floor(Math.random() * 1e6);
  function load() {
    drafts = LS.get('pyl.drafts', null); activeId = LS.get('pyl.draftActive', null);
    if (!Array.isArray(drafts) || !drafts.length) { // primera vez con varias cartas: la carta de siempre pasa a ser la primera
      const old = LS.get('pyl.draft', { text: '' });
      drafts = [{ id: uid(), text: old.text || '', seed: S().seed, ts: Date.now(), title: titleOf(old.text) }];
      activeId = drafts[0].id;
      LS.set('pyl.versions', LS.get('pyl.versions', []).map((v) => (v.draftId ? v : { ...v, draftId: activeId })));
      persist();
    }
    if (!drafts.some((d) => d.id === activeId)) activeId = drafts[0].id;
  }
  function saveActive() {
    const d = cur(), w = W(); if (!d || !w) return;
    d.text = w.text; d.seed = S().seed; d.ts = Date.now(); d.title = titleOf(w.text);
    persist(); updateChip();
  }
  function loadInto(d) {
    S().seed = d.seed || newSeed(); h.saveSettings();
    W().setText(d.text || ''); W()._syncCap?.();
  }
  function switchTo(id) {
    if (id === activeId) return;
    saveActive();
    const old = cur();
    if (old && isEmpty(old.text) && drafts.length > 1) drafts = drafts.filter((d) => d.id !== old.id); // una carta en blanco no se guarda
    activeId = id; loadInto(cur()); persist(); updateChip();
  }
  function startBlank(force = false) {
    saveActive();
    const c = cur();
    if (!force && c && isEmpty(c.text)) return false;
    const d = { id: uid(), text: '', seed: newSeed(), ts: Date.now(), title: 'Carta sin título' };
    drafts.unshift(d); activeId = d.id; loadInto(d); persist(); updateChip();
    return true;
  }
  function removeDraft(id) {
    const i = drafts.findIndex((d) => d.id === id); if (i < 0) return;
    lastRemoved = { d: drafts[i], i };
    drafts.splice(i, 1);
    if (!drafts.length) { drafts.push({ id: uid(), text: '', seed: newSeed(), ts: Date.now(), title: 'Carta sin título' }); }
    if (id === activeId) { activeId = drafts[Math.min(i, drafts.length - 1)].id; loadInto(cur()); }
    persist(); updateChip(); renderDrafts();
  }
  function updateChip() {
    const b = $('#letter-chip'), d = cur(); if (!b || !d) return;
    $('.t', b).textContent = d.title || titleOf(d.text);
  }
  function renderDrafts() {
    const ul = $('#draft-list'); ul.innerHTML = '';
    if (lastRemoved) {
      const li = el('li', 'undo'); li.append(el('span', 't', `«${lastRemoved.d.title || 'Carta'}» borrada.`));
      const un = el('button', 'btn', 'Deshacer'); un.type = 'button';
      un.addEventListener('click', () => { drafts.splice(Math.min(lastRemoved.i, drafts.length), 0, lastRemoved.d); lastRemoved = null; persist(); renderDrafts(); });
      li.append(un); ul.append(li);
    }
    for (const d of drafts) {
      const li = el('li'); li.classList.toggle('current', d.id === activeId);
      const t = el('div', 't'), b = el('b', '', d.title || titleOf(d.text)), sm = el('small', '', `${d.id === activeId ? 'La que estás escribiendo · ' : ''}${isEmpty(d.text) ? 'En blanco' : d.text.replace(/[\f\v]/g, '').length + ' caracteres'} · ${fmtDate(d.ts)}`);
      t.append(b, sm); li.append(t);
      if (d.id !== activeId) { const o = el('button', 'btn', 'Abrir'); o.type = 'button'; o.addEventListener('click', () => { switchTo(d.id); $('#versions').close(); }); li.append(o); }
      const x = el('button', 'btn danger', 'Borrar'); x.type = 'button'; x.addEventListener('click', () => removeDraft(d.id));
      li.append(x); ul.append(li);
    }
  }
  function openDialog() { lastRemoved = null; saveActive(); renderDrafts(); h.onOpenDialog?.(); $('#versions').showModal(); }
  $('#draft-new').addEventListener('click', () => { if (startBlank()) $('#versions').close(); else h.toast('Ya estás en una carta en blanco.'); });
  $('#letter-chip').addEventListener('click', openDialog);

  /* ------------------------------------------------------------------ */
  /* Cerrar la carta                                                     */
  /* ------------------------------------------------------------------ */
  const versionsOf = (id) => LS.get('pyl.versions', []).filter((v) => v.draftId === id);
  function openSealDialog() {
    const w = W();
    if (isEmpty(w.text)) { h.toast('Escribí algo antes de cerrar la carta.'); return; }
    saveActive();
    const L = w.layout, nS = L.sheets.length, nB = L.sheets.filter((x) => x.back != null).length;
    $('#seal-info').textContent = `«${cur().title}»: ${plural(nS, 'hoja', 'hojas')}${nB ? `, ${nB} con dorso` : ''}.`;
    const vc = versionsOf(activeId).length;
    $('#seal-vers-row').hidden = vc === 0;
    $('#seal-vers').checked = true;
    $('#seal-vers-n').textContent = plural(vc, 'versión guardada', 'versiones guardadas');
    $('#sealdlg').showModal();
  }
  $('#btn-seal').addEventListener('click', openSealDialog);
  $('#seal-go').addEventListener('click', (e) => { e.preventDefault(); const dv = $('#seal-vers').checked; $('#sealdlg').close(); doSeal(dv); });

  async function doSeal(delVersions) {
    const w = W(), id = uid(), L = w.layout, pages = L.pages, d = cur(), sealedDraftId = d.id;
    const paper = JSON.parse(JSON.stringify(S().paper));
    try {
      // miniaturas (también sirven para la animación)
      const thumbs = [];
      for (let i = 0; i < pages; i++) { const c = document.createElement('canvas'); w.renderPageTo(c, i, 1.2); thumbs.push(c.toDataURL('image/jpeg', 0.8)); }
      const big = document.createElement('canvas'); w.renderPageTo(big, 0, 2); const fxImg = big.toDataURL('image/jpeg', 0.88);
      const target = flyTarget().getBoundingClientRect();
      const fx = h.animOn() ? playSeal({ image: fxImg, style: styleOf(id), target, sound: h.sound }) : Promise.resolve();
      if (!h.animOn()) h.busy('Cerrando la carta…');
      // se congela la tinta de cada cara (PNG transparente a 300 ppp); el papel se guarda como datos
      const ink = [];
      for (let i = 0; i < pages; i++) { const c = document.createElement('canvas'); w.renderInkTo(c, i, PRINT_DPI_PPM); ink.push(await toBlob(c, 'image/png')); c.width = c.height = 0; await new Promise((r) => setTimeout(r)); }
      let paperImage = null;
      if (paper.imageId) paperImage = await h.paperBlob(paper.imageId);
      const rec = { id, title: d.title, ts: Date.now(), status: 'sealed', pages, faces: L.faces.map((f) => ({ ...f })), sheets: L.sheets.map((s) => ({ ...s })), ink, paper, paperImage, thumbs };
      await saveLetter(rec);
      // la carta sale del editor; si pidió borrar sus versiones, también
      if (delVersions) LS.set('pyl.versions', LS.get('pyl.versions', []).filter((v) => v.draftId !== sealedDraftId));
      drafts = drafts.filter((x) => x.id !== sealedDraftId);
      const nd = { id: uid(), text: '', seed: newSeed(), ts: Date.now(), title: 'Carta sin título' };
      drafts.unshift(nd); activeId = nd.id; loadInto(nd); persist(); updateChip();
      letters.unshift(rec); renderBuzon();
      await fx;
      h.unbusy();
      h.toast('Carta cerrada. La encontrás en Mis cartas: se imprime una sola vez.', 4200);
      pulseBuzon();
    } catch (err) {
      console.error(err); h.unbusy();
      document.querySelector('.sealfx')?.remove();
      h.toast('No pude cerrar la carta. Seguís teniéndola en el editor.', 5200);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Las cartas cerradas                                                 */
  /* ------------------------------------------------------------------ */
  let letters = [];
  const mem = new Map(); // respaldo si el navegador no deja guardar en el dispositivo
  async function saveLetter(rec) {
    mem.set(rec.id, rec);
    try { await DB.putLetter(rec); } catch (e) { console.warn('Cartas cerradas: no se pudo guardar en el dispositivo', e); }
  }
  async function loadLetters() {
    try { letters = await DB.allLetters(); } catch { letters = []; }
    for (const m of mem.values()) if (!letters.some((l) => l.id === m.id)) letters.push(m);
    letters.sort((a, b) => b.ts - a.ts);
    renderBuzon();
  }
  const tray = $('#bz-tray'), chip = $('#letter-chip');
  const sbtn = $('#sealed-btn'), pop = $('#sealed-pop'), emptyBox = $('#empty-sealed');
  const at = () => ({ top: true, empty: true, ...(S().sealedAt || {}) });
  const flyTarget = () => (!sbtn.hidden ? sbtn : chip);
  function pulseBuzon() { const t = flyTarget(); t.classList.add('pulse'); setTimeout(() => t.classList.remove('pulse'), 2200); }

  /* ---- entradas a las cartas cerradas: el botón de arriba y la hoja vacía ---- */
  let popOpen = false, textEmpty = false;
  function setPop(v) { popOpen = v; pop.hidden = !v; sbtn.setAttribute('aria-expanded', String(v)); }
  sbtn.addEventListener('click', () => setPop(!popOpen));
  document.addEventListener('pointerdown', (e) => {
    if (popOpen && !pop.contains(e.target) && !sbtn.contains(e.target)) setPop(false);
  });
  const showAll = () => { setPop(false); api.openSealed(); };
  $('#sealed-pop-all').addEventListener('click', showAll);
  $('#empty-sealed-all').addEventListener('click', showAll);
  function closePops() { // devuelve true si había algo abierto (para que Esc lo cierre primero)
    if (popOpen) { setPop(false); sbtn.focus(); return true; }
    return false;
  }
  function applyViews() {
    const v = at(), n = letters.length;
    sbtn.hidden = !v.top;
    if (!v.top && popOpen) setPop(false);
    emptyBox.hidden = !(v.empty && textEmpty && n > 0);
  }
  function syncEmpty(isEmptyText) { textEmpty = !!isEmptyText; applyViews(); }

  // cada sobre tiene su propio papel y su propio lacre (siempre el mismo para la misma carta)
  const PAPERS = ['#f1e6cc', '#e4ecf7', '#f7e3ea', '#e1f0e5', '#ece5f8', '#f8ecd2'];
  const WAXES = ['#a3202b', '#1f4fd8', '#b8892a', '#2b7a56', '#6a3bb0', '#c4562a'];
  const hashOf = (id) => { let x = 0; for (const ch of String(id)) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return x; };
  function styleOf(id) { const x = hashOf(id); return { paper: PAPERS[x % PAPERS.length], wax: WAXES[(x >> 3) % WAXES.length] }; }

  function miniItem(rec, card) {
    const st = styleOf(rec.id), li = document.createElement('li');
    const b = el('button', 'sobre' + (card ? ' card' : ' mini')); b.type = 'button'; b.dataset.id = rec.id;
    b.style.setProperty('--paper', st.paper); b.style.setProperty('--wax', st.wax);
    b.classList.toggle('pend', rec.status === 'printing');
    b.setAttribute('aria-label', `${rec.title}, cerrada el ${fmtDate(rec.ts)}, ${plural(rec.sheets.length, 'hoja', 'hojas')}${rec.status === 'printing' ? '. Impresión sin confirmar' : ''}`);
    b.append(el('b', '', rec.title), el('small', '', card ? `${plural(rec.sheets.length, 'hoja', 'hojas')}` : `${fmtDate(rec.ts)} · ${plural(rec.sheets.length, 'hoja', 'hojas')}${rec.status === 'printing' ? ' · sin confirmar' : ''}`));
    b.addEventListener('click', () => { setPop(false); $('#versions').close(); openMail(rec); });
    li.append(b); return li;
  }
  function fillMini(ul, list, card) {
    ul.innerHTML = '';
    if (!list.length) { ul.append(el('li', 'empty muted', 'Todavía no cerraste ninguna carta.')); return; }
    for (const rec of list) ul.append(miniItem(rec, card));
  }
  function renderBuzon() {
    const n = letters.length;
    const cnt = $('#bz-count'); cnt.textContent = n || ''; cnt.hidden = !n;
    const pend = letters.filter((l) => l.status === 'printing').length;
    sbtn.setAttribute('aria-label', n ? `Cartas cerradas: ${n}${pend ? `, ${pend} con impresión sin confirmar` : ''}` : 'Cartas cerradas: ninguna todavía');
    chip.setAttribute('aria-label', 'Carta que estás escribiendo. Abrir Mis cartas');
    fillMini($('#sealed-pop-list'), letters.slice(0, 6), false);
    fillMini($('#empty-sealed-list'), letters.slice(0, 3), true);
    $('#empty-sealed-all').textContent = n > 3 ? `Ver las ${n}` : 'Ver todas';
    $('#sealed-pop-all').hidden = n === 0;
    tray.innerHTML = '';
    if (!n) tray.append(el('li', 'empty muted', 'Todavía no cerraste ninguna carta.'));
    for (const rec of letters) {
      const st = styleOf(rec.id), li = document.createElement('li');
      const b = el('button', 'sobre'); b.type = 'button'; b.dataset.id = rec.id;
      b.style.setProperty('--paper', st.paper); b.style.setProperty('--wax', st.wax);
      b.classList.toggle('pend', rec.status === 'printing');
      b.setAttribute('aria-label', `${rec.title}, cerrada el ${fmtDate(rec.ts)}, ${plural(rec.sheets.length, 'hoja', 'hojas')}${rec.status === 'printing' ? '. Impresión sin confirmar' : ''}`);
      b.append(el('b', '', rec.title), el('small', '', `${fmtDate(rec.ts)} · ${plural(rec.sheets.length, 'hoja', 'hojas')}${rec.status === 'printing' ? ' · sin confirmar' : ''}`));
      b.addEventListener('click', () => { $('#versions').close(); openMail(rec); });
      li.append(b); tray.append(li);
    }
    applyViews();
  }

  /* ---- una carta cerrada ---- */
  let curRec = null;
  function openMail(rec) {
    curRec = rec;
    $('#mail-title').textContent = rec.title;
    $('#mail-meta').textContent = `Cerrada el ${fmtDate(rec.ts)} · ${plural(rec.sheets.length, 'hoja', 'hojas')}${rec.sheets.some((s) => s.back != null) ? ' (con dorso)' : ''}`;
    const th = $('#mail-thumbs'); th.innerHTML = '';
    rec.thumbs.forEach((u, i) => { const im = new Image(); im.src = u; im.alt = `Cara ${i + 1} de la carta`; th.append(im); });
    const pend = rec.status === 'printing';
    $('#mail-state').textContent = pend ? 'La última vez no confirmaste si se imprimió bien. Podés confirmarlo ahora o imprimirla de nuevo.' : 'Está cerrada. Se imprime una sola vez: después de imprimirla te pido confirmar que salió bien y se elimina.';
    $('#mail-confirm').hidden = !pend;
    $('#mail-open').textContent = pend ? 'Imprimir de nuevo' : 'Abrir y imprimir';
    $('#maildlg').showModal();
  }
  $('#mail-open').addEventListener('click', () => { $('#maildlg').close(); startPrint(curRec); });
  $('#mail-confirm').addEventListener('click', () => { $('#maildlg').close(); openConfirm(curRec); });
  $('#mail-del').addEventListener('click', async () => {
    const rec = curRec; $('#maildlg').close();
    if (!(await h.ask('¿Descartar esta carta sin imprimirla?', `«${rec.title}» se elimina y no se puede recuperar.`, 'Descartar carta', true))) { openMail(rec); return; }
    await removeLetter(rec, false);
    h.toast('Carta descartada.', 2600);
  });

  // el papel y la tinta congelados se vuelven a juntar al imprimir
  async function renderSealed(rec, idx) {
    const ppm = PRINT_DPI_PPM, c = document.createElement('canvas');
    c.width = Math.round(PAGE_W * ppm); c.height = Math.round(PAGE_H * ppm);
    const ctx = c.getContext('2d'), tmp = 'sealed:' + rec.id;
    if (rec.paperImage) setPaperImage(tmp, await createImageBitmap(rec.paperImage));
    drawPaper(ctx, ppm, { ...rec.paper, imageId: rec.paperImage ? tmp : null });
    const bmp = await createImageBitmap(rec.ink[idx]);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    if (rec.paperImage) setPaperImage(tmp, null);
    return toBlob(c, 'image/jpeg', 0.95);
  }
  function startPrint(rec, only = null) {
    const src = {
      sheets: rec.sheets, pages: rec.pages, goLabel: 'Imprimir (única vez)',
      note: 'Esta carta se imprime una sola vez: después te pido confirmar que salió bien y se elimina.',
      render: (i) => renderSealed(rec, i),
      onStart: async () => { rec.status = 'printing'; await saveLetter(rec); renderBuzon(); },
      onPrinted: (res) => { if (res === 'ok') openConfirm(rec); },
    };
    h.printflow.open(src, { only });
  }

  /* ---- ¿salió bien? ---- */
  function openConfirm(rec) {
    curRec = rec;
    $('#ok-pick').hidden = true; $('#ok-actions1').hidden = false; $('#ok-actions2').hidden = true;
    const grid = $('#ok-sheets'); grid.innerHTML = '';
    rec.sheets.forEach((s, i) => {
      const lab = el('label', 'okrow'); const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = true; cb.dataset.i = i;
      lab.append(cb, el('span', '', `Hoja ${i + 1}${s.back != null ? ' (frente y dorso)' : ''}`)); grid.append(lab);
    });
    $('#okdlg').showModal();
  }
  $('#ok-no').addEventListener('click', () => { $('#ok-pick').hidden = false; $('#ok-actions1').hidden = true; $('#ok-actions2').hidden = false; });
  $('#ok-back').addEventListener('click', () => { $('#ok-pick').hidden = true; $('#ok-actions1').hidden = false; $('#ok-actions2').hidden = true; });
  $('#ok-reprint').addEventListener('click', () => {
    const only = new Set($$('#ok-sheets input:checked').map((c) => +c.dataset.i));
    if (!only.size) { h.toast('Marcá al menos una hoja.'); return; }
    $('#okdlg').close(); startPrint(curRec, only.size === curRec.sheets.length ? null : only);
  });
  $('#ok-yes').addEventListener('click', async () => {
    const rec = curRec; $('#okdlg').close();
    await removeLetter(rec, true);
    h.toast('Listo: la carta está impresa y ya no está guardada.', 4200);
  });
  $('#okdlg').addEventListener('cancel', () => { renderBuzon(); }); // si se cierra sin responder, queda «sin confirmar»

  /* ---- eliminar y dejar el rastro ---- */
  async function removeLetter(rec, printed) {
    try { await DB.deleteLetter(rec.id); } catch { /* nada */ }
    mem.delete(rec.id); letters = letters.filter((l) => l.id !== rec.id); renderBuzon();
    const sent = LS.get('pyl.sent', []);
    sent.unshift({ id: rec.id, title: rec.title, ts: rec.ts, at: Date.now(), sheets: rec.sheets.length, printed });
    LS.set('pyl.sent', sent.slice(0, 200));
  }
  function openSent() {
    const ul = $('#sent-list'); ul.innerHTML = '';
    const list = LS.get('pyl.sent', []);
    if (!list.length) ul.append(el('li', 'muted', 'Todavía no hay cartas enviadas.'));
    for (const s of list) {
      const li = el('li'); const t = el('div', 't');
      t.append(el('b', '', s.title), el('small', '', `${s.printed ? 'Impresa' : 'Descartada sin imprimir'} el ${fmtDate(s.at)} · ${plural(s.sheets, 'hoja', 'hojas')}`));
      li.append(t); ul.append(li);
    }
    $('#sentdlg').showModal();
  }
  $('#bz-sent').addEventListener('click', () => { $('#versions').close(); openSent(); });

  /* ------------------------------------------------------------------ */
  load(); updateChip(); loadLetters();
  const api = {
    start() { const d = cur(); S().seed = d.seed || S().seed; return d.text || ''; },
    saveActive, openDialog, activeId: () => activeId, startBlank,
    openSealed() { openDialog(); $('#sealed-sec')?.scrollIntoView({ block: 'nearest' }); },
    closePops, syncEmpty, applyViews,
    pendingCount: () => letters.filter((l) => l.status === 'printing').length,
  };
  return api;
}
