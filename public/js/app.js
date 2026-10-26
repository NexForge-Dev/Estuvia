import { api } from './api.js';
import { h, mount, toast } from './ui.js';
import { icon } from './icons.js';
import { landingView } from './views/landing.js';
import { loginView, registerView } from './views/auth.js';
import { onboardingView } from './views/onboarding.js';
import { homeView } from './views/home.js';
import { journeysView } from './views/journeys.js';
import { journeyView } from './views/journey.js';
import { trailView } from './views/trail.js';
import { missionView } from './views/mission.js';
import { manualView } from './views/manual.js';
import { mentorPageView, mentorMemoryView, mountMentorLauncher, resetMentor } from './components/MentorPanel.js';
import { agendaView } from './views/agenda.js';
import { financeView } from './views/finance.js';
import { housingView } from './views/housing.js';
import { travelDashboardView } from './components/travel/TravelDashboard.js';
import { profileView } from './views/profile.js';
import { catalogView } from './views/catalog.js';
import { documentsView } from './views/documents.js';
import { sourcesView } from './views/sources.js';
import { resetChat } from './components/AIJourneyAssistant.js';

// Estado global: conteúdo público, estudante logado e caches das jornadas calculadas no servidor.
export const state = { app: null, content: null, me: null, journeys: null, jcache: new Map(), route: { path: '/', params: [] } };

export async function refreshMe() {
  try {
    state.me = await api.get('/me');
  } catch {
    state.me = null;
  }
  invalidate();
  applyPersonalization();
  return state.me;
}

// Qualquer mudança no perfil, finanças, moradia etc. pode alterar o estado das missões.
export function invalidate() {
  state.journeys = null;
  state.jcache.clear();
}

export async function loadJourneys() {
  if (!state.journeys) state.journeys = (await api.get('/journeys')).journeys;
  return state.journeys;
}

// O servidor recalcula a progressão ao abrir a jornada; se algo foi desbloqueado por outro módulo
// (documentos, finanças, perfil), os eventos chegam aqui e viram feedback visual.
export async function loadJourney(jid, { fresh = false } = {}) {
  if (fresh || !state.jcache.has(jid)) {
    const r = await api.get(`/journeys/${jid}`);
    state.jcache.set(jid, r.journey);
    if (r.events?.length) setTimeout(() => import('./components/common.js').then((m) => m.showEvents(r.events)), 400);
  }
  return state.jcache.get(jid);
}

// Conteúdo que só existe para quem tem conta (consulados, guias de cidade).
async function loadPrivateContent() {
  if (!state.me || state.content.privado) return;
  const places = await api.get('/content/places').catch(() => null);
  if (places) Object.assign(state.content, { cityGuides: places.cityGuides, consulates: places.consulates, privado: true });
}

export function cacheJourney(journey) {
  state.jcache.set(journey.id, journey);
  state.journeys = null;
}

export function setMe(data) {
  state.me = { ...state.me, ...data };
  invalidate();
  applyPersonalization();
  renderNav();
}

function applyPersonalization() {
  const p = state.me?.user?.profile || {};
  const root = document.documentElement;
  root.dataset.accent = p.cor || 'turquesa';
  root.dataset.theme = p.tema === 'claro' ? 'light' : 'dark';
}

// Telas de outros módulos carregadas sob demanda (ex.: Radar de Oportunidades, mantido por outra frente).
// Se o arquivo ainda não existir, mostra "em construção" em vez de quebrar a navegação.
const lazy = (file, name) => async (...args) => {
  let mod;
  try {
    mod = await import(file);
  } catch (err) {
    console.warn('[rota] módulo indisponível', file, err.message);
    return emptyState('Em construção', 'Este módulo ainda está sendo preparado.', h('a', { href: '#/', class: 'btn' }, 'Voltar ao início'), 'wand');
  }
  return mod[name](...args);
};

const routes = [
  { path: /^\/$/, view: () => (state.me ? homeView() : landingView()) },
  { path: /^\/sobre$/, view: landingView },
  { path: /^\/entrar$/, view: loginView, guestOnly: true },
  { path: /^\/cadastro$/, view: registerView, guestOnly: true },
  { path: /^\/manual$/, view: manualView, auth: true },
  { path: /^\/fontes$/, view: sourcesView, auth: true },
  { path: /^\/jornadas\/nova$/, view: onboardingView, auth: true },
  { path: /^\/jornadas$/, view: journeysView, auth: true },
  { path: /^\/j\/([\w-]+)$/, view: journeyView, auth: true },
  { path: /^\/j\/([\w-]+)\/r\/(\d)$/, view: trailView, auth: true },
  { path: /^\/j\/([\w-]+)\/m\/(\d\.\d{1,2})$/, view: missionView, auth: true },
  { path: /^\/(?:assistente|mentor)$/, view: mentorPageView, auth: true },
  { path: /^\/mentor\/memoria$/, view: mentorMemoryView, auth: true },
  { path: /^\/agenda$/, view: agendaView, auth: true },
  { path: /^\/financiamento$/, view: financeView, auth: true },
  { path: /^\/novo-lar$/, view: housingView, auth: true },
  { path: /^\/viagem$/, view: travelDashboardView, auth: true },
  { path: /^\/perfil$/, view: profileView, auth: true },
  { path: /^\/mestrados$/, view: catalogView, auth: true },
  { path: /^\/documentos(?:\/([\w-]+))?$/, view: documentsView, auth: true }, // /documentos/<id> abre o documento (Mentor, missões)
  { path: /^\/oportunidades$/, view: lazy('./views/radar.js', 'radarView'), auth: true },
  { path: /^\/oportunidades\/([\w-]+)$/, view: lazy('./views/radar.js', 'radarDetailView'), auth: true },
  { path: /^\/radar\/admin$/, view: lazy('./views/radar-admin.js', 'radarAdminView'), auth: true },
  { path: /^\/conquistas$/, view: lazy('./achievements.js', 'achievementsView'), auth: true },
  { path: /^\/comunidade(?:\/(post|grupos|grupo|radar|salvos|oportunidades|moderacao|missao)(?:\/([\w.-]+))?)?$/, view: lazy('./views/community.js', 'communityView'), auth: true },
];

// Avisa conquistas novas (módulo de Conquistas) depois de mutações que mudam fatos. Nunca lança erro.
export async function checkAchievements() {
  try { (await import('./achievements.js')).checkAchievements?.(); } catch { /* módulo opcional */ }
}

export const go = (path) => { location.hash = `#${path}`; };
export const currentPath = () => location.hash.replace(/^#/, '').split('#')[0] || '/';
export const currentAnchor = () => location.hash.split('#')[2] || null;

async function render() {
  const path = currentPath();
  const route = routes.find((r) => r.path.test(path));
  const main = document.getElementById('app');
  closeSidebar();
  if (!route) return mount(main, emptyState('Página não encontrada', 'O endereço que você abriu não existe.', h('a', { href: '#/', class: 'btn' }, 'Ir para o início')));
  if (route.auth && !state.me) return go('/entrar');
  if (route.guestOnly && state.me) return go('/');
  await loadPrivateContent();
  const params = path.match(route.path).slice(1);
  state.route = { path, params };
  renderNav();
  mountMentorLauncher();

  const slow = setTimeout(() => mount(main, skeleton()), 120);
  try {
    const el = await route.view(...params);
    clearTimeout(slow);
    if (currentPath() !== path) return; // o usuário já navegou para outra tela
    el.classList?.add('page-enter');
    mount(main, el);
  } catch (err) {
    clearTimeout(slow);
    if (err.status === 401) { state.me = null; return go('/entrar'); }
    mount(main, emptyState(err.status === 404 ? 'Não encontrado' : 'Não foi possível carregar', err.message,
      h('button', { class: 'btn', type: 'button', onClick: render }, icon('refresh', { size: 16 }), 'Tentar novamente'), 'alert'));
  }
  const anchor = currentAnchor();
  if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  else window.scrollTo(0, 0);
  main.focus({ preventScroll: true });
}

export const rerender = render;

export function skeleton() {
  return h('div', { class: 'stack-lg', 'aria-busy': 'true', 'aria-label': 'Carregando' },
    h('div', { class: 'skeleton sk-hero' }),
    h('div', { class: 'grid-3' }, h('div', { class: 'skeleton sk-card' }), h('div', { class: 'skeleton sk-card' }), h('div', { class: 'skeleton sk-card' })),
    h('div', { class: 'skeleton sk-tall' }),
  );
}

export function emptyState(title, text, action, iconName = 'compass') {
  return h('section', { class: 'empty' },
    h('span', { class: 'empty-icon' }, icon(iconName, { size: 28 })),
    h('h2', {}, title),
    text ? h('p', { class: 'muted' }, text) : null,
    action || null,
  );
}

// Menu enxuto: o essencial à vista, o resto em "Mais" (aberto automaticamente quando a tela atual está lá).
const NAV = [
  { href: '/', label: 'Início', icon: 'home', match: (p) => p === '/' },
  { href: '/jornadas', label: 'Minha jornada', icon: 'map', match: (p) => p.startsWith('/jornadas') || p.startsWith('/j/') },
  { href: '/agenda', label: 'Agenda', icon: 'calendar' },
  { href: '/documentos', label: 'Documentos', icon: 'file' },
  { href: '/financiamento', label: 'Financiamento', icon: 'euro' },
];
const NAV_MORE = [
  { href: '/novo-lar', label: 'Meu novo lar', icon: 'home2' },
  { href: '/viagem', label: 'Viagem', icon: 'plane' },
  { href: '/mestrados', label: 'Mestrados', icon: 'cap' },
  { href: '/oportunidades', label: 'Oportunidades', icon: 'globe' },
  { href: '/comunidade', label: 'Comunidade', icon: 'users' },
  { href: '/conquistas', label: 'Conquistas', icon: 'trophy' },
  { href: '/assistente', label: 'Mentor IA', icon: 'chat' },
  { href: '/manual', label: 'Manual', icon: 'book' },
];

function renderNav() {
  const path = currentPath();
  const nav = document.getElementById('nav');
  const foot = document.getElementById('sidebar-foot');
  const top = document.getElementById('topbar-actions');
  const tabbar = document.getElementById('tabbar');
  document.body.classList.toggle('has-tabbar', !!state.me);
  if (state.me) {
    const p = state.me.user.profile;
    const isActive = (n) => (n.match ? n.match(path) : path.startsWith(n.href));
    const item = (n) => {
      const active = isActive(n);
      return h('li', {}, h('a', { href: `#${n.href}`, class: active ? 'active' : '', 'aria-current': active ? 'page' : false }, icon(n.icon, { size: 18 }), h('span', {}, n.label)));
    };
    const wasOpen = nav.querySelector('.nav-more')?.open;
    mount(nav, h('div', {},
      h('ul', {}, NAV.map(item)),
      h('details', { class: 'nav-more', open: wasOpen || NAV_MORE.some(isActive) },
        h('summary', {}, 'Mais'),
        h('ul', {}, NAV_MORE.map(item)))));
    // Celular: barra inferior com os 4 atalhos principais; "Menu" abre a lateral completa.
    tabbar.hidden = false;
    mount(tabbar,
      NAV.slice(0, 4).map((n) => h('a', { href: `#${n.href}`, class: isActive(n) ? 'active' : '', 'aria-current': isActive(n) ? 'page' : false }, icon(n.icon, { size: 20 }), h('span', {}, n.label.replace('Minha ', '')))),
      h('button', { type: 'button', class: NAV_MORE.some(isActive) ? 'active' : '', 'aria-label': 'Abrir menu completo', onClick: openSidebar }, icon('menu', { size: 20 }), h('span', {}, 'Menu')));
    mount(foot, h('a', { href: '#/perfil', class: `me-card ${path === '/perfil' ? 'active' : ''}` },
      h('span', { class: 'avatar' }, p.avatar || '🎓'),
      h('span', { class: 'me-text' }, h('strong', {}, p.apelido || p.nome), h('small', {}, 'Meu perfil'))));
    mount(top, h('a', { class: 'icon-btn', href: '#/perfil', 'aria-label': 'Meu perfil' }, h('span', { class: 'avatar sm' }, p.avatar || '🎓')));
  } else {
    tabbar.hidden = true;
    mount(nav, h('ul', {},
      [['/', 'Início', 'home'], ['/entrar', 'Entrar', 'user'], ['/cadastro', 'Criar conta', 'sparkles']].map(([href, label, ic]) =>
        h('li', {}, h('a', { href: `#${href}`, class: path === href ? 'active' : '' }, icon(ic, { size: 18 }), h('span', {}, label))))));
    mount(foot, h('div', { class: 'stack' }, h('a', { href: '#/cadastro', class: 'btn btn-cta btn-block' }, 'Criar conta grátis'), h('a', { href: '#/entrar', class: 'btn btn-ghost btn-block' }, 'Entrar')));
    mount(top, h('a', { href: '#/entrar', class: 'btn btn-sm btn-ghost' }, 'Entrar'));
  }
}

function openSidebar() {
  document.body.classList.add('nav-open');
  document.getElementById('scrim').hidden = false;
  document.getElementById('menu-btn').setAttribute('aria-expanded', 'true');
}
function closeSidebar() {
  document.body.classList.remove('nav-open');
  document.getElementById('scrim').hidden = true;
  document.getElementById('menu-btn').setAttribute('aria-expanded', 'false');
}

export async function logout() {
  await api.post('/auth/logout').catch(() => {});
  state.me = null;
  state.content.privado = false;
  invalidate();
  resetChat();
  resetMentor();
  applyPersonalization();
  toast('Até logo! Sua jornada fica salva.');
  go('/');
}

async function boot() {
  document.getElementById('menu-btn').addEventListener('click', () => (document.body.classList.contains('nav-open') ? closeSidebar() : openSidebar()));
  document.getElementById('scrim').addEventListener('click', closeSidebar);
  const [app, content] = await Promise.all([api.get('/content/app'), api.get('/content/journey')]);
  state.app = app;
  state.content = { ...content };
  document.getElementById('brand-name').textContent = app.nome;
  await refreshMe();
  window.addEventListener('hashchange', render);
  render();
}

boot().catch(() => mount(document.getElementById('app'),
  emptyState('Plataforma indisponível', 'Não foi possível conectar ao servidor. Verifique se ele está rodando e recarregue a página.', null, 'alert')));
