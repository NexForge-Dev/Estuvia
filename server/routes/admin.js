// Painel do administrador: quem está acessando, cadastros, eventos de segurança e ações na conta.
// Acesso: usuário com role "admin" (a conta ADMIN_EMAIL do .env recebe esse papel na inicialização).
import { Router } from 'express';
import { z } from 'zod';
import { users, audit, newId } from '../store.js';
import { requireAuth, requireAdmin, isAdmin, ROLES } from '../security.js';
import { usageReport, userUsage, moduleLabel } from '../usage.js';
import { studentRow, studentReport, enrollmentOverview } from '../admin-student.js';
import { aiStatus, checkAI } from '../ai-health.js';
import { systemStatus } from '../system-status.js';
import { requestStats, recentLogs } from '../ops.js';
import { DOCUMENTS } from '../content/documents.js';
import { SOURCES } from '../content/sources.js';
import { allDocRules, setDocRule } from '../document-rules.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const ONLINE_MS = 5 * MIN;
const ago = (iso) => (iso ? Date.now() - Date.parse(iso) : Infinity);
const dayKey = (t) => new Date(t).toISOString().slice(0, 10);

// Resumo legível do navegador (sem bibliotecas: só os casos comuns).
export function describeUA(ua = '') {
  if (!ua) return null;
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /node|curl|undici/i.test(ua) ? 'Script' : 'Outro';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '-';
  const device = /Mobi|iPhone|Android(?!.*Tablet)/.test(ua) ? 'celular' : /iPad|Tablet/.test(ua) ? 'tablet' : 'computador';
  return { browser, os, device };
}

function summary(u) {
  const p = u.profile || {};
  return {
    id: u.id,
    email: u.email,
    nome: p.nome || '-',
    avatar: p.avatar || '🎓',
    createdAt: u.createdAt,
    lastSeenAt: u.lastSeenAt || null,
    online: ago(u.lastSeenAt) < ONLINE_MS,
    modulo: u.currentModule ? moduleLabel(u.currentModule) : null,
    visitas: u.visits || 0,
    diasAtivos: (u.activeDays || []).length,
    ip: u.lastIp || null,
    dispositivo: describeUA(u.lastUserAgent),
    jornadas: (u.journeys || []).length,
    documentos: Object.keys(u.documents || {}).length,
    onboarding: !!p.onboardingConcluido,
    admin: isAdmin(u),
    papel: u.role || 'estudante',
    bloqueado: !!u.blocked,
  };
}

const emailOf = (id) => users.findById(id)?.email || null;
const withEmail = (e) => ({ ...e, email: e.email || (e.userId ? emailOf(e.userId) : null), dispositivo: describeUA(e.ua) });

const PERIODS = [7, 30, 90];

router.get('/overview', (req, res) => {
  const periodo = PERIODS.includes(Number(req.query.periodo)) ? Number(req.query.periodo) : 30;
  const all = users.all().filter((u) => !isAdmin(u)); // números só dos estudantes
  const now = Date.now();
  const count = (fn) => all.filter(fn).length;

  // Série dos últimos 30 dias: estudantes ativos e novos cadastros por dia.
  const dias = [];
  for (let i = 29; i >= 0; i -= 1) {
    const d = dayKey(now - i * DAY);
    dias.push({ dia: d, ativos: count((u) => (u.activeDays || []).includes(d)), cadastros: count((u) => u.createdAt?.slice(0, 10) === d) });
  }

  const failed24h = audit.recent(5000, (e) => e.action === 'login-failed' && ago(e.at) < DAY);
  const byIp = {};
  failed24h.forEach((e) => { if (e.ip) byIp[e.ip] = (byIp[e.ip] || 0) + 1; });

  res.json({
    totais: {
      usuarios: all.length,
      online: count((u) => ago(u.lastSeenAt) < ONLINE_MS),
      ativos24h: count((u) => ago(u.lastSeenAt) < DAY),
      ativos7d: count((u) => ago(u.lastSeenAt) < 7 * DAY),
      ativos30d: count((u) => ago(u.lastSeenAt) < 30 * DAY),
      novos7d: count((u) => ago(u.createdAt) < 7 * DAY),
      bloqueados: count((u) => u.blocked),
      comJornada: count((u) => (u.journeys || []).length > 0),
      loginsFalhos24h: failed24h.length,
      inativos7d: count((u) => ago(u.lastSeenAt || u.createdAt) >= 7 * DAY),
      inativos30d: count((u) => ago(u.lastSeenAt || u.createdAt) >= 30 * DAY),
    },
    inscricoes: enrollmentOverview(all),
    ia: aiStatus(),
    dias,
    uso: usageReport(periodo),
    ipsSuspeitos: Object.entries(byIp).filter(([, n]) => n >= 5).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([ip, tentativas]) => ({ ip, tentativas })),
    online: all.filter((u) => ago(u.lastSeenAt) < ONLINE_MS).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)).map(summary),
    eventos: audit.recent(150).map(withEmail),
  });
});

// Filtros da lista de estudantes (chips no painel).
const FILTERS = {
  todos: () => true,
  alerta: (r) => r.alertas > 0,
  inativos: (r) => r.diasSemEntrar >= 7,
  'sem-jornada': (r) => !r.inscricao,
  'candidatura-enviada': (r) => r.inscricao && r.inscricao.candidatura !== 'nao-enviada',
  admitidos: (r) => ['admitido', 'admitido-outra-opcao'].includes(r.inscricao?.candidatura),
  'visto-aprovado': (r) => r.inscricao?.visto === 'aprovado',
};

router.get('/users', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase().slice(0, 80);
  const filtro = FILTERS[req.query.filtro] ? req.query.filtro : 'todos';
  const ordem = ['ultimo-acesso', 'inatividade', 'progresso', 'alertas', 'cadastro'].includes(req.query.ordem) ? req.query.ordem : 'ultimo-acesso';
  const list = users.all()
    .filter((u) => !isAdmin(u))
    .filter((u) => !q || u.email.includes(q) || String(u.profile?.nome || '').toLowerCase().includes(q))
    .map((u) => ({ ...summary(u), ...studentRow(u) }))
    .filter(FILTERS[filtro]);
  const by = {
    'ultimo-acesso': (a, b) => (b.lastSeenAt || b.createdAt || '').localeCompare(a.lastSeenAt || a.createdAt || ''),
    inatividade: (a, b) => (b.diasSemEntrar ?? -1) - (a.diasSemEntrar ?? -1),
    progresso: (a, b) => (b.progresso ?? -1) - (a.progresso ?? -1),
    alertas: (a, b) => Number(b.alertaAlto) - Number(a.alertaAlto) || b.alertas - a.alertas,
    cadastro: (a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''),
  };
  res.json({ users: list.sort(by[ordem]), filtro, ordem });
});

// Status da IA (chaves, uso, erros) e teste real de conexão.
router.get('/ai', (req, res) => res.json(aiStatus()));
router.post('/ai/check', async (req, res) => {
  const result = await checkAI();
  await audit.log({ action: 'admin-ai-check', userId: req.user.id, mentorOk: result.mentor.ok, assistenteOk: result.assistente.ok });
  res.json({ ...result, status: aiStatus() });
});

// Status do sistema (serviços e chaves) + métricas de requisições; ?check=1 testa cada serviço de verdade.
const HOURS = [1, 6, 24, 168];
router.get('/status', async (req, res) => {
  const horas = HOURS.includes(Number(req.query.horas)) ? Number(req.query.horas) : 24;
  const check = req.query.check === '1';
  const status = await systemStatus({ check });
  if (check) await audit.log({ action: 'admin-status-check', userId: req.user.id, geral: status.geral });
  res.json({ ...status, metricas: requestStats(horas) });
});

// Logs do servidor (memória, desde o último reinício).
router.get('/logs', (req, res) => {
  const nivel = ['info', 'aviso', 'erro'].includes(req.query.nivel) ? req.query.nivel : null;
  res.json(recentLogs({ nivel, q: String(req.query.q || '').slice(0, 100) }));
});

router.get('/users/:id', (req, res) => {
  const u = users.findById(req.params.id);
  if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });
  const p = u.profile || {};
  res.json({
    user: {
      ...summary(u),
      userAgent: u.lastUserAgent || null,
      perfil: { nacionalidade: p.nacionalidade, paisResidencia: p.paisResidencia, formacao: p.formacao, area: p.area, espanhol: p.espanhol, situacaoCandidatura: p.situacaoCandidatura, situacaoVisto: p.situacaoVisto },
      diasAtivosLista: (u.activeDays || []).slice(-30),
      modulos: userUsage(u),
    },
    relatorio: studentReport(u),
    eventos: audit.recent(100, (e) => e.userId === u.id || e.targetId === u.id || (e.email && e.email === u.email)).map(withEmail),
  });
});

// Suspender / reativar conta. A suspensão derruba as sessões abertas na próxima requisição.
router.post('/users/:id/block', async (req, res) => {
  const parsed = z.object({ bloqueado: z.boolean() }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.' });
  const target = users.findById(req.params.id);
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado.' });
  if (isAdmin(target)) return res.status(400).json({ error: 'Não é possível suspender um administrador.' });
  const user = await users.update(target.id, (u) => { u.blocked = parsed.data.bloqueado; if (u.blocked) u.tokenVersion += 1; });
  await audit.log({ action: parsed.data.bloqueado ? 'admin-block' : 'admin-unblock', userId: req.user.id, targetId: user.id });
  res.json({ user: summary(user) });
});

// Papéis da equipe (moderação da comunidade, equipe do Radar). O papel "admin" não é concedido
// por aqui: só a conta ADMIN_EMAIL do .env é administradora.
router.post('/users/:id/role', async (req, res) => {
  const parsed = z.object({ papel: z.enum(ROLES.filter((r) => r !== 'admin')) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Papel inválido.' });
  const target = users.findById(req.params.id);
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado.' });
  if (isAdmin(target)) return res.status(400).json({ error: 'O papel do administrador não pode ser alterado por aqui.' });
  const anterior = target.role || 'estudante';
  const user = await users.update(target.id, (u) => {
    if (parsed.data.papel === 'estudante') delete u.role; else u.role = parsed.data.papel;
    if (anterior !== parsed.data.papel) u.tokenVersion += 1; // a sessão aberta passa a refletir o novo papel
  });
  await audit.log({ action: 'admin-role', userId: req.user.id, targetId: user.id, de: anterior, para: parsed.data.papel });
  res.json({ user: summary(user) });
});

// Anotações internas do admin sobre o estudante (o estudante não vê).
router.post('/users/:id/notes', async (req, res) => {
  const parsed = z.object({ texto: z.string().trim().min(1, 'Escreva a anotação.').max(1000) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' });
  if (!users.findById(req.params.id)) return res.status(404).json({ error: 'Usuário não encontrado.' });
  const note = { id: newId(), texto: parsed.data.texto, em: new Date().toISOString(), por: req.user.email };
  const user = await users.touch(req.params.id, (u) => { u.adminNotes = [...(u.adminNotes || []), note].slice(-200); });
  res.status(201).json({ notas: user.adminNotes.slice().reverse() });
});
router.delete('/users/:id/notes/:noteId', async (req, res) => {
  if (!users.findById(req.params.id)) return res.status(404).json({ error: 'Usuário não encontrado.' });
  const user = await users.touch(req.params.id, (u) => { u.adminNotes = (u.adminNotes || []).filter((n) => n.id !== req.params.noteId); });
  res.json({ notas: user.adminNotes.slice().reverse() });
});

// Encerra todas as sessões do usuário (ele precisa entrar de novo).
router.post('/users/:id/logout', async (req, res) => {
  const target = users.findById(req.params.id);
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado.' });
  const user = await users.update(target.id, (u) => { u.tokenVersion += 1; });
  await audit.log({ action: 'admin-logout-user', userId: req.user.id, targetId: user.id });
  res.json({ user: summary(user) });
});


// ---------- Carteira de documentos: revisão editorial das exigências (sem mexer nas telas) ----------
router.get('/document-rules', (req, res) => {
  const rules = allDocRules();
  res.json({
    documentos: DOCUMENTS.map((d) => ({ id: d.id, nome: d.nome, categoria: d.categoria, fontes: d.fontes || [d.fonte], revisao: rules[d.id] || null })),
    fontes: SOURCES.filter((s) => s.tipo !== 'demo').map((s) => ({ id: s.id, orgao: s.orgao, titulo: s.titulo, url: s.url, revisadoEm: s.revisadoEm })),
  });
});

router.put('/document-rules/:docId', async (req, res) => {
  if (!DOCUMENTS.some((d) => d.id === req.params.docId)) return res.status(404).json({ error: 'Documento desconhecido.' });
  const parsed = z.object({
    aviso: z.string().trim().max(400).optional(),
    revisadoEm: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    fontes: z.array(z.string().max(10)).max(6).optional(),
    remover: z.literal(true).optional(),
  }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Revisão inválida.' });
  const revisao = await setDocRule(req.params.docId, parsed.data.remover ? null : parsed.data, req.user.email);
  await audit.log({ action: 'admin-document-rule', userId: req.user.id, docId: req.params.docId });
  res.json({ revisao });
});

export default router;
