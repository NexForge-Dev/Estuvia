# 32 — Backup e restauração

**Cópia diária automática** (tarefa do Windows "Estuvia Backup", 12:30; se o computador estiver desligado, roda quando ligar). Só lê a produção.

| Passo | O que acontece |
|---|---|
| 1. Banco | Lê todas as tabelas de entidades (a tabela antiga `estuvia_state` fica de fora: o servidor não a usa mais) |
| 2. Restauração | Aplica as migrations e a cópia num Postgres isolado, em memória, e compara linhas, conteúdo, versão e ordem |
| 3. Arquivos | Copia os buckets; só baixa o que mudou. Os documentos continuam cifrados |
| 4. Gravação | `%LOCALAPPDATA%\Estuvia\backups\copia-<data>`; relê do disco, confere os hashes e restaura de novo |
| 5. Limpeza | Apaga cópias com mais de 30 dias, mantendo sempre as 3 mais novas. Se os dados caírem de repente, não apaga nada |

Se algo falhar, aparece um aviso do Windows. Registro em `backup.log`; último resultado em `backups\ultima-execucao.json`.

## Instalar

1. `powershell -ExecutionPolicy Bypass -File scripts\backup\instalar.ps1`
2. No Supabase (projeto de produção): Settings → API Keys → criar uma chave **secret** só para isto, chamada `backup`. Assim ela pode ser revogada sem derrubar o site.
3. Colar a chave em `%LOCALAPPDATA%\Estuvia\backup.env` e salvar.
4. Primeira cópia: `schtasks /run /tn "Estuvia Backup"`.

## Restaurar

1. `npm run backup:restore -- --saida C:\restauracao` confere a cópia mais nova e gera `restaurar.sql` e a pasta `arquivos`. Não toca em banco nenhum.
2. Criar um projeto Supabase **novo e vazio** e aplicar as migrations `0001` a `0004`.
3. `psql "<conexão do projeto novo>" -v ON_ERROR_STOP=1 -f restaurar.sql`. O SQL para sem mudar nada se já houver usuários.
4. Enviar cada pasta de `arquivos` ao bucket privado de mesmo nome.
5. Apontar o servidor para o projeto novo com a **mesma `DOCUMENTS_KEY`**.

## Limites

- A `DOCUMENTS_KEY` **não** está na cópia. Sem ela, os documentos dos alunos não abrem: guarde-a num gerenciador de senhas.
- As cópias ficam num só computador. Uma segunda cópia fora dele (disco externo cifrado) ainda depende da equipe.
- As cópias têm dados pessoais e não são cifradas; a pasta só abre na conta do Windows que a criou.
- Uma conta excluída some das cópias em até 30 dias, desde que as cópias diárias continuem rodando. O prazo precisa constar da política de privacidade.
- O envio a um projeto Supabase real (passos 2 a 5) ainda não foi ensaiado; o SQL é o mesmo que a conferência executa todo dia.
