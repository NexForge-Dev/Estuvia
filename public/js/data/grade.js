// Nota média do título estrangeiro → escala espanhola (5 a 10), pela regra do Distrito Único Andaluz.
// Módulo puro (frontend + servidor), sem API externa.
//
// Fonte (O1): Acordo da Comissão do DUA para os másteres 2026/27, título estrangeiro não homologado.
//   Art. 7: "Ce = 5 + 5 x (Co – Cm) / (CM – Cm)"
//     Ce = nota no sistema espanhol; Co = nota de origem; Cm = mínima aprovatória de origem; CM = máxima possível.
//   Art. 4: sem o histórico com a média final OU sem o certificado com a mínima e a máxima da escala,
//     "se considerará la calificación mínima aprobatoria" (equivale a 5 na escala espanhola).
//   Alternativa: anexar a "Declaración de equivalencia de notas medias" do Ministério; ela usa outra conta.

// Escalas mais comuns nos históricos brasileiros. A mínima para aprovação muda de uma universidade para outra:
// por isso ela é sempre informada pelo estudante, nunca presumida.
export const ESCALAS = [
  { id: '0-10', max: 10, rotulo: '0 a 10', minimos: [5, 6, 7] },
  { id: '0-100', max: 100, rotulo: '0 a 100', minimos: [50, 60, 70] },
];
export const NOTA_SEM_ESCALA = 5;

const num = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : NaN);

/**
 * Converte a média pela fórmula do DUA. Devolve { ok: true, valor } (valor com 3 casas, como as notas de
 * corte publicadas) ou { ok: false, erro } com a explicação em português.
 */
export function duaGrade({ nota, max, min }) {
  const co = num(nota); const cm = num(min); const cM = num(max);
  if (![co, cm, cM].every(Number.isFinite)) return { ok: false, erro: 'Informe a média, a nota máxima e a mínima para aprovação.' };
  if (cm < 0 || cM <= cm) return { ok: false, erro: 'A nota máxima da escala precisa ser maior que a mínima para aprovação.' };
  if (co > cM) return { ok: false, erro: `A média não pode passar da nota máxima da escala (${fmtNota(cM)}).` };
  if (co < cm) return { ok: false, erro: `A média ficou abaixo da mínima para aprovação (${fmtNota(cm)}). Confira os valores no histórico e na declaração da escala.` };
  return { ok: true, valor: Math.round((5 + 5 * (co - cm) / (cM - cm)) * 1000) / 1000 };
}

/** Situação da nota do perfil: sem-nota (nada informado), invalida (valores incoerentes) ou calculada. */
export function profileGrade(p = {}) {
  const entrada = { nota: p.notaMedia, max: p.notaMaxima, min: p.notaMinima };
  if ([entrada.nota, entrada.max, entrada.min].every((v) => v == null || v === '')) return { status: 'sem-nota', semEscala: NOTA_SEM_ESCALA };
  const r = duaGrade(entrada);
  return r.ok
    ? { status: 'calculada', valor: r.valor, semEscala: NOTA_SEM_ESCALA, entrada }
    : { status: 'invalida', erro: r.erro, semEscala: NOTA_SEM_ESCALA, entrada };
}

/** 7.5 → "7,50"; inteiros da escala de origem ficam sem casas ("6"). */
export function fmtNota(v, casas) {
  if (!Number.isFinite(v)) return '-';
  const d = casas ?? (Number.isInteger(v) ? 0 : 2);
  return v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: Math.max(d, 2) });
}

/** Critério de seleção que usa a nota média do histórico (ex.: "Nota media del expediente", "Expediente académico"). */
export const usesGrade = (descricao) => /NOTA MEDIA|EXPEDIENTE|NOTA DO HIST|MEDIA DO HIST|HISTORICO ACAD/i
  .test(String(descricao || '').normalize('NFD').replace(/[̀-ͯ]/g, ''));
