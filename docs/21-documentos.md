# 21 — Minha Carteira de Documentos

A carteira responde, ao abrir: **"Estes são os documentos que preciso agora, estes já tenho, estes estão pendentes, e aqui descubro como conseguir cada um."**

Ela é um cofre digital personalizado. Cada documento existe uma vez só e serve a todas as etapas e missões que o usam. A tela principal mostra só o que importa no momento: o resto fica em categorias que se abrem uma de cada vez.

## Arquivos

| Arquivo | Papel |
|---|---|
| `server/content/document-catalog.js` | **Catálogo**: 17 categorias, ~185 tipos de documento, o uso de cada um por categoria (244 itens), condições do estudante, estados, papéis de arquivo e guias de apostila e tradução |
| `server/content/documents.js` | Mescla o catálogo com os campos da primeira versão (os 25 ids antigos continuam iguais) e exporta `DOCUMENTS` no formato que missões, Mentor e admin já usam |
| `server/document-engine.js` | Regras puras: condições, aplicabilidade por uso, estado detalhado, validade, itens-checklist, painel, categorias, busca e integração com missões |
| `server/document-rules.js` | Revisões editoriais (aviso, data, fontes) gravadas em `data/document-rules.json` |
| `server/routes/documents.js` | API `/api/documents/*`, arquivos cifrados, consentimento e links assinados |
| `server/routes/admin.js` | `GET/PUT /api/admin/document-rules[/:docId]` (só admin) |
| `public/js/views/documents.js` | Tela `#/documentos[/<id>]` |
| `public/js/components/documents/*` | `DocumentDetailPanel`, `DocumentUpload` (prévia, papel, consentimento), `MissionDocuments` (central da missão), `MyFolder`, `shared` |
| `tests/documents.test.js`, `tests/wallet.test.js` | Testes de API |

## Catálogo

**Categorias:**

1. Pessoais
2. Acadêmicos brasileiros
3. Candidatura
4. Admissão e matrícula
5. Financeira
6. Visto
7. Saúde
8. Moradia
9. Viagem
10. Empadronamiento
11. NIE e TIE
12. Universidade na Espanha
13. Banco
14. Trabalho e estágios
15. Familiares
16. Complementar
17. Renovação

Cada categoria tem nome, ícone, descrição e etapa da jornada.

**Documento canônico (`DOC_TYPES`):**

- **Textos:** o que é, para que serve, onde conseguir e quando solicitar. Quando o documento não traz algum deles, vale o padrão da categoria (`CATEGORY_DEFAULTS`).
- **Apostila e tradução:** `'talvez'` ou `'nao'`. Nunca são "sempre".
- **Validade:** `'data'` (tem vencimento impresso) ou `'recencia'` (o órgão pode exigir emissão recente; não inventamos prazo).
- **Arquivos:** `partes` (frente/verso) e `multiplos`.
- **Referências:** `fontes`, missões extras, `agregado` (item-checklist que reúne outros documentos) e `atendidoPor` (ex.: a média final pode estar no histórico).

**Uso por categoria (`CATEGORY_USES`):** `[docId, classe O/C/R, { cond, condicao, rotulo, nota, etapa }]`.

- **Referências, não cópias:** o passaporte é um documento só. Aparece em pessoais, visto, viagem, NIE/TIE, banco, trabalho e renovação, cada vez com o rótulo daquele uso (ex.: "Cópia do passaporte").
- **`etapa`:** usada quando o momento do uso difere da categoria. A foto e o comprovante de residência são pessoais, mas são usados no visto.

## Classificação contextual

| Uso | Condição do estudante | Exigência mostrada |
|---|---|---|
| O | sem condição, ou condição confirmada | **Exigido para você** |
| O ou C | condição ainda desconhecida | **A confirmar** |
| C | condição confirmada (ex.: curso > 6 meses → EX-17) | **Exigido para você** |
| C | sem condição verificável (ex.: "se o programa pedir") | **Conforme o caso** |
| R | — | **Recomendado** |
| qualquer | condição falsa | **Não se aplica** (fora das pendências) |

Um documento usado em várias categorias recebe a exigência mais forte entre os usos que valem.

A contagem de pendências só inclui o que é **exigido para você**. "Conforme o caso" e "Recomendado" aparecem nas categorias, mas não assustam como pendência.

### Minha situação (condições)

- **Detectadas pela jornada:**
  - moro no Brasil (perfil);
  - curso > 6 meses (duração);
  - certificado de espanhol (ficha do mestrado);
  - bolsa concedida e patrocinador (finanças);
  - visto aprovado e chegada (jornada).
- **Informadas pelo estudante (padrão "não"):**
  - acompanhantes, cônjuge, filhos, menor de idade;
  - representante, mudança de nome, diploma pendente, outras graduações;
  - residência em outros países, necessidades especiais;
  - medicamentos, animal, veículo, NIE anterior;
  - trabalho, renovação.

Tudo pode ser corrigido em **Minha situação** (`PUT /documents/conditions`). `null` volta ao valor detectado.

Exemplos:

- Curso de até 6 meses: EX-17, TIE e antecedentes viram "Não se aplica".
- Sem acompanhantes: a categoria 15 fica oculta.
- Sem intenção de renovar: a categoria 17 fica fora da jornada principal.
- Bolsa concedida: a documentação da bolsa passa a ser exigida.
- Visto aprovado: o foco ("Seus próximos documentos") passa para viagem e moradia.
- Chegada registrada: o foco passa para empadronamiento, TIE e matrícula.

## Estados (12)

| Estado | Status interno (lido pelas missões) |
|---|---|
| Não iniciado · Preciso solicitar | `pendente` |
| Aguardando emissão · Documento recebido · Arquivo enviado · Precisa de tradução · Precisa de apostilamento | `em-preparacao` |
| Pronto para utilização | `pronto` (ou `enviado`, com registro de envio) |
| Precisa de correção · Vencido | `correcao` |
| Dispensado · Não aplicável | `nao-se-aplica` |

- **Onde fica:** `user.documents[docId]` continua sendo a fonte do status. O estado detalhado fica em `docRecords[docId].estado`, junto com o `estadoBase` em que foi registrado. Se o status mudar por outro caminho (missão, Mentor, envio), o estado volta a ser derivado.
- **Calculados, nunca escolhidos à mão:** "Vencido" (validade passada) e "Não aplicável" (pelas condições).
- **Apostila/tradução:**
  - Marcar "o órgão pediu" num documento pronto o leva para "Precisa de apostilamento" (ou tradução).
  - Anexar um arquivo com papel `apostila`/`traducao` marca a apostila (ou tradução) como pronta.
  - A Estuvia nunca marca apostila ou tradução como necessárias sozinha.
- **Confiança, sempre separada:** declarado · anexado · conferido por você · aceito no procedimento (registrado por você). A Estuvia verifica só se o arquivo existe; nunca afirma aprovação oficial.

## Arquivos

- **Formatos:** PDF, JPG/JPEG, PNG e WEBP, até 10 MB. O tipo é conferido pelos bytes.
  - PDFs com conteúdo ativo (`/JavaScript`, `/OpenAction`, `/Launch`, arquivos embutidos, XFA) são recusados.
- **Limites:** 80 arquivos e 200 MB por estudante.
- **Papel do arquivo:**
  - Valores: original, frente, verso, documento apostilado, apostila, tradução, comprovante da tradução, cópia, outro.
  - Agrupamento: arquivos com papéis diferentes ficam no mesmo documento. Diploma original, apostilado e traduzido são três arquivos de um só documento.
- **Antes de salvar:** prévia, nome sugerido (editável) e papel. Depois, dá para corrigir papel e nome (`PATCH /documents/files/:fid`).
- **Versões:**
  - Substituir cria uma nova versão na mesma série.
  - Com "Guardar versões antigas" desligado (`PUT /documents/prefs`), a versão anterior é apagada do disco.
- **Upload opcional:** marcar "Já tenho" conclui sem enviar arquivo sensível.

## Segurança e privacidade

- **Acesso:**
  - Sessão obrigatória em todas as rotas e autorização por estudante (um não acessa o arquivo do outro).
  - Sem URL pública: cada link de arquivo é **assinado (HMAC) e expira em 15 min**, válido só para o dono.
- **Armazenamento:**
  - Arquivos cifrados em disco (AES-256-GCM) em `DOCS_DIR`, fora de `public/`.
  - Em produção, defina `DOCUMENTS_KEY` e faça backup da chave.
- **Na entrega:** `Cache-Control: private, no-store`, `nosniff`, e imagens servidas em `sandbox`.
- **Consentimento:**
  - Exigido antes do primeiro arquivo (`POST /documents/consent`, versão `2026-10-27`).
  - O texto diz que os arquivos não vão para IA nem para treino de modelos e que podem ser excluídos.
  - Arquivos guardados antes desta versão continuam acessíveis; o consentimento só é pedido para novos envios.
- **Credenciais:** observações, emissor, notas de envio e nomes de "Outro documento" recusam texto que pareça senha, PIN, CVV, token ou código de acesso.
- **Exclusão e portabilidade:**
  - Exclusão definitiva de todos os arquivos (`DELETE /documents/files` com `{ confirmar: 'EXCLUIR' }`).
  - Exclusão da conta apaga a pasta.
  - A exportação (LGPD/RGPD) inclui metadados, condições, consentimento e preferências, sem iv e tag.
- **Mentor:** não lê arquivos.

## Integração com missões

- **Quais documentos cada missão usa:** `documentos` das missões em `rounds.js`, mais `prepara`, mais `missoes` do catálogo (ex.: foto e cita da TIE → missões 8.x).
- **Contrato (`GET /documents/missions/:jid/:mid`):** devolve `{ prontos, faltam, conformeCaso, naoNecessarios }`. Cada item traz uma mensagem como "Você ainda não adicionou seu histórico à Carteira." e, quando é o caso, `atendivelPor`.
- **Na central da missão:** cada documento oferece *Enviar arquivo*, *Já tenho*, *Meu histórico já mostra isso* e *Ver como conseguir*.
- **Nos dois sentidos:**
  - Atualizar na carteira atualiza todas as missões.
  - Concluir a missão de preparo promove o documento (uma vez, sem rebaixar).
  - As regras automáticas das missões continuam lendo `user.documents`.

## Validade e alertas

- **Documentos com `validade: 'data'`** (passaporte, visto, seguro, TIE, CNH…): registram a data de vencimento.
  - Alerta quando falta menos que a janela escolhida (padrão 60 dias; 30, 90 ou 180).
  - Passaporte, visto e seguro também alertam se vencem antes do fim previsto da estadia.
  - Data passada → "Vencido".
- **Documentos com `validade: 'recencia'`** (antecedentes, atestado, extratos, certidões, empadronamiento): registram a data de emissão. Depois de 90 dias aparece um aviso para conferir o prazo aceito na fonte, nunca um vencimento inventado.
- **Diploma e documentos sem validade** não aceitam data de vencimento.

## Fontes e revisão das regras

- Cada documento aponta fontes de `content/sources.js`. As fontes O18 a O27 foram acrescentadas e conferidas em 27/10/2026: CNJ (apostila), Policía Nacional, cita previa, MAEC, PF (antecedentes e passaporte), tradutores juramentados, Seguridad Social, Receita e Ministério da Saúde.
- **Para mudar uma regra:** edite o catálogo (todas as telas leem dele) ou registre uma revisão editorial pelo admin:
  - `aviso`: texto curto mostrado no detalhe;
  - `revisadoEm`: data da revisão;
  - `fontes`: substituem as do catálogo.
- O detalhe mostra "Informação revisada em…" e lembra que regras mudam.

## Ordem fixa: necessários → opcionais → contingência

Em toda a plataforma (carteira, categoria, missão, rodada e busca), os documentos aparecem nesta ordem:

| Grupo | O que é | Exigência interna |
|---|---|---|
| **Documentos necessários** | Exigidos para o seu caso | `requerido` |
| **Documentos opcionais** | Não são exigência, mas ajudam | `recomendado` |
| **Documentos de contingência** | Só se o procedimento pedir ou a sua situação mudar | `condicional` / `verificar` |

Na missão e na categoria, "Necessários" fica aberto e os outros grupos ficam recolhidos.

## Missões e rodadas → Documentos

- **Missão de preparo:** concluir a missão que prepara o documento (`prepara`) grava o documento como pronto na Carteira **na mesma gravação**, inclusive quando a conclusão vem pelo Mentor. Exemplo: 2.1 Preparar meu passaporte → Passaporte.
  - A resposta traz o evento `carteira`, e a tela avisa "Guardado na sua Carteira".
  - Missões de preparo: 2.1 a 2.6, 3.6, 3.7, 4.5, 4.6, 5.4, 5.5, 5.7, 5.9, 6.3, 7.9, 8.3 a 8.6 e 8.8.
- **Central da missão:** toda missão que usa documento mostra o card **Documentos desta missão**. O arquivo enviado ali vai para a Carteira, na categoria certa, com a missão de origem registrada (`missaoId`).
  - O bloco antigo, que guardava o anexo só no navegador, foi substituído.
- **Rodada:** a tela da rodada mostra "Documentos · X/Y prontos" e o que falta (`GET /documents/rounds/:jid/:n`).
- **Na Carteira:** o documento mostra a rodada e a missão de onde vem ("é aqui que você consegue este documento").

## Tela (simples)

1. **Topo:** título e três números (prontos, para fazer, atenção).
2. **Para agora:** até 5 documentos da etapa atual, mais "Comece cedo" (recolhido).
3. **Busca:** os filtros ficam escondidos no botão "Filtros".
4. **Categorias:** quadradinhos com ícone, nome e "3/6". Abrem uma de cada vez.
5. **Linhas recolhidas:** categorias que não se aplicam, Minha situação, Minha pasta e Privacidade.
6. **Detalhe do documento:** "Você já tem?" (Já tenho · Preciso pedir · Já pedi · Ajuda) e os arquivos. O resto fica recolhido.

## Próximos passos

- Conferência visual no navegador (desktop e celular). As telas foram feitas sem teste em navegador.
- Pré-visualização de PDF dentro da página. Hoje o PDF abre em nova aba, porque a CSP bloqueia `blob:`.
- Listas por consulado: hoje a lista é a geral, com o link do consulado do estudante.
- Migrar o armazenamento para um serviço de objetos com cifra no servidor, mantendo a mesma interface.
