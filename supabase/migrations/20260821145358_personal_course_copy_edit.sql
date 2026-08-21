begin;

set local lock_timeout = '15s';
set local statement_timeout = '10min';
set local search_path = pg_catalog,public,private,auth,extensions;

select pg_advisory_xact_lock(hashtextextended(
  'aralearn:personal-course-copy-edit:20260821145358',0
));

do $personal_course_copy_edit_preflight$
declare
  v_manifest jsonb;
begin
  if to_regclass('public.courses') is null
     or to_regclass('public.course_access') is null
     or to_regclass('private.course_entities') is null
     or to_regclass('private.course_instructional_plans') is null
     or to_regclass('private.course_change_receipts') is null
     or to_regclass('private.course_events') is null
     or to_regprocedure(
       'private.require_course_access_v1(uuid,uuid,boolean)'
     ) is null
     or to_regprocedure(
       'public.commit_course_composition_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,text)'
     ) is null
     or to_regprocedure('private.list_courses_for_actor_v1(uuid,text,integer,timestamptz,uuid)') is null
     or to_regprocedure('private.get_course_for_actor_v1(uuid,uuid,boolean)') is null
     or to_regprocedure('public.list_owned_courses_for_actor_v1(uuid,text,integer,timestamptz,uuid)') is null
     or to_regprocedure('public.get_aralearn_runtime_manifest()') is null then
    raise exception 'Dependências da cópia pessoal de Curso ausentes.'
      using errcode = '55000';
  end if;
  if to_regclass('private.course_personal_copies') is not null
     or to_regprocedure(
       'public.commit_personal_course_copy_edit_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,text,text)'
     ) is not null then
    raise exception 'A cópia pessoal de Curso já existe parcialmente.'
      using errcode = '55000';
  end if;
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision' <> '20260820224424'
     or (v_manifest->>'contractVersion')::integer <> 1
     or not (v_manifest->'features' ?& array[
       'single-live-course-identity-v1',
       'study-only-course-access-v1',
       'contextual-study-unit-edit-v1'
     ]) then
    raise exception 'Manifesto concorrente à cópia pessoal de Curso.'
      using errcode = '55000';
  end if;
end;
$personal_course_copy_edit_preflight$;

lock table private.course_change_receipts in share row exclusive mode;

create table private.course_personal_copies (
  target_course_id uuid primary key
    references public.courses(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  source_course_ref uuid not null,
  source_course_revision bigint not null,
  study_unit_id text not null,
  creation_hash text not null,
  initial_course_revision bigint not null,
  initial_study_unit_version bigint not null,
  application_origin text not null,
  initial_updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint course_personal_copies_actor_source_v1 unique(
    actor_id,source_course_ref
  ),
  constraint course_personal_copies_source_revision_v1 check(
    source_course_revision > 0
  ),
  constraint course_personal_copies_study_unit_v1 check(
    nullif(btrim(study_unit_id),'') is not null
    and study_unit_id = btrim(study_unit_id)
    and char_length(study_unit_id) <= 240
    and study_unit_id !~ '[[:cntrl:]]'
  ),
  constraint course_personal_copies_hash_v1 check(
    creation_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint course_personal_copies_initial_versions_v1 check(
    initial_course_revision > 1 and initial_study_unit_version > 1
  ),
  constraint course_personal_copies_origin_v1 check(
    application_origin in ('manual','provider_assistance')
  )
);

alter table private.course_personal_copies enable row level security;
alter table private.course_personal_copies force row level security;

revoke all on table private.course_personal_copies
  from public,anon,authenticated,service_role;

alter table private.course_change_receipts
  drop constraint course_change_receipts_operation_v7,
  add constraint course_change_receipts_operation_v8 check(operation in(
    'create_course','commit_course_composition','commit_instructional_plan',
    'advance_authoring_part_materialization','apply_course_design_command',
    'execute_course_source_command','grant_access','revoke_access',
    'update_audit_cycle','create_course_variants','detach_course_variant',
    'commit_personal_course_copy_edit'
  ));

create function public.commit_personal_course_copy_edit_for_actor_v1(
  p_actor_id uuid,
  p_source_course_id uuid,
  p_expected_source_revision bigint,
  p_expected_study_unit_version bigint,
  p_upsert jsonb,
  p_application_origin text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_hash text;
  v_receipt private.course_change_receipts%rowtype;
  v_mapping private.course_personal_copies%rowtype;
  v_source_course public.courses%rowtype;
  v_source_unit private.course_entities%rowtype;
  v_target_course public.courses%rowtype;
  v_target_unit private.course_entities%rowtype;
  v_ownership text;
  v_entity_count integer;
  v_inner_result jsonb;
  v_result jsonb;
begin
  perform private.require_service_role();
  if p_actor_id is null
     or p_source_course_id is null
     or p_expected_source_revision is null
     or p_expected_source_revision < 1
     or p_expected_study_unit_version is null
     or p_expected_study_unit_version < 1
     or p_application_origin not in ('manual','provider_assistance')
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or jsonb_typeof(p_upsert) is distinct from 'object'
     or p_upsert - 'entityType' - 'entityId' - 'parentType'
       - 'parentId' - 'position' - 'content' <> '{}'::jsonb
     or not (p_upsert ?& array[
       'entityType','entityId','parentType','parentId','position','content'
     ])
     or jsonb_typeof(p_upsert->'entityType') is distinct from 'string'
     or p_upsert->>'entityType' <> 'study_unit'
     or jsonb_typeof(p_upsert->'entityId') is distinct from 'string'
     or nullif(btrim(p_upsert->>'entityId'),'') is null
     or p_upsert->>'entityId' <> btrim(p_upsert->>'entityId')
     or char_length(p_upsert->>'entityId') > 240
     or p_upsert->>'entityId' ~ '[[:cntrl:]]'
     or jsonb_typeof(p_upsert->'parentType') is distinct from 'string'
     or p_upsert->>'parentType' <> 'microsequence'
     or jsonb_typeof(p_upsert->'parentId') is distinct from 'string'
     or nullif(btrim(p_upsert->>'parentId'),'') is null
     or p_upsert->>'parentId' <> btrim(p_upsert->>'parentId')
     or char_length(p_upsert->>'parentId') > 240
     or p_upsert->>'parentId' ~ '[[:cntrl:]]'
     or jsonb_typeof(p_upsert->'position') is distinct from 'number'
     or p_upsert->>'position' !~ '^[0-9]+$'
     or (p_upsert->>'position')::numeric > 2147483647
     or jsonb_typeof(p_upsert->'content') is distinct from 'object'
     or p_upsert->'content' ? 'sources' then
    raise exception 'Edição da cópia pessoal inválida.'
      using errcode = '22023';
  end if;

  v_hash := private.course_source_json_hash_v1(jsonb_build_object(
    'operation','commit_personal_course_copy_edit',
    'actorId',p_actor_id,
    'sourceCourseId',p_source_course_id,
    'expectedSourceRevision',p_expected_source_revision,
    'expectedStudyUnitVersion',p_expected_study_unit_version,
    'upsert',p_upsert,
    'applicationOrigin',p_application_origin
  ));

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'course-change-request:' || p_actor_id::text || ':' || p_request_id,0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  select * into v_receipt
  from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'commit_personal_course_copy_edit'
       or v_receipt.request_hash <> v_hash
       or v_receipt.result->>'sourceCourseId' <> p_source_course_id::text then
      raise exception 'requestId reutilizado com comando incompatível.'
        using errcode = '23514';
    end if;
    return jsonb_set(v_receipt.result,'{idempotent}','true'::jsonb,false);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'personal-course-copy:' || p_actor_id::text || ':'
      || p_source_course_id::text,0
  ));
  select * into v_mapping
  from private.course_personal_copies copy_value
  where copy_value.actor_id = p_actor_id
    and copy_value.source_course_ref = p_source_course_id
  for update;
  if found then
    if v_mapping.creation_hash <> v_hash then
      raise exception 'Já existe uma cópia pessoal para este Curso.'
        using errcode = 'P1490',
          detail = v_mapping.target_course_id::text;
    end if;
    v_result := jsonb_build_object(
      'contract','aralearn.personal-course-copy-edit.v1',
      'operation','commit_personal_course_copy_edit',
      'sourceCourseId',v_mapping.source_course_ref,
      'sourceCourseRevision',v_mapping.source_course_revision,
      'targetCourseId',v_mapping.target_course_id,
      'targetCourseRevision',v_mapping.initial_course_revision,
      'studyUnitId',v_mapping.study_unit_id,
      'studyUnitVersion',v_mapping.initial_study_unit_version,
      'applicationOrigin',v_mapping.application_origin,
      'channel','application',
      'createdCopy',true,
      'changed',true,
      'idempotent',true,
      'updatedAt',v_mapping.initial_updated_at
    );
    insert into private.course_change_receipts(
      actor_id,request_id,operation,course_id,request_hash,result
    ) values(
      p_actor_id,p_request_id,'commit_personal_course_copy_edit',
      v_mapping.target_course_id,v_hash,v_result
    );
    return v_result;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'course-access:' || p_source_course_id::text || ':' || p_actor_id::text,0
  ));
  v_ownership := private.require_course_access_v1(
    p_source_course_id,p_actor_id,false
  );
  if v_ownership <> 'shared' then
    raise exception 'O proprietário deve editar o Curso original.'
      using errcode = '42501';
  end if;
  perform 1
  from public.course_access access_value
  where access_value.course_id = p_source_course_id
    and access_value.user_id = p_actor_id
  for share;
  if not found then
    raise exception 'Curso inexistente ou inacessível.' using errcode = 'PT404';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'course-row:' || p_source_course_id::text,0
  ));
  select * into v_source_course
  from public.courses course
  where course.id = p_source_course_id
  for share;
  if not found then
    raise exception 'Curso inexistente ou inacessível.' using errcode = 'PT404';
  end if;
  if v_source_course.revision <> p_expected_source_revision then
    raise exception 'O Curso mudou; releia antes de salvar.'
      using errcode = '40001';
  end if;
  select * into v_source_unit
  from private.course_entities entity
  where entity.course_id = p_source_course_id
    and entity.entity_type = 'study_unit'
    and entity.entity_id = p_upsert->>'entityId'
  for share;
  if not found then
    raise exception 'Unidade de estudo inexistente.' using errcode = 'PT404';
  end if;
  if v_source_unit.version <> p_expected_study_unit_version
     or v_source_unit.parent_type is distinct from p_upsert->>'parentType'
     or v_source_unit.parent_id is distinct from p_upsert->>'parentId'
     or v_source_unit.position <> (p_upsert->>'position')::integer then
    raise exception 'A Unidade mudou; releia antes de salvar.'
      using errcode = '40001';
  end if;

  if v_source_unit.content = p_upsert->'content' then
    v_result := jsonb_build_object(
      'contract','aralearn.personal-course-copy-edit.v1',
      'operation','commit_personal_course_copy_edit',
      'sourceCourseId',p_source_course_id,
      'sourceCourseRevision',v_source_course.revision,
      'targetCourseId',null,
      'targetCourseRevision',null,
      'studyUnitId',v_source_unit.entity_id,
      'studyUnitVersion',v_source_unit.version,
      'applicationOrigin',p_application_origin,
      'channel','application',
      'createdCopy',false,
      'changed',false,
      'idempotent',false,
      'updatedAt',v_source_course.updated_at
    );
    insert into private.course_change_receipts(
      actor_id,request_id,operation,course_id,request_hash,result
    ) values(
      p_actor_id,p_request_id,'commit_personal_course_copy_edit',
      p_source_course_id,v_hash,v_result
    );
    return v_result;
  end if;

  insert into public.courses(
    id,owner_id,title,goal,revision
  ) values(
    extensions.gen_random_uuid(),p_actor_id,v_source_course.title,
    v_source_course.goal,1
  ) returning * into v_target_course;

  insert into private.course_instructional_plans(
    course_id,audience,instructional_scope,
    preferred_authoring_part_min,preferred_authoring_part_max,
    part_count_origin,version
  ) values(
    v_target_course.id,'','',7,12,'automatic',1
  );

  insert into private.course_entities(
    course_id,entity_type,entity_id,parent_type,parent_id,position,
    content,version,created_at,updated_at
  )
  select v_target_course.id,entity.entity_type,entity.entity_id,
    entity.parent_type,entity.parent_id,entity.position,entity.content,1,
    v_target_course.created_at,v_target_course.created_at
  from private.course_entities entity
  where entity.course_id = p_source_course_id;
  get diagnostics v_entity_count = row_count;

  insert into private.course_events(
    course_id,revision,operation,summary,actor_id
  ) values(
    v_target_course.id,1,'create_course',jsonb_build_object(
      'changeKind','personal_course_copy_initialized',
      'sourceCourseRef',p_source_course_id,
      'sourceCourseRevision',v_source_course.revision,
      'studyUnitId',v_source_unit.entity_id,
      'applicationOrigin',p_application_origin,
      'createdCount',v_entity_count,
      'updatedCount',0,
      'deletedCount',0
    ),p_actor_id
  );

  v_inner_result := public.commit_course_composition_for_actor_v1(
    p_actor_id,v_target_course.id,1,1,
    jsonb_build_array(p_upsert),'[]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'studyUnitId',v_source_unit.entity_id,'sourceLinks','[]'::jsonb
    )),
    'application',p_application_origin,p_request_id
  );
  if (v_inner_result->>'revision')::bigint <> 2
     or coalesce((v_inner_result->>'updatedCount')::integer,0) <> 1 then
    raise exception 'A edição inicial da cópia pessoal não foi materializada.'
      using errcode = '55000';
  end if;

  select * into strict v_target_course
  from public.courses course where course.id = v_target_course.id;
  select * into strict v_target_unit
  from private.course_entities entity
  where entity.course_id = v_target_course.id
    and entity.entity_type = 'study_unit'
    and entity.entity_id = v_source_unit.entity_id;
  if v_target_course.revision <> 2 or v_target_unit.version <> 2 then
    raise exception 'Versões iniciais da cópia pessoal divergiram.'
      using errcode = '55000';
  end if;

  delete from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id
    and receipt.operation = 'commit_course_composition'
    and receipt.course_id = v_target_course.id;
  if not found then
    raise exception 'Recibo interno da cópia pessoal ausente.'
      using errcode = '55000';
  end if;

  insert into private.course_personal_copies(
    target_course_id,actor_id,source_course_ref,source_course_revision,
    study_unit_id,creation_hash,initial_course_revision,
    initial_study_unit_version,application_origin,initial_updated_at
  ) values(
    v_target_course.id,p_actor_id,p_source_course_id,v_source_course.revision,
    v_target_unit.entity_id,v_hash,v_target_course.revision,
    v_target_unit.version,p_application_origin,v_target_course.updated_at
  ) returning * into v_mapping;

  v_result := jsonb_build_object(
    'contract','aralearn.personal-course-copy-edit.v1',
    'operation','commit_personal_course_copy_edit',
    'sourceCourseId',p_source_course_id,
    'sourceCourseRevision',v_source_course.revision,
    'targetCourseId',v_target_course.id,
    'targetCourseRevision',v_target_course.revision,
    'studyUnitId',v_target_unit.entity_id,
    'studyUnitVersion',v_target_unit.version,
    'applicationOrigin',p_application_origin,
    'channel','application',
    'createdCopy',true,
    'changed',true,
    'idempotent',false,
    'updatedAt',v_target_course.updated_at
  );
  insert into private.course_change_receipts(
    actor_id,request_id,operation,course_id,request_hash,result
  ) values(
    p_actor_id,p_request_id,'commit_personal_course_copy_edit',
    v_target_course.id,v_hash,v_result
  );
  return v_result;
end;
$function$;

revoke all on function public.commit_personal_course_copy_edit_for_actor_v1(
  uuid,uuid,bigint,bigint,jsonb,text,text
) from public,anon,authenticated,service_role;
grant execute on function public.commit_personal_course_copy_edit_for_actor_v1(
  uuid,uuid,bigint,bigint,jsonb,text,text
) to service_role;

create or replace function private.list_courses_for_actor_v1(
  p_actor_id uuid,
  p_query text default null,
  p_limit integer default 24,
  p_before_updated_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog,public,private
as $function$
declare
  v_items jsonb;
  v_has_more boolean;
  v_next_cursor jsonb;
begin
  if p_actor_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 50
     or ((p_before_updated_at is null) <> (p_before_id is null))
     or (p_query is not null and char_length(btrim(p_query)) > 120) then
    raise exception 'Consulta de Cursos inválida.' using errcode = '22023';
  end if;
  with accessible as materialized (
    select course.id,course.title,course.goal,course.revision,
      course.created_at,course.updated_at,
      private.course_ownership_v1(course.id,p_actor_id) as ownership,
      derived_copy.target_course_id as personal_copy_course_id,
      personal_origin.target_course_id is not null as is_personal_copy,
      personal_origin.source_course_ref,
      personal_origin.source_course_revision
    from public.courses course
    join private.course_instructional_plans plan on plan.course_id = course.id
    left join private.course_personal_copies derived_copy
      on derived_copy.actor_id = p_actor_id
     and derived_copy.source_course_ref = course.id
    left join private.course_personal_copies personal_origin
      on personal_origin.actor_id = p_actor_id
     and personal_origin.target_course_id = course.id
    where private.course_ownership_v1(course.id,p_actor_id) is not null
      and (
        nullif(btrim(p_query),'') is null
        or lower(course.title || ' ' || course.goal)
          like '%' || lower(btrim(p_query)) || '%'
      )
      and (
        p_before_updated_at is null
        or (course.updated_at,course.id) < (p_before_updated_at,p_before_id)
      )
    order by course.updated_at desc,course.id desc
    limit p_limit + 1
  ), page as materialized (
    select * from accessible order by updated_at desc,id desc limit p_limit
  ), projected as (
    select page.*,
      count(entity.course_id) filter(where entity.entity_type='module')::integer
        as module_count,
      count(entity.course_id) filter(where entity.entity_type='lesson')::integer
        as lesson_count,
      count(entity.course_id) filter(where entity.entity_type='topic')::integer
        as topic_count,
      count(entity.course_id) filter(where entity.entity_type='microsequence')::integer
        as microsequence_count,
      count(entity.course_id) filter(where entity.entity_type='study_unit')::integer
        as study_unit_count,
      coalesce((
        select count(distinct study_unit.entity_id)
        from public.course_personal_states personal_state
        cross join lateral jsonb_each(coalesce(
          personal_state.state#>'{progress,lessons}','{}'::jsonb
        )) lesson(path,value)
        cross join lateral jsonb_array_elements_text(
          lesson.value->'completedStudyUnitIds'
        ) completed(study_unit_id)
        join private.course_entities study_unit
          on study_unit.course_id=page.id
         and study_unit.entity_type='study_unit'
         and study_unit.entity_id=completed.study_unit_id
        where personal_state.course_id=page.id
          and personal_state.user_id=p_actor_id
      ),0)::integer as completed_study_unit_count
    from page
    left join private.course_entities entity on entity.course_id=page.id
    group by page.id,page.title,page.goal,page.revision,
      page.created_at,page.updated_at,page.ownership,
      page.personal_copy_course_id,page.is_personal_copy,
      page.source_course_ref,page.source_course_revision
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'courseId',projected.id,
    'title',projected.title,
    'goal',projected.goal,
    'revision',projected.revision,
    'ownership',projected.ownership,
    'canEdit',projected.ownership='owned',
    'canDerive',projected.ownership='shared'
      and projected.personal_copy_course_id is null,
    'isPersonalCopy',projected.is_personal_copy,
    'personalCopyCourseId',projected.personal_copy_course_id,
    'sourceCourseId',projected.source_course_ref,
    'sourceCourseRevision',projected.source_course_revision,
    'moduleCount',projected.module_count,
    'lessonCount',projected.lesson_count,
    'topicCount',projected.topic_count,
    'microsequenceCount',projected.microsequence_count,
    'studyUnitCount',projected.study_unit_count,
    'completedStudyUnitCount',projected.completed_study_unit_count,
    'updatedAt',projected.updated_at
  ) order by projected.updated_at desc,projected.id desc),'[]'::jsonb),
    (select count(*) from accessible) > p_limit,
    case when (select count(*) from accessible) > p_limit then (
      select jsonb_build_object(
        'beforeUpdatedAt',page.updated_at,'beforeId',page.id
      ) from page order by page.updated_at,page.id limit 1
    ) end
  into v_items,v_has_more,v_next_cursor
  from projected;
  return jsonb_build_object(
    'contract','aralearn.course-list.v1',
    'items',v_items,'hasMore',v_has_more,'nextCursor',v_next_cursor
  );
end;
$function$;

create or replace function public.list_owned_courses_for_actor_v1(
  p_actor_id uuid,
  p_query text default null,
  p_limit integer default 24,
  p_before_updated_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog,public,private
as $function$
declare
  v_items jsonb;
  v_has_more boolean;
  v_next_cursor jsonb;
begin
  if p_actor_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 50
     or ((p_before_updated_at is null) <> (p_before_id is null))
     or (p_query is not null and char_length(btrim(p_query)) > 120) then
    raise exception 'Consulta de Cursos inválida.' using errcode = '22023';
  end if;
  with owned as materialized (
    select course.*,
      personal_origin.target_course_id is not null as is_personal_copy,
      personal_origin.source_course_ref,
      personal_origin.source_course_revision
    from public.courses course
    join private.course_instructional_plans plan on plan.course_id=course.id
    left join private.course_personal_copies personal_origin
      on personal_origin.actor_id=p_actor_id
     and personal_origin.target_course_id=course.id
    where course.owner_id=p_actor_id
      and (
        nullif(btrim(p_query),'') is null
        or lower(course.title || ' ' || course.goal)
          like '%' || lower(btrim(p_query)) || '%'
      )
      and (
        p_before_updated_at is null
        or (course.updated_at,course.id) < (p_before_updated_at,p_before_id)
      )
    order by course.updated_at desc,course.id desc
    limit p_limit + 1
  ), page as materialized (
    select * from owned order by updated_at desc,id desc limit p_limit
  ), projected as (
    select page.id,page.title,page.goal,page.revision,
      page.created_at,page.updated_at,page.is_personal_copy,
      page.source_course_ref,page.source_course_revision,
      count(entity.course_id) filter(where entity.entity_type='module')::integer
        as module_count,
      count(entity.course_id) filter(where entity.entity_type='lesson')::integer
        as lesson_count,
      count(entity.course_id) filter(where entity.entity_type='topic')::integer
        as topic_count,
      count(entity.course_id) filter(where entity.entity_type='microsequence')::integer
        as microsequence_count,
      count(entity.course_id) filter(where entity.entity_type='study_unit')::integer
        as study_unit_count
    from page
    left join private.course_entities entity on entity.course_id=page.id
    group by page.id,page.title,page.goal,page.revision,
      page.created_at,page.updated_at,page.is_personal_copy,
      page.source_course_ref,page.source_course_revision
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'courseId',projected.id,
    'title',projected.title,
    'goal',projected.goal,
    'revision',projected.revision,
    'ownership','owned',
    'canEdit',true,
    'canDerive',false,
    'isPersonalCopy',projected.is_personal_copy,
    'personalCopyCourseId',null,
    'sourceCourseId',projected.source_course_ref,
    'sourceCourseRevision',projected.source_course_revision,
    'moduleCount',projected.module_count,
    'lessonCount',projected.lesson_count,
    'topicCount',projected.topic_count,
    'microsequenceCount',projected.microsequence_count,
    'studyUnitCount',projected.study_unit_count,
    'updatedAt',projected.updated_at
  ) order by projected.updated_at desc,projected.id desc),'[]'::jsonb),
    (select count(*) from owned) > p_limit,
    case when (select count(*) from owned) > p_limit then (
      select jsonb_build_object(
        'beforeUpdatedAt',page.updated_at,'beforeId',page.id
      ) from page order by page.updated_at,page.id limit 1
    ) end
  into v_items,v_has_more,v_next_cursor from projected;
  return jsonb_build_object(
    'contract','aralearn.course-list.v1',
    'items',v_items,'hasMore',v_has_more,'nextCursor',v_next_cursor
  );
end;
$function$;

create or replace function private.get_course_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_include_outline boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog,public,private
as $function$
declare
  v_course public.courses%rowtype;
  v_ownership text;
  v_module_count integer;
  v_lesson_count integer;
  v_topic_count integer;
  v_microsequence_count integer;
  v_study_unit_count integer;
  v_modules jsonb;
  v_result jsonb;
  v_personal_copy_course_id uuid;
  v_source_course_id uuid;
  v_source_course_revision bigint;
begin
  if p_include_outline is null then
    raise exception 'Visualização do Curso inválida.' using errcode='22023';
  end if;
  v_ownership := private.require_course_access_v1(
    p_course_id,p_actor_id,false
  );
  select * into strict v_course
  from public.courses course where course.id=p_course_id;
  select copy_value.target_course_id into v_personal_copy_course_id
  from private.course_personal_copies copy_value
  where copy_value.actor_id=p_actor_id
    and copy_value.source_course_ref=p_course_id;
  select copy_value.source_course_ref,copy_value.source_course_revision
  into v_source_course_id,v_source_course_revision
  from private.course_personal_copies copy_value
  where copy_value.actor_id=p_actor_id
    and copy_value.target_course_id=p_course_id;
  select
    count(*) filter(where entity_type='module')::integer,
    count(*) filter(where entity_type='lesson')::integer,
    count(*) filter(where entity_type='topic')::integer,
    count(*) filter(where entity_type='microsequence')::integer,
    count(*) filter(where entity_type='study_unit')::integer
  into v_module_count,v_lesson_count,v_topic_count,
    v_microsequence_count,v_study_unit_count
  from private.course_entities entity where entity.course_id=p_course_id;
  if p_include_outline then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',module_value.entity_id,
      'title',coalesce(
        nullif(module_value.content->>'title',''),module_value.entity_id
      ),
      'lessons',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',lesson.entity_id,
          'title',coalesce(
            nullif(lesson.content->>'title',''),lesson.entity_id
          ),
          'topics',coalesce((
            select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
              'id',topic.entity_id,
              'title',coalesce(
                nullif(topic.content->>'title',''),topic.entity_id
              ),
              'summary',nullif(topic.content->>'summary','')
            )) order by topic.position,topic.entity_id)
            from private.course_entities topic
            where topic.course_id=p_course_id
              and topic.entity_type='topic'
              and topic.parent_type='lesson'
              and topic.parent_id=lesson.entity_id
          ),'[]'::jsonb),
          'microsequences',coalesce((
            select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
              'id',microsequence.entity_id,
              'title',coalesce(
                nullif(microsequence.content->>'title',''),
                microsequence.entity_id
              ),
              'goal',nullif(microsequence.content->>'goal',''),
              'role',nullif(microsequence.content->>'role',''),
              'studyUnitCount',(
                select count(*)::integer
                from private.course_entities study_unit
                where study_unit.course_id=p_course_id
                  and study_unit.entity_type='study_unit'
                  and study_unit.parent_type='microsequence'
                  and study_unit.parent_id=microsequence.entity_id
              )
            )) order by microsequence.position,microsequence.entity_id)
            from private.course_entities microsequence
            where microsequence.course_id=p_course_id
              and microsequence.entity_type='microsequence'
              and microsequence.parent_type='lesson'
              and microsequence.parent_id=lesson.entity_id
          ),'[]'::jsonb)
        ) order by lesson.position,lesson.entity_id)
        from private.course_entities lesson
        where lesson.course_id=p_course_id
          and lesson.entity_type='lesson'
          and lesson.parent_type='module'
          and lesson.parent_id=module_value.entity_id
      ),'[]'::jsonb)
    ) order by module_value.position,module_value.entity_id),'[]'::jsonb)
    into v_modules
    from private.course_entities module_value
    where module_value.course_id=p_course_id
      and module_value.entity_type='module'
      and module_value.parent_type is null
      and module_value.parent_id is null;
  end if;
  v_result := jsonb_build_object(
    'contract','aralearn.course.v1',
    'courseId',v_course.id,
    'title',v_course.title,
    'goal',v_course.goal,
    'revision',v_course.revision,
    'ownership',v_ownership,
    'canEdit',v_ownership='owned',
    'canDerive',v_ownership='shared'
      and v_personal_copy_course_id is null,
    'isPersonalCopy',v_source_course_id is not null,
    'personalCopyCourseId',v_personal_copy_course_id,
    'sourceCourseId',v_source_course_id,
    'sourceCourseRevision',v_source_course_revision,
    'counts',jsonb_build_object(
      'moduleCount',v_module_count,
      'lessonCount',v_lesson_count,
      'topicCount',v_topic_count,
      'microsequenceCount',v_microsequence_count,
      'studyUnitCount',v_study_unit_count
    ),
    'createdAt',v_course.created_at,
    'updatedAt',v_course.updated_at
  );
  if p_include_outline then
    v_result := v_result || jsonb_build_object(
      'outline',jsonb_build_object(
        'courseId',v_course.id,
        'title',v_course.title,
        'goal',v_course.goal,
        'modules',v_modules
      )
    );
  end if;
  return v_result;
end;
$function$;

revoke all on function private.list_courses_for_actor_v1(
  uuid,text,integer,timestamptz,uuid
) from public,anon,authenticated,service_role;
revoke all on function private.get_course_for_actor_v1(
  uuid,uuid,boolean
) from public,anon,authenticated,service_role;

do $personal_course_copy_edit_postflight$
declare
  v_definition text;
begin
  if not exists(
    select 1 from pg_class relation_value
    join pg_namespace namespace_value
      on namespace_value.oid=relation_value.relnamespace
    where namespace_value.nspname='private'
      and relation_value.relname='course_personal_copies'
      and relation_value.relrowsecurity
      and relation_value.relforcerowsecurity
  ) or exists(
    select 1 from information_schema.role_table_grants grant_value
    where grant_value.table_schema='private'
      and grant_value.table_name='course_personal_copies'
      and grant_value.grantee in ('anon','authenticated','service_role','PUBLIC')
  ) or exists(
    select 1 from pg_constraint constraint_value
    join pg_attribute attribute_value
      on attribute_value.attrelid=constraint_value.conrelid
     and attribute_value.attnum=any(constraint_value.conkey)
    where constraint_value.conrelid='private.course_personal_copies'::regclass
      and constraint_value.contype='f'
      and attribute_value.attname='source_course_ref'
  ) then
    raise exception 'A relação de cópia pessoal não ficou isolada.'
      using errcode='55000';
  end if;
  select pg_get_functiondef(
    'public.commit_personal_course_copy_edit_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,text,text)'::regprocedure
  ) into v_definition;
  if v_definition is null
     or strpos(v_definition,'private.require_service_role()')=0
     or strpos(v_definition,'''P1490''')=0
     or strpos(v_definition,'''sourceLinks''')=0
     or strpos(v_definition,'''[]''::jsonb')=0
     or has_function_privilege(
       'authenticated',
       'public.commit_personal_course_copy_edit_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,text,text)',
       'execute'
     )
     or not has_function_privilege(
       'service_role',
       'public.commit_personal_course_copy_edit_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,text,text)',
       'execute'
     ) then
    raise exception 'A fronteira da cópia pessoal não ficou cercada pela API.'
      using errcode='55000';
  end if;
  select pg_get_functiondef(
    'private.list_courses_for_actor_v1(uuid,text,integer,timestamptz,uuid)'::regprocedure
  ) into v_definition;
  if strpos(v_definition,'''canDerive''')=0
     or strpos(v_definition,'''personalCopyCourseId''')=0 then
    raise exception 'A lista de Cursos não projeta a cópia pessoal.'
      using errcode='55000';
  end if;
  select pg_get_functiondef(
    'private.get_course_for_actor_v1(uuid,uuid,boolean)'::regprocedure
  ) into v_definition;
  if strpos(v_definition,'''isPersonalCopy''')=0
     or strpos(v_definition,'''sourceCourseRevision''')=0 then
    raise exception 'A leitura do Curso não projeta sua origem pessoal.'
      using errcode='55000';
  end if;
end;
$personal_course_copy_edit_postflight$;

do $advance_personal_course_copy_edit_manifest$
declare
  v_manifest jsonb;
  v_body text;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision'<>'20260820224424'
     or (v_manifest->>'contractVersion')::integer<>1
     or not (v_manifest->'features' ? 'contextual-study-unit-edit-v1') then
    raise exception 'Manifesto concorrente à cópia pessoal de Curso.'
      using errcode='55000';
  end if;
  v_manifest := jsonb_set(
    jsonb_set(v_manifest,'{schemaRevision}',to_jsonb('20260821145358'::text)),
    '{features}',
    (v_manifest->'features') || to_jsonb('personal-course-copy-edit-v1'::text)
  );
  v_body := 'select ' || quote_literal(v_manifest::text) || '::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      || 'returns jsonb language sql stable security definer '
      || 'set search_path = pg_catalog as %L',
    v_body
  );
  revoke all on function public.get_aralearn_runtime_manifest()
    from public,anon,authenticated,service_role;
  grant execute on function public.get_aralearn_runtime_manifest()
    to anon,authenticated,service_role;
end;
$advance_personal_course_copy_edit_manifest$;

do $personal_course_copy_manifest_postflight$
declare
  v_manifest jsonb;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision'<>'20260821145358'
     or (v_manifest->>'contractVersion')::integer<>1
     or not (v_manifest->'features' ? 'personal-course-copy-edit-v1') then
    raise exception 'Manifesto da cópia pessoal não foi consolidado.'
      using errcode='55000';
  end if;
end;
$personal_course_copy_manifest_postflight$;

commit;
