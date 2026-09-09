begin;

-- O limite de transporte continua nos escritores públicos. O mesmo validador
-- pedagógico também precisa observar todas as unidades já salvas do recorte.
do $saved_application_validation$
declare definition text; expected text:='jsonb_array_length(p_units) not between 1 and 64';
begin
  select pg_get_functiondef('private.assert_course_materialization_pedagogy_v1(uuid,jsonb)'::regprocedure) into definition;
  if position(expected in definition)=0 then raise exception 'A validação pedagógica corrente divergiu.'; end if;
  execute replace(definition,expected,'jsonb_array_length(p_units)<1');
end $saved_application_validation$;

-- O mesmo escritor tipado passa a manter repertório e aplicação em recortes.
-- As decisões de configuração existentes conservam implementação e recibos.
alter function public.apply_course_design_command_for_actor_v3(uuid,uuid,bigint,jsonb,text,text,text)
  rename to apply_course_design_settings_core_v3;
alter function public.apply_course_design_settings_core_v3(uuid,uuid,bigint,jsonb,text,text,text) set schema private;
revoke all on function private.apply_course_design_settings_core_v3(uuid,uuid,bigint,jsonb,text,text,text)
  from public,anon,authenticated,service_role;

create function public.apply_course_design_command_for_actor_v3(p_actor_id uuid,p_course_id uuid,p_expected_course_revision bigint,
 p_command jsonb,p_request_id text,p_request_hash text,p_channel text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $function$
declare receipt private.course_change_receipts%rowtype; course public.courses%rowtype;
 plan private.course_instructional_plans%rowtype; item private.course_instructional_plan_items%rowtype;
 unit private.course_entities%rowtype; command_type text:=p_command->>'type'; target text;
 entry jsonb; application jsonb; snapshot jsonb; supplied jsonb; field text; expected_kind text;
 path jsonb; current_parameters jsonb; parameter jsonb; choice jsonb; effective jsonb; applied_parameters jsonb;
 changed boolean:=false; plan_changed boolean:=false; affected bigint; result jsonb; all_units jsonb;
begin
 if command_type is null or command_type not in('save_plan_item','remove_plan_item','set_target_plan_items','set_study_unit_applications','apply_study_unit_configuration') then
   return private.apply_course_design_settings_core_v3(p_actor_id,p_course_id,p_expected_course_revision,p_command,p_request_id,p_request_hash,p_channel);
 end if;
 perform private.require_service_role();
 perform private.require_course_access_v1(p_course_id,p_actor_id,true);
 if p_expected_course_revision is null or p_expected_course_revision<1
   or p_request_id is null or p_request_id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
   or p_request_hash is null or p_request_hash!~'^[a-f0-9]{64}$'
   or p_channel is null or p_channel not in('application','mcp','actions')
   or jsonb_typeof(p_command) is distinct from 'object' or octet_length(p_command::text)>32768
   or jsonb_typeof(p_command->'expectedPlanVersion') is distinct from 'number'
   or p_command->>'expectedPlanVersion'!~'^[1-9][0-9]*$'
   or jsonb_typeof(p_command->'scope') is distinct from 'object'
   or jsonb_typeof(p_command#>'{scope,kind}') is distinct from 'string' or jsonb_typeof(p_command#>'{scope,ref}') is distinct from 'string'
   or not(p_command->'scope' ?& array['kind','ref']) or (p_command->'scope')-array['kind','ref']<>'{}'::jsonb then
   raise exception 'Comando instrucional inválido.' using errcode='22023'; end if;
 target:=p_command#>>'{scope,ref}';
 if target is null or length(target) not between 1 and 240 then
   raise exception 'Escopo instrucional inválido.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('course-change-request:'||p_actor_id::text||':'||p_request_id,0));
 delete from private.course_change_receipts where actor_id=p_actor_id and request_id=p_request_id and expires_at<=statement_timestamp();
 select * into receipt from private.course_change_receipts where actor_id=p_actor_id and request_id=p_request_id;
 if found then
   if receipt.operation<>'apply_course_design_command_v3' or receipt.course_id<>p_course_id or receipt.request_hash<>p_request_hash
     or receipt.result->>'contract'<>'aralearn.course-instructional-design-change.v1' then
     raise exception 'A identidade pertence a outra alteração.' using errcode='23514'; end if;
   return receipt.result||jsonb_build_object('idempotent',true);
 end if;
 perform 1 from auth.users where id=p_actor_id for key share;
 if not found then raise exception 'Pessoa inexistente ou inacessível.' using errcode='PT404'; end if;
 perform pg_advisory_xact_lock(hashtextextended('course-row:'||p_course_id::text,0));
 select * into strict course from public.courses where id=p_course_id for update;
 perform private.require_course_access_v1(p_course_id,p_actor_id,true);
 select * into plan from private.course_instructional_plans where course_id=p_course_id for update;
 if not found then raise exception 'Planejamento inexistente.' using errcode='PT404'; end if;
 if course.revision<>p_expected_course_revision or plan.version::numeric<>(p_command->>'expectedPlanVersion')::numeric then
   raise exception 'Curso ou planejamento mudou; releia o recorte.' using errcode='PT409'; end if;

 if command_type in('save_plan_item','remove_plan_item') then
   if p_command#>>'{scope,kind}'<>'course' or target<>p_course_id::text
     or not(p_command ?& array['itemId','itemKind','expectedItemVersion'])
     or p_command-array['type','scope','expectedPlanVersion','itemId','itemKind','expectedItemVersion']
       -(case when command_type='save_plan_item' then array['statement','description'] else array[]::text[] end)<>'{}'::jsonb
     or jsonb_typeof(p_command->'itemId') is distinct from 'string'
     or p_command->>'itemId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
     or jsonb_typeof(p_command->'itemKind') is distinct from 'string'
     or p_command->>'itemKind' not in('instructional_analysis_unit','evidence_requirement')
     or jsonb_typeof(p_command->'expectedItemVersion') is distinct from 'number'
     or p_command->>'expectedItemVersion'!~'^(0|[1-9][0-9]*)$' then
     raise exception 'Item instrucional inválido.' using errcode='22023'; end if;
   select * into item from private.course_instructional_plan_items where id=(p_command->>'itemId')::uuid;
   if found and (item.course_id<>p_course_id or item.item_kind<>p_command->>'itemKind') then
     raise exception 'Identidade de item incompatível.' using errcode='23514'; end if;
   if coalesce(item.version,0)::numeric<>(p_command->>'expectedItemVersion')::numeric then
     raise exception 'O item instrucional mudou.' using errcode='PT409'; end if;
   if command_type='save_plan_item' then
     if not(p_command ?& array['statement','description']) or jsonb_typeof(p_command->'statement') is distinct from 'string'
       or length(btrim(p_command->>'statement')) not between 1 and 2000
       or jsonb_typeof(p_command->'description') is distinct from 'string' or length(p_command->>'description')>4000 then
       raise exception 'Enunciado ou descrição inválido.' using errcode='22023'; end if;
     if item.id is null then
       insert into private.course_instructional_plan_items(id,course_id,instructional_plan_id,item_kind,position,statement,description)
       values((p_command->>'itemId')::uuid,p_course_id,plan.id,p_command->>'itemKind',
         (select coalesce(max(position),-1)+1 from private.course_instructional_plan_items where course_id=p_course_id and item_kind=p_command->>'itemKind'),
         p_command->>'statement',p_command->>'description'); changed:=true;
     elsif row(item.statement,item.description) is distinct from row(p_command->>'statement',p_command->>'description') then
       update private.course_instructional_plan_items set statement=p_command->>'statement',description=p_command->>'description',
         version=version+1,updated_at=statement_timestamp() where id=item.id; changed:=true;
     end if;
   else
     if item.id is null then raise exception 'Item instrucional inexistente.' using errcode='PT404'; end if;
     if exists(select 1 from private.course_design_target_plan_items where course_id=p_course_id and plan_item_id=item.id)
       or exists(select 1 from private.course_entities e where e.course_id=p_course_id and
         (e.design_snapshot::text like '%'||item.id::text||'%' or e.design_application::text like '%'||item.id::text||'%'))
       or exists(select 1 from private.course_source_attributions where course_id=p_course_id and target_kind='plan_item' and target_id=item.id::text) then
       raise exception 'O item ainda sustenta vínculos, aplicações ou fontes; preserve ou revise esse alcance antes de remover.' using errcode='PT409'; end if;
     delete from private.course_instructional_plan_items where id=item.id; changed:=true;
   end if;
   plan_changed:=changed;
 elsif command_type='set_target_plan_items' then
   if p_command#>>'{scope,kind}'<>'didactic_microsequence'
     or not(p_command ?& array['instructionalAnalysisUnitIds','evidenceRequirementIds'])
     or p_command-array['type','scope','expectedPlanVersion','instructionalAnalysisUnitIds','evidenceRequirementIds']<>'{}'::jsonb
     or not exists(select 1 from private.course_entities where course_id=p_course_id and entity_type='microsequence' and entity_id=target) then
     raise exception 'Vínculo instrucional inválido.' using errcode='22023'; end if;
   foreach field in array array['instructionalAnalysisUnitIds','evidenceRequirementIds'] loop
     supplied:=p_command->field;
     expected_kind:=case field when 'instructionalAnalysisUnitIds' then 'instructional_analysis_unit' else 'evidence_requirement' end;
     if jsonb_typeof(supplied) is distinct from 'array' or jsonb_array_length(supplied)>256 then
       raise exception 'Seleção instrucional inválida.' using errcode='22023'; end if;
     if exists(select 1 from jsonb_array_elements(supplied) value where jsonb_typeof(value)<>'string'
       or not exists(select 1 from private.course_instructional_plan_items i where i.course_id=p_course_id and i.item_kind=expected_kind and i.id::text=value#>>'{}'))
       or (select count(*)<>count(distinct value) from jsonb_array_elements(supplied)) then
       raise exception 'A seleção contém item ausente, repetido ou de outra natureza.' using errcode='23514'; end if;
     delete from private.course_design_target_plan_items where course_id=p_course_id and didactic_microsequence_id=target
       and plan_item_kind=expected_kind and not(supplied ? plan_item_id::text);
     get diagnostics affected=row_count; changed:=changed or affected>0;
     insert into private.course_design_target_plan_items(course_id,didactic_microsequence_id,plan_item_id,plan_item_kind)
       select p_course_id,target,(value#>>'{}')::uuid,expected_kind from jsonb_array_elements(supplied) on conflict do nothing;
     get diagnostics affected=row_count; changed:=changed or affected>0;
   end loop;
   plan_changed:=changed;
 else
   if p_command#>>'{scope,kind}'<>'didactic_microsequence' or p_command-array['type','scope','expectedPlanVersion','units']<>'{}'::jsonb
     or jsonb_typeof(p_command->'units') is distinct from 'array' or jsonb_array_length(p_command->'units') not between 1 and 64
     or (select count(*)<>count(distinct value->>'studyUnitId') from jsonb_array_elements(p_command->'units')) then
     raise exception 'Aplicações instrucionais inválidas.' using errcode='22023'; end if;
   for entry in select value from jsonb_array_elements(p_command->'units') loop
     if jsonb_typeof(entry) is distinct from 'object' or not(entry ?& array['studyUnitId','expectedStudyUnitVersion'])
       or entry-array['studyUnitId','expectedStudyUnitVersion','application']
         -(case when command_type='apply_study_unit_configuration' then array['automaticParameters'] else array[]::text[] end)<>'{}'::jsonb
       or jsonb_typeof(entry->'studyUnitId') is distinct from 'string'
       or jsonb_typeof(entry->'expectedStudyUnitVersion') is distinct from 'number'
       or entry->>'expectedStudyUnitVersion'!~'^[1-9][0-9]*$' then
       raise exception 'Alvo da aplicação inválido.' using errcode='22023'; end if;
     select * into unit from private.course_entities where course_id=p_course_id and entity_type='study_unit'
       and entity_id=entry->>'studyUnitId' and parent_id=target for update;
     if not found then raise exception 'Unidade inexistente neste recorte.' using errcode='PT404'; end if;
     if unit.version::numeric<>(entry->>'expectedStudyUnitVersion')::numeric then
       raise exception 'A unidade mudou; releia a aplicação.' using errcode='PT409'; end if;
     snapshot:=unit.design_snapshot;
     if command_type='apply_study_unit_configuration' then
       if jsonb_typeof(entry->'automaticParameters') is distinct from 'array'
         or jsonb_array_length(entry->'automaticParameters')>(select count(*) from private.course_design_parameter_definitions) then
         raise exception 'A calibração precisa de escolhas automáticas explícitas.' using errcode='22023'; end if;
       path:=private.course_design_scope_path_v1(p_course_id,'study_unit',unit.entity_id);
       current_parameters:=private.course_current_design_parameters_v1(p_course_id,path);
       if path is null or jsonb_array_length(current_parameters)<>(select count(*) from private.course_design_parameter_definitions) then
         raise exception 'A configuração corrente não pôde ser resolvida.' using errcode='23514'; end if;
       if exists(select 1 from jsonb_array_elements(current_parameters) v where jsonb_array_length(v->'conflicts')>0) then
         raise exception 'Resolva o conflito da condição de pesquisa antes de aplicar a configuração.' using errcode='PD409'; end if;
       if (select count(*)<>count(distinct v->>'parameterId') from jsonb_array_elements(entry->'automaticParameters') v)
         or exists(select 1 from jsonb_array_elements(entry->'automaticParameters') v where jsonb_typeof(v)<>'object'
           or not(v ?& array['parameterId','value','reason']) or v-array['parameterId','value','reason']<>'{}'::jsonb
           or not exists(select 1 from jsonb_array_elements(current_parameters) p where p->>'parameterId'=v->>'parameterId'
             and p#>>'{effectiveAssignment,mode}'='automatic' and p#>>'{effectiveAssignment,origin}'<>'research_condition')
           or private.valid_course_design_parameter_value_v1(v->>'parameterId',v->'value') is not true
           or jsonb_typeof(v->'reason') is distinct from 'string' or length(btrim(v->>'reason')) not between 1 and 1000) then
         raise exception 'Calibração inválida ou incompatível com uma fixação corrente.' using errcode='22023'; end if;
       applied_parameters:='[]'::jsonb;
       for parameter in select value from jsonb_array_elements(current_parameters) loop
         select value into choice from jsonb_array_elements(entry->'automaticParameters') where value->>'parameterId'=parameter->>'parameterId';
         effective:=parameter->'effectiveAssignment';
         if choice is null and (effective->'value' is null or effective->'value'='null'::jsonb) then
           raise exception 'Uma escolha automática ainda precisa de calibração contextual.' using errcode='PD409'; end if;
         applied_parameters:=applied_parameters||jsonb_build_array(jsonb_build_object('parameterId',parameter->>'parameterId',
           'value',case when choice is null then effective->'value' when jsonb_typeof(choice->'value')='array'
             then (select jsonb_agg(v order by v#>>'{}') from jsonb_array_elements(choice->'value') v) else choice->'value' end,
           'origin',case when choice is null then effective->>'origin' else 'automatic' end,
           'reason',case when choice is null then effective->>'reason' else choice->>'reason' end,
           'sourceScopeKind',case when choice is null then effective#>>'{sourceScope,kind}' else 'study_unit' end));
       end loop;
       snapshot:=jsonb_build_object('contract','aralearn.study-unit-design-snapshot.v2','parameterCatalogVersion','1.2.1',
         'didacticMicrosequenceId',target,'parameters',applied_parameters,
         'editorialDirections',coalesce((select jsonb_agg(jsonb_build_object('direction',v->>'guidance','origin',v->>'origin',
           'sourceScopeKind',v#>>'{sourceScope,kind}') order by ordinal) from jsonb_array_elements(
             private.course_current_authoring_guidance_v1(p_course_id,path)->'effectiveAssignments') with ordinality directions(v,ordinal)),'[]'::jsonb),
         'componentPolicy',(select jsonb_build_object('policy',v->'policy','origin',v->>'origin','sourceScopeKind',v#>>'{sourceScope,kind}')
           from jsonb_array_elements(jsonb_build_array(private.course_current_component_policy_v1(p_course_id,path)->'effectiveAssignment')) v));
     elsif snapshot is null then
       raise exception 'A unidade precisa receber configuração e aplicação expressas por aplicar_configuracao_instrucional.' using errcode='23514'; end if;
     application:=case when command_type='apply_study_unit_configuration' and not(entry ? 'application')
       then unit.design_application-array['contract','componentRefs'] else entry->'application' end;
     if jsonb_typeof(application) is distinct from 'object'
       or not(application ?& array['mode','introducedInstructionalAnalysisUnitIds','usedInstructionalAnalysisUnitIds','curriculumScopeItemIds','explanationApplications','practiceApplications'])
       or application-array['mode','introducedInstructionalAnalysisUnitIds','usedInstructionalAnalysisUnitIds','curriculumScopeItemIds','explanationApplications','practiceApplications']<>'{}'::jsonb
       or jsonb_typeof(application->'mode') is distinct from 'string'
       or application->>'mode' not in('expository','practice','mixed') then
       raise exception 'Forma da aplicação instrucional inválida.' using errcode='22023'; end if;
     foreach field in array array['introducedInstructionalAnalysisUnitIds','usedInstructionalAnalysisUnitIds','curriculumScopeItemIds','explanationApplications','practiceApplications'] loop
       if jsonb_typeof(application->field) is distinct from 'array' or jsonb_array_length(application->field)>256 then
         raise exception 'Lista da aplicação instrucional inválida.' using errcode='22023'; end if;
     end loop;
     for supplied in select value from jsonb_array_elements(application->'explanationApplications') loop
       if jsonb_typeof(supplied->'developedForms') is distinct from 'array'
         or jsonb_typeof(supplied->'notApplicable') is distinct from 'array' then
         raise exception 'Formas de explicação inválidas.' using errcode='22023'; end if;
       if jsonb_array_length(supplied->'developedForms')+jsonb_array_length(supplied->'notApplicable')=0
         or exists(select 1 from jsonb_array_elements(supplied->'developedForms') v where jsonb_typeof(v)<>'string')
         or exists(select 1 from jsonb_array_elements(supplied->'notApplicable') v where
           jsonb_typeof(v->'form') is distinct from 'string' or jsonb_typeof(v->'reason') is distinct from 'string')
         or (select count(*)<>count(distinct v) from jsonb_array_elements(supplied->'developedForms') v)
         or (select count(*)<>count(distinct v->>'form') from jsonb_array_elements(supplied->'notApplicable') v) then
         raise exception 'Formas de explicação inválidas ou repetidas.' using errcode='22023'; end if;
     end loop;
     for supplied in select value from jsonb_array_elements(application->'practiceApplications') loop
       if jsonb_typeof(supplied->'variedDimensions') is distinct from 'array'
         or jsonb_typeof(supplied->'opportunityId') is distinct from 'string'
         or jsonb_typeof(supplied->'invariantTaskOperation') is distinct from 'string' then
         raise exception 'Aplicação de prática inválida.' using errcode='22023'; end if;
       if exists(select 1 from jsonb_array_elements(supplied->'variedDimensions') v where jsonb_typeof(v)<>'string')
         or (select count(*)<>count(distinct v) from jsonb_array_elements(supplied->'variedDimensions') v) then
         raise exception 'Dimensões de prática inválidas ou repetidas.' using errcode='22023'; end if;
     end loop;
     foreach field in array array['introducedInstructionalAnalysisUnitIds','usedInstructionalAnalysisUnitIds','curriculumScopeItemIds'] loop
       expected_kind:=case field when 'curriculumScopeItemIds' then 'curriculum_scope_item' else 'instructional_analysis_unit' end;
       if exists(select 1 from jsonb_array_elements(application->field) v where jsonb_typeof(v)<>'string'
         or not exists(select 1 from private.course_design_target_plan_items a where a.course_id=p_course_id
           and a.didactic_microsequence_id=target and a.plan_item_kind=expected_kind and a.plan_item_id::text=v#>>'{}'))
         or (select count(*)<>count(distinct v) from jsonb_array_elements(application->field) v) then
         raise exception 'A aplicação contém referência repetida ou fora do recorte.' using errcode='23514'; end if;
     end loop;
     if exists(select 1 from jsonb_array_elements_text(application->'usedInstructionalAnalysisUnitIds') used(value)
       where application->'introducedInstructionalAnalysisUnitIds' ? used.value
         or exists(select 1 from jsonb_array_elements(application->'explanationApplications') ex where ex->>'instructionalAnalysisUnitId'=used.value))
       or exists(select 1 from jsonb_array_elements(application->'explanationApplications') ex
         where not exists(select 1 from private.course_design_target_plan_items a where a.course_id=p_course_id
           and a.didactic_microsequence_id=target and a.plan_item_kind='instructional_analysis_unit' and a.plan_item_id::text=ex->>'instructionalAnalysisUnitId'))
       or exists(select 1 from jsonb_array_elements(application->'practiceApplications') pr
         where not exists(select 1 from private.course_design_target_plan_items a where a.course_id=p_course_id
           and a.didactic_microsequence_id=target and a.plan_item_kind='evidence_requirement' and a.plan_item_id::text=pr->>'evidenceRequirementId')) then
       raise exception 'Uso, desenvolvimento ou requisito não corresponde ao repertório do recorte.' using errcode='23514'; end if;
     snapshot:=snapshot||jsonb_build_object(
       'instructionalAnalysisUnitIds',coalesce((select jsonb_agg(plan_item_id order by plan_item_id) from private.course_design_target_plan_items
         where course_id=p_course_id and didactic_microsequence_id=target and plan_item_kind='instructional_analysis_unit'),'[]'::jsonb),
       'evidenceRequirementIds',coalesce((select jsonb_agg(plan_item_id order by plan_item_id) from private.course_design_target_plan_items
         where course_id=p_course_id and didactic_microsequence_id=target and plan_item_kind='evidence_requirement'),'[]'::jsonb));
     if command_type='apply_study_unit_configuration' then
       snapshot:=snapshot||jsonb_build_object('appliedAt',case when snapshot is not distinct from unit.design_snapshot-'appliedAt'
         then unit.design_snapshot->'appliedAt' else to_jsonb(statement_timestamp()) end);
     end if;
     application:=application||jsonb_build_object('contract','aralearn.study-unit-design-application.v1',
       'componentRefs',private.course_component_refs_from_content_v1(unit.content));
     update private.course_entities e set design_snapshot=snapshot,design_application=application,updated_at=statement_timestamp()
       where e.course_id=p_course_id and e.entity_type='study_unit' and e.entity_id=unit.entity_id
       and row(e.design_snapshot,e.design_application) is distinct from row(snapshot,application);
     get diagnostics affected=row_count; changed:=changed or affected>0;
   end loop;
   select coalesce(jsonb_agg(jsonb_build_object('studyUnitId',e.entity_id,'didacticMicrosequenceId',e.parent_id,'position',e.position,
     'content',e.content,'designSnapshot',e.design_snapshot-'appliedAt','designApplication',e.design_application-'contract')),'[]'::jsonb)
     into all_units from private.course_entities e where e.course_id=p_course_id and e.entity_type='study_unit'
       and e.parent_id=target and e.design_application is not null;
   perform private.assert_course_materialization_pedagogy_v1(p_course_id,all_units);
   if exists(select 1 from private.course_entities e cross join lateral jsonb_array_elements_text(e.design_application->'introducedInstructionalAnalysisUnitIds') v
     where e.course_id=p_course_id and e.entity_type='study_unit' group by v having count(*)>1) then
     raise exception 'Uma unidade de análise possui mais de uma introdução no curso.' using errcode='23514'; end if;
   if exists(
     with ordered as materialized (
       select e.entity_id,e.design_application,row(m.position,l.position,s.position,e.position) location
       from private.course_entities e join private.course_entities s on s.course_id=e.course_id and s.entity_type='microsequence' and s.entity_id=e.parent_id
       join private.course_entities l on l.course_id=e.course_id and l.entity_type='lesson' and l.entity_id=s.parent_id
       join private.course_entities m on m.course_id=e.course_id and m.entity_type='module' and m.entity_id=l.parent_id
       where e.course_id=p_course_id and e.entity_type='study_unit' and e.design_application is not null
     ), introductions as (
       select u.entity_id,u.location,v.value id from ordered u
         cross join lateral jsonb_array_elements_text(u.design_application->'introducedInstructionalAnalysisUnitIds') v(value)
     ), uses as (
       select u.entity_id,u.location,v.value id from ordered u
         cross join lateral jsonb_array_elements_text(u.design_application->'usedInstructionalAnalysisUnitIds') v(value)
       union all select u.entity_id,u.location,v.value->>'instructionalAnalysisUnitId' from ordered u
         cross join lateral jsonb_array_elements(u.design_application->'explanationApplications') v(value)
     ) select 1 from uses u where not exists(select 1 from introductions i where i.id=u.id and i.location<=u.location)
   ) then raise exception 'O uso ou desenvolvimento precisa conservar sua introdução anterior no curso.' using errcode='23514'; end if;
 end if;
 if plan_changed then update private.course_instructional_plans set version=version+1,updated_at=statement_timestamp() where id=plan.id returning * into plan; end if;
 if changed then update public.courses set revision=revision+1,updated_at=statement_timestamp() where id=p_course_id returning * into course; end if;
 result:=jsonb_build_object('contract','aralearn.course-instructional-design-change.v1','courseId',p_course_id,
   'courseRevision',course.revision,'planVersion',plan.version,'requestId',p_request_id,'changed',changed,'idempotent',false,
   'commandType',command_type,'scope',p_command->'scope');
 insert into private.course_change_receipts(actor_id,request_id,operation,course_id,request_hash,result)
   values(p_actor_id,p_request_id,'apply_course_design_command_v3',p_course_id,p_request_hash,result);
 return result;
end $function$;
revoke all on function public.apply_course_design_command_for_actor_v3(uuid,uuid,bigint,jsonb,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.apply_course_design_command_for_actor_v3(uuid,uuid,bigint,jsonb,text,text,text) to service_role;

commit;
