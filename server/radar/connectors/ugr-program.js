// Conector: ficha oficial de um máster da UGR (masteres.ugr.es/informacion/titulaciones/<slug>).
// Campos observados na "ficha-datos": Curso, Rama de conocimiento, Código del ministerio,
// Créditos ETCS (grafia da página), Código, Coordinador/a, URL. A modalidade aparece por disciplina
// ("Tipo de enseñanza"), por isso é derivada: só afirmamos uma modalidade se todas coincidirem.
// Idioma, vagas e preço NÃO constam da ficha: ficam como "não informado na fonte".

import { htmlText } from '../http.js';
import { parseAcademicYear } from '../dates.js';

function field(html, label) {
  const re = new RegExp(`<span>\\s*${label}\\s*</span>([\\s\\S]*?)</div>\\s*(?:</a>\\s*)?</div>`, 'i');
  const m = re.exec(html);
  return m ? htmlText(m[1]).replace(/\s+/g, ' ').trim() || null : null;
}

const MODALIDADE = { presencial: 'presencial', 'enseñanza virtual': 'online', virtual: 'online', semipresencial: 'hibrida' };

export function parse(html) {
  const avisos = [];
  const ficha = /<div class="ficha-datos">([\s\S]*?)<\/article>/i.exec(html)?.[1] || String(html);
  const curso = parseAcademicYear(field(ficha, 'Curso'));
  if (!curso) avisos.push({ tipo: 'ciclo-inconsistente', motivo: 'A ficha não informa o curso acadêmico.' });

  const creditos = Number(field(ficha, 'Cr[eé]ditos E[CT]{2}S')) || null;
  const url = /<span>\s*URL\s*<\/span>[\s\S]*?href="([^"]+)"/i.exec(ficha)?.[1] || null;

  const tipos = [...String(html).matchAll(/<td class="t_ense">([\s\S]*?)<\/td>/gi)].map((m) => htmlText(m[1]).toLowerCase());
  const distintos = [...new Set(tipos.map((t) => MODALIDADE[t] || t))];
  let modalidade = null;
  if (distintos.length === 1 && ['presencial', 'online', 'hibrida'].includes(distintos[0])) modalidade = distintos[0];
  else if (distintos.length > 1) modalidade = 'hibrida';

  const dados = {
    anoAcademico: curso?.rotulo || null,
    ramo: field(ficha, 'Rama de conocimiento'),
    codigoMinisterio: field(ficha, 'C[oó]digo del ministerio'),
    codigo: field(ficha, 'C[oó]digo'),
    creditos,
    // 60 ECTS ≈ 1 ano acadêmico (regra geral europeia); a duração exata depende do plano de estudos.
    duracaoEstimadaAnos: creditos ? Math.round((creditos / 60) * 10) / 10 : null,
    coordenacao: htmlText(/<span>\s*Coordinador\/a\s*<\/span>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i.exec(ficha)?.[1] || '') || null,
    webPropria: url,
    modalidade,
    modalidadeDerivada: tipos.length ? `Derivada de ${tipos.length} disciplina(s) na ficha` : null,
    idiomaEnsino: null,
    vagasOfertadas: null,
    preco: null,
  };
  if (!dados.codigo) avisos.push({ tipo: 'extracao-incerta', motivo: 'Código do máster não encontrado na ficha.' });
  return { ok: Boolean(curso && dados.codigo), tipo: 'ficha', dados, avisos };
}
