-- Reorganiza apenas grupos de produção; currículo, entidades e decisões aplicadas permanecem intactos.
begin;

create or replace function public.save_course_authoring_part_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_course_revision bigint,
  p_expected_plan_version bigint,
  p_part jsonb,
  p_request_id text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,extensions
as $function$
declare
  v_receipt private.course_change_receipts%rowtype;
  v_course public.courses%rowtype;
  v_plan private.course_instructional_plans%rowtype;
  v_existing private.course_authoring_parts%rowtype;
  v_part_id uuid;
  v_part_existed boolean:=false;
  v_before jsonb;
  v_changed boolean:=false;
  v_result jsonb;
  v_donor_ids uuid[];
  v_target_position integer;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_actor_id is null or p_course_id is null
     or p_expected_course_revision is null or p_expected_course_revision<1
     or p_expected_plan_version is null or p_expected_plan_version<1
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_part)<>'object'
     or p_part ?& array[
       'partId','position','title','intent','progression','microsequences'
     ] is not true
     or p_part-'partId'-'position'-'title'-'intent'-'progression'-'microsequences'
       <>'{}'::jsonb
     or p_part->'partId'<>'null'::jsonb and (
       jsonb_typeof(p_part->'partId')<>'string'
       or (p_part->>'partId') !~
         '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     )
     or jsonb_typeof(p_part->'position')<>'number'
     or (p_part->>'position') !~ '^(0|[1-9][0-9]?)$'
     or (p_part->>'position')::integer not between 0 and 63
     or jsonb_typeof(p_part->'title')<>'string'
     or nullif(btrim(p_part->>'title'),'') is null
     or char_length(p_part->>'title')>300
     or translate(p_part->>'title',E'\n\r\t','') ~ '[[:cntrl:]]'
     or jsonb_typeof(p_part->'intent')<>'string'
     or nullif(btrim(p_part->>'intent'),'') is null
     or char_length(p_part->>'intent')>4000
     or translate(p_part->>'intent',E'\n\r\t','') ~ '[[:cntrl:]]'
     or not private.valid_course_authoring_progression_v1(p_part->'progression')
     or jsonb_typeof(p_part->'microsequences')<>'array'
     or jsonb_array_length(p_part->'microsequences') not between 1 and 64
     or octet_length(p_part::text)>524288
     or exists(
       select 1
       from jsonb_array_elements(p_part->'microsequences')
         with ordinality microsequence(value,ordinal)
       where jsonb_typeof(microsequence.value)<>'object'
         or microsequence.value ?& array['microsequenceId','position'] is not true
         or microsequence.value-'microsequenceId'-'position'<>'{}'::jsonb
         or jsonb_typeof(microsequence.value->'microsequenceId')<>'string'
         or nullif(btrim(microsequence.value->>'microsequenceId'),'') is null
         or microsequence.value->>'microsequenceId'
           <>btrim(microsequence.value->>'microsequenceId')
         or char_length(microsequence.value->>'microsequenceId')>240
         or jsonb_typeof(microsequence.value->'position')<>'number'
         or microsequence.value->>'position'<>((microsequence.ordinal-1)::text)
     )
     or (
       select count(*)<>count(distinct microsequence.value->>'microsequenceId')
       from jsonb_array_elements(p_part->'microsequences') microsequence(value)
     ) then
    raise exception 'Lote de producao invalido.' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:'||p_actor_id::text||':'||p_request_id,0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id=p_actor_id and receipt.request_id=p_request_id
    and receipt.expires_at<=statement_timestamp();
  select * into v_receipt from private.course_change_receipts receipt
  where receipt.actor_id=p_actor_id and receipt.request_id=p_request_id;
  if found then
    if v_receipt.operation<>'save_course_authoring_part_v1'
       or v_receipt.course_id<>p_course_id
       or v_receipt.request_hash<>p_request_hash then
      raise exception 'requestId reutilizado com lote incompatível.'
        using errcode='23514';
    end if;
    return (v_receipt.result-'idempotent')||jsonb_build_object('idempotent',true);
  end if;

  perform 1 from auth.users actor where actor.id=p_actor_id for key share;
  if not found then
    raise exception 'Pessoa inexistente ou inacessivel.' using errcode='PT404';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('course-row:'||p_course_id::text,0));
  select * into strict v_course from public.courses course
  where course.id=p_course_id for update;
  if v_course.revision<>p_expected_course_revision then
    raise exception 'O curso mudou; releia antes de salvar o lote.'
      using errcode='40001';
  end if;
  select * into strict v_plan from private.course_instructional_plans plan
  where plan.course_id=p_course_id for update;
  if v_plan.version<>p_expected_plan_version then
    raise exception 'O planejamento mudou; releia antes de salvar o lote.'
      using errcode='40001';
  end if;
  if v_plan.curriculum_map_status<>'approved' then
    raise exception 'A producao so pode ser organizada depois da aprovacao do mapa curricular.'
      using errcode='23514';
  end if;

  v_part_id:=case when p_part->'partId'='null'::jsonb
    then extensions.gen_random_uuid() else (p_part->>'partId')::uuid end;
  select * into v_existing from private.course_authoring_parts part
  where part.id=v_part_id for update;
  v_part_existed:=found;
  if found and (v_existing.course_id<>p_course_id
      or v_existing.instructional_plan_id<>v_plan.id) then
    raise exception 'O lote pertence a outro planejamento.' using errcode='23514';
  end if;
  if exists(
    select 1 from jsonb_array_elements(p_part->'microsequences') microsequence(value)
    left join private.course_entities entity
      on entity.course_id=p_course_id and entity.entity_type='microsequence'
     and entity.entity_id=microsequence.value->>'microsequenceId'
    where entity.course_id is null
  ) then
    raise exception 'O lote referencia Microssequencia fora do mapa aprovado.'
      using errcode='23514';
  end if;
  if v_part_existed then
    select jsonb_build_object(
      'partId',v_existing.id,'position',v_existing.position,
      'title',v_existing.title,'intent',v_existing.intent,
      'progression',v_existing.progression,
      'microsequences',coalesce((
        select jsonb_agg(jsonb_build_object(
          'microsequenceId',membership.didactic_microsequence_id,
          'position',membership.production_position
        ) order by membership.production_position,membership.didactic_microsequence_id)
        from private.course_authoring_part_didactic_microsequences membership
        where membership.course_id=p_course_id
          and membership.authoring_part_id=v_part_id
      ),'[]'::jsonb)
    ) into v_before;
  end if;
  v_changed:=not v_part_existed or v_before is distinct from p_part;

  if v_changed then
    -- O lote organiza a producao, nao o curriculo. Ao reagrupar, transfira
    -- atomicamente os pontos escolhidos e preserve uma unica associacao.
    select coalesce(array_agg(distinct membership.authoring_part_id),'{}'::uuid[])
    into v_donor_ids
    from private.course_authoring_part_didactic_microsequences membership
    join jsonb_array_elements(p_part->'microsequences') microsequence(value)
      on microsequence.value->>'microsequenceId'=membership.didactic_microsequence_id
    where membership.course_id=p_course_id and membership.authoring_part_id<>v_part_id;
    update private.course_authoring_parts part
    set version=part.version+1,updated_at=now()
    where part.course_id=p_course_id and part.id<>v_part_id
      and exists(
        select 1
        from private.course_authoring_part_didactic_microsequences membership
        join jsonb_array_elements(p_part->'microsequences') microsequence(value)
          on microsequence.value->>'microsequenceId'
            =membership.didactic_microsequence_id
        where membership.course_id=part.course_id
          and membership.authoring_part_id=part.id
      );
    delete from private.course_authoring_part_didactic_microsequences membership
    using jsonb_array_elements(p_part->'microsequences') microsequence(value)
    where membership.course_id=p_course_id
      and membership.authoring_part_id<>v_part_id
      and membership.didactic_microsequence_id
        =microsequence.value->>'microsequenceId';
    insert into private.course_authoring_parts(
      id,course_id,instructional_plan_id,position,title,intent,progression
    ) values(
      v_part_id,p_course_id,v_plan.id,(p_part->>'position')::integer,
      p_part->>'title',p_part->>'intent',p_part->'progression'
    ) on conflict(id) do update set
      position=excluded.position,title=excluded.title,intent=excluded.intent,
      progression=excluded.progression,version=course_authoring_parts.version+1,
      updated_at=now();
    delete from private.course_authoring_part_didactic_microsequences membership
    where membership.course_id=p_course_id and membership.authoring_part_id=v_part_id;
    insert into private.course_authoring_part_didactic_microsequences(
      course_id,authoring_part_id,didactic_microsequence_id,production_position
    )
    select p_course_id,v_part_id,microsequence.value->>'microsequenceId',
      (microsequence.value->>'position')::integer
    from jsonb_array_elements(p_part->'microsequences') microsequence(value);
    delete from private.course_authoring_parts part
    where part.course_id=p_course_id and part.id=any(v_donor_ids)
      and not exists(
        select 1
        from private.course_authoring_part_didactic_microsequences membership
        where membership.course_id=part.course_id
          and membership.authoring_part_id=part.id
      );
    -- Remover membros de um grupo não deixa lacunas na ordem de produção.
    with ordered as materialized(
      select membership.course_id,membership.authoring_part_id,
        membership.didactic_microsequence_id,
        row_number() over(partition by membership.authoring_part_id
          order by membership.production_position,membership.didactic_microsequence_id)::integer-1 as next_position
      from private.course_authoring_part_didactic_microsequences membership
      where membership.course_id=p_course_id and membership.authoring_part_id=any(v_donor_ids)
    )
    update private.course_authoring_part_didactic_microsequences membership
    set production_position=ordered.next_position
    from ordered
    where membership.course_id=ordered.course_id
      and membership.authoring_part_id=ordered.authoring_part_id
      and membership.didactic_microsequence_id=ordered.didactic_microsequence_id
      and membership.production_position<>ordered.next_position;
    if (select count(*) from private.course_authoring_parts where course_id=p_course_id)>64 then
      raise exception 'O planejamento admite ate 64 lotes; reuna lotes antes de dividir.' using errcode='23514';
    end if;
    select least((p_part->>'position')::integer,count(*)::integer) into v_target_position
    from private.course_authoring_parts where course_id=p_course_id and id<>v_part_id;
    -- A posição pedida é inserção na lista restante, nunca desempate por UUID.
    with remaining as materialized(
      select part.id,row_number() over(order by part.position,part.id)::integer-1 as ordinal
      from private.course_authoring_parts part
      where part.course_id=p_course_id and part.id<>v_part_id
    ), ordered as materialized(
      select id,ordinal+case when ordinal>=v_target_position then 1 else 0 end as next_position from remaining
      union all select v_part_id,v_target_position
    )
    update private.course_authoring_parts part
    set position=ordered.next_position,version=part.version+1,updated_at=now()
    from ordered
    where part.id=ordered.id and part.position<>ordered.next_position;
    update private.course_instructional_plans plan
    set version=version+1,updated_at=now()
    where plan.id=v_plan.id returning * into v_plan;
    update public.courses course
    set revision=revision+1,updated_at=now()
    where course.id=p_course_id returning * into v_course;
  end if;

  v_result:=jsonb_build_object(
    'contract','aralearn.course-authoring-part-change.v1',
    'courseId',p_course_id,'courseRevision',v_course.revision,
    'planVersion',v_plan.version,'authoringPartId',v_part_id,
    'changed',v_changed,'idempotent',false
  );
  insert into private.course_change_receipts(
    actor_id,request_id,operation,course_id,request_hash,result
  ) values(
    p_actor_id,p_request_id,'save_course_authoring_part_v1',
    p_course_id,p_request_hash,v_result
  );
  return v_result;
end;
$function$;

revoke all on function public.save_course_authoring_part_for_actor_v1(
  uuid,uuid,bigint,bigint,jsonb,text,text
) from public,anon,authenticated,service_role;
grant execute on function public.save_course_authoring_part_for_actor_v1(
  uuid,uuid,bigint,bigint,jsonb,text,text
) to service_role;


-- #304: new optional entry on the existing inspection reader, with no parallel curriculum reader.
-- Incorporate into the pending migration; this file does not apply itself.
-- Defaults preserve old ten-argument callers; remove obsolete overloads to keep RPC dispatch unambiguous.
drop function if exists public.list_owned_course_study_units_for_actor_v2(uuid,uuid,bigint,text,text,text,text,text,integer,integer);
drop function if exists private.list_course_study_units_for_actor_continuous_v2(uuid,uuid,bigint,text,text,text,text,text,integer,integer);
drop function if exists private.list_course_study_units_for_actor_v1(uuid,uuid,bigint,text,text,text,text,text,integer,integer);

CREATE OR REPLACE FUNCTION private.list_course_study_units_for_actor_v1(p_actor_id uuid, p_course_id uuid, p_expected_revision bigint, p_scope_kind text DEFAULT 'course'::text, p_scope_id text DEFAULT NULL::text, p_anchor_study_unit_id text DEFAULT NULL::text, p_cursor_study_unit_id text DEFAULT NULL::text, p_direction text DEFAULT 'forward'::text, p_limit integer DEFAULT 12, p_max_bytes integer DEFAULT 524288, p_entry text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_course_revision bigint;
  v_scope_part_id uuid;
  v_pivot_study_unit_id text;
  v_pivot_ordinal bigint;
  v_total_count integer;
  v_items jsonb := '[]'::jsonb;
  v_scope_options jsonb;
  v_first_ordinal bigint;
  v_last_ordinal bigint;
  v_first_study_unit_id text;
  v_last_study_unit_id text;
  v_has_previous boolean := false;
  v_has_more boolean := false;
  v_previous_cursor jsonb;
  v_next_cursor jsonb;
  v_page_bytes integer;
  v_result jsonb;
begin
  perform private.require_course_access_v1(p_course_id, p_actor_id, true);
  if p_expected_revision is null or p_expected_revision < 1
     or p_scope_kind is null
     or p_scope_kind not in (
       'course', 'authoring_part', 'unassigned', 'module', 'lesson',
       'didactic_microsequence'
     )
     or (p_entry is not null and (
       p_entry <> 'latest_updated' or p_anchor_study_unit_id is not null
       or p_cursor_study_unit_id is not null or p_direction is distinct from 'forward'
     ))
     or p_direction is null or p_direction not in ('forward', 'backward')
     or p_limit is null or p_limit not between 1 and 24
     or p_max_bytes is null or p_max_bytes not between 65536 and 1500000
     or (p_anchor_study_unit_id is not null and p_cursor_study_unit_id is not null)
     or (
       p_scope_kind in ('course', 'unassigned')
       and p_scope_id is not null
     )
     or (
       p_scope_kind not in ('course', 'unassigned')
       and (
         nullif(btrim(p_scope_id), '') is null
         or p_scope_id <> btrim(p_scope_id)
         or char_length(p_scope_id) > 240
         or p_scope_id ~ '[[:cntrl:]]'
       )
     )
     or (
       p_anchor_study_unit_id is not null
       and (
         nullif(btrim(p_anchor_study_unit_id), '') is null
         or p_anchor_study_unit_id <> btrim(p_anchor_study_unit_id)
         or char_length(p_anchor_study_unit_id) > 240
         or p_anchor_study_unit_id ~ '[[:cntrl:]]'
       )
     )
     or (
       p_cursor_study_unit_id is not null
       and (
         nullif(btrim(p_cursor_study_unit_id), '') is null
         or p_cursor_study_unit_id <> btrim(p_cursor_study_unit_id)
         or char_length(p_cursor_study_unit_id) > 240
         or p_cursor_study_unit_id ~ '[[:cntrl:]]'
       )
     ) then
    raise exception 'Consulta de Unidades de estudo inválida.'
      using errcode = '22023';
  end if;
  if p_scope_kind = 'authoring_part' then
    if p_scope_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'Identidade da Parte de autoria inválida.'
        using errcode = '22023';
    end if;
    v_scope_part_id := p_scope_id::uuid;
  end if;

  select course.revision into strict v_course_revision
  from public.courses course where course.id = p_course_id;
  if v_course_revision is distinct from p_expected_revision then
    raise exception 'O Curso mudou; releia antes de continuar.'
      using errcode = '40001';
  end if;

  if p_scope_kind = 'authoring_part' and not exists(
    select 1 from private.course_authoring_parts part
    where part.course_id = p_course_id
      and part.id = v_scope_part_id

  ) then
    raise exception 'Parte de autoria inexistente no Curso.' using errcode = 'PT404';
  elsif p_scope_kind in ('module', 'lesson', 'didactic_microsequence')
      and not exists(
        select 1 from private.course_entities entity
        where entity.course_id = p_course_id
          and entity.entity_type = case p_scope_kind
            when 'module' then 'module'
            when 'lesson' then 'lesson'
            else 'microsequence'
          end
          and entity.entity_id = p_scope_id
      ) then
    raise exception 'Escopo curricular inexistente no Curso.' using errcode = 'PT404';
  end if;

  v_pivot_study_unit_id := coalesce(
    p_anchor_study_unit_id, p_cursor_study_unit_id
  );

  with ordered as materialized (
    select study_unit.entity_id, study_unit.updated_at,
      row_number() over(order by
        module_value.position, module_value.entity_id,
        lesson.position, lesson.entity_id,
        microsequence.position, microsequence.entity_id,
        study_unit.position, study_unit.entity_id
      ) as ordinal
    from private.course_entities module_value
    join private.course_entities lesson
      on lesson.course_id = module_value.course_id
     and lesson.entity_type = 'lesson'
     and lesson.parent_type = 'module'
     and lesson.parent_id = module_value.entity_id
    join private.course_entities microsequence
      on microsequence.course_id = lesson.course_id
     and microsequence.entity_type = 'microsequence'
     and microsequence.parent_type = 'lesson'
     and microsequence.parent_id = lesson.entity_id
    join private.course_entities study_unit
      on study_unit.course_id = microsequence.course_id
     and study_unit.entity_type = 'study_unit'
     and study_unit.parent_type = 'microsequence'
     and study_unit.parent_id = microsequence.entity_id
    left join private.course_authoring_part_didactic_microsequences membership
      on membership.course_id = microsequence.course_id
     and membership.didactic_microsequence_id = microsequence.entity_id
    left join private.course_authoring_parts part
      on part.course_id = membership.course_id
     and part.id = membership.authoring_part_id

    where module_value.course_id = p_course_id
      and module_value.entity_type = 'module'
      and module_value.parent_type is null
      and module_value.parent_id is null
      and case p_scope_kind
        when 'course' then true
        when 'authoring_part' then part.id = v_scope_part_id
        when 'unassigned' then part.id is null
        when 'module' then module_value.entity_id = p_scope_id
        when 'lesson' then lesson.entity_id = p_scope_id
        when 'didactic_microsequence' then microsequence.entity_id = p_scope_id
        else false
      end
  )
  select count(*)::integer,
    case when p_entry = 'latest_updated' then (
      select latest.ordinal from ordered latest
      order by latest.updated_at desc nulls last, latest.ordinal
      limit 1
    ) else max(ordered.ordinal) filter(
      where ordered.entity_id = v_pivot_study_unit_id
    ) end
  into v_total_count, v_pivot_ordinal
  from ordered;

  if v_pivot_study_unit_id is not null and v_pivot_ordinal is null then
    if p_anchor_study_unit_id is not null then
      raise exception 'Unidade âncora inexistente no escopo.'
        using errcode = 'PT404';
    end if;
    raise exception 'Cursor de Unidade não pertence ao escopo.'
      using errcode = '22023';
  end if;

  select jsonb_build_object(
    'authoringParts', coalesce(jsonb_agg(jsonb_build_object(
      'id', part.id,
      'position', part.position,
      'title', part.title,
      'state', private.course_authoring_part_progress_v1(
        part.course_id, part.id
      )->>'state'
    ) order by part.position, part.id), '[]'::jsonb),
    'unassignedStudyUnitCount', (
      select count(*)::integer
      from private.course_entities study_unit
      join private.course_entities microsequence
        on microsequence.course_id = study_unit.course_id
       and microsequence.entity_type = 'microsequence'
       and microsequence.entity_id = study_unit.parent_id
      where study_unit.course_id = p_course_id
        and study_unit.entity_type = 'study_unit'
        and not exists(
          select 1
          from private.course_authoring_part_didactic_microsequences membership
          where membership.course_id = microsequence.course_id
            and membership.didactic_microsequence_id = microsequence.entity_id
        )
    )
  ) into v_scope_options
  from private.course_authoring_parts part
  where part.course_id = p_course_id ;

  with part_rows as materialized (
    select part.id, part.position, part.title,
      private.course_authoring_part_progress_v1(
        part.course_id, part.id
      )->>'state' as state
    from private.course_authoring_parts part
    where part.course_id = p_course_id
  ), ordered as materialized (
    select study_unit.entity_id,
      study_unit.position as study_unit_position,
      study_unit.content as study_unit_content,
      study_unit.version as study_unit_version,
      study_unit.updated_at as study_unit_updated_at,
      module_value.entity_id as module_id,
      module_value.position as module_position,
      module_value.content->>'title' as module_title,
      lesson.entity_id as lesson_id,
      lesson.position as lesson_position,
      lesson.content->>'title' as lesson_title,
      microsequence.entity_id as microsequence_id,
      microsequence.position as microsequence_position,
      microsequence.content->>'title' as microsequence_title,
      part.id as authoring_part_id,
      part.position as authoring_part_position,
      part.title as authoring_part_title,
      part.state as authoring_part_state,
      row_number() over(order by
        module_value.position, module_value.entity_id,
        lesson.position, lesson.entity_id,
        microsequence.position, microsequence.entity_id,
        study_unit.position, study_unit.entity_id
      ) as ordinal
    from private.course_entities module_value
    join private.course_entities lesson
      on lesson.course_id = module_value.course_id
     and lesson.entity_type = 'lesson'
     and lesson.parent_type = 'module'
     and lesson.parent_id = module_value.entity_id
    join private.course_entities microsequence
      on microsequence.course_id = lesson.course_id
     and microsequence.entity_type = 'microsequence'
     and microsequence.parent_type = 'lesson'
     and microsequence.parent_id = lesson.entity_id
    join private.course_entities study_unit
      on study_unit.course_id = microsequence.course_id
     and study_unit.entity_type = 'study_unit'
     and study_unit.parent_type = 'microsequence'
     and study_unit.parent_id = microsequence.entity_id
    left join private.course_authoring_part_didactic_microsequences membership
      on membership.course_id = microsequence.course_id
     and membership.didactic_microsequence_id = microsequence.entity_id
    left join part_rows part on part.id = membership.authoring_part_id
    where module_value.course_id = p_course_id
      and module_value.entity_type = 'module'
      and module_value.parent_type is null
      and module_value.parent_id is null
      and case p_scope_kind
        when 'course' then true
        when 'authoring_part' then part.id = v_scope_part_id
        when 'unassigned' then part.id is null
        when 'module' then module_value.entity_id = p_scope_id
        when 'lesson' then lesson.entity_id = p_scope_id
        when 'didactic_microsequence' then microsequence.entity_id = p_scope_id
        else false
      end
  ), candidate_pool as materialized (
    select ordered.*
    from ordered
    where v_pivot_ordinal is null
       or (
         p_direction = 'forward'
         and (
           ordered.ordinal > v_pivot_ordinal
           or (
             (p_anchor_study_unit_id is not null or p_entry = 'latest_updated')
             and ordered.ordinal = v_pivot_ordinal
           )
         )
       )
       or (
         p_direction = 'backward'
         and (
           ordered.ordinal < v_pivot_ordinal
           or (
             (p_anchor_study_unit_id is not null or p_entry = 'latest_updated')
             and ordered.ordinal = v_pivot_ordinal
           )
         )
       )
    order by
      case when p_direction = 'forward' then ordered.ordinal end,
      case when p_direction = 'backward' then ordered.ordinal end desc
    limit p_limit
  ), projected as materialized (
    select candidate_pool.*,
      jsonb_build_object(
        'studyUnit', candidate_pool.study_unit_content || jsonb_build_object(
          'id', candidate_pool.entity_id,
          'position', candidate_pool.study_unit_position
        ),
        'version', candidate_pool.study_unit_version,
        'updatedAt', candidate_pool.study_unit_updated_at,
        'ordinal', candidate_pool.ordinal,
        'curriculumPath', jsonb_build_object(
          'module', jsonb_build_object(
            'id', candidate_pool.module_id,
            'position', candidate_pool.module_position,
            'title', candidate_pool.module_title
          ),
          'lesson', jsonb_build_object(
            'id', candidate_pool.lesson_id,
            'position', candidate_pool.lesson_position,
            'title', candidate_pool.lesson_title
          ),
          'didacticMicrosequence', jsonb_build_object(
            'id', candidate_pool.microsequence_id,
            'position', candidate_pool.microsequence_position,
            'title', candidate_pool.microsequence_title
          )
        ),
        'authoringPart', case
          when candidate_pool.authoring_part_id is null then null
          else jsonb_build_object(
            'id', candidate_pool.authoring_part_id,
            'position', candidate_pool.authoring_part_position,
            'title', candidate_pool.authoring_part_title,
            'state', candidate_pool.authoring_part_state
          )
        end
      ) as item
    from candidate_pool
  ), running as materialized (
    select projected.*,
      row_number() over(order by
        case when p_direction = 'forward' then projected.ordinal end,
        case when p_direction = 'backward' then projected.ordinal end desc
      ) as directional_rank,
      sum(octet_length(projected.item::text)) over(order by
        case when p_direction = 'forward' then projected.ordinal end,
        case when p_direction = 'backward' then projected.ordinal end desc
      ) as cumulative_bytes
    from projected
  ), chosen as materialized (
    select * from running
    where directional_rank = 1
       or cumulative_bytes + directional_rank * 2 <= p_max_bytes
  )
  select
    coalesce(jsonb_agg(chosen.item order by chosen.ordinal), '[]'::jsonb),
    min(chosen.ordinal), max(chosen.ordinal),
    (array_agg(chosen.entity_id order by chosen.ordinal))[1],
    (array_agg(chosen.entity_id order by chosen.ordinal desc))[1]
  into v_items, v_first_ordinal, v_last_ordinal,
    v_first_study_unit_id, v_last_study_unit_id
  from chosen;

  v_has_previous := coalesce(v_first_ordinal > 1, false);
  v_has_more := coalesce(v_last_ordinal < v_total_count, false);
  v_previous_cursor := case when v_has_previous then jsonb_build_object(
    'studyUnitId', v_first_study_unit_id
  ) else null end;
  v_next_cursor := case when v_has_more then jsonb_build_object(
    'studyUnitId', v_last_study_unit_id
  ) else null end;
  v_page_bytes := octet_length(v_items::text);

  v_result := jsonb_build_object(
    'contract', 'aralearn.course-study-unit-inspection-page.v1',
    'courseId', p_course_id,
    'courseRevision', v_course_revision,
    'scope', jsonb_build_object(
      'kind', p_scope_kind,
      'id', case when p_scope_kind in ('course', 'unassigned')
        then null else p_scope_id end
    ),
    'totalCount', v_total_count,
    'scopeOptions', v_scope_options,
    'items', v_items,
    'hasPrevious', v_has_previous,
    'hasMore', v_has_more,
    'previousCursor', v_previous_cursor,
    'nextCursor', v_next_cursor,
    'pageBytes', v_page_bytes
  );
  if octet_length(v_result::text) > 1835008 then
    raise exception 'Página de Unidades excede o limite de leitura.'
      using errcode = '54000';
  end if;
  return v_result;
end;
$function$;

create or replace function private.list_course_study_units_for_actor_continuous_v2(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_revision bigint,
  p_scope_kind text default 'course',
  p_scope_id text default null,
  p_anchor_study_unit_id text default null,
  p_cursor_study_unit_id text default null,
  p_direction text default 'forward',
  p_limit integer default 12,
  p_max_bytes integer default 524288,
  p_entry text default null
)
returns jsonb language sql stable security definer
set search_path = pg_catalog,private
as $function$
  select private.decorate_course_inspection_page_v2(
    p_course_id,p_expected_revision,
    private.list_course_study_units_for_actor_v1(
      p_actor_id,p_course_id,p_expected_revision,p_scope_kind,p_scope_id,
      p_anchor_study_unit_id,p_cursor_study_unit_id,p_direction,p_limit,p_max_bytes,p_entry
    )
  )
$function$;

create or replace function public.list_owned_course_study_units_for_actor_v2(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_revision bigint,
  p_scope_kind text default 'course',
  p_scope_id text default null,
  p_anchor_study_unit_id text default null,
  p_cursor_study_unit_id text default null,
  p_direction text default 'forward',
  p_limit integer default 12,
  p_max_bytes integer default 524288,
  p_entry text default null
)
returns jsonb language sql stable security definer
set search_path = pg_catalog,private
as $function$
  select private.list_course_study_units_for_actor_continuous_v2(
      p_actor_id,p_course_id,p_expected_revision,p_scope_kind,p_scope_id,
      p_anchor_study_unit_id,p_cursor_study_unit_id,p_direction,p_limit,p_max_bytes,p_entry
  )
$function$;

revoke all on function private.list_course_study_units_for_actor_v1(uuid,uuid,bigint,text,text,text,text,text,integer,integer,text),
  private.list_course_study_units_for_actor_continuous_v2(uuid,uuid,bigint,text,text,text,text,text,integer,integer,text),
  public.list_owned_course_study_units_for_actor_v2(uuid,uuid,bigint,text,text,text,text,text,integer,integer,text)
from public,anon,authenticated,service_role;
grant execute on function public.list_owned_course_study_units_for_actor_v2(uuid,uuid,bigint,text,text,text,text,text,integer,integer,text)
to service_role;

do $manifest$ declare v jsonb; begin
 v:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260905125617');
 execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L','select '||quote_literal(v::text)||'::jsonb');
end $manifest$;

commit;
