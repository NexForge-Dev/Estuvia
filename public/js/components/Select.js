// Select reutilizável (combobox acessível) — substitui o <select> nativo onde a escolha importa.
//
// - Lista em "portal" (anexada ao <body>, posição fixa): nunca é cortada por overflow e nunca sai da tela.
//   Abre para baixo ou para cima conforme o espaço; alinha pela borda direita quando passaria da viewport.
//   No celular vira uma folha inferior.
// - Teclado: ↑ ↓ Home End PageUp PageDown, Enter/Espaço escolhe, Esc fecha, digitação rápida (sem busca)
//   ou busca com filtro (searchable). ARIA: combobox + listbox + aria-activedescendant.
// - Valor "estranho" (fora da lista, ex.: texto antigo do perfil) continua exibido como está.
// - Dispara 'change' (bubbles) no elemento raiz e chama onChange(value, option).
import { h } from '../ui.js';
import { icon } from '../icons.js';

let seq = 0;
let openInstance = null;
const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const normalize = (o) => (Array.isArray(o) ? { value: o[0], label: o[1] } : o);

export function Select({
  name, value = '', options = [], placeholder = 'Selecione', searchable = null, searchPlaceholder = 'Buscar…',
  ariaLabel, labelledBy, id, disabled = false, invalid = false, onChange, emptyText = 'Nada encontrado.',
  renderOption, renderValue, className = '', compact = false, block = true, minWidth = 220,
} = {}) {
  const uid = id || `uisel-${++seq}`;
  let items = options.map(normalize);
  let current = value ?? '';
  const isSearchable = searchable ?? items.length > 12;

  const hidden = name ? h('input', { type: 'hidden', name, value: current }) : null;
  const valueEl = h('span', { class: 'ui-select-value' });
  const trigger = h('button', {
    type: 'button', id: uid, class: 'ui-select-trigger', role: 'combobox', 'aria-haspopup': 'listbox', 'aria-expanded': 'false',
    'aria-controls': `${uid}-list`, 'aria-label': ariaLabel || null, 'aria-labelledby': labelledBy || null, disabled,
  }, valueEl, h('span', { class: 'ui-select-chevron', 'aria-hidden': 'true' }, icon('chevron', { size: 16 })));
  const root = h('div', { class: `ui-select${compact ? ' is-compact' : ''}${block ? ' is-block' : ''} ${className}`.trim() }, trigger, hidden);

  const find = (v) => items.find((o) => o.value === v);
  function paint() {
    const o = find(current);
    valueEl.replaceChildren();
    if (o) valueEl.append(...[renderValue ? renderValue(o) : o.label].flat());
    else if (current) valueEl.append(String(current));
    else valueEl.append(h('span', { class: 'ui-select-placeholder' }, placeholder));
    root.classList.toggle('has-value', Boolean(current));
    if (hidden) hidden.value = current;
  }

  // ---------- Lista ----------
  let pop = null;
  let list = null;
  let search = null;
  let visible = [];
  let active = -1;
  let typed = '';
  let typedAt = 0;

  function filtered() {
    const q = search ? fold(search.value.trim()) : '';
    if (!q) return items;
    return items.filter((o) => o.pinned || fold(`${o.label} ${o.group || ''} ${o.keywords || ''}`).includes(q));
  }

  function buildList() {
    visible = filtered();
    list.replaceChildren();
    let group = null;
    visible.forEach((o, i) => {
      if (o.group && o.group !== group && !o.pinned) {
        group = o.group;
        list.append(h('li', { class: 'ui-select-group', role: 'presentation' }, group));
      }
      const selected = o.value === current;
      const li = h('li', {
        id: `${uid}-opt-${i}`, role: 'option', class: `ui-select-option${selected ? ' is-selected' : ''}${o.pinned ? ' is-pinned' : ''}`,
        'aria-selected': String(selected), 'aria-disabled': o.disabled ? 'true' : null, dataset: { index: String(i) },
      },
      h('span', { class: 'ui-select-option-main' }, renderOption ? renderOption(o) : [h('span', { class: 'ui-select-option-label' }, o.label), o.hint ? h('small', { class: 'ui-select-option-hint' }, o.hint) : null]),
      h('span', { class: 'ui-select-check', 'aria-hidden': 'true' }, selected ? icon('check', { size: 15 }) : null));
      li.addEventListener('pointerdown', (e) => e.preventDefault()); // mantém o foco na busca/lista
      li.addEventListener('click', () => choose(i));
      li.addEventListener('pointermove', () => setActive(i, false));
      list.append(li);
    });
    if (!visible.length) list.append(h('li', { class: 'ui-select-empty', role: 'presentation' }, emptyText));
    const sel = visible.findIndex((o) => o.value === current);
    setActive(sel >= 0 ? sel : visible.findIndex((o) => !o.disabled), true);
  }

  function setActive(i, scroll = true) {
    active = i;
    for (const el of list.querySelectorAll('.is-active')) el.classList.remove('is-active');
    const el = i >= 0 ? list.querySelector(`#${CSS.escape(`${uid}-opt-${i}`)}`) : null;
    const host = search || list;
    if (el) {
      el.classList.add('is-active');
      host.setAttribute('aria-activedescendant', el.id);
      if (scroll) el.scrollIntoView({ block: 'nearest' });
    } else host.removeAttribute('aria-activedescendant');
  }

  function move(delta) {
    if (!visible.length) return;
    let i = active;
    for (let n = 0; n < visible.length; n += 1) {
      i = Math.min(visible.length - 1, Math.max(0, i + delta));
      if (!visible[i].disabled) break;
      if (i === 0 || i === visible.length - 1) break;
    }
    setActive(i);
  }

  function choose(i) {
    const o = visible[i];
    if (!o || o.disabled) return;
    close(true);
    if (o.value === current) return;
    current = o.value;
    paint();
    root.dispatchEvent(new Event('change', { bubbles: true }));
    onChange?.(current, o);
  }

  function place() {
    if (!pop) return;
    const r = trigger.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const sheet = vw < 560;
    pop.classList.toggle('is-sheet', sheet);
    if (sheet) { Object.assign(pop.style, { left: '', top: '', width: '', maxHeight: '' }); return; }
    const width = Math.min(Math.max(r.width, minWidth), vw - 16);
    let left = r.left;
    if (left + width > vw - 8) left = Math.max(8, r.right - width); // abre "para o lado de dentro"
    left = Math.max(8, Math.min(left, vw - width - 8));
    const below = vh - r.bottom - 8;
    const above = r.top - 8;
    const want = Math.min(340, pop.scrollHeight || 340);
    const up = below < want && above > below;
    const maxH = Math.max(160, Math.min(340, (up ? above : below) - 6));
    Object.assign(pop.style, { left: `${left}px`, width: `${width}px`, maxHeight: `${maxH}px` });
    pop.style.top = up ? `${Math.max(8, r.top - 6 - pop.offsetHeight)}px` : `${r.bottom + 6}px`;
    pop.classList.toggle('is-up', up);
  }

  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); } else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); } else if (e.key === 'PageDown') { e.preventDefault(); move(8); } else if (e.key === 'PageUp') { e.preventDefault(); move(-8); } else if (e.key === 'Home' && !search) { e.preventDefault(); setActive(0); } else if (e.key === 'End' && !search) { e.preventDefault(); setActive(visible.length - 1); } else if (e.key === 'Enter' || (e.key === ' ' && !search)) { e.preventDefault(); choose(active); } else if (e.key === 'Escape') { e.preventDefault(); close(true); } else if (e.key === 'Tab') { close(false); } else if (!search && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      const now = Date.now();
      typed = now - typedAt > 700 ? e.key : typed + e.key;
      typedAt = now;
      const i = visible.findIndex((o) => fold(o.label).startsWith(fold(typed)));
      if (i >= 0) setActive(i);
    }
  }

  const outside = (e) => { if (pop && !pop.contains(e.target) && !root.contains(e.target)) close(false); };
  const reposition = () => place();

  function open() {
    if (pop || trigger.disabled) return;
    openInstance?.close(false);
    openInstance = api;
    list = h('ul', { id: `${uid}-list`, role: 'listbox', class: 'ui-select-list', tabindex: '-1', 'aria-labelledby': labelledBy || uid });
    search = isSearchable ? h('input', { type: 'search', class: 'ui-select-search', placeholder: searchPlaceholder, autocomplete: 'off', spellcheck: 'false', 'aria-controls': `${uid}-list`, 'aria-label': searchPlaceholder, 'aria-autocomplete': 'list' }) : null;
    pop = h('div', { class: 'ui-select-pop', role: 'presentation' },
      search ? h('div', { class: 'ui-select-search-wrap' }, icon('search', { size: 15 }), search) : null, list);
    if (search) search.addEventListener('input', () => { buildList(); place(); });
    (search || list).addEventListener('keydown', onKey);
    document.body.append(pop);
    buildList();
    place();
    requestAnimationFrame(() => pop?.classList.add('is-open'));
    trigger.setAttribute('aria-expanded', 'true');
    root.classList.add('is-open');
    (search || list).focus({ preventScroll: true });
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
  }

  function close(focusTrigger) {
    if (!pop) return;
    document.removeEventListener('pointerdown', outside, true);
    window.removeEventListener('resize', reposition);
    window.removeEventListener('scroll', reposition, true);
    pop.remove();
    pop = null; list = null; search = null;
    if (openInstance === api) openInstance = null;
    trigger.setAttribute('aria-expanded', 'false');
    root.classList.remove('is-open');
    if (focusTrigger) trigger.focus({ preventScroll: true });
  }

  trigger.addEventListener('click', () => (pop ? close(true) : open()));
  trigger.addEventListener('keydown', (e) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(); }
  });

  const api = { close };
  Object.defineProperty(root, 'value', { get: () => current, set: (v) => { current = v ?? ''; paint(); } });
  root.setOptions = (next) => { items = next.map(normalize); paint(); if (pop) buildList(); };
  root.setInvalid = (bad) => { root.classList.toggle('is-invalid', Boolean(bad)); trigger.setAttribute('aria-invalid', bad ? 'true' : 'false'); };
  root.setDisabled = (d) => { trigger.disabled = Boolean(d); root.classList.toggle('is-disabled', Boolean(d)); };
  root.focus = () => trigger.focus();
  root.close = () => close(false);
  root.setInvalid(invalid);
  root.setDisabled(disabled);
  paint();
  return root;
}

// Fecha qualquer lista aberta quando a tela muda (ex.: troca de rota).
addEventListener('hashchange', () => openInstance?.close(false));
