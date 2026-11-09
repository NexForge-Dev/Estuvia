// Radar de Oportunidades — "Explorar Oportunidades" e detalhe de uma oportunidade.
// Todo número e toda data vêm da base verificada do servidor (/api/radar). Ausência de dado é
// mostrada como ausência ("Aguardando publicação"), nunca como inscrições encerradas.
import { h, mount, toast } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { state, go, invalidate } from '../app.js';
import { onLive } from '../live.js';

const fmt = (iso) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const fmtDT = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'nunca');
const ext = (href, label, cls = 'btn btn-ghost btn-sm') => (href ? h('a', { class: cls, href, target: '_blank', rel: 'noopener noreferrer' }, label, icon('external', { size: 14 })) : null);
const MODALIDADE = { presencial: 'Presencial', hibrida: 'Híbrida', online: 'Online' };
const PUBLICO = { estrangeiros: 'Exclusiva para estrangeiros', todos: 'Espanhóis e estrangeiros' };
const COMPAT = { alta: 'Alta compatibilidade com sua área', media: 'Compatível com sua área', baixa: 'Área diferente da sua formação' };
const EVENT_LABEL = { candidatura: 'Candidatura', 'pagamento-titulo': 'Taxa de expedição do título', avaliacao: 'Avaliação', adjudicacao: 'Adjudicação', reclamacao: 'Reclamações', confirmacao: 'Matrícula / reserva / confirmação', resultas: 'Lista de resultas', outro: 'Outro' };
const PHASE_LABEL = { abertas: 'Inscrições abertas', anunciadas: 'Anunciada', previsto: 'Previsão', encerradas: 'Encerrada', 'em-avaliacao': 'Em avaliação', adjudicacoes: 'Adjudicações publicadas', resultas: 'Resultas' };
const VERIF_ICON = { confirmada: 'shield', pendente: 'clock', 'nao-confirmada': 'alert', prevista: 'hourglass', desatualizada: 'alert', demonstrativo: 'wand' };

const shortYear = (curso) => (curso ? curso.replace(/^(\d{4})\/\d{2}(\d{2})$/, '$1/$2') : curso);
const nextAcademicYear = (curso) => {
  const match = /^(\d{4})\/(\d{2}|\d{4})$/.exec(String(curso || ''));
  if (!match) return null;
  const end = Number(match[2].length === 2 ? `${match[1].slice(0, 2)}${match[2]}` : match[2]);
  return `${end}/${String(end + 1).slice(-2)}`;
};

// ---------- Componentes ----------

function statusBadge(c) {
  return h('span', { class: `rd-status rd-tom-${c.tom}`, title: c.estadoDescricao }, h('i', { 'aria-hidden': 'true' }), c.estadoLabel);
}

function verificationLine(v, { compact = false } = {}) {
  return h('div', { class: `rd-verif rd-verif-${v.status}` },
    icon(VERIF_ICON[v.status] || 'shield', { size: 15 }),
    h('div', {},
      h('strong', {}, v.texto),
      h('span', { class: 'rd-verif-meta' }, `Fonte: ${v.fonte}`, ' · ', `Última verificação: ${fmtDT(v.ultimaVerificacao)}`),
      !compact && v.url ? h('a', { href: v.url, target: '_blank', rel: 'noopener noreferrer', class: 'rd-verif-link' }, 'Ver fonte oficial') : null,
    ),
  );
}

function dateBlock(label, value, pending = 'Aguardando publicação') {
  return h('div', { class: 'rd-date' }, h('span', {}, label), h('strong', { class: value ? '' : 'rd-pending' }, value ? fmt(value) : pending));
}

function chips(c) {
  const p = c.programa;
  return h('ul', { class: 'rd-chips', 'aria-label': 'Informações do programa' },
    p.ramos.map((r) => h('li', {}, r)),
    p.modalidade ? h('li', {}, MODALIDADE[p.modalidade]) : null,
    p.creditos ? h('li', {}, `${p.creditos} ECTS${p.duracaoEstimadaAnos ? ` · ~${String(p.duracaoEstimadaAnos).replace('.', ',')} ano(s)` : ''}`) : null,
    p.tipoTitulo === 'duplo' ? h('li', {}, 'Dupla titulação') : null,
    p.tipoTitulo === 'erasmus-mundus' ? h('li', {}, 'Erasmus Mundus') : null,
    p.ofertaCondicionada ? h('li', { class: 'rd-chip-warn' }, 'Oferta condicionada à verificação do título') : null,
    !p.fichaVerificada ? h('li', { class: 'rd-chip-muted' }, 'Ficha ainda não conferida pelo Radar') : null,
  );
}

async function toggleFollow(c, btn, onChange) {
  btn.disabled = true;
  try {
    if (c.acompanhando) {
      await api.del(`/radar/opportunities/${c.id}/subscription`);
      c.acompanhando = false;
      toast('Você deixou de acompanhar esta oportunidade.');
    } else {
      await api.put(`/radar/opportunities/${c.id}/subscription`, {});
      c.acompanhando = true;
      toast('Pronto! Avisaremos quando houver datas oficiais ou mudanças.', 'ok');
    }
    onChange?.();
  } catch (e) { toast(e.message, 'err'); } finally { btn.disabled = false; }
}

async function addToJourney(c) {
  const jr = (state.journeys || []).find?.((j) => j.destino?.programa?.id === c.programId);
  if (c.naJornada || jr) return toast('Este mestrado já está nas suas jornadas.');
  const cicloPublicado = shortYear(c.anoAcademico);
  const cicloPlanejado = c.estado === 'encerradas' ? nextAcademicYear(cicloPublicado) : cicloPublicado;
  if (!cicloPlanejado) return toast('Não consegui identificar o ciclo acadêmico deste programa.', 'err');
  if (cicloPlanejado !== cicloPublicado && !window.confirm(`As candidaturas de ${cicloPublicado} estão encerradas. Posso criar uma jornada de planejamento para ${cicloPlanejado} usando esta ficha como referência. A oferta, os requisitos e as datas do próximo ciclo ainda precisam ser confirmados oficialmente. Continuar?`)) return;
  try {
    const r = await api.post('/journeys', { programaId: c.programId, anoAcademico: cicloPlanejado });
    invalidate?.();
    c.naJornada = true;
    toast(cicloPlanejado === cicloPublicado
      ? 'Mestrado adicionado à sua jornada. As datas oficiais alimentam a Rodada 3.'
      : `Jornada de planejamento ${cicloPlanejado} criada. Confira novamente a oferta e os requisitos quando o novo ciclo for publicado.`, 'ok');
    if (r.journey?.id) go(`/j/${r.journey.id}`);
  } catch (e) { toast(e.message, 'err'); }
}

function followButton(c, onChange) {
  const btn = h('button', { class: c.acompanhando ? 'btn btn-ghost btn-sm rd-following' : 'btn btn-sm', type: 'button', 'aria-pressed': String(c.acompanhando) },
    icon('bell', { size: 15 }), c.acompanhando ? 'Acompanhando' : c.estado === 'abertas' ? 'Acompanhar inscrições' : 'Avise-me quando abrir');
  btn.addEventListener('click', () => toggleFollow(c, btn, onChange));
  return btn;
}

function opportunityCard(c, redraw) {
  const u = c.universidade;
  const cover = h('div', { class: 'rd-card-cover' });
  if (u.capa) cover.style.backgroundImage = `url("${u.capa}")`;
  return h('article', { class: `rd-card rd-card-${c.tom}${c.demo ? ' rd-demo' : ''}` },
    cover,
    h('div', { class: 'rd-card-body' },
      h('div', { class: 'rd-card-top' }, statusBadge(c), h('span', { class: 'rd-year' }, icon('calendar', { size: 13 }), c.anoAcademico)),
      c.demo ? h('p', { class: 'rd-demo-flag' }, 'DADO DEMONSTRATIVO, ambiente de desenvolvimento') : null,
      h('p', { class: 'rd-uni' }, u.nome),
      h('h3', { class: 'rd-title' }, h('a', { href: `#/oportunidades/${c.id}` }, c.programa.nome)),
      h('p', { class: 'rd-place' }, icon('pin', { size: 14 }), `${u.cidade}, ${u.pais}`),
      h('div', { class: 'rd-dates' },
        dateBlock(c.estado === 'abertas' ? 'Aberta desde' : 'Abertura', c.abertura, c.fases.length && !c.abertura ? '-' : 'Aguardando publicação'),
        dateBlock('Prazo final', c.prazoFinal, c.fases.length && !c.prazoFinal ? '-' : 'Aguardando publicação'),
      ),
      c.diasParaPrazo !== null && c.estado === 'abertas' ? h('p', { class: `rd-countdown ${c.diasParaPrazo <= 3 ? 'urgent' : ''}` }, icon('hourglass', { size: 14 }), c.diasParaPrazo === 0 ? 'Último dia (horário de Madri)' : `Faltam ${c.diasParaPrazo} dia(s)`) : null,
      c.proximos?.[0] && c.estado !== 'abertas' ? h('p', { class: 'rd-next' }, 'Próximo marco oficial: ', h('strong', {}, `${c.proximos[0].rotulo} - ${fmt(c.proximos[0].data)}`)) : null,
      h('p', { class: 'rd-vagas' }, 'Vagas ofertadas: ', c.vagas.ofertadas ? h('strong', {}, String(c.vagas.ofertadas)) : h('span', { class: 'muted' }, c.vagas.texto)),
      chips(c),
      c.compatibilidade ? h('p', { class: `rd-compat rd-compat-${c.compatibilidade}`, title: 'Estimativa pela área de formação do seu perfil, não é avaliação de admissão.' }, icon('target', { size: 14 }), COMPAT[c.compatibilidade]) : null,
      c.referenciaHistorica ? h('details', { class: 'rd-history-ref' },
        h('summary', {}, `Referência histórica ${c.referenciaHistorica.anoAcademico}`),
        h('p', { class: 'small muted' }, c.referenciaHistorica.aviso),
        h('ul', {}, c.referenciaHistorica.fases.map((f) => h('li', {}, `Fase ${f.fase}: ${fmt(f.abertura)} – ${fmt(f.encerramento)}`))),
      ) : null,
      verificationLine(c.verificacao, { compact: true }),
      h('div', { class: 'rd-actions' },
        h('a', { class: 'btn btn-sm', href: `#/oportunidades/${c.id}` }, 'Ver detalhes'),
        followButton(c, redraw),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', disabled: c.naJornada, onClick: () => addToJourney(c) }, icon('map', { size: 15 }), c.naJornada ? 'Na sua jornada' : 'Adicionar à minha jornada'),
        ext(c.programa.webPropria || c.programa.fichaUrl, 'Site oficial'),
      ),
    ),
  );
}

function stat(label, value, hint, ic) {
  return h('div', { class: 'rd-stat' }, h('span', { class: 'rd-stat-icon' }, icon(ic, { size: 18 })), h('strong', {}, String(value)), h('span', {}, label), hint ? h('small', {}, hint) : null);
}

function alertsPanel(me, redraw) {
  if (!me) return null;
  const unread = me.alertas.filter((a) => !a.lidoEm);
  const changes = me.agendaAlteracoes || [];
  if (!me.alertas.length && !changes.length) return null;
  const markAll = async () => { await api.post('/radar/alerts/read', {}); redraw(true); };
  return h('section', { class: 'rd-alerts', 'aria-label': 'Seus alertas do Radar' },
    h('div', { class: 'rd-alerts-head' },
      h('h2', {}, icon('bell', { size: 18 }), 'Seus alertas', unread.length ? h('span', { class: 'rd-pill' }, `${unread.length} nova(s)`) : null),
      unread.length ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: markAll }, 'Marcar como lidas') : null),
    changes.map((c) => h('div', { class: 'rd-alert rd-alert-change' },
      h('strong', {}, 'Data oficial alterada, confirme sua agenda'),
      h('p', {}, `"${c.titulo}": a data oficial mudou de ${fmt(c.dataOficialAnterior)} para ${fmt(c.dataOficialNova)}. ${c.oficial ? 'Prazo oficial: será atualizado para a nova data.' : `Sugestão: mover sua atividade para ${fmt(c.sugestao)}.`}`),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn btn-sm', type: 'button', onClick: async () => { await api.post(`/radar/agenda-changes/${c.linkId}`, { aceitar: true }); toast('Agenda atualizada.', 'ok'); redraw(true); } }, 'Atualizar minha agenda'),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: async () => { await api.post(`/radar/agenda-changes/${c.linkId}`, { aceitar: false }); redraw(true); } }, 'Manter como está')),
    )),
    me.alertas.slice(0, 5).map((a) => h('article', { class: `rd-alert ${a.lidoEm ? '' : 'unread'}` },
      h('strong', {}, a.titulo),
      h('p', {}, a.corpo),
      h('p', { class: 'small muted' }, `${a.dados.universidade} · ${a.dados.programa} · ${a.dados.anoAcademico}`),
      a.dados.abertura ? h('p', { class: 'small' }, `Abertura: ${fmt(a.dados.abertura)} · Prazo: ${fmt(a.dados.prazo)}`) : null,
      h('div', { class: 'row wrap' },
        h('a', { class: 'btn btn-sm', href: `#/oportunidades/${a.opportunityId}` }, 'Ver oportunidade'),
        h('a', { class: 'btn btn-ghost btn-sm', href: `#/oportunidades/${a.opportunityId}#agenda` }, 'Adicionar à Agenda'),
        a.dados.fonteUrl || a.dados.candidaturaUrl ? ext(a.dados.fonteUrl || a.dados.candidaturaUrl, 'Fonte oficial') : null),
    )),
  );
}

// ---------- Tela principal ----------

const FILTER_KEY = 'radar.filtros';
const readFilters = () => { try { return JSON.parse(sessionStorage.getItem(FILTER_KEY)) || {}; } catch { return {}; } };
const writeFilters = (f) => { try { sessionStorage.setItem(FILTER_KEY, JSON.stringify(f)); } catch { /* sem armazenamento */ } };

export async function radarView() {
  const root = h('div', { class: 'rd stack-lg' });
  let filters = readFilters();
  let limit = 24;
  let me = null;
  let listEl;

  const qs = () => new URLSearchParams(Object.entries({ ...filters, limit }).filter(([, v]) => v !== '' && v !== undefined && v !== null)).toString();

  async function load(withMe = false) {
    const [list, mine] = await Promise.all([
      api.get(`/radar/opportunities?${qs()}`),
      withMe || !me ? api.get('/radar/me').catch(() => null) : Promise.resolve(me),
    ]);
    me = mine;
    return list;
  }

  function filterForm(list) {
    const f = list.facetas;
    const opt = (items, labelFn = (v) => v, all = 'Todos') => [h('option', { value: '' }, all), ...items.filter((i) => i.valor !== 'nao-informado').map((i) => h('option', { value: i.valor }, `${labelFn(i.valor)} (${i.n})`))];
    const sel = (name, label, options, hint) => {
      const s = h('select', { name, 'aria-label': label }, options);
      if (filters[name]) s.value = filters[name];
      return h('label', { class: 'rd-field' }, h('span', {}, label), s, hint ? h('small', {}, hint) : null);
    };
    const stateLabel = Object.fromEntries(list.estados.map((e) => [e.id, e.label]));
    const unknown = (k) => f[k].find((i) => i.valor === 'nao-informado')?.n || 0;
    const search = h('input', { type: 'search', name: 'q', value: filters.q || '', placeholder: 'Nome do mestrado, universidade ou área…', 'aria-label': 'Pesquisar' });
    const check = (name, label) => h('label', { class: 'rd-check' }, h('input', { type: 'checkbox', name, checked: filters[name] === 'sim' }), label);

    const form = h('form', { class: 'rd-filters', role: 'search' },
      h('div', { class: 'rd-search' }, icon('search', { size: 18 }), search, h('button', { class: 'btn', type: 'submit' }, 'Buscar')),
      h('div', { class: 'rd-filter-grid' },
        sel('ano', 'Ano letivo', list.ciclos.map((c) => h('option', { value: c, selected: c === list.anoAcademico }, c))),
        sel('situacao', 'Situação das inscrições', opt(f.situacao, (v) => stateLabel[v] || v, 'Todas')),
        sel('pais', 'País', opt(f.pais)),
        sel('cidade', 'Cidade', opt(f.cidade, (v) => v, 'Todas')),
        sel('universidade', 'Universidade', opt(f.universidade, (v) => v.toUpperCase(), 'Todas')),
        sel('area', 'Área acadêmica', opt(f.area, (v) => v, 'Todas')),
        sel('modalidade', 'Modalidade', opt(f.modalidade, (v) => MODALIDADE[v] || v, 'Todas'), unknown('modalidade') ? `${unknown('modalidade')} ainda sem ficha conferida` : null),
        sel('idioma', 'Idioma de ensino', opt(f.idioma), list.indisponiveis.idioma),
        sel('nivelIdioma', 'Nível de idioma exigido', [h('option', { value: '' }, 'Qualquer'), ...['B1', 'B2', 'C1'].map((n) => h('option', { value: n }, n))], list.indisponiveis.nivelIdioma),
        h('label', { class: 'rd-field' }, h('span', {}, 'Preço máximo (€)'), h('input', { type: 'number', name: 'precoMax', min: '0', step: '100', value: filters.precoMax || '', inputmode: 'numeric' }), h('small', {}, list.indisponiveis.precoMax)),
      ),
      h('div', { class: 'rd-checks' },
        check('bolsas', 'Com bolsas com edital aberto'),
        check('compativel', 'Compatíveis com minha formação'),
        check('acompanhando', 'Só os que acompanho'),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => { filters = {}; writeFilters(filters); draw(); } }, icon('x', { size: 14 }), 'Limpar filtros'),
      ),
    );
    const apply = () => {
      const data = new FormData(form);
      filters = {};
      for (const [k, v] of data.entries()) if (v) filters[k] = v;
      for (const k of ['bolsas', 'compativel', 'acompanhando']) if (form.elements[k].checked) filters[k] = 'sim';
      writeFilters(filters);
      limit = 24;
      draw();
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); apply(); });
    form.addEventListener('change', (e) => { if (e.target.name !== 'q') apply(); });
    return form;
  }

  async function draw(withMe = false) {
    let list;
    try { list = await load(withMe); } catch (e) { toast(e.message, 'err'); return; }
    const i = list.indicadores;
    const redraw = (fresh) => draw(fresh);
    const calendarSource = list.items[0]?.verificacao;
    listEl = h('div', { class: 'rd-grid' }, list.items.map((c) => opportunityCard(c, () => redraw(true))));
    mount(root,
      h('section', { class: 'rd-hero' },
        h('p', { class: 'rd-eyebrow' }, icon('globe', { size: 16 }), 'Radar de Oportunidades'),
        h('h1', {}, 'Seu próximo destino começa aqui'),
        h('p', { class: 'rd-sub' }, 'Descubra mestrados, acompanhe inscrições e encontre oportunidades compatíveis com seu perfil.'),
        h('div', { class: 'rd-stats' },
          stat('Inscrições abertas', i.abertas, list.anoAcademico, 'flag'),
          stat('Inscrições anunciadas', i.anunciadas, 'com datas oficiais futuras', 'calendar'),
          stat('Programas acompanhados', i.programas, i.acompanhadosPorVoce !== null ? `você acompanha ${i.acompanhadosPorVoce}` : 'monitorados pelo Radar', 'cap'),
          stat('Bolsas disponíveis', i.bolsas, 'com edital aberto confirmado', 'euro'),
        ),
        h('p', { class: 'rd-footnote' }, icon('shield', { size: 14 }), `${i.base}${calendarSource ? ` Calendário: ${calendarSource.fonte}, verificado em ${fmtDT(calendarSource.ultimaVerificacao)}.` : ''}`),
      ),
      alertsPanel(me, redraw),
      filterForm(list),
      h('div', { class: 'rd-results-head' },
        h('h2', {}, `${list.total} oportunidade(s) · ${list.anoAcademico}`),
        h('p', { class: 'muted small' }, 'Ordenadas por situação (abertas primeiro) e compatibilidade. Estados calculados por regras sobre datas oficiais, nunca por IA.')),
      list.total ? listEl : h('section', { class: 'rd-empty' }, icon('search', { size: 26 }), h('h3', {}, 'Nenhuma oportunidade com esses filtros'), h('p', { class: 'muted' }, 'Alguns filtros dependem de dados que as fontes oficiais ainda não informam (idioma, nível, preço). Tente remover filtros.')),
      list.items.length < list.total ? h('div', { class: 'center' }, h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => { limit += 24; draw(); } }, `Mostrar mais (${list.total - list.items.length} restantes)`)) : null,
      h('section', { class: 'rd-legend' },
        h('h2', {}, 'O que significa cada estado'),
        h('dl', {}, list.estados.map((e) => [h('dt', {}, h('span', { class: `rd-status rd-tom-${e.tom}` }, h('i', { 'aria-hidden': 'true' }), e.label)), h('dd', {}, e.descricao)])),
        h('p', { class: 'small muted' }, 'Vagas ofertadas não significam vagas disponíveis no momento. A mudança de estado de uma oportunidade não significa que você se candidatou: registre o envio na sua missão.'),
      ),
    );
  }

  await draw(true);
  // Ao vivo: alerta novo ou calendário oficial publicado → atualiza a lista (sem mexer se o estudante está digitando).
  onLive(root, ['radar-alerta', 'radar-atualizado'], () => {
    if (root.contains(document.activeElement) && document.activeElement.matches('input, select, textarea')) return;
    invalidate();
    draw(true);
  });
  return root;
}

// ---------- Detalhe ----------

function phaseTimeline(f) {
  return h('article', { class: `rd-phase rd-phase-${f.estado}` },
    h('header', {},
      h('h3', {}, `Fase ${f.fase}`), h('span', { class: 'muted small' }, PUBLICO[f.publico] || f.publico),
      h('span', { class: 'rd-phase-state' }, f.confirmacao === 'confirmado' ? PHASE_LABEL[f.estado] || '' : 'Previsão')),
    h('ol', { class: 'rd-timeline' },
      h('li', { class: 'rd-tl-main' }, h('span', { class: 'rd-tl-label' }, 'Candidatura'), h('strong', {}, `${fmt(f.candidatura.inicio)} – ${fmt(f.candidatura.fim)}`), h('small', { class: 'muted' }, `Texto oficial: "${f.candidatura.texto}"`)),
      f.eventos.map((e) => h('li', { class: `rd-tl-${e.tipo}` }, h('span', { class: 'rd-tl-label' }, EVENT_LABEL[e.tipo] || e.tipo), h('strong', {}, e.inicio && e.inicio !== e.fim ? `${fmt(e.inicio)} – ${fmt(e.fim)}` : fmt(e.fim || e.inicio)), h('small', { class: 'muted' }, e.rotulo))),
    ),
  );
}

function followPanel(o, redraw) {
  const types = Object.entries(o.tiposDeAlerta);
  const chosen = new Set(o.acompanhamento?.eventos || types.map(([k]) => k));
  const form = h('form', { class: 'rd-follow' },
    h('h2', {}, icon('bell', { size: 18 }), o.acompanhando ? 'Você acompanha esta oportunidade' : 'Avise-me quando abrir'),
    h('p', { class: 'muted small' }, 'Só enviamos alertas de eventos confirmados em fonte oficial, sem repetir a mesma alteração. Canal: notificações na plataforma.'),
    h('div', { class: 'rd-checks-col' }, types.map(([k, label]) => h('label', { class: 'rd-check' }, h('input', { type: 'checkbox', name: k, checked: chosen.has(k) }), label))),
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn', type: 'submit' }, o.acompanhando ? 'Salvar preferências' : 'Acompanhar'),
      o.acompanhando ? h('button', { class: 'btn btn-ghost', type: 'button', onClick: async () => { await api.del(`/radar/opportunities/${o.id}/subscription`); toast('Acompanhamento removido.'); redraw(); } }, 'Parar de acompanhar') : null),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const eventos = types.map(([k]) => k).filter((k) => form.elements[k].checked);
    if (!eventos.length) return toast('Escolha pelo menos um tipo de alerta.', 'err');
    try { await api.put(`/radar/opportunities/${o.id}/subscription`, { eventos }); toast('Preferências salvas.', 'ok'); redraw(); } catch (err) { toast(err.message, 'err'); }
  });
  return form;
}

function agendaPanel(o) {
  if (!o.agenda.length) {
    return h('section', { class: 'rd-panel', id: 'agenda' }, h('h2', {}, icon('calendar', { size: 18 }), 'Agenda'),
      h('p', { class: 'muted' }, o.calendario.length ? 'Não há datas oficiais futuras para este ano acadêmico.' : 'Assim que o calendário oficial for publicado, sugeriremos atividades para antes da abertura, na abertura, antes do encerramento e após o envio.'));
  }
  const MOM = { 'antes-da-abertura': 'Antes da abertura', 'na-abertura': 'Na abertura', 'antes-do-encerramento': 'Antes do encerramento', 'apos-envio': 'Após o envio' };
  const rows = o.agenda.map((s) => {
    const row = h('li', { class: `rd-sug ${s.oficial ? 'oficial' : ''}` },
      h('label', { class: 'rd-check' }, h('input', { type: 'checkbox', name: 'sel', value: s.id, checked: true }), h('span', {}, s.titulo)),
      h('span', { class: 'rd-sug-meta' }, MOM[s.momento]),
      h('input', { type: 'date', name: `data-${s.id}`, value: s.data, disabled: s.oficial, 'aria-label': 'Data', title: s.oficial ? 'Prazo oficial: a data é preservada' : 'Você pode ajustar' }),
      h('input', { type: 'time', name: `ini-${s.id}`, value: s.inicio, 'aria-label': 'Início' }),
      h('input', { type: 'time', name: `fim-${s.id}`, value: s.fim, 'aria-label': 'Fim' }),
      s.oficial ? h('span', { class: 'rd-official-tag' }, icon('lock', { size: 12 }), 'Prazo oficial') : null,
    );
    return row;
  });
  const form = h('form', { class: 'rd-panel', id: 'agenda' },
    h('h2', {}, icon('calendar', { size: 18 }), 'Adicionar à Agenda'),
    h('p', { class: 'muted small' }, 'Sugestões calculadas a partir das datas oficiais. Ajuste os horários e aprove; prazos oficiais mantêm a data original. Se o calendário oficial mudar, avisaremos antes de mexer na sua agenda.'),
    h('ul', { class: 'rd-sugs' }, rows),
    h('button', { class: 'btn', type: 'submit' }, 'Adicionar selecionadas à Agenda'),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const itens = fd.getAll('sel').map((id) => ({ id, data: form.elements[`data-${id}`].disabled ? undefined : fd.get(`data-${id}`), inicio: fd.get(`ini-${id}`), fim: fd.get(`fim-${id}`) }));
    if (!itens.length) return toast('Selecione ao menos uma atividade.', 'err');
    try {
      const r = await api.post(`/radar/opportunities/${o.id}/agenda`, { itens });
      toast(r.criadas ? `${r.criadas} atividade(s) adicionada(s) à Agenda.` : 'Essas atividades já estavam na sua agenda.', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  });
  return form;
}

function missionsPanel(o) {
  const jr = (state.journeys || []).find?.((j) => j.destino?.programa?.id === o.programId);
  return h('section', { class: 'rd-panel' },
    h('h2', {}, icon('target', { size: 18 }), 'Missões relacionadas'),
    h('p', { class: 'muted small' }, jr ? 'As datas oficiais abaixo alimentam as missões da sua jornada.' : 'Adicione este mestrado à sua jornada para que estas datas alimentem as missões.'),
    h('ul', { class: 'rd-missions' }, o.missoes.map((m) => h('li', {},
      h('span', { class: 'rd-mission-id' }, m.missao),
      h('div', {},
        jr ? h('a', { href: `#/j/${jr.id}/m/${m.missao}` }, m.titulo) : h('strong', {}, m.titulo),
        h('small', { class: 'muted' }, `: Rodada ${m.rodada}. ${m.uso}`),
        m.datas.length ? h('p', { class: 'small' }, m.datas.slice(0, 3).map((d) => `Fase ${d.fase}: ${d.inicio && d.inicio !== d.fim ? `${fmt(d.inicio)} – ` : ''}${fmt(d.fim || d.inicio)}`).join(' · ')) : m.semDatas ? h('p', { class: 'small rd-pending' }, 'Aguardando datas oficiais deste ano acadêmico.') : null,
      ),
    ))),
    h('p', { class: 'small muted' }, 'Quando você enviar a candidatura no portal oficial, registre a missão 3.6 como concluída, o Radar não sabe se você se candidatou.'),
  );
}

export async function radarDetailView(id) {
  const root = h('div', { class: 'rd stack-lg' });
  async function draw() {
    const { opportunity: o } = await api.get(`/radar/opportunities/${encodeURIComponent(id)}`);
    const u = o.universidade;
    mount(root,
      h('a', { href: '#/oportunidades', class: 'rd-back' }, icon('back', { size: 16 }), 'Explorar Oportunidades'),
      h('section', { class: `rd-detail-hero rd-card-${o.tom}` },
        h('div', { class: 'rd-card-top' }, statusBadge(o), h('span', { class: 'rd-year' }, icon('calendar', { size: 13 }), `Ano acadêmico ${o.anoAcademico}`)),
        o.demo ? h('p', { class: 'rd-demo-flag' }, 'DADO DEMONSTRATIVO, ambiente de desenvolvimento') : null,
        h('p', { class: 'rd-uni' }, `${u.nome} · ${u.cidade}, ${u.pais}`),
        h('h1', {}, o.programa.nome),
        h('p', { class: 'rd-sub' }, o.estadoDescricao),
        chips(o),
        h('div', { class: 'rd-dates' },
          dateBlock('Abertura', o.abertura, o.fases.length ? '-' : 'Aguardando publicação'),
          dateBlock('Prazo final', o.prazoFinal, o.fases.length ? '-' : 'Aguardando publicação'),
          h('div', { class: 'rd-date' }, h('span', {}, 'Vagas ofertadas'), h('strong', { class: o.vagas.ofertadas ? '' : 'rd-pending' }, o.vagas.ofertadas ? String(o.vagas.ofertadas) : 'Consultar oferta oficial')),
        ),
        verificationLine(o.verificacao),
        h('div', { class: 'rd-actions' },
          o.candidatura ? ext(o.candidatura.url, 'Onde me inscrever', 'btn btn-sm') : null,
          ext(o.programa.fichaUrl, 'Ficha oficial do máster'),
          o.programa.webPropria ? ext(o.programa.webPropria, 'Web do máster') : null,
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', disabled: o.naJornada, onClick: () => addToJourney(o) }, icon('map', { size: 15 }), o.naJornada ? 'Na sua jornada' : 'Adicionar à minha jornada'),
        ),
      ),

      h('section', { class: 'rd-panel' },
        h('h2', {}, icon('calendar', { size: 18 }), `Calendário oficial ${o.anoAcademico}`),
        o.calendario.length
          ? h('div', { class: 'rd-phases' }, o.calendario.map(phaseTimeline))
          : h('div', {},
            h('p', { class: 'rd-nodata' }, icon('alert', { size: 16 }), 'Ainda não encontramos um calendário oficial confirmado para este ano acadêmico. Não usamos datas de anos anteriores como se fossem deste ano.'),
            o.referenciaHistorica ? h('details', { class: 'rd-history-ref', open: true },
              h('summary', {}, `Referência histórica, curso ${o.referenciaHistorica.anoAcademico}`),
              h('p', { class: 'small muted' }, o.referenciaHistorica.aviso),
              h('ul', {}, o.referenciaHistorica.fases.map((f) => h('li', {}, `Fase ${f.fase} (${PUBLICO[f.publico]}): ${fmt(f.abertura)} – ${fmt(f.encerramento)}`)))) : null),
        h('p', { class: 'small muted' }, 'Horários de referência: Madri (Europe/Madrid). Prazos de reclamação não contam sábados e domingos como dias úteis.'),
      ),

      h('div', { class: 'rd-two' },
        followPanel(o, draw),
        h('section', { class: 'rd-panel' },
          h('h2', {}, icon('shield', { size: 18 }), 'Requisitos para brasileiros'),
          h('ul', { class: 'rd-reqs' }, o.requisitos.map((r) => h('li', { class: `rd-req-${r.status}` }, h('strong', {}, { academico: 'Acadêmicos', idioma: 'Idioma', procedimento: 'Procedimento' }[r.tipo]), h('p', {}, r.texto), r.url ? h('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer', class: 'small' }, r.fonte) : null))),
          h('h3', {}, 'Documentos para preparar'),
          h('ul', {}, o.documentos.map((d) => h('li', {}, d))),
        ),
      ),

      agendaPanel(o),
      missionsPanel(o),

      h('section', { class: 'rd-panel' },
        h('h2', {}, icon('clock', { size: 18 }), 'Histórico de alterações'),
        o.historico.length
          ? h('div', { class: 'rd-table-wrap' }, h('table', { class: 'rd-table' },
            h('thead', {}, h('tr', {}, ['Quando', 'Campo', 'Antes', 'Depois', 'Validação', 'Evidência'].map((t) => h('th', {}, t)))),
            h('tbody', {}, o.historico.map((r) => h('tr', {},
              h('td', {}, fmtDT(r.em)), h('td', {}, r.campo), h('td', {}, r.anterior ?? '-'), h('td', {}, r.novo ?? '-'), h('td', {}, r.validacao),
              h('td', {}, r.url && /^https?:/.test(r.url) ? h('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer' }, r.fonte || 'fonte') : r.fonte || '-'))))))
          : h('p', { class: 'muted' }, 'Nenhuma alteração registrada desde o primeiro registro verificado.'),
      ),

      h('section', { class: 'rd-panel' },
        h('h2', {}, icon('link', { size: 18 }), 'Fontes consultadas'),
        h('ul', { class: 'rd-sources' }, o.fontes.map((s) => h('li', {},
          h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.titulo), h('span', { class: 'muted small' }, ` - ${s.instituicao}. Última verificação: ${fmtDT(s.ultimaVerificacao)}${s.metodo === 'revisao-manual' ? ' (conferência manual)' : ''}`)))),
      ),
    );
    if (location.hash.endsWith('#agenda')) root.querySelector('#agenda')?.scrollIntoView();
  }
  await draw();
  return root;
}
