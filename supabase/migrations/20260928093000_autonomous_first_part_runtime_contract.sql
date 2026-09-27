-- O patch autônomo da primeira Parte muda o contrato corrente: as duas funções
-- públicas da Parte ganham p_allow_draft_map e o gate do mapa aceita a autonomia
-- explícita do processo, sem gravar aprovação. Esta migration sela a revisão do
-- manifesto logo depois do patch, como fechamento do lote da candidata.
-- A política autoral compartilhada de apoios de leitura também avança a
-- identidade do catálogo, sem acrescentar ou retirar componentes.
begin;
-- RESOURCE_PACKAGE_CATALOG_BEGIN
-- Gerado por scripts/syncResourcePackageCatalog.mjs; fonte: registro de packages.
create or replace function private.course_component_catalog_v1()
returns jsonb language sql immutable security definer set search_path=pg_catalog
as $catalog$ select '{"version":"1-96666628","schemaFingerprint":"sha256:8656f6c68cff1ab3df4ca1576b1ec758c6275a0b2b4adab4ceab45f39893cac3","options":[{"ref":"aralearn.resource.paragraph@1.0.0","label":"Texto explicado","purpose":"Desenvolver uma explicação progressiva em prosa, listas, literais, escrita anotada e matemática integrada.","authoringEligibility":"current"},{"ref":"aralearn.resource.code@1.0.0","label":"Código","purpose":"Apresentar código cuja sintaxe, indentação e execução mental são relevantes.","authoringEligibility":"current"},{"ref":"aralearn.resource.table@1.0.0","label":"Tabela","purpose":"Comparar atributos repetidos ou consultar valores organizados por linhas e colunas.","authoringEligibility":"current"},{"ref":"aralearn.resource.annotated_text@1.0.0","label":"Texto anotado","purpose":"Relacionar trechos precisos de um texto a observações, funções ou explicações.","authoringEligibility":"current"},{"ref":"aralearn.resource.bpmn_process@1.0.0","label":"Processo BPMN","purpose":"Representar participantes, raias, eventos, atividades, gateways e fluxos segundo o subconjunto didático de BPMN 2.0.","authoringEligibility":"current"},{"ref":"aralearn.resource.interlinear_gloss@1.0.0","label":"Glosa interlinear","purpose":"Alinhar formas linguísticas segmentadas, glosas morfema a morfema, tradução livre e legenda de abreviações.","authoringEligibility":"current"},{"ref":"aralearn.response.choice@1.0.0","label":"Escolha","purpose":"Pedir que o estudante discrimine uma ou mais alternativas plausíveis.","authoringEligibility":"current"},{"ref":"aralearn.response.gap@1.0.0","label":"Lacuna","purpose":"Pedir recuperação ou discriminação exatamente no campo semântico declarado pelo conteúdo.","authoringEligibility":"current"},{"ref":"aralearn.response.ordering@3.0.0","label":"Ordenação","purpose":"Pedir que o estudante reconstrua a ordem de expressões nos próprios campos textuais em que elas são lidas.","authoringEligibility":"current"},{"ref":"aralearn.resource.tree@1.0.0","label":"Árvore enraizada","purpose":"Representar hierarquia com relação pai-filho, raiz explícita e no máximo um pai por nó.","authoringEligibility":"current"},{"ref":"aralearn.resource.matrix@1.0.0","label":"Matriz","purpose":"Representar um arranjo retangular de escalares ou expressões e operações da álgebra linear.","authoringEligibility":"current"},{"ref":"aralearn.resource.reaction@1.0.0","label":"Reação","purpose":"Representar reagentes, produtos, proporções, estados e condições de uma reação.","authoringEligibility":"current"},{"ref":"aralearn.resource.flow@1.0.0","label":"Fluxograma","purpose":"Representar sequência, decisão, ramificação e repetição com a convenção visual de fluxogramas.","authoringEligibility":"current"},{"ref":"aralearn.resource.formula@1.0.0","label":"Fórmula","purpose":"Representar expressão matemática ou química estruturada com leitura acessível explícita.","authoringEligibility":"current"},{"ref":"aralearn.resource.plane@1.0.0","label":"Plano cartesiano","purpose":"Situar pontos, vetores, trajetórias e regiões em duas dimensões com escala acadêmica explícita.","authoringEligibility":"current"},{"ref":"aralearn.resource.chart@1.0.0","label":"Gráfico estatístico","purpose":"Tornar tendência, comparação quantitativa, escala e incerteza visualmente observáveis.","authoringEligibility":"current"},{"ref":"aralearn.resource.software_system_context@1.0.0","label":"Contexto de sistema de software","purpose":"Situar um sistema de software entre pessoas e sistemas externos segundo o diagrama de contexto do modelo C4.","authoringEligibility":"current"},{"ref":"aralearn.resource.software_container@1.0.0","label":"Contêineres de software","purpose":"Representar aplicações e armazenamentos executáveis ou implantáveis dentro de um sistema segundo o nível de contêiner do C4.","authoringEligibility":"current"},{"ref":"aralearn.resource.system_internal_block@1.0.0","label":"Diagrama interno de bloco","purpose":"Representar partes, portas, itens e conectores internos de um bloco segundo a gramática de diagrama interno do SysML.","authoringEligibility":"current"},{"ref":"aralearn.resource.graph@1.0.0","label":"Grafo matemático","purpose":"Representar grafos e dígrafos abstratos segundo a notação de teoria dos grafos.","authoringEligibility":"current"},{"ref":"aralearn.resource.relation_map@1.0.0","label":"Diagrama de relação","purpose":"Tornar visíveis domínio, contradomínio, imagens, preimagens e cardinalidade de uma relação binária.","authoringEligibility":"current"},{"ref":"aralearn.resource.database_schema@1.0.0","label":"Esquema relacional","purpose":"Representar relações, atributos, chaves e dependências referenciais no modelo lógico relacional.","authoringEligibility":"current"},{"ref":"aralearn.resource.memory_layout@1.0.0","label":"Mapa de memória","purpose":"Representar intervalos de endereços, segmentos e ocupação de memória na ordem convencional.","authoringEligibility":"current"},{"ref":"aralearn.resource.network_topology@1.0.0","label":"Topologia de rede","purpose":"Representar equipamentos, segmentos e enlaces de uma rede sem confundi-los com vértices abstratos.","authoringEligibility":"current"},{"ref":"aralearn.resource.packet_layout@1.0.0","label":"Layout de pacote","purpose":"Representar cabeçalhos e registros binários em palavras de largura fixa, com posição e extensão de cada campo.","authoringEligibility":"current"},{"ref":"aralearn.resource.set_diagram@1.0.0","label":"Diagrama de conjuntos","purpose":"Representar inclusão, exclusão e interseção entre dois ou três conjuntos, preservando as regiões de Venn ou a topologia de Euler.","authoringEligibility":"current"},{"ref":"aralearn.resource.state_machine@1.0.0","label":"Diagrama de estados","purpose":"Representar comportamento dependente de estado com a notação gráfica de autômatos ou máquinas de estados.","authoringEligibility":"current"},{"ref":"aralearn.resource.truth_table@1.0.0","label":"Tabela-verdade","purpose":"Representar valorações e o resultado de uma fórmula proposicional segundo a convenção lógica.","authoringEligibility":"current"},{"ref":"aralearn.resource.entity_relationship@1.0.0","label":"Modelo entidade-relacionamento","purpose":"Representar entidades, atributos e cardinalidades no nível conceitual da modelagem de dados.","authoringEligibility":"current"},{"ref":"aralearn.resource.state_transition_table@1.0.0","label":"Tabela de transição","purpose":"Comparar de forma exaustiva a função de transição por estado e evento ou símbolo.","authoringEligibility":"current"},{"ref":"aralearn.resource.call_stack@1.0.0","label":"Pilha de chamadas","purpose":"Representar quadros de ativação, parâmetros, variáveis locais e continuações durante chamadas de função.","authoringEligibility":"current"},{"ref":"aralearn.resource.audio@1.0.0","label":"Áudio","purpose":"Escutar e comparar falas ou gravações quando o som participa da aprendizagem.","authoringEligibility":"current"},{"ref":"aralearn.resource.calculator@1.0.0","label":"Calculadora","purpose":"Disponibilizar cálculo numérico real para verificar resultados, explorar valores e comparar uma previsão com um cálculo explícito.","authoringEligibility":"current"},{"ref":"aralearn.resource.terminal_session@1.0.0","label":"Sessão de terminal","purpose":"Representar uma interação textual temporal entre pessoa e sistema, preservando entradas, saídas, erros e mudanças observáveis de estado.","authoringEligibility":"current"}]}'::jsonb $catalog$;
-- RESOURCE_PACKAGE_CATALOG_END
do $manifest$ declare manifest jsonb; begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260928093000');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;

-- A aprovacao exige que toda Microssequencia declare cobertura de escopo: o
-- vinculo e decisao pedagogica e nao pode ser presumido nem copiado do vizinho.
-- O rascunho segue editavel (p_approved=false) e a pendencia nao exige
-- declaracao humana de motivo.
do $curriculum_target_coverage$
declare
  v_definition text;
  v_marker text:='Todo item obrigatorio precisa aparecer no mapa antes da aprovacao.';
  v_start integer;
  v_offset integer;
  v_block text:=$block$
  if p_approved and exists(
    select 1
    from jsonb_array_elements(p_curricular_map->'modules') module_value(value)
    cross join lateral jsonb_array_elements(module_value.value->'lessons') lesson(value)
    cross join lateral jsonb_array_elements(lesson.value->'microsequences') microsequence(value)
    where coalesce(jsonb_array_length(microsequence.value->'scopeItemIds'),0)=0
  ) then
    raise exception 'Uma Microssequencia sem cobertura de escopo nao pode ser aprovada.'
      using errcode='23514';
  end if;$block$;
begin
  v_definition:=replace(pg_get_functiondef(
    'public.save_course_curricular_map_for_actor_v1(uuid,uuid,bigint,bigint,boolean,jsonb,text,text)'::regprocedure
  ),E'\r\n',E'\n');
  if (length(v_definition)-length(replace(v_definition,v_marker,'')))
      /length(v_marker)<>1 then
    raise exception 'Writer do mapa curricular divergiu: cobertura obrigatoria ausente.' using errcode='55000';
  end if;
  v_start:=position(v_marker in v_definition);
  v_offset:=position('end if;' in substring(v_definition from v_start));
  if v_offset=0 then
    raise exception 'Writer do mapa curricular divergiu: fim do bloco de cobertura ausente.' using errcode='55000';
  end if;
  execute substring(v_definition from 1 for v_start+v_offset+5)||v_block||
    substring(v_definition from v_start+v_offset+6);
end $curriculum_target_coverage$;

notify pgrst,'reload schema';
commit;
