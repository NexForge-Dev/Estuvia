// Painel do administrador.
// #/admin            → alunos (indicadores, filtros, quem está online); cada seção da lateral é uma rota:
// #/admin/inscricoes · /uso · /ia · /eventos · /status (serviços e chaves) · /logs (logs do servidor).
// #/admin/aluno/:id  → acompanhamento completo de um estudante (jornadas, inscrição, documentos, finanças…).
import { h, mount, toast } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { currentPath } from '../app.js';

const fmtDT = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const fmtDate = (d) => (d ? new Date(d.length === 10 ? `${d}T12:00:00Z` : d).toLocaleDateString('pt-BR') : '—');
const fmtDay = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const fmtEUR = (n) => (n == null ? '—' : `€ ${Math.round(n).toLocaleString('pt-BR')}`);
const fmtMoney = (n, moeda = 'EUR') => (n == null ? '—' : `${moeda === 'EUR' ? '€' : moeda === 'BRL' ? 'R$' : moeda} ${Number(n).toLocaleString('pt-BR')}`);

export function relTime(iso) {
  if (!iso) return 'nunca';
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 30 * 86400) return `há ${Math.floor(s / 86400)} d`;
  return fmtDT(iso);
}
const daysLabel = (n) => (n == null ? '—' : n === 0 ? 'hoje' : n === 1 ? '1 dia' : `${n} dias`);

const EVENT = {
  register: ['Cadastro', 'ok'], login: ['Entrou', 'ok'], 'login-failed': ['Login falhou', 'bad'], 'login-blocked': ['Login de conta suspensa', 'bad'],
  'password-changed': ['Trocou a senha', 'info'], 'account-deleted': ['Excluiu a conta', 'bad'], 'admin-created': ['Conta admin criada', 'info'],
  'admin-password-synced': ['Senha admin atualizada pelo .env', 'info'], 'admin-block': ['Admin suspendeu conta', 'bad'], 'admin-unblock': ['Admin reativou conta', 'info'],
  'admin-logout-user': ['Admin encerrou sessões', 'info'], 'admin-ai-check': ['Admin testou a IA', 'info'], 'admin-status-check': ['Admin verificou o status', 'info'], 'community-moderation': ['Moderação da comunidade', 'info'],
  'community-verification': ['Verificação na comunidade', 'info'], 'community-opportunity-change': ['Oportunidade alterada', 'info'],
  'journey.round-unlocked': ['Rodada desbloqueada', 'ok'], 'requirements.updated': ['Atualizou requisitos', 'info'],
};
const eventLabel = (a) => EVENT[a] || [a, 'info'];
const device = (d) => (d ? `${d.browser} · ${d.os} · ${d.device}` : '—');

// Tons das situações (candidatura, matrícula, visto, documentos).
const TONE = {
  candidatura: { admitido: 'ok', aguardando: 'info', 'lista-espera': 'warn', 'exige-acao': 'bad', 'nao-admitido': 'bad', 'nao-enviada': 'muted' },
  matricula: { matriculado: 'ok', 'vaga-confirmada': 'ok', reservada: 'info', 'nao-iniciada': 'muted' },
  visto: { aprovado: 'ok', apresentada: 'info', 'em-analise': 'info', 'doc-adicional': 'warn', indeferido: 'bad', preparacao: 'muted' },
  doc: { pronto: 'ok', enviado: 'ok', 'em-preparacao': 'info', correcao: 'bad', pendente: 'muted', 'nao-se-aplica': 'muted' },
  alerta: { alto: 'bad', medio: 'warn', baixo: 'muted' },
};
const tag = (text, tone = 'info') => h('span', { class: `adm-tag adm-tag-${tone}` }, text);
const stat = (value, label, tone) => h('div', { class: `rd-stat ${tone ? `adm-stat-${tone}` : ''}` }, h('strong', {}, String(value)), h('span', {}, label));
const dot = (online) => h('span', { class: `adm-dot ${online ? 'on' : ''}`, 'aria-label': online ? 'online' : 'offline', title: online ? 'Online agora' : 'Offline' });
const panel = (title, iconName, ...children) => h('section', { class: 'rd-panel' }, h('h2', {}, icon(iconName, { size: 18 }), title), ...children);
const empty = (text) => h('p', { class: 'muted small' }, text);
const table = (heads, rows) => h('div', { class: 'rd-table-wrap' }, h('table', { class: 'rd-table' },
  h('thead', {}, h('tr', {}, heads.map((x) => h('th', {}, x)))), h('tbody', {}, rows)));
const dl = (pairs) => h('dl', { class: 'adm-info' }, pairs.filter(Boolean).map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v instanceof Node ? v : String(v ?? '—')))));

// Barra de progresso (largura via CSSOM: a CSP não permite atributo style inline).
function meter(pct, cls = '') {
  const fill = h('span');
  fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  return h('div', { class: `adm-meter ${cls}`, 'aria-hidden': 'true' }, fill);
}

// Barras finas, uma por dia; o rótulo de cada barra aparece no hover/foco e para leitores de tela.
function activityChart(dias) {
  const max = Math.max(1, ...dias.map((d) => d.ativos));
  return h('figure', { class: 'adm-chart' },
    h('div', { class: 'adm-bars', role: 'list' }, dias.map((d) => {
      const label = `${fmtDay(d.dia)}: ${d.ativos} ativo(s), ${d.cadastros} cadastro(s)`;
      const fill = h('span');
      fill.style.height = `${d.ativos ? Math.max(4, (d.ativos / max) * 100) : 0}%`;
      return h('div', { class: 'adm-bar', role: 'listitem', tabindex: '0', 'aria-label': label, 'data-tip': label }, fill);
    })),
    h('figcaption', { class: 'adm-axis small muted' }, h('span', {}, fmtDay(dias[0].dia)), h('span', {}, `máx. ${max}/dia`), h('span', {}, 'hoje')));
}

const fmtDur = (seg) => (seg == null ? '—' : seg < 60 ? `${seg} s` : seg < 3600 ? `${Math.floor(seg / 60)} min ${String(seg % 60).padStart(2, '0')} s` : `${Math.floor(seg / 3600)} h ${Math.floor((seg % 3600) / 60)} min`);

// Ranking de módulos: barra horizontal = parcela dos acessos; números em texto ao lado.
function usageTable(uso) {
  if (!uso.modulos.length) return empty('Ainda não há acessos registrados neste período. Os dados aparecem conforme os estudantes navegam pela plataforma.');
  const max = uso.modulos[0].acessos;
  return table(['Módulo', 'Acessos', 'Pessoas', 'Tempo médio'], uso.modulos.map((m) => h('tr', {},
    h('td', {}, h('strong', {}, m.nome), meter((m.acessos / max) * 100)),
    h('td', {}, String(m.acessos), h('small', { class: 'muted' }, ` · ${(m.parcela * 100).toFixed(1).replace('.', ',')}%`)),
    h('td', {}, String(m.pessoas)),
    h('td', {}, fmtDur(m.tempoMedioSeg)))));
}

function eventsTable(eventos) {
  if (!eventos.length) return empty('Nenhum evento registrado ainda.');
  return table(['Quando', 'Evento', 'Conta', 'IP', 'Dispositivo'], eventos.map((e) => {
    const [label, tone] = eventLabel(e.action);
    return h('tr', {},
      h('td', { title: fmtDT(e.at) }, relTime(e.at)),
      h('td', {}, tag(label, tone)),
      h('td', { class: 'small' }, e.email || '—'),
      h('td', { class: 'small' }, e.ip || '—'),
      h('td', { class: 'small muted' }, device(e.dispositivo)));
  }));
}

const restricted = (e) => h('section', { class: 'rd-empty' }, icon('lock', { size: 26 }), h('h2', {}, 'Acesso restrito'), h('p', { class: 'muted' }, e.message),
  h('p', { class: 'small muted' }, 'Entre com a conta definida em ADMIN_EMAIL / ADMIN_PASSWORD no .env do servidor.'));

// ---------- IA ----------

function aiServiceCard(titulo, s, teste) {
  const modo = titulo === 'Mentor'
    ? (s.ativo ? tag('IA ativa', 'ok') : s.problemaConfig ? tag('Problema na configuração', 'bad') : tag('Modo Guiado (sem IA)', 'muted'))
    : (s.ativo ? tag('IA ativa', 'ok') : tag('Modo offline (sem IA)', 'muted'));
  const u = s.uso || {};
  const total = (u.ok || 0) + (u.erro || 0);
  const taxa = total ? Math.round(((u.erro || 0) / total) * 100) : null;
  return h('div', { class: 'adm-ai-card' },
    h('div', { class: 'row wrap adm-detail-head' }, h('h3', {}, titulo), modo),
    s.problemaConfig ? h('div', { class: 'adm-alert' }, icon('alert', { size: 16 }), h('span', {}, s.problemaConfig)) : null,
    dl([
      ['Modelo', s.modelo || '—'],
      ['Chave', s.chave || 'não definida'],
      s.baseUrl ? ['Servidor', s.baseUrl] : null,
      ['Respostas com IA', u.ok || 0],
      ['Falhas da IA', `${u.erro || 0}${taxa != null ? ` (${taxa}%)` : ''}`],
      titulo === 'Mentor' ? ['Respostas no Modo Guiado', u.guiado || 0] : ['Respostas offline', u.offline || 0],
      ['Última resposta ok', relTime(u.ultimoOk)],
      ['Última falha', u.ultimoErro ? `${relTime(u.ultimoErro.em)} — ${u.ultimoErro.mensagem}` : 'nenhuma'],
    ]),
    teste ? h('div', { class: `adm-test adm-test-${teste.ok === true ? 'ok' : teste.ok === false ? 'bad' : 'muted'}` },
      icon(teste.ok === true ? 'check' : teste.ok === false ? 'alert' : 'help', { size: 16 }),
      h('span', {}, h('strong', {}, teste.ok === true ? 'Funcionando. ' : teste.ok === false ? 'Falhou. ' : 'Sem IA configurada. '), teste.detalhe, teste.latenciaMs != null ? ` (${teste.latenciaMs} ms)` : '')) : null,
    u.erros?.length ? h('details', {}, h('summary', { class: 'small' }, `Últimas ${u.erros.length} falha(s)`),
      h('ul', { class: 'small adm-list' }, u.erros.map((e) => h('li', {}, `${fmtDT(e.em)} — ${e.mensagem}`)))) : null);
}

function aiPanel(ia) {
  const box = h('div');
  let teste = null;
  const draw = (status) => mount(box,
    h('div', { class: 'adm-toolbar adm-toolbar-between' },
      h('p', { class: 'small muted' }, 'O teste confere a chave e o modelo direto no provedor, sem gastar tokens. Contadores e falhas vêm do uso real dos estudantes.'),
      h('button', { class: 'btn btn-sm', type: 'button', onClick: run }, icon('refresh', { size: 14 }), 'Testar agora')),
    h('div', { class: 'adm-ai-grid' }, aiServiceCard('Mentor', status.mentor, teste?.mentor), aiServiceCard('Assistente (Guia)', status.assistente, teste?.assistente)),
    teste ? h('p', { class: 'small muted' }, `Último teste: ${fmtDT(teste.testadoEm)}`) : null);
  async function run(e) {
    e.currentTarget.disabled = true;
    try { const r = await api.post('/admin/ai/check'); teste = r; draw(r.status); } catch (err) { toast(err.message, 'err'); e.currentTarget.disabled = false; }
  }
  draw(ia);
  return h('section', { class: 'rd-panel' }, box);
}

// ---------- Inscrições ----------

function enrollmentPanel(ins) {
  const block = (titulo, data, tones) => {
    const items = Object.entries(data);
    const max = Math.max(1, ...items.map(([, v]) => v.total));
    return h('div', { class: 'adm-enroll' }, h('h3', {}, titulo),
      h('ul', { class: 'adm-enroll-list' }, items.map(([k, v]) => h('li', { class: v.total ? '' : 'adm-zero' },
        h('span', { class: 'adm-enroll-label' }, h('i', { class: `adm-swatch adm-tone-${tones[k] || 'muted'}`, 'aria-hidden': 'true' }), v.label),
        h('strong', {}, String(v.total)),
        meter((v.total / max) * 100, `adm-meter-${tones[k] || 'muted'}`)))));
  };
  return panel(`Situação das inscrições · ${ins.jornadas} jornada(s)`, 'flag',
    ins.jornadas ? h('div', { class: 'adm-enroll-grid' },
      block('Candidatura (DUA)', ins.candidatura, TONE.candidatura),
      block('Matrícula', ins.matricula, TONE.matricula),
      block('Visto', ins.visto, TONE.visto)) : empty('Nenhum estudante criou jornada ainda.'),
    ins.destinos.length ? h('div', { class: 'adm-destinos' }, h('h3', {}, 'Destinos mais escolhidos'),
      h('ol', { class: 'small adm-list' }, ins.destinos.map((d) => h('li', {}, `${d.nome} — ${d.total}`)))) : null);
}

// ---------- Visão geral ----------

const FILTERS = [['todos', 'Todos'], ['alerta', 'Com alerta'], ['inativos', 'Sem entrar há 7+ dias'], ['sem-jornada', 'Sem jornada'], ['candidatura-enviada', 'Candidatura enviada'], ['admitidos', 'Admitidos'], ['visto-aprovado', 'Visto aprovado']];
const ORDERS = [['ultimo-acesso', 'Último acesso'], ['inatividade', 'Mais tempo sem entrar'], ['alertas', 'Mais alertas'], ['progresso', 'Maior progresso'], ['cadastro', 'Cadastro mais recente']];

// Seções do painel (cada uma é um item da lateral): título e uma linha explicando o que mostra.
const SECTIONS = {
  alunos: ['Alunos', 'Quem está usando a plataforma e como cada estudante está avançando.'],
  inscricoes: ['Inscrições', 'Situação da candidatura, da matrícula e do visto em todas as jornadas.'],
  uso: ['Uso dos módulos', 'Quais telas os estudantes mais acessam e por quanto tempo.'],
  ia: ['IA', 'Uso do Mentor e do Guia: respostas, falhas e modelo em uso.'],
  eventos: ['Eventos', 'Cadastros, logins (inclusive falhos), trocas de senha, exclusões de conta e ações de administração.'],
  status: ['Status do sistema', 'Serviços e chaves do .env: o que está funcionando e o que está com problema.'],
  logs: ['Logs do servidor', 'Mensagens, avisos e erros do servidor desde o último reinício.'],
};

const pageHead = (section, extra) => h('header', { class: 'adm-head' },
  h('div', {}, h('p', { class: 'rd-eyebrow' }, icon('shield', { size: 14 }), 'Painel do administrador'), h('h1', {}, SECTIONS[section][0]), h('p', { class: 'small muted adm-sub' }, SECTIONS[section][1])),
  extra || null);

// Cartão de indicador: rótulo, número grande e um detalhe curto.
const kpi = (value, label, sub, tone) => h('div', { class: `adm-kpi ${tone ? `adm-kpi-${tone}` : ''}` },
  h('span', { class: 'adm-kpi-label' }, label), h('strong', {}, String(value)), sub ? h('small', {}, sub) : null);

const seg = (options, current, onPick, label) => h('div', { class: 'adm-seg', role: 'group', 'aria-label': label }, options.map(([v, l]) => h('button', {
  type: 'button', class: v === current ? 'active' : '', 'aria-pressed': String(v === current), onClick: () => onPick(v),
}, l)));

const live = () => h('span', { class: 'adm-live small muted' }, h('span', { class: 'adm-dot on', 'aria-hidden': 'true' }), 'Ao vivo · atualiza a cada 30 s');

// ---------- Status do sistema ----------

const ESTADO = { ok: ['Operacional', 'ok', 'check'], aviso: ['Atenção', 'warn', 'alert'], erro: ['Com falha', 'bad', 'alert'], desligado: ['Desligado', 'muted', 'minus'] };
const GERAL = { ok: 'Tudo funcionando', aviso: 'Funcionando, com pontos de atenção', erro: 'Há serviços com falha' };
const pct = (x) => `${(x * 100).toFixed(1).replace('.', ',').replace(',0', '')}%`;

function statusPage(root) {
  let horas = 24;
  let s = null;
  const box = h('div', { class: 'stack' });

  async function load(check = false, btn = null) {
    if (btn) { btn.disabled = true; btn.replaceChildren(icon('refresh', { size: 14 }), 'Verificando…'); }
    try { s = await api.get(`/admin/status?horas=${horas}${check ? '&check=1' : ''}`); } catch (e) { if (btn) toast(e.message, 'err'); else mount(root, restricted(e)); return; }
    render();
  }

  function render() {
    const conta = (e) => s.servicos.filter((x) => x.estado === e).length;
    const grupos = [...new Set(s.servicos.map((x) => x.grupo))];
    const m = s.metricas;
    const btn = h('button', { class: 'btn btn-sm', type: 'button', onClick: (e) => load(true, e.currentTarget) }, icon('refresh', { size: 14 }), 'Verificar agora');
    mount(box,
      h('div', { class: `adm-banner adm-banner-${ESTADO[s.geral][1]}` },
        icon(s.geral === 'ok' ? 'check' : 'alert', { size: 20 }),
        h('div', {},
          h('strong', {}, GERAL[s.geral]),
          h('small', {}, `${conta('ok')} operacional(is) · ${conta('aviso')} com atenção · ${conta('erro')} com falha · ${conta('desligado')} desligado(s)`),
          h('small', {}, `Verificado em ${fmtDT(s.verificadoEm)} · ${s.testeCompleto ? 'teste completo (conexões e chaves testadas)' : 'só configuração — clique em "Verificar agora" para testar as conexões'}`)),
        btn),
      ...grupos.map((g) => h('section', { class: 'adm-group' }, h('h2', { class: 'adm-group-title' }, g),
        h('div', { class: 'adm-svc-grid' }, s.servicos.filter((x) => x.grupo === g).map((x) => {
          const [label, tone, ic] = ESTADO[x.estado];
          return h('article', { class: `adm-svc adm-svc-${tone}` },
            h('div', { class: 'adm-svc-head' }, h('h3', {}, x.nome), h('span', { class: `adm-state adm-tag-${tone}` }, icon(ic, { size: 12 }), label)),
            h('p', { class: 'small' }, x.detalhe),
            h('p', { class: 'adm-svc-meta' }, [x.chave ? `chave ${x.chave}` : null, x.modelo ? x.modelo : null, x.latenciaMs != null ? `${x.latenciaMs} ms` : null].filter(Boolean).join(' · ') || ' '));
        })))),
      h('section', { class: 'rd-panel' },
        h('div', { class: 'adm-toolbar adm-toolbar-between' },
          h('h2', {}, icon('pulse', { size: 18 }), 'Métricas da API'),
          seg([[1, '1 h'], [6, '6 h'], [24, '24 h'], [168, '7 dias']], horas, (v) => { horas = v; load(); }, 'Período')),
        h('div', { class: 'adm-kpis adm-kpis-6' },
          kpi(m.requisicoes, 'Requisições'),
          kpi(m.erros, 'Erros (5xx)', null, m.erros ? 'bad' : null),
          kpi(pct(m.taxaErro), 'Taxa de erro', null, m.taxaErro > 0.02 ? 'bad' : m.taxaErro > 0 ? 'warn' : null),
          kpi(m.mediaMs == null ? '—' : `${m.mediaMs} ms`, 'Tempo médio'),
          kpi(m.p95Ms == null ? '—' : `${m.p95Ms} ms`, 'Tempo p95', '95% respondem até aqui'),
          kpi(m.clientes4xx, 'Recusadas (4xx)', 'login expirado, validação…')),
        h('p', { class: 'small muted adm-unused' }, `Contado em memória desde o último reinício do servidor (${fmtDT(s.iniciadoEm)}).`)));
  }

  mount(root, pageHead('status'), box);
  return load();
}

// ---------- Logs ----------

const NIVEL = { erro: ['Erro', 'bad'], aviso: ['Aviso', 'warn'], info: ['Info', 'muted'] };
const fmtTime = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

function logsPage(root) {
  let nivel = null;
  let q = '';
  const listBox = h('div');
  const chipsBox = h('div');

  async function load() {
    let r;
    try { r = await api.get(`/admin/logs?${new URLSearchParams({ ...(nivel ? { nivel } : {}), ...(q ? { q } : {}) })}`); } catch (e) { return mount(root, restricted(e)); }
    const c = r.contagem;
    mount(chipsBox, h('div', { class: 'adm-chips', role: 'group', 'aria-label': 'Filtrar por nível' },
      [[null, `Todos (${r.total})`], ['erro', `Erros (${c.erro})`], ['aviso', `Avisos (${c.aviso})`], ['info', `Info (${c.info})`]].map(([v, l]) => h('button', {
        type: 'button', class: v === nivel ? 'active' : '', 'aria-pressed': String(v === nivel), onClick: () => { nivel = v; load(); },
      }, l))));
    mount(listBox, r.logs.length ? h('ol', { class: 'adm-logs' }, r.logs.map((l) => {
      const [label, tone] = NIVEL[l.nivel];
      const [first, ...rest] = l.mensagem.split('\n');
      return h('li', { class: `adm-log adm-log-${tone}` },
        h('time', { datetime: l.at }, fmtTime(l.at)),
        tag(label, tone),
        rest.length ? h('details', {}, h('summary', {}, h('code', {}, first)), h('pre', {}, rest.join('\n'))) : h('code', {}, first));
    })) : empty(q || nivel ? 'Nenhuma mensagem com esses filtros.' : 'Nenhuma mensagem registrada desde o último reinício.'));
  }

  const search = h('input', { type: 'search', class: 'adm-search', placeholder: 'Buscar no texto…', 'aria-label': 'Buscar nos logs' });
  let timer;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { q = search.value.trim(); load(); }, 250); });
  mount(root,
    pageHead('logs', h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onClick: () => load() }, icon('refresh', { size: 14 }), 'Atualizar')),
    h('section', { class: 'rd-panel' },
      h('div', { class: 'adm-toolbar adm-toolbar-between' }, chipsBox, search),
      listBox,
      h('p', { class: 'small muted adm-unused' }, 'Guardamos as últimas 500 mensagens só na memória: reiniciar o servidor apaga. Erros 5xx da API entram aqui automaticamente.')));
  return { load };
}

// ---------- Visão geral (alunos, inscrições, uso, IA, eventos) ----------

export async function adminView(section = 'alunos') {
  const root = h('div', { class: 'rd adm stack' });
  const startPath = currentPath();
  let refreshFn = null;

  if (section === 'status') {
    await statusPage(root);
    return root;
  }
  if (section === 'logs') {
    const page = logsPage(root);
    await page.load();
    refreshFn = page.load;
  } else {
    refreshFn = await overviewPage(root, section);
  }

  // Atualização automática enquanto a seção estiver aberta (para quando o admin sai dela).
  const refresh = setInterval(() => {
    if (!root.isConnected || currentPath() !== startPath) return clearInterval(refresh);
    if (root.contains(document.activeElement) && document.activeElement.matches('input, select, textarea')) return; // não atrapalha quem está digitando
    refreshFn().catch(() => {});
  }, 30_000);
  return root;
}

async function overviewPage(root, section) {
  let query = '';
  let filtro = 'todos';
  let ordem = 'ultimo-acesso';
  let periodo = 30;
  let todosEventos = false;
  const usersBox = h('div');

  async function drawUsers() {
    const params = new URLSearchParams({ filtro, ordem, ...(query ? { q: query } : {}) });
    const { users } = await api.get(`/admin/users?${params}`);
    mount(usersBox, users.length ? table(['Aluno', 'Último acesso', 'Destino', 'Situação', 'Progresso', 'Alertas'], users.map((u) => h('tr', {
      class: `adm-row ${u.bloqueado ? 'adm-row-blocked' : ''}`,
      onClick: (e) => { if (!e.target.closest('a')) location.hash = `#/admin/aluno/${u.id}`; },
    },
      h('td', {}, h('div', { class: 'adm-who' }, dot(u.online), h('div', {},
        h('a', { href: `#/admin/aluno/${u.id}`, class: 'adm-name' }, `${u.avatar} ${u.nome}`), u.bloqueado ? tag('suspenso', 'bad') : null,
        h('small', { class: 'muted adm-block' }, u.email)))),
      h('td', { title: fmtDT(u.lastSeenAt) }, relTime(u.lastSeenAt), u.diasSemEntrar >= 7 ? h('small', { class: 'adm-warn-text adm-block' }, `${daysLabel(u.diasSemEntrar)} sem entrar`) : null),
      h('td', { class: 'small' }, u.destino ? h('span', { class: 'adm-dest', title: u.destino }, u.destino) : h('span', { class: 'muted' }, 'sem jornada')),
      h('td', {}, u.inscricao ? h('div', { class: 'adm-stack-tags' }, tag(u.inscricao.candidaturaLabel, TONE.candidatura[u.inscricao.candidatura]), tag(`Visto: ${u.inscricao.vistoLabel.toLowerCase()}`, TONE.visto[u.inscricao.visto])) : h('span', { class: 'muted' }, '—')),
      h('td', {}, u.progresso == null ? '—' : h('div', { class: 'adm-prog' }, h('span', {}, `${u.progresso}%`), meter(u.progresso))),
      h('td', {}, u.alertas ? tag(String(u.alertas), u.alertaAlto ? 'bad' : 'warn') : h('span', { class: 'muted' }, '—')),
    ))) : empty(query || filtro !== 'todos' ? 'Nenhum aluno encontrado com esses filtros.' : 'Nenhum aluno cadastrado ainda.'));
  }

  function studentsContent(o) {
    const t = o.totais;
    // Só aparece quando há algo fora do normal.
    const avisos = [
      t.bloqueados ? tag(`${t.bloqueados} conta(s) suspensa(s)`, 'warn') : null,
      t.loginsFalhos24h ? tag(`${t.loginsFalhos24h} login(s) falho(s) em 24 h`, t.loginsFalhos24h >= 5 ? 'bad' : 'warn') : null,
      o.ipsSuspeitos.length ? tag(`IPs suspeitos: ${o.ipsSuspeitos.map((x) => `${x.ip} (${x.tentativas})`).join(', ')}`, 'bad') : null,
      o.ia.mentor.problemaConfig ? h('a', { href: '#/admin/status' }, tag('IA com problema de configuração — ver Status', 'bad')) : null,
    ].filter(Boolean);

    const search = h('input', { type: 'search', class: 'adm-search', placeholder: 'Buscar por nome ou e-mail…', value: query, 'aria-label': 'Buscar aluno' });
    let timer;
    search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { query = search.value.trim(); drawUsers(); }, 250); });
    const order = h('select', { class: 'adm-select', 'aria-label': 'Ordenar alunos' }, ORDERS.map(([v, l]) => h('option', { value: v, selected: v === ordem }, l)));
    order.addEventListener('change', () => { ordem = order.value; drawUsers(); });
    const chips = h('div', { class: 'adm-chips', role: 'group', 'aria-label': 'Filtrar alunos' }, FILTERS.map(([v, l]) => h('button', {
      type: 'button', class: v === filtro ? 'active' : '', 'aria-pressed': String(v === filtro),
      onClick: (e) => { filtro = v; chips.querySelectorAll('button').forEach((b) => { b.classList.toggle('active', b === e.currentTarget); b.setAttribute('aria-pressed', String(b === e.currentTarget)); }); drawUsers(); },
    }, l)));
    drawUsers().catch((e) => toast(e.message, 'err'));
    return [
      h('div', { class: 'adm-kpis' },
        kpi(t.online, 'Online agora', `${t.ativos24h} ativo(s) em 24 h`, 'ok'),
        kpi(t.usuarios, 'Alunos', `+${t.novos7d} nos últimos 7 dias`),
        kpi(t.ativos7d, 'Ativos em 7 dias', `${t.comJornada} com jornada`),
        kpi(t.inativos7d, 'Sem entrar há 7+ dias', `${t.inativos30d} há 30+ dias`, t.inativos7d ? 'warn' : null)),
      avisos.length ? h('div', { class: 'adm-avisos' }, icon('alert', { size: 15 }), ...avisos) : null,
      h('section', { class: 'rd-panel' }, h('div', { class: 'adm-toolbar' }, search, order), chips, usersBox),
      h('div', { class: 'rd-two' },
        panel(`Online agora (${o.online.length})`, 'user',
          o.online.length ? h('ul', { class: 'adm-online' }, o.online.map((u) => h('li', {},
            dot(true), h('div', {}, h('a', { href: `#/admin/aluno/${u.id}`, class: 'adm-name' }, `${u.avatar} ${u.nome}`), u.modulo ? tag(`em ${u.modulo}`, 'info') : null,
              h('small', { class: 'muted adm-block' }, `${device(u.dispositivo)} · ${relTime(u.lastSeenAt)}`)))))
            : empty('Ninguém ativo nos últimos 5 minutos.')),
        panel('Ativos por dia (30 dias)', 'calendar', activityChart(o.dias))),
    ];
  }

  function usageContent(o) {
    return h('section', { class: 'rd-panel' },
      h('div', { class: 'adm-toolbar adm-toolbar-between' },
        h('p', { class: 'small muted' }, `${o.uso.totalAcessos} acesso(s) a telas em ${o.uso.periodoDias} dias. "Pessoas" = estudantes diferentes; o tempo só conta com a aba visível.`),
        seg([[7, '7 dias'], [30, '30 dias'], [90, '90 dias']], periodo, (v) => { periodo = v; draw(); }, 'Período')),
      usageTable(o.uso),
      o.uso.semUso.length && o.uso.modulos.length ? h('p', { class: 'small muted adm-unused' }, h('strong', {}, 'Sem acesso no período: '), o.uso.semUso.join(', ')) : null);
  }

  function eventsContent(o) {
    const LIMIT = 15;
    return h('section', { class: 'rd-panel' },
      eventsTable(todosEventos ? o.eventos : o.eventos.slice(0, LIMIT)),
      o.eventos.length > LIMIT ? h('button', { class: 'btn btn-ghost btn-sm adm-more', type: 'button', onClick: () => { todosEventos = !todosEventos; draw(); } },
        todosEventos ? 'Mostrar menos' : `Mostrar todos (${o.eventos.length})`) : null);
  }

  async function draw() {
    let o;
    try { o = await api.get(`/admin/overview?periodo=${periodo}`); } catch (e) { return mount(root, restricted(e)); }
    const content = section === 'inscricoes' ? enrollmentPanel(o.inscricoes)
      : section === 'uso' ? usageContent(o)
        : section === 'ia' ? aiPanel(o.ia)
          : section === 'eventos' ? eventsContent(o)
            : studentsContent(o);
    mount(root, pageHead(section, live()), ...[content].flat());
  }

  await draw();
  return draw;
}

// ---------- Acompanhamento de um aluno ----------

function journeyCard(j) {
  if (j.erro) return h('div', { class: 'adm-journey' }, empty(`Jornada ${j.id}: ${j.erro}`));
  const ins = j.inscricao;
  const vencidos = j.prazos.filter((p) => p.diasRestantes < 0);
  const proximos = j.prazos.filter((p) => p.diasRestantes >= 0).slice(0, 6);
  const f = j.financas || {};
  return h('article', { class: 'adm-journey' },
    h('div', { class: 'row wrap adm-detail-head' },
      h('div', {}, h('h3', {}, `${j.universidade}${j.cidade ? ` · ${j.cidade}` : ''}`), h('p', { class: 'small muted' }, `${j.programa}${j.demo ? ' (demonstração)' : ''} · ${j.anoAcademico || 'ano não definido'} · criada em ${fmtDate(j.criadaEm)}`)),
      tag(j.status === 'concluida' ? 'Concluída' : j.status === 'em-andamento' ? 'Em andamento' : 'Não iniciada', j.status === 'concluida' ? 'ok' : j.status === 'em-andamento' ? 'info' : 'muted')),
    h('div', { class: 'adm-progress' }, h('strong', {}, `${j.progresso}%`), meter(j.progresso, 'adm-meter-lg'), h('span', { class: 'small muted' }, `${j.missoes.concluidas} de ${j.missoes.aplicaveis} missões concluídas · rodada atual: ${j.rodadaAtual}`)),
    h('div', { class: 'adm-situacao' },
      h('div', {}, h('small', { class: 'muted' }, 'Candidatura'), tag(ins.candidaturaLabel, TONE.candidatura[ins.candidatura])),
      h('div', {}, h('small', { class: 'muted' }, 'Matrícula'), tag(ins.matriculaLabel, TONE.matricula[ins.matricula])),
      h('div', {}, h('small', { class: 'muted' }, 'Visto'), tag(ins.vistoLabel, TONE.visto[ins.visto]))),
    dl([
      ['Próxima missão', j.proximaMissao || 'nenhuma pendente'],
      ['Missões pedindo atenção', j.missoes.atencao],
      ['Aguardando terceiros', j.missoes.aguardando],
      ['Orçamento planejado', fmtEUR(f.planejado)],
      ['Exigência do visto', fmtEUR(f.exigenciaVisto)],
      ['Recursos confirmados', f.informouRecursos ? fmtEUR(f.disponivel) : 'não informou'],
      ['Situação financeira', !f.informouRecursos ? '—' : f.deficit > 0 ? h('span', { class: 'adm-bad-text' }, `faltam ${fmtEUR(f.deficit)}`) : h('span', { class: 'adm-ok-text' }, 'coberto')],
    ]),
    vencidos.length || proximos.length ? table(['Prazo', 'Data', 'Situação'], [...vencidos, ...proximos].map((p) => h('tr', {},
      h('td', {}, p.titulo), h('td', {}, fmtDate(p.data)),
      h('td', {}, p.diasRestantes < 0 ? tag(`vencido há ${-p.diasRestantes} d`, 'bad') : p.diasRestantes <= 7 ? tag(`em ${p.diasRestantes} d`, 'warn') : h('span', { class: 'muted' }, `em ${p.diasRestantes} d`))))) : empty('Sem prazos registrados.'),
    h('details', {}, h('summary', { class: 'small' }, 'Progresso por rodada'),
      table(['Rodada', 'Situação', 'Missões', 'Progresso'], j.rodadas.map((r) => h('tr', {},
        h('td', {}, `${r.numero}. ${r.titulo}`), h('td', { class: 'small' }, r.status), h('td', {}, `${r.concluidas}/${r.total}`), h('td', {}, `${r.progresso}%`, meter(r.progresso)))))));
}

function activityStrip(lista) {
  const set = new Set(lista);
  const days = Array.from({ length: 30 }, (_, i) => new Date(Date.now() - (29 - i) * 864e5).toISOString().slice(0, 10));
  return h('figure', { class: 'adm-strip-fig' },
    h('div', { class: 'adm-strip', role: 'list', 'aria-label': `${lista.length} dia(s) com atividade nos últimos 30` }, days.map((d) => h('i', {
      role: 'listitem', class: set.has(d) ? 'on' : '', title: `${fmtDay(d)}: ${set.has(d) ? 'acessou' : 'não acessou'}`,
    }))),
    h('figcaption', { class: 'adm-axis small muted' }, h('span', {}, fmtDay(days[0])), h('span', {}, 'dias com acesso (30 dias)'), h('span', {}, 'hoje')));
}

export async function adminStudentView(id) {
  const root = h('div', { class: 'rd adm stack-lg' });

  async function act(fn, ok) {
    try { await fn(); toast(ok, 'ok'); await draw(); } catch (e) { toast(e.message, 'err'); }
  }

  async function draw() {
    let r;
    try { r = await api.get(`/admin/users/${id}`); } catch (e) {
      if (e.status === 404) return mount(root, h('section', { class: 'rd-empty' }, h('h2', {}, 'Aluno não encontrado'), h('a', { class: 'btn', href: '#/admin' }, 'Voltar ao painel')));
      return mount(root, restricted(e));
    }
    const u = r.user;
    const rel = r.relatorio;
    const p = rel.perfil;
    const e = rel.engajamento;

    const noteInput = h('textarea', { class: 'adm-note-input', rows: 3, maxlength: 1000, placeholder: 'Ex.: Liguei em 27/10, vai enviar o diploma esta semana.', 'aria-label': 'Nova anotação' });
    const noteForm = h('form', { class: 'stack' }, noteInput, h('button', { class: 'btn btn-sm', type: 'submit' }, 'Salvar anotação'));
    noteForm.addEventListener('submit', (ev) => {
      ev.preventDefault();
      if (!noteInput.value.trim()) return;
      act(() => api.post(`/admin/users/${u.id}/notes`, { texto: noteInput.value.trim() }), 'Anotação salva.');
    });

    mount(root,
      h('a', { href: '#/admin', class: 'adm-back small' }, icon('back', { size: 14 }), 'Voltar ao painel'),

      h('section', { class: 'rd-hero rd-hero-admin' },
        h('div', { class: 'row wrap adm-detail-head' },
          h('div', {},
            h('p', { class: 'rd-eyebrow' }, icon('user', { size: 16 }), 'Acompanhamento do aluno'),
            h('h1', {}, `${p.avatar || '🎓'} ${p.nome || '—'}`),
            h('p', { class: 'muted' }, p.email, ' · ', u.online ? h('span', { class: 'adm-ok-text' }, 'online agora') : `visto ${relTime(u.lastSeenAt)}`, u.modulo && u.online ? ` (em ${u.modulo})` : '', u.bloqueado ? ' · ' : '', u.bloqueado ? tag('suspenso', 'bad') : null)),
          h('div', { class: 'row wrap' },
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => act(() => api.post(`/admin/users/${u.id}/logout`), 'Sessões encerradas.') }, icon('lock', { size: 14 }), 'Encerrar sessões'),
            h('button', { class: `btn btn-sm ${u.bloqueado ? '' : 'adm-btn-danger'}`, type: 'button', onClick: () => act(() => api.post(`/admin/users/${u.id}/block`, { bloqueado: !u.bloqueado }), u.bloqueado ? 'Conta reativada.' : 'Conta suspensa.') },
              icon(u.bloqueado ? 'unlock' : 'shield', { size: 14 }), u.bloqueado ? 'Reativar conta' : 'Suspender conta'))),
        h('div', { class: 'rd-stats' },
          stat(daysLabel(e.diasSemEntrar), 'Sem entrar', e.diasSemEntrar >= 30 ? 'bad' : e.diasSemEntrar >= 7 ? 'warn' : 'ok'),
          stat(e.visitas, 'Visitas'),
          stat(e.diasAtivos, 'Dias com acesso'),
          stat(rel.jornadas.length ? `${Math.max(...rel.jornadas.map((j) => j.progresso || 0))}%` : '—', 'Progresso da jornada'),
        ),
        h('p', { class: 'rd-footnote' }, `Cadastro em ${fmtDate(e.cadastro)} (há ${daysLabel(e.diasDesdeCadastro)}) · ${e.logins} login(s), último ${relTime(e.ultimoLogin)} · Mentor: ${e.mentor?.mensagens || 0} mensagem(ns) · Assistente: ${e.assistente?.mensagens || 0}`)),

      panel(`Pontos de atenção (${rel.alertas.length})`, 'alert',
        rel.alertas.length ? h('ul', { class: 'adm-alerts' }, rel.alertas.map((a) => h('li', { class: `adm-alerts-${a.nivel}` }, tag(a.nivel === 'alto' ? 'Urgente' : a.nivel === 'medio' ? 'Atenção' : 'Info', TONE.alerta[a.nivel]), h('span', {}, a.texto))))
          : h('p', { class: 'adm-ok-text' }, 'Tudo em dia: nenhum ponto de atenção.')),

      panel(`Jornadas e inscrições (${rel.jornadas.length})`, 'map',
        rel.jornadas.length ? h('div', { class: 'stack' }, rel.jornadas.map(journeyCard)) : empty('Ainda não criou nenhuma jornada.'),
        rel.opcoesMestrado.length ? h('p', { class: 'small' }, h('strong', {}, 'Opções de mestrado escolhidas (DUA): '), rel.opcoesMestrado.join(' · ')) : null),

      h('div', { class: 'rd-two' },
        panel('Documentos', 'file',
          h('p', { class: 'small muted' }, Object.entries(rel.documentos.resumo).map(([k, n]) => `${n} ${rel.documentos.lista.find((d) => d.status === k)?.statusLabel.toLowerCase() || k}`).join(' · ')),
          table(['Documento', 'Situação', 'Atualizado'], rel.documentos.lista.map((d) => h('tr', {},
            h('td', {}, d.nome), h('td', {}, tag(d.statusLabel, TONE.doc[d.status])), h('td', { class: 'small muted' }, d.atualizadoEm ? fmtDate(d.atualizadoEm) : '—'))))),
        panel('Finanças e bolsas', 'euro',
          h('h3', {}, 'Recursos informados'),
          rel.financas.recursos.length ? h('ul', { class: 'adm-list small' }, rel.financas.recursos.map((x) => h('li', {}, `${x.descricao || x.tipo}: ${fmtMoney(x.valor, x.moeda)} (${x.status})`)))
            : empty(rel.financas.informouRecursos ? 'Informou que não tem recursos.' : 'Ainda não informou recursos.'),
          h('h3', {}, 'Bolsas'),
          rel.financas.bolsas.length ? h('ul', { class: 'adm-list small' }, rel.financas.bolsas.map((b) => h('li', {}, `${b.nome || 'Bolsa'}${b.entidade ? ` (${b.entidade})` : ''}: `, tag(b.status, b.status === 'concedida' ? 'ok' : b.status === 'negada' ? 'bad' : b.status === 'enviada' ? 'info' : 'muted'))))
            : empty('Nenhuma bolsa salva.'),
          p.orcamentoDisponivel != null ? h('p', { class: 'small muted' }, `Orçamento declarado no perfil: ${fmtMoney(p.orcamentoDisponivel)}`) : null),
      ),

      h('div', { class: 'rd-two' },
        panel('Outros módulos', 'compass', dl([
          ['Moradia', rel.moradia.escolhida ? `escolhida: ${rel.moradia.escolhida.titulo}${rel.moradia.escolhida.bairro ? ` (${rel.moradia.escolhida.bairro})` : ''}` : `${rel.moradia.opcoes} opção(ões), nenhuma escolhida`],
          ['Viagem', rel.viagem.escolhida ? `rota escolhida: ${rel.viagem.escolhida.titulo}${rel.viagem.escolhida.comprada ? ' · passagem comprada' : ''}` : `${rel.viagem.opcoes} cotação(ões)`],
          ['Saída / data da ida', `${rel.viagem.origem || '—'} · ${rel.viagem.dataIda ? fmtDate(rel.viagem.dataIda) : 'sem data'}`],
          ['Tarefas na agenda', rel.agenda.total],
          ['Conquistas', rel.conquistas],
          ['Comunidade', rel.comunidade ? `${rel.comunidade.publicacoes} post(s) · ${rel.comunidade.comentarios} comentário(s) · ${rel.comunidade.grupos} grupo(s)` : '—'],
          ['Radar', rel.radar ? `acompanha ${rel.radar.acompanhando} oportunidade(s) · ${rel.radar.alertasNaoLidos} alerta(s) não lido(s)` : '—'],
        ]),
        h('h3', {}, 'Agenda dos próximos 7 dias'),
        rel.agenda.proximos7dias.length ? h('ul', { class: 'adm-list small' }, rel.agenda.proximos7dias.map((t) => h('li', {}, `${fmtDate(t.data)}${t.inicio ? ` ${t.inicio}` : ''} — ${t.titulo}`))) : empty('Nada agendado.')),
        panel('Perfil', 'user', dl([
          ['Nacionalidade', p.nacionalidade], ['Mora em', [p.estado, p.paisResidencia].filter(Boolean).join(', ') || '—'],
          ['Formação', p.formacao], ['Instituição', p.instituicao], ['Área', p.area],
          ['Espanhol', p.espanhol], ['Inglês', p.ingles], ['Certificado de espanhol', p.certificadoEspanhol && p.certificadoEspanhol !== 'nenhum' ? `${p.certificadoEspanhol} ${p.certificadoNivel || ''}` : 'nenhum'],
          ['Candidatura (declarada)', p.situacaoCandidatura], ['Visto (declarado)', p.situacaoVisto],
          ['Cadastro inicial', p.onboardingConcluido ? 'concluído' : 'pendente'],
          p.porque ? ['Por que quer estudar fora', p.porque] : null, p.metaPessoal ? ['Meta pessoal', p.metaPessoal] : null,
        ]))),

      h('div', { class: 'rd-two' },
        panel('Anotações do admin', 'edit',
          h('p', { class: 'small muted' }, 'Só o administrador vê. Use para registrar contatos e combinados com o aluno.'),
          noteForm,
          rel.notas.length ? h('ul', { class: 'adm-notes' }, rel.notas.map((n) => h('li', {},
            h('p', {}, n.texto),
            h('div', { class: 'row between small muted' }, h('span', {}, `${fmtDT(n.em)} · ${n.por}`),
              h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': 'Apagar anotação', onClick: () => act(() => api.del(`/admin/users/${u.id}/notes/${n.id}`), 'Anotação apagada.') }, icon('trash', { size: 14 })))))) : null),
        panel('Uso da plataforma', 'target',
          activityStrip(e.diasAtivosLista),
          e.modulos.length ? table(['Módulo', 'Acessos', 'Tempo total'], e.modulos.map((m) => h('tr', {}, h('td', {}, m.nome), h('td', {}, String(m.acessos)), h('td', {}, fmtDur(m.tempoTotalSeg)))))
            : empty('Nenhum acesso a módulos registrado ainda.'),
          dl([['Dispositivo', device(u.dispositivo)], ['Último IP', u.ip || '—']]),
          u.userAgent ? h('p', { class: 'small muted adm-ua' }, u.userAgent) : null)),

      panel('Histórico da conta', 'clock', eventsTable(r.eventos)),
    );
  }

  await draw();
  return root;
}
