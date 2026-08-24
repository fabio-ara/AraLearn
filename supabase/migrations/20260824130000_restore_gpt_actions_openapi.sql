begin;

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-restore-gpt-actions-openapi-v1',
  0
));

-- O OAuth confidencial específico de Actions já integra o banco publicado.
-- Esta promoção torna explícita sua função corrente e mantém separados o
-- bearer opaco de Actions e o bearer de recurso emitido para o MCP.
do $actions_contract_preflight$
begin
  if to_regclass('private.authoring_action_oauth_clients') is null
     or to_regclass('private.authoring_action_oauth_tokens') is null
     or to_regprocedure(
       'public.resolve_authoring_action_oauth_principal_v4(text)'
     ) is null
     or to_regprocedure(
       'public.create_authoring_action_oauth_client_setup_v4(uuid,text,text)'
     ) is null then
    raise exception 'O OAuth confidencial de Actions não está disponível.'
      using errcode = '55000';
  end if;
  if has_function_privilege(
       'authenticated',
       'public.resolve_authoring_action_oauth_principal_v4(text)',
       'EXECUTE'
     ) then
    raise exception 'A fronteira server-side do OAuth de Actions divergiu.'
      using errcode = '55000';
  end if;
end;
$actions_contract_preflight$;

revoke all on function public.create_authoring_action_oauth_client_setup_v4(
  uuid, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.link_authoring_action_oauth_client_v4(
  uuid, uuid, text
) from public, anon, authenticated, service_role;
revoke all on function public.create_authoring_action_oauth_authorization_v4(
  uuid, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.get_authoring_action_oauth_authorization_v4(
  uuid, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.approve_authoring_action_oauth_authorization_v4(
  uuid, uuid, text
) from public, anon, authenticated, service_role;
revoke all on function public.deny_authoring_action_oauth_authorization_v4(
  uuid, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.exchange_authoring_action_oauth_code_v4(
  uuid, text, text, text, text, text, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.exchange_authoring_action_oauth_refresh_v4(
  uuid, text, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.resolve_authoring_action_oauth_principal_v4(text)
from public, anon, authenticated, service_role;

grant execute on function public.create_authoring_action_oauth_client_setup_v4(
  uuid, text, text
) to service_role;
grant execute on function public.link_authoring_action_oauth_client_v4(
  uuid, uuid, text
) to service_role;
grant execute on function public.create_authoring_action_oauth_authorization_v4(
  uuid, text, text, text
) to service_role;
grant execute on function public.get_authoring_action_oauth_authorization_v4(
  uuid, uuid
) to service_role;
grant execute on function public.approve_authoring_action_oauth_authorization_v4(
  uuid, uuid, text
) to service_role;
grant execute on function public.deny_authoring_action_oauth_authorization_v4(
  uuid, uuid
) to service_role;
grant execute on function public.exchange_authoring_action_oauth_code_v4(
  uuid, text, text, text, text, text, uuid
) to service_role;
grant execute on function public.exchange_authoring_action_oauth_refresh_v4(
  uuid, text, text, text, text
) to service_role;
grant execute on function public.resolve_authoring_action_oauth_principal_v4(text)
to service_role;

do $advance_product_operations_and_actions_manifest$
declare
  v_manifest jsonb;
  v_body text;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision' <> '20260821191340'
     or (v_manifest->>'contractVersion')::integer <> 1 then
    raise exception 'Manifesto concorrente ao fechamento de produto.'
      using errcode = '55000';
  end if;
  v_manifest := jsonb_set(
    jsonb_set(
      v_manifest,
      '{schemaRevision}',
      to_jsonb('20260824130000'::text)
    ),
    '{features}',
    (v_manifest->'features') || jsonb_build_array(
      'course-product-operations-v1',
      'current-administrative-maintenance-v1',
      'gpt-actions-openapi-v1'
    )
  );
  v_body := 'select ' || quote_literal(v_manifest::text) || '::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      || 'returns jsonb language sql stable security definer '
      || 'set search_path = pg_catalog as %L',
    v_body
  );
  revoke all on function public.get_aralearn_runtime_manifest()
  from public, anon, authenticated, service_role;
  grant execute on function public.get_aralearn_runtime_manifest()
  to anon, authenticated, service_role;
end;
$advance_product_operations_and_actions_manifest$;

do $product_operations_and_actions_postflight$
declare
  v_manifest jsonb;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision' <> '20260824130000'
     or jsonb_array_length(v_manifest->'features') <> 39
     or not (v_manifest->'features' ?& array[
       'course-product-operations-v1',
       'current-administrative-maintenance-v1',
       'gpt-actions-openapi-v1'
     ]) then
    raise exception 'Manifesto de operações e Actions não foi consolidado.'
      using errcode = '55000';
  end if;
  if has_function_privilege(
       'authenticated',
       'public.resolve_authoring_action_oauth_principal_v4(text)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.resolve_authoring_action_oauth_principal_v4(text)',
       'EXECUTE'
     ) then
    raise exception 'A fronteira server-side do OAuth de Actions não foi restaurada.'
      using errcode = '55000';
  end if;
end;
$product_operations_and_actions_postflight$;

commit;
