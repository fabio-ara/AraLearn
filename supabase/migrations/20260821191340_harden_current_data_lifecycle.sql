-- #150: minimiza o oraculo de contas, torna a retencao independente de leituras
-- e fecha escritas de Storage depois que a sessao ou a conta deixam de existir.

begin;

set local lock_timeout = '15s';
set local statement_timeout = '10min';
set local search_path = pg_catalog, public, private, auth, storage, extensions;

select pg_advisory_xact_lock(hashtextextended(
  'aralearn:harden-current-data-lifecycle:20260821191340',0
));

do $current_data_lifecycle_preflight$
declare
  v_manifest jsonb;
begin
  if to_regclass('public.courses') is null
     or to_regclass('public.person_profiles') is null
     or to_regclass('public.course_access') is null
     or to_regclass('private.course_change_receipts') is null
     or to_regclass('private.course_personal_state_receipts') is null
     or to_regclass('private.course_anchored_annotations') is null
     or to_regclass('private.course_anchored_annotation_receipts') is null
     or to_regclass('private.course_source_attachments') is null
     or to_regclass('storage.objects') is null
     or to_regclass('auth.sessions') is null
     or to_regclass('auth.users') is null
     or to_regclass('auth.oauth_clients') is null
     or to_regclass('auth.oauth_consents') is null
     or to_regprocedure('private.require_service_role()') is null
     or to_regprocedure('public.aralearn_mcp_access_token_hook(jsonb)') is null
     or to_regprocedure(
       'private.require_course_access_v1(uuid,uuid,boolean)'
     ) is null then
    raise exception 'As autoridades correntes de Curso, Auth e Storage sao obrigatorias.'
      using errcode='55000';
  end if;
  v_manifest:=public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision'<>'20260821145358'
     or (v_manifest->>'contractVersion')::integer<>1
     or not (v_manifest->'features' ?& array[
       'personal-course-copy-edit-v1',
       'course-source-pdf-attachments-v1',
       'course-anchored-annotations-v1'
     ]) then
    raise exception 'Manifesto concorrente ao endurecimento do ciclo de dados.'
      using errcode='55000';
  end if;
end;
$current_data_lifecycle_preflight$;

-- Aliases pairwise mudam entre clientes OAuth e nao carregam o UUID real da
-- pessoa. O dominio separa o alias da pessoa daquele da sessao mesmo quando os
-- UUIDs de origem fossem iguais. Os bits de versao/variante deixam o resultado
-- compativel com validadores UUID sem fingir que ele e uma identidade do Auth.
create function public.derive_mcp_oauth_pairwise_id_v1(
  p_domain text,
  p_source_id uuid,
  p_client_id uuid
)
returns uuid
language sql
immutable
strict
security definer
set search_path = pg_catalog,extensions
as $function$
  with digest_value as(
    select encode(extensions.digest(convert_to(
      'aralearn:mcp-oauth:'||p_domain||':'||p_source_id::text||':'||p_client_id::text,
      'UTF8'
    ),'sha256'),'hex') value
  )
  select(
    substr(value,1,8)||'-'||substr(value,9,4)||'-5'||substr(value,14,3)
      ||'-8'||substr(value,18,3)||'-'||substr(value,21,12)
  )::uuid
  from digest_value
$function$;

revoke all on function public.derive_mcp_oauth_pairwise_id_v1(text,uuid,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.derive_mcp_oauth_pairwise_id_v1(text,uuid,uuid)
to supabase_auth_admin;

-- O OAuth Server do GoTrue emite um bearer de recurso para o MCP. O token
-- conserva somente a sessao-fonte real necessaria ao lookup indexado; sub e
-- session_id viram aliases pairwise que nao correspondem a uma conta ou sessao
-- do Auth e, portanto, nao permitem controlar a conta no GoTrue.
create or replace function public.aralearn_mcp_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog,public,auth
as $function$
declare
  v_claims jsonb:=event->'claims';
  v_minimal_claims jsonb;
  v_issuer text;
  v_resource text;
  v_actor_text text;
  v_subject_text text;
  v_session_text text;
  v_client_text text;
  v_scope text;
  v_actor_id uuid;
  v_session_id uuid;
  v_client_id uuid;
  v_pairwise_subject uuid;
  v_pairwise_session uuid;
  v_uuid_pattern constant text:=
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
begin
  if jsonb_typeof(v_claims)<>'object' then
    raise exception 'Claims ausentes no hook de access token.'
      using errcode='22023';
  end if;

  v_client_text:=nullif(btrim(v_claims->>'client_id'),'');
  -- Sessoes normais do aplicativo permanecem byte a byte inalteradas.
  if v_client_text is null then return event; end if;

  v_issuer:=v_claims->>'iss';
  v_actor_text:=nullif(btrim(event->>'user_id'),'');
  v_subject_text:=nullif(btrim(v_claims->>'sub'),'');
  v_session_text:=nullif(btrim(v_claims->>'session_id'),'');
  v_scope:=btrim(coalesce(v_claims->>'scope',''));
  if v_issuer !~ '^https?://[^/]+/auth/v1$'
     or v_actor_text is null or v_actor_text !~* v_uuid_pattern
     or v_subject_text is null or v_subject_text !~* v_uuid_pattern
     or v_session_text is null or v_session_text !~* v_uuid_pattern
     or v_client_text !~* v_uuid_pattern
     or v_claims->>'role' is distinct from 'authenticated'
     or v_claims->'is_anonymous' is distinct from 'false'::jsonb
     or v_scope<>'offline_access' then
    raise exception 'Credencial OAuth invalida para o MCP.'
      using errcode='22023';
  end if;

  v_actor_id:=v_actor_text::uuid;
  v_session_id:=v_session_text::uuid;
  v_client_id:=v_client_text::uuid;
  if v_subject_text::uuid<>v_actor_id
     or v_actor_id=v_client_id
     or v_session_id=v_client_id
     or not exists(
       select 1 from auth.oauth_clients client_value
       where client_value.id=v_client_id and client_value.deleted_at is null
     )
     or exists(select 1 from auth.users where id=v_client_id)
     or exists(select 1 from auth.sessions where id=v_client_id) then
    raise exception 'Credencial OAuth invalida para o MCP.'
      using errcode='22023';
  end if;

  v_pairwise_subject:=public.derive_mcp_oauth_pairwise_id_v1(
    'subject-v1',v_actor_id,v_client_id
  );
  v_pairwise_session:=public.derive_mcp_oauth_pairwise_id_v1(
    'session-v1',v_session_id,v_client_id
  );
  if v_pairwise_subject in(v_actor_id,v_session_id,v_client_id)
     or v_pairwise_session in(v_actor_id,v_session_id,v_client_id)
     or v_pairwise_subject=v_pairwise_session
     or exists(select 1 from auth.users where id=v_pairwise_subject)
     or exists(select 1 from auth.sessions where id=v_pairwise_session) then
    raise exception 'Alias OAuth indisponivel para o MCP.'
      using errcode='22023';
  end if;

  v_resource:=regexp_replace(
    v_issuer,'/auth/v1$','/functions/v1/aralearn-authoring-mcp'
  );
  v_minimal_claims:=jsonb_build_object(
    'iss',v_issuer,
    'aud',v_resource,
    'exp',v_claims->'exp',
    'iat',v_claims->'iat',
    'sub',v_pairwise_subject::text,
    'role','authenticated',
    'aal',v_claims->'aal',
    'session_id',v_pairwise_session::text,
    'email','',
    'phone','',
    'is_anonymous',false,
    'client_id',v_client_id::text,
    'scope',v_scope,
    'aralearn_session_id',v_session_id::text
  );
  if v_claims ? 'nbf' then
    v_minimal_claims:=jsonb_set(
      v_minimal_claims,'{nbf}',v_claims->'nbf',true
    );
  end if;
  return jsonb_set(event,'{claims}',v_minimal_claims,true);
end;
$function$;

revoke all on function public.aralearn_mcp_access_token_hook(jsonb)
from public,anon,authenticated,service_role;
grant execute on function public.aralearn_mcp_access_token_hook(jsonb)
to supabase_auth_admin;

-- Depois de verificar localmente a assinatura do JWT, a Edge confronta as
-- claims privadas com o estado vivo do Auth. A resposta nao devolve sessao,
-- perfil, e-mail ou qualquer outro atributo pessoal.
create function public.resolve_mcp_oauth_principal_v1(
  p_pairwise_sub uuid,
  p_pairwise_session_id uuid,
  p_client_id uuid,
  p_source_session_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog,public,private,auth
as $function$
declare
  v_actor_id uuid;
begin
  perform private.require_service_role();
  if p_pairwise_sub is null or p_pairwise_session_id is null
     or p_client_id is null or p_source_session_id is null
     or p_pairwise_sub in(p_pairwise_session_id,p_client_id,p_source_session_id)
     or p_pairwise_session_id in(p_client_id,p_source_session_id) then
    raise exception 'Credencial OAuth indisponivel.' using errcode='42501';
  end if;
  select user_value.id
  into v_actor_id
  from auth.sessions session_value
  join auth.users user_value on user_value.id=session_value.user_id
  join public.person_profiles profile on profile.user_id=user_value.id
  join auth.oauth_clients client_value
    on client_value.id=session_value.oauth_client_id
   and client_value.id=p_client_id
   and client_value.deleted_at is null
  where session_value.id=p_source_session_id
    and session_value.oauth_client_id=p_client_id
    and user_value.deleted_at is null
    and not coalesce(user_value.is_anonymous,false)
    and (user_value.banned_until is null
      or user_value.banned_until<=statement_timestamp())
    and (session_value.not_after is null
      or session_value.not_after>statement_timestamp())
    and (
      nullif(btrim(session_value.scopes),'') is null
      or session_value.scopes
        ~ '(^|[[:space:]])offline_access($|[[:space:]])'
    )
    and public.derive_mcp_oauth_pairwise_id_v1(
      'subject-v1',user_value.id,p_client_id
    )=p_pairwise_sub
    and public.derive_mcp_oauth_pairwise_id_v1(
      'session-v1',session_value.id,p_client_id
    )=p_pairwise_session_id
    and exists(
      select 1
      from auth.oauth_consents consent_value
      where consent_value.user_id=user_value.id
        and consent_value.client_id=p_client_id
        and consent_value.revoked_at is null
        and consent_value.granted_at<=statement_timestamp()
        and consent_value.scopes
          ~ '(^|[[:space:]])offline_access($|[[:space:]])'
    );
  if v_actor_id is null then
    raise exception 'Credencial OAuth indisponivel.' using errcode='42501';
  end if;
  return jsonb_build_object(
    'contract','aralearn.mcp-oauth-principal.v1',
    'actorId',v_actor_id,
    'oauthClientId',p_client_id
  );
end;
$function$;

revoke all on function public.resolve_mcp_oauth_principal_v1(uuid,uuid,uuid,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.resolve_mcp_oauth_principal_v1(uuid,uuid,uuid,uuid)
to service_role;

-- O bearer OAuth entregue ao cliente MCP identifica a mesma pessoa, mas nao e
-- uma sessao da aplicacao. O MCP usa a Edge Function, que projeta os dados e
-- consulta o banco com service_role. A Data API recusa qualquer token com
-- client_id antes de despachar tabela, view ou RPC.
create function public.enforce_aralearn_data_api_token_v1()
returns void
language plpgsql
stable
security invoker
set search_path = pg_catalog,auth
as $function$
begin
  if nullif(btrim(coalesce(auth.jwt()->>'client_id','')),'') is not null then
    raise exception 'Este token OAuth deve usar somente o endpoint MCP.'
      using errcode='42501';
  end if;
end;
$function$;

revoke all on function public.enforce_aralearn_data_api_token_v1()
from public,anon,authenticated,service_role;
grant execute on function public.enforce_aralearn_data_api_token_v1()
to anon,authenticated,service_role;

alter role authenticator set pgrst.db_pre_request =
  'public.enforce_aralearn_data_api_token_v1';
notify pgrst,'reload config';

-- Uma linha agregada por ator basta para limitar abuso e deixa de persistir
-- endereco, hash de endereco ou um diario de cada tentativa.
create table private.course_access_grant_rate_limits(
  actor_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  attempt_count bigint not null default 0,
  granted_count bigint not null default 0,
  no_match_count bigint not null default 0,
  unchanged_count bigint not null default 0,
  rate_limited_count bigint not null default 0,
  last_attempt_at timestamptz not null,
  constraint course_access_grant_rate_limits_counts_v1 check(
    attempt_count>=0 and granted_count>=0 and no_match_count>=0
    and unchanged_count>=0 and rate_limited_count>=0
    and granted_count+no_match_count+unchanged_count+rate_limited_count
      <= attempt_count
  ),
  constraint course_access_grant_rate_limits_window_v1 check(
    last_attempt_at>=window_started_at
  )
);

alter table private.course_access_grant_rate_limits enable row level security;
alter table private.course_access_grant_rate_limits force row level security;
revoke all on table private.course_access_grant_rate_limits
from public,anon,authenticated,service_role;

comment on table private.course_access_grant_rate_limits is
  'Contadores operacionais por ator para limitar concessoes; nao guarda e-mail nem hash de e-mail.';

create or replace function public.manage_course_access_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_operation text,
  p_target_email text,
  p_target_user_id uuid,
  p_confirmed boolean,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private,auth,extensions
as $function$
declare
  v_course public.courses%rowtype;
  v_target_user_id uuid;
  v_target_email text;
  v_hash text;
  v_receipt private.course_change_receipts%rowtype;
  v_profile public.person_profiles%rowtype;
  v_changed boolean:=false;
  v_attempt_count bigint;
  v_rate_allowed boolean:=true;
  v_grant_outcome text:='unchanged';
  v_result jsonb;
  v_now timestamptz:=statement_timestamp();
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_operation not in('grant_access','revoke_access')
     or p_confirmed is distinct from true
     or p_request_id is null
     or p_request_id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'Alteracao de acesso invalida.' using errcode='22023';
  end if;
  if p_operation='grant_access' then
    if p_target_user_id is not null
       or p_target_email is null
       or p_target_email<>btrim(p_target_email)
       or char_length(p_target_email) not between 3 and 254
       or p_target_email!~'^[^[:space:]@]+@[^[:space:]@]+$' then
      raise exception 'E-mail exato invalido.' using errcode='22023';
    end if;
    v_target_email:=lower(p_target_email);
  else
    if p_target_user_id is null or p_target_email is not null then
      raise exception 'Pessoa de acesso invalida.' using errcode='22023';
    end if;
    v_target_user_id:=p_target_user_id;
  end if;

  -- O replay de uma concessao nao precisa conservar sequer um hash de e-mail.
  -- Reutilizar o mesmo requestId devolve o primeiro aceite e nao tenta outro alvo.
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'courseId',p_course_id,
    'operation',p_operation,
    'target',case when p_operation='grant_access'
      then null else v_target_user_id::text end,
    'confirmed',true
  )::text,'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:'||p_actor_id::text||':'||p_request_id,0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id=p_actor_id and receipt.request_id=p_request_id
    and receipt.expires_at<=v_now;
  select * into v_receipt
  from private.course_change_receipts receipt
  where receipt.actor_id=p_actor_id and receipt.request_id=p_request_id
    and receipt.expires_at>v_now;
  if found then
    if v_receipt.operation<>p_operation or v_receipt.course_id<>p_course_id
       or (p_operation='revoke_access' and v_receipt.request_hash<>v_hash) then
      raise exception 'requestId reutilizado com comando incompativel.'
        using errcode='23514';
    end if;
    if p_operation='grant_access' then
      return jsonb_build_object(
        'contract','aralearn.course-access-grant-request.v1',
        'courseId',p_course_id,'operation','grant_access',
        'accepted',true,'idempotent',true
      );
    end if;
    return (v_receipt.result-'idempotent')||jsonb_build_object(
      'idempotent',true
    );
  end if;

  select * into strict v_course
  from public.courses course where course.id=p_course_id;

  if p_operation='grant_access' then
    perform pg_advisory_xact_lock(hashtextextended(
      'course-access-grant-rate:'||p_actor_id::text,0
    ));
    insert into private.course_access_grant_rate_limits(
      actor_id,window_started_at,attempt_count,last_attempt_at
    ) values(p_actor_id,v_now,1,v_now)
    on conflict(actor_id) do update set
      window_started_at=case
        when private.course_access_grant_rate_limits.window_started_at
          <=v_now-interval '10 minutes' then v_now
        else private.course_access_grant_rate_limits.window_started_at end,
      attempt_count=case
        when private.course_access_grant_rate_limits.window_started_at
          <=v_now-interval '10 minutes' then 1
        else private.course_access_grant_rate_limits.attempt_count+1 end,
      granted_count=case
        when private.course_access_grant_rate_limits.window_started_at
          <=v_now-interval '10 minutes' then 0
        else private.course_access_grant_rate_limits.granted_count end,
      no_match_count=case
        when private.course_access_grant_rate_limits.window_started_at
          <=v_now-interval '10 minutes' then 0
        else private.course_access_grant_rate_limits.no_match_count end,
      unchanged_count=case
        when private.course_access_grant_rate_limits.window_started_at
          <=v_now-interval '10 minutes' then 0
        else private.course_access_grant_rate_limits.unchanged_count end,
      rate_limited_count=case
        when private.course_access_grant_rate_limits.window_started_at
          <=v_now-interval '10 minutes' then 0
        else private.course_access_grant_rate_limits.rate_limited_count end,
      last_attempt_at=v_now
    returning attempt_count into v_attempt_count;
    v_rate_allowed:=v_attempt_count<=10;
    if v_rate_allowed then
      select auth_user.id into v_target_user_id
      from auth.users auth_user
      join public.person_profiles profile on profile.user_id=auth_user.id
      where lower(auth_user.email)=v_target_email;
      if not found then
        v_grant_outcome:='no_match';
      else
        perform pg_advisory_xact_lock(hashtextextended(
          'account-delete:'||v_target_user_id::text,0
        ));
        -- A exclusao da conta usa o mesmo lock. Depois da espera, releia Auth
        -- e perfil antes de persistir relacao, evento ou receipt com esse UUID.
        perform 1
        from auth.users auth_user
        join public.person_profiles profile on profile.user_id=auth_user.id
        where auth_user.id=v_target_user_id
          and lower(auth_user.email)=v_target_email;
        if not found then
          v_target_user_id:=null;
          v_grant_outcome:='no_match';
        elsif v_target_user_id=v_course.owner_id then
          v_grant_outcome:='unchanged';
        else
          perform pg_advisory_xact_lock(hashtextextended(
            'course-access:'||p_course_id::text||':'||v_target_user_id::text,0
          ));
          insert into public.course_access(course_id,user_id,granted_by)
          values(p_course_id,v_target_user_id,p_actor_id)
          on conflict(course_id,user_id) do nothing;
          v_changed:=found;
          v_grant_outcome:=case when v_changed then 'granted' else 'unchanged' end;
        end if;
      end if;
    else
      v_grant_outcome:='rate_limited';
    end if;
    update private.course_access_grant_rate_limits rate_value set
      granted_count=rate_value.granted_count+
        case when v_grant_outcome='granted' then 1 else 0 end,
      no_match_count=rate_value.no_match_count+
        case when v_grant_outcome='no_match' then 1 else 0 end,
      unchanged_count=rate_value.unchanged_count+
        case when v_grant_outcome='unchanged' then 1 else 0 end,
      rate_limited_count=rate_value.rate_limited_count+
        case when v_grant_outcome='rate_limited' then 1 else 0 end
    where rate_value.actor_id=p_actor_id;
  else
    if v_target_user_id=v_course.owner_id then
      raise exception 'O proprietario ja possui acesso ao Curso.'
        using errcode='23514';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(
      'account-delete:'||v_target_user_id::text,0
    ));
    perform pg_advisory_xact_lock(hashtextextended(
      'course-access:'||p_course_id::text||':'||v_target_user_id::text,0
    ));
    select profile.* into v_profile
    from auth.users auth_user
    join public.person_profiles profile on profile.user_id=auth_user.id
    where auth_user.id=v_target_user_id;
    if not found then
      raise exception 'Perfil inexistente.' using errcode='PT404';
    end if;
    delete from public.course_access access_value
    where access_value.course_id=p_course_id
      and access_value.user_id=v_target_user_id;
    v_changed:=found;
  end if;

  if v_changed then
    insert into private.course_events(
      course_id,revision,operation,summary,actor_id
    ) values(
      p_course_id,v_course.revision,
      case p_operation when 'grant_access' then 'grant_course_access'
        else 'revoke_course_access' end,
      jsonb_build_object('targetUserId',v_target_user_id),p_actor_id
    );
  end if;

  if p_operation='grant_access' then
    v_result:=jsonb_build_object(
      'contract','aralearn.course-access-grant-request.v1',
      'courseId',p_course_id,'operation','grant_access',
      'accepted',true,'idempotent',false
    );
  else
    v_result:=jsonb_build_object(
      'contract','aralearn.course-access-change.v1',
      'courseId',p_course_id,'operation',p_operation,
      'changed',v_changed,
      'person',jsonb_build_object(
        'userId',v_profile.user_id,
        'displayName',v_profile.display_name,
        'avatarObjectKey',v_profile.avatar_object_key
      ),
      'idempotent',false
    );
  end if;
  insert into private.course_change_receipts(
    actor_id,request_id,operation,course_id,request_hash,result
  ) values(p_actor_id,p_request_id,p_operation,p_course_id,v_hash,v_result);
  return v_result;
end;
$function$;

-- O token de acesso e autocontido. Operacoes sensiveis de Storage verificam
-- tambem a linha de sessao, fechando a janela residual depois do sign-out ou
-- da exclusao. A checagem inclui a conta e o perfil ainda existentes.
create function private.current_auth_session_is_active_v1()
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog,public,auth
as $function$
begin
  -- Storage não executa o pre-request do PostgREST. Uma recusa explícita evita
  -- que o bearer OAuth pareça uma sessão comum ou transforme sondagem em 200.
  if nullif(btrim(coalesce(auth.jwt()->>'client_id','')),'') is not null then
    raise exception 'Este token OAuth deve usar somente o endpoint MCP.'
      using errcode='42501';
  end if;
  return coalesce(
    (select auth.uid()) is not null
    and coalesce(auth.jwt()->>'session_id','')
      ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and exists(
      select 1
      from auth.users auth_user
      join auth.sessions session_value on session_value.user_id=auth_user.id
      join public.person_profiles profile on profile.user_id=auth_user.id
      where auth_user.id=(select auth.uid())
        and auth_user.deleted_at is null
        and not auth_user.is_anonymous
        and (auth_user.banned_until is null
          or auth_user.banned_until<=statement_timestamp())
        and session_value.id=(auth.jwt()->>'session_id')::uuid
        and (session_value.not_after is null
          or session_value.not_after>statement_timestamp())
    ),false
  );
end
$function$;

revoke all on function private.current_auth_session_is_active_v1()
from public,anon,authenticated,service_role;
grant execute on function private.current_auth_session_is_active_v1()
to authenticated;

-- A escrita de Storage e a exclusao da conta usam o mesmo lock. Se o upload
-- chegar primeiro, a exclusao volta a verificar os objetos depois do commit;
-- se a exclusao chegar primeiro, a sessao ja nao estara viva quando o upload
-- puder continuar.
create function private.lock_current_account_storage_write_v1()
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog,private,auth
as $function$
declare
  v_user_id uuid:=auth.uid();
  v_session_active boolean:=false;
begin
  if v_user_id is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'account-delete:'||v_user_id::text,0
  ));
  -- VOLATILE obtem uma fotografia nova para esta consulta, depois da espera
  -- pelo lock. Assim uma exclusao que venceu a corrida ja nao deixa a escrita
  -- reutilizar o resultado de sessao observado no inicio do INSERT.
  select private.current_auth_session_is_active_v1()
  into v_session_active;
  return coalesce(v_session_active,false);
end;
$function$;

revoke all on function private.lock_current_account_storage_write_v1()
from public,anon,authenticated,service_role;
grant execute on function private.lock_current_account_storage_write_v1()
to authenticated;

drop policy person_avatars_direct_relation_select_v1 on storage.objects;
create policy person_avatars_direct_relation_select_v1
on storage.objects
for select to authenticated
using(
  bucket_id='person-avatars'
  and private.current_auth_session_is_active_v1()
  and private.can_read_person_v1(split_part(name,'/',1))
);

drop policy person_avatars_self_insert_v1 on storage.objects;
create policy person_avatars_self_insert_v1
on storage.objects
for insert to authenticated
with check(
  bucket_id='person-avatars'
  and owner_id=(select auth.uid())::text
  and private.lock_current_account_storage_write_v1()
  and exists(
    select 1 from public.person_profiles profile
    where profile.user_id=(select auth.uid())
  )
  and name~(
    '^'||(select auth.uid())::text||
    '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
  )
);

drop policy person_avatars_self_delete_v1 on storage.objects;
create policy person_avatars_self_delete_v1
on storage.objects
for delete to authenticated
using(
  bucket_id='person-avatars'
  and owner_id=(select auth.uid())::text
  and private.current_auth_session_is_active_v1()
  and split_part(name,'/',1)=(select auth.uid())::text
);

drop policy course_source_pdfs_owner_select_v1 on storage.objects;
create policy course_source_pdfs_owner_select_v1
on storage.objects
for select to authenticated
using(
  bucket_id='course-source-pdfs'
  and private.current_auth_session_is_active_v1()
  and private.can_read_course_source_pdf_v1(name)
);

-- A intent preserva a cota e o caminho exato validados pelo preparo, mas nao
-- e uma credencial: a escrita ainda exige o JWT e a sessao viva.
create table private.course_source_pdf_upload_intents(
  actor_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  storage_path text not null,
  content_hash text not null,
  byte_size bigint not null,
  media_type text not null,
  source_id text not null,
  source_revision bigint not null,
  course_revision bigint not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '10 minutes',
  primary key(actor_id,course_id,storage_path),
  constraint course_source_pdf_upload_intents_values_v1 check(
    storage_path=course_id::text||'/'||content_hash||'.pdf'
    and content_hash~'^[a-f0-9]{64}$'
    and byte_size between 1 and 20971520
    and media_type='application/pdf'
    and char_length(source_id) between 1 and 2048
    and source_id!~'[[:cntrl:]]'
    and source_revision>0 and course_revision>0
  ),
  constraint course_source_pdf_upload_intents_expiry_v1 check(
    expires_at>created_at and expires_at<=created_at+interval '10 minutes'
  )
);

create index course_source_pdf_upload_intents_expiry_v1_idx
on private.course_source_pdf_upload_intents(expires_at,actor_id,course_id,storage_path);

create index course_source_pdf_upload_intents_quota_v1_idx
on private.course_source_pdf_upload_intents(course_id,content_hash,expires_at)
include(byte_size);

alter table private.course_source_pdf_upload_intents enable row level security;
alter table private.course_source_pdf_upload_intents force row level security;
revoke all on table private.course_source_pdf_upload_intents
from public,anon,authenticated,service_role;

-- A reserva da cota acompanha todos os bytes que o Curso ja consegue manter:
-- vinculos imutaveis, objetos ainda nao vinculados no proprio prefixo e
-- preparos vivos. O agrupamento por hash evita cobrar novamente o mesmo blob.
create function private.course_source_pdf_reserved_bytes_v1(p_course_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = pg_catalog,private,storage
as $function$
  with reservation as(
    select attachment.content_hash,attachment.byte_size
    from private.course_source_attachments attachment
    where attachment.course_id=p_course_id
    union all
    select split_part(split_part(object_value.name,'/',2),'.',1),
      (object_value.metadata->>'size')::bigint
    from storage.objects object_value
    where object_value.bucket_id='course-source-pdfs'
      and object_value.name~(
        '^'||p_course_id::text||'/[a-f0-9]{64}[.]pdf$'
      )
      and jsonb_typeof(object_value.metadata)='object'
      and coalesce(object_value.metadata->>'size','')~'^[1-9][0-9]{0,8}$'
    union all
    select intent.content_hash,intent.byte_size
    from private.course_source_pdf_upload_intents intent
    where intent.course_id=p_course_id
      and intent.expires_at>statement_timestamp()
  ), unique_reservation as(
    select reservation.content_hash,max(reservation.byte_size) byte_size
    from reservation
    group by reservation.content_hash
  )
  select coalesce(sum(unique_reservation.byte_size),0)::bigint
  from unique_reservation
$function$;

revoke all on function private.course_source_pdf_reserved_bytes_v1(uuid)
from public,anon,authenticated,service_role;

comment on function private.course_source_pdf_reserved_bytes_v1(uuid) is
  'Bytes reservados da cota PDF por hash unico: vinculos, objetos fisicos no prefixo do Curso e intents vivos.';

create function private.can_upload_course_source_pdf_v1(
  p_storage_path text,
  p_metadata jsonb
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog,public,private,auth
as $function$
declare
  v_allowed boolean:=false;
begin
  -- O helper adquire o lock e so entao confronta a sessao numa consulta nova.
  if not private.lock_current_account_storage_write_v1() then
    return false;
  end if;
  select exists(
    select 1
    from private.course_source_pdf_upload_intents intent
    join public.courses course on course.id=intent.course_id
    where intent.actor_id=(select auth.uid())
      and intent.storage_path=p_storage_path
      and intent.expires_at>statement_timestamp()
      -- No INSERT, o Storage ainda fornece o comprimento recebido; `size`
      -- so aparece nos metadados finais depois que o objeto foi persistido.
      and coalesce(p_metadata->>'contentLength','')~'^[0-9]{1,12}$'
      and (p_metadata->>'contentLength')::bigint=intent.byte_size
      and lower(coalesce(p_metadata->>'mimetype',''))=intent.media_type
      and course.owner_id=(select auth.uid())
      and course.revision=intent.course_revision
  ) into v_allowed;
  return coalesce(v_allowed,false);
end;
$function$;

revoke all on function private.can_upload_course_source_pdf_v1(text,jsonb)
from public,anon,authenticated,service_role;
grant execute on function private.can_upload_course_source_pdf_v1(text,jsonb)
to authenticated;

create policy course_source_pdfs_owner_insert_v1
on storage.objects
for insert to authenticated
with check(
  bucket_id='course-source-pdfs'
  and owner_id=(select auth.uid())::text
  and private.can_upload_course_source_pdf_v1(name,metadata)
);

create function private.consume_course_source_pdf_upload_intent_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog,private
as $function$
begin
  if new.bucket_id='course-source-pdfs'
     and new.owner_id~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    delete from private.course_source_pdf_upload_intents intent
    where intent.actor_id=new.owner_id::uuid
      and intent.storage_path=new.name
      and intent.expires_at>statement_timestamp();
  end if;
  return new;
end;
$function$;

create trigger consume_course_source_pdf_upload_intent_v1
after insert on storage.objects
for each row execute function private.consume_course_source_pdf_upload_intent_v1();

revoke all on function private.consume_course_source_pdf_upload_intent_v1()
from public,anon,authenticated,service_role;

create or replace function public.get_course_source_attachment_access_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_course_revision bigint,
  p_operation text,
  p_source_id text,
  p_source_revision bigint,
  p_content_hash text,
  p_byte_size bigint default null,
  p_media_type text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog,public,private,storage
as $function$
declare
  v_course_revision bigint;
  v_source private.course_source_revisions%rowtype;
  v_attachment private.course_source_attachments%rowtype;
  v_storage_path text;
  v_storage_origin_course_id uuid;
  v_object_exists boolean;
  v_hash_already_counted boolean;
  v_reserved_bytes bigint;
  v_upload_required boolean:=false;
  v_already_linked boolean:=false;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_course_revision is null or p_expected_course_revision<1
     or p_operation not in('prepare_upload','download')
     or p_source_id is null
     or char_length(p_source_id) not between 1 and 2048
     or p_source_id~'[[:cntrl:]]'
     or p_source_revision is null or p_source_revision<1
     or p_content_hash is null or p_content_hash!~'^[a-f0-9]{64}$'
     or p_operation='prepare_upload' and(
       p_byte_size is null or p_byte_size not between 1 and 20971520
       or p_media_type is distinct from 'application/pdf'
     )
     or p_operation='download' and(
       p_byte_size is not null or p_media_type is not null
     ) then
    raise exception 'Acesso ao anexo de Fonte invalido.' using errcode='22023';
  end if;
  select course.revision into strict v_course_revision
  from public.courses course where course.id=p_course_id for share;
  if v_course_revision<>p_expected_course_revision then
    raise exception 'O Curso mudou; releia antes de acessar o anexo.'
      using errcode='40001';
  end if;
  select * into v_source from private.course_source_revisions source
  where source.course_id=p_course_id and source.source_id=p_source_id
    and source.revision=p_source_revision;
  if not found then
    raise exception 'Revisao da Fonte inexistente.' using errcode='PT404';
  end if;
  select * into v_attachment
  from private.course_source_attachments attachment
  where attachment.course_id=p_course_id and attachment.source_id=p_source_id
    and attachment.source_revision=p_source_revision
    and attachment.content_hash=p_content_hash;
  v_already_linked:=found;
  v_storage_path:=case when v_already_linked
    then v_attachment.storage_path
    else p_course_id::text||'/'||p_content_hash||'.pdf'
  end;
  if v_storage_path!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[a-f0-9]{64}\.pdf$'
     or split_part(v_storage_path,'/',2)<>p_content_hash||'.pdf' then
    raise exception 'O vinculo do anexo possui caminho incompativel.'
      using errcode='23514';
  end if;
  v_storage_origin_course_id:=split_part(v_storage_path,'/',1)::uuid;

  if p_operation='prepare_upload' then
    perform pg_advisory_xact_lock(hashtextextended(
      'course-source-pdf-quota:'||p_course_id::text,0
    ));
    if v_source.status<>'active' or exists(
      select 1 from private.course_source_revisions current_source
      where current_source.course_id=p_course_id
        and current_source.source_id=p_source_id
        and current_source.revision>p_source_revision
    ) then
      raise exception 'O anexo exige a revisao corrente e ativa da Fonte.'
        using errcode='23514';
    end if;
    if v_already_linked and(
      v_attachment.byte_size<>p_byte_size
      or v_attachment.media_type<>p_media_type
    ) then
      raise exception 'O hash ja esta vinculado com metadados incompativeis.'
        using errcode='23514';
    end if;
    if exists(
      select 1 from private.course_source_attachments existing
      where existing.course_id=p_course_id
        and existing.content_hash=p_content_hash
        and (existing.byte_size<>p_byte_size
          or existing.media_type<>p_media_type)
    ) or exists(
      select 1 from private.course_source_pdf_upload_intents intent
      where intent.course_id=p_course_id
        and intent.content_hash=p_content_hash
        and intent.expires_at>statement_timestamp()
        and (intent.byte_size<>p_byte_size
          or intent.media_type<>p_media_type)
    ) then
      raise exception 'O hash ja reserva metadados incompativeis.'
        using errcode='23514';
    end if;
    select exists(
      select 1 from private.course_source_attachments existing
      where existing.course_id=p_course_id
        and existing.content_hash=p_content_hash
    ) or exists(
      select 1 from storage.objects object_value
      where object_value.bucket_id='course-source-pdfs'
        and object_value.name=v_storage_path
    ) or exists(
      select 1 from private.course_source_pdf_upload_intents intent
      where intent.course_id=p_course_id
        and intent.content_hash=p_content_hash
        and intent.expires_at>statement_timestamp()
    ) into v_hash_already_counted;
    v_reserved_bytes:=private.course_source_pdf_reserved_bytes_v1(p_course_id);
    if not v_hash_already_counted
       and v_reserved_bytes+p_byte_size>67108864 then
      raise exception 'A cota de 64 MiB de PDFs unicos do Curso seria excedida.'
        using errcode='23514';
    end if;
    select exists(
      select 1 from storage.objects object_value
      where object_value.bucket_id='course-source-pdfs'
        and object_value.name=v_storage_path
    ) into v_object_exists;
    if v_object_exists and not private.valid_course_source_pdf_object_v1(
      v_storage_path,p_byte_size,p_media_type
    ) then
      raise exception 'O objeto deduplicado possui tamanho ou tipo incompativel.'
        using errcode='23514';
    end if;
    if v_already_linked and not v_object_exists then
      raise exception 'O objeto vinculado esta ausente.' using errcode='55000';
    end if;
    v_upload_required:=not v_object_exists;
    if v_upload_required then
      insert into private.course_source_pdf_upload_intents(
        actor_id,course_id,storage_path,content_hash,byte_size,media_type,
        source_id,source_revision,course_revision,created_at,expires_at
      ) values(
        p_actor_id,p_course_id,v_storage_path,p_content_hash,p_byte_size,
        p_media_type,p_source_id,p_source_revision,v_course_revision,
        statement_timestamp(),statement_timestamp()+interval '10 minutes'
      )
      on conflict(actor_id,course_id,storage_path) do update set
        content_hash=excluded.content_hash,byte_size=excluded.byte_size,
        media_type=excluded.media_type,source_id=excluded.source_id,
        source_revision=excluded.source_revision,
        course_revision=excluded.course_revision,created_at=excluded.created_at,
        expires_at=excluded.expires_at;
    else
      delete from private.course_source_pdf_upload_intents intent
      where intent.actor_id=p_actor_id and intent.course_id=p_course_id
        and intent.storage_path=v_storage_path;
    end if;
  else
    if not v_already_linked then
      raise exception 'Anexo nao vinculado a revisao solicitada.' using errcode='PT404';
    end if;
    if not private.valid_course_source_pdf_object_v1(
      v_attachment.storage_path,v_attachment.byte_size,v_attachment.media_type
    ) then
      raise exception 'O objeto vinculado esta ausente ou divergiu dos metadados.'
        using errcode='55000';
    end if;
    p_byte_size:=v_attachment.byte_size;
    p_media_type:=v_attachment.media_type;
    v_storage_path:=v_attachment.storage_path;
  end if;

  return jsonb_build_object(
    -- O download v1 permanece somente como leitura transitória para o Android
    -- 0.0.26 já instalado. O upload antigo assinado não volta a ser emitido.
    'contract',case when p_operation='download'
      then 'aralearn.course-source-attachment-access.v1'
      else 'aralearn.course-source-attachment-access.v2'
    end,
    'courseId',p_course_id,'courseRevision',v_course_revision,
    'operation',p_operation,'sourceId',p_source_id,
    'sourceRevision',p_source_revision,
    'storageOriginCourseId',v_storage_origin_course_id,
    'attachment',jsonb_build_object(
      'contentHash',p_content_hash,'byteSize',p_byte_size,
      'mediaType',p_media_type,'storagePath',v_storage_path
    ),
    'uploadRequired',v_upload_required,'alreadyLinked',v_already_linked,
    'signedUrl',null,'expiresAt',null
  );
end;
$function$;

-- A exclusao invalida refresh tokens antes de iniciar o cascade. Um JWT ja
-- emitido continua criptograficamente valido ate expirar, por isso as escritas
-- sensiveis acima tambem confrontam session_id com auth.sessions.
create or replace function public.delete_my_account_v1(p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private,auth,storage
set statement_timeout = '60s'
as $function$
declare
  v_user_id uuid:=auth.uid();
begin
  if v_user_id is null then
    raise exception 'Autenticacao obrigatoria.' using errcode='42501';
  end if;
  if nullif(btrim(coalesce(auth.jwt()->>'client_id','')),'') is not null then
    raise exception 'A exclusao de conta exige a sessao da aplicacao.'
      using errcode='42501';
  end if;
  if p_confirmation is distinct from 'EXCLUIR MINHA CONTA' then
    raise exception 'Confirmacao invalida.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'account-delete:'||v_user_id::text,0
  ));
  if not exists(select 1 from auth.users auth_user where auth_user.id=v_user_id) then
    return jsonb_build_object(
      'contract','aralearn.account-deletion.v1','status','deleted'
    );
  end if;
  if not private.current_auth_session_is_active_v1() then
    raise exception 'A exclusao de conta exige uma sessao ativa da aplicacao.'
      using errcode='42501';
  end if;
  if exists(
    select 1 from storage.objects object_value
    where object_value.bucket_id='person-avatars'
      and split_part(object_value.name,'/',1)=v_user_id::text
  ) then
    raise exception 'Remova os objetos privados de avatar antes de excluir a conta.'
      using errcode='AR001';
  end if;
  if exists(
    select 1 from storage.objects object_value
    join public.courses course
      on course.id::text=split_part(object_value.name,'/',1)
    where object_value.bucket_id='course-source-pdfs'
      and course.owner_id=v_user_id
  ) then
    raise exception 'Remova os PDFs privados dos Cursos antes de excluir a conta.'
      using errcode='AR001';
  end if;
  delete from public.course_access access_value
  where access_value.granted_by=v_user_id;
  update private.course_events event_value
  set summary=(event_value.summary-'targetUserId')||
    jsonb_build_object('targetAccountDeleted',true)
  where event_value.summary->>'targetUserId'=v_user_id::text;
  update private.course_change_receipts receipt
  set result=jsonb_set(
    receipt.result,'{person}',jsonb_build_object('accountDeleted',true),false
  )
  where receipt.result#>>'{person,userId}'=v_user_id::text;
  delete from private.course_authoring_part_didactic_microsequences membership
  using public.courses course
  where course.owner_id=v_user_id and membership.course_id=course.id;
  delete from private.course_authoring_part_materializations materialization
  using public.courses course
  where course.owner_id=v_user_id and materialization.course_id=course.id;
  delete from auth.sessions session_value where session_value.user_id=v_user_id;
  delete from auth.users auth_user where auth_user.id=v_user_id;
  if not found then
    raise exception 'Conta inexistente.' using errcode='PT404';
  end if;
  return jsonb_build_object(
    'contract','aralearn.account-deletion.v1','status','deleted'
  );
end;
$function$;

-- Cada classe tem o proprio limite. Assim uma classe volumosa nao impede as
-- demais e o custo maximo de uma rodada permanece previsivel.
create function private.run_current_data_retention_v1(p_limit integer default 512)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private
as $function$
declare
  v_annotations integer:=0;
  v_annotation_receipts integer:=0;
  v_change_receipts integer:=0;
  v_state_receipts integer:=0;
  v_upload_intents integer:=0;
  v_access_windows integer:=0;
  v_now timestamptz:=statement_timestamp();
begin
  if p_limit is null or p_limit not between 1 and 1000 then
    raise exception 'Limite de retencao invalido.' using errcode='22023';
  end if;
  with candidate_courses as materialized(
    select course.id from public.courses course
    where exists(
      select 1 from private.course_anchored_annotations annotation
      where annotation.course_id=course.id
        and annotation.hard_delete_after<=v_now
    )
    order by course.id
    limit p_limit
    for update skip locked
  ), expired as materialized(
    select annotation.id
    from private.course_anchored_annotations annotation
    join candidate_courses candidate on candidate.id=annotation.course_id
    where annotation.hard_delete_after<=v_now
    order by annotation.hard_delete_after,annotation.id
    limit p_limit
    for update of annotation skip locked
  ), removed as materialized(
    delete from private.course_anchored_annotations annotation
    using expired where annotation.id=expired.id
    returning annotation.course_id,annotation.actor_id
  ), affected_courses as materialized(
    select removed.course_id,count(*)::bigint removed_count
    from removed group by removed.course_id
  ), bumped_courses as(
    update public.courses course set
      annotation_set_version=course.annotation_set_version+
        affected_courses.removed_count
    from affected_courses where course.id=affected_courses.course_id
    returning course.id
  ), affected_viewers as materialized(
    select removed.course_id,removed.actor_id,count(*)::bigint removed_count
    from removed where removed.actor_id is not null
    group by removed.course_id,removed.actor_id
  ), bumped_viewers as(
    update private.course_anchored_annotation_viewer_versions viewer set
      version=viewer.version+affected_viewers.removed_count
    from affected_viewers
    where viewer.course_id=affected_viewers.course_id
      and viewer.actor_id=affected_viewers.actor_id
    returning viewer.actor_id
  )
  select count(*)::integer into v_annotations from removed;

  with expired as materialized(
    select receipt.ctid from private.course_anchored_annotation_receipts receipt
    where receipt.expires_at<=v_now
    order by receipt.expires_at,receipt.actor_id,receipt.request_id
    limit p_limit for update skip locked
  ), removed as(
    delete from private.course_anchored_annotation_receipts receipt
    using expired where receipt.ctid=expired.ctid returning 1
  ) select count(*)::integer into v_annotation_receipts from removed;

  with expired as materialized(
    select receipt.ctid from private.course_change_receipts receipt
    where receipt.expires_at<=v_now
    order by receipt.expires_at,receipt.actor_id,receipt.request_id
    limit p_limit for update skip locked
  ), removed as(
    delete from private.course_change_receipts receipt
    using expired where receipt.ctid=expired.ctid returning 1
  ) select count(*)::integer into v_change_receipts from removed;

  with expired as materialized(
    select receipt.ctid from private.course_personal_state_receipts receipt
    where receipt.expires_at<=v_now
    order by receipt.expires_at,receipt.user_id,receipt.request_id
    limit p_limit for update skip locked
  ), removed as(
    delete from private.course_personal_state_receipts receipt
    using expired where receipt.ctid=expired.ctid returning 1
  ) select count(*)::integer into v_state_receipts from removed;

  with expired as materialized(
    select intent.ctid from private.course_source_pdf_upload_intents intent
    where intent.expires_at<=v_now
    order by intent.expires_at,intent.actor_id,intent.course_id,intent.storage_path
    limit p_limit for update skip locked
  ), removed as(
    delete from private.course_source_pdf_upload_intents intent
    using expired where intent.ctid=expired.ctid returning 1
  ) select count(*)::integer into v_upload_intents from removed;

  with expired as materialized(
    select rate_value.ctid from private.course_access_grant_rate_limits rate_value
    where rate_value.window_started_at<=v_now-interval '30 days'
    order by rate_value.window_started_at,rate_value.actor_id
    limit p_limit for update skip locked
  ), removed as(
    delete from private.course_access_grant_rate_limits rate_value
    using expired where rate_value.ctid=expired.ctid returning 1
  ) select count(*)::integer into v_access_windows from removed;

  return jsonb_build_object(
    'contract','aralearn.current-data-retention.v1',
    'ranAt',v_now,'limitPerClass',p_limit,
    'removed',jsonb_build_object(
      'withdrawnAnnotations',v_annotations,
      'anchoredAnnotationReceipts',v_annotation_receipts,
      'courseChangeReceipts',v_change_receipts,
      'personalStateReceipts',v_state_receipts,
      'pdfUploadIntents',v_upload_intents,
      'accessGrantWindows',v_access_windows
    )
  );
end;
$function$;

revoke all on function private.run_current_data_retention_v1(integer)
from public,anon,authenticated,service_role;
grant execute on function private.run_current_data_retention_v1(integer)
to service_role;

-- Inventario somente de leitura. Caminhos sao necessarios para uma futura
-- remocao autorizada, mas nao ha e-mail, token ou exclusao automatica.
create function private.inventory_current_data_orphans_v1(p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog,public,private,auth,storage
as $function$
declare
  v_items jsonb;
  v_counts jsonb;
begin
  if p_limit is null or p_limit not between 1 and 500 then
    raise exception 'Limite de inventario invalido.' using errcode='22023';
  end if;
  with object_orphans as materialized(
    select object_value.bucket_id,object_value.name,
      case
        when object_value.bucket_id='person-avatars' and(
          split_part(object_value.name,'/',1)
            !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          or not exists(
            select 1 from auth.users auth_user
            where auth_user.id::text=split_part(object_value.name,'/',1)
          )
        ) then 'avatar_owner_missing'
        when object_value.bucket_id='person-avatars' and not exists(
          select 1 from public.person_profiles profile
          where profile.user_id::text=split_part(object_value.name,'/',1)
            and profile.avatar_object_key=object_value.name
        ) then 'avatar_profile_unlinked'
        when object_value.bucket_id='course-source-pdfs' and not exists(
          select 1 from public.courses course
          where course.id::text=split_part(object_value.name,'/',1)
        ) then 'pdf_course_missing'
        when object_value.bucket_id='course-source-pdfs' and not exists(
          select 1 from private.course_source_attachments attachment
          where attachment.storage_path=object_value.name
        ) then 'pdf_unlinked'
        else null
      end classification
    from storage.objects object_value
    where object_value.bucket_id in('person-avatars','course-source-pdfs')
  ), missing_objects as materialized(
    select 'course-source-pdfs'::text bucket_id,attachment.storage_path name,
      'pdf_object_missing'::text classification
    from private.course_source_attachments attachment
    where not exists(
      select 1 from storage.objects object_value
      where object_value.bucket_id='course-source-pdfs'
        and object_value.name=attachment.storage_path
    )
  ), all_orphans as materialized(
    select * from object_orphans where classification is not null
    union all select * from missing_objects
  ), counted as(
    select classification,count(*)::bigint item_count
    from all_orphans group by classification
  )
  select coalesce(jsonb_object_agg(classification,item_count),'{}'::jsonb)
  into v_counts from counted;
  with object_orphans as materialized(
    select object_value.bucket_id,object_value.name,
      case
        when object_value.bucket_id='person-avatars' and(
          split_part(object_value.name,'/',1)
            !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          or not exists(select 1 from auth.users auth_user
            where auth_user.id::text=split_part(object_value.name,'/',1))
        ) then 'avatar_owner_missing'
        when object_value.bucket_id='person-avatars' and not exists(
          select 1 from public.person_profiles profile
          where profile.user_id::text=split_part(object_value.name,'/',1)
            and profile.avatar_object_key=object_value.name
        ) then 'avatar_profile_unlinked'
        when object_value.bucket_id='course-source-pdfs' and not exists(
          select 1 from public.courses course
          where course.id::text=split_part(object_value.name,'/',1)
        ) then 'pdf_course_missing'
        when object_value.bucket_id='course-source-pdfs' and not exists(
          select 1 from private.course_source_attachments attachment
          where attachment.storage_path=object_value.name
        ) then 'pdf_unlinked'
        else null
      end classification
    from storage.objects object_value
    where object_value.bucket_id in('person-avatars','course-source-pdfs')
  ), all_orphans as materialized(
    select * from object_orphans where classification is not null
    union all
    select 'course-source-pdfs',attachment.storage_path,'pdf_object_missing'
    from private.course_source_attachments attachment
    where not exists(
      select 1 from storage.objects object_value
      where object_value.bucket_id='course-source-pdfs'
        and object_value.name=attachment.storage_path
    )
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'classification',classification,'bucketId',bucket_id,'objectPath',name
  ) order by classification,bucket_id,name),'[]'::jsonb)
  into v_items from(
    select * from all_orphans order by classification,bucket_id,name limit p_limit
  ) page;
  return jsonb_build_object(
    'contract','aralearn.current-data-orphan-inventory.v1',
    'generatedAt',statement_timestamp(),'counts',v_counts,'items',v_items,
    'legacyOAuth',jsonb_build_object(
      'expiredAuthorizations',case when to_regclass(
        'private.authoring_action_oauth_authorizations'
      ) is null then null else(
        select count(*) from private.authoring_action_oauth_authorizations value
        where value.expires_at<=statement_timestamp()
      ) end,
      'expiredOrRevokedTokens',case when to_regclass(
        'private.authoring_action_oauth_tokens'
      ) is null then null else(
        select count(*) from private.authoring_action_oauth_tokens value
        where value.expires_at<=statement_timestamp()
          or value.revoked_at is not null
      ) end
    )
  );
end;
$function$;

revoke all on function private.inventory_current_data_orphans_v1(integer)
from public,anon,authenticated,service_role;
grant execute on function private.inventory_current_data_orphans_v1(integer)
to service_role;

-- Supabase Cron e suportado pelo runtime local e hospedado corrente. A funcao
-- permanece acionavel manualmente, e o job diario deixa a limpeza independente
-- da abertura de qualquer Curso.
create extension if not exists pg_cron;
select cron.schedule(
  'aralearn-current-data-retention-v1',
  '17 3 * * *',
  'select private.run_current_data_retention_v1(512);'
);

-- Tokens antigos carregavam sub/session_id reais e escopo openid. O corte
-- revoga os consentimentos e remove apenas sessoes OAuth; as FKs do GoTrue
-- apagam seus refresh tokens, enquanto sessoes normais permanecem intactas.
-- Os locks impedem que uma troca concorrente sobreviva entre os dois passos.
lock table auth.oauth_consents,auth.sessions in share row exclusive mode;
update auth.oauth_consents consent_value
set revoked_at=statement_timestamp()
where consent_value.revoked_at is null;
delete from auth.sessions session_value
where session_value.oauth_client_id is not null;

do $current_data_lifecycle_postflight$
declare
  v_definition text;
  v_hash_definition text;
  v_storage_lock_definition text;
  v_data_api_gate_definition text;
  v_oauth_hook_definition text;
  v_oauth_principal_definition text;
  v_pdf_quota_definition text;
  v_session_definition text;
  v_policy text;
  v_live_session_policy_count integer;
begin
  select pg_get_functiondef(
    'public.aralearn_mcp_access_token_hook(jsonb)'::regprocedure
  ) into v_oauth_hook_definition;
  select pg_get_functiondef(
    'public.resolve_mcp_oauth_principal_v1(uuid,uuid,uuid,uuid)'::regprocedure
  ) into v_oauth_principal_definition;
  if strpos(v_oauth_hook_definition,'''offline_access''')=0
     or strpos(v_oauth_hook_definition,'''aralearn_session_id''')=0
     or strpos(v_oauth_hook_definition,'''aralearn_actor_id''')>0
     or strpos(v_oauth_hook_definition,'''user_metadata''')>0
     or strpos(v_oauth_hook_definition,'''app_metadata''')>0
     or strpos(v_oauth_hook_definition,'''subject-v1''')=0
     or strpos(v_oauth_hook_definition,'''session-v1''')=0
     or not(
       select procedure_value.prosecdef
       from pg_proc procedure_value
       where procedure_value.oid=
         'public.derive_mcp_oauth_pairwise_id_v1(text,uuid,uuid)'::regprocedure
     )
     or strpos(v_oauth_principal_definition,'p_source_session_id')=0
     or strpos(v_oauth_principal_definition,'session_value.id=p_source_session_id')=0
     or strpos(v_oauth_principal_definition,'offline_access')=0
     or strpos(v_oauth_principal_definition,'oauth_consents')=0
     or exists(
       select 1 from auth.oauth_consents consent_value
       where consent_value.revoked_at is null
     )
     or exists(
       select 1 from auth.sessions session_value
       where session_value.oauth_client_id is not null
     ) then
    raise exception 'O bearer OAuth anterior nao foi confinado ou revogado.'
      using errcode='55000';
  end if;
  select pg_get_functiondef(
    'public.enforce_aralearn_data_api_token_v1()'::regprocedure
  ) into v_data_api_gate_definition;
  if strpos(v_data_api_gate_definition,'client_id')=0
     or not exists(
       select 1
       from pg_roles role_value,
         unnest(coalesce(role_value.rolconfig,array[]::text[])) setting_value
       where role_value.rolname='authenticator'
         and setting_value=
           'pgrst.db_pre_request=public.enforce_aralearn_data_api_token_v1'
     ) then
    raise exception 'A Data API nao bloqueia tokens OAuth do MCP.'
      using errcode='55000';
  end if;
  select pg_get_functiondef(
    'public.manage_course_access_for_actor_v1(uuid,uuid,text,text,uuid,boolean,text)'::regprocedure
  ) into v_definition;
  if strpos(v_definition,'''aralearn.course-access-grant-request.v1''')=0
     or strpos(v_definition,'''course-access-grant-rate:''')=0
     or strpos(v_definition,'account-delete:')=0 then
    raise exception 'A concessao generica ou sua limitacao nao foram instaladas.'
      using errcode='55000';
  end if;
  v_hash_definition:=split_part(
    split_part(v_definition,'v_hash :=',2),
    'PERFORM pg_advisory_xact_lock',1
  );
  if v_hash_definition is null
     or strpos(v_hash_definition,'v_target_email')>0 then
    raise exception 'A identidade de concessao ainda deriva do e-mail.'
      using errcode='55000';
  end if;
  select policy_value.with_check into v_policy
  from pg_policies policy_value
  where policy_value.schemaname='storage'
    and policy_value.tablename='objects'
    and policy_value.policyname='course_source_pdfs_owner_insert_v1';
  select count(*)::integer into v_live_session_policy_count
  from pg_policies policy_value
  where policy_value.schemaname='storage'
    and policy_value.tablename='objects'
    and policy_value.policyname in(
      'person_avatars_direct_relation_select_v1',
      'person_avatars_self_insert_v1',
      'person_avatars_self_delete_v1',
      'course_source_pdfs_owner_select_v1'
    )
    and strpos(
      coalesce(policy_value.with_check,policy_value.qual,''),
      'current_auth_session_is_active_v1'
    )>0;
  select pg_get_functiondef(
    'private.lock_current_account_storage_write_v1()'::regprocedure
  ) into v_storage_lock_definition;
  select pg_get_functiondef(
    'private.course_source_pdf_reserved_bytes_v1(uuid)'::regprocedure
  ) into v_pdf_quota_definition;
  select pg_get_functiondef(
    'private.current_auth_session_is_active_v1()'::regprocedure
  ) into v_session_definition;
  if v_policy is null
     or strpos(v_policy,'can_upload_course_source_pdf_v1')=0
     or v_live_session_policy_count<>3
     or strpos(v_storage_lock_definition,'pg_advisory_xact_lock')=0
     or strpos(v_storage_lock_definition,'current_auth_session_is_active_v1')=0
     or strpos(v_storage_lock_definition,'pg_advisory_xact_lock')>
        strpos(v_storage_lock_definition,'current_auth_session_is_active_v1')
     or not exists(
       select 1 from pg_trigger trigger_value
       where trigger_value.tgrelid='storage.objects'::regclass
         and trigger_value.tgname='consume_course_source_pdf_upload_intent_v1'
         and not trigger_value.tgisinternal
     )
     or not exists(
      select 1 from cron.job job
      where job.jobname='aralearn-current-data-retention-v1'
        and job.command='select private.run_current_data_retention_v1(512);'
     ) or strpos(v_pdf_quota_definition,'course_source_attachments')=0
     or strpos(v_pdf_quota_definition,'storage.objects')=0
     or strpos(v_pdf_quota_definition,'course_source_pdf_upload_intents')=0
     or strpos(v_pdf_quota_definition,'statement_timestamp')=0
     or to_regclass(
       'private.course_source_pdf_upload_intents_quota_v1_idx'
     ) is null
     or has_function_privilege(
       'anon','private.course_source_pdf_reserved_bytes_v1(uuid)','execute'
     )
     or has_function_privilege(
       'authenticated','private.course_source_pdf_reserved_bytes_v1(uuid)','execute'
     )
     or has_function_privilege(
       'service_role','private.course_source_pdf_reserved_bytes_v1(uuid)','execute'
     )
     or strpos(v_session_definition,'auth_user.deleted_at is null')=0
     or strpos(v_session_definition,'not auth_user.is_anonymous')=0
     or strpos(v_session_definition,'auth_user.banned_until')=0 then
    raise exception 'Upload autenticado ou limpeza independente nao foram instalados.'
      using errcode='55000';
  end if;
  select pg_get_functiondef(
    'public.delete_my_account_v1(text)'::regprocedure
  ) into v_definition;
  if strpos(lower(v_definition),'delete from auth.sessions')=0
     or strpos(lower(v_definition),'delete from auth.users')=0
     or strpos(lower(v_definition),'delete from auth.sessions')>
        strpos(lower(v_definition),'delete from auth.users') then
    raise exception 'A exclusao nao revoga sessoes antes da conta.'
      using errcode='55000';
  end if;
end;
$current_data_lifecycle_postflight$;

do $advance_current_data_lifecycle_manifest$
declare
  v_manifest jsonb;
  v_body text;
begin
  v_manifest:=public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision'<>'20260821145358'
     or (v_manifest->>'contractVersion')::integer<>1 then
    raise exception 'Manifesto concorrente ao ciclo de dados.' using errcode='55000';
  end if;
  v_manifest:=jsonb_set(
    jsonb_set(v_manifest,'{schemaRevision}',to_jsonb('20260821191340'::text)),
    '{features}',
    (v_manifest->'features')||jsonb_build_array(
      'current-data-lifecycle-v1',
      'authenticated-course-source-pdf-upload-v1',
      'isolated-mcp-oauth-principal-v1'
    )
  );
  v_body:='select '||quote_literal(v_manifest::text)||'::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      ||'returns jsonb language sql stable security definer '
      ||'set search_path = pg_catalog as %L',v_body
  );
  revoke all on function public.get_aralearn_runtime_manifest()
  from public,anon,authenticated,service_role;
  grant execute on function public.get_aralearn_runtime_manifest()
  to anon,authenticated,service_role;
end;
$advance_current_data_lifecycle_manifest$;

do $current_data_lifecycle_manifest_postflight$
declare
  v_manifest jsonb;
begin
  v_manifest:=public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision'<>'20260821191340'
     or (v_manifest->>'contractVersion')::integer<>1
     or jsonb_array_length(v_manifest->'features')<>36
     or not(v_manifest->'features' ?& array[
       'current-data-lifecycle-v1',
       'authenticated-course-source-pdf-upload-v1',
       'isolated-mcp-oauth-principal-v1'
     ]) then
    raise exception 'Manifesto do ciclo de dados nao foi consolidado.'
      using errcode='55000';
  end if;
end;
$current_data_lifecycle_manifest_postflight$;

commit;
