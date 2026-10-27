// Agenda — calendário com visão de semana e de dia (padrão no celular), linha da hora atual,
// clicar-e-arrastar para criar, arrastar para reagendar, puxar a borda para mudar a duração,
// filtros por categoria, proposta automática (aprovar/editar) e replanejamento. Nunca conclui missões.
import { h, mount, toast } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { go } from '../app.js';

export const CATEGORY = {
  academico: { label: 'Acadêmico', cls: 'c-academico' },
  documentacao: { label: 'Documentação', cls: 'c-documentacao' },
  financeiro: { label: 'Financeiro', cls: 'c-financeiro' },
  visto: { label: 'Visto', cls: 'c-visto' },
  viagem: { label: 'Viagem', cls: 'c-viagem' },
  pessoal: { label: 'Pessoal', cls: 'c-pessoal' },
};
const PRIORITY = { critica: 'Crítica', alta: 'Alta', normal: 'Normal', aguardando: 'Aguardando resposta' };
const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const START_H = 7;
const END_H = 22;
const PX_PER_MIN = 1.1;
const SNAP = 15;
const HOLD_MS = 350; // toque: segurar antes de arrastar, para não brigar com a rolagem
const DURATIONS = [[30, '30 min'], [60, '1 h'], [90, '1h30'], [120, '2 h']];
const FUSOS = [['America/Sao_Paulo', 'Brasília (BRT)'], ['America/Manaus', 'Manaus'], ['America/Fortaleza', 'Fortaleza'], ['America/Rio_Branco', 'Rio Branco'], ['America/Noronha', 'Fernando de Noronha'], ['Europe/Madrid', 'Espanha (Madri)']];

const snap = (m) => Math.round(m / SNAP) * SNAP;
const clampMin = (m) => Math.max(START_H * 60, Math.min(END_H * 60, m));
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(`${s}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
export const mondayOf = (s) => { const d = new Date(`${s}T12:00:00Z`); return addDays(s, -((d.getUTCDay() + 6) % 7)); };
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
// Semana padrão: a atual, ou a próxima se hoje já for sábado/domingo.
export const defaultWeek = () => { const t = todayIso(); const dow = (new Date(`${t}T12:00:00Z`).getUTCDay() + 6) % 7; return dow >= 5 ? addDays(mondayOf(t), 7) : mondayOf(t); };
const fmtDay = (d, opts) => new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', opts);
const fmtH = (m) => `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}`;
const isSmall = () => window.matchMedia('(max-width: 720px)').matches;
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem storage */ } } };
const KEY_VIEW = 'estuvia.agenda.visao';

// Converte um horário local (no fuso do estudante) para o horário de Madri.
function madridTime(date, time, fromTz) {
  const asUtc = (tz) => {
    const base = new Date(`${date}T${time}:00Z`);
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(base).map((p) => [p.type, p.value]));
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - base.getTime();
  };
  const real = new Date(`${date}T${time}:00Z`).getTime() - asUtc(fromTz);
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }).format(new Date(real));
}

export function WeeklyPlanner({ initialWeek, autoOrganize = false } = {}) {
  let week = mondayOf(initialWeek || defaultWeek());
  let data = { events: [], deadlines: [], disponibilidade: null };
  let proposal = null; // { proposta, naoAgendadas, resumo, removidos? }
  const filters = new Set(Object.keys(CATEGORY));
  let showMadrid = false;
  // Celular abre no dia; computador na semana. A escolha do estudante fica lembrada.
  let view = store.get(KEY_VIEW) || (isSmall() ? 'dia' : 'semana');
  let day = (() => { const t = todayIso(); return t >= week && t <= addDays(week, 6) ? t : week; })();
  let scrolled = false;
  const root = h('section', { class: 'planner' });

  async function load() {
    data = await api.get('/planner');
    draw();
  }

  const weekDays = () => Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const shownDays = () => (view === 'dia' ? [day] : weekDays());
  const inWeek = (d) => d >= week && d <= addDays(week, 6);
  const fuso = () => data.disponibilidade?.fuso || 'America/Sao_Paulo';
  const setWeek = (w) => { week = w; proposal = null; if (!inWeek(day)) day = inWeek(todayIso()) ? todayIso() : week; draw(); };

  // ---------- Topo: navegação, visão, ações ----------
  function toolbar() {
    const label = view === 'dia'
      ? fmtDay(day, { weekday: 'long', day: '2-digit', month: 'long' })
      : `${fmtDay(week, { day: '2-digit', month: 'short' })} – ${fmtDay(addDays(week, 6), { day: '2-digit', month: 'short', year: 'numeric' })}`;
    const step = (n) => {
      if (view === 'dia') { day = addDays(day, n); if (!inWeek(day)) week = mondayOf(day); proposal = null; draw(); } else setWeek(addDays(week, 7 * n));
    };
    const viewBtn = (v, l) => h('button', { type: 'button', class: view === v ? 'on' : '', 'aria-pressed': String(view === v), onClick: () => { view = v; store.set(KEY_VIEW, v); draw(); } }, l);
    return h('div', { class: 'wp-toolbar' },
      h('div', { class: 'wp-nav' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': view === 'dia' ? 'Dia anterior' : 'Semana anterior', onClick: () => step(-1) }, icon('back', { size: 16 })),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': view === 'dia' ? 'Próximo dia' : 'Próxima semana', onClick: () => step(1) }, icon('arrow', { size: 16 })),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => { day = todayIso(); setWeek(mondayOf(day)); } }, 'Hoje'),
        h('h2', { class: 'wp-week' }, label)),
      h('div', { class: 'wp-actions' },
        h('div', { class: 'wp-seg', role: 'group', 'aria-label': 'Visão' }, viewBtn('dia', 'Dia'), viewBtn('semana', 'Semana')),
        h('button', { class: 'btn btn-ghost', type: 'button', id: 'organizar', onClick: organize }, icon('calendar', { size: 16 }), h('span', { class: 'wp-hide-sm' }, 'Organizar semana')),
        h('button', { class: 'btn btn-cta', type: 'button', onClick: () => newAt(view === 'dia' ? day : weekDays().find((d) => d >= todayIso()) || week) }, icon('calendar', { size: 16 }), 'Novo')));
  }

  // Novo compromisso no próximo horário cheio (ou 9h em outro dia).
  function newAt(d) {
    const start = d === todayIso() ? Math.min(END_H * 60 - 60, Math.max(START_H * 60, Math.ceil((nowMin() + 1) / 60) * 60)) : 9 * 60;
    openEditor({ data: d, inicio: toTime(start), fim: toTime(start + 60), categoria: 'pessoal' });
  }

  // ---------- Faixa de dias (visão Dia) ----------
  function dayStrip() {
    if (view !== 'dia') return null;
    const today = todayIso();
    return h('div', { class: 'wp-strip', role: 'tablist', 'aria-label': 'Dia da semana' }, weekDays().map((d, i) => {
      const n = data.events.filter((e) => e.data === d && filters.has(e.categoria)).length + data.deadlines.filter((x) => x.data === d && filters.has(x.categoria)).length;
      return h('button', { type: 'button', role: 'tab', 'aria-selected': String(d === day), class: `wp-strip-day${d === day ? ' on' : ''}${d === today ? ' today' : ''}`, onClick: () => { day = d; draw(); } },
        h('small', {}, DAYS[i]), h('strong', {}, String(Number(d.slice(8)))), h('i', { class: n ? 'has' : '' }));
    }));
  }

  // ---------- Resumo + legenda/filtros + ajustes ----------
  function infoBar() {
    const ev = data.events.filter((e) => inWeek(e.data));
    const planned = ev.reduce((s, e) => s + toMin(e.fim) - toMin(e.inicio), 0);
    const meta = data.disponibilidade ? Math.round(data.disponibilidade.horasSemanais * 60) : 0;
    const prazos = data.deadlines.filter((d) => inWeek(d.data)).length;
    const pct = meta ? Math.min(100, Math.round((planned / meta) * 100)) : 0;
    const fill = h('span');
    fill.style.width = `${pct}%`; // CSSOM: a CSP não permite atributo style inline
    return h('div', { class: 'wp-info' },
      h('div', { class: 'wp-stats' },
        h('span', { class: 'wp-meter', title: `${pct}% da sua meta semanal` }, fill),
        h('span', {}, h('strong', {}, fmtH(planned)), meta ? ` de ${fmtH(meta)} planejadas` : ' planejadas'),
        h('span', { class: 'wp-sep' }, '·'), h('span', {}, h('strong', {}, String(ev.length)), ev.length === 1 ? ' atividade' : ' atividades'),
        prazos ? [h('span', { class: 'wp-sep' }, '·'), h('span', { class: 'wp-has-deadline' }, h('strong', {}, String(prazos)), prazos === 1 ? ' prazo' : ' prazos')] : null),
      h('div', { class: 'wp-legend', role: 'group', 'aria-label': 'Mostrar categorias' },
        Object.entries(CATEGORY).map(([k, c]) => {
          const on = filters.has(k);
          return h('button', { type: 'button', class: `wp-filter ${c.cls}${on ? ' on' : ''}`, 'aria-pressed': String(on), title: on ? `Esconder ${c.label}` : `Mostrar ${c.label}`, onClick: () => { on ? filters.delete(k) : filters.add(k); draw(); } }, h('i'), c.label);
        })),
      settings());
  }

  function settings() {
    const av = data.disponibilidade;
    const madrid = h('input', { type: 'checkbox', checked: showMadrid });
    madrid.addEventListener('change', () => { showMadrid = madrid.checked; draw(); });
    const body = [
      h('label', { class: 'check' }, madrid, h('span', {}, 'Mostrar também o horário da Espanha')),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: replan }, icon('refresh', { size: 14 }), 'Replanejar a semana'),
      av ? availabilityForm(av) : null,
    ];
    const box = h('details', { class: 'wp-settings' },
      h('summary', {}, icon('clock', { size: 14 }), 'Ajustes'),
      h('div', { class: 'wp-settings-body' }, body));
    return box;
  }

  function availabilityForm(av) {
    const dias = h('div', { class: 'wp-days-pick' }, DAYS.map((d, i) => {
      const on = av.dias.includes(i + 1);
      return h('label', { class: `day-pill ${on ? 'on' : ''}` }, h('input', { type: 'checkbox', name: 'dia', value: String(i + 1), checked: on, class: 'sr-only' }), d);
    }));
    dias.addEventListener('change', (ev) => ev.target.closest('.day-pill')?.classList.toggle('on', ev.target.checked));
    const f = h('form', { class: 'stack' },
      h('strong', { class: 'small' }, 'Minha disponibilidade'),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Dias disponíveis'), dias),
      h('div', { class: 'grid-3 tight' },
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Livre das'), h('input', { type: 'time', name: 'inicio', value: av.janelas[0].inicio, step: 900 })),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'até'), h('input', { type: 'time', name: 'fim', value: av.janelas[0].fim, step: 900 })),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Horas por semana'), h('input', { type: 'number', name: 'horas', min: 0.5, max: 60, step: 0.5, value: av.horasSemanais }))),
      h('div', { class: 'grid-2 tight' },
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Prefiro atividades'), h('select', { name: 'preferencia' }, [['curtas', 'Curtas (até 45 min)'], ['longas', 'Longas (até 2 h)']].map(([v, l]) => h('option', { value: v, selected: v === av.preferencia }, l)))),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Meu fuso horário'), h('select', { name: 'fuso' }, FUSOS.map(([v, l]) => h('option', { value: v, selected: v === av.fuso }, l))))),
      h('p', { class: 'hint' }, 'Horários de trabalho e estudo já ocupados? Cadastre-os como compromissos: a Agenda não sugere nada por cima deles.'),
      h('button', { class: 'btn btn-ghost', type: 'submit' }, 'Salvar disponibilidade'));
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const diasSel = [...f.querySelectorAll('input[name=dia]:checked')].map((c) => Number(c.value));
      try {
        data = await api.put('/planner/availability', { dias: diasSel, janelas: [{ inicio: f.inicio.value, fim: f.fim.value }], horasSemanais: Number(f.horas.value), preferencia: f.preferencia.value, fuso: f.fuso.value });
        toast('Disponibilidade salva.', 'ok');
        draw();
      } catch (err) { toast(err.message, 'err'); }
    });
    return f;
  }

  // ---------- Blocos ----------
  function block(e, { proposed = false, onRemove } = {}) {
    const dur = toMin(e.fim) - toMin(e.inicio);
    const top = (toMin(e.inicio) - START_H * 60) * PX_PER_MIN;
    const height = Math.max(20, dur * PX_PER_MIN - 2);
    const cat = CATEGORY[e.categoria] || CATEGORY.pessoal;
    const tag = e.missaoId ? ['target', `Missão ${e.missaoId.startsWith('9.') ? `F.${e.missaoId.split('.')[1]}` : e.missaoId}`]
      : e.origem === 'mentor' ? ['chat', 'Mentor'] : e.origem === 'viagem' ? ['plane', 'Viagem'] : e.origem === 'documentos' ? ['file', 'Documentos'] : e.motivo === 'Meu Novo Lar' ? ['home2', 'Meu Novo Lar'] : null;
    const time = `${e.inicio}–${e.fim}${showMadrid ? ` · ${madridTime(e.data, e.inicio, fuso())} Madri` : ''}`;
    const el = h(proposed ? 'div' : 'button', {
      type: proposed ? null : 'button',
      class: `wp-block ${cat.cls}${proposed ? ' proposed' : ''}${dur <= 45 ? ' short' : ''} p-${e.prioridade || 'normal'}`,
      title: `${e.titulo}\n${e.inicio}–${e.fim}${e.motivo ? `\n${e.motivo}` : ''}`,
      'aria-label': `${e.titulo}, ${fmtDay(e.data, { weekday: 'long', day: '2-digit' })}, ${e.inicio} às ${e.fim}`,
    },
      h('strong', {}, e.titulo),
      h('span', { class: 'wp-time' }, time),
      tag && dur > 45 ? h('span', { class: 'wp-tag' }, icon(tag[0], { size: 11 }), tag[1]) : null,
      e.prioridade && ['critica', 'alta'].includes(e.prioridade) ? h('span', { class: 'wp-prio' }, PRIORITY[e.prioridade]) : null,
      proposed ? h('button', { type: 'button', class: 'wp-x', 'aria-label': 'Remover da proposta', onClick: onRemove }, icon('x', { size: 12 })) : null,
      proposed ? null : h('span', { class: 'wp-resize', 'aria-hidden': 'true', title: 'Arraste para mudar a duração' }));
    el.style.top = `${top}px`;
    el.style.height = `${height}px`;
    if (!proposed) {
      el.addEventListener('click', () => { if (!el.dataset.dragged) openEditor(e); });
      enableDrag(el, e);
      enableResize(el, e);
    }
    return el;
  }

  const saveTimes = async (e, target, msg) => {
    try {
      const { id, origem, criadoEm, editadoEm, prioridadeLabel, ...rest } = e;
      data = await api.put(`/planner/events/${id}`, { ...rest, ...target });
      toast(msg, 'ok');
    } catch (err) { toast(err.message, 'err'); }
    draw();
  };

  // Arrastar o bloco: move entre dias/horários visíveis (encaixe de 15 min).
  function enableDrag(el, e) {
    el.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      const cols = root.querySelector('.wp-days');
      const days = shownDays();
      const startX = ev.clientX;
      const startY = ev.clientY;
      const grabY = ev.clientY - el.getBoundingClientRect().top;
      const dur = toMin(e.fim) - toMin(e.inicio);
      let moved = false;
      let target = null;
      const onMove = (mv) => {
        if (!moved && Math.hypot(mv.clientX - startX, mv.clientY - startY) < 6) return;
        moved = true;
        el.classList.add('dragging');
        const rect = cols.getBoundingClientRect();
        const n = days.length;
        const col = Math.min(n - 1, Math.max(0, Math.floor(((mv.clientX - rect.left) / rect.width) * n)));
        const start = Math.max(START_H * 60, Math.min(END_H * 60 - dur, snap((mv.clientY - rect.top - grabY) / PX_PER_MIN + START_H * 60)));
        target = { data: days[col], inicio: toTime(start), fim: toTime(start + dur) };
        el.style.transform = `translate(${(col - days.indexOf(e.data)) * (rect.width / n)}px, ${(start - toMin(e.inicio)) * PX_PER_MIN}px)`;
        el.querySelector('.wp-time').textContent = `${target.inicio}–${target.fim}`;
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        if (!moved || !target) return;
        el.dataset.dragged = '1';
        if (target.data === e.data && target.inicio === e.inicio) { draw(); return; }
        saveTimes(e, target, 'Atividade reagendada.');
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }

  // Puxar a borda de baixo: muda só o fim (mínimo 15 min).
  function enableResize(el, e) {
    el.querySelector('.wp-resize').addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      ev.stopPropagation();
      ev.preventDefault();
      const startY = ev.clientY;
      const ini = toMin(e.inicio);
      const fim0 = toMin(e.fim);
      let fim = fim0;
      el.classList.add('dragging');
      const onMove = (mv) => {
        fim = Math.max(ini + SNAP, clampMin(snap(fim0 + (mv.clientY - startY) / PX_PER_MIN)));
        el.style.height = `${Math.max(20, (fim - ini) * PX_PER_MIN - 2)}px`;
        el.querySelector('.wp-time').textContent = `${e.inicio}–${toTime(fim)}`;
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        if (fim === fim0) { el.classList.remove('dragging'); return; }
        el.dataset.dragged = '1';
        saveTimes(e, { fim: toTime(fim) }, 'Duração atualizada.');
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }

  // Clicar e arrastar num horário vazio: marca o período e abre "Nova atividade" já preenchida.
  // Clique simples cria 1 hora. No toque, segure um instante antes de arrastar (senão a página rola).
  function enableSelect(col, d) {
    let sel = null; // { anchor, cur, ghost, moved }
    const minuteAt = (clientY) => clampMin(START_H * 60 + (clientY - col.getBoundingClientRect().top) / PX_PER_MIN);
    const range = () => {
      const a = Math.floor(sel.anchor / SNAP) * SNAP;
      const b = Math.floor(sel.cur / SNAP) * SNAP;
      return { ini: Math.min(a, b), fim: Math.min(END_H * 60, Math.max(a, b) + SNAP) };
    };
    const paint = () => {
      const { ini, fim } = range();
      sel.ghost.style.top = `${(ini - START_H * 60) * PX_PER_MIN}px`;
      sel.ghost.style.height = `${(fim - ini) * PX_PER_MIN}px`;
      sel.ghost.textContent = `${toTime(ini)}–${toTime(fim)}`;
    };
    const begin = (clientY) => {
      sel = { anchor: minuteAt(clientY), cur: minuteAt(clientY), ghost: h('div', { class: 'wp-select', 'aria-hidden': 'true' }), moved: false };
      col.append(sel.ghost);
      paint();
    };
    const finish = (open) => {
      if (!sel) return;
      const { ini, fim } = range();
      const dragged = sel.moved;
      sel.ghost.remove();
      sel = null;
      if (!open) return;
      const inicio = Math.min(ini, END_H * 60 - SNAP);
      const final = dragged ? fim : Math.min(inicio + 60, END_H * 60);
      openEditor({ data: d, inicio: toTime(inicio), fim: toTime(Math.max(final, inicio + SNAP)), categoria: 'pessoal' });
    };

    col.addEventListener('pointerdown', (ev) => {
      if (ev.target !== col || ev.button !== 0 || proposal) return;
      const touch = ev.pointerType === 'touch';
      const startX = ev.clientX;
      const startY = ev.clientY;
      let hold = null;
      if (touch) hold = setTimeout(() => { hold = null; begin(startY); navigator.vibrate?.(10); }, HOLD_MS);
      else { ev.preventDefault(); begin(startY); }
      const onMove = (mv) => {
        if (hold) {
          // Mexeu antes de completar o toque longo: é rolagem, não seleção.
          if (Math.hypot(mv.clientX - startX, mv.clientY - startY) > 8) cleanup(false);
          return;
        }
        if (!sel) return;
        sel.cur = minuteAt(mv.clientY);
        if (Math.abs(mv.clientY - startY) > 4) sel.moved = true;
        paint();
      };
      const onTouchMove = (tm) => { if (sel) tm.preventDefault(); };
      const onUp = () => cleanup(true);
      const onCancel = () => cleanup(false);
      function cleanup(open) {
        // Toque rápido (sem segurar) também cria: vira um clique simples de 1 hora.
        if (hold) { clearTimeout(hold); hold = null; if (open) begin(startY); }
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        col.removeEventListener('touchmove', onTouchMove);
        finish(open);
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      col.addEventListener('touchmove', onTouchMove, { passive: false });
    });
  }

  // ---------- Grade ----------
  function grid() {
    const days = shownDays();
    const today = todayIso();
    const deadlines = days.map((d) => data.deadlines.filter((x) => x.data === d && filters.has(x.categoria)));
    const head = view === 'dia' ? null : h('div', { class: 'wp-head' }, h('span'), days.map((d, i) =>
      h('button', { type: 'button', class: `wp-dayname${d === today ? ' today' : ''}${i >= 5 ? ' weekend' : ''}`, title: 'Ver este dia', onClick: () => { day = d; view = 'dia'; store.set(KEY_VIEW, view); draw(); } },
        h('small', {}, DAYS[i]), h('strong', {}, String(Number(d.slice(8)))))));
    // Linha de prazos só aparece quando há prazo nos dias visíveis.
    const allDay = deadlines.some((x) => x.length) ? h('div', { class: 'wp-allday' }, h('span', {}, icon('flag', { size: 12 })),
      deadlines.map((list) => h('div', { class: 'wp-allday-cell' }, list.map((x) =>
        h('button', { type: 'button', class: `wp-deadline ${x.tipo}`, title: `${x.rotulo || x.titulo} - ${x.tipo === 'prazo-oficial' ? 'prazo oficial (regra cadastrada)' : 'prazo declarado por você'}`, onClick: () => x.missaoId && x.journeyId && go(`/j/${x.journeyId}/m/${x.missaoId}`) },
          icon(x.tipo === 'prazo-oficial' ? 'shield' : 'flag', { size: 11 }), h('span', {}, x.titulo)))))) : null;

    const hours = h('div', { class: 'wp-hours', 'aria-hidden': 'true' }, Array.from({ length: END_H - START_H }, (_, i) => h('span', {}, i ? `${String(START_H + i).padStart(2, '0')}:00` : '')));
    const colsEl = h('div', { class: 'wp-days' }, days.map((d, i) => {
      const col = h('div', { class: `wp-col${d === today ? ' today' : ''}${d < today ? ' past' : ''}${view === 'semana' && i >= 5 ? ' weekend' : ''}` });
      col.style.height = `${(END_H - START_H) * 60 * PX_PER_MIN}px`;
      data.events.filter((e) => e.data === d && filters.has(e.categoria)).forEach((e) => col.append(block(e)));
      proposal?.proposta.forEach((p, idx) => { if (p.data === d && filters.has(p.categoria)) col.append(block(p, { proposed: true, onRemove: () => { proposal.proposta.splice(idx, 1); draw(); } })); });
      if (d === today) col.append(nowLine());
      enableSelect(col, d);
      return col;
    }));

    const empty = !days.some((d) => data.events.some((e) => e.data === d)) && !proposal
      ? h('p', { class: 'wp-empty' }, icon('calendar', { size: 16 }), view === 'dia' ? 'Dia livre. Toque num horário para criar um compromisso.' : 'Semana livre. Clique e arraste num horário para criar, ou peça para a IA organizar.')
      : null;
    const body = h('div', { class: 'wp-body' }, hours, colsEl);
    const scroller = h('div', { class: 'wp-scroll' }, head, allDay, body);
    const cal = h('div', { class: `wp-cal is-${view}` }, empty, scroller);
    cal.style.setProperty('--n', String(days.length)); // CSSOM: a CSP não permite atributo style inline
    return cal;
  }

  // Linha da hora atual (atualiza a cada minuto enquanto a tela está aberta).
  function nowLine() {
    const line = h('div', { class: 'wp-now', 'aria-hidden': 'true' });
    const place = () => {
      const m = nowMin();
      line.hidden = m < START_H * 60 || m > END_H * 60;
      line.style.top = `${(m - START_H * 60) * PX_PER_MIN}px`;
    };
    place();
    const t = setInterval(() => { if (!line.isConnected) return clearInterval(t); place(); }, 60000);
    return line;
  }

  // Abre já rolado: hora atual (hoje) ou o primeiro compromisso, senão 8h.
  function scrollToStart() {
    const sc = root.querySelector('.wp-scroll');
    if (!sc) return;
    const days = shownDays();
    const first = data.events.filter((e) => days.includes(e.data)).map((e) => toMin(e.inicio)).sort((a, b) => a - b)[0];
    const target = days.includes(todayIso()) ? nowMin() - 60 : first ?? 8 * 60;
    sc.scrollTop = Math.max(0, (clampMin(target) - START_H * 60 - 15) * PX_PER_MIN);
  }

  // ---------- Proposta da IA ----------
  function proposalPanel() {
    if (!proposal) return null;
    return h('div', { class: 'wp-proposal panel' },
      h('div', { class: 'row between wrap' },
        h('div', {},
          h('h3', { class: 'panel-title' }, icon('calendar', { size: 18 }), 'Sugestão para a semana'),
          h('p', { class: 'muted small' }, `${proposal.proposta.length} bloco(s) · ${Math.round(proposal.resumo.planejadoMin / 60 * 10) / 10}h de ${Math.round(proposal.resumo.metaMin / 60 * 10) / 10}h da sua meta. Os blocos tracejados ainda não foram salvos: remova o que não quiser e aprove.`)),
        h('div', { class: 'row' },
          h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => { proposal = null; draw(); } }, 'Descartar'),
          h('button', { class: 'btn btn-cta', type: 'button', disabled: !proposal.proposta.length, onClick: approve }, icon('check', { size: 16 }), 'Aprovar'))),
      proposal.removidos?.length ? h('div', { class: 'notice' }, h('strong', {}, 'Replanejamento: '), `${proposal.removidos.length} bloco(s) removido(s): `, proposal.removidos.map((r) => `${r.titulo} (${r.motivo})`).join('; ')) : null,
      proposal.proposta.length ? h('ol', { class: 'wp-plist' }, proposal.proposta.map((p) => h('li', {},
        h('span', { class: `wp-dot ${CATEGORY[p.categoria]?.cls}` }), h('strong', {}, `${fmtDay(p.data, { weekday: 'short', day: '2-digit' })} ${p.inicio}`), ` ${p.titulo} `,
        h('span', { class: 'muted small' }, `· ${PRIORITY[p.prioridade] || 'Normal'} · ${p.motivo || ''}`))))
        : h('p', { class: 'muted' }, 'Não há horários livres nesta semana pela sua disponibilidade, ou não há missões disponíveis. Ajuste sua disponibilidade em "Ajustes" ou escolha outra semana.'),
      proposal.naoAgendadas?.length ? h('details', {}, h('summary', {}, `${proposal.naoAgendadas.length} tarefa(s) não couberam nesta semana`), h('ul', {}, proposal.naoAgendadas.map((n) => h('li', {}, `${n.titulo} - ${PRIORITY[n.prioridade]}${n.prazo ? ` · prazo ${n.prazo}` : ''}`)))) : null,
      h('p', { class: 'hint' }, 'A Agenda sugere, organiza e lembra. Ela não marca missões como concluídas quando o horário passa: só você conclui uma missão.'));
  }

  async function organize() {
    try {
      proposal = await api.post('/planner/suggest', { semana: week });
      if (view === 'dia') view = 'semana'; // a proposta é da semana inteira
      draw();
      root.querySelector('.wp-proposal')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { toast(e.message, 'err'); }
  }
  async function replan() {
    try {
      const r = await api.post('/planner/replan', { semana: week });
      data = r;
      proposal = r;
      if (view === 'dia') view = 'semana';
      toast(r.removidos.length ? `${r.removidos.length} bloco(s) que perderam sentido foram removidos. Revise a nova proposta.` : 'Nova proposta gerada com o estado atual das missões.', 'info');
      draw();
    } catch (e) { toast(e.message, 'err'); }
  }
  async function approve() {
    try {
      const itens = proposal.proposta.map(({ prioridadeLabel, ...p }) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== null)));
      data = await api.post('/planner/approve', { itens });
      toast(`${data.criados} atividade(s) adicionadas à sua agenda.`, 'ok');
      proposal = null;
      draw();
    } catch (e) { toast(e.message, 'err'); }
  }

  // ---------- Criar / editar ----------
  function openEditor(e) {
    const isNew = !e.id;
    let categoria = e.categoria || 'pessoal';
    const cats = h('div', { class: 'wp-cats', role: 'radiogroup', 'aria-label': 'Categoria' }, Object.entries(CATEGORY).map(([k, c]) => {
      const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(k === categoria), class: `wp-cat ${c.cls}${k === categoria ? ' on' : ''}` }, h('i'), c.label);
      b.addEventListener('click', () => { categoria = k; cats.querySelectorAll('.wp-cat').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); }); });
      return b;
    }));
    const inicio = h('input', { type: 'time', name: 'inicio', value: e.inicio, required: true, step: 900 });
    const fim = h('input', { type: 'time', name: 'fim', value: e.fim, required: true, step: 900 });
    const durs = h('div', { class: 'wp-durs' }, h('span', { class: 'muted small' }, 'Duração:'), DURATIONS.map(([m, l]) => h('button', { type: 'button', class: 'chip', onClick: () => { if (inicio.value) fim.value = toTime(Math.min(toMin(inicio.value) + m, 23 * 60 + 45)); } }, l)));
    const f = h('form', { class: 'wp-editor' },
      h('input', { name: 'titulo', class: 'wp-title-input', value: e.titulo || '', required: true, maxlength: 120, placeholder: 'O que você vai fazer?', 'aria-label': 'Atividade' }),
      h('div', { class: 'wp-when' },
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Dia'), h('input', { type: 'date', name: 'data', value: e.data, required: true })),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Início'), inicio),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Fim'), fim)),
      durs,
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Categoria'), cats),
      h('details', { class: 'wp-note', open: !!e.nota }, h('summary', {}, 'Adicionar nota'), h('textarea', { name: 'nota', rows: 2, maxlength: 300, 'aria-label': 'Nota' }, e.nota || '')),
      e.missaoId ? h('p', { class: 'small' }, icon('target', { size: 13 }), ` Relacionada à missão ${e.missaoId}. `, h('a', { href: `#/j/${e.journeyId}/m/${e.missaoId}` }, 'Abrir missão')) : null,
      h('div', { class: 'wp-editor-foot' },
        isNew ? h('span') : h('button', { type: 'button', class: 'btn btn-ghost btn-sm wp-del', onClick: async () => { try { data = await api.del(`/planner/events/${e.id}`); close(); draw(); toast('Atividade removida.'); } catch (err) { toast(err.message, 'err'); } } }, icon('trash', { size: 14 }), 'Remover'),
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => close() }, 'Cancelar'), h('button', { type: 'submit', class: 'btn btn-cta' }, isNew ? 'Criar' : 'Salvar'))));
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const body = { titulo: f.titulo.value.trim(), data: f.data.value, inicio: inicio.value, fim: fim.value, categoria };
      if (body.fim <= body.inicio) return toast('O fim precisa ser depois do início.', 'err');
      if (f.nota.value.trim()) body.nota = f.nota.value.trim();
      ['journeyId', 'missaoId', 'bolsaId', 'prioridade', 'motivo'].forEach((k) => { if (e[k]) body[k] = e[k]; });
      try {
        data = isNew ? await api.post('/planner', body) : await api.put(`/planner/events/${e.id}`, body);
        close();
        week = mondayOf(body.data);
        day = body.data;
        draw();
        toast(isNew ? 'Compromisso criado.' : 'Atividade atualizada.', 'ok');
      } catch (err) { toast(err.message, 'err'); }
    });
    const dlg = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': isNew ? 'Novo compromisso' : 'Editar atividade' },
      h('div', { class: 'modal-card wp-modal' },
        h('div', { class: 'wp-modal-head' }, h('h3', {}, isNew ? 'Novo compromisso' : 'Editar atividade'), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Fechar', onClick: () => close() }, icon('x', { size: 16 }))),
        f));
    const close = () => { dlg.remove(); document.removeEventListener('keydown', esc); };
    const esc = (k) => { if (k.key === 'Escape') close(); };
    dlg.addEventListener('click', (ev) => { if (ev.target === dlg) close(); });
    document.addEventListener('keydown', esc);
    document.body.append(dlg);
    f.titulo.focus();
  }

  function draw() {
    const keep = root.querySelector('.wp-scroll')?.scrollTop;
    mount(root, toolbar(), infoBar(), proposalPanel(), dayStrip(), grid(),
      h('p', { class: 'hint wp-tip' }, isSmall()
        ? 'Toque num horário para criar; segure e arraste para escolher o período. Arraste um bloco para mudar o horário.'
        : 'Clique e arraste num horário vazio para criar. Arraste um bloco para reagendar e puxe a borda de baixo para mudar a duração.'));
    const sc = root.querySelector('.wp-scroll');
    if (!scrolled) { scrollToStart(); scrolled = true; } else if (sc && keep != null) sc.scrollTop = keep;
  }

  load().then(() => { if (autoOrganize) organize(); }).catch((e) => mount(root, h('p', { class: 'notice' }, e.message)));
  return root;
}
