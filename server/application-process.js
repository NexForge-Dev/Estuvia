// Processo de candidatura de UM mestrado: procedimento oficial (content/application-procedures.js)
// + o que só vale para aquele máster (catálogo e ficha do DUA, regras oficiais por máster)
// + o calendário oficial do ciclo (Radar) + o perfil do estudante.
//
// Função pura. Cada item informa de onde vem:
//   oficial       regra dos acordos publicados no BOJA (fonte + artigo + data de conferência)
//   ficha         dado da ficha do máster no DUA (data da última coleta)
//   derivado      deduzido do texto oficial de um critério da ficha (o formato deve ser conferido no portal)
//   nao-confirmado a plataforma não tem fonte oficial para afirmar: o estudante precisa confirmar
// Nada é inventado para preencher lacunas: sem fonte, o item vai para "pendencias".

import { DUA_MASTERES, PROGRAM_SPECIFIC, PROCEDURE_REVIEWED } from './content/application-procedures.js';
import { sourceById } from './content/sources.js';
import { programChannel } from './content/program-channels.js';

// "2026/27", "2026-27" ou "2026/2027" → "2026/2027".
const normCiclo = (c) => { const m = /^(20\d\d)\s*[/-]\s*(?:20)?(\d\d)$/.exec(String(c || '').trim()); return m ? `${m[1]}/20${m[2]}` : null; };

const upper = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const fmt = (iso) => (iso ? iso.split('-').reverse().join('/') : null);

const fonte = (id) => {
  const s = sourceById(id);
  return s ? { id: s.id, titulo: s.titulo, orgao: s.orgao, url: s.url, revisadoEm: s.revisadoEm } : { id };
};

// Documentos que um critério de seleção da ficha costuma pedir. Só a partir do texto oficial do critério.
const DERIVED = [
  [/CURRICUL/, 'cv', 'Currículo (CV) para a avaliação do critério'],
  [/MOTIVACI/, 'motivacao', 'Carta de motivação / exposição de motivos'],
  [/RECOMENDACI|CARTAS? DE AVAL|AVALES/, 'recomendacao', 'Cartas de recomendação'],
  [/ENTREVISTA/, 'entrevista', 'Entrevista como etapa da seleção (data e forma definidas pela comissão do máster)'],
  [/PORTFOLIO|PORTAFOLIO/, 'portfolio', 'Portfólio'],
  [/PRUEBA|EXAMEN/, 'prova', 'Prova específica de seleção'],
  [/EXPERIENCIA (PROFESIONAL|LABORAL)/, 'experiencia', 'Comprovantes de experiência profissional'],
  [/IDIOMA|LENGUA/, 'idioma', 'Comprovante de nível de idioma (pontua na seleção)'],
  [/INVESTIGA|PUBLICACI/, 'pesquisa', 'Comprovantes de pesquisa / publicações'],
];

/** Nacionalidade espanhola não concorre na Fase 1. Sem nacionalidade informada, não presumimos. */
function foreignNationality(profile) {
  const n = upper(profile?.nacionalidade);
  if (!n) return null;
  return !/ESPANH|ESPANA|ESPANOL/.test(n);
}

/**
 * @param program  programa no formato de catalog.programById (programas do Radar trazem os campos do DUA)
 * @param opts.calendario { windows, events } do procedimento no ciclo (só itens confirmados)
 * @param opts.profile    perfil do estudante
 * @param opts.requisitos respostas "o que eu já tenho" (diploma: tenho|aguardando|nao|verificar)
 * @param opts.faseDeclarada fase escolhida pelo estudante na Missão 3.2 (1, 2 ou 3)
 */
export function applicationProcess(program, { calendario = { windows: [], events: [] }, profile = {}, requisitos = {}, faseDeclarada = null, cicloJornada = null } = {}) {
  if (!program) return null;
  const proc = DUA_MASTERES;
  const pendencias = [];
  const alertas = {};
  const canalInfo = programChannel(program);

  // Ciclo: as regras cadastradas são as do curso dos acordos publicados. Outro ciclo = referência, não regra.
  const ciclo2 = normCiclo(cicloJornada);
  if (ciclo2 && ciclo2 !== proc.ciclo) {
    const t = `Você planeja o curso ${ciclo2}, mas os acordos do DUA publicados até agora são do curso ${proc.ciclo}. As regras abaixo são a referência mais recente: confira os acordos de ${ciclo2} no BOJA assim que forem publicados (normalmente a Fase 1 sai em dezembro do ano anterior).`;
    pendencias.push({ id: 'ciclo', texto: t });
    alertas.ciclo = t;
  }

  // ---------- Canal de candidatura ----------
  let canal;
  if (program.demo) {
    canal = { status: 'demo', texto: 'Programa demonstrativo: não existe processo real de candidatura.' };
  } else if (canalInfo?.tipo === 'nao-dua') {
    canal = { status: canalInfo.url ? 'nao-dua' : 'nao-dua-sem-canal', texto: canalInfo.texto, url: canalInfo.url || null, evidencia: canalInfo.evidencia };
    if (!canalInfo.url) { pendencias.push({ id: 'canal', texto: canalInfo.texto }); alertas.canal = canalInfo.texto; }
    else alertas.canal = `Este máster NÃO usa o Distrito Único Andaluz: ${canalInfo.texto} As missões do DUA (Rodada 3) não valem para ele; siga o procedimento do canal oficial.`;
  } else if (canalInfo?.tipo === 'dua-variantes') {
    canal = { status: 'confirmado', texto: `Candidatura pelo Distrito Único Andaluz. No DUA este máster tem ${canalInfo.variantes.length} códigos (modalidade, sede ou especialidade): escolha o da opção que você quer, cada um com ficha própria.`, url: fonte('O5').url, variantes: canalInfo.variantes, evidencia: canalInfo.evidencia };
    pendencias.push({ id: 'variante', texto: 'Este máster tem vários códigos no DUA. Os requisitos e critérios são os da ficha do código que você escolher: leia a ficha dessa variante.' });
  } else if (canalInfo?.tipo === 'nao-ofertado') {
    canal = { status: 'nao-confirmado', texto: canalInfo.texto, url: program.url || null, evidencia: canalInfo.evidencia };
    pendencias.push({ id: 'canal', texto: canalInfo.texto });
    alertas.canal = canalInfo.texto;
  } else if (program.duaCodigo) {
    canal = { status: 'confirmado', texto: `Candidatura pelo Distrito Único Andaluz (código DUA ${program.duaCodigo}).`, url: fonte('O5').url, codigoDua: program.duaCodigo, origem: 'ficha' };
  } else {
    canal = { status: 'nao-confirmado', texto: 'Ainda não vinculamos este máster a um código do catálogo de másteres do DUA, então não confirmamos o canal nem a ficha dele. Procure-o no portal do DUA; se não estiver lá, confirme com a universidade por qual canal a candidatura é feita (programas conjuntos internacionais, como os Erasmus Mundus, podem ter seleção própria).', url: program.url || null };
    pendencias.push({ id: 'canal', texto: canal.texto });
    alertas.canal = 'Canal de candidatura deste máster não confirmado: procure-o no portal do DUA ou confirme com a universidade antes de se candidatar.';
  }

  // ---------- Fases ----------
  // Oferta por fase, segundo os acordos: a Fase 1 depende de cada universidade reservar vagas no máster, e
  // NENHUMA fonte pública informa isso por máster (o catálogo do DUA devolve a mesma lista em qualquer fase,
  // conferido em 13/11/2026). A Fase 2 é a fase ordinária; a Fase 3 só tem as vagas que sobrarem.
  const ciclo = proc.ciclo;
  const estrangeiro = foreignNationality(profile);
  const semTitulo = requisitos.diploma === 'nao';
  const OFERTA = {
    demo: 'Programa demonstrativo.',
    'nao-dua': 'Este máster não participa das fases do DUA: tem procedimento próprio.',
    'canal-nao-confirmado': 'O canal de candidatura deste máster não está confirmado no DUA.',
    'nao-confirmado': 'Cada universidade decide em quais másteres reserva vagas para a Fase 1, e nenhuma fonte pública lista isso por máster (o catálogo do DUA devolve a mesma lista em qualquer fase). Confirme no portal do DUA ao montar a solicitação da Fase 1, ou com a universidade.',
    geral: 'Fase ordinária do procedimento, aberta a estudantes espanhóis e estrangeiros (O2 art. 3).',
    'se-sobrar': 'Só há vagas se sobrarem depois da Fase 2 (O2 art. 3).',
  };
  const fases = proc.fases.map((f) => {
    const janela = (calendario.windows || []).find((w) => Number(w.fase) === f.fase) || null;
    const limiteTitulo = (calendario.events || []).find((e) => Number(e.fase) === f.fase && e.tipo === 'pagamento-titulo') || null;
    const oferta = program.demo ? 'demo' : canal.status.startsWith('nao-dua') ? 'nao-dua' : canal.status !== 'confirmado' ? 'canal-nao-confirmado' : f.fase === 1 ? 'nao-confirmado' : f.fase === 2 ? 'geral' : 'se-sobrar';
    // Aplicabilidade ao perfil: só afirmamos "não" com base em regra oficial e dado declarado.
    let perfil = { status: 'sim', texto: 'Pelo seu perfil, você pode concorrer nesta fase.' };
    if (f.fase === 1 && estrangeiro === false) perfil = { status: 'nao', texto: 'A Fase 1 é exclusiva para nacionalidade estrangeira (O1 art. 2).' };
    else if (f.fase === 1 && estrangeiro === null) perfil = { status: 'verificar', texto: 'Informe sua nacionalidade no perfil: a Fase 1 é exclusiva para estrangeiros com título não homologado.' };
    // Requisitos 4 e 5 do art. 2 (O2) valem só para graduação em universidade espanhola ou PARS andaluz.
    // Com título estrangeiro, em QUALQUER fase o título precisa estar concluído até a data-limite da fase.
    if (semTitulo && perfil.status !== 'nao') perfil = { status: 'verificar', texto: `Você indicou que ainda não se formou. Com título estrangeiro, o título precisa estar concluído e os direitos de expedição pagos até a data-limite desta fase${limiteTitulo ? ` (${fmt(limiteTitulo.fim || limiteTitulo.inicio)})` : ''}. A exceção para quem ainda cursa a graduação (requisitos 4 e 5 do art. 2) vale só para graduação em universidade espanhola ou PARS andaluz (O2 arts. 2 e 3).` };
    return {
      fase: f.fase,
      publico: f.publico,
      quem: f.quem,
      oferta,
      ofertaTexto: OFERTA[oferta],
      perfil,
      janela: janela ? { abertura: janela.abertura, encerramento: janela.encerramento, texto: `${fmt(janela.abertura)} a ${fmt(janela.encerramento)}`, origem: 'oficial' } : null,
      dataLimiteTitulo: limiteTitulo ? { data: limiteTitulo.fim || limiteTitulo.inicio, rotulo: limiteTitulo.rotulo } : null,
      titulo: f.titulo,
      pagamento: f.pagamento,
      listaEsperaSeguinte: f.listaEsperaSeguinte || null,
      declarada: Number(faseDeclarada) === f.fase,
    };
  });
  if (!program.demo && canal.status === 'confirmado') pendencias.push({ id: 'fase1', texto: 'Se este máster oferta vagas na Fase 1 (estrangeiros): nenhuma fonte oficial pública lista isso por máster. Confirme no portal do DUA ou com a universidade antes de contar só com a Fase 1.' });
  if (!(calendario.windows || []).length) pendencias.push({ id: 'calendario', texto: `Calendário oficial do curso ${ciclo} ainda não publicado ou não coletado.` });

  const f1 = fases[0];
  const elegiveis = fases.filter((f) => f.perfil.status !== 'nao');
  if (faseDeclarada) {
    const fd = fases.find((f) => f.fase === Number(faseDeclarada));
    if (fd?.perfil.status === 'nao') alertas.fase = `Você escolheu a Fase ${fd.fase}: ${fd.perfil.texto}`;
    else if (fd?.fase === 1 && f1.oferta === 'nao-confirmado') alertas.fase = 'Você escolheu a Fase 1. Confirme no portal do DUA (ou com a universidade) que este máster tem vagas nela: nem todo máster participa da Fase 1.';
  }

  // ---------- Requisitos e documentos específicos do máster (ficha do DUA) ----------
  const fichaColetada = Array.isArray(program.requisitosFicha) || Array.isArray(program.criterios);
  const requisitosEspecificos = (program.requisitosFicha || []).map((x) => ({ codigo: x.codigo, texto: x.texto, obrigatorio: Boolean(x.obrigatorio), origem: 'ficha', fonte: 'O30' }));
  const documentosDerivados = [];
  for (const c of program.criteriosOriginais || program.criterios || []) {
    const t = upper(c.original || c.descricao);
    for (const [re, id, texto] of DERIVED) {
      if (re.test(t) && !documentosDerivados.some((d) => d.id === id)) documentosDerivados.push({ id, texto, criterio: c.original || c.descricao, peso: c.peso ?? null, origem: 'derivado' });
    }
  }
  if (!program.demo && !fichaColetada && !canal.status.startsWith('nao-dua')) {
    pendencias.push({ id: 'ficha', texto: 'A ficha do DUA deste máster (critérios de seleção, requisitos obrigatórios e graduações aceitas) ainda não foi coletada. Leia a ficha oficial antes de preparar os documentos específicos.' });
    alertas.ficha = 'Requisitos específicos deste máster ainda não confirmados pela ficha do DUA: leia a ficha oficial.';
  }

  // ---------- Regras oficiais que valem só para este máster ----------
  const nome = upper(program.nome);
  const especificas = canal.status.startsWith('nao-dua') ? [] : PROGRAM_SPECIFIC.filter((x) => x.match.test(nome)).map(({ match, ...x }) => x);
  const flags = Object.fromEntries(especificas.map((x) => [x.flag, true]));

  // ---------- Documentos ----------
  const documentos = proc.documentos.map((d) => ({ ...d, origem: 'oficial' }));
  if (flags.exigeResolucaoPGS) documentos.push({ docId: 'certificacao-pgs', texto: especificas.find((x) => x.flag === 'exigeResolucaoPGS').texto, fonte: 'O2', artigo: 'art. 9', obrigatorio: true, origem: 'oficial', revisadoEm: PROCEDURE_REVIEWED });

  for (const n of proc.naoInformado) pendencias.push({ ...n, geral: true });

  // A oferta na Fase 1 fica de fora: nenhuma fonte pública a informa por máster (vai para as pendências).
  const completo = (canal.status === 'confirmado' && fichaColetada) || canal.status === 'nao-dua';
  return {
    procedimento: { id: proc.id, titulo: proc.titulo, ciclo, revisadoEm: PROCEDURE_REVIEWED, fontes: proc.fontes.map(fonte), canal: fonte(proc.canal.fonte) },
    programa: { id: program.id, nome: program.nome, fichaUrl: program.fichaDuaUrl || null, url: program.url || null, fichaVerificadaEm: program.fichaVerificadaEm || null },
    canal,
    fases,
    faseDeclarada: faseDeclarada ? Number(faseDeclarada) : null,
    fasesPossiveis: elegiveis.map((f) => f.fase),
    maxPedidos: proc.maxPedidos,
    taxaSolicitacao: proc.taxaSolicitacao,
    documentos,
    idiomaDocumentos: proc.idiomaDocumentos,
    requisitosEspecificos,
    documentosDerivados,
    regrasEspecificas: especificas,
    regras: proc.regras,
    flags: { ...flags, canalDua: canal.status === 'confirmado', naoDua: canal.status.startsWith('nao-dua'), fichaColetada },
    pendencias,
    alertas,
    // Classificação de auditoria: "confirmado" = canal no catálogo do DUA + ficha do DUA coletada.
    verificacao: program.demo ? 'demo' : completo ? 'confirmado' : 'parcial',
  };
}

/** Fases elegíveis por perfil e oferta, para escolher prazos quando o estudante ainda não declarou a fase. */
export const OPCOES_FASE = [['1', 'Fase 1 (exclusiva para estrangeiros)'], ['2', 'Fase 2'], ['3', 'Fase 3']];
