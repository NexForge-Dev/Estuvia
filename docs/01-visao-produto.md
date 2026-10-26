# 01 — Visão e produto

> **Documento da versão 0.1 (Travessia, 6 fases).** A versão atual (Estuvia: 8 rodadas + trilha de financiamento, Agenda AI, financiamento, moradia, viagem) está descrita em [13 — Jornada Estuvia](13-jornada-estuvia.md).

**Versão:** 0.1 · **Data:** 24/10/2026 · **Status:** MVP funcional para validação
**Mercado-piloto:** brasileiros que desejam cursar Máster Universitario em universidade pública da Andaluzia
**Origem:** manual "Roteiro — Como se inscrever em um Mestrado na Universidad de Granada (UGR)" [M]

## 1. Problema

Uma pessoa formada no Brasil que quer fazer mestrado na Espanha precisa resolver muita coisa por conta própria:

- descobrir os cursos e verificar se a graduação dela dá acesso;
- organizar a candidatura no Distrito Único Andaluz (DUA) e acompanhar as adjudicações;
- fazer a matrícula e preparar o visto (recursos financeiros, seguro, antecedentes, traduções);
- encontrar moradia, viajar e resolver os trâmites locais (empadronamiento, TIE).

As fontes estão espalhadas entre órgãos públicos, universidades, consulados e serviços comerciais. Pequenos erros de ordem, prazo ou documentação atrasam a viagem ou geram custo.

## 2. Solução

Uma plataforma web que transforma esse processo em uma **jornada em 6 fases, como um jogo**. Cada missão diz **o que fazer, como fazer, com qual documento e com qual fonte oficial**. O estudante ganha XP, sobe de nível e desbloqueia conquistas a cada etapa.

### Pilares

1. **Saber onde ir.** O mapa da jornada sempre destaca o próximo passo.
2. **Saber como fazer.** Cada missão traz passos práticos e fontes.
3. **Tirar dúvidas na hora.** O Guia (IA) responde ancorado nas fontes e admite quando não sabe.
4. **Acreditar que é possível.** Gamificação, celebração de conquistas e o "meu porquê" sempre visível.
5. **Ser parte da família.** A plataforma é do estudante: avatar, cores, tema, metas, dicas personalizadas e linguagem acolhedora.
6. **Confiança.** Toda informação tem etiqueta e fonte.

### Proposta de valor (hipótese)

> "Da escolha do mestrado à instalação na Espanha: um caminho personalizado que mostra o próximo passo, o documento necessário, a fonte oficial e o impacto financeiro da decisão."

## 3. Etiquetas obrigatórias de conteúdo

| Etiqueta | Significado | Exemplo |
|---|---|---|
| **Fonte oficial verificada** | Regra conferida em norma ou página oficial, com URL e data de revisão | Até seis opções na solicitação DUA 2026/27 |
| **Orientação prática** | Sugestão da experiência do manual, sem ser obrigação legal | Pesquisar moradia ao receber a aprovação |
| **Estimativa** | Valor ou duração com premissas explícitas | Orçamento de aluguel e transporte |
| **Pendente de confirmação** | Depende do curso, consulado, ano ou situação pessoal | Necessidade de DELE/SIELE em um programa |

## 4. Persona principal

**Perfil:** brasileiro(a) com graduação concluída, morando no Brasil, interessado(a) em mestrado oficial na Andaluzia e com pouca familiaridade com o processo espanhol. Pode ter recursos limitados e precisa comparar opções antes de decisões caras.

**Dores:** não saber por onde começar, descobrir tarde a exigência de idioma, documentação incompleta, perder uma adjudicação, subestimar custos e depender de grupos informais para entender visto e TIE.

**Objetivo:** encontrar um curso compatível, completar o processo correto e chegar à Espanha com menos incerteza.

## 5. Escopo

**Dentro:** mestrados oficiais de universidades públicas andaluzas pelo DUA, candidatura a partir do Brasil, pré-partida e chegada.

**Fora (por enquanto):** graduação, doutorado, títulos propios, universidades privadas, agenciamento consular, garantia de admissão, envio automático ao DUA, aconselhamento jurídico individual e venda de passagens.

## 6. Hipóteses a validar

- **H1.** O maior valor está na execução guiada da jornada, e não em uma coleção de artigos.
- **H2.** Os usuários usarão o roadmap por semanas e voltarão a cada nova etapa (a gamificação reforça isso).
- **H3.** Requisitos explicados com fontes oficiais geram mais confiança que respostas genéricas de IA.
- **H4.** O planejamento financeiro integrado ajuda a escolher cidade e data.
- **H5.** Existe disposição a pagar por recursos avançados (preço e modelo ainda desconhecidos).

## 7. Modelos de negócio (hipóteses)

- **Freemium:** jornada essencial e fontes oficiais gratuitas, recursos premium de planejamento e acompanhamento.
- **B2B/B2B2C futuro:** parceria com universidades e comunidades, só com acordo formal.
- **Indicação de serviços:** parceiros identificados, transparência de conflitos e nenhuma interferência no conteúdo oficial.

Antes de definir preço, a pesquisa inicial precisa medir a disposição a pagar.

## 8. Métricas iniciais

| Métrica | Definição |
|---|---|
| Ativação | % de novos usuários que completam o perfil e salvam um programa |
| Compreensão | % que indica o próximo passo correto em teste moderado |
| Confiabilidade | % de regras publicadas com link oficial, ano e data de revisão |
| Uso contínuo | Retorno após mudança real de etapa (status declarado) |
| Progresso | Missões concluídas e fases finalizadas (autodeclarado) |
| Monetização | Interesse em recursos pagos, medido em entrevistas e testes |

## 9. Riscos principais

| Risco | Tratamento |
|---|---|
| Normas e calendários mudam todo ano | Conteúdo versionado por ciclo e data de revisão em cada fonte |
| Confundir orientação com assessoria oficial | Avisos visíveis e links para os sistemas oficiais |
| IA inventar instruções | Respostas limitadas à base, com citação e fallback para a base verificada |
| Requisito de idioma varia por curso | Nunca inferir pela universidade; status "verificar" até haver fonte |
| Parceria parecer vínculo oficial | Nunca usar marca universitária sugerindo convênio inexistente |
| Abandono após a candidatura | Fases 3–6 e conquistas que mantêm o engajamento |
