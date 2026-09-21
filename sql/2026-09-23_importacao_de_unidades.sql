-- WebCond: importacao de unidades por planilha (lotes e resultado por unidade).
-- Requer 2026-09-19 a 2026-09-22 aplicados antes.
-- Idempotente: pode ser executado mais de uma vez. So adiciona estrutura; nao apaga dados.
-- NUNCA guarda senha: apenas o resultado de cada unidade e os totais do lote.

begin;

-- ------------------------------------------------------------------
-- 1. Lote de importacao
-- ------------------------------------------------------------------
create table if not exists public.unidade_importacoes (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  arquivo text not null default '',
  -- SHA-256 do conteudo enviado: liga o lote ao arquivo analisado e barra troca de arquivo na confirmacao.
  arquivo_hash text not null default '',
  status text not null default 'analisado' check (status in ('analisado', 'processando', 'concluido')),
  total_linhas integer not null default 0,
  unidades_validas integer not null default 0,
  unidades_com_erro integer not null default 0,
  linhas_vazias integer not null default 0,
  unidades_criadas integer not null default 0,
  unidades_com_falha integer not null default 0,
  confirmado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists unidade_importacoes_condominio_idx
  on public.unidade_importacoes (condominium_id, created_at desc);

drop trigger if exists unidade_importacoes_set_updated_at on public.unidade_importacoes;
create trigger unidade_importacoes_set_updated_at
  before update on public.unidade_importacoes
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------
-- 2. Resultado por unidade do lote
-- ------------------------------------------------------------------
create table if not exists public.unidade_importacao_itens (
  id uuid primary key default gen_random_uuid(),
  importacao_id uuid not null references public.unidade_importacoes(id) on delete cascade,
  numero text not null,
  linha integer not null default 0,
  status text not null default 'pendente' check (status in ('pendente', 'criada', 'falhou')),
  unidade_id uuid references public.unidades(id) on delete set null,
  -- Mensagem de falha sem dado pessoal e sem senha.
  erro text not null default '',
  created_at timestamptz not null default now(),
  -- Chave estavel do lote: reenvio ou clique repetido nao cria a unidade duas vezes.
  constraint unidade_importacao_itens_unicos unique (importacao_id, numero)
);

create index if not exists unidade_importacao_itens_importacao_idx
  on public.unidade_importacao_itens (importacao_id);

-- ------------------------------------------------------------------
-- 3. Isolamento: sindico e contador leem o proprio condominio; escrita so pelo backend
-- ------------------------------------------------------------------
alter table public.unidade_importacoes enable row level security;
alter table public.unidade_importacao_itens enable row level security;

drop policy if exists unidade_importacoes_tenant_select on public.unidade_importacoes;
create policy unidade_importacoes_tenant_select
  on public.unidade_importacoes for select
  using (condominium_id = public.current_user_condominium_id());

drop policy if exists unidade_importacoes_platform_admin_all on public.unidade_importacoes;
create policy unidade_importacoes_platform_admin_all
  on public.unidade_importacoes for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists unidade_importacao_itens_tenant_select on public.unidade_importacao_itens;
create policy unidade_importacao_itens_tenant_select
  on public.unidade_importacao_itens for select
  using (exists (
    select 1 from public.unidade_importacoes lote
    where lote.id = importacao_id and lote.condominium_id = public.current_user_condominium_id()
  ));

drop policy if exists unidade_importacao_itens_platform_admin_all on public.unidade_importacao_itens;
create policy unidade_importacao_itens_platform_admin_all
  on public.unidade_importacao_itens for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Plano vencido tambem bloqueia importacao (a API tambem checa antes de gravar).
do $$
declare
  t text;
begin
  foreach t in array array['unidade_importacoes', 'unidade_importacao_itens'] loop
    execute format('drop policy if exists %I on public.%I', t || '_plan_locked_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_plan_locked_update', t);
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check (not public.current_user_plan_locked())',
      t || '_plan_locked_insert', t);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated using (not public.current_user_plan_locked()) with check (not public.current_user_plan_locked())',
      t || '_plan_locked_update', t);
  end loop;
end $$;

commit;

-- Conferencia (opcional):
-- select status, count(*) from public.unidade_importacoes group by status;
