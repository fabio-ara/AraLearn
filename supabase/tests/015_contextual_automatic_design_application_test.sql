begin;
select no_plan();
select set_config('request.jwt.claim.role','service_role',true);
set constraints all deferred;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','95000000-0000-4000-8000-000000000001','authenticated','authenticated','contextual-owner@example.test','',now(),'{}','{}',now(),now());
insert into public.courses(id,owner_id,title,goal,revision) values(
  '95000000-0000-4000-8000-000000000301',
  '95000000-0000-4000-8000-000000000001',
  'Curso descartavel de calibracao','Validar configuracao propria da unidade.',1
);
insert into private.course_instructional_plans(
  id,course_id,audience,instructional_scope,version,curriculum_map_status
) values(
  '95000000-0000-4000-8000-000000000311',
  '95000000-0000-4000-8000-000000000301',
  'Publico iniciante.','Uma situacao concreta.',1,'approved'
);
insert into private.course_instructional_plan_items(
  id,course_id,instructional_plan_id,item_kind,position,statement,description
) values(
  '95000000-0000-4000-8000-000000000321',
  '95000000-0000-4000-8000-000000000301',
  '95000000-0000-4000-8000-000000000311','curriculum_scope_item',0,
  'Reconhecer os elementos da situacao.',''
);
insert into private.course_entities(
  course_id,entity_type,entity_id,parent_type,parent_id,position,content
) values
  ('95000000-0000-4000-8000-000000000301','module','module-calibration',null,null,0,
    '{"title":"Situacao","guide":{"goal":"Observar o problema.","include":[],"exclude":[],"notation":[],"avoid":[]}}'::jsonb),
  ('95000000-0000-4000-8000-000000000301','lesson','lesson-calibration','module','module-calibration',0,
    '{"title":"Elementos","guide":{"goal":"Distinguir os elementos.","include":[],"exclude":[],"notation":[],"avoid":[]}}'::jsonb),
  ('95000000-0000-4000-8000-000000000301','microsequence','micro-calibration','lesson','lesson-calibration',0,
    '{"title":"Problema concreto","goal":"Reconhecer os elementos.","role":"explain","dependsOn":[],"scopeItemIds":["95000000-0000-4000-8000-000000000321"],"covers":["Reconhecer os elementos da situacao."],"checks":[],"errors":[]}'::jsonb);
insert into private.course_design_target_plan_items(
  course_id,didactic_microsequence_id,plan_item_id,plan_item_kind
) values(
  '95000000-0000-4000-8000-000000000301','micro-calibration',
  '95000000-0000-4000-8000-000000000321','curriculum_scope_item'
);
insert into private.course_authoring_parts(
  id,course_id,instructional_plan_id,position,title,intent,progression
) values(
  '95000000-0000-4000-8000-000000000341',
  '95000000-0000-4000-8000-000000000301',
  '95000000-0000-4000-8000-000000000311',0,
  'Situacao concreta','Produzir uma experiencia focal.',
  '["Apresentar o problema."]'::jsonb
);
insert into private.course_authoring_part_didactic_microsequences(
  course_id,authoring_part_id,didactic_microsequence_id,production_position
) values(
  '95000000-0000-4000-8000-000000000301',
  '95000000-0000-4000-8000-000000000341','micro-calibration',0
);

-- Uma fixação humana deve atravessar a calibração sem perder valor, origem ou motivo.
insert into private.course_design_parameter_assignments(course_id,parameter_id,scope_kind,scope_ref,value,origin,reason,mode)
values('95000000-0000-4000-8000-000000000301','study_unit_content_word_target','course','95000000-0000-4000-8000-000000000301','240','author','Desenvolver a explicação sem abreviar.','fixed');
create temporary table resolved as select private.course_current_design_parameters_v1(
  '95000000-0000-4000-8000-000000000301',private.course_design_scope_path_v1(
    '95000000-0000-4000-8000-000000000301','didactic_microsequence','micro-calibration')) as parameters;
create temporary table payload as
with parameters as (
  select jsonb_agg(jsonb_build_object(
    'parameterId',parameter.value->>'parameterId',
    'value',case when parameter.value#>>'{effectiveAssignment,mode}'='fixed' then parameter.value#>'{effectiveAssignment,value}'
      when definition.parameter_id='authoring_part_microsequence_target' then '3'::jsonb
      when definition.parameter_id='authoring_batch_part_target' then '2'::jsonb
      when definition.parameter_id='authoring_pause_frequency' then '"each_part"'::jsonb
      else definition.default_value end,
    'origin',case when parameter.value#>>'{effectiveAssignment,mode}'='fixed' then parameter.value#>>'{effectiveAssignment,origin}' else 'automatic' end,
    'reason',case when parameter.value#>>'{effectiveAssignment,mode}'='fixed' then parameter.value#>>'{effectiveAssignment,reason}' else 'Escolha contextual sintética deste teste.' end,
    'sourceScopeKind',case when parameter.value#>>'{effectiveAssignment,mode}'='fixed' then parameter.value#>>'{effectiveAssignment,sourceScope,kind}'
      when 'study_unit'=any(definition.supported_scopes) then 'study_unit' else 'course' end
  ) order by parameter.ordinal) as value
  from resolved cross join lateral jsonb_array_elements(resolved.parameters) with ordinality parameter(value,ordinal)
  join private.course_design_parameter_definitions definition on definition.parameter_id=parameter.value->>'parameterId'
), policy as (
  select private.course_current_component_policy_v1('95000000-0000-4000-8000-000000000301',private.course_design_scope_path_v1('95000000-0000-4000-8000-000000000301','didactic_microsequence','micro-calibration'))->'effectiveAssignment' as value
)
select jsonb_build_array(jsonb_build_object(
  'studyUnitId','unit-contextual','position',1,'didacticMicrosequenceId','micro-calibration',
  'content',jsonb_build_object('title','Uma situação concreta','content','[]'::jsonb,'response',null,'feedback','[]'::jsonb,'topics','[]'::jsonb),
  'designSnapshot',jsonb_build_object('contract','aralearn.study-unit-design-snapshot.v2','parameterCatalogVersion','1.2.0',
    'didacticMicrosequenceId','micro-calibration','instructionalAnalysisUnitIds','[]'::jsonb,'evidenceRequirementIds','[]'::jsonb,
    'parameters',parameters.value,'editorialDirections','[]'::jsonb,
    'componentPolicy',jsonb_build_object('policy',policy.value->'policy','origin',policy.value->>'origin','sourceScopeKind',policy.value#>>'{sourceScope,kind}')),
  'designApplication',jsonb_build_object('mode','expository','introducedInstructionalAnalysisUnitIds','[]'::jsonb,'usedInstructionalAnalysisUnitIds','[]'::jsonb,
    'curriculumScopeItemIds',jsonb_build_array('95000000-0000-4000-8000-000000000321'),'explanationApplications','[]'::jsonb,'practiceApplications','[]'::jsonb,'componentRefs','[]'::jsonb),
  'sourceLinks','[]'::jsonb)) as units from parameters,policy;
create function pg_temp.materialize_contextual(request_id text,p_units jsonb) returns jsonb language sql as $f$
  select public.materialize_course_authoring_part_for_actor_v2(
    '95000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000301','95000000-0000-4000-8000-000000000341',1,1,'[]'::jsonb,
    '[{"didacticMicrosequenceId":"micro-calibration","instructionalAnalysisUnitIds":[],"evidenceRequirementIds":[]}]'::jsonb,
    p_units,request_id,encode(extensions.digest(p_units::text,'sha256'),'hex'))
$f$;
select ok(private.valid_applied_course_design_parameters_v1(payload.units#>'{0,designSnapshot,parameters}',resolved.parameters),'calibração tipada completa aceita cadência automática ainda sem valor corrente') from payload,resolved;
select ok(not private.valid_applied_course_design_parameters_v1(jsonb_set(payload.units#>'{0,designSnapshot,parameters}','{5,value}','241'),resolved.parameters),'fixação humana não pode ser substituída pela escolha automática') from payload,resolved;
select ok(not private.valid_applied_course_design_parameters_v1(jsonb_set(payload.units#>'{0,designSnapshot,parameters}','{8,sourceScopeKind}','"study_unit"'),resolved.parameters),'parâmetro de parte não ganha escopo de unidade') from payload,resolved;
select ok(not private.valid_applied_course_design_parameters_v1(jsonb_set(payload.units#>'{0,designSnapshot,parameters}','{0,reason}','""'),resolved.parameters),'valor escolhido exige motivo') from payload,resolved;
select throws_ok($$select pg_temp.materialize_contextual('context-invalid-fixed',jsonb_set(units,'{0,designSnapshot,parameters,5,value}','241')) from payload$$,'22023',null,'writer atômico recusa divergência fixa sem gravar a unidade');
select is((select count(*) from private.course_entities where course_id='95000000-0000-4000-8000-000000000301' and entity_type='study_unit'),0::bigint,'rejeição não deixa conteúdo parcial');
select throws_ok($$select pg_temp.materialize_contextual('context-old-policy',jsonb_set(units,'{0,designSnapshot,componentPolicy,policy,catalogVersion}','"1-4616b2e5"')) from payload$$,
 '40001','A direção editorial ou política de componentes divergiu da configuração corrente.',
 'materialização nova exige política corrente mesmo quando as referências continuam iguais');
select ok(not exists(select 1 from private.course_change_receipts where actor_id='95000000-0000-4000-8000-000000000001' and request_id='context-old-policy'),
 'política antiga não deixa recibo de materialização');
select lives_ok($$select pg_temp.materialize_contextual('context-automatic-01',units) from payload$$,'writer materializa escolha automática contextual sem mutação prévia das preferências');
select is((select design_application->>'contract' from private.course_entities where course_id='95000000-0000-4000-8000-000000000301' and entity_id='unit-contextual'),
 'aralearn.study-unit-design-application.v1','aplicação persistida inclui o discriminador do contrato');
select is((select revision from public.courses where id='95000000-0000-4000-8000-000000000301'),2::bigint,'materialização usa uma revisão atômica');
select is((select count(*) from private.course_design_parameter_assignments where course_id='95000000-0000-4000-8000-000000000301' and parameter_id in('authoring_part_microsequence_target','authoring_batch_part_target','authoring_pause_frequency')),0::bigint,'cadência aplicada não altera a intenção corrente no curso');
select is((select jsonb_agg(parameter.value->'value' order by parameter.ordinal) from private.course_entities unit cross join lateral jsonb_array_elements(unit.design_snapshot->'parameters') with ordinality parameter(value,ordinal) where unit.course_id='95000000-0000-4000-8000-000000000301' and unit.entity_id='unit-contextual' and parameter.value->>'parameterId' in('authoring_part_microsequence_target','authoring_batch_part_target','authoring_pause_frequency')),'[3,2,"each_part"]'::jsonb,'snapshot preserva valores independentes de parte, lote e pausa');
select is((select count(*) from private.course_design_parameter_assignments where course_id='95000000-0000-4000-8000-000000000301' and scope_kind='study_unit' and mode='automatic' and origin='automatic' and reason='Escolha contextual sintética deste teste.'),8::bigint,'apenas escolhas locais admitidas são seladas com motivo real');
select is((select value from private.course_design_parameter_assignments where course_id='95000000-0000-4000-8000-000000000301' and parameter_id='study_unit_content_word_target'),'240'::jsonb,'fixação humana permanece intacta');
select is((select pg_temp.materialize_contextual('context-automatic-01',units)->>'idempotent' from payload),'true','resposta perdida retorna o recibo da mesma aplicação');
select is((select revision from public.courses where id='95000000-0000-4000-8000-000000000301'),2::bigint,'repetição não reaplica conteúdo nem muda revisão');
select throws_ok($$select pg_temp.materialize_contextual('context-stale-0001',units) from payload$$,'40001',null,'nova aplicação não adota revisão mais recente silenciosamente');
select ok(not private.valid_applied_course_design_parameters_v1(payload.units#>'{0,designSnapshot,parameters}',jsonb_set(resolved.parameters,'{0,conflicts}','[{"fixedValue":1,"exceptionValue":2}]')),'conflito de pesquisa exige resolução antes da aplicação contextual') from payload,resolved;
select * from finish();
rollback;
