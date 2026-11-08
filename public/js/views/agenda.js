// Tela 6 — Agenda (planejamento semanal inteligente).
import { h } from '../ui.js';
import { icon } from '../icons.js';
import { currentAnchor } from '../app.js';
import { WeeklyPlanner } from '../components/WeeklyPlanner.js';

export function agendaView() {
  return h('div', { class: 'stack-lg' },
    h('header', { class: 'page-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Planejamento da semana'), h('h1', {}, icon('calendar', { size: 26 }), ' Agenda'),
        h('p', { class: 'muted' }, 'Suas missões, prazos e compromissos numa semana organizada. A Agenda sugere e replaneja; você aprova e edita.'))),
    WeeklyPlanner({ autoOrganize: currentAnchor() === 'organizar' }),
  );
}
