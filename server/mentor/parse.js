// Interpretação determinística de mensagens em português (Modo Guiado e validação de propostas):
// datas relativas, horários, valores em dinheiro e correspondência com missões, documentos e eventos.

import { normalize, tokens } from './knowledge.js';
import { DOCUMENTS } from '../content/documents.js';
import { allMissions, missionLabel } from '../content/rounds.js';

export const todayIn = (tz = 'America/Sao_Paulo', now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
export const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const weekday = (iso) => ((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7) + 1; // 1 = segunda
const WEEKDAYS = { segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6, domingo: 7 };
const WD_LABEL = ['', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'];
const MONTHS = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };

export const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
export const dateLabel = (iso, today) => {
  if (iso === today) return `hoje (${fmtDate(iso).slice(0, 5)})`;
  if (iso === addDays(today, 1)) return `amanhã (${fmtDate(iso).slice(0, 5)})`;
  return `${WD_LABEL[weekday(iso)]} (${fmtDate(iso).slice(0, 5)})`;
};
export const timeLabel = (t) => (t.endsWith(':00') ? `${Number(t.slice(0, 2))}h` : `${Number(t.slice(0, 2))}h${t.slice(3)}`);

/** Data mencionada na mensagem → ISO, ou null. Datas passadas (sem ano) avançam para o próximo ano. */
export function parseDate(text, today) {
  const t = normalize(text);
  if (/\bdepois de amanha\b/.test(t)) return addDays(today, 2);
  if (/\bamanha\b/.test(t)) return addDays(today, 1);
  if (/\bhoje\b/.test(t)) return today;
  const wd = /\b(segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira| feira)?\b/.exec(t);
  if (wd) {
    const target = WEEKDAYS[wd[1]];
    // Próxima ocorrência do dia; "sexta" dito numa sexta significa a da semana seguinte.
    if (/\bda (semana que vem|proxima semana)\b/.test(t)) return addDays(today, 8 - weekday(today) + target - 1);
    return addDays(today, (target - weekday(today) + 7) % 7 || 7);
  }
  const dm = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(t);
  if (dm) return fromParts(Number(dm[1]), Number(dm[2]), dm[3], today);
  const ext = /\b(?:dia )?(\d{1,2}) de (janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?: de (\d{4}))?\b/.exec(t);
  if (ext) return fromParts(Number(ext[1]), MONTHS[ext[2]], ext[3], today);
  const dia = /\bdia (\d{1,2})\b/.exec(t);
  if (dia) {
    const [y, m] = today.split('-').map(Number);
    let iso = fromParts(Number(dia[1]), m, String(y), today);
    if (iso && iso < today) iso = fromParts(Number(dia[1]), m === 12 ? 1 : m + 1, String(m === 12 ? y + 1 : y), today);
    return iso;
  }
  if (/\bproxima semana|semana que vem\b/.test(t)) return addDays(today, 8 - weekday(today));
  return null;
}

function fromParts(d, m, y, today) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  let year = y ? Number(y.length === 2 ? `20${y}` : y) : Number(today.slice(0, 4));
  let iso = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (new Date(`${iso}T12:00:00Z`).getUTCDate() !== d) return null;
  if (!y && iso < today) { year += 1; iso = `${year}-${iso.slice(5)}`; }
  return iso;
}

/** Horário mencionado ("10h", "10h30", "às 14:00", "9 da manhã") → "HH:MM", ou null. */
export function parseTime(text) {
  const t = normalize(text);
  const m = /\b(?:as |a partir das )?([01]?\d|2[0-3])(?:h|:)([0-5]\d)?\b/.exec(t) || /\b([01]?\d|2[0-3]) (?:da manha|da tarde|da noite|horas)\b/.exec(t);
  if (!m) return null;
  let h = Number(m[1]);
  if (/da tarde|da noite/.test(t) && h < 12) h += 12;
  return `${String(h).padStart(2, '0')}:${m[2] || '00'}`;
}

export const addMinutes = (time, min) => { const v = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + min; return `${String(Math.min(23, Math.floor(v / 60))).padStart(2, '0')}:${String(v >= 24 * 60 ? 59 : v % 60).padStart(2, '0')}`; };
export const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Valor em dinheiro ("€2.000", "2000 euros", "R$ 3.500,50", "3 mil") → { valor, moeda } ou null. */
export function parseMoney(text) {
  const t = String(text || '');
  const re = /(R\$|€|EUR\b)?\s*(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:,(\d{1,2}))?\s*(mil\b)?\s*(reais|euros?|EUR\b|€)?/gi;
  for (const m of t.matchAll(re)) {
    const prefix = (m[1] || '').toUpperCase();
    const suffix = (m[5] || '').toLowerCase();
    if (!prefix && !suffix && !m[4]) continue; // número solto (ex.: "dia 12") não é dinheiro
    let valor = Number(m[2].replace(/[.\s]/g, '')) + (m[3] ? Number(m[3]) / 100 : 0);
    if (m[4]) valor *= 1000;
    const moeda = prefix === 'R$' || suffix === 'reais' ? 'BRL' : 'EUR';
    if (valor > 0) return { valor, moeda };
  }
  return null;
}

// ---------- Correspondência com o domínio ----------

// Palavras do dia a dia → documento cadastrado.
const DOC_WORDS = {
  passaporte: ['passaporte'],
  diploma: ['diploma'],
  historico: ['historico', 'boletim academico', 'notas da faculdade'],
  'escala-notas': ['escala de notas'],
  'acesso-pos': ['acesso a pos', 'declaracao de acesso'],
  idioma: ['certificado de espanhol', 'dele', 'siele', 'certificado de idioma'],
  especificos: ['curriculo', 'cv', 'carta de motivacao', 'carta de recomendacao'],
  'comprovante-dua': ['comprovante do dua', 'comprovante de envio', 'comprovante da candidatura'],
  'comprovante-pagamento': ['comprovante de pagamento', 'comprovante da matricula'],
  admissao: ['carta de admissao', 'carta de aceite'],
  meios: ['extrato', 'comprovacao financeira', 'meios economicos'],
  'apoio-familiar': ['declaracao de apoio', 'documentos do apoiador', 'documentacao do apoiador'],
  'carta-bolsa': ['carta da bolsa', 'carta de concessao'],
  seguro: ['seguro saude', 'seguro'],
  antecedentes: ['antecedentes'],
  atestado: ['atestado medico', 'atestado'],
  formulario: ['formulario do visto', 'formulario', 'fotos'],
  traducoes: ['traducao', 'traducoes', 'apostila', 'apostilamento'],
};

export function matchDocument(text) {
  const t = normalize(text);
  let best = null;
  for (const [id, words] of Object.entries(DOC_WORDS)) {
    for (const w of words) if (new RegExp(`\\b${w}\\b`).test(t) && (!best || w.length > best.len)) best = { id, len: w.length };
  }
  return best ? DOCUMENTS.find((d) => d.id === best.id) : null;
}

// Missão principal de cada documento (a que o estudante "prepara").
const DOC_MISSION = { passaporte: '2.1', diploma: '2.2', historico: '2.3', 'escala-notas': '2.4', 'acesso-pos': '2.4', idioma: '2.5', especificos: '2.6', 'comprovante-dua': '3.7', 'comprovante-pagamento': '4.5', admissao: '4.6', meios: '5.4', seguro: '5.5', antecedentes: '5.6', atestado: '5.6', traducoes: '5.6', formulario: '5.7', 'apoio-familiar': '9.8', 'carta-bolsa': '9.8' };
export const missionForDocument = (docId) => DOC_MISSION[docId] || null;

const TOPIC_MISSION = [
  [/\bvisto\b/, '5.7'], [/\bconsulado\b/, '5.1'], [/\bseguro\b/, '5.5'], [/\bdua\b|candidatura|inscricao/, '3.6'], [/\bmoradia|quarto|apartamento|aluguel\b/, '6.1'],
  [/\bpassage(m|ns)|voo\b/, '6.3'], [/\btie\b/, '8.1'], [/\bempadronamiento\b/, '7.9'], [/\bbolsa\b/, '9.4'], [/\borcamento\b/, '9.1'], [/\bcoordenador|professor\b/, '3.8'],
];

const GENERIC = new Set(['meu', 'minha', 'meus', 'minhas', 'preparar', 'verificar', 'documentos', 'documentacao', 'missao', 'tarefa', 'organizar', 'identificar', 'acompanhar', 'realizar', 'obter', 'criar']);
const VERBS = new Set(['conferir', 'solicitar', 'encontrar', 'escolher', 'comprar', 'enviar', 'salvar', 'consultar', 'contratar', 'comprovar', 'pesquisar', 'calcular', 'registrar', 'chegar', 'ativar', 'localizar', 'conhecer', 'retirar', 'comparecer', 'selecionar', 'anexar', 'acessar', 'explorar', 'revisar']);
const SYNONYMS = { pedir: 'solicitar', pedido: 'solicitar', tirar: 'solicitar', checar: 'conferir', revisar: 'conferir', quarto: 'moradia', apartamento: 'moradia', aluguel: 'moradia', passagem: 'passagens', voo: 'passagens' };

/** Missão citada: "Missão 2.3", título parecido, documento ou tema. */
export function matchMission(text, missions = allMissions()) {
  const t = normalize(text);
  const byId = /\bmiss(?:ao|oes)?\s*(\d)\.(\d{1,2})\b/.exec(t) || /\b(\d)\.(\d{1,2})\b/.exec(t);
  if (byId) {
    const m = missions.find((x) => x.id === `${byId[1]}.${byId[2]}`);
    if (m) return m;
  }
  const doc = matchDocument(text);
  if (doc && missionForDocument(doc.id)) return missions.find((x) => x.id === missionForDocument(doc.id)) || null;
  const words = new Set(tokens(text).map((w) => SYNONYMS[w] || w));
  let best = null;
  for (const m of missions) {
    // Palavras genéricas ("documentos", "preparar"…) não identificam uma missão sozinhas.
    const tt = tokens(m.titulo).filter((w) => !GENERIC.has(w));
    if (!tt.length) continue;
    const common = tt.filter((w) => words.has(w));
    if (common.every((w) => VERBS.has(w))) continue; // só o verbo em comum ("conferir") não basta
    const hit = common.length;
    // Mais palavras em comum vence; empate → maior fração do título.
    if (hit && (!best || hit > best.hit || (hit === best.hit && hit / tt.length > best.s))) best = { m, s: hit / tt.length, hit };
  }
  if (best && (best.s >= 0.5 || best.hit >= 2)) return best.m;
  const topic = TOPIC_MISSION.find(([re]) => re.test(t));
  return topic ? missions.find((x) => x.id === topic[1]) || null : null;
}

/** Evento da agenda citado pelo título (ou pela missão). */
export function matchEvent(text, events, mission) {
  if (mission) {
    const e = events.find((x) => x.missaoId === mission.id);
    if (e) return e;
  }
  const words = new Set(tokens(text));
  let best = null;
  for (const e of events) {
    const tt = tokens(e.titulo);
    const hit = tt.filter((w) => words.has(w)).length;
    if (hit && (!best || hit > best.hit)) best = { e, hit };
  }
  return best && best.hit >= 1 ? best.e : null;
}

export { missionLabel };
