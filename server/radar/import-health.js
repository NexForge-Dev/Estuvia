// Saúde da coleta importada (RADAR_IMPORT_ONLY_HOSTS).
//
// As fontes da Junta de Andalucía (DUA) só chegam pela importação feita num computador comum
// (npm run radar:import, Agendador de Tarefas do Windows). Se esse computador ficar desligado, os dados
// do DUA envelhecem sem que nada falhe no servidor. Aqui medimos há quanto tempo nenhuma dessas fontes
// tem uma verificação bem-sucedida e, pelo cron, avisamos o administrador por e-mail.
//
// Várias dessas fontes vencem a cada 2 ou 3 h (registry.js), então um coletor saudável gera ao menos uma
// verificação bem-sucedida a cada poucas horas: 24 h sem nenhuma = coletor parado (ou a Junta fora do ar).
import { data } from './db.js';
import { importOnly } from './pipeline.js';
import { audit } from '../store.js';
import { config } from '../config.js';
import { sendEmail, emailEnabled } from '../email.js';

export const IMPORT_STALE_HOURS = 24;
const ALERT_EVERY_MS = 20 * 3600e3;
const ALERT_ACTION = 'radar.import-stale-alert';

export function importHealth(now = Date.now()) {
  const fontes = data().sources.filter((s) => s.metodo === 'html-publico' && s.ativa && !s.indisponivelManual && importOnly(s));
  if (!fontes.length) return { ativo: false };
  const ts = fontes.map((s) => Date.parse(s.ultimaVerificacaoOk || '')).filter(Number.isFinite);
  const ultima = ts.length ? Math.max(...ts) : null;
  const horas = ultima === null ? null : (now - ultima) / 3600e3;
  return {
    ativo: true,
    fontes: fontes.length,
    ultimaImportacao: ultima === null ? null : new Date(ultima).toISOString(),
    horasSemImportar: horas === null ? null : Math.floor(horas),
    atrasado: horas === null || horas > IMPORT_STALE_HOURS,
  };
}

const quando = (iso) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'Europe/Madrid' });

export function importHealthText(h) {
  if (!h.ativo) return null;
  if (!h.ultimaImportacao) return `Nenhuma importação bem-sucedida das ${h.fontes} fonte(s) do DUA. Rode npm run radar:import no computador do coletor.`;
  if (h.atrasado) return `Coletor do DUA parado: última importação bem-sucedida em ${quando(h.ultimaImportacao)} (horário de Madri), há ${h.horasSemImportar} h. Confira se o computador do coletor está ligado e a tarefa "Estuvia Radar (DUA)" está rodando.`;
  return `Última importação do DUA em ${quando(h.ultimaImportacao)} (horário de Madri), há ${h.horasSemImportar} h.`;
}

/** Chamado pelo cron: manda no máximo um e-mail a cada 20 h enquanto o coletor estiver parado. */
export async function alertStaleImport(now = Date.now()) {
  const h = importHealth(now);
  if (!h.ativo || !h.atrasado) return { alerta: false };
  const to = config.adminEmail;
  if (!to || !emailEnabled()) return { alerta: false, motivo: 'sem e-mail configurado' };
  const recente = audit.recent(1, (e) => e.action === ALERT_ACTION && e.enviado === true && now - Date.parse(e.at) < ALERT_EVERY_MS);
  if (recente.length) return { alerta: false, motivo: 'já avisado' };
  const sent = await sendEmail({
    to,
    subject: `${config.appName}: coletor do DUA parado`,
    text: `${importHealthText(h)}

Enquanto o coletor estiver parado, prazos, fichas e catálogo do DUA não são atualizados na plataforma.
Para rodar à mão: npm run radar:import (na pasta do projeto, com o arquivo radar-coletor.env).

Este aviso se repete a cada 20 h enquanto o problema continuar.`,
  });
  await audit.log({ action: ALERT_ACTION, enviado: sent, ultimaImportacao: h.ultimaImportacao });
  return { alerta: sent };
}
