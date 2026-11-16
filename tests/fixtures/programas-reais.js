// Mestrados REAIS do Distrito Único Andaluz usados pelos testes.
// programas-reais.json é um retrato de programForJourney() (server/radar/service.js) gerado a partir
// da base do Radar em 2026-11-16, com as fichas oficiais do DUA coletadas nesse dia. Os testes rodam
// com a base do Radar vazia; esta fonte registra os mesmos dados sem depender da coleta.
//   414007  UGR Estudios de Asia Oriental   espanhol B2 acreditado (ficha)
//   404605  UGR Arqueología                 ficha sem exigência de espanhol
//   407101  UGR Dibujo, Ilustración, Cómic  espanhol B1 acreditado (ficha)
//   200300  UCA Acuicultura y Pesca         ficha não coletada: idioma a verificar
import fs from 'node:fs';
import { registerProgramSource } from '../../server/content/catalog.js';

export const PROGRAMAS = JSON.parse(fs.readFileSync(new URL('./programas-reais.json', import.meta.url), 'utf8'));
export const ASIA_B2 = 'ugr-master-universitario-estudios-asia-oriental';
export const ARQUEOLOGIA = 'ugr-master-universitario-arqueologia';
export const DIBUJO_B1 = 'ugr-master-universitario-dibujo-ilustracion-comic-creacion-audiovisual';
export const UCA_ACUICULTURA = 'dua-200300';

registerProgramSource((id) => PROGRAMAS[id] || null);
