// Igualdade de dados JSON que não depende da ordem das chaves.
// O Postgres (jsonb) devolve as chaves dos objetos numa ordem própria. Comparar com JSON.stringify faz
// dois valores iguais parecerem diferentes depois de uma ida e volta ao Supabase (ex.: ficha do DUA
// "alterada" sem nenhuma mudança). Arrays continuam comparados em ordem: ali a ordem é informação.

export function stableStringify(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : stableStringify(v))).join(',')}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

export const sameJson = (a, b) => stableStringify(a ?? null) === stableStringify(b ?? null);
