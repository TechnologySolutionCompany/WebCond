-- WebCond: auto-cadastro do morador por link, com aprovacao do sindico.
-- Requer 2026-09-19 a 2026-09-23 aplicados antes.
-- Idempotente: pode ser executado mais de uma vez. So adiciona estrutura; nao apaga dados.
--
-- Isolamento entre condominios: o link carrega um token opaco e o servidor resolve
-- token -> condominio. O morador nunca escolhe nem digita o condominio, entao nao existe
-- caminho para um cadastro cair no condominio errado.
--
-- NUNCA guarda senha: a conta e criada no Supabase Auth ja bloqueada no momento do envio,
-- com a senha hasheada la. A aprovacao apenas desbloqueia; a recusa apaga a conta.

begin;

-- ------------------------------------------------------------------
-- 1. Link de cadastro do condominio
-- ------------------------------------------------------------------
create table if not exists public.condominio_convites (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  -- Token opaco. Fica legivel apenas pelo backend (service role): nenhuma policy de select
  -- para usuarios autenticados. O sindico recupera o link pela API, nunca pelo PostgREST.
  token text not null,
  ativo boolean not null default true,
  expira_em timestamptz not null default (now() + interval '30 days'),
  usos integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists condominio_convites_token_idx
  on public.condominio_convites (token);

-- Um unico link ativo por condominio: gerar de novo invalida o anterior.
create unique index if not exists condominio_convites_ativo_idx
  on public.condominio_convites (condominium_id) where ativo;

drop trigger if exists condominio_convites_set_updated_at on public.condominio_convites;
create trigger condominio_convites_set_updated_at
  before update on public.condominio_convites
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------
-- 2. Solicitacao de cadastro: campos do auto-cadastro e do aceite dos termos
-- ------------------------------------------------------------------
alter table public.solicitacoes_cadastro add column if not exists convite_id uuid references public.condominio_convites(id) on delete set null;
-- Conta criada bloqueada no envio. Aprovar desbloqueia; recusar apaga.
alter table public.solicitacoes_cadastro add column if not exists profile_id uuid references public.profiles(id) on delete set null;
alter table public.solicitacoes_cadastro add column if not exists vinculo text not null default 'proprietario';
alter table public.solicitacoes_cadastro add column if not exists origem text not null default 'link';
-- Situacao do imovel declarada pelo proprietario: ocupada (morando), alugada ou desocupada.
alter table public.solicitacoes_cadastro add column if not exists situacao text not null default 'ocupada';

-- Imovel alugado: o proprietario cadastra o inquilino junto, porque a responsabilidade e dele
-- e nao do sindico. A conta do inquilino so e criada quando ele vai mesmo ter acesso.
alter table public.solicitacoes_cadastro add column if not exists inquilino_profile_id uuid references public.profiles(id) on delete set null;
alter table public.solicitacoes_cadastro add column if not exists inquilino_nome text not null default '';
alter table public.solicitacoes_cadastro add column if not exists inquilino_cpf text not null default '';
alter table public.solicitacoes_cadastro add column if not exists inquilino_whatsapp text not null default '';
alter table public.solicitacoes_cadastro add column if not exists inquilino_email text not null default '';
alter table public.solicitacoes_cadastro add column if not exists inquilino_acesso boolean not null default false;
-- Registro do aceite (LGPD): qual versao da politica, quando e de onde.
alter table public.solicitacoes_cadastro add column if not exists aceite_versao text not null default '';
alter table public.solicitacoes_cadastro add column if not exists aceite_em timestamptz;
alter table public.solicitacoes_cadastro add column if not exists aceite_ip text not null default '';
alter table public.solicitacoes_cadastro add column if not exists revisado_por uuid references public.profiles(id) on delete set null;
alter table public.solicitacoes_cadastro add column if not exists revisado_em timestamptz;
alter table public.solicitacoes_cadastro add column if not exists motivo text not null default '';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'solicitacoes_vinculo_check') then
    alter table public.solicitacoes_cadastro
      add constraint solicitacoes_vinculo_check check (vinculo in ('proprietario', 'inquilino'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'solicitacoes_situacao_check') then
    alter table public.solicitacoes_cadastro
      add constraint solicitacoes_situacao_check check (situacao in ('ocupada', 'alugada', 'desocupada'));
  end if;
end $$;

create index if not exists solicitacoes_convite_idx
  on public.solicitacoes_cadastro (convite_id);

-- Uma solicitacao pendente por CPF em cada condominio: reenviar o formulario nao duplica.
create unique index if not exists solicitacoes_pendente_cpf_idx
  on public.solicitacoes_cadastro (condominium_id, cpf) where status = 'pendente' and cpf <> '';

-- ------------------------------------------------------------------
-- 3. Aceite dos termos por quem ja tem conta
-- ------------------------------------------------------------------
alter table public.profiles add column if not exists aceite_versao text not null default '';
alter table public.profiles add column if not exists aceite_em timestamptz;

-- ------------------------------------------------------------------
-- 4. Isolamento
-- ------------------------------------------------------------------
alter table public.condominio_convites enable row level security;

-- Sem policy de select para authenticated: o token so sai pela API do sindico.
drop policy if exists condominio_convites_platform_admin_all on public.condominio_convites;
create policy condominio_convites_platform_admin_all
  on public.condominio_convites for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Fecha o buraco antigo: qualquer pessoa com a chave anon inseria solicitacao em qualquer
-- condominio. Agora o envio passa obrigatoriamente pela API, que valida o token do link.
drop policy if exists solicitacoes_public_insert on public.solicitacoes_cadastro;
drop policy if exists sol_insert_pub on public.solicitacoes_cadastro;

-- O sindico continua lendo e revisando as solicitacoes do proprio condominio.
drop policy if exists solicitacoes_admin_all on public.solicitacoes_cadastro;
create policy solicitacoes_admin_all
  on public.solicitacoes_cadastro for all
  using (public.is_condominium_admin() and public.same_condominium(condominium_id, condominio_id))
  with check (public.is_condominium_admin() and public.same_condominium(condominium_id, condominio_id));

drop policy if exists solicitacoes_platform_admin_all on public.solicitacoes_cadastro;
create policy solicitacoes_platform_admin_all
  on public.solicitacoes_cadastro for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Plano vencido: o painel fica somente leitura, entao aprovar/recusar tambem para.
-- (A API checa antes de gravar; isto e a segunda barreira, no banco.)
do $$
declare
  t text;
begin
  foreach t in array array['condominio_convites', 'solicitacoes_cadastro'] loop
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

-- ------------------------------------------------------------------
-- 5. Limpeza: confirmacoes de pagamento sem cobranca
-- ------------------------------------------------------------------
-- Excluir a cobranca deixava a confirmacao do morador presa no painel do sindico,
-- apontando para algo que nao existe mais. A tela ja nao cria mais esse orfao;
-- isto apaga os que ficaram para tras.
delete from public.ocorrencias_predio o
where o.titulo like 'PAGAMENTO\_CONFIRMADO|%'
  and substring(o.titulo from 22) ~ '^[0-9a-fA-F-]{36}$'
  and not exists (
    select 1 from public.cobrancas c
    where c.id = substring(o.titulo from 22)::uuid
  );

commit;

-- Conferencia (opcional):
-- select status, count(*) from public.solicitacoes_cadastro group by status;
-- select condominium_id, ativo, expira_em from public.condominio_convites;
