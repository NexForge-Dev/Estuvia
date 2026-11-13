# Plano de produção da Estuvia

**Objetivo:** conduzir a Estuvia do estado atual até um piloto público pequeno, seguro e observável, com etapas, responsáveis, entregáveis e critérios claros para avançar.

**Escopo recomendado do primeiro lançamento:** piloto gratuito para brasileiros que planejam cursar um Máster Universitario público na Andaluzia. A Estuvia organiza e orienta; candidatura, matrícula e pedidos oficiais continuam nos sistemas competentes. Não incluir cobrança, promessa de admissão/visto, expansão geográfica ou ampliação de dados pessoais sem decisão específica.

**Como usar este plano:** mantenha uma pessoa responsável por cada tarefa, registre evidência do aceite e só avance quando os critérios da etapa forem atendidos. “Feito no código” e “validado no ambiente real” são estados diferentes.

## Estado inicial conhecido

- Há produto funcional extenso: jornadas, missões, agenda, documentos, financiamento, moradia, viagem, catálogo de mestrados, Radar, comunidade e Mentor. Consulte [README](../README.md) para o mapa de módulos.
- Há testes automatizados, CI e documentação de deploy, ambientes, banco, segurança e prontidão. Isso é uma base de engenharia, mas não prova que produção, integrações reais, acessibilidade ou fluxos de navegador foram validados.
- A auditoria em [26 — Auditoria de lançamento e LGPD](26-auditoria-lancamento-lgpd.md) registra bloqueios de privacidade, operação e atualidade editorial. A decisão nela é não abrir cadastro público nem upload de documentos antes de resolver esses itens.
- [LANCAMENTO.md](../LANCAMENTO.md), [25 — Production readiness](25-production-readiness.md) e [28 — DEV × PROD](28-ambientes-dev-prod.md) precisam ser conferidos entre si antes de executar comandos ou alterar infraestrutura: refletem descrições e datas que podem não corresponder ao mesmo estado. Trate o painel real da Vercel/Supabase e uma verificação ao vivo como fonte do estado operacional.
- O checkout tem alterações locais não commitadas, inclusive arquivos relacionados ao fluxo de candidatura. Faça inventário e preserve essas mudanças; não as inclua automaticamente numa release.
- As notas soltas em `fazer.txt` e `Plantos.txt` sugerem “equivalência de notas”, reembolso parcial condicionado a concluir todas as rodadas e integração com Idealista pendente de acesso. São decisões de escopo/comercial, não requisitos para o piloto gratuito. Registrar como decisões pendentes e não anunciar ou implementar promessa de reembolso sem modelo, termos e revisão apropriados.

## Decisão de lançamento

Começar com **piloto gratuito, limitado e acompanhado**, sem checkout. Definir antes do piloto: número de participantes, canal de suporte, duração, responsável por conteúdo, como receber relatos de erro e como suspender cadastros se houver incidente. Aumentar o público só depois de revisar evidências do piloto.

Se o objetivo for lançamento comercial, criar uma etapa adicional de modelo de negócio: preço, escopo pago, cancelamento/reembolso, suporte, impostos e revisão jurídica. Não misturar essa etapa com a aprovação do piloto gratuito.

## Etapas e portões de avanço

### Etapa 0 — Organizar o trabalho e congelar o escopo

**Objetivo:** ter uma versão candidata identificável e evitar adicionar módulos enquanto os bloqueios de lançamento continuam abertos.

**Tarefas**

- [ ] Nomear responsável de produto, técnico, editorial e privacidade/jurídico. Uma pessoa pode acumular papéis, mas cada papel precisa de um responsável explícito.
- [ ] Escolher o ciclo acadêmico alvo e os programas/universidades incluídos no piloto.
- [ ] Definir o que entra no piloto: cadastro, onboarding, jornada, missões, fontes, agenda e módulos realmente necessários para o fluxo escolhido.
- [ ] Decidir se a carteira de documentos com upload fica desligada no piloto. Recomendação: deixá-la desligada até consentimento, base legal, exclusão, retenção e acessos estarem validados.
- [ ] Revisar as alterações locais e decidir quais arquivos fazem parte da versão candidata; registrar o restante como trabalho em andamento.
- [ ] Criar quadro de tarefas com estado `A fazer / Fazendo / Bloqueado / Validar / Feito`, responsável, evidência e dependência.
- [ ] Resolver as diferenças documentais de arquitetura/estado entre `LANCAMENTO.md`, docs 25, 26, 28 e 29.

**Saída:** escopo de piloto escrito, versão candidata identificada, responsáveis nomeados e uma lista única de bloqueios priorizada. Nenhuma funcionalidade nova entra sem justificar qual hipótese ou bloqueio do piloto ela resolve.

### Etapa 1 — Fechar privacidade, confiança e regras do serviço (bloqueador)

**Objetivo:** não coletar dados reais com textos incompletos ou promessas divergentes.

**Tarefas**

- [ ] Preencher e obter revisão qualificada dos Termos e da Política: identidade do controlador, contato, finalidades, bases, operadores, regiões/países, transferências, retenção, direitos, idade, preço e escopo do serviço.
- [ ] Definir se o piloto é somente para maiores de 18 anos e fazer a interface/API cumprir essa regra.
- [ ] Corrigir a promessa do upload: cifragem em repouso não é criptografia ponta a ponta; explicar acesso técnico e privilegiado com precisão.
- [ ] Decidir se documentos sensíveis (saúde, antecedentes, identidade) podem ser enviados. Se não forem necessários, remover essas categorias do piloto e orientar armazenamento local.
- [ ] Implementar e conferir consentimento, revogação, exclusão e exportação conforme o texto final. Registrar versão e horário do texto aceito.
- [ ] Definir retenção e eliminação de logs, analytics, denúncias, conteúdo, arquivos e backups; testar a exclusão ponta a ponta.
- [ ] Mapear dados que cada integração recebe e confirmar contratos, suboperadores, localização e mecanismo de transferência aplicável.
- [ ] Publicar canal real de suporte e privacidade, procedimento de solicitações de titulares e plano de resposta a incidentes.
- [ ] Fazer análise de aplicabilidade LGPD/GDPR com profissional qualificado; preparar o registro de tratamento e avaliar RIPD.

**Saída:** textos aprovados e publicados, coleta coerente com eles, direitos exercitáveis e evidências dos testes de exportação/exclusão. Se upload de documentos continuar no escopo, todos os pontos específicos dessa função também precisam estar aprovados.

### Etapa 2 — Tornar o conteúdo confiável para o ciclo escolhido

**Objetivo:** cada orientação que possa influenciar candidatura, gasto ou visto tem fonte e status claros.

**Tarefas**

- [ ] Escolher programas piloto e validar ficha/requisitos diretamente em páginas oficiais de cada programa e no DUA.
- [ ] Revisar calendário e procedimentos do ciclo alvo apenas após publicação oficial. Mostrar “a confirmar” ou “sem chamada publicada” quando não houver fonte válida.
- [ ] Revisar missão por missão: ação, ordem, responsável, documento, exceções, link oficial, data de verificação e etiqueta (regra oficial, orientação prática, estimativa ou pendente).
- [ ] Confirmar valores financeiros e premissas do simulador; deixar visível que estimativas não são decisão consular.
- [ ] Testar Radar com dados reais e classificar cobertura, atraso, falhas e revisão humana. Não tratar coleta automática como confirmação editorial.
- [ ] Verificar conteúdo de bolsas/oportunidades e deixar explícito quando uma chamada não foi confirmada.
- [ ] Preparar processo recorrente de revisão editorial, responsável, cadência e atualização quando fonte muda.
- [ ] Avaliar equivalência de notas como item de conteúdo separado: confirmar procedimento e fonte oficial antes de orientar ou calcular.

**Saída:** matriz de conteúdo do piloto com 100% dos passos críticos ligados a fonte atual ou rotulados claramente como pendentes/estimativas; responsável e data da próxima revisão definidos.

### Etapa 3 — Preparar a operação técnica

**Objetivo:** executar uma arquitetura única em ambientes isolados, com dados duráveis e recuperação comprovada.

**Tarefas**

- [ ] Confirmar ao vivo os projetos DEV e PROD, referências, região, variáveis e provedor de storage; registrar evidência sem copiar segredos para documentos.
- [ ] Garantir que Preview/DEV nunca use credenciais nem dados de PROD e que produção não use armazenamento efêmero.
- [ ] Aplicar migrações na ordem documentada e verificar a barreira de ambiente antes de qualquer deploy.
- [ ] Configurar domínio, TLS, cookies seguros, `ALLOWED_ORIGIN`, e-mail de recuperação e segredos no gerenciador apropriado.
- [ ] Configurar conta administrativa com acesso mínimo, credenciais exclusivas e MFA quando suportado; definir revisão e revogação de acessos.
- [ ] Automatizar backup de banco e arquivos; guardar chave de documentos separadamente e controlar quem pode acessá-la.
- [ ] Fazer restauração em ambiente isolado usando backup real e medir se os dados e arquivos podem ser recuperados.
- [ ] Configurar monitoramento de `/api/health`, alertas de falha, logs sem segredos/dados excessivos, painel de erro e responsável de plantão.
- [ ] Confirmar limites e custos dos fornecedores para o piloto; definir cotas/desligamento da IA e de integrações opcionais.
- [ ] Atualizar o runbook com passos que foram realmente executados e contatos responsáveis.

**Saída:** deploy candidato em staging com isolamento comprovado, backup e restauração demonstrados, alertas recebidos e procedimento operacional utilizável por outra pessoa da equipe.

### Etapa 4 — Validar a experiência ponta a ponta

**Objetivo:** garantir que uma pessoa consegue concluir o fluxo central, entende os limites do serviço e encontra ajuda quando trava.

**Tarefas**

- [ ] Rodar verificações estáticas e automatizadas existentes como parte do CI da versão candidata.
- [ ] Executar smoke test em staging: cadastro, consentimento, onboarding, jornada, salvar programa, missão, atualização de progresso, logout, recuperação de senha, exportação e exclusão.
- [ ] Cobrir uploads apenas se foram aprovados na Etapa 1: envio, abertura, remoção, revogação e confirmação no storage.
- [ ] Fazer testes manuais de navegador em celular e desktop, incluindo teclado, foco, contraste, erros de formulário e textos de ajuda.
- [ ] Fazer teste moderado com pelo menos 5 pessoas do público-alvo: pedir que completem tarefas sem orientação; observar entendimento do próximo passo, fontes, alertas e estados autodeclarados.
- [ ] Verificar acessibilidade básica e privacidade por padrão; registrar problemas com severidade, responsável e prazo.
- [ ] Exercitar fluxo de incidente e de contato do usuário, incluindo quem decide suspender cadastro e como comunicar indisponibilidade.
- [ ] Não considerar teste automatizado equivalente a teste de navegador, de provedor real, de segurança ou de conformidade.

**Saída:** nenhum defeito crítico ou alto aberto nos fluxos centrais; evidência de cada teste; problemas restantes aceitos com responsável e prazo; usuários conseguem dizer o próximo passo e distinguir orientação de decisão oficial.

### Etapa 5 — Piloto controlado

**Objetivo:** observar uso real com alcance e suporte compatíveis com a capacidade da equipe.

**Tarefas**

- [ ] Convidar um grupo pequeno e definido de participantes; informar que é piloto, quais funções estão disponíveis e como pedir ajuda.
- [ ] Acompanhar falhas técnicas, recuperação de conta, dúvidas editoriais, conteúdo desatualizado e solicitações de privacidade.
- [ ] Medir somente indicadores necessários: ativação (perfil/jornada), salvamento de programa, conclusão do primeiro passo, retorno e erros. Evitar analytics identificável sem necessidade e base apropriada.
- [ ] Fazer revisão semanal de feedback e incidentes; priorizar correções que impedem tarefa, induzem erro ou criam risco de privacidade.
- [ ] Confirmar que as fontes continuam atuais durante o piloto; pausar conteúdo ou Radar quando não houver evidência confiável.
- [ ] Documentar decisões e comunicar mudanças relevantes aos participantes.

**Saída:** piloto conclui o período definido, nenhum incidente grave sem tratamento, métricas e entrevistas respondem às hipóteses do produto, e há decisão registrada: corrigir e repetir, expandir ou encerrar.

### Etapa 6 — Abrir gradualmente e operar continuamente

**Objetivo:** ampliar somente o que a operação consegue sustentar.

**Tarefas**

- [ ] Aprovar formalmente o go/no-go com responsáveis de produto, técnico e privacidade.
- [ ] Aumentar convites em etapas, com limite de usuários e capacidade de atendimento definidos.
- [ ] Rever métricas, custos, backup, incidentes, chamados, falhas de fontes e acessos administrativos em cadência fixa.
- [ ] Fazer revisão editorial antes de cada novo ciclo acadêmico e após qualquer mudança oficial relevante.
- [ ] Fazer exercício periódico de restauração e simulação de incidente.
- [ ] Revisar decisões de escopo antes de adicionar comercialização, mais países, novos provedores ou documentos sensíveis.

**Saída:** cada aumento de escala tem capacidade, monitoramento, conteúdo, suporte e custo aprovados; decisões e evidências ficam registradas.

## Ordem de prioridade e dependências

| Prioridade | Entrega | Depende de |
|---|---|---|
| P0 | Escopo e versão candidata definidos | Nenhuma |
| P0 | Termos, privacidade, idade, retenção e direitos coerentes | Escopo e mapa de dados |
| P0 | Conteúdo oficial atual para o ciclo/programas escolhidos | Escopo do piloto |
| P0 | DEV/PROD isolados, segredos, storage durável, backup/restauração | Arquitetura confirmada |
| P0 | Smoke test, fluxo de suporte e incidente em staging | P0 acima |
| P1 | Piloto com participantes e acompanhamento | Gate de staging aprovado |
| P1 | Revisões e correções pós-piloto | Evidência do piloto |
| P2 | Monetização, reembolso, integração comercial com Idealista, expansão regional | Validação do piloto, decisão de negócio e revisão legal/contratual |

## Painel de acompanhamento

Copie uma linha por tarefa no seu quadro. Uma tarefa só vira `Feito` quando a coluna evidência contém link, captura, log ou registro de decisão suficiente para outra pessoa conferir.

| ID | Etapa | Tarefa | Responsável | Estado | Bloqueio/dependência | Evidência | Próxima revisão |
|---|---|---|---|---|---|---|---|
| P0-01 | 0 | Fechar escopo, público e ciclo do piloto | Produto | A fazer | — | — | — |
| P0-02 | 0 | Inventariar alterações locais e formar versão candidata | Técnico | A fazer | P0-01 | — | — |
| P0-03 | 0 | Reconciliar runbooks e confirmar arquitetura nos painéis | Técnico | A fazer | Acesso a Vercel/Supabase | — | — |
| P0-04 | 1 | Revisar Política/Termos, idade, canal e consentimento | Privacidade/jurídico | A fazer | P0-01, mapa de dados | — | — |
| P0-05 | 1 | Fechar retenção, exportação, exclusão e carteira | Técnico + privacidade | A fazer | P0-04 | — | — |
| P0-06 | 2 | Validar programas, calendário e missões | Editorial | A fazer | P0-01 | — | — |
| P0-07 | 3 | Configurar staging, backup, restauração e monitoramento | Técnico | A fazer | P0-03 | — | — |
| P0-08 | 4 | Executar smoke test e teste moderado | Produto + técnico | A fazer | P0-04 a P0-07 | — | — |
| P1-01 | 5 | Abrir piloto limitado e revisar semanalmente | Produto | A fazer | Gate P0 aprovado | — | — |

## Critérios de go/no-go

**Não abrir cadastro público** enquanto houver qualquer um destes pontos: textos legais em rascunho; idade e consentimento inconsistentes; direitos de exportar/excluir não demonstrados; integrações e transferências desconhecidas; produção sem isolamento/backup restaurável; falha crítica nos fluxos; informação oficial vencida apresentada como confirmada; canal de suporte sem responsável.

**Autorizar piloto limitado** quando todos os bloqueios acima estiverem resolvidos ou quando a função correspondente tiver sido efetivamente removida/desativada do escopo, testes de staging tiverem evidência, responsáveis estiverem disponíveis e o grupo/tamanho do piloto estiverem definidos.

**Autorizar expansão** após analisar os dados do piloto, corrigir problemas altos, confirmar capacidade de suporte, operação, atualização editorial e custos.

## Referências internas

- [Runbook de lançamento](../LANCAMENTO.md)
- [Auditoria de lançamento e LGPD](26-auditoria-lancamento-lgpd.md)
- [Production readiness](25-production-readiness.md)
- [Ambientes DEV e PROD](28-ambientes-dev-prod.md)
- [Modelo do banco](29-banco-de-dados.md)
- [Visão de produto](01-visao-produto.md)
- [Jornada Estuvia](13-jornada-estuvia.md)
- [Próximos passos históricos](10-proximos-passos.md)
