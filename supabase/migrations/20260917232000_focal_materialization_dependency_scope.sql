begin;

-- A parte organiza a gravação; não transforma cada objeto preservado numa
-- candidata. Na produção focal, valide as novas aplicações integralmente e
-- somente as relações concretas delas com as aplicações preservadas. A
-- conclusão explicitamente pedida conserva a validação acumulada integral.
do $focal_validation_scope$
declare
  definition text;
  before_filter text:=$before$  select coalesce(jsonb_agg(unit),'[]'::jsonb) into all_units from jsonb_array_elements(all_units) unit
    where jsonb_typeof(unit->'designApplication')='object' and jsonb_typeof(unit->'designSnapshot')='object';$before$;
  before_fragment text:=$before$  perform private.assert_course_application_pedagogy_v1(p_course_id,all_units,p_complete);$before$;
  after_fragment text:=$after$  perform private.assert_course_application_pedagogy_v1(
    p_course_id,case when p_complete then all_units else p_units end,p_complete
  );
  if not p_complete then
    -- A declaração de uma ideia nova não pode duplicar uma introdução que
    -- permanecerá no percurso, mesmo que o registro antigo não tenha snapshot.
    if exists(
      select 1 from jsonb_array_elements(p_units) incoming
      cross join jsonb_array_elements(all_units) retained
      cross join lateral jsonb_array_elements_text(coalesce(incoming#>'{designApplication,introducedInstructionalAnalysisUnitIds}','[]'::jsonb)) idea
      where not exists(select 1 from jsonb_array_elements(p_units) written where written->>'studyUnitId'=retained->>'studyUnitId')
        and coalesce(retained#>'{designApplication,introducedInstructionalAnalysisUnitIds}','[]'::jsonb) ? idea
    ) then raise exception 'A nova produção repete uma ideia já introduzida no percurso.' using errcode='23514'; end if;

    -- Só existe conflito de forma quando a candidata contradiz uma declaração
    -- sobre a mesma ideia. Incompletude de outro assunto não exige manutenção.
    if exists(
      select 1 from jsonb_array_elements(p_units) incoming
      cross join jsonb_array_elements(all_units) retained
      cross join lateral jsonb_array_elements(coalesce(incoming#>'{designApplication,explanationApplications}','[]'::jsonb)) next_explanation
      cross join lateral jsonb_array_elements(coalesce(retained#>'{designApplication,explanationApplications}','[]'::jsonb)) previous_explanation
      where incoming->>'didacticMicrosequenceId'=retained->>'didacticMicrosequenceId'
        and not exists(select 1 from jsonb_array_elements(p_units) written where written->>'studyUnitId'=retained->>'studyUnitId')
        and next_explanation->>'instructionalAnalysisUnitId'=previous_explanation->>'instructionalAnalysisUnitId'
        and (exists(select 1 from jsonb_array_elements(coalesce(previous_explanation->'notApplicable','[]'::jsonb)) excluded
              where coalesce(next_explanation->'developedForms','[]'::jsonb) ? (excluded->>'form'))
          or exists(select 1 from jsonb_array_elements(coalesce(next_explanation->'notApplicable','[]'::jsonb)) excluded
              where coalesce(previous_explanation->'developedForms','[]'::jsonb) ? (excluded->>'form')))
    ) then raise exception 'A nova explicação contradiz uma forma já desenvolvida para a mesma ideia.' using errcode='23514'; end if;

    -- Oportunidades do mesmo requisito continuam distintas e voltadas à mesma
    -- operação. Conflitos exclusivamente entre registros antigos não entram.
    if exists(
      select 1 from jsonb_array_elements(p_units) incoming
      cross join jsonb_array_elements(all_units) retained
      cross join lateral jsonb_array_elements(coalesce(incoming#>'{designApplication,practiceApplications}','[]'::jsonb)) next_practice
      cross join lateral jsonb_array_elements(coalesce(retained#>'{designApplication,practiceApplications}','[]'::jsonb)) previous_practice
      where incoming->>'didacticMicrosequenceId'=retained->>'didacticMicrosequenceId'
        and not exists(select 1 from jsonb_array_elements(p_units) written where written->>'studyUnitId'=retained->>'studyUnitId')
        and next_practice->>'evidenceRequirementId'=previous_practice->>'evidenceRequirementId'
        and (next_practice->>'opportunityId'=previous_practice->>'opportunityId'
          or previous_practice->>'invariantTaskOperation' is not null
            and next_practice->>'invariantTaskOperation'<>previous_practice->>'invariantTaskOperation')
    ) then raise exception 'A nova prática repete uma oportunidade ou muda a operação de aprendizagem compartilhada.' using errcode='23514'; end if;
  end if;$after$;
begin
  definition:=replace(pg_get_functiondef(
    'private.prepare_incremental_course_part_v1(uuid,uuid,jsonb,jsonb,boolean,jsonb)'::regprocedure
  ),E'\r\n',E'\n');
  if (length(definition)-length(replace(definition,before_fragment,'')))/length(before_fragment)<>1
     or (length(definition)-length(replace(definition,before_filter,'')))/length(before_filter)<>1 then
    raise exception 'Validação incremental precursora divergiu.' using errcode='55000';
  end if;
  definition:=replace(definition,before_filter,'-- Unidades omitidas fornecem relações, não novas candidatas.');
  execute replace(definition,before_fragment,after_fragment);
end $focal_validation_scope$;

do $focal_repertoire_scope$
declare
  definition text;
  before_one text:=$before$      where assignment.course_id=p_course_id and assignment.plan_item_kind in('instructional_analysis_unit','evidence_requirement')
    ) select * from supplied except select * from current$before$;
  after_one text:=$after$      where assignment.course_id=p_course_id
        and assignment.plan_item_kind in('instructional_analysis_unit','evidence_requirement')
        and (p_complete or exists(
          select 1 from jsonb_array_elements(p_targets) focal(value)
          where focal.value->>'didacticMicrosequenceId'=assignment.didactic_microsequence_id
        ))
    ) select * from supplied except select * from current$after$;
  before_two text:=$before$      where assignment.course_id=p_course_id and assignment.plan_item_kind in('instructional_analysis_unit','evidence_requirement')
    except select * from supplied$before$;
  after_two text:=$after$      where assignment.course_id=p_course_id
        and assignment.plan_item_kind in('instructional_analysis_unit','evidence_requirement')
        and (p_complete or exists(
          select 1 from jsonb_array_elements(p_targets) focal(value)
          where focal.value->>'didacticMicrosequenceId'=assignment.didactic_microsequence_id
        ))
    except select * from supplied$after$;
begin
  definition:=replace(pg_get_functiondef(
    'private.prepare_incremental_course_part_v1(uuid,uuid,jsonb,jsonb,boolean,jsonb)'::regprocedure
  ),E'\r\n',E'\n');
  if (length(definition)-length(replace(definition,before_one,'')))/length(before_one)<>1
     or (length(definition)-length(replace(definition,before_two,'')))/length(before_two)<>1 then
    raise exception 'Escopo precursor do repertório incremental divergiu.' using errcode='55000';
  end if;
  definition:=replace(definition,before_one,after_one);
  definition:=replace(definition,before_two,after_two);
  execute definition;
end $focal_repertoire_scope$;

do $focal_target_scope$
declare
  definition text;
  before_fragment text:=$before$  if exists(
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
  end if;$before$;
  after_fragment text:=$after$  if (p_complete and exists(
    select 1 from private.course_authoring_part_didactic_microsequences membership
    where membership.course_id=p_course_id
      and membership.authoring_part_id=p_authoring_part_id
      and not exists(
        select 1 from jsonb_array_elements(p_target_plan_items) target(value)
        where target.value->>'didacticMicrosequenceId'
          =membership.didactic_microsequence_id
      )
  )) or exists(
    select 1 from jsonb_array_elements(p_target_plan_items) target(value)
    where not exists(
      select 1 from private.course_authoring_part_didactic_microsequences membership
      where membership.course_id=p_course_id
        and membership.authoring_part_id=p_authoring_part_id
        and membership.didactic_microsequence_id
          =target.value->>'didacticMicrosequenceId'
    )
  ) then
    raise exception 'O recorte pedagogico precisa pertencer ao lote.'
      using errcode='23514';
  end if;$after$;
begin
  definition:=replace(pg_get_functiondef(
    'public.materialize_course_authoring_part_for_actor_v2(uuid,uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,jsonb,boolean,jsonb)'::regprocedure
  ),E'\r\n',E'\n');
  if (length(definition)-length(replace(definition,before_fragment,'')))
      /length(before_fragment)<>1 then
    raise exception 'Escopo precursor do materializador incremental divergiu.' using errcode='55000';
  end if;
  execute replace(definition,before_fragment,after_fragment);
end $focal_target_scope$;

do $manifest$ declare manifest jsonb; begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260917232000');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
notify pgrst,'reload schema';
commit;
