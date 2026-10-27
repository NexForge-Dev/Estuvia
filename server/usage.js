// Uso da plataforma por módulo (painel admin): acessos, pessoas diferentes e tempo na tela.
// O caminho enviado pelo navegador é sempre convertido para um módulo conhecido — nada além
// desta lista entra na base (evita lixo e dados pessoais em URLs).
import { analytics } from './store.js';

export const MODULES = [
  { id: 'inicio', label: 'Início', re: /^\/$/ },
  { id: 'jornadas', label: 'Minhas jornadas', re: /^\/jornadas$/ },
  { id: 'nova-jornada', label: 'Criar jornada', re: /^\/jornadas\/nova$/ },
  { id: 'rodadas', label: 'Rodadas da jornada', re: /^\/j\/[\w-]+$/ },
  { id: 'trilha', label: 'Trilha de missões', re: /^\/j\/[\w-]+\/r\/\d$/ },
  { id: 'missao', label: 'Conteúdo da missão', re: /^\/j\/[\w-]+\/m\/[\d.]+$/ },
  { id: 'agenda', label: 'Agenda', re: /^\/agenda$/ },
  { id: 'documentos', label: 'Documentos', re: /^\/documentos(\/[\w-]+)?$/ },
  { id: 'financiamento', label: 'Financiamento', re: /^\/financiamento$/ },
  { id: 'novo-lar', label: 'Meu novo lar', re: /^\/novo-lar$/ },
  { id: 'viagem', label: 'Viagem', re: /^\/viagem$/ },
  { id: 'mestrados', label: 'Mestrados', re: /^\/mestrados$/ },
  { id: 'oportunidades', label: 'Oportunidades', re: /^\/oportunidades(\/[\w-]+)?$/ },
  { id: 'comunidade', label: 'Comunidade', re: /^\/comunidade(\/.*)?$/ },
  { id: 'conquistas', label: 'Conquistas', re: /^\/conquistas$/ },
  { id: 'mentor', label: 'Mentor IA', re: /^\/(assistente|mentor)(\/memoria)?$/ },
  { id: 'manual', label: 'Manual', re: /^\/manual$/ },
  { id: 'fontes', label: 'Fontes oficiais', re: /^\/fontes$/ },
  { id: 'perfil', label: 'Perfil', re: /^\/perfil$/ },
];
const LABEL = Object.fromEntries(MODULES.map((m) => [m.id, m.label]));
export const moduleOf = (path) => MODULES.find((m) => m.re.test(String(path || '').slice(0, 200)))?.id || null;
export const moduleLabel = (id) => LABEL[id] || id;

const KEEP_DAYS = 120;
const MAX_MS = 30 * 60 * 1000; // aba esquecida aberta não infla o tempo médio
const today = () => new Date().toISOString().slice(0, 10);

const bucket = (a, day, mod) => {
  a.days[day] ||= {};
  return (a.days[day][mod] ||= { v: 0, u: [], t: 0, n: 0 });
};

// Um acesso a `path`; `prev` = tempo gasto na tela anterior (medido no navegador).
export function recordView(user, path, prev) {
  const mod = moduleOf(path);
  const day = today();
  analytics.mutate((a) => {
    if (mod) {
      const b = bucket(a, day, mod);
      b.v += 1;
      if (!b.u.includes(user.id)) b.u.push(user.id);
      user.usage ||= {};
      user.usage[mod] = { ...(user.usage[mod] || { v: 0, t: 0 }), v: (user.usage[mod]?.v || 0) + 1 };
      user.currentModule = mod;
    }
    const prevMod = prev && moduleOf(prev.path);
    const ms = Math.min(MAX_MS, Math.round(Number(prev?.ms) || 0));
    if (prevMod && ms >= 500) {
      const b = bucket(a, day, prevMod);
      b.t += ms;
      b.n += 1;
      if (user.usage?.[prevMod]) user.usage[prevMod].t += ms;
    }
    const keys = Object.keys(a.days).sort();
    keys.slice(0, Math.max(0, keys.length - KEEP_DAYS)).forEach((k) => delete a.days[k]);
  });
  return mod;
}

// Ranking dos módulos no período (em dias, contando hoje).
export function usageReport(periodDays = 30) {
  const since = new Date(Date.now() - (periodDays - 1) * 864e5).toISOString().slice(0, 10);
  return analytics.read((a) => {
    const acc = {};
    for (const [day, mods] of Object.entries(a.days)) {
      if (day < since) continue;
      for (const [mod, b] of Object.entries(mods)) {
        const m = (acc[mod] ||= { v: 0, u: new Set(), t: 0, n: 0 });
        m.v += b.v; m.t += b.t; m.n += b.n;
        b.u.forEach((id) => m.u.add(id));
      }
    }
    const total = Object.values(acc).reduce((s, m) => s + m.v, 0);
    const modulos = Object.entries(acc)
      .map(([id, m]) => ({ id, nome: moduleLabel(id), acessos: m.v, pessoas: m.u.size, tempoMedioSeg: m.n ? Math.round(m.t / m.n / 1000) : null, parcela: total ? m.v / total : 0 }))
      .sort((x, y) => y.acessos - x.acessos);
    return { periodoDias: periodDays, totalAcessos: total, modulos, semUso: MODULES.filter((m) => !acc[m.id]).map((m) => m.label) };
  });
}

// Módulos mais usados por uma pessoa (detalhe do usuário no painel).
export const userUsage = (user) => Object.entries(user.usage || {})
  .map(([id, x]) => ({ id, nome: moduleLabel(id), acessos: x.v, tempoTotalSeg: Math.round((x.t || 0) / 1000) }))
  .sort((a, b) => b.acessos - a.acessos);
