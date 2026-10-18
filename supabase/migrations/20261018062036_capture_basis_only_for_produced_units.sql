begin;
set local lock_timeout='5s';
set local statement_timeout='5min';

-- Concluir o acumulado não produz unidades nem reaplica suas bases.
-- O hook mantém o contrato estrito de captura de 1..64 unidades produzidas.
do $capture_produced_basis$
declare definition text; before_fragment text; after_fragment text; fragment_count integer;
begin
  select replace(pg_get_functiondef(
    'public.materialize_course_authoring_part_for_actor_v2(uuid,uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,jsonb,boolean,jsonb,boolean)'::regprocedure
  ),E'\r\n',E'\n') into definition;
  before_fragment:=$before$v_extra_changed:=private.capture_course_applied_explanation_basis_v1(p_course_id,p_units) or v_extra_changed or v_plan_changed or v_application_extension_changed;$before$;
  after_fragment:=$after$if jsonb_array_length(p_units)>0 then
    -- Executar o efeito antes de combinar flags; OR pode dispensar sua avaliação.
    if private.capture_course_applied_explanation_basis_v1(p_course_id,p_units) then
      v_extra_changed:=true;
    end if;
  end if;
  v_extra_changed:=v_extra_changed or v_plan_changed or v_application_extension_changed;$after$;
  fragment_count:=(length(definition)-length(replace(definition,before_fragment,'')))/length(before_fragment);
  if fragment_count<>1 then
    raise exception 'Hook da base aplicada no materializador divergiu: % ocorrência(s).',fragment_count;
  end if;
  execute replace(definition,before_fragment,after_fragment);
end $capture_produced_basis$;

do $manifest$
declare manifest jsonb:=public.get_aralearn_runtime_manifest();
begin
  manifest:=manifest||jsonb_build_object('schemaRevision','20261018062036');
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(manifest::text)||'::jsonb'
  );
end $manifest$;
notify pgrst,'reload schema';
commit;
