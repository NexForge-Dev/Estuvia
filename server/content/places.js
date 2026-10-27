// Consulados e guia de cidade.
// Jurisdições consulares: base estruturada, conferida nas páginas oficiais de "Demarcación" de cada
// repartição (exteriores.gob.es). O consulado do estudante vem SEMPRE desta base — nunca de um
// palpite do modelo de linguagem. Estado fora da base → "não confirmado" + procedimento oficial.

const MAEC = 'https://www.exteriores.gob.es';
const VISTO_ESTUDOS = '/es/ServiciosConsulares/Paginas/index.aspx?scca=Visados&scco=Brasil&scd=250&scs=Visados+Nacionales+-+Visado+de+estudios';
const VERIFICADO_EM = '2026-10-24';

export const UF_NOMES = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo',
  GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba',
  PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul',
  RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};
// "mora na Paraíba", "no Ceará", "em São Paulo".
const NA = ['BA', 'PB'];
const EM = ['AL', 'GO', 'MG', 'PE', 'RO', 'RR', 'SC', 'SP', 'SE'];
export const ufEm = (uf) => `${NA.includes(uf) ? 'na' : EM.includes(uf) ? 'em' : 'no'} ${UF_NOMES[uf] || uf}`;

// emailVistos só quando a página oficial publica um e-mail ESPECÍFICO de vistos; senão, emailContato
// é o e-mail consular/geral publicado (com o tipo), para o estudante saber a quem está escrevendo.
const office = (o) => {
  const site = `${MAEC}${o.caminho}`;
  const pagina = o.caminho.startsWith('/Embajadas') ? 'Embajada' : 'Consulado';
  return {
    ...o,
    site,
    vistoEstudosUrl: `${site}${VISTO_ESTUDOS}`,
    demarcacaoUrl: `${site}/es/${pagina}/Paginas/Demarcaci%C3%B3n.aspx`,
    contatoUrl: `${site}/es/${pagina}/Paginas/Horario,-localizaci%C3%B3n-y-contacto.aspx`,
    emailContato: o.emailVistos || o.emailContato,
    emailContatoTipo: o.emailVistos ? 'vistos' : o.emailContatoTipo,
    pais: 'Brasil',
    servicos: ['visto-estudos'],
    verificadoEm: VERIFICADO_EM,
  };
};

export const CONSULATES = [
  office({
    id: 'salvador', nome: 'Consulado Geral da Espanha em Salvador da Bahia', cidade: 'Salvador', uf: 'BA', caminho: '/Consulados/salvadordebahia',
    endereco: 'Av. Oceânica, 8, salas 102/103: Ed. Farol Praia Center, Barra, 40140-130 Salvador (BA)', telefone: '+55 71 3014-7101',
    emailVistos: 'cog.salvador.vis@maec.es',
    estadosConfirmados: ['BA', 'SE', 'AL', 'PE', 'PB', 'RN', 'CE', 'PI', 'MA'],
    fonte: 'O11',
  }),
  office({
    id: 'sao-paulo', nome: 'Consulado Geral da Espanha em São Paulo', cidade: 'São Paulo', uf: 'SP', caminho: '/Consulados/saopaulo',
    endereco: 'Av. Brasil, 948: Jardim América, 01430-000 São Paulo (SP). Entrada do público: Rua Canadá, 424', telefone: null,
    emailContato: 'cog.saopaulo@maec.es', emailContatoTipo: 'geral',
    estadosConfirmados: ['SP', 'PR', 'MS'],
  }),
  office({
    id: 'rio-de-janeiro', nome: 'Consulado Geral da Espanha no Rio de Janeiro', cidade: 'Rio de Janeiro', uf: 'RJ', caminho: '/Consulados/riodejaneiro',
    endereco: 'Rua Lauro Müller, 116, salas 1601/02/08: Torre Rio Sul, Botafogo, 22290-160 Rio de Janeiro (RJ)', telefone: '+55 21 3268-5476',
    emailVistos: 'cog.riodejaneiro.vis@maec.es',
    estadosConfirmados: ['RJ', 'MG', 'ES'],
  }),
  office({
    id: 'porto-alegre', nome: 'Consulado Geral da Espanha em Porto Alegre', cidade: 'Porto Alegre', uf: 'RS', caminho: '/Consulados/portoalegre',
    endereco: 'Av. Carlos Gomes, 222, conj. 301: Auxiliadora, 90480-000 Porto Alegre (RS)', telefone: '+55 51 3321-1901',
    emailContato: 'cog.portoalegre@maec.es', emailContatoTipo: 'geral',
    estadosConfirmados: ['RS', 'SC'],
  }),
  office({
    id: 'brasilia', nome: 'Seção Consular da Embaixada da Espanha em Brasília', cidade: 'Brasília', uf: 'DF', caminho: '/Embajadas/brasilia',
    endereco: 'SES Av. das Nações, Quadra 811, Lote 44, 70429-900 Brasília (DF)', telefone: '+55 61 3701-1600',
    emailContato: 'sc.brasilia@maec.es', emailContatoTipo: 'consular',
    estadosConfirmados: ['DF', 'GO', 'AM', 'PA', 'MT', 'TO', 'RO', 'RR', 'AC', 'AP'],
  }),
];

// Mapeamento validado estado → repartição (uma linha por estado e serviço).
export const CONSULAR_JURISDICTIONS = CONSULATES.flatMap((c) => c.estadosConfirmados.map((uf) => ({
  pais: 'Brasil', estado: uf, estadoNome: UF_NOMES[uf], consuladoId: c.id, servico: 'visto-estudos',
  contatos: { email: c.emailContato, emailTipo: c.emailContatoTipo, telefone: c.telefone },
  fonteUrl: c.demarcacaoUrl, verificadoEm: c.verificadoEm,
})));

// Procedimento oficial quando o estado não está na base: página da Embaixada com as repartições
// consulares no Brasil (mais direta que a página inicial do Ministério).
export const CONSULATE_LIST_URL = `${MAEC}/Embajadas/brasilia/es/Embajada/Paginas/Consulados.aspx`;

export function consulateForState(uf) {
  return CONSULATES.find((c) => c.estadosConfirmados.includes(uf)) || null;
}

const EMAIL_LABEL = { vistos: 'E-mail do setor de vistos', consular: 'E-mail da seção consular', geral: 'E-mail geral do consulado' };

/**
 * Resultado estruturado (tipo "consulado") para telas e para o Mentor.
 * status: encontrado | nao-confirmado | sem-estado | fora-do-brasil
 */
export function consulateResult(uf, { pais = 'Brasil' } = {}) {
  const procedimento = { rotulo: 'Ver repartições consulares da Espanha no Brasil', url: CONSULATE_LIST_URL, orgao: 'Embaixada da Espanha no Brasil' };
  if (pais && !/^bra[sz]il$/i.test(String(pais).trim())) {
    return { tipo: 'consulado', status: 'fora-do-brasil', pais, procedimento: { rotulo: 'Ver embaixadas e consulados da Espanha', url: `${MAEC}/es/EmbajadasConsulados/Paginas/index.aspx`, orgao: 'Ministerio de Asuntos Exteriores' } };
  }
  if (!uf) return { tipo: 'consulado', status: 'sem-estado' };
  const c = consulateForState(uf);
  const estado = { uf, nome: UF_NOMES[uf] || uf, em: ufEm(uf) };
  if (!c) return { tipo: 'consulado', status: 'nao-confirmado', estado, procedimento };
  return {
    tipo: 'consulado', status: 'encontrado', estado, servico: 'visto-estudos',
    consulado: {
      id: c.id, nome: c.nome, cidade: c.cidade, uf: c.uf, endereco: c.endereco, telefone: c.telefone,
      email: c.emailContato, emailRotulo: EMAIL_LABEL[c.emailContatoTipo], emailEspecificoVistos: c.emailContatoTipo === 'vistos',
      site: c.site, vistoEstudosUrl: c.vistoEstudosUrl, contatoUrl: c.contatoUrl,
    },
    fonte: { titulo: 'Demarcação consular', orgao: c.nome, url: c.demarcacaoUrl, verificadoEm: c.verificadoEm },
  };
}

export const CITY_GUIDES = {
  Granada: {
    cidade: 'Granada',
    intro: 'Cidade universitária, com boa parte da vida estudantil concentrada em torno dos campi e do centro. Orientações práticas para os primeiros dias.',
    secoes: [
      { titulo: 'Primeiro dia', itens: ['Vá do aeroporto/estação direto à moradia e confira o imóvel (Missão 7.2).', 'Guarde comprovantes de chegada: a data de entrada inicia o prazo da TIE.', 'Tenha um pouco de dinheiro em espécie para os primeiros deslocamentos.'] },
      { titulo: 'Universidade', itens: ['Localize a faculdade do seu mestrado e a secretaria antes do primeiro dia de aula.', 'Procure o serviço internacional para orientações a estudantes estrangeiros.', 'Ative o e-mail institucional: comunicações oficiais chegam por ele.'] },
      { titulo: 'Transporte', itens: ['Pergunte pelas tarifas de estudante no transporte urbano.', 'Compare passe mensal com cartões recarregáveis conforme seu uso.'] },
      { titulo: 'Trâmites locais', itens: ['Empadronamiento no ayuntamiento (Missão 7.9).', 'TIE, se a estada for superior a seis meses (Rodada 8).'] },
    ],
    tag: 'pratica',
    fonte: 'M',
  },
};
