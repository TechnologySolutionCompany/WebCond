# Base do banco (histórico)

Estes dois arquivos são a **fotografia do banco em 19/09/2026**, antes das migrações diárias:

- `schema.sql` — banco novo, do zero.
- `schema_updates.sql` — mesmo conteúdo em forma de atualização, para um banco que já tem dados.

## Eles não valem como retrato do banco de hoje

Tudo o que veio depois está em `sql/2026-09-*.sql`, na ordem das datas, e é lá que está a
verdade. Duas diferenças conhecidas entre estes arquivos e o banco real:

- a função `sync_legacy_condominium_id()` chegou a ter, em produção, um trecho que adotava um
  condomínio quando o registro chegava sem um — corrigido em `2026-09-28`;
- a view `public.condominios` existia e entregava os dados de todos os condomínios sem login —
  removida em `2026-09-28`.

Ou seja: **para montar um ambiente novo**, rode `schema.sql` e, na sequência, todas as
migrações de `sql/` em ordem de data. Não use estes arquivos sozinhos.
