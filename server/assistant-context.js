// Contexto da jornada para o assistente + respostas determinísticas das ações rápidas.
// Tudo aqui vem dos motores e dos dados cadastrados: nada é inventado.
// Respostas podem propor AÇÕES no sistema; elas só são executadas se o estudante confirmar.

import { computeJourney, missionDetail } from './journey-engine.js';
import { computeFinance } from './finance-engine.js';
import { DOCUMENTS, DOC_STATUS_LABEL } from './content/documents.js';
import { missionById, missionLabel } from './content/rounds.js';
import { SCHOLARSHIPS, SCHOLARSHIP_STATUS } from './content/scholarships.js';
import { consulateForState } from './content/places.js';

export const QUICK_ACTIONS = {
  naoentendi: 'Não entendi esta missão.',
  mostracomo: 'Me mostra como fazer.',
  semdocumento: 'Não tenho esse documento.',
  depois: 'Posso fazer isso depois?',
  agora: 'O que faço agora?',
  dificuldade: 'Estou com dificuldade nesta missão. Me ajude a entender e executar, passo a passo.',
  simples: 'Explique esta missão de forma mais simples.',
  documentos: 'Quais documentos eu preciso agora?',
  custo: 'Quanto isso custa?',
  economizar: 'Me ajude a economizar nesta jornada.',
  proximo: 'Qual é a minha próxima missão?',
  dua: 'Como faço minha inscrição no DUA?',
  certificado: 'Preciso de certificado de espanhol para esse mestrado?',
  contato: 'Encontre o contato do coordenador do meu curso.',
  email: 'Prepare um e-mail em espanhol para a universidade.',
  semdinheiro: 'Não tenho dinheiro suficiente para o visto. Quais são minhas opções?',
  bolsas: 'Quais bolsas eu posso solicitar?',
  apoio: 'Como comprovo apoio financeiro familiar?',
  vistodocs: 'Qual documentação ainda falta para o visto?',
  moradia: 'Me ajude a encontrar uma moradia mais barata.',
  semana: 'Organize minhas tarefas da próxima semana.',
  suficiente: 'O dinheiro que eu tenho é suficiente?',
  guardar: 'Quanto preciso guardar por mês até a viagem?',
};

// Pergunta livre → ação rápida equivalente (para responder com dados reais no modo offline).
const INTENTS = [
  ['semana', /organiz\w* (minha )?semana|minhas tarefas da pr[oó]xima semana|agenda/i],
  ['suficiente', /tenho\s*(r\$|€|eur)?\s*[\d.,]+\s*(mil|k)?.*(suficiente|d[aá]|basta)|[eé] suficiente\?/i],
  ['guardar', /quanto (preciso |tenho que |devo )?(guardar|economizar|juntar) por m[eê]s/i],
  ['semdinheiro', /n[aã]o tenho dinheiro|falta dinheiro|dinheiro suficiente|n[aã]o consigo comprovar/i],
  ['apoio', /apoio (financeiro )?familiar|patroc[ií]nio|padrasto|meus pais v[aã]o pagar/i],
  ['bolsas', /bolsa|beca|financiamento de estudo/i],
  ['email', /e-?mail em espanhol|redija|rascunho de e-?mail|escrever (para|ao) (o )?(professor|coordenador|universidade)/i],
  ['contato', /contato do (coordenador|professor)|coordenador do (meu )?curso|encontr\w* (o )?(professor|coordenador)/i],
  ['vistodocs', /documenta[cç][aã]o .*visto|falta .*visto|documentos do visto/i],
  ['moradia', /moradia|aluguel|apartamento|quarto mais barato/i],
  ['dua', /inscri[cç][aã]o no dua|como (me )?inscrev|distrito [uú]nico/i],
  ['certificado', /certificado de espanhol|dele|siele|preciso de certificado/i],
  ['proximo', /pr[oó]xim[oa] (passo|miss)|o que (eu )?fa[cç]o agora|por onde come[cç]/i],
  ['depois', /posso (fazer|deixar) (isso )?(para )?depois|d[aá] pra deixar pra depois/i],
  ['semdocumento', /n[aã]o tenho (esse|este|o) documento|n[aã]o tenho (o )?(diploma|hist[oó]rico|passaporte)/i],
  ['mostracomo', /me mostrw* como|como (eu )?fa[cç]o (isso|essa)/i],
  ['naoentendi', /n[aã]o entendi/i],
  ['documentos', /quais documentos|que documentos|documentos (eu )?preciso/i],
  ['custo', /quanto (isso )?custa|quanto vou gastar|custo total/i],
  ['economizar', /economiz|gastar menos|mais barato/i],
];
export const intentOf = (q) => INTENTS.find(([, re]) => re.test(q || ''))?.[0];

const eur = (v) => `€ ${Math.round(v).toLocaleString('pt-BR')}`;

export function resolveContext(user, journeyId, missaoId) {
  const jr = (user.journeys || []).find((j) => j.id === journeyId) || (user.journeys || [])[0] || null;
  if (!jr) return { jr: null, journey: null, mission: null, finance: null };
  const journey = computeJourney(user, jr);
  const mid = missaoId && missionById(missaoId) ? missaoId : journey.proximaMissao?.id;
  const mission = mid ? missionDetail(user, jr, mid) : null;
  return { jr, journey, mission, finance: computeFinance(user, jr) };
}

function pendingDocs(user, journey, finalidade) {
  const ids = new Set();
  journey.rodadas.flatMap((r) => r.missoes)
    .filter((m) => !['concluida', 'nao-aplicavel'].includes(m.status))
    .forEach((m) => (missionById(m.id).documentos || []).forEach((d) => ids.add(d)));
  return DOCUMENTS.filter((d) => ids.has(d.id) && (!finalidade || d.finalidade === finalidade))
    .map((d) => ({ ...d, status: user.documents?.[d.id] || 'pendente' }))
    .filter((d) => !['pronto', 'enviado', 'nao-se-aplica'].includes(d.status));
}

// Texto de contexto enviado à IA: o mínimo necessário (sem e-mail, sem documentos, sem dados de apoiadores).
export function contextText(user, { journey, mission, finance }) {
  const p = user.profile || {};
  const lines = [
    `Estudante: ${p.apelido || '-'}; nacionalidade ${p.nacionalidade || '-'}; reside em ${p.paisResidencia || '-'}${p.estado ? `/${p.estado}` : ''}; formação ${p.formacao || '-'}${p.instituicao ? ` (${p.instituicao})` : ''}; espanhol ${p.espanhol || '-'} (certificado ${p.certificadoEspanhol || 'nenhum'} ${p.certificadoNivel || ''}).`,
  ];
  if (!journey) return `${lines[0]}\nO estudante ainda não criou nenhuma jornada.`;
  const d = journey.destino;
  const atual = journey.rodadas.find((r) => r.numero === journey.rodadaAtual);
  lines.push(`Jornada: ${d.origem} → ${d.universidade?.nome || '-'} (${d.cidade || '-'}); mestrado ${d.programa?.nome || 'não definido'}${d.programa?.demo ? ' [DADO DEMONSTRATIVO]' : ''}; ano ${d.anoAcademico || '-'}; duração ${d.duracaoMeses || '-'} meses; progresso ${Math.round(journey.progresso * 100)}%; rodada atual ${atual.numero} — ${atual.titulo}.`);
  lines.push(`Situação registrada: adjudicação=${journey.situacao.adjudicacao}; matrícula=${journey.situacao.matricula}; visto=${journey.situacao.visto}.`);
  lines.push(`Próxima missão recomendada: ${journey.proximaMissao ? `${journey.proximaMissao.label} ${journey.proximaMissao.titulo} (${journey.proximaMissao.statusLabel})` : 'nenhuma'}.`);
  if (mission) {
    const pend = mission.objetivos.filter((o) => !o.feito).map((o) => o.texto);
    lines.push(`Missão em foco: ${mission.label} ${mission.definicao.titulo} — ${mission.statusLabel}. Complexidade: ${mission.complexidade || 'guiada'}${mission.complexidade === 'simples' ? ' (responda em 1–2 frases e ofereça mostrar mais)' : mission.complexidade === 'complexa' ? ' (acompanhe etapa por etapa)' : ''}; risco: ${mission.riscoInfo?.nivel || 'baixo'}. Objetivo: ${mission.definicao.objetivo} Pendentes: ${pend.join('; ') || 'nenhum'}. Bloqueada por: ${mission.bloqueadaPor.map((b) => b.label || b.titulo).join(', ') || 'nada'}.`);
  }
  lines.push(`Documentos ainda não prontos: ${pendingDocs(user, journey).map((x) => `${x.nome} (${DOC_STATUS_LABEL[x.status]})`).join('; ') || 'nenhum'}.`);
  lines.push(`Prazos cadastrados: ${journey.prazos.map((x) => `${x.titulo} em ${x.data} (${x.origem === 'oficial' ? 'regra oficial' : x.origem === 'previsto' ? 'previsão' : 'declarado pelo estudante'})`).join('; ') || 'nenhum'}.`);
  if (finance) {
    lines.push(`Finanças (estimativas): exigência estimada do visto ${eur(finance.exigenciaVisto)} (IPREM ${finance.iprem.ano} €${finance.iprem.mensal}/mês × ${finance.meses} meses, ${finance.iprem.status === 'pendente' ? 'valor pendente de confirmação' : 'verificado'}); orçamento ${eur(finance.orcamento)}; recursos confirmados ${eur(finance.confirmados)}; previstos ${eur(finance.previstos)}; déficit ${eur(finance.deficit)}.`);
  }
  const bolsas = user.scholarshipApps || [];
  if (bolsas.length) lines.push(`Bolsas acompanhadas: ${bolsas.map((b) => `${b.nome} (${b.status}${b.prazo ? `, prazo ${b.prazo}` : ''})`).join('; ')}.`);
  const casas = user.housing || [];
  if (casas.length) lines.push(`Moradias salvas: ${casas.map((c) => `${c.nome} €${c.aluguel}/mês (${c.status})`).join('; ')}.`);
  const semana = (user.planner || []).filter((e) => e.data >= new Date().toISOString().slice(0, 10)).slice(0, 8);
  if (semana.length) lines.push(`Próximos itens da agenda: ${semana.map((e) => `${e.data} ${e.inicio} ${e.titulo}`).join('; ')}.`);
  return lines.join('\n');
}

// ---------- Respostas determinísticas (modo offline e base para a IA) ----------

const rota = (r, rotulo) => ({ tipo: 'rota', rota: r, rotulo });

// Valor citado na pergunta ("tenho R$ 20.000", "tenho 5 mil euros") — só para simular, nunca grava nada.
function amountIn(text) {
  const m = /(r\$|€|eur|euros?|reais)?\s*([\d.]+(?:,\d+)?)\s*(mil|k)?\s*(r\$|€|eur|euros?|reais)?/i.exec((text || '').replace(/tenho/i, ''));
  if (!m) return null;
  let v = Number(m[2].replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(v) || v <= 0) return null;
  if (m[3]) v *= 1000;
  const unit = (m[1] || m[4] || '').toLowerCase();
  return { valor: v, moeda: /€|eur/.test(unit) ? 'EUR' : 'BRL' };
}

export function quickAnswer(action, user, ctx, pergunta = '') {
  const { journey, mission: m, finance: f, jr } = ctx;
  if (!journey) return { texto: 'Você ainda não tem uma jornada. Crie a primeira em **Minhas Jornadas** e eu passo a te orientar com base nela.', fontes: [], acoes: [rota('/jornadas/nova', 'Criar minha jornada')] };
  const mPath = (id) => `/j/${jr.id}/m/${id}`;
  const ask = (acao, rotulo) => ({ tipo: 'perguntar', acao, rotulo });
  // Respostas curtas primeiro; o estudante aprofunda se quiser.
  const short = (t, n = 220) => (t && t.length > n ? `${t.slice(0, n).replace(/\s+\S*$/, '')}…` : t || '');
  if (m && m.status === 'bloqueada' && ['naoentendi', 'mostracomo', 'semdocumento', 'depois'].includes(action)) {
    return { texto: `A **Missão ${m.label}** ainda está bloqueada. Antes, falta: ${m.bloqueadaPor.map((b) => `**${b.label ? `${b.label} ` : ''}${b.titulo}**`).join(', ')}.`, fontes: [], acoes: journey.proximaMissao ? [rota(mPath(journey.proximaMissao.id), `Ir para a missão ${journey.proximaMissao.label}`)] : [] };
  }
  switch (action) {
    case 'agora': return quickAnswer('proximo', user, ctx);
    case 'naoentendi': {
      if (!m) break;
      const next = m.objetivos.find((o) => !o.feito);
      return {
        texto: `**Em uma frase:** ${m.definicao.resumo || m.definicao.objetivo}\n\n${next ? `**Agora é só isto:** ${next.texto}.` : 'Você já fez tudo. Falta só confirmar que concluiu.'}`,
        fontes: [], acoes: [ask('mostracomo', 'Me mostra como fazer'), ask('dificuldade', 'Quero a explicação completa')],
      };
    }
    case 'mostracomo': {
      if (!m) break;
      const next = m.objetivos.find((o) => !o.feito);
      const guia = m.definicao.comoExecutar[0];
      return {
        texto: `${next ? `**Passo de agora:** ${next.texto}.` : '**Tudo feito.** Confirme a conclusão na missão.'}${guia ? `\n\n**Como:** ${short(guia.texto)}` : ''}${m.linkOficial?.url ? '\n\nUse o botão **Abrir site oficial** na missão e volte aqui para marcar.' : ''}`,
        fontes: m.fontes.slice(0, 1), acoes: [ask('dificuldade', 'Quero o passo a passo completo'), rota(mPath(m.id), 'Voltar à missão')],
      };
    }
    case 'semdocumento': {
      if (!m) break;
      const falta = m.documentos.filter((d) => !['pronto', 'enviado', 'nao-se-aplica'].includes(d.status));
      if (!falta.length) return { texto: 'Esta missão não pede um documento que esteja faltando para você. Se for outro documento, veja a área **Documentos**.', fontes: [], acoes: [rota('/documentos', 'Abrir meus documentos')] };
      return {
        texto: `Sem problema. Veja como conseguir:\n${falta.slice(0, 3).map((d) => `- **${d.nome}:** ${d.dica}`).join('\n')}\n\nEnquanto isso, marque o documento como **Em preparação** para não esquecer.`,
        fontes: [], acoes: [rota('/documentos', 'Abrir meus documentos'), { tipo: 'organizar-semana', rotulo: 'Lembrar na Agenda AI' }, ask('dificuldade', 'Ainda não sei como conseguir')],
      };
    }
    case 'depois': {
      if (!m) break;
      const st = journey.rodadas.flatMap((r) => r.missoes).find((x) => x.id === m.id);
      const urgente = st?.prioridade === 'critica' || (m.prazo && m.prazo.diasRestantes <= 14);
      const libera = m.dependentes.filter((d) => d.status === 'bloqueada');
      const texto = urgente
        ? `**Melhor não deixar para depois.**${m.prazo ? ` O prazo é ${m.prazo.data.split('-').reverse().join('/')} (faltam ${m.prazo.diasRestantes} dia(s)).` : ' Sua situação atual torna esta missão urgente.'}`
        : libera.length
          ? `**Pode, mas ela destrava outras etapas:** ${libera.slice(0, 3).map((d) => `${d.label} ${d.titulo}`).join(', ')}. Quanto antes, melhor.`
          : '**Pode sim.** Ela não tem prazo cadastrado e não trava outras missões agora. Que tal reservar um horário na semana?';
      return { texto, fontes: [], acoes: [{ tipo: 'organizar-semana', rotulo: 'Agendar na minha semana' }] };
    }
    case 'proximo': {
      const n = journey.proximaMissao;
      if (!n) return { texto: 'Não há missões disponíveis agora: as restantes estão concluídas, aguardando terceiros ou bloqueadas por dependências.', fontes: [], acoes: [] };
      return {
        texto: `Sua próxima missão é a **${n.label} — ${n.titulo}** (${n.statusLabel.toLowerCase()}${n.prioridade === 'critica' ? ', prioridade crítica' : ''}).\n\n${n.resumo}\n\n_Recomendação calculada pela plataforma a partir de prazos, dependências e prioridade._`,
        fontes: [], acoes: [rota(mPath(n.id), `Abrir missão ${n.label}`)],
      };
    }
    case 'documentos': {
      if (m?.documentos.length) {
        return { texto: `Para a **Missão ${m.label} — ${m.definicao.titulo}**:\n\n${m.documentos.map((d) => `- **${d.nome}** — ${d.statusLabel}. ${d.dica}`).join('\n')}`, fontes: m.fontes, acoes: [rota('/documentos', 'Abrir área de documentos')] };
      }
      const docs = pendingDocs(user, journey);
      return { texto: docs.length ? `Documentos ainda não prontos:\n\n${docs.map((d) => `- **${d.nome}** — ${DOC_STATUS_LABEL[d.status]}`).join('\n')}` : 'Todos os documentos das suas missões abertas estão prontos ou não se aplicam. 👏', fontes: [], acoes: [rota('/documentos', 'Abrir área de documentos')] };
    }
    case 'vistodocs': {
      const docs = pendingDocs(user, journey, 'visto');
      const c = consulateForState(user.profile?.estado);
      return {
        texto: `${docs.length ? `Para o visto ainda faltam (conforme o seu checklist):\n\n${docs.map((d) => `- **${d.nome}** — ${DOC_STATUS_LABEL[d.status]} (${d.exigencia === 'requerido' ? 'requerido' : 'conforme o caso'})`).join('\n')}` : 'No seu checklist, os documentos do visto estão prontos ou não se aplicam.'}\n\nA lista que vale é a do **seu consulado**${c ? ` (${c.nome})` : ''}: confirme lá antes de agendar [O7].`,
        fontes: [], acoes: [rota('/documentos', 'Ver checklist do visto'), rota(mPath('5.3'), 'Abrir Missão 5.3')],
      };
    }
    case 'custo':
      return {
        texto: `**Sua jornada (estimativa):** ${eur(f.orcamento)}${f.parcial ? ` — faltam ${f.faltamInformar.length} item(ns) sem valor` : ''}.\n- Para se instalar: ${eur(f.instalacao)}\n- Por mês no destino: ${eur(f.mensal)} × ${f.meses} meses\n\n**Para o visto** você precisa *comprovar* ${eur(f.exigenciaVisto)} (${Math.round(f.iprem.percentual * 100)}% do IPREM de ${f.iprem.ano} × ${f.meses} meses [O6]). Isso não é um gasto a mais.`,
        fontes: [], acoes: [rota('/financiamento', 'Ver meu planejamento')],
      };
    case 'suficiente': {
      const a = amountIn(pergunta);
      if (!a) return { texto: `Hoje você tem ${eur(f.confirmados)} garantidos para uma jornada estimada em ${eur(f.aDesembolsar)}. Me diga quanto tem (ex.: "tenho R$ 20.000") que eu comparo.`, fontes: [], acoes: [rota('/financiamento#recursos', 'Registrar meu dinheiro')] };
      if (a.moeda === 'BRL' && !f.cambio) return { texto: 'Para comparar reais com euros, preciso de uma taxa de câmbio. Informe a taxa no planejamento financeiro.', fontes: [], acoes: [rota('/financiamento#cambio', 'Informar câmbio')] };
      const emEur = a.moeda === 'BRL' ? (a.valor / f.cambio) * (1 - (f.cambioInfo?.spreadPct || 0) / 100) : a.valor;
      const total = f.confirmados + emEur;
      const faltaJornada = Math.max(0, f.aDesembolsar - total);
      const faltaVisto = Math.max(0, f.exigenciaVisto - total);
      const conv = a.moeda === 'BRL' ? ` (≈ ${eur(emEur)} com câmbio de R$ ${f.cambio.toFixed(2).replace('.', ',')})` : '';
      return {
        texto: `${a.moeda === 'BRL' ? `R$ ${Math.round(a.valor).toLocaleString('pt-BR')}` : eur(a.valor)}${conv}${f.confirmados ? ` + ${eur(f.confirmados)} já registrados` : ''}:\n- Jornada: ${faltaJornada ? `faltariam **${eur(faltaJornada)}**` : '**cobre** a estimativa'}${f.parcial ? ' (estimativa ainda incompleta)' : ''}.\n- Visto: ${faltaVisto ? `faltariam **${eur(faltaVisto)}** para comprovar` : '**cobre** a exigência estimada'}.\n\nÉ só uma simulação: nada foi salvo.`,
        fontes: [], acoes: [rota('/financiamento#recursos', 'Registrar esse valor'), ...(faltaJornada || faltaVisto ? [rota('/financiamento#alternativas', 'Ver alternativas')] : [])],
      };
    }
    case 'guardar':
      if (!f.deficit) return { texto: f.informouRecursos ? 'Pelos seus dados, não falta dinheiro para a estimativa atual. 🎉' : 'Registre primeiro o que você já tem para eu calcular.', fontes: [], acoes: [rota('/financiamento#recursos', 'Meus recursos')] };
      return { texto: `Faltam ${eur(f.deficit)}. Até a partida (${f.partida.split('-').reverse().join('/')}), são ${f.mesesAteViagem} mês(es): guarde cerca de **${eur(Math.ceil(f.economiaMensal))} por mês**.`, fontes: [], acoes: [rota('/financiamento#alternativas', 'Ver outras alternativas')] };
    case 'semdinheiro': {
      if (!f.informouRecursos) return { texto: 'Primeiro, registre o que você já tem (mesmo que seja zero) no simulador. Assim eu calculo a diferença real e sugiro caminhos.', fontes: [], acoes: [rota('/financiamento#recursos', 'Registrar meus recursos')] };
      if (f.deficit === 0) return { texto: `Pelos seus dados, os recursos confirmados (${eur(f.confirmados)}) cobrem a exigência estimada do visto (${eur(f.exigenciaVisto)}) e o orçamento (${eur(f.orcamento)}). Confirme com o consulado quais comprovantes são aceitos.`, fontes: [], acoes: [rota(mPath('9.9'), 'Abrir Missão F.9')] };
      return {
        texto: `Faltam **${eur(f.deficit)}**. Vamos encontrar um caminho:\n${f.caminhos.slice(0, 4).map((c) => `- **${c.titulo}**`).join('\n')}\n\nQuer que eu detalhe algum?`,
        fontes: [], acoes: [rota('/financiamento#bolsas', 'Buscar bolsas'), rota('/financiamento#recursos', 'Registrar apoio familiar'), rota('/jornadas', 'Comparar destinos')],
      };
    }
    case 'apoio':
      return {
        texto: '**Apoio financeiro familiar** (ex.: pai, mãe, padrasto):\n- Registre o apoiador e o valor como recurso "Apoio familiar" — conta como previsto até você ter a documentação.\n- O consulado decide se aceita patrocínio de terceiros e quais documentos pede: costumam ser comprovação de rendimentos e da origem dos recursos, documentos do apoiador e uma declaração de apoio.\n- Confirme isso no site do seu consulado ou por e-mail (Missão 5.2) antes de reunir os papéis.\n\nNão assuma que qualquer declaração será aceita automaticamente.',
        fontes: [], acoes: [rota('/financiamento#recursos', 'Registrar apoio familiar'), rota(mPath('5.2'), 'Abrir e-mail ao consulado')],
      };
    case 'bolsas': {
      const saved = new Set((user.scholarshipApps || []).map((a) => a.catalogId));
      return {
        texto: `Fontes para pesquisar (nenhuma cobre automaticamente o seu mestrado — confira o edital vigente):\n\n${SCHOLARSHIPS.map((s) => `- **${s.nome}** — ${s.entidade}. ${s.abrangencia} _Status: ${SCHOLARSHIP_STATUS[s.status]}._`).join('\n')}\n\nPosso salvar as que fizerem sentido e criar as tarefas de candidatura.`,
        fontes: [],
        acoes: [rota('/financiamento#bolsas', 'Abrir buscador de bolsas'), ...SCHOLARSHIPS.filter((s) => !saved.has(s.id)).slice(0, 2).map((s) => ({ tipo: 'salvar-bolsa', catalogId: s.id, rotulo: `Salvar "${s.nome}" e criar tarefas` }))],
      };
    }
    case 'contato':
      return {
        texto: `Como encontrar o contato certo (fontes oficiais):\n1. Abra a página oficial do seu mestrado${journey.destino.programa?.url ? '' : ' (defina o mestrado da jornada)'}.\n2. Procure "Profesorado", "Coordinación", "Organización" ou "Contacto".\n3. Identifique o coordenador ou o professor ligado à sua dúvida.\n4. Para a UGR, confirme o e-mail institucional no diretório oficial [O9].\n5. Registre o contato com o link da página onde o encontrou.\n\nEu não invento nomes nem e-mails: só organizo o que você encontrar nas fontes oficiais.`,
        fontes: [], acoes: [rota(mPath('3.8'), 'Abrir ferramenta "Encontrar contato acadêmico"')],
      };
    case 'email': {
      const p = user.profile || {};
      const prog = journey.destino.programa?.nome || '[nombre del máster]';
      return {
        texto: `Rascunho (revise antes de enviar — o envio é feito por você, no seu e-mail):\n\n**Asunto:** Consulta sobre el ${prog}\n\nEstimado/a profesor/a [apellido]:\n\nMe llamo ${p.nome || '[su nombre]'} y soy ${p.formacao ? `graduado/a en ${p.formacao}` : '[su formación]'}${p.instituicao ? ` por la ${p.instituicao}` : ''} (Brasil). He presentado / voy a presentar mi solicitud al ${prog} a través del Distrito Único Andaluz.\n\nQuisiera consultarle lo siguiente: [su duda concreta].\n\nMuchas gracias por su atención.\n\nAtentamente,\n${p.nome || '[su nombre]'}\n\n_Dica: uma dúvida específica tem mais chance de resposta do que uma mensagem genérica._`,
        fontes: [], acoes: [rota(mPath('3.8'), 'Registrar contato e envio')],
      };
    }
    case 'moradia': {
      const casas = (user.housing || []).filter((c) => c.status !== 'descartada').sort((a, b) => (a.aluguel + (a.adicionais || 0)) - (b.aluguel + (b.adicionais || 0)));
      return {
        texto: `${casas.length ? `Suas opções, da mais barata para a mais cara (aluguel + despesas adicionais):\n${casas.map((c) => `- **${c.nome}** — €${c.aluguel + (c.adicionais || 0)}/mês${c.caucao ? `, caução €${c.caucao}` : ''}`).join('\n')}\n\n` : 'Você ainda não salvou opções no "Meu novo lar".\n\n'}**Para economizar** _(orientação prática)_: compare quartos em apartamento compartilhado, verifique o que está incluso (contas, internet), considere bairros com bom transporte em vez de só os mais centrais e nunca pague caução sem verificar anúncio e contrato.`,
        fontes: [], acoes: [rota('/novo-lar', 'Abrir Meu novo lar')],
      };
    }
    case 'semana':
      return { texto: 'Posso montar uma proposta para a semana com as suas missões abertas, prioridades, prazos e horários livres. Você revisa, ajusta e aprova — nada é marcado como concluído automaticamente.', fontes: [], acoes: [{ tipo: 'organizar-semana', rotulo: 'Gerar proposta na Agenda AI' }] };
    case 'dua':
      return {
        texto: 'Inscrição no DUA, missão por missão (Rodada 3):\n- **3.1** Acessar o portal oficial do DUA [O8].\n- **3.2** Identificar a fase do seu perfil e ano (não reutilize prazos antigos).\n- **3.3** Criar a solicitação e preencher os dados.\n- **3.4** Selecionar até 6 mestrados em ordem de preferência (2026/27).\n- **3.5** Anexar a documentação.\n- **3.6** Enviar no portal oficial — a Estuvia não envia por você.\n- **3.7** Salvar o comprovante.',
        fontes: [], acoes: [rota(`/j/${jr.id}/r/3`, 'Abrir a Rodada 3')],
      };
    case 'certificado': {
      const lang = journey.rodadas[1].missoes.find((x) => x.id === '2.5');
      const det = missionDetail(user, jr, '1.4');
      const el = det.elegibilidade?.find((e) => e.requisito === 'Idioma');
      return {
        texto: `${el ? `**${el.texto}**\n\n` : ''}${lang.status === 'nao-aplicavel' ? `Pela regra cadastrada do seu mestrado, a comprovação formal não é obrigatória: ${lang.motivoNaoAplicavel}` : lang.alertas.length ? 'A exigência não está confirmada: pergunte à coordenação antes de pagar uma prova.' : 'A Missão 2.5 está ativa na sua jornada: confirme qual certificado o programa aceita.'}${journey.destino.programa?.demo ? '\n\n_Seu mestrado é um dado demonstrativo: confirme na ficha oficial._' : ''}`,
        fontes: [], acoes: [rota(mPath('1.4'), 'Ver minha elegibilidade')],
      };
    }
    case 'economizar':
      return {
        texto: '**Dicas práticas para economizar** _(orientação prática, não regra oficial)_:\n- Traduza e apostile **somente** o que a fonte oficial exigir.\n- Adiante documentos: urgência costuma custar mais caro.\n- Compare coberturas e preços de seguro saúde antes de contratar.\n- Compare rotas com custo total (Brasil → Madri/Málaga → destino) e prefira tarifas com remarcação.\n- Compare moradias pelo custo total mensal, não só pelo aluguel.\n- Pesquise bolsas cedo: editais têm prazos próprios.',
        fontes: [], acoes: [rota('/viagem', 'Comparar rotas'), rota('/novo-lar', 'Comparar moradias')],
      };
    case 'simples': {
      if (!m) break;
      const next = m.objetivos.find((o) => !o.feito);
      return { texto: `**Em poucas palavras:** ${m.definicao.objetivo}\n\n**Por quê?** ${m.definicao.porque}\n\n${next ? `**Seu próximo passo pequeno:** ${next.texto}.` : 'Você já cumpriu todos os objetivos — falta só confirmar a conclusão.'}`, fontes: m.fontes, acoes: [rota(mPath(m.id), `Abrir missão ${m.label}`)] };
    }
    case 'dificuldade': {
      if (!m) break;
      if (m.status === 'bloqueada') return { texto: `A Missão ${m.label} ainda está bloqueada. Antes: ${m.bloqueadaPor.map((b) => `**${b.label || ''} ${b.titulo}**`).join(', ')}.`, fontes: [], acoes: [] };
      const pend = m.objetivos.filter((o) => !o.feito);
      return {
        texto: `Vamos por partes na **Missão ${m.label} — ${m.definicao.titulo}**.\n\n${pend.map((o, i) => `${i + 1}. ${o.texto}`).join('\n') || 'Todos os objetivos estão feitos: confirme a conclusão.'}\n\n**Como executar:**\n${m.definicao.comoExecutar.map((c) => `- **${c.titulo}:** ${c.texto}`).join('\n')}\n\nSe algo na fonte oficial estiver diferente, vale a fonte oficial.`,
        fontes: m.fontes, acoes: [rota(mPath(m.id), `Abrir missão ${m.label}`)],
      };
    }
    default: break;
  }
  return null;
}

export { missionLabel };
