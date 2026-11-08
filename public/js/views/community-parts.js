// Peças da Comunidade: cartão de publicação, compositor, selos de confiança e utilitários.
// Todo texto de usuário entra via textContent (h/ui.js); links passam pela análise do servidor.
import { h, toast } from '../ui.js';
import { icon as baseIcon } from '../icons.js';
import { api } from '../api.js';

// Ícones que ainda não existem em icons.js (mesmo traço 24×24); o resto vem de lá.
const EXTRA_ICONS = {
  heart: ['M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z'],
  bookmark: ['m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z'],
  share: ['M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'm8.6 13.5 6.8 4', 'm15.4 6.5-6.8 4'],
};

export function icon(name, opts = {}) {
  const svg = baseIcon(EXTRA_ICONS[name] ? 'minus' : name, opts);
  if (EXTRA_ICONS[name]) {
    svg.replaceChildren(...EXTRA_ICONS[name].map((d) => {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', d);
      return p;
    }));
  }
  return svg;
}

// Requisições que precisam do corpo da resposta mesmo em erro (ex.: duplicata) ou de corpo binário.
export async function call(method, url, body, { raw, type } = {}) {
  const res = await fetch(`/api${url}`, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': type || 'application/json', 'X-Requested-With': 'travessia' },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export function ensureStyles() {
  if (document.querySelector('link[data-community]')) return;
  document.head.append(h('link', { rel: 'stylesheet', href: '/css/community.css', 'data-community': '' }));
}

export const fmtDate = (iso) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

export function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 7) return `há ${Math.floor(s / 86400)} d`;
  return fmtDate(iso);
}

export const daysLeft = (iso) => Math.round((new Date(`${iso}T12:00:00`) - new Date(`${new Date().toISOString().slice(0, 10)}T12:00:00`)) / 86400000);

// ---------- Selos ----------

const VER_ICON = { 'nao-verificada': 'alert', 'em-verificacao': 'hourglass', verificada: 'shield', desatualizada: 'clock', rejeitada: 'x' };

export function verificationBadge(meta, v) {
  if (!v) return null;
  const info = meta.verificacao[v.status];
  return h('span', { class: `cm-ver cm-ver-${v.status}`, title: v.motivo || info.descricao }, icon(VER_ICON[v.status], { size: 14 }), info.label);
}

export function natureTag(meta, post) {
  if (post.tipo === 'oportunidade') return h('span', { class: 'cm-tag cm-tag-op' }, icon('target', { size: 13 }), 'Oportunidade');
  const n = meta.naturezas[post.natureza];
  return n ? h('span', { class: `cm-tag cm-tag-${post.natureza}`, title: n.descricao }, n.label) : null;
}

const LINK_LABEL = { institucional: 'Domínio institucional', comum: 'Link externo', atencao: 'Sem https', suspeito: 'Link suspeito' };

export function linkChip(l) {
  if (l.nivel === 'suspeito') {
    // Link suspeito nunca é clicável: mostra o endereço e os motivos.
    return h('span', { class: 'cm-link cm-link-suspeito', title: l.motivos.join(' ') }, icon('alert', { size: 13 }), `${LINK_LABEL.suspeito}: ${l.host || l.url}`);
  }
  return h('a', { class: `cm-link cm-link-${l.nivel}`, href: l.url, target: '_blank', rel: 'noopener noreferrer nofollow', title: l.motivos.join(' ') || LINK_LABEL[l.nivel] },
    icon(l.nivel === 'institucional' ? 'shield' : 'external', { size: 13 }), l.host, h('small', {}, ` · ${LINK_LABEL[l.nivel]}`));
}

// Texto com links: URLs viram âncoras seguras; links suspeitos ficam como texto.
export function postText(text, links) {
  const p = h('p', { class: 'cm-text' });
  const byUrl = new Map(links.map((l) => [l.url, l]));
  let last = 0;
  for (const m of text.matchAll(/\bhttps?:\/\/[^\s<>"')\]]+/gi)) {
    p.append(text.slice(last, m.index));
    let info = byUrl.get(m[0]);
    if (!info) { try { info = byUrl.get(new URL(m[0]).href); } catch { /* inválido */ } }
    p.append(info && info.nivel !== 'suspeito'
      ? h('a', { href: info.url, target: '_blank', rel: 'noopener noreferrer nofollow' }, m[0])
      : h('span', { class: 'cm-dead-link', title: 'Link suspeito: não clicável' }, m[0]));
    last = m.index + m[0].length;
  }
  p.append(text.slice(last));
  return p;
}

// ---------- Cartão de publicação ----------

export function PostCard(post, ctx) {
  const { meta, onChange, detail = false } = ctx;
  const cat = meta.categorias[post.categoria];
  const el = h('article', { class: `cm-post card ${post.moderacao.estado !== 'publicado' ? 'cm-held' : ''}`, 'aria-label': post.titulo || 'Publicação' });

  const replace = (next) => { const fresh = PostCard(next, ctx); el.replaceWith(fresh); onChange?.(next); };
  const act = async (fn, okMsg) => {
    try { const r = await fn(); if (r?.post) replace(r.post); if (okMsg) toast(okMsg, 'ok'); return r; }
    catch (e) { toast(e.message, 'err'); return null; }
  };

  const head = h('header', { class: 'cm-post-head' },
    h('span', { class: 'cm-avatar', 'aria-hidden': 'true' }, post.autor.avatar),
    h('div', { class: 'cm-who' },
      h('strong', {}, post.autor.nome, post.autor.moderador ? h('span', { class: 'cm-mod-badge' }, 'Equipe') : null),
      h('span', { class: 'muted small' },
        h('a', { href: `#/comunidade/post/${post.id}`, class: 'cm-time' }, timeAgo(post.criadoEm)),
        post.editadoEm ? ' · editado' : '',
        post.grupo ? [' · ', h('a', { href: `#/comunidade/grupo/${post.grupo.id}` }, post.grupo.nome)] : '')),
    h('div', { class: 'cm-badges' },
      cat ? h('span', { class: 'cm-tag' }, icon(cat.icone, { size: 13 }), cat.curto) : null,
      natureTag(meta, post),
      verificationBadge(meta, post.verificacao)),
  );

  const held = post.moderacao.estado !== 'publicado'
    ? h('p', { class: 'cm-notice cm-notice-warn' }, icon('hourglass', { size: 15 }), h('span', {},
      { 'em-revisao': 'Em revisão pela moderação, só você e a equipe veem por enquanto.', oculto: 'Ocultada pela moderação.', removido: 'Removida pela moderação.' }[post.moderacao.estado] || '',
      post.moderacao.motivos?.length ? h('small', {}, ` Motivos: ${post.moderacao.motivos.join(' ')}`) : null))
    : null;

  // Relato pessoal em tema sensível (vistos, documentos, dinheiro) nunca parece orientação oficial.
  const sensitive = cat?.sensivel && post.natureza !== 'orientacao-oficial' && post.tipo !== 'oportunidade'
    ? h('p', { class: 'cm-notice cm-notice-info' }, icon('alert', { size: 15 }),
      h('span', {}, `${meta.naturezas[post.natureza]?.label || 'Relato'}, não é orientação oficial. Regras de visto, documentos e comprovação financeira mudam por consulado e por ano: confirme sempre na `, h('a', { href: '#/fontes' }, 'Central de fontes'), '.'))
    : post.natureza === 'orientacao-oficial' && post.verificacao?.status !== 'verificada'
      ? h('p', { class: 'cm-notice cm-notice-info' }, icon('shield', { size: 15 }), h('span', {}, 'Cita uma fonte oficial, mas ainda não foi conferida pela equipe. Leia a fonte antes de agir.'))
      : null;

  const op = post.oportunidade ? OpportunityBox(post, meta) : null;
  const imgs = post.imagens.length
    ? h('div', { class: `cm-images n${Math.min(post.imagens.length, 4)}` }, post.imagens.map((src) => h('a', { href: src, target: '_blank', rel: 'noopener' }, h('img', { src, alt: 'Imagem da publicação', loading: 'lazy' }))))
    : null;
  const otherLinks = post.links.filter((l) => l.url !== post.oportunidade?.linkOficial);

  const btn = (ic, label, onClick, { on = false, cls = '' } = {}) =>
    h('button', { type: 'button', class: `cm-action ${on ? 'on' : ''} ${cls}`, 'aria-pressed': String(on), onClick }, icon(ic, { size: 17 }), h('span', {}, label));

  async function share() {
    const r = await act(() => api.post(`/community/posts/${post.id}/share`));
    if (!r) return;
    const url = `${location.origin}${r.link}`;
    try {
      if (navigator.share) await navigator.share({ title: post.titulo || 'Publicação na comunidade', url });
      else { await navigator.clipboard.writeText(url); toast('Link copiado.', 'ok'); }
    } catch { /* compartilhamento cancelado */ }
  }

  const actions = h('footer', { class: 'cm-actions' },
    btn('heart', String(post.curtidas || ''), () => act(() => api.post(`/community/posts/${post.id}/like`)), { on: post.curti }),
    btn('chat', String(post.comentarios || ''), () => { location.hash = `#/comunidade/post/${post.id}`; }),
    btn('bookmark', post.salvei ? 'Salvo' : 'Salvar', () => act(() => api.post(`/community/posts/${post.id}/save`), post.salvei ? null : 'Salvo na sua lista.'), { on: post.salvei }),
    btn('share', 'Compartilhar', share),
    h('span', { class: 'cm-spacer' }),
    PostMenu(post, ctx, { act, el }),
  );

  const opActions = post.tipo === 'oportunidade' && post.moderacao.estado === 'publicado' && post.verificacao?.status !== 'rejeitada'
    ? h('div', { class: 'cm-op-actions' },
      post.naJornada
        ? h('a', { class: 'btn btn-ghost btn-sm', href: '#/comunidade/oportunidades' }, icon('check', { size: 15 }), 'Na sua jornada')
        : h('button', { type: 'button', class: 'btn btn-sm', onClick: () => addToJourney(post, ctx, replace) }, icon('map', { size: 15 }), 'Adicionar à minha jornada'),
      post.oportunidade.prazo && daysLeft(post.oportunidade.prazo) >= 0
        ? post.naAgenda
          ? h('a', { class: 'btn btn-ghost btn-sm', href: '#/agenda' }, icon('calendar', { size: 15 }), 'Na sua agenda')
          : h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => addToAgenda(post, replace) }, icon('calendar', { size: 15 }), 'Prazo na agenda')
        : null,
      ['nao-verificada', 'desatualizada'].includes(post.verificacao?.status)
        ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => act(() => api.post(`/community/posts/${post.id}/verification-request`), 'Pedido enviado à equipe.') }, icon('shield', { size: 15 }), 'Pedir verificação')
        : null)
    : post.natureza === 'orientacao-oficial' && post.verificacao?.status === 'nao-verificada'
      ? h('div', { class: 'cm-op-actions' }, h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => act(() => api.post(`/community/posts/${post.id}/verification-request`), 'Pedido enviado à equipe.') }, icon('shield', { size: 15 }), 'Pedir verificação'))
      : null;

  // append nativo escreveria "null": filtra as partes ausentes.
  el.append(...[head, held,
    post.titulo && post.tipo !== 'oportunidade' ? h(detail ? 'h1' : 'h3', { class: 'cm-title' }, post.titulo) : null,
    op, postText(post.texto, post.links), imgs,
    otherLinks.length ? h('div', { class: 'cm-links' }, otherLinks.map(linkChip)) : null,
    sensitive, opActions, actions].filter(Boolean));
  return el;
}

function OpportunityBox(post, meta) {
  const o = post.oportunidade;
  const d = o.prazo ? daysLeft(o.prazo) : null;
  const v = post.verificacao?.status;
  return h('section', { class: 'cm-op' },
    h('p', { class: 'eyebrow' }, o.instituicao),
    h('h3', {}, o.titulo),
    h('dl', { class: 'cm-op-facts' },
      h('dt', {}, 'Prazo'),
      h('dd', {}, o.prazo
        ? h('span', { class: `cm-deadline ${d < 0 ? 'late' : d <= 14 ? 'soon' : ''}` }, icon('calendar', { size: 14 }), fmtDate(o.prazo), d >= 0 ? ` · faltam ${d} dias` : ' · encerrado')
        : h('span', { class: 'muted' }, 'Não informado')),
      o.requisitos.length ? [h('dt', {}, 'Requisitos'), h('dd', {}, h('ul', {}, o.requisitos.map((r) => h('li', {}, r))))] : null,
      h('dt', {}, 'Fonte'),
      h('dd', {}, linkChip(post.links.find((l) => l.url === o.linkOficial) || { url: o.linkOficial, host: o.linkOficial, nivel: 'comum', motivos: [] }))),
    post.radarOficial
      ? h('p', { class: 'cm-trust ok' }, icon('compass', { size: 15 }), 'Este programa está no Radar oficial: ', h('a', { href: post.radarOficial.url }, 'ver datas oficiais'), '.')
      : null,
    v === 'verificada'
      ? h('p', { class: 'cm-trust ok' }, icon('shield', { size: 15 }), `Verificada pela equipe ${post.verificacao.verificadaEm ? `em ${fmtDate(post.verificacao.verificadaEm)}` : ''} no edital oficial. Ainda assim, a candidatura é feita no sistema oficial.`)
      : h('p', { class: 'cm-trust' }, icon('alert', { size: 15 }), `${meta.verificacao[v]?.descricao || ''} Um link para site oficial não torna a publicação oficial.`),
  );
}

async function addToJourney(post, ctx, replace) {
  const jornadas = ctx.meta.jornadas || [];
  const body = jornadas.length === 1 ? { journeyId: jornadas[0].id } : {};
  try {
    await api.post(`/community/posts/${post.id}/journey`, body);
    toast('Missão "Avaliar oportunidade" criada na sua jornada.', 'ok');
    replace({ ...post, naJornada: true });
  } catch (e) { toast(e.message, 'err'); }
}

async function addToAgenda(post, replace) {
  try {
    const r = await api.post(`/community/posts/${post.id}/agenda`);
    toast(r.aviso || `${r.criados} atividade(s) adicionada(s) à Agenda.`, r.aviso ? 'info' : 'ok');
    replace({ ...post, naAgenda: true });
  } catch (e) { toast(e.message, 'err'); }
}

// Menu "…": editar/excluir (autor) e denunciar (outros).
function PostMenu(post, ctx, { el }) {
  const panel = h('div', { class: 'cm-menu-panel', hidden: true });
  const toggle = h('button', { type: 'button', class: 'cm-action', 'aria-label': 'Mais opções', 'aria-expanded': 'false', onClick: () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
  } }, '⋯');
  const item = (label, onClick, cls = '') => h('button', { type: 'button', class: `cm-menu-item ${cls}`, onClick: () => { panel.hidden = true; onClick(); } }, label);
  if (post.meu) {
    panel.append(
      item('Editar', () => ctx.onEdit?.(post)),
      item('Excluir', () => confirmInline(el, 'Excluir esta publicação? Os comentários também serão apagados.', async () => {
        try { await api.del(`/community/posts/${post.id}`); el.remove(); toast('Publicação excluída.', 'ok'); ctx.onDeleted?.(post); }
        catch (e) { toast(e.message, 'err'); }
      }), 'danger'),
    );
  } else {
    panel.append(item('Denunciar', () => ReportForm(el, ctx.meta, `/community/posts/${post.id}/report`)));
  }
  return h('div', { class: 'cm-menu' }, toggle, panel);
}

// Confirmação dentro do próprio cartão (sem diálogos do navegador).
export function confirmInline(anchor, text, onYes) {
  anchor.querySelector('.cm-confirm')?.remove();
  const box = h('div', { class: 'cm-confirm', role: 'alert' }, h('p', {}, text),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn btn-danger btn-sm', onClick: () => { box.remove(); onYes(); } }, 'Confirmar'),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => box.remove() }, 'Cancelar')));
  anchor.append(box);
  box.querySelector('button').focus();
}

export function ReportForm(anchor, meta, url) {
  anchor.querySelector('.cm-report')?.remove();
  const form = h('form', { class: 'cm-report stack' },
    h('h4', {}, 'Denunciar'),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Motivo'),
      h('select', { name: 'motivo', required: true }, h('option', { value: '' }, 'Escolha…'), Object.entries(meta.motivosDenuncia).map(([v, l]) => h('option', { value: v }, l)))),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Detalhes (opcional)'), h('textarea', { name: 'detalhe', rows: 2, maxlength: 500 })),
    h('div', { class: 'row' },
      h('button', { type: 'submit', class: 'btn btn-sm' }, 'Enviar denúncia'),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => form.remove() }, 'Cancelar')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { motivo, detalhe } = Object.fromEntries(new FormData(form));
    try {
      const r = await api.post(url, { motivo, ...(detalhe ? { detalhe } : {}) });
      toast(r.mensagem, 'ok');
      form.remove();
    } catch (err) { toast(err.message, 'err'); }
  });
  anchor.append(form);
  form.querySelector('select').focus();
}

// ---------- Compositor (criar e editar) ----------

export function Composer({ meta, grupos, initial = null, grupoId = '', missaoId = '', onDone, onCancel }) {
  const editing = Boolean(initial);
  let tipo = initial?.tipo || 'publicacao';
  let imagens = (initial?.imagens || []).map((url) => ({ id: url.split('/').pop(), url }));
  const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const dupBox = h('div', { hidden: true });

  const input = (name, attrs = {}) => h('input', { name, ...attrs });
  const fld = (label, control, hint) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control, hint ? h('small', { class: 'hint' }, hint) : null);
  const opt = (value, label, current) => h('option', { value, selected: value === current }, label);

  const categoria = h('select', { name: 'categoria', required: true }, opt('', 'Categoria…', ''), Object.entries(meta.categorias).map(([v, c]) => opt(v, c.label, initial?.categoria)));
  const natureza = h('select', { name: 'natureza' }, Object.entries(meta.naturezas).map(([v, n]) => opt(v, n.label, initial?.natureza || 'relato-pessoal')));
  const natHint = h('small', { class: 'hint' });
  const syncNat = () => { natHint.textContent = meta.naturezas[natureza.value]?.descricao || ''; };
  natureza.addEventListener('change', syncNat); syncNat();

  const o = initial?.oportunidade || {};
  const opFields = h('fieldset', { class: 'cm-op-fields stack' },
    h('legend', {}, 'Dados da oportunidade'),
    h('div', { class: 'grid-2' },
      fld('Instituição', input('instituicao', { value: o.instituicao || '', maxlength: 120, placeholder: 'Ex.: Universidad de Granada' })),
      fld('Título', input('opTitulo', { value: o.titulo || '', maxlength: 160, placeholder: 'Ex.: Máster en Ingeniería de Caminos' }))),
    h('div', { class: 'grid-2' },
      fld('Prazo', input('prazo', { type: 'date', value: o.prazo || '' }), 'Data final de inscrição no edital.'),
      fld('Link oficial', input('linkOficial', { type: 'url', value: o.linkOficial || '', placeholder: 'https://…', maxlength: 400 }), 'Página do edital no site oficial.')),
    fld('Requisitos', h('textarea', { name: 'requisitos', rows: 3, placeholder: 'Um requisito por linha' }, (o.requisitos || []).join('\n'))),
    h('p', { class: 'hint' }, 'A oportunidade entra como "Não verificada". Só a equipe pode verificá-la, depois de conferir link, requisitos e datas no edital.'));

  const uniSel = h('select', { name: 'universidadeId' }, opt('', 'Universidade (opcional)', ''), meta.universidades.map((u) => opt(u.id, `${u.sigla} - ${u.nome}`, initial?.local?.universidadeId)));
  const cityList = h('datalist', { id: 'cm-cities' }, meta.cidades.map((c) => h('option', { value: c })));
  const grupoSel = h('select', { name: 'grupoId' }, opt('', 'Sem grupo (feed geral)', ''), grupos.map((g) => opt(g.id, g.nome, initial?.grupo?.id || grupoId)));

  const preview = h('div', { class: 'cm-upload-preview' });
  const drawPreview = () => preview.replaceChildren(...imagens.map((img) => h('span', { class: 'cm-thumb' },
    h('img', { src: img.url, alt: '' }),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Remover imagem', onClick: () => {
      imagens = imagens.filter((x) => x !== img); drawPreview();
      // Enviada nesta composição e ainda sem publicação: descarta no servidor (não fica guardada à toa).
      if (img.novo) call('DELETE', `/community/media/${img.id}`).catch(() => {});
    } }, icon('x', { size: 14 })))));
  drawPreview();
  const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', multiple: true, class: 'cm-file' });
  file.addEventListener('change', async () => {
    for (const f of [...file.files].slice(0, 4 - imagens.length)) {
      if (f.size > 2 * 1024 * 1024) { toast(`${f.name}: máximo 2 MB.`, 'err'); continue; }
      const r = await call('POST', '/community/media', undefined, { raw: f, type: f.type });
      if (r.ok) imagens.push({ id: r.data.id, url: r.data.url, novo: true }); else toast(r.data.error || 'Falha no envio da imagem.', 'err');
    }
    file.value = '';
    drawPreview();
  });

  const tabs = h('div', { class: 'cm-seg', role: 'tablist' });
  const natField = fld('Natureza', natureza, null);
  natField.append(natHint);
  const sync = () => {
    tabs.replaceChildren(...[['publicacao', 'Publicação', 'chat'], ['oportunidade', 'Oportunidade', 'target']].map(([v, l, ic]) =>
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(tipo === v), class: tipo === v ? 'on' : '', disabled: editing && tipo !== v, onClick: () => { tipo = v; sync(); } }, icon(ic, { size: 15 }), l)));
    opFields.hidden = tipo !== 'oportunidade';
    natField.hidden = tipo === 'oportunidade';
  };
  sync();

  const form = h('form', { class: 'cm-composer card stack', novalidate: true },
    h('div', { class: 'row between wrap' }, h('h2', {}, editing ? 'Editar publicação' : 'Compartilhar com a comunidade'), tabs),
    (initial?.missaoId || missaoId) ? h('p', { class: 'cm-notice cm-notice-info' }, icon('flag', { size: 15 }), `Relato ligado à missão ${initial?.missaoId || missaoId}. Conte o que viveu, ele aparece como experiência, não como regra oficial.`) : null,
    h('div', { class: 'grid-2' }, fld('Categoria', categoria), natField),
    fld('Título (opcional)', input('titulo', { value: tipo === 'oportunidade' ? '' : initial?.titulo || '', maxlength: 160 })),
    fld('Texto', h('textarea', { name: 'texto', rows: 4, maxlength: 5000, required: true, placeholder: 'Conte sua experiência, dúvida ou dica. Links são analisados automaticamente.' }, initial?.texto || ''),
      'Não publique documentos, CPF, passaporte, telefone ou e-mail pessoal: o sistema remove esses dados.'),
    opFields,
    h('details', { class: 'cm-more', open: Boolean(initial?.local?.universidadeId || initial?.local?.cidade || grupoId) },
      h('summary', {}, 'Local, grupo e imagens'),
      h('div', { class: 'stack' },
        h('div', { class: 'grid-3' }, fld('Universidade', uniSel), fld('Cidade', input('cidade', { list: 'cm-cities', value: initial?.local?.cidade || '', maxlength: 60 })), fld('País', input('pais', { value: initial?.local?.pais || 'Espanha', maxlength: 60 }))),
        cityList,
        fld('Grupo', grupoSel),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Imagens (até 4, 2 MB cada)'), file, preview))),
    err, dupBox,
    h('div', { class: 'row' },
      h('button', { type: 'submit', class: 'btn' }, icon('send', { size: 16 }), editing ? 'Salvar' : 'Publicar'),
      onCancel ? h('button', { type: 'button', class: 'btn btn-ghost', onClick: onCancel }, 'Cancelar') : null),
  );

  async function submit(ignorarDuplicata = false) {
    const f = Object.fromEntries(new FormData(form));
    const body = {
      tipo, categoria: f.categoria, texto: f.texto, imagens: imagens.map((i) => i.id),
      local: { universidadeId: f.universidadeId, cidade: f.cidade, pais: f.pais }, grupoId: f.grupoId,
      missaoId: initial?.missaoId || missaoId,
    };
    if (tipo === 'publicacao') { body.natureza = f.natureza; if (f.titulo) body.titulo = f.titulo; }
    if (tipo === 'oportunidade') {
      body.oportunidade = {
        instituicao: f.instituicao, titulo: f.opTitulo, prazo: f.prazo, linkOficial: f.linkOficial,
        requisitos: f.requisitos.split('\n').map((s) => s.trim()).filter((s) => s.length >= 2),
      };
    }
    if (ignorarDuplicata) body.ignorarDuplicata = true;
    err.hidden = true; dupBox.hidden = true;
    const r = editing ? await call('PUT', `/community/posts/${initial.id}`, body) : await call('POST', '/community/posts', body);
    if (r.ok) {
      (r.data.avisos || []).forEach((a) => toast(a, 'info'));
      if (!editing) toast('Publicado!', 'ok');
      return onDone?.(r.data.post);
    }
    if (r.status === 409 && r.data.duplicata) {
      dupBox.replaceChildren(h('div', { class: 'cm-notice cm-notice-warn' }, icon('copy', { size: 15 }),
        h('span', {}, `${r.data.error} `, h('a', { href: `#/comunidade/post/${r.data.duplicata.id}` }, `Ver "${r.data.duplicata.titulo}"`), '. Se for outra oportunidade, '),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => submit(true) }, 'publicar mesmo assim')));
      dupBox.hidden = false;
      return;
    }
    err.textContent = r.data.error || 'Não foi possível publicar.';
    err.hidden = false;
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  return form;
}
