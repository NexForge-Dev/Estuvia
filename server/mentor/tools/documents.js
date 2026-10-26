// Ferramentas de documentos. "Pronto" é a organização do estudante: não significa validação
// pela universidade ou pelo consulado.
import { z } from 'zod';
import { users } from '../../store.js';
import { computeJourney } from '../../journey-engine.js';
import { DOCUMENTS, DOC_STATUS, DOC_STATUS_LABEL } from '../../content/documents.js';
import { missionById, missionLabel } from '../../content/rounds.js';
import { sourceById } from '../../content/sources.js';
import { consulateForState } from '../../content/places.js';
import { defineTool, ToolError, pickJourney, flatMissions } from './core.js';
import { docContext, docView, docById, dashboard } from '../../document-engine.js';

const DONE = new Set(['pronto', 'enviado', 'nao-se-aplica']);
const FINALIDADE = { dua: 'Candidatura (DUA)', visto: 'Visto', financiamento: 'Financiamento', viagem: 'Viagem', estadia: 'Vida na Espanha' };

export function requiredDocuments(user, jr, finalidade) {
  const j = jr ? computeJourney(user, jr) : null;
  const usedBy = new Map();
  if (j) {
    for (const m of flatMissions(j).filter((x) => !['nao-aplicavel', 'ignorada'].includes(x.status))) {
      for (const d of missionById(m.id).documentos || []) {
        if (!usedBy.has(d)) usedBy.set(d, []);
        usedBy.get(d).push({ id: m.id, label: missionLabel(m.id), status: m.status });
      }
    }
  }
  // Situação efetiva da carteira (document-engine): "Não necessário" pelo perfil não conta como pendência.
  const dctx = docContext(user, jr);
  return DOCUMENTS.filter((d) => (!finalidade || d.finalidade === finalidade) && (!j || usedBy.has(d.id))).map((d) => {
    const v = docView(d, dctx);
    const status = v.status;
    const src = sourceById(d.fonte);
    return {
      id: d.id, nome: d.nome, finalidade: d.finalidade, finalidadeLabel: FINALIDADE[d.finalidade], exigencia: d.exigencia,
      status, statusLabel: DOC_STATUS_LABEL[status], statusSimples: v.statusLabel, pendente: !DONE.has(status) || v.atencao, dica: d.dica,
      etapa: d.etapa, motivo: v.motivo, alerta: v.alerta, aguardando: v.aguardando, anexos: v.evidencias.anexos, rota: `/documentos/${d.id}`,
      fonte: src ? { id: src.id, titulo: src.titulo, url: src.url || null } : null,
      missoes: (usedBy.get(d.id) || []).map((m) => m.label),
    };
  });
}

export const getRequiredDocuments = defineTool({
  name: 'get_required_documents', efeito: 'leitura', permissao: 'documentos',
  descricao: 'Documentos exigidos pelas missões da jornada, com a situação registrada pelo estudante, a exigência (requerido, condicional, verificar), a fonte e uma dica de como obter. Filtrável por finalidade (dua, visto, financiamento).',
  entrada: z.object({ journeyId: z.string().max(60).optional(), finalidade: z.enum(Object.keys(FINALIDADE)).optional(), somentePendentes: z.boolean().optional() }).strict(),
  saida: '{ documentos[{ id, nome, finalidade, exigencia, status, statusLabel, statusSimples, pendente, dica, etapa, motivo, alerta, anexos, rota, fonte, missoes[] }], pendentes, proximo?{ id, nome, titulo, acao, rota }, etapaAtual, consulado? }',
  run: (ctx, { journeyId, finalidade, somentePendentes }) => {
    const jr = pickJourney(ctx.user, journeyId || ctx.contexto.journeyId);
    let docs = requiredDocuments(ctx.user, jr, finalidade);
    const pend = docs.filter((d) => d.pendente).length;
    if (somentePendentes) docs = docs.filter((d) => d.pendente);
    const c = finalidade === 'visto' ? consulateForState(ctx.user.profile?.estado) : null;
    const dash = dashboard(ctx.user, jr);
    const prox = dash.proximo ? { id: dash.proximo.documento.id, nome: dash.proximo.documento.nome, titulo: dash.proximo.titulo, acao: dash.proximo.acao, rota: `/documentos/${dash.proximo.documento.id}` } : null;
    return { documentos: docs, pendentes: pend, total: docs.length, proximo: prox, etapaAtual: dash.etapaAtual, consulado: c ? { nome: c.nome, site: c.site, vistoEstudosUrl: c.vistoEstudosUrl } : null, aviso: 'A lista que vale é a da fonte oficial (convocatória, ficha do mestrado ou consulado).' };
  },
});

export const updateDocumentStatus = defineTool({
  name: 'update_document_status', efeito: 'escrita', permissao: 'documentos',
  descricao: 'Atualiza a situação de um documento no checklist do estudante (pendente, em-preparacao, pronto, enviado, correcao, nao-se-aplica). Não valida o documento oficialmente.',
  entrada: z.object({ documentoId: z.enum(DOCUMENTS.map((d) => d.id)), status: z.enum(DOC_STATUS) }).strict(),
  saida: '{ resumo, documento{ id, status } }',
  preview: (ctx, { documentoId, status }) => {
    const d = DOCUMENTS.find((x) => x.id === documentoId);
    const atual = ctx.user.documents?.[documentoId] || 'pendente';
    if (atual === status) throw new ToolError('sem-mudanca', `"${d.nome}" já está como ${DOC_STATUS_LABEL[status]}.`, 409);
    return { resumo: `Marcar "${d.nome}" como ${DOC_STATUS_LABEL[status]} (antes: ${DOC_STATUS_LABEL[atual]}).`, detalhes: [], avisos: ['pronto', 'enviado'].includes(status) ? ['Isso organiza o seu checklist; não significa que a universidade ou o consulado validaram o documento.'] : [] };
  },
  execute: async (ctx, { documentoId, status }) => {
    const d = DOCUMENTS.find((x) => x.id === documentoId);
    ctx.user = await users.update(ctx.user.id, (u) => { u.documents = { ...(u.documents || {}), [documentoId]: status }; });
    return { resumo: `Pronto: "${d.nome}" agora está como ${DOC_STATUS_LABEL[status]}.`, dados: { documento: { id: documentoId, status } } };
  },
});

// Guia de um documento: o que é, como conseguir, situação e fonte. Orientação, não validação: o Mentor não lê arquivos.
export const getDocumentGuide = defineTool({
  name: 'get_document_guide', efeito: 'leitura', permissao: 'documentos',
  descricao: 'Explica um documento da carteira: o que é, se vale para o estudante (pelo mestrado, duração da estada e finanças), como conseguir em passos curtos, situação registrada (declarado/anexado/conferido, sem validar conteúdo), onde é usado e a fonte oficial. Apostila e tradução: só quando a fonte do procedimento exigir. Use para "como consigo meu histórico?", "preciso apostilar?". Nunca afirme que analisou ou validou um arquivo.',
  entrada: z.object({ documentoId: z.enum(DOCUMENTS.map((d) => d.id)), journeyId: z.string().max(60).optional() }).strict(),
  saida: '{ tipo: "documento", id, nome, descricao, exigencia, motivo, status, statusLabel, comoObter[], evidencias, missoes[], fonte, rota, consulado? }',
  run: (ctx, { documentoId, journeyId }) => {
    const jr = pickJourney(ctx.user, journeyId || ctx.contexto.journeyId);
    const dctx = docContext(ctx.user, jr);
    const d = docById(documentoId);
    const v = docView(d, dctx);
    const consul = dctx.consulado.status === 'encontrado' && d.etapa === 'visto' ? { nome: dctx.consulado.consulado.nome, vistoEstudosUrl: dctx.consulado.consulado.vistoEstudosUrl } : null;
    return {
      tipo: 'documento', id: d.id, nome: d.nome, descricao: d.descricao, icone: d.icone, exigencia: v.exigencia, motivo: v.motivo,
      status: v.status, statusLabel: v.statusLabel, aguardando: v.aguardando, alerta: v.alerta, comoObter: d.comoObter || [], acao: d.acao,
      evidencias: { declarado: v.evidencias.declarado, anexos: v.evidencias.anexos, conferido: Boolean(v.evidencias.conferidoEm), aceito: v.evidencias.aceito },
      missoes: v.missoes.map((m) => ({ id: m.id, label: m.label, titulo: m.titulo, status: m.status })),
      fonte: v.fonte, rota: `/documentos/${d.id}`, consulado: consul,
      aviso: 'Orientação da Estuvia: a regra que vale é a da fonte oficial. A Estuvia não analisa nem valida arquivos.',
    };
  },
});

export default [getRequiredDocuments, updateDocumentStatus, getDocumentGuide];
