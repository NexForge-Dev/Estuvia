// Validações compartilhadas pelas rotas.
import { z } from 'zod';

// AAAA-MM-DD que existe no calendário. Só o formato não basta: "2026-13-45" passava pela regex,
// era gravado e depois derrubava as telas que fazem conta com a data (RangeError em toISOString).
export function isCalendarDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export const isoDate = (message = 'Data inválida.') => z.string().refine(isCalendarDate, message);
