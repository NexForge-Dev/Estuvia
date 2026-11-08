// "CONTEÚDO DA MISSÃO" — central de execução de uma missão.
// Cabeçalho contextual (Jornada / Rodada / Missão), progresso real (objetivos concluídos),
// grade de cards funcionais cuja composição depende do TIPO da missão, e relatos da comunidade.
// Abrir um card ou um link nunca conclui nada: só objetivos e a confirmação explícita contam.
import { h, mount, toast, richText } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { progressBar, statusChip, priorityTag, deadlineTag, fmtDate, pctLabel } from './common.js';
import { MissionChecklist, DocumentsBlock } from './MissionDetail.js';
import { MissionTool } from './MissionTools.js';
import { defaultWeek } from './WeeklyPlanner.js';
import { go } from '../app.js';
import { locale } from '../i18n.js';

const COLORS = { laranja: 'k-orange', dourado: 'k-gold', azul: 'k-blue', roxo: 'k-purple', verde: 'k-green', destaque: 'k-accent', rosa: 'k-pink', ciano: 'k-cyan' };

// Composição por tipo (exemplos A–E da especificação). Cards sem dados são omitidos.
const LAYOUTS = {
  candidatura: ['antes', 'guia', 'tutorial', 'fluxo', 'documentos', 'agenda', 'executar', 'assistente', 'ferramenta'],
  documental: ['antes', 'guia', 'documentos', 'fluxo', 'agenda', 'executar', 'assistente', 'ferramenta'],
  financeiro: ['exigencia', 'simulador', 'documentos', 'alternativas', 'bolsas', 'agenda', 'assistente', 'executar'],
  moradia: ['guia', 'comparador', 'custos', 'seguranca', 'agenda', 'executar', 'assistente', 'fluxo'],
  viagem: ['antes', 'guia', 'ferramenta', 'agenda', 'executar', 'assistente', 'fluxo'],
  tie: ['antes', 'documentos', 'guia', 'executar', 'tutorial', 'agenda', 'assistente', 'fluxo'],
  bolsas: ['elegibilidadeBolsa', 'radar', 'comparacao', 'documentos', 'agenda', 'executar', 'assistente'],
  geral: ['antes', 'guia', 'fluxo', 'documentos', 'ferramenta', 'agenda', 'executar', 'assistente'],
};

const EXEC_LABEL = { 'nao-comecei': 'Ainda não comecei', fazendo: 'Estou fazendo', ajuda: 'Preciso de ajuda' };
const DIFF_CLS = { Baixa: 'ok', Média: 'warn', Alta: 'danger' };

function progressMessage(m) {
  if (m.status === 'concluida') return 'Missão concluída. Siga para a próxima ação recomendada.';
  if (m.status === 'nao-aplicavel') return 'Esta missão não se aplica ao seu caso, ela não conta como pendência.';
  if (m.status === 'bloqueada') return m.bloqueioExterno && m.bloqueadaPor.every((b) => b.externo) ? 'Esta missão aguarda uma decisão externa. Enquanto isso, adiante outras missões disponíveis.' : 'Conclua as dependências para liberar esta missão.';
  if (m.status === 'aguardando') return 'Você está aguardando terceiros. Isso não é atraso seu, a Agenda reserva só verificações curtas.';
  const left = m.objetivosTotal - m.objetivosFeitos;
  if (m.objetivosFeitos === 0) return 'Comece pelo card "Antes de começar" e depois vá para "Executar missão".';
  if (left === 0) return 'Todos os objetivos estão feitos. Confirme a conclusão em "Executar missão".';
  return `Você já avançou em ${m.objetivosFeitos} objetivo(s). Faltam ${left} para concluir esta missão.`;
}

export function MissionContent(m, ctx) {
  const { journey } = ctx;
  const def = m.definicao;
  const done = m.status === 'concluida';
  const locked = m.status === 'bloqueada';
  const na = m.status === 'nao-aplicavel';
  const editable = !locked && !na && !done;
  const base = `/journeys/${journey.id}/missions/${m.id}`;
  const roundLabel = def.rodadaSigla ? `Trilha ${def.rodadaSigla} - ${def.rodadaTitulo}` : `Rodada ${def.rodada} - ${def.rodadaTitulo}`;
  const docsReady = m.documentos.filter((d) => ['pronto', 'enviado', 'nao-se-aplica'].includes(d.status)).length;
  const checklist = () => MissionChecklist(m.objetivos, {
    disabled: !editable,
    situacaoAberta: !na && !done,
    onToggle: (o, feito) => ctx.mutate(api.put(`${base}/objectives/${o.id}`, { feito })),
    onValue: (o, valor) => ctx.mutate(api.put(`${base}/objectives/${o.id}`, { valor })),
  });
  const list = (items, render) => h('ul', { class: 'mc-list' }, items.map((x) => h('li', {}, render(x))));
  const missionLink = (x) => h('a', { href: `#/j/${journey.id}/m/${x.id}`, class: `flow-chip f-${x.status}` }, h('strong', {}, x.label), ` ${x.titulo}`, h('small', {}, x.statusLabel));

  // ---------- Definição dos cards: título, descrição, ícone, cor, dica de estado e conteúdo ----------
  const CARDS = {
    antes: {
      titulo: 'Antes de começar', desc: 'Briefing: objetivo, pré-requisitos, tempo, erros comuns e resultado esperado.', ic: 'flag', cor: 'laranja',
      dica: () => `Dificuldade ${m.dificuldade.toLowerCase()} · ${def.tempoEstimado}`,
      render: () => h('div', { class: 'stack' },
        h('p', { class: 'mc-lead' }, def.objetivo),
        h('div', { class: 'mc-facts' },
          fact('Por que importa', def.porque),
          fact('Dificuldade estimada', h('span', { class: `chip-status t-${DIFF_CLS[m.dificuldade]}` }, m.dificuldade)),
          fact('Tempo previsto', def.tempoEstimado),
          fact('Resultado esperado', m.resultado)),
        h('h3', { class: 'small-title' }, 'O que será necessário'),
        list(m.objetivos, (o) => [icon(o.feito ? 'check' : 'target', { size: 14 }), ' ', o.texto]),
        m.documentos.length ? [h('h3', { class: 'small-title' }, 'Documentos'), list(m.documentos, (d) => [icon('file', { size: 14 }), ` ${d.nome} - `, h('span', { class: 'muted' }, d.statusLabel)])] : null,
        h('h3', { class: 'small-title' }, 'Pré-requisitos'),
        m.antes.length || def.requer ? h('div', { class: 'flow-row' }, m.antes.map(missionLink), def.requer ? h('span', { class: `flow-chip ${m.bloqueioExterno ? 'f-bloqueada' : 'f-concluida'}` }, icon('globe', { size: 12 }), ` ${def.requer.rotulo}`, h('small', {}, 'decisão externa')) : null) : h('p', { class: 'muted small' }, 'Nenhum: você pode começar agora.'),
        h('h3', { class: 'small-title' }, 'Erros comuns'),
        list(m.errosComuns, (e) => [icon('alert', { size: 14 }), ' ', e]),
        def.condicional ? h('p', { class: 'notice' }, `Missão condicional: ${def.condicaoTexto}`) : null),
    },
    exigencia: {
      titulo: 'Entenda a exigência', desc: 'O que precisa ser comprovado, por quê e o que é estimativa.', ic: 'scale', cor: 'laranja',
      dica: () => (m.financeiro ? `Visto: € ${Math.round(m.financeiro.exigenciaVisto).toLocaleString(locale())}` : def.tempoEstimado),
      render: () => h('div', { class: 'stack' }, h('p', { class: 'mc-lead' }, def.objetivo), h('p', {}, def.porque),
        m.financeiro ? h('p', { class: 'notice' }, `Regra parametrizada: ${Math.round(m.financeiro.iprem.percentual * 100)}% do IPREM mensal (€${m.financeiro.iprem.mensal} em ${m.financeiro.iprem.ano}${m.financeiro.iprem.status === 'pendente' ? ', valor pendente de confirmação' : ''}) × ${m.financeiro.meses} meses. ${m.financeiro.iprem.regra}`) : null,
        h('h3', { class: 'small-title' }, 'Erros comuns'), list(m.errosComuns, (e) => [icon('alert', { size: 14 }), ' ', e])),
    },
    guia: {
      titulo: def.rodada === 8 ? 'Como fazer (agendamento e taxas)' : m.tipo === 'moradia' ? 'Guia de moradia' : 'Guia completo', desc: 'Passo a passo em seções curtas, com alertas e links oficiais.', ic: 'book', cor: 'dourado',
      hide: () => !def.comoExecutar.length,
      dica: () => `${def.comoExecutar.length} seção(ões)`,
      render: () => Stepper(def.comoExecutar, m),
    },
    tutorial: {
      titulo: 'Tutorial visual', desc: 'Demonstração verificada do procedimento.', ic: 'play', cor: 'azul',
      hide: () => !m.tutorial, // só aparece com tutorial verificado: nada de vídeos inventados ou antigos
      render: () => h('p', {}, 'Tutorial verificado.'),
    },
    fluxo: {
      titulo: 'Fluxo do processo', desc: 'Onde esta missão se encaixa: antes, etapas internas, depois e paralelas.', ic: 'map', cor: 'roxo',
      dica: () => `${m.antes.length} antes · ${m.dependentes.length} depois`,
      render: () => Flow(m, journey, missionLink),
    },
    documentos: {
      titulo: 'Documentos e checklist', desc: 'Status por item, anexos seguros, orientações e fontes.', ic: 'file', cor: 'verde',
      hide: () => !m.documentos.length && !m.objetivos.length,
      dica: () => (m.documentos.length ? `${docsReady}/${m.documentos.length} documentos prontos` : `${m.objetivosFeitos}/${m.objetivosTotal} objetivos`),
      render: () => h('div', { class: 'stack' },
        h('h3', { class: 'small-title' }, 'Objetivos da missão'), checklist(),
        m.documentos.length ? [h('h3', { class: 'small-title' }, 'Documentos'), DocumentsBlock(m, { scope: `${ctx.userId}:${journey.id}`, onDocStatus: async (d, status) => { try { await ctx.saveDoc(d.id, status); toast('Documento atualizado.', 'ok'); } catch (e) { toast(e.message, 'err'); } } })] : null,
        h('p', { class: 'hint' }, 'Anexar um documento na Estuvia não significa enviá-lo ao órgão oficial nem obter validação.')),
    },
    agenda: {
      titulo: 'Agenda e prazos', desc: 'Prazo oficial, atividades desta missão e "Organizar na minha semana".', ic: 'calendar', cor: 'dourado',
      dica: () => (m.prazo ? `Prazo ${fmtDate(m.prazo.data)}` : def.prazo?.tipo === 'usuario' ? 'Registre o prazo oficial' : 'Planeje sua execução'),
      render: () => AgendaCard(m, ctx, base),
    },
    executar: {
      titulo: 'Executar missão', desc: 'O que fazer agora, acesso ao canal oficial e registro da execução.', ic: 'target', cor: 'destaque', destaque: true,
      dica: () => (done ? 'Concluída' : m.aguardando ? 'Aguardando resposta' : EXEC_LABEL[m.execucao] || 'Registre sua execução'),
      render: () => ExecuteCard(m, ctx, base, checklist),
    },
    assistente: {
      titulo: 'Mentor da missão', desc: 'Pergunte com o contexto desta missão já carregado.', ic: 'chat', cor: 'roxo',
      dica: () => `${m.objetivosTotal - m.objetivosFeitos} objetivo(s) pendente(s) no contexto`,
      render: () => AssistantCard(m, ctx),
    },
    ferramenta: {
      titulo: { elegibilidade: 'Verificar elegibilidade', consulado: 'Consulado responsável', 'email-consulado': 'E-mail ao consulado', 'contato-academico': 'Encontrar contato acadêmico', viagem: 'Planejamento de viagem', 'guia-cidade': 'Guia da cidade', catalogo: 'Catálogo de mestrados', documentos: 'Área de documentos', financeiro: 'Resumo financeiro', 'novo-lar': 'Meu novo lar', bolsas: 'Buscador de bolsas' }[def.ferramenta] || 'Ferramenta da missão',
      desc: 'Ferramenta prática específica desta missão.', ic: { 'contato-academico': 'users', 'email-consulado': 'mail', consulado: 'passport', elegibilidade: 'scale', viagem: 'plane', 'guia-cidade': 'pin' }[def.ferramenta] || 'wand', cor: 'ciano',
      hide: () => !def.ferramenta || ['financeiro', 'novo-lar', 'bolsas', 'documentos'].includes(def.ferramenta) && m.tipo !== 'geral' && m.tipo !== 'documental' && m.tipo !== 'viagem' && m.tipo !== 'candidatura',
      dica: () => (def.ferramenta === 'contato-academico' ? `${(m.contatos || []).length} contato(s) registrado(s)` : 'Abrir ferramenta'),
      render: () => MissionTool(m, { journey, onChange: ctx.reload }) || h('p', { class: 'muted' }, 'Ferramenta indisponível.'),
    },
    simulador: {
      titulo: 'Meu planejamento financeiro', desc: 'Quanto custa, quanto você já tem e quanto falta.', ic: 'euro', cor: 'verde',
      dica: () => (m.financeiro ? (m.financeiro.deficit > 0 ? `Faltam € ${Math.round(m.financeiro.deficit).toLocaleString(locale())}` : 'Plano coberto') : 'Abrir planejamento'),
      render: async () => h('div', { class: 'stack' }, m.financeiro ? MissionTool({ ...m, definicao: { ...def, ferramenta: 'financeiro' } }, { journey, onChange: ctx.reload }) : await FinanceLive(), h('a', { class: 'btn btn-cta', href: '#/financiamento' }, 'Abrir meu planejamento financeiro', icon('arrow', { size: 14 }))),
    },
    alternativas: {
      titulo: 'Alternativas de financiamento', desc: 'Caminhos quando falta dinheiro: bolsas, apoio familiar, destinos, período, economia.', ic: 'wand', cor: 'rosa',
      dica: () => (m.financeiro?.deficit > 0 ? 'Há caminhos sugeridos' : 'Ver caminhos'),
      render: () => Alternatives(),
    },
    bolsas: {
      titulo: 'Bolsas compatíveis', desc: 'Oportunidades salvas, prazos e status das candidaturas.', ic: 'trophy', cor: 'azul',
      render: () => Scholarships(),
    },
    elegibilidadeBolsa: {
      titulo: 'Requisitos de elegibilidade', desc: 'O que cada edital costuma exigir, confira sempre o edital vigente.', ic: 'scale', cor: 'laranja',
      render: () => Scholarships({ elegibilidade: true }),
    },
    radar: {
      titulo: 'Mestrados e prazos no Radar', desc: 'O Radar ainda não monitora editais de bolsas; use-o para acompanhar as datas oficiais do seu mestrado.', ic: 'globe', cor: 'ciano',
      render: () => h('div', { class: 'stack' },
        h('p', {}, 'O Radar de Oportunidades acompanha mestrados e calendários oficiais a partir de fontes monitoradas.'),
        h('p', { class: 'notice' }, 'Editais de bolsas ainda não são monitorados pelo Radar. Para bolsas, use os cards "Requisitos de elegibilidade" e "Comparar oportunidades" e confira sempre o edital vigente.'),
        h('a', { class: 'btn btn-cta', href: '#/oportunidades' }, 'Abrir Radar de Oportunidades', icon('arrow', { size: 14 }))),
    },
    comparacao: {
      titulo: 'Comparar oportunidades', desc: 'Lado a lado: quem financia, cobertura, prazo e status.', ic: 'scale', cor: 'roxo',
      render: () => Scholarships({ comparar: true }),
    },
    comparador: {
      titulo: 'Comparador de anúncios', desc: 'Suas opções de moradia por custo total mensal.', ic: 'home2', cor: 'azul',
      render: () => Housing('comparar'),
    },
    custos: {
      titulo: 'Custos e despesas', desc: 'Aluguel, caução e despesas, integrado ao orçamento.', ic: 'euro', cor: 'verde',
      render: () => Housing('custos'),
    },
    seguranca: {
      titulo: 'Checklist de segurança', desc: 'Verificação antifraude de cada anúncio.', ic: 'shield', cor: 'rosa',
      render: () => Housing('seguranca'),
    },
  };

  // ---------- Montagem ----------
  // No guia, cards que repetem o que o passo a passo já mostra (briefing, guia, execução, assistente) ficam de fora.
  const layout = (LAYOUTS[m.tipo] || LAYOUTS.geral).filter((k) => CARDS[k] && !CARDS[k].hide?.() && !(ctx.exclude || []).includes(k));
  const sheetHost = h('div');
  const openCard = (key) => {
    ctx.state.open = key;
    const c = CARDS[key];
    const close = () => { ctx.state.open = null; sheetHost.replaceChildren(); document.removeEventListener('keydown', esc); };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esc);
    const body = h('div', { class: 'sheet-body' });
    Promise.resolve(c.render()).then((el) => body.append(el)).catch((e) => body.append(h('p', { class: 'notice' }, e.message)));
    const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': c.titulo },
      h('div', { class: 'sheet-card' },
        h('header', { class: 'sheet-head' },
          h('span', { class: `mc-icon ${COLORS[c.cor]}` }, icon(c.ic, { size: 22 })),
          h('div', {}, h('small', { class: 'eyebrow' }, `Missão ${m.label}`), h('h2', {}, c.titulo)),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fechar', onClick: close }, icon('x', { size: 18 }))),
        body));
    sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
    mount(sheetHost, sheet);
    sheet.querySelector('.sheet-card').focus?.();
  };
  ctx.reopen = () => { if (ctx.state.open && CARDS[ctx.state.open]) openCard(ctx.state.open); };

  const header = h('header', { class: 'mc-header' },
    h('div', { class: 'mc-context' },
      ctxCard('Jornada', `${journey.destino.origem} → ${journey.destino.universidade?.nome || 'Andaluzia'}`, 'globe'),
      ctxCard(def.rodadaSigla ? 'Trilha' : 'Rodada', roundLabel, 'flag'),
      ctxCard('Missão', `Missão ${m.label} - ${def.titulo}`, 'target', true)),
    h('div', { class: 'mc-meta' },
      statusChip(m.status, m.statusLabel), priorityTag(m.prioridade), def.opcional ? h('span', { class: 'chip-demo' }, 'Recomendação opcional') : null,
      m.prazo ? deadlineTag(m.prazo) : null,
      m.ultimaVerificacao ? h('span', { class: 'meta-pill' }, icon('shield', { size: 13 }), `Fontes verificadas em ${fmtDate(m.ultimaVerificacao)}`) : null),
    h('p', { class: 'mc-desc' }, def.resumo),
  );

  const stateBanner = locked
    ? h('div', { class: 'md-banner-state locked' }, icon('lock', { size: 18 }), h('div', {}, h('strong', {}, 'Bloqueada'), h('p', {}, 'Depende de: ', m.bloqueadaPor.map((b, i) => [i ? ', ' : '', b.externo ? b.titulo : h('a', { href: `#/j/${journey.id}/m/${b.id}` }, `${b.label} ${b.titulo}`)]))))
    : na ? h('div', { class: 'md-banner-state na' }, icon('minus', { size: 18 }), h('p', {}, m.motivoNaoAplicavel))
      : null;

  const progress = h('section', { class: 'mc-progress' },
    h('div', { class: 'mc-progress-top' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Seu progresso nesta missão'), h('strong', { class: 'mc-big' }, `${m.objetivosFeitos} de ${m.objetivosTotal} objetivos concluídos`)),
      h('span', { class: 'mc-pct' }, pctLabel(m.progresso))),
    progressBar(m.progresso, { cls: 'bar-lg', label: 'Progresso da missão' }),
    h('p', { class: 'muted' }, progressMessage(m)),
    m.alertas.map((a) => h('p', { class: 'notice' }, icon('alert', { size: 14 }), ' ', a.texto)),
    m.info ? h('p', { class: 'small' }, icon('lang', { size: 14 }), ' ', m.info) : null,
    done && journey.proximaMissao ? h('a', { class: 'btn btn-cta btn-sm', href: `#/j/${journey.id}/m/${journey.proximaMissao.id}` }, `Próxima ação: ${journey.proximaMissao.label} - ${journey.proximaMissao.titulo}`, icon('arrow', { size: 14 })) : null,
  );

  const grid = h('div', { class: 'mc-grid' }, layout.map((key) => {
    const c = CARDS[key];
    return h('button', { type: 'button', class: `mc-card ${c.destaque ? 'is-primary' : ''}`, onClick: () => openCard(key) },
      h('span', { class: `mc-icon ${COLORS[c.cor]}` }, icon(c.ic, { size: 26 })),
      h('strong', {}, c.titulo),
      h('span', { class: 'mc-card-desc' }, c.desc),
      c.dica ? h('span', { class: 'mc-card-hint' }, c.dica()) : null);
  }));

  const community = h('section', { class: 'mc-community' },
    h('div', { class: 'section-head' }, h('h2', {}, icon('users', { size: 18 }), ' Experiências de outros estudantes'), h('a', { class: 'btn btn-ghost btn-sm', href: `#/comunidade/missao/${m.id}` }, icon('edit', { size: 14 }), 'Compartilhar sua experiência')),
    h('p', { class: 'muted small' }, 'Relatos pessoais da comunidade, não são regra oficial. Confirme sempre na fonte oficial.'));
  api.get(`/community/missions/${m.id}?limit=3${journey.destino.universidade ? `&universidadeId=${journey.destino.universidade.id}` : ''}`)
    .then((r) => community.append(r.relatos?.length
      ? h('div', { class: 'mc-stories' }, r.relatos.map((p) => h('a', { class: 'story', href: p.url },
          h('span', { class: 'tag tag-info' }, p.naturezaLabel || 'Relato pessoal'), h('strong', {}, p.titulo), h('p', { class: 'small muted' }, p.resumo),
          h('small', { class: 'muted' }, `${p.autorApelido} · ${fmtDate(p.criadoEm)} · ${p.curtidas} curtida(s)`))))
      : h('p', { class: 'empty-inline' }, 'Ainda não há relatos para esta missão. ', h('a', { href: `#/comunidade/missao/${m.id}` }, 'Seja a primeira pessoa a compartilhar.'))))
    .catch(() => community.append(h('p', { class: 'empty-inline' }, 'Relatos indisponíveis no momento. ', h('a', { href: '#/comunidade' }, 'Abrir comunidade'))));

  // Dentro do guia passo a passo, as ferramentas ficam em "Mais ferramentas e detalhes" (sem repetir cabeçalho e progresso).
  if (ctx.embedded) return h('div', { class: `mission-content embedded md-${m.status}` }, grid, community, sheetHost);

  return h('article', { class: `mission-content md-${m.status}` },
    h('nav', { class: 'crumbs', 'aria-label': 'Navegação' },
      h('a', { href: '#/jornadas' }, 'Minhas Jornadas'), icon('chevron', { size: 12, cls: 'crumb-sep' }),
      h('a', { href: `#/j/${journey.id}` }, journey.destino.universidade?.sigla || 'Jornada'), icon('chevron', { size: 12, cls: 'crumb-sep' }),
      h('a', { href: `#/j/${journey.id}/r/${def.rodada}` }, def.rodadaSigla ? 'Financiamento' : `Rodada ${def.rodada}`), icon('chevron', { size: 12, cls: 'crumb-sep' }),
      h('span', { 'aria-current': 'page' }, `Missão ${m.label}`)),
    h('h1', { class: 'mc-title' }, 'Conteúdo da missão'),
    header, stateBanner, progress, grid, community, sheetHost,
  );
}

// ---------- Subcomponentes ----------

const fact = (label, value) => h('div', { class: 'mc-fact' }, h('small', {}, label), h('div', {}, value));
const ctxCard = (label, value, ic, wide) => h('div', { class: `mc-ctx ${wide ? 'wide' : ''}` }, h('span', { class: 'mc-ctx-icon' }, icon(ic, { size: 16 })), h('div', {}, h('small', {}, label), h('strong', {}, value)));

// Guia em etapas: navegação progressiva + lista expansível.
function Stepper(steps, m) {
  let i = 0;
  const host = h('div', { class: 'stepper' });
  const draw = () => mount(host,
    h('ol', { class: 'stepper-nav' }, steps.map((s, k) => h('li', {}, h('button', { type: 'button', class: k === i ? 'on' : k < i ? 'seen' : '', onClick: () => { i = k; draw(); } }, String(k + 1))))),
    h('div', { class: 'stepper-body' }, h('h3', {}, steps[i].titulo), h('p', {}, steps[i].texto)),
    h('div', { class: 'row between' },
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', disabled: i === 0, onClick: () => { i -= 1; draw(); } }, icon('back', { size: 14 }), 'Anterior'),
      h('span', { class: 'muted small' }, `${i + 1} de ${steps.length}`),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', disabled: i === steps.length - 1, onClick: () => { i += 1; draw(); } }, 'Próximo', icon('arrow', { size: 14 }))),
    m.alertas.length ? h('div', { class: 'notice' }, m.alertas.map((a) => a.texto).join(' ')) : null,
    m.fontes.length ? h('div', { class: 'sources' }, h('span', { class: 'muted small' }, 'Fontes oficiais: '), m.fontes.map((s) => (s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', class: 'source-link' }, s.titulo, icon('external', { size: 11 })) : h('span', { class: 'source-link' }, s.titulo)))) : null,
    h('p', { class: 'hint' }, 'Ler o guia não conclui a missão: marque os objetivos à medida que realizar cada passo.'));
  draw();
  return host;
}

// Fluxograma: antes → etapas internas (objetivos) → depois, com paralelas ao lado.
function Flow(m, journey, missionLink) {
  const firstPending = m.objetivos.findIndex((o) => !o.feito);
  return h('div', { class: 'flow' },
    h('div', { class: 'flow-main' },
      m.antes.length ? [h('p', { class: 'flow-label' }, 'Antes (dependências)'), h('div', { class: 'flow-row' }, m.antes.map(missionLink)), h('span', { class: 'flow-arrow' }, icon('chevron', { size: 18 }))] : null,
      h('p', { class: 'flow-label' }, `Dentro desta missão (${m.label})`),
      h('ol', { class: 'flow-steps' }, m.objetivos.map((o, i) => h('li', { class: o.feito ? 'done' : i === firstPending ? 'current' : '' },
        h('span', { class: 'flow-dot' }, o.feito ? icon('check', { size: 12 }) : String(i + 1)), h('span', {}, o.texto), i === firstPending ? h('small', { class: 'flow-now' }, 'etapa atual') : null))),
      m.dependentes.length ? [h('span', { class: 'flow-arrow' }, icon('chevron', { size: 18 })), h('p', { class: 'flow-label' }, 'Depois (o que esta missão libera)'), h('div', { class: 'flow-row' }, m.dependentes.map(missionLink))] : null),
    h('aside', { class: 'flow-side' },
      h('p', { class: 'flow-label' }, 'Pode fazer em paralelo'),
      m.paralelas.length ? h('div', { class: 'flow-col' }, m.paralelas.map(missionLink)) : h('p', { class: 'muted small' }, 'Nenhuma missão paralela disponível nesta rodada agora.'),
      journey.proximaMissao ? [h('p', { class: 'flow-label' }, 'Próxima ação recomendada'), missionLink({ id: journey.proximaMissao.id, label: journey.proximaMissao.label, titulo: journey.proximaMissao.titulo, status: journey.proximaMissao.status, statusLabel: journey.proximaMissao.statusLabel })] : null));
}

function AgendaCard(m, ctx, base) {
  const host = h('div', { class: 'stack' });
  const def = m.definicao;
  const prazoBox = def.prazo?.tipo === 'usuario'
    ? (() => {
        const input = h('input', { type: 'date', value: m.prazoDeclarado || '', 'aria-label': def.prazo.rotulo });
        input.addEventListener('change', () => ctx.mutate(api.put(`${base}/state`, { prazo: input.value || null })));
        return h('label', { class: 'field' }, h('span', { class: 'field-label' }, `${def.prazo.rotulo} (copie da fonte oficial)`), input);
      })()
    : m.prazo ? h('p', {}, `${m.prazo.rotulo}: `, deadlineTag(m.prazo), h('span', { class: 'muted small' }, m.prazo.origem === 'oficial' ? ' · regra oficial' : ' · previsão')) : h('p', { class: 'muted small' }, 'Esta missão não tem prazo oficial cadastrado.');
  const events = h('div');
  const proposalHost = h('div');
  const week = defaultWeek();
  const loadEvents = async () => {
    const d = await api.get('/planner');
    const mine = d.events.filter((e) => e.missaoId === m.id && e.journeyId === ctx.journey.id).sort((a, b) => `${a.data}${a.inicio}`.localeCompare(`${b.data}${b.inicio}`));
    const late = m.prazo ? mine.filter((e) => e.data > m.prazo.data) : [];
    mount(events,
      h('h3', { class: 'small-title' }, 'Compromissos desta missão'),
      mine.length ? h('ul', { class: 'mc-list' }, mine.map((e) => h('li', {}, icon('calendar', { size: 14 }), ` ${fmtDate(e.data)} ${e.inicio}–${e.fim} · ${e.titulo}`, e.origem === 'agenda-ai' ? h('span', { class: 'tag tag-info' }, 'Agenda') : null))) : h('p', { class: 'muted small' }, 'Nenhum horário reservado ainda.'),
      late.length ? h('div', { class: 'notice' }, `${late.length} compromisso(s) estão depois do prazo (${fmtDate(m.prazo.data)}). O prazo pode ter mudado: `, h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => go('/agenda#organizar') }, 'Replanejar na Agenda')) : null);
  };
  const organize = h('button', { type: 'button', class: 'btn btn-cta', disabled: ['concluida', 'nao-aplicavel', 'bloqueada'].includes(m.status) }, icon('calendar', { size: 16 }), 'Organizar esta missão na minha semana');
  organize.addEventListener('click', async () => {
    try {
      const p = await api.post('/planner/suggest', { semana: week, journeyId: ctx.journey.id, missaoId: m.id });
      const items = p.proposta;
      const drawProposal = () => mount(proposalHost, items.length
        ? h('div', { class: 'panel' },
            h('h3', { class: 'small-title' }, `Proposta para a semana de ${fmtDate(p.semana)}`),
            h('ul', { class: 'mc-list' }, items.map((x, i) => h('li', {}, `${new Date(`${x.data}T12:00:00`).toLocaleDateString(locale(), { weekday: 'long', day: '2-digit' })} · ${x.inicio}–${x.fim} - ${x.titulo}`,
              h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Remover', onClick: () => { items.splice(i, 1); drawProposal(); } }, icon('x', { size: 12 }))))),
            h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn btn-cta btn-sm', disabled: !items.length, onClick: async () => {
              try { await api.post('/planner/approve', { itens: items.map(({ prioridadeLabel, ...x }) => Object.fromEntries(Object.entries(x).filter(([, v]) => v != null))) }); toast('Horários adicionados à Agenda.', 'ok'); mount(proposalHost); loadEvents(); } catch (e) { toast(e.message, 'err'); }
            } }, icon('check', { size: 14 }), 'Aprovar'), h('a', { class: 'btn btn-ghost btn-sm', href: '#/agenda' }, 'Editar na Agenda')),
            h('p', { class: 'hint' }, 'Sugestões editáveis. A Agenda nunca conclui a missão quando o horário passa.'))
        : h('p', { class: 'notice' }, 'Não há horários livres nesta semana pela sua disponibilidade. Ajuste em Agenda → Minha disponibilidade.'));
      drawProposal();
    } catch (e) { toast(e.message, 'err'); }
  });
  mount(host, h('h3', { class: 'small-title' }, 'Prazo'), prazoBox, h('p', { class: 'small muted' }, `Tempo estimado de execução: ${def.tempoEstimado}.`), organize, proposalHost, events);
  loadEvents().catch(() => {});
  return host;
}

function ExecuteCard(m, ctx, base, checklist) {
  const def = m.definicao;
  const done = m.status === 'concluida';
  const blocked = ['bloqueada', 'nao-aplicavel'].includes(m.status);
  const next = m.objetivos.find((o) => !o.feito);
  const set = (execucao) => ctx.mutate(api.put(`${base}/state`, { execucao }));
  const options = [
    ['nao-comecei', 'Ainda não comecei', 'clock', () => Promise.all([m.aguardando && def.aguardavel && !m.aguardandoAuto ? api.put(`${base}/state`, { aguardando: false }) : null]).then(() => set('nao-comecei'))],
    ['fazendo', 'Estou fazendo', 'play', () => set('fazendo')],
    def.aguardavel && !m.aguardandoAuto ? ['aguardando', 'Estou aguardando resposta', 'hourglass', () => ctx.mutate(api.put(`${base}/state`, { aguardando: !m.aguardando }))] : null,
    ['concluir', 'Concluí a ação', 'check', () => confirmBox()],
    ['ajuda', 'Preciso de ajuda', 'chat', async () => { await api.put(`${base}/state`, { execucao: 'ajuda' }); ctx.openAssistant({ journeyId: ctx.journey.id, missaoId: m.id, acao: 'dificuldade' }); }],
  ].filter(Boolean);
  const current = m.aguardando ? 'aguardando' : m.execucao;
  const confirmHost = h('div');
  const confirmBox = () => {
    if (!m.podeConcluir) {
      return mount(confirmHost, h('div', { class: 'notice' }, h('strong', {}, 'Antes de concluir, marque os objetivos realizados:'), checklist()));
    }
    const chk = h('input', { type: 'checkbox', id: 'mc-confirm' });
    const btn = h('button', { type: 'button', class: 'btn btn-cta', disabled: true, onClick: () => ctx.mutate(api.post(`${base}/complete`, { confirmo: true })) }, icon('check', { size: 16 }), 'Confirmar conclusão');
    chk.addEventListener('change', () => { btn.disabled = !chk.checked; });
    mount(confirmHost, h('div', { class: 'confirm-box' },
      h('p', {}, h('strong', {}, 'Confirmação: '), `você realmente concluiu esta etapa? Critério: ${def.criterio}`),
      h('label', { class: 'check', for: 'mc-confirm' }, chk, h('span', {}, 'Sim, realizei o procedimento no canal oficial e guardei o comprovante (quando houver).')),
      m.documentos.some((d) => d.id.startsWith('comprovante')) ? h('p', { class: 'hint' }, 'Você pode anexar o comprovante no card "Documentos e checklist", ele fica só neste dispositivo.') : null,
      btn));
  };
  return h('div', { class: 'stack' },
    h('div', { class: 'exec-now' }, h('small', { class: 'eyebrow' }, 'O que fazer agora'),
      h('p', { class: 'mc-lead' }, done ? 'Missão concluída. Siga para a próxima ação.' : blocked ? (m.status === 'bloqueada' ? 'Esta missão ainda está bloqueada.' : 'Esta missão não se aplica a você.') : next ? next.texto : 'Todos os objetivos foram feitos: confirme a conclusão.'),
      m.linkOficial ? h('a', { class: 'btn btn-cta btn-lg', href: m.linkOficial.url, target: '_blank', rel: 'noopener noreferrer' }, icon('external', { size: 16 }), m.linkOficial.rotulo) : null,
      m.linkOficial ? h('p', { class: 'hint' }, 'Abrir o portal não conclui a missão. Volte aqui e registre o que aconteceu.') : null),
    done
      // Requisito já atendido é desfeito em "Meu perfil → O que eu já tenho", não aqui.
      ? (m.conclusao === 'requisito-atendido' ? h('p', { class: 'hint' }, 'Você informou que já tem isso. Se mudar, corrija em "Meu perfil".') : h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => ctx.mutate(api.post(`${base}/reopen`, {})) }, icon('refresh', { size: 16 }), 'Reabrir missão'))
      : blocked ? null : [
          h('p', { class: 'small-title' }, 'Registrar a execução'),
          h('div', { class: 'exec-options', role: 'group', 'aria-label': 'Estado da execução' }, options.map(([k, label, ic, fn]) => h('button', { type: 'button', class: `exec-opt ${current === k ? 'on' : ''}`, 'aria-pressed': String(current === k), onClick: fn }, icon(ic, { size: 16 }), label))),
          confirmHost,
          (def.condicional || def.opcional) ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => ctx.mutate(api.put(`${base}/state`, { naoAplicavel: !m.naoAplicavelMarcado })) }, icon('minus', { size: 14 }), def.opcional ? 'Não vou seguir esta recomendação' : 'Conferi: não se aplica a mim') : null,
        ],
  );
}

function AssistantCard(m, ctx) {
  const ask = (opts) => ctx.openAssistant({ journeyId: ctx.journey.id, missaoId: m.id, ...opts });
  const first = m.fontes.find((s) => s.url);
  const actions = [
    ['Explicar mais simples', () => ask({ acao: 'simples' })],
    ['Mostrar um exemplo', () => ask({ pergunta: `Mostre um exemplo prático de como realizar a Missão ${m.label} - ${m.definicao.titulo}.` })],
    ['Criar um checklist', () => ask({ acao: 'dificuldade' })],
    ['Organizar na Agenda', () => { ctx.state.open = 'agenda'; ctx.reopen(); }],
    first ? ['Consultar fonte oficial', () => window.open(first.url, '_blank', 'noopener')] : null,
    ['Preparar e-mail institucional', () => ask({ acao: m.definicao.rodada === 5 ? 'vistodocs' : 'email' })],
    ['Quais documentos estão faltando?', () => ask({ acao: 'documentos' })],
    ['Não entendi essa etapa', () => ask({ acao: 'dificuldade' })],
  ].filter(Boolean);
  return h('div', { class: 'stack' },
    h('div', { class: 'ai-context' }, icon('target', { size: 14 }), h('span', {}, `Contexto: Missão ${m.label} · ${m.statusLabel} · ${m.objetivosFeitos}/${m.objetivosTotal} objetivos · ${m.fontes.length} fonte(s) oficial(is)`)),
    h('p', { class: 'muted small' }, 'O Mentor recebe esta missão, o destino, a universidade, os objetivos pendentes e as fontes associadas. Ele não inventa requisitos oficiais.'),
    h('div', { class: 'chips' }, actions.map(([label, fn]) => h('button', { type: 'button', class: 'chip', onClick: fn }, label))),
    h('button', { type: 'button', class: 'btn btn-cta', onClick: () => ask({}) }, icon('chat', { size: 16 }), 'Abrir conversa'));
}

async function FinanceLive() {
  const f = (await api.get('/finance')).plano;
  return h('p', {}, `Exigência do visto: € ${Math.round(f.exigenciaVisto).toLocaleString(locale())} · Orçamento: € ${Math.round(f.orcamento).toLocaleString(locale())} · Recursos confirmados: € ${Math.round(f.confirmados).toLocaleString(locale())}`);
}

async function Alternatives() {
  const f = (await api.get('/finance')).plano;
  if (!f.informouRecursos) return h('div', { class: 'stack' }, h('p', {}, 'Registre seus recursos (mesmo que seja zero) para calcular a diferença e receber caminhos personalizados.'), h('a', { class: 'btn btn-cta', href: '#/financiamento#recursos' }, 'Registrar recursos'));
  if (!f.caminhos.length) return h('p', {}, `Pelos seus dados, os recursos confirmados cobrem o plano. Confirme com o consulado quais comprovantes são aceitos.`);
  return h('div', { class: 'stack' },
    h('p', { class: 'mc-lead' }, `Faltam cerca de € ${Math.round(f.deficit).toLocaleString(locale())} (estimativa).`),
    h('ul', { class: 'paths' }, f.caminhos.map((c) => h('li', {}, h('strong', {}, c.titulo), h('p', { class: 'small' }, c.texto), c.rota ? h('a', { class: 'link-arrow', href: `#${c.rota}` }, 'Abrir', icon('arrow', { size: 12 })) : null))),
    h('p', { class: 'hint' }, 'Nenhum caminho garante a aprovação do visto. Trabalho ou estágio na Espanha não substituem a comprovação inicial.'));
}

async function Scholarships({ elegibilidade = false, comparar = false } = {}) {
  const d = await api.get('/finance');
  const saved = new Map(d.candidaturas.map((a) => [a.catalogId, a]));
  if (elegibilidade) {
    return h('ul', { class: 'paths' }, d.catalogo.map((s) => h('li', {}, h('strong', {}, `${s.nome} - ${s.entidade}`), h('p', { class: 'small' }, s.elegibilidade), h('p', { class: 'small muted' }, `Abrangência: ${s.abrangencia}`), h('span', { class: 'tag tag-pending' }, d.statusBolsa[s.status]))));
  }
  if (comparar) {
    const rows = d.candidaturas.length ? d.candidaturas : [];
    if (!rows.length) return h('p', {}, 'Salve bolsas no card "Bolsas" ou no buscador para compará-las aqui.');
    return h('div', { class: 'table-wrap' }, h('table', { class: 'cmp' },
      h('thead', {}, h('tr', {}, ['Bolsa', 'Entidade', 'Cobertura', 'Prazo', 'Status'].map((t) => h('th', {}, t)))),
      h('tbody', {}, rows.map((a) => h('tr', {}, h('td', {}, a.nome), h('td', {}, a.entidade || '-'), h('td', {}, a.cobertura || '-'), h('td', {}, a.prazo ? fmtDate(a.prazo) : 'Sem prazo registrado'), h('td', {}, a.status))))));
  }
  return h('div', { class: 'stack' },
    h('ul', { class: 'paths' }, d.catalogo.map((s) => {
      const app = saved.get(s.id);
      const btn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', disabled: Boolean(app) }, app ? `Salva (${app.status})` : 'Salvar e criar tarefas');
      btn.addEventListener('click', async () => { try { await api.post('/finance/scholarships', { catalogId: s.id }); toast('Bolsa salva, tarefas criadas na Agenda.', 'ok'); btn.disabled = true; btn.textContent = 'Salva (interesse)'; } catch (e) { toast(e.message, 'err'); } });
      return h('li', {}, h('strong', {}, s.nome), h('p', { class: 'small muted' }, `${s.entidade} · ${d.statusBolsa[s.status]}`), h('p', { class: 'small' }, s.financia), btn);
    })),
    h('a', { class: 'btn btn-cta', href: '#/financiamento#bolsas' }, 'Gerenciar candidaturas a bolsas', icon('arrow', { size: 14 })));
}

async function Housing(mode) {
  const d = await api.get('/living');
  const opts = d.housing.filter((x) => x.status !== 'descartada');
  if (!opts.length) return h('div', { class: 'stack' }, h('p', {}, 'Você ainda não cadastrou opções de moradia.'), h('a', { class: 'btn btn-cta', href: '#/novo-lar' }, 'Cadastrar no Meu novo lar'));
  const total = (x) => (x.aluguel || 0) + (x.adicionais || 0);
  if (mode === 'seguranca') {
    return h('div', { class: 'stack' }, opts.map((x) => h('details', { class: 'md-expand', open: x.status === 'escolhida' || x.status === 'negociando' },
      h('summary', {}, h('span', {}, `${x.nome} - ${Object.values(x.checklist || {}).filter(Boolean).length}/${d.antifraude.length} verificações`), icon('chevron', { size: 16, cls: 'chev' })),
      h('ul', { class: 'md-expand-body checklist' }, d.antifraude.map((a) => {
        const on = Boolean(x.checklist?.[a.id]);
        const b = h('button', { type: 'button', class: `ck ${on ? 'done' : ''}`, role: 'checkbox', 'aria-checked': String(on) }, h('span', { class: 'ck-box' }, on ? icon('check', { size: 14 }) : null), h('span', { class: 'ck-text' }, a.texto));
        b.addEventListener('click', async () => { try { await api.put(`/living/housing/${x.id}`, { checklist: { [a.id]: !on } }); b.classList.toggle('done'); b.setAttribute('aria-checked', String(!on)); b.firstChild.replaceChildren(...(!on ? [icon('check', { size: 14 })] : [])); x.checklist = { ...x.checklist, [a.id]: !on }; } catch (e) { toast(e.message, 'err'); } });
        return h('li', {}, b);
      })))),
      h('p', { class: 'hint' }, 'A verificação é orientativa: um anúncio não fica "seguro" só porque foi cadastrado ou checado aqui.'));
  }
  const sorted = [...opts].sort((a, b) => total(a) - total(b));
  return h('div', { class: 'stack' }, h('div', { class: 'table-wrap' }, h('table', { class: 'cmp' },
    h('thead', {}, h('tr', {}, ['Opção', 'Tipo', mode === 'custos' ? 'Aluguel' : 'Total/mês', mode === 'custos' ? 'Despesas' : 'Caução', mode === 'custos' ? 'Caução' : 'Status'].map((t) => h('th', {}, t)))),
    h('tbody', {}, sorted.map((x) => h('tr', { class: x.status === 'escolhida' ? 'chosen' : '' }, h('td', {}, x.nome), h('td', {}, x.tipo), h('td', {}, `€ ${mode === 'custos' ? x.aluguel : total(x)}`), h('td', {}, mode === 'custos' ? `€ ${x.adicionais || 0}` : `€ ${x.caucao || 0}`), h('td', {}, mode === 'custos' ? `€ ${x.caucao || 0}` : x.status)))))),
    mode === 'custos' ? h('p', { class: 'hint' }, 'A opção marcada como escolhida entra automaticamente no planejamento financeiro (moradia mensal e caução).') : null,
    h('a', { class: 'btn btn-cta', href: '#/novo-lar' }, 'Abrir Meu novo lar', icon('arrow', { size: 14 })));
}

export { richText };
