begin;

-- Hosted PostgREST applies the authenticator role's short statement timeout to
-- service_role RPCs unless the function opts into a bounded exemption. Catalog
-- publication is an administrative, atomic import and can legitimately exceed
-- that default on Nano compute. Official rows never belong in a user's sync
-- feed, so suppressing their change capture also avoids tens of thousands of
-- inaccessible feed entries during the initial publication.
create or replace function public.import_official_course(
  p_envelope jsonb,
  p_publish boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
set statement_timeout = '60s'
as $$
declare
  v_course jsonb := coalesce(p_envelope -> 'course', p_envelope -> 'courses' -> 0);
  v_course_id uuid := coalesce(nullif(v_course ->> 'id', '')::uuid, gen_random_uuid());
  v_store_name text;
  v_store_names text[] := array[
    'modules','lessons','guides','guideItems','topics','topicStatements',
    'microsequences','dependencies','microsequenceStatements','cards','blocks','options',
    'nodes','flowNodes','flowCases','flowPractices','flowPracticeEntries',
    'flowPracticeOptions','flowPracticeVariants','flowShapeOptions','edges','matrixItems',
    'cells','points','lines','highlights','cardSources','cardTopics'
  ];
  v_row jsonb;
  v_result jsonb;
  v_validation jsonb;
begin
  if not public.is_app_admin() then
    raise exception 'Importação oficial exige administrador.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_envelope) <> 'object' or jsonb_typeof(v_course) <> 'object' then
    raise exception 'Envelope relacional inválido.' using errcode = '22023';
  end if;

  perform private.lock_course_write(v_course_id);
  perform set_config('aralearn.suppress_sync_changes', 'on', true);
  perform set_config('aralearn.suppress_course_dirty', 'on', true);

  insert into public.courses (
    id, owner_id, kind, status, contract_key, title, goal, contract_scope,
    identity_key, project_id, position
  )
  values (
    v_course_id, null, 'official', 'draft', v_course ->> 'contractKey',
    v_course ->> 'title', v_course ->> 'goal', v_course ->> 'contractScope',
    v_course ->> 'identityKey',
    private.try_uuid(v_course ->> 'projectId'), coalesce((v_course ->> 'position')::integer, 0)
  );

  foreach v_store_name in array v_store_names loop
    if jsonb_typeof(p_envelope -> v_store_name) = 'array' then
      for v_row in select value from jsonb_array_elements(p_envelope -> v_store_name) loop
        v_result := private.apply_one_sync_mutation(
          auth.uid(), v_store_name, nullif(v_row ->> 'id', '')::uuid,
          v_course_id, 'insert', 0, '[]', v_row
        );
        if v_result ->> 'status' <> 'applied' then
          raise exception 'Falha ao importar %/%: %', v_store_name, v_row ->> 'id', v_result
            using errcode = '23514';
        end if;
      end loop;
    end if;
  end loop;

  v_validation := public.validate_course_graph(v_course_id);
  if p_publish then
    perform public.publish_official_course(v_course_id);
  end if;

  perform set_config('aralearn.suppress_course_dirty', 'off', true);
  perform set_config('aralearn.suppress_sync_changes', 'off', true);
  return jsonb_build_object(
    'courseId', v_course_id, 'validation', v_validation,
    'published', p_publish, 'contentHash', private.course_content_hash(v_course_id)
  );
end;
$$;

commit;
