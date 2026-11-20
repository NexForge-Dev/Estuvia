// Página inicial (dashboard central): visual, organizada e sem excesso de informação.
import { h } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { state, loadJourneys, loadJourney, emptyState } from '../app.js';
import { fmtDate } from '../components/common.js';
import { locale } from '../i18n.js';

const eur = (v) => `€ ${Math.round(v || 0).toLocaleString(locale())}`;

function smartAlerts(j, user, fin, planner) {
  const alerts = [];
  const all = j.rodadas.flatMap((r) => r.missoes);
  all.filter((m) => m.prioridade === 'critica').slice(0, 2).forEach((m) => alerts.push({ ic: 'alert', tone: 'danger', texto: `Urgente: ${m.titulo}`, rota: `/j/${j.id}/m/${m.id}` }));
  j.prazos.filter((p) => p.diasRestantes >= 0 && p.diasRestantes <= 14).slice(0, 2).forEach((p) => alerts.push({ ic: 'calendar', tone: 'warn', texto: `Prazo chegando: ${p.titulo} (${fmtDate(p.data)}, ${p.diasRestantes === 1 ? 'falta 1 dia' : `faltam ${p.diasRestantes} dias`})`, rota: p.missao ? `/j/${j.id}/m/${p.missao}` : '/agenda' }));
  const pendDocs = Object.entries(user.documents || {}).filter(([, s]) => s === 'correcao').length;
  if (pendDocs) alerts.push({ ic: 'file', tone: 'warn', texto: pendDocs === 1 ? '1 documento precisa de correção' : `${pendDocs} documentos precisam de correção`, rota: '/documentos' });
  else {
    const open = all.filter((m) => ['disponivel', 'em-andamento', 'atencao'].includes(m.status) && m.rodada === 2).length;
    if (open) alerts.push({ ic: 'file', tone: 'info', texto: open === 1 ? 'Falta 1 documento da candidatura' : `Faltam documentos da candidatura em ${open} passos`, rota: `/j/${j.id}/r/2` });
  }
  (fin?.candidaturas || []).filter((a) => a.status === 'enviada').forEach((a) => alerts.push({ ic: 'trophy', tone: 'info', texto: `Resultado de bolsa a verificar: ${a.nome}`, rota: '/financiamento#bolsas' }));
  if (fin && fin.plano.informouRecursos && fin.plano.deficit > 0) alerts.push({ ic: 'euro', tone: 'warn', texto: `Revise seu financiamento: faltam ${eur(fin.plano.deficit)} (estimativa)`, rota: '/financiamento' });
  // Só depois da escolha do mestrado: antes disso, pedir dinheiro comprovado só confunde.
  if (fin && !fin.plano.informouRecursos && j.rodadaAtual >= 2) alerts.push({ ic: 'euro', tone: 'info', texto: 'Registre o dinheiro que você consegue comprovar para ver se o plano fecha', rota: '/financiamento#recursos' });
  const visa = j.rodadas.find((r) => r.numero === 5);
  if (j.situacao.adjudicacao === 'admitido' && visa && visa.status !== 'concluida' && visa.missoes.some((m) => m.status === 'atencao' || m.status === 'disponivel')) alerts.push({ ic: 'passport', tone: 'warn', texto: 'Faltam documentos para o visto', rota: `/j/${j.id}/r/5` });
  if (!planner.events.some((e) => e.data >= new Date().toISOString().slice(0, 10))) alerts.push({ ic: 'calendar', tone: 'info', texto: 'Sua semana ainda não está planejada: deixe a Agenda sugerir', rota: '/agenda#organizar' });
  return alerts.slice(0, 2);
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
  const rodadas = j.rodadas.filter((r) => !r.sigla);
  const today = new Date().toISOString().slice(0, 10);
  const nextEvent = planner.events.filter((e) => e.data >= today).sort((a, b) => `${a.data}${a.inicio}`.localeCompare(`${b.data}${b.inicio}`))[0];
  // Minimalista: só um aviso, e só se for urgente (prazo perto, missão crítica, documento para corrigir).
  const alert = smartAlerts(j, state.me.user, fin, planner).find((a) => a.tone === 'danger' || a.tone === 'warn');
  const next = j.proximaMissao;
  const bar = (v) => { const el = h('span'); el.style.width = `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`; return h('div', { class: 'hm-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(v * 100), 'aria-label': 'Progresso da rodada' }, el); };
  const link = (href, ic, titulo, sub) => h('a', { class: 'hm-link', href }, icon(ic, { size: 18 }), h('span', {}, h('strong', {}, titulo), sub ? h('small', {}, sub) : null), icon('arrow', { size: 14, cls: 'hm-link-go' }));
  const evDate = (e) => new Date(`${e.data}T12:00:00`).toLocaleDateString(locale(), { weekday: 'short', day: '2-digit', month: 'short' });

  return h('div', { class: 'home-min' },
    h('header', { class: 'hm-head' },
      h('h1', {}, `Olá, ${p.apelido}`),
      h('p', {}, [j.destino.cidade && j.destino.universidade?.sigla ? `${j.destino.cidade} (${j.destino.universidade.sigla})` : j.destino.universidade?.sigla, j.destino.programa?.nome || 'mestrado a definir'].filter(Boolean).join(' · '))),

    next
      ? h('a', { class: 'hm-next', href: `#/j/${j.id}/m/${next.id}` },
        h('small', {}, next.prioridade === 'critica' ? 'Urgente · seu próximo passo' : 'Seu próximo passo'),
        h('strong', {}, next.titulo),
        next.resumo ? h('p', {}, next.resumo) : null,
        h('span', { class: 'btn btn-cta btn-lg' }, next.status === 'disponivel' ? 'Começar' : 'Continuar', icon('arrow', { size: 16 })))
      : h('a', { class: 'hm-next', href: `#/j/${j.id}` }, h('strong', {}, 'Nada pendente agora'), h('span', { class: 'btn btn-ghost' }, 'Ver o caminho')),

    alert ? h('a', { class: `hm-alert t-${alert.tone}`, href: `#${alert.rota}` }, icon(alert.ic, { size: 15 }), h('span', {}, alert.texto)) : null,

    atual ? h('a', { class: 'jm-card is-now', href: `#/j/${j.id}/r/${atual.numero}` },
      h('span', { class: 'jm-img' }, h('img', { src: atual.banner, alt: '', loading: 'lazy' }), h('span', { class: 'jm-num' }, h('small', {}, 'Rodada'), String(atual.numero))),
      h('span', { class: 'jm-text' },
        h('small', {}, `Rodada ${atual.numero} de ${rodadas.length}`),
        h('strong', {}, atual.titulo),
        h('small', {}, `${atual.concluidas} de ${atual.total} missões feitas`),
        bar(atual.total ? atual.concluidas / atual.total : 0))) : null,

    h('nav', { class: 'hm-links', 'aria-label': 'Atalhos' },
      link('#/agenda', 'calendar', 'Agenda', nextEvent ? `${evDate(nextEvent)} · ${nextEvent.titulo}` : 'Nada planejado'),
      link('#/documentos', 'folder', 'Documentos', null),
      link('#/financiamento', 'euro', 'Dinheiro', fin ? `Custo ≈ ${eur(fin.plano.orcamento)}` : null),
      ...journeys.slice(1).map((x) => link(`#/j/${x.id}`, 'map', `Outra jornada: ${x.destino.universidade?.sigla || ''}`, x.destino.programa?.nome || null))),
  );
}
