-- #122: parâmetros pedagógicos, orientação cumulativa e política de componentes.
-- Defaults são hipóteses de produto; limites técnicos não são parâmetros pedagógicos.

begin;

set local lock_timeout = '15s';
set local statement_timeout = '10min';

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-course-design-parameters-v1', 0
));

do $course_design_preflight$
declare
  v_manifest jsonb;
  v_relation text;
  v_count bigint;
  v_materialization_count bigint;
  v_step_count bigint;
  v_legacy_relations text[] := array[
    'authoring_instructional_analyses',
    'authoring_design_parameter_assignments',
    'authoring_resource_sets',
    'authoring_effective_design_snapshots',
    'authoring_pedagogical_blueprints',
    'authoring_pedagogical_blueprint_bindings',
    'authoring_microsequence_design_bindings',
    'authoring_materialization_states',
    'authoring_materialization_manifests'
  ]::text[];
  v_expected text[] := array[
    'accepted_performance_forms',
    'applicable_explanation_requirement_refs',
    'available_resource_set_refs',
    'distinct_practice_opportunities_per_evidence_requirement',
    'evidence_alignment_relation',
    'new_units_per_theory_step_ceiling',
    'practice_variation_dimensions',
    'representation_fallback_policy',
    'simultaneous_new_units_per_coordination_set_ceiling'
  ]::text[];
begin
  if to_regclass('public.courses') is null
     or to_regclass('private.course_entities') is null
     or to_regclass('private.course_instructional_plans') is null
     or to_regclass('private.course_instructional_plan_items') is null
     or to_regclass('private.course_authoring_part_materializations') is null
     or to_regclass('private.course_authoring_part_materialization_steps') is null
     or to_regclass('private.course_events') is null
     or to_regclass('private.course_change_receipts') is null
     or to_regclass('private.authoring_design_parameter_definitions') is null
     or to_regprocedure('private.require_service_role()') is null
     or to_regprocedure('private.require_course_access_v1(uuid,uuid,boolean)') is null
     or to_regprocedure('extensions.digest(bytea,text)') is null
     or to_regprocedure('extensions.gen_random_uuid()') is null then
    raise exception 'Dependências dos parâmetros de desenho do Curso ausentes.'
      using errcode = '55000';
  end if;
  if to_regclass('private.course_design_parameter_definitions') is not null
     or to_regclass('private.course_design_parameter_changes') is not null
     or to_regclass('private.course_authoring_guidance_revisions') is not null
     or to_regclass('private.course_component_policy_changes') is not null
     or to_regclass('private.course_design_target_plan_items') is not null then
    raise exception 'O desenho parametrizado do Curso já existe parcialmente.'
      using errcode = '55000';
  end if;
  lock table private.course_authoring_part_materializations
    in share row exclusive mode;
  lock table private.course_authoring_part_materialization_steps
    in share row exclusive mode;
  select count(*) into v_materialization_count
  from private.course_authoring_part_materializations;
  select count(*) into v_step_count
  from private.course_authoring_part_materialization_steps;
  if v_materialization_count <> 0 or v_step_count <> 0 then
    raise exception
      'Materializações anteriores a 1800 impedem o cutover (% materializações; % etapas).',
      v_materialization_count,v_step_count
      using errcode = '55000';
  end if;
  if not exists(
    select 1 from information_schema.columns
    where table_schema = 'private'
      and table_name = 'course_instructional_plans'
      and column_name = 'authoring_guidance'
  ) then
    raise exception 'A orientação monolítica esperada no plano não existe.'
      using errcode = '55000';
  end if;
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision' <> '20260817170000'
     or (v_manifest->>'contractVersion')::integer <> 1
     or not (v_manifest->'features' ?& array[
       'course-instructional-plan-v1',
       'course-study-unit-inspection-v1'
     ]) then
    raise exception 'Manifesto anterior aos parâmetros de desenho é incompatível.'
      using errcode = '55000';
  end if;
  if (
    select array_agg(definition.parameter_id order by definition.parameter_id)
    from private.authoring_design_parameter_definitions definition
  ) is distinct from v_expected
     or exists(
       select 1
       from private.authoring_design_parameter_definitions definition
       where definition.parameter_version <> '1.0.0'
          or definition.catalog_version <> '1.0.0'
     ) then
    raise exception 'O catálogo legado de nove parâmetros não é o esperado.'
      using errcode = '55000';
  end if;
  foreach v_relation in array v_legacy_relations
  loop
    if to_regclass('private.' || v_relation) is null then
      raise exception 'Relação legada de desenho ausente: %.', v_relation
        using errcode = '55000';
    end if;
    execute format(
      'lock table private.%I in share row exclusive mode',v_relation
    );
  end loop;
  foreach v_relation in array v_legacy_relations
  loop
    execute format('select count(*) from private.%I', v_relation) into v_count;
    if v_count <> 0 then
      raise exception 'Estado legado de desenho não vazio em private.%.', v_relation
        using errcode = '55000';
    end if;
  end loop;
end;
$course_design_preflight$;

lock table public.courses in share row exclusive mode;
lock table private.course_entities in share row exclusive mode;
lock table private.course_instructional_plans in access exclusive mode;
lock table private.course_authoring_part_materializations in share row exclusive mode;
lock table private.course_authoring_part_materialization_steps in share row exclusive mode;
lock table private.course_events in share row exclusive mode;
lock table private.course_change_receipts in share row exclusive mode;

create function private.course_component_catalog_v1()
returns jsonb
language sql
immutable
security definer
set search_path = pg_catalog
as $function$
  select '{"version":"1-3e5629f8","options":[{"ref":"aralearn.resource.paragraph@1.0.0","label":"Texto explicado","purpose":"Desenvolver uma explicação progressiva em prosa, listas curtas e literais inequívocos."},{"ref":"aralearn.resource.code@1.0.0","label":"Código","purpose":"Apresentar código cuja sintaxe, indentação e execução mental são relevantes."},{"ref":"aralearn.resource.table@1.0.0","label":"Tabela","purpose":"Comparar atributos repetidos ou consultar valores organizados por linhas e colunas."},{"ref":"aralearn.resource.annotated_text@1.0.0","label":"Texto anotado","purpose":"Relacionar trechos precisos de um texto a observações, funções ou explicações."},{"ref":"aralearn.resource.bpmn_process@1.0.0","label":"Processo BPMN","purpose":"Representar participantes, raias, eventos, atividades, gateways e fluxos segundo o subconjunto didático de BPMN 2.0."},{"ref":"aralearn.resource.interlinear_gloss@1.0.0","label":"Glosa interlinear","purpose":"Alinhar formas linguísticas segmentadas, glosas morfema a morfema, tradução livre e legenda de abreviações."},{"ref":"aralearn.response.choice@1.0.0","label":"Escolha","purpose":"Pedir que o estudante discrimine uma ou mais alternativas plausíveis."},{"ref":"aralearn.response.gap@1.0.0","label":"Lacuna","purpose":"Pedir recuperação ou discriminação exatamente no campo semântico declarado pelo conteúdo."},{"ref":"aralearn.response.ordering@3.0.0","label":"Ordenação","purpose":"Pedir que o estudante reconstrua a ordem de expressões nos próprios campos textuais em que elas são lidas."},{"ref":"aralearn.resource.tree@1.0.0","label":"Árvore enraizada","purpose":"Representar hierarquia com relação pai-filho, raiz explícita e no máximo um pai por nó."},{"ref":"aralearn.resource.matrix@1.0.0","label":"Matriz","purpose":"Representar um arranjo retangular de escalares ou expressões e operações da álgebra linear."},{"ref":"aralearn.resource.reaction@1.0.0","label":"Reação","purpose":"Representar reagentes, produtos, proporções, estados e condições de uma reação."},{"ref":"aralearn.resource.flow@1.0.0","label":"Fluxograma","purpose":"Representar sequência, decisão, ramificação e repetição com a convenção visual de fluxogramas."},{"ref":"aralearn.resource.formula@1.0.0","label":"Fórmula","purpose":"Representar expressão matemática ou química estruturada com leitura acessível explícita."},{"ref":"aralearn.resource.plane@1.0.0","label":"Plano cartesiano","purpose":"Situar pontos, vetores, trajetórias e regiões em duas dimensões com escala acadêmica explícita."},{"ref":"aralearn.resource.chart@1.0.0","label":"Gráfico estatístico","purpose":"Tornar tendência, comparação quantitativa, escala e incerteza visualmente observáveis."},{"ref":"aralearn.resource.software_system_context@1.0.0","label":"Contexto de sistema de software","purpose":"Situar um sistema de software entre pessoas e sistemas externos segundo o diagrama de contexto do modelo C4."},{"ref":"aralearn.resource.software_container@1.0.0","label":"Contêineres de software","purpose":"Representar aplicações e armazenamentos executáveis ou implantáveis dentro de um sistema segundo o nível de contêiner do C4."},{"ref":"aralearn.resource.system_internal_block@1.0.0","label":"Diagrama interno de bloco","purpose":"Representar partes, portas, itens e conectores internos de um bloco segundo a gramática de diagrama interno do SysML."},{"ref":"aralearn.resource.graph@1.0.0","label":"Grafo matemático","purpose":"Representar grafos e dígrafos abstratos segundo a notação de teoria dos grafos."},{"ref":"aralearn.resource.relation_map@1.0.0","label":"Diagrama de relação","purpose":"Tornar visíveis domínio, contradomínio, imagens, preimagens e cardinalidade de uma relação binária."},{"ref":"aralearn.resource.database_schema@1.0.0","label":"Esquema relacional","purpose":"Representar relações, atributos, chaves e dependências referenciais no modelo lógico relacional."},{"ref":"aralearn.resource.memory_layout@1.0.0","label":"Mapa de memória","purpose":"Representar intervalos de endereços, segmentos e ocupação de memória na ordem convencional."},{"ref":"aralearn.resource.network_topology@1.0.0","label":"Topologia de rede","purpose":"Representar equipamentos, segmentos e enlaces de uma rede sem confundi-los com vértices abstratos."},{"ref":"aralearn.resource.packet_layout@1.0.0","label":"Layout de pacote","purpose":"Representar cabeçalhos e registros binários em palavras de largura fixa, com posição e extensão de cada campo."},{"ref":"aralearn.resource.set_diagram@1.0.0","label":"Diagrama de conjuntos","purpose":"Representar inclusão, exclusão e interseção entre dois ou três conjuntos, preservando as regiões de Venn ou a topologia de Euler."},{"ref":"aralearn.resource.state_machine@1.0.0","label":"Diagrama de estados","purpose":"Representar comportamento dependente de estado com a notação gráfica de autômatos ou máquinas de estados."},{"ref":"aralearn.resource.truth_table@1.0.0","label":"Tabela-verdade","purpose":"Representar valorações e o resultado de uma fórmula proposicional segundo a convenção lógica."},{"ref":"aralearn.resource.entity_relationship@1.0.0","label":"Modelo entidade-relacionamento","purpose":"Representar entidades, atributos e cardinalidades no nível conceitual da modelagem de dados."},{"ref":"aralearn.resource.state_transition_table@1.0.0","label":"Tabela de transição","purpose":"Comparar de forma exaustiva a função de transição por estado e evento ou símbolo."},{"ref":"aralearn.resource.call_stack@1.0.0","label":"Pilha de chamadas","purpose":"Representar quadros de ativação, parâmetros, variáveis locais e continuações durante chamadas de função."},{"ref":"aralearn.resource.terminal_session@1.0.0","label":"Sessão de terminal","purpose":"Representar uma interação textual temporal entre pessoa e sistema, preservando entradas, saídas, erros e mudanças observáveis de estado."}]}'::jsonb
$function$;

create function private.reject_course_design_update_v1()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if tg_op = 'UPDATE'
     and tg_table_name in (
       'course_design_parameter_changes',
       'course_authoring_guidance_revisions',
       'course_authoring_guidance_interpretations',
       'course_component_policy_changes'
     )
     and to_jsonb(old)->'actor_id' <> 'null'::jsonb
     and to_jsonb(new)->'actor_id' = 'null'::jsonb
     and (to_jsonb(new) - 'actor_id') = (to_jsonb(old) - 'actor_id') then
    return new;
  end if;
  raise exception 'Fatos de desenho do Curso são append-only.'
    using errcode = '55000';
end;
$function$;

create table private.course_design_parameter_definitions (
  parameter_id text primary key,
  ordinal smallint not null unique,
  catalog_version text not null,
  value_kind text not null,
  supported_scopes text[] not null,
  definition jsonb not null,
  default_value jsonb not null,
  created_at timestamptz not null default now(),
  constraint course_design_parameter_definitions_id_v1 check(
    parameter_id ~ '^[a-z][a-z0-9_]{0,159}$'
    and catalog_version = '1.0.0'
    and ordinal between 1 and 4
  ),
  constraint course_design_parameter_definitions_kind_v1 check(
    value_kind in ('integer', 'set')
  ),
  constraint course_design_parameter_definitions_scope_v1 check(
    supported_scopes = array[
      'course', 'lesson', 'didactic_microsequence'
    ]::text[]
  ),
  constraint course_design_parameter_definitions_payload_v1 check(
    jsonb_typeof(definition) = 'object'
    and octet_length(definition::text) <= 8192
    and jsonb_typeof(default_value) in ('number', 'array')
    and octet_length(default_value::text) <= 4096
  )
);

create trigger course_design_parameter_definitions_immutable_v1
before update or delete on private.course_design_parameter_definitions
for each row execute function private.reject_course_design_update_v1();

insert into private.course_design_parameter_definitions(
  parameter_id, ordinal, catalog_version, value_kind,
  supported_scopes, definition, default_value
) values
(
  'new_analysis_unit_ceiling_per_expository_study_unit', 1, '1.0.0', 'integer',
  array['course','lesson','didactic_microsequence'],
  jsonb_build_object(
    'id','new_analysis_unit_ceiling_per_expository_study_unit',
    'label','Novas unidades de análise por Unidade expositiva',
    'construct','Quantidade de unidades da análise instrucional introduzidas como novas em uma mesma Unidade de estudo expositiva.',
    'operationalization','Conta identidades distintas declaradas como introduzidas em cada Unidade expositiva ou mista; não usa caracteres, linhas, altura nem tempo como proxy.',
    'limitations','A contagem orienta granularidade de desenho e não mede carga cognitiva, dificuldade, aprendizagem ou qualidade da explicação.',
    'defaultStatus','product_hypothesis',
    'evidenceRefs',jsonb_build_array('koedinger2012kli','chen2023elementinteractivity'),
    'supportedScopes',jsonb_build_array('course','lesson','didactic_microsequence'),
    'valueSchema',jsonb_build_object('type','integer','minimum',1,'maximum',64),
    'defaultValue',2
  ),
  '2'::jsonb
),
(
  'required_explanation_forms', 2, '1.0.0', 'set',
  array['course','lesson','didactic_microsequence'],
  jsonb_build_object(
    'id','required_explanation_forms',
    'label','Formas de explicação requeridas',
    'construct','Formas semanticamente distintas usadas para desenvolver uma unidade da análise instrucional.',
    'operationalization','Verifica, por identidade introduzida, quais formas foram desenvolvidas e quais foram declaradas não aplicáveis com motivo factual.',
    'limitations','As formas não são uma escala de qualidade nem uma lista universal; adequação depende do objeto, público, tarefa e representação.',
    'defaultStatus','product_hypothesis',
    'evidenceRefs',jsonb_build_array('wittwer2008explanations','ainsworth2006deft'),
    'supportedScopes',jsonb_build_array('course','lesson','didactic_microsequence'),
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
  ),
  '["plain_definition","concrete_example","mechanism","contrast"]'::jsonb
),
(
  'minimum_distinct_practice_opportunities_per_evidence_requirement',
  3, '1.0.0', 'integer',
  array['course','lesson','didactic_microsequence'],
  jsonb_build_object(
    'id','minimum_distinct_practice_opportunities_per_evidence_requirement',
    'label','Oportunidades distintas por requisito de evidência',
    'construct','Quantidade mínima de oportunidades semanticamente distintas relacionadas a cada requisito de evidência.',
    'operationalization','Conta opportunityId distinto por requisito de evidência e conserva a operação-alvo invariável declarada em cada oportunidade.',
    'limitations','Quantidade de oportunidades não demonstra domínio, eficácia ou equivalência entre tarefas; a pertinência da evidência permanece uma hipótese de desenho.',
    'defaultStatus','product_hypothesis',
    'evidenceRefs',jsonb_build_array('karpicke2008retrieval','mislevy2003ecd'),
    'supportedScopes',jsonb_build_array('course','lesson','didactic_microsequence'),
    'valueSchema',jsonb_build_object('type','integer','minimum',1,'maximum',64),
    'defaultValue',2
  ),
  '2'::jsonb
),
(
  'required_practice_variation_dimensions', 4, '1.0.0', 'set',
  array['course','lesson','didactic_microsequence'],
  jsonb_build_object(
    'id','required_practice_variation_dimensions',
    'label','Dimensões requeridas de variação da prática',
    'construct','Dimensões semanticamente relevantes que variam entre oportunidades relacionadas ao mesmo requisito de evidência.',
    'operationalization','Verifica as dimensões declaradas nas oportunidades sem tratar mudança cosmética ou reordenação como variação semântica.',
    'limitations','Variação declarada não prova transferência nem aprendizagem e precisa preservar a operação-alvo pertinente ao requisito.',
    'defaultStatus','product_hypothesis',
    'evidenceRefs',jsonb_build_array('taylor2010interleaved','ainsworth2006deft'),
    'supportedScopes',jsonb_build_array('course','lesson','didactic_microsequence'),
    'valueSchema',jsonb_build_object(
      'type','set',
      'allowedValues',jsonb_build_array(
        'case_or_data','context','task_feature',
        'external_representation','support_level'
      ),
      'minimumItems',1,'maximumItems',5
    ),
    'defaultValue',jsonb_build_array('case_or_data')
  ),
  '["case_or_data"]'::jsonb
);

alter table private.course_instructional_plan_items
  add constraint course_instructional_plan_items_kind_identity_v1 unique(
    course_id,id,item_kind
  );

create table private.course_design_target_plan_items (
  course_id uuid not null,
  didactic_microsequence_entity_type text
    generated always as ('microsequence') stored,
  didactic_microsequence_id text not null,
  plan_item_id uuid not null,
  plan_item_kind text not null,
  primary key(course_id,didactic_microsequence_id,plan_item_id),
  constraint course_design_target_plan_items_microsequence_fk_v1 foreign key(
    course_id,didactic_microsequence_entity_type,didactic_microsequence_id
  ) references private.course_entities(course_id,entity_type,entity_id)
    on delete cascade,
  constraint course_design_target_plan_items_plan_item_fk_v1 foreign key(
    course_id,plan_item_id,plan_item_kind
  ) references private.course_instructional_plan_items(course_id,id,item_kind)
    on delete cascade,
  constraint course_design_target_plan_items_kind_v1 check(
    plan_item_kind in (
      'instructional_analysis_unit','evidence_requirement'
    )
  )
);
create index course_design_target_plan_items_item_v1_idx
  on private.course_design_target_plan_items(
    course_id,plan_item_id,didactic_microsequence_id
  );

-- A relação possui cascades fortes nos dois ramos, mas sai primeiro na
-- exclusão da raiz para não depender da ordem dos cascades paralelos.
create or replace function private.delete_course_authoring_relations_before_course_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  delete from private.course_design_target_plan_items assignment
  where assignment.course_id = old.id;
  delete from private.course_authoring_part_didactic_microsequences membership
  where membership.course_id = old.id;
  delete from private.course_authoring_part_materializations materialization
  where materialization.course_id = old.id;
  return old;
end;
$function$;

create table private.course_design_parameter_changes (
  id bigint generated always as identity primary key,
  course_id uuid not null references public.courses(id) on delete cascade,
  course_revision bigint not null,
  parameter_id text not null references
    private.course_design_parameter_definitions(parameter_id),
  scope_kind text not null,
  scope_ref text not null,
  action text not null,
  value jsonb,
  origin text,
  reason text,
  actor_id uuid references auth.users(id) on delete set null,
  channel text not null,
  created_at timestamptz not null default now(),
  constraint course_design_parameter_changes_revision_v1 check(course_revision > 0),
  constraint course_design_parameter_changes_scope_v1 check(
    scope_kind in ('course','lesson','didactic_microsequence')
    and nullif(btrim(scope_ref),'') is not null
    and scope_ref = btrim(scope_ref)
    and char_length(scope_ref) <= 240
    and scope_ref !~ '[[:cntrl:]]'
  ),
  constraint course_design_parameter_changes_action_v1 check(
    (action = 'set' and value is not null
      and origin in ('automatic','author','research_condition')
      and nullif(btrim(reason),'') is not null)
    or (action = 'clear' and value is null and origin is null and reason is null)
  ),
  constraint course_design_parameter_changes_payload_v1 check(
    value is null or octet_length(value::text) <= 4096
  ),
  constraint course_design_parameter_changes_reason_v1 check(
    reason is null or (
      char_length(reason) <= 1000
      and translate(reason,E'\n\r\t','') !~ '[[:cntrl:]]'
    )
  ),
  constraint course_design_parameter_changes_channel_v1 check(
    channel in ('application','mcp','migration')
  )
);
create index course_design_parameter_changes_resolution_v1_idx
  on private.course_design_parameter_changes(
    course_id, parameter_id, scope_kind, scope_ref,
    course_revision desc, id desc
  );

create table private.course_authoring_guidance_revisions (
  id bigint generated always as identity primary key,
  revision_id uuid not null unique,
  course_id uuid not null references public.courses(id) on delete cascade,
  course_revision bigint not null,
  scope_kind text not null,
  scope_ref text not null,
  action text not null,
  guidance text,
  origin text,
  reason text,
  actor_id uuid references auth.users(id) on delete set null,
  channel text not null,
  created_at timestamptz not null default now(),
  constraint course_authoring_guidance_revisions_revision_v1 check(
    course_revision > 0
  ),
  constraint course_authoring_guidance_revisions_scope_v1 check(
    scope_kind in ('course','module','lesson','didactic_microsequence')
    and nullif(btrim(scope_ref),'') is not null
    and scope_ref = btrim(scope_ref)
    and char_length(scope_ref) <= 240
    and scope_ref !~ '[[:cntrl:]]'
  ),
  constraint course_authoring_guidance_revisions_action_v1 check(
    (action = 'set' and nullif(btrim(guidance),'') is not null
      and origin in ('migration','automatic','author','research_condition')
      and nullif(btrim(reason),'') is not null)
    or (action = 'clear' and guidance is null and origin is null and reason is null)
  ),
  constraint course_authoring_guidance_revisions_text_v1 check(
    guidance is null or (
      (
        (origin = 'migration' and char_length(guidance) <= 16384)
        or (origin <> 'migration' and octet_length(guidance) <= 8192)
      )
      and translate(guidance,E'\n\r\t','') !~ '[[:cntrl:]]'
    )
  ),
  constraint course_authoring_guidance_revisions_reason_v1 check(
    reason is null or (
      char_length(reason) <= 1000
      and translate(reason,E'\n\r\t','') !~ '[[:cntrl:]]'
    )
  ),
  constraint course_authoring_guidance_revisions_channel_v1 check(
    channel in ('application','mcp','migration')
  )
);
create index course_authoring_guidance_revisions_resolution_v1_idx
  on private.course_authoring_guidance_revisions(
    course_id, scope_kind, scope_ref, course_revision desc, id desc
  );

create table private.course_authoring_guidance_interpretations (
  id bigint generated always as identity primary key,
  course_id uuid not null references public.courses(id) on delete cascade,
  course_revision bigint not null,
  guidance_revision_id uuid not null references
    private.course_authoring_guidance_revisions(revision_id) on delete cascade,
  interpretation jsonb not null,
  actor_id uuid references auth.users(id) on delete set null,
  channel text not null,
  created_at timestamptz not null default now(),
  constraint course_authoring_guidance_interpretations_revision_v1 check(
    course_revision > 0
  ),
  constraint course_authoring_guidance_interpretations_payload_v1 check(
    jsonb_typeof(interpretation) = 'object'
    and octet_length(interpretation::text) <= 8192
  ),
  constraint course_authoring_guidance_interpretations_channel_v1 check(
    channel in ('application','mcp')
  )
);
create index course_authoring_guidance_interpretations_current_v1_idx
  on private.course_authoring_guidance_interpretations(
    guidance_revision_id, course_revision desc, id desc
  );

create table private.course_component_policy_changes (
  id bigint generated always as identity primary key,
  course_id uuid not null references public.courses(id) on delete cascade,
  course_revision bigint not null,
  scope_kind text not null,
  scope_ref text not null,
  action text not null,
  policy jsonb,
  origin text,
  reason text,
  actor_id uuid references auth.users(id) on delete set null,
  channel text not null,
  created_at timestamptz not null default now(),
  constraint course_component_policy_changes_revision_v1 check(course_revision > 0),
  constraint course_component_policy_changes_scope_v1 check(
    scope_kind in ('course','module','lesson','didactic_microsequence')
    and nullif(btrim(scope_ref),'') is not null
    and scope_ref = btrim(scope_ref)
    and char_length(scope_ref) <= 240
    and scope_ref !~ '[[:cntrl:]]'
  ),
  constraint course_component_policy_changes_action_v1 check(
    (action = 'set' and policy is not null
      and origin in ('automatic','author','research_condition')
      and nullif(btrim(reason),'') is not null)
    or (action = 'clear' and policy is null and origin is null and reason is null)
  ),
  constraint course_component_policy_changes_payload_v1 check(
    policy is null or (
      jsonb_typeof(policy) = 'object'
      and octet_length(policy::text) <= 4096
    )
  ),
  constraint course_component_policy_changes_reason_v1 check(
    reason is null or (
      char_length(reason) <= 1000
      and translate(reason,E'\n\r\t','') !~ '[[:cntrl:]]'
    )
  ),
  constraint course_component_policy_changes_channel_v1 check(
    channel in ('application','mcp')
  )
);
create index course_component_policy_changes_resolution_v1_idx
  on private.course_component_policy_changes(
    course_id, scope_kind, scope_ref, course_revision desc, id desc
  );

create trigger course_design_parameter_changes_append_only_v1
before update on private.course_design_parameter_changes
for each row execute function private.reject_course_design_update_v1();
create trigger course_authoring_guidance_revisions_append_only_v1
before update on private.course_authoring_guidance_revisions
for each row execute function private.reject_course_design_update_v1();
create trigger course_authoring_guidance_interpretations_append_only_v1
before update on private.course_authoring_guidance_interpretations
for each row execute function private.reject_course_design_update_v1();
create trigger course_component_policy_changes_append_only_v1
before update on private.course_component_policy_changes
for each row execute function private.reject_course_design_update_v1();

revoke all on table private.course_design_parameter_definitions,
  private.course_design_target_plan_items,
  private.course_design_parameter_changes,
  private.course_authoring_guidance_revisions,
  private.course_authoring_guidance_interpretations,
  private.course_component_policy_changes
from public, anon, authenticated, service_role;

create function private.course_design_json_hash_v1(p_value jsonb)
returns text
language sql
immutable
security definer
set search_path = pg_catalog, extensions
as $function$
  select encode(
    extensions.digest(convert_to(p_value::text, 'UTF8'), 'sha256'),
    'hex'
  )
$function$;

create function private.valid_course_design_parameter_value_v1(
  p_parameter_id text,
  p_value jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_kind text;
  v_allowed jsonb;
begin
  select definition.value_kind,
    definition.definition#>'{valueSchema,allowedValues}'
  into v_kind, v_allowed
  from private.course_design_parameter_definitions definition
  where definition.parameter_id = p_parameter_id;
  if not found or p_value is null or octet_length(p_value::text) > 4096 then
    return false;
  end if;
  if v_kind = 'integer' then
    return jsonb_typeof(p_value) = 'number'
      and p_value#>>'{}' ~ '^[0-9]+$'
      and (p_value#>>'{}')::integer between 1 and 64;
  end if;
  return jsonb_typeof(p_value) = 'array'
    and jsonb_array_length(p_value) between 1 and jsonb_array_length(v_allowed)
    and not exists(
      select 1
      from jsonb_array_elements(p_value) item(value)
      where jsonb_typeof(item.value) <> 'string'
        or not (v_allowed ? (item.value#>>'{}'))
    )
    and (
      select count(*) = count(distinct item.value#>>'{}')
      from jsonb_array_elements(p_value) item(value)
    );
exception when others then
  return false;
end;
$function$;

create function private.canonical_course_design_parameter_value_v1(
  p_parameter_id text,
  p_value jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select case
    when definition.value_kind = 'integer' then p_value
    else (
      select jsonb_agg(allowed.value order by allowed.ordinal)
      from jsonb_array_elements_text(
        definition.definition#>'{valueSchema,allowedValues}'
      ) with ordinality allowed(value, ordinal)
      where p_value ? allowed.value
    )
  end
  from private.course_design_parameter_definitions definition
  where definition.parameter_id = p_parameter_id
$function$;

create function private.valid_course_guidance_interpretation_v1(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $function$
begin
  return jsonb_typeof(p_value) = 'object'
    and p_value ?& array['summary','directives','divergences','questions']
    and p_value - 'summary' - 'directives' - 'divergences' - 'questions'
      = '{}'::jsonb
    and jsonb_typeof(p_value->'summary') = 'string'
    and nullif(btrim(p_value->>'summary'),'') is not null
    and p_value->>'summary' = btrim(p_value->>'summary')
    and char_length(p_value->>'summary') <= 1000
    and translate(p_value->>'summary',E'\n\r\t','') !~ '[[:cntrl:]]'
    and jsonb_typeof(p_value->'directives') = 'array'
    and jsonb_array_length(p_value->'directives') <= 16
    and not exists(
      select 1
      from jsonb_array_elements(p_value->'directives') directive(value)
      where jsonb_typeof(directive.value) <> 'object'
        or directive.value ?& array['kind','statement'] is not true
        or directive.value - 'kind' - 'statement' <> '{}'::jsonb
        or directive.value->>'kind' not in ('require','avoid','prefer')
        or jsonb_typeof(directive.value->'statement') <> 'string'
        or nullif(btrim(directive.value->>'statement'),'') is null
        or directive.value->>'statement'
          <> btrim(directive.value->>'statement')
        or char_length(directive.value->>'statement') > 500
        or translate(directive.value->>'statement',E'\n\r\t','')
          ~ '[[:cntrl:]]'
    )
    and (
      select count(*) = count(distinct (
        directive.value->>'kind', directive.value->>'statement'
      ))
      from jsonb_array_elements(p_value->'directives') directive(value)
    )
    and jsonb_typeof(p_value->'divergences') = 'array'
    and jsonb_array_length(p_value->'divergences') <= 16
    and jsonb_typeof(p_value->'questions') = 'array'
    and jsonb_array_length(p_value->'questions') <= 16
    and not exists(
      select 1 from (
        select item.value, 'divergence' as kind
        from jsonb_array_elements(p_value->'divergences') item(value)
        union all
        select item.value, 'question'
        from jsonb_array_elements(p_value->'questions') item(value)
      ) item
      where jsonb_typeof(item.value) <> 'string'
        or nullif(btrim(item.value#>>'{}'),'') is null
        or item.value#>>'{}' <> btrim(item.value#>>'{}')
        or char_length(item.value#>>'{}') > 500
        or translate(item.value#>>'{}',E'\n\r\t','') ~ '[[:cntrl:]]'
    )
    and (
      select count(*) = count(distinct item.value#>>'{}')
      from jsonb_array_elements(p_value->'divergences') item(value)
    )
    and (
      select count(*) = count(distinct item.value#>>'{}')
      from jsonb_array_elements(p_value->'questions') item(value)
    )
    and octet_length(p_value::text) <= 8192;
exception when others then
  return false;
end;
$function$;

alter table private.course_authoring_guidance_interpretations
  add constraint course_authoring_guidance_interpretations_shape_v1 check(
    private.valid_course_guidance_interpretation_v1(interpretation)
  );

create function private.valid_course_component_policy_v1(p_policy jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_catalog jsonb := private.course_component_catalog_v1();
begin
  return jsonb_typeof(p_policy) = 'object'
    and p_policy ?& array[
      'catalogVersion','availability','allowedRefs',
      'excludedRefs','preferredRefs'
    ]
    and p_policy - 'catalogVersion' - 'availability' - 'allowedRefs'
      - 'excludedRefs' - 'preferredRefs' = '{}'::jsonb
    and p_policy->>'catalogVersion' = v_catalog->>'version'
    and p_policy->>'availability' in ('all','allow_only')
    and jsonb_typeof(p_policy->'allowedRefs') = 'array'
    and jsonb_typeof(p_policy->'excludedRefs') = 'array'
    and jsonb_typeof(p_policy->'preferredRefs') = 'array'
    and jsonb_array_length(p_policy->'allowedRefs') <= 32
    and jsonb_array_length(p_policy->'excludedRefs') <= 32
    and jsonb_array_length(p_policy->'preferredRefs') <= 32
    and (
      (p_policy->>'availability' = 'all'
        and jsonb_array_length(p_policy->'allowedRefs') = 0)
      or (p_policy->>'availability' = 'allow_only'
        and jsonb_array_length(p_policy->'allowedRefs') > 0)
    )
    and not exists(
      select 1
      from (
        select value from jsonb_array_elements(p_policy->'allowedRefs')
        union all
        select value from jsonb_array_elements(p_policy->'excludedRefs')
        union all
        select value from jsonb_array_elements(p_policy->'preferredRefs')
      ) reference
      where jsonb_typeof(reference.value) <> 'string'
        or not exists(
          select 1
          from jsonb_array_elements(v_catalog->'options') option(value)
          where option.value->>'ref' = reference.value#>>'{}'
        )
    )
    and (
      select count(*) = count(distinct value#>>'{}')
      from jsonb_array_elements(p_policy->'allowedRefs')
    )
    and (
      select count(*) = count(distinct value#>>'{}')
      from jsonb_array_elements(p_policy->'excludedRefs')
    )
    and (
      select count(*) = count(distinct value#>>'{}')
      from jsonb_array_elements(p_policy->'preferredRefs')
    )
    and not exists(
      select 1
      from jsonb_array_elements_text(p_policy->'allowedRefs') allowed(value)
      join jsonb_array_elements_text(p_policy->'excludedRefs') excluded(value)
        on excluded.value = allowed.value
    )
    and not exists(
      select 1
      from jsonb_array_elements_text(p_policy->'preferredRefs') preferred(value)
      join jsonb_array_elements_text(p_policy->'excludedRefs') excluded(value)
        on excluded.value = preferred.value
    )
    and (
      p_policy->>'availability' = 'all'
      or not exists(
        select 1
        from jsonb_array_elements_text(p_policy->'preferredRefs') preferred(value)
        where not (p_policy->'allowedRefs' ? preferred.value)
      )
    )
    and octet_length(p_policy::text) <= 4096;
exception when others then
  return false;
end;
$function$;

alter table private.course_component_policy_changes
  add constraint course_component_policy_changes_shape_v1 check(
    policy is null or private.valid_course_component_policy_v1(policy)
  );

create function private.course_design_scope_path_v1(
  p_course_id uuid,
  p_scope_kind text,
  p_scope_ref text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_course public.courses%rowtype;
  v_module private.course_entities%rowtype;
  v_lesson private.course_entities%rowtype;
  v_microsequence private.course_entities%rowtype;
begin
  if p_course_id is null or p_scope_kind not in (
       'course','module','lesson','didactic_microsequence'
     )
     or nullif(btrim(p_scope_ref),'') is null
     or p_scope_ref <> btrim(p_scope_ref)
     or char_length(p_scope_ref) > 240
     or p_scope_ref ~ '[[:cntrl:]]' then
    return null;
  end if;
  select * into v_course
  from public.courses course where course.id = p_course_id;
  if not found then return null; end if;
  if p_scope_kind = 'course' then
    if p_scope_ref <> p_course_id::text then return null; end if;
    return jsonb_build_array(jsonb_build_object(
      'kind','course','ref',p_course_id::text,'label',v_course.title
    ));
  end if;

  if p_scope_kind = 'module' then
    select * into v_module
    from private.course_entities entity
    where entity.course_id = p_course_id
      and entity.entity_type = 'module'
      and entity.entity_id = p_scope_ref;
  elsif p_scope_kind = 'lesson' then
    select * into v_lesson
    from private.course_entities entity
    where entity.course_id = p_course_id
      and entity.entity_type = 'lesson'
      and entity.entity_id = p_scope_ref;
    if found then
      select * into v_module
      from private.course_entities entity
      where entity.course_id = p_course_id
        and entity.entity_type = 'module'
        and entity.entity_id = v_lesson.parent_id;
    end if;
  else
    select * into v_microsequence
    from private.course_entities entity
    where entity.course_id = p_course_id
      and entity.entity_type = 'microsequence'
      and entity.entity_id = p_scope_ref;
    if found then
      select * into v_lesson
      from private.course_entities entity
      where entity.course_id = p_course_id
        and entity.entity_type = 'lesson'
        and entity.entity_id = v_microsequence.parent_id;
      if found then
        select * into v_module
        from private.course_entities entity
        where entity.course_id = p_course_id
          and entity.entity_type = 'module'
          and entity.entity_id = v_lesson.parent_id;
      end if;
    end if;
  end if;
  if v_module.course_id is null
     or (p_scope_kind in ('lesson','didactic_microsequence')
       and v_lesson.course_id is null)
     or (p_scope_kind = 'didactic_microsequence'
       and v_microsequence.course_id is null) then
    return null;
  end if;
  return jsonb_build_array(jsonb_build_object(
      'kind','course','ref',p_course_id::text,'label',v_course.title
    ),jsonb_build_object(
      'kind','module','ref',v_module.entity_id,
      'label',v_module.content->>'title'
    ))
    || case when v_lesson.course_id is null then '[]'::jsonb
      else jsonb_build_array(jsonb_build_object(
        'kind','lesson','ref',v_lesson.entity_id,
        'label',v_lesson.content->>'title'
      )) end
    || case when v_microsequence.course_id is null then '[]'::jsonb
      else jsonb_build_array(jsonb_build_object(
        'kind','didactic_microsequence','ref',v_microsequence.entity_id,
        'label',v_microsequence.content->>'title'
      )) end;
end;
$function$;

create function private.course_design_scope_context_v1(
  p_course_id uuid,
  p_scope_kind text,
  p_scope_ref text,
  p_child_limit integer,
  p_child_cursor text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_path jsonb;
  v_parent_type text;
  v_parent_id text;
  v_child_type text;
  v_cursor_position integer;
  v_children jsonb;
  v_child_count integer;
  v_has_more boolean;
  v_next_cursor text;
begin
  v_path := private.course_design_scope_path_v1(
    p_course_id,p_scope_kind,p_scope_ref
  );
  if v_path is null or p_child_limit not between 1 and 64
     or (p_child_cursor is not null and (
       nullif(btrim(p_child_cursor),'') is null
       or p_child_cursor <> btrim(p_child_cursor)
       or char_length(p_child_cursor) > 240
       or p_child_cursor ~ '[[:cntrl:]]'
     )) then
    raise exception 'Navegação do escopo de desenho inválida.'
      using errcode = '22023';
  end if;
  v_child_type := case p_scope_kind
    when 'course' then 'module'
    when 'module' then 'lesson'
    when 'lesson' then 'microsequence'
    else null
  end;
  v_parent_type := case p_scope_kind
    when 'course' then null
    when 'didactic_microsequence' then 'microsequence'
    else p_scope_kind
  end;
  v_parent_id := case when p_scope_kind = 'course' then null else p_scope_ref end;

  if p_child_cursor is not null then
    select entity.position into v_cursor_position
    from private.course_entities entity
    where entity.course_id = p_course_id
      and entity.entity_type = v_child_type
      and entity.entity_id = p_child_cursor
      and entity.parent_type is not distinct from v_parent_type
      and entity.parent_id is not distinct from v_parent_id;
    if not found then
      raise exception 'Cursor de filho não pertence ao escopo.'
        using errcode = '22023';
    end if;
  end if;

  select count(*)::integer into v_child_count
  from private.course_entities entity
  where v_child_type is not null
    and entity.course_id = p_course_id
    and entity.entity_type = v_child_type
    and entity.parent_type is not distinct from v_parent_type
    and entity.parent_id is not distinct from v_parent_id;

  with candidates as (
    select entity.*
    from private.course_entities entity
    where v_child_type is not null
      and entity.course_id = p_course_id
      and entity.entity_type = v_child_type
      and entity.parent_type is not distinct from v_parent_type
      and entity.parent_id is not distinct from v_parent_id
      and (
        p_child_cursor is null
        or (entity.position,entity.entity_id)
          > (v_cursor_position,p_child_cursor)
      )
    order by entity.position,entity.entity_id
    limit p_child_limit + 1
  ), page as (
    select * from candidates
    order by position,entity_id limit p_child_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'kind',case page.entity_type
        when 'microsequence' then 'didactic_microsequence'
        else page.entity_type end,
      'ref',page.entity_id,
      'label',page.content->>'title',
      'position',page.position
    ) order by page.position,page.entity_id),'[]'::jsonb),
    exists(select 1 from candidates offset p_child_limit),
    (select entity_id from page order by position desc,entity_id desc limit 1)
  into v_children,v_has_more,v_next_cursor
  from page;

  return jsonb_build_object(
    'current',v_path->(jsonb_array_length(v_path)-1),
    'ancestors',v_path - (jsonb_array_length(v_path)-1),
    'children',v_children,
    'childCount',v_child_count,
    'hasMoreChildren',coalesce(v_has_more,false),
    'nextChildCursor',case when v_has_more then v_next_cursor else null end
  );
end;
$function$;

create function private.course_component_refs_from_content_v1(p_content jsonb)
returns text[]
language sql
immutable
set search_path = pg_catalog
as $function$
  with recursive nodes(value) as (
    select p_content
    union all
    select child.value
    from nodes node
    cross join lateral (
      select object_child.value
      from jsonb_each(
        case when jsonb_typeof(node.value) = 'object'
          then node.value else '{}'::jsonb end
      ) object_child
      union all
      select array_child.value
      from jsonb_array_elements(
        case when jsonb_typeof(node.value) = 'array'
          then node.value else '[]'::jsonb end
      ) array_child
    ) child
  )
  select coalesce(array_agg(distinct (
    (node.value->>'package') || '@' || (node.value->>'version')
  ) order by (
    (node.value->>'package') || '@' || (node.value->>'version')
  )),'{}'::text[])
  from nodes node
  where jsonb_typeof(node.value) = 'object'
    and jsonb_typeof(node.value->'package') = 'string'
    and jsonb_typeof(node.value->'version') = 'string'
$function$;

create function private.course_component_policy_allows_v1(
  p_policy jsonb,
  p_ref text
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $function$
  select not (p_policy->'excludedRefs' ? p_ref)
    and (
      p_policy->>'availability' = 'all'
      or p_policy->'allowedRefs' ? p_ref
    )
$function$;

create function private.valid_course_component_refs_in_content_v1(
  p_content jsonb
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  with recursive nodes(value) as (
    select p_content
    union all
    select child.value
    from nodes node
    cross join lateral (
      select object_child.value
      from jsonb_each(
        case when jsonb_typeof(node.value) = 'object'
          then node.value else '{}'::jsonb end
      ) object_child
      union all
      select array_child.value
      from jsonb_array_elements(
        case when jsonb_typeof(node.value) = 'array'
          then node.value else '[]'::jsonb end
      ) array_child
    ) child
  )
  select not exists(
    select 1
    from nodes node
    where jsonb_typeof(node.value) = 'object'
      and node.value ? 'package'
      and (
        jsonb_typeof(node.value->'package') <> 'string'
        or jsonb_typeof(node.value->'version') <> 'string'
        or not exists(
          select 1
          from jsonb_array_elements(
            private.course_component_catalog_v1()->'options'
          ) option(value)
          where option.value->>'ref' = (
            (node.value->>'package') || '@' || (node.value->>'version')
          )
        )
      )
  )
$function$;


-- Orientação anterior preserva texto e proveniência sem permanecer no plano.
insert into private.course_authoring_guidance_revisions(
  revision_id, course_id, course_revision, scope_kind, scope_ref,
  action, guidance, origin, reason, actor_id, channel, created_at
)
select extensions.gen_random_uuid(), plan.course_id, course.revision,
  'course', plan.course_id::text, 'set', plan.authoring_guidance,
  'migration', 'Orientação preservada pelo corte #122.',
  course.owner_id, 'migration', plan.updated_at
from private.course_instructional_plans plan
join public.courses course on course.id = plan.course_id
where plan.authoring_guidance ~ '[^[:space:]]';

create or replace function private.course_instructional_plan_command_document_v1(
  p_course_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  select jsonb_build_object(
    'id', plan.id,
    'title', course.title,
    'objective', course.goal,
    'audience', plan.audience,
    'scope', plan.instructional_scope,
    'preferredPartCount', jsonb_build_object(
      'minimum', plan.preferred_authoring_part_min,
      'maximum', plan.preferred_authoring_part_max,
      'origin', plan.part_count_origin
    ),
    'intendedLearningOutcomes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id,
        'position', item.position,
        'statement', item.statement
      ) order by item.position, item.id)
      from private.course_instructional_plan_items item
      where item.instructional_plan_id = plan.id
        and item.item_kind = 'intended_learning_outcome'
    ), '[]'::jsonb),
    'instructionalAnalysisUnits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id,
        'position', item.position,
        'statement', item.statement
      ) order by item.position, item.id)
      from private.course_instructional_plan_items item
      where item.instructional_plan_id = plan.id
        and item.item_kind = 'instructional_analysis_unit'
    ), '[]'::jsonb),
    'evidenceRequirements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id,
        'position', item.position,
        'statement', item.statement
      ) order by item.position, item.id)
      from private.course_instructional_plan_items item
      where item.instructional_plan_id = plan.id
        and item.item_kind = 'evidence_requirement'
    ), '[]'::jsonb),
    'parts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', part.id,
        'position', part.position,
        'title', part.title,
        'intent', part.intent,
        'microsequenceIds', coalesce((
          select jsonb_agg(
            membership.didactic_microsequence_id
            order by membership.production_position,
              membership.didactic_microsequence_id
          )
          from private.course_authoring_part_didactic_microsequences membership
          where membership.course_id = part.course_id
            and membership.authoring_part_id = part.id
        ), '[]'::jsonb)
      ) order by part.position, part.id)
      from private.course_authoring_parts part
      where part.instructional_plan_id = plan.id
        and part.retired_at is null
    ), '[]'::jsonb)
  )
  from public.courses course
  join private.course_instructional_plans plan on plan.course_id = course.id
  where course.id = p_course_id
$function$;

create or replace function private.get_course_instructional_plan_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_recent_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_course public.courses%rowtype;
  v_plan private.course_instructional_plans%rowtype;
  v_outcomes jsonb;
  v_analysis_units jsonb;
  v_evidence_requirements jsonb;
  v_parts jsonb;
  v_recent jsonb;
  v_counts jsonb;
  v_result jsonb;
begin
  perform private.require_course_access_v1(p_course_id, p_actor_id, true);
  if p_recent_limit is null or p_recent_limit not between 0 and 50 then
    raise exception 'Limite de atividade recente inválido.' using errcode = '22023';
  end if;
  select * into strict v_course
  from public.courses course where course.id = p_course_id;
  select * into strict v_plan
  from private.course_instructional_plans plan
  where plan.course_id = p_course_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', item.id,
    'position', item.position,
    'statement', item.statement,
    'version', item.version
  ) order by item.position, item.id), '[]'::jsonb)
  into v_outcomes
  from private.course_instructional_plan_items item
  where item.instructional_plan_id = v_plan.id
    and item.item_kind = 'intended_learning_outcome';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', item.id,
    'position', item.position,
    'statement', item.statement,
    'version', item.version
  ) order by item.position, item.id), '[]'::jsonb)
  into v_analysis_units
  from private.course_instructional_plan_items item
  where item.instructional_plan_id = v_plan.id
    and item.item_kind = 'instructional_analysis_unit';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', item.id,
    'position', item.position,
    'statement', item.statement,
    'version', item.version
  ) order by item.position, item.id), '[]'::jsonb)
  into v_evidence_requirements
  from private.course_instructional_plan_items item
  where item.instructional_plan_id = v_plan.id
    and item.item_kind = 'evidence_requirement';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', part.id,
    'position', part.position,
    'title', part.title,
    'intent', part.intent,
    'version', part.version,
    'microsequences', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', microsequence.entity_id,
        'productionPosition', membership.production_position,
        'title', coalesce(
          nullif(microsequence.content->>'title', ''), microsequence.entity_id
        ),
        'curriculumPath', jsonb_build_object(
          'moduleId', module_value.entity_id,
          'moduleTitle', coalesce(
            nullif(module_value.content->>'title', ''), module_value.entity_id
          ),
          'lessonId', lesson.entity_id,
          'lessonTitle', coalesce(
            nullif(lesson.content->>'title', ''), lesson.entity_id
          )
        ),
        'studyUnitCount', (
          select count(*)::integer
          from private.course_entities study_unit
          where study_unit.course_id = microsequence.course_id
            and study_unit.entity_type = 'study_unit'
            and study_unit.parent_type = 'microsequence'
            and study_unit.parent_id = microsequence.entity_id
        )
      ) order by membership.production_position,
        membership.didactic_microsequence_id)
      from private.course_authoring_part_didactic_microsequences membership
      join private.course_entities microsequence
        on microsequence.course_id = membership.course_id
       and microsequence.entity_type = 'microsequence'
       and microsequence.entity_id = membership.didactic_microsequence_id
      join private.course_entities lesson
        on lesson.course_id = microsequence.course_id
       and lesson.entity_type = 'lesson'
       and lesson.entity_id = microsequence.parent_id
      join private.course_entities module_value
        on module_value.course_id = lesson.course_id
       and module_value.entity_type = 'module'
       and module_value.entity_id = lesson.parent_id
      where membership.course_id = part.course_id
        and membership.authoring_part_id = part.id
    ), '[]'::jsonb),
    'progress', private.course_authoring_part_progress_v1(
      part.course_id, part.id
    )
  ) order by part.position, part.id), '[]'::jsonb)
  into v_parts
  from private.course_authoring_parts part
  where part.instructional_plan_id = v_plan.id
    and part.retired_at is null;

  select jsonb_build_object(
    'intendedLearningOutcomeCount', jsonb_array_length(v_outcomes),
    'instructionalAnalysisUnitCount', jsonb_array_length(v_analysis_units),
    'evidenceRequirementCount', jsonb_array_length(v_evidence_requirements),
    'authoringPartCount', jsonb_array_length(v_parts),
    'linkedDidacticMicrosequenceCount', count(distinct membership.didactic_microsequence_id)::integer,
    'studyUnitCount', count(distinct study_unit.entity_id)::integer
  ) into v_counts
  from private.course_authoring_parts part
  left join private.course_authoring_part_didactic_microsequences membership
    on membership.course_id = part.course_id
   and membership.authoring_part_id = part.id
  left join private.course_entities study_unit
    on study_unit.course_id = membership.course_id
   and study_unit.entity_type = 'study_unit'
   and study_unit.parent_type = 'microsequence'
   and study_unit.parent_id = membership.didactic_microsequence_id
  where part.instructional_plan_id = v_plan.id
    and part.retired_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'eventId', activity.id::text,
    'revision', activity.revision,
    'kind', activity.summary->>'activityKind',
    'channel', activity.summary->>'channel',
    'instructionalPlanItemId', nullif(
      activity.summary->>'instructionalPlanItemId', ''
    )::uuid,
    'partId', nullif(activity.summary->>'authoringPartId', '')::uuid,
    'materializationId', nullif(activity.summary->>'materializationId', '')::uuid,
    'createdAt', activity.created_at
  ) order by activity.created_at desc, activity.id desc), '[]'::jsonb)
  into v_recent
  from (
    select event_value.*
    from private.course_events event_value
    where event_value.course_id = p_course_id
      and event_value.operation in (
        'update_course_instructional_plan',
        'advance_course_authoring_part_materialization'
      )
    order by event_value.created_at desc, event_value.id desc
    limit p_recent_limit
  ) activity;

  v_result := jsonb_build_object(
    'contract', 'aralearn.course-instructional-plan.v1',
    'courseId', v_course.id,
    'courseRevision', v_course.revision,
    'plan', jsonb_build_object(
      'id', v_plan.id,
      'version', v_plan.version,
      'title', v_course.title,
      'objective', v_course.goal,
      'audience', v_plan.audience,
      'scope', v_plan.instructional_scope,
      'preferredPartCount', jsonb_build_object(
        'minimum', v_plan.preferred_authoring_part_min,
        'maximum', v_plan.preferred_authoring_part_max,
        'origin', v_plan.part_count_origin
      ),
      'intendedLearningOutcomes', v_outcomes,
      'instructionalAnalysisUnits', v_analysis_units,
      'evidenceRequirements', v_evidence_requirements,
      'parts', v_parts,
      'counts', v_counts,
      'updatedAt', v_plan.updated_at
    ),
    'recentActivity', v_recent
  );
  if octet_length(v_result::text) > 1835008 then
    raise exception 'Planejamento excede o limite de leitura.'
      using errcode = '54000';
  end if;
  return v_result;
end;
$function$;

create or replace function public.commit_course_instructional_plan_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_course_revision bigint,
  p_expected_plan_version bigint,
  p_command jsonb,
  p_plan jsonb,
  p_channel text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $function$
declare
  v_hash text;
  v_receipt private.course_change_receipts%rowtype;
  v_course public.courses%rowtype;
  v_plan private.course_instructional_plans%rowtype;
  v_current jsonb;
  v_changed boolean;
  v_result jsonb;
  v_command_type text;
  v_outcome_count integer;
  v_analysis_count integer;
  v_evidence_count integer;
  v_part_count integer;
  v_microsequence_count integer;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id, p_actor_id, true);
  v_command_type := p_command->>'type';
  -- Replay é resolvido pelo comando fechado antes de validar/reconstruir o
  -- alvo. Assim uma resposta perdida continua reproduzível mesmo que outra
  -- mutação já tenha avançado o plano e o chamador não retenha o alvo antigo.
  if p_expected_course_revision is not null
     and p_expected_plan_version is not null
     and p_channel in ('application', 'mcp')
     and p_request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     and jsonb_typeof(p_command) = 'object' then
    v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
      'courseId', p_course_id,
      'expectedCourseRevision', p_expected_course_revision,
      'expectedPlanVersion', p_expected_plan_version,
      'channel', p_channel,
      'command', p_command
    )::text, 'UTF8'), 'sha256'), 'hex');
    perform pg_advisory_xact_lock(hashtextextended(
      'course-change-request:' || p_actor_id::text || ':' || p_request_id, 0
    ));
    delete from private.course_change_receipts receipt
    where receipt.actor_id = p_actor_id
      and receipt.request_id = p_request_id
      and receipt.expires_at <= statement_timestamp();
    select * into v_receipt
    from private.course_change_receipts receipt
    where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
    if found then
      if v_receipt.operation <> 'commit_instructional_plan'
         or v_receipt.course_id <> p_course_id
         or v_receipt.request_hash <> v_hash then
        raise exception 'requestId reutilizado com comando incompatível.'
          using errcode = '23514';
      end if;
      return (v_receipt.result - 'idempotent') || jsonb_build_object(
        'idempotent', true
      );
    end if;
  end if;
  if p_expected_course_revision is null or p_expected_course_revision < 1
     or p_expected_plan_version is null or p_expected_plan_version < 1
     or p_channel not in ('application', 'mcp')
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or jsonb_typeof(p_command) is distinct from 'object'
     or pg_column_size(p_command) > 32768
     or v_command_type not in (
       'update_plan',
       'add_plan_item', 'update_plan_item', 'remove_plan_item',
       'reorder_plan_items',
       'add_part', 'update_part', 'remove_part', 'reorder_parts',
       'split_part', 'join_parts',
       'assign_microsequence', 'move_microsequence', 'remove_microsequence'
     )
     or jsonb_typeof(p_plan) is distinct from 'object'
     or octet_length(p_plan::text) > 524288
     or not (p_plan ?& array[
       'id', 'title', 'objective', 'audience', 'scope',
       'preferredPartCount',
       'intendedLearningOutcomes', 'instructionalAnalysisUnits',
       'evidenceRequirements', 'parts'
     ])
     or p_plan
       - 'id' - 'title' - 'objective' - 'audience' - 'scope'
       - 'preferredPartCount'
       - 'intendedLearningOutcomes' - 'instructionalAnalysisUnits'
       - 'evidenceRequirements' - 'parts' <> '{}'::jsonb then
    raise exception 'Commit do plano instrucional inválido.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_plan->'id') is distinct from 'string'
     or (p_plan->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or jsonb_typeof(p_plan->'title') is distinct from 'string'
     or coalesce(p_plan->>'title' ~ '[^[:space:]]', false) is not true
     or char_length(btrim(p_plan->>'title')) > 300
     or translate(p_plan->>'title', E'\n\r\t', '') ~ '[[:cntrl:]]'
     or jsonb_typeof(p_plan->'objective') is distinct from 'string'
     or coalesce(p_plan->>'objective' ~ '[^[:space:]]', false) is not true
     or char_length(btrim(p_plan->>'objective')) > 2000
     or translate(p_plan->>'objective', E'\n\r\t', '') ~ '[[:cntrl:]]'
     or jsonb_typeof(p_plan->'audience') is distinct from 'string'
     or char_length(p_plan->>'audience') > 4000
     or jsonb_typeof(p_plan->'scope') is distinct from 'string'
     or char_length(p_plan->>'scope') > 8000
     or jsonb_typeof(p_plan->'preferredPartCount') is distinct from 'object'
     or not (p_plan->'preferredPartCount' ?& array['minimum', 'maximum', 'origin'])
     or (p_plan->'preferredPartCount') - 'minimum' - 'maximum' - 'origin'
       <> '{}'::jsonb
     or jsonb_typeof(p_plan#>'{preferredPartCount,minimum}') is distinct from 'number'
     or jsonb_typeof(p_plan#>'{preferredPartCount,maximum}') is distinct from 'number'
     or (p_plan#>>'{preferredPartCount,minimum}') !~ '^[0-9]+$'
     or (p_plan#>>'{preferredPartCount,maximum}') !~ '^[0-9]+$'
     or (p_plan#>>'{preferredPartCount,minimum}')::integer not between 1 and 64
     or (p_plan#>>'{preferredPartCount,maximum}')::integer not between 1 and 64
     or (p_plan#>>'{preferredPartCount,minimum}')::integer
       > (p_plan#>>'{preferredPartCount,maximum}')::integer
     or p_plan#>>'{preferredPartCount,origin}' not in (
       'automatic', 'author', 'research_condition'
     )
     or jsonb_typeof(p_plan->'intendedLearningOutcomes') is distinct from 'array'
     or jsonb_typeof(p_plan->'instructionalAnalysisUnits') is distinct from 'array'
     or jsonb_typeof(p_plan->'evidenceRequirements') is distinct from 'array'
     or jsonb_typeof(p_plan->'parts') is distinct from 'array'
     or jsonb_array_length(p_plan->'intendedLearningOutcomes') > 256
     or jsonb_array_length(p_plan->'instructionalAnalysisUnits') > 256
     or jsonb_array_length(p_plan->'evidenceRequirements') > 256
     or jsonb_array_length(p_plan->'intendedLearningOutcomes')
       + jsonb_array_length(p_plan->'instructionalAnalysisUnits')
       + jsonb_array_length(p_plan->'evidenceRequirements') > 512
     or jsonb_array_length(p_plan->'parts') > 64 then
    raise exception 'Conteúdo do plano instrucional inválido.' using errcode = '22023';
  end if;

  if exists(
    with incoming as (
      select 'intended_learning_outcome'::text as item_kind,
        item.value, item.ordinal::integer - 1 as expected_position
      from jsonb_array_elements(p_plan->'intendedLearningOutcomes')
        with ordinality item(value, ordinal)
      union all
      select 'instructional_analysis_unit', item.value,
        item.ordinal::integer - 1
      from jsonb_array_elements(p_plan->'instructionalAnalysisUnits')
        with ordinality item(value, ordinal)
      union all
      select 'evidence_requirement', item.value,
        item.ordinal::integer - 1
      from jsonb_array_elements(p_plan->'evidenceRequirements')
        with ordinality item(value, ordinal)
    )
    select 1 from incoming
    where jsonb_typeof(value) is distinct from 'object'
      or value - 'id' - 'position' - 'statement' <> '{}'::jsonb
      or not (value ?& array['id', 'position', 'statement'])
      or jsonb_typeof(value->'id') is distinct from 'string'
      or (value->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(value->'position') is distinct from 'number'
      or value->>'position' !~ '^[0-9]+$'
      or (value->>'position')::integer <> expected_position
      or jsonb_typeof(value->'statement') is distinct from 'string'
      or coalesce(value->>'statement' ~ '[^[:space:]]', false) is not true
      or char_length(value->>'statement') > 2000
  ) or exists(
    with incoming as (
      select item.value->>'id' as id
      from jsonb_array_elements(p_plan->'intendedLearningOutcomes') item(value)
      union all
      select item.value->>'id'
      from jsonb_array_elements(p_plan->'instructionalAnalysisUnits') item(value)
      union all
      select item.value->>'id'
      from jsonb_array_elements(p_plan->'evidenceRequirements') item(value)
    )
    select 1 from incoming group by id having count(*) > 1
  ) then
    raise exception 'Item do plano instrucional inválido ou repetido.'
      using errcode = '22023';
  end if;

  if exists(
    select 1
    from jsonb_array_elements(p_plan->'parts')
      with ordinality part(value, ordinal)
    where jsonb_typeof(part.value) is distinct from 'object'
      or part.value - 'id' - 'position' - 'title' - 'intent'
        - 'microsequenceIds' <> '{}'::jsonb
      or not (part.value ?& array[
        'id', 'position', 'title', 'intent', 'microsequenceIds'
      ])
      or jsonb_typeof(part.value->'id') is distinct from 'string'
      or (part.value->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(part.value->'position') is distinct from 'number'
      or part.value->>'position' !~ '^[0-9]+$'
      or (part.value->>'position')::integer <> part.ordinal::integer - 1
      or jsonb_typeof(part.value->'title') is distinct from 'string'
      or coalesce(part.value->>'title' ~ '[^[:space:]]', false) is not true
      or char_length(btrim(part.value->>'title')) > 300
      or translate(part.value->>'title', E'\n\r\t', '') ~ '[[:cntrl:]]'
      or jsonb_typeof(part.value->'intent') is distinct from 'string'
      or char_length(part.value->>'intent') > 4000
      or jsonb_typeof(part.value->'microsequenceIds') is distinct from 'array'
      or jsonb_array_length(part.value->'microsequenceIds') > 64
      or exists(
        select 1
        from jsonb_array_elements(part.value->'microsequenceIds') micro(value)
        where jsonb_typeof(micro.value) is distinct from 'string'
          or nullif(btrim(micro.value#>>'{}'), '') is null
          or micro.value#>>'{}' <> btrim(micro.value#>>'{}')
          or char_length(micro.value#>>'{}') > 240
          or micro.value#>>'{}' ~ '[[:cntrl:]]'
      )
  ) or exists(
    select 1 from jsonb_array_elements(p_plan->'parts') part(value)
    group by part.value->>'id' having count(*) > 1
  ) or exists(
    select 1
    from jsonb_array_elements(p_plan->'parts') part(value)
    cross join lateral jsonb_array_elements_text(
      part.value->'microsequenceIds'
    ) micro(microsequence_id)
    group by micro.microsequence_id having count(*) > 1
  ) then
    raise exception 'Parte do plano instrucional inválida ou repetida.'
      using errcode = '22023';
  end if;
  if (
    select coalesce(sum(jsonb_array_length(part.value->'microsequenceIds')), 0)
    from jsonb_array_elements(p_plan->'parts') part(value)
  ) > 192 then
    raise exception 'O plano excede 192 vínculos de microssequência.'
      using errcode = '22023';
  end if;

  if exists(
    with incoming as (
      select item.value->>'id' as id
      from jsonb_array_elements(p_plan->'intendedLearningOutcomes') item(value)
      union all
      select item.value->>'id'
      from jsonb_array_elements(p_plan->'instructionalAnalysisUnits') item(value)
      union all
      select item.value->>'id'
      from jsonb_array_elements(p_plan->'evidenceRequirements') item(value)
    )
    select 1 from incoming
    join private.course_instructional_plan_items existing
      on existing.id = incoming.id::uuid
    where existing.course_id <> p_course_id
  ) or exists(
    select 1 from jsonb_array_elements(p_plan->'parts') part(value)
    join private.course_authoring_parts existing
      on existing.id = (part.value->>'id')::uuid
    where existing.course_id <> p_course_id
  ) or exists(
    select 1
    from jsonb_array_elements(p_plan->'parts') part(value)
    cross join lateral jsonb_array_elements_text(
      part.value->'microsequenceIds'
    ) micro(microsequence_id)
    left join private.course_entities entity
      on entity.course_id = p_course_id
     and entity.entity_type = 'microsequence'
     and entity.entity_id = micro.microsequence_id
    where entity.course_id is null
  ) then
    raise exception 'Identidade ou referência do plano pertence a outro contexto.'
      using errcode = '23514';
  end if;

  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'courseId', p_course_id,
    'expectedCourseRevision', p_expected_course_revision,
    'expectedPlanVersion', p_expected_plan_version,
    'channel', p_channel,
    'command', p_command
  )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:' || p_actor_id::text || ':' || p_request_id, 0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  with expired as materialized (
    select receipt.ctid from private.course_change_receipts receipt
    where receipt.expires_at <= statement_timestamp()
    order by receipt.expires_at, receipt.actor_id, receipt.request_id
    limit 100 for update skip locked
  )
  delete from private.course_change_receipts receipt
  using expired where receipt.ctid = expired.ctid;
  select * into v_receipt
  from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'commit_instructional_plan'
       or v_receipt.course_id <> p_course_id
       or v_receipt.request_hash <> v_hash then
      raise exception 'requestId reutilizado com comando incompatível.'
        using errcode = '23514';
    end if;
    return (v_receipt.result - 'idempotent') || jsonb_build_object(
      'idempotent', true
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'course-row:' || p_course_id::text, 0
  ));
  select * into strict v_course
  from public.courses course where course.id = p_course_id for update;
  select * into strict v_plan
  from private.course_instructional_plans plan
  where plan.course_id = p_course_id for update;
  if v_course.revision <> p_expected_course_revision
     or v_plan.version <> p_expected_plan_version then
    raise exception 'O Curso ou plano mudou; releia antes de salvar.'
      using errcode = '40001';
  end if;
  if v_plan.id <> (p_plan->>'id')::uuid then
    raise exception 'A identidade do plano não pode ser alterada.'
      using errcode = '23514';
  end if;
  v_current := private.course_instructional_plan_command_document_v1(
    p_course_id
  );
  v_changed := v_current is distinct from p_plan;

  if v_changed and exists(
    select 1
    from private.course_authoring_part_materializations materialization
    join private.course_authoring_parts part
      on part.course_id = materialization.course_id
     and part.id = materialization.authoring_part_id
    where materialization.course_id = p_course_id
      and materialization.status = 'running'
      and not exists(
        select 1
        from jsonb_array_elements(p_plan->'parts') candidate(value)
        where (candidate.value->>'id')::uuid = part.id
          and (candidate.value->>'position')::integer = part.position
          and btrim(candidate.value->>'title') = part.title
          and candidate.value->>'intent' = part.intent
          and candidate.value->'microsequenceIds' = coalesce((
            select jsonb_agg(
              membership.didactic_microsequence_id
              order by membership.production_position,
                membership.didactic_microsequence_id
            )
            from private.course_authoring_part_didactic_microsequences membership
            where membership.course_id = part.course_id
              and membership.authoring_part_id = part.id
          ), '[]'::jsonb)
      )
  ) then
    raise exception 'Uma Parte em materialização mudou; finalize ou marque a tentativa como falha antes de alterá-la.'
      using errcode = '40001';
  end if;

  if v_changed then
    update public.courses course
    set title = btrim(p_plan->>'title'),
        goal = btrim(p_plan->>'objective'),
        revision = course.revision + 1,
        updated_at = now()
    where course.id = p_course_id
    returning * into v_course;
    update private.course_instructional_plans plan
    set audience = p_plan->>'audience',
        instructional_scope = p_plan->>'scope',
        preferred_authoring_part_min =
          (p_plan#>>'{preferredPartCount,minimum}')::smallint,
        preferred_authoring_part_max =
          (p_plan#>>'{preferredPartCount,maximum}')::smallint,
        part_count_origin = p_plan#>>'{preferredPartCount,origin}',
        version = plan.version + 1,
        updated_at = now()
    where plan.id = v_plan.id
    returning * into v_plan;

    with incoming as (
      select 'intended_learning_outcome'::text as item_kind,
        item.value
      from jsonb_array_elements(p_plan->'intendedLearningOutcomes') item(value)
      union all
      select 'instructional_analysis_unit', item.value
      from jsonb_array_elements(p_plan->'instructionalAnalysisUnits') item(value)
      union all
      select 'evidence_requirement', item.value
      from jsonb_array_elements(p_plan->'evidenceRequirements') item(value)
    )
    delete from private.course_instructional_plan_items item
    where item.instructional_plan_id = v_plan.id
      and not exists(
        select 1 from incoming
        where (incoming.value->>'id')::uuid = item.id
      );

    insert into private.course_instructional_plan_items(
      id, course_id, instructional_plan_id, item_kind,
      position, statement, version
    )
    select (incoming.value->>'id')::uuid, p_course_id, v_plan.id,
      incoming.item_kind, (incoming.value->>'position')::integer,
      btrim(incoming.value->>'statement'), 1
    from (
      select 'intended_learning_outcome'::text as item_kind, item.value
      from jsonb_array_elements(p_plan->'intendedLearningOutcomes') item(value)
      union all
      select 'instructional_analysis_unit', item.value
      from jsonb_array_elements(p_plan->'instructionalAnalysisUnits') item(value)
      union all
      select 'evidence_requirement', item.value
      from jsonb_array_elements(p_plan->'evidenceRequirements') item(value)
    ) incoming
    on conflict(id) do update set
      item_kind = excluded.item_kind,
      position = excluded.position,
      statement = excluded.statement,
      version = private.course_instructional_plan_items.version + 1,
      updated_at = now()
    where row(
      private.course_instructional_plan_items.item_kind,
      private.course_instructional_plan_items.position,
      private.course_instructional_plan_items.statement
    ) is distinct from row(
      excluded.item_kind, excluded.position, excluded.statement
    );

    insert into private.course_authoring_parts(
      id, course_id, instructional_plan_id, position,
      title, intent, version, retired_at
    )
    select (part.value->>'id')::uuid, p_course_id, v_plan.id,
      (part.value->>'position')::integer, btrim(part.value->>'title'),
      part.value->>'intent', 1, null
    from jsonb_array_elements(p_plan->'parts') part(value)
    on conflict(id) do update set
      position = excluded.position,
      title = excluded.title,
      intent = excluded.intent,
      retired_at = null,
      version = private.course_authoring_parts.version + 1,
      updated_at = now()
    where row(
      private.course_authoring_parts.position,
      private.course_authoring_parts.title,
      private.course_authoring_parts.intent,
      private.course_authoring_parts.retired_at,
      coalesce((
        select jsonb_agg(
          membership.didactic_microsequence_id
          order by membership.production_position
        )
        from private.course_authoring_part_didactic_microsequences membership
        where membership.course_id = private.course_authoring_parts.course_id
          and membership.authoring_part_id = private.course_authoring_parts.id
      ), '[]'::jsonb)
    ) is distinct from row(
      excluded.position, excluded.title, excluded.intent, null::timestamptz,
      coalesce((
        select candidate.value->'microsequenceIds'
        from jsonb_array_elements(p_plan->'parts') candidate(value)
        where (candidate.value->>'id')::uuid = excluded.id
      ), '[]'::jsonb)
    );

    update private.course_authoring_parts part
    set position = null,
        retired_at = now(),
        version = part.version + 1,
        updated_at = now()
    where part.instructional_plan_id = v_plan.id
      and part.retired_at is null
      and not exists(
        select 1 from jsonb_array_elements(p_plan->'parts') candidate(value)
        where (candidate.value->>'id')::uuid = part.id
      );

    delete from private.course_authoring_part_didactic_microsequences membership
    where membership.course_id = p_course_id;
    insert into private.course_authoring_part_didactic_microsequences(
      course_id, authoring_part_id, didactic_microsequence_id,
      production_position
    )
    select p_course_id, (part.value->>'id')::uuid,
      micro.value, micro.ordinal::integer - 1
    from jsonb_array_elements(p_plan->'parts') part(value)
    cross join lateral jsonb_array_elements_text(
      part.value->'microsequenceIds'
    ) with ordinality micro(value, ordinal);

    select
      jsonb_array_length(p_plan->'intendedLearningOutcomes'),
      jsonb_array_length(p_plan->'instructionalAnalysisUnits'),
      jsonb_array_length(p_plan->'evidenceRequirements'),
      jsonb_array_length(p_plan->'parts'),
      coalesce(sum(jsonb_array_length(part.value->'microsequenceIds')), 0)::integer
    into v_outcome_count, v_analysis_count, v_evidence_count,
      v_part_count, v_microsequence_count
    from jsonb_array_elements(p_plan->'parts') part(value);
    insert into private.course_events(
      course_id, revision, operation, summary, actor_id
    ) values(
      p_course_id,
      v_course.revision,
      'update_course_instructional_plan',
      jsonb_build_object(
        'activityKind', 'plan_changed',
        'channel', p_channel,
        'instructionalPlanId', v_plan.id,
        'planVersion', v_plan.version,
        'commandType', v_command_type,
        'authoringPartId', case
          when p_command ? 'id' and v_command_type like '%part%'
            then p_command->>'id'
          when p_command ? 'partId' then p_command->>'partId'
          else null
        end,
        'instructionalPlanItemId', case
          when v_command_type in (
            'add_plan_item', 'update_plan_item', 'remove_plan_item'
          ) and p_command ? 'id' then p_command->>'id'
          else null
        end,
        'intendedLearningOutcomeCount', v_outcome_count,
        'instructionalAnalysisUnitCount', v_analysis_count,
        'evidenceRequirementCount', v_evidence_count,
        'authoringPartCount', v_part_count,
        'linkedDidacticMicrosequenceCount', v_microsequence_count
      ),
      p_actor_id
    );
  else
    v_outcome_count := jsonb_array_length(p_plan->'intendedLearningOutcomes');
    v_analysis_count := jsonb_array_length(p_plan->'instructionalAnalysisUnits');
    v_evidence_count := jsonb_array_length(p_plan->'evidenceRequirements');
    v_part_count := jsonb_array_length(p_plan->'parts');
    select coalesce(sum(jsonb_array_length(part.value->'microsequenceIds')), 0)::integer
    into v_microsequence_count
    from jsonb_array_elements(p_plan->'parts') part(value);
  end if;

  v_result := jsonb_build_object(
    'contract', 'aralearn.course-instructional-plan-change.v1',
    'courseId', p_course_id,
    'courseRevision', v_course.revision,
    'planId', v_plan.id,
    'planVersion', v_plan.version,
    'operation', 'commit_instructional_plan',
    'commandType', v_command_type,
    'channel', p_channel,
    'changed', v_changed,
    'idempotent', false,
    'counts', jsonb_build_object(
      'intendedLearningOutcomeCount', v_outcome_count,
      'instructionalAnalysisUnitCount', v_analysis_count,
      'evidenceRequirementCount', v_evidence_count,
      'authoringPartCount', v_part_count,
      'linkedDidacticMicrosequenceCount', v_microsequence_count
    ),
    'updatedAt', greatest(v_course.updated_at, v_plan.updated_at)
  );
  insert into private.course_change_receipts(
    actor_id, request_id, operation, course_id, request_hash, result
  ) values(
    p_actor_id, p_request_id, 'commit_instructional_plan',
    p_course_id, v_hash, v_result
  );
  return v_result;
end;
$function$;

create or replace function private.list_courses_for_actor_v1(
  p_actor_id uuid,
  p_query text default null,
  p_limit integer default 24,
  p_before_updated_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_items jsonb;
  v_has_more boolean;
  v_next_cursor jsonb;
begin
  if p_actor_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 50
     or ((p_before_updated_at is null) <> (p_before_id is null))
     or (p_query is not null and char_length(btrim(p_query)) > 120) then
    raise exception 'Consulta de Cursos inválida.' using errcode = '22023';
  end if;
  with accessible as materialized (
    select course.id, course.title, course.goal, course.revision,
      course.created_at, course.updated_at,
      private.course_ownership_v1(course.id, p_actor_id) as ownership
    from public.courses course
    join private.course_instructional_plans plan on plan.course_id = course.id
    where private.course_ownership_v1(course.id, p_actor_id) is not null
      and (
        nullif(btrim(p_query), '') is null
        or lower(course.title || ' ' || course.goal)
          like '%' || lower(btrim(p_query)) || '%'
      )
      and (
        p_before_updated_at is null
        or (course.updated_at, course.id) < (p_before_updated_at, p_before_id)
      )
    order by course.updated_at desc, course.id desc
    limit p_limit + 1
  ), page as materialized (
    select * from accessible order by updated_at desc, id desc limit p_limit
  ), projected as (
    select page.*,
      count(entity.course_id) filter(where entity.entity_type = 'module')::integer
        as module_count,
      count(entity.course_id) filter(where entity.entity_type = 'lesson')::integer
        as lesson_count,
      count(entity.course_id) filter(where entity.entity_type = 'topic')::integer
        as topic_count,
      count(entity.course_id) filter(where entity.entity_type = 'microsequence')::integer
        as microsequence_count,
      count(entity.course_id) filter(where entity.entity_type = 'study_unit')::integer
        as study_unit_count,
      coalesce((
        select count(distinct study_unit.entity_id)
        from public.course_personal_states personal_state
        cross join lateral jsonb_each(coalesce(
          personal_state.state#>'{progress,lessons}', '{}'::jsonb
        )) lesson(path, value)
        cross join lateral jsonb_array_elements_text(
          lesson.value->'completedStudyUnitIds'
        ) completed(study_unit_id)
        join private.course_entities study_unit
          on study_unit.course_id = page.id
         and study_unit.entity_type = 'study_unit'
         and study_unit.entity_id = completed.study_unit_id
        where personal_state.course_id = page.id
          and personal_state.user_id = p_actor_id
      ), 0)::integer as completed_study_unit_count
    from page
    left join private.course_entities entity on entity.course_id = page.id
    group by page.id, page.title, page.goal, page.revision,
      page.created_at, page.updated_at, page.ownership
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'courseId', projected.id,
    'title', projected.title,
    'goal', projected.goal,
    'revision', projected.revision,
    'ownership', projected.ownership,
    'canEdit', projected.ownership = 'owned',
    'moduleCount', projected.module_count,
    'lessonCount', projected.lesson_count,
    'topicCount', projected.topic_count,
    'microsequenceCount', projected.microsequence_count,
    'studyUnitCount', projected.study_unit_count,
    'completedStudyUnitCount', projected.completed_study_unit_count,
    'updatedAt', projected.updated_at
  ) order by projected.updated_at desc, projected.id desc), '[]'::jsonb),
    (select count(*) from accessible) > p_limit,
    case when (select count(*) from accessible) > p_limit then (
      select jsonb_build_object(
        'beforeUpdatedAt', page.updated_at,
        'beforeId', page.id
      ) from page order by page.updated_at, page.id limit 1
    ) end
  into v_items, v_has_more, v_next_cursor
  from projected;
  return jsonb_build_object(
    'contract', 'aralearn.course-list.v1',
    'items', v_items,
    'hasMore', v_has_more,
    'nextCursor', v_next_cursor
  );
end;
$function$;

create or replace function public.list_owned_courses_for_actor_v1(
  p_actor_id uuid,
  p_query text default null,
  p_limit integer default 24,
  p_before_updated_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_items jsonb;
  v_has_more boolean;
  v_next_cursor jsonb;
begin
  if p_actor_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 50
     or ((p_before_updated_at is null) <> (p_before_id is null))
     or (p_query is not null and char_length(btrim(p_query)) > 120) then
    raise exception 'Consulta de Cursos inválida.' using errcode = '22023';
  end if;
  with owned as materialized (
    select course.*
    from public.courses course
    join private.course_instructional_plans plan on plan.course_id = course.id
    where course.owner_id = p_actor_id
      and (
        nullif(btrim(p_query), '') is null
        or lower(course.title || ' ' || course.goal)
          like '%' || lower(btrim(p_query)) || '%'
      )
      and (
        p_before_updated_at is null
        or (course.updated_at, course.id) < (p_before_updated_at, p_before_id)
      )
    order by course.updated_at desc, course.id desc
    limit p_limit + 1
  ), page as materialized (
    select * from owned order by updated_at desc, id desc limit p_limit
  ), projected as (
    select page.id, page.title, page.goal, page.revision,
      page.created_at, page.updated_at,
      count(entity.course_id) filter(where entity.entity_type = 'module')::integer
        as module_count,
      count(entity.course_id) filter(where entity.entity_type = 'lesson')::integer
        as lesson_count,
      count(entity.course_id) filter(where entity.entity_type = 'topic')::integer
        as topic_count,
      count(entity.course_id) filter(where entity.entity_type = 'microsequence')::integer
        as microsequence_count,
      count(entity.course_id) filter(where entity.entity_type = 'study_unit')::integer
        as study_unit_count
    from page
    left join private.course_entities entity on entity.course_id = page.id
    group by page.id, page.title, page.goal, page.revision,
      page.created_at, page.updated_at
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'courseId', projected.id,
    'title', projected.title,
    'goal', projected.goal,
    'revision', projected.revision,
    'ownership', 'owned',
    'canEdit', true,
    'moduleCount', projected.module_count,
    'lessonCount', projected.lesson_count,
    'topicCount', projected.topic_count,
    'microsequenceCount', projected.microsequence_count,
    'studyUnitCount', projected.study_unit_count,
    'updatedAt', projected.updated_at
  ) order by projected.updated_at desc, projected.id desc), '[]'::jsonb),
    (select count(*) from owned) > p_limit,
    case when (select count(*) from owned) > p_limit then (
      select jsonb_build_object(
        'beforeUpdatedAt', page.updated_at,
        'beforeId', page.id
      ) from page order by page.updated_at, page.id limit 1
    ) end
  into v_items, v_has_more, v_next_cursor from projected;
  return jsonb_build_object(
    'contract', 'aralearn.course-list.v1',
    'items', v_items,
    'hasMore', v_has_more,
    'nextCursor', v_next_cursor
  );
end;
$function$;

create or replace function public.create_course_for_actor_v1(
  p_actor_id uuid,
  p_title text,
  p_objective text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $function$
declare
  v_hash text;
  v_receipt private.course_change_receipts%rowtype;
  v_course public.courses%rowtype;
  v_plan private.course_instructional_plans%rowtype;
  v_result jsonb;
begin
  perform private.require_service_role();
  if p_actor_id is null
     or not exists(select 1 from auth.users account where account.id = p_actor_id)
     or coalesce(p_title ~ '[^[:space:]]', false) is not true
     or char_length(btrim(p_title)) > 300
     or translate(btrim(p_title), E'\n\r\t', '') ~ '[[:cntrl:]]'
     or coalesce(p_objective ~ '[^[:space:]]', false) is not true
     or char_length(btrim(p_objective)) > 2000
     or translate(btrim(p_objective), E'\n\r\t', '') ~ '[[:cntrl:]]'
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'Criação de Curso inválida.' using errcode = '22023';
  end if;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'operation', 'create_course',
    'actorId', p_actor_id,
    'title', btrim(p_title),
    'objective', btrim(p_objective)
  )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:' || p_actor_id::text || ':' || p_request_id, 0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  select * into v_receipt
  from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'create_course'
       or v_receipt.request_hash <> v_hash then
      raise exception 'requestId reutilizado com comando incompatível.'
        using errcode = '23514';
    end if;
    return (v_receipt.result - 'idempotent') || jsonb_build_object(
      'idempotent', true
    );
  end if;
  insert into public.courses(id, owner_id, title, goal, revision)
  values(
    extensions.gen_random_uuid(), p_actor_id,
    btrim(p_title), btrim(p_objective), 1
  ) returning * into v_course;
  insert into private.course_instructional_plans(
    course_id, audience, instructional_scope,
    preferred_authoring_part_min, preferred_authoring_part_max,
    part_count_origin, version
  ) values(
    v_course.id, '', '', 7, 12, 'automatic', 1
  ) returning * into v_plan;
  insert into private.course_events(
    course_id, revision, operation, summary, actor_id
  ) values(
    v_course.id, v_course.revision, 'create_course',
    jsonb_build_object(
      'changeKind', 'course_initialized',
      'instructionalPlanId', v_plan.id,
      'createdCount', 0,
      'updatedCount', 0,
      'deletedCount', 0
    ),
    p_actor_id
  );
  v_result := jsonb_build_object(
    'courseId', v_course.id,
    'title', v_course.title,
    'goal', v_course.goal,
    'revision', v_course.revision,
    'instructionalPlanId', v_plan.id,
    'instructionalPlanVersion', v_plan.version,
    'ownership', 'owned',
    'idempotent', false,
    'createdAt', v_course.created_at,
    'updatedAt', v_course.updated_at
  );
  insert into private.course_change_receipts(
    actor_id, request_id, operation, course_id, request_hash, result
  ) values(
    p_actor_id, p_request_id, 'create_course',
    v_course.id, v_hash, v_result
  );
  return v_result;
end;
$function$;

alter table private.course_instructional_plans
  drop constraint course_instructional_plans_guidance_v1,
  drop column authoring_guidance;

create function private.course_design_parameters_for_scope_v1(
  p_course_id uuid,
  p_scope_path jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  with path_scopes as materialized (
    select scope.value->>'kind' as scope_kind,
      scope.value->>'ref' as scope_ref,
      scope.ordinal::integer as depth
    from jsonb_array_elements(p_scope_path)
      with ordinality scope(value, ordinal)
  ), scopes as materialized (
    select * from path_scopes
    where scope_kind <> 'module'
  ), current_changes as materialized (
    select distinct on (
      change.parameter_id,change.scope_kind,change.scope_ref
    ) change.*,scopes.depth
    from private.course_design_parameter_changes change
    join scopes on scopes.scope_kind = change.scope_kind
      and scopes.scope_ref = change.scope_ref
    where change.course_id = p_course_id
    order by change.parameter_id,change.scope_kind,change.scope_ref,
      change.course_revision desc,change.id desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'parameterId',definition.parameter_id,
    'localAssignment',case when local_change.action = 'set' then
      jsonb_build_object(
        'changeId',local_change.id::text,
        'value',local_change.value,
        'origin',local_change.origin,
        'reason',local_change.reason
      ) else null end,
    'effectiveAssignment',case when effective.id is null then
      jsonb_build_object(
        'changeId',null,
        'value',definition.default_value,
        'origin','system_default',
        'reason','Hipótese padrão de produto aplicada na ausência de atribuição explícita ou automática.',
        'sourceScope',null,
        'inherited',false
      ) else jsonb_build_object(
        'changeId',effective.id::text,
        'value',effective.value,
        'origin',effective.origin,
        'reason',effective.reason,
        'sourceScope',jsonb_build_object(
          'kind',effective.scope_kind,'ref',effective.scope_ref
        ),
        'inherited',effective.scope_kind <> target.scope_kind
          or effective.scope_ref <> target.scope_ref
      ) end
  ) order by definition.ordinal),'[]'::jsonb)
  from private.course_design_parameter_definitions definition
  cross join lateral (
    select scope_kind,scope_ref
    from path_scopes order by depth desc limit 1
  ) target
  left join lateral (
    select change.*
    from current_changes change
    where change.parameter_id = definition.parameter_id
      and change.action = 'set'
    order by case change.origin
        when 'author' then 2 when 'research_condition' then 2 else 1 end desc,
      change.depth desc,change.course_revision desc,change.id desc
    limit 1
  ) effective on true
  left join lateral (
    select change.*
    from current_changes change
    where change.parameter_id = definition.parameter_id
      and change.scope_kind = target.scope_kind
      and change.scope_ref = target.scope_ref
    limit 1
  ) local_change on true
$function$;

create function private.course_authoring_guidance_for_scope_v1(
  p_course_id uuid,
  p_scope_path jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  with scopes as materialized (
    select scope.value->>'kind' as scope_kind,
      scope.value->>'ref' as scope_ref,
      scope.ordinal::integer as depth
    from jsonb_array_elements(p_scope_path)
      with ordinality scope(value, ordinal)
  ), current_revisions as materialized (
    select distinct on (revision.scope_kind,revision.scope_ref)
      revision.*,scopes.depth
    from private.course_authoring_guidance_revisions revision
    join scopes on scopes.scope_kind = revision.scope_kind
      and scopes.scope_ref = revision.scope_ref
    where revision.course_id = p_course_id
    order by revision.scope_kind,revision.scope_ref,
      revision.course_revision desc,revision.id desc
  ), effective as materialized (
    select revision.*,interpretation.current_value
    from current_revisions revision
    left join lateral (
      select jsonb_build_object(
        'interpretationId',item.id::text,
        'guidanceRevisionId',item.guidance_revision_id,
        'interpretation',item.interpretation,
        'createdAt',item.created_at
      ) as current_value
      from private.course_authoring_guidance_interpretations item
      where item.guidance_revision_id = revision.revision_id
      order by item.course_revision desc,item.id desc limit 1
    ) interpretation on true
    where revision.action = 'set'
  ), target as (
    select scope_kind,scope_ref from scopes order by depth desc limit 1
  )
  select jsonb_build_object(
    'localRevision',(
      select jsonb_build_object(
        'revisionId',revision.revision_id,
        'guidance',revision.guidance,
        'origin',revision.origin,
        'reason',revision.reason
      )
      from effective revision,target
      where revision.scope_kind = target.scope_kind
        and revision.scope_ref = target.scope_ref
    ),
    'effectiveRevisions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'revisionId',revision.revision_id,
        'guidance',revision.guidance,
        'origin',revision.origin,
        'reason',revision.reason,
        'sourceScope',jsonb_build_object(
          'kind',revision.scope_kind,'ref',revision.scope_ref
        ),
        'currentInterpretation',revision.current_value
      ) order by revision.depth)
      from effective revision
    ),'[]'::jsonb)
  )
$function$;

create function private.course_component_policy_for_scope_v1(
  p_course_id uuid,
  p_scope_path jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  with scopes as materialized (
    select scope.value->>'kind' as scope_kind,
      scope.value->>'ref' as scope_ref,
      scope.ordinal::integer as depth
    from jsonb_array_elements(p_scope_path)
      with ordinality scope(value, ordinal)
  ), current_changes as materialized (
    select distinct on (change.scope_kind,change.scope_ref)
      change.*,scopes.depth
    from private.course_component_policy_changes change
    join scopes on scopes.scope_kind = change.scope_kind
      and scopes.scope_ref = change.scope_ref
    where change.course_id = p_course_id
    order by change.scope_kind,change.scope_ref,
      change.course_revision desc,change.id desc
  ), target as (
    select scope_kind,scope_ref from scopes order by depth desc limit 1
  ), effective as (
    select change.*
    from current_changes change
    where change.action = 'set'
    order by case change.origin
        when 'author' then 2 when 'research_condition' then 2 else 1 end desc,
      change.depth desc,change.course_revision desc,change.id desc
    limit 1
  )
  select jsonb_build_object(
    'localChange',(
      select case when change.action = 'set' then jsonb_build_object(
        'changeId',change.id::text,
        'policy',change.policy,
        'origin',change.origin,
        'reason',change.reason
      ) else null end
      from current_changes change,target
      where change.scope_kind = target.scope_kind
        and change.scope_ref = target.scope_ref
    ),
    'effectiveChange',coalesce((
      select jsonb_build_object(
        'changeId',change.id::text,
        'policy',change.policy,
        'origin',change.origin,
        'reason',change.reason,
        'sourceScope',jsonb_build_object(
          'kind',change.scope_kind,'ref',change.scope_ref
        ),
        'inherited',change.scope_kind <> target.scope_kind
          or change.scope_ref <> target.scope_ref
      )
      from effective change,target
    ),jsonb_build_object(
      'changeId',null,
      'policy',jsonb_build_object(
        'catalogVersion',private.course_component_catalog_v1()->>'version',
        'availability','all',
        'allowedRefs','[]'::jsonb,
        'excludedRefs','[]'::jsonb,
        'preferredRefs','[]'::jsonb
      ),
      'origin','system_default',
      'reason','Todos os componentes da revisão corrente permanecem disponíveis na ausência de política mais específica.',
      'sourceScope',null,
      'inherited',false
    ))
  )
$function$;

alter table private.course_change_receipts
  drop constraint course_change_receipts_operation_v3,
  add constraint course_change_receipts_operation_v4 check(operation in (
    'create_course',
    'commit_course_composition',
    'commit_instructional_plan',
    'advance_authoring_part_materialization',
    'apply_course_design_command',
    'grant_access',
    'revoke_access'
  ));

alter table private.course_events
  drop constraint course_events_operation_v3,
  add constraint course_events_operation_v4 check(operation in (
    'create_course',
    'update_course_metadata',
    'replace_course_composition',
    'update_course_instructional_plan',
    'advance_course_authoring_part_materialization',
    'update_course_design',
    'grant_course_access',
    'revoke_course_access'
  ));

create function public.apply_course_design_command_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_course_revision bigint,
  p_command jsonb,
  p_channel text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $function$
declare
  v_hash text;
  v_receipt private.course_change_receipts%rowtype;
  v_course public.courses%rowtype;
  v_type text;
  v_scope_kind text;
  v_scope_ref text;
  v_scope_path jsonb;
  v_parameter_id text;
  v_value jsonb;
  v_origin text;
  v_reason text;
  v_guidance text;
  v_guidance_revision private.course_authoring_guidance_revisions%rowtype;
  v_interpretation jsonb;
  v_policy jsonb;
  v_analysis_unit_ids uuid[];
  v_evidence_requirement_ids uuid[];
  v_current_analysis_unit_ids uuid[];
  v_current_evidence_requirement_ids uuid[];
  v_latest_parameter private.course_design_parameter_changes%rowtype;
  v_latest_guidance private.course_authoring_guidance_revisions%rowtype;
  v_latest_interpretation private.course_authoring_guidance_interpretations%rowtype;
  v_latest_policy private.course_component_policy_changes%rowtype;
  v_changed boolean := false;
  v_change_id bigint;
  v_guidance_revision_id uuid;
  v_next_revision bigint;
  v_change jsonb;
  v_result jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  v_type := p_command->>'type';
  if p_actor_id is null or p_course_id is null
     or p_expected_course_revision is null
     or p_expected_course_revision < 1
     or p_channel not in ('application','mcp')
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or jsonb_typeof(p_command) is distinct from 'object'
     or octet_length(p_command::text) > 32768
     or v_type not in (
       'set_parameter','clear_parameter',
       'set_guidance','clear_guidance','interpret_guidance',
       'set_component_policy','clear_component_policy',
       'set_target_plan_items'
     ) then
    raise exception 'Comando de desenho do Curso inválido.'
      using errcode = '22023';
  end if;

  v_hash := private.course_design_json_hash_v1(jsonb_build_object(
    'courseId',p_course_id,
    'expectedCourseRevision',p_expected_course_revision,
    'command',p_command,
    'channel',p_channel
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:' || p_actor_id::text || ':' || p_request_id,0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  select * into v_receipt
  from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'apply_course_design_command'
       or v_receipt.course_id <> p_course_id
       or v_receipt.request_hash <> v_hash then
      raise exception 'requestId reutilizado com comando incompatível.'
        using errcode = '23514';
    end if;
    return (v_receipt.result - 'idempotent')
      || jsonb_build_object('idempotent',true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'course-row:' || p_course_id::text,0
  ));
  select * into strict v_course
  from public.courses course where course.id = p_course_id for update;
  if v_course.revision <> p_expected_course_revision then
    raise exception 'O Curso mudou; releia antes de alterar o desenho.'
      using errcode = '40001';
  end if;
  v_next_revision := v_course.revision + 1;

  if v_type = 'interpret_guidance' then
    if p_command - 'type' - 'guidanceRevisionId' - 'interpretation'
         <> '{}'::jsonb
       or not (p_command ?& array[
         'type','guidanceRevisionId','interpretation'
       ])
       or jsonb_typeof(p_command->'guidanceRevisionId') <> 'string'
       or p_command->>'guidanceRevisionId'
         !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or not private.valid_course_guidance_interpretation_v1(
         p_command->'interpretation'
       ) then
      raise exception 'Interpretação da orientação inválida.'
        using errcode = '22023';
    end if;
    select * into v_guidance_revision
    from private.course_authoring_guidance_revisions revision
    where revision.course_id = p_course_id
      and revision.revision_id = (p_command->>'guidanceRevisionId')::uuid
      and revision.action = 'set';
    if not found then
      raise exception 'Revisão de orientação inexistente.'
        using errcode = 'PT404';
    end if;
    select * into v_latest_guidance
    from private.course_authoring_guidance_revisions revision
    where revision.course_id = p_course_id
      and revision.scope_kind = v_guidance_revision.scope_kind
      and revision.scope_ref = v_guidance_revision.scope_ref
    order by revision.course_revision desc,revision.id desc limit 1;
    if v_latest_guidance.revision_id <> v_guidance_revision.revision_id
       or v_latest_guidance.action <> 'set' then
      raise exception 'A revisão de orientação não é mais corrente.'
        using errcode = '40001';
    end if;
    v_scope_kind := v_guidance_revision.scope_kind;
    v_scope_ref := v_guidance_revision.scope_ref;
    v_scope_path := private.course_design_scope_path_v1(
      p_course_id,v_scope_kind,v_scope_ref
    );
    if v_scope_path is null then
      raise exception 'O escopo da orientação não existe mais.'
        using errcode = '40001';
    end if;
    v_interpretation := p_command->'interpretation';
    select * into v_latest_interpretation
    from private.course_authoring_guidance_interpretations interpretation
    where interpretation.guidance_revision_id =
      v_guidance_revision.revision_id
    order by interpretation.course_revision desc,interpretation.id desc
    limit 1;
    v_changed := not found
      or v_latest_interpretation.interpretation <> v_interpretation;
  else
    if jsonb_typeof(p_command->'scope') <> 'object'
       or (p_command->'scope') - 'kind' - 'ref' <> '{}'::jsonb
       or not (p_command->'scope' ?& array['kind','ref'])
       or jsonb_typeof(p_command#>'{scope,kind}') <> 'string'
       or jsonb_typeof(p_command#>'{scope,ref}') <> 'string' then
      raise exception 'Escopo do comando de desenho inválido.'
        using errcode = '22023';
    end if;
    v_scope_kind := p_command#>>'{scope,kind}';
    v_scope_ref := p_command#>>'{scope,ref}';
    v_scope_path := private.course_design_scope_path_v1(
      p_course_id,v_scope_kind,v_scope_ref
    );
    if v_scope_path is null then
      raise exception 'Escopo de desenho inexistente.'
        using errcode = 'PT404';
    end if;
  end if;

  if v_type = 'set_target_plan_items' then
    if p_command - 'type' - 'scope' - 'instructionalAnalysisUnitIds'
         - 'evidenceRequirementIds' <> '{}'::jsonb
       or not (p_command ?& array[
         'type','scope','instructionalAnalysisUnitIds',
         'evidenceRequirementIds'
       ])
       or v_scope_kind <> 'didactic_microsequence'
       or jsonb_typeof(p_command->'instructionalAnalysisUnitIds') <> 'array'
       or jsonb_array_length(
         p_command->'instructionalAnalysisUnitIds'
       ) > 256
       or jsonb_typeof(p_command->'evidenceRequirementIds') <> 'array'
       or jsonb_array_length(p_command->'evidenceRequirementIds') > 256 then
      raise exception 'Atribuição de itens do plano ao alvo inválida.'
        using errcode = '22023';
    end if;
    if exists(
      select 1
      from jsonb_array_elements(
        p_command->'instructionalAnalysisUnitIds'
      ) item(value)
      where jsonb_typeof(item.value) <> 'string'
        or item.value#>>'{}'
          !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ) or exists(
      select 1
      from jsonb_array_elements(
        p_command->'evidenceRequirementIds'
      ) item(value)
      where jsonb_typeof(item.value) <> 'string'
        or item.value#>>'{}'
          !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ) or (
      select count(*) <> count(distinct item.value#>>'{}')
      from jsonb_array_elements(
        p_command->'instructionalAnalysisUnitIds'
      ) item(value)
    ) or (
      select count(*) <> count(distinct item.value#>>'{}')
      from jsonb_array_elements(
        p_command->'evidenceRequirementIds'
      ) item(value)
    ) then
      raise exception 'Atribuição de itens do plano ao alvo inválida.'
        using errcode = '22023';
    end if;

    select coalesce(array_agg(item.id order by item.position,item.id),
      '{}'::uuid[])
    into v_analysis_unit_ids
    from jsonb_array_elements_text(
      p_command->'instructionalAnalysisUnitIds'
    ) requested(value)
    join private.course_instructional_plan_items item
      on item.course_id = p_course_id
     and item.id = requested.value::uuid
     and item.item_kind = 'instructional_analysis_unit';
    select coalesce(array_agg(item.id order by item.position,item.id),
      '{}'::uuid[])
    into v_evidence_requirement_ids
    from jsonb_array_elements_text(
      p_command->'evidenceRequirementIds'
    ) requested(value)
    join private.course_instructional_plan_items item
      on item.course_id = p_course_id
     and item.id = requested.value::uuid
     and item.item_kind = 'evidence_requirement';
    if cardinality(v_analysis_unit_ids) <>
         jsonb_array_length(p_command->'instructionalAnalysisUnitIds')
       or cardinality(v_evidence_requirement_ids) <>
         jsonb_array_length(p_command->'evidenceRequirementIds') then
      raise exception 'Item do plano inexistente ou de tipo incompatível.'
        using errcode = '22023';
    end if;

    select coalesce(array_agg(item.id order by item.position,item.id),
      '{}'::uuid[])
    into v_current_analysis_unit_ids
    from private.course_design_target_plan_items assignment
    join private.course_instructional_plan_items item
      on item.course_id = assignment.course_id
     and item.id = assignment.plan_item_id
     and item.item_kind = assignment.plan_item_kind
    where assignment.course_id = p_course_id
      and assignment.didactic_microsequence_id = v_scope_ref
      and assignment.plan_item_kind = 'instructional_analysis_unit';
    select coalesce(array_agg(item.id order by item.position,item.id),
      '{}'::uuid[])
    into v_current_evidence_requirement_ids
    from private.course_design_target_plan_items assignment
    join private.course_instructional_plan_items item
      on item.course_id = assignment.course_id
     and item.id = assignment.plan_item_id
     and item.item_kind = assignment.plan_item_kind
    where assignment.course_id = p_course_id
      and assignment.didactic_microsequence_id = v_scope_ref
      and assignment.plan_item_kind = 'evidence_requirement';
    v_changed := v_current_analysis_unit_ids is distinct from v_analysis_unit_ids
      or v_current_evidence_requirement_ids is distinct from
        v_evidence_requirement_ids;
  elsif v_type = 'set_parameter' then
    if p_command - 'type' - 'scope' - 'parameterId'
         - 'value' - 'origin' - 'reason' <> '{}'::jsonb
       or not (p_command ?& array[
         'type','scope','parameterId','value','origin','reason'
       ])
       or v_scope_kind not in ('course','lesson','didactic_microsequence')
       or jsonb_typeof(p_command->'parameterId') <> 'string'
       or not exists(
         select 1 from private.course_design_parameter_definitions definition
         where definition.parameter_id = p_command->>'parameterId'
       )
       or not private.valid_course_design_parameter_value_v1(
         p_command->>'parameterId',p_command->'value'
       )
       or p_command->>'origin'
         not in ('automatic','author','research_condition')
       or jsonb_typeof(p_command->'reason') <> 'string'
       or nullif(btrim(p_command->>'reason'),'') is null
       or char_length(p_command->>'reason') > 1000
       or translate(p_command->>'reason',E'\n\r\t','') ~ '[[:cntrl:]]'
       then
      raise exception 'Atribuição de parâmetro inválida.'
        using errcode = '22023';
    end if;
    v_parameter_id := p_command->>'parameterId';
    v_value := private.canonical_course_design_parameter_value_v1(
      v_parameter_id,p_command->'value'
    );
    v_origin := p_command->>'origin';
    v_reason := btrim(p_command->>'reason');
    select * into v_latest_parameter
    from private.course_design_parameter_changes change
    where change.course_id = p_course_id
      and change.parameter_id = v_parameter_id
      and change.scope_kind = v_scope_kind
      and change.scope_ref = v_scope_ref
    order by change.course_revision desc,change.id desc limit 1;
    v_changed := not found or v_latest_parameter.action <> 'set'
      or v_latest_parameter.value <> v_value
      or v_latest_parameter.origin <> v_origin
      or v_latest_parameter.reason <> v_reason;
  elsif v_type = 'clear_parameter' then
    if p_command - 'type' - 'scope' - 'parameterId' <> '{}'::jsonb
       or not (p_command ?& array['type','scope','parameterId'])
       or v_scope_kind not in ('course','lesson','didactic_microsequence')
       or jsonb_typeof(p_command->'parameterId') <> 'string'
       or not exists(
         select 1 from private.course_design_parameter_definitions definition
         where definition.parameter_id = p_command->>'parameterId'
       ) then
      raise exception 'Limpeza de parâmetro inválida.'
        using errcode = '22023';
    end if;
    v_parameter_id := p_command->>'parameterId';
    select * into v_latest_parameter
    from private.course_design_parameter_changes change
    where change.course_id = p_course_id
      and change.parameter_id = v_parameter_id
      and change.scope_kind = v_scope_kind
      and change.scope_ref = v_scope_ref
    order by change.course_revision desc,change.id desc limit 1;
    v_changed := found and v_latest_parameter.action = 'set';
  elsif v_type = 'set_guidance' then
    if p_command - 'type' - 'scope' - 'guidance'
         - 'origin' - 'reason' <> '{}'::jsonb
       or not (p_command ?& array[
         'type','scope','guidance','origin','reason'
       ])
       or jsonb_typeof(p_command->'guidance') <> 'string'
       or nullif(btrim(p_command->>'guidance'),'') is null
       or octet_length(btrim(p_command->>'guidance')) > 8192
       or translate(p_command->>'guidance',E'\n\r\t','') ~ '[[:cntrl:]]'
       or p_command->>'origin'
         not in ('automatic','author','research_condition')
       or jsonb_typeof(p_command->'reason') <> 'string'
       or nullif(btrim(p_command->>'reason'),'') is null
       or char_length(p_command->>'reason') > 1000
       or translate(p_command->>'reason',E'\n\r\t','') ~ '[[:cntrl:]]'
       then
      raise exception 'Revisão de orientação inválida.'
        using errcode = '22023';
    end if;
    v_guidance := btrim(p_command->>'guidance');
    v_origin := p_command->>'origin';
    v_reason := btrim(p_command->>'reason');
    select * into v_latest_guidance
    from private.course_authoring_guidance_revisions revision
    where revision.course_id = p_course_id
      and revision.scope_kind = v_scope_kind
      and revision.scope_ref = v_scope_ref
    order by revision.course_revision desc,revision.id desc limit 1;
    v_changed := not found or v_latest_guidance.action <> 'set'
      or v_latest_guidance.guidance <> v_guidance
      or v_latest_guidance.origin <> v_origin
      or v_latest_guidance.reason <> v_reason;
  elsif v_type = 'clear_guidance' then
    if p_command - 'type' - 'scope' <> '{}'::jsonb
       or not (p_command ?& array['type','scope']) then
      raise exception 'Limpeza de orientação inválida.'
        using errcode = '22023';
    end if;
    select * into v_latest_guidance
    from private.course_authoring_guidance_revisions revision
    where revision.course_id = p_course_id
      and revision.scope_kind = v_scope_kind
      and revision.scope_ref = v_scope_ref
    order by revision.course_revision desc,revision.id desc limit 1;
    v_changed := found and v_latest_guidance.action = 'set';
  elsif v_type = 'set_component_policy' then
    if p_command - 'type' - 'scope' - 'policy'
         - 'origin' - 'reason' <> '{}'::jsonb
       or not (p_command ?& array[
         'type','scope','policy','origin','reason'
       ])
       or not private.valid_course_component_policy_v1(p_command->'policy')
       or p_command->>'origin'
         not in ('automatic','author','research_condition')
       or jsonb_typeof(p_command->'reason') <> 'string'
       or nullif(btrim(p_command->>'reason'),'') is null
       or char_length(p_command->>'reason') > 1000
       or translate(p_command->>'reason',E'\n\r\t','') ~ '[[:cntrl:]]'
       then
      raise exception 'Política de componentes inválida.'
        using errcode = '22023';
    end if;
    v_policy := p_command->'policy';
    v_origin := p_command->>'origin';
    v_reason := btrim(p_command->>'reason');
    select * into v_latest_policy
    from private.course_component_policy_changes change
    where change.course_id = p_course_id
      and change.scope_kind = v_scope_kind
      and change.scope_ref = v_scope_ref
    order by change.course_revision desc,change.id desc limit 1;
    v_changed := not found or v_latest_policy.action <> 'set'
      or v_latest_policy.policy <> v_policy
      or v_latest_policy.origin <> v_origin
      or v_latest_policy.reason <> v_reason;
  elsif v_type = 'clear_component_policy' then
    if p_command - 'type' - 'scope' <> '{}'::jsonb
       or not (p_command ?& array['type','scope']) then
      raise exception 'Limpeza de política de componentes inválida.'
        using errcode = '22023';
    end if;
    select * into v_latest_policy
    from private.course_component_policy_changes change
    where change.course_id = p_course_id
      and change.scope_kind = v_scope_kind
      and change.scope_ref = v_scope_ref
    order by change.course_revision desc,change.id desc limit 1;
    v_changed := found and v_latest_policy.action = 'set';
  end if;

  if v_changed then
    update public.courses course
    set revision = v_next_revision,updated_at = now()
    where course.id = p_course_id;

    if v_type = 'set_target_plan_items' then
      delete from private.course_design_target_plan_items assignment
      where assignment.course_id = p_course_id
        and assignment.didactic_microsequence_id = v_scope_ref;
      insert into private.course_design_target_plan_items(
        course_id,didactic_microsequence_id,plan_item_id,plan_item_kind
      )
      select p_course_id,v_scope_ref,item.id,item.item_kind
      from private.course_instructional_plan_items item
      where item.course_id = p_course_id
        and (
          item.item_kind = 'instructional_analysis_unit'
          and item.id = any(v_analysis_unit_ids)
          or item.item_kind = 'evidence_requirement'
          and item.id = any(v_evidence_requirement_ids)
        );
      v_change_id := v_next_revision;
    elsif v_type in ('set_parameter','clear_parameter') then
      insert into private.course_design_parameter_changes(
        course_id,course_revision,parameter_id,scope_kind,scope_ref,
        action,value,origin,reason,actor_id,channel
      ) values(
        p_course_id,v_next_revision,v_parameter_id,v_scope_kind,v_scope_ref,
        case when v_type = 'set_parameter' then 'set' else 'clear' end,
        case when v_type = 'set_parameter' then v_value end,
        case when v_type = 'set_parameter' then v_origin end,
        case when v_type = 'set_parameter' then v_reason end,
        p_actor_id,p_channel
      ) returning id into v_change_id;
    elsif v_type in ('set_guidance','clear_guidance') then
      v_guidance_revision_id := extensions.gen_random_uuid();
      insert into private.course_authoring_guidance_revisions(
        revision_id,course_id,course_revision,scope_kind,scope_ref,
        action,guidance,origin,reason,actor_id,channel
      ) values(
        v_guidance_revision_id,p_course_id,v_next_revision,
        v_scope_kind,v_scope_ref,
        case when v_type = 'set_guidance' then 'set' else 'clear' end,
        case when v_type = 'set_guidance' then v_guidance end,
        case when v_type = 'set_guidance' then v_origin end,
        case when v_type = 'set_guidance' then v_reason end,
        p_actor_id,p_channel
      ) returning id into v_change_id;
    elsif v_type = 'interpret_guidance' then
      insert into private.course_authoring_guidance_interpretations(
        course_id,course_revision,guidance_revision_id,
        interpretation,actor_id,channel
      ) values(
        p_course_id,v_next_revision,v_guidance_revision.revision_id,
        v_interpretation,p_actor_id,p_channel
      ) returning id into v_change_id;
    else
      insert into private.course_component_policy_changes(
        course_id,course_revision,scope_kind,scope_ref,
        action,policy,origin,reason,actor_id,channel
      ) values(
        p_course_id,v_next_revision,v_scope_kind,v_scope_ref,
        case when v_type = 'set_component_policy' then 'set' else 'clear' end,
        case when v_type = 'set_component_policy' then v_policy end,
        case when v_type = 'set_component_policy' then v_origin end,
        case when v_type = 'set_component_policy' then v_reason end,
        p_actor_id,p_channel
      ) returning id into v_change_id;
    end if;

    v_change := jsonb_build_object(
      'changeId',v_change_id::text,
      'type',v_type,
      'scope',jsonb_build_object('kind',v_scope_kind,'ref',v_scope_ref)
    );
    insert into private.course_events(
      course_id,revision,operation,summary,actor_id
    ) values(
      p_course_id,v_next_revision,'update_course_design',
      jsonb_build_object(
        'changeKind',v_type,
        'changeId',v_change_id::text,
        'scope',jsonb_build_object('kind',v_scope_kind,'ref',v_scope_ref),
        'parameterId',v_parameter_id,
        'guidanceRevisionId',case
          when v_type in ('set_guidance','clear_guidance')
            then v_guidance_revision_id
          when v_type = 'interpret_guidance'
            then v_guidance_revision.revision_id
          else null end,
        'instructionalAnalysisUnitCount',case
          when v_type = 'set_target_plan_items'
            then cardinality(v_analysis_unit_ids)
          else null end,
        'evidenceRequirementCount',case
          when v_type = 'set_target_plan_items'
            then cardinality(v_evidence_requirement_ids)
          else null end,
        'channel',p_channel
      ),
      p_actor_id
    );
  else
    v_next_revision := v_course.revision;
    v_change := null;
  end if;

  v_result := jsonb_build_object(
    'contract','aralearn.course-design-change.v1',
    'courseId',p_course_id,
    'courseRevision',v_next_revision,
    'requestId',p_request_id,
    'idempotent',false,
    'changed',v_changed,
    'change',v_change
  );
  insert into private.course_change_receipts(
    actor_id,request_id,operation,course_id,request_hash,result
  ) values(
    p_actor_id,p_request_id,'apply_course_design_command',
    p_course_id,v_hash,v_result
  );
  return v_result;
end;
$function$;

create function private.course_design_application_summary_v1(p_application jsonb)
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'contextHash',p_application->>'contextHash',
    'studyUnitCount',jsonb_array_length(p_application->'studyUnits'),
    'modeCounts',jsonb_build_object(
      'expository',count(*) filter(where unit.value->>'mode'='expository'),
      'practice',count(*) filter(where unit.value->>'mode'='practice'),
      'mixed',count(*) filter(where unit.value->>'mode'='mixed')
    ),
    'introducedInstructionalAnalysisUnitIds',coalesce((
      select jsonb_agg(id order by first_ordinal)
      from (
        select introduced.value as id,min(introduced.ordinal) as first_ordinal
        from jsonb_array_elements(p_application->'studyUnits')
          with ordinality study(value,study_ordinal)
        cross join lateral jsonb_array_elements_text(
          study.value->'introducedInstructionalAnalysisUnitIds'
        ) with ordinality introduced(value,ordinal)
        group by introduced.value
      ) values_by_first
    ),'[]'::jsonb),
    'developedExplanationForms',coalesce((
      select jsonb_agg(form.value order by form_order.ordinal)
      from unnest(array[
        'plain_definition','concrete_example','mechanism','contrast',
        'application_condition','limit_or_exception','worked_example',
        'representation_link'
      ]::text[]) with ordinality form_order(value,ordinal)
      cross join lateral (select form_order.value) form
      where exists(
        select 1
        from jsonb_array_elements(p_application->'studyUnits') study(value)
        cross join lateral jsonb_array_elements(
          study.value->'explanationApplications'
        ) explanation(value)
        where explanation.value->'developedForms' ? form.value
      )
    ),'[]'::jsonb),
    'practiceOpportunityCount',coalesce((
      select sum(jsonb_array_length(study.value->'practiceApplications'))
      from jsonb_array_elements(p_application->'studyUnits') study(value)
    ),0),
    'variedDimensions',coalesce((
      select jsonb_agg(dimension.value order by dimension.ordinal)
      from unnest(array[
        'case_or_data','context','task_feature',
        'external_representation','support_level'
      ]::text[]) with ordinality dimension(value,ordinal)
      where exists(
        select 1
        from jsonb_array_elements(p_application->'studyUnits') study(value)
        cross join lateral jsonb_array_elements(
          study.value->'practiceApplications'
        ) practice(value)
        where practice.value->'variedDimensions' ? dimension.value
      )
    ),'[]'::jsonb),
    'componentRefs',coalesce((
      select jsonb_agg(reference.value order by reference.value)
      from (
        select distinct reference.value
        from jsonb_array_elements(p_application->'studyUnits') study(value)
        cross join lateral jsonb_array_elements_text(
          study.value->'componentRefs'
        ) reference(value)
      ) reference
    ),'[]'::jsonb)
  )
  from jsonb_array_elements(p_application->'studyUnits') unit(value)
$function$;

create function private.recent_course_design_applications_v1(
  p_course_id uuid,
  p_scope_kind text,
  p_scope_ref text
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'materializationId',application.materialization_id,
      'stepId',application.step_id,
      'didacticMicrosequenceId',application.microsequence_id,
      'recordedAt',application.recorded_at
    ) || private.course_design_application_summary_v1(
      application.design_application
    )
    order by application.recorded_at desc,application.step_id desc
  ),'[]'::jsonb)
  from (
    select materialization.id as materialization_id,
      step.id as step_id,
      step.target_didactic_microsequence_id as microsequence_id,
      step.completed_at as recorded_at,
      step.result_facts->'designApplication' as design_application
    from private.course_authoring_part_materialization_steps step
    join private.course_authoring_part_materializations materialization
      on materialization.course_id = step.course_id
     and materialization.id = step.materialization_id
    join private.course_entities microsequence
      on microsequence.course_id = step.course_id
     and microsequence.entity_type = 'microsequence'
     and microsequence.entity_id =
       step.target_didactic_microsequence_id
    join private.course_entities lesson
      on lesson.course_id = microsequence.course_id
     and lesson.entity_type = 'lesson'
     and lesson.entity_id = microsequence.parent_id
    where step.course_id = p_course_id
      and step.status = 'completed'
      and step.step_kind = 'didactic_microsequence_materialization'
      and jsonb_typeof(step.result_facts->'designApplication') = 'object'
      and (
        p_scope_kind = 'course'
        or p_scope_kind = 'module' and lesson.parent_id = p_scope_ref
        or p_scope_kind = 'lesson' and lesson.entity_id = p_scope_ref
        or p_scope_kind = 'didactic_microsequence'
          and microsequence.entity_id = p_scope_ref
      )
    order by step.completed_at desc,step.id desc
    limit 16
  ) application
$function$;

create function private.course_materialization_design_context_v1(
  p_course_id uuid,
  p_authoring_part_id uuid,
  p_course_revision bigint,
  p_steps jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_analysis_units jsonb;
  v_evidence_requirements jsonb;
  v_targets jsonb := '[]'::jsonb;
  v_guidance_dictionary jsonb := '[]'::jsonb;
  v_target record;
  v_path jsonb;
  v_parameters jsonb;
  v_guidance jsonb;
  v_guidance_ids jsonb;
  v_policy jsonb;
  v_target_analysis_unit_ids jsonb;
  v_target_evidence_requirement_ids jsonb;
  v_revision jsonb;
  v_context jsonb;
begin
  if p_course_id is null or p_authoring_part_id is null
     or p_course_revision is null or p_course_revision < 1
     or jsonb_typeof(p_steps) <> 'array'
     or jsonb_array_length(p_steps) not between 1 and 64 then
    raise exception 'Entrada do contexto de desenho inválida.'
      using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id',item.id,
      'position',item.position,
      'statement',item.statement,
      'version',item.version
    ) order by item.position,item.id),'[]'::jsonb)
  into v_analysis_units
  from private.course_instructional_plan_items item
  where item.course_id = p_course_id
    and item.item_kind = 'instructional_analysis_unit'
    and exists(
      select 1
      from private.course_design_target_plan_items assignment
      join jsonb_array_elements(p_steps) step(value)
        on step.value->>'kind' = 'didactic_microsequence_materialization'
       and step.value->>'targetDidacticMicrosequenceId'
         = assignment.didactic_microsequence_id
      where assignment.course_id = item.course_id
        and assignment.plan_item_id = item.id
        and assignment.plan_item_kind = item.item_kind
    );
  select coalesce(jsonb_agg(jsonb_build_object(
      'id',item.id,
      'position',item.position,
      'statement',item.statement,
      'version',item.version
    ) order by item.position,item.id),'[]'::jsonb)
  into v_evidence_requirements
  from private.course_instructional_plan_items item
  where item.course_id = p_course_id
    and item.item_kind = 'evidence_requirement'
    and exists(
      select 1
      from private.course_design_target_plan_items assignment
      join jsonb_array_elements(p_steps) step(value)
        on step.value->>'kind' = 'didactic_microsequence_materialization'
       and step.value->>'targetDidacticMicrosequenceId'
         = assignment.didactic_microsequence_id
      where assignment.course_id = item.course_id
        and assignment.plan_item_id = item.id
        and assignment.plan_item_kind = item.item_kind
    );

  if jsonb_array_length(v_analysis_units) > 256
     or jsonb_array_length(v_evidence_requirements) > 256 then
    raise exception 'Plano excede os limites do contexto de desenho.'
      using errcode = '54000';
  end if;

  for v_target in
    select step.value->>'targetDidacticMicrosequenceId' as microsequence_id,
      min((step.value->>'productionPosition')::integer) as production_position
    from jsonb_array_elements(p_steps) step(value)
    where step.value->>'kind' = 'didactic_microsequence_materialization'
    group by step.value->>'targetDidacticMicrosequenceId'
    order by production_position,microsequence_id
  loop
    v_path := private.course_design_scope_path_v1(
      p_course_id,'didactic_microsequence',v_target.microsequence_id
    );
    if v_path is null then
      raise exception 'Microssequência alvo inexistente no contexto de desenho.'
        using errcode = 'PT404';
    end if;
    select coalesce(jsonb_agg(to_jsonb(item.id)
        order by item.position,item.id),'[]'::jsonb)
    into v_target_analysis_unit_ids
    from private.course_design_target_plan_items assignment
    join private.course_instructional_plan_items item
      on item.course_id = assignment.course_id
     and item.id = assignment.plan_item_id
     and item.item_kind = assignment.plan_item_kind
    where assignment.course_id = p_course_id
      and assignment.didactic_microsequence_id = v_target.microsequence_id
      and assignment.plan_item_kind = 'instructional_analysis_unit';
    select coalesce(jsonb_agg(to_jsonb(item.id)
        order by item.position,item.id),'[]'::jsonb)
    into v_target_evidence_requirement_ids
    from private.course_design_target_plan_items assignment
    join private.course_instructional_plan_items item
      on item.course_id = assignment.course_id
     and item.id = assignment.plan_item_id
     and item.item_kind = assignment.plan_item_kind
    where assignment.course_id = p_course_id
      and assignment.didactic_microsequence_id = v_target.microsequence_id
      and assignment.plan_item_kind = 'evidence_requirement';
    select coalesce(jsonb_agg(jsonb_build_object(
        'parameterId',parameter.value->>'parameterId',
        'value',parameter.value#>'{effectiveAssignment,value}',
        'origin',parameter.value#>>'{effectiveAssignment,origin}',
        'reason',parameter.value#>>'{effectiveAssignment,reason}',
        'sourceScope',parameter.value#>'{effectiveAssignment,sourceScope}'
      ) order by parameter.ordinal),'[]'::jsonb)
    into v_parameters
    from jsonb_array_elements(
      private.course_design_parameters_for_scope_v1(p_course_id,v_path)
    ) with ordinality parameter(value,ordinal);

    v_guidance := private.course_authoring_guidance_for_scope_v1(
      p_course_id,v_path
    )->'effectiveRevisions';
    select coalesce(jsonb_agg(to_jsonb(revision.value->>'revisionId')
      order by revision.ordinal),'[]'::jsonb)
    into v_guidance_ids
    from jsonb_array_elements(v_guidance)
      with ordinality revision(value,ordinal);
    for v_revision in
      select revision.value
      from jsonb_array_elements(v_guidance)
        with ordinality revision(value,ordinal)
      order by revision.ordinal
    loop
      if not exists(
        select 1
        from jsonb_array_elements(v_guidance_dictionary) item(value)
        where item.value->>'revisionId' = v_revision->>'revisionId'
      ) then
        v_guidance_dictionary := v_guidance_dictionary
          || jsonb_build_array(v_revision);
      end if;
    end loop;

    v_policy := private.course_component_policy_for_scope_v1(
      p_course_id,v_path
    )#>'{effectiveChange}';
    v_policy := v_policy - 'inherited';
    v_targets := v_targets || jsonb_build_array(jsonb_build_object(
      'didacticMicrosequenceId',v_target.microsequence_id,
      'instructionalAnalysisUnitIds',v_target_analysis_unit_ids,
      'evidenceRequirementIds',v_target_evidence_requirement_ids,
      'parameters',v_parameters,
      'guidanceRevisionIds',v_guidance_ids,
      'componentPolicy',v_policy
    ));
  end loop;

  v_context := jsonb_build_object(
    'contract','aralearn.course-design-context.v1',
    'courseId',p_course_id,
    'courseRevision',p_course_revision,
    'authoringPartId',p_authoring_part_id,
    'componentCatalogVersion',
      private.course_component_catalog_v1()->>'version',
    'instructionalAnalysisUnits',v_analysis_units,
    'evidenceRequirements',v_evidence_requirements,
    'guidanceRevisions',v_guidance_dictionary,
    'targets',v_targets
  );
  if octet_length(v_context::text) > 65536 then
    raise exception 'Contexto de desenho excede 64 KiB.'
      using errcode = '54000';
  end if;
  return v_context;
end;
$function$;

create function private.valid_course_design_application_v1(
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
    from jsonb_array_elements(p_application->'studyUnits') unit(value)
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
      or not (
        (unit.value->'introducedInstructionalAnalysisUnitIds')
        ? (explanation.value->>'instructionalAnalysisUnitId')
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
    from jsonb_array_elements(p_application->'studyUnits') unit(value)
    cross join lateral jsonb_array_elements(
      unit.value->'explanationApplications'
    ) explanation(value)
    cross join lateral jsonb_array_elements_text(v_required_forms)
      required(value)
    where not (explanation.value->'developedForms' ? required.value)
      and not exists(
        select 1
        from jsonb_array_elements(
          explanation.value->'notApplicable'
        ) item(value)
        where item.value->>'form' = required.value
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

create function private.assert_course_design_application_materialized_v1(
  p_course_id uuid,
  p_microsequence_id text,
  p_application jsonb,
  p_entity_changes jsonb,
  p_context jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_expected_ids text[];
  v_upsert_ids text[];
  v_target jsonb;
  v_policy jsonb;
  v_unit jsonb;
  v_entity private.course_entities%rowtype;
  v_declared_refs text[];
  v_actual_refs text[];
  v_ref text;
begin
  select coalesce(array_agg(unit.value->>'studyUnitId'
      order by unit.value->>'studyUnitId'),'{}'::text[])
  into v_expected_ids
  from jsonb_array_elements(p_application->'studyUnits') unit(value);
  select coalesce(array_agg(item.value->>'entityId'
      order by item.value->>'entityId'),'{}'::text[])
  into v_upsert_ids
  from jsonb_array_elements(p_entity_changes->'upserts') item(value)
  where item.value->>'entityType' = 'study_unit';
  if v_expected_ids is distinct from v_upsert_ids then
    raise exception 'designApplication não coincide com o lote de Unidades.'
      using errcode = '23514';
  end if;

  select target.value into v_target
  from jsonb_array_elements(p_context->'targets') target(value)
  where target.value->>'didacticMicrosequenceId' = p_microsequence_id;
  v_policy := v_target#>'{componentPolicy,policy}';
  if v_target is null
     or not private.valid_course_component_policy_v1(v_policy) then
    raise exception 'Política selada da microssequência é inválida.'
      using errcode = '23514';
  end if;

  for v_unit in
    select unit.value
    from jsonb_array_elements(p_application->'studyUnits') unit(value)
  loop
    select entity.* into v_entity
    from private.course_entities entity
    where entity.course_id = p_course_id
      and entity.entity_type = 'study_unit'
      and entity.entity_id = v_unit->>'studyUnitId';
    if not found or v_entity.parent_type <> 'microsequence'
       or v_entity.parent_id <> p_microsequence_id then
      raise exception 'Unidade aplicada não pertence à microssequência alvo.'
        using errcode = '23514';
    end if;
    select coalesce(array_agg(reference.value order by reference.value),
      '{}'::text[])
    into v_declared_refs
    from jsonb_array_elements_text(v_unit->'componentRefs') reference(value);
    v_actual_refs := private.course_component_refs_from_content_v1(
      v_entity.content
    );
    if not private.valid_course_component_refs_in_content_v1(
      v_entity.content
    ) then
      raise exception 'Conteúdo da Unidade % possui package@version inválido.',
        v_entity.entity_id using errcode = '23514';
    end if;
    if v_declared_refs is distinct from v_actual_refs then
      raise exception 'Referências declaradas divergem do conteúdo da Unidade %.',
        v_entity.entity_id using errcode = '23514';
    end if;
  end loop;

  for v_entity in
    select entity.*
    from private.course_entities entity
    where entity.course_id = p_course_id
      and entity.entity_type = 'study_unit'
      and entity.parent_type = 'microsequence'
      and entity.parent_id = p_microsequence_id
  loop
    if not private.valid_course_component_refs_in_content_v1(
      v_entity.content
    ) then
      raise exception 'Conteúdo da Unidade % possui package@version inválido.',
        v_entity.entity_id using errcode = '23514';
    end if;
    foreach v_ref in array private.course_component_refs_from_content_v1(
      v_entity.content
    )
    loop
      if not exists(
        select 1
        from jsonb_array_elements(
          private.course_component_catalog_v1()->'options'
        ) option(value)
        where option.value->>'ref' = v_ref
      ) or not private.course_component_policy_allows_v1(v_policy,v_ref) then
        raise exception 'Componente % da Unidade % viola a política selada.',
          v_ref,v_entity.entity_id using errcode = '23514';
      end if;
    end loop;
  end loop;
end;
$function$;

alter function public.get_owned_course_authoring_part_materialization_for_actor_v1(
  uuid,uuid,uuid,uuid
) set schema private;

alter function private.get_owned_course_authoring_part_materialization_for_actor_v1(
  uuid,uuid,uuid,uuid
) rename to get_owned_course_authoring_part_materialization_core_v1;

alter function public.advance_course_authoring_part_materialization_for_actor_v1(
  uuid,uuid,uuid,uuid,bigint,bigint,text,jsonb,text,text
) set schema private;

alter function private.advance_course_authoring_part_materialization_for_actor_v1(
  uuid,uuid,uuid,uuid,bigint,bigint,text,jsonb,text,text
) rename to advance_course_authoring_part_materialization_core_v1;

create function public.get_owned_course_authoring_part_materialization_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_authoring_part_id uuid,
  p_materialization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_result jsonb;
  v_context jsonb;
  v_context_hash text;
begin
  v_result := private.get_owned_course_authoring_part_materialization_core_v1(
    p_actor_id,p_course_id,p_authoring_part_id,p_materialization_id
  );
  v_context := v_result#>'{materialization,designContext}';
  if jsonb_typeof(v_context) <> 'object'
     or v_context->>'contract' <> 'aralearn.course-design-context.v1'
     or v_context->>'componentCatalogVersion'
       <> private.course_component_catalog_v1()->>'version'
     or octet_length(v_context::text) > 65536 then
    raise exception 'Contexto selado da materialização é incompatível.'
      using errcode = '55000';
  end if;
  v_context_hash := private.course_design_json_hash_v1(v_context);
  return jsonb_set(
    v_result,'{materialization}',
    (v_result->'materialization')
      || jsonb_build_object('contextHash',v_context_hash),true
  );
end;
$function$;

create function public.advance_course_authoring_part_materialization_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_authoring_part_id uuid,
  p_materialization_id uuid,
  p_expected_course_revision bigint,
  p_expected_materialization_version bigint,
  p_operation text,
  p_payload jsonb,
  p_channel text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_context jsonb;
  v_context_hash text;
  v_core_payload jsonb;
  v_result jsonb;
  v_step private.course_authoring_part_materialization_steps%rowtype;
  v_application jsonb;
  v_result_facts jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if jsonb_typeof(p_payload) <> 'object'
     or p_operation not in ('start','record_step','finish') then
    raise exception 'Avanço da materialização inválido.'
      using errcode = '22023';
  end if;

  if p_operation = 'start' then
    if p_payload - 'authoringPartVersion' - 'steps' <> '{}'::jsonb
       or not (p_payload ?& array['authoringPartVersion','steps']) then
      raise exception 'start não aceita designContext enviado pelo cliente.'
        using errcode = '22023';
    end if;
    select materialization.design_context into v_context
    from private.course_authoring_part_materializations materialization
    where materialization.course_id = p_course_id
      and materialization.authoring_part_id = p_authoring_part_id
      and materialization.id = p_materialization_id;
    if not found then
      v_context := private.course_materialization_design_context_v1(
        p_course_id,p_authoring_part_id,p_expected_course_revision,
        p_payload->'steps'
      );
    end if;
    v_core_payload := p_payload
      || jsonb_build_object('designContext',v_context);
  elsif p_operation = 'record_step' then
    if p_payload - 'stepId' - 'expectedStepVersion' - 'status'
         - 'resultFacts' - 'entityChanges' - 'designApplication'
         <> '{}'::jsonb
       or not (p_payload ?& array[
         'stepId','expectedStepVersion','status','resultFacts',
         'entityChanges','designApplication'
       ])
       or jsonb_typeof(p_payload->'resultFacts') <> 'object'
       or p_payload->'resultFacts' ? 'designApplication' then
      raise exception 'record_step possui contrato de fatos inválido.'
        using errcode = '22023';
    end if;
    select step.* into v_step
    from private.course_authoring_part_materialization_steps step
    where step.course_id = p_course_id
      and step.materialization_id = p_materialization_id
      and step.id::text = p_payload->>'stepId';
    if not found then
      raise exception 'Etapa inexistente.' using errcode = 'PT404';
    end if;
    select materialization.design_context into strict v_context
    from private.course_authoring_part_materializations materialization
    where materialization.course_id = p_course_id
      and materialization.authoring_part_id = p_authoring_part_id
      and materialization.id = p_materialization_id;
    v_context_hash := private.course_design_json_hash_v1(v_context);
    v_application := p_payload->'designApplication';
    if (
      p_payload->>'status' = 'completed'
      and v_step.step_kind = 'didactic_microsequence_materialization'
    ) is distinct from (jsonb_typeof(v_application) = 'object') then
      raise exception 'designApplication não corresponde à espécie da etapa.'
        using errcode = '22023';
    end if;
    if jsonb_typeof(v_application) = 'object' then
      if v_application->>'didacticMicrosequenceId'
           <> v_step.target_didactic_microsequence_id
         or not private.valid_course_design_application_v1(
           v_context,v_context_hash,v_application
         ) then
        raise exception 'Aplicação factual do desenho é inválida.'
          using errcode = '23514';
      end if;
      v_result_facts := p_payload->'resultFacts'
        || jsonb_build_object('designApplication',v_application);
    else
      if v_application <> 'null'::jsonb then
        raise exception 'designApplication precisa ser objeto ou null.'
          using errcode = '22023';
      end if;
      v_result_facts := p_payload->'resultFacts';
    end if;
    if octet_length(v_result_facts::text) > 16384 then
      raise exception 'resultFacts excede 16 KiB após selar designApplication.'
        using errcode = '54000';
    end if;
    v_core_payload := (p_payload - 'designApplication')
      || jsonb_build_object('resultFacts',v_result_facts);
  else
    v_core_payload := p_payload;
  end if;

  v_result := private.advance_course_authoring_part_materialization_core_v1(
    p_actor_id,p_course_id,p_authoring_part_id,p_materialization_id,
    p_expected_course_revision,p_expected_materialization_version,
    p_operation,v_core_payload,p_channel,p_request_id
  );

  if p_operation = 'record_step'
     and jsonb_typeof(v_application) = 'object'
     and coalesce((v_result->>'idempotent')::boolean,false) is false then
    perform private.assert_course_design_application_materialized_v1(
      p_course_id,v_step.target_didactic_microsequence_id,
      v_application,p_payload->'entityChanges',v_context
    );
  end if;
  select materialization.design_context into strict v_context
  from private.course_authoring_part_materializations materialization
  where materialization.course_id = p_course_id
    and materialization.authoring_part_id = p_authoring_part_id
    and materialization.id = p_materialization_id;
  if v_context->>'contract' <> 'aralearn.course-design-context.v1'
     or v_context->>'componentCatalogVersion'
       <> private.course_component_catalog_v1()->>'version'
     or octet_length(v_context::text) > 65536 then
    raise exception 'Contexto selado da materialização é incompatível.'
      using errcode = '55000';
  end if;
  v_context_hash := private.course_design_json_hash_v1(v_context);
  return jsonb_set(
    v_result,'{materialization}',
    (v_result->'materialization') || jsonb_build_object(
      'designContext',v_context,'contextHash',v_context_hash
    ),true
  );
end;
$function$;



create function public.get_owned_course_design_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_scope_kind text,
  p_scope_ref text,
  p_child_limit integer default 32,
  p_child_cursor text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_course public.courses%rowtype;
  v_path jsonb;
  v_result jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  select * into strict v_course
  from public.courses course where course.id = p_course_id;
  v_path := private.course_design_scope_path_v1(
    p_course_id,p_scope_kind,p_scope_ref
  );
  if v_path is null then
    raise exception 'Escopo de desenho inexistente.' using errcode = 'PT404';
  end if;
  v_result := jsonb_build_object(
    'contract','aralearn.course-design.v1',
    'courseId',p_course_id,
    'courseRevision',v_course.revision,
    'parameterCatalogVersion','1.0.0',
    'scopeContext',private.course_design_scope_context_v1(
      p_course_id,p_scope_kind,p_scope_ref,p_child_limit,p_child_cursor
    ),
    'targetPlanItems',case
      when p_scope_kind = 'didactic_microsequence' then jsonb_build_object(
        'instructionalAnalysisUnitIds',coalesce((
          select jsonb_agg(to_jsonb(item.id) order by item.position,item.id)
          from private.course_design_target_plan_items assignment
          join private.course_instructional_plan_items item
            on item.course_id = assignment.course_id
           and item.id = assignment.plan_item_id
           and item.item_kind = assignment.plan_item_kind
          where assignment.course_id = p_course_id
            and assignment.didactic_microsequence_id = p_scope_ref
            and assignment.plan_item_kind = 'instructional_analysis_unit'
        ),'[]'::jsonb),
        'evidenceRequirementIds',coalesce((
          select jsonb_agg(to_jsonb(item.id) order by item.position,item.id)
          from private.course_design_target_plan_items assignment
          join private.course_instructional_plan_items item
            on item.course_id = assignment.course_id
           and item.id = assignment.plan_item_id
           and item.item_kind = assignment.plan_item_kind
          where assignment.course_id = p_course_id
            and assignment.didactic_microsequence_id = p_scope_ref
            and assignment.plan_item_kind = 'evidence_requirement'
        ),'[]'::jsonb)
      )
      else null
    end,
    'definitions',coalesce((
      select jsonb_agg(definition.definition order by definition.ordinal)
      from private.course_design_parameter_definitions definition
    ),'[]'::jsonb),
    'parameters',private.course_design_parameters_for_scope_v1(
      p_course_id,v_path
    ),
    'guidance',private.course_authoring_guidance_for_scope_v1(
      p_course_id,v_path
    ),
    'componentCatalog',private.course_component_catalog_v1(),
    'componentPolicy',private.course_component_policy_for_scope_v1(
      p_course_id,v_path
    ),
    'recentApplications',private.recent_course_design_applications_v1(
      p_course_id,p_scope_kind,p_scope_ref
    )
  );
  if octet_length(v_result::text) > 262144 then
    raise exception 'Leitura de desenho excede 256 KiB.'
      using errcode = '54000';
  end if;
  return v_result;
end;
$function$;

comment on function public.get_owned_course_design_for_actor_v1(
  uuid,uuid,text,text,integer,text
) is
  'Leitura owner-only scoped de parâmetros, guidance, policy, itens do alvo e aplicações.';

comment on function public.apply_course_design_command_for_actor_v1(
  uuid,uuid,bigint,jsonb,text,text
) is
  'Comando owner-only idempotente para desenho do Curso.';

comment on function public.get_owned_course_authoring_part_materialization_for_actor_v1(
  uuid,uuid,uuid,uuid
) is
  'Retoma materialização owner-only com contexto de desenho calculado e hash selado.';

comment on function public.advance_course_authoring_part_materialization_for_actor_v1(
  uuid,uuid,uuid,uuid,bigint,bigint,text,jsonb,text,text
) is
  'Avança materialização owner-only; calcula contexto e valida aplicação factual e policy atomicamente.';

revoke all on function private.course_component_catalog_v1(),
  private.course_design_json_hash_v1(jsonb),
  private.valid_course_design_parameter_value_v1(text,jsonb),
  private.canonical_course_design_parameter_value_v1(text,jsonb),
  private.valid_course_guidance_interpretation_v1(jsonb),
  private.valid_course_component_policy_v1(jsonb),
  private.course_design_scope_path_v1(uuid,text,text),
  private.course_design_scope_context_v1(uuid,text,text,integer,text),
  private.course_component_refs_from_content_v1(jsonb),
  private.valid_course_component_refs_in_content_v1(jsonb),
  private.course_component_policy_allows_v1(jsonb,text),
  private.course_design_parameters_for_scope_v1(uuid,jsonb),
  private.course_authoring_guidance_for_scope_v1(uuid,jsonb),
  private.course_component_policy_for_scope_v1(uuid,jsonb),
  private.course_design_application_summary_v1(jsonb),
  private.recent_course_design_applications_v1(uuid,text,text),
  private.course_materialization_design_context_v1(uuid,uuid,bigint,jsonb),
  private.valid_course_design_application_v1(jsonb,text,jsonb),
  private.assert_course_design_application_materialized_v1(
    uuid,text,jsonb,jsonb,jsonb
  ),
  private.get_owned_course_authoring_part_materialization_core_v1(
    uuid,uuid,uuid,uuid
  ),
  private.advance_course_authoring_part_materialization_core_v1(
    uuid,uuid,uuid,uuid,bigint,bigint,text,jsonb,text,text
  )
from public,anon,authenticated,service_role;

revoke all on function public.get_owned_course_design_for_actor_v1(
  uuid,uuid,text,text,integer,text
), public.apply_course_design_command_for_actor_v1(
  uuid,uuid,bigint,jsonb,text,text
), public.get_owned_course_authoring_part_materialization_for_actor_v1(
  uuid,uuid,uuid,uuid
), public.advance_course_authoring_part_materialization_for_actor_v1(
  uuid,uuid,uuid,uuid,bigint,bigint,text,jsonb,text,text
) from public,anon,authenticated;

grant execute on function public.get_owned_course_design_for_actor_v1(
  uuid,uuid,text,text,integer,text
), public.apply_course_design_command_for_actor_v1(
  uuid,uuid,bigint,jsonb,text,text
), public.get_owned_course_authoring_part_materialization_for_actor_v1(
  uuid,uuid,uuid,uuid
), public.advance_course_authoring_part_materialization_for_actor_v1(
  uuid,uuid,uuid,uuid,bigint,bigint,text,jsonb,text,text
) to service_role;

do $course_design_postflight$
declare
  v_signature text;
  v_definition text;
begin
  if exists(
    select 1 from information_schema.columns
    where table_schema = 'private'
      and table_name = 'course_instructional_plans'
      and column_name = 'authoring_guidance'
  ) then
    raise exception 'A orientação monolítica permaneceu no plano.'
      using errcode = '55000';
  end if;
  if (
    select array_agg(definition.parameter_id order by definition.ordinal)
    from private.course_design_parameter_definitions definition
  ) is distinct from array[
    'new_analysis_unit_ceiling_per_expository_study_unit',
    'required_explanation_forms',
    'minimum_distinct_practice_opportunities_per_evidence_requirement',
    'required_practice_variation_dimensions'
  ]::text[]
     or private.course_component_catalog_v1()->>'version' <> '1-3e5629f8'
     or jsonb_array_length(
       private.course_component_catalog_v1()->'options'
     ) <> 32 then
    raise exception 'Catálogos finais do desenho divergiram.'
      using errcode = '55000';
  end if;
  if to_regclass('private.course_design_target_plan_items') is null
     or to_regclass(
       'private.course_design_target_plan_items_item_v1_idx'
     ) is null
     or (
       select count(*)
       from pg_constraint constraint_value
       where constraint_value.conrelid =
         'private.course_design_target_plan_items'::regclass
         and constraint_value.contype = 'f'
         and constraint_value.confdeltype = 'c'
     ) <> 2
     or exists(
       select 1
       from unnest(array[
         'anon','authenticated','service_role'
       ]::text[]) role_name(value)
       cross join unnest(array[
         'select','insert','update','delete'
       ]::text[]) privilege(value)
       where has_table_privilege(
         role_name.value,
         'private.course_design_target_plan_items',
         privilege.value
       )
     ) then
    raise exception 'Relação corrente de itens por alvo divergiu.'
      using errcode = '55000';
  end if;
  foreach v_signature in array array[
    'private.course_instructional_plan_command_document_v1(uuid)',
    'private.get_course_instructional_plan_for_actor_v1(uuid,uuid,integer)',
    'public.commit_course_instructional_plan_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,jsonb,text,text)',
    'private.list_courses_for_actor_v1(uuid,text,integer,timestamptz,uuid)',
    'public.list_owned_courses_for_actor_v1(uuid,text,integer,timestamptz,uuid)',
    'public.create_course_for_actor_v1(uuid,text,text,text)',
    'public.get_owned_course_design_for_actor_v1(uuid,uuid,text,text,integer,text)',
    'public.apply_course_design_command_for_actor_v1(uuid,uuid,bigint,jsonb,text,text)',
    'public.get_owned_course_authoring_part_materialization_for_actor_v1(uuid,uuid,uuid,uuid)',
    'public.advance_course_authoring_part_materialization_for_actor_v1(uuid,uuid,uuid,uuid,bigint,bigint,text,jsonb,text,text)'
  ] loop
    if to_regprocedure(v_signature) is null then
      raise exception 'Função final do desenho ausente: %.',v_signature
        using errcode = '55000';
    end if;
  end loop;
  foreach v_signature in array array[
    'private.course_instructional_plan_command_document_v1(uuid)',
    'private.get_course_instructional_plan_for_actor_v1(uuid,uuid,integer)',
    'public.commit_course_instructional_plan_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,jsonb,text,text)',
    'private.list_courses_for_actor_v1(uuid,text,integer,timestamptz,uuid)',
    'public.create_course_for_actor_v1(uuid,text,text,text)'
  ] loop
    select pg_get_functiondef(to_regprocedure(v_signature)::oid)
      into v_definition;
    if strpos(v_definition,'authoringGuidance') > 0
       or strpos(v_definition,'authoring_guidance') > 0 then
      raise exception 'Função do plano ainda projeta orientação monolítica: %.',
        v_signature using errcode = '55000';
    end if;
  end loop;
  select pg_get_functiondef(
    'public.advance_course_authoring_part_materialization_for_actor_v1(uuid,uuid,uuid,uuid,bigint,bigint,text,jsonb,text,text)'::regprocedure::oid
  ) into v_definition;
  if strpos(v_definition,'course_materialization_design_context_v1') = 0
     or strpos(v_definition,'valid_course_design_application_v1') = 0
     or strpos(v_definition,
       'assert_course_design_application_materialized_v1') = 0 then
    raise exception 'Cercas da materialização de desenho não foram instaladas.'
      using errcode = '55000';
  end if;
  select pg_get_functiondef(
    'public.apply_course_design_command_for_actor_v1(uuid,uuid,bigint,jsonb,text,text)'::regprocedure::oid
  ) into v_definition;
  if strpos(v_definition,'set_target_plan_items') = 0
     or strpos(v_definition,'course_design_target_plan_items') = 0 then
    raise exception 'Comando de itens por alvo não foi instalado.'
      using errcode = '55000';
  end if;
  select pg_get_functiondef(
    'public.get_owned_course_design_for_actor_v1(uuid,uuid,text,text,integer,text)'::regprocedure::oid
  ) into v_definition;
  if strpos(v_definition,'targetPlanItems') = 0 then
    raise exception 'Leitura de itens por alvo não foi instalada.'
      using errcode = '55000';
  end if;
end;
$course_design_postflight$;

do $advance_course_design_runtime_manifest$
declare
  v_manifest jsonb;
  v_features jsonb;
  v_body text;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision' <> '20260817170000'
     or (v_manifest->>'contractVersion')::integer <> 1 then
    raise exception 'Manifesto concorrente aos parâmetros de desenho.'
      using errcode = '55000';
  end if;
  select jsonb_agg(feature.value order by feature.ordinal)
  into v_features
  from (
    select existing.value,existing.ordinal
    from jsonb_array_elements_text(v_manifest->'features')
      with ordinality existing(value,ordinal)
    union all
    select 'course-design-parameters-v1',1000003::bigint
    union all
    select 'course-authoring-guidance-v1',1000004::bigint
    union all
    select 'course-component-policy-v1',1000005::bigint
  ) feature;
  v_manifest := jsonb_build_object(
    'schemaRevision','20260817180000',
    'contractVersion',1,
    'features',v_features
  );
  v_body := 'select ' || quote_literal(v_manifest::text) || '::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      || 'returns jsonb language sql stable security definer '
      || 'set search_path = pg_catalog as %L',
    v_body
  );
  revoke all on function public.get_aralearn_runtime_manifest()
    from public,anon,authenticated,service_role;
  grant execute on function public.get_aralearn_runtime_manifest()
    to anon,authenticated,service_role;
end;
$advance_course_design_runtime_manifest$;

commit;
