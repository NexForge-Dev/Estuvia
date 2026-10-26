// Base de conhecimento usada pelo assistente (IA e modo offline) e pelo Manual.
// Mantida pequena e curada: o assistente só pode afirmar o que está aqui ou nas fontes.

import { ROUNDS } from './rounds.js';
import { SOURCES } from './sources.js';

export const FAQ = [
  {
    q: 'Preciso homologar meu diploma brasileiro para fazer mestrado na Espanha?',
    a: 'Para solicitar acesso a um mestrado oficial, não é necessária homologação prévia de título de fora do Espaço Europeu de Educação Superior: a universidade verifica a equivalência de nível e se o título dá acesso à pós-graduação no país de origem. Isso não reconhece o diploma para outras finalidades.',
    tag: 'verificado',
    fontes: ['O1', 'O3'],
    keywords: ['homologar', 'homologação', 'homologacao', 'diploma', 'reconhecer', 'validar', 'equivalência'],
  },
  {
    q: 'Quantos mestrados posso colocar na solicitação do DUA?',
    a: 'No ciclo 2026/27, uma solicitação pode ter até seis programas ordenados por preferência. Confirme sempre a regra do ciclo em que você vai se candidatar.',
    tag: 'verificado',
    fontes: ['O2', 'O3'],
    keywords: ['quantos', 'opções', 'opcoes', 'seis', '6', 'preferência', 'preferencias', 'ordem'],
  },
  {
    q: 'Preciso de certificado de espanhol (DELE/SIELE)?',
    a: 'Depende do programa. Idioma é requisito de cada mestrado: alguns exigem nível ou certificado, outros aceitam outras formas de comprovação. Consulte a ficha oficial do programa e, se não estiver claro, escreva para a coordenação. Não generalize por universidade.',
    tag: 'pendente',
    fontes: ['O3'],
    keywords: ['espanhol', 'dele', 'siele', 'idioma', 'língua', 'lingua', 'certificado', 'b1', 'b2', 'c1'],
  },
  {
    q: 'Quais documentos acadêmicos preciso?',
    a: 'Base: passaporte, diploma e histórico. Conforme a situação, o DUA 2026/27 também prevê comprovação da escala de notas (mínima e máxima) e documento de órgão competente demonstrando que o título permite cursar pós-graduação no país emissor. Outros anexos dependem do mestrado.',
    tag: 'verificado',
    fontes: ['O1', 'M'],
    keywords: ['documento', 'documentos', 'histórico', 'historico', 'diploma', 'escala', 'notas', 'anexos', 'passaporte'],
  },
  {
    q: 'O que é a fase 1 do DUA?',
    a: 'No ciclo 2026/27 o DUA estabeleceu uma fase 1 voltada a pessoas estrangeiras com título universitário estrangeiro, seguida das fases ordinária e extraordinária. As datas mudam a cada ciclo: não reutilize datas de um ano em outro.',
    tag: 'verificado',
    fontes: ['O1', 'O3'],
    keywords: ['fase', 'fase 1', 'prazo', 'prazos', 'data', 'datas', 'calendário', 'calendario', 'quando'],
  },
  {
    q: 'Quais documentos o visto de estudos costuma pedir?',
    a: 'As referências oficiais incluem: admissão/matrícula, comprovação de meios econômicos, seguro saúde, documentos pessoais e, quando aplicável, antecedentes criminais e atestado médico. Cada consulado publica sua lista — use a do seu consulado. Apostila e tradução apenas quando exigidas.',
    tag: 'verificado',
    fontes: ['O6', 'O7'],
    keywords: ['visto', 'consulado', 'seguro', 'antecedentes', 'atestado', 'apostila', 'tradução', 'traducao', 'meios', 'financeiro'],
  },
  {
    q: 'Quanto dinheiro preciso comprovar para o visto?',
    a: 'O valor mínimo é definido pela norma vigente e conferido pelo consulado — consulte a fonte oficial atualizada. O planejador da plataforma separa a exigência oficial do seu custo de vida estimado, mas nenhum valor "garante" o visto.',
    tag: 'pendente',
    fontes: ['O6', 'O7'],
    keywords: ['dinheiro', 'quanto', 'valor', 'comprovar', 'renda', 'extrato', 'iprem', 'recursos', 'custo'],
  },
  {
    q: 'O que é a TIE e quando devo pedir?',
    a: 'A TIE é o cartão de identidade de estrangeiro. Para autorização de estada por estudos superior a seis meses, a orientação oficial prevê solicitá-la em até um mês após a entrada na Espanha. Agende logo ao chegar.',
    tag: 'verificado',
    fontes: ['O6'],
    keywords: ['tie', 'nie', 'cartão', 'cartao', 'residência', 'residencia', 'chegada', 'polícia', 'policia', 'huella'],
  },
  {
    q: 'Posso comprar a passagem antes do visto sair?',
    a: 'Pode, mas é um risco financeiro. Considere a situação real do seu visto ou tarifas com remarcação gratuita.',
    tag: 'pratica',
    fontes: ['M'],
    keywords: ['passagem', 'voo', 'avião', 'aviao', 'comprar', 'viagem'],
  },
  {
    q: 'Como evitar golpes de moradia?',
    a: 'Desconfie de preço muito abaixo do mercado, nunca pague caução sem contrato e sem verificar o anunciante, peça vídeo-chamada mostrando o imóvel e prefira canais conhecidos.',
    tag: 'pratica',
    fontes: ['M'],
    keywords: ['moradia', 'aluguel', 'apartamento', 'quarto', 'golpe', 'fraude', 'caução', 'caucao', 'piso'],
  },
  {
    q: 'A plataforma envia minha candidatura?',
    a: 'Não. A plataforma orienta, organiza e lembra. Candidatura, matrícula e pedidos oficiais são feitos nos sistemas competentes (DUA, universidade, consulado).',
    tag: 'pratica',
    fontes: ['M'],
    keywords: ['envia', 'enviar', 'automático', 'automatico', 'plataforma', 'garante', 'garantia'],
  },
];

// Texto compacto para o system prompt do assistente: estável (bom para cache).
export function knowledgeAsText() {
  const src = SOURCES.map((s) => `[${s.id}] ${s.orgao} — ${s.titulo}${s.url ? ` — ${s.url}` : ''} (revisado em ${s.revisadoEm})`).join('\n');
  const phases = ROUNDS.map(
    (r) =>
      `RODADA ${r.numero} — ${r.titulo}: ${r.resumo}\n` +
      r.missoes.map((m) => `  - Missão ${m.id} ${m.titulo} [${m.tag}; fontes ${m.fontes.join(',')}]: ${m.objetivo} ${m.porque} ${(m.comoExecutar || []).map((c) => c.texto).join(' ')}`).join('\n'),
  ).join('\n\n');
  const faq = FAQ.map((f) => `P: ${f.q}\nR: ${f.a} [${f.tag}; fontes ${f.fontes.join(',')}]`).join('\n\n');
  return `FONTES\n${src}\n\nJORNADA\n${phases}\n\nPERGUNTAS FREQUENTES\n${faq}`;
}
