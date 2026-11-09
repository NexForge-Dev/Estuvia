// Entrada serverless da Vercel: um único handler Express, sem listen.
// As bases (Supabase) e as regras editoriais são carregadas uma vez por instância antes de atender.
import '../server/ops.js'; // primeiro: captura os logs da inicialização para o painel admin
import { createApp } from '../server/app.js';
import { initStore } from '../server/store.js';
import { initRadarStore } from '../server/radar/db.js';
import { initRadar } from '../server/radar/service.js';
import { initDocRules } from '../server/document-rules.js';
import { ensureAdminAccount } from '../server/admin-seed.js';

let appPromise = null;

function boot() {
  appPromise ??= (async () => {
    await Promise.all([initStore(), initRadarStore()]);
    await Promise.all([initRadar(), initDocRules(), ensureAdminAccount()]);
    return createApp();
  })().catch((err) => { appPromise = null; throw err; });
  return appPromise;
}

export default async function handler(req, res) {
  const app = await boot();
  return app(req, res);
}
