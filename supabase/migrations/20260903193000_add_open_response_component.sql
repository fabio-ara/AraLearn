-- Acrescenta resposta aberta ao catálogo corrente. Snapshots e condições de
-- pesquisa preservam o conjunto efetivo anterior; escolhas autorais ou
-- automáticas por todos os componentes acompanham o catálogo. Conteúdo e
-- proveniência permanecem intactos.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '5min';
select pg_advisory_xact_lock(hashtextextended(
  'aralearn:add-open-response-component',0
));

do $open_response_catalog_preflight$
declare
  v_catalog jsonb;
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision'
       is distinct from '20260903160000' then
    raise exception 'A revisão anterior do runtime não corresponde à esperada.'
      using errcode='55000';
  end if;
  if to_regclass('private.course_component_policy_assignments') is null
     or to_regclass('private.course_entities') is null then
    raise exception 'O estado corrente das políticas de componentes não está íntegro.'
      using errcode='55000';
  end if;
  v_catalog:=private.course_component_catalog_v1();
  if v_catalog->>'version' is distinct from '1-3e5629f8'
     or jsonb_array_length(v_catalog->'options') is distinct from 32
     or exists(
       select 1 from jsonb_array_elements(v_catalog->'options') option(value)
       where option.value->>'ref'='aralearn.response.open@1.0.0'
     ) then
    raise exception 'O catálogo anterior de componentes divergiu.'
      using errcode='55000';
  end if;
  if exists(
    select 1 from private.course_component_policy_assignments assignment
    where assignment.policy->>'catalogVersion' is distinct from '1-3e5629f8'
  ) then
    raise exception 'Há política corrente em revisão inesperada.'
      using errcode='55000';
  end if;
  if exists(
    select 1 from private.course_entities entity
    where entity.entity_type='study_unit'
      and jsonb_typeof(entity.design_snapshot#>'{componentPolicy,policy}')='object'
      and entity.design_snapshot#>>'{componentPolicy,policy,catalogVersion}'
        is distinct from '1-3e5629f8'
  ) then
    raise exception 'Há unidade de estudo com catálogo aplicado inesperado.'
      using errcode='55000';
  end if;
end;
$open_response_catalog_preflight$;

lock table private.course_component_policy_assignments in access exclusive mode;
lock table private.course_entities in share row exclusive mode;

alter table private.course_component_policy_assignments
  drop constraint course_component_policy_assignments_policy_v1;

do $install_open_response_catalog$
declare
  v_previous jsonb:=private.course_component_catalog_v1();
  v_catalog jsonb;
  v_body text;
begin
  v_catalog:=jsonb_build_object(
    'version','1-4616b2e5',
    'options',(v_previous->'options')||jsonb_build_array(jsonb_build_object(
      'ref','aralearn.response.open@1.0.0',
      'label','Resposta aberta',
      'purpose','Pedir que o estudante explique, justifique ou preveja com palavras próprias, sem oferecer alternativas.'
    ))
  );
  v_body:='select '||quote_literal(v_catalog::text)||'::jsonb';
  execute format(
    'create or replace function private.course_component_catalog_v1() '
      ||'returns jsonb language sql immutable security definer '
      ||'set search_path=pg_catalog as %L',
    v_body
  );
end;
$install_open_response_catalog$;

create or replace function private.valid_course_component_policy_v1(p_policy jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path=pg_catalog,private
as $function$
declare
  v_catalog jsonb:=private.course_component_catalog_v1();
begin
  return jsonb_typeof(p_policy)='object'
    and p_policy ?& array[
      'catalogVersion','availability','allowedRefs',
      'excludedRefs','preferredRefs'
    ]
    and p_policy-'catalogVersion'-'availability'-'allowedRefs'
      -'excludedRefs'-'preferredRefs'='{}'::jsonb
    and p_policy->>'catalogVersion'=v_catalog->>'version'
    and p_policy->>'availability' in ('all','allow_only')
    and jsonb_typeof(p_policy->'allowedRefs')='array'
    and jsonb_typeof(p_policy->'excludedRefs')='array'
    and jsonb_typeof(p_policy->'preferredRefs')='array'
    and jsonb_array_length(p_policy->'allowedRefs')<=64
    and jsonb_array_length(p_policy->'excludedRefs')<=64
    and jsonb_array_length(p_policy->'preferredRefs')<=64
    and (
      (p_policy->>'availability'='all'
        and jsonb_array_length(p_policy->'allowedRefs')=0)
      or (p_policy->>'availability'='allow_only'
        and jsonb_array_length(p_policy->'allowedRefs')>0)
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
      where jsonb_typeof(reference.value)<>'string'
        or not exists(
          select 1
          from jsonb_array_elements(v_catalog->'options') option(value)
          where option.value->>'ref'=reference.value#>>'{}'
        )
    )
    and (
      select count(*)=count(distinct value#>>'{}')
      from jsonb_array_elements(p_policy->'allowedRefs')
    )
    and (
      select count(*)=count(distinct value#>>'{}')
      from jsonb_array_elements(p_policy->'excludedRefs')
    )
    and (
      select count(*)=count(distinct value#>>'{}')
      from jsonb_array_elements(p_policy->'preferredRefs')
    )
    and not exists(
      select 1
      from jsonb_array_elements_text(p_policy->'allowedRefs') allowed(value)
      join jsonb_array_elements_text(p_policy->'excludedRefs') excluded(value)
        on excluded.value=allowed.value
    )
    and not exists(
      select 1
      from jsonb_array_elements_text(p_policy->'preferredRefs') preferred(value)
      join jsonb_array_elements_text(p_policy->'excludedRefs') excluded(value)
        on excluded.value=preferred.value
    )
    and (
      p_policy->>'availability'='all'
      or not exists(
        select 1
        from jsonb_array_elements_text(p_policy->'preferredRefs') preferred(value)
        where not (p_policy->'allowedRefs' ? preferred.value)
      )
    )
    and octet_length(p_policy::text)<=4096;
exception when others then
  return false;
end;
$function$;

update private.course_component_policy_assignments assignment
set policy=jsonb_set(
  jsonb_set(
    assignment.policy,
    '{catalogVersion}',
    to_jsonb('1-4616b2e5'::text),
    false
  ),
  '{excludedRefs}',
  case
    when assignment.origin='research_condition'
      and assignment.policy->>'availability'='all'
    then (assignment.policy->'excludedRefs')
      ||jsonb_build_array('aralearn.response.open@1.0.0')
    else assignment.policy->'excludedRefs'
  end,
  false
)
where assignment.policy->>'catalogVersion'='1-3e5629f8';

update private.course_entities entity
set design_snapshot=jsonb_set(
  jsonb_set(
    entity.design_snapshot,
    '{componentPolicy,policy,catalogVersion}',
    to_jsonb('1-4616b2e5'::text),
    false
  ),
  '{componentPolicy,policy,excludedRefs}',
  case
    when entity.design_snapshot#>>'{componentPolicy,policy,availability}'='all'
    then (entity.design_snapshot#>'{componentPolicy,policy,excludedRefs}')
      ||jsonb_build_array('aralearn.response.open@1.0.0')
    else entity.design_snapshot#>'{componentPolicy,policy,excludedRefs}'
  end,
  false
)
where entity.entity_type='study_unit'
  and jsonb_typeof(entity.design_snapshot#>'{componentPolicy,policy}')='object'
  and entity.design_snapshot#>>'{componentPolicy,policy,catalogVersion}'
    ='1-3e5629f8';

alter table private.course_component_policy_assignments
  add constraint course_component_policy_assignments_policy_v1 check(
    jsonb_typeof(policy)='object'
      and octet_length(policy::text)<=4096
      and private.valid_course_component_policy_v1(policy)
  );

-- A função já existente alimenta diretamente o painel e as exportações. A
-- revisão do catálogo é o primeiro ponto ainda não publicado em que podemos
-- corrigir essas mensagens sem reescrever migrations que já chegaram ao banco.
do $humanize_authoring_analytics_missing_data$
declare
  v_definition text;
begin
  v_definition:=pg_get_functiondef(
    'public.get_owned_course_authoring_analytics_for_actor_v2(uuid,uuid,bigint,jsonb)'
      ::regprocedure
  );
  if strpos(v_definition,
       '%s StudyUnits não possuem aplicação pedagógica corrente.')=0
     or strpos(v_definition,
       '%s StudyUnits não possuem os seis parâmetros usados.')=0
     or strpos(v_definition,
       '%s direções editoriais excederam o limite do snapshot.')=0
     or strpos(v_definition,
       'Há mudanças de StudyUnit sem origem explicitamente observável.')=0 then
    raise exception 'As mensagens anteriores dos dados de autoria divergiram.'
      using errcode='55000';
  end if;
  v_definition:=replace(
    v_definition,
    '%s StudyUnits não possuem aplicação pedagógica corrente.',
    'Unidades de estudo sem informações pedagógicas completas: %s.'
  );
  v_definition:=replace(
    v_definition,
    '%s StudyUnits não possuem os seis parâmetros usados.',
    'Unidades de estudo sem configuração aplicada completa: %s.'
  );
  v_definition:=replace(
    v_definition,
    '%s direções editoriais excederam o limite do snapshot.',
    'Direções editoriais que não puderam ser mostradas integralmente: %s.'
  );
  v_definition:=replace(
    v_definition,
    'Há mudanças de StudyUnit sem origem explicitamente observável.',
    'Há unidades de estudo cuja origem de autoria não foi registrada.'
  );
  if v_definition~'StudyUnits? não possuem'
     or strpos(v_definition,
       'direções editoriais excederam o limite do snapshot')>0
     or strpos(v_definition,
       'mudanças de StudyUnit sem origem explicitamente observável')>0 then
    raise exception 'As mensagens internas dos dados de autoria não foram removidas.'
      using errcode='55000';
  end if;
  execute v_definition;
end;
$humanize_authoring_analytics_missing_data$;

do $advance_open_response_catalog_manifest$
declare
  v_manifest jsonb;
  v_body text;
begin
  v_manifest:=jsonb_set(
    public.get_aralearn_runtime_manifest(),
    '{schemaRevision}',
    to_jsonb('20260903193000'::text),
    true
  );
  v_body:='select '||quote_literal(v_manifest::text)||'::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      ||'returns jsonb language sql stable security definer '
      ||'set search_path=pg_catalog as %L',
    v_body
  );
  revoke all on function public.get_aralearn_runtime_manifest()
    from public,anon,authenticated,service_role;
  grant execute on function public.get_aralearn_runtime_manifest()
    to anon,authenticated,service_role;
end;
$advance_open_response_catalog_manifest$;

do $open_response_catalog_postflight$
declare
  v_catalog jsonb:=private.course_component_catalog_v1();
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision'
       is distinct from '20260903193000'
     or v_catalog->>'version' is distinct from '1-4616b2e5'
     or jsonb_array_length(v_catalog->'options') is distinct from 33
     or not exists(
       select 1 from jsonb_array_elements(v_catalog->'options') option(value)
       where option.value=jsonb_build_object(
         'ref','aralearn.response.open@1.0.0',
         'label','Resposta aberta',
         'purpose','Pedir que o estudante explique, justifique ou preveja com palavras próprias, sem oferecer alternativas.'
       )
     )
     or exists(
       select 1 from private.course_component_policy_assignments assignment
       where assignment.policy->>'catalogVersion' is distinct from '1-4616b2e5'
     )
     or exists(
       select 1 from private.course_entities entity
       where entity.entity_type='study_unit'
         and jsonb_typeof(entity.design_snapshot#>'{componentPolicy,policy}')='object'
         and entity.design_snapshot#>>'{componentPolicy,policy,catalogVersion}'
           is distinct from '1-4616b2e5'
     )
     or exists(
       select 1 from private.course_component_policy_assignments assignment
       where assignment.origin='research_condition'
         and assignment.policy->>'availability'='all'
         and not (assignment.policy->'excludedRefs'
           ? 'aralearn.response.open@1.0.0')
     )
     or exists(
       select 1 from private.course_entities entity
       where entity.entity_type='study_unit'
         and entity.design_snapshot#>>'{componentPolicy,policy,availability}'='all'
         and not (entity.design_snapshot#>'{componentPolicy,policy,excludedRefs}'
           ? 'aralearn.response.open@1.0.0')
     ) then
    raise exception 'A instalação da resposta aberta ficou incompleta.'
      using errcode='55000';
  end if;
end;
$open_response_catalog_postflight$;

commit;
