begin;

-- A calibração respeita os escopos do catálogo. Parâmetros exclusivos do
-- curso conservam essa procedência mesmo quando aplicados a uma unidade.
-- O mesmo validador da materialização confere o resultado antes de persistir.
do $calibration_provenance$
declare definition text; old_fragment text; new_fragment text;
begin
  select replace(pg_get_functiondef('public.apply_course_design_command_for_actor_v3(uuid,uuid,bigint,jsonb,text,text,text)'::regprocedure),E'\r\n',E'\n') into definition;
  old_fragment:=$old$           'reason',case when choice is null then effective->>'reason' else choice->>'reason' end,
           'sourceScopeKind',case when choice is null then effective#>>'{sourceScope,kind}' else 'study_unit' end));$old$;
  new_fragment:=$new$           'reason',case when choice is null then effective->>'reason' else btrim(choice->>'reason') end,
           'sourceScopeKind',case when choice is null then effective#>>'{sourceScope,kind}'
             when exists(select 1 from private.course_design_parameter_definitions d
               where d.parameter_id=parameter->>'parameterId' and 'study_unit'=any(d.supported_scopes)) then 'study_unit'
             else coalesce(effective#>>'{sourceScope,kind}','course') end));$new$;
  if position(old_fragment in definition)=0 then raise exception 'O escritor instrucional corrente divergiu na procedência da calibração.'; end if;
  definition:=replace(definition,old_fragment,new_fragment);
  old_fragment:=$old$       end loop;
       snapshot:=jsonb_build_object('contract','aralearn.study-unit-design-snapshot.v2','parameterCatalogVersion','1.2.1',$old$;
  new_fragment:=$new$       end loop;
       if private.valid_applied_course_design_parameters_v1(applied_parameters,current_parameters) is not true then
         raise exception 'A configuração aplicada não corresponde ao contrato e à intenção corrente.' using errcode='22023';
       end if;
       snapshot:=jsonb_build_object('contract','aralearn.study-unit-design-snapshot.v2','parameterCatalogVersion','1.2.1',$new$;
  if position(old_fragment in definition)=0 then raise exception 'O escritor instrucional corrente divergiu na validação do snapshot.'; end if;
  definition:=replace(definition,old_fragment,new_fragment);
  execute definition;
end $calibration_provenance$;

do $manifest$
declare manifest jsonb;
begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260909071110');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
commit;
