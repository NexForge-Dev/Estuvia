// Tela 5 — Mentor IA em página completa.
import { h } from '../ui.js';
import { loadJourneys } from '../app.js';
import { AIJourneyAssistant } from '../components/AIJourneyAssistant.js';

export async function assistantPageView() {
  await loadJourneys().catch(() => []);
  return h('div', { class: 'assistant-page' }, AIJourneyAssistant({ compact: false }));
}
