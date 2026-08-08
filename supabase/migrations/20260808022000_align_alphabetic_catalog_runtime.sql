begin;

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-align-alphabetic-catalog-runtime-v1',
  0
));

-- O corte alfabético recriou os leitores depois da remoção do helper v4 e
-- deixou o resolvedor de fixtures com a última referência à posição física.
-- Reescreva somente os corpos históricos conhecidos; qualquer divergência
-- interrompe a migration inteira em vez de ocultar outro estado implantado.
do $recompile_alphabetic_catalog_runtime$
declare
  v_signature regprocedure;
  v_definition text;
  v_rewritten text;
begin
  v_signature := to_regprocedure(
    'public.resolve_catalog_artifact_publisher_v4(text,uuid)'
  );
  if v_signature is null then
    raise exception 'Resolvedor editorial vigente não encontrado.'
      using errcode = '55000';
  end if;
  v_definition := replace(
    pg_get_functiondef(v_signature),
    E'\r\n',
    E'\n'
  );
  if strpos(
    v_definition,
    'order by placement.position, placement.id'
  ) = 0 then
    raise exception 'Resolvedor editorial não corresponde ao corte esperado.'
      using errcode = '55000';
  end if;
  v_rewritten := replace(
    v_definition,
    'order by placement.position, placement.id',
    'order by placement.id'
  );
  if v_rewritten = v_definition
     or v_rewritten like '%placement.position%'
     or v_rewritten not like '%order by placement.id%' then
    raise exception 'Não foi possível recompilar o resolvedor editorial.'
      using errcode = '55000';
  end if;
  execute v_rewritten;

  foreach v_signature in array array[
    to_regprocedure(
      'public.list_authoring_catalog_collections_v4(uuid,integer,uuid,text)'
    ),
    to_regprocedure(
      'public.list_authoring_catalog_courses_v4(uuid,uuid,integer,uuid,text)'
    )
  ]
  loop
    if v_signature is null then
      raise exception 'Leitor alfabético vigente não encontrado.'
        using errcode = '55000';
    end if;
    v_definition := replace(
      pg_get_functiondef(v_signature),
      E'\r\n',
      E'\n'
    );
    if strpos(
      v_definition,
      'private.require_workspace_actor_v4'
    ) = 0
       or strpos(
         v_definition,
         'private.require_workspace_actor_v5'
       ) > 0 then
      raise exception 'Leitor alfabético não corresponde ao corte esperado: %.',
        v_signature using errcode = '55000';
    end if;
    v_rewritten := replace(
      v_definition,
      'private.require_workspace_actor_v4',
      'private.require_workspace_actor_v5'
    );
    if v_rewritten = v_definition
       or v_rewritten like '%private.require_workspace_actor_v4%'
       or v_rewritten not like '%private.require_workspace_actor_v5%' then
      raise exception 'Não foi possível recompilar o leitor alfabético: %.',
        v_signature using errcode = '55000';
    end if;
    execute v_rewritten;
  end loop;
end;
$recompile_alphabetic_catalog_runtime$;

-- As duas rotinas usam expressões STABLE do PostgreSQL. A volatilidade deve
-- refletir isso para que o planejador não trate seus resultados como constantes.
do $align_trail_personal_state_volatility$
begin
  if to_regprocedure(
    'private.valid_trail_personal_state_v1(jsonb)'
  ) is null
     or to_regprocedure(
       'private.merge_trail_personal_state_v1(jsonb,jsonb)'
     ) is null then
    raise exception 'Funções de estado pessoal de Trilhas não encontradas.'
      using errcode = '55000';
  end if;
end;
$align_trail_personal_state_volatility$;

alter function private.valid_trail_personal_state_v1(jsonb) stable;
alter function private.merge_trail_personal_state_v1(jsonb, jsonb) stable;

do $assert_alphabetic_catalog_runtime$
declare
  v_signature regprocedure;
  v_definition text;
begin
  foreach v_signature in array array[
    'public.resolve_catalog_artifact_publisher_v4(text,uuid)'::regprocedure,
    'public.list_authoring_catalog_collections_v4(uuid,integer,uuid,text)'::regprocedure,
    'public.list_authoring_catalog_courses_v4(uuid,uuid,integer,uuid,text)'::regprocedure
  ]
  loop
    v_definition := pg_get_functiondef(v_signature);
    if v_definition like '%placement.position%'
       or v_definition like '%private.require_workspace_actor_v4%' then
      raise exception 'Referência histórica permaneceu em %.', v_signature
        using errcode = '55000';
    end if;
  end loop;
  if exists (
    select 1
    from pg_proc procedure_value
    where procedure_value.oid in (
      'private.valid_trail_personal_state_v1(jsonb)'::regprocedure,
      'private.merge_trail_personal_state_v1(jsonb,jsonb)'::regprocedure
    )
      and (
        procedure_value.provolatile <> 's'
        or procedure_value.proconfig is distinct from
          array['search_path=pg_catalog']::text[]
      )
  ) then
    raise exception 'Volatilidade ou search_path do estado pessoal divergente.'
      using errcode = '55000';
  end if;
end;
$assert_alphabetic_catalog_runtime$;

alter function public.get_aralearn_runtime_manifest()
  rename to get_aralearn_runtime_manifest_without_catalog_runtime_alignment_v1;

create function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_set(
    public.get_aralearn_runtime_manifest_without_catalog_runtime_alignment_v1(),
    '{schemaRevision}',
    '"20260808022000"'::jsonb
  )
$function$;

revoke all on function
  public.get_aralearn_runtime_manifest_without_catalog_runtime_alignment_v1()
  from public, anon, authenticated;
revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest()
  to anon, authenticated;

commit;
