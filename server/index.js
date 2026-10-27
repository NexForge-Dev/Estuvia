import './ops.js'; // primeiro: captura os logs da inicialização para o painel admin
import { createApp } from './app.js';
import { config } from './config.js';
import { flush } from './store.js';
import { flushRadar } from './radar/db.js';
import { startScheduler } from './radar/scheduler.js';

const server = createApp().listen(config.port, () => {
  console.log(`\n  ${config.appName} rodando em http://localhost:${config.port}`);
  console.log(`  Assistente: ${config.aiEnabled ? `Claude (${config.anthropicModel})` : 'modo offline (defina ANTHROPIC_API_KEY para ativar a IA)'}`);
  console.log(`  Radar de Oportunidades: ${startScheduler() ? 'atualizador ativo' : 'atualizador desligado (RADAR_SCHEDULER=off)'}\n`);
});

const shutdown = async () => {
  server.close();
  await Promise.all([flush(), flushRadar()]);
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
