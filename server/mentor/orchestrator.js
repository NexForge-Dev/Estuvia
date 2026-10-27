// Mentor Orchestrator: recebe a mensagem, reúne contexto, escolhe o modo e administra as ferramentas.
//
//   Sem provedor de IA (padrão) → Modo Guiado (guided.js): regras + ferramentas reais.
//   Com provedor                → laço de ferramentas: leituras executam na hora; escritas viram
//                                 UMA proposta que o estudante confirma (actions.js). Se a IA falhar,
//                                 o estudante recebe a resposta do Modo Guiado com um aviso.

import { SYSTEM_PROMPT, MENTOR_NAME, GUIDED_NAME } from './prompt.js';
import { getProvider } from './providers/index.js';
import { recordAI } from '../ai-health.js';
import { guidedReply, QUICK_ACTIONS } from './guided.js';
import { buildContext } from './context.js';
import { catalog, useTool, makeCtx, TOOLS } from './tools/index.js';
import { propose } from './actions.js';
import { can } from './memory.js';

const MAX_STEPS = 6;

export function mode() {
  const p = getProvider();
  return p.disponivel ? { modo: 'ia', nome: MENTOR_NAME, provedor: p.nome } : { modo: 'guiado', nome: GUIDED_NAME, provedor: null };
}

export async function handleMessage(user, { mensagem, acao, contexto = {}, historico = [] }, { signal } = {}) {
  const provider = getProvider();
  if (!provider.disponivel) {
    recordAI('mentor', 'guiado', { user });
    return guidedReply(user, { mensagem, acao, contexto, historico });
  }
  try {
    const reply = await agentReply(provider, user, { mensagem: mensagem || QUICK_ACTIONS.find((q) => q.id === acao)?.mensagem || '', contexto, historico }, signal);
    recordAI('mentor', 'ok', { user });
    return reply;
  } catch (err) {
    if (signal?.aborted) throw err;
    recordAI('mentor', 'erro', { erro: `${provider.id}: ${err.message}`, user });
    console.error(`[mentor] IA indisponível (${provider.id}): ${err.message}`);
    const r = await guidedReply(user, { mensagem, acao, contexto, historico });
    return { ...r, aviso: 'A IA está indisponível agora: respondi pelo Modo Guiado, com os seus dados reais.' };
  }
}

// Resultado de ferramenta → cartão visual (mesmos tipos do Modo Guiado).
function cardFor(name, d) {
  switch (name) {
    case 'get_pending_missions': return { tipo: 'missoes', titulo: 'Missões pendentes', journeyId: d.journeyId, grupos: [{ titulo: 'Atenção', itens: d.atencao }, { titulo: 'Em andamento', itens: d.emAndamento }, { titulo: 'Disponíveis', itens: d.agora }, { titulo: 'Aguardando', itens: d.aguardando }].filter((g) => g.itens.length) };
    case 'get_current_mission': return d.nenhuma ? null : { tipo: 'missao', missao: d };
    case 'get_user_journey': return { tipo: 'jornada', jornada: d };
    case 'propose_weekly_schedule': return { tipo: 'agenda-semana', semana: d.semana, itens: d.proposta, naoAgendadas: d.naoAgendadas, prazos: d.prazos, resumo: d.resumo };
    case 'get_calendar_events': return { tipo: 'eventos', titulo: 'Agenda', eventos: d.eventos, prazos: d.prazos };
    case 'get_financial_summary': return { tipo: 'financas', necessario: Math.max(d.exigenciaVisto.valor, d.orcamento.valor), garantidos: d.garantidos, naoGarantidos: d.naoGarantidos, deficit: d.deficit, exigenciaVisto: d.exigenciaVisto, orcamento: d.orcamento, recursos: d.recursos };
    case 'calculate_financial_gap': return { tipo: 'financas', ...d };
    case 'get_required_documents': return { tipo: 'documentos', itens: d.documentos, consulado: d.consulado, aviso: d.aviso, proximo: d.proximo };
    case 'get_document_guide': return d;
    case 'search_master_programs': return d.programas.length ? { tipo: 'oportunidades', itens: d.programas } : null;
    case 'get_verified_deadlines': return d.oportunidade ? { tipo: 'oportunidades', itens: [d.oportunidade] } : null;
    case 'search_scholarships': return { tipo: 'bolsas', itens: d.bolsas };
    case 'get_housing_options': return d.opcoes.length ? { tipo: 'moradias', itens: d.opcoes, meses: d.meses } : null;
    case 'compare_housing_options': return { tipo: 'moradias', itens: d.comparacao, meses: d.meses, destaque: d.maisBarata };
    case 'get_travel_plan': return { tipo: 'viagem', viagem: d };
    case 'assess_listing_risk': return { tipo: 'riscos', sinais: d.sinais, checklist: d.checklistPendente };
    case 'draft_email': return { tipo: 'email', ...d };
    case 'find_consulate': return d.status === 'sem-estado' ? null : d;
    case 'get_official_sources': return d.trechos.length ? { tipo: 'fontes', trechos: d.trechos } : null;
    case 'search_web': return { tipo: 'web', consulta: d.consulta, consultadoEm: d.consultadoEm, itens: d.itens, falhas: d.falhas, aviso: d.aviso };
    case 'search_videos': return { tipo: 'videos', ...d };
    default: return null;
  }
}

async function agentReply(provider, user, { mensagem, contexto, historico }, signal) {
  const ctx = makeCtx(user, contexto);
  const tools = catalog().filter((t) => can(ctx.user, t.permissao));
  const history = historico.filter((m, i) => !(i === 0 && m.role !== 'user') && m.content?.trim()).slice(-10).map((m) => ({ role: m.role, content: m.content }));
  const messages = [...history, { role: 'user', content: `CONTEXTO DA JORNADA (dados da plataforma; não invente outros):\n${buildContext(ctx.user, contexto, ctx.now)}\n\nMensagem do estudante: ${mensagem}` }];
  const usadas = [];
  const cartoes = [];
  const passos = [];
  const fontes = [];
  let texto = '';

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await provider.chat({ system: SYSTEM_PROMPT, messages, tools, signal });
    if (res.parada === 'refusal') throw new Error('o modelo recusou a mensagem');
    texto = res.texto || texto;
    if (!res.chamadas.length) break;
    messages.push({ role: 'assistant', content: res.texto, chamadas: res.chamadas, bruto: res.bruto });
    const resultados = [];
    for (const c of res.chamadas) {
      const r = c.input?.__invalido ? { ok: false, erro: { codigo: 'entrada', mensagem: 'JSON inválido' } } : await useTool(ctx, c.nome, c.input);
      usadas.push({ nome: c.nome, ok: r.ok, efeito: TOOLS.get(c.nome)?.efeito || null });
      let conteudo;
      if (!r.ok) conteudo = { erro: r.erro };
      else if (r.efeito === 'escrita') {
        passos.push({ ferramenta: c.nome, input: r.input, preview: r.preview });
        conteudo = { proposta_criada: true, resumo: r.preview.resumo, avisos: r.preview.avisos, importante: 'AINDA NÃO EXECUTADO. O estudante vai ver um botão de confirmação. Não diga que foi feito.' };
      } else {
        conteudo = r.dados;
        const card = cardFor(c.nome, r.dados);
        if (card && cartoes.length < 3) cartoes.push(card);
        for (const t of r.dados?.trechos || []) if (t.fonte) fontes.push(t.fonte);
        for (const f of r.dados?.radar?.fontes || []) fontes.push({ titulo: f.titulo, url: f.url });
      }
      resultados.push({ id: c.id, nome: c.nome, conteudo: JSON.stringify(conteudo).slice(0, 12000), erro: !r.ok });
    }
    messages.push({ role: 'tool', resultados });
  }

  const proposta = passos.length ? propose(ctx.user, { titulo: passos.length === 1 ? passos[0].preview.resumo.slice(0, 80) : 'Ações propostas pelo Mentor', passos, contexto }) : null;
  return {
    modo: 'ia', provedor: provider.nome, intencao: 'ia', compreendido: true,
    texto: texto || (proposta ? 'Preparei a ação abaixo. Confirma?' : 'Não consegui montar uma resposta agora.'),
    cartoes, proposta, sugestoes: [], fontes, ferramentas: usadas,
  };
}
