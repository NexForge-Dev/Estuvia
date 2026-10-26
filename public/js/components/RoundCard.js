// Card de rodada no mapa de progressão: concluída (selo), atual (destaque + resumo),
// próxima bloqueada (cadeado + o que falta + prévia) e futuras (visão simplificada).
// O botão "Continuar" fica uma vez só, no topo da jornada.
import { h } from '../ui.js';
import { icon } from '../icons.js';
import { progressBar, pctLabel } from './common.js';

export function RoundCard(round, { journeyId, atual, proxima = false }) {
  const href = `#/j/${journeyId}/r/${round.numero}`;
  const name = round.sigla ? 'Trilha' : 'Rodada';

  if (!round.desbloqueada) {
    const faltam = round.desbloqueio?.faltam || [];
    return h('a', { class: `round-card is-locked ${proxima ? 'is-next' : 'is-future'}`, href },
      h('div', { class: 'rc-banner' },
        h('img', { src: round.banner, alt: '', loading: 'lazy' }),
        h('span', { class: 'rc-number' }, h('small', {}, name), round.sigla || String(round.numero)),
        h('span', { class: 'rc-lock', 'aria-hidden': 'true' }, icon('lock', { size: proxima ? 28 : 20 }))),
      h('div', { class: 'rc-body' },
        h('p', { class: 'eyebrow' }, proxima ? 'Próxima etapa · bloqueada' : 'Bloqueada'),
        h('h3', {}, round.titulo),
        proxima ? h('p', { class: 'rc-preview' }, round.resumo) : null,
        proxima
          ? h('div', { class: 'rc-unlock' }, h('small', {}, 'Para desbloquear:'),
              faltam.length ? h('ul', {}, faltam.slice(0, 3).map((f) => h('li', {}, icon('target', { size: 12 }), f.label ? `${f.label} ${f.titulo}` : f.titulo))) : h('p', { class: 'small' }, round.desbloqueio?.texto))
          : null,
        round.paralelasAbertas ? h('p', { class: 'rc-flags' }, h('span', { class: 'flag flag-info' }, icon('unlock', { size: 13 }), `${round.paralelasAbertas} para adiantar`)) : null));
  }

  const done = round.status === 'concluida';
  return h('a', { class: `round-card ${atual ? 'is-current' : ''} ${done ? 'is-done' : ''}`, href },
    h('div', { class: 'rc-banner' },
      h('img', { src: round.banner, alt: '', loading: 'lazy' }),
      h('span', { class: 'rc-number' }, h('small', {}, name), round.sigla || String(round.numero)),
      done ? h('span', { class: 'rc-seal' }, icon('check', { size: 16 }), 'Concluída')
        : atual ? h('span', { class: 'chip-status st-atual' }, 'Você está aqui') : null),
    h('div', { class: 'rc-body' },
      h('p', { class: 'eyebrow' }, round.etapa),
      h('h3', {}, round.titulo),
      atual ? h('p', { class: 'rc-preview' }, round.resumo) : null,
      h('p', { class: 'rc-missions' }, h('strong', {}, `${round.concluidas} de ${round.total}`), ' missões concluídas'),
      h('div', { class: 'rc-progress' }, progressBar(round.progresso, { label: `Progresso da rodada ${round.numero}` }), h('span', { class: 'rc-pct' }, pctLabel(round.progresso))),
      round.atencao || round.aguardando
        ? h('p', { class: 'rc-flags' },
            round.atencao ? h('span', { class: 'flag flag-warn' }, icon('alert', { size: 13 }), `${round.atencao} com atenção`) : null,
            round.aguardando ? h('span', { class: 'flag flag-wait' }, icon('hourglass', { size: 13 }), `${round.aguardando} aguardando`) : null)
        : null,
      done ? h('span', { class: 'rc-review' }, 'Rever conteúdo', icon('arrow', { size: 12 })) : null));
}
