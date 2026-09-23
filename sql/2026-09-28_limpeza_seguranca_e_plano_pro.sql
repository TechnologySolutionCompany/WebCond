-- WebCond v1.09A3 (parte 3): limpeza geral do banco, correcao de seguranca e o espaco
-- reservado para o Plano Pro (v1.10).
--
-- Requer os arquivos de 2026-09-19 a 2026-09-27 aplicados antes.
-- Idempotente: pode rodar mais de uma vez. So apaga o que nao tem mais uso nenhum.
--
-- ATENCAO: a secao 1 corrige uma falha grave que esta valendo agora em producao.
-- Aplique este arquivo antes de qualquer outra coisa.

begin;

-- ==================================================================
-- 1. CORRECAO CRITICA: a view public.condominios expoe tudo sem login
-- ==================================================================
-- A view e antiga (da epoca em que as tabelas tinham nome em portugues) e nenhuma parte do
-- sistema usa ela. O problema: view nao respeita RLS. Ela roda com os direitos de quem a
-- criou, entao qualquer pessoa com a chave publica do navegador conseguia:
--   GET    /rest/v1/condominios  -> ler nome, CNPJ, endereco, WhatsApp, chave Pix e dados
--                                   bancarios de TODOS os condominios;
--   PATCH  /rest/v1/condominios  -> trocar a chave Pix de um condominio (desviar pagamento);
--   DELETE /rest/v1/condominios  -> apagar condominios.
-- Conferido no banco real em 22/09/2026. Apagar a view fecha tudo isso: a tabela
-- public.condominiums continua protegida por RLS, como sempre esteve.
drop view if exists public.condominios;

-- ==================================================================
-- 2. Objetos mortos
-- ==================================================================
-- Tabela de teste do inicio do projeto: 0 linhas, nenhuma referencia no codigo.
drop table if exists public.webcond;

-- ==================================================================
-- 3. Regra antiga que adotava um condominio sozinha
-- ==================================================================
-- A funcao existe para manter as duas colunas de condominio em sincronia (condominium_id, em
-- ingles, e condominio_id, o nome antigo). Ate aqui ela fazia mais do que isso: quando o
-- registro chegava sem condominio, ela escolhia um. Foi assim que as contas de suporte
-- nasceram presas a um condominio (corrigido em 2026-09-27) e e um risco para qualquer
-- registro futuro que chegue incompleto.
--
-- Agora a funcao so espelha as duas colunas. Nenhuma tela depende do "chute": o app sempre
-- informa o condominio (src/lib/tenant.js -> withTenantFields) e as politicas de RLS recusam
-- o registro se o condominio estiver errado.
create or replace function public.sync_legacy_condominium_id()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  resolved_id uuid;
begin
  resolved_id := coalesce(new.condominium_id, new.condominio_id);
  new.condominium_id := resolved_id;
  new.condominio_id := resolved_id;
  return new;
end;
$$;

-- A funcao que escolhia o condominio padrao deixa de existir. Se alguma politica ainda
-- depender dela, o drop falha, o bloco avisa e nada e alterado (nesse caso nao mexemos nas
-- permissoes: tirar o acesso quebraria a politica que a usa).
do $$
begin
  execute 'drop function if exists public.default_condominium_id()';
  raise notice 'default_condominium_id(): removida (nada dependia dela).';
exception when others then
  raise notice 'default_condominium_id(): mantida, ha objeto dependendo dela (%).', sqlerrm;
end;
$$;

-- ==================================================================
-- 4. Arquivos: limite de tamanho e de tipo nos buckets que estavam sem nenhum
-- ==================================================================
-- Sem limite, uma conta de sindico podia enviar arquivo de qualquer tamanho e de qualquer
-- tipo (inclusive .html e .svg, que executam script quando abertos pelo link do arquivo).
-- Os dois buckets continuam privados: isto aqui so limita o que entra daqui para a frente.
update storage.buckets
set file_size_limit = 20971520, -- 20 MB
    allowed_mime_types = array[
      'application/pdf',
      'image/png', 'image/jpeg', 'image/webp',
      'text/plain', 'text/csv',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip'
    ]
where id = 'documentos';

update storage.buckets
set file_size_limit = 10485760, -- 10 MB
    allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
where id = 'cobrancas';

-- ==================================================================
-- 5. Dados vencidos, orfaos e sem funcionalidade
-- ==================================================================
-- 5.1 Avisos: a regra da casa e guardar 30 dias. Roda a limpeza que ja existe.
select public.purge_expired_avisos();

-- 5.2 Registros que perderam o condominio (o condominio foi excluido e a coluna ficou nula).
-- Ninguem enxerga essas linhas: nenhuma politica casa com condominio nulo.
delete from public.avisos where condominium_id is null and condominio_id is null;
delete from public.cobrancas where condominium_id is null and condominio_id is null;
delete from public.documentos where condominium_id is null and condominio_id is null;
delete from public.ocorrencias_predio where condominium_id is null and condominio_id is null;
delete from public.solicitacoes_cadastro where condominium_id is null and condominio_id is null;

-- 5.3 Links de cadastro revogados ou vencidos ha mais de 30 dias.
delete from public.condominio_convites
where (ativo = false or expira_em < now() - interval '30 days')
  and updated_at < now() - interval '30 days';

-- 5.4 Importacao de unidades: planilha analisada e nunca confirmada (o sindico desistiu no meio).
delete from public.unidade_importacoes
where status = 'analisado'
  and confirmado_em is null
  and created_at < now() - interval '7 days';

-- Lotes ja concluidos viram so historico: 180 dias bastam.
delete from public.unidade_importacoes
where status = 'concluido'
  and confirmado_em < now() - interval '180 days';

-- 5.5 Solicitacoes de cadastro ja resolvidas ha mais de 180 dias (o morador aprovado ja tem
-- perfil proprio; a solicitacao so repete dado pessoal).
delete from public.solicitacoes_cadastro
where status in ('aprovado', 'rejeitado')
  and coalesce(revisado_em, updated_at, created_at) < now() - interval '180 days';

-- 5.6 Aparelhos que pediram notificacao e nunca receberam nada em 180 dias.
delete from public.push_inscricoes
where ultimo_envio_em is null
  and created_at < now() - interval '180 days';

-- ==================================================================
-- 6. Espaco reservado para o Plano Pro e para a cobranca da assinatura (v1.10)
-- ==================================================================
-- Nada aqui muda o comportamento de hoje. E o lugar pronto para quando a conta de recebimento
-- (banco/gateway) estiver escolhida: o webhook do provedor grava o evento aqui e a rotina de
-- assinatura le daqui, sem improviso e sem mexer na tabela de condominios no meio do caminho.
--
-- Quem le e escreve: so o backend (service role). Nenhuma policy criada de proposito ->
-- com RLS ligada e sem policy, nem o sindico nem o morador alcancam esta tabela.
create table if not exists public.assinatura_eventos (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid references public.condominiums(id) on delete set null,
  -- Nome do provedor de pagamento (ex.: 'mercadopago', 'asaas', 'stripe'). Fica livre de
  -- proposito: a escolha ainda esta em aberto.
  provedor text not null default '',
  -- Identificadores do lado do provedor, para reconciliar depois.
  assinatura_externa_id text not null default '',
  cobranca_externa_id text not null default '',
  -- Ex.: 'assinatura.criada', 'pagamento.aprovado', 'pagamento.recusado', 'assinatura.cancelada'.
  evento text not null default '',
  plano text not null default '',
  valor_centavos integer not null default 0,
  -- Corpo cru recebido do provedor, para auditoria. Nunca guardar cartao, token ou segredo aqui.
  payload jsonb not null default '{}'::jsonb,
  -- Chave do provedor para o mesmo evento: barra o processamento repetido do mesmo webhook.
  chave_idempotencia text,
  processado_em timestamptz,
  created_at timestamptz not null default now(),
  constraint assinatura_eventos_payload check (jsonb_typeof(payload) = 'object'),
  constraint assinatura_eventos_tamanhos check (
    char_length(provedor) <= 40
    and char_length(assinatura_externa_id) <= 120
    and char_length(cobranca_externa_id) <= 120
    and char_length(evento) <= 80
    and char_length(plano) <= 40
  )
);

create unique index if not exists assinatura_eventos_idempotencia_idx
  on public.assinatura_eventos (provedor, chave_idempotencia)
  where chave_idempotencia is not null;

create index if not exists assinatura_eventos_condominio_idx
  on public.assinatura_eventos (condominium_id, created_at desc);

alter table public.assinatura_eventos enable row level security;

-- Garantia explicita: ninguem alcanca esta tabela pelo PostgREST.
revoke all on table public.assinatura_eventos from anon, authenticated;

comment on table public.assinatura_eventos is
  'v1.10: eventos de cobranca vindos do provedor de pagamento. Somente backend (service role).';

commit;

-- ------------------------------------------------------------------
-- Conferencia (rode junto: o resultado aparece na tela)
-- ------------------------------------------------------------------
select 'view condominios (tem de ser 0)' as item,
       count(*)::text as valor
from pg_views where schemaname = 'public' and viewname = 'condominios'
union all
select 'tabela webcond (tem de ser 0)',
       count(*)::text from pg_tables where schemaname = 'public' and tablename = 'webcond'
union all
select 'default_condominium_id (tem de ser 0)',
       count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'default_condominium_id'
union all
select 'assinatura_eventos pronta (tem de ser 1)',
       count(*)::text from pg_tables where schemaname = 'public' and tablename = 'assinatura_eventos'
union all
select 'bucket documentos com limite (tem de ser 1)',
       count(*)::text from storage.buckets where id = 'documentos' and file_size_limit is not null
union all
select 'bucket cobrancas com limite (tem de ser 1)',
       count(*)::text from storage.buckets where id = 'cobrancas' and file_size_limit is not null
union all
select 'avisos guardados', count(*)::text from public.avisos
union all
select 'cobrancas guardadas', count(*)::text from public.cobrancas
union all
select 'condominios ativos', count(*)::text from public.condominiums;
