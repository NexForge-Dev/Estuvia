// Registro de acesso às telas (uso por módulo no painel admin). O admin não entra na conta.
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, isAdmin } from '../security.js';
import { recordView } from '../usage.js';

const router = Router();

const schema = z.object({
  path: z.string().max(200),
  prev: z.object({ path: z.string().max(200), ms: z.number().min(0).max(864e5) }).strict().optional(),
}).strict();

router.post('/', requireAuth, (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.' });
  if (!isAdmin(req.user)) recordView(req.user, parsed.data.path, parsed.data.prev);
  res.status(204).end();
});

export default router;
