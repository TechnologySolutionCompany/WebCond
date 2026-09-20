-- WebCond: correcoes de seguranca, plano Parceria, cobrancas por unidade para proprietario/inquilino
-- e avisos apagados automaticamente 30 dias apos o envio.
-- Requer 2026-09-19, 2026-09-20 e 2026-09-21 aplicados antes.
-- Idempotente: pode ser executado mais de uma vez. Nao apaga dados (exceto avisos com mais de 30 dias).

begin;

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

commit;

-- Conferencia (opcional):
-- select tgname from pg_trigger where tgname in ('profiles_protect_columns', 'avisos_purge_expired');
