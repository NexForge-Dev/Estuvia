// Movimento da interface: transição entre telas, entrada escalonada dos blocos, barras/anéis que
// "enchem" e números que sobem. Tudo respeita prefers-reduced-motion e anima só transform/opacity
// (ou stroke-dashoffset, que é barato). Sem atributos style="" (CSP): CSSOM e Web Animations API.
import { h } from './ui.js';

// Folha de estilo do movimento (tokens, microinterações, vidro fosco). Carregada aqui para não mexer no <head>.
if (!document.querySelector('link[data-motion-css]')) {
  document.head.append(h('link', { rel: 'stylesheet', href: '/css/motion.css', 'data-motion-css': '' }));
}

const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
export const reduced = () => !!mq?.matches;

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

// Troca o conteúdo da tela. Com View Transitions: a tela antiga some e a nova entra suave (css/motion.css).
// `update` faz a troca de DOM (e a rolagem), para que o "antes" e o "depois" fiquem corretos.
export async function swapView(update) {
  if (reduced() || typeof document.startViewTransition !== 'function' || document.visibilityState === 'hidden') {
    update();
    return;
  }
  let ran = false;
  let vt;
  try {
    vt = document.startViewTransition(() => { ran = true; update(); });
  } catch {
    if (!ran) update(); // navegador recusou a transição: troca direto
    return;
  }
  vt.ready.catch(() => {}); // transição pulada (ex.: outra navegação logo em seguida) não é erro
  vt.finished.catch(() => {});
  await vt.updateCallbackDone; // erro dentro de update() chega a quem chamou, como sem transição
}

// Blocos de primeiro nível da tela entram em sequência (fade + 10px para cima).
// Grades (cards lado a lado) entram card a card. Só o que está visível anima; o resto já aparece pronto.
const GRID = '.grid-2, .grid-3, .home-grid, .alerts';
function staggerTargets(root) {
  let top = root;
  while (top.children.length === 1 && top.firstElementChild.children.length > 1) top = top.firstElementChild;
  const out = [];
  for (const child of top.children) {
    if (child.matches(GRID)) out.push(...child.children);
    else out.push(child);
  }
  return out;
}

export function enter(root) {
  if (!root?.animate || reduced()) return;
  if (root.querySelector('.lp-reveal')) { fillMeters(root); return; } // landing tem o próprio "aparecer ao rolar"
  let i = 0;
  for (const el of staggerTargets(root)) {
    if (i >= 10) break;
    const r = el.getBoundingClientRect();
    if (r.height === 0 || r.top > window.innerHeight) continue;
    el.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
      { duration: 460, delay: 30 + i * 45, easing: EASE, fill: 'backwards' });
    i += 1;
  }
  fillMeters(root);
}

// Barras de progresso enchem da esquerda; anéis giram até o valor; porcentagens contam até o número.
const BARS = '.bar-fill, .rc-bar-fill, .rd-bar-fill, .prf-meter-fill, .tv-bar > span';
export function fillMeters(root) {
  if (!root || reduced() || !root.animate) return;
  root.querySelectorAll(BARS).forEach((el) => {
    el.style.transformOrigin = 'left center';
    el.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 900, delay: 150, easing: EASE, fill: 'backwards' });
  });
  root.querySelectorAll('svg.ring .ring-value').forEach((c) => {
    const to = Number.parseFloat(c.getAttribute('stroke-dashoffset'));
    const from = Number.parseFloat(c.getAttribute('stroke-dasharray'));
    if (!Number.isFinite(to) || !Number.isFinite(from)) return;
    c.animate([{ strokeDashoffset: from }, { strokeDashoffset: to }], { duration: 1100, delay: 150, easing: EASE, fill: 'backwards' });
  });
  root.querySelectorAll('.jh-ring-label strong, [data-countup]').forEach(countUp);
}

export function countUp(el) {
  // "42%", "6,4%", "€ 120": anima só números simples (até 1 casa decimal); o resto fica como está.
  const m = /^(\D*?)(\d{1,4})(?:([.,])(\d))?(\D*)$/.exec(el.textContent.trim());
  if (!m || reduced()) return;
  const [, pre, int, sep, dec, post] = m;
  const target = Number(`${int}.${dec || 0}`);
  if (!target) return;
  const final = el.textContent;
  const t0 = performance.now();
  const dur = 900;
  el.setAttribute('aria-label', final.trim()); // leitores de tela leem o valor final, não a contagem
  const step = (now) => {
    if (!el.isConnected) return;
    const p = Math.min(1, (now - t0) / dur);
    const v = target * (1 - (1 - p) ** 3);
    el.textContent = p >= 1 ? final : `${pre}${sep ? v.toFixed(1).replace('.', sep) : Math.round(v)}${post}`;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Placeholder com brilho para carregamentos dentro de painéis (no lugar do "Carregando…" solto).
export function skeletonLines(n = 3, label = 'Carregando') {
  return h('div', { class: 'sk-lines', 'aria-busy': 'true', role: 'status', 'aria-label': label },
    Array.from({ length: n }, () => h('span', { class: 'skeleton sk-line' })));
}
