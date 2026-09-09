begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
set constraints all deferred;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);

-- Identidades exclusivas desta prova. Funções reais, sem substituir guards,
-- catálogo, resolvers ou escritor; tudo termina em rollback. A declaração de
-- revisão abaixo é um ato sintético de teste, não inspeção humana de um curso.
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','99305000-0000-4000-8000-000000000001','authenticated','authenticated','design-owner@example.test','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','99305000-0000-4000-8000-000000000002','authenticated','authenticated','design-other@example.test','',now(),'{}','{}',now(),now());
insert into public.courses(id,owner_id,title,goal,visibility)
values('99305000-0000-4000-8000-000000000101','99305000-0000-4000-8000-000000000001','Desenho sintético','Relacionar elementos sem confundir intenção e aplicação.','private');
insert into private.course_instructional_plans(course_id) values('99305000-0000-4000-8000-000000000101');
insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content) values
('99305000-0000-4000-8000-000000000101','module','m',null,null,0,'{"title":"Módulo"}'),
('99305000-0000-4000-8000-000000000101','lesson','l','module','m',0,'{"title":"Lição"}'),
('99305000-0000-4000-8000-000000000101','microsequence','s','lesson','l',0,'{"title":"Conexões","goal":"Relacionar elementos.","dependsOn":[],"explanationPlan":{"purpose":"Desenvolver a relação entre os elementos.","prerequisites":[],"relations":[],"sourceIds":[]},"explanation":{"title":"Uma conexão entre elementos","content":[{"id":"base-p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"A conexão permite a interação entre elementos. Retirar essa conexão interrompe a interação; mudar apenas a cor preserva a relação. Compare os dois casos para identificar qual mudança altera o funcionamento."}}]}}');

create function pg_temp.design_course() returns uuid language sql as $$select '99305000-0000-4000-8000-000000000101'::uuid$$;
create function pg_temp.design_owner() returns uuid language sql as $$select '99305000-0000-4000-8000-000000000001'::uuid$$;
create function pg_temp.design_revision() returns bigint language sql as $$select revision from public.courses where id=pg_temp.design_course()$$;
create function pg_temp.design_plan_version() returns bigint language sql as $$select version from private.course_instructional_plans where course_id=pg_temp.design_course()$$;
create function pg_temp.design_write(command jsonb,request_id text,expected_revision bigint default null,actor uuid default null)
returns jsonb language plpgsql as $f$
declare revision bigint:=coalesce(expected_revision,pg_temp.design_revision()); body jsonb;
begin
  body:=jsonb_build_object('scope',jsonb_build_object('kind','course','ref',pg_temp.design_course()))||command;
  if body->>'type' in('save_plan_item','remove_plan_item','set_target_plan_items','set_study_unit_applications','apply_study_unit_configuration')
    and not(body ? 'expectedPlanVersion') then body:=body||jsonb_build_object('expectedPlanVersion',pg_temp.design_plan_version()); end if;
  return public.apply_course_design_command_for_actor_v3(coalesce(actor,pg_temp.design_owner()),pg_temp.design_course(),revision,body,request_id,
    private.course_design_json_hash_v1(jsonb_build_object('courseId',pg_temp.design_course(),'expectedCourseRevision',revision,'command',body)),'mcp');
end $f$;
create function pg_temp.design_item(id text,kind text default 'instructional_analysis_unit',version bigint default 0,enunciado text default 'Conexão')
returns jsonb language sql as $$select jsonb_build_object('type','save_plan_item','itemId',id,'itemKind',kind,'expectedItemVersion',version,
  'statement',enunciado,'description','Relação observável entre elementos.')$$;
create function pg_temp.design_links(with_evidence boolean default false) returns jsonb language sql as $$
 select jsonb_build_object('type','set_target_plan_items','scope',jsonb_build_object('kind','didactic_microsequence','ref','s'),
 'instructionalAnalysisUnitIds','["99305000-0000-4000-8000-000000000200","99305000-0000-4000-8000-000000000201"]'::jsonb,
 'evidenceRequirementIds',case when with_evidence then '["99305000-0000-4000-8000-000000000202"]'::jsonb else '[]'::jsonb end)
$$;
create function pg_temp.design_application(practice boolean default false) returns jsonb language sql as $$
 select jsonb_build_object('mode',case when practice then 'practice' else 'expository' end,
 'introducedInstructionalAnalysisUnitIds',case when practice then '[]'::jsonb else '["99305000-0000-4000-8000-000000000201"]'::jsonb end,
 'usedInstructionalAnalysisUnitIds',case when practice then '["99305000-0000-4000-8000-000000000201"]'::jsonb else '[]'::jsonb end,
 'curriculumScopeItemIds','[]'::jsonb,
 'explanationApplications',case when practice then '[]'::jsonb else '[{"instructionalAnalysisUnitId":"99305000-0000-4000-8000-000000000201","developedForms":["plain_definition"],"notApplicable":[]}]'::jsonb end,
 'practiceApplications',case when practice then '[{"evidenceRequirementId":"99305000-0000-4000-8000-000000000202","opportunityId":"caso-1","invariantTaskOperation":"Relacionar elementos","variedDimensions":["case_or_data"]}]'::jsonb else '[]'::jsonb end)
$$;
create function pg_temp.design_calibration(unit_id text) returns jsonb language sql as $$
 select coalesce(jsonb_agg(jsonb_build_object('parameterId',d.parameter_id,'value',case
   when d.parameter_id='required_explanation_forms' then '["plain_definition"]'::jsonb
   when d.parameter_id='minimum_distinct_practice_opportunities_per_evidence_requirement' then '1'::jsonb
   when d.parameter_id='required_practice_variation_dimensions' then '["case_or_data"]'::jsonb
   else d.default_value end,'reason','Calibração contextual escolhida expressamente pela fixture.') order by d.ordinal),'[]'::jsonb)
 from jsonb_array_elements(private.course_current_design_parameters_v1(pg_temp.design_course(),
   private.course_design_scope_path_v1(pg_temp.design_course(),'study_unit',unit_id))) p
 join private.course_design_parameter_definitions d on d.parameter_id=p->>'parameterId'
 where p#>>'{effectiveAssignment,mode}'='automatic'
$$;
create function pg_temp.design_configure(unit_id text,application jsonb default null) returns jsonb language sql as $$
 select jsonb_build_object('type','apply_study_unit_configuration','scope',jsonb_build_object('kind','didactic_microsequence','ref','s'),
 'units',jsonb_build_array(jsonb_build_object('studyUnitId',unit_id,'expectedStudyUnitVersion',1,'automaticParameters',pg_temp.design_calibration(unit_id))
   ||case when application is null then '{}'::jsonb else jsonb_build_object('application',application) end))
$$;
create function pg_temp.design_apply(unit_id text,application jsonb) returns jsonb language sql as $$
 select jsonb_build_object('type','set_study_unit_applications','scope',jsonb_build_object('kind','didactic_microsequence','ref','s'),
 'units',jsonb_build_array(jsonb_build_object('studyUnitId',unit_id,'expectedStudyUnitVersion',1,'application',application)))
$$;

create temporary table design_initial as select pg_temp.design_item('99305000-0000-4000-8000-000000000201')||'{"expectedPlanVersion":1}'::jsonb command;
create temporary table design_first as select pg_temp.design_write(command,'design-create-analysis',1) value from design_initial;
select is((select value->>'planVersion' from design_first),'2','Repertório avança a versão do plano antes de unidades');
select is((select count(*) from private.course_entities where course_id=pg_temp.design_course() and entity_type='study_unit'),0::bigint,'Manutenção do repertório não fabrica lote ou unidade');
select is(pg_temp.design_write((select command from design_initial),'design-create-analysis',1)->>'idempotent','true','Replay recupera a identidade e os fences originais');
select is(pg_temp.design_revision(),2::bigint,'Replay não incrementa a revisão novamente');
select throws_ok($$select pg_temp.design_write((select command||'{"statement":"Outra intenção"}' from design_initial),'design-create-analysis',1)$$,'23514',null,'Mesma identidade recusa payload divergente');
select is(pg_temp.design_write(pg_temp.design_item('99305000-0000-4000-8000-000000000201','instructional_analysis_unit',1),'design-no-op-item')->>'changed','false','Gravação idêntica preserva versões');
select lives_ok($$select pg_temp.design_write(pg_temp.design_item('99305000-0000-4000-8000-000000000200','instructional_analysis_unit',0,'Continuidade'),'design-second-analysis')$$,'Segundo item é acrescentado sem reescrever o primeiro');
select lives_ok($$select pg_temp.design_write(pg_temp.design_item('99305000-0000-4000-8000-000000000202','evidence_requirement',0,'Relacionar elementos'),'design-create-evidence')$$,'Requisito de evidência pertence a sua própria natureza');
select throws_ok($$select pg_temp.design_write(pg_temp.design_links(),'design-stale-course',1)$$,'PT409',null,'Curso obsoleto não grava vínculo');
select throws_ok($$select pg_temp.design_write(pg_temp.design_links()||'{"expectedPlanVersion":1}','design-stale-plan')$$,'PT409',null,'Plano obsoleto não grava vínculo');
select throws_ok($$select pg_temp.design_write(pg_temp.design_links(),'design-wrong-owner',null,'99305000-0000-4000-8000-000000000002')$$,'PT404',null,'Outro ator não descobre nem altera o curso privado');
select lives_ok($$select pg_temp.design_write(pg_temp.design_links(),'design-target-links')$$,'Vínculos de análise são salvos antes das unidades');
select throws_ok($$select pg_temp.design_write('{"type":"remove_plan_item","itemId":"99305000-0000-4000-8000-000000000201","itemKind":"instructional_analysis_unit","expectedItemVersion":1}','design-remove-linked')$$,'PT409',null,'Item que sustenta vínculo não é removido');
select is((select count(*) from private.course_instructional_plan_items where course_id=pg_temp.design_course()),3::bigint,'Itens omitidos permanecem no repertório');

insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content) values
('99305000-0000-4000-8000-000000000101','study_unit','u1','microsequence','s',1,'{"title":"Observe a conexão","role":"theory","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Uma conexão permite a interação entre elementos. Compare com a situação em que ela é retirada."}}],"response":null,"feedback":[],"topics":[]}'),
('99305000-0000-4000-8000-000000000101','study_unit','u2','microsequence','s',2,'{"title":"Relacione os elementos","role":"theory","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Considere a mesma conexão em outro par de elementos. Explique qual alteração interrompe a interação e por quê."}}],"response":null,"feedback":[],"topics":[]}');
-- Preparação da proveniência chama o hook real usado pelo materializador;
-- nenhuma atualização direta fabrica applied_explanation_basis.
select ok(private.capture_course_applied_explanation_basis_v1(pg_temp.design_course(),
 '[{"studyUnitId":"u1","didacticMicrosequenceId":"s"}]'),'Hook protegido registra a base salva da fixture');
create temporary table design_content_before as select content,version,applied_explanation_basis from private.course_entities where course_id=pg_temp.design_course() and entity_id='u1';
select throws_ok($$select pg_temp.design_write(pg_temp.design_configure('u1'),'design-legacy-no-application')$$,'22023',null,'Legado sem aplicação exige declaração expressa');
select lives_ok($$select pg_temp.design_write(pg_temp.design_configure('u1',pg_temp.design_application()),'design-first-configuration')$$,'Configuração e aplicação expressas inicializam legado sem reescrever texto');
select is((select content from private.course_entities where course_id=pg_temp.design_course() and entity_id='u1'),(select content from design_content_before),'Conteúdo literal foi preservado');
select is((select applied_explanation_basis from private.course_entities where course_id=pg_temp.design_course() and entity_id='u1'),(select applied_explanation_basis from design_content_before),'A base aplicada original foi preservada');
select is((select version from private.course_entities where course_id=pg_temp.design_course() and entity_id='u1'),1::bigint,'Metadados de desenho não fingem nova versão do texto');
select is((select design_snapshot->'instructionalAnalysisUnitIds' from private.course_entities where course_id=pg_temp.design_course() and entity_id='u1'),
 '["99305000-0000-4000-8000-000000000201","99305000-0000-4000-8000-000000000200"]'::jsonb,'Snapshot segue position/id e não ordem de UUID ou de entrada');
select ok((select private.valid_applied_course_design_parameters_v1(design_snapshot->'parameters',private.course_current_design_parameters_v1(pg_temp.design_course(),
 private.course_design_scope_path_v1(pg_temp.design_course(),'study_unit','u1'))) from private.course_entities where course_id=pg_temp.design_course() and entity_id='u1'),
 'Snapshot produzido é aceito pelo validador completo usado na materialização posterior');
select is((select count(*) from private.course_entities e cross join lateral jsonb_array_elements(e.design_snapshot->'parameters') p
 where e.course_id=pg_temp.design_course() and e.entity_id='u1' and p->>'parameterId' in('authoring_part_microsequence_target','authoring_batch_part_target','authoring_pause_frequency')
 and p->>'sourceScopeKind'='course'),3::bigint,'Os três parâmetros exclusivos do curso mantêm procedência admitida pelo catálogo');
select is((select p->>'sourceScopeKind' from private.course_entities e cross join lateral jsonb_array_elements(e.design_snapshot->'parameters') p
 where e.course_id=pg_temp.design_course() and e.entity_id='u1' and p->>'parameterId'='new_analysis_unit_ceiling_per_expository_study_unit'),
 'study_unit','Calibração contextual usa a unidade quando esse escopo é admitido');
select is(private.course_content_review_v1(pg_temp.design_course(),'study_unit','u1')->>'state','draft','Configuração não declara revisão humana');
create temporary table design_snapshot_before as select design_snapshot,design_application from private.course_entities where course_id=pg_temp.design_course() and entity_id='u1';
select is(pg_temp.design_write(pg_temp.design_configure('u1'),'design-config-identical')->>'changed','false','Reaplicação idêntica conserva o snapshot');
select is((select design_snapshot->'appliedAt' from private.course_entities where course_id=pg_temp.design_course() and entity_id='u1'),(select design_snapshot->'appliedAt' from design_snapshot_before),'No-op conserva a data aplicada');
select is(pg_temp.design_write(pg_temp.design_apply('u1',pg_temp.design_application()),'design-application-identical')->>'changed','false','Aplicação declarada idêntica também é no-op');
select throws_ok($$select pg_temp.design_write(pg_temp.design_apply('u1',jsonb_set(pg_temp.design_application(),'{explanationApplications,0,developedForms}','["invented"]')),'design-invalid-form')$$,'22023',null,'Forma inexistente é recusada pelo validador real');

select lives_ok($$select public.set_course_content_review_for_actor_v1(pg_temp.design_owner(),pg_temp.design_course(),'study_unit','u1',
 private.course_content_basis_hash_v1(pg_temp.design_course(),'study_unit','u1'),true,'design-synthetic-review')$$,'Declaração sintética usa writer de revisão protegido');
create temporary table design_review_before as select content_review from private.course_entities where course_id=pg_temp.design_course() and entity_id='u1';
select is(private.course_content_review_v1(pg_temp.design_course(),'study_unit','u1')->>'state','current','A marca corresponde à base inspecionada na fixture');
select lives_ok($$select pg_temp.design_write('{"type":"set_parameter","parameterId":"study_unit_content_word_target","value":240,"origin":"author","reason":"Fixação expressa desta fixture."}','design-fix-intent')$$,'Writer vigente altera intenção do curso');
select is((select design_snapshot from private.course_entities where course_id=pg_temp.design_course() and entity_id='u1'),(select design_snapshot from design_snapshot_before),'Intenção futura não reconfigura a unidade automaticamente');
select lives_ok($$select pg_temp.design_write(pg_temp.design_configure('u1'),'design-reconfigure-explicit')$$,'Operação própria aplica intenção vigente à unidade existente');
select is((select p->'value' from private.course_entities e cross join lateral jsonb_array_elements(e.design_snapshot->'parameters') p
 where e.course_id=pg_temp.design_course() and e.entity_id='u1' and p->>'parameterId'='study_unit_content_word_target'),'240'::jsonb,'Snapshot relido contém o valor fixado corrente');
select is((select content from private.course_entities where course_id=pg_temp.design_course() and entity_id='u1'),(select content from design_content_before),'Aplicar intenção preserva texto até correção expressa');
select is((select content_review from private.course_entities where course_id=pg_temp.design_course() and entity_id='u1'),(select content_review from design_review_before),'A decisão anterior permanece como registro');
select is(private.course_content_review_v1(pg_temp.design_course(),'study_unit','u1')->>'state','stale','Snapshot materialmente diferente desatualiza a revisão sem apagá-la');
select throws_ok($$select pg_temp.design_write(jsonb_set(pg_temp.design_configure('u1'),'{units,0,automaticParameters}',
 '[{"parameterId":"study_unit_content_word_target","value":220,"reason":"Tentativa de ignorar fixação."}]'),'design-fixed-override')$$,'22023',null,'Calibração não atravessa fixação do autor');

select lives_ok($$select pg_temp.design_write(pg_temp.design_links(true),'design-link-evidence')$$,'Evidência é vinculada expressamente à microssequência');
select lives_ok($$select pg_temp.design_write(pg_temp.design_configure('u2',pg_temp.design_application(true)),'design-legacy-practice')$$,'Segundo legado recebe aplicação de prática coerente com introdução anterior');
select is((select design_application#>>'{practiceApplications,0,evidenceRequirementId}' from private.course_entities where course_id=pg_temp.design_course() and entity_id='u2'),
 '99305000-0000-4000-8000-000000000202','Aplicação mantém a identidade do requisito de evidência');
select is((select applied_explanation_basis from private.course_entities where course_id=pg_temp.design_course() and entity_id='u2'),null::jsonb,'Configuração de legado não inventa base histórica de produção');
select throws_ok($$select pg_temp.design_write(pg_temp.design_apply('u2',jsonb_set(pg_temp.design_application(true),'{practiceApplications,0,invariantTaskOperation}','"Outra operação"')),'design-wrong-practice')$$,'23514',null,'A prática mantém a operação observável do requisito');
select throws_ok($$select pg_temp.design_write(pg_temp.design_apply('u2',pg_temp.design_application(true)||jsonb_build_object('mode','mixed',
 'introducedInstructionalAnalysisUnitIds',pg_temp.design_application()->'introducedInstructionalAnalysisUnitIds','usedInstructionalAnalysisUnitIds','[]'::jsonb,
 'explanationApplications',pg_temp.design_application()->'explanationApplications')),'design-duplicate-introduction')$$,'23514',null,'Uma segunda introdução da mesma identidade é recusada mantendo a prática válida');

select lives_ok($$select pg_temp.design_write(jsonb_set(pg_temp.design_configure('u1'),'{units,0,automaticParameters,0,reason}',
 '"  Calibração contextual com motivo normalizado.  "'),'design-normalize-calibration')$$,'Motivo automático recebe normalização antes da validação completa');
select is((select design_snapshot#>>'{parameters,0,reason}' from private.course_entities where course_id=pg_temp.design_course() and entity_id='u1'),
 'Calibração contextual com motivo normalizado.','Snapshot conserva o motivo sem espaços externos');
select ok((select private.valid_applied_course_design_parameters_v1(design_snapshot->'parameters',private.course_current_design_parameters_v1(pg_temp.design_course(),
 private.course_design_scope_path_v1(pg_temp.design_course(),'study_unit','u1'))) from private.course_entities where course_id=pg_temp.design_course() and entity_id='u1'),
 'Snapshot com intenção fixa e calibração normalizada permanece aceito pelo validador completo');
create temporary table design_normalized_before as select design_snapshot,pg_temp.design_revision() revision from private.course_entities where course_id=pg_temp.design_course() and entity_id='u1';
select throws_ok($$select pg_temp.design_write(jsonb_set(pg_temp.design_configure('u1'),'{units,0,automaticParameters,0,reason}',
 to_jsonb('Motivo com controle '||chr(1)||' inválido.')),'design-invalid-calibration-control')$$,'22023',null,'Validador completo recusa controle proibido no motivo automático');
select is((select design_snapshot from private.course_entities where course_id=pg_temp.design_course() and entity_id='u1'),
 (select design_snapshot from design_normalized_before),'Calibração inválida preserva o snapshot anterior');
select is(pg_temp.design_revision(),(select revision from design_normalized_before),'Calibração inválida não avança a revisão');

create temporary table design_batch_before as select jsonb_agg(jsonb_build_object('id',entity_id,'snapshot',design_snapshot,'application',design_application) order by entity_id) value,
 pg_temp.design_revision() revision from private.course_entities where course_id=pg_temp.design_course() and entity_type='study_unit';
select throws_ok($$select pg_temp.design_write(jsonb_build_object('type','apply_study_unit_configuration','scope',jsonb_build_object('kind','didactic_microsequence','ref','s'),
 'units',jsonb_build_array(pg_temp.design_configure('u1')#>'{units,0}',jsonb_set(pg_temp.design_configure('u2')#>'{units,0}','{expectedStudyUnitVersion}','999'))),'design-atomic-stale-unit')$$,
 'PT409',null,'Versão obsoleta em outra unidade desfaz o recorte inteiro');
select is((select jsonb_agg(jsonb_build_object('id',entity_id,'snapshot',design_snapshot,'application',design_application) order by entity_id) from private.course_entities where course_id=pg_temp.design_course() and entity_type='study_unit'),
 (select value from design_batch_before),'Falha mantém ambos os snapshots e aplicações anteriores');
select is(pg_temp.design_revision(),(select revision from design_batch_before),'Falha atômica não avança o curso');
select is((select count(*) from private.course_change_receipts where actor_id=pg_temp.design_owner() and request_id in('design-wrong-practice','design-duplicate-introduction','design-atomic-stale-unit','design-invalid-calibration-control')),0::bigint,'Tentativas revertidas não deixam recibo de sucesso');
select ok(not has_function_privilege('anon','public.apply_course_design_command_for_actor_v3(uuid,uuid,bigint,jsonb,text,text,text)','execute'),'Anônimo não escreve desenho');
select ok(not has_function_privilege('authenticated','public.apply_course_design_command_for_actor_v3(uuid,uuid,bigint,jsonb,text,text,text)','execute'),'Cliente não escolhe ator explícito');
select ok(has_function_privilege('service_role','public.apply_course_design_command_for_actor_v3(uuid,uuid,bigint,jsonb,text,text,text)','execute'),'Canal do serviço possui a operação tipada');
select ok(not has_function_privilege('service_role','private.apply_course_design_settings_core_v3(uuid,uuid,bigint,jsonb,text,text,text)','execute'),'Núcleo privado não cria escritor paralelo');
select * from finish();
rollback;
