// Status do sistema (painel admin → Status): cada serviço e chave do .env, com estado e detalhe.
// Sem "check", só lê a configuração e o que já se sabe (rápido). Com "check", testa de verdade cada
// serviço externo (rede, chave, modelo) — o botão "Verificar agora".
// estado: 'ok' | 'aviso' | 'erro' | 'desligado' (opcional e não configurado: não é falha).
import fs from 'node:fs';
import { config } from './config.js';
import { usesSupabase } from './database.js';
import { users } from './store.js';
import { aiStatus, checkAI } from './ai-health.js';
import { fxEnabled, cachedRate, refreshRate } from './fx.js';
import { schedulerRunning, lastScheduledRun } from './radar/scheduler.js';
import { overview as radarOverview } from './radar/admin.js';
import { requestStats, uptimeMs, startedAtIso } from './ops.js';

// Lido direto do .env (sem importar os módulos de vídeos/preços: o Status não depende deles).
const UGR_FEED = 'https://canal.ugr.es/feed/?post_type=noticia';
const mask = (v) => (v ? `••••${String(v).slice(-4)}` : null);
const DAY = 24 * 3600e3;

async function timed(fn) {
  const t = Date.now();
  try { return { ...(await fn()), latenciaMs: Date.now() - t }; } catch (err) {
    return { estado: 'erro', detalhe: err.name === 'TimeoutError' ? 'Sem resposta no tempo limite.' : `Falha: ${err.message}`, latenciaMs: Date.now() - t };
  }
}

async function ping(url, opts = {}) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), ...opts });
  return res;
}

const fromAI = (teste, base) => (teste.ok === true ? { estado: 'ok', detalhe: teste.detalhe, latenciaMs: teste.latenciaMs }
  : teste.ok === false ? { estado: 'erro', detalhe: teste.detalhe, latenciaMs: teste.latenciaMs } : { ...base, detalhe: teste.detalhe });

export async function systemStatus({ check = false } = {}) {
  const ia = aiStatus();
  const aiTest = check ? await checkAI() : null;
  const radar = radarOverview();
  const radarErros24h = radar.erros.filter((r) => Date.now() - Date.parse(r.fim || r.inicio || r.em || 0) < DAY).length;
  const falhando = radar.fontes.filter((s) => s.ativa && (s.estado === 'falhando' || s.estado === 'bloqueada'));
  // Na Vercel não há temporizador no processo: o atualizador é o cron (CRON_SECRET). Mais de 26 h sem coleta = parado.
  const viaCron = !schedulerRunning() && (process.env.CRON_SECRET || '').length >= 16;
  const automatico = schedulerRunning() || viaCron;
  const ultimaAgendada = viaCron ? lastScheduledRun() : null;
  const cronAtrasado = viaCron && (!ultimaAgendada || Date.now() - Date.parse(ultimaAgendada.inicio) > 26 * 60 * 60 * 1000);
  const mem = process.memoryUsage();

  const servicos = [];
  const add = (s) => servicos.push({ verificadoEm: new Date().toISOString(), latenciaMs: null, chave: null, ...s });

  add({ id: 'api', nome: 'API (servidor)', grupo: 'Plataforma', estado: 'ok', detalhe: `No ar há ${Math.floor(uptimeMs() / 3600e3)} h ${Math.floor((uptimeMs() % 3600e3) / 60e3)} min · memória ${Math.round(mem.rss / 1048576)} MB · Node ${process.version}` });

  add(await timed(async () => {
    if (usesSupabase()) {
      return { id: 'base', nome: 'Base de dados', grupo: 'Plataforma', estado: 'ok', detalhe: `${users.all().length} conta(s) · estado no Supabase (Postgres)` };
    }
    await fs.promises.access(config.dataFile, fs.constants.R_OK | fs.constants.W_OK);
    const st = await fs.promises.stat(config.dataFile);
    return { id: 'base', nome: 'Base de dados', grupo: 'Plataforma', estado: 'ok', detalhe: `${users.all().length} conta(s) · arquivo de ${(st.size / 1048576).toFixed(1)} MB, gravável` };
  }).then((r) => ({ id: 'base', nome: 'Base de dados', grupo: 'Plataforma', ...r })));

  add({
    id: 'radar', nome: 'Radar de Oportunidades', grupo: 'Plataforma',
    estado: !automatico ? 'desligado' : cronAtrasado ? 'aviso' : falhando.length || radarErros24h ? 'aviso' : 'ok',
    detalhe: !automatico ? (process.env.VERCEL ? 'Coleta agendada desligada: defina CRON_SECRET na Vercel (o Vercel Cron chama /api/cron/radar).' : 'Atualizador automático desligado (RADAR_SCHEDULER=off ou servidor de testes).')
      : cronAtrasado ? (ultimaAgendada ? `Última coleta agendada em ${new Date(ultimaAgendada.inicio).toLocaleString('pt-BR', { timeZone: 'Europe/Madrid' })}: o agendamento parou?` : 'CRON_SECRET definido, mas nenhuma coleta agendada ainda. Confira o Vercel Cron / GitHub Actions.')
      : falhando.length ? `${falhando.length} fonte(s) oficial(is) falhando: ${falhando.slice(0, 3).map((s) => s.titulo || s.id).join(', ')}`
        : radarErros24h ? `${radarErros24h} execução(ões) com erro nas últimas 24 h.`
          : `${radar.fontes.length} fonte(s) monitoradas${radar.desatualizadas.length ? ` · ${radar.desatualizadas.length} sem verificação recente` : ''}.`,
  });

  // IA
  const mentorBase = ia.mentor.ativo ? { estado: 'ok', detalhe: `${ia.mentor.nome} configurado. Use "Verificar agora" para testar a chave.` }
    : ia.mentor.problemaConfig ? { estado: 'erro', detalhe: ia.mentor.problemaConfig } : { estado: 'desligado', detalhe: 'Modo Guiado (MENTOR_PROVIDER=none): funciona sem IA e sem custo.' };
  add({ id: 'mentor', nome: 'Mentor IA', grupo: 'Inteligência artificial', chave: ia.mentor.chave, modelo: ia.mentor.modelo, ...(aiTest ? fromAI(aiTest.mentor, mentorBase) : mentorBase) });
  const assistBase = ia.assistente.ativo ? { estado: 'ok', detalhe: 'ANTHROPIC_API_KEY definida. Use "Verificar agora" para testar a chave.' } : { estado: 'desligado', detalhe: 'Sem ANTHROPIC_API_KEY: o Guia responde pela base local (offline).' };
  add({ id: 'assistente', nome: 'Assistente (Guia)', grupo: 'Inteligência artificial', chave: ia.assistente.chave, modelo: ia.assistente.modelo, ...(aiTest ? fromAI(aiTest.assistente, assistBase) : assistBase) });
  const falhasIA = ['mentor', 'assistente'].map((k) => ia[k].uso?.ultimoErro).filter((e) => e && Date.now() - Date.parse(e.em) < DAY);
  if (!check && falhasIA.length) servicos.filter((s) => s.grupo === 'Inteligência artificial' && s.estado === 'ok').forEach((s) => { s.estado = 'aviso'; s.detalhe = `Falha de IA nas últimas 24 h: ${falhasIA[0].mensagem}`; });

  // Integrações externas
  const fxBase = () => {
    const r = cachedRate();
    if (!fxEnabled()) return { estado: 'desligado', detalhe: 'Câmbio automático desligado (FX_PROVIDER=off).' };
    return r ? { estado: 'ok', detalhe: `EUR→BRL ${r.taxa.toFixed(4)} · cotação de ${r.data}` } : { estado: 'aviso', detalhe: 'Ainda sem cotação obtida (o estudante pode informar a taxa).' };
  };
  add({ id: 'cambio', nome: 'Câmbio (Banco Central Europeu)', grupo: 'Integrações', ...(check && fxEnabled() ? await timed(async () => { await refreshRate({ force: true }); const b = fxBase(); return b.estado === 'ok' ? b : { estado: 'erro', detalhe: 'O serviço de câmbio não respondeu.' }; }) : fxBase()) });

  add({ id: 'web', nome: 'Pesquisa na web (Canal UGR, GDELT)', grupo: 'Integrações',
    ...(check ? await timed(async () => { const r = await ping(UGR_FEED, { headers: { 'User-Agent': 'Estuvia/1.0 (status)' } }); return r.ok ? { estado: 'ok', detalhe: 'Feed oficial da UGR respondeu. Não precisa de chave.' } : { estado: 'aviso', detalhe: `Feed oficial respondeu ${r.status}.` }; })
      : { estado: 'ok', detalhe: 'Gratuito e sem chave. Use "Verificar agora" para testar a conexão.' }) });

  const ytKey = process.env.YOUTUBE_API_KEY;
  add({ id: 'youtube', nome: 'Vídeos (YouTube Data API)', grupo: 'Integrações', chave: mask(ytKey),
    ...(!ytKey ? { estado: 'desligado', detalhe: 'Opcional. Defina YOUTUBE_API_KEY (gratuita) para listar vídeos no Mentor.' }
      : check ? await timed(async () => { const r = await ping(`https://www.googleapis.com/youtube/v3/videos?part=id&id=jNQXAC9IVRw&key=${encodeURIComponent(ytKey)}`); return r.ok ? { estado: 'ok', detalhe: 'Chave válida.' } : { estado: 'erro', detalhe: r.status === 403 ? 'Chave inválida ou cota diária esgotada (403).' : `A API respondeu ${r.status}.` }; })
        : { estado: 'ok', detalhe: 'Chave definida. Use "Verificar agora" para testar.' }) });

  const tpToken = process.env.TRAVELPAYOUTS_TOKEN;
  add({ id: 'precos', nome: 'Preços de passagens (Travelpayouts)', grupo: 'Integrações', chave: mask(tpToken),
    ...(!tpToken ? { estado: 'desligado', detalhe: 'Opcional. Defina TRAVELPAYOUTS_TOKEN (gratuito) para mostrar preços e alertas.' }
      : check ? await timed(async () => { const r = await ping(`https://api.travelpayouts.com/aviasales/v3/prices_for_dates?origin=GRU&destination=MAD&one_way=true&limit=1&currency=brl`, { headers: { 'X-Access-Token': tpToken } }); return r.ok ? { estado: 'ok', detalhe: 'Token válido.' } : { estado: 'erro', detalhe: r.status === 401 || r.status === 403 ? 'Token inválido (401/403).' : r.status === 429 ? 'Limite gratuito atingido (429).' : `A API respondeu ${r.status}.` }; })
        : { estado: 'ok', detalhe: 'Token definido. Use "Verificar agora" para testar.' }) });

  // Segurança (só configuração)
  const jwtOk = (process.env.JWT_SECRET || '').length >= 32;
  add({ id: 'sessoes', nome: 'Segredo das sessões (JWT_SECRET)', grupo: 'Segurança', chave: jwtOk ? mask(process.env.JWT_SECRET) : null,
    estado: jwtOk ? 'ok' : 'aviso', detalhe: jwtOk ? 'Definido com tamanho seguro.' : 'Não definido: usando segredo local de desenvolvimento. Obrigatório em produção.' });
  const docsOk = (process.env.DOCUMENTS_KEY || '').length >= 32;
  add({ id: 'docs', nome: 'Chave dos documentos (DOCUMENTS_KEY)', grupo: 'Segurança', chave: docsOk ? mask(process.env.DOCUMENTS_KEY) : null,
    estado: docsOk ? 'ok' : config.isProd ? 'aviso' : 'ok', detalhe: docsOk ? 'Definida: arquivos cifrados com chave própria.' : 'Não definida: a chave é derivada do JWT_SECRET. Em produção, defina uma chave própria com backup.' });
  add({ id: 'admin', nome: 'Conta de administrador', grupo: 'Segurança',
    estado: config.adminEmail && (config.adminPassword || '').length >= (config.isProd ? 12 : 8) ? 'ok' : 'aviso', detalhe: config.adminEmail ? `ADMIN_EMAIL = ${config.adminEmail}` : 'ADMIN_EMAIL não definido.' });

  const geral = servicos.some((s) => s.estado === 'erro') ? 'erro' : servicos.some((s) => s.estado === 'aviso') ? 'aviso' : 'ok';
  return { geral, verificadoEm: new Date().toISOString(), testeCompleto: check, iniciadoEm: startedAtIso(), servicos };
}

export { requestStats };
