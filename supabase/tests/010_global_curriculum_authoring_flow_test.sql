begin;

select plan(22);

select set_config('request.jwt.claim.role','service_role',true);
set constraints all deferred;

insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values(
  '00000000-0000-0000-0000-000000000000',
  '91000000-0000-4000-8000-000000000001',
  'authenticated','authenticated','curriculum-flow@example.test','',now(),
  '{}'::jsonb,'{}'::jsonb,now(),now()
);

-- Um lote operacional vazio nao transforma sua Microssequencia em curriculo
-- imutavel. O mapa pode retira-la e a reconciliacao elimina o lote vazio.
insert into public.courses(id,owner_id,title,goal,revision) values(
  '91000000-0000-4000-8000-000000000101',
  '91000000-0000-4000-8000-000000000001',
  'Curso descartavel de mapa','Validar o mapa curricular global.',1
);
insert into private.course_instructional_plans(
  id,course_id,audience,instructional_scope,version,curriculum_map_status
) values(
  '91000000-0000-4000-8000-000000000111',
  '91000000-0000-4000-8000-000000000101',
  'Publico iniciante.','Fundamentos de comunicacao.',1,'approved'
);
insert into private.course_instructional_plan_items(
  id,course_id,instructional_plan_id,item_kind,position,statement,description
) values(
  '91000000-0000-4000-8000-000000000121',
  '91000000-0000-4000-8000-000000000101',
  '91000000-0000-4000-8000-000000000111',
  'curriculum_scope_item',0,'Comunicacao em rede.',''
);
insert into private.course_entities(
  course_id,entity_type,entity_id,parent_type,parent_id,position,content
) values
  ('91000000-0000-4000-8000-000000000101','module','module-map',null,null,0,
    '{"title":"Fundamentos","guide":{"goal":"Compreender a comunicacao.","include":[],"exclude":[],"notation":[],"avoid":[]}}'::jsonb),
  ('91000000-0000-4000-8000-000000000101','lesson','lesson-map','module','module-map',0,
    '{"title":"Comunicacao","guide":{"goal":"Explicar a comunicacao.","include":[],"exclude":[],"notation":[],"avoid":[]}}'::jsonb),
  ('91000000-0000-4000-8000-000000000101','microsequence','micro-keep','lesson','lesson-map',0,
    '{"title":"Situacao inicial","goal":"Observar uma comunicacao.","role":"explain","dependsOn":[],"scopeItemIds":["91000000-0000-4000-8000-000000000121"],"covers":["Comunicacao em rede."],"checks":[],"errors":[]}'::jsonb),
  ('91000000-0000-4000-8000-000000000101','microsequence','micro-remove','lesson','lesson-map',1,
    '{"title":"Recorte descartavel","goal":"Preparar uma producao ainda vazia.","role":"explain","dependsOn":[],"scopeItemIds":["91000000-0000-4000-8000-000000000121"],"covers":["Comunicacao em rede."],"checks":[],"errors":[]}'::jsonb);
insert into private.course_design_target_plan_items(
  course_id,didactic_microsequence_id,plan_item_id,plan_item_kind
) values
  ('91000000-0000-4000-8000-000000000101','micro-keep',
    '91000000-0000-4000-8000-000000000121','curriculum_scope_item'),
  ('91000000-0000-4000-8000-000000000101','micro-remove',
    '91000000-0000-4000-8000-000000000121','curriculum_scope_item');
insert into private.course_authoring_parts(
  id,course_id,instructional_plan_id,position,title,intent,progression
) values(
  '91000000-0000-4000-8000-000000000131',
  '91000000-0000-4000-8000-000000000101',
  '91000000-0000-4000-8000-000000000111',0,
  'Lote descartavel','Produzir depois da aprovacao.','["Produzir o recorte."]'::jsonb
);
insert into private.course_authoring_part_didactic_microsequences(
  course_id,authoring_part_id,didactic_microsequence_id,production_position
) values(
  '91000000-0000-4000-8000-000000000101',
  '91000000-0000-4000-8000-000000000131','micro-remove',0
);

select lives_ok($test$
  select public.save_course_curricular_map_for_actor_v1(
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000101',1,1,false,
    '{
      "audience":"Publico iniciante.",
      "prerequisites":[],
      "scopeItems":[{
        "id":"91000000-0000-4000-8000-000000000121",
        "position":0,
        "statement":"Comunicacao em rede."
      }],
      "modules":[{
        "moduleId":"module-map",
        "position":0,
        "title":"Fundamentos",
        "objective":"Compreender a comunicacao.",
        "lessons":[{
          "lessonId":"lesson-map",
          "position":0,
          "title":"Comunicacao",
          "objective":"Explicar a comunicacao.",
          "microsequences":[{
            "microsequenceId":"micro-keep",
            "position":0,
            "title":"Situacao inicial",
            "objective":"Observar uma comunicacao.",
            "dependencyMicrosequenceIds":[],
            "scopeItemIds":["91000000-0000-4000-8000-000000000121"]
          }]
        }]
      }]
    }'::jsonb,
    'test-map-reconciliation','1111111111111111111111111111111111111111111111111111111111111111'
  )
$test$,'lote vazio nao congela a revisao do mapa curricular');

select is(
  jsonb_build_object(
    'removedMicrosequence',not exists(select 1 from private.course_entities
      where course_id='91000000-0000-4000-8000-000000000101'
        and entity_type='microsequence' and entity_id='micro-remove'),
    'removedMembership',not exists(
      select 1 from private.course_authoring_part_didactic_microsequences
      where course_id='91000000-0000-4000-8000-000000000101'),
    'removedEmptyPart',not exists(select 1 from private.course_authoring_parts
      where course_id='91000000-0000-4000-8000-000000000101'),
    'mapStatus',(select curriculum_map_status from private.course_instructional_plans
      where course_id='91000000-0000-4000-8000-000000000101')
  ),
  '{"removedMicrosequence":true,"removedMembership":true,"removedEmptyPart":true,"mapStatus":"draft"}'::jsonb,
  'a reconciliacao remove somente o recorte operacional vazio e devolve o mapa a rascunho'
);

-- Calibracao automatica nao pode sobrescrever decisoes fixadas pela pessoa
-- autora ou pela condicao de pesquisa no mesmo escopo.
insert into private.course_design_parameter_assignments(
  course_id,parameter_id,scope_kind,scope_ref,value,origin,reason
) values(
  '91000000-0000-4000-8000-000000000101',
  'new_analysis_unit_ceiling_per_expository_study_unit','course',
  '91000000-0000-4000-8000-000000000101','3'::jsonb,'author',
  'Escolha explicita da pessoa autora.'
);
insert into private.course_authoring_guidance_assignments(
  course_id,scope_kind,scope_ref,guidance,origin,reason
) values(
  '91000000-0000-4000-8000-000000000101','course',
  '91000000-0000-4000-8000-000000000101',
  'Preservar exemplos em uma condicao comparavel.','research_condition',
  'Condicao fixada para o estudo.'
);

select is((public.apply_course_design_command_for_actor_v2(
  '91000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000101',2,
  '{
    "type":"set_parameter",
    "scope":{"kind":"course","ref":"91000000-0000-4000-8000-000000000101"},
    "parameterId":"new_analysis_unit_ceiling_per_expository_study_unit",
    "value":2,
    "origin":"automatic",
    "reason":"Calibracao automatica do contexto."
  }'::jsonb,
  'test-automatic-parameter','2222222222222222222222222222222222222222222222222222222222222222',
  'application'
)->>'changed'),'false','atribuicao automatica conflitante e ignorada atomicamente');

select is(
  (select jsonb_build_object('value',value,'origin',origin)
   from private.course_design_parameter_assignments
   where course_id='91000000-0000-4000-8000-000000000101'
     and parameter_id='new_analysis_unit_ceiling_per_expository_study_unit'
     and scope_kind='course'),
  '{"value":3,"origin":"author"}'::jsonb,
  'parametro explicito permanece autoridade no escopo'
);

select is((public.apply_course_design_command_for_actor_v2(
  '91000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000101',2,
  '{
    "type":"set_guidance",
    "scope":{"kind":"course","ref":"91000000-0000-4000-8000-000000000101"},
    "guidance":"Resumir todos os exemplos.",
    "origin":"automatic",
    "reason":"Sugestao automatica do contexto."
  }'::jsonb,
  'test-automatic-guidance','3333333333333333333333333333333333333333333333333333333333333333',
  'application'
)->>'changed'),'false','direcao automatica conflitante e ignorada atomicamente');

select is(
  (select jsonb_build_object('guidance',guidance,'origin',origin)
   from private.course_authoring_guidance_assignments
   where course_id='91000000-0000-4000-8000-000000000101'
     and scope_kind='course'),
  '{"guidance":"Preservar exemplos em uma condicao comparavel.","origin":"research_condition"}'::jsonb,
  'direcao de pesquisa permanece autoridade no escopo'
);

select is((select revision from public.courses
  where id='91000000-0000-4000-8000-000000000101'),2::bigint,
  'comandos automaticos ignorados nao criam revisao ficticia');

-- Redefinir limites de producao move Microssequencias entre lotes sem tocar
-- a arquitetura curricular. O lote de origem pode permanecer ou desaparecer.
insert into public.courses(id,owner_id,title,goal,revision) values(
  '91000000-0000-4000-8000-000000000501',
  '91000000-0000-4000-8000-000000000001',
  'Curso descartavel de lotes','Validar o reagrupamento operacional.',1
);
insert into private.course_instructional_plans(
  id,course_id,audience,instructional_scope,version,curriculum_map_status
) values(
  '91000000-0000-4000-8000-000000000511',
  '91000000-0000-4000-8000-000000000501',
  'Publico iniciante.','Tres pontos curriculares.',1,'approved'
);
insert into private.course_entities(
  course_id,entity_type,entity_id,parent_type,parent_id,position,content
) values
  ('91000000-0000-4000-8000-000000000501','module','module-lotes',null,null,0,
    '{"title":"Modulo estavel","guide":{"goal":"Preservar o curriculo.","include":[],"exclude":[],"notation":[],"avoid":[]}}'::jsonb),
  ('91000000-0000-4000-8000-000000000501','lesson','lesson-lotes',
    'module','module-lotes',0,
    '{"title":"Licao estavel","guide":{"goal":"Preservar a ordem.","include":[],"exclude":[],"notation":[],"avoid":[]}}'::jsonb),
  ('91000000-0000-4000-8000-000000000501','microsequence','micro-lote-a',
    'lesson','lesson-lotes',0,
    '{"title":"Primeiro ponto","goal":"Desenvolver o primeiro ponto.","role":"explain","dependsOn":[],"scopeItemIds":[],"covers":[],"checks":[],"errors":[]}'::jsonb),
  ('91000000-0000-4000-8000-000000000501','microsequence','micro-lote-b',
    'lesson','lesson-lotes',1,
    '{"title":"Segundo ponto","goal":"Desenvolver o segundo ponto.","role":"explain","dependsOn":[],"scopeItemIds":[],"covers":[],"checks":[],"errors":[]}'::jsonb),
  ('91000000-0000-4000-8000-000000000501','microsequence','micro-lote-c',
    'lesson','lesson-lotes',2,
    '{"title":"Terceiro ponto","goal":"Desenvolver o terceiro ponto.","role":"explain","dependsOn":[],"scopeItemIds":[],"covers":[],"checks":[],"errors":[]}'::jsonb);
insert into private.course_authoring_parts(
  id,course_id,instructional_plan_id,position,title,intent,progression
) values
  ('91000000-0000-4000-8000-000000000521',
    '91000000-0000-4000-8000-000000000501',
    '91000000-0000-4000-8000-000000000511',0,
    'Lote um','Produzir os dois primeiros pontos.',
    '["Primeiro ponto.","Segundo ponto."]'::jsonb),
  ('91000000-0000-4000-8000-000000000522',
    '91000000-0000-4000-8000-000000000501',
    '91000000-0000-4000-8000-000000000511',1,
    'Lote dois','Produzir o terceiro ponto.','["Terceiro ponto."]'::jsonb);
insert into private.course_authoring_part_didactic_microsequences(
  course_id,authoring_part_id,didactic_microsequence_id,production_position
) values
  ('91000000-0000-4000-8000-000000000501',
    '91000000-0000-4000-8000-000000000521','micro-lote-a',0),
  ('91000000-0000-4000-8000-000000000501',
    '91000000-0000-4000-8000-000000000521','micro-lote-b',1),
  ('91000000-0000-4000-8000-000000000501',
    '91000000-0000-4000-8000-000000000522','micro-lote-c',0);

create temporary table pg_temp.part_change_result(value jsonb) on commit drop;
insert into pg_temp.part_change_result(value)
  select public.save_course_authoring_part_for_actor_v1(
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000501',1,1,
    '{
      "partId":"91000000-0000-4000-8000-000000000522",
      "position":1,
      "title":"Lote dois ampliado",
      "intent":"Produzir o segundo e o terceiro ponto.",
      "progression":["Segundo ponto.","Terceiro ponto."],
      "microsequences":[
        {"microsequenceId":"micro-lote-b","position":0},
        {"microsequenceId":"micro-lote-c","position":1}
      ]
    }'::jsonb,
    'test-redefine-parts',
    '7777777777777777777777777777777777777777777777777777777777777777'
  );
select is(
  (select jsonb_build_object(
    'changed',changed.value->'changed',
    'courseRevision',(select revision from public.courses
      where id='91000000-0000-4000-8000-000000000501'),
    'planVersion',(select version from private.course_instructional_plans
      where course_id='91000000-0000-4000-8000-000000000501'),
    'curriculum',array(select entity_id from private.course_entities
      where course_id='91000000-0000-4000-8000-000000000501'
        and entity_type='microsequence' order by position),
    'parts',(select jsonb_agg(jsonb_build_object(
      'part',id,'position',position,'version',version) order by position)
      from private.course_authoring_parts
      where course_id='91000000-0000-4000-8000-000000000501'),
    'memberships',(select jsonb_agg(jsonb_build_object(
      'part',authoring_part_id,'microsequence',didactic_microsequence_id,
      'position',production_position) order by authoring_part_id,production_position)
      from private.course_authoring_part_didactic_microsequences
      where course_id='91000000-0000-4000-8000-000000000501')
  ) from pg_temp.part_change_result changed),
  '{
    "changed":true,
    "courseRevision":2,
    "planVersion":2,
    "curriculum":["micro-lote-a","micro-lote-b","micro-lote-c"],
    "parts":[
      {"part":"91000000-0000-4000-8000-000000000521","position":0,"version":2},
      {"part":"91000000-0000-4000-8000-000000000522","position":1,"version":2}
    ],
    "memberships":[
      {"part":"91000000-0000-4000-8000-000000000521","microsequence":"micro-lote-a","position":0},
      {"part":"91000000-0000-4000-8000-000000000522","microsequence":"micro-lote-b","position":0},
      {"part":"91000000-0000-4000-8000-000000000522","microsequence":"micro-lote-c","position":1}
    ]
  }'::jsonb,
  'uma divisao parcial preserva o lote doador, suas versoes e o curriculo'
);

truncate pg_temp.part_change_result;
insert into pg_temp.part_change_result(value)
  select public.save_course_authoring_part_for_actor_v1(
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000501',2,2,
    '{
      "partId":"91000000-0000-4000-8000-000000000522",
      "position":1,
      "title":"Lote reunido",
      "intent":"Produzir os tres pontos em um bloco.",
      "progression":["Primeiro ponto.","Segundo ponto.","Terceiro ponto."],
      "microsequences":[
        {"microsequenceId":"micro-lote-a","position":0},
        {"microsequenceId":"micro-lote-b","position":1},
        {"microsequenceId":"micro-lote-c","position":2}
      ]
    }'::jsonb,
    'test-merge-parts',
    '8888888888888888888888888888888888888888888888888888888888888888'
  );
select is(
  (select jsonb_build_object(
    'changed',changed.value->'changed',
    'courseRevision',(select revision from public.courses
      where id='91000000-0000-4000-8000-000000000501'),
    'planVersion',(select version from private.course_instructional_plans
      where course_id='91000000-0000-4000-8000-000000000501'),
    'curriculum',array(select entity_id from private.course_entities
      where course_id='91000000-0000-4000-8000-000000000501'
        and entity_type='microsequence' order by position),
    'parts',(select jsonb_agg(jsonb_build_object(
      'part',id,'position',position,'version',version) order by position)
      from private.course_authoring_parts
      where course_id='91000000-0000-4000-8000-000000000501'),
    'memberships',(select jsonb_agg(jsonb_build_object(
      'part',authoring_part_id,'microsequence',didactic_microsequence_id,
      'position',production_position) order by production_position)
      from private.course_authoring_part_didactic_microsequences
      where course_id='91000000-0000-4000-8000-000000000501')
  ) from pg_temp.part_change_result changed),
  '{
    "changed":true,
    "courseRevision":3,
    "planVersion":3,
    "curriculum":["micro-lote-a","micro-lote-b","micro-lote-c"],
    "parts":[
      {"part":"91000000-0000-4000-8000-000000000522","position":0,"version":4}
    ],
    "memberships":[
      {"part":"91000000-0000-4000-8000-000000000522","microsequence":"micro-lote-a","position":0},
      {"part":"91000000-0000-4000-8000-000000000522","microsequence":"micro-lote-b","position":1},
      {"part":"91000000-0000-4000-8000-000000000522","microsequence":"micro-lote-c","position":2}
    ]
  }'::jsonb,
  'uma fusao elimina o lote vazio e normaliza a posicao sem mudar o curriculo'
);

select is(
  jsonb_build_object(
    'idempotent',(public.save_course_authoring_part_for_actor_v1(
      '91000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000501',2,2,
      '{
        "partId":"91000000-0000-4000-8000-000000000522",
        "position":1,
        "title":"Lote reunido",
        "intent":"Produzir os tres pontos em um bloco.",
        "progression":["Primeiro ponto.","Segundo ponto.","Terceiro ponto."],
        "microsequences":[
          {"microsequenceId":"micro-lote-a","position":0},
          {"microsequenceId":"micro-lote-b","position":1},
          {"microsequenceId":"micro-lote-c","position":2}
        ]
      }'::jsonb,
      'test-merge-parts',
      '8888888888888888888888888888888888888888888888888888888888888888'
    )->'idempotent'),
    'courseRevision',(select revision from public.courses
      where id='91000000-0000-4000-8000-000000000501'),
    'planVersion',(select version from private.course_instructional_plans
      where course_id='91000000-0000-4000-8000-000000000501')
  ),
  '{"idempotent":true,"courseRevision":3,"planVersion":3}'::jsonb,
  'repetir o mesmo pedido nao movimenta lotes nem cria revisao ficticia'
);

-- Segundo Curso: os tres guards de materializacao observam o estado final
-- inteiro do percurso e rejeitam a escrita antes do nucleo atomico.
insert into public.courses(id,owner_id,title,goal,revision) values(
  '91000000-0000-4000-8000-000000000201',
  '91000000-0000-4000-8000-000000000001',
  'Curso descartavel de materializacao','Validar dependencias e repertorio.',1
);
insert into private.course_instructional_plans(
  id,course_id,audience,instructional_scope,version,curriculum_map_status
) values(
  '91000000-0000-4000-8000-000000000211',
  '91000000-0000-4000-8000-000000000201',
  'Publico iniciante.','Funcionamento de um switch.',1,'approved'
);
insert into private.course_instructional_plan_items(
  id,course_id,instructional_plan_id,item_kind,position,statement,description
) values
  ('91000000-0000-4000-8000-000000000221',
    '91000000-0000-4000-8000-000000000201',
    '91000000-0000-4000-8000-000000000211','curriculum_scope_item',0,
    'Aprendizagem de enderecos pelo switch.',''),
  ('91000000-0000-4000-8000-000000000222',
    '91000000-0000-4000-8000-000000000201',
    '91000000-0000-4000-8000-000000000211','curriculum_scope_item',1,
    'Encaminhamento conhecido e flooding.',''),
  ('91000000-0000-4000-8000-000000000231',
    '91000000-0000-4000-8000-000000000201',
    '91000000-0000-4000-8000-000000000211','instructional_analysis_unit',0,
    'Associacao entre endereco MAC e porta.',
    'Relacao usada para decidir o encaminhamento de quadros.')
;
insert into private.course_entities(
  course_id,entity_type,entity_id,parent_type,parent_id,position,content
) values
  ('91000000-0000-4000-8000-000000000201','module','module-switch',null,null,0,
    '{"title":"Switch Ethernet","guide":{"goal":"Compreender o mecanismo.","include":[],"exclude":[],"notation":[],"avoid":[]}}'::jsonb),
  ('91000000-0000-4000-8000-000000000201','lesson','lesson-switch','module','module-switch',0,
    '{"title":"Aprendizagem e encaminhamento","guide":{"goal":"Acompanhar a tabela MAC.","include":[],"exclude":[],"notation":[],"avoid":[]}}'::jsonb),
  ('91000000-0000-4000-8000-000000000201','microsequence','micro-learn','lesson','lesson-switch',0,
    '{"title":"Como o switch aprende","goal":"Relacionar origem e porta.","role":"explain","dependsOn":[],"scopeItemIds":["91000000-0000-4000-8000-000000000221"],"covers":["Aprendizagem de enderecos pelo switch."],"checks":[],"errors":[]}'::jsonb),
  ('91000000-0000-4000-8000-000000000201','microsequence','micro-forward','lesson','lesson-switch',1,
    '{"title":"Como o switch encaminha","goal":"Comparar destino conhecido e desconhecido.","role":"explain","dependsOn":["micro-learn"],"scopeItemIds":["91000000-0000-4000-8000-000000000222"],"covers":["Encaminhamento conhecido e flooding."],"checks":[],"errors":[]}'::jsonb);
insert into private.course_design_target_plan_items(
  course_id,didactic_microsequence_id,plan_item_id,plan_item_kind
) values
  ('91000000-0000-4000-8000-000000000201','micro-learn',
    '91000000-0000-4000-8000-000000000221','curriculum_scope_item'),
  ('91000000-0000-4000-8000-000000000201','micro-forward',
    '91000000-0000-4000-8000-000000000222','curriculum_scope_item'),
  ('91000000-0000-4000-8000-000000000201','micro-learn',
    '91000000-0000-4000-8000-000000000231','instructional_analysis_unit'),
  ('91000000-0000-4000-8000-000000000201','micro-forward',
    '91000000-0000-4000-8000-000000000231','instructional_analysis_unit');
insert into private.course_authoring_parts(
  id,course_id,instructional_plan_id,position,title,intent,progression
) values
  ('91000000-0000-4000-8000-000000000241',
    '91000000-0000-4000-8000-000000000201',
    '91000000-0000-4000-8000-000000000211',0,
    'Aprendizagem','Ensinar a construcao da tabela.','["Observar a origem."]'::jsonb),
  ('91000000-0000-4000-8000-000000000242',
    '91000000-0000-4000-8000-000000000201',
    '91000000-0000-4000-8000-000000000211',1,
    'Encaminhamento','Aplicar a tabela construida.','["Consultar o destino."]'::jsonb);
insert into private.course_authoring_part_didactic_microsequences(
  course_id,authoring_part_id,didactic_microsequence_id,production_position
) values
  ('91000000-0000-4000-8000-000000000201',
    '91000000-0000-4000-8000-000000000241','micro-learn',0),
  ('91000000-0000-4000-8000-000000000201',
    '91000000-0000-4000-8000-000000000242','micro-forward',0);

select throws_ok($test$
  select public.materialize_course_authoring_part_for_actor_v2(
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000201',
    '91000000-0000-4000-8000-000000000242',1,1,'[]'::jsonb,
    '[{"didacticMicrosequenceId":"micro-forward","instructionalAnalysisUnitIds":["91000000-0000-4000-8000-000000000231"],"evidenceRequirementIds":[]}]'::jsonb,
    '[{
      "studyUnitId":"unit-forward","position":1,
      "didacticMicrosequenceId":"micro-forward",
      "content":{"title":"Destino conhecido"},
      "designSnapshot":{"contract":"aralearn.study-unit-design-snapshot.v1"},
      "designApplication":{"mode":"expository","introducedInstructionalAnalysisUnitIds":[],"usedInstructionalAnalysisUnitIds":[],"curriculumScopeItemIds":["91000000-0000-4000-8000-000000000222"],"explanationApplications":[],"practiceApplications":[],"componentRefs":[]},
      "sourceLinks":[]
    }]'::jsonb,
    'test-dependency-order','4444444444444444444444444444444444444444444444444444444444444444'
  )
$test$,'23514',
  'Uma dependencia curricular precisa estar produzida ou integrar o mesmo lote.',
  'dependencia curricular precisa estar materializada antes do dependente');

insert into private.course_entities(
  course_id,entity_type,entity_id,parent_type,parent_id,position,content,
  design_snapshot,design_application,created_origin,last_revision_origin
) values
  ('91000000-0000-4000-8000-000000000201','study_unit','unit-learn',
    'microsequence','micro-learn',1,'{"title":"Aprendizagem pela origem"}'::jsonb,
    '{"contract":"aralearn.study-unit-design-snapshot.v1","instructionalAnalysisUnitIds":["91000000-0000-4000-8000-000000000231"]}'::jsonb
      ||jsonb_build_object('appliedAt',(clock_timestamp()+interval '1 second')::text),
    '{"contract":"aralearn.study-unit-design-application.v1","mode":"expository","introducedInstructionalAnalysisUnitIds":["91000000-0000-4000-8000-000000000231"],"usedInstructionalAnalysisUnitIds":[],"curriculumScopeItemIds":["91000000-0000-4000-8000-000000000221"],"explanationApplications":[],"practiceApplications":[],"componentRefs":[]}'::jsonb,
    'gpt','gpt'),
  ('91000000-0000-4000-8000-000000000201','study_unit','unit-forward',
    'microsequence','micro-forward',1,'{"title":"Consulta ao destino"}'::jsonb,
    '{"contract":"aralearn.study-unit-design-snapshot.v1","instructionalAnalysisUnitIds":["91000000-0000-4000-8000-000000000231"]}'::jsonb
      ||jsonb_build_object('appliedAt',(clock_timestamp()+interval '1 second')::text),
    '{"contract":"aralearn.study-unit-design-application.v1","mode":"expository","introducedInstructionalAnalysisUnitIds":[],"usedInstructionalAnalysisUnitIds":[],"curriculumScopeItemIds":["91000000-0000-4000-8000-000000000222"],"explanationApplications":[{"instructionalAnalysisUnitId":"91000000-0000-4000-8000-000000000231","developedForms":["mechanism"],"notApplicable":[]}],"practiceApplications":[],"componentRefs":[]}'::jsonb,
    'gpt','gpt'),
  ('91000000-0000-4000-8000-000000000201','study_unit','unit-use',
    'microsequence','micro-forward',2,'{"title":"Uso da associacao"}'::jsonb,
    '{"contract":"aralearn.study-unit-design-snapshot.v1","instructionalAnalysisUnitIds":["91000000-0000-4000-8000-000000000231"]}'::jsonb
      ||jsonb_build_object('appliedAt',(clock_timestamp()+interval '1 second')::text),
    '{"contract":"aralearn.study-unit-design-application.v1","mode":"expository","introducedInstructionalAnalysisUnitIds":[],"usedInstructionalAnalysisUnitIds":["91000000-0000-4000-8000-000000000231"],"curriculumScopeItemIds":["91000000-0000-4000-8000-000000000222"],"explanationApplications":[],"practiceApplications":[],"componentRefs":[]}'::jsonb,
    'gpt','gpt');

select throws_ok($test$
  select public.materialize_course_authoring_part_for_actor_v2(
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000201',
    '91000000-0000-4000-8000-000000000242',1,1,'[]'::jsonb,
    '[{"didacticMicrosequenceId":"micro-forward","instructionalAnalysisUnitIds":["91000000-0000-4000-8000-000000000231"],"evidenceRequirementIds":[]}]'::jsonb,
    '[{
      "studyUnitId":"unit-forward","position":1,
      "didacticMicrosequenceId":"micro-forward",
      "content":{"title":"Consulta ao destino"},
      "designSnapshot":{"contract":"aralearn.study-unit-design-snapshot.v1","instructionalAnalysisUnitIds":["91000000-0000-4000-8000-000000000231"]},
      "designApplication":{"mode":"expository","introducedInstructionalAnalysisUnitIds":[],"usedInstructionalAnalysisUnitIds":["91000000-0000-4000-8000-000000000231"],"curriculumScopeItemIds":[],"explanationApplications":[],"practiceApplications":[],"componentRefs":[]},
      "sourceLinks":[]
    }]'::jsonb,
    'test-complete-coverage','5555555555555555555555555555555555555555555555555555555555555555'
  )
$test$,'23514',
  'Todo item de escopo atribuido precisa ser desenvolvido na Microssequencia.',
  'cada item atribuido precisa ter cobertura efetiva no conteudo do recorte');

select throws_ok($test$
  select public.materialize_course_authoring_part_for_actor_v2(
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000201',
    '91000000-0000-4000-8000-000000000241',1,1,'[]'::jsonb,
    '[{"didacticMicrosequenceId":"micro-learn","instructionalAnalysisUnitIds":["91000000-0000-4000-8000-000000000231"],"evidenceRequirementIds":[]}]'::jsonb,
    '[{
      "studyUnitId":"unit-learn","position":1,
      "didacticMicrosequenceId":"micro-learn",
      "content":{"title":"Aprendizagem pela origem"},
      "designSnapshot":{"contract":"aralearn.study-unit-design-snapshot.v1"},
      "designApplication":{"mode":"expository","introducedInstructionalAnalysisUnitIds":[],"usedInstructionalAnalysisUnitIds":[],"curriculumScopeItemIds":["91000000-0000-4000-8000-000000000221"],"explanationApplications":[],"practiceApplications":[],"componentRefs":[]},
      "sourceLinks":[]
    }]'::jsonb,
    'test-final-repertoire','6666666666666666666666666666666666666666666666666666666666666666'
  )
$test$,'23514',
  'Uma ideia foi usada antes de ser ensinada ou introduzida novamente.',
  'estado final combinado preserva a introducao exigida por unidades posteriores');

select is(
  jsonb_build_object(
    'courseRevision',(select revision from public.courses
      where id='91000000-0000-4000-8000-000000000201'),
    'planVersion',(select version from private.course_instructional_plans
      where course_id='91000000-0000-4000-8000-000000000201'),
    'analysisAssignments',(select count(*) from private.course_design_target_plan_items
      where course_id='91000000-0000-4000-8000-000000000201'
        and plan_item_kind='instructional_analysis_unit'),
    'receipts',(select count(*) from private.course_change_receipts
      where course_id='91000000-0000-4000-8000-000000000201')
  ),
  '{"courseRevision":1,"planVersion":1,"analysisAssignments":2,"receipts":0}'::jsonb,
  'rejeicoes nao deixam escrita parcial de plano, conteudo ou receipt'
);

select is(
  jsonb_build_object(
    'introductionCount',(analytics.metric->>'introductionCount')::integer,
    'useCount',(analytics.metric->>'useCount')::integer,
    'revisitCount',(analytics.metric->>'revisitCount')::integer
  ),
  '{"introductionCount":1,"useCount":1,"revisitCount":1}'::jsonb,
  'Analytics distingue introducao, uso e retomada no recorte corrente'
)
from (
  select public.get_owned_course_authoring_analytics_for_actor_v2(
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000201',1,
    '{"scope":{"kind":"course","ref":null}}'::jsonb
  )#>'{design,analysisUnits,0}' as metric
) analytics;

-- Uma unidade nova pode selar somente as calibracoes automaticas proprias que
-- aparecem no snapshot. A leitura corrente precisa reencontrar essas mesmas
-- decisoes sem copiar para o escopo local os valores apenas herdados.
insert into public.courses(id,owner_id,title,goal,revision) values(
  '91000000-0000-4000-8000-000000000301',
  '91000000-0000-4000-8000-000000000001',
  'Curso descartavel de calibracao','Validar configuracao propria da unidade.',1
);
insert into private.course_instructional_plans(
  id,course_id,audience,instructional_scope,version,curriculum_map_status
) values(
  '91000000-0000-4000-8000-000000000311',
  '91000000-0000-4000-8000-000000000301',
  'Publico iniciante.','Uma situacao concreta.',1,'approved'
);
insert into private.course_instructional_plan_items(
  id,course_id,instructional_plan_id,item_kind,position,statement,description
) values(
  '91000000-0000-4000-8000-000000000321',
  '91000000-0000-4000-8000-000000000301',
  '91000000-0000-4000-8000-000000000311','curriculum_scope_item',0,
  'Reconhecer os elementos da situacao.',''
);
insert into private.course_entities(
  course_id,entity_type,entity_id,parent_type,parent_id,position,content
) values
  ('91000000-0000-4000-8000-000000000301','module','module-calibration',null,null,0,
    '{"title":"Situacao","guide":{"goal":"Observar o problema.","include":[],"exclude":[],"notation":[],"avoid":[]}}'::jsonb),
  ('91000000-0000-4000-8000-000000000301','lesson','lesson-calibration','module','module-calibration',0,
    '{"title":"Elementos","guide":{"goal":"Distinguir os elementos.","include":[],"exclude":[],"notation":[],"avoid":[]}}'::jsonb),
  ('91000000-0000-4000-8000-000000000301','microsequence','micro-calibration','lesson','lesson-calibration',0,
    '{"title":"Problema concreto","goal":"Reconhecer os elementos.","role":"explain","dependsOn":[],"scopeItemIds":["91000000-0000-4000-8000-000000000321"],"covers":["Reconhecer os elementos da situacao."],"checks":[],"errors":[]}'::jsonb);
insert into private.course_design_target_plan_items(
  course_id,didactic_microsequence_id,plan_item_id,plan_item_kind
) values(
  '91000000-0000-4000-8000-000000000301','micro-calibration',
  '91000000-0000-4000-8000-000000000321','curriculum_scope_item'
);
insert into private.course_authoring_parts(
  id,course_id,instructional_plan_id,position,title,intent,progression
) values(
  '91000000-0000-4000-8000-000000000341',
  '91000000-0000-4000-8000-000000000301',
  '91000000-0000-4000-8000-000000000311',0,
  'Situacao concreta','Produzir uma experiencia focal.',
  '["Apresentar o problema."]'::jsonb
);
insert into private.course_authoring_part_didactic_microsequences(
  course_id,authoring_part_id,didactic_microsequence_id,production_position
) values(
  '91000000-0000-4000-8000-000000000301',
  '91000000-0000-4000-8000-000000000341','micro-calibration',0
);

create function pg_temp.calibrated_unit_payload_v1(
  p_course_id uuid,
  p_microsequence_id text,
  p_study_unit_id text,
  p_scope_item_id uuid,
  p_local_origin text
)
returns jsonb
language sql
stable
set search_path=pg_catalog,private
as $function$
  with design_path as materialized(
    select private.course_design_scope_path_v1(
      p_course_id,'didactic_microsequence',p_microsequence_id
    ) as value
  ), snapshot_parameters as materialized(
    select jsonb_agg(case
      when parameter.value->>'parameterId'='study_unit_content_word_target'
        then jsonb_build_object(
          'parameterId',parameter.value->>'parameterId',
          'value',240,'origin',p_local_origin,
          'sourceScopeKind','study_unit'
        )
      else jsonb_build_object(
        'parameterId',parameter.value->>'parameterId',
        'value',parameter.value#>'{effectiveAssignment,value}',
        'origin',parameter.value#>>'{effectiveAssignment,origin}',
        'sourceScopeKind',parameter.value#>>'{effectiveAssignment,sourceScope,kind}'
      ) end order by parameter.ordinal) as value
    from design_path
    cross join lateral jsonb_array_elements(
      private.course_current_design_parameters_v1(p_course_id,design_path.value)
    ) with ordinality parameter(value,ordinal)
  ), snapshot_directions as materialized(
    select coalesce((
      select jsonb_agg(jsonb_build_object(
        'direction',direction.value->>'guidance',
        'origin',direction.value->>'origin',
        'sourceScopeKind',direction.value#>>'{sourceScope,kind}'
      ) order by direction.ordinal)
      from jsonb_array_elements(
        private.course_current_authoring_guidance_v1(
          p_course_id,design_path.value
        )->'effectiveAssignments'
      ) with ordinality direction(value,ordinal)
    ),'[]'::jsonb)||jsonb_build_array(
      jsonb_build_object(
        'direction','Manter uma situacao concreta ao longo da unidade.',
        'origin',p_local_origin,'sourceScopeKind','study_unit'
      )
    ) as value
    from design_path
  ), snapshot_policy as materialized(
    select jsonb_build_object(
      'policy',policy.value->'policy','origin',policy.value->>'origin',
      'sourceScopeKind',policy.value#>>'{sourceScope,kind}'
    ) as value
    from design_path
    cross join lateral jsonb_array_elements(jsonb_build_array(
      private.course_current_component_policy_v1(
        p_course_id,design_path.value
      )->'effectiveAssignment'
    )) policy(value)
  )
  select jsonb_build_array(jsonb_build_object(
    'studyUnitId',p_study_unit_id,'position',1,
    'didacticMicrosequenceId',p_microsequence_id,
    'content',jsonb_build_object(
      'title','Uma situacao concreta','content','[]'::jsonb,
      'response',null,'feedback','[]'::jsonb,'topics','[]'::jsonb
    ),
    'designSnapshot',jsonb_build_object(
      'contract','aralearn.study-unit-design-snapshot.v1',
      'didacticMicrosequenceId',p_microsequence_id,
      'instructionalAnalysisUnitIds','[]'::jsonb,
      'evidenceRequirementIds','[]'::jsonb,
      'parameters',snapshot_parameters.value,
      'editorialDirections',snapshot_directions.value,
      'componentPolicy',snapshot_policy.value
    ),
    'designApplication',jsonb_build_object(
      'mode','expository',
      'introducedInstructionalAnalysisUnitIds','[]'::jsonb,
      'usedInstructionalAnalysisUnitIds','[]'::jsonb,
      'curriculumScopeItemIds',jsonb_build_array(p_scope_item_id),
      'explanationApplications','[]'::jsonb,
      'practiceApplications','[]'::jsonb,
      'componentRefs','[]'::jsonb
    ),
    'sourceLinks','[]'::jsonb
  ))
  from snapshot_parameters,snapshot_directions,snapshot_policy
$function$;

insert into private.course_design_parameter_assignments(
  course_id,parameter_id,scope_kind,scope_ref,value,origin,reason
) values(
  '91000000-0000-4000-8000-000000000301',
  'study_unit_content_word_target','study_unit','unit-calibrated','300'::jsonb,
  'author','Escolha explicita anterior da pessoa autora.'
);

select throws_ok($test$
  select public.materialize_course_authoring_part_for_actor_v2(
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000301',
    '91000000-0000-4000-8000-000000000341',1,1,'[]'::jsonb,
    '[{"didacticMicrosequenceId":"micro-calibration","instructionalAnalysisUnitIds":[],"evidenceRequirementIds":[]}]'::jsonb,
    pg_temp.calibrated_unit_payload_v1(
      '91000000-0000-4000-8000-000000000301','micro-calibration',
      'unit-calibrated','91000000-0000-4000-8000-000000000321','automatic'
    ),
    'test-fixed-unit-calibration','7777777777777777777777777777777777777777777777777777777777777777'
  )
$test$,'23514',
  'Calibracao automatica da unidade conflita com decisao fixada.',
  'calibracao da unidade nao sobrepoe uma decisao explicita preexistente');

select is(
  (select jsonb_build_object('value',value,'origin',origin)
   from private.course_design_parameter_assignments
   where course_id='91000000-0000-4000-8000-000000000301'
     and parameter_id='study_unit_content_word_target'
     and scope_kind='study_unit' and scope_ref='unit-calibrated'),
  '{"value":300,"origin":"author"}'::jsonb,
  'conflito recusado preserva integralmente a atribuicao explicita'
);

delete from private.course_design_parameter_assignments
where course_id='91000000-0000-4000-8000-000000000301'
  and parameter_id='study_unit_content_word_target'
  and scope_kind='study_unit' and scope_ref='unit-calibrated';

select lives_ok($test$
  select public.materialize_course_authoring_part_for_actor_v2(
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000301',
    '91000000-0000-4000-8000-000000000341',1,1,'[]'::jsonb,
    '[{"didacticMicrosequenceId":"micro-calibration","instructionalAnalysisUnitIds":[],"evidenceRequirementIds":[]}]'::jsonb,
    pg_temp.calibrated_unit_payload_v1(
      '91000000-0000-4000-8000-000000000301','micro-calibration',
      'unit-calibrated','91000000-0000-4000-8000-000000000321','automatic'
    ),
    'test-seal-unit-calibration','8888888888888888888888888888888888888888888888888888888888888888'
  )
$test$,'materializacao sela calibracoes automaticas proprias da unidade nova');

select is(
  jsonb_build_object(
    'localParameterCount',(select count(*)::integer
      from private.course_design_parameter_assignments
      where course_id='91000000-0000-4000-8000-000000000301'
        and scope_kind='study_unit' and scope_ref='unit-calibrated'),
    'localGuidanceCount',(select count(*)::integer
      from private.course_authoring_guidance_assignments
      where course_id='91000000-0000-4000-8000-000000000301'
        and scope_kind='study_unit' and scope_ref='unit-calibrated'),
    'storedParameterValue',(select value
      from private.course_design_parameter_assignments
      where course_id='91000000-0000-4000-8000-000000000301'
        and parameter_id='study_unit_content_word_target'
        and scope_kind='study_unit' and scope_ref='unit-calibrated'),
    'readParameterValue',parameter.value#>'{effectiveAssignment,value}',
    'readParameterOrigin',parameter.value#>>'{effectiveAssignment,origin}',
    'readParameterScope',parameter.value#>>'{effectiveAssignment,sourceScope,kind}',
    'readGuidanceOrigin',design.value#>>'{guidance,localAssignment,origin}',
    'readGuidance',design.value#>>'{guidance,localAssignment,guidance}'
  ),
  '{
    "localParameterCount":1,
    "localGuidanceCount":1,
    "storedParameterValue":240,
    "readParameterValue":240,
    "readParameterOrigin":"automatic",
    "readParameterScope":"study_unit",
    "readGuidanceOrigin":"automatic",
    "readGuidance":"Manter uma situacao concreta ao longo da unidade."
  }'::jsonb,
  'leitura corrente reencontra apenas a calibracao local selada'
)
from (
  select public.get_owned_course_design_for_actor_v2(
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000301',
    'study_unit','unit-calibrated',32,null
  ) as value
) design
cross join lateral (
  select parameter_value.value
  from jsonb_array_elements(design.value->'parameters') parameter_value(value)
  where parameter_value.value->>'parameterId'='study_unit_content_word_target'
) parameter;

-- Retirar uma ancora nao carrega uma Fonte no ramo do comando. O estado
-- tipado precisa permitir que o guard de citacoes posterior seja avaliado
-- sem acessar um record nao atribuido.
insert into private.course_sources(
  course_id,source_id,revision,status,kind,source_role,title,origin,
  availability,verification_status,study_visibility
) values(
  '91000000-0000-4000-8000-000000000301','source-retire-anchor',1,
  'active','document','technical_conceptual','Fonte tecnica descartavel',
  'author_provided','private','author_verified','hidden'
);
insert into private.course_source_anchors(
  course_id,anchor_id,revision,source_id,source_revision,status,selector,
  human_locator
) values(
  '91000000-0000-4000-8000-000000000301','anchor-retire',1,
  'source-retire-anchor',1,'active',
  '{"kind":"page_range","startPage":1,"endPage":1}'::jsonb,'p. 1'
);

select lives_ok($test$
  select private.execute_course_source_command_core_v1(
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000301',2,
    '{"type":"retire_anchor","anchorId":"anchor-retire","expectedAnchorRevision":1}'::jsonb,
    'application','test-retire-anchor'
  )
$test$,'retirada de ancora nao avalia uma Fonte nao atribuida');

select is(
  jsonb_build_object(
    'anchorRevision',(select revision from private.course_source_anchors
      where course_id='91000000-0000-4000-8000-000000000301'
        and anchor_id='anchor-retire'),
    'anchorStatus',(select status from private.course_source_anchors
      where course_id='91000000-0000-4000-8000-000000000301'
        and anchor_id='anchor-retire'),
    'courseRevision',(select revision from public.courses
      where id='91000000-0000-4000-8000-000000000301')
  ),
  '{"anchorRevision":2,"anchorStatus":"retired","courseRevision":3}'::jsonb,
  'retirada de ancora permanece atomica e avanca as revisoes'
);

-- A extensao editorial mede somente o texto autoral que pode ser lido. Duas
-- representacoes com as mesmas palavras nao podem divergir por ids, respostas
-- corretas ou controles de renderizacao escondidos no payload do componente.
insert into public.courses(id,owner_id,title,goal,revision) values(
  '91000000-0000-4000-8000-000000000401',
  '91000000-0000-4000-8000-000000000001',
  'Curso descartavel de extensao','Comparar texto entre componentes.',1
);
insert into private.course_entities(
  course_id,entity_type,entity_id,parent_type,parent_id,position,content
) values
  ('91000000-0000-4000-8000-000000000401','module','module-words',null,null,0,
    '{"title":"Representacoes","guide":{"goal":"Comparar representacoes.","include":[],"exclude":[],"notation":[],"avoid":[]}}'::jsonb),
  ('91000000-0000-4000-8000-000000000401','lesson','lesson-words','module','module-words',0,
    '{"title":"Texto observavel","guide":{"goal":"Medir texto autoral.","include":[],"exclude":[],"notation":[],"avoid":[]}}'::jsonb),
  ('91000000-0000-4000-8000-000000000401','microsequence','micro-words','lesson','lesson-words',0,
    '{"title":"Duas representacoes","goal":"Comparar a extensao.","role":"explain","dependsOn":[],"scopeItemIds":[],"covers":[],"checks":[],"errors":[]}'::jsonb),
  ('91000000-0000-4000-8000-000000000401','study_unit','unit-paragraph-words',
    'microsequence','micro-words',1,
    '{
      "title":"Mesmo texto",
      "content":[{
        "id":"controle-invisivel-paragrafo","package":"aralearn.resource.paragraph",
        "version":"1.0.0","data":{
          "text":"Qual porta recebe o quadro Porta um Porta dois",
          "languageTag":"pt-BR","textDirection":"ltr"
        }
      }],
      "response":null,"feedback":[],"topics":[]
    }'::jsonb),
  ('91000000-0000-4000-8000-000000000401','study_unit','unit-choice-words',
    'microsequence','micro-words',2,
    '{
      "title":"Mesmo texto",
      "content":[],
      "response":{
        "id":"controle-invisivel-escolha","package":"aralearn.response.choice",
        "version":"1.0.0","data":{
          "question":"Qual porta recebe o quadro",
          "selectionMode":"single","selectionCriterion":"correct",
          "options":[
            {"id":"controle-invisivel-alternativa-um","kind":"text","text":"Porta um"},
            {"id":"controle-invisivel-alternativa-dois","kind":"text","text":"Porta dois"}
          ],
          "answerIds":["controle-invisivel-alternativa-um"]
        }
      },
      "feedback":[],"topics":[]
    }'::jsonb);

select is(
  (public.get_owned_course_authoring_analytics_for_actor_v2(
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000401',1,
    '{"scope":{"kind":"course","ref":null}}'::jsonb
  )#>'{design,wordCountsByStudyUnit}'),
  '[{"wordCount":9,"studyUnitCount":2}]'::jsonb,
  'extensao autoral e comparavel entre paragrafo e escolha sem contar controles'
);

select * from finish();
rollback;
