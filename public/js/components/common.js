// Componentes visuais reutilizáveis da jornada + feedback de conquistas.
import { h, toast } from '../ui.js';
import { icon, ring, STATUS_ICON } from '../icons.js';

export const pct = (v) => `${Math.round((v || 0) * 100)}%`;
// Rótulo com até 1 casa decimal no padrão brasileiro (ex.: "37,5%").
export const pctLabel = (v) => `${(Math.round((v || 0) * 1000) / 10).toLocaleString('pt-BR')}%`;

export function progressBar(value, { label, cls = '' } = {}) {
  const fill = h('span', { class: 'bar-fill' });
  fill.style.width = pct(value);
  return h('div', { class: `bar ${cls}`, role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(value * 100), 'aria-label': label || 'Progresso' }, fill);
}

export function statusChip(status, label) {
  return h('span', { class: `chip-status st-${status}` }, icon(STATUS_ICON[status], { size: 13 }), label);
}

export const PRIORITY = { critica: 'Prioridade crítica', alta: 'Prioridade alta', media: 'Prioridade normal', baixa: 'Prioridade baixa' };

export function priorityTag(p) {
  return h('span', { class: `prio prio-${p}` }, h('i', { 'aria-hidden': 'true' }), PRIORITY[p]);
}

export const fmtDate = (iso) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

export function deadlineTag(prazo) {
  if (!prazo) return null;
  const late = prazo.diasRestantes < 0;
  const soon = !late && prazo.diasRestantes <= 14;
  const origem = { declarado: 'declarado por você', oficial: 'regra oficial', previsto: 'previsão' }[prazo.origem] || '';
  return h('span', { class: `deadline ${late ? 'late' : soon ? 'soon' : ''}`, title: origem },
    icon('calendar', { size: 13 }), late ? `Venceu ${fmtDate(prazo.data)}` : `${fmtDate(prazo.data)} · ${prazo.diasRestantes}d`);
}

export function roundRing(round, size = 64) {
  return h('span', { class: `node-ring st-${round.status}` },
    ring(round.progresso, { size, stroke: 5 }),
    h('span', { class: 'node-glyph' }, icon(round.status === 'concluida' ? 'check' : round.status === 'bloqueada' ? 'lock' : round.icone, { size: Math.round(size * 0.36) })),
  );
}

// ---------- Feedback de eventos vindos do servidor ----------
// O servidor decide o que foi concluído e desbloqueado; aqui só comunicamos visualmente.

const roundName = (r) => (r.sigla ? `Trilha ${r.sigla} — ${r.titulo}` : `Rodada ${r.numero} — ${r.titulo}`);

export function showEvents(events = []) {
  const roundDone = events.find((e) => e.tipo === 'rodada-concluida');
  const roundOpen = events.find((e) => e.tipo === 'rodada-desbloqueada');
  const milestones = events.filter((e) => e.tipo === 'marco');
  const unlocked = events.find((e) => e.tipo === 'desbloqueio');
  const done = events.find((e) => e.tipo === 'missao-concluida');
  const jid = events.find((e) => e.journeyId)?.journeyId;

  if (roundDone || roundOpen) roundModal({ jid, roundDone, roundOpen, milestones });
  else if (done) missionModal({ jid, done, unlocked, milestones });
  else if (milestones.length) roundModal({ jid, milestones });
  else if (unlocked) {
    const names = unlocked.missoes.slice(0, 2).map((m) => `${m.label || m.id} ${m.titulo}`).join(', ');
    toast(`Desbloqueado: ${names}${unlocked.missoes.length > 2 ? ` e mais ${unlocked.missoes.length - 2}` : ''}`, 'info');
  }
  import('../app.js').then((m) => m.checkAchievements()).catch(() => {});
}

function dialog(label, cls, children, focusSel) {
  const close = () => { overlay.classList.add('out'); setTimeout(() => overlay.remove(), 250); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const card = h('div', { class: `celebrate-card ${cls}` }, ...children(close));
  const overlay = h('div', { class: 'celebrate', role: 'dialog', 'aria-modal': 'true', 'aria-label': label }, card);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  (card.querySelector(focusSel) || card.querySelector('button, a'))?.focus();
  return { overlay, card, close };
}

const link = (href, label, cls, close, ic) => h('a', { class: `btn ${cls}`, href, onClick: close }, ic ? icon(ic, { size: 16 }) : null, label);

// "MISSÃO CONCLUÍDA!" — discreto: selo, resultado, barra da rodada atualizando e o próximo desafio.
function missionModal({ jid, done, unlocked, milestones }) {
  const next = unlocked?.missoes.find((m) => m.rodada === done.rodada) || unlocked?.missoes[0] || null;
  const fill = h('span', { class: 'bar-fill' });
  const { card } = dialog('Missão concluída', 'is-mission', (close) => [
    h('span', { class: 'celebrate-badge pop' }, icon('check', { size: 32 })),
    h('p', { class: 'eyebrow' }, 'Missão concluída!'),
    h('h2', {}, `${done.label} — ${done.titulo}`),
    done.resultado ? h('p', { class: 'muted' }, done.resultado) : null,
    done.progressoRodada !== null && done.progressoRodada !== undefined
      ? h('div', { class: 'celebrate-progress' }, h('div', { class: 'bar' }, fill), h('small', { class: 'muted' }, `Rodada ${done.rodada}: ${pctLabel(done.progressoRodada)}`))
      : null,
    milestones.length ? h('p', { class: 'celebrate-milestone' }, icon(milestones[0].icone || 'trophy', { size: 16 }), `Marco conquistado: ${milestones.map((m) => m.titulo).join(' · ')}`) : null,
    next
      ? h('div', { class: 'unlock-next' }, h('span', { class: 'unlock-ic' }, icon('unlock', { size: 18 })), h('div', {}, h('small', {}, 'Próximo desafio desbloqueado'), h('strong', {}, `${next.label} — ${next.titulo}`)))
      : null,
    h('div', { class: 'row wrap center' },
      next && jid ? link(`#/j/${jid}/m/${next.id}`, 'Continuar', 'btn-cta', close, 'arrow') : h('button', { class: 'btn btn-cta', type: 'button', onClick: close }, 'Continuar'),
      next && jid ? h('button', { class: 'btn btn-ghost', type: 'button', onClick: close }, 'Ficar nesta missão') : null),
  ]);
  requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = pct(done.progressoRodada); }));
  if (milestones.length && !matchMedia('(prefers-reduced-motion: reduce)').matches) sparks(card);
}

// "RODADA N CONCLUÍDA!" + "Nova rodada desbloqueada" — o marco mais destacado da jornada.
function roundModal({ jid, roundDone, roundOpen, milestones = [] }) {
  const { card } = dialog('Rodada concluída', 'is-round', (close) => [
    h('span', { class: 'celebrate-badge pop' }, icon(roundDone ? 'trophy' : milestones[0]?.icone || 'unlock', { size: 34 })),
    h('p', { class: 'eyebrow' }, roundDone ? (roundDone.sigla ? 'Trilha concluída!' : `Rodada ${roundDone.numero} concluída!`) : roundOpen ? 'Nova etapa desbloqueada!' : 'Marco conquistado!'),
    h('h2', {}, roundDone ? roundDone.conclusao || roundDone.titulo : roundOpen ? roundName(roundOpen) : milestones[0]?.titulo),
    milestones.length && (roundDone || roundOpen) ? h('p', { class: 'celebrate-milestone' }, icon(milestones[0].icone || 'trophy', { size: 16 }), `Marco: ${milestones.map((m) => m.titulo).join(' · ')}`) : null,
    roundOpen && roundDone
      ? h('div', { class: 'unlock-round' },
          roundOpen.banner ? h('img', { src: roundOpen.banner, alt: '' }) : null,
          h('div', {}, h('small', {}, 'Nova rodada desbloqueada'), h('strong', {}, roundName(roundOpen).toUpperCase()), roundOpen.etapa ? h('span', { class: 'muted small' }, roundOpen.etapa) : null))
      : roundOpen && roundOpen.etapa ? h('p', { class: 'muted' }, roundOpen.etapa) : null,
    roundOpen ? h('p', { class: 'small muted' }, 'A Agenda AI já pode incluir as novas missões no seu planejamento.') : h('p', { class: 'muted small' }, 'Registrado no seu histórico de marcos.'),
    h('div', { class: 'row wrap center' },
      roundOpen && jid ? link(`#/j/${jid}/r/${roundOpen.numero}`, 'Continuar', 'btn-cta', close, 'arrow') : h('button', { class: 'btn btn-cta', type: 'button', onClick: close }, 'Continuar jornada'),
      roundOpen ? link('#/agenda#organizar', 'Organizar na Agenda AI', 'btn-ghost', close, 'sparkles') : null),
  ]);
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) sparks(card);
}

function sparks(card) {
  const layer = h('div', { class: 'sparks', 'aria-hidden': 'true' });
  for (let i = 0; i < 18; i++) {
    const s = h('i');
    s.style.setProperty('--a', `${(360 / 18) * i}deg`);
    s.style.setProperty('--d', `${90 + Math.random() * 70}px`);
    layer.append(s);
  }
  card.append(layer);
}
