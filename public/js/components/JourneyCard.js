// Card de uma jornada em "Minhas Jornadas": capa, destino, curso, ano, status, progresso e CTA.
import { h } from '../ui.js';
import { icon } from '../icons.js';
import { progressBar, pctLabel } from './common.js';

const STATUS = {
  'nao-iniciada': ['Não iniciada', 'st-disponivel'],
  'em-andamento': ['Em andamento', 'st-em-andamento'],
  concluida: ['Concluída', 'st-concluida'],
};

export function JourneyCard(j, { onRemove } = {}) {
  const d = j.destino;
  const [label, cls] = STATUS[j.status] || STATUS['nao-iniciada'];
  const cover = h('img', { class: 'jc-cover', src: d.universidade?.capa || '/img/cities/andaluzia.svg', alt: '', loading: 'lazy' });

  let confirming = false;
  const remove = h('button', { class: 'jc-remove', type: 'button', title: 'Excluir jornada', 'aria-label': 'Excluir jornada' }, icon('x', { size: 16 }));
  remove.addEventListener('click', (e) => {
    e.preventDefault();
    if (!confirming) {
      confirming = true;
      remove.classList.add('confirm');
      remove.replaceChildren('Excluir? Clique de novo');
      setTimeout(() => { confirming = false; remove.classList.remove('confirm'); remove.replaceChildren(icon('x', { size: 16 })); }, 3500);
      return;
    }
    onRemove?.(j);
  });

  return h('article', { class: 'journey-card' },
    h('div', { class: 'jc-media' },
      cover,
      h('div', { class: 'jc-media-top' },
        h('span', { class: `chip-status ${cls}` }, label),
        d.programa?.demo ? h('span', { class: 'chip-demo' }, 'Dados demo') : null,
      ),
      d.universidade?.logo ? h('span', { class: `jc-logo-badge jc-logo-${d.universidade.id}` }, h('img', { src: d.universidade.logo, alt: '', loading: 'lazy' })) : null,
      h('div', { class: 'jc-route' }, h('span', {}, d.origem), icon('arrow', { size: 14 }), h('span', {}, d.cidade || 'Andaluzia')),
      onRemove ? remove : null,
    ),
    h('div', { class: 'jc-body' },
      h('h3', {}, d.universidade?.nome || 'Universidade a definir'),
      h('p', { class: 'jc-place' }, icon('pin', { size: 14 }), `${d.cidade || '-'}, ${d.pais}`),
      h('p', { class: 'jc-course' }, d.programa?.nome || 'Mestrado a definir'),
      h('dl', { class: 'jc-meta' },
        h('div', {}, h('dt', {}, 'Ano acadêmico'), h('dd', {}, d.anoAcademico || '-')),
        h('div', {}, h('dt', {}, 'Rodada atual'), h('dd', {}, `${j.rodadaAtual.numero} · ${j.rodadaAtual.titulo}`)),
      ),
      h('div', { class: 'jc-progress' },
        h('div', { class: 'row between' }, h('span', { class: 'muted small' }, `${j.contagem.concluida} de ${j.contagem.aplicaveis} missões`), h('strong', {}, pctLabel(j.progresso))),
        progressBar(j.progresso, { label: 'Progresso da jornada', cls: 'bar-lg' }),
      ),
      h('a', { class: 'btn btn-cta btn-block', href: `#/j/${j.id}` }, 'Acessar Rodadas', icon('arrow', { size: 16 })),
    ),
  );
}

export function NewJourneyCard({ disabled } = {}) {
  return h(disabled ? 'div' : 'a', { class: `journey-card journey-new ${disabled ? 'is-disabled' : ''}`, href: disabled ? null : '#/jornadas/nova' },
    h('span', { class: 'jn-plus' }, icon('compass', { size: 28 })),
    h('h3', {}, 'Nova jornada'),
    h('p', { class: 'muted' }, disabled ? 'Você atingiu o limite de jornadas.' : 'Planeje outro destino: cada jornada tem rodadas, missões e progresso próprios.'),
  );
}
