begin;
-- Catálogo tipado, intenção automática e perfis por cópia. Não reescreve conteúdo.
drop trigger course_design_parameter_definitions_immutable_v1 on private.course_design_parameter_definitions;
alter table private.course_design_parameter_definitions
  drop constraint course_design_parameter_definitions_id_v2,
  drop constraint course_design_parameter_definitions_kind_v1,
  drop constraint course_design_parameter_definitions_scope_v2,
  drop constraint course_design_parameter_definitions_payload_v1;
-- COURSE_DESIGN_CATALOG_BEGIN
-- Gerado por scripts/syncCourseDesignParameterCatalog.mjs; fonte: src/domain/courseDesignParameters.js.
insert into private.course_design_parameter_definitions(parameter_id,ordinal,catalog_version,value_kind,supported_scopes,definition,default_value) values
('new_analysis_unit_ceiling_per_expository_study_unit',1,'1.2.0','integer',array['course','lesson','didactic_microsequence','study_unit']::text[],'{"id":"new_analysis_unit_ceiling_per_expository_study_unit","humanField":"maximo_ideias_novas_por_unidade","group":"content","groupLabel":"Conteúdo","unitLabel":"identidades introduzidas","optionLabels":{},"label":"Novas unidades de análise por unidade expositiva","construct":"Quantidade de unidades da análise instrucional introduzidas como novas em uma mesma unidade de estudo expositiva.","operationalization":"Conta identidades distintas declaradas como introduzidas em cada unidade expositiva ou mista; não usa caracteres, linhas, altura nem tempo como proxy.","limitations":"A contagem orienta granularidade de desenho e não mede carga cognitiva, dificuldade, aprendizagem ou qualidade da explicação.","defaultStatus":"product_hypothesis","evidenceRefs":["koedinger2012kli","chen2023elementinteractivity"],"supportedScopes":["course","lesson","didactic_microsequence","study_unit"],"valueSchema":{"type":"integer","minimum":1,"maximum":64},"defaultValue":2}'::jsonb,'2'::jsonb),
('required_explanation_forms',2,'1.2.0','set',array['course','lesson','didactic_microsequence','study_unit']::text[],'{"id":"required_explanation_forms","humanField":"formas_de_explicacao","group":"content","groupLabel":"Conteúdo","unitLabel":"formas de explicação","optionLabels":{"plain_definition":"Definição","concrete_example":"Exemplo concreto","mechanism":"Mecanismo","contrast":"Contraste","application_condition":"Condição de aplicação","limit_or_exception":"Limite ou exceção","worked_example":"Exemplo resolvido","representation_link":"Relação entre representações"},"label":"Formas de explicação requeridas","construct":"Formas semanticamente distintas usadas para desenvolver uma unidade da análise instrucional.","operationalization":"Verifica, por identidade introduzida, quais formas foram desenvolvidas e quais foram declaradas não aplicáveis com motivo factual.","limitations":"As formas não são uma escala de qualidade nem uma lista universal; adequação depende do objeto, público, tarefa e representação.","defaultStatus":"product_hypothesis","evidenceRefs":["wittwer2008explanations","ainsworth2006deft"],"supportedScopes":["course","lesson","didactic_microsequence","study_unit"],"valueSchema":{"type":"set","allowedValues":["plain_definition","concrete_example","mechanism","contrast","application_condition","limit_or_exception","worked_example","representation_link"],"minimumItems":1,"maximumItems":8},"defaultValue":["plain_definition","concrete_example","mechanism","contrast"]}'::jsonb,'["plain_definition","concrete_example","mechanism","contrast"]'::jsonb),
('minimum_distinct_practice_opportunities_per_evidence_requirement',3,'1.2.0','integer',array['course','lesson','didactic_microsequence','study_unit']::text[],'{"id":"minimum_distinct_practice_opportunities_per_evidence_requirement","humanField":"oportunidades_distintas_por_requisito","group":"practice","groupLabel":"Prática","unitLabel":"oportunidades distintas","optionLabels":{},"label":"Oportunidades distintas por requisito de evidência","construct":"Quantidade mínima de oportunidades semanticamente distintas relacionadas a cada requisito de evidência.","operationalization":"Conta opportunityId distinto por requisito de evidência e conserva a operação-alvo invariável declarada em cada oportunidade.","limitations":"Quantidade de oportunidades não demonstra domínio, eficácia ou equivalência entre tarefas; a pertinência da evidência permanece uma hipótese de desenho.","defaultStatus":"product_hypothesis","evidenceRefs":["karpicke2008retrieval","mislevy2003ecd"],"supportedScopes":["course","lesson","didactic_microsequence","study_unit"],"valueSchema":{"type":"integer","minimum":1,"maximum":64},"defaultValue":2}'::jsonb,'2'::jsonb),
('required_practice_variation_dimensions',4,'1.2.0','set',array['course','lesson','didactic_microsequence','study_unit']::text[],'{"id":"required_practice_variation_dimensions","humanField":"dimensoes_de_variacao_da_pratica","group":"practice","groupLabel":"Prática","unitLabel":"dimensões de variação","optionLabels":{"case_or_data":"Caso ou dados","context":"Contexto","task_feature":"Característica da tarefa","external_representation":"Representação","support_level":"Nível de apoio"},"label":"Dimensões requeridas de variação da prática","construct":"Dimensões semanticamente relevantes que variam entre oportunidades relacionadas ao mesmo requisito de evidência.","operationalization":"Verifica as dimensões declaradas nas oportunidades sem tratar mudança cosmética ou reordenação como variação semântica.","limitations":"Variação declarada não prova transferência nem aprendizagem e precisa preservar a operação-alvo pertinente ao requisito.","defaultStatus":"product_hypothesis","evidenceRefs":["taylor2010interleaved","ainsworth2006deft"],"supportedScopes":["course","lesson","didactic_microsequence","study_unit"],"valueSchema":{"type":"set","allowedValues":["case_or_data","context","task_feature","external_representation","support_level"],"minimumItems":1,"maximumItems":5},"defaultValue":["case_or_data"]}'::jsonb,'["case_or_data"]'::jsonb),
('authoring_chat_response_word_target',5,'1.2.0','integer',array['course','lesson','didactic_microsequence','study_unit']::text[],'{"id":"authoring_chat_response_word_target","humanField":"alvo_palavras_conversa","group":"conversation","groupLabel":"Conversa","unitLabel":"palavras por resposta","optionLabels":{},"label":"Alvo de palavras por resposta de autoria","construct":"Extensão editorial pretendida para uma resposta do assistente durante a autoria.","operationalization":"Informa ao assistente um alvo flexível de palavras para a decisão corrente; respostas podem ultrapassá-lo quando a inspeção ou a segurança exigir.","limitations":"O alvo não é limite rígido e não autoriza esconder decisões educacionais, reduzir cobertura nem expor detalhes internos.","defaultStatus":"product_hypothesis","evidenceRefs":[],"supportedScopes":["course","lesson","didactic_microsequence","study_unit"],"valueSchema":{"type":"integer","minimum":20,"maximum":500},"defaultValue":120}'::jsonb,'120'::jsonb),
('study_unit_content_word_target',6,'1.2.0','integer',array['course','lesson','didactic_microsequence','study_unit']::text[],'{"id":"study_unit_content_word_target","humanField":"alvo_palavras_unidade","group":"content","groupLabel":"Conteúdo","unitLabel":"palavras por unidade","optionLabels":{},"label":"Alvo de palavras por unidade de estudo","construct":"Extensão editorial pretendida para o conteúdo de uma unidade de estudo focal.","operationalization":"Orienta a distribuição do conteúdo em torno de um alvo flexível, depois de satisfeitas a função didática e as dependências necessárias.","limitations":"O alvo não é máximo, não mede qualidade ou carga cognitiva e não justifica compactação nem atomização.","defaultStatus":"product_hypothesis","evidenceRefs":[],"supportedScopes":["course","lesson","didactic_microsequence","study_unit"],"valueSchema":{"type":"integer","minimum":40,"maximum":1000},"defaultValue":180}'::jsonb,'180'::jsonb),
('practice_distribution',7,'1.2.0','enum',array['course','lesson','didactic_microsequence','study_unit']::text[],'{"id":"practice_distribution","humanField":"distribuicao_da_pratica","group":"practice","groupLabel":"Prática","unitLabel":"organização da sequência","label":"Distribuição das práticas","construct":"Organização das oportunidades de prática entre as exposições.","operationalization":"Observa posições e intervalos das unidades declaradas expositivas, práticas ou mistas; intercalar prefere prática entre exposições e agrupar prefere blocos.","limitations":"A distribuição é contextual; uma sequência curta ou mista não permite certificar alternância nem qualidade por contagem.","defaultStatus":"product_hypothesis","evidenceRefs":[],"supportedScopes":["course","lesson","didactic_microsequence","study_unit"],"valueSchema":{"type":"enum","allowedValues":["interleaved","clustered"]},"optionLabels":{"interleaved":"Intercalada","clustered":"Agrupada"},"defaultValue":"interleaved"}'::jsonb,'"interleaved"'::jsonb),
('practice_position',8,'1.2.0','enum',array['course','lesson','didactic_microsequence','study_unit']::text[],'{"id":"practice_position","humanField":"posicao_da_pratica","group":"practice","groupLabel":"Prática","unitLabel":"posição em relação à explicação","label":"Posição das práticas","construct":"Posição pretendida da prática em relação à explicação pertinente.","operationalization":"Orienta prática antes, depois ou antes e depois da explicação; posições declaradas são observáveis sem inferir equivalência semântica.","limitations":"A posição não demonstra recuperação, domínio ou eficácia e precisa de justificativa compatível com o repertório e o objetivo.","defaultStatus":"product_hypothesis","evidenceRefs":[],"supportedScopes":["course","lesson","didactic_microsequence","study_unit"],"valueSchema":{"type":"enum","allowedValues":["before_explanation","after_explanation","before_and_after"]},"optionLabels":{"before_explanation":"Antes da explicação","after_explanation":"Depois da explicação","before_and_after":"Antes e depois"},"defaultValue":"after_explanation"}'::jsonb,'"after_explanation"'::jsonb),
('authoring_part_microsequence_target',9,'1.2.0','integer',array['course']::text[],'{"id":"authoring_part_microsequence_target","humanField":"alvo_microssequencias_por_parte","group":"cadence","groupLabel":"Cadência","unitLabel":"microssequências por parte","label":"Granularidade da parte","construct":"Tamanho contextual da parte de produção, independente da quantidade de conteúdo curricular.","operationalization":"Orienta quantas microssequências existentes uma parte de produção pretende reunir, preservando cobertura, dependências e limites de transporte.","limitations":"Uma parte é uma organização de trabalho; não é unidade curricular nem autoriza truncar material ou dividir identidades para caber.","defaultStatus":"product_hypothesis","evidenceRefs":[],"supportedScopes":["course"],"valueSchema":{"type":"integer","minimum":1,"maximum":64},"optionLabels":{},"defaultValue":1}'::jsonb,'1'::jsonb),
('authoring_batch_part_target',10,'1.2.0','integer',array['course']::text[],'{"id":"authoring_batch_part_target","humanField":"alvo_partes_por_lote","group":"cadence","groupLabel":"Cadência","unitLabel":"partes por lote","label":"Granularidade do lote","construct":"Quantidade contextual de partes a preparar no mesmo lote autorizado.","operationalization":"Orienta a cadência do trabalho mantendo cada parte e sua confirmação; não altera automaticamente frequência de pausa.","limitations":"Número de lotes não mede conteúdo nem aprendizagem e não amplia o mandato de aplicar propostas.","defaultStatus":"product_hypothesis","evidenceRefs":[],"supportedScopes":["course"],"valueSchema":{"type":"integer","minimum":1,"maximum":64},"optionLabels":{},"defaultValue":1}'::jsonb,'1'::jsonb),
('authoring_pause_frequency',11,'1.2.0','enum',array['course']::text[],'{"id":"authoring_pause_frequency","humanField":"frequencia_de_pausa","group":"cadence","groupLabel":"Cadência","unitLabel":"momento de pausa","label":"Frequência de pausa","construct":"Preferência por pontos de discussão e revisão durante a produção.","operationalization":"Define pontos de pausa por microssequência, parte, lote ou solicitação; permanece independente da granularidade da parte e do lote.","limitations":"A preferência não remove confirmações de aplicação, autorização do autor nem limites operacionais.","defaultStatus":"product_hypothesis","evidenceRefs":[],"supportedScopes":["course"],"valueSchema":{"type":"enum","allowedValues":["each_microsequence","each_part","each_batch","on_request"]},"optionLabels":{"each_microsequence":"A cada microssequência","each_part":"A cada parte","each_batch":"A cada lote","on_request":"Quando solicitado"},"defaultValue":"each_part"}'::jsonb,'"each_part"'::jsonb),
('authoring_chat_interaction',12,'1.2.0','enum',array['course','lesson','didactic_microsequence','study_unit']::text[],'{"id":"authoring_chat_interaction","humanField":"preferencia_da_conversa","group":"conversation","groupLabel":"Conversa","unitLabel":"forma da conversa","label":"Preferência da conversa","construct":"Preferência editorial por concisão, debate ou explicação na conversa de autoria.","operationalization":"Orienta como o assistente discute a decisão corrente: concisão, exame de alternativas e argumentos, ou explicação desenvolvida.","limitations":"Concisão no chat não autoriza resumir material didático, ocultar incerteza ou substituir a decisão humana.","defaultStatus":"product_hypothesis","evidenceRefs":[],"supportedScopes":["course","lesson","didactic_microsequence","study_unit"],"valueSchema":{"type":"enum","allowedValues":["concise","debate","explanation"]},"optionLabels":{"concise":"Concisão","debate":"Debate","explanation":"Explicação"},"defaultValue":"concise"}'::jsonb,'"concise"'::jsonb)
on conflict(parameter_id) do update set ordinal=excluded.ordinal,catalog_version=excluded.catalog_version,value_kind=excluded.value_kind,supported_scopes=excluded.supported_scopes,definition=excluded.definition,default_value=excluded.default_value;
-- COURSE_DESIGN_CATALOG_END
alter table private.course_design_parameter_definitions
  add constraint course_design_parameter_definitions_id_v1 check(parameter_id~'^[a-z][a-z0-9_]{0,159}$' and catalog_version='1.2.0' and ordinal between 1 and 12),
  add constraint course_design_parameter_definitions_kind_v1 check(value_kind in('integer','set','enum')),
  add constraint course_design_parameter_definitions_scope_v1 check(cardinality(supported_scopes)>0 and supported_scopes <@ array['course','lesson','didactic_microsequence','study_unit']::text[]),
  add constraint course_design_parameter_definitions_payload_v1 check(jsonb_typeof(definition)='object' and octet_length(definition::text)<=8192 and jsonb_typeof(default_value) in('number','array','string') and octet_length(default_value::text)<=4096);
create trigger course_design_parameter_definitions_immutable_v1 before update or delete on private.course_design_parameter_definitions for each row execute function private.reject_course_design_parameter_definition_change_v1();

create or replace function private.valid_course_design_parameter_value_v1(p_parameter_id text,p_value jsonb)
returns boolean language plpgsql stable security definer set search_path=pg_catalog,private as $function$
declare d private.course_design_parameter_definitions%rowtype;
begin
  select * into d from private.course_design_parameter_definitions where parameter_id=p_parameter_id;
  if not found or p_value is null or octet_length(p_value::text)>4096 then return false; end if;
  if d.value_kind='integer' then
    return jsonb_typeof(p_value)='number' and p_value#>>'{}'~'^[0-9]+$'
      and (p_value#>>'{}')::numeric between (d.definition#>>'{valueSchema,minimum}')::integer and (d.definition#>>'{valueSchema,maximum}')::integer;
  elsif d.value_kind='enum' then
    return jsonb_typeof(p_value)='string' and d.definition#>'{valueSchema,allowedValues}' ? (p_value#>>'{}');
  end if;
  return jsonb_typeof(p_value)='array'
    and jsonb_array_length(p_value) between (d.definition#>>'{valueSchema,minimumItems}')::integer and (d.definition#>>'{valueSchema,maximumItems}')::integer
    and not exists(select 1 from jsonb_array_elements(p_value) i where jsonb_typeof(i)<>'string' or not (d.definition#>'{valueSchema,allowedValues}' ? (i#>>'{}')))
    and (select count(*)=count(distinct i) from jsonb_array_elements(p_value) i);
exception when others then return false;
end $function$;

alter table private.course_design_parameter_assignments add column mode text not null default 'fixed';
update private.course_design_parameter_assignments set mode='automatic' where origin='automatic';
alter table private.course_design_parameter_assignments
  drop constraint course_design_parameter_assignments_value_v1,
  add constraint course_design_parameter_assignments_value_v1 check(
    mode in('fixed','automatic') and not(mode='fixed' and origin='automatic')
    and not(mode='automatic' and origin in('research_condition','migration'))
    and (mode='automatic' and value='null'::jsonb or private.valid_course_design_parameter_value_v1(parameter_id,value)));

create or replace function private.course_current_design_parameters_v1(p_course_id uuid,p_scope_path jsonb)
returns jsonb language sql stable security definer set search_path=pg_catalog,private as $function$
  with scopes as materialized(select value->>'kind' kind,value->>'ref' ref,ordinality depth from jsonb_array_elements(p_scope_path) with ordinality),
  applicable as materialized(select a.*,s.depth from private.course_design_parameter_assignments a join scopes s on s.kind=a.scope_kind and s.ref=a.scope_ref where a.course_id=p_course_id),
  target as(select * from scopes order by depth desc limit 1)
  select coalesce(jsonb_agg(jsonb_build_object('parameterId',d.parameter_id,
    'localAssignment',case when l.parameter_id is null then null else jsonb_build_object('mode',l.mode,'value',l.value,'origin',l.origin,'reason',l.reason) end,
    'effectiveAssignment',case when e.parameter_id is null then jsonb_build_object('mode','automatic','value',null,'origin','system_default','reason','Escolha delegada ao contexto; ainda não aplicada.','sourceScope',null,'inherited',false)
      else jsonb_build_object('mode',e.mode,'value',e.value,'origin',e.origin,'reason',e.reason,'sourceScope',jsonb_build_object('kind',e.scope_kind,'ref',e.scope_ref),'inherited',e.scope_kind<>target.kind or e.scope_ref<>target.ref) end,
    'conflicts',coalesce((select jsonb_agg(jsonb_build_object('fixedScope',jsonb_build_object('kind',r.scope_kind,'ref',r.scope_ref),'fixedValue',r.value,'exceptionScope',jsonb_build_object('kind',x.scope_kind,'ref',x.scope_ref),'exceptionValue',x.value) order by r.depth,x.depth)
      from applicable r join applicable x on x.parameter_id=r.parameter_id and x.depth>r.depth
      where r.parameter_id=d.parameter_id and r.origin='research_condition' and x.origin in('author','research_condition','migration') and (x.mode<>'fixed' or x.value<>r.value)),'[]'::jsonb)
  ) order by d.ordinal),'[]'::jsonb)
  from private.course_design_parameter_definitions d cross join target
  left join lateral(select * from applicable a where a.parameter_id=d.parameter_id order by (a.origin='research_condition') desc,(a.mode='fixed') desc,a.depth desc limit 1) e on true
  left join lateral(select * from applicable a where a.parameter_id=d.parameter_id and a.scope_kind=target.kind and a.scope_ref=target.ref) l on true
$function$;

create function private.course_design_research_conflicts_v1(p_course_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,private as $function$
  select coalesce(jsonb_agg(jsonb_build_object('parameterId',r.parameter_id,'fixedScope',jsonb_build_object('kind',r.scope_kind,'ref',r.scope_ref),'fixedValue',r.value,'exceptionScope',jsonb_build_object('kind',x.scope_kind,'ref',x.scope_ref),'exceptionValue',x.value) order by r.parameter_id,r.scope_kind,r.scope_ref,x.scope_kind,x.scope_ref),'[]'::jsonb)
  from private.course_design_parameter_assignments r join private.course_design_parameter_assignments x on x.course_id=r.course_id and x.parameter_id=r.parameter_id and row(x.scope_kind,x.scope_ref)<>row(r.scope_kind,r.scope_ref)
  where r.course_id=p_course_id and r.origin='research_condition' and x.origin in('author','research_condition','migration') and (x.mode<>'fixed' or x.value<>r.value)
    and private.course_design_scope_path_v1(p_course_id,x.scope_kind,x.scope_ref) @> jsonb_build_array(jsonb_build_object('kind',r.scope_kind,'ref',r.scope_ref))
$function$;
revoke all on function private.course_design_research_conflicts_v1(uuid) from public,anon,authenticated,service_role;

-- Reutiliza o recibo limitado existente; somente operações de perfil não têm curso.
alter table private.course_change_receipts alter column course_id drop not null;
do $receipt_operations$
declare name text; expression text;
begin
  select conname,pg_get_constraintdef(oid) into name,expression from pg_constraint where conrelid='private.course_change_receipts'::regclass and contype='c' and pg_get_constraintdef(oid) like '%operation%';
  execute format('alter table private.course_change_receipts drop constraint %I',name);
  expression:=replace(expression,'''apply_course_design_command_v2''::text','''apply_course_design_command_v3''::text, ''save_authoring_profile''::text, ''delete_authoring_profile''::text, ''apply_authoring_profile''::text');
  update private.course_change_receipts set operation='apply_course_design_command_v3',result=jsonb_set(result,'{contract}','"aralearn.course-design-change.v3"') where operation='apply_course_design_command_v2';
  execute format('alter table private.course_change_receipts add constraint %I %s',name,expression);
end $receipt_operations$;
-- Recibos úteis da operação substituída continuam reconciliáveis no mesmo writer v3.
alter table private.course_change_receipts add constraint course_change_receipts_profile_scope_v1 check((course_id is null)=(operation in('save_authoring_profile','delete_authoring_profile')));

CREATE OR REPLACE FUNCTION public.get_owned_course_design_for_actor_v3(p_actor_id uuid, p_course_id uuid, p_scope_kind text, p_scope_ref text, p_child_limit integer DEFAULT 32, p_child_cursor text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_course public.courses%rowtype;
  v_path jsonb;
  v_target_microsequence_ref text;
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
  v_target_microsequence_ref:=case when p_scope_kind='didactic_microsequence'
    then p_scope_ref else null end;
  if p_scope_kind='study_unit' then
    select unit.parent_id into v_target_microsequence_ref
    from private.course_entities unit
    where unit.course_id=p_course_id and unit.entity_type='study_unit'
      and unit.entity_id=p_scope_ref;
  end if;
  v_result := jsonb_build_object(
    'contract','aralearn.course-design.v3',
    'courseId',p_course_id,
    'courseRevision',v_course.revision,
    'parameterCatalogVersion','1.2.0',
    'scopeContext',private.course_design_scope_context_v1(
      p_course_id,p_scope_kind,p_scope_ref,p_child_limit,p_child_cursor
    ),
    'targetPlanItems',case
      when p_scope_kind in('didactic_microsequence','study_unit')
        then jsonb_build_object(
        'instructionalAnalysisUnitIds',coalesce((
          select jsonb_agg(to_jsonb(item.id) order by item.position,item.id)
          from private.course_design_target_plan_items assignment
          join private.course_instructional_plan_items item
            on item.course_id = assignment.course_id
           and item.id = assignment.plan_item_id
           and item.item_kind = assignment.plan_item_kind
          where assignment.course_id = p_course_id
            and assignment.didactic_microsequence_id = v_target_microsequence_ref
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
            and assignment.didactic_microsequence_id = v_target_microsequence_ref
            and assignment.plan_item_kind = 'evidence_requirement'
        ),'[]'::jsonb)
      ) else null end,
    'definitions',coalesce((
      select jsonb_agg(definition.definition order by definition.ordinal)
      from private.course_design_parameter_definitions definition
    ),'[]'::jsonb),
    'parameters',private.course_current_design_parameters_v1(p_course_id,v_path),
    'guidance',private.course_current_authoring_guidance_v1(p_course_id,v_path),
    'componentCatalog',private.course_component_catalog_v1(),
    'componentPolicy',private.course_current_component_policy_v1(p_course_id,v_path)
  );
  if octet_length(v_result::text) > 262144 then
    raise exception 'Leitura de desenho excede 256 KiB.' using errcode = '54000';
  end if;
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_course_design_command_for_actor_v3(p_actor_id uuid, p_course_id uuid, p_expected_course_revision bigint, p_command jsonb, p_request_id text, p_request_hash text, p_channel text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_receipt private.course_change_receipts%rowtype;
  v_course public.courses%rowtype;
  v_type text;
  v_scope_kind text;
  v_scope_ref text;
  v_changed boolean := false;
  v_result jsonb;
  v_affected_rows bigint;
  v_before_conflicts jsonb;
  v_value jsonb;
  v_mode text;
  v_origin text;
  v_reason text;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_course_revision is null or p_expected_course_revision < 1
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
     or p_channel is null or p_channel not in ('application','mcp','actions')
     or jsonb_typeof(p_command) is distinct from 'object'
     or octet_length(p_command::text) > 32768 then
    raise exception 'Comando de desenho inválido.' using errcode = '22023';
  end if;
  v_type := p_command->>'type';
  if v_type is null or v_type not in(
    'set_parameter','clear_parameter','delegate_parameter',
    'set_guidance','clear_guidance',
    'set_component_policy','clear_component_policy'
  ) or jsonb_typeof(p_command->'scope') is distinct from 'object'
     or not (p_command->'scope' ?& array['kind','ref'])
     or (p_command->'scope') - 'kind' - 'ref' <> '{}'::jsonb then
    raise exception 'Tipo ou escopo do desenho inválido.' using errcode = '22023';
  end if;
  v_scope_kind := p_command#>>'{scope,kind}';
  v_scope_ref := p_command#>>'{scope,ref}';
  if private.course_design_scope_path_v1(
    p_course_id,v_scope_kind,v_scope_ref
  ) is null then
    raise exception 'Escopo de desenho inexistente.' using errcode = 'PT404';
  end if;
  if v_type in('set_parameter','clear_parameter','delegate_parameter')
     and v_scope_kind not in('course','lesson','didactic_microsequence','study_unit') then
    raise exception 'Escopo de parâmetro inválido.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:' || p_actor_id::text || ':' || p_request_id,0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  select * into v_receipt from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'apply_course_design_command_v3'
       or v_receipt.course_id <> p_course_id
       or v_receipt.request_hash <> p_request_hash then
      raise exception 'requestId reutilizado com desenho incompatível.'
        using errcode = '23514';
    end if;
    return (v_receipt.result - 'idempotent')
      || jsonb_build_object('idempotent',true);
  end if;

  perform 1 from auth.users actor where actor.id=p_actor_id for key share;
  if not found then
    raise exception 'Pessoa inexistente ou inacessível.' using errcode='PT404';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'course-row:'||p_course_id::text,0
  ));
  select * into strict v_course
  from public.courses course where course.id = p_course_id for update;
  if v_course.revision <> p_expected_course_revision then
    raise exception 'O Curso mudou; releia antes de alterar o desenho.'
      using errcode = '40001';
  end if;

  v_before_conflicts:=private.course_design_research_conflicts_v1(p_course_id);
  if v_type in('set_parameter','clear_parameter','delegate_parameter') then
    if not (p_command ? 'parameterId') or not exists(select 1 from private.course_design_parameter_definitions d where d.parameter_id=p_command->>'parameterId' and v_scope_kind=any(d.supported_scopes)) then
      raise exception 'Parâmetro ou escopo inválido.' using errcode='22023';
    end if;
    if v_type='clear_parameter' then
      if p_command-'type'-'scope'-'parameterId'<>'{}'::jsonb then raise exception 'Limpeza inválida.' using errcode='22023'; end if;
      delete from private.course_design_parameter_assignments where course_id=p_course_id and parameter_id=p_command->>'parameterId' and scope_kind=v_scope_kind and scope_ref=v_scope_ref;
      get diagnostics v_affected_rows=row_count;
      v_changed:=v_affected_rows>0;
    else
      if v_type='delegate_parameter' then
        if not(p_command ? 'reason') or p_command-'type'-'scope'-'parameterId'-'reason'<>'{}'::jsonb then raise exception 'Delegação inválida.' using errcode='22023'; end if;
        v_value:='null'::jsonb; v_mode:='automatic'; v_origin:='author';
      else
        if not(p_command ?& array['value','origin','reason']) or p_command-'type'-'scope'-'parameterId'-'value'-'origin'-'reason'<>'{}'::jsonb or not private.valid_course_design_parameter_value_v1(p_command->>'parameterId',p_command->'value') or p_command->>'origin' not in('automatic','author','research_condition') then
          raise exception 'Atribuição inválida.' using errcode='22023';
        end if;
        v_value:=p_command->'value'; v_origin:=p_command->>'origin'; v_mode:=case when v_origin='automatic' then 'automatic' else 'fixed' end;
        if jsonb_typeof(v_value)='array' then select jsonb_agg(i order by i#>>'{}') into v_value from jsonb_array_elements(v_value) i; end if;
      end if;
      v_reason:=p_command->>'reason';
      if jsonb_typeof(p_command->'reason')<>'string' or nullif(btrim(v_reason),'') is null or char_length(v_reason)>1000 or v_reason<>btrim(v_reason) or translate(v_reason,E'\n\r\t','')~'[[:cntrl:]]' then raise exception 'Justificativa inválida.' using errcode='22023'; end if;
      -- Escolha automática nunca grava sobre uma fixação em qualquer ancestral.
      if v_origin<>'automatic' or not exists(select 1 from private.course_design_parameter_assignments a where a.course_id=p_course_id and a.parameter_id=p_command->>'parameterId' and a.mode='fixed' and private.course_design_scope_path_v1(p_course_id,v_scope_kind,v_scope_ref) @> jsonb_build_array(jsonb_build_object('kind',a.scope_kind,'ref',a.scope_ref))) then
        insert into private.course_design_parameter_assignments(course_id,parameter_id,scope_kind,scope_ref,mode,value,origin,reason)
        values(p_course_id,p_command->>'parameterId',v_scope_kind,v_scope_ref,v_mode,v_value,v_origin,v_reason)
        on conflict(course_id,parameter_id,scope_kind,scope_ref) do update set mode=excluded.mode,value=excluded.value,origin=excluded.origin,reason=excluded.reason,updated_at=now()
        where row(course_design_parameter_assignments.mode,course_design_parameter_assignments.value,course_design_parameter_assignments.origin,course_design_parameter_assignments.reason) is distinct from row(excluded.mode,excluded.value,excluded.origin,excluded.reason);
        get diagnostics v_affected_rows=row_count;
        v_changed:=v_affected_rows>0;
      end if;
    end if;
  elsif v_type in('set_guidance','clear_guidance') then
    if p_command - 'type' - 'scope' - 'guidance' - 'origin' - 'reason'
         <> '{}'::jsonb then
      raise exception 'Direção editorial inválida.' using errcode = '22023';
    end if;
    if v_type = 'set_guidance' then
      if not (p_command ?& array['guidance','origin','reason'])
         or nullif(btrim(p_command->>'guidance'),'') is null
         or octet_length(p_command->>'guidance') > 8192
         or p_command->>'origin' not in('automatic','author','research_condition')
         or nullif(btrim(p_command->>'reason'),'') is null
         or char_length(p_command->>'reason') > 1000 then
        raise exception 'Direção editorial inválida.' using errcode = '22023';
      end if;
      insert into private.course_authoring_guidance_assignments(
        course_id,scope_kind,scope_ref,guidance,origin,reason
      ) values(
        p_course_id,v_scope_kind,v_scope_ref,p_command->>'guidance',
        p_command->>'origin',p_command->>'reason'
      ) on conflict(course_id,scope_kind,scope_ref) do update set
        guidance=excluded.guidance,origin=excluded.origin,reason=excluded.reason,
        updated_at=now()
      where not (
        excluded.origin='automatic'
        and course_authoring_guidance_assignments.origin in('author','research_condition')
      ) and row(
        course_authoring_guidance_assignments.guidance,
        course_authoring_guidance_assignments.origin,
        course_authoring_guidance_assignments.reason
      ) is distinct from row(excluded.guidance,excluded.origin,excluded.reason);
      get diagnostics v_affected_rows = row_count;
      v_changed := v_affected_rows > 0;
    else
      if p_command - 'type' - 'scope' <> '{}'::jsonb then
        raise exception 'Limpeza da direção editorial inválida.' using errcode = '22023';
      end if;
      delete from private.course_authoring_guidance_assignments assignment
      where assignment.course_id = p_course_id
        and assignment.scope_kind = v_scope_kind
        and assignment.scope_ref = v_scope_ref;
      get diagnostics v_affected_rows = row_count;
      v_changed := v_affected_rows > 0;
    end if;
  else
    if p_command - 'type' - 'scope' - 'policy' - 'origin' - 'reason'
         <> '{}'::jsonb then
      raise exception 'Política de componentes inválida.' using errcode = '22023';
    end if;
    if v_type = 'set_component_policy' then
      if not (p_command ?& array['policy','origin','reason'])
         or not private.valid_course_component_policy_v1(p_command->'policy')
         or p_command->>'origin' not in('automatic','author','research_condition')
         or nullif(btrim(p_command->>'reason'),'') is null
         or char_length(p_command->>'reason') > 1000 then
        raise exception 'Política de componentes inválida.' using errcode = '22023';
      end if;
      insert into private.course_component_policy_assignments(
        course_id,scope_kind,scope_ref,policy,origin,reason
      ) values(
        p_course_id,v_scope_kind,v_scope_ref,p_command->'policy',
        p_command->>'origin',p_command->>'reason'
      ) on conflict(course_id,scope_kind,scope_ref) do update set
        policy=excluded.policy,origin=excluded.origin,reason=excluded.reason,
        updated_at=now()
      where row(
        course_component_policy_assignments.policy,
        course_component_policy_assignments.origin,
        course_component_policy_assignments.reason
      ) is distinct from row(excluded.policy,excluded.origin,excluded.reason);
      get diagnostics v_affected_rows = row_count;
      v_changed := v_affected_rows > 0;
    else
      if p_command - 'type' - 'scope' <> '{}'::jsonb then
        raise exception 'Limpeza da política de componentes inválida.' using errcode = '22023';
      end if;
      delete from private.course_component_policy_assignments assignment
      where assignment.course_id = p_course_id
        and assignment.scope_kind = v_scope_kind
        and assignment.scope_ref = v_scope_ref;
      get diagnostics v_affected_rows = row_count;
      v_changed := v_affected_rows > 0;
    end if;
  end if;

  if exists(select 1 from jsonb_array_elements(private.course_design_research_conflicts_v1(p_course_id)) conflict where not(v_before_conflicts @> jsonb_build_array(conflict))) then
    raise exception 'A alteração diverge de uma condição de pesquisa; resolva o conflito antes de aplicar.' using errcode='PD409';
  end if;
  if v_changed then
    update public.courses course
    set revision = course.revision + 1,updated_at = now()
    where course.id = p_course_id returning * into v_course;
  end if;
  v_result := jsonb_build_object(
    'contract','aralearn.course-design-change.v3',
    'courseId',p_course_id,
    'courseRevision',v_course.revision,
    'requestId',p_request_id,
    'idempotent',false,
    'changed',v_changed,
    'change',case when v_changed then jsonb_build_object(
      'type',v_type,
      'scope',jsonb_build_object('kind',v_scope_kind,'ref',v_scope_ref),
      'parameterId',case when v_type in('set_parameter','clear_parameter','delegate_parameter')
        then p_command->>'parameterId' else null end
    ) else null end
  );
  insert into private.course_change_receipts(
    actor_id,request_id,operation,course_id,request_hash,result
  ) values(
    p_actor_id,p_request_id,'apply_course_design_command_v3',
    p_course_id,p_request_hash,v_result
  );
  return v_result;
end;
$function$;
create function private.normalize_authoring_profile_preferences_v1(p_preferences jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,private as $function$
declare v jsonb; result jsonb:='[]'; item jsonb; count_limit integer;
begin
  select count(*) into count_limit from private.course_design_parameter_definitions;
  if jsonb_typeof(p_preferences) is distinct from 'array' or jsonb_array_length(p_preferences) not between 1 and count_limit or octet_length(p_preferences::text)>32768 then raise exception 'Preferências inválidas.' using errcode='22023'; end if;
  if (select count(*)<>count(distinct x->>'parameterId') from jsonb_array_elements(p_preferences) x) then raise exception 'Preferências repetidas.' using errcode='22023'; end if;
  for item in select x from jsonb_array_elements(p_preferences) x loop
    if jsonb_typeof(item) is distinct from 'object' or not(item ?& array['parameterId','mode','value']) or item-'parameterId'-'mode'-'value'<>'{}'::jsonb or coalesce(item->>'mode','') not in('fixed','automatic') or not exists(select 1 from private.course_design_parameter_definitions where parameter_id=item->>'parameterId') then raise exception 'Preferência fora do catálogo.' using errcode='22023'; end if;
    v:=item->'value';
    if item->>'mode'='automatic' then
      if v<>'null'::jsonb then raise exception 'Delegação não guarda valor escolhido.' using errcode='22023'; end if;
    else
      if not private.valid_course_design_parameter_value_v1(item->>'parameterId',v) then raise exception 'Valor de preferência inválido.' using errcode='22023'; end if;
      if jsonb_typeof(v)='array' then select jsonb_agg(x order by x#>>'{}') into v from jsonb_array_elements(v) x; end if;
    end if;
    result:=result||jsonb_build_array(jsonb_build_object('parameterId',item->>'parameterId','mode',item->>'mode','value',v));
  end loop;
  return (select jsonb_agg(x order by d.ordinal) from jsonb_array_elements(result) x join private.course_design_parameter_definitions d on d.parameter_id=x->>'parameterId');
end $function$;
revoke all on function private.normalize_authoring_profile_preferences_v1(jsonb) from public,anon,authenticated,service_role;

create table private.authoring_profiles(
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check(name=btrim(name) and char_length(name) between 1 and 100 and name!~'[[:cntrl:]]'),
  preferences jsonb not null check(preferences=private.normalize_authoring_profile_preferences_v1(preferences)),
  revision bigint not null default 1 check(revision>=1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index authoring_profiles_owner_name_v1 on private.authoring_profiles(owner_id,lower(name));
alter table private.authoring_profiles enable row level security;
alter table private.authoring_profiles force row level security;
revoke all on table private.authoring_profiles from public,anon,authenticated,service_role;

create function private.authoring_profile_payload_v1(p_profile private.authoring_profiles)
returns jsonb language sql immutable set search_path=pg_catalog as $function$
  select jsonb_build_object('profileId',p_profile.id,'revision',p_profile.revision,'name',p_profile.name,'preferences',p_profile.preferences,'createdAt',p_profile.created_at,'updatedAt',p_profile.updated_at)
$function$;
revoke all on function private.authoring_profile_payload_v1(private.authoring_profiles) from public,anon,authenticated,service_role;

create function public.list_authoring_profiles_for_actor_v1(p_actor_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,private as $function$
begin
  perform private.require_service_role();
  if not exists(select 1 from auth.users where id=p_actor_id) then raise exception 'Pessoa inexistente.' using errcode='PT404'; end if;
  return jsonb_build_object('contract','aralearn.authoring-profiles.v1','profiles',coalesce((select jsonb_agg(private.authoring_profile_payload_v1(p) order by lower(p.name),p.id) from private.authoring_profiles p where p.owner_id=p_actor_id),'[]'::jsonb));
end $function$;

create function private.mutate_authoring_profile_v1(p_actor_id uuid,p_profile_id uuid,p_expected_revision bigint,p_name text,p_preferences jsonb,p_request_id text,p_request_hash text,p_delete boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog,private as $function$
declare profile private.authoring_profiles%rowtype; receipt private.course_change_receipts%rowtype; result jsonb; v_preferences jsonb; changed boolean; revision bigint; operation text:=case when p_delete then 'delete_authoring_profile' else 'save_authoring_profile' end;
begin
  perform private.require_service_role();
  if p_profile_id is null or p_actor_id is null or p_expected_revision is null or p_expected_revision<(case when p_delete then 1 else 0 end) or p_request_id is null or p_request_id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' or p_request_hash is null or p_request_hash!~'^[0-9a-f]{64}$' then raise exception 'Mudança de perfil inválida.' using errcode='22023'; end if;
  perform 1 from auth.users where id=p_actor_id for key share;
  if not found then raise exception 'Pessoa inexistente.' using errcode='PT404'; end if;
  perform pg_advisory_xact_lock(hashtextextended('course-change-request:'||p_actor_id::text||':'||p_request_id,0));
  delete from private.course_change_receipts where actor_id=p_actor_id and request_id=p_request_id and expires_at<=statement_timestamp();
  select * into receipt from private.course_change_receipts where actor_id=p_actor_id and request_id=p_request_id;
  if found then
    if receipt.operation<>operation or receipt.request_hash<>p_request_hash or receipt.result->>'profileId'<>p_profile_id::text then raise exception 'requestId reutilizado com perfil incompatível.' using errcode='23514'; end if;
    return receipt.result||jsonb_build_object('idempotent',true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('authoring-profiles:'||p_actor_id::text,0));
  select * into profile from private.authoring_profiles where id=p_profile_id for update;
  if found and profile.owner_id<>p_actor_id then raise exception 'Perfil inexistente.' using errcode='PT404'; end if;
  if profile.id is null and p_expected_revision<>0 then raise exception 'Perfil inexistente.' using errcode='PT404'; end if;
  if profile.id is not null and profile.revision<>p_expected_revision then raise exception 'O perfil mudou; releia antes de salvar.' using errcode='40001'; end if;
  if not p_delete then
    if p_name is null or p_name<>btrim(p_name) or char_length(p_name) not between 1 and 100 or p_name~'[[:cntrl:]]' then raise exception 'Nome de perfil inválido.' using errcode='22023'; end if;
    v_preferences:=private.normalize_authoring_profile_preferences_v1(p_preferences);
    if exists(select 1 from private.authoring_profiles where owner_id=p_actor_id and lower(name)=lower(p_name) and id<>p_profile_id) then raise exception 'Já existe um perfil com esse nome.' using errcode='PN409'; end if;
    if profile.id is null then
      if (select count(*) from private.authoring_profiles where owner_id=p_actor_id)>=32 then raise exception 'Limite de 32 perfis atingido.' using errcode='54000'; end if;
      insert into private.authoring_profiles(id,owner_id,name,preferences) values(p_profile_id,p_actor_id,p_name,v_preferences) returning * into profile;
      changed:=true;
    else
      changed:=row(profile.name,profile.preferences) is distinct from row(p_name,v_preferences);
      if changed then update private.authoring_profiles set name=p_name,preferences=v_preferences,revision=authoring_profiles.revision+1,updated_at=now() where id=p_profile_id returning * into profile; end if;
    end if;
    revision:=profile.revision;
  else
    delete from private.authoring_profiles where id=p_profile_id;
    changed:=true; revision:=p_expected_revision+1;
  end if;
  result:=jsonb_build_object('contract','aralearn.authoring-profile-change.v1','profileId',p_profile_id,'revision',revision,'requestId',p_request_id,'idempotent',false,'changed',changed,'deleted',p_delete,'profile',case when p_delete then null else private.authoring_profile_payload_v1(profile) end);
  insert into private.course_change_receipts(actor_id,request_id,operation,course_id,request_hash,result) values(p_actor_id,p_request_id,operation,null,p_request_hash,result);
  return result;
end $function$;
revoke all on function private.mutate_authoring_profile_v1(uuid,uuid,bigint,text,jsonb,text,text,boolean) from public,anon,authenticated,service_role;

create function public.save_authoring_profile_for_actor_v1(p_actor_id uuid,p_profile_id uuid,p_expected_revision bigint,p_name text,p_preferences jsonb,p_request_id text,p_request_hash text)
returns jsonb language sql security definer set search_path=pg_catalog,private as $function$
  select private.mutate_authoring_profile_v1(p_actor_id,p_profile_id,p_expected_revision,p_name,p_preferences,p_request_id,p_request_hash,false)
$function$;
create function public.delete_authoring_profile_for_actor_v1(p_actor_id uuid,p_profile_id uuid,p_expected_revision bigint,p_request_id text,p_request_hash text)
returns jsonb language sql security definer set search_path=pg_catalog,private as $function$
  select private.mutate_authoring_profile_v1(p_actor_id,p_profile_id,p_expected_revision,null,null,p_request_id,p_request_hash,true)
$function$;
create function public.preview_course_authoring_profile_for_actor_v1(p_actor_id uuid,p_course_id uuid,p_expected_course_revision bigint,p_profile_id uuid,p_profile_revision bigint)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,private as $function$
declare profile private.authoring_profiles%rowtype; course public.courses%rowtype; conflicts jsonb;
begin
  perform private.require_service_role(); perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  select * into strict course from public.courses where id=p_course_id;
  if p_expected_course_revision is distinct from course.revision then raise exception 'O curso mudou; releia a prévia.' using errcode='40001'; end if;
  select * into profile from private.authoring_profiles where id=p_profile_id and owner_id=p_actor_id;
  if not found then raise exception 'Perfil inexistente.' using errcode='PT404'; end if;
  if p_profile_revision is distinct from profile.revision then raise exception 'O perfil mudou; releia a prévia.' using errcode='40001'; end if;
  conflicts:=private.course_design_research_conflicts_v1(p_course_id)||coalesce((
    select jsonb_agg(jsonb_build_object('parameterId',a.parameter_id,'fixedScope',jsonb_build_object('kind','course','ref',p_course_id),'fixedValue',a.value,'exceptionScope',jsonb_build_object('kind','course','ref',p_course_id),'exceptionValue',p->'value') order by a.parameter_id)
    from private.course_design_parameter_assignments a join jsonb_array_elements(profile.preferences) p on p->>'parameterId'=a.parameter_id
    where a.course_id=p_course_id and a.scope_kind='course' and a.origin='research_condition' and (p->>'mode'<>'fixed' or p->'value'<>a.value)
  ),'[]'::jsonb);
  return jsonb_build_object('contract','aralearn.course-authoring-profile-preview.v1','courseId',p_course_id,'courseRevision',course.revision,'profile',private.authoring_profile_payload_v1(profile),
    'assignments',(select jsonb_agg(p||jsonb_build_object('origin','author','reason','Preferências copiadas do perfil.') order by d.ordinal) from jsonb_array_elements(profile.preferences) p join private.course_design_parameter_definitions d on d.parameter_id=p->>'parameterId'),
    'exceptions',coalesce((select jsonb_agg(jsonb_build_object('parameterId',a.parameter_id,'scope',jsonb_build_object('kind',a.scope_kind,'ref',a.scope_ref),'scopeLabel',coalesce((select e.content->>'title' from private.course_entities e where e.course_id=a.course_id and e.entity_id=a.scope_ref and e.entity_type=case a.scope_kind when 'didactic_microsequence' then 'microsequence' else a.scope_kind end),'Escopo sem título'),'assignment',jsonb_build_object('mode',a.mode,'value',a.value,'origin',a.origin,'reason',a.reason)) order by d.ordinal,a.scope_kind,a.scope_ref)
      from private.course_design_parameter_assignments a join private.course_design_parameter_definitions d on d.parameter_id=a.parameter_id
      where a.course_id=p_course_id and a.scope_kind<>'course' and exists(select 1 from jsonb_array_elements(profile.preferences) p where p->>'parameterId'=a.parameter_id)),'[]'::jsonb),'conflicts',conflicts);
end $function$;

create function public.apply_course_authoring_profile_for_actor_v1(p_actor_id uuid,p_course_id uuid,p_expected_course_revision bigint,p_profile_id uuid,p_profile_revision bigint,p_exception_policy jsonb,p_request_id text,p_request_hash text,p_channel text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private as $function$
declare profile private.authoring_profiles%rowtype; course public.courses%rowtype; receipt private.course_change_receipts%rowtype; preview jsonb; selected jsonb; preference jsonb; changed boolean:=false; affected bigint; result jsonb;
begin
  perform private.require_service_role(); perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_course_revision is null or p_expected_course_revision<1 or p_profile_revision is null or p_profile_revision<1 or p_request_id is null or p_request_id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' or p_request_hash is null or p_request_hash!~'^[0-9a-f]{64}$' or p_channel is null or p_channel not in('application','mcp','actions') then raise exception 'Aplicação de perfil inválida.' using errcode='22023'; end if;
  if jsonb_typeof(p_exception_policy) is distinct from 'object' or not(p_exception_policy ?& array['mode','exceptions']) or p_exception_policy-'mode'-'exceptions'<>'{}'::jsonb or coalesce(p_exception_policy->>'mode','') not in('preserve','remove_selected') or jsonb_typeof(p_exception_policy->'exceptions') is distinct from 'array' or jsonb_array_length(p_exception_policy->'exceptions')>256 or (p_exception_policy->>'mode'='preserve' and p_exception_policy->'exceptions'<>'[]'::jsonb) then raise exception 'Escolha explícita de exceções inválida.' using errcode='22023'; end if;
  if (select count(*)<>count(distinct e) from jsonb_array_elements(p_exception_policy->'exceptions') e) then raise exception 'Exceções repetidas.' using errcode='22023'; end if;
  perform 1 from auth.users where id=p_actor_id for key share;
  perform pg_advisory_xact_lock(hashtextextended('course-change-request:'||p_actor_id::text||':'||p_request_id,0));
  delete from private.course_change_receipts where actor_id=p_actor_id and request_id=p_request_id and expires_at<=statement_timestamp();
  select * into receipt from private.course_change_receipts where actor_id=p_actor_id and request_id=p_request_id;
  if found then
    if receipt.operation<>'apply_authoring_profile' or receipt.course_id<>p_course_id or receipt.request_hash<>p_request_hash then raise exception 'requestId reutilizado com aplicação incompatível.' using errcode='23514'; end if;
    return receipt.result||jsonb_build_object('idempotent',true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('authoring-profiles:'||p_actor_id::text,0));
  select * into profile from private.authoring_profiles where id=p_profile_id and owner_id=p_actor_id for share;
  if not found then raise exception 'Perfil inexistente.' using errcode='PT404'; end if;
  perform pg_advisory_xact_lock(hashtextextended('course-row:'||p_course_id::text,0));
  select * into strict course from public.courses where id=p_course_id for update;
  preview:=public.preview_course_authoring_profile_for_actor_v1(p_actor_id,p_course_id,p_expected_course_revision,p_profile_id,p_profile_revision);
  if jsonb_array_length(preview->'conflicts')>0 then raise exception 'Resolva as condições de pesquisa antes de aplicar o perfil.' using errcode='PD409'; end if;
  for selected in select value from jsonb_array_elements(p_exception_policy->'exceptions') loop
    if jsonb_typeof(selected) is distinct from 'object' or not(selected ?& array['parameterId','scope']) or selected-'parameterId'-'scope'<>'{}'::jsonb or jsonb_typeof(selected->'scope') is distinct from 'object' or not(selected->'scope' ?& array['kind','ref']) or (selected->'scope')-'kind'-'ref'<>'{}'::jsonb or not exists(select 1 from jsonb_array_elements(preview->'exceptions') e where e->>'parameterId'=selected->>'parameterId' and e->'scope'=selected->'scope') then raise exception 'A exceção escolhida não pertence à prévia.' using errcode='22023'; end if;
    if exists(select 1 from jsonb_array_elements(preview->'exceptions') e where e->>'parameterId'=selected->>'parameterId' and e->'scope'=selected->'scope' and e#>>'{assignment,origin}'='research_condition') then raise exception 'O perfil não remove condição de pesquisa.' using errcode='PD409'; end if;
    delete from private.course_design_parameter_assignments where course_id=p_course_id and parameter_id=selected->>'parameterId' and scope_kind=selected#>>'{scope,kind}' and scope_ref=selected#>>'{scope,ref}';
    get diagnostics affected=row_count; changed:=changed or affected>0;
  end loop;
  for preference in select value from jsonb_array_elements(profile.preferences) loop
    -- Preferências são copiadas; não há FK ou ligação viva curso-perfil. Uma
    -- intenção automática já calibrada mantém seu valor aplicado ao reaplicar.
    insert into private.course_design_parameter_assignments(course_id,parameter_id,scope_kind,scope_ref,mode,value,origin,reason)
    values(p_course_id,preference->>'parameterId','course',p_course_id::text,preference->>'mode',preference->'value','author','Preferências copiadas do perfil.')
    on conflict(course_id,parameter_id,scope_kind,scope_ref) do update set mode=excluded.mode,value=excluded.value,origin=excluded.origin,reason=excluded.reason,updated_at=now()
    where course_design_parameter_assignments.origin<>'research_condition'
      and (course_design_parameter_assignments.mode<>excluded.mode or excluded.mode='fixed' and course_design_parameter_assignments.value<>excluded.value);
    get diagnostics affected=row_count; changed:=changed or affected>0;
  end loop;
  if jsonb_array_length(private.course_design_research_conflicts_v1(p_course_id))>0 then raise exception 'A aplicação introduziu conflito de pesquisa.' using errcode='PD409'; end if;
  if changed then update public.courses set revision=courses.revision+1,updated_at=now() where id=p_course_id returning * into course; end if;
  result:=jsonb_build_object('contract','aralearn.course-design-change.v3','courseId',p_course_id,'courseRevision',course.revision,'requestId',p_request_id,'idempotent',false,'changed',changed,'change',case when changed then jsonb_build_object('type','apply_profile','scope',jsonb_build_object('kind','course','ref',p_course_id),'parameterId',null) else null end);
  insert into private.course_change_receipts(actor_id,request_id,operation,course_id,request_hash,result) values(p_actor_id,p_request_id,'apply_authoring_profile',p_course_id,p_request_hash,result);
  return result;
end $function$;

-- Migra somente metadados de aplicação antigos, sem completar decisões ausentes.
do $snapshot_data$
declare definition text;
begin
  select pg_get_constraintdef(oid) into definition from pg_constraint where conrelid='private.course_entities'::regclass and conname='course_entities_design_current_v1';
  alter table private.course_entities drop constraint course_entities_design_current_v1;
  if exists(select 1 from private.course_entities where design_snapshot is not null and (design_snapshot->>'contract'<>'aralearn.study-unit-design-snapshot.v1' or jsonb_array_length(design_snapshot->'parameters') not in(4,6))) then raise exception 'Aplicação anterior não reconhecida; preserve backup e investigue antes da migração.' using errcode='55000'; end if;
  update private.course_entities e set design_snapshot=e.design_snapshot||jsonb_build_object('contract','aralearn.study-unit-design-snapshot.v2','parameterCatalogVersion',case when jsonb_array_length(e.design_snapshot->'parameters')=4 then '1.0.0' else '1.1.0' end,'parameters',(select jsonb_agg(p||jsonb_build_object('reason',p->'reason') order by ordinal) from jsonb_array_elements(e.design_snapshot->'parameters') with ordinality parameter(p,ordinal))) where e.design_snapshot is not null;
  definition:=replace(definition,'aralearn.study-unit-design-snapshot.v1','aralearn.study-unit-design-snapshot.v2');
  execute 'alter table private.course_entities add constraint course_entities_design_current_v1 '||definition;
end $snapshot_data$;

CREATE OR REPLACE FUNCTION private.materialize_course_authoring_part_core_v1(p_actor_id uuid, p_course_id uuid, p_authoring_part_id uuid, p_expected_course_revision bigint, p_expected_authoring_part_version bigint, p_units jsonb, p_request_id text, p_request_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_receipt private.course_change_receipts%rowtype;
  v_course public.courses%rowtype;
  v_part private.course_authoring_parts%rowtype;
  v_unit record;
  v_snapshot jsonb;
  v_application jsonb;
  v_expected_parameters jsonb;
  v_expected_directions jsonb;
  v_expected_policy jsonb;
  v_expected_analysis_ids jsonb;
  v_expected_evidence_ids jsonb;
  v_design_scope_kind text;
  v_design_scope_ref text;
  v_design_path jsonb;
  v_upserts jsonb := '[]'::jsonb;
  v_current_units jsonb := '[]'::jsonb;
  v_source_applications jsonb := '[]'::jsonb;
  v_existing_study_unit_ids text[] := array[]::text[];
  v_existing_unit private.course_entities%rowtype;
  v_composition jsonb;
  v_result jsonb;
  v_design_changes bigint := 0;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_actor_id is null or p_course_id is null or p_authoring_part_id is null
     or p_expected_course_revision is null or p_expected_course_revision < 1
     or p_expected_authoring_part_version is null
     or p_expected_authoring_part_version < 1
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_units) is distinct from 'array'
     or jsonb_array_length(p_units) not between 1 and 64
     or octet_length(p_units::text) > 1572864 then
    raise exception 'Materialização da Parte inválida.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:' || p_actor_id::text || ':' || p_request_id,0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  select * into v_receipt from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'materialize_course_authoring_part_v1'
       or v_receipt.course_id <> p_course_id
       or v_receipt.request_hash <> p_request_hash then
      raise exception 'requestId reutilizado com materialização incompatível.'
        using errcode = '23514';
    end if;
    return (v_receipt.result - 'idempotent')
      || jsonb_build_object('idempotent',true);
  end if;

  perform 1 from auth.users actor where actor.id=p_actor_id for key share;
  if not found then
    raise exception 'Pessoa inexistente ou inacessível.' using errcode='PT404';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'course-row:'||p_course_id::text,0
  ));
  select * into strict v_course
  from public.courses course where course.id = p_course_id for update;
  if v_course.revision <> p_expected_course_revision then
    raise exception 'O Curso mudou; releia antes de materializar a Parte.'
      using errcode = '40001';
  end if;
  select * into v_part
  from private.course_authoring_parts part
  where part.course_id = p_course_id
    and part.id = p_authoring_part_id
  for update;
  if not found then
    raise exception 'Parte inexistente.' using errcode = 'PT404';
  end if;
  if v_part.version <> p_expected_authoring_part_version then
    raise exception 'A Parte mudou; releia antes de materializá-la.'
      using errcode = '40001';
  end if;
  if (
    select count(*) <> count(distinct unit.value->>'studyUnitId')
      or count(*) <> count(distinct concat_ws(
        chr(31),unit.value->>'didacticMicrosequenceId',unit.value->>'position'
      ))
    from jsonb_array_elements(p_units) unit(value)
  ) then
    raise exception 'A materialização repete Unidade ou posição.'
      using errcode = '22023';
  end if;
  if exists(
    select 1
    from private.course_authoring_part_didactic_microsequences membership
    where membership.course_id=p_course_id
      and membership.authoring_part_id=p_authoring_part_id
      and not exists(
        select 1 from jsonb_array_elements(p_units) unit(value)
        where unit.value->>'didacticMicrosequenceId'
          =membership.didactic_microsequence_id
      )
  ) then
    raise exception 'A materialização precisa cobrir toda Microssequência da Parte.'
      using errcode='23514';
  end if;

  for v_unit in
    select unit.value,unit.ordinal
    from jsonb_array_elements(p_units) with ordinality unit(value,ordinal)
    order by unit.ordinal
  loop
    if jsonb_typeof(v_unit.value) is distinct from 'object'
       or not (v_unit.value ?& array[
         'studyUnitId','position','didacticMicrosequenceId','content',
         'designSnapshot','designApplication','sourceLinks'
       ])
       or v_unit.value - 'studyUnitId' - 'position'
         - 'didacticMicrosequenceId' - 'content' - 'designSnapshot'
         - 'designApplication' - 'sourceLinks' <> '{}'::jsonb
       or jsonb_typeof(v_unit.value->'studyUnitId')<>'string'
       or nullif(btrim(v_unit.value->>'studyUnitId'),'') is null
       or v_unit.value->>'studyUnitId'<>btrim(v_unit.value->>'studyUnitId')
       or char_length(v_unit.value->>'studyUnitId')>240
       or octet_length(v_unit.value->>'studyUnitId')>960
       or v_unit.value->>'studyUnitId'~'[[:cntrl:]]'
       or jsonb_typeof(v_unit.value->'position') <> 'number'
       or (v_unit.value->>'position') !~ '^[1-9][0-9]*$'
       or (v_unit.value->>'position')::bigint > 2147483647
       or nullif(btrim(v_unit.value->>'didacticMicrosequenceId'),'') is null
       or v_unit.value->>'didacticMicrosequenceId'
         <>btrim(v_unit.value->>'didacticMicrosequenceId')
       or char_length(v_unit.value->>'didacticMicrosequenceId') > 240
       or octet_length(v_unit.value->>'didacticMicrosequenceId')>960
       or v_unit.value->>'didacticMicrosequenceId'~'[[:cntrl:]]'
       or jsonb_typeof(v_unit.value->'content') is distinct from 'object'
       or v_unit.value->'content' ? 'id'
       or v_unit.value->'content' ? 'position'
       or v_unit.value->'content' ? 'sources'
       or jsonb_typeof(v_unit.value->'designSnapshot') is distinct from 'object'
       or jsonb_typeof(v_unit.value->'designApplication') is distinct from 'object'
       or not private.valid_course_source_links_shape_v2(
         v_unit.value->'sourceLinks'
       ) then
      raise exception 'Unidade materializada inválida.' using errcode = '22023';
    end if;
    if not exists(
      select 1
      from private.course_authoring_part_didactic_microsequences membership
      join private.course_entities microsequence
        on microsequence.course_id = membership.course_id
       and microsequence.entity_type = 'microsequence'
       and microsequence.entity_id = membership.didactic_microsequence_id
      where membership.course_id = p_course_id
        and membership.authoring_part_id = p_authoring_part_id
        and membership.didactic_microsequence_id
          = v_unit.value->>'didacticMicrosequenceId'
    ) then
      raise exception 'A Unidade aponta para Microssequência fora da Parte.'
        using errcode = '22023';
    end if;
    if exists(
      select 1 from private.course_entities entity
      where entity.course_id=p_course_id and entity.entity_type='study_unit'
        and entity.entity_id=v_unit.value->>'studyUnitId'
        and row(entity.parent_type,entity.parent_id,entity.position)
          is distinct from row(
            'microsequence'::text,
            v_unit.value->>'didacticMicrosequenceId',
            (v_unit.value->>'position')::integer
          )
    ) then
      raise exception 'A identidade da Unidade já pertence a outra posição.'
        using errcode='23514';
    end if;
    select * into v_existing_unit
    from private.course_entities entity
    where entity.course_id=p_course_id and entity.entity_type='study_unit'
      and entity.parent_type='microsequence'
      and entity.parent_id=v_unit.value->>'didacticMicrosequenceId'
      and entity.position=(v_unit.value->>'position')::integer
    for update;
    if found then
      if v_existing_unit.entity_id<>v_unit.value->>'studyUnitId' then
        raise exception 'A posição já possui outra Unidade; releia antes de substituir.'
          using errcode='40001';
      end if;
      v_design_scope_kind:='study_unit';
      v_design_scope_ref:=v_existing_unit.entity_id;
    else
      v_design_scope_kind:='didactic_microsequence';
      v_design_scope_ref:=v_unit.value->>'didacticMicrosequenceId';
    end if;
    v_design_path:=private.course_design_scope_path_v1(
      p_course_id,v_design_scope_kind,v_design_scope_ref
    );
    if v_design_path is null then
      raise exception 'O escopo focal da Unidade deixou de existir.'
        using errcode='40001';
    end if;

    if exists(select 1 from jsonb_array_elements(private.course_current_design_parameters_v1(p_course_id,v_design_path)) parameter where jsonb_array_length(parameter->'conflicts')>0) then
      raise exception 'Resolva o conflito de pesquisa antes de materializar.' using errcode='PD409';
    end if;
    v_snapshot := v_unit.value->'designSnapshot';
    v_application := v_unit.value->'designApplication';
    if v_snapshot - 'contract' - 'parameterCatalogVersion' - 'didacticMicrosequenceId'
         - 'instructionalAnalysisUnitIds' - 'evidenceRequirementIds'
         - 'parameters' - 'editorialDirections' - 'componentPolicy' <> '{}'::jsonb
       or not (v_snapshot ?& array[
         'contract','parameterCatalogVersion','didacticMicrosequenceId','instructionalAnalysisUnitIds',
         'evidenceRequirementIds','parameters','editorialDirections',
         'componentPolicy'
       ])
       or v_snapshot->>'contract'
         <> 'aralearn.study-unit-design-snapshot.v2'
       or v_snapshot->>'parameterCatalogVersion'<>'1.2.0'
       or v_snapshot->>'didacticMicrosequenceId'
         <> v_unit.value->>'didacticMicrosequenceId'
       or jsonb_typeof(v_snapshot->'instructionalAnalysisUnitIds') <> 'array'
       or jsonb_typeof(v_snapshot->'evidenceRequirementIds') <> 'array'
       or jsonb_typeof(v_snapshot->'parameters') <> 'array'
       or jsonb_array_length(v_snapshot->'parameters') <> (select count(*) from private.course_design_parameter_definitions)
       or jsonb_typeof(v_snapshot->'editorialDirections') <> 'array'
       or jsonb_typeof(v_snapshot->'componentPolicy') <> 'object'
       or octet_length(v_snapshot::text) > 65536
       or v_application - 'mode'
         - 'introducedInstructionalAnalysisUnitIds'
         - 'explanationApplications' - 'practiceApplications'
         - 'componentRefs' <> '{}'::jsonb
       or not (v_application ?& array[
         'mode','introducedInstructionalAnalysisUnitIds',
         'explanationApplications','practiceApplications','componentRefs'
       ])
       or v_application->>'mode' not in('expository','practice','mixed')
       or jsonb_typeof(v_application->'introducedInstructionalAnalysisUnitIds') <> 'array'
       or jsonb_typeof(v_application->'explanationApplications') <> 'array'
       or jsonb_typeof(v_application->'practiceApplications') <> 'array'
       or jsonb_typeof(v_application->'componentRefs') <> 'array'
       or octet_length(v_application::text) > 65536 then
      raise exception 'Aplicação pedagógica focal inválida.' using errcode = '22023';
    end if;

    select coalesce(jsonb_agg(to_jsonb(assignment.plan_item_id)
      order by item.position,item.id),'[]'::jsonb)
      into v_expected_analysis_ids
    from private.course_design_target_plan_items assignment
    join private.course_instructional_plan_items item
      on item.course_id = assignment.course_id
     and item.id = assignment.plan_item_id
     and item.item_kind = assignment.plan_item_kind
    where assignment.course_id = p_course_id
      and assignment.didactic_microsequence_id
        = v_unit.value->>'didacticMicrosequenceId'
      and assignment.plan_item_kind = 'instructional_analysis_unit';
    select coalesce(jsonb_agg(to_jsonb(assignment.plan_item_id)
      order by item.position,item.id),'[]'::jsonb)
      into v_expected_evidence_ids
    from private.course_design_target_plan_items assignment
    join private.course_instructional_plan_items item
      on item.course_id = assignment.course_id
     and item.id = assignment.plan_item_id
     and item.item_kind = assignment.plan_item_kind
    where assignment.course_id = p_course_id
      and assignment.didactic_microsequence_id
        = v_unit.value->>'didacticMicrosequenceId'
      and assignment.plan_item_kind = 'evidence_requirement';
    if v_snapshot->'instructionalAnalysisUnitIds' <> v_expected_analysis_ids
       or v_snapshot->'evidenceRequirementIds' <> v_expected_evidence_ids then
      raise exception 'O recorte pedagógico divergiu do plano corrente.'
        using errcode = '40001';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'parameterId',parameter.value->>'parameterId',
      'value',parameter.value#>'{effectiveAssignment,value}',
      'origin',parameter.value#>>'{effectiveAssignment,origin}',
      'reason',parameter.value#>>'{effectiveAssignment,reason}',
      'sourceScopeKind',parameter.value#>>'{effectiveAssignment,sourceScope,kind}'
    ) order by parameter.ordinal),'[]'::jsonb)
      into v_expected_parameters
    from jsonb_array_elements(private.course_current_design_parameters_v1(
      p_course_id,v_design_path
    )) with ordinality parameter(value,ordinal);
    select coalesce(jsonb_agg(jsonb_build_object(
      'direction',direction.value->>'guidance',
      'origin',direction.value->>'origin',
      'sourceScopeKind',direction.value#>>'{sourceScope,kind}'
    ) order by direction.ordinal),'[]'::jsonb)
      into v_expected_directions
    from jsonb_array_elements(private.course_current_authoring_guidance_v1(
      p_course_id,v_design_path
    )->'effectiveAssignments') with ordinality direction(value,ordinal);
    select jsonb_build_object(
      'policy',effective.value->'policy',
      'origin',effective.value->>'origin',
      'sourceScopeKind',effective.value#>>'{sourceScope,kind}'
    ) into v_expected_policy
    from jsonb_array_elements(jsonb_build_array(
      private.course_current_component_policy_v1(
        p_course_id,v_design_path
      )->'effectiveAssignment'
    )) effective(value);
    if exists(select 1 from jsonb_array_elements(v_snapshot->'parameters') supplied
      left join jsonb_array_elements(v_expected_parameters) expected on expected->>'parameterId'=supplied->>'parameterId'
      where jsonb_typeof(supplied)<>'object' or not(supplied ?& array['parameterId','value','origin','reason','sourceScopeKind']) or supplied-'parameterId'-'value'-'origin'-'reason'-'sourceScopeKind'<>'{}'::jsonb
        or not private.valid_course_design_parameter_value_v1(supplied->>'parameterId',supplied->'value')
        or supplied->>'origin' not in('author','automatic','research_condition','migration')
        or jsonb_typeof(supplied->'reason') is distinct from 'string' or nullif(btrim(supplied->>'reason'),'') is null or char_length(supplied->>'reason')>1000
        or expected->>'origin' in('author','research_condition','migration') and expected->'value'<>'null'::jsonb and (supplied->'value'<>expected->'value' or supplied->>'origin'<>expected->>'origin')) then
      raise exception 'Configuração aplicada inválida ou divergente de uma fixação.' using errcode='22023';
    end if;
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
      raise exception 'A configuração usada divergiu da configuração corrente.'
        using errcode = '40001';
    end if;
    if exists(
      select 1
      from jsonb_array_elements_text(
        v_application->'introducedInstructionalAnalysisUnitIds'
      ) introduced(value)
      where not (v_expected_analysis_ids ? introduced.value::text)
    ) or exists(
      select 1
      from jsonb_array_elements(v_application->'explanationApplications') explanation(value)
      where not (v_expected_analysis_ids
        ? (explanation.value->>'instructionalAnalysisUnitId')::text)
    ) or exists(
      select 1
      from jsonb_array_elements(v_application->'practiceApplications') practice(value)
      where not (v_expected_evidence_ids
        ? (practice.value->>'evidenceRequirementId')::text)
    ) or v_application->'componentRefs'
      <> to_jsonb(private.course_component_refs_from_content_v1(
        v_unit.value->'content'
      )) then
      raise exception 'A aplicação pedagógica referencia fatos fora do recorte.'
        using errcode = '22023';
    end if;

    v_upserts := v_upserts || jsonb_build_array(jsonb_build_object(
      'entityType','study_unit',
      'entityId',v_unit.value->>'studyUnitId',
      'parentType','microsequence',
      'parentId',v_unit.value->>'didacticMicrosequenceId',
      'position',(v_unit.value->>'position')::integer,
      'content',v_unit.value->'content'
    ));
    v_source_applications := v_source_applications || jsonb_build_array(
      jsonb_build_object(
        'studyUnitId',v_unit.value->>'studyUnitId',
        'sourceLinks',v_unit.value->'sourceLinks'
      )
    );
    v_current_units:=v_current_units||jsonb_build_array(v_unit.value);
  end loop;

  perform private.assert_course_materialization_pedagogy_v1(
    p_course_id,p_units
  );
  if exists(
    select 1 from private.course_entities entity
    where entity.course_id=p_course_id and entity.entity_type='study_unit'
      and entity.parent_type='microsequence'
      and exists(
        select 1
        from private.course_authoring_part_didactic_microsequences membership
        where membership.course_id=p_course_id
          and membership.authoring_part_id=p_authoring_part_id
          and membership.didactic_microsequence_id=entity.parent_id
      )
      and not exists(
        select 1 from jsonb_array_elements(v_current_units) unit(value)
        where unit.value->>'studyUnitId'=entity.entity_id
      )
  ) then
    raise exception 'A substituição precisa representar toda Unidade corrente da Parte.'
      using errcode='23514';
  end if;
  select coalesce(array_agg(entity.entity_id),array[]::text[])
    into v_existing_study_unit_ids
  from private.course_entities entity
  where entity.course_id=p_course_id and entity.entity_type='study_unit'
    and exists(
      select 1 from jsonb_array_elements(v_current_units) unit(value)
      where unit.value->>'studyUnitId'=entity.entity_id
    );
  v_composition := public.commit_course_composition_for_actor_v1(
    p_actor_id,p_course_id,p_expected_course_revision,
    v_upserts,'[]'::jsonb,v_source_applications,p_request_id
  );
  update private.course_entities entity
  set design_snapshot = jsonb_set(
        unit.value->'designSnapshot','{appliedAt}',to_jsonb(statement_timestamp()),true
      ),
      design_application = jsonb_build_object(
        'contract','aralearn.study-unit-design-application.v1'
      ) || unit.value->'designApplication',
      created_origin = case
        when not (entity.entity_id=any(v_existing_study_unit_ids))
          then coalesce(entity.created_origin,'gpt')
        else entity.created_origin end,
      last_revision_origin = 'gpt'
  from jsonb_array_elements(v_current_units) unit(value)
  where entity.course_id = p_course_id
    and entity.entity_type = 'study_unit'
    and entity.entity_id = unit.value->>'studyUnitId'
    and row(entity.design_snapshot-'appliedAt',entity.design_application,
      entity.last_revision_origin) is distinct from row(
        unit.value->'designSnapshot',
        jsonb_build_object(
          'contract','aralearn.study-unit-design-application.v1'
        ) || unit.value->'designApplication',
        'gpt'::text
      );
  get diagnostics v_design_changes = row_count;
  if v_design_changes > 0
     and coalesce((v_composition->>'createdCount')::integer,0)
       + coalesce((v_composition->>'updatedCount')::integer,0)
       + coalesce((v_composition->>'deletedCount')::integer,0) = 0 then
    update public.courses course
    set revision = course.revision + 1,updated_at = now()
    where course.id = p_course_id returning * into v_course;
  else
    select * into strict v_course
    from public.courses course where course.id = p_course_id;
  end if;

  v_result := jsonb_build_object(
    'contract','aralearn.course-part-materialization.v1',
    'courseId',p_course_id,
    'courseRevision',v_course.revision,
    'authoringPartId',p_authoring_part_id,
    'changed',coalesce((v_composition->>'createdCount')::integer,0)
      + coalesce((v_composition->>'updatedCount')::integer,0)
      + coalesce((v_composition->>'deletedCount')::integer,0)
      + v_design_changes > 0,
    'studyUnitCount',jsonb_array_length(p_units),
    'idempotent',false
  );
  update private.course_change_receipts receipt
  set operation = 'materialize_course_authoring_part_v1',
      request_hash = p_request_hash,
      result = v_result
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id
    and receipt.course_id = p_course_id;
  if not found then
    raise exception 'A materialização não produziu receipt atômico.'
      using errcode = '55000';
  end if;
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_owned_course_authoring_analytics_for_actor_v3(p_actor_id uuid, p_course_id uuid, p_expected_course_revision bigint, p_query jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_course public.courses%rowtype;
  v_scope_kind text;
  v_scope_ref text;
  v_scope_label text;
  v_result jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_course_revision is null or p_expected_course_revision < 1
     or p_query is null or jsonb_typeof(p_query) <> 'object'
     or not (p_query ? 'scope') or p_query - 'scope' <> '{}'::jsonb
     or jsonb_typeof(p_query->'scope') <> 'object'
     or not (p_query->'scope' ?& array['kind','ref'])
     or (p_query->'scope') - 'kind' - 'ref' <> '{}'::jsonb
     or jsonb_typeof(p_query#>'{scope,kind}') <> 'string'
     or p_query#>>'{scope,kind}' not in(
       'course','authoring_part','didactic_microsequence','study_unit'
     ) then
    raise exception 'Consulta de Analytics inválida.' using errcode = '22023';
  end if;
  v_scope_kind := p_query#>>'{scope,kind}';
  if v_scope_kind = 'course' then
    if p_query#>'{scope,ref}' <> 'null'::jsonb then
      raise exception 'O escopo Curso não recebe referência.' using errcode = '22023';
    end if;
    v_scope_ref := null;
  else
    if jsonb_typeof(p_query#>'{scope,ref}') <> 'string' then
      raise exception 'O escopo exige referência corrente.' using errcode = '22023';
    end if;
    v_scope_ref := p_query#>>'{scope,ref}';
    if nullif(btrim(v_scope_ref),'') is null
       or v_scope_ref <> btrim(v_scope_ref)
       or char_length(v_scope_ref) > 240
       or v_scope_ref ~ '[[:cntrl:]]' then
      raise exception 'A referência do escopo é inválida.' using errcode = '22023';
    end if;
  end if;
  select * into v_course from public.courses course where course.id = p_course_id;
  if not found then raise exception 'Curso inexistente.' using errcode = 'PT404'; end if;
  if v_course.revision is distinct from p_expected_course_revision then
    raise exception 'O Curso mudou durante a leitura de Analytics.'
      using errcode = '40001';
  end if;
  if v_scope_kind = 'course' then
    v_scope_label := v_course.title;
  elsif v_scope_kind = 'authoring_part' then
    select part.title into v_scope_label
    from private.course_authoring_parts part
    where part.course_id = p_course_id and part.id::text = v_scope_ref;
  elsif v_scope_kind = 'didactic_microsequence' then
    select microsequence.content->>'title' into v_scope_label
    from private.course_entities microsequence
    where microsequence.course_id = p_course_id
      and microsequence.entity_type = 'microsequence'
      and microsequence.entity_id = v_scope_ref;
  else
    select unit.content->>'title' into v_scope_label
    from private.course_entities unit
    where unit.course_id = p_course_id and unit.entity_type = 'study_unit'
      and unit.entity_id = v_scope_ref;
  end if;
  if v_scope_label is null then
    raise exception 'Escopo de Analytics inexistente.' using errcode = 'PT404';
  end if;

  with
  selected_microsequences as materialized (
    select microsequence.entity_id,microsequence.parent_id as lesson_id,
      microsequence.position,microsequence.content->>'title' as title
    from private.course_entities microsequence
    where microsequence.course_id = p_course_id
      and microsequence.entity_type = 'microsequence'
      and (
        v_scope_kind = 'course'
        or v_scope_kind = 'authoring_part' and exists(
          select 1
          from private.course_authoring_part_didactic_microsequences membership
          where membership.course_id = microsequence.course_id
            and membership.authoring_part_id::text = v_scope_ref
            and membership.didactic_microsequence_id = microsequence.entity_id
        )
        or v_scope_kind = 'didactic_microsequence'
          and microsequence.entity_id = v_scope_ref
        or v_scope_kind = 'study_unit' and exists(
          select 1 from private.course_entities selected_unit
          where selected_unit.course_id = microsequence.course_id
            and selected_unit.entity_type = 'study_unit'
            and selected_unit.entity_id = v_scope_ref
            and selected_unit.parent_id = microsequence.entity_id
        )
      )
  ),
  scope_units_unordered as materialized (
    select unit.entity_id,unit.parent_id as microsequence_id,unit.position,
      unit.content,unit.version,unit.created_at,unit.updated_at,
      unit.design_snapshot,unit.design_application,
      unit.created_origin,unit.last_revision_origin,
      microsequence.lesson_id,lesson.parent_id as module_id,
      microsequence.position as microsequence_position,
      lesson.position as lesson_position,module_value.position as module_position
    from private.course_entities unit
    join selected_microsequences microsequence
      on microsequence.entity_id = unit.parent_id
    join private.course_entities lesson
      on lesson.course_id = unit.course_id and lesson.entity_type = 'lesson'
     and lesson.entity_id = microsequence.lesson_id
    join private.course_entities module_value
      on module_value.course_id = lesson.course_id
     and module_value.entity_type = 'module'
     and module_value.entity_id = lesson.parent_id
    where unit.course_id = p_course_id and unit.entity_type = 'study_unit'
      and (v_scope_kind <> 'study_unit' or unit.entity_id = v_scope_ref)
  ),
  scope_units as materialized (
    select unit.*,
      row_number() over(order by unit.module_position,unit.lesson_position,
        unit.microsequence_position,unit.position,unit.entity_id)::integer
        as analytics_position
    from scope_units_unordered unit
  ),
  scope_options as materialized (
    select 'course'::text as kind,null::text as ref,v_course.title as label,
      0::integer as kind_order,0::integer as first_order,0::integer as second_order,
      0::integer as third_order,0::integer as fourth_order,''::text as tie
    union all
    select 'authoring_part',part.id::text,part.title,1,part.position,0,0,0,part.id::text
    from private.course_authoring_parts part
    where part.course_id = p_course_id
    union all
    select 'didactic_microsequence',microsequence.entity_id,
      microsequence.content->>'title',2,module_value.position,lesson.position,
      microsequence.position,0,microsequence.entity_id
    from private.course_entities microsequence
    join private.course_entities lesson
      on lesson.course_id = microsequence.course_id and lesson.entity_type = 'lesson'
     and lesson.entity_id = microsequence.parent_id
    join private.course_entities module_value
      on module_value.course_id = lesson.course_id and module_value.entity_type = 'module'
     and module_value.entity_id = lesson.parent_id
    where microsequence.course_id = p_course_id
      and microsequence.entity_type = 'microsequence'
    union all
    select 'study_unit',unit.entity_id,unit.content->>'title',3,
      module_value.position,lesson.position,microsequence.position,unit.position,
      unit.entity_id
    from private.course_entities unit
    join private.course_entities microsequence
      on microsequence.course_id = unit.course_id
     and microsequence.entity_type = 'microsequence'
     and microsequence.entity_id = unit.parent_id
    join private.course_entities lesson
      on lesson.course_id = microsequence.course_id and lesson.entity_type = 'lesson'
     and lesson.entity_id = microsequence.parent_id
    join private.course_entities module_value
      on module_value.course_id = lesson.course_id and module_value.entity_type = 'module'
     and module_value.entity_id = lesson.parent_id
    where unit.course_id = p_course_id and unit.entity_type = 'study_unit'
  ),
  current_design as materialized (
    select unit.entity_id as study_unit_id,
      unit.design_snapshot as snapshot,unit.design_application as application
    from scope_units unit
    where jsonb_typeof(unit.design_snapshot) = 'object'
      and jsonb_typeof(unit.design_application) = 'object'
      and jsonb_typeof(unit.design_snapshot->'appliedAt') = 'string'
      and (unit.design_snapshot->>'appliedAt')::timestamptz >= unit.updated_at
  ),

  parameter_value_rows as materialized (
    select parameter.value->>'parameterId' as parameter_id,
      parameter.value->'value' as value,parameter.value->>'origin' as origin,parameter.value->>'reason' as reason,
      parameter.value->>'sourceScopeKind' as source_scope_kind,
      count(distinct design.study_unit_id)::integer as study_unit_count
    from current_design design
    cross join lateral jsonb_array_elements(design.snapshot->'parameters') parameter(value)
    where parameter.value->>'parameterId'
        <> 'new_analysis_unit_ceiling_per_expository_study_unit'
      or design.application->>'mode' in('expository','mixed')
    group by parameter.value->>'parameterId',parameter.value->'value',
      parameter.value->>'origin',parameter.value->>'reason',parameter.value->>'sourceScopeKind'
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
  authorized_analysis as materialized (
    select distinct item.id as analysis_id,item.position+1 as position,item.statement
    from current_design design
    cross join lateral jsonb_array_elements_text(
      design.snapshot->'instructionalAnalysisUnitIds'
    ) requested(value)
    join private.course_instructional_plan_items item
      on item.course_id = p_course_id
     and item.item_kind = 'instructional_analysis_unit'
     and item.id::text = requested.value
  ),
  introduction_rows as materialized (
    select design.study_unit_id,introduction.value as analysis_id
    from current_design design
    cross join lateral jsonb_array_elements_text(
      design.application->'introducedInstructionalAnalysisUnitIds'
    ) introduction(value)
  ),
  explanation_rows as materialized (
    select design.study_unit_id,form.value as form
    from current_design design
    cross join lateral jsonb_array_elements(
      design.application->'explanationApplications'
    ) explanation(value)
    cross join lateral jsonb_array_elements_text(
      explanation.value->'developedForms'
    ) form(value)
  ),
  component_rows as materialized (
    select unit.entity_id as study_unit_id,
      (instance.value->>'package')||'@'||(instance.value->>'version') as component_ref
    from scope_units unit
    cross join lateral (
      select content.value from jsonb_array_elements(unit.content->'content') content(value)
      union all
      select unit.content->'response'
      where jsonb_typeof(unit.content->'response') = 'object'
      union all
      select feedback.value
      from jsonb_array_elements(unit.content->'feedback') feedback(value)
    ) instance(value)
    where jsonb_typeof(instance.value) = 'object'
      and nullif(instance.value->>'package','') is not null
      and nullif(instance.value->>'version','') is not null
  ),
  authorized_evidence as materialized (
    select distinct item.id as evidence_id,item.position+1 as position,item.statement
    from current_design design
    cross join lateral jsonb_array_elements_text(
      design.snapshot->'evidenceRequirementIds'
    ) requested(value)
    join private.course_instructional_plan_items item
      on item.course_id = p_course_id
     and item.item_kind = 'evidence_requirement'
     and item.id::text = requested.value
  ),
  practice_rows as materialized (
    select design.study_unit_id,
      practice.value->>'evidenceRequirementId' as evidence_id,
      practice.value->>'opportunityId' as opportunity_id,
      practice.value->'variedDimensions' as varied_dimensions
    from current_design design
    cross join lateral jsonb_array_elements(
      design.application->'practiceApplications'
    ) practice(value)
  ),
  variation_rows as materialized (
    select practice.evidence_id,practice.opportunity_id,dimension.value as dimension
    from practice_rows practice
    cross join lateral jsonb_array_elements_text(
      practice.varied_dimensions
    ) dimension(value)
  ),
  effective_attributions as materialized (
    select unit.entity_id as study_unit_id,attribution.id as attribution_id
    from scope_units unit
    join lateral (
      select effective.id
      from private.course_effective_source_attribution_v1(
        p_course_id,'study_unit',unit.entity_id
      ) effective
    ) attribution on true
  ),

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
  scope_annotations as materialized (
    select annotation.*
    from private.course_anchored_annotations annotation
    where annotation.course_id = p_course_id
      and annotation.origin in('author','learner','reviewer')
      and (
        v_scope_kind = 'course'
        or annotation.target_kind = 'study_unit' and exists(
          select 1 from scope_units unit where unit.entity_id = annotation.target_id
        )
        or v_scope_kind in('authoring_part','didactic_microsequence')
          and annotation.target_kind = 'didactic_microsequence' and exists(
          select 1 from selected_microsequences microsequence
          where microsequence.entity_id = annotation.target_id
        )
      )
  ),
  relevant_parameter_assignments as materialized (
    select assignment.parameter_id,assignment.scope_kind,assignment.scope_ref
    from private.course_design_parameter_assignments assignment
    where assignment.course_id = p_course_id
      and assignment.origin in('author','research_condition')
      and (
        v_scope_kind = 'course'
        or assignment.scope_kind = 'course'
        or assignment.scope_kind = 'lesson' and exists(
          select 1 from selected_microsequences microsequence
          where microsequence.lesson_id = assignment.scope_ref
        )
        or assignment.scope_kind = 'didactic_microsequence' and exists(
          select 1 from selected_microsequences microsequence
          where microsequence.entity_id = assignment.scope_ref
        )
        or assignment.scope_kind = 'study_unit' and exists(
          select 1 from scope_units unit where unit.entity_id=assignment.scope_ref
        )
      )
  ),
  origin_changes as materialized (
    select origin.origin,
      count(*) filter(where unit.created_origin = origin.origin)::integer as created_count,
      count(*) filter(where unit.version > 1
        and unit.last_revision_origin = origin.origin)::integer as revised_count
    from (values('human'::text),('gpt'::text)) origin(origin)
    cross join scope_units unit
    group by origin.origin
    having count(*) filter(where unit.created_origin = origin.origin
      or unit.version > 1 and unit.last_revision_origin = origin.origin) > 0
  ),
  missing_rows as materialized (
    select format('Unidades de estudo sem informações pedagógicas completas: %s.',
      count(*)::integer) as message
    from scope_units unit
    where not exists(
      select 1 from current_design design where design.study_unit_id = unit.entity_id
    )
    having count(*) > 0
    union all
    select format('Unidades de estudo sem configuração aplicada completa: %s.',
      count(*)::integer)
    from scope_units unit
    left join current_design design on design.study_unit_id = unit.entity_id
    where design.study_unit_id is null
      or jsonb_array_length(design.snapshot->'parameters') <> (select count(*) from private.course_design_parameter_definitions)
    having count(*) > 0
    union all
    select format('Direções editoriais que não puderam ser mostradas integralmente: %s.',
      count(*)::integer)
    from editorial_per_unit editorial where editorial.truncated
    having count(*) > 0
    union all
    select 'Há unidades de estudo cuja origem de autoria não foi registrada.'
    where exists(
      select 1 from scope_units unit
      where unit.created_origin is null
        or unit.version > 1 and unit.last_revision_origin is null
    )
  )
  select jsonb_build_object(
    'contract','aralearn.course-authoring-analytics.v3',
    'course',jsonb_build_object(
      'id',v_course.id,'revision',v_course.revision,'title',v_course.title
    ),
    'scope',jsonb_build_object(
      'selected',jsonb_build_object(
        'kind',v_scope_kind,'ref',v_scope_ref,'label',v_scope_label
      ),
      'options',coalesce((select jsonb_agg(jsonb_build_object(
        'kind',option_value.kind,'ref',option_value.ref,'label',option_value.label
      ) order by option_value.kind_order,option_value.first_order,
        option_value.second_order,option_value.third_order,
        option_value.fourth_order,option_value.tie)
        from scope_options option_value),'[]'::jsonb)
    ),
    'design',jsonb_build_object(
      'studyUnitCount',(select count(*)::integer from scope_units),
      'practiceSequence',coalesce((select jsonb_agg(jsonb_build_object('studyUnitRef',unit.entity_id,'position',unit.analytics_position,'mode',unit.design_application->>'mode') order by unit.analytics_position) from scope_units unit),'[]'::jsonb),

      'parameters',coalesce((select jsonb_agg(jsonb_build_object(
        'parameterId',definition.parameter_id,
        'label',definition.definition->>'label','definition',definition.definition,
        'valueKind',case definition.value_kind when 'set' then 'string_list'
          else definition.value_kind end,
        'effectiveValues',coalesce((select jsonb_agg(jsonb_build_object(
          'value',value_row.value,'origin',value_row.origin,'reason',value_row.reason,
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
'introductionsByStudyUnit',coalesce((select jsonb_agg(jsonb_build_object(
        'studyUnitRef',unit.entity_id,'position',unit.analytics_position,
        'title',unit.content->>'title','introducedCount',coalesce((
          select count(*)::integer from introduction_rows introduction
          where introduction.study_unit_id = unit.entity_id
        ),0)
      ) order by unit.analytics_position)
        from scope_units unit),'[]'::jsonb),
      'explanationForms',coalesce((select jsonb_agg(jsonb_build_object(
        'form',form.form,'studyUnitCount',form.study_unit_count,
        'applicationCount',form.application_count
      ) order by form.form)
        from (select explanation.form,
          count(distinct explanation.study_unit_id)::integer as study_unit_count,
          count(*)::integer as application_count
          from explanation_rows explanation group by explanation.form) form),'[]'::jsonb),
      'components',coalesce((select jsonb_agg(jsonb_build_object(
        'componentRef',component.component_ref,
        'studyUnitCount',component.study_unit_count,
        'instanceCount',component.instance_count
      ) order by component.component_ref)
        from (select instance.component_ref,
          count(distinct instance.study_unit_id)::integer as study_unit_count,
          count(*)::integer as instance_count
          from component_rows instance group by instance.component_ref) component),'[]'::jsonb),
      'practiceByRequirement',coalesce((select jsonb_agg(jsonb_build_object(
        'position',evidence.position,'statement',evidence.statement,
        'opportunityCount',coalesce((select count(distinct practice.opportunity_id)::integer
          from practice_rows practice
          where practice.evidence_id = evidence.evidence_id::text),0)
      ) order by evidence.position)
        from authorized_evidence evidence),'[]'::jsonb),
      'practiceVariationDimensions',coalesce((select jsonb_agg(jsonb_build_object(
        'dimension',variation.dimension,
        'opportunityCount',variation.opportunity_count
      ) order by variation.dimension)
        from (select item.dimension,
          count(distinct (item.evidence_id,item.opportunity_id))::integer
            as opportunity_count
          from variation_rows item group by item.dimension) variation),'[]'::jsonb),
      'sourcesByRole',coalesce((select jsonb_agg(jsonb_build_object(
        'role',source_role.role,'sourceCount',source_role.source_count,
        'anchorCount',source_role.anchor_count,
        'studyUnitCount',source_role.study_unit_count
      ) order by source_role.role)
        from source_role_rows source_role),'[]'::jsonb)
    ),
    'authorship',jsonb_build_object(
      'observations',jsonb_build_object(
        'createdCount',(select count(*)::integer from scope_annotations),
        'openCount',(select count(*)::integer from scope_annotations
          where state in('open','considered')),
        'resolvedCount',(select count(*)::integer from scope_annotations
          where state = 'resolved')
      ),
      'explicitParameterOverrideCount',(
        select count(*)::integer from relevant_parameter_assignments
      ),
      'manuallyRevisedStudyUnitCount',(
        select count(*)::integer from scope_units unit
        where unit.version > 1 and unit.last_revision_origin = 'human'
      ),
      'studyUnitsByOrigin',coalesce((select jsonb_agg(jsonb_build_object(
        'origin',change.origin,'createdCount',change.created_count,
        'lastRevisedCount',change.revised_count
      ) order by change.origin) from origin_changes change),'[]'::jsonb)
    ),
    'missingData',coalesce((select jsonb_agg(missing.message order by missing.message)
      from missing_rows missing),'[]'::jsonb),
    'deepLink',null
  ) into v_result;
  return v_result;
end;
$function$;
-- Só há um writer/reader público por contrato corrente.
drop function public.get_owned_course_design_for_actor_v2(uuid,uuid,text,text,integer,text);
drop function public.apply_course_design_command_for_actor_v2(uuid,uuid,bigint,jsonb,text,text,text);
drop function public.get_owned_course_authoring_analytics_for_actor_v2(uuid,uuid,bigint,jsonb);
do $permissions$
declare function_name regprocedure;
begin
  for function_name in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array['get_owned_course_design_for_actor_v3','apply_course_design_command_for_actor_v3','list_authoring_profiles_for_actor_v1','save_authoring_profile_for_actor_v1','delete_authoring_profile_for_actor_v1','preview_course_authoring_profile_for_actor_v1','apply_course_authoring_profile_for_actor_v1','get_owned_course_authoring_analytics_for_actor_v3']) loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',function_name);
    execute format('grant execute on function %s to service_role',function_name);
  end loop;
end $permissions$;
do $manifest$
declare manifest jsonb;
begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260905080544');
  manifest:=jsonb_set(manifest,'{features}',(select jsonb_agg(feature order by feature) from (select case value when 'course-authoring-configuration-v2' then 'course-authoring-configuration-v3' when 'course-authoring-analytics-v2' then 'course-authoring-analytics-v3' else value end feature from jsonb_array_elements_text(manifest->'features') union select 'authoring-preference-profiles-v1') features));
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L','select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
commit;
