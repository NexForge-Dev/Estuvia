// Missão com complexidade adaptativa: a interface acompanha a complexidade REAL da tarefa.
//   simples  → um card, uma ação principal, ajuda opcional e confirmação (SimpleMissionView)
//   guiada   → poucos passos, um de cada vez (GuidedMissionView)
//   complexa → passos + ambiente completo com documentos, prazos e ferramentas (ComplexMissionView)
// O risco é tratado à parte: tarefa fácil com consequência séria continua mostrando o alerta.
// Se o estudante pede ajuda numa missão simples, ela vira guiada só para ele.
// Nada é concluído por abrir um link: só os passos marcados e a confirmação final contam.
import { h, mount, toast } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { state, setMe } from '../app.js';
import { fmtDate, pct } from './common.js';
import { MissionContent } from './MissionContent.js';
import { QuickPlan } from './QuickPlan.js';
import { QUICK } from './AIJourneyAssistant.js';
import { termsIn } from '../glossary.js';
import { ConsulateResult } from './ResultCard.js';
import { locale } from '../i18n.js';

const ESTADOS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const eur = (v) => `€ ${Math.round(v || 0).toLocaleString(locale())}`;

const primary = (label, onClick, ic = 'check') => h('button', { type: 'button', class: 'btn btn-cta btn-lg guide-primary', onClick }, icon(ic, { size: 18 }), label);
const secondary = (label, onClick, ic) => h('button', { type: 'button', class: 'guide-secondary', onClick }, ic ? icon(ic, { size: 14 }) : null, label);
const secondaryLink = (label, href, ic) => h('a', { class: 'guide-secondary', href }, ic ? icon(ic, { size: 14 }) : null, label);
const more = (summary, body, { open = false, onToggle } = {}) => {
  const d = h('details', { class: 'guide-more', open }, h('summary', {}, summary), body);
  if (onToggle) d.addEventListener('toggle', () => onToggle(d.open, d));
  return d;
};

export function MissionGuide(m, ctx) {
  const { journey } = ctx;
  const def = m.definicao;
  const base = `/journeys/${journey.id}/missions/${m.id}`;
  const st = ctx.state;
  const steps = m.objetivos;
  const firstOpen = steps.findIndex((o) => !o.feito);
  const allDone = firstOpen === -1;
  if (st.step === undefined || st.step > steps.length) st.step = allDone ? steps.length : firstOpen;
  const ask = (acao) => ctx.openAssistant({ journeyId: journey.id, missaoId: m.id, acao });
  const put = (body) => ctx.mutate(api.put(`${base}/state`, body));
  const setObj = (o, body) => { st.step = undefined; return ctx.mutate(api.put(`${base}/objectives/${o.id}`, body)); };
  const nextMission = journey.proximaMissao && journey.proximaMissao.id !== m.id ? journey.proximaMissao : null;
  const roundLabel = def.rodadaSigla ? 'Financiamento' : `Rodada ${def.rodada}`;
  // Frase principal: o resumo, ou o objetivo quando o resumo é curto demais para orientar sozinho.
  const sentence = (def.resumo || '').length >= 45 || !def.objetivo ? def.resumo || def.objetivo : def.objetivo;
  const pendingSituacao = steps.some((o) => o.tipo === 'situacao' && !o.feito);
  const mode = st.mode || (m.complexidade === 'simples' && !pendingSituacao ? 'simples' : m.complexidade || 'guiada');
  const active = !['concluida', 'nao-aplicavel', 'ignorada'].includes(m.status);

  // ---------- Cabeçalho curto ----------
  const doneCount = steps.filter((o) => o.feito).length;
  const bar = h('span', { class: 'bar-fill' });
  bar.style.width = pct(m.status === 'concluida' ? 1 : steps.length ? doneCount / steps.length : 0);
  const head = h('header', { class: 'guide-head' },
    ctx.inHub ? null : h('nav', { class: 'crumbs', 'aria-label': 'Navegação' },
      h('a', { href: `#/j/${journey.id}` }, journey.destino.universidade?.sigla || 'Jornada'), icon('chevron', { size: 12, cls: 'crumb-sep' }),
      h('a', { href: `#/j/${journey.id}/r/${def.rodada}` }, roundLabel), icon('chevron', { size: 12, cls: 'crumb-sep' }),
      h('span', { 'aria-current': 'page' }, `Missão ${m.label}`)),
    h('p', { class: 'eyebrow' }, `${roundLabel} · Missão ${m.label}${def.opcional ? ' · opcional' : ''}${mode === 'simples' && active ? ` · rápida (${def.tempoEstimado})` : ''}`),
    h('h1', {}, def.titulo),
    m.status !== 'nao-aplicavel' && m.status !== 'ignorada' && mode !== 'simples'
      ? h('div', { class: 'guide-progress' }, h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': steps.length, 'aria-valuenow': doneCount, 'aria-label': 'Passos feitos' }, bar),
          h('span', {}, m.status === 'concluida' ? 'Concluída' : `${doneCount} de ${steps.length} passos`))
      : null);

  // ---------- "O que fazer" (uma frase) + alerta crítico (curto, com a regra completa à parte) ----------
  const what = h('section', { class: 'guide-what' }, h('span', { class: 'guide-what-ic' }, icon('target', { size: 20 })), h('div', {}, h('small', {}, 'O que fazer'), h('p', {}, sentence)));
  const critical = [];
  if (m.prazo && m.status !== 'concluida') {
    const late = m.prazo.diasRestantes < 0;
    critical.push(h('div', { class: `guide-alert ${late || m.prazo.diasRestantes <= 14 ? 'is-hot' : ''}` }, icon('calendar', { size: 16 }),
      h('span', {}, late ? `O prazo era ${fmtDate(m.prazo.data)}. Confira a situação no site oficial.` : `Prazo: ${fmtDate(m.prazo.data)}, faltam ${m.prazo.diasRestantes} dia(s).`),
      h('small', {}, { oficial: 'regra oficial', declarado: 'informado por você', previsto: 'previsão' }[m.prazo.origem] || '')));
  }
  if (m.riscoInfo?.texto && m.riscoInfo.nivel !== 'baixo' && active) {
    critical.push(h('div', { class: `guide-alert is-risk-${m.riscoInfo.nivel}` }, icon('shield', { size: 16 }), h('span', {}, h('strong', {}, 'Atenção: '), m.riscoInfo.texto)));
  }
  const otherAlerts = m.alertas.filter((a) => a.tipo !== 'prazo');
  if (otherAlerts.length && m.status !== 'concluida') {
    critical.push(h('div', { class: 'guide-alert' }, icon('alert', { size: 16 }), h('span', {}, otherAlerts[0].texto)));
  }

  // ---------- Corpo: o passo atual ----------
  let body;
  if (m.status === 'nao-aplicavel') {
    body = card('minus', 'Esta missão não vale para você', m.motivoNaoAplicavel || 'Ela não conta como pendência.',
      nextMission ? primaryLink(`Próxima: ${nextMission.titulo}`, `#/j/${journey.id}/m/${nextMission.id}`) : null,
      m.naoAplicavelMarcado ? secondary('Na verdade, vale para mim', () => put({ naoAplicavel: false }), 'back') : null);
  } else if (m.status === 'ignorada') {
    body = card('minus', 'Você decidiu pular esta missão', 'Ela é opcional e não trava a sua jornada.',
      nextMission ? primaryLink(`Próxima: ${nextMission.titulo}`, `#/j/${journey.id}/m/${nextMission.id}`) : null,
      secondary('Quero fazer esta missão', () => put({ ignorada: false }), 'back'));
  } else if (m.status === 'concluida') {
    body = card('check', m.conclusao === 'requisito-atendido' ? 'Requisito já atendido' : 'Missão concluída!',
      m.conclusao === 'requisito-atendido' ? 'Você informou que já tem isso. Se mudar, corrija em "Meu perfil".' : m.declarada ? 'Você informou que já tinha feito isso antes de usar a Estuvia.' : m.resultado,
      nextMission ? primaryLink(`Continuar: ${nextMission.titulo}`, `#/j/${journey.id}/m/${nextMission.id}`, 'arrow') : primaryLink('Ver minha jornada', `#/j/${journey.id}`, 'map'),
      m.evidencia?.valor ? h('p', { class: 'small muted' }, `Registro: ${m.evidencia.valor}`) : null,
      m.conclusao === 'requisito-atendido' ? null : secondary('Reabrir missão', () => ctx.mutate(api.post(`${base}/reopen`)), 'refresh'));
    body.classList.add('is-done');
  } else if (m.status === 'aguardando') {
    const sit = steps.find((o) => o.tipo === 'situacao' && !o.feito);
    body = card('hourglass', 'Agora é esperar a resposta', 'Isso não depende de você. Quando a resposta chegar, registre aqui.',
      sit ? null : primary('Recebi a resposta', () => put({ aguardando: false })),
      sit ? situationStep(sit) : null,
      nextMission ? secondaryLink(`Enquanto isso: ${nextMission.titulo}`, `#/j/${journey.id}/m/${nextMission.id}`, 'arrow') : null);
  } else if (def.condicional && !st.condOk && doneCount === 0) {
    body = card('help', 'Isso vale para você?', def.condicaoTexto || 'Esta missão só é necessária em alguns casos.',
      primary('Sim, vale para mim', () => { st.condOk = true; ctx.redraw(); }, 'check'),
      secondary('Não vale para mim', () => put({ naoAplicavel: true }), 'minus'),
      secondary('Não sei', () => ask('naoentendi'), 'help'));
  } else if (def.ferramenta === 'consulado' && !st.introDone && doneCount < steps.length) {
    body = consulateStep();
  } else if (m.tipo === 'financeiro' && !st.introDone && doneCount === 0) {
    body = financeStep();
  } else if (mode === 'simples') {
    body = simpleCard();
  } else if (st.step >= steps.length) {
    body = confirmStep();
  } else {
    body = objectiveStep(steps[st.step], st.step);
  }

  // Bolinhas dos passos: dá para rever um passo, sem perder o foco no atual.
  const dots = steps.length > 1 && active && mode !== 'simples'
    ? h('ol', { class: 'guide-dots', 'aria-label': 'Passos da missão' }, [...steps, { id: '__fim' }].map((o, i) => h('li', {},
        h('button', { type: 'button', class: `${i === st.step ? 'on' : ''} ${o.feito ? 'done' : ''}`, 'aria-label': i < steps.length ? `Passo ${i + 1}: ${o.texto}` : 'Confirmar conclusão', 'aria-current': i === st.step ? 'step' : false, onClick: () => { st.step = i; st.introDone = true; st.condOk = true; ctx.redraw(); } },
          o.feito ? icon('check', { size: 12 }) : i < steps.length ? String(i + 1) : icon('trophy', { size: 12 })))))
    : null;

  // ---------- Precisa de ajuda? ----------
  const terms = termsIn(def.titulo, def.resumo, def.objetivo, steps.map((o) => o.texto));
  const plan = h('div');
  const help = h('section', { class: 'guide-help' },
    h('h2', {}, icon('chat', { size: 16 }), 'Precisa de ajuda?'),
    h('div', { class: 'chips' }, (mode === 'simples' && !st.allHelp ? QUICK.filter(([k]) => ['naoentendi', 'mostracomo', 'depois'].includes(k)) : QUICK).map(([acao, label]) => h('button', { type: 'button', class: 'chip', onClick: () => ask(acao) }, label)),
      mode === 'simples' && !st.allHelp ? h('button', { type: 'button', class: 'chip chip-more', onClick: () => { st.allHelp = true; ctx.redraw(); } }, 'Mais…') : null),
    terms.length ? h('div', { class: 'guide-terms' }, h('small', {}, 'Palavras desta missão:'), terms.map((t) => {
      const tip = h('span', { class: 'term-def', hidden: true }, t.texto);
      const b = h('button', { type: 'button', class: 'term', 'aria-expanded': 'false', onClick: () => { tip.hidden = !tip.hidden; b.setAttribute('aria-expanded', String(!tip.hidden)); } }, icon('book', { size: 12 }), t.termo);
      return h('span', { class: 'term-wrap' }, b, tip);
    })) : null,
    !['concluida', 'nao-aplicavel', 'ignorada'].includes(m.status)
      ? h('div', { class: 'guide-plan' }, secondary('Organizar esta missão na minha semana', () => mount(plan, QuickPlan({ journeyId: journey.id, missaoId: m.id })), 'calendar'), plan)
      : null,
    def.opcional && !['concluida', 'ignorada'].includes(m.status) ? secondary('Pular esta missão (é opcional)', () => put({ ignorada: true }), 'minus') : null);

  // ---------- Seções secundárias ----------
  const guideList = def.comoExecutar.length ? h('ol', { class: 'guide-howto' }, def.comoExecutar.map((c) => h('li', {}, h('strong', {}, c.titulo), h('p', {}, c.texto)))) : null;
  const hasUnderstand = def.porque || m.resultado || guideList || m.errosComuns?.length;
  const understand = !hasUnderstand ? null : more([icon('book', { size: 14 }), ' Entender melhor'], h('div', { class: 'stack' },
    def.porque ? h('p', {}, h('strong', {}, 'Por que isso importa: '), def.porque) : null,
    m.resultado ? h('p', {}, h('strong', {}, 'Resultado esperado: '), m.resultado) : null,
    otherAlerts.length > 1 ? h('ul', {}, otherAlerts.map((a) => h('li', {}, a.texto))) : null,
    guideList,
    m.errosComuns?.length ? [h('p', {}, h('strong', {}, 'Erros comuns')), h('ul', {}, m.errosComuns.map((e) => h('li', {}, e)))] : null));
  // Ferramentas: só onde ajudam. Simples: nenhuma. Guiada: recolhidas. Complexa: ambiente completo aberto.
  const toolsHost = h('div');
  const embed = () => MissionContent(m, Object.assign(ctx, { embedded: true, exclude: mode === 'complexa' ? ['executar', 'assistente'] : ['antes', 'guia', 'executar', 'assistente', 'fluxo', 'tutorial'] }));
  if (mode === 'complexa') st.moreOpen ??= true;
  const tools = mode === 'simples' || ctx.inHub ? null : more([icon('wand', { size: 14 }), mode === 'complexa' ? ' Ambiente completo da missão' : ' Mais ferramentas desta missão'], toolsHost, {
    open: Boolean(st.moreOpen),
    onToggle: (open) => { st.moreOpen = open; if (open && !toolsHost.childElementCount) mount(toolsHost, embed()); },
  });
  if (tools && st.moreOpen) mount(toolsHost, embed());
  const sources = m.fontes.length ? more([icon('shield', { size: 14 }), ' Fontes e detalhes'], h('ul', { class: 'guide-sources' }, m.fontes.map((s) => h('li', {},
    s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.titulo, ' ', icon('external', { size: 11 })) : h('span', {}, s.titulo),
    h('small', { class: 'muted' }, `${s.orgao || ''}${s.revisadoEm ? ` · conferida em ${fmtDate(s.revisadoEm)}` : ''}${s.pendente ? ' · aguardando nova conferência' : ''}`))))) : null;

  // Dentro da central da missão (ctx.inHub), cabeçalho de navegação, ajuda e ferramentas já estão na central.
  const inHub = Boolean(ctx.inHub);
  return h('article', { class: `guide g-${m.status} mode-${mode}` }, head, mode === 'simples' && active ? null : what, critical, h('section', { class: 'guide-stage' }, dots, body), inHub ? null : help, h('div', { class: 'guide-secondary-sections' }, understand, inHub ? null : tools, sources));

  // ================= Passos =================

  function card(ic, title, text, ...actions) {
    return h('div', { class: 'guide-card' },
      h('span', { class: 'guide-card-ic' }, icon(ic, { size: 24 })),
      h('h2', {}, title),
      text ? h('p', { class: 'guide-text' }, text) : null,
      h('div', { class: 'guide-actions' }, actions.filter(Boolean)));
  }

  function primaryLink(label, href, ic = 'arrow') {
    return h('a', { class: 'btn btn-cta btn-lg guide-primary', href }, label, icon(ic, { size: 18 }));
  }

  // Um link oficial por vez, com contexto: o que é, e o que fazer depois de abrir.
  function officialBox() {
    if (!m.linkOficial?.url) return null;
    return h('div', { class: 'guide-official' },
      h('div', {}, h('strong', {}, m.linkOficial.rotulo), h('small', {}, `${m.linkOficial.orgao ? `${m.linkOficial.orgao}. ` : ''}Abre em outra aba: faça o passo lá e volte aqui para marcar.`)),
      h('a', { class: 'btn btn-ghost btn-sm', href: m.linkOficial.url, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir site oficial', icon('external', { size: 12 })));
  }

  function objectiveStep(o, i) {
    const label = h('p', { class: 'eyebrow' }, `Passo ${i + 1} de ${steps.length}`);
    // Escolha validada pelo servidor (ex.: fase do DUA): opções grandes; a escolha pode ser trocada.
    if (o.tipo === 'escolha') {
      return h('div', { class: `guide-card is-step ${o.feito ? 'done' : ''}` }, label, h('h2', {}, o.texto),
        o.dica ? h('p', { class: 'guide-text' }, o.dica) : null,
        h('div', { class: 'choice-grid' }, (o.opcoes || []).filter(([v]) => v !== o.valor).map(([v, l]) => h('button', { type: 'button', class: 'choice', onClick: () => setObj(o, { valor: v }) }, h('span', {}, l)))),
        o.valor ? h('p', { class: 'ok-line' }, icon('check', { size: 16 }), ` Registrado: ${(o.opcoes || []).find(([v]) => v === o.valor)?.[1] || o.valor}`) : null,
        o.feito ? h('div', { class: 'guide-actions' }, primary('Ir para o próximo passo', () => { st.step = i + 1; ctx.redraw(); }, 'arrow')) : null);
    }
    if (o.feito && o.tipo !== 'auto') {
      return h('div', { class: 'guide-card is-step done' }, label, h('h2', {}, o.texto), h('p', { class: 'ok-line' }, icon('check', { size: 16 }), ' Feito'),
        h('div', { class: 'guide-actions' }, primary('Ir para o próximo passo', () => { st.step = i + 1; ctx.redraw(); }, 'arrow'),
          o.tipo === 'check' ? secondary('Desmarcar', () => setObj(o, { feito: false }), 'back') : null));
    }
    if (o.tipo === 'situacao') return h('div', { class: 'guide-card is-step' }, label, situationStep(o));
    if (o.tipo === 'auto') {
      return h('div', { class: `guide-card is-step ${o.feito ? 'done' : ''}` }, label, h('h2', {}, o.texto),
        o.feito ? h('p', { class: 'ok-line' }, icon('check', { size: 16 }), ' A Estuvia já confirmou isso com os seus dados.') : h('p', { class: 'guide-text' }, o.dica || 'A Estuvia marca este passo sozinha quando a informação estiver registrada.'),
        h('div', { class: 'guide-actions' },
          o.feito ? primary('Ir para o próximo passo', () => { st.step = i + 1; ctx.redraw(); }, 'arrow') : o.acao ? h('a', { class: 'btn btn-cta btn-lg guide-primary', href: `#${o.acao.rota}` }, o.acao.rotulo, icon('arrow', { size: 18 })) : null,
          o.feito ? null : secondary('Não sei como fazer', () => ask('mostracomo'), 'help')));
    }
    if (o.tipo === 'data' || o.tipo === 'texto') {
      const input = h('input', { type: o.tipo === 'data' ? 'date' : 'text', value: o.valor || '', maxlength: 300, class: 'guide-input', 'aria-label': o.texto });
      return h('div', { class: 'guide-card is-step' }, label, h('h2', {}, o.texto),
        input,
        h('div', { class: 'guide-actions' }, primary('Salvar', () => { if (!input.value) return toast('Preencha antes de salvar.', 'err'); setObj(o, { valor: input.value }); }), secondary('Não sei', () => ask('mostracomo'), 'help')));
    }
    // Passo comum: "faça isto" → "Já fiz". Alternativas quando não dá para concluir agora.
    const alt = h('div', { class: 'guide-alt', hidden: true },
      h('p', {}, 'Tudo bem. Escolha o que acontece:'),
      h('div', { class: 'choice-grid' },
        def.aguardavel ? h('button', { type: 'button', class: 'choice', onClick: () => put({ aguardando: true }) }, icon('hourglass', { size: 18 }), h('span', {}, 'Estou esperando uma resposta')) : null,
        h('button', { type: 'button', class: 'choice', onClick: () => ask('mostracomo') }, icon('help', { size: 18 }), h('span', {}, 'Não sei como fazer')),
        m.documentos.length ? h('button', { type: 'button', class: 'choice', onClick: () => ask('semdocumento') }, icon('file', { size: 18 }), h('span', {}, 'Não tenho o documento')) : null,
        h('button', { type: 'button', class: 'choice', onClick: () => ask('depois') }, icon('clock', { size: 18 }), h('span', {}, 'Quero fazer depois'))));
    return h('div', { class: 'guide-card is-step' }, label,
      h('h2', {}, o.texto),
      i === firstOpen ? officialBox() : null,
      h('div', { class: 'guide-actions' },
        primary('Já fiz', () => setObj(o, { feito: true })),
        secondary('Ainda não consegui', () => { alt.hidden = !alt.hidden; }, 'help')),
      alt);
  }

  // ---------- Missão simples: um card, uma ação principal, confirmação no mesmo lugar ----------
  function simpleCard() {
    const pendingAuto = steps.find((o) => o.tipo === 'auto' && !o.feito);
    const fields = steps.filter((o) => ['data', 'texto', 'escolha'].includes(o.tipo) && !o.feito)
      .map((o) => ({ o, el: o.tipo === 'escolha'
        ? h('select', { class: 'guide-input', 'aria-label': o.texto }, h('option', { value: '' }, 'Escolha…'), (o.opcoes || []).map(([v, l]) => h('option', { value: v }, l)))
        : h('input', { type: o.tipo === 'data' ? 'date' : 'text', class: 'guide-input', maxlength: 300, value: o.valor || '', 'aria-label': o.texto }) }));
    const ev = m.evidencia;
    const evInput = ev ? h('input', { type: 'text', class: 'guide-input', maxlength: 200, value: ev.valor || '', placeholder: 'Ex.: número, data ou nome do arquivo', 'aria-label': ev.rotulo }) : null;
    const confirmHost = h('div');
    const toGuided = () => { st.mode = 'guiada'; st.step = undefined; ctx.redraw(); };

    const finish = async () => {
      if (fields.some(({ el }) => !el.value)) return toast('Preencha o campo antes de concluir.', 'err');
      if (ev?.obrigatoria && !evInput.value.trim()) { evInput.focus(); return toast('Registre a referência para guardar a prova do que você fez.', 'err'); }
      try {
        for (const o of steps.filter((x) => x.tipo === 'check' && !x.feito)) await api.put(`${base}/objectives/${o.id}`, { feito: true });
        for (const { o, el } of fields) await api.put(`${base}/objectives/${o.id}`, { valor: el.value });
        st.step = undefined;
        ctx.mutate(api.post(`${base}/complete`, { confirmo: true, ...(evInput?.value.trim() ? { evidencia: evInput.value.trim() } : {}) }));
      } catch (e) { toast(e.message, 'err'); }
    };
    // "Já fiz": confirma no mesmo card o que conta como feito (sem telas extras).
    const askConfirm = () => mount(confirmHost, h('div', { class: 'simple-confirm' },
      h('p', {}, h('strong', {}, 'Conseguiu? '), 'Confirme só se fez de verdade, ler aqui não conta.'),
      steps.filter((o) => o.tipo === 'check' && !o.feito).length > 1 ? h('ul', { class: 'simple-list' }, steps.filter((o) => o.tipo === 'check' && !o.feito).map((o) => h('li', {}, icon('check', { size: 12 }), o.texto))) : null,
      fields.map(({ o, el }) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, o.texto), el)),
      ev ? h('label', { class: 'field' }, h('span', { class: 'field-label' }, `${ev.rotulo}${ev.obrigatoria ? '' : ' (opcional)'}`), evInput) : null,
      primary('Sim, concluí', finish, 'trophy')));

    let main;
    if (pendingAuto?.acao) main = h('a', { class: 'btn btn-cta btn-lg guide-primary', href: `#${pendingAuto.acao.rota}` }, pendingAuto.acao.rotulo, icon('arrow', { size: 18 }));
    else if (m.linkOficial?.url) main = h('a', { class: 'btn btn-cta btn-lg guide-primary', href: m.linkOficial.url, target: '_blank', rel: 'noopener noreferrer', onClick: () => setTimeout(askConfirm, 400) }, m.linkOficial.rotulo, icon('external', { size: 16 }));
    else main = primary('Já fiz isso', askConfirm);

    return h('div', { class: 'guide-card is-simple' },
      h('span', { class: 'guide-card-ic' }, icon(pendingAuto ? 'user' : m.linkOficial?.url ? 'external' : 'target', { size: 24 })),
      h('h2', {}, sentence),
      pendingAuto ? h('p', { class: 'guide-text' }, pendingAuto.dica || 'A Estuvia marca sozinha quando a informação estiver registrada.') : m.linkOficial?.url ? h('p', { class: 'guide-text' }, 'Abre o site oficial em outra aba. Faça lá e volte aqui.') : null,
      h('div', { class: 'guide-actions' }, main, m.linkOficial?.orgao && !pendingAuto ? h('small', { class: 'muted center' }, `Fonte oficial: ${m.linkOficial.orgao}`) : null),
      pendingAuto ? null : h('div', { class: 'choice-grid' },
        m.linkOficial?.url ? h('button', { type: 'button', class: 'choice', onClick: askConfirm }, icon('check', { size: 18 }), h('span', {}, 'Já fiz')) : null,
        def.aguardavel ? h('button', { type: 'button', class: 'choice', onClick: () => put({ aguardando: true }) }, icon('hourglass', { size: 18 }), h('span', {}, 'Já pedi e estou aguardando')) : null,
        h('button', { type: 'button', class: 'choice', onClick: () => { toGuided(); ask('mostracomo'); } }, icon('help', { size: 18 }), h('span', {}, 'Preciso de ajuda'))),
      pendingAuto ? secondary('Não sei como fazer', () => { toGuided(); ask('mostracomo'); }, 'help') : null,
      confirmHost);
  }

  // Decisão externa (resultado, matrícula, visto): opções grandes, sem jargão.
  function situationStep(o) {
    const opts = (o.opcoes || []).filter(([v]) => v !== o.valor);
    return h('div', { class: 'stack' },
      h('h2', {}, o.texto),
      h('p', { class: 'guide-text' }, 'O que aconteceu até agora? (a Estuvia não consulta o sistema oficial: você registra)'),
      h('div', { class: 'choice-grid' }, opts.map(([v, l]) => h('button', { type: 'button', class: 'choice', onClick: () => setObj(o, { valor: v }) }, h('span', {}, l)))),
      o.valor ? h('p', { class: 'small muted' }, `Registrado agora: ${(o.opcoes || []).find(([v]) => v === o.valor)?.[1] || o.valor}`) : null);
  }

  // "Conseguiu?" — confirmação explícita (e evidência, quando a missão pede).
  function confirmStep() {
    const ev = m.evidencia;
    const input = ev ? h('input', { type: 'text', class: 'guide-input', maxlength: 200, value: ev.valor || '', placeholder: 'Ex.: número, data ou nome do arquivo', 'aria-label': ev.rotulo }) : null;
    if (!m.podeConcluir) {
      return card('alert', 'Falta um passo', 'Volte aos passos que ainda não estão marcados.', primary('Ver o que falta', () => { st.step = firstOpen < 0 ? 0 : firstOpen; ctx.redraw(); }, 'back'));
    }
    return h('div', { class: 'guide-card is-step is-confirm' },
      h('span', { class: 'guide-card-ic' }, icon('trophy', { size: 24 })),
      h('h2', {}, 'Conseguiu concluir?'),
      h('p', { class: 'guide-text' }, 'Confirme só se você fez isso de verdade (no site ou no órgão oficial). Ler aqui não conta.'),
      ev ? h('label', { class: 'field' }, h('span', { class: 'field-label' }, `${ev.rotulo}${ev.obrigatoria ? '' : ' (opcional)'}`), input) : null,
      h('div', { class: 'guide-actions' },
        primary('Sim, concluí', () => {
          if (ev?.obrigatoria && !input.value.trim()) { input.focus(); return toast('Registre a referência para guardar a prova do que você fez.', 'err'); }
          st.step = undefined;
          ctx.mutate(api.post(`${base}/complete`, { confirmo: true, ...(input?.value.trim() ? { evidencia: input.value.trim() } : {}) }));
        }, 'trophy'),
        secondary('Ainda não', () => ask('depois'), 'clock')));
  }

  // 5.1 — "Em qual estado você mora?" → "Encontramos seu consulado!" (a regra de jurisdição fica nos bastidores).
  function consulateStep() {
    const uf = state.me.user.profile.estado;
    const c = m.consulado?.sugerido;
    if (!uf) {
      const sel = h('select', { class: 'guide-input', 'aria-label': 'Estado' }, h('option', { value: '' }, 'Escolha seu estado'), ESTADOS.map((e) => h('option', { value: e }, e)));
      return card('pin', 'Em qual estado do Brasil você mora?', 'Com isso, a Estuvia descobre qual consulado atende você.', sel,
        primary('Continuar', async () => {
          if (!sel.value) return toast('Escolha o estado.', 'err');
          try { setMe(await api.put('/me/profile', { estado: sel.value })); await ctx.reload(); } catch (e) { toast(e.message, 'err'); }
        }, 'arrow'));
    }
    // O resultado vem da base consular verificada no servidor (consulateResult).
    const r = m.consulado?.resultado || (c
      ? { tipo: 'consulado', status: 'encontrado', estado: { uf, nome: uf }, consulado: { ...c, email: c.emailContato || c.emailVistos, emailRotulo: c.emailVistos ? 'E-mail do setor de vistos' : 'E-mail do consulado', emailEspecificoVistos: Boolean(c.emailVistos), vistoEstudosUrl: c.vistoEstudosUrl || c.site }, fonte: { orgao: c.nome, titulo: 'Demarcação consular', url: c.demarcacaoUrl || c.site, verificadoEm: c.verificadoEm } }
      : { tipo: 'consulado', status: 'nao-confirmado', estado: { uf, nome: uf }, procedimento: { rotulo: 'Ver consulados da Espanha no Brasil', url: m.consulado?.listaUrl, orgao: 'Governo da Espanha' } });
    const onEstado = () => { location.hash = '#/perfil'; };
    if (r.status !== 'encontrado') {
      return ConsulateResult(r, { onAjuda: () => ask('mostracomo'), onEstado, onConfirmar: () => { st.introDone = true; ctx.redraw(); } });
    }
    // Ação principal: o consulado já está identificado → conclui a 5.1 e leva direto aos documentos do visto (5.3).
    const docsMission = '5.3';
    const goDocs = async () => {
      try {
        for (const o of steps.filter((x) => x.tipo !== 'auto' && !x.feito)) await api.put(`${base}/objectives/${o.id}`, { feito: true });
        const res = await api.post(`${base}/complete`, { confirmo: true, evidencia: r.consulado.nome });
        await ctx.mutate(Promise.resolve(res)); // atualiza o cache da jornada e mostra a conquista
        location.hash = `#/j/${journey.id}/m/${docsMission}`;
      } catch (e) { toast(e.message, 'err'); }
    };
    return ConsulateResult(r, {
      acaoPrincipal: { rotulo: 'Ver documentos do meu visto', icone: 'file', onClick: goDocs },
      onAjuda: () => ask('mostracomo'), onEstado,
    });
  }

  // Financiamento: obstáculo vira caminho. Nunca bloqueia sem mostrar alternativas.
  function financeStep() {
    const host = h('div');
    const f = m.financeiro;
    const show = (choice) => {
      const go = (label, href, ic) => h('a', { class: 'choice', href }, icon(ic, { size: 18 }), h('span', {}, label));
      if (choice === 'sim') mount(host, h('p', { class: 'guide-text' }, 'Ótimo! Registre seus recursos para a Estuvia conferir se cobrem a exigência do visto.'), h('a', { class: 'btn btn-cta guide-primary', href: '#/financiamento#recursos' }, 'Registrar meus recursos', icon('arrow', { size: 16 })));
      if (choice === 'nao') {
        mount(host, h('p', { class: 'guide-text' }, h('strong', {}, 'Vamos encontrar alternativas.')),
          h('div', { class: 'choice-grid' }, go('Procurar bolsas', '#/financiamento#bolsas', 'trophy'), go('Planejar economia', '#/financiamento', 'euro'),
            h('button', { type: 'button', class: 'choice', onClick: () => ask('apoio') }, icon('users', { size: 18 }), h('span', {}, 'Ver apoio da família')),
            go('Comparar destinos mais baratos', '#/mestrados', 'map')));
      }
      if (choice === 'familia') mount(host, h('p', { class: 'guide-text' }, 'Apoio da família pode contar, mas o consulado define como ele precisa ser comprovado.'), h('div', { class: 'row wrap' }, h('a', { class: 'btn btn-cta', href: '#/financiamento#recursos' }, 'Registrar o apoio', icon('arrow', { size: 16 })), secondary('Como comprovar?', () => ask('apoio'), 'help')));
      if (choice === 'naosei') {
        mount(host, f
          ? h('div', { class: 'guide-number' }, h('small', {}, 'Estimativa para o visto'), h('strong', {}, eur(f.exigenciaVisto)), h('p', { class: 'small muted' }, `${Math.round(f.iprem.percentual * 100)}% do IPREM (€ ${f.iprem.mensal}/mês em ${f.iprem.ano}) × ${f.meses} meses. É uma estimativa: o consulado confirma o valor.`), h('a', { class: 'btn btn-cta', href: '#/financiamento' }, 'Ver meu plano completo', icon('arrow', { size: 16 })))
          : h('a', { class: 'btn btn-cta', href: '#/financiamento' }, 'Calcular quanto preciso', icon('arrow', { size: 16 })));
      }
    };
    return h('div', { class: 'guide-card' },
      h('span', { class: 'guide-card-ic' }, icon('euro', { size: 24 })),
      h('h2', {}, 'Você já tem dinheiro para comprovar seus estudos?'),
      h('div', { class: 'choice-grid' },
        [['sim', 'Sim'], ['nao', 'Ainda não'], ['familia', 'Tenho apoio da família'], ['naosei', 'Não sei quanto preciso']].map(([k, l]) => h('button', { type: 'button', class: 'choice', 'aria-pressed': 'false', onClick: (e) => { e.currentTarget.parentElement.querySelectorAll('.choice').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); show(k); } }, h('span', {}, l)))),
      host,
      h('div', { class: 'guide-actions' }, secondary('Pular e ver os passos', () => { st.introDone = true; ctx.redraw(); }, 'arrow')));
  }
}

// ---------- Missão bloqueada: só nome, objetivo resumido e o que falta ----------
export function LockedMission(m, journey, { onArrival } = {}) {
  const p = m.previa;
  const jid = journey.id;
  const missing = m.bloqueadaPor.map((b) => {
    if (b.rodada) return h('li', {}, icon('lock', { size: 14 }), h('a', { href: `#/j/${jid}/r/${b.rodada}` }, `Liberar a Rodada ${b.rodada}`));
    if (b.externo) return h('li', {}, icon('hourglass', { size: 14 }), h('span', {}, `Aguardando: ${b.titulo}`));
    return h('li', {}, icon('target', { size: 14 }), h('a', { href: `#/j/${jid}/m/${b.id}` }, `Missão ${b.label} - ${b.titulo}`));
  });
  const firstMission = m.bloqueadaPor.find((b) => b.id);
  const lockInfo = m.rodadaDesbloqueio;
  return h('article', { class: 'guide g-bloqueada' },
    h('nav', { class: 'crumbs', 'aria-label': 'Navegação' },
      h('a', { href: `#/j/${jid}` }, journey.destino.universidade?.sigla || 'Jornada'), icon('chevron', { size: 12, cls: 'crumb-sep' }),
      h('a', { href: `#/j/${jid}/r/${m.rodada}` }, p.rodadaSigla ? 'Financiamento' : `Rodada ${m.rodada}`), icon('chevron', { size: 12, cls: 'crumb-sep' }),
      h('span', { 'aria-current': 'page' }, `Missão ${m.label}`)),
    h('div', { class: 'guide-card locked-card' },
      h('span', { class: 'guide-card-ic is-lock' }, icon('lock', { size: 26 })),
      h('p', { class: 'eyebrow' }, `Missão ${m.label} · bloqueada`),
      h('h1', {}, m.titulo),
      h('p', { class: 'guide-text' }, p.resumo || p.objetivo),
      m.prazo ? h('div', { class: 'guide-alert is-hot' }, icon('calendar', { size: 16 }), h('span', {}, `Prazo oficial: ${fmtDate(m.prazo.data)} (${m.prazo.diasRestantes} dia(s)). Vá preparando o que falta.`)) : null,
      h('h2', { class: 'small-title' }, 'Para liberar, falta:'),
      h('ul', { class: 'locked-missing' }, missing),
      lockInfo ? h('p', { class: 'small muted' }, lockInfo.texto) : null,
      h('div', { class: 'guide-actions' },
        lockInfo?.acao === 'registrar-chegada' && onArrival ? ArrivalForm(journey, onArrival)
          : firstMission ? h('a', { class: 'btn btn-cta btn-lg guide-primary', href: `#/j/${jid}/m/${firstMission.id}` }, `Ir para a Missão ${firstMission.label}`, icon('arrow', { size: 18 }))
            : h('a', { class: 'btn btn-cta btn-lg guide-primary', href: `#/j/${jid}` }, 'Ver minha jornada', icon('map', { size: 18 })))),
    h('p', { class: 'hint center' }, 'O conteúdo completo desta missão aparece assim que ela for liberada.'));
}

// Registrar a chegada à Espanha (fato declarado, com confirmação): libera as Rodadas 7 e 8.
export function ArrivalForm(journey, onDone) {
  // "Hoje" na Espanha (o servidor valida a data de entrada pelo horário de Madri).
  const date = h('input', { type: 'date', class: 'guide-input', max: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date()), 'aria-label': 'Data de entrada na Espanha' });
  const chk = h('input', { type: 'checkbox' });
  const btn = h('button', { type: 'button', class: 'btn btn-cta btn-lg guide-primary', onClick: async () => {
    if (!date.value) return toast('Informe a data em que você entrou na Espanha.', 'err');
    if (!chk.checked) return toast('Confirme que você já está na Espanha.', 'err');
    try { onDone(await api.post(`/journeys/${journey.id}/arrival`, { dataEntrada: date.value, confirmo: true })); } catch (e) { toast(e.message, 'err'); }
  } }, icon('plane', { size: 18 }), 'Registrar minha chegada');
  return h('div', { class: 'arrival-form stack' },
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Quando você entrou na Espanha?'), date),
    h('label', { class: 'check' }, chk, h('span', {}, 'Confirmo que já entrei na Espanha.')),
    h('p', { class: 'hint' }, 'A data de entrada é usada para calcular o prazo da TIE.'),
    btn);
}
