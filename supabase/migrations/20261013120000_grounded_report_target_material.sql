-- Paridade com o domínio (src/domain/coursePedagogicalAudit.js): um juízo
-- sufficient precisa citar o texto efetivamente apresentado no próprio alvo —
-- conteúdo, pergunta, alternativas e retornos. Citar o plano, a declaração de
-- autoria, a Explicação compartilhada (alvo próprio), o título da Unidade ou o
-- envelope do componente (id/pacote/versão) não demonstra a apresentação. A
-- barreira anterior aceitava qualquer trecho da base; assim a primeira Unidade,
-- cujo contexto só existia na Explicação compartilhada, podia ser declarada
-- suficiente citando a Explicação, o título ou um nome de pacote.
--
-- O SQL percorre apenas os campos de dados (data) dos recursos, da resposta e
-- dos retornos, e descarta as folhas que o envelope guarda para avaliar — answer,
-- acceptedAnswers, distractors, answerIds, id, targetInstanceId, targetPath e
-- misconceptionId — e os enums de controle do contrato de resposta —
-- selectionMode, selectionCriterion, kind e responseMode —, mantendo o retorno
-- por alternativa. Distratores podem aparecer como opções de lacuna por escolha,
-- mas isolados não demonstram a apresentação. É uma aproximação do
-- texto apresentado, sem as projeções de pacote do runtime JS: nunca fundamenta
-- suficiência na resposta esperada ou em identificadores, mas ainda pode aceitar
-- outra folha interna, ou uma ocorrência que a projeção acessível mascara no
-- alvo da lacuna. O domínio (projeção acessível sobre o conteúdo preparado) é a
-- regra de referência; este guarda reduz o espaço, não o fecha sozinho. Bases sem
-- material no alvo (sintéticas/legado) mantêm a leitura anterior: caem no escopo
-- de identidade e citações, e um escopo vazio não reprova. A assinatura da função
-- não muda e o inventário vertical permanece; o critério de aceitação da leitura
-- positiva fica mais estrito.
begin;

create or replace function private.course_pedagogical_report_grounded_v1(p_report jsonb,p_basis jsonb)
returns boolean language sql immutable set search_path=pg_catalog as $function$
  with recursive bases as (
    select case p_basis->>'targetKind'
      when 'study_unit' then coalesce((select jsonb_agg(u.value->'content') from jsonb_array_elements(
        coalesce(p_basis->'studyUnits','[]'::jsonb)) u(value) where u.value->>'id'=p_basis->>'targetId'),'[]'::jsonb)
      when 'microsequence_explanation' then
        jsonb_build_array(coalesce(p_basis->'microsequence'->'explanation','null'::jsonb))
          ||coalesce((select jsonb_agg(u.value->'content') from jsonb_array_elements(
               coalesce(p_basis->'studyUnits','[]'::jsonb)) u(value)),'[]'::jsonb)
      else '[]'::jsonb end units
  ), roots as (
    select c.value->'data' node from bases cross join lateral jsonb_array_elements(bases.units) u(value)
      cross join lateral jsonb_array_elements(coalesce(u.value->'content','[]'::jsonb)) c(value)
    union all select u.value->'response'->'data' from bases cross join lateral jsonb_array_elements(bases.units) u(value)
    union all select f.value->'data' from bases cross join lateral jsonb_array_elements(bases.units) u(value)
      cross join lateral jsonb_array_elements(coalesce(u.value->'feedback','[]'::jsonb)) f(value)
    union all select c.value->'data' from jsonb_array_elements(case when p_basis->>'targetKind'='microsequence_explanation'
      then coalesce(p_basis->'microsequence'->'explanation'->'content','[]'::jsonb) else '[]'::jsonb end) c(value)
    union all select f.value->'data' from jsonb_array_elements(case when p_basis->>'targetKind'='microsequence_explanation'
      then coalesce(p_basis->'microsequence'->'explanation'->'feedback','[]'::jsonb) else '[]'::jsonb end) f(value)
  ), walked as (
    select r.node value from roots r
    union all
    select child.value from walked w cross join lateral (
      select e.value from jsonb_each(
          case when jsonb_typeof(w.value)='object' then w.value else '{}'::jsonb end) e(key,value)
        where e.key<>all(array['answer','acceptedAnswers','distractors','answerIds','id',
          'targetInstanceId','targetPath','misconceptionId',
          'selectionMode','selectionCriterion','kind','responseMode'])
      union all
      select a.value from jsonb_array_elements(
          case when jsonb_typeof(w.value)='array' then w.value else '[]'::jsonb end) a(value)
    ) child
  ), presented as (
    select coalesce(jsonb_agg(distinct s.v),'[]'::jsonb) strings from (
      select w.value#>>'{}' v from walked w where jsonb_typeof(w.value)='string'
    ) s(v) where btrim(v)<>''
  ), identity as (
    select coalesce(jsonb_agg(distinct t.value),'[]'::jsonb) strings from (
      select p_basis->'microsequence'->>'title' value
      union all select p_basis->'microsequence'->'explanation'->>'title'
      union all select coalesce(u.value->'content'->>'title',u.value->>'title')
        from jsonb_array_elements(coalesce(p_basis->'studyUnits','[]'::jsonb)) u(value)
    ) t(value) where t.value is not null and btrim(t.value)<>''
  ), citation_strings as (
    select coalesce(jsonb_agg(distinct s.value#>>'{}'),'[]'::jsonb) strings
    from jsonb_path_query(
      coalesce((select jsonb_agg(l.value) from jsonb_array_elements(
        coalesce(p_basis->'citations','[]'::jsonb)) c(value)
        cross join lateral jsonb_array_elements(coalesce(c.value->'links','[]'::jsonb)) l(value)
        where c.value->>'targetKind'=p_basis->>'targetKind'),'[]'::jsonb),
      'strict $.** ? (@.type() == "string")') s(value)
    where btrim(s.value#>>'{}')<>''
  ), own as (
    select coalesce(jsonb_agg(distinct v),'[]'::jsonb) strings from (
      select jsonb_array_elements_text(presented.strings) v from presented
      union all select jsonb_array_elements_text(identity.strings) from identity
      union all select jsonb_array_elements_text(citation_strings.strings) from citation_strings
    ) all_strings(v)
  ), check_scope as (
    select c.value check,case when c.value->>'result'='sufficient' then
        case when c.value->>'dimension' in('alignment','evidence','representation','feedback','sufficiency')
               and jsonb_array_length(presented.strings)>0
          then presented.strings else own.strings end end passages
      from jsonb_array_elements(coalesce(p_report->'checks','[]'::jsonb)) c(value)
      cross join presented cross join own
  )
  select p_basis is not null
    and not exists(
      select 1 from jsonb_array_elements(coalesce(p_report->'checks','[]'::jsonb)) c(value)
        cross join lateral jsonb_array_elements_text(coalesce(c.value->'evidence','[]'::jsonb)) q(quote)
      where not exists(select 1 from jsonb_path_query(p_basis,'strict $.** ? (@.type() == "string")') s(value)
        where position(lower(regexp_replace(btrim(normalize(q.quote)),'\s+',' ','g')) in
          lower(regexp_replace(btrim(normalize(s.value#>>'{}')),'\s+',' ','g')))>0))
    and not exists(
      select 1 from check_scope
      where check_scope.passages is not null and jsonb_array_length(check_scope.passages)>0
        and not exists(
          select 1 from jsonb_array_elements_text(check_scope.check->'evidence') q(quote)
          where exists(select 1 from jsonb_array_elements_text(check_scope.passages) p(passage)
            where position(lower(regexp_replace(btrim(normalize(q.quote)),'\s+',' ','g')) in
              lower(regexp_replace(btrim(normalize(passage)),'\s+',' ','g')))>0)))
$function$;

-- create or replace preserva proprietário e ACL; repetir o revoke mantém a
-- propriedade explícita caso a ordem de instalação mude.
revoke all on function private.course_pedagogical_report_grounded_v1(jsonb,jsonb)
  from public,anon,authenticated,service_role;

-- O manifesto avança a revisão de esquema preservando exatamente as capacidades
-- correntes: a assinatura e o formato do parecer continuam iguais e nenhuma
-- capacidade nova é declarada, embora o critério de aceitação fique mais estrito.
do $manifest$
declare manifest jsonb:=public.get_aralearn_runtime_manifest();
begin
  if manifest->>'schemaRevision' is distinct from '20261013120000' then
    manifest:=manifest||jsonb_build_object('schemaRevision','20261013120000');
    execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
      'select '||quote_literal(manifest::text)||'::jsonb');
  end if;
end $manifest$;

commit;
