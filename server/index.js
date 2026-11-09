import './ops.js'; // primeiro: captura os logs da inicialização para o painel admin
import { createApp } from './app.js';
import { config } from './config.js';
import { flush, initStore } from './store.js';
import { flushRadar, initRadarStore } from './radar/db.js';
import { initDocRules } from './document-rules.js';
import { startScheduler } from './radar/scheduler.js';
import { startPriceWatcher } from './flight-prices.js';
import { videosEnabled, startFeedWarmer } from './websearch/index.js';

// Carrega/migra o estado antes de criar rotas que fazem leituras síncronas do store.
await Promise.all([initStore(), initRadarStore(), initDocRules()]);

const server = createApp().listen(config.port, () => {
  console.log(`\n  ${config.appName} rodando em http://localhost:${config.port}`);
  console.log(`  Assistente: ${config.aiEnabled ? `Claude (${config.anthropicModel})` : 'modo offline (defina ANTHROPIC_API_KEY para ativar a IA)'}`);
  console.log(`  Radar de Oportunidades: ${startScheduler() ? 'atualizador ativo' : 'atualizador desligado (RADAR_SCHEDULER=off)'}`);
  console.log(`  Preços de passagens: ${startPriceWatcher() ? 'ativos (Travelpayouts), alertas a cada 6 h' : 'desligados (defina TRAVELPAYOUTS_TOKEN, gratuito)'}`);
  startFeedWarmer();
  console.log(`  Pesquisa na web: Canal UGR, GDELT e Wikipédia · vídeos: ${videosEnabled() ? 'YouTube ativo' : 'desligados (defina YOUTUBE_API_KEY, gratuita)'}\n`);
});

const shutdown = async () => {
  server.close();
  await Promise.all([flush(), flushRadar()]);
  process.exit(0);
};
// Última barreira: uma promessa esquecida não pode derrubar o servidor de todos os estudantes.
process.on('unhandledRejection', (err) => console.error('[erro] promessa rejeitada sem tratamento:', err?.message || err));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
