// Dicas personalizadas a partir do perfil e das jornadas. Cada dica tem etiqueta de confiabilidade.

import { programById } from './content/catalog.js';

const LEVELS = ['nenhum', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'nativo'];

export function personalTips(user) {
  const p = user.profile || {};
  const tips = [];

  if (!p.onboardingConcluido || !(user.journeys || []).length) {
    tips.push({ icone: 'user', texto: 'Crie sua primeira jornada para receber um caminho feito para você.', tag: 'pratica' });
    return tips;
  }
  for (const jr of user.journeys) {
    const program = programById(jr.programaId);
    const req = program?.idioma;
    const sigla = program ? program.nome.split(' - ')[0] : 'seu mestrado';
    if (req?.status === 'requerido' && req.nivel && LEVELS.indexOf(p.espanhol) < LEVELS.indexOf(req.nivel)) {
      tips.push({ icone: 'lang', texto: p.espanhol === 'nao-sei' ? `${sigla} pede espanhol ${req.nivel}. Descubra seu nível com um teste de nivelamento para planejar preparo e prova.` : `${sigla} pede espanhol ${req.nivel} e você declarou ${p.espanhol || 'nenhum'}. Planeje preparo e prova com antecedência.`, tag: req.fonte === 'DEMO' ? 'pendente' : 'verificado' });
    }
    if (req?.status === 'verificar') {
      tips.push({ icone: 'lang', texto: `A exigência de idioma de ${sigla} ainda não está confirmada. Escreva para a coordenação.`, tag: 'pendente' });
    }
  }
  const anos = [...new Set(user.journeys.map((j) => j.anoAcademico).filter(Boolean))];
  if (anos.length) {
    tips.push({ icone: 'calendar', texto: `As datas do DUA mudam a cada ciclo. Use somente a convocatória oficial de ${anos.join(' / ')}.`, tag: 'verificado' });
  }
  if (p.paisResidencia && p.paisResidencia !== 'Brasil') {
    tips.push({ icone: 'passport', texto: 'Você não reside no Brasil: as missões de visto precisam ser conferidas com o consulado do seu país de residência.', tag: 'pendente' });
  } else if (p.estado) {
    tips.push({ icone: 'passport', texto: `Você mora em ${p.estado}: o visto é pedido no consulado espanhol que atende esse estado.`, tag: 'pendente' });
  }
  tips.push({ icone: 'clock', texto: 'Antecedentes, apostilas e traduções levam semanas. As missões da Rodada 5 sem dependências podem começar já.', tag: 'pratica' });
  return tips;
}
