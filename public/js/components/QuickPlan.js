// "Organizar com IA" em 2 toques: quando você tem tempo livre? → proposta visual → usar este planejamento.
// Sem configurações avançadas para começar; ajustes finos continuam na Agenda.
import { h, mount, toast } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { defaultWeek } from './WeeklyPlanner.js';

const SLOTS = [
  { id: 'manha', rotulo: 'Manhãs', ic: 'sun', dias: [1, 2, 3, 4, 5], janela: { inicio: '08:00', fim: '10:00' } },
  { id: 'tarde', rotulo: 'Tardes', ic: 'clock', dias: [1, 2, 3, 4, 5], janela: { inicio: '14:00', fim: '16:00' } },
  { id: 'noite', rotulo: 'Noites', ic: 'moon', dias: [1, 2, 3, 4, 5], janela: { inicio: '19:00', fim: '21:00' } },
  { id: 'fds', rotulo: 'Fins de semana', ic: 'calendar', dias: [6, 7], janela: { inicio: '10:00', fim: '13:00' } },
];
const weekday = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long' });

export function QuickPlan({ journeyId, missaoId, onDone } = {}) {
  const host = h('div', { class: 'quick-plan' });
  const ask = () => mount(host,
    h('p', { class: 'qp-q' }, 'Quando você costuma ter tempo livre?'),
    h('div', { class: 'choice-grid' }, SLOTS.map((s) => h('button', { type: 'button', class: 'choice', onClick: () => propose(s) }, icon(s.ic, { size: 20 }), h('span', {}, s.rotulo)))));

  async function propose(slot) {
    mount(host, h('p', { class: 'muted' }, icon('calendar', { size: 14 }), ' Montando sua semana…'));
    try {
      await api.put('/planner/availability', { dias: slot.dias, janelas: [slot.janela], horasSemanais: 4, preferencia: 'curtas', fuso: 'America/Sao_Paulo' });
      const p = await api.post('/planner/suggest', { semana: defaultWeek(), ...(journeyId ? { journeyId } : {}), ...(missaoId ? { missaoId } : {}) });
      const items = p.proposta.filter((x) => x.missaoId || x.bolsaId);
      if (!items.length) {
        return mount(host, h('p', {}, 'Não encontrei tarefas liberadas para esta semana nesse horário.'),
          h('div', { class: 'row wrap' }, h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: ask }, 'Escolher outro horário'), h('a', { class: 'btn btn-ghost btn-sm', href: '#/agenda' }, 'Abrir Agenda')));
      }
      mount(host,
        h('p', { class: 'qp-q' }, 'Sua semana ficaria assim:'),
        h('ul', { class: 'qp-list' }, items.map((x) => h('li', {}, h('strong', {}, weekday(x.data)), h('span', {}, `${x.inicio} · ${x.titulo.replace(/^Missão [\d.]+:? /, '')}`)))),
        h('div', { class: 'row wrap' },
          h('button', { type: 'button', class: 'btn btn-cta', onClick: () => approve(items) }, icon('check', { size: 16 }), 'Usar este planejamento'),
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: ask }, 'Mudar horário'),
          h('a', { class: 'link-arrow small', href: '#/agenda' }, 'Editar na Agenda')));
    } catch (e) { toast(e.message, 'err'); ask(); }
  }

  async function approve(items) {
    try {
      await api.post('/planner/approve', { itens: items.map(({ prioridadeLabel, ...x }) => Object.fromEntries(Object.entries(x).filter(([, v]) => v != null))) });
      mount(host, h('p', { class: 'ok-line' }, icon('check', { size: 16 }), ' Pronto! Está na sua Agenda.'), h('a', { class: 'link-arrow small', href: '#/agenda' }, 'Ver minha semana', icon('arrow', { size: 12 })));
      onDone?.();
    } catch (e) { toast(e.message, 'err'); }
  }

  ask();
  return host;
}
