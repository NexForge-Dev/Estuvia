// Trilha da rodada (zigue-zague) + botão fixo "Continuar minha jornada".
// Rodada bloqueada: só a prévia, o que falta para desbloquear e o que já dá para adiantar.
import { h } from '../ui.js';
import { icon } from '../icons.js';
import { loadJourney, go, emptyState } from '../app.js';
import { MissionPath } from '../components/MissionPath.js';
import { fmtDate } from '../components/common.js';

const crumbs = (j, round) => h('nav', { class: 'crumbs', 'aria-label': 'Navegação' },
  h('a', { href: '#/jornadas' }, 'Minhas Jornadas'), icon('chevron', { size: 12, cls: 'crumb-sep' }),
  h('a', { href: `#/j/${j.id}` }, j.destino.universidade?.sigla || 'Jornada'), icon('chevron', { size: 12, cls: 'crumb-sep' }),
  h('span', { 'aria-current': 'page' }, round.sigla ? 'Financiamento' : `Rodada ${round.numero}`));

function lockedRound(j, round) {
  const jid = j.id;
  const faltam = round.desbloqueio?.faltam || [];
  const prazos = j.prazos.filter((p) => p.missao && p.missao.startsWith(`${round.numero}.`) && p.origem === 'oficial');
  const early = round.missoes.filter((m) => m.trilha && !['concluida', 'nao-aplicavel'].includes(m.status));
  return h('div', { class: 'trail is-locked' },
    crumbs(j, round),
    h('header', { class: 'trail-head locked' },
      h('img', { src: round.banner, alt: '' }),
      h('div', { class: 'trail-head-content' },
        h('span', { class: 'lock-badge' }, icon('lock', { size: 22 })),
        h('p', { class: 'eyebrow' }, `Rodada ${round.numero} · bloqueada`),
        h('h1', {}, round.titulo),
        h('p', { class: 'muted' }, round.resumo))),
    h('section', { class: 'guide-card' },
      h('h2', {}, 'Para desbloquear esta rodada'),
      h('p', { class: 'guide-text' }, round.desbloqueio?.texto),
      faltam.length ? h('ul', { class: 'locked-missing' }, faltam.map((f) => h('li', {}, icon('target', { size: 14 }),
        f.id ? h('a', { href: `#/j/${jid}/m/${f.id}` }, `Missão ${f.label} - ${f.titulo}`) : h('span', {}, f.titulo)))) : null,
      h('div', { class: 'guide-actions' },
        faltam.find((f) => f.id) ? h('a', { class: 'btn btn-cta btn-lg guide-primary', href: `#/j/${jid}/m/${faltam.find((f) => f.id).id}` }, 'Fazer o que falta', icon('arrow', { size: 18 }))
          : h('a', { class: 'btn btn-cta btn-lg guide-primary', href: `#/j/${jid}` }, 'Voltar ao mapa', icon('map', { size: 18 })))),
    prazos.length ? h('section', { class: 'panel' }, h('h2', { class: 'panel-title' }, icon('calendar', { size: 16 }), 'Datas oficiais que já importam'),
      h('ul', { class: 'deadline-list' }, prazos.map((p) => h('li', {}, h('strong', {}, fmtDate(p.data)), h('span', {}, ` ${p.titulo}`), p.fonteUrl ? h('a', { href: p.fonteUrl, target: '_blank', rel: 'noopener noreferrer', class: 'small' }, ' fonte oficial') : null))),
      h('p', { class: 'hint' }, 'Vá preparando os pré-requisitos para não perder a janela.')) : null,
    early.length ? h('section', { class: 'panel early' }, h('h2', { class: 'panel-title' }, icon('unlock', { size: 16 }), 'Já dá para adiantar'),
      h('ul', { class: 'early-list' }, early.map((m) => h('li', {}, h('a', { href: `#/j/${jid}/m/${m.id}` }, h('strong', {}, m.titulo), h('small', {}, m.status === 'bloqueada' ? 'Depois de outra missão' : m.trilha.titulo)))))) : null,
    round.ocultas ? h('p', { class: 'hint center' }, round.ocultas === 1 ? '1 missão desta rodada aparece quando ela for desbloqueada.' : `${round.ocultas} missões desta rodada aparecem quando ela for desbloqueada.`) : null);
}

export async function trailView(jid, n) {
  const j = await loadJourney(jid, { fresh: true });
  const round = j.rodadas.find((r) => r.numero === Number(n));
  if (!round) return emptyState('Rodada não encontrada', null, h('a', { class: 'btn', href: `#/j/${jid}` }, 'Voltar ao mapa'));
  if (!round.desbloqueada) return lockedRound(j, round);
  const next = j.proximaMissao;
  const currentId = next && next.rodada === round.numero ? next.id : round.missoes.find((m) => ['atencao', 'em-andamento', 'disponivel'].includes(m.status))?.id;
  const idx = j.rodadas.indexOf(round);
  const prev = j.rodadas[idx - 1];
  const after = j.rodadas[idx + 1];

  const cont = h('button', { class: 'btn btn-cta btn-lg', type: 'button' }, icon('play', { size: 16 }), 'Ir para o próximo passo');
  cont.addEventListener('click', () => {
    if (!next) return;
    if (next.rodada === round.numero) {
      const node = document.querySelector(`[data-mission="${next.id}"]`);
      node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      node?.classList.add('flash');
      setTimeout(() => go(`/j/${jid}/m/${next.id}`), 650);
    } else go(`/j/${jid}/m/${next.id}`);
  });

  const bar = h('span');
  bar.style.width = `${round.total ? Math.round((round.concluidas / round.total) * 100) : 0}%`;
  // Minimalista: título, uma linha de progresso e o caminho. Sem legenda, foto ou cartões extras.
  return h('div', { class: 'trail trail-min' },
    h('a', { class: 'tm-back', href: '#/' }, icon('back', { size: 14 }), 'Início'),
    h('header', { class: 'tm-head' },
      h('small', {}, round.sigla ? 'Trilha paralela' : `Rodada ${round.numero} de ${j.rodadas.filter((r) => !r.sigla).length}`),
      h('h1', {}, round.titulo),
      h('div', { class: 'tm-progress' }, h('div', { class: 'hm-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': round.total, 'aria-valuenow': round.concluidas, 'aria-label': 'Missões feitas' }, bar),
        h('span', {}, `${round.concluidas} de ${round.total} feitas`))),
    MissionPath(round, { journeyId: jid, currentId }),
    h('nav', { class: 'tm-nav', 'aria-label': 'Navegar entre rodadas' },
      prev ? h('a', { href: `#/j/${jid}/r/${prev.numero}` }, icon('back', { size: 13 }), `Rodada ${prev.numero}`) : h('span'),
      after ? h('a', { href: `#/j/${jid}/r/${after.numero}` }, after.desbloqueada ? null : icon('lock', { size: 13 }), after.sigla ? after.titulo : `Rodada ${after.numero}`, icon('arrow', { size: 13 })) : h('span')),
    h('div', { class: 'sticky-cta' },
      next ? h('span', { class: 'sticky-info' }, h('small', {}, 'Próximo passo'), h('strong', {}, next.titulo)) : h('span', { class: 'muted small' }, 'Nenhuma missão disponível agora.'),
      next ? cont : null),
  );
}
