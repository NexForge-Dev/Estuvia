// Minhas anotações: o caderno do estudante dentro da missão. Três tipos, fáceis de reconhecer:
//   Anotação          → lembrete livre ("a secretaria só responde de manhã")
//   Tarefa            → algo a fazer, com caixinha de marcar
//   Preciso de ajuda  → dúvida ou trava; um clique leva a dúvida ao Mentor, com a missão no contexto
// As anotações não concluem objetivos nem a missão: só o estudante e o servidor decidem isso.
import { h, mount, toast } from '../../ui.js';
import { icon } from '../../icons.js';
import { api } from '../../api.js';
import { fmtDate } from '../common.js';

const TYPES = {
  nota: { rotulo: 'Anotação', ic: 'edit', exemplo: 'Ex.: a secretaria só responde e-mails de manhã.' },
  tarefa: { rotulo: 'Tarefa', ic: 'check', exemplo: 'Ex.: pedir o histórico autenticado na faculdade.' },
  ajuda: { rotulo: 'Preciso de ajuda', ic: 'help', exemplo: 'Ex.: não sei se meu diploma precisa de apostila.' },
};
const SUGGESTIONS = [
  { tipo: 'tarefa', texto: 'Separar os documentos desta missão' },
  { tipo: 'nota', texto: 'Anotar o contato de quem me atendeu' },
  { tipo: 'ajuda', texto: 'Não entendi uma parte desta missão' },
];

export function MissionNotes(m, { journey, onAskMentor, onChange = () => {}, inSheet = false }) {
  const base = `/journeys/${journey.id}/missions/${m.id}/notes`;
  let notes = [...(m.anotacoes || [])];
  let tipo = 'tarefa';
  let filtro = 'todas';
  let busy = false;

  const counter = h('div', { class: 'mn-counts' });
  const list = h('div', { class: 'mn-list' });
  const filters = h('div', { class: 'mn-filters', role: 'tablist', 'aria-label': 'Filtrar anotações' });
  const input = h('textarea', { rows: 1, maxlength: 500, 'aria-label': 'Nova anotação', placeholder: TYPES[tipo].exemplo });
  const addBtn = h('button', { type: 'submit', class: 'btn btn-cta mn-add' }, icon('arrow', { size: 15 }), h('span', {}, 'Adicionar'));
  const typeBtns = Object.entries(TYPES).map(([id, t]) => h('button', {
    type: 'button', class: `mn-type t-${id}`, role: 'radio', 'aria-checked': String(id === tipo), dataset: { tipo: id },
    onClick: () => { tipo = id; syncType(); input.focus(); },
  }, icon(t.ic, { size: 14 }), t.rotulo));
  const syncType = () => {
    typeBtns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.tipo === tipo)));
    input.placeholder = TYPES[tipo].exemplo;
  };

  async function call(promise, okMsg) {
    if (busy) return false;
    busy = true;
    try {
      const r = await promise;
      notes = r.mission?.anotacoes || notes;
      draw();
      onChange(notes);
      if (okMsg) toast(okMsg, 'ok');
      return true;
    } catch (e) {
      toast(e.message, 'err');
      return false;
    } finally { busy = false; }
  }

  const form = h('form', { class: 'mn-composer' },
    h('div', { class: 'mn-types', role: 'radiogroup', 'aria-label': 'Tipo de anotação' }, typeBtns),
    h('div', { class: 'mn-input' }, input, addBtn));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const texto = input.value.trim();
    if (!texto) return input.focus();
    if (await call(api.post(base, { texto, tipo }))) { input.value = ''; autosize(); input.focus(); }
  });
  const autosize = () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 160)}px`; };
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });

  function item(n) {
    const t = TYPES[n.tipo] || TYPES.nota;
    const text = h('p', { class: 'mn-text' }, n.texto);
    const row = h('article', { class: `mn-item t-${n.tipo} ${n.feito ? 'is-done' : ''}` });

    const lead = n.tipo === 'tarefa'
      ? h('button', { type: 'button', class: 'mn-check', role: 'checkbox', 'aria-checked': String(n.feito), 'aria-label': n.feito ? 'Marcar como não feita' : 'Marcar como feita', onClick: () => call(api.put(`${base}/${n.id}`, { feito: !n.feito })) }, n.feito ? icon('check', { size: 14 }) : null)
      : h('span', { class: 'mn-ic', 'aria-hidden': 'true' }, icon(t.ic, { size: 14 }));

    const meta = h('small', { class: 'mn-meta' }, t.rotulo, ' · ', fmtDate(n.criadaEm.slice(0, 10)),
      n.feito && n.tipo === 'ajuda' ? ' · resolvido' : n.feito ? ' · feito' : '');

    const actions = h('div', { class: 'mn-actions' },
      n.tipo === 'ajuda' && !n.feito ? h('button', { type: 'button', class: 'mn-mentor', onClick: () => onAskMentor(`Preciso de ajuda na Missão ${m.label} (${m.definicao.titulo}): ${n.texto}`) }, icon('chat', { size: 13 }), 'Perguntar ao Mentor') : null,
      n.tipo === 'ajuda' ? h('button', { type: 'button', class: 'mn-link', onClick: () => call(api.put(`${base}/${n.id}`, { feito: !n.feito })) }, n.feito ? 'Reabrir' : 'Resolvido') : null,
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Editar anotação', title: 'Editar', onClick: () => edit() }, icon('edit', { size: 14 })),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Apagar anotação', title: 'Apagar', onClick: () => askDelete() }, icon('trash', { size: 14 })));

    const body = h('div', { class: 'mn-body' }, text, meta);
    mount(row, lead, body, actions);

    function edit() {
      const ta = h('textarea', { rows: 2, maxlength: 500, 'aria-label': 'Editar anotação' });
      ta.value = n.texto;
      const kind = h('select', { 'aria-label': 'Tipo' }, Object.entries(TYPES).map(([id, x]) => h('option', { value: id, selected: id === n.tipo }, x.rotulo)));
      const save = async () => { const v = ta.value.trim(); if (!v) return ta.focus(); await call(api.put(`${base}/${n.id}`, { texto: v, tipo: kind.value }), 'Anotação atualizada.'); };
      ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); } if (e.key === 'Escape') draw(); });
      mount(body, ta, h('div', { class: 'mn-edit-bar' }, kind,
        h('button', { type: 'button', class: 'btn btn-sm btn-cta', onClick: save }, 'Salvar'),
        h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onClick: draw }, 'Cancelar')));
      actions.hidden = true;
      ta.focus();
    }
    // Confirmação no próprio item (sem janela do navegador).
    function askDelete() {
      mount(actions, h('span', { class: 'mn-confirm' }, 'Apagar?'),
        h('button', { type: 'button', class: 'btn btn-sm btn-danger', onClick: () => call(api.del(`${base}/${n.id}`), 'Anotação apagada.') }, 'Sim'),
        h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onClick: draw }, 'Não'));
    }
    return row;
  }

  function draw() {
    const abertas = { tarefa: notes.filter((n) => n.tipo === 'tarefa' && !n.feito).length, ajuda: notes.filter((n) => n.tipo === 'ajuda' && !n.feito).length };
    mount(counter,
      abertas.tarefa ? h('span', { class: 'mn-pill t-tarefa' }, `${abertas.tarefa} tarefa${abertas.tarefa > 1 ? 's' : ''} a fazer`) : null,
      abertas.ajuda ? h('span', { class: 'mn-pill t-ajuda' }, `${abertas.ajuda} pedido${abertas.ajuda > 1 ? 's' : ''} de ajuda`) : null);

    const tabs = [['todas', 'Todas', notes.length], ['tarefa', 'Tarefas', notes.filter((n) => n.tipo === 'tarefa').length], ['ajuda', 'Ajuda', notes.filter((n) => n.tipo === 'ajuda').length], ['nota', 'Anotações', notes.filter((n) => n.tipo === 'nota').length]];
    if (filtro !== 'todas' && !notes.some((n) => n.tipo === filtro)) filtro = 'todas';
    filters.hidden = notes.length < 4;
    mount(filters, tabs.filter(([id, , c]) => id === 'todas' || c).map(([id, label, c]) => h('button', { type: 'button', role: 'tab', class: 'mn-filter', 'aria-selected': String(filtro === id), onClick: () => { filtro = id; draw(); } }, label, h('span', {}, c))));

    if (!notes.length) {
      mount(list, h('div', { class: 'mn-empty' },
        h('p', {}, 'Nada anotado ainda. Use este espaço para não esquecer nada desta missão.'),
        h('div', { class: 'mn-suggest' }, SUGGESTIONS.map((s) => h('button', { type: 'button', class: 'chip', onClick: () => { tipo = s.tipo; syncType(); input.value = s.texto; autosize(); input.focus(); } }, icon(TYPES[s.tipo].ic, { size: 12 }), ' ', s.texto)))));
      return;
    }
    // Abertas primeiro (pedidos de ajuda no topo), feitas por último.
    const order = { ajuda: 0, tarefa: 1, nota: 2 };
    const shown = notes.filter((n) => filtro === 'todas' || n.tipo === filtro)
      .sort((a, b) => Number(a.feito) - Number(b.feito) || order[a.tipo] - order[b.tipo] || b.criadaEm.localeCompare(a.criadaEm));
    mount(list, shown.map(item));
  }

  draw();
  const intro = h('p', { class: 'muted small' }, 'Só você vê. Anote lembretes, tarefas ou o que está travando você.');
  // No painel da missão o título já aparece no topo da janela.
  if (inSheet) return h('div', { class: 'mn is-sheet' }, h('div', { class: 'mn-head' }, h('div', {}, intro), counter), form, filters, list);
  return h('section', { class: 'mh-card mn', 'aria-labelledby': `mn-title-${m.id}` },
    h('header', { class: 'mn-head' },
      h('span', { class: 'mn-head-ic' }, icon('book', { size: 18 })),
      h('div', {}, h('h2', { id: `mn-title-${m.id}` }, 'Minhas anotações'), intro),
      counter),
    form, filters, list);
}
