// Central da missão: a página principal ORGANIZA; os cards dão acesso às ferramentas;
// as ferramentas orientam e executam; o progresso registra o que foi feito.
//
//   MissionOverviewHeader → Jornada / Rodada / Missão
//   MissionProgressCard   → objetivos reais (e qual ferramenta ajuda em cada um)
//   MissionToolsGrid      → cards por configuração (tools-config.js), quantidade conforme a complexidade
//   MissionCompletionFeedback → concluir quando os objetivos estiverem feitos / missão concluída
//   Cards fixos           → Minhas anotações (lembretes, tarefas, "preciso de ajuda"), Mentor e Experiências/fontes:
//                           a página fica só com cabeçalho, progresso e cards; o resto abre no painel.
// O passo a passo (MissionGuide) continua existindo, DENTRO da ferramenta "Passo a passo"/"Fazer agora".
// Abrir um card nunca conclui nada: só objetivos e a confirmação explícita contam.
import { h, mount, toast } from '../../ui.js';
import { icon } from '../../icons.js';
import { api } from '../../api.js';
import { fmtDate, showEvents } from '../common.js';
import { MissionGuide, LockedMission } from '../MissionGuide.js';
import { MissionDocuments } from '../documents/MissionDocuments.js';
import { MissionTool } from '../MissionTools.js';
import { QuickPlan } from '../QuickPlan.js';
import { openMentor } from '../MentorPanel.js';
import { hubIcon } from './hub-icons.js';
import { toolsFor } from './tools-config.js';
import { MissionNotes } from './MissionNotes.js';
import { SimulatorPanel, ProofPanel, MissionResourcePanel, AlternativesPanel, ScholarshipsPanel, financeHints } from './finance-panels.js';

function ensureStyles() {
  if (document.querySelector('link[data-mission-hub-css]')) return;
  document.head.append(h('link', { rel: 'stylesheet', href: '/css/mission-hub.css', 'data-mission-hub-css': '' }));
}

const FINANCE_PANELS = new Set(['simulador', 'comprovacao', 'dinheiro', 'alternativas', 'bolsas']);
const RESOLVED = new Set(['concluida', 'nao-aplicavel', 'ignorada']);
// A CSP bloqueia o atributo style inline: a largura é aplicada via CSSOM.
const fill = (attrs, pct) => { const el = h('span', attrs); el.style.width = `${Math.max(0, Math.min(100, pct))}%`; return el; };

// Ações rápidas do assistente antigo → mensagens que o Mentor entende.
const MENTOR_ACTIONS = new Set(['agora', 'dificuldade', 'semana', 'documentos', 'orcamento', 'bolsas', 'simples', 'prazos']);
const ACTION_TEXT = { naoentendi: 'Não entendi esta missão.', mostracomo: 'Me mostra como fazer.', depois: 'Posso fazer isso depois?', custo: 'Quanto isso custa?', semdocumento: 'Não tenho esse documento.', apoio: 'Como comprovo apoio financeiro familiar?', email: 'Prepare um e-mail para o coordenador do meu mestrado.', vistodocs: 'O que preciso preparar para o visto?', proximo: 'Qual é a minha próxima missão?', economizar: 'Me ajude a economizar nesta jornada.' };
export const mentorAsk = ({ journeyId, missaoId, acao, pergunta } = {}) => {
  if (acao && MENTOR_ACTIONS.has(acao)) return openMentor({ acao, journeyId, missaoId });
  const mensagem = pergunta || ACTION_TEXT[acao];
  return openMentor(mensagem ? { mensagem, journeyId, missaoId } : { journeyId, missaoId });
};

// ---------------------------------------------------------------------------
// Componentes
// ---------------------------------------------------------------------------

export function MissionOverviewHeader(m, journey) {
  const def = m.definicao;
  const destino = `${journey.destino.origem || 'Brasil'} → ${journey.destino.universidade?.nome || 'Espanha'}`;
  const rodada = def.rodadaSigla ? `Trilha ${def.rodadaSigla} - ${def.rodadaTitulo}` : `Rodada ${def.rodada} - ${def.rodadaTitulo}`;
  const item = (label, value, href) => h('div', { class: 'mh-head-item' }, h('small', {}, label), href ? h('a', { href }, value) : h('strong', {}, value));
  return h('header', { class: 'mh-card mh-head' },
    item('Jornada', destino, `#/j/${journey.id}`),
    item(def.rodadaSigla ? 'Trilha' : 'Rodada', rodada, `#/j/${journey.id}/r/${def.rodada}`),
    h('div', { class: 'mh-head-item is-main' }, h('small', {}, 'Missão'), h('strong', {}, `${m.label} - ${def.titulo}`)));
}

export function MissionProgressCard(m, { descricao, tools, onOpen }) {
  const total = m.objetivosTotal;
  const done = m.status === 'concluida' ? total : m.objetivosFeitos;
  const ratio = total ? done / total : m.status === 'concluida' ? 1 : 0;
  // Ferramenta ligada a um objetivo específico; o passo a passo ("*") só aparece no próximo objetivo pendente.
  const nextOpen = m.objetivos.find((o) => !o.feito)?.id;
  const via = (o) => tools.find((t) => Array.isArray(t.objetivos) && t.objetivos.includes(o.id)) || (o.id === nextOpen ? tools.find((t) => t.objetivos === '*') : null);
  return h('section', { class: 'mh-card mh-progress' },
    h('div', { class: 'mh-progress-top' },
      h('div', {}, h('small', { class: 'mh-eyebrow' }, 'Seu progresso nesta missão'),
        h('strong', { class: 'mh-progress-count' }, m.status === 'concluida' ? 'Missão concluída' : `${done} de ${total} objetivo${total === 1 ? '' : 's'} concluído${total === 1 ? '' : 's'}`)),
      h('span', { class: 'mh-progress-pct' }, `${Math.round(ratio * 100)}%`)),
    h('div', { class: 'mh-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': done, 'aria-label': 'Objetivos concluídos' }, fill({}, ratio * 100)),
    h('p', { class: 'mh-progress-desc' }, descricao || m.definicao.resumo || m.definicao.objetivo),
    total > 1 || m.objetivos.some((o) => o.tipo === 'auto') ? h('ul', { class: 'mh-goals' }, m.objetivos.map((o) => {
      const t = via(o);
      const feito = o.feito || m.status === 'concluida';
      return h('li', { class: feito ? 'done' : '' },
        h('span', { class: 'mh-goal-box' }, feito ? icon('check', { size: 12 }) : null),
        h('span', { class: 'mh-goal-text' }, o.texto),
        !feito && t ? h('button', { type: 'button', class: 'mh-goal-go', onClick: () => onOpen(t) }, t.titulo, ' ', icon('arrow', { size: 12 })) : null);
    })) : null);
}

export function MissionToolCard(t, { hint, onOpen, contributes }) {
  return h('button', { type: 'button', class: `mh-tool c-${t.cor} ${t.destaque ? 'is-primary' : ''}`, onClick: () => onOpen(t), 'aria-label': `${t.titulo}: ${t.desc}` },
    contributes ? h('span', { class: 'mh-tool-badge', title: 'Conta para o progresso da missão' }, icon('target', { size: 11 }), ' objetivo') : null,
    h('span', { class: 'mh-tool-ic' }, hubIcon(t.ic, { size: t.destaque ? 34 : 30 })),
    h('strong', { class: 'mh-tool-title' }, t.titulo),
    h('span', { class: 'mh-tool-desc' }, t.desc),
    hint ? h('span', { class: 'mh-tool-hint' }, hint) : null);
}

export function MissionToolsGrid(tools, { hints = {}, onOpen, m }) {
  const pending = new Set(m.objetivos.filter((o) => !o.feito).map((o) => o.id));
  return h('section', { class: `mh-grid n-${tools.length}`, 'aria-label': 'Ferramentas da missão' },
    tools.map((t) => MissionToolCard(t, { hint: hints[t.id], onOpen, contributes: Array.isArray(t.objetivos) && t.objetivos.some((id) => pending.has(id)) })));
}

export function MissionCompletionFeedback(m, ctx, base) {
  const journey = ctx.journey;
  const next = journey.proximaMissao && journey.proximaMissao.id !== m.id ? journey.proximaMissao : null;
  if (m.status === 'concluida') {
    return h('section', { class: 'mh-card mh-done' }, h('span', { class: 'mh-done-ic' }, icon('check', { size: 22 })),
      h('div', {}, h('strong', {}, m.conclusao === 'requisito-atendido' ? 'Requisito já atendido' : 'Missão concluída!'),
        h('p', {}, m.conclusao === 'requisito-atendido' ? 'Você informou que já tem isso. Se mudar, corrija em "Meu perfil".' : m.declarada ? 'Você informou que já tinha feito isso antes de usar a Estuvia.' : m.concluidaEm ? `Registrada em ${fmtDate(m.concluidaEm)}.` : '')),
      h('div', { class: 'row wrap' },
        next ? h('a', { class: 'btn btn-cta', href: `#/j/${journey.id}/m/${next.id}` }, `Próxima: ${next.label} ${next.titulo}`, ' ', icon('arrow', { size: 14 })) : h('a', { class: 'btn btn-ghost', href: `#/j/${journey.id}` }, 'Ver minha jornada'),
        m.conclusao !== 'requisito-atendido' ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => ctx.mutate(api.post(`${base}/reopen`, {})) }, icon('refresh', { size: 14 }), ' Reabrir') : null));
  }
  if (!m.podeConcluir) return null;
  const chk = h('input', { type: 'checkbox', id: 'mh-confirm' });
  const ev = m.evidencia ? h('input', { type: 'text', maxlength: 200, placeholder: m.evidencia.rotulo, 'aria-label': m.evidencia.rotulo }) : null;
  const btn = h('button', { type: 'button', class: 'btn btn-cta', disabled: true }, icon('trophy', { size: 16 }), ' Concluir missão');
  const sync = () => { btn.disabled = !chk.checked || Boolean(m.evidencia?.obrigatoria && !ev.value.trim()); };
  chk.addEventListener('change', sync);
  ev?.addEventListener('input', sync);
  btn.addEventListener('click', () => ctx.mutate(api.post(`${base}/complete`, { confirmo: true, ...(ev?.value.trim() ? { evidencia: ev.value.trim() } : {}) })));
  return h('section', { class: 'mh-card mh-finish' },
    h('div', {}, h('strong', {}, 'Tudo pronto para concluir'), h('p', { class: 'small' }, m.definicao.criterio)),
    ev ? h('label', { class: 'mh-form' }, h('span', {}, `${m.evidencia.rotulo}${m.evidencia.obrigatoria ? '' : ' (opcional)'}`), ev) : null,
    h('label', { class: 'check', for: 'mh-confirm' }, chk, h('span', {}, 'Confirmo que realizei o que esta missão pede.')),
    btn);
}

// ---------------------------------------------------------------------------
// Sheet (painel da ferramenta) — fica fora da página: redesenhar a missão não fecha a ferramenta
// ---------------------------------------------------------------------------

function openSheet({ title, eyebrow, ic, cor, onClose }) {
  const body = h('div', { class: 'mh-sheet-body' });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    root.classList.remove('open');
    document.removeEventListener('keydown', esc);
    window.removeEventListener('hashchange', close);
    setTimeout(() => root.remove(), 180);
    onClose?.();
  };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  const root = h('div', { class: 'mh-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'mh-sheet-card', tabindex: '-1' },
      h('header', { class: 'mh-sheet-head' },
        h('span', { class: `mh-tool-ic sm c-${cor}` }, hubIcon(ic, { size: 20 })),
        h('div', {}, h('small', { class: 'mh-eyebrow' }, eyebrow), h('h2', {}, title)),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fechar e voltar à missão', onClick: close }, icon('x', { size: 18 }))),
      body));
  root.addEventListener('click', (e) => { if (e.target === root) close(); });
  document.addEventListener('keydown', esc);
  window.addEventListener('hashchange', close);
  document.body.append(root);
  requestAnimationFrame(() => { root.classList.add('open'); root.querySelector('.mh-sheet-card').focus(); });
  return { body, close };
}

// ---------------------------------------------------------------------------
// Central
// ---------------------------------------------------------------------------

export function MissionHub(m, ctx) {
  ensureStyles();
  const { journey } = ctx;
  // Bloqueada: o servidor só envia a prévia; a tela de bloqueio existente explica o que falta.
  if (m.bloqueada) return LockedMission(m, journey, { onArrival: () => ctx.reload() });
  const def = m.definicao;
  const base = `/journeys/${journey.id}/missions/${m.id}`;
  const { descricao, ferramentas } = toolsFor(m);
  const active = !RESOLVED.has(m.status);
  // Missão que não se aplica ou foi pulada: só o essencial (e o caminho para voltar atrás, dentro do guia).
  // Concluída: as ferramentas continuam abertas (rever o plano, ajustar valores).
  const base_ = active || m.status === 'concluida' ? ferramentas : ferramentas.filter((t) => t.painel === 'guia').map((t) => ({ ...t, titulo: 'Detalhes da missão', desc: 'Ver ou mudar sua decisão.' }));
  // Tela limpa: tudo é card. Anotações, Mentor e Experiências/fontes sempre existem (o Mentor só uma vez).
  // Missão que usa documentos (ex.: 2.1 Passaporte): o que você consegue aqui vai para a Carteira (Documentos).
  const docsCard = (m.docsCarteira || m.documentos.length) && !base_.some((t) => t.painel === 'documentos') && m.status !== 'nao-aplicavel'
    ? { id: 'documentos-missao', painel: 'documentos', titulo: 'Documentos desta missão', desc: 'Guarde na sua Carteira: vale para todas as etapas.', ic: 'file', cor: 'verde' } : null;
  const tools = [
    ...base_.slice(0, 1), docsCard, ...base_.slice(1),
    { id: 'anotacoes', painel: 'anotacoes', titulo: 'Minhas anotações', desc: 'Lembretes, tarefas e dúvidas desta missão.', ic: 'edit', cor: 'amarelo' },
    base_.some((t) => t.painel === 'ajuda') ? null : { id: 'ajuda', painel: 'ajuda', titulo: 'Pergunte ao Mentor', desc: `Ele já sabe que você está na Missão ${m.label}.`, ic: 'chat', cor: 'roxo' },
    { id: 'comunidade', painel: 'comunidade', titulo: 'Experiências e fontes', desc: 'Relatos de outros estudantes e as fontes oficiais.', ic: 'users', cor: 'ciano' },
  ].filter(Boolean);
  const hints = {};
  const grid = h('div');
  const drawGrid = () => mount(grid, MissionToolsGrid(tools, { hints, onOpen: open, m }));

  // Dicas vivas nos cards (estado real, sem números inventados).
  const docsReady = m.documentos.filter((d) => ['pronto', 'enviado', 'nao-se-aplica'].includes(d.status)).length;
  for (const t of tools) {
    if (t.painel === 'guia') hints[t.id] = m.status === 'concluida' ? 'Concluída' : m.aguardando ? 'Aguardando resposta' : m.objetivosFeitos ? `${m.objetivosFeitos}/${m.objetivosTotal} feitos` : def.tempoEstimado;
    if (t.painel === 'documentos') hints[t.id] = `${docsReady}/${m.documentos.length} prontos`; // provisório até a contagem da carteira chegar
    if (t.painel === 'agenda') hints[t.id] = m.prazo ? `Prazo ${fmtDate(m.prazo.data)}` : null;
  }
  const notesOpen = (m.anotacoes || []).filter((n) => !n.feito && n.tipo !== 'nota').length;
  hints.anotacoes = (m.anotacoes || []).length ? `${m.anotacoes.length} anotaç${m.anotacoes.length === 1 ? 'ão' : 'ões'}${notesOpen ? ` · ${notesOpen} em aberto` : ''}` : null;
  hints.comunidade = m.fontes.length ? `${m.fontes.length} fonte${m.fontes.length === 1 ? '' : 's'}` : null;
  // Contagem da carteira: documentos "não necessários" pelo perfil não contam como pendência.
  if (tools.some((t) => t.painel === 'documentos')) {
    api.get(`/documents/missions/${journey.id}/${m.id}`).then((r) => {
      const total = r.prontos.length + r.faltam.length;
      for (const t of tools) if (t.painel === 'documentos') hints[t.id] = total ? `${r.prontos.length}/${total} prontos` : 'Nada pendente';
      drawGrid();
    }).catch(() => {});
  }
  if (tools.some((t) => FINANCE_PANELS.has(t.painel))) {
    financeHints().then((fh) => { for (const t of tools) if (fh[t.painel] !== undefined && fh[t.painel] !== null) hints[t.id] = fh[t.painel]; drawGrid(); }).catch(() => {});
  }

  // ---------- Abrir ferramenta ----------
  let dirty = false;
  const mentor = (pergunta) => mentorAsk({ journeyId: journey.id, missaoId: m.id, pergunta });
  function open(t) {
    if (t.painel === 'ajuda') return mentor();
    if (t.painel === 'link') { location.hash = `#${t.rota}`; return undefined; } // ferramenta com página própria (ex.: Minha viagem)
    ctx.state.hubOpen = t.id;
    const sheet = openSheet({ title: t.titulo, eyebrow: `Missão ${m.label}`, ic: t.ic, cor: t.cor, onClose: () => { ctx.state.hubOpen = null; if (dirty) { dirty = false; ctx.reload(); } } });
    const hub = {
      dirty: () => { dirty = true; },
      close: sheet.close,
      reopen: () => render(),
      mentor,
      // Botão que troca de ferramenta dentro da central (ex.: Alternativas → Meu dinheiro).
      button: (label, id, cls = 'btn btn-ghost') => h('button', { type: 'button', class: cls, onClick: () => { const next = tools.find((x) => x.painel === id || x.id === id) || toolsFor({ ...m, id: '1.5' }).ferramentas.find((x) => x.painel === id); sheet.close(); if (next) setTimeout(() => open(next), 200); } }, label, ' ', icon('arrow', { size: 14 })),
    };
    const render = async () => {
      mount(sheet.body, h('div', { class: 'mh-loading' }, icon('clock', { size: 16 }), ' Carregando…'));
      try { mount(sheet.body, await panel(t, hub)); } catch (e) { mount(sheet.body, h('p', { class: 'mh-notice' }, e.message)); }
    };
    render();
  }

  async function panel(t, hub) {
    switch (t.painel) {
      case 'simulador': return SimulatorPanel(m, ctx, hub);
      case 'comprovacao': return ProofPanel(m, ctx, hub);
      case 'dinheiro': return MissionResourcePanel(m, ctx, hub);
      case 'alternativas': return AlternativesPanel(m, ctx, hub);
      case 'bolsas': return ScholarshipsPanel(m, ctx, hub);
      case 'guia': return GuidePanel(m, ctx, hub);
      case 'oficial': return OfficialPanel(m, t);
      // Carteira de documentos (status pelo perfil, anexos cifrados, lembretes) — componente da frente de documentos.
      case 'documentos': return MissionDocuments({ journeyId: journey.id, missionId: m.id, onChange: () => hub.dirty() });
      case 'agenda': return AgendaPanel(m, ctx, hub);
      case 'ferramenta': return MissionTool(m, { journey, onChange: () => hub.dirty() }) || h('p', {}, 'Ferramenta indisponível.');
      case 'entender': return UnderstandPanel(m);
      case 'anotacoes': return MissionNotes(m, { journey, inSheet: true, onChange: () => hub.dirty(), onAskMentor: (pergunta) => { hub.close(); mentor(pergunta); } });
      case 'comunidade': return CommunityPanel(m, journey);
      default: return h('p', {}, 'Ferramenta indisponível.');
    }
  }

  // Reabre a ferramenta depois de um redesenho da página (ex.: após concluir um passo).
  if (ctx.state.hubOpen && !document.querySelector('.mh-sheet')) {
    const t = tools.find((x) => x.id === ctx.state.hubOpen);
    if (t) queueMicrotask(() => open(t));
  }

  // ---------- Alertas curtos (prazo e risco) ----------
  const alerts = [];
  if (m.prazo && m.status !== 'concluida') {
    const late = m.prazo.diasRestantes < 0;
    alerts.push(h('p', { class: `mh-alert ${late || m.prazo.diasRestantes <= 14 ? 'is-hot' : ''}` }, icon('calendar', { size: 14 }), ' ', late ? `O prazo era ${fmtDate(m.prazo.data)}. Confira no site oficial.` : `Prazo: ${fmtDate(m.prazo.data)}, faltam ${m.prazo.diasRestantes} dia(s) (${{ oficial: 'regra oficial', declarado: 'informado por você', previsto: 'previsão' }[m.prazo.origem] || ''}).`));
  }
  if (m.riscoInfo?.texto && m.riscoInfo.nivel !== 'baixo' && active) alerts.push(h('p', { class: 'mh-alert' }, icon('shield', { size: 14 }), ' ', h('strong', {}, 'Atenção: '), m.riscoInfo.texto));
  const other = m.alertas.filter((a) => a.tipo !== 'prazo');
  if (other.length && active) alerts.push(h('p', { class: 'mh-alert' }, icon('alert', { size: 14 }), ' ', other[0].texto));
  if (m.status === 'nao-aplicavel') alerts.push(h('p', { class: 'mh-alert' }, icon('minus', { size: 14 }), ' ', m.motivoNaoAplicavel || 'Esta missão não se aplica ao seu caso e não conta como pendência.'));
  if (m.status === 'ignorada') alerts.push(h('p', { class: 'mh-alert' }, icon('minus', { size: 14 }), ' Você decidiu pular esta missão (é opcional).'));
  if (m.status === 'aguardando') alerts.push(h('p', { class: 'mh-alert' }, icon('hourglass', { size: 14 }), ` Aguardando resposta de terceiros. Quando ela chegar, registre em "${tools.find((t) => t.painel === 'guia')?.titulo || 'Passo a passo'}".`));

  drawGrid();
  return h('article', { class: `mh g-${m.status}` },
    h('nav', { class: 'crumbs mh-crumbs', 'aria-label': 'Navegação' },
      h('a', { href: `#/j/${journey.id}` }, journey.destino.universidade?.sigla || 'Jornada'), icon('chevron', { size: 12, cls: 'crumb-sep' }),
      h('a', { href: `#/j/${journey.id}/r/${def.rodada}` }, def.rodadaSigla ? 'Financiamento' : `Rodada ${def.rodada}`), icon('chevron', { size: 12, cls: 'crumb-sep' }),
      h('span', { 'aria-current': 'page' }, `Missão ${m.label}`)),
    MissionOverviewHeader(m, journey),
    MissionProgressCard(m, { descricao, tools, onOpen: open }),
    alerts.length ? h('div', { class: 'mh-alerts' }, alerts) : null,
    MissionCompletionFeedback(m, ctx, base),
    grid);
}

// ---------------------------------------------------------------------------
// Painéis genéricos
// ---------------------------------------------------------------------------

/** Experiências de outros estudantes + fontes da missão (antes no rodapé da página). */
async function CommunityPanel(m, journey) {
  const stories = await api.get(`/community/missions/${m.id}?limit=5${journey.destino.universidade ? `&universidadeId=${journey.destino.universidade.id}` : ''}`).then((r) => r.relatos || []).catch(() => null);
  return h('div', { class: 'mh-panel' },
    h('div', { class: 'mh-section-head' }, h('h3', {}, icon('users', { size: 16 }), ' Experiências de outros estudantes'), h('a', { class: 'mh-link', href: `#/comunidade/missao/${m.id}` }, 'Compartilhar a minha')),
    stories === null ? h('p', { class: 'small muted' }, 'Relatos indisponíveis no momento.')
      : stories.length ? h('div', { class: 'mh-stories' }, stories.map((p) => h('a', { class: 'mh-story', href: p.url }, h('strong', {}, p.titulo), h('small', { class: 'muted' }, `${p.autorApelido} · ${fmtDate(p.criadoEm)}`))))
        : h('p', { class: 'small muted' }, 'Ainda não há relatos para esta missão.'),
    h('p', { class: 'mh-notice small' }, 'Relatos são experiências pessoais, não regra oficial.'),
    h('h3', { class: 'mh-sub' }, icon('shield', { size: 15 }), ` Fontes e detalhes (${m.fontes.length})`),
    m.fontes.length ? h('ul', { class: 'mh-source-list' }, m.fontes.map((s) => h('li', {}, s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.titulo, ' ', icon('external', { size: 11 })) : h('span', {}, s.titulo),
      h('small', { class: 'muted' }, ` ${s.orgao || ''}${s.revisadoEm ? ` · conferida em ${fmtDate(s.revisadoEm)}` : ''}`))))
      : h('p', { class: 'small muted' }, 'Esta missão não tem fontes cadastradas.'));
}

/** O guia passo a passo existente, dentro da ferramenta. Tem contexto próprio para redesenhar só o painel. */
function GuidePanel(m, ctx, hub) {
  const host = h('div', { class: 'mh-guide' });
  let mission = m;
  const gctx = {
    ...ctx,
    state: ctx.state.guide ??= {},
    inHub: true, // MissionGuide omite crumbs, ajuda e "mais ferramentas": a central já mostra
    openAssistant: (o) => mentorAsk(o),
    redraw: () => draw(),
    async mutate(promise) {
      try {
        const r = await promise;
        hub.dirty();
        mission = r.mission || (await api.get(`/journeys/${ctx.journey.id}/missions/${m.id}`)).mission;
        if (r.journey) gctx.journey = r.journey;
        draw();
        showEvents(r.events || []);
      } catch (e) { toast(e.message, 'err'); }
    },
    async reload() {
      hub.dirty();
      mission = (await api.get(`/journeys/${ctx.journey.id}/missions/${m.id}`)).mission;
      draw();
    },
    async saveDoc(id, status) { await api.put('/me/documents', { [id]: status }); await gctx.reload(); },
  };
  function draw() {
    mount(host, MissionGuide(mission, gctx));
  }
  draw();
  return host;
}

function OfficialPanel(m, t) {
  const def = m.definicao;
  const link = m.linkOficial;
  return h('div', { class: 'stack' },
    def.comoExecutar.length ? h('ol', { class: 'mh-steps' }, def.comoExecutar.map((c) => h('li', {}, h('strong', {}, c.titulo), h('p', {}, c.texto)))) : h('p', { class: 'mh-lead' }, def.objetivo),
    link?.url
      ? h('div', { class: 'mh-official' }, h('div', {}, h('strong', {}, link.rotulo), h('small', {}, `${link.orgao ? `${link.orgao}. ` : ''}Abre em outra aba: faça o procedimento lá e volte para registrar aqui.`)),
          h('a', { class: 'btn btn-cta', href: link.url, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir site oficial ', icon('external', { size: 13 })))
      : h('p', { class: 'mh-notice' }, icon('globe', { size: 14 }), ` ${t.id === 'solicitar' ? 'Passaporte é emitido pela Polícia Federal: procure "passaporte" no site gov.br/pf e faça o agendamento lá.' : 'Esta missão não tem um site oficial único: confira a fonte indicada em "Fontes e detalhes".'}`),
    h('p', { class: 'hint' }, 'Abrir o site não conclui a missão.'));
}

function UnderstandPanel(m) {
  const def = m.definicao;
  return h('div', { class: 'stack' },
    def.porque ? h('p', {}, h('strong', {}, 'Por que isso importa: '), def.porque) : null,
    m.resultado ? h('p', {}, h('strong', {}, 'Resultado esperado: '), m.resultado) : null,
    def.comoExecutar.length ? h('ol', { class: 'mh-steps' }, def.comoExecutar.map((c) => h('li', {}, h('strong', {}, c.titulo), h('p', {}, c.texto)))) : null,
    m.errosComuns?.length ? [h('p', {}, h('strong', {}, 'Erros comuns')), h('ul', { class: 'mh-list' }, m.errosComuns.map((e) => h('li', {}, icon('alert', { size: 13 }), ' ', e)))] : null);
}

// Agenda no contexto da missão: compromissos já marcados, organizar com IA e atividades sugeridas.
const FINANCE_TASKS = ['pesquisar bolsas de estudo', 'conferir a exigência financeira do visto', 'preparar os comprovantes financeiros', 'revisar meu orçamento'];
async function AgendaPanel(m, ctx, hub) {
  const host = h('div', { class: 'stack' });
  const d = await api.get('/planner');
  const mine = d.events.filter((e) => e.missaoId === m.id && e.journeyId === ctx.journey.id && e.data >= new Date().toISOString().slice(0, 10)).sort((a, b) => `${a.data}${a.inicio}`.localeCompare(`${b.data}${b.inicio}`));
  const plan = h('div');
  const finance = m.tipo === 'financeiro' || m.definicao.ferramenta === 'financeiro';
  mount(host,
    m.prazo ? h('p', { class: 'mh-alert' }, icon('calendar', { size: 14 }), ` Prazo: ${fmtDate(m.prazo.data)} (${m.prazo.origem === 'oficial' ? 'regra oficial' : m.prazo.origem === 'previsto' ? 'previsão' : 'informado por você'}).`) : null,
    h('div', {}, h('small', { class: 'mh-eyebrow' }, 'Já na sua agenda'),
      mine.length ? h('ul', { class: 'mh-list' }, mine.map((e) => h('li', {}, icon('calendar', { size: 13 }), ` ${fmtDate(e.data)} · ${e.inicio}–${e.fim} · ${e.titulo}`))) : h('p', { class: 'small muted' }, 'Nenhum horário reservado para esta missão.')),
    RESOLVED.has(m.status) ? null : h('div', { class: 'mh-plan' }, h('strong', {}, 'Organizar esta missão na minha semana'), plan),
    finance && !RESOLVED.has(m.status) ? h('div', {}, h('small', { class: 'mh-eyebrow' }, 'Atividades financeiras sugeridas'),
      h('ul', { class: 'mh-tasks' }, FINANCE_TASKS.map((t) => h('li', {}, h('span', {}, t.charAt(0).toUpperCase() + t.slice(1)),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => { hub.close(); mentorAsk({ journeyId: ctx.journey.id, missaoId: m.id, pergunta: `Agende para amanhã a tarefa de ${t}` }); } }, 'Agendar'))))) : null,
    h('a', { class: 'btn btn-ghost', href: '#/agenda' }, 'Abrir Agenda ', icon('arrow', { size: 14 })));
  if (!RESOLVED.has(m.status)) mount(plan, QuickPlan({ journeyId: ctx.journey.id, missaoId: m.id, onDone: () => hub.dirty() }));
  return host;
}
