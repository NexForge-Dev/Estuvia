import { DOC_TYPES, DOC_CATEGORIES, CATEGORY_USES, CATEGORY_DEFAULTS } from './document-catalog.js';

export { DOC_CATEGORIES, CATEGORY_USES, CONDITIONS, DOC_STATES, FILE_ROLES, APOSTILLE_GUIDE, TRANSLATION_GUIDE, CATALOG_REVIEWED_AT } from './document-catalog.js';

// Área documental (UserDocument). "finalidade" separa candidatura, visto e financiamento (RN-07).
// "exigencia": requerido | condicional | verificar — sempre com fonte (RN-04).
// O status é organização do estudante: "pronto" ou "enviado" NÃO significa validação oficial.
//
// Campos da carteira de documentos (views/documents.js + document-engine.js):
//   etapa      candidatura | matricula | visto | viagem | estadia (organiza a carteira pela jornada)
//   icone      ícone de icons.js · descricao: "o que é", em uma frase · acao: verbo do botão principal
//   comoObter  passos curtos (orientação prática; a regra oficial fica na fonte)
//   antecedencia  motivo para aparecer antes da etapa (documentos que demoram ou exigências financeiras)
//   prepara    missão em que o documento é preparado (concluir a missão marca o documento como pronto)
// A aplicabilidade por perfil (idioma do mestrado, duração da estada, apoio familiar, bolsa) é calculada em
// document-engine.js, sempre a partir de dados do catálogo ou do próprio estudante — nunca da IA.

// Campos herdados da primeira versão (25 documentos). O catálogo completo está em document-catalog.js;
// aqui ficam só os campos que já existiam (prepara, antecedencia, comoObter, acao…), mesclados abaixo.
const LEGACY = [
  // ---------- Minha candidatura ----------
  { id: 'passaporte', nome: 'Passaporte válido', finalidade: 'dua', exigencia: 'requerido', fonte: 'M', dica: 'A validade precisa cobrir a estadia.',
    etapa: 'candidatura', icone: 'passport', descricao: 'Seu documento de viagem. Ele identifica você na candidatura, no visto e na chegada.', acao: 'Preparar meu passaporte', prepara: '2.1', validade: true,
    comoObter: ['Confira a data de validade: ela precisa cobrir toda a estadia.', 'Se precisar de um novo, agende no site da Polícia Federal e pague a taxa (GRU).', 'Leve os documentos pedidos no dia do atendimento e retire o passaporte no prazo informado.'] },
  { id: 'diploma', nome: 'Diploma de graduação', finalidade: 'dua', exigencia: 'requerido', fonte: 'O1', dica: 'Sem diploma ainda? Veja na convocatória qual documento é aceito.',
    etapa: 'candidatura', icone: 'cap', descricao: 'O documento que comprova que você concluiu a graduação.', acao: 'Preparar meu diploma', prepara: '2.2',
    comoObter: ['Peça à secretaria da sua faculdade (presencial ou pelo sistema acadêmico).', 'Ainda não recebeu? Peça uma declaração de conclusão e veja na convocatória se ela é aceita.', 'Guarde uma cópia digital legível, frente e verso.'] },
  { id: 'historico', nome: 'Histórico acadêmico', finalidade: 'dua', exigencia: 'requerido', fonte: 'O1', dica: 'Versão oficial, completa.',
    etapa: 'candidatura', icone: 'book', descricao: 'O documento da sua faculdade com as matérias cursadas e suas notas.', acao: 'Preparar meu histórico', prepara: '2.3',
    comoObter: ['Peça o histórico oficial e completo à secretaria (muitas faculdades emitem pelo sistema online).', 'Confira se aparecem todas as disciplinas, a carga horária e as notas.', 'Salve a versão digital assinada ou digitalize o original.'] },
  { id: 'escala-notas', nome: 'Comprovação da escala de notas (mín./máx.)', finalidade: 'dua', exigencia: 'condicional', fonte: 'O1', dica: 'Declaração da universidade informando a escala.',
    etapa: 'candidatura', icone: 'scale', descricao: 'Uma declaração da faculdade explicando a nota mínima e a máxima do seu histórico.', acao: 'Pedir a declaração',
    comoObter: ['Peça à secretaria uma declaração com a escala de notas (mínima, máxima e de aprovação).', 'Confira na convocatória se ela é exigida para o seu caso.'] },
  { id: 'acesso-pos', nome: 'Declaração: título permite pós-graduação no Brasil', finalidade: 'dua', exigencia: 'condicional', fonte: 'O1', dica: 'Emitida por órgão competente, conforme a resolução do ciclo.',
    etapa: 'candidatura', icone: 'unlock', descricao: 'Declaração de que o seu diploma dá acesso à pós-graduação no Brasil.', acao: 'Pedir a declaração',
    comoObter: ['Peça à sua universidade (ou ao órgão indicado na convocatória).', 'Confira na convocatória do ciclo se ela é exigida e quem pode emiti-la.'] },
  { id: 'idioma', nome: 'Certificado de idioma (se o programa exigir)', finalidade: 'dua', exigencia: 'verificar', fonte: 'O3', dica: 'Depende de cada mestrado.',
    etapa: 'candidatura', icone: 'lang', descricao: 'O certificado que comprova o seu nível de espanhol (ou de outro idioma pedido).', acao: 'Preparar meu certificado', prepara: '2.5',
    comoObter: ['Veja na ficha do mestrado qual nível e quais certificados são aceitos.', 'Já tem? Confira se o nível atende e se o certificado está dentro da validade aceita.', 'Não tem? Veja as datas de prova (DELE ou SIELE) com antecedência.'] },
  { id: 'especificos', nome: 'Documentos específicos do mestrado (CV, carta…)', finalidade: 'dua', exigencia: 'verificar', fonte: 'O3', dica: 'Veja a ficha oficial do programa.',
    etapa: 'candidatura', icone: 'edit', descricao: 'Currículo, carta de motivação, portfólio ou o que o seu mestrado pedir.', acao: 'Preparar meus documentos', prepara: '2.6',
    comoObter: ['Veja na ficha oficial do mestrado o que é pedido e em qual formato.', 'Escreva em espanhol, a menos que a ficha diga outra coisa.'] },
  { id: 'comprovante-dua', nome: 'Comprovante de envio da candidatura', finalidade: 'dua', exigencia: 'requerido', fonte: 'M', dica: 'Baixe logo após enviar.',
    etapa: 'candidatura', icone: 'check', descricao: 'O recibo que prova que sua candidatura foi enviada.', acao: 'Salvar meu comprovante', prepara: '3.7',
    comoObter: ['Logo depois de enviar a candidatura no DUA, baixe o comprovante.', 'Guarde-o aqui e no seu e-mail.'] },
  // ---------- Minha matrícula ----------
  { id: 'admissao', nome: 'Carta de admissão / matrícula', finalidade: 'visto', exigencia: 'requerido', fonte: 'O7', dica: 'Emitida pela universidade.',
    etapa: 'matricula', icone: 'mail', descricao: 'A carta da universidade confirmando sua admissão ou matrícula.', acao: 'Obter minha carta de admissão', prepara: '4.6',
    comoObter: ['Depois da matrícula, baixe a carta na sede eletrônica da universidade ou peça à secretaria.', 'Confira nome, número do passaporte, curso e datas.'] },
  { id: 'comprovante-pagamento', nome: 'Comprovante de pagamento da matrícula', finalidade: 'dua', exigencia: 'requerido', fonte: 'O4', dica: 'Guarde junto com a carta de admissão.',
    etapa: 'matricula', icone: 'euro', descricao: 'O comprovante de que a matrícula (ou a reserva de vaga) foi paga.', acao: 'Salvar meu comprovante', prepara: '4.5',
    comoObter: ['Pague pelo canal indicado pela universidade.', 'Baixe o comprovante e guarde junto com a carta de admissão.'] },
  // ---------- Meu visto ----------
  { id: 'formulario', nome: 'Formulário de visto + fotos', finalidade: 'visto', exigencia: 'requerido', fonte: 'O7', dica: 'Modelo do seu consulado.',
    etapa: 'visto', icone: 'edit', descricao: 'O formulário de pedido do visto, preenchido e assinado, com foto recente.', acao: 'Preparar meu formulário',
    comoObter: ['Use o formulário da página de visto de estudos do SEU consulado.', 'Foto recente, colorida, tamanho passaporte e fundo claro.'] },
  { id: 'meios', nome: 'Comprovação de meios econômicos', finalidade: 'visto', exigencia: 'requerido', fonte: 'O6', dica: 'Valor e formatos aceitos: confira no consulado.',
    etapa: 'visto', icone: 'euro', descricao: 'Documentos que mostram que você tem dinheiro para se manter durante os estudos.', acao: 'Preparar minha comprovação', prepara: '5.4',
    antecedencia: 'A comprovação financeira se organiza com meses de antecedência: veja quanto falta no seu plano.',
    comoObter: ['Veja no planejador financeiro quanto a regra do visto exige no seu caso.', 'Reúna extratos e comprovantes no formato que o seu consulado aceita.'] },
  { id: 'apoio-familiar', nome: 'Documentação do apoiador financeiro', finalidade: 'financiamento', exigencia: 'condicional', fonte: 'O7', dica: 'Aceitação e documentos exigidos dependem do consulado.',
    etapa: 'visto', icone: 'users', descricao: 'Documentos de quem vai apoiar você financeiramente (declaração, renda, vínculo).', acao: 'Organizar a documentação',
    antecedencia: 'Quem apoia você também precisa reunir documentos: comece cedo.',
    comoObter: ['Confirme com o seu consulado se aceita apoio de terceiros e quais documentos pede.', 'Normalmente entram: declaração de apoio, comprovante de renda e de vínculo.'] },
  { id: 'carta-bolsa', nome: 'Carta de concessão de bolsa', finalidade: 'financiamento', exigencia: 'condicional', fonte: 'O12', dica: 'Somente com bolsa oficialmente concedida.',
    etapa: 'visto', icone: 'trophy', descricao: 'A carta oficial que confirma a sua bolsa e o valor.', acao: 'Salvar minha carta',
    comoObter: ['Baixe a carta de concessão no portal da entidade da bolsa.', 'Confira valor, duração e o que ela cobre.'] },
  { id: 'seguro', nome: 'Seguro saúde', finalidade: 'visto', exigencia: 'requerido', fonte: 'O6', dica: 'Confira as coberturas exigidas.',
    etapa: 'visto', icone: 'shield', descricao: 'O seguro médico que cobre você durante toda a estadia na Espanha.', acao: 'Contratar meu seguro', prepara: '5.5',
    comoObter: ['Confira na página do seu consulado as coberturas exigidas.', 'Peça a apólice e o certificado em espanhol ou com tradução, se exigido.'] },
  { id: 'antecedentes', nome: 'Certidão de antecedentes criminais', finalidade: 'visto', exigencia: 'condicional', fonte: 'O6', dica: 'Exigida para estadas acima de seis meses; pode exigir apostila.',
    etapa: 'visto', icone: 'shield', descricao: 'A certidão de que você não tem antecedentes criminais.', acao: 'Tirar minha certidão',
    antecedencia: 'Emissão, apostila e tradução levam tempo: prepare antes de chegar à etapa do visto.',
    comoObter: ['Emita a certidão da Polícia Federal pelo site oficial (gratuita).', 'Veja se o consulado também pede a estadual e se exige apostila e tradução.', 'Atenção à data de emissão: o consulado pode exigir que seja recente.'] },
  { id: 'atestado', nome: 'Atestado médico', finalidade: 'visto', exigencia: 'requerido', fonte: 'O6', dica: 'No modelo do consulado.',
    etapa: 'visto', icone: 'help', descricao: 'Um atestado médico de que você não tem doenças que exijam medidas de saúde pública.', acao: 'Providenciar meu atestado',
    comoObter: ['Use o texto ou modelo indicado pelo seu consulado.', 'Peça a um médico com registro e veja se é preciso apostila e tradução.'] },
  { id: 'traducoes', nome: 'Apostilas e traduções', finalidade: 'visto', exigencia: 'verificar', fonte: 'O7', dica: 'Somente quando a fonte pertinente exigir.',
    etapa: 'visto', icone: 'lang', descricao: 'Apostila de Haia e tradução juramentada dos documentos que o consulado pedir.', acao: 'Ver o que precisa',
    comoObter: ['Só apostile e traduza o que a lista do seu consulado pedir.', 'Apostila: em cartório. Tradução: com tradutor juramentado.'] },
  // ---------- Minha viagem ----------
  { id: 'visto', nome: 'Visto de estudos no passaporte', finalidade: 'viagem', exigencia: 'requerido', fonte: 'O7', dica: 'Confira nome, datas e tipo do visto.',
    etapa: 'viagem', icone: 'passport', descricao: 'O visto colado no seu passaporte, que permite entrar na Espanha para estudar.', acao: 'Conferir meu visto', prepara: '5.9',
    comoObter: ['Retire o passaporte com o visto no consulado.', 'Confira nome, número do passaporte, tipo de visto e datas de validade.'] },
  { id: 'comprovante-moradia', nome: 'Comprovante de moradia', finalidade: 'viagem', exigencia: 'condicional', fonte: 'M', dica: 'Contrato ou reserva, para a viagem e para o empadronamiento.',
    etapa: 'viagem', icone: 'home', descricao: 'Contrato ou reserva do lugar onde você vai morar.', acao: 'Salvar meu comprovante',
    comoObter: ['Guarde o contrato ou a reserva assim que a moradia estiver escolhida (Meu novo lar).', 'Ele também é usado depois, no empadronamiento.'] },
  { id: 'passagem', nome: 'Passagem e reservas da viagem', finalidade: 'viagem', exigencia: 'requerido', fonte: 'M', dica: 'Bilhetes e reservas na bagagem de mão e no celular.',
    etapa: 'viagem', icone: 'plane', descricao: 'Os bilhetes e as reservas da sua viagem até a cidade de estudo.', acao: 'Salvar minha passagem',
    comoObter: ['Guarde o bilhete e o localizador da reserva.', 'Tenha uma cópia acessível sem internet.'] },
  // ---------- Minha vida na Espanha ----------
  { id: 'empadronamiento', nome: 'Certificado de empadronamiento', finalidade: 'estadia', exigencia: 'condicional', fonte: 'M', dica: 'Registro do seu endereço na prefeitura (ayuntamiento).',
    etapa: 'estadia', icone: 'pin', descricao: 'O registro do seu endereço na prefeitura (ayuntamiento) da cidade.', acao: 'Fazer meu empadronamiento', prepara: '7.9',
    comoObter: ['Agende no ayuntamiento da sua cidade.', 'Leve passaporte e contrato de moradia.', 'Guarde o certificado: outros trâmites podem pedi-lo.'] },
  { id: 'tie-solicitacao', nome: 'Formulário e documentos da TIE', finalidade: 'estadia', exigencia: 'requerido', fonte: 'O6', dica: 'Para estadas acima de seis meses, até um mês depois da entrada.',
    etapa: 'estadia', icone: 'file', descricao: 'O formulário oficial e os documentos para pedir o cartão de estrangeiro (TIE).', acao: 'Preparar o pedido da TIE', prepara: '8.4',
    comoObter: ['Confira na fonte oficial o formulário e a lista de documentos.', 'Peça a TIE pessoalmente no prazo de um mês desde a entrada na Espanha.'] },
  { id: 'taxa-tie', nome: 'Comprovante da taxa da TIE', finalidade: 'estadia', exigencia: 'requerido', fonte: 'O6', dica: 'Pague antes do atendimento e leve o comprovante.',
    etapa: 'estadia', icone: 'euro', descricao: 'O comprovante de pagamento da taxa do cartão de estrangeiro.', acao: 'Pagar e salvar o comprovante', prepara: '8.5',
    comoObter: ['Confira a taxa na fonte oficial.', 'Pague e leve o comprovante ao atendimento.'] },
  { id: 'tie', nome: 'TIE (cartão de estrangeiro)', finalidade: 'estadia', exigencia: 'requerido', fonte: 'O6', dica: 'Retire o cartão quando ele for emitido.',
    etapa: 'estadia', icone: 'user', descricao: 'O cartão que identifica você como estrangeiro residente na Espanha.', acao: 'Retirar minha TIE', prepara: '8.8',
    comoObter: ['Acompanhe o aviso de emissão.', 'Retire o cartão pessoalmente no local indicado.'] },
];

// ---------------------------------------------------------------------------
// DOCUMENTS = catálogo completo no formato que o resto da plataforma já usa (missões, Mentor, admin).
// Documentos novos ganham os campos antigos a partir do catálogo; os 25 antigos mantêm os seus e ganham os novos.
// ---------------------------------------------------------------------------
const FINALIDADE = { pessoais: 'dua', academicos: 'dua', candidatura: 'dua', matricula: 'dua', financeira: 'financiamento', visto: 'visto', saude: 'visto', familiares: 'visto', moradia: 'viagem', viagem: 'viagem' };
const CLASS_TO_EXIGENCIA = { O: 'requerido', C: 'condicional', R: 'recomendado' };
const LEGACY_BY_ID = new Map(LEGACY.map((d) => [d.id, d]));
/** Os 25 documentos da primeira versão (usados por telas que mostram o núcleo do checklist). */
export const LEGACY_IDS = LEGACY.map((d) => d.id);
const CATEGORY_BY_ID = new Map(DOC_CATEGORIES.map((c) => [c.id, c]));

export const DOCUMENTS = DOC_TYPES.map((t) => {
  const cat = CATEGORY_BY_ID.get(t.categoria);
  const def = CATEGORY_DEFAULTS[t.categoria] || {};
  const home = (CATEGORY_USES[t.categoria] || []).find((x) => x.doc === t.id);
  const detail = {
    categoria: t.categoria,
    oque: t.oque, para: t.para, onde: t.onde || def.onde || null, quando: t.quando || def.quando || null,
    apostila: t.apostila || def.apostila || 'nao', traducao: t.traducao || def.traducao || 'nao',
    apostilaNota: t.apostilaNota || null, traducaoNota: t.traducaoNota || null,
    tipoValidade: t.validade || null, partes: t.partes || null, multiplos: Boolean(t.multiplos),
    fontes: t.fontes || def.fontes || ['M'], missoesExtra: t.missoes || [], agregado: t.agregado || null, atendidoPor: t.atendidoPor || null,
  };
  const old = LEGACY_BY_ID.get(t.id);
  if (old) return { ...old, ...detail, nome: t.nome, descricao: old.descricao, validade: t.validade === 'data' || Boolean(old.validade), prepara: old.prepara || t.prepara || undefined };
  return {
    id: t.id, nome: t.nome, finalidade: FINALIDADE[t.categoria] || 'estadia', exigencia: CLASS_TO_EXIGENCIA[home?.classe] || 'condicional',
    fonte: detail.fontes[0], dica: '', etapa: cat?.etapa || null, icone: t.icone || cat?.icone || 'file', descricao: t.oque,
    acao: t.agregado ? 'Ver documentos' : 'Organizar documento', validade: t.validade === 'data',
    comoObter: [detail.onde, detail.quando].filter(Boolean), prepara: t.prepara || undefined,
    ...detail,
  };
});

export const DOC_STATUS = ['pendente', 'em-preparacao', 'pronto', 'enviado', 'correcao', 'nao-se-aplica'];
export const DOC_STATUS_LABEL = {
  pendente: 'Pendente',
  'em-preparacao': 'Em preparação',
  pronto: 'Pronto para envio',
  enviado: 'Enviado',
  correcao: 'Necessita correção',
  'nao-se-aplica': 'Não se aplica',
};
// Rótulos simples da carteira (a interface principal usa estes; os internos continuam acima).
export const DOC_STATUS_SIMPLE = {
  pendente: 'Pendente',
  'em-preparacao': 'Preparando',
  pronto: 'Pronto',
  enviado: 'Enviado',
  correcao: 'Precisa de atenção',
  'nao-se-aplica': 'Não necessário',
};

// Etapas da carteira = blocos da jornada. "procedimento" separa envios: enviado ao DUA ≠ apresentado ao consulado.
export const DOC_STAGES = [
  { id: 'candidatura', titulo: 'Minha candidatura', icone: 'cap', rodadas: [1, 2, 3], procedimento: 'dua', procedimentoLabel: 'candidatura (DUA)',
    resumo: 'Documentos acadêmicos e pessoais para se candidatar ao mestrado.' },
  { id: 'matricula', titulo: 'Minha matrícula', icone: 'check', rodadas: [4], procedimento: 'universidade', procedimentoLabel: 'universidade',
    resumo: 'Resultado da admissão, matrícula e comprovantes de pagamento.' },
  { id: 'visto', titulo: 'Meu visto', icone: 'passport', rodadas: [5, 9], procedimento: 'consulado', procedimentoLabel: 'consulado',
    resumo: 'O que o consulado pede para o visto de estudos.', reutiliza: ['passaporte', 'admissao'] },
  { id: 'viagem', titulo: 'Minha viagem', icone: 'plane', rodadas: [6], procedimento: null, procedimentoLabel: null,
    resumo: 'O que levar na bagagem de mão no dia da viagem.', reutiliza: ['passaporte', 'admissao', 'seguro', 'meios', 'diploma', 'historico'] },
  { id: 'estadia', titulo: 'Minha vida na Espanha', icone: 'home', rodadas: [7, 8], procedimento: 'extranjeria', procedimentoLabel: 'trâmites na Espanha',
    resumo: 'Empadronamiento, TIE e registros depois da chegada.', reutiliza: ['passaporte', 'visto', 'admissao', 'seguro', 'comprovante-moradia'] },
];

export const PROCEDURES = { dua: 'Candidatura (DUA)', universidade: 'Universidade', consulado: 'Consulado', extranjeria: 'Extranjería / polícia', ayuntamiento: 'Ayuntamiento', outro: 'Outro' };
