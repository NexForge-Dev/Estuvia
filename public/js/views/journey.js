// Minha Jornada — mapa de progressão: a jornada completa em visão geral, com a execução
// liberada aos poucos. Rodada atual em destaque, próxima com cadeado e o que falta, futuras simplificadas.
// Trilhas paralelas (finanças, preparação do visto…) ficam sempre à mão.
import { h, toast } from '../ui.js';
import { api } from '../api.js';
import { state, loadJourney, cacheJourney, rerender } from '../app.js';
import { icon } from '../icons.js';
import { RoundCard } from '../components/RoundCard.js';
import { JourneyProgress, DeadlinesPanel, FinancePanel, MilestonesPanel } from '../components/JourneyProgress.js';
import { ArrivalForm } from '../components/MissionGuide.js';
import { showEvents, FoldPanel } from '../components/common.js';

const SITU_LABEL = { adjudicacao: 'Resultado da candidatura', matricula: 'Matrícula', visto: 'Visto' };

const applyResult = (r) => { cacheJourney(r.journey); showEvents(r.events || []); rerender(); };

// Painel "Situação": registra decisões externas (admissão, matrícula, visto) — não é progresso do estudante.
export function SituationPanel(j, { onSaved } = {}) {
  const opts = state.content.situacao;
  const atual = Object.keys(opts).map((c) => opts[c].find(([v]) => v === j.situacao[c])?.[1]).filter(Boolean);
  return FoldPanel({ id: 'situacao', title: 'O que já aconteceu?', ic: 'globe', hint: atual[0] || null, cls: 'situation' },
    h('p', { class: 'muted small' }, 'Registre as respostas da universidade e do consulado. A Estuvia não consulta os sistemas oficiais.'),
    h('div', { class: 'situ-grid' }, Object.keys(opts).map((campo) => {
      const sel = h('select', { 'aria-label': SITU_LABEL[campo] }, opts[campo].map(([v, l]) => h('option', { value: v, selected: v === j.situacao[campo] }, l)));
      sel.addEventListener('change', async () => {
        try {
          const r = await api.put(`/journeys/${j.id}/situacao`, { campo, valor: sel.value });
          cacheJourney(r.journey);
          showEvents(r.events);
          const urgent = r.events.find((e) => e.tipo === 'urgente');
          if (urgent) toast(`Ações urgentes: ${urgent.missoes.map((x) => x.label).join(', ')}. Vale replanejar a Agenda.`, 'info');
          else if (!r.events.some((e) => e.tipo === 'rodada-desbloqueada')) toast('Situação registrada.', 'ok');
          onSaved ? onSaved(r.journey) : rerender();
        } catch (e) { toast(e.message, 'err'); }
      });
      return h('label', { class: 'field' }, h('span', { class: 'field-label' }, SITU_LABEL[campo]), sel);
    })),
  );
}

// "Já avancei fora da Estuvia": registra etapas anteriores com confirmação (nunca apaga nada).
export function PriorProgressForm(journeyId, etapas, { onDone, compact = false } = {}) {
  const sel = h('select', { class: 'guide-input', 'aria-label': 'Em qual etapa você está?' }, etapas.map((e) => h('option', { value: e.id }, e.rotulo)));
  const date = h('input', { type: 'date', class: 'guide-input', max: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date()), 'aria-label': 'Data de entrada na Espanha' });
  const dateField = h('label', { class: 'field', hidden: true }, h('span', { class: 'field-label' }, 'Quando você entrou na Espanha?'), date);
  const chk = h('input', { type: 'checkbox' });
  sel.addEventListener('change', () => { dateField.hidden = !etapas.find((e) => e.id === sel.value)?.exigeDataEntrada; });
  const btn = h('button', { type: 'button', class: 'btn btn-cta', onClick: async () => {
    if (sel.value === 'inicio') return onDone?.(null);
    if (!chk.checked) return toast('Confirme que essas etapas já foram feitas.', 'err');
    try { onDone?.(await api.post(`/journeys/${journeyId}/prior-progress`, { etapa: sel.value, confirmo: true, ...(dateField.hidden ? {} : { dataEntrada: date.value }) })); } catch (e) { toast(e.message, 'err'); }
  } }, icon('check', { size: 16 }), compact ? 'Registrar' : 'Registrar meu progresso');
  return h('div', { class: 'stack' },
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Em qual etapa você está?'), sel),
    dateField,
    h('label', { class: 'check' }, chk, h('span', {}, 'Confirmo que já fiz essas etapas fora da Estuvia.')),
    h('p', { class: 'hint' }, 'As missões anteriores ficam marcadas como "declaradas por você". Você pode reabrir qualquer uma depois.'),
    btn);
}

export async function journeyView(jid) {
  const j = await loadJourney(jid, { fresh: true });
  const main = j.rodadas.filter((r) => !r.transversal);
  const fin = j.rodadas.find((r) => r.transversal);
  const nextLocked = main.find((r) => !r.desbloqueada);
  const r7 = main.find((r) => r.numero === 7);
  const vistoOk = j.situacao.visto === 'aprovado' || main.find((r) => r.numero === 5)?.missoes.find((m) => m.id === '5.9')?.status === 'concluida';

  // Trilhas paralelas abertas em rodadas ainda bloqueadas: "pode adiantar agora".
  const early = main.filter((r) => !r.desbloqueada).flatMap((r) => r.missoes.filter((m) => m.trilha && ['disponivel', 'em-andamento', 'atencao'].includes(m.status)));

  const prior = h('div');
  const priorPanel = h('details', { class: 'panel guide-more' }, h('summary', {}, icon('flag', { size: 14 }), ' Já avancei fora da Estuvia'), prior);
  priorPanel.addEventListener('toggle', async () => {
    if (!priorPanel.open || prior.childElementCount) return;
    const { etapas } = await api.get('/journeys/progress-stages');
    prior.append(PriorProgressForm(j.id, etapas, { onDone: (r) => (r ? applyResult(r) : (priorPanel.open = false)) }));
  });

  return h('div', { class: 'stack-lg' },
    h('nav', { class: 'crumbs', 'aria-label': 'Navegação' }, h('a', { href: '#/jornadas' }, 'Minhas Jornadas'), icon('chevron', { size: 12, cls: 'crumb-sep' }), h('span', { 'aria-current': 'page' }, j.destino.universidade?.sigla || 'Jornada')),
    JourneyProgress(j),
    h('div', { class: 'layout-2' },
      h('div', { class: 'stack-lg' },
        h('section', {},
          h('div', { class: 'section-head' }, h('h2', {}, 'Mapa da jornada'), h('span', { class: 'muted small' }, `${main.filter((r) => r.status === 'concluida').length} de ${main.length} rodadas concluídas`)),
          h('div', { class: 'round-map' }, main.map((r) => RoundCard(r, { journeyId: j.id, atual: r.numero === j.rodadaAtual && r.desbloqueada, proxima: r === nextLocked })))),
        h('section', {},
          h('div', { class: 'section-head' }, h('h2', {}, 'Trilhas paralelas'), h('span', { class: 'muted small' }, 'Começam cedo para você não perder prazos nem dinheiro')),
          h('div', { class: 'round-grid one' }, fin ? RoundCard(fin, { journeyId: j.id, atual: false }) : null),
          early.length ? h('div', { class: 'panel early' },
            h('h3', { class: 'panel-title' }, icon('unlock', { size: 16 }), 'Pode adiantar agora'),
            h('ul', { class: 'early-list' }, early.slice(0, 6).map((m) => h('li', {}, h('a', { href: `#/j/${j.id}/m/${m.id}` }, h('strong', {}, m.titulo), h('small', {}, m.trilha.titulo)))))) : null)),
      h('aside', { class: 'stack' },
        r7 && !r7.desbloqueada && vistoOk ? h('section', { class: 'panel' }, h('h2', { class: 'panel-title' }, icon('plane', { size: 18 }), 'Já chegou à Espanha?'), ArrivalForm(j, applyResult)) : null,
        DeadlinesPanel(j), FinancePanel(j), SituationPanel(j), priorPanel, MilestonesPanel(j))),
  );
}
