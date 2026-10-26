# 21 — Meus Documentos (carteira digital)

A carteira responde cinco perguntas: o que eu já tenho, o que falta, o que preparo agora, como consigo e quando vou precisar. Ela acompanha a jornada: mostra a etapa atual inteira e as etapas futuras só como prévia.

## Arquivos

| Arquivo | Papel |
|---|---|
| `server/content/documents.js` | Catálogo: ids, `DOC_STATUS` e `DOC_STATUS_LABEL` preservados. Também traz etapa, ícone, "o que é", passos de "como conseguir", antecedência e missão de preparo, além de `DOC_STAGES`, `DOC_STATUS_SIMPLE` e `PROCEDURES` |
| `server/document-engine.js` | Regras puras: personalização, visão por etapa, dashboard, próximo documento, `docsForMission`, sincronização com missões |
| `server/routes/documents.js` | API `/api/documents/*` e arquivos cifrados |
| `public/js/views/documents.js` | Tela `#/documentos[/<id>]`, onde `<id>` abre o painel do documento |
| `public/js/components/documents/*` | Componentes `MyFolder` (Minha pasta), `DocumentCard`, `DocumentDetailPanel`, `DocumentUpload` (com migração dos anexos locais), `MissionDocuments` (central da missão) e `shared` (status e evidências) |
| `public/css/documents.css` | Estilos, carregados pela própria tela |
| `tests/documents.test.js` | Testes de API: etapas, personalização, declaração, validade, agenda, envios, missões, arquivos e LGPD |

## Dados (compatível com o que já existia)

- `user.documents[docId]` continua sendo a fonte do status. As regras automáticas das missões (`docsCandidaturaProntos`) leem esse campo.
- `user.docRecords[docId]` guarda o que não é status:
  - origem: `declarado`, `missao` ou `manual`;
  - `aguardando` e `aguardandoDesde`;
  - `conferidoEm`;
  - `validade`;
  - `envios[]`, com procedimento, data e resultado;
  - `missaoSync` e `lembretes`.
- `user.docFiles[]` guarda os metadados dos arquivos: série e versão, nome, tipo, tamanho, iv e tag. O conteúdo fica cifrado em disco.

## Regras

- **Status na tela:** Pendente, Preparando, Pronto, Enviado, Precisa de atenção e Não necessário. Internamente seguem os 6 `DOC_STATUS`.
- **Estados de confiança separados:** declarado, anexado, conferido por você e aceito no procedimento (registrado por você). "Pronto" nunca significa validação oficial.
- **Etapas:** candidatura (rodadas 1 a 3), matrícula (4), visto (5 e 9), viagem (6) e vida na Espanha (7 e 8).
  - A etapa atual é a que contém a rodada atual da jornada.
  - Etapas futuras mostram só a prévia (quantidade e ícones), nunca a lista como pendência.
  - **Exceção:** documentos com `antecedencia` (comprovação financeira, apoio familiar, antecedentes) aparecem em "Comece cedo".
- **Reaproveitamento:** passaporte, carta de admissão, seguro e outros aparecem nas etapas seguintes como "reaproveitados", sem novo cadastro.
  - Envios são por procedimento: enviado ao DUA não vale como apresentado ao consulado.
  - Na etapa do visto, um passaporte enviado só ao DUA aparece como "Pronto".
- **Personalização:** sempre com dados do catálogo, que têm fonte, ou do próprio estudante. A IA nunca decide.

  | Documento | Regra |
  |---|---|
  | Certificado de idioma | Segue `program.idioma`. Se o mestrado não exige, vira "Não necessário" |
  | Antecedentes criminais e TIE | Só para estadas acima de 6 meses (fonte O6, inclusion.gob.es) |
  | Documentação do apoiador | Só com apoio familiar registrado no planejador |
  | Carta de bolsa | Só com bolsa concedida |

  Documento não necessário não conta como pendência.
- **Missões:** concluir a missão de preparo (`prepara`) promove o documento de pendente ou preparando para pronto.
  - Acontece uma vez por conclusão e nunca rebaixa um status. É feito ao abrir a carteira, sem hook em `completeMission`.
  - `GET /documents/missions/:jid/:mid` devolve `{ prontos, faltam, naoNecessarios }` para a central da missão.
- **Validade do passaporte:** se vence antes do fim previsto da estadia (início das aulas + duração), o documento fica "Precisa de atenção" e vira o próximo.
- **Agenda AI:** o lembrete (verificar, solicitar, validade, revisar) tem prévia; o evento só é criado com `confirmar: true`. Ele leva `origem: 'documentos'` e `documentoId`.
- **Mentor:**
  - `get_required_documents`, agora com `proximo` e rota de cada documento;
  - `get_document_guide`;
  - intents "como consigo…", "preciso apostilar…?" e "organizar meus arquivos".
  - O Mentor nunca afirma ter analisado um arquivo. Apostila e tradução só quando a fonte oficial pedir.

## Minha pasta

Bloco no topo da carteira (`public/js/components/documents/MyFolder.js`) com todos os arquivos num lugar só, para levar na viagem.

- `GET /documents/files` devolve a versão mais recente de cada arquivo, de qualquer etapa, e a lista de `tipos` para o seletor.
- Aceita qualquer documento do catálogo, inclusive de etapas futuras (ex.: carta de admissão durante a candidatura).
- **Outro documento** (`docId: pessoal`): RG, CNH, vacina etc. Exige `?rotulo=` (até 60 caracteres). Guarda só o arquivo: não cria status, etapa nem pendência. Nova versão herda o nome.

## Segurança dos arquivos

- PDF, PNG, JPG e WEBP até 10 MB. O tipo é conferido pelos bytes iniciais, não pelo cabeçalho.
- Limites: 60 arquivos e 150 MB por estudante, com limitador de taxa.
- Cifrados em disco com AES-256-GCM, em `DOCS_DIR` (padrão `data/docfiles/<userId>/`), fora de `public/`.
  - Defina a chave `DOCUMENTS_KEY` em produção e guarde um backup: sem ela os arquivos ficam ilegíveis. Sem essa variável, a chave é derivada do `JWT_SECRET`.
- Servidos só ao dono, autenticado, com `Cache-Control: private, no-store` e `nosniff`. Não existe URL pública permanente.
- LGPD: a exportação inclui os metadados (sem iv e tag). Excluir a conta apaga a pasta de arquivos.
- Anexos antigos, guardados só no navegador (IndexedDB `travessia-anexos`): a carteira oferece "Enviar para minha conta". As fotos de moradia (`:moradia:`) ficam no dispositivo.

## Próximos passos

- Perguntas de "o que você já tem?" para idioma e seguro no onboarding (hoje feitas na própria carteira).
- Pré-visualização de PDF dentro da página. Hoje o PDF abre em nova aba, porque a CSP bloqueia `blob:` e `frame`.
- Lista consular por consulado: o catálogo segue a lista geral. A lista oficial do consulado do estudante aparece na etapa do visto.
