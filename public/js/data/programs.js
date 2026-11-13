// Funções puras da tela Mestrados (views/catalog.js): filtros e textos. Sem DOM, para poder testar no Node.

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function spanishText(es) {
  if (es === null) return 'Ficha do DUA ainda não conferida';
  if (!es.exige) return 'Não exige espanhol';
  return es.nivel ? `Espanhol ${es.nivel}` : 'Exige espanhol (nível não informado)';
}

export function degreeText(g) {
  if (!g) return null;
  if (g.tipo === 'lista') return { tom: 'ok', texto: `Aceita a sua graduação (preferência ${g.preferencia})` };
  if (g.tipo === 'condicionada') return { tom: 'warn', texto: 'Aceita a sua graduação com condições' };
  if (g.tipo === 'resto') return { tom: 'warn', texto: 'Graduação com acesso, mas fora da lista de preferência' };
  if (g.tipo === 'fora') return { tom: 'bad', texto: 'Sua graduação não aparece na ficha' };
  return null;
}

/** Filtra a lista do catálogo. Exportada para testes. */
export function filterPrograms(programas, f, universidades = []) {
  const uni = new Map(universidades.map((u) => [u.id, u]));
  const ordem = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const termos = norm(f.q).split(/\s+/).filter(Boolean);
  return programas.filter((p) => {
    const u = uni.get(p.universidadeId) || {};
    if (termos.length && !termos.every((t) => norm(`${p.nome} ${u.sigla} ${u.nome} ${u.cidade} ${p.codigoDua || ''} ${(p.ramos || []).join(' ')}`).includes(t))) return false;
    if (f.universidade && p.universidadeId !== f.universidade) return false;
    if (f.cidade && u.cidade !== f.cidade) return false;
    if (f.area && !(p.ramos || []).includes(f.area)) return false;
    if (f.modalidade && p.modalidade !== f.modalidade) return false;
    if (f.espanhol) {
      if (!p.espanhol) return false; // sem ficha conferida: não presumimos nada
      if (f.espanhol === 'nao-exige') { if (p.espanhol.exige) return false; }
      else if (p.espanhol.exige && (!p.espanhol.nivel || ordem.indexOf(p.espanhol.nivel) > ordem.indexOf(f.espanhol))) return false;
    }
    if (f.graduacao === 'aceita' && !['lista', 'condicionada', 'resto'].includes(p.graduacao?.tipo)) return false;
    if (f.graduacao === 'preferencia' && p.graduacao?.tipo !== 'lista') return false;
    if (f.ficha && !p.espanhol) return false;
    return true;
  });
}

// O catálogo do DUA traz os nomes em MAIÚSCULAS ("BIOTECNOLOGÍA Y BIOMEDICINA"); a UGR, em caixa normal.
// Para exibir, nomes todo em maiúsculas viram "Biotecnología y Biomedicina". Siglas curtas (TIC, I+D) ficam como estão.
const MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'o', 'u', 'en', 'a', 'al', 'para', 'por', 'con', 'sin', 'sobre', 'entre']);
// Siglas que aparecem nos nomes do DUA ficam em maiúsculas; números romanos também.
const SIGLAS = new Set(['TIC', 'TICS', 'MBA', 'BIM', 'SIG', 'TIG', 'UE', 'ONU', 'ODS', 'I+D', 'I+D+I', 'ELE', 'STEM', 'COVID', 'SAP', 'IA', 'XXI', 'XX']);
const ROMANO = /^(?:II|III|IV|VI|VII|VIII|IX)$/;
export function displayName(nome) {
  const s = String(nome || '').trim();
  if (!s || /\p{Ll}/u.test(s)) return s;
  const partes = s.split(/(\s+|[/()–-])/);
  let inicio = true; // primeira palavra do nome ou logo depois de "(": maiúscula
  return partes.map((w) => {
    if (!w.trim()) return w;
    if (/^[/()–-]$/.test(w)) { if (w === '(') inicio = true; return w; }
    const limpo = w.replace(/[.,;:]+$/, '');
    let out;
    if (SIGLAS.has(limpo) || ROMANO.test(limpo)) out = w;
    else {
      const low = w.toLocaleLowerCase('es');
      out = !inicio && MINUSCULAS.has(low.replace(/[.,;:]+$/, '')) ? low : low.charAt(0).toLocaleUpperCase('es') + low.slice(1);
    }
    inicio = false;
    return out;
  }).join('');
}
