// Mede o custo de cada etapa da inicialização serverless (api/index.js) no modo JSON local.
// Uso: node scripts/profile-boot.mjs   (não toca em banco remoto: força DB_PROVIDER=json e STORAGE_PROVIDER=local)
import { performance } from 'node:perf_hooks';
process.env.DB_PROVIDER = 'json';
process.env.STORAGE_PROVIDER = 'local';
const t0 = performance.now();
const lap = (() => { let last = t0; return (label) => { const now = performance.now(); console.log(`${label.padEnd(34)} ${(now - last).toFixed(0).padStart(6)} ms  (total ${(now - t0).toFixed(0)} ms)`); last = now; }; })();
await import('../server/ops.js'); lap('import ops.js');
const { createApp } = await import('../server/app.js'); lap('import app.js (rotas)');
const { initStore } = await import('../server/store.js');
const { initRadarStore } = await import('../server/radar/db.js');
const { initRadar } = await import('../server/radar/service.js');
const { initDocRules } = await import('../server/document-rules.js');
const { ensureAdminAccount } = await import('../server/admin-seed.js'); lap('import demais módulos de boot');
await initStore(); lap('initStore');
await initRadarStore(); lap('initRadarStore');
await initRadar(); lap('initRadar');
await initDocRules(); lap('initDocRules');
await ensureAdminAccount(); lap('ensureAdminAccount');
createApp(); lap('createApp');

// Como a Vercel faz: tudo pela entrada serverless (etapas independentes em paralelo), num processo novo.
if (!process.env.PROFILE_CHILD) {
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const code = `const t=performance.now();const e=await import(${JSON.stringify(new URL('../api/index.js', import.meta.url).href)});await e.boot();console.log('api/index.js boot() completo (processo novo)'.padEnd(34), (performance.now()-t).toFixed(0).padStart(6), 'ms');`;
  spawnSync(process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'inherit', 'ignore'], env: { ...process.env, PROFILE_CHILD: '1' }, cwd: fileURLToPath(new URL('..', import.meta.url)) });
}
