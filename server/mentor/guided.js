// Modo Guiado (Fase 1): o Mentor funciona SEM modelo de linguagem.
// Interpreta a mensagem com regras, consulta as ferramentas reais e monta respostas curtas
// (explicação simples + próxima ação + ajuda adicional). Quando não entende, diz isso claramente.
// Nada aqui é "IA generativa": os textos são modelos preenchidos com os dados da plataforma.

import { normalize, retrieve, publicChunk, glossaryTerm } from './knowledge.js';
import { useTool, makeCtx } from './tools/index.js';
import { UNAVAILABLE } from './tools/knowledge.js';
import { propose } from './actions.js';
import { insights } from './proactive.js';
import { openNotes, mentorState, PERMISSIONS } from './memory.js';
import { parseDate, parseTime, parseMoney, matchDocument, matchMission, matchEvent, missionForDocument, dateLabel, timeLabel, fmtDate } from './parse.js';
import { findSlot, availability, categoryForMission, proposalToItems } from './tools/agenda.js';
import { eur, flatMissions, pickJourney } from './tools/core.js';
import { missionForMentor } from './tools/journey.js';
import { computeJourney } from '../journey-engine.js';
import { missionById } from '../content/rounds.js';
import { UF_NOMES } from '../content/places.js';
import { SCHOLARSHIPS } from '../content/scholarships.js';
import { findPrograms } from '../radar/service.js';
import { resolveContext, quickAnswer } from '../assistant-context.js';
import { GLOSSARY } from '../../public/js/glossary.js';
import { computeTravel, agendaChanges as travelAgendaChanges } from '../travel-engine.js';

// Ações rápidas do painel (o estudante não precisa saber formular a pergunta).
export const QUICK_ACTIONS = [
  { id: 'agora', rotulo: 'O que faço agora?', mensagem: 'O que faço agora?' },
  { id: 'dificuldade', rotulo: 'Estou com dificuldade', mensagem: 'Estou com dificuldade.' },
  { id: 'semana', rotulo: 'Organizar minha semana', mensagem: 'Organize minha semana.' },
  { id: 'documentos', rotulo: 'Ver documentos pendentes', mensagem: 'Quais documentos ainda faltam?' },
  { id: 'orcamento', rotulo: 'Calcular meu orçamento', mensagem: 'Quanto dinheiro falta para eu conseguir ir?' },
  { id: 'bolsas', rotulo: 'Procurar bolsas', mensagem: 'Procure bolsas que aceitam brasileiros.' },
  { id: 'simples', rotulo: 'Explicar mais simples', mensagem: 'Explique mais simples.' },
  { id: 'prazos', rotulo: 'Consultar prazos', mensagem: 'Quais são os meus prazos?' },
  { id: 'novidades', rotulo: 'Novidades na web', mensagem: 'Quais as novidades sobre o meu mestrado?' },
  { id: 'videos', rotulo: 'Vídeos e aulas', mensagem: 'Mostre vídeos que expliquem a minha missão atual.' },
];
const QUICK = Object.fromEntries(QUICK_ACTIONS.map((q) => [q.id, q]));

const msg = (mensagem, rotulo = mensagem) => ({ tipo: 'mensagem', mensagem, rotulo });
const rota = (r, rotulo) => ({ tipo: 'rota', rota: r, rotulo });
const ask = (acao, rotulo) => ({ tipo: 'acao', acao, rotulo });

class Turn {
  constructor(user, { mensagem, contexto, historico }) {
    this.ctx = makeCtx(user, contexto || {});
    this.raw = mensagem;
    this.t = normalize(mensagem);
    this.historico = historico || [];
    this.usadas = [];
  }

  get user() { return this.ctx.user; }
  get jr() { return pickJourney(this.user, this.ctx.contexto.journeyId); }
  journey() { return this.jr ? computeJourney(this.user, this.jr, this.ctx.now) : null; }

  async use(name, input = {}) {
    const r = await useTool(this.ctx, name, input);
    this.usadas.push({ nome: name, ok: r.ok, efeito: r.efeito });
    return r;
  }

  /** Prepara a proposta (prévia validada pelo backend). Retorna { proposta } ou { erro }. */
  async plan(titulo, passos, opts = {}) {
    const prepared = [];
    for (const p of passos) {
      const r = await this.use(p.ferramenta, p.input);
      if (!r.ok) return { erro: r.erro, ferramenta: p.ferramenta };
      prepared.push({ ferramenta: p.ferramenta, input: r.input, preview: r.preview, editavel: p.editavel || null });
    }
    return { proposta: await propose(this.user, { titulo, passos: prepared, contexto: this.ctx.contexto, confirmarRotulo: opts.confirmarRotulo }) };
  }
}

const reply = (turn, intencao, { texto, cartoes = [], proposta = null, sugestoes = [], fontes = [], compreendido = true }) => ({
  modo: 'guiado', intencao, compreendido, texto, cartoes, proposta, sugestoes: sugestoes.filter(Boolean).slice(0, 4), fontes: dedupeSources(fontes), ferramentas: turn.usadas,
});
const dedupeSources = (list) => { const seen = new Set(); return list.filter(Boolean).filter((f) => { const k = f.url || f.titulo; if (!k || seen.has(k)) return false; seen.add(k); return true; }); };
const errorReply = (turn, intencao, erro, extra = {}) => reply(turn, intencao, {
  texto: erro.codigo === 'sem-permissao' ? erro.mensagem : `${erro.mensagem}${extra.dica ? `\n\n${extra.dica}` : ''}`,
  sugestoes: extra.sugestoes || [], cartoes: extra.cartoes || [],
});
const noJourney = (turn, intencao) => reply(turn, intencao, { texto: 'Você ainda não tem uma jornada. Ela é o seu roteiro até a Espanha: escolha o mestrado e eu passo a te acompanhar com base nele.', sugestoes: [rota('/jornadas/nova', 'Criar minha jornada'), msg('Encontre mestrados compatíveis com a minha formação')] });

const has = (t, re) => re.test(t);
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------------------
// Intenções (a primeira que corresponder responde). Ordem importa.
// ---------------------------------------------------------------------------

const INTENTS = [
  // Saudação
  { id: 'saudacao', test: (t) => t.length < 30 && /^(oi|ola|bom dia|boa tarde|boa noite|e ai|hey|opa|tudo bem)\b/.test(t), run: greeting },
  // Anúncio colado pelo estudante: vem antes de tudo (o texto pode conter "reserva", "pague"…)
  { id: 'anuncio-suspeito', test: (t) => /suspeit|golpe|fraude|confiavel|e seguro|parece (real|verdade)|e verdade esse anuncio/.test(t), run: listingRisk },
  // Pedidos que a Estuvia ainda não executa (explicar e oferecer alternativa)
  { id: 'indisponivel', test: (t) => unavailableFor(t), run: unavailable },
  // Pesquisa na web e vídeos (fontes gratuitas, com origem e data). Pedido explícito: não captura "quando começam as aulas".
  { id: 'videos', test: (t) => /\b(videos?|videoaulas?|youtube|tutoria(l|is))\b/.test(t) || (/\baulas?\b.{0,6}\b(sobre|de como|explicando|ensinando|que expliq\w*)\b/.test(t) && !/\b(comec\w*|inicio|inicia\w*)\b/.test(t)), run: videosSearch },
  { id: 'web', test: (t) => /\b(noticias?|novidades?|manchetes?)\b|\b(pesquis|busc|procur)\w* na (web|internet)\b|\bpesquis\w* (sobre|a respeito)\b|\bo que (saiu|ha de novo|tem de novo)\b/.test(t), run: webSearch },
  // Viagem (antes de agenda e finanças: "reorganiza minha viagem", "quanto vou gastar com bagagem")
  { id: 'viagem-mudou', test: (t) => /(passagem|voo|viagem)\b.{0,20}\b(mudou|mudaram|foi alterad\w*|remarcad\w*|cancelad\w*)|reorganiz\w* (a |minha )?viagem/.test(t), run: travelChanged },
  { id: 'viagem-bagagem', test: (t) => /\bbagage(m|ns)\b/.test(t) && /(quanto|custo|custa|gastar|pagar|preco)/.test(t), run: travelBaggage },
  { id: 'viagem-conexao', test: (t) => /\bconex(ao|oes)\b/.test(t) && /(curta|apertada|tempo|perder|da tempo)/.test(t), run: travelConnection },
  { id: 'viagem-chegada', test: (t) => /(do|desde o|saindo do) aeroporto (ate|para|pra)|como (eu )?chego (em|a|ao|na|ate)|chegar do aeroporto|aeroporto (ate|para) (minha )?(casa|moradia)/.test(t), run: travelArrival },
  { id: 'viagem-rota', test: (t) => /(melhor (forma|jeito|rota|caminho|opcao) (de|para|pra) (chegar|ir|viajar))|compensa (mais )?(ir )?(por|via)|madri ou malaga|malaga ou madri|qual rota|por onde (eu )?(vou|chego)/.test(t), run: travelRoute },
  { id: 'viagem', test: (t) => /\b(minha viagem|passage(m|ns)( aerea)?|voo|voos|viajar para)\b/.test(t) && !/\b(seguro|visto)\b/.test(t), run: travelOverview },
  // Agenda
  { id: 'mover-evento', test: (t, u) => /\b(pass\w*|mov\w*|mud\w*|adi\w*|remarc\w*|transfer\w*|jog\w*|empurr\w*|troc\w*)\b.*\bpara\b/.test(t) && parseDate(t, u.ctx.today) && (u.user.planner || []).some((e) => e.data >= u.ctx.today), run: moveEvent },
  { id: 'agendar', test: (t) => /\b(agend\w*|marc\w*|coloc\w*|reserv\w*|lembr\w* (me|de)|cri\w* (um )?(lembrete|compromisso|evento))\b/.test(t) && !/\b(marquei|ja marc|cita previa|o que (eu )?tenho|quais (sao )?(as )?(minhas|meus)|pendencia\w*)\b/.test(t), run: schedule },
  { id: 'replanejar', test: (t) => /reorganiz|replanej|nao consegui (terminar|fazer|concluir|cumprir|seguir)|atrasei|perdi (o|os) (dia|horario|bloco)/.test(t), run: replan },
  { id: 'plano-documentos', test: (t) => /\bplano\b.*\b(document|inscri|candidat)|\bantes da (inscri|candidat)/.test(t), run: documentsPlan },
  { id: 'semana', test: (t) => /\b(organiz|planej|mont|distribu)\w*\b.*\bsemana\b|^minha semana|organize minha semana/.test(t), run: week },
  { id: 'pendencias-dia', test: (t) => /\b(pendencia|compromisso|tarefa|o que (eu )?tenho|agenda)\w*\b/.test(t) && /\b(hoje|amanha|depois de amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo|dia \d)/.test(t), run: dayAgenda },
  // Pós-chegada
  { id: 'chegada', test: (t) => /\b(cheguei|acabei de chegar|desembarquei|ja estou (na espanha|em granada|em [a-z]+ \(espanha\)))\b/.test(t), run: arrival },
  // Progresso das missões
  { id: 'nao-consegui', test: (t) => /\bnao (consegui|tenho|achei|encontrei|sei onde (conseguir|tirar|pedir))\b/.test(t) && matchDocument(t), run: couldNot },
  { id: 'aguardando', test: (t) => /\b(estou |to |ainda )?(esperando|aguardando)\b/.test(t), run: waiting },
  { id: 'terminei', test: (t) => /\b(terminei|conclui|finalizei|acabei de (fazer|preparar)|consegui|ja (fiz|tenho|preparei|recebi|tirei|emiti|peguei|resolvi)|ficou pronto|esta pronto|recebi|resolvi aquela)\b/.test(t) && !/\bnao (consegui|tenho)\b/.test(t), run: finished },
  // Finanças
  { id: 'apoio-familiar', test: (t) => /\b(pai|mae|padrasto|madrasta|tio|tia|avo|avos|irmao|irma|familia|pais|namorad\w*|marido|esposa|parente)\b.*\b(vai|vao|pode|podem|prometeu|ajud\w*|dar|mandar|emprest\w*|pagar)\b/.test(t) && parseMoney(t), run: familySupport },
  { id: 'tenho-dinheiro', test: (t) => (/\btenho\b.*\b(guardad|economizad|disponive|poupanca|no banco|juntad|reservad)/.test(t) || /\b(juntei|economizei|guardei)\b/.test(t)) && parseMoney(t), run: haveMoney },
  { id: 'economizar', test: (t) => /\b(economiz\w*|guardar|poupar|juntar)\b/.test(t) && /\b(por|ao|todo|cada) mes\b/.test(t), run: savePlan },
  { id: 'maiores-gastos', test: (t) => /maiores gastos|gasto mais|gastos principais|onde (vai|vou gastar)/.test(t), run: biggestCosts },
  { id: 'custo-cidade', test: (t) => /quanto custa (morar|viver)|custo de vida|caro (morar|viver)/.test(t), run: cityCost },
  { id: 'bolsa-concedida', test: (t) => /(ganhei|consegui|fui aprovad\w*|me (deram|concederam)).{0,20}\bbolsa\b|\bbolsa\b.{0,20}(concedida|aprovada|saiu)/.test(t), run: scholarshipGranted },
  { id: 'salvar-bolsa', test: (t) => /\b(salv\w*|acompanh\w*|quero)\b.*\bbolsa\b/.test(t) && SCHOLARSHIPS.some((s) => t.includes(normalize(s.nome)) || t.includes(normalize(s.entidade).split(' ')[0])), run: saveScholarshipIntent },
  { id: 'bolsas', test: (t) => /\b(bolsa|bolsas|beca|becas)\b/.test(t), run: scholarships },
  { id: 'financas', test: (t) => /quanto (de )?(dinheiro )?(ainda )?(me )?(falta|preciso)|nao tenho dinheiro|dinheiro suficiente|\borcamento\b|quanto vou gastar|comprova\w* (financeira|de renda|de recursos)|meios economicos/.test(t) && !/\b(aluguel|caucao|moradia)\b/.test(t), run: money },
  // Radar
  { id: 'avise-me', test: (t) => /\b(avis\w*|alert\w*|notifi\w*|me lembr\w*)\b.*\b(quando|abr\w*|abertura|inscri\w*|candidat\w*|calendario|datas?)\b/.test(t), run: notifyMe },
  { id: 'como-inscrever', test: (t) => /como (eu )?(me )?(inscrev|candidat)|como (faco|fazer|e) (a|minha) (inscri|candidat)|inscricao no dua|como funciona o dua/.test(t), run: howToApply },
  { id: 'inscricoes-abertas', test: (t) => /(inscri\w*|candidatura\w*).{0,20}abert|abert\w*.{0,20}(inscri|candidat)|o que esta aberto/.test(t), run: openNow },
  { id: 'quando-abre', test: (t) => /quando (abre|abrem|comeca|comecam|sai|saem|termina|fecha)|abre quando|(prazo|data|datas|calendario) (de|da|das|do) (inscri|candidat|mestrado|dua)/.test(t), run: whenOpens },
  { id: 'mestrados', test: (t) => /\b(mestrado|mestrados|master|masteres|pos-graduac)\b/.test(t) && /(compativ|encontr|procur|busc|quais|indique|sugir|sobre|area|em )/.test(t), run: programs },
  // Consulado (antes de e-mail e visto). "E-mail ao consulado" e "documentos do consulado" seguem adiante.
  { id: 'consulado', test: (t) => /\bconsulad/.test(t) && /\b(qual|quais|meu|minha|onde|encontr\w*|descobr\w*|identific\w*|responsavel|atende|cuida|de|do|da)\b/.test(t) && !/\be-?mail\b|escrev|mensagem|document|agend|cita previa/.test(t), run: consulate },
  // E-mails (antes de documentos: "escreva ao consulado perguntando quais documentos…")
  // Carteira de documentos (antes de e-mail, visto e documentos; "e-mail ao consulado" segue para o rascunho).
  { id: 'apostila', test: (t) => /\b(apostil\w*|traduc\w*|traduz\w*|juramentad\w*)\b/.test(t) && /\b(preciso|precisa|tenho que|devo|e obrigatori\w*|exige|exigem|pede|pedem)\b/.test(t) && !/\be-?mail\b|escrev/.test(t), run: apostille },
  { id: 'organizar-arquivos', test: (t) => /\b(organiz\w*|guard\w*|junt\w*)\b.{0,25}\b(meus |os )?(arquivos|documentos|papeis)\b/.test(t) && !/\bsemana\b|\be-?mail\b/.test(t), run: organizeFiles },
  { id: 'como-conseguir-documento', test: (t) => /\bcomo (eu )?(consigo|conseguir|tiro|tirar|peco|pedir|obtenho|obter|emito|emitir|solicito|solicitar|fa[cz]o (o|a|meu|minha))\b/.test(t) && Boolean(matchDocument(t)) && !/\be-?mail\b|escrev/.test(t), run: documentGuide },
  { id: 'email', test: (t) => /\be-?mail\b|escrev\w* (para|ao|a|pro)|mensagem (para|ao|pro)|responder (a|o) (universidade|coordena|consulado)/.test(t), run: email },
  // Documentos e visto
  { id: 'visto', test: (t) => /\bvisto\b/.test(t) && /(ajud|preciso|documento|falta|como|o que)/.test(t), run: visa },
  { id: 'documentos', test: (t) => /\b(quais|que|ver|meus)\b.{0,15}\bdocumentos\b|documentos (que )?(faltam|pendentes|preciso)|o que (eu )?preciso (preparar|levar|juntar)/.test(t), run: documents },
  // Moradia
  { id: 'comparar-moradias', test: (t) => /\bcompar\w*\b/.test(t) && /(apartamento|quarto|moradia|opc|casa|imove|aluguel)/.test(t), run: compareHousing },
  { id: 'aluguel', test: (t) => /\b(aluguel|caucao|fianza|deposito do aluguel)\b|quanto vou gastar de (moradia|aluguel)/.test(t), run: rentCosts },
  { id: 'moradia', test: (t) => /\b(moradia|quartos?|apartamento|onde (vou )?morar|residencia estudantil)\b/.test(t), run: housing },
  // Prazos
  { id: 'prazos', test: (t) => /\b(prazos?|datas importantes|meus prazos|vencimento)\b/.test(t), run: deadlines },
  // Ajuda numa missão
  { id: 'simples', test: (t) => /mais simples|simplific|explica (de novo|melhor)|nao entendi nada/.test(t), run: (u) => missionHelp(u, 'simples') },
  { id: 'mostracomo', test: (t) => /me mostra como|passo a passo|como (eu )?faco (isso|essa|esta)/.test(t), run: (u) => missionHelp(u, 'mostracomo') },
  { id: 'naoentendi', test: (t) => /\bnao entendi\b/.test(t), run: (u) => missionHelp(u, 'naoentendi') },
  { id: 'dificuldade', test: (t) => /dificuldade|nao sei (fazer|como)|nao consigo (fazer|entender)|travei|me ajud\w* com (isso|essa|esta)|estou perdid/.test(t), run: (u) => missionHelp(u, 'dificuldade') },
  // Jornada
  { id: 'missoes', test: (t) => /quais miss|miss(ao|oes) (que )?(faltam|pendentes|abertas|restam)|o que (ainda )?falta( fazer)?\b/.test(t) && !/dinheiro|euro|reais|€/.test(t), run: pendingMissions },
  { id: 'proximo', test: (t) => /o que (eu )?(devo |posso )?fa[cz]\w* (agora|hoje|primeiro)|o que fa(co|ço)$|o que faco agora|qual (e )?(o )?(meu )?proximo passo|proxima missao|por onde comec|nao sei o que fazer|qual e a minha proxima/.test(t), run: nextStep },
  { id: 'chegar-espanha', test: (t) => /me ajud\w* a (chegar|ir|estudar|morar) (a|na|em) (espanha|granada)|como (eu )?(vou|chego|consigo ir)/.test(t), run: overview },
  { id: 'memoria', test: (t) => /o que (voce )?sabe (sobre|de) mim|meus dados|o que voce lembra|esquec\w*/.test(t), run: memory },
  { id: 'glossario', test: (t) => /o que (e|sao|significa|quer dizer)\b|^(dua|nie|tie|iprem|empadronamiento|apostila\w*|cita previa)\??$/.test(t), run: glossary },
];

export async function guidedReply(user, { mensagem, acao, contexto = {}, historico = [] }) {
  const text = acao && QUICK[acao] ? QUICK[acao].mensagem : String(mensagem || '').trim();
  const turn = new Turn(user, { mensagem: text, contexto, historico });
  if (acao === 'simples') return missionHelp(turn, 'simples');
  if (acao === 'dificuldade') return missionHelp(turn, 'dificuldade');
  const intent = INTENTS.find((i) => i.test(turn.t, turn));
  try {
    if (intent) return await intent.run(turn);
    return await fallback(turn);
  } catch (err) {
    console.error('[mentor] falha no modo guiado:', err);
    return reply(turn, intent?.id || 'erro', { texto: 'Tive um problema para consultar seus dados agora. Nada foi alterado. Tente de novo em instantes.', compreendido: false });
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function greeting(u) {
  const nome = u.user.profile?.apelido || u.user.profile?.nome?.split(' ')[0] || '';
  const avisos = insights(u.user, { now: u.ctx.now, limit: 2 });
  return reply(u, 'saudacao', {
    texto: `Oi${nome ? `, ${nome}` : ''}! Eu sou o **Assistente Estuvia (Modo Guiado)**. Consulto seus dados reais da Estuvia e executo ações quando você confirma (agenda, missões, documentos, finanças, Radar).\n\nComo posso ajudar agora?`,
    cartoes: avisos.length ? [{ tipo: 'avisos', itens: avisos }] : [],
    sugestoes: [msg('O que faço agora?'), msg('Organize minha semana.'), msg('Quanto dinheiro falta para eu conseguir ir?')],
  });
}

function unavailableFor(t) {
  if (/\b(envi\w*|mand\w*|dispar\w*)\b.{0,25}\b(e-?mail|mensagem)\b/.test(t) && !/\b(rascunho|prepar\w*|escrev\w*|redij\w*|redig\w*|como)\b/.test(t)) return 'send_email';
  if (/\b(pague|pagar|faca o pagamento|pode pagar|efetue)\b.{0,30}\b(taxa|matricula|boleto|visto|aluguel|caucao|seguro)\b/.test(t) && /\b(voce|vc|pra mim|por mim)\b/.test(t)) return 'make_payment';
  if (/\b(agend\w*|marc\w*)\b.{0,30}\b(cita previa|no consulado|atendimento (no|na) (consulado|policia|extranjeria)|na policia)\b/.test(t) && !/\b(tarefa|lembrete|minha agenda|meu calendario)\b/.test(t)) return 'book_official_appointment';
  if (/\b(fa[cz]a|envie|submeta)\b.{0,20}\b(minha|a)\b.{0,10}\b(inscricao|candidatura|matricula|pedido de visto)\b.{0,20}\b(por mim|pra mim)?/.test(t) && /\b(voce|vc|por mim|pra mim)\b/.test(t)) return 'submit_official_application';
  if (/\b(envi\w*|mand\w*)\b.{0,25}\b(documento|diploma|historico|passaporte)\b.{0,25}\b(universidade|consulado|coordena)/.test(t) && /\b(voce|vc|por mim|pra mim)\b/.test(t)) return 'upload_document';
  if (/\b(procur\w*|encontr\w*|busc\w*|ache)\b.{0,20}\b(quartos?|apartamentos?|moradias?|casas?|aluguel)\b/.test(t)) return 'search_housing_web';
  return null;
}

async function unavailable(u) {
  const cap = UNAVAILABLE.find((x) => x.name === unavailableFor(u.t));
  const sug = {
    send_email: [msg('Prepare um e-mail para o coordenador do meu mestrado')],
    make_payment: [msg('Quanto dinheiro falta para eu conseguir ir?')],
    book_official_appointment: [msg('Agende para amanhã às 9h a tarefa de marcar a cita previa', 'Criar lembrete para amanhã')],
    submit_official_application: [msg('Como me inscrevo no mestrado?')],
    upload_document: [msg('Quais documentos ainda faltam?')],
    search_housing_web: [rota('/novo-lar', 'Abrir Meu novo lar'), msg('Compare minhas opções de moradia')],
  }[cap.name];
  const cartoes = [{ tipo: 'limitacao', motivo: cap.motivo, alternativa: cap.alternativa }];
  if (cap.name === 'search_housing_web') {
    const r = await u.use('get_housing_options');
    if (r.ok && r.dados.opcoes.length) cartoes.push({ tipo: 'moradias', itens: r.dados.opcoes, meses: r.dados.meses });
  }
  return reply(u, 'indisponivel', { texto: `${cap.motivo} ${cap.alternativa}`, cartoes, sugestoes: sug });
}

// ---------- Agenda ----------

function taskFromText(u) {
  const m = /(?:tarefa (?:de|para)|para eu|pra eu|lembrete (?:de|para)|compromisso (?:de|para))\s+(.+)$/i.exec(u.raw);
  if (!m) return null;
  return capital(m[1].replace(/\b(amanh[ãa]|hoje|depois de amanh[ãa]|(na |no |nesta |neste )?(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)(-feira)?|[àa]s? \d{1,2}(h|:)\d{0,2}|\d{1,2}h\d{0,2}|dia \d{1,2}(\/\d{1,2})?)\b/gi, '').replace(/\s+/g, ' ').replace(/[.!?\s]+$/, '').trim()).slice(0, 100) || null;
}

async function schedule(u) {
  const date = parseDate(u.t, u.ctx.today);
  const time = parseTime(u.t);
  const jr = u.jr;
  const j = u.journey();
  const def = matchMission(u.t) || (u.ctx.contexto.missaoId ? missionById(u.ctx.contexto.missaoId) : null);
  const state = def && j ? flatMissions(j).find((m) => m.id === def.id) : null;
  const free = taskFromText(u);
  if (!def && !free) return reply(u, 'agendar', { texto: 'Claro! O que você quer que eu coloque na agenda, e para quando?', sugestoes: j?.proximaMissao ? [msg(`Agende para amanhã a Missão ${j.proximaMissao.label}`, `Missão ${j.proximaMissao.label} amanhã`)] : [] });
  if (!date) {
    const base = u.raw.replace(/[.!?\s]+$/, '');
    return reply(u, 'agendar', { texto: `Para quando eu coloco ${state ? `a **Missão ${state.label} - ${state.titulo}**` : `"${free}"`}?`, sugestoes: [msg(`${base} hoje`, 'Hoje'), msg(`${base} amanhã`, 'Amanhã'), msg(`${base} sexta-feira`, 'Sexta-feira')] });
  }
  if (date < u.ctx.today) return reply(u, 'agendar', { texto: `A data ${fmtDate(date)} já passou. Para quando você quer?` });
  if (state && state.status === 'bloqueada') {
    const next = j.proximaMissao;
    return reply(u, 'agendar', { texto: `A **Missão ${state.label} - ${state.titulo}** ainda está bloqueada. Antes, falta: ${state.bloqueadaPor.map((b) => `${b.label ? `${b.label} ` : ''}${b.titulo}`).join(', ')}.${next ? ` Que tal agendar a próxima missão liberada, a **${next.label} - ${next.titulo}**?` : ''}`, sugestoes: next ? [msg(`Agende para ${dateLabel(date, u.ctx.today).split(' (')[0]} a Missão ${next.label}`, `Agendar Missão ${next.label}`)] : [] });
  }
  const minutos = state ? Math.min(60, Math.max(15, Math.round((missionById(def.id).duracaoMin || 45) / 15) * 15)) : 45;
  const slot = findSlot(u.user, date, minutos, time);
  if (!slot) return reply(u, 'agendar', { texto: `Seu dia ${dateLabel(date, u.ctx.today)} já está cheio nos horários livres. Quer outro dia?`, sugestoes: [msg(`${u.raw.replace(/[.!?\s]+$/, '')} amanhã`, 'Outro dia')] });
  const titulo = state ? `Missão ${state.label} - ${state.titulo}` : free;
  const item = { titulo, categoria: state ? categoryForMission(state.id) : 'pessoal', data: date, inicio: slot.inicio, fim: slot.fim, motivo: 'Pedido ao Mentor', ...(state && jr ? { journeyId: jr.id, missaoId: state.id } : {}) };
  const p = await u.plan('Novo compromisso', [{ ferramenta: 'create_calendar_event', input: { itens: [item] }, editavel: ['data', 'inicio', 'fim'] }], { confirmarRotulo: 'Confirmar e agendar' });
  if (p.erro) return errorReply(u, 'agendar', p.erro);
  const notas = [];
  if (slot.conflito) notas.push(`Atenção: nesse horário você já tem "${slot.conflito.titulo}".`);
  else if (slot.foraDaDisponibilidade) notas.push('Esse horário fica fora dos horários livres que você cadastrou na Agenda.');
  return reply(u, 'agendar', {
    texto: `${state ? `Encontrei a tarefa **${state.titulo}** (Missão ${state.label}).` : 'Combinado.'} Vou adicionar um compromisso para **${dateLabel(date, u.ctx.today)}, às ${timeLabel(slot.inicio)}** (${minutos} min) no seu calendário.${notas.length ? `\n\n${notas.join(' ')}` : ''}\n\nConfirma?`,
    proposta: p.proposta,
  });
}

async function moveEvent(u) {
  const date = parseDate(u.t, u.ctx.today);
  const time = parseTime(u.t);
  const future = (u.user.planner || []).filter((e) => e.data >= u.ctx.today).sort((a, b) => `${a.data}${a.inicio}`.localeCompare(`${b.data}${b.inicio}`));
  let ev = matchEvent(u.raw, future, matchMission(u.t) || (u.ctx.contexto.missaoId ? missionById(u.ctx.contexto.missaoId) : null));
  // "Passe ESSA tarefa…": o compromisso criado por último é o que acabamos de combinar.
  if (!ev && /\b(essa|esta|aquela|dessa|desta) (tarefa|atividade|missao|compromisso)\b/.test(u.t)) ev = [...future].sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''))[0] || null;
  if (!ev) {
    return reply(u, 'mover-evento', { texto: 'Qual compromisso você quer mover?', cartoes: [{ tipo: 'eventos', titulo: 'Próximos compromissos', eventos: future.slice(0, 6).map((e) => ({ id: e.id, titulo: e.titulo, data: e.data, inicio: e.inicio, fim: e.fim, origem: e.origem })), prazos: [] }], sugestoes: future.slice(0, 3).map((e) => msg(`Passe "${e.titulo}" para ${fmtDate(date)}`, e.titulo.slice(0, 40))) });
  }
  const p = await u.plan('Mover compromisso', [{ ferramenta: 'update_calendar_event', input: { eventoId: ev.id, data: date, ...(time ? { inicio: time } : {}) }, editavel: ['data', 'inicio'] }], { confirmarRotulo: 'Confirmar e mover' });
  if (p.erro) return errorReply(u, 'mover-evento', p.erro, { sugestoes: p.erro.codigo === 'prazo-oficial' ? [msg('Organize minha semana.')] : [] });
  return reply(u, 'mover-evento', { texto: `${p.proposta.passos[0].resumo}${p.proposta.passos[0].avisos?.length ? `\n\n${p.proposta.passos[0].avisos.join(' ')}` : ''}\n\nConfirma?`, proposta: p.proposta });
}

async function dayAgenda(u) {
  const date = parseDate(u.t, u.ctx.today) || u.ctx.today;
  const r = await u.use('get_calendar_events', { de: date, ate: date });
  if (!r.ok) return errorReply(u, 'pendencias-dia', r.erro);
  const { eventos, prazos } = r.dados;
  const label = dateLabel(date, u.ctx.today);
  const texto = !eventos.length && !prazos.length
    ? `Para ${label} você não tem compromissos nem prazos na agenda. Quer que eu distribua suas tarefas da semana?`
    : `Para **${label}**: ${eventos.length ? `${eventos.length} compromisso(s)` : 'nenhum compromisso'}${prazos.length ? ` e ${prazos.length} prazo(s)` : ''}.${eventos[0] ? ` O primeiro é "${eventos[0].titulo}", às ${timeLabel(eventos[0].inicio)}.` : ''}`;
  return reply(u, 'pendencias-dia', { texto, cartoes: [{ tipo: 'eventos', titulo: capital(label), eventos, prazos }], sugestoes: [!eventos.length && msg('Organize minha semana.'), rota('/agenda', 'Abrir Agenda')] });
}

async function week(u) {
  if (!u.jr && !(u.user.scholarshipApps || []).length) return noJourney(u, 'semana');
  let r = await u.use('propose_weekly_schedule', {});
  if (!r.ok) return errorReply(u, 'semana', r.erro);
  // Fim de semana sem horários restantes: planeja a próxima.
  if (!r.dados.proposta.length && r.dados.resumo.livreMin === 0) {
    const next = await u.use('propose_weekly_schedule', { semana: new Date(Date.parse(`${r.dados.semana}T12:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10) });
    if (next.ok && next.dados.proposta.length) r = next;
  }
  const s = r.dados;
  const tarefas = s.proposta.filter((p) => p.missaoId || p.bolsaId);
  if (!tarefas.length) {
    const av = availability(u.user);
    return reply(u, 'semana', {
      texto: s.resumo.livreMin === 0
        ? 'Não encontrei horários livres nesta semana com a disponibilidade cadastrada. Ajuste seus dias e horários na Agenda e eu monto a proposta.'
        : 'Não há missões liberadas para distribuir agora: as restantes estão concluídas, aguardando terceiros ou bloqueadas.',
      sugestoes: [rota('/agenda', s.resumo.livreMin === 0 ? 'Ajustar disponibilidade' : 'Abrir Agenda'), msg('Quais missões faltam?')],
      cartoes: s.resumo.livreMin === 0 ? [{ tipo: 'limitacao', motivo: `Disponibilidade atual: ${av.horasSemanais} h/semana.`, alternativa: 'Cadastre mais horários na Agenda.' }] : [],
    });
  }
  const unicas = new Set(tarefas.map((p) => p.missaoId || p.bolsaId)).size;
  const p = await u.plan('Proposta da semana', [{ ferramenta: 'create_calendar_event', input: { itens: proposalToItems(s.proposta), origem: 'agenda-ai' }, editavel: ['itens'] }], { confirmarRotulo: 'Salvar na agenda' });
  if (p.erro) return errorReply(u, 'semana', p.erro);
  return reply(u, 'semana', {
    texto: `Encontrei **${unicas + s.naoAgendadas.length} tarefa(s) pendente(s)**${s.prazos.length ? ` e **${s.prazos.length} prazo(s) importante(s)**` : ''} nesta semana. Distribuí ${s.proposta.length} bloco(s) nos seus horários livres (${Math.round(s.resumo.planejadoMin / 60 * 10) / 10} h de ${Math.round(s.resumo.metaMin / 60 * 10) / 10} h).${s.naoAgendadas.length ? ` ${s.naoAgendadas.length} ficou(aram) para depois por falta de tempo.` : ''}\n\nQuer que eu salve na sua agenda? Você pode tirar blocos antes.`,
    cartoes: [{ tipo: 'agenda-semana', semana: s.semana, itens: s.proposta, naoAgendadas: s.naoAgendadas, prazos: s.prazos, resumo: s.resumo, propostaId: p.proposta.id }],
    proposta: p.proposta,
  });
}

async function replan(u) {
  const p = await u.plan('Reorganizar a semana', [{ ferramenta: 'replan_week', input: {} }], { confirmarRotulo: 'Reorganizar' });
  if (p.erro) return errorReply(u, 'replanejar', p.erro);
  const s = p.proposta.passos[0];
  return reply(u, 'replanejar', { texto: `Sem problema, acontece. ${s.resumo}\n\nSeus compromissos pessoais e prazos oficiais não mudam. Confirma?`, cartoes: s.detalhes.length ? [{ tipo: 'lista', titulo: 'Nova distribuição', itens: s.detalhes }] : [], proposta: p.proposta });
}

async function documentsPlan(u) {
  if (!u.jr) return noJourney(u, 'plano-documentos');
  const pend = await u.use('get_pending_missions', { rodada: 2 });
  const dl = await u.use('get_verified_deadlines', {});
  const docsMissions = pend.ok ? [...pend.dados.atencao, ...pend.dados.emAndamento, ...pend.dados.agora, ...pend.dados.aguardando] : [];
  const opp = dl.ok ? dl.dados.oportunidade : null;
  const abertura = opp?.abertura ? `A candidatura abre em **${fmtDate(opp.abertura)}** (fonte oficial).` : opp ? `Ainda não há calendário oficial confirmado para ${opp.anoAcademico}: vou trabalhar sem data inventada.` : '';
  if (!docsMissions.length) return reply(u, 'plano-documentos', { texto: `Suas missões de documentos estão concluídas ou aguardando terceiros. ${abertura}`.trim(), sugestoes: [msg('Quais documentos ainda faltam?'), msg('Organize minha semana.')] });
  const w = await u.use('propose_weekly_schedule', {});
  const blocos = w.ok ? w.dados.proposta.filter((x) => x.missaoId && missionById(x.missaoId)?.rodada === 2) : [];
  const p = blocos.length ? await u.plan('Plano de documentos, esta semana', [{ ferramenta: 'create_calendar_event', input: { itens: proposalToItems(blocos), origem: 'agenda-ai' }, editavel: ['itens'] }], { confirmarRotulo: 'Salvar na agenda' }) : {};
  return reply(u, 'plano-documentos', {
    texto: `Para chegar à inscrição com tudo pronto, faltam **${docsMissions.length} missão(ões) de documentos**. ${abertura}\n\n${blocos.length ? `Montei ${blocos.length} bloco(s) para esta semana; nas próximas, é só me pedir para reorganizar.` : 'Não encontrei horário livre nesta semana para elas.'}`,
    cartoes: [{ tipo: 'missoes', titulo: 'Missões de documentos', grupos: [{ titulo: 'A fazer', itens: docsMissions }] }, ...(blocos.length ? [{ tipo: 'agenda-semana', semana: w.dados.semana, itens: blocos, naoAgendadas: [], prazos: w.dados.prazos, resumo: null }] : [])],
    proposta: p.proposta || null,
    sugestoes: [msg('Quais documentos ainda faltam?')],
  });
}

// ---------- Missões ----------

async function pendingMissions(u) {
  if (!u.jr) return noJourney(u, 'missoes');
  const r = await u.use('get_pending_missions', {});
  if (!r.ok) return errorReply(u, 'missoes', r.erro);
  const d = r.dados;
  const abertas = d.atencao.length + d.emAndamento.length + d.agora.length;
  const first = d.atencao[0] || d.emAndamento[0] || d.agora[0];
  return reply(u, 'missoes', {
    texto: `Você tem **${abertas} missão(ões) para fazer agora**${d.aguardando.length ? `, ${d.aguardando.length} aguardando resposta de terceiros` : ''}${d.bloqueadas.length ? ` e algumas bloqueadas até concluir as anteriores` : ''}.${first ? ` Comece pela **${first.label} - ${first.titulo}**.` : ''}`,
    cartoes: [{ tipo: 'missoes', titulo: 'Missões pendentes', journeyId: d.journeyId, grupos: [
      { titulo: 'Precisam de atenção', itens: d.atencao }, { titulo: 'Em andamento', itens: d.emAndamento }, { titulo: 'Disponíveis', itens: d.agora },
      { titulo: 'Aguardando terceiros', itens: d.aguardando }, { titulo: 'Bloqueadas (o que falta)', itens: d.bloqueadas },
    ].filter((g) => g.itens.length) }],
    sugestoes: [first && rota(`/j/${d.journeyId}/m/${first.id}`, `Abrir Missão ${first.label}`), msg('Organize minha semana.')],
  });
}

async function nextStep(u) {
  if (!u.jr) return noJourney(u, 'proximo');
  const r = await u.use('get_current_mission', {});
  if (!r.ok) return errorReply(u, 'proximo', r.erro);
  const m = r.dados;
  if (m.nenhuma) return reply(u, 'proximo', { texto: m.motivo, sugestoes: [msg('Quais missões faltam?')] });
  const avisos = insights(u.user, { now: u.ctx.now, limit: 1 }).filter((i) => i.prioridade === 'alta');
  if (m.bloqueada) return reply(u, 'proximo', { texto: `A **Missão ${m.label} - ${m.titulo}** ainda está bloqueada. Antes, falta: ${m.bloqueadaPor.join(', ')}.`, sugestoes: [msg('Qual é a minha próxima missão?')] });
  const pend = m.objetivosLista.find((o) => !o.feito);
  const texto = m.emFoco
    ? `Nesta missão (**${m.label} - ${m.titulo}**), o próximo passo é: **${pend ? pend.texto : 'confirmar a conclusão'}**.`
    : `Sua próxima missão é a **${m.label} - ${m.titulo}** (${m.statusLabel.toLowerCase()}).\n\n${m.resumo}${pend ? `\n\n**Comece por:** ${pend.texto}.` : ''}`;
  return reply(u, 'proximo', {
    texto: `${texto}${avisos[0] ? `\n\n⚠️ ${avisos[0].texto}` : ''}`,
    cartoes: [{ tipo: 'missao', missao: m }, ...(avisos.length ? [{ tipo: 'avisos', itens: avisos }] : [])],
    sugestoes: [ask('mostracomo', 'Me mostra como fazer'), msg(`Agende para amanhã a Missão ${m.label}`, 'Agendar para amanhã'), rota(`/j/${m.journeyId}/m/${m.id}`, `Abrir Missão ${m.label}`)],
    fontes: m.fontes,
  });
}

async function overview(u) {
  if (!u.jr) return noJourney(u, 'chegar-espanha');
  const r = await u.use('get_user_journey', {});
  if (!r.ok) return errorReply(u, 'chegar-espanha', r.erro);
  const j = r.dados;
  return reply(u, 'chegar-espanha', {
    texto: `Vamos juntos! Seu caminho até ${j.destino.cidade || 'a Espanha'} está organizado em rodadas. Você está na **Rodada ${j.rodadaAtual.numero} - ${j.rodadaAtual.titulo}** (${j.progresso}% da jornada).\n\n${j.proximaMissao ? `**Próximo passo:** Missão ${j.proximaMissao.label} - ${j.proximaMissao.titulo}.` : 'Nenhuma missão liberada agora.'}`,
    cartoes: [{ tipo: 'jornada', jornada: j }],
    sugestoes: [msg('O que faço agora?'), msg('Organize minha semana.'), msg('Quanto dinheiro falta para eu conseguir ir?')],
  });
}

/** Ajuda dentro de uma missão: usa as respostas determinísticas da jornada (assistant-context). */
async function missionHelp(u, acao) {
  const { journeyId, missaoId, tela } = u.ctx.contexto;
  // Sem missão em foco: o contexto da TELA decide antes de cair na próxima missão.
  if (!missaoId && acao === 'dificuldade' && tela && SCREEN_HELP[tela]) return SCREEN_HELP[tela](u);
  if (!missaoId && acao === 'simples') {
    const last = [...u.historico].reverse().find((h) => h.role === 'assistant')?.content || '';
    const terms = GLOSSARY.filter((g) => g.re.test(last)).slice(0, 4);
    if (terms.length) return reply(u, 'simples', { texto: `Em palavras simples:\n${terms.map((g) => `- **${g.termo}:** ${g.texto}`).join('\n')}`, sugestoes: [msg('O que faço agora?')] });
  }
  if (!u.jr) return noJourney(u, acao);
  const ctx = resolveContext(u.user, journeyId || u.jr.id, missaoId);
  u.usadas.push({ nome: 'get_current_mission', ok: Boolean(ctx.mission), efeito: 'leitura' });
  if (!ctx.mission) return reply(u, acao, { texto: 'Não há uma missão liberada agora para eu explicar. Quer ver o que falta?', sugestoes: [msg('Quais missões faltam?')] });
  const q = quickAnswer(acao, u.user, ctx);
  if (!q) return fallback(u);
  const intro = !missaoId ? `Vou considerar a sua próxima missão, a **${ctx.mission.label} - ${ctx.mission.definicao?.titulo || ctx.mission.titulo}**.\n\n` : '';
  return reply(u, acao, { texto: `${intro}${q.texto}`, sugestoes: convertActions(q.acoes), fontes: (q.fontes || []).map((f) => f && ({ titulo: f.titulo, url: f.url, orgao: f.orgao })) });
}

const convertActions = (acoes = []) => acoes.map((a) => {
  if (a.tipo === 'rota') return rota(a.rota, a.rotulo);
  if (a.tipo === 'perguntar') return ask(a.acao, a.rotulo);
  if (a.tipo === 'organizar-semana') return msg('Organize minha semana.', a.rotulo);
  if (a.tipo === 'salvar-bolsa') return msg(`Quero acompanhar a bolsa ${SCHOLARSHIPS.find((s) => s.id === a.catalogId)?.nome}`, a.rotulo);
  return null;
}).filter(Boolean);

const SCREEN_HELP = {
  financas: (u) => money(u),
  financiamento: (u) => money(u),
  radar: (u) => howToApply(u),
  documentos: (u) => documents(u),
  agenda: (u) => week(u),
  moradia: (u) => housing(u),
  bolsas: (u) => scholarships(u),
};

function obtainObjective(m) {
  return m.objetivosLista?.find((o) => !o.feito && o.tipo === 'check' && /^(obter|solicitar|receber|emitir|conseguir|pedir|tirar)/i.test(o.texto)) || null;
}

async function finished(u) {
  const doc = matchDocument(u.t);
  const def = matchMission(u.t) || (u.ctx.contexto.missaoId ? missionById(u.ctx.contexto.missaoId) : null);
  const note = openNotes(u.user).find((n) => (doc && n.documentoId === doc.id) || (def && n.missaoId === def.id));
  if (!doc && !def) {
    const j = u.journey();
    const cands = j ? flatMissions(j).filter((m) => ['em-andamento', 'atencao', 'aguardando'].includes(m.status)).slice(0, 3) : [];
    return reply(u, 'terminei', { texto: 'Que ótimo! O que você terminou?', sugestoes: cands.map((m) => msg(`Terminei a Missão ${m.label}`, `${m.label} ${m.titulo}`.slice(0, 40))) });
  }
  const passos = [];
  const notas = [];
  const concluir = /\b(terminei|conclui|finalizei|acabei)\b/.test(u.t);
  const obtained = !concluir && /\b(consegui|recebi|ja tenho|tenho (o|a|meu|minha)|peguei|tirei|emiti)\b/.test(u.t);
  const docReady = !concluir && !obtained; // "meu histórico está pronto": atualiza o documento e oferece concluir a missão
  if (doc) {
    const atual = u.user.documents?.[doc.id] || 'pendente';
    const alvo = /\b(envi(ei|ado))\b/.test(u.t) ? 'enviado' : 'pronto';
    if (atual !== alvo && !(alvo === 'pronto' && atual === 'enviado')) passos.push({ ferramenta: 'update_document_status', input: { documentoId: doc.id, status: alvo } });
  }
  const jr = u.jr;
  let mission = null;
  if (def && jr) {
    mission = missionForMentor(u.user, jr, def.id);
    if (mission && !mission.bloqueada && !['concluida', 'nao-aplicavel'].includes(mission.status)) {
      const obj = obtained ? obtainObjective(mission) : null;
      if (obtained && obj) passos.push({ ferramenta: 'update_mission_progress', input: { journeyId: jr.id, missaoId: def.id, operacao: 'marcar-objetivo', objetivoId: obj.id } });
      else if (docReady && doc) notas.push(`Se a Missão ${mission.label} inteira estiver feita, me diga "terminei a Missão ${mission.label}" que eu concluo.`);
      else if (!obtained) {
        const ev = /comprovante\s*(?:n[º°o.]*|numero)?\s*[:#]?\s*([\w\-/.]{3,40})|protocolo\s*(?:n[º°o.]*|numero)?\s*[:#]?\s*([\w\-/.]{3,40})/i.exec(u.raw);
        const evidencia = ev ? (ev[1] || ev[2]) : undefined;
        if (mission.evidencia?.obrigatoria && !evidencia) {
          notas.push(`Para concluir a Missão ${mission.label} preciso de: **${mission.evidencia.rotulo}**. Me diga, por exemplo: "Terminei a missão ${mission.label}, comprovante 12345".`);
        } else {
          const tryConclude = await u.use('update_mission_progress', { journeyId: jr.id, missaoId: def.id, operacao: 'concluir', marcarPendentes: true, ...(evidencia ? { evidencia } : {}) });
          if (tryConclude.ok) passos.push({ ferramenta: 'update_mission_progress', input: tryConclude.input });
          else notas.push(`Ainda não dá para concluir a Missão ${mission.label}: ${tryConclude.erro.mensagem}`);
        }
      }
    } else if (mission?.bloqueada) notas.push(`A Missão ${mission.label} ainda está bloqueada (falta: ${mission.bloqueadaPor.join(', ')}), então só atualizo o documento.`);
  }
  if (note) passos.push({ ferramenta: 'resolve_note', input: { notaId: note.id } });
  if (!passos.length) return reply(u, 'terminei', { texto: `${notas.join('\n\n') || 'Isso já está registrado na sua jornada. 👍'}`, sugestoes: mission && !mission.bloqueada ? [rota(`/j/${jr.id}/m/${mission.id}`, `Abrir Missão ${mission.label}`)] : [] });
  const p = await u.plan('Registrar progresso', passos, { confirmarRotulo: 'Confirmar' });
  if (p.erro) return errorReply(u, 'terminei', p.erro);
  const next = obtained && mission && !mission.bloqueada ? mission.objetivosLista.filter((o) => !o.feito && o.tipo === 'check' && o.id !== obtainObjective(mission)?.id) : [];
  return reply(u, 'terminei', {
    texto: `Que ótimo! 🎉${note ? ` Você tinha me contado que estava com dificuldade nisso.` : ''} Posso registrar:\n${p.proposta.passos.map((s) => `- ${s.resumo}`).join('\n')}${notas.length ? `\n\n${notas.join('\n\n')}` : ''}${next.length ? `\n\nDepois disso, na Missão ${mission.label} ainda falta: ${next.slice(0, 2).map((o) => o.texto.toLowerCase()).join('; ')}.` : ''}\n\nConfirma?`,
    proposta: p.proposta,
  });
}

async function waiting(u) {
  const def = matchMission(u.t) || (u.ctx.contexto.missaoId ? missionById(u.ctx.contexto.missaoId) : null);
  if (!def || !u.jr) return reply(u, 'aguardando', { texto: 'Você está esperando o quê? Por exemplo: "estou esperando meu diploma ficar pronto".', compreendido: false });
  if (!def.aguardavel) return reply(u, 'aguardando', { texto: `A Missão ${def.id} - ${def.titulo} não depende de terceiros, então não dá para marcá-la como "aguardando". Posso agendar um horário para você avançar nela.`, sugestoes: [msg(`Agende para amanhã a Missão ${def.id}`, 'Agendar para amanhã')] });
  const p = await u.plan('Aguardando terceiros', [{ ferramenta: 'update_mission_progress', input: { journeyId: u.jr.id, missaoId: def.id, operacao: 'aguardando' } }]);
  if (p.erro) return errorReply(u, 'aguardando', p.erro);
  return reply(u, 'aguardando', { texto: `Entendi. Vou marcar a **Missão ${def.id} - ${def.titulo}** como "aguardando terceiros": ela sai das suas tarefas da semana e vira só uma verificação rápida. Enquanto isso, você pode avançar em outras missões.\n\nConfirma?`, proposta: p.proposta });
}

// Primeira orientação + pergunta que ajuda a avançar (Conversa 4 da especificação).
const DOC_HELP = {
  historico: 'Esse documento normalmente é emitido pela faculdade onde você se formou. Você ainda consegue acessar o portal acadêmico da sua graduação?',
  diploma: 'O diploma é emitido pela faculdade onde você se formou. Se ele ainda não saiu, a convocatória pode aceitar outro documento (como certidão de conclusão). Você já colou grau?',
  passaporte: 'O passaporte é pedido à Polícia Federal: agendamento pelo site oficial e pagamento da taxa. Você já tem o agendamento?',
  antecedentes: 'A certidão de antecedentes é emitida online pela Polícia Federal (e, se o consulado pedir, também a estadual). Quer que eu coloque um lembrete para tirar?',
};

async function couldNot(u) {
  const doc = matchDocument(u.t);
  const mid = missionForDocument(doc.id);
  const def = mid ? missionById(mid) : null;
  const guia = def?.comoExecutar?.[0];
  const passos = [];
  if (mentorState(u.user).permissoes.memoria !== false) passos.push({ ferramenta: 'remember_note', input: { texto: `Não consegui: ${doc.nome}`.slice(0, 200), documentoId: doc.id, ...(def ? { missaoId: def.id } : {}), ...(u.jr ? { journeyId: u.jr.id } : {}) } });
  const p = passos.length ? await u.plan('Lembrar pendência', passos, { confirmarRotulo: 'Sim, pode lembrar' }) : {};
  return reply(u, 'nao-consegui', {
    texto: `Calma, isso é comum. ${DOC_HELP[doc.id] || `**${doc.nome}:** ${doc.dica}`}${guia ? `\n\n**Como pedir:** ${guia.texto}` : ''}${p.proposta ? '\n\nQuer que eu lembre dessa pendência? Quando você conseguir, é só me contar e eu atualizo a missão.' : ''}`,
    proposta: p.proposta || null,
    sugestoes: [msg(`Agende para amanhã a tarefa de resolver ${doc.nome.toLowerCase()}`, 'Lembrar na agenda'), def && u.jr && rota(`/j/${u.jr.id}/m/${def.id}`, `Abrir Missão ${def.id}`)],
  });
}

async function arrival(u) {
  if (!u.jr) return noJourney(u, 'chegada');
  const j = u.journey();
  const dur = Number(j.destino.duracaoMeses) || null;
  const tie = dur ? (dur > 6 ? `Como seu curso dura ${dur} meses, você provavelmente vai precisar do **cartão de estrangeiro (TIE)**: a orientação oficial prevê pedir em até um mês após a entrada.` : `Seu curso dura ${dur} meses: vamos conferir se a TIE (cartão de estrangeiro) se aplica no seu caso.`) : 'Seu curso dura mais de seis meses?';
  if (j.chegada) {
    const r = await u.use('get_pending_missions', { rodada: 7 });
    return reply(u, 'chegada', { texto: `Bem-vindo(a) à Espanha! 🇪🇸 Sua chegada já está registrada (${fmtDate(j.chegada)}). Vamos aos primeiros passos.\n\n${tie}`, cartoes: r.ok ? [{ tipo: 'missoes', titulo: 'Primeiros passos', journeyId: u.jr.id, grupos: [{ titulo: 'Para fazer', itens: [...r.dados.atencao, ...r.dados.emAndamento, ...r.dados.agora] }] }] : [], sugestoes: [rota(`/j/${u.jr.id}/m/8.1`, 'Ver a TIE (Missão 8.1)'), msg('Organize minha semana.')] });
  }
  const date = parseDate(u.t, u.ctx.today) || u.ctx.today;
  const p = await u.plan('Registrar chegada', [{ ferramenta: 'register_arrival', input: { journeyId: u.jr.id, dataEntrada: date }, editavel: ['dataEntrada'] }], { confirmarRotulo: 'Confirmar chegada' });
  if (p.erro) return reply(u, 'chegada', { texto: `Bem-vindo(a) à Espanha! 🇪🇸 Para eu liberar as missões de chegada, antes ${p.erro.mensagem.charAt(0).toLowerCase()}${p.erro.mensagem.slice(1)}`, sugestoes: [rota(`/j/${u.jr.id}/m/5.9`, 'Abrir Missão 5.9')] });
  return reply(u, 'chegada', { texto: `Bem-vindo(a) à Espanha! 🇪🇸 Vou te ajudar a organizar os primeiros passos.\n\nPrimeiro, registro a sua chegada em **${fmtDate(date)}**, essa data conta para prazos legais. ${tie}\n\nConfirma a data?`, proposta: p.proposta });
}

// ---------- Finanças ----------

const financeCard = (d, extra = {}) => ({ tipo: 'financas', necessario: d.necessario, base: d.base, garantidos: d.garantidos, naoGarantidos: d.naoGarantidos, deficit: d.deficit, exigenciaVisto: d.exigenciaVisto, orcamento: d.orcamento, ...extra });

async function money(u) {
  const r = await u.use('calculate_financial_gap', {});
  if (!r.ok) return errorReply(u, 'financas', r.erro);
  const d = r.dados;
  if (!d.informouRecursos) {
    return reply(u, 'financas', {
      texto: 'Vamos conferir quanto falta e quais alternativas existem.\n\nVocê já tem algum dinheiro guardado ou alguém que possa ajudar? Pode me dizer, por exemplo: "tenho €2.000 guardados" ou "meu pai vai ajudar com €3.000".',
      cartoes: [financeCard(d)],
      sugestoes: [rota('/financiamento#recursos', 'Registrar no planejamento'), msg('Procure bolsas que aceitam brasileiros.')],
    });
  }
  const s = await u.use('get_financial_summary', {});
  const texto = d.deficit === 0
    ? `Pelos seus dados, o dinheiro garantido (${eur(d.garantidos)}) cobre a necessidade estimada (${eur(d.necessario)}). Confirme com o consulado quais comprovantes ele aceita.`
    : `Você tem **${eur(d.garantidos)} garantidos**. Seu planejamento estima **${eur(d.necessario)}** (${d.base}). A diferença é de **${eur(d.deficit)}**.${d.naoGarantidos ? `\n\n${eur(d.naoGarantidos)} estão prometidos ou solicitados e ainda não contam como garantidos.` : ''}\n\nQuer que eu procure bolsas compatíveis ou monte um plano para você economizar?`;
  return reply(u, 'financas', {
    texto: `${texto}${d.custosInformados === 0 ? '\n\n_Você ainda não informou custos (aluguel, passagens…): por enquanto uso só a exigência estimada do visto._' : ''}`,
    cartoes: [financeCard(d, { recursos: s.ok ? s.dados.recursos : [], caminhos: s.ok ? s.dados.caminhos.slice(0, 3) : [] })],
    sugestoes: d.deficit ? [msg('Procure bolsas que aceitam brasileiros.'), msg('Como consigo economizar €100 por mês?', 'Plano de economia'), msg('Quais são meus maiores gastos?')] : [rota('/financiamento', 'Abrir planejamento')],
    fontes: [d.exigenciaVisto?.fonte && { titulo: 'Regra de meios econômicos (IPREM)', url: null, orgao: d.exigenciaVisto.fonte }],
  });
}

async function haveMoney(u) {
  const m = parseMoney(u.raw);
  const r = await u.use('calculate_financial_gap', { simularDisponivel: m.valor, simularMoeda: m.moeda });
  if (!r.ok) return errorReply(u, 'tenho-dinheiro', r.erro, { sugestoes: [rota('/financiamento', 'Cadastrar câmbio')] });
  const d = r.dados;
  const p = await u.plan('Registrar recurso', [{ ferramenta: 'update_financial_resource', input: { operacao: 'adicionar', tipo: 'poupanca', descricao: 'Dinheiro guardado (informado ao Mentor)', valor: m.valor, moeda: m.moeda, status: 'disponivel' }, editavel: ['valor', 'descricao'] }], { confirmarRotulo: 'Registrar' });
  const valor = `${m.moeda === 'BRL' ? 'R$' : '€'} ${m.valor.toLocaleString('pt-BR')}`;
  return reply(u, 'tenho-dinheiro', {
    texto: `Com ${valor} guardados${d.garantidos ? ` (além de ${eur(d.garantidos)} já registrados)` : ''}, a necessidade estimada é de ${eur(d.necessario)}: **${d.simulacao.deficitDepois ? `faltariam ${eur(d.simulacao.deficitDepois)}` : 'você cobriria a estimativa'}**.\n\nQuer que eu registre esse valor como disponível no seu planejamento?`,
    cartoes: [financeCard(d, { simulacao: d.simulacao })],
    proposta: p.proposta || null,
    sugestoes: [d.simulacao.deficitDepois && msg('Procure bolsas que aceitam brasileiros.')],
  });
}

async function familySupport(u) {
  const m = parseMoney(u.raw);
  const who = /\b(pai|mae|padrasto|madrasta|tio|tia|avo|avos|irmao|irma|familia|pais|namorad\w*|marido|esposa|parente)\b/.exec(u.t)?.[1] || 'familiar';
  const p = await u.plan('Registrar apoio familiar', [{ ferramenta: 'update_financial_resource', input: { operacao: 'adicionar', tipo: 'familiar', descricao: `Apoio: ${who}`, valor: m.valor, moeda: m.moeda, status: 'previsto', apoiador: who }, editavel: ['valor', 'status'] }], { confirmarRotulo: 'Registrar como prometido' });
  if (p.erro) return errorReply(u, 'apoio-familiar', p.erro);
  return reply(u, 'apoio-familiar', {
    texto: `Que bom ter esse apoio! Vou registrar como **apoio prometido** (${m.moeda === 'BRL' ? 'R$' : '€'} ${m.valor.toLocaleString('pt-BR')}, ${who}).\n\nEnquanto não estiver comprovado, ele **não conta como dinheiro garantido** no cálculo. O consulado decide se aceita apoio de terceiros e quais documentos pede (renda do apoiador, declaração, origem dos recursos).\n\nConfirma?`,
    proposta: p.proposta,
    sugestoes: [msg('Como comprovo apoio financeiro familiar?')],
  });
}

async function savePlan(u) {
  const m = parseMoney(u.raw) || { valor: 100, moeda: 'EUR' };
  if (m.moeda === 'BRL') return reply(u, 'economizar', { texto: 'Para calcular em reais preciso do câmbio cadastrado. Me diga o valor em euros, ou cadastre o câmbio no planejamento.', sugestoes: [rota('/financiamento', 'Abrir planejamento')] });
  const r = await u.use('calculate_financial_gap', { economiaMensal: m.valor });
  if (!r.ok) return errorReply(u, 'economizar', r.erro);
  const d = r.dados;
  if (d.deficit === null) return reply(u, 'economizar', { texto: 'Para calcular quanto guardar por mês, preciso saber quanto você já tem (mesmo que seja zero). Me diga, por exemplo: "tenho €500 guardados".', sugestoes: [rota('/financiamento#recursos', 'Registrar meus recursos')] });
  if (!d.deficit) return reply(u, 'economizar', { texto: 'Pelos seus dados, não falta dinheiro para a estimativa atual. Guardar uma reserva extra para emergências é sempre uma boa ideia.' });
  const e = d.economia;
  return reply(u, 'economizar', {
    texto: `Guardando **€ ${m.valor}/mês**, você cobriria a diferença de ${eur(d.deficit)} em **${e.mesesParaCobrir} mês(es)**. Até a viagem faltam cerca de ${e.mesesAteViagem} mês(es), então ${e.cobreAtempo ? 'dá tempo. 👍' : 'só isso não basta: vale combinar com bolsas ou apoio familiar.'}\n\n**Dicas práticas** _(orientação, não regra)_: traduza e apostile só o que a fonte oficial exigir; compare seguros e passagens pelo custo total; prefira quarto compartilhado.`,
    cartoes: [financeCard(d, { economia: e })],
    sugestoes: [!e.cobreAtempo && msg('Procure bolsas que aceitam brasileiros.'), msg('Quais são meus maiores gastos?')],
  });
}

async function biggestCosts(u) {
  const r = await u.use('get_financial_summary', {});
  if (!r.ok) return errorReply(u, 'maiores-gastos', r.erro);
  const g = r.dados.maioresGastos;
  if (!g.length) return reply(u, 'maiores-gastos', { texto: 'Você ainda não informou custos no planejamento (aluguel, passagens, seguro…). Sem isso não sei quais são seus maiores gastos.', sugestoes: [rota('/financiamento', 'Informar custos')] });
  return reply(u, 'maiores-gastos', { texto: `Seus maiores gastos estimados:\n${g.slice(0, 3).map((x, i) => `${i + 1}. **${x.rotulo}**: ${eur(x.totalEur)}${x.tipo === 'mensal' ? ` (${eur(x.valorEur)}/mês)` : ''}`).join('\n')}\n\nQuer dicas para reduzir algum deles?`, cartoes: [{ tipo: 'lista', titulo: 'Maiores gastos (estimativa)', itens: g.map((x) => `${x.rotulo}: ${eur(x.totalEur)} - ${x.origem}`) }], sugestoes: [msg('Me ajude a encontrar uma moradia mais barata'), msg('Como consigo economizar €100 por mês?', 'Plano de economia')] });
}

async function cityCost(u) {
  const s = await u.use('get_financial_summary', {});
  const h = await u.use('get_housing_options', {});
  const k = retrieve(u.raw, { k: 2, temas: ['chegada'] });
  const moradias = h.ok ? h.dados.opcoes : [];
  const linhas = s.ok ? s.dados.maioresGastos : [];
  return reply(u, 'custo-cidade', {
    texto: `A Estuvia ainda não tem uma estimativa **verificada** de custo de vida por cidade, então não vou chutar um número.\n\n${moradias.length ? `Pelas moradias que você salvou, o aluguel vai de €${Math.min(...moradias.map((x) => x.mensal))} a €${Math.max(...moradias.map((x) => x.mensal))}/mês.` : 'Salve algumas opções de moradia e eu calculo o seu custo real.'}${linhas.length ? ` Seu orçamento atual soma ${eur(s.dados.orcamento.valor)} (estimativa sua).` : ''}`,
    cartoes: k.length ? [{ tipo: 'fontes', trechos: k.map((x) => publicChunk(x.chunk)) }] : [],
    sugestoes: [rota('/financiamento', 'Montar meu orçamento'), rota('/novo-lar', 'Comparar moradias')],
  });
}

async function scholarshipGranted(u) {
  return reply(u, 'bolsa-concedida', { texto: 'Parabéns! 🎉 Para a bolsa entrar como dinheiro garantido, registre-a como **concedida** em Bolsas, com o valor da carta de concessão. Só a concessão oficial conta, bolsa solicitada não entra no cálculo.', sugestoes: [rota('/financiamento#bolsas', 'Registrar a bolsa')] });
}

async function scholarships(u) {
  const r = await u.use('search_scholarships', { busca: u.raw.slice(0, 80) });
  if (!r.ok) return errorReply(u, 'bolsas', r.erro);
  const d = r.dados;
  const naoSalvas = d.bolsas.filter((b) => !b.salva).slice(0, 2);
  return reply(u, 'bolsas', {
    texto: `${d.abertasConfirmadas ? `Há ${d.abertasConfirmadas} bolsa(s) com edital aberto confirmado na base.` : 'No momento **nenhuma bolsa da nossa base está com edital aberto confirmado**.'} Estas são as fontes para acompanhar${/brasil/.test(u.t) ? ' que já aceitaram candidatos iberoamericanos (inclui brasileiros), confira o edital vigente' : ''}:\n\n${d.bolsas.slice(0, 3).map((b) => `- **${b.nome}** (${b.entidade}): ${b.statusLabel}`).join('\n')}\n\nNenhuma bolsa cobre automaticamente o seu mestrado. Quer acompanhar alguma?`,
    cartoes: [{ tipo: 'bolsas', itens: d.bolsas }],
    sugestoes: naoSalvas.map((b) => msg(`Quero acompanhar a bolsa ${b.nome}`, `Acompanhar ${b.nome}`.slice(0, 40))),
  });
}

async function saveScholarshipIntent(u) {
  const s = SCHOLARSHIPS.find((x) => u.t.includes(normalize(x.nome)) || u.t.includes(normalize(x.entidade).split(' ')[0]));
  const p = await u.plan('Acompanhar bolsa', [{ ferramenta: 'save_scholarship', input: { catalogId: s.id } }], { confirmarRotulo: 'Acompanhar' });
  if (p.erro) return errorReply(u, 'salvar-bolsa', p.erro);
  return reply(u, 'salvar-bolsa', { texto: `${p.proposta.passos[0].resumo} As tarefas aparecem na Agenda. Confirma?`, proposta: p.proposta });
}

// ---------- Radar ----------

function programFromText(u) {
  const r = findPrograms(u.raw, { user: u.user, limit: 3 });
  return r.termos.length && r.items.length ? r.items : [];
}

async function whenOpens(u) {
  const progs = programFromText(u);
  const opp = progs[0] || null;
  const r = await u.use('get_verified_deadlines', { ...(opp ? { oportunidadeId: opp.id } : {}), pergunta: u.raw });
  if (!r.ok) return errorReply(u, 'quando-abre', r.erro);
  const d = r.dados;
  const o = d.oportunidade;
  if (!o) return reply(u, 'quando-abre', { texto: 'De qual mestrado você quer saber? Me diga o nome (ex.: "quando abre o mestrado em Desenvolvimento de Software?").', compreendido: false, sugestoes: [msg('Quais inscrições estão abertas?')] });
  const datas = o.abertura ? `A candidatura ${o.estado === 'abertas' ? 'está **aberta**' : `abre em **${fmtDate(o.abertura)}**`}${o.prazoFinal ? ` e vai até **${fmtDate(o.prazoFinal)}**` : ''} (fonte oficial).` : null;
  const texto = datas
    ? `**${o.programa}** (${o.universidade}, ${o.anoAcademico}): ${o.estadoLabel}. ${datas}`
    : `**${o.programa}** (${o.universidade}, ${o.anoAcademico}): ${o.estadoLabel}.\n\nAinda não encontrei um calendário oficial confirmado para esse ano acadêmico, então não vou te passar uma data. Posso te avisar quando for publicado.`;
  return reply(u, 'quando-abre', {
    texto: `${texto}${o.verificacao ? `\n\n_${o.verificacao}_` : ''}`,
    cartoes: [{ tipo: 'oportunidades', itens: [o] }],
    sugestoes: [!o.acompanhando && msg(`Avise-me quando abrirem as candidaturas do ${o.programa}`, 'Avise-me quando abrir'), rota(`/oportunidades/${o.id}`, 'Ver no Radar')],
    fontes: (d.radar?.fontes || []).map((f) => ({ titulo: f.titulo, url: f.url, orgao: f.verificadoEm ? `verificado em ${String(f.verificadoEm).slice(0, 10)}` : null })),
  });
}

async function openNow(u) {
  const r = await u.use('search_master_programs', { busca: '', somenteAbertas: true, limite: 6 });
  if (!r.ok) return errorReply(u, 'inscricoes-abertas', r.erro);
  const d = r.dados;
  return reply(u, 'inscricoes-abertas', {
    texto: d.programas.length ? `Com inscrições abertas agora (${d.anoAcademico}, fonte oficial): ${d.programas.length} programa(s). Veja abaixo.` : `No momento **não há inscrições abertas confirmadas** para ${d.anoAcademico} nos mestrados que o Radar monitora. Posso te avisar quando abrir o mestrado que te interessa.`,
    cartoes: d.programas.length ? [{ tipo: 'oportunidades', itens: d.programas }] : [],
    sugestoes: [msg('Encontre mestrados compatíveis com a minha formação'), rota('/oportunidades', 'Abrir o Radar')],
  });
}

async function programs(u) {
  const p = u.user.profile || {};
  const generic = /\b(meu perfil|minha (formacao|area|graduacao))\b/.test(u.t) || !programFromText(u).length;
  const busca = generic ? `${p.area || ''} ${p.formacao || ''}`.trim() : u.raw;
  if (!busca) return reply(u, 'mestrados', { texto: 'Qual área te interessa? Ex.: "mestrados em Ciência da Computação". Se preferir, complete sua formação no perfil e eu busco os compatíveis.', sugestoes: [rota('/perfil', 'Completar meu perfil')], compreendido: false });
  const r = await u.use('search_master_programs', { busca, compativel: /compativ/.test(u.t) && Boolean(p.formacao), limite: 6 });
  if (!r.ok) return errorReply(u, 'mestrados', r.erro);
  const d = r.dados;
  return reply(u, 'mestrados', {
    texto: d.programas.length ? `Encontrei **${d.total} mestrado(s)** oficiais ligados a "${busca}" no Radar (${d.anoAcademico}). Os primeiros estão abaixo, com a situação das inscrições verificada.` : `Não encontrei mestrados ligados a "${busca}" entre os que o Radar monitora (hoje: UGR). Tente outro termo.`,
    cartoes: d.programas.length ? [{ tipo: 'oportunidades', itens: d.programas }] : [],
    sugestoes: [d.programas[0] && msg(`Quando abre o ${d.programas[0].programa}?`, 'Quando abre?'), rota('/oportunidades', 'Ver todos no Radar')],
  });
}

async function notifyMe(u) {
  const progs = programFromText(u);
  let opp = progs[0];
  if (!opp && u.jr) { const d = await u.use('get_verified_deadlines', {}); opp = d.ok && d.dados.oportunidade ? { id: d.dados.oportunidade.id, acompanhando: d.dados.oportunidade.acompanhando } : null; }
  if (!opp) return reply(u, 'avise-me', { texto: 'De qual mestrado você quer ser avisado? Me diga o nome, ou crie uma jornada com ele.', compreendido: false, sugestoes: [rota('/oportunidades', 'Escolher no Radar')] });
  const p = await u.plan('Acompanhar no Radar', [{ ferramenta: 'subscribe_to_opportunity', input: { oportunidadeId: opp.id } }], { confirmarRotulo: 'Ativar avisos' });
  if (p.erro) return errorReply(u, 'avise-me', p.erro);
  return reply(u, 'avise-me', { texto: `${p.proposta.passos[0].resumo} Eu aviso aqui na Estuvia quando o calendário oficial sair, quando as inscrições abrirem e quando o prazo estiver acabando (ainda não enviamos e-mail).\n\nConfirma?`, proposta: p.proposta });
}

async function howToApply(u) {
  const d = u.jr ? await u.use('get_verified_deadlines', {}) : null;
  const o = d?.ok ? d.dados.oportunidade : null;
  const situacao = o
    ? o.estado === 'abertas' ? `Boa notícia: as inscrições do seu mestrado estão **abertas** até ${fmtDate(o.prazoFinal)} (fonte oficial).`
      : o.abertura ? `As inscrições do seu mestrado abrem em **${fmtDate(o.abertura)}** (fonte oficial).`
        : `Para ${o.anoAcademico}, ainda não há calendário oficial confirmado do seu mestrado.`
    : 'Primeiro, vamos confirmar se o prazo do seu mestrado está aberto.';
  return reply(u, 'como-inscrever', {
    texto: `Você vai usar o portal do **Distrito Único Andaluz (DUA)**, é o site único onde se faz a candidatura aos mestrados das universidades públicas da Andaluzia.\n\n${situacao}\n\n**Próximo passo:** ${u.jr ? 'Missão 3.1, acessar o portal do DUA.' : 'escolher o mestrado e criar sua jornada.'}`,
    cartoes: o ? [{ tipo: 'oportunidades', itens: [o] }] : [],
    sugestoes: [u.jr ? rota(`/j/${u.jr.id}/r/3`, 'Abrir a Rodada 3') : rota('/jornadas/nova', 'Criar minha jornada'), o && !o.acompanhando && !o.abertura && msg('Avise-me quando abrirem as candidaturas do meu mestrado', 'Avise-me quando abrir')],
  });
}

// ---------- Consulado ----------

// Estado citado na mensagem: sigla em maiúsculas ("PB") ou nome por extenso ("Paraíba").
function stateIn(u) {
  const sig = /\b([A-Z]{2})\b/.exec(u.raw || '')?.[1];
  if (sig && UF_NOMES[sig]) return sig;
  return Object.entries(UF_NOMES).sort((a, b) => b[1].length - a[1].length).find(([, n]) => new RegExp(`\\b${normalize(n)}\\b`).test(u.t))?.[0];
}

async function consulate(u) {
  const estado = stateIn(u);
  const r = await u.use('find_consulate', estado ? { estado } : {});
  if (!r.ok) return errorReply(u, 'consulado', r.erro);
  const d = r.dados;
  if (d.status === 'sem-estado') {
    return reply(u, 'consulado', { texto: 'Me diga em qual estado do Brasil você mora (ex.: "moro na Paraíba") e eu mostro o seu consulado.', sugestoes: [rota('/perfil', 'Informar meu estado no perfil')] });
  }
  const texto = d.status === 'encontrado'
    ? `Quem mora **${d.estado.em}** é atendido pelo **${d.consulado.nome}**. Os contatos e a página oficial do visto estão no cartão.`
    : 'Ainda não tenho esse consulado confirmado na base oficial da Estuvia, então não vou adivinhar. O cartão leva à página oficial que mostra a repartição de cada região.';
  return reply(u, 'consulado', {
    texto, cartoes: [d],
    sugestoes: d.status === 'encontrado' ? [msg('O que preciso preparar para o visto?'), msg('Escreva para o consulado perguntando quais documentos preciso', 'E-mail ao consulado')] : [],
  });
}

// ---------- Carteira de documentos ----------

async function documentGuide(u) {
  const doc = matchDocument(u.t);
  const r = await u.use('get_document_guide', { documentoId: doc.id });
  if (!r.ok) return errorReply(u, 'como-conseguir-documento', r.erro);
  const d = r.dados;
  const texto = d.status === 'nao-se-aplica'
    ? `Pelo seu perfil, você **não precisa** de "${d.nome}" agora: ${d.motivo}`
    : d.status === 'pronto' || d.status === 'enviado'
      ? `Você já marcou "${d.nome}" como **${d.statusLabel.toLowerCase()}**. Se precisar de uma nova via, os passos estão no cartão.`
      : d.aguardando
        ? `Você já pediu **${d.nome.toLowerCase()}** e está aguardando a emissão. Quando chegar, toque em "Sim, já tenho" na carteira; se quiser, coloco um lembrete para conferir.`
        : `Veja como conseguir **${d.nome.toLowerCase()}** em poucos passos. Quando estiver com ele, toque em "Sim, já tenho" na carteira.`;
  return reply(u, 'como-conseguir-documento', { texto, cartoes: [d], fontes: d.fonte ? [d.fonte] : [], sugestoes: [rota(d.rota, 'Abrir documento')] });
}

// "Preciso apostilar/traduzir?" — a regra é da fonte do procedimento; a Estuvia não decide sozinha.
async function apostille(u) {
  const doc = matchDocument(u.t.replace(/\b(apostil\w*|traduc\w*|traducoes|traduz\w*)\b/g, ' '));
  const r = await u.use('get_document_guide', { documentoId: 'traducoes' });
  if (!r.ok) return errorReply(u, 'apostila', r.erro);
  const c = r.dados.consulado;
  return reply(u, 'apostila', {
    texto: `Só apostile ou traduza${doc ? ` o seu **${doc.nome.toLowerCase()}**` : ''} **quando a lista oficial pedir**. Para o visto, a lista que vale é a do seu consulado${c ? ` (**${c.nome}**)` : ''}; para a candidatura, a convocatória e a ficha do mestrado.\n\nNão dá para eu confirmar isso por você sem a fonte: confira lá antes de pagar por apostila ou tradução.`,
    cartoes: [r.dados], fontes: r.dados.fonte ? [r.dados.fonte] : [],
    sugestoes: [doc && rota(`/documentos/${doc.id}`, `Abrir ${doc.nome.split(' (')[0]}`), rota('/documentos/traducoes', 'Abrir apostilas e traduções')].filter(Boolean),
  });
}

async function organizeFiles(u) {
  const r = await u.use('get_required_documents', {});
  if (!r.ok) return errorReply(u, 'organizar-arquivos', r.erro);
  const d = r.dados;
  const comArquivo = d.documentos.filter((x) => x.anexos).length;
  return reply(u, 'organizar-arquivos', {
    texto: `Na sua carteira de documentos cada documento tem o seu lugar: você guarda o arquivo (PDF ou foto), troca por uma versão mais nova e marca o que já conferiu. ${comArquivo ? `Você já guardou arquivos de ${comArquivo} documento(s).` : 'Você ainda não guardou nenhum arquivo.'}${d.proximo ? `\n\n**Comece por:** ${d.proximo.nome}.` : ''}\n\nEu não abro nem analiso os arquivos: quem confere o conteúdo é você e, depois, o órgão oficial.`,
    cartoes: [{ tipo: 'documentos', itens: d.documentos.filter((x) => x.pendente).slice(0, 8), aviso: 'Os arquivos ficam cifrados na sua conta e só você acessa.', proximo: d.proximo }],
    sugestoes: [d.proximo && rota(d.proximo.rota, d.proximo.acao || 'Abrir documento'), rota('/documentos', 'Abrir meus documentos')].filter(Boolean),
  });
}

// ---------- Documentos e visto ----------

async function documents(u) {
  if (!u.jr) return noJourney(u, 'documentos');
  const finalidade = /\bvisto|consulad/.test(u.t) ? 'visto' : /\bbolsa|financ/.test(u.t) ? 'financiamento' : undefined;
  const r = await u.use('get_required_documents', { finalidade });
  if (!r.ok) return errorReply(u, 'documentos', r.erro);
  const d = r.dados;
  const pend = d.documentos.filter((x) => x.pendente);
  return reply(u, 'documentos', {
    texto: pend.length ? `Faltam **${pend.length} documento(s)**${finalidade ? ` para ${finalidade === 'visto' ? 'o visto' : 'o financiamento'}` : ''}. Os mais importantes agora: ${pend.filter((x) => x.exigencia === 'requerido').slice(0, 3).map((x) => x.nome).join(', ') || pend.slice(0, 3).map((x) => x.nome).join(', ')}.\n\nQuando um ficar pronto, toque nele ou me conte ("meu histórico está pronto").` : 'Todos os documentos das suas missões estão prontos ou não se aplicam. 👏',
    cartoes: [{ tipo: 'documentos', itens: d.documentos, consulado: d.consulado, aviso: d.aviso, proximo: d.proximo }],
    sugestoes: [d.proximo && rota(d.proximo.rota, d.proximo.acao || 'Abrir documento'), rota('/documentos', 'Abrir meus documentos'), finalidade !== 'visto' && msg('O que preciso preparar para o visto?')],
  });
}

async function visa(u) {
  if (!u.jr) return noJourney(u, 'visto');
  const docs = await u.use('get_required_documents', { finalidade: 'visto' });
  const pend = await u.use('get_pending_missions', { rodada: 5 });
  const next = pend.ok ? [...pend.dados.atencao, ...pend.dados.emAndamento, ...pend.dados.agora][0] : null;
  const faltam = docs.ok ? docs.dados.documentos.filter((x) => x.pendente) : [];
  const c = docs.ok ? docs.dados.consulado : null;
  return reply(u, 'visto', {
    texto: `O **visto de estudos** é a autorização para entrar na Espanha para estudar. Você pede no **consulado** que atende o seu estado${c ? ` (${c.nome})` : ''}.\n\n${faltam.length ? `No seu checklist ainda faltam ${faltam.length} documento(s).` : 'No seu checklist, os documentos do visto estão prontos.'} ${next ? `**Próximo passo:** Missão ${next.label} - ${next.titulo}.` : pend.ok && pend.dados.bloqueadas.length ? 'As missões do visto liberam depois da admissão e da matrícula.' : ''}\n\nA lista que vale é a do seu consulado. Não prometo aprovação: o objetivo é você chegar lá com tudo certo.`,
    cartoes: docs.ok ? [{ tipo: 'documentos', itens: docs.dados.documentos, consulado: c, aviso: docs.dados.aviso }] : [],
    sugestoes: [next && rota(`/j/${u.jr.id}/m/${next.id}`, `Abrir Missão ${next.label}`), msg('Escreva para o consulado perguntando quais documentos preciso', 'E-mail ao consulado')],
  });
}

// ---------- Moradia ----------

// ---------- Viagem ----------

function travelPlan(u) {
  u.usadas.push({ nome: 'get_travel_plan', ok: true, efeito: 'leitura' });
  return computeTravel(u.user, u.ctx.contexto.journeyId);
}
const travelCard = (t) => ({ tipo: 'viagem', viagem: { status: t.status, statusLabel: t.statusLabel, origem: t.origem, destino: t.destino, dataViagem: t.dataViagem, cotacoes: t.cotacoes.map((c) => ({ rota: c.rota, total: c.custo.total, completo: c.custo.completo, escolhida: Boolean(c.escolhida), comprada: Boolean(c.comprada) })), escolhida: t.escolhida ? { rota: t.escolhida.rota, percurso: t.escolhida.percursoNome } : null } });
const travelLink = rota('/viagem', 'Abrir Minha viagem');

async function travelOverview(u) {
  const t = travelPlan(u);
  const next = !t.origem.iata || t.origem.sugerido ? 'confirmar de qual aeroporto você vai sair'
    : !t.cotacoes.length ? 'pesquisar e salvar pelo menos 2 cotações'
      : !t.escolhida ? 'comparar as cotações e escolher uma rota'
        : !t.escolhida.comprada ? (t.visto.aprovado ? 'comprar a passagem e registrar a compra' : 'esperar o visto (ou só comprar tarifa com remarcação)')
          : 'preparar a chegada e criar os compromissos na agenda';
  return reply(u, 'viagem', {
    texto: `Sua viagem: **${t.statusLabel}** (${t.origem.nome || 'origem a definir'} → ${t.destino.cidade || 'destino'}).${t.cotacoes.length ? ` Você tem ${t.cotacoes.length} cotação(ões).` : ''}\n\n**Próximo passo:** ${next}.${t.visto.aviso ? `\n\n_${t.visto.aviso.titulo} ${t.visto.aviso.texto}_` : ''}`,
    cartoes: [travelCard(t)], sugestoes: [travelLink, msg('Compensa mais ir por Madri ou Málaga?')],
  });
}

async function travelRoute(u) {
  const t = travelPlan(u);
  if (!t.percursos.length) return reply(u, 'viagem-rota', { texto: 'Ainda não tenho percursos cadastrados para o seu destino. Salve as cotações que encontrar e eu comparo o custo total.', sugestoes: [travelLink] });
  const completas = t.cotacoes.filter((c) => c.custo.completo && c.custo.total !== null).sort((a, b) => a.custo.total - b.custo.total);
  if (completas.length >= 2) {
    const [a, b] = completas;
    const alertasA = a.consideracoes.filter((x) => x.nivel !== 'info').map((x) => x.texto);
    return reply(u, 'viagem-rota', {
      texto: `Pelas suas cotações, **${a.rota}** sai mais barata: ${eur(a.custo.total)} contra ${eur(b.custo.total)} (${b.rota}).${alertasA.length ? `\n\nMas atenção: ${alertasA.join(' ')}` : ''}\n\nO mais barato nem sempre é o melhor: compare horário de chegada, conexões e o trecho por terra.`,
      cartoes: [travelCard(t)], sugestoes: [travelLink],
    });
  }
  return reply(u, 'viagem-rota', {
    texto: `Para ${t.destino.cidade}, há ${t.percursos.length} caminhos possíveis:\n${t.percursos.map((p) => `- **${p.nome}:** ${p.resumo}`).join('\n')}\n\nNão sei qual sai mais barato sem preços reais: salve pelo menos 2 cotações completas (voo + bagagem + trecho por terra) e eu comparo.`,
    cartoes: [travelCard(t)], sugestoes: [travelLink],
    fontes: t.percursos.flatMap((p) => p.fontes).map((f) => ({ titulo: f.titulo, url: f.url })),
  });
}

async function travelBaggage(u) {
  const t = travelPlan(u);
  const comBagagem = t.cotacoes.filter((c) => c.custo.partes.find((p) => p.id === 'bagagem').valor !== null);
  const malas = t.perfil?.malas;
  if (!comBagagem.length) return reply(u, 'viagem-bagagem', { texto: `Não tenho preço de bagagem nas suas cotações${malas !== undefined && malas !== null ? ` (você disse que vai despachar ${malas} mala${malas === 1 ? '' : 's'})` : ''}. O valor muda por companhia e tarifa: confira no site ao cotar e registre em "Mais detalhes" da cotação.`, sugestoes: [travelLink] });
  return reply(u, 'viagem-bagagem', {
    texto: `Bagagem nas suas cotações:\n${comBagagem.map((c) => `- **${c.rota}:** ${eur(c.custo.partes.find((p) => p.id === 'bagagem').valor)}`).join('\n')}${t.cotacoes.length > comBagagem.length ? `\n\nEm ${t.cotacoes.length - comBagagem.length} cotação(ões) a bagagem não foi informada, o total delas pode subir.` : ''}`,
    sugestoes: [travelLink],
  });
}

async function travelConnection(u) {
  const t = travelPlan(u);
  const c = t.escolhida || t.cotacoes[0];
  if (!c) return reply(u, 'viagem-conexao', { texto: 'Ainda não há cotação salva para eu olhar. Salve a passagem que encontrou (o link basta) e me pergunte de novo.', sugestoes: [travelLink] });
  const riscos = c.consideracoes.filter((x) => x.nivel !== 'info').map((x) => x.texto);
  return reply(u, 'viagem-conexao', {
    texto: `Não tenho o tempo exato de conexão de **${c.rota}**, esse dado só está no site da companhia, e o mínimo seguro depende do aeroporto. O que eu sei:\n${riscos.length ? riscos.map((r) => `- ${r}`).join('\n') : '- Nenhum alerta pelos dados que você informou.'}\n\nRegra prática: com **bilhete único**, a companhia reacomoda você se perder a conexão; com bilhetes separados, não.`,
    sugestoes: [travelLink],
  });
}

async function travelArrival(u) {
  const t = travelPlan(u);
  const ch = t.chegada;
  if (!ch.aeroporto) return reply(u, 'viagem-chegada', { texto: `Primeiro escolha a rota (Madri, Málaga ou o aeroporto de ${t.destino.cidade || 'destino'}): o caminho até a moradia depende de onde você chega.`, sugestoes: [travelLink] });
  return reply(u, 'viagem-chegada', {
    texto: `${ch.frase || `Você chega em ${ch.aeroporto}.`}\n${ch.opcoes.map((o) => `- ${o.de} → ${o.para}: ${o.rotulo}`).join('\n')}\n\n${ch.moradia ? `Depois, até **${ch.moradia.nome}**${ch.moradia.bairro ? ` (${ch.moradia.bairro})` : ''}.` : 'Você ainda não escolheu a moradia: sem ela eu não consigo planejar o último trecho.'} Horários e preços: confira nos sites oficiais.`,
    fontes: (ch.fontes || []).map((f) => ({ titulo: f.titulo, url: f.url })),
    sugestoes: [travelLink, !ch.moradia && rota('/novo-lar', 'Organizar minha moradia')],
  });
}

async function travelChanged(u) {
  const t = travelPlan(u);
  if (!t.escolhida) return reply(u, 'viagem-mudou', { texto: 'Ainda não há rota escolhida na sua viagem. Atualize a cotação em "Minha viagem" e eu reorganizo o resto.', sugestoes: [travelLink] });
  const changes = travelAgendaChanges(u.user, t);
  return reply(u, 'viagem-mudou', {
    texto: changes.length
      ? `Vi que a data da viagem mudou para **${fmtDate(t.dataViagem)}**. ${changes.length} compromisso(s) da agenda podem ser atualizados:\n${changes.map((c) => `- ${c.titulo}: ${fmtDate(c.dataAtual)} → ${fmtDate(c.novaData)}`).join('\n')}\n\nConfirme em "Minha viagem" → Compromissos da viagem. Nada muda sem você.`
      : 'Atualize a nova data ou horário na sua cotação (botão "Editar viagem"). Assim que você salvar, eu mostro quais compromissos da agenda precisam mudar, e só altero com a sua confirmação.',
    sugestoes: [travelLink],
  });
}

async function housing(u) {
  const r = await u.use('get_housing_options', {});
  if (!r.ok) return errorReply(u, 'moradia', r.erro);
  const op = r.dados.opcoes;
  return reply(u, 'moradia', {
    texto: op.length ? `Você salvou ${op.length} opção(ões). A mais barata é **${op[0].nome}** (€${op[0].mensal}/mês + caução €${op[0].caucao}).` : 'Você ainda não salvou opções de moradia. Eu não busco anúncios na internet, mas quando você encontrar um, me mande os dados (preço, caução, link) que eu salvo, comparo e aponto riscos.',
    cartoes: op.length ? [{ tipo: 'moradias', itens: op, meses: r.dados.meses }] : [],
    sugestoes: [op.length >= 2 && msg('Compare minhas opções de moradia'), rota('/novo-lar', 'Abrir Meu novo lar'), msg('Esse anúncio parece suspeito?', 'Checar um anúncio')],
  });
}

async function compareHousing(u) {
  const r = await u.use('compare_housing_options', {});
  if (!r.ok) return errorReply(u, 'comparar-moradias', r.erro, { sugestoes: [rota('/novo-lar', 'Salvar opções')] });
  const d = r.dados;
  const cheap = d.comparacao.find((x) => x.id === d.maisBarata);
  const entry = d.comparacao.find((x) => x.id === d.menorEntrada);
  return reply(u, 'comparar-moradias', {
    texto: `**Mais barata por mês:** ${cheap.nome} (€${cheap.mensal}/mês). **Menor valor de entrada:** ${entry.nome} (€${entry.entrada}: caução + 1º mês).${d.observacoes.length ? `\n\nAtenção: ${d.observacoes.slice(0, 2).join(' ')}` : ''}`,
    cartoes: [{ tipo: 'moradias', itens: d.comparacao, meses: d.meses, destaque: d.maisBarata }],
    sugestoes: [msg('Esse anúncio parece suspeito?', 'Checar riscos')],
  });
}

async function listingRisk(u) {
  const op = (u.user.housing || []).find((h) => u.t.includes(normalize(h.nome)));
  const texto = u.raw.length > 60 ? u.raw : '';
  if (!op && !texto) return reply(u, 'anuncio-suspeito', { texto: 'Cole aqui o texto do anúncio ou da conversa com o anunciante (sem dados pessoais), ou diga o nome da opção salva, que eu aponto os sinais de risco.', compreendido: false });
  const r = await u.use('assess_listing_risk', { ...(texto ? { texto: texto.slice(0, 3000) } : {}), ...(op ? { opcaoId: op.id } : {}) });
  if (!r.ok) return errorReply(u, 'anuncio-suspeito', r.erro);
  const d = r.dados;
  return reply(u, 'anuncio-suspeito', {
    texto: `${d.conclusao}${d.sinais.length ? `\n\n${d.sinais.slice(0, 3).map((s) => `- ${s}`).join('\n')}` : ''}\n\nRegra de ouro: **nunca pague caução nem reserva antes de ver o contrato e confirmar quem é o anunciante.**`,
    cartoes: [{ tipo: 'riscos', sinais: d.sinais, checklist: d.checklistPendente }],
  });
}

async function rentCosts(u) {
  const r = await u.use('get_housing_options', {});
  if (!r.ok) return errorReply(u, 'aluguel', r.erro);
  const op = r.dados.opcoes;
  if (!op.length) return housing(u);
  const esc = op.find((x) => x.status === 'escolhida') || op[0];
  return reply(u, 'aluguel', {
    texto: `Com **${esc.nome}**: €${esc.mensal}/mês (aluguel + despesas) e caução de €${esc.caucao}. Para entrar, você precisa de cerca de **€${esc.entrada}** (caução + 1º mês). Em ${r.dados.meses} meses, o total fica em €${esc.totalPeriodo}.${esc.inclusas ? '' : '\n\nPergunte o que está incluso (contas, internet): isso muda o custo real.'}`,
    cartoes: [{ tipo: 'moradias', itens: op, meses: r.dados.meses, destaque: esc.id }],
    sugestoes: [op.length >= 2 && msg('Compare minhas opções de moradia')],
  });
}

// ---------- E-mail ----------

async function email(u) {
  const destinatario = /consulad/.test(u.t) ? 'consulado' : /professor|orientador/.test(u.t) ? 'professor' : /coordena/.test(u.t) ? 'coordenador' : /universidade|secretaria|faculdade/.test(u.t) ? 'universidade' : 'coordenador';
  const dm = /(?:perguntando|para perguntar|sobre|pedindo|com a duvida)\s+(.{5,300})$/i.exec(u.raw);
  const r = await u.use('draft_email', { destinatario, ...(dm ? { duvida: dm[1].replace(/[.!?]+$/, '') } : {}) });
  if (!r.ok) return errorReply(u, 'email', r.erro);
  return reply(u, 'email', {
    texto: `Preparei um rascunho em espanhol${dm ? '' : ' (complete a sua dúvida no trecho entre colchetes)'}. Revise, copie e envie pelo seu e-mail, eu não envio mensagens.`,
    cartoes: [{ tipo: 'email', ...r.dados }],
    sugestoes: destinatario !== 'consulado' && u.jr ? [rota(`/j/${u.jr.id}/m/3.8`, 'Encontrar o contato oficial')] : [],
  });
}

// ---------- Prazos ----------

async function deadlines(u) {
  if (!u.jr) return noJourney(u, 'prazos');
  const r = await u.use('get_verified_deadlines', {});
  if (!r.ok) return errorReply(u, 'prazos', r.erro);
  const d = r.dados;
  const futuros = d.daJornada.filter((p) => p.diasRestantes >= 0);
  const ORIG = { oficial: 'oficial', previsto: 'previsão', declarado: 'informado por você' };
  return reply(u, 'prazos', {
    texto: futuros.length ? `Seu próximo prazo: **${futuros[0].titulo}** em ${fmtDate(futuros[0].data)} (faltam ${futuros[0].diasRestantes} dia(s); ${ORIG[futuros[0].origem] || futuros[0].origem}).${d.oportunidade && !d.oportunidade.abertura ? `\n\nO calendário oficial de candidatura ${d.oportunidade.anoAcademico} ainda não foi publicado.` : ''}` : `Você não tem prazos futuros cadastrados.${d.oportunidade && !d.oportunidade.abertura ? ` O calendário oficial ${d.oportunidade.anoAcademico} ainda não foi publicado, posso te avisar.` : ''}`,
    cartoes: [{ tipo: 'eventos', titulo: 'Prazos', eventos: [], prazos: futuros.map((p) => ({ titulo: p.titulo, data: p.data, origem: p.origem, missao: p.missao })) }],
    sugestoes: [d.oportunidade && !d.oportunidade.acompanhando && msg('Avise-me quando abrirem as candidaturas do meu mestrado', 'Avise-me quando abrir'), msg('Organize minha semana.')],
  });
}

// ---------- Memória e glossário ----------

async function memory(u) {
  const st = mentorState(u.user);
  const notas = openNotes(u.user);
  return reply(u, 'memoria', {
    texto: `Eu não guardo nossas conversas. Uso os dados que você já cadastrou na Estuvia (com as permissões abaixo)${notas.length ? ` e ${notas.length} pendência(s) que você me pediu para lembrar` : ''}. Você pode ver, desligar e apagar tudo isso.`,
    cartoes: [{ tipo: 'memoria', permissoes: Object.entries(st.permissoes).map(([k, v]) => ({ id: k, rotulo: PERMISSIONS[k], ativo: v })), notas }],
    sugestoes: [{ tipo: 'abrir-memoria', rotulo: 'Gerenciar o que o Mentor sabe' }],
  });
}

async function glossary(u) {
  const g = glossaryTerm(u.raw);
  if (g) return reply(u, 'glossario', { texto: `**${g.termo}:** ${g.texto}`, sugestoes: [msg('O que faço agora?')] });
  return fallback(u);
}

// ---------- Pesquisa na web e vídeos ----------

// Tira da frase as palavras do pedido ("pesquise notícias sobre…") e fica com o assunto.
const TRIGGERS = /\b(me |por favor |pfv |pode |poderia |quero |queria |gostaria de )?(pesquis\w*|busc\w*|procur\w*|encontr\w*|ach\w*|mostr\w*|ver|veja|traga|tem|ha|quais|qual)\b|\b(as |os |umas? |uns |alguns? |algumas )?(ultimas |ultimos |novas |novos )?(noticias?|novidades?|manchetes?|videos?|videoaulas?|aulas?|tutoria(l|is)|youtube)\b|\b(na|da) (web|internet)\b|\b(sobre|a respeito( de| do| da)?|que expliq\w*|explicando|ensinando|de como)\b|\b(recentes?|hoje|agora)\b|[?!.]/g;
function topicOf(u, fallbackTopic) {
  const rest = u.raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(TRIGGERS, ' ').replace(/\b(o|a|os|as|de|do|da|dos|das|um|uma|e|que|me|meu|minha|para|pra)\b/g, ' ').replace(/\s+/g, ' ').trim();
  // "meu mestrado" / "minha missão" → o assunto vem da jornada.
  if (/\b(mestrado|master)\b/.test(u.t) && /\b(meu|minha|do meu)\b/.test(u.t) || !rest || rest.length < 3) return fallbackTopic();
  return rest;
}
function journeyTopic(u, { video = false } = {}) {
  const j = u.journey();
  if (video && u.ctx.contexto.missaoId) {
    const m = missionById(u.ctx.contexto.missaoId);
    if (m) return `${m.titulo} Espanha estudante`;
  }
  if (video) return 'como estudar mestrado na Espanha';
  return j?.destino?.universidade?.nome ? `${j.destino.universidade.nome} máster` : 'máster universidad Andalucía';
}

async function webSearch(u) {
  const busca = topicOf(u, () => journeyTopic(u));
  // Wikipédia só quando o estudante quer entender um conceito; para novidades, fonte oficial e imprensa.
  const tipos = /\bo que (e|sao|significa)\b|\bexplic\w*|\bconceito\b/.test(u.t) ? ['oficial', 'noticias', 'conceito'] : ['oficial', 'noticias'];
  const r = await u.use('search_web', { busca, tipos, limite: 4 });
  if (!r.ok) return errorReply(u, 'web', r.erro);
  const d = r.dados;
  const n = d.itens.length;
  const oficiais = d.itens.filter((i) => i.natureza === 'oficial').length;
  const falhou = d.falhas.length ? `

_Não consegui consultar agora: ${d.falhas.map((f) => `${f.fonte} (${f.motivo})`).join('; ')}._` : '';
  const texto = n
    ? `Pesquisei **"${d.consulta}"** em fontes gratuitas e encontrei **${n} resultado${n > 1 ? 's' : ''}**${oficiais ? `, ${oficiais} de fonte oficial` : ''}. Cada item mostra quem publicou e quando.

Notícia de imprensa não é regra oficial: prazos, documentos e valores só valem quando confirmados na fonte oficial.${falhou}`
    : `Pesquisei **"${d.consulta}"** e não encontrei resultados recentes nas fontes gratuitas que consulto (últimas notícias do Canal UGR e imprensa via GDELT).${falhou}

Tente com outras palavras, em espanhol (ex.: "máster", "matrícula", "visado de estudios").`;
  return reply(u, 'web', {
    texto,
    cartoes: n ? [{ tipo: 'web', consulta: d.consulta, consultadoEm: d.consultadoEm, itens: d.itens, aviso: d.aviso }] : [],
    sugestoes: [msg(`Vídeos sobre ${d.consulta}`, 'Ver vídeos sobre isso'), msg('Quais são os meus prazos?', 'Prazos oficiais (Radar)'), msg('O que faço agora?')],
  });
}

async function videosSearch(u) {
  const busca = topicOf(u, () => journeyTopic(u, { video: true }));
  const r = await u.use('search_videos', { busca, limite: 4 });
  if (!r.ok) return errorReply(u, 'videos', r.erro);
  const d = r.dados;
  const card = { tipo: 'videos', ...d };
  if (!d.configurado) {
    return reply(u, 'videos', {
      texto: `A lista de vídeos ainda não está ligada nesta Estuvia (ela usa a cota gratuita do YouTube e precisa de uma chave configurada pela equipe). Para não te mostrar nada inventado, deixei o link da busca **"${d.consulta}"** direto no YouTube.

Vídeos são de terceiros: regras e prazos, confira sempre na fonte oficial.`,
      cartoes: [card], sugestoes: [msg(`Notícias sobre ${d.consulta}`, 'Pesquisar na web'), msg('O que faço agora?')],
    });
  }
  const n = d.itens.length;
  return reply(u, 'videos', {
    texto: n
      ? `Separei **${n} vídeo${n > 1 ? 's' : ''}** sobre **"${d.consulta}"** (busca segura, de preferência em português, dos últimos 3 anos). Toque para assistir aqui mesmo.

São vídeos de terceiros: use para entender, e confirme regras e prazos na fonte oficial.`
      : `Não encontrei vídeos recentes sobre **"${d.consulta}"**${d.falha ? ` (${d.falha})` : ''}. Você pode abrir a busca direto no YouTube.`,
    cartoes: [card],
    sugestoes: [msg(`Notícias sobre ${d.consulta}`, 'Pesquisar na web'), msg('O que faço agora?')],
  });
}

async function fallback(u) {
  const k = retrieve(u.raw, { k: 2, min: 2.5 }).filter((x) => x.cobertura >= 0.5);
  u.usadas.push({ nome: 'get_official_sources', ok: k.length > 0, efeito: 'leitura' });
  if (k.length) {
    const c = publicChunk(k[0].chunk);
    return reply(u, 'base', {
      texto: `${c.texto}\n\n_${c.naturezaLabel}${c.fonte ? ` · ${c.fonte.orgao}` : ''}${c.verificadoEm ? ` · verificado em ${fmtDate(c.verificadoEm)}` : ''}._`,
      cartoes: k.length > 1 ? [{ tipo: 'fontes', trechos: k.map((x) => publicChunk(x.chunk)) }] : [],
      fontes: [c.fonte],
      sugestoes: [msg('Explique mais simples.', 'Explicar mais simples'), msg('O que faço agora?')],
    });
  }
  return reply(u, 'nao-entendi', {
    compreendido: false,
    texto: 'No Modo Guiado eu ainda não sei responder isso com segurança, e prefiro não inventar. Posso ajudar com missões, agenda, documentos, finanças, bolsas, prazos do Radar, moradia e e-mails.\n\nPara dúvidas específicas, confira a fonte oficial (ficha do mestrado, DUA ou consulado).',
    sugestoes: [msg('O que faço agora?'), msg('Quais são os meus prazos?'), msg('Quais documentos ainda faltam?')],
  });
}

export { Turn };
