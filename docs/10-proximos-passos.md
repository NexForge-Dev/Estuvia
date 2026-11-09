# 10 — Próximos passos

## Ciclos (do documento de visão)

| Ciclo | Entrega | Status |
|---|---|---|
| 0 — Base editorial | Manual convertido em regras, tarefas e fontes | ✅ `server/content/` |
| 1 — Protótipo | Perfil, catálogo piloto, ficha, roadmap e tarefas | ✅ |
| 2 — MVP | Preferências, status manual, orçamento, fontes, IA, gamificação | ✅ (calendário 2026/27 cadastrado no Radar; próximo ciclo depende de publicação oficial) |
| 3 — Validação | Entrevistas, usabilidade, disposição a pagar | ⏳ próximo |
| 4 — Andaluzia | Mais universidades e cursos com revisão editorial | ⏳ |
| 5 — Expansão | Comunidade, oportunidades, novas regiões | ⏳ |

## Técnico (em ordem de prioridade)

1. **Banco de dados:** PostgreSQL, reimplementando `server/store.js` (ver `03-arquitetura.md`).
2. **Recuperação de senha e verificação de e-mail.**
3. **Catálogo real por programa:** o Radar cobre 138 mestrados UGR em 2026/27. Verificar requisitos acadêmicos, idioma, documentos e oferta de cada programa diretamente na ficha oficial antes de recomendar candidatura; o coletor atual não confirma idioma nem todos os requisitos.
4. **Calendário (RF-08):** importar e revisar o calendário de cada novo ciclo assim que houver publicação oficial, com fonte. Lembretes por e-mail continuam pendentes; data sem fonte não gera alerta.
5. **Painel editorial (RF-10):** tela para cadastrar requisito, fonte, data de revisão e status, com alerta de regra vencida.
6. **Avaliação do Guia:** conjunto de perguntas reais com resposta esperada.
7. **Analytics com privacidade** para as métricas de ativação e uso contínuo.
8. **Deploy:** container ou PaaS com HTTPS e `NODE_ENV=production`.
9. **Conferência visual no celular** (doc 22, seção 7): a camada minimalista e a barra inferior foram feitas sem teste em navegador.
10. **Minha pasta offline:** guardar no aparelho uma cópia dos arquivos marcados "levar na viagem", para abrir no aeroporto sem internet (PWA).
11. **Testes do Radar:** `tests/radar.test.js` (critérios 7–10 e 11–14) falham hoje, provavelmente por datas fixas que já passaram. Corrigir antes do próximo ciclo.

## Validação (antes de construir mais)

- Entrevistar 12–15 pessoas: interessados, candidatos em processo e recém-chegados.
- Teste moderado com 5 usuários: eles identificam o próximo passo? Entendem as etiquetas?
- Medir se a gamificação aumenta o retorno (H2).
- Teste de interesse em recursos pagos (H5).

## Decisões em aberto

Nome e marca · cursos-piloto · canais de alerta · modelo de atualização editorial · escopo final do planejador financeiro · política de monetização.
