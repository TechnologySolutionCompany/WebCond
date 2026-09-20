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
  updated_at timestamptz not null default now(),
  constraint condominiums_document_length_check check (cnpj = '' or length(cnpj) in (11, 14))
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
set cnpj = regexp_replace(cnpj, '[^0-9]', '', 'g')
where cnpj is not null and cnpj <> '';

update public.condominiums
set cnpj = ''
where cnpj <> '' and length(cnpj) not in (11, 14);

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'condominiums'
      and constraint_name = 'condominiums_document_length_check'
  ) then
    alter table public.condominiums drop constraint condominiums_document_length_check;
  end if;
end $$;

alter table public.condominiums
  add constraint condominiums_document_length_check
  check (cnpj = '' or length(cnpj) in (11, 14));

update public.condominiums
set name = coalesce(nullif(name, ''), nullif(nome, ''), ''),
    nome = coalesce(nullif(nome, ''), nullif(name, ''), ''),
    address = coalesce(nullif(address, ''), nullif(endereco, ''), ''),
    endereco = coalesce(nullif(endereco, ''), nullif(address, ''), ''),
    pix_key = coalesce(nullif(pix_key, ''), nullif(chave_pix, ''), ''),
    chave_pix = coalesce(nullif(chave_pix, ''), nullif(pix_key, ''), '');

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
  payment_status text not null default 'PENDING' check (payment_status in ('PENDING', 'PAID', 'OVERDUE', 'UNDER_REVIEW', 'CANCELLED')),
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
  check (payment_status in ('PENDING', 'PAID', 'OVERDUE', 'UNDER_REVIEW', 'CANCELLED'));

update public.cobrancas
set pix_qrcode_url = coalesce(nullif(pix_qrcode_url, ''), ''),
    pix_copy_paste_code = coalesce(nullif(pix_copy_paste_code, ''), ''),
    payment_status = case
      when upper(coalesce(payment_status, '')) in ('PENDING', 'PAID', 'OVERDUE', 'UNDER_REVIEW', 'CANCELLED') then upper(payment_status)
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
  new.name := coalesce(nullif(new.name, ''), nullif(new.nome, ''), '');
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
  select coalesce(condominium_id, condominio_id)
  from public.profiles
  where id = auth.uid()
  limit 1;
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

-- ------------------------------------------------------------------
-- Limite de documentos por plano (ONE 10, PRO 20, MAX 50; teste = ONE)
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


-- ==================================================================
-- 2026-09-21: plano vencido = painel do condominio somente leitura
-- ==================================================================

-- Mesmo calculo de src/lib/condominiumPlan.js (getCondominiumAccessState):
--   teste  -> vence em trial_ends_at (30 dias da aprovacao)
--   plano  -> vence em plan_expires_at (sem data = sem vencimento)
create or replace function public.current_user_plan_locked()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('admin', 'contador')
    and coalesce((
      select case
        when lower(btrim(coalesce(c.status, ''))) <> 'active' then false
        when lower(btrim(coalesce(c.metadata->>'subscription_status', 'trial'))) = 'active' then
          nullif(c.metadata->>'plan_expires_at', '') is not null
          and (now() at time zone 'America/Sao_Paulo')::date
            >= ((c.metadata->>'plan_expires_at')::timestamptz at time zone 'America/Sao_Paulo')::date
        else
          (now() at time zone 'America/Sao_Paulo')::date >= (coalesce(
            nullif(c.metadata->>'trial_ends_at', '')::timestamptz,
            coalesce(
              nullif(c.metadata->>'trial_started_at', '')::timestamptz,
              nullif(c.metadata->>'approved_at', '')::timestamptz,
              c.updated_at,
              c.created_at
            ) + interval '30 days'
          ) at time zone 'America/Sao_Paulo')::date
      end
      from public.condominiums c
      where c.id = public.current_user_condominium_id()
    ), false);
$$;

-- Politicas RESTRICTIVE: somam-se as existentes e barram escrita enquanto o plano estiver vencido.
do $$
declare
  t text;
begin
  foreach t in array array['cobrancas', 'avisos', 'documentos', 'ocorrencias_predio'] loop
    execute format('drop policy if exists %I on public.%I', t || '_plan_locked_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_plan_locked_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_plan_locked_delete', t);

    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check (not public.current_user_plan_locked())',
      t || '_plan_locked_insert', t);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated using (not public.current_user_plan_locked()) with check (not public.current_user_plan_locked())',
      t || '_plan_locked_update', t);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using (not public.current_user_plan_locked())',
      t || '_plan_locked_delete', t);
  end loop;
end $$;

-- Cadastros de pessoas: o sindico nao altera outros perfis (o proprio perfil continua editavel).
drop policy if exists profiles_plan_locked_insert on public.profiles;
drop policy if exists profiles_plan_locked_update on public.profiles;
drop policy if exists profiles_plan_locked_delete on public.profiles;

create policy profiles_plan_locked_insert
  on public.profiles as restrictive for insert to authenticated
  with check (id = auth.uid() or not public.current_user_plan_locked());

create policy profiles_plan_locked_update
  on public.profiles as restrictive for update to authenticated
  using (id = auth.uid() or not public.current_user_plan_locked())
  with check (id = auth.uid() or not public.current_user_plan_locked());

create policy profiles_plan_locked_delete
  on public.profiles as restrictive for delete to authenticated
  using (id = auth.uid() or not public.current_user_plan_locked());

-- Arquivos (boletos, comprovantes e documentos).
drop policy if exists storage_plan_locked_insert on storage.objects;
drop policy if exists storage_plan_locked_update on storage.objects;
drop policy if exists storage_plan_locked_delete on storage.objects;

create policy storage_plan_locked_insert
  on storage.objects as restrictive for insert to authenticated
  with check (bucket_id not in ('documentos', 'cobrancas') or not public.current_user_plan_locked());

create policy storage_plan_locked_update
  on storage.objects as restrictive for update to authenticated
  using (bucket_id not in ('documentos', 'cobrancas') or not public.current_user_plan_locked())
  with check (bucket_id not in ('documentos', 'cobrancas') or not public.current_user_plan_locked());

create policy storage_plan_locked_delete
  on storage.objects as restrictive for delete to authenticated
  using (bucket_id not in ('documentos', 'cobrancas') or not public.current_user_plan_locked());






-- ==================================================================
-- 2026-09-22: seguranca de perfis/arquivos, plano Parceria, cobrancas por unidade, avisos de 30 dias
-- ==================================================================

-- ==================================================================
-- 1. SEGURANCA: ninguem escolhe o proprio papel/condominio
-- ==================================================================
-- Antes: o cadastro publico do Supabase Auth aceitava "role" enviado pelo proprio usuario
-- (inclusive platform_admin). Agora todo usuario novo nasce morador, inativo e sem condominio;
-- somente o backend (service role) define papel, condominio e ativa o acesso.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, ativo, nome, email)
  values (
    new.id,
    'morador',
    false,
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

-- Duas correcoes nesta funcao (ela e a base de quase toda a separacao entre condominios):
--  1. a versao antiga caia no "condominio padrao" quando o usuario nao tinha condominio, entao
--     visitante sem login lia dados (condominio, unidades, vinculos) do condominio padrao;
--  2. quem e desativado (saiu da unidade) perdia o acesso so quando o token expirava, ate 1 hora depois.
create or replace function public.current_user_condominium_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(condominium_id, condominio_id)
  from public.profiles
  where id = auth.uid()
    and ativo = true
  limit 1;
$$;

revoke execute on function public.default_condominium_id() from public, anon;
grant execute on function public.default_condominium_id() to authenticated, service_role;

-- Requisicoes do app (anon/authenticated) nao alteram campos de acesso.
-- Backend (service role), SQL Editor e admin da plataforma seguem livres.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
  privileged constant text[] := array['ADMIN', 'ADMIN_CONDOMINIUM', 'PLATFORM_ADMIN'];
begin
  if jwt_role not in ('anon', 'authenticated') or public.is_platform_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.id = auth.uid() then
      new.role := 'morador';
      new.ativo := false;
      new.condominium_id := null;
      new.condominio_id := null;
    elsif upper(coalesce(new.role, '')) = any (privileged) then
      raise exception 'Somente a plataforma define administradores.' using errcode = '42501';
    end if;
    return new;
  end if;

  -- Proprio perfil: papel, condominio, status, CPF, unidade, vinculo e e-mail ficam congelados.
  if old.id = auth.uid() then
    new.role := old.role;
    new.ativo := old.ativo;
    new.condominium_id := old.condominium_id;
    new.condominio_id := old.condominio_id;
    new.cpf := old.cpf;
    new.apartamento := old.apartamento;
    new.vinculo := old.vinculo;
    new.email := old.email;
    return new;
  end if;

  -- Sindico editando outra pessoa do condominio: nao promove ninguem a administrador.
  if upper(coalesce(new.role, '')) = any (privileged) and new.role is distinct from old.role then
    raise exception 'Somente a plataforma define administradores.' using errcode = '42501';
  end if;
  if upper(coalesce(old.role, '')) = any (privileged) and new.role is distinct from old.role then
    raise exception 'Somente a plataforma altera administradores.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_columns on public.profiles;
create trigger profiles_protect_columns
  before insert or update on public.profiles
  for each row execute function public.protect_profile_columns();

-- ==================================================================
-- 2. SEGURANCA: arquivos isolados por condominio
-- ==================================================================
-- Arquivos novos ficam em "<condominium_id>/...". Arquivos antigos (sem pasta) continuam
-- acessiveis somente pelo registro do proprio condominio que aponta para eles.
-- Remove TODAS as politicas de storage.objects, inclusive as antigas criadas fora destes arquivos
-- (havia uma que liberava o bucket "documentos" para qualquer pessoa com a chave publica do site,
-- sem login). Logo abaixo o arquivo recria o conjunto completo e correto.
do $$
declare
  policy_name text;
begin
  for policy_name in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' loop
    begin
      execute format('drop policy if exists %I on storage.objects', policy_name);
    exception when insufficient_privilege then
      -- Politica interna do Supabase (outro dono): siga em frente e avise no final.
      raise notice 'Sem permissao para remover a politica de arquivos "%": apague pelo painel em Storage > Policies.', policy_name;
    end;
  end loop;
end $$;

do $$
begin
  execute 'alter table storage.objects enable row level security';
exception when others then
  raise notice 'RLS de storage.objects ja esta ativo (nada a fazer).';
end $$;

create or replace function public.storage_path_in_my_condominium(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_condominium_id() is not null
    and split_part(object_name, '/', 1) = public.current_user_condominium_id()::text;
$$;

create policy storage_documentos_select
on storage.objects for select
using (
  bucket_id = 'documentos'
  and exists (
    select 1 from public.documentos d
    where d.arquivo_path = storage.objects.name
      and public.same_condominium(d.condominium_id, d.condominio_id)
      and (public.is_condominium_admin() or (d.publico = true and auth.role() = 'authenticated'))
  )
);

create policy storage_documentos_insert
on storage.objects for insert
with check (bucket_id = 'documentos' and public.is_condominium_admin() and public.storage_path_in_my_condominium(name));

create policy storage_documentos_update
on storage.objects for update
using (bucket_id = 'documentos' and public.is_condominium_admin() and public.storage_path_in_my_condominium(name))
with check (bucket_id = 'documentos' and public.is_condominium_admin() and public.storage_path_in_my_condominium(name));

create policy storage_documentos_delete
on storage.objects for delete
using (
  bucket_id = 'documentos'
  and public.is_condominium_admin()
  and (
    public.storage_path_in_my_condominium(name)
    or exists (
      select 1 from public.documentos d
      where d.arquivo_path = storage.objects.name and public.same_condominium(d.condominium_id, d.condominio_id)
    )
  )
);

create policy storage_cobrancas_select
on storage.objects for select
using (
  bucket_id = 'cobrancas'
  and (
    (public.has_reporting_access() and public.storage_path_in_my_condominium(name))
    or exists (
      select 1 from public.cobrancas c
      where (c.boleto_path = storage.objects.name or c.pagamento_anexo_path = storage.objects.name)
        and public.same_condominium(c.condominium_id, c.condominio_id)
        and (
          public.has_reporting_access()
          or c.morador_id = auth.uid()
          or exists (
            select 1 from public.unidade_vinculos v
            where v.unidade_id = c.unidade_id
              and v.profile_id = auth.uid()
              and (v.vinculo = 'proprietario' or c.created_at >= v.created_at)
          )
        )
    )
  )
);

create policy storage_cobrancas_insert
on storage.objects for insert
with check (bucket_id = 'cobrancas' and public.is_condominium_admin() and public.storage_path_in_my_condominium(name));

create policy storage_cobrancas_update
on storage.objects for update
using (bucket_id = 'cobrancas' and public.is_condominium_admin() and public.storage_path_in_my_condominium(name))
with check (bucket_id = 'cobrancas' and public.is_condominium_admin() and public.storage_path_in_my_condominium(name));

create policy storage_cobrancas_delete
on storage.objects for delete
using (
  bucket_id = 'cobrancas'
  and public.is_condominium_admin()
  and (
    public.storage_path_in_my_condominium(name)
    or exists (
      select 1 from public.cobrancas c
      where (c.boleto_path = storage.objects.name or c.pagamento_anexo_path = storage.objects.name)
        and public.same_condominium(c.condominium_id, c.condominio_id)
    )
  )
);

-- Recria as travas de plano vencido em arquivos (o bloco acima apaga tudo de storage.objects).
create policy storage_plan_locked_insert
  on storage.objects as restrictive for insert to authenticated
  with check (bucket_id not in ('documentos', 'cobrancas') or not public.current_user_plan_locked());

create policy storage_plan_locked_update
  on storage.objects as restrictive for update to authenticated
  using (bucket_id not in ('documentos', 'cobrancas') or not public.current_user_plan_locked())
  with check (bucket_id not in ('documentos', 'cobrancas') or not public.current_user_plan_locked());

create policy storage_plan_locked_delete
  on storage.objects as restrictive for delete to authenticated
  using (bucket_id not in ('documentos', 'cobrancas') or not public.current_user_plan_locked());

-- ==================================================================
-- 3. Cobrancas da unidade: proprietario ve todas; inquilino ve as lancadas desde que entrou
-- ==================================================================
drop policy if exists cobrancas_unit_select on public.cobrancas;
create policy cobrancas_unit_select
on public.cobrancas for select
using (
  public.same_condominium(condominium_id, condominio_id)
  and unidade_id is not null
  and exists (
    select 1 from public.unidade_vinculos v
    where v.unidade_id = cobrancas.unidade_id
      and v.profile_id = auth.uid()
      and (v.vinculo = 'proprietario' or cobrancas.created_at >= v.created_at)
  )
);

-- Avisos por unidade valem para todas as unidades da pessoa (proprietario com varias unidades).
drop policy if exists avisos_read_targeted on public.avisos;
create policy avisos_read_targeted
on public.avisos for select
using (
  public.same_condominium(condominium_id, condominio_id)
  and ativo = true
  and (
    destinatario = 'todos'
    or (
      destinatario = 'apartamento'
      and (
        upper(btrim(apartamento_destino)) = upper(btrim(coalesce(public.current_user_apartment(), '')))
        or exists (
          select 1 from public.unidade_vinculos v
          join public.unidades u on u.id = v.unidade_id
          where v.profile_id = auth.uid()
            and upper(btrim(u.numero)) = upper(btrim(avisos.apartamento_destino))
        )
      )
    )
  )
);

-- Perfil de quem divide a unidade (proprietario <-> inquilino), sem CPF: usado em "Meu perfil".
drop function if exists public.my_unit_people();
create function public.my_unit_people()
returns table (
  unidade_id uuid,
  unidade_numero text,
  situacao text,
  responsavel_financeiro text,
  meu_vinculo text,
  pessoa_vinculo text,
  pessoa_nome text,
  pessoa_whatsapp text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.id,
    u.numero,
    u.situacao,
    u.responsavel_financeiro,
    mine.vinculo,
    other.vinculo,
    -- Somente "Nome Sobrenome", nunca o nome completo nem o CPF.
    case when p.id is null then null
      when position(' ' in btrim(p.nome)) = 0 then btrim(p.nome)
      else split_part(btrim(p.nome), ' ', 1) || ' ' || regexp_replace(btrim(p.nome), '^.*\s', '')
    end,
    p.whatsapp
  from public.unidade_vinculos mine
  join public.unidades u on u.id = mine.unidade_id
  left join public.unidade_vinculos other
    on other.unidade_id = mine.unidade_id
   and other.vinculo = 'inquilino'
   and mine.vinculo = 'proprietario'
   and u.situacao = 'alugada'
  left join public.profiles p on p.id = other.profile_id and p.ativo = true
  where mine.profile_id = auth.uid()
    and u.condominium_id = public.current_user_condominium_id();
$$;

revoke all on function public.my_unit_people() from public, anon;
grant execute on function public.my_unit_people() to authenticated;

-- ==================================================================
-- 4. Plano Parceria: todas as funcionalidades, gratuito e sem vencimento
-- ==================================================================
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

  max_documents := case plan when 'MAX' then 50 when 'PARCERIA' then 50 when 'PRO' then 20 else 10 end;

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

create or replace function public.current_user_plan_locked()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('admin', 'contador')
    and coalesce((
      select case
        when lower(btrim(coalesce(c.status, ''))) <> 'active' then false
        when upper(coalesce(c.metadata->>'plan_name', '')) = 'PARCERIA'
          and lower(btrim(coalesce(c.metadata->>'subscription_status', ''))) = 'active' then false
        when lower(btrim(coalesce(c.metadata->>'subscription_status', 'trial'))) = 'active' then
          nullif(c.metadata->>'plan_expires_at', '') is not null
          and (now() at time zone 'America/Sao_Paulo')::date
            >= ((c.metadata->>'plan_expires_at')::timestamptz at time zone 'America/Sao_Paulo')::date
        else
          (now() at time zone 'America/Sao_Paulo')::date >= (coalesce(
            nullif(c.metadata->>'trial_ends_at', '')::timestamptz,
            coalesce(
              nullif(c.metadata->>'trial_started_at', '')::timestamptz,
              nullif(c.metadata->>'approved_at', '')::timestamptz,
              c.updated_at,
              c.created_at
            ) + interval '30 days'
          ) at time zone 'America/Sao_Paulo')::date
      end
      from public.condominiums c
      where c.id = public.current_user_condominium_id()
    ), false);
$$;

-- ==================================================================
-- 5. Avisos: apagados automaticamente 30 dias apos o envio
-- ==================================================================
create or replace function public.purge_expired_avisos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.avisos where created_at < now() - interval '30 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.purge_expired_avisos() from public, anon, authenticated;

-- Limpeza a cada novo aviso (funciona sem nenhuma extensao).
create or replace function public.purge_expired_avisos_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.purge_expired_avisos();
  return null;
end;
$$;

drop trigger if exists avisos_purge_expired on public.avisos;
create trigger avisos_purge_expired
  after insert on public.avisos
  for each statement execute function public.purge_expired_avisos_trigger();

-- Limpeza diaria (03:00 UTC) quando a extensao pg_cron estiver habilitada no projeto.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'webcond_purge_avisos';
    perform cron.schedule('webcond_purge_avisos', '0 3 * * *', 'select public.purge_expired_avisos()');
  end if;
end $$;

select public.purge_expired_avisos();

