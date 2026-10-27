// Agendador do atualizador: verifica a cada 15 min quais fontes estão vencidas (frequência
// configurada por fonte, com recuo exponencial após falhas) e roda uma por vez. A cada hora
// recalcula os alertas por data. As frequências são metas, não garantia de atualização instantânea.

import { dueSources, runSource } from './pipeline.js';
import { tick } from './notify.js';
import { save } from './db.js';

const CHECK_MS = 15 * 60 * 1000;
const TICK_MS = 60 * 60 * 1000;
let timers = [];
let running = false;

async function cycle() {
  if (running) return;
  running = true;
  try {
    for (const s of dueSources()) {
      const run = await runSource(s.id);
      console.log(`[radar] ${s.id}: ${run.resultado}${run.erro ? ` — ${run.erro}` : ''}${run.mudancas ? ` (${run.mudancas} alteração/ões)` : ''}`);
    }
  } catch (err) {
    console.error('[radar] falha no ciclo do atualizador:', err.message);
  } finally {
    running = false;
  }
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
