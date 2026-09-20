-- WebCond: unidades do condominio + limite de documentos por plano.
-- Pode ser executado mais de uma vez (idempotente). So adiciona estrutura; nao apaga dados.
-- Execute inteiro no Supabase > SQL Editor.

begin;

-- ------------------------------------------------------------------
-- 1. Unidades
-- ------------------------------------------------------------------
create table if not exists public.unidades (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  numero text not null,
  situacao text not null default 'desocupada'
    check (situacao in ('ocupada', 'alugada', 'desocupada', 'interditada')),
  observacao text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unidades_numero_not_blank check (btrim(numero) <> '')
);

create unique index if not exists unidades_condominium_numero_idx
  on public.unidades (condominium_id, upper(btrim(numero)));

drop trigger if exists unidades_set_updated_at on public.unidades;
create trigger unidades_set_updated_at
  before update on public.unidades
  for each row execute function public.set_updated_at();

alter table public.unidades enable row level security;

-- Leitura: quem pertence ao condominio. Escrita: somente pelo backend (service role),
-- que aplica o limite de unidades definido pela plataforma.
drop policy if exists unidades_tenant_select on public.unidades;
create policy unidades_tenant_select
  on public.unidades for select
  using (condominium_id = public.current_user_condominium_id());

drop policy if exists unidades_platform_admin_all on public.unidades;
create policy unidades_platform_admin_all
  on public.unidades for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- ------------------------------------------------------------------
-- 2. Vinculo do morador com a unidade (proprietario / inquilino)
-- ------------------------------------------------------------------
alter table public.profiles add column if not exists vinculo text not null default '';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_vinculo_check') then
    alter table public.profiles
      add constraint profiles_vinculo_check check (vinculo in ('', 'proprietario', 'inquilino'));
  end if;
end $$;

-- ------------------------------------------------------------------
-- 3. Migra moradores existentes: cada apartamento vira uma unidade ocupada
--    e o morador vira proprietario (ajuste depois pela tela, se necessario).
-- ------------------------------------------------------------------
insert into public.unidades (condominium_id, numero, situacao)
select distinct coalesce(p.condominium_id, p.condominio_id), upper(btrim(p.apartamento)), 'ocupada'
from public.profiles p
where lower(p.role) in ('morador', 'resident')
  and btrim(p.apartamento) <> ''
  and coalesce(p.condominium_id, p.condominio_id) is not null
on conflict do nothing;

update public.profiles
set vinculo = 'proprietario'
where lower(role) in ('morador', 'resident')
  and vinculo = '';

-- ------------------------------------------------------------------
-- 4. Limite de documentos por plano (ONE 10, PRO 20, MAX 50; teste = ONE)
-- ------------------------------------------------------------------
create or replace function public.enforce_document_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_condominium uuid := coalesce(new.condominium_id, new.condominio_id);
  plan text;
  max_documents integer;
  current_documents integer;
begin
  if target_condominium is null then
    return new;
  end if;

  select upper(coalesce(metadata->>'plan_name', 'ONE')) into plan
  from public.condominiums
  where id = target_condominium;

  max_documents := case plan when 'MAX' then 50 when 'PRO' then 20 else 10 end;

  select count(*) into current_documents
  from public.documentos
  where coalesce(condominium_id, condominio_id) = target_condominium;

  if current_documents >= max_documents then
    raise exception 'Limite de % documentos do plano atingido.', max_documents
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists documentos_plan_limit on public.documentos;
create trigger documentos_plan_limit
  before insert on public.documentos
  for each row execute function public.enforce_document_plan_limit();

commit;

-- Conferencia rapida (opcional):
-- select count(*) as unidades from public.unidades;
-- select vinculo, count(*) from public.profiles group by vinculo;
