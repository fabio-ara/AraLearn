-- #126 keeps comparison intentionally small: a reusable planning checkpoint,
-- a set, and Course members. It does not reintroduce experimental protocol,
-- participant, assignment, consent, outcome, or freeze state.

create function private.course_variant_plan_snapshot_hash_v1(p_snapshot jsonb)
returns text language sql immutable
set search_path = pg_catalog, extensions
as $function$
  select encode(extensions.digest(convert_to(p_snapshot::text, 'UTF8'), 'sha256'), 'hex')
$function$;

create function private.course_variant_plan_checkpoint_snapshot_v1(
  p_course_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  select jsonb_build_object(
    'contract', 'aralearn.course-variant-plan-checkpoint.v1',
    'courseId', course.id,
    'courseRevision', course.revision,
    'planVersion', plan.version,
    'plan', private.course_instructional_plan_command_document_v1(course.id)
  )
  from public.courses course
  join private.course_instructional_plans plan on plan.course_id = course.id
  where course.id = p_course_id
$function$;

create table private.course_variant_plan_checkpoints (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_course_id uuid not null references public.courses(id) on delete cascade,
  source_course_revision bigint not null check(source_course_revision > 0),
  source_plan_version bigint not null check(source_plan_version > 0),
  plan_snapshot jsonb not null,
  snapshot_hash text not null,
  created_at timestamptz not null default now(),
  unique(owner_id, source_course_id, snapshot_hash),
  constraint course_variant_checkpoint_snapshot_v1 check(
    jsonb_typeof(plan_snapshot) = 'object'
    and octet_length(plan_snapshot::text) <= 65536
    and snapshot_hash ~ '^[a-f0-9]{64}$'
    and snapshot_hash = private.course_variant_plan_snapshot_hash_v1(plan_snapshot)
  )
);

create table private.course_variant_comparison_sets (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  checkpoint_id uuid not null references private.course_variant_plan_checkpoints(id) on delete cascade,
  source_course_id uuid not null references public.courses(id) on delete cascade,
  source_course_revision bigint not null check(source_course_revision > 0),
  version bigint not null default 1 check(version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, owner_id),
  constraint course_variant_set_checkpoint_source_v1 unique(id, checkpoint_id, source_course_id)
);

create table private.course_variant_comparison_members (
  comparison_set_id uuid not null references private.course_variant_comparison_sets(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  label text not null,
  declared_parameter_differences jsonb not null default '[]'::jsonb,
  declared_component_policy_difference jsonb,
  attached_course_revision bigint not null check(attached_course_revision > 0),
  detached_at timestamptz,
  created_at timestamptz not null default now(),
  primary key(comparison_set_id, course_id),
  unique(comparison_set_id, label),
  constraint course_variant_member_label_v1 check(
    label = btrim(label) and char_length(label) between 1 and 80
    and label !~ '[[:cntrl:]]'
  ),
  constraint course_variant_member_differences_v1 check(
    jsonb_typeof(declared_parameter_differences) = 'array'
    and jsonb_array_length(declared_parameter_differences) <= 16
    and octet_length(declared_parameter_differences::text) <= 65536
    and (declared_component_policy_difference is null or (
      jsonb_typeof(declared_component_policy_difference) = 'object'
      and octet_length(declared_component_policy_difference::text) <= 8192
    ))
  )
);

create index course_variant_sets_owner_recent_v1_idx
  on private.course_variant_comparison_sets(owner_id, updated_at desc, id desc);
create index course_variant_members_course_v1_idx
  on private.course_variant_comparison_members(course_id) where detached_at is null;

alter table private.course_variant_plan_checkpoints enable row level security;
alter table private.course_variant_plan_checkpoints force row level security;
alter table private.course_variant_comparison_sets enable row level security;
alter table private.course_variant_comparison_sets force row level security;
alter table private.course_variant_comparison_members enable row level security;
alter table private.course_variant_comparison_members force row level security;

revoke all on private.course_variant_plan_checkpoints from public, anon, authenticated;
revoke all on private.course_variant_comparison_sets from public, anon, authenticated;
revoke all on private.course_variant_comparison_members from public, anon, authenticated;
revoke all on function private.course_variant_plan_snapshot_hash_v1(jsonb)
  from public, anon, authenticated;
revoke all on function private.course_variant_plan_checkpoint_snapshot_v1(uuid)
  from public, anon, authenticated;

create function private.reject_course_variant_history_change_v1()
returns trigger language plpgsql security definer
set search_path = pg_catalog
as $function$
begin
  if tg_op = 'DELETE' and (
    not exists(
      select 1 from public.courses course where course.id = old.source_course_id
    ) or not exists(
      select 1 from auth.users account where account.id = old.owner_id
    )
  ) then
    return old;
  end if;
  raise exception 'O histórico de variantes comparáveis é imutável.' using errcode = '55000';
end;
$function$;

create trigger course_variant_checkpoint_immutable_v1
before update or delete on private.course_variant_plan_checkpoints
for each row execute function private.reject_course_variant_history_change_v1();

create function private.clone_course_variant_from_source_v1(
  p_actor_id uuid,
  p_source_course_id uuid,
  p_title text,
  p_goal text,
  p_parameter_differences jsonb,
  p_component_policy_difference jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $function$
declare
  v_source_course public.courses%rowtype;
  v_source_plan private.course_instructional_plans%rowtype;
  v_target_course_id uuid := extensions.gen_random_uuid();
  v_difference jsonb;
  v_scope_kind text;
  v_scope_ref text;
  v_parameter_id text;
  v_parameter_value jsonb;
  v_parameter_targets text[] := array[]::text[];
  v_attribution record;
begin
  if p_actor_id is null
     or p_source_course_id is null
     or p_title is null
     or nullif(btrim(p_title),'') is null
     or char_length(p_title) > 300
     or translate(p_title,E'\n\r\t','') ~ '[[:cntrl:]]'
     or p_goal is null
     or nullif(btrim(p_goal),'') is null
     or char_length(p_goal) > 2000
     or translate(p_goal,E'\n\r\t','') ~ '[[:cntrl:]]'
     or jsonb_typeof(p_parameter_differences) <> 'array'
     or jsonb_array_length(p_parameter_differences) > 16
     or (p_component_policy_difference is not null
       and not private.valid_course_component_policy_v1(
         p_component_policy_difference
       )) then
    raise exception 'Clonagem de variante inválida.' using errcode = '22023';
  end if;

  select * into strict v_source_course
  from public.courses course where course.id = p_source_course_id;
  select * into strict v_source_plan
  from private.course_instructional_plans plan
  where plan.course_id = p_source_course_id;

  insert into public.courses(id,owner_id,title,goal,revision)
  values(v_target_course_id,p_actor_id,btrim(p_title),btrim(p_goal),1);

  insert into private.course_entities(
    course_id,entity_type,entity_id,parent_type,parent_id,position,
    content,version
  )
  select v_target_course_id,entity.entity_type,entity.entity_id,
    entity.parent_type,entity.parent_id,entity.position,entity.content,1
  from private.course_entities entity
  where entity.course_id = p_source_course_id;

  insert into private.course_instructional_plans(
    course_id,audience,instructional_scope,preferred_authoring_part_min,
    preferred_authoring_part_max,part_count_origin,version
  ) values(
    v_target_course_id,v_source_plan.audience,v_source_plan.instructional_scope,
    v_source_plan.preferred_authoring_part_min,
    v_source_plan.preferred_authoring_part_max,
    v_source_plan.part_count_origin,1
  );

  insert into private.course_instructional_plan_items(
    id,course_id,instructional_plan_id,item_kind,position,statement,version
  )
  select extensions.gen_random_uuid(),v_target_course_id,target_plan.id,
    item.item_kind,item.position,item.statement,1
  from private.course_instructional_plan_items item
  join private.course_instructional_plans target_plan
    on target_plan.course_id = v_target_course_id
  where item.course_id = p_source_course_id;

  insert into private.course_authoring_parts(
    id,course_id,instructional_plan_id,position,title,intent,version,retired_at
  )
  select extensions.gen_random_uuid(),v_target_course_id,target_plan.id,
    part.position,part.title,part.intent,1,part.retired_at
  from private.course_authoring_parts part
  join private.course_instructional_plans target_plan
    on target_plan.course_id = v_target_course_id
  where part.course_id = p_source_course_id;

  insert into private.course_authoring_part_didactic_microsequences(
    course_id,authoring_part_id,didactic_microsequence_id,production_position
  )
  select v_target_course_id,target_part.id,
    membership.didactic_microsequence_id,membership.production_position
  from private.course_authoring_part_didactic_microsequences membership
  join private.course_authoring_parts source_part
    on source_part.course_id = membership.course_id
   and source_part.id = membership.authoring_part_id
  join private.course_authoring_parts target_part
    on target_part.course_id = v_target_course_id
   and target_part.position is not distinct from source_part.position
   and target_part.title = source_part.title
  where membership.course_id = p_source_course_id;

  insert into private.course_design_target_plan_items(
    course_id,didactic_microsequence_id,plan_item_id,plan_item_kind
  )
  select v_target_course_id,assignment.didactic_microsequence_id,
    target_item.id,assignment.plan_item_kind
  from private.course_design_target_plan_items assignment
  join private.course_instructional_plan_items source_item
    on source_item.course_id = assignment.course_id
   and source_item.id = assignment.plan_item_id
   and source_item.item_kind = assignment.plan_item_kind
  join private.course_instructional_plan_items target_item
    on target_item.course_id = v_target_course_id
   and target_item.item_kind = source_item.item_kind
   and target_item.position = source_item.position
  where assignment.course_id = p_source_course_id;

  insert into private.course_design_parameter_changes(
    course_id,course_revision,parameter_id,scope_kind,scope_ref,
    action,value,origin,reason,actor_id,channel
  )
  select v_target_course_id,1,current_value.parameter_id,current_value.scope_kind,
    case when current_value.scope_kind = 'course'
      then v_target_course_id::text else current_value.scope_ref end,
    'set',current_value.value,current_value.origin,current_value.reason,
    p_actor_id,'application'
  from (
    select distinct on (change.parameter_id,change.scope_kind,change.scope_ref)
      change.*
    from private.course_design_parameter_changes change
    where change.course_id = p_source_course_id
    order by change.parameter_id,change.scope_kind,change.scope_ref,
      change.course_revision desc,change.id desc
  ) current_value
  where current_value.action = 'set';

  insert into private.course_authoring_guidance_revisions(
    revision_id,course_id,course_revision,scope_kind,scope_ref,
    action,guidance,origin,reason,actor_id,channel
  )
  select extensions.gen_random_uuid(),v_target_course_id,1,
    current_value.scope_kind,
    case when current_value.scope_kind = 'course'
      then v_target_course_id::text else current_value.scope_ref end,
    'set',current_value.guidance,current_value.origin,current_value.reason,
    p_actor_id,'application'
  from (
    select distinct on (revision.scope_kind,revision.scope_ref) revision.*
    from private.course_authoring_guidance_revisions revision
    where revision.course_id = p_source_course_id
    order by revision.scope_kind,revision.scope_ref,
      revision.course_revision desc,revision.id desc
  ) current_value
  where current_value.action = 'set';

  insert into private.course_component_policy_changes(
    course_id,course_revision,scope_kind,scope_ref,
    action,policy,origin,reason,actor_id,channel
  )
  select v_target_course_id,1,current_value.scope_kind,
    case when current_value.scope_kind = 'course'
      then v_target_course_id::text else current_value.scope_ref end,
    'set',current_value.policy,current_value.origin,current_value.reason,
    p_actor_id,'application'
  from (
    select distinct on (change.scope_kind,change.scope_ref) change.*
    from private.course_component_policy_changes change
    where change.course_id = p_source_course_id
    order by change.scope_kind,change.scope_ref,
      change.course_revision desc,change.id desc
  ) current_value
  where current_value.action = 'set';

  -- Fonte e Âncora são fatos de proveniência, não materializações. As revisões
  -- são copiadas sem Storage; os vínculos são recompostos contra o alvo novo.
  insert into private.course_source_revisions(
    course_id,source_id,revision,status,kind,title,citation_text,url,
    edition_or_version,study_visibility,actor_id
  )
  select v_target_course_id,source.source_id,source.revision,source.status,
    source.kind,source.title,source.citation_text,source.url,
    source.edition_or_version,source.study_visibility,
    case when source.status = 'unresolved_legacy' then null else p_actor_id end
  from private.course_source_revisions source
  where source.course_id = p_source_course_id;

  insert into private.course_source_anchor_revisions(
    course_id,anchor_id,revision,source_id,source_revision,status,selector,
    verification_excerpt,actor_id
  )
  select v_target_course_id,anchor.anchor_id,anchor.revision,anchor.source_id,
    anchor.source_revision,anchor.status,anchor.selector,
    anchor.verification_excerpt,p_actor_id
  from private.course_source_anchor_revisions anchor
  where anchor.course_id = p_source_course_id;

  if exists(
    select 1
    from private.course_source_attributions attribution
    cross join lateral private.course_source_links_v1(
      p_source_course_id,attribution.id
    ) links
    join lateral jsonb_array_elements(links) link(value) on true
    join lateral (
      select source.status
      from private.course_source_revisions source
      where source.course_id = p_source_course_id
        and source.source_id = link.value->>'sourceId'
        and source.revision = (link.value->>'sourceRevision')::bigint
    ) source on true
    where attribution.course_id = p_source_course_id
      and source.status = 'unresolved_legacy'
  ) then
    raise exception 'A variante exige Fonte legada ainda não resolvida.'
      using errcode = '55000';
  end if;

  for v_attribution in
    select 'plan_item'::text as target_kind,
      target_item.id::text as target_id,
      private.course_effective_source_links_v1(
        p_source_course_id,'plan_item',source_item.id::text
      ) as links
    from private.course_instructional_plan_items source_item
    join private.course_instructional_plan_items target_item
      on target_item.course_id = v_target_course_id
     and target_item.item_kind = source_item.item_kind
     and target_item.position = source_item.position
    where source_item.course_id = p_source_course_id
    union all
    select 'study_unit'::text,source_unit.entity_id,
      private.course_effective_source_links_v1(
        p_source_course_id,'study_unit',source_unit.entity_id
      )
    from private.course_entities source_unit
    where source_unit.course_id = p_source_course_id
      and source_unit.entity_type = 'study_unit'
  loop
    perform private.apply_course_source_attribution_v1(
      v_target_course_id,v_attribution.target_kind,v_attribution.target_id,
      1,v_attribution.links,p_actor_id,false,null
    );
  end loop;

  for v_difference in select value from jsonb_array_elements(p_parameter_differences)
  loop
    if jsonb_typeof(v_difference) <> 'object'
       or not (v_difference ?& array['scopeKind','scopeId','parameterId','value','rationale'])
       or v_difference-'scopeKind'-'scopeId'-'parameterId'-'value'-'rationale' <> '{}'::jsonb
       or jsonb_typeof(v_difference->'scopeKind') <> 'string'
       or jsonb_typeof(v_difference->'scopeId') <> 'string'
       or jsonb_typeof(v_difference->'parameterId') <> 'string'
       or jsonb_typeof(v_difference->'rationale') <> 'string' then
      raise exception 'Diferença de parâmetro inválida.' using errcode = '22023';
    end if;
    v_scope_kind := v_difference->>'scopeKind';
    v_scope_ref := v_difference->>'scopeId';
    v_parameter_id := v_difference->>'parameterId';
    if v_scope_kind not in('course','lesson','didactic_microsequence')
       or v_scope_ref !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$'
       or v_parameter_id !~ '^[a-z][a-z0-9_]{0,159}$'
       or nullif(btrim(v_difference->>'rationale'),'') is null
       or char_length(v_difference->>'rationale') > 1000
       or translate(v_difference->>'rationale',E'\n\r\t','') ~ '[[:cntrl:]]'
       or not exists(
         select 1 from private.course_design_parameter_definitions definition
         where definition.parameter_id = v_parameter_id
           and v_scope_kind = any(definition.supported_scopes)
       ) then
      raise exception 'Diferença de parâmetro inválida.' using errcode = '22023';
    end if;
    if v_scope_kind = 'course' then
      if v_scope_ref not in ('course',p_source_course_id::text) then
        raise exception 'A diferença de Curso não referencia a origem.' using errcode = '22023';
      end if;
      v_scope_ref := v_target_course_id::text;
    elsif not exists(
      select 1 from private.course_entities entity
      where entity.course_id = v_target_course_id
        and entity.entity_type = case when v_scope_kind = 'lesson'
          then 'lesson' else 'microsequence' end
        and entity.entity_id = v_scope_ref
    ) then
      raise exception 'O alvo da diferença não pertence à variante.' using errcode = '22023';
    end if;
    if (v_scope_kind || E'\x1f' || v_scope_ref || E'\x1f' || v_parameter_id)
         = any(v_parameter_targets) then
      raise exception 'A mesma diferença foi declarada mais de uma vez.' using errcode = '22023';
    end if;
    v_parameter_targets := array_append(
      v_parameter_targets,v_scope_kind || E'\x1f' || v_scope_ref || E'\x1f' || v_parameter_id
    );
    v_parameter_value := private.canonical_course_design_parameter_value_v1(
      v_parameter_id,v_difference->'value'
    );
    insert into private.course_design_parameter_changes(
      course_id,course_revision,parameter_id,scope_kind,scope_ref,
      action,value,origin,reason,actor_id,channel
    ) values(
      v_target_course_id,1,v_parameter_id,v_scope_kind,v_scope_ref,
      'set',v_parameter_value,'author',btrim(v_difference->>'rationale'),
      p_actor_id,'application'
    );
  end loop;

  if p_component_policy_difference is not null then
    insert into private.course_component_policy_changes(
      course_id,course_revision,scope_kind,scope_ref,
      action,policy,origin,reason,actor_id,channel
    ) values(
      v_target_course_id,1,'course',v_target_course_id::text,
      'set',p_component_policy_difference,'author',
      'Diferença intencional da variante comparável.',p_actor_id,'application'
    );
  end if;

  insert into private.course_events(
    course_id,revision,operation,summary,actor_id
  ) values(
    v_target_course_id,1,'create_course',jsonb_build_object(
      'changeKind','course_variant_initialized',
      'sourceCourseId',p_source_course_id,
      'instructionalPlanId',(
        select id from private.course_instructional_plans
        where course_id = v_target_course_id
      ),
      'createdCount',0,'updatedCount',0,'deletedCount',0
    ),p_actor_id
  );
  return v_target_course_id;
end;
$function$;

revoke all on function private.clone_course_variant_from_source_v1(
  uuid,uuid,text,text,jsonb,jsonb
) from public, anon, authenticated;

alter table private.course_change_receipts
  drop constraint course_change_receipts_operation_v6,
  add constraint course_change_receipts_operation_v7 check(operation in(
    'create_course','commit_course_composition','commit_instructional_plan',
    'advance_authoring_part_materialization','apply_course_design_command',
    'execute_course_source_command','grant_access','revoke_access',
    'update_audit_cycle','create_course_variants','detach_course_variant'
  ));

create function public.create_course_variants_for_actor_v1(
  p_actor_id uuid,
  p_source_course_id uuid,
  p_expected_course_revision bigint,
  p_command jsonb,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $function$
declare
  v_source_course public.courses%rowtype;
  v_snapshot jsonb;
  v_snapshot_hash text;
  v_checkpoint_id uuid;
  v_comparison_set_id uuid;
  v_variant jsonb;
  v_course_id uuid;
  v_result jsonb;
  v_receipt private.course_change_receipts%rowtype;
  v_request_hash text;
  v_members jsonb := '[]'::jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(
    p_source_course_id,p_actor_id,true
  );
  if p_actor_id is null
     or p_source_course_id is null
     or p_expected_course_revision is null
     or p_expected_course_revision < 1
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or jsonb_typeof(p_command) <> 'object'
     or not (p_command ?& array[
       'type','comparisonSetId','expectedCourseRevision','variants'
     ])
     or p_command-'type'-'comparisonSetId'-'expectedCourseRevision'-'variants'
       <> '{}'::jsonb
     or p_command->>'type' <> 'create_comparison_variants'
     or jsonb_typeof(p_command->'comparisonSetId') <> 'string'
     or p_command->>'comparisonSetId' !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or jsonb_typeof(p_command->'expectedCourseRevision') <> 'number'
     or p_command->>'expectedCourseRevision' !~ '^[1-9][0-9]*$'
     or (p_command->>'expectedCourseRevision')::bigint <> p_expected_course_revision
     or jsonb_typeof(p_command->'variants') <> 'array'
     or jsonb_array_length(p_command->'variants') not between 2 and 8
     or pg_column_size(p_command) > 131072 then
    raise exception 'Comando de variantes comparáveis inválido.'
      using errcode = '22023';
  end if;
  v_comparison_set_id := (p_command->>'comparisonSetId')::uuid;
  v_request_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'operation','create_course_variants',
    'actorId',p_actor_id,
    'sourceCourseId',p_source_course_id,
    'expectedCourseRevision',p_expected_course_revision,
    'command',p_command
  )::text,'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'course-variant-request:' || p_actor_id::text || ':' || p_request_id,0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  select * into v_receipt
  from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'create_course_variants'
       or v_receipt.course_id <> p_source_course_id
       or v_receipt.request_hash <> v_request_hash then
      raise exception 'requestId reutilizado com comando incompatível.'
        using errcode = '23514';
    end if;
    return (v_receipt.result-'idempotent') || jsonb_build_object(
      'idempotent',true
    );
  end if;

  select * into strict v_source_course
  from public.courses course
  where course.id = p_source_course_id
  for update;
  if v_source_course.revision <> p_expected_course_revision then
    raise sqlstate 'PGRST' using
      message = jsonb_build_object(
        'code','40001',
        'message','O Curso mudou; releia antes de criar variantes.',
        'details',null,'hint',null
      )::text,
      detail = jsonb_build_object('status',409,'headers',jsonb_build_object())::text;
  end if;
  if exists(
    select 1 from private.course_variant_comparison_sets comparison_set
    where comparison_set.id = v_comparison_set_id
  ) then
    raise exception 'A identidade do conjunto de variantes já existe.'
      using errcode = '23505';
  end if;
  if exists(
    select 1 from jsonb_array_elements(p_command->'variants') variant
    where jsonb_typeof(variant.value) <> 'object'
      or (
        not (variant.value ?& array[
          'label','title','goal','parameterDifferences',
          'componentPolicyDifference'
        ])
        or variant.value-'label'-'title'-'goal'-'parameterDifferences'
          -'componentPolicyDifference' <> '{}'::jsonb
        or jsonb_typeof(variant.value->'label') <> 'string'
        or jsonb_typeof(variant.value->'title') <> 'string'
        or jsonb_typeof(variant.value->'goal') <> 'string'
        or jsonb_typeof(variant.value->'parameterDifferences') <> 'array'
        or jsonb_array_length(variant.value->'parameterDifferences') > 16
        or (variant.value->'componentPolicyDifference' <> 'null'::jsonb
          and jsonb_typeof(variant.value->'componentPolicyDifference') <> 'object')
      )
  ) or not exists(
    select 1 from jsonb_array_elements(p_command->'variants') variant
    where jsonb_array_length(variant.value->'parameterDifferences') > 0
       or variant.value->'componentPolicyDifference' <> 'null'::jsonb
  ) or exists(
    select variant.value->>'label'
    from jsonb_array_elements(p_command->'variants') variant
    group by variant.value->>'label' having count(*) > 1
  ) then
    raise exception 'As variantes comparáveis não possuem uma forma válida.'
      using errcode = '22023';
  end if;

  v_snapshot := private.course_variant_plan_checkpoint_snapshot_v1(
    p_source_course_id
  );
  if v_snapshot is null or octet_length(v_snapshot::text) > 65536 then
    raise exception 'O checkpoint de planejamento excede o limite.'
      using errcode = '54000';
  end if;
  v_snapshot_hash := private.course_variant_plan_snapshot_hash_v1(v_snapshot);
  select checkpoint.id into v_checkpoint_id
  from private.course_variant_plan_checkpoints checkpoint
  where checkpoint.owner_id = p_actor_id
    and checkpoint.source_course_id = p_source_course_id
    and checkpoint.snapshot_hash = v_snapshot_hash;
  if not found then
    insert into private.course_variant_plan_checkpoints(
      owner_id,source_course_id,source_course_revision,source_plan_version,
      plan_snapshot,snapshot_hash
    ) values(
      p_actor_id,p_source_course_id,v_source_course.revision,
      (v_snapshot->>'planVersion')::bigint,v_snapshot,v_snapshot_hash
    ) returning id into v_checkpoint_id;
  end if;
  insert into private.course_variant_comparison_sets(
    id,owner_id,checkpoint_id,source_course_id,source_course_revision
  ) values(
    v_comparison_set_id,p_actor_id,v_checkpoint_id,p_source_course_id,
    v_source_course.revision
  );
  for v_variant in select value from jsonb_array_elements(p_command->'variants')
  loop
    v_course_id := private.clone_course_variant_from_source_v1(
      p_actor_id,p_source_course_id,v_variant->>'title',v_variant->>'goal',
      v_variant->'parameterDifferences',
      case when v_variant->'componentPolicyDifference' = 'null'::jsonb
        then null else v_variant->'componentPolicyDifference' end
    );
    insert into private.course_variant_comparison_members(
      comparison_set_id,course_id,label,declared_parameter_differences,
      declared_component_policy_difference,attached_course_revision
    ) values(
      v_comparison_set_id,v_course_id,v_variant->>'label',
      v_variant->'parameterDifferences',
      case when v_variant->'componentPolicyDifference' = 'null'::jsonb
        then null else v_variant->'componentPolicyDifference' end,1
    );
    v_members := v_members || jsonb_build_array(jsonb_build_object(
      'courseId',v_course_id,'label',v_variant->>'label',
      'title',v_variant->>'title','goal',v_variant->>'goal','revision',1
    ));
  end loop;
  v_result := jsonb_build_object(
    'contract','aralearn.course-variant-comparison-change.v1',
    'comparisonSetId',v_comparison_set_id,
    'sourceCourseId',p_source_course_id,
    'sourceCourseRevision',v_source_course.revision,
    'checkpointId',v_checkpoint_id,'checkpointHash',v_snapshot_hash,
    'members',v_members,'idempotent',false
  );
  insert into private.course_change_receipts(
    actor_id,request_id,operation,course_id,request_hash,result
  ) values(
    p_actor_id,p_request_id,'create_course_variants',p_source_course_id,
    v_request_hash,v_result
  );
  return v_result;
end;
$function$;

revoke all on function public.create_course_variants_for_actor_v1(
  uuid,uuid,bigint,jsonb,text
) from public, anon, authenticated;
grant execute on function public.create_course_variants_for_actor_v1(
  uuid,uuid,bigint,jsonb,text
) to service_role;

create function public.get_owned_course_variant_comparison_for_actor_v1(
  p_actor_id uuid,
  p_source_course_id uuid,
  p_expected_course_revision bigint,
  p_comparison_set_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $function$
declare
  v_source_course public.courses%rowtype;
  v_comparison_set private.course_variant_comparison_sets%rowtype;
  v_members jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(
    p_source_course_id,p_actor_id,true
  );
  if p_expected_course_revision is null or p_expected_course_revision < 1
     or p_comparison_set_id is null then
    raise exception 'Leitura de variantes comparáveis inválida.'
      using errcode = '22023';
  end if;
  select * into strict v_source_course
  from public.courses course
  where course.id = p_source_course_id
  for share;
  if v_source_course.revision <> p_expected_course_revision then
    raise sqlstate 'PGRST' using
      message = jsonb_build_object(
        'code','40001',
        'message','O Curso mudou; releia antes de comparar variantes.',
        'details',null,'hint',null
      )::text,
      detail = jsonb_build_object('status',409,'headers',jsonb_build_object())::text;
  end if;
  select * into strict v_comparison_set
  from private.course_variant_comparison_sets comparison_set
  where comparison_set.id = p_comparison_set_id
    and comparison_set.owner_id = p_actor_id
    and comparison_set.source_course_id = p_source_course_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'courseId',course.id,'label',member.label,
    'title',course.title,'goal',course.goal,
    'attachedCourseRevision',member.attached_course_revision,
    'currentCourseRevision',course.revision,
    'changedSinceAttached',course.revision <> member.attached_course_revision,
    'detachedAt',member.detached_at,
    'parameterDifferences',member.declared_parameter_differences,
    'componentPolicyDifference',member.declared_component_policy_difference,
    'materialization',jsonb_build_object(
      'partCount',(select count(*)::integer
        from private.course_authoring_parts part
        where part.course_id = course.id and part.retired_at is null),
      'completedCount',(select count(*)::integer
        from private.course_authoring_part_materializations materialization
        where materialization.course_id = course.id
          and materialization.status = 'completed'),
      'runningCount',(select count(*)::integer
        from private.course_authoring_part_materializations materialization
        where materialization.course_id = course.id
          and materialization.status = 'running'),
      'latestUpdatedAt',(select max(materialization.updated_at)
        from private.course_authoring_part_materializations materialization
        where materialization.course_id = course.id)
    )
  ) order by member.label),'[]'::jsonb) into v_members
  from private.course_variant_comparison_members member
  join public.courses course on course.id = member.course_id
  where member.comparison_set_id = v_comparison_set.id;

  return jsonb_build_object(
    'contract','aralearn.course-variant-comparison.v1',
    'comparisonSetId',v_comparison_set.id,
    'source',jsonb_build_object(
      'courseId',v_source_course.id,'title',v_source_course.title,
      'goal',v_source_course.goal,'currentCourseRevision',v_source_course.revision,
      'checkpointCourseRevision',v_comparison_set.source_course_revision,
      'changedSinceCheckpoint',v_source_course.revision <> v_comparison_set.source_course_revision,
      'checkpointId',v_comparison_set.checkpoint_id,
      'checkpointHash',(select checkpoint.snapshot_hash
        from private.course_variant_plan_checkpoints checkpoint
        where checkpoint.id = v_comparison_set.checkpoint_id)
    ),
    'members',v_members
  );
end;
$function$;

revoke all on function public.get_owned_course_variant_comparison_for_actor_v1(
  uuid,uuid,bigint,uuid
) from public, anon, authenticated;
grant execute on function public.get_owned_course_variant_comparison_for_actor_v1(
  uuid,uuid,bigint,uuid
) to service_role;

create function public.detach_course_variant_for_actor_v1(
  p_actor_id uuid,
  p_source_course_id uuid,
  p_comparison_set_id uuid,
  p_course_id uuid,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $function$
declare
  v_comparison_set private.course_variant_comparison_sets%rowtype;
  v_member private.course_variant_comparison_members%rowtype;
  v_receipt private.course_change_receipts%rowtype;
  v_request_hash text;
  v_result jsonb;
  v_changed boolean := false;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(
    p_source_course_id,p_actor_id,true
  );
  if p_comparison_set_id is null or p_course_id is null
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'Desvinculação de variante inválida.' using errcode = '22023';
  end if;
  v_request_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'operation','detach_course_variant','actorId',p_actor_id,
    'sourceCourseId',p_source_course_id,
    'comparisonSetId',p_comparison_set_id,'courseId',p_course_id
  )::text,'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'course-variant-request:' || p_actor_id::text || ':' || p_request_id,0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  select * into v_receipt
  from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'detach_course_variant'
       or v_receipt.course_id <> p_source_course_id
       or v_receipt.request_hash <> v_request_hash then
      raise exception 'requestId reutilizado com comando incompatível.'
        using errcode = '23514';
    end if;
    return (v_receipt.result-'idempotent') || jsonb_build_object(
      'idempotent',true
    );
  end if;
  select * into strict v_comparison_set
  from private.course_variant_comparison_sets comparison_set
  where comparison_set.id = p_comparison_set_id
    and comparison_set.owner_id = p_actor_id
    and comparison_set.source_course_id = p_source_course_id
  for update;
  select * into strict v_member
  from private.course_variant_comparison_members member
  where member.comparison_set_id = v_comparison_set.id
    and member.course_id = p_course_id
  for update;
  if v_member.detached_at is null then
    update private.course_variant_comparison_members member
    set detached_at = statement_timestamp()
    where member.comparison_set_id = v_comparison_set.id
      and member.course_id = p_course_id
    returning * into v_member;
    update private.course_variant_comparison_sets comparison_set
    set version = version + 1,updated_at = statement_timestamp()
    where comparison_set.id = v_comparison_set.id;
    v_changed := true;
  end if;
  v_result := jsonb_build_object(
    'contract','aralearn.course-variant-comparison-change.v1',
    'comparisonSetId',v_comparison_set.id,
    'sourceCourseId',p_source_course_id,'courseId',p_course_id,
    'detachedAt',v_member.detached_at,
    'changed',v_changed,'idempotent',false
  );
  insert into private.course_change_receipts(
    actor_id,request_id,operation,course_id,request_hash,result
  ) values(
    p_actor_id,p_request_id,'detach_course_variant',p_source_course_id,
    v_request_hash,v_result
  );
  return v_result;
end;
$function$;

revoke all on function public.detach_course_variant_for_actor_v1(
  uuid,uuid,uuid,uuid,text
) from public, anon, authenticated;
grant execute on function public.detach_course_variant_for_actor_v1(
  uuid,uuid,uuid,uuid,text
) to service_role;

comment on table private.course_variant_plan_checkpoints is
  'Checkpoint deduplicado de planejamento para comparar variantes; não é uma verdade imutável do Curso vivo.';
comment on table private.course_variant_comparison_sets is
  'Conjunto owner-only de Cursos vivos comparáveis; apagar ou desvincular um membro não apaga os outros Cursos.';
comment on table private.course_variant_comparison_members is
  'Vínculo de variante com diferenças declaradas; não contém participantes, resultados, consentimento ou atribuição.';

do $course_variant_comparisons_postflight$
begin
  if to_regclass('private.course_variant_plan_checkpoints') is null
     or to_regclass('private.course_variant_comparison_sets') is null
     or to_regclass('private.course_variant_comparison_members') is null
     or to_regprocedure('private.course_variant_plan_checkpoint_snapshot_v1(uuid)') is null
     or to_regprocedure('private.clone_course_variant_from_source_v1(uuid,uuid,text,text,jsonb,jsonb)') is null
     or to_regprocedure('public.create_course_variants_for_actor_v1(uuid,uuid,bigint,jsonb,text)') is null
     or to_regprocedure('public.get_owned_course_variant_comparison_for_actor_v1(uuid,uuid,bigint,uuid)') is null
     or to_regprocedure('public.detach_course_variant_for_actor_v1(uuid,uuid,uuid,uuid,text)') is null then
    raise exception 'Autoridade de variantes comparáveis está incompleta.'
      using errcode = '55000';
  end if;
  if exists(
    select 1 from pg_class relation_value
    where relation_value.oid = any(array[
      'private.course_variant_plan_checkpoints'::regclass,
      'private.course_variant_comparison_sets'::regclass,
      'private.course_variant_comparison_members'::regclass
    ]) and (not relation_value.relrowsecurity or not relation_value.relforcerowsecurity)
  ) or exists(
    select 1 from pg_policy policy_value
    where policy_value.polrelid = any(array[
      'private.course_variant_plan_checkpoints'::regclass,
      'private.course_variant_comparison_sets'::regclass,
      'private.course_variant_comparison_members'::regclass
    ])
  ) then
    raise exception 'RLS privado de variantes comparáveis não está fechado.'
      using errcode = '55000';
  end if;
  if exists(
    select 1
    from unnest(array['anon','authenticated','service_role']::text[]) role_name
    cross join unnest(array['select','insert','update','delete']::text[]) privilege
    cross join unnest(array[
      'private.course_variant_plan_checkpoints',
      'private.course_variant_comparison_sets',
      'private.course_variant_comparison_members'
    ]::text[]) relation_name
    where has_table_privilege(role_name,relation_name,privilege)
  ) then
    raise exception 'Autoridade privada de variantes expõe privilégio direto.'
      using errcode = '55000';
  end if;
  if not has_function_privilege(
       'service_role',
       'public.create_course_variants_for_actor_v1(uuid,uuid,bigint,jsonb,text)',
       'execute'
     ) or has_function_privilege(
       'authenticated',
       'public.create_course_variants_for_actor_v1(uuid,uuid,bigint,jsonb,text)',
       'execute'
     ) or not has_function_privilege(
       'service_role',
       'public.get_owned_course_variant_comparison_for_actor_v1(uuid,uuid,bigint,uuid)',
       'execute'
     ) or not has_function_privilege(
       'service_role',
       'public.detach_course_variant_for_actor_v1(uuid,uuid,uuid,uuid,text)',
       'execute'
     ) then
    raise exception 'Privilégio da RPC de variantes comparáveis é inválido.'
      using errcode = '55000';
  end if;
  if not exists(
    select 1 from pg_constraint constraint_value
    where constraint_value.conrelid = 'private.course_variant_comparison_members'::regclass
      and constraint_value.confrelid = 'public.courses'::regclass
      and constraint_value.contype = 'f'
      and constraint_value.confdeltype = 'c'
  ) then
    raise exception 'Membro de variante não permite a exclusão do Curso.'
      using errcode = '55000';
  end if;
end;
$course_variant_comparisons_postflight$;

do $advance_course_variant_comparisons_manifest$
declare
  v_manifest jsonb;
  v_features jsonb;
  v_body text;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision' <> '20260817210000'
     or (v_manifest->>'contractVersion')::integer <> 1 then
    raise exception 'Manifesto concorrente a variantes comparáveis.'
      using errcode = '55000';
  end if;
  select jsonb_agg(feature.value order by feature.ordinal) into v_features
  from (
    select existing.value,existing.ordinal
    from jsonb_array_elements_text(v_manifest->'features')
      with ordinality existing(value,ordinal)
    union all select 'course-variant-comparisons-v1',1000014::bigint
  ) feature;
  v_manifest := jsonb_build_object(
    'schemaRevision','20260818042341','contractVersion',1,'features',v_features
  );
  v_body := 'select ' || quote_literal(v_manifest::text) || '::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      || 'returns jsonb language sql stable security definer '
      || 'set search_path = pg_catalog as %L',v_body
  );
  revoke all on function public.get_aralearn_runtime_manifest()
    from public,anon,authenticated,service_role;
  grant execute on function public.get_aralearn_runtime_manifest()
    to anon,authenticated,service_role;
end;
$advance_course_variant_comparisons_manifest$;

do $verify_course_variant_comparisons_manifest$
declare
  v_manifest jsonb := public.get_aralearn_runtime_manifest();
begin
  if v_manifest->>'schemaRevision' <> '20260818042341'
     or not (v_manifest->'features' ? 'course-variant-comparisons-v1') then
    raise exception 'Manifesto final perdeu o contrato de variantes.'
      using errcode = '55000';
  end if;
end;
$verify_course_variant_comparisons_manifest$;
