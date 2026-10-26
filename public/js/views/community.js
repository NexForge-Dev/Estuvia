// Comunidade colaborativa: feed com filtros, publicação, grupos, oportunidades verificadas,
// salvos, "Minhas oportunidades" (missões geradas) e moderação. Rota: #/comunidade[/secao[/id]].
import { h, mount, toast } from '../ui.js';
import { api } from '../api.js';
import { state, go } from '../app.js';
import { PostCard, Composer, ReportForm, ensureStyles, icon, timeAgo, fmtDate, daysLeft, verificationBadge } from './community-parts.js';

let metaCache = null;
const filters = { categoria: '', universidade: '', cidade: '', pais: '', ordem: 'relevancia', q: '', tipo: '' };

export async function communityView(secao = '', id = '') {
  ensureStyles();
  const [meta, { grupos }] = await Promise.all([metaCache ? Promise.resolve(metaCache) : api.get('/community/meta'), api.get('/community/groups')]);
  metaCache = meta;
  const ctx = { meta, grupos };
  const body = h('div', { class: 'cm-body' });
  const root = h('div', { class: 'cm-root' }, Header(meta, secao), body);

  if (secao === 'post' && id) mount(body, await PostDetail(ctx, id));
  else if (secao === 'grupos') mount(body, GroupsSection(ctx));
  else if (secao === 'grupo' && id) mount(body, await GroupFeed(ctx, id));
  else if (secao === 'radar') mount(body, await VerifiedSection(ctx));
  else if (secao === 'oportunidades') mount(body, await MyOpportunities(ctx));
  else if (secao === 'salvos') mount(body, Feed(ctx, { fixed: { salvos: '1' }, title: 'Salvos', empty: 'Nada salvo ainda. Use "Salvar" nas publicações para guardar aqui.' }));
  else if (secao === 'missao' && id) mount(body, Feed(ctx, { fixed: { missao: id }, missaoId: id, title: `Experiências da missão ${id}`, empty: 'Ainda não há relatos para esta missão. Seja a primeira pessoa a contar como foi.' }));
  else if (secao === 'moderacao') {
    if (!meta.moderador) mount(body, h('p', { class: 'notice' }, 'Área restrita à moderação.'));
    else mount(body, await (await import('./community-mod.js')).ModerationPanel(ctx));
  } else mount(body, Feed(ctx, { withFilters: true }));
  return root;
}

function Header(meta, secao) {
  const tab = (href, label, ic, active) => h('a', { href: `#/comunidade${href}`, class: `cm-tab ${active ? 'on' : ''}`, 'aria-current': active ? 'page' : false }, icon(ic, { size: 16 }), label);
  return h('header', { class: 'cm-header' },
    h('div', {},
      h('span', { class: 'eyebrow' }, 'Comunidade'),
      h('h1', {}, 'Descubra, confira e transforme em ação'),
      h('p', { class: 'muted' }, 'Oportunidades, dúvidas e experiências de quem está no mesmo caminho. Cada publicação mostra o quanto é confiável — e você leva o que importa para a sua jornada e a sua agenda.')),
    h('nav', { class: 'cm-tabs', 'aria-label': 'Seções da comunidade' },
      tab('', 'Feed', 'home', !secao || secao === 'post' || secao === 'missao'),
      tab('/grupos', 'Grupos', 'users', secao === 'grupos' || secao === 'grupo'),
      tab('/radar', 'Verificadas', 'shield', secao === 'radar'),
      tab('/salvos', 'Salvos', 'bookmark', secao === 'salvos'),
      tab('/oportunidades', 'Minhas oportunidades', 'target', secao === 'oportunidades'),
      meta.moderador ? tab('/moderacao', 'Moderação', 'scale', secao === 'moderacao') : null),
  );
}

// ---------- Feed ----------

function Feed(ctx, { withFilters = false, fixed = {}, title = '', empty = 'Nenhuma publicação encontrada com esses filtros.', grupoId = '', missaoId = '' } = {}) {
  const list = h('div', { class: 'cm-list', 'aria-live': 'polite' });
  const more = h('button', { type: 'button', class: 'btn btn-ghost cm-more-btn', hidden: true }, 'Carregar mais');
  const composerSlot = h('div');
  let page = 1;

  const cardCtx = {
    ...ctx,
    onEdit: (post) => openComposer(post),
    onDeleted: () => { if (!list.querySelector('.cm-post')) load(); },
  };

  function openComposer(initial = null) {
    mount(composerSlot, Composer({
      ...ctx, initial, grupoId, missaoId,
      onCancel: () => mount(composerSlot, ComposerPrompt()),
      onDone: () => { mount(composerSlot, ComposerPrompt()); load(); },
    }));
    composerSlot.querySelector('textarea, select')?.focus();
  }

  const ComposerPrompt = () => h('button', { type: 'button', class: 'cm-prompt card', onClick: () => openComposer() },
    h('span', { class: 'cm-avatar', 'aria-hidden': 'true' }, state.me?.user?.profile?.avatar || '🎓'),
    h('span', { class: 'muted' }, missaoId ? 'Conte como foi esta etapa para você…' : 'Compartilhe uma oportunidade, dúvida ou experiência…'),
    h('span', { class: 'btn btn-sm' }, icon('edit', { size: 15 }), 'Publicar'));
  mount(composerSlot, ComposerPrompt());

  async function load(append = false) {
    page = append ? page + 1 : 1;
    const params = new URLSearchParams({ ...(withFilters ? filters : { ordem: 'recentes' }), ...fixed, pagina: String(page) });
    [...params.keys()].forEach((k) => { if (!params.get(k)) params.delete(k); });
    if (!append) mount(list, h('div', { class: 'skeleton sk-card' }), h('div', { class: 'skeleton sk-card' }));
    try {
      const r = await api.get(`/community/posts?${params}`);
      if (!append) list.replaceChildren();
      r.posts.forEach((p) => list.append(PostCard(p, cardCtx)));
      if (!list.children.length) list.append(h('div', { class: 'cm-empty card card-soft' }, icon('chat', { size: 26 }), h('p', {}, empty)));
      more.hidden = !r.temMais;
    } catch (e) {
      mount(list, h('p', { class: 'form-error' }, e.message));
    }
  }
  more.addEventListener('click', () => load(true));
  load();

  return h('div', { class: withFilters ? 'cm-layout' : 'stack' },
    h('div', { class: 'cm-main stack' }, title ? h('h2', {}, title) : null, composerSlot, list, more),
    withFilters ? Filters(ctx, () => load()) : null);
}

function Filters({ meta }, onChange) {
  const opt = (v, l, cur) => h('option', { value: v, selected: v === cur }, l);
  const set = (k) => (e) => { filters[k] = e.target.value; onChange(); };
  let timer;
  const search = h('input', { type: 'search', placeholder: 'Buscar no feed…', value: filters.q, 'aria-label': 'Buscar', onInput: (e) => { clearTimeout(timer); timer = setTimeout(() => { filters.q = e.target.value.trim(); onChange(); }, 300); } });
  const chips = h('div', { class: 'cm-chips', role: 'group', 'aria-label': 'Categorias' });
  const drawChips = () => chips.replaceChildren(
    ...[['', 'Tudo', 'compass'], ...Object.entries(meta.categorias).map(([v, c]) => [v, c.curto, c.icone])].map(([v, l, ic]) =>
      h('button', { type: 'button', class: `chip ${filters.categoria === v ? 'on' : ''}`, 'aria-pressed': String(filters.categoria === v), onClick: () => { filters.categoria = v; drawChips(); onChange(); } }, icon(ic, { size: 14 }), l)));
  drawChips();
  const lbl = (text, control) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, text), control);
  // No celular os filtros ficam recolhidos para o feed aparecer primeiro.
  return h('aside', { class: 'cm-filters card', 'aria-label': 'Filtros' }, h('details', { class: 'cm-filters-box', open: matchMedia('(min-width: 900px)').matches },
    h('summary', { class: 'cm-filters-title' }, icon('filter', { size: 17 }), 'Filtros'),
    h('div', { class: 'cm-filters-body' },
    search,
    chips,
    lbl('Ordenar por', h('select', { onChange: set('ordem') }, opt('relevancia', 'Relevância', filters.ordem), opt('recentes', 'Mais recentes', filters.ordem), opt('prazo', 'Prazo mais próximo', filters.ordem))),
    lbl('Tipo', h('select', { onChange: set('tipo') }, opt('', 'Todos', filters.tipo), opt('oportunidade', 'Só oportunidades', filters.tipo), opt('publicacao', 'Só publicações', filters.tipo))),
    lbl('Universidade', h('select', { onChange: set('universidade') }, opt('', 'Todas', filters.universidade), meta.universidades.map((u) => opt(u.id, u.sigla, filters.universidade)))),
    lbl('Cidade', h('select', { onChange: set('cidade') }, opt('', 'Todas', filters.cidade), meta.cidades.map((c) => opt(c, c, filters.cidade)))),
    lbl('País', h('select', { onChange: set('pais') }, opt('', 'Todos', filters.pais), meta.paises.map((c) => opt(c, c, filters.pais)))),
    h('div', { class: 'cm-legend' },
      h('h3', {}, 'Como ler os selos'),
      Object.entries(meta.verificacao).map(([k, v]) => h('p', { class: 'small' }, verificationBadge(meta, { status: k }), ' ', h('span', { class: 'muted' }, v.descricao)))))),
  );
}

// ---------- Detalhe com comentários ----------

async function PostDetail(ctx, id) {
  const { post, comentarios } = await api.get(`/community/posts/${id}`);
  const list = h('ol', { class: 'cm-comments' });
  const draw = (cm) => {
    const li = h('li', { class: `cm-comment ${cm.moderacao.estado !== 'publicado' ? 'cm-held' : ''}` },
      h('span', { class: 'cm-avatar sm', 'aria-hidden': 'true' }, cm.autor.avatar),
      h('div', { class: 'cm-comment-body' },
        h('p', { class: 'small' }, h('strong', {}, cm.autor.nome), cm.autor.moderador ? h('span', { class: 'cm-mod-badge' }, 'Equipe') : null, h('span', { class: 'muted' }, ` · ${timeAgo(cm.criadoEm)}`),
          cm.moderacao.estado !== 'publicado' ? h('span', { class: 'muted' }, ' · em revisão') : null),
        h('p', { class: 'cm-text' }, cm.texto),
        h('div', { class: 'row' }, cm.meu
          ? h('button', { type: 'button', class: 'cm-link-btn', onClick: async () => { try { await api.del(`/community/comments/${cm.id}`); li.remove(); } catch (e) { toast(e.message, 'err'); } } }, 'Excluir')
          : h('button', { type: 'button', class: 'cm-link-btn', onClick: () => ReportForm(li, ctx.meta, `/community/comments/${cm.id}/report`) }, 'Denunciar'))));
    list.append(li);
  };
  comentarios.forEach(draw);

  const form = h('form', { class: 'cm-comment-form' },
    h('label', { class: 'sr-only', for: 'cm-new-comment' }, 'Comentário'),
    h('textarea', { id: 'cm-new-comment', name: 'texto', rows: 2, maxlength: 2000, required: true, placeholder: 'Escreva um comentário. Sem dados pessoais.' }),
    h('button', { type: 'submit', class: 'btn' }, icon('send', { size: 16 }), 'Comentar'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api.post(`/community/posts/${id}/comments`, { texto: form.texto.value });
      (r.avisos || []).forEach((a) => toast(a, 'info'));
      draw(r.comentario);
      form.reset();
    } catch (err) { toast(err.message, 'err'); }
  });

  return h('div', { class: 'cm-detail stack-lg' },
    h('a', { href: '#/comunidade', class: 'cm-back' }, icon('back', { size: 16 }), 'Voltar ao feed'),
    PostCard(post, { ...ctx, detail: true, onEdit: () => go('/comunidade'), onDeleted: () => go('/comunidade') }),
    h('section', { class: 'card stack', 'aria-label': 'Comentários' }, h('h2', {}, `Comentários (${comentarios.length})`), list, form));
}

// ---------- Grupos ----------

function GroupsSection(ctx) {
  const grid = h('div', { class: 'cm-groups' });
  const TYPE = { universidade: 'cap', cidade: 'pin', pais: 'globe' };
  const draw = () => grid.replaceChildren(...ctx.grupos.map((g) => h('article', { class: 'cm-group card' },
    h('div', { class: 'row between' },
      h('span', { class: 'cm-group-icon' }, icon(TYPE[g.tipo] || 'users', { size: 20 })),
      g.oficial ? h('span', { class: 'cm-tag' }, 'Grupo da plataforma') : null),
    h('h3', {}, h('a', { href: `#/comunidade/grupo/${g.id}` }, g.nome)),
    h('p', { class: 'muted small' }, g.descricao || [g.cidade, g.pais].filter(Boolean).join(', ')),
    h('p', { class: 'small muted' }, `${g.membros} ${g.membros === 1 ? 'membro' : 'membros'} · ${g.publicacoes} publicações`),
    h('button', { type: 'button', class: `btn btn-sm ${g.participo ? 'btn-ghost' : ''}`, onClick: async () => {
      try { const r = await api.post(`/community/groups/${g.id}/join`); Object.assign(g, r.grupo); draw(); } catch (e) { toast(e.message, 'err'); }
    } }, g.participo ? 'Sair do grupo' : 'Participar'))));
  draw();

  const err = h('p', { class: 'form-error', hidden: true });
  const uniSel = h('select', { name: 'universidadeId' }, h('option', { value: '' }, '—'), ctx.meta.universidades.map((u) => h('option', { value: u.id }, `${u.sigla} — ${u.nome}`)));
  const form = h('form', { class: 'card stack cm-new-group' },
    h('h2', {}, 'Criar um grupo'),
    h('p', { class: 'muted small' }, 'Por universidade, cidade ou país — por exemplo "Brasileiros na UCO" ou "Estudantes em Málaga".'),
    h('div', { class: 'grid-2' },
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Nome'), h('input', { name: 'nome', maxlength: 60, required: true })),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Tipo'), h('select', { name: 'tipo' }, h('option', { value: 'universidade' }, 'Universidade'), h('option', { value: 'cidade' }, 'Cidade'), h('option', { value: 'pais' }, 'País')))),
    h('div', { class: 'grid-3' },
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Universidade'), uniSel),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Cidade'), h('input', { name: 'cidade', maxlength: 60 })),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'País'), h('input', { name: 'pais', value: 'Espanha', maxlength: 60, required: true }))),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Descrição'), h('textarea', { name: 'descricao', rows: 2, maxlength: 240 })),
    err,
    h('button', { type: 'submit', class: 'btn' }, 'Criar grupo'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    Object.keys(f).forEach((k) => { if (!f[k]) delete f[k]; });
    try {
      const r = await api.post('/community/groups', f);
      ctx.grupos.unshift(r.grupo);
      draw(); form.reset(); err.hidden = true;
      toast('Grupo criado.', 'ok');
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
  return h('div', { class: 'stack-lg' }, grid, form);
}

async function GroupFeed(ctx, id) {
  const g = ctx.grupos.find((x) => x.id === id);
  if (!g) return h('p', { class: 'notice' }, 'Grupo não encontrado.');
  const join = h('button', { type: 'button', class: `btn btn-sm ${g.participo ? 'btn-ghost' : ''}`, onClick: async () => {
    try { const r = await api.post(`/community/groups/${g.id}/join`); Object.assign(g, r.grupo); join.textContent = g.participo ? 'Sair do grupo' : 'Participar'; join.classList.toggle('btn-ghost', g.participo); }
    catch (e) { toast(e.message, 'err'); }
  } }, g.participo ? 'Sair do grupo' : 'Participar');
  return h('div', { class: 'stack-lg' },
    h('section', { class: 'card cm-group-head' },
      h('a', { href: '#/comunidade/grupos', class: 'cm-back' }, icon('back', { size: 16 }), 'Grupos'),
      h('div', { class: 'row between wrap' }, h('h2', {}, g.nome), join),
      h('p', { class: 'muted' }, g.descricao), h('p', { class: 'small muted' }, `${g.membros} membros`)),
    Feed(ctx, { fixed: { grupo: g.id }, grupoId: g.id, empty: 'Este grupo ainda não tem publicações.' }));
}

// ---------- Oportunidades verificadas (alimentam o Radar) ----------

async function VerifiedSection() {
  const { itens } = await api.get('/community/radar');
  return h('div', { class: 'stack' },
    h('div', { class: 'cm-notice cm-notice-info' }, icon('shield', { size: 16 }),
      h('span', {}, 'Oportunidades da comunidade conferidas pela equipe no edital oficial (link, requisitos e datas). Elas seguem para revisão do ', h('a', { href: '#/oportunidades' }, 'Radar de Oportunidades'), ' — duplicatas viram um item só.')),
    itens.length
      ? h('div', { class: 'cm-verified' }, itens.map((o) => h('article', { class: 'card cm-verified-item' },
        h('p', { class: 'eyebrow' }, o.instituicao),
        h('h3', {}, h('a', { href: `#/comunidade/post/${o.postId}` }, o.titulo)),
        h('p', { class: `cm-deadline ${o.diasRestantes <= 14 ? 'soon' : ''}` }, icon('calendar', { size: 14 }), `${fmtDate(o.prazo)} · faltam ${o.diasRestantes} dias`),
        h('p', { class: 'small muted' }, `Verificada em ${fmtDate(o.verificadaEm)}`),
        h('div', { class: 'row wrap' },
          o.naJornada ? h('span', { class: 'cm-tag' }, icon('check', { size: 13 }), 'Na jornada') : null,
          o.naAgenda ? h('span', { class: 'cm-tag' }, icon('calendar', { size: 13 }), 'Na agenda') : null,
          h('a', { class: 'btn btn-ghost btn-sm', href: o.linkOficial, target: '_blank', rel: 'noopener noreferrer' }, 'Edital oficial', icon('external', { size: 14 }))))))
      : h('div', { class: 'cm-empty card card-soft' }, icon('shield', { size: 26 }), h('p', {}, 'Nenhuma oportunidade verificada com prazo aberto agora.')));
}

// ---------- Minhas oportunidades (missões de avaliação e candidatura) ----------

async function MyOpportunities() {
  const wrap = h('div', { class: 'stack' });
  const DECISAO = { avaliando: 'Avaliando', candidatar: 'Vou me candidatar', enviada: 'Candidatura enviada', descartar: 'Descartada' };

  const draw = (ops) => {
    if (!ops.length) {
      return mount(wrap, h('div', { class: 'cm-empty card card-soft' }, icon('target', { size: 26 }),
        h('p', {}, 'Use "Adicionar à minha jornada" numa oportunidade do feed para gerar uma missão de avaliação.'),
        h('a', { href: '#/comunidade', class: 'btn btn-sm' }, 'Explorar o feed')));
    }
    mount(wrap, ...ops.map((o) => {
      const save = async (body) => { try { draw((await api.put(`/community/my-opportunities/${o.id}`, body)).oportunidades); } catch (e) { toast(e.message, 'err'); } };
      const check = (x) => h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: x.feito, disabled: x.id === 'decisao', onChange: (e) => save({ objetivo: x.id, feito: e.target.checked }) }), h('span', {}, x.titulo));
      const d = o.snapshot.prazo ? daysLeft(o.snapshot.prazo) : null;
      const bar = h('span', { class: 'cm-bar-fill' }); bar.style.width = `${Math.round(o.progresso * 100)}%`;
      return h('article', { class: `card cm-myop ${o.decisao === 'descartar' ? 'cm-dim' : ''}` },
        o.alteracao ? h('div', { class: 'cm-notice cm-notice-warn' }, icon('bell', { size: 15 }),
          h('span', {}, `Edital alterado (${o.alteracao.campos.join(', ')}) em ${fmtDate(o.alteracao.em)}: ${o.alteracao.nota} Sua agenda já foi atualizada.`),
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => save({ cienteAlteracao: true }) }, 'Entendi')) : null,
        h('div', { class: 'row between wrap' },
          h('div', {}, h('p', { class: 'eyebrow' }, o.snapshot.instituicao), h('h3', {}, o.missao.titulo)),
          h('span', { class: 'cm-tag' }, DECISAO[o.decisao])),
        h('p', { class: 'small muted' },
          o.snapshot.prazo ? `Prazo: ${fmtDate(o.snapshot.prazo)}${d >= 0 ? ` (faltam ${d} dias)` : ' (encerrado)'} · ` : '',
          o.verificacao === 'verificada' ? 'verificada pela equipe' : 'ainda não verificada — confira no edital',
          o.publicacaoDisponivel ? [' · ', h('a', { href: `#/comunidade/post/${o.postId}` }, 'ver publicação')] : ''),
        h('div', { class: 'cm-bar', role: 'progressbar', 'aria-valuenow': Math.round(o.progresso * 100), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Progresso da missão' }, bar),
        h('h4', {}, 'Missão: avaliar a oportunidade'),
        h('div', { class: 'stack cm-checks' }, o.missao.objetivos.map(check)),
        o.atividades.length ? [h('h4', {}, 'Atividades de candidatura'), h('div', { class: 'stack cm-checks' }, o.atividades.map(check))] : null,
        h('div', { class: 'row wrap' },
          o.decisao === 'avaliando' ? [
            h('button', { type: 'button', class: 'btn btn-sm', onClick: () => save({ decisao: 'candidatar' }) }, 'Vou me candidatar'),
            h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => save({ decisao: 'descartar' }) }, 'Descartar')] : null,
          o.decisao === 'candidatar' ? h('button', { type: 'button', class: 'btn btn-sm', onClick: () => save({ decisao: 'enviada' }) }, 'Marquei como enviada') : null,
          o.decisao === 'descartar' ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => save({ decisao: 'avaliando' }) }, 'Reconsiderar') : null,
          h('a', { class: 'btn btn-ghost btn-sm', href: o.snapshot.linkOficial, target: '_blank', rel: 'noopener noreferrer' }, 'Edital oficial', icon('external', { size: 14 })),
          h('button', { type: 'button', class: 'cm-link-btn', onClick: async () => { try { draw((await api.del(`/community/my-opportunities/${o.id}`)).oportunidades); } catch (e) { toast(e.message, 'err'); } } }, 'Remover da jornada')));
    }));
  };
  draw((await api.get('/community/my-opportunities')).oportunidades);
  return h('div', { class: 'stack' },
    h('p', { class: 'muted' }, 'Cada oportunidade que você adiciona vira uma missão de avaliação. Se decidir se candidatar, as atividades de candidatura aparecem aqui; os prazos podem ir para a sua ', h('a', { href: '#/agenda' }, 'Agenda'), '.'),
    wrap);
}
