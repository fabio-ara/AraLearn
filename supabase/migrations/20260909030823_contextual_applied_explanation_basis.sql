begin;

-- Proveniência da produção, separada do conteúdo editável e da declaração de
-- revisão. Ausência histórica permanece ausência: não há backfill inferido.
create function private.valid_applied_explanation_basis_v1(p_value jsonb)
returns boolean language sql immutable set search_path=pg_catalog as $function$
  select case when p_value is null then true when jsonb_typeof(p_value)<>'object' then false
    else coalesce(p_value ?& array['contract','microsequenceId','basisHash','entityVersion']
    and p_value-array['contract','microsequenceId','basisHash','entityVersion','sourceCourseId']='{}'::jsonb
    and p_value->>'contract'='aralearn.applied-explanation-basis.v1'
    and jsonb_typeof(p_value->'microsequenceId')='string'
    and char_length(p_value->>'microsequenceId') between 1 and 240
    and p_value->>'microsequenceId'=btrim(p_value->>'microsequenceId')
    and p_value->>'microsequenceId'!~'[[:cntrl:]]'
    and jsonb_typeof(p_value->'basisHash')='string' and p_value->>'basisHash'~'^[a-f0-9]{64}$'
    and case when jsonb_typeof(p_value->'entityVersion')='number'
      and p_value->>'entityVersion'~'^[1-9][0-9]{0,15}$'
      then (p_value->>'entityVersion')::numeric<=9007199254740991 else false end
    and (not(p_value ? 'sourceCourseId') or jsonb_typeof(p_value->'sourceCourseId')='string'
      and p_value->>'sourceCourseId'~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),false) end
$function$;
revoke all on function private.valid_applied_explanation_basis_v1(jsonb) from public,anon,authenticated,service_role;

alter table private.course_entities add column applied_explanation_basis jsonb;
alter table private.course_entities add constraint course_applied_explanation_basis_v1 check(
  applied_explanation_basis is null or entity_type='study_unit'
    and private.valid_applied_explanation_basis_v1(applied_explanation_basis));

create function private.guard_applied_explanation_basis_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog as $function$
begin
  if new.content ?| array['appliedExplanationBasis','applied_explanation_basis'] then
    raise exception 'A base aplicada não pertence ao conteúdo editável.' using errcode='42501';
  end if;
  if tg_op='INSERT' then
    if new.applied_explanation_basis is not null then
      raise exception 'A importação não declara aplicação de uma base.' using errcode='42501';
    end if;
  elsif new.applied_explanation_basis is distinct from old.applied_explanation_basis
    and coalesce(current_setting('aralearn.applied_explanation_basis_write',true),'')
      not in('materialization','authorized-copy') then
    raise exception 'A base aplicada é metadado protegido da produção.' using errcode='42501';
  end if;
  return new;
end
$function$;
revoke all on function private.guard_applied_explanation_basis_v1() from public,anon,authenticated,service_role;
create trigger course_applied_explanation_basis_guard before insert or update on private.course_entities
  for each row execute function private.guard_applied_explanation_basis_v1();

create function private.capture_course_applied_explanation_basis_v1(p_course_id uuid,p_units jsonb)
returns boolean language plpgsql security definer set search_path=pg_catalog as $function$
declare v_unit jsonb; v_micro private.course_entities%rowtype; v_basis jsonb;
  v_gate text:=coalesce(current_setting('aralearn.applied_explanation_basis_write',true),'');
  v_changed boolean:=false; v_count integer;
begin
  perform private.require_service_role();
  if p_course_id is null or jsonb_typeof(p_units) is distinct from 'array'
    or jsonb_array_length(p_units) not between 1 and 64
    or (select count(*)<>count(distinct value->>'studyUnitId') from jsonb_array_elements(p_units)) then
    raise exception 'Recorte de aplicação da base inválido.' using errcode='22023';
  end if;
  -- O escritor externo já serializa o curso; este lock conserva o contrato
  -- também quando outro escritor autorizado reutilizar o hook.
  perform pg_advisory_xact_lock(hashtextextended('course-row:'||p_course_id::text,0));
  perform 1 from public.courses where id=p_course_id for update;
  if not found then raise exception 'Curso inexistente.' using errcode='PT404'; end if;
  perform set_config('aralearn.applied_explanation_basis_write','materialization',true);
  for v_unit in select value from jsonb_array_elements(p_units) loop
    if not exists(select 1 from private.course_entities unit where unit.course_id=p_course_id
      and unit.entity_type='study_unit' and unit.entity_id=v_unit->>'studyUnitId'
      and unit.parent_type='microsequence' and unit.parent_id=v_unit->>'didacticMicrosequenceId') then
      raise exception 'A unidade não pertence à microssequência produzida.' using errcode='23514';
    end if;
    select * into v_micro from private.course_entities where course_id=p_course_id
      and entity_type='microsequence' and entity_id=v_unit->>'didacticMicrosequenceId' for update;
    if not found or not private.course_content_complete_v1(p_course_id,'microsequence_explanation',v_micro.entity_id) then
      raise exception 'Salve uma Explicação completa antes de aplicar sua base às unidades.' using errcode='23514';
    end if;
    v_basis:=jsonb_build_object('contract','aralearn.applied-explanation-basis.v1',
      'microsequenceId',v_micro.entity_id,'basisHash',
      private.course_content_basis_hash_v1(p_course_id,'microsequence_explanation',v_micro.entity_id),
      'entityVersion',v_micro.version);
    update private.course_entities set applied_explanation_basis=v_basis
      where course_id=p_course_id and entity_type='study_unit' and entity_id=v_unit->>'studyUnitId'
        and applied_explanation_basis is distinct from v_basis;
    get diagnostics v_count=row_count;
    v_changed:=v_changed or v_count>0;
  end loop;
  perform set_config('aralearn.applied_explanation_basis_write',v_gate,true);
  return v_changed;
exception when others then
  perform set_config('aralearn.applied_explanation_basis_write',v_gate,true);
  raise;
end
$function$;
revoke all on function private.capture_course_applied_explanation_basis_v1(uuid,jsonb) from public,anon,authenticated,service_role;

create function private.copy_course_applied_explanation_basis_v1(p_source_course_id uuid,p_target_course_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $function$
declare v_gate text:=coalesce(current_setting('aralearn.applied_explanation_basis_write',true),'');
begin
  perform private.require_service_role();
  if p_source_course_id=p_target_course_id or not exists(select 1 from public.courses
    where id=p_target_course_id and copy_origin->>'sourceCourseId'=p_source_course_id::text) then
    raise exception 'A origem da cópia não corresponde ao curso de destino.' using errcode='23514';
  end if;
  perform set_config('aralearn.applied_explanation_basis_write','authorized-copy',true);
  update private.course_entities target set applied_explanation_basis=source.applied_explanation_basis||
    jsonb_build_object('sourceCourseId',coalesce(source.applied_explanation_basis->>'sourceCourseId',p_source_course_id::text))
    from private.course_entities source where source.course_id=p_source_course_id and source.entity_type='study_unit'
      and source.applied_explanation_basis is not null and target.course_id=p_target_course_id
      and target.entity_type='study_unit' and target.entity_id=source.entity_id;
  perform set_config('aralearn.applied_explanation_basis_write',v_gate,true);
exception when others then
  perform set_config('aralearn.applied_explanation_basis_write',v_gate,true);
  raise;
end
$function$;
revoke all on function private.copy_course_applied_explanation_basis_v1(uuid,uuid) from public,anon,authenticated,service_role;

-- Hooks no final dos escritores existentes. O primeiro comando salva texto e
-- fontes; o segundo captura a base mesmo quando a gravação anterior mudou algo.
do $materializer$
declare v_definition text; v_before text; v_after text;
begin
  v_before:='v_extra_changed:=private.save_course_part_explanations_v1(p_course_id,p_units,p_explanations) or v_plan_changed or v_application_extension_changed;';
  v_after:=E'v_extra_changed:=private.save_course_part_explanations_v1(p_course_id,p_units,p_explanations);\n  v_extra_changed:=private.capture_course_applied_explanation_basis_v1(p_course_id,p_units) or v_extra_changed or v_plan_changed or v_application_extension_changed;';
  select pg_get_functiondef('public.materialize_course_authoring_part_for_actor_v2(uuid,uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,jsonb)'::regprocedure) into v_definition;
  if position(v_before in v_definition)=0 then raise exception 'Materializador precursor da base aplicada divergiu.'; end if;
  execute replace(v_definition,v_before,v_after);
end
$materializer$;

do $copy$
declare v_definition text; v_before text;
begin
  v_before:='v_result:=jsonb_build_object(''contract'',''aralearn.course-copy.v1'',''sourceCourseId'',p_source_course_id,''sourceCourseRevision'',p_expected_source_revision,';
  select pg_get_functiondef('public.copy_course_for_actor_v1(uuid,uuid,bigint,text,boolean,text,timestamptz)'::regprocedure) into v_definition;
  if position(v_before in v_definition)=0 then raise exception 'Escritor de cópia precursor da base aplicada divergiu.'; end if;
  execute replace(v_definition,v_before,E'perform private.copy_course_applied_explanation_basis_v1(p_source_course_id,v_id);\n  '||v_before);
end
$copy$;

do $projection$
declare v_definition text; v_before text;
begin
  v_before:='''version'', page.version,';
  select pg_get_functiondef('private.list_course_entities_for_actor_v1(uuid,uuid,bigint,integer,text,text)'::regprocedure) into v_definition;
  if position(v_before in v_definition)=0 then raise exception 'Leitor precursor da base aplicada divergiu.'; end if;
  execute replace(v_definition,v_before,'''appliedExplanationBasis'',case when page.entity_type=''study_unit'' then page.applied_explanation_basis end,'||v_before);
end
$projection$;

-- O registro aplicado é parte da base de revisão da unidade. A base explicativa
-- não depende desse registro, evitando ciclo no hash da própria materialização.
do $review_basis$
declare v_definition text; v_before text;
begin
  v_before:='''designApplication'',case when entity_type=''study_unit'' then design_application end';
  select pg_get_functiondef('private.course_content_basis_hash_v1(uuid,text,text)'::regprocedure) into v_definition;
  if position(v_before in v_definition)=0 then raise exception 'Hash precursor da base aplicada divergiu.'; end if;
  execute replace(v_definition,v_before,v_before||',''appliedExplanationBasis'',case when entity_type=''study_unit'' then applied_explanation_basis end');
end
$review_basis$;

commit;
