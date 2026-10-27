// Página inicial (dashboard central): visual, organizada e sem excesso de informação.
import { h } from '../ui.js';
import { icon, ring } from '../icons.js';
import { api } from '../api.js';
import { state, loadJourneys, loadJourney, emptyState } from '../app.js';
import { RoundCard } from '../components/RoundCard.js';
import { DeadlinesPanel } from '../components/JourneyProgress.js';
import { pctLabel, fmtDate } from '../components/common.js';
import { CATEGORY } from '../components/WeeklyPlanner.js';

const eur = (v) => `€ ${Math.round(v || 0).toLocaleString('pt-BR')}`;

function smartAlerts(j, user, fin, planner) {
  const alerts = [];
  const all = j.rodadas.flatMap((r) => r.missoes);
  all.filter((m) => m.prioridade === 'critica').slice(0, 2).forEach((m) => alerts.push({ ic: 'alert', tone: 'danger', texto: `Ação crítica: Missão ${m.label} — ${m.titulo}`, rota: `/j/${j.id}/m/${m.id}` }));
  j.prazos.filter((p) => p.diasRestantes >= 0 && p.diasRestantes <= 14).slice(0, 2).forEach((p) => alerts.push({ ic: 'calendar', tone: 'warn', texto: `Prazo próximo: ${p.titulo} (${fmtDate(p.data)}, ${p.diasRestantes} dia(s))`, rota: p.missao ? `/j/${j.id}/m/${p.missao}` : '/agenda' }));
  const pendDocs = Object.entries(user.documents || {}).filter(([, s]) => s === 'correcao').length;
  if (pendDocs) alerts.push({ ic: 'file', tone: 'warn', texto: `${pendDocs} documento(s) precisam de correção`, rota: '/documentos' });
  else {
    const open = all.filter((m) => ['disponivel', 'em-andamento', 'atencao'].includes(m.status) && m.rodada === 2).length;
    if (open) alerts.push({ ic: 'file', tone: 'info', texto: `Documentos da candidatura pendentes em ${open} missão(ões)`, rota: `/j/${j.id}/r/2` });
  }
  (fin?.candidaturas || []).filter((a) => a.status === 'enviada').forEach((a) => alerts.push({ ic: 'trophy', tone: 'info', texto: `Resultado de bolsa a verificar: ${a.nome}`, rota: '/financiamento#bolsas' }));
  if (fin && fin.plano.informouRecursos && fin.plano.deficit > 0) alerts.push({ ic: 'euro', tone: 'warn', texto: `Revise seu financiamento: faltam ${eur(fin.plano.deficit)} (estimativa)`, rota: '/financiamento' });
  if (fin && !fin.plano.informouRecursos) alerts.push({ ic: 'euro', tone: 'info', texto: 'Registre seus recursos para saber se o plano financeiro fecha', rota: '/financiamento#recursos' });
  const visa = j.rodadas.find((r) => r.numero === 5);
  if (j.situacao.adjudicacao === 'admitido' && visa && visa.status !== 'concluida' && visa.missoes.some((m) => m.status === 'atencao' || m.status === 'disponivel')) alerts.push({ ic: 'passport', tone: 'warn', texto: 'Procedimento migratório com documentação incompleta (Rodada 5)', rota: `/j/${j.id}/r/5` });
  if (!planner.events.some((e) => e.data >= new Date().toISOString().slice(0, 10))) alerts.push({ ic: 'calendar', tone: 'info', texto: 'Sua semana ainda não está planejada: deixe a Agenda sugerir', rota: '/agenda#organizar' });
  return alerts.slice(0, 3);
}

export async function homeView() {
  const journeys = await loadJourneys();
  const p = state.me.user.profile;
  if (!journeys.length) {
    return h('div', { class: 'stack-lg' },
      h('header', { class: 'page-head' }, h('div', {}, h('p', { class: 'eyebrow' }, 'Bem-vindo(a) à Estuvia'), h('h1', {}, `Olá, ${p.apelido}!`))),
      emptyState('Vamos criar sua primeira jornada', 'Escolha um destino e um mestrado. A Estuvia transforma o processo inteiro em rodadas e missões para você executar.', h('a', { class: 'btn btn-cta btn-lg', href: '#/jornadas/nova' }, 'Criar minha jornada', icon('arrow', { size: 16 })), 'map'));
  }
  const main = journeys[0];
  const [j, fin, planner] = await Promise.all([loadJourney(main.id), api.get(`/finance?journeyId=${main.id}`).catch(() => null), api.get('/planner').catch(() => ({ events: [], deadlines: [] }))]);
  const atual = j.rodadas.find((r) => r.numero === j.rodadaAtual);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = planner.events.filter((e) => e.data >= today).sort((a, b) => `${a.data}${a.inicio}`.localeCompare(`${b.data}${b.inicio}`)).slice(0, 5);
  const alerts = smartAlerts(j, state.me.user, fin, planner);

  return h('div', { class: 'home stack-lg' },
    h('section', { class: 'home-hero' },
      h('img', { class: 'jh-bg', src: j.destino.universidade?.capa || '/img/cities/andaluzia.svg', alt: '' }),
      h('div', { class: 'home-hero-content' },
        h('div', {},
          h('p', { class: 'eyebrow' }, `Olá, ${p.apelido} · Minha jornada`),
          h('h1', {}, j.destino.origem, h('span', { class: 'jh-arrow' }, icon('arrow', { size: 26 })), j.destino.universidade?.nome || 'Andaluzia'),
          h('p', { class: 'jh-course' }, j.destino.programa?.nome || 'Mestrado a definir', j.destino.programa?.demo ? h('span', { class: 'chip-demo' }, 'Dados demo') : null),
          j.proximaMissao
            ? h('a', { class: 'btn btn-cta btn-lg', href: `#/j/${j.id}/m/${j.proximaMissao.id}` }, icon('play', { size: 16 }), `Continuar missão ${j.proximaMissao.label}`)
            : h('a', { class: 'btn btn-cta btn-lg', href: `#/j/${j.id}` }, 'Ver rodadas'),
          j.proximaMissao ? h('p', { class: 'hero-next' }, j.proximaMissao.titulo, j.proximaMissao.prioridade === 'critica' ? h('span', { class: 'chip-status st-atencao' }, 'Crítica') : null) : null),
        h('div', { class: 'jh-ring' }, ring(j.progresso, { size: 140, stroke: 11, cls: 'ring-xl' }), h('div', { class: 'jh-ring-label' }, h('strong', {}, pctLabel(j.progresso)), h('span', {}, 'da jornada'))))),

    alerts.length ? h('section', { class: 'alerts' }, h('h2', { class: 'sr-only' }, 'Alertas inteligentes'), alerts.map((a) => h('a', { class: `alert-item t-${a.tone}`, href: `#${a.rota}` }, icon(a.ic, { size: 16 }), h('span', {}, a.texto), icon('arrow', { size: 14, cls: 'alert-go' })))) : null,

    h('div', { class: 'home-grid' },
      h('section', { class: 'home-round' }, h('div', { class: 'section-head' }, h('h2', {}, 'Minha rodada atual'), h('a', { class: 'link-arrow', href: `#/j/${j.id}` }, 'Todas as rodadas', icon('arrow', { size: 14 }))), RoundCard(atual, { journeyId: j.id, atual: true })),
      h('section', { class: 'panel' },
        h('div', { class: 'section-head' }, h('h2', { class: 'panel-title' }, icon('calendar', { size: 18 }), 'Agenda'), h('a', { class: 'link-arrow', href: '#/agenda' }, 'Abrir', icon('arrow', { size: 14 }))),
        upcoming.length
          ? h('ul', { class: 'agenda-mini' }, upcoming.map((e) => h('li', {}, h('span', { class: `wp-dot ${CATEGORY[e.categoria]?.cls}` }), h('div', {}, h('strong', {}, e.titulo), h('small', { class: 'muted' }, `${new Date(`${e.data}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })} · ${e.inicio}–${e.fim}`)))))
          : h('div', { class: 'stack' }, h('p', { class: 'muted small' }, 'Nenhuma atividade planejada.'), h('a', { class: 'btn btn-ghost btn-sm', href: '#/agenda#organizar' }, icon('calendar', { size: 14 }), 'Organizar minha semana'))),
      DeadlinesPanel(j),
      h('section', { class: 'panel' },
        h('div', { class: 'section-head' }, h('h2', { class: 'panel-title' }, icon('euro', { size: 18 }), 'Minha situação financeira'), h('a', { class: 'link-arrow', href: '#/financiamento' }, 'Abrir', icon('arrow', { size: 14 }))),
        fin ? h('dl', { class: 'fin fin-3' },
          h('div', {}, h('dt', {}, 'Orçamento estimado'), h('dd', {}, eur(fin.plano.orcamento))),
          h('div', {}, h('dt', {}, 'Exigência do visto'), h('dd', {}, eur(fin.plano.exigenciaVisto))),
          h('div', { class: fin.plano.deficit > 0 ? 'neg' : 'pos' }, h('dt', {}, 'Recursos registrados'), h('dd', {}, eur(fin.plano.confirmados)))) : h('p', { class: 'muted' }, 'Indisponível.')),
      journeys.length > 1 ? h('section', { class: 'panel' }, h('h2', { class: 'panel-title' }, icon('map', { size: 18 }), 'Outras jornadas'), h('ul', { class: 'agenda-mini' }, journeys.slice(1).map((x) => h('li', {}, h('a', { href: `#/j/${x.id}` }, `${x.destino.universidade?.sigla} — ${x.destino.programa?.nome || ''}`), h('small', { class: 'muted' }, pctLabel(x.progresso)))))) : null),
  );
}
