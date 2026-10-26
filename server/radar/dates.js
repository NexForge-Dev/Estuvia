// Normalização de datas oficiais em espanhol ("Del 19 al 24 de febrero", "Hasta el 13 de febrero",
// "Desde el día 13 a lo largo del día al 29 de enero de 2026") para ISO (AAAA-MM-DD).
//
// Regras determinísticas:
//   - o ano vem do curso acadêmico do documento (curso 2026/2027 → todas as fases ocorrem em 2026);
//   - um ano explícito diferente do ano do curso torna a extração INCERTA (vai para revisão);
//   - um dia sem mês herda o mês do próximo token ("Del 19 al 24 de febrero");
//   - qualquer token sem mês após a propagação torna a extração INCERTA.
// Nunca completamos uma data a partir do calendário de outro ano.

export const TIMEZONE = 'Europe/Madrid';

const MONTHS = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

const TOKEN = /(\d{1,2})(?:\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre))?(?:\s+(?:de|del)\s+(\d{4}))?/gi;

const pad = (n) => String(n).padStart(2, '0');

/** "2026/2027" ou "2026/27" → { inicio: 2026, fim: 2027, rotulo: '2026/2027' } */
export function parseAcademicYear(text) {
  const m = /(20\d{2})\s*[/-]\s*(20\d{2}|\d{2})/.exec(String(text || ''));
  if (!m) return null;
  const inicio = Number(m[1]);
  const fim = m[2].length === 2 ? Number(String(inicio).slice(0, 2) + m[2]) : Number(m[2]);
  if (fim !== inicio + 1) return null;
  return { inicio, fim, rotulo: `${inicio}/${fim}` };
}

export const nextAcademicYear = (rotulo) => {
  const y = parseAcademicYear(rotulo);
  return y ? `${y.fim}/${y.fim + 1}` : null;
};

function validDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Converte uma expressão de data do calendário oficial.
 * @returns {{ inicio: string|null, fim: string|null, incerto: boolean, motivo?: string }}
 */
export function parseSpanishDateExpr(text, academicYear) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  const year = parseAcademicYear(academicYear)?.inicio;
  if (!year) return { inicio: null, fim: null, incerto: true, motivo: 'Curso acadêmico do documento não identificado.' };

  // Remove a expressão "a lo largo del día" e números que não são dias (ex.: horas "14:00").
  const clean = raw.replace(/a lo largo del d[ií]a/gi, ' ').replace(/\d{1,2}:\d{2}/g, ' ');
  const tokens = [...clean.matchAll(TOKEN)].map((m) => ({
    dia: Number(m[1]),
    mes: m[2] ? MONTHS[m[2].toLowerCase()] : null,
    ano: m[3] ? Number(m[3]) : null,
  }));
  if (!tokens.length) return { inicio: null, fim: null, incerto: true, motivo: `Nenhuma data reconhecida em "${raw}".` };
  if (tokens.length > 2) return { inicio: null, fim: null, incerto: true, motivo: `Mais de duas datas em "${raw}".` };

  for (let i = tokens.length - 2; i >= 0; i--) {
    if (!tokens[i].mes) tokens[i].mes = tokens[i + 1].mes;
    if (!tokens[i].ano) tokens[i].ano = tokens[i + 1].ano;
  }
  for (const t of tokens) {
    if (!t.mes) return { inicio: null, fim: null, incerto: true, motivo: `Mês ausente em "${raw}".` };
    if (t.ano && t.ano !== year) {
      return { inicio: null, fim: null, incerto: true, motivo: `O texto cita o ano ${t.ano}, mas o documento é do curso ${academicYear}.` };
    }
    t.ano = year;
    if (!validDate(t.ano, t.mes, t.dia)) return { inicio: null, fim: null, incerto: true, motivo: `Data inexistente em "${raw}".` };
  }
  const iso = (t) => `${t.ano}-${pad(t.mes)}-${pad(t.dia)}`;
  const isUntil = /^hasta\b/i.test(raw);

  if (tokens.length === 1) {
    return isUntil ? { inicio: null, fim: iso(tokens[0]), incerto: false } : { inicio: iso(tokens[0]), fim: iso(tokens[0]), incerto: false };
  }
  const [a, b] = tokens.map(iso);
  if (a > b) return { inicio: null, fim: null, incerto: true, motivo: `Intervalo invertido em "${raw}".` };
  return { inicio: a, fim: b, incerto: false };
}

// ---------- Fuso horário oficial ----------
// Uma janela "de 13 a 29 de janeiro" vale de 00:00 do dia 13 até 23:59:59 do dia 29 no horário de Madri.

function madridOffsetMinutes(date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, timeZoneName: 'longOffset' }).formatToParts(date);
  const tz = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT';
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(tz);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
}

/** Instante UTC (ms) correspondente a uma hora local de Madri num dia ISO. */
export function madridInstant(isoDate, time = '00:00:00') {
  const guess = new Date(`${isoDate}T${time}Z`);
  return guess.getTime() - madridOffsetMinutes(guess) * 60000;
}

export const startOfDayMadrid = (iso) => madridInstant(iso, '00:00:00');
export const endOfDayMadrid = (iso) => madridInstant(iso, '23:59:59');

/** Data de hoje (AAAA-MM-DD) no horário de Madri. */
export function todayMadrid(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export const daysBetween = (fromIso, toIso) => Math.round((Date.parse(`${toIso}T12:00:00Z`) - Date.parse(`${fromIso}T12:00:00Z`)) / 86400000);
