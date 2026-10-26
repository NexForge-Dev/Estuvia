// Card visual de um documento: ícone, nome, descrição curta, status, prioridade e UMA ação.
import { h } from '../../ui.js';
import { icon } from '../../icons.js';
import { StatusPill, Evidence, cardAction } from './shared.js';

/** v = visão do documento (document-engine docView). opts: { onOpen, prioridade, compact } */
export function DocumentCard(v, { onOpen, prioridade = false, compact = false, destaque = false } = {}) {
  const tone = v.atencao ? 'warn' : v.status === 'nao-se-aplica' ? 'faint' : v.pronto ? 'ok' : v.status === 'em-preparacao' ? 'info' : 'muted';
  const tag = v.atencao ? null
    : v.maisAdiante && !v.antecedencia ? h('span', { class: 'dc-tag' }, 'Mais adiante')
    : prioridade && v.exigencia === 'requerido' && !v.resolvido ? h('span', { class: 'dc-tag is-hot' }, 'Prioridade')
      : v.exigencia === 'condicional' && !v.resolvido ? h('span', { class: 'dc-tag' }, 'Conforme o caso')
        : v.exigencia === 'verificar' && !v.resolvido ? h('span', { class: 'dc-tag' }, 'A confirmar') : null;
  const open = () => onOpen?.(v.id);
  const card = h('article', { class: `dc-card t-${tone}${destaque ? ' is-next' : ''}${compact ? ' is-compact' : ''}${v.status === 'nao-se-aplica' ? ' is-na' : ''}`, dataset: { doc: v.id } },
    h('div', { class: 'dc-card-top' },
      h('span', { class: 'dc-icon' }, icon(v.icone || 'file', { size: compact ? 18 : 22 }), v.pronto && !v.atencao ? h('span', { class: 'dc-icon-ok' }, icon('check', { size: 10 })) : null),
      h('div', { class: 'dc-card-head' },
        h('h3', {}, v.nome.replace(/ \(se o programa exigir\)$/, '')),
        h('div', { class: 'dc-card-meta' }, StatusPill(v), tag))),
    compact ? null : h('p', { class: 'dc-desc' }, v.status === 'nao-se-aplica' && v.motivo ? v.motivo : v.alerta || v.descricao),
    h('div', { class: 'dc-card-foot' },
      Evidence(v),
      h('button', { type: 'button', class: `dc-action${destaque ? ' is-primary' : ''}`, onClick: (e) => { e.stopPropagation(); open(); } },
        cardAction(v), icon('arrow', { size: 14 }))));
  card.addEventListener('click', open);
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `${v.nome}: ${v.statusLabel}`);
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  return card;
}
