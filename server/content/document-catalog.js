// Catálogo da Carteira de Documentos: 17 categorias, tipos de documento canônicos e o uso de cada um por categoria.
//
// Regras do catálogo (a interface e o motor só leem estes dados — atualizar uma regra é editar aqui
// ou registrar uma revisão no painel admin, sem mexer nas telas):
//   • Um documento existe UMA vez (DOC_TYPES). Quando outra categoria também o usa, ela o REFERENCIA (CATEGORY_USES),
//     com o rótulo daquele uso — o passaporte é guardado uma vez e aparece no visto, na viagem e na TIE.
//   • Classificação por uso: O = obrigatório no procedimento indicado · C = condicional · R = recomendado/opcional.
//     "C" nunca vira obrigatório sozinho: só quando a condição do estudante se confirma (cond).
//   • etapa (opcional): etapa da jornada em que AQUELE uso é necessário, quando difere da categoria
//     (ex.: a foto é um documento pessoal, mas só é usada no visto).
//   • cond: chave(s) de CONDITIONS. Todas verdadeiras → vale; alguma falsa → não se aplica; desconhecida → "depende".
//   • Apostila e tradução: 'talvez' = pode ser exigida conforme o procedimento (nunca "sempre"); 'nao' = não se aplica
//     (ex.: documento emitido na Espanha para uso na Espanha). O estudante registra se o órgão pediu.
//   • validade: 'data' = tem data de vencimento impressa · 'recencia' = o órgão pode exigir emissão recente (sem prazo universal).
//   • agregado: item de checklist que reúne outros documentos (ex.: "Apostilas dos documentos acadêmicos"); não tem
//     arquivo próprio nem entra na contagem — os arquivos ficam em cada documento.
//   • atendidoPor: o requisito pode estar contido em outro documento (ex.: média final no histórico).
//   • prepara: missão em que o documento é obtido. Concluir essa missão marca o documento como pronto na Carteira
//     (uma vez, sem rebaixar). Os 25 documentos antigos já tinham esse campo em documents.js.
// Os 25 ids da versão anterior (passaporte, diploma, historico…) foram mantidos: status, missões e arquivos continuam valendo.

export const CATALOG_REVIEWED_AT = '2026-10-27';

// Etapas da jornada (as mesmas de DOC_STAGES em documents.js) + futuras.
export const DOC_CATEGORIES = [
  { id: 'pessoais', numero: 1, nome: 'Documentos pessoais e identidade', icone: 'user', etapa: 'candidatura', descricao: 'Passaporte, fotos e documentos civis que identificam você.' },
  { id: 'academicos', numero: 2, nome: 'Documentos acadêmicos brasileiros', icone: 'cap', etapa: 'candidatura', descricao: 'Diploma, histórico e declarações da sua faculdade no Brasil.' },
  { id: 'candidatura', numero: 3, nome: 'Candidatura ao mestrado', icone: 'send', etapa: 'candidatura', descricao: 'O que vai na pré-inscrição do Distrito Único Andaluz e o que o mestrado pedir.' },
  { id: 'matricula', numero: 4, nome: 'Admissão e matrícula universitária', icone: 'check', etapa: 'matricula', descricao: 'Carta de admissão, matrícula e comprovantes de pagamento.' },
  { id: 'financeira', numero: 5, nome: 'Documentação financeira', icone: 'euro', etapa: 'visto', descricao: 'Formas de comprovar que você tem como se manter. São meios alternativos: ninguém precisa de todos.' },
  { id: 'visto', numero: 6, nome: 'Visto de estudante', icone: 'passport', etapa: 'visto', descricao: 'O que o consulado pede para o visto nacional de estudos.' },
  { id: 'saude', numero: 7, nome: 'Saúde e seguro médico', icone: 'shield', etapa: 'visto', descricao: 'Seguro, atestado e o que é bom levar sobre a sua saúde.' },
  { id: 'moradia', numero: 8, nome: 'Moradia e alojamento', icone: 'home', etapa: 'viagem', descricao: 'Contrato, reservas e comprovantes do lugar onde você vai morar.' },
  { id: 'viagem', numero: 9, nome: 'Viagem e entrada na Espanha', icone: 'plane', etapa: 'viagem', descricao: 'O que levar na bagagem de mão no dia da viagem.' },
  { id: 'empadronamiento', numero: 10, nome: 'Empadronamiento', icone: 'pin', etapa: 'estadia', descricao: 'O registro do seu endereço na prefeitura (ayuntamiento) da cidade.' },
  { id: 'nie-tie', numero: 11, nome: 'NIE e TIE', icone: 'file', etapa: 'estadia', descricao: 'O cartão de estrangeiro (TIE) para estadas acima de seis meses.' },
  { id: 'universidade-es', numero: 12, nome: 'Universidade na Espanha', icone: 'book', etapa: 'estadia', descricao: 'Documentos do dia a dia do mestrado: matrícula, carteirinha e TFM.' },
  { id: 'banco', numero: 13, nome: 'Banco e finanças na Espanha', icone: 'euro', etapa: 'estadia', descricao: 'O que os bancos costumam pedir para abrir uma conta. Nunca guarde senhas aqui.' },
  { id: 'trabalho', numero: 14, nome: 'Trabalho e estágios', icone: 'flag', etapa: 'estadia', descricao: 'Para quem vai trabalhar ou fazer estágio durante os estudos.' },
  { id: 'familiares', numero: 15, nome: 'Familiares e acompanhantes', icone: 'users', etapa: 'visto', descricao: 'Para quem vai com cônjuge, companheiro(a) ou filhos.' },
  { id: 'complementar', numero: 16, nome: 'Documentação complementar', icone: 'folder', etapa: null, descricao: 'Carteira de motorista, animais, acessibilidade e outros casos específicos.' },
  { id: 'renovacao', numero: 17, nome: 'Renovação da autorização de estudos', icone: 'refresh', etapa: 'renovacao', descricao: 'Só quando você for continuar estudando além do período autorizado.' },
];

// ---------------------------------------------------------------------------
// Condições do estudante. "detect" diz de onde a Estuvia tira o valor (document-engine.js);
// sem detecção, vale o padrão (false = não se aplica até o estudante dizer que sim). Tudo pode ser corrigido.
// ---------------------------------------------------------------------------
export const CONDITIONS = {
  residenteBrasil: { rotulo: 'Moro no Brasil', ajuda: 'Define o consulado que atende você.', detect: 'perfil' },
  longa: { rotulo: 'Minha autorização de estudos terá mais de seis meses', ajuda: 'Define a obrigação da TIE. A carteira estima pela duração informada do curso; confirme a duração que será concedida no visto/autorização.', detect: 'jornada' },
  antecedentesConsulares: { rotulo: 'Meu consulado exige antecedentes criminais para minha duração de estadia', ajuda: 'Confira o limite da lista atual do seu consulado (algumas instruções usam mais de 180 dias; a regra migratória espanhola também usa mais de seis meses).', padrao: null },
  atestadoConsular: { rotulo: 'Meu consulado exige atestado médico para minha duração de estadia', ajuda: 'Confira o limite e o texto exigido na lista atual do seu consulado; não presuma que 180 dias e seis meses sejam sempre equivalentes.', padrao: null },
  idiomaEspanhol: { rotulo: 'Meu mestrado exige certificado de espanhol', ajuda: 'Vem da ficha oficial do mestrado.', detect: 'mestrado' },
  idiomaIngles: { rotulo: 'Meu mestrado exige certificado de inglês', ajuda: 'Confira na ficha do mestrado.', padrao: null },
  bolsa: { rotulo: 'Tenho bolsa concedida', ajuda: 'Detectado quando você registra uma bolsa como concedida.', detect: 'financas' },
  patrocinador: { rotulo: 'Alguém vai me apoiar financeiramente', ajuda: 'Detectado pelo apoio familiar registrado no planejador.', detect: 'financas' },
  vistoAprovado: { rotulo: 'Meu visto já foi aprovado', ajuda: 'Vem da situação registrada na jornada.', detect: 'jornada' },
  chegou: { rotulo: 'Já cheguei à Espanha', ajuda: 'Vem da chegada registrada na jornada.', detect: 'jornada' },
  familiares: { rotulo: 'Vou com familiares ou acompanhantes', ajuda: 'Ativa a categoria de acompanhantes.', padrao: false },
  conjuge: { rotulo: 'Preciso comprovar casamento ou união estável', ajuda: 'Ex.: cônjuge ou companheiro(a) vai junto.', padrao: false },
  filhos: { rotulo: 'Vou com filhos menores de idade', ajuda: 'Documentos de filiação, guarda e autorizações.', padrao: false },
  menor: { rotulo: 'Tenho menos de 18 anos', ajuda: 'Autorizações de responsáveis.', padrao: false },
  representante: { rotulo: 'Alguém vai me representar em algum trâmite', ajuda: 'Procuração e documento do representante.', padrao: false },
  nomeMudou: { rotulo: 'Meu nome mudou (casamento, retificação…)', ajuda: 'Os documentos precisam mostrar a ligação entre os nomes.', padrao: false },
  diplomaPendente: { rotulo: 'Ainda não recebi o diploma', ajuda: 'A certidão de conclusão pode ser aceita no lugar, conforme a convocatória.', padrao: false },
  outrasGraduacoes: { rotulo: 'Tenho outra graduação além da principal', ajuda: 'Diplomas e históricos adicionais.', padrao: false },
  residiuOutrosPaises: { rotulo: 'Morei em outro país nos últimos 5 anos', ajuda: 'Antecedentes criminais de outros países podem ser pedidos.', padrao: false },
  necessidadesEspeciais: { rotulo: 'Preciso de adaptações (deficiência, acessibilidade)', ajuda: 'Reserva de vagas e adaptações acadêmicas.', padrao: false },
  medicamentos: { rotulo: 'Uso medicamentos controlados ou de uso contínuo', ajuda: 'Receitas e autorizações para levar na viagem.', padrao: false },
  animal: { rotulo: 'Vou levar um animal de estimação', ajuda: 'Exigências sanitárias de viagem.', padrao: false },
  veiculo: { rotulo: 'Pretendo dirigir na Espanha', ajuda: 'CNH e Permissão Internacional para Dirigir.', padrao: false },
  nieExistente: { rotulo: 'Já tenho um NIE espanhol', ajuda: 'Número de identificação de estrangeiro emitido antes.', padrao: false },
  trabalho: { rotulo: 'Pretendo trabalhar ou fazer estágio', ajuda: 'Ativa a categoria de trabalho e estágios.', padrao: false },
  renovar: { rotulo: 'Vou renovar a autorização de estudos', ajuda: 'Ativa a categoria de renovação.', padrao: false },
};

// ---------------------------------------------------------------------------
// Padrões por categoria (onde conseguir, quando, apostila, tradução, fontes). O documento pode sobrescrever.
// ---------------------------------------------------------------------------
const BR = { apostila: 'talvez', traducao: 'talvez' }; // documento brasileiro usado na Espanha
const ES = { apostila: 'nao', traducao: 'nao' };       // emitido na Espanha / comprovante para uso na Espanha
export const CATEGORY_DEFAULTS = {
  pessoais: { ...BR, quando: 'Antes de começar a candidatura: alguns demoram semanas.', fontes: ['O21'] },
  academicos: { ...BR, onde: 'Na secretaria acadêmica da sua faculdade (presencial ou pelo sistema online).', quando: 'Antes de iniciar a candidatura: a emissão pode levar semanas.', fontes: ['O1', 'O3'] },
  candidatura: { apostila: 'nao', traducao: 'talvez', quando: 'Antes da fase de pré-inscrição do Distrito Único Andaluz.', fontes: ['O3', 'O8'] },
  matricula: { ...ES, onde: 'Na sede eletrônica ou na secretaria da universidade espanhola.', quando: 'Depois do resultado da admissão, dentro do prazo de matrícula.', fontes: ['O3', 'O10'] },
  financeira: { apostila: 'nao', traducao: 'talvez', quando: 'Com meses de antecedência ao pedido do visto.', fontes: ['O6', 'O21'] },
  visto: { ...BR, quando: 'Depois da admissão, antes do agendamento no consulado.', fontes: ['O6', 'O21'] },
  saude: { apostila: 'nao', traducao: 'talvez', quando: 'Antes do pedido do visto (seguro e atestado) ou antes da viagem.', fontes: ['O6'] },
  moradia: { ...ES, quando: 'Quando escolher onde vai morar, antes da viagem.', fontes: ['M'] },
  viagem: { ...ES, quando: 'Nas semanas antes do embarque.', fontes: ['M'] },
  empadronamiento: { ...ES, onde: 'No ayuntamiento (prefeitura) da cidade onde você mora na Espanha.', quando: 'Logo depois de chegar e ter um endereço.', fontes: ['M'] },
  'nie-tie': { ...ES, onde: 'Na Policía Nacional (Oficina de Extranjería), com cita previa (agendamento).', quando: 'No prazo de um mês desde a entrada na Espanha, para estadas acima de seis meses.', fontes: ['O6', 'O19', 'O20'] },
  'universidade-es': { ...ES, onde: 'Na sede eletrônica ou na secretaria da universidade.', quando: 'Durante o curso, quando a universidade pedir.', fontes: ['O10'] },
  banco: { ...ES, onde: 'No banco escolhido, na Espanha.', quando: 'Depois de chegar, ao abrir a conta.', fontes: ['M'] },
  trabalho: { ...ES, quando: 'Antes de começar a trabalhar ou estagiar.', fontes: ['O6', 'O25'] },
  familiares: { ...BR, quando: 'Junto com o seu pedido de visto.', fontes: ['O6', 'O21'] },
  complementar: { apostila: 'talvez', traducao: 'talvez', quando: 'Quando o caso se aplicar a você.', fontes: ['M'] },
  renovacao: { ...ES, onde: 'Na Oficina de Extranjería da sua província, pelo procedimento indicado na fonte oficial.', quando: 'Antes de a autorização atual vencer (confira o prazo na fonte oficial).', fontes: ['O6'] },
};

// ---------------------------------------------------------------------------
// Tipos de documento (canônicos). Campos: oque · para · onde · quando · apostila · traducao · validade · partes
// (frente/verso) · multiplos · fontes · missoes (missões que o usam além das de rounds.js) · agregado · atendidoPor.
// ---------------------------------------------------------------------------
export const DOC_TYPES = [];
const T = (id, categoria, nome, o = {}) => DOC_TYPES.push({ id, categoria, nome, ...o });

// ===== 1. Documentos pessoais =====
T('passaporte', 'pessoais', 'Passaporte válido', { icone: 'passport', validade: 'data', fontes: ['O23', 'O21'],
  oque: 'Seu documento de viagem, emitido pela Polícia Federal. Ele identifica você na candidatura, no visto, na viagem e na TIE.',
  para: 'Identificar você em todos os procedimentos e receber o visto colado nele.',
  onde: 'Na Polícia Federal: agende pelo gov.br, pague a taxa (GRU) e compareça ao atendimento.',
  quando: 'O quanto antes: a validade precisa cobrir toda a estadia, e a emissão leva algumas semanas. Para o visto, confirme também páginas em branco e eventual limite para a data de emissão na página do seu consulado.',
  apostila: 'nao', traducao: 'nao' });
T('rg-cin', 'pessoais', 'RG ou Carteira de Identidade Nacional (CIN)', { icone: 'user', partes: ['frente', 'verso'], apostila: 'nao', traducao: 'nao',
  oque: 'Seu documento de identidade brasileiro.', para: 'Identificação complementar quando um procedimento pedir.', onde: 'No órgão de identificação do seu estado.' });
T('cpf', 'pessoais', 'CPF brasileiro', { icone: 'user', apostila: 'nao', traducao: 'nao', fontes: ['O26'],
  oque: 'Seu número de cadastro na Receita Federal.', para: 'Útil para trâmites no Brasil feitos à distância (bancos, procurações, impostos).', onde: 'Consulta e comprovante no site da Receita Federal.' });
T('certidao-nascimento', 'pessoais', 'Certidão de nascimento', { icone: 'file', validade: 'recencia',
  oque: 'O registro civil do seu nascimento.', para: 'Comprovar filiação ou dados civis quando o procedimento pedir.', onde: 'No cartório de registro civil onde você foi registrado(a) (há pedido online em muitos estados).' });
T('certidao-casamento', 'pessoais', 'Certidão de casamento', { icone: 'file', validade: 'recencia',
  oque: 'O registro civil do casamento.', para: 'Comprovar o vínculo com o cônjuge (ex.: visto de acompanhante) ou mudança de nome.', onde: 'No cartório de registro civil onde o casamento foi registrado.' });
T('uniao-estavel', 'pessoais', 'Comprovação de união estável', { icone: 'file', validade: 'recencia',
  oque: 'Escritura ou registro da união estável.', para: 'Comprovar o vínculo com o companheiro ou a companheira.', onde: 'Em cartório de notas (escritura) ou registro civil.' });
T('comprovante-residencia-br', 'pessoais', 'Comprovante de residência no Brasil', { icone: 'home', validade: 'recencia', missoes: ['5.1', '5.3'], traducao: 'nao', apostila: 'nao',
  oque: 'Conta ou documento recente no seu nome com o seu endereço no Brasil.', para: 'Mostrar ao consulado que você mora na área que ele atende (jurisdição consular).',
  onde: 'Conta de água, luz, telefone ou outro documento aceito pelo seu consulado.', quando: 'Perto do pedido do visto: o consulado pode exigir que seja recente.' });
T('foto-visto', 'pessoais', 'Fotografia recente para o visto', { icone: 'user', prepara: '5.7', missoes: ['5.3', '5.7'], apostila: 'nao', traducao: 'nao',
  oque: 'Foto colorida, recente, no padrão pedido pelo consulado.', para: 'Acompanhar o formulário do visto nacional.',
  onde: 'Em um estúdio de fotos para documentos. Confira o tamanho e o fundo exigidos pelo seu consulado.', quando: 'Perto do pedido do visto.' });
T('nie-existente', 'pessoais', 'NIE espanhol (se já tiver)', { icone: 'file', apostila: 'nao', traducao: 'nao',
  oque: 'O Número de Identidad de Extranjero, se você já recebeu um antes.', para: 'Informar nos formulários espanhóis: o número é o mesmo para sempre.', onde: 'Em documentos espanhóis anteriores (TIE antigo, resolução, certificado de NIE).' });
T('procuracao', 'pessoais', 'Procuração de representante', { icone: 'edit',
  oque: 'Documento que autoriza outra pessoa a agir em seu nome.', para: 'Quando alguém precisar fazer um trâmite por você.', onde: 'Em cartório de notas; para uso na Espanha, confira se o órgão exige apostila e tradução.' });
T('id-representante', 'pessoais', 'Documento de identificação do representante', { icone: 'user', apostila: 'nao',
  oque: 'Documento de identidade de quem vai representar você.', para: 'Acompanhar a procuração no trâmite.', onde: 'Com o próprio representante.' });
T('mudanca-nome', 'pessoais', 'Comprovante de mudança de nome', { icone: 'edit',
  oque: 'Documento que liga o seu nome atual ao nome que aparece em documentos antigos.', para: 'Evitar que diferenças de nome travem um procedimento.', onde: 'Certidão de casamento averbada ou decisão de retificação, no cartório.' });

// ===== 2. Documentos acadêmicos brasileiros =====
T('diploma', 'academicos', 'Diploma de graduação', { icone: 'cap', partes: ['frente', 'verso'],
  oque: 'O documento oficial da sua universidade brasileira que comprova que você concluiu a graduação.',
  para: 'Comprovar a formação superior exigida para concorrer ao mestrado.',
  quando: 'Antes de iniciar a candidatura ao mestrado.',
  apostilaNota: 'Pode ser exigida na matrícula definitiva, conforme a universidade.', traducaoNota: 'Depende das regras do procedimento e da instituição.' });
T('certidao-conclusao', 'academicos', 'Certidão de conclusão da graduação', { icone: 'file', missoes: ['2.2'],
  oque: 'Declaração da faculdade de que você concluiu o curso, enquanto o diploma não sai.', para: 'Substituir o diploma na candidatura, quando a convocatória aceitar.' });
T('historico', 'academicos', 'Histórico escolar completo da graduação', { icone: 'book',
  oque: 'O documento da faculdade com as disciplinas cursadas, notas e carga horária.', para: 'Calcular a sua nota média e avaliar a sua formação na candidatura.' });
T('escala-notas', 'academicos', 'Declaração oficial da escala de notas', { icone: 'scale',
  oque: 'Declaração da faculdade explicando a nota mínima, a máxima e a de aprovação do seu histórico.', para: 'Permitir converter a sua média para o sistema espanhol.' });
T('acesso-pos', 'academicos', 'Declaração de que a graduação permite acesso à pós-graduação no Brasil', { icone: 'unlock',
  oque: 'Declaração de que o seu título dá acesso a cursos de pós-graduação no Brasil.', para: 'Cumprir o requisito de acesso ao mestrado com título estrangeiro não homologado.',
  onde: 'Na sua universidade ou no órgão indicado na convocatória do ciclo.' });
T('media-final', 'academicos', 'Comprovação da média final da graduação', { icone: 'scale', atendidoPor: ['historico'], missoes: ['2.3'],
  oque: 'O documento que mostra a sua média final.', para: 'Ordenar os candidatos na adjudicação de vagas.' });
T('carga-horaria', 'academicos', 'Informação oficial de carga horária e créditos', { icone: 'clock', atendidoPor: ['historico'], missoes: ['2.3'],
  oque: 'A carga horária total e os créditos do curso.', para: 'Avaliar a equivalência da sua formação.' });
T('ementas', 'academicos', 'Ementas das disciplinas cursadas', { icone: 'book', missoes: ['2.4'],
  oque: 'O conteúdo programático de cada disciplina.', para: 'Quando a universidade quer avaliar a afinidade da sua formação com o mestrado.' });
T('grade-curricular', 'academicos', 'Grade curricular completa', { icone: 'book', missoes: ['2.4'],
  oque: 'A estrutura oficial do curso (disciplinas por período).', para: 'Complementar a análise da formação, quando pedida.' });
T('tcc-info', 'academicos', 'Comprovação das informações do TCC', { icone: 'edit',
  oque: 'Declaração ou documento com título, nota e orientador do seu TCC.', para: 'Quando o programa considera o trabalho de conclusão na avaliação.' });
T('equivalencia-nota', 'academicos', 'Declaração de equivalência de nota média ao sistema espanhol', { icone: 'scale', apostila: 'nao', traducao: 'nao',
  oque: 'Declaração que converte a sua média para a escala espanhola (0 a 10).',
  para: 'Ajuda a mostrar a sua média no padrão espanhol; confira se o seu mestrado pede.',
  onde: 'Procedimento online do governo espanhol (Ministério responsável pelas universidades). Confira o procedimento vigente.' });
T('outros-diplomas', 'academicos', 'Diplomas de outras graduações', { icone: 'cap', multiplos: true,
  oque: 'Diplomas de outros cursos superiores que você concluiu.', para: 'Quando você quer que outra formação seja considerada.' });
T('outros-historicos', 'academicos', 'Históricos de outras graduações', { icone: 'book', multiplos: true,
  oque: 'Históricos dos outros cursos superiores.', para: 'Acompanhar os diplomas adicionais.' });
T('apostilas-academicas', 'academicos', 'Apostilas da Haia dos documentos acadêmicos', { icone: 'shield', agregado: ['diploma', 'historico', 'escala-notas', 'acesso-pos', 'certidao-conclusao'], fontes: ['O18'],
  oque: 'A apostila é o selo que torna um documento público brasileiro válido na Espanha.', para: 'Só quando a universidade ou o procedimento pedir. Anexe a apostila dentro de cada documento.' });
T('traducoes-academicas', 'academicos', 'Traduções oficiais ou juramentadas dos documentos acadêmicos', { icone: 'lang', agregado: ['diploma', 'historico', 'escala-notas', 'acesso-pos', 'certidao-conclusao'], fontes: ['O24'],
  oque: 'Tradução para o espanhol feita por tradutor reconhecido.', para: 'Só quando a universidade ou o procedimento pedir. Anexe a tradução dentro de cada documento.' });

// ===== 3. Candidatura ao mestrado =====
T('formulario-dua', 'candidatura', 'Formulário de pré-inscrição no Distrito Único Andaluz', { icone: 'edit', prepara: '3.6', missoes: ['3.3', '3.6'], apostila: 'nao', traducao: 'nao', fontes: ['O8', 'O5'],
  oque: 'A sua solicitação de vaga, preenchida no portal do Distrito Único Andaluz (DUA).', para: 'Concorrer às vagas dos mestrados escolhidos.',
  onde: 'Online, no portal do Distrito Único Andaluz. Não há papel para baixar antes: o comprovante sai ao enviar.', quando: 'Dentro da fase de pré-inscrição do calendário oficial.' });
T('documentacao-academica-candidatura', 'candidatura', 'Documentação acadêmica exigida pela candidatura', { icone: 'cap', agregado: ['diploma', 'historico', 'escala-notas', 'acesso-pos'],
  oque: 'O conjunto de documentos acadêmicos anexado à pré-inscrição.', para: 'Ver de uma vez se o que a candidatura pede está pronto.' });
T('comprovante-dua', 'candidatura', 'Comprovante de envio da pré-inscrição', { icone: 'check', apostila: 'nao', traducao: 'nao',
  oque: 'O recibo que prova que a sua candidatura foi enviada.', para: 'Ter prova do envio caso algo dê errado.', onde: 'Baixe no portal do DUA logo depois de enviar.', quando: 'No mesmo dia do envio.' });
T('curriculo', 'candidatura', 'Currículo acadêmico ou profissional', { icone: 'user', missoes: ['2.6'], apostila: 'nao',
  oque: 'O seu currículo, no formato pedido pelo programa.', para: 'Quando o mestrado avalia trajetória acadêmica e profissional.', onde: 'Você mesmo(a) escreve; em espanhol, salvo indicação contrária.' });
T('carta-motivacao', 'candidatura', 'Carta de motivação', { icone: 'mail', missoes: ['2.6'], apostila: 'nao',
  oque: 'Texto explicando por que você quer fazer aquele mestrado.', para: 'Quando o programa pede (ver a ficha oficial).', onde: 'Você mesmo(a) escreve.' });
T('cartas-recomendacao', 'candidatura', 'Cartas de recomendação', { icone: 'mail', multiplos: true, missoes: ['2.6'], apostila: 'nao',
  oque: 'Cartas de professores ou empregadores recomendando você.', para: 'Quando o programa pede.', onde: 'Peça a professores ou chefes com antecedência.' });
T('idioma', 'candidatura', 'Certificado de espanhol', { icone: 'lang', validade: 'data', apostila: 'nao', traducao: 'nao', fontes: ['O3', 'O10'],
  oque: 'O certificado que comprova o seu nível de espanhol (ex.: DELE ou SIELE).', para: 'Cumprir o nível exigido pelo mestrado, quando ele exige.',
  onde: 'Provas DELE ou SIELE (Instituto Cervantes e centros credenciados). Confira na ficha quais certificados são aceitos.', quando: 'Com meses de antecedência: as provas têm datas fixas.' });
T('certificado-ingles', 'candidatura', 'Certificado de inglês', { icone: 'lang', validade: 'data', missoes: ['2.5'], apostila: 'nao', traducao: 'nao',
  oque: 'Certificado de nível de inglês aceito pelo programa.', para: 'Só quando o mestrado exige inglês.', onde: 'Em centros de prova reconhecidos pelo programa.' });
T('portfolio', 'candidatura', 'Portfólio acadêmico ou profissional', { icone: 'folder', apostila: 'nao', missoes: ['2.6'],
  oque: 'Conjunto de trabalhos que mostra a sua produção.', para: 'Comum em áreas criativas ou técnicas, quando pedido.', onde: 'Você mesmo(a) organiza.' });
T('cursos-complementares', 'candidatura', 'Certificados de cursos complementares', { icone: 'trophy', multiplos: true,
  oque: 'Certificados de cursos, idiomas ou formações extras.', para: 'Quando o programa pontua formação complementar.', onde: 'Com as instituições que ofereceram os cursos.' });
T('experiencia-profissional', 'candidatura', 'Comprovantes de experiência profissional', { icone: 'flag', multiplos: true,
  oque: 'Carteira de trabalho, declarações ou contratos que comprovem experiência.', para: 'Quando o programa pontua experiência.', onde: 'Com os empregadores ou na carteira de trabalho digital.' });
T('publicacoes', 'candidatura', 'Publicações científicas', { icone: 'book', multiplos: true, apostila: 'nao',
  oque: 'Artigos ou trabalhos publicados.', para: 'Quando o programa avalia produção científica.', onde: 'Nas revistas ou anais em que foram publicados.' });
T('projetos-pesquisa', 'candidatura', 'Projetos de pesquisa anteriores', { icone: 'search', apostila: 'nao',
  oque: 'Comprovantes de participação em pesquisa (iniciação científica etc.).', para: 'Quando o programa valoriza pesquisa.', onde: 'Com o orientador ou a pró-reitoria de pesquisa.' });
T('proposta-pesquisa', 'candidatura', 'Proposta de pesquisa', { icone: 'edit', apostila: 'nao', traducao: 'nao',
  oque: 'Texto com o tema que você pretende pesquisar.', para: 'Mestrados de pesquisa podem pedir.', onde: 'Você mesmo(a) escreve, de preferência com orientação.' });
T('especificos', 'candidatura', 'Documentos de requisitos específicos do programa', { icone: 'edit', fontes: ['O3', 'O10'],
  oque: 'Qualquer documento extra que a ficha oficial do seu mestrado pedir.', para: 'Cumprir requisitos próprios do programa.', onde: 'Veja a ficha oficial do programa.' });
T('condicoes-especiais', 'candidatura', 'Documentação para reserva de vagas ou condições especiais', { icone: 'shield',
  oque: 'Laudos ou certificados que dão direito a cotas ou adaptações.', para: 'Concorrer pela reserva de vagas (ex.: deficiência), quando aplicável.', onde: 'Com o órgão que reconhece a condição; confira o que a convocatória aceita.' });

// ===== 4. Admissão e matrícula =====
T('admissao', 'matricula', 'Carta oficial de admissão ao mestrado', { icone: 'mail',
  oque: 'A carta da universidade confirmando que você foi admitido(a).', para: 'Comprovar a admissão no consulado e na viagem.', onde: 'Na sede eletrônica da universidade ou com a secretaria do mestrado.' });
T('aceitacao-vaga', 'matricula', 'Confirmação de aceitação da vaga', { icone: 'check', missoes: ['4.3'],
  oque: 'O registro de que você aceitou a vaga oferecida.', para: 'Não perder a vaga na adjudicação.', onde: 'No portal do DUA ou da universidade, conforme o procedimento.' });
T('reserva-vaga', 'matricula', 'Comprovante de reserva da vaga', { icone: 'check', missoes: ['4.3'],
  oque: 'Comprovante de que a vaga ficou reservada (às vezes com pagamento).', para: 'Garantir a vaga até a matrícula.' });
T('comprovante-matricula', 'matricula', 'Comprovante de matrícula universitária', { icone: 'file', prepara: '4.6', missoes: ['4.6', '4.7'],
  oque: 'O documento da universidade que confirma que você está matriculado(a).', para: 'Visto, residência estudantil, TIE e banco pedem.' });
T('comprovante-pagamento', 'matricula', 'Comprovante de pagamento das taxas de matrícula', { icone: 'euro',
  oque: 'O comprovante de que a matrícula (ou a reserva) foi paga.', para: 'Comprovar a matrícula no consulado.', onde: 'Baixe depois de pagar pelo canal indicado pela universidade.' });
T('documentacao-original', 'matricula', 'Documentação acadêmica original ou autenticada para a matrícula', { icone: 'cap', agregado: ['diploma', 'historico', 'escala-notas', 'acesso-pos'],
  oque: 'Os documentos acadêmicos na forma que a universidade exigir na matrícula definitiva.', para: 'A universidade pode conferir os originais ou cópias autenticadas.' });
T('bolsa-isencao', 'matricula', 'Comprovante de bolsa ou isenção de taxas', { icone: 'trophy',
  oque: 'Documento que dá desconto ou isenção nas taxas.', para: 'Aplicar o desconto na matrícula.' });
T('seguro-escolar', 'matricula', 'Comprovante de seguro escolar', { icone: 'shield',
  oque: 'O seguro escolar que algumas universidades cobram junto com a matrícula.', para: 'Quando a universidade incluir na matrícula.' });
T('tempo-parcial', 'matricula', 'Solicitação de matrícula em tempo parcial', { icone: 'clock',
  oque: 'Pedido para cursar com menos créditos por ano.', para: 'Só se você optar por tempo parcial (confira o efeito no visto).' });
T('reconhecimento-creditos', 'matricula', 'Documentação de reconhecimento de créditos', { icone: 'scale',
  oque: 'Pedido e documentos para aproveitar créditos já cursados.', para: 'Só se você pedir reconhecimento de créditos.' });

// ===== 5. Documentação financeira =====
T('meios', 'financeira', 'Comprovação de recursos suficientes para a estadia', { icone: 'euro', missoes: ['9.8'],
  oque: 'O conjunto de documentos que mostra que você tem como se manter durante os estudos.', para: 'Exigência do visto de estudos.',
  onde: 'Escolha os meios aceitos pelo seu consulado (extratos, bolsa, patrocinador…). Veja no planejador quanto falta.' });
T('extratos', 'financeira', 'Extratos bancários recentes', { icone: 'euro', validade: 'recencia', missoes: ['5.4', '9.8'],
  oque: 'Extratos da sua conta com saldo e movimentação.', para: 'Um dos meios de comprovar recursos.', onde: 'No seu banco (aplicativo ou agência).', quando: 'Perto do pedido do visto: costuma-se pedir extratos recentes.' });
T('declaracao-bancaria', 'financeira', 'Declaração bancária de saldo e titularidade', { icone: 'euro', validade: 'recencia', missoes: ['5.4'],
  oque: 'Carta do banco confirmando que a conta é sua e o saldo.', para: 'Complementar os extratos quando o consulado pedir.', onde: 'No seu banco.' });
T('investimentos', 'financeira', 'Comprovantes de investimentos financeiros disponíveis', { icone: 'euro',
  oque: 'Extratos de aplicações que podem ser resgatadas.', para: 'Pode reforçar a comprovação, conforme o consulado.', onde: 'No banco ou na corretora.' });
T('imposto-renda', 'financeira', 'Declaração de Imposto de Renda', { icone: 'file',
  oque: 'A sua declaração (ou a do patrocinador) e o recibo de entrega.', para: 'Mostrar renda e origem dos recursos, quando pedido.', onde: 'No programa ou no site da Receita Federal.' });
T('contracheques', 'financeira', 'Contracheques ou comprovantes salariais', { icone: 'euro', multiplos: true,
  oque: 'Os seus comprovantes de salário.', para: 'Comprovar renda própria, quando esse for o meio escolhido.', onde: 'Com o seu empregador.' });
T('contrato-trabalho-br', 'financeira', 'Contrato de trabalho ou de prestação de serviços', { icone: 'file',
  oque: 'O contrato que mostra a sua fonte de renda.', para: 'Complementar a comprovação de renda.', onde: 'Com o empregador ou cliente.' });
T('contas-internacionais', 'financeira', 'Extratos de contas internacionais (ex.: Wise)', { icone: 'globe', validade: 'recencia',
  oque: 'Extratos de contas em outras moedas.', para: 'Mostrar recursos já disponíveis em euro; aceitação depende do consulado.', onde: 'No aplicativo da instituição.' });
T('carta-bolsa', 'financeira', 'Carta de concessão de bolsa de estudos', { icone: 'trophy', fontes: ['O12', 'O13'],
  oque: 'A carta oficial que confirma a sua bolsa, o valor e a duração.', para: 'Comprovar recursos no visto e, às vezes, isenção de taxas.', onde: 'No portal da entidade que concedeu a bolsa.' });
T('recebimento-bolsa', 'financeira', 'Comprovantes de recebimento da bolsa', { icone: 'euro', multiplos: true,
  oque: 'Comprovantes dos pagamentos da bolsa.', para: 'Mostrar que a bolsa está sendo paga, quando pedido.', onde: 'Extratos ou portal da entidade.' });
T('apoio-familiar', 'financeira', 'Declaração de responsabilidade financeira do patrocinador', { icone: 'users',
  oque: 'Declaração de quem vai pagar as suas despesas (familiar ou outra pessoa).', para: 'Quando o seu sustento vem de outra pessoa. O consulado define o modelo e se aceita.',
  onde: 'O patrocinador assina; confira se o consulado exige reconhecimento de firma, apostila ou tradução.' });
T('extratos-patrocinador', 'financeira', 'Extratos bancários do patrocinador', { icone: 'euro', validade: 'recencia',
  oque: 'Extratos da conta de quem vai apoiar você.', para: 'Comprovar que o patrocinador tem os recursos.', onde: 'Com o patrocinador (banco dele).' });
T('renda-patrocinador', 'financeira', 'Comprovantes de renda do patrocinador', { icone: 'euro',
  oque: 'Contracheques, declaração de IR ou pró-labore do patrocinador.', para: 'Mostrar a renda de quem apoia você.', onde: 'Com o patrocinador.' });
T('id-patrocinador', 'financeira', 'Documento de identificação do patrocinador', { icone: 'user', apostila: 'nao',
  oque: 'Documento de identidade de quem vai apoiar você.', para: 'Acompanhar a declaração de responsabilidade.', onde: 'Com o patrocinador.' });
T('vinculo-familiar', 'financeira', 'Comprovante do vínculo familiar com o patrocinador', { icone: 'users',
  oque: 'Certidão que mostra o parentesco (ex.: nascimento).', para: 'Quando o consulado aceita apoio de familiar e pede a prova do vínculo.', onde: 'No cartório de registro civil.' });
T('origem-recursos', 'financeira', 'Comprovante da origem dos recursos', { icone: 'search',
  oque: 'Documento que explica de onde veio o dinheiro (venda, doação, herança…).', para: 'Só quando o órgão solicitar.' });
T('alojamento-pago', 'financeira', 'Comprovante de alojamento integralmente pago', { icone: 'home',
  oque: 'Recibo de moradia já paga pelo período.', para: 'Alguns consulados consideram moradia paga na comprovação. Confira no seu.' });

// ===== 6. Visto de estudante =====
T('formulario', 'visto', 'Formulário oficial de visto nacional', { icone: 'edit', prepara: '5.7', apostila: 'nao', traducao: 'nao',
  oque: 'O formulário de pedido do visto nacional (tipo D) de estudos, preenchido e assinado.', para: 'É o próprio pedido do visto.', onde: 'Na página de vistos do SEU consulado.' });
T('antecedentes', 'visto', 'Certidão de antecedentes criminais da Polícia Federal', { icone: 'shield', validade: 'recencia', fontes: ['O6', 'O22'],
  oque: 'A certidão de que você não tem antecedentes criminais no Brasil.', para: 'A exigência e o limite de duração variam conforme a regra migratória e a lista do consulado competente. Confira a instrução vigente do seu consulado.',
  onde: 'Emita gratuitamente no gov.br (Polícia Federal). Confira se o consulado também pede a estadual.',
  quando: 'Perto do pedido do visto: o consulado pode aceitar só certidões recentes.',
  apostilaNota: 'Costuma ser exigida para uso na Espanha: confira na lista do seu consulado.', traducaoNota: 'Confira na lista do seu consulado.' });
T('antecedentes-outros-paises', 'visto', 'Certidões criminais de outros países de residência', { icone: 'shield', validade: 'recencia', multiplos: true,
  oque: 'Certidões dos países onde você morou nos últimos anos.', para: 'Quando o consulado pedir, conforme os países e o período de residência.', onde: 'Nos órgãos de cada país (geralmente pelo consulado dele).' });
T('atestado', 'visto', 'Atestado médico (Regulamento Sanitário Internacional de 2005)', { icone: 'help', validade: 'recencia',
  oque: 'Atestado de que você não tem doenças com repercussão grave para a saúde pública, nos termos do Regulamento Sanitário Internacional de 2005.',
  para: 'A exigência e o limite de duração dependem da regra vigente e da lista do consulado competente.', onde: 'Com um médico registrado, usando o texto pedido pelo consulado.' });
T('taxa-visto', 'visto', 'Comprovante de pagamento da taxa do visto', { icone: 'euro', prepara: '5.7', missoes: ['5.7'], ...ES,
  oque: 'O recibo da taxa consular.', para: 'O visto só é processado com a taxa paga.', onde: 'Conforme as instruções do consulado (valor e forma mudam).' });
T('agendamento-consular', 'visto', 'Comprovante de agendamento consular', { icone: 'calendar', missoes: ['5.7'], ...ES,
  oque: 'A confirmação do seu horário no consulado.', para: 'Quando o consulado atende com agendamento.', onde: 'No sistema de agendamento indicado pelo consulado.' });
T('apostilas-visto', 'visto', 'Apostilas dos documentos exigidos para o visto', { icone: 'shield', agregado: ['antecedentes', 'atestado', 'certidao-casamento', 'uniao-estavel', 'certidao-nascimento', 'apoio-familiar'], fontes: ['O18'],
  oque: 'As apostilas que o consulado pedir.', para: 'Só para os documentos que a lista do seu consulado indicar. Anexe a apostila dentro de cada documento.' });
T('traducoes', 'visto', 'Traduções oficiais exigidas para o visto', { icone: 'lang', agregado: ['antecedentes', 'atestado', 'certidao-casamento', 'uniao-estavel', 'certidao-nascimento', 'apoio-familiar', 'extratos'], fontes: ['O24'],
  oque: 'As traduções que o consulado pedir.', para: 'Só quando a lista do seu consulado pedir. Anexe a tradução dentro de cada documento.' });
T('autorizacao-menor', 'visto', 'Autorização dos responsáveis (menores de idade)', { icone: 'users',
  oque: 'Autorização dos pais ou responsáveis para o pedido do visto.', para: 'Obrigatória para menores de 18 anos.', onde: 'Em cartório, conforme o modelo do consulado.' });
T('complementar-consulado', 'visto', 'Documentação complementar solicitada pelo consulado', { icone: 'mail', multiplos: true,
  oque: 'Qualquer documento extra que o consulado pedir durante a análise.', para: 'Responder a pedidos do consulado.' });

// ===== 7. Saúde e seguro médico =====
T('seguro', 'saude', 'Certificado do seguro médico válido na Espanha', { icone: 'shield', validade: 'data', missoes: ['5.5'], apostila: 'nao',
  oque: 'O certificado do seguro saúde que cobre você durante toda a estadia na Espanha.', para: 'Exigido para o visto e útil em qualquer atendimento.',
  onde: 'Com a seguradora. Confira com o consulado as coberturas exigidas.' });
T('apolice-seguro', 'saude', 'Apólice completa do seguro', { icone: 'file', missoes: ['5.5'], apostila: 'nao',
  oque: 'O contrato completo do seguro.', para: 'Alguns consulados pedem a apólice além do certificado.', onde: 'Com a seguradora.' });
T('pagamento-seguro', 'saude', 'Comprovante de pagamento do seguro', { icone: 'euro', missoes: ['5.5'], ...ES,
  oque: 'Comprovante de que o seguro foi pago.', para: 'Quando o consulado pede prova de que o seguro está vigente e quitado.', onde: 'Com a seguradora.' });
T('historico-medico', 'saude', 'Histórico médico pessoal', { icone: 'help', apostila: 'nao',
  oque: 'Resumo das suas condições de saúde.', para: 'Ajuda médicos na Espanha a entender o seu caso.', onde: 'Com os seus médicos.' });
T('relatorios-medicos', 'saude', 'Relatórios de tratamentos em acompanhamento', { icone: 'help', apostila: 'nao', multiplos: true,
  oque: 'Laudos e relatórios de tratamentos em curso.', para: 'Continuar o tratamento na Espanha.', onde: 'Com os seus médicos.' });
T('receitas', 'saude', 'Receitas de medicamentos de uso contínuo', { icone: 'file', apostila: 'nao', multiplos: true,
  oque: 'Receitas dos remédios que você usa sempre.', para: 'Levar na viagem e mostrar ao médico na Espanha.', onde: 'Com o seu médico.' });
T('medicamentos-controlados', 'saude', 'Autorizações para medicamentos controlados', { icone: 'alert', apostila: 'nao',
  oque: 'Receita e documentos para transportar medicamentos controlados.', para: 'Levar medicamentos controlados na bagagem de forma regular.', onde: 'Com o seu médico; confira as regras de entrada na Espanha.' });
T('carteira-vacinacao', 'saude', 'Carteira de vacinação', { icone: 'shield', apostila: 'nao', fontes: ['O27'],
  oque: 'O registro das suas vacinas.', para: 'Útil em atendimentos de saúde e em alguns trâmites.', onde: 'No posto de saúde ou no aplicativo do SUS.' });
T('civp', 'saude', 'Certificado Internacional de Vacinação ou Profilaxia (CIVP)', { icone: 'shield', apostila: 'nao', traducao: 'nao',
  oque: 'O certificado internacional de vacinas (ex.: febre amarela).', para: 'Só quando algum país do seu trajeto exigir.', onde: 'Emitido pelos serviços de saúde do Brasil, a partir do registro de vacinação.' });
T('seguro-odontologico', 'saude', 'Comprovante de seguro odontológico', { icone: 'shield', apostila: 'nao',
  oque: 'Seguro para tratamento dentário (o seguro saúde costuma não cobrir).', para: 'Opcional.', onde: 'Com a seguradora.' });
T('seguro-viagem', 'saude', 'Seguro complementar de viagem', { icone: 'plane', apostila: 'nao',
  oque: 'Seguro para bagagem, voos e imprevistos da viagem.', para: 'Opcional.', onde: 'Com a seguradora.' });

// ===== 8. Moradia =====
T('contrato-aluguel', 'moradia', 'Contrato de aluguel', { icone: 'home', missoes: ['6.2', '7.2'],
  oque: 'O contrato do lugar onde você vai morar.', para: 'Comprovar endereço (empadronamiento, banco) e garantir os seus direitos.', onde: 'Com o proprietário ou a imobiliária. Leia antes de pagar.' });
T('reserva-residencia', 'moradia', 'Reserva de residência universitária', { icone: 'home', missoes: ['6.2'],
  oque: 'A confirmação da vaga em residência (colegio mayor ou residência).', para: 'Garantir moradia e, às vezes, comprovar alojamento.', onde: 'Com a residência.' });
T('reserva-hotel', 'moradia', 'Reserva de hotel ou hostel', { icone: 'home', missoes: ['6.5'],
  oque: 'Reserva para os primeiros dias.', para: 'Ter onde ficar enquanto procura moradia.', onde: 'No site da reserva.' });
T('comprovante-moradia', 'moradia', 'Comprovante de moradia ou reserva de alojamento', { icone: 'home',
  oque: 'Contrato ou reserva do lugar onde você vai morar ao chegar.', para: 'Usado na viagem e depois no empadronamiento.', onde: 'Guarde assim que a moradia estiver escolhida (Meu novo lar).' });
T('comprovante-renda', 'moradia', 'Comprovante de renda (para o proprietário)', { icone: 'euro',
  oque: 'Documento de renda pedido pelo proprietário.', para: 'Alguns proprietários pedem antes de alugar.' });
T('fiador-docs', 'moradia', 'Documentação do fiador', { icone: 'users',
  oque: 'Documentos de quem vai garantir o aluguel (aval).', para: 'Quando o proprietário exige fiador.' });
T('fiador-renda', 'moradia', 'Comprovantes de renda do fiador', { icone: 'euro',
  oque: 'Renda de quem vai garantir o aluguel.', para: 'Quando o proprietário exige fiador.' });
T('caucao', 'moradia', 'Comprovante de pagamento da caução (fianza)', { icone: 'euro',
  oque: 'Recibo da caução paga ao proprietário.', para: 'Recuperar a caução ao sair.', onde: 'Peça recibo de todo pagamento.' });
T('inventario', 'moradia', 'Inventário de entrada no imóvel', { icone: 'edit', missoes: ['7.2'],
  oque: 'Lista do que há no imóvel e do estado de cada coisa.', para: 'Evitar descontos indevidos na caução.', onde: 'Faça com o proprietário no dia da entrada.' });
T('fotos-vistoria', 'moradia', 'Fotografias de vistoria do imóvel', { icone: 'search', multiplos: true, missoes: ['7.2'],
  oque: 'Fotos do imóvel no dia da entrada.', para: 'Provar o estado do imóvel.', onde: 'Tire você mesmo(a), com data.' });
T('recibos-aluguel', 'moradia', 'Recibos de pagamentos de aluguel', { icone: 'euro', multiplos: true,
  oque: 'Comprovantes de cada aluguel pago.', para: 'Provar pagamentos e, às vezes, residência.', onde: 'Transferências bancárias ou recibos do proprietário.' });
T('autorizacao-empadronamiento', 'moradia', 'Autorização do proprietário para o empadronamiento', { icone: 'edit',
  oque: 'Autorização de quem pode permitir o registro no endereço.', para: 'Quando o seu nome não está no contrato ou o ayuntamiento pede.', onde: 'Com o proprietário ou o titular do contrato.' });
T('carta-hospedagem', 'moradia', 'Carta de hospedagem de familiar ou amigo', { icone: 'mail',
  oque: 'Declaração de quem vai hospedar você.', para: 'Quando você vai ficar na casa de alguém.', onde: 'Com quem vai hospedar.' });
T('contato-alojamento', 'moradia', 'Endereço e contato do primeiro alojamento', { icone: 'pin', apostila: 'nao', traducao: 'nao',
  oque: 'Endereço completo e telefone de onde você vai ficar ao chegar.', para: 'Pode ser pedido na entrada no país e é útil no primeiro dia.', onde: 'Anote aqui (sem documentos sensíveis).' });

// ===== 9. Viagem =====
T('visto', 'viagem', 'Visto nacional de estudante', { icone: 'passport', validade: 'data', apostila: 'nao', traducao: 'nao',
  oque: 'O visto colado no seu passaporte, que permite entrar na Espanha para estudar.', para: 'Entrar no país como estudante.', onde: 'Retire no consulado; confira nome, número do passaporte, tipo e datas.' });
T('passagem', 'viagem', 'Bilhete aéreo de ida', { icone: 'plane', prepara: '6.3',
  oque: 'O seu bilhete e o localizador da reserva.', para: 'Embarcar.', onde: 'No e-mail da companhia ou agência (veja Minha viagem).' });
T('cartao-embarque', 'viagem', 'Cartão de embarque', { icone: 'plane', missoes: ['6.4'],
  oque: 'O cartão emitido no check-in.', para: 'Embarcar e, depois, provar a data de entrada.', quando: 'No check-in (normalmente 24 a 48 h antes).' });
T('transito', 'viagem', 'Documentos de trânsito de países de conexão', { icone: 'globe', missoes: ['6.4'],
  oque: 'Vistos ou autorizações de trânsito, se o país da conexão exigir.', para: 'Fazer a conexão sem problemas.', onde: 'Confira com a companhia aérea e o consulado do país da conexão.' });
T('bilhetes-terrestres', 'viagem', 'Bilhetes de ônibus ou trem até a cidade de destino', { icone: 'map', missoes: ['6.5'],
  oque: 'Bilhetes do aeroporto até a sua cidade.', para: 'Organizar a chegada.' });
T('passagem-retorno', 'viagem', 'Passagem de retorno (se comprada)', { icone: 'plane',
  oque: 'O bilhete de volta, se você já comprou.', para: 'Opcional.' });
T('bagagem', 'viagem', 'Comprovantes de bagagem despachada', { icone: 'luggage',
  oque: 'As etiquetas e o comprovante das malas despachadas.', para: 'Reclamar em caso de extravio.', quando: 'No embarque.' });
T('declaracao-alfandegaria', 'viagem', 'Declarações alfandegárias', { icone: 'file',
  oque: 'Declaração de bens ou valores na alfândega.', para: 'Quando você levar valores ou bens acima dos limites.' });
T('animais', 'viagem', 'Documentação para transportar animais', { icone: 'file',
  oque: 'Certificados sanitários e de vacinação do animal.', para: 'Levar o seu animal de estimação.', onde: 'Com o veterinário e o órgão sanitário; confira as regras de entrada na União Europeia.' });
T('autorizacao-viagem-menor', 'viagem', 'Autorização de viagem de menores', { icone: 'users',
  oque: 'Autorização para menor viajar.', para: 'Obrigatória para menores, conforme as regras brasileiras.', onde: 'Em cartório ou no passaporte, conforme as regras vigentes.' });
T('copias-digitais', 'viagem', 'Cópias digitais dos documentos importantes', { icone: 'folder', apostila: 'nao', traducao: 'nao',
  oque: 'Cópias digitais dos seus documentos principais.', para: 'Ter acesso se algo for perdido.', onde: 'A sua pasta da Estuvia já guarda os arquivos cifrados.' });
T('copias-impressas', 'viagem', 'Cópias impressas dos documentos principais', { icone: 'file', apostila: 'nao', traducao: 'nao',
  oque: 'Cópias em papel na bagagem de mão.', para: 'Mostrar sem depender do celular.' });

// ===== 10. Empadronamiento =====
T('form-empadronamiento', 'empadronamiento', 'Formulário municipal de empadronamiento', { icone: 'edit', missoes: ['7.9'],
  oque: 'O formulário de inscrição no Padrón municipal (o cadastro de moradores).', para: 'Pedir o registro do seu endereço.', onde: 'No site ou no atendimento do ayuntamiento.' });
T('comprovante-residencia-es', 'empadronamiento', 'Documento que comprova residência no endereço', { icone: 'home', missoes: ['7.9'],
  oque: 'Contrato, conta ou autorização que mostra que você mora ali.', para: 'O ayuntamiento confere antes de registrar.' });
T('conta-consumo', 'empadronamiento', 'Conta de água, eletricidade ou gás', { icone: 'file',
  oque: 'Conta do endereço.', para: 'Comprovar o endereço, conforme o ayuntamiento.' });
T('id-autorizador', 'empadronamiento', 'Documento de identidade de quem autoriza', { icone: 'user',
  oque: 'Identidade da pessoa que autoriza o seu registro.', para: 'Acompanhar a autorização.' });
T('situacao-cadastral', 'empadronamiento', 'Declaração de inscrição ou situação cadastral anterior', { icone: 'file',
  oque: 'Comprovante de registro em outro município.', para: 'Quando você muda de cidade dentro da Espanha.' });
T('escritura', 'empadronamiento', 'Escritura de propriedade', { icone: 'home',
  oque: 'Escritura do imóvel.', para: 'Quando o ayuntamiento pede prova de propriedade.' });
T('representacao-menores', 'empadronamiento', 'Documentação de representação de menores', { icone: 'users',
  oque: 'Documentos de quem representa o menor.', para: 'Para registrar filhos menores.' });
T('agendamento-padron', 'empadronamiento', 'Comprovante de agendamento no ayuntamiento', { icone: 'calendar',
  oque: 'A confirmação do seu horário.', para: 'Quando o atendimento é com agendamento.' });
T('empadronamiento', 'empadronamiento', 'Certificado de empadronamiento', { icone: 'pin', validade: 'recencia',
  oque: 'O certificado que mostra que você está registrado(a) no endereço.', para: 'Outros trâmites (TIE, banco, saúde) podem pedir.', onde: 'Emitido pelo ayuntamiento depois do registro.' });
T('volante-empadronamiento', 'empadronamiento', 'Volante de empadronamiento', { icone: 'file', validade: 'recencia',
  oque: 'Versão simples (informativa) do registro.', para: 'Alguns trâmites aceitam o volante no lugar do certificado.' });

// ===== 11. NIE e TIE =====
T('tie-solicitacao', 'nie-tie', 'Formulário EX-17', { icone: 'edit', fontes: ['O6', 'O19'],
  oque: 'O formulário oficial para pedir o cartão de estrangeiro (TIE).', para: 'Pedir a TIE.', onde: 'Baixe na fonte oficial do governo espanhol e preencha antes do atendimento.' });
T('foto-tie', 'nie-tie', 'Fotografia para a TIE', { icone: 'user', prepara: '8.4', missoes: ['8.4'],
  oque: 'Foto recente no padrão da Policía Nacional.', para: 'Ir junto com o pedido da TIE.', onde: 'Em um estúdio de fotos para documentos na Espanha.' });
T('taxa-tie', 'nie-tie', 'Comprovante da taxa 790-012 paga', { icone: 'euro', fontes: ['O6', 'O19'],
  oque: 'O comprovante de pagamento da taxa (modelo 790, código 012) do cartão de estrangeiro.', para: 'Levar no atendimento da TIE.', onde: 'Gere o formulário 790-012 na fonte oficial e pague no banco.' });
T('cita-huellas', 'nie-tie', 'Comprovante do agendamento para coleta de digitais', { icone: 'calendar', prepara: '8.3', missoes: ['8.3', '8.6'], fontes: ['O20'],
  oque: 'A confirmação da cita previa para tirar as digitais (toma de huellas).', para: 'Comparecer ao atendimento da TIE.', onde: 'No sistema de cita previa do governo espanhol.' });
T('comprovante-entrada', 'nie-tie', 'Comprovante da data de entrada na Espanha', { icone: 'plane', missoes: ['8.2'],
  oque: 'Carimbo de entrada no passaporte ou cartão de embarque.', para: 'Mostrar quando começou a contar o prazo da TIE.' });
T('resolucao-autorizacao', 'nie-tie', 'Resolução de autorização de estudos', { icone: 'file',
  oque: 'A resolução que concedeu a sua autorização, quando houver.', para: 'Quando a autorização foi concedida por resolução (e não só pelo visto).' });
T('resguardo-tie', 'nie-tie', 'Resguardo da solicitação da TIE', { icone: 'check', prepara: '8.6', missoes: ['8.6', '8.7'],
  oque: 'O recibo entregue no atendimento da TIE.', para: 'Comprovar que o pedido está em andamento.' });
T('tie', 'nie-tie', 'TIE emitido (cartão de estrangeiro)', { icone: 'user', validade: 'data', partes: ['frente', 'verso'],
  oque: 'O cartão que identifica você como estrangeiro com autorização de estada na Espanha.', para: 'Identificação na Espanha e para sair e voltar ao país.', onde: 'Retire pessoalmente quando for emitido.' });
T('cita-retirada', 'nie-tie', 'Comprovante da cita de retirada do cartão', { icone: 'calendar', missoes: ['8.8'],
  oque: 'A confirmação do horário para retirar a TIE.', para: 'Quando a retirada é com agendamento.' });

// ===== 12. Universidade na Espanha =====
T('id-estudante', 'universidade-es', 'Identificação de estudante', { icone: 'user', missoes: ['7.4'],
  oque: 'O número ou documento de estudante da universidade.', para: 'Acessar serviços acadêmicos.' });
T('tui', 'universidade-es', 'Cartão universitário (TUI)', { icone: 'user', missoes: ['7.4'],
  oque: 'A Tarjeta Universitaria Inteligente (carteirinha da universidade).', para: 'Biblioteca, refeitório, descontos e acesso.' });
T('cita-tui', 'universidade-es', 'Comprovante de agendamento para emitir a TUI', { icone: 'calendar',
  oque: 'A confirmação do horário para emitir a carteirinha.', para: 'Quando a universidade emite com agendamento.' });
T('certificado-matricula', 'universidade-es', 'Certificado acadêmico de matrícula', { icone: 'file',
  oque: 'Certificado oficial de que você está matriculado(a).', para: 'Banco, aluguel e outros trâmites pedem.' });
T('historico-mestrado', 'universidade-es', 'Histórico acadêmico do mestrado', { icone: 'book',
  oque: 'As suas notas no mestrado.', para: 'Renovação, bolsas e candidaturas futuras.' });
T('convenio-estagio', 'universidade-es', 'Convênio de estágio curricular', { icone: 'flag',
  oque: 'O acordo entre universidade e empresa para o estágio.', para: 'Fazer estágio curricular.' });
T('tfm-docs', 'universidade-es', 'Documentação acadêmica do TFM', { icone: 'edit',
  oque: 'Documentos do Trabalho de Fim de Mestrado (TFM): proposta, orientação, formulários.', para: 'Cumprir os passos do TFM.' });
T('tfm-deposito', 'universidade-es', 'Aprovação ou depósito do TFM', { icone: 'check',
  oque: 'Comprovante de depósito ou de aprovação do TFM.', para: 'Concluir o mestrado.' });

// ===== 13. Banco =====
T('residencia-fiscal', 'banco', 'Documentação de residência fiscal', { icone: 'file',
  oque: 'Informações sobre o país onde você paga impostos.', para: 'Bancos pedem por regras fiscais internacionais.' });
T('titularidade-bancaria', 'banco', 'Comprovante de titularidade bancária', { icone: 'euro', missoes: ['7.7'],
  oque: 'Documento do banco mostrando que a conta é sua.', para: 'Bolsas, salário e aluguel pedem.' });
T('iban', 'banco', 'Comprovante de IBAN', { icone: 'euro', missoes: ['7.7'],
  oque: 'O número da sua conta no padrão europeu (IBAN).', para: 'Receber pagamentos e fazer débitos.' });
T('contrato-banco', 'banco', 'Documentos contratuais da conta bancária', { icone: 'file',
  oque: 'O contrato e as condições da conta.', para: 'Consultar tarifas e regras.' });

// ===== 14. Trabalho e estágios =====
T('nuss', 'trabalho', 'Número de Seguridad Social (NUSS)', { icone: 'file', fontes: ['O25'],
  oque: 'O seu número de afiliação à Seguridad Social espanhola.', para: 'Trabalhar ou fazer estágio remunerado.', onde: 'Na Seguridad Social (pedido com o formulário TA.1 ou pela sede eletrônica).' });
T('ta1', 'trabalho', 'Formulário TA.1', { icone: 'edit', fontes: ['O25'],
  oque: 'Formulário de pedido do número de Seguridad Social.', para: 'Quando usado para pedir o NUSS.', onde: 'No portal da Seguridad Social.' });
T('contrato-trabalho-es', 'trabalho', 'Contrato de trabalho na Espanha', { icone: 'file',
  oque: 'O contrato com o empregador espanhol.', para: 'Formalizar o trabalho.' });
T('compatibilidade-trabalho', 'trabalho', 'Comprovante de compatibilidade entre trabalho e estudos', { icone: 'scale', fontes: ['O6'],
  oque: 'Documento que mostra que o trabalho é compatível com os estudos.', para: 'A autorização de estudos permite trabalho com limites: confira as regras na fonte oficial.' });
T('certificados-profissionais', 'trabalho', 'Diplomas e certificados profissionais', { icone: 'trophy', multiplos: true,
  oque: 'Certificados da sua formação profissional.', para: 'Candidaturas a vagas.' });
T('reconhecimento-profissional', 'trabalho', 'Reconhecimento profissional (profissões regulamentadas)', { icone: 'shield',
  oque: 'Reconhecimento para exercer profissões regulamentadas na Espanha.', para: 'Só para profissões regulamentadas.' });
T('autonomo-docs', 'trabalho', 'Documentação para trabalho por conta própria', { icone: 'edit',
  oque: 'Registros para trabalhar como autônomo.', para: 'Só se for trabalhar por conta própria (confira se a sua autorização permite).' });
T('fiscal-docs', 'trabalho', 'Documentação fiscal pertinente', { icone: 'file',
  oque: 'Documentos de impostos ligados ao trabalho.', para: 'Cumprir obrigações fiscais.' });

// ===== 15. Familiares e acompanhantes =====
T('passaportes-acompanhantes', 'familiares', 'Passaporte de cada acompanhante', { icone: 'passport', multiplos: true, validade: 'data', apostila: 'nao', traducao: 'nao',
  oque: 'Os passaportes de quem vai com você.', para: 'Pedido de visto de cada acompanhante.' });
T('formularios-acompanhantes', 'familiares', 'Formulário de visto de cada acompanhante', { icone: 'edit', multiplos: true, apostila: 'nao', traducao: 'nao',
  oque: 'Formulário individual de visto.', para: 'Cada pessoa faz o próprio pedido.' });
T('fotos-acompanhantes', 'familiares', 'Fotografia de cada acompanhante', { icone: 'user', multiplos: true, apostila: 'nao', traducao: 'nao',
  oque: 'Fotos no padrão do consulado.', para: 'Acompanhar os formulários.' });
T('certidoes-filhos', 'familiares', 'Certidão de nascimento dos filhos', { icone: 'file', multiplos: true, validade: 'recencia',
  oque: 'Certidões dos filhos.', para: 'Comprovar a filiação.' });
T('recursos-adicionais', 'familiares', 'Comprovantes de recursos para os acompanhantes', { icone: 'euro',
  oque: 'Comprovação de meios adicionais para cada acompanhante.', para: 'O valor exigido aumenta por pessoa: confira na fonte oficial.' });
T('seguro-acompanhantes', 'familiares', 'Seguro médico dos acompanhantes', { icone: 'shield', apostila: 'nao',
  oque: 'Seguro de cada acompanhante.', para: 'Pedido de visto dos acompanhantes.' });
T('antecedentes-acompanhantes', 'familiares', 'Antecedentes criminais dos acompanhantes adultos', { icone: 'shield', validade: 'recencia', multiplos: true,
  oque: 'Certidões dos adultos que vão com você.', para: 'Quando exigidas para a estada deles.' });
T('atestados-acompanhantes', 'familiares', 'Atestados médicos dos acompanhantes', { icone: 'help', validade: 'recencia', multiplos: true,
  oque: 'Atestados de cada acompanhante.', para: 'Quando exigidos.' });
T('guarda-custodia', 'familiares', 'Documentação de guarda ou custódia', { icone: 'users',
  oque: 'Decisão ou acordo de guarda dos filhos.', para: 'Quando apenas um dos responsáveis viaja com o menor.' });
T('autorizacao-responsaveis', 'familiares', 'Autorizações dos responsáveis legais', { icone: 'users',
  oque: 'Autorização do outro responsável pelo menor.', para: 'Viagem e visto de filhos menores.' });
T('apostilas-familiares', 'familiares', 'Apostilas e traduções dos documentos dos acompanhantes', { icone: 'lang', agregado: ['certidao-casamento', 'uniao-estavel', 'certidoes-filhos', 'antecedentes-acompanhantes', 'atestados-acompanhantes', 'guarda-custodia'], fontes: ['O18', 'O24'],
  oque: 'Apostilas e traduções que o consulado pedir para os acompanhantes.', para: 'Anexe dentro de cada documento.' });

// ===== 16. Complementar =====
T('cnh', 'complementar', 'Carteira Nacional de Habilitação (CNH)', { icone: 'user', validade: 'data', partes: ['frente', 'verso'], apostila: 'nao',
  oque: 'A sua carteira de motorista brasileira.', para: 'Dirigir na Espanha (com as regras e prazos vigentes).', onde: 'No Detran do seu estado.' });
T('pid', 'complementar', 'Permissão Internacional para Dirigir (PID)', { icone: 'user', validade: 'data', apostila: 'nao', traducao: 'nao',
  oque: 'A permissão internacional emitida a partir da CNH.', para: 'Acompanhar a CNH ao dirigir no exterior.', onde: 'No Detran do seu estado.' });
T('veiculo-docs', 'complementar', 'Documentação de veículo', { icone: 'file',
  oque: 'Documentos de um veículo que você leve ou compre.', para: 'Só se for o caso.' });
T('beneficios-estudantis', 'complementar', 'Comprovantes para bolsas e benefícios estudantis', { icone: 'trophy',
  oque: 'Documentos pedidos por benefícios (transporte, refeição, auxílios).', para: 'Quando você pedir um benefício.' });
T('acessibilidade', 'complementar', 'Documentação de acessibilidade e adaptações acadêmicas', { icone: 'shield',
  oque: 'Laudos para pedir adaptações na universidade.', para: 'Ter as adaptações de que você precisa.' });
T('certificado-digital', 'complementar', 'Documentação para certificado digital espanhol', { icone: 'lock',
  oque: 'Documentos para obter o certificado digital (FNMT).', para: 'Fazer trâmites online na Espanha.' });
T('clave', 'complementar', 'Documentos de identificação para o Cl@ve', { icone: 'lock',
  oque: 'Documentos para se registrar no Cl@ve, o sistema de identificação digital do governo espanhol.', para: 'Acessar sedes eletrônicas. Nunca guarde aqui senhas ou códigos do Cl@ve.' });
T('autorizacion-regreso', 'complementar', 'Autorización de regreso', { icone: 'plane', fontes: ['O6'],
  oque: 'Autorização para sair e voltar à Espanha enquanto o cartão está em trâmite.', para: 'Só quando cabível (ex.: TIE em renovação).' });

// ===== 17. Renovação =====
T('ex-00', 'renovacao', 'Formulário de prorrogação da autorização de estudos', { icone: 'edit', fontes: ['O6'],
  oque: 'O formulário oficial para prorrogar a autorização de estudos (confira na fonte oficial o modelo vigente; costuma ser o EX-00).', para: 'Continuar estudando depois do período autorizado.' });
T('continuacao-estudos', 'renovacao', 'Comprovação de continuação dos estudos', { icone: 'book',
  oque: 'Documento da universidade de que você continua os estudos.', para: 'Mostrar que a renovação se justifica.' });
T('matricula-novo-periodo', 'renovacao', 'Matrícula do novo período acadêmico', { icone: 'file',
  oque: 'Comprovante de matrícula no novo período.', para: 'Renovação.' });
T('pagamento-novo-periodo', 'renovacao', 'Comprovante de pagamento universitário (novo período)', { icone: 'euro',
  oque: 'Pagamento das taxas do novo período.', para: 'Renovação.' });
T('financeira-atualizada', 'renovacao', 'Documentação financeira atualizada', { icone: 'euro', validade: 'recencia',
  oque: 'Comprovação de recursos para o novo período.', para: 'Renovação.' });
T('seguro-atualizado', 'renovacao', 'Seguro médico atualizado', { icone: 'shield', validade: 'data',
  oque: 'Seguro vigente no novo período.', para: 'Renovação.' });
T('taxas-renovacao', 'renovacao', 'Comprovante das taxas da renovação', { icone: 'euro',
  oque: 'Taxas do pedido de renovação.', para: 'Renovação.' });
T('aproveitamento', 'renovacao', 'Comprovantes de aproveitamento acadêmico', { icone: 'trophy',
  oque: 'Notas ou certificados que mostram que você está avançando no curso.', para: 'Quando pedidos na renovação.' });
T('ex17-renovacao', 'renovacao', 'EX-17 para o novo cartão', { icone: 'edit', fontes: ['O6', 'O19'],
  oque: 'O formulário para emitir o novo TIE depois da renovação.', para: 'Ter o cartão atualizado.' });
T('foto-taxa-novo-tie', 'renovacao', 'Fotografia e taxa de emissão do novo TIE', { icone: 'user',
  oque: 'Foto e comprovante da taxa para o novo cartão.', para: 'Emitir o novo TIE.' });

// ---------------------------------------------------------------------------
// Uso de cada documento por categoria, na ordem da lista oficial do projeto.
// [docId, classe, { cond, condicao (texto), rotulo (nome neste uso), nota }]
// ---------------------------------------------------------------------------
const u = (doc, classe, o = {}) => ({ doc, classe, ...o });
export const CATEGORY_USES = {
  pessoais: [
    u('passaporte', 'O'),
    u('passaporte', 'O', { rotulo: 'Cópia da página de identificação do passaporte', nota: 'A cópia é o próprio arquivo da página de identificação: guarde uma vez, no passaporte.' }),
    u('rg-cin', 'C', { condicao: 'Quando um procedimento pedir identificação complementar.' }),
    u('cpf', 'R'),
    u('certidao-nascimento', 'C', { condicao: 'Quando o procedimento pedir comprovação de filiação ou de dados civis.' }),
    u('certidao-casamento', 'C', { cond: 'conjuge' }),
    u('uniao-estavel', 'C', { cond: 'conjuge' }),
    u('comprovante-residencia-br', 'O', { cond: 'residenteBrasil', condicao: 'Para demonstrar a jurisdição consular.', etapa: 'visto' }),
    u('foto-visto', 'O', { condicao: 'Para o visto nacional.', etapa: 'visto' }),
    u('nie-existente', 'C', { cond: 'nieExistente' }),
    u('procuracao', 'C', { cond: 'representante' }),
    u('id-representante', 'C', { cond: 'representante' }),
    u('mudanca-nome', 'C', { cond: 'nomeMudou' }),
  ],
  academicos: [
    u('diploma', 'O'),
    u('certidao-conclusao', 'C', { cond: 'diplomaPendente', condicao: 'Se o diploma ainda não estiver disponível.' }),
    u('historico', 'O'),
    u('escala-notas', 'O'),
    u('acesso-pos', 'O'),
    u('media-final', 'O', { nota: 'Se o seu histórico mostra a média final, ele já atende.' }),
    u('carga-horaria', 'O', { nota: 'Se o seu histórico mostra a carga horária e os créditos, ele já atende.' }),
    u('ementas', 'C', { condicao: 'Quando a universidade pedir para avaliar a sua formação.' }),
    u('grade-curricular', 'C', { condicao: 'Quando a universidade pedir.' }),
    u('tcc-info', 'C', { condicao: 'Quando o programa considerar o TCC.' }),
    u('equivalencia-nota', 'R'),
    u('outros-diplomas', 'C', { cond: 'outrasGraduacoes' }),
    u('outros-historicos', 'C', { cond: 'outrasGraduacoes' }),
    u('apostilas-academicas', 'C', { condicao: 'Só quando a universidade ou o procedimento pedir.' }),
    u('traducoes-academicas', 'C', { condicao: 'Só quando a universidade ou o procedimento pedir.' }),
  ],
  candidatura: [
    u('formulario-dua', 'O'),
    u('documentacao-academica-candidatura', 'O'),
    u('comprovante-dua', 'R'),
    u('curriculo', 'C', { condicao: 'Se o programa pedir.' }),
    u('carta-motivacao', 'C', { condicao: 'Se o programa pedir.' }),
    u('cartas-recomendacao', 'C', { condicao: 'Se o programa pedir.' }),
    u('idioma', 'C', { cond: 'idiomaEspanhol' }),
    u('certificado-ingles', 'C', { cond: 'idiomaIngles' }),
    u('portfolio', 'C', { condicao: 'Se o programa pedir.' }),
    u('cursos-complementares', 'C', { condicao: 'Se o programa pontuar.' }),
    u('experiencia-profissional', 'C', { condicao: 'Se o programa pontuar.' }),
    u('publicacoes', 'C', { condicao: 'Se o programa avaliar.' }),
    u('projetos-pesquisa', 'C', { condicao: 'Se o programa avaliar.' }),
    u('proposta-pesquisa', 'C', { condicao: 'Se o programa pedir.' }),
    u('especificos', 'C', { condicao: 'Conforme a ficha oficial do mestrado.' }),
    u('condicoes-especiais', 'C', { cond: 'necessidadesEspeciais' }),
  ],
  matricula: [
    u('admissao', 'O'),
    u('aceitacao-vaga', 'C', { condicao: 'Conforme o procedimento de adjudicação.' }),
    u('reserva-vaga', 'C', { condicao: 'Quando a universidade exigir reserva.' }),
    u('comprovante-matricula', 'O'),
    u('comprovante-pagamento', 'O'),
    u('documentacao-original', 'O', { condicao: 'Conforme as exigências da universidade.' }),
    u('traducoes-academicas', 'C', { rotulo: 'Traduções juramentadas exigidas na matrícula definitiva', condicao: 'Só se a universidade pedir.' }),
    u('apostilas-academicas', 'C', { rotulo: 'Apostilas da Haia exigidas na matrícula definitiva', condicao: 'Só se a universidade pedir.' }),
    u('bolsa-isencao', 'C', { condicao: 'Se você tiver bolsa ou isenção.' }),
    u('seguro-escolar', 'C', { condicao: 'Quando a universidade aplicar.' }),
    u('tempo-parcial', 'C', { condicao: 'Só se optar por tempo parcial.' }),
    u('reconhecimento-creditos', 'C', { condicao: 'Só se pedir reconhecimento.' }),
  ],
  financeira: [
    u('meios', 'O'),
    u('extratos', 'C', { condicao: 'Um dos meios possíveis de comprovação.' }),
    u('declaracao-bancaria', 'C', { condicao: 'Um dos meios possíveis de comprovação.' }),
    u('investimentos', 'R'),
    u('imposto-renda', 'C', { condicao: 'Quando o consulado pedir prova de renda.' }),
    u('contracheques', 'C', { condicao: 'Se a comprovação for por renda própria.' }),
    u('contrato-trabalho-br', 'C', { condicao: 'Se a comprovação for por renda própria.' }),
    u('contas-internacionais', 'R'),
    u('carta-bolsa', 'C', { cond: 'bolsa' }),
    u('recebimento-bolsa', 'C', { cond: 'bolsa' }),
    u('apoio-familiar', 'C', { cond: 'patrocinador' }),
    u('extratos-patrocinador', 'C', { cond: 'patrocinador' }),
    u('renda-patrocinador', 'C', { cond: 'patrocinador' }),
    u('id-patrocinador', 'C', { cond: 'patrocinador' }),
    u('vinculo-familiar', 'C', { cond: 'patrocinador' }),
    u('origem-recursos', 'C', { condicao: 'Quando solicitado.' }),
    u('alojamento-pago', 'C', { condicao: 'Se o consulado considerar moradia paga.' }),
    u('comprovante-pagamento', 'O', { rotulo: 'Comprovante de pagamento da matrícula para o visto' }),
  ],
  visto: [
    u('formulario', 'O'),
    u('foto-visto', 'O', { rotulo: 'Fotografia de identificação' }),
    u('passaporte', 'O', { rotulo: 'Passaporte válido e cópia da página de identificação' }),
    u('admissao', 'O'),
    u('comprovante-matricula', 'O', { rotulo: 'Comprovante de matrícula' }),
    u('comprovante-pagamento', 'O', { rotulo: 'Comprovante de pagamento da matrícula' }),
    u('meios', 'O', { rotulo: 'Comprovação financeira' }),
    u('seguro', 'O', { rotulo: 'Certificado de seguro médico' }),
    u('antecedentes', 'C', { cond: ['antecedentesConsulares', '!menor'], condicao: 'Para adultos, quando exigido pela lista vigente do consulado.' }),
    u('antecedentes-outros-paises', 'C', { cond: ['antecedentesConsulares', 'residiuOutrosPaises'] }),
    u('atestado', 'C', { cond: 'atestadoConsular', condicao: 'Quando exigido pela lista vigente do consulado.' }),
    u('comprovante-residencia-br', 'O', { cond: 'residenteBrasil', rotulo: 'Comprovante de residência na jurisdição consular' }),
    u('taxa-visto', 'O'),
    u('agendamento-consular', 'C', { condicao: 'Quando o consulado atende com agendamento.' }),
    u('apostilas-visto', 'C', { condicao: 'Conforme a lista do seu consulado.' }),
    u('traducoes', 'C', { condicao: 'Conforme a lista do seu consulado.' }),
    u('procuracao', 'C', { cond: 'representante', rotulo: 'Documentação de representante' }),
    u('autorizacao-menor', 'C', { cond: 'menor' }),
    u('complementar-consulado', 'C', { condicao: 'Se o consulado pedir.' }),
  ],
  saude: [
    u('seguro', 'O'),
    u('apolice-seguro', 'C', { condicao: 'Se o consulado pedir.' }),
    u('pagamento-seguro', 'C', { condicao: 'Se o consulado pedir.' }),
    u('atestado', 'C', { cond: 'atestadoConsular', rotulo: 'Atestado médico para visto de longa duração' }),
    u('atestado', 'C', { cond: 'atestadoConsular', rotulo: 'Apostila do atestado médico', nota: 'A apostila é anexada no próprio atestado, quando o consulado pedir.' }),
    u('atestado', 'C', { cond: 'atestadoConsular', rotulo: 'Tradução oficial do atestado', nota: 'A tradução é anexada no próprio atestado, quando o consulado pedir.' }),
    u('historico-medico', 'R'),
    u('relatorios-medicos', 'R'),
    u('receitas', 'R'),
    u('medicamentos-controlados', 'C', { cond: 'medicamentos' }),
    u('carteira-vacinacao', 'R'),
    u('civp', 'C', { condicao: 'Só se um país do trajeto exigir.' }),
    u('seguro-odontologico', 'R'),
    u('seguro-viagem', 'R'),
  ],
  moradia: [
    u('contrato-aluguel', 'C', { condicao: 'Se você alugar um imóvel.' }),
    u('reserva-residencia', 'C', { condicao: 'Se for morar em residência.' }),
    u('reserva-hotel', 'C', { condicao: 'Para os primeiros dias, se precisar.' }),
    u('comprovante-moradia', 'C', { condicao: 'Contrato ou reserva de onde você vai ficar.' }),
    u('passaporte', 'C', { rotulo: 'Passaporte ou identificação exigida pelo proprietário' }),
    u('comprovante-matricula', 'C', { rotulo: 'Comprovante de matrícula para residência estudantil', condicao: 'Se a residência pedir.' }),
    u('comprovante-renda', 'C', { condicao: 'Se o proprietário pedir.' }),
    u('extratos', 'C', { rotulo: 'Extratos bancários solicitados pelo proprietário', condicao: 'Se o proprietário pedir.' }),
    u('contrato-trabalho-br', 'C', { rotulo: 'Contrato de trabalho', condicao: 'Se o proprietário pedir.' }),
    u('fiador-docs', 'C', { condicao: 'Se o proprietário exigir fiador.' }),
    u('fiador-renda', 'C', { condicao: 'Se o proprietário exigir fiador.' }),
    u('caucao', 'C', { condicao: 'Se houver caução.' }),
    u('inventario', 'R'),
    u('fotos-vistoria', 'R'),
    u('recibos-aluguel', 'R'),
    u('autorizacao-empadronamiento', 'C', { condicao: 'Se o ayuntamiento pedir.' }),
    u('carta-hospedagem', 'C', { condicao: 'Se for ficar na casa de alguém.' }),
    u('alojamento-pago', 'C', { rotulo: 'Comprovante de alojamento antecipadamente pago', condicao: 'Se tiver pago antes.' }),
    u('contato-alojamento', 'R'),
  ],
  viagem: [
    u('passaporte', 'O'),
    u('visto', 'O'),
    u('passagem', 'O', { condicao: 'Para o transporte contratado.' }),
    u('cartao-embarque', 'O', { condicao: 'No momento do voo.' }),
    u('transito', 'C', { condicao: 'Se o país da conexão exigir.' }),
    u('admissao', 'R', { rotulo: 'Carta de admissão universitária' }),
    u('comprovante-matricula', 'R'),
    u('meios', 'R', { rotulo: 'Comprovantes financeiros' }),
    u('seguro', 'R', { rotulo: 'Certificado de seguro médico' }),
    u('contato-alojamento', 'R', { rotulo: 'Endereço do alojamento' }),
    u('comprovante-moradia', 'R', { rotulo: 'Contrato ou reserva de hospedagem' }),
    u('bilhetes-terrestres', 'R'),
    u('passagem-retorno', 'R'),
    u('bagagem', 'C', { condicao: 'Se despachar malas.' }),
    u('declaracao-alfandegaria', 'C', { condicao: 'Se levar bens ou valores acima dos limites.' }),
    u('animais', 'C', { cond: 'animal' }),
    u('autorizacao-viagem-menor', 'C', { cond: 'menor' }),
    u('copias-digitais', 'R'),
    u('copias-impressas', 'R'),
  ],
  empadronamiento: [
    u('form-empadronamiento', 'O'),
    u('passaporte', 'O', { rotulo: 'Documento de identidade aceito pelo município' }),
    u('comprovante-residencia-es', 'O'),
    u('contrato-aluguel', 'C', { condicao: 'Uma das formas de comprovar o endereço.' }),
    u('conta-consumo', 'C', { condicao: 'Uma das formas de comprovar o endereço.' }),
    u('recibos-aluguel', 'C', { rotulo: 'Recibo recente de aluguel', condicao: 'Uma das formas de comprovar o endereço.' }),
    u('autorizacao-empadronamiento', 'C', { rotulo: 'Autorização da pessoa habilitada a permitir o registro', condicao: 'Se o seu nome não estiver no contrato.' }),
    u('id-autorizador', 'C', { condicao: 'Junto com a autorização.' }),
    u('situacao-cadastral', 'C', { condicao: 'Se você já foi registrado(a) em outro município.' }),
    u('escritura', 'C', { condicao: 'Quando aplicável.' }),
    u('representacao-menores', 'C', { cond: 'filhos' }),
    u('agendamento-padron', 'C', { condicao: 'Se o ayuntamiento atender com agendamento.' }),
    u('empadronamiento', 'R', { rotulo: 'Certificado de empadronamiento emitido' }),
    u('volante-empadronamiento', 'R'),
  ],
  'nie-tie': [
    u('tie-solicitacao', 'O', { cond: 'longa', condicao: 'Quando houver obrigação de pedir a TIE (estadas acima de seis meses).' }),
    u('passaporte', 'O', { cond: 'longa', rotulo: 'Passaporte original' }),
    u('passaporte', 'O', { cond: 'longa', rotulo: 'Cópia do passaporte', nota: 'A cópia sai do próprio arquivo do passaporte: guarde uma vez.' }),
    u('visto', 'O', { cond: 'longa', rotulo: 'Visto ou comprovante da autorização de estudos' }),
    u('foto-tie', 'O', { cond: 'longa' }),
    u('taxa-tie', 'O', { cond: 'longa' }),
    u('cita-huellas', 'C', { cond: 'longa', condicao: 'Atendimento com cita previa.' }),
    u('empadronamiento', 'C', { cond: 'longa', condicao: 'Se a oficina pedir.' }),
    u('comprovante-entrada', 'C', { cond: 'longa', condicao: 'Para comprovar o prazo de um mês.' }),
    u('comprovante-matricula', 'C', { cond: 'longa', condicao: 'Se a oficina pedir.' }),
    u('resolucao-autorizacao', 'C', { cond: 'longa', condicao: 'Se a autorização veio por resolução.' }),
    u('resguardo-tie', 'R', { cond: 'longa' }),
    u('tie', 'R', { cond: 'longa' }),
    u('cita-retirada', 'C', { cond: 'longa', condicao: 'Se a retirada for com agendamento.' }),
  ],
  'universidade-es': [
    u('comprovante-matricula', 'O', { rotulo: 'Comprovante de matrícula atualizado' }),
    u('passaporte', 'O', { rotulo: 'Documento pessoal de identificação' }),
    u('id-estudante', 'R'),
    u('tui', 'R'),
    u('cita-tui', 'C', { condicao: 'Se a emissão for com agendamento.' }),
    u('certificado-matricula', 'R'),
    u('historico-mestrado', 'R'),
    u('carta-bolsa', 'C', { cond: 'bolsa', rotulo: 'Documentação de bolsa' }),
    u('reconhecimento-creditos', 'C', { condicao: 'Só se pedir reconhecimento.' }),
    u('convenio-estagio', 'C', { condicao: 'Se fizer estágio curricular.' }),
    u('tfm-docs', 'C', { condicao: 'Na fase do TFM.' }),
    u('tfm-deposito', 'C', { condicao: 'Na conclusão do TFM.' }),
  ],
  banco: [
    u('passaporte', 'C', { rotulo: 'Passaporte ou documento de identidade', condicao: 'Conforme o banco.' }),
    u('tie', 'C', { rotulo: 'NIE ou TIE', condicao: 'Conforme o banco.' }),
    u('comprovante-residencia-es', 'C', { rotulo: 'Comprovante de endereço espanhol', condicao: 'Conforme o banco.' }),
    u('empadronamiento', 'C', { condicao: 'Conforme o banco.' }),
    u('comprovante-matricula', 'C', { condicao: 'Contas para estudantes.' }),
    u('origem-recursos', 'C', { rotulo: 'Comprovante de renda ou origem dos fundos', condicao: 'Conforme o banco.' }),
    u('residencia-fiscal', 'C', { condicao: 'Conforme o banco.' }),
    u('titularidade-bancaria', 'R'),
    u('iban', 'R'),
    u('contrato-banco', 'R'),
  ],
  trabalho: [
    u('passaporte', 'C', { cond: 'trabalho' }),
    u('tie', 'C', { cond: 'trabalho', rotulo: 'NIE ou TIE' }),
    u('nuss', 'C', { cond: 'trabalho' }),
    u('ta1', 'C', { cond: 'trabalho', condicao: 'Quando usado para pedir o NUSS.' }),
    u('contrato-trabalho-es', 'C', { cond: 'trabalho' }),
    u('comprovante-matricula', 'C', { cond: 'trabalho' }),
    u('compatibilidade-trabalho', 'C', { cond: 'trabalho' }),
    u('titularidade-bancaria', 'C', { cond: 'trabalho', rotulo: 'Comprovante de titularidade da conta bancária' }),
    u('curriculo', 'R', { cond: 'trabalho', rotulo: 'Currículo profissional' }),
    u('certificados-profissionais', 'C', { cond: 'trabalho' }),
    u('reconhecimento-profissional', 'C', { cond: 'trabalho', condicao: 'Só para profissões regulamentadas.' }),
    u('convenio-estagio', 'C', { cond: 'trabalho' }),
    u('autonomo-docs', 'C', { cond: 'trabalho', condicao: 'Só para trabalho por conta própria.' }),
    u('fiscal-docs', 'C', { cond: 'trabalho' }),
  ],
  familiares: [
    u('passaportes-acompanhantes', 'C', { cond: 'familiares' }),
    u('formularios-acompanhantes', 'C', { cond: 'familiares' }),
    u('fotos-acompanhantes', 'C', { cond: 'familiares' }),
    u('certidao-casamento', 'C', { cond: ['familiares', 'conjuge'] }),
    u('uniao-estavel', 'C', { cond: ['familiares', 'conjuge'], rotulo: 'Comprovação de relação estável' }),
    u('certidoes-filhos', 'C', { cond: ['familiares', 'filhos'] }),
    u('recursos-adicionais', 'C', { cond: 'familiares' }),
    u('seguro-acompanhantes', 'C', { cond: 'familiares' }),
    u('antecedentes-acompanhantes', 'C', { cond: ['familiares', 'antecedentesConsulares'], condicao: 'Quando exigidos pelo consulado competente.' }),
    u('atestados-acompanhantes', 'C', { cond: ['familiares', 'atestadoConsular'], condicao: 'Quando exigidos pelo consulado competente.' }),
    u('guarda-custodia', 'C', { cond: ['familiares', 'filhos'] }),
    u('autorizacao-responsaveis', 'C', { cond: ['familiares', 'filhos'] }),
    u('procuracao', 'C', { cond: ['familiares', 'representante'], rotulo: 'Documentos de representação' }),
    u('apostilas-familiares', 'C', { cond: 'familiares', condicao: 'Conforme a lista do consulado.' }),
  ],
  complementar: [
    u('cnh', 'C', { cond: 'veiculo' }),
    u('pid', 'C', { cond: 'veiculo' }),
    u('veiculo-docs', 'C', { cond: 'veiculo' }),
    u('animais', 'C', { cond: 'animal', rotulo: 'Documentação de transporte de animais de estimação' }),
    u('medicamentos-controlados', 'C', { cond: 'medicamentos', rotulo: 'Documentação de medicamentos controlados' }),
    u('beneficios-estudantis', 'C', { condicao: 'Se pedir algum benefício.' }),
    u('acessibilidade', 'C', { cond: 'necessidadesEspeciais' }),
    u('certificado-digital', 'C', { condicao: 'Se quiser fazer trâmites online na Espanha.' }),
    u('clave', 'C', { condicao: 'Se quiser usar o Cl@ve.' }),
    u('autorizacion-regreso', 'C', { condicao: 'Quando cabível (ex.: cartão em renovação).' }),
  ],
  renovacao: [
    u('ex-00', 'C', { cond: 'renovar' }),
    u('passaporte', 'C', { cond: 'renovar', rotulo: 'Passaporte atualizado' }),
    u('continuacao-estudos', 'C', { cond: 'renovar' }),
    u('matricula-novo-periodo', 'C', { cond: 'renovar' }),
    u('pagamento-novo-periodo', 'C', { cond: 'renovar' }),
    u('financeira-atualizada', 'C', { cond: 'renovar' }),
    u('seguro-atualizado', 'C', { cond: 'renovar' }),
    u('taxas-renovacao', 'C', { cond: 'renovar' }),
    u('tie', 'C', { cond: 'renovar', rotulo: 'TIE atual' }),
    u('aproveitamento', 'C', { cond: 'renovar' }),
    u('ex17-renovacao', 'C', { cond: 'renovar' }),
    u('foto-taxa-novo-tie', 'C', { cond: 'renovar' }),
  ],
};

// Estados detalhados (mostrados ao estudante). "base" = status interno equivalente (DOC_STATUS), lido pelas missões.
export const DOC_STATES = {
  'nao-iniciado': { rotulo: 'Não iniciado', base: 'pendente', tom: 'muted', icone: 'minus' },
  solicitar: { rotulo: 'Preciso solicitar', base: 'pendente', tom: 'muted', icone: 'edit' },
  aguardando: { rotulo: 'Aguardando emissão', base: 'em-preparacao', tom: 'info', icone: 'hourglass' },
  recebido: { rotulo: 'Documento recebido', base: 'em-preparacao', tom: 'info', icone: 'mail' },
  'arquivo-enviado': { rotulo: 'Arquivo enviado', base: 'em-preparacao', tom: 'info', icone: 'file' },
  'precisa-traducao': { rotulo: 'Precisa de tradução', base: 'em-preparacao', tom: 'warn', icone: 'lang' },
  'precisa-apostila': { rotulo: 'Precisa de apostilamento', base: 'em-preparacao', tom: 'warn', icone: 'shield' },
  pronto: { rotulo: 'Pronto para utilização', base: 'pronto', tom: 'ok', icone: 'check' },
  correcao: { rotulo: 'Precisa de correção', base: 'correcao', tom: 'warn', icone: 'alert' },
  vencido: { rotulo: 'Vencido', base: 'correcao', tom: 'warn', icone: 'alert' },
  dispensado: { rotulo: 'Dispensado', base: 'nao-se-aplica', tom: 'faint', icone: 'minus' },
  'nao-aplicavel': { rotulo: 'Não aplicável', base: 'nao-se-aplica', tom: 'faint', icone: 'minus' },
};

// Papéis dos arquivos de um mesmo documento (agrupados, sem criar documentos novos).
export const FILE_ROLES = {
  original: 'Original',
  frente: 'Frente',
  verso: 'Verso',
  apostilado: 'Documento apostilado',
  apostila: 'Apostila',
  traducao: 'Tradução',
  'comprovante-traducao': 'Comprovante da tradução juramentada',
  copia: 'Cópia',
  outro: 'Outro arquivo',
};

// Explicações gerais (mostradas no detalhe de cada documento quando apostila/tradução podem ser pedidas).
export const APOSTILLE_GUIDE = {
  oque: 'A Apostila da Haia é um selo (certificado) que confirma a autenticidade de um documento público brasileiro para uso em outro país da Convenção, como a Espanha. Ela substitui a antiga "legalização" consular.',
  quando: 'Só quando o órgão espanhol (universidade, consulado) pedir. Nem todo documento precisa: confira a lista oficial do procedimento.',
  onde: 'Em cartórios brasileiros autorizados pelo CNJ. O documento costuma precisar estar em original ou em cópia autenticada.',
  vincular: 'Anexe aqui o arquivo do documento apostilado (ou da apostila) com o papel "Apostila", ele fica junto do documento original.',
  fonte: 'O18',
};
export const TRANSLATION_GUIDE = {
  oque: 'A tradução converte o documento para o espanhol. A tradução "comum" é feita por qualquer pessoa; a juramentada (oficial) é feita por tradutor reconhecido e tem fé pública.',
  quando: 'Só quando o órgão pedir. Documentos em português muitas vezes precisam de tradução oficial para uso na Espanha, mas a regra é de cada procedimento.',
  quem: 'Na Espanha, os "traductores jurados" nomeados pelo Ministério de Assuntos Exteriores. Alguns órgãos aceitam tradução feita por tradutor público juramentado no Brasil ou pelo consulado: confirme antes de contratar.',
  vincular: 'Anexe a tradução com o papel "Tradução" (e o comprovante, se houver) dentro do próprio documento.',
  fonte: 'O24',
};
