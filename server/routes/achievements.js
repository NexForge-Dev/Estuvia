// Conquistas do estudante: calculadas a partir dos fatos da jornada, com data da primeira vez.
import { Router } from 'express';
import { z } from 'zod';
import { users } from '../store.js';
import { requireAuth } from '../security.js';
import { ACHIEVEMENTS } from '../content/achievements.js';
import { evaluate, syncRecord, markSeen, summarize } from '../achievements-engine.js';

const router = Router();
router.use(requireAuth);

// GET também registra conquistas recém-liberadas (data da primeira vez), pois elas podem vir de
// qualquer tela: missão, situação, documentos, finanças, moradia, viagem.
router.get('/', async (req, res) => {
  let user = req.user;
  const { registro, changed } = syncRecord(user.conquistas, evaluate(user));
  if (changed) user = await users.update(user.id, (u) => { u.conquistas = registro; });
  const conquistas = evaluate(user);
  res.json({ conquistas, resumo: summarize(conquistas), novas: conquistas.filter((a) => a.nova) });
});

// Marca a celebração como vista (para não repetir o aviso).
router.post('/seen', async (req, res) => {
  const parsed = z.object({ ids: z.array(z.enum(ACHIEVEMENTS.map((a) => a.id))).max(ACHIEVEMENTS.length) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Conquistas inválidas.' });
  await users.update(req.user.id, (u) => { u.conquistas = markSeen(u.conquistas, parsed.data.ids); });
  res.json({ ok: true });
});

export default router;
