// Utilitários de interface. Todo texto vindo do usuário/servidor entra no DOM via
// textContent (nunca innerHTML), o que elimina XSS por construção.
import { translateTree } from './i18n.js';

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === false || value === null || value === undefined) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'value') el.value = value;
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, value);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function mount(root, ...children) {
  root.replaceChildren();
  append(root, children);
  translateTree(root);
}

// Markdown mínimo e seguro: **negrito**, _itálico_, [O1] → selo de fonte, listas e parágrafos.
export function richText(text) {
  const frag = document.createDocumentFragment();
  const blocks = String(text).split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n');
    const isList = lines.every((l) => /^\s*([-*]|\d+\.)\s+/.test(l));
    if (isList) {
      const ul = h('ul');
      lines.forEach((l) => ul.append(h('li', {}, inline(l.replace(/^\s*([-*]|\d+\.)\s+/, '')))));
      frag.append(ul);
    } else {
      const p = h('p');
      lines.forEach((l, i) => { if (i) p.append(h('br')); p.append(inline(l)); });
      frag.append(p);
    }
  }
  return frag;
}

function inline(text) {
  const frag = document.createDocumentFragment();
  const re = /(\*\*[^*]+\*\*|_[^_]+_|\[(?:O\d{1,2}|M)\])/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    frag.append(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) frag.append(h('strong', {}, tok.slice(2, -2)));
    else if (tok.startsWith('_')) frag.append(h('em', {}, tok.slice(1, -1)));
    else frag.append(h('span', { class: 'cite' }, tok.slice(1, -1)));
    last = m.index + tok.length;
  }
  frag.append(text.slice(last));
  return frag;
}

export const TAG_INFO = {
  verificado: { label: 'Fonte oficial verificada', cls: 'tag-ok' },
  pratica: { label: 'Orientação prática', cls: 'tag-info' },
  estimativa: { label: 'Estimativa', cls: 'tag-warn' },
  pendente: { label: 'Pendente de confirmação', cls: 'tag-pending' },
};

export const tag = (key) => {
  const t = TAG_INFO[key] || TAG_INFO.pratica;
  return h('span', { class: `tag ${t.cls}` }, t.label);
};

export function toast(message, kind = 'info') {
  const box = document.getElementById('toasts');
  const el = h('div', { class: `toast toast-${kind}`, role: 'status' }, message);
  box.append(el);
  setTimeout(() => el.classList.add('out'), 3200);
  setTimeout(() => el.remove(), 3700);
}

export function sourceLink(src) {
  if (!src) return null;
  return src.url
    ? h('a', { href: src.url, target: '_blank', rel: 'noopener noreferrer', class: 'source-link' }, `[${src.id}] ${src.titulo}`)
    : h('span', { class: 'source-link' }, `[${src.id}] ${src.titulo}`);
}

export const field = (label, input, hint) =>
  h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint ? h('small', { class: 'hint' }, hint) : null);

export const select = (name, options, current) =>
  h('select', { name }, options.map(([value, label]) => h('option', { value, selected: value === current }, label)));

export const formData = (form) => Object.fromEntries(new FormData(form).entries());
