-- #125: ciclo mínimo achado -> correção autoral -> verificação rastreável.
-- Rodadas são imutáveis; achados e correções preservam versões append-only.

begin;

set local lock_timeout = '15s';
set local statement_timeout = '10min';

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-course-audit-corrections-v1',0
));

do $course_audit_corrections_preflight$
declare
  v_manifest jsonb;
begin
  if to_regclass('public.courses') is null
     or to_regclass('private.course_entities') is null
     or to_regclass('private.course_instructional_plans') is null
     or to_regclass('private.course_instructional_plan_items') is null
     or to_regclass('private.course_design_target_plan_items') is null
     or to_regclass('private.course_source_revisions') is null
     or to_regclass('private.course_source_anchor_revisions') is null
     or to_regclass('private.course_source_attributions') is null
     or to_regclass('private.course_anchored_annotations') is null
     or to_regclass('private.course_change_receipts') is null
     or to_regclass('private.course_events') is null
     or to_regprocedure('private.require_service_role()') is null
     or to_regprocedure('private.require_course_access_v1(uuid,uuid,boolean)') is null
     or to_regprocedure('private.course_source_target_state_v1(uuid,text,text)') is null
     or to_regprocedure('private.course_effective_source_links_v1(uuid,text,text)') is null
     or to_regprocedure('private.valid_course_source_links_shape_v1(jsonb,boolean)') is null
     or to_regprocedure('private.apply_course_source_attribution_v1(uuid,text,text,bigint,jsonb,uuid,boolean,text)') is null
     or to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception 'Dependências do ciclo de auditoria do Curso ausentes.'
      using errcode='55000';
  end if;
  if to_regclass('private.course_instructional_audit_runs') is not null
     or to_regclass('private.course_audit_findings') is not null
     or to_regclass('private.course_audit_finding_annotations') is not null
     or to_regclass('private.course_authoring_corrections') is not null
     or exists(
       select 1 from information_schema.columns
       where table_schema='public' and table_name='courses'
         and column_name='audit_set_version'
     ) then
    raise exception 'A autoridade do ciclo de auditoria já existe parcialmente.'
      using errcode='55000';
  end if;
  v_manifest:=public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision'<>'20260817200000'
     or (v_manifest->>'contractVersion')::integer<>1
     or not (v_manifest->'features' ?& array[
       'course-anchored-annotations-v1','course-source-provenance-v1',
       'course-instructional-plan-v1','course-design-parameters-v1'
     ]) then
    raise exception 'Manifesto anterior ao ciclo de auditoria é incompatível.'
      using errcode='55000';
  end if;
end;
$course_audit_corrections_preflight$;

-- O mesmo lock que protege a criação também reafirma o preflight materializado
-- pelo runner. observation_threads é apenas telemetria; referências de correção
-- nessa tabela, e todos os outros 25 blockers, precisam continuar vazios.
lock table public.courses in share row exclusive mode;
lock table private.course_entities in share row exclusive mode;
lock table private.course_instructional_plans in share row exclusive mode;
lock table private.course_instructional_plan_items in share row exclusive mode;
lock table private.course_design_target_plan_items in share row exclusive mode;
lock table private.course_source_revisions in share row exclusive mode;
lock table private.course_source_anchor_revisions in share row exclusive mode;
lock table private.course_source_attributions in share row exclusive mode;
lock table private.course_source_attribution_sources in share row exclusive mode;
lock table private.course_source_attribution_anchors in share row exclusive mode;
lock table private.course_anchored_annotations in share row exclusive mode;
lock table private.course_change_receipts in share row exclusive mode;
lock table private.course_events in share row exclusive mode;
lock table private.authoring_workspace_observations in share row exclusive mode;
lock table private.authoring_audit_runs in share row exclusive mode;
lock table private.authoring_audit_run_microsequences in share row exclusive mode;
lock table private.authoring_audit_run_completions in share row exclusive mode;
lock table private.authoring_audit_run_components in share row exclusive mode;
lock table private.authoring_workspace_requests in share row exclusive mode;
lock table private.authoring_workspace_events in share row exclusive mode;
lock table private.legacy_authoring_workspaces in share row exclusive mode;
lock table private.trail_observation_threads in share row exclusive mode;
lock table private.authoring_instructional_analyses in share row exclusive mode;
lock table private.authoring_design_parameter_assignments in share row exclusive mode;
lock table private.authoring_resource_sets in share row exclusive mode;
lock table private.authoring_resource_set_members in share row exclusive mode;
lock table private.authoring_effective_design_snapshots in share row exclusive mode;
lock table private.authoring_effective_design_snapshot_values in share row exclusive mode;
lock table private.authoring_effective_design_snapshot_resource_sets in share row exclusive mode;
lock table private.authoring_pedagogical_blueprints in share row exclusive mode;
lock table private.authoring_pedagogical_blueprint_bindings in share row exclusive mode;
lock table private.authoring_microsequence_design_bindings in share row exclusive mode;
lock table private.authoring_materialization_states in share row exclusive mode;
lock table private.authoring_materialization_manifests in share row exclusive mode;
lock table private.authoring_manifest_coverage in share row exclusive mode;
lock table private.authoring_manifest_metrics in share row exclusive mode;
lock table private.authoring_manifest_resource_selections in share row exclusive mode;
lock table private.authoring_manifest_materialized_resources in share row exclusive mode;

do $reaffirm_course_audit_cutover_blockers$
declare
  v_counts jsonb;
begin
  select jsonb_object_agg(name,value order by name) into v_counts
  from (
    select 'audit_findings' name,count(*) value
      from private.authoring_workspace_observations where kind='audit_finding'
    union all select 'audit_runs',count(*) from private.authoring_audit_runs
    union all select 'audit_run_microsequences',count(*) from private.authoring_audit_run_microsequences
    union all select 'audit_run_completions',count(*) from private.authoring_audit_run_completions
    union all select 'audit_run_components',count(*) from private.authoring_audit_run_components
    union all select 'audit_requests',count(*) from private.authoring_workspace_requests where operation in(
      'create_finding','decide_finding','link_finding_correction','verify_finding',
      'delete_finding','run_authoring_audit','record_authoring_semantic_audit'
    )
    union all select 'audit_events',count(*) from private.authoring_workspace_events where operation in(
      'create_finding','decide_finding','link_finding_correction','verify_finding',
      'delete_finding','run_authoring_audit','record_authoring_semantic_audit'
    )
    union all select 'active_audit_mandates',count(*) from private.legacy_authoring_workspaces
      where authoring_state#>>'{mandate,kind}' in('audit','repair_findings')
    union all select 'observation_threads',count(*) from private.trail_observation_threads
    union all select 'observation_thread_corrections',count(*) from private.trail_observation_threads
      where correction_request_id is not null or correction_entity_path is not null
         or correction_linked_at is not null or correction_resulting_revision is not null
    union all select 'instructional_analyses',count(*) from private.authoring_instructional_analyses
    union all select 'design_parameter_assignments',count(*) from private.authoring_design_parameter_assignments
    union all select 'resource_sets',count(*) from private.authoring_resource_sets
    union all select 'resource_set_members',count(*) from private.authoring_resource_set_members
    union all select 'effective_design_snapshots',count(*) from private.authoring_effective_design_snapshots
    union all select 'effective_design_snapshot_values',count(*) from private.authoring_effective_design_snapshot_values
    union all select 'effective_design_snapshot_resource_sets',count(*) from private.authoring_effective_design_snapshot_resource_sets
    union all select 'pedagogical_blueprints',count(*) from private.authoring_pedagogical_blueprints
    union all select 'pedagogical_blueprint_bindings',count(*) from private.authoring_pedagogical_blueprint_bindings
    union all select 'microsequence_design_bindings',count(*) from private.authoring_microsequence_design_bindings
    union all select 'materialization_states',count(*) from private.authoring_materialization_states
    union all select 'materialization_manifests',count(*) from private.authoring_materialization_manifests
    union all select 'manifest_coverage',count(*) from private.authoring_manifest_coverage
    union all select 'manifest_metrics',count(*) from private.authoring_manifest_metrics
    union all select 'manifest_resource_selections',count(*) from private.authoring_manifest_resource_selections
    union all select 'manifest_materialized_resources',count(*) from private.authoring_manifest_materialized_resources
  ) counts;
  if exists(
    select 1 from jsonb_each_text(v_counts) item
    where item.key<>'observation_threads' and item.value::bigint<>0
  ) or (select count(*) from jsonb_object_keys(v_counts))<>26 then
    raise exception 'Blockers legados de auditoria/desenho reapareceram: %.',v_counts
      using errcode='55000';
  end if;
end;
$reaffirm_course_audit_cutover_blockers$;

alter table public.courses
  add column audit_set_version bigint not null default 0,
  add constraint courses_audit_set_version_v1 check(audit_set_version>=0);

create function private.course_audit_json_hash_v1(p_value jsonb)
returns text language sql immutable security definer
set search_path=pg_catalog,extensions as $function$
  select encode(extensions.digest(convert_to(p_value::text,'UTF8'),'sha256'),'hex')
$function$;

create function private.course_audit_public_command_binding_v1(p_command jsonb)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog as $function$
declare
  v_binding jsonb:=p_command-'__replayOnly';
  v_structural_check_id text;
  v_checks jsonb;
  v_findings jsonb;
begin
  if p_command->>'type' not in('record_audit','verify_finding')
     or jsonb_typeof(p_command->'checks') is distinct from 'array' then
    return v_binding;
  end if;
  select check_value->>'checkId' into v_structural_check_id
  from jsonb_array_elements(p_command->'checks') check_value
  where check_value->>'dimension'='structural_conformance'
  order by check_value->>'checkId' limit 1;
  select coalesce(jsonb_agg(check_value order by ordinal),'[]'::jsonb)
  into v_checks
  from jsonb_array_elements(p_command->'checks')
    with ordinality checks(check_value,ordinal)
  where check_value->>'dimension' is distinct from 'structural_conformance';
  v_binding:=jsonb_set(v_binding,'{checks}',v_checks,true);
  if p_command->>'type'='record_audit'
     and jsonb_typeof(p_command->'findings')='array' then
    select coalesce(jsonb_agg(finding order by ordinal),'[]'::jsonb)
    into v_findings
    from jsonb_array_elements(p_command->'findings')
      with ordinality findings(finding,ordinal)
    where finding->>'checkId' is distinct from v_structural_check_id;
    v_binding:=jsonb_set(v_binding,'{findings}',v_findings,true);
  end if;
  return v_binding;
end;
$function$;


create function private.valid_course_audit_text_v1(
  p_value text,p_maximum_characters integer,p_maximum_bytes integer,
  p_nullable boolean default false,p_allow_empty boolean default false
)
returns boolean language sql immutable security definer
set search_path=pg_catalog as $function$
  select case when p_value is null then p_nullable else
    (p_allow_empty or p_value~'[^[:space:]]')
    and char_length(p_value)<=p_maximum_characters
    and octet_length(p_value)<=p_maximum_bytes
    and translate(p_value,E'\n\r\t','') !~ '[[:cntrl:]]' end
$function$;

create function private.valid_course_audit_timestamp_v1(p_value text)
returns boolean language plpgsql stable security definer
set search_path=pg_catalog as $function$
begin
  if p_value is null or p_value !~
    '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' then
    return false;
  end if;
  perform p_value::timestamptz;
  return true;
exception when others then return false;
end;
$function$;

create function private.valid_course_audit_source_links_v1(p_links jsonb)
returns boolean language sql stable security definer
set search_path=pg_catalog,private as $function$
  select private.valid_course_source_links_shape_v1(p_links,false)
$function$;

create function private.valid_course_audit_check_v1(p_check jsonb)
returns boolean language plpgsql stable security definer
set search_path=pg_catalog,private as $function$
declare
  v_result text;
  v_dimension text;
  v_expected text;
begin
  if jsonb_typeof(p_check) is distinct from 'object'
     or not (p_check ?& array[
       'checkId','dimension','criterion','result','publicEvidence','adequacy',
       'planItemRefs','parameterRefs','sourceLinks'
     ])
     or p_check-'checkId'-'dimension'-'criterion'-'result'-'publicEvidence'
       -'adequacy'-'planItemRefs'-'parameterRefs'-'sourceLinks'<>'{}'::jsonb
     or p_check->>'checkId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or p_check->>'dimension' not in(
       'structural_conformance','pedagogical_quality','factual_quality','editorial_quality'
     )
     or p_check->>'result' not in('passed','failed','uncertain','not_applicable','not_checked')
     or not private.valid_course_audit_text_v1(p_check->>'publicEvidence',2000,8192,false,false)
     or jsonb_typeof(p_check->'criterion') is distinct from 'object'
     or not (p_check->'criterion' ?& array['code','version','statement'])
     or (p_check->'criterion')-'code'-'version'-'statement'<>'{}'::jsonb
     or p_check#>>'{criterion,code}' !~ '^[a-z][a-z0-9_.:-]{2,119}$'
     or not private.valid_course_audit_text_v1(p_check#>>'{criterion,version}',80,320,false,false)
     or not private.valid_course_audit_text_v1(p_check#>>'{criterion,statement}',1000,4096,false,false)
     or jsonb_typeof(p_check->'planItemRefs') is distinct from 'array'
     or jsonb_array_length(p_check->'planItemRefs')>16
     or jsonb_typeof(p_check->'parameterRefs') is distinct from 'array'
     or jsonb_array_length(p_check->'parameterRefs')>8
     or not private.valid_course_audit_source_links_v1(p_check->'sourceLinks') then
    return false;
  end if;
  if exists(
    select 1 from jsonb_array_elements(p_check->'planItemRefs') ref
    where jsonb_typeof(ref) is distinct from 'object'
      or ref-'planItemId'-'version'<>'{}'::jsonb
      or not (ref ?& array['planItemId','version'])
      or ref->>'planItemId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(ref->'version') is distinct from 'number'
      or ref->>'version' !~ '^[1-9][0-9]*$'
  ) or exists(
    select 1 from jsonb_array_elements(p_check->'parameterRefs') ref
    where jsonb_typeof(ref) is distinct from 'object'
      or ref-'parameterId'-'changeId'<>'{}'::jsonb
      or not (ref ?& array['parameterId','changeId'])
      or ref->>'parameterId' !~ '^[a-z][a-z0-9_]{0,159}$'
      or ref->'changeId'<>'null'::jsonb and(
        jsonb_typeof(ref->'changeId') is distinct from 'string'
        or ref->>'changeId' !~ '^[1-9][0-9]{0,18}$'
      )
  ) or (
    select count(*)<>count(distinct ref->>'planItemId')
    from jsonb_array_elements(p_check->'planItemRefs') ref
  ) or (
    select count(*)<>count(distinct ref->>'parameterId')
    from jsonb_array_elements(p_check->'parameterRefs') ref
  ) then return false; end if;
  v_result:=p_check->>'result';
  v_dimension:=p_check->>'dimension';
  v_expected:=case v_result when 'passed' then 'sufficient'
    when 'failed' then 'insufficient' when 'uncertain' then 'uncertain'
    when 'not_applicable' then 'not_applicable' else 'not_assessed' end;
  if p_check->>'adequacy'<>v_expected then return false; end if;
  if v_dimension='factual_quality' and v_result in('passed','failed') then
    if v_result='passed' and jsonb_array_length(p_check->'sourceLinks')=0 then
      return false;
    end if;
    if exists(
      select 1 from jsonb_array_elements(p_check->'sourceLinks') link
      where link->>'relation'<>'supported_by'
        and not (p_check#>>'{criterion,code}'='quotation_fidelity'
          and link->>'relation'='quoted_from')
    ) then return false; end if;
  end if;
  return true;
exception when others then return false;
end;
$function$;

create function private.valid_course_audit_checks_v1(p_checks jsonb)
returns boolean language sql stable security definer
set search_path=pg_catalog,private as $function$
  select coalesce(jsonb_typeof(p_checks)='array'
    and jsonb_array_length(p_checks) between 4 and 32
    and octet_length(convert_to(p_checks::text,'UTF8'))<=196608
    and not exists(
      select 1 from jsonb_array_elements(p_checks) check_value
      where not private.valid_course_audit_check_v1(check_value)
    )
    and (select count(*)=count(distinct check_value->>'checkId')
      from jsonb_array_elements(p_checks) check_value)
    and not exists(
      select dimension from unnest(array[
        'structural_conformance','pedagogical_quality','factual_quality','editorial_quality'
      ]) dimension
      where not exists(
        select 1 from jsonb_array_elements(p_checks) check_value
        where check_value->>'dimension'=dimension
      )
    ),false)
$function$;

create function private.valid_course_audit_resource_instance_v1(
  p_instance jsonb,p_slot text
)
returns boolean language sql immutable security definer
set search_path=pg_catalog as $function$
  select coalesce(
    jsonb_typeof(p_instance)='object'
    and p_instance ?& array['id','package','version','data']
    and p_instance-'id'-'package'-'version'-'data'='{}'::jsonb
    and jsonb_typeof(p_instance->'id')='string'
    and nullif(btrim(p_instance->>'id'),'') is not null
    and p_instance->>'id'=btrim(p_instance->>'id')
    and char_length(p_instance->>'id')<=240
    and octet_length(convert_to(p_instance->>'id','UTF8'))<=960
    and (p_instance->>'id') !~ '[[:cntrl:]]'
    and jsonb_typeof(p_instance->'package')='string'
    and p_instance->>'package'=btrim(p_instance->>'package')
    and p_instance->>'package'~case when p_slot='response'
      then '^aralearn[.]response[.][a-z][a-z0-9]*([._-][a-z0-9]+)*$'
      else '^aralearn[.]resource[.][a-z][a-z0-9]*([._-][a-z0-9]+)*$' end
    and jsonb_typeof(p_instance->'version')='string'
    and p_instance->>'version'~'^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)$'
    and jsonb_typeof(p_instance->'data')='object',
    false
  )
$function$;

create function private.valid_course_audit_study_unit_content_v1(p_content jsonb)
returns boolean language plpgsql stable security definer
set search_path=pg_catalog,private as $function$
begin
  if jsonb_typeof(p_content) is distinct from 'object'
     or octet_length(convert_to(p_content::text,'UTF8'))>49152
     or not (p_content ?& array[
       'title','role','content','response','feedback','topics'
     ])
     or p_content-'title'-'role'-'content'-'response'-'feedback'-'topics'<>'{}'::jsonb
     or jsonb_typeof(p_content->'title') is distinct from 'string'
     or nullif(btrim(p_content->>'title'),'') is null
     or p_content->>'title'<>btrim(p_content->>'title')
     or char_length(p_content->>'title')>300
     or translate(p_content->>'title',E'\n\r\t','')~'[[:cntrl:]]'
     or jsonb_typeof(p_content->'role') is distinct from 'string'
     or p_content->>'role' not in('theory','practice')
     or jsonb_typeof(p_content->'content') is distinct from 'array'
     or jsonb_typeof(p_content->'feedback') is distinct from 'array'
     or jsonb_typeof(p_content->'topics') is distinct from 'array'
     or not (p_content->'response'='null'::jsonb
       or jsonb_typeof(p_content->'response')='object') then
    return false;
  end if;
  if p_content->>'role'='theory' and(
       jsonb_array_length(p_content->'content')=0
       or p_content->'response'<>'null'::jsonb
     ) or p_content->>'role'='practice'
       and jsonb_typeof(p_content->'response') is distinct from 'object' then
    return false;
  end if;
  if exists(
    select 1 from jsonb_array_elements(p_content->'topics') topic
    where jsonb_typeof(topic)<>'string'
      or nullif(btrim(topic#>>'{}'),'') is null
      or topic#>>'{}'<>btrim(topic#>>'{}')
  ) or (
    select count(*)<>count(distinct topic#>>'{}')
    from jsonb_array_elements(p_content->'topics') topic
  ) or exists(
    select 1 from jsonb_array_elements(p_content->'content') instance
    where not private.valid_course_audit_resource_instance_v1(instance,'content')
  ) or exists(
    select 1 from jsonb_array_elements(p_content->'feedback') instance
    where not private.valid_course_audit_resource_instance_v1(instance,'feedback')
  ) or p_content->'response'<>'null'::jsonb
    and not private.valid_course_audit_resource_instance_v1(
      p_content->'response','response'
    ) then
    return false;
  end if;
  if (
    select count(*)<>count(distinct instance->>'id') from (
      select instance from jsonb_array_elements(p_content->'content') instance
      union all
      select p_content->'response' where p_content->'response'<>'null'::jsonb
      union all
      select instance from jsonb_array_elements(p_content->'feedback') instance
    ) instances
  ) then return false; end if;
  return true;
exception when others then return false;
end;
$function$;

create table private.course_instructional_audit_runs(
  course_id uuid not null references public.courses(id) on delete cascade,
  id uuid not null,
  run_kind text not null,
  origin text not null,
  method jsonb not null,
  course_revision bigint not null,
  context_hash text not null,
  target_study_unit_id text not null,
  target_version bigint not null,
  target_hash text not null,
  target_path jsonb not null,
  checks jsonb not null,
  findings_created smallint not null,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(course_id,id),
  constraint instructional_audit_runs_kind_v1 check(run_kind in('audit','verification')),
  constraint instructional_audit_runs_origin_v1 check(origin in('human_audit','automatic_audit')),
  constraint instructional_audit_runs_method_v1 check(
    jsonb_typeof(method)='object' and method ?& array['id','version']
    and method-'id'-'version'='{}'::jsonb
    and private.valid_course_audit_text_v1(method->>'id',200,800,false,false)
    and private.valid_course_audit_text_v1(method->>'version',80,320,false,false)
    and method->>'id'=btrim(method->>'id')
    and method->>'version'=btrim(method->>'version')
  ),
  constraint instructional_audit_runs_target_v1 check(
    course_revision>0 and target_version>0
    and char_length(target_study_unit_id) between 1 and 240
    and target_study_unit_id=btrim(target_study_unit_id)
    and target_study_unit_id !~ '[[:cntrl:]]'
    and context_hash~'^[a-f0-9]{64}$' and target_hash~'^[a-f0-9]{64}$'
    and private.valid_course_annotation_path_v1(target_path)
    and target_path->0->>'id'=course_id::text
    and jsonb_array_length(target_path)=5
    and target_path->0->>'kind'='course'
    and target_path->1->>'kind'='module'
    and target_path->2->>'kind'='lesson'
    and target_path->3->>'kind'='didactic_microsequence'
    and target_path->-1->>'kind'='study_unit'
    and target_path->-1->>'id'=target_study_unit_id
  ),
  constraint instructional_audit_runs_checks_v1 check(private.valid_course_audit_checks_v1(checks)),
  constraint instructional_audit_runs_findings_v1 check(
    findings_created between 0 and 16 and findings_created<=jsonb_array_length(checks)
  )
);
create index instructional_audit_runs_target_v1_idx on
  private.course_instructional_audit_runs(course_id,target_study_unit_id,created_at desc,id desc);

create table private.course_audit_findings(
  course_id uuid not null references public.courses(id) on delete cascade,
  finding_id uuid not null,
  finding_version bigint not null,
  origin_audit_run_id uuid not null,
  check_id uuid not null,
  status text not null,
  decision text not null,
  code text not null,
  severity text not null,
  correction_id uuid,
  verification_audit_run_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  base_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  dismissed_at timestamptz,
  primary key(course_id,finding_id,finding_version),
  constraint audit_findings_origin_run_fk_v1 foreign key(course_id,origin_audit_run_id)
    references private.course_instructional_audit_runs(course_id,id) on delete cascade,
  constraint audit_findings_verification_run_fk_v1 foreign key(course_id,verification_audit_run_id)
    references private.course_instructional_audit_runs(course_id,id) on delete cascade,
  constraint audit_findings_version_v1 check(finding_version>0),
  constraint audit_findings_status_v1 check(status in(
    'open','awaiting_verification','resolved','dismissed'
  )),
  constraint audit_findings_decision_v1 check(decision in(
    'recorded','dismissed','reopened','correction_applied','resolved','still_open','rolled_back'
  )),
  constraint audit_findings_code_v1 check(code~'^[a-z][a-z0-9_.:-]{2,119}$'),
  constraint audit_findings_severity_v1 check(severity in('low','medium','high','critical')),
  constraint audit_findings_timestamps_v1 check(
    base_created_at<=created_at
    and (status='resolved')=(resolved_at is not null)
    and (status='dismissed')=(dismissed_at is not null)
    and (status<>'resolved' or dismissed_at is null)
    and (status<>'dismissed' or resolved_at is null)
  )
);
create index audit_findings_current_v1_idx on
  private.course_audit_findings(course_id,finding_id,finding_version desc);
create index audit_findings_page_v1_idx on
  private.course_audit_findings(course_id,created_at desc,finding_id desc,finding_version desc);

create table private.course_audit_finding_annotations(
  course_id uuid not null,
  finding_id uuid not null,
  finding_version bigint not null default 1,
  annotation_id uuid not null,
  annotation_version bigint not null,
  created_at timestamptz not null default now(),
  primary key(course_id,finding_id,annotation_id),
  constraint audit_finding_annotations_finding_fk_v1 foreign key(
    course_id,finding_id,finding_version
  ) references private.course_audit_findings(course_id,finding_id,finding_version)
    on delete cascade,
  constraint audit_finding_annotations_annotation_fk_v1 foreign key(
    course_id,annotation_id
  ) references private.course_anchored_annotations(course_id,id) on delete cascade,
  constraint audit_finding_annotations_versions_v1 check(
    finding_version=1 and annotation_version>0
  )
);
create index audit_finding_annotations_annotation_v1_idx on
  private.course_audit_finding_annotations(course_id,annotation_id,finding_id);

create table private.course_authoring_corrections(
  course_id uuid not null references public.courses(id) on delete cascade,
  correction_id uuid not null,
  correction_version bigint not null,
  finding_id uuid not null,
  finding_version bigint not null,
  status text not null,
  target_study_unit_id text not null,
  base_target_version bigint not null,
  base_target_hash text not null,
  before_snapshot jsonb not null,
  after_snapshot jsonb not null,
  rationale text not null,
  application jsonb,
  verification jsonb,
  rollback jsonb,
  actor_id uuid references auth.users(id) on delete set null,
  base_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key(course_id,correction_id,correction_version),
  constraint authoring_corrections_finding_fk_v1 foreign key(
    course_id,finding_id,finding_version
  ) references private.course_audit_findings(course_id,finding_id,finding_version)
    on delete cascade,
  constraint authoring_corrections_version_v1 check(
    correction_version>0 and finding_version>0 and base_target_version>0
  ),
  constraint authoring_corrections_status_v1 check(status in(
    'proposed','rejected','applied','verified','rolled_back'
  )),
  constraint authoring_corrections_target_v1 check(
    char_length(target_study_unit_id) between 1 and 240
    and target_study_unit_id=btrim(target_study_unit_id)
    and target_study_unit_id !~ '[[:cntrl:]]'
    and base_target_hash~'^[a-f0-9]{64}$'
  ),
  constraint authoring_corrections_snapshots_v1 check(
    jsonb_typeof(before_snapshot)='object' and jsonb_typeof(after_snapshot)='object'
    and before_snapshot ?& array['content','sourceLinks','hash']
    and after_snapshot ?& array['content','sourceLinks','hash']
    and before_snapshot-'content'-'sourceLinks'-'hash'='{}'::jsonb
    and after_snapshot-'content'-'sourceLinks'-'hash'='{}'::jsonb
    and private.valid_course_audit_study_unit_content_v1(before_snapshot->'content')
    and private.valid_course_audit_study_unit_content_v1(after_snapshot->'content')
    and private.valid_course_source_links_shape_v1(before_snapshot->'sourceLinks',true)
    and private.valid_course_source_links_shape_v1(after_snapshot->'sourceLinks',false)
    and before_snapshot->>'hash'~'^[a-f0-9]{64}$'
    and after_snapshot->>'hash'~'^[a-f0-9]{64}$'
    and octet_length(convert_to(before_snapshot::text,'UTF8'))<=49152
    and octet_length(convert_to(after_snapshot::text,'UTF8'))<=49152
    and octet_length(convert_to(jsonb_build_object(
      'before',before_snapshot,'after',after_snapshot
    )::text,'UTF8'))<=98304
  ),
  constraint authoring_corrections_rationale_v1 check(
    private.valid_course_audit_text_v1(rationale,2000,8192,false,false)
  ),
  constraint authoring_corrections_facts_v1 check(
    application is null or jsonb_typeof(application)='object'
    and application ?& array['courseRevision','targetVersion','targetHash','appliedAt']
    and application-'courseRevision'-'targetVersion'-'targetHash'-'appliedAt'='{}'::jsonb
    and jsonb_typeof(application->'courseRevision')='number'
    and application->>'courseRevision'~'^[1-9][0-9]*$'
    and jsonb_typeof(application->'targetVersion')='number'
    and application->>'targetVersion'~'^[1-9][0-9]*$'
    and jsonb_typeof(application->'targetHash')='string'
    and application->>'targetHash'~'^[a-f0-9]{64}$'
    and jsonb_typeof(application->'appliedAt')='string'
    and private.valid_course_audit_timestamp_v1(application->>'appliedAt')
  ),
  constraint authoring_corrections_verification_v1 check(
    verification is null or jsonb_typeof(verification)='object'
    and verification ?& array['auditRunId','outcome','verifiedAt']
    and verification-'auditRunId'-'outcome'-'verifiedAt'='{}'::jsonb
    and jsonb_typeof(verification->'auditRunId')='string'
    and verification->>'auditRunId'~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and jsonb_typeof(verification->'outcome')='string'
    and verification->>'outcome' in('resolved','still_open')
    and jsonb_typeof(verification->'verifiedAt')='string'
    and private.valid_course_audit_timestamp_v1(verification->>'verifiedAt')
  ),
  constraint authoring_corrections_rollback_v1 check(
    rollback is null or jsonb_typeof(rollback)='object'
    and rollback ?& array['courseRevision','targetVersion','targetHash','rolledBackAt']
    and rollback-'courseRevision'-'targetVersion'-'targetHash'-'rolledBackAt'='{}'::jsonb
    and jsonb_typeof(rollback->'courseRevision')='number'
    and rollback->>'courseRevision'~'^[1-9][0-9]*$'
    and jsonb_typeof(rollback->'targetVersion')='number'
    and rollback->>'targetVersion'~'^[1-9][0-9]*$'
    and jsonb_typeof(rollback->'targetHash')='string'
    and rollback->>'targetHash'~'^[a-f0-9]{64}$'
    and jsonb_typeof(rollback->'rolledBackAt')='string'
    and private.valid_course_audit_timestamp_v1(rollback->>'rolledBackAt')
  )
);
create index authoring_corrections_current_v1_idx on
  private.course_authoring_corrections(course_id,correction_id,correction_version desc);
create index authoring_corrections_finding_v1_idx on
  private.course_authoring_corrections(course_id,finding_id,created_at desc,correction_id,correction_version desc);

create function private.guard_course_audit_fact_v1()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,private,auth as $function$
declare
  v_actor_field text:=tg_argv[0];
  v_actor_id uuid;
begin
  if tg_op='UPDATE' and tg_nargs=1 then
    v_actor_id:=(to_jsonb(old)->>v_actor_field)::uuid;
    if v_actor_id is not null
       and to_jsonb(new)->v_actor_field='null'::jsonb
       and (to_jsonb(new)-v_actor_field)=(to_jsonb(old)-v_actor_field)
       and not exists(select 1 from auth.users actor where actor.id=v_actor_id) then
      return new;
    end if;
  elsif tg_op='DELETE' and not exists(
    select 1 from public.courses course where course.id=old.course_id
  ) then
    return old;
  end if;
  raise exception 'Fatos do ciclo de auditoria são imutáveis.' using errcode='55000';
end;
$function$;

create function private.guard_course_audit_annotation_link_v1()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,private as $function$
begin
  if tg_op='DELETE' and(
       not exists(select 1 from public.courses course where course.id=old.course_id)
       or not exists(
         select 1 from private.course_anchored_annotations annotation
         where annotation.course_id=old.course_id and annotation.id=old.annotation_id
       )
     ) then
    return old;
  end if;
  raise exception 'Vínculos históricos de auditoria são imutáveis.' using errcode='55000';
end;
$function$;

create trigger course_instructional_audit_runs_immutable_v1
before update or delete on private.course_instructional_audit_runs
for each row execute function private.guard_course_audit_fact_v1('actor_id');
create trigger course_audit_findings_immutable_v1
before update or delete on private.course_audit_findings
for each row execute function private.guard_course_audit_fact_v1('created_by');
create trigger course_authoring_corrections_immutable_v1
before update or delete on private.course_authoring_corrections
for each row execute function private.guard_course_audit_fact_v1('actor_id');
create trigger course_audit_finding_annotations_immutable_v1
before update or delete on private.course_audit_finding_annotations
for each row execute function private.guard_course_audit_annotation_link_v1();

alter table private.course_instructional_audit_runs enable row level security;
alter table private.course_instructional_audit_runs force row level security;
alter table private.course_audit_findings enable row level security;
alter table private.course_audit_findings force row level security;
alter table private.course_audit_finding_annotations enable row level security;
alter table private.course_audit_finding_annotations force row level security;
alter table private.course_authoring_corrections enable row level security;
alter table private.course_authoring_corrections force row level security;

revoke all on table private.course_instructional_audit_runs,
  private.course_audit_findings,private.course_audit_finding_annotations,
  private.course_authoring_corrections from public,anon,authenticated,service_role;

alter table private.course_change_receipts
  drop constraint course_change_receipts_operation_v5,
  add constraint course_change_receipts_operation_v6 check(operation in(
    'create_course','commit_course_composition','commit_instructional_plan',
    'advance_authoring_part_materialization','apply_course_design_command',
    'execute_course_source_command','grant_access','revoke_access',
    'update_audit_cycle'
  ));

alter table private.course_events
  drop constraint course_events_operation_v5,
  add constraint course_events_operation_v6 check(operation in(
    'create_course','update_course_metadata','replace_course_composition',
    'update_course_instructional_plan','advance_course_authoring_part_materialization',
    'update_course_design','update_course_sources','grant_course_access','revoke_course_access',
    'apply_authoring_correction','rollback_authoring_correction'
  ));

create function private.course_audit_target_path_v1(
  p_course_id uuid,p_study_unit_id text
)
returns jsonb language sql stable security definer
set search_path=pg_catalog,public,private as $function$
  select jsonb_build_array(
    jsonb_build_object('kind','course','id',course.id,'label',course.title,'version',course.revision),
    jsonb_build_object('kind','module','id',module.entity_id,
      'label',coalesce(module.content->>'title',module.entity_id),'version',module.version),
    jsonb_build_object('kind','lesson','id',lesson.entity_id,
      'label',coalesce(lesson.content->>'title',lesson.entity_id),'version',lesson.version),
    jsonb_build_object('kind','didactic_microsequence','id',micro.entity_id,
      'label',coalesce(micro.content->>'title',micro.entity_id),'version',micro.version),
    jsonb_build_object('kind','study_unit','id',unit.entity_id,
      'label',coalesce(unit.content->>'title',unit.entity_id),'version',unit.version)
  )
  from private.course_entities unit
  join private.course_entities micro
    on micro.course_id=unit.course_id and micro.entity_type='microsequence'
   and unit.parent_type='microsequence' and micro.entity_id=unit.parent_id
  join private.course_entities lesson
    on lesson.course_id=micro.course_id and lesson.entity_type='lesson'
   and micro.parent_type='lesson' and lesson.entity_id=micro.parent_id
  join private.course_entities module
    on module.course_id=lesson.course_id and module.entity_type='module'
   and lesson.parent_type='module' and module.entity_id=lesson.parent_id
  join public.courses course on course.id=unit.course_id
  where unit.course_id=p_course_id and unit.entity_type='study_unit'
    and unit.entity_id=p_study_unit_id
$function$;

create function private.course_audit_source_evidence_v1(
  p_course_id uuid,p_links jsonb
)
returns jsonb language sql stable security definer
set search_path=pg_catalog,private as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'sourceId',source.source_id,'sourceRevision',source.revision,
    'status',source.status,'kind',source.kind,'title',source.title,
    'citationText',source.citation_text,'url',source.url,
    'editionOrVersion',source.edition_or_version,
    'studyVisibility',source.study_visibility,'relation',link.value->>'relation',
    'sourceHash',private.course_audit_json_hash_v1(jsonb_build_object(
      'status',source.status,'kind',source.kind,'title',source.title,
      'citationText',source.citation_text,'url',source.url,
      'editionOrVersion',source.edition_or_version,
      'studyVisibility',source.study_visibility
    )),
    'anchors',coalesce((
      select jsonb_agg(jsonb_build_object(
        'anchorId',anchor.anchor_id,'anchorRevision',anchor.revision,
        'status',anchor.status,'selector',anchor.selector,
        'verificationExcerpt',anchor.verification_excerpt,
        'anchorHash',private.course_audit_json_hash_v1(jsonb_build_object(
          'status',anchor.status,'sourceId',anchor.source_id,
          'sourceRevision',anchor.source_revision,'selector',anchor.selector,
          'verificationExcerpt',anchor.verification_excerpt
        )),'deepLink',null
      ) order by requested.ordinal)
      from jsonb_array_elements(link.value->'anchors')
        with ordinality requested(value,ordinal)
      join private.course_source_anchor_revisions anchor
        on anchor.course_id=p_course_id
       and anchor.anchor_id=requested.value->>'anchorId'
       and anchor.revision=(requested.value->>'anchorRevision')::bigint
       and anchor.source_id=source.source_id
       and anchor.source_revision=source.revision
    ),'[]'::jsonb),'deepLink',null
  ) order by link.ordinal),'[]'::jsonb)
  from jsonb_array_elements(p_links) with ordinality link(value,ordinal)
  join private.course_source_revisions source
    on source.course_id=p_course_id
   and source.source_id=link.value->>'sourceId'
   and source.revision=(link.value->>'sourceRevision')::bigint
$function$;

create function private.course_audit_selected_annotations_v1(
  p_course_id uuid,p_study_unit_id text,p_annotation_ids jsonb
)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,private as $function$
declare
  v_path jsonb;
  v_result jsonb;
begin
  if jsonb_typeof(p_annotation_ids) is distinct from 'array'
     or jsonb_array_length(p_annotation_ids)>12
     or exists(
       select 1 from jsonb_array_elements(p_annotation_ids) item
       where jsonb_typeof(item) is distinct from 'string'
         or item#>>'{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     ) or (
       select count(*)<>count(distinct item#>>'{}')
       from jsonb_array_elements(p_annotation_ids) item
     ) then
    raise exception 'Seleção de observações do contexto inválida.' using errcode='22023';
  end if;
  v_path:=private.course_audit_target_path_v1(p_course_id,p_study_unit_id);
  if v_path is null then
    raise exception 'Unidade de estudo inexistente.' using errcode='PT404';
  end if;
  if exists(
    select 1 from jsonb_array_elements_text(p_annotation_ids) requested(id)
    left join private.course_anchored_annotations annotation
      on annotation.course_id=p_course_id and annotation.id=requested.id::uuid
    where annotation.id is null or not exists(
      select 1 from jsonb_array_elements(v_path) path_entry
      where path_entry->>'kind'=annotation.target_kind
        and path_entry->>'id'=annotation.target_id
    )
  ) then
    raise exception 'Observação selecionada não pertence ao alvo ou a um ancestral.'
      using errcode='22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'annotationId',annotation.id,'annotationVersion',annotation.version,
    'state',annotation.state,'category',annotation.category,
    'rawText',case when annotation.state='withdrawn' then null else annotation.raw_text end,
    'briefSummary',case when annotation.state='withdrawn' then null else annotation.brief_summary end,
    'target',jsonb_build_object('kind',annotation.target_kind,'id',annotation.target_id),
    'deepLink',null
  ) order by annotation.id),'[]'::jsonb) into v_result
  from jsonb_array_elements_text(p_annotation_ids)
    with ordinality requested(id,ordinal)
  join private.course_anchored_annotations annotation
    on annotation.course_id=p_course_id and annotation.id=requested.id::uuid;
  if octet_length(convert_to(v_result::text,'UTF8'))>16384 then
    raise exception 'Observações selecionadas excedem 16 KiB.' using errcode='54000';
  end if;
  return v_result;
end;
$function$;

create function private.course_audit_context_v1(
  p_course_id uuid,p_study_unit_id text,p_annotation_ids jsonb default '[]'::jsonb
)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,private as $function$
declare
  v_course public.courses%rowtype;
  v_unit private.course_entities%rowtype;
  v_micro private.course_entities%rowtype;
  v_plan private.course_instructional_plans%rowtype;
  v_path jsonb;
  v_scope_path jsonb;
  v_source_links jsonb;
  v_sources jsonb;
  v_annotations jsonb;
  v_plan_items jsonb;
  v_parameter_document jsonb;
  v_parameters jsonb;
  v_guidance_document jsonb;
  v_guidance jsonb;
  v_policy_document jsonb;
  v_policy jsonb;
  v_knowledge_objects jsonb;
  v_plan_item_count integer;
  v_parameter_count integer;
  v_guidance_count integer;
  v_knowledge_count integer;
  v_plan_guidance text;
  v_base jsonb;
  v_result jsonb;
  v_context_hash text;
begin
  select * into v_course from public.courses course where course.id=p_course_id;
  select * into v_unit from private.course_entities entity
  where entity.course_id=p_course_id and entity.entity_type='study_unit'
    and entity.entity_id=p_study_unit_id;
  if v_course.id is null or v_unit.course_id is null then
    raise exception 'Unidade de estudo inexistente.' using errcode='PT404';
  end if;
  select * into v_micro from private.course_entities entity
  where entity.course_id=p_course_id and entity.entity_type='microsequence'
    and entity.entity_id=v_unit.parent_id and v_unit.parent_type='microsequence';
  select * into v_plan from private.course_instructional_plans plan
  where plan.course_id=p_course_id;
  v_path:=private.course_audit_target_path_v1(p_course_id,p_study_unit_id);
  if v_micro.course_id is null or v_plan.course_id is null or v_path is null then
    raise exception 'Contexto estrutural da Unidade de estudo está incompleto.'
      using errcode='55000';
  end if;
  if octet_length(convert_to(v_unit.content::text,'UTF8'))>65536
     or octet_length(convert_to(v_micro.content::text,'UTF8'))>8192 then
    raise exception 'Conteúdo focal excede o orçamento legível da auditoria.'
      using errcode='54000';
  end if;
  v_source_links:=private.course_effective_source_links_v1(
    p_course_id,'study_unit',p_study_unit_id
  );
  if jsonb_array_length(v_source_links)>32 then
    raise exception 'A Unidade possui mais de 32 Fontes no contexto focal.'
      using errcode='54000';
  end if;
  v_sources:=private.course_audit_source_evidence_v1(p_course_id,v_source_links);
  v_annotations:=private.course_audit_selected_annotations_v1(
    p_course_id,p_study_unit_id,p_annotation_ids
  );
  if octet_length(convert_to(v_sources::text,'UTF8'))>49152 then
    raise exception 'Evidências de Fonte excedem 48 KiB no contexto focal.'
      using errcode='54000';
  end if;
  select count(*) into v_plan_item_count from (
    select item.id from private.course_instructional_plan_items item
    where item.course_id=p_course_id and item.item_kind='intended_learning_outcome'
    union
    select item.id from private.course_design_target_plan_items assignment
    join private.course_instructional_plan_items item
      on item.course_id=assignment.course_id and item.id=assignment.plan_item_id
    where assignment.course_id=p_course_id
      and assignment.didactic_microsequence_id=v_micro.entity_id
  ) candidate;
  if v_plan_item_count>16 then
    raise exception 'O plano focal possui mais de 16 itens.' using errcode='54000';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'planItemId',candidate.id,'kind',candidate.item_kind,
    'position',candidate.position,'statement',candidate.statement,
    'version',candidate.version,
    'sourceLinks',private.course_effective_source_links_v1(
      p_course_id,'plan_item',candidate.id::text
    )
  ) order by candidate.item_kind,candidate.position,candidate.id),'[]'::jsonb)
  into v_plan_items
  from (
    select item.* from private.course_instructional_plan_items item
    where item.course_id=p_course_id and item.item_kind='intended_learning_outcome'
    union
    select item.* from private.course_design_target_plan_items assignment
    join private.course_instructional_plan_items item
      on item.course_id=assignment.course_id and item.id=assignment.plan_item_id
    where assignment.course_id=p_course_id
      and assignment.didactic_microsequence_id=v_micro.entity_id
    order by item_kind,position,id
  ) candidate;
  select jsonb_agg(jsonb_build_object('kind',entry->>'kind','ref',entry->>'id')
    order by ordinal) into v_scope_path
  from jsonb_array_elements(v_path) with ordinality path(entry,ordinal)
  where entry->>'kind'<>'study_unit';
  v_parameter_document:=private.course_design_parameters_for_scope_v1(
    p_course_id,v_scope_path
  );
  v_parameter_count:=jsonb_array_length(v_parameter_document);
  if v_parameter_count>8 then
    raise exception 'O desenho focal possui mais de 8 parâmetros.' using errcode='54000';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'parameterId',entry->>'parameterId','value',entry#>'{effectiveAssignment,value}',
    'origin',entry#>>'{effectiveAssignment,origin}',
    'reason',entry#>>'{effectiveAssignment,reason}',
    'sourceScope',entry#>'{effectiveAssignment,sourceScope}',
    'inherited',(entry#>>'{effectiveAssignment,inherited}')::boolean
  ) order by ordinal),'[]'::jsonb) into v_parameters
  from jsonb_array_elements(v_parameter_document) with ordinality item(entry,ordinal)
  ;
  v_guidance_document:=private.course_authoring_guidance_for_scope_v1(
    p_course_id,v_scope_path
  );
  v_guidance_count:=jsonb_array_length(v_guidance_document->'effectiveRevisions');
  if v_guidance_count>4 then
    raise exception 'O desenho focal possui mais de 4 orientações.' using errcode='54000';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'revisionId',entry->>'revisionId','guidance',entry->>'guidance',
    'origin',entry->>'origin','reason',entry->>'reason',
    'sourceScope',entry->'sourceScope'
  ) order by ordinal),'[]'::jsonb) into v_guidance
  from jsonb_array_elements(v_guidance_document->'effectiveRevisions')
    with ordinality item(entry,ordinal);
  select coalesce(string_agg(entry->>'guidance',E'\n\n' order by ordinal),'')
  into v_plan_guidance
  from jsonb_array_elements(v_guidance_document->'effectiveRevisions')
    with ordinality item(entry,ordinal);
  if octet_length(convert_to(v_plan_guidance,'UTF8'))>8192 then
    raise exception 'A orientação autoral efetiva excede 8 KiB.' using errcode='54000';
  end if;
  if octet_length(convert_to(jsonb_build_object(
    'planId',v_plan.id,'version',v_plan.version,'audience',v_plan.audience,
    'instructionalScope',v_plan.instructional_scope,
    'authoringGuidance',v_plan_guidance,'items',v_plan_items
  )::text,'UTF8'))>32768 then
    raise exception 'Plano focal e orientação excedem 32 KiB.' using errcode='54000';
  end if;
  v_policy_document:=private.course_component_policy_for_scope_v1(
    p_course_id,v_scope_path
  );
  v_policy:=v_policy_document->'effectiveChange';
  v_policy:=jsonb_set(v_policy,'{policy}',(v_policy->'policy')-'catalogVersion',true);
  v_knowledge_count:=case
    when jsonb_typeof(v_unit.content->'topics')='array'
      then jsonb_array_length(v_unit.content->'topics') else 0 end;
  if v_knowledge_count>32 then
    raise exception 'A Unidade possui mais de 32 objetos de conhecimento.'
      using errcode='54000';
  end if;
  if jsonb_typeof(v_unit.content->'topics')='array' and exists(
    select 1 from jsonb_array_elements(v_unit.content->'topics') topic
    where jsonb_typeof(topic)<>'string'
  ) then
    raise exception 'Os objetos de conhecimento da Unidade são inválidos.'
      using errcode='55000';
  end if;
  select coalesce(jsonb_agg(value order by ordinal),'[]'::jsonb)
  into v_knowledge_objects
  from jsonb_array_elements(case
    when jsonb_typeof(v_unit.content->'topics')='array' then v_unit.content->'topics'
    else '[]'::jsonb end) with ordinality topic(value,ordinal)
  where jsonb_typeof(value)='string';
  v_base:=jsonb_build_object(
    'target',jsonb_build_object(
      'studyUnitId',v_unit.entity_id,'version',v_unit.version,
      'hash',(private.course_source_target_state_v1(
        p_course_id,'study_unit',v_unit.entity_id
      )->>'hash'),'position',v_unit.position,'path',v_path,
      'content',v_unit.content,'sourceLinks',v_source_links
    ),
    'didacticMicrosequence',jsonb_build_object(
      'id',v_micro.entity_id,'version',v_micro.version,
      'hash',private.course_audit_json_hash_v1(v_micro.content),
      'content',v_micro.content
    ),
    'plan',jsonb_build_object(
      'planId',v_plan.id,'version',v_plan.version,'audience',v_plan.audience,
      'instructionalScope',v_plan.instructional_scope,
      'authoringGuidance',v_plan_guidance,'items',v_plan_items
    ),
    'design',jsonb_build_object(
      'parameters',v_parameters,'guidance',v_guidance,'componentPolicy',v_policy
    ),
    'intent',jsonb_build_object(
      'query',coalesce(v_unit.content->>'title',''),'slot','',
      'studyUnitRole',case when v_unit.content->>'role' in('theory','practice')
        then v_unit.content->>'role' else '' end,
      'disciplineIds','[]'::jsonb,'structureIds','[]'::jsonb,
      'taskOperationIds','[]'::jsonb,'practiceModeIds','[]'::jsonb,
      'knowledgeObjects',v_knowledge_objects,'mustPreserve','[]'::jsonb,
      'notationIsLearningObject',false
    ),
    'sources',v_sources,'annotations',v_annotations,
    'facts',jsonb_build_object(
      'courseRevision',v_course.revision,'targetVersion',v_unit.version,
      'targetHash',(private.course_source_target_state_v1(
        p_course_id,'study_unit',v_unit.entity_id
      )->>'hash'),
      'sourceLinksHash',private.course_audit_json_hash_v1(v_source_links),
      'planVersion',v_plan.version
    )
  );
  if octet_length(convert_to((v_base->'target')::text,'UTF8'))>98304
     or octet_length(convert_to((v_base->'design')::text,'UTF8'))>24576 then
    raise exception 'Contexto focal excede orçamento de alvo ou desenho.'
      using errcode='54000';
  end if;
  v_context_hash:=private.course_audit_json_hash_v1(v_base);
  v_result:=jsonb_build_object(
    'contract','aralearn.course-audit-context.v1',
    'contextHash',v_context_hash
  )||v_base;
  if octet_length(convert_to(v_result::text,'UTF8'))>220000 then
    raise exception 'Contexto focal excede 220000 bytes.' using errcode='54000';
  end if;
  return v_result;
end;
$function$;

create function private.course_audit_source_links_resolved_v1(
  p_course_id uuid,p_links jsonb
)
returns boolean language plpgsql stable security definer
set search_path=pg_catalog,private as $function$
declare
  v_link jsonb;
  v_anchor jsonb;
begin
  if not private.valid_course_source_links_shape_v1(p_links,false) then
    return false;
  end if;
  for v_link in select value from jsonb_array_elements(p_links)
  loop
    if not exists(
         select 1 from private.course_source_revisions source
         where source.course_id=p_course_id
           and source.source_id=v_link->>'sourceId'
           and source.revision=(v_link->>'sourceRevision')::bigint
           and source.status='active'
           and not exists(
             select 1 from private.course_source_revisions newer
             where newer.course_id=source.course_id
               and newer.source_id=source.source_id
               and newer.revision>source.revision
           )
       ) then return false; end if;
    for v_anchor in select value from jsonb_array_elements(v_link->'anchors')
    loop
      if not exists(
        select 1 from private.course_source_anchor_revisions anchor
        where anchor.course_id=p_course_id
          and anchor.anchor_id=v_anchor->>'anchorId'
          and anchor.revision=(v_anchor->>'anchorRevision')::bigint
          and anchor.source_id=v_link->>'sourceId'
          and anchor.source_revision=(v_link->>'sourceRevision')::bigint
          and anchor.status='active'
          and not exists(
            select 1 from private.course_source_anchor_revisions newer
            where newer.course_id=anchor.course_id
              and newer.anchor_id=anchor.anchor_id
              and newer.revision>anchor.revision
          )
      ) then return false; end if;
    end loop;
  end loop;
  return true;
exception when others then return false;
end;
$function$;

create function private.course_audit_source_links_current_v1(
  p_course_id uuid,p_study_unit_id text,p_links jsonb
)
returns boolean language sql volatile security definer
set search_path=pg_catalog,private as $function$
  select private.course_audit_source_links_resolved_v1(p_course_id,p_links)
    and private.course_effective_source_links_v1(
      p_course_id,'study_unit',p_study_unit_id
    ) @> p_links
$function$;

create function private.course_audit_check_refs_current_v1(
  p_course_id uuid,p_study_unit_id text,p_check jsonb
)
returns boolean language plpgsql volatile security definer
set search_path=pg_catalog,private as $function$
declare
  v_micro_id text;
  v_path jsonb;
  v_scope_path jsonb;
  v_parameters jsonb;
begin
  select entity.parent_id into v_micro_id from private.course_entities entity
  where entity.course_id=p_course_id and entity.entity_type='study_unit'
    and entity.entity_id=p_study_unit_id and entity.parent_type='microsequence';
  if v_micro_id is null then return false; end if;
  if exists(
    select 1 from jsonb_array_elements(p_check->'planItemRefs') ref
    where not exists(
      select 1 from private.course_instructional_plan_items item
      where item.course_id=p_course_id and item.id=(ref->>'planItemId')::uuid
        and item.version=(ref->>'version')::bigint
        and (item.item_kind='intended_learning_outcome' or exists(
          select 1 from private.course_design_target_plan_items assignment
          where assignment.course_id=item.course_id
            and assignment.didactic_microsequence_id=v_micro_id
            and assignment.plan_item_id=item.id
        ))
    )
  ) then return false; end if;
  v_path:=private.course_audit_target_path_v1(p_course_id,p_study_unit_id);
  select jsonb_agg(jsonb_build_object('kind',entry->>'kind','ref',entry->>'id')
    order by ordinal) into v_scope_path
  from jsonb_array_elements(v_path) with ordinality path(entry,ordinal)
  where entry->>'kind'<>'study_unit';
  v_parameters:=private.course_design_parameters_for_scope_v1(
    p_course_id,v_scope_path
  );
  if exists(
    select 1 from jsonb_array_elements(p_check->'parameterRefs') ref
    where not exists(
      select 1 from jsonb_array_elements(v_parameters) parameter
      where parameter->>'parameterId'=ref->>'parameterId'
        and parameter#>'{effectiveAssignment,changeId}' is not distinct from
          ref->'changeId'
    )
  ) then return false; end if;
  return private.course_audit_source_links_current_v1(
    p_course_id,p_study_unit_id,p_check->'sourceLinks'
  );
exception when others then return false;
end;
$function$;

create function private.course_audit_snapshot_v1(
  p_course_id uuid,p_study_unit_id text
)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,private as $function$
declare
  v_entity private.course_entities%rowtype;
  v_links jsonb;
  v_snapshot jsonb;
begin
  select * into v_entity from private.course_entities entity
  where entity.course_id=p_course_id and entity.entity_type='study_unit'
    and entity.entity_id=p_study_unit_id;
  if not found then raise exception 'Unidade de estudo inexistente.' using errcode='PT404'; end if;
  v_links:=private.course_effective_source_links_v1(
    p_course_id,'study_unit',p_study_unit_id
  );
  v_snapshot:=jsonb_build_object(
    'content',v_entity.content,'sourceLinks',v_links,
    'hash',private.course_audit_json_hash_v1(jsonb_build_object(
      'content',v_entity.content,'sourceLinks',v_links
    ))
  );
  if octet_length(convert_to(v_snapshot::text,'UTF8'))>49152 then
    raise exception 'Snapshot da Unidade excede 48 KiB.' using errcode='54000';
  end if;
  return v_snapshot;
end;
$function$;

create function private.apply_course_audit_source_snapshot_v1(
  p_course_id uuid,p_study_unit_id text,p_target_version bigint,
  p_links jsonb,p_actor_id uuid,p_restore_checkpoint boolean
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,private,extensions as $function$
declare
  v_state jsonb;
  v_previous private.course_source_attributions%rowtype;
  v_attribution private.course_source_attributions%rowtype;
begin
  if not p_restore_checkpoint then
    return private.apply_course_source_attribution_v1(
      p_course_id,'study_unit',p_study_unit_id,p_target_version,
      p_links,p_actor_id,false,null
    );
  end if;
  if not private.valid_course_source_links_shape_v1(p_links,true) then
    raise exception 'Snapshot de Fontes do rollback é inválido.' using errcode='22023';
  end if;
  v_state:=private.course_source_target_state_v1(
    p_course_id,'study_unit',p_study_unit_id
  );
  if v_state is null or (v_state->>'version')::bigint<>p_target_version then
    raise exception 'A Unidade mudou durante a restauração.' using errcode='40001';
  end if;
  if exists(
    select 1 from jsonb_array_elements(p_links) link
    left join private.course_source_revisions source
      on source.course_id=p_course_id and source.source_id=link->>'sourceId'
     and source.revision=(link->>'sourceRevision')::bigint
    where source.course_id is null or exists(
      select 1 from jsonb_array_elements(link->'anchors') requested
      left join private.course_source_anchor_revisions anchor
        on anchor.course_id=p_course_id
       and anchor.anchor_id=requested->>'anchorId'
       and anchor.revision=(requested->>'anchorRevision')::bigint
       and anchor.source_id=link->>'sourceId'
       and anchor.source_revision=(link->>'sourceRevision')::bigint
      where anchor.course_id is null
    )
  ) then
    raise exception 'Fonte ou Âncora do checkpoint deixou de existir.' using errcode='40001';
  end if;
  select * into v_previous from private.course_source_attributions attribution
  where attribution.course_id=p_course_id and attribution.target_kind='study_unit'
    and attribution.target_id=p_study_unit_id
  order by attribution.revision desc,attribution.id desc limit 1;
  insert into private.course_source_attributions(
    course_id,id,target_kind,target_id,target_version,target_hash,
    revision,attribution_hash,actor_id
  ) values(
    p_course_id,extensions.gen_random_uuid(),'study_unit',p_study_unit_id,
    p_target_version,v_state->>'hash',coalesce(v_previous.revision,0)+1,
    private.course_audit_json_hash_v1(p_links),p_actor_id
  ) returning * into v_attribution;
  insert into private.course_source_attribution_sources(
    course_id,attribution_id,source_ordinal,source_id,source_revision,relation
  ) select p_course_id,v_attribution.id,link.ordinal::integer-1,
    link.value->>'sourceId',(link.value->>'sourceRevision')::bigint,
    link.value->>'relation'
  from jsonb_array_elements(p_links) with ordinality link(value,ordinal);
  insert into private.course_source_attribution_anchors(
    course_id,attribution_id,source_ordinal,anchor_ordinal,
    source_id,source_revision,anchor_id,anchor_revision
  ) select p_course_id,v_attribution.id,link.ordinal::integer-1,
    anchor.ordinal::integer-1,link.value->>'sourceId',
    (link.value->>'sourceRevision')::bigint,anchor.value->>'anchorId',
    (anchor.value->>'anchorRevision')::bigint
  from jsonb_array_elements(p_links) with ordinality link(value,ordinal)
  cross join lateral jsonb_array_elements(link.value->'anchors')
    with ordinality anchor(value,ordinal);
  return jsonb_build_object(
    'changed',true,'attributionId',v_attribution.id,
    'revision',v_attribution.revision,
    'attributionHash',v_attribution.attribution_hash
  );
end;
$function$;

create function private.course_audit_run_projection_v1(
  p_course_id uuid,p_audit_run_id uuid
)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,private as $function$
declare
  v_run private.course_instructional_audit_runs%rowtype;
  v_projection jsonb;
begin
  select * into v_run from private.course_instructional_audit_runs run
  where run.course_id=p_course_id and run.id=p_audit_run_id;
  if not found then return null; end if;
  v_projection:=jsonb_build_object(
    'contract','aralearn.course-instructional-audit-run.v1',
    'auditRunId',v_run.id,'runKind',v_run.run_kind,'origin',v_run.origin,
    'method',v_run.method,'courseRevision',v_run.course_revision,
    'contextHash',v_run.context_hash,
    'target',jsonb_build_object(
      'studyUnitId',v_run.target_study_unit_id,'version',v_run.target_version,
      'hash',v_run.target_hash,'path',v_run.target_path
    ),'checks',v_run.checks,
    'metrics',jsonb_build_object(
      'checksTotal',jsonb_array_length(v_run.checks),
      'byResult',jsonb_build_object(
        'passed',(select count(*) from jsonb_array_elements(v_run.checks) item where item->>'result'='passed'),
        'failed',(select count(*) from jsonb_array_elements(v_run.checks) item where item->>'result'='failed'),
        'uncertain',(select count(*) from jsonb_array_elements(v_run.checks) item where item->>'result'='uncertain'),
        'not_applicable',(select count(*) from jsonb_array_elements(v_run.checks) item where item->>'result'='not_applicable'),
        'not_checked',(select count(*) from jsonb_array_elements(v_run.checks) item where item->>'result'='not_checked')
      ),'findingsCreated',v_run.findings_created
    ),'createdAt',v_run.created_at
  );
  if octet_length(convert_to(v_projection::text,'UTF8'))>235000 then
    raise exception 'Uma rodada completa excede o orçamento do detalhe.' using errcode='54000';
  end if;
  return v_projection;
end;
$function$;

create function private.course_audit_run_summary_projection_v1(
  p_course_id uuid,p_audit_run_id uuid
)
returns jsonb language sql stable security definer
set search_path=pg_catalog,private as $function$
  select jsonb_build_object(
    'auditRunId',run.id,'runKind',run.run_kind,'origin',run.origin,
    'method',run.method,'courseRevision',run.course_revision,
    'target',jsonb_build_object(
      'studyUnitId',run.target_study_unit_id,'version',run.target_version,
      'hash',run.target_hash
    ),'resultCounts',jsonb_build_object(
      'passed',(select count(*) from jsonb_array_elements(run.checks) item where item->>'result'='passed'),
      'failed',(select count(*) from jsonb_array_elements(run.checks) item where item->>'result'='failed'),
      'uncertain',(select count(*) from jsonb_array_elements(run.checks) item where item->>'result'='uncertain'),
      'not_applicable',(select count(*) from jsonb_array_elements(run.checks) item where item->>'result'='not_applicable'),
      'not_checked',(select count(*) from jsonb_array_elements(run.checks) item where item->>'result'='not_checked')
    ),'findingsCreated',run.findings_created,'createdAt',run.created_at,
    'deepLink',null
  ) from private.course_instructional_audit_runs run
  where run.course_id=p_course_id and run.id=p_audit_run_id
$function$;

create function private.course_audit_finding_projection_v1(
  p_course_id uuid,p_finding_id uuid,p_finding_version bigint default null
)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,private as $function$
declare
  v_finding private.course_audit_findings%rowtype;
  v_run private.course_instructional_audit_runs%rowtype;
  v_check jsonb;
  v_state jsonb;
  v_annotations jsonb;
  v_correction record;
begin
  select * into v_finding from private.course_audit_findings finding
  where finding.course_id=p_course_id and finding.finding_id=p_finding_id
    and (p_finding_version is null or finding.finding_version=p_finding_version)
  order by finding.finding_version desc limit 1;
  if not found then return null; end if;
  select * into v_run from private.course_instructional_audit_runs run
  where run.course_id=p_course_id and run.id=v_finding.origin_audit_run_id;
  select check_value into v_check from jsonb_array_elements(v_run.checks) check_value
  where check_value->>'checkId'=v_finding.check_id::text limit 1;
  v_state:=private.course_source_target_state_v1(
    p_course_id,'study_unit',v_run.target_study_unit_id
  );
  select coalesce(jsonb_agg(jsonb_build_object(
    'annotationId',link.annotation_id,'annotationVersion',link.annotation_version,
    'available',annotation.id is not null and annotation.state<>'withdrawn',
    'deepLink',null
  ) order by link.annotation_id),'[]'::jsonb) into v_annotations
  from private.course_audit_finding_annotations link
  left join private.course_anchored_annotations annotation
    on annotation.course_id=link.course_id and annotation.id=link.annotation_id
  where link.course_id=p_course_id and link.finding_id=p_finding_id;
  select correction.correction_id,correction.correction_version,correction.status
  into v_correction from private.course_authoring_corrections correction
  where correction.course_id=p_course_id and correction.finding_id=p_finding_id
  order by correction.created_at desc,correction.correction_id desc,
    correction.correction_version desc limit 1;
  return jsonb_build_object(
    'contract','aralearn.course-audit-finding.v1',
    'findingId',v_finding.finding_id,'findingVersion',v_finding.finding_version,
    'courseId',v_finding.course_id,'status',v_finding.status,
    'origin',v_run.origin,'code',v_finding.code,'severity',v_finding.severity,
    'target',jsonb_build_object(
      'studyUnitId',v_run.target_study_unit_id,
      'observedVersion',v_run.target_version,'observedHash',v_run.target_hash,
      'currentAvailable',v_state is not null,
      'currentVersion',case when v_state is null then null else (v_state->>'version')::bigint end,
      'currentHash',case when v_state is null then null else v_state->>'hash' end,
      'path',v_run.target_path
    ),
    'auditRun',jsonb_build_object(
      'auditRunId',v_run.id,'runKind',v_run.run_kind,
      'courseRevision',v_run.course_revision,'createdAt',v_run.created_at
    ),'check',v_check,'annotationRefs',v_annotations,
    'correctionRef',case when v_correction.correction_id is null then null
      else jsonb_build_object(
        'correctionId',v_correction.correction_id,
        'correctionVersion',v_correction.correction_version,
        'status',v_correction.status
      ) end,
    'timestamps',jsonb_build_object(
      'createdAt',v_finding.base_created_at,'updatedAt',v_finding.created_at,
      'resolvedAt',v_finding.resolved_at,'dismissedAt',v_finding.dismissed_at
    ),
    'capabilities',jsonb_build_object(
      'canDismiss',v_finding.status in('open','awaiting_verification'),
      'canReopen',v_finding.status in('resolved','dismissed'),
      'canProposeCorrection',v_finding.status='open',
      'canVerify',v_finding.status='awaiting_verification'
    ),'deepLinks',jsonb_build_object('detail',null,'target',null)
  );
end;
$function$;

create function private.course_audit_correction_projection_v1(
  p_course_id uuid,p_correction_id uuid,p_correction_version bigint default null
)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,private as $function$
declare
  v_correction private.course_authoring_corrections%rowtype;
  v_finding private.course_audit_findings%rowtype;
begin
  select * into v_correction from private.course_authoring_corrections correction
  where correction.course_id=p_course_id and correction.correction_id=p_correction_id
    and (p_correction_version is null or correction.correction_version=p_correction_version)
  order by correction.correction_version desc limit 1;
  if not found then return null; end if;
  select * into v_finding from private.course_audit_findings finding
  where finding.course_id=p_course_id and finding.finding_id=v_correction.finding_id
  order by finding.finding_version desc limit 1;
  return jsonb_build_object(
    'contract','aralearn.course-authoring-correction.v1',
    'correctionId',v_correction.correction_id,
    'correctionVersion',v_correction.correction_version,
    'courseId',v_correction.course_id,'findingId',v_correction.finding_id,
    'status',v_correction.status,
    'target',jsonb_build_object(
      'studyUnitId',v_correction.target_study_unit_id,
      'baseVersion',v_correction.base_target_version,
      'baseHash',v_correction.base_target_hash
    ),'checkpoint',jsonb_build_object(
      'before',v_correction.before_snapshot,'after',v_correction.after_snapshot
    ),'rationale',v_correction.rationale,
    'application',v_correction.application,
    'verification',v_correction.verification,'rollback',v_correction.rollback,
    'timestamps',jsonb_build_object(
      'createdAt',v_correction.base_created_at,'updatedAt',v_correction.created_at
    ),'capabilities',jsonb_build_object(
      'canAdjust',v_correction.status='proposed' and v_finding.status='open',
      'canReject',v_correction.status='proposed' and v_finding.status='open',
      'canApply',v_correction.status='proposed' and v_finding.status='open',
      'canVerify',v_correction.status='applied' and v_finding.status='awaiting_verification',
      'canRollback',v_correction.status in('applied','verified')
    ),'deepLink',null
  );
end;
$function$;

create function private.course_audit_change_from_receipt_v1(
  p_receipt jsonb,p_idempotent boolean
)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,private as $function$
declare
  v_course_id uuid;
  v_finding jsonb;
  v_correction jsonb;
  v_result jsonb;
begin
  if jsonb_typeof(p_receipt) is distinct from 'object'
     or p_receipt->>'schema'<>'course-audit-receipt-v1' then
    raise exception 'Recibo interno do ciclo de auditoria inválido.'
      using errcode='55000';
  end if;
  v_course_id:=(p_receipt->>'courseId')::uuid;
  if p_receipt->'findingRef'<>'null'::jsonb then
    v_finding:=private.course_audit_finding_projection_v1(
      v_course_id,(p_receipt#>>'{findingRef,findingId}')::uuid,
      (p_receipt#>>'{findingRef,findingVersion}')::bigint
    );
  end if;
  if p_receipt->'correctionRef'<>'null'::jsonb then
    v_correction:=private.course_audit_correction_projection_v1(
      v_course_id,(p_receipt#>>'{correctionRef,correctionId}')::uuid,
      (p_receipt#>>'{correctionRef,correctionVersion}')::bigint
    );
  end if;
  v_result:=jsonb_build_object(
    'contract','aralearn.course-audit-cycle-change.v1',
    'courseId',v_course_id,
    'courseRevision',(p_receipt->>'courseRevision')::bigint,
    'auditSetVersion',(p_receipt->>'auditSetVersion')::bigint,
    'requestId',p_receipt->>'requestId','idempotent',p_idempotent,
    'changed',true,'change',p_receipt->'change',
    'finding',v_finding,'correction',v_correction,
    'suggestedAnnotationActions',p_receipt->'suggestedAnnotationActions'
  );
  if octet_length(convert_to(v_result::text,'UTF8'))>245760 then
    raise exception 'Mudança do ciclo de auditoria excede 240 KiB.'
      using errcode='54000';
  end if;
  return v_result;
end;
$function$;

create function private.execute_course_audit_cycle_command_core_v1(
  p_actor_id uuid,p_course_id uuid,p_expected_course_revision bigint,
  p_command jsonb,p_channel text,p_request_id text
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,auth,extensions as $function$
declare
  v_actor_id uuid;
  v_hash text;
  v_receipt private.course_change_receipts%rowtype;
  v_course public.courses%rowtype;
  v_type text;
  v_finding private.course_audit_findings%rowtype;
  v_correction private.course_authoring_corrections%rowtype;
  v_origin_run private.course_instructional_audit_runs%rowtype;
  v_context jsonb;
  v_annotation_ids jsonb:='[]'::jsonb;
  v_target_state jsonb;
  v_before jsonb;
  v_after jsonb;
  v_actual jsonb;
  v_check jsonb;
  v_focal_check jsonb;
  v_now timestamptz:=clock_timestamp();
  v_next_finding_version bigint;
  v_next_correction_version bigint;
  v_next_course_revision bigint;
  v_next_audit_set_version bigint;
  v_finding_refs jsonb:='[]'::jsonb;
  v_finding_ref jsonb;
  v_primary_finding_ref jsonb;
  v_correction_ref jsonb;
  v_change jsonb;
  v_suggestions jsonb:='[]'::jsonb;
  v_receipt_result jsonb;
  v_result jsonb;
begin
  perform private.require_service_role();
  v_type:=p_command->>'type';
  if p_actor_id is null or p_course_id is null
     or p_expected_course_revision is null or p_expected_course_revision<1
     or p_channel not in('application','mcp')
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or jsonb_typeof(p_command) is distinct from 'object'
     or p_command ? '__replayOnly' and(
       jsonb_typeof(p_command->'__replayOnly') is distinct from 'boolean'
       or p_command->'__replayOnly'<>'true'::jsonb
     )
     or octet_length(convert_to(p_command::text,'UTF8'))>196608
     or v_type not in(
       'record_audit','propose_authoring_correction',
       'reject_authoring_correction','decide_finding',
       'apply_authoring_correction','verify_finding',
       'rollback_authoring_correction'
     ) then
    raise exception 'Comando do ciclo de auditoria inválido.' using errcode='22023';
  end if;

  -- Account deletion locks User -> Course. Writers use the same order before
  -- inserting any nullable actor FK, so SET NULL cannot deadlock the Course.
  select actor.id into v_actor_id from auth.users actor
  where actor.id=p_actor_id for key share;
  if v_actor_id is null then
    raise exception 'Pessoa autenticada inexistente.' using errcode='42501';
  end if;
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  v_hash:=private.course_audit_json_hash_v1(jsonb_build_object(
    'courseId',p_course_id,'expectedCourseRevision',p_expected_course_revision,
    'command',private.course_audit_public_command_binding_v1(p_command),
    'channel',p_channel
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:'||p_actor_id::text||':'||p_request_id,0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id=p_actor_id and receipt.request_id=p_request_id
    and receipt.expires_at<=statement_timestamp();
  select * into v_receipt from private.course_change_receipts receipt
  where receipt.actor_id=p_actor_id and receipt.request_id=p_request_id;
  if found then
    if v_receipt.operation<>'update_audit_cycle'
       or v_receipt.course_id<>p_course_id or v_receipt.request_hash<>v_hash then
      raise exception 'requestId reutilizado com comando incompatível.'
        using errcode='23514';
    end if;
    return private.course_audit_change_from_receipt_v1(v_receipt.result,true);
  end if;
  if p_command ? '__replayOnly' then
    raise exception 'O replay solicitado não possui recibo compatível.'
      using errcode='40001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('course-row:'||p_course_id::text,0));
  select * into v_course from public.courses course
  where course.id=p_course_id for update;
  if v_course.id is null then
    raise exception 'Curso inexistente.' using errcode='PT404';
  end if;
  if v_course.revision<>p_expected_course_revision then
    raise exception 'O Curso mudou; releia antes de alterar a auditoria.'
      using errcode='40001';
  end if;
  v_next_audit_set_version:=v_course.audit_set_version+1;

  if v_type='record_audit' then
    if p_command-'type'-'auditRunId'-'targetStudyUnitId'-'contextHash'
         -'origin'-'method'-'checks'-'findings'<>'{}'::jsonb
       or not (p_command ?& array[
         'type','auditRunId','targetStudyUnitId','contextHash','origin',
         'method','checks','findings'
       ])
       or p_command->>'auditRunId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or p_command->>'contextHash' !~ '^[a-f0-9]{64}$'
       or p_command->>'origin' not in('human_audit','automatic_audit')
       or not private.valid_course_audit_checks_v1(p_command->'checks')
       or (select count(*) from jsonb_array_elements(p_command->'checks') check_value
         where check_value->>'dimension'='structural_conformance')<>1
       or jsonb_typeof(p_command->'findings') is distinct from 'array'
       or jsonb_array_length(p_command->'findings')>16
       or nullif(btrim(p_command->>'targetStudyUnitId'),'') is null
       or p_command->>'targetStudyUnitId'<>btrim(p_command->>'targetStudyUnitId')
       or char_length(p_command->>'targetStudyUnitId')>240
       or p_command->>'targetStudyUnitId'~'[[:cntrl:]]' then
      raise exception 'Registro de rodada de auditoria inválido.' using errcode='22023';
    end if;
    if exists(
      select 1 from jsonb_array_elements(p_command->'findings') finding
      where jsonb_typeof(finding) is distinct from 'object'
        or finding-'findingId'-'checkId'-'code'-'severity'-'annotationRefs'<>'{}'::jsonb
        or not (finding ?& array['findingId','checkId','code','severity','annotationRefs'])
        or finding->>'findingId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or finding->>'checkId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or finding->>'code' !~ '^[a-z][a-z0-9_.:-]{2,119}$'
        or finding->>'severity' not in('low','medium','high','critical')
        or jsonb_typeof(finding->'annotationRefs') is distinct from 'array'
        or jsonb_array_length(finding->'annotationRefs')>12
        or not exists(
          select 1 from jsonb_array_elements(p_command->'checks') check_value
          where check_value->>'checkId'=finding->>'checkId'
            and check_value->>'result' in('failed','uncertain')
        )
        or exists(
          select 1 from jsonb_array_elements(finding->'annotationRefs') ref
          where jsonb_typeof(ref) is distinct from 'object'
            or ref-'annotationId'-'annotationVersion'<>'{}'::jsonb
            or not (ref ?& array['annotationId','annotationVersion'])
            or ref->>'annotationId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            or jsonb_typeof(ref->'annotationVersion') is distinct from 'number'
            or ref->>'annotationVersion' !~ '^[1-9][0-9]*$'
        )
        or (select count(*)<>count(distinct ref->>'annotationId')
          from jsonb_array_elements(finding->'annotationRefs') ref)
    ) or (select count(*)<>count(distinct finding->>'findingId')
      from jsonb_array_elements(p_command->'findings') finding)
      or (select count(*)<>count(distinct finding->>'checkId')
      from jsonb_array_elements(p_command->'findings') finding) then
      raise exception 'Achados da rodada são inválidos ou contradizem os checks.'
        using errcode='22023';
    end if;
    select coalesce(jsonb_agg(to_jsonb(annotation_id) order by annotation_id),'[]'::jsonb)
    into v_annotation_ids from (
      select distinct (ref->>'annotationId')::uuid annotation_id
      from jsonb_array_elements(p_command->'findings') finding
      cross join lateral jsonb_array_elements(finding->'annotationRefs') ref
    ) selected;
    v_context:=private.course_audit_context_v1(
      p_course_id,p_command->>'targetStudyUnitId',v_annotation_ids
    );
    if v_context->>'contextHash'<>p_command->>'contextHash' then
      raise exception 'O contexto da auditoria mudou; releia antes de registrar.'
        using errcode='40001';
    end if;
    if exists(
      select 1 from jsonb_array_elements(p_command->'checks') check_value
      where not private.course_audit_check_refs_current_v1(
        p_course_id,p_command->>'targetStudyUnitId',check_value
      )
    ) then
      raise exception 'Check referencia plano, parâmetro ou evidência fora do contexto focal.'
        using errcode='23514';
    end if;
    if exists(
      select 1 from jsonb_array_elements(p_command->'findings') finding
      cross join lateral jsonb_array_elements(finding->'annotationRefs') ref
      left join private.course_anchored_annotations annotation
        on annotation.course_id=p_course_id
       and annotation.id=(ref->>'annotationId')::uuid
       and annotation.version=(ref->>'annotationVersion')::bigint
       and annotation.state<>'withdrawn'
      where annotation.id is null
    ) then
      raise exception 'Achado referencia observação ausente, retirada ou stale.'
        using errcode='40001';
    end if;
    if exists(select 1 from private.course_instructional_audit_runs run
      where run.course_id=p_course_id and run.id=(p_command->>'auditRunId')::uuid)
       or exists(
         select 1 from jsonb_array_elements(p_command->'findings') finding
         join private.course_audit_findings current
           on current.course_id=p_course_id
          and current.finding_id=(finding->>'findingId')::uuid
       ) then
      raise exception 'Identidade da rodada ou de achado já utilizada.' using errcode='23505';
    end if;
    if (select count(*) from private.course_instructional_audit_runs run
          where run.course_id=p_course_id)
       + (select count(*) from (
          select distinct on (correction.correction_id) correction.status
          from private.course_authoring_corrections correction
          where correction.course_id=p_course_id
          order by correction.correction_id,correction.correction_version desc
        ) current where current.status='applied')>=256
       or (select count(distinct finding.finding_id)
         from private.course_audit_findings finding where finding.course_id=p_course_id)
          +jsonb_array_length(p_command->'findings')>1024 then
      raise exception 'Quota histórica do ciclo de auditoria atingida.' using errcode='54000';
    end if;
    insert into private.course_instructional_audit_runs(
      course_id,id,run_kind,origin,method,course_revision,context_hash,
      target_study_unit_id,target_version,target_hash,target_path,checks,
      findings_created,actor_id,created_at
    ) values(
      p_course_id,(p_command->>'auditRunId')::uuid,'audit',p_command->>'origin',
      p_command->'method',v_course.revision,p_command->>'contextHash',
      p_command->>'targetStudyUnitId',(v_context#>>'{target,version}')::bigint,
      v_context#>>'{target,hash}',v_context#>'{target,path}',p_command->'checks',
      jsonb_array_length(p_command->'findings'),p_actor_id,v_now
    );
    insert into private.course_audit_findings(
      course_id,finding_id,finding_version,origin_audit_run_id,check_id,
      status,decision,code,severity,created_by,base_created_at,created_at
    ) select p_course_id,(finding->>'findingId')::uuid,1,
      (p_command->>'auditRunId')::uuid,(finding->>'checkId')::uuid,
      'open','recorded',finding->>'code',finding->>'severity',p_actor_id,v_now,v_now
    from jsonb_array_elements(p_command->'findings') finding;
    insert into private.course_audit_finding_annotations(
      course_id,finding_id,finding_version,annotation_id,annotation_version
    ) select p_course_id,(finding->>'findingId')::uuid,1,
      (ref->>'annotationId')::uuid,(ref->>'annotationVersion')::bigint
    from jsonb_array_elements(p_command->'findings') finding
    cross join lateral jsonb_array_elements(finding->'annotationRefs') ref;
    select coalesce(jsonb_agg(jsonb_build_object(
      'findingId',(finding->>'findingId')::uuid,'findingVersion',1
    ) order by finding->>'findingId'),'[]'::jsonb) into v_finding_refs
    from jsonb_array_elements(p_command->'findings') finding;
    v_primary_finding_ref:=case when jsonb_array_length(v_finding_refs)=0 then null
      else v_finding_refs->0 end;
    v_change:=jsonb_build_object(
      'type',v_type,'auditRunId',(p_command->>'auditRunId')::uuid,
      'findingRefs',v_finding_refs,'correctionRef',null
    );

  elsif v_type='propose_authoring_correction' then
    if p_command-'type'-'correctionId'-'findingId'-'expectedFindingVersion'
         -'expectedCorrectionVersion'-'afterContent'-'afterSourceLinks'-'rationale'<>'{}'::jsonb
       or not (p_command ?& array[
         'type','correctionId','findingId','expectedFindingVersion',
         'expectedCorrectionVersion','afterContent','afterSourceLinks','rationale'
       ])
       or p_command->>'correctionId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or p_command->>'findingId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or p_command->>'expectedFindingVersion' !~ '^[1-9][0-9]*$'
       or p_command->>'expectedCorrectionVersion' !~ '^(0|[1-9][0-9]*)$'
       or not private.valid_course_audit_study_unit_content_v1(p_command->'afterContent')
       or not private.valid_course_source_links_shape_v1(p_command->'afterSourceLinks',false)
       or not private.valid_course_audit_text_v1(
         p_command->>'rationale',2000,8192,false,false
       ) then
      raise exception 'Proposta de correção autoral inválida.' using errcode='22023';
    end if;
    select * into v_finding from private.course_audit_findings finding
    where finding.course_id=p_course_id
      and finding.finding_id=(p_command->>'findingId')::uuid
    order by finding.finding_version desc limit 1;
    if v_finding.finding_id is null then
      raise exception 'Achado inexistente.' using errcode='PT404';
    end if;
    if v_finding.finding_version<>(p_command->>'expectedFindingVersion')::bigint
       or v_finding.status<>'open' then
      raise exception 'O achado mudou ou não está aberto.' using errcode='40001';
    end if;
    if v_finding.finding_version>13 then
      raise exception 'O histórico do achado não reserva transições terminais.'
        using errcode='54000';
    end if;
    select * into v_origin_run from private.course_instructional_audit_runs run
    where run.course_id=p_course_id and run.id=v_finding.origin_audit_run_id;
    v_before:=private.course_audit_snapshot_v1(
      p_course_id,v_origin_run.target_study_unit_id
    );
    v_target_state:=private.course_source_target_state_v1(
      p_course_id,'study_unit',v_origin_run.target_study_unit_id
    );
    if not private.course_audit_source_links_resolved_v1(
      p_course_id,p_command->'afterSourceLinks'
    ) then
      raise exception 'A correção exige Fontes e Âncoras atuais e ativas.'
        using errcode='23514';
    end if;
    v_after:=jsonb_build_object(
      'content',p_command->'afterContent','sourceLinks',p_command->'afterSourceLinks',
      'hash',private.course_audit_json_hash_v1(jsonb_build_object(
        'content',p_command->'afterContent','sourceLinks',p_command->'afterSourceLinks'
      ))
    );
    if v_after->'content'=v_before->'content'
       and v_after->'sourceLinks'=v_before->'sourceLinks' then
      raise exception 'correction_has_no_change' using errcode='22023';
    end if;
    if octet_length(convert_to(v_after::text,'UTF8'))>49152
       or octet_length(convert_to(jsonb_build_object(
         'before',v_before,'after',v_after
       )::text,'UTF8'))>98304 then
      raise exception 'Checkpoint da correção excede o orçamento legível.'
        using errcode='54000';
    end if;
    if (p_command->>'expectedCorrectionVersion')::bigint=0 then
      if exists(select 1 from private.course_authoring_corrections correction
        where correction.course_id=p_course_id
          and correction.correction_id=(p_command->>'correctionId')::uuid) then
        raise exception 'Identidade da correção já utilizada.' using errcode='23505';
      end if;
      if (select count(distinct correction.correction_id)
        from private.course_authoring_corrections correction
        where correction.course_id=p_course_id)>=64
         or (select count(distinct correction.correction_id)
          from private.course_authoring_corrections correction
          where correction.course_id=p_course_id
            and correction.finding_id=v_finding.finding_id)>=8 then
        raise exception 'Quota de propostas de correção atingida.' using errcode='54000';
      end if;
      v_next_correction_version:=1;
      v_now:=clock_timestamp();
    else
      select * into v_correction from private.course_authoring_corrections correction
      where correction.course_id=p_course_id
        and correction.correction_id=(p_command->>'correctionId')::uuid
      order by correction.correction_version desc limit 1;
      if v_correction.correction_id is null then
        raise exception 'Correção inexistente.' using errcode='PT404';
      end if;
      if v_correction.finding_id<>v_finding.finding_id
         or v_correction.correction_version<>(p_command->>'expectedCorrectionVersion')::bigint
         or v_correction.status<>'proposed'
         or v_correction.correction_version>=13
         or v_correction.before_snapshot<>v_before then
        raise exception 'A proposta ou seu checkpoint mudou; releia antes de ajustar.'
          using errcode='40001';
      end if;
      v_next_correction_version:=v_correction.correction_version+1;
    end if;
    insert into private.course_authoring_corrections(
      course_id,correction_id,correction_version,finding_id,finding_version,
      status,target_study_unit_id,base_target_version,base_target_hash,
      before_snapshot,after_snapshot,rationale,application,verification,rollback,
      actor_id,base_created_at,created_at
    ) values(
      p_course_id,(p_command->>'correctionId')::uuid,v_next_correction_version,
      v_finding.finding_id,v_finding.finding_version,'proposed',
      v_origin_run.target_study_unit_id,(v_target_state->>'version')::bigint,
      v_target_state->>'hash',v_before,v_after,p_command->>'rationale',
      null,null,null,p_actor_id,
      coalesce(v_correction.base_created_at,v_now),clock_timestamp()
    );
    v_primary_finding_ref:=jsonb_build_object(
      'findingId',v_finding.finding_id,'findingVersion',v_finding.finding_version
    );
    v_finding_refs:=jsonb_build_array(v_primary_finding_ref);
    v_correction_ref:=jsonb_build_object(
      'correctionId',(p_command->>'correctionId')::uuid,
      'correctionVersion',v_next_correction_version
    );
    v_change:=jsonb_build_object(
      'type',v_type,'auditRunId',null,'findingRefs',v_finding_refs,
      'correctionRef',v_correction_ref
    );

  elsif v_type='reject_authoring_correction' then
    if p_command-'type'-'findingId'-'expectedFindingVersion'
         -'correctionId'-'expectedCorrectionVersion'<>'{}'::jsonb
       or not (p_command ?& array[
         'type','findingId','expectedFindingVersion',
         'correctionId','expectedCorrectionVersion'
       ])
       or p_command->>'findingId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or p_command->>'correctionId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or p_command->>'expectedFindingVersion' !~ '^[1-9][0-9]*$'
       or p_command->>'expectedCorrectionVersion' !~ '^[1-9][0-9]*$' then
      raise exception 'Rejeição de correção inválida.' using errcode='22023';
    end if;
    select * into v_finding from private.course_audit_findings finding
    where finding.course_id=p_course_id
      and finding.finding_id=(p_command->>'findingId')::uuid
    order by finding.finding_version desc limit 1;
    select * into v_correction from private.course_authoring_corrections correction
    where correction.course_id=p_course_id
      and correction.correction_id=(p_command->>'correctionId')::uuid
    order by correction.correction_version desc limit 1;
    if v_finding.finding_id is null or v_correction.correction_id is null then
      raise exception 'Achado ou correção inexistente.' using errcode='PT404';
    end if;
    if v_finding.finding_version<>(p_command->>'expectedFindingVersion')::bigint
       or v_finding.status<>'open'
       or v_correction.finding_id<>v_finding.finding_id
       or v_correction.correction_version<>(p_command->>'expectedCorrectionVersion')::bigint
       or v_correction.status<>'proposed'
       or v_correction.correction_version>=16 then
      raise exception 'O achado ou a proposta mudou; releia antes de rejeitar.'
        using errcode='40001';
    end if;
    v_next_correction_version:=v_correction.correction_version+1;
    insert into private.course_authoring_corrections(
      course_id,correction_id,correction_version,finding_id,finding_version,
      status,target_study_unit_id,base_target_version,base_target_hash,
      before_snapshot,after_snapshot,rationale,application,verification,rollback,
      actor_id,base_created_at,created_at
    ) values(
      p_course_id,v_correction.correction_id,v_next_correction_version,
      v_finding.finding_id,v_finding.finding_version,'rejected',
      v_correction.target_study_unit_id,v_correction.base_target_version,
      v_correction.base_target_hash,v_correction.before_snapshot,
      v_correction.after_snapshot,v_correction.rationale,v_correction.application,
      v_correction.verification,v_correction.rollback,p_actor_id,
      v_correction.base_created_at,clock_timestamp()
    );
    v_primary_finding_ref:=jsonb_build_object(
      'findingId',v_finding.finding_id,'findingVersion',v_finding.finding_version
    );
    v_finding_refs:=jsonb_build_array(v_primary_finding_ref);
    v_correction_ref:=jsonb_build_object(
      'correctionId',v_correction.correction_id,
      'correctionVersion',v_next_correction_version
    );
    v_change:=jsonb_build_object(
      'type',v_type,'auditRunId',null,'findingRefs',v_finding_refs,
      'correctionRef',v_correction_ref
    );

  elsif v_type='decide_finding' then
    if p_command-'type'-'findingId'-'expectedFindingVersion'-'decision'<>'{}'::jsonb
       or not (p_command ?& array[
         'type','findingId','expectedFindingVersion','decision'
       ])
       or p_command->>'findingId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or p_command->>'expectedFindingVersion' !~ '^[1-9][0-9]*$'
       or p_command->>'decision' not in('dismiss','reopen') then
      raise exception 'Decisão sobre achado inválida.' using errcode='22023';
    end if;
    select * into v_finding from private.course_audit_findings finding
    where finding.course_id=p_course_id
      and finding.finding_id=(p_command->>'findingId')::uuid
    order by finding.finding_version desc limit 1;
    if v_finding.finding_id is null then
      raise exception 'Achado inexistente.' using errcode='PT404';
    end if;
    if v_finding.finding_version<>(p_command->>'expectedFindingVersion')::bigint
       or v_finding.finding_version>=13
       or (p_command->>'decision'='dismiss'
         and v_finding.status not in('open','awaiting_verification'))
       or (p_command->>'decision'='reopen'
         and v_finding.status not in('resolved','dismissed')) then
      raise exception 'O achado mudou ou não aceita essa decisão.' using errcode='40001';
    end if;
    v_next_finding_version:=v_finding.finding_version+1;
    insert into private.course_audit_findings(
      course_id,finding_id,finding_version,origin_audit_run_id,check_id,
      status,decision,code,severity,correction_id,verification_audit_run_id,
      created_by,base_created_at,created_at,resolved_at,dismissed_at
    ) values(
      p_course_id,v_finding.finding_id,v_next_finding_version,
      v_finding.origin_audit_run_id,v_finding.check_id,
      case when p_command->>'decision'='dismiss' then 'dismissed' else 'open' end,
      case when p_command->>'decision'='dismiss' then 'dismissed' else 'reopened' end,
      v_finding.code,v_finding.severity,v_finding.correction_id,
      v_finding.verification_audit_run_id,p_actor_id,v_finding.base_created_at,
      clock_timestamp(),null,
      case when p_command->>'decision'='dismiss' then clock_timestamp() else null end
    );
    v_primary_finding_ref:=jsonb_build_object(
      'findingId',v_finding.finding_id,'findingVersion',v_next_finding_version
    );
    v_finding_refs:=jsonb_build_array(v_primary_finding_ref);
    v_change:=jsonb_build_object(
      'type',v_type,'auditRunId',null,'findingRefs',v_finding_refs,
      'correctionRef',null
    );
    select coalesce(jsonb_agg(jsonb_build_object(
      'annotationId',link.annotation_id,'annotationVersion',annotation.version,
      'action',case when p_command->>'decision'='dismiss' then 'resolve' else 'reopen' end
    ) order by link.annotation_id),'[]'::jsonb) into v_suggestions
    from private.course_audit_finding_annotations link
    join private.course_anchored_annotations annotation
      on annotation.course_id=link.course_id and annotation.id=link.annotation_id
     and annotation.state<>'withdrawn'
    where link.course_id=p_course_id and link.finding_id=v_finding.finding_id;
  elsif v_type='apply_authoring_correction' then
    if p_command-'type'-'findingId'-'expectedFindingVersion'
         -'correctionId'-'expectedCorrectionVersion'<>'{}'::jsonb
       or not (p_command ?& array[
         'type','findingId','expectedFindingVersion',
         'correctionId','expectedCorrectionVersion'
       ])
       or p_command->>'findingId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or p_command->>'correctionId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or p_command->>'expectedFindingVersion' !~ '^[1-9][0-9]*$'
       or p_command->>'expectedCorrectionVersion' !~ '^[1-9][0-9]*$' then
      raise exception 'Aplicação de correção inválida.' using errcode='22023';
    end if;
    select * into v_finding from private.course_audit_findings finding
    where finding.course_id=p_course_id
      and finding.finding_id=(p_command->>'findingId')::uuid
    order by finding.finding_version desc limit 1;
    select * into v_correction from private.course_authoring_corrections correction
    where correction.course_id=p_course_id
      and correction.correction_id=(p_command->>'correctionId')::uuid
    order by correction.correction_version desc limit 1;
    if v_finding.finding_id is null or v_correction.correction_id is null then
      raise exception 'Achado ou correção inexistente.' using errcode='PT404';
    end if;
    if v_finding.finding_version<>(p_command->>'expectedFindingVersion')::bigint
       or v_finding.status<>'open' or v_finding.finding_version>=14
       or v_correction.finding_id<>v_finding.finding_id
       or v_correction.correction_version<>(p_command->>'expectedCorrectionVersion')::bigint
       or v_correction.status<>'proposed' or v_correction.correction_version>=14 then
      raise exception 'O achado ou a correção mudou; releia antes de aplicar.'
        using errcode='40001';
    end if;
    if (select count(*) from private.course_instructional_audit_runs run
          where run.course_id=p_course_id)
       + (select count(*) from (
          select distinct on (correction.correction_id) correction.status
          from private.course_authoring_corrections correction
          where correction.course_id=p_course_id
          order by correction.correction_id,correction.correction_version desc
        ) current where current.status='applied')>=256 then
      raise exception 'Quota de reauditorias não possui reserva para nova aplicação.'
        using errcode='54000';
    end if;
    v_before:=private.course_audit_snapshot_v1(
      p_course_id,v_correction.target_study_unit_id
    );
    v_target_state:=private.course_source_target_state_v1(
      p_course_id,'study_unit',v_correction.target_study_unit_id
    );
    if v_before<>v_correction.before_snapshot
       or (v_target_state->>'version')::bigint<>v_correction.base_target_version
       or v_target_state->>'hash'<>v_correction.base_target_hash
       or not private.course_audit_source_links_resolved_v1(
         p_course_id,v_correction.after_snapshot->'sourceLinks'
       ) then
      raise exception 'O conteúdo, a proveniência ou a evidência da correção ficou stale.'
        using errcode='40001';
    end if;
    update private.course_entities entity set
      content=v_correction.after_snapshot->'content',
      version=entity.version+1,updated_at=clock_timestamp()
    where entity.course_id=p_course_id and entity.entity_type='study_unit'
      and entity.entity_id=v_correction.target_study_unit_id
      and entity.version=v_correction.base_target_version;
    if not found then
      raise exception 'A Unidade mudou durante a aplicação.' using errcode='40001';
    end if;
    perform private.apply_course_audit_source_snapshot_v1(
      p_course_id,v_correction.target_study_unit_id,
      v_correction.base_target_version+1,
      v_correction.after_snapshot->'sourceLinks',p_actor_id,false
    );
    v_actual:=private.course_audit_snapshot_v1(
      p_course_id,v_correction.target_study_unit_id
    );
    if v_actual<>v_correction.after_snapshot then
      raise exception 'Validação pós-write da correção divergiu.' using errcode='40001';
    end if;
    v_target_state:=private.course_source_target_state_v1(
      p_course_id,'study_unit',v_correction.target_study_unit_id
    );
    v_next_course_revision:=v_course.revision+1;
    update public.courses course set revision=v_next_course_revision,
      audit_set_version=v_next_audit_set_version,updated_at=clock_timestamp()
    where course.id=p_course_id;
    v_next_correction_version:=v_correction.correction_version+1;
    insert into private.course_authoring_corrections(
      course_id,correction_id,correction_version,finding_id,finding_version,
      status,target_study_unit_id,base_target_version,base_target_hash,
      before_snapshot,after_snapshot,rationale,application,verification,rollback,
      actor_id,base_created_at,created_at
    ) values(
      p_course_id,v_correction.correction_id,v_next_correction_version,
      v_finding.finding_id,v_finding.finding_version,'applied',
      v_correction.target_study_unit_id,v_correction.base_target_version,
      v_correction.base_target_hash,v_correction.before_snapshot,
      v_correction.after_snapshot,v_correction.rationale,
      jsonb_build_object(
        'courseRevision',v_next_course_revision,
        'targetVersion',(v_target_state->>'version')::bigint,
        'targetHash',v_target_state->>'hash','appliedAt',clock_timestamp()
      ),null,null,p_actor_id,v_correction.base_created_at,clock_timestamp()
    );
    v_next_finding_version:=v_finding.finding_version+1;
    insert into private.course_audit_findings(
      course_id,finding_id,finding_version,origin_audit_run_id,check_id,
      status,decision,code,severity,correction_id,verification_audit_run_id,
      created_by,base_created_at,created_at,resolved_at,dismissed_at
    ) values(
      p_course_id,v_finding.finding_id,v_next_finding_version,
      v_finding.origin_audit_run_id,v_finding.check_id,
      'awaiting_verification','correction_applied',v_finding.code,
      v_finding.severity,v_correction.correction_id,null,p_actor_id,
      v_finding.base_created_at,clock_timestamp(),null,null
    );
    insert into private.course_events(course_id,revision,operation,summary,actor_id)
    values(
      p_course_id,v_next_course_revision,'apply_authoring_correction',
      jsonb_build_object(
        'changeKind','study_unit_correction_applied',
        'findingId',v_finding.finding_id,
        'correctionId',v_correction.correction_id,
        'correctionVersion',v_next_correction_version,
        'studyUnitId',v_correction.target_study_unit_id,
        'targetVersion',(v_target_state->>'version')::bigint,
        'channel',p_channel
      ),p_actor_id
    );
    v_primary_finding_ref:=jsonb_build_object(
      'findingId',v_finding.finding_id,'findingVersion',v_next_finding_version
    );
    v_finding_refs:=jsonb_build_array(v_primary_finding_ref);
    v_correction_ref:=jsonb_build_object(
      'correctionId',v_correction.correction_id,
      'correctionVersion',v_next_correction_version
    );
    v_change:=jsonb_build_object(
      'type',v_type,'auditRunId',null,'findingRefs',v_finding_refs,
      'correctionRef',v_correction_ref
    );

  elsif v_type='verify_finding' then
    if p_command-'type'-'auditRunId'-'findingId'-'expectedFindingVersion'
         -'correctionId'-'expectedCorrectionVersion'-'contextHash'
         -'origin'-'method'-'checks'-'outcome'<>'{}'::jsonb
       or not (p_command ?& array[
         'type','auditRunId','findingId','expectedFindingVersion',
         'correctionId','expectedCorrectionVersion','contextHash',
         'origin','method','checks','outcome'
       ])
       or p_command->>'auditRunId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or p_command->>'findingId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or p_command->>'correctionId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or p_command->>'expectedFindingVersion' !~ '^[1-9][0-9]*$'
       or p_command->>'expectedCorrectionVersion' !~ '^[1-9][0-9]*$'
       or p_command->>'contextHash' !~ '^[a-f0-9]{64}$'
       or p_command->>'origin' not in('human_audit','automatic_audit')
       or p_command->>'outcome' not in('resolved','still_open')
       or not private.valid_course_audit_checks_v1(p_command->'checks')
       or (select count(*) from jsonb_array_elements(p_command->'checks') check_value
         where check_value->>'dimension'='structural_conformance')<>1 then
      raise exception 'Verificação do achado inválida.' using errcode='22023';
    end if;
    select * into v_finding from private.course_audit_findings finding
    where finding.course_id=p_course_id
      and finding.finding_id=(p_command->>'findingId')::uuid
    order by finding.finding_version desc limit 1;
    select * into v_correction from private.course_authoring_corrections correction
    where correction.course_id=p_course_id
      and correction.correction_id=(p_command->>'correctionId')::uuid
    order by correction.correction_version desc limit 1;
    if v_finding.finding_id is null or v_correction.correction_id is null then
      raise exception 'Achado ou correção inexistente.' using errcode='PT404';
    end if;
    if v_finding.finding_version<>(p_command->>'expectedFindingVersion')::bigint
       or v_finding.status<>'awaiting_verification'
       or v_finding.finding_version>=15
       or v_correction.finding_id<>v_finding.finding_id
       or v_correction.correction_version<>(p_command->>'expectedCorrectionVersion')::bigint
       or v_correction.status<>'applied' or v_correction.correction_version>=15
       or v_correction.application is null then
      raise exception 'O achado ou a aplicação mudou; releia antes de verificar.'
        using errcode='40001';
    end if;
    if exists(select 1 from private.course_instructional_audit_runs run
      where run.course_id=p_course_id and run.id=(p_command->>'auditRunId')::uuid) then
      raise exception 'Identidade da rodada de verificação já utilizada.'
        using errcode='23505';
    end if;
    if (select count(*) from private.course_instructional_audit_runs run
      where run.course_id=p_course_id)>=256 then
      raise exception 'A reserva de reauditoria do Curso foi esgotada.'
        using errcode='54000';
    end if;
    select coalesce(jsonb_agg(to_jsonb(link.annotation_id) order by link.annotation_id),'[]'::jsonb)
    into v_annotation_ids from private.course_audit_finding_annotations link
    where link.course_id=p_course_id and link.finding_id=v_finding.finding_id;
    v_context:=private.course_audit_context_v1(
      p_course_id,v_correction.target_study_unit_id,v_annotation_ids
    );
    v_target_state:=private.course_source_target_state_v1(
      p_course_id,'study_unit',v_correction.target_study_unit_id
    );
    v_actual:=private.course_audit_snapshot_v1(
      p_course_id,v_correction.target_study_unit_id
    );
    if v_context->>'contextHash'<>p_command->>'contextHash'
       or v_actual<>v_correction.after_snapshot
       or (v_correction.application->>'courseRevision')::bigint>v_course.revision
       or (v_correction.application->>'targetVersion')::bigint
          <>(v_target_state->>'version')::bigint
       or v_correction.application->>'targetHash'<>v_target_state->>'hash'
       or (v_correction.application->>'appliedAt')::timestamptz>=v_now then
      raise exception 'A reauditoria não corresponde à aplicação corrente.'
        using errcode='40001';
    end if;
    if exists(
      select 1 from jsonb_array_elements(p_command->'checks') check_value
      where not private.course_audit_check_refs_current_v1(
        p_course_id,v_correction.target_study_unit_id,check_value
      )
    ) then
      raise exception 'Check de verificação saiu do contexto focal.' using errcode='23514';
    end if;
    select * into v_origin_run from private.course_instructional_audit_runs run
    where run.course_id=p_course_id and run.id=v_finding.origin_audit_run_id;
    select check_value into v_check from jsonb_array_elements(v_origin_run.checks) check_value
    where check_value->>'checkId'=v_finding.check_id::text limit 1;
    select check_value into v_focal_check
    from jsonb_array_elements(p_command->'checks') check_value
    where check_value->>'dimension'=v_check->>'dimension'
      and check_value#>>'{criterion,code}'=v_check#>>'{criterion,code}'
      and check_value#>>'{criterion,version}'=v_check#>>'{criterion,version}'
      and check_value#>>'{criterion,statement}'=v_check#>>'{criterion,statement}'
    limit 1;
    if v_focal_check is null or (
      select count(*) from jsonb_array_elements(p_command->'checks') check_value
      where check_value->>'dimension'=v_check->>'dimension'
        and check_value#>>'{criterion,code}'=v_check#>>'{criterion,code}'
        and check_value#>>'{criterion,version}'=v_check#>>'{criterion,version}'
        and check_value#>>'{criterion,statement}'=v_check#>>'{criterion,statement}'
    )<>1 or p_command->>'outcome'='resolved'
      and v_focal_check->>'result'<>'passed'
      or p_command->>'outcome'='still_open'
      and v_focal_check->>'result' not in('failed','uncertain') then
      raise exception 'O resultado focal da reauditoria contradiz o outcome.'
        using errcode='23514';
    end if;
    -- A validação comum já exige adequacy=sufficient e supported_by exato para
    -- factual passed; a cerca de contexto acima prova a atribuição corrente.
    insert into private.course_instructional_audit_runs(
      course_id,id,run_kind,origin,method,course_revision,context_hash,
      target_study_unit_id,target_version,target_hash,target_path,checks,
      findings_created,actor_id,created_at
    ) values(
      p_course_id,(p_command->>'auditRunId')::uuid,'verification',
      p_command->>'origin',p_command->'method',v_course.revision,
      p_command->>'contextHash',v_correction.target_study_unit_id,
      (v_target_state->>'version')::bigint,v_target_state->>'hash',
      v_context#>'{target,path}',p_command->'checks',0,p_actor_id,v_now
    );
    v_next_correction_version:=v_correction.correction_version+1;
    insert into private.course_authoring_corrections(
      course_id,correction_id,correction_version,finding_id,finding_version,
      status,target_study_unit_id,base_target_version,base_target_hash,
      before_snapshot,after_snapshot,rationale,application,verification,rollback,
      actor_id,base_created_at,created_at
    ) values(
      p_course_id,v_correction.correction_id,v_next_correction_version,
      v_finding.finding_id,v_finding.finding_version,'verified',
      v_correction.target_study_unit_id,v_correction.base_target_version,
      v_correction.base_target_hash,v_correction.before_snapshot,
      v_correction.after_snapshot,v_correction.rationale,v_correction.application,
      jsonb_build_object(
        'auditRunId',(p_command->>'auditRunId')::uuid,
        'outcome',p_command->>'outcome','verifiedAt',v_now
      ),null,p_actor_id,v_correction.base_created_at,v_now
    );
    v_next_finding_version:=v_finding.finding_version+1;
    insert into private.course_audit_findings(
      course_id,finding_id,finding_version,origin_audit_run_id,check_id,
      status,decision,code,severity,correction_id,verification_audit_run_id,
      created_by,base_created_at,created_at,resolved_at,dismissed_at
    ) values(
      p_course_id,v_finding.finding_id,v_next_finding_version,
      v_finding.origin_audit_run_id,v_finding.check_id,
      case when p_command->>'outcome'='resolved' then 'resolved' else 'open' end,
      case when p_command->>'outcome'='resolved' then 'resolved' else 'still_open' end,
      v_finding.code,v_finding.severity,v_correction.correction_id,
      (p_command->>'auditRunId')::uuid,p_actor_id,v_finding.base_created_at,v_now,
      case when p_command->>'outcome'='resolved' then v_now else null end,null
    );
    v_primary_finding_ref:=jsonb_build_object(
      'findingId',v_finding.finding_id,'findingVersion',v_next_finding_version
    );
    v_finding_refs:=jsonb_build_array(v_primary_finding_ref);
    v_correction_ref:=jsonb_build_object(
      'correctionId',v_correction.correction_id,
      'correctionVersion',v_next_correction_version
    );
    v_change:=jsonb_build_object(
      'type',v_type,'auditRunId',(p_command->>'auditRunId')::uuid,
      'findingRefs',v_finding_refs,'correctionRef',v_correction_ref
    );
    select coalesce(jsonb_agg(jsonb_build_object(
      'annotationId',link.annotation_id,'annotationVersion',annotation.version,
      'action',case when p_command->>'outcome'='resolved' then 'resolve' else 'reopen' end
    ) order by link.annotation_id),'[]'::jsonb) into v_suggestions
    from private.course_audit_finding_annotations link
    join private.course_anchored_annotations annotation
      on annotation.course_id=link.course_id and annotation.id=link.annotation_id
     and annotation.state<>'withdrawn'
    where link.course_id=p_course_id and link.finding_id=v_finding.finding_id;
  elsif v_type='rollback_authoring_correction' then
    if p_command-'type'-'findingId'-'expectedFindingVersion'
         -'correctionId'-'expectedCorrectionVersion'<>'{}'::jsonb
       or not (p_command ?& array[
         'type','findingId','expectedFindingVersion',
         'correctionId','expectedCorrectionVersion'
       ])
       or p_command->>'findingId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or p_command->>'correctionId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or p_command->>'expectedFindingVersion' !~ '^[1-9][0-9]*$'
       or p_command->>'expectedCorrectionVersion' !~ '^[1-9][0-9]*$' then
      raise exception 'Rollback da correção inválido.' using errcode='22023';
    end if;
    select * into v_finding from private.course_audit_findings finding
    where finding.course_id=p_course_id
      and finding.finding_id=(p_command->>'findingId')::uuid
    order by finding.finding_version desc limit 1;
    select * into v_correction from private.course_authoring_corrections correction
    where correction.course_id=p_course_id
      and correction.correction_id=(p_command->>'correctionId')::uuid
    order by correction.correction_version desc limit 1;
    if v_finding.finding_id is null or v_correction.correction_id is null then
      raise exception 'Achado ou correção inexistente.' using errcode='PT404';
    end if;
    if v_finding.finding_version<>(p_command->>'expectedFindingVersion')::bigint
       or v_finding.finding_version>=16
       or v_correction.finding_id<>v_finding.finding_id
       or v_correction.correction_version<>(p_command->>'expectedCorrectionVersion')::bigint
       or v_correction.status not in('applied','verified')
       or v_correction.correction_version>=16 or v_correction.application is null then
      raise exception 'O achado ou a correção mudou; releia antes do rollback.'
        using errcode='40001';
    end if;
    v_actual:=private.course_audit_snapshot_v1(
      p_course_id,v_correction.target_study_unit_id
    );
    v_target_state:=private.course_source_target_state_v1(
      p_course_id,'study_unit',v_correction.target_study_unit_id
    );
    if v_actual<>v_correction.after_snapshot
       or (v_target_state->>'version')::bigint
          <>(v_correction.application->>'targetVersion')::bigint
       or v_target_state->>'hash'<>v_correction.application->>'targetHash' then
      raise exception 'A Unidade ou sua proveniência mudou depois da aplicação.'
        using errcode='40001';
    end if;
    update private.course_entities entity set
      content=v_correction.before_snapshot->'content',
      version=entity.version+1,updated_at=clock_timestamp()
    where entity.course_id=p_course_id and entity.entity_type='study_unit'
      and entity.entity_id=v_correction.target_study_unit_id
      and entity.version=(v_target_state->>'version')::bigint;
    if not found then
      raise exception 'A Unidade mudou durante o rollback.' using errcode='40001';
    end if;
    perform private.apply_course_audit_source_snapshot_v1(
      p_course_id,v_correction.target_study_unit_id,
      (v_target_state->>'version')::bigint+1,
      v_correction.before_snapshot->'sourceLinks',p_actor_id,true
    );
    v_actual:=private.course_audit_snapshot_v1(
      p_course_id,v_correction.target_study_unit_id
    );
    if v_actual<>v_correction.before_snapshot then
      raise exception 'Validação pós-write do rollback divergiu.' using errcode='40001';
    end if;
    v_target_state:=private.course_source_target_state_v1(
      p_course_id,'study_unit',v_correction.target_study_unit_id
    );
    v_next_course_revision:=v_course.revision+1;
    update public.courses course set revision=v_next_course_revision,
      audit_set_version=v_next_audit_set_version,updated_at=clock_timestamp()
    where course.id=p_course_id;
    v_next_correction_version:=v_correction.correction_version+1;
    insert into private.course_authoring_corrections(
      course_id,correction_id,correction_version,finding_id,finding_version,
      status,target_study_unit_id,base_target_version,base_target_hash,
      before_snapshot,after_snapshot,rationale,application,verification,rollback,
      actor_id,base_created_at,created_at
    ) values(
      p_course_id,v_correction.correction_id,v_next_correction_version,
      v_finding.finding_id,v_finding.finding_version,'rolled_back',
      v_correction.target_study_unit_id,v_correction.base_target_version,
      v_correction.base_target_hash,v_correction.before_snapshot,
      v_correction.after_snapshot,v_correction.rationale,v_correction.application,
      v_correction.verification,jsonb_build_object(
        'courseRevision',v_next_course_revision,
        'targetVersion',(v_target_state->>'version')::bigint,
        'targetHash',v_target_state->>'hash','rolledBackAt',clock_timestamp()
      ),p_actor_id,v_correction.base_created_at,clock_timestamp()
    );
    v_next_finding_version:=v_finding.finding_version+1;
    insert into private.course_audit_findings(
      course_id,finding_id,finding_version,origin_audit_run_id,check_id,
      status,decision,code,severity,correction_id,verification_audit_run_id,
      created_by,base_created_at,created_at,resolved_at,dismissed_at
    ) values(
      p_course_id,v_finding.finding_id,v_next_finding_version,
      v_finding.origin_audit_run_id,v_finding.check_id,'open','rolled_back',
      v_finding.code,v_finding.severity,v_correction.correction_id,
      v_finding.verification_audit_run_id,p_actor_id,v_finding.base_created_at,
      clock_timestamp(),null,null
    );
    insert into private.course_events(course_id,revision,operation,summary,actor_id)
    values(
      p_course_id,v_next_course_revision,'rollback_authoring_correction',
      jsonb_build_object(
        'changeKind','study_unit_correction_rolled_back',
        'findingId',v_finding.finding_id,
        'correctionId',v_correction.correction_id,
        'correctionVersion',v_next_correction_version,
        'studyUnitId',v_correction.target_study_unit_id,
        'targetVersion',(v_target_state->>'version')::bigint,
        'channel',p_channel
      ),p_actor_id
    );
    v_primary_finding_ref:=jsonb_build_object(
      'findingId',v_finding.finding_id,'findingVersion',v_next_finding_version
    );
    v_finding_refs:=jsonb_build_array(v_primary_finding_ref);
    v_correction_ref:=jsonb_build_object(
      'correctionId',v_correction.correction_id,
      'correctionVersion',v_next_correction_version
    );
    v_change:=jsonb_build_object(
      'type',v_type,'auditRunId',null,'findingRefs',v_finding_refs,
      'correctionRef',v_correction_ref
    );
    select coalesce(jsonb_agg(jsonb_build_object(
      'annotationId',link.annotation_id,'annotationVersion',annotation.version,
      'action','reopen'
    ) order by link.annotation_id),'[]'::jsonb) into v_suggestions
    from private.course_audit_finding_annotations link
    join private.course_anchored_annotations annotation
      on annotation.course_id=link.course_id and annotation.id=link.annotation_id
     and annotation.state<>'withdrawn'
    where link.course_id=p_course_id and link.finding_id=v_finding.finding_id;
  end if;

  if v_type not in('apply_authoring_correction','rollback_authoring_correction') then
    update public.courses course set audit_set_version=v_next_audit_set_version
    where course.id=p_course_id;
    v_next_course_revision:=v_course.revision;
  end if;
  -- Nenhuma mutação pode criar um achado cujo detalhe focal deixe de caber no
  -- mesmo DTO owner-only. A leitura pode reduzir projeções históricas, nunca o
  -- finding/correction/checkpoint focal; uma falha aqui reverte a transação.
  for v_finding_ref in select value from jsonb_array_elements(v_finding_refs)
  loop
    perform private.get_course_audit_cycle_v1(
      p_actor_id,p_course_id,v_next_course_revision,v_next_audit_set_version,
      jsonb_build_object(
        'mode','detail','targetStudyUnitId',null,
        'findingId',v_finding_ref->>'findingId',
        'correctionId',case when v_correction_ref is null
          or v_finding_ref->>'findingId'<>v_primary_finding_ref->>'findingId' then null
          else v_correction_ref->>'correctionId' end,
        'auditRunId',null,
        'states','[]'::jsonb,'dimensions','[]'::jsonb,
        'severities','[]'::jsonb,'annotationIds','[]'::jsonb
      ),null,1
    );
  end loop;
  if v_change->'auditRunId'<>'null'::jsonb then
    perform private.get_course_audit_cycle_v1(
      p_actor_id,p_course_id,v_next_course_revision,v_next_audit_set_version,
      jsonb_build_object(
        'mode','detail','targetStudyUnitId',null,'findingId',null,
        'correctionId',null,'auditRunId',v_change->'auditRunId',
        'states','[]'::jsonb,'dimensions','[]'::jsonb,
        'severities','[]'::jsonb,'annotationIds','[]'::jsonb
      ),null,1
    );
  end if;
  v_receipt_result:=jsonb_build_object(
    'schema','course-audit-receipt-v1','courseId',p_course_id,
    'courseRevision',v_next_course_revision,
    'auditSetVersion',v_next_audit_set_version,'requestId',p_request_id,
    'change',v_change,'findingRef',v_primary_finding_ref,
    'correctionRef',v_correction_ref,
    'suggestedAnnotationActions',v_suggestions
  );
  if octet_length(convert_to(v_receipt_result::text,'UTF8'))>65536 then
    raise exception 'Recibo compacto do ciclo de auditoria excedeu 64 KiB.'
      using errcode='54000';
  end if;
  insert into private.course_change_receipts(
    actor_id,request_id,operation,course_id,request_hash,result
  ) values(
    p_actor_id,p_request_id,'update_audit_cycle',p_course_id,v_hash,v_receipt_result
  );
  v_result:=private.course_audit_change_from_receipt_v1(v_receipt_result,false);
  return v_result;
end;
$function$;

create function private.course_audit_run_focal_projection_v1(
  p_course_id uuid,p_audit_run_id uuid,
  p_focal_dimension text,p_focal_criterion_code text,
  p_focal_criterion_version text,p_focal_criterion_statement text
)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,private as $function$
declare
  v_run private.course_instructional_audit_runs%rowtype;
  v_checks jsonb;
  v_projection jsonb;
begin
  select * into v_run from private.course_instructional_audit_runs run
  where run.course_id=p_course_id and run.id=p_audit_run_id;
  if not found then return null; end if;
  with ranked as (
    select check_value,check_value->>'dimension' dimension,
      row_number() over(partition by check_value->>'dimension' order by
        case when check_value->>'dimension'=p_focal_dimension
          and check_value#>>'{criterion,code}'=p_focal_criterion_code
          and check_value#>>'{criterion,version}'=p_focal_criterion_version
          and check_value#>>'{criterion,statement}'=p_focal_criterion_statement
          then 0 else 1 end,
        octet_length(convert_to(check_value::text,'UTF8')),
        check_value->>'checkId'
      ) ordinal
    from jsonb_array_elements(v_run.checks) check_value
  )
  select jsonb_agg(check_value order by case dimension
    when 'structural_conformance' then 1 when 'pedagogical_quality' then 2
    when 'factual_quality' then 3 else 4 end) into v_checks
  from ranked where ordinal=1;
  v_projection:=jsonb_build_object(
    'contract','aralearn.course-instructional-audit-run.v1',
    'auditRunId',v_run.id,'runKind',v_run.run_kind,'origin',v_run.origin,
    'method',v_run.method,'courseRevision',v_run.course_revision,
    'contextHash',v_run.context_hash,
    'target',jsonb_build_object(
      'studyUnitId',v_run.target_study_unit_id,'version',v_run.target_version,
      'hash',v_run.target_hash,'path',v_run.target_path
    ),'checks',v_checks,
    'metrics',jsonb_build_object(
      'checksTotal',jsonb_array_length(v_checks),
      'byResult',jsonb_build_object(
        'passed',(select count(*) from jsonb_array_elements(v_checks) item where item->>'result'='passed'),
        'failed',(select count(*) from jsonb_array_elements(v_checks) item where item->>'result'='failed'),
        'uncertain',(select count(*) from jsonb_array_elements(v_checks) item where item->>'result'='uncertain'),
        'not_applicable',(select count(*) from jsonb_array_elements(v_checks) item where item->>'result'='not_applicable'),
        'not_checked',(select count(*) from jsonb_array_elements(v_checks) item where item->>'result'='not_checked')
      ),'findingsCreated',(
        select count(*) from private.course_audit_findings finding
        where finding.course_id=v_run.course_id
          and finding.origin_audit_run_id=v_run.id
          and finding.finding_version=1
          and exists(
            select 1 from jsonb_array_elements(v_checks) selected
            where selected->>'checkId'=finding.check_id::text
          )
      )
    ),'createdAt',v_run.created_at
  );
  return v_projection;
end;
$function$;

create function private.course_audit_finding_matches_v1(
  p_finding private.course_audit_findings,p_query jsonb
)
returns boolean language plpgsql stable security definer
set search_path=pg_catalog,private as $function$
declare
  v_run private.course_instructional_audit_runs%rowtype;
  v_check jsonb;
begin
  select * into v_run from private.course_instructional_audit_runs run
  where run.course_id=p_finding.course_id and run.id=p_finding.origin_audit_run_id;
  select check_value into v_check from jsonb_array_elements(v_run.checks) check_value
  where check_value->>'checkId'=p_finding.check_id::text limit 1;
  return (p_query->'targetStudyUnitId'='null'::jsonb
      or p_query->>'targetStudyUnitId'=v_run.target_study_unit_id)
    and (jsonb_array_length(p_query->'states')=0
      or p_query->'states' ? p_finding.status)
    and (jsonb_array_length(p_query->'dimensions')=0
      or p_query->'dimensions' ? (v_check->>'dimension'))
    and (jsonb_array_length(p_query->'severities')=0
      or p_query->'severities' ? p_finding.severity);
end;
$function$;

create function private.get_course_audit_cycle_v1(
  p_actor_id uuid,p_course_id uuid,p_expected_course_revision bigint,
  p_audit_set_version bigint,p_query jsonb,p_cursor text,p_limit integer
)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,private as $function$
declare
  v_course public.courses%rowtype;
  v_mode text;
  v_summary jsonb;
  v_context jsonb;
  v_items jsonb:='[]'::jsonb;
  v_run_items jsonb:='[]'::jsonb;
  v_detail jsonb;
  v_run_detail jsonb;
  v_page jsonb;
  v_has_more boolean:=false;
  v_next_cursor text;
  v_cursor_document jsonb;
  v_query_hash text;
  v_after_created_at timestamptz;
  v_after_finding_id uuid;
  v_candidate record;
  v_item jsonb;
  v_included integer:=0;
  v_finding private.course_audit_findings%rowtype;
  v_finding_projection jsonb;
  v_origin_run private.course_instructional_audit_runs%rowtype;
  v_origin_check jsonb;
  v_verification record;
  v_finding_history jsonb;
  v_runs jsonb:='[]'::jsonb;
  v_corrections jsonb;
  v_selected_correction_id uuid;
  v_selected_correction jsonb;
  v_selected_history jsonb;
begin
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  select * into v_course from public.courses course
  where course.id=p_course_id for share;
  if v_course.id is null then raise exception 'Curso inexistente.' using errcode='PT404'; end if;
  if v_course.revision<>p_expected_course_revision
     or p_audit_set_version is not null
       and v_course.audit_set_version<>p_audit_set_version then
    raise exception 'O Curso ou o conjunto de auditoria mudou; releia.'
      using errcode='40001';
  end if;
  if jsonb_typeof(p_query) is distinct from 'object' then
    raise exception 'Consulta do ciclo de auditoria inválida.' using errcode='22023';
  end if;
  if p_query-'mode'-'targetStudyUnitId'-'findingId'-'correctionId'-'auditRunId'
       -'states'-'dimensions'-'severities'-'annotationIds'<>'{}'::jsonb
     or not (p_query ?& array[
       'mode','targetStudyUnitId','findingId','correctionId','auditRunId','states',
       'dimensions','severities','annotationIds'
     ])
     or jsonb_typeof(p_query->'mode') is distinct from 'string'
     or p_query->>'mode' not in('context','findings','runs','detail')
     or jsonb_typeof(p_query->'states') is distinct from 'array'
     or jsonb_typeof(p_query->'dimensions') is distinct from 'array'
     or jsonb_typeof(p_query->'severities') is distinct from 'array'
     or jsonb_typeof(p_query->'annotationIds') is distinct from 'array'
     or not (jsonb_typeof(p_query->'targetStudyUnitId') in('null','string'))
     or not (jsonb_typeof(p_query->'findingId') in('null','string'))
     or not (jsonb_typeof(p_query->'correctionId') in('null','string'))
     or not (jsonb_typeof(p_query->'auditRunId') in('null','string'))
     or p_limit is null
     or p_limit not between 1 and 24 then
    raise exception 'Consulta do ciclo de auditoria inválida.' using errcode='22023';
  end if;
  if jsonb_array_length(p_query->'states')>4
     or jsonb_array_length(p_query->'dimensions')>4
     or jsonb_array_length(p_query->'severities')>4
     or jsonb_array_length(p_query->'annotationIds')>12
     or exists(select 1 from jsonb_array_elements(p_query->'states') item
       where jsonb_typeof(item)<>'string')
     or exists(select 1 from jsonb_array_elements(p_query->'dimensions') item
       where jsonb_typeof(item)<>'string')
     or exists(select 1 from jsonb_array_elements(p_query->'severities') item
       where jsonb_typeof(item)<>'string')
     or exists(select 1 from jsonb_array_elements(p_query->'annotationIds') item
       where jsonb_typeof(item)<>'string')
     or exists(select 1 from jsonb_array_elements_text(p_query->'states') item
       where item not in('open','awaiting_verification','resolved','dismissed'))
     or exists(select 1 from jsonb_array_elements_text(p_query->'dimensions') item
       where item not in('structural_conformance','pedagogical_quality','factual_quality','editorial_quality'))
     or exists(select 1 from jsonb_array_elements_text(p_query->'severities') item
       where item not in('low','medium','high','critical'))
     or (select count(*)<>count(distinct item) from jsonb_array_elements_text(p_query->'states') item)
     or (select count(*)<>count(distinct item) from jsonb_array_elements_text(p_query->'dimensions') item)
     or (select count(*)<>count(distinct item) from jsonb_array_elements_text(p_query->'severities') item)
     or p_cursor is not null and(
       char_length(p_cursor)>240
       or p_cursor !~ '^[A-Za-z0-9+/_-]+={0,2}$'
     ) then
    raise exception 'Consulta do ciclo de auditoria inválida.' using errcode='22023';
  end if;
  v_mode:=p_query->>'mode';
  if v_mode='context' and (
       p_query->'targetStudyUnitId'='null'::jsonb
       or p_query->'findingId'<>'null'::jsonb
       or p_query->'correctionId'<>'null'::jsonb
       or p_query->'auditRunId'<>'null'::jsonb
       or jsonb_array_length(p_query->'states')>0
       or jsonb_array_length(p_query->'dimensions')>0
       or jsonb_array_length(p_query->'severities')>0
       or p_cursor is not null
  ) or v_mode='findings' and (
       p_query->'findingId'<>'null'::jsonb
       or p_query->'correctionId'<>'null'::jsonb
       or p_query->'auditRunId'<>'null'::jsonb
       or jsonb_array_length(p_query->'annotationIds')>0
     ) or v_mode='runs' and (
       p_query->'findingId'<>'null'::jsonb
       or p_query->'correctionId'<>'null'::jsonb
       or p_query->'auditRunId'<>'null'::jsonb
       or jsonb_array_length(p_query->'states')>0
       or jsonb_array_length(p_query->'dimensions')>0
       or jsonb_array_length(p_query->'severities')>0
       or jsonb_array_length(p_query->'annotationIds')>0
     ) or v_mode='detail' and (
       p_query->'targetStudyUnitId'<>'null'::jsonb
       or (p_query->'findingId'='null'::jsonb)=(p_query->'auditRunId'='null'::jsonb)
       or p_query->'findingId'='null'::jsonb
          and p_query->'correctionId'<>'null'::jsonb
       or jsonb_array_length(p_query->'states')>0
       or jsonb_array_length(p_query->'dimensions')>0
       or jsonb_array_length(p_query->'severities')>0
       or jsonb_array_length(p_query->'annotationIds')>0
       or p_cursor is not null
     ) then
    raise exception 'Focos e filtros não pertencem ao modo solicitado.' using errcode='22023';
  end if;
  if p_query->'targetStudyUnitId'<>'null'::jsonb and(
       jsonb_typeof(p_query->'targetStudyUnitId')<>'string'
       or nullif(btrim(p_query->>'targetStudyUnitId'),'') is null
       or p_query->>'targetStudyUnitId'<>btrim(p_query->>'targetStudyUnitId')
       or char_length(p_query->>'targetStudyUnitId')>240
       or p_query->>'targetStudyUnitId'~'[[:cntrl:]]'
     ) or p_query->'findingId'<>'null'::jsonb and(
       jsonb_typeof(p_query->'findingId')<>'string'
       or p_query->>'findingId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) or p_query->'correctionId'<>'null'::jsonb and(
       jsonb_typeof(p_query->'correctionId')<>'string'
       or p_query->>'correctionId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     ) or p_query->'auditRunId'<>'null'::jsonb and(
       jsonb_typeof(p_query->'auditRunId')<>'string'
       or p_query->>'auditRunId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     ) or exists(
       select 1 from jsonb_array_elements(p_query->'annotationIds') item
       where jsonb_typeof(item)<>'string'
         or item#>>'{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     ) or (select count(*)<>count(distinct item#>>'{}')
       from jsonb_array_elements(p_query->'annotationIds') item) then
    raise exception 'Identidades da consulta de auditoria são inválidas.' using errcode='22023';
  end if;
  v_query_hash:=substr(private.course_audit_json_hash_v1(jsonb_build_object(
    'courseId',p_course_id,'courseRevision',v_course.revision,
    'auditSetVersion',v_course.audit_set_version,'query',p_query,'limit',p_limit
  )),1,32);
  if p_cursor is not null then
    if p_audit_set_version is null then
      raise exception 'Cursor exige auditSetVersion explícita.' using errcode='22023';
    end if;
    begin
      v_cursor_document:=convert_from(decode(p_cursor,'base64'),'UTF8')::jsonb;
      if jsonb_typeof(v_cursor_document)<>'object'
         or not (v_cursor_document ?& array['r','s','q','t','i','l'])
         or v_cursor_document-'r'-'s'-'q'-'t'-'i'-'l'<>'{}'::jsonb
         or (v_cursor_document->>'r')::bigint<>v_course.revision
         or (v_cursor_document->>'s')::bigint<>v_course.audit_set_version
         or v_cursor_document->>'q'<>v_query_hash
         or (v_cursor_document->>'l')::integer<>p_limit then
        raise exception 'Cursor não corresponde à consulta.' using errcode='22023';
      end if;
      v_after_created_at:=(v_cursor_document->>'t')::timestamptz;
      v_after_finding_id:=(v_cursor_document->>'i')::uuid;
    exception when others then
      raise exception 'Cursor do ciclo de auditoria inválido.' using errcode='22023';
    end;
  end if;

  with current_findings as materialized(
    select distinct on (finding.finding_id) finding.*
    from private.course_audit_findings finding
    where finding.course_id=p_course_id
    order by finding.finding_id,finding.finding_version desc
  ), matched as materialized(
    select finding.* from current_findings finding
    where private.course_audit_finding_matches_v1(finding,p_query)
  ), dimensions as materialized(
    select matched.*,check_value->>'dimension' dimension
    from matched
    join private.course_instructional_audit_runs run
      on run.course_id=matched.course_id and run.id=matched.origin_audit_run_id
    cross join lateral jsonb_array_elements(run.checks) check_value
    where check_value->>'checkId'=matched.check_id::text
  )
  select jsonb_build_object(
    'matchingTotal',(select count(*) from matched),
    'byState',jsonb_build_object(
      'open',count(*) filter(where status='open'),
      'awaiting_verification',count(*) filter(where status='awaiting_verification'),
      'resolved',count(*) filter(where status='resolved'),
      'dismissed',count(*) filter(where status='dismissed')
    ),'byDimension',jsonb_build_object(
      'structural_conformance',count(*) filter(where dimension='structural_conformance'),
      'pedagogical_quality',count(*) filter(where dimension='pedagogical_quality'),
      'factual_quality',count(*) filter(where dimension='factual_quality'),
      'editorial_quality',count(*) filter(where dimension='editorial_quality')
    ),'bySeverity',jsonb_build_object(
      'low',count(*) filter(where severity='low'),
      'medium',count(*) filter(where severity='medium'),
      'high',count(*) filter(where severity='high'),
      'critical',count(*) filter(where severity='critical')
    )
  ) into v_summary from dimensions;

  if v_mode='context' then
    v_context:=private.course_audit_context_v1(
      p_course_id,p_query->>'targetStudyUnitId',p_query->'annotationIds'
    );
  elsif v_mode='findings' then
    for v_candidate in
      with current_findings as(
        select distinct on (finding.finding_id) finding.*
        from private.course_audit_findings finding
        where finding.course_id=p_course_id
        order by finding.finding_id,finding.finding_version desc
      ) select finding.* from current_findings finding
      where private.course_audit_finding_matches_v1(finding,p_query)
        and (v_after_created_at is null or (finding.created_at,finding.finding_id)
          <(v_after_created_at,v_after_finding_id))
      order by finding.created_at desc,finding.finding_id desc
      limit p_limit+1
    loop
      if v_included>=p_limit then v_has_more:=true; exit; end if;
      v_item:=private.course_audit_finding_projection_v1(
        p_course_id,v_candidate.finding_id,v_candidate.finding_version
      );
      v_page:=jsonb_build_object(
        'contract','aralearn.course-audit-cycle-page.v1','courseId',p_course_id,
        'courseRevision',v_course.revision,'auditSetVersion',v_course.audit_set_version,
        'query',p_query,'summary',v_summary,'context',null,
        'items',v_items||jsonb_build_array(v_item),'runs','[]'::jsonb,
        'detail',null,'runDetail',null,
        'hasMore',true,'nextCursor',repeat('x',240)
      );
      if octet_length(convert_to(v_page::text,'UTF8'))>245760 then
        if v_included=0 then
          raise exception 'Um achado excede o orçamento da página.' using errcode='54000';
        end if;
        v_has_more:=true;
        exit;
      end if;
      v_items:=v_items||jsonb_build_array(v_item);
      v_included:=v_included+1;
      v_after_created_at:=v_candidate.created_at;
      v_after_finding_id:=v_candidate.finding_id;
    end loop;
    if v_has_more then
      v_next_cursor:=encode(convert_to(jsonb_build_object(
        'r',v_course.revision,'s',v_course.audit_set_version,
        'q',v_query_hash,'t',v_after_created_at,
        'i',v_after_finding_id,'l',p_limit
      )::text,'UTF8'),'base64');
      v_next_cursor:=replace(replace(v_next_cursor,E'\n',''),E'\r','');
      if char_length(v_next_cursor)>240 then
        raise exception 'Cursor do ciclo de auditoria excede 240 caracteres.'
          using errcode='54000';
      end if;
    else v_next_cursor:=null; end if;
  elsif v_mode='runs' then
    for v_candidate in
      select run.* from private.course_instructional_audit_runs run
      where run.course_id=p_course_id
        and (p_query->'targetStudyUnitId'='null'::jsonb
          or run.target_study_unit_id=p_query->>'targetStudyUnitId')
        and (v_after_created_at is null or (run.created_at,run.id)
          <(v_after_created_at,v_after_finding_id))
      order by run.created_at desc,run.id desc
      limit p_limit+1
    loop
      if v_included>=p_limit then v_has_more:=true; exit; end if;
      v_item:=private.course_audit_run_summary_projection_v1(
        p_course_id,v_candidate.id
      );
      v_page:=jsonb_build_object(
        'contract','aralearn.course-audit-cycle-page.v1','courseId',p_course_id,
        'courseRevision',v_course.revision,'auditSetVersion',v_course.audit_set_version,
        'query',p_query,'summary',v_summary,'context',null,'items','[]'::jsonb,
        'runs',v_run_items||jsonb_build_array(v_item),
        'detail',null,'runDetail',null,'hasMore',true,
        'nextCursor',repeat('x',240)
      );
      if octet_length(convert_to(v_page::text,'UTF8'))>245760 then
        if v_included=0 then
          raise exception 'Um resumo de rodada excede o orçamento da página.'
            using errcode='54000';
        end if;
        v_has_more:=true;
        exit;
      end if;
      v_run_items:=v_run_items||jsonb_build_array(v_item);
      v_included:=v_included+1;
      v_after_created_at:=v_candidate.created_at;
      v_after_finding_id:=v_candidate.id;
    end loop;
    if v_has_more then
      v_next_cursor:=encode(convert_to(jsonb_build_object(
        'r',v_course.revision,'s',v_course.audit_set_version,
        'q',v_query_hash,'t',v_after_created_at,
        'i',v_after_finding_id,'l',p_limit
      )::text,'UTF8'),'base64');
      v_next_cursor:=replace(replace(v_next_cursor,E'\n',''),E'\r','');
      if char_length(v_next_cursor)>240 then
        raise exception 'Cursor do ciclo de auditoria excede 240 caracteres.'
          using errcode='54000';
      end if;
    else v_next_cursor:=null; end if;
  else
    if p_query->'auditRunId'<>'null'::jsonb then
      v_run_detail:=private.course_audit_run_projection_v1(
        p_course_id,(p_query->>'auditRunId')::uuid
      );
      if v_run_detail is null then
        raise exception 'Rodada de auditoria inexistente.' using errcode='PT404';
      end if;
    else
    select * into v_finding from private.course_audit_findings finding
    where finding.course_id=p_course_id
      and finding.finding_id=(p_query->>'findingId')::uuid
    order by finding.finding_version desc limit 1;
    if v_finding.finding_id is null then
      raise exception 'Achado inexistente.' using errcode='PT404';
    end if;
    v_finding_projection:=private.course_audit_finding_projection_v1(
      p_course_id,v_finding.finding_id,v_finding.finding_version
    );
    select * into v_origin_run from private.course_instructional_audit_runs run
    where run.course_id=p_course_id and run.id=v_finding.origin_audit_run_id;
    select check_value into v_origin_check
    from jsonb_array_elements(v_origin_run.checks) check_value
    where check_value->>'checkId'=v_finding.check_id::text limit 1;
    select coalesce(jsonb_agg(jsonb_build_object(
      'findingVersion',history.finding_version,'status',history.status,
      'decision',history.decision,'correctionId',history.correction_id,
      'verificationAuditRunId',history.verification_audit_run_id,
      'createdAt',history.created_at
    ) order by history.finding_version),'[]'::jsonb) into v_finding_history
    from (
      select * from private.course_audit_findings history
      where history.course_id=p_course_id and history.finding_id=v_finding.finding_id
      order by history.finding_version desc limit 16
    ) history;
    v_runs:=jsonb_build_array(private.course_audit_run_focal_projection_v1(
      p_course_id,v_finding.origin_audit_run_id,
      v_origin_check->>'dimension',v_origin_check#>>'{criterion,code}',
      v_origin_check#>>'{criterion,version}',v_origin_check#>>'{criterion,statement}'
    ));
    for v_verification in
      select history.verification_audit_run_id,max(history.finding_version) latest_version
      from private.course_audit_findings history
      where history.course_id=p_course_id
        and history.finding_id=v_finding.finding_id
        and history.verification_audit_run_id is not null
        and history.verification_audit_run_id<>v_finding.origin_audit_run_id
      group by history.verification_audit_run_id
      order by max(history.finding_version) desc,history.verification_audit_run_id desc
      limit 7
    loop
      v_runs:=v_runs||jsonb_build_array(private.course_audit_run_focal_projection_v1(
        p_course_id,v_verification.verification_audit_run_id,
        v_origin_check->>'dimension',v_origin_check#>>'{criterion,code}',
        v_origin_check#>>'{criterion,version}',v_origin_check#>>'{criterion,statement}'
      ));
    end loop;
    select coalesce(jsonb_agg(jsonb_build_object(
      'correctionId',current.correction_id,
      'correctionVersion',current.correction_version,'status',current.status,
      'rationale',current.rationale,'updatedAt',current.created_at,'deepLink',null
    ) order by current.created_at desc,current.correction_id desc),'[]'::jsonb)
    into v_corrections from (
      select latest.* from (
        select distinct on (correction.correction_id) correction.*
        from private.course_authoring_corrections correction
        where correction.course_id=p_course_id
          and correction.finding_id=v_finding.finding_id
        order by correction.correction_id,correction.correction_version desc
      ) latest
      order by latest.created_at desc,latest.correction_id desc
      limit 8
    ) current;
    v_selected_correction_id:=case
      when p_query->'correctionId'<>'null'::jsonb
        then (p_query->>'correctionId')::uuid
      else (v_corrections->0->>'correctionId')::uuid end;
    if v_selected_correction_id is not null then
      v_selected_correction:=private.course_audit_correction_projection_v1(
        p_course_id,v_selected_correction_id,null
      );
      if v_selected_correction is null
         or v_selected_correction->>'findingId'<>v_finding.finding_id::text then
        raise exception 'Correção focal não pertence ao achado.' using errcode='PT404';
      end if;
      select coalesce(jsonb_agg(jsonb_build_object(
        'correctionId',history.correction_id,
        'correctionVersion',history.correction_version,'status',history.status,
        'rationale',history.rationale,'createdAt',history.created_at
      ) order by history.correction_version),'[]'::jsonb)
      into v_selected_history from (
        select * from private.course_authoring_corrections history
        where history.course_id=p_course_id
          and history.correction_id=v_selected_correction_id
        order by history.correction_version desc limit 16
      ) history;
    else
      v_selected_history:='[]'::jsonb;
    end if;
    v_detail:=jsonb_build_object(
      'finding',v_finding_projection,'findingHistory',v_finding_history,
      'auditRuns',v_runs,'corrections',v_corrections,
      'selectedCorrection',v_selected_correction,
      'selectedCorrectionHistory',v_selected_history
    );
    -- Remove apenas projeções auxiliares mais antigas; a autoridade append-only
    -- permanece integral. O item focal e seu checkpoint nunca são truncados.
    while octet_length(convert_to(jsonb_build_object(
      'contract','aralearn.course-audit-cycle-page.v1','courseId',p_course_id,
      'courseRevision',v_course.revision,'auditSetVersion',v_course.audit_set_version,
      'query',p_query,'summary',v_summary,'context',null,'items','[]'::jsonb,
      'runs','[]'::jsonb,'detail',v_detail,'runDetail',null,
      'hasMore',false,'nextCursor',null
    )::text,'UTF8'))>245760 and jsonb_array_length(v_selected_history)>1 loop
      v_selected_history=v_selected_history-0;
      v_detail=jsonb_set(v_detail,'{selectedCorrectionHistory}',v_selected_history,true);
    end loop;
    while octet_length(convert_to(jsonb_build_object(
      'contract','aralearn.course-audit-cycle-page.v1','courseId',p_course_id,
      'courseRevision',v_course.revision,'auditSetVersion',v_course.audit_set_version,
      'query',p_query,'summary',v_summary,'context',null,'items','[]'::jsonb,
      'runs','[]'::jsonb,'detail',v_detail,'runDetail',null,
      'hasMore',false,'nextCursor',null
    )::text,'UTF8'))>245760 and jsonb_array_length(v_corrections)>1 loop
      v_corrections=v_corrections-(jsonb_array_length(v_corrections)-1);
      v_detail=jsonb_set(v_detail,'{corrections}',v_corrections,true);
    end loop;
    while octet_length(convert_to(jsonb_build_object(
      'contract','aralearn.course-audit-cycle-page.v1','courseId',p_course_id,
      'courseRevision',v_course.revision,'auditSetVersion',v_course.audit_set_version,
      'query',p_query,'summary',v_summary,'context',null,'items','[]'::jsonb,
      'runs','[]'::jsonb,'detail',v_detail,'runDetail',null,
      'hasMore',false,'nextCursor',null
    )::text,'UTF8'))>245760 and jsonb_array_length(v_finding_history)>1 loop
      v_finding_history=v_finding_history-0;
      v_detail=jsonb_set(v_detail,'{findingHistory}',v_finding_history,true);
    end loop;
    end if;
  end if;
  v_page:=jsonb_build_object(
    'contract','aralearn.course-audit-cycle-page.v1','courseId',p_course_id,
    'courseRevision',v_course.revision,'auditSetVersion',v_course.audit_set_version,
    'query',p_query,'summary',v_summary,'context',v_context,
    'items',v_items,'runs',v_run_items,'detail',v_detail,
    'runDetail',v_run_detail,'hasMore',v_has_more,
    'nextCursor',v_next_cursor
  );
  if octet_length(convert_to(v_page::text,'UTF8'))>245760 then
    raise exception 'A projeção focal excede 240 KiB.' using errcode='54000';
  end if;
  return v_page;
end;
$function$;
create function public.get_owned_course_audit_cycle_for_actor_v1(
  p_actor_id uuid,p_course_id uuid,p_expected_course_revision bigint,
  p_audit_set_version bigint,p_query jsonb,p_cursor text,p_limit integer
)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,private as $function$
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  return private.get_course_audit_cycle_v1(
    p_actor_id,p_course_id,p_expected_course_revision,p_audit_set_version,
    p_query,p_cursor,p_limit
  );
exception when serialization_failure then
  raise sqlstate 'PGRST' using
    message=jsonb_build_object(
      'code','40001','message',sqlerrm,'details',null,'hint',null
    )::text,
    detail=jsonb_build_object('status',409,'headers',jsonb_build_object())::text;
end;
$function$;

create function public.execute_course_audit_cycle_command_for_actor_v1(
  p_actor_id uuid,p_course_id uuid,p_expected_course_revision bigint,
  p_command jsonb,p_channel text,p_request_id text
)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,private as $function$
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  return private.execute_course_audit_cycle_command_core_v1(
    p_actor_id,p_course_id,p_expected_course_revision,
    p_command,p_channel,p_request_id
  );
exception when serialization_failure then
  raise sqlstate 'PGRST' using
    message=jsonb_build_object(
      'code','40001','message',sqlerrm,'details',null,'hint',null
    )::text,
    detail=jsonb_build_object('status',409,'headers',jsonb_build_object())::text;
end;
$function$;

do $revoke_course_audit_helpers$
declare
  v_function regprocedure;
begin
  for v_function in
    select procedure_value.oid::regprocedure
    from pg_proc procedure_value
    join pg_namespace namespace_value
      on namespace_value.oid=procedure_value.pronamespace
    where namespace_value.nspname='private'
      and procedure_value.proname=any(array[
        'course_audit_json_hash_v1','course_audit_public_command_binding_v1',
        'valid_course_audit_text_v1','valid_course_audit_timestamp_v1',
        'valid_course_audit_source_links_v1','valid_course_audit_check_v1',
        'valid_course_audit_checks_v1','valid_course_audit_resource_instance_v1',
        'valid_course_audit_study_unit_content_v1','guard_course_audit_fact_v1',
        'guard_course_audit_annotation_link_v1','course_audit_target_path_v1',
        'course_audit_source_evidence_v1','course_audit_selected_annotations_v1',
        'course_audit_context_v1','course_audit_source_links_resolved_v1',
        'course_audit_source_links_current_v1','course_audit_check_refs_current_v1',
        'course_audit_snapshot_v1','apply_course_audit_source_snapshot_v1',
        'course_audit_run_projection_v1','course_audit_run_summary_projection_v1',
        'course_audit_finding_projection_v1',
        'course_audit_correction_projection_v1','course_audit_change_from_receipt_v1',
        'execute_course_audit_cycle_command_core_v1',
        'course_audit_run_focal_projection_v1','course_audit_finding_matches_v1',
        'get_course_audit_cycle_v1'
      ]::text[])
  loop
    execute format(
      'revoke all on function %s from public,anon,authenticated,service_role',
      v_function
    );
  end loop;
end;
$revoke_course_audit_helpers$;

revoke all on function public.get_owned_course_audit_cycle_for_actor_v1(
  uuid,uuid,bigint,bigint,jsonb,text,integer
) from public,anon,authenticated,service_role;
revoke all on function public.execute_course_audit_cycle_command_for_actor_v1(
  uuid,uuid,bigint,jsonb,text,text
) from public,anon,authenticated,service_role;
grant execute on function public.get_owned_course_audit_cycle_for_actor_v1(
  uuid,uuid,bigint,bigint,jsonb,text,integer
) to service_role;
grant execute on function public.execute_course_audit_cycle_command_for_actor_v1(
  uuid,uuid,bigint,jsonb,text,text
) to service_role;

comment on column public.courses.audit_set_version is
  'Versão independente do conjunto de auditoria; paginação/invalidação sem alterar conteúdo.';
comment on table private.course_instructional_audit_runs is
  'Rodadas imutáveis com contexto e checks públicos; não armazena raciocínio privado.';
comment on table private.course_audit_findings is
  'Versões append-only do estado corrente de cada achado de auditoria.';
comment on table private.course_audit_finding_annotations is
  'Vínculo N:N histórico por identidade/versão, sem copiar texto ou autoria da observação. available=false só representa withdrawn antes da limpeza; o hard-delete de privacidade de #124 remove por CASCADE este vínculo e o annotation_id, preservando run, finding e correction.';
comment on constraint audit_finding_annotations_annotation_fk_v1
  on private.course_audit_finding_annotations is
  'Exceção de privacidade auditável: ON DELETE CASCADE remove somente o vínculo/annotation_id quando #124 apaga definitivamente a Annotation; nenhuma cópia de texto ou identidade de pessoa existe aqui.';
comment on table private.course_authoring_corrections is
  'Versões append-only de proposta, checkpoint, aplicação, verificação e rollback de uma StudyUnit.';

do $course_audit_corrections_postflight$
declare
  v_signature text;
  v_definition text;
begin
  if to_regclass('private.course_instructional_audit_runs') is null
     or to_regclass('private.course_audit_findings') is null
     or to_regclass('private.course_audit_finding_annotations') is null
     or to_regclass('private.course_authoring_corrections') is null
     or not exists(
       select 1 from information_schema.columns
       where table_schema='public' and table_name='courses'
         and column_name='audit_set_version' and data_type='bigint'
     ) then
    raise exception 'Autoridade final do ciclo de auditoria está incompleta.'
      using errcode='55000';
  end if;
  foreach v_signature in array array[
    'public.get_owned_course_audit_cycle_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,text,integer)',
    'public.execute_course_audit_cycle_command_for_actor_v1(uuid,uuid,bigint,jsonb,text,text)',
    'private.execute_course_audit_cycle_command_core_v1(uuid,uuid,bigint,jsonb,text,text)',
    'private.get_course_audit_cycle_v1(uuid,uuid,bigint,bigint,jsonb,text,integer)',
    'private.course_audit_run_projection_v1(uuid,uuid)',
    'private.course_audit_run_summary_projection_v1(uuid,uuid)',
    'private.course_audit_run_focal_projection_v1(uuid,uuid,text,text,text,text)'
  ] loop
    if to_regprocedure(v_signature) is null then
      raise exception 'Função final do ciclo de auditoria ausente: %.',v_signature
        using errcode='55000';
    end if;
  end loop;
  if exists(
    select 1 from pg_class relation_value
    where relation_value.oid=any(array[
      'private.course_instructional_audit_runs'::regclass,
      'private.course_audit_findings'::regclass,
      'private.course_audit_finding_annotations'::regclass,
      'private.course_authoring_corrections'::regclass
    ]) and(not relation_value.relrowsecurity or not relation_value.relforcerowsecurity)
  ) or exists(
    select 1 from pg_policy policy_value where policy_value.polrelid=any(array[
      'private.course_instructional_audit_runs'::regclass,
      'private.course_audit_findings'::regclass,
      'private.course_audit_finding_annotations'::regclass,
      'private.course_authoring_corrections'::regclass
    ])
  ) then
    raise exception 'RLS privado do ciclo de auditoria não está fechado.'
      using errcode='55000';
  end if;
  if exists(
    select 1
    from unnest(array['anon','authenticated','service_role']::text[]) role_name
    cross join unnest(array['select','insert','update','delete']::text[]) privilege
    cross join unnest(array[
      'private.course_instructional_audit_runs','private.course_audit_findings',
      'private.course_audit_finding_annotations','private.course_authoring_corrections'
    ]::text[]) relation_name
    where has_table_privilege(role_name,relation_name,privilege)
  ) then
    raise exception 'Autoridade privada do ciclo de auditoria expõe privilégio direto.'
      using errcode='55000';
  end if;
  if (select count(*) from pg_trigger trigger_value
      where trigger_value.tgrelid=any(array[
        'private.course_instructional_audit_runs'::regclass,
        'private.course_audit_findings'::regclass,
        'private.course_audit_finding_annotations'::regclass,
        'private.course_authoring_corrections'::regclass
      ]) and not trigger_value.tgisinternal and trigger_value.tgenabled<>'D')<>4 then
    raise exception 'Guards de imutabilidade do ciclo de auditoria estão incompletos.'
      using errcode='55000';
  end if;
  if not exists(
       select 1
       from pg_constraint constraint_value
       where constraint_value.conrelid=
               'private.course_audit_finding_annotations'::regclass
         and constraint_value.confrelid=
               'private.course_anchored_annotations'::regclass
         and constraint_value.conname='audit_finding_annotations_annotation_fk_v1'
         and constraint_value.contype='f'
         and constraint_value.confdeltype='c'
     ) or not exists(
       select 1
       from pg_trigger trigger_value
       where trigger_value.tgrelid=
               'private.course_audit_finding_annotations'::regclass
         and trigger_value.tgname=
               'course_audit_finding_annotations_immutable_v1'
         and trigger_value.tgfoid=
               'private.guard_course_audit_annotation_link_v1()'::regprocedure
         and not trigger_value.tgisinternal
         and trigger_value.tgenabled<>'D'
     ) then
    raise exception 'CASCADE de privacidade ou guard específico dos vínculos de Annotation divergiu.'
      using errcode='55000';
  end if;
  if not has_function_privilege(
       'service_role',
       'public.get_owned_course_audit_cycle_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,text,integer)',
       'execute'
     ) or not has_function_privilege(
       'service_role',
       'public.execute_course_audit_cycle_command_for_actor_v1(uuid,uuid,bigint,jsonb,text,text)',
       'execute'
     ) or has_function_privilege(
       'authenticated',
       'public.get_owned_course_audit_cycle_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,text,integer)',
       'execute'
     ) then
    raise exception 'Privilégios das RPCs owner-only de auditoria são inválidos.'
      using errcode='55000';
  end if;
  select pg_get_functiondef(
    'private.execute_course_audit_cycle_command_core_v1(uuid,uuid,bigint,jsonb,text,text)'::regprocedure::oid
  ) into v_definition;
  if strpos(v_definition,'for key share')=0
     or strpos(v_definition,'__replayOnly')=0
     or strpos(v_definition,'correction_has_no_change')=0
     or strpos(v_definition,'course_audit_public_command_binding_v1')=0
     or strpos(v_definition,'course_instructional_audit_runs')=0
     or strpos(v_definition,'>=256')=0 then
    raise exception 'Core do ciclo de auditoria perdeu locks, replay, no-op ou quota.'
      using errcode='55000';
  end if;
  select pg_get_functiondef(
    'public.execute_course_audit_cycle_command_for_actor_v1(uuid,uuid,bigint,jsonb,text,text)'::regprocedure::oid
  ) into v_definition;
  if strpos(lower(v_definition),'when serialization_failure')=0
     or strpos(v_definition,'PGRST')=0 then
    raise exception 'Writer de auditoria não traduz CAS para HTTP 409.' using errcode='55000';
  end if;
end;
$course_audit_corrections_postflight$;

do $advance_course_audit_corrections_manifest$
declare
  v_manifest jsonb;
  v_features jsonb;
  v_body text;
begin
  v_manifest:=public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision'<>'20260817200000'
     or (v_manifest->>'contractVersion')::integer<>1 then
    raise exception 'Manifesto concorrente ao ciclo de auditoria.' using errcode='55000';
  end if;
  select jsonb_agg(feature.value order by feature.ordinal) into v_features
  from(
    select existing.value,existing.ordinal
    from jsonb_array_elements_text(v_manifest->'features')
      with ordinality existing(value,ordinal)
    union all select 'course-audit-cycle-v1',1000011::bigint
    union all select 'course-authoring-corrections-v1',1000012::bigint
    union all select 'course-audit-annotation-links-v1',1000013::bigint
  ) feature;
  v_manifest:=jsonb_build_object(
    'schemaRevision','20260817210000','contractVersion',1,'features',v_features
  );
  v_body:='select '||quote_literal(v_manifest::text)||'::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      ||'returns jsonb language sql stable security definer '
      ||'set search_path = pg_catalog as %L',v_body
  );
  revoke all on function public.get_aralearn_runtime_manifest()
    from public,anon,authenticated,service_role;
  grant execute on function public.get_aralearn_runtime_manifest()
    to anon,authenticated,service_role;
end;
$advance_course_audit_corrections_manifest$;

do $verify_course_audit_corrections_manifest$
declare
  v_manifest jsonb:=public.get_aralearn_runtime_manifest();
begin
  if v_manifest->>'schemaRevision'<>'20260817210000'
     or not (v_manifest->'features' ?& array[
       'course-audit-cycle-v1','course-authoring-corrections-v1',
       'course-audit-annotation-links-v1'
     ]) then
    raise exception 'Manifesto final perdeu o contrato #125.' using errcode='55000';
  end if;
end;
$verify_course_audit_corrections_manifest$;

commit;
