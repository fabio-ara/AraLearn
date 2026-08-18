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
