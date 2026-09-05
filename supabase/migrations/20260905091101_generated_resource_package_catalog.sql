-- Atualização compatível dos contratos; não altera instâncias, IDs ou versões.
-- Snapshots históricos conservam literalmente a configuração aplicada.
-- O catálogo passa a ser projetado do mesmo registro usado pelos clientes.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '5min';
select pg_advisory_xact_lock(hashtextextended('aralearn:package-contract-catalog',0));

lock table private.course_component_policy_assignments in access exclusive mode;
lock table private.course_entities in share row exclusive mode;

do $preflight$
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision'
      is distinct from '20260905083846'
    or private.course_component_catalog_v1()->>'version'
      is distinct from '1-4616b2e5' then
    raise exception 'A revisão anterior do runtime ou catálogo divergiu.' using errcode='55000';
  end if;
  if exists(select 1 from private.course_component_policy_assignments
      where policy->>'catalogVersion' is distinct from '1-4616b2e5') then
    raise exception 'Há política corrente em revisão inesperada.' using errcode='55000';
  end if;
end $preflight$;

create temporary table previous_package_catalog on commit drop as
  select private.course_component_catalog_v1() value;
alter table private.course_component_policy_assignments
  drop constraint course_component_policy_assignments_policy_v1;

-- RESOURCE_PACKAGE_CATALOG_BEGIN
-- Gerado por scripts/syncResourcePackageCatalog.mjs; fonte: registro de packages.
create or replace function private.course_component_catalog_v1()
returns jsonb language sql immutable security definer set search_path=pg_catalog
as $catalog$ select '{"version":"1-047a232e","schemaFingerprint":"sha256:3248f400411be8651db1c09c2760fddc2b0918af66eb2f7c07743c29f16b62f4","options":[{"ref":"aralearn.resource.paragraph@1.0.0","label":"Texto explicado","purpose":"Desenvolver uma explicação progressiva em prosa, listas, literais, escrita anotada e matemática integrada."},{"ref":"aralearn.resource.code@1.0.0","label":"Código","purpose":"Apresentar código cuja sintaxe, indentação e execução mental são relevantes."},{"ref":"aralearn.resource.table@1.0.0","label":"Tabela","purpose":"Comparar atributos repetidos ou consultar valores organizados por linhas e colunas."},{"ref":"aralearn.resource.annotated_text@1.0.0","label":"Texto anotado","purpose":"Relacionar trechos precisos de um texto a observações, funções ou explicações."},{"ref":"aralearn.resource.bpmn_process@1.0.0","label":"Processo BPMN","purpose":"Representar participantes, raias, eventos, atividades, gateways e fluxos segundo o subconjunto didático de BPMN 2.0."},{"ref":"aralearn.resource.interlinear_gloss@1.0.0","label":"Glosa interlinear","purpose":"Alinhar formas linguísticas segmentadas, glosas morfema a morfema, tradução livre e legenda de abreviações."},{"ref":"aralearn.response.choice@1.0.0","label":"Escolha","purpose":"Pedir que o estudante discrimine uma ou mais alternativas plausíveis."},{"ref":"aralearn.response.gap@1.0.0","label":"Lacuna","purpose":"Pedir recuperação ou discriminação exatamente no campo semântico declarado pelo conteúdo."},{"ref":"aralearn.response.ordering@3.0.0","label":"Ordenação","purpose":"Pedir que o estudante reconstrua a ordem de expressões nos próprios campos textuais em que elas são lidas."},{"ref":"aralearn.resource.tree@1.0.0","label":"Árvore enraizada","purpose":"Representar hierarquia com relação pai-filho, raiz explícita e no máximo um pai por nó."},{"ref":"aralearn.resource.matrix@1.0.0","label":"Matriz","purpose":"Representar um arranjo retangular de escalares ou expressões e operações da álgebra linear."},{"ref":"aralearn.resource.reaction@1.0.0","label":"Reação","purpose":"Representar reagentes, produtos, proporções, estados e condições de uma reação."},{"ref":"aralearn.resource.flow@1.0.0","label":"Fluxograma","purpose":"Representar sequência, decisão, ramificação e repetição com a convenção visual de fluxogramas."},{"ref":"aralearn.resource.formula@1.0.0","label":"Fórmula","purpose":"Representar expressão matemática ou química estruturada com leitura acessível explícita."},{"ref":"aralearn.resource.plane@1.0.0","label":"Plano cartesiano","purpose":"Situar pontos, vetores, trajetórias e regiões em duas dimensões com escala acadêmica explícita."},{"ref":"aralearn.resource.chart@1.0.0","label":"Gráfico estatístico","purpose":"Tornar tendência, comparação quantitativa, escala e incerteza visualmente observáveis."},{"ref":"aralearn.resource.software_system_context@1.0.0","label":"Contexto de sistema de software","purpose":"Situar um sistema de software entre pessoas e sistemas externos segundo o diagrama de contexto do modelo C4."},{"ref":"aralearn.resource.software_container@1.0.0","label":"Contêineres de software","purpose":"Representar aplicações e armazenamentos executáveis ou implantáveis dentro de um sistema segundo o nível de contêiner do C4."},{"ref":"aralearn.resource.system_internal_block@1.0.0","label":"Diagrama interno de bloco","purpose":"Representar partes, portas, itens e conectores internos de um bloco segundo a gramática de diagrama interno do SysML."},{"ref":"aralearn.resource.graph@1.0.0","label":"Grafo matemático","purpose":"Representar grafos e dígrafos abstratos segundo a notação de teoria dos grafos."},{"ref":"aralearn.resource.relation_map@1.0.0","label":"Diagrama de relação","purpose":"Tornar visíveis domínio, contradomínio, imagens, preimagens e cardinalidade de uma relação binária."},{"ref":"aralearn.resource.database_schema@1.0.0","label":"Esquema relacional","purpose":"Representar relações, atributos, chaves e dependências referenciais no modelo lógico relacional."},{"ref":"aralearn.resource.memory_layout@1.0.0","label":"Mapa de memória","purpose":"Representar intervalos de endereços, segmentos e ocupação de memória na ordem convencional."},{"ref":"aralearn.resource.network_topology@1.0.0","label":"Topologia de rede","purpose":"Representar equipamentos, segmentos e enlaces de uma rede sem confundi-los com vértices abstratos."},{"ref":"aralearn.resource.packet_layout@1.0.0","label":"Layout de pacote","purpose":"Representar cabeçalhos e registros binários em palavras de largura fixa, com posição e extensão de cada campo."},{"ref":"aralearn.resource.set_diagram@1.0.0","label":"Diagrama de conjuntos","purpose":"Representar inclusão, exclusão e interseção entre dois ou três conjuntos, preservando as regiões de Venn ou a topologia de Euler."},{"ref":"aralearn.resource.state_machine@1.0.0","label":"Diagrama de estados","purpose":"Representar comportamento dependente de estado com a notação gráfica de autômatos ou máquinas de estados."},{"ref":"aralearn.resource.truth_table@1.0.0","label":"Tabela-verdade","purpose":"Representar valorações e o resultado de uma fórmula proposicional segundo a convenção lógica."},{"ref":"aralearn.resource.entity_relationship@1.0.0","label":"Modelo entidade-relacionamento","purpose":"Representar entidades, atributos e cardinalidades no nível conceitual da modelagem de dados."},{"ref":"aralearn.resource.state_transition_table@1.0.0","label":"Tabela de transição","purpose":"Comparar de forma exaustiva a função de transição por estado e evento ou símbolo."},{"ref":"aralearn.resource.call_stack@1.0.0","label":"Pilha de chamadas","purpose":"Representar quadros de ativação, parâmetros, variáveis locais e continuações durante chamadas de função."},{"ref":"aralearn.resource.terminal_session@1.0.0","label":"Sessão de terminal","purpose":"Representar uma interação textual temporal entre pessoa e sistema, preservando entradas, saídas, erros e mudanças observáveis de estado."},{"ref":"aralearn.response.open@1.0.0","label":"Resposta aberta","purpose":"Pedir que o estudante explique, justifique ou preveja com palavras próprias, sem oferecer alternativas."}]}'::jsonb $catalog$;
-- RESOURCE_PACKAGE_CATALOG_END

do $compatible_refs$
declare previous_refs jsonb; current_refs jsonb;
begin
  select jsonb_agg(option->>'ref' order by option->>'ref') into previous_refs
    from previous_package_catalog, jsonb_array_elements(value->'options') option;
  select jsonb_agg(option->>'ref' order by option->>'ref') into current_refs
    from jsonb_array_elements(private.course_component_catalog_v1()->'options') option;
  if previous_refs is distinct from current_refs then
    raise exception 'A atualização compatível não pode acrescentar ou retirar referências.' using errcode='55000';
  end if;
end $compatible_refs$;

update private.course_component_policy_assignments
  set policy=jsonb_set(policy,'{catalogVersion}',
    private.course_component_catalog_v1()->'version',false);
alter table private.course_component_policy_assignments
  add constraint course_component_policy_assignments_policy_v1
  check(private.valid_course_component_policy_v1(policy) and octet_length(policy::text)<=4096);

do $manifest$
declare manifest jsonb;
begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260905091101');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L','select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
commit;
