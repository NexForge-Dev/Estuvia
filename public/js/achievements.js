// Conquistas: tela "Minhas conquistas" e aviso de conquistas novas.
// O servidor decide o que foi conquistado (GET /api/achievements); aqui só exibimos.
import { h, toast } from './ui.js';
import { icon } from './icons.js';
import { api } from './api.js';

const LEVEL_LABEL = { bronze: 'Bronze', prata: 'Prata', ouro: 'Ouro' };
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');

// A CSP (style-src 'self') bloqueia o atributo style; a largura vai pelo CSSOM.
function bar(atual, meta, label, cls = '') {
  const fill = h('span');
  fill.style.width = `${(atual / meta) * 100}%`;
  return h('div', { class: `ach-progress ${cls}`, role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': meta, 'aria-valuenow': atual, 'aria-label': label }, fill);
}

function badge(a) {
  return h('li', { class: `ach-card lvl-${a.nivel} ${a.conquistada ? 'won' : 'locked'}` },
    h('span', { class: 'ach-medal', 'aria-hidden': 'true' }, icon(a.conquistada ? a.icone : 'lock', { size: 26 })),
    h('div', { class: 'ach-body' },
      h('strong', {}, a.titulo),
      h('p', { class: 'muted small' }, a.conquistada ? a.descricao : a.comoGanhar),
      a.progresso && !a.conquistada ? bar(a.progresso.atual, a.progresso.meta, `${a.progresso.atual} de ${a.progresso.meta}`) : null,
      h('small', { class: 'ach-meta' },
        `${LEVEL_LABEL[a.nivel]} · ${a.pontos} pts`,
        a.progresso && !a.conquistada ? ` · ${a.progresso.atual}/${a.progresso.meta}` : '',
        a.conquistada && a.em ? ` · Conquistada em ${fmtDate(a.em)}` : ''),
    ),
  );
}

export async function achievementsView() {
  const { conquistas, resumo, novas } = await api.get('/achievements');
  if (novas.length) announce(novas);
  const pct = Math.round((resumo.conquistadas / resumo.total) * 100);
  return h('div', { class: 'stack' },
    h('header', {},
      h('span', { class: 'eyebrow' }, 'Gamificação'),
      h('h1', {}, 'Minhas conquistas'),
      h('p', { class: 'muted' }, 'Cada etapa real da travessia vira uma conquista. Elas seguem os seus registros: se você desfizer uma missão ou corrigir uma situação, a conquista volta a ficar pendente.'),
    ),
    h('section', { class: 'panel ach-summary' },
      h('div', {}, h('strong', { class: 'ach-big' }, `${resumo.conquistadas}/${resumo.total}`), h('small', { class: 'muted' }, 'conquistas')),
      h('div', {}, h('strong', { class: 'ach-big' }, resumo.pontos), h('small', { class: 'muted' }, `de ${resumo.pontosPossiveis} pontos`)),
      bar(pct, 100, `${pct}% das conquistas`, 'wide'),
    ),
    resumo.categorias.map((c) => {
      const items = conquistas.filter((a) => a.categoria === c.id);
      return h('section', { class: 'stack' },
        h('h2', {}, c.label, h('small', { class: 'muted' }, `  ${items.filter((a) => a.conquistada).length}/${items.length}`)),
        h('ul', { class: 'ach-grid' }, items.map(badge)),
      );
    }),
  );
}

// Busca conquistas novas e celebra. Chame depois de ações que mudam a jornada.
export async function checkAchievements() {
  try {
    const { novas } = await api.get('/achievements');
    if (novas.length) announce(novas);
  } catch { /* conquistas nunca podem quebrar a tela */ }
}

let announcing = false;
function announce(novas) {
  if (announcing) return;
  announcing = true;
  novas.forEach((a) => toast(`🏆 Conquista desbloqueada: ${a.titulo}`, 'ok'));
  api.post('/achievements/seen', { ids: novas.map((a) => a.id) }).catch(() => {}).finally(() => { announcing = false; });
}
