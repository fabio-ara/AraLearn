-- Nova autoria produz prática avaliável; conteúdo legado continua legível e recuperável.
begin;
set local lock_timeout='5s';
set local statement_timeout='5min';
select pg_advisory_xact_lock(hashtextextended('aralearn:evaluable-offline-practice',0));

lock table private.course_component_policy_assignments in access exclusive mode;
alter table private.course_component_policy_assignments
  drop constraint course_component_policy_assignments_policy_v1;

-- RESOURCE_PACKAGE_CATALOG_BEGIN
-- Gerado por scripts/syncResourcePackageCatalog.mjs; fonte: registro de packages.
create or replace function private.course_component_catalog_v1()
returns jsonb language sql immutable security definer set search_path=pg_catalog
as $catalog$ select '{"version":"1-978b349c","schemaFingerprint":"sha256:f631f39927b3f7cd68c35093a427f93c11d84f498504930cb996f7464d49b0ea","options":[{"ref":"aralearn.resource.paragraph@1.0.0","label":"Texto explicado","purpose":"Desenvolver uma explicação progressiva em prosa, listas, literais, escrita anotada e matemática integrada.","authoringEligibility":"current"},{"ref":"aralearn.resource.code@1.0.0","label":"Código","purpose":"Apresentar código cuja sintaxe, indentação e execução mental são relevantes.","authoringEligibility":"current"},{"ref":"aralearn.resource.table@1.0.0","label":"Tabela","purpose":"Comparar atributos repetidos ou consultar valores organizados por linhas e colunas.","authoringEligibility":"current"},{"ref":"aralearn.resource.annotated_text@1.0.0","label":"Texto anotado","purpose":"Relacionar trechos precisos de um texto a observações, funções ou explicações.","authoringEligibility":"current"},{"ref":"aralearn.resource.bpmn_process@1.0.0","label":"Processo BPMN","purpose":"Representar participantes, raias, eventos, atividades, gateways e fluxos segundo o subconjunto didático de BPMN 2.0.","authoringEligibility":"current"},{"ref":"aralearn.resource.interlinear_gloss@1.0.0","label":"Glosa interlinear","purpose":"Alinhar formas linguísticas segmentadas, glosas morfema a morfema, tradução livre e legenda de abreviações.","authoringEligibility":"current"},{"ref":"aralearn.response.choice@1.0.0","label":"Escolha","purpose":"Pedir que o estudante discrimine uma ou mais alternativas plausíveis.","authoringEligibility":"current"},{"ref":"aralearn.response.gap@1.0.0","label":"Lacuna","purpose":"Pedir recuperação ou discriminação exatamente no campo semântico declarado pelo conteúdo.","authoringEligibility":"current"},{"ref":"aralearn.response.ordering@3.0.0","label":"Ordenação","purpose":"Pedir que o estudante reconstrua a ordem de expressões nos próprios campos textuais em que elas são lidas.","authoringEligibility":"current"},{"ref":"aralearn.resource.tree@1.0.0","label":"Árvore enraizada","purpose":"Representar hierarquia com relação pai-filho, raiz explícita e no máximo um pai por nó.","authoringEligibility":"current"},{"ref":"aralearn.resource.matrix@1.0.0","label":"Matriz","purpose":"Representar um arranjo retangular de escalares ou expressões e operações da álgebra linear.","authoringEligibility":"current"},{"ref":"aralearn.resource.reaction@1.0.0","label":"Reação","purpose":"Representar reagentes, produtos, proporções, estados e condições de uma reação.","authoringEligibility":"current"},{"ref":"aralearn.resource.flow@1.0.0","label":"Fluxograma","purpose":"Representar sequência, decisão, ramificação e repetição com a convenção visual de fluxogramas.","authoringEligibility":"current"},{"ref":"aralearn.resource.formula@1.0.0","label":"Fórmula","purpose":"Representar expressão matemática ou química estruturada com leitura acessível explícita.","authoringEligibility":"current"},{"ref":"aralearn.resource.plane@1.0.0","label":"Plano cartesiano","purpose":"Situar pontos, vetores, trajetórias e regiões em duas dimensões com escala acadêmica explícita.","authoringEligibility":"current"},{"ref":"aralearn.resource.chart@1.0.0","label":"Gráfico estatístico","purpose":"Tornar tendência, comparação quantitativa, escala e incerteza visualmente observáveis.","authoringEligibility":"current"},{"ref":"aralearn.resource.software_system_context@1.0.0","label":"Contexto de sistema de software","purpose":"Situar um sistema de software entre pessoas e sistemas externos segundo o diagrama de contexto do modelo C4.","authoringEligibility":"current"},{"ref":"aralearn.resource.software_container@1.0.0","label":"Contêineres de software","purpose":"Representar aplicações e armazenamentos executáveis ou implantáveis dentro de um sistema segundo o nível de contêiner do C4.","authoringEligibility":"current"},{"ref":"aralearn.resource.system_internal_block@1.0.0","label":"Diagrama interno de bloco","purpose":"Representar partes, portas, itens e conectores internos de um bloco segundo a gramática de diagrama interno do SysML.","authoringEligibility":"current"},{"ref":"aralearn.resource.graph@1.0.0","label":"Grafo matemático","purpose":"Representar grafos e dígrafos abstratos segundo a notação de teoria dos grafos.","authoringEligibility":"current"},{"ref":"aralearn.resource.relation_map@1.0.0","label":"Diagrama de relação","purpose":"Tornar visíveis domínio, contradomínio, imagens, preimagens e cardinalidade de uma relação binária.","authoringEligibility":"current"},{"ref":"aralearn.resource.database_schema@1.0.0","label":"Esquema relacional","purpose":"Representar relações, atributos, chaves e dependências referenciais no modelo lógico relacional.","authoringEligibility":"current"},{"ref":"aralearn.resource.memory_layout@1.0.0","label":"Mapa de memória","purpose":"Representar intervalos de endereços, segmentos e ocupação de memória na ordem convencional.","authoringEligibility":"current"},{"ref":"aralearn.resource.network_topology@1.0.0","label":"Topologia de rede","purpose":"Representar equipamentos, segmentos e enlaces de uma rede sem confundi-los com vértices abstratos.","authoringEligibility":"current"},{"ref":"aralearn.resource.packet_layout@1.0.0","label":"Layout de pacote","purpose":"Representar cabeçalhos e registros binários em palavras de largura fixa, com posição e extensão de cada campo.","authoringEligibility":"current"},{"ref":"aralearn.resource.set_diagram@1.0.0","label":"Diagrama de conjuntos","purpose":"Representar inclusão, exclusão e interseção entre dois ou três conjuntos, preservando as regiões de Venn ou a topologia de Euler.","authoringEligibility":"current"},{"ref":"aralearn.resource.state_machine@1.0.0","label":"Diagrama de estados","purpose":"Representar comportamento dependente de estado com a notação gráfica de autômatos ou máquinas de estados.","authoringEligibility":"current"},{"ref":"aralearn.resource.truth_table@1.0.0","label":"Tabela-verdade","purpose":"Representar valorações e o resultado de uma fórmula proposicional segundo a convenção lógica.","authoringEligibility":"current"},{"ref":"aralearn.resource.entity_relationship@1.0.0","label":"Modelo entidade-relacionamento","purpose":"Representar entidades, atributos e cardinalidades no nível conceitual da modelagem de dados.","authoringEligibility":"current"},{"ref":"aralearn.resource.state_transition_table@1.0.0","label":"Tabela de transição","purpose":"Comparar de forma exaustiva a função de transição por estado e evento ou símbolo.","authoringEligibility":"current"},{"ref":"aralearn.resource.call_stack@1.0.0","label":"Pilha de chamadas","purpose":"Representar quadros de ativação, parâmetros, variáveis locais e continuações durante chamadas de função.","authoringEligibility":"current"},{"ref":"aralearn.resource.audio@1.0.0","label":"Áudio","purpose":"Escutar e comparar falas ou gravações quando o som participa da aprendizagem.","authoringEligibility":"current"},{"ref":"aralearn.resource.calculator@1.0.0","label":"Calculadora","purpose":"Disponibilizar cálculo numérico real para verificar resultados, explorar valores e comparar uma previsão com um cálculo explícito.","authoringEligibility":"current"},{"ref":"aralearn.resource.dictionary@1.0.0","label":"Dicionário","purpose":"Abrir um ou mais dicionários configurados pela autoria para consultar sentidos, pronúncia e exemplos adequados ao contexto.","authoringEligibility":"current"},{"ref":"aralearn.resource.grammar@1.0.0","label":"Gramática","purpose":"Abrir explicações gramaticais escolhidas para apoiar a análise de formas, construções e usos no contexto da tarefa.","authoringEligibility":"current"},{"ref":"aralearn.resource.reading@1.0.0","label":"Leitura complementar","purpose":"Oferecer leituras selecionadas com orientação para ampliar, contrastar ou aplicar o conteúdo da tarefa e depois retomar o estudo.","authoringEligibility":"current"},{"ref":"aralearn.resource.terminal_session@1.0.0","label":"Sessão de terminal","purpose":"Representar uma interação textual temporal entre pessoa e sistema, preservando entradas, saídas, erros e mudanças observáveis de estado.","authoringEligibility":"current"},{"ref":"aralearn.response.open@1.0.0","label":"Resposta aberta","purpose":"Pedir que o estudante explique, justifique ou preveja com palavras próprias, sem oferecer alternativas.","authoringEligibility":"legacy_only"}]}'::jsonb $catalog$;
-- RESOURCE_PACKAGE_CATALOG_END

update private.course_component_policy_assignments
set policy=jsonb_set(policy,'{catalogVersion}',private.course_component_catalog_v1()->'version',false);
alter table private.course_component_policy_assignments
  add constraint course_component_policy_assignments_policy_v1
  check(private.valid_course_component_policy_v1(policy) and octet_length(policy::text)<=4096);
-- Snapshots, respostas e feedback históricos não são reescritos.

create function private.assert_course_practice_authoring_v1(p_course_id uuid,p_upserts jsonb)
returns void language plpgsql security invoker set search_path=pg_catalog as $function$
declare item jsonb; previous jsonb; next_content jsonb; response jsonb;
begin
  for item in select value from jsonb_array_elements(p_upserts) where value->>'entityType'='study_unit' loop
    next_content:=item->'content'; response:=next_content->'response';
    if response is null or response='null'::jsonb then continue; end if;
    select content into previous from private.course_entities
      where course_id=p_course_id and entity_type='study_unit' and entity_id=item->>'entityId';
    if exists(select 1 from jsonb_array_elements(private.course_component_catalog_v1()->'options') option
      where option->>'ref'=(response->>'package')||'@'||(response->>'version') and option->>'authoringEligibility'='legacy_only') then
      if previous->'response' is not distinct from response then continue; end if;
      raise exception 'practice_response_legacy_only: Resposta aberta é preservada apenas no legado; escolha prática avaliável offline.' using errcode='22023';
    end if;
    if previous->'response' is not distinct from response and previous->'feedback' is not distinct from next_content->'feedback' then continue; end if;
    if jsonb_typeof(next_content->'feedback') is distinct from 'array' then
      raise exception 'practice_offline_feedback_required: A prática precisa de feedback explicativo local.' using errcode='22023';
    end if;
    if jsonb_array_length(next_content->'feedback')=0 or not jsonb_path_exists(next_content,
      '$.feedback[*].data.** ? (@.type() == "string" && @ like_regex "\\S")') then
      raise exception 'practice_offline_feedback_required: A prática precisa de feedback explicativo local.' using errcode='22023';
    end if;
  end loop;
end $function$;
revoke all on function private.assert_course_practice_authoring_v1(uuid,jsonb) from public,anon,authenticated,service_role;

-- O core compartilhado já verificou autorização/CAS e bloqueou a revisão; nenhum
-- escritor de composição pode criar nova resposta aberta por outra sobrecarga.
do $core$
declare definition text; fragment text;
begin
  definition:=replace(pg_get_functiondef('private.commit_course_composition_core_v1(uuid,uuid,bigint,jsonb,jsonb,text,jsonb)'::regprocedure),E'\r\n',E'\n');
  fragment:=$before$  select count(*)::integer into v_before_entity_count
  from private.course_entities entity where entity.course_id = p_course_id;$before$;
  if position(fragment in definition)=0 then
    raise exception 'O core de composição diverge do recorte esperado.' using errcode='55000';
  end if;
  execute replace(definition,fragment,
    E'  perform private.assert_course_practice_authoring_v1(p_course_id,v_upserts);\n'||fragment);
end $core$;

do $manifest$
declare manifest jsonb;
begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260916025635');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
commit;
