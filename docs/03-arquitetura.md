# 03 — Arquitetura

> **Documento da versão 0.1 (Travessia, 6 fases).** A versão atual (Estuvia: 8 rodadas + trilha de financiamento, Agenda AI, financiamento, moradia, viagem) está descrita em [13 — Jornada Estuvia](13-jornada-estuvia.md).

## Visão geral

```
Navegador (SPA leve, JS modules)
   │  fetch JSON + cookie httpOnly + cabeçalho X-Requested-With
   ▼
Express (server/app.js)
   ├─ security.js  → helmet (CSP), rate limit, CSRF, sessão JWT
   ├─ routes/auth.js       cadastro, login, logout, troca de senha
   ├─ routes/me.js         perfil, missões, opções, status, documentos, orçamento, export, exclusão
   ├─ routes/content.js    conteúdo público (jornada, fontes, catálogo, documentos, FAQ)
   └─ routes/assistant.js  Guia: Claude (SSE) ou base local
        │
        ├─ game.js     regras de XP, desbloqueio, conquistas, dicas
        ├─ content/*   conteúdo editorial versionado
        └─ store.js    persistência (JSON hoje → PostgreSQL amanhã)
```

## Decisões técnicas

| Decisão | Motivo |
|---|---|
| **Node.js + Express** | Simples, conhecido e com uma única linguagem no front e no back. |
| **Front sem build** (HTML + CSS + ES modules) | Roda com `npm start`, sem bundler nem etapa de compilação, e é fácil de apresentar e modificar. A migração para Next.js/React continua possível (o documento de visão cita isso como stack candidata). |
| **Roteamento por hash** (`#/jornada`) | Funciona em qualquer hospedagem estática. |
| **Conteúdo em `server/content/`** | A base editorial fica versionada no git, revisável por pull request, com fonte e data. É o embrião do painel editorial (RF-10). |
| **Persistência em arquivo JSON** | Atende ao "sem banco por enquanto". Toda leitura e escrita passa por `store.js`, então trocar por banco é isolado. |
| **SSE para o assistente** | A resposta aparece enquanto é gerada, com uma conexão HTTP simples. |
| **DOM via `h()` + `textContent`** | Elimina XSS por construção (nada de `innerHTML` com dados). |

## Modelo de dados (como está gravado hoje)

```jsonc
// data/db.json
{
  "users": [{
    "id": "uuid",
    "email": "ana@exemplo.com",          // único, minúsculo
    "passwordHash": "scrypt$sal$hash",
    "tokenVersion": 1,                    // invalida sessões
    "createdAt": "...", "updatedAt": "...", "consentAt": "...",
    "profile": {
      "nome": "", "apelido": "", "avatar": "🎓", "cor": "azul", "tema": "auto",
      "formacao": "", "area": "", "estado": "BA", "cidadeDesejada": "",
      "anoPretendido": "2027", "espanhol": "B1", "ingles": "B2",
      "porque": "", "metaPessoal": "", "cambio": 6.1
    },
    "progress": { "completed": { "<missionId>": "ISO date" } },
    "choices": ["<programId>", "..."],          // máx. 6, ordenado
    "status": { "candidatura": "...", "visto": "...", "declaradoEm": "..." },
    "documents": { "<docId>": "pendente|solicitado|pronto|nao-se-aplica" },
    "budget": [{ "categoria": "mensal", "descricao": "", "valor": 0, "moeda": "EUR", "tipo": "estimativa" }]
  }],
  "audit": [{ "id": "", "at": "", "action": "login|register|...", "userId": "" }]
}
```

## Mapa para o modelo relacional (PostgreSQL)

| Documento de visão | Hoje | Tabela futura |
|---|---|---|
| StudentProfile | `user.profile` | `student_profile` (1:1 com `users`) |
| University / Program / Requirement | `content/catalog.js` | `university`, `program`, `requirement` |
| Source | `content/sources.js` | `source` (com `reviewed_at`, `status`) |
| TaskDefinition | `content/journey.js` (missões) | `task_definition` |
| UserTask | `user.progress.completed` | `user_task (user_id, task_id, completed_at)` |
| ApplicationChoice | `user.choices` | `application_choice (user_id, program_id, position, cycle)` |
| Application | `user.status` | `application (user_id, cycle, phase, declared_status)` |
| BudgetItem | `user.budget` | `budget_item` |
| AuditEvent | `audit` | `audit_event` |

### Como migrar

1. Criar as tabelas acima (sugestão: Prisma ou Drizzle para migrations).
2. Reimplementar `server/store.js` mantendo a mesma interface (`users.findByEmail`, `findById`, `create`, `update`, `remove`, `audit.log`). As rotas não mudam.
3. Script único para importar `data/db.json`.
4. Mover `content/*` para tabelas com painel editorial e manter o arquivo como seed.

## Escalabilidade e operação

- O arquivo JSON serve para **uma instância** e para o volume de um piloto (dezenas ou centenas de usuários). Para várias instâncias, é preciso banco.
- O rate limit fica em memória. Com várias instâncias, ele deve usar um store compartilhado (Redis).
- O servidor é stateless, exceto pelo `store`. A sessão vai no cookie assinado.
