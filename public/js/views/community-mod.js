// Painel de moderação da comunidade: verificação de oportunidades (checklist), alterações
// confirmadas em editais, conteúdo em revisão e denúncias. Só aparece para moderadores.
import { h, mount, toast } from '../ui.js';
import { api } from '../api.js';
import { PostCard, icon, linkChip, fmtDate, timeAgo } from './community-parts.js';

export async function ModerationPanel(ctx) {
  const root = h('div', { class: 'stack-lg cm-mod' });
  const reload = async () => mount(root, ...(await sections(ctx, reload)));
  await reload();
  return root;
}

async function sections(ctx, reload) {
  const q = await api.get('/community/mod/queue');
  const section = (title, count, items, empty) => h('section', { class: 'stack' },
    h('h2', {}, title, h('span', { class: 'cm-count' }, String(count))),
    count ? items : h('p', { class: 'muted' }, empty));
  return [
    h('p', { class: 'cm-notice cm-notice-info' }, icon('scale', { size: 16 }), 'Verificar significa conferir na fonte oficial: o link sozinho não basta. Toda decisão fica registrada no histórico da publicação e no log de auditoria.'),
    section('Aguardando verificação', q.verificacao.length, q.verificacao.map((p) => VerifyItem(ctx, p, reload)), 'Nada na fila.'),
    section('Verificadas com prazo vencido', q.desatualizadas.length, q.desatualizadas.map((p) => VerifyItem(ctx, p, reload)), 'Nenhuma.'),
    section('Conteúdo em revisão (spam, links suspeitos, denúncias)', q.revisao.length + q.comentarios.length,
      [...q.revisao.map((p) => ReviewItem(ctx, p, reload)), ...q.comentarios.map((c) => CommentItem(c, reload))], 'Nada em revisão.'),
    section('Denúncias abertas', q.denuncias.length, h('ul', { class: 'cm-reports' }, q.denuncias.map((r) => ReportItem(r, reload))), 'Nenhuma denúncia aberta.'),
  ];
}

const run = async (fn, msg, reload) => { try { await fn(); if (msg) toast(msg, 'ok'); await reload(); } catch (e) { toast(e.message, 'err'); } };

function VerifyItem(ctx, post, reload) {
  const flow = { 'nao-verificada': ['em-verificacao', 'rejeitada'], 'em-verificacao': ['verificada', 'rejeitada', 'nao-verificada'], verificada: ['desatualizada', 'em-verificacao'], desatualizada: ['em-verificacao', 'rejeitada'], rejeitada: ['em-verificacao'] };
  // O fluxo usa o estado gravado (uma verificada vencida ainda está gravada como "verificada").
  const stored = post.verificacao.gravado || post.verificacao.status;
  const err = h('p', { class: 'form-error', hidden: true });
  const status = h('select', { name: 'status' }, (flow[stored] || []).map((s) => h('option', { value: s }, ctx.meta.verificacao[s].label)));
  const box = (name, label) => h('label', { class: 'check' }, h('input', { type: 'checkbox', name }), h('span', {}, label));
  const form = h('form', { class: 'stack cm-verify-form' },
    h('h4', {}, 'Decisão de verificação'),
    h('div', { class: 'stack' },
      box('linkOficial', 'Abri o link e é a página oficial do edital (domínio, órgão e ano corretos).'),
      box('requisitos', 'Os requisitos publicados conferem com o edital.'),
      box('datas', 'O prazo e as datas conferem com o edital vigente.')),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Novo estado'), status),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Nota (obrigatória para rejeitar, desatualizar ou link não institucional)'), h('textarea', { name: 'nota', rows: 2, maxlength: 500 })),
    err,
    h('button', { type: 'submit', class: 'btn btn-sm' }, 'Registrar decisão'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const body = { status: f.get('status'), nota: f.get('nota') || undefined };
    if (body.status === 'verificada') body.checklist = { linkOficial: f.has('linkOficial'), requisitos: f.has('requisitos'), datas: f.has('datas') };
    try { await api.post(`/community/mod/posts/${post.id}/verification`, body); toast('Decisão registrada.', 'ok'); await reload(); }
    catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });

  const extra = [];
  if (post.oportunidade) extra.push(EditalForm(post, reload));
  if (post.possivelDuplicata) extra.push(h('p', { class: 'cm-notice cm-notice-warn' }, icon('copy', { size: 15 }), 'Possível duplicata de ', h('a', { href: `#/comunidade/post/${post.possivelDuplicata}` }, 'outra publicação'), '. Se for a mesma oportunidade, rejeite com a nota "duplicada".'));
  return h('div', { class: 'cm-mod-item' },
    PostCard(post, { ...ctx, onChange: () => {} }),
    h('div', { class: 'card card-soft stack' },
      h('h4', {}, 'Links analisados'), h('div', { class: 'cm-links' }, post.analiseLinks.map(linkChip)),
      post.analiseLinks.flatMap((l) => l.motivos).length ? h('ul', { class: 'small' }, post.analiseLinks.flatMap((l) => l.motivos).map((m) => h('li', {}, m))) : null,
      History(post),
      ...extra, form));
}

// Alteração confirmada no edital: propaga para missões e agenda de quem acompanha.
function EditalForm(post, reload) {
  const o = post.oportunidade;
  const form = h('form', { class: 'stack cm-edital-form' },
    h('h4', {}, 'Dados do edital (registrar alteração confirmada)'),
    h('div', { class: 'grid-2' },
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Prazo'), h('input', { type: 'date', name: 'prazo', value: o.prazo || '' })),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Link oficial'), h('input', { type: 'url', name: 'linkOficial', value: o.linkOficial }))),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Requisitos (um por linha)'), h('textarea', { name: 'requisitos', rows: 3 }, o.requisitos.join('\n'))),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'O que mudou e onde confirmou'), h('input', { name: 'nota', maxlength: 500, required: true })),
    h('button', { type: 'submit', class: 'btn btn-ghost btn-sm' }, 'Salvar alteração'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const body = { nota: f.nota };
    if (f.prazo && f.prazo !== o.prazo) body.prazo = f.prazo;
    if (f.linkOficial !== o.linkOficial) body.linkOficial = f.linkOficial;
    const reqs = f.requisitos.split('\n').map((s) => s.trim()).filter((s) => s.length >= 2);
    if (JSON.stringify(reqs) !== JSON.stringify(o.requisitos)) body.requisitos = reqs;
    run(async () => {
      const r = await api.put(`/community/mod/posts/${post.id}/opportunity`, body);
      toast(`Alterado: ${r.campos.join(', ')}. ${r.estudantesAtualizados} estudante(s) com missão/agenda atualizada.`, 'ok');
    }, null, reload);
  });
  return form;
}

function History(post) {
  const hist = post.verificacao.historico || [];
  if (!hist.length) return null;
  return h('details', {}, h('summary', {}, `Histórico (${hist.length})`),
    h('ol', { class: 'small' }, hist.map((x) => h('li', {}, `${fmtDate(x.em)} - ${x.status}${x.alteracao ? ` (alterou ${x.alteracao.join(', ')})` : ''}${x.nota ? `: ${x.nota}` : ''}`))));
}

function ReviewItem(ctx, post, reload) {
  return h('div', { class: 'cm-mod-item' },
    PostCard(post, { ...ctx, onChange: () => {} }),
    h('div', { class: 'card card-soft stack' },
      h('p', { class: 'small' }, h('strong', {}, 'Motivos: '), (post.motivosModeracao || []).join(' ') || '-', post.denuncias ? ` · ${post.denuncias} denúncia(s)` : ''),
      ModActions(`/community/mod/posts/${post.id}/moderation`, reload)));
}

function CommentItem(c, reload) {
  return h('div', { class: 'card stack' },
    h('p', { class: 'small' }, h('strong', {}, c.autor.nome), ` · ${timeAgo(c.criadoEm)} · em `, h('a', { href: `#/comunidade/post/${c.postId}` }, 'publicação')),
    h('p', { class: 'cm-text' }, c.texto),
    h('p', { class: 'small muted' }, (c.moderacao.motivos || []).join(' ')),
    ModActions(`/community/mod/comments/${c.id}/moderation`, reload));
}

const ModActions = (url, reload) => h('div', { class: 'row wrap' },
  h('button', { type: 'button', class: 'btn btn-sm', onClick: () => run(() => api.post(url, { acao: 'publicar' }), 'Publicado.', reload) }, 'Publicar'),
  h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => run(() => api.post(url, { acao: 'ocultar' }), 'Ocultado.', reload) }, 'Ocultar'),
  h('button', { type: 'button', class: 'btn btn-danger btn-sm', onClick: () => run(() => api.post(url, { acao: 'remover' }), 'Removido.', reload) }, 'Remover'));

function ReportItem(r, reload) {
  const target = r.alvo === 'post' ? `#/comunidade/post/${r.alvoId}` : `#/comunidade/post/${r.postId}`;
  const modUrl = r.alvo === 'post' ? `/community/mod/posts/${r.alvoId}/moderation` : `/community/mod/comments/${r.alvoId}/moderation`;
  return h('li', { class: 'card stack' },
    h('p', { class: 'small' }, h('strong', {}, r.motivoLabel), ` · ${r.alvo === 'post' ? 'publicação' : 'comentário'} · ${timeAgo(r.criadoEm)} · `, h('a', { href: target }, 'abrir')),
    h('blockquote', { class: 'cm-quote' }, r.trecho),
    r.detalhe ? h('p', { class: 'small muted' }, `Detalhe: ${r.detalhe}`) : null,
    h('div', { class: 'row wrap' },
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => run(() => api.post(`/community/mod/reports/${r.id}/resolve`, { decisao: 'improcedente' }), 'Denúncia arquivada.', reload) }, 'Improcedente'),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => run(() => api.post(modUrl, { acao: 'ocultar' }), 'Conteúdo ocultado.', reload) }, 'Ocultar conteúdo'),
      h('button', { type: 'button', class: 'btn btn-danger btn-sm', onClick: () => run(() => api.post(modUrl, { acao: 'remover' }), 'Conteúdo removido.', reload) }, 'Remover')));
}
