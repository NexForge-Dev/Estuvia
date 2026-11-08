// Cabeçalho da jornada: destino, curso, datas, progresso geral, contagens e próxima missão.
import { h } from '../ui.js';
import { icon, ring } from '../icons.js';
import { pctLabel, fmtDate, deadlineTag, FoldPanel } from './common.js';
import { locale } from '../i18n.js';

export function JourneyProgress(j) {
  const d = j.destino;

  const hero = h('section', { class: 'journey-hero' },
    h('img', { class: 'jh-bg', src: d.universidade?.capa || '/img/cities/andaluzia.svg', alt: '' }),
    h('div', { class: 'jh-content' },
      h('div', { class: 'jh-main' },
        h('p', { class: 'eyebrow' }, 'Minha jornada'),
        h('h1', {}, d.origem, h('span', { class: 'jh-arrow' }, icon('arrow', { size: 26 })), d.universidade?.nome || 'Andaluzia'),
        h('p', { class: 'jh-course' }, d.programa?.nome || 'Mestrado a definir', d.programa?.demo ? h('span', { class: 'chip-demo' }, 'Dados demo') : null),
        h('ul', { class: 'jh-facts' },
          h('li', {}, icon('pin', { size: 15 }), `${d.cidade || '-'}, ${d.pais}`),
          h('li', {}, icon('calendar', { size: 15 }), d.anoAcademico ? `Ano acadêmico ${d.anoAcademico}` : 'Ano a definir'),
          h('li', {}, icon('cap', { size: 15 }), d.inicioAulas ? `Aulas a partir de ${fmtDate(d.inicioAulas)}` : 'Início das aulas: informe a data'),
        ),
      ),
      h('div', { class: 'jh-ring' },
        ring(j.progresso, { size: 132, stroke: 10, cls: 'ring-xl' }),
        h('div', { class: 'jh-ring-label' }, h('strong', {}, pctLabel(j.progresso)), h('span', {}, 'concluído')),
      ),
    ),
  );

  const next = j.proximaMissao
    ? h('a', { class: 'next-mission', href: `#/j/${j.id}/m/${j.proximaMissao.id}` },
        h('span', { class: 'nm-icon' }, icon('target', { size: 22 })),
        h('span', { class: 'nm-text' },
          h('small', {}, 'Continuar minha jornada'),
          h('strong', {}, `Missão ${j.proximaMissao.label} - ${j.proximaMissao.titulo}`),
          h('span', { class: 'muted small' }, j.proximaMissao.resumo)),
        h('span', { class: 'btn btn-cta' }, 'Continuar', icon('arrow', { size: 16 })))
    : h('div', { class: 'next-mission is-empty' }, icon('hourglass', { size: 22 }), h('span', {}, 'Nenhuma missão disponível agora: as restantes aguardam terceiros ou dependências.'));

  // Sem contadores de pendências: a jornada é revelada aos poucos; o foco é o próximo passo.
  return h('div', { class: 'stack' }, hero, next);
}

export function DeadlinesPanel(j) {
  const next = j.prazos.find((p) => p.diasRestantes >= 0);
  const hint = next ? (next.diasRestantes === 0 ? 'hoje' : `próximo em ${next.diasRestantes} dia${next.diasRestantes === 1 ? '' : 's'}`) : j.prazos.length ? `${j.prazos.length}` : 'nenhum';
  return FoldPanel({ id: 'prazos', title: 'Prazos importantes', ic: 'calendar', hint, cls: next && next.diasRestantes <= 14 ? 'is-hot' : '' },
    j.prazos.length
      ? h('ul', { class: 'deadlines' }, j.prazos.slice(0, 6).map((p) => h('li', {},
          h('div', {}, h('strong', {}, p.titulo), h('small', { class: 'muted' }, p.origem === 'oficial' ? 'Regra oficial' : p.origem === 'previsto' ? 'Previsão (data de chegada prevista)' : 'Declarado por você')),
          deadlineTag(p))))
      : h('p', { class: 'muted small' }, 'Nenhum prazo cadastrado. Registre os prazos oficiais da sua fase dentro das missões, a plataforma não inventa datas.'),
  );
}

export function FinancePanel(j) {
  const f = j.financas;
  const fmt = (v) => `€ ${Math.round(v).toLocaleString(locale())}`;
  const hint = !f.informouRecursos ? 'não informado' : f.diferenca !== null && f.diferenca < 0 ? `faltam ${fmt(-f.diferenca)}` : 'coberto';
  return FoldPanel({ id: 'financas', title: 'Situação financeira', ic: 'euro', hint },
    h('dl', { class: 'fin' },
      h('div', {}, h('dt', {}, 'Planejado'), h('dd', {}, fmt(f.planejado))),
      h('div', {}, h('dt', {}, 'Disponível'), h('dd', {}, f.informouRecursos ? fmt(f.disponivel) : 'Não informado')),
      f.diferenca !== null ? h('div', { class: f.diferenca < 0 ? 'neg' : 'pos' }, h('dt', {}, 'Diferença'), h('dd', {}, fmt(f.diferenca))) : null,
    ),
    h('p', { class: 'muted small' }, 'Estimativa baseada nos seus dados. A comprovação do visto é tratada à parte.'),
    h('a', { class: 'link-arrow', href: '#/financiamento' }, 'Abrir financiamento', icon('arrow', { size: 14 })),
  );
}

export function MilestonesPanel(j) {
  return FoldPanel({ id: 'marcos', title: 'Marcos da jornada', ic: 'trophy', hint: `${j.marcos.filter((m) => m.conquistado).length} de ${j.marcos.length}` },
    h('ol', { class: 'milestones' }, j.marcos.map((m) => h('li', { class: m.conquistado ? 'won' : '' },
      h('span', { class: 'ms-dot' }, icon(m.conquistado ? 'check' : m.icone, { size: 14 })),
      h('div', {}, h('strong', {}, m.titulo), h('small', { class: 'muted' }, m.conquistado ? `Conquistado em ${fmtDate(m.em)}` : `Ao concluir a missão ${m.missao}`)),
    ))),
  );
}
