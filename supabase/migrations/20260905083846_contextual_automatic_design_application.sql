begin;
-- A escolha automática pertence à aplicação contextual; a intenção corrente
-- não exige uma gravação intermediária nem recebe o valor escolhido de outra unidade.
create function private.valid_applied_course_design_parameters_v1(p_applied jsonb,p_resolved jsonb)
returns boolean language plpgsql stable security definer set search_path=pg_catalog,private as $function$
declare d private.course_design_parameter_definitions%rowtype; supplied jsonb; resolved jsonb; effective jsonb; index_value integer:=0;
begin
  if jsonb_typeof(p_applied) is distinct from 'array' or jsonb_typeof(p_resolved) is distinct from 'array'
    or jsonb_array_length(p_applied)<>(select count(*) from private.course_design_parameter_definitions)
    or jsonb_array_length(p_resolved)<>jsonb_array_length(p_applied) then return false; end if;
  for d in select * from private.course_design_parameter_definitions order by ordinal loop
    supplied:=p_applied->index_value; resolved:=p_resolved->index_value; effective:=resolved->'effectiveAssignment';
    index_value:=index_value+1;
    if jsonb_typeof(supplied) is distinct from 'object' or not(supplied ?& array['parameterId','value','origin','reason','sourceScopeKind'])
      or supplied-'parameterId'-'value'-'origin'-'reason'-'sourceScopeKind'<>'{}'::jsonb
      or supplied->>'parameterId' is distinct from d.parameter_id or resolved->>'parameterId' is distinct from d.parameter_id
      or resolved->'conflicts' is distinct from '[]'::jsonb
      or not private.valid_course_design_parameter_value_v1(d.parameter_id,supplied->'value')
      or jsonb_typeof(supplied->'reason') is distinct from 'string' or char_length(supplied->>'reason') not between 1 and 1000
      or supplied->>'reason'<>btrim(supplied->>'reason') or translate(supplied->>'reason',E'\n\r\t','')~'[[:cntrl:]]'
      or jsonb_typeof(supplied->'sourceScopeKind') is distinct from 'string'
      or not (supplied->>'sourceScopeKind'=any(d.supported_scopes)) then return false; end if;
    if effective->>'mode'='fixed' then
      if supplied->'value' is distinct from effective->'value' or supplied->>'origin' is distinct from effective->>'origin'
        or supplied->>'reason' is distinct from effective->>'reason' or supplied->>'sourceScopeKind' is distinct from effective#>>'{sourceScope,kind}' then return false; end if;
    elsif effective->>'mode'='automatic' then
      if supplied->>'origin' is distinct from 'automatic' or supplied->>'sourceScopeKind' not in(coalesce(effective#>>'{sourceScope,kind}','course'),'study_unit') then return false; end if;
    else return false;
    end if;
  end loop;
  return true;
exception when others then return false;
end $function$;
alter function private.valid_applied_course_design_parameters_v1(jsonb,jsonb) owner to postgres;
revoke all on function private.valid_applied_course_design_parameters_v1(jsonb,jsonb) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.materialize_course_authoring_part_core_v1(p_actor_id uuid, p_course_id uuid, p_authoring_part_id uuid, p_expected_course_revision bigint, p_expected_authoring_part_version bigint, p_units jsonb, p_request_id text, p_request_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_receipt private.course_change_receipts%rowtype;
  v_course public.courses%rowtype;
  v_part private.course_authoring_parts%rowtype;
  v_unit record;
  v_snapshot jsonb;
  v_application jsonb;
  v_resolved_parameters jsonb;
  v_expected_directions jsonb;
  v_expected_policy jsonb;
  v_expected_analysis_ids jsonb;
  v_expected_evidence_ids jsonb;
  v_design_scope_kind text;
  v_design_scope_ref text;
  v_design_path jsonb;
  v_upserts jsonb := '[]'::jsonb;
  v_current_units jsonb := '[]'::jsonb;
  v_source_applications jsonb := '[]'::jsonb;
  v_existing_study_unit_ids text[] := array[]::text[];
  v_existing_unit private.course_entities%rowtype;
  v_composition jsonb;
  v_result jsonb;
  v_design_changes bigint := 0;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_actor_id is null or p_course_id is null or p_authoring_part_id is null
     or p_expected_course_revision is null or p_expected_course_revision < 1
     or p_expected_authoring_part_version is null
     or p_expected_authoring_part_version < 1
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_units) is distinct from 'array'
     or jsonb_array_length(p_units) not between 1 and 64
     or octet_length(p_units::text) > 1572864 then
    raise exception 'Materialização da Parte inválida.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:' || p_actor_id::text || ':' || p_request_id,0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  select * into v_receipt from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'materialize_course_authoring_part_v1'
       or v_receipt.course_id <> p_course_id
       or v_receipt.request_hash <> p_request_hash then
      raise exception 'requestId reutilizado com materialização incompatível.'
        using errcode = '23514';
    end if;
    return (v_receipt.result - 'idempotent')
      || jsonb_build_object('idempotent',true);
  end if;

  perform 1 from auth.users actor where actor.id=p_actor_id for key share;
  if not found then
    raise exception 'Pessoa inexistente ou inacessível.' using errcode='PT404';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'course-row:'||p_course_id::text,0
  ));
  select * into strict v_course
  from public.courses course where course.id = p_course_id for update;
  if v_course.revision <> p_expected_course_revision then
    raise exception 'O Curso mudou; releia antes de materializar a Parte.'
      using errcode = '40001';
  end if;
  select * into v_part
  from private.course_authoring_parts part
  where part.course_id = p_course_id
    and part.id = p_authoring_part_id
  for update;
  if not found then
    raise exception 'Parte inexistente.' using errcode = 'PT404';
  end if;
  if v_part.version <> p_expected_authoring_part_version then
    raise exception 'A Parte mudou; releia antes de materializá-la.'
      using errcode = '40001';
  end if;
  if (
    select count(*) <> count(distinct unit.value->>'studyUnitId')
      or count(*) <> count(distinct concat_ws(
        chr(31),unit.value->>'didacticMicrosequenceId',unit.value->>'position'
      ))
    from jsonb_array_elements(p_units) unit(value)
  ) then
    raise exception 'A materialização repete Unidade ou posição.'
      using errcode = '22023';
  end if;
  if exists(
    select 1
    from private.course_authoring_part_didactic_microsequences membership
    where membership.course_id=p_course_id
      and membership.authoring_part_id=p_authoring_part_id
      and not exists(
        select 1 from jsonb_array_elements(p_units) unit(value)
        where unit.value->>'didacticMicrosequenceId'
          =membership.didactic_microsequence_id
      )
  ) then
    raise exception 'A materialização precisa cobrir toda Microssequência da Parte.'
      using errcode='23514';
  end if;

  for v_unit in
    select unit.value,unit.ordinal
    from jsonb_array_elements(p_units) with ordinality unit(value,ordinal)
    order by unit.ordinal
  loop
    if jsonb_typeof(v_unit.value) is distinct from 'object'
       or not (v_unit.value ?& array[
         'studyUnitId','position','didacticMicrosequenceId','content',
         'designSnapshot','designApplication','sourceLinks'
       ])
       or v_unit.value - 'studyUnitId' - 'position'
         - 'didacticMicrosequenceId' - 'content' - 'designSnapshot'
         - 'designApplication' - 'sourceLinks' <> '{}'::jsonb
       or jsonb_typeof(v_unit.value->'studyUnitId')<>'string'
       or nullif(btrim(v_unit.value->>'studyUnitId'),'') is null
       or v_unit.value->>'studyUnitId'<>btrim(v_unit.value->>'studyUnitId')
       or char_length(v_unit.value->>'studyUnitId')>240
       or octet_length(v_unit.value->>'studyUnitId')>960
       or v_unit.value->>'studyUnitId'~'[[:cntrl:]]'
       or jsonb_typeof(v_unit.value->'position') <> 'number'
       or (v_unit.value->>'position') !~ '^[1-9][0-9]*$'
       or (v_unit.value->>'position')::bigint > 2147483647
       or nullif(btrim(v_unit.value->>'didacticMicrosequenceId'),'') is null
       or v_unit.value->>'didacticMicrosequenceId'
         <>btrim(v_unit.value->>'didacticMicrosequenceId')
       or char_length(v_unit.value->>'didacticMicrosequenceId') > 240
       or octet_length(v_unit.value->>'didacticMicrosequenceId')>960
       or v_unit.value->>'didacticMicrosequenceId'~'[[:cntrl:]]'
       or jsonb_typeof(v_unit.value->'content') is distinct from 'object'
       or v_unit.value->'content' ? 'id'
       or v_unit.value->'content' ? 'position'
       or v_unit.value->'content' ? 'sources'
       or jsonb_typeof(v_unit.value->'designSnapshot') is distinct from 'object'
       or jsonb_typeof(v_unit.value->'designApplication') is distinct from 'object'
       or not private.valid_course_source_links_shape_v2(
         v_unit.value->'sourceLinks'
       ) then
      raise exception 'Unidade materializada inválida.' using errcode = '22023';
    end if;
    if not exists(
      select 1
      from private.course_authoring_part_didactic_microsequences membership
      join private.course_entities microsequence
        on microsequence.course_id = membership.course_id
       and microsequence.entity_type = 'microsequence'
       and microsequence.entity_id = membership.didactic_microsequence_id
      where membership.course_id = p_course_id
        and membership.authoring_part_id = p_authoring_part_id
        and membership.didactic_microsequence_id
          = v_unit.value->>'didacticMicrosequenceId'
    ) then
      raise exception 'A Unidade aponta para Microssequência fora da Parte.'
        using errcode = '22023';
    end if;
    if exists(
      select 1 from private.course_entities entity
      where entity.course_id=p_course_id and entity.entity_type='study_unit'
        and entity.entity_id=v_unit.value->>'studyUnitId'
        and row(entity.parent_type,entity.parent_id,entity.position)
          is distinct from row(
            'microsequence'::text,
            v_unit.value->>'didacticMicrosequenceId',
            (v_unit.value->>'position')::integer
          )
    ) then
      raise exception 'A identidade da Unidade já pertence a outra posição.'
        using errcode='23514';
    end if;
    select * into v_existing_unit
    from private.course_entities entity
    where entity.course_id=p_course_id and entity.entity_type='study_unit'
      and entity.parent_type='microsequence'
      and entity.parent_id=v_unit.value->>'didacticMicrosequenceId'
      and entity.position=(v_unit.value->>'position')::integer
    for update;
    if found then
      if v_existing_unit.entity_id<>v_unit.value->>'studyUnitId' then
        raise exception 'A posição já possui outra Unidade; releia antes de substituir.'
          using errcode='40001';
      end if;
      v_design_scope_kind:='study_unit';
      v_design_scope_ref:=v_existing_unit.entity_id;
    else
      v_design_scope_kind:='didactic_microsequence';
      v_design_scope_ref:=v_unit.value->>'didacticMicrosequenceId';
    end if;
    v_design_path:=private.course_design_scope_path_v1(
      p_course_id,v_design_scope_kind,v_design_scope_ref
    );
    if v_design_path is null then
      raise exception 'O escopo focal da Unidade deixou de existir.'
        using errcode='40001';
    end if;

    v_resolved_parameters:=private.course_current_design_parameters_v1(p_course_id,v_design_path);
    if exists(select 1 from jsonb_array_elements(v_resolved_parameters) parameter where jsonb_array_length(parameter->'conflicts')>0) then
      raise exception 'Resolva o conflito de pesquisa antes de materializar.' using errcode='PD409';
    end if;
    v_snapshot := v_unit.value->'designSnapshot';
    v_application := v_unit.value->'designApplication';
    if v_snapshot - 'contract' - 'parameterCatalogVersion' - 'didacticMicrosequenceId'
         - 'instructionalAnalysisUnitIds' - 'evidenceRequirementIds'
         - 'parameters' - 'editorialDirections' - 'componentPolicy' <> '{}'::jsonb
       or not (v_snapshot ?& array[
         'contract','parameterCatalogVersion','didacticMicrosequenceId','instructionalAnalysisUnitIds',
         'evidenceRequirementIds','parameters','editorialDirections',
         'componentPolicy'
       ])
       or v_snapshot->>'contract'
         <> 'aralearn.study-unit-design-snapshot.v2'
       or v_snapshot->>'parameterCatalogVersion'<>'1.2.0'
       or v_snapshot->>'didacticMicrosequenceId'
         <> v_unit.value->>'didacticMicrosequenceId'
       or jsonb_typeof(v_snapshot->'instructionalAnalysisUnitIds') <> 'array'
       or jsonb_typeof(v_snapshot->'evidenceRequirementIds') <> 'array'
       or jsonb_typeof(v_snapshot->'parameters') <> 'array'
       or jsonb_array_length(v_snapshot->'parameters') <> (select count(*) from private.course_design_parameter_definitions)
       or jsonb_typeof(v_snapshot->'editorialDirections') <> 'array'
       or jsonb_typeof(v_snapshot->'componentPolicy') <> 'object'
       or octet_length(v_snapshot::text) > 65536
       or v_application - 'mode'
         - 'introducedInstructionalAnalysisUnitIds'
         - 'explanationApplications' - 'practiceApplications'
         - 'componentRefs' <> '{}'::jsonb
       or not (v_application ?& array[
         'mode','introducedInstructionalAnalysisUnitIds',
         'explanationApplications','practiceApplications','componentRefs'
       ])
       or v_application->>'mode' not in('expository','practice','mixed')
       or jsonb_typeof(v_application->'introducedInstructionalAnalysisUnitIds') <> 'array'
       or jsonb_typeof(v_application->'explanationApplications') <> 'array'
       or jsonb_typeof(v_application->'practiceApplications') <> 'array'
       or jsonb_typeof(v_application->'componentRefs') <> 'array'
       or octet_length(v_application::text) > 65536 then
      raise exception 'Aplicação pedagógica focal inválida.' using errcode = '22023';
    end if;

    select coalesce(jsonb_agg(to_jsonb(assignment.plan_item_id)
      order by item.position,item.id),'[]'::jsonb)
      into v_expected_analysis_ids
    from private.course_design_target_plan_items assignment
    join private.course_instructional_plan_items item
      on item.course_id = assignment.course_id
     and item.id = assignment.plan_item_id
     and item.item_kind = assignment.plan_item_kind
    where assignment.course_id = p_course_id
      and assignment.didactic_microsequence_id
        = v_unit.value->>'didacticMicrosequenceId'
      and assignment.plan_item_kind = 'instructional_analysis_unit';
    select coalesce(jsonb_agg(to_jsonb(assignment.plan_item_id)
      order by item.position,item.id),'[]'::jsonb)
      into v_expected_evidence_ids
    from private.course_design_target_plan_items assignment
    join private.course_instructional_plan_items item
      on item.course_id = assignment.course_id
     and item.id = assignment.plan_item_id
     and item.item_kind = assignment.plan_item_kind
    where assignment.course_id = p_course_id
      and assignment.didactic_microsequence_id
        = v_unit.value->>'didacticMicrosequenceId'
      and assignment.plan_item_kind = 'evidence_requirement';
    if v_snapshot->'instructionalAnalysisUnitIds' <> v_expected_analysis_ids
       or v_snapshot->'evidenceRequirementIds' <> v_expected_evidence_ids then
      raise exception 'O recorte pedagógico divergiu do plano corrente.'
        using errcode = '40001';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'direction',direction.value->>'guidance',
      'origin',direction.value->>'origin',
      'sourceScopeKind',direction.value#>>'{sourceScope,kind}'
    ) order by direction.ordinal),'[]'::jsonb)
      into v_expected_directions
    from jsonb_array_elements(private.course_current_authoring_guidance_v1(
      p_course_id,v_design_path
    )->'effectiveAssignments') with ordinality direction(value,ordinal);
    select jsonb_build_object(
      'policy',effective.value->'policy',
      'origin',effective.value->>'origin',
      'sourceScopeKind',effective.value#>>'{sourceScope,kind}'
    ) into v_expected_policy
    from jsonb_array_elements(jsonb_build_array(
      private.course_current_component_policy_v1(
        p_course_id,v_design_path
      )->'effectiveAssignment'
    )) effective(value);
    if not private.valid_applied_course_design_parameters_v1(v_snapshot->'parameters',v_resolved_parameters) then
      raise exception 'A escolha aplicada é inválida ou altera uma fixação.' using errcode='22023';
    end if;
    if v_snapshot->'componentPolicy'<>v_expected_policy or (
      v_snapshot->'editorialDirections'<>v_expected_directions and (
        exists(select 1 from private.course_entities unit where unit.course_id=p_course_id and unit.entity_type='study_unit' and unit.entity_id=v_unit.value->>'studyUnitId')
        or coalesce((select jsonb_agg(direction.value order by direction.ordinal) from jsonb_array_elements(v_snapshot->'editorialDirections') with ordinality direction(value,ordinal) where direction.value->>'sourceScopeKind' is distinct from 'study_unit'),'[]'::jsonb)<>v_expected_directions
      )
    ) then raise exception 'A direção editorial ou política de componentes divergiu da configuração corrente.' using errcode='40001'; end if;
    if exists(
      select 1
      from jsonb_array_elements_text(
        v_application->'introducedInstructionalAnalysisUnitIds'
      ) introduced(value)
      where not (v_expected_analysis_ids ? introduced.value::text)
    ) or exists(
      select 1
      from jsonb_array_elements(v_application->'explanationApplications') explanation(value)
      where not (v_expected_analysis_ids
        ? (explanation.value->>'instructionalAnalysisUnitId')::text)
    ) or exists(
      select 1
      from jsonb_array_elements(v_application->'practiceApplications') practice(value)
      where not (v_expected_evidence_ids
        ? (practice.value->>'evidenceRequirementId')::text)
    ) or v_application->'componentRefs'
      <> to_jsonb(private.course_component_refs_from_content_v1(
        v_unit.value->'content'
      )) then
      raise exception 'A aplicação pedagógica referencia fatos fora do recorte.'
        using errcode = '22023';
    end if;

    v_upserts := v_upserts || jsonb_build_array(jsonb_build_object(
      'entityType','study_unit',
      'entityId',v_unit.value->>'studyUnitId',
      'parentType','microsequence',
      'parentId',v_unit.value->>'didacticMicrosequenceId',
      'position',(v_unit.value->>'position')::integer,
      'content',v_unit.value->'content'
    ));
    v_source_applications := v_source_applications || jsonb_build_array(
      jsonb_build_object(
        'studyUnitId',v_unit.value->>'studyUnitId',
        'sourceLinks',v_unit.value->'sourceLinks'
      )
    );
    v_current_units:=v_current_units||jsonb_build_array(v_unit.value);
  end loop;

  perform private.assert_course_materialization_pedagogy_v1(
    p_course_id,p_units
  );
  if exists(
    select 1 from private.course_entities entity
    where entity.course_id=p_course_id and entity.entity_type='study_unit'
      and entity.parent_type='microsequence'
      and exists(
        select 1
        from private.course_authoring_part_didactic_microsequences membership
        where membership.course_id=p_course_id
          and membership.authoring_part_id=p_authoring_part_id
          and membership.didactic_microsequence_id=entity.parent_id
      )
      and not exists(
        select 1 from jsonb_array_elements(v_current_units) unit(value)
        where unit.value->>'studyUnitId'=entity.entity_id
      )
  ) then
    raise exception 'A substituição precisa representar toda Unidade corrente da Parte.'
      using errcode='23514';
  end if;
  select coalesce(array_agg(entity.entity_id),array[]::text[])
    into v_existing_study_unit_ids
  from private.course_entities entity
  where entity.course_id=p_course_id and entity.entity_type='study_unit'
    and exists(
      select 1 from jsonb_array_elements(v_current_units) unit(value)
      where unit.value->>'studyUnitId'=entity.entity_id
    );
  v_composition := public.commit_course_composition_for_actor_v1(
    p_actor_id,p_course_id,p_expected_course_revision,
    v_upserts,'[]'::jsonb,v_source_applications,p_request_id
  );
  update private.course_entities entity
  set design_snapshot = jsonb_set(
        unit.value->'designSnapshot','{appliedAt}',to_jsonb(statement_timestamp()),true
      ),
      design_application = jsonb_build_object(
        'contract','aralearn.study-unit-design-application.v1'
      ) || unit.value->'designApplication',
      created_origin = case
        when not (entity.entity_id=any(v_existing_study_unit_ids))
          then coalesce(entity.created_origin,'gpt')
        else entity.created_origin end,
      last_revision_origin = 'gpt'
  from jsonb_array_elements(v_current_units) unit(value)
  where entity.course_id = p_course_id
    and entity.entity_type = 'study_unit'
    and entity.entity_id = unit.value->>'studyUnitId'
    and row(entity.design_snapshot-'appliedAt',entity.design_application,
      entity.last_revision_origin) is distinct from row(
        unit.value->'designSnapshot',
        jsonb_build_object(
          'contract','aralearn.study-unit-design-application.v1'
        ) || unit.value->'designApplication',
        'gpt'::text
      );
  get diagnostics v_design_changes = row_count;
  if v_design_changes > 0
     and coalesce((v_composition->>'createdCount')::integer,0)
       + coalesce((v_composition->>'updatedCount')::integer,0)
       + coalesce((v_composition->>'deletedCount')::integer,0) = 0 then
    update public.courses course
    set revision = course.revision + 1,updated_at = now()
    where course.id = p_course_id returning * into v_course;
  else
    select * into strict v_course
    from public.courses course where course.id = p_course_id;
  end if;

  v_result := jsonb_build_object(
    'contract','aralearn.course-part-materialization.v1',
    'courseId',p_course_id,
    'courseRevision',v_course.revision,
    'authoringPartId',p_authoring_part_id,
    'changed',coalesce((v_composition->>'createdCount')::integer,0)
      + coalesce((v_composition->>'updatedCount')::integer,0)
      + coalesce((v_composition->>'deletedCount')::integer,0)
      + v_design_changes > 0,
    'studyUnitCount',jsonb_array_length(p_units),
    'idempotent',false
  );
  update private.course_change_receipts receipt
  set operation = 'materialize_course_authoring_part_v1',
      request_hash = p_request_hash,
      result = v_result
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id
    and receipt.course_id = p_course_id;
  if not found then
    raise exception 'A materialização não produziu receipt atômico.'
      using errcode = '55000';
  end if;
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.materialize_course_authoring_part_for_actor_v2(p_actor_id uuid, p_course_id uuid, p_authoring_part_id uuid, p_expected_course_revision bigint, p_expected_authoring_part_version bigint, p_plan_item_upserts jsonb, p_target_plan_items jsonb, p_units jsonb, p_request_id text, p_request_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'extensions'
AS $function$
declare
  v_receipt private.course_change_receipts%rowtype;
  v_course public.courses%rowtype;
  v_plan private.course_instructional_plans%rowtype;
  v_part private.course_authoring_parts%rowtype;
  v_before_items jsonb;
  v_after_items jsonb;
  v_before_targets jsonb;
  v_after_targets jsonb;
  v_core_units jsonb;
  v_result jsonb;
  v_new_study_unit_ids text[]:=array[]::text[];
  v_plan_changed boolean:=false;
  v_application_extension_changed boolean:=false;
  v_extra_changed boolean:=false;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_actor_id is null or p_course_id is null or p_authoring_part_id is null
     or p_expected_course_revision is null or p_expected_course_revision<1
     or p_expected_authoring_part_version is null
     or p_expected_authoring_part_version<1
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_plan_item_upserts)<>'array'
     or jsonb_array_length(p_plan_item_upserts)>256
     or jsonb_typeof(p_target_plan_items)<>'array'
     or jsonb_array_length(p_target_plan_items) not between 1 and 32
     or jsonb_typeof(p_units)<>'array'
     or jsonb_array_length(p_units) not between 1 and 64
     or octet_length(p_plan_item_upserts::text)>524288
     or octet_length(p_target_plan_items::text)>524288
     or octet_length(p_units::text)>1572864 then
    raise exception 'Materializacao do lote invalida.' using errcode='22023';
  end if;
  if exists(
    select 1 from jsonb_array_elements(p_plan_item_upserts) item(value)
    where jsonb_typeof(item.value)<>'object'
      or item.value ?& array['id','kind','position','statement','description'] is not true
      or item.value-'id'-'kind'-'position'-'statement'-'description'<>'{}'::jsonb
      or jsonb_typeof(item.value->'id')<>'string'
      or (item.value->>'id') !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or item.value->>'kind' not in(
        'instructional_analysis_unit','evidence_requirement'
      )
      or jsonb_typeof(item.value->'position')<>'number'
      or (item.value->>'position') !~ '^(0|[1-9][0-9]{0,8})$'
      or nullif(btrim(item.value->>'statement'),'') is null
      or item.value->>'statement'<>btrim(item.value->>'statement')
      or char_length(item.value->>'statement')>2000
      or translate(item.value->>'statement',E'\n\r\t','') ~ '[[:cntrl:]]'
      or jsonb_typeof(item.value->'description')<>'string'
      or char_length(item.value->>'description')>4000
      or translate(item.value->>'description',E'\n\r\t','') ~ '[[:cntrl:]]'
  ) or (
    select count(*)<>count(distinct item.value->>'id')
    from jsonb_array_elements(p_plan_item_upserts) item(value)
  ) or exists(
    select 1 from jsonb_array_elements(p_target_plan_items) target(value)
    where jsonb_typeof(target.value)<>'object'
      or target.value ?& array[
        'didacticMicrosequenceId','instructionalAnalysisUnitIds',
        'evidenceRequirementIds'
      ] is not true
      or target.value-'didacticMicrosequenceId'-'instructionalAnalysisUnitIds'
        -'evidenceRequirementIds'<>'{}'::jsonb
      or jsonb_typeof(target.value->'didacticMicrosequenceId')<>'string'
      or nullif(btrim(target.value->>'didacticMicrosequenceId'),'') is null
      or target.value->>'didacticMicrosequenceId'
        <>btrim(target.value->>'didacticMicrosequenceId')
      or char_length(target.value->>'didacticMicrosequenceId')>240
      or jsonb_typeof(target.value->'instructionalAnalysisUnitIds')<>'array'
      or jsonb_array_length(target.value->'instructionalAnalysisUnitIds')>64
      or jsonb_typeof(target.value->'evidenceRequirementIds')<>'array'
      or jsonb_array_length(target.value->'evidenceRequirementIds')>64
      or exists(
        select 1 from (
          select id.value from jsonb_array_elements(
            target.value->'instructionalAnalysisUnitIds'
          ) id(value)
          union all
          select id.value from jsonb_array_elements(
            target.value->'evidenceRequirementIds'
          ) id(value)
        ) identifier
        where jsonb_typeof(identifier.value)<>'string'
          or (identifier.value#>>'{}') !~
            '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
      or (
        select count(*)<>count(distinct id.value#>>'{}')
        from jsonb_array_elements(
          target.value->'instructionalAnalysisUnitIds'
        ) id(value)
      )
      or (
        select count(*)<>count(distinct id.value#>>'{}')
        from jsonb_array_elements(
          target.value->'evidenceRequirementIds'
        ) id(value)
      )
  ) or (
    select count(*)<>count(distinct target.value->>'didacticMicrosequenceId')
    from jsonb_array_elements(p_target_plan_items) target(value)
  ) or exists(
    select 1 from jsonb_array_elements(p_units) unit(value)
    where jsonb_typeof(unit.value)<>'object'
      or jsonb_typeof(unit.value->'designApplication')<>'object'
      or unit.value->'designApplication' ?& array[
        'mode','introducedInstructionalAnalysisUnitIds',
        'usedInstructionalAnalysisUnitIds','curriculumScopeItemIds',
        'explanationApplications','practiceApplications','componentRefs'
      ] is not true
      or (unit.value->'designApplication')-'mode'
        -'introducedInstructionalAnalysisUnitIds'
        -'usedInstructionalAnalysisUnitIds'-'curriculumScopeItemIds'
        -'explanationApplications'-'practiceApplications'-'componentRefs'
          <>'{}'::jsonb
      or jsonb_typeof(unit.value#>'{designApplication,introducedInstructionalAnalysisUnitIds}')<>'array'
      or jsonb_typeof(unit.value#>'{designApplication,usedInstructionalAnalysisUnitIds}')<>'array'
      or jsonb_typeof(unit.value#>'{designApplication,curriculumScopeItemIds}')<>'array'
      or jsonb_typeof(unit.value#>'{designApplication,explanationApplications}')<>'array'
      or jsonb_typeof(unit.value#>'{designApplication,practiceApplications}')<>'array'
      or jsonb_typeof(unit.value#>'{designApplication,componentRefs}')<>'array'
      or exists(
        select 1 from jsonb_array_elements(
          unit.value#>'{designApplication,usedInstructionalAnalysisUnitIds}'
        ) used(value)
        where jsonb_typeof(used.value)<>'string'
          or (used.value#>>'{}') !~
            '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
      or (
        select count(*)<>count(distinct used.value#>>'{}')
        from jsonb_array_elements(
          unit.value#>'{designApplication,usedInstructionalAnalysisUnitIds}'
        ) used(value)
      )
      or exists(
        select 1 from jsonb_array_elements(
          unit.value#>'{designApplication,curriculumScopeItemIds}'
        ) scope_item(value)
        where jsonb_typeof(scope_item.value)<>'string'
          or (scope_item.value#>>'{}') !~
            '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
      or (
        select count(*)<>count(distinct scope_item.value#>>'{}')
        from jsonb_array_elements(
          unit.value#>'{designApplication,curriculumScopeItemIds}'
        ) scope_item(value)
      )
      or exists(
        select 1 from jsonb_array_elements_text(
          unit.value#>'{designApplication,usedInstructionalAnalysisUnitIds}'
        ) used(value)
        where not coalesce(
          unit.value#>'{designSnapshot,instructionalAnalysisUnitIds}' ? used.value,
          false
        )
          or unit.value#>'{designApplication,introducedInstructionalAnalysisUnitIds}'
            ? used.value
          or exists(
            select 1 from jsonb_array_elements(
              unit.value#>'{designApplication,explanationApplications}'
            ) explanation(value)
            where explanation.value->>'instructionalAnalysisUnitId'=used.value
          )
      )
  ) then
    raise exception 'Repertorio ou aplicacao pedagogica invalida.' using errcode='22023';
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
    if v_receipt.operation<>'materialize_course_authoring_part_v2'
       or v_receipt.course_id<>p_course_id
       or v_receipt.request_hash<>p_request_hash then
      raise exception 'requestId reutilizado com materializacao incompatível.'
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
    raise exception 'O curso mudou; releia antes de materializar o lote.'
      using errcode='40001';
  end if;
  select * into strict v_plan from private.course_instructional_plans plan
  where plan.course_id=p_course_id for update;
  if v_plan.curriculum_map_status<>'approved' then
    raise exception 'O mapa curricular precisa estar aprovado antes da materializacao.'
      using errcode='23514';
  end if;
  select * into v_part from private.course_authoring_parts part
  where part.course_id=p_course_id and part.id=p_authoring_part_id for update;
  if not found then
    raise exception 'Lote inexistente.' using errcode='PT404';
  end if;
  if v_part.version<>p_expected_authoring_part_version then
    raise exception 'O lote mudou; releia antes de materializa-lo.'
      using errcode='40001';
  end if;
  if exists(
    select 1 from private.course_authoring_part_didactic_microsequences membership
    where membership.course_id=p_course_id
      and membership.authoring_part_id=p_authoring_part_id
      and not exists(
        select 1 from jsonb_array_elements(p_target_plan_items) target(value)
        where target.value->>'didacticMicrosequenceId'
          =membership.didactic_microsequence_id
      )
  ) or exists(
    select 1 from jsonb_array_elements(p_target_plan_items) target(value)
    where not exists(
      select 1 from private.course_authoring_part_didactic_microsequences membership
      where membership.course_id=p_course_id
        and membership.authoring_part_id=p_authoring_part_id
        and membership.didactic_microsequence_id
          =target.value->>'didacticMicrosequenceId'
    )
  ) then
    raise exception 'O recorte pedagogico precisa corresponder exatamente ao lote.'
      using errcode='23514';
  end if;
  select coalesce(array_agg(unit.value->>'studyUnitId'),array[]::text[])
    into v_new_study_unit_ids
  from jsonb_array_elements(p_units) unit(value)
  where jsonb_typeof(unit.value)='object'
    and jsonb_typeof(unit.value->'studyUnitId')='string'
    and not exists(
      select 1 from private.course_entities current_unit
      where current_unit.course_id=p_course_id
        and current_unit.entity_type='study_unit'
        and current_unit.entity_id=unit.value->>'studyUnitId'
    );
  if exists(
    select 1
    from jsonb_array_elements(p_units) unit(value)
    cross join lateral jsonb_array_elements(case
      when jsonb_typeof(unit.value#>'{designSnapshot,parameters}')='array'
        then unit.value#>'{designSnapshot,parameters}'
      else '[]'::jsonb end
    ) parameter(value)
    where unit.value->>'studyUnitId'=any(v_new_study_unit_ids)
      and parameter.value->>'sourceScopeKind'='study_unit'
      and (
        jsonb_typeof(parameter.value)<>'object'
        or parameter.value ?& array[
          'parameterId','value','origin','reason','sourceScopeKind'
        ] is not true
        or parameter.value-'parameterId'-'value'-'origin'-'reason'-'sourceScopeKind'
          <>'{}'::jsonb
        or parameter.value->>'origin'<>'automatic'
        or not private.valid_course_design_parameter_value_v1(
          parameter.value->>'parameterId',parameter.value->'value'
        )
      )
  ) or exists(
    select 1
    from jsonb_array_elements(p_units) unit(value)
    cross join lateral jsonb_array_elements(case
      when jsonb_typeof(unit.value#>'{designSnapshot,editorialDirections}')='array'
        then unit.value#>'{designSnapshot,editorialDirections}'
      else '[]'::jsonb end
    ) direction(value)
    where unit.value->>'studyUnitId'=any(v_new_study_unit_ids)
      and direction.value->>'sourceScopeKind'='study_unit'
      and (
        jsonb_typeof(direction.value)<>'object'
        or direction.value ?& array[
          'direction','origin','sourceScopeKind'
        ] is not true
        or direction.value-'direction'-'origin'-'sourceScopeKind'<>'{}'::jsonb
        or direction.value->>'origin'<>'automatic'
        or nullif(btrim(direction.value->>'direction'),'') is null
        or octet_length(direction.value->>'direction')>8192
        or translate(direction.value->>'direction',E'\n\r\t','')~'[[:cntrl:]]'
      )
  ) or exists(
    select 1
    from jsonb_array_elements(p_units) unit(value)
    cross join lateral jsonb_array_elements(case
      when jsonb_typeof(unit.value#>'{designSnapshot,parameters}')='array'
        then unit.value#>'{designSnapshot,parameters}'
      else '[]'::jsonb end
    ) parameter(value)
    where unit.value->>'studyUnitId'=any(v_new_study_unit_ids)
      and parameter.value->>'sourceScopeKind'='study_unit'
    group by unit.value->>'studyUnitId',parameter.value->>'parameterId'
    having count(*)>1
  ) or exists(
    select 1
    from jsonb_array_elements(p_units) unit(value)
    cross join lateral jsonb_array_elements(case
      when jsonb_typeof(unit.value#>'{designSnapshot,editorialDirections}')='array'
        then unit.value#>'{designSnapshot,editorialDirections}'
      else '[]'::jsonb end
    ) direction(value)
    where unit.value->>'studyUnitId'=any(v_new_study_unit_ids)
      and direction.value->>'sourceScopeKind'='study_unit'
    group by unit.value->>'studyUnitId'
    having count(*)>1
  ) then
    raise exception 'Calibracao automatica da unidade invalida.' using errcode='22023';
  end if;
  if exists(
    select 1
    from jsonb_array_elements(p_units) unit(value)
    cross join lateral jsonb_array_elements(case
      when jsonb_typeof(unit.value#>'{designSnapshot,parameters}')='array'
        then unit.value#>'{designSnapshot,parameters}'
      else '[]'::jsonb end
    ) parameter(value)
    join private.course_design_parameter_assignments assignment
      on assignment.course_id=p_course_id
     and assignment.parameter_id=parameter.value->>'parameterId'
     and assignment.scope_kind='study_unit'
     and assignment.scope_ref=unit.value->>'studyUnitId'
     and assignment.origin in('author','research_condition')
    where unit.value->>'studyUnitId'=any(v_new_study_unit_ids)
      and parameter.value->>'sourceScopeKind'='study_unit'
  ) or exists(
    select 1
    from jsonb_array_elements(p_units) unit(value)
    cross join lateral jsonb_array_elements(case
      when jsonb_typeof(unit.value#>'{designSnapshot,editorialDirections}')='array'
        then unit.value#>'{designSnapshot,editorialDirections}'
      else '[]'::jsonb end
    ) direction(value)
    join private.course_authoring_guidance_assignments assignment
      on assignment.course_id=p_course_id
     and assignment.scope_kind='study_unit'
     and assignment.scope_ref=unit.value->>'studyUnitId'
     and assignment.origin in('author','research_condition')
    where unit.value->>'studyUnitId'=any(v_new_study_unit_ids)
      and direction.value->>'sourceScopeKind'='study_unit'
  ) then
    raise exception 'Calibracao automatica da unidade conflita com decisao fixada.'
      using errcode='23514';
  end if;
  if exists(
    select 1
    from private.course_authoring_part_didactic_microsequences membership
    join private.course_entities microsequence
      on microsequence.course_id=membership.course_id
     and microsequence.entity_type='microsequence'
     and microsequence.entity_id=membership.didactic_microsequence_id
    cross join lateral jsonb_array_elements_text(coalesce(
      microsequence.content->'dependsOn','[]'::jsonb
    )) dependency(value)
    where membership.course_id=p_course_id
      and membership.authoring_part_id=p_authoring_part_id
      and not exists(
        select 1 from private.course_entities prerequisite_unit
        where prerequisite_unit.course_id=p_course_id
          and prerequisite_unit.entity_type='study_unit'
          and prerequisite_unit.parent_id=dependency.value
      )
      and not exists(
        select 1 from jsonb_array_elements(p_target_plan_items) target(value)
        where target.value->>'didacticMicrosequenceId'=dependency.value
      )
  ) then
    raise exception 'Uma dependencia curricular precisa estar produzida ou integrar o mesmo lote.'
      using errcode='23514';
  end if;
  if exists(
    select 1
    from jsonb_array_elements(p_units) unit(value)
    cross join lateral jsonb_array_elements_text(
      unit.value#>'{designApplication,curriculumScopeItemIds}'
    ) scope_item(value)
    left join private.course_design_target_plan_items assignment
      on assignment.course_id=p_course_id
     and assignment.didactic_microsequence_id
       =unit.value->>'didacticMicrosequenceId'
     and assignment.plan_item_kind='curriculum_scope_item'
     and assignment.plan_item_id=scope_item.value::uuid
    where assignment.plan_item_id is null
  ) then
    raise exception 'A cobertura declarada precisa pertencer ao escopo da Microssequencia.'
      using errcode='23514';
  end if;
  if exists(
    select 1
    from private.course_authoring_part_didactic_microsequences membership
    join private.course_design_target_plan_items assignment
      on assignment.course_id=membership.course_id
     and assignment.didactic_microsequence_id=membership.didactic_microsequence_id
     and assignment.plan_item_kind='curriculum_scope_item'
    where membership.course_id=p_course_id
      and membership.authoring_part_id=p_authoring_part_id
      and not exists(
        select 1 from jsonb_array_elements(p_units) unit(value)
        where unit.value->>'didacticMicrosequenceId'
            =membership.didactic_microsequence_id
          and unit.value#>'{designApplication,curriculumScopeItemIds}'
            ? assignment.plan_item_id::text
      )
  ) then
    raise exception 'Todo item de escopo atribuido precisa ser desenvolvido na Microssequencia.'
      using errcode='23514';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',item.id,'kind',item.item_kind,'position',item.position,
    'statement',item.statement,'description',item.description
  ) order by item.item_kind,item.position,item.id),'[]'::jsonb)
  into v_before_items
  from private.course_instructional_plan_items item
  where item.course_id=p_course_id
    and item.item_kind in('instructional_analysis_unit','evidence_requirement');
  select coalesce(jsonb_agg(jsonb_build_object(
    'microsequenceId',assignment.didactic_microsequence_id,
    'id',assignment.plan_item_id,'kind',assignment.plan_item_kind
  ) order by assignment.didactic_microsequence_id,
    assignment.plan_item_kind,assignment.plan_item_id),'[]'::jsonb)
  into v_before_targets
  from private.course_design_target_plan_items assignment
  where assignment.course_id=p_course_id
    and assignment.plan_item_kind in(
      'instructional_analysis_unit','evidence_requirement'
    ) and exists(
      select 1 from jsonb_array_elements(p_target_plan_items) target(value)
      where target.value->>'didacticMicrosequenceId'
        =assignment.didactic_microsequence_id
    );

  if exists(
    select 1 from jsonb_array_elements(p_plan_item_upserts) supplied(value)
    join private.course_instructional_plan_items existing
      on existing.id=(supplied.value->>'id')::uuid
    where existing.course_id<>p_course_id
      or existing.instructional_plan_id<>v_plan.id
      or existing.item_kind<>supplied.value->>'kind'
  ) then
    raise exception 'Uma ideia ou criterio pertence a outro planejamento.'
      using errcode='23514';
  end if;
  insert into private.course_instructional_plan_items(
    id,course_id,instructional_plan_id,item_kind,position,statement,description
  )
  select (item.value->>'id')::uuid,p_course_id,v_plan.id,item.value->>'kind',
    (item.value->>'position')::integer,item.value->>'statement',
    item.value->>'description'
  from jsonb_array_elements(p_plan_item_upserts) item(value)
  on conflict(id) do update set
    position=excluded.position,statement=excluded.statement,
    description=excluded.description,
    version=course_instructional_plan_items.version+1,updated_at=now()
  where row(course_instructional_plan_items.position,
    course_instructional_plan_items.statement,
    course_instructional_plan_items.description) is distinct from row(
    excluded.position,excluded.statement,excluded.description
  );

  if exists(
    select 1 from jsonb_array_elements(p_target_plan_items) target(value)
    cross join lateral(
      select id.value as item_id,'instructional_analysis_unit'::text as kind
      from jsonb_array_elements_text(
        target.value->'instructionalAnalysisUnitIds'
      ) id(value)
      union all
      select id.value,'evidence_requirement'
      from jsonb_array_elements_text(target.value->'evidenceRequirementIds') id(value)
    ) requested
    left join private.course_instructional_plan_items item
      on item.course_id=p_course_id and item.id=requested.item_id::uuid
     and item.item_kind=requested.kind
    where item.id is null
  ) then
    raise exception 'O recorte referencia ideia ou criterio inexistente.'
      using errcode='23514';
  end if;
  delete from private.course_design_target_plan_items assignment
  where assignment.course_id=p_course_id
    and assignment.plan_item_kind in(
      'instructional_analysis_unit','evidence_requirement'
    ) and exists(
      select 1 from jsonb_array_elements(p_target_plan_items) target(value)
      where target.value->>'didacticMicrosequenceId'
        =assignment.didactic_microsequence_id
    );
  insert into private.course_design_target_plan_items(
    course_id,didactic_microsequence_id,plan_item_id,plan_item_kind
  )
  select p_course_id,target.value->>'didacticMicrosequenceId',
    requested.item_id::uuid,requested.kind
  from jsonb_array_elements(p_target_plan_items) target(value)
  cross join lateral(
    select id.value as item_id,'instructional_analysis_unit'::text as kind
    from jsonb_array_elements_text(
      target.value->'instructionalAnalysisUnitIds'
    ) id(value)
    union all
    select id.value,'evidence_requirement'
    from jsonb_array_elements_text(target.value->'evidenceRequirementIds') id(value)
  ) requested;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',item.id,'kind',item.item_kind,'position',item.position,
    'statement',item.statement,'description',item.description
  ) order by item.item_kind,item.position,item.id),'[]'::jsonb)
  into v_after_items
  from private.course_instructional_plan_items item
  where item.course_id=p_course_id
    and item.item_kind in('instructional_analysis_unit','evidence_requirement');
  select coalesce(jsonb_agg(jsonb_build_object(
    'microsequenceId',assignment.didactic_microsequence_id,
    'id',assignment.plan_item_id,'kind',assignment.plan_item_kind
  ) order by assignment.didactic_microsequence_id,
    assignment.plan_item_kind,assignment.plan_item_id),'[]'::jsonb)
  into v_after_targets
  from private.course_design_target_plan_items assignment
  where assignment.course_id=p_course_id
    and assignment.plan_item_kind in(
      'instructional_analysis_unit','evidence_requirement'
    ) and exists(
      select 1 from jsonb_array_elements(p_target_plan_items) target(value)
      where target.value->>'didacticMicrosequenceId'
        =assignment.didactic_microsequence_id
    );
  v_plan_changed:=v_before_items is distinct from v_after_items
    or v_before_targets is distinct from v_after_targets;

  -- Valide o repertorio no estado final inteiro, e nao apenas no lote
  -- recebido. Assim uma rematerializacao anterior nao pode apagar ou mover a
  -- unica introducao ainda utilizada ou retomada por unidades posteriores.
  if exists(
    with incoming_units as materialized(
      select unit.value->>'studyUnitId' as study_unit_id,
        unit.value->'designApplication' as application,
        module_value.position as module_position,
        lesson.position as lesson_position,microsequence.position as micro_position,
        (unit.value->>'position')::integer as unit_position
      from jsonb_array_elements(p_units) unit(value)
      join private.course_authoring_part_didactic_microsequences membership
        on membership.course_id=p_course_id
       and membership.authoring_part_id=p_authoring_part_id
       and membership.didactic_microsequence_id
         =unit.value->>'didacticMicrosequenceId'
      join private.course_entities microsequence
        on microsequence.course_id=membership.course_id
       and microsequence.entity_type='microsequence'
       and microsequence.entity_id=membership.didactic_microsequence_id
      join private.course_entities lesson
        on lesson.course_id=microsequence.course_id
       and lesson.entity_type='lesson' and lesson.entity_id=microsequence.parent_id
      join private.course_entities module_value
        on module_value.course_id=lesson.course_id
       and module_value.entity_type='module' and module_value.entity_id=lesson.parent_id
    ), preserved_units as materialized(
      select unit.entity_id as study_unit_id,unit.design_application as application,
        module_value.position as module_position,
        lesson.position as lesson_position,microsequence.position as micro_position,
        unit.position as unit_position
      from private.course_entities unit
      join private.course_entities microsequence
        on microsequence.course_id=unit.course_id
       and microsequence.entity_type='microsequence'
       and microsequence.entity_id=unit.parent_id
      join private.course_entities lesson
        on lesson.course_id=microsequence.course_id
       and lesson.entity_type='lesson' and lesson.entity_id=microsequence.parent_id
      join private.course_entities module_value
        on module_value.course_id=lesson.course_id
       and module_value.entity_type='module' and module_value.entity_id=lesson.parent_id
      where unit.course_id=p_course_id and unit.entity_type='study_unit'
        and unit.design_application is not null
        and not exists(
          select 1 from incoming_units incoming
          where incoming.study_unit_id=unit.entity_id
        )
    ), final_units as materialized(
      select * from incoming_units
      union all
      select * from preserved_units
    ), introductions as materialized(
      select introduced.value as analysis_id,unit.module_position,
        unit.lesson_position,unit.micro_position,unit.unit_position
      from final_units unit
      cross join lateral jsonb_array_elements_text(coalesce(
        unit.application->'introducedInstructionalAnalysisUnitIds','[]'::jsonb
      )) introduced(value)
    ), idea_references as materialized(
      select used.value as analysis_id,unit.module_position,
        unit.lesson_position,unit.micro_position,unit.unit_position
      from final_units unit
      cross join lateral jsonb_array_elements_text(coalesce(
        unit.application->'usedInstructionalAnalysisUnitIds','[]'::jsonb
      )) used(value)
      union all
      select explanation.value->>'instructionalAnalysisUnitId',unit.module_position,
        unit.lesson_position,unit.micro_position,unit.unit_position
      from final_units unit
      cross join lateral jsonb_array_elements(coalesce(
        unit.application->'explanationApplications','[]'::jsonb
      )) explanation(value)
      where not (coalesce(
        unit.application->'introducedInstructionalAnalysisUnitIds','[]'::jsonb
      ) ? (explanation.value->>'instructionalAnalysisUnitId'))
    )
    select 1 from introductions introduction
    group by introduction.analysis_id
    having count(*)>1
    union all
    select 1 from idea_references reference
    where not exists(
      select 1 from introductions established
      where established.analysis_id=reference.analysis_id
        and row(established.module_position,established.lesson_position,
          established.micro_position,established.unit_position)
          <row(reference.module_position,reference.lesson_position,
          reference.micro_position,reference.unit_position)
    )
  ) then
    raise exception 'Uma ideia foi usada antes de ser ensinada ou introduzida novamente.'
      using errcode='23514';
  end if;

  select exists(
    select 1 from jsonb_array_elements(p_units) incoming(value)
    join private.course_entities current
      on current.course_id=p_course_id and current.entity_type='study_unit'
     and current.entity_id=incoming.value->>'studyUnitId'
    where coalesce(
      current.design_application->'usedInstructionalAnalysisUnitIds','[]'::jsonb
    ) is distinct from incoming.value#>'{designApplication,usedInstructionalAnalysisUnitIds}'
      or coalesce(
        current.design_application->'curriculumScopeItemIds','[]'::jsonb
      ) is distinct from incoming.value#>'{designApplication,curriculumScopeItemIds}'
  ) into v_application_extension_changed;

  -- O nucleo valida e grava o restante do recorte. A classificacao explicita
  -- de uso e cobertura e restaurada ainda na mesma transacao.
  select coalesce(jsonb_agg(
    jsonb_set(unit.value,'{designApplication}',
      (unit.value->'designApplication')-'usedInstructionalAnalysisUnitIds'
        -'curriculumScopeItemIds',true)
    order by unit.ordinal
  ),'[]'::jsonb) into v_core_units
  from jsonb_array_elements(p_units) with ordinality unit(value,ordinal);
  update private.course_entities current
  set design_application=current.design_application
    -'usedInstructionalAnalysisUnitIds'-'curriculumScopeItemIds'
  from jsonb_array_elements(p_units) incoming(value)
  where current.course_id=p_course_id and current.entity_type='study_unit'
    and current.entity_id=incoming.value->>'studyUnitId'
    and current.design_application is not null;

  v_result:=private.materialize_course_authoring_part_core_v1(
    p_actor_id,p_course_id,p_authoring_part_id,p_expected_course_revision,
    p_expected_authoring_part_version,v_core_units,p_request_id,p_request_hash
  );
  insert into private.course_design_parameter_assignments(
    course_id,parameter_id,scope_kind,scope_ref,value,origin,reason,mode
  )
  select p_course_id,parameter.value->>'parameterId','study_unit',
    unit.value->>'studyUnitId',parameter.value->'value','automatic',
    parameter.value->>'reason','automatic'
  from jsonb_array_elements(p_units) unit(value)
  cross join lateral jsonb_array_elements(
    unit.value#>'{designSnapshot,parameters}'
  ) parameter(value)
  where unit.value->>'studyUnitId'=any(v_new_study_unit_ids)
    and parameter.value->>'sourceScopeKind'='study_unit'
  on conflict(course_id,parameter_id,scope_kind,scope_ref) do update set
    value=excluded.value,origin=excluded.origin,reason=excluded.reason,mode=excluded.mode,
    updated_at=now()
  where course_design_parameter_assignments.mode='automatic'
    and row(course_design_parameter_assignments.value,
      course_design_parameter_assignments.origin,
      course_design_parameter_assignments.reason)
      is distinct from row(excluded.value,excluded.origin,excluded.reason);
  insert into private.course_authoring_guidance_assignments(
    course_id,scope_kind,scope_ref,guidance,origin,reason
  )
  select p_course_id,'study_unit',unit.value->>'studyUnitId',
    direction.value->>'direction','automatic',
    'Direcao editorial calibrada automaticamente para esta unidade de estudo.'
  from jsonb_array_elements(p_units) unit(value)
  cross join lateral jsonb_array_elements(
    unit.value#>'{designSnapshot,editorialDirections}'
  ) direction(value)
  where unit.value->>'studyUnitId'=any(v_new_study_unit_ids)
    and direction.value->>'sourceScopeKind'='study_unit'
  on conflict(course_id,scope_kind,scope_ref) do update set
    guidance=excluded.guidance,origin=excluded.origin,reason=excluded.reason,
    updated_at=now()
  where course_authoring_guidance_assignments.origin
      not in('author','research_condition')
    and row(course_authoring_guidance_assignments.guidance,
      course_authoring_guidance_assignments.origin,
      course_authoring_guidance_assignments.reason)
      is distinct from row(excluded.guidance,excluded.origin,excluded.reason);
  update private.course_entities current
  set design_application=jsonb_set(
    jsonb_set(
      current.design_application,'{usedInstructionalAnalysisUnitIds}',
      incoming.value#>'{designApplication,usedInstructionalAnalysisUnitIds}',true
    ),'{curriculumScopeItemIds}',
    incoming.value#>'{designApplication,curriculumScopeItemIds}',true
  )
  from jsonb_array_elements(p_units) incoming(value)
  where current.course_id=p_course_id and current.entity_type='study_unit'
    and current.entity_id=incoming.value->>'studyUnitId';

  if v_plan_changed then
    update private.course_instructional_plans plan
    set version=version+1,updated_at=now()
    where plan.id=v_plan.id;
  end if;
  v_extra_changed:=v_plan_changed or v_application_extension_changed;
  if v_extra_changed and not (v_result->>'changed')::boolean then
    update public.courses course
    set revision=revision+1,updated_at=now()
    where course.id=p_course_id returning * into v_course;
    v_result:=jsonb_set(v_result,'{changed}','true'::jsonb,true);
    v_result:=jsonb_set(v_result,'{courseRevision}',to_jsonb(v_course.revision),true);
  end if;
  update private.course_change_receipts receipt
  set operation='materialize_course_authoring_part_v2',
    request_hash=p_request_hash,result=v_result
  where receipt.actor_id=p_actor_id and receipt.request_id=p_request_id
    and receipt.course_id=p_course_id;
  if not found then
    raise exception 'A materializacao nao produziu confirmacao atomica.'
      using errcode='55000';
  end if;
  return v_result;
end;
$function$;

-- A projeção corrente identifica o conjunto realmente instalado.
do $manifest$
declare manifest jsonb;
begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260905083846');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L','select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
commit;
