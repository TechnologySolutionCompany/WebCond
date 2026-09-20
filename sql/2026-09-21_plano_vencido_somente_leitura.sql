-- WebCond: teste ou plano vencido deixa o painel do condominio somente para visualizacao.
-- Sindico e contador continuam lendo tudo, mas nao conseguem inserir, alterar ou excluir.
-- Moradores nao sao afetados. As rotas do backend (service role) fazem a mesma checagem na API.
-- Idempotente: pode ser executado mais de uma vez. So adiciona funcao e politicas; nao apaga dados.

begin;

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

commit;

-- Conferencia (opcional): no SQL Editor retorna false, pois nao ha usuario logado.
-- select public.current_user_plan_locked();
