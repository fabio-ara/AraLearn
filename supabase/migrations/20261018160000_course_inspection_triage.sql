begin;
set local lock_timeout='5s';
set local statement_timeout='1min';

-- Structural identifiers for resolving the existing human references without
-- reading instructional text, explanations, sources, or full plans.
create function private.course_inspection_triage_outline_v1(p_course_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,private as $function$
  with modules as (
    select m.entity_id,m.position,m.content->>'title' title
    from private.course_entities m
    where m.course_id=p_course_id and m.entity_type='module' and m.parent_type is null
  ), curriculum as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',m.entity_id,'position',m.position,'title',m.title,
      'lessons',coalesce((select jsonb_agg(jsonb_build_object(
        'id',l.entity_id,'position',l.position,'title',l.content->>'title',
        'microsequences',coalesce((select jsonb_agg(jsonb_build_object(
          'id',q.entity_id,'position',q.position,'title',q.content->>'title'
        ) order by q.position,q.entity_id) from private.course_entities q
          where q.course_id=p_course_id and q.entity_type='microsequence'
            and q.parent_type='lesson' and q.parent_id=l.entity_id),'[]'::jsonb)
      ) order by l.position,l.entity_id) from private.course_entities l
        where l.course_id=p_course_id and l.entity_type='lesson'
          and l.parent_type='module' and l.parent_id=m.entity_id),'[]'::jsonb)
    ) order by m.position,m.entity_id),'[]'::jsonb) modules
    from modules m
  ), parts as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,'position',p.position,'title',p.title,
      'microsequences',coalesce((select jsonb_agg(jsonb_build_object(
        'id',membership.didactic_microsequence_id,'productionPosition',membership.production_position,
        'title',q.content->>'title'
      ) order by membership.production_position,membership.didactic_microsequence_id)
        from private.course_authoring_part_didactic_microsequences membership
        join private.course_entities q on q.course_id=membership.course_id
          and q.entity_type='microsequence' and q.entity_id=membership.didactic_microsequence_id
        where membership.course_id=p_course_id and membership.authoring_part_id=p.id),'[]'::jsonb)
    ) order by p.position,p.id),'[]'::jsonb) items
    from private.course_authoring_parts p where p.course_id=p_course_id
  ), units as (
    select u.entity_id,u.content->>'title' title,
      q.entity_id microsequence_id,l.entity_id lesson_id,m.entity_id module_id,
      membership.authoring_part_ids[1] part_id,
      row_number() over(order by m.position,m.entity_id,l.position,l.entity_id,
        q.position,q.entity_id,u.position,u.entity_id) ordinal
    from private.course_entities u
    join private.course_entities q on q.course_id=u.course_id and q.entity_type='microsequence'
      and q.entity_id=u.parent_id and u.parent_type='microsequence'
    join private.course_entities l on l.course_id=q.course_id and l.entity_type='lesson'
      and l.entity_id=q.parent_id and q.parent_type='lesson'
    join private.course_entities m on m.course_id=l.course_id and m.entity_type='module'
      and m.entity_id=l.parent_id and l.parent_type='module'
    left join lateral (select array_agg(m.authoring_part_id::text order by m.authoring_part_id::text) authoring_part_ids
      from private.course_authoring_part_didactic_microsequences m
      where m.course_id=q.course_id and m.didactic_microsequence_id=q.entity_id) membership on true
    where u.course_id=p_course_id and u.entity_type='study_unit'
  )
  select jsonb_build_object('title',c.title,
    'curriculum',jsonb_build_object('modules',curriculum.modules),
    'parts',parts.items,
    'studyUnits',coalesce((select jsonb_agg(jsonb_build_object(
      'id',u.entity_id,'title',u.title,'ordinal',u.ordinal,
      'curriculumPath',jsonb_build_object('moduleId',u.module_id,'lessonId',u.lesson_id,
        'didacticMicrosequenceId',u.microsequence_id),'authoringPartId',u.part_id
    ) order by u.ordinal) from units u),'[]'::jsonb))
  from public.courses c cross join curriculum cross join parts where c.id=p_course_id
$function$;

create function public.get_owned_course_inspection_triage_outline_for_actor_v1(
  p_actor_id uuid,p_course_id uuid,p_expected_revision bigint
)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,private as $function$
declare v_revision bigint; v_plan jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  select revision into strict v_revision from public.courses where id=p_course_id;
  if p_expected_revision is null or v_revision is distinct from p_expected_revision then
    raise exception 'A revisão do curso mudou.' using errcode='PT409';
  end if;
  v_plan:=private.course_inspection_triage_outline_v1(p_course_id);
  if v_plan is null then raise exception 'Curso não encontrado.' using errcode='PT404'; end if;
  if octet_length(v_plan::text)>225280 then
    raise exception 'O índice estrutural excede o limite da triagem.' using errcode='54000';
  end if;
  return jsonb_build_object('contract','aralearn.course-inspection-triage-outline.v1',
    'courseId',p_course_id,'courseRevision',v_revision,'plan',v_plan);
end
$function$;

-- Enumerate target metadata only. The shared current-basis helper is evaluated
-- for page items inside the authenticated page RPC, never cached across reads.
create function private.course_inspection_triage_targets_v1(
  p_course_id uuid,p_scope_kind text,p_scope_id text,p_selected_unit_ids text[]
)
returns table(target_kind text,target_id text,title text,ordinal bigint)
language sql stable security definer set search_path=pg_catalog,private as $function$
  with selected as materialized (
    select requested.id,requested.position
    from unnest(coalesce(p_selected_unit_ids,'{}'::text[])) with ordinality requested(id,position)
  ), units as materialized (
    select u.entity_id id,u.content->>'title' title,u.position unit_position,
      q.entity_id micro_id,q.content->>'title' micro_title,q.content ? 'explanation' has_explanation,
      q.position micro_position,l.entity_id lesson_id,l.position lesson_position,
      m.entity_id module_id,m.position module_position,
      membership.authoring_part_ids,
      selected.position selected_position
    from private.course_entities u
    join private.course_entities q on q.course_id=u.course_id and q.entity_type='microsequence'
      and q.entity_id=u.parent_id and u.parent_type='microsequence'
    join private.course_entities l on l.course_id=q.course_id and l.entity_type='lesson'
      and l.entity_id=q.parent_id and q.parent_type='lesson'
    join private.course_entities m on m.course_id=l.course_id and m.entity_type='module'
      and m.entity_id=l.parent_id and l.parent_type='module'
    left join lateral (select array_agg(m.authoring_part_id::text order by m.authoring_part_id::text) authoring_part_ids
      from private.course_authoring_part_didactic_microsequences m
      where m.course_id=q.course_id and m.didactic_microsequence_id=q.entity_id) membership on true
    left join selected on selected.id=u.entity_id
    where u.course_id=p_course_id and u.entity_type='study_unit'
      and case p_scope_kind
        when 'course' then true
        when 'authoring_part' then p_scope_id=any(membership.authoring_part_ids)
        when 'unassigned' then membership.authoring_part_ids is null
        when 'module' then m.entity_id=p_scope_id
        when 'lesson' then l.entity_id=p_scope_id
        when 'didactic_microsequence' then q.entity_id=p_scope_id
        else false end
      and (p_selected_unit_ids is null or selected.id is not null)
  ), micros as materialized (
    select q.entity_id id,q.content->>'title' title,q.position micro_position,
      l.position lesson_position,m.position module_position,
      membership.authoring_part_ids,
      min(selected.position) selected_position
    from private.course_entities q
    join private.course_entities l on l.course_id=q.course_id and l.entity_type='lesson'
      and l.entity_id=q.parent_id and q.parent_type='lesson'
    join private.course_entities m on m.course_id=l.course_id and m.entity_type='module'
      and m.entity_id=l.parent_id and l.parent_type='module'
    left join lateral (select array_agg(part.authoring_part_id::text order by part.authoring_part_id::text) authoring_part_ids
      from private.course_authoring_part_didactic_microsequences part
      where part.course_id=q.course_id and part.didactic_microsequence_id=q.entity_id) membership on true
    left join private.course_entities u on u.course_id=q.course_id and u.entity_type='study_unit'
      and u.parent_type='microsequence' and u.parent_id=q.entity_id
    left join selected on selected.id=u.entity_id
    where q.course_id=p_course_id and q.entity_type='microsequence' and q.content ? 'explanation'
      and case p_scope_kind
        when 'course' then true
        when 'authoring_part' then p_scope_id=any(membership.authoring_part_ids)
        when 'unassigned' then membership.authoring_part_ids is null
        when 'module' then m.entity_id=p_scope_id
        when 'lesson' then l.entity_id=p_scope_id
        when 'didactic_microsequence' then q.entity_id=p_scope_id
        else false end
      and (p_selected_unit_ids is null or selected.id is not null)
    group by q.entity_id,q.content,q.position,l.position,m.position,membership.authoring_part_ids
  ), targets as (
  select 'study_unit'::text kind,u.id,left(u.title,300) title,
      case when p_selected_unit_ids is null then u.module_position::numeric*1000000000+
        u.lesson_position::numeric*1000000+u.micro_position::numeric*1000+u.unit_position::numeric*2
        else u.selected_position::numeric*2 end sort_key,
      1 target_order,
      u.module_position,u.lesson_position,u.micro_position,u.unit_position,u.id tie_id
    from units u
    union all
    select 'microsequence_explanation',q.id,left(q.title,300),
      case when p_selected_unit_ids is null then q.module_position::numeric*1000000000+
        q.lesson_position::numeric*1000000+q.micro_position::numeric*1000
        else q.selected_position::numeric*2-1 end,
      0 target_order,q.module_position,q.lesson_position,q.micro_position,0,q.id
    from micros q
  )
  select t.kind,t.id,t.title,row_number() over(order by t.sort_key,t.target_order,t.module_position,
    t.lesson_position,t.micro_position,t.unit_position,t.tie_id)
  from targets t
$function$;

create function private.course_inspection_triage_item_v1(
  p_course_id uuid,p_target_kind text,p_target_id text,p_title text,p_ordinal bigint
)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,private as $function$
declare v_state jsonb; v_report jsonb; v_checks jsonb; v_complete boolean:=false;
begin
  begin
    v_state:=private.course_ai_inspection_state_v1(p_course_id,p_target_kind,p_target_id);
  exception when others then
    v_state:=null;
  end;
  if v_state is null then
    return jsonb_build_object('targetKind',p_target_kind,'targetId',p_target_id,'title',p_title,
      'ordinal',p_ordinal,'state','unavailable','dimensionsCurrentComplete',null,'report',null);
  end if;
  if v_state->>'state'<>'current' then
    return jsonb_build_object('targetKind',p_target_kind,'targetId',p_target_id,'title',p_title,
      'ordinal',p_ordinal,'state',v_state->>'state','dimensionsCurrentComplete',null,'report',null);
  end if;
  v_report:=v_state->'report';
  select coalesce(jsonb_agg(jsonb_build_object('dimension',check_value->>'dimension',
    'result',check_value->>'result','reason',left(coalesce(check_value->>'reason',''),200))
    order by check_value->>'dimension'),'[]'::jsonb)
    into v_checks from jsonb_array_elements(coalesce(v_report->'checks','[]'::jsonb)) check_value;
  v_complete:=coalesce(jsonb_array_length(v_checks)=6 and
    (select count(distinct check_value->>'dimension')=6 and
      bool_and(check_value->>'dimension' in ('alignment','evidence','representation','feedback','sufficiency','configuration'))
      from jsonb_array_elements(v_checks) check_value),false);
  return jsonb_build_object('targetKind',p_target_kind,'targetId',p_target_id,'title',p_title,
    'ordinal',p_ordinal,'state','current','dimensionsCurrentComplete',v_complete,
    'report',jsonb_build_object('summary',left(v_report->>'summary',1000),'outcome',v_report->>'outcome',
      'findings',coalesce((select jsonb_agg(left(value,300) order by ordinality)
        from jsonb_array_elements_text(coalesce(v_report->'findings','[]'::jsonb)) with ordinality), '[]'::jsonb),
      'checks',v_checks));
end
$function$;

create function public.get_owned_course_inspection_triage_page_for_actor_v1(
  p_actor_id uuid,p_course_id uuid,p_expected_revision bigint,
  p_scope_kind text default 'course',p_scope_id text default null,
  p_selected_unit_ids text[] default null,p_cursor_ordinal bigint default 0,p_limit integer default 8
)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,private as $function$
declare v_revision bigint; v_total integer; v_cursor bigint; v_items jsonb;
  v_next text; v_count integer; v_scope jsonb; v_ids_count integer;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  select revision into strict v_revision from public.courses where id=p_course_id;
  if p_expected_revision is null or v_revision is distinct from p_expected_revision then
    raise exception 'A revisão do curso mudou.' using errcode='PT409';
  end if;
  if p_limit is null or p_limit not between 1 and 8 or p_cursor_ordinal is null or p_cursor_ordinal<0 or
      p_scope_kind not in ('course','authoring_part','unassigned','module','lesson','didactic_microsequence') or
      (p_scope_kind in ('course','unassigned') and p_scope_id is not null) or
      (p_scope_kind not in ('course','unassigned') and (p_scope_id is null or length(p_scope_id)>240)) or
      p_selected_unit_ids is not null and (cardinality(p_selected_unit_ids)<1 or cardinality(p_selected_unit_ids)>64 or
        cardinality(p_selected_unit_ids)<>cardinality(array(select distinct unnest(p_selected_unit_ids)))) then
    raise exception 'A consulta de triagem é inválida.' using errcode='22023';
  end if;
  if p_scope_kind='authoring_part' and not exists(select 1 from private.course_authoring_parts part
      where part.course_id=p_course_id and part.id::text=p_scope_id) then
    raise exception 'Parte não encontrada.' using errcode='PT404';
  end if;
  select count(*) into v_total from private.course_inspection_triage_targets_v1(
    p_course_id,p_scope_kind,p_scope_id,p_selected_unit_ids);
  if p_selected_unit_ids is not null then
    select count(*) into v_ids_count from private.course_inspection_triage_targets_v1(
      p_course_id,p_scope_kind,p_scope_id,p_selected_unit_ids) targets where targets.target_kind='study_unit';
    if v_ids_count<>cardinality(p_selected_unit_ids) then
      raise exception 'Uma unidade selecionada não pertence ao recorte.' using errcode='PT404';
    end if;
  end if;
  v_cursor:=p_cursor_ordinal;
  if v_cursor>0 and not exists(select 1 from private.course_inspection_triage_targets_v1(
      p_course_id,p_scope_kind,p_scope_id,p_selected_unit_ids) targets where targets.ordinal=v_cursor) then
    raise exception 'O cursor não pertence a esta consulta.' using errcode='22023';
  end if;
  with page as (
    select targets.* from private.course_inspection_triage_targets_v1(
      p_course_id,p_scope_kind,p_scope_id,p_selected_unit_ids) targets
    where targets.ordinal>v_cursor order by targets.ordinal limit p_limit
  ), materialized as (
    select page.*,private.course_inspection_triage_item_v1(p_course_id,page.target_kind,
      page.target_id,page.title,page.ordinal) item from page
  )
  select coalesce(jsonb_agg(item order by ordinal),'[]'::jsonb),count(*)::integer,
    (array_agg(ordinal order by ordinal desc))[1]
    into v_items,v_count,v_next from materialized;
  if p_selected_unit_ids is not null then v_scope:=jsonb_build_object('kind','selected_units','id',null);
  else v_scope:=jsonb_build_object('kind',p_scope_kind,'id',p_scope_id); end if;
  return jsonb_build_object('contract','aralearn.course-inspection-triage-page.v1',
    'courseId',p_course_id,'courseRevision',v_revision,'scope',v_scope,'items',v_items,
    'totalCount',v_total,'hasMore',coalesce(v_cursor+v_count<v_total,false),
    'nextCursor',case when v_cursor+v_count<v_total then v_next::text else null end);
end
$function$;

revoke all on function private.course_inspection_triage_outline_v1(uuid),
  private.course_inspection_triage_targets_v1(uuid,text,text,text[]),
  private.course_inspection_triage_item_v1(uuid,text,text,text,bigint),
  public.get_owned_course_inspection_triage_outline_for_actor_v1(uuid,uuid,bigint),
  public.get_owned_course_inspection_triage_page_for_actor_v1(uuid,uuid,bigint,text,text,text[],bigint,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.get_owned_course_inspection_triage_outline_for_actor_v1(uuid,uuid,bigint),
  public.get_owned_course_inspection_triage_page_for_actor_v1(uuid,uuid,bigint,text,text,text[],bigint,integer)
  to service_role;

do $manifest$
declare manifest jsonb:=public.get_aralearn_runtime_manifest();
begin
  manifest:=manifest||jsonb_build_object('schemaRevision','20261018160000');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(manifest::text)||'::jsonb');
end
$manifest$;

commit;
