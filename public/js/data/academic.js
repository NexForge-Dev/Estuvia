// Opções acadêmicas do onboarding e do perfil. Módulo puro (frontend + servidor), sem API externa.
//
// Contrato com o motor: profile.formacao, profile.instituicao e profile.area continuam sendo TEXTO livre
// (o motor só lê formacao para "Titulação de acesso" e o Mentor usa os três como contexto). Aqui só
// padronizamos o que é oferecido; valores antigos digitados à mão continuam válidos e aparecem como estão.

// Nível de formação. Mestrado oficial na Espanha exige título universitário de acesso (graduação).
export const FORMACOES = [
  { value: 'Graduação concluída', hint: 'Já tenho o diploma ou a colação de grau.' },
  { value: 'Graduação em andamento (último ano)', hint: 'Termino antes do início do mestrado.' },
  { value: 'Graduação em andamento', hint: 'Ainda faltam mais de dois semestres.' },
  { value: 'Especialização (pós lato sensu) concluída', hint: 'Além da graduação.' },
  { value: 'Mestrado concluído', hint: 'Busco um segundo mestrado.' },
  { value: 'Doutorado concluído', hint: '' },
];
export const formacaoEmAndamento = (f) => /em andamento/i.test(f || '');

// Áreas por ramo de conhecimento: são os cinco ramos usados pelas universidades espanholas
// (e pelo catálogo/Radar da Estuvia: "Engenharia e Arquitetura", "Ciências Sociais e Jurídicas"...).
export const AREAS = {
  'Artes e Humanidades': ['Artes e Design', 'Belas Artes', 'Música', 'Filosofia', 'História', 'Letras e Literatura', 'Linguística e Tradução', 'Estudos Culturais', 'Arqueologia e Patrimônio', 'Teologia e Religião'],
  'Ciências': ['Biologia', 'Biotecnologia', 'Ciências Ambientais', 'Física', 'Geologia', 'Matemática', 'Estatística', 'Química', 'Ciência e Tecnologia de Alimentos'],
  'Ciências da Saúde': ['Medicina', 'Enfermagem', 'Farmácia', 'Odontologia', 'Fisioterapia', 'Nutrição', 'Psicologia', 'Saúde Pública', 'Ciências do Esporte', 'Fonoaudiologia', 'Terapia Ocupacional'],
  'Ciências Sociais e Jurídicas': ['Administração e Gestão', 'Economia', 'Finanças e Contabilidade', 'Marketing', 'Direito', 'Relações Internacionais', 'Ciência Política', 'Sociologia', 'Antropologia', 'Educação', 'Comunicação e Jornalismo', 'Turismo', 'Geografia', 'Serviço Social', 'Biblioteconomia e Documentação'],
  'Engenharia e Arquitetura': ['Arquitetura e Urbanismo', 'Engenharia Civil', 'Engenharia Elétrica', 'Engenharia Mecânica', 'Engenharia Química', 'Engenharia de Produção', 'Engenharia Ambiental', 'Engenharia de Telecomunicações', 'Engenharia Agronômica', 'Computação e Tecnologia da Informação', 'Ciência de Dados e Inteligência Artificial'],
};
export const areaGroup = (area) => Object.entries(AREAS).find(([, list]) => list.includes(area))?.[0] || null;

// Instituições brasileiras mais frequentes (sigla + nome oficial). Não é exaustiva: quem não encontrar
// a sua informa manualmente. Valor salvo: "SIGLA - Nome" (≤ 120 caracteres).
const BR_INSTITUTIONS = [
  ['UFAC', 'Universidade Federal do Acre'], ['UFAL', 'Universidade Federal de Alagoas'], ['UNIFAP', 'Universidade Federal do Amapá'],
  ['UFAM', 'Universidade Federal do Amazonas'], ['UFBA', 'Universidade Federal da Bahia'], ['UFRB', 'Universidade Federal do Recôncavo da Bahia'],
  ['UFSB', 'Universidade Federal do Sul da Bahia'], ['UNEB', 'Universidade do Estado da Bahia'], ['UEFS', 'Universidade Estadual de Feira de Santana'],
  ['UESC', 'Universidade Estadual de Santa Cruz'], ['UESB', 'Universidade Estadual do Sudoeste da Bahia'], ['UFC', 'Universidade Federal do Ceará'],
  ['UECE', 'Universidade Estadual do Ceará'], ['UNIFOR', 'Universidade de Fortaleza'], ['UFCA', 'Universidade Federal do Cariri'],
  ['UnB', 'Universidade de Brasília'], ['UFES', 'Universidade Federal do Espírito Santo'], ['UFG', 'Universidade Federal de Goiás'],
  ['PUC Goiás', 'Pontifícia Universidade Católica de Goiás'], ['UFMA', 'Universidade Federal do Maranhão'], ['UEMA', 'Universidade Estadual do Maranhão'],
  ['UFMT', 'Universidade Federal de Mato Grosso'], ['UFMS', 'Universidade Federal de Mato Grosso do Sul'], ['UFGD', 'Universidade Federal da Grande Dourados'],
  ['UFMG', 'Universidade Federal de Minas Gerais'], ['UFJF', 'Universidade Federal de Juiz de Fora'], ['UFOP', 'Universidade Federal de Ouro Preto'],
  ['UFU', 'Universidade Federal de Uberlândia'], ['UFV', 'Universidade Federal de Viçosa'], ['UFLA', 'Universidade Federal de Lavras'],
  ['UFSJ', 'Universidade Federal de São João del-Rei'], ['UNIFEI', 'Universidade Federal de Itajubá'], ['UFTM', 'Universidade Federal do Triângulo Mineiro'],
  ['UNIMONTES', 'Universidade Estadual de Montes Claros'], ['PUC Minas', 'Pontifícia Universidade Católica de Minas Gerais'], ['CEFET-MG', 'Centro Federal de Educação Tecnológica de Minas Gerais'],
  ['UFPA', 'Universidade Federal do Pará'], ['UEPA', 'Universidade do Estado do Pará'], ['UFOPA', 'Universidade Federal do Oeste do Pará'],
  ['UFPB', 'Universidade Federal da Paraíba'], ['UFCG', 'Universidade Federal de Campina Grande'], ['UEPB', 'Universidade Estadual da Paraíba'],
  ['UFPR', 'Universidade Federal do Paraná'], ['UTFPR', 'Universidade Tecnológica Federal do Paraná'], ['UEL', 'Universidade Estadual de Londrina'],
  ['UEM', 'Universidade Estadual de Maringá'], ['UEPG', 'Universidade Estadual de Ponta Grossa'], ['UNIOESTE', 'Universidade Estadual do Oeste do Paraná'],
  ['PUCPR', 'Pontifícia Universidade Católica do Paraná'], ['UFPE', 'Universidade Federal de Pernambuco'], ['UFRPE', 'Universidade Federal Rural de Pernambuco'],
  ['UPE', 'Universidade de Pernambuco'], ['UNICAP', 'Universidade Católica de Pernambuco'], ['UFPI', 'Universidade Federal do Piauí'],
  ['UESPI', 'Universidade Estadual do Piauí'], ['UFRJ', 'Universidade Federal do Rio de Janeiro'], ['UFF', 'Universidade Federal Fluminense'],
  ['UERJ', 'Universidade do Estado do Rio de Janeiro'], ['UNIRIO', 'Universidade Federal do Estado do Rio de Janeiro'], ['UFRRJ', 'Universidade Federal Rural do Rio de Janeiro'],
  ['PUC-Rio', 'Pontifícia Universidade Católica do Rio de Janeiro'], ['FGV', 'Fundação Getulio Vargas'], ['CEFET/RJ', 'Centro Federal de Educação Tecnológica Celso Suckow da Fonseca'],
  ['UFRN', 'Universidade Federal do Rio Grande do Norte'], ['UERN', 'Universidade do Estado do Rio Grande do Norte'], ['UFERSA', 'Universidade Federal Rural do Semi-Árido'],
  ['UFRGS', 'Universidade Federal do Rio Grande do Sul'], ['UFSM', 'Universidade Federal de Santa Maria'], ['UFPel', 'Universidade Federal de Pelotas'],
  ['FURG', 'Universidade Federal do Rio Grande'], ['UNIPAMPA', 'Universidade Federal do Pampa'], ['PUCRS', 'Pontifícia Universidade Católica do Rio Grande do Sul'],
  ['UNISINOS', 'Universidade do Vale do Rio dos Sinos'], ['UCS', 'Universidade de Caxias do Sul'], ['UNIR', 'Universidade Federal de Rondônia'],
  ['UFRR', 'Universidade Federal de Roraima'], ['UFSC', 'Universidade Federal de Santa Catarina'], ['UDESC', 'Universidade do Estado de Santa Catarina'],
  ['UFFS', 'Universidade Federal da Fronteira Sul'], ['UNIVALI', 'Universidade do Vale do Itajaí'], ['FURB', 'Universidade Regional de Blumenau'],
  ['USP', 'Universidade de São Paulo'], ['UNICAMP', 'Universidade Estadual de Campinas'], ['UNESP', 'Universidade Estadual Paulista'],
  ['UNIFESP', 'Universidade Federal de São Paulo'], ['UFSCar', 'Universidade Federal de São Carlos'], ['UFABC', 'Universidade Federal do ABC'],
  ['PUC-SP', 'Pontifícia Universidade Católica de São Paulo'], ['PUC-Campinas', 'Pontifícia Universidade Católica de Campinas'], ['Mackenzie', 'Universidade Presbiteriana Mackenzie'],
  ['FGV-SP', 'Fundação Getulio Vargas (São Paulo)'], ['Insper', 'Insper Instituto de Ensino e Pesquisa'], ['ITA', 'Instituto Tecnológico de Aeronáutica'],
  ['FATEC', 'Faculdade de Tecnologia do Estado de São Paulo'], ['UFS', 'Universidade Federal de Sergipe'], ['UFT', 'Universidade Federal do Tocantins'],
  ['IFBA', 'Instituto Federal da Bahia'], ['IFCE', 'Instituto Federal do Ceará'], ['IFPE', 'Instituto Federal de Pernambuco'], ['IFSP', 'Instituto Federal de São Paulo'],
  ['IFRN', 'Instituto Federal do Rio Grande do Norte'], ['IFSC', 'Instituto Federal de Santa Catarina'], ['IFMG', 'Instituto Federal de Minas Gerais'],
  ['UNINOVE', 'Universidade Nove de Julho'], ['UNIP', 'Universidade Paulista'], ['Anhembi Morumbi', 'Universidade Anhembi Morumbi'],
  ['Estácio', 'Universidade Estácio de Sá'], ['UNIFACS', 'Universidade Salvador'], ['UCSAL', 'Universidade Católica do Salvador'],
  ['UNICEUB', 'Centro Universitário de Brasília'], ['UCB', 'Universidade Católica de Brasília'], ['UNISUL', 'Universidade do Sul de Santa Catarina'],
];
export const INSTITUTIONS = BR_INSTITUTIONS.map(([sigla, nome]) => ({ value: `${sigla} - ${nome}`, label: nome, sigla }));

// Estimativa de orçamento: atalhos que só preenchem o campo numérico (o valor salvo é sempre o número).
export const BUDGET_SHORTCUTS = [8000, 12000, 15000, 20000, 25000, 30000];
