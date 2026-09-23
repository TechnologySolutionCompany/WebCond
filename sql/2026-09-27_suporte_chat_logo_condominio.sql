-- WebCond v1.09A3 (parte 2): chamado de suporte vira conversa (sindico <-> suporte) e o
-- condominio ganha uma logo no perfil, cadastrada so pela administracao da plataforma.
-- Requer 2026-09-19 a 2026-09-26 aplicados antes.
-- Idempotente: pode ser executado mais de uma vez. Nao apaga dados.

begin;

-- ------------------------------------------------------------------
-- 1. Conversa do chamado
-- ------------------------------------------------------------------
-- Cada mensagem e de um lado so: 'sindico' (quem abriu o chamado) ou 'suporte'
-- (administracao da plataforma e equipe de suporte).
create table if not exists public.suporte_mensagens (
  id uuid primary key default gen_random_uuid(),
  chamado_id uuid not null references public.suporte_chamados(id) on delete cascade,
  autor_id uuid references public.profiles(id) on delete set null,
  autor_tipo text not null check (autor_tipo in ('sindico', 'suporte')),
  autor_nome text not null default '',
  mensagem text not null,
  -- [{ path, nome, tipo, tamanho }] no bucket "suporte", sempre dentro da pasta do condominio.
  anexos jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint suporte_msg_tamanho check (char_length(btrim(mensagem)) between 1 and 4000),
  constraint suporte_msg_anexos check (jsonb_typeof(anexos) = 'array' and jsonb_array_length(anexos) <= 5)
);

create index if not exists suporte_mensagens_chamado_idx on public.suporte_mensagens (chamado_id, created_at);

alter table public.suporte_mensagens enable row level security;

-- O sindico le e escreve so na conversa de chamado do proprio condominio, e sempre como 'sindico'.
-- Sem bloqueio por plano vencido: quem esta parado e justamente quem precisa de ajuda.
drop policy if exists suporte_msg_sindico_select on public.suporte_mensagens;
create policy suporte_msg_sindico_select
  on public.suporte_mensagens for select
  using (
    public.is_condominium_admin()
    and exists (
      select 1 from public.suporte_chamados c
      where c.id = suporte_mensagens.chamado_id
        and c.condominium_id = public.current_user_condominium_id()
    )
  );

drop policy if exists suporte_msg_sindico_insert on public.suporte_mensagens;
create policy suporte_msg_sindico_insert
  on public.suporte_mensagens for insert
  with check (
    public.is_condominium_admin()
    and autor_tipo = 'sindico'
    and autor_id = auth.uid()
    and exists (
      select 1 from public.suporte_chamados c
      where c.id = suporte_mensagens.chamado_id
        and c.condominium_id = public.current_user_condominium_id()
    )
  );

-- A equipe de suporte responde pelas rotas /api/platform (service role), nunca direto no banco.
drop policy if exists suporte_msg_platform_admin_all on public.suporte_mensagens;
create policy suporte_msg_platform_admin_all
  on public.suporte_mensagens for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Chamados que ja existiam viram o primeiro par de mensagens da conversa.
insert into public.suporte_mensagens (chamado_id, autor_id, autor_tipo, mensagem, anexos, created_at)
select c.id, c.created_by, 'sindico', c.mensagem, c.anexos, c.created_at
from public.suporte_chamados c
where not exists (select 1 from public.suporte_mensagens m where m.chamado_id = c.id);

insert into public.suporte_mensagens (chamado_id, autor_id, autor_tipo, mensagem, created_at)
select c.id, c.respondido_por, 'suporte', c.resposta, coalesce(c.respondido_em, c.updated_at, c.created_at)
from public.suporte_chamados c
where btrim(coalesce(c.resposta, '')) <> ''
  and not exists (
    select 1 from public.suporte_mensagens m
    where m.chamado_id = c.id and m.autor_tipo = 'suporte'
  );

-- Quando foi a ultima mensagem: ordena o quadro de chamados sem varrer a conversa toda.
alter table public.suporte_chamados add column if not exists ultima_mensagem_em timestamptz;
update public.suporte_chamados c
set ultima_mensagem_em = coalesce(
  (select max(m.created_at) from public.suporte_mensagens m where m.chamado_id = c.id),
  c.created_at
)
where c.ultima_mensagem_em is null;

-- Abrir chamado ja cria a primeira mensagem da conversa (o painel so grava o chamado).
create or replace function public.suporte_primeira_mensagem()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.suporte_mensagens (chamado_id, autor_id, autor_tipo, mensagem, anexos, created_at)
  values (new.id, new.created_by, 'sindico', new.mensagem, coalesce(new.anexos, '[]'::jsonb), new.created_at);
  return new;
end;
$$;

drop trigger if exists suporte_chamados_primeira_mensagem on public.suporte_chamados;
create trigger suporte_chamados_primeira_mensagem
  after insert on public.suporte_chamados
  for each row execute function public.suporte_primeira_mensagem();

-- Mensagem nova atualiza o chamado: horario, ultima resposta do suporte e volta para a fila
-- quando o sindico escreve em um chamado ja concluido.
create or replace function public.suporte_atualiza_chamado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.suporte_chamados
  set ultima_mensagem_em = new.created_at,
      updated_at = now(),
      resposta = case when new.autor_tipo = 'suporte' then new.mensagem else resposta end,
      respondido_por = case when new.autor_tipo = 'suporte' then new.autor_id else respondido_por end,
      respondido_em = case when new.autor_tipo = 'suporte' then new.created_at else respondido_em end,
      status = case
        when new.autor_tipo = 'sindico' and status = 'resolvido' then 'aberto'
        else status
      end
  where id = new.chamado_id;
  return new;
end;
$$;

drop trigger if exists suporte_mensagens_atualiza_chamado on public.suporte_mensagens;
create trigger suporte_mensagens_atualiza_chamado
  after insert on public.suporte_mensagens
  for each row execute function public.suporte_atualiza_chamado();

-- ------------------------------------------------------------------
-- 2. Conta da plataforma nunca pertence a um condominio
-- ------------------------------------------------------------------
-- O banco tem uma regra antiga (sync_legacy_condominium_id) que, quando o perfil chega sem
-- condominio, adota o condominio padrao. Isso vale para morador e sindico, mas nao pode valer
-- para o administrador da plataforma nem para a equipe de suporte: a conta ficaria presa a um
-- condominio e enxergaria os dados dele. Este gatilho roda depois (nome termina em "zz") e
-- zera o vinculo desses dois papeis, tanto ao criar quanto ao alterar.
create or replace function public.plataforma_sem_condominio()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if upper(coalesce(new.role, '')) in ('PLATFORM_ADMIN', 'SUPORTE') then
    new.condominium_id := null;
    new.condominio_id := null;
    new.apartamento := '';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_zz_plataforma_sem_condominio on public.profiles;
create trigger profiles_zz_plataforma_sem_condominio
  before insert or update on public.profiles
  for each row execute function public.plataforma_sem_condominio();

-- Corrige quem ja estiver gravado errado (contas de suporte criadas antes deste arquivo).
update public.profiles
set condominium_id = null, condominio_id = null
where upper(coalesce(role, '')) in ('PLATFORM_ADMIN', 'SUPORTE')
  and (condominium_id is not null or condominio_id is not null);

-- ------------------------------------------------------------------
-- 3. Logo do condominio (perfil e, nos planos que permitem, o boleto)
-- ------------------------------------------------------------------
-- Caminho do arquivo fica em condominiums.metadata.logo_path. Bucket de leitura publica
-- (e uma marca visual, nao um dado pessoal); gravar e apagar, so o admin da plataforma.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('condominios', 'condominios', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists storage_condominios_select on storage.objects;
create policy storage_condominios_select
  on storage.objects for select
  using (bucket_id = 'condominios');

drop policy if exists storage_condominios_insert on storage.objects;
create policy storage_condominios_insert
  on storage.objects for insert
  with check (bucket_id = 'condominios' and public.is_platform_admin());

drop policy if exists storage_condominios_update on storage.objects;
create policy storage_condominios_update
  on storage.objects for update
  using (bucket_id = 'condominios' and public.is_platform_admin())
  with check (bucket_id = 'condominios' and public.is_platform_admin());

drop policy if exists storage_condominios_delete on storage.objects;
create policy storage_condominios_delete
  on storage.objects for delete
  using (bucket_id = 'condominios' and public.is_platform_admin());

commit;

-- Conferencia (opcional):
-- select count(*) from public.suporte_mensagens;
-- select id, status, ultima_mensagem_em from public.suporte_chamados order by ultima_mensagem_em desc limit 5;
-- select id, public from storage.buckets where id = 'condominios';
