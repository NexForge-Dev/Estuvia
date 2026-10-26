// Tela 1 — Minhas Jornadas.
import { h, toast } from '../ui.js';
import { api } from '../api.js';
import { state, loadJourneys, invalidate, rerender, emptyState } from '../app.js';
import { JourneyCard, NewJourneyCard } from '../components/JourneyCard.js';
import { icon } from '../icons.js';

export async function journeysView() {
  const journeys = await loadJourneys();
  const remove = async (j) => {
    try {
      await api.del(`/journeys/${j.id}`);
      invalidate();
      toast('Jornada excluída.', 'ok');
      rerender();
    } catch (e) { toast(e.message, 'err'); }
  };
  return h('div', { class: 'stack-lg' },
    h('header', { class: 'page-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Estuvia'), h('h1', {}, 'Minhas Jornadas'),
        h('p', { class: 'muted' }, 'Cada jornada é um destino com rodadas, missões e progresso próprios. Documentos, finanças e moradia são compartilhados entre elas.')),
      h('a', { class: 'btn btn-cta', href: '#/jornadas/nova' }, icon('sparkles', { size: 16 }), 'Nova jornada')),
    journeys.length
      ? h('div', { class: 'journey-grid' }, journeys.map((j) => JourneyCard(j, { onRemove: journeys.length > 0 ? remove : null })), NewJourneyCard({ disabled: journeys.length >= 6 }))
      : emptyState('Sua primeira jornada começa aqui', `${state.me.user.profile.apelido}, escolha um destino e um mestrado: a Estuvia monta as rodadas e missões para o seu perfil.`, h('a', { class: 'btn btn-cta btn-lg', href: '#/jornadas/nova' }, 'Criar minha jornada', icon('arrow', { size: 16 })), 'map'),
  );
}
