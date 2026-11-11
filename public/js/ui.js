// Utilitários de interface. Todo texto vindo do usuário/servidor entra no DOM via
// textContent (nunca innerHTML), o que elimina XSS por construção.
import { translateTree } from './i18n.js';
import { icon } from './icons.js';

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

// Toasts: sucesso, erro, atenção e informação. Compatível com as chamadas antigas (toast(msg, 'ok'|'err'|'info')).
// Erros ficam mais tempo e usam role="alert"; passar o mouse ou focar pausa o tempo; no máximo 4 na tela.
const TOAST_KIND = {
  ok: { cls: 'success', icon: 'check', titulo: 'Tudo certo' }, success: { cls: 'success', icon: 'check', titulo: 'Tudo certo' },
  err: { cls: 'error', icon: 'alert', titulo: 'Algo deu errado' }, error: { cls: 'error', icon: 'alert', titulo: 'Algo deu errado' },
  warn: { cls: 'warning', icon: 'alert', titulo: 'Atenção' }, warning: { cls: 'warning', icon: 'alert', titulo: 'Atenção' },
  info: { cls: 'info', icon: 'help', titulo: null },
};
export function toast(message, kind = 'info', { title, duration } = {}) {
  const box = document.getElementById('toasts');
  if (!box) return null;
  const k = TOAST_KIND[kind] || TOAST_KIND.info;
  const ms = duration ?? (k.cls === 'error' ? 6500 : 4200);
  const close = h('button', { type: 'button', class: 'toast-close', 'aria-label': 'Fechar aviso' }, icon('x', { size: 14 }));
  const el = h('div', { class: `toast toast-${k.cls}`, role: k.cls === 'error' ? 'alert' : 'status' },
    h('span', { class: 'toast-icon', 'aria-hidden': 'true' }, icon(k.icon, { size: 16 })),
    h('div', { class: 'toast-body' }, title ? h('strong', { class: 'toast-title' }, title) : null, h('span', { class: 'toast-text' }, message)),
    close,
    h('span', { class: 'toast-timer', 'aria-hidden': 'true' }));
  el.style.setProperty('--toast-ms', `${ms}ms`); // CSSOM: o CSP (style-src 'self') bloqueia atributos style=""
  let left = ms;
  let started = Date.now();
  let timer = null;
  const dismiss = () => {
    clearTimeout(timer);
    if (el.classList.contains('out')) return;
    el.classList.add('out');
    setTimeout(() => el.remove(), 220);
  };
  const run = () => { started = Date.now(); el.classList.remove('paused'); timer = setTimeout(dismiss, left); };
  const pause = () => { clearTimeout(timer); left -= Date.now() - started; el.classList.add('paused'); };
  close.addEventListener('click', dismiss);
  el.addEventListener('mouseenter', pause);
  el.addEventListener('mouseleave', run);
  el.addEventListener('focusin', pause);
  el.addEventListener('focusout', run);
  while (box.children.length >= 4) box.firstElementChild.remove();
  box.append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  run();
  return { dismiss };
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
