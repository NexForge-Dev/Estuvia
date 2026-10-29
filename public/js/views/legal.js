// Política de Privacidade e Termos de Uso (LGPD). RASCUNHO: os campos [PREENCHER: ...] dependem de dados da
// empresa e o texto inteiro precisa de revisão jurídica antes do lançamento comercial.
import { h } from '../ui.js';

const UPDATED = '29/10/2026';

function legalPage(title, intro, sections) {
  return h('article', { class: 'auth card legal stack' },
    h('p', { class: 'muted' }, h('a', { href: '#/' }, '← Voltar para o início')),
    h('h1', {}, title),
    h('p', { class: 'muted' }, `Última atualização: ${UPDATED}`),
    h('p', { class: 'notice warn', role: 'note' }, 'Rascunho: este texto ainda precisa de revisão jurídica e dos dados marcados como [PREENCHER].'),
    h('p', {}, intro),
    ...sections.map(([heading, ...paras]) => h('section', { class: 'stack' },
      h('h2', {}, heading),
      ...paras.map((p) => (Array.isArray(p) ? h('ul', {}, p.map((li) => h('li', {}, li))) : h('p', {}, p))))),
  );
}

export function privacyView() {
  return legalPage('Política de Privacidade',
    'Esta política explica quais dados pessoais a Estuvia trata, para quê, com quem compartilha e como você exerce seus direitos, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018, LGPD) e, quando aplicável, o Regulamento Geral de Proteção de Dados europeu (RGPD).',
    [
      ['1. Quem é o controlador',
        'Controlador: [PREENCHER: razão social], CNPJ [PREENCHER: CNPJ], com sede em [PREENCHER: endereço completo].',
        'Encarregado pelo tratamento de dados (DPO): [PREENCHER: nome] — e-mail [PREENCHER: e-mail de privacidade].'],
      ['2. Dados que coletamos',
        ['Conta: nome ou apelido, e-mail e senha (guardada apenas como hash scrypt).',
          'Jornada: mestrados escolhidos, respostas de requisitos, progresso das missões, prazos, anotações, agenda.',
          'Finanças, moradia e viagem: valores, recursos, bolsas, opções de moradia e rotas que você cadastra.',
          'Carteira de documentos: arquivos que você envia (cifrados em repouso com AES-256-GCM; a chave fica no servidor, portanto não é criptografia de ponta a ponta) e a situação de cada documento.',
          'Comunidade: publicações, comentários, imagens e denúncias.',
          'Segurança e uso: endereço IP, navegador/dispositivo, datas de acesso, tentativas de login e telas acessadas (métricas internas, sem ferramentas de publicidade).',
          'Mensagens ao Mentor/Assistente de IA, quando você usa esses recursos.']],
      ['3. Para que usamos e bases legais',
        ['Prestar o serviço e personalizar sua jornada (execução de contrato, art. 7º, V).',
          'Segurança, prevenção a fraudes e registros de acesso (legítimo interesse e cumprimento de obrigação legal, art. 7º, II e IX; Marco Civil da Internet, art. 15).',
          'Documentos pessoais que você decide guardar (consentimento específico, art. 7º, I, registrado antes do primeiro envio).',
          'Recuperação de senha e avisos da conta por e-mail (execução de contrato).']],
      ['4. Inteligência artificial',
        'Quando o Mentor com IA está ativo, o conteúdo necessário para responder (sua pergunta e um resumo da sua jornada) é enviado ao provedor de IA [PREENCHER: provedor, ex.: Anthropic PBC, EUA]. Não enviamos seus arquivos de documentos. As respostas são orientações e não substituem os órgãos oficiais.'],
      ['5. Com quem compartilhamos (operadores)',
        ['Hospedagem: [PREENCHER: provedor e país].',
          'E-mail transacional: [PREENCHER: provedor, ex.: Resend, EUA].',
          'Provedor de IA (se ativo): [PREENCHER].',
          'Não vendemos dados pessoais nem os usamos para publicidade.']],
      ['6. Transferência internacional',
        'Alguns operadores ficam fora do Brasil. Nesses casos adotamos as salvaguardas do art. 33 da LGPD: [PREENCHER: cláusulas-padrão / outro mecanismo].'],
      ['7. Por quanto tempo guardamos',
        'Enquanto sua conta existir. Ao excluir a conta, apagamos dados da jornada, documentos e conteúdo da comunidade. Registros de acesso são mantidos por [PREENCHER: prazo, mínimo 6 meses pelo Marco Civil] e depois descartados.'],
      ['8. Seus direitos',
        'Você pode confirmar o tratamento, acessar, corrigir, exportar (Perfil → Exportar meus dados), excluir a conta (Perfil → Excluir conta), revogar consentimentos e reclamar à ANPD. Para outros pedidos, escreva para [PREENCHER: e-mail de privacidade]; respondemos em até 15 dias.'],
      ['9. Cookies',
        'Usamos apenas um cookie essencial de sessão (httpOnly), necessário para manter você conectado. Não usamos cookies de publicidade ou de terceiros.'],
      ['10. Segurança',
        'Senhas com hash, conexão HTTPS, arquivos cifrados em repouso, controle de acesso por papel e registros de auditoria. Nenhum sistema é 100% seguro; em caso de incidente relevante, avisaremos você e a ANPD conforme a lei.'],
      ['11. Menores de idade',
        'O serviço é destinado a maiores de 18 anos. [PREENCHER: confirmar idade mínima].'],
      ['12. Alterações',
        'Mudanças relevantes serão avisadas na plataforma antes de entrarem em vigor.'],
    ]);
}

export function termsView() {
  return legalPage('Termos de Uso',
    'Estes termos regem o uso da Estuvia. Ao criar uma conta você declara que leu e concorda com eles e com a Política de Privacidade.',
    [
      ['1. Quem somos',
        'A Estuvia é oferecida por [PREENCHER: razão social], CNPJ [PREENCHER], [PREENCHER: endereço]. Contato: [PREENCHER: e-mail de suporte].'],
      ['2. O que a plataforma faz (e o que não faz)',
        'A Estuvia orienta e organiza sua jornada de mobilidade acadêmica: missões, prazos, documentos, finanças, moradia, viagem e um Mentor. Candidaturas, matrícula, visto e demais pedidos oficiais são feitos por você nos sistemas competentes (universidades, Distrito Único Andaluz, consulados). Não garantimos admissão, visto, bolsa ou qualquer resultado oficial.',
        'Informações oficiais (prazos, valores como o IPREM, requisitos) podem mudar. Confirme sempre na fonte oficial indicada. Programas marcados como "demonstração" são exemplos.'],
      ['3. Sua conta',
        'Você é responsável pelas informações que cadastra e pela guarda da sua senha. Avise-nos se suspeitar de uso indevido. Podemos suspender contas que violem estes termos.'],
      ['4. Uso aceitável',
        ['Não publicar conteúdo ilegal, ofensivo, discriminatório, enganoso ou que viole direitos de terceiros.',
          'Não compartilhar dados pessoais de outras pessoas na Comunidade.',
          'Não tentar acessar contas ou dados de terceiros, nem sobrecarregar ou burlar limites do serviço.']],
      ['5. Conteúdo que você publica',
        'Você mantém os direitos sobre seu conteúdo e nos autoriza a exibi-lo na plataforma para prestar o serviço. Conteúdo da Comunidade pode ser moderado ou removido.'],
      ['6. Inteligência artificial',
        'Respostas do Mentor podem conter erros. Ações sugeridas só são executadas com sua confirmação. Use o Mentor como apoio, não como aconselhamento jurídico, migratório ou financeiro.'],
      ['7. Preço',
        '[PREENCHER: o serviço é gratuito / planos, preços, forma de pagamento, renovação, cancelamento e direito de arrependimento de 7 dias (CDC, art. 49)].'],
      ['8. Disponibilidade e responsabilidade',
        'Buscamos manter o serviço disponível, mas ele pode ter interrupções. Na máxima extensão permitida pela lei, não respondemos por decisões tomadas com base em informações não confirmadas nas fontes oficiais nem por prazos perdidos em sistemas de terceiros.'],
      ['9. Encerramento',
        'Você pode excluir sua conta a qualquer momento em Perfil. Podemos encerrar o serviço avisando com antecedência razoável e permitindo a exportação dos seus dados.'],
      ['10. Lei e foro',
        'Aplica-se a lei brasileira. Fica eleito o foro de [PREENCHER: comarca], ressalvado o direito do consumidor de ajuizar no seu domicílio.'],
    ]);
}
