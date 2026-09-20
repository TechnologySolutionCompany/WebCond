-- WebCond: proprietario com varias unidades, responsavel financeiro e cobranca por unidade.
-- Requer o arquivo 2026-09-19_unidades_e_limite_documentos.sql aplicado antes.
-- Idempotente: pode ser executado mais de uma vez. So adiciona estrutura; nao apaga dados.

begin;

-- ------------------------------------------------------------------
-- 1. Vinculos pessoa <-> unidade (uma pessoa pode ter varias unidades)
-- ------------------------------------------------------------------
create table if not exists public.unidade_vinculos (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  vinculo text not null check (vinculo in ('proprietario', 'inquilino')),
  created_at timestamptz not null default now(),
  constraint unidade_vinculos_um_por_tipo unique (unidade_id, vinculo)
);

create index if not exists unidade_vinculos_profile_idx on public.unidade_vinculos (profile_id);

alter table public.unidade_vinculos enable row level security;

-- Leitura para quem e do mesmo condominio da unidade. Escrita somente pelo backend (service role).
drop policy if exists unidade_vinculos_tenant_select on public.unidade_vinculos;
create policy unidade_vinculos_tenant_select
  on public.unidade_vinculos for select
  using (exists (
    select 1 from public.unidades u
    where u.id = unidade_id and u.condominium_id = public.current_user_condominium_id()
  ));

drop policy if exists unidade_vinculos_platform_admin_all on public.unidade_vinculos;
create policy unidade_vinculos_platform_admin_all
  on public.unidade_vinculos for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Migra quem ja esta nas unidades (pelo campo apartamento do morador ativo).
insert into public.unidade_vinculos (unidade_id, profile_id, vinculo)
select distinct on (u.id, coalesce(nullif(p.vinculo, ''), 'proprietario'))
  u.id, p.id, coalesce(nullif(p.vinculo, ''), 'proprietario')
from public.unidades u
join public.profiles p
  on coalesce(p.condominium_id, p.condominio_id) = u.condominium_id
 and upper(btrim(p.apartamento)) = upper(btrim(u.numero))
where lower(p.role) in ('morador', 'resident')
  and p.ativo = true
order by u.id, coalesce(nullif(p.vinculo, ''), 'proprietario'), p.created_at
on conflict do nothing;

-- ------------------------------------------------------------------
-- 2. Responsavel financeiro da unidade
-- ------------------------------------------------------------------
alter table public.unidades add column if not exists responsavel_financeiro text not null default 'proprietario';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'unidades_responsavel_financeiro_check') then
    alter table public.unidades
      add constraint unidades_responsavel_financeiro_check check (responsavel_financeiro in ('proprietario', 'inquilino'));
  end if;
end $$;

-- ------------------------------------------------------------------
-- 3. Cobranca vinculada a unidade (numero guardado para o historico)
-- ------------------------------------------------------------------
alter table public.cobrancas add column if not exists unidade_id uuid references public.unidades(id) on delete set null;
alter table public.cobrancas add column if not exists unidade_numero text not null default '';
create index if not exists cobrancas_unidade_idx on public.cobrancas (unidade_id);

update public.cobrancas c
set unidade_numero = upper(btrim(p.apartamento))
from public.profiles p
where p.id = c.morador_id
  and c.unidade_numero = ''
  and btrim(p.apartamento) <> '';

update public.cobrancas c
set unidade_id = u.id
from public.unidades u
where c.unidade_id is null
  and c.unidade_numero <> ''
  and u.condominium_id = coalesce(c.condominium_id, c.condominio_id)
  and upper(btrim(u.numero)) = c.unidade_numero;

commit;

-- Conferencia (opcional):
-- select vinculo, count(*) from public.unidade_vinculos group by vinculo;
-- select count(*) filter (where unidade_id is not null) as com_unidade, count(*) as total from public.cobrancas;
