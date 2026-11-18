// Tarefas agendadas (Vercel Cron, GitHub Actions). Sem processo contínuo na Vercel, o atualizador do Radar
// roda quando o agendador chama esta rota. Acesso só com o segredo: Authorization: Bearer <CRON_SECRET>
// (o Vercel Cron envia esse cabeçalho sozinho quando a variável CRON_SECRET existe no projeto).
import crypto from 'node:crypto';
import express from 'express';
import { runScheduled } from '../radar/scheduler.js';
import { alertStaleImport } from '../radar/import-health.js';

const router = express.Router();
// A função da Vercel tem até 60 s (vercel.json); deixa folga para sincronizar e responder.
const BUDGET_MS = Number(process.env.CRON_BUDGET_MS) || 45_000;

function authorized(req) {
  const secret = process.env.CRON_SECRET || '';
  if (secret.length < 16) return null; // sem segredo configurado, a rota fica desligada
  const got = Buffer.from(String(req.get('Authorization') || ''));
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

router.get('/radar', async (req, res) => {
  const ok = authorized(req);
  // Sem segredo configurado a rota simplesmente não existe para quem chama (404): não revela a
  // configuração e não infla o log de erros 5xx. O painel de Status mostra o CRON_SECRET ausente.
  if (ok === null) return res.status(404).json({ error: 'Não encontrado.' });
  if (!ok) return res.status(401).json({ error: 'Não autorizado.' });
  const r = await runScheduled({ budgetMs: BUDGET_MS });
  // Coletor do DUA (importação feita fora da Vercel) parado há mais de 24 h: avisa o administrador.
  const coletor = await alertStaleImport().catch((err) => ({ alerta: false, erro: err.message }));
  res.json({ ok: true, ...r, coletor });
});

export default router;
