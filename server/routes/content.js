import { Router } from 'express';
import { ROUNDS, MILESTONES, JOURNEY_TEMPLATE } from '../content/rounds.js';
import { SOURCES, TAGS } from '../content/sources.js';
import { UNIVERSITIES, PROGRAMS } from '../content/catalog.js';
import { DOCUMENTS } from '../content/documents.js';
import { FAQ } from '../content/knowledge.js';
import { config } from '../config.js';
import { requireAuth } from '../security.js';
import { SCHOLARSHIPS, SCHOLARSHIP_STATUS } from '../content/scholarships.js';
import { CONSULATES, CITY_GUIDES, CONSULATE_LIST_URL } from '../content/places.js';
import { IPREM, VISA_RULE } from '../content/finance.js';
import { SITUACAO } from '../content/rounds.js';
import { DOC_STATUS_LABEL } from '../content/documents.js';
import { trackOf, PARALLEL_TRACKS } from '../content/progression.js';

const router = Router();

// Visão geral das rodadas (sem missões): o único conteúdo da jornada visível sem conta.
const overview = ROUNDS.map(({ numero, sigla, titulo, etapa, banner, icone, resumo, transversal }) => ({ numero, sigla: sigla || null, titulo, etapa, banner, icone, resumo, transversal: Boolean(transversal), missoes: [] }));

// ---------- Público: painel explicativo, login e cadastro ----------
router.get('/app', (req, res) => res.json({ nome: config.appName, ia: config.aiEnabled ? 'claude' : 'offline' }));
router.get('/journey', (req, res) => res.json({ template: JOURNEY_TEMPLATE, rounds: overview, milestones: MILESTONES, tags: TAGS, situacao: SITUACAO }));

// ---------- Somente com conta ----------
router.use(requireAuth);

// Manual de referência: o mapa do processo (rodadas e nomes das missões). A execução detalhada
// — guias, checklists, ferramentas — só existe dentro de "Minha Jornada", liberada pela progressão.
router.get('/manual', (req, res) => res.json({
  rounds: ROUNDS.map((r) => ({
    numero: r.numero, sigla: r.sigla || null, titulo: r.titulo, etapa: r.etapa, banner: r.banner, resumo: r.resumo, conclusao: r.conclusao, transversal: Boolean(r.transversal),
    missoes: r.missoes.map((m) => ({ id: m.id, titulo: m.titulo, resumo: m.resumo, opcional: Boolean(m.opcional), trilha: trackOf(m.id, r.numero) ? PARALLEL_TRACKS[trackOf(m.id, r.numero)].titulo : null, fontes: m.fontes || [] })),
  })),
  trilhas: PARALLEL_TRACKS,
}));
router.get('/sources', (req, res) => res.json({ sources: SOURCES, tags: TAGS }));
router.get('/catalog', (req, res) => res.json({ universities: UNIVERSITIES, programs: PROGRAMS }));
router.get('/documents', (req, res) => res.json({ documents: DOCUMENTS, statusLabel: DOC_STATUS_LABEL }));
router.get('/scholarships', (req, res) => res.json({ scholarships: SCHOLARSHIPS, status: SCHOLARSHIP_STATUS }));
router.get('/places', (req, res) => res.json({ consulates: CONSULATES, cityGuides: CITY_GUIDES, consulateListUrl: CONSULATE_LIST_URL }));
router.get('/finance-rules', (req, res) => res.json({ iprem: IPREM, regra: VISA_RULE }));
router.get('/faq', (req, res) => res.json({ faq: FAQ.map(({ keywords, ...f }) => f) }));

export default router;
