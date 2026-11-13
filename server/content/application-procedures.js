// Procedimentos oficiais de candidatura (conteúdo puro; resolvido por programa em server/application-process.js).
//
// Toda regra aqui tem fonte (sources.js), artigo e data de conferência. O que os textos oficiais NÃO dizem
// fica registrado como "nao-mencionado" ou "nao-confirmado", nunca como fato.
//
// Fontes conferidas em 13/11/2026 (texto publicado no BOJA, artigos citados literalmente):
//   O1 Acuerdo de 12 de diciembre de 2025 (BOJA 245, 22/12/2025; Resolución de 15/12/2025): Fase 1, só estrangeiros.
//   O2 Acuerdo de 20 de abril de 2026 (BOJA 84, 05/05/2026; Resolución de 28/04/2026): Fases 2 e 3.
// Ciclo: estes acordos regem o curso 2026/27. Os do curso 2027/28 ainda não foram publicados (13/11/2026):
// para jornadas de outro ciclo o processo é mostrado como referência, com pendência explícita.

export const PROCEDURE_REVIEWED = '2026-11-13';

const r = (texto, fonte, artigo, extra = {}) => ({ texto, fonte, artigo, revisadoEm: PROCEDURE_REVIEWED, ...extra });

export const DUA_MASTERES = {
  id: 'dua-masteres',
  ciclo: '2026/2027',
  titulo: 'Preinscrição em másteres oficiais: Distrito Único Andaluz',
  canal: { fonte: 'O5', rotulo: 'Portal de másteres do DUA (solicitação única, eletrônica)' },
  fontes: ['O1', 'O2'],

  maxPedidos: r(
    'Até 6 másteres por solicitação, em ordem de preferência. Másteres que habilitam para a mesma profissão regulada contam como um só, assim como um máster interuniversitário oferecido em várias sedes.',
    'O1', 'Fase 1: art. 3 · Fases 2 e 3: O2 art. 14.1', { valor: 6, original: 'hasta un máximo de seis Másteres Universitarios' }),

  taxaSolicitacao: r('Os dois acordos não preveem taxa para apresentar a solicitação. Os únicos pagamentos citados são os da matrícula.', 'O2', 'O1 art. 6 · O2 art. 14.7', { status: 'nao-mencionada' }),

  fases: [
    {
      fase: 1,
      publico: 'estrangeiros',
      quem: r('Pessoas de nacionalidade estrangeira com título estrangeiro NÃO homologado. Cada universidade decide em quais másteres reserva vagas para esta fase: nem todo máster participa.', 'O1', 'arts. 1, 2 e 9; O2 art. 3', { original: 'podrán reservar plazas, en los másteres que determinen' }),
      ofertaPorMaster: true,
      titulo: r('O título precisa estar concluído: os direitos de expedição do título (ou equivalente) devem estar pagos até a data-limite do Anexo I (29 de janeiro no ciclo 2026/27).', 'O1', 'art. 4 e Anexo I', { eventoTipo: 'pagamento-titulo' }),
      pagamento: r('Quem se matricula na Fase 1 paga 400 € a cuenta dos preços públicos (dispensado para quem tem bolsa de máster). O restante é cobrado depois; se os descontos deixarem o total abaixo de 400 €, a diferença é devolvida.', 'O1', 'art. 6', { valor: 400, moeda: 'EUR', original: 'un abono de 400 euros' }),
      listaEsperaSeguinte: r('Quem fica em lista de espera na Fase 1 só concorre às vagas gerais das fases seguintes se CONFIRMAR que deseja continuar na lista após a última adjudicação.', 'O1', 'arts. 6 e 9'),
    },
    {
      fase: 2,
      publico: 'todos',
      quem: r('Quem cumpre os requisitos 1 a 3 do art. 2 (título concluído: espanhol, de país do EEES ou de fora do EEES, como o brasileiro), além de quem ficou em lista de espera na Fase 1 e confirmou que deseja continuar. As vagas que sobram da Fase 1 se somam a esta fase.', 'O2', 'arts. 2 e 3'),
      titulo: r('Os direitos de expedição do título devem estar pagos até a data-limite da fase (4 de setembro de 2026). Na mesma data vence a acreditação de idioma do Máster em Profesorado.', 'O2', 'Anexo I', { eventoTipo: 'pagamento-titulo' }),
      pagamento: r('A matrícula segue os preços públicos e os prazos de pagamento da universidade. O acordo não fixa pagamento a cuenta nesta fase.', 'O2', 'art. 14.7', { status: 'conforme-universidade' }),
    },
    {
      fase: 3,
      publico: 'todos',
      quem: r('Vagas que sobraram após a Fase 2, para quem cumpre qualquer requisito do art. 2. É a única fase dos requisitos 4 e 5: estar cursando graduação em universidade ESPANHOLA com no máximo 9 ECTS pendentes, ou graduação ligada a um PARS de universidade pública andaluza (até 30 ECTS, incluído o TFG), com admissão condicionada ao título. Com título estrangeiro (requisitos 2 e 3), o título precisa estar concluído também nesta fase.', 'O2', 'arts. 2, 3 e 14'),
      titulo: r('Direitos de expedição do título pagos e idioma acreditado (quando for requisito de acesso) até a data-limite da fase (5 de outubro de 2026).', 'O2', 'Anexo I', { eventoTipo: 'pagamento-titulo' }),
      pagamento: r('A matrícula segue os preços públicos e os prazos de pagamento da universidade.', 'O2', 'art. 14.7', { status: 'conforme-universidade' }),
    },
  ],

  // Título estrangeiro não homologado (caso do estudante brasileiro). docId = item da Carteira (content/documents.js).
  documentos: [
    { docId: 'passaporte', ...r('Passaporte (ou NIE / certificado de residência).', 'O1', 'art. 4; O2 Tabla 3'), obrigatorio: true },
    { docId: 'diploma', ...r('Diploma, ou certificação supletória que mostre a data de pagamento dos direitos de expedição do título.', 'O1', 'art. 4; O2 Tabla 3'), obrigatorio: true },
    { docId: 'historico', ...r('Histórico acadêmico oficial com notas, carga (créditos ou meses) e NOTA MÉDIA final. Se não estiver como exigido, considera-se nota 5.', 'O1', 'art. 4; O2 Tabla 3'), obrigatorio: true },
    { docId: 'escala-notas', ...r('Certificado oficial da universidade ou órgão do país de origem com a nota mínima aprovatória e a máxima possível. Para título de fora do EEES, faltar o histórico OU este certificado faz valer a nota mínima aprovatória.', 'O2', 'Tabla 3 (requisito 3); O1 arts. 4 e 7'), obrigatorio: false, consequencia: 'Sem ele, a sua média vira a nota mínima aprovatória (5) na conversão.' },
    { docId: 'acesso-pos', ...r('Declaração do órgão oficial do país de origem de que o título permite cursar pós-graduação, conforme o modelo do Anexo II (disponível no portal de solicitações).', 'O1', 'art. 4; O2 Tabla 3'), obrigatorio: true },
    { docId: 'equivalencia-nota', ...r('Fases 2 e 3: opcionalmente, a "Declaración de equivalencia de notas medias" preenchida no site do Ministério, com a declaração responsável assinada. Sem ela, a média é convertida pela fórmula Ce = 5 + 5 × (Co − Cm) / (CM − Cm).', 'O2', 'art. 12.2'), obrigatorio: false, fases: [2, 3], consequencia: 'Não é obrigatória: sem ela vale a conversão pela fórmula oficial.' },
    { docId: 'especificos', ...r('Documentação específica que o máster exigir (publicada desde o início do prazo), anexada eletronicamente dentro do prazo da fase.', 'O2', 'art. 9; O1 art. 4.b'), obrigatorio: 'conforme-master' },
  ],

  idiomaDocumentos: r('Na solicitação, os documentos devem estar em espanhol, mas não necessariamente com tradução juramentada nem legalização. Na matrícula, ou quando a universidade pedir, é preciso entregar originais ou cópias autênticas e, se exigida, tradução juramentada.', 'O1', 'art. 4; O2 art. 9', { original: 'aunque no necesariamente traducida por persona traductora jurada y/o legalizada' }),

  // Regras de transição que o estudante não pode ignorar.
  regras: [
    { id: 'ratificar', ...r('Após CADA lista de adjudicação é obrigatório agir no prazo: matricular-se, reservar a vaga e/ou confirmar a permanência na lista de espera. Reservas e confirmações precisam ser ratificadas em cada nova adjudicação.', 'O1', 'art. 6; O2 art. 14.7', { original: 'las reservas y/o confirmaciones deberán ratificarse en cada nueva adjudicación' }) },
    { id: 'decai', ...r('Quem não age no prazo perde o direito no processo daquela fase e a vaga passa ao seguinte da lista.', 'O1', 'art. 6; O2 art. 14.7', { original: 'decaerá en su derecho en el proceso de admisión' }) },
    { id: 'opcoes-apos-lista', ...r('Admitido na 1ª preferência: matrícula. Admitido em outra opção: matricular-se (renunciando às listas de maior preferência) ou reservar a vaga e continuar nas listas preferidas. Sem vaga: confirmar que deseja continuar nas listas. Admitido provisoriamente por documentação pendente: aguardar a próxima adjudicação, confirmando participação.', 'O2', 'art. 14.7; O1 art. 6') },
    { id: 'resultas', ...r('Nas listas de resultas (Fases 2 e 3) a matrícula é obrigatória, sem possibilidade de reserva.', 'O2', 'art. 4.b') },
    { id: 'alegacoes', ...r('Depois de cada lista há prazo de alegações/revisão, pedido no portal. Não se aceitam revisões de listas anteriores da mesma fase. Quem tem vaga provisória e quer reordenar preferências usa a alegação.', 'O1', 'arts. 6 e 10; O2 arts. 14.2 e 17') },
    { id: 'mudar-pedidos', ...r('Após cada lista é possível acrescentar másteres (Fase 1: sem lista de espera ou com lista menor que 30% das vagas; total sempre até 6), mudar a ordem ou desistir de algum.', 'O1', 'art. 6; O2 art. 14.2') },
    { id: 'admissao-nao-valida', ...r('Ser admitido não confirma os requisitos: a matrícula é provisória até a universidade conferir a documentação. Se faltar um requisito, admissão e matrícula são anuladas.', 'O1', 'art. 11; O2 art. 16') },
    { id: 'fraude', ...r('Documentos falsos ou que não correspondam à verdade causam exclusão imediata.', 'O1', 'art. 4.a') },
    { id: 'preferencia-bolsas', ...r('Têm preferência na própria fase quem comprova bolsa ou ajuda de estudo para cursar aquele máster, e pessoas ligadas a instituições públicas com convênio que preveja a preferência (no máximo 2 pessoas ou 5% das vagas).', 'O1', 'art. 7; O2 art. 13.1') },
    { id: 'nota-admissao', ...r('A nota de admissão de cada máster é a soma da valoração dos requisitos específicos com a nota média, ponderadas pelos percentuais da memória de verificação do máster (os pesos aparecem na ficha do DUA).', 'O2', 'art. 12.4') },
    { id: 'silencio', ...r('O silêncio administrativo tem sentido desestimatório. As listas definitivas valem como resolução do reitor (recurso de reposição em 1 mês ou contencioso no TSJA em 2 meses).', 'O1', 'arts. 6 e 12; O2 art. 4') },
  ],

  // O que os acordos não dizem: aparece para o estudante como "não confirmado".
  naoInformado: [
    { id: 'vagas', texto: 'Número de vagas de cada máster: não consta da ficha do DUA. Confirme na página do máster.' },
    { id: 'preco', texto: 'Preço total da matrícula: depende dos preços públicos do ano e da universidade. Confirme na secretaria do máster.' },
    { id: 'entrevista', texto: 'Os acordos não regulam provas ou entrevistas: só a ficha do máster diz se há algum critério desse tipo.' },
  ],
};

// Regras oficiais que valem para másteres específicos (identificados pelo nome oficial).
export const PROGRAM_SPECIFIC = [
  // Nomes comparados sem acento e em maiúsculas (application-process.js). Duplos com um máster habilitante seguem
  // os requisitos do máster habilitante (O2 art. 12.1), por isso o nome do duplo também casa.
  {
    id: 'psicologia-geral-sanitaria',
    match: /PSICOLOGIA GENERAL SANITARIA/,
    flag: 'exigeResolucaoPGS',
    ...r('Com título de país do EEES ou de fora do EEES (requisitos 2 e 3), é preciso ter, na data de fim do prazo de solicitação, a resolução favorável ou certificação que comprove o cumprimento dos requisitos da Orden CNU/1309/2018 para o acesso ao Máster en Psicología General Sanitaria com título estrangeiro de Psicologia, emitida conforme a Resolución de 16 de noviembre de 2023.', 'O2', 'art. 9', { original: 'deberán disponer, a fecha de fin del plazo de presentación de solicitudes, de la resolución favorable o certificación' }),
    aviso: 'O acordo da Fase 1 não repete esta regra no texto: confira a documentação específica publicada no portal do DUA para a Fase 1.',
  },
  {
    id: 'profesorado',
    // Só o Máster en Profesorado de ESO/Bachillerato/FP/Idiomas (e duplos com ele). "…para profesorado de español
    // como lengua extranjera" é outro máster e NÃO entra.
    match: /PROFESORADO (EN|DE) (ESO|EDUCACION SECUNDARIA|ENSENANZA SECUNDARIA)/,
    flag: 'idiomaComPrazo',
    ...r('A acreditação de idioma exigida para o acesso ao Máster en Profesorado precisa estar feita até a data-limite da Fase 2 (4 de setembro de 2026); na Fase 3, até 5 de outubro de 2026, como todo idioma que seja requisito de acesso. O nível e os certificados aceitos estão nos requisitos da ficha do DUA.', 'O2', 'Anexo I', { original: 'así como de la acreditación de idioma requerida para el acceso al Máster Universitario en Profesorado' }),
  },
];
