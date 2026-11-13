// Atualizador do Radar. Roda as fontes vencidas (frequência configurada por fonte, com recuo exponencial
// após falhas), uma por vez, e recalcula os alertas por data. As frequências são metas, não garantia de
// atualização instantânea.
//
// Dois jeitos de disparar:
// - servidor comum (npm start): temporizadores neste processo, a cada 15 min (startScheduler);
// - Vercel (serverless, sem processo contínuo): GET /api/cron/radar, chamado pelo Vercel Cron e/ou pelo
//   GitHub Actions (.github/workflows/radar-cron.yml), com orçamento de tempo por chamada (runScheduled).

import { dueSources, runSource } from './pipeline.js';
import { tick } from './notify.js';
import { save, data } from './db.js';

const CHECK_MS = 15 * 60 * 1000;
const TICK_MS = 60 * 60 * 1000;
let timers = [];
let running = false;

/**
 * Roda as fontes vencidas, a mais atrasada primeiro, até acabar o orçamento de tempo. A primeira sempre roda;
 * as seguintes só começam se ainda couber uma execução tão longa quanto a mais longa desta chamada.
 */
export async function runScheduled({ budgetMs = Infinity, origem = 'agendada' } = {}) {
  if (running) return { executadas: [], pendentes: dueSources().length, alertas: 0, ocupado: true };
  running = true;
  const started = Date.now();
  const executadas = [];
  try {
    const due = [...dueSources()].sort((a, b) => (Date.parse(a.proximaVerificacao || 0) || 0) - (Date.parse(b.proximaVerificacao || 0) || 0));
    let longest = 0;
    for (const s of due) {
      if (executadas.length && Date.now() - started + longest * 1.2 > budgetMs) break;
      const t0 = Date.now();
      const run = await runSource(s.id, { origem });
      const ms = Date.now() - t0;
      longest = Math.max(longest, ms);
      executadas.push({ fonte: s.id, resultado: run.resultado, mudancas: run.mudancas, erro: run.erro || null, ms });
      console.log(`[radar] ${s.id}: ${run.resultado}${run.erro ? ` - ${run.erro}` : ''}${run.mudancas ? ` (${run.mudancas} alteração/ões)` : ''}`);
    }
    const alertas = tick().length;
    if (alertas) await save();
    return { executadas, pendentes: due.length - executadas.length, alertas };
  } finally {
    running = false;
  }
}

/** Última execução disparada pelo agendamento (cron), para o painel de Status. */
export const lastScheduledRun = () => data().runs.filter((r) => r.origem === 'agendada').at(-1) || null;

async function cycle() {
  try { await runScheduled(); } catch (err) { console.error('[radar] falha no ciclo do atualizador:', err.message); }
}

export function startScheduler() {
  if (process.env.RADAR_SCHEDULER === 'off' || timers.length) return false;
  timers = [
    setTimeout(cycle, 10 * 1000),
    setInterval(cycle, CHECK_MS),
    setInterval(() => { if (tick().length) save(); }, TICK_MS),
  ];
  timers.forEach((t) => t.unref?.());
  return true;
}

export const schedulerRunning = () => timers.length > 0;

export function stopScheduler() {
  timers.forEach((t) => clearTimeout(t));
  timers = [];
}
