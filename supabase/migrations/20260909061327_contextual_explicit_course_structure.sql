begin;

do $receipt_operations$
declare v_name text; v_expression text;
begin
  for v_name,v_expression in select conname,pg_get_expr(conbin,conrelid) from pg_constraint
    where conrelid='private.course_change_receipts'::regclass and contype='c' and conname like 'course_change_receipts_operation_%' loop
    execute format('alter table private.course_change_receipts drop constraint %I',v_name);
    execute format('alter table private.course_change_receipts add constraint %I check ((%s) or operation in(''mutate_course_structure'',''reorder_course_study_units''))',v_name,v_expression);
  end loop;
end $receipt_operations$;

-- Typed structural changes reuse the owned course, its entity relations and
-- request receipts. The map writer's protection against omission stays intact.
create function private.course_structure_dependency_issues_v1(p_course_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,private as $function$
  with ordered as (
    select ms.entity_id,ms.content,row_number() over(order by m.position,l.position,ms.position,ms.entity_id) ordinal
    from private.course_entities ms join private.course_entities l on l.course_id=ms.course_id and l.entity_type='lesson' and l.entity_id=ms.parent_id
    join private.course_entities m on m.course_id=l.course_id and m.entity_type='module' and m.entity_id=l.parent_id
    where ms.course_id=p_course_id and ms.entity_type='microsequence'
  ) select coalesce(jsonb_agg(jsonb_build_array(current.entity_id,dependency.value,
      case when prior.entity_id is null then 'missing' else 'order' end) order by current.entity_id,dependency.value),'[]'::jsonb)
    from ordered current cross join lateral jsonb_array_elements_text(coalesce(current.content->'dependsOn','[]'::jsonb)) dependency(value)
    left join ordered prior on prior.entity_id=dependency.value
    where prior.entity_id is null or prior.ordinal>=current.ordinal
$function$;
revoke all on function private.course_structure_dependency_issues_v1(uuid) from public,anon,authenticated,service_role;

create function private.remap_course_structure_content_v1(p_type text,p_content jsonb,p_id_map jsonb)
returns jsonb language plpgsql immutable set search_path=pg_catalog as $function$
declare v jsonb:=p_content; v_dependencies jsonb; v_topic_field text;
begin
  -- These are identity fields. Authored prose, component data and evidence
  -- statements are kept literally, even when they happen to resemble an ID.
  if p_type='microsequence' then
    if v ? 'dependsOn' then
      select coalesce(jsonb_agg(coalesce(p_id_map->('microsequence:'||e.value),to_jsonb(e.value)) order by e.ordinal),'[]'::jsonb)
        into v_dependencies from jsonb_array_elements_text(v->'dependsOn') with ordinality e(value,ordinal);
      v:=jsonb_set(v,'{dependsOn}',v_dependencies);
    end if;
    if jsonb_typeof(v->'branchOf')='string' and p_id_map ? ('microsequence:'||(v->>'branchOf')) then
      v:=jsonb_set(v,'{branchOf}',p_id_map->('microsequence:'||(v->>'branchOf')));
    end if;
  end if;
  v_topic_field:=case p_type when 'microsequence' then 'covers' when 'study_unit' then 'topics' end;
  if v_topic_field is not null and v ? v_topic_field then
    select coalesce(jsonb_agg(coalesce(p_id_map->('topic:'||e.value),to_jsonb(e.value)) order by e.ordinal),'[]'::jsonb)
      into v_dependencies from jsonb_array_elements_text(v->v_topic_field) with ordinality e(value,ordinal);
    v:=jsonb_set(v,array[v_topic_field],v_dependencies);
  end if;
  return v;
end $function$;
revoke all on function private.remap_course_structure_content_v1(text,jsonb,jsonb) from public,anon,authenticated,service_role;

create function public.mutate_course_structure_for_actor_v1(p_actor_id uuid,p_course_id uuid,
  p_expected_revision bigint,p_expected_plan_version bigint,p_command jsonb,p_request_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,private,public as $function$
declare
  v_course public.courses%rowtype; v_plan private.course_instructional_plans%rowtype;
  v_target private.course_entities%rowtype; v_receipt private.course_change_receipts%rowtype;
  v_operation text:=p_command->>'operation'; v_kind text:=p_command->>'kind'; v_parent_type text;
  v_parent text; v_position integer; v_root text; v_hash text; v_result jsonb;
  v_members jsonb; v_id_map jsonb:='{}'::jsonb; v_reverse_map jsonb:='{}'::jsonb;
  v_order text[]; v_count integer; v_changed boolean:=true; v_member jsonb; v_new_id text;
  v_before_issues jsonb; v_issue jsonb; v_attribution record; v_parts uuid[];
  v_attribution_id uuid; v_attribution_hash text; v_source_state jsonb;
  v_gate text:=coalesce(current_setting('aralearn.applied_explanation_basis_write',true),'');
begin
  perform private.require_service_role();
  if p_actor_id is null or p_course_id is null or p_expected_revision is null or p_expected_revision<1
    or p_expected_plan_version is null or p_expected_plan_version<1 or p_request_id is null
    or p_request_id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
    or jsonb_typeof(p_command) is distinct from 'object'
    or not(p_command ?& array['operation','kind','targetId','parentId','position','title'])
    or p_command-array['operation','kind','targetId','parentId','position','title']<>'{}'::jsonb
    or jsonb_typeof(p_command->'operation') is distinct from 'string' or jsonb_typeof(p_command->'kind') is distinct from 'string'
    or v_operation not in('move','duplicate','remove') or v_kind not in('module','lesson','microsequence')
    or jsonb_typeof(p_command->'targetId') is distinct from 'string'
    or char_length(p_command->>'targetId') not between 1 and 240
    or p_command->>'targetId'<>btrim(p_command->>'targetId') or p_command->>'targetId'~'[[:cntrl:]]'
    or jsonb_typeof(p_command->'parentId') not in('null','string')
    or jsonb_typeof(p_command->'parentId')='string' and (char_length(p_command->>'parentId') not between 1 and 240
      or p_command->>'parentId'<>btrim(p_command->>'parentId') or p_command->>'parentId'~'[[:cntrl:]]')
    or not(p_command->'position'='null'::jsonb or jsonb_typeof(p_command->'position')='number'
      and p_command->>'position'~'^[0-9]{1,2}$' and (p_command->>'position')::integer between 0 and 63)
    or not(p_command->'title'='null'::jsonb or jsonb_typeof(p_command->'title')='string'
      and char_length(p_command->>'title') between 1 and 300 and p_command->>'title'~'[^[:space:]]'
      and p_command->>'title'=btrim(p_command->>'title') and p_command->>'title'!~'[[:cntrl:]]')
    or v_operation<>'duplicate' and p_command->'title'<>'null'::jsonb
    or v_operation='duplicate' and p_command->'title'='null'::jsonb
    or v_operation='remove' and (p_command->'parentId'<>'null'::jsonb or p_command->'position'<>'null'::jsonb)
    or v_kind='module' and p_command->'parentId'<>'null'::jsonb then
    raise exception 'Alteração estrutural inválida.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('account-delete:'||p_actor_id::text,0));
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('courseId',p_course_id,'expectedRevision',p_expected_revision,
    'expectedPlanVersion',p_expected_plan_version,'command',p_command)::text,'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('course-change-request:'||p_actor_id::text||':'||p_request_id,0));
  select * into v_receipt from private.course_change_receipts where actor_id=p_actor_id and request_id=p_request_id;
  if found then
    if v_receipt.operation<>'mutate_course_structure' or v_receipt.course_id<>p_course_id or v_receipt.request_hash<>v_hash then
      raise exception 'A tentativa estrutural foi reutilizada com outra intenção.' using errcode='23514';
    end if;
    return v_receipt.result||jsonb_build_object('idempotent',true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('course-row:'||p_course_id::text,0));
  select * into strict v_course from public.courses where id=p_course_id for update;
  select * into v_plan from private.course_instructional_plans where course_id=p_course_id for update;
  if not found then raise exception 'Planejamento inexistente.' using errcode='PT404'; end if;
  if v_course.revision<>p_expected_revision or v_plan.version<>p_expected_plan_version then
    raise exception 'O curso ou mapa mudou; releia o ramo antes de alterá-lo.' using errcode='40001';
  end if;
  select * into v_target from private.course_entities where course_id=p_course_id and entity_type=v_kind and entity_id=p_command->>'targetId';
  if not found then raise exception 'Ramo inexistente.' using errcode='PT404'; end if;
  v_parent_type:=case v_kind when 'lesson' then 'module' when 'microsequence' then 'lesson' else null end;
  v_parent:=coalesce(p_command->>'parentId',v_target.parent_id);
  if v_parent_type is not null and not exists(select 1 from private.course_entities where course_id=p_course_id and entity_type=v_parent_type and entity_id=v_parent) then
    raise exception 'O destino não pertence ao curso ou ao nível curricular necessário.' using errcode='23514';
  end if;
  with recursive branch as (
    select entity_type,entity_id from private.course_entities where course_id=p_course_id and entity_type=v_kind and entity_id=v_target.entity_id
    union all select child.entity_type,child.entity_id from private.course_entities child join branch parent
      on child.parent_type=parent.entity_type and child.parent_id=parent.entity_id where child.course_id=p_course_id
  ) select jsonb_agg(jsonb_build_object('kind',entity_type,'id',entity_id) order by entity_type,entity_id) into v_members from branch;
  v_count:=jsonb_array_length(v_members);
  v_before_issues:=private.course_structure_dependency_issues_v1(p_course_id);
  v_root:=v_target.entity_id;
  if v_operation='duplicate' then
    for v_member in select value from jsonb_array_elements(v_members) loop
      v_new_id:='copy-'||substr(encode(extensions.digest(convert_to(p_actor_id::text||':'||p_request_id||':'||(v_member->>'kind')||':'||(v_member->>'id'),'UTF8'),'sha256'),'hex'),1,48);
      v_id_map:=v_id_map||jsonb_build_object((v_member->>'kind')||':'||(v_member->>'id'),v_new_id);
      v_reverse_map:=v_reverse_map||jsonb_build_object(v_new_id,v_member->>'id');
    end loop;
    v_root:=v_id_map->>(v_kind||':'||v_target.entity_id);
  end if;
  if v_operation='remove' then
    -- A surviving dependency is an explicit decision, not disposable collateral.
    if exists(select 1 from private.course_entities ms cross join lateral jsonb_array_elements_text(coalesce(ms.content->'dependsOn','[]'::jsonb)) d(value)
      where ms.course_id=p_course_id and ms.entity_type='microsequence'
      and not exists(select 1 from jsonb_array_elements(v_members) b where b->>'kind'='microsequence' and b->>'id'=ms.entity_id)
      and exists(select 1 from jsonb_array_elements(v_members) b where b->>'kind'='microsequence' and b->>'id'=d.value)) then
      raise exception 'Há microssequências fora do ramo que dependem dele; ajuste essas dependências antes de remover.' using errcode='23514';
    end if;
    if exists(select 1 from private.course_entities entity where entity.course_id=p_course_id
      and not exists(select 1 from jsonb_array_elements(v_members) b where b->>'kind'=entity.entity_type and b->>'id'=entity.entity_id)
      and (entity.entity_type='microsequence' and exists(select 1 from jsonb_array_elements(v_members) b
        where b->>'kind'='microsequence' and b->>'id'=entity.content->>'branchOf')
        or exists(select 1 from jsonb_array_elements_text(coalesce(entity.content->case entity.entity_type
          when 'microsequence' then 'covers' when 'study_unit' then 'topics' end,'[]'::jsonb)) reference(value)
          join jsonb_array_elements(v_members) b on b->>'kind'='topic' and b->>'id'=reference.value))) then
      raise exception 'Há referências ao ramo fora dele; ajuste-as antes de remover.' using errcode='23514';
    end if;
    select array_agg(distinct authoring_part_id) into v_parts from private.course_authoring_part_didactic_microsequences link
      where course_id=p_course_id and exists(select 1 from jsonb_array_elements(v_members) b where b->>'kind'='microsequence' and b->>'id'=link.didactic_microsequence_id);
    delete from private.course_authoring_part_didactic_microsequences link where course_id=p_course_id
      and exists(select 1 from jsonb_array_elements(v_members) b where b->>'kind'='microsequence' and b->>'id'=link.didactic_microsequence_id);
    -- Detach only provenance of the explicitly removed objects. Catalog sources,
    -- shared PDFs/audio and annotations of the original history remain intact.
    delete from private.course_source_attributions attribution where course_id=p_course_id
      and exists(select 1 from jsonb_array_elements(v_members) b where b->>'id'=attribution.target_id
        and attribution.target_kind=case b->>'kind' when 'study_unit' then 'study_unit' when 'microsequence' then 'microsequence_explanation' end);
    delete from private.course_entities where course_id=p_course_id and entity_type=v_kind and entity_id=v_target.entity_id;
    with ranked as(select entity_id,row_number() over(order by position,entity_id)-1 position from private.course_entities
      where course_id=p_course_id and entity_type=v_kind and parent_id is not distinct from v_target.parent_id)
    update private.course_entities entity set position=ranked.position,version=entity.version+1,updated_at=now() from ranked
      where entity.course_id=p_course_id and entity.entity_type=v_kind and entity.entity_id=ranked.entity_id and entity.position<>ranked.position;
    with ranked as(select authoring_part_id,didactic_microsequence_id,row_number() over(partition by authoring_part_id order by production_position)-1 position
      from private.course_authoring_part_didactic_microsequences where course_id=p_course_id and authoring_part_id=any(v_parts))
    update private.course_authoring_part_didactic_microsequences link set production_position=ranked.position from ranked
      where link.course_id=p_course_id and link.authoring_part_id=ranked.authoring_part_id and link.didactic_microsequence_id=ranked.didactic_microsequence_id;
    update private.course_authoring_parts set version=version+1,updated_at=now() where course_id=p_course_id and id=any(v_parts);
  else
    select coalesce(array_agg(entity_id order by position,entity_id),'{}'::text[]) into v_order from private.course_entities
      where course_id=p_course_id and entity_type=v_kind and parent_id is not distinct from v_parent
        and (v_operation='duplicate' or entity_id<>v_target.entity_id);
    v_position:=coalesce((p_command->>'position')::integer,case when v_operation='move' and v_parent is not distinct from v_target.parent_id
      then v_target.position else cardinality(v_order) end);
    if v_position>cardinality(v_order) or cardinality(v_order)>=64 then raise exception 'A posição ou quantidade de ramos irmãos é inválida.' using errcode='22023'; end if;
    v_order:=v_order[1:v_position]||array[v_root]||v_order[v_position+1:cardinality(v_order)];
    if v_operation='move' then
      v_changed:=row(v_target.parent_id,v_target.position) is distinct from row(v_parent,v_position);
      if v_changed then update private.course_entities set parent_id=v_parent,position=v_position,version=version+1,updated_at=now()
        where course_id=p_course_id and entity_type=v_kind and entity_id=v_root; end if;
    else
      insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content,version,created_at,updated_at,
        design_snapshot,design_application,created_origin,last_revision_origin)
      select p_course_id,entity.entity_type,v_id_map->>(entity.entity_type||':'||entity.entity_id),entity.parent_type,
        case when entity.entity_type=v_kind and entity.entity_id=v_target.entity_id then v_parent
          else coalesce(v_id_map->>(entity.parent_type||':'||entity.parent_id),entity.parent_id) end,
        case when entity.entity_type=v_kind and entity.entity_id=v_target.entity_id then v_position else entity.position end,
        private.remap_course_structure_content_v1(entity.entity_type,entity.content,v_id_map)||case when entity.entity_type=v_kind and entity.entity_id=v_target.entity_id
          then jsonb_build_object('title',p_command->>'title') else '{}'::jsonb end,
        1,now(),now(),entity.design_snapshot,entity.design_application,entity.created_origin,entity.last_revision_origin
      from private.course_entities entity where entity.course_id=p_course_id and v_id_map ? (entity.entity_type||':'||entity.entity_id);
      perform set_config('aralearn.applied_explanation_basis_write','authorized-copy',true);
      update private.course_entities target set applied_explanation_basis=source.applied_explanation_basis||jsonb_build_object('sourceCourseId',
        coalesce(source.applied_explanation_basis->>'sourceCourseId',p_course_id::text)) from private.course_entities source
        where source.course_id=p_course_id and source.entity_type='study_unit' and source.applied_explanation_basis is not null
          and target.course_id=p_course_id and target.entity_type='study_unit' and target.entity_id=v_id_map->>('study_unit:'||source.entity_id);
      perform set_config('aralearn.applied_explanation_basis_write',v_gate,true);
      insert into private.course_design_target_plan_items(course_id,didactic_microsequence_id,plan_item_id,plan_item_kind)
        select p_course_id,v_id_map->>('microsequence:'||didactic_microsequence_id),plan_item_id,plan_item_kind
        from private.course_design_target_plan_items where course_id=p_course_id and v_id_map ? ('microsequence:'||didactic_microsequence_id);
      insert into private.course_design_parameter_assignments(course_id,parameter_id,scope_kind,scope_ref,value,origin,reason,updated_at,mode)
        select p_course_id,parameter_id,scope_kind,v_id_map->>((case scope_kind when 'didactic_microsequence' then 'microsequence' else scope_kind end)||':'||scope_ref),
          value,origin,reason,now(),mode from private.course_design_parameter_assignments
        where course_id=p_course_id and v_id_map ? ((case scope_kind when 'didactic_microsequence' then 'microsequence' else scope_kind end)||':'||scope_ref);
      insert into private.course_authoring_guidance_assignments(course_id,scope_kind,scope_ref,guidance,origin,reason,updated_at)
        select p_course_id,scope_kind,v_id_map->>((case scope_kind when 'didactic_microsequence' then 'microsequence' else scope_kind end)||':'||scope_ref),guidance,origin,reason,now()
        from private.course_authoring_guidance_assignments where course_id=p_course_id and v_id_map ? ((case scope_kind when 'didactic_microsequence' then 'microsequence' else scope_kind end)||':'||scope_ref);
      insert into private.course_component_policy_assignments(course_id,scope_kind,scope_ref,policy,origin,reason,updated_at)
        select p_course_id,scope_kind,v_id_map->>((case scope_kind when 'didactic_microsequence' then 'microsequence' else scope_kind end)||':'||scope_ref),policy,origin,reason,now()
        from private.course_component_policy_assignments where course_id=p_course_id and v_id_map ? ((case scope_kind when 'didactic_microsequence' then 'microsequence' else scope_kind end)||':'||scope_ref);
      for v_attribution in select attribution.* from private.course_source_attributions attribution where course_id=p_course_id
        and v_id_map ? ((case attribution.target_kind when 'microsequence_explanation' then 'microsequence' when 'study_unit' then 'study_unit' else '' end)||':'||attribution.target_id) loop
        -- Preserve the original binding, including retained sources/anchors.
        -- Creating a new citation would require active catalog entries, whereas
        -- a faithful copy must not silently drop useful historical provenance.
        v_attribution_hash:=encode(extensions.digest(convert_to(p_actor_id::text||':'||p_request_id||':attribution:'||v_attribution.id::text,'UTF8'),'sha256'),'hex');
        v_attribution_id:=(substr(v_attribution_hash,1,8)||'-'||substr(v_attribution_hash,9,4)||'-4'||substr(v_attribution_hash,14,3)||'-8'||substr(v_attribution_hash,18,3)||'-'||substr(v_attribution_hash,21,12))::uuid;
        v_new_id:=v_id_map->>((case v_attribution.target_kind when 'microsequence_explanation' then 'microsequence' else 'study_unit' end)||':'||v_attribution.target_id);
        v_source_state:=private.course_source_target_state_v1(p_course_id,v_attribution.target_kind,v_new_id);
        if v_source_state is null then raise exception 'O alvo copiado da fonte não foi preservado.' using errcode='23514'; end if;
        insert into private.course_source_attributions(course_id,id,target_kind,target_id,target_version,target_hash,created_at)
          values(p_course_id,v_attribution_id,v_attribution.target_kind,v_new_id,(v_source_state->>'version')::bigint,v_source_state->>'hash',now());
        insert into private.course_source_attribution_sources(course_id,attribution_id,source_ordinal,source_id,relation,link_id,roles,occurrences)
          select p_course_id,v_attribution_id,source_ordinal,source_id,relation,link_id,roles,occurrences
          from private.course_source_attribution_sources where course_id=p_course_id and attribution_id=v_attribution.id;
        insert into private.course_source_attribution_anchors(course_id,attribution_id,source_ordinal,anchor_ordinal,source_id,anchor_id)
          select p_course_id,v_attribution_id,source_ordinal,anchor_ordinal,source_id,anchor_id
          from private.course_source_attribution_anchors where course_id=p_course_id and attribution_id=v_attribution.id;
      end loop;
    end if;
    update private.course_entities entity set position=ordered.ordinal-1,version=entity.version+1,updated_at=now()
      from unnest(v_order) with ordinality ordered(id,ordinal)
      where entity.course_id=p_course_id and entity.entity_type=v_kind and entity.entity_id=ordered.id and entity.position<>ordered.ordinal-1;
    if v_operation='move' and v_parent is distinct from v_target.parent_id then
      with ranked as(select entity_id,row_number() over(order by position,entity_id)-1 position from private.course_entities
        where course_id=p_course_id and entity_type=v_kind and parent_id is not distinct from v_target.parent_id)
      update private.course_entities entity set position=ranked.position,version=entity.version+1,updated_at=now() from ranked
        where entity.course_id=p_course_id and entity.entity_type=v_kind and entity.entity_id=ranked.entity_id and entity.position<>ranked.position;
    end if;
  end if;
  -- Existing draft pendencies remain visible. A structural command may not
  -- introduce a new invalid dependency or silently erase one to pass validation.
  for v_issue in select value from jsonb_array_elements(private.course_structure_dependency_issues_v1(p_course_id)) loop
    v_issue:=jsonb_build_array(coalesce(v_reverse_map->(v_issue->>0),v_issue->0),coalesce(v_reverse_map->(v_issue->>1),v_issue->1),v_issue->2);
    if not(v_before_issues @> jsonb_build_array(v_issue)) then
      raise exception 'A alteração criaria uma dependência ausente ou fora da ordem; ajuste o recorte antes de mover ou duplicar.' using errcode='23514';
    end if;
  end loop;
  if v_changed then
    update private.course_instructional_plans set curriculum_map_status='draft',version=version+1,updated_at=now()
      where course_id=p_course_id returning * into v_plan;
    update public.courses set revision=revision+1,updated_at=now() where id=p_course_id returning * into v_course;
  end if;
  v_result:=jsonb_build_object('contract','aralearn.course-structure-change.v1','courseId',p_course_id,'courseRevision',v_course.revision,
    'planVersion',v_plan.version,'operation',v_operation,'targetKind',v_kind,'targetId',v_root,'affectedEntityCount',case when v_changed then v_count else 0 end,
    'changed',v_changed,'idempotent',false);
  insert into private.course_change_receipts(actor_id,request_id,operation,course_id,request_hash,result)
    values(p_actor_id,p_request_id,'mutate_course_structure',p_course_id,v_hash,v_result);
  return v_result;
exception when others then
  perform set_config('aralearn.applied_explanation_basis_write',v_gate,true);
  raise;
end $function$;
revoke all on function public.mutate_course_structure_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,text) from public,anon,authenticated;
grant execute on function public.mutate_course_structure_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,text) to service_role;

create function public.reorder_course_study_units_for_actor_v1(p_actor_id uuid,p_course_id uuid,
  p_expected_revision bigint,p_microsequence_id text,p_study_unit_ids jsonb,p_request_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,private,public as $function$
declare v_course public.courses%rowtype; v_receipt private.course_change_receipts%rowtype;
  v_hash text; v_result jsonb; v_existing jsonb; v_changed boolean; v_count integer;
begin
  perform private.require_service_role();
  if p_actor_id is null or p_course_id is null or p_expected_revision is null or p_expected_revision<1
    or p_microsequence_id is null or char_length(p_microsequence_id) not between 1 and 240
    or p_microsequence_id<>btrim(p_microsequence_id) or p_microsequence_id~'[[:cntrl:]]'
    or p_request_id is null or p_request_id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
    or jsonb_typeof(p_study_unit_ids) is distinct from 'array' then
    raise exception 'A ordenação precisa identificar uma microssequência e todas as suas unidades.' using errcode='22023';
  end if;
  if jsonb_array_length(p_study_unit_ids)<1 or octet_length(p_study_unit_ids::text)>512*1024
    or exists(select 1 from jsonb_array_elements(p_study_unit_ids) item where jsonb_typeof(item)<>'string'
      or char_length(item#>>'{}') not between 1 and 240 or item#>>'{}'<>btrim(item#>>'{}') or item#>>'{}'~'[[:cntrl:]]')
    or (select count(distinct value) from jsonb_array_elements(p_study_unit_ids))<>jsonb_array_length(p_study_unit_ids) then
    raise exception 'As unidades devem aparecer uma vez cada, na ordem escolhida.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('account-delete:'||p_actor_id::text,0));
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('courseId',p_course_id,'expectedRevision',p_expected_revision,
    'microsequenceId',p_microsequence_id,'studyUnitIds',p_study_unit_ids)::text,'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('course-change-request:'||p_actor_id::text||':'||p_request_id,0));
  select * into v_receipt from private.course_change_receipts where actor_id=p_actor_id and request_id=p_request_id;
  if found then
    if v_receipt.operation<>'reorder_course_study_units' or v_receipt.course_id<>p_course_id or v_receipt.request_hash<>v_hash then
      raise exception 'A tentativa de ordenação foi reutilizada com outra intenção.' using errcode='23514';
    end if;
    return v_receipt.result||jsonb_build_object('idempotent',true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('course-row:'||p_course_id::text,0));
  select * into strict v_course from public.courses where id=p_course_id for update;
  if v_course.revision<>p_expected_revision then raise exception 'O curso mudou; releia as unidades.' using errcode='40001'; end if;
  if not exists(select 1 from private.course_entities where course_id=p_course_id and entity_type='microsequence' and entity_id=p_microsequence_id) then
    raise exception 'Microssequência inexistente.' using errcode='PT404';
  end if;
  select coalesce(jsonb_agg(entity_id order by position,entity_id),'[]'::jsonb) into v_existing from private.course_entities
    where course_id=p_course_id and entity_type='study_unit' and parent_type='microsequence' and parent_id=p_microsequence_id;
  if not(v_existing @> p_study_unit_ids and p_study_unit_ids @> v_existing) then
    raise exception 'A ordem deve incluir exatamente as unidades da microssequência; omissão não remove conteúdo.' using errcode='23514';
  end if;
  v_changed:=v_existing<>p_study_unit_ids;
  update private.course_entities entity set position=ordered.ordinal,version=entity.version+1,updated_at=now()
    from jsonb_array_elements_text(p_study_unit_ids) with ordinality ordered(id,ordinal)
    where entity.course_id=p_course_id and entity.entity_type='study_unit' and entity.entity_id=ordered.id and entity.position<>ordered.ordinal;
  get diagnostics v_count=row_count;
  if v_changed then
    update public.courses set revision=revision+1,updated_at=now() where id=p_course_id returning * into v_course;
  end if;
  v_result:=jsonb_build_object('contract','aralearn.course-study-unit-order.v1','courseId',p_course_id,'courseRevision',v_course.revision,
    'microsequenceId',p_microsequence_id,'studyUnitIds',p_study_unit_ids,'changed',v_changed,'idempotent',false,'affectedEntityCount',v_count);
  insert into private.course_change_receipts(actor_id,request_id,operation,course_id,request_hash,result)
    values(p_actor_id,p_request_id,'reorder_course_study_units',p_course_id,v_hash,v_result);
  return v_result;
end $function$;
revoke all on function public.reorder_course_study_units_for_actor_v1(uuid,uuid,bigint,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.reorder_course_study_units_for_actor_v1(uuid,uuid,bigint,text,jsonb,text) to service_role;

notify pgrst,'reload schema';
commit;
