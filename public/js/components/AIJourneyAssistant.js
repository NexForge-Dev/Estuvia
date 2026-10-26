// Mentor da jornada: chat contextual (jornada, rodada, missão, documentos, prazos, finanças).
// Disponível como painel flutuante em todas as telas e como página completa.
// Ações propostas pela IA só são executadas depois de um clique de confirmação do estudante.
import { h, mount, richText, sourceLink, toast } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { state, go, currentPath, invalidate } from '../app.js';
import { openMentor } from './MentorPanel.js';

// Ações rápidas: o estudante não precisa saber formular a pergunta.
export const QUICK = [
  ['agora', 'O que faço agora?'],
  ['naoentendi', 'Não entendi'],
  ['mostracomo', 'Me mostra como fazer'],
  ['semdocumento', 'Não tenho esse documento'],
  ['dificuldade', 'Estou com dificuldade'],
  ['custo', 'Quanto custa?'],
  ['depois', 'Posso fazer depois?'],
];
export const MORE = [
  ['simples', 'Explique mais simples'],
  ['documentos', 'Quais documentos preciso?'],
  ['economizar', 'Me ajude a economizar'],
  ['proximo', 'Qual meu próximo passo?'],
  ['bolsas', 'Quais bolsas posso solicitar?'],
  ['semdinheiro', 'Não tenho dinheiro suficiente'],
  ['apoio', 'Como comprovo apoio familiar?'],
  ['contato', 'Contato do coordenador'],
  ['email', 'E-mail em espanhol para a universidade'],
  ['vistodocs', 'O que falta para o visto?'],
  ['moradia', 'Moradia mais barata'],
  ['semana', 'Organize minha semana'],
  ['dua', 'Como me inscrevo no DUA?'],
  ['certificado', 'Preciso de certificado de espanhol?'],
];

// Conversa por jornada, só na memória da aba (AssistantConversation não é gravada no servidor).
const conversations = new Map();
export const resetChat = () => conversations.clear();
let pending = null; // pedido vindo de outra tela (ex.: botão "Estou com dificuldade" na missão)

// Os botões de ajuda de todas as telas abrem o Mentor Estuvia (MentorPanel, sessão do Mentor).
// Ações que o Mentor conhece vão como ação; as demais, como a própria pergunta em texto.
const MENTOR_ACTIONS = new Set(['agora', 'dificuldade', 'semana', 'documentos', 'orcamento', 'bolsas', 'simples', 'prazos']);
const MENTOR_ALIAS = { proximo: 'agora', semdinheiro: 'orcamento' };
export function openAssistant(ctx = {}) {
  const id = MENTOR_ALIAS[ctx.acao] || ctx.acao;
  const label = [...QUICK, ...MORE].find(([k]) => k === ctx.acao)?.[1];
  const ask = MENTOR_ACTIONS.has(id) ? { acao: id, rotulo: label } : ctx.pergunta || label ? { mensagem: ctx.pergunta || label } : {};
  return openMentor({ journeyId: ctx.journeyId, missaoId: ctx.missaoId, ...ask });
}

// Painel antigo (/api/assistant): mantido como alternativa, sem ponto de entrada na interface.
export function openLegacyAssistant(ctx) {
  pending = ctx;
  if (currentPath() === '/assistente') return document.dispatchEvent(new CustomEvent('padapal:ask'));
  openPanel();
}

// Contexto a partir da rota atual: /j/:jid/... e /j/:jid/m/:mid.
function routeContext() {
  const [, jid, mid] = /^\/j\/([\w-]+)(?:\/m\/(\d\.\d{1,2}))?/.exec(currentPath()) || [];
  return { journeyId: jid || state.journeys?.[0]?.id || state.me?.lastJourneyId || null, missaoId: mid || null };
}

async function runAction(a) {
  if (a.tipo === 'rota') { closePanel(); return go(a.rota); }
  if (a.tipo === 'organizar-semana') { closePanel(); return go('/agenda#organizar'); }
  if (a.tipo === 'salvar-bolsa') {
    try {
      await api.post('/finance/scholarships', { catalogId: a.catalogId });
      invalidate();
      toast('Bolsa salva. As tarefas de candidatura foram criadas e aparecem na Agenda AI.', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  }
}

export function AIJourneyAssistant({ compact = false } = {}) {
  // A tela atual vence um contexto antigo (ex.: painel aberto em outra missão).
  const route = Object.fromEntries(Object.entries(routeContext()).filter(([, v]) => v));
  const ctx = { ...(pending || {}), ...(currentPath().startsWith('/j/') ? route : {}) };
  if (!ctx.journeyId) ctx.journeyId = route.journeyId || null;
  const key = ctx.journeyId || 'geral';
  const history = conversations.get(key) || [];
  conversations.set(key, history);

  const j = ctx.journeyId ? state.jcache.get(ctx.journeyId) : null;
  const mission = j && ctx.missaoId ? j.rodadas.flatMap((r) => r.missoes).find((m) => m.id === ctx.missaoId) : null;
  const ctxBar = h('div', { class: 'ai-context' },
    icon('target', { size: 14 }),
    j ? h('span', {}, `${j.destino.universidade?.sigla || 'Jornada'} · Rodada ${j.rodadaAtual}${mission ? ` · Missão ${mission.label}` : ''}`) : h('span', {}, state.me?.user ? 'Contexto: suas jornadas e dados cadastrados' : ''),
    h('span', { class: 'ai-mode' }, state.app.ia === 'claude' ? 'IA ativa' : 'Modo base verificada'));

  const log = h('div', { class: 'ai-log', 'aria-live': 'polite' });
  const input = h('textarea', { rows: 1, maxlength: 1500, placeholder: 'Pergunte qualquer coisa sobre sua jornada…', 'aria-label': 'Sua pergunta' });
  const send = h('button', { class: 'btn btn-cta ai-send', type: 'submit', 'aria-label': 'Enviar' }, icon('send', { size: 16 }));
  const form = h('form', { class: 'ai-form' }, input, send);

  const bubble = (role, content) => {
    const el = h('div', { class: `ai-msg ${role}` }, role === 'assistant' ? h('span', { class: 'ai-avatar' }, icon('sparkles', { size: 14 })) : null, h('div', { class: 'ai-bubble' }));
    if (content) el.lastChild.append(richText(content));
    log.append(el);
    log.scrollTop = log.scrollHeight;
    return el.lastChild;
  };

  const name = state.me?.user?.profile?.apelido || '';
  if (!history.length) {
    bubble('assistant', `Oi${name ? `, ${name}` : ''}! Eu sou o **Mentor Estuvia**. Conheço sua jornada${j ? ` para a **${j.destino.universidade?.nome}**` : ''}, suas missões, prazos e finanças. Como posso ajudar agora?`);
  } else {
    history.forEach((m) => bubble(m.role, m.content));
  }

  async function ask({ pergunta, acao }) {
    const label = pergunta || [...QUICK, ...MORE].find(([k]) => k === acao)?.[1];
    bubble('user', label);
    const out = bubble('assistant', '');
    out.parentElement.classList.add('typing');
    let text = '';
    send.disabled = true;
    try {
      await api.ask({ pergunta, acao, journeyId: ctx.journeyId || undefined, missaoId: ctx.missaoId || undefined, historico: history.slice(-10) }, {
        onDelta: (t) => { text += t; out.replaceChildren(richText(text)); log.scrollTop = log.scrollHeight; },
        onReplace: (t) => { text = t; out.replaceChildren(richText(text)); },
        onDone: ({ fontes, acoes }) => {
          if (fontes?.length) out.append(h('div', { class: 'sources' }, h('span', { class: 'muted small' }, 'Fontes: '), fontes.map(sourceLink)));
          if (acoes?.length) {
            out.append(h('div', { class: 'ai-actions' }, acoes.map((a) => h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onClick: () => (a.tipo === 'perguntar' ? ask({ acao: a.acao }) : runAction(a)) }, icon(a.tipo === 'rota' ? 'arrow' : a.tipo === 'perguntar' ? 'chat' : 'wand', { size: 14 }), a.rotulo))));
            out.append(h('p', { class: 'hint' }, 'Nenhuma ação é executada sem o seu clique.'));
          }
        },
      });
      history.push({ role: 'user', content: label }, { role: 'assistant', content: text });
    } catch (e) {
      out.replaceChildren(h('p', {}, e.message));
    } finally {
      out.parentElement.classList.remove('typing');
      send.disabled = false;
      log.scrollTop = log.scrollHeight;
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (q.length < 2) return;
    input.value = '';
    ask({ pergunta: q });
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 140)}px`; });

  const chip = ([acao, label]) => h('button', { type: 'button', class: 'chip', onClick: () => ask({ acao }) }, label);
  const quick = h('div', { class: 'ai-quick' },
    h('div', { class: 'chips' }, QUICK.map(chip)),
    compact ? null : h('details', { class: 'ai-more' }, h('summary', {}, 'Mais perguntas'), h('div', { class: 'chips' }, MORE.map(chip))));

  const root = h('section', { class: `ai ${compact ? 'ai-compact' : 'ai-page'}` },
    h('header', { class: 'ai-head' },
      h('span', { class: 'ai-logo' }, icon('sparkles', { size: 20 })),
      h('div', {}, h('h2', {}, 'Mentor Estuvia'), h('p', { class: 'muted small' }, 'Orienta com base nos seus dados e em fontes oficiais. Não inventa prazos, requisitos ou regras.')),
      compact ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fechar assistente', onClick: closePanel }, icon('x', { size: 18 })) : null),
    ctxBar, log, quick, form,
  );

  const consume = () => { if (pending) { const p = pending; pending = null; if (p.acao || p.pergunta) ask(p); } };
  document.addEventListener('padapal:ask', () => { if (root.isConnected) { Object.assign(ctx, pending || {}); consume(); } });
  queueMicrotask(consume);
  return root;
}

// ---------- Painel flutuante ----------

let panel = null;
export function mountAssistantLauncher() {
  const host = document.getElementById('assistant-root');
  const show = Boolean(state.me) && currentPath() !== '/assistente';
  if (!show) { closePanel(); return mount(host); }
  if (host.querySelector('.ai-fab')) return;
  mount(host, h('button', { class: 'ai-fab', type: 'button', 'aria-label': 'Abrir Mentor Estuvia', onClick: () => openPanel() }, icon('sparkles', { size: 22 }), h('span', {}, 'Mentor')));
}

function openPanel() {
  closePanel();
  panel = h('div', { class: 'ai-drawer', role: 'dialog', 'aria-label': 'Mentor Estuvia' }, AIJourneyAssistant({ compact: true }));
  document.body.append(panel);
  requestAnimationFrame(() => panel.classList.add('open'));
  panel.querySelector('textarea')?.focus();
  document.addEventListener('keydown', escClose);
}
function closePanel() {
  if (!panel) return;
  const p = panel;
  panel = null;
  p.classList.remove('open');
  setTimeout(() => p.remove(), 200);
  document.removeEventListener('keydown', escClose);
}
const escClose = (e) => { if (e.key === 'Escape') closePanel(); };
