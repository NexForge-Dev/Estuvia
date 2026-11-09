// Comunidade colaborativa: feed, interações, grupos, verificação de oportunidades, Radar,
// integração com missões e Agenda, denúncias e moderação.
import express, { Router } from 'express';
import { z } from 'zod';
import { users, community, audit, newId } from '../store.js';
import { requireAuth, requireModerator, isModerator, communityWriteLimiter } from '../security.js';
import { UNIVERSITIES, universityById } from '../content/catalog.js';
import {
  COMMUNITY_CATEGORIES, NATURE, VERIFICATION, VERIFICATION_FLOW, REPORT_REASONS, SEED_GROUPS,
} from '../content/community.js';
import {
  analyzeLink, extractLinks, protectText, spamSignals, opportunityFingerprint, isDuplicate,
  effectiveVerification, isVerifiable, relevance, communityRadarFeed,
} from '../community-engine.js';
import { putMedia, getMedia, deleteMedia } from '../storage.js';

// Radar oficial (opcional): se o módulo falhar ao carregar, a comunidade segue sem a checagem.
let findOfficialMatch = () => ({ match: false });
import('../radar/service.js').then((m) => { if (m.findOfficialMatch) findOfficialMatch = m.findOfficialMatch; }).catch(() => {});

function officialMatch(op, local) {
  try {
    const m = findOfficialMatch({ link: op.linkOficial, universidadeId: local?.universidadeId || undefined, titulo: op.titulo });
    return m?.match && m.opportunityId ? { opportunityId: m.opportunityId, programa: m.programa, url: `#/oportunidades/${m.opportunityId}` } : null;
  } catch { return null; }
}

const router = Router();
router.use(requireAuth);

const PAGE = 20;
const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();
const bad = (res, parsed) => res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' });
const daysUntil = (iso) => Math.round((new Date(`${iso}T12:00:00Z`) - new Date(`${today()}T12:00:00Z`)) / 86400000);
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Grupos iniciais entram na base na primeira carga (persistem na próxima escrita).
community.read((c) => {
  for (const g of SEED_GROUPS) {
    if (!c.groups.some((x) => x.id === g.id)) c.groups.push({ ...g, oficial: true, membros: [], criadoEm: now() });
  }
});

// ---------- Visões públicas ----------

function authorView(id) {
  const u = users.findById(id);
  if (!u) return { nome: 'Conta removida', avatar: '👤', moderador: false };
  const p = u.profile || {};
  const [first, ...rest] = String(p.nome || 'Estudante').split(/\s+/);
  // Só primeiro nome + inicial: o resto do perfil não é exposto na comunidade.
  return { nome: p.apelido || `${first}${rest.length ? ` ${rest.at(-1)[0]}.` : ''}`, avatar: p.avatar || '🎓', moderador: isModerator(u) };
}

// Estado de moderação visto pelo autor: motivo e nota, nunca o id de quem moderou.
const moderationView = (m, mod) => (mod ? m : { estado: m.estado, motivos: m.motivos, nota: m.nota, em: m.em });

const canSee = (post, viewer) =>
  isModerator(viewer) || (post.moderacao.estado === 'publicado') || (post.autorId === viewer.id && post.moderacao.estado !== 'removido');

function postView(c, post, viewer) {
  const mod = isModerator(viewer);
  const mine = post.autorId === viewer.id;
  const grupo = post.grupoId ? c.groups.find((g) => g.id === post.grupoId) : null;
  const ver = post.verificacao ? effectiveVerification(post) : null;
  return {
    id: post.id,
    tipo: post.tipo,
    categoria: post.categoria,
    natureza: post.natureza,
    titulo: post.titulo || '',
    texto: post.texto,
    links: post.links,
    imagens: post.imagens.map((id) => `/api/community/media/${id}`),
    local: post.local || {},
    grupo: grupo ? { id: grupo.id, nome: grupo.nome } : null,
    missaoId: post.missaoId || '',
    oportunidade: post.oportunidade || null,
    radarOficial: post.radarOficial || null,
    verificacao: ver && {
      ...ver,
      verificadaEm: post.verificacao.verificadaEm || null,
      ultimaNota: post.verificacao.historico.at(-1)?.nota || null,
      historico: mod ? post.verificacao.historico : undefined,
      gravado: mod ? post.verificacao.status : undefined,
    },
    autor: authorView(post.autorId),
    meu: mine,
    curtidas: post.curtidas.length,
    curti: post.curtidas.includes(viewer.id),
    salvos: post.salvos.length,
    salvei: post.salvos.includes(viewer.id),
    compartilhamentos: post.compartilhamentos || 0,
    comentarios: c.comments.filter((x) => x.postId === post.id && x.moderacao.estado === 'publicado').length,
    moderacao: mine || mod ? moderationView(post.moderacao, mod) : { estado: post.moderacao.estado },
    possivelDuplicata: mod ? post.possivelDuplicata || null : undefined,
    denuncias: mod ? post.denuncias || 0 : undefined,
    naJornada: (viewer.opportunities || []).some((o) => o.postId === post.id),
    naAgenda: (viewer.planner || []).some((e) => e.oportunidadeId === post.id),
    criadoEm: post.criadoEm,
    editadoEm: post.editadoEm || null,
  };
}

function commentView(cm, viewer) {
  return {
    id: cm.id, texto: cm.texto, autor: authorView(cm.autorId), meu: cm.autorId === viewer.id,
    criadoEm: cm.criadoEm, moderacao: cm.autorId === viewer.id || isModerator(viewer) ? moderationView(cm.moderacao, isModerator(viewer)) : { estado: cm.moderacao.estado },
  };
}

function groupView(c, g, viewer) {
  return {
    id: g.id, nome: g.nome, descricao: g.descricao, tipo: g.tipo, universidadeId: g.universidadeId || null, cidade: g.cidade || '', pais: g.pais || '',
    oficial: Boolean(g.oficial), membros: g.membros.length, participo: g.membros.includes(viewer.id),
    publicacoes: c.posts.filter((p) => p.grupoId === g.id && p.moderacao.estado === 'publicado').length,
  };
}

const findPost = (c, id) => c.posts.find((p) => p.id === id);

// ---------- Metadados ----------

router.get('/meta', (req, res) => {
  const cidades = [...new Set([...UNIVERSITIES.map((u) => u.cidade), ...community.read((c) => c.posts.map((p) => p.local?.cidade).filter(Boolean))])].sort();
  const paises = [...new Set(['Espanha', ...community.read((c) => c.posts.map((p) => p.local?.pais).filter(Boolean))])].sort();
  res.json({
    categorias: COMMUNITY_CATEGORIES, naturezas: NATURE, verificacao: VERIFICATION, motivosDenuncia: REPORT_REASONS,
    universidades: UNIVERSITIES.map(({ id, sigla, nome, cidade, pais }) => ({ id, sigla, nome, cidade, pais })),
    cidades, paises, moderador: isModerator(req.user),
    jornadas: (req.user.journeys || []).map((j) => ({ id: j.id, universidadeId: j.universidadeId, programaId: j.programaId })),
  });
});

// ---------- Feed ----------

const feedQuery = z.object({
  categoria: z.enum(Object.keys(COMMUNITY_CATEGORIES)).optional(),
  universidade: z.string().max(20).optional(),
  cidade: z.string().max(60).optional(),
  pais: z.string().max(60).optional(),
  grupo: z.string().max(60).optional(),
  missao: z.string().regex(/^\d\.\d{1,2}$/).optional(),
  tipo: z.enum(['publicacao', 'oportunidade']).optional(),
  verificacao: z.enum(Object.keys(VERIFICATION)).optional(),
  ordem: z.enum(['relevancia', 'recentes', 'prazo']).default('relevancia'),
  q: z.string().max(80).optional(),
  salvos: z.enum(['1']).optional(),
  meus: z.enum(['1']).optional(),
  pagina: z.coerce.number().int().min(1).max(500).default(1),
});

const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

router.get('/posts', (req, res) => {
  const parsed = feedQuery.safeParse(Object.fromEntries(Object.entries(req.query).filter(([, v]) => v !== '')));
  if (!parsed.success) return bad(res, parsed);
  const f = parsed.data;
  const viewer = req.user;
  res.json(community.read((c) => {
    const grupos = c.groups.filter((g) => g.membros.includes(viewer.id)).map((g) => g.id);
    const cityOf = (p) => p.local?.cidade || universityById(p.local?.universidadeId)?.cidade || '';
    const countryOf = (p) => p.local?.pais || universityById(p.local?.universidadeId)?.pais || '';
    let list = c.posts.filter((p) => canSee(p, viewer) && (p.moderacao.estado !== 'removido'))
      .filter((p) => !f.categoria || p.categoria === f.categoria)
      .filter((p) => !f.universidade || p.local?.universidadeId === f.universidade)
      .filter((p) => !f.cidade || fold(cityOf(p)) === fold(f.cidade))
      .filter((p) => !f.pais || fold(countryOf(p)) === fold(f.pais))
      .filter((p) => !f.grupo || p.grupoId === f.grupo)
      .filter((p) => !f.missao || p.missaoId === f.missao)
      .filter((p) => !f.tipo || p.tipo === f.tipo)
      .filter((p) => !f.verificacao || (p.verificacao && effectiveVerification(p).status === f.verificacao))
      .filter((p) => !f.salvos || p.salvos.includes(viewer.id))
      .filter((p) => !f.meus || p.autorId === viewer.id)
      .filter((p) => !f.q || fold(`${p.titulo} ${p.texto} ${p.oportunidade?.instituicao || ''} ${p.oportunidade?.titulo || ''}`).includes(fold(f.q)));
    const comments = (p) => c.comments.filter((x) => x.postId === p.id && x.moderacao.estado === 'publicado').length;
    if (f.ordem === 'recentes') list.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
    else if (f.ordem === 'prazo') {
      const key = (p) => (p.oportunidade?.prazo && p.oportunidade.prazo >= today() ? p.oportunidade.prazo : '9999');
      list.sort((a, b) => key(a).localeCompare(key(b)) || b.criadoEm.localeCompare(a.criadoEm));
    } else {
      const score = new Map(list.map((p) => [p.id, relevance(p, { viewer, grupos, commentsCount: comments(p) })]));
      list.sort((a, b) => score.get(b.id) - score.get(a.id));
    }
    const total = list.length;
    list = list.slice((f.pagina - 1) * PAGE, f.pagina * PAGE);
    return { posts: list.map((p) => postView(c, p, viewer)), total, pagina: f.pagina, temMais: f.pagina * PAGE < total };
  }));
});

router.get('/posts/:id', (req, res) => {
  const out = community.read((c) => {
    const post = findPost(c, req.params.id);
    if (!post || !canSee(post, req.user)) return null;
    const comentarios = c.comments.filter((x) => x.postId === post.id && (x.moderacao.estado === 'publicado' || x.autorId === req.user.id || isModerator(req.user)))
      .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)).map((cm) => commentView(cm, req.user));
    return { post: postView(c, post, req.user), comentarios };
  });
  if (!out) return res.status(404).json({ error: 'Publicação não encontrada.' });
  res.json(out);
});

// ---------- Publicar ----------

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.');
const httpsUrl = z.url('Informe o link oficial completo (https://…).').max(400).refine((u) => u.startsWith('https://'), 'O link oficial precisa ser https.');

const opportunitySchema = z.object({
  instituicao: z.string().trim().min(2, 'Informe a instituição.').max(120),
  titulo: z.string().trim().min(4, 'Informe o título da oportunidade.').max(160),
  prazo: date.optional().or(z.literal('')),
  requisitos: z.array(z.string().trim().min(2).max(200)).max(12).default([]),
  linkOficial: httpsUrl,
}).strict();

const postSchema = z.object({
  tipo: z.enum(['publicacao', 'oportunidade']),
  categoria: z.enum(Object.keys(COMMUNITY_CATEGORIES), 'Escolha uma categoria.'),
  natureza: z.enum(Object.keys(NATURE)).default('relato-pessoal'),
  titulo: z.string().trim().max(160).optional(),
  texto: z.string().trim().min(1, 'Escreva algo antes de publicar.').max(5000, 'Texto longo demais (máx. 5000 caracteres).'),
  imagens: z.array(z.uuid()).max(4, 'Até 4 imagens por publicação.').default([]),
  local: z.object({
    universidadeId: z.enum(UNIVERSITIES.map((u) => u.id)).optional().or(z.literal('')),
    cidade: z.string().trim().max(60).optional(),
    pais: z.string().trim().max(60).optional(),
  }).strict().optional(),
  grupoId: z.string().max(60).optional().or(z.literal('')),
  // Missão da jornada a que o relato se refere (ex.: '3.6'; a trilha financeira usa 9.x).
  missaoId: z.string().regex(/^\d\.\d{1,2}$/, 'Missão inválida.').optional().or(z.literal('')),
  oportunidade: opportunitySchema.optional(),
  ignorarDuplicata: z.boolean().optional(),
}).strict().refine((p) => p.tipo !== 'oportunidade' || p.oportunidade, { message: 'Preencha os dados da oportunidade.' });

// Valida, protege dados pessoais e analisa links. Devolve { erro } ou os campos prontos para gravar.
function preparePost(c, user, data, { editingId } = {}) {
  if (data.grupoId && !c.groups.some((g) => g.id === data.grupoId)) return { erro: [400, 'Grupo não encontrado.'] };
  for (const id of data.imagens) {
    const m = c.media.find((x) => x.id === id);
    if (!m || m.ownerId !== user.id || (m.postId && m.postId !== editingId)) return { erro: [400, 'Imagem inválida. Envie a imagem de novo.'] };
  }
  const avisos = [];
  const texto = protectText(data.texto);
  const titulo = protectText(data.titulo || '');
  const op = data.oportunidade && {
    ...data.oportunidade,
    prazo: data.oportunidade.prazo || '',
    requisitos: data.oportunidade.requisitos.map((r) => protectText(r).texto),
  };
  const masked = [...new Set([...texto.encontrados, ...titulo.encontrados])];
  if (masked.length) avisos.push(`Removemos dados pessoais do texto (${masked.join(', ')}). Nunca publique documentos ou contatos pessoais.`);

  const urls = [...new Set([...extractLinks(texto.texto), ...(op ? [op.linkOficial] : [])])];
  if (urls.length > 6) return { erro: [400, 'Muitos links: use no máximo 6.'] };
  const links = urls.map(analyzeLink);
  if (links.some((l) => !l.valido)) return { erro: [400, 'Há um link inválido no texto.'] };
  if (links.some((l) => l.nivel === 'suspeito')) avisos.push('Encontramos um link suspeito: a publicação vai para revisão antes de aparecer para todos.');

  // "Baseado em fonte oficial" exige citar um domínio institucional — e ainda assim passa por verificação.
  if (data.natureza === 'orientacao-oficial' && !links.some((l) => l.nivel === 'institucional')) {
    return { erro: [400, 'Para marcar como "baseado em fonte oficial", cite o link da fonte oficial (site do governo, consulado ou universidade).'] };
  }
  const radarOficial = op ? officialMatch(op, data.local) : null;
  if (radarOficial) avisos.push(`Este programa já está no Radar oficial (${radarOficial.programa}). Lá as datas vêm direto das fontes oficiais.`);
  return {
    avisos,
    campos: {
      radarOficial,
      tipo: data.tipo, categoria: data.categoria, natureza: data.tipo === 'oportunidade' && data.natureza === 'relato-pessoal' ? 'dica' : data.natureza,
      titulo: titulo.texto || op?.titulo || '', texto: texto.texto, links, imagens: data.imagens,
      local: data.local ? { universidadeId: data.local.universidadeId || '', cidade: data.local.cidade || '', pais: data.local.pais || '' } : {},
      grupoId: data.grupoId || '', missaoId: data.missaoId || '', oportunidade: op || null,
    },
  };
}

function findDuplicate(c, op, exceptId) {
  const fp = opportunityFingerprint(op);
  return c.posts.find((p) => p.id !== exceptId && p.tipo === 'oportunidade' && p.moderacao.estado !== 'removido'
    && p.verificacao?.status !== 'rejeitada' && isDuplicate(fp, opportunityFingerprint(p.oportunidade)));
}

router.post('/posts', communityWriteLimiter, async (req, res) => {
  const parsed = postSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const user = req.user;
  const result = await community.mutate((c) => {
    const hourAgo = Date.now() - 3600000;
    const mine = c.posts.filter((p) => p.autorId === user.id && Date.now() - new Date(p.criadoEm) < 86400000);
    if (mine.filter((p) => new Date(p.criadoEm) > hourAgo).length >= 8) return { erro: [429, 'Limite de publicações por hora atingido. Volte mais tarde.'] };
    const prep = preparePost(c, user, parsed.data);
    if (prep.erro) return prep;
    const spam = spamSignals({ texto: prep.campos.texto, links: prep.campos.links, autor: user, recentes: mine });
    if (spam.repetida) return { erro: [409, 'Você já publicou este mesmo texto nas últimas 24 horas.'] };

    let possivelDuplicata = null;
    if (prep.campos.oportunidade) {
      const dup = findDuplicate(c, prep.campos.oportunidade);
      if (dup && !parsed.data.ignorarDuplicata) {
        return { erro: [409, 'Esta oportunidade parece já ter sido compartilhada. Veja a publicação existente, você pode comentar nela.'], extra: { duplicata: { id: dup.id, titulo: dup.titulo } } };
      }
      possivelDuplicata = dup?.id || null;
    }
    const post = {
      id: newId(), autorId: user.id, ...prep.campos,
      verificacao: isVerifiable(prep.campos) ? { status: 'nao-verificada', historico: [] } : null,
      curtidas: [], salvos: [], compartilhamentos: 0, denuncias: 0, possivelDuplicata,
      moderacao: { estado: spam.revisar ? 'em-revisao' : 'publicado', motivos: spam.motivos },
      criadoEm: now(),
    };
    c.posts.push(post);
    c.media.filter((m) => post.imagens.includes(m.id)).forEach((m) => { m.postId = post.id; });
    if (spam.revisar) prep.avisos.push('Sua publicação ficou em revisão pela moderação antes de aparecer no feed.');
    return { post, avisos: prep.avisos };
  });
  if (result.erro) return res.status(result.erro[0]).json({ error: result.erro[1], ...result.extra });
  res.status(201).json({ post: community.read((c) => postView(c, result.post, user)), avisos: result.avisos });
});

router.put('/posts/:id', communityWriteLimiter, async (req, res) => {
  const parsed = postSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const user = req.user;
  const result = await community.mutate((c) => {
    const post = findPost(c, req.params.id);
    if (!post || post.autorId !== user.id || post.moderacao.estado === 'removido') return { erro: [404, 'Publicação não encontrada.'] };
    if (parsed.data.tipo !== post.tipo) return { erro: [400, 'Não é possível mudar o tipo da publicação.'] };
    const prep = preparePost(c, user, parsed.data, { editingId: post.id });
    if (prep.erro) return prep;
    if (prep.campos.links.some((l) => l.nivel === 'suspeito')) post.moderacao = { estado: 'em-revisao', motivos: ['Contém link suspeito.'] };
    // Qualquer mudança em algo já verificado exige nova conferência: sai do Radar até lá.
    const changed = JSON.stringify(post.oportunidade) !== JSON.stringify(prep.campos.oportunidade) || post.texto !== prep.campos.texto;
    if (post.verificacao && ['verificada', 'desatualizada'].includes(post.verificacao.status) && changed) {
      post.verificacao.status = 'em-verificacao';
      post.verificacao.historico.push({ status: 'em-verificacao', em: now(), por: 'sistema', nota: 'Editada pelo autor depois da verificação: precisa ser conferida de novo.' });
      prep.avisos.push('Como a publicação já estava verificada, ela voltou para verificação.');
    }
    if (!post.verificacao && isVerifiable(prep.campos)) post.verificacao = { status: 'nao-verificada', historico: [] };
    c.media.filter((m) => m.postId === post.id && !prep.campos.imagens.includes(m.id)).forEach((m) => { m.postId = null; m.soltaEm = now(); });
    c.media.filter((m) => prep.campos.imagens.includes(m.id)).forEach((m) => { m.postId = post.id; });
    Object.assign(post, prep.campos, { editadoEm: now() });
    return { post, avisos: prep.avisos };
  });
  if (result.erro) return res.status(result.erro[0]).json({ error: result.erro[1] });
  res.json({ post: community.read((c) => postView(c, result.post, user)), avisos: result.avisos });
});

router.delete('/posts/:id', async (req, res) => {
  const ok = await community.mutate((c) => {
    const post = findPost(c, req.params.id);
    if (!post || post.autorId !== req.user.id) return false;
    removePost(c, post.id);
    return true;
  });
  if (!ok) return res.status(404).json({ error: 'Publicação não encontrada.' });
  res.json({ ok: true });
});

function removePost(c, id) {
  c.posts = c.posts.filter((p) => p.id !== id);
  c.comments = c.comments.filter((x) => x.postId !== id);
  c.media.filter((m) => m.postId === id).forEach((m) => deleteMediaFile(m));
  c.media = c.media.filter((m) => m.postId !== id);
}

// ---------- Curtir, salvar, compartilhar ----------

async function toggle(req, res, field) {
  const out = await community.mutate((c) => {
    const post = findPost(c, req.params.id);
    if (!post || !canSee(post, req.user)) return null;
    const i = post[field].indexOf(req.user.id);
    if (i >= 0) post[field].splice(i, 1); else post[field].push(req.user.id);
    return postView(c, post, req.user);
  });
  if (!out) return res.status(404).json({ error: 'Publicação não encontrada.' });
  res.json({ post: out });
}

router.post('/posts/:id/like', (req, res) => toggle(req, res, 'curtidas'));
router.post('/posts/:id/save', (req, res) => toggle(req, res, 'salvos'));

router.post('/posts/:id/share', async (req, res) => {
  const out = await community.mutate((c) => {
    const post = findPost(c, req.params.id);
    if (!post || post.moderacao.estado !== 'publicado') return null;
    post.compartilhamentos = (post.compartilhamentos || 0) + 1;
    return postView(c, post, req.user);
  });
  if (!out) return res.status(404).json({ error: 'Só publicações visíveis no feed podem ser compartilhadas.' });
  res.json({ post: out, link: `/#/comunidade/post/${out.id}` });
});

// ---------- Comentários ----------

router.post('/posts/:id/comments', communityWriteLimiter, async (req, res) => {
  const parsed = z.object({ texto: z.string().trim().min(1, 'Escreva um comentário.').max(2000) }).strict().safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const user = req.user;
  const out = await community.mutate((c) => {
    const post = findPost(c, req.params.id);
    if (!post || !canSee(post, user)) return { erro: [404, 'Publicação não encontrada.'] };
    const recent = c.comments.filter((x) => x.autorId === user.id && Date.now() - new Date(x.criadoEm) < 3600000);
    if (recent.length >= 30) return { erro: [429, 'Limite de comentários por hora atingido.'] };
    const masked = protectText(parsed.data.texto);
    const links = extractLinks(masked.texto).map(analyzeLink);
    const spam = spamSignals({ texto: masked.texto, links, autor: user, recentes: recent });
    if (spam.repetida) return { erro: [409, 'Você acabou de enviar este mesmo comentário.'] };
    const cm = { id: newId(), postId: post.id, autorId: user.id, texto: masked.texto, links, criadoEm: now(), moderacao: { estado: spam.revisar ? 'em-revisao' : 'publicado', motivos: spam.motivos } };
    c.comments.push(cm);
    const avisos = [];
    if (masked.encontrados.length) avisos.push(`Removemos dados pessoais do comentário (${masked.encontrados.join(', ')}).`);
    if (spam.revisar) avisos.push('Seu comentário ficou em revisão pela moderação.');
    return { comentario: commentView(cm, user), avisos };
  });
  if (out.erro) return res.status(out.erro[0]).json({ error: out.erro[1] });
  res.status(201).json(out);
});

router.delete('/comments/:id', async (req, res) => {
  const ok = await community.mutate((c) => {
    const cm = c.comments.find((x) => x.id === req.params.id);
    if (!cm || cm.autorId !== req.user.id) return false;
    c.comments = c.comments.filter((x) => x.id !== cm.id);
    return true;
  });
  if (!ok) return res.status(404).json({ error: 'Comentário não encontrado.' });
  res.json({ ok: true });
});

// ---------- Denúncias ----------

const reportSchema = z.object({ motivo: z.enum(Object.keys(REPORT_REASONS)), detalhe: z.string().trim().max(500).optional() }).strict();
const AUTO_REVIEW_REPORTS = 3;

async function report(req, res, alvo) {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Escolha o motivo da denúncia.' });
  const out = await community.mutate((c) => {
    const target = alvo === 'post' ? findPost(c, req.params.id) : c.comments.find((x) => x.id === req.params.id);
    if (!target) return { erro: [404, 'Conteúdo não encontrado.'] };
    if (target.autorId === req.user.id) return { erro: [400, 'Você não pode denunciar o próprio conteúdo.'] };
    if (c.reports.some((r) => r.alvoId === target.id && r.autorId === req.user.id && r.status === 'aberta')) return { erro: [409, 'Você já denunciou este conteúdo. A moderação vai analisar.'] };
    // Só se denuncia o que se pode ver: id de conteúdo oculto, em revisão ou removido não serve para nada (nem para sondar).
    const post = alvo === 'post' ? target : findPost(c, target.postId);
    const visible = post && canSee(post, req.user) && post.moderacao.estado !== 'removido'
      && (alvo === 'post' || target.moderacao.estado === 'publicado' || isModerator(req.user));
    if (!visible) return { erro: [404, 'Conteúdo não encontrado.'] };
    c.reports.push({ id: newId(), alvo, alvoId: target.id, postId: alvo === 'post' ? target.id : target.postId, autorId: req.user.id, ...parsed.data, status: 'aberta', criadoEm: now() });
    const abertas = c.reports.filter((r) => r.alvoId === target.id && r.status === 'aberta').length;
    if (alvo === 'post') target.denuncias = abertas;
    // Várias denúncias independentes tiram o conteúdo do ar até a moderação decidir.
    if (abertas >= AUTO_REVIEW_REPORTS && target.moderacao.estado === 'publicado') {
      target.moderacao = { estado: 'em-revisao', motivos: [...(target.moderacao.motivos || []), 'Várias denúncias da comunidade.'] };
    }
    return { ok: true };
  });
  if (out.erro) return res.status(out.erro[0]).json({ error: out.erro[1] });
  res.status(201).json({ ok: true, mensagem: 'Denúncia registrada. Obrigado por proteger a comunidade.' });
}

router.post('/posts/:id/report', (req, res) => report(req, res, 'post'));
router.post('/comments/:id/report', (req, res) => report(req, res, 'comentario'));

// Qualquer estudante pode pedir que a equipe confira uma oportunidade ou orientação.
router.post('/posts/:id/verification-request', async (req, res) => {
  const out = await community.mutate((c) => {
    const post = findPost(c, req.params.id);
    if (!post || !canSee(post, req.user)) return { erro: [404, 'Publicação não encontrada.'] };
    if (!post.verificacao) return { erro: [400, 'Só oportunidades e orientações baseadas em fonte oficial passam por verificação.'] };
    const eff = effectiveVerification(post).status;
    if (!['nao-verificada', 'desatualizada'].includes(eff)) return { erro: [409, `Esta publicação está "${VERIFICATION[eff].label}".`] };
    post.verificacao.status = 'em-verificacao';
    post.verificacao.historico.push({ status: 'em-verificacao', em: now(), por: 'comunidade', nota: 'Verificação pedida por um estudante.' });
    return { post: postView(c, post, req.user) };
  });
  if (out.erro) return res.status(out.erro[0]).json({ error: out.erro[1] });
  res.json(out);
});

// ---------- Experiências por missão (tela "Conteúdo da Missão") ----------
// Só relatos, dicas e dúvidas publicados: nunca apresentados como regra oficial.

router.get('/missions/:missaoId', (req, res) => {
  const parsed = z.object({
    missaoId: z.string().regex(/^\d\.\d{1,2}$/),
    universidadeId: z.string().max(20).optional(),
    limit: z.coerce.number().int().min(1).max(10).default(3),
  }).safeParse({ ...req.query, missaoId: req.params.missaoId });
  if (!parsed.success) return res.status(400).json({ error: 'Missão inválida.' });
  const { missaoId, universidadeId, limit } = parsed.data;
  res.json({
    missaoId,
    aviso: 'Experiências de outros estudantes, não são regra oficial. Confirme sempre na fonte oficial.',
    relatos: community.read((c) => c.posts
      .filter((p) => p.missaoId === missaoId && p.tipo === 'publicacao' && p.natureza !== 'orientacao-oficial' && p.moderacao.estado === 'publicado')
      .map((p) => ({ p, score: relevance(p, { viewer: req.user, commentsCount: 0 }) + (universidadeId && p.local?.universidadeId === universidadeId ? 1000 : 0) }))
      .sort((a, b) => b.score - a.score).slice(0, limit)
      .map(({ p }) => ({
        id: p.id, titulo: p.titulo || '', natureza: p.natureza, naturezaLabel: NATURE[p.natureza]?.label || 'Relato pessoal',
        resumo: p.texto.length > 200 ? `${p.texto.slice(0, 197).trimEnd()}…` : p.texto,
        autorApelido: authorView(p.autorId).nome, universidadeId: p.local?.universidadeId || '',
        criadoEm: p.criadoEm, curtidas: p.curtidas.length, url: `#/comunidade/post/${p.id}`,
      }))),
  });
});

// ---------- Grupos ----------

router.get('/groups', (req, res) => {
  res.json({ grupos: community.read((c) => c.groups.map((g) => groupView(c, g, req.user)).sort((a, b) => Number(b.participo) - Number(a.participo) || b.membros - a.membros)) });
});

const slug = (s) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);

router.post('/groups', communityWriteLimiter, async (req, res) => {
  const parsed = z.object({
    nome: z.string().trim().min(4, 'Dê um nome ao grupo.').max(60),
    descricao: z.string().trim().max(240).optional(),
    tipo: z.enum(['universidade', 'cidade', 'pais']),
    universidadeId: z.enum(UNIVERSITIES.map((u) => u.id)).optional(),
    cidade: z.string().trim().max(60).optional(),
    pais: z.string().trim().min(2).max(60),
  }).strict().refine((g) => g.tipo !== 'universidade' || g.universidadeId, { message: 'Escolha a universidade.' })
    .refine((g) => g.tipo !== 'cidade' || g.cidade, { message: 'Informe a cidade.' }).safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const out = await community.mutate((c) => {
    if (c.groups.filter((g) => g.criadoPor === req.user.id).length >= 3) return { erro: [409, 'Você pode criar até 3 grupos.'] };
    const id = slug(parsed.data.nome);
    if (!id || c.groups.some((g) => g.id === id || fold(g.nome) === fold(parsed.data.nome))) return { erro: [409, 'Já existe um grupo com este nome.'] };
    const uni = universityById(parsed.data.universidadeId);
    const g = { id, ...parsed.data, cidade: parsed.data.cidade || uni?.cidade || '', descricao: protectText(parsed.data.descricao || '').texto, oficial: false, criadoPor: req.user.id, membros: [req.user.id], criadoEm: now() };
    c.groups.push(g);
    return { grupo: groupView(c, g, req.user) };
  });
  if (out.erro) return res.status(out.erro[0]).json({ error: out.erro[1] });
  res.status(201).json(out);
});

router.post('/groups/:id/join', async (req, res) => {
  const out = await community.mutate((c) => {
    const g = c.groups.find((x) => x.id === req.params.id);
    if (!g) return null;
    const i = g.membros.indexOf(req.user.id);
    if (i >= 0) g.membros.splice(i, 1); else g.membros.push(req.user.id);
    return groupView(c, g, req.user);
  });
  if (!out) return res.status(404).json({ error: 'Grupo não encontrado.' });
  res.json({ grupo: out });
});

// ---------- Radar de Oportunidades ----------
// Só entram oportunidades verificadas, publicadas e com prazo vigente; duplicatas viram um item só.

const radarItems = (viewer) => communityRadarFeed().map((item) => ({
  ...item,
  diasRestantes: daysUntil(item.prazo),
  naJornada: (viewer.opportunities || []).some((o) => o.postId === item.postId),
  naAgenda: (viewer.planner || []).some((e) => e.oportunidadeId === item.postId),
}));

router.get('/radar', (req, res) => res.json({ itens: radarItems(req.user) }));

// ---------- Integração com missões ("Adicionar à minha jornada") ----------

const evaluationObjectives = (op) => [
  { id: 'fonte', titulo: 'Abrir o link oficial e confirmar que o edital é vigente', feito: false },
  ...op.requisitos.slice(0, 8).map((r, i) => ({ id: `req-${i}`, titulo: `Conferir requisito: ${r}`, feito: false })),
  { id: 'prazo', titulo: op.prazo ? `Confirmar o prazo (${op.prazo}) no edital` : 'Encontrar o prazo no edital', feito: false },
  { id: 'decisao', titulo: 'Decidir: candidatar-se ou descartar', feito: false },
];

const APPLICATION_ACTIVITIES = [
  { id: 'docs', titulo: 'Reunir os documentos exigidos no edital', feito: false },
  { id: 'textos', titulo: 'Preparar formulários, carta de motivação ou currículo pedidos', feito: false },
  { id: 'envio', titulo: 'Enviar a candidatura no sistema oficial (a plataforma não envia por você)', feito: false },
  { id: 'comprovante', titulo: 'Guardar o comprovante de envio', feito: false },
];

function opportunityView(o, viewer) {
  const post = community.read((c) => findPost(c, o.postId));
  const ver = post?.verificacao ? effectiveVerification(post) : null;
  const all = [...o.missao.objetivos, ...(o.atividades || [])];
  return {
    ...o,
    publicacaoDisponivel: Boolean(post && canSee(post, viewer)),
    verificacao: ver?.status || 'nao-verificada',
    progresso: all.length ? all.filter((x) => x.feito).length / all.length : 0,
  };
}

const myOpportunities = (user) => (user.opportunities || []).map((o) => opportunityView(o, user));

router.get('/my-opportunities', (req, res) => res.json({ oportunidades: myOpportunities(req.user) }));

router.post('/posts/:id/journey', async (req, res) => {
  const parsed = z.object({ journeyId: z.string().max(60).optional() }).strict().safeParse(req.body || {});
  if (!parsed.success) return bad(res, parsed);
  const post = community.read((c) => findPost(c, req.params.id));
  if (!post || !canSee(post, req.user) || post.tipo !== 'oportunidade') return res.status(404).json({ error: 'Oportunidade não encontrada.' });
  if (post.verificacao?.status === 'rejeitada') return res.status(409).json({ error: 'Esta oportunidade foi rejeitada pela verificação.' });
  if ((req.user.opportunities || []).some((o) => o.postId === post.id)) return res.status(409).json({ error: 'Esta oportunidade já está na sua jornada.' });
  if ((req.user.opportunities || []).length >= 40) return res.status(409).json({ error: 'Limite de oportunidades acompanhadas atingido.' });
  if (parsed.data.journeyId && !(req.user.journeys || []).some((j) => j.id === parsed.data.journeyId)) return res.status(400).json({ error: 'Jornada inválida.' });
  const op = post.oportunidade;
  const item = {
    id: newId(), postId: post.id, journeyId: parsed.data.journeyId || null, adicionadaEm: now(), decisao: 'avaliando',
    snapshot: { ...op, categoria: post.categoria },
    missao: { titulo: `Avaliar oportunidade: ${op.titulo}`, objetivos: evaluationObjectives(op) },
    atividades: [], alteracao: null,
  };
  const user = await users.update(req.user.id, (u) => { (u.opportunities ??= []).push(item); });
  res.status(201).json({ oportunidade: opportunityView(item, user), oportunidades: myOpportunities(user) });
});

router.put('/my-opportunities/:id', async (req, res) => {
  const parsed = z.object({
    objetivo: z.string().max(20).optional(),
    feito: z.boolean().optional(),
    decisao: z.enum(['avaliando', 'candidatar', 'descartar', 'enviada']).optional(),
    cienteAlteracao: z.literal(true).optional(),
  }).strict().safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const o = (req.user.opportunities || []).find((x) => x.id === req.params.id);
  if (!o) return res.status(404).json({ error: 'Oportunidade não encontrada.' });
  const { objetivo, feito, decisao, cienteAlteracao } = parsed.data;
  if (objetivo && ![...o.missao.objetivos, ...o.atividades].some((x) => x.id === objetivo)) return res.status(404).json({ error: 'Objetivo não encontrado.' });
  const user = await users.update(req.user.id, (u) => {
    const t = u.opportunities.find((x) => x.id === req.params.id);
    if (objetivo) [...t.missao.objetivos, ...t.atividades].find((x) => x.id === objetivo).feito = Boolean(feito);
    if (decisao) {
      t.decisao = decisao;
      t.missao.objetivos.find((x) => x.id === 'decisao').feito = decisao !== 'avaliando';
      // Decidir candidatar-se gera as atividades de candidatura (uma vez).
      if (decisao === 'candidatar' && !t.atividades.length) t.atividades = structuredClone(APPLICATION_ACTIVITIES);
    }
    if (cienteAlteracao) t.alteracao = null;
  });
  res.json({ oportunidades: myOpportunities(user) });
});

router.delete('/my-opportunities/:id', async (req, res) => {
  const o = (req.user.opportunities || []).find((x) => x.id === req.params.id);
  if (!o) return res.status(404).json({ error: 'Oportunidade não encontrada.' });
  const user = await users.update(req.user.id, (u) => { u.opportunities = u.opportunities.filter((x) => x.id !== o.id); });
  res.json({ oportunidades: myOpportunities(user) });
});

// ---------- Integração com a Agenda ----------

export const AGENDA_CATEGORY = {
  'vagas-mestrado': 'academico', bolsas: 'financeiro', 'estagios-empregos': 'pessoal', moradia: 'viagem',
  'documentacao-vistos': 'documentacao', 'custo-de-vida': 'financeiro', experiencias: 'pessoal',
};

const REVIEW_DAYS_BEFORE = 7;

function agendaEvents(post) {
  const op = post.oportunidade;
  const verified = effectiveVerification(post).status === 'verificada';
  const base = {
    categoria: AGENDA_CATEGORY[post.categoria] || 'pessoal', oportunidadeId: post.id, origem: 'comunidade',
    nota: `Fonte: ${op.linkOficial}`.slice(0, 300),
    motivo: verified ? 'Prazo verificado pela equipe no edital oficial.' : 'Prazo informado pela comunidade, confirme no edital oficial.',
  };
  const events = [{ ...base, id: newId(), oportunidadeTipo: 'prazo', titulo: `Prazo: ${op.titulo}`.slice(0, 120), data: op.prazo, inicio: '09:00', fim: '09:30', prioridade: 'critica', criadoEm: now() }];
  const review = addDays(op.prazo, -REVIEW_DAYS_BEFORE);
  if (review >= today()) {
    events.push({ ...base, id: newId(), oportunidadeTipo: 'revisao', titulo: `Revisar requisitos e documentos: ${op.titulo}`.slice(0, 120), data: review, inicio: '19:00', fim: '20:00', prioridade: 'alta', criadoEm: now() });
  }
  return events;
}

router.post('/posts/:id/agenda', async (req, res) => {
  const post = community.read((c) => findPost(c, req.params.id));
  if (!post || !canSee(post, req.user) || post.tipo !== 'oportunidade') return res.status(404).json({ error: 'Oportunidade não encontrada.' });
  if (!post.oportunidade.prazo) return res.status(400).json({ error: 'Esta oportunidade não tem prazo informado.' });
  if (post.oportunidade.prazo < today()) return res.status(409).json({ error: 'O prazo desta oportunidade já passou.' });
  if ((req.user.planner || []).some((e) => e.oportunidadeId === post.id)) return res.status(409).json({ error: 'Os prazos desta oportunidade já estão na sua agenda.' });
  const events = agendaEvents(post);
  await users.update(req.user.id, (u) => { (u.planner ??= []).push(...events); });
  const verified = effectiveVerification(post).status === 'verificada';
  res.status(201).json({
    criados: events.length,
    aviso: verified ? null : 'Prazo ainda não verificado: confirme no edital oficial. Se a equipe confirmar uma mudança, sua agenda será atualizada.',
  });
});

// ---------- Moderação ----------

const mod = Router();
mod.use(requireModerator);

mod.get('/queue', (req, res) => {
  res.json(community.read((c) => {
    const v = (p) => ({ ...postView(c, p, req.user), analiseLinks: p.links, motivosModeracao: p.moderacao.motivos || [] });
    const byDate = (a, b) => a.criadoEm.localeCompare(b.criadoEm);
    return {
      verificacao: c.posts.filter((p) => p.verificacao?.status === 'em-verificacao' && p.moderacao.estado !== 'removido').sort(byDate).map(v),
      revisao: c.posts.filter((p) => p.moderacao.estado === 'em-revisao').sort(byDate).map(v),
      desatualizadas: c.posts.filter((p) => p.verificacao && effectiveVerification(p).automatico).map(v),
      comentarios: c.comments.filter((x) => x.moderacao.estado === 'em-revisao').map((cm) => ({ ...commentView(cm, req.user), postId: cm.postId })),
      denuncias: c.reports.filter((r) => r.status === 'aberta').sort(byDate).map((r) => {
        const alvo = r.alvo === 'post' ? findPost(c, r.alvoId) : c.comments.find((x) => x.id === r.alvoId);
        return { ...r, autorId: undefined, motivoLabel: REPORT_REASONS[r.motivo], trecho: alvo ? `${alvo.titulo ? `${alvo.titulo} - ` : ''}${alvo.texto}`.slice(0, 280) : '(conteúdo removido)' };
      }),
    };
  }));
});

const verifySchema = z.object({
  status: z.enum(Object.keys(VERIFICATION)),
  nota: z.string().trim().max(500).optional(),
  checklist: z.object({ linkOficial: z.boolean(), requisitos: z.boolean(), datas: z.boolean() }).strict().optional(),
}).strict();

mod.post('/posts/:id/verification', async (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const { status, nota = '', checklist } = parsed.data;
  const out = await community.mutate((c) => {
    const post = findPost(c, req.params.id);
    if (!post?.verificacao) return { erro: [404, 'Publicação verificável não encontrada.'] };
    const from = post.verificacao.status;
    if (!VERIFICATION_FLOW[from]?.includes(status)) return { erro: [409, `Não é possível passar de "${VERIFICATION[from].label}" para "${VERIFICATION[status].label}".`] };
    if (['rejeitada', 'desatualizada'].includes(status) && nota.length < 5) return { erro: [400, 'Explique o motivo na nota.'] };
    if (status === 'verificada') {
      // Um link sozinho não torna nada oficial: a equipe precisa conferir fonte, requisitos e datas.
      if (!checklist?.linkOficial || !checklist.requisitos || !checklist.datas) return { erro: [400, 'Confira link oficial, requisitos e datas antes de verificar.'] };
      const official = post.links.find((l) => l.url === post.oportunidade?.linkOficial) || post.links.find((l) => l.nivel === 'institucional');
      if (!official) return { erro: [400, 'Sem fonte oficial citada: não é possível verificar.'] };
      if (official.nivel === 'suspeito') return { erro: [400, 'O link oficial foi marcado como suspeito.'] };
      if (official.nivel !== 'institucional' && nota.length < 10) return { erro: [400, 'O link não é de um domínio institucional conhecido: registre na nota como confirmou a autenticidade.'] };
      if (post.tipo === 'oportunidade') {
        if (!post.oportunidade.prazo) return { erro: [400, 'Registre o prazo confirmado no edital antes de verificar (editar dados do edital).'] };
        if (post.oportunidade.prazo < today()) return { erro: [400, 'O prazo já passou: marque como desatualizada.'] };
        const dup = c.posts.find((p) => p.id !== post.id && p.tipo === 'oportunidade' && p.verificacao?.status === 'verificada'
          && isDuplicate(opportunityFingerprint(p.oportunidade), opportunityFingerprint(post.oportunidade)));
        if (dup) return { erro: [409, `Já existe uma oportunidade verificada equivalente ("${dup.titulo}"). Rejeite esta como duplicada.`] };
      }
      post.verificacao.verificadaEm = now();
      post.verificacao.dadosVerificados = structuredClone(post.oportunidade);
    }
    post.verificacao.status = status;
    post.verificacao.historico.push({ status, em: now(), por: req.user.id, nota, checklist });
    return { post: postView(c, post, req.user) };
  });
  if (out.erro) return res.status(out.erro[0]).json({ error: out.erro[1] });
  await audit.log({ action: 'community-verification', userId: req.user.id, postId: req.params.id, status });
  res.json(out);
});

// Alteração confirmada no edital: atualiza a publicação, as missões e a agenda de quem acompanha.
mod.put('/posts/:id/opportunity', async (req, res) => {
  // Sem o default de requisitos: um campo omitido não pode apagar o que já está no edital.
  const parsed = opportunitySchema.extend({ requisitos: z.array(z.string().trim().min(2).max(200)).max(12) }).partial().extend({ nota: z.string().trim().min(5, 'Descreva a alteração confirmada.').max(500) }).strict().safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const { nota, ...changes } = parsed.data;
  const out = await community.mutate((c) => {
    const post = findPost(c, req.params.id);
    if (!post || post.tipo !== 'oportunidade') return { erro: [404, 'Oportunidade não encontrada.'] };
    const campos = Object.keys(changes).filter((k) => JSON.stringify(post.oportunidade[k]) !== JSON.stringify(changes[k]));
    if (!campos.length) return { erro: [400, 'Nenhuma alteração em relação aos dados atuais.'] };
    if (changes.linkOficial) {
      const link = analyzeLink(changes.linkOficial);
      if (link.nivel === 'suspeito') return { erro: [400, 'O novo link oficial parece suspeito.'] };
      post.links = [...post.links.filter((l) => l.url !== post.oportunidade.linkOficial), link];
    }
    Object.assign(post.oportunidade, changes);
    if (post.verificacao.status === 'verificada') post.verificacao.dadosVerificados = structuredClone(post.oportunidade);
    post.verificacao.historico.push({ status: post.verificacao.status, em: now(), por: req.user.id, nota, alteracao: campos });
    post.editadoEm = now();
    return { post, campos };
  });
  if (out.erro) return res.status(out.erro[0]).json({ error: out.erro[1] });
  const { post, campos } = out;
  // Só alterações confirmadas em oportunidades verificadas propagam para missões e agenda.
  let atualizados = 0;
  if (post.verificacao.status === 'verificada') {
    const op = post.oportunidade;
    atualizados = await users.updateWhere(
      (u) => (u.opportunities || []).some((o) => o.postId === post.id) || (u.planner || []).some((e) => e.oportunidadeId === post.id),
      (u) => {
        for (const o of (u.opportunities || []).filter((x) => x.postId === post.id)) {
          o.snapshot = { ...op, categoria: post.categoria };
          o.alteracao = { em: now(), campos, nota };
        }
        for (const e of (u.planner || []).filter((x) => x.oportunidadeId === post.id)) {
          if (e.oportunidadeTipo === 'prazo' && op.prazo) { e.data = op.prazo; e.titulo = `Prazo: ${op.titulo}`.slice(0, 120); }
          if (e.oportunidadeTipo === 'revisao' && op.prazo) e.data = addDays(op.prazo, -REVIEW_DAYS_BEFORE);
          e.nota = `Fonte: ${op.linkOficial}`.slice(0, 300);
          e.motivo = 'Prazo atualizado: alteração confirmada no edital oficial.';
          e.editadoEm = now();
        }
      },
    );
  }
  await audit.log({ action: 'community-opportunity-change', userId: req.user.id, postId: post.id, campos });
  res.json({ post: community.read((c) => postView(c, post, req.user)), campos, estudantesAtualizados: atualizados });
});

const MOD_STATE = { publicar: 'publicado', ocultar: 'oculto', remover: 'removido' };

mod.post('/:alvo(posts|comments)/:id/moderation', async (req, res) => {
  const parsed = z.object({ acao: z.enum(Object.keys(MOD_STATE)), nota: z.string().trim().max(500).optional() }).strict().safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const ok = await community.mutate((c) => {
    const list = req.params.alvo === 'posts' ? c.posts : c.comments;
    const target = list.find((x) => x.id === req.params.id);
    if (!target) return false;
    target.moderacao = { estado: MOD_STATE[parsed.data.acao], motivos: target.moderacao.motivos || [], nota: parsed.data.nota || '', por: req.user.id, em: now() };
    // A decisão encerra as denúncias abertas sobre o conteúdo.
    const decisao = parsed.data.acao === 'publicar' ? 'improcedente' : 'procedente';
    c.reports.filter((r) => r.alvoId === target.id && r.status === 'aberta').forEach((r) => Object.assign(r, { status: 'resolvida', decisao, resolvidaEm: now(), por: req.user.id }));
    if (req.params.alvo === 'posts') target.denuncias = 0;
    return true;
  });
  if (!ok) return res.status(404).json({ error: 'Conteúdo não encontrado.' });
  await audit.log({ action: 'community-moderation', userId: req.user.id, target: req.params.id, acao: parsed.data.acao });
  res.json({ ok: true });
});

mod.post('/reports/:id/resolve', async (req, res) => {
  const parsed = z.object({ decisao: z.enum(['procedente', 'improcedente']) }).strict().safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const ok = await community.mutate((c) => {
    const r = c.reports.find((x) => x.id === req.params.id && x.status === 'aberta');
    if (!r) return false;
    Object.assign(r, { status: 'resolvida', decisao: parsed.data.decisao, resolvidaEm: now(), por: req.user.id });
    const post = r.alvo === 'post' && findPost(c, r.alvoId);
    if (post) post.denuncias = c.reports.filter((x) => x.alvoId === post.id && x.status === 'aberta').length;
    return true;
  });
  if (!ok) return res.status(404).json({ error: 'Denúncia não encontrada.' });
  res.json({ ok: true });
});

router.use('/mod', mod);

// ---------- Imagens ----------
// Upload binário (PNG, JPEG, WebP, GIF até 2 MB); o tipo real é conferido pelos bytes iniciais.

const SIGNATURES = [
  { ext: 'png', mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'jpg', mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'gif', mime: 'image/gif', test: (b) => ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1')) },
  { ext: 'webp', mime: 'image/webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];

function deleteMediaFile(m) { deleteMedia(m.id, m.ext).catch(() => {}); }
// Imagem enviada e nunca publicada (composição abandonada, removida da prévia ou tirada de um post na edição)
// expira depois de 24 h: não fica guardada para sempre nem trava o limite de pendentes.
const PENDING_MEDIA_MS = 24 * 3600000;
const expiredPending = (m, at = Date.now()) => !m.postId && at - new Date(m.soltaEm || m.criadoEm) > PENDING_MEDIA_MS;
function dropMedia(c, pred) {
  const gone = c.media.filter(pred);
  gone.forEach(deleteMediaFile);
  if (gone.length) c.media = c.media.filter((m) => !gone.includes(m));
  return gone.length;
}

router.post('/media', communityWriteLimiter, express.raw({ type: SIGNATURES.map((s) => s.mime), limit: '2mb' }), async (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length < 16) return res.status(400).json({ error: 'Envie uma imagem PNG, JPEG, WebP ou GIF.' });
  const sig = SIGNATURES.find((s) => s.test(req.body));
  if (!sig) return res.status(400).json({ error: 'O arquivo não é uma imagem válida.' });
  if (community.read((c) => c.media.some((m) => expiredPending(m)))) await community.mutate((c) => dropMedia(c, (m) => expiredPending(m)));
  const pending = community.read((c) => c.media.filter((m) => m.ownerId === req.user.id && !m.postId).length);
  if (pending >= 12) return res.status(429).json({ error: 'Muitas imagens não publicadas. Publique ou descarte antes de enviar outras.' });
  const m = { id: newId(), ownerId: req.user.id, ext: sig.ext, mime: sig.mime, tamanho: req.body.length, postId: null, criadoEm: now() };
  try {
    await putMedia(m.id, m.ext, req.body, m.mime);
  } catch (err) {
    deleteMediaFile(m);
    console.error('[comunidade] falha ao gravar imagem:', err.message);
    return res.status(500).json({ error: 'Não foi possível guardar a imagem agora. Tente novamente.' });
  }
  await community.mutate((c) => { c.media.push(m); });
  res.status(201).json({ id: m.id, url: `/api/community/media/${m.id}` });
});

// Descarta uma imagem enviada que ainda não está em nenhuma publicação (removida da prévia antes de publicar).
router.delete('/media/:id', async (req, res) => {
  const n = await community.mutate((c) => dropMedia(c, (m) => m.id === req.params.id && m.ownerId === req.user.id && !m.postId));
  if (!n) return res.status(404).json({ error: 'Imagem não encontrada ou já publicada.' });
  res.json({ ok: true });
});

router.get('/media/:id', async (req, res) => {
  const m = community.read((c) => {
    const item = c.media.find((x) => x.id === req.params.id);
    if (!item) return null;
    if (item.ownerId === req.user.id) return item;
    const post = item.postId && findPost(c, item.postId);
    return post && canSee(post, req.user) ? item : null;
  });
  if (!m) return res.status(404).json({ error: 'Imagem não encontrada.' });
  let buf;
  try { buf = await getMedia(m.id, m.ext); } catch { return res.status(404).json({ error: 'Imagem não encontrada.' }); }
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('Content-Disposition', 'inline');
  res.type(m.mime).send(buf);
});

// ---------- Privacidade (exportação e exclusão de conta) ----------

export function communityExport(userId) {
  return community.read((c) => ({
    // Sem dados de terceiros: quem curtiu/salvou vira contagem e o id de quem moderou/verificou sai.
    publicacoes: c.posts.filter((p) => p.autorId === userId).map(({ curtidas, salvos, moderacao, verificacao, ...p }) => ({
      ...p, curtidas: curtidas.length, salvos: salvos.length, moderacao: moderationView(moderacao, false),
      verificacao: verificacao && { ...verificacao, historico: verificacao.historico.map(({ por, ...h }) => ({ ...h, por: ['sistema', 'comunidade'].includes(por) ? por : 'equipe' })) },
    })),
    comentarios: c.comments.filter((x) => x.autorId === userId).map((x) => ({ ...x, moderacao: moderationView(x.moderacao, false) })),
    curtiu: c.posts.filter((p) => p.curtidas.includes(userId)).map((p) => p.id),
    salvou: c.posts.filter((p) => p.salvos.includes(userId)).map((p) => p.id),
    imagens: c.media.filter((m) => m.ownerId === userId).map(({ id, mime, tamanho, postId, criadoEm }) => ({ id, mime, tamanho, postId, criadoEm })),
    gruposCriados: c.groups.filter((g) => g.criadoPor === userId).map((g) => g.id),
    denunciasFeitas: c.reports.filter((r) => r.autorId === userId).map(({ id, alvo, alvoId, motivo, detalhe, status, decisao, criadoEm }) => ({ id, alvo, alvoId, motivo, detalhe, status, decisao, criadoEm })),
    grupos: c.groups.filter((g) => g.membros.includes(userId)).map((g) => g.id),
  }));
}

export async function purgeCommunityUser(userId) {
  await community.mutate((c) => {
    c.posts.filter((p) => p.autorId === userId).forEach((p) => removePost(c, p.id));
    c.comments = c.comments.filter((x) => x.autorId !== userId);
    c.posts.forEach((p) => { p.curtidas = p.curtidas.filter((id) => id !== userId); p.salvos = p.salvos.filter((id) => id !== userId); });
    c.groups.forEach((g) => { g.membros = g.membros.filter((id) => id !== userId); if (g.criadoPor === userId) g.criadoPor = null; });
    c.reports.filter((r) => r.autorId === userId).forEach((r) => { r.autorId = null; });
    c.media.filter((m) => m.ownerId === userId).forEach(deleteMediaFile);
    c.media = c.media.filter((m) => m.ownerId !== userId);
  });
}

export { communityRadarFeed };
export default router;
