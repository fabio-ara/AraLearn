begin;
set local lock_timeout='5s';
set local statement_timeout='5min';

-- NULL preserves the historical projection; every incremental write records an
-- explicit decision. A nonempty fragment is never promoted by counting units.
alter table private.course_authoring_parts add column materialization_complete boolean;

create function private.prepare_incremental_course_part_v1(
  p_course_id uuid,p_part_id uuid,p_units jsonb,p_placements jsonb,p_complete boolean,p_targets jsonb
) returns boolean language plpgsql security definer set search_path=pg_catalog,private as $function$
declare all_units jsonb; moved bigint;
begin
  if p_complete is null or jsonb_typeof(p_placements) is distinct from 'array'
    or jsonb_array_length(p_placements)<1 or octet_length(p_placements::text)>1572864
    or exists(select 1 from jsonb_array_elements(p_placements) entry where
      jsonb_typeof(entry) is distinct from 'object'
      or not(entry ?& array['studyUnitId','didacticMicrosequenceId','position'])
      or entry-array['studyUnitId','didacticMicrosequenceId','position']<>'{}'::jsonb
      or jsonb_typeof(entry->'studyUnitId') is distinct from 'string'
      or char_length(entry->>'studyUnitId') not between 1 and 240
      or entry->>'studyUnitId'<>btrim(entry->>'studyUnitId') or entry->>'studyUnitId'~'[[:cntrl:]]'
      or jsonb_typeof(entry->'didacticMicrosequenceId') is distinct from 'string'
      or jsonb_typeof(entry->'position') is distinct from 'number'
      or entry->>'position'!~'^[1-9][0-9]{0,8}$')
    or (select count(*)<>count(distinct entry->>'studyUnitId') from jsonb_array_elements(p_placements) entry)
    or exists(select 1 from jsonb_array_elements(p_placements) entry group by entry->>'didacticMicrosequenceId'
      having min((entry->>'position')::integer)<>1 or max((entry->>'position')::integer)<>count(*)
        or count(distinct entry->>'position')<>count(*)) then
    raise exception 'A ordem final precisa ser distinta e consecutiva por microssequência.' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_placements) entry where not exists(
    select 1 from private.course_authoring_part_didactic_microsequences member
    where member.course_id=p_course_id and member.authoring_part_id=p_part_id
      and member.didactic_microsequence_id=entry->>'didacticMicrosequenceId'))
    or exists(select 1 from jsonb_array_elements(p_placements) entry
      join private.course_entities current on current.course_id=p_course_id and current.entity_type='study_unit'
        and current.entity_id=entry->>'studyUnitId'
      where current.parent_type<>'microsequence' or current.parent_id<>entry->>'didacticMicrosequenceId')
    or exists(select 1 from jsonb_array_elements(p_units) incoming where not exists(
      select 1 from jsonb_array_elements(p_placements) entry where entry->>'studyUnitId'=incoming->>'studyUnitId'
        and entry->>'didacticMicrosequenceId'=incoming->>'didacticMicrosequenceId' and entry->'position'=incoming->'position'))
    or exists(select 1 from jsonb_array_elements(p_placements) entry where not exists(
      select 1 from private.course_entities current where current.course_id=p_course_id and current.entity_type='study_unit'
        and current.entity_id=entry->>'studyUnitId') and not exists(
      select 1 from jsonb_array_elements(p_units) incoming where incoming->>'studyUnitId'=entry->>'studyUnitId'))
    or exists(select 1 from private.course_entities current
      join private.course_authoring_part_didactic_microsequences member on member.course_id=current.course_id
        and member.authoring_part_id=p_part_id and member.didactic_microsequence_id=current.parent_id
      where current.course_id=p_course_id and current.entity_type='study_unit' and not exists(
        select 1 from jsonb_array_elements(p_placements) entry where entry->>'studyUnitId'=current.entity_id)) then
    raise exception 'A ordem final deve conservar todas as unidades e incluir somente as novas unidades enviadas da parte.' using errcode='23514';
  end if;
  -- Materialization consumes the repertoire prepared earlier; it cannot create
  -- or silently change the memberships while discovering a missing reference.
  if exists(
    with supplied as (
      select target->>'didacticMicrosequenceId' micro,id,'instructional_analysis_unit'::text kind
        from jsonb_array_elements(p_targets) target cross join lateral jsonb_array_elements_text(target->'instructionalAnalysisUnitIds') id
      union all select target->>'didacticMicrosequenceId',id,'evidence_requirement'
        from jsonb_array_elements(p_targets) target cross join lateral jsonb_array_elements_text(target->'evidenceRequirementIds') id
    ), current as (
      select assignment.didactic_microsequence_id micro,assignment.plan_item_id::text id,assignment.plan_item_kind kind
      from private.course_design_target_plan_items assignment
      join private.course_authoring_part_didactic_microsequences member on member.course_id=assignment.course_id
        and member.authoring_part_id=p_part_id and member.didactic_microsequence_id=assignment.didactic_microsequence_id
      where assignment.course_id=p_course_id and assignment.plan_item_kind in('instructional_analysis_unit','evidence_requirement')
    ) select * from supplied except select * from current
  ) or exists(
    with supplied as (
      select target->>'didacticMicrosequenceId' micro,id,'instructional_analysis_unit'::text kind
        from jsonb_array_elements(p_targets) target cross join lateral jsonb_array_elements_text(target->'instructionalAnalysisUnitIds') id
      union all select target->>'didacticMicrosequenceId',id,'evidence_requirement'
        from jsonb_array_elements(p_targets) target cross join lateral jsonb_array_elements_text(target->'evidenceRequirementIds') id
    ) select assignment.didactic_microsequence_id,assignment.plan_item_id::text,assignment.plan_item_kind
      from private.course_design_target_plan_items assignment
      join private.course_authoring_part_didactic_microsequences member on member.course_id=assignment.course_id
        and member.authoring_part_id=p_part_id and member.didactic_microsequence_id=assignment.didactic_microsequence_id
      where assignment.course_id=p_course_id and assignment.plan_item_kind in('instructional_analysis_unit','evidence_requirement')
    except select * from supplied
  ) then raise exception 'O repertório e os vínculos precisam estar preparados antes de materializar.' using errcode='23514'; end if;

  select coalesce(jsonb_agg(coalesce(incoming.value,jsonb_build_object(
    'studyUnitId',current.entity_id,'didacticMicrosequenceId',current.parent_id,'position',(entry->>'position')::integer,
    'content',current.content,'designSnapshot',current.design_snapshot-'appliedAt',
    'designApplication',current.design_application-'contract')) order by entry->>'didacticMicrosequenceId',(entry->>'position')::integer),'[]'::jsonb)
    into all_units
  from jsonb_array_elements(p_placements) entry
  left join private.course_entities current on current.course_id=p_course_id and current.entity_type='study_unit'
    and current.entity_id=entry->>'studyUnitId'
  left join lateral(select value from jsonb_array_elements(p_units) where value->>'studyUnitId'=entry->>'studyUnitId') incoming on true;
  if p_complete and (exists(select 1 from jsonb_array_elements(all_units) unit where
      jsonb_typeof(unit->'designApplication') is distinct from 'object' or jsonb_typeof(unit->'designSnapshot') is distinct from 'object')
    or exists(select 1 from private.course_authoring_part_didactic_microsequences member
      where member.course_id=p_course_id and member.authoring_part_id=p_part_id and not exists(
        select 1 from jsonb_array_elements(all_units) unit where unit->>'didacticMicrosequenceId'=member.didactic_microsequence_id))
    or exists(select 1 from private.course_design_target_plan_items assignment
      join private.course_authoring_part_didactic_microsequences member on member.course_id=assignment.course_id
        and member.authoring_part_id=p_part_id and member.didactic_microsequence_id=assignment.didactic_microsequence_id
      where assignment.course_id=p_course_id and assignment.plan_item_kind in('curriculum_scope_item','instructional_analysis_unit') and not exists(
        select 1 from jsonb_array_elements(all_units) unit where unit->>'didacticMicrosequenceId'=assignment.didactic_microsequence_id and
        case assignment.plan_item_kind when 'curriculum_scope_item' then unit#>'{designApplication,curriculumScopeItemIds}' ? assignment.plan_item_id::text
        else unit#>'{designApplication,introducedInstructionalAnalysisUnitIds}' ? assignment.plan_item_id::text
          or unit#>'{designApplication,usedInstructionalAnalysisUnitIds}' ? assignment.plan_item_id::text
          or exists(select 1 from jsonb_array_elements(unit#>'{designApplication,explanationApplications}') explanation
            where explanation->>'instructionalAnalysisUnitId'=assignment.plan_item_id::text) end))) then
    raise exception 'A conclusão exige aplicações e cobertura do conjunto acumulado.' using errcode='23514';
  end if;
  select coalesce(jsonb_agg(unit),'[]'::jsonb) into all_units from jsonb_array_elements(all_units) unit
    where jsonb_typeof(unit->'designApplication')='object' and jsonb_typeof(unit->'designSnapshot')='object';
  perform private.assert_course_application_pedagogy_v1(p_course_id,all_units,p_complete);
  -- Only positions and their versions change for omitted objects. Content,
  -- sources, applied basis, reviews and editorial provenance remain literal.
  update private.course_entities current set position=(entry->>'position')::integer,version=current.version+1
  from jsonb_array_elements(p_placements) entry
  where current.course_id=p_course_id and current.entity_type='study_unit' and current.entity_id=entry->>'studyUnitId'
    and current.position<>(entry->>'position')::integer;
  get diagnostics moved=row_count;
  return moved>0;
end $function$;
revoke all on function private.prepare_incremental_course_part_v1(uuid,uuid,jsonb,jsonb,boolean,jsonb)
  from public,anon,authenticated,service_role;

do $incremental$
declare definition text; before_fragment text; after_fragment text;
begin
  select replace(pg_get_functiondef('private.assert_course_application_pedagogy_v1(uuid,jsonb,boolean)'::regprocedure),E'\r\n',E'\n') into definition;
  before_fragment:='jsonb_array_length(p_units)<1';
  if position(before_fragment in definition)=0 then raise exception 'Limite do conjunto pedagógico divergiu.'; end if;
  before_fragment:=E'  if exists(\n    with introduced as materialized(';
  if position(before_fragment in definition)=0 then raise exception 'Validador de formas divergiu.'; end if;
  execute replace(definition,before_fragment,E'  if p_require_complete_practice and exists(\n    with introduced as materialized(');

  select replace(pg_get_functiondef('private.materialize_course_authoring_part_core_v1(uuid,uuid,uuid,bigint,bigint,jsonb,text,text)'::regprocedure),E'\r\n',E'\n') into definition;
  before_fragment:=$before$  if exists(
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
  end if;$before$;
  if position(before_fragment in definition)=0 then raise exception 'Core divergiu na cobertura da parte.'; end if;
  definition:=replace(definition,before_fragment,'');
  before_fragment:=$before$  perform private.assert_course_materialization_pedagogy_v1(
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
  end if;$before$;
  if position(before_fragment in definition)=0 then raise exception 'Core divergiu na substituição integral.'; end if;
  definition:=replace(definition,before_fragment,'-- O wrapper validou pedagogia no conjunto acumulado sob o mesmo lock.');
  before_fragment:='v_design_changes bigint := 0;';
  if position(before_fragment in definition)=0 then raise exception 'Core divergiu na detecção de autoria.'; end if;
  definition:=replace(definition,before_fragment,before_fragment||' v_authored_ids text[]:=array[]::text[];');
  before_fragment:='v_composition := public.commit_course_composition_for_actor_v1(';
  if position(before_fragment in definition)=0 then raise exception 'Core divergiu no limite de composição.'; end if;
  definition:=replace(definition,before_fragment,$after$select coalesce(array_agg(entity.entity_id),array[]::text[]) into v_authored_ids
  from private.course_entities entity join jsonb_array_elements(p_units) incoming(value)
    on entity.course_id=p_course_id and entity.entity_type='study_unit' and entity.entity_id=incoming.value->>'studyUnitId'
  where entity.content is distinct from incoming.value->'content';
  $after$||before_fragment);
  before_fragment:=$before$    and row(entity.design_snapshot-'appliedAt',entity.design_application,
      entity.last_revision_origin) is distinct from row(
        unit.value->'designSnapshot',
        jsonb_build_object(
          'contract','aralearn.study-unit-design-application.v1'
        ) || (unit.value->'designApplication'),
        'ai'::text
      );$before$;
  after_fragment:=$after$    and (entity.entity_id=any(v_authored_ids) or row(entity.design_snapshot-'appliedAt',entity.design_application)
      is distinct from row(unit.value->'designSnapshot',jsonb_build_object(
        'contract','aralearn.study-unit-design-application.v1') || (unit.value->'designApplication')));$after$;
  if position(before_fragment in definition)=0 then raise exception 'Core divergiu na origem sem efeito material.'; end if;
  definition:=replace(definition,before_fragment,after_fragment);
  execute definition;

  select replace(pg_get_functiondef('private.save_course_part_explanations_v1(uuid,jsonb,jsonb)'::regprocedure),E'\r\n',E'\n') into definition;
  before_fragment:='p_course_id uuid, p_units jsonb, p_explanations jsonb)';
  if position(before_fragment in definition)=0 then raise exception 'Assinatura da explicação divergiu.'; end if;
  definition:=replace(definition,before_fragment,'p_course_id uuid, p_part_id uuid, p_explanations jsonb)');
  before_fragment:='jsonb_array_length(p_explanations) not between 1 and 32';
  if position(before_fragment in definition)=0 then raise exception 'Limite das explicações divergiu.'; end if;
  definition:=replace(definition,before_fragment,'jsonb_array_length(p_explanations) not between 0 and 64');
  before_fragment:=$before$  if (select count(*)<>count(distinct value->>'microsequenceId') from jsonb_array_elements(p_explanations))
    or exists(select 1 from jsonb_array_elements(p_explanations) e where not exists(
      select 1 from jsonb_array_elements(p_units) u where u->>'didacticMicrosequenceId'=e->>'microsequenceId'))
    or exists(select 1 from jsonb_array_elements(p_units) u where not exists(
      select 1 from jsonb_array_elements(p_explanations) e where e->>'microsequenceId'=u->>'didacticMicrosequenceId')) then
    raise exception 'Cada microssequência produzida exige exatamente uma Explicação.' using errcode='23514'; end if;$before$;
  after_fragment:=$after$  if (select count(*)<>count(distinct value->>'microsequenceId') from jsonb_array_elements(p_explanations))
    or exists(select 1 from jsonb_array_elements(p_explanations) e where not exists(
      select 1 from private.course_authoring_part_didactic_microsequences member where member.course_id=p_course_id
        and member.authoring_part_id=p_part_id and member.didactic_microsequence_id=e->>'microsequenceId')) then
    raise exception 'A explicação deve pertencer à parte e aparecer uma única vez.' using errcode='23514'; end if;$after$;
  if position(before_fragment in definition)=0 then raise exception 'Cobertura da explicação divergiu.'; end if;
  definition:=replace(definition,before_fragment,after_fragment);
  before_fragment:='or (v_item->''content'')-array[''title'',''content'']<>''{}''::jsonb';
  if position(before_fragment in definition)=0 then raise exception 'Shape da explicação divergiu.'; end if;
  definition:=replace(definition,before_fragment,'or not private.valid_course_explanation_v1(v_item->''content'')');
  execute definition;

  select replace(pg_get_functiondef('public.materialize_course_authoring_part_for_actor_v2(uuid,uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,jsonb)'::regprocedure),E'\r\n',E'\n') into definition;
  before_fragment:='p_explanations jsonb)';
  if position(before_fragment in definition)=0 then raise exception 'Assinatura do materializador divergiu.'; end if;
  definition:=replace(definition,before_fragment,'p_explanations jsonb, p_complete boolean, p_placements jsonb)');
  definition:=replace(definition,'v_extra_changed boolean:=false;','v_extra_changed boolean:=false; v_placement_changed boolean:=false; v_completion_changed boolean:=false;');
  definition:=replace(definition,'or jsonb_array_length(p_plan_item_upserts)>256','or p_plan_item_upserts<>''[]''::jsonb');
  before_fragment:='jsonb_array_length(p_target_plan_items) not between 1 and 32';
  if position(before_fragment in definition)=0 then raise exception 'Limite das microssequências divergiu.'; end if;
  definition:=replace(definition,before_fragment,'jsonb_array_length(p_target_plan_items) not between 1 and 64');
  before_fragment:=$before$  select coalesce(array_agg(unit.value->>'studyUnitId'),array[]::text[])
    into v_new_study_unit_ids$before$;
  after_fragment:=$after$  v_placement_changed:=private.prepare_incremental_course_part_v1(p_course_id,p_authoring_part_id,p_units,p_placements,p_complete,p_target_plan_items);
  v_completion_changed:=v_part.materialization_complete is distinct from p_complete;
  perform set_config('aralearn.editorial_origin','ai',true);
  perform set_config('aralearn.editorial_actor',p_actor_id::text,true);
  perform set_config('aralearn.editorial_channel','materialization',true);
  select coalesce(array_agg(unit.value->>'studyUnitId'),array[]::text[])
    into v_new_study_unit_ids$after$;
  if position(before_fragment in definition)=0 then raise exception 'Limite de escrita incremental divergiu.'; end if;
  definition:=replace(definition,before_fragment,after_fragment);
  -- Full coverage is checked by the helper using retained + incoming units.
  before_fragment:=$before$  if exists(
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
  end if;$before$;
  if position(before_fragment in definition)=0 then raise exception 'Cobertura curricular divergiu.'; end if;
  definition:=replace(definition,before_fragment,'-- A cobertura curricular foi validada no conjunto acumulado.');
  before_fragment:='private.save_course_part_explanations_v1(p_course_id,p_units,p_explanations)';
  if position(before_fragment in definition)=0 then raise exception 'Gravação das explicações divergiu.'; end if;
  definition:=replace(definition,before_fragment,'private.save_course_part_explanations_v1(p_course_id,p_authoring_part_id,p_explanations)');
  before_fragment:='if v_extra_changed and not (v_result->>''changed'')::boolean then';
  if position(before_fragment in definition)=0 then raise exception 'Revisão final da materialização divergiu.'; end if;
  definition:=replace(definition,before_fragment,$after$update private.course_authoring_parts set materialization_complete=p_complete
    where course_id=p_course_id and id=p_authoring_part_id and materialization_complete is distinct from p_complete;
  v_extra_changed:=v_extra_changed or v_placement_changed or v_completion_changed;
  if v_extra_changed and not (v_result->>'changed')::boolean then$after$);
  execute definition;
  drop function public.materialize_course_authoring_part_for_actor_v2(uuid,uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,jsonb);
  drop function private.save_course_part_explanations_v1(uuid,jsonb,jsonb);

  select pg_get_functiondef('private.course_authoring_part_progress_v1(uuid,uuid)'::regprocedure) into definition;
  before_fragment:='when counts.study_unit_count=0 then ''planned''';
  if position(before_fragment in definition)=0 then raise exception 'Projeção de progresso divergiu.'; end if;
  execute replace(definition,before_fragment,before_fragment||$after$
      when exists(select 1 from private.course_authoring_parts part where part.course_id=p_course_id
        and part.id=p_authoring_part_id and part.materialization_complete=false) then 'partially_materialized'$after$);
end $incremental$;

revoke all on function private.save_course_part_explanations_v1(uuid,uuid,jsonb),
  public.materialize_course_authoring_part_for_actor_v2(uuid,uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,jsonb,boolean,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.materialize_course_authoring_part_for_actor_v2(uuid,uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,jsonb,boolean,jsonb) to service_role;

-- The authorized owner reader budgets the literal applications before choosing
-- a page, retaining the same cursors and maximum-byte contract.
do $projection$
declare definition text; before_fragment text;
begin
  select pg_get_functiondef('private.list_course_study_units_for_actor_v1(uuid,uuid,bigint,text,text,text,text,text,integer,integer,text)'::regprocedure) into definition;
  before_fragment:='''version'', candidate_pool.study_unit_version,';
  if position(before_fragment in definition)=0 then raise exception 'Leitor de aplicação divergiu.'; end if;
  definition:=replace(definition,before_fragment,before_fragment||$after$
        'designApplication', inspected.design_application,
        'designSnapshot', inspected.design_snapshot,$after$);
  before_fragment:='from candidate_pool';
  if position(before_fragment in definition)=0 then raise exception 'Seleção do leitor divergiu.'; end if;
  definition:=replace(definition,before_fragment,before_fragment||$after$
    join private.course_entities inspected on inspected.course_id=p_course_id
      and inspected.entity_type='study_unit' and inspected.entity_id=candidate_pool.entity_id$after$);
  execute definition;
end $projection$;

-- A copy carries the source's explicit completion. Regrouping creates a new
-- accumulation boundary and invalidates completion only in the affected parts.
do $part_consumers$
declare definition text; before_fragment text;
begin
  select pg_get_functiondef('public.copy_course_for_actor_v1(uuid,uuid,bigint,text,boolean,text,timestamptz)'::regprocedure) into definition;
  before_fragment:='insert into private.course_authoring_parts(id,course_id,instructional_plan_id,position,title,intent,version,created_at,updated_at,progression)';
  if position(before_fragment in definition)=0 then raise exception 'Cópia de progresso divergiu.'; end if;
  definition:=replace(definition,before_fragment,'insert into private.course_authoring_parts(id,course_id,instructional_plan_id,position,title,intent,version,created_at,updated_at,progression,materialization_complete)');
  before_fragment:='select (v_parts->>id::text)::uuid,v_id,v_plan_id,position,title,intent,version,created_at,updated_at,progression';
  if position(before_fragment in definition)=0 then raise exception 'Seleção da cópia de progresso divergiu.'; end if;
  execute replace(definition,before_fragment,before_fragment||',materialization_complete');
  select pg_get_functiondef('public.save_course_authoring_part_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,text,text)'::regprocedure) into definition;
  before_fragment:=E'    delete from private.course_authoring_parts part\n    where part.course_id=p_course_id and part.id=any(v_donor_ids)';
  if position(before_fragment in definition)=0 then raise exception 'Reorganização do progresso divergiu.'; end if;
  execute replace(definition,before_fragment,$after$    if v_before->'microsequences' is distinct from p_part->'microsequences' then
      update private.course_authoring_parts set materialization_complete=false
      where course_id=p_course_id and (id=v_part_id or id=any(v_donor_ids));
    end if;
$after$||before_fragment);
end $part_consumers$;

-- Reconciliation is an authoring declaration, not part of the study document.
-- Keep the private/owner readers intact for export, editing and course copies.
-- Replacing this existing wrapper also retains its anon/authenticated grants.
create or replace function public.list_course_entities_v1(
  p_course_id uuid,
  p_expected_revision bigint,
  p_limit integer default 500,
  p_after_entity_type text default null,
  p_after_entity_id text default null
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private, auth
as $function$
  with page as materialized (
    select private.list_course_entities_for_actor_v1(
      auth.uid(), p_course_id, p_expected_revision, p_limit,
      p_after_entity_type, p_after_entity_id
    ) as value
  )
  select jsonb_set(page.value, '{items}', coalesce((
    select jsonb_agg(case when item->>'entityType'='microsequence'
      then item #- '{content,explanation,reconciliation}' else item end order by ordinal)
    from jsonb_array_elements(page.value->'items') with ordinality as entries(item,ordinal)
  ), '[]'::jsonb)) from page
$function$;

do $manifest$ declare manifest jsonb; begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260916031133');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
commit;
