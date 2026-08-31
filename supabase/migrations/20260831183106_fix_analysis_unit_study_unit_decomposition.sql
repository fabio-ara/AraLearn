-- Uma AnalysisUnit é introduzida uma vez, mas seu desenvolvimento pode continuar
-- em várias StudyUnits; o teto mede somente introduções novas na Unidade corrente.
begin;

do $analysis_unit_decomposition_preflight$
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision' <> '20260831012600'
     or to_regprocedure(
       'private.valid_course_design_application_v1(jsonb,text,jsonb)'
     ) is null
     or to_regprocedure(
       'private.valid_course_design_application_v2(jsonb,text,jsonb)'
     ) is null then
    raise exception 'O runtime de materialização não corresponde ao esperado.'
      using errcode = '55000';
  end if;
end;
$analysis_unit_decomposition_preflight$;

create or replace function private.valid_course_design_application_v1(
  p_context jsonb,
  p_context_hash text,
  p_application jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_target jsonb;
  v_ceiling integer;
  v_required_forms jsonb;
  v_minimum_practice integer;
  v_required_variation jsonb;
  v_policy jsonb;
begin
  if jsonb_typeof(p_context) <> 'object'
     or p_context->>'contract' <> 'aralearn.course-design-context.v1'
     or p_context_hash !~ '^[a-f0-9]{64}$'
     or jsonb_typeof(p_application) <> 'object'
     or octet_length(p_application::text) > 16384
     or p_application - 'contextHash' - 'didacticMicrosequenceId'
       - 'studyUnits' <> '{}'::jsonb
     or not (p_application ?& array[
       'contextHash','didacticMicrosequenceId','studyUnits'
     ])
     or p_application->>'contextHash' <> p_context_hash
     or jsonb_typeof(p_application->'didacticMicrosequenceId') <> 'string'
     or nullif(btrim(p_application->>'didacticMicrosequenceId'),'') is null
     or p_application->>'didacticMicrosequenceId'
       <> btrim(p_application->>'didacticMicrosequenceId')
     or char_length(p_application->>'didacticMicrosequenceId') > 240
     or p_application->>'didacticMicrosequenceId' ~ '[[:cntrl:]]'
     or jsonb_typeof(p_application->'studyUnits') <> 'array'
     or jsonb_array_length(p_application->'studyUnits') > 64 then
    return false;
  end if;
  select target.value into v_target
  from jsonb_array_elements(p_context->'targets') target(value)
  where target.value->>'didacticMicrosequenceId'
    = p_application->>'didacticMicrosequenceId';
  if v_target is null then return false; end if;

  select (parameter.value->'value'#>>'{}')::integer into v_ceiling
  from jsonb_array_elements(v_target->'parameters') parameter(value)
  where parameter.value->>'parameterId'
    = 'new_analysis_unit_ceiling_per_expository_study_unit';
  select parameter.value->'value' into v_required_forms
  from jsonb_array_elements(v_target->'parameters') parameter(value)
  where parameter.value->>'parameterId' = 'required_explanation_forms';
  select (parameter.value->'value'#>>'{}')::integer into v_minimum_practice
  from jsonb_array_elements(v_target->'parameters') parameter(value)
  where parameter.value->>'parameterId'
    = 'minimum_distinct_practice_opportunities_per_evidence_requirement';
  select parameter.value->'value' into v_required_variation
  from jsonb_array_elements(v_target->'parameters') parameter(value)
  where parameter.value->>'parameterId'
    = 'required_practice_variation_dimensions';
  v_policy := v_target#>'{componentPolicy,policy}';
  if v_ceiling is null or v_required_forms is null
     or v_minimum_practice is null or v_required_variation is null
     or not private.valid_course_component_policy_v1(v_policy) then
    return false;
  end if;

  if exists(
    select 1
    from jsonb_array_elements(p_application->'studyUnits') unit(value)
    where jsonb_typeof(unit.value) <> 'object'
      or unit.value ?& array[
        'studyUnitId','mode','introducedInstructionalAnalysisUnitIds',
        'explanationApplications','practiceApplications','componentRefs'
      ] is not true
      or unit.value - 'studyUnitId' - 'mode'
        - 'introducedInstructionalAnalysisUnitIds'
        - 'explanationApplications' - 'practiceApplications'
        - 'componentRefs' <> '{}'::jsonb
      or jsonb_typeof(unit.value->'studyUnitId') <> 'string'
      or nullif(btrim(unit.value->>'studyUnitId'),'') is null
      or unit.value->>'studyUnitId' <> btrim(unit.value->>'studyUnitId')
      or char_length(unit.value->>'studyUnitId') > 240
      or unit.value->>'studyUnitId' ~ '[[:cntrl:]]'
      or unit.value->>'mode' not in ('expository','practice','mixed')
      or jsonb_typeof(
        unit.value->'introducedInstructionalAnalysisUnitIds'
      ) <> 'array'
      or jsonb_array_length(
        unit.value->'introducedInstructionalAnalysisUnitIds'
      ) > 256
      or jsonb_typeof(unit.value->'explanationApplications') <> 'array'
      or jsonb_array_length(unit.value->'explanationApplications') > 256
      or jsonb_typeof(unit.value->'practiceApplications') <> 'array'
      or jsonb_array_length(unit.value->'practiceApplications') > 256
      or jsonb_typeof(unit.value->'componentRefs') <> 'array'
      or jsonb_array_length(unit.value->'componentRefs') > 32
      or (
        unit.value->>'mode' = 'practice'
        and (
          jsonb_array_length(
            unit.value->'introducedInstructionalAnalysisUnitIds'
          ) > 0
          or jsonb_array_length(unit.value->'explanationApplications') > 0
        )
      )
      or (
        unit.value->>'mode' = 'expository'
        and jsonb_array_length(unit.value->'practiceApplications') > 0
      )
      or (
        unit.value->>'mode' in ('expository','mixed')
        and jsonb_array_length(
          unit.value->'introducedInstructionalAnalysisUnitIds'
        ) > v_ceiling
      )
  ) or (
    select count(*) <> count(distinct unit.value->>'studyUnitId')
    from jsonb_array_elements(p_application->'studyUnits') unit(value)
  ) then
    return false;
  end if;

  if exists(
    select 1
    from jsonb_array_elements(p_application->'studyUnits') unit(value)
    cross join lateral jsonb_array_elements(
      unit.value->'introducedInstructionalAnalysisUnitIds'
    ) introduced(value)
    where jsonb_typeof(introduced.value) <> 'string'
      or introduced.value#>>'{}'
        !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or not ((v_target->'instructionalAnalysisUnitIds')
        ? (introduced.value#>>'{}'))
  ) or (
    select count(*) <> count(distinct introduced.value#>>'{}')
    from jsonb_array_elements(p_application->'studyUnits') unit(value)
    cross join lateral jsonb_array_elements(
      unit.value->'introducedInstructionalAnalysisUnitIds'
    ) introduced(value)
  ) or exists(
    select 1
    from jsonb_array_elements_text(
      v_target->'instructionalAnalysisUnitIds'
    ) expected(value)
    where not exists(
      select 1
      from jsonb_array_elements(p_application->'studyUnits') unit(value)
      cross join lateral jsonb_array_elements_text(
        unit.value->'introducedInstructionalAnalysisUnitIds'
      ) introduced(value)
      where introduced.value = expected.value
    )
  ) then
    return false;
  end if;

  if exists(
    select 1
    from jsonb_array_elements(p_application->'studyUnits')
      with ordinality unit(value,ordinal)
    cross join lateral jsonb_array_elements(
      unit.value->'explanationApplications'
    ) explanation(value)
    where jsonb_typeof(explanation.value) <> 'object'
      or explanation.value ?& array[
        'instructionalAnalysisUnitId','developedForms','notApplicable'
      ] is not true
      or explanation.value - 'instructionalAnalysisUnitId'
        - 'developedForms' - 'notApplicable' <> '{}'::jsonb
      or explanation.value->>'instructionalAnalysisUnitId'
        !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(explanation.value->'developedForms') <> 'array'
      or jsonb_array_length(explanation.value->'developedForms') > 8
      or jsonb_typeof(explanation.value->'notApplicable') <> 'array'
      or jsonb_array_length(explanation.value->'notApplicable') > 8
      or (
        jsonb_array_length(explanation.value->'developedForms') = 0
        and jsonb_array_length(explanation.value->'notApplicable') = 0
      )
      or not ((v_target->'instructionalAnalysisUnitIds')
        ? (explanation.value->>'instructionalAnalysisUnitId'))
      or not exists(
        select 1
        from jsonb_array_elements(p_application->'studyUnits')
          with ordinality introduced_unit(value,ordinal)
        cross join lateral jsonb_array_elements_text(
          introduced_unit.value->'introducedInstructionalAnalysisUnitIds'
        ) introduced(value)
        where introduced.value = explanation.value->>'instructionalAnalysisUnitId'
          and introduced_unit.ordinal <= unit.ordinal
      )
  ) or exists(
    select 1
    from jsonb_array_elements(p_application->'studyUnits') unit(value)
    where (
      select count(*) <> count(distinct
        explanation.value->>'instructionalAnalysisUnitId'
      )
      from jsonb_array_elements(
        unit.value->'explanationApplications'
      ) explanation(value)
    )
  ) or exists(
    select 1
    from jsonb_array_elements(p_application->'studyUnits') unit(value)
    cross join lateral jsonb_array_elements_text(
      unit.value->'introducedInstructionalAnalysisUnitIds'
    ) introduced(value)
    where not exists(
      select 1
      from jsonb_array_elements(
        unit.value->'explanationApplications'
      ) explanation(value)
      where explanation.value->>'instructionalAnalysisUnitId'
        = introduced.value
    )
  ) then
    return false;
  end if;

  if exists(
    select 1
    from jsonb_array_elements(p_application->'studyUnits') unit(value)
    cross join lateral jsonb_array_elements(
      unit.value->'explanationApplications'
    ) explanation(value)
    cross join lateral jsonb_array_elements(
      explanation.value->'developedForms'
    ) form(value)
    where jsonb_typeof(form.value) <> 'string'
      or form.value#>>'{}' not in (
        'plain_definition','concrete_example','mechanism','contrast',
        'application_condition','limit_or_exception','worked_example',
        'representation_link'
      )
  ) or exists(
    select 1
    from jsonb_array_elements(p_application->'studyUnits') unit(value)
    cross join lateral jsonb_array_elements(
      unit.value->'explanationApplications'
    ) explanation(value)
    where (
      select count(*) <> count(distinct form.value#>>'{}')
      from jsonb_array_elements(
        explanation.value->'developedForms'
      ) form(value)
    )
  ) or exists(
    select 1
    from jsonb_array_elements(p_application->'studyUnits') unit(value)
    cross join lateral jsonb_array_elements(
      unit.value->'explanationApplications'
    ) explanation(value)
    cross join lateral jsonb_array_elements(
      explanation.value->'notApplicable'
    ) item(value)
    where jsonb_typeof(item.value) <> 'object'
      or item.value ?& array['form','reason'] is not true
      or item.value - 'form' - 'reason' <> '{}'::jsonb
      or item.value->>'form' not in (
        'plain_definition','concrete_example','mechanism','contrast',
        'application_condition','limit_or_exception','worked_example',
        'representation_link'
      )
      or (explanation.value->'developedForms') ? (item.value->>'form')
      or jsonb_typeof(item.value->'reason') <> 'string'
      or nullif(btrim(item.value->>'reason'),'') is null
      or item.value->>'reason' <> btrim(item.value->>'reason')
      or char_length(item.value->>'reason') > 240
      or translate(item.value->>'reason',E'\n\r\t','') ~ '[[:cntrl:]]'
  ) or exists(
    select 1
    from jsonb_array_elements(p_application->'studyUnits') unit(value)
    cross join lateral jsonb_array_elements(
      unit.value->'explanationApplications'
    ) explanation(value)
    where (
      select count(*) <> count(distinct item.value->>'form')
      from jsonb_array_elements(
        explanation.value->'notApplicable'
      ) item(value)
    )
  ) or exists(
    select 1
    from jsonb_array_elements_text(
      v_target->'instructionalAnalysisUnitIds'
    ) analysis_unit(value)
    cross join lateral jsonb_array_elements_text(v_required_forms)
      required(value)
    where not exists(
      select 1
      from jsonb_array_elements(p_application->'studyUnits') unit(value)
      cross join lateral jsonb_array_elements(
        unit.value->'explanationApplications'
      ) explanation(value)
      where explanation.value->>'instructionalAnalysisUnitId'
          = analysis_unit.value
        and explanation.value->'developedForms' ? required.value
    ) and not exists(
      select 1
      from jsonb_array_elements(p_application->'studyUnits') unit(value)
      cross join lateral jsonb_array_elements(
        unit.value->'explanationApplications'
      ) explanation(value)
      cross join lateral jsonb_array_elements(
        explanation.value->'notApplicable'
      ) item(value)
      where explanation.value->>'instructionalAnalysisUnitId'
          = analysis_unit.value
        and item.value->>'form' = required.value
    )
  ) or exists(
    select 1
    from jsonb_array_elements_text(
      v_target->'instructionalAnalysisUnitIds'
    ) analysis_unit(value)
    cross join lateral unnest(array[
      'plain_definition','concrete_example','mechanism','contrast',
      'application_condition','limit_or_exception','worked_example',
      'representation_link'
    ]::text[]) form(value)
    where exists(
      select 1
      from jsonb_array_elements(p_application->'studyUnits') unit(value)
      cross join lateral jsonb_array_elements(
        unit.value->'explanationApplications'
      ) explanation(value)
      where explanation.value->>'instructionalAnalysisUnitId'
          = analysis_unit.value
        and explanation.value->'developedForms' ? form.value
    ) and exists(
      select 1
      from jsonb_array_elements(p_application->'studyUnits') unit(value)
      cross join lateral jsonb_array_elements(
        unit.value->'explanationApplications'
      ) explanation(value)
      cross join lateral jsonb_array_elements(
        explanation.value->'notApplicable'
      ) item(value)
      where explanation.value->>'instructionalAnalysisUnitId'
          = analysis_unit.value
        and item.value->>'form' = form.value
    )
  ) then
    return false;
  end if;

  if exists(
    select 1
    from jsonb_array_elements(p_application->'studyUnits') unit(value)
    cross join lateral jsonb_array_elements(
      unit.value->'practiceApplications'
    ) practice(value)
    where jsonb_typeof(practice.value) <> 'object'
      or practice.value ?& array[
        'evidenceRequirementId','opportunityId',
        'invariantTaskOperation','variedDimensions'
      ] is not true
      or practice.value - 'evidenceRequirementId' - 'opportunityId'
        - 'invariantTaskOperation' - 'variedDimensions' <> '{}'::jsonb
      or practice.value->>'evidenceRequirementId'
        !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or not ((v_target->'evidenceRequirementIds')
        ? (practice.value->>'evidenceRequirementId'))
      or jsonb_typeof(practice.value->'opportunityId') <> 'string'
      or nullif(btrim(practice.value->>'opportunityId'),'') is null
      or practice.value->>'opportunityId'
        <> btrim(practice.value->>'opportunityId')
      or char_length(practice.value->>'opportunityId') > 120
      or practice.value->>'opportunityId' ~ '[[:cntrl:]]'
      or jsonb_typeof(practice.value->'invariantTaskOperation') <> 'string'
      or nullif(btrim(practice.value->>'invariantTaskOperation'),'') is null
      or practice.value->>'invariantTaskOperation'
        <> btrim(practice.value->>'invariantTaskOperation')
      or char_length(practice.value->>'invariantTaskOperation') > 240
      or translate(practice.value->>'invariantTaskOperation',E'\n\r\t','')
        ~ '[[:cntrl:]]'
      or jsonb_typeof(practice.value->'variedDimensions') <> 'array'
      or jsonb_array_length(practice.value->'variedDimensions') > 5
  ) or exists(
    select 1
    from jsonb_array_elements(p_application->'studyUnits') unit(value)
    cross join lateral jsonb_array_elements(
      unit.value->'practiceApplications'
    ) practice(value)
    cross join lateral jsonb_array_elements(
      practice.value->'variedDimensions'
    ) dimension(value)
    where jsonb_typeof(dimension.value) <> 'string'
      or dimension.value#>>'{}' not in (
        'case_or_data','context','task_feature',
        'external_representation','support_level'
      )
  ) or exists(
    select 1
    from jsonb_array_elements(p_application->'studyUnits') unit(value)
    cross join lateral jsonb_array_elements(
      unit.value->'practiceApplications'
    ) practice(value)
    where (
      select count(*) <> count(distinct dimension.value#>>'{}')
      from jsonb_array_elements(
        practice.value->'variedDimensions'
      ) dimension(value)
    )
  ) or (
    select count(*) <> count(distinct (
      practice.value->>'evidenceRequirementId',
      practice.value->>'opportunityId'
    ))
    from jsonb_array_elements(p_application->'studyUnits') unit(value)
    cross join lateral jsonb_array_elements(
      unit.value->'practiceApplications'
    ) practice(value)
  ) then
    return false;
  end if;

  if exists(
    select 1
    from jsonb_array_elements_text(
      v_target->'evidenceRequirementIds'
    ) evidence(value)
    where (
      select count(distinct practice.value->>'opportunityId')
      from jsonb_array_elements(p_application->'studyUnits') unit(value)
      cross join lateral jsonb_array_elements(
        unit.value->'practiceApplications'
      ) practice(value)
      where practice.value->>'evidenceRequirementId' = evidence.value
    ) < v_minimum_practice
      or (
        select count(distinct practice.value->>'invariantTaskOperation')
        from jsonb_array_elements(p_application->'studyUnits') unit(value)
        cross join lateral jsonb_array_elements(
          unit.value->'practiceApplications'
        ) practice(value)
        where practice.value->>'evidenceRequirementId' = evidence.value
      ) <> 1
      or exists(
        select 1 from jsonb_array_elements_text(v_required_variation)
          required(value)
        where not exists(
          select 1
          from jsonb_array_elements(p_application->'studyUnits') unit(value)
          cross join lateral jsonb_array_elements(
            unit.value->'practiceApplications'
          ) practice(value)
          where practice.value->>'evidenceRequirementId' = evidence.value
            and practice.value->'variedDimensions' ? required.value
        )
      )
  ) then
    return false;
  end if;

  if exists(
    select 1
    from jsonb_array_elements(p_application->'studyUnits') unit(value)
    cross join lateral jsonb_array_elements(unit.value->'componentRefs')
      reference(value)
    where jsonb_typeof(reference.value) <> 'string'
      or not exists(
        select 1
        from jsonb_array_elements(
          private.course_component_catalog_v1()->'options'
        ) option(value)
        where option.value->>'ref' = reference.value#>>'{}'
      )
      or not private.course_component_policy_allows_v1(
        v_policy,reference.value#>>'{}'
      )
  ) or exists(
    select 1
    from jsonb_array_elements(p_application->'studyUnits') unit(value)
    where (
      select count(*) <> count(distinct reference.value#>>'{}')
      from jsonb_array_elements(unit.value->'componentRefs') reference(value)
    )
  ) then
    return false;
  end if;
  return true;
exception when others then
  return false;
end;
$function$;

revoke all on function private.valid_course_design_application_v1(
  jsonb,text,jsonb
) from public,anon,authenticated,service_role;

comment on function private.valid_course_design_application_v1(
  jsonb,text,jsonb
) is
  'Valida introduções únicas e desenvolvimento possivelmente distribuído por StudyUnits.';

do $analysis_unit_decomposition_contract$
declare v_definition text;
begin
  v_definition:=pg_get_functiondef(
    'private.valid_course_design_application_v1(jsonb,text,jsonb)'::regprocedure
  );
  if strpos(v_definition,'with ordinality introduced_unit')=0
     or strpos(v_definition,'analysis_unit(value)')=0
     or strpos(v_definition,'introduced_unit.ordinal <= unit.ordinal')=0
     or strpos(
       v_definition,
       'jsonb_array_length(explanation.value->''developedForms'') = 0'
     )=0 then
    raise exception 'A validação de decomposição não preservou o contrato esperado.'
      using errcode = '55000';
  end if;
end;
$analysis_unit_decomposition_contract$;

do $advance_analysis_unit_decomposition_manifest$
declare v_manifest jsonb; v_body text;
begin
  v_manifest:=public.get_aralearn_runtime_manifest();
  v_manifest:=jsonb_set(v_manifest,'{schemaRevision}',
    to_jsonb('20260831183106'::text));
  v_body:='select '||quote_literal(v_manifest::text)||'::jsonb';
  execute format('create or replace function public.get_aralearn_runtime_manifest() '
    ||'returns jsonb language sql stable security definer '
    ||'set search_path = pg_catalog as %L',v_body);
  revoke all on function public.get_aralearn_runtime_manifest()
    from public,anon,authenticated,service_role;
  grant execute on function public.get_aralearn_runtime_manifest()
    to anon,authenticated,service_role;
end;
$advance_analysis_unit_decomposition_manifest$;

commit;
