// Trilha vertical em zigue-zague: nós de missão alternados à esquerda/direita,
// conectados por linha pontilhada que fica sólida conforme o progresso.
import { h } from '../ui.js';
import { icon, ring, STATUS_ICON } from '../icons.js';

const ROW = 168;          // altura de cada "degrau" da trilha (px)
const TOP = 96;           // espaço do marcador de início
const NODE = 84;          // diâmetro do nó
const X = [26, 74];       // posições horizontais alternadas (% da largura)
const NS = 'http://www.w3.org/2000/svg';

const DONE = new Set(['concluida', 'nao-aplicavel', 'ignorada']);

export function MissionNode(m, { journeyId, current, index }) {
  const locked = m.status === 'bloqueada';
  const sub = locked
    ? (m.bloqueioExterno && m.bloqueadaPor.every((b) => b.externo) ? `Aguarda: ${m.bloqueadaPor.map((b) => b.titulo).join(', ')}` : `Libera após ${m.bloqueadaPor.filter((b) => !b.externo).map((b) => b.label || `Rodada ${b.rodada}`).join(', ')}`)
    : m.status === 'nao-aplicavel' ? 'Não se aplica a você'
      : m.status === 'ignorada' ? 'Pulada (opcional)'
      : m.status === 'concluida' ? 'Concluída'
        : m.status === 'em-andamento' ? `${m.objetivosFeitos}/${m.objetivosTotal} objetivos`
          : m.statusLabel;

  const glyph = m.status === 'em-andamento' || m.status === 'disponivel' || m.status === 'atencao'
    ? h('span', { class: 'mn-num' }, m.label)
    : icon(STATUS_ICON[m.status], { size: 30 });

  const node = h('a', {
    class: `mission-node n-${m.status} ${current ? 'is-current' : ''} ${m.prioridade === 'critica' ? 'is-critical' : ''}`,
    href: `#/j/${journeyId}/m/${m.id}`,
    'aria-label': `Missão ${m.label}: ${m.titulo} — ${m.statusLabel}${locked ? `, depende de ${m.bloqueadaPor.map((b) => b.label || b.titulo).join(', ')}. Toque para ver o que falta` : ''}`,
    dataset: { mission: m.id },
  },
    h('span', { class: 'mn-circle' },
      m.status === 'em-andamento' || m.status === 'atencao' ? ring(m.progresso, { size: NODE + 12, stroke: 5, cls: 'mn-ring' }) : null,
      glyph,
    ),
    current ? h('span', { class: 'mn-here' }, 'Você está aqui') : null,
    h('span', { class: 'mn-label' },
      h('small', {}, `Missão ${m.label}${m.opcional ? ' · opcional' : ''}${m.complexidade === 'simples' && !['concluida', 'nao-aplicavel', 'bloqueada'].includes(m.status) ? ' · rápida' : ''}${m.prioridade === 'critica' ? ' · crítica' : ''}`),
      h('strong', {}, m.titulo),
      h('span', { class: `mn-sub s-${m.status}` }, sub),
    ),
  );
  node.style.setProperty('--i', index);
  return node;
}

export function MissionPath(round, { journeyId, currentId }) {
  const missions = round.missoes;
  const height = TOP + missions.length * ROW + 120;
  const pos = (i) => ({ x: X[i % 2], y: TOP + i * ROW + NODE / 2 });

  // Linha: um segmento por par de nós (sólido se ambos concluídos/não aplicáveis).
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'path-line');
  svg.setAttribute('viewBox', `0 0 100 ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const seg = (a, b, done) => {
    const p = document.createElementNS(NS, 'path');
    const midY = (a.y + b.y) / 2;
    p.setAttribute('d', `M${a.x} ${a.y} C ${a.x} ${midY}, ${b.x} ${midY}, ${b.x} ${b.y}`);
    p.setAttribute('class', done ? 'seg seg-done' : 'seg seg-todo');
    p.setAttribute('vector-effect', 'non-scaling-stroke');
    p.setAttribute('fill', 'none');
    svg.append(p);
  };
  const start = { x: 50, y: 28 };
  const end = { x: 50, y: TOP + missions.length * ROW + 40 };
  seg(start, pos(0), DONE.has(missions[0]?.status));
  missions.forEach((m, i) => {
    const next = i + 1 < missions.length ? pos(i + 1) : end;
    const nextDone = i + 1 < missions.length ? DONE.has(missions[i + 1].status) : DONE.has(m.status);
    seg(pos(i), next, DONE.has(m.status) && nextDone);
  });

  const nodes = missions.map((m, i) => {
    const wrap = h('div', { class: `path-step ${i % 2 ? 'right' : 'left'}`, role: 'listitem' }, MissionNode(m, { journeyId, current: m.id === currentId, index: i }));
    wrap.style.left = `${pos(i).x}%`;
    wrap.style.top = `${TOP + i * ROW}px`;
    return wrap;
  });

  const allDone = missions.length && missions.every((m) => DONE.has(m.status));
  const startMark = h('div', { class: 'path-mark path-start' }, h('span', {}, icon('flag', { size: 16 }), round.sigla ? 'Início da trilha financeira' : `Início da Rodada ${round.numero}`));
  const endMark = h('div', { class: `path-mark path-end ${allDone ? 'is-done' : ''}` }, h('span', { class: 'pe-trophy' }, icon('trophy', { size: 22 })), h('span', {}, allDone ? 'Rodada concluída!' : 'Fim da rodada'));
  endMark.style.top = `${end.y - 24}px`;

  const el = h('div', { class: 'mission-path', role: 'list', 'aria-label': `Trilha de missões da rodada ${round.numero}` }, svg, startMark, ...nodes, endMark);
  el.style.height = `${height}px`;
  return el;
}
