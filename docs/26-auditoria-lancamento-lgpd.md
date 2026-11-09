# Auditoria de lançamento — Estuvia

**Data:** 9 de novembro de 2026

**Escopo:** revisão estática do código, textos legais, configuração e documentação do repositório; conferência de fontes oficiais brasileiras e espanholas sobre o processo acadêmico.
**Veredito:** **não recomendo abrir cadastro público nem permitir envio de documentos ainda.** A aplicação já tem bastante estrutura funcional e controles técnicos úteis, mas os avisos legais são explicitamente rascunhos, há divergências entre o que a interface promete e o que o servidor permite, o fluxo de exclusão/retensão precisa ser definido e não foi possível confirmar uma implantação real nem a região dos provedores.

Esta revisão é um diagnóstico de produto e tecnologia, não um parecer jurídico, pentest, certificação LGPD/GDPR ou validação de um ambiente de produção. Um advogado com experiência em privacidade, consumidor e serviços educacionais/migratórios deve revisar os documentos finais.

## 1. O que a plataforma faz hoje

A Estuvia organiza a jornada para candidatura, preparação de documentos, visto e chegada. A candidatura, matrícula e pedidos consulares são feitos pelo próprio estudante nos sistemas oficiais; a Estuvia não os envia. Estados como candidatura, admissão e visto dependem de declaração do usuário, não de confirmação da universidade ou do consulado. Isso está refletido nos termos e no código e deve continuar claro na interface.

A carteira aceita arquivos de passaporte, comprovantes e outros documentos; a lista inclui certidão de antecedentes e atestado médico. Os arquivos são cifrados com AES-256-GCM em repouso e a chave fica no servidor. Isso protege os arquivos armazenados, mas **não é criptografia ponta a ponta**: a aplicação precisa conseguir decifrá-los para entregar o arquivo ao usuário. A IA não recebe os arquivos segundo o código examinado; quando ativada, a pergunta e o contexto da jornada são enviados ao provedor configurado.

O código contém proteção de senha com scrypt, sessão em cookie HttpOnly, controles de origem/CSRF, limitação de tentativas, cabeçalhos de segurança e armazenamento privado para documentos quando Supabase Storage é usado. São boas bases, mas não substituem configuração correta, revisão de acesso, gestão de chaves, backup e resposta a incidentes.

## 2. Bloqueadores antes de lançamento público

### P0 — Política e termos não podem ir ao ar como estão

`public/js/views/legal.js` apresenta a Política de Privacidade e os Termos como **“Rascunho”** e contém campos `[PREENCHER]` para controlador, CNPJ/endereço, contato, provedores, países, transferências internacionais, retenção, idade mínima, preço e foro. A tela de cadastro já recolhe aceitação, mas não há documentos completos para o usuário aceitar. O termo também traz uma limitação ampla de responsabilidade (“na máxima extensão permitida pela lei”); em relação de consumo, uma cláusula não pode eliminar direitos legais nem afastar automaticamente a responsabilidade por falha do serviço.

Antes de liberar contas reais, fechar com advogado e publicar uma versão identificável e datada, com: identidade do controlador/operador, canais de suporte e privacidade, finalidades e bases legais por categoria, fornecedores e países, regras de retenção e eliminação, direitos e procedimento de atendimento, idade mínima, preço/condições (inclusive se gratuito) e explicação correta sobre o que a Estuvia faz e não faz. O Marco Civil e a LGPD exigem transparência; o CDC mantém regras próprias de responsabilidade e invalida certas cláusulas abusivas.

### P0 — Consentimento de documentos está inconsistente

O modal em `public/js/components/documents/DocumentUpload.js` diz que “só você acessa”. A própria política esclarece que a chave de criptografia fica no servidor. Corrigir a promessa: informar que os arquivos são cifrados, que o servidor precisa decifrá-los para servi-los e quais acessos administrativos/técnicos são possíveis e auditados. Não chamar o recurso de “privado só para você” sem qualificação verificável.

O fluxo registra versão e data do aceite, o que é um bom começo, mas o consentimento é genérico para “documentos”. Como a carteira aceita atestado médico, pode haver dado pessoal sensível de saúde sob a LGPD. O controlador precisa validar uma base legal específica para cada categoria e uma apresentação destacada e informada para dados sensíveis; um aceite genérico de upload não resolve automaticamente isso. Também não encontrei um fluxo de revogação do consentimento de documentos: o endpoint visto registra aceite, sem opção equivalente de revogar. A política promete essa revogação.

**Decisão recomendada:** reduzir o risco retirando da nuvem os documentos cujo conteúdo não seja necessário, guardando somente checklist/estado e permitindo que o estudante mantenha os originais localmente. Se a carteira continuar, limitar categorias, explicar cada finalidade, implementar retirada do consentimento e exclusão, controlar acesso da equipe, registrar todo acesso privilegiado e formalizar backup, chave e retenção.

### P0 — Operadores e transferências internacionais sem identificação final

O código pode usar Vercel, Supabase, Resend, Anthropic ou endpoint compatível com OpenAI; há também integrações opcionais de pesquisa, vídeo e preços de viagem. Ainda não há uma lista final de quais estarão ativos, que dados recebem, países de armazenamento/acesso, suboperadores e prazos de retenção. A política mantém esses campos em aberto.

Faça um mapa de dados que cubra cada integração (incluindo conteúdo enviado ao Mentor e consultas de viagem/pesquisa), obtenha os contratos de operador/DPA, confirme regiões e suboperadores e escolha um mecanismo válido para transferências internacionais. A Resolução CD/ANPD nº 19/2024 prevê mecanismos como cláusulas-padrão contratuais e exige transparência sobre a transferência. Não basta escrever “adotamos salvaguardas” sem saber quais contratos e mecanismos realmente cobrem cada fornecedor.

### P0 — Definir exclusão, exportação e retenção de ponta a ponta

O endpoint de exclusão remove o usuário e aciona remoção dos documentos, registros do Radar e conteúdo da comunidade. Há, porém, dados que podem permanecer:

- eventos de auditoria são mantidos até o limite de 5.000 itens, sem prazo temporal de retenção definido no código;
- métricas de uso guardam IDs de usuários e são podadas por janela de 120 dias, mas a exclusão não remove explicitamente esses IDs;
- denúncias de usuários excluídos têm o identificador do autor removido, mas o texto livre da denúncia é mantido;
- a exportação JSON exclui notas administrativas e exporta metadados dos arquivos, não o conteúdo binário desses arquivos.

Defina por escrito o que é apagado, anonimizado ou retido e por qual base/prazo; implemente a mesma regra em contas, auditoria, métricas, comunidade, Radar, storage e backups. Remover apenas o identificador não basta se texto livre ainda puder identificar alguém. Garanta ao usuário acesso/baixar seus arquivos e explique claramente o escopo do export. A política precisa descrever exceções de retenção, inclusive registros legalmente obrigatórios.

O Marco Civil prevê guarda segura de registros de acesso por seis meses para determinados provedores de aplicações constituídos como pessoa jurídica e que atuam de forma organizada, profissional e econômica. Os eventos de auditoria do Estuvia não demonstram, por si só, que essa obrigação está atendida: a retenção é por quantidade e os logs completos de acesso devem ser confirmados com a hospedagem/proxy e com assessoria jurídica.

### P0 — Canal de privacidade, idade e prova de aceitação

A política diz que o serviço é para maiores de 18 anos, mas o formulário/API de cadastro não pede nem valida idade. Decida se menores serão excluídos e implemente uma barreira coerente; se forem aceitos, desenhe o fluxo de melhor interesse e representação/consentimento aplicável. A LGPD tem regra especial para crianças e adolescentes.

A conta registra `consentAt`, mas não uma versão identificável dos Termos/Política aceitos. Guarde evento, data/hora, versão/hash do texto apresentado e mecanismo de aceitação. Isso melhora a prova e permite avisar sobre mudanças relevantes. Também publique um canal funcional para direitos e reclamações. A indicação de encarregado pode ter exceção para certos agentes de pequeno porte, mas isso depende de enquadramento e risco; mesmo quando dispensado, deve existir canal de comunicação. Como há carteira de documentos potencialmente sensíveis, não presuma que a exceção se aplica sem avaliação.

## 3. Processo acadêmico e documental

O fluxo atual serve como organizador e preparador; não é um processo oficial integrado. Requisitos por mestrado, calendário, documentos, homologação/tradução/apostila, visto e condições consulares podem mudar e variar conforme pessoa, programa e chamada. Cada item marcado como obrigatório/condicional deve levar a uma fonte oficial, data de verificação e indicação de quando a regra é individual ou precisa de confirmação humana.

Há uma questão de calendário imediata. Na data desta auditoria, as datas gerais do DUA para 2026/27 já passaram, mas a UGR publicou em 5 de novembro um procedimento extraordinário para vagas remanescentes, com pedidos de 6 a 10 de novembro e somente para determinados mestrados. Para a próxima edição, 2027/28, não publique calendário como confirmado até existir chamada oficial. O Radar e o catálogo local ainda precisam de atualização bem-sucedida e evidência de cobertura/atualidade; a documentação de prontidão registra falha anterior de atualização e dados locais para 2026/27. O usuário deve ver “desatualizado/sem chamada oficial” em vez de datas inferidas.

Antes de cada ciclo, valide de ponta a ponta: oferta e requisitos no catálogo oficial, fases e calendários do DUA, processo extraordinário da UGR, documentos para cada fase, mensagens de erro e links externos. Teste também a rota de visto/chegada sem apresentar estimativa como decisão oficial. A publicação oficial da UGR deixa claro que a candidatura de mestrado é online pelo DUA.

## 4. Infraestrutura e operação

O repositório tem `vercel.json` e `api/index.js`, então há um caminho de implantação serverless na Vercel. Também existe execução local em `server/index.js`. A configuração padrão do banco é JSON local; em serverless isso não é persistência confiável. A opção atual para produção é configurar banco e storage duráveis (por exemplo, Supabase), validar buckets privados, políticas, região e chaves de servidor. **Não há evidência neste repositório de que uma URL de produção esteja publicada, nem de que região, contratos, segredos, TLS, recuperação de senha, monitoramento e restauração tenham sido validados ao vivo.**

`LANCAMENTO.md` ainda descreve JSON local como caminho principal e desaconselha Vercel; isso conflita com a integração Supabase/Vercel que hoje existe no código. Atualize o runbook para uma arquitetura única de lançamento. Antes de abrir ao público, validar em staging com credenciais reais: registro, recuperação de senha, envio/abertura/exclusão de arquivo, exportação e exclusão da conta, reinício/deploy, backup e restauração. Confirmar que `JWT_SECRET`, `DOCUMENTS_KEY`, credenciais Supabase e e-mail estão em secret manager e nunca no navegador/repositório. Definir MFA para conta administrativa, menor privilégio, revisão de acessos e procedimento de troca/restauração da chave.

Os testes automatizados anteriormente registrados no projeto passaram (237/237 e verificação de sintaxe 190/190), mas usam provedores/fixtures locais e não comprovam um deploy real, acessibilidade, fluxo em navegador, região contratual, transferências ou segurança operacional.

## 5. LGPD, GDPR e redução de risco jurídico

Mantenha um registro das operações de tratamento (dados, finalidades, base legal, sistema, operadores, país, retenção e controles), documente o teste de legítimo interesse quando usado e prepare um Relatório de Impacto à Proteção de Dados. A LGPD permite que a ANPD determine o relatório; para uma plataforma que guarda documentos de identidade e pode receber dados de saúde, preparar o RIPD antes do lançamento é uma medida prudente de prestação de contas, não uma afirmação de que a lei exige automaticamente um relatório em todo caso.

Crie um procedimento de incidente: canal de acionamento, responsável, contenção, preservação de evidências, avaliação de risco, contato com provedores, modelos de aviso e registro das decisões. Quando o incidente puder acarretar risco ou dano relevante, a regra da ANPD prevê comunicação à ANPD e aos titulares em três dias úteis, ressalvadas regras específicas.

O GDPR pode ser aplicável dependendo de onde o controlador/processador está estabelecido e de a plataforma oferecer serviços a pessoas localizadas na UE ou monitorar o comportamento delas lá. O assunto ser “estudar na Espanha”, por si só, não determina a aplicação. Como a plataforma trata candidatura e chegada na Espanha, faça uma análise territorial com advogado antes de decidir que só a LGPD vale; se o GDPR for aplicável, revisar bases, direitos, contratos, dados de saúde e criminais, segurança e prazos europeus.

Não há termo, CNPJ, cláusula ou seguro que impeça alguém de ajuizar uma ação ou elimine responsabilidade legal. O que reduz exposição é tratar menos dados, fazer promessas verdadeiras, manter informação oficial atualizada e rastreável, cumprir direitos e prazos, controlar acessos, corrigir falhas, documentar decisões e ter contratos/seguros adequados. Recomendo advogado de privacidade/consumidor para fechar a estrutura do negócio e revisar os textos, além de avaliar com corretor seguro cibernético e responsabilidade profissional/tecnológica. A estrutura societária pode organizar a atividade e o risco, mas não é imunidade pessoal automática.

## 6. Plano de lançamento por ordem

1. **Bloqueio legal:** completar e revisar Política/Termos, decidir idade mínima e preço, publicar contato e responsável, registrar versões aceitas.
2. **Documentos:** corrigir a mensagem do consentimento, fazer análise de base legal para dados de saúde, implementar revogação/exclusão e decidir se a carteira deve guardar documentos sensíveis.
3. **Mapa e fornecedores:** listar dados enviados e países de cada provedor, contratos de operador e mecanismo documentado de transferência.
4. **Direitos e retenção:** alinhar exportar/excluir com o que permanece em logs, métricas, denúncias e backups; criar calendário de retenção e processo de solicitação.
5. **Governança:** registro de tratamento, RIPD, canal de privacidade/encarregado conforme enquadramento e plano de incidentes.
6. **Processo de Granada/Andaluzia:** atualizar a chamada corrente, distinguir fase regular e extraordinária, não afirmar datas 2027/28 antes da fonte oficial, revisar documentos e cobertura dos mestrados.
7. **Produção:** selecionar host/DB/storage e região, configurar segredos e e-mail, backups/restauração, MFA/admin, monitoramento e smoke tests em staging.
8. **Aprovação final:** advogado revisa documentação; responsável técnico verifica evidências de produção; então liberar um piloto limitado e monitorado. Só ampliar após observar o fluxo real e corrigir falhas.

## 7. Fontes oficiais consultadas

- [Lei Geral de Proteção de Dados — LGPD, texto no Planalto](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)
- [Resolução CD/ANPD nº 19/2024 — transferências internacionais e cláusulas-padrão](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-19-de-23-de-agosto-de-2024)
- [ANPD — comunicação de incidente de segurança e prazo de três dias úteis](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis)
- [Resolução CD/ANPD nº 2/2022 — agentes de pequeno porte e canal de atendimento](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022)
- [Marco Civil da Internet — art. 15, guarda de registros de acesso](https://www.planalto.gov.br/ccivil_03/leis/l12965.htm)
- [Código de Defesa do Consumidor — arts. 14 e 51](https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm)
- [GDPR — Regulamento (UE) 2016/679, especialmente arts. 3, 9, 10, 28, 32 e 33](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng/)
- [Junta de Andalucía — calendário DUA de mestrados 2026/27 para títulos estrangeiros não homologados](https://www.juntadeandalucia.es/boja/2025/245/50)
- [Universidad de Granada — chamada extraordinária 2026/27, solicitação de 6 a 10 de novembro](https://saap.ugr.es/informacion/noticias/procedimiento-extraordinario)
- [UGR — pedido de admissão a mestrados via Distrito Único Andaluz](https://www.ugr.es/destacado/admision-estudios-master-curso-2026-2027)
