-- ============================================================
-- WebCond - atualizacao nao destrutiva com suporte a multi-tenancy
-- Execute este arquivo inteiro no Supabase SQL Editor
-- ============================================================

create extension if not exists pgcrypto;

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'condominios'
      and c.relkind = 'r'
  ) and not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'condominiums'
      and c.relkind = 'r'
  ) then
    execute 'alter table public.condominios rename to condominiums';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'condominios'
      and c.relkind in ('v', 'm')
  ) then
    execute 'drop view public.condominios cascade';
  end if;
end $$;

create table if not exists public.condominiums (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  nome text not null default '',
  slug text not null default '',
  cnpj text not null default '',
  address text not null default '',
  endereco text not null default '',
  zip_code text not null default '',
  whatsapp text not null default '',
  unit_count integer not null default 0 check (unit_count >= 0),
  bank_details text not null default '',
  pix_key text not null default '',
  chave_pix text not null default '',
  status text not null default 'active' check (status in ('pending', 'active', 'rejected', 'blocked')),
  is_default boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.condominiums add column if not exists name text not null default '';
alter table public.condominiums add column if not exists nome text not null default '';
alter table public.condominiums add column if not exists slug text not null default '';
alter table public.condominiums add column if not exists cnpj text not null default '';
alter table public.condominiums add column if not exists address text not null default '';
alter table public.condominiums add column if not exists endereco text not null default '';
alter table public.condominiums add column if not exists zip_code text not null default '';
alter table public.condominiums add column if not exists whatsapp text not null default '';
alter table public.condominiums add column if not exists unit_count integer not null default 0;
alter table public.condominiums add column if not exists bank_details text not null default '';
alter table public.condominiums add column if not exists pix_key text not null default '';
alter table public.condominiums add column if not exists chave_pix text not null default '';
alter table public.condominiums add column if not exists status text not null default 'active';
alter table public.condominiums add column if not exists is_default boolean not null default false;
alter table public.condominiums add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.condominiums add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'condominiums'
      and constraint_name = 'condominiums_status_check'
  ) then
    alter table public.condominiums drop constraint condominiums_status_check;
  end if;
end $$;

alter table public.condominiums
  add constraint condominiums_status_check
  check (status in ('pending', 'active', 'rejected', 'blocked'));

update public.condominiums
set name = coalesce(nullif(name, ''), nullif(nome, ''), 'Condominio Principal'),
    nome = coalesce(nullif(nome, ''), nullif(name, ''), 'Condominio Principal'),
    address = coalesce(nullif(address, ''), nullif(endereco, ''), ''),
    endereco = coalesce(nullif(endereco, ''), nullif(address, ''), ''),
    pix_key = coalesce(nullif(pix_key, ''), nullif(chave_pix, ''), ''),
    chave_pix = coalesce(nullif(chave_pix, ''), nullif(pix_key, ''), '');

insert into public.condominiums (
  name,
  nome,
  status,
  is_default
)
select
  'Condominio Principal',
  'Condominio Principal',
  'active',
  true
where not exists (select 1 from public.condominiums);

with ranked_condos as (
  select
    id,
    row_number() over (
      order by is_default desc, created_at asc, id asc
    ) as row_num
  from public.condominiums
)
update public.condominiums c
set is_default = (ranked_condos.row_num = 1)
from ranked_condos
where c.id = ranked_condos.id;

create unique index if not exists condominiums_slug_unique_idx on public.condominiums (lower(slug)) where slug <> '';
create unique index if not exists condominiums_cnpj_unique_idx on public.condominiums (cnpj) where cnpj <> '';
create unique index if not exists condominiums_single_default_idx on public.condominiums (is_default) where is_default;
create index if not exists condominiums_status_idx on public.condominiums (status, created_at desc);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  condominium_id uuid references public.condominiums(id) on delete set null,
  condominio_id uuid references public.condominiums(id) on delete set null,
  role text not null default 'morador' check (role in ('admin', 'morador', 'contador', 'platform_admin', 'ADMIN_CONDOMINIUM', 'RESIDENT', 'PLATFORM_ADMIN')),
  nome text not null default '',
  email text not null default '',
  telefone text not null default '',
  apartamento text not null default '',
  cpf text not null default '',
  data_entrada date,
  whatsapp text not null default '',
  ativo boolean not null default true,
  observacao text not null default '',
  avatar_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists condominium_id uuid references public.condominiums(id) on delete set null;
alter table public.profiles add column if not exists condominio_id uuid references public.condominiums(id) on delete set null;
alter table public.profiles add column if not exists telefone text not null default '';
alter table public.profiles add column if not exists apartamento text not null default '';
alter table public.profiles add column if not exists cpf text not null default '';
alter table public.profiles add column if not exists data_entrada date;
alter table public.profiles add column if not exists whatsapp text not null default '';
alter table public.profiles add column if not exists ativo boolean not null default true;
alter table public.profiles add column if not exists observacao text not null default '';
alter table public.profiles add column if not exists avatar_url text not null default '';
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'profiles'
      and constraint_name = 'profiles_role_check'
  ) then
    alter table public.profiles drop constraint profiles_role_check;
  end if;
end $$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'morador', 'contador', 'platform_admin', 'ADMIN_CONDOMINIUM', 'RESIDENT', 'PLATFORM_ADMIN'));

create table if not exists public.solicitacoes_cadastro (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid references public.condominiums(id) on delete set null,
  condominio_id uuid references public.condominiums(id) on delete set null,
  nome text not null,
  email text not null,
  telefone text not null default '',
  whatsapp text not null default '',
  apartamento text not null default '',
  cpf text not null default '',
  data_entrada date,
  mensagem text not null default '',
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'rejeitado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.solicitacoes_cadastro add column if not exists condominium_id uuid references public.condominiums(id) on delete set null;
alter table public.solicitacoes_cadastro add column if not exists condominio_id uuid references public.condominiums(id) on delete set null;
alter table public.solicitacoes_cadastro add column if not exists telefone text not null default '';
alter table public.solicitacoes_cadastro add column if not exists whatsapp text not null default '';
alter table public.solicitacoes_cadastro add column if not exists apartamento text not null default '';
alter table public.solicitacoes_cadastro add column if not exists cpf text not null default '';
alter table public.solicitacoes_cadastro add column if not exists data_entrada date;
alter table public.solicitacoes_cadastro add column if not exists mensagem text not null default '';
alter table public.solicitacoes_cadastro add column if not exists updated_at timestamptz not null default now();

create table if not exists public.cobrancas (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid references public.condominiums(id) on delete set null,
  condominio_id uuid references public.condominiums(id) on delete set null,
  morador_id uuid not null references public.profiles(id) on delete cascade,
  descricao text not null default '',
  valor numeric(10, 2) not null default 0,
  tipo text not null default 'condominio' check (tipo in ('condominio', 'agua', 'energia', 'multa', 'outro')),
  mes_referencia text not null default '',
  vencimento date not null,
  pago boolean not null default false,
  data_pagamento date,
  pix_qr_code text,
  pix_qrcode_url text not null default '',
  pix_copy_paste_code text not null default '',
  pix_link text,
  pagamento_link text not null default '',
  pagamento_anexo_url text not null default '',
  pagamento_anexo_path text not null default '',
  boleto_url text not null default '',
  boleto_path text not null default '',
  payment_status text not null default 'PENDING' check (payment_status in ('PENDING', 'PAID', 'OVERDUE', 'UNDER_REVIEW')),
  paid_at timestamptz,
  confirmed_by uuid references public.profiles(id) on delete set null,
  receipt_url text not null default '',
  observacao text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.cobrancas add column if not exists condominium_id uuid references public.condominiums(id) on delete set null;
alter table public.cobrancas add column if not exists condominio_id uuid references public.condominiums(id) on delete set null;
alter table public.cobrancas add column if not exists pix_qr_code text;
alter table public.cobrancas add column if not exists pix_qrcode_url text not null default '';
alter table public.cobrancas add column if not exists pix_copy_paste_code text not null default '';
alter table public.cobrancas add column if not exists pix_link text;
alter table public.cobrancas add column if not exists pagamento_link text not null default '';
alter table public.cobrancas add column if not exists pagamento_anexo_url text not null default '';
alter table public.cobrancas add column if not exists pagamento_anexo_path text not null default '';
alter table public.cobrancas add column if not exists boleto_url text not null default '';
alter table public.cobrancas add column if not exists boleto_path text not null default '';
alter table public.cobrancas add column if not exists payment_status text not null default 'PENDING';
alter table public.cobrancas add column if not exists paid_at timestamptz;
alter table public.cobrancas add column if not exists confirmed_by uuid references public.profiles(id) on delete set null;
alter table public.cobrancas add column if not exists receipt_url text not null default '';
alter table public.cobrancas add column if not exists observacao text not null default '';

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'cobrancas'
      and constraint_name = 'cobrancas_payment_status_check'
  ) then
    alter table public.cobrancas drop constraint cobrancas_payment_status_check;
  end if;
end $$;

alter table public.cobrancas
  add constraint cobrancas_payment_status_check
  check (payment_status in ('PENDING', 'PAID', 'OVERDUE', 'UNDER_REVIEW'));

update public.cobrancas
set pix_qrcode_url = coalesce(nullif(pix_qrcode_url, ''), ''),
    pix_copy_paste_code = coalesce(nullif(pix_copy_paste_code, ''), ''),
    payment_status = case
      when upper(coalesce(payment_status, '')) in ('PENDING', 'PAID', 'OVERDUE', 'UNDER_REVIEW') then upper(payment_status)
      when pago = true then 'PAID'
      when vencimento < current_date then 'OVERDUE'
      else 'PENDING'
    end,
    paid_at = coalesce(
      paid_at,
      case
        when pago = true and data_pagamento is not null then (data_pagamento::timestamp at time zone 'UTC')
        else null
      end
    ),
    receipt_url = coalesce(nullif(receipt_url, ''), '');

create table if not exists public.avisos (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid references public.condominiums(id) on delete set null,
  condominio_id uuid references public.condominiums(id) on delete set null,
  titulo text not null default '',
  conteudo text not null default '',
  tipo text not null default 'informativo' check (tipo in ('aviso', 'urgente', 'informativo', 'manutencao')),
  destinatario text not null default 'todos' check (destinatario in ('todos', 'apartamento', 'especifico')),
  apartamento_destino text not null default '',
  ativo boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.avisos add column if not exists condominium_id uuid references public.condominiums(id) on delete set null;
alter table public.avisos add column if not exists condominio_id uuid references public.condominiums(id) on delete set null;
alter table public.avisos add column if not exists apartamento_destino text not null default '';
alter table public.avisos add column if not exists ativo boolean not null default true;

create table if not exists public.documentos (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid references public.condominiums(id) on delete set null,
  condominio_id uuid references public.condominiums(id) on delete set null,
  titulo text not null default '',
  descricao text not null default '',
  categoria text not null default 'outro',
  arquivo_url text not null default '',
  arquivo_path text not null default '',
  publico boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.documentos add column if not exists condominium_id uuid references public.condominiums(id) on delete set null;
alter table public.documentos add column if not exists condominio_id uuid references public.condominiums(id) on delete set null;
alter table public.documentos add column if not exists descricao text not null default '';
alter table public.documentos add column if not exists arquivo_path text not null default '';
alter table public.documentos add column if not exists publico boolean not null default true;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'documentos'
      and constraint_name = 'documentos_categoria_check'
  ) then
    alter table public.documentos drop constraint documentos_categoria_check;
  end if;
end $$;

alter table public.documentos
  add constraint documentos_categoria_check
  check (categoria in ('ata', 'regimento', 'contrato', 'financeiro', 'comprovante', 'conta', 'boleto', 'outro'));

create table if not exists public.ocorrencias_predio (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid references public.condominiums(id) on delete set null,
  condominio_id uuid references public.condominiums(id) on delete set null,
  titulo text not null,
  descricao text not null default '',
  categoria text not null default 'geral' check (categoria in ('geral', 'limpeza', 'estrutura', 'seguranca', 'energia')),
  status text not null default 'aberto' check (status in ('aberto', 'em_analise', 'resolvido')),
  apartamento text not null default '',
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ocorrencias_predio add column if not exists condominium_id uuid references public.condominiums(id) on delete set null;
alter table public.ocorrencias_predio add column if not exists condominio_id uuid references public.condominiums(id) on delete set null;
alter table public.ocorrencias_predio add column if not exists apartamento text not null default '';
alter table public.ocorrencias_predio add column if not exists updated_at timestamptz not null default now();

create table if not exists public.app_health (
  id integer primary key,
  nome text not null default 'webcond',
  updated_at timestamptz not null default now()
);

insert into public.app_health (id, nome)
values (1, 'webcond')
on conflict (id) do update
set nome = excluded.nome,
    updated_at = now();

update public.documentos
set arquivo_path = regexp_replace(arquivo_url, '^.*?/documentos/', '')
where coalesce(arquivo_path, '') = ''
  and arquivo_url like '%/documentos/%';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.sync_condominium_language_fields()
returns trigger
language plpgsql
as $$
begin
  new.name := coalesce(nullif(new.name, ''), nullif(new.nome, ''), 'Condominio Principal');
  new.nome := coalesce(nullif(new.nome, ''), new.name);
  new.address := coalesce(nullif(new.address, ''), nullif(new.endereco, ''), '');
  new.endereco := coalesce(nullif(new.endereco, ''), new.address);
  new.pix_key := coalesce(nullif(new.pix_key, ''), nullif(new.chave_pix, ''), '');
  new.chave_pix := coalesce(nullif(new.chave_pix, ''), new.pix_key);
  return new;
end;
$$;

create or replace function public.default_condominium_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.condominiums
  order by is_default desc, created_at asc, id asc
  limit 1;
$$;

create or replace function public.sync_legacy_condominium_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_id uuid;
begin
  resolved_id := coalesce(new.condominium_id, new.condominio_id);

  if resolved_id is null and auth.uid() is not null then
    select coalesce(p.condominium_id, p.condominio_id)
      into resolved_id
    from public.profiles p
    where p.id = auth.uid()
    limit 1;
  end if;

  if resolved_id is null then
    resolved_id := public.default_condominium_id();
  end if;

  if resolved_id is not null then
    new.condominium_id := resolved_id;
    new.condominio_id := resolved_id;
  end if;

  return new;
end;
$$;

drop trigger if exists condominiums_set_updated_at on public.condominiums;
create trigger condominiums_set_updated_at
before update on public.condominiums
for each row execute function public.set_updated_at();

drop trigger if exists condominiums_sync_language_fields on public.condominiums;
create trigger condominiums_sync_language_fields
before insert or update on public.condominiums
for each row execute function public.sync_condominium_language_fields();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists profiles_sync_condominium_id on public.profiles;
create trigger profiles_sync_condominium_id
before insert or update on public.profiles
for each row execute function public.sync_legacy_condominium_id();

drop trigger if exists solicitacoes_set_updated_at on public.solicitacoes_cadastro;
create trigger solicitacoes_set_updated_at
before update on public.solicitacoes_cadastro
for each row execute function public.set_updated_at();

drop trigger if exists solicitacoes_sync_condominium_id on public.solicitacoes_cadastro;
create trigger solicitacoes_sync_condominium_id
before insert or update on public.solicitacoes_cadastro
for each row execute function public.sync_legacy_condominium_id();

drop trigger if exists cobrancas_sync_condominium_id on public.cobrancas;
create trigger cobrancas_sync_condominium_id
before insert or update on public.cobrancas
for each row execute function public.sync_legacy_condominium_id();

drop trigger if exists avisos_sync_condominium_id on public.avisos;
create trigger avisos_sync_condominium_id
before insert or update on public.avisos
for each row execute function public.sync_legacy_condominium_id();

drop trigger if exists documentos_sync_condominium_id on public.documentos;
create trigger documentos_sync_condominium_id
before insert or update on public.documentos
for each row execute function public.sync_legacy_condominium_id();

drop trigger if exists ocorrencias_set_updated_at on public.ocorrencias_predio;
create trigger ocorrencias_set_updated_at
before update on public.ocorrencias_predio
for each row execute function public.set_updated_at();

drop trigger if exists ocorrencias_sync_condominium_id on public.ocorrencias_predio;
create trigger ocorrencias_sync_condominium_id
before insert or update on public.ocorrencias_predio
for each row execute function public.sync_legacy_condominium_id();

create or replace view public.condominios as
select
  id,
  nome,
  endereco,
  chave_pix,
  created_at,
  updated_at,
  name,
  slug,
  cnpj,
  address,
  zip_code,
  whatsapp,
  unit_count,
  bank_details,
  pix_key,
  status,
  is_default,
  metadata
from public.condominiums;

drop trigger if exists on_auth_user_created on auth.users;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, nome, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'morador'),
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    coalesce(new.email, '')
  )
  on conflict (id) do update
  set email = excluded.email,
      nome = case
        when public.profiles.nome = '' then excluded.nome
        else public.profiles.nome
      end;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case upper(coalesce(role, ''))
    when 'ADMIN_CONDOMINIUM' then 'admin'
    when 'RESIDENT' then 'morador'
    when 'PLATFORM_ADMIN' then 'platform_admin'
    else lower(coalesce(role, ''))
  end
  from public.profiles
  where id = auth.uid()
  limit 1;
$$;

create or replace function public.current_user_apartment()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select apartamento
  from public.profiles
  where id = auth.uid()
  limit 1;
$$;

create or replace function public.current_user_condominium_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select coalesce(condominium_id, condominio_id)
      from public.profiles
      where id = auth.uid()
      limit 1
    ),
    public.default_condominium_id()
  );
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and case upper(coalesce(role, ''))
        when 'PLATFORM_ADMIN' then 'platform_admin'
        else lower(coalesce(role, ''))
      end = 'platform_admin'
      and ativo = true
  );
$$;

create or replace function public.is_condominium_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and case upper(coalesce(role, ''))
        when 'ADMIN_CONDOMINIUM' then 'admin'
        when 'PLATFORM_ADMIN' then 'platform_admin'
        when 'RESIDENT' then 'morador'
        else lower(coalesce(role, ''))
      end = 'admin'
      and ativo = true
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and case upper(coalesce(role, ''))
        when 'ADMIN_CONDOMINIUM' then 'admin'
        when 'PLATFORM_ADMIN' then 'platform_admin'
        when 'RESIDENT' then 'morador'
        else lower(coalesce(role, ''))
      end in ('admin', 'platform_admin')
      and ativo = true
  );
$$;

create or replace function public.has_reporting_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and case upper(coalesce(role, ''))
        when 'ADMIN_CONDOMINIUM' then 'admin'
        when 'PLATFORM_ADMIN' then 'platform_admin'
        when 'RESIDENT' then 'morador'
        else lower(coalesce(role, ''))
      end in ('admin', 'contador')
      and ativo = true
  );
$$;

create or replace function public.same_condominium(row_condominium_id uuid, row_condominio_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_platform_admin()
    or coalesce(row_condominium_id, row_condominio_id) = public.current_user_condominium_id();
$$;

with default_condo as (
  select public.default_condominium_id() as id
)
update public.profiles p
set condominium_id = coalesce(p.condominium_id, p.condominio_id, default_condo.id),
    condominio_id = coalesce(p.condominium_id, p.condominio_id, default_condo.id)
from default_condo
where p.condominium_id is null
   or p.condominio_id is null
   or p.condominium_id is distinct from p.condominio_id;

with default_condo as (
  select public.default_condominium_id() as id
),
resolved as (
  select
    s.id,
    coalesce(
      s.condominium_id,
      s.condominio_id,
      p.condominium_id,
      p.condominio_id,
      default_condo.id
    ) as tenant_id
  from public.solicitacoes_cadastro s
  cross join default_condo
  left join lateral (
    select pr.condominium_id, pr.condominio_id
    from public.profiles pr
    where (pr.email <> '' and lower(pr.email) = lower(s.email))
       or (pr.cpf <> '' and pr.cpf = s.cpf)
    order by pr.created_at asc
    limit 1
  ) p on true
)
update public.solicitacoes_cadastro s
set condominium_id = resolved.tenant_id,
    condominio_id = resolved.tenant_id
from resolved
where s.id = resolved.id
  and (
    s.condominium_id is distinct from resolved.tenant_id
    or s.condominio_id is distinct from resolved.tenant_id
  );

with default_condo as (
  select public.default_condominium_id() as id
),
resolved as (
  select
    c.id,
    coalesce(
      c.condominium_id,
      c.condominio_id,
      morador.condominium_id,
      morador.condominio_id,
      criador.condominium_id,
      criador.condominio_id,
      default_condo.id
    ) as tenant_id
  from public.cobrancas c
  cross join default_condo
  left join public.profiles morador on morador.id = c.morador_id
  left join public.profiles criador on criador.id = c.created_by
)
update public.cobrancas c
set condominium_id = resolved.tenant_id,
    condominio_id = resolved.tenant_id
from resolved
where c.id = resolved.id
  and (
    c.condominium_id is distinct from resolved.tenant_id
    or c.condominio_id is distinct from resolved.tenant_id
  );

with default_condo as (
  select public.default_condominium_id() as id
),
resolved as (
  select
    a.id,
    coalesce(
      a.condominium_id,
      a.condominio_id,
      criador.condominium_id,
      criador.condominio_id,
      default_condo.id
    ) as tenant_id
  from public.avisos a
  cross join default_condo
  left join public.profiles criador on criador.id = a.created_by
)
update public.avisos a
set condominium_id = resolved.tenant_id,
    condominio_id = resolved.tenant_id
from resolved
where a.id = resolved.id
  and (
    a.condominium_id is distinct from resolved.tenant_id
    or a.condominio_id is distinct from resolved.tenant_id
  );

with default_condo as (
  select public.default_condominium_id() as id
),
resolved as (
  select
    d.id,
    coalesce(
      d.condominium_id,
      d.condominio_id,
      criador.condominium_id,
      criador.condominio_id,
      default_condo.id
    ) as tenant_id
  from public.documentos d
  cross join default_condo
  left join public.profiles criador on criador.id = d.created_by
)
update public.documentos d
set condominium_id = resolved.tenant_id,
    condominio_id = resolved.tenant_id
from resolved
where d.id = resolved.id
  and (
    d.condominium_id is distinct from resolved.tenant_id
    or d.condominio_id is distinct from resolved.tenant_id
  );

with default_condo as (
  select public.default_condominium_id() as id
),
resolved as (
  select
    o.id,
    coalesce(
      o.condominium_id,
      o.condominio_id,
      criador.condominium_id,
      criador.condominio_id,
      default_condo.id
    ) as tenant_id
  from public.ocorrencias_predio o
  cross join default_condo
  left join public.profiles criador on criador.id = o.created_by
)
update public.ocorrencias_predio o
set condominium_id = resolved.tenant_id,
    condominio_id = resolved.tenant_id
from resolved
where o.id = resolved.id
  and (
    o.condominium_id is distinct from resolved.tenant_id
    or o.condominio_id is distinct from resolved.tenant_id
  );

create unique index if not exists profiles_email_lower_idx on public.profiles (lower(email));
create unique index if not exists profiles_cpf_unique_idx on public.profiles (cpf) where cpf <> '';
create index if not exists profiles_role_ativo_apartamento_idx on public.profiles (role, ativo, apartamento);
create index if not exists profiles_condominium_id_idx on public.profiles (condominium_id);
create index if not exists solicitacoes_status_created_at_idx on public.solicitacoes_cadastro (status, created_at desc);
create index if not exists solicitacoes_condominium_id_idx on public.solicitacoes_cadastro (condominium_id, status, created_at desc);
create index if not exists cobrancas_morador_vencimento_idx on public.cobrancas (morador_id, vencimento desc);
create index if not exists cobrancas_status_created_at_idx on public.cobrancas (pago, created_at desc);
create index if not exists cobrancas_condominium_id_idx on public.cobrancas (condominium_id, created_at desc);
create index if not exists cobrancas_payment_status_idx on public.cobrancas (payment_status, created_at desc);
create index if not exists avisos_ativo_created_at_idx on public.avisos (ativo, created_at desc);
create index if not exists avisos_destinatario_apto_idx on public.avisos (destinatario, apartamento_destino);
create index if not exists avisos_condominium_id_idx on public.avisos (condominium_id, created_at desc);
create index if not exists documentos_publico_created_at_idx on public.documentos (publico, created_at desc);
create unique index if not exists documentos_arquivo_path_idx on public.documentos (arquivo_path) where arquivo_path <> '';
create index if not exists documentos_condominium_id_idx on public.documentos (condominium_id, created_at desc);
create index if not exists ocorrencias_status_created_at_idx on public.ocorrencias_predio (status, created_at desc);
create index if not exists ocorrencias_categoria_created_at_idx on public.ocorrencias_predio (categoria, created_at desc);
create index if not exists ocorrencias_created_by_created_at_idx on public.ocorrencias_predio (created_by, created_at desc);
create index if not exists ocorrencias_condominium_id_idx on public.ocorrencias_predio (condominium_id, created_at desc);

alter table public.condominiums enable row level security;
alter table public.profiles enable row level security;
alter table public.solicitacoes_cadastro enable row level security;
alter table public.cobrancas enable row level security;
alter table public.avisos enable row level security;
alter table public.documentos enable row level security;
alter table public.ocorrencias_predio enable row level security;
alter table public.app_health enable row level security;

drop policy if exists condominios_admin_all on public.condominiums;
drop policy if exists condominiums_platform_admin_all on public.condominiums;
drop policy if exists condominiums_tenant_select on public.condominiums;

create policy condominiums_platform_admin_all
on public.condominiums
for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

create policy condominiums_tenant_select
on public.condominiums
for select
using (id = public.current_user_condominium_id());

drop policy if exists "p_admin" on public.profiles;
drop policy if exists "p_own_select" on public.profiles;
drop policy if exists "p_own_update" on public.profiles;
drop policy if exists "p_own_insert" on public.profiles;
drop policy if exists profiles_admin_all on public.profiles;
drop policy if exists profiles_reporting_select on public.profiles;
drop policy if exists profiles_own_select on public.profiles;
drop policy if exists profiles_own_update on public.profiles;
drop policy if exists profiles_own_insert on public.profiles;

create policy profiles_admin_all
on public.profiles
for all
using (public.is_condominium_admin() and public.same_condominium(condominium_id, condominio_id))
with check (public.is_condominium_admin() and public.same_condominium(condominium_id, condominio_id));

create policy profiles_reporting_select
on public.profiles
for select
using (public.has_reporting_access() and public.same_condominium(condominium_id, condominio_id));

create policy profiles_own_select
on public.profiles
for select
using (id = auth.uid());

create policy profiles_own_update
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

create policy profiles_own_insert
on public.profiles
for insert
with check (id = auth.uid());

drop policy if exists "sol_insert_pub" on public.solicitacoes_cadastro;
drop policy if exists "sol_select_pub" on public.solicitacoes_cadastro;
drop policy if exists "sol_admin" on public.solicitacoes_cadastro;
drop policy if exists solicitacoes_public_insert on public.solicitacoes_cadastro;
drop policy if exists solicitacoes_admin_all on public.solicitacoes_cadastro;

create policy solicitacoes_public_insert
on public.solicitacoes_cadastro
for insert
with check (true);

create policy solicitacoes_admin_all
on public.solicitacoes_cadastro
for all
using (public.is_condominium_admin() and public.same_condominium(condominium_id, condominio_id))
with check (public.is_condominium_admin() and public.same_condominium(condominium_id, condominio_id));

drop policy if exists "cob_admin" on public.cobrancas;
drop policy if exists "cob_own" on public.cobrancas;
drop policy if exists cobrancas_admin_all on public.cobrancas;
drop policy if exists cobrancas_reporting_select on public.cobrancas;
drop policy if exists cobrancas_own_select on public.cobrancas;

create policy cobrancas_admin_all
on public.cobrancas
for all
using (public.is_condominium_admin() and public.same_condominium(condominium_id, condominio_id))
with check (public.is_condominium_admin() and public.same_condominium(condominium_id, condominio_id));

create policy cobrancas_reporting_select
on public.cobrancas
for select
using (public.has_reporting_access() and public.same_condominium(condominium_id, condominio_id));

create policy cobrancas_own_select
on public.cobrancas
for select
using (
  morador_id = auth.uid()
  and public.same_condominium(condominium_id, condominio_id)
);

drop policy if exists "avi_admin" on public.avisos;
drop policy if exists "avi_read" on public.avisos;
drop policy if exists avisos_admin_all on public.avisos;
drop policy if exists avisos_read_targeted on public.avisos;

create policy avisos_admin_all
on public.avisos
for all
using (public.is_condominium_admin() and public.same_condominium(condominium_id, condominio_id))
with check (public.is_condominium_admin() and public.same_condominium(condominium_id, condominio_id));

create policy avisos_read_targeted
on public.avisos
for select
using (
  public.same_condominium(condominium_id, condominio_id)
  and ativo = true
  and (
    destinatario = 'todos'
    or (
      destinatario = 'apartamento'
      and apartamento_destino = coalesce(public.current_user_apartment(), '')
    )
  )
);

drop policy if exists "doc_admin" on public.documentos;
drop policy if exists "doc_read" on public.documentos;
drop policy if exists documentos_admin_all on public.documentos;
drop policy if exists documentos_public_read on public.documentos;

create policy documentos_admin_all
on public.documentos
for all
using (public.is_condominium_admin() and public.same_condominium(condominium_id, condominio_id))
with check (public.is_condominium_admin() and public.same_condominium(condominium_id, condominio_id));

create policy documentos_public_read
on public.documentos
for select
using (
  publico = true
  and auth.role() = 'authenticated'
  and public.same_condominium(condominium_id, condominio_id)
);

drop policy if exists ocorrencias_admin_all on public.ocorrencias_predio;
drop policy if exists ocorrencias_morador_insert on public.ocorrencias_predio;
drop policy if exists ocorrencias_morador_select_own on public.ocorrencias_predio;

create policy ocorrencias_admin_all
on public.ocorrencias_predio
for all
using (public.is_condominium_admin() and public.same_condominium(condominium_id, condominio_id))
with check (public.is_condominium_admin() and public.same_condominium(condominium_id, condominio_id));

create policy ocorrencias_morador_insert
on public.ocorrencias_predio
for insert
with check (
  created_by = auth.uid()
  and public.same_condominium(condominium_id, condominio_id)
);

create policy ocorrencias_morador_select_own
on public.ocorrencias_predio
for select
using (
  created_by = auth.uid()
  and public.same_condominium(condominium_id, condominio_id)
);

drop policy if exists app_health_public_select on public.app_health;
create policy app_health_public_select
on public.app_health
for select
using (true);

insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do update
set public = false;

insert into storage.buckets (id, name, public)
values ('cobrancas', 'cobrancas', false)
on conflict (id) do update
set public = false;

drop policy if exists "doc_upload" on storage.objects;
drop policy if exists "doc_pub_read" on storage.objects;
drop policy if exists storage_documentos_select on storage.objects;
drop policy if exists storage_documentos_insert on storage.objects;
drop policy if exists storage_documentos_update on storage.objects;
drop policy if exists storage_documentos_delete on storage.objects;

create policy storage_documentos_select
on storage.objects
for select
using (
  bucket_id = 'documentos'
  and exists (
    select 1
    from public.documentos
    where arquivo_path = storage.objects.name
      and public.same_condominium(condominium_id, condominio_id)
      and (
        public.is_condominium_admin()
        or (publico = true and auth.role() = 'authenticated')
      )
  )
);

create policy storage_documentos_insert
on storage.objects
for insert
with check (
  bucket_id = 'documentos'
  and public.is_condominium_admin()
);

create policy storage_documentos_update
on storage.objects
for update
using (
  bucket_id = 'documentos'
  and public.is_condominium_admin()
)
with check (
  bucket_id = 'documentos'
  and public.is_condominium_admin()
);

create policy storage_documentos_delete
on storage.objects
for delete
using (
  bucket_id = 'documentos'
  and public.is_condominium_admin()
);

drop policy if exists storage_cobrancas_select on storage.objects;
drop policy if exists storage_cobrancas_insert on storage.objects;
drop policy if exists storage_cobrancas_update on storage.objects;
drop policy if exists storage_cobrancas_delete on storage.objects;

create policy storage_cobrancas_select
on storage.objects
for select
using (
  bucket_id = 'cobrancas'
  and (
    public.has_reporting_access()
    or (
      auth.role() = 'authenticated'
      and exists (
        select 1
        from public.cobrancas
        where morador_id = auth.uid()
          and public.same_condominium(condominium_id, condominio_id)
          and (
            boleto_path = storage.objects.name
            or pagamento_anexo_path = storage.objects.name
          )
      )
    )
  )
);

create policy storage_cobrancas_insert
on storage.objects
for insert
with check (
  bucket_id = 'cobrancas'
  and public.is_condominium_admin()
);

create policy storage_cobrancas_update
on storage.objects
for update
using (
  bucket_id = 'cobrancas'
  and public.is_condominium_admin()
)
with check (
  bucket_id = 'cobrancas'
  and public.is_condominium_admin()
);

create policy storage_cobrancas_delete
on storage.objects
for delete
using (
  bucket_id = 'cobrancas'
  and public.is_condominium_admin()
);

update public.profiles
set cpf = regexp_replace(cpf, '[^0-9]', '', 'g')
where cpf is not null and cpf <> '';

update public.solicitacoes_cadastro
set cpf = regexp_replace(cpf, '[^0-9]', '', 'g')
where cpf is not null and cpf <> '';

update public.profiles
set telefone = ''
where coalesce(telefone, '') <> '';

update public.solicitacoes_cadastro
set telefone = ''
where coalesce(telefone, '') <> '';
