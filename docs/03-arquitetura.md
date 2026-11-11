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
        ├─ store.js    estado de usuários/comunidade (JSON local ou Supabase)
        └─ radar/db.js estado do Radar (JSON local ou Supabase)
```

## Decisões técnicas

| Decisão | Motivo |
|---|---|
| **Node.js + Express** | Simples, conhecido e com uma única linguagem no front e no back. |
| **Front sem build** (HTML + CSS + ES modules) | Roda com `npm start`, sem bundler nem etapa de compilação, e é fácil de apresentar e modificar. A migração para Next.js/React continua possível (o documento de visão cita isso como stack candidata). |
| **Roteamento por hash** (`#/jornada`) | Funciona em qualquer hospedagem estática. |
| **Conteúdo em `server/content/`** | A base editorial fica versionada no git, revisável por pull request, com fonte e data. É o embrião do painel editorial (RF-10). |
| **Persistência intercambiável** | `DB_PROVIDER=json` mantém os arquivos locais. `DB_PROVIDER=supabase` grava os estados principais em linhas JSONB no Supabase, sem expor a chave secreta ao navegador. |
| **SSE para o assistente** | A resposta aparece enquanto é gerada, com uma conexão HTTP simples. |
| **DOM via `h()` + `textContent`** | Elimina XSS por construção (nada de `innerHTML` com dados). |

## Modelo de dados (como está gravado hoje)

No Supabase, cada entidade tem a sua tabela (`users`, `community_*`, `audit_log`, `analytics`, `estuvia_meta`, `radar_*`; migration `0002_entidades.sql`). O servidor continua trabalhando com as coleções em memória e `server/entities.js` grava só as linhas que mudaram, numa transação, com versão otimista por linha; antes de cada requisição traz o que outras instâncias gravaram. Detalhes em `docs/29-banco-de-dados.md`.

```jsonc
// data/db.json ou as tabelas de entidades no Supabase (docs/29-banco-de-dados.md)
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

### Supabase

1. Aplique [`supabase/schema.sql`](../supabase/schema.sql) no SQL Editor do projeto Supabase.
2. No `.env` do servidor, defina `DB_PROVIDER=supabase`, `SUPABASE_URL` e `SUPABASE_SECRET_KEY` (a chave `sb_secret_...`, somente no servidor).
3. Reinicie o servidor. Se as linhas ainda não existirem, o app importa os estados locais `data/db.json` e `data/radar.json` para `main` e `radar`. Os arquivos locais são preservados como cópia.

O cliente do navegador não usa a chave secret. O `.env.local` e os helpers `@supabase/ssr` do exemplo Next.js não se aplicam a este backend Express. A mídia comunitária, os arquivos cifrados de documentos e os snapshots HTML brutos do Radar continuam no armazenamento local; esta integração migra o estado JSON principal.

### Migração para tabelas normalizadas

1. Criar as tabelas acima (sugestão: Prisma ou Drizzle para migrations).
2. Reimplementar `server/store.js` mantendo a mesma interface (`users.findByEmail`, `findById`, `create`, `update`, `remove`, `audit.log`). As rotas não mudam.
3. Script único para importar `data/db.json`.
4. Mover `content/*` para tabelas com painel editorial e manter o arquivo como seed.

## Escalabilidade e operação

- O provider JSON serve para **uma instância**. O provider Supabase persiste estado no Postgres e detecta conflitos entre processos com versionamento; como o app ainda carrega o estado em memória, rode uma instância de escrita até migrar para tabelas/reposórios por operação.
- O rate limit fica em memória. Com várias instâncias, ele deve usar um store compartilhado (Redis).
- O servidor é stateless, exceto pelo `store`. A sessão vai no cookie assinado.
