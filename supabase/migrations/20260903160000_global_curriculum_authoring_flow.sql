-- Planejamento curricular global antes da producao incremental. O mapa usa a
-- hierarquia corrente; Partes continuam sendo apenas lotes operacionais.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '5min';
select pg_advisory_xact_lock(hashtextextended(
  'aralearn:global-curriculum-authoring-flow',0
));

do $global_curriculum_preflight$
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision'
       <> '20260903025658' then
    raise exception 'A revisao anterior do runtime nao corresponde a esperada.'
      using errcode='55000';
  end if;
  if to_regclass('private.course_instructional_plans') is null
     or to_regclass('private.course_instructional_plan_items') is null
     or to_regclass('private.course_design_target_plan_items') is null
     or to_regclass('private.course_authoring_parts') is null
     or to_regclass('private.course_entities') is null then
    raise exception 'O estado curricular necessario ao cutover nao esta integro.'
      using errcode='55000';
  end if;
end;
$global_curriculum_preflight$;

drop trigger course_design_parameter_definitions_immutable_v1
  on private.course_design_parameter_definitions;
alter table private.course_design_parameter_definitions
  drop constraint course_design_parameter_definitions_id_v1;
update private.course_design_parameter_definitions
set catalog_version='1.1.0';
update private.course_design_parameter_definitions
set definition=jsonb_build_object(
  'id','new_analysis_unit_ceiling_per_expository_study_unit',
  'label','Novas unidades de análise por unidade expositiva',
  'construct','Quantidade de unidades da análise instrucional introduzidas como novas em uma mesma unidade de estudo expositiva.',
  'operationalization','Conta identidades distintas declaradas como introduzidas em cada unidade expositiva ou mista; não usa caracteres, linhas, altura nem tempo como proxy.',
  'limitations','A contagem orienta granularidade de desenho e não mede carga cognitiva, dificuldade, aprendizagem ou qualidade da explicação.',
  'defaultStatus','product_hypothesis',
  'evidenceRefs',jsonb_build_array('koedinger2012kli','chen2023elementinteractivity'),
  'supportedScopes',jsonb_build_array(
    'course','lesson','didactic_microsequence','study_unit'
  ),
  'valueSchema',jsonb_build_object(
    'type','integer','minimum',1,'maximum',64
  ),
  'defaultValue',2
)
where parameter_id='new_analysis_unit_ceiling_per_expository_study_unit';
update private.course_design_parameter_definitions
set definition=jsonb_build_object(
  'id','required_explanation_forms',
  'label','Formas de explicação requeridas',
  'construct','Formas semanticamente distintas usadas para desenvolver uma unidade da análise instrucional.',
  'operationalization','Verifica, por identidade introduzida, quais formas foram desenvolvidas e quais foram declaradas não aplicáveis com motivo factual.',
  'limitations','As formas não são uma escala de qualidade nem uma lista universal; adequação depende do objeto, público, tarefa e representação.',
  'defaultStatus','product_hypothesis',
  'evidenceRefs',jsonb_build_array('wittwer2008explanations','ainsworth2006deft'),
  'supportedScopes',jsonb_build_array(
    'course','lesson','didactic_microsequence','study_unit'
  ),
  'valueSchema',jsonb_build_object(
    'type','set',
    'allowedValues',jsonb_build_array(
      'plain_definition','concrete_example','mechanism','contrast',
      'application_condition','limit_or_exception','worked_example',
      'representation_link'
    ),
    'minimumItems',1,'maximumItems',8
  ),
  'defaultValue',jsonb_build_array(
    'plain_definition','concrete_example','mechanism','contrast'
  )
)
where parameter_id='required_explanation_forms';
update private.course_design_parameter_definitions
set definition=jsonb_build_object(
  'id','minimum_distinct_practice_opportunities_per_evidence_requirement',
  'label','Oportunidades distintas por requisito de evidência',
  'construct','Quantidade mínima de oportunidades semanticamente distintas relacionadas a cada requisito de evidência.',
  'operationalization','Conta opportunityId distinto por requisito de evidência e conserva a operação-alvo invariável declarada em cada oportunidade.',
  'limitations','Quantidade de oportunidades não demonstra domínio, eficácia ou equivalência entre tarefas; a pertinência da evidência permanece uma hipótese de desenho.',
  'defaultStatus','product_hypothesis',
  'evidenceRefs',jsonb_build_array('karpicke2008retrieval','mislevy2003ecd'),
  'supportedScopes',jsonb_build_array(
    'course','lesson','didactic_microsequence','study_unit'
  ),
  'valueSchema',jsonb_build_object(
    'type','integer','minimum',1,'maximum',64
  ),
  'defaultValue',2
)
where parameter_id=
  'minimum_distinct_practice_opportunities_per_evidence_requirement';
update private.course_design_parameter_definitions
set definition=jsonb_build_object(
  'id','required_practice_variation_dimensions',
  'label','Dimensões requeridas de variação da prática',
  'construct','Dimensões semanticamente relevantes que variam entre oportunidades relacionadas ao mesmo requisito de evidência.',
  'operationalization','Verifica as dimensões declaradas nas oportunidades sem tratar mudança cosmética ou reordenação como variação semântica.',
  'limitations','Variação declarada não prova transferência nem aprendizagem e precisa preservar a operação-alvo pertinente ao requisito.',
  'defaultStatus','product_hypothesis',
  'evidenceRefs',jsonb_build_array('taylor2010interleaved','ainsworth2006deft'),
  'supportedScopes',jsonb_build_array(
    'course','lesson','didactic_microsequence','study_unit'
  ),
  'valueSchema',jsonb_build_object(
    'type','set',
    'allowedValues',jsonb_build_array(
      'case_or_data','context','task_feature','external_representation',
      'support_level'
    ),
    'minimumItems',1,'maximumItems',5
  ),
  'defaultValue',jsonb_build_array('case_or_data')
)
where parameter_id='required_practice_variation_dimensions';
alter table private.course_design_parameter_definitions
  add constraint course_design_parameter_definitions_id_v2 check(
    parameter_id~'^[a-z][a-z0-9_]{0,159}$'
      and catalog_version='1.1.0'
      and ordinal between 1 and 6
  );

insert into private.course_design_parameter_definitions(
  parameter_id,ordinal,catalog_version,value_kind,
  supported_scopes,definition,default_value
) values
(
  'authoring_chat_response_word_target',5,'1.1.0','integer',
  array['course','lesson','didactic_microsequence','study_unit'],
  jsonb_build_object(
    'id','authoring_chat_response_word_target',
    'label','Alvo de palavras por resposta de autoria',
    'construct','Extensão editorial pretendida para uma resposta do assistente durante a autoria.',
    'operationalization','Informa ao assistente um alvo flexível de palavras para a decisão corrente; respostas podem ultrapassá-lo quando a inspeção ou a segurança exigir.',
    'limitations','O alvo não é limite rígido e não autoriza esconder decisões educacionais, reduzir cobertura nem expor detalhes internos.',
    'defaultStatus','product_hypothesis','evidenceRefs','[]'::jsonb,
    'supportedScopes',jsonb_build_array(
      'course','lesson','didactic_microsequence','study_unit'
    ),
    'valueSchema',jsonb_build_object(
      'type','integer','minimum',20,'maximum',500
    ),'defaultValue',120
  ),
  '120'::jsonb
),
(
  'study_unit_content_word_target',6,'1.1.0','integer',
  array['course','lesson','didactic_microsequence','study_unit'],
  jsonb_build_object(
    'id','study_unit_content_word_target',
    'label','Alvo de palavras por unidade de estudo',
    'construct','Extensão editorial pretendida para o conteúdo de uma unidade de estudo focal.',
    'operationalization','Orienta a distribuição do conteúdo em torno de um alvo flexível, depois de satisfeitas a função didática e as dependências necessárias.',
    'limitations','O alvo não é máximo, não mede qualidade ou carga cognitiva e não justifica compactação nem atomização.',
    'defaultStatus','product_hypothesis','evidenceRefs','[]'::jsonb,
    'supportedScopes',jsonb_build_array(
      'course','lesson','didactic_microsequence','study_unit'
    ),
    'valueSchema',jsonb_build_object(
      'type','integer','minimum',40,'maximum',1000
    ),'defaultValue',180
  ),
  '180'::jsonb
);

create trigger course_design_parameter_definitions_immutable_v1
before update or delete on private.course_design_parameter_definitions
for each row execute function
  private.reject_course_design_parameter_definition_change_v1();

create or replace function private.valid_course_design_parameter_value_v1(
  p_parameter_id text,
  p_value jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path=pg_catalog,private
as $function$
declare
  v_kind text;
  v_allowed jsonb;
  v_minimum integer;
  v_maximum integer;
begin
  select definition.value_kind,
    definition.definition#>'{valueSchema,allowedValues}',
    (definition.definition#>>'{valueSchema,minimum}')::integer,
    (definition.definition#>>'{valueSchema,maximum}')::integer
  into v_kind,v_allowed,v_minimum,v_maximum
  from private.course_design_parameter_definitions definition
  where definition.parameter_id=p_parameter_id;
  if not found or p_value is null or octet_length(p_value::text)>4096 then
    return false;
  end if;
  if v_kind='integer' then
    return jsonb_typeof(p_value)='number'
      and p_value#>>'{}'~'^[0-9]+$'
      and (p_value#>>'{}')::integer between v_minimum and v_maximum;
  end if;
  return jsonb_typeof(p_value)='array'
    and jsonb_array_length(p_value) between 1 and jsonb_array_length(v_allowed)
    and not exists(
      select 1 from jsonb_array_elements(p_value) item(value)
      where jsonb_typeof(item.value)<>'string'
        or not (v_allowed ? (item.value#>>'{}'))
    )
    and (
      select count(*)=count(distinct item.value#>>'{}')
      from jsonb_array_elements(p_value) item(value)
    );
exception when others then
  return false;
end;
$function$;

revoke all on function private.valid_course_design_parameter_value_v1(text,jsonb)
from public,anon,authenticated,service_role;

do $advance_course_design_parameter_catalog$
declare
  v_definition text;
  v_original text;
begin
  v_definition:=pg_get_functiondef(
    'public.get_owned_course_design_for_actor_v2(uuid,uuid,text,text,integer,text)'::regprocedure
  );
  v_original:=v_definition;
  v_definition:=replace(
    v_definition,
    '''parameterCatalogVersion'',''1.0.0''',
    '''parameterCatalogVersion'',''1.1.0'''
  );
  if v_definition=v_original
     or strpos(v_definition,
       '''parameterCatalogVersion'',''1.0.0''')>0
     or strpos(v_definition,
       '''parameterCatalogVersion'',''1.1.0''')=0 then
    raise exception 'A leitura do catalogo parametrizado nao corresponde ao contrato esperado.'
      using errcode='55000';
  end if;
  execute v_definition;
end;
$advance_course_design_parameter_catalog$;

-- A calibracao automatica preenche apenas o que continua automatico. Uma
-- condicao escolhida pela pessoa autora ou pela pesquisa tem precedencia no
-- mesmo escopo, inclusive diante de chamadas concorrentes.
do $protect_explicit_design_assignments$
declare
  v_definition text;
  v_original text;
  v_parameter_before text:=$old$
      where row(
        course_design_parameter_assignments.value,
        course_design_parameter_assignments.origin,
        course_design_parameter_assignments.reason
      ) is distinct from row(excluded.value,excluded.origin,excluded.reason);$old$;
  v_parameter_after text:=$new$
      where not (
        excluded.origin='automatic'
        and course_design_parameter_assignments.origin in('author','research_condition')
      ) and row(
        course_design_parameter_assignments.value,
        course_design_parameter_assignments.origin,
        course_design_parameter_assignments.reason
      ) is distinct from row(excluded.value,excluded.origin,excluded.reason);$new$;
  v_guidance_before text:=$old$
      where row(
        course_authoring_guidance_assignments.guidance,
        course_authoring_guidance_assignments.origin,
        course_authoring_guidance_assignments.reason
      ) is distinct from row(excluded.guidance,excluded.origin,excluded.reason);$old$;
  v_guidance_after text:=$new$
      where not (
        excluded.origin='automatic'
        and course_authoring_guidance_assignments.origin in('author','research_condition')
      ) and row(
        course_authoring_guidance_assignments.guidance,
        course_authoring_guidance_assignments.origin,
        course_authoring_guidance_assignments.reason
      ) is distinct from row(excluded.guidance,excluded.origin,excluded.reason);$new$;
begin
  v_definition:=replace(pg_get_functiondef(
    'public.apply_course_design_command_for_actor_v2(uuid,uuid,bigint,jsonb,text,text,text)'::regprocedure
  ),E'\r\n',E'\n');
  v_original:=v_definition;
  v_definition:=replace(v_definition,v_parameter_before,v_parameter_after);
  v_definition:=replace(v_definition,v_guidance_before,v_guidance_after);
  if v_definition=v_original
     or strpos(v_definition,v_parameter_before)>0
     or strpos(v_definition,v_guidance_before)>0
     or strpos(v_definition,
       'course_design_parameter_assignments.origin in(''author'',''research_condition'')')=0
     or strpos(v_definition,
       'course_authoring_guidance_assignments.origin in(''author'',''research_condition'')')=0 then
    raise exception 'A precedencia das configuracoes explicitas nao corresponde ao contrato esperado.'
      using errcode='55000';
  end if;
  execute v_definition;
end;
$protect_explicit_design_assignments$;

alter table private.course_instructional_plans
  add column curriculum_map_status text not null default 'absent';
alter table private.course_instructional_plans
  add constraint course_instructional_plans_curriculum_map_status_v1 check(
    curriculum_map_status in ('absent','draft','approved')
  );

update private.course_instructional_plans plan
set curriculum_map_status='draft'
where exists(
  select 1 from private.course_entities entity
  where entity.course_id=plan.course_id
    and entity.entity_type in('module','lesson','microsequence')
);

alter table private.course_instructional_plan_items
  add column description text not null default '';
alter table private.course_instructional_plan_items
  add constraint course_instructional_plan_items_description_v1 check(
    char_length(description)<=4000
      and translate(description,E'\n\r\t','') !~ '[[:cntrl:]]'
  );
alter table private.course_instructional_plan_items
  drop constraint course_instructional_plan_items_kind_v1;
alter table private.course_instructional_plan_items
  add constraint course_instructional_plan_items_kind_v2 check(item_kind in(
    'intended_learning_outcome','instructional_analysis_unit',
    'evidence_requirement','declared_prerequisite','curriculum_scope_item'
  ));

alter table private.course_design_target_plan_items
  drop constraint course_design_target_plan_items_kind_v1;
alter table private.course_design_target_plan_items
  add constraint course_design_target_plan_items_kind_v2 check(
    plan_item_kind in(
      'instructional_analysis_unit','evidence_requirement',
      'curriculum_scope_item'
    )
  );

alter table private.course_authoring_parts
  add column progression jsonb;
create function private.valid_course_authoring_progression_v1(p_value jsonb)
returns boolean
language sql
immutable
security definer
set search_path=pg_catalog
as $function$
  select case when jsonb_typeof(p_value) is distinct from 'array' then false else coalesce(
      jsonb_array_length(p_value) between 1 and 64
      and octet_length(p_value::text)<=65536
      and not exists(
        select 1 from jsonb_array_elements(p_value) item(value)
        where jsonb_typeof(item.value)<>'string'
          or nullif(btrim(item.value#>>'{}'),'') is null
          or char_length(item.value#>>'{}')>1000
          or translate(item.value#>>'{}',E'\n\r\t','') ~ '[[:cntrl:]]'
      ),false
    ) end
$function$;
revoke all on function private.valid_course_authoring_progression_v1(jsonb)
from public,anon,authenticated,service_role;
alter table private.course_authoring_parts
  add constraint course_authoring_parts_progression_v1 check(
    private.valid_course_authoring_progression_v1(progression)
  ) not valid;
update private.course_authoring_parts
set progression=jsonb_build_array(coalesce(nullif(intent,''),title));
alter table private.course_authoring_parts
  alter column progression set not null;
alter table private.course_authoring_parts
  validate constraint course_authoring_parts_progression_v1;

-- O contrato interno da aplicacao permanece v1, mas agora explicita o uso de
-- ideias ja estabelecidas e a cobertura curricular efetiva. A retomada
-- continua derivavel das explicacoes.
update private.course_entities entity
set design_application=jsonb_set(
  jsonb_set(
    entity.design_application,
    '{usedInstructionalAnalysisUnitIds}',
    coalesce(
      entity.design_application->'usedInstructionalAnalysisUnitIds','[]'::jsonb
    ),true
  ),
  '{curriculumScopeItemIds}',
  coalesce(entity.design_application->'curriculumScopeItemIds','[]'::jsonb),
  true
)
where entity.entity_type='study_unit'
  and entity.design_application is not null
  and not (entity.design_application ?& array[
    'usedInstructionalAnalysisUnitIds','curriculumScopeItemIds'
  ]);

alter table private.course_change_receipts
  drop constraint course_change_receipts_operation_v11;
alter table private.course_change_receipts
  add constraint course_change_receipts_operation_v12 check(operation in(
    'create_course','commit_course_composition','apply_course_design_command_v2',
    'execute_course_source_command','execute_course_anchored_annotation',
    'create_course_anchored_annotations','grant_access','revoke_access',
    'commit_personal_course_copy_edit','ingest_course_source_pdf',
    'save_course_authoring_part_v1','save_course_curricular_map_v1',
    'materialize_course_authoring_part_v1',
    'materialize_course_authoring_part_v2'
  ));

-- Dependencias curriculares podem atravessar Licoes, desde que apontem para
-- uma Microssequencia anterior no percurso global.
create or replace function private.assert_course_lesson_dependencies_v1(
  p_course_id uuid,
  p_lesson_ids text[]
)
returns void
language plpgsql
stable
security definer
set search_path=pg_catalog,private
as $function$
begin
  if p_course_id is null or cardinality(coalesce(p_lesson_ids,'{}'::text[]))=0 then
    return;
  end if;
  if exists(
    select 1
    from private.course_entities microsequence
    where microsequence.course_id=p_course_id
      and microsequence.entity_type='microsequence'
      and microsequence.parent_id=any(p_lesson_ids)
      and jsonb_typeof(microsequence.content->'dependsOn')<>'array'
  ) or exists(
    select 1
    from private.course_entities microsequence
    cross join lateral jsonb_array_elements(
      microsequence.content->'dependsOn'
    ) dependency(value)
    where microsequence.course_id=p_course_id
      and microsequence.entity_type='microsequence'
      and microsequence.parent_id=any(p_lesson_ids)
      and (
        jsonb_typeof(dependency.value)<>'string'
        or nullif(btrim(dependency.value#>>'{}'),'') is null
        or char_length(dependency.value#>>'{}')>240
      )
  ) or exists(
    select 1
    from private.course_entities microsequence
    cross join lateral jsonb_array_elements_text(
      microsequence.content->'dependsOn'
    ) dependency(value)
    where microsequence.course_id=p_course_id
      and microsequence.entity_type='microsequence'
      and microsequence.parent_id=any(p_lesson_ids)
    group by microsequence.entity_id,dependency.value
    having count(*)>1
  ) then
    raise exception 'As dependencias curriculares sao invalidas ou repetidas.'
      using errcode='23514';
  end if;
  if exists(
    select 1
    from private.course_entities current_micro
    join private.course_entities current_lesson
      on current_lesson.course_id=current_micro.course_id
     and current_lesson.entity_type='lesson'
     and current_lesson.entity_id=current_micro.parent_id
    join private.course_entities current_module
      on current_module.course_id=current_lesson.course_id
     and current_module.entity_type='module'
     and current_module.entity_id=current_lesson.parent_id
    cross join lateral jsonb_array_elements_text(
      current_micro.content->'dependsOn'
    ) dependency_value(value)
    left join private.course_entities dependency
      on dependency.course_id=current_micro.course_id
     and dependency.entity_type='microsequence'
     and dependency.entity_id=dependency_value.value
    left join private.course_entities dependency_lesson
      on dependency_lesson.course_id=dependency.course_id
     and dependency_lesson.entity_type='lesson'
     and dependency_lesson.entity_id=dependency.parent_id
    left join private.course_entities dependency_module
      on dependency_module.course_id=dependency_lesson.course_id
     and dependency_module.entity_type='module'
     and dependency_module.entity_id=dependency_lesson.parent_id
    where current_micro.course_id=p_course_id
      and current_micro.entity_type='microsequence'
      and current_micro.parent_id=any(p_lesson_ids)
      and (
        dependency.course_id is null
        or row(
          dependency_module.position,dependency_lesson.position,
          dependency.position,dependency.entity_id
        )>=row(
          current_module.position,current_lesson.position,
          current_micro.position,current_micro.entity_id
        )
      )
  ) then
    raise exception 'Uma dependencia precisa apontar para uma Microssequencia anterior.'
      using errcode='23514';
  end if;
end;
$function$;

revoke all on function private.assert_course_lesson_dependencies_v1(uuid,text[])
from public,anon,authenticated,service_role;

create function private.current_course_curricular_map_v1(p_course_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,private
as $function$
  select jsonb_build_object(
    'audience',plan.audience,
    'prerequisites',coalesce((
      select jsonb_agg(to_jsonb(item.statement) order by item.position,item.id)
      from private.course_instructional_plan_items item
      where item.course_id=plan.course_id
        and item.instructional_plan_id=plan.id
        and item.item_kind='declared_prerequisite'
    ),'[]'::jsonb),
    'scopeItems',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',item.id,'position',item.position,'statement',item.statement
      ) order by item.position,item.id)
      from private.course_instructional_plan_items item
      where item.course_id=plan.course_id
        and item.instructional_plan_id=plan.id
        and item.item_kind='curriculum_scope_item'
    ),'[]'::jsonb),
    'modules',coalesce((
      select jsonb_agg(jsonb_build_object(
        'moduleId',module_value.entity_id,
        'position',module_value.position,
        'title',module_value.content->>'title',
        'objective',coalesce(module_value.content#>>'{guide,goal}',''),
        'lessons',coalesce((
          select jsonb_agg(jsonb_build_object(
            'lessonId',lesson.entity_id,
            'position',lesson.position,
            'title',lesson.content->>'title',
            'objective',coalesce(lesson.content#>>'{guide,goal}',''),
            'microsequences',coalesce((
              select jsonb_agg(jsonb_build_object(
                'microsequenceId',microsequence.entity_id,
                'position',microsequence.position,
                'title',microsequence.content->>'title',
                'objective',coalesce(microsequence.content->>'goal',''),
                'dependencyMicrosequenceIds',coalesce(
                  microsequence.content->'dependsOn','[]'::jsonb
                ),
                'scopeItemIds',coalesce(
                  microsequence.content->'scopeItemIds','[]'::jsonb
                )
              ) order by microsequence.position,microsequence.entity_id)
              from private.course_entities microsequence
              where microsequence.course_id=lesson.course_id
                and microsequence.entity_type='microsequence'
                and microsequence.parent_type='lesson'
                and microsequence.parent_id=lesson.entity_id
            ),'[]'::jsonb)
          ) order by lesson.position,lesson.entity_id)
          from private.course_entities lesson
          where lesson.course_id=module_value.course_id
            and lesson.entity_type='lesson'
            and lesson.parent_type='module'
            and lesson.parent_id=module_value.entity_id
        ),'[]'::jsonb)
      ) order by module_value.position,module_value.entity_id)
      from private.course_entities module_value
      where module_value.course_id=plan.course_id
        and module_value.entity_type='module'
        and module_value.parent_type is null
        and module_value.parent_id is null
    ),'[]'::jsonb)
  )
  from private.course_instructional_plans plan
  where plan.course_id=p_course_id
$function$;

revoke all on function private.current_course_curricular_map_v1(uuid)
from public,anon,authenticated,service_role;

create function private.valid_course_curricular_map_shape_v1(p_map jsonb)
returns boolean
language sql
immutable
security definer
set search_path=pg_catalog
as $function$
  select coalesce(
    jsonb_typeof(p_map)='object'
    and p_map ?& array['audience','prerequisites','scopeItems','modules']
    and p_map-'audience'-'prerequisites'-'scopeItems'-'modules'='{}'::jsonb
    and jsonb_typeof(p_map->'audience')='string'
    and nullif(btrim(p_map->>'audience'),'') is not null
    and char_length(p_map->>'audience')<=2000
    and translate(p_map->>'audience',E'\n\r\t','') !~ '[[:cntrl:]]'
    and jsonb_typeof(p_map->'prerequisites')='array'
    and jsonb_array_length(p_map->'prerequisites')<=64
    and jsonb_typeof(p_map->'scopeItems')='array'
    and jsonb_array_length(p_map->'scopeItems') between 1 and 256
    and jsonb_typeof(p_map->'modules')='array'
    and jsonb_array_length(p_map->'modules') between 1 and 64
    and octet_length(p_map::text)<=1048576
    and not exists(
      select 1
      from jsonb_array_elements(p_map->'prerequisites') prerequisite(value)
      where jsonb_typeof(prerequisite.value)<>'string'
        or nullif(btrim(prerequisite.value#>>'{}'),'') is null
        or prerequisite.value#>>'{}'<>btrim(prerequisite.value#>>'{}')
        or char_length(prerequisite.value#>>'{}')>2000
        or translate(prerequisite.value#>>'{}',E'\n\r\t','') ~ '[[:cntrl:]]'
    )
    and (
      select count(*)=count(distinct prerequisite.value#>>'{}')
      from jsonb_array_elements(p_map->'prerequisites') prerequisite(value)
    )
    and not exists(
      select 1
      from jsonb_array_elements(p_map->'scopeItems')
        with ordinality scope_item(value,ordinal)
      where jsonb_typeof(scope_item.value)<>'object'
        or scope_item.value ?& array['id','position','statement'] is not true
        or scope_item.value-'id'-'position'-'statement'<>'{}'::jsonb
        or jsonb_typeof(scope_item.value->'id')<>'string'
        or (scope_item.value->>'id') !~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or jsonb_typeof(scope_item.value->'position')<>'number'
        or (scope_item.value->>'position')<>((scope_item.ordinal-1)::text)
        or jsonb_typeof(scope_item.value->'statement')<>'string'
        or nullif(btrim(scope_item.value->>'statement'),'') is null
        or scope_item.value->>'statement'<>btrim(scope_item.value->>'statement')
        or char_length(scope_item.value->>'statement')>2000
        or translate(scope_item.value->>'statement',E'\n\r\t','') ~ '[[:cntrl:]]'
    )
    and (
      select count(*)=count(distinct scope_item.value->>'id')
        and count(*)=count(distinct scope_item.value->>'statement')
      from jsonb_array_elements(p_map->'scopeItems') scope_item(value)
    )
    and not exists(
      select 1
      from jsonb_array_elements(p_map->'modules')
        with ordinality module_value(value,ordinal)
      where jsonb_typeof(module_value.value)<>'object'
        or module_value.value ?& array[
          'moduleId','position','title','objective','lessons'
        ] is not true
        or module_value.value-'moduleId'-'position'-'title'-'objective'-'lessons'
          <>'{}'::jsonb
        or jsonb_typeof(module_value.value->'moduleId')<>'string'
        or nullif(btrim(module_value.value->>'moduleId'),'') is null
        or module_value.value->>'moduleId'<>btrim(module_value.value->>'moduleId')
        or char_length(module_value.value->>'moduleId')>240
        or octet_length(module_value.value->>'moduleId')>960
        or module_value.value->>'moduleId'~'[[:cntrl:]]'
        or jsonb_typeof(module_value.value->'position')<>'number'
        or module_value.value->>'position'<>((module_value.ordinal-1)::text)
        or jsonb_typeof(module_value.value->'title')<>'string'
        or nullif(btrim(module_value.value->>'title'),'') is null
        or char_length(module_value.value->>'title')>300
        or translate(module_value.value->>'title',E'\n\r\t','') ~ '[[:cntrl:]]'
        or jsonb_typeof(module_value.value->'objective')<>'string'
        or nullif(btrim(module_value.value->>'objective'),'') is null
        or char_length(module_value.value->>'objective')>2000
        or translate(module_value.value->>'objective',E'\n\r\t','') ~ '[[:cntrl:]]'
        or jsonb_typeof(module_value.value->'lessons')<>'array'
        or jsonb_array_length(module_value.value->'lessons') not between 1 and 64
    )
    and not exists(
      select 1
      from jsonb_array_elements(p_map->'modules') module_value(value)
      cross join lateral jsonb_array_elements(module_value.value->'lessons')
        with ordinality lesson(value,ordinal)
      where jsonb_typeof(lesson.value)<>'object'
        or lesson.value ?& array[
          'lessonId','position','title','objective','microsequences'
        ] is not true
        or lesson.value-'lessonId'-'position'-'title'-'objective'-'microsequences'
          <>'{}'::jsonb
        or jsonb_typeof(lesson.value->'lessonId')<>'string'
        or nullif(btrim(lesson.value->>'lessonId'),'') is null
        or lesson.value->>'lessonId'<>btrim(lesson.value->>'lessonId')
        or char_length(lesson.value->>'lessonId')>240
        or octet_length(lesson.value->>'lessonId')>960
        or lesson.value->>'lessonId'~'[[:cntrl:]]'
        or jsonb_typeof(lesson.value->'position')<>'number'
        or lesson.value->>'position'<>((lesson.ordinal-1)::text)
        or jsonb_typeof(lesson.value->'title')<>'string'
        or nullif(btrim(lesson.value->>'title'),'') is null
        or char_length(lesson.value->>'title')>300
        or translate(lesson.value->>'title',E'\n\r\t','') ~ '[[:cntrl:]]'
        or jsonb_typeof(lesson.value->'objective')<>'string'
        or nullif(btrim(lesson.value->>'objective'),'') is null
        or char_length(lesson.value->>'objective')>2000
        or translate(lesson.value->>'objective',E'\n\r\t','') ~ '[[:cntrl:]]'
        or jsonb_typeof(lesson.value->'microsequences')<>'array'
        or jsonb_array_length(lesson.value->'microsequences') not between 1 and 64
    )
    and not exists(
      select 1
      from jsonb_array_elements(p_map->'modules') module_value(value)
      cross join lateral jsonb_array_elements(module_value.value->'lessons') lesson(value)
      cross join lateral jsonb_array_elements(lesson.value->'microsequences')
        with ordinality microsequence(value,ordinal)
      where jsonb_typeof(microsequence.value)<>'object'
        or microsequence.value ?& array[
          'microsequenceId','position','title','objective',
          'dependencyMicrosequenceIds','scopeItemIds'
        ] is not true
        or microsequence.value-'microsequenceId'-'position'-'title'-'objective'
          -'dependencyMicrosequenceIds'-'scopeItemIds'<>'{}'::jsonb
        or jsonb_typeof(microsequence.value->'microsequenceId')<>'string'
        or nullif(btrim(microsequence.value->>'microsequenceId'),'') is null
        or microsequence.value->>'microsequenceId'
          <>btrim(microsequence.value->>'microsequenceId')
        or char_length(microsequence.value->>'microsequenceId')>240
        or octet_length(microsequence.value->>'microsequenceId')>960
        or microsequence.value->>'microsequenceId'~'[[:cntrl:]]'
        or jsonb_typeof(microsequence.value->'position')<>'number'
        or microsequence.value->>'position'<>((microsequence.ordinal-1)::text)
        or jsonb_typeof(microsequence.value->'title')<>'string'
        or nullif(btrim(microsequence.value->>'title'),'') is null
        or char_length(microsequence.value->>'title')>300
        or translate(microsequence.value->>'title',E'\n\r\t','') ~ '[[:cntrl:]]'
        or jsonb_typeof(microsequence.value->'objective')<>'string'
        or nullif(btrim(microsequence.value->>'objective'),'') is null
        or char_length(microsequence.value->>'objective')>2000
        or translate(microsequence.value->>'objective',E'\n\r\t','') ~ '[[:cntrl:]]'
        or jsonb_typeof(microsequence.value->'dependencyMicrosequenceIds')<>'array'
        or jsonb_array_length(microsequence.value->'dependencyMicrosequenceIds')>64
        or jsonb_typeof(microsequence.value->'scopeItemIds')<>'array'
        or jsonb_array_length(microsequence.value->'scopeItemIds')>64
        or exists(
          select 1 from jsonb_array_elements(
            microsequence.value->'dependencyMicrosequenceIds'
          ) dependency(value)
          where jsonb_typeof(dependency.value)<>'string'
            or nullif(btrim(dependency.value#>>'{}'),'') is null
            or dependency.value#>>'{}'<>btrim(dependency.value#>>'{}')
            or char_length(dependency.value#>>'{}')>240
        )
        or exists(
          select 1 from jsonb_array_elements(
            microsequence.value->'scopeItemIds'
          ) scope_id(value)
          where jsonb_typeof(scope_id.value)<>'string'
            or (scope_id.value#>>'{}') !~
              '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        )
        or (
          select count(*)<>count(distinct dependency.value#>>'{}')
          from jsonb_array_elements(
            microsequence.value->'dependencyMicrosequenceIds'
          ) dependency(value)
        )
        or (
          select count(*)<>count(distinct scope_id.value#>>'{}')
          from jsonb_array_elements(
            microsequence.value->'scopeItemIds'
          ) scope_id(value)
        )
    )
    and (
      select count(*)=count(distinct module_value.value->>'moduleId')
      from jsonb_array_elements(p_map->'modules') module_value(value)
    )
    and (
      select count(*)=count(distinct lesson.value->>'lessonId')
      from jsonb_array_elements(p_map->'modules') module_value(value)
      cross join lateral jsonb_array_elements(module_value.value->'lessons') lesson(value)
    )
    and (
      select count(*)=count(distinct microsequence.value->>'microsequenceId')
      from jsonb_array_elements(p_map->'modules') module_value(value)
      cross join lateral jsonb_array_elements(module_value.value->'lessons') lesson(value)
      cross join lateral jsonb_array_elements(lesson.value->'microsequences')
        microsequence(value)
    ),false
  )
$function$;

revoke all on function private.valid_course_curricular_map_shape_v1(jsonb)
from public,anon,authenticated,service_role;

create function public.save_course_curricular_map_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_course_revision bigint,
  p_expected_plan_version bigint,
  p_approved boolean,
  p_curricular_map jsonb,
  p_request_id text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,extensions
as $function$
declare
  v_receipt private.course_change_receipts%rowtype;
  v_course public.courses%rowtype;
  v_plan private.course_instructional_plans%rowtype;
  v_before jsonb;
  v_changed boolean:=false;
  v_result jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_actor_id is null or p_course_id is null
     or p_expected_course_revision is null or p_expected_course_revision<1
     or p_expected_plan_version is null or p_expected_plan_version<1
     or p_approved is null
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
     or not private.valid_course_curricular_map_shape_v1(p_curricular_map) then
    raise exception 'Mapa curricular invalido.' using errcode='22023';
  end if;

  if exists(
    with micros as materialized(
      select module_value.ordinal as module_ordinal,
        lesson.ordinal as lesson_ordinal,microsequence.ordinal as micro_ordinal,
        microsequence.value
      from jsonb_array_elements(p_curricular_map->'modules')
        with ordinality module_value(value,ordinal)
      cross join lateral jsonb_array_elements(module_value.value->'lessons')
        with ordinality lesson(value,ordinal)
      cross join lateral jsonb_array_elements(lesson.value->'microsequences')
        with ordinality microsequence(value,ordinal)
    )
    select 1 from micros current_micro
    cross join lateral jsonb_array_elements_text(
      current_micro.value->'dependencyMicrosequenceIds'
    ) dependency(value)
    left join micros prerequisite
      on prerequisite.value->>'microsequenceId'=dependency.value
    where prerequisite.value is null
      or row(prerequisite.module_ordinal,prerequisite.lesson_ordinal,
        prerequisite.micro_ordinal)>=row(current_micro.module_ordinal,
        current_micro.lesson_ordinal,current_micro.micro_ordinal)
  ) then
    raise exception 'Uma dependencia curricular nao aponta para etapa anterior.'
      using errcode='23514';
  end if;
  if exists(
    select 1
    from jsonb_array_elements(p_curricular_map->'modules') module_value(value)
    cross join lateral jsonb_array_elements(module_value.value->'lessons') lesson(value)
    cross join lateral jsonb_array_elements(lesson.value->'microsequences')
      microsequence(value)
    cross join lateral jsonb_array_elements_text(
      microsequence.value->'scopeItemIds'
    ) scope_id(value)
    where not exists(
      select 1 from jsonb_array_elements(p_curricular_map->'scopeItems') item(value)
      where item.value->>'id'=scope_id.value
    )
  ) then
    raise exception 'Uma Microssequencia referencia item de escopo inexistente.'
      using errcode='23514';
  end if;
  if p_approved and exists(
    select 1
    from jsonb_array_elements(p_curricular_map->'scopeItems') item(value)
    where not exists(
      select 1
      from jsonb_array_elements(p_curricular_map->'modules') module_value(value)
      cross join lateral jsonb_array_elements(module_value.value->'lessons') lesson(value)
      cross join lateral jsonb_array_elements(lesson.value->'microsequences')
        microsequence(value)
      where microsequence.value->'scopeItemIds' ? (item.value->>'id')
    )
  ) then
    raise exception 'Todo item obrigatorio precisa aparecer no mapa antes da aprovacao.'
      using errcode='23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:'||p_actor_id::text||':'||p_request_id,0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id=p_actor_id and receipt.request_id=p_request_id
    and receipt.expires_at<=statement_timestamp();
  select * into v_receipt from private.course_change_receipts receipt
  where receipt.actor_id=p_actor_id and receipt.request_id=p_request_id;
  if found then
    if v_receipt.operation<>'save_course_curricular_map_v1'
       or v_receipt.course_id<>p_course_id
       or v_receipt.request_hash<>p_request_hash then
      raise exception 'requestId reutilizado com mapa curricular incompatível.'
        using errcode='23514';
    end if;
    return (v_receipt.result-'idempotent')||jsonb_build_object('idempotent',true);
  end if;

  perform 1 from auth.users actor where actor.id=p_actor_id for key share;
  if not found then
    raise exception 'Pessoa inexistente ou inacessivel.' using errcode='PT404';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('course-row:'||p_course_id::text,0));
  select * into strict v_course from public.courses course
  where course.id=p_course_id for update;
  if v_course.revision<>p_expected_course_revision then
    raise exception 'O curso mudou; releia antes de salvar o mapa.'
      using errcode='40001';
  end if;
  select * into strict v_plan from private.course_instructional_plans plan
  where plan.course_id=p_course_id for update;
  if v_plan.version<>p_expected_plan_version then
    raise exception 'O planejamento mudou; releia antes de salvar o mapa.'
      using errcode='40001';
  end if;
  v_before:=private.current_course_curricular_map_v1(p_course_id);

  if p_approved then
    if v_plan.curriculum_map_status='absent' or v_before<>p_curricular_map then
      raise exception 'A aprovacao precisa corresponder ao mapa inspecionavel corrente.'
        using errcode='23514';
    end if;
    v_changed:=v_plan.curriculum_map_status<>'approved';
    if v_changed then
      update private.course_instructional_plans plan
      set curriculum_map_status='approved',version=version+1,updated_at=now()
      where plan.id=v_plan.id returning * into v_plan;
      update public.courses course
      set revision=revision+1,updated_at=now()
      where course.id=p_course_id returning * into v_course;
    end if;
  else
    -- Entidades ja produzidas nao podem ser removidas, movidas nem
    -- reinterpretadas por uma revisao global posterior. Um lote ainda vazio
    -- e somente uma divisao operacional e nao protege o curriculo.
    if exists(
      with incoming as materialized(
        select module_value.value
        from jsonb_array_elements(p_curricular_map->'modules') module_value(value)
      ), protected as materialized(
        select distinct module_value.*
        from private.course_entities module_value
        join private.course_entities lesson
          on lesson.course_id=module_value.course_id
         and lesson.entity_type='lesson' and lesson.parent_id=module_value.entity_id
        join private.course_entities microsequence
          on microsequence.course_id=lesson.course_id
         and microsequence.entity_type='microsequence'
         and microsequence.parent_id=lesson.entity_id
        where module_value.course_id=p_course_id
          and module_value.entity_type='module'
          and exists(
            select 1 from private.course_entities unit
            where unit.course_id=microsequence.course_id
              and unit.entity_type='study_unit' and unit.parent_id=microsequence.entity_id
          )
      )
      select 1 from protected
      left join incoming on incoming.value->>'moduleId'=protected.entity_id
      where incoming.value is null
        or (incoming.value->>'position')::integer<>protected.position
        or incoming.value->>'title'<>protected.content->>'title'
        or incoming.value->>'objective'<>coalesce(protected.content#>>'{guide,goal}','')
    ) or exists(
      with incoming as materialized(
        select module_value.value->>'moduleId' as module_id,lesson.value
        from jsonb_array_elements(p_curricular_map->'modules') module_value(value)
        cross join lateral jsonb_array_elements(module_value.value->'lessons') lesson(value)
      ), protected as materialized(
        select distinct lesson.*
        from private.course_entities lesson
        join private.course_entities microsequence
          on microsequence.course_id=lesson.course_id
         and microsequence.entity_type='microsequence'
         and microsequence.parent_id=lesson.entity_id
        where lesson.course_id=p_course_id and lesson.entity_type='lesson'
          and exists(
            select 1 from private.course_entities unit
            where unit.course_id=microsequence.course_id
              and unit.entity_type='study_unit' and unit.parent_id=microsequence.entity_id
          )
      )
      select 1 from protected
      left join incoming on incoming.value->>'lessonId'=protected.entity_id
      where incoming.value is null or incoming.module_id<>protected.parent_id
        or (incoming.value->>'position')::integer<>protected.position
        or incoming.value->>'title'<>protected.content->>'title'
        or incoming.value->>'objective'<>coalesce(protected.content#>>'{guide,goal}','')
    ) or exists(
      with incoming as materialized(
        select lesson.value->>'lessonId' as lesson_id,microsequence.value
        from jsonb_array_elements(p_curricular_map->'modules') module_value(value)
        cross join lateral jsonb_array_elements(module_value.value->'lessons') lesson(value)
        cross join lateral jsonb_array_elements(lesson.value->'microsequences')
          microsequence(value)
      ), protected as materialized(
        select microsequence.*
        from private.course_entities microsequence
        where microsequence.course_id=p_course_id
          and microsequence.entity_type='microsequence'
          and exists(
            select 1 from private.course_entities unit
            where unit.course_id=microsequence.course_id
              and unit.entity_type='study_unit' and unit.parent_id=microsequence.entity_id
          )
      )
      select 1 from protected
      left join incoming on incoming.value->>'microsequenceId'=protected.entity_id
      where incoming.value is null or incoming.lesson_id<>protected.parent_id
        or (incoming.value->>'position')::integer<>protected.position
        or incoming.value->>'title'<>protected.content->>'title'
        or incoming.value->>'objective'<>coalesce(protected.content->>'goal','')
        or incoming.value->'dependencyMicrosequenceIds'
          <>coalesce(protected.content->'dependsOn','[]'::jsonb)
        or incoming.value->'scopeItemIds'
          <>coalesce(protected.content->'scopeItemIds','[]'::jsonb)
    ) then
      raise exception 'O mapa nao pode alterar currículo ja atribuido ou materializado.'
        using errcode='23514';
    end if;

    insert into private.course_instructional_plan_items(
      id,course_id,instructional_plan_id,item_kind,position,statement,description
    )
    select coalesce(existing.id,extensions.gen_random_uuid()),p_course_id,v_plan.id,
      'declared_prerequisite',prerequisite.ordinal::integer-1,
      prerequisite.value#>>'{}',''
    from jsonb_array_elements(p_curricular_map->'prerequisites')
      with ordinality prerequisite(value,ordinal)
    left join private.course_instructional_plan_items existing
      on existing.course_id=p_course_id
     and existing.item_kind='declared_prerequisite'
     and existing.position=prerequisite.ordinal::integer-1
    on conflict(id) do update set
      position=excluded.position,statement=excluded.statement,
      version=course_instructional_plan_items.version+1,updated_at=now()
    where row(course_instructional_plan_items.position,
      course_instructional_plan_items.statement)
      is distinct from row(excluded.position,excluded.statement);

    delete from private.course_instructional_plan_items item
    where item.course_id=p_course_id and item.item_kind='declared_prerequisite'
      and item.position>=jsonb_array_length(p_curricular_map->'prerequisites');

    insert into private.course_instructional_plan_items(
      id,course_id,instructional_plan_id,item_kind,position,statement,description
    )
    select (scope_item.value->>'id')::uuid,p_course_id,v_plan.id,
      'curriculum_scope_item',(scope_item.value->>'position')::integer,
      scope_item.value->>'statement',''
    from jsonb_array_elements(p_curricular_map->'scopeItems') scope_item(value)
    on conflict(id) do update set
      position=excluded.position,statement=excluded.statement,
      version=course_instructional_plan_items.version+1,updated_at=now()
    where course_instructional_plan_items.course_id=excluded.course_id
      and course_instructional_plan_items.item_kind=excluded.item_kind
      and row(course_instructional_plan_items.position,
        course_instructional_plan_items.statement)
        is distinct from row(excluded.position,excluded.statement);

    -- Upserts acontecem antes das exclusoes; todas as restricoes de ordem sao
    -- diferiveis e enxergam o mapa final ao fim da transacao.
    insert into private.course_entities(
      course_id,entity_type,entity_id,parent_type,parent_id,position,content
    )
    select p_course_id,'module',module_value.value->>'moduleId',null,null,
      (module_value.value->>'position')::integer,jsonb_build_object(
        'title',module_value.value->>'title',
        'guide',jsonb_build_object(
          'goal',module_value.value->>'objective','include','[]'::jsonb,
          'exclude','[]'::jsonb,'notation','[]'::jsonb,'avoid','[]'::jsonb
        )
      )
    from jsonb_array_elements(p_curricular_map->'modules') module_value(value)
    on conflict(course_id,entity_type,entity_id) do update set
      parent_type=null,parent_id=null,position=excluded.position,
      content=course_entities.content||jsonb_build_object(
        'title',excluded.content->'title','guide',excluded.content->'guide'
      ),version=course_entities.version+1,updated_at=now()
    where row(course_entities.parent_type,course_entities.parent_id,
      course_entities.position,course_entities.content->'title',
      course_entities.content#>'{guide,goal}') is distinct from row(
      null::text,null::text,excluded.position,excluded.content->'title',
      excluded.content#>'{guide,goal}'
    );

    insert into private.course_entities(
      course_id,entity_type,entity_id,parent_type,parent_id,position,content
    )
    select p_course_id,'lesson',lesson.value->>'lessonId','module',
      module_value.value->>'moduleId',(lesson.value->>'position')::integer,
      jsonb_build_object(
        'title',lesson.value->>'title',
        'guide',jsonb_build_object(
          'goal',lesson.value->>'objective','include','[]'::jsonb,
          'exclude','[]'::jsonb,'notation','[]'::jsonb,'avoid','[]'::jsonb
        )
      )
    from jsonb_array_elements(p_curricular_map->'modules') module_value(value)
    cross join lateral jsonb_array_elements(module_value.value->'lessons') lesson(value)
    on conflict(course_id,entity_type,entity_id) do update set
      parent_type='module',parent_id=excluded.parent_id,position=excluded.position,
      content=course_entities.content||jsonb_build_object(
        'title',excluded.content->'title','guide',excluded.content->'guide'
      ),version=course_entities.version+1,updated_at=now()
    where row(course_entities.parent_type,course_entities.parent_id,
      course_entities.position,course_entities.content->'title',
      course_entities.content#>'{guide,goal}') is distinct from row(
      'module'::text,excluded.parent_id,excluded.position,
      excluded.content->'title',excluded.content#>'{guide,goal}'
    );

    insert into private.course_entities(
      course_id,entity_type,entity_id,parent_type,parent_id,position,content
    )
    select p_course_id,'microsequence',microsequence.value->>'microsequenceId',
      'lesson',lesson.value->>'lessonId',(microsequence.value->>'position')::integer,
      jsonb_build_object(
        'title',microsequence.value->>'title',
        'goal',microsequence.value->>'objective','role','explain',
        'dependsOn',microsequence.value->'dependencyMicrosequenceIds',
        'scopeItemIds',microsequence.value->'scopeItemIds',
        'covers',coalesce((
          select jsonb_agg(to_jsonb(scope_item.value->>'statement')
            order by scope_item.ordinal)
          from jsonb_array_elements(p_curricular_map->'scopeItems')
            with ordinality scope_item(value,ordinal)
          where microsequence.value->'scopeItemIds' ? (scope_item.value->>'id')
        ),'[]'::jsonb),'checks','[]'::jsonb,'errors','[]'::jsonb
      )
    from jsonb_array_elements(p_curricular_map->'modules') module_value(value)
    cross join lateral jsonb_array_elements(module_value.value->'lessons') lesson(value)
    cross join lateral jsonb_array_elements(lesson.value->'microsequences')
      microsequence(value)
    on conflict(course_id,entity_type,entity_id) do update set
      parent_type='lesson',parent_id=excluded.parent_id,position=excluded.position,
      content=course_entities.content||jsonb_build_object(
        'title',excluded.content->'title','goal',excluded.content->'goal',
        'role',excluded.content->'role','dependsOn',excluded.content->'dependsOn',
        'scopeItemIds',excluded.content->'scopeItemIds',
        'covers',excluded.content->'covers','checks',excluded.content->'checks',
        'errors',excluded.content->'errors'
      ),version=course_entities.version+1,updated_at=now()
    where row(course_entities.parent_type,course_entities.parent_id,
      course_entities.position,course_entities.content->'title',
      course_entities.content->'goal',course_entities.content->'dependsOn',
      course_entities.content->'scopeItemIds') is distinct from row(
      'lesson'::text,excluded.parent_id,excluded.position,
      excluded.content->'title',excluded.content->'goal',
      excluded.content->'dependsOn',excluded.content->'scopeItemIds'
    );

    delete from private.course_design_target_plan_items assignment
    where assignment.course_id=p_course_id
      and assignment.plan_item_kind='curriculum_scope_item';
    insert into private.course_design_target_plan_items(
      course_id,didactic_microsequence_id,plan_item_id,plan_item_kind
    )
    select p_course_id,microsequence.value->>'microsequenceId',
      (scope_id.value)::uuid,'curriculum_scope_item'
    from jsonb_array_elements(p_curricular_map->'modules') module_value(value)
    cross join lateral jsonb_array_elements(module_value.value->'lessons') lesson(value)
    cross join lateral jsonb_array_elements(lesson.value->'microsequences')
      microsequence(value)
    cross join lateral jsonb_array_elements_text(
      microsequence.value->'scopeItemIds'
    ) scope_id(value);

    -- Lotes ainda sem conteúdo são descartáveis: sua existência não pode
    -- congelar nem redefinir o mapa curricular. Ao retirar uma
    -- microssequência não materializada, solte somente o vínculo operacional.
    delete from private.course_authoring_part_didactic_microsequences membership
    where membership.course_id=p_course_id
      and not exists(
        select 1
        from jsonb_array_elements(p_curricular_map->'modules') module_value(value)
        cross join lateral jsonb_array_elements(module_value.value->'lessons') lesson(value)
        cross join lateral jsonb_array_elements(lesson.value->'microsequences') incoming(value)
        where incoming.value->>'microsequenceId'=membership.didactic_microsequence_id
      )
      and not exists(
        select 1 from private.course_entities unit
        where unit.course_id=membership.course_id
          and unit.entity_type='study_unit'
          and unit.parent_id=membership.didactic_microsequence_id
      );
    delete from private.course_authoring_parts part
    where part.course_id=p_course_id
      and not exists(
        select 1 from private.course_authoring_part_didactic_microsequences membership
        where membership.course_id=part.course_id
          and membership.authoring_part_id=part.id
      );
    with ordered as materialized(
      select part.id,row_number() over(order by part.position,part.id)::integer-1
        as next_position
      from private.course_authoring_parts part
      where part.course_id=p_course_id
    )
    update private.course_authoring_parts part
    set position=ordered.next_position,version=part.version+1,updated_at=now()
    from ordered
    where part.id=ordered.id and part.position<>ordered.next_position;

    delete from private.course_entities microsequence
    where microsequence.course_id=p_course_id
      and microsequence.entity_type='microsequence'
      and not exists(
        select 1
        from jsonb_array_elements(p_curricular_map->'modules') module_value(value)
        cross join lateral jsonb_array_elements(module_value.value->'lessons') lesson(value)
        cross join lateral jsonb_array_elements(lesson.value->'microsequences') incoming(value)
        where incoming.value->>'microsequenceId'=microsequence.entity_id
      );
    delete from private.course_entities lesson
    where lesson.course_id=p_course_id and lesson.entity_type='lesson'
      and not exists(
        select 1
        from jsonb_array_elements(p_curricular_map->'modules') module_value(value)
        cross join lateral jsonb_array_elements(module_value.value->'lessons') incoming(value)
        where incoming.value->>'lessonId'=lesson.entity_id
      );
    delete from private.course_entities module_value
    where module_value.course_id=p_course_id and module_value.entity_type='module'
      and not exists(
        select 1 from jsonb_array_elements(p_curricular_map->'modules') incoming(value)
        where incoming.value->>'moduleId'=module_value.entity_id
      );
    delete from private.course_instructional_plan_items item
    where item.course_id=p_course_id and item.item_kind='curriculum_scope_item'
      and not exists(
        select 1 from jsonb_array_elements(p_curricular_map->'scopeItems') incoming(value)
        where incoming.value->>'id'=item.id::text
      );

    perform private.assert_course_lesson_dependencies_v1(
      p_course_id,array(
        select lesson.entity_id from private.course_entities lesson
        where lesson.course_id=p_course_id and lesson.entity_type='lesson'
      )
    );

    v_changed:=v_before is distinct from p_curricular_map
      or v_plan.curriculum_map_status<>'draft';
    if v_changed then
      update private.course_instructional_plans plan
      set audience=p_curricular_map->>'audience',
        instructional_scope=(
          select string_agg(scope_item.value->>'statement',E'\n'
            order by scope_item.ordinal)
          from jsonb_array_elements(p_curricular_map->'scopeItems')
            with ordinality scope_item(value,ordinal)
        ),curriculum_map_status='draft',version=version+1,updated_at=now()
      where plan.id=v_plan.id returning * into v_plan;
      update public.courses course
      set revision=revision+1,updated_at=now()
      where course.id=p_course_id returning * into v_course;
    end if;
  end if;

  v_result:=jsonb_build_object(
    'contract','aralearn.course-curricular-map-change.v1',
    'courseId',p_course_id,'courseRevision',v_course.revision,
    'planVersion',v_plan.version,
    'approval',case when p_approved then 'approved' else 'draft' end,
    'changed',v_changed,'idempotent',false
  );
  insert into private.course_change_receipts(
    actor_id,request_id,operation,course_id,request_hash,result
  ) values(
    p_actor_id,p_request_id,'save_course_curricular_map_v1',
    p_course_id,p_request_hash,v_result
  );
  return v_result;
end;
$function$;

revoke all on function public.save_course_curricular_map_for_actor_v1(
  uuid,uuid,bigint,bigint,boolean,jsonb,text,text
) from public,anon,authenticated,service_role;
grant execute on function public.save_course_curricular_map_for_actor_v1(
  uuid,uuid,bigint,bigint,boolean,jsonb,text,text
) to service_role;

create or replace function public.save_course_authoring_part_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_course_revision bigint,
  p_expected_plan_version bigint,
  p_part jsonb,
  p_request_id text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,extensions
as $function$
declare
  v_receipt private.course_change_receipts%rowtype;
  v_course public.courses%rowtype;
  v_plan private.course_instructional_plans%rowtype;
  v_existing private.course_authoring_parts%rowtype;
  v_part_id uuid;
  v_part_existed boolean:=false;
  v_before jsonb;
  v_changed boolean:=false;
  v_result jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_actor_id is null or p_course_id is null
     or p_expected_course_revision is null or p_expected_course_revision<1
     or p_expected_plan_version is null or p_expected_plan_version<1
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_part)<>'object'
     or p_part ?& array[
       'partId','position','title','intent','progression','microsequences'
     ] is not true
     or p_part-'partId'-'position'-'title'-'intent'-'progression'-'microsequences'
       <>'{}'::jsonb
     or p_part->'partId'<>'null'::jsonb and (
       jsonb_typeof(p_part->'partId')<>'string'
       or (p_part->>'partId') !~
         '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     )
     or jsonb_typeof(p_part->'position')<>'number'
     or (p_part->>'position') !~ '^(0|[1-9][0-9]?)$'
     or (p_part->>'position')::integer not between 0 and 63
     or jsonb_typeof(p_part->'title')<>'string'
     or nullif(btrim(p_part->>'title'),'') is null
     or char_length(p_part->>'title')>300
     or translate(p_part->>'title',E'\n\r\t','') ~ '[[:cntrl:]]'
     or jsonb_typeof(p_part->'intent')<>'string'
     or nullif(btrim(p_part->>'intent'),'') is null
     or char_length(p_part->>'intent')>4000
     or translate(p_part->>'intent',E'\n\r\t','') ~ '[[:cntrl:]]'
     or not private.valid_course_authoring_progression_v1(p_part->'progression')
     or jsonb_typeof(p_part->'microsequences')<>'array'
     or jsonb_array_length(p_part->'microsequences') not between 1 and 32
     or octet_length(p_part::text)>524288
     or exists(
       select 1
       from jsonb_array_elements(p_part->'microsequences')
         with ordinality microsequence(value,ordinal)
       where jsonb_typeof(microsequence.value)<>'object'
         or microsequence.value ?& array['microsequenceId','position'] is not true
         or microsequence.value-'microsequenceId'-'position'<>'{}'::jsonb
         or jsonb_typeof(microsequence.value->'microsequenceId')<>'string'
         or nullif(btrim(microsequence.value->>'microsequenceId'),'') is null
         or microsequence.value->>'microsequenceId'
           <>btrim(microsequence.value->>'microsequenceId')
         or char_length(microsequence.value->>'microsequenceId')>240
         or jsonb_typeof(microsequence.value->'position')<>'number'
         or microsequence.value->>'position'<>((microsequence.ordinal-1)::text)
     )
     or (
       select count(*)<>count(distinct microsequence.value->>'microsequenceId')
       from jsonb_array_elements(p_part->'microsequences') microsequence(value)
     ) then
    raise exception 'Lote de producao invalido.' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:'||p_actor_id::text||':'||p_request_id,0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id=p_actor_id and receipt.request_id=p_request_id
    and receipt.expires_at<=statement_timestamp();
  select * into v_receipt from private.course_change_receipts receipt
  where receipt.actor_id=p_actor_id and receipt.request_id=p_request_id;
  if found then
    if v_receipt.operation<>'save_course_authoring_part_v1'
       or v_receipt.course_id<>p_course_id
       or v_receipt.request_hash<>p_request_hash then
      raise exception 'requestId reutilizado com lote incompatível.'
        using errcode='23514';
    end if;
    return (v_receipt.result-'idempotent')||jsonb_build_object('idempotent',true);
  end if;

  perform 1 from auth.users actor where actor.id=p_actor_id for key share;
  if not found then
    raise exception 'Pessoa inexistente ou inacessivel.' using errcode='PT404';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('course-row:'||p_course_id::text,0));
  select * into strict v_course from public.courses course
  where course.id=p_course_id for update;
  if v_course.revision<>p_expected_course_revision then
    raise exception 'O curso mudou; releia antes de salvar o lote.'
      using errcode='40001';
  end if;
  select * into strict v_plan from private.course_instructional_plans plan
  where plan.course_id=p_course_id for update;
  if v_plan.version<>p_expected_plan_version then
    raise exception 'O planejamento mudou; releia antes de salvar o lote.'
      using errcode='40001';
  end if;
  if v_plan.curriculum_map_status<>'approved' then
    raise exception 'A producao so pode ser organizada depois da aprovacao do mapa curricular.'
      using errcode='23514';
  end if;

  v_part_id:=case when p_part->'partId'='null'::jsonb
    then extensions.gen_random_uuid() else (p_part->>'partId')::uuid end;
  select * into v_existing from private.course_authoring_parts part
  where part.id=v_part_id for update;
  v_part_existed:=found;
  if found and (v_existing.course_id<>p_course_id
      or v_existing.instructional_plan_id<>v_plan.id) then
    raise exception 'O lote pertence a outro planejamento.' using errcode='23514';
  end if;
  if exists(
    select 1 from jsonb_array_elements(p_part->'microsequences') microsequence(value)
    left join private.course_entities entity
      on entity.course_id=p_course_id and entity.entity_type='microsequence'
     and entity.entity_id=microsequence.value->>'microsequenceId'
    where entity.course_id is null
  ) then
    raise exception 'O lote referencia Microssequencia fora do mapa aprovado.'
      using errcode='23514';
  end if;
  if v_part_existed then
    select jsonb_build_object(
      'partId',v_existing.id,'position',v_existing.position,
      'title',v_existing.title,'intent',v_existing.intent,
      'progression',v_existing.progression,
      'microsequences',coalesce((
        select jsonb_agg(jsonb_build_object(
          'microsequenceId',membership.didactic_microsequence_id,
          'position',membership.production_position
        ) order by membership.production_position,membership.didactic_microsequence_id)
        from private.course_authoring_part_didactic_microsequences membership
        where membership.course_id=p_course_id
          and membership.authoring_part_id=v_part_id
      ),'[]'::jsonb)
    ) into v_before;
  end if;
  v_changed:=not v_part_existed or v_before is distinct from p_part;

  if v_changed then
    -- O lote organiza a producao, nao o curriculo. Ao reagrupar, transfira
    -- atomicamente os pontos escolhidos e preserve uma unica associacao.
    update private.course_authoring_parts part
    set version=part.version+1,updated_at=now()
    where part.course_id=p_course_id and part.id<>v_part_id
      and exists(
        select 1
        from private.course_authoring_part_didactic_microsequences membership
        join jsonb_array_elements(p_part->'microsequences') microsequence(value)
          on microsequence.value->>'microsequenceId'
            =membership.didactic_microsequence_id
        where membership.course_id=part.course_id
          and membership.authoring_part_id=part.id
      );
    delete from private.course_authoring_part_didactic_microsequences membership
    using jsonb_array_elements(p_part->'microsequences') microsequence(value)
    where membership.course_id=p_course_id
      and membership.authoring_part_id<>v_part_id
      and membership.didactic_microsequence_id
        =microsequence.value->>'microsequenceId';
    insert into private.course_authoring_parts(
      id,course_id,instructional_plan_id,position,title,intent,progression
    ) values(
      v_part_id,p_course_id,v_plan.id,(p_part->>'position')::integer,
      p_part->>'title',p_part->>'intent',p_part->'progression'
    ) on conflict(id) do update set
      position=excluded.position,title=excluded.title,intent=excluded.intent,
      progression=excluded.progression,version=course_authoring_parts.version+1,
      updated_at=now();
    delete from private.course_authoring_part_didactic_microsequences membership
    where membership.course_id=p_course_id and membership.authoring_part_id=v_part_id;
    insert into private.course_authoring_part_didactic_microsequences(
      course_id,authoring_part_id,didactic_microsequence_id,production_position
    )
    select p_course_id,v_part_id,microsequence.value->>'microsequenceId',
      (microsequence.value->>'position')::integer
    from jsonb_array_elements(p_part->'microsequences') microsequence(value);
    delete from private.course_authoring_parts part
    where part.course_id=p_course_id and part.id<>v_part_id
      and not exists(
        select 1
        from private.course_authoring_part_didactic_microsequences membership
        where membership.course_id=part.course_id
          and membership.authoring_part_id=part.id
      );
    with ordered as materialized(
      select part.id,row_number() over(order by part.position,part.id)::integer-1
        as next_position
      from private.course_authoring_parts part
      where part.course_id=p_course_id
    )
    update private.course_authoring_parts part
    set position=ordered.next_position,version=part.version+1,updated_at=now()
    from ordered
    where part.id=ordered.id and part.position<>ordered.next_position;
    update private.course_instructional_plans plan
    set version=version+1,updated_at=now()
    where plan.id=v_plan.id returning * into v_plan;
    update public.courses course
    set revision=revision+1,updated_at=now()
    where course.id=p_course_id returning * into v_course;
  end if;

  v_result:=jsonb_build_object(
    'contract','aralearn.course-authoring-part-change.v1',
    'courseId',p_course_id,'courseRevision',v_course.revision,
    'planVersion',v_plan.version,'authoringPartId',v_part_id,
    'changed',v_changed,'idempotent',false
  );
  insert into private.course_change_receipts(
    actor_id,request_id,operation,course_id,request_hash,result
  ) values(
    p_actor_id,p_request_id,'save_course_authoring_part_v1',
    p_course_id,p_request_hash,v_result
  );
  return v_result;
end;
$function$;

revoke all on function public.save_course_authoring_part_for_actor_v1(
  uuid,uuid,bigint,bigint,jsonb,text,text
) from public,anon,authenticated,service_role;
grant execute on function public.save_course_authoring_part_for_actor_v1(
  uuid,uuid,bigint,bigint,jsonb,text,text
) to service_role;

create or replace function private.assert_course_materialization_pedagogy_v1(
  p_course_id uuid,
  p_units jsonb
)
returns void
language plpgsql
stable
set search_path=pg_catalog,private
as $function$
begin
  if jsonb_typeof(p_units)<>'array' or jsonb_array_length(p_units) not between 1 and 64
     or exists(
       select 1 from jsonb_array_elements(p_units) unit(value)
       cross join lateral jsonb_array_elements(
         unit.value#>'{designApplication,explanationApplications}'
       ) explanation(value)
       where jsonb_typeof(explanation.value)<>'object'
         or explanation.value ?& array[
           'instructionalAnalysisUnitId','developedForms','notApplicable'
         ] is not true
         or explanation.value-'instructionalAnalysisUnitId'-'developedForms'
           -'notApplicable'<>'{}'::jsonb
         or jsonb_typeof(explanation.value->'instructionalAnalysisUnitId')<>'string'
         or jsonb_typeof(explanation.value->'developedForms')<>'array'
         or jsonb_typeof(explanation.value->'notApplicable')<>'array'
         or exists(
           select 1 from jsonb_array_elements_text(
             explanation.value->'developedForms'
           ) form(value)
           where form.value not in(
             'plain_definition','concrete_example','mechanism','contrast',
             'application_condition','limit_or_exception','worked_example',
             'representation_link'
           )
         )
         or exists(
           select 1 from jsonb_array_elements(
             explanation.value->'notApplicable'
           ) excluded(value)
           where jsonb_typeof(excluded.value)<>'object'
             or excluded.value ?& array['form','reason'] is not true
             or excluded.value-'form'-'reason'<>'{}'::jsonb
             or excluded.value->>'form' not in(
               'plain_definition','concrete_example','mechanism','contrast',
               'application_condition','limit_or_exception','worked_example',
               'representation_link'
             )
             or nullif(btrim(excluded.value->>'reason'),'') is null
             or char_length(excluded.value->>'reason')>240
         )
     )
     or exists(
       select 1 from jsonb_array_elements(p_units) unit(value)
       cross join lateral jsonb_array_elements(
         unit.value#>'{designApplication,practiceApplications}'
       ) practice(value)
       where jsonb_typeof(practice.value)<>'object'
         or practice.value ?& array[
           'evidenceRequirementId','opportunityId',
           'invariantTaskOperation','variedDimensions'
         ] is not true
         or practice.value-'evidenceRequirementId'-'opportunityId'
           -'invariantTaskOperation'-'variedDimensions'<>'{}'::jsonb
         or jsonb_typeof(practice.value->'evidenceRequirementId')<>'string'
         or nullif(btrim(practice.value->>'opportunityId'),'') is null
         or char_length(practice.value->>'opportunityId')>240
         or nullif(btrim(practice.value->>'invariantTaskOperation'),'') is null
         or char_length(practice.value->>'invariantTaskOperation')>2000
         or jsonb_typeof(practice.value->'variedDimensions')<>'array'
         or exists(
           select 1 from jsonb_array_elements_text(
             practice.value->'variedDimensions'
           ) dimension(value)
           where dimension.value not in(
             'case_or_data','context','task_feature',
             'external_representation','support_level'
           )
         )
     ) then
    raise exception 'A aplicacao pedagogica possui forma invalida.'
      using errcode='22023';
  end if;

  if exists(
    select 1 from jsonb_array_elements(p_units) unit(value)
    where unit.value#>>'{designApplication,mode}'='practice' and (
        jsonb_array_length(unit.value#>'{designApplication,introducedInstructionalAnalysisUnitIds}')>0
        or jsonb_array_length(unit.value#>'{designApplication,explanationApplications}')>0
      )
      or unit.value#>>'{designApplication,mode}'='expository'
        and jsonb_array_length(unit.value#>'{designApplication,practiceApplications}')>0
      or unit.value#>>'{designApplication,mode}'='mixed' and (
        jsonb_array_length(unit.value#>'{designApplication,explanationApplications}')=0
        or jsonb_array_length(unit.value#>'{designApplication,practiceApplications}')=0
      )
  ) or exists(
    select 1 from jsonb_array_elements(p_units) unit(value)
    cross join lateral(
      select (parameter.value->>'value')::integer as ceiling
      from jsonb_array_elements(unit.value#>'{designSnapshot,parameters}') parameter(value)
      where parameter.value->>'parameterId'
        ='new_analysis_unit_ceiling_per_expository_study_unit'
    ) parameter
    where jsonb_array_length(
      unit.value#>'{designApplication,introducedInstructionalAnalysisUnitIds}'
    )>parameter.ceiling
  ) then
    raise exception 'Modo ou teto de novidade foi violado.' using errcode='23514';
  end if;

  if exists(
    select 1 from jsonb_array_elements(p_units) unit(value)
    cross join lateral jsonb_array_elements_text(
      unit.value#>'{designApplication,introducedInstructionalAnalysisUnitIds}'
    ) introduced(value)
    where not exists(
      select 1 from jsonb_array_elements(
        unit.value#>'{designApplication,explanationApplications}'
      ) explanation(value)
      where explanation.value->>'instructionalAnalysisUnitId'=introduced.value
    )
  ) or exists(
    select 1 from jsonb_array_elements(p_units) unit(value)
    cross join lateral jsonb_array_elements(
      unit.value#>'{designApplication,explanationApplications}'
    ) explanation(value)
    group by unit.value->>'studyUnitId',
      explanation.value->>'instructionalAnalysisUnitId'
    having count(*)>1
  ) or exists(
    select 1 from jsonb_array_elements(p_units) unit(value)
    cross join lateral jsonb_array_elements(
      unit.value#>'{designApplication,explanationApplications}'
    ) explanation(value)
    cross join lateral jsonb_array_elements_text(
      explanation.value->'developedForms'
    ) developed(value)
    join jsonb_array_elements(explanation.value->'notApplicable') excluded(value)
      on excluded.value->>'form'=developed.value
  ) then
    raise exception 'A introducao ou retomada explicativa e incoerente.'
      using errcode='23514';
  end if;

  -- Formas obrigatorias incidem sobre a introducao. Uma retomada pode ser
  -- proporcional a nova funcao da ideia, sem repetir toda a definicao.
  if exists(
    with introduced as materialized(
      select unit.value,
        introduced_id.value as analysis_id
      from jsonb_array_elements(p_units) unit(value)
      cross join lateral jsonb_array_elements_text(
        unit.value#>'{designApplication,introducedInstructionalAnalysisUnitIds}'
      ) introduced_id(value)
    ), required as materialized(
      select introduced.value,introduced.analysis_id,form.value as form
      from introduced
      cross join lateral jsonb_array_elements(
        introduced.value#>'{designSnapshot,parameters}'
      ) parameter(value)
      cross join lateral jsonb_array_elements_text(parameter.value->'value') form(value)
      where parameter.value->>'parameterId'='required_explanation_forms'
    )
    select 1 from required
    where not exists(
      select 1 from jsonb_array_elements(
        required.value#>'{designApplication,explanationApplications}'
      ) explanation(value)
      where explanation.value->>'instructionalAnalysisUnitId'=required.analysis_id
        and (explanation.value->'developedForms' ? required.form or exists(
          select 1 from jsonb_array_elements(
            explanation.value->'notApplicable'
          ) excluded(value) where excluded.value->>'form'=required.form
        ))
    )
  ) then
    raise exception 'Uma forma requerida para ideia nova nao foi tratada.'
      using errcode='23514';
  end if;

  if exists(
    with units as materialized(
      select unit.value,unit.value->>'didacticMicrosequenceId' as microsequence_id
      from jsonb_array_elements(p_units) unit(value)
    ), requirements as materialized(
      select distinct unit.microsequence_id,evidence.value as evidence_id
      from units unit cross join lateral jsonb_array_elements_text(
        unit.value#>'{designSnapshot,evidenceRequirementIds}'
      ) evidence(value)
    ), practices as materialized(
      select unit.microsequence_id,
        practice.value->>'evidenceRequirementId' as evidence_id,
        practice.value->>'opportunityId' as opportunity_id,
        practice.value->'variedDimensions' as dimensions,
        (minimum.value->>'value')::integer as minimum_count
      from units unit cross join lateral jsonb_array_elements(
        unit.value#>'{designApplication,practiceApplications}'
      ) practice(value)
      cross join lateral jsonb_array_elements(
        unit.value#>'{designSnapshot,parameters}'
      ) minimum(value)
      where minimum.value->>'parameterId'
        ='minimum_distinct_practice_opportunities_per_evidence_requirement'
    )
    select 1 from requirements requirement
    left join practices practice
      on practice.microsequence_id=requirement.microsequence_id
     and practice.evidence_id=requirement.evidence_id
    group by requirement.microsequence_id,requirement.evidence_id
    having count(distinct practice.opportunity_id)=0
      or count(distinct practice.opportunity_id)<max(practice.minimum_count)
  ) or exists(
    select 1 from jsonb_array_elements(p_units) unit(value)
    cross join lateral jsonb_array_elements(
      unit.value#>'{designApplication,practiceApplications}'
    ) practice(value)
    group by unit.value->>'didacticMicrosequenceId',
      practice.value->>'evidenceRequirementId',practice.value->>'opportunityId'
    having count(*)>1
  ) or exists(
    select 1 from jsonb_array_elements(p_units) unit(value)
    cross join lateral jsonb_array_elements(
      unit.value#>'{designApplication,practiceApplications}'
    ) practice(value)
    join private.course_instructional_plan_items requirement
      on requirement.course_id=p_course_id
     and requirement.item_kind='evidence_requirement'
     and requirement.id::text=practice.value->>'evidenceRequirementId'
    where practice.value->>'invariantTaskOperation'<>requirement.statement
  ) or exists(
    with practices as materialized(
      select unit.value->>'didacticMicrosequenceId' as microsequence_id,
        practice.value->>'evidenceRequirementId' as evidence_id,
        practice.value->'variedDimensions' as dimensions,
        unit.value->'designSnapshot' as snapshot
      from jsonb_array_elements(p_units) unit(value)
      cross join lateral jsonb_array_elements(
        unit.value#>'{designApplication,practiceApplications}'
      ) practice(value)
    ), required as materialized(
      select distinct practice.microsequence_id,practice.evidence_id,
        dimension.value as dimension
      from practices practice
      cross join lateral jsonb_array_elements(practice.snapshot->'parameters') parameter(value)
      cross join lateral jsonb_array_elements_text(parameter.value->'value') dimension(value)
      where parameter.value->>'parameterId'='required_practice_variation_dimensions'
    )
    select 1 from required requirement
    where not exists(
      select 1 from practices practice
      where practice.microsequence_id=requirement.microsequence_id
        and practice.evidence_id=requirement.evidence_id
        and practice.dimensions ? requirement.dimension
    )
  ) then
    raise exception 'A pratica nao cumpre a configuracao efetiva.'
      using errcode='23514';
  end if;

  if exists(
    select 1 from jsonb_array_elements(p_units) unit(value)
    cross join lateral jsonb_array_elements_text(
      unit.value#>'{designApplication,componentRefs}'
    ) component(value)
    where not private.course_component_policy_allows_v1(
      unit.value#>'{designSnapshot,componentPolicy,policy}',component.value
    )
  ) then
    raise exception 'Um componente viola a politica efetiva.' using errcode='23514';
  end if;
end;
$function$;

revoke all on function private.assert_course_materialization_pedagogy_v1(uuid,jsonb)
from public,anon,authenticated,service_role;

-- A implementacao anterior e reaproveitada como nucleo privado da composicao
-- atomica. Nao resta endpoint publico v1.
revoke all on function public.materialize_course_authoring_part_for_actor_v1(
  uuid,uuid,uuid,bigint,bigint,jsonb,text,text
) from public,anon,authenticated,service_role;
alter function public.materialize_course_authoring_part_for_actor_v1(
  uuid,uuid,uuid,bigint,bigint,jsonb,text,text
) set schema private;
alter function private.materialize_course_authoring_part_for_actor_v1(
  uuid,uuid,uuid,bigint,bigint,jsonb,text,text
) rename to materialize_course_authoring_part_core_v1;
do $expand_materialization_parameter_snapshot$
declare
  v_definition text;
  v_expected text:='jsonb_array_length(v_snapshot->''parameters'') <> 4';
  v_configuration_check text:=$configuration_check$
    if v_snapshot->'parameters' <> v_expected_parameters
       or v_snapshot->'editorialDirections' <> v_expected_directions
       or v_snapshot->'componentPolicy' <> v_expected_policy then
$configuration_check$;
  v_configuration_check_with_new_unit_calibration text:=$configuration_check$
    if (
      v_snapshot->'parameters' <> v_expected_parameters
      or v_snapshot->'editorialDirections' <> v_expected_directions
      or v_snapshot->'componentPolicy' <> v_expected_policy
    ) and (
      exists(
        select 1 from private.course_entities current_unit
        where current_unit.course_id=p_course_id
          and current_unit.entity_type='study_unit'
          and current_unit.entity_id=v_unit.value->>'studyUnitId'
      )
      or (
        select jsonb_agg(supplied.value->'parameterId' order by supplied.ordinal)
        from jsonb_array_elements(v_snapshot->'parameters')
          with ordinality supplied(value,ordinal)
      ) is distinct from (
        select jsonb_agg(expected.value->'parameterId' order by expected.ordinal)
        from jsonb_array_elements(v_expected_parameters)
          with ordinality expected(value,ordinal)
      )
      or exists(
        select 1
        from jsonb_array_elements(v_snapshot->'parameters') supplied(value)
        left join jsonb_array_elements(v_expected_parameters) expected(value)
          on expected.value->>'parameterId'=supplied.value->>'parameterId'
        where supplied.value->>'sourceScopeKind' is distinct from 'study_unit'
          and supplied.value is distinct from expected.value
      )
      or coalesce((
        select jsonb_agg(direction.value order by direction.ordinal)
        from jsonb_array_elements(v_snapshot->'editorialDirections')
          with ordinality direction(value,ordinal)
        where direction.value->>'sourceScopeKind' is distinct from 'study_unit'
      ),'[]'::jsonb) <> v_expected_directions
      or v_snapshot->'componentPolicy' <> v_expected_policy
    ) then
$configuration_check$;
begin
  v_definition:=replace(pg_get_functiondef(
    'private.materialize_course_authoring_part_core_v1(uuid,uuid,uuid,bigint,bigint,jsonb,text,text)'::regprocedure
  ),E'\r\n',E'\n');
  if strpos(v_definition,v_expected)=0 then
    raise exception 'O nucleo de materializacao nao possui a validacao esperada de quatro parametros.'
      using errcode='55000';
  end if;
  v_definition:=replace(
    v_definition,v_expected,
    'jsonb_array_length(v_snapshot->''parameters'') <> 6'
  );
  if strpos(v_definition,v_configuration_check)=0 then
    raise exception 'O nucleo de materializacao nao possui a verificacao esperada de configuracao.'
      using errcode='55000';
  end if;
  execute replace(
    v_definition,v_configuration_check,
    v_configuration_check_with_new_unit_calibration
  );
end;
$expand_materialization_parameter_snapshot$;
revoke all on function private.materialize_course_authoring_part_core_v1(
  uuid,uuid,uuid,bigint,bigint,jsonb,text,text
) from public,anon,authenticated,service_role;

create function public.materialize_course_authoring_part_for_actor_v2(
  p_actor_id uuid,
  p_course_id uuid,
  p_authoring_part_id uuid,
  p_expected_course_revision bigint,
  p_expected_authoring_part_version bigint,
  p_plan_item_upserts jsonb,
  p_target_plan_items jsonb,
  p_units jsonb,
  p_request_id text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,extensions
as $function$
declare
  v_receipt private.course_change_receipts%rowtype;
  v_course public.courses%rowtype;
  v_plan private.course_instructional_plans%rowtype;
  v_part private.course_authoring_parts%rowtype;
  v_before_items jsonb;
  v_after_items jsonb;
  v_before_targets jsonb;
  v_after_targets jsonb;
  v_core_units jsonb;
  v_result jsonb;
  v_new_study_unit_ids text[]:=array[]::text[];
  v_plan_changed boolean:=false;
  v_application_extension_changed boolean:=false;
  v_extra_changed boolean:=false;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_actor_id is null or p_course_id is null or p_authoring_part_id is null
     or p_expected_course_revision is null or p_expected_course_revision<1
     or p_expected_authoring_part_version is null
     or p_expected_authoring_part_version<1
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_plan_item_upserts)<>'array'
     or jsonb_array_length(p_plan_item_upserts)>256
     or jsonb_typeof(p_target_plan_items)<>'array'
     or jsonb_array_length(p_target_plan_items) not between 1 and 32
     or jsonb_typeof(p_units)<>'array'
     or jsonb_array_length(p_units) not between 1 and 64
     or octet_length(p_plan_item_upserts::text)>524288
     or octet_length(p_target_plan_items::text)>524288
     or octet_length(p_units::text)>1572864 then
    raise exception 'Materializacao do lote invalida.' using errcode='22023';
  end if;
  if exists(
    select 1 from jsonb_array_elements(p_plan_item_upserts) item(value)
    where jsonb_typeof(item.value)<>'object'
      or item.value ?& array['id','kind','position','statement','description'] is not true
      or item.value-'id'-'kind'-'position'-'statement'-'description'<>'{}'::jsonb
      or jsonb_typeof(item.value->'id')<>'string'
      or (item.value->>'id') !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or item.value->>'kind' not in(
        'instructional_analysis_unit','evidence_requirement'
      )
      or jsonb_typeof(item.value->'position')<>'number'
      or (item.value->>'position') !~ '^(0|[1-9][0-9]{0,8})$'
      or nullif(btrim(item.value->>'statement'),'') is null
      or item.value->>'statement'<>btrim(item.value->>'statement')
      or char_length(item.value->>'statement')>2000
      or translate(item.value->>'statement',E'\n\r\t','') ~ '[[:cntrl:]]'
      or jsonb_typeof(item.value->'description')<>'string'
      or char_length(item.value->>'description')>4000
      or translate(item.value->>'description',E'\n\r\t','') ~ '[[:cntrl:]]'
  ) or (
    select count(*)<>count(distinct item.value->>'id')
    from jsonb_array_elements(p_plan_item_upserts) item(value)
  ) or exists(
    select 1 from jsonb_array_elements(p_target_plan_items) target(value)
    where jsonb_typeof(target.value)<>'object'
      or target.value ?& array[
        'didacticMicrosequenceId','instructionalAnalysisUnitIds',
        'evidenceRequirementIds'
      ] is not true
      or target.value-'didacticMicrosequenceId'-'instructionalAnalysisUnitIds'
        -'evidenceRequirementIds'<>'{}'::jsonb
      or jsonb_typeof(target.value->'didacticMicrosequenceId')<>'string'
      or nullif(btrim(target.value->>'didacticMicrosequenceId'),'') is null
      or target.value->>'didacticMicrosequenceId'
        <>btrim(target.value->>'didacticMicrosequenceId')
      or char_length(target.value->>'didacticMicrosequenceId')>240
      or jsonb_typeof(target.value->'instructionalAnalysisUnitIds')<>'array'
      or jsonb_array_length(target.value->'instructionalAnalysisUnitIds')>64
      or jsonb_typeof(target.value->'evidenceRequirementIds')<>'array'
      or jsonb_array_length(target.value->'evidenceRequirementIds')>64
      or exists(
        select 1 from (
          select id.value from jsonb_array_elements(
            target.value->'instructionalAnalysisUnitIds'
          ) id(value)
          union all
          select id.value from jsonb_array_elements(
            target.value->'evidenceRequirementIds'
          ) id(value)
        ) identifier
        where jsonb_typeof(identifier.value)<>'string'
          or (identifier.value#>>'{}') !~
            '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
      or (
        select count(*)<>count(distinct id.value#>>'{}')
        from jsonb_array_elements(
          target.value->'instructionalAnalysisUnitIds'
        ) id(value)
      )
      or (
        select count(*)<>count(distinct id.value#>>'{}')
        from jsonb_array_elements(
          target.value->'evidenceRequirementIds'
        ) id(value)
      )
  ) or (
    select count(*)<>count(distinct target.value->>'didacticMicrosequenceId')
    from jsonb_array_elements(p_target_plan_items) target(value)
  ) or exists(
    select 1 from jsonb_array_elements(p_units) unit(value)
    where jsonb_typeof(unit.value)<>'object'
      or jsonb_typeof(unit.value->'designApplication')<>'object'
      or unit.value->'designApplication' ?& array[
        'mode','introducedInstructionalAnalysisUnitIds',
        'usedInstructionalAnalysisUnitIds','curriculumScopeItemIds',
        'explanationApplications','practiceApplications','componentRefs'
      ] is not true
      or (unit.value->'designApplication')-'mode'
        -'introducedInstructionalAnalysisUnitIds'
        -'usedInstructionalAnalysisUnitIds'-'curriculumScopeItemIds'
        -'explanationApplications'-'practiceApplications'-'componentRefs'
          <>'{}'::jsonb
      or jsonb_typeof(unit.value#>'{designApplication,introducedInstructionalAnalysisUnitIds}')<>'array'
      or jsonb_typeof(unit.value#>'{designApplication,usedInstructionalAnalysisUnitIds}')<>'array'
      or jsonb_typeof(unit.value#>'{designApplication,curriculumScopeItemIds}')<>'array'
      or jsonb_typeof(unit.value#>'{designApplication,explanationApplications}')<>'array'
      or jsonb_typeof(unit.value#>'{designApplication,practiceApplications}')<>'array'
      or jsonb_typeof(unit.value#>'{designApplication,componentRefs}')<>'array'
      or exists(
        select 1 from jsonb_array_elements(
          unit.value#>'{designApplication,usedInstructionalAnalysisUnitIds}'
        ) used(value)
        where jsonb_typeof(used.value)<>'string'
          or (used.value#>>'{}') !~
            '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
      or (
        select count(*)<>count(distinct used.value#>>'{}')
        from jsonb_array_elements(
          unit.value#>'{designApplication,usedInstructionalAnalysisUnitIds}'
        ) used(value)
      )
      or exists(
        select 1 from jsonb_array_elements(
          unit.value#>'{designApplication,curriculumScopeItemIds}'
        ) scope_item(value)
        where jsonb_typeof(scope_item.value)<>'string'
          or (scope_item.value#>>'{}') !~
            '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
      or (
        select count(*)<>count(distinct scope_item.value#>>'{}')
        from jsonb_array_elements(
          unit.value#>'{designApplication,curriculumScopeItemIds}'
        ) scope_item(value)
      )
      or exists(
        select 1 from jsonb_array_elements_text(
          unit.value#>'{designApplication,usedInstructionalAnalysisUnitIds}'
        ) used(value)
        where not coalesce(
          unit.value#>'{designSnapshot,instructionalAnalysisUnitIds}' ? used.value,
          false
        )
          or unit.value#>'{designApplication,introducedInstructionalAnalysisUnitIds}'
            ? used.value
          or exists(
            select 1 from jsonb_array_elements(
              unit.value#>'{designApplication,explanationApplications}'
            ) explanation(value)
            where explanation.value->>'instructionalAnalysisUnitId'=used.value
          )
      )
  ) then
    raise exception 'Repertorio ou aplicacao pedagogica invalida.' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:'||p_actor_id::text||':'||p_request_id,0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id=p_actor_id and receipt.request_id=p_request_id
    and receipt.expires_at<=statement_timestamp();
  select * into v_receipt from private.course_change_receipts receipt
  where receipt.actor_id=p_actor_id and receipt.request_id=p_request_id;
  if found then
    if v_receipt.operation<>'materialize_course_authoring_part_v2'
       or v_receipt.course_id<>p_course_id
       or v_receipt.request_hash<>p_request_hash then
      raise exception 'requestId reutilizado com materializacao incompatível.'
        using errcode='23514';
    end if;
    return (v_receipt.result-'idempotent')||jsonb_build_object('idempotent',true);
  end if;

  perform 1 from auth.users actor where actor.id=p_actor_id for key share;
  if not found then
    raise exception 'Pessoa inexistente ou inacessivel.' using errcode='PT404';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('course-row:'||p_course_id::text,0));
  select * into strict v_course from public.courses course
  where course.id=p_course_id for update;
  if v_course.revision<>p_expected_course_revision then
    raise exception 'O curso mudou; releia antes de materializar o lote.'
      using errcode='40001';
  end if;
  select * into strict v_plan from private.course_instructional_plans plan
  where plan.course_id=p_course_id for update;
  if v_plan.curriculum_map_status<>'approved' then
    raise exception 'O mapa curricular precisa estar aprovado antes da materializacao.'
      using errcode='23514';
  end if;
  select * into v_part from private.course_authoring_parts part
  where part.course_id=p_course_id and part.id=p_authoring_part_id for update;
  if not found then
    raise exception 'Lote inexistente.' using errcode='PT404';
  end if;
  if v_part.version<>p_expected_authoring_part_version then
    raise exception 'O lote mudou; releia antes de materializa-lo.'
      using errcode='40001';
  end if;
  if exists(
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
  end if;
  select coalesce(array_agg(unit.value->>'studyUnitId'),array[]::text[])
    into v_new_study_unit_ids
  from jsonb_array_elements(p_units) unit(value)
  where jsonb_typeof(unit.value)='object'
    and jsonb_typeof(unit.value->'studyUnitId')='string'
    and not exists(
      select 1 from private.course_entities current_unit
      where current_unit.course_id=p_course_id
        and current_unit.entity_type='study_unit'
        and current_unit.entity_id=unit.value->>'studyUnitId'
    );
  if exists(
    select 1
    from jsonb_array_elements(p_units) unit(value)
    cross join lateral jsonb_array_elements(case
      when jsonb_typeof(unit.value#>'{designSnapshot,parameters}')='array'
        then unit.value#>'{designSnapshot,parameters}'
      else '[]'::jsonb end
    ) parameter(value)
    where unit.value->>'studyUnitId'=any(v_new_study_unit_ids)
      and parameter.value->>'sourceScopeKind'='study_unit'
      and (
        jsonb_typeof(parameter.value)<>'object'
        or parameter.value ?& array[
          'parameterId','value','origin','sourceScopeKind'
        ] is not true
        or parameter.value-'parameterId'-'value'-'origin'-'sourceScopeKind'
          <>'{}'::jsonb
        or parameter.value->>'origin'<>'automatic'
        or not private.valid_course_design_parameter_value_v1(
          parameter.value->>'parameterId',parameter.value->'value'
        )
      )
  ) or exists(
    select 1
    from jsonb_array_elements(p_units) unit(value)
    cross join lateral jsonb_array_elements(case
      when jsonb_typeof(unit.value#>'{designSnapshot,editorialDirections}')='array'
        then unit.value#>'{designSnapshot,editorialDirections}'
      else '[]'::jsonb end
    ) direction(value)
    where unit.value->>'studyUnitId'=any(v_new_study_unit_ids)
      and direction.value->>'sourceScopeKind'='study_unit'
      and (
        jsonb_typeof(direction.value)<>'object'
        or direction.value ?& array[
          'direction','origin','sourceScopeKind'
        ] is not true
        or direction.value-'direction'-'origin'-'sourceScopeKind'<>'{}'::jsonb
        or direction.value->>'origin'<>'automatic'
        or nullif(btrim(direction.value->>'direction'),'') is null
        or octet_length(direction.value->>'direction')>8192
        or translate(direction.value->>'direction',E'\n\r\t','')~'[[:cntrl:]]'
      )
  ) or exists(
    select 1
    from jsonb_array_elements(p_units) unit(value)
    cross join lateral jsonb_array_elements(case
      when jsonb_typeof(unit.value#>'{designSnapshot,parameters}')='array'
        then unit.value#>'{designSnapshot,parameters}'
      else '[]'::jsonb end
    ) parameter(value)
    where unit.value->>'studyUnitId'=any(v_new_study_unit_ids)
      and parameter.value->>'sourceScopeKind'='study_unit'
    group by unit.value->>'studyUnitId',parameter.value->>'parameterId'
    having count(*)>1
  ) or exists(
    select 1
    from jsonb_array_elements(p_units) unit(value)
    cross join lateral jsonb_array_elements(case
      when jsonb_typeof(unit.value#>'{designSnapshot,editorialDirections}')='array'
        then unit.value#>'{designSnapshot,editorialDirections}'
      else '[]'::jsonb end
    ) direction(value)
    where unit.value->>'studyUnitId'=any(v_new_study_unit_ids)
      and direction.value->>'sourceScopeKind'='study_unit'
    group by unit.value->>'studyUnitId'
    having count(*)>1
  ) then
    raise exception 'Calibracao automatica da unidade invalida.' using errcode='22023';
  end if;
  if exists(
    select 1
    from jsonb_array_elements(p_units) unit(value)
    cross join lateral jsonb_array_elements(case
      when jsonb_typeof(unit.value#>'{designSnapshot,parameters}')='array'
        then unit.value#>'{designSnapshot,parameters}'
      else '[]'::jsonb end
    ) parameter(value)
    join private.course_design_parameter_assignments assignment
      on assignment.course_id=p_course_id
     and assignment.parameter_id=parameter.value->>'parameterId'
     and assignment.scope_kind='study_unit'
     and assignment.scope_ref=unit.value->>'studyUnitId'
     and assignment.origin in('author','research_condition')
    where unit.value->>'studyUnitId'=any(v_new_study_unit_ids)
      and parameter.value->>'sourceScopeKind'='study_unit'
  ) or exists(
    select 1
    from jsonb_array_elements(p_units) unit(value)
    cross join lateral jsonb_array_elements(case
      when jsonb_typeof(unit.value#>'{designSnapshot,editorialDirections}')='array'
        then unit.value#>'{designSnapshot,editorialDirections}'
      else '[]'::jsonb end
    ) direction(value)
    join private.course_authoring_guidance_assignments assignment
      on assignment.course_id=p_course_id
     and assignment.scope_kind='study_unit'
     and assignment.scope_ref=unit.value->>'studyUnitId'
     and assignment.origin in('author','research_condition')
    where unit.value->>'studyUnitId'=any(v_new_study_unit_ids)
      and direction.value->>'sourceScopeKind'='study_unit'
  ) then
    raise exception 'Calibracao automatica da unidade conflita com decisao fixada.'
      using errcode='23514';
  end if;
  if exists(
    select 1
    from private.course_authoring_part_didactic_microsequences membership
    join private.course_entities microsequence
      on microsequence.course_id=membership.course_id
     and microsequence.entity_type='microsequence'
     and microsequence.entity_id=membership.didactic_microsequence_id
    cross join lateral jsonb_array_elements_text(coalesce(
      microsequence.content->'dependsOn','[]'::jsonb
    )) dependency(value)
    where membership.course_id=p_course_id
      and membership.authoring_part_id=p_authoring_part_id
      and not exists(
        select 1 from private.course_entities prerequisite_unit
        where prerequisite_unit.course_id=p_course_id
          and prerequisite_unit.entity_type='study_unit'
          and prerequisite_unit.parent_id=dependency.value
      )
      and not exists(
        select 1 from jsonb_array_elements(p_target_plan_items) target(value)
        where target.value->>'didacticMicrosequenceId'=dependency.value
      )
  ) then
    raise exception 'Uma dependencia curricular precisa estar produzida ou integrar o mesmo lote.'
      using errcode='23514';
  end if;
  if exists(
    select 1
    from jsonb_array_elements(p_units) unit(value)
    cross join lateral jsonb_array_elements_text(
      unit.value#>'{designApplication,curriculumScopeItemIds}'
    ) scope_item(value)
    left join private.course_design_target_plan_items assignment
      on assignment.course_id=p_course_id
     and assignment.didactic_microsequence_id
       =unit.value->>'didacticMicrosequenceId'
     and assignment.plan_item_kind='curriculum_scope_item'
     and assignment.plan_item_id=scope_item.value::uuid
    where assignment.plan_item_id is null
  ) then
    raise exception 'A cobertura declarada precisa pertencer ao escopo da Microssequencia.'
      using errcode='23514';
  end if;
  if exists(
    select 1
    from private.course_authoring_part_didactic_microsequences membership
    join private.course_design_target_plan_items assignment
      on assignment.course_id=membership.course_id
     and assignment.didactic_microsequence_id=membership.didactic_microsequence_id
     and assignment.plan_item_kind='curriculum_scope_item'
    where membership.course_id=p_course_id
      and membership.authoring_part_id=p_authoring_part_id
      and not exists(
        select 1 from jsonb_array_elements(p_units) unit(value)
        where unit.value->>'didacticMicrosequenceId'
            =membership.didactic_microsequence_id
          and unit.value#>'{designApplication,curriculumScopeItemIds}'
            ? assignment.plan_item_id::text
      )
  ) then
    raise exception 'Todo item de escopo atribuido precisa ser desenvolvido na Microssequencia.'
      using errcode='23514';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',item.id,'kind',item.item_kind,'position',item.position,
    'statement',item.statement,'description',item.description
  ) order by item.item_kind,item.position,item.id),'[]'::jsonb)
  into v_before_items
  from private.course_instructional_plan_items item
  where item.course_id=p_course_id
    and item.item_kind in('instructional_analysis_unit','evidence_requirement');
  select coalesce(jsonb_agg(jsonb_build_object(
    'microsequenceId',assignment.didactic_microsequence_id,
    'id',assignment.plan_item_id,'kind',assignment.plan_item_kind
  ) order by assignment.didactic_microsequence_id,
    assignment.plan_item_kind,assignment.plan_item_id),'[]'::jsonb)
  into v_before_targets
  from private.course_design_target_plan_items assignment
  where assignment.course_id=p_course_id
    and assignment.plan_item_kind in(
      'instructional_analysis_unit','evidence_requirement'
    ) and exists(
      select 1 from jsonb_array_elements(p_target_plan_items) target(value)
      where target.value->>'didacticMicrosequenceId'
        =assignment.didactic_microsequence_id
    );

  if exists(
    select 1 from jsonb_array_elements(p_plan_item_upserts) supplied(value)
    join private.course_instructional_plan_items existing
      on existing.id=(supplied.value->>'id')::uuid
    where existing.course_id<>p_course_id
      or existing.instructional_plan_id<>v_plan.id
      or existing.item_kind<>supplied.value->>'kind'
  ) then
    raise exception 'Uma ideia ou criterio pertence a outro planejamento.'
      using errcode='23514';
  end if;
  insert into private.course_instructional_plan_items(
    id,course_id,instructional_plan_id,item_kind,position,statement,description
  )
  select (item.value->>'id')::uuid,p_course_id,v_plan.id,item.value->>'kind',
    (item.value->>'position')::integer,item.value->>'statement',
    item.value->>'description'
  from jsonb_array_elements(p_plan_item_upserts) item(value)
  on conflict(id) do update set
    position=excluded.position,statement=excluded.statement,
    description=excluded.description,
    version=course_instructional_plan_items.version+1,updated_at=now()
  where row(course_instructional_plan_items.position,
    course_instructional_plan_items.statement,
    course_instructional_plan_items.description) is distinct from row(
    excluded.position,excluded.statement,excluded.description
  );

  if exists(
    select 1 from jsonb_array_elements(p_target_plan_items) target(value)
    cross join lateral(
      select id.value as item_id,'instructional_analysis_unit'::text as kind
      from jsonb_array_elements_text(
        target.value->'instructionalAnalysisUnitIds'
      ) id(value)
      union all
      select id.value,'evidence_requirement'
      from jsonb_array_elements_text(target.value->'evidenceRequirementIds') id(value)
    ) requested
    left join private.course_instructional_plan_items item
      on item.course_id=p_course_id and item.id=requested.item_id::uuid
     and item.item_kind=requested.kind
    where item.id is null
  ) then
    raise exception 'O recorte referencia ideia ou criterio inexistente.'
      using errcode='23514';
  end if;
  delete from private.course_design_target_plan_items assignment
  where assignment.course_id=p_course_id
    and assignment.plan_item_kind in(
      'instructional_analysis_unit','evidence_requirement'
    ) and exists(
      select 1 from jsonb_array_elements(p_target_plan_items) target(value)
      where target.value->>'didacticMicrosequenceId'
        =assignment.didactic_microsequence_id
    );
  insert into private.course_design_target_plan_items(
    course_id,didactic_microsequence_id,plan_item_id,plan_item_kind
  )
  select p_course_id,target.value->>'didacticMicrosequenceId',
    requested.item_id::uuid,requested.kind
  from jsonb_array_elements(p_target_plan_items) target(value)
  cross join lateral(
    select id.value as item_id,'instructional_analysis_unit'::text as kind
    from jsonb_array_elements_text(
      target.value->'instructionalAnalysisUnitIds'
    ) id(value)
    union all
    select id.value,'evidence_requirement'
    from jsonb_array_elements_text(target.value->'evidenceRequirementIds') id(value)
  ) requested;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',item.id,'kind',item.item_kind,'position',item.position,
    'statement',item.statement,'description',item.description
  ) order by item.item_kind,item.position,item.id),'[]'::jsonb)
  into v_after_items
  from private.course_instructional_plan_items item
  where item.course_id=p_course_id
    and item.item_kind in('instructional_analysis_unit','evidence_requirement');
  select coalesce(jsonb_agg(jsonb_build_object(
    'microsequenceId',assignment.didactic_microsequence_id,
    'id',assignment.plan_item_id,'kind',assignment.plan_item_kind
  ) order by assignment.didactic_microsequence_id,
    assignment.plan_item_kind,assignment.plan_item_id),'[]'::jsonb)
  into v_after_targets
  from private.course_design_target_plan_items assignment
  where assignment.course_id=p_course_id
    and assignment.plan_item_kind in(
      'instructional_analysis_unit','evidence_requirement'
    ) and exists(
      select 1 from jsonb_array_elements(p_target_plan_items) target(value)
      where target.value->>'didacticMicrosequenceId'
        =assignment.didactic_microsequence_id
    );
  v_plan_changed:=v_before_items is distinct from v_after_items
    or v_before_targets is distinct from v_after_targets;

  -- Valide o repertorio no estado final inteiro, e nao apenas no lote
  -- recebido. Assim uma rematerializacao anterior nao pode apagar ou mover a
  -- unica introducao ainda utilizada ou retomada por unidades posteriores.
  if exists(
    with incoming_units as materialized(
      select unit.value->>'studyUnitId' as study_unit_id,
        unit.value->'designApplication' as application,
        module_value.position as module_position,
        lesson.position as lesson_position,microsequence.position as micro_position,
        (unit.value->>'position')::integer as unit_position
      from jsonb_array_elements(p_units) unit(value)
      join private.course_authoring_part_didactic_microsequences membership
        on membership.course_id=p_course_id
       and membership.authoring_part_id=p_authoring_part_id
       and membership.didactic_microsequence_id
         =unit.value->>'didacticMicrosequenceId'
      join private.course_entities microsequence
        on microsequence.course_id=membership.course_id
       and microsequence.entity_type='microsequence'
       and microsequence.entity_id=membership.didactic_microsequence_id
      join private.course_entities lesson
        on lesson.course_id=microsequence.course_id
       and lesson.entity_type='lesson' and lesson.entity_id=microsequence.parent_id
      join private.course_entities module_value
        on module_value.course_id=lesson.course_id
       and module_value.entity_type='module' and module_value.entity_id=lesson.parent_id
    ), preserved_units as materialized(
      select unit.entity_id as study_unit_id,unit.design_application as application,
        module_value.position as module_position,
        lesson.position as lesson_position,microsequence.position as micro_position,
        unit.position as unit_position
      from private.course_entities unit
      join private.course_entities microsequence
        on microsequence.course_id=unit.course_id
       and microsequence.entity_type='microsequence'
       and microsequence.entity_id=unit.parent_id
      join private.course_entities lesson
        on lesson.course_id=microsequence.course_id
       and lesson.entity_type='lesson' and lesson.entity_id=microsequence.parent_id
      join private.course_entities module_value
        on module_value.course_id=lesson.course_id
       and module_value.entity_type='module' and module_value.entity_id=lesson.parent_id
      where unit.course_id=p_course_id and unit.entity_type='study_unit'
        and unit.design_application is not null
        and not exists(
          select 1 from incoming_units incoming
          where incoming.study_unit_id=unit.entity_id
        )
    ), final_units as materialized(
      select * from incoming_units
      union all
      select * from preserved_units
    ), introductions as materialized(
      select introduced.value as analysis_id,unit.module_position,
        unit.lesson_position,unit.micro_position,unit.unit_position
      from final_units unit
      cross join lateral jsonb_array_elements_text(coalesce(
        unit.application->'introducedInstructionalAnalysisUnitIds','[]'::jsonb
      )) introduced(value)
    ), idea_references as materialized(
      select used.value as analysis_id,unit.module_position,
        unit.lesson_position,unit.micro_position,unit.unit_position
      from final_units unit
      cross join lateral jsonb_array_elements_text(coalesce(
        unit.application->'usedInstructionalAnalysisUnitIds','[]'::jsonb
      )) used(value)
      union all
      select explanation.value->>'instructionalAnalysisUnitId',unit.module_position,
        unit.lesson_position,unit.micro_position,unit.unit_position
      from final_units unit
      cross join lateral jsonb_array_elements(coalesce(
        unit.application->'explanationApplications','[]'::jsonb
      )) explanation(value)
      where not (coalesce(
        unit.application->'introducedInstructionalAnalysisUnitIds','[]'::jsonb
      ) ? (explanation.value->>'instructionalAnalysisUnitId'))
    )
    select 1 from introductions introduction
    group by introduction.analysis_id
    having count(*)>1
    union all
    select 1 from idea_references reference
    where not exists(
      select 1 from introductions established
      where established.analysis_id=reference.analysis_id
        and row(established.module_position,established.lesson_position,
          established.micro_position,established.unit_position)
          <row(reference.module_position,reference.lesson_position,
          reference.micro_position,reference.unit_position)
    )
  ) then
    raise exception 'Uma ideia foi usada antes de ser ensinada ou introduzida novamente.'
      using errcode='23514';
  end if;

  select exists(
    select 1 from jsonb_array_elements(p_units) incoming(value)
    join private.course_entities current
      on current.course_id=p_course_id and current.entity_type='study_unit'
     and current.entity_id=incoming.value->>'studyUnitId'
    where coalesce(
      current.design_application->'usedInstructionalAnalysisUnitIds','[]'::jsonb
    ) is distinct from incoming.value#>'{designApplication,usedInstructionalAnalysisUnitIds}'
      or coalesce(
        current.design_application->'curriculumScopeItemIds','[]'::jsonb
      ) is distinct from incoming.value#>'{designApplication,curriculumScopeItemIds}'
  ) into v_application_extension_changed;

  -- O nucleo valida e grava o restante do recorte. A classificacao explicita
  -- de uso e cobertura e restaurada ainda na mesma transacao.
  select coalesce(jsonb_agg(
    jsonb_set(unit.value,'{designApplication}',
      (unit.value->'designApplication')-'usedInstructionalAnalysisUnitIds'
        -'curriculumScopeItemIds',true)
    order by unit.ordinal
  ),'[]'::jsonb) into v_core_units
  from jsonb_array_elements(p_units) with ordinality unit(value,ordinal);
  update private.course_entities current
  set design_application=current.design_application
    -'usedInstructionalAnalysisUnitIds'-'curriculumScopeItemIds'
  from jsonb_array_elements(p_units) incoming(value)
  where current.course_id=p_course_id and current.entity_type='study_unit'
    and current.entity_id=incoming.value->>'studyUnitId'
    and current.design_application is not null;

  v_result:=private.materialize_course_authoring_part_core_v1(
    p_actor_id,p_course_id,p_authoring_part_id,p_expected_course_revision,
    p_expected_authoring_part_version,v_core_units,p_request_id,p_request_hash
  );
  insert into private.course_design_parameter_assignments(
    course_id,parameter_id,scope_kind,scope_ref,value,origin,reason
  )
  select p_course_id,parameter.value->>'parameterId','study_unit',
    unit.value->>'studyUnitId',parameter.value->'value','automatic',
    'Valor calibrado automaticamente para esta unidade de estudo.'
  from jsonb_array_elements(p_units) unit(value)
  cross join lateral jsonb_array_elements(
    unit.value#>'{designSnapshot,parameters}'
  ) parameter(value)
  where unit.value->>'studyUnitId'=any(v_new_study_unit_ids)
    and parameter.value->>'sourceScopeKind'='study_unit'
  on conflict(course_id,parameter_id,scope_kind,scope_ref) do update set
    value=excluded.value,origin=excluded.origin,reason=excluded.reason,
    updated_at=now()
  where course_design_parameter_assignments.origin
      not in('author','research_condition')
    and row(course_design_parameter_assignments.value,
      course_design_parameter_assignments.origin,
      course_design_parameter_assignments.reason)
      is distinct from row(excluded.value,excluded.origin,excluded.reason);
  insert into private.course_authoring_guidance_assignments(
    course_id,scope_kind,scope_ref,guidance,origin,reason
  )
  select p_course_id,'study_unit',unit.value->>'studyUnitId',
    direction.value->>'direction','automatic',
    'Direcao editorial calibrada automaticamente para esta unidade de estudo.'
  from jsonb_array_elements(p_units) unit(value)
  cross join lateral jsonb_array_elements(
    unit.value#>'{designSnapshot,editorialDirections}'
  ) direction(value)
  where unit.value->>'studyUnitId'=any(v_new_study_unit_ids)
    and direction.value->>'sourceScopeKind'='study_unit'
  on conflict(course_id,scope_kind,scope_ref) do update set
    guidance=excluded.guidance,origin=excluded.origin,reason=excluded.reason,
    updated_at=now()
  where course_authoring_guidance_assignments.origin
      not in('author','research_condition')
    and row(course_authoring_guidance_assignments.guidance,
      course_authoring_guidance_assignments.origin,
      course_authoring_guidance_assignments.reason)
      is distinct from row(excluded.guidance,excluded.origin,excluded.reason);
  update private.course_entities current
  set design_application=jsonb_set(
    jsonb_set(
      current.design_application,'{usedInstructionalAnalysisUnitIds}',
      incoming.value#>'{designApplication,usedInstructionalAnalysisUnitIds}',true
    ),'{curriculumScopeItemIds}',
    incoming.value#>'{designApplication,curriculumScopeItemIds}',true
  )
  from jsonb_array_elements(p_units) incoming(value)
  where current.course_id=p_course_id and current.entity_type='study_unit'
    and current.entity_id=incoming.value->>'studyUnitId';

  if v_plan_changed then
    update private.course_instructional_plans plan
    set version=version+1,updated_at=now()
    where plan.id=v_plan.id;
  end if;
  v_extra_changed:=v_plan_changed or v_application_extension_changed;
  if v_extra_changed and not (v_result->>'changed')::boolean then
    update public.courses course
    set revision=revision+1,updated_at=now()
    where course.id=p_course_id returning * into v_course;
    v_result:=jsonb_set(v_result,'{changed}','true'::jsonb,true);
    v_result:=jsonb_set(v_result,'{courseRevision}',to_jsonb(v_course.revision),true);
  end if;
  update private.course_change_receipts receipt
  set operation='materialize_course_authoring_part_v2',
    request_hash=p_request_hash,result=v_result
  where receipt.actor_id=p_actor_id and receipt.request_id=p_request_id
    and receipt.course_id=p_course_id;
  if not found then
    raise exception 'A materializacao nao produziu confirmacao atomica.'
      using errcode='55000';
  end if;
  return v_result;
end;
$function$;

revoke all on function public.materialize_course_authoring_part_for_actor_v2(
  uuid,uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text
) from public,anon,authenticated,service_role;
grant execute on function public.materialize_course_authoring_part_for_actor_v2(
  uuid,uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text
) to service_role;

create function private.get_course_instructional_plan_for_actor_v3(
  p_actor_id uuid,
  p_course_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private
as $function$
declare
  v_course public.courses%rowtype;
  v_plan private.course_instructional_plans%rowtype;
  v_prerequisites jsonb;
  v_outcomes jsonb;
  v_analysis_units jsonb;
  v_evidence_requirements jsonb;
  v_curriculum jsonb;
  v_scope_items jsonb;
  v_parts jsonb;
  v_counts jsonb;
  v_result jsonb;
begin
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  select * into strict v_course from public.courses course
  where course.id=p_course_id;
  select * into strict v_plan from private.course_instructional_plans plan
  where plan.course_id=p_course_id;

  select coalesce(jsonb_agg(to_jsonb(item.statement)
    order by item.position,item.id),'[]'::jsonb)
  into v_prerequisites
  from private.course_instructional_plan_items item
  where item.instructional_plan_id=v_plan.id
    and item.item_kind='declared_prerequisite';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',item.id,'position',item.position,'statement',item.statement,
    'version',item.version
  ) order by item.position,item.id),'[]'::jsonb)
  into v_outcomes
  from private.course_instructional_plan_items item
  where item.instructional_plan_id=v_plan.id
    and item.item_kind='intended_learning_outcome';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',item.id,'position',item.position,'statement',item.statement,
    'description',item.description,'version',item.version,
    'introducedAt',(
      select jsonb_build_object(
        'studyUnitId',unit.entity_id,
        'didacticMicrosequenceId',microsequence.entity_id,
        'title',unit.content->>'title'
      )
      from private.course_entities unit
      join private.course_entities microsequence
        on microsequence.course_id=unit.course_id
       and microsequence.entity_type='microsequence'
       and microsequence.entity_id=unit.parent_id
      join private.course_entities lesson
        on lesson.course_id=microsequence.course_id
       and lesson.entity_type='lesson' and lesson.entity_id=microsequence.parent_id
      join private.course_entities module_value
        on module_value.course_id=lesson.course_id
       and module_value.entity_type='module' and module_value.entity_id=lesson.parent_id
      where unit.course_id=p_course_id and unit.entity_type='study_unit'
        and coalesce(
          unit.design_application->'introducedInstructionalAnalysisUnitIds','[]'::jsonb
        ) ? item.id::text
      order by module_value.position,lesson.position,microsequence.position,
        unit.position,unit.entity_id limit 1
    ),
    'usedBy',coalesce((
      select jsonb_agg(jsonb_build_object(
        'studyUnitId',used.entity_id,
        'didacticMicrosequenceId',used.parent_id,
        'title',used.content->>'title'
      ) order by used.module_position,used.lesson_position,
        used.microsequence_position,used.position,used.entity_id)
      from (
        select unit.*,module_value.position as module_position,
          lesson.position as lesson_position,
          microsequence.position as microsequence_position
        from private.course_entities unit
        join private.course_entities microsequence
          on microsequence.course_id=unit.course_id
         and microsequence.entity_type='microsequence'
         and microsequence.entity_id=unit.parent_id
        join private.course_entities lesson
          on lesson.course_id=microsequence.course_id
         and lesson.entity_type='lesson' and lesson.entity_id=microsequence.parent_id
        join private.course_entities module_value
          on module_value.course_id=lesson.course_id
         and module_value.entity_type='module' and module_value.entity_id=lesson.parent_id
        where unit.course_id=p_course_id and unit.entity_type='study_unit'
          and coalesce(
            unit.design_application->'usedInstructionalAnalysisUnitIds','[]'::jsonb
          ) ? item.id::text
      ) used
    ),'[]'::jsonb),
    'revisitedBy',coalesce((
      select jsonb_agg(jsonb_build_object(
        'studyUnitId',revisited.entity_id,
        'didacticMicrosequenceId',revisited.parent_id,
        'title',revisited.content->>'title'
      ) order by revisited.module_position,revisited.lesson_position,
        revisited.microsequence_position,revisited.position,revisited.entity_id)
      from (
        select distinct unit.*,module_value.position as module_position,
          lesson.position as lesson_position,
          microsequence.position as microsequence_position
        from private.course_entities unit
        join private.course_entities microsequence
          on microsequence.course_id=unit.course_id
         and microsequence.entity_type='microsequence'
         and microsequence.entity_id=unit.parent_id
        join private.course_entities lesson
          on lesson.course_id=microsequence.course_id
         and lesson.entity_type='lesson' and lesson.entity_id=microsequence.parent_id
        join private.course_entities module_value
          on module_value.course_id=lesson.course_id
         and module_value.entity_type='module' and module_value.entity_id=lesson.parent_id
        cross join lateral jsonb_array_elements(coalesce(
          unit.design_application->'explanationApplications','[]'::jsonb
        )) explanation(value)
        where unit.course_id=p_course_id and unit.entity_type='study_unit'
          and explanation.value->>'instructionalAnalysisUnitId'=item.id::text
          and not (coalesce(
            unit.design_application->'introducedInstructionalAnalysisUnitIds','[]'::jsonb
          ) ? item.id::text)
      ) revisited
    ),'[]'::jsonb)
  ) order by item.position,item.id),'[]'::jsonb)
  into v_analysis_units
  from private.course_instructional_plan_items item
  where item.instructional_plan_id=v_plan.id
    and item.item_kind='instructional_analysis_unit';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',item.id,'position',item.position,'statement',item.statement,
    'version',item.version
  ) order by item.position,item.id),'[]'::jsonb)
  into v_evidence_requirements
  from private.course_instructional_plan_items item
  where item.instructional_plan_id=v_plan.id
    and item.item_kind='evidence_requirement';

  select jsonb_build_object('modules',coalesce(jsonb_agg(jsonb_build_object(
    'id',module_value.entity_id,'position',module_value.position,
    'title',module_value.content->>'title',
    'objective',coalesce(module_value.content#>>'{guide,goal}',''),
    'lessons',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',lesson.entity_id,'position',lesson.position,
        'title',lesson.content->>'title',
        'objective',coalesce(lesson.content#>>'{guide,goal}',''),
        'microsequences',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',microsequence.entity_id,'position',microsequence.position,
            'title',microsequence.content->>'title',
            'objective',coalesce(microsequence.content->>'goal',''),
            'role',coalesce(microsequence.content->>'role','explain'),
            'dependencyMicrosequenceIds',coalesce(
              microsequence.content->'dependsOn','[]'::jsonb
            )
          ) order by microsequence.position,microsequence.entity_id)
          from private.course_entities microsequence
          where microsequence.course_id=lesson.course_id
            and microsequence.entity_type='microsequence'
            and microsequence.parent_id=lesson.entity_id
        ),'[]'::jsonb)
      ) order by lesson.position,lesson.entity_id)
      from private.course_entities lesson
      where lesson.course_id=module_value.course_id
        and lesson.entity_type='lesson' and lesson.parent_id=module_value.entity_id
    ),'[]'::jsonb)
  ) order by module_value.position,module_value.entity_id),'[]'::jsonb))
  into v_curriculum
  from private.course_entities module_value
  where module_value.course_id=p_course_id and module_value.entity_type='module';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',scope_item.id,'position',scope_item.position,
    'statement',scope_item.statement,
    'state',case when exists(
      select 1 from private.course_design_target_plan_items any_target
      where any_target.course_id=p_course_id
        and any_target.plan_item_kind='curriculum_scope_item'
        and any_target.plan_item_id=scope_item.id
    ) and not exists(
      select 1 from private.course_design_target_plan_items target
      where target.course_id=p_course_id
        and target.plan_item_kind='curriculum_scope_item'
        and target.plan_item_id=scope_item.id
        and not exists(
          select 1 from private.course_entities unit
          where unit.course_id=target.course_id and unit.entity_type='study_unit'
            and unit.parent_id=target.didactic_microsequence_id
            and coalesce(
              unit.design_application->'curriculumScopeItemIds','[]'::jsonb
            ) ? scope_item.id::text
        )
    ) then 'developed' else 'planned' end,
    'curriculumTargets',coalesce((
      select jsonb_agg(jsonb_build_object(
        'moduleId',target.module_id,'lessonId',target.lesson_id,
        'didacticMicrosequenceIds',target.microsequence_ids
      ) order by target.module_position,target.lesson_position,target.lesson_id)
      from (
        select module_value.entity_id as module_id,
          module_value.position as module_position,lesson.entity_id as lesson_id,
          lesson.position as lesson_position,
          jsonb_agg(to_jsonb(microsequence.entity_id)
            order by microsequence.position,microsequence.entity_id)
            as microsequence_ids
        from private.course_design_target_plan_items assignment
        join private.course_entities microsequence
          on microsequence.course_id=assignment.course_id
         and microsequence.entity_type='microsequence'
         and microsequence.entity_id=assignment.didactic_microsequence_id
        join private.course_entities lesson
          on lesson.course_id=microsequence.course_id
         and lesson.entity_type='lesson' and lesson.entity_id=microsequence.parent_id
        join private.course_entities module_value
          on module_value.course_id=lesson.course_id
         and module_value.entity_type='module' and module_value.entity_id=lesson.parent_id
        where assignment.course_id=p_course_id
          and assignment.plan_item_kind='curriculum_scope_item'
          and assignment.plan_item_id=scope_item.id
        group by module_value.entity_id,module_value.position,
          lesson.entity_id,lesson.position
      ) target
    ),'[]'::jsonb),
    'developedIn',coalesce((
      select jsonb_agg(jsonb_build_object(
        'studyUnitId',developed.entity_id,
        'didacticMicrosequenceId',developed.parent_id,
        'title',developed.content->>'title'
      ) order by developed.module_position,developed.lesson_position,
        developed.microsequence_position,developed.position,developed.entity_id)
      from (
        select distinct unit.*,module_value.position as module_position,
          lesson.position as lesson_position,
          microsequence.position as microsequence_position
        from private.course_design_target_plan_items assignment
        join private.course_entities microsequence
          on microsequence.course_id=assignment.course_id
         and microsequence.entity_type='microsequence'
         and microsequence.entity_id=assignment.didactic_microsequence_id
        join private.course_entities lesson
          on lesson.course_id=microsequence.course_id
         and lesson.entity_type='lesson' and lesson.entity_id=microsequence.parent_id
        join private.course_entities module_value
          on module_value.course_id=lesson.course_id
         and module_value.entity_type='module' and module_value.entity_id=lesson.parent_id
        join private.course_entities unit
          on unit.course_id=microsequence.course_id and unit.entity_type='study_unit'
         and unit.parent_id=microsequence.entity_id
        where assignment.course_id=p_course_id
          and assignment.plan_item_kind='curriculum_scope_item'
          and assignment.plan_item_id=scope_item.id
          and coalesce(
            unit.design_application->'curriculumScopeItemIds','[]'::jsonb
          ) ? scope_item.id::text
      ) developed
    ),'[]'::jsonb)
  ) order by scope_item.position,scope_item.id),'[]'::jsonb)
  into v_scope_items
  from private.course_instructional_plan_items scope_item
  where scope_item.instructional_plan_id=v_plan.id
    and scope_item.item_kind='curriculum_scope_item';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',part.id,'position',part.position,'title',part.title,
    'intent',part.intent,'progression',part.progression,'version',part.version,
    'microsequences',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',microsequence.entity_id,
        'productionPosition',membership.production_position,
        'title',microsequence.content->>'title',
        'goal',coalesce(microsequence.content->>'goal',''),
        'role',coalesce(microsequence.content->>'role','explain'),
        'curriculumPath',jsonb_build_object(
          'moduleId',module_value.entity_id,
          'moduleTitle',module_value.content->>'title',
          'lessonId',lesson.entity_id,'lessonTitle',lesson.content->>'title'
        ),
        'studyUnitCount',(
          select count(*)::integer from private.course_entities unit
          where unit.course_id=p_course_id and unit.entity_type='study_unit'
            and unit.parent_id=microsequence.entity_id
        )
      ) order by membership.production_position,microsequence.entity_id)
      from private.course_authoring_part_didactic_microsequences membership
      join private.course_entities microsequence
        on microsequence.course_id=membership.course_id
       and microsequence.entity_type='microsequence'
       and microsequence.entity_id=membership.didactic_microsequence_id
      join private.course_entities lesson
        on lesson.course_id=microsequence.course_id
       and lesson.entity_type='lesson' and lesson.entity_id=microsequence.parent_id
      join private.course_entities module_value
        on module_value.course_id=lesson.course_id
       and module_value.entity_type='module' and module_value.entity_id=lesson.parent_id
      where membership.course_id=p_course_id and membership.authoring_part_id=part.id
    ),'[]'::jsonb),
    'progress',private.course_authoring_part_progress_v1(p_course_id,part.id)
  ) order by part.position,part.id),'[]'::jsonb)
  into v_parts
  from private.course_authoring_parts part
  where part.instructional_plan_id=v_plan.id;

  select jsonb_build_object(
    'intendedLearningOutcomeCount',jsonb_array_length(v_outcomes),
    'instructionalAnalysisUnitCount',jsonb_array_length(v_analysis_units),
    'evidenceRequirementCount',jsonb_array_length(v_evidence_requirements),
    'authoringPartCount',jsonb_array_length(v_parts),
    'linkedDidacticMicrosequenceCount',(
      select count(*)::integer
      from private.course_authoring_part_didactic_microsequences membership
      where membership.course_id=p_course_id
    ),
    'studyUnitCount',(
      select count(*)::integer from private.course_entities unit
      where unit.course_id=p_course_id and unit.entity_type='study_unit'
    )
  ) into v_counts;

  v_result:=jsonb_build_object(
    'contract','aralearn.course-instructional-plan.v3',
    'courseId',p_course_id,'courseRevision',v_course.revision,
    'plan',jsonb_build_object(
      'id',v_plan.id,'version',v_plan.version,'title',v_course.title,
      'objective',v_course.goal,'audience',v_plan.audience,
      'scope',v_plan.instructional_scope,
      'curriculumMapStatus',v_plan.curriculum_map_status,
      'declaredPrerequisites',v_prerequisites,'curriculum',v_curriculum,
      'curriculumScopeItems',v_scope_items,
      'preferredPartCount',jsonb_build_object(
        'minimum',v_plan.preferred_authoring_part_min,
        'maximum',v_plan.preferred_authoring_part_max,
        'origin',v_plan.part_count_origin
      ),
      'intendedLearningOutcomes',v_outcomes,
      'instructionalAnalysisUnits',v_analysis_units,
      'evidenceRequirements',v_evidence_requirements,
      'parts',v_parts,'counts',v_counts,'updatedAt',v_plan.updated_at
    )
  );
  if octet_length(v_result::text)>1835008 then
    raise exception 'O planejamento curricular excede o limite de leitura.'
      using errcode='54000';
  end if;
  return v_result;
end;
$function$;

revoke all on function private.get_course_instructional_plan_for_actor_v3(uuid,uuid)
from public,anon,authenticated,service_role;

create function public.get_owned_course_instructional_plan_for_actor_v3(
  p_actor_id uuid,
  p_course_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private
as $function$
begin
  perform private.require_service_role();
  return private.get_course_instructional_plan_for_actor_v3(p_actor_id,p_course_id);
end;
$function$;

revoke all on function public.get_owned_course_instructional_plan_for_actor_v3(uuid,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.get_owned_course_instructional_plan_for_actor_v3(uuid,uuid)
to service_role;

revoke all on function public.get_owned_course_instructional_plan_for_actor_v2(uuid,uuid)
from public,anon,authenticated,service_role;
drop function public.get_owned_course_instructional_plan_for_actor_v2(uuid,uuid);
drop function private.get_course_instructional_plan_for_actor_v2(uuid,uuid);

create or replace function private.decorate_course_inspection_page_v2(
  p_course_id uuid,
  p_expected_revision bigint,
  p_result jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,private
as $function$
declare
  v_result jsonb:=p_result;
  v_items jsonb;
begin
  if p_expected_revision is null or p_expected_revision<1
     or (p_result->>'courseRevision')::bigint<>p_expected_revision then
    raise exception 'A inspecao nao corresponde a revisao solicitada.'
      using errcode='40001';
  end if;
  select coalesce(jsonb_agg(
    item.value||jsonb_build_object(
      'authorship',jsonb_build_object(
        'createdOrigin',entity.created_origin,
        'lastRevisionOrigin',entity.last_revision_origin,
        'design',jsonb_build_object(
          'application',case when entity.design_application is null then null else
            jsonb_build_object(
              'mode',entity.design_application->>'mode',
              'componentRefs',coalesce(
                entity.design_application->'componentRefs','[]'::jsonb
              ),
              'analysisIdeas',jsonb_build_object(
                'introduced',coalesce((
                  select jsonb_agg(jsonb_build_object(
                    'name',analysis_item.statement,
                    'description',analysis_item.description
                  ) order by introduced.ordinal)
                  from jsonb_array_elements_text(coalesce(
                    entity.design_application->'introducedInstructionalAnalysisUnitIds',
                    '[]'::jsonb
                  )) with ordinality introduced(value,ordinal)
                  join private.course_instructional_plan_items analysis_item
                    on analysis_item.course_id=p_course_id
                   and analysis_item.item_kind='instructional_analysis_unit'
                   and analysis_item.id::text=introduced.value
                ),'[]'::jsonb),
                'used',coalesce((
                  select jsonb_agg(jsonb_build_object(
                    'name',analysis_item.statement,
                    'description',analysis_item.description
                  ) order by used.ordinal)
                  from jsonb_array_elements_text(coalesce(
                    entity.design_application->'usedInstructionalAnalysisUnitIds',
                    '[]'::jsonb
                  )) with ordinality used(value,ordinal)
                  join private.course_instructional_plan_items analysis_item
                    on analysis_item.course_id=p_course_id
                   and analysis_item.item_kind='instructional_analysis_unit'
                   and analysis_item.id::text=used.value
                ),'[]'::jsonb),
                'revisited',coalesce((
                  select jsonb_agg(jsonb_build_object(
                    'name',analysis_item.statement,
                    'description',analysis_item.description
                  ) order by explanation.ordinal)
                  from jsonb_array_elements(coalesce(
                    entity.design_application->'explanationApplications','[]'::jsonb
                  )) with ordinality explanation(value,ordinal)
                  join private.course_instructional_plan_items analysis_item
                    on analysis_item.course_id=p_course_id
                   and analysis_item.item_kind='instructional_analysis_unit'
                   and analysis_item.id::text
                     =explanation.value->>'instructionalAnalysisUnitId'
                  where not (coalesce(
                    entity.design_application->'introducedInstructionalAnalysisUnitIds',
                    '[]'::jsonb
                  ) ? (explanation.value->>'instructionalAnalysisUnitId'))
                ),'[]'::jsonb)
              )
            ) end
        )
      )
    ) order by item.ordinal
  ),'[]'::jsonb) into v_items
  from jsonb_array_elements(v_result->'items')
    with ordinality item(value,ordinal)
  join private.course_entities entity
    on entity.course_id=p_course_id and entity.entity_type='study_unit'
   and entity.entity_id=item.value#>>'{studyUnit,id}';
  v_result:=jsonb_set(v_result,'{items}',v_items,true);
  v_result:=jsonb_set(v_result,'{contract}',
    to_jsonb('aralearn.course-study-unit-inspection-page.v2'::text),true);
  v_result:=jsonb_set(v_result,'{pageBytes}',
    to_jsonb(octet_length(v_items::text)),true);
  if octet_length(v_result::text)>1835008 then
    raise exception 'A pagina de unidades excede o limite de leitura.'
      using errcode='54000';
  end if;
  return v_result;
end;
$function$;

revoke all on function private.decorate_course_inspection_page_v2(uuid,bigint,jsonb)
from public,anon,authenticated,service_role;

-- O papel curricular da fonte é uma propriedade da própria fonte. A relação
-- de proveniência continua pertencendo ao vínculo com cada alvo.
alter table private.course_sources
  add column source_role text;
alter table private.course_sources
  add constraint course_sources_role_v1 check(
    source_role is null or source_role in(
      'curricular_scope','assessment_evidence','technical_conceptual'
    )
  );

do $add_course_source_roles$
declare
  v_definition text;
  v_original text;
begin
  v_definition:=pg_get_functiondef(
    'private.valid_course_source_pdf_ingestion_intent_v2(jsonb)'::regprocedure
  );
  v_original:=v_definition;
  v_definition:=replace(v_definition,
    '-''availability''-''verificationStatus''-''studyVisibility''=''{}''::jsonb',
    '-''availability''-''verificationStatus''-''studyVisibility''-''sourceRole''=''{}''::jsonb');
  v_definition:=replace(v_definition,
    '''verificationStatus'',''studyVisibility''',
    '''verificationStatus'',''studyVisibility'',''sourceRole''');
  v_definition:=replace(v_definition,
    'and v_source->>''origin'' in(''external'',''author_provided'',''imported'')',
    'and v_source->>''sourceRole'' in(''curricular_scope'',''assessment_evidence'',''technical_conceptual'') and v_source->>''origin'' in(''external'',''author_provided'',''imported'')');
  if v_definition=v_original
     or strpos(v_definition,'''sourceRole''')=0
     or strpos(v_definition,'''technical_conceptual''')=0 then
    raise exception 'O contrato de PDF nao aceitou papel da fonte.'
      using errcode='55000';
  end if;
  execute v_definition;

  v_definition:=pg_get_functiondef(
    'private.execute_course_source_command_core_v1(uuid,uuid,bigint,jsonb,text,text)'::regprocedure
  );
  v_original:=v_definition;
  -- `retire_anchor` nao carrega uma Fonte. Um `record` sem atribuicao pode
  -- ser avaliado pelo IF posterior mesmo quando o ramo de Fonte e falso.
  -- O rowtype deixa seus campos nulos e preserva a semantica desse guard.
  v_definition:=replace(v_definition,
    'v_source record;',
    'v_source private.course_sources%rowtype;');
  v_definition:=replace(v_definition,
    '- ''kind'' - ''title'' - ''authorship''',
    '- ''kind'' - ''sourceRole'' - ''title'' - ''authorship''');
  v_definition:=replace(v_definition,
    '''kind'',''title'',''authorship'',''publicationDate''',
    '''kind'',''sourceRole'',''title'',''authorship'',''publicationDate''');
  v_definition:=replace(v_definition,
    'v_source.kind,v_source.title',
    'v_source.kind,v_source.source_role,v_source.title');
  v_definition:=replace(v_definition,
    'p_command#>>''{source,kind}'',p_command#>>''{source,title}''',
    'p_command#>>''{source,kind}'',p_command#>>''{source,sourceRole}'',p_command#>>''{source,title}''');
  v_definition:=replace(v_definition,
    'course_id,source_id,revision,status,kind,title,authorship,',
    'course_id,source_id,revision,status,kind,source_role,title,authorship,');
  v_definition:=replace(v_definition,
    'status=excluded.status,kind=excluded.kind,',
    'status=excluded.status,kind=excluded.kind,source_role=excluded.source_role,');
  if v_definition=v_original
     or strpos(v_definition,'source_role')=0
     or strpos(v_definition,'v_source private.course_sources%rowtype;')=0
     or strpos(v_definition,'''{source,sourceRole}''')=0 then
    raise exception 'A escrita de fonte nao preservou seu papel.'
      using errcode='55000';
  end if;
  execute v_definition;

  v_definition:=pg_get_functiondef(
    'private.prepare_course_source_pdf_ingestion_core_v1(uuid,uuid,bigint,jsonb,text,bigint,text,text)'::regprocedure
  );
  v_original:=v_definition;
  v_definition:=replace(v_definition,
    'v_source.kind,v_source.title',
    'v_source.kind,v_source.source_role,v_source.title');
  v_definition:=replace(v_definition,
    'p_source_intent#>>''{source,kind}'',p_source_intent#>>''{source,title}''',
    'p_source_intent#>>''{source,kind}'',p_source_intent#>>''{source,sourceRole}'',p_source_intent#>>''{source,title}''');
  if v_definition=v_original or strpos(v_definition,'source_role')=0 then
    raise exception 'O preparo de PDF nao comparou o papel da fonte.'
      using errcode='55000';
  end if;
  execute v_definition;

  v_definition:=pg_get_functiondef(
    'public.get_owned_course_sources_for_actor_v1(uuid,uuid,bigint,text,text,text,text,text,integer)'::regprocedure
  );
  v_original:=v_definition;
  v_definition:=replace(v_definition,
    '''status'',page.status,''kind'',page.kind,''title'',page.title',
    '''status'',page.status,''kind'',page.kind,''sourceRole'',page.source_role,''title'',page.title');
  v_definition:=replace(v_definition,
    '''status'',source.status,''kind'',source.kind,''title'',source.title',
    '''status'',source.status,''kind'',source.kind,''sourceRole'',source.source_role,''title'',source.title');
  if v_definition=v_original
     or strpos(v_definition,'''sourceRole'',page.source_role')=0
     or strpos(v_definition,'''sourceRole'',source.source_role')=0 then
    raise exception 'A leitura de fontes nao expos seu papel.'
      using errcode='55000';
  end if;
  execute v_definition;

end;
$add_course_source_roles$;

-- Extensao editorial e derivada do texto autoral do componente, nao de toda
-- string usada para controlar sua renderizacao. A travessia conserva campos
-- textuais de qualquer package e descarta somente identidade, referencias,
-- respostas duplicadas e controles que nao aparecem como texto do conteudo.
create function private.count_course_component_authorial_words_v1(
  p_value jsonb,
  p_field text
)
returns integer
language plpgsql
immutable
set search_path=pg_catalog
as $function$
declare
  v_child jsonb;
  v_child_field text;
  v_total bigint:=0;
begin
  if p_value is null or p_value='null'::jsonb then
    return 0;
  end if;

  if p_field is not null and (
    p_field='id'
    or p_field ~ '(Id|Ids)$'
    or p_field=any(array[
      'languageTag','textDirection','selectionMode','selectionCriterion',
      'responseMode','kind','variant','layout','delimiters','notation',
      'chartType','scale','axis','addressBase','addressOrder','machineKind',
      'reactionType','key','cardinality','direction','flowDirection','role',
      'from','to','participant','lane','group','event','fromPort','toPort',
      'fromRelation','fromAttribute','toRelation','toAttribute','targetPath',
      'answer','acceptedAnswers','answerIds','highlight','expression'
    ]::text[])
  ) then
    return 0;
  end if;

  case jsonb_typeof(p_value)
    when 'string' then
      select count(*) into v_total
      from regexp_matches(
        p_value#>>'{}','[[:alnum:]]+([’''-][[:alnum:]]+)*','g'
      );
    when 'array' then
      for v_child in select value from jsonb_array_elements(p_value)
      loop
        v_total:=v_total+private.count_course_component_authorial_words_v1(
          v_child,p_field
        );
      end loop;
    when 'object' then
      for v_child_field,v_child in select key,value from jsonb_each(p_value)
      loop
        v_total:=v_total+private.count_course_component_authorial_words_v1(
          v_child,v_child_field
        );
      end loop;
    else
      v_total:=0;
  end case;
  return v_total::integer;
end;
$function$;

revoke all on function private.count_course_component_authorial_words_v1(jsonb,text)
from public,anon,authenticated,service_role;

do $preserve_analytics_design_scope$
declare
  v_definition text;
  v_original text;
  v_start integer;
  v_finish integer;
  v_design_rows text:=$new$
  parameter_value_rows as materialized (
    select parameter.value->>'parameterId' as parameter_id,
      parameter.value->'value' as value,parameter.value->>'origin' as origin,
      parameter.value->>'sourceScopeKind' as source_scope_kind,
      count(distinct design.study_unit_id)::integer as study_unit_count
    from current_design design
    cross join lateral jsonb_array_elements(design.snapshot->'parameters') parameter(value)
    where parameter.value->>'parameterId'
        <> 'new_analysis_unit_ceiling_per_expository_study_unit'
      or design.application->>'mode' in('expository','mixed')
    group by parameter.value->>'parameterId',parameter.value->'value',
      parameter.value->>'origin',parameter.value->>'sourceScopeKind'
  ),
  editorial_per_unit as materialized (
    select design.study_unit_id,
      case when char_length(direction.value->>'direction') <= 4000
        then direction.value->>'direction' else null end as direction,
      case when char_length(direction.value->>'direction') <= 4000
        then direction.value->>'origin' else null end as origin,
      case when char_length(direction.value->>'direction') <= 4000
        then direction.value->>'sourceScopeKind' else null end
        as source_scope_kind,
      char_length(direction.value->>'direction') > 4000 as truncated
    from current_design design
    left join lateral jsonb_array_elements(
      design.snapshot->'editorialDirections'
    ) direction(value) on true
  ),
  editorial_rows as materialized (
    select editorial.direction,editorial.origin,editorial.source_scope_kind,
      count(distinct editorial.study_unit_id)::integer as study_unit_count
    from editorial_per_unit editorial
    group by editorial.direction,editorial.origin,editorial.source_scope_kind
  ),
  unit_word_counts as materialized (
    select unit.entity_id as study_unit_id,
      coalesce(sum(
        private.count_course_component_authorial_words_v1(
          instance.instance->'data',null
        )
      ),0)::integer as word_count
    from scope_units unit
    left join lateral (
      select content.value as instance
      from jsonb_array_elements(unit.content->'content') content(value)
      union all
      select unit.content->'response'
      where jsonb_typeof(unit.content->'response')='object'
      union all
      select feedback.value
      from jsonb_array_elements(unit.content->'feedback') feedback(value)
    ) instance on true
    group by unit.entity_id
  ),
  word_count_rows as materialized (
    select unit.word_count,count(*)::integer as study_unit_count
    from unit_word_counts unit
    group by unit.word_count
  ),
$new$;
  v_design_projection text:=$new$
      'parameters',coalesce((select jsonb_agg(jsonb_build_object(
        'parameterId',definition.parameter_id,
        'label',definition.definition->>'label',
        'valueKind',case definition.value_kind when 'set' then 'string_list'
          else definition.value_kind end,
        'effectiveValues',coalesce((select jsonb_agg(jsonb_build_object(
          'value',value_row.value,'origin',value_row.origin,
          'sourceScopeKind',value_row.source_scope_kind,
          'studyUnitCount',value_row.study_unit_count
        ) order by value_row.value::text,value_row.origin nulls first,
          value_row.source_scope_kind nulls first)
          from parameter_value_rows value_row
          where value_row.parameter_id = definition.parameter_id),'[]'::jsonb)
      ) order by definition.ordinal)
      from private.course_design_parameter_definitions definition),'[]'::jsonb),
      'editorialDirections',coalesce((select jsonb_agg(jsonb_build_object(
        'direction',editorial.direction,'origin',editorial.origin,
        'sourceScopeKind',editorial.source_scope_kind,
        'studyUnitCount',editorial.study_unit_count
      ) order by editorial.direction nulls first,editorial.origin nulls first,
        editorial.source_scope_kind nulls first)
        from editorial_rows editorial),'[]'::jsonb),
      'wordCountsByStudyUnit',coalesce((select jsonb_agg(jsonb_build_object(
        'wordCount',word_count.word_count,
        'studyUnitCount',word_count.study_unit_count
      ) order by word_count.word_count)
        from word_count_rows word_count),'[]'::jsonb),
$new$;
  v_analysis_projection text:=$new$
      'analysisUnits',coalesce((select jsonb_agg(jsonb_build_object(
        'position',analysis.position,'statement',analysis.statement,
        'introductionCount',coalesce((select count(*)::integer
          from introduction_rows introduction
          where introduction.analysis_id=analysis.analysis_id::text),0),
        'useCount',coalesce((select count(*)::integer
          from scope_units unit
          where coalesce(
            unit.design_application->'usedInstructionalAnalysisUnitIds',
            '[]'::jsonb
          ) ? analysis.analysis_id::text),0),
        'revisitCount',coalesce((select count(*)::integer
          from scope_units unit
          where not (coalesce(
              unit.design_application->'introducedInstructionalAnalysisUnitIds',
              '[]'::jsonb
            ) ? analysis.analysis_id::text)
            and exists(
              select 1 from jsonb_array_elements(coalesce(
                unit.design_application->'explanationApplications','[]'::jsonb
              )) explanation(value)
              where explanation.value->>'instructionalAnalysisUnitId'
                =analysis.analysis_id::text
            )),0)
      ) order by analysis.position)
        from authorized_analysis analysis),'[]'::jsonb),
$new$;
begin
  v_definition:=pg_get_functiondef(
    'public.get_owned_course_authoring_analytics_for_actor_v2(uuid,uuid,bigint,jsonb)'::regprocedure
  );
  v_original:=v_definition;
  v_start:=strpos(v_definition,'  parameter_value_rows as materialized (');
  v_finish:=strpos(v_definition,'  authorized_analysis as materialized (');
  if v_start=0 or v_finish<=v_start then
    raise exception 'As linhas de desenho de Analytics nao correspondem ao contrato esperado.'
      using errcode='55000';
  end if;
  v_definition:=substr(v_definition,1,v_start-1)||v_design_rows
    ||substr(v_definition,v_finish);
  v_start:=strpos(v_definition,
    '''parameters'',coalesce((select jsonb_agg(jsonb_build_object(');
  v_finish:=strpos(v_definition,
    '''analysisUnits'',coalesce((select jsonb_agg(jsonb_build_object(');
  if v_start=0 or v_finish<=v_start then
    raise exception 'A projecao de desenho de Analytics nao corresponde ao contrato esperado.'
      using errcode='55000';
  end if;
  v_definition:=substr(v_definition,1,v_start-1)||v_design_projection
    ||substr(v_definition,v_finish);
  v_start:=strpos(v_definition,
    '''analysisUnits'',coalesce((select jsonb_agg(jsonb_build_object(');
  v_finish:=strpos(v_definition,
    '''introductionsByStudyUnit'',coalesce((select jsonb_agg(jsonb_build_object(');
  if v_start=0 or v_finish<=v_start then
    raise exception 'A projecao do repertorio de Analytics nao corresponde ao contrato esperado.'
      using errcode='55000';
  end if;
  v_definition:=substr(v_definition,1,v_start-1)||v_analysis_projection
    ||substr(v_definition,v_finish);
  v_definition:=replace(
    v_definition,'não possuem os quatro parâmetros usados',
    'não possuem os seis parâmetros usados'
  );
  v_definition:=replace(
    v_definition,
    'jsonb_array_length(design.snapshot->''parameters'') <> 4',
    'jsonb_array_length(design.snapshot->''parameters'') <> 6'
  );
  if v_definition=v_original
     or strpos(v_definition,'não possuem os quatro parâmetros usados')>0
     or strpos(v_definition,
       'jsonb_array_length(design.snapshot->''parameters'') <> 4')>0
     or strpos(v_definition,'''sourceScopeKind''')=0
     or strpos(v_definition,'''wordCountsByStudyUnit''')=0
     or strpos(v_definition,'''useCount''')=0
     or strpos(v_definition,'''revisitCount''')=0 then
    raise exception 'A projecao de Analytics nao corresponde ao contrato esperado.'
      using errcode='55000';
  end if;
  execute v_definition;
end;
$preserve_analytics_design_scope$;

do $measure_sources_by_curricular_role$
declare
  v_definition text;
  v_start integer;
  v_finish integer;
  v_source_rows text:=$new$
  source_role_rows as materialized (
    select source.source_role as role,
      count(distinct source_link.source_id)::integer as source_count,
      count(distinct anchor_link.anchor_id)::integer as anchor_count,
      count(distinct attribution.study_unit_id)::integer as study_unit_count
    from effective_attributions attribution
    join private.course_source_attribution_sources source_link
      on source_link.course_id = p_course_id
     and source_link.attribution_id = attribution.attribution_id
    join private.course_sources source
      on source.course_id=source_link.course_id
     and source.source_id=source_link.source_id
    left join private.course_source_attribution_anchors anchor_link
      on anchor_link.course_id = source_link.course_id
     and anchor_link.attribution_id = source_link.attribution_id
     and anchor_link.source_ordinal = source_link.source_ordinal
    group by source.source_role
  ),
$new$;
begin
  v_definition:=pg_get_functiondef(
    'public.get_owned_course_authoring_analytics_for_actor_v2(uuid,uuid,bigint,jsonb)'::regprocedure
  );
  v_start:=strpos(v_definition,'  source_role_rows as materialized (');
  v_finish:=strpos(v_definition,'  scope_annotations as materialized (');
  if v_start=0 or v_finish<=v_start then
    raise exception 'As linhas de fontes de Analytics nao correspondem ao contrato esperado.'
      using errcode='55000';
  end if;
  v_definition:=substr(v_definition,1,v_start-1)||v_source_rows
    ||substr(v_definition,v_finish);
  if strpos(v_definition,'join private.course_sources source')=0
     or strpos(v_definition,'group by source.source_role')=0
     or strpos(v_definition,'source_link.relation as role')>0 then
    raise exception 'Analytics nao separou papel da fonte e proveniencia.'
      using errcode='55000';
  end if;
  execute v_definition;
end;
$measure_sources_by_curricular_role$;

revoke all on function public.get_owned_course_authoring_analytics_for_actor_v2(
  uuid,uuid,bigint,jsonb
) from public,anon,authenticated,service_role;
grant execute on function public.get_owned_course_authoring_analytics_for_actor_v2(
  uuid,uuid,bigint,jsonb
) to service_role;

do $advance_global_curriculum_manifest$
declare
  v_manifest jsonb;
  v_features jsonb;
  v_body text;
begin
  v_manifest:=public.get_aralearn_runtime_manifest();
  select jsonb_agg(to_jsonb(feature) order by feature) into v_features
  from (
    select distinct feature
    from (
      select value as feature
      from jsonb_array_elements_text(coalesce(v_manifest->'features','[]'::jsonb))
      where value not in(
        'course-instructional-plan-v2',
        'course-authoring-part-materialization-atomic-v1'
      )
      union all
      select unnest(array[
        'course-analysis-repertoire-v1',
        'course-authoring-part-materialization-atomic-v2',
        'course-curricular-map-v1',
        'course-instructional-plan-v3',
        'course-source-roles-v1'
      ])
    ) feature_values
  ) features;
  v_manifest:=jsonb_set(v_manifest,'{features}',v_features,true);
  v_manifest:=jsonb_set(
    v_manifest,'{schemaRevision}',to_jsonb('20260903160000'::text),true
  );
  v_body:='select '||quote_literal(v_manifest::text)||'::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      ||'returns jsonb language sql stable security definer '
      ||'set search_path=pg_catalog as %L',v_body
  );
  revoke all on function public.get_aralearn_runtime_manifest()
    from public,anon,authenticated,service_role;
  grant execute on function public.get_aralearn_runtime_manifest()
    to anon,authenticated,service_role;
end;
$advance_global_curriculum_manifest$;

do $global_curriculum_postflight$
declare
  v_manifest jsonb:=public.get_aralearn_runtime_manifest();
  v_part_definition text;
  v_map_definition text;
  v_plan_definition text;
  v_materialization_definition text;
  v_analytics_definition text;
  v_design_reader_definition text;
  v_source_writer_definition text;
  v_source_reader_definition text;
  v_source_pdf_validator_definition text;
begin
  v_part_definition:=pg_get_functiondef(
    'public.save_course_authoring_part_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,text,text)'::regprocedure
  );
  v_map_definition:=pg_get_functiondef(
    'public.save_course_curricular_map_for_actor_v1(uuid,uuid,bigint,bigint,boolean,jsonb,text,text)'::regprocedure
  );
  v_plan_definition:=pg_get_functiondef(
    'private.get_course_instructional_plan_for_actor_v3(uuid,uuid)'::regprocedure
  );
  v_materialization_definition:=pg_get_functiondef(
    'private.materialize_course_authoring_part_core_v1(uuid,uuid,uuid,bigint,bigint,jsonb,text,text)'::regprocedure
  );
  v_analytics_definition:=pg_get_functiondef(
    'public.get_owned_course_authoring_analytics_for_actor_v2(uuid,uuid,bigint,jsonb)'::regprocedure
  );
  v_design_reader_definition:=pg_get_functiondef(
    'public.get_owned_course_design_for_actor_v2(uuid,uuid,text,text,integer,text)'::regprocedure
  );
  v_source_writer_definition:=pg_get_functiondef(
    'private.execute_course_source_command_core_v1(uuid,uuid,bigint,jsonb,text,text)'::regprocedure
  );
  v_source_reader_definition:=pg_get_functiondef(
    'public.get_owned_course_sources_for_actor_v1(uuid,uuid,bigint,text,text,text,text,text,integer)'::regprocedure
  );
  v_source_pdf_validator_definition:=pg_get_functiondef(
    'private.valid_course_source_pdf_ingestion_intent_v2(jsonb)'::regprocedure
  );
  if v_manifest->>'schemaRevision'<>'20260903160000'
     or not (v_manifest->'features' @> '[
       "course-analysis-repertoire-v1",
       "course-authoring-part-materialization-atomic-v2",
       "course-curricular-map-v1",
       "course-instructional-plan-v3",
       "course-source-roles-v1"
     ]'::jsonb)
     or v_manifest->'features' ?| array[
       'course-instructional-plan-v2',
       'course-authoring-part-materialization-atomic-v1'
     ]
     or to_regprocedure(
       'public.get_owned_course_instructional_plan_for_actor_v3(uuid,uuid)'
     ) is null
     or to_regprocedure(
       'public.save_course_curricular_map_for_actor_v1(uuid,uuid,bigint,bigint,boolean,jsonb,text,text)'
     ) is null
     or to_regprocedure(
       'public.materialize_course_authoring_part_for_actor_v2(uuid,uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text)'
     ) is null
     or to_regprocedure(
       'public.get_owned_course_instructional_plan_for_actor_v2(uuid,uuid)'
     ) is not null
     or to_regprocedure(
       'public.materialize_course_authoring_part_for_actor_v1(uuid,uuid,uuid,bigint,bigint,jsonb,text,text)'
     ) is not null
     or not has_function_privilege(
       'service_role',
       'public.get_owned_course_instructional_plan_for_actor_v3(uuid,uuid)',
       'execute'
     )
     or not has_function_privilege(
       'service_role',
       'public.save_course_curricular_map_for_actor_v1(uuid,uuid,bigint,bigint,boolean,jsonb,text,text)',
       'execute'
     )
     or not has_function_privilege(
       'service_role',
       'public.materialize_course_authoring_part_for_actor_v2(uuid,uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text)',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'public.save_course_curricular_map_for_actor_v1(uuid,uuid,bigint,bigint,boolean,jsonb,text,text)',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'public.materialize_course_authoring_part_for_actor_v2(uuid,uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text)',
       'execute'
     ) then
    raise exception 'A fronteira curricular final ficou incompleta.'
      using errcode='55000';
  end if;
  if exists(
    select 1 from private.course_instructional_plans plan
    where plan.curriculum_map_status='absent' and exists(
      select 1 from private.course_entities entity
      where entity.course_id=plan.course_id
        and entity.entity_type in('module','lesson','microsequence')
    )
  ) or exists(
    select 1 from private.course_entities unit
    where unit.entity_type='study_unit' and unit.design_application is not null
      and not (unit.design_application ?& array[
        'usedInstructionalAnalysisUnitIds','curriculumScopeItemIds'
      ])
  ) or strpos(v_part_definition,'insert into private.course_entities')>0
     or strpos(v_map_definition,'insert into private.course_authoring_parts')>0
    or strpos(v_plan_definition,'introducedPartPosition')>0
    or (select count(*) from private.course_design_parameter_definitions)<>6
    or exists(
      select 1 from private.course_design_parameter_definitions definition
      where definition.catalog_version<>'1.1.0'
    )
    or not exists(
      select 1 from private.course_design_parameter_definitions definition
      where definition.parameter_id='authoring_chat_response_word_target'
        and definition.ordinal=5 and definition.value_kind='integer'
        and definition.default_value='120'::jsonb
        and definition.definition#>>'{valueSchema,minimum}'='20'
        and definition.definition#>>'{valueSchema,maximum}'='500'
    )
    or not exists(
      select 1 from private.course_design_parameter_definitions definition
      where definition.parameter_id='study_unit_content_word_target'
        and definition.ordinal=6 and definition.value_kind='integer'
        and definition.default_value='180'::jsonb
        and definition.definition#>>'{valueSchema,minimum}'='40'
        and definition.definition#>>'{valueSchema,maximum}'='1000'
    )
    or private.valid_course_design_parameter_value_v1(
      'authoring_chat_response_word_target','19'::jsonb
    )
    or not private.valid_course_design_parameter_value_v1(
      'authoring_chat_response_word_target','20'::jsonb
    )
    or not private.valid_course_design_parameter_value_v1(
      'authoring_chat_response_word_target','500'::jsonb
    )
    or private.valid_course_design_parameter_value_v1(
      'authoring_chat_response_word_target','501'::jsonb
    )
    or private.valid_course_design_parameter_value_v1(
      'study_unit_content_word_target','39'::jsonb
    )
    or not private.valid_course_design_parameter_value_v1(
      'study_unit_content_word_target','40'::jsonb
    )
    or not private.valid_course_design_parameter_value_v1(
      'study_unit_content_word_target','1000'::jsonb
    )
    or private.valid_course_design_parameter_value_v1(
      'study_unit_content_word_target','1001'::jsonb
    )
    or strpos(v_materialization_definition,
      'jsonb_array_length(v_snapshot->''parameters'') <> 6')=0
    or strpos(v_analytics_definition,'''sourceScopeKind''')=0
    or strpos(v_analytics_definition,'''wordCountsByStudyUnit''')=0
    or strpos(v_analytics_definition,'group by source.source_role')=0
    or strpos(v_analytics_definition,'source_link.relation as role')>0
    or not exists(
      select 1 from information_schema.columns column_value
      where column_value.table_schema='private'
        and column_value.table_name='course_sources'
        and column_value.column_name='source_role'
    )
    or strpos(v_source_writer_definition,'''{source,sourceRole}''')=0
    or strpos(v_source_reader_definition,'''sourceRole''')=0
    or strpos(v_source_pdf_validator_definition,'''technical_conceptual''')=0
    or strpos(v_analytics_definition,
      'jsonb_array_length(design.snapshot->''parameters'') <> 6')=0
    or strpos(v_design_reader_definition,
      '''parameterCatalogVersion'',''1.1.0''')=0 then
    raise exception 'O estado final mistura mapa, lote ou repertorio antigo.'
      using errcode='55000';
  end if;
end;
$global_curriculum_postflight$;

commit;
