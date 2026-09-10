begin;

-- As formas requeridas na introdução podem ser desenvolvidas nas continuações
-- da mesma ideia e microssequência. A declaração não aplicável conserva motivo
-- e coerência com as formas desenvolvidas nesse mesmo recorte.
do $explanation_form_coverage$
declare definition text; old_fragment text; new_fragment text;
begin
  select replace(pg_get_functiondef('private.assert_course_materialization_pedagogy_v1(uuid,jsonb)'::regprocedure),E'\r\n',E'\n') into definition;
  old_fragment:=$old$      select 1 from jsonb_array_elements(
        required.value#>'{designApplication,explanationApplications}'
      ) explanation(value)
      where explanation.value->>'instructionalAnalysisUnitId'=required.analysis_id$old$;
  new_fragment:=$new$      select 1 from jsonb_array_elements(p_units) continuation(value)
      cross join lateral jsonb_array_elements(
        continuation.value#>'{designApplication,explanationApplications}'
      ) explanation(value)
      where continuation.value->>'didacticMicrosequenceId'
          =required.value->>'didacticMicrosequenceId'
        and explanation.value->>'instructionalAnalysisUnitId'=required.analysis_id$new$;
  if position(old_fragment in definition)=0 then
    raise exception 'A validação corrente divergiu na cobertura de formas explicativas.';
  end if;
  definition:=replace(definition,old_fragment,new_fragment);

  old_fragment:=$old$    join jsonb_array_elements(explanation.value->'notApplicable') excluded(value)
      on excluded.value->>'form'=developed.value$old$;
  new_fragment:=$new$    where exists(
      select 1 from jsonb_array_elements(p_units) continuation(value)
      cross join lateral jsonb_array_elements(
        continuation.value#>'{designApplication,explanationApplications}'
      ) continued_explanation(value)
      cross join lateral jsonb_array_elements(
        continued_explanation.value->'notApplicable'
      ) excluded(value)
      where continuation.value->>'didacticMicrosequenceId'
          =unit.value->>'didacticMicrosequenceId'
        and continued_explanation.value->>'instructionalAnalysisUnitId'
          =explanation.value->>'instructionalAnalysisUnitId'
        and excluded.value->>'form'=developed.value
    )$new$;
  if position(old_fragment in definition)=0 then
    raise exception 'A validação corrente divergiu na não aplicabilidade de formas explicativas.';
  end if;
  definition:=replace(definition,old_fragment,new_fragment);
  definition:=replace(definition,
    E'  -- Formas obrigatorias incidem sobre a introducao. Uma retomada pode ser\n  -- proporcional a nova funcao da ideia, sem repetir toda a definicao.',
    E'  -- A introdução define as formas requeridas. As continuações da mesma\n  -- ideia e microssequência completam a cobertura sem repetir a definição.');
  execute definition;
end $explanation_form_coverage$;

do $manifest$
declare manifest jsonb;
begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260910045104');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
commit;
