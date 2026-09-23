-- WebCond v1.09A3: exclusao real de avisos, equipe de suporte com acesso limitado e
-- notificacoes no aparelho (push), por e-mail e por WhatsApp.
-- Requer 2026-09-19 a 2026-09-25 aplicados antes.
-- Idempotente: pode ser executado mais de uma vez. Unica remocao de dados: avisos que ja
-- tinham sido "excluidos" pelo sindico (ativo = false) e que so ficavam escondidos.

begin;

-- ------------------------------------------------------------------
-- 1. Avisos: excluir passa a apagar de verdade
-- ------------------------------------------------------------------
-- Ate a v1.09A2 o botao Excluir so marcava ativo = false: o morador deixava de ver, mas o
-- aviso continuava no banco e aparecia como "Inativo" para o sindico.
delete from public.avisos where ativo = false;

-- Carimbo do disparo das notificacoes: cada aviso so e enviado ao celular uma vez,
-- mesmo que o painel peca o envio de novo.
alter table public.avisos add column if not exists notificado_em timestamptz;

-- ------------------------------------------------------------------
-- 2. Equipe de suporte (papel "suporte")
-- ------------------------------------------------------------------
-- Entra pelo CPF, ve e responde os chamados e ve o status da plataforma. Nao tem condominio,
-- nao passa por nenhuma politica de dados dos condominios (so o admin da plataforma passa) e
-- tudo o que ve chega pelas rotas /api/platform, que so devolvem os campos do chamado.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'morador', 'contador', 'platform_admin', 'suporte', 'ADMIN_CONDOMINIUM', 'RESIDENT', 'PLATFORM_ADMIN'));

-- Mesma funcao da 09-22, com SUPORTE na lista de papeis que so a plataforma concede:
-- sem isso um sindico poderia transformar um morador em "suporte".
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
  privileged constant text[] := array['ADMIN', 'ADMIN_CONDOMINIUM', 'PLATFORM_ADMIN', 'SUPORTE'];
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

-- Aviso ao celular da equipe quando um sindico abre chamado (enviado uma vez so).
alter table public.suporte_chamados add column if not exists notificado_em timestamptz;

-- ------------------------------------------------------------------
-- 3. Notificacoes
-- ------------------------------------------------------------------
-- Preferencias da pessoa. E-mail vem ligado (e aviso do proprio condominio); WhatsApp so com
-- autorizacao expressa do morador, como exige a politica do WhatsApp Business.
alter table public.profiles add column if not exists notificar_email boolean not null default true;
alter table public.profiles add column if not exists notificar_whatsapp boolean not null default false;

-- Um registro por aparelho/navegador que aceitou receber notificacoes. Quem grava e apaga e
-- o backend (service role): num computador compartilhado o aparelho passa para quem entrou por
-- ultimo, e ao clicar em Sair o registro do aparelho e removido.
create table if not exists public.push_inscricoes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  dispositivo text not null default '',
  created_at timestamptz not null default now(),
  ultimo_envio_em timestamptz,
  constraint push_endpoint_https check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  constraint push_chaves_tamanho check (char_length(p256dh) <= 200 and char_length(auth) <= 100),
  constraint push_dispositivo_tamanho check (char_length(dispositivo) <= 120)
);

create index if not exists push_inscricoes_profile_idx on public.push_inscricoes (profile_id);

alter table public.push_inscricoes enable row level security;

-- A pessoa so enxerga os proprios aparelhos (lista em "Meu perfil"). Sem insert/update/delete
-- pelo app: tudo passa por /api/tenant/push-*.
drop policy if exists push_inscricoes_select_own on public.push_inscricoes;
create policy push_inscricoes_select_own
  on public.push_inscricoes for select
  using (profile_id = auth.uid());

commit;

-- Conferencia (opcional):
-- select count(*) from public.avisos where ativo = false;          -- 0
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'profiles_role_check';
-- select count(*) from public.push_inscricoes;
