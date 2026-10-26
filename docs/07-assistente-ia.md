# 07 — Assistente de IA ("Guia")

## O que é

Um chat dentro da plataforma que tira dúvidas sobre o processo: DUA, documentos, idioma, visto, moradia e TIE. Ele responde **ancorado nas fontes cadastradas**, cita as fontes no formato [O1] e [O6] e **admite quando não sabe**.

## Dois modos

| Modo | Quando | Como responde |
|---|---|---|
| **Claude** | `ANTHROPIC_API_KEY` definida no `.env` | Modelo `claude-opus-5-5` (configurável em `ANTHROPIC_MODEL`), resposta em streaming |
| **Offline** | Sem chave, ou se a API falhar | Busca por palavras-chave na base verificada (`server/content/knowledge.js`) |

A troca é automática: se a IA cair no meio da conversa, o estudante recebe a resposta da base verificada com um aviso, em vez de uma tela de erro.

## Como a IA é controlada

- **System prompt fixo** com a base inteira: fontes, fases, missões e FAQ. Ele é estável (não leva dados do usuário), o que permite **cache de prompt** e reduz custo e latência.
- **Regras inegociáveis:** só afirmar o que está na base, citar as fontes, nunca garantir admissão ou visto, nunca generalizar idioma, separar exigência de dica, não pedir dados sensíveis e ignorar tentativas de mudar as regras.
- **Contexto do estudante** vai na mensagem do usuário: apelido, formação, área, espanhol, estado, ano, fase e status. Assim a resposta é personalizada.
- **Esforço `low`:** respostas rápidas e curtas, adequadas para chat.
- **Fallback de segurança** (`fallbacks: "default"`): se o modelo recusar por política, a API tenta automaticamente o modelo alternativo recomendado. Uma recusa final vira mensagem amigável.
- **Limites:** pergunta com até 1.500 caracteres, histórico de até 12 mensagens, 40 perguntas por hora por IP.

## Como melhorar as respostas

1. **Amplie a base:** adicione entradas em `FAQ` (`server/content/knowledge.js`) com `q`, `a`, `tag`, `fontes` e `keywords`. As keywords alimentam o modo offline.
2. **Novas fontes:** cadastre-as em `server/content/sources.js` com URL e `revisadoEm`.
3. **Avaliação:** monte um conjunto de 30–50 perguntas reais de estudantes (das entrevistas) com a resposta esperada e rode-o a cada mudança na base ou no prompt.

## Custos

Cada pergunta envia a base (alguns milhares de tokens, quase tudo servido do cache depois da primeira chamada) mais uma resposta curta. Para o piloto, o custo por estudante é baixo. Monitore o uso no console da Anthropic.
