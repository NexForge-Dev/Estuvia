// Trilha da rodada (zigue-zague) + botão fixo "Continuar minha jornada".
// Rodada bloqueada: só a prévia, o que falta para desbloquear e o que já dá para adiantar.
import { h, mount } from '../ui.js';
import { api } from '../api.js';
import { icon } from '../icons.js';
import { loadJourney, go, emptyState } from '../app.js';
import { MissionPath } from '../components/MissionPath.js';
import { progressBar, pctLabel, fmtDate } from '../components/common.js';

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
    round.ocultas ? h('p', { class: 'hint center' }, `${round.ocultas} missão(ões) desta rodada aparecem quando ela for desbloqueada.`) : null);
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

  const cont = h('button', { class: 'btn btn-cta btn-lg', type: 'button' }, icon('play', { size: 16 }), 'Continuar minha jornada');
  cont.addEventListener('click', () => {
    if (!next) return;
    if (next.rodada === round.numero) {
      const node = document.querySelector(`[data-mission="${next.id}"]`);
      node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      node?.classList.add('flash');
      setTimeout(() => go(`/j/${jid}/m/${next.id}`), 650);
    } else go(`/j/${jid}/m/${next.id}`);
  });

  // Documentos desta rodada (os mesmos da Carteira): necessários prontos e o que falta.
  const roundDocs = h('div');
  api.get(`/documents/rounds/${jid}/${round.numero}`).then((d) => {
    if (!d.total && !d.opcionais && !d.contingencia) return;
    const falta = d.faltam.slice(0, 3);
    mount(roundDocs, h('section', { class: 'trail-docs' },
      h('span', { class: 'trail-docs-ic' }, icon('folder', { size: 18 })),
      h('div', {},
        h('strong', {}, d.total ? `Documentos · ${d.prontos}/${d.total} prontos` : 'Documentos'),
        falta.length ? h('p', { class: 'small muted' }, 'Falta: ', falta.map((v, i) => [i ? ', ' : '', h('a', { href: `#/documentos/${v.id}` }, v.nome)]), d.faltam.length > 3 ? ` e mais ${d.faltam.length - 3}` : '') : d.total ? h('p', { class: 'small muted' }, 'Tudo pronto.') : null),
      h('a', { class: 'btn btn-ghost btn-sm', href: '#/documentos' }, 'Ver', icon('arrow', { size: 13 }))));
  }).catch(() => {});

  const legend = [['concluida', 'Concluída'], ['disponivel', 'Disponível'], ['em-andamento', 'Em andamento'], ['aguardando', 'Esperando resposta'], ['bloqueada', 'Bloqueada']];

  return h('div', { class: 'trail' },
    crumbs(j, round),
    h('header', { class: 'trail-head' },
      h('img', { src: round.banner, alt: '' }),
      h('div', { class: 'trail-head-content' },
        h('p', { class: 'eyebrow' }, round.sigla ? 'Trilha paralela' : `Rodada ${round.numero} · ${round.etapa}`),
        h('h1', {}, round.titulo),
        h('p', { class: 'muted' }, round.resumo),
        h('div', { class: 'trail-progress' }, progressBar(round.progresso, { cls: 'bar-lg', label: 'Progresso da rodada' }), h('strong', {}, pctLabel(round.progresso)), h('span', { class: 'muted small' }, `${round.concluidas} de ${round.total} missões`)))),
    roundDocs,
    h('div', { class: 'trail-legend' }, legend.map(([k, l]) => h('span', { class: `lg lg-${k}` }, h('i'), l))),
    MissionPath(round, { journeyId: jid, currentId }),
    h('nav', { class: 'row between trail-nav', 'aria-label': 'Navegar entre rodadas' },
      prev ? h('a', { class: 'btn btn-ghost', href: `#/j/${jid}/r/${prev.numero}` }, icon('back', { size: 14 }), prev.titulo) : h('span'),
      after ? h('a', { class: 'btn btn-ghost', href: `#/j/${jid}/r/${after.numero}` }, after.desbloqueada ? null : icon('lock', { size: 14 }), after.titulo, icon('arrow', { size: 14 })) : h('span')),
    h('div', { class: 'sticky-cta' },
      next ? h('span', { class: 'sticky-info' }, h('small', {}, 'Próximo passo'), h('strong', {}, `${next.label} - ${next.titulo}`)) : h('span', { class: 'muted small' }, 'Nenhuma missão disponível agora.'),
      next ? cont : null),
  );
}
