-- WebCond v1.09A2: presenca do sindico, chamados de suporte e anexos do suporte.
-- Requer 2026-09-19 a 2026-09-24 aplicados antes.
-- Idempotente: pode ser executado mais de uma vez. So adiciona estrutura; nao apaga dados.

begin;

-- ------------------------------------------------------------------
-- 1. Presenca (Online / Ausente / Offline no painel da plataforma)
-- ------------------------------------------------------------------
-- ultimo_acesso_em: ultimo sinal enviado pelo painel aberto (a cada minuto).
-- saiu_em: quando a pessoa clicou em Sair ou foi desconectada por inatividade.
alter table public.profiles add column if not exists ultimo_acesso_em timestamptz;
alter table public.profiles add column if not exists saiu_em timestamptz;

-- Security definer: grava so as duas colunas de presenca da propria pessoa. Assim o sinal
-- continua chegando mesmo com o plano vencido (o painel fica so leitura, mas o sindico
-- ainda esta ali) e ninguem usa esta funcao para mexer em outro campo ou outra pessoa.
create or replace function public.registrar_presenca(evento text default 'ativo')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  if evento = 'saiu' then
    update public.profiles set saiu_em = now() where id = auth.uid();
  else
    update public.profiles set ultimo_acesso_em = now() where id = auth.uid();
  end if;
end;
$$;

revoke execute on function public.registrar_presenca(text) from public, anon;
grant execute on function public.registrar_presenca(text) to authenticated;

-- ------------------------------------------------------------------
-- 2. Chamados de suporte (sindico -> administracao da plataforma)
-- ------------------------------------------------------------------
create table if not exists public.suporte_chamados (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  assunto text not null default '',
  mensagem text not null,
  -- [{ path, nome, tipo, tamanho }] no bucket "suporte", sempre dentro da pasta do condominio.
  anexos jsonb not null default '[]'::jsonb,
  status text not null default 'aberto' check (status in ('aberto', 'em_andamento', 'resolvido')),
  resposta text not null default '',
  respondido_por uuid references public.profiles(id) on delete set null,
  respondido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suporte_mensagem_tamanho check (char_length(btrim(mensagem)) between 5 and 4000),
  constraint suporte_assunto_tamanho check (char_length(assunto) <= 120),
  constraint suporte_anexos_limite check (jsonb_typeof(anexos) = 'array' and jsonb_array_length(anexos) <= 5)
);

create index if not exists suporte_chamados_condominio_idx
  on public.suporte_chamados (condominium_id, created_at desc);
create index if not exists suporte_chamados_status_idx
  on public.suporte_chamados (status, created_at desc);

drop trigger if exists suporte_chamados_set_updated_at on public.suporte_chamados;
create trigger suporte_chamados_set_updated_at
  before update on public.suporte_chamados
  for each row execute function public.set_updated_at();

alter table public.suporte_chamados enable row level security;

-- O sindico ve e abre chamados so do proprio condominio. Responder e mudar status e so da plataforma.
-- Sem bloqueio de plano vencido: justamente quem esta com o plano parado precisa conseguir pedir ajuda.
drop policy if exists suporte_sindico_select on public.suporte_chamados;
create policy suporte_sindico_select
  on public.suporte_chamados for select
  using (public.is_condominium_admin() and condominium_id = public.current_user_condominium_id());

drop policy if exists suporte_sindico_insert on public.suporte_chamados;
create policy suporte_sindico_insert
  on public.suporte_chamados for insert
  with check (
    public.is_condominium_admin()
    and condominium_id = public.current_user_condominium_id()
    and created_by = auth.uid()
    and status = 'aberto'
    and resposta = ''
    and respondido_por is null
    and respondido_em is null
  );

drop policy if exists suporte_platform_admin_all on public.suporte_chamados;
create policy suporte_platform_admin_all
  on public.suporte_chamados for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- ------------------------------------------------------------------
-- 3. Anexos do suporte: bucket privado, pasta por condominio
-- ------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('suporte', 'suporte', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists storage_suporte_select on storage.objects;
create policy storage_suporte_select
  on storage.objects for select
  using (
    bucket_id = 'suporte'
    and (public.is_platform_admin() or (public.is_condominium_admin() and public.storage_path_in_my_condominium(name)))
  );

drop policy if exists storage_suporte_insert on storage.objects;
create policy storage_suporte_insert
  on storage.objects for insert
  with check (bucket_id = 'suporte' and public.is_condominium_admin() and public.storage_path_in_my_condominium(name));

drop policy if exists storage_suporte_delete on storage.objects;
create policy storage_suporte_delete
  on storage.objects for delete
  using (bucket_id = 'suporte' and public.is_platform_admin());

commit;

-- Conferencia (opcional):
-- select status, count(*) from public.suporte_chamados group by status;
-- select nome, ultimo_acesso_em, saiu_em from public.profiles where upper(role) = 'ADMIN_CONDOMINIUM';
