// Knowledge Base do Mentor: trechos ("chunks") com metadados de procedência, prontos para RAG.
// Hoje a recuperação é lexical (BM25 simples, sem custo). Para trocar por embeddings, basta
// reimplementar retrieve() mantendo o mesmo formato de chunk — nada mais depende do algoritmo.
//
// Chunk: { id, titulo, texto, natureza, tema, fonte{id,titulo,orgao,url}, orgao, ano, verificadoEm,
//          validade, confirmacao, palavras[] }
//   natureza:    oficial | pratica | experiencia | estimativa
//   confirmacao: confirmado | pendente | orientacao

import { FAQ } from '../content/knowledge.js';
import { SOURCES, sourceById } from '../content/sources.js';
import { ROUNDS } from '../content/rounds.js';
import { DOCUMENTS } from '../content/documents.js';
import { SCHOLARSHIPS, SCHOLARSHIP_STATUS } from '../content/scholarships.js';
import { CITY_GUIDES, CONSULATES, UF_NOMES } from '../content/places.js';
import { GLOSSARY } from '../../public/js/glossary.js';

export const NATUREZA_LABEL = {
  oficial: 'Informação oficial',
  pratica: 'Orientação prática da Estuvia',
  experiencia: 'Experiência de quem criou a Estuvia',
  estimativa: 'Estimativa',
};

export const normalize = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const STOP = new Set('a o os as de da do das dos e em no na nos nas um uma para por com que se eu meu minha me mim sobre como qual quais e o ao aos pra pro isso essa esse este esta ja tem ter ser sou estou voce vc mais muito'.split(' '));
export const tokens = (s) => normalize(s).split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOP.has(t));

const fonteDe = (id) => {
  const s = sourceById(id);
  return s ? { id: s.id, titulo: s.titulo, orgao: s.orgao, url: s.url || null, revisadoEm: s.revisadoEm } : null;
};
const naturezaDaFonte = (id, tag) => (id === 'M' ? 'experiencia' : tag === 'pratica' ? 'pratica' : sourceById(id)?.tipo === 'oficial' || tag === 'verificado' ? 'oficial' : 'pratica');

function buildChunks() {
  const out = [];
  for (const [i, f] of FAQ.entries()) {
    const fid = f.fontes[0];
    const src = fonteDe(fid);
    out.push({
      id: `faq:${i}`, tema: 'faq', titulo: f.q, texto: f.a, natureza: naturezaDaFonte(fid, f.tag),
      fonte: src, fontes: f.fontes, orgao: src?.orgao || null, ano: null, verificadoEm: src?.revisadoEm || null,
      validade: null, confirmacao: f.tag === 'verificado' ? 'confirmado' : f.tag === 'pendente' ? 'pendente' : 'orientacao',
      palavras: f.keywords || [],
    });
  }
  // Missões: só o nível de "prévia" (resumo, objetivo, porquê). O passo a passo fica na missão desbloqueada.
  for (const r of ROUNDS) {
    for (const m of r.missoes) {
      const fid = (m.fontes || [])[0];
      out.push({
        id: `missao:${m.id}`, tema: 'jornada', missaoId: m.id, rodada: r.numero,
        titulo: `Missão ${m.id} — ${m.titulo}`, texto: [m.resumo, m.objetivo, m.porque].filter(Boolean).join(' '),
        natureza: m.tag === 'verificado' ? 'oficial' : fid === 'M' ? 'experiencia' : 'pratica', fonte: fonteDe(fid), fontes: m.fontes || [],
        orgao: fonteDe(fid)?.orgao || null, ano: null, verificadoEm: fonteDe(fid)?.revisadoEm || null, validade: null,
        confirmacao: m.tag === 'verificado' ? 'confirmado' : m.tag === 'pendente' ? 'pendente' : 'orientacao', palavras: [],
      });
    }
  }
  for (const d of DOCUMENTS) {
    out.push({
      id: `documento:${d.id}`, tema: 'documentos', documentoId: d.id, titulo: d.nome, texto: `${d.dica} Finalidade: ${d.finalidade}. Exigência: ${d.exigencia}.`,
      natureza: d.fonte === 'M' ? 'experiencia' : 'pratica', fonte: fonteDe(d.fonte), fontes: [d.fonte], orgao: fonteDe(d.fonte)?.orgao || null,
      ano: null, verificadoEm: fonteDe(d.fonte)?.revisadoEm || null, validade: null, confirmacao: d.exigencia === 'requerido' ? 'confirmado' : 'orientacao', palavras: [],
    });
  }
  for (const g of GLOSSARY) {
    out.push({ id: `glossario:${normalize(g.termo)}`, tema: 'glossario', termo: g.termo, titulo: `O que é ${g.termo}?`, texto: g.texto, natureza: 'pratica', fonte: null, fontes: [], orgao: null, ano: null, verificadoEm: null, validade: null, confirmacao: 'orientacao', palavras: [g.termo] });
  }
  for (const s of SCHOLARSHIPS) {
    out.push({
      id: `bolsa:${s.id}`, tema: 'bolsas', bolsaId: s.id, titulo: `${s.nome} (${s.entidade})`, texto: `${s.elegibilidade} ${s.abrangencia} Situação: ${SCHOLARSHIP_STATUS[s.status]}.`,
      natureza: 'pratica', fonte: fonteDe(s.fonte), fontes: [s.fonte], orgao: s.entidade, ano: null, verificadoEm: fonteDe(s.fonte)?.revisadoEm || null,
      validade: s.prazo || null, confirmacao: s.status === 'aberta' ? 'confirmado' : 'pendente', palavras: s.tags || [],
    });
  }
  for (const g of Object.values(CITY_GUIDES)) {
    for (const sec of g.secoes) {
      out.push({ id: `cidade:${normalize(g.cidade)}:${normalize(sec.titulo)}`, tema: 'chegada', titulo: `${g.cidade} — ${sec.titulo}`, texto: sec.itens.join(' '), natureza: g.fonte === 'M' ? 'experiencia' : 'pratica', fonte: fonteDe(g.fonte), fontes: [g.fonte], orgao: null, ano: null, verificadoEm: fonteDe(g.fonte)?.revisadoEm || null, validade: null, confirmacao: 'orientacao', palavras: [g.cidade] });
    }
  }
  for (const c of CONSULATES) {
    const fonte = fonteDe(c.fonte) || { id: `consulado:${c.id}`, titulo: 'Demarcação consular', orgao: c.nome, url: c.demarcacaoUrl, revisadoEm: c.verificadoEm };
    out.push({ id: `consulado:${c.id}`, tema: 'visto', titulo: c.nome, texto: `Atende quem mora em: ${c.estadosConfirmados.map((uf) => UF_NOMES[uf]).join(', ')}. ${c.emailVistos ? `E-mail de vistos: ${c.emailVistos}.` : `E-mail: ${c.emailContato}.`} Visto de estudos: ${c.vistoEstudosUrl}.`, natureza: 'oficial', fonte, fontes: c.fonte ? [c.fonte] : [], orgao: c.nome, ano: null, verificadoEm: c.verificadoEm, validade: null, confirmacao: 'confirmado', palavras: ['consulado', ...c.estadosConfirmados, ...c.estadosConfirmados.map((uf) => normalize(UF_NOMES[uf]))] });
  }
  for (const s of SOURCES.filter((x) => x.url)) {
    out.push({ id: `fonte:${s.id}`, tema: 'fontes', titulo: `${s.orgao} — ${s.titulo}`, texto: `Fonte cadastrada pela Estuvia: ${s.titulo}.`, natureza: s.tipo === 'oficial' ? 'oficial' : 'pratica', fonte: fonteDe(s.id), fontes: [s.id], orgao: s.orgao, ano: null, verificadoEm: s.revisadoEm, validade: null, confirmacao: s.pendente ? 'pendente' : 'confirmado', palavras: [] });
  }
  return out;
}

let CHUNKS = buildChunks();
const extra = [];

/** Permite acrescentar documentos (ex.: manual completo, guias) sem mudar o código do Mentor. */
export function registerKnowledge(chunks) {
  for (const c of chunks) {
    if (!c.id || !c.titulo || !c.texto || !NATUREZA_LABEL[c.natureza]) throw new Error(`Chunk inválido: ${c.id}`);
    extra.push({ fontes: [], palavras: [], confirmacao: 'orientacao', ...c });
  }
  index = null;
}

export const allChunks = () => [...CHUNKS, ...extra];

// ---------- Recuperação (BM25) ----------
let index = null;
function buildIndex() {
  const docs = allChunks().map((c) => {
    const toks = [...tokens(c.titulo), ...tokens(c.titulo), ...tokens(c.texto), ...c.palavras.flatMap((p) => [...tokens(p), ...tokens(p)])];
    const tf = new Map();
    toks.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
    return { c, tf, len: toks.length };
  });
  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  const avg = docs.reduce((s, d) => s + d.len, 0) / Math.max(1, docs.length);
  return { docs, df, avg, n: docs.length };
}

/** Busca trechos relevantes. Retorna [{ chunk, score }] em ordem decrescente. */
export function retrieve(query, { k = 3, temas = null, min = 1.2 } = {}) {
  index ??= buildIndex();
  const q = [...new Set(tokens(query))];
  if (!q.length) return [];
  const k1 = 1.4;
  const b = 0.7;
  const scored = [];
  for (const d of index.docs) {
    if (temas && !temas.includes(d.c.tema)) continue;
    let s = 0;
    let hits = 0;
    for (const t of q) {
      const f = d.tf.get(t);
      if (!f) continue;
      hits += 1;
      const idf = Math.log(1 + (index.n - index.df.get(t) + 0.5) / (index.df.get(t) + 0.5));
      s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / index.avg)));
    }
    // cobertura = fração dos termos da pergunta presentes no trecho (evita respostas por uma palavra solta)
    if (s >= min) scored.push({ chunk: d.c, score: Number(s.toFixed(3)), cobertura: Number((hits / q.length).toFixed(2)) });
  }
  return scored.sort((a, b2) => b2.score - a.score).slice(0, k);
}

export function glossaryTerm(text) {
  return GLOSSARY.find((g) => g.re.test(text)) || null;
}

/** Visão pública de um chunk (para cards e para a IA). */
export const publicChunk = (c) => ({
  id: c.id, titulo: c.titulo, texto: c.texto, natureza: c.natureza, naturezaLabel: NATUREZA_LABEL[c.natureza],
  fonte: c.fonte, orgao: c.orgao, ano: c.ano, verificadoEm: c.verificadoEm, validade: c.validade, confirmacao: c.confirmacao,
});
