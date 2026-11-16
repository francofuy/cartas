// Copia de seguridad única: todo lo tuyo en un archivo (letra, archivero, imágenes y hojas guardadas, versiones, nota).
// No incluye los ajustes de este dispositivo ni las claves de los buscadores. Al importar se SUMA (no pisa lo que ya tenés).
import * as DB from './db.js';
import { gzip, gunzip } from './db.js';
import { base64ToBytes, bytesToBase64 } from './util.js';

// huella corta para no duplicar letras si se importa dos veces la misma copia
const fp = (g) => { let h = 2166136261; const a = g.alpha; for (let i = 0; i < a.length; i += 5) { h ^= a[i]; h = Math.imul(h, 16777619); } return `${g.char}|${g.w}x${g.h}|${(h >>> 0).toString(36)}`; };
const mergeById = (mine, theirs, cap) => {
  const seen = new Set(mine.map((x) => x.id));
  const added = theirs.filter((x) => x && x.id && !seen.has(x.id));
  return { list: [...mine, ...added].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, cap), added: added.length };
};

export async function exportBackup(LS) {
  const glyphs = (await DB.allGlyphs()).map((g) => ({ char: g.char, w: g.w, h: g.h, pxmm: g.pxmm, base: g.base, source: g.source, page: g.page, a: bytesToBase64(g.alpha) }));
  let refs = [], papers = [];
  try { refs = await DB.allRefs(); } catch { /* nada */ }
  try {
    for (const r of await DB.allPaperImages()) papers.push({ id: r.id, name: r.name, credit: r.credit, ts: r.ts, b: bytesToBase64(new Uint8Array(await r.blob.arrayBuffer())) });
  } catch { /* nada */ }
  const data = {
    app: 'puno-y-letra', kind: 'backup', version: 2, exportedAt: new Date().toISOString(),
    glyphs, refs, papers, versions: LS.get('pyl.versions', []), savedPapers: LS.get('pyl.papers', []), note: LS.get('pyl.note', ''),
  };
  const counts = { glyphs: glyphs.length, refs: refs.length, papers: papers.length, versions: data.versions.length, savedPapers: data.savedPapers.length };
  const blob = new Blob([await gzip(new TextEncoder().encode(JSON.stringify(data)))], { type: 'application/octet-stream' });
  return { blob, counts };
}

// Acepta la copia completa y también los archivos viejos (solo letra o solo archivero).
export async function importBackup(file, LS) {
  const raw = new Uint8Array(await file.arrayBuffer());
  let data;
  try { data = JSON.parse(new TextDecoder().decode(await gunzip(raw))); } catch { throw new Error('Ese archivo no se puede leer.'); }
  if (!data || data.app !== 'puno-y-letra') throw new Error('El archivo no parece ser de Puño y Letra.');
  const out = { glyphs: 0, refs: 0, papers: 0, versions: 0, savedPapers: 0, note: false };

  if (Array.isArray(data.glyphs) && data.glyphs.length) {
    const have = new Set((await DB.allGlyphs()).map(fp));
    const add = [];
    for (const g of data.glyphs) {
      const rec = { char: g.char, w: g.w, h: g.h, pxmm: g.pxmm, base: g.base, source: g.source || 'import', page: g.page ?? -1, alpha: base64ToBytes(g.a) };
      const k = fp(rec); if (!have.has(k)) { have.add(k); add.push(rec); }
    }
    if (add.length) await DB.addGlyphs(add);
    out.glyphs = add.length;
  }
  if (Array.isArray(data.refs)) {
    const have = new Set((await DB.allRefs()).map((r) => r.id));
    for (const r of data.refs) if (r && r.id && typeof r.text === 'string') { if (!have.has(r.id)) out.refs++; await DB.putRef(r); }
  }
  if (Array.isArray(data.papers)) {
    const have = new Set((await DB.allPaperImages()).map((r) => r.id));
    for (const p of data.papers) {
      if (!p || !p.id || !p.b || have.has(p.id)) continue;
      await DB.putPaperImage({ id: p.id, name: p.name, credit: p.credit, ts: p.ts, blob: new Blob([base64ToBytes(p.b)], { type: 'image/jpeg' }) });
      out.papers++;
    }
  }
  if (Array.isArray(data.versions)) { const m = mergeById(LS.get('pyl.versions', []), data.versions, 60); LS.set('pyl.versions', m.list); out.versions = m.added; }
  if (Array.isArray(data.savedPapers)) { const m = mergeById(LS.get('pyl.papers', []), data.savedPapers.map((x) => ({ ts: 0, ...x })), 40); LS.set('pyl.papers', m.list); out.savedPapers = m.added; }
  if (data.note && !LS.get('pyl.note', '')) { LS.set('pyl.note', data.note); out.note = true; }
  return out;
}

// «Importé 105 variantes de letra, 3 cartas…»
export function describe(c) {
  const parts = [];
  if (c.glyphs) parts.push(`${c.glyphs} variantes de letra`);
  if (c.refs) parts.push(`${c.refs} ${c.refs === 1 ? 'carta' : 'cartas'} del archivero`);
  if (c.papers) parts.push(`${c.papers} ${c.papers === 1 ? 'imagen' : 'imágenes'} de papel`);
  if (c.savedPapers) parts.push(`${c.savedPapers} ${c.savedPapers === 1 ? 'hoja guardada' : 'hojas guardadas'}`);
  if (c.versions) parts.push(`${c.versions} ${c.versions === 1 ? 'versión' : 'versiones'}`);
  if (c.note) parts.push('la nota');
  return parts.length ? parts.join(', ') : '';
}
