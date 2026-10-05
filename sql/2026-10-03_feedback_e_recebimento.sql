-- WebCond v1.09A5: feedback para a administracao e recebimento das cobrancas pelo banco.
-- Requer 2026-09-19 a 2026-09-29 aplicados antes.
-- Idempotente: pode ser executado mais de uma vez. Nao apaga dados.
--
-- O que NAO precisa de SQL nesta versao (fica em condominiums.metadata, que ja existe):
--   * confirmacao do cadastro do condominio por e-mail  -> metadata.confirmacao_email
--   * banco/forma de recebimento do condominio          -> metadata.recebimento

begin;

-- ------------------------------------------------------------------
-- 1. Feedback (Suporte > Feedback, para todos os perfis)
-- ------------------------------------------------------------------
-- Gravado e lido so pelo servidor (/api/tenant/feedback, /api/admin/feedback e
-- /api/platform/feedbacks, todos com service role). Por isso a tabela nao tem nenhuma policy:
-- com RLS ligado e sem policy, o navegador nao le nem escreve nada aqui, nem com sessao.
create table if not exists public.feedbacks (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid references public.condominiums(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  autor_nome text not null default '',
  autor_papel text not null default '',
  categoria text not null default 'sugestao',
  nota smallint,
  mensagem text not null,
  pagina text not null default '',
  versao_app text not null default '',
  status text not null default 'novo',
  created_at timestamptz not null default now(),
  lido_em timestamptz,
  constraint feedbacks_categoria check (categoria in ('sugestao', 'problema', 'elogio', 'outro')),
  constraint feedbacks_nota check (nota is null or nota between 1 and 5),
  constraint feedbacks_mensagem check (char_length(btrim(mensagem)) between 5 and 2000),
  constraint feedbacks_status check (status in ('novo', 'lido', 'arquivado'))
);

create index if not exists feedbacks_status_idx on public.feedbacks (status, created_at desc);
create index if not exists feedbacks_condominium_idx on public.feedbacks (condominium_id, created_at desc);

alter table public.feedbacks enable row level security;
revoke all on public.feedbacks from anon, authenticated;

-- ------------------------------------------------------------------
-- 2. Cobranca paga pelo banco (InfinitePay e os proximos)
-- ------------------------------------------------------------------
-- pagamento_provedor: 'infinitepay' quando a cobranca tem link "Pagar agora"; vazio = Pix direto.
-- pagamento_ref:      codigo da transacao no banco (transaction_nsu), para conferencia.
-- pagamento_metodo:   'pix' ou 'credit_card', como o banco informou.
-- A baixa automatica grava tambem pago, payment_status = 'PAID', paid_at e receipt_url (ja existentes).
alter table public.cobrancas add column if not exists pagamento_provedor text not null default '';
alter table public.cobrancas add column if not exists pagamento_ref text not null default '';
alter table public.cobrancas add column if not exists pagamento_metodo text not null default '';

commit;

-- ------------------------------------------------------------------
-- Conferencia (rode junto: o resultado aparece na tela)
-- ------------------------------------------------------------------
select 'tabela feedbacks existe (tem de ser 1)' as item,
       count(*)::text as valor
from information_schema.tables
where table_schema = 'public' and table_name = 'feedbacks'
union all
select 'feedbacks com RLS ligado (tem de ser true)',
       coalesce((select relrowsecurity::text from pg_class where oid = 'public.feedbacks'::regclass), 'false')
union all
select 'policies em feedbacks (tem de ser 0: so o servidor acessa)',
       count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'feedbacks'
union all
select 'anon/authenticated com acesso a feedbacks (tem de ser 0)',
       count(*)::text
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'feedbacks' and grantee in ('anon', 'authenticated')
union all
select 'colunas novas em cobrancas (tem de ser 3)',
       count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'cobrancas'
  and column_name in ('pagamento_provedor', 'pagamento_ref', 'pagamento_metodo');
