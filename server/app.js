import express from 'express';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { securityHeaders, csrfGuard, apiLimiter } from './security.js';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import contentRoutes from './routes/content.js';
import assistantRoutes from './routes/assistant.js';
import journeyRoutes from './routes/journey.js';
import plannerRoutes from './routes/planner.js';
import financeRoutes from './routes/finance.js';
import livingRoutes from './routes/living.js';
import achievementsRoutes from './routes/achievements.js';
import communityRoutes from './routes/community.js';
import radarRoutes from './routes/radar.js';
import radarAdminRoutes from './routes/radar-admin.js';
import mentorRoutes from './routes/mentor.js';
import travelRoutes from './routes/travel.js';
import documentRoutes from './routes/documents.js';
import adminRoutes from './routes/admin.js';
import trackRoutes from './routes/track.js';
import { ensureAdminAccount } from './admin-seed.js';
import { initRadar } from './radar/service.js';

export function createApp() {
  initRadar().catch((err) => console.error('[radar] falha ao iniciar:', err.message));
  ensureAdminAccount().catch((err) => console.error('[admin] falha ao preparar conta:', err.message));
  const app = express();
  app.disable('x-powered-by');
  if (config.isProd) app.set('trust proxy', 1);

  app.use(securityHeaders);
  app.use(express.json({ limit: '50kb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.use(apiLimiter, csrfGuard);
  api.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  api.get('/health', (req, res) => res.json({ ok: true }));
  api.use('/auth', authRoutes);
  api.use('/me', meRoutes);
  api.use('/journeys', journeyRoutes);
  api.use('/planner', plannerRoutes);
  api.use('/finance', financeRoutes);
  api.use('/living', livingRoutes);
  api.use('/achievements', achievementsRoutes);
  api.use('/community', communityRoutes);
  api.use('/radar/admin', radarAdminRoutes);
  api.use('/radar', radarRoutes);
  api.use('/mentor', mentorRoutes);
  api.use('/travel', travelRoutes);
  api.use('/documents', documentRoutes);
  api.use('/admin', adminRoutes);
  api.use('/track', trackRoutes);
  api.use('/content', contentRoutes);
  api.use('/assistant', assistantRoutes);
  api.use((req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  app.use('/api', api);

  app.use(express.static(config.publicDir, { extensions: ['html'], maxAge: config.isProd ? '1h' : 0 }));
  // SPA: qualquer outra rota devolve o index (o roteamento é por hash, mas mantemos por robustez).
  app.get('*', (req, res) => res.sendFile('index.html', { root: config.publicDir }));

  // Erros inesperados nunca vazam stack trace para o cliente.
  app.use((err, req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Conteúdo grande demais.' });
    console.error('[erro]', err);
    res.status(500).json({ error: 'Algo deu errado do nosso lado. Tente novamente.' });
  });
  return app;
}
