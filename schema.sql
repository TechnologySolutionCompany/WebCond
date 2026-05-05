-- ============================================================
-- WebCond - schema base com suporte a multi-tenancy
-- Execute este arquivo inteiro no Supabase SQL Editor
-- ============================================================

create extension if not exists pgcrypto;

drop trigger if exists on_auth_user_created on auth.users;

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

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'condominios'
      and c.relkind = 'r'
  ) then
    execute 'drop table public.condominios cascade';
  end if;
end $$;

drop function if exists public.handle_new_user() cascade;
drop function if exists public.set_updated_at() cascade;
drop function if exists public.sync_condominium_language_fields() cascade;
drop function if exists public.sync_legacy_condominium_id() cascade;
drop function if exists public.default_condominium_id() cascade;
drop function if exists public.current_user_role() cascade;
drop function if exists public.current_user_apartment() cascade;
drop function if exists public.current_user_condominium_id() cascade;
drop function if exists public.is_admin() cascade;
drop function if exists public.is_condominium_admin() cascade;
drop function if exists public.has_reporting_access() cascade;
drop function if exists public.is_platform_admin() cascade;
drop function if exists public.same_condominium(uuid, uuid) cascade;

drop table if exists public.ocorrencias_predio cascade;
drop table if exists public.documentos cascade;
drop table if exists public.avisos cascade;
drop table if exists public.cobrancas cascade;
drop table if exists public.solicitacoes_cadastro cascade;
drop table if exists public.app_health cascade;
drop table if exists public.profiles cascade;
drop table if exists public.condominios cascade;
drop table if exists public.condominiums cascade;

create table public.condominiums (
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

create unique index condominiums_slug_unique_idx on public.condominiums (lower(slug)) where slug <> '';
create unique index condominiums_cnpj_unique_idx on public.condominiums (cnpj) where cnpj <> '';
create unique index condominiums_single_default_idx on public.condominiums (is_default) where is_default;
create index condominiums_status_idx on public.condominiums (status, created_at desc);

create table public.profiles (
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

create unique index profiles_email_lower_idx on public.profiles (lower(email));
create unique index profiles_cpf_unique_idx on public.profiles (cpf) where cpf <> '';
create index profiles_role_ativo_apartamento_idx on public.profiles (role, ativo, apartamento);
create index profiles_condominium_id_idx on public.profiles (condominium_id);

create table public.solicitacoes_cadastro (
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

create index solicitacoes_status_created_at_idx on public.solicitacoes_cadastro (status, created_at desc);
create index solicitacoes_condominium_id_idx on public.solicitacoes_cadastro (condominium_id, status, created_at desc);

create table public.cobrancas (
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

create index cobrancas_morador_vencimento_idx on public.cobrancas (morador_id, vencimento desc);
create index cobrancas_status_created_at_idx on public.cobrancas (pago, created_at desc);
create index cobrancas_condominium_id_idx on public.cobrancas (condominium_id, created_at desc);
create index cobrancas_payment_status_idx on public.cobrancas (payment_status, created_at desc);

create table public.avisos (
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

create index avisos_ativo_created_at_idx on public.avisos (ativo, created_at desc);
create index avisos_destinatario_apto_idx on public.avisos (destinatario, apartamento_destino);
create index avisos_condominium_id_idx on public.avisos (condominium_id, created_at desc);

create table public.documentos (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid references public.condominiums(id) on delete set null,
  condominio_id uuid references public.condominiums(id) on delete set null,
  titulo text not null default '',
  descricao text not null default '',
  categoria text not null default 'outro' check (categoria in ('ata', 'regimento', 'contrato', 'financeiro', 'comprovante', 'conta', 'boleto', 'outro')),
  arquivo_url text not null default '',
  arquivo_path text not null default '',
  publico boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index documentos_publico_created_at_idx on public.documentos (publico, created_at desc);
create unique index documentos_arquivo_path_idx on public.documentos (arquivo_path) where arquivo_path <> '';
create index documentos_condominium_id_idx on public.documentos (condominium_id, created_at desc);

create table public.ocorrencias_predio (
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

create index ocorrencias_status_created_at_idx on public.ocorrencias_predio (status, created_at desc);
create index ocorrencias_categoria_created_at_idx on public.ocorrencias_predio (categoria, created_at desc);
create index ocorrencias_created_by_created_at_idx on public.ocorrencias_predio (created_by, created_at desc);
create index ocorrencias_condominium_id_idx on public.ocorrencias_predio (condominium_id, created_at desc);

create table public.app_health (
  id integer primary key,
  nome text not null default 'webcond',
  updated_at timestamptz not null default now()
);

insert into public.app_health (id, nome)
values (1, 'webcond')
on conflict (id) do update
set nome = excluded.nome,
    updated_at = now();

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

create trigger condominiums_set_updated_at
before update on public.condominiums
for each row execute function public.set_updated_at();

create trigger condominiums_sync_language_fields
before insert or update on public.condominiums
for each row execute function public.sync_condominium_language_fields();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger profiles_sync_condominium_id
before insert or update on public.profiles
for each row execute function public.sync_legacy_condominium_id();

create trigger solicitacoes_set_updated_at
before update on public.solicitacoes_cadastro
for each row execute function public.set_updated_at();

create trigger solicitacoes_sync_condominium_id
before insert or update on public.solicitacoes_cadastro
for each row execute function public.sync_legacy_condominium_id();

create trigger cobrancas_sync_condominium_id
before insert or update on public.cobrancas
for each row execute function public.sync_legacy_condominium_id();

create trigger avisos_sync_condominium_id
before insert or update on public.avisos
for each row execute function public.sync_legacy_condominium_id();

create trigger documentos_sync_condominium_id
before insert or update on public.documentos
for each row execute function public.sync_legacy_condominium_id();

create trigger ocorrencias_set_updated_at
before update on public.ocorrencias_predio
for each row execute function public.set_updated_at();

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

alter table public.condominiums enable row level security;
alter table public.profiles enable row level security;
alter table public.solicitacoes_cadastro enable row level security;
alter table public.cobrancas enable row level security;
alter table public.avisos enable row level security;
alter table public.documentos enable row level security;
alter table public.ocorrencias_predio enable row level security;
alter table public.app_health enable row level security;

create policy condominiums_platform_admin_all
on public.condominiums
for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

create policy condominiums_tenant_select
on public.condominiums
for select
using (id = public.current_user_condominium_id());

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

create policy solicitacoes_public_insert
on public.solicitacoes_cadastro
for insert
with check (true);

create policy solicitacoes_admin_all
on public.solicitacoes_cadastro
for all
using (public.is_condominium_admin() and public.same_condominium(condominium_id, condominio_id))
with check (public.is_condominium_admin() and public.same_condominium(condominium_id, condominio_id));

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

-- ============================================================
-- Depois de criar o primeiro usuario global no Auth:
-- update public.profiles
-- set role = 'PLATFORM_ADMIN',
--     ativo = true,
--     nome = 'Seu Nome',
--     cpf = '00000000000',
--     condominium_id = null,
--     condominio_id = null
-- where email = 'seu-email@dominio.com';
-- ============================================================
