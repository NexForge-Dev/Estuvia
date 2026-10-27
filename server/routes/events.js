// GET /api/events — canal de atualizações ao vivo (Server-Sent Events) do estudante logado.
import { Router } from 'express';
import { requireAuth } from '../security.js';
import { subscribe } from '../events.js';

const router = Router();

router.get('/', requireAuth, (req, res) => {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // proxies (nginx) não seguram os eventos
  res.flushHeaders?.();
  // "retry": se a conexão cair, o navegador tenta de novo em 15 s.
  res.write(`retry: 15000\nevent: conectado\ndata: ${JSON.stringify({ em: new Date().toISOString() })}\n\n`);
  subscribe(req.user.id, res);
});

export default router;
