-- WebCond: responde aos avisos do verificador de seguranca do painel do Supabase.
--
-- Requer os arquivos de 2026-09-19 a 2026-09-28 aplicados antes.
-- Idempotente: pode rodar mais de uma vez. Nao apaga dado nenhum.
--
-- O que este arquivo resolve, e o que fica como esta de proposito, esta explicado em
-- docs/seguranca-v1.09A3.md, secao "Avisos do painel do Supabase".
--
-- SEGURANCA DESTE ARQUIVO: tudo roda dentro de uma transacao unica e, na secao 1, um teste
-- confere que os gatilhos continuam funcionando depois da mudanca. Se o teste falhar, o
-- arquivo inteiro e desfeito e nada no banco muda.

begin;

-- ==================================================================
-- 1. Funcoes de gatilho saem da lista de funcoes publicadas
-- ==================================================================
-- Estas funcoes so existem para rodar dentro de um gatilho (returns trigger). Chamar uma delas
-- pela API nao funciona — o proprio Postgres recusa —, mas elas apareciam na lista de funcoes
-- publicadas, que e o que o verificador aponta.
--
-- Tirar a permissao nao afeta os gatilhos: o banco confere a permissao na hora de CRIAR o
-- gatilho, nao a cada vez que ele dispara. A secao 1.1 confere isso na pratica.
do $$
declare
  assinatura text;
begin
  for assinatura in
    select format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_type t on t.oid = p.prorettype
    where n.nspname = 'public'
      and t.typname = 'trigger'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', assinatura);
    raise notice 'fora da API: %', assinatura;
  end loop;
end;
$$;

-- 1.1 Teste de seguranca: um gatilho ainda dispara para quem esta logado?
-- Monta uma tabela temporaria com o gatilho de verdade (set_updated_at), vira um usuario
-- comum e faz um update. Se o gatilho recusar, o arquivo inteiro e desfeito.
do $$
declare
  funcionou boolean := true;
  motivo text := '';
begin
  create temp table _webcond_teste_gatilho (id integer, updated_at timestamptz default now()) on commit drop;
  execute 'grant usage on schema pg_temp to authenticated';
  grant select, insert, update on _webcond_teste_gatilho to authenticated;

  create trigger _webcond_teste_updated_at
    before update on _webcond_teste_gatilho
    for each row execute function public.set_updated_at();

  insert into _webcond_teste_gatilho (id) values (1);

  set local role authenticated;
  begin
    update _webcond_teste_gatilho set id = 2 where id = 1;
  exception when others then
    funcionou := false;
    motivo := sqlerrm;
  end;
  reset role;

  if not funcionou then
    raise exception 'TESTE FALHOU: o gatilho parou de funcionar sem a permissao (%). Nada foi alterado no banco.', motivo;
  end if;

  raise notice 'teste ok: os gatilhos continuam funcionando.';
end;
$$;

-- ==================================================================
-- 2. search_path fixo nas funcoes que ainda estavam sem
-- ==================================================================
-- Sem search_path fixo, quem conseguisse criar um schema na frente do "public" poderia fazer
-- a funcao chamar outra coisa no lugar do que ela espera. Todas as outras funcoes do projeto
-- ja nascem com "set search_path = public"; estas sao das primeiras versoes.
do $$
declare
  assinatura text;
begin
  for assinatura in
    select format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('set_updated_at', 'sync_condominium_language_fields')
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  loop
    execute format('alter function %s set search_path = public', assinatura);
    raise notice 'search_path fixo em %', assinatura;
  end loop;
end;
$$;

-- ==================================================================
-- 3. get_my_role(): funcao orfa
-- ==================================================================
-- Nao existe em nenhum arquivo do projeto, nenhuma tela chama e nenhuma politica usa: sobrou
-- de um teste feito no painel. Se alguma politica depender dela, o drop falha, ela fica e so
-- o search_path e corrigido.
do $$
begin
  execute 'drop function if exists public.get_my_role()';
  raise notice 'get_my_role(): removida (nada dependia dela).';
exception when others then
  raise notice 'get_my_role(): mantida, ha objeto dependendo dela (%).', sqlerrm;
  execute 'alter function public.get_my_role() set search_path = public';
end;
$$;

-- ==================================================================
-- 4. Bucket das logos: publico para abrir, fechado para listar
-- ==================================================================
-- O bucket "condominios" e publico porque a logo precisa aparecer no boleto e no perfil sem
-- login. Mas a policy de leitura em storage.objects fazia mais do que isso: permitia LISTAR o
-- bucket inteiro, ou seja, descobrir todos os condominios cadastrados pelo nome da pasta.
--
-- Bucket publico nao precisa dessa policy para entregar o arquivo: o endereco
-- /storage/v1/object/public/condominios/... nao passa por RLS. Sem a policy, a logo continua
-- abrindo normalmente e a listagem deixa de responder.
-- (Gravar, trocar e apagar continuam so com o administrador da plataforma.)
drop policy if exists storage_condominios_select on storage.objects;

commit;

-- ------------------------------------------------------------------
-- Conferencia (rode junto: o resultado aparece na tela)
-- ------------------------------------------------------------------
select 'funcoes de gatilho ainda publicadas (tem de ser 0)' as item,
       count(*)::text as valor
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_type t on t.oid = p.prorettype
where n.nspname = 'public'
  and t.typname = 'trigger'
  and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
union all
select 'funcoes sem search_path fixo (tem de ser 0)',
       count(*)::text
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
  and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
union all
select 'get_my_role (tem de ser 0)',
       count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'get_my_role'
union all
select 'policy de listagem do bucket de logos (tem de ser 0)',
       count(*)::text
from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname = 'storage_condominios_select';
