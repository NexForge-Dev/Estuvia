// Fontes, rascunhos de e-mail, memória e o catálogo do que o Mentor NÃO pode fazer.
import { z } from 'zod';
import { computeJourney } from '../../journey-engine.js';
import { consulateForState, consulateResult, CONSULATE_LIST_URL, UF_NOMES } from '../../content/places.js';
import { retrieve, publicChunk } from '../knowledge.js';
import { addNote, resolveNote, openNotes } from '../memory.js';
import { defineTool, ToolError, pickJourney } from './core.js';
import { matchDocument } from '../parse.js';

export const getOfficialSources = defineTool({
  name: 'get_official_sources', efeito: 'leitura', permissao: null,
  descricao: 'Busca na base de conhecimento da Estuvia (FAQ verificada, missões, documentos, glossário, bolsas, guias de cidade, consulados, fontes oficiais). Cada trecho diz se é informação oficial, orientação prática, experiência do idealizador ou estimativa, com fonte e data de verificação.',
  entrada: z.object({ pergunta: z.string().min(2).max(500), temas: z.array(z.enum(['faq', 'jornada', 'documentos', 'glossario', 'bolsas', 'chegada', 'visto', 'fontes'])).optional(), limite: z.number().int().min(1).max(6).default(3) }).strict(),
  saida: '{ trechos[{ id, titulo, texto, natureza, naturezaLabel, fonte, verificadoEm, confirmacao }], encontrou }',
  run: (ctx, { pergunta, temas, limite }) => {
    const r = retrieve(pergunta, { k: limite, temas });
    return { trechos: r.map((x) => ({ ...publicChunk(x.chunk), relevancia: x.score })), encontrou: r.length > 0 };
  },
});

// ---------- Consulado (base verificada de jurisdições; nunca palpite) ----------

export const findConsulate = defineTool({
  name: 'find_consulate', efeito: 'leitura', permissao: null,
  descricao: 'Identifica o consulado da Espanha que atende o estudante (visto de estudos) pela base verificada de jurisdições consulares: estado de residência no Brasil → repartição, com e-mail, endereço, página oficial do visto de estudos, fonte e data de verificação. Sem estado informado usa o do perfil. Se o estado não estiver na base, devolve status "nao-confirmado" e o procedimento oficial, não deduza o consulado por conta própria.',
  entrada: z.object({ estado: z.enum(Object.keys(UF_NOMES)).optional() }).strict(),
  saida: '{ tipo: "consulado", status: encontrado|nao-confirmado|sem-estado|fora-do-brasil, estado{uf,nome}, consulado{nome,cidade,uf,endereco,telefone,email,emailRotulo,vistoEstudosUrl}, fonte{orgao,url,verificadoEm}, procedimento? }',
  run: (ctx, { estado }) => {
    const p = ctx.user.profile || {};
    return consulateResult(estado || p.estado, { pais: estado ? 'Brasil' : p.paisResidencia || 'Brasil' });
  },
});

// ---------- Rascunhos de e-mail (nunca enviados pela Estuvia) ----------

const DESTINOS = ['coordenador', 'professor', 'universidade', 'consulado'];

export function emailDraft(user, programaNome, { destinatario, duvida }) {
  const p = user.profile || {};
  const nome = p.nome || '[su nombre]';
  const programa = programaNome || '[nombre del máster]';
  const formacion = p.formacao ? `graduado/a en ${p.formacao}${p.instituicao ? ` por la ${p.instituicao}` : ''}` : '[su formación]';
  const pergunta = duvida?.trim() || '[escriba aquí su duda concreta]';
  if (destinatario === 'consulado') {
    const c = consulateForState(p.estado);
    return {
      para: c?.emailVistos || c?.emailContato ? `${c.emailVistos || c.emailContato} (confira no site oficial antes de enviar)` : `[e-mail do consulado, consulte ${CONSULATE_LIST_URL}]`,
      assunto: 'Consulta sobre visado de estudios, documentación',
      corpo: `Estimados/as señores/as:\n\nMe llamo ${nome}, soy de nacionalidad ${p.nacionalidade || 'brasileña'} y resido en ${p.estado ? `${p.estado}, ` : ''}${p.paisResidencia || 'Brasil'}. He sido admitido/a (o estoy en proceso de admisión) en el ${programa} y voy a solicitar un visado de estudios.\n\nQuisiera confirmar:\n1. La lista de documentos exigidos en mi caso.\n2. Si los documentos brasileños necesitan apostilla y traducción jurada.\n3. Cómo se solicita la cita y cuál es la tasa vigente.\n${duvida ? `4. ${pergunta}\n` : ''}\nMuchas gracias por su atención.\n\nAtentamente,\n${nome}`,
      dicas: ['Uma pergunta clara por item ajuda a receber resposta.', 'Não envie cópia de passaporte nem dados bancários por e-mail sem que o consulado peça.'],
    };
  }
  const saud = destinatario === 'universidade' ? 'Estimados/as señores/as:' : 'Estimado/a profesor/a [apellido]:';
  return {
    para: destinatario === 'universidade' ? '[e-mail da secretaria ou do serviço internacional, na página oficial]' : '[e-mail institucional encontrado na página oficial do máster]',
    assunto: `Consulta sobre el ${programa}`,
    corpo: `${saud}\n\nMe llamo ${nome} y soy ${formacion} (${p.paisResidencia || 'Brasil'}). Estoy interesado/a en el ${programa} y voy a presentar mi solicitud a través del Distrito Único Andaluz.\n\nQuisiera consultarle lo siguiente: ${pergunta}\n\nMuchas gracias por su atención.\n\nAtentamente,\n${nome}`,
    dicas: ['Uma dúvida específica tem mais chance de resposta do que uma mensagem genérica.', 'Use o e-mail que aparece na página oficial do mestrado; não invente endereços.'],
  };
}

export const draftEmail = defineTool({
  name: 'draft_email', efeito: 'rascunho', permissao: null,
  descricao: 'Prepara um rascunho de e-mail em espanhol (coordenador, professor, universidade ou consulado) com os dados da jornada. A Estuvia não envia e-mails: o estudante revisa, copia e envia pelo próprio e-mail.',
  entrada: z.object({ destinatario: z.enum(DESTINOS), duvida: z.string().max(500).optional(), journeyId: z.string().max(60).optional() }).strict(),
  saida: '{ para, assunto, corpo, dicas[], enviado: false }',
  run: (ctx, input) => {
    const jr = pickJourney(ctx.user, input.journeyId || ctx.contexto.journeyId);
    const r = emailDraft(ctx.user, jr ? computeJourney(ctx.user, jr).destino.programa?.nome : null, input);
    return { ...r, enviado: false, aviso: 'Rascunho: nada foi enviado. Revise e envie pelo seu e-mail.' };
  },
});

// ---------- Memória (pendências que o estudante contou) ----------

export const rememberNote = defineTool({
  name: 'remember_note', efeito: 'escrita', permissao: 'memoria',
  descricao: 'Guarda uma pendência curta que o estudante contou (ex.: "não consegui o histórico"), para retomar depois sem que ele precise repetir. Não guarde dados sensíveis.',
  entrada: z.object({ texto: z.string().trim().min(3).max(200), documentoId: z.string().max(40).optional(), missaoId: z.string().regex(/^\d\.\d{1,2}$/).optional(), journeyId: z.string().max(60).optional() }).strict(),
  saida: '{ resumo, nota }',
  preview: (ctx, input) => {
    if (/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|passaporte n|senha|cart[aã]o \d/i.test(input.texto)) throw new ToolError('sensivel', 'Esse texto parece ter um dado sensível. Não vou guardá-lo.');
    return { resumo: `Lembrar: "${input.texto}".`, detalhes: [], avisos: ['Você pode ver e apagar o que eu lembro em "O que o Mentor sabe".'] };
  },
  execute: async (ctx, input) => {
    const doc = input.documentoId ? null : matchDocument(input.texto);
    const nota = await addNote(ctx.user.id, { ...input, ...(doc ? { documentoId: doc.id } : {}) });
    return { resumo: 'Anotado. Quando você voltar a falar disso, eu retomo de onde paramos.', dados: { nota } };
  },
});

export const resolveNoteTool = defineTool({
  name: 'resolve_note', efeito: 'escrita', permissao: 'memoria',
  descricao: 'Marca como resolvida uma pendência guardada.',
  entrada: z.object({ notaId: z.string().max(60) }).strict(),
  saida: '{ resumo }',
  preview: (ctx, { notaId }) => {
    const n = openNotes(ctx.user).find((x) => x.id === notaId);
    if (!n) throw new ToolError('nao-encontrada', 'Pendência não encontrada.', 404);
    return { resumo: `Marcar como resolvida: "${n.texto}".`, detalhes: [], avisos: [] };
  },
  execute: async (ctx, { notaId }) => {
    const n = await resolveNote(ctx.user.id, notaId);
    return { resumo: n ? `Resolvido: "${n.texto}".` : 'Nada a resolver.', dados: {} };
  },
});

// ---------- O que ainda NÃO existe (o Mentor explica e oferece a alternativa) ----------
export const UNAVAILABLE = [
  { name: 'send_email', motivo: 'A Estuvia não tem integração de envio de e-mail.', alternativa: 'Preparo o rascunho; você copia e envia pelo seu e-mail.' },
  { name: 'submit_official_application', motivo: 'Candidaturas, matrículas e pedidos de visto são feitos só nos canais oficiais.', alternativa: 'Te guio passo a passo e registro o comprovante na missão.' },
  { name: 'book_official_appointment', motivo: 'Não acesso sistemas de cita previa nem do consulado.', alternativa: 'Coloco um lembrete na sua agenda para você agendar no site oficial.' },
  { name: 'make_payment', motivo: 'Nunca faço pagamentos.', alternativa: 'Mostro o valor estimado e onde pagar pelo canal oficial.' },
  { name: 'upload_document', motivo: 'Não envio documentos a universidades ou órgãos.', alternativa: 'Atualizo a situação do documento no seu checklist.' },
  { name: 'search_housing_web', motivo: 'Não busco anúncios na internet.', alternativa: 'Salvo e comparo as opções que você encontrar e aponto sinais de risco.' },
];

export default [getOfficialSources, findConsulate, draftEmail, rememberNote, resolveNoteTool];
