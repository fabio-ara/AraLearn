-- D003/D027/D028: one-time conversion, no retired runtime or compatibility function.
begin;
set local lock_timeout='5s';
set local statement_timeout='5min';
lock table private.course_entities,private.course_component_policy_assignments,
  private.course_sources,private.course_source_attributions in share row exclusive mode;

create function pg_temp.v7_text(p_id text,p_text text) returns jsonb
language sql immutable as $$ select jsonb_build_object('id',p_id,
  'package','aralearn.resource.paragraph','version','1.0.0','data',jsonb_build_object('text',p_text)) $$;

create function pg_temp.v7_component(p jsonb) returns jsonb language plpgsql as $$
declare result jsonb:='[]'; item jsonb; ordinal integer:=0; data jsonb:=p->'data';
begin
 if p->>'package'=any(array['aralearn.resource.dictionary','aralearn.resource.grammar','aralearn.resource.reading']) then
  result:=jsonb_build_array(pg_temp.v7_text(p->>'id',data->>'title'));
  if nullif(data->>'prompt','') is not null then
   result:=result||jsonb_build_array(pg_temp.v7_text('v7-'||md5((p->>'id')||':prompt'),data->>'prompt')); end if;
  for item in select value from jsonb_array_elements(data->'items') loop
   result:=result||jsonb_build_array(pg_temp.v7_text('v7-'||md5((p->>'id')||':label:'||ordinal),item->>'label'));
   if nullif(item->>'description','') is not null then
    result:=result||jsonb_build_array(pg_temp.v7_text('v7-'||md5((p->>'id')||':description:'||ordinal),item->>'description')); end if;
   ordinal:=ordinal+1;
  end loop;
  return result;
 elsif p->>'package'='aralearn.resource.table' then
  -- The previous caption was semantically ambiguous: preserve it as a note,
  -- never infer a legend or title. Developed prose becomes adjacent content.
  if nullif(data->>'prompt','') is not null then
   result:=jsonb_build_array(pg_temp.v7_text('v7-'||md5((p->>'id')||':prompt'),data->>'prompt')); end if;
  data:=data-array['prompt','layout','caption'];
  if nullif(p#>>'{data,caption}','') is not null then data:=data||jsonb_build_object('note',p#>>'{data,caption}'); end if;
  return result||jsonb_build_array(jsonb_set(p,'{data}',data));
 end if;
 return jsonb_build_array(p);
end $$;

create function pg_temp.v7_document(p jsonb) returns jsonb language plpgsql as $$
declare result jsonb; entry record; child jsonb; original jsonb:=p;
begin
 if jsonb_typeof(p)='array' then
  result:='[]';
  for child in select value from jsonb_array_elements(p) loop
   if child ? 'package' then result:=result||pg_temp.v7_component(child);
   else result:=result||jsonb_build_array(pg_temp.v7_document(child)); end if;
  end loop;
  return result;
 elsif jsonb_typeof(p)='object' then
  if p#>>'{response,package}'='aralearn.response.open' then
   -- Preserve prompt, writing guidance and feedback without inventing a key.
   p:=jsonb_set(p,'{content}',coalesce(p->'content','[]')||jsonb_build_array(
    pg_temp.v7_text(p#>>'{response,id}',p#>>'{response,data,prompt}'))||
    case when nullif(p#>>'{response,data,placeholder}','') is null then '[]'::jsonb else jsonb_build_array(
      pg_temp.v7_text('v7-'||md5((p#>>'{response,id}')||':placeholder'),p#>>'{response,data,placeholder}')) end||coalesce(p->'feedback','[]'));
   p:=p||'{"role":"theory","response":null,"feedback":[]}'::jsonb;
  end if;
  result:='{}';
  for entry in select * from jsonb_each(p) loop
   result:=result||jsonb_build_object(entry.key,pg_temp.v7_document(entry.value));
  end loop;
  return result;
 end if;
 return original;
end $$;

create temporary table v7_converted_entities on commit drop as
 select course_id,entity_type,entity_id,parent_id,content,pg_temp.v7_document(content) as next_content
 from private.course_entities where content is distinct from pg_temp.v7_document(content);

-- Keep the authored provenance; normal guards invalidate review/inspection bases
-- by hash. No migrated text receives an approval or fabricated practice evidence.
update private.course_entities e set content=c.next_content,version=e.version+1,updated_at=now()
 from v7_converted_entities c where (e.course_id,e.entity_type,e.entity_id)=(c.course_id,c.entity_type,c.entity_id);

create function pg_temp.v7_occurrences(p_content jsonb,p_links jsonb) returns jsonb language plpgsql as $$
declare result jsonb:='[]'; link jsonb; occurrence jsonb; occurrences jsonb; component jsonb; parts text[];
begin
 if p_content ? 'explanation' then p_content:=p_content->'explanation'; end if;
 for link in select value from jsonb_array_elements(p_links) loop
  occurrences:='[]';
  for occurrence in select value from jsonb_array_elements(link->'occurrences') loop
   component:=null;
   if occurrence->>'slot'='response' then component:=p_content->'response';
   else select value into component from jsonb_array_elements(p_content->(occurrence->>'slot')) where value->>'id'=occurrence->>'resourceId'; end if;
   if component->>'package'='aralearn.response.open' then
    occurrence:=occurrence||jsonb_build_object('slot','content','path','text','resourceId',
     case when occurrence->>'path'='placeholder' then 'v7-'||md5((component->>'id')||':placeholder') else component->>'id' end);
   elsif component->>'package'=any(array['aralearn.resource.dictionary','aralearn.resource.grammar','aralearn.resource.reading']) then
    parts:=regexp_match(occurrence->>'path','^items\[([0-9]+)\]\.(label|description)$');
    occurrence:=occurrence||jsonb_build_object('path','text','resourceId',case
     when occurrence->>'path'='prompt' then 'v7-'||md5((component->>'id')||':prompt')
     when parts is not null then 'v7-'||md5((component->>'id')||':'||parts[2]||':'||parts[1])
     else component->>'id' end);
   elsif component->>'package'='aralearn.resource.table' then
    if occurrence->>'path'='caption' then occurrence:=jsonb_set(occurrence,'{path}','"note"');
    elsif occurrence->>'path'='prompt' then occurrence:=occurrence||jsonb_build_object('path','text','resourceId','v7-'||md5((component->>'id')||':prompt')); end if;
   end if;
   if p_content#>>'{response,package}'='aralearn.response.open' and occurrence->>'slot'='feedback' then
    occurrence:=jsonb_set(occurrence,'{slot}','"content"'); end if;
   occurrences:=occurrences||jsonb_build_array(occurrence);
  end loop;
  result:=result||jsonb_build_array(jsonb_set(link,'{occurrences}',occurrences));
 end loop;
 return result;
end $$;

-- Existing links are not dropped. Each retired consultation target becomes an
-- ordinary source and a literal occurrence; no source is asserted to support a
-- claim merely because it was previously offered as supplementary reading.
do $sources$
declare e record; component jsonb; item jsonb; ordinal integer; v_source_id text;
 v_target_kind text; target jsonb; attribution_id uuid; links jsonb; link jsonb; v_url text;
begin
 for e in select * from v7_converted_entities loop
  v_target_kind:=case e.entity_type when 'study_unit' then 'study_unit' when 'microsequence' then 'microsequence_explanation' end;
  if v_target_kind is null then continue; end if;
  select id into attribution_id from private.course_source_attributions
   where course_id=e.course_id and course_source_attributions.target_kind=v_target_kind and target_id=e.entity_id;
  links:=case when attribution_id is null then '[]'::jsonb else private.course_source_links_v1(e.course_id,attribution_id) end;
  links:=pg_temp.v7_occurrences(e.content,links);
  for component in select distinct value from jsonb_path_query(e.content,
    '$.** ? (@.type() == "object" && (@.package == "aralearn.resource.dictionary" || @.package == "aralearn.resource.grammar" || @.package == "aralearn.resource.reading"))') value loop
   ordinal:=0;
   for item in select value from jsonb_array_elements(component#>'{data,items}') loop
    if item#>>'{target,kind}'='source_attachment' then
     v_source_id:=item#>>'{target,sourceId}';
     if not exists(select 1 from private.course_source_attachments a where a.course_id=e.course_id
       and a.source_id=v_source_id and a.content_hash=item#>>'{target,contentHash}') then
      raise exception 'A referência de PDF removida precisa de arquivo preservado.' using errcode='23514'; end if;
    else
     v_url:=item#>>'{target,url}'; v_source_id:='v7-'||md5(v_url);
     -- HTTP is retained literally in the citation; source security remains HTTPS.
     insert into private.course_sources(course_id,source_id,revision,status,kind,title,citation_text,url,
       origin,availability,verification_status,study_visibility,default_roles)
      values(e.course_id,v_source_id,1,'active','web_page',item->>'label',(item->>'label')||'. '||v_url,
       case when v_url like 'https://%' then v_url else null end,'imported','unknown','unverified',
       case when v_url like 'https://%' then 'citation_and_link' else 'citation' end,'["recommended_reading"]')
      on conflict(course_id,source_id) do nothing;
     if not exists(select 1 from private.course_sources s where s.course_id=e.course_id and s.source_id=v_source_id
       and (s.url=v_url or s.citation_text like '%'||v_url)) then
      raise exception 'Colisão de identidade na migração de Fonte.' using errcode='23514'; end if;
    end if;
    link:=jsonb_build_object('linkId','v7-'||md5((component->>'id')||':'||ordinal),'sourceId',v_source_id,
     'relation','informed_by','roles',jsonb_build_array('recommended_reading'),'anchors','[]'::jsonb,
     'occurrences',jsonb_build_array(jsonb_build_object('occurrenceId','v7-'||md5((component->>'id')||':'||ordinal),
      'slot','content','resourceId','v7-'||md5((component->>'id')||':label:'||ordinal),'path','text',
      'quote',item->>'label','prefix',null,'suffix',null)));
    links:=links||jsonb_build_array(link); ordinal:=ordinal+1;
   end loop;
  end loop;
  if links<>'[]'::jsonb then
   target:=private.course_source_target_state_v1(e.course_id,v_target_kind,e.entity_id);
   perform private.apply_course_source_attribution_v2(e.course_id,v_target_kind,e.entity_id,(target->>'version')::bigint,links);
  end if;
 end loop;
end $sources$;

-- Revisions invalidate authenticated/offline composition caches. Historic
-- answers and event facts remain intact and are not reclassified as correct.
update public.courses set revision=revision+1,updated_at=now()
 where id in(select distinct course_id from v7_converted_entities);

create or replace function private.assert_course_practice_authoring_v1(p_course_id uuid,p_upserts jsonb)
returns void language plpgsql security invoker set search_path=pg_catalog as $function$
declare item jsonb; previous jsonb; next_content jsonb; response jsonb;
begin
 for item in select value from jsonb_array_elements(p_upserts) where value->>'entityType'='study_unit' loop
  next_content:=item->'content'; response:=next_content->'response';
  if response is null or response='null'::jsonb then continue; end if;
  if not exists(select 1 from jsonb_array_elements(private.course_component_catalog_v1()->'options') option
    where option->>'ref'=(response->>'package')||'@'||(response->>'version')) then
   raise exception 'unknown_response_component: Componente de resposta inexistente.' using errcode='22023'; end if;
  select content into previous from private.course_entities
   where course_id=p_course_id and entity_type='study_unit' and entity_id=item->>'entityId';
  if previous->'response' is not distinct from response and previous->'feedback' is not distinct from next_content->'feedback' then continue; end if;
  if jsonb_typeof(next_content->'feedback') is distinct from 'array' or jsonb_array_length(next_content->'feedback')=0
    or not jsonb_path_exists(next_content,'$.feedback[*].data.** ? (@.type() == "string" && @ like_regex "\\S")') then
   raise exception 'practice_offline_feedback_required: A prática precisa de feedback explicativo local.' using errcode='22023'; end if;
 end loop;
end $function$;
revoke all on function private.assert_course_practice_authoring_v1(uuid,jsonb) from public,anon,authenticated,service_role;

alter table private.course_component_policy_assignments drop constraint course_component_policy_assignments_policy_v1;
-- RESOURCE_PACKAGE_CATALOG_BEGIN
-- Gerado por scripts/syncResourcePackageCatalog.mjs; fonte: registro de packages.
create or replace function private.course_component_catalog_v1()
returns jsonb language sql immutable security definer set search_path=pg_catalog
as $catalog$ select '{"version":"1-ab1319c0","schemaFingerprint":"sha256:6ed739177801ffe86379971c468cdd7dacd25342b6c3fd578f82c3b466202db1","options":[{"ref":"aralearn.resource.paragraph@1.0.0","label":"Texto explicado","purpose":"Desenvolver uma explicação progressiva em prosa, listas, literais, escrita anotada e matemática integrada.","authoringEligibility":"current"},{"ref":"aralearn.resource.code@1.0.0","label":"Código","purpose":"Apresentar código cuja sintaxe, indentação e execução mental são relevantes.","authoringEligibility":"current"},{"ref":"aralearn.resource.table@1.0.0","label":"Tabela","purpose":"Comparar atributos repetidos ou consultar valores organizados por linhas e colunas.","authoringEligibility":"current"},{"ref":"aralearn.resource.annotated_text@1.0.0","label":"Texto anotado","purpose":"Relacionar trechos precisos de um texto a observações, funções ou explicações.","authoringEligibility":"current"},{"ref":"aralearn.resource.bpmn_process@1.0.0","label":"Processo BPMN","purpose":"Representar participantes, raias, eventos, atividades, gateways e fluxos segundo o subconjunto didático de BPMN 2.0.","authoringEligibility":"current"},{"ref":"aralearn.resource.interlinear_gloss@1.0.0","label":"Glosa interlinear","purpose":"Alinhar formas linguísticas segmentadas, glosas morfema a morfema, tradução livre e legenda de abreviações.","authoringEligibility":"current"},{"ref":"aralearn.response.choice@1.0.0","label":"Escolha","purpose":"Pedir que o estudante discrimine uma ou mais alternativas plausíveis.","authoringEligibility":"current"},{"ref":"aralearn.response.gap@1.0.0","label":"Lacuna","purpose":"Pedir recuperação ou discriminação exatamente no campo semântico declarado pelo conteúdo.","authoringEligibility":"current"},{"ref":"aralearn.response.ordering@3.0.0","label":"Ordenação","purpose":"Pedir que o estudante reconstrua a ordem de expressões nos próprios campos textuais em que elas são lidas.","authoringEligibility":"current"},{"ref":"aralearn.resource.tree@1.0.0","label":"Árvore enraizada","purpose":"Representar hierarquia com relação pai-filho, raiz explícita e no máximo um pai por nó.","authoringEligibility":"current"},{"ref":"aralearn.resource.matrix@1.0.0","label":"Matriz","purpose":"Representar um arranjo retangular de escalares ou expressões e operações da álgebra linear.","authoringEligibility":"current"},{"ref":"aralearn.resource.reaction@1.0.0","label":"Reação","purpose":"Representar reagentes, produtos, proporções, estados e condições de uma reação.","authoringEligibility":"current"},{"ref":"aralearn.resource.flow@1.0.0","label":"Fluxograma","purpose":"Representar sequência, decisão, ramificação e repetição com a convenção visual de fluxogramas.","authoringEligibility":"current"},{"ref":"aralearn.resource.formula@1.0.0","label":"Fórmula","purpose":"Representar expressão matemática ou química estruturada com leitura acessível explícita.","authoringEligibility":"current"},{"ref":"aralearn.resource.plane@1.0.0","label":"Plano cartesiano","purpose":"Situar pontos, vetores, trajetórias e regiões em duas dimensões com escala acadêmica explícita.","authoringEligibility":"current"},{"ref":"aralearn.resource.chart@1.0.0","label":"Gráfico estatístico","purpose":"Tornar tendência, comparação quantitativa, escala e incerteza visualmente observáveis.","authoringEligibility":"current"},{"ref":"aralearn.resource.software_system_context@1.0.0","label":"Contexto de sistema de software","purpose":"Situar um sistema de software entre pessoas e sistemas externos segundo o diagrama de contexto do modelo C4.","authoringEligibility":"current"},{"ref":"aralearn.resource.software_container@1.0.0","label":"Contêineres de software","purpose":"Representar aplicações e armazenamentos executáveis ou implantáveis dentro de um sistema segundo o nível de contêiner do C4.","authoringEligibility":"current"},{"ref":"aralearn.resource.system_internal_block@1.0.0","label":"Diagrama interno de bloco","purpose":"Representar partes, portas, itens e conectores internos de um bloco segundo a gramática de diagrama interno do SysML.","authoringEligibility":"current"},{"ref":"aralearn.resource.graph@1.0.0","label":"Grafo matemático","purpose":"Representar grafos e dígrafos abstratos segundo a notação de teoria dos grafos.","authoringEligibility":"current"},{"ref":"aralearn.resource.relation_map@1.0.0","label":"Diagrama de relação","purpose":"Tornar visíveis domínio, contradomínio, imagens, preimagens e cardinalidade de uma relação binária.","authoringEligibility":"current"},{"ref":"aralearn.resource.database_schema@1.0.0","label":"Esquema relacional","purpose":"Representar relações, atributos, chaves e dependências referenciais no modelo lógico relacional.","authoringEligibility":"current"},{"ref":"aralearn.resource.memory_layout@1.0.0","label":"Mapa de memória","purpose":"Representar intervalos de endereços, segmentos e ocupação de memória na ordem convencional.","authoringEligibility":"current"},{"ref":"aralearn.resource.network_topology@1.0.0","label":"Topologia de rede","purpose":"Representar equipamentos, segmentos e enlaces de uma rede sem confundi-los com vértices abstratos.","authoringEligibility":"current"},{"ref":"aralearn.resource.packet_layout@1.0.0","label":"Layout de pacote","purpose":"Representar cabeçalhos e registros binários em palavras de largura fixa, com posição e extensão de cada campo.","authoringEligibility":"current"},{"ref":"aralearn.resource.set_diagram@1.0.0","label":"Diagrama de conjuntos","purpose":"Representar inclusão, exclusão e interseção entre dois ou três conjuntos, preservando as regiões de Venn ou a topologia de Euler.","authoringEligibility":"current"},{"ref":"aralearn.resource.state_machine@1.0.0","label":"Diagrama de estados","purpose":"Representar comportamento dependente de estado com a notação gráfica de autômatos ou máquinas de estados.","authoringEligibility":"current"},{"ref":"aralearn.resource.truth_table@1.0.0","label":"Tabela-verdade","purpose":"Representar valorações e o resultado de uma fórmula proposicional segundo a convenção lógica.","authoringEligibility":"current"},{"ref":"aralearn.resource.entity_relationship@1.0.0","label":"Modelo entidade-relacionamento","purpose":"Representar entidades, atributos e cardinalidades no nível conceitual da modelagem de dados.","authoringEligibility":"current"},{"ref":"aralearn.resource.state_transition_table@1.0.0","label":"Tabela de transição","purpose":"Comparar de forma exaustiva a função de transição por estado e evento ou símbolo.","authoringEligibility":"current"},{"ref":"aralearn.resource.call_stack@1.0.0","label":"Pilha de chamadas","purpose":"Representar quadros de ativação, parâmetros, variáveis locais e continuações durante chamadas de função.","authoringEligibility":"current"},{"ref":"aralearn.resource.audio@1.0.0","label":"Áudio","purpose":"Escutar e comparar falas ou gravações quando o som participa da aprendizagem.","authoringEligibility":"current"},{"ref":"aralearn.resource.calculator@1.0.0","label":"Calculadora","purpose":"Disponibilizar cálculo numérico real para verificar resultados, explorar valores e comparar uma previsão com um cálculo explícito.","authoringEligibility":"current"},{"ref":"aralearn.resource.terminal_session@1.0.0","label":"Sessão de terminal","purpose":"Representar uma interação textual temporal entre pessoa e sistema, preservando entradas, saídas, erros e mudanças observáveis de estado.","authoringEligibility":"current"}]}'::jsonb $catalog$;
-- RESOURCE_PACKAGE_CATALOG_END

create function pg_temp.v7_policy(p jsonb) returns jsonb language plpgsql as $$
declare result jsonb:=p; field text; refs jsonb;
begin
 if p is null then return p; end if;
 foreach field in array array['allowedRefs','preferredRefs','excludedRefs'] loop
  select coalesce(jsonb_agg(value order by value),'[]'::jsonb) into refs from (
   select distinct value from jsonb_array_elements_text(p->field)
   where value<>all(array['aralearn.response.open@1.0.0','aralearn.resource.dictionary@1.0.0',
    'aralearn.resource.grammar@1.0.0','aralearn.resource.reading@1.0.0'])
  ) remaining;
  result:=jsonb_set(result,array[field],refs);
 end loop;
 -- An allow-list containing only deleted components has no remaining choice.
 -- The converted material is prose; keep this restrictive policy as prose-only.
 if result->>'availability'='allow_only' and result->'allowedRefs'='[]'::jsonb then
  result:=jsonb_set(result,'{allowedRefs}','["aralearn.resource.paragraph@1.0.0"]');
  result:=jsonb_set(result,'{excludedRefs}',(result->'excludedRefs')-'aralearn.resource.paragraph@1.0.0');
 end if;
 return jsonb_set(result,'{catalogVersion}',private.course_component_catalog_v1()->'version');
end $$;
update private.course_component_policy_assignments set policy=pg_temp.v7_policy(policy);
alter table private.course_component_policy_assignments add constraint course_component_policy_assignments_policy_v1
 check(private.valid_course_component_policy_v1(policy) and octet_length(policy::text)<=4096);
-- Applied snapshots record historical decisions; they are evidence, never a
-- renderer or a way to admit a deleted component into current authorship.

do $verify$ begin
 if exists(select 1 from private.course_entities e where jsonb_path_exists(e.content,
  '$.** ? (@.package == "aralearn.response.open" || @.package == "aralearn.resource.dictionary" || @.package == "aralearn.resource.grammar" || @.package == "aralearn.resource.reading")')) then
  raise exception 'A conversão de componentes ficou incompleta.' using errcode='23514'; end if;
end $verify$;
commit;
