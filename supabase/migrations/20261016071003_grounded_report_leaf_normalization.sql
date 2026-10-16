-- Reduz o custo da validação de fundamentação do parecer de inspeção sem mudar veredicto:
-- cada quote e cada folha da base passam a ser normalizadas uma única vez, com
-- deduplicação, em CTEs MATERIALIZED; a pertinência compara só os valores distintos.
-- A varredura anterior de todas as folhas da base era refeita por quote. A segunda
-- condição (escopo próprio mínimo por check sufficient) permanece literalmente igual,
-- a normalização (NFC, btrim, colapso de espaços e caixa baixa) é a mesma, e
-- assinatura, volatilidade, search_path e ACL são preservados: nenhuma capacidade
-- nova é declarada.
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
  , quote_norm as materialized (
    select distinct lower(regexp_replace(btrim(normalize(q.quote)),'\s+',' ','g')) nq
    from jsonb_array_elements(coalesce(p_report->'checks','[]'::jsonb)) c(value)
      cross join lateral jsonb_array_elements_text(coalesce(c.value->'evidence','[]'::jsonb)) q(quote)
  ), leaf_norm as materialized (
    select distinct lower(regexp_replace(btrim(normalize(s.value#>>'{}')),'\s+',' ','g')) nl
    from jsonb_path_query(p_basis,'strict $.** ? (@.type() == "string")') s(value)
  )
  select p_basis is not null
        and not exists(
      select 1 from quote_norm nq
      where not exists(select 1 from leaf_norm nl where position(nq.nq in nl.nl)>0))
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
-- correntes: assinatura, formato do parecer e critério de aceitação continuam iguais.
do $manifest$
declare manifest jsonb:=public.get_aralearn_runtime_manifest();
begin
  if manifest->>'schemaRevision' is distinct from '20261016071003' then
    manifest:=manifest||jsonb_build_object('schemaRevision','20261016071003');
    execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
      'select '||quote_literal(manifest::text)||'::jsonb');
  end if;
end $manifest$;

commit;
