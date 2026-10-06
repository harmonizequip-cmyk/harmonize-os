# Restaurar um backup

O backup é o arquivo `backup-harmonize-AAAA-MM-DD.json` baixado em Configurações > Baixar backup (só administrador). Traz 16 tabelas do negócio. Não traz o login (e-mail e senha ficam no Auth do Supabase) nem as chaves de biometria.

## Teste feito em 06/10/2026

Backup de 05/10/2026 restaurado num Postgres temporário com o `schema.sql`: as 16 tabelas voltaram idênticas, linha a linha, e as somas de entradas, saídas, locações, pagamentos, saldo e lucro bateram com as do banco real.

O teste achou 3 colunas que existiam no banco e faltavam no `schema.sql` (`clients.state`, `clients.tags_legacy`, `expense_limits.created_by`). Já corrigido.

Backup antigo restaura em banco com colunas ou tabelas novas: o script só carrega as colunas que o arquivo traz (as novas ficam com o valor padrão) e trata tabela ausente como vazia. Testado de novo em 06/10/2026 depois de entrarem `settings.despesas_fixas` e a tabela `emprestimos`.

## Como restaurar num banco novo

1. Criar um projeto Supabase novo.
2. Rodar o `schema.sql` inteiro no SQL Editor do projeto novo.
3. Criar o usuário no Auth com o MESMO id do perfil do backup (`tabelas.profiles[0].id`), porque `profiles.id` aponta para `auth.users`.
4. Gerar o SQL de carga: `python3 scripts/restaurar-backup.py backup.json restaura.sql`.
5. Rodar o `restaura.sql` no projeto novo. Ele se recusa a rodar se o banco já tiver clientes, locações ou lançamentos, e termina conferindo linha a linha. Se aparecer `restauração conferida`, deu certo. Qualquer divergência cancela tudo (transação).
6. Apontar `NEXT_PUBLIC_SUPABASE_URL` e a chave pública no Vercel para o projeto novo.

Nunca rodar o `restaura.sql` no projeto real (`vidnlzbxaxjlmzncqhxw`).
