// Conector: ficha de um máster no Distrito Único Andaluz.
// A página pública do catálogo abre a ficha com POST a mo_catalogo_ficha.php (c_peticion = código DUA,
// não o código do ministério). A estrutura é a mesma para as dez universidades públicas andaluzas:
//   DATOS PARTICULARES                     centro, endereço, início/fim, nº de cursos
//   CRITERIOS Y BAREMO ...                 critérios de seleção com peso (%)
//   INFORMACIÓN O REQUISITOS ...           requisitos adicionais; os marcados em vermelho
//                                          (badge-danger) são "de obligado cumplimiento"
//   RELACIÓN ALFABÉTICA DE TITULACIONES    graduações de acesso com preferência Alta/Media/Baja
//   TÍTULOS CON ADMISIÓN CONDICIONADA ...  graduações que exigem um requisito adicional
//   RESTO DE TITULACIONES CON ACCESO       demais graduações aceitas
// Vagas e preço NÃO constam da ficha. O idioma exigido é derivado do texto dos requisitos e sempre
// acompanha o texto original: nunca é apresentado sem a frase oficial que o sustenta.

import { htmlText } from '../http.js';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const text = (fragment) => htmlText(fragment).replace(/\s+/g, ' ').trim();
const PREF = { ALTA: 'alta', MEDIA: 'media', BAJA: 'baixa' };

/** Divide a ficha nos blocos encabeçados por <th class="table-info"> ou <tr class="table-info"><th>. */
function sections(html) {
  const heads = [...html.matchAll(/(?:<th\b[^>]*class="[^"]*table-info[^"]*"[^>]*>|<tr\b[^>]*class="[^"]*table-info[^"]*"[^>]*>\s*<th\b[^>]*>)([\s\S]*?)<\/th>/gi)];
  return heads.map((m, i) => ({
    titulo: norm(text(m[1])),
    corpo: html.slice(m.index + m[0].length, heads[i + 1]?.index ?? html.length),
  }));
}
const section = (all, re) => all.find((s) => re.test(s.titulo))?.corpo || '';

function isoDate(v) {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(v || '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// Linhas de critério/requisito: <span class="badge badge-X">NNN</span> … <div class="col">TEXTO</td> …
function codedItems(corpo) {
  return [...corpo.matchAll(/<span class="badge badge-(\w+)">\s*(\d{3})\s*<\/span>[\s\S]*?<div class="col">([\s\S]*?)<\/td>([\s\S]*?)(?=<span class="badge badge-\w+">\s*\d{3}\s*<\/span>|$)/gi)]
    .map((m) => ({ cor: m[1].toLowerCase(), codigo: m[2], texto: text(m[3]), resto: m[4] }));
}

const IDIOMAS = [
  ['ESPANOLA?|CASTELLANO', 'espanhol'], ['INGLESA?', 'inglês'], ['FRANCESA?', 'francês'], ['ALEMANA?', 'alemão'],
  ['ITALIANA?|ITALIANO', 'italiano'], ['PORTUGUESA?', 'português'], ['ARABE', 'árabe'], ['CHINO', 'chinês'], ['JAPONES', 'japonês'],
];
// Menções que não são exigência de idioma: "título español", "país de habla no española", "universidad española".
const NAO_EXIGENCIA = /(TITULO|TITULACION|UNIVERSIDAD|SISTEMA|HABLA NO|HABLA|PAIS|PAISES)\s+$/;
const CONTEXTO_IDIOMA = /IDIOMA|LENGUA|NIVEL|DOMINIO|CONOCIMIENTO|ACREDIT|MARCO COMUN|MCER/;

/**
 * Idioma exigido, derivado do texto dos requisitos (ex.: "NIVEL DE ESPAÑOL B1"). Para cada idioma, o
 * nível é o do QECR mais próximo da menção ("CHINO NIVEL B1 O JAPONÉS NIVEL A2" → chinês B1, japonês A2).
 * Sem nível no texto ("JUSTIFICACIÓN DEL IDIOMA INGLÉS"), o idioma entra com nível null.
 */
export function languageRequirements(requisitos) {
  const out = [];
  for (const r of requisitos) {
    const t = norm(r.texto);
    if (!CONTEXTO_IDIOMA.test(t)) continue;
    // Requisito não marcado como obrigatório só conta se o texto exigir algo (e não apenas pontuar).
    // ("Deberá tener en cuenta", "es recomendable" e "se valorará" não são exigências.)
    if (!r.obrigatorio && !/EXIGIRA|EXIGE|(ES|SERA) NECESARI|DEBERAN? (ACREDITAR|JUSTIFICAR|POSEER|TENER UN NIVEL)|REQUERIRA|REQUIERE|IMPRESCINDIBLE/.test(t.replace(/NO ES NECESARI\w*|NO SE EXIGE|NO SE REQUIERE/g, ''))) continue;
    const niveis = [...t.matchAll(/\b([ABC][12])\b/g)].map((m) => ({ nivel: m[1], pos: m.index }));
    for (const [chave, idioma] of IDIOMAS) {
      // "ÁRABE/ESPAÑOL" é nome de especialidade (par de línguas), não exigência.
      const mencoes = [...t.matchAll(new RegExp(`\\b(?:${chave})\\b`, 'g'))].filter((m) => !NAO_EXIGENCIA.test(t.slice(Math.max(0, m.index - 20), m.index))
        && t[m.index - 1] !== '/' && t[m.index + m[0].length] !== '/');
      if (!mencoes.length) continue;
      let melhor = null;
      for (const m of mencoes) {
        for (const n of niveis) {
          const dist = Math.abs(n.pos - m.index) + (n.pos < m.index ? 15 : 0); // empate: nível depois do idioma
          if (dist <= 140 && (!melhor || dist < melhor.dist)) melhor = { nivel: n.nivel, dist };
        }
      }
      out.push({ idioma, nivel: melhor?.nivel || null, codigo: r.codigo, obrigatorio: r.obrigatorio, estrangeiros: /EXTRANJER|NO SEA LA LENGUA|NO NATIV|HABLA NO/.test(t), texto: r.texto });
    }
  }
  // Um item por idioma: vale o obrigatório e, entre eles, o que informa nível.
  // Um item por idioma: vale o obrigatório e, entre os obrigatórios, o de nível MAIS ALTO (uma ficha pode ter
  // dois requisitos de espanhol, ex.: B1 e B2; orientar pelo menor seria induzir o estudante ao erro).
  const NIVEIS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const rank = (x) => (x.obrigatorio ? 100 : 0) + (x.nivel ? 10 + NIVEIS.indexOf(x.nivel) : 0);
  return [...out.reduce((m, x) => (!m.has(x.idioma) || rank(x) > rank(m.get(x.idioma)) ? m.set(x.idioma, x) : m), new Map()).values()];
}

function degreeRows(corpo) {
  return [...corpo.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => {
    const cells = [...m[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]);
    if (!cells.length) return null;
    const nome = text(cells[0]);
    if (!nome || /^No se han definido/i.test(nome) || /^No hay titulaciones/i.test(nome)) return null;
    const pref = PREF[norm(text(cells.length > 2 ? cells[1] : ''))] || null;
    const reqCell = cells.length > 2 ? cells[2] : cells[1] || '';
    return { nome, preferencia: pref, requisitos: [...text(reqCell).matchAll(/\d{3}/g)].map((x) => x[0]) };
  }).filter(Boolean);
}

export function parse(html) {
  const src = String(html || '');
  const avisos = [];
  const cab = /<p class="[^"]*bg-warning[^"]*">([\s\S]*?)<\/p>/i.exec(src);
  // Código numérico, ou com letra na frente na UNIA (ex.: "A04601 - ACTIVIDAD FÍSICA PARA LA SALUD (INTERNACIONAL DE ANDALUCIA)").
  const head = /^([A-Z]{0,2}\d+)\s*-\s*(.*?)\s*(?:\(([^()]*)\))?\s*$/i.exec(text(cab?.[1] || ''));
  const codigoDua = head?.[1] || null;
  const titulo = head?.[2] || '';
  if (!cab || !codigoDua) avisos.push({ tipo: 'extracao-incerta', motivo: 'A ficha do DUA não tem o cabeçalho com código e nome do máster.' });
  else if (!titulo) {
    // Código que o DUA não reconhece devolve a ficha em branco ("4312161 -  ()").
    return { ok: false, tipo: 'ficha-dua', dados: null, avisos: [{ tipo: 'extracao-incerta', motivo: `O DUA devolveu a ficha ${codigoDua} em branco (código inexistente ou fora da oferta).` }] };
  }

  const all = sections(src);
  const geral = section(all, /DATOS PARTICULARES/);
  const cell = (label) => text(new RegExp(`<th\\b[^>]*>\\s*${label}\\s*</th>\\s*<td\\b[^>]*>([\\s\\S]*?)(?:</td>|<th\\b)`, 'i').exec(geral)?.[1] || '') || null;

  const baremoCorpo = section(all, /CRITERIOS Y BAREMO/);
  const baremo = codedItems(baremoCorpo).map((c) => ({ codigo: c.codigo, descricao: c.texto, peso: Number((/<td class="text-right">\s*([\d.,]+)\s*<\/td>/i.exec(c.resto)?.[1] || '').replace(',', '.')) || null }));
  const soNota = /No se han definido requisitos que afecten a la calificaci/i.test(htmlText(baremoCorpo));
  if (!baremo.length && !soNota) avisos.push({ tipo: 'extracao-incerta', motivo: 'Critérios de seleção não encontrados na ficha do DUA.' });
  const somaPesos = baremo.reduce((s, c) => s + (c.peso || 0), 0);
  if (baremo.length && Math.round(somaPesos) !== 100) avisos.push({ tipo: 'extracao-incerta', motivo: `Os pesos dos critérios somam ${somaPesos}%, não 100%.` });

  const reqCorpo = section(all, /REQUISITOS Y CRITERIOS ADICIONALES/);
  const requisitos = codedItems(reqCorpo).map((c) => ({ codigo: c.codigo, texto: c.texto, obrigatorio: c.cor === 'danger' }));

  const titulacoes = degreeRows(section(all, /RELACION ALFABETICA DE TITULACIONES/));
  const condicionadas = degreeRows(section(all, /ADMISION CONDICIONADA/));
  const restoComAcesso = degreeRows(section(all, /RESTO DE TITULACIONES/)).map((t) => t.nome);
  if (!/RELACION ALFABETICA DE TITULACIONES/.test(all.map((s) => s.titulo).join('|'))) avisos.push({ tipo: 'extracao-incerta', motivo: 'Lista de titulações de acesso não encontrada na ficha do DUA.' });

  // Linhas genéricas para quem tem título equivalente (ex.: "TITULACIÓN EQUIVALENTE A … GRADUADO …").
  // Quando existem, é por elas que o diploma estrangeiro costuma ser enquadrado.
  // ("GRADO EN LENGUAS EXTRANJERAS" é uma graduação comum, não a linha genérica.)
  const equivalentes = titulacoes.filter((t) => /TITULACION EQUIVALENTE|(TITULO|TITULACION|TITULADOS?|ESTUDIOS) (UNIVERSITARIOS? )?EXTRANJER/.test(norm(t.nome)));
  const orientacoes = [...section(all, /ORIENTACIONES/).matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => text(m[1])).filter((t) => t && !/^Descripci/i.test(t));

  const dados = {
    codigoDua,
    titulo,
    centro: cell('Centro'),
    endereco: cell('Direcci[oó]n'),
    inicioCurso: isoDate(cell('Fecha Inicio')),
    fimCurso: isoDate(cell('Fecha Fin')),
    cursos: Number(cell('N[ºo°] de Cursos')) || null,
    orientacoes,
    baremo,
    somenteNotaExpediente: soNota || (baremo.length === 1 && /NOTA MEDIA/.test(norm(baremo[0].descricao))),
    requisitos,
    idiomasExigidos: languageRequirements(requisitos),
    titulacoes,
    condicionadas,
    restoComAcesso,
    titulacoesEquivalentes: equivalentes,
  };
  return { ok: Boolean(codigoDua && titulo) && !avisos.length, tipo: 'ficha-dua', dados, avisos };
}
