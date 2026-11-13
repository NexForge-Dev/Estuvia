// Catálogo oficial de másteres del Distrito Único Andaluz.
// El portal realiza la búsqueda con POST a mo_catalogo.php y devuelve una tabla HTML.

import { htmlText } from '../http.js';

export const UNIVERSITIES = [
  ['48', 'ual', 'ALMERÍA'],
  ['5', 'uca', 'CÁDIZ'],
  ['6', 'uco', 'CÓRDOBA'],
  ['8', 'ugr', 'GRANADA'],
  ['49', 'uhu', 'HUELVA'],
  ['63', 'unia', 'INTERNACIONAL DE ANDALUCIA'],
  ['50', 'ujaen', 'JAÉN'],
  ['11', 'uma', 'MÁLAGA'],
  ['58', 'upo', 'PABLO DE OLAVIDE'],
  ['17', 'us', 'SEVILLA'],
].map(([codigo, id, nombre]) => ({ codigo, id, nombre }));

const norm = (value) => htmlText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
const universityByName = new Map(UNIVERSITIES.map((u) => [norm(u.nombre), u.id]));

function modalityFromName(name) {
  const n = norm(name);
  if (/\(\s*A DISTANCIA\s*\)/.test(n)) return 'online';
  if (/\(\s*SEMIPRESENCIAL\s*\)/.test(n)) return 'hibrida';
  return null;
}

function programFromRow(row) {
  const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
  const codigo = htmlText(cells[0] || '').trim();
  // Códigos do DUA: só números na maioria das universidades; a UNIA usa uma letra na frente (ex.: A04601).
  if (!/^[A-Z]{0,2}\d{4,8}$/i.test(codigo) || cells.length < 3) return null;
  const universidadLabel = htmlText(cells[1] || '').trim();
  const universidadeId = universityByName.get(norm(universidadLabel));
  if (!universidadeId) return null;

  const masterCell = cells[2];
  const nameMarkup = /<div\b[^>]*>([\s\S]*?)<\/div>/i.exec(masterCell)?.[1];
  const nome = htmlText(nameMarkup || masterCell).split('\n').map((s) => s.trim()).filter(Boolean)[0] || '';
  if (!nome) return null;

  // O botão "Visitar Web" usa onclick="window.open('http://…')": a URL vem entre aspas.
  const webMatch = /(?:window\.open\s*\(\s*["']?|href\s*=\s*["'])(https?:\/\/[^"'\s)]+)/i.exec(row);
  const fichaUrl = `https://www.juntadeandalucia.es/economiaconocimientoempresasyuniversidad/sguit/?c_peticion=${encodeURIComponent(codigo)}&d=mo_catalogo_top.php&q=masteres`;
  return {
    id: `dua-${codigo}`,
    codigo,
    universidadeId,
    nome,
    ramos: [],
    cursoCatalogo: null,
    tipoTitulo: 'oficial',
    modalidade: modalityFromName(nome),
    fichaUrl,
    webPropria: webMatch?.[1]?.replace(/^http:/i, 'https:') || null,
    ofertaCondicionada: /prioridad|requisito adicional/i.test(row),
    fonteCatalogo: 'dua-catalogo',
  };
}

export function parse(html, { anoAcademico = null, universidadeId = null } = {}) {
  const text = String(html || '');
  const hasHeader = /C[o\u00f3]digo[\s\S]*?Universidad[\s\S]*?M[a\u00e1]ster/i.test(htmlText(text));
  const countMatch = /<strong\b[^>]*>\s*(\d+)\s*<\/strong>\s*Resultados/i.exec(text);
  const noResults = /No se han encontrado datos que cumplan/i.test(htmlText(text));
  const rows = [...text.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
  const programas = rows.map(programFromRow).filter(Boolean);
  const expected = countMatch ? Number(countMatch[1]) : null;
  const avisos = [];

  if (!hasHeader && !noResults) avisos.push({ tipo: 'extracao-incerta', motivo: 'A resposta do DUA não contém a tabela do catálogo.' });
  if (expected === null && !noResults) avisos.push({ tipo: 'extracao-incerta', motivo: 'Não foi possível confirmar a quantidade de resultados do catálogo DUA.' });
  if (expected !== null && expected !== programas.length) avisos.push({ tipo: 'extracao-incerta', motivo: `O DUA informou ${expected} resultados, mas foram extraídos ${programas.length}.` });
  if (!programas.length && !noResults) avisos.push({ tipo: 'extracao-incerta', motivo: 'Nenhum mestrado foi extraído da resposta do DUA.' });

  const universidadeIds = [...new Set(programas.map((p) => p.universidadeId))];
  const targetUniversidade = universidadeId || (universidadeIds.length === 1 ? universidadeIds[0] : null);
  return {
    ok: (noResults || (hasHeader && expected !== null && expected === programas.length && programas.length > 0)) && avisos.length === 0,
    tipo: 'catalogo',
    ...(targetUniversidade ? { universidadeId: targetUniversidade } : {}),
    ...(universidadeIds.length > 1 ? { universidadeIds } : {}),
    anoAcademico,
    programas: programas.map((p) => ({ ...p, cursoCatalogo: anoAcademico })),
    avisos,
  };
}
