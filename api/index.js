// Entrada serverless da Vercel: um único handler Express, sem listen.
// As bases (Supabase) e as regras editoriais são carregadas uma vez por instância antes de atender.
//
// Partida a frio (medir com scripts/profile-boot*.mjs): o que não depende um do outro corre junto.
//  - a base principal e a do Radar são lidas do Supabase ao mesmo tempo (cada uma com as tabelas em paralelo);
//  - as regras editoriais (Storage) também;
//  - enquanto a rede responde, o Node carrega os módulos das rotas (app.js e dependências), que antes vinham
//    todos antes da primeira chamada ao banco.
// A ordem que importa continua garantida: a importação inicial do Radar (tabelas vazias) espera a base principal
// (as inscrições referenciam usuários), a conta admin espera a base principal e o Radar só inicia com a base dele.
import '../server/ops.js'; // primeiro: captura os logs da inicialização para o painel admin
import { initStore, storeHealth } from '../server/store.js';
import { initRadarStore, radarStoreHealth } from '../server/radar/db.js';
import { pingDatabase } from '../server/database.js';

let appPromise = null;
let ready = false;
let bootError = null; // última falha da inicialização (o /api/health a informa enquanto não houver nova tentativa bem-sucedida)

export function boot() {
  appPromise ??= (async () => {
    const main = initStore(); // inicia já: carrega o cliente do Supabase e vai à rede
    const radar = initRadarStore(main);
    const docRules = import('../server/document-rules.js').then((m) => m.initDocRules());
    const appModule = import('../server/app.js');
    const admin = main.then(() => import('../server/admin-seed.js')).then((m) => m.ensureAdminAccount());
    const radarService = Promise.all([main, radar]).then(() => import('../server/radar/service.js')).then((m) => m.initRadar());
    // allSettled: numa falha, espera as outras etapas terminarem antes de liberar uma nova tentativa (senão duas
    // cargas do mesmo store correriam ao mesmo tempo sobre a mesma memória).
    const steps = await Promise.allSettled([appModule, main, radar, docRules, admin, radarService]);
    const failed = steps.find((s) => s.status === 'rejected');
    if (failed) throw failed.reason;
    const app = steps[0].value.createApp();
    ready = true;
    bootError = null;
    return app;
  })().catch((err) => {
    appPromise = null;
    bootError = { em: new Date().toISOString() };
    throw err;
  });
  return appPromise;
}

// /api/health numa instância que ainda está subindo: não espera a carga completa das tabelas (vários segundos).
// Responde com o que é verificável agora: a inicialização anterior não falhou, o banco responde e nenhuma gravação
// falhou nesta instância. A carga continua em segundo plano para as próximas requisições.
const isHealth = (req) => req.method === 'GET' && /^\/api\/health\/?(\?|$)/.test(req.url || '');

async function coldHealth(req, res) {
  const failed = bootError;
  boot().catch((err) => console.error('[boot] falha ao iniciar:', err.message));
  let ok = !failed;
  if (ok) {
    try { await pingDatabase(); } catch (err) {
      console.error('[health] banco sem resposta:', err.message);
      ok = false;
    }
  }
  ok &&= storeHealth().ok && radarStoreHealth().ok;
  res.statusCode = ok ? 200 : 503;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(ok ? { ok } : { ok, erro: failed ? 'Falha ao iniciar o servidor.' : 'Banco de dados sem resposta.' }));
}

export default async function handler(req, res) {
  if (!ready && isHealth(req)) return coldHealth(req, res);
  const app = await boot();
  return app(req, res);
}
