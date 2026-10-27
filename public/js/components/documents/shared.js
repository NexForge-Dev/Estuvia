// Peças comuns da carteira de documentos.
import { h } from '../../ui.js';
import { icon } from '../../icons.js';

let styled = false;
export function ensureStyles() {
  if (styled || document.querySelector('link[href="/css/documents.css"]')) { styled = true; return; }
  styled = true;
  document.head.append(h('link', { rel: 'stylesheet', href: '/css/documents.css' }));
}

// Rótulos simples (os estados internos continuam os mesmos no servidor).
export const STATUS = {
  pendente: { label: 'Pendente', tone: 'muted', ic: 'minus' },
  'em-preparacao': { label: 'Preparando', tone: 'info', ic: 'hourglass' },
  pronto: { label: 'Pronto', tone: 'ok', ic: 'check' },
  enviado: { label: 'Enviado', tone: 'accent', ic: 'send' },
  correcao: { label: 'Precisa de atenção', tone: 'warn', ic: 'alert' },
  'nao-se-aplica': { label: 'Não necessário', tone: 'faint', ic: 'minus' },
};
export const STATUS_ORDER = ['pendente', 'em-preparacao', 'pronto', 'enviado', 'correcao', 'nao-se-aplica'];

/** Indicador de status: { status, aguardando, atencao } */
export function StatusPill(v) {
  const s = v.atencao && v.status !== 'correcao' ? { label: 'Precisa de atenção', tone: 'warn', ic: 'alert' } : STATUS[v.status] || STATUS.pendente;
  return h('span', { class: `dc-pill t-${s.tone}` }, icon(s.ic, { size: 12 }), s.label, v.aguardando ? h('small', {}, ' · aguardando') : null);
}

/** Estado detalhado (12 estados da carteira): { estado, estadoLabel, estadoTom, estadoIcone, aguardando }. */
export function EstadoPill(v) {
  if (!v.estadoLabel) return StatusPill(v);
  const tone = v.atencao && v.estadoTom !== 'warn' ? 'warn' : v.estadoTom || 'muted';
  return h('span', { class: `dc-pill t-${tone}` }, icon(v.estadoIcone || 'minus', { size: 12 }), v.estadoLabel);
}

// Classificação contextual, sempre na ordem: necessários → opcionais → contingência.
// Contingência = só se algo acontecer (o procedimento pedir, uma condição se confirmar). Nunca "obrigatório" quando depende.
export const EXIGENCIA = {
  requerido: { label: 'Necessário', tone: 'hot' },
  recomendado: { label: 'Opcional', tone: 'soft' },
  condicional: { label: 'Contingência', tone: '' },
  verificar: { label: 'Contingência · a confirmar', tone: '' },
  'nao-necessario': { label: 'Não se aplica', tone: 'soft' },
};
export const GRUPOS = [
  { id: 'necessarios', titulo: 'Documentos necessários', dica: 'exigidos para o seu caso', exigencias: ['requerido'] },
  { id: 'opcionais', titulo: 'Documentos opcionais', dica: 'não são exigência, mas ajudam', exigencias: ['recomendado'] },
  { id: 'contingencia', titulo: 'Documentos de contingência', dica: 'só se o seu procedimento pedir ou a sua situação mudar', exigencias: ['condicional', 'verificar'] },
];
export function ExigenciaTag(v) {
  const e = EXIGENCIA[v.exigencia];
  return e ? h('span', { class: `dc-tag${e.tone ? ` is-${e.tone}` : ''}` }, e.label) : null;
}

/** Evidências separadas: declarado ≠ anexado ≠ conferido ≠ aceito. */
export function Evidence(v, { full = false } = {}) {
  const e = v.evidencias;
  const items = [
    e.declarado ? ['user', 'Declarado por você'] : null,
    e.porMissao ? ['flag', `Concluído na Missão ${e.porMissao}`] : null,
    e.atendidoPor ? ['link', `Atendido pelo documento: ${e.atendidoPor.nome}`] : null,
    e.anexos ? ['file', `${e.anexos} arquivo${e.anexos > 1 ? 's' : ''} na conta`] : null,
    e.conferidoEm ? ['check', 'Conferido por você'] : null,
    ...e.aceito.map((p) => ['shield', `Aceito: ${p} (registrado por você)`]),
  ].filter(Boolean);
  if (!items.length) return null;
  return h('ul', { class: `dc-evidence${full ? ' is-full' : ''}`, 'aria-label': 'Situação do documento' },
    items.map(([ic, label]) => h('li', { title: label }, icon(ic, { size: 12 }), full ? label : h('span', { class: 'sr-only' }, label))));
}

export const fmtDate = (iso) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
export const fmtSize = (b) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

// Ação principal de um card conforme a situação.
export function cardAction(v) {
  if (v.atencao) return 'Resolver';
  if (v.status === 'nao-se-aplica') return 'Por que não preciso?';
  if (v.pronto) return 'Ver detalhes';
  if (v.aguardando) return 'Acompanhar';
  if (v.status === 'em-preparacao') return 'Continuar';
  return v.acao || 'Preparar documento';
}
