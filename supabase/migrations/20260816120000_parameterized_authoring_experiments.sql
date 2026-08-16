-- Experimentos instrucionais parametrizados: protocolo versionado, variantes
-- isoladas, diferenças governadas e atribuição privada de participantes.

begin;

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-parameterized-authoring-experiments-v1',
  0
));

-- Cursos privados comuns conservam a semântica histórica de remoção em
-- cascata. Variantes e bases já pinadas são anonimizadas antes da exclusão da
-- conta autora (trigger abaixo), para preservar assignments e continuidade.
alter table public.courses
  drop constraint if exists courses_owner_id_fkey;
alter table public.courses
  add constraint courses_owner_id_fkey foreign key(owner_id)
    references auth.users(id) on delete cascade;

-- A origem privada não pode ser inferida de owner_id: essa FK é anonimizada
-- quando a conta autora é apagada. Os marcadores também impedem que triggers,
-- RLS ou leitores de catálogo promovam evidência experimental por engano.
alter table public.courses
  add column experiment_variant boolean not null default false,
  add column experiment_base boolean not null default false,
  add constraint courses_experiment_origin_v1 check (
    not (experiment_variant and experiment_base)
  );

-- O parent/child experimental precisa sobreviver à remoção da conta sem
-- alterar a cascata de workspaces comuns. A rotina BEFORE DELETE retira
-- somente esses owners; membros e proveniência pessoal continuam sendo
-- anonimizados pelas FKs/triggers próprios.
alter table private.authoring_workspaces alter column owner_id drop not null;

create function private.anonymize_owned_experiment_courses_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  insert into private.authoring_experiment_selection_write_tokens(
    transaction_id,operation,selection_id,user_id,course_id,
    enrollment_id,assignment_id
  )
  select txid_current(),'account_delete',selection.id,selection.user_id,
    selection.course_id,assignment.enrollment_id,assignment.id
  from public.user_course_selections selection
  join private.authoring_experiment_assignments assignment
    on assignment.selection_id=selection.id
  where selection.user_id=old.id
  on conflict do nothing;
  update private.authoring_workspaces workspace
  set owner_id=null
  where workspace.owner_id=old.id
    and (
      exists(select 1 from private.authoring_experiments experiment
        where experiment.workspace_id=workspace.id)
      or exists(select 1
        from private.authoring_experiment_variant_revisions revision
        where revision.child_workspace_id=workspace.id)
    );
  update public.courses course
  set owner_id=null
  where course.owner_id=old.id and course.experiment_variant;
  update public.courses course
  set owner_id=null,experiment_base=true
  where course.owner_id=old.id
    and exists (
      select 1
      from private.authoring_experiment_base_revisions base
      where base.publication_course_id=course.id
    );
  delete from public.user_course_selections selection
  using public.courses course
  where course.id=selection.course_id and course.experiment_base;
  return old;
end;
$function$;

create trigger anonymize_owned_experiment_courses_v1
before delete on auth.users
for each row execute function private.anonymize_owned_experiment_courses_v1();

create function private.cleanup_authoring_experiment_selection_tokens_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  delete from private.authoring_experiment_selection_write_tokens token
  where token.transaction_id=txid_current() and token.user_id=old.id;
  return old;
end;
$function$;

create trigger cleanup_authoring_experiment_selection_tokens_v1
after delete on auth.users
for each row execute function
  private.cleanup_authoring_experiment_selection_tokens_v1();

create or replace function private.ensure_official_course_collection()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_collection_id uuid := case new.contract_key
    when 'course-dataprev-2026-analista-processamento-seguranca-informacao'
      then '71000000-0000-4000-8000-000000000001'::uuid
    when 'course-fundamentos-ia-analise-dados'
      then '71000000-0000-4000-8000-000000000002'::uuid
    when 'course-microsoft-azure-ai-fundamentals-ai900'
      then '71000000-0000-4000-8000-000000000003'::uuid
    else '71000000-0000-4000-8000-000000000004'::uuid
  end;
begin
  if not (new.experiment_variant or new.experiment_base)
     and new.owner_id is null
     and new.status = 'published'
     and new.deleted_at is null then
    if not exists (
      select 1 from public.catalog_collection_courses item
      where item.course_id = new.id and item.deleted_at is null
    ) then
      insert into public.catalog_collection_courses(
        collection_id, course_id
      ) values(v_collection_id, new.id);
    end if;
  else
    delete from public.catalog_collection_courses item
    where item.course_id = new.id;
  end if;
  return new;
end;
$function$;

drop trigger if exists courses_ensure_official_collection on public.courses;
create trigger courses_ensure_official_collection
after insert or update of status, deleted_at, contract_key, owner_id,
  experiment_variant, experiment_base on public.courses
for each row execute function private.ensure_official_course_collection();

create or replace function public.user_can_read_course(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
  select auth.uid() is not null and exists (
    select 1
    from public.courses course
    where course.id = p_course_id
      and course.deleted_at is null
      and course.status = 'published'
      and (
        (
          not (course.experiment_variant or course.experiment_base)
          and (course.owner_id is null or course.owner_id = auth.uid())
        )
        or (
          course.experiment_variant
          and (
            course.owner_id = auth.uid()
            or exists (
              select 1 from public.user_course_selections selection
              where selection.course_id = course.id
                and selection.user_id = auth.uid()
            )
          )
        )
      )
  )
$function$;

-- `research` é uma capacidade explícita de owner/admin. Ela não é um papel
-- adicional e não herda a capacidade editorial global do catálogo.
create or replace function private.educational_workspace_can_v1(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_capability text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  select coalesce((
    select case p_capability
      when 'read' then member.role in (
        'owner', 'admin', 'author', 'reviewer', 'learner', 'reader'
      )
      when 'author' then member.role in ('owner', 'admin', 'author')
      when 'review' then member.role in ('owner', 'admin', 'author', 'reviewer')
      when 'comment' then member.role in (
        'owner', 'admin', 'author', 'reviewer', 'learner'
      )
      when 'publish' then member.role in ('owner', 'admin', 'author')
      when 'manage' then member.role in ('owner', 'admin')
      when 'research' then member.role in ('owner', 'admin')
      when 'transfer' then member.role = 'owner'
        and workspace.owner_id = p_actor_id
      else false
    end
    from private.educational_workspace_members member
    join private.authoring_workspaces workspace
      on workspace.id = member.workspace_id
    where member.workspace_id = p_workspace_id
      and member.user_id = p_actor_id
      and workspace.deleted_at is null
  ), false) or (
    p_capability in ('read', 'author', 'review', 'comment', 'publish', 'manage')
    and private.can_publish_catalog_v5(p_actor_id)
    and exists (
      select 1 from private.authoring_workspaces workspace
      where workspace.id = p_workspace_id
        and workspace.deleted_at is null
        and (
          exists (
            select 1
            from private.authoring_workspace_publications publication
            where publication.workspace_id = workspace.id
              and publication.target = 'catalog'
          )
          or exists (
            select 1
            from public.courses source_course
            where source_course.id = workspace.source_course_id
              and source_course.owner_id is null
              and not (
                source_course.experiment_variant
                or source_course.experiment_base
              )
              and source_course.status = 'published'
              and source_course.deleted_at is null
              and source_course.document_storage_enabled
          )
        )
    )
  )
$function$;

create or replace function private.require_educational_workspace_capability_v1(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_capability text
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_role text;
begin
  if p_capability not in (
    'read', 'author', 'review', 'comment', 'publish', 'manage', 'research',
    'transfer'
  ) then
    raise exception 'Capacidade do workspace inválida.' using errcode = '22023';
  end if;
  v_role := private.educational_workspace_effective_role_v1(
    p_workspace_id, p_actor_id
  );
  if private.educational_workspace_can_v1(
    p_workspace_id, p_actor_id, p_capability
  ) then
    return v_role;
  end if;
  if v_role is null then
    raise exception 'Workspace inexistente ou inacessível.' using errcode = 'P0002';
  end if;
  raise exception 'Ação não permitida neste workspace.' using errcode = '42501';
end;
$function$;

-- Uma publicação privada só pode ser base ou evidência se corresponder à
-- revisão corrente que foi efetivamente publicada.
alter table private.authoring_workspace_publications
  add column published_workspace_revision bigint;

update private.authoring_workspace_publications publication
set published_workspace_revision = workspace.revision
from private.authoring_workspaces workspace
where workspace.id = publication.workspace_id
  and publication.updated_at >= workspace.updated_at;

alter table private.authoring_workspace_publications
  add constraint authoring_workspace_publications_revision_v1 check (
    published_workspace_revision is null
    or published_workspace_revision > 0
  );

create function private.stamp_authoring_publication_revision_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  select workspace.revision into new.published_workspace_revision
  from private.authoring_workspaces workspace
  where workspace.id = new.workspace_id and workspace.deleted_at is null;
  if new.published_workspace_revision is null then
    raise exception 'Workspace da publicação inexistente.' using errcode = 'P0002';
  end if;
  return new;
end;
$function$;

create trigger authoring_workspace_publication_revision_v1
before insert or update of course_id, content_hash
on private.authoring_workspace_publications
for each row execute function
  private.stamp_authoring_publication_revision_v1();

-- Registries governados pinam políticas e instrumentos por versão. A
-- disponibilidade pode ser revogada sem reescrever a definição histórica.
create table private.authoring_research_consent_policy_definitions (
  policy_id text not null,
  policy_version text not null,
  label text not null,
  descriptor jsonb not null,
  descriptor_hash text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(policy_id, policy_version),
  constraint authoring_research_consent_policies_shape_v1 check (
    policy_id ~ '^[a-z][a-z0-9._:-]{2,159}$'
    and policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
    and nullif(btrim(label), '') is not null
    and char_length(label) <= 240
    and jsonb_typeof(descriptor) = 'object'
    and pg_column_size(descriptor) <= 65536
    and descriptor_hash ~ '^[a-f0-9]{64}$'
    and not private.authoring_design_contains_forbidden_key_v1(descriptor)
  )
);

create table private.authoring_research_consent_policy_availability (
  policy_id text not null,
  policy_version text not null,
  active boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(policy_id, policy_version),
  foreign key(policy_id, policy_version)
    references private.authoring_research_consent_policy_definitions(
      policy_id, policy_version
    ) on delete restrict
);

create table private.authoring_research_instrument_definitions (
  instrument_id text not null,
  instrument_version text not null,
  label text not null,
  instrument_kind text not null,
  purpose text not null,
  descriptor jsonb not null,
  descriptor_hash text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(instrument_id, instrument_version),
  constraint authoring_research_instruments_shape_v1 check (
    instrument_id ~ '^[a-z][a-z0-9._:-]{2,159}$'
    and instrument_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
    and nullif(btrim(label), '') is not null
    and char_length(label) <= 240
    and instrument_kind in (
      'assessment', 'survey', 'outcome_measure', 'external_registry'
    )
    and nullif(btrim(purpose), '') is not null
    and char_length(purpose) <= 1000
    and jsonb_typeof(descriptor) = 'object'
    and pg_column_size(descriptor) <= 65536
    and descriptor_hash ~ '^[a-f0-9]{64}$'
    and not private.authoring_design_contains_forbidden_key_v1(descriptor)
  )
);

create table private.authoring_research_instrument_availability (
  instrument_id text not null,
  instrument_version text not null,
  active boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(instrument_id, instrument_version),
  foreign key(instrument_id, instrument_version)
    references private.authoring_research_instrument_definitions(
      instrument_id, instrument_version
    ) on delete restrict
);

create table private.authoring_experiments (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null
    references private.authoring_workspaces(id) on delete restrict,
  experiment_key text not null,
  title text not null,
  state text not null default 'draft',
  revision bigint not null default 1,
  current_protocol_revision integer,
  current_base_revision_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, experiment_key),
  unique(id, workspace_id),
  constraint authoring_experiments_key_v1 check (
    experiment_key ~ '^[a-z][a-z0-9._:-]{2,119}$'
    and nullif(btrim(title), '') is not null
    and char_length(title) <= 300
  ),
  constraint authoring_experiments_state_v1 check (
    state in (
      'draft', 'validated', 'generating', 'ready', 'correction_required',
      'collecting', 'paused', 'closed', 'invalidated'
    )
  ),
  constraint authoring_experiments_revision_v1 check (
    revision > 0
    and (current_protocol_revision is null or current_protocol_revision > 0)
  )
);

create index authoring_experiments_workspace_v1_idx
  on private.authoring_experiments(workspace_id, updated_at desc, id);

create table private.authoring_experiment_protocol_revisions (
  experiment_id uuid not null
    references private.authoring_experiments(id) on delete restrict,
  protocol_revision integer not null,
  workspace_id uuid not null,
  contract_version text not null default '1.0.0',
  protocol_hash text not null,
  protocol jsonb not null,
  assignment_kind text not null,
  assignment_algorithm_version text not null,
  assignment_secret_hash text,
  assignment_secret_commitment text,
  study_design text not null,
  scope_kind text not null,
  scope_ref text not null,
  scope_path text[] not null,
  consent_policy_ref text not null,
  consent_revision text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(experiment_id, protocol_revision),
  foreign key(experiment_id, workspace_id)
    references private.authoring_experiments(id, workspace_id) on delete restrict,
  foreign key(consent_policy_ref, consent_revision)
    references private.authoring_research_consent_policy_definitions(
      policy_id, policy_version
    ) on delete restrict,
  constraint authoring_experiment_protocol_identity_v1 check (
    protocol_revision > 0
    and contract_version = '1.0.0'
    and protocol_hash ~ '^[a-f0-9]{64}$'
    and assignment_kind in ('manual', 'seeded_random', 'balanced_simple')
    and assignment_algorithm_version ~ '^[A-Za-z0-9][A-Za-z0-9._@-]{0,79}$'
    and ((assignment_secret_hash is null) =
      (assignment_secret_commitment is null))
    and (
      assignment_secret_hash is null
      or (
        assignment_secret_hash ~ '^[a-f0-9]{64}$'
        and assignment_secret_commitment ~ '^[a-f0-9]{64}$'
      )
    )
    and study_design = 'between_subjects'
  ),
  constraint authoring_experiment_protocol_scope_v1 check (
    scope_kind in ('course', 'lesson', 'microsequence')
    and nullif(btrim(scope_ref), '') is not null
    and char_length(scope_ref) <= 240
    and cardinality(scope_path) = case scope_kind
      when 'course' then 1 when 'lesson' then 3 else 4 end
    and scope_path[cardinality(scope_path)] = scope_ref
  ),
  constraint authoring_experiment_protocol_consent_v1 check (
    nullif(btrim(consent_policy_ref), '') is not null
    and char_length(consent_policy_ref) <= 240
    and consent_revision ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
  ),
  constraint authoring_experiment_protocol_payload_v1 check (
    jsonb_typeof(protocol) = 'object'
    and pg_column_size(protocol) <= 60000
    and octet_length(protocol::text) <= 60000
    and not private.authoring_design_contains_forbidden_key_v1(protocol)
  )
);

alter table private.authoring_experiments
  add constraint authoring_experiments_current_protocol_v1 foreign key(
    id, current_protocol_revision
  ) references private.authoring_experiment_protocol_revisions(
    experiment_id, protocol_revision
  ) deferrable initially deferred;

create table private.authoring_experiment_factors (
  experiment_id uuid not null,
  protocol_revision integer not null,
  factor_id text not null,
  ordinal integer not null,
  label text not null,
  factor_kind text not null,
  parameter_id text not null,
  parameter_version text not null,
  primary key(experiment_id, protocol_revision, factor_id),
  unique(experiment_id, protocol_revision, ordinal),
  foreign key(experiment_id, protocol_revision)
    references private.authoring_experiment_protocol_revisions(
      experiment_id, protocol_revision
    ) on delete restrict,
  foreign key(parameter_id, parameter_version)
    references private.authoring_design_parameter_definitions(
      parameter_id, parameter_version
    ) on delete restrict,
  constraint authoring_experiment_factors_shape_v1 check (
    factor_id ~ '^[a-z][a-z0-9._:-]{0,119}$'
    and ordinal between 1 and 8
    and nullif(btrim(label), '') is not null
    and char_length(label) <= 160
    and factor_kind in ('parameter', 'resource_set')
    and ((factor_kind = 'resource_set') =
      (parameter_id = 'available_resource_set_refs'))
  )
);

create table private.authoring_experiment_factor_targets (
  experiment_id uuid not null,
  protocol_revision integer not null,
  factor_id text not null,
  ordinal integer not null,
  scope_kind text not null,
  scope_ref text not null,
  scope_path text[] not null,
  primary key(
    experiment_id, protocol_revision, factor_id, scope_kind, scope_ref
  ),
  unique(experiment_id, protocol_revision, factor_id, ordinal),
  foreign key(experiment_id, protocol_revision, factor_id)
    references private.authoring_experiment_factors(
      experiment_id, protocol_revision, factor_id
    ) on delete restrict,
  constraint authoring_experiment_factor_targets_shape_v1 check (
    ordinal between 1 and 500
    and scope_kind in ('course', 'lesson', 'microsequence')
    and nullif(btrim(scope_ref), '') is not null
    and cardinality(scope_path) = case scope_kind
      when 'course' then 1 when 'lesson' then 3 else 4 end
    and scope_path[cardinality(scope_path)] = scope_ref
  )
);

create table private.authoring_experiment_factor_levels (
  experiment_id uuid not null,
  protocol_revision integer not null,
  factor_id text not null,
  level_id text not null,
  ordinal integer not null,
  label text not null,
  value jsonb not null,
  value_hash text not null,
  primary key(experiment_id, protocol_revision, factor_id, level_id),
  unique(experiment_id, protocol_revision, factor_id, ordinal),
  foreign key(experiment_id, protocol_revision, factor_id)
    references private.authoring_experiment_factors(
      experiment_id, protocol_revision, factor_id
    ) on delete restrict,
  constraint authoring_experiment_factor_levels_shape_v1 check (
    level_id ~ '^[a-z][a-z0-9._:-]{0,119}$'
    and ordinal between 1 and 32
    and nullif(btrim(label), '') is not null
    and char_length(label) <= 160
    and jsonb_typeof(value) = 'object'
    and pg_column_size(value) <= 65536
    and value_hash ~ '^[a-f0-9]{64}$'
    and not private.authoring_design_contains_forbidden_key_v1(value)
  )
);

create table private.authoring_experiment_conditions (
  experiment_id uuid not null,
  protocol_revision integer not null,
  condition_id text not null,
  ordinal integer not null,
  label text not null,
  vector_hash text not null,
  primary key(experiment_id, protocol_revision, condition_id),
  unique(experiment_id, protocol_revision, ordinal),
  unique(experiment_id, protocol_revision, vector_hash),
  foreign key(experiment_id, protocol_revision)
    references private.authoring_experiment_protocol_revisions(
      experiment_id, protocol_revision
    ) on delete restrict,
  constraint authoring_experiment_conditions_shape_v1 check (
    condition_id ~ '^[a-z][a-z0-9._:-]{0,119}$'
    and ordinal between 1 and 32
    and nullif(btrim(label), '') is not null
    and char_length(label) <= 300
    and vector_hash ~ '^[a-f0-9]{64}$'
  )
);

create table private.authoring_experiment_condition_levels (
  experiment_id uuid not null,
  protocol_revision integer not null,
  condition_id text not null,
  factor_id text not null,
  level_id text not null,
  ordinal integer not null,
  primary key(experiment_id, protocol_revision, condition_id, factor_id),
  unique(experiment_id, protocol_revision, condition_id, ordinal),
  foreign key(experiment_id, protocol_revision, condition_id)
    references private.authoring_experiment_conditions(
      experiment_id, protocol_revision, condition_id
    ) on delete restrict,
  foreign key(experiment_id, protocol_revision, factor_id, level_id)
    references private.authoring_experiment_factor_levels(
      experiment_id, protocol_revision, factor_id, level_id
    ) on delete restrict,
  constraint authoring_experiment_condition_levels_ordinal_v1 check (
    ordinal between 1 and 8
  )
);

create table private.authoring_experiment_condition_resource_sets (
  experiment_id uuid not null,
  protocol_revision integer not null,
  condition_id text not null,
  factor_id text not null,
  target_ordinal integer not null,
  workspace_id uuid not null,
  resource_set_id text not null,
  resource_set_version text not null,
  ordinal integer not null,
  primary key(
    experiment_id, protocol_revision, condition_id, factor_id,
    target_ordinal, resource_set_id, resource_set_version
  ),
  unique(experiment_id, protocol_revision, condition_id, factor_id, ordinal),
  foreign key(experiment_id, protocol_revision, condition_id)
    references private.authoring_experiment_conditions(
      experiment_id, protocol_revision, condition_id
    ) on delete restrict,
  foreign key(experiment_id, protocol_revision, condition_id, factor_id)
    references private.authoring_experiment_condition_levels(
      experiment_id, protocol_revision, condition_id, factor_id
    ) on delete restrict,
  foreign key(experiment_id, protocol_revision, factor_id, target_ordinal)
    references private.authoring_experiment_factor_targets(
      experiment_id, protocol_revision, factor_id, ordinal
    ) on delete restrict,
  foreign key(workspace_id, resource_set_id, resource_set_version)
    references private.authoring_resource_sets(
      workspace_id, resource_set_id, resource_set_version
    ) on delete restrict,
  constraint authoring_experiment_condition_resource_sets_ordinal_v1 check (
    ordinal between 1 and 128
    and target_ordinal between 1 and 500
  )
);

create table private.authoring_experiment_invariants (
  experiment_id uuid not null,
  protocol_revision integer not null,
  invariant_id text not null,
  ordinal integer not null,
  invariant_kind text not null,
  label text not null,
  primary key(experiment_id, protocol_revision, invariant_id),
  unique(experiment_id, protocol_revision, ordinal),
  foreign key(experiment_id, protocol_revision)
    references private.authoring_experiment_protocol_revisions(
      experiment_id, protocol_revision
    ) on delete restrict,
  constraint authoring_experiment_invariants_shape_v1 check (
    invariant_id ~ '^[a-z][a-z0-9._:-]{0,119}$'
    and ordinal between 1 and 64
    and invariant_kind in ('sources', 'targets', 'analysis', 'structure')
    and nullif(btrim(label), '') is not null
    and char_length(label) <= 240
  )
);

create table private.authoring_experiment_instruments (
  experiment_id uuid not null,
  protocol_revision integer not null,
  instrument_id text not null,
  instrument_version text not null,
  ordinal integer not null,
  reference_role text not null,
  purpose text not null,
  primary key(
    experiment_id, protocol_revision, reference_role,
    instrument_id, instrument_version
  ),
  unique(experiment_id, protocol_revision, reference_role, ordinal),
  foreign key(experiment_id, protocol_revision)
    references private.authoring_experiment_protocol_revisions(
      experiment_id, protocol_revision
    ) on delete restrict,
  foreign key(instrument_id, instrument_version)
    references private.authoring_research_instrument_definitions(
      instrument_id, instrument_version
    ) on delete restrict,
  constraint authoring_experiment_instruments_shape_v1 check (
    nullif(btrim(instrument_id), '') is not null
    and char_length(instrument_id) <= 240
    and instrument_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
    and ordinal between 1 and 32
    and reference_role in ('instrument', 'outcome')
    and nullif(btrim(purpose), '') is not null
    and char_length(purpose) <= 1000
  )
);

create table private.authoring_experiment_base_revisions (
  id uuid primary key default extensions.gen_random_uuid(),
  experiment_id uuid not null,
  protocol_revision integer not null,
  workspace_id uuid not null,
  workspace_revision bigint not null,
  scope_kind text not null,
  scope_ref text not null,
  scope_path text[] not null,
  scope_entity_version bigint not null,
  workspace_course_id text not null,
  -- Proveniência histórica: o curso privado pode desaparecer com a conta
  -- dona; UUID + artifact_hash imutável preservam a base sem bloquear GDPR.
  publication_course_id uuid not null,
  artifact_hash text not null
    references private.artifact_refs(hash) on delete restrict,
  content_hash text not null,
  validated_by uuid references auth.users(id) on delete set null,
  validated_at timestamptz not null default now(),
  unique(experiment_id, protocol_revision),
  unique(id, experiment_id),
  foreign key(experiment_id, protocol_revision)
    references private.authoring_experiment_protocol_revisions(
      experiment_id, protocol_revision
    ) on delete restrict,
  foreign key(experiment_id, workspace_id)
    references private.authoring_experiments(id, workspace_id) on delete restrict,
  constraint authoring_experiment_base_revision_shape_v1 check (
    workspace_revision > 0
    and scope_kind in ('course', 'lesson', 'microsequence')
    and cardinality(scope_path) = case scope_kind
      when 'course' then 1 when 'lesson' then 3 else 4 end
    and scope_path[cardinality(scope_path)] = scope_ref
    and scope_path[1] = workspace_course_id
    and scope_entity_version > 0
    and artifact_hash ~ '^[a-f0-9]{64}$'
    and content_hash = artifact_hash
  )
);

create table private.authoring_experiment_base_microsequences (
  base_revision_id uuid not null
    references private.authoring_experiment_base_revisions(id) on delete restrict,
  ordinal integer not null,
  microsequence_ref text not null,
  scope_path text[] not null,
  scope_entity_version bigint not null,
  audit_run_id uuid not null
    references private.authoring_audit_runs(id) on delete restrict,
  content_hash text not null,
  design_refs jsonb not null,
  resource_set_refs jsonb not null,
  primary key(base_revision_id, microsequence_ref),
  unique(base_revision_id, ordinal),
  constraint authoring_experiment_base_microsequences_shape_v1 check (
    ordinal between 1 and 500
    and cardinality(scope_path) = 4
    and scope_path[4] = microsequence_ref
    and scope_entity_version > 0
    and content_hash ~ '^[a-f0-9]{64}$'
    and jsonb_typeof(design_refs) = 'object'
    and pg_column_size(design_refs) <= 32768
    and jsonb_typeof(resource_set_refs) = 'array'
    and jsonb_array_length(resource_set_refs) <= 128
  )
);

create table private.authoring_experiment_base_invariants (
  base_revision_id uuid not null
    references private.authoring_experiment_base_revisions(id) on delete restrict,
  invariant_id text not null,
  invariant_kind text not null,
  label text not null,
  status text not null default 'resolved',
  resolved_refs jsonb not null,
  resolution_hash text not null,
  primary key(base_revision_id, invariant_id),
  constraint authoring_experiment_base_invariants_shape_v1 check (
    invariant_kind in ('sources', 'targets', 'analysis', 'structure')
    and nullif(btrim(label), '') is not null
    and char_length(label) <= 240
    and status = 'resolved'
    and jsonb_typeof(resolved_refs) in ('object', 'array')
    and pg_column_size(resolved_refs) <= 1048576
    and resolution_hash ~ '^[a-f0-9]{64}$'
    and not private.authoring_design_contains_forbidden_key_v1(resolved_refs)
  )
);

alter table private.authoring_experiments
  add constraint authoring_experiments_current_base_v1 foreign key(
    current_base_revision_id, id
  ) references private.authoring_experiment_base_revisions(id, experiment_id)
    deferrable initially deferred;

create table private.authoring_experiment_variants (
  id uuid primary key default extensions.gen_random_uuid(),
  experiment_id uuid not null,
  protocol_revision integer not null,
  condition_id text not null,
  ordinal integer not null,
  current_variant_revision_id uuid,
  created_at timestamptz not null default now(),
  unique(experiment_id, protocol_revision, condition_id),
  unique(id, experiment_id),
  unique(id, experiment_id, protocol_revision, condition_id),
  foreign key(experiment_id, protocol_revision, condition_id)
    references private.authoring_experiment_conditions(
      experiment_id, protocol_revision, condition_id
    ) on delete restrict,
  constraint authoring_experiment_variants_ordinal_v1 check (
    ordinal between 1 and 32
  )
);

create table private.authoring_experiment_variant_revisions (
  id uuid primary key default extensions.gen_random_uuid(),
  variant_id uuid not null,
  experiment_id uuid not null,
  protocol_revision integer not null,
  condition_id text not null,
  variant_revision integer not null,
  base_revision_id uuid not null,
  child_workspace_id uuid not null
    references private.authoring_workspaces(id) on delete restrict,
  workspace_course_id text not null,
  publication_course_id uuid not null references public.courses(id) on delete restrict,
  initial_workspace_revision bigint not null,
  materialization_mandate_id text not null,
  materialization_mandate_revision bigint not null,
  evidence_mandate_id text,
  evidence_mandate_revision bigint,
  evidence_workspace_revision bigint,
  initial_artifact_hash text not null
    references private.artifact_refs(hash) on delete restrict,
  initial_content_hash text not null,
  final_artifact_hash text
    references private.artifact_refs(hash) on delete restrict,
  final_content_hash text,
  status text not null default 'generating',
  participant_continuity text not null,
  scope_map jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  evidence_recorded_at timestamptz,
  unique(variant_id, variant_revision),
  unique(id, experiment_id),
  unique(id, experiment_id, protocol_revision, condition_id),
  unique(id, publication_course_id),
  unique(child_workspace_id),
  unique(publication_course_id),
  foreign key(variant_id, experiment_id, protocol_revision, condition_id)
    references private.authoring_experiment_variants(
      id, experiment_id, protocol_revision, condition_id
    )
      on delete restrict,
  foreign key(base_revision_id, experiment_id)
    references private.authoring_experiment_base_revisions(id, experiment_id)
      on delete restrict,
  constraint authoring_experiment_variant_revisions_shape_v1 check (
    variant_revision > 0
    and initial_workspace_revision > 0
    and nullif(btrim(materialization_mandate_id), '') is not null
    and char_length(materialization_mandate_id) <= 240
    and materialization_mandate_revision > 0
    and materialization_mandate_revision <= initial_workspace_revision
    and ((evidence_mandate_id is null) =
      (evidence_mandate_revision is null))
    and (
      evidence_mandate_id is null
      or (
        nullif(btrim(evidence_mandate_id), '') is not null
        and char_length(evidence_mandate_id) <= 240
        and evidence_mandate_revision > 0
      )
    )
    and (
      evidence_workspace_revision is null
      or evidence_workspace_revision >= initial_workspace_revision
    )
    and initial_artifact_hash ~ '^[a-f0-9]{64}$'
    and initial_content_hash = initial_artifact_hash
    and ((final_artifact_hash is null) = (final_content_hash is null))
    and (final_artifact_hash is null or (
      final_artifact_hash ~ '^[a-f0-9]{64}$'
      and final_content_hash = final_artifact_hash
    ))
    and status in ('generating', 'ready', 'frozen', 'invalidated')
    and participant_continuity in ('not_applicable', 'retain_existing')
    and jsonb_typeof(scope_map) = 'object'
    and pg_column_size(scope_map) <= 65536
    and not private.authoring_design_contains_forbidden_key_v1(scope_map)
    and ((evidence_recorded_at is null) = (evidence_workspace_revision is null))
    and ((evidence_recorded_at is null) = (final_artifact_hash is null))
  )
);

alter table private.authoring_experiment_variants
  add constraint authoring_experiment_variants_current_revision_v1 foreign key(
    current_variant_revision_id, experiment_id
  ) references private.authoring_experiment_variant_revisions(id, experiment_id)
    deferrable initially deferred;

create table private.authoring_experiment_variant_parameter_locks (
  variant_revision_id uuid not null
    references private.authoring_experiment_variant_revisions(id) on delete restrict,
  factor_id text not null,
  target_ordinal integer not null,
  assignment_id text not null,
  assignment_version text not null,
  authority_ref text not null,
  primary key(variant_revision_id, factor_id, target_ordinal),
  unique(variant_revision_id, assignment_id, assignment_version),
  constraint authoring_experiment_variant_locks_shape_v1 check (
    target_ordinal between 1 and 500
    and nullif(btrim(assignment_id), '') is not null
    and char_length(assignment_id) <= 240
    and assignment_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
    and authority_ref ~ '^experiment:[0-9a-f-]{36}/protocol:[1-9][0-9]*/condition:[a-z][a-z0-9._:-]{0,119}$'
  )
);

-- A autorização de package é materializada por target. Isso evita que dois
-- fatores ResourceSet no mesmo protocolo virem uma união permissiva e também
-- conserva, quando não há fator de disponibilidade, os ResourceSets pinados
-- pela invariante da base.
create table private.authoring_experiment_variant_allowed_resource_sets (
  variant_revision_id uuid not null
    references private.authoring_experiment_variant_revisions(id) on delete restrict,
  source_kind text not null,
  source_ref text not null,
  target_ordinal integer not null,
  scope_kind text not null,
  scope_ref text not null,
  scope_path text[] not null,
  workspace_id uuid not null,
  resource_set_id text not null,
  resource_set_version text not null,
  primary key(
    variant_revision_id, source_kind, source_ref, target_ordinal,
    resource_set_id, resource_set_version
  ),
  foreign key(workspace_id, resource_set_id, resource_set_version)
    references private.authoring_resource_sets(
      workspace_id, resource_set_id, resource_set_version
    ) on delete restrict,
  constraint authoring_experiment_variant_allowed_sets_shape_v1 check (
    source_kind in ('factor', 'base_invariant')
    and nullif(btrim(source_ref), '') is not null
    and char_length(source_ref) <= 240
    and target_ordinal between 1 and 500
    and scope_kind in ('course', 'lesson', 'microsequence')
    and cardinality(scope_path) = case scope_kind
      when 'course' then 1 when 'lesson' then 3 else 4 end
    and scope_path[cardinality(scope_path)] = scope_ref
  )
);

create table private.authoring_experiment_variant_microsequences (
  variant_revision_id uuid not null
    references private.authoring_experiment_variant_revisions(id) on delete restrict,
  ordinal integer not null,
  microsequence_ref text not null,
  scope_path text[] not null,
  scope_entity_version bigint not null,
  audit_run_id uuid not null
    references private.authoring_audit_runs(id) on delete restrict,
  content_hash text not null,
  design_refs jsonb not null,
  resource_set_refs jsonb not null,
  primary key(variant_revision_id, microsequence_ref),
  unique(variant_revision_id, ordinal),
  constraint authoring_experiment_variant_microsequences_shape_v1 check (
    ordinal between 1 and 500
    and cardinality(scope_path) = 4
    and scope_path[4] = microsequence_ref
    and scope_entity_version > 0
    and content_hash ~ '^[a-f0-9]{64}$'
    and jsonb_typeof(design_refs) = 'object'
    and pg_column_size(design_refs) <= 32768
    and jsonb_typeof(resource_set_refs) = 'array'
    and jsonb_array_length(resource_set_refs) <= 128
  )
);

create table private.authoring_experiment_difference_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  experiment_id uuid not null,
  baseline_kind text not null,
  base_revision_id uuid,
  baseline_variant_revision_id uuid,
  candidate_variant_revision_id uuid not null,
  algorithm_id text not null,
  algorithm_version text not null,
  baseline_artifact_hash text not null
    references private.artifact_refs(hash) on delete restrict,
  variant_artifact_hash text not null
    references private.artifact_refs(hash) on delete restrict,
  factual_hash text not null,
  hunk_count integer not null,
  page_count integer not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique nulls not distinct(
    candidate_variant_revision_id, baseline_kind,
    base_revision_id, baseline_variant_revision_id
  ),
  unique(id, experiment_id),
  foreign key(candidate_variant_revision_id, experiment_id)
    references private.authoring_experiment_variant_revisions(id, experiment_id)
      on delete restrict,
  foreign key(base_revision_id, experiment_id)
    references private.authoring_experiment_base_revisions(id, experiment_id)
      on delete restrict,
  foreign key(baseline_variant_revision_id, experiment_id)
    references private.authoring_experiment_variant_revisions(id, experiment_id)
      on delete restrict,
  constraint authoring_experiment_difference_runs_shape_v1 check (
    baseline_kind in ('base', 'variant_revision')
    and ((baseline_kind = 'base') = (base_revision_id is not null))
    and ((baseline_kind = 'variant_revision') =
      (baseline_variant_revision_id is not null))
    and not (
      baseline_kind = 'variant_revision'
      and baseline_variant_revision_id = candidate_variant_revision_id
    )
    and nullif(btrim(algorithm_id), '') is not null
    and char_length(algorithm_id) <= 160
    and algorithm_version ~ '^[A-Za-z0-9][A-Za-z0-9._@-]{0,79}$'
    and baseline_artifact_hash ~ '^[a-f0-9]{64}$'
    and variant_artifact_hash ~ '^[a-f0-9]{64}$'
    and factual_hash ~ '^[a-f0-9]{64}$'
    and hunk_count between 0 and 5000
    and page_count = greatest(1, ((hunk_count + 19) / 20))
  )
);

create table private.authoring_experiment_difference_hunks (
  difference_run_id uuid not null
    references private.authoring_experiment_difference_runs(id) on delete restrict,
  difference_ref_id text not null,
  hunk_id text not null,
  hunk_hash text not null,
  ordinal integer not null,
  path text[] not null,
  change_kind text not null,
  factual_summary text not null,
  before_hash text,
  after_hash text,
  evidence_refs text[] not null default '{}',
  primary key(difference_run_id, hunk_id),
  unique(difference_run_id, difference_ref_id),
  unique(difference_run_id, hunk_hash),
  unique(difference_run_id, ordinal),
  constraint authoring_experiment_difference_hunks_shape_v1 check (
    hunk_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/~-]*$'
    and char_length(hunk_id) <= 500
    and difference_ref_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
    and hunk_hash ~ '^[a-f0-9]{64}$'
    and ordinal between 1 and 5000
    and cardinality(path) between 1 and 16
    and change_kind in ('added', 'removed', 'changed', 'moved')
    and nullif(btrim(factual_summary), '') is not null
    and char_length(factual_summary) <= 1000
    and (before_hash is null or before_hash ~ '^[a-f0-9]{64}$')
    and (after_hash is null or after_hash ~ '^[a-f0-9]{64}$')
    and cardinality(evidence_refs) <= 32
  )
);

create table private.authoring_experiment_difference_pages (
  difference_run_id uuid not null
    references private.authoring_experiment_difference_runs(id) on delete restrict,
  page_ordinal integer not null,
  page_hash text not null,
  item_count integer not null,
  recorded_at timestamptz not null default now(),
  primary key(difference_run_id, page_ordinal),
  constraint authoring_experiment_difference_pages_shape_v1 check (
    page_ordinal between 1 and 250
    and page_hash ~ '^[a-f0-9]{64}$'
    and item_count between 0 and 20
  )
);

create function private.authoring_experiment_difference_progress_v1(
  p_candidate_variant_revision_id uuid,
  p_baseline_kind text,
  p_baseline_ref uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_run private.authoring_experiment_difference_runs%rowtype;
  v_recorded integer;
  v_first_missing integer;
begin
  select * into v_run
  from private.authoring_experiment_difference_runs run
  where run.candidate_variant_revision_id=p_candidate_variant_revision_id
    and run.baseline_kind=p_baseline_kind
    and (
      (p_baseline_kind='base' and run.base_revision_id=p_baseline_ref)
      or (p_baseline_kind='variant_revision'
        and run.baseline_variant_revision_id=p_baseline_ref)
    );
  if not found then
    return jsonb_build_object(
      'differenceRunRef',null,
      'firstMissingPageOrdinal',1,
      'recordedCount',0,
      'expectedCount',null,
      'pageCount',null,
      'complete',false
    );
  end if;
  select count(*) into v_recorded
  from private.authoring_experiment_difference_hunks hunk
  where hunk.difference_run_id=v_run.id;
  select min(missing.page_ordinal) into v_first_missing
  from generate_series(1,v_run.page_count) missing(page_ordinal)
  where not exists (
    select 1 from private.authoring_experiment_difference_pages page
    where page.difference_run_id=v_run.id
      and page.page_ordinal=missing.page_ordinal
  );
  return jsonb_build_object(
    'differenceRunRef',jsonb_build_object(
      'id',v_run.id,'version',v_run.factual_hash
    ),
    'firstMissingPageOrdinal',v_first_missing,
    'recordedCount',v_recorded,
    'expectedCount',v_run.hunk_count,
    'pageCount',v_run.page_count,
    'complete',v_recorded=v_run.hunk_count and v_first_missing is null
  );
end;
$function$;

create table private.authoring_experiment_diff_classifications (
  id uuid primary key default extensions.gen_random_uuid(),
  experiment_id uuid not null,
  difference_run_id uuid not null,
  hunk_id text not null,
  classification text not null,
  public_evidence text not null,
  evidence_refs text[] not null default '{}',
  experiment_revision bigint not null,
  classified_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(difference_run_id, hunk_id),
  foreign key(difference_run_id, experiment_id)
    references private.authoring_experiment_difference_runs(id, experiment_id)
      on delete restrict,
  foreign key(difference_run_id, hunk_id)
    references private.authoring_experiment_difference_hunks(
      difference_run_id, hunk_id
    ) on delete restrict,
  constraint authoring_experiment_diff_classifications_shape_v1 check (
    classification in (
      'directly_required', 'inevitable_derived', 'accidental_unplanned'
    )
    and nullif(btrim(public_evidence), '') is not null
    and char_length(public_evidence) <= 2000
    and cardinality(evidence_refs) <= 32
    and experiment_revision > 0
  )
);

create table private.authoring_experiment_difference_decisions (
  id uuid primary key default extensions.gen_random_uuid(),
  experiment_id uuid not null,
  difference_run_id uuid not null,
  hunk_id text not null,
  decision text not null,
  rationale text not null,
  participant_continuity text,
  experiment_revision bigint not null,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz not null default now(),
  unique(difference_run_id, hunk_id),
  foreign key(difference_run_id, experiment_id)
    references private.authoring_experiment_difference_runs(id, experiment_id)
      on delete restrict,
  foreign key(difference_run_id, hunk_id)
    references private.authoring_experiment_difference_hunks(
      difference_run_id, hunk_id
    ) on delete restrict,
  constraint authoring_experiment_difference_decisions_shape_v1 check (
    decision in ('correct', 'accept', 'invalidate')
    and nullif(btrim(rationale), '') is not null
    and char_length(rationale) <= 2000
    and (
      participant_continuity is null
      or (decision = 'correct' and participant_continuity = 'retain_existing')
    )
    and experiment_revision > 0
  )
);

-- Uma revisão já congelada só é reparada por uma nova VariantRevision. O
-- pedido humano permanece append-only e registra a continuidade explícita;
-- assignments existentes continuam pinados à revisão anterior.
create table private.authoring_experiment_variant_corrections (
  id uuid primary key default extensions.gen_random_uuid(),
  experiment_id uuid not null,
  variant_revision_id uuid not null,
  experiment_revision bigint not null,
  reason text not null,
  participant_continuity text not null,
  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(variant_revision_id),
  foreign key(variant_revision_id,experiment_id)
    references private.authoring_experiment_variant_revisions(id,experiment_id)
      on delete restrict,
  constraint authoring_experiment_variant_corrections_shape_v1 check (
    experiment_revision > 0
    and nullif(btrim(reason),'') is not null
    and char_length(reason) <= 2000
    and participant_continuity = 'retain_existing'
  )
);

create table private.authoring_experiment_variant_freezes (
  variant_revision_id uuid primary key
    references private.authoring_experiment_variant_revisions(id) on delete restrict,
  experiment_id uuid not null,
  experiment_revision bigint not null,
  artifact_hash text not null
    references private.artifact_refs(hash) on delete restrict,
  workspace_revision bigint not null,
  frozen_by uuid references auth.users(id) on delete set null,
  frozen_at timestamptz not null default now(),
  foreign key(variant_revision_id, experiment_id)
    references private.authoring_experiment_variant_revisions(id, experiment_id)
      on delete restrict,
  constraint authoring_experiment_variant_freezes_shape_v1 check (
    experiment_revision > 0 and workspace_revision > 0
    and artifact_hash ~ '^[a-f0-9]{64}$'
  )
);

create table private.authoring_experiment_enrollment_codes (
  id uuid primary key default extensions.gen_random_uuid(),
  experiment_id uuid not null
    references private.authoring_experiments(id) on delete restrict,
  protocol_revision integer not null,
  code_hash text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  invalidated_at timestamptz,
  foreign key(experiment_id, protocol_revision)
    references private.authoring_experiment_protocol_revisions(
      experiment_id, protocol_revision
    ) on delete restrict,
  constraint authoring_experiment_enrollment_codes_shape_v1 check (
    code_hash ~ '^[a-f0-9]{64}$'
    and expires_at > created_at
    and ((active and invalidated_at is null) or (not active))
  )
);

create table private.authoring_experiment_enrollments (
  id uuid primary key default extensions.gen_random_uuid(),
  experiment_id uuid not null
    references private.authoring_experiments(id) on delete restrict,
  protocol_revision integer not null,
  participant_ref text not null,
  user_id uuid references auth.users(id) on delete set null,
  consent_policy_ref text not null,
  consent_revision text not null,
  accepted_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  status text not null default 'enrolled',
  unique(experiment_id, participant_ref),
  unique(id, experiment_id, protocol_revision, participant_ref),
  foreign key(experiment_id, protocol_revision)
    references private.authoring_experiment_protocol_revisions(
      experiment_id, protocol_revision
    ) on delete restrict,
  constraint authoring_experiment_enrollments_participant_v1 check (
    participant_ref ~ '^participant:[0-9a-f-]{36}$'
    and nullif(btrim(consent_policy_ref), '') is not null
    and char_length(consent_policy_ref) <= 240
    and consent_revision ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
    and status in ('enrolled', 'withdrawn')
  )
);

create unique index authoring_experiment_enrollments_user_v1_uidx
  on private.authoring_experiment_enrollments(experiment_id, user_id)
  where user_id is not null;

create table private.authoring_experiment_assignments (
  id uuid primary key default extensions.gen_random_uuid(),
  experiment_id uuid not null,
  enrollment_id uuid not null,
  participant_ref text not null,
  protocol_revision integer not null,
  condition_id text not null,
  variant_revision_id uuid not null,
  publication_course_id uuid not null references public.courses(id) on delete restrict,
  selection_ref uuid not null,
  selection_id uuid references public.user_course_selections(id) on delete set null,
  assignment_kind text not null,
  algorithm_version text not null,
  assignment_proof text not null,
  experiment_revision bigint not null,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  unique(experiment_id, enrollment_id),
  unique(experiment_id, participant_ref),
  unique(selection_id),
  unique(selection_ref),
  foreign key(
    enrollment_id, experiment_id, protocol_revision, participant_ref
  )
    references private.authoring_experiment_enrollments(
      id, experiment_id, protocol_revision, participant_ref
    ) on delete restrict,
  foreign key(
    variant_revision_id, experiment_id, protocol_revision, condition_id
  ) references private.authoring_experiment_variant_revisions(
    id, experiment_id, protocol_revision, condition_id
  )
      on delete restrict,
  foreign key(variant_revision_id, publication_course_id)
    references private.authoring_experiment_variant_revisions(
      id, publication_course_id
    ) on delete restrict,
  constraint authoring_experiment_assignments_shape_v1 check (
    participant_ref ~ '^participant:[0-9a-f-]{36}$'
    and condition_id ~ '^[a-z][a-z0-9._:-]{0,119}$'
    and assignment_kind in ('manual', 'seeded_random', 'balanced_simple')
    and algorithm_version ~ '^[A-Za-z0-9][A-Za-z0-9._@-]{0,79}$'
    and assignment_proof ~ '^[a-f0-9]{64}$'
    and experiment_revision > 0
  )
);

create table private.authoring_experiment_requests (
  actor_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null,
  workspace_id uuid not null,
  experiment_id uuid,
  operation text not null,
  payload_hash text not null,
  argument_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  primary key(actor_id, request_id),
  constraint authoring_experiment_requests_shape_v1 check (
    request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
    and operation in (
      'save_protocol', 'validate', 'generate_variants',
      'prepare_variant_evidence', 'register_variant_evidence',
      'classify_difference',
      'decide_difference', 'request_correction', 'freeze', 'start_collection',
      'rotate_enrollment_code', 'transition_collection',
      'assign_participant'
    )
    and payload_hash ~ '^[a-f0-9]{64}$'
    and argument_hash ~ '^[a-f0-9]{64}$'
    and jsonb_typeof(result) = 'object'
    and pg_column_size(result) <= 65536
    and expires_at > created_at
  )
);

create table private.authoring_experiment_participant_requests (
  actor_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null,
  operation text not null default 'enroll',
  payload_hash text not null,
  argument_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  primary key(actor_id, request_id),
  constraint authoring_experiment_participant_requests_shape_v1 check (
    request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
    and operation in ('enroll', 'withdraw')
    and payload_hash ~ '^[a-f0-9]{64}$'
    and argument_hash ~ '^[a-f0-9]{64}$'
    and jsonb_typeof(result) = 'object'
    and pg_column_size(result) <= 32768
    and expires_at > created_at
  )
);

alter table private.authoring_experiment_enrollments
  add constraint authoring_experiment_enrollments_consent_v1 foreign key(
    consent_policy_ref, consent_revision
  ) references private.authoring_research_consent_policy_definitions(
    policy_id, policy_version
  ) on delete restrict;

-- Nenhum chamador pode forjar a autoridade do protocolo com um GUC. O token
-- existe somente numa linha privada, pela duração da transação que cria a
-- VariantRevision correspondente.
create table private.authoring_experiment_lock_write_tokens (
  transaction_id bigint not null,
  variant_revision_id uuid not null,
  child_workspace_id uuid not null,
  assignment_id text not null,
  authority_ref text not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(transaction_id, variant_revision_id, assignment_id),
  foreign key(variant_revision_id)
    references private.authoring_experiment_variant_revisions(id)
      on delete cascade,
  foreign key(child_workspace_id)
    references private.authoring_workspaces(id) on delete cascade,
  constraint authoring_experiment_lock_tokens_shape_v1 check (
    nullif(btrim(assignment_id), '') is not null
    and char_length(assignment_id) <= 240
    and authority_ref ~ '^experiment:[0-9a-f-]{36}/protocol:[1-9][0-9]*/condition:[a-z][a-z0-9._:-]{0,119}$'
  )
);

-- A seleção participante é autoridade de acesso, não uma preferência comum
-- de Trilhas. Tokens privados e transacionais fecham INSERT/DELETE inclusive
-- contra escrita RLS direta e contra os fluxos genéricos de sync.
create table private.authoring_experiment_selection_write_tokens (
  transaction_id bigint not null,
  operation text not null,
  selection_id uuid not null,
  user_id uuid not null,
  course_id uuid not null,
  enrollment_id uuid not null,
  assignment_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  primary key(transaction_id, operation, selection_id),
  constraint authoring_experiment_selection_tokens_operation_v1 check (
    operation in ('assign','withdraw','account_delete')
    and ((operation='assign')=(assignment_id is null))
  )
);

revoke all on table private.authoring_experiment_lock_write_tokens
  from public, anon, authenticated;
revoke all on table private.authoring_experiment_selection_write_tokens
  from public, anon, authenticated;

create function private.guard_authoring_experiment_selection_write_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_course public.courses%rowtype;
begin
  if tg_op = 'UPDATE' then
    if (new.id,new.user_id,new.course_id) is distinct from
       (old.id,old.user_id,old.course_id)
       and (
         exists(select 1 from public.courses course
           where course.id in (old.course_id,new.course_id)
             and (course.experiment_variant or course.experiment_base))
         or exists(select 1
           from private.authoring_experiment_assignments assignment
           where assignment.selection_id=old.id)
       ) then
      raise exception 'A identidade da seleção experimental é imutável.'
        using errcode='42501';
    end if;
    return new;
  end if;

  select * into v_course from public.courses course
  where course.id=case when tg_op='INSERT' then new.course_id else old.course_id end;
  if tg_op = 'INSERT' then
    if v_course.experiment_variant then
      if not exists (
        select 1
        from private.authoring_experiment_selection_write_tokens token
        join private.authoring_experiment_enrollments enrollment
          on enrollment.id=token.enrollment_id
         and enrollment.user_id=token.user_id
         and enrollment.status='enrolled'
        join private.authoring_experiment_variant_revisions revision
          on revision.publication_course_id=token.course_id
         and revision.experiment_id=enrollment.experiment_id
         and revision.protocol_revision=enrollment.protocol_revision
        join private.authoring_experiment_variants variant
          on variant.id=revision.variant_id
         and variant.current_variant_revision_id=revision.id
        join private.authoring_experiment_variant_freezes frozen
          on frozen.variant_revision_id=revision.id
        where token.transaction_id=txid_current()
          and token.operation='assign'
          and token.selection_id=new.id
          and token.user_id=new.user_id
          and token.course_id=new.course_id
      ) then
        if exists (
          select 1
          from private.authoring_experiment_variant_revisions revision
          where revision.publication_course_id=new.course_id
            and private.educational_workspace_can_v1(
              revision.child_workspace_id,new.user_id,'research'
            )
        ) then
          -- Grants/republicações legados tentam materializar acesso como
          -- seleção. O membro research já acessa pelo child; omita a row para
          -- não poluir Trilhas nem convertê-lo em participante.
          return null;
        end if;
        raise exception 'Seleção experimental só pode nascer da atribuição governada.'
          using errcode='42501';
      end if;
    elsif v_course.experiment_base then
      if exists (
        select 1
        from private.authoring_experiment_base_revisions base
        join private.authoring_experiments experiment
          on experiment.id=base.experiment_id
        where base.publication_course_id=new.course_id
          and private.educational_workspace_can_v1(
            experiment.workspace_id,new.user_id,'research'
          )
      ) then
        -- Membership research lê a base pelo workspace; nunca por Trilhas.
        return null;
      end if;
      raise exception 'Base experimental não pode ser selecionada.'
        using errcode='42501';
    elsif v_course.owner_id is null and not exists (
      select 1 from public.catalog_collection_courses placement
      where placement.course_id=v_course.id and placement.deleted_at is null
    ) then
      raise exception 'Curso sem placement ativo não pode ser selecionado do catálogo.'
        using errcode='42501';
    end if;
    return new;
  end if;

  if exists (
    select 1 from private.authoring_experiment_assignments assignment
    where assignment.selection_id=old.id
  ) and not exists (
    select 1
    from private.authoring_experiment_selection_write_tokens token
    join private.authoring_experiment_assignments assignment
      on assignment.id=token.assignment_id
     and assignment.enrollment_id=token.enrollment_id
     and assignment.selection_id=token.selection_id
    where token.transaction_id=txid_current()
      and token.operation in ('withdraw','account_delete')
      and token.selection_id=old.id
      and token.user_id=old.user_id
      and token.course_id=old.course_id
  ) then
    raise exception 'Seleção atribuída só pode ser revogada por withdrawal ou exclusão da conta.'
      using errcode='42501';
  end if;
  return old;
end;
$function$;

create trigger authoring_experiment_selection_write_guard_v1
before insert or update or delete on public.user_course_selections
for each row execute function
  private.guard_authoring_experiment_selection_write_v1();

-- Defense-in-depth: uma variante nunca vira candidata editorial nem placement
-- de catálogo, mesmo por RPC legado ou escrita SQL direta.
create function private.guard_authoring_experiment_catalog_promotion_v1()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $function$
declare
  v_source_course_id uuid;
  v_official_course_id uuid;
begin
  if tg_table_name='catalog_collection_courses' then
    v_source_course_id:=new.course_id;
  else
    v_source_course_id:=nullif(to_jsonb(new)->>'source_course_id','')::uuid;
    v_official_course_id:=nullif(to_jsonb(new)->>'official_course_id','')::uuid;
  end if;
  if exists (
    select 1 from public.courses course
    where (course.experiment_variant or course.experiment_base)
      and course.id in (v_source_course_id,v_official_course_id)
  ) then
    raise exception 'Curso experimental não pode ser promovido ao catálogo.'
      using errcode='42501';
  end if;
  return new;
end;
$function$;

create trigger authoring_experiment_catalog_placement_guard_v1
before insert or update on public.catalog_collection_courses
for each row execute function
  private.guard_authoring_experiment_catalog_promotion_v1();

create trigger authoring_experiment_catalog_review_guard_v1
before insert or update on private.catalog_review_submissions
for each row execute function
  private.guard_authoring_experiment_catalog_promotion_v1();

-- Membership autoral dá acesso pelo workspace, nunca por uma seleção de
-- participante. Os triggers legados de publicação continuam atendendo cursos
-- privados comuns, mas ignoram explicitamente variants.
create or replace function private.grant_workspace_publications_to_member_v1(
  p_workspace_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
begin
  insert into public.user_course_selections(user_id,course_id,position)
  select p_user_id,publication.course_id,coalesce((
    select max(selection.position)+1
    from public.user_course_selections selection
    where selection.user_id=p_user_id
  ),0)+row_number() over(order by publication.course_id)-1
  from private.authoring_workspace_publications publication
  join public.courses course on course.id=publication.course_id
  where publication.workspace_id=p_workspace_id
    and publication.target='private'
    and not (course.experiment_variant or course.experiment_base)
    and course.status='published' and course.deleted_at is null
    and course.document_storage_enabled
  on conflict(user_id,course_id) do nothing;

  insert into private.course_revision_sync_changes(
    user_id,scope,entity_id,operation,revision_hash
  )
  select distinct p_user_id,'private',publication.course_id,'upsert',
    publication.content_hash
  from private.authoring_workspace_publications publication
  join public.courses course on course.id=publication.course_id
  where publication.workspace_id=p_workspace_id
    and publication.target='private'
    and not (course.experiment_variant or course.experiment_base)
    and course.status='published' and course.deleted_at is null
    and course.document_storage_enabled;
end;
$function$;

create or replace function private.revoke_workspace_publications_from_member_v1(
  p_workspace_id uuid,
  p_user_id uuid,
  p_course_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
begin
  insert into private.course_revision_sync_changes(
    user_id,scope,entity_id,operation,revision_hash
  )
  select distinct p_user_id,'private',target.course_id,'delete',null
  from (
    select publication.course_id
    from private.authoring_workspace_publications publication
    where publication.workspace_id=p_workspace_id
      and publication.target='private'
    union select p_course_id where p_course_id is not null
  ) target
  join public.courses course on course.id=target.course_id
  where not (course.experiment_variant or course.experiment_base)
    and course.owner_id is distinct from p_user_id
    and not exists (
      select 1
      from private.authoring_workspace_publications other_publication
      join private.educational_workspace_members other_member
        on other_member.workspace_id=other_publication.workspace_id
       and other_member.user_id=p_user_id
      where other_publication.course_id=target.course_id
        and other_publication.target='private'
        and other_publication.workspace_id<>p_workspace_id
    );

  delete from public.user_course_selections selection
  using public.courses course
  where course.id=selection.course_id
    and not (course.experiment_variant or course.experiment_base)
    and course.owner_id is distinct from p_user_id
    and selection.user_id=p_user_id
    and selection.course_id in (
      select publication.course_id
      from private.authoring_workspace_publications publication
      where publication.workspace_id=p_workspace_id
        and publication.target='private'
      union select p_course_id where p_course_id is not null
    )
    and not exists (
      select 1
      from private.authoring_workspace_publications other_publication
      join private.educational_workspace_members other_member
        on other_member.workspace_id=other_publication.workspace_id
       and other_member.user_id=p_user_id
      where other_publication.course_id=selection.course_id
        and other_publication.target='private'
        and other_publication.workspace_id<>p_workspace_id
    );
end;
$function$;

-- Depois que o control plane relacional existe, a leitura comum distingue a
-- base experimental anonimizada de um curso oficial. Somente research no
-- workspace parent pode lê-la; participantes recebem apenas a variante.
create or replace function public.user_can_read_course(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $function$
  select auth.uid() is not null and exists (
    select 1
    from public.courses course
    where course.id=p_course_id
      and course.deleted_at is null
      and course.status='published'
      and (
        (
          not (course.experiment_variant or course.experiment_base)
          and (course.owner_id is null or course.owner_id=auth.uid())
        )
        or (
          course.experiment_variant
          and (
            course.owner_id=auth.uid()
            or exists (
              select 1 from public.user_course_selections selection
              where selection.course_id=course.id
                and selection.user_id=auth.uid()
            )
          )
        )
        or (
          course.experiment_base
          and exists (
            select 1
            from private.authoring_experiment_base_revisions base
            join private.authoring_experiments experiment
              on experiment.id=base.experiment_id
            where base.publication_course_id=course.id
              and private.educational_workspace_can_v1(
                experiment.workspace_id,auth.uid(),'research'
              )
          )
        )
      )
  )
$function$;

-- Publicação/reuse continuam usando as rotas canônicas, mas um child
-- experimental deriva autoridade da membership research e nunca exige/cria
-- uma seleção pessoal. A reescrita é condicionada porque ambientes focais
-- podem não instalar essas rotas legadas.
do $harden_experiment_variant_publication$
declare
  v_signature regprocedure;
  v_definition text;
  v_rewritten text;
begin
  foreach v_signature in array array[
    to_regprocedure(
      'public.publish_authoring_workspace_course_v5(uuid,uuid,text,text,bigint,text,text,uuid,text,uuid,uuid,jsonb,jsonb)'
    ),
    to_regprocedure(
      'public.reuse_unchanged_authoring_publication_v5(uuid,uuid,text,text,bigint,text,text,text,text,uuid,text,uuid)'
    )
  ] loop
    if v_signature is null then continue; end if;
    select pg_get_functiondef(v_signature) into v_definition;
    v_rewritten:=replace(
      v_definition,
      '(p_target = ''private'' AND course.owner_id = v_workspace.owner_id)',
      '(p_target = ''private'' AND (course.owner_id = v_workspace.owner_id OR (course.experiment_variant AND EXISTS (SELECT 1 FROM private.authoring_experiment_variant_revisions experiment_revision WHERE experiment_revision.child_workspace_id = p_workspace_id AND experiment_revision.publication_course_id = course.id) AND private.educational_workspace_can_v1(p_workspace_id,p_owner_id,''research'')) OR (course.experiment_base AND EXISTS (SELECT 1 FROM private.authoring_experiment_base_revisions experiment_base JOIN private.authoring_experiments experiment ON experiment.id=experiment_base.experiment_id WHERE experiment_base.publication_course_id=course.id AND experiment.workspace_id=p_workspace_id) AND private.educational_workspace_can_v1(p_workspace_id,p_owner_id,''research''))))'
    );
    if v_rewritten=v_definition then
      v_rewritten:=replace(
        v_definition,
        '(p_target = ''private'' and course.owner_id = v_workspace.owner_id)',
        '(p_target = ''private'' and (course.owner_id = v_workspace.owner_id or (course.experiment_variant and exists (select 1 from private.authoring_experiment_variant_revisions experiment_revision where experiment_revision.child_workspace_id = p_workspace_id and experiment_revision.publication_course_id = course.id) and private.educational_workspace_can_v1(p_workspace_id,p_owner_id,''research'')) or (course.experiment_base and exists (select 1 from private.authoring_experiment_base_revisions experiment_base join private.authoring_experiments experiment on experiment.id=experiment_base.experiment_id where experiment_base.publication_course_id=course.id and experiment.workspace_id=p_workspace_id) and private.educational_workspace_can_v1(p_workspace_id,p_owner_id,''research''))))'
      );
    end if;
    if v_rewritten=v_definition then
      raise exception 'Predicado private da publicação experimental não encontrado em %.',
        v_signature using errcode='55000';
    end if;
    v_definition:=v_rewritten;
    if v_signature::text like 'public.reuse_unchanged_authoring_publication_v5%' then
      v_rewritten:=regexp_replace(
        v_definition,
        'perform 1[[:space:]]+from public[.]user_course_selections selection[[:space:]]+where selection[.]user_id = p_owner_id[[:space:]]+and selection[.]course_id = v_publication[.]course_id[[:space:]]+for share;',
        'perform 1 where exists (select 1 from public.user_course_selections selection where selection.user_id=p_owner_id and selection.course_id=v_publication.course_id) or (exists (select 1 from private.authoring_experiment_variant_revisions experiment_revision where experiment_revision.child_workspace_id=p_workspace_id and experiment_revision.publication_course_id=v_publication.course_id) and private.educational_workspace_can_v1(p_workspace_id,p_owner_id,''research'')) or (exists (select 1 from private.authoring_experiment_base_revisions experiment_base join private.authoring_experiments experiment on experiment.id=experiment_base.experiment_id where experiment_base.publication_course_id=v_publication.course_id and experiment.workspace_id=p_workspace_id) and private.educational_workspace_can_v1(p_workspace_id,p_owner_id,''research''));',
        'i'
      );
      if v_rewritten=v_definition then
        raise exception 'Fence de seleção do reuse experimental não encontrado.'
          using errcode='55000';
      end if;
    end if;
    execute v_rewritten;
  end loop;
end;
$harden_experiment_variant_publication$;

create function private.authoring_experiment_hash_v1(p_value jsonb)
returns text
language sql
immutable
set search_path = pg_catalog, extensions
as $function$
  select encode(extensions.digest(
    convert_to(coalesce(p_value, 'null'::jsonb)::text, 'UTF8'),
    'sha256'
  ), 'hex')
$function$;

-- Política inicial operacional e conservadora. É um template de consentimento,
-- não uma alegação de conformidade ética ou jurídica; o protocolo sempre pina
-- esta versão exata e registra a retirada como direito contínuo.
with seeded_policy as (
  select
    'aralearn.consent.instructional_experiment.basic'::text as policy_id,
    '1.0.0'::text as policy_version,
    'Consentimento básico para experimento instrucional'::text as label,
    jsonb_build_object(
      'kind', 'informed_consent_template',
      'summary', 'Participação voluntária em comparação de variantes instrucionais.',
      'dataUse', 'Somente os dados declarados no protocolo versionado podem ser coletados.',
      'withdrawal', 'A pessoa pode retirar o consentimento; novas sincronizações e o acesso atribuído são revogados.',
      'offlineNotice', 'Conteúdo já baixado pode permanecer no dispositivo até a próxima política de limpeza local.',
      'governanceNotice', 'O responsável pelo estudo deve verificar a adequação ética e jurídica deste template ao contexto concreto.',
      'publicText', 'Participação voluntária em comparação de variantes instrucionais. Somente os dados declarados no protocolo versionado podem ser coletados. A pessoa pode retirar o consentimento; novas sincronizações e o acesso atribuído são revogados. Conteúdo já baixado pode permanecer no dispositivo até a próxima política de limpeza local. O responsável pelo estudo deve verificar a adequação ética e jurídica deste template ao contexto concreto.'
    ) as descriptor
)
insert into private.authoring_research_consent_policy_definitions(
  policy_id, policy_version, label, descriptor, descriptor_hash
)
select policy_id, policy_version, label, descriptor,
  private.authoring_experiment_hash_v1(descriptor)
from seeded_policy;

insert into private.authoring_research_consent_policy_availability(
  policy_id, policy_version, active
) values (
  'aralearn.consent.instructional_experiment.basic', '1.0.0', true
);

create function private.authoring_experiment_contains_sensitive_key_v1(
  p_value jsonb
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, private
as $function$
declare
  v_key text;
  v_child jsonb;
begin
  if jsonb_typeof(p_value) = 'object' then
    for v_key, v_child in select key, value from jsonb_each(p_value) loop
      if lower(v_key) in (
        'seed', 'secret', 'assignmentseed', 'assignmentsecret',
        'participantref', 'userid', 'email', 'roster', 'telemetry',
        'rawoutcomes', 'prompt', 'transcript', 'chainofthought', 'reasoning'
      ) or private.authoring_experiment_contains_sensitive_key_v1(v_child) then
        return true;
      end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'array' then
    for v_child in select value from jsonb_array_elements(p_value) loop
      if private.authoring_experiment_contains_sensitive_key_v1(v_child) then
        return true;
      end if;
    end loop;
  end if;
  return false;
end;
$function$;

create function private.begin_authoring_experiment_request_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_experiment_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_expected_experiment_revision bigint,
  p_expected_workspace_revision bigint,
  p_operation text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, auth, extensions
as $function$
declare
  v_request private.authoring_experiment_requests%rowtype;
  v_argument_hash text;
begin
  perform private.require_service_role();
  if p_actor_id is null or not exists (
       select 1 from auth.users account where account.id = p_actor_id
     )
     or p_workspace_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_payload_hash !~ '^[a-f0-9]{64}$'
     or p_expected_experiment_revision is null
     or p_expected_experiment_revision < 0
     or (
       p_expected_workspace_revision is not null
       and p_expected_workspace_revision < 1
     )
     or p_operation not in (
       'save_protocol', 'validate', 'generate_variants',
       'prepare_variant_evidence', 'register_variant_evidence',
       'classify_difference',
       'decide_difference', 'request_correction', 'freeze', 'start_collection',
       'rotate_enrollment_code', 'transition_collection',
       'assign_participant'
     )
     or jsonb_typeof(p_payload) <> 'object'
     or pg_column_size(p_payload) > 90000
     or private.authoring_design_contains_forbidden_key_v1(p_payload) then
    raise exception 'Comando experimental inválido.' using errcode = '22023';
  end if;
  v_argument_hash := private.authoring_experiment_hash_v1(jsonb_build_object(
    'workspaceId', p_workspace_id,
    'experimentId', p_experiment_id,
    'expectedExperimentRevision', p_expected_experiment_revision,
    'expectedWorkspaceRevision', p_expected_workspace_revision,
    'operation', p_operation,
    'payload', p_payload
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'authoring-experiment-request:' || p_actor_id::text || ':' || p_request_id,
    0
  ));
  delete from private.authoring_experiment_requests request
  where request.actor_id = p_actor_id
    and request.request_id = p_request_id
    and request.expires_at <= statement_timestamp();
  select * into v_request
  from private.authoring_experiment_requests request
  where request.actor_id = p_actor_id and request.request_id = p_request_id;
  if found then
    if v_request.workspace_id <> p_workspace_id
       or v_request.experiment_id is distinct from p_experiment_id
       or v_request.operation <> p_operation
       or v_request.payload_hash <> p_payload_hash
       or v_request.argument_hash <> v_argument_hash then
      raise exception 'requestId reutilizado com argumentos diferentes.'
        using errcode = '23505';
    end if;
    return jsonb_build_object(
      'replayed', true,
      'argumentHash', v_argument_hash,
      'result', v_request.result || jsonb_build_object('idempotent', true)
    );
  end if;
  return jsonb_build_object(
    'replayed', false,
    'argumentHash', v_argument_hash
  );
end;
$function$;

create function private.complete_authoring_experiment_request_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_experiment_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_operation text,
  p_argument_hash text,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_result jsonb;
begin
  if jsonb_typeof(p_result) <> 'object'
     or pg_column_size(p_result) > 60000 then
    raise exception 'Resultado experimental excede o orçamento.'
      using errcode = '54000';
  end if;
  v_result := p_result || jsonb_build_object('idempotent', false);
  insert into private.authoring_experiment_requests(
    actor_id, request_id, workspace_id, experiment_id, operation,
    payload_hash, argument_hash, result
  ) values (
    p_actor_id, p_request_id, p_workspace_id, p_experiment_id, p_operation,
    p_payload_hash, p_argument_hash, v_result
  );
  return v_result;
end;
$function$;

create function private.insert_authoring_experiment_protocol_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_experiment_id uuid,
  p_protocol_revision integer,
  p_protocol jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private, extensions
as $function$
declare
  v_protocol jsonb;
  v_assignment jsonb;
  v_scope_kind text;
  v_scope_ref text;
  v_scope_path text[];
  v_factor jsonb;
  v_target jsonb;
  v_target_path text[];
  v_condition jsonb;
  v_condition_value jsonb;
  v_parameter_value jsonb;
  v_vector jsonb;
  v_vector_entry jsonb;
  v_vector_hash text;
  v_value_hash text;
  v_level_id text;
  v_reference_id text;
  v_reference_version text;
  v_invariant_kind text;
  v_instrument jsonb;
  v_reference_role text;
  v_definition private.authoring_design_parameter_definitions%rowtype;
  v_resource_set private.authoring_resource_sets%rowtype;
  v_factor_count integer;
  v_seen_factor_count integer;
  v_insert_count integer;
  v_ordinal bigint;
  v_child_ordinal bigint;
  v_secret_hash text;
  v_secret_commitment text;
begin
  if p_protocol_revision < 1
     or not private.authoring_design_closed_object_v1(
       p_protocol,
       array[
         'title','hypothesis','baseRef','scope','factors','conditions',
         'invariants','assignment','consentPolicyRef','instrumentRefs',
         'outcomeRefs'
       ],
       array[
         'title','hypothesis','baseRef','scope','factors','conditions','invariants',
         'assignment','consentPolicyRef','instrumentRefs','outcomeRefs'
       ]
     )
     or nullif(btrim(p_protocol->>'title'), '') is null
     or p_protocol->>'title' <> btrim(p_protocol->>'title')
     or char_length(p_protocol->>'title') > 300
     or (
       p_protocol ? 'hypothesis' and (
         nullif(btrim(p_protocol->>'hypothesis'), '') is null
         or p_protocol->>'hypothesis' <> btrim(p_protocol->>'hypothesis')
         or char_length(p_protocol->>'hypothesis') > 2000
       )
     )
     or not private.authoring_design_closed_object_v1(
       p_protocol->'baseRef', array['id','version'], array['id','version']
     )
     or nullif(btrim(p_protocol#>>'{baseRef,id}'), '') is null
     or char_length(p_protocol#>>'{baseRef,id}') > 240
     or coalesce(p_protocol#>>'{baseRef,version}', '')
       !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
     or jsonb_typeof(p_protocol->'factors') <> 'array'
     or jsonb_array_length(p_protocol->'factors') not between 1 and 8
     or jsonb_typeof(p_protocol->'conditions') <> 'array'
     or jsonb_array_length(p_protocol->'conditions') not between 2 and 32
     or jsonb_typeof(p_protocol->'invariants') <> 'array'
     or jsonb_array_length(p_protocol->'invariants') <> 4
     or jsonb_typeof(p_protocol->'instrumentRefs') <> 'array'
     or jsonb_array_length(p_protocol->'instrumentRefs') > 32
     or jsonb_typeof(p_protocol->'outcomeRefs') <> 'array'
     or jsonb_array_length(p_protocol->'outcomeRefs') > 32
     or not private.authoring_design_closed_object_v1(
       p_protocol->'assignment',
       array['rule'], array['rule','seed']
     )
     or p_protocol#>>'{assignment,rule}' not in (
       'manual', 'seeded_random', 'balanced_simple'
     )
     or (
       p_protocol#>>'{assignment,rule}' = 'seeded_random'
       and (
         nullif(btrim(p_protocol#>>'{assignment,seed}'), '') is null
         or p_protocol#>>'{assignment,seed}' <>
           btrim(p_protocol#>>'{assignment,seed}')
         or char_length(p_protocol#>>'{assignment,seed}') > 512
       )
     )
     or (
       p_protocol#>>'{assignment,rule}' <> 'seeded_random'
       and p_protocol#>'{assignment,seed}' is not null
     )
     or not private.authoring_design_closed_object_v1(
       p_protocol->'consentPolicyRef',
       array['id','version'], array['id','version']
     )
     or pg_column_size(p_protocol) > 60000
     or octet_length(p_protocol::text) > 60000 then
    raise exception 'InstructionalExperimentProtocol@1 inválido.'
      using errcode = '22023';
  end if;

  if not private.authoring_design_closed_object_v1(
       p_protocol->'scope', array['kind','ref'], array['kind','ref']
     ) then
    raise exception 'Escopo experimental inválido.' using errcode = '22023';
  end if;
  v_scope_kind := p_protocol#>>'{scope,kind}';
  v_scope_ref := p_protocol#>>'{scope,ref}';
  if v_scope_kind not in ('course', 'lesson', 'microsequence') then
    raise exception 'Escopo experimental inválido.' using errcode = '22023';
  end if;
  v_scope_path := private.authoring_design_scope_path_v1(
    p_workspace_id, v_scope_kind, v_scope_ref
  );
  if v_scope_path is null then
    raise exception 'Alvo do protocolo não existe.' using errcode = 'P0002';
  end if;
  if not exists (
    select 1
    from private.authoring_research_consent_policy_definitions definition
    join private.authoring_research_consent_policy_availability availability
      using(policy_id, policy_version)
    where definition.policy_id = p_protocol#>>'{consentPolicyRef,id}'
      and definition.policy_version = p_protocol#>>'{consentPolicyRef,version}'
      and availability.active
  ) then
    raise exception 'Política de consentimento inexiste ou está inativa.'
      using errcode = '23503';
  end if;

  -- A representação pública/persistida nunca contém o seed. Targets, níveis e
  -- a política de freeze são dados derivados nas relações normalizadas.
  v_assignment := (p_protocol->'assignment') - 'seed';
  v_protocol := jsonb_set(p_protocol, '{assignment}', v_assignment);
  select jsonb_set(
    v_protocol,
    '{conditions}',
    coalesce(jsonb_agg(
      jsonb_set(condition.value, '{values}', (
        select coalesce(jsonb_agg(entry.value order by entry.value->>'factorId'), '[]'::jsonb)
        from jsonb_array_elements(condition.value->'values') entry(value)
      )) order by condition.value->>'conditionId'
    ), '[]'::jsonb)
  ) into v_protocol
  from jsonb_array_elements(v_protocol->'conditions') condition(value);
  select jsonb_set(v_protocol, '{factors}', coalesce(
    jsonb_agg(factor.value order by factor.value->>'factorId'), '[]'::jsonb
  )) into v_protocol
  from jsonb_array_elements(v_protocol->'factors') factor(value);
  select jsonb_set(v_protocol, '{invariants}', coalesce(
    jsonb_agg(to_jsonb(invariant.value #>> '{}') order by invariant.value #>> '{}'),
    '[]'::jsonb
  )) into v_protocol
  from jsonb_array_elements(v_protocol->'invariants') invariant(value);
  select jsonb_set(v_protocol, '{instrumentRefs}', coalesce(
    jsonb_agg(reference.value order by reference.value->>'id', reference.value->>'version'),
    '[]'::jsonb
  )) into v_protocol
  from jsonb_array_elements(v_protocol->'instrumentRefs') reference(value);
  select jsonb_set(v_protocol, '{outcomeRefs}', coalesce(
    jsonb_agg(reference.value order by reference.value->>'id', reference.value->>'version'),
    '[]'::jsonb
  )) into v_protocol
  from jsonb_array_elements(v_protocol->'outcomeRefs') reference(value);
  if private.authoring_design_contains_forbidden_key_v1(v_protocol)
     or private.authoring_experiment_contains_sensitive_key_v1(v_protocol)
     or octet_length(v_protocol::text) > 60000 then
    raise exception 'O protocolo sanitizado contém estado persistente proibido.'
      using errcode = '22023';
  end if;

  if p_protocol#>>'{assignment,rule}' = 'seeded_random' then
    v_secret_hash := encode(extensions.digest(
      convert_to(p_protocol#>>'{assignment,seed}','UTF8'),'sha256'
    ),'hex');
    v_secret_commitment := encode(extensions.digest(
      convert_to(
        'aralearn-experiment-assignment-secret@1' || chr(10)
          || v_secret_hash,
        'UTF8'
      ),
      'sha256'
    ),'hex');
  elsif p_protocol#>>'{assignment,rule}' = 'balanced_simple' then
    v_secret_hash := null;
    v_secret_commitment := null;
  else
    v_secret_hash := null;
    v_secret_commitment := null;
  end if;

  insert into private.authoring_experiment_protocol_revisions(
    experiment_id, protocol_revision, workspace_id, protocol_hash, protocol,
    assignment_kind, assignment_algorithm_version,
    assignment_secret_hash, assignment_secret_commitment,
    study_design, scope_kind, scope_ref, scope_path,
    consent_policy_ref, consent_revision, created_by
  ) values (
    p_experiment_id, p_protocol_revision, p_workspace_id,
    private.authoring_experiment_hash_v1(v_protocol), v_protocol,
    p_protocol#>>'{assignment,rule}',
    case p_protocol#>>'{assignment,rule}'
      when 'seeded_random' then 'sha256-first-64-modulo@1'
      when 'balanced_simple' then 'least-count-stable-condition-order@1'
      else 'manual@1' end,
    v_secret_hash, v_secret_commitment,
    'between_subjects',
    v_scope_kind, v_scope_ref, v_scope_path,
    p_protocol#>>'{consentPolicyRef,id}',
    p_protocol#>>'{consentPolicyRef,version}', p_actor_id
  );

  update private.authoring_experiments experiment
  set title = p_protocol->>'title'
  where experiment.id = p_experiment_id
    and experiment.workspace_id = p_workspace_id;

  v_factor_count := jsonb_array_length(p_protocol->'factors');
  for v_factor, v_ordinal in
    select value, ordinality
    from jsonb_array_elements(v_protocol->'factors') with ordinality
  loop
    if not private.authoring_design_closed_object_v1(
         v_factor,
         array['factorId','definitionRef','kind','targets'],
         array['factorId','definitionRef','kind','targets']
       )
       or v_factor->>'factorId' !~ '^[a-z][a-z0-9._:-]{0,119}$'
       or v_factor->>'kind' not in ('parameter', 'resource_set')
       or not private.authoring_design_closed_object_v1(
         v_factor->'definitionRef',
         array['id','version'], array['id','version']
       )
       or jsonb_typeof(v_factor->'targets') <> 'array'
       or jsonb_array_length(v_factor->'targets') not between 1 and 500 then
      raise exception 'Fator experimental inválido.' using errcode = '22023';
    end if;
    select * into v_definition
    from private.authoring_design_parameter_definitions definition
    where definition.parameter_id = v_factor#>>'{definitionRef,id}'
      and definition.parameter_version = v_factor#>>'{definitionRef,version}';
    if not found then
      raise exception 'Definição do fator inexistente.' using errcode = '23503';
    end if;
    if not (v_scope_kind = any(v_definition.supported_scopes))
       or ((v_factor->>'kind' = 'resource_set') is distinct from
         (v_definition.parameter_id = 'available_resource_set_refs')) then
      raise exception 'Tipo ou escopo do fator diverge da definição.'
        using errcode = '23514';
    end if;
    insert into private.authoring_experiment_factors(
      experiment_id, protocol_revision, factor_id, ordinal, label, factor_kind,
      parameter_id, parameter_version
    ) values (
      p_experiment_id, p_protocol_revision, v_factor->>'factorId', v_ordinal,
      v_definition.definition->>'label', v_factor->>'kind', v_definition.parameter_id,
      v_definition.parameter_version
    );
    for v_target, v_child_ordinal in
      select value, ordinality
      from jsonb_array_elements(v_factor->'targets') with ordinality
    loop
      if not private.authoring_design_closed_object_v1(
           v_target, array['kind','ref'], array['kind','ref']
         )
         or not (v_target->>'kind' = any(v_definition.supported_scopes)) then
        raise exception 'Target do fator não é suportado pela definição.'
          using errcode = '23514';
      end if;
      v_target_path := private.authoring_design_scope_path_v1(
        p_workspace_id, v_target->>'kind', v_target->>'ref'
      );
      if v_target_path is null
         or cardinality(v_target_path) < cardinality(v_scope_path)
         or v_target_path[1:cardinality(v_scope_path)] is distinct from
           v_scope_path then
        raise exception 'Target do fator está fora do escopo experimental.'
          using errcode = '23514';
      end if;
      insert into private.authoring_experiment_factor_targets(
        experiment_id, protocol_revision, factor_id, ordinal,
        scope_kind, scope_ref, scope_path
      ) values (
        p_experiment_id, p_protocol_revision, v_factor->>'factorId',
        v_child_ordinal, v_target->>'kind', v_target->>'ref', v_target_path
      );
    end loop;
  end loop;

  if exists (
    select 1
    from private.authoring_experiment_factors left_factor
    join private.authoring_experiment_factor_targets left_target
      on left_target.experiment_id = left_factor.experiment_id
     and left_target.protocol_revision = left_factor.protocol_revision
     and left_target.factor_id = left_factor.factor_id
    join private.authoring_experiment_factors right_factor
      on right_factor.experiment_id = left_factor.experiment_id
     and right_factor.protocol_revision = left_factor.protocol_revision
     and right_factor.parameter_id = left_factor.parameter_id
     and right_factor.parameter_version = left_factor.parameter_version
     and right_factor.factor_id > left_factor.factor_id
    join private.authoring_experiment_factor_targets right_target
      on right_target.experiment_id = right_factor.experiment_id
     and right_target.protocol_revision = right_factor.protocol_revision
     and right_target.factor_id = right_factor.factor_id
     and right_target.scope_kind = left_target.scope_kind
     and right_target.scope_ref = left_target.scope_ref
    where left_factor.experiment_id = p_experiment_id
      and left_factor.protocol_revision = p_protocol_revision
  ) then
    raise exception 'Dois fatores não podem controlar a mesma definição no mesmo target exato.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from private.authoring_experiment_factors left_factor
    join private.authoring_experiment_factor_targets left_target
      on left_target.experiment_id=left_factor.experiment_id
     and left_target.protocol_revision=left_factor.protocol_revision
     and left_target.factor_id=left_factor.factor_id
    join private.authoring_experiment_factors right_factor
      on right_factor.experiment_id=left_factor.experiment_id
     and right_factor.protocol_revision=left_factor.protocol_revision
     and right_factor.parameter_id='available_resource_set_refs'
     and right_factor.factor_id>left_factor.factor_id
    join private.authoring_experiment_factor_targets right_target
      on right_target.experiment_id=right_factor.experiment_id
     and right_target.protocol_revision=right_factor.protocol_revision
     and right_target.factor_id=right_factor.factor_id
    where left_factor.experiment_id=p_experiment_id
      and left_factor.protocol_revision=p_protocol_revision
      and left_factor.parameter_id='available_resource_set_refs'
      and (
        (cardinality(left_target.scope_path)<=cardinality(right_target.scope_path)
          and right_target.scope_path[1:cardinality(left_target.scope_path)]=
            left_target.scope_path)
        or
        (cardinality(right_target.scope_path)<=cardinality(left_target.scope_path)
          and left_target.scope_path[1:cardinality(right_target.scope_path)]=
            right_target.scope_path)
      )
  ) then
    raise exception 'Fatores ResourceSet distintos não podem ter targets ancestrais sobrepostos no V1.'
      using errcode='23514';
  end if;

  for v_condition, v_ordinal in
    select value, ordinality
    from jsonb_array_elements(v_protocol->'conditions') with ordinality
  loop
    if not private.authoring_design_closed_object_v1(
         v_condition,
         array['conditionId','label','values'],
         array['conditionId','label','values']
       )
       or v_condition->>'conditionId' !~ '^[a-z][a-z0-9._:-]{0,119}$'
       or nullif(btrim(v_condition->>'label'), '') is null
       or v_condition->>'label' <> btrim(v_condition->>'label')
       or char_length(v_condition->>'label') > 300
       or jsonb_typeof(v_condition->'values') <> 'array'
       or jsonb_array_length(v_condition->'values') <> v_factor_count then
      raise exception 'Condição experimental inválida.' using errcode = '22023';
    end if;
    v_vector := '[]'::jsonb;
    v_seen_factor_count := 0;
    for v_condition_value in
      select value from jsonb_array_elements(v_condition->'values')
    loop
      select definition.* into v_definition
      from private.authoring_experiment_factors factor
      join private.authoring_design_parameter_definitions definition
        on definition.parameter_id = factor.parameter_id
       and definition.parameter_version = factor.parameter_version
      where factor.experiment_id = p_experiment_id
        and factor.protocol_revision = p_protocol_revision
        and factor.factor_id = v_condition_value->>'factorId';
      if not found then
        raise exception 'Valor aponta para fator inexistente.' using errcode = '23503';
      end if;
      if v_definition.parameter_id = 'available_resource_set_refs' then
        if not private.authoring_design_closed_object_v1(
             v_condition_value,
             array['factorId','resourceSetRef'],
             array['factorId','resourceSetRef']
           ) or not private.authoring_design_closed_object_v1(
             v_condition_value->'resourceSetRef',
             array['id','version'], array['id','version']
           ) then
          raise exception 'Valor ResourceSet do fator é inválido.' using errcode = '22023';
        end if;
        v_reference_id := v_condition_value#>>'{resourceSetRef,id}';
        v_reference_version := v_condition_value#>>'{resourceSetRef,version}';
        select * into v_resource_set
        from private.authoring_resource_sets resource_set
        where resource_set.workspace_id = p_workspace_id
          and resource_set.resource_set_id = v_reference_id
          and resource_set.resource_set_version = v_reference_version;
        if not found
           or cardinality(v_resource_set.scope_path) < cardinality(v_scope_path)
           or v_resource_set.scope_path[1:cardinality(v_scope_path)] is distinct from
             v_scope_path
           or not exists (
             select 1
             from private.authoring_experiment_factor_targets target
             where target.experiment_id = p_experiment_id
               and target.protocol_revision = p_protocol_revision
               and target.factor_id = v_condition_value->>'factorId'
               and cardinality(target.scope_path) >=
                 cardinality(v_resource_set.scope_path)
               and target.scope_path[1:cardinality(v_resource_set.scope_path)] =
                 v_resource_set.scope_path
           ) then
          raise exception 'ResourceSet inexiste ou está fora do escopo experimental.'
            using errcode = '23503';
        end if;
        v_parameter_value := jsonb_build_object(
          'kind', 'set', 'values', jsonb_build_array(
            v_reference_id || '@' || v_reference_version
          )
        );
      else
        if not private.authoring_design_closed_object_v1(
             v_condition_value, array['factorId','value'], array['factorId','value']
           ) then
          raise exception 'Valor do fator é inválido.' using errcode = '22023';
        end if;
        v_parameter_value := v_condition_value->'value';
      end if;
      if not private.valid_authoring_parameter_value_v1(
           v_definition.parameter_id, v_definition.parameter_version,
           v_parameter_value
         ) then
        raise exception 'Valor do fator não satisfaz sua definição.' using errcode = '23514';
      end if;
      v_parameter_value := private.canonical_authoring_parameter_value_v1(
        v_parameter_value
      );
      v_value_hash := private.authoring_experiment_hash_v1(v_parameter_value);
      v_level_id := 'level_' || substring(v_value_hash from 1 for 24);
      insert into private.authoring_experiment_factor_levels(
        experiment_id, protocol_revision, factor_id, level_id, ordinal,
        label, value, value_hash
      )
      select p_experiment_id, p_protocol_revision,
        v_condition_value->>'factorId', v_level_id,
        1 + count(*)::integer,
        'Valor ' || substring(v_value_hash from 1 for 8),
        v_parameter_value, v_value_hash
      from private.authoring_experiment_factor_levels level
      where level.experiment_id = p_experiment_id
        and level.protocol_revision = p_protocol_revision
        and level.factor_id = v_condition_value->>'factorId'
      on conflict(experiment_id, protocol_revision, factor_id, level_id)
        do nothing;
      v_vector := v_vector || jsonb_build_array(jsonb_build_object(
        'factorId', v_condition_value->>'factorId',
        'levelId', v_level_id,
        'valueHash', v_value_hash
      ));
      v_seen_factor_count := v_seen_factor_count + 1;
    end loop;
    select jsonb_agg(entry.value order by entry.value->>'factorId') into v_vector
    from jsonb_array_elements(v_vector) entry(value);
    if v_seen_factor_count <> v_factor_count
       or (select count(distinct entry.value->>'factorId')
           from jsonb_array_elements(v_vector) entry(value)) <> v_factor_count then
      raise exception 'A condição deve escolher exatamente um valor por fator.'
        using errcode = '23514';
    end if;
    v_vector_hash := private.authoring_experiment_hash_v1(v_vector);
    insert into private.authoring_experiment_conditions(
      experiment_id, protocol_revision, condition_id, ordinal, label,
      vector_hash
    ) values (
      p_experiment_id, p_protocol_revision, v_condition->>'conditionId', v_ordinal,
      btrim(v_condition->>'label'), v_vector_hash
    );
    for v_vector_entry, v_child_ordinal in
      select value, ordinality
      from jsonb_array_elements(v_vector) with ordinality
    loop
      insert into private.authoring_experiment_condition_levels(
        experiment_id, protocol_revision, condition_id, factor_id, level_id,
        ordinal
      ) values (
        p_experiment_id, p_protocol_revision, v_condition->>'conditionId',
        v_vector_entry->>'factorId', v_vector_entry->>'levelId', v_child_ordinal
      );
      select factor.parameter_id, level.value into v_reference_id, v_parameter_value
      from private.authoring_experiment_factors factor
      join private.authoring_experiment_factor_levels level
        on level.experiment_id = factor.experiment_id
       and level.protocol_revision = factor.protocol_revision
       and level.factor_id = factor.factor_id
       and level.level_id = v_vector_entry->>'levelId'
      where factor.experiment_id = p_experiment_id
        and factor.protocol_revision = p_protocol_revision
        and factor.factor_id = v_vector_entry->>'factorId';
      if v_reference_id = 'available_resource_set_refs' then
        v_reference_id := split_part(v_parameter_value#>>'{values,0}', '@', 1);
        v_reference_version := substring(
          v_parameter_value#>>'{values,0}' from char_length(v_reference_id) + 2
        );
        insert into private.authoring_experiment_condition_resource_sets(
          experiment_id, protocol_revision, condition_id, factor_id, target_ordinal,
          workspace_id, resource_set_id, resource_set_version, ordinal
        ) select
          p_experiment_id, p_protocol_revision, v_condition->>'conditionId',
          v_vector_entry->>'factorId', target.ordinal, p_workspace_id,
          v_reference_id, v_reference_version, 1
        from private.authoring_experiment_factor_targets target
        join private.authoring_resource_sets resource_set
          on resource_set.workspace_id = p_workspace_id
         and resource_set.resource_set_id = v_reference_id
         and resource_set.resource_set_version = v_reference_version
         and cardinality(target.scope_path) >= cardinality(resource_set.scope_path)
         and target.scope_path[1:cardinality(resource_set.scope_path)] =
           resource_set.scope_path
        where target.experiment_id = p_experiment_id
          and target.protocol_revision = p_protocol_revision
          and target.factor_id = v_vector_entry->>'factorId';
        get diagnostics v_insert_count = row_count;
        if v_insert_count <> (
          select count(*)
          from private.authoring_experiment_factor_targets target
          where target.experiment_id = p_experiment_id
            and target.protocol_revision = p_protocol_revision
            and target.factor_id = v_vector_entry->>'factorId'
        ) then
          raise exception 'ResourceSet não cobre todos os targets exatos do fator.'
            using errcode = '23514';
        end if;
      end if;
    end loop;
  end loop;

  if not exists (
    select 1
    from private.authoring_experiment_condition_levels chosen
    where chosen.experiment_id = p_experiment_id
      and chosen.protocol_revision = p_protocol_revision
    group by chosen.factor_id
    having count(distinct chosen.level_id) >= 2
  ) then
    raise exception 'Ao menos um fator deve variar entre duas condições.'
      using errcode = '23514';
  end if;

  if (select count(distinct invariant.value #>> '{}')
      from jsonb_array_elements(v_protocol->'invariants') invariant(value)) <> 4
     or exists (
       select 1 from jsonb_array_elements(v_protocol->'invariants') invariant(value)
       where invariant.value #>> '{}' not in (
         'sources', 'targets', 'analysis', 'structure'
       )
     ) then
    raise exception 'As quatro invariantes normativas são obrigatórias.'
      using errcode = '23514';
  end if;
  for v_invariant_kind, v_ordinal in
    select value #>> '{}', ordinality
    from jsonb_array_elements(v_protocol->'invariants') with ordinality
  loop
    insert into private.authoring_experiment_invariants(
      experiment_id, protocol_revision, invariant_id, ordinal,
      invariant_kind, label
    ) values (
      p_experiment_id, p_protocol_revision, v_invariant_kind, v_ordinal,
      v_invariant_kind, case v_invariant_kind
        when 'sources' then 'Fontes'
        when 'targets' then 'Alvos'
        when 'analysis' then 'Análise'
        else 'Estrutura' end
    );
  end loop;

  for v_instrument, v_reference_role, v_ordinal in
    select value, 'instrument', ordinality
      from jsonb_array_elements(v_protocol->'instrumentRefs') with ordinality
    union all
    select value, 'outcome', ordinality
      from jsonb_array_elements(v_protocol->'outcomeRefs') with ordinality
  loop
    if not private.authoring_design_closed_object_v1(
         v_instrument,
         array['id','version'], array['id','version']
       )
       or not exists (
         select 1
         from private.authoring_research_instrument_definitions definition
         join private.authoring_research_instrument_availability availability
           using(instrument_id, instrument_version)
         where definition.instrument_id = v_instrument->>'id'
           and definition.instrument_version = v_instrument->>'version'
           and availability.active
           and (
             (v_reference_role = 'outcome'
               and definition.instrument_kind = 'outcome_measure')
             or (v_reference_role = 'instrument'
               and definition.instrument_kind in (
                 'assessment', 'survey', 'external_registry'
               ))
           )
       ) then
      raise exception 'Instrumento/outcome inexiste, está inativo ou tem papel incompatível.'
        using errcode = '23503';
    end if;
    insert into private.authoring_experiment_instruments(
      experiment_id, protocol_revision, instrument_id, instrument_version,
      ordinal, reference_role, purpose
    )
    select p_experiment_id, p_protocol_revision,
      definition.instrument_id, definition.instrument_version,
      v_ordinal, v_reference_role, definition.purpose
    from private.authoring_research_instrument_definitions definition
    where definition.instrument_id = v_instrument->>'id'
      and definition.instrument_version = v_instrument->>'version';
  end loop;
end;
$function$;

create function private.copy_authoring_experiment_workspace_table_v1(
  p_table text,
  p_source_workspace_id uuid,
  p_target_workspace_id uuid,
  p_workspace_course_id text,
  p_scope_microsequence_ids text[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_relation regclass;
  v_columns text;
  v_projection text;
  v_predicate text;
begin
  if p_table not in (
    'authoring_instructional_analyses',
    'authoring_design_parameter_assignments',
    'authoring_resource_sets',
    'authoring_resource_set_members',
    'authoring_effective_design_snapshots',
    'authoring_effective_design_snapshot_values',
    'authoring_effective_design_snapshot_resource_sets',
    'authoring_pedagogical_blueprints',
    'authoring_pedagogical_blueprint_bindings',
    'authoring_microsequence_design_bindings',
    'authoring_materialization_manifests',
    'authoring_manifest_resource_selections',
    'authoring_manifest_materialized_resources',
    'authoring_manifest_coverage',
    'authoring_manifest_metrics'
  ) then
    raise exception 'Tabela fora do clone experimental.' using errcode = '22023';
  end if;
  v_relation := to_regclass('private.' || p_table);
  if v_relation is null then
    raise exception 'Tabela esperada do clone experimental não existe.'
      using errcode = '55000';
  end if;
  select string_agg(quote_ident(attribute.attname), ', ' order by attribute.attnum),
    string_agg(
      case when attribute.attname = 'workspace_id' then '$2::uuid'
        else 'source.' || quote_ident(attribute.attname) end,
      ', ' order by attribute.attnum
    )
  into v_columns, v_projection
  from pg_attribute attribute
  where attribute.attrelid = v_relation
    and attribute.attnum > 0
    and not attribute.attisdropped
    and attribute.attgenerated = '';

  v_predicate := case p_table
    when 'authoring_instructional_analyses' then
      '(source.scope_kind = ''workspace'' or (source.scope_path[1] = $3 and (cardinality(source.scope_path) < 4 or source.scope_path[4] = any($4))))'
    when 'authoring_design_parameter_assignments' then
      '(source.scope_kind = ''workspace'' or (source.scope_path[1] = $3 and (cardinality(source.scope_path) < 4 or source.scope_path[4] = any($4)))) and source.mode is distinct from ''research_lock'' and source.authority_kind is distinct from ''research_protocol'''
    when 'authoring_resource_sets' then
      '(source.scope_kind = ''workspace'' or (source.scope_path[1] = $3 and (cardinality(source.scope_path) < 4 or source.scope_path[4] = any($4))))'
    when 'authoring_effective_design_snapshots' then
      '(source.scope_kind = ''workspace'' or (source.scope_path[1] = $3 and (cardinality(source.scope_path) < 4 or source.scope_path[4] = any($4))))'
    when 'authoring_pedagogical_blueprints' then
      'source.scope_path[1] = $3 and (cardinality(source.scope_path) < 4 or source.scope_path[4] = any($4))'
    when 'authoring_pedagogical_blueprint_bindings' then
      'source.scope_path[1] = $3 and (cardinality(source.scope_path) < 4 or source.scope_path[4] = any($4))'
    when 'authoring_materialization_manifests' then
      'source.scope_path[1] = $3 and (cardinality(source.scope_path) < 4 or source.scope_path[4] = any($4))'
    when 'authoring_resource_set_members' then
      'exists (select 1 from private.authoring_resource_sets target where target.workspace_id = $2 and target.resource_set_id = source.resource_set_id and target.resource_set_version = source.resource_set_version)'
    when 'authoring_effective_design_snapshot_values' then
      'exists (select 1 from private.authoring_effective_design_snapshots target where target.workspace_id = $2 and target.snapshot_id = source.snapshot_id and target.snapshot_version = source.snapshot_version)'
    when 'authoring_effective_design_snapshot_resource_sets' then
      'exists (select 1 from private.authoring_effective_design_snapshots target where target.workspace_id = $2 and target.snapshot_id = source.snapshot_id and target.snapshot_version = source.snapshot_version) and exists (select 1 from private.authoring_resource_sets target_set where target_set.workspace_id = $2 and target_set.resource_set_id = source.resource_set_id and target_set.resource_set_version = source.resource_set_version)'
    when 'authoring_microsequence_design_bindings' then
      'exists (select 1 from private.authoring_workspace_entities entity where entity.workspace_id = $2 and entity.entity_type = ''microsequence'' and entity.entity_id = source.microsequence_ref)'
    else
      'exists (select 1 from private.authoring_materialization_manifests manifest where manifest.workspace_id = $2 and manifest.manifest_id = source.manifest_id and manifest.manifest_version = source.manifest_version)'
  end;
  execute format(
    'insert into private.%I(%s) select %s from private.%I source where source.workspace_id = $1 and %s',
    p_table, v_columns, v_projection, p_table, v_predicate
  ) using p_source_workspace_id, p_target_workspace_id,
    p_workspace_course_id, p_scope_microsequence_ids;
end;
$function$;

create function private.clone_authoring_experiment_workspace_v1(
  p_actor_id uuid,
  p_source_workspace_id uuid,
  p_workspace_course_id text,
  p_variant_revision_id uuid,
  p_condition_label text,
  p_scope_microsequence_ids text[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_source_workspace private.authoring_workspaces%rowtype;
  v_source_publication private.authoring_workspace_publications%rowtype;
  v_source_course public.courses%rowtype;
  v_child_workspace_id uuid := extensions.gen_random_uuid();
  v_child_course_id uuid := extensions.gen_random_uuid();
  v_part_id text := 'experiment-part:' || p_variant_revision_id::text;
  v_mandate_id text := 'experiment:' || p_variant_revision_id::text
    || ':materialize';
  v_table text;
begin
  if cardinality(p_scope_microsequence_ids) not between 1 and 500
     or cardinality(p_scope_microsequence_ids) is distinct from (
       select count(distinct microsequence_id)
       from unnest(p_scope_microsequence_ids) microsequence_id
     ) then
    raise exception 'Escopo materializável da variante é inválido.'
      using errcode = '22023';
  end if;
  select * into v_source_workspace
  from private.authoring_workspaces workspace
  where workspace.id = p_source_workspace_id and workspace.deleted_at is null
  for share;
  if not found then
    raise exception 'Workspace-base inexistente.' using errcode = 'P0002';
  end if;
  select * into v_source_publication
  from private.authoring_workspace_publications publication
  where publication.workspace_id = p_source_workspace_id
    and publication.workspace_course_id = p_workspace_course_id
    and publication.target = 'private'
  for share;
  if not found or v_source_publication.published_workspace_revision is distinct from
       v_source_workspace.revision then
    raise exception 'A publicação privada da base não está corrente.'
      using errcode = '40001';
  end if;
  select * into v_source_course
  from public.courses course
  where course.id = v_source_publication.course_id
    and course.status = 'published'
    and course.deleted_at is null
    and course.document_storage_enabled
    and course.current_revision_hash = v_source_publication.content_hash
    and course.revision_artifact_hash = v_source_publication.content_hash
  for share;
  if not found then
    raise exception 'Curso privado da base não está publicável.' using errcode = '40001';
  end if;

  insert into private.authoring_workspaces(
    id, owner_id, title, revision, brief, purpose, workspace_kind, visibility,
    authoring_state
  ) values (
    v_child_workspace_id, coalesce(v_source_workspace.owner_id,p_actor_id),
    left(v_source_workspace.title || ' · variante ' || p_condition_label, 300),
    v_source_workspace.revision,
    'Workspace interno de variante experimental.',
    v_source_workspace.purpose, v_source_workspace.workspace_kind, 'private',
    jsonb_build_object(
      'version', 1,
      'parts', jsonb_build_array(jsonb_build_object(
        'id', v_part_id,
        'title', left('Escopo experimental · ' || p_condition_label, 300),
        'microsequenceIds', to_jsonb(p_scope_microsequence_ids)
      )),
      'decisions', '[]'::jsonb,
      'mandate', jsonb_build_object(
        'id', v_mandate_id,
        'kind', 'build_part',
        'targetPartId', v_part_id,
        'note', 'Materializar somente o escopo pinado desta VariantRevision.',
        'decidedAtRevision', v_source_workspace.revision
      )
    )
  );
  -- A membership do owner é explícita: não depende de trigger ou de uma row
  -- legada já existir no workspace-base.
  insert into private.educational_workspace_members(
    workspace_id, user_id, role, granted_by, joined_at, updated_at
  ) values (
    v_child_workspace_id, coalesce(v_source_workspace.owner_id,p_actor_id),
    'owner', p_actor_id,
    now(), now()
  ) on conflict(workspace_id, user_id) do update
    set role = 'owner', updated_at = excluded.updated_at;
  insert into private.educational_workspace_members(
    workspace_id, user_id, role, granted_by, joined_at, updated_at
  )
  select v_child_workspace_id, member.user_id, member.role, p_actor_id,
    now(), now()
  from private.educational_workspace_members member
  where member.workspace_id = p_source_workspace_id
    and member.role = 'admin'
  on conflict(workspace_id, user_id) do update
    set role = excluded.role, updated_at = excluded.updated_at;

  insert into private.authoring_workspace_entities(
    workspace_id, entity_type, entity_id, parent_type, parent_id,
    position, content, version, created_at, updated_at
  )
  with recursive selected as (
    select entity.*
    from private.authoring_workspace_entities entity
    where entity.workspace_id = p_source_workspace_id
      and entity.entity_type = 'microsequence'
      and entity.entity_id = any(p_scope_microsequence_ids)
    union all
    select parent.*
    from private.authoring_workspace_entities parent
    join selected child
      on parent.workspace_id = child.workspace_id
     and parent.entity_type = child.parent_type
     and parent.entity_id = child.parent_id
  ), rows_to_copy as (
    select entity.*
    from private.authoring_workspace_entities entity
    where entity.workspace_id = p_source_workspace_id
      and entity.entity_type = 'project'
    union
    select distinct on(entity_type, entity_id) * from selected
  )
  select v_child_workspace_id, entity_type, entity_id, parent_type, parent_id,
    position, content, version, created_at, updated_at
  from rows_to_copy
  order by case entity_type
    when 'project' then 0 when 'course' then 1 when 'module' then 2
    when 'lesson' then 3 when 'topic' then 4
    when 'microsequence' then 5 else 6 end, position, entity_id;

  foreach v_table in array array[
    'authoring_instructional_analyses',
    'authoring_design_parameter_assignments',
    'authoring_resource_sets',
    'authoring_resource_set_members',
    'authoring_effective_design_snapshots',
    'authoring_effective_design_snapshot_values',
    'authoring_effective_design_snapshot_resource_sets',
    'authoring_pedagogical_blueprints',
    'authoring_pedagogical_blueprint_bindings',
    'authoring_microsequence_design_bindings',
    'authoring_materialization_manifests',
    'authoring_manifest_resource_selections',
    'authoring_manifest_materialized_resources',
    'authoring_manifest_coverage',
    'authoring_manifest_metrics'
  ] loop
    perform private.copy_authoring_experiment_workspace_table_v1(
      v_table, p_source_workspace_id, v_child_workspace_id,
      p_workspace_course_id, p_scope_microsequence_ids
    );
  end loop;

  insert into public.courses(
    id, owner_id, status, contract_key, title, goal,
    contract_scope, project_id, position,
    content_hash, current_revision_hash, revision_artifact_hash,
    module_count, lesson_count, microsequence_count, card_count,
    document_storage_enabled, completion_state, experiment_variant
  ) values (
    v_child_course_id, coalesce(v_source_workspace.owner_id,p_actor_id), 'published',
    'experiment-' || replace(p_variant_revision_id::text, '-', ''),
    v_source_course.title, v_source_course.goal, v_source_course.contract_scope,
    extensions.gen_random_uuid(),
    coalesce((select max(course.position) + 1 from public.courses course
      where course.owner_id = coalesce(v_source_workspace.owner_id,p_actor_id)
        and course.deleted_at is null), 0),
    v_source_publication.content_hash, v_source_publication.content_hash,
    v_source_publication.content_hash,
    v_source_course.module_count, v_source_course.lesson_count,
    v_source_course.microsequence_count, v_source_course.card_count,
    true, v_source_course.completion_state, true
  );
  insert into private.course_revisions(
    course_id, revision_hash, artifact_hash, base_revision_hash,
    validation_status, validated_at, published_at, created_by
  ) values (
    v_child_course_id, v_source_publication.content_hash,
    v_source_publication.content_hash, null,
    'validated', now(), now(), p_actor_id
  );
  insert into private.authoring_workspace_publications(
    workspace_id, workspace_course_id, target, course_id, content_hash
  ) values (
    v_child_workspace_id, p_workspace_course_id, 'private',
    v_child_course_id, v_source_publication.content_hash
  );

  return jsonb_build_object(
    'childWorkspaceId', v_child_workspace_id,
    'publicationCourseId', v_child_course_id,
    'workspaceCourseId', p_workspace_course_id,
    'workspaceRevision', v_source_workspace.revision,
    'artifactHash', v_source_publication.content_hash,
    'mandateId', v_mandate_id,
    'mandateRevision', v_source_workspace.revision
  );
end;
$function$;

create function private.validate_authoring_experiment_base_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_experiment_id uuid,
  p_expected_workspace_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_experiment private.authoring_experiments%rowtype;
  v_protocol private.authoring_experiment_protocol_revisions%rowtype;
  v_workspace private.authoring_workspaces%rowtype;
  v_publication private.authoring_workspace_publications%rowtype;
  v_course public.courses%rowtype;
  v_base_id uuid := extensions.gen_random_uuid();
  v_scope_version bigint;
  v_micro record;
  v_audited private.authoring_audit_run_microsequences%rowtype;
  v_run_id uuid;
  v_ordinal integer := 0;
  v_resolved jsonb;
  v_invariant record;
  v_base_course_id uuid;
begin
  select * into v_experiment
  from private.authoring_experiments experiment
  where experiment.id = p_experiment_id
    and experiment.workspace_id = p_workspace_id
  for update;
  if not found or v_experiment.current_protocol_revision is null then
    raise exception 'Experimento/protocolo inexistente.' using errcode = 'P0002';
  end if;
  if v_experiment.state <> 'draft' then
    raise exception 'Somente protocolo draft pode ser validado.' using errcode = '23514';
  end if;
  select * into v_protocol
  from private.authoring_experiment_protocol_revisions protocol
  where protocol.experiment_id = p_experiment_id
    and protocol.protocol_revision = v_experiment.current_protocol_revision;
  select * into v_workspace
  from private.authoring_workspaces workspace
  where workspace.id = p_workspace_id and workspace.deleted_at is null
  for update;
  if not found or p_expected_workspace_revision is null
     or v_workspace.revision <> p_expected_workspace_revision then
    raise exception 'A base autoral mudou; releia antes de validar.'
      using errcode = '40001';
  end if;
  begin
    v_base_course_id := (v_protocol.protocol#>>'{baseRef,id}')::uuid;
  exception when invalid_text_representation then
    raise exception 'baseRef não identifica publicação privada governada.'
      using errcode = '22023';
  end;
  select * into v_publication
  from private.authoring_workspace_publications publication
  where publication.workspace_id = p_workspace_id
    and publication.course_id = v_base_course_id
    and publication.target = 'private'
    and publication.content_hash = v_protocol.protocol#>>'{baseRef,version}'
    and publication.published_workspace_revision = v_workspace.revision
  for share;
  if not found then
    raise exception 'baseRef não corresponde à publicação privada corrente.'
      using errcode = '40001';
  end if;
  select * into v_course
  from public.courses course
  where course.id = v_publication.course_id
    and course.status = 'published'
    and course.deleted_at is null
    and course.document_storage_enabled
    and course.completion_state = 'complete'
    and course.content_hash = v_publication.content_hash
    and course.current_revision_hash = v_publication.content_hash
    and course.revision_artifact_hash = v_publication.content_hash
    and exists (
      select 1 from private.course_revisions revision
      where revision.course_id = course.id
        and revision.artifact_hash = v_publication.content_hash
        and revision.validation_status = 'validated'
        and revision.published_at is not null
    )
  for share;
  if not found then
    raise exception 'A publicação-base não é completa e aprovada.'
      using errcode = '23514';
  end if;
  select entity.version into v_scope_version
  from private.authoring_workspace_entities entity
  where entity.workspace_id = p_workspace_id
    and entity.entity_type = v_protocol.scope_kind
    and entity.entity_id = v_protocol.scope_ref;
  if v_scope_version is null then
    raise exception 'Escopo do protocolo não existe mais.' using errcode = '40001';
  end if;

  insert into private.authoring_experiment_base_revisions(
    id, experiment_id, protocol_revision, workspace_id, workspace_revision,
    scope_kind, scope_ref, scope_path, scope_entity_version,
    workspace_course_id, publication_course_id, artifact_hash, content_hash,
    validated_by
  ) values (
    v_base_id, p_experiment_id, v_protocol.protocol_revision, p_workspace_id,
    v_workspace.revision, v_protocol.scope_kind, v_protocol.scope_ref,
    v_protocol.scope_path, v_scope_version, v_publication.workspace_course_id,
    v_publication.course_id, v_publication.content_hash,
    v_publication.content_hash, p_actor_id
  );

  for v_micro in
    select entity.entity_id, entity.version,
      private.authoring_design_scope_path_v1(
        p_workspace_id, 'microsequence', entity.entity_id
      ) as scope_path
    from private.authoring_workspace_entities entity
    where entity.workspace_id = p_workspace_id
      and entity.entity_type = 'microsequence'
    order by entity.entity_id
  loop
    if cardinality(v_micro.scope_path) < cardinality(v_protocol.scope_path)
       or v_micro.scope_path[1:cardinality(v_protocol.scope_path)] is distinct from
         v_protocol.scope_path then
      continue;
    end if;
    v_ordinal := v_ordinal + 1;
    if v_ordinal > 500 then
      raise exception 'O escopo experimental excede 500 microssequências.'
        using errcode = '54000';
    end if;
    select audited.* into v_audited
    from private.authoring_audit_run_microsequences audited
    join private.authoring_audit_runs run on run.id = audited.audit_run_id
    join private.authoring_audit_run_completions completion
      on completion.audit_run_id = run.id
    where audited.workspace_id = p_workspace_id
      and audited.microsequence_ref = v_micro.entity_id
      and private.authoring_audit_run_is_current_v1(run.id)
    order by completion.completed_at desc, run.created_at desc, run.id desc
    limit 1;
    if not found
       or v_audited.analysis_id is null
       or v_audited.snapshot_id is null
       or v_audited.blueprint_id is null
       or v_audited.binding_id is null
       or v_audited.manifest_id is null
       or exists (
         select 1
         from private.authoring_workspace_observations finding
         where finding.audit_run_id = v_audited.audit_run_id
           and finding.kind = 'audit_finding'
           and finding.status in ('open', 'approved', 'repaired')
       ) then
      raise exception 'Toda microsequência exige auditoria completa, corrente e sem achado operacional.'
        using errcode = '23514';
    end if;
    insert into private.authoring_experiment_base_microsequences(
      base_revision_id, ordinal, microsequence_ref, scope_path,
      scope_entity_version, audit_run_id, content_hash, design_refs,
      resource_set_refs
    ) values (
      v_base_id, v_ordinal, v_audited.microsequence_ref, v_audited.scope_path,
      v_audited.scope_entity_version, v_audited.audit_run_id,
      v_audited.content_hash,
      jsonb_build_object(
        'analysisRef', jsonb_build_object(
          'id', v_audited.analysis_id, 'version', v_audited.analysis_version
        ),
        'effectiveSnapshotRef', jsonb_build_object(
          'id', v_audited.snapshot_id, 'version', v_audited.snapshot_version
        ),
        'blueprintRef', jsonb_build_object(
          'id', v_audited.blueprint_id, 'version', v_audited.blueprint_version
        ),
        'bindingRef', jsonb_build_object(
          'id', v_audited.binding_id, 'version', v_audited.binding_version
        ),
        'manifestRef', jsonb_build_object(
          'id', v_audited.manifest_id, 'version', v_audited.manifest_version
        )
      ), v_audited.resource_set_refs
    );
  end loop;
  if v_ordinal = 0 then
    raise exception 'O escopo experimental não contém microssequência.'
      using errcode = '23514';
  end if;

  for v_invariant in
    select * from private.authoring_experiment_invariants invariant
    where invariant.experiment_id = p_experiment_id
      and invariant.protocol_revision = v_protocol.protocol_revision
    order by invariant.ordinal
  loop
    v_resolved := case v_invariant.invariant_kind
      when 'sources' then jsonb_build_object(
        'baseRef', v_protocol.protocol->'baseRef',
        'publicationCourseId', v_publication.course_id,
        'artifactHash', v_publication.content_hash,
        'workspaceRevision', v_workspace.revision
      )
      when 'targets' then (
        select jsonb_agg(jsonb_build_object(
          'microsequenceRef', micro.microsequence_ref,
          'scopePath', to_jsonb(micro.scope_path),
          'entityVersion', micro.scope_entity_version,
          'contentHash', micro.content_hash
        ) order by micro.ordinal)
        from private.authoring_experiment_base_microsequences micro
        where micro.base_revision_id = v_base_id
      )
      when 'analysis' then (
        select jsonb_agg(jsonb_build_object(
          'microsequenceRef', micro.microsequence_ref,
          'designRefs', micro.design_refs,
          'auditRunRef', jsonb_build_object(
            'id', micro.audit_run_id, 'version', '1.0.0'
          )
        ) order by micro.ordinal)
        from private.authoring_experiment_base_microsequences micro
        where micro.base_revision_id = v_base_id
      )
      else jsonb_build_object(
        'scope', jsonb_build_object(
          'kind', v_protocol.scope_kind, 'ref', v_protocol.scope_ref,
          'path', to_jsonb(v_protocol.scope_path),
          'entityVersion', v_scope_version
        ),
        'microsequenceCount', v_ordinal
      ) end;
    insert into private.authoring_experiment_base_invariants(
      base_revision_id, invariant_id, invariant_kind, label,
      resolved_refs, resolution_hash
    ) values (
      v_base_id, v_invariant.invariant_id, v_invariant.invariant_kind,
      v_invariant.label, v_resolved,
      private.authoring_experiment_hash_v1(v_resolved)
    );
  end loop;

  update private.authoring_experiments experiment
  set current_base_revision_id = v_base_id,
      state = 'validated', revision = revision + 1,
      updated_by = p_actor_id, updated_at = now()
  where experiment.id = p_experiment_id;
  return jsonb_build_object(
    'baseRevisionId', v_base_id,
    'workspaceRevision', v_workspace.revision,
    'microsequenceCount', v_ordinal
  );
end;
$function$;

create function private.generate_authoring_experiment_variants_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_experiment_id uuid,
  p_expected_workspace_revision bigint,
  p_participant_continuity text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_experiment private.authoring_experiments%rowtype;
  v_base private.authoring_experiment_base_revisions%rowtype;
  v_workspace private.authoring_workspaces%rowtype;
  v_condition private.authoring_experiment_conditions%rowtype;
  v_variant private.authoring_experiment_variants%rowtype;
  v_previous private.authoring_experiment_variant_revisions%rowtype;
  v_variant_revision_id uuid;
  v_variant_revision integer;
  v_clone jsonb;
  v_authority_ref text;
  v_assignment_id text;
  v_lock record;
  v_count integer := 0;
  v_continuity text;
  v_scope_microsequence_ids text[];
begin
  select * into v_experiment
  from private.authoring_experiments experiment
  where experiment.id = p_experiment_id
    and experiment.workspace_id = p_workspace_id
  for update;
  if not found or v_experiment.current_base_revision_id is null then
    raise exception 'Experimento validado inexistente.' using errcode = 'P0002';
  end if;
  if v_experiment.state not in (
    'validated', 'correction_required', 'collecting', 'paused'
  ) then
    raise exception 'Estado não permite gerar VariantRevision.' using errcode = '23514';
  end if;
  select * into v_workspace
  from private.authoring_workspaces workspace
  where workspace.id = p_workspace_id and workspace.deleted_at is null
  for update;
  select * into v_base
  from private.authoring_experiment_base_revisions base
  where base.id = v_experiment.current_base_revision_id
    and base.experiment_id = p_experiment_id;
  if not found
     or p_expected_workspace_revision is null
     or v_workspace.revision <> p_expected_workspace_revision
     or v_base.workspace_revision <> v_workspace.revision
     or not exists (
       select 1
       from private.authoring_workspace_publications publication
       where publication.workspace_id = p_workspace_id
         and publication.workspace_course_id = v_base.workspace_course_id
         and publication.target = 'private'
         and publication.course_id = v_base.publication_course_id
         and publication.content_hash = v_base.artifact_hash
         and publication.published_workspace_revision = v_workspace.revision
     ) then
    raise exception 'A base validada mudou antes da geração.' using errcode = '40001';
  end if;
  v_continuity := case when exists (
    select 1 from private.authoring_experiment_assignments assignment
    where assignment.experiment_id = p_experiment_id
  ) then p_participant_continuity else 'not_applicable' end;
  if v_continuity is null then v_continuity := 'not_applicable'; end if;
  if v_continuity not in ('not_applicable', 'retain_existing')
     or (
       exists (
         select 1 from private.authoring_experiment_assignments assignment
         where assignment.experiment_id = p_experiment_id
       ) and v_continuity <> 'retain_existing'
     ) then
    raise exception 'Correção pós-atribuição exige retain_existing explícito.'
      using errcode = '23514';
  end if;

  select array_agg(micro.microsequence_ref order by micro.ordinal)
  into v_scope_microsequence_ids
  from private.authoring_experiment_base_microsequences micro
  where micro.base_revision_id = v_base.id;
  if cardinality(v_scope_microsequence_ids) not between 1 and 500 then
    raise exception 'A base não possui escopo materializável pinado.'
      using errcode = '23514';
  end if;

  for v_condition in
    select * from private.authoring_experiment_conditions condition
    where condition.experiment_id = p_experiment_id
      and condition.protocol_revision = v_experiment.current_protocol_revision
    order by condition.ordinal
  loop
    select * into v_variant
    from private.authoring_experiment_variants variant
    where variant.experiment_id = p_experiment_id
      and variant.protocol_revision = v_condition.protocol_revision
      and variant.condition_id = v_condition.condition_id
    for update;
    if found and v_variant.current_variant_revision_id is not null then
      select * into v_previous
      from private.authoring_experiment_variant_revisions revision
      where revision.id = v_variant.current_variant_revision_id;
      if v_previous.status <> 'invalidated' then
        continue;
      end if;
    end if;
    if not found then
      insert into private.authoring_experiment_variants(
        experiment_id, protocol_revision, condition_id, ordinal
      ) values (
        p_experiment_id, v_condition.protocol_revision,
        v_condition.condition_id, v_condition.ordinal
      ) returning * into v_variant;
      v_variant_revision := 1;
    else
      select coalesce(max(revision.variant_revision), 0) + 1
      into v_variant_revision
      from private.authoring_experiment_variant_revisions revision
      where revision.variant_id = v_variant.id;
    end if;
    v_variant_revision_id := extensions.gen_random_uuid();
    v_clone := private.clone_authoring_experiment_workspace_v1(
      p_actor_id, p_workspace_id, v_base.workspace_course_id,
      v_variant_revision_id, v_condition.label, v_scope_microsequence_ids
    );
    insert into private.authoring_experiment_variant_revisions(
      id, variant_id, experiment_id, protocol_revision, condition_id,
      variant_revision, base_revision_id, child_workspace_id,
      workspace_course_id, publication_course_id,
      initial_workspace_revision, materialization_mandate_id,
      materialization_mandate_revision, initial_artifact_hash,
      initial_content_hash, status, participant_continuity, scope_map,
      created_by
    ) values (
      v_variant_revision_id, v_variant.id, p_experiment_id,
      v_condition.protocol_revision, v_condition.condition_id,
      v_variant_revision, v_base.id,
      (v_clone->>'childWorkspaceId')::uuid,
      v_clone->>'workspaceCourseId',
      (v_clone->>'publicationCourseId')::uuid,
      (v_clone->>'workspaceRevision')::bigint + 1,
      v_clone->>'mandateId', (v_clone->>'mandateRevision')::bigint,
      v_clone->>'artifactHash', v_clone->>'artifactHash',
      'generating', v_continuity,
      jsonb_build_object(
        'sourceWorkspaceId', p_workspace_id,
        'targetWorkspaceId', v_clone->>'childWorkspaceId',
        'scope', jsonb_build_object(
          'kind', v_base.scope_kind, 'ref', v_base.scope_ref,
          'sourcePath', to_jsonb(v_base.scope_path),
          'targetPath', to_jsonb(v_base.scope_path)
        )
      ), p_actor_id
    );
    update private.authoring_experiment_variants variant
    set current_variant_revision_id = v_variant_revision_id
    where variant.id = v_variant.id;
    v_authority_ref := 'experiment:' || p_experiment_id::text
      || '/protocol:' || v_condition.protocol_revision::text
      || '/condition:' || v_condition.condition_id;

    -- O overlay não pode manter uma atribuição-base corrente no slot
    -- manipulado: além de falsear a condição, o resolver a denuncia como
    -- conflito sob research_lock. Preserve, porém, a linha original porque
    -- snapshots imutáveis do clone continuam a referenciá-la. Um tombstone
    -- append-only a retira somente da projeção corrente.
    insert into private.authoring_design_parameter_assignments(
      workspace_id, assignment_id, assignment_version, model_version,
      action, parameter_id, parameter_version,
      scope_kind, scope_ref, scope_path, mode, value,
      authority_kind, authority_actor_id, authority_ref, locked,
      rationale, provenance_refs,
      based_on_workspace_revision, created_revision, created_by
    )
    select assignment.workspace_id, assignment.assignment_id,
      'experiment-' || replace(v_variant_revision_id::text, '-', ''),
      assignment.model_version, 'remove', assignment.parameter_id,
      assignment.parameter_version, assignment.scope_kind,
      assignment.scope_ref, assignment.scope_path, null, null,
      assignment.authority_kind, assignment.authority_actor_id,
      assignment.authority_ref, assignment.locked,
      'Atribuição-base substituída pelo research_lock experimental.',
      array[v_authority_ref],
      (v_clone->>'workspaceRevision')::bigint,
      (v_clone->>'workspaceRevision')::bigint + 1, p_actor_id
    from private.current_authoring_design_parameter_assignments_v1 assignment
    where assignment.workspace_id=(v_clone->>'childWorkspaceId')::uuid
      and assignment.mode is distinct from 'research_lock'
      and exists (
        select 1
        from private.authoring_experiment_factors factor
        join private.authoring_experiment_factor_targets target
          on target.experiment_id=factor.experiment_id
         and target.protocol_revision=factor.protocol_revision
         and target.factor_id=factor.factor_id
        where factor.experiment_id=p_experiment_id
          and factor.protocol_revision=v_condition.protocol_revision
          and assignment.parameter_id=factor.parameter_id
          and assignment.parameter_version=factor.parameter_version
          and (
            (
              cardinality(assignment.scope_path)>=cardinality(target.scope_path)
              and assignment.scope_path[1:cardinality(target.scope_path)]=
                target.scope_path
            )
            or (
              cardinality(target.scope_path)>=cardinality(assignment.scope_path)
              and target.scope_path[1:cardinality(assignment.scope_path)]=
                assignment.scope_path
            )
          )
      );

    for v_lock in
      select factor.factor_id, factor.parameter_id, factor.parameter_version,
        target.ordinal as target_ordinal, target.scope_kind,
        target.scope_ref, target.scope_path, level.value
      from private.authoring_experiment_condition_levels chosen
      join private.authoring_experiment_factors factor
        on factor.experiment_id = chosen.experiment_id
       and factor.protocol_revision = chosen.protocol_revision
       and factor.factor_id = chosen.factor_id
      join private.authoring_experiment_factor_levels level
        on level.experiment_id = chosen.experiment_id
       and level.protocol_revision = chosen.protocol_revision
       and level.factor_id = chosen.factor_id
       and level.level_id = chosen.level_id
      join private.authoring_experiment_factor_targets target
        on target.experiment_id = chosen.experiment_id
       and target.protocol_revision = chosen.protocol_revision
       and target.factor_id = chosen.factor_id
      where chosen.experiment_id = p_experiment_id
        and chosen.protocol_revision = v_condition.protocol_revision
        and chosen.condition_id = v_condition.condition_id
      order by factor.ordinal, target.ordinal
    loop
      v_assignment_id := left(
        'experiment:' || replace(v_variant_revision_id::text, '-', '')
        || ':' || v_lock.factor_id || ':' || v_lock.target_ordinal::text,
        240
      );
      insert into private.authoring_experiment_lock_write_tokens(
        transaction_id, variant_revision_id, child_workspace_id,
        assignment_id, authority_ref
      ) values (
        txid_current(), v_variant_revision_id,
        (v_clone->>'childWorkspaceId')::uuid,
        v_assignment_id, v_authority_ref
      );
      -- O guard do assignment valida o vínculo canônico completo. Materialize
      -- esse vínculo antes do INSERT protegido; ambos continuam na mesma
      -- transação e o token é removido antes do retorno.
      insert into private.authoring_experiment_variant_parameter_locks(
        variant_revision_id, factor_id, target_ordinal,
        assignment_id, assignment_version, authority_ref
      ) values (
        v_variant_revision_id, v_lock.factor_id, v_lock.target_ordinal,
        v_assignment_id, '1.0.0', v_authority_ref
      );
      insert into private.authoring_design_parameter_assignments(
        workspace_id, assignment_id, assignment_version, model_version,
        action, parameter_id, parameter_version,
        scope_kind, scope_ref, scope_path, mode, value,
        authority_kind, authority_actor_id, authority_ref, locked,
        rationale, provenance_refs,
        based_on_workspace_revision, created_revision, created_by
      ) values (
        (v_clone->>'childWorkspaceId')::uuid,
        v_assignment_id, '1.0.0', '1.0.0', 'set',
        v_lock.parameter_id, v_lock.parameter_version,
        v_lock.scope_kind, v_lock.scope_ref, v_lock.scope_path,
        'research_lock', v_lock.value,
        'research_protocol', null, v_authority_ref, true,
        'Valor fixado pelo protocolo experimental.',
        array[v_authority_ref, 'factor:' || v_lock.factor_id],
        (v_clone->>'workspaceRevision')::bigint,
        (v_clone->>'workspaceRevision')::bigint + 1,
        p_actor_id
      );
    end loop;

    insert into private.authoring_experiment_variant_allowed_resource_sets(
      variant_revision_id, source_kind, source_ref, target_ordinal,
      scope_kind, scope_ref, scope_path, workspace_id,
      resource_set_id, resource_set_version
    )
    select v_variant_revision_id, 'factor', reference.factor_id,
      reference.target_ordinal, target.scope_kind, target.scope_ref,
      target.scope_path, (v_clone->>'childWorkspaceId')::uuid,
      reference.resource_set_id, reference.resource_set_version
    from private.authoring_experiment_condition_resource_sets reference
    join private.authoring_experiment_factor_targets target
      on target.experiment_id = reference.experiment_id
     and target.protocol_revision = reference.protocol_revision
     and target.factor_id = reference.factor_id
     and target.ordinal = reference.target_ordinal
    where reference.experiment_id = p_experiment_id
      and reference.protocol_revision = v_condition.protocol_revision
      and reference.condition_id = v_condition.condition_id;

    insert into private.authoring_experiment_variant_allowed_resource_sets(
        variant_revision_id, source_kind, source_ref, target_ordinal,
        scope_kind, scope_ref, scope_path, workspace_id,
        resource_set_id, resource_set_version
      )
      select v_variant_revision_id, 'base_invariant',
        'microsequence:' || micro.microsequence_ref, micro.ordinal,
        resource_set.scope_kind, resource_set.scope_ref,
        resource_set.scope_path, (v_clone->>'childWorkspaceId')::uuid,
        reference.value->>'id', reference.value->>'version'
      from private.authoring_experiment_base_microsequences micro
      cross join lateral jsonb_array_elements(micro.resource_set_refs)
        reference(value)
      join private.authoring_resource_sets resource_set
        on resource_set.workspace_id = (v_clone->>'childWorkspaceId')::uuid
       and resource_set.resource_set_id = reference.value->>'id'
       and resource_set.resource_set_version = reference.value->>'version'
      where micro.base_revision_id = v_base.id
        and not exists (
          select 1
          from private.authoring_experiment_condition_resource_sets manipulated
          join private.authoring_experiment_factor_targets target
            on target.experiment_id = manipulated.experiment_id
           and target.protocol_revision = manipulated.protocol_revision
           and target.factor_id = manipulated.factor_id
           and target.ordinal = manipulated.target_ordinal
          where manipulated.experiment_id = p_experiment_id
            and manipulated.protocol_revision = v_condition.protocol_revision
            and manipulated.condition_id = v_condition.condition_id
            and cardinality(micro.scope_path) >= cardinality(target.scope_path)
            and micro.scope_path[1:cardinality(target.scope_path)] = target.scope_path
        )
      on conflict do nothing;

    update private.authoring_workspaces workspace
    set revision = revision + 1, updated_at = now()
    where workspace.id = (v_clone->>'childWorkspaceId')::uuid
      and workspace.revision = (v_clone->>'workspaceRevision')::bigint;
    if not found then
      raise exception 'A child mudou durante a aplicação dos locks.'
        using errcode = '40001';
    end if;
    update private.authoring_workspace_publications publication
    set content_hash = content_hash, updated_at = now()
    where publication.workspace_id = (v_clone->>'childWorkspaceId')::uuid
      and publication.target = 'private';
    delete from private.authoring_experiment_lock_write_tokens token
    where token.transaction_id = txid_current()
      and token.variant_revision_id = v_variant_revision_id;
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then
    raise exception 'Nenhuma condição requer nova VariantRevision.'
      using errcode = '23514';
  end if;
  update private.authoring_experiments experiment
  set state = 'generating', revision = revision + 1,
      updated_by = p_actor_id, updated_at = now()
  where experiment.id = p_experiment_id;
  return jsonb_build_object('generatedCount', v_count);
end;
$function$;

create function private.authorize_authoring_experiment_variant_write_v1(
  p_variant_revision_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_lock record;
begin
  select revision.child_workspace_id, lock.assignment_id, lock.authority_ref
  into v_lock
  from private.authoring_experiment_variant_revisions revision
  join private.authoring_experiment_variant_parameter_locks lock
    on lock.variant_revision_id = revision.id
  where revision.id = p_variant_revision_id
  order by lock.factor_id, lock.target_ordinal
  limit 1;
  if not found then
    raise exception 'VariantRevision sem lock canônico.' using errcode = '55000';
  end if;
  insert into private.authoring_experiment_lock_write_tokens(
    transaction_id, variant_revision_id, child_workspace_id,
    assignment_id, authority_ref
  ) values (
    txid_current(), p_variant_revision_id, v_lock.child_workspace_id,
    v_lock.assignment_id, v_lock.authority_ref
  ) on conflict do nothing;
end;
$function$;

-- A evidência factual só pode ser aberta depois de uma auditoria fresca de
-- todas as micros reais do child. Os pins ficam imutáveis na VariantRevision;
-- manifestos declarados no protocolo nunca substituem cards/design reais.
create function private.capture_authoring_experiment_variant_audit_v1(
  p_variant_revision_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_candidate private.authoring_experiment_variant_revisions%rowtype;
  v_base_micro private.authoring_experiment_base_microsequences%rowtype;
  v_audited private.authoring_audit_run_microsequences%rowtype;
  v_count integer;
begin
  select * into v_candidate
  from private.authoring_experiment_variant_revisions revision
  where revision.id = p_variant_revision_id;
  if not found then
    raise exception 'VariantRevision inexistente.' using errcode = 'P0002';
  end if;

  select count(*) into v_count
  from private.authoring_experiment_variant_microsequences pinned
  where pinned.variant_revision_id = v_candidate.id;
  if v_count > 0 then
    if v_count <> (
         select count(*)
         from private.authoring_experiment_base_microsequences base_micro
         where base_micro.base_revision_id = v_candidate.base_revision_id
       )
       or exists (
         select 1
         from private.authoring_experiment_variant_microsequences pinned
         where pinned.variant_revision_id = v_candidate.id
           and (
             not private.authoring_audit_run_is_current_v1(pinned.audit_run_id)
             or exists (
               select 1
               from private.authoring_workspace_observations finding
               where finding.audit_run_id = pinned.audit_run_id
                 and finding.kind = 'audit_finding'
                 and finding.status in ('open', 'approved', 'repaired')
             )
           )
       ) then
      raise exception 'A auditoria pinada da variante deixou de ser corrente.'
        using errcode = '40001';
    end if;
    return v_count;
  end if;
  v_count := 0;

  for v_base_micro in
    select *
    from private.authoring_experiment_base_microsequences base_micro
    where base_micro.base_revision_id = v_candidate.base_revision_id
    order by base_micro.ordinal
  loop
    select audited.* into v_audited
    from private.authoring_audit_run_microsequences audited
    join private.authoring_audit_runs run on run.id = audited.audit_run_id
    join private.authoring_audit_run_completions completion
      on completion.audit_run_id = run.id
    where audited.workspace_id = v_candidate.child_workspace_id
      and audited.microsequence_ref = v_base_micro.microsequence_ref
      and private.authoring_audit_run_is_current_v1(run.id)
    order by completion.completed_at desc, run.created_at desc, run.id desc
    limit 1;
    if not found
       or v_audited.analysis_id is null
       or v_audited.snapshot_id is null
       or v_audited.blueprint_id is null
       or v_audited.binding_id is null
       or v_audited.manifest_id is null
       or exists (
         select 1
         from private.authoring_workspace_observations finding
         where finding.audit_run_id = v_audited.audit_run_id
           and finding.kind = 'audit_finding'
           and finding.status in ('open', 'approved', 'repaired')
       ) then
      raise exception 'Cada micro da variante exige auditoria fresca, completa e sem achado operacional.'
        using errcode = '23514';
    end if;
    insert into private.authoring_experiment_variant_microsequences(
      variant_revision_id, ordinal, microsequence_ref, scope_path,
      scope_entity_version, audit_run_id, content_hash, design_refs,
      resource_set_refs
    ) values (
      v_candidate.id, v_base_micro.ordinal, v_audited.microsequence_ref,
      v_audited.scope_path, v_audited.scope_entity_version,
      v_audited.audit_run_id, v_audited.content_hash,
      jsonb_build_object(
        'analysisRef', jsonb_build_object(
          'id', v_audited.analysis_id, 'version', v_audited.analysis_version
        ),
        'effectiveSnapshotRef', jsonb_build_object(
          'id', v_audited.snapshot_id, 'version', v_audited.snapshot_version
        ),
        'blueprintRef', jsonb_build_object(
          'id', v_audited.blueprint_id, 'version', v_audited.blueprint_version
        ),
        'bindingRef', jsonb_build_object(
          'id', v_audited.binding_id, 'version', v_audited.binding_version
        ),
        'manifestRef', jsonb_build_object(
          'id', v_audited.manifest_id, 'version', v_audited.manifest_version
        )
      ), v_audited.resource_set_refs
    );
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then
    raise exception 'A variante não contém microssequência auditável.'
      using errcode = '23514';
  end if;
  return v_count;
end;
$function$;

create function public.prepare_authoring_experiment_variant_evidence_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_experiment_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_expected_experiment_revision bigint,
  p_expected_workspace_revision bigint,
  p_variant_revision_ref jsonb,
  p_mandate_ref jsonb,
  p_scope_path text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_parent_workspace_id uuid;
  v_begin jsonb;
  v_argument_hash text;
  v_experiment private.authoring_experiments%rowtype;
  v_candidate private.authoring_experiment_variant_revisions%rowtype;
  v_variant private.authoring_experiment_variants%rowtype;
  v_base private.authoring_experiment_base_revisions%rowtype;
  v_child private.authoring_workspaces%rowtype;
  v_publication private.authoring_workspace_publications%rowtype;
  v_result jsonb;
begin
  select experiment.workspace_id into v_parent_workspace_id
  from private.authoring_experiment_variant_revisions revision
  join private.authoring_experiments experiment
    on experiment.id=revision.experiment_id
  where revision.id=(p_variant_revision_ref->>'id')::uuid
    and revision.experiment_id=p_experiment_id
    and revision.child_workspace_id=p_workspace_id;
  if not found then raise exception 'VariantRevision da rota inexistente.' using errcode='P0002'; end if;
  v_begin:=private.begin_authoring_experiment_request_v1(
    p_actor_id,v_parent_workspace_id,p_experiment_id,p_request_id,p_payload_hash,
    p_expected_experiment_revision,p_expected_workspace_revision,
    'prepare_variant_evidence',jsonb_build_object(
      'childWorkspaceId',p_workspace_id,
      'variantRevisionRef',p_variant_revision_ref,
      'mandateRef',p_mandate_ref,
      'scopePath',to_jsonb(p_scope_path)
    )
  );
  if (v_begin->>'replayed')::boolean then return v_begin->'result'; end if;
  v_argument_hash:=v_begin->>'argumentHash';
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id,p_actor_id,'author'
  );
  if not private.authoring_design_closed_object_v1(
       p_variant_revision_ref,array['id','version'],array['id','version']
     ) or not private.authoring_design_closed_object_v1(
       p_mandate_ref,array['id','version'],array['id','version']
     ) then raise exception 'Refs de evidência inválidas.' using errcode='22023'; end if;
  select * into v_experiment from private.authoring_experiments experiment
  where experiment.id=p_experiment_id and experiment.workspace_id=v_parent_workspace_id
  for update;
  if not found or v_experiment.revision<>p_expected_experiment_revision
     or v_experiment.state not in ('generating','ready','correction_required') then
    raise exception 'O experimento mudou antes da preparação.' using errcode='40001';
  end if;
  select * into v_candidate
  from private.authoring_experiment_variant_revisions revision
  where revision.id=(p_variant_revision_ref->>'id')::uuid
    and revision.experiment_id=p_experiment_id;
  select * into v_variant from private.authoring_experiment_variants variant
  where variant.id=v_candidate.variant_id;
  select * into v_base from private.authoring_experiment_base_revisions base
  where base.id=v_candidate.base_revision_id;
  select * into v_child from private.authoring_workspaces workspace
  where workspace.id=v_candidate.child_workspace_id and workspace.deleted_at is null
  for share;
  if v_variant.current_variant_revision_id<>v_candidate.id
     or v_candidate.status not in ('generating','ready')
     or v_candidate.variant_revision::text<>p_variant_revision_ref->>'version'
     or v_child.revision<>p_expected_workspace_revision
     or p_mandate_ref->>'id'<>v_child.authoring_state#>>'{mandate,id}'
     or p_mandate_ref->>'version'<>v_child.authoring_state#>>'{mandate,decidedAtRevision}'
     or v_child.authoring_state#>>'{mandate,kind}'<>'audit'
     or (p_scope_path is not null and not (
       cardinality(p_scope_path)>=cardinality(v_base.scope_path)
       and p_scope_path[1:cardinality(v_base.scope_path)]=v_base.scope_path
     )) then
    raise exception 'Variante, child, mandato ou path mudaram.' using errcode='40001';
  end if;
  select * into v_publication
  from private.authoring_workspace_publications publication
  where publication.workspace_id=v_child.id
    and publication.workspace_course_id=v_candidate.workspace_course_id
    and publication.target='private'
    and publication.course_id=v_candidate.publication_course_id
    and publication.published_workspace_revision=v_child.revision;
  if not found then raise exception 'Publicação candidata não está corrente.' using errcode='40001'; end if;
  if v_candidate.final_artifact_hash is not null
     and v_candidate.final_artifact_hash<>v_publication.content_hash then
    raise exception 'A evidência parcial pina outra materialização candidata.'
      using errcode='40001';
  end if;
  v_result:=jsonb_build_object(
    'parentWorkspaceId',v_parent_workspace_id,
    'targetWorkspaceId',v_child.id,
    'experimentRef',jsonb_build_object(
      'id',v_experiment.id,'version',v_experiment.revision::text
    ),
    'variantRevisionRef',p_variant_revision_ref,
    'mandateRef',p_mandate_ref,
    'protocolRef',jsonb_build_object(
      'id',v_experiment.id,'version',v_candidate.protocol_revision::text
    ),
    'algorithmRef',jsonb_build_object(
      'id','canonical-json-pointer-fnv1a64-diff','version','2.0.0'
    ),
    'conditionRef',jsonb_build_object(
      'id',v_candidate.condition_id,'version',v_candidate.protocol_revision::text
    ),
    'candidate',jsonb_build_object(
      'ref',jsonb_build_object('id',v_candidate.id,
        'version',v_publication.content_hash),
      'artifact',(select jsonb_build_object(
        'hash',artifact.hash,'bucket',artifact.bucket,
        'objectKey',artifact.object_key,'artifactType',artifact.artifact_type,
        'mediaType',artifact.media_type,'sizeBytes',artifact.size_bytes
      ) from private.artifact_refs artifact
      where artifact.hash=v_publication.content_hash)
    ),
    'baselines',(
      select coalesce(jsonb_agg(value order by ordinal),'[]'::jsonb)
      from (
        select 0 ordinal,jsonb_build_object(
          'kind','base',
          'ref',jsonb_build_object('id',v_base.id,'version',v_base.artifact_hash),
          'progress',private.authoring_experiment_difference_progress_v1(
            v_candidate.id,'base',v_base.id
          ),
          'artifact',(select jsonb_build_object(
            'hash',artifact.hash,'bucket',artifact.bucket,
            'objectKey',artifact.object_key,'artifactType',artifact.artifact_type,
            'mediaType',artifact.media_type,'sizeBytes',artifact.size_bytes
          ) from private.artifact_refs artifact where artifact.hash=v_base.artifact_hash)
        ) value
        union all
        select earlier.ordinal,jsonb_build_object(
          'kind','variant_revision',
          'ref',jsonb_build_object('id',revision.id,
            'version',revision.final_artifact_hash),
          'progress',private.authoring_experiment_difference_progress_v1(
            v_candidate.id,'variant_revision',revision.id
          ),
          'artifact',(select jsonb_build_object(
            'hash',artifact.hash,'bucket',artifact.bucket,
            'objectKey',artifact.object_key,'artifactType',artifact.artifact_type,
            'mediaType',artifact.media_type,'sizeBytes',artifact.size_bytes
          ) from private.artifact_refs artifact
          where artifact.hash=revision.final_artifact_hash)
        ) value
        from private.authoring_experiment_variants earlier
        join private.authoring_experiment_variant_revisions revision
          on revision.id=earlier.current_variant_revision_id
        where earlier.experiment_id=v_experiment.id
          and earlier.protocol_revision=v_candidate.protocol_revision
          and earlier.ordinal<v_variant.ordinal
          and revision.status in ('ready','frozen')
          and revision.final_artifact_hash is not null
      ) baseline
    )
  );
  return private.complete_authoring_experiment_request_v1(
    p_actor_id,v_parent_workspace_id,p_experiment_id,p_request_id,p_payload_hash,
    'prepare_variant_evidence',v_argument_hash,v_result
  );
end;
$function$;

create function public.get_authoring_experiment_variant_evidence_progress_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_variant_revision_ref jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_candidate private.authoring_experiment_variant_revisions%rowtype;
  v_variant private.authoring_experiment_variants%rowtype;
  v_experiment_revision bigint;
begin
  perform private.require_service_role();
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id,p_actor_id,'author'
  );
  if not private.authoring_design_closed_object_v1(
       p_variant_revision_ref,array['id','version'],array['id','version']
     ) then
    raise exception 'VariantRevision inválida para progresso factual.'
      using errcode='22023';
  end if;
  select revision.* into v_candidate
  from private.authoring_experiment_variant_revisions revision
  where revision.id=(p_variant_revision_ref->>'id')::uuid
    and revision.child_workspace_id=p_workspace_id
    and revision.variant_revision::text=p_variant_revision_ref->>'version';
  if not found then
    raise exception 'VariantRevision factual inexistente.' using errcode='P0002';
  end if;
  select * into v_variant
  from private.authoring_experiment_variants variant
  where variant.id=v_candidate.variant_id;
  select experiment.revision into v_experiment_revision
  from private.authoring_experiments experiment
  where experiment.id=v_candidate.experiment_id;
  return jsonb_build_object(
    'experimentRef',jsonb_build_object(
      'id',v_candidate.experiment_id,'version',v_experiment_revision::text
    ),
    'variantRevisionRef',p_variant_revision_ref,
    'baselines',(
      select coalesce(jsonb_agg(value order by ordinal),'[]'::jsonb)
      from (
        select 0 ordinal,jsonb_build_object(
          'baselineRef',jsonb_build_object(
            'kind','base','ref',jsonb_build_object(
              'id',base.id,'version',base.artifact_hash
            )
          ),
          'progress',private.authoring_experiment_difference_progress_v1(
            v_candidate.id,'base',base.id
          )
        ) value
        from private.authoring_experiment_base_revisions base
        where base.id=v_candidate.base_revision_id
        union all
        select earlier.ordinal,jsonb_build_object(
          'baselineRef',jsonb_build_object(
            'kind','variant_revision','ref',jsonb_build_object(
              'id',revision.id,'version',revision.final_artifact_hash
            )
          ),
          'progress',private.authoring_experiment_difference_progress_v1(
            v_candidate.id,'variant_revision',revision.id
          )
        ) value
        from private.authoring_experiment_variants earlier
        join private.authoring_experiment_variant_revisions revision
          on revision.id=earlier.current_variant_revision_id
        where earlier.experiment_id=v_candidate.experiment_id
          and earlier.protocol_revision=v_candidate.protocol_revision
          and earlier.ordinal<v_variant.ordinal
          and revision.status in ('ready','frozen')
          and revision.final_artifact_hash is not null
      ) progress
    )
  );
end;
$function$;

create function public.register_authoring_experiment_variant_evidence_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_experiment_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_expected_experiment_revision bigint,
  p_expected_workspace_revision bigint,
  p_variant_revision_ref jsonb,
  p_mandate_ref jsonb,
  p_evidence jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_begin jsonb;
  v_experiment private.authoring_experiments%rowtype;
  v_candidate private.authoring_experiment_variant_revisions%rowtype;
  v_child private.authoring_workspaces%rowtype;
  v_publication private.authoring_workspace_publications%rowtype;
  v_run private.authoring_experiment_difference_runs%rowtype;
  v_baseline_artifact text;
  v_hunk jsonb;
  v_count integer;
  v_argument_hash text;
  v_result jsonb;
  v_baseline_ref uuid;
  v_difference_run_id uuid;
  v_audit_count integer;
  v_evidence_mandate_id text;
  v_evidence_mandate_revision bigint;
  v_parent_workspace_id uuid;
  v_page_ordinal integer;
  v_page_count integer;
  v_hunk_count integer;
  v_expected_page_size integer;
  v_page_hash text;
  v_first_missing_page integer;
begin
  select experiment.workspace_id into v_parent_workspace_id
  from private.authoring_experiment_variant_revisions revision
  join private.authoring_experiments experiment
    on experiment.id=revision.experiment_id
  where revision.id=(p_variant_revision_ref->>'id')::uuid
    and revision.experiment_id=p_experiment_id
    and revision.child_workspace_id=p_workspace_id;
  if not found then
    raise exception 'VariantRevision da rota inexistente.' using errcode='P0002';
  end if;
  v_begin := private.begin_authoring_experiment_request_v1(
    p_actor_id, v_parent_workspace_id, p_experiment_id, p_request_id,
    p_payload_hash, p_expected_experiment_revision,
    p_expected_workspace_revision, 'register_variant_evidence',
    jsonb_build_object(
      'childWorkspaceId',p_workspace_id,
      'variantRevisionRef', p_variant_revision_ref,
      'mandateRef',p_mandate_ref,'evidence', p_evidence
    )
  );
  if (v_begin->>'replayed')::boolean then return v_begin->'result'; end if;
  v_argument_hash := v_begin->>'argumentHash';
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'author'
  );
  if not private.authoring_design_closed_object_v1(
       p_variant_revision_ref,array['id','version'],array['id','version']
     ) or not private.authoring_design_closed_object_v1(
       p_mandate_ref,array['id','version'],array['id','version']
     ) or not private.authoring_design_closed_object_v1(
       p_evidence,
       array[
         'differenceRunRef','baselineRef','candidateVariantRevisionRef',
         'algorithmRef','pageOrdinal','pageCount','hunkCount','hunks'
       ],
       array[
         'differenceRunRef','baselineRef','candidateVariantRevisionRef',
         'algorithmRef','pageOrdinal','pageCount','hunkCount','hunks'
       ]
     )
     or not private.authoring_design_closed_object_v1(
       p_evidence->'differenceRunRef',array['id','version'],array['id','version']
     )
     or not private.authoring_design_closed_object_v1(
       p_evidence->'baselineRef',array['kind','ref'],array['kind','ref']
     )
     or not private.authoring_design_closed_object_v1(
       p_evidence#>'{baselineRef,ref}',array['id','version'],array['id','version']
     )
     or not private.authoring_design_closed_object_v1(
       p_evidence->'candidateVariantRevisionRef',array['id','version'],array['id','version']
     )
     or not private.authoring_design_closed_object_v1(
       p_evidence->'algorithmRef',array['id','version'],array['id','version']
     )
     or p_evidence#>>'{baselineRef,kind}' not in ('base', 'variant_revision')
     or p_evidence#>>'{algorithmRef,id}' is distinct from
       'canonical-json-pointer-fnv1a64-diff'
     or p_evidence#>>'{algorithmRef,version}' is distinct from '2.0.0'
     or p_evidence#>>'{differenceRunRef,version}' !~ '^[a-f0-9]{64}$'
     or p_evidence#>>'{candidateVariantRevisionRef,id}' is distinct from
       p_variant_revision_ref->>'id'
     or p_evidence#>>'{candidateVariantRevisionRef,version}' is distinct from
       p_variant_revision_ref->>'version'
     or p_evidence->>'pageOrdinal' !~ '^[1-9][0-9]*$'
     or p_evidence->>'pageCount' !~ '^[1-9][0-9]*$'
     or (p_evidence->>'pageOrdinal')::integer >
       (p_evidence->>'pageCount')::integer
     or (p_evidence->>'pageCount')::integer > 250
     or jsonb_typeof(p_evidence->'hunkCount') <> 'number'
     or p_evidence->>'hunkCount' !~ '^[0-9]+$'
     or (p_evidence->>'hunkCount')::integer > 5000
     or jsonb_typeof(p_evidence->'pageOrdinal') <> 'number'
     or jsonb_typeof(p_evidence->'pageCount') <> 'number'
     or jsonb_typeof(p_evidence->'hunks') <> 'array'
     or jsonb_array_length(p_evidence->'hunks') > 20 then
    raise exception 'Página factual da diferença é inválida.' using errcode = '22023';
  end if;
  v_page_ordinal := (p_evidence->>'pageOrdinal')::integer;
  v_page_count := (p_evidence->>'pageCount')::integer;
  v_hunk_count := (p_evidence->>'hunkCount')::integer;
  v_expected_page_size := case
    when v_hunk_count = 0 then 0
    when v_page_ordinal < v_page_count then 20
    else v_hunk_count - ((v_page_count - 1) * 20)
  end;
  if v_page_count <> greatest(1, ((v_hunk_count + 19) / 20))
     or jsonb_array_length(p_evidence->'hunks') <> v_expected_page_size then
    raise exception 'A página não corresponde ao recorte factual pinado.'
      using errcode = '23514';
  end if;
  begin
    v_baseline_ref := (p_evidence#>>'{baselineRef,ref,id}')::uuid;
    v_difference_run_id := (p_evidence#>>'{differenceRunRef,id}')::uuid;
  exception when invalid_text_representation then
    raise exception 'Referência da diferença inválida.' using errcode = '22023';
  end;
  select * into v_experiment
  from private.authoring_experiments experiment
  where experiment.id = p_experiment_id
    and experiment.workspace_id = v_parent_workspace_id
  for update;
  if not found or v_experiment.revision <> p_expected_experiment_revision
     or v_experiment.state not in ('generating', 'ready', 'correction_required') then
    raise exception 'O experimento mudou antes da evidência.' using errcode = '40001';
  end if;
  select revision.* into v_candidate
  from private.authoring_experiment_variant_revisions revision
  join private.authoring_experiment_variants variant
    on variant.id = revision.variant_id
  where revision.id = (p_variant_revision_ref->>'id')::uuid
    and revision.experiment_id = p_experiment_id
    and variant.current_variant_revision_id = revision.id;
  if not found or v_candidate.status not in ('generating', 'ready')
     or v_candidate.variant_revision::text<>
       p_variant_revision_ref->>'version' then
    raise exception 'VariantRevision corrente indisponível.' using errcode = '40001';
  end if;
  select * into v_child
  from private.authoring_workspaces workspace
  where workspace.id = v_candidate.child_workspace_id
    and workspace.deleted_at is null
  for update;
  if not found or v_child.id<>p_workspace_id
     or v_child.revision <> p_expected_workspace_revision then
    raise exception 'A child mudou antes da evidência.' using errcode = '40001';
  end if;
  v_evidence_mandate_id := 'experiment:' || v_candidate.id::text || ':audit';
  if v_child.authoring_state#>>'{mandate,kind}' is distinct from 'audit'
     or v_child.authoring_state#>>'{mandate,id}' is distinct from
       v_evidence_mandate_id
     or p_mandate_ref->>'id' is distinct from v_evidence_mandate_id
     or p_mandate_ref->>'version' is distinct from
       v_child.authoring_state#>>'{mandate,decidedAtRevision}'
     or v_child.authoring_state#>>'{mandate,decidedAtRevision}' !~
       '^[1-9][0-9]{0,18}$' then
    raise exception 'A evidência exige o mandato de auditoria exato da variante.'
      using errcode = '42501';
  end if;
  v_evidence_mandate_revision :=
    (v_child.authoring_state#>>'{mandate,decidedAtRevision}')::bigint;
  select * into v_publication
  from private.authoring_workspace_publications publication
  where publication.workspace_id = v_child.id
    and publication.workspace_course_id = v_candidate.workspace_course_id
    and publication.target = 'private'
    and publication.course_id = v_candidate.publication_course_id
    and publication.published_workspace_revision = v_child.revision
  for share;
  if not found or not exists (
    select 1 from public.courses course
    where course.id = v_publication.course_id
      and course.status = 'published'
      and course.deleted_at is null
      and course.document_storage_enabled
      and course.completion_state = 'complete'
      and course.content_hash = v_publication.content_hash
      and course.current_revision_hash = v_publication.content_hash
      and course.revision_artifact_hash = v_publication.content_hash
  ) then
    raise exception 'Materialização privada da variante não está corrente.'
      using errcode = '40001';
  end if;
  v_audit_count := private.capture_authoring_experiment_variant_audit_v1(
    v_candidate.id
  );
  if p_evidence#>>'{baselineRef,kind}' = 'base' then
    if v_baseline_ref <> v_candidate.base_revision_id then
      raise exception 'Baseline base diverge da variante.' using errcode = '23514';
    end if;
    select base.artifact_hash into v_baseline_artifact
    from private.authoring_experiment_base_revisions base
    where base.id = v_baseline_ref and base.experiment_id = p_experiment_id;
  else
    select baseline.final_artifact_hash into v_baseline_artifact
    from private.authoring_experiment_variant_revisions baseline
    join private.authoring_experiment_variants baseline_variant
      on baseline_variant.id = baseline.variant_id
    join private.authoring_experiment_variants candidate_variant
      on candidate_variant.id = v_candidate.variant_id
    where baseline.id = v_baseline_ref
      and baseline.experiment_id = p_experiment_id
      and baseline.protocol_revision = v_candidate.protocol_revision
      and baseline.id <> v_candidate.id
      and baseline.status in ('ready', 'frozen')
      and baseline_variant.current_variant_revision_id = baseline.id
      and baseline_variant.ordinal < candidate_variant.ordinal;
  end if;
  if v_baseline_artifact is null
     or v_baseline_artifact is distinct from
       p_evidence#>>'{baselineRef,ref,version}' then
    raise exception 'Baseline factual exata não está disponível.' using errcode = '23514';
  end if;

  select * into v_run
  from private.authoring_experiment_difference_runs run
  where run.id = v_difference_run_id
  for update;
  if not found then
    insert into private.authoring_experiment_difference_runs(
      id, experiment_id, baseline_kind, base_revision_id,
      baseline_variant_revision_id, candidate_variant_revision_id,
      algorithm_id, algorithm_version, baseline_artifact_hash,
      variant_artifact_hash, factual_hash, hunk_count, page_count, created_by
    ) values (
      v_difference_run_id, p_experiment_id,
      p_evidence#>>'{baselineRef,kind}',
      case when p_evidence#>>'{baselineRef,kind}' = 'base' then v_baseline_ref end,
      case when p_evidence#>>'{baselineRef,kind}' = 'variant_revision' then v_baseline_ref end,
      v_candidate.id, p_evidence#>>'{algorithmRef,id}',
      p_evidence#>>'{algorithmRef,version}', v_baseline_artifact,
      v_publication.content_hash, p_evidence#>>'{differenceRunRef,version}',
      v_hunk_count, v_page_count, p_actor_id
    ) returning * into v_run;
  elsif v_run.experiment_id <> p_experiment_id
     or v_run.candidate_variant_revision_id <> v_candidate.id
     or v_run.baseline_kind <> p_evidence#>>'{baselineRef,kind}'
     or v_run.base_revision_id is distinct from
       (case when p_evidence#>>'{baselineRef,kind}' = 'base'
         then v_baseline_ref end)
     or v_run.baseline_variant_revision_id is distinct from
       (case when p_evidence#>>'{baselineRef,kind}' = 'variant_revision'
         then v_baseline_ref end)
     or v_run.algorithm_id <> p_evidence#>>'{algorithmRef,id}'
     or v_run.algorithm_version <> p_evidence#>>'{algorithmRef,version}'
     or v_run.baseline_artifact_hash <> v_baseline_artifact
     or v_run.variant_artifact_hash <> v_publication.content_hash
     or v_run.factual_hash <> p_evidence#>>'{differenceRunRef,version}'
     or v_run.hunk_count <> v_hunk_count
     or v_run.page_count <> v_page_count then
    raise exception 'differenceRunRef reutilizada com outra evidência.'
      using errcode = '23505';
  end if;

  select min(missing.page_ordinal) into v_first_missing_page
  from generate_series(1,v_run.page_count) missing(page_ordinal)
  where not exists (
    select 1 from private.authoring_experiment_difference_pages page
    where page.difference_run_id=v_run.id
      and page.page_ordinal=missing.page_ordinal
  );
  if v_page_ordinal is distinct from v_first_missing_page then
    raise exception 'A evidência deve continuar exatamente na primeira página ausente.'
      using errcode='40001';
  end if;

  for v_hunk in select value from jsonb_array_elements(p_evidence->'hunks')
  loop
    if not private.authoring_design_closed_object_v1(
         v_hunk,
         array[
           'differenceRef','differenceId','ordinal','path','kind',
           'factualSummary','beforeHash','afterHash','evidenceRefs'
         ],
         array[
           'differenceRef','differenceId','ordinal','path','kind',
           'factualSummary','beforeHash','afterHash','evidenceRefs'
         ]
       )
       or not private.authoring_design_closed_object_v1(
         v_hunk->'differenceRef',array['id','version'],array['id','version']
       )
       or v_hunk->>'differenceId' !~ '^[A-Za-z0-9][A-Za-z0-9._:/~-]*$'
       or char_length(v_hunk->>'differenceId') > 500
       or v_hunk#>>'{differenceRef,id}' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
       or v_hunk#>>'{differenceRef,version}' !~ '^[a-f0-9]{64}$'
       or jsonb_typeof(v_hunk->'ordinal') <> 'number'
       or v_hunk->>'ordinal' !~ '^[1-9][0-9]*$'
       or (v_hunk->>'ordinal')::integer <= ((v_page_ordinal - 1) * 20)
       or (v_hunk->>'ordinal')::integer > least(v_page_ordinal * 20, v_hunk_count)
       or jsonb_typeof(v_hunk->'path') <> 'array'
       or jsonb_array_length(v_hunk->'path') not between 1 and 16
       or v_hunk->>'kind' not in ('added','removed','changed','moved')
       or nullif(btrim(v_hunk->>'factualSummary'), '') is null
       or char_length(v_hunk->>'factualSummary') > 1000
       or (
         jsonb_typeof(v_hunk->'beforeHash') <> 'null'
         and v_hunk->>'beforeHash' !~ '^[a-f0-9]{64}$'
       )
       or (
         jsonb_typeof(v_hunk->'afterHash') <> 'null'
         and v_hunk->>'afterHash' !~ '^[a-f0-9]{64}$'
       )
       or jsonb_typeof(v_hunk->'evidenceRefs') <> 'array'
       or jsonb_array_length(v_hunk->'evidenceRefs') > 32
       or private.authoring_design_contains_forbidden_key_v1(v_hunk) then
      raise exception 'Hunk factual inválido.' using errcode = '22023';
    end if;
    insert into private.authoring_experiment_difference_hunks(
      difference_run_id, difference_ref_id, hunk_id, hunk_hash,
      ordinal, path, change_kind,
      factual_summary, before_hash, after_hash, evidence_refs
    )
    select v_run.id, v_hunk#>>'{differenceRef,id}',
      v_hunk->>'differenceId',v_hunk#>>'{differenceRef,version}',
      (v_hunk->>'ordinal')::integer,
      array(select value #>> '{}' from jsonb_array_elements(v_hunk->'path')),
      v_hunk->>'kind', btrim(v_hunk->>'factualSummary'),
      nullif(v_hunk->>'beforeHash', ''), nullif(v_hunk->>'afterHash', ''),
      array(select value #>> '{}'
        from jsonb_array_elements(v_hunk->'evidenceRefs'))
    on conflict(difference_run_id, hunk_id) do nothing;
    if not exists (
      select 1 from private.authoring_experiment_difference_hunks stored
      where stored.difference_run_id = v_run.id
        and stored.difference_ref_id=v_hunk#>>'{differenceRef,id}'
        and stored.hunk_id = v_hunk->>'differenceId'
        and stored.hunk_hash = v_hunk#>>'{differenceRef,version}'
        and stored.ordinal = (v_hunk->>'ordinal')::integer
        and stored.change_kind = v_hunk->>'kind'
        and stored.factual_summary = btrim(v_hunk->>'factualSummary')
        and stored.path = array(
          select value #>> '{}' from jsonb_array_elements(v_hunk->'path')
        )
        and stored.before_hash is not distinct from nullif(v_hunk->>'beforeHash', '')
        and stored.after_hash is not distinct from nullif(v_hunk->>'afterHash', '')
        and stored.evidence_refs = array(
          select value #>> '{}' from jsonb_array_elements(v_hunk->'evidenceRefs')
        )
    ) then
      raise exception 'Hunk repetido diverge da evidência original.'
        using errcode = '23505';
    end if;
  end loop;
  v_page_hash := private.authoring_experiment_hash_v1(p_evidence);
  insert into private.authoring_experiment_difference_pages(
    difference_run_id, page_ordinal, page_hash, item_count
  ) values (
    v_run.id, v_page_ordinal, v_page_hash, v_expected_page_size
  ) on conflict(difference_run_id, page_ordinal) do nothing;
  if not exists (
    select 1 from private.authoring_experiment_difference_pages page
    where page.difference_run_id=v_run.id
      and page.page_ordinal=v_page_ordinal
      and page.page_hash=v_page_hash
      and page.item_count=v_expected_page_size
  ) then
    raise exception 'Página factual repetida diverge da original.'
      using errcode = '23505';
  end if;
  select count(*) into v_count
  from private.authoring_experiment_difference_hunks hunk
  where hunk.difference_run_id = v_run.id;
  select min(missing.page_ordinal) into v_first_missing_page
  from generate_series(1, v_run.page_count) missing(page_ordinal)
  where not exists (
    select 1 from private.authoring_experiment_difference_pages page
    where page.difference_run_id=v_run.id
      and page.page_ordinal=missing.page_ordinal
  );
  if v_count > v_run.hunk_count then
    raise exception 'A rodada recebeu hunks além do total pinado.' using errcode = '23514';
  end if;
  -- factualHash é calculado sobre canonicalJsonStringify no backend que leu e
  -- verificou os bytes imutáveis. jsonb::text tem serialização distinta; aqui
  -- fechamos identidade da run, ordinais, unicidade, contagem e replay sem
  -- recomputar falsamente o hash com outro algoritmo textual.

  if v_candidate.final_artifact_hash is null then
    perform private.authorize_authoring_experiment_variant_write_v1(v_candidate.id);
    update private.authoring_experiment_variant_revisions revision
    set evidence_workspace_revision = v_child.revision,
        evidence_mandate_id = v_evidence_mandate_id,
        evidence_mandate_revision = v_evidence_mandate_revision,
        final_artifact_hash = v_publication.content_hash,
        final_content_hash = v_publication.content_hash,
        evidence_recorded_at = now()
    where revision.id = v_candidate.id;
  elsif v_candidate.final_artifact_hash <> v_publication.content_hash
     or v_candidate.evidence_workspace_revision <> v_child.revision
     or v_candidate.evidence_mandate_id <> v_evidence_mandate_id
     or v_candidate.evidence_mandate_revision <>
       v_evidence_mandate_revision then
    raise exception 'A materialização mudou entre páginas de evidência.'
      using errcode = '40001';
  end if;
  if exists (
       select 1
       from private.authoring_experiment_difference_runs run
       where run.candidate_variant_revision_id = v_candidate.id
         and run.baseline_kind = 'base'
         and run.base_revision_id = v_candidate.base_revision_id
         and (select count(*)
              from private.authoring_experiment_difference_hunks hunk
              where hunk.difference_run_id = run.id) = run.hunk_count
         and (select count(*)
              from private.authoring_experiment_difference_pages page
              where page.difference_run_id = run.id) = run.page_count
     )
     and not exists (
       select 1
       from private.authoring_experiment_variants earlier
       join private.authoring_experiment_variants candidate_variant
         on candidate_variant.id = v_candidate.variant_id
       join private.authoring_experiment_variant_revisions earlier_revision
         on earlier_revision.id = earlier.current_variant_revision_id
       where earlier.experiment_id = p_experiment_id
         and earlier.protocol_revision = v_candidate.protocol_revision
         and earlier.ordinal < candidate_variant.ordinal
         and not exists (
           select 1
           from private.authoring_experiment_difference_runs run
           where run.candidate_variant_revision_id = v_candidate.id
             and run.baseline_kind = 'variant_revision'
             and run.baseline_variant_revision_id = earlier_revision.id
             and (select count(*)
                  from private.authoring_experiment_difference_hunks hunk
                  where hunk.difference_run_id = run.id) = run.hunk_count
             and (select count(*)
                  from private.authoring_experiment_difference_pages page
                  where page.difference_run_id = run.id) = run.page_count
         )
     ) then
    perform private.authorize_authoring_experiment_variant_write_v1(v_candidate.id);
    update private.authoring_experiment_variant_revisions revision
    set status = 'ready'
    where revision.id = v_candidate.id and revision.status = 'generating';
  end if;
  update private.authoring_experiments experiment
  set state = case when not exists (
        select 1
        from private.authoring_experiment_variants variant
        join private.authoring_experiment_variant_revisions revision
          on revision.id = variant.current_variant_revision_id
        where variant.experiment_id = p_experiment_id
          and variant.protocol_revision = experiment.current_protocol_revision
          and revision.status not in ('ready', 'frozen')
      ) then 'ready' else 'generating' end,
      revision = revision + 1, updated_by = p_actor_id, updated_at = now()
  where experiment.id = p_experiment_id;
  delete from private.authoring_experiment_lock_write_tokens token
  where token.transaction_id = txid_current()
    and token.variant_revision_id = v_candidate.id;
  v_result := jsonb_build_object(
    'parentWorkspaceId',v_parent_workspace_id,
    'targetWorkspaceId',p_workspace_id,
    'workspaceId', p_workspace_id, 'experimentId', p_experiment_id,
    'experimentRevision', p_expected_experiment_revision + 1,
    'variantRevisionRef', p_variant_revision_ref,
    'differenceRunRef', jsonb_build_object(
      'id', v_run.id, 'version', v_run.factual_hash
    ),
    'differenceRunRefs',jsonb_build_array(jsonb_build_object(
      'id',v_run.id,'version',v_run.factual_hash
    )),
    'recordedCount', v_count, 'expectedCount', v_run.hunk_count,
    'pageCount',v_run.page_count,
    'firstMissingPageOrdinal',v_first_missing_page,
    'pendingCount',v_run.hunk_count-v_count,
    'status',case when v_count=v_run.hunk_count and v_first_missing_page is null
      then 'complete' else 'partial' end,
    'auditedMicrosequenceCount', v_audit_count,
    'complete', v_count = v_run.hunk_count and v_first_missing_page is null
  );
  return private.complete_authoring_experiment_request_v1(
    p_actor_id, v_parent_workspace_id, p_experiment_id, p_request_id,
    p_payload_hash, 'register_variant_evidence', v_argument_hash, v_result
  );
end;
$function$;

create function public.record_authoring_experiment_diff_classification_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_experiment_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_expected_experiment_revision bigint,
  p_expected_workspace_revision bigint,
  p_difference_run_ref jsonb,
  p_variant_revision_ref jsonb,
  p_mandate_ref jsonb,
  p_scope_path text[],
  p_classifications jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_begin jsonb;
  v_argument_hash text;
  v_experiment private.authoring_experiments%rowtype;
  v_run private.authoring_experiment_difference_runs%rowtype;
  v_candidate private.authoring_experiment_variant_revisions%rowtype;
  v_child private.authoring_workspaces%rowtype;
  v_parent_workspace_id uuid;
  v_route_child_workspace_id uuid;
  v_base_scope_path text[];
  v_item jsonb;
  v_hunk private.authoring_experiment_difference_hunks%rowtype;
  v_evidence_refs text[];
  v_count integer;
  v_result jsonb;
begin
  -- A rota é imutável e serve apenas para localizar o ledger no parent. A
  -- autoridade continua sendo verificada no child depois do replay.
  select experiment.workspace_id, candidate.child_workspace_id
  into v_parent_workspace_id, v_route_child_workspace_id
  from private.authoring_experiment_difference_runs run
  join private.authoring_experiment_variant_revisions candidate
    on candidate.id = run.candidate_variant_revision_id
  join private.authoring_experiments experiment
    on experiment.id = run.experiment_id
  where run.id = (p_difference_run_ref->>'id')::uuid
    and run.experiment_id = p_experiment_id;
  if not found then
    raise exception 'Rodada factual inexistente.' using errcode = 'P0002';
  end if;
  v_begin := private.begin_authoring_experiment_request_v1(
    p_actor_id, v_parent_workspace_id, p_experiment_id, p_request_id,
    p_payload_hash, p_expected_experiment_revision,
    p_expected_workspace_revision, 'classify_difference',
    jsonb_build_object(
      'childWorkspaceId', p_workspace_id,
      'differenceRunRef', p_difference_run_ref,
      'variantRevisionRef',p_variant_revision_ref,
      'mandateRef', p_mandate_ref,
      'scopePath',to_jsonb(p_scope_path),
      'classifications', p_classifications
    )
  );
  if (v_begin->>'replayed')::boolean then return v_begin->'result'; end if;
  v_argument_hash := v_begin->>'argumentHash';
  if p_workspace_id is distinct from v_route_child_workspace_id then
    raise exception 'A rodada não pertence ao child solicitado.'
      using errcode = '23503';
  end if;
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'author'
  );
  if not private.authoring_design_closed_object_v1(
       p_mandate_ref, array['id','version'], array['id','version']
     )
     or not private.authoring_design_closed_object_v1(
       p_difference_run_ref,array['id','version'],array['id','version']
     )
     or not private.authoring_design_closed_object_v1(
       p_variant_revision_ref,array['id','version'],array['id','version']
     )
     or nullif(btrim(p_mandate_ref->>'id'), '') is null
     or p_mandate_ref->>'version' !~ '^[1-9][0-9]{0,18}$'
     or jsonb_typeof(p_classifications) <> 'array'
     or jsonb_array_length(p_classifications) not between 1 and 20 then
    raise exception 'Lote de classificações inválido.' using errcode = '22023';
  end if;
  select * into v_experiment
  from private.authoring_experiments experiment
  where experiment.id = p_experiment_id
    and experiment.workspace_id = v_parent_workspace_id
  for update;
  if not found or v_experiment.revision <> p_expected_experiment_revision then
    raise exception 'O experimento mudou antes da classificação.'
      using errcode = '40001';
  end if;
  select * into v_run
  from private.authoring_experiment_difference_runs run
  where run.id = (p_difference_run_ref->>'id')::uuid
    and run.experiment_id = p_experiment_id;
  if not found or v_run.factual_hash<>p_difference_run_ref->>'version' or (
    select count(*) from private.authoring_experiment_difference_hunks hunk
    where hunk.difference_run_id = v_run.id
  ) <> v_run.hunk_count then
    raise exception 'A rodada factual ainda não está completa.' using errcode = '23514';
  end if;
  select revision.* into v_candidate
  from private.authoring_experiment_variant_revisions revision
  join private.authoring_experiment_variants variant
    on variant.id = revision.variant_id
  where revision.id = v_run.candidate_variant_revision_id
    and variant.current_variant_revision_id = revision.id;
  if not found or v_candidate.status not in ('generating', 'ready')
     or v_candidate.id::text<>p_variant_revision_ref->>'id'
     or v_candidate.variant_revision::text<>p_variant_revision_ref->>'version'
     or v_candidate.evidence_workspace_revision is distinct from
       p_expected_workspace_revision then
    raise exception 'A VariantRevision mudou antes da classificação.'
      using errcode = '40001';
  end if;
  select base.scope_path into v_base_scope_path
  from private.authoring_experiment_base_revisions base
  where base.id=v_candidate.base_revision_id;
  if p_scope_path is null
     or cardinality(p_scope_path)<cardinality(v_base_scope_path)
     or p_scope_path[1:cardinality(v_base_scope_path)] is distinct from
       v_base_scope_path then
    raise exception 'A classificação não pertence ao escopo da variante.'
      using errcode='23503';
  end if;
  select * into v_child
  from private.authoring_workspaces workspace
  where workspace.id = v_candidate.child_workspace_id
    and workspace.deleted_at is null
  for share;
  if not found
     or v_child.revision <> p_expected_workspace_revision
     or v_candidate.evidence_mandate_id is null
     or p_mandate_ref->>'id' <> v_candidate.evidence_mandate_id
     or (p_mandate_ref->>'version')::bigint <>
       v_candidate.evidence_mandate_revision
     or v_child.authoring_state#>>'{mandate,kind}' is distinct from 'audit'
     or v_child.authoring_state#>>'{mandate,id}' is distinct from
       v_candidate.evidence_mandate_id
     or (v_child.authoring_state#>>'{mandate,decidedAtRevision}')::bigint is
       distinct from v_candidate.evidence_mandate_revision then
    raise exception 'Mandato experimental ausente, stale ou divergente.'
      using errcode = '42501';
  end if;
  for v_item in select value from jsonb_array_elements(p_classifications)
  loop
    if not private.authoring_design_closed_object_v1(
         v_item,
         array['differenceRef','classification','publicRationale','evidenceRefs'],
         array['differenceRef','classification','publicRationale','evidenceRefs']
       )
       or not private.authoring_design_closed_object_v1(
         v_item->'differenceRef',array['id','version'],array['id','version']
       )
       or v_item->>'classification' not in (
         'directly_required', 'inevitable_derived', 'accidental_unplanned'
       )
       or nullif(btrim(v_item->>'publicRationale'), '') is null
       or char_length(v_item->>'publicRationale') > 2000
       or jsonb_typeof(v_item->'evidenceRefs') <> 'array'
       or jsonb_array_length(v_item->'evidenceRefs') > 32
       or private.authoring_design_contains_forbidden_key_v1(v_item) then
      raise exception 'Classificação semântica inválida.' using errcode = '22023';
    end if;
    v_evidence_refs := array(
      select value #>> '{}' from jsonb_array_elements(v_item->'evidenceRefs')
    );
    select * into v_hunk
    from private.authoring_experiment_difference_hunks hunk
    where hunk.difference_run_id=v_run.id
      and hunk.difference_ref_id=v_item#>>'{differenceRef,id}'
      and hunk.hunk_hash=v_item#>>'{differenceRef,version}';
    if not found or not (v_evidence_refs <@ v_hunk.evidence_refs) then
      raise exception 'Classificação referencia evidência factual inexistente.'
        using errcode = '23503';
    end if;
    insert into private.authoring_experiment_diff_classifications(
      experiment_id, difference_run_id, hunk_id, classification,
      public_evidence, evidence_refs, experiment_revision, classified_by
    ) values (
      p_experiment_id, v_run.id, v_hunk.hunk_id,
      v_item->>'classification', btrim(v_item->>'publicRationale'),
      v_evidence_refs, p_expected_experiment_revision + 1, p_actor_id
    );
  end loop;
  update private.authoring_experiments experiment
  set revision = revision + 1, updated_by = p_actor_id, updated_at = now()
  where experiment.id = p_experiment_id;
  select count(*) into v_count
  from private.authoring_experiment_diff_classifications classification
  where classification.difference_run_id = v_run.id;
  v_result := jsonb_build_object(
    'workspaceId', p_workspace_id, 'experimentId', p_experiment_id,
    'experimentRevision', p_expected_experiment_revision + 1,
    'differenceRunRef', jsonb_build_object(
      'id', v_run.id, 'version', v_run.factual_hash
    ),
    'variantRevisionRef',p_variant_revision_ref,
    'classificationRef',jsonb_build_object(
      'id','classification-batch:'||v_run.id::text||':'||p_request_id,
      'version',(p_expected_experiment_revision+1)::text
    ),
    'status',case when v_count=v_run.hunk_count then 'classified' else 'partial' end,
    'recordedCount',jsonb_array_length(p_classifications),
    'classifiedCount', v_count,
    'pendingCount',v_run.hunk_count-v_count,
    'expectedCount', v_run.hunk_count
  );
  return private.complete_authoring_experiment_request_v1(
    p_actor_id, v_parent_workspace_id, p_experiment_id, p_request_id,
    p_payload_hash, 'classify_difference', v_argument_hash, v_result
  );
end;
$function$;

create function private.issue_authoring_experiment_enrollment_code_v1(
  p_experiment_id uuid,
  p_protocol_revision integer,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, extensions
as $function$
declare
  v_plaintext text;
  v_hash text;
  v_expires_at timestamptz := coalesce(
    p_expires_at, statement_timestamp() + interval '30 days'
  );
begin
  if v_expires_at <= statement_timestamp() + interval '5 minutes' then
    raise exception 'A expiração do código de ingresso é inválida.'
      using errcode = '22023';
  end if;
  update private.authoring_experiment_enrollment_codes code
  set active = false, invalidated_at = coalesce(invalidated_at, now())
  where code.experiment_id = p_experiment_id and code.active;
  loop
    v_plaintext := encode(extensions.gen_random_bytes(24), 'base64');
    v_plaintext := replace(replace(rtrim(v_plaintext, '='), '+', '-'), '/', '_');
    v_hash := encode(extensions.digest(convert_to(v_plaintext, 'UTF8'), 'sha256'), 'hex');
    begin
      insert into private.authoring_experiment_enrollment_codes(
        experiment_id, protocol_revision, code_hash, expires_at
      ) values(p_experiment_id, p_protocol_revision, v_hash, v_expires_at);
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;
  return jsonb_build_object(
    'enrollmentCode', v_plaintext,
    'expiresAt', v_expires_at
  );
end;
$function$;

create function public.manage_authoring_experiment_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_experiment_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_expected_experiment_revision bigint,
  p_expected_workspace_revision bigint,
  p_operation text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_begin jsonb;
  v_argument_hash text;
  v_workspace private.authoring_workspaces%rowtype;
  v_experiment private.authoring_experiments%rowtype;
  v_protocol private.authoring_experiment_protocol_revisions%rowtype;
  v_candidate private.authoring_experiment_variant_revisions%rowtype;
  v_child private.authoring_workspaces%rowtype;
  v_classification private.authoring_experiment_diff_classifications%rowtype;
  v_difference private.authoring_experiment_difference_hunks%rowtype;
  v_run private.authoring_experiment_difference_runs%rowtype;
  v_result jsonb;
  v_helper jsonb;
  v_new_experiment_id uuid;
  v_protocol_revision integer;
  v_title text;
  v_key text;
  v_ref_version text;
  v_decision text;
  v_note text;
  v_transition text;
  v_has_assignments boolean;
  v_pending integer;
  v_later record;
  v_correction_id uuid;
begin
  v_begin := private.begin_authoring_experiment_request_v1(
    p_actor_id, p_workspace_id, p_experiment_id, p_request_id,
    p_payload_hash, p_expected_experiment_revision,
    p_expected_workspace_revision, p_operation, p_payload
  );
  if (v_begin->>'replayed')::boolean then
    return v_begin->'result';
  end if;
  v_argument_hash := v_begin->>'argumentHash';

  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'research'
  );
  select * into v_workspace
  from private.authoring_workspaces workspace
  where workspace.id = p_workspace_id and workspace.deleted_at is null
  for update;
  if not found then
    raise exception 'Workspace autoral inexistente.' using errcode = 'P0002';
  end if;

  if p_operation = 'save_protocol' then
    if not private.authoring_design_closed_object_v1(
         p_payload, array['protocol'], array['protocol']
       ) or jsonb_typeof(p_payload->'protocol') <> 'object' then
      raise exception 'Payload de protocolo inválido.' using errcode = '22023';
    end if;
    if p_experiment_id is null then
      if p_expected_experiment_revision <> 0 then
        raise exception 'A criação exige revisão experimental zero.'
          using errcode = '40001';
      end if;
      v_new_experiment_id := extensions.gen_random_uuid();
      v_title := p_payload#>>'{protocol,title}';
      v_key := 'experiment-' || substr(
        private.authoring_experiment_hash_v1(jsonb_build_object(
          'workspaceId', p_workspace_id, 'id', v_new_experiment_id
        )), 1, 24
      );
      insert into private.authoring_experiments(
        id, workspace_id, experiment_key, title, state, revision,
        current_protocol_revision, created_by, updated_by
      ) values(
        v_new_experiment_id, p_workspace_id, v_key, v_title,
        'draft', 1, 1, p_actor_id, p_actor_id
      );
      perform private.insert_authoring_experiment_protocol_v1(
        p_actor_id, p_workspace_id, v_new_experiment_id, 1,
        p_payload->'protocol'
      );
      v_result := jsonb_build_object(
        'workspaceId', p_workspace_id,
        'workspaceRevision', v_workspace.revision,
        'experimentId', v_new_experiment_id,
        'experimentRevision', 1,
        'state', 'draft',
        'protocolRef', jsonb_build_object(
          'id', v_new_experiment_id, 'version', '1'
        )
      );
      return private.complete_authoring_experiment_request_v1(
        p_actor_id, p_workspace_id, null, p_request_id, p_payload_hash,
        p_operation, v_argument_hash, v_result
      );
    end if;
  end if;

  if p_experiment_id is null then
    raise exception 'experimentId é obrigatório nesta operação.'
      using errcode = '22023';
  end if;
  select * into v_experiment
  from private.authoring_experiments experiment
  where experiment.id = p_experiment_id
    and experiment.workspace_id = p_workspace_id
  for update;
  if not found then
    raise exception 'Experimento inexistente.' using errcode = 'P0002';
  end if;
  if v_experiment.revision <> p_expected_experiment_revision then
    raise exception 'O experimento mudou desde a leitura.' using errcode = '40001';
  end if;

  if p_operation = 'save_protocol' then
    if v_experiment.state <> 'draft' then
      raise exception 'Somente um draft pode receber nova revisão de protocolo.'
        using errcode = '23514';
    end if;
    v_protocol_revision := coalesce(v_experiment.current_protocol_revision, 0) + 1;
    perform private.insert_authoring_experiment_protocol_v1(
      p_actor_id, p_workspace_id, p_experiment_id, v_protocol_revision,
      p_payload->'protocol'
    );
    update private.authoring_experiments experiment
    set title = p_payload#>>'{protocol,title}',
        current_protocol_revision = v_protocol_revision,
        revision = revision + 1, updated_by = p_actor_id, updated_at = now()
    where experiment.id = p_experiment_id;
    v_result := jsonb_build_object(
      'workspaceId', p_workspace_id,
      'workspaceRevision', v_workspace.revision,
      'experimentId', p_experiment_id,
      'experimentRevision', p_expected_experiment_revision + 1,
      'state', 'draft',
      'protocolRef', jsonb_build_object(
        'id', p_experiment_id, 'version', v_protocol_revision::text
      )
    );
  elsif p_operation = 'validate' then
    if p_expected_workspace_revision is null then
      raise exception 'validate exige expectedWorkspaceRevision.'
        using errcode = '22023';
    end if;
    v_helper := private.validate_authoring_experiment_base_v1(
      p_actor_id, p_workspace_id, p_experiment_id,
      p_expected_workspace_revision
    );
    v_result := jsonb_build_object(
      'workspaceId', p_workspace_id,
      'workspaceRevision', v_helper->'workspaceRevision',
      'experimentId', p_experiment_id,
      'experimentRevision', p_expected_experiment_revision + 1,
      'state', 'validated',
      'resultRef', jsonb_build_object(
        'id', v_helper->>'baseRevisionId',
        'version', v_helper->>'workspaceRevision'
      )
    );
  elsif p_operation = 'generate_variants' then
    if p_expected_workspace_revision is null then
      raise exception 'generate_variants exige expectedWorkspaceRevision.'
        using errcode = '22023';
    end if;
    v_helper := private.generate_authoring_experiment_variants_v1(
      p_actor_id, p_workspace_id, p_experiment_id,
      p_expected_workspace_revision, p_payload->>'participantContinuity'
    );
    v_result := jsonb_build_object(
      'workspaceId', p_workspace_id,
      'workspaceRevision', p_expected_workspace_revision,
      'experimentId', p_experiment_id,
      'experimentRevision', p_expected_experiment_revision + 1,
      'state', 'generating',
      'variantSetRef', jsonb_build_object(
        'id', 'variant-set:' || p_experiment_id::text,
        'version', private.authoring_experiment_hash_v1(v_helper)
      )
    );
  elsif p_operation = 'request_correction' then
    if p_expected_workspace_revision is null
       or not private.authoring_design_closed_object_v1(
         p_payload,
         array['variantRevisionRef','reason','participantContinuity'],
         array['variantRevisionRef','reason','participantContinuity']
       )
       or not private.authoring_design_closed_object_v1(
         p_payload->'variantRevisionRef',
         array['id','version'],array['id','version']
       )
       or p_payload#>>'{variantRevisionRef,id}' !~
         '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or p_payload#>>'{variantRevisionRef,version}' !~ '^[1-9][0-9]*$'
       or nullif(btrim(p_payload->>'reason'),'') is null
       or char_length(btrim(p_payload->>'reason'))>2000
       or p_payload->>'participantContinuity'<>'retain_existing' then
      raise exception 'Pedido de correção da variante inválido.'
        using errcode='22023';
    end if;
    if v_experiment.state not in ('ready','collecting','paused') then
      raise exception 'O estado atual não aceita correção de variante congelada.'
        using errcode='23514';
    end if;
    select revision.* into v_candidate
    from private.authoring_experiment_variant_revisions revision
    join private.authoring_experiment_variants variant
      on variant.id=revision.variant_id
     and variant.current_variant_revision_id=revision.id
    where revision.id=(p_payload#>>'{variantRevisionRef,id}')::uuid
      and revision.experiment_id=p_experiment_id
    for update of revision,variant;
    if not found
       or v_candidate.variant_revision::text<>
         p_payload#>>'{variantRevisionRef,version}'
       or v_candidate.status<>'frozen' then
      raise exception 'VariantRevision congelada inexistente ou stale.'
        using errcode='40001';
    end if;
    select workspace.* into v_child
    from private.authoring_workspaces workspace
    where workspace.id=v_candidate.child_workspace_id
      and workspace.deleted_at is null
    for update;
    if not found or v_child.revision<>p_expected_workspace_revision then
      raise exception 'O child mudou antes do pedido de correção.'
        using errcode='40001';
    end if;
    insert into private.authoring_experiment_variant_corrections(
      experiment_id,variant_revision_id,experiment_revision,reason,
      participant_continuity,requested_by
    ) values(
      p_experiment_id,v_candidate.id,p_expected_experiment_revision+1,
      btrim(p_payload->>'reason'),'retain_existing',p_actor_id
    ) returning id into v_correction_id;
    perform private.authorize_authoring_experiment_variant_write_v1(
      v_candidate.id
    );
    update private.authoring_experiment_variant_revisions revision
    set status='invalidated' where revision.id=v_candidate.id;
    delete from private.authoring_experiment_lock_write_tokens token
    where token.transaction_id=txid_current()
      and token.variant_revision_id=v_candidate.id;
    -- Toda variante posterior pinava a revisão corrigida direta ou
    -- transitivamente. Invalide a revisão corrente e retire apenas seu
    -- ponteiro; histórico, freezes e assignments permanecem append-only.
    for v_later in
      select later.id as variant_id,
        later.current_variant_revision_id as revision_id
      from private.authoring_experiment_variants later
      join private.authoring_experiment_variants corrected
        on corrected.id=v_candidate.variant_id
      where later.experiment_id=corrected.experiment_id
        and later.protocol_revision=corrected.protocol_revision
        and later.ordinal>corrected.ordinal
        and later.current_variant_revision_id is not null
      order by later.ordinal
      for update of later
    loop
      perform private.authorize_authoring_experiment_variant_write_v1(
        v_later.revision_id
      );
      update private.authoring_experiment_variant_revisions revision
      set status='invalidated' where revision.id=v_later.revision_id;
      update private.authoring_experiment_variants variant
      set current_variant_revision_id=null where variant.id=v_later.variant_id;
      delete from private.authoring_experiment_lock_write_tokens token
      where token.transaction_id=txid_current()
        and token.variant_revision_id=v_later.revision_id;
    end loop;
    update private.authoring_experiments experiment
    set state='correction_required',revision=revision+1,
      updated_by=p_actor_id,updated_at=now()
    where experiment.id=p_experiment_id;
    v_result:=jsonb_build_object(
      'workspaceId',p_workspace_id,
      'workspaceRevision',p_expected_workspace_revision,
      'experimentId',p_experiment_id,
      'experimentRevision',p_expected_experiment_revision+1,
      'state','correction_required',
      'variantRevisionRef',p_payload->'variantRevisionRef',
      'correctionRef',jsonb_build_object(
        'id',v_correction_id,
        'version',(p_expected_experiment_revision+1)::text
      ),
      'participantContinuity','retain_existing'
    );
  elsif p_operation = 'decide_difference' then
    if not private.authoring_design_closed_object_v1(
         p_payload,
         array['differenceRunRef','differenceRef','decision'],
         array[
           'differenceRunRef','differenceRef','decision','note',
           'participantContinuity'
         ]
       )
       or not private.authoring_design_closed_object_v1(
         p_payload->'differenceRunRef',
         array['id','version'], array['id','version']
       )
       or not private.authoring_design_closed_object_v1(
         p_payload->'differenceRef', array['id','version'], array['id','version']
       )
       or p_payload#>>'{differenceRunRef,id}' !~
         '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or p_payload#>>'{differenceRunRef,version}' !~ '^[a-f0-9]{64}$'
       or p_payload#>>'{differenceRef,id}' !~
         '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
       or p_payload->>'decision' not in ('correct','accept','invalidate') then
      raise exception 'Decisão de diferença inválida.' using errcode = '22023';
    end if;
    v_decision := p_payload->>'decision';
    v_note := nullif(btrim(p_payload->>'note'), '');
    if v_decision in ('accept','invalidate') and v_note is null then
      raise exception 'A decisão exige justificativa pública.' using errcode = '22023';
    end if;
    if v_note is not null and char_length(v_note) > 2000 then
      raise exception 'Justificativa excede 2.000 caracteres.' using errcode = '22023';
    end if;
    select hunk.* into v_difference
    from private.authoring_experiment_difference_hunks hunk
    join private.authoring_experiment_difference_runs run
      on run.id=hunk.difference_run_id
    where run.id=(p_payload#>>'{differenceRunRef,id}')::uuid
      and run.factual_hash=p_payload#>>'{differenceRunRef,version}'
      and hunk.difference_ref_id=p_payload#>>'{differenceRef,id}'
      and hunk.hunk_hash=p_payload#>>'{differenceRef,version}'
      and run.experiment_id=p_experiment_id
    for share;
    if not found then
      raise exception 'differenceRef factual inexistente ou stale.' using errcode = 'P0002';
    end if;
    select classification.* into v_classification
    from private.authoring_experiment_diff_classifications classification
    where classification.difference_run_id=v_difference.difference_run_id
      and classification.hunk_id=v_difference.hunk_id;
    if not found then
      raise exception 'differenceRef ainda não foi classificada.' using errcode='23514';
    end if;
    select * into v_run
    from private.authoring_experiment_difference_runs run
    where run.id = v_classification.difference_run_id;
    if exists (
      select 1 from private.authoring_experiment_difference_decisions decision
      where decision.difference_run_id = v_run.id
        and decision.hunk_id = v_classification.hunk_id
    ) then
      raise exception 'A diferença já possui decisão humana.' using errcode = '23505';
    end if;
    select * into v_candidate
    from private.authoring_experiment_variant_revisions revision
    where revision.id = v_run.candidate_variant_revision_id;
    v_has_assignments := exists (
      select 1 from private.authoring_experiment_assignments assignment
      where assignment.variant_revision_id = v_candidate.id
    );
    if v_decision = 'correct' and v_has_assignments
       and p_payload->>'participantContinuity' is distinct from 'retain_existing' then
      raise exception 'Correção durante coleta exige retain_existing explícito.'
        using errcode = '23514';
    end if;
    insert into private.authoring_experiment_difference_decisions(
      experiment_id, difference_run_id, hunk_id, decision, rationale,
      participant_continuity, experiment_revision, decided_by
    ) values(
      p_experiment_id, v_run.id, v_classification.hunk_id,
      v_decision, coalesce(v_note, 'Correção solicitada pelo pesquisador.'),
      case when v_decision = 'correct' then
        p_payload->>'participantContinuity' end,
      p_expected_experiment_revision + 1, p_actor_id
    );
    if v_decision in ('correct','invalidate') then
      perform private.authorize_authoring_experiment_variant_write_v1(v_candidate.id);
      update private.authoring_experiment_variant_revisions revision
      set status = 'invalidated'
      where revision.id = v_candidate.id;
      -- Toda comparação intervariante posterior pinava esta revisão. O
      -- ponteiro corrente é retirado (o histórico permanece imutável) para
      -- obrigar uma nova VariantRevision e novos diffs A↔B.
      update private.authoring_experiment_variants later
      set current_variant_revision_id=null
      from private.authoring_experiment_variants decided
      where decided.id=v_candidate.variant_id
        and later.experiment_id=decided.experiment_id
        and later.protocol_revision=decided.protocol_revision
        and later.ordinal>decided.ordinal;
      delete from private.authoring_experiment_lock_write_tokens token
      where token.transaction_id = txid_current()
        and token.variant_revision_id = v_candidate.id;
    end if;
    update private.authoring_experiments experiment
    set state = case v_decision
          when 'correct' then 'correction_required'
          when 'invalidate' then 'invalidated'
          else state end,
        revision = revision + 1, updated_by = p_actor_id, updated_at = now()
    where experiment.id = p_experiment_id;
    v_result := jsonb_build_object(
      'workspaceId', p_workspace_id,
      'workspaceRevision', v_workspace.revision,
      'experimentId', p_experiment_id,
      'experimentRevision', p_expected_experiment_revision + 1,
      'state', case v_decision when 'correct' then 'correction_required'
        when 'invalidate' then 'invalidated' else v_experiment.state end,
      'differenceRunRef', p_payload->'differenceRunRef',
      'differenceDecisionRef', jsonb_build_object(
        'id', p_payload#>>'{differenceRef,id}',
        'version', (p_expected_experiment_revision + 1)::text
      )
    );
  elsif p_operation = 'freeze' then
    if p_expected_workspace_revision is null
       or not private.authoring_design_closed_object_v1(
         p_payload, array['variantRevisionRef'], array['variantRevisionRef']
       )
       or not private.authoring_design_closed_object_v1(
         p_payload->'variantRevisionRef', array['id','version'], array['id','version']
       )
       or p_payload#>>'{variantRevisionRef,id}' !~
         '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or p_payload#>>'{variantRevisionRef,version}' !~ '^[1-9][0-9]*$' then
      raise exception 'Freeze exige VariantRevision e CAS do child exatos.'
        using errcode = '22023';
    end if;
    select revision.* into v_candidate
    from private.authoring_experiment_variant_revisions revision
    join private.authoring_experiment_variants variant
      on variant.id=revision.variant_id
     and variant.current_variant_revision_id=revision.id
    where revision.id = (p_payload#>>'{variantRevisionRef,id}')::uuid
      and revision.experiment_id = p_experiment_id
    for update;
    if not found
       or v_candidate.variant_revision::text <>
         p_payload#>>'{variantRevisionRef,version}'
       or v_candidate.status <> 'ready'
       or v_candidate.final_artifact_hash is null then
      raise exception 'VariantRevision não está pronta para freeze.'
        using errcode = '23514';
    end if;
    select * into v_child
    from private.authoring_workspaces workspace
    where workspace.id = v_candidate.child_workspace_id
      and workspace.deleted_at is null
    for update;
    if not found or v_child.revision <> p_expected_workspace_revision
       or v_candidate.evidence_workspace_revision is distinct from
         p_expected_workspace_revision then
      raise exception 'O child mudou antes do freeze.' using errcode = '40001';
    end if;
    select count(*) into v_pending
    from private.authoring_experiment_difference_runs run
    join private.authoring_experiment_difference_hunks hunk
      on hunk.difference_run_id = run.id
    where run.candidate_variant_revision_id = v_candidate.id
      and not exists (
        select 1
        from private.authoring_experiment_diff_classifications classification
        join private.authoring_experiment_difference_decisions decision
          on decision.difference_run_id = classification.difference_run_id
         and decision.hunk_id = classification.hunk_id
        where classification.difference_run_id = run.id
          and classification.hunk_id = hunk.hunk_id
          and decision.decision = 'accept'
      );
    if v_pending <> 0 or not exists (
      select 1 from private.authoring_experiment_difference_runs run
      where run.candidate_variant_revision_id = v_candidate.id
        and run.baseline_kind = 'base'
        and run.base_revision_id = v_candidate.base_revision_id
        and (select count(*)
          from private.authoring_experiment_difference_hunks hunk
          where hunk.difference_run_id=run.id)=run.hunk_count
        and (select count(*)
          from private.authoring_experiment_difference_pages page
          where page.difference_run_id=run.id)=run.page_count
    ) or exists (
      select 1
      from private.authoring_experiment_variants earlier
      join private.authoring_experiment_variants candidate_variant
        on candidate_variant.id=v_candidate.variant_id
      where earlier.experiment_id=v_candidate.experiment_id
        and earlier.protocol_revision=v_candidate.protocol_revision
        and earlier.ordinal<candidate_variant.ordinal
        and (
          earlier.current_variant_revision_id is null
          or not exists (
            select 1 from private.authoring_experiment_difference_runs run
            where run.candidate_variant_revision_id=v_candidate.id
              and run.baseline_kind='variant_revision'
              and run.baseline_variant_revision_id=
                earlier.current_variant_revision_id
              and (select count(*)
                from private.authoring_experiment_difference_hunks hunk
                where hunk.difference_run_id=run.id)=run.hunk_count
              and (select count(*)
                from private.authoring_experiment_difference_pages page
                where page.difference_run_id=run.id)=run.page_count
          )
        )
    ) then
      raise exception 'Todo hunk factual exige classificação e aceite humanos.'
        using errcode = '23514';
    end if;
    perform private.authorize_authoring_experiment_variant_write_v1(v_candidate.id);
    -- O status é fechado ainda sob o token do control plane. Inserir primeiro
    -- o freeze faria o próprio guard de imutabilidade rejeitar ready→frozen.
    update private.authoring_experiment_variant_revisions revision
    set status = 'frozen' where revision.id = v_candidate.id;
    insert into private.authoring_experiment_variant_freezes(
      variant_revision_id, experiment_id, experiment_revision,
      artifact_hash, workspace_revision, frozen_by
    ) values(
      v_candidate.id, p_experiment_id,
      p_expected_experiment_revision + 1,
      v_candidate.final_artifact_hash, p_expected_workspace_revision,
      p_actor_id
    );
    delete from private.authoring_experiment_lock_write_tokens token
    where token.transaction_id = txid_current()
      and token.variant_revision_id = v_candidate.id;
    update private.authoring_experiments experiment
    set state = case when not exists (
          select 1 from private.authoring_experiment_conditions condition
          where condition.experiment_id=p_experiment_id
            and condition.protocol_revision=experiment.current_protocol_revision
            and not exists (
              select 1 from private.authoring_experiment_variants variant
              join private.authoring_experiment_variant_revisions revision
                on revision.id=variant.current_variant_revision_id
              where variant.experiment_id=condition.experiment_id
                and variant.protocol_revision=condition.protocol_revision
                and variant.condition_id=condition.condition_id
                and revision.status='frozen'
            )
        ) then 'ready' else state end,
        revision = revision + 1, updated_by = p_actor_id, updated_at = now()
    where experiment.id = p_experiment_id;
    v_result := jsonb_build_object(
      'workspaceId', p_workspace_id,
      'workspaceRevision', p_expected_workspace_revision,
      'experimentId', p_experiment_id,
      'experimentRevision', p_expected_experiment_revision + 1,
      'state', 'ready',
      'variantRevisionRef', p_payload->'variantRevisionRef'
    );
  elsif p_operation in ('start_collection','rotate_enrollment_code') then
    if p_operation = 'start_collection' then
      if v_experiment.state <> 'ready' or exists (
        select 1 from private.authoring_experiment_conditions condition
        where condition.experiment_id=p_experiment_id
          and condition.protocol_revision=v_experiment.current_protocol_revision
          and not exists (
            select 1 from private.authoring_experiment_variants variant
            join private.authoring_experiment_variant_revisions revision
              on revision.id=variant.current_variant_revision_id
            where variant.experiment_id=condition.experiment_id
              and variant.protocol_revision=condition.protocol_revision
              and variant.condition_id=condition.condition_id
              and revision.status='frozen'
          )
      ) then
        raise exception 'Todas as variantes correntes devem estar congeladas.'
          using errcode = '23514';
      end if;
    elsif v_experiment.state not in ('collecting','paused') then
      raise exception 'Código só pode ser rotacionado durante a coleta.'
        using errcode = '23514';
    end if;
    v_helper := private.issue_authoring_experiment_enrollment_code_v1(
      p_experiment_id, v_experiment.current_protocol_revision,
      case when p_payload ? 'expiresAt'
        then (p_payload->>'expiresAt')::timestamptz else null end
    );
    update private.authoring_experiments experiment
    set state = case when p_operation = 'start_collection'
          then 'collecting' else state end,
        revision = revision + 1, updated_by = p_actor_id, updated_at = now()
    where experiment.id = p_experiment_id;
    v_result := jsonb_build_object(
      'workspaceId', p_workspace_id,
      'workspaceRevision', v_workspace.revision,
      'experimentId', p_experiment_id,
      'experimentRevision', p_expected_experiment_revision + 1,
      'state', case when p_operation = 'start_collection'
        then 'collecting' else v_experiment.state end,
      'enrollmentCode', v_helper->>'enrollmentCode',
      'expiresAt', v_helper->>'expiresAt'
    );
  elsif p_operation = 'transition_collection' then
    if not private.authoring_design_closed_object_v1(
         p_payload, array['transition'], array['transition']
       ) or p_payload->>'transition' not in (
         'pause','resume','close','invalidate'
       ) then
      raise exception 'Transição de coleta inválida.' using errcode = '22023';
    end if;
    v_transition := p_payload->>'transition';
    if not (
      (v_transition = 'pause' and v_experiment.state = 'collecting')
      or (v_transition = 'resume' and v_experiment.state = 'paused')
      or (v_transition in ('close','invalidate')
        and v_experiment.state in ('collecting','paused'))
    ) then
      raise exception 'Transição incompatível com o estado corrente.'
        using errcode = '23514';
    end if;
    if v_transition in ('pause','close','invalidate') then
      update private.authoring_experiment_enrollment_codes code
      set active = false, invalidated_at = coalesce(invalidated_at, now())
      where code.experiment_id = p_experiment_id and code.active;
    end if;
    update private.authoring_experiments experiment
    set state = case v_transition when 'pause' then 'paused'
          when 'resume' then 'collecting'
          when 'close' then 'closed' else 'invalidated' end,
        revision = revision + 1, updated_by = p_actor_id, updated_at = now()
    where experiment.id = p_experiment_id;
    v_result := jsonb_build_object(
      'workspaceId', p_workspace_id,
      'workspaceRevision', v_workspace.revision,
      'experimentId', p_experiment_id,
      'experimentRevision', p_expected_experiment_revision + 1,
      'state', case v_transition when 'pause' then 'paused'
        when 'resume' then 'collecting'
        when 'close' then 'closed' else 'invalidated' end
    );
  else
    raise exception 'Operação experimental não suportada nesta RPC.'
      using errcode = '22023';
  end if;

  return private.complete_authoring_experiment_request_v1(
    p_actor_id, p_workspace_id, p_experiment_id, p_request_id,
    p_payload_hash, p_operation, v_argument_hash, v_result
  );
end;
$function$;

create function public.assign_authoring_experiment_participant_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_experiment_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_expected_experiment_revision bigint,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_begin jsonb;
  v_argument_hash text;
  v_experiment private.authoring_experiments%rowtype;
  v_protocol private.authoring_experiment_protocol_revisions%rowtype;
  v_enrollment private.authoring_experiment_enrollments%rowtype;
  v_condition private.authoring_experiment_conditions%rowtype;
  v_candidate private.authoring_experiment_variant_revisions%rowtype;
  v_selection_id uuid := extensions.gen_random_uuid();
  v_assignment_id uuid := extensions.gen_random_uuid();
  v_count integer;
  v_index integer;
  v_proof text;
  v_assignment_material text;
  v_assignment_digest text;
  v_condition_refs text;
  v_result jsonb;
begin
  v_begin := private.begin_authoring_experiment_request_v1(
    p_actor_id, p_workspace_id, p_experiment_id, p_request_id,
    p_payload_hash, p_expected_experiment_revision, null,
    'assign_participant', p_payload
  );
  if (v_begin->>'replayed')::boolean then return v_begin->'result'; end if;
  v_argument_hash := v_begin->>'argumentHash';
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'research'
  );
  if not private.authoring_design_closed_object_v1(
       p_payload, array['enrollmentRef'], array['enrollmentRef','conditionRef']
     ) or p_payload->>'enrollmentRef' !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'Assignment experimental inválido.' using errcode = '22023';
  end if;
  select * into v_experiment
  from private.authoring_experiments experiment
  where experiment.id = p_experiment_id
    and experiment.workspace_id = p_workspace_id
  for update;
  if not found or v_experiment.revision <> p_expected_experiment_revision then
    raise exception 'O experimento mudou desde a leitura.' using errcode = '40001';
  end if;
  if v_experiment.state <> 'collecting' then
    raise exception 'Atribuição exige coleta ativa.' using errcode = '23514';
  end if;
  select * into v_protocol
  from private.authoring_experiment_protocol_revisions protocol
  where protocol.experiment_id = p_experiment_id
    and protocol.protocol_revision = v_experiment.current_protocol_revision;
  select * into v_enrollment
  from private.authoring_experiment_enrollments enrollment
  where enrollment.id = (p_payload->>'enrollmentRef')::uuid
    and enrollment.experiment_id = p_experiment_id
  for update;
  if not found or v_enrollment.status <> 'enrolled'
     or v_enrollment.user_id is null
     or v_enrollment.protocol_revision <> v_protocol.protocol_revision
     or exists (
       select 1 from private.authoring_experiment_assignments assignment
       where assignment.enrollment_id = v_enrollment.id
     ) then
    raise exception 'Enrollment não está disponível para atribuição.'
      using errcode = '23514';
  end if;
  if v_protocol.assignment_kind = 'manual' then
    if not private.authoring_design_closed_object_v1(
         p_payload->'conditionRef', array['id','version'], array['id','version']
       ) or p_payload#>>'{conditionRef,version}' <>
         v_protocol.protocol_revision::text then
      raise exception 'A atribuição manual exige conditionRef corrente.'
        using errcode = '22023';
    end if;
    select * into v_condition
    from private.authoring_experiment_conditions condition
    where condition.experiment_id = p_experiment_id
      and condition.protocol_revision = v_protocol.protocol_revision
      and condition.condition_id = p_payload#>>'{conditionRef,id}';
  elsif v_protocol.assignment_kind = 'seeded_random' then
    select count(*),string_agg(
      condition.condition_id || '@' || v_protocol.protocol_revision::text,
      chr(10) order by condition.condition_id
    ) into v_count,v_condition_refs
    from private.authoring_experiment_conditions condition
    where condition.experiment_id = p_experiment_id
      and condition.protocol_revision = v_protocol.protocol_revision;
    v_assignment_material :=
      'algorithm=' || v_protocol.assignment_algorithm_version || chr(10)
      || 'secretHash=' || v_protocol.assignment_secret_hash || chr(10)
      || 'protocolRef=' || p_experiment_id::text || '@'
        || v_protocol.protocol_revision::text || chr(10)
      || 'participantRef=' || v_enrollment.participant_ref || chr(10)
      || 'conditionRefs=' || v_condition_refs;
    v_assignment_digest := encode(extensions.digest(
      convert_to(v_assignment_material,'UTF8'),'sha256'
    ),'hex');
    v_index := mod(
      (('x' || substr(v_assignment_digest,1,8))::bit(32)::bigint)::numeric
        * 4294967296::numeric
      + (('x' || substr(v_assignment_digest,9,8))::bit(32)::bigint)::numeric,
      v_count::numeric
    )::integer + 1;
    select * into v_condition
    from private.authoring_experiment_conditions condition
    where condition.experiment_id = p_experiment_id
      and condition.protocol_revision = v_protocol.protocol_revision
    order by condition.condition_id offset v_index - 1 limit 1;
  else
    select condition.* into v_condition
    from private.authoring_experiment_conditions condition
    left join private.authoring_experiment_assignments assignment
      on assignment.experiment_id = condition.experiment_id
     and assignment.protocol_revision = condition.protocol_revision
     and assignment.condition_id = condition.condition_id
    where condition.experiment_id = p_experiment_id
      and condition.protocol_revision = v_protocol.protocol_revision
    group by condition.experiment_id, condition.protocol_revision,
      condition.condition_id
    order by count(assignment.id), min(condition.ordinal)
    limit 1;
  end if;
  if v_condition.condition_id is null then
    raise exception 'Condição de atribuição inexistente.' using errcode = 'P0002';
  end if;
  select revision.* into v_candidate
  from private.authoring_experiment_variants variant
  join private.authoring_experiment_variant_revisions revision
    on revision.id = variant.current_variant_revision_id
  join private.authoring_experiment_variant_freezes frozen
    on frozen.variant_revision_id = revision.id
  where variant.experiment_id = p_experiment_id
    and variant.protocol_revision = v_protocol.protocol_revision
    and variant.condition_id = v_condition.condition_id
    and revision.status = 'frozen';
  if not found then
    raise exception 'A condição não possui variante congelada corrente.'
      using errcode = '23514';
  end if;
  insert into private.authoring_experiment_selection_write_tokens(
    transaction_id,operation,selection_id,user_id,course_id,enrollment_id
  ) values(
    txid_current(),'assign',v_selection_id,v_enrollment.user_id,
    v_candidate.publication_course_id,v_enrollment.id
  );
  insert into public.user_course_selections(
    id, user_id, course_id, position
  ) values(
    v_selection_id, v_enrollment.user_id, v_candidate.publication_course_id,
    coalesce((select max(selection.position) + 1
      from public.user_course_selections selection
      where selection.user_id = v_enrollment.user_id), 0)
  );
  v_proof := case when v_protocol.assignment_kind='seeded_random'
    then v_assignment_digest
    else private.authoring_experiment_hash_v1(jsonb_build_object(
      'protocolHash', v_protocol.protocol_hash,
      'algorithmVersion', v_protocol.assignment_algorithm_version,
      'secretCommitment', v_protocol.assignment_secret_commitment,
      'participantRef', v_enrollment.participant_ref,
      'conditionId', v_condition.condition_id,
      'variantRevisionId', v_candidate.id
    )) end;
  insert into private.authoring_experiment_assignments(
    id, experiment_id, enrollment_id, participant_ref,
    protocol_revision, condition_id, variant_revision_id,
    publication_course_id, selection_ref, selection_id,
    assignment_kind, algorithm_version, assignment_proof,
    experiment_revision, assigned_by
  ) values(
    v_assignment_id, p_experiment_id, v_enrollment.id,
    v_enrollment.participant_ref, v_protocol.protocol_revision,
    v_condition.condition_id, v_candidate.id,
    v_candidate.publication_course_id, v_selection_id, v_selection_id,
    v_protocol.assignment_kind, v_protocol.assignment_algorithm_version,
    v_proof, p_expected_experiment_revision + 1, p_actor_id
  );
  delete from private.authoring_experiment_selection_write_tokens token
  where token.transaction_id=txid_current()
    and token.operation='assign' and token.selection_id=v_selection_id;
  update private.authoring_experiments experiment
  set revision = revision + 1, updated_by = p_actor_id, updated_at = now()
  where experiment.id = p_experiment_id;
  v_result := jsonb_build_object(
    'workspaceId', p_workspace_id,
    'experimentId', p_experiment_id,
    'experimentRevision', p_expected_experiment_revision + 1,
    'state', 'collecting',
    'assignmentRef', jsonb_build_object(
      'id', v_assignment_id, 'version', v_proof
    )
  );
  return private.complete_authoring_experiment_request_v1(
    p_actor_id, p_workspace_id, p_experiment_id, p_request_id,
    p_payload_hash, 'assign_participant', v_argument_hash, v_result
  );
end;
$function$;

create function public.manage_authoring_experiment_enrollment_v1(
  p_actor_id uuid,
  p_operation text,
  p_enrollment_code text default null,
  p_enrollment_ref uuid default null,
  p_request_id text default null,
  p_payload_hash text default null,
  p_consent_policy_ref jsonb default null,
  p_consent_acknowledged boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $function$
declare
  v_code_hash text;
  v_code private.authoring_experiment_enrollment_codes%rowtype;
  v_experiment private.authoring_experiments%rowtype;
  v_protocol private.authoring_experiment_protocol_revisions%rowtype;
  v_policy private.authoring_research_consent_policy_definitions%rowtype;
  v_enrollment private.authoring_experiment_enrollments%rowtype;
  v_assignment private.authoring_experiment_assignments%rowtype;
  v_request private.authoring_experiment_participant_requests%rowtype;
  v_argument_hash text;
  v_participant_ref text;
  v_result jsonb;
begin
  perform private.require_service_role();
  if p_actor_id is null or not exists (
    select 1 from auth.users account where account.id = p_actor_id
  ) or p_operation not in ('read_policy','enroll','status','withdraw') then
    raise exception 'Operação participante inválida.' using errcode = '22023';
  end if;

  if p_operation in ('enroll','withdraw') then
    if p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
       or p_payload_hash !~ '^[a-f0-9]{64}$' then
      raise exception 'Receipt participante inválido.' using errcode = '22023';
    end if;
    v_argument_hash := private.authoring_experiment_hash_v1(jsonb_build_object(
      'operation', p_operation,
      'enrollmentCode', p_enrollment_code,
      'enrollmentRef', p_enrollment_ref,
      'consentPolicyRef', p_consent_policy_ref,
      'consentAcknowledged', p_consent_acknowledged
    ));
    perform pg_advisory_xact_lock(hashtextextended(
      'authoring-experiment-participant:' || p_actor_id::text || ':' || p_request_id,
      0
    ));
    delete from private.authoring_experiment_participant_requests request
    where request.actor_id = p_actor_id
      and request.request_id = p_request_id
      and request.expires_at <= statement_timestamp();
    select * into v_request
    from private.authoring_experiment_participant_requests request
    where request.actor_id = p_actor_id and request.request_id = p_request_id;
    if found then
      if v_request.operation <> p_operation
         or v_request.payload_hash <> p_payload_hash
         or v_request.argument_hash <> v_argument_hash then
        raise exception 'requestId participante reutilizado com outros argumentos.'
          using errcode = '23505';
      end if;
      return v_request.result || jsonb_build_object('idempotent', true);
    end if;
  end if;

  if p_operation in ('read_policy','enroll') then
    if p_enrollment_code !~ '^[A-Za-z0-9_-]{8,128}$' then
      raise exception 'Código de ingresso inválido.' using errcode = '22023';
    end if;
    v_code_hash := encode(extensions.digest(
      convert_to(p_enrollment_code, 'UTF8'), 'sha256'
    ), 'hex');
    select code.* into v_code
    from private.authoring_experiment_enrollment_codes code
    where code.code_hash = v_code_hash
      and code.active and code.expires_at > statement_timestamp()
    for share;
    if not found then
      raise exception 'Código inexistente, expirado ou revogado.'
        using errcode = 'P0002';
    end if;
    select * into v_experiment
    from private.authoring_experiments experiment
    where experiment.id = v_code.experiment_id;
    if v_experiment.state <> 'collecting'
       or v_experiment.current_protocol_revision <> v_code.protocol_revision then
      raise exception 'O experimento não aceita novos ingressos.'
        using errcode = '23514';
    end if;
    select * into v_protocol
    from private.authoring_experiment_protocol_revisions protocol
    where protocol.experiment_id = v_code.experiment_id
      and protocol.protocol_revision = v_code.protocol_revision;
    select * into v_policy
    from private.authoring_research_consent_policy_definitions policy
    where policy.policy_id = v_protocol.consent_policy_ref
      and policy.policy_version = v_protocol.consent_revision;
    if p_operation = 'read_policy' then
      return jsonb_build_object(
        'title', v_experiment.title,
        'policy', jsonb_build_object(
          'ref', jsonb_build_object(
            'id', v_policy.policy_id, 'version', v_policy.policy_version
          ),
          'label', v_policy.label,
          'publicText', coalesce(
            v_policy.descriptor->>'publicText',
            v_policy.descriptor->>'summary',
            'Consulte a política versionada antes de consentir.'
          )
        )
      );
    end if;
    if p_consent_acknowledged is not true
       or not private.authoring_design_closed_object_v1(
         p_consent_policy_ref, array['id','version'], array['id','version']
       )
       or p_consent_policy_ref->>'id' <> v_policy.policy_id
       or p_consent_policy_ref->>'version' <> v_policy.policy_version then
      raise exception 'Consentimento não corresponde à política pinada.'
        using errcode = '23514';
    end if;
    if exists (
      select 1 from private.authoring_experiment_enrollments enrollment
      where enrollment.experiment_id = v_experiment.id
        and enrollment.user_id = p_actor_id
    ) then
      raise exception 'A conta já ingressou e não pode reinscrever-se silenciosamente.'
        using errcode = '23505';
    end if;
    v_participant_ref := 'participant:' || extensions.gen_random_uuid()::text;
    insert into private.authoring_experiment_enrollments(
      experiment_id, protocol_revision, participant_ref, user_id,
      consent_policy_ref, consent_revision, accepted_at
    ) values(
      v_experiment.id, v_protocol.protocol_revision, v_participant_ref,
      p_actor_id, v_policy.policy_id, v_policy.policy_version, now()
    ) returning * into v_enrollment;
    v_result := jsonb_build_object(
      'enrollmentRef', v_enrollment.id,
      'status', 'enrolled', 'selection', null
    );
  else
    select * into v_enrollment
    from private.authoring_experiment_enrollments enrollment
    where enrollment.id = p_enrollment_ref
      and enrollment.user_id = p_actor_id
    for update;
    if not found then
      raise exception 'Enrollment inexistente para esta conta.' using errcode = 'P0002';
    end if;
    select assignment.* into v_assignment
    from private.authoring_experiment_assignments assignment
    where assignment.enrollment_id = v_enrollment.id;
    if p_operation = 'withdraw' and v_enrollment.status <> 'withdrawn' then
      update private.authoring_experiment_enrollments enrollment
      set status = 'withdrawn'
      where enrollment.id = v_enrollment.id;
      if v_assignment.selection_id is not null then
        insert into private.authoring_experiment_selection_write_tokens(
          transaction_id,operation,selection_id,user_id,course_id,
          enrollment_id,assignment_id
        ) values(
          txid_current(),'withdraw',v_assignment.selection_id,p_actor_id,
          v_assignment.publication_course_id,v_enrollment.id,v_assignment.id
        );
        delete from public.user_course_selections selection
        where selection.id = v_assignment.selection_id
          and selection.user_id = p_actor_id;
        delete from private.authoring_experiment_selection_write_tokens token
        where token.transaction_id=txid_current()
          and token.operation='withdraw'
          and token.selection_id=v_assignment.selection_id;
      end if;
      v_enrollment.status := 'withdrawn';
      v_assignment.selection_id := null;
    end if;
    v_result := jsonb_build_object(
      'enrollmentRef', v_enrollment.id,
      'status', case when v_enrollment.status = 'withdrawn' then 'withdrawn'
        when v_assignment.id is null then 'enrolled' else 'assigned' end,
      'selection', case
        when v_enrollment.status = 'withdrawn' or v_assignment.id is null
          or v_assignment.selection_id is null then null
        else jsonb_build_object(
          'selectionId', v_assignment.selection_ref,
          'courseId', v_assignment.publication_course_id,
          'contentHash', (
            select course.content_hash from public.courses course
            where course.id = v_assignment.publication_course_id
          ),
          'readerTarget', jsonb_build_object(
            'courseId', v_assignment.publication_course_id,
            'access', 'private',
            'contentHash', (
              select course.content_hash from public.courses course
              where course.id = v_assignment.publication_course_id
            )
          )
        ) end
    );
  end if;

  if p_operation in ('enroll','withdraw') then
    v_result := v_result || jsonb_build_object('idempotent', false);
    if pg_column_size(v_result) > 30000 then
      raise exception 'Receipt participante excede o orçamento.'
        using errcode = '54000';
    end if;
    insert into private.authoring_experiment_participant_requests(
      actor_id, request_id, operation, payload_hash, argument_hash, result
    ) values(
      p_actor_id, p_request_id, p_operation, p_payload_hash,
      v_argument_hash, v_result
    );
  end if;
  return v_result;
end;
$function$;

create function private.authoring_experiment_set_ref_v1(p_workspace_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select jsonb_build_object(
    'id', 'experiment-set:' || p_workspace_id::text,
    'version', private.authoring_experiment_hash_v1(coalesce((
      select jsonb_agg(jsonb_build_array(
        experiment.id, experiment.revision, experiment.state,
        experiment.current_protocol_revision, experiment.updated_at
      ) order by experiment.id)
      from private.authoring_experiments experiment
      where experiment.workspace_id = p_workspace_id
    ), '[]'::jsonb))
  )
$function$;

create function private.authoring_experiment_options_set_ref_v1(
  p_workspace_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select jsonb_build_object(
    'id', 'experiment-options:' || p_workspace_id::text,
    'version', private.authoring_experiment_hash_v1(jsonb_build_object(
      'workspace', (select jsonb_build_array(workspace.revision, workspace.updated_at)
        from private.authoring_workspaces workspace
        where workspace.id = p_workspace_id),
      'entities', (select jsonb_build_array(count(*), coalesce(max(entity.version),0))
        from private.authoring_workspace_entities entity
        where entity.workspace_id = p_workspace_id),
      'publications', (select coalesce(jsonb_agg(jsonb_build_array(
          publication.course_id, publication.content_hash,
          publication.published_workspace_revision
        ) order by publication.course_id), '[]'::jsonb)
        from private.authoring_workspace_publications publication
        where publication.workspace_id = p_workspace_id
          and publication.target = 'private'),
      'definitions', (select jsonb_build_array(count(*), coalesce(max(created_at),'-infinity'))
        from private.authoring_design_parameter_definitions),
      'resourceSets', (select jsonb_build_array(count(*), coalesce(max(created_revision),0))
        from private.authoring_resource_sets resource_set
        where resource_set.workspace_id = p_workspace_id),
      'consent', (select jsonb_build_array(count(*), coalesce(max(updated_at),'-infinity'))
        from private.authoring_research_consent_policy_availability),
      'instruments', (select jsonb_build_array(count(*), coalesce(max(updated_at),'-infinity'))
        from private.authoring_research_instrument_availability)
    ))
  )
$function$;

create function private.authoring_experiment_variant_set_ref_v1(
  p_experiment_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select jsonb_build_object(
    'id', 'variant-set:' || p_experiment_id::text,
    'version', private.authoring_experiment_hash_v1(coalesce((
      select jsonb_agg(jsonb_build_array(
        variant.id, variant.current_variant_revision_id, revision.status,
        revision.evidence_workspace_revision, frozen.frozen_at
      ) order by variant.ordinal)
      from private.authoring_experiment_variants variant
      left join private.authoring_experiment_variant_revisions revision
        on revision.id = variant.current_variant_revision_id
      left join private.authoring_experiment_variant_freezes frozen
        on frozen.variant_revision_id = revision.id
      where variant.experiment_id = p_experiment_id
    ), '[]'::jsonb))
  )
$function$;

create function private.authoring_experiment_difference_set_ref_v1(
  p_experiment_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select jsonb_build_object(
    'id', 'difference-set:' || p_experiment_id::text,
    'version', private.authoring_experiment_hash_v1(coalesce((
      select jsonb_agg(jsonb_build_array(
        run.id, run.factual_hash, run.hunk_count,
        (select count(*) from private.authoring_experiment_diff_classifications c
          where c.difference_run_id = run.id),
        (select count(*) from private.authoring_experiment_difference_decisions d
          where d.difference_run_id = run.id)
      ) order by run.created_at, run.id)
      from private.authoring_experiment_difference_runs run
      where run.experiment_id = p_experiment_id
    ), '[]'::jsonb))
  )
$function$;

create function private.authoring_experiment_participant_set_ref_v1(
  p_experiment_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select jsonb_build_object(
    'id', 'participant-set:' || p_experiment_id::text,
    'version', private.authoring_experiment_hash_v1(coalesce((
      select jsonb_agg(jsonb_build_array(
        enrollment.id, enrollment.status, assignment.id,
        assignment.condition_id, assignment.selection_id
      ) order by enrollment.recorded_at, enrollment.id)
      from private.authoring_experiment_enrollments enrollment
      left join private.authoring_experiment_assignments assignment
        on assignment.enrollment_id = enrollment.id
      where enrollment.experiment_id = p_experiment_id
    ), '[]'::jsonb))
  )
$function$;

create function private.require_authoring_experiment_page_ref_v1(
  p_provided jsonb,
  p_current jsonb,
  p_cursor text,
  p_label text
)
returns integer
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_offset integer := 0;
begin
  if p_provided is not null and p_provided is distinct from p_current then
    raise exception '% mudou durante a paginação.', p_label using errcode = '40001';
  end if;
  if p_cursor is not null then
    if p_provided is null or p_cursor !~ '^[0-9]{1,6}$' then
      raise exception 'Cursor pinado inválido para %.', p_label using errcode = '22023';
    end if;
    v_offset := p_cursor::integer;
  end if;
  return v_offset;
end;
$function$;

create function public.list_authoring_experiments_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_experiment_set_ref jsonb default null,
  p_cursor text default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_ref jsonb;
  v_offset integer;
  v_count integer;
  v_items jsonb;
  v_workspace_revision bigint;
begin
  perform private.require_service_role();
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'research'
  );
  if p_limit is null or p_limit not between 1 and 20 then
    raise exception 'Página de experimentos inválida.' using errcode = '22023';
  end if;
  select workspace.revision into v_workspace_revision
  from private.authoring_workspaces workspace
  where workspace.id = p_workspace_id and workspace.deleted_at is null;
  if v_workspace_revision is null then
    raise exception 'Workspace inexistente.' using errcode = 'P0002';
  end if;
  v_ref := private.authoring_experiment_set_ref_v1(p_workspace_id);
  v_offset := private.require_authoring_experiment_page_ref_v1(
    p_experiment_set_ref, v_ref, p_cursor, 'O conjunto de experimentos'
  );
  select count(*) into v_count
  from private.authoring_experiments experiment
  where experiment.workspace_id = p_workspace_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', page.id,
    'experimentRevision', page.revision,
    'title', page.title,
    'state', page.state,
    'conditionCount', page.condition_count,
    'variantCount', page.variant_count,
    'updatedAt', page.updated_at
  ) order by page.updated_at desc, page.id), '[]'::jsonb) into v_items
  from (
    select experiment.*,
      (select count(*) from private.authoring_experiment_conditions condition
        where condition.experiment_id = experiment.id
          and condition.protocol_revision = experiment.current_protocol_revision
      ) as condition_count,
      (select count(*) from private.authoring_experiment_variants variant
        where variant.experiment_id = experiment.id
          and variant.protocol_revision = experiment.current_protocol_revision
      ) as variant_count
    from private.authoring_experiments experiment
    where experiment.workspace_id = p_workspace_id
    order by experiment.updated_at desc, experiment.id
    offset v_offset limit p_limit
  ) page;
  return jsonb_build_object(
    'workspaceRevision', v_workspace_revision,
    'experimentSetRef', v_ref,
    'items', v_items,
    'count', v_count,
    'nextCursor', case when v_offset + jsonb_array_length(v_items) < v_count
      then (v_offset + jsonb_array_length(v_items))::text else null end,
    'truncated', v_offset + jsonb_array_length(v_items) < v_count
  );
end;
$function$;

create function public.list_authoring_experiment_options_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_kind text,
  p_query text default null,
  p_options_set_ref jsonb default null,
  p_cursor text default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_ref jsonb;
  v_offset integer;
  v_count integer;
  v_items jsonb := '[]'::jsonb;
  v_query text := lower(btrim(coalesce(p_query, '')));
  v_workspace_revision bigint;
begin
  perform private.require_service_role();
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'research'
  );
  if p_kind not in (
       'scope','base','factor_definition','resource_set','consent_policy',
       'instrument','outcome'
     ) or p_limit is null or p_limit not between 1 and 20
     or char_length(v_query) > 200 then
    raise exception 'Consulta de opções inválida.' using errcode = '22023';
  end if;
  select workspace.revision into v_workspace_revision
  from private.authoring_workspaces workspace
  where workspace.id = p_workspace_id and workspace.deleted_at is null;
  v_ref := private.authoring_experiment_options_set_ref_v1(p_workspace_id);
  v_offset := private.require_authoring_experiment_page_ref_v1(
    p_options_set_ref, v_ref, p_cursor, 'O snapshot global de opções'
  );

  if p_kind = 'scope' then
    select count(*) into v_count
    from private.authoring_workspace_entities entity
    where entity.workspace_id = p_workspace_id
      and entity.entity_type in ('course','lesson','microsequence')
      and (v_query = '' or lower(coalesce(entity.content->>'title',entity.entity_id))
        like '%' || v_query || '%');
    select coalesce(jsonb_agg(jsonb_build_object(
      'scope', jsonb_build_object('kind', page.entity_type, 'ref', page.entity_id),
      'label', coalesce(page.content->>'title', page.entity_id),
      'entityPath', to_jsonb(private.authoring_design_scope_path_v1(
        p_workspace_id, page.entity_type, page.entity_id
      ))
    ) order by page.entity_type, page.entity_id), '[]'::jsonb) into v_items
    from (
      select * from private.authoring_workspace_entities entity
      where entity.workspace_id = p_workspace_id
        and entity.entity_type in ('course','lesson','microsequence')
        and (v_query = '' or lower(coalesce(entity.content->>'title',entity.entity_id))
          like '%' || v_query || '%')
      order by entity.entity_type, entity.entity_id
      offset v_offset limit p_limit
    ) page;
  elsif p_kind = 'base' then
    select count(*) into v_count
    from private.authoring_workspace_publications publication
    join public.courses course on course.id = publication.course_id
    where publication.workspace_id = p_workspace_id
      and publication.target = 'private'
      and publication.published_workspace_revision = v_workspace_revision
      and course.status = 'published' and course.deleted_at is null
      and course.completion_state = 'complete'
      and (v_query = '' or lower(course.title) like '%' || v_query || '%');
    select coalesce(jsonb_agg(jsonb_build_object(
      'ref', jsonb_build_object('id', page.course_id, 'version', page.content_hash),
      'label', page.title, 'approved', true,
      'scope', jsonb_build_object('kind','course','ref',page.workspace_course_id)
    ) order by page.course_id), '[]'::jsonb) into v_items
    from (
      select publication.course_id, publication.content_hash,
        publication.workspace_course_id, course.title
      from private.authoring_workspace_publications publication
      join public.courses course on course.id = publication.course_id
      where publication.workspace_id = p_workspace_id
        and publication.target = 'private'
        and publication.published_workspace_revision = v_workspace_revision
        and course.status = 'published' and course.deleted_at is null
        and course.completion_state = 'complete'
        and (v_query = '' or lower(course.title) like '%' || v_query || '%')
      order by publication.course_id offset v_offset limit p_limit
    ) page;
  elsif p_kind = 'factor_definition' then
    select count(*) into v_count
    from private.authoring_design_parameter_definitions definition
    where definition.supported_scopes && array['course','lesson','microsequence']::text[]
      and (v_query = '' or lower(coalesce(definition.definition->>'label',
        definition.parameter_id)) like '%' || v_query || '%');
    select coalesce(jsonb_agg(jsonb_build_object(
      'definitionRef', jsonb_build_object(
        'id', page.parameter_id, 'version', page.parameter_version
      ),
      'label', coalesce(page.definition->>'label', page.parameter_id),
      'kind', case when page.parameter_id = 'available_resource_set_refs'
        then 'resource_set' else 'parameter' end,
      'valueType', page.value_kind,
      'unit', jsonb_build_object(
        'numerator', page.unit_numerator, 'denominator', page.unit_denominator
      ),
      'supportedScopes', to_jsonb(array(
        select scope from unnest(page.supported_scopes) scope
        where scope in ('course','lesson','microsequence')
      )),
      'constraints', jsonb_strip_nulls(jsonb_build_object(
        'minimum', page.definition->'minimum',
        'maximum', page.definition->'maximum',
        'allowedEnumValues', page.definition->'allowedEnumValues',
        'setItemPattern', page.definition->'setItemPattern',
        'refNamespace', page.definition->'refNamespace',
        'vectorDimensions', page.definition->'vectorDimensions',
        'allowedUnits', page.definition->'allowedUnits',
        'relationKinds', page.definition->'relationKinds'
      )),
      'options', coalesce(page.definition->'options','[]'::jsonb)
    ) order by page.parameter_id, page.parameter_version), '[]'::jsonb)
    into v_items
    from (
      select * from private.authoring_design_parameter_definitions definition
      where definition.supported_scopes && array['course','lesson','microsequence']::text[]
        and (v_query = '' or lower(coalesce(definition.definition->>'label',
          definition.parameter_id)) like '%' || v_query || '%')
      order by definition.parameter_id, definition.parameter_version
      offset v_offset limit p_limit
    ) page;
  elsif p_kind = 'resource_set' then
    select count(*) into v_count
    from private.authoring_resource_sets resource_set
    where resource_set.workspace_id = p_workspace_id
      and resource_set.scope_kind in ('course','lesson','microsequence')
      and (v_query = '' or lower(resource_set.resource_set_id)
        like '%' || v_query || '%');
    select coalesce(jsonb_agg(jsonb_build_object(
      'ref', jsonb_build_object(
        'id', page.resource_set_id, 'version', page.resource_set_version
      ),
      'label', page.resource_set_id,
      'memberCount', (select count(*)
        from private.authoring_resource_set_members member
        where member.workspace_id = page.workspace_id
          and member.resource_set_id = page.resource_set_id
          and member.resource_set_version = page.resource_set_version),
      'scope', jsonb_build_object('kind',page.scope_kind,'ref',page.scope_ref)
    ) order by page.resource_set_id, page.resource_set_version), '[]'::jsonb)
    into v_items
    from (
      select * from private.authoring_resource_sets resource_set
      where resource_set.workspace_id = p_workspace_id
        and resource_set.scope_kind in ('course','lesson','microsequence')
        and (v_query = '' or lower(resource_set.resource_set_id)
          like '%' || v_query || '%')
      order by resource_set.resource_set_id, resource_set.resource_set_version
      offset v_offset limit p_limit
    ) page;
  elsif p_kind = 'consent_policy' then
    select count(*) into v_count
    from private.authoring_research_consent_policy_definitions definition
    join private.authoring_research_consent_policy_availability availability
      using(policy_id,policy_version)
    where availability.active
      and (v_query = '' or lower(definition.label) like '%' || v_query || '%');
    select coalesce(jsonb_agg(jsonb_build_object(
      'ref', jsonb_build_object('id',page.policy_id,'version',page.policy_version),
      'label', page.label
    ) order by page.policy_id,page.policy_version), '[]'::jsonb) into v_items
    from (
      select definition.*
      from private.authoring_research_consent_policy_definitions definition
      join private.authoring_research_consent_policy_availability availability
        using(policy_id,policy_version)
      where availability.active
        and (v_query = '' or lower(definition.label) like '%' || v_query || '%')
      order by definition.policy_id,definition.policy_version
      offset v_offset limit p_limit
    ) page;
  else
    select count(*) into v_count
    from private.authoring_research_instrument_definitions definition
    join private.authoring_research_instrument_availability availability
      using(instrument_id,instrument_version)
    where availability.active
      and ((p_kind = 'outcome' and definition.instrument_kind = 'outcome_measure')
        or (p_kind = 'instrument' and definition.instrument_kind in (
          'assessment','survey','external_registry'
        )))
      and (v_query = '' or lower(definition.label) like '%' || v_query || '%');
    select coalesce(jsonb_agg(jsonb_build_object(
      'ref', jsonb_build_object(
        'id',page.instrument_id,'version',page.instrument_version
      ), 'label',page.label
    ) order by page.instrument_id,page.instrument_version), '[]'::jsonb)
    into v_items
    from (
      select definition.*
      from private.authoring_research_instrument_definitions definition
      join private.authoring_research_instrument_availability availability
        using(instrument_id,instrument_version)
      where availability.active
        and ((p_kind = 'outcome' and definition.instrument_kind = 'outcome_measure')
          or (p_kind = 'instrument' and definition.instrument_kind in (
            'assessment','survey','external_registry'
          )))
        and (v_query = '' or lower(definition.label) like '%' || v_query || '%')
      order by definition.instrument_id,definition.instrument_version
      offset v_offset limit p_limit
    ) page;
  end if;
  return jsonb_build_object(
    'workspaceRevision', v_workspace_revision,
    'optionsSetRef', v_ref,
    'kind', p_kind,
    'items', v_items,
    'count', v_count,
    'nextCursor', case when v_offset + jsonb_array_length(v_items) < v_count
      then (v_offset + jsonb_array_length(v_items))::text else null end,
    'truncated', v_offset + jsonb_array_length(v_items) < v_count
  );
end;
$function$;

create function private.authoring_experiment_variant_projection_v1(
  p_revision_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_revision private.authoring_experiment_variant_revisions%rowtype;
  v_variant private.authoring_experiment_variants%rowtype;
  v_experiment private.authoring_experiments%rowtype;
  v_base private.authoring_experiment_base_revisions%rowtype;
  v_child private.authoring_workspaces%rowtype;
  v_frozen private.authoring_experiment_variant_freezes%rowtype;
  v_first_micro private.authoring_experiment_variant_microsequences%rowtype;
  v_allowed jsonb;
  v_materialized jsonb;
begin
  select * into v_revision from private.authoring_experiment_variant_revisions
  where id = p_revision_id;
  select * into v_variant from private.authoring_experiment_variants
  where id = v_revision.variant_id;
  select * into v_experiment from private.authoring_experiments
  where id = v_revision.experiment_id;
  select * into v_base from private.authoring_experiment_base_revisions
  where id = v_revision.base_revision_id;
  select * into v_child from private.authoring_workspaces
  where id = v_revision.child_workspace_id;
  select * into v_frozen from private.authoring_experiment_variant_freezes
  where variant_revision_id = v_revision.id;
  select * into v_first_micro
  from private.authoring_experiment_variant_microsequences micro
  where micro.variant_revision_id = v_revision.id order by micro.ordinal limit 1;
  select coalesce(jsonb_agg(jsonb_build_object(
    'ref', jsonb_build_object('id',resource.resource_set_id,
      'version',resource.resource_set_version),
    'label', resource.resource_set_id, 'role', resource.source_kind
  ) order by resource.resource_set_id,resource.resource_set_version), '[]'::jsonb)
  into v_allowed
  from (select distinct resource_set_id,resource_set_version,source_kind
    from private.authoring_experiment_variant_allowed_resource_sets
    where variant_revision_id = v_revision.id limit 2) resource;
  select coalesce(jsonb_agg(jsonb_build_object(
    'ref', value, 'label', value->>'id', 'role', 'materialized'
  )), '[]'::jsonb) into v_materialized
  from (
    select distinct reference.value
    from private.authoring_experiment_variant_microsequences micro
    cross join lateral jsonb_array_elements(micro.resource_set_refs) reference(value)
    where micro.variant_revision_id = v_revision.id limit 2
  ) value;
  return jsonb_build_object(
    'variantRevisionRef', jsonb_build_object(
      'id',v_revision.id,'version',v_revision.variant_revision::text
    ),
    'conditionRef', jsonb_build_object(
      'id',v_revision.condition_id,'version',v_revision.protocol_revision::text
    ),
    'baseRef', jsonb_build_object('id',v_base.id,'version',v_base.artifact_hash),
    'protocolRef', jsonb_build_object(
      'id',v_experiment.id,'version',v_revision.protocol_revision::text
    ),
    'state', v_revision.status,
    'workspaceRevision', v_child.revision,
    'readerTarget', jsonb_build_object(
      'workspaceId',v_child.id,'workspaceRevision',v_child.revision,
      'entityPath',v_base.scope_path,'courseId',v_revision.publication_course_id,
      'contentHash',coalesce(v_revision.final_content_hash,v_revision.initial_content_hash)
    ),
    'frozenAt',v_frozen.frozen_at,
    'snapshotRef',v_first_micro.design_refs->'effectiveSnapshotRef',
    'materializationRef',v_first_micro.design_refs->'manifestRef',
    'auditRunRef',case when v_first_micro.audit_run_id is null then null
      else jsonb_build_object('id',v_first_micro.audit_run_id,'version','1.0.0') end,
    'provenanceHash',private.authoring_experiment_hash_v1(jsonb_build_object(
      'base',v_base.artifact_hash,'protocol',v_revision.protocol_revision,
      'variant',v_revision.id,'final',v_revision.final_artifact_hash
    )),
    'provenancePinCount',(select count(*)
      from private.authoring_experiment_variant_microsequences micro
      where micro.variant_revision_id=v_revision.id),
    'currentness',jsonb_build_object(
      'base',v_experiment.current_base_revision_id=v_base.id,
      'protocol',v_experiment.current_protocol_revision=v_revision.protocol_revision,
      'condition',v_variant.current_variant_revision_id=v_revision.id,
      'materialization',v_revision.evidence_workspace_revision is not null
        and v_child.revision=v_revision.evidence_workspace_revision,
      'audit',not exists(select 1
        from private.authoring_experiment_variant_microsequences micro
        where micro.variant_revision_id=v_revision.id
          and not private.authoring_audit_run_is_current_v1(micro.audit_run_id))
        and exists(select 1 from private.authoring_experiment_variant_microsequences micro
          where micro.variant_revision_id=v_revision.id)
    ),
    'allowedResources',jsonb_build_object(
      'items',v_allowed,'count',(select count(distinct(resource_set_id,resource_set_version))
        from private.authoring_experiment_variant_allowed_resource_sets
        where variant_revision_id=v_revision.id),
      'truncated',(select count(distinct(resource_set_id,resource_set_version))>2
        from private.authoring_experiment_variant_allowed_resource_sets
        where variant_revision_id=v_revision.id)
    ),
    'materializedResources',jsonb_build_object(
      'items',v_materialized,
      'count',(select count(distinct reference.value)
        from private.authoring_experiment_variant_microsequences micro
        cross join lateral jsonb_array_elements(micro.resource_set_refs) reference(value)
        where micro.variant_revision_id=v_revision.id),
      'truncated',(select count(distinct reference.value)>2
        from private.authoring_experiment_variant_microsequences micro
        cross join lateral jsonb_array_elements(micro.resource_set_refs) reference(value)
        where micro.variant_revision_id=v_revision.id)
    )
  );
end;
$function$;

create function public.get_authoring_experiment_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_experiment_id uuid,
  p_section text default 'overview',
  p_protocol_revision integer default null,
  p_variant_set_ref jsonb default null,
  p_variant_cursor text default null,
  p_variant_limit integer default 10,
  p_difference_set_ref jsonb default null,
  p_difference_run_cursor text default null,
  p_difference_run_limit integer default 20,
  p_difference_run_ref jsonb default null,
  p_difference_cursor text default null,
  p_difference_limit integer default 20,
  p_participant_set_ref jsonb default null,
  p_participant_cursor text default null,
  p_participant_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_experiment private.authoring_experiments%rowtype;
  v_protocol private.authoring_experiment_protocol_revisions%rowtype;
  v_workspace_revision bigint;
  v_ref jsonb;
  v_offset integer;
  v_count integer;
  v_items jsonb;
  v_result jsonb;
  v_run private.authoring_experiment_difference_runs%rowtype;
begin
  perform private.require_service_role();
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'research'
  );
  select experiment.* into v_experiment
  from private.authoring_experiments experiment
  where experiment.id=p_experiment_id and experiment.workspace_id=p_workspace_id;
  if not found then raise exception 'Experimento inexistente.' using errcode='P0002'; end if;
  select workspace.revision into v_workspace_revision
  from private.authoring_workspaces workspace where workspace.id=p_workspace_id;
  if p_section not in ('overview','protocol','variants','differences','participants') then
    raise exception 'Seção experimental inválida.' using errcode='22023';
  end if;
  v_result := jsonb_build_object(
    'workspaceRevision',v_workspace_revision,
    'experimentId',v_experiment.id,
    'experimentRevision',v_experiment.revision,
    'state',v_experiment.state
  );
  if p_section = 'overview' then
    select * into v_protocol
    from private.authoring_experiment_protocol_revisions protocol
    where protocol.experiment_id=v_experiment.id
      and protocol.protocol_revision=v_experiment.current_protocol_revision;
    return v_result || jsonb_build_object(
      'title',v_experiment.title,
      'hypothesis',v_protocol.protocol->>'hypothesis',
      'assignment',jsonb_build_object(
        'rule',v_protocol.assignment_kind,
        'seedConfigured',v_protocol.assignment_secret_commitment is not null,
        'algorithm',v_protocol.assignment_algorithm_version,
        'commitment',v_protocol.assignment_secret_commitment
      ),
      'actions',jsonb_build_object(
        'saveProtocol',v_experiment.state='draft',
        'validate',v_experiment.state='draft',
        'generateVariants',v_experiment.state in (
          'validated','correction_required','collecting','paused'
        ),
        'decideDifference',v_experiment.state in ('generating','ready','collecting','paused'),
        'requestCorrection',v_experiment.state in ('ready','collecting','paused')
          and exists (
            select 1
            from private.authoring_experiment_variants variant
            join private.authoring_experiment_variant_revisions revision
              on revision.id=variant.current_variant_revision_id
            join private.authoring_experiment_variant_freezes frozen
              on frozen.variant_revision_id=revision.id
            where variant.experiment_id=v_experiment.id
              and variant.protocol_revision=v_experiment.current_protocol_revision
              and revision.status='frozen'
          ),
        'freeze',v_experiment.state in ('generating','ready'),
        'startCollection',v_experiment.state='ready',
        'rotateEnrollmentCode',v_experiment.state in ('collecting','paused'),
        'transitions',case v_experiment.state
          when 'collecting' then jsonb_build_array('pause','close','invalidate')
          when 'paused' then jsonb_build_array('resume','close','invalidate')
          else '[]'::jsonb end,
        'assignParticipant',v_experiment.state='collecting'
      ),
      'enrollment',jsonb_build_object(
        'configured',exists(select 1
          from private.authoring_experiment_enrollment_codes code
          where code.experiment_id=v_experiment.id and code.active
            and code.expires_at>statement_timestamp()),
        'expiresAt',(select max(code.expires_at)
          from private.authoring_experiment_enrollment_codes code
          where code.experiment_id=v_experiment.id and code.active)
      ),
      'conditionCount',(select count(*)
        from private.authoring_experiment_conditions condition
        where condition.experiment_id=v_experiment.id
          and condition.protocol_revision=v_experiment.current_protocol_revision),
      'variantCount',(select count(*)
        from private.authoring_experiment_variants variant
        where variant.experiment_id=v_experiment.id
          and variant.protocol_revision=v_experiment.current_protocol_revision),
      'differenceCount',(select count(*)
        from private.authoring_experiment_difference_runs run
        where run.experiment_id=v_experiment.id)
    );
  elsif p_section = 'protocol' then
    select * into v_protocol
    from private.authoring_experiment_protocol_revisions protocol
    where protocol.experiment_id=v_experiment.id
      and protocol.protocol_revision=coalesce(
        p_protocol_revision,v_experiment.current_protocol_revision
      );
    if not found then raise exception 'Revisão de protocolo inexistente.' using errcode='P0002'; end if;
    return v_result || jsonb_build_object(
      'protocolRef',jsonb_build_object(
        'id',v_experiment.id,'version',v_protocol.protocol_revision::text
      ),
      'protocolRevision',v_protocol.protocol_revision,
      'protocol',v_protocol.protocol || jsonb_build_object(
        'protocolRef',jsonb_build_object(
          'id',v_experiment.id,'version',v_protocol.protocol_revision::text
        ),
        'protocolRevision',v_protocol.protocol_revision
      )
    );
  elsif p_section = 'variants' then
    if p_variant_limit not between 1 and 10 then raise exception 'Página inválida.' using errcode='22023'; end if;
    v_ref:=private.authoring_experiment_variant_set_ref_v1(v_experiment.id);
    v_offset:=private.require_authoring_experiment_page_ref_v1(
      p_variant_set_ref,v_ref,p_variant_cursor,'O conjunto de variantes'
    );
    select count(*) into v_count from private.authoring_experiment_variants variant
    where variant.experiment_id=v_experiment.id
      and variant.protocol_revision=v_experiment.current_protocol_revision;
    select coalesce(jsonb_agg(
      private.authoring_experiment_variant_projection_v1(page.current_variant_revision_id)
      order by page.ordinal
    ),'[]'::jsonb) into v_items
    from (select * from private.authoring_experiment_variants variant
      where variant.experiment_id=v_experiment.id
        and variant.protocol_revision=v_experiment.current_protocol_revision
      order by variant.ordinal offset v_offset limit p_variant_limit) page;
    return v_result || jsonb_build_object(
      'variantSetRef',v_ref,'items',v_items,'count',v_count,
      'nextCursor',case when v_offset+jsonb_array_length(v_items)<v_count
        then (v_offset+jsonb_array_length(v_items))::text else null end,
      'truncated',v_offset+jsonb_array_length(v_items)<v_count
    );
  elsif p_section = 'participants' then
    if p_participant_limit not between 1 and 20 then raise exception 'Página inválida.' using errcode='22023'; end if;
    v_ref:=private.authoring_experiment_participant_set_ref_v1(v_experiment.id);
    v_offset:=private.require_authoring_experiment_page_ref_v1(
      p_participant_set_ref,v_ref,p_participant_cursor,'A fila participante'
    );
    select count(*) into v_count from private.authoring_experiment_enrollments enrollment
    where enrollment.experiment_id=v_experiment.id;
    select coalesce(jsonb_agg(jsonb_build_object(
      'enrollmentRef',page.id,
      'pseudonymLabel','Participante ' || upper(substr(replace(page.id::text,'-',''),1,8)),
      'status',case when page.enrollment_status='withdrawn' then 'withdrawn'
        when page.assignment_id is null then 'enrolled' else 'assigned' end,
      'assignedConditionRef',case when page.condition_id is null then null
        else jsonb_build_object('id',page.condition_id,
          'version',page.protocol_revision::text) end
    ) order by page.recorded_at,page.id),'[]'::jsonb) into v_items
    from (select enrollment.id,enrollment.status enrollment_status,
        enrollment.protocol_revision,enrollment.recorded_at,
        assignment.id assignment_id,assignment.condition_id
      from private.authoring_experiment_enrollments enrollment
      left join private.authoring_experiment_assignments assignment
        on assignment.enrollment_id=enrollment.id
      where enrollment.experiment_id=v_experiment.id
      order by enrollment.recorded_at,enrollment.id
      offset v_offset limit p_participant_limit) page;
    return v_result || jsonb_build_object(
      'participantSetRef',v_ref,'items',v_items,'count',v_count,
      'nextCursor',case when v_offset+jsonb_array_length(v_items)<v_count
        then (v_offset+jsonb_array_length(v_items))::text else null end,
      'truncated',v_offset+jsonb_array_length(v_items)<v_count
    );
  elsif p_difference_run_ref is not null then
    if p_difference_limit not between 1 and 20
       or not private.authoring_design_closed_object_v1(
         p_difference_run_ref,array['id','version'],array['id','version']
       ) then raise exception 'Página factual inválida.' using errcode='22023'; end if;
    select * into v_run from private.authoring_experiment_difference_runs run
    where run.id=(p_difference_run_ref->>'id')::uuid
      and run.experiment_id=v_experiment.id;
    if not found or v_run.factual_hash<>p_difference_run_ref->>'version' then
      raise exception 'differenceRunRef mudou.' using errcode='40001';
    end if;
    v_offset:=private.require_authoring_experiment_page_ref_v1(
      p_difference_run_ref,p_difference_run_ref,p_difference_cursor,'A rodada factual'
    );
    v_count:=v_run.hunk_count;
    select coalesce(jsonb_agg(jsonb_build_object(
      'differenceRef',jsonb_build_object(
        'id',page.difference_ref_id,'version',page.hunk_hash
      ),
      'differenceId',page.hunk_id,'path',array_to_string(page.path,'/'),
      'kind',page.change_kind,'beforeSummary',case when page.before_hash is null
        then null else 'hash:'||substr(page.before_hash,1,16) end,
      'afterSummary',case when page.after_hash is null
        then null else 'hash:'||substr(page.after_hash,1,16) end,
      'classification',page.classification,
      'publicRationale',page.public_evidence,
      'evidenceRefs',to_jsonb(page.evidence_refs),
      'humanDecision',page.decision,
      'requiresParticipantContinuity',page.decision='correct'
    ) order by page.ordinal),'[]'::jsonb) into v_items
    from (select hunk.*,
        classification.id classification_id,classification.classification,
        classification.public_evidence,classification.evidence_refs,
        decision.decision
      from private.authoring_experiment_difference_hunks hunk
      left join private.authoring_experiment_diff_classifications classification
        on classification.difference_run_id=hunk.difference_run_id
       and classification.hunk_id=hunk.hunk_id
      left join private.authoring_experiment_difference_decisions decision
        on decision.difference_run_id=hunk.difference_run_id
       and decision.hunk_id=hunk.hunk_id
      where hunk.difference_run_id=v_run.id
      order by hunk.ordinal offset v_offset limit p_difference_limit) page;
    return v_result || jsonb_build_object(
      'differenceRunRef',p_difference_run_ref,'items',v_items,'count',v_count,
      'nextCursor',case when v_offset+jsonb_array_length(v_items)<v_count
        then (v_offset+jsonb_array_length(v_items))::text else null end,
      'truncated',v_offset+jsonb_array_length(v_items)<v_count
    );
  else
    if p_difference_run_limit not between 1 and 20 then raise exception 'Página inválida.' using errcode='22023'; end if;
    v_ref:=private.authoring_experiment_difference_set_ref_v1(v_experiment.id);
    v_offset:=private.require_authoring_experiment_page_ref_v1(
      p_difference_set_ref,v_ref,p_difference_run_cursor,'O conjunto de diferenças'
    );
    select count(*) into v_count from private.authoring_experiment_difference_runs run
    where run.experiment_id=v_experiment.id;
    select coalesce(jsonb_agg(jsonb_build_object(
      'differenceRef',jsonb_build_object('id',page.id,'version',page.factual_hash),
      'baselineRef',jsonb_build_object('kind',page.baseline_kind,'ref',
        jsonb_build_object('id',coalesce(page.base_revision_id,
          page.baseline_variant_revision_id),'version',page.baseline_artifact_hash)),
      'candidateVariantRevisionRef',jsonb_build_object(
        'id',page.candidate_variant_revision_id,
        'version',page.candidate_variant_revision::text
      ),
      'state',case when page.decision_count=page.hunk_count then 'decided'
        when page.classified_count=page.hunk_count then 'classified'
        else 'pending' end,
      'hunkCount',page.hunk_count,'classifiedCount',page.classified_count,
      'decision',page.aggregate_decision,
      'requiresParticipantContinuity',page.has_assignments
    ) order by page.created_at,page.id),'[]'::jsonb) into v_items
    from (select run.*,candidate.variant_revision candidate_variant_revision,
        (select count(*) from private.authoring_experiment_diff_classifications c
          where c.difference_run_id=run.id) classified_count,
        (select count(*) from private.authoring_experiment_difference_decisions d
          where d.difference_run_id=run.id) decision_count,
        (select case when count(distinct d.decision)=1 then min(d.decision) end
          from private.authoring_experiment_difference_decisions d
          where d.difference_run_id=run.id) aggregate_decision,
        exists(select 1 from private.authoring_experiment_assignments a
          where a.variant_revision_id=run.candidate_variant_revision_id) has_assignments
      from private.authoring_experiment_difference_runs run
      join private.authoring_experiment_variant_revisions candidate
        on candidate.id=run.candidate_variant_revision_id
      where run.experiment_id=v_experiment.id
      order by run.created_at,run.id offset v_offset limit p_difference_run_limit) page;
    return v_result || jsonb_build_object(
      'differenceSetRef',v_ref,'items',v_items,'count',v_count,
      'nextCursor',case when v_offset+jsonb_array_length(v_items)<v_count
        then (v_offset+jsonb_array_length(v_items))::text else null end,
      'truncated',v_offset+jsonb_array_length(v_items)<v_count
    );
  end if;
end;
$function$;

create function public.get_authoring_experiment_context_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_experiment_ref jsonb default null,
  p_variant_revision_ref jsonb default null,
  p_variant_set_ref jsonb default null,
  p_scope_path text[] default null,
  p_cursor text default null,
  p_limit integer default 20,
  p_difference_run_ref jsonb default null,
  p_difference_cursor text default null,
  p_difference_limit integer default 20,
  p_collection text default null,
  p_collection_set_ref jsonb default null,
  p_collection_cursor text default null,
  p_collection_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_route_child private.authoring_experiment_variant_revisions%rowtype;
  v_candidate private.authoring_experiment_variant_revisions%rowtype;
  v_variant private.authoring_experiment_variants%rowtype;
  v_experiment private.authoring_experiments%rowtype;
  v_protocol private.authoring_experiment_protocol_revisions%rowtype;
  v_base private.authoring_experiment_base_revisions%rowtype;
  v_child private.authoring_workspaces%rowtype;
  v_ref jsonb;
  v_offset integer;
  v_count integer;
  v_items jsonb;
  v_factors jsonb;
  v_run private.authoring_experiment_difference_runs%rowtype;
  v_collection text := coalesce(p_collection,'factor_targets');
  v_collection_offset integer := 0;
  v_factor_target_ref jsonb;
  v_lock_ref jsonb;
  v_target_path_ref jsonb;
  v_resource_set_ref jsonb;
  v_difference_run_set_ref jsonb;
  v_factor_target_count integer;
  v_lock_count integer;
  v_target_path_count integer;
  v_resource_set_count integer;
  v_difference_run_count integer;
begin
  perform private.require_service_role();
  if p_limit is null or p_limit not between 1 and 20
     or p_difference_limit is null or p_difference_limit not between 1 and 20
     or p_collection_limit is null or p_collection_limit not between 1 and 20
     or v_collection not in (
       'factor_targets','locks','target_paths','resource_sets','difference_runs'
     )
     or (p_difference_run_ref is not null and (
       p_collection is not null or p_collection_set_ref is not null
       or p_collection_cursor is not null
     ))
     or (p_difference_run_ref is null and p_difference_cursor is not null) then
    raise exception 'Página de contexto experimental inválida.' using errcode='22023';
  end if;
  select revision.* into v_route_child
  from private.authoring_experiment_variant_revisions revision
  where revision.child_workspace_id=p_workspace_id;

  if not found and p_experiment_ref is null and p_variant_revision_ref is null then
    perform private.require_educational_workspace_capability_v1(
      p_workspace_id,p_actor_id,'research'
    );
    v_ref:=private.authoring_experiment_hash_v1(coalesce((
      select jsonb_agg(jsonb_build_array(
        experiment.id,experiment.revision,revision.id,revision.variant_revision,
        revision.status
      ) order by experiment.id,variant.ordinal)
      from private.authoring_experiments experiment
      join private.authoring_experiment_variants variant
        on variant.experiment_id=experiment.id
       and variant.protocol_revision=experiment.current_protocol_revision
      join private.authoring_experiment_variant_revisions revision
        on revision.id=variant.current_variant_revision_id
      where experiment.workspace_id=p_workspace_id
    ),'[]'::jsonb));
    v_ref:=jsonb_build_object(
      'id','experiment-context-variants:'||p_workspace_id::text,
      'version',v_ref
    );
    v_offset:=private.require_authoring_experiment_page_ref_v1(
      p_variant_set_ref,v_ref,p_cursor,'O conjunto de alvos experimentais'
    );
    select count(*) into v_count
    from private.authoring_experiments experiment
    join private.authoring_experiment_variants variant
      on variant.experiment_id=experiment.id
     and variant.protocol_revision=experiment.current_protocol_revision
    join private.authoring_experiment_variant_revisions revision
      on revision.id=variant.current_variant_revision_id
    where experiment.workspace_id=p_workspace_id;
    select coalesce(jsonb_agg(jsonb_build_object(
      'experimentRef',jsonb_build_object(
        'id',page.experiment_id,'version',page.experiment_revision::text
      ),
      'variantRevisionRef',jsonb_build_object(
        'id',page.revision_id,'version',page.variant_revision::text
      ),
      'experimentLabel',page.experiment_title,
      'conditionLabel',page.condition_label,
      'status',page.status,
      'scope',jsonb_build_object('kind',page.scope_kind,'ref',page.scope_ref),
      'targetLabel',page.scope_ref
    ) order by page.experiment_id,page.ordinal),'[]'::jsonb) into v_items
    from (select experiment.id experiment_id,
        experiment.revision experiment_revision,
        experiment.title experiment_title,variant.ordinal,
        revision.id revision_id,revision.variant_revision,revision.status,
        condition.label condition_label,
        protocol.scope_kind,protocol.scope_ref
      from private.authoring_experiments experiment
      join private.authoring_experiment_protocol_revisions protocol
        on protocol.experiment_id=experiment.id
       and protocol.protocol_revision=experiment.current_protocol_revision
      join private.authoring_experiment_variants variant
        on variant.experiment_id=experiment.id
       and variant.protocol_revision=experiment.current_protocol_revision
      join private.authoring_experiment_variant_revisions revision
        on revision.id=variant.current_variant_revision_id
      join private.authoring_experiment_conditions condition
        on condition.experiment_id=variant.experiment_id
       and condition.protocol_revision=variant.protocol_revision
       and condition.condition_id=variant.condition_id
      where experiment.workspace_id=p_workspace_id
      order by experiment.id,variant.ordinal offset v_offset limit p_limit) page;
    return jsonb_build_object(
      'mode','discovery',
      'workspace',jsonb_build_object(
        'id',p_workspace_id,'title',(select title from private.authoring_workspaces
          where id=p_workspace_id),'revision',(select revision
          from private.authoring_workspaces where id=p_workspace_id)
      ),
      'variantSetRef',v_ref,
      'items',v_items,'count',v_count,
      'nextCursor',case when v_offset+jsonb_array_length(v_items)<v_count
        then (v_offset+jsonb_array_length(v_items))::text else null end,
      'truncated',v_offset+jsonb_array_length(v_items)<v_count
    );
  end if;

  if v_route_child.id is not null then
    v_candidate:=v_route_child;
    perform private.require_educational_workspace_capability_v1(
      p_workspace_id,p_actor_id,'read'
    );
  else
    perform private.require_educational_workspace_capability_v1(
      p_workspace_id,p_actor_id,'research'
    );
    if p_experiment_ref is null or p_variant_revision_ref is null
       or not private.authoring_design_closed_object_v1(
         p_experiment_ref,array['id','version'],array['id','version']
       )
       or not private.authoring_design_closed_object_v1(
         p_variant_revision_ref,array['id','version'],array['id','version']
       ) then
      raise exception 'Contexto exato exige refs versionadas.' using errcode='22023';
    end if;
    select revision.* into v_candidate
    from private.authoring_experiment_variant_revisions revision
    where revision.id=(p_variant_revision_ref->>'id')::uuid;
  end if;
  if v_candidate.id is null then
    raise exception 'VariantRevision inexistente.' using errcode='P0002';
  end if;
  select * into v_experiment from private.authoring_experiments experiment
  where experiment.id=v_candidate.experiment_id;
  select * into v_variant from private.authoring_experiment_variants variant
  where variant.id=v_candidate.variant_id;
  select * into v_protocol
  from private.authoring_experiment_protocol_revisions protocol
  where protocol.experiment_id=v_candidate.experiment_id
    and protocol.protocol_revision=v_candidate.protocol_revision;
  select * into v_base from private.authoring_experiment_base_revisions base
  where base.id=v_candidate.base_revision_id;
  select * into v_child from private.authoring_workspaces workspace
  where workspace.id=v_candidate.child_workspace_id and workspace.deleted_at is null;
  if p_experiment_ref is not null and (
       p_experiment_ref->>'id'<>v_experiment.id::text
       or p_experiment_ref->>'version'<>v_experiment.revision::text
     ) then raise exception 'experimentRef mudou.' using errcode='40001'; end if;
  if p_variant_revision_ref is not null and (
       p_variant_revision_ref->>'id'<>v_candidate.id::text
       or p_variant_revision_ref->>'version'<>v_candidate.variant_revision::text
     ) then raise exception 'variantRevisionRef mudou.' using errcode='40001'; end if;
  if p_scope_path is not null and not (
    cardinality(p_scope_path)>=cardinality(v_base.scope_path)
    and p_scope_path[1:cardinality(v_base.scope_path)]=v_base.scope_path
  ) then raise exception 'O path não pertence ao alvo experimental.' using errcode='23503'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'factorId',factor.factor_id,
    'definitionRef',jsonb_build_object(
      'id',factor.parameter_id,'version',factor.parameter_version
    ),
    'kind',factor.factor_kind,
    'targetCount',(select count(*)
      from private.authoring_experiment_factor_targets target
      where target.experiment_id=factor.experiment_id
        and target.protocol_revision=factor.protocol_revision
        and target.factor_id=factor.factor_id),
    'value',level.value,
    'resourceSetRef',case when factor.factor_kind='resource_set' then
      (select jsonb_build_object('id',reference.resource_set_id,
        'version',reference.resource_set_version)
       from private.authoring_experiment_condition_resource_sets reference
       where reference.experiment_id=factor.experiment_id
         and reference.protocol_revision=factor.protocol_revision
         and reference.condition_id=chosen.condition_id
         and reference.factor_id=factor.factor_id
       order by reference.ordinal limit 1) else null end
  ) order by factor.ordinal),'[]'::jsonb) into v_factors
  from private.authoring_experiment_condition_levels chosen
  join private.authoring_experiment_factors factor
    on factor.experiment_id=chosen.experiment_id
   and factor.protocol_revision=chosen.protocol_revision
   and factor.factor_id=chosen.factor_id
  join private.authoring_experiment_factor_levels level
    on level.experiment_id=chosen.experiment_id
   and level.protocol_revision=chosen.protocol_revision
   and level.factor_id=chosen.factor_id and level.level_id=chosen.level_id
  where chosen.experiment_id=v_candidate.experiment_id
    and chosen.protocol_revision=v_candidate.protocol_revision
    and chosen.condition_id=v_candidate.condition_id;

  select count(*) into v_factor_target_count
  from private.authoring_experiment_factor_targets target
  where target.experiment_id=v_candidate.experiment_id
    and target.protocol_revision=v_candidate.protocol_revision;
  select count(*) into v_lock_count
  from private.authoring_experiment_variant_parameter_locks lock
  where lock.variant_revision_id=v_candidate.id;
  select count(*) into v_target_path_count
  from private.authoring_experiment_base_microsequences micro
  where micro.base_revision_id=v_base.id;
  select count(*) into v_resource_set_count
  from (select distinct allowed.resource_set_id,allowed.resource_set_version
    from private.authoring_experiment_variant_allowed_resource_sets allowed
    where allowed.variant_revision_id=v_candidate.id) resource;
  select count(*) into v_difference_run_count
  from private.authoring_experiment_difference_runs run
  where run.candidate_variant_revision_id=v_candidate.id;
  v_factor_target_ref:=jsonb_build_object(
    'id','experiment-factor-targets:'||v_candidate.id::text,
    'version',private.authoring_experiment_hash_v1(jsonb_build_object(
      'experimentRevision',v_experiment.revision,
      'protocolHash',v_protocol.protocol_hash,
      'conditionId',v_candidate.condition_id,
      'count',v_factor_target_count
    ))
  );
  v_lock_ref:=jsonb_build_object(
    'id','experiment-locks:'||v_candidate.id::text,
    'version',private.authoring_experiment_hash_v1(jsonb_build_object(
      'experimentRevision',v_experiment.revision,
      'variantRevision',v_candidate.variant_revision,
      'count',v_lock_count
    ))
  );
  v_target_path_ref:=jsonb_build_object(
    'id','experiment-target-paths:'||v_candidate.id::text,
    'version',private.authoring_experiment_hash_v1(jsonb_build_object(
      'experimentRevision',v_experiment.revision,
      'baseRevisionId',v_base.id,
      'artifactHash',v_base.artifact_hash,
      'count',v_target_path_count
    ))
  );
  v_resource_set_ref:=jsonb_build_object(
    'id','experiment-resource-sets:'||v_candidate.id::text,
    'version',private.authoring_experiment_hash_v1(jsonb_build_object(
      'experimentRevision',v_experiment.revision,
      'variantRevisionId',v_candidate.id,
      'count',v_resource_set_count
    ))
  );
  v_difference_run_set_ref:=jsonb_build_object(
    'id','experiment-difference-runs:'||v_candidate.id::text,
    'version',private.authoring_experiment_hash_v1(jsonb_build_object(
      'experimentRevision',v_experiment.revision,
      'variantRevisionId',v_candidate.id,
      'count',v_difference_run_count
    ))
  );

  v_items:='[]'::jsonb;
  if p_difference_run_ref is null then
    v_ref:=case v_collection
      when 'factor_targets' then v_factor_target_ref
      when 'locks' then v_lock_ref
      when 'target_paths' then v_target_path_ref
      when 'resource_sets' then v_resource_set_ref
      else v_difference_run_set_ref end;
    v_collection_offset:=private.require_authoring_experiment_page_ref_v1(
      p_collection_set_ref,v_ref,p_collection_cursor,
      'A coleção do contexto experimental'
    );
    if v_collection='factor_targets' then
      select coalesce(jsonb_agg(jsonb_build_object(
        'factorId',page.factor_id,'targetOrdinal',page.ordinal,
        'kind',page.scope_kind,'ref',page.scope_ref
      ) order by page.factor_ordinal,page.ordinal),'[]'::jsonb) into v_items
      from (select target.*,factor.ordinal factor_ordinal
        from private.authoring_experiment_factor_targets target
        join private.authoring_experiment_factors factor
          on factor.experiment_id=target.experiment_id
         and factor.protocol_revision=target.protocol_revision
         and factor.factor_id=target.factor_id
        where target.experiment_id=v_candidate.experiment_id
          and target.protocol_revision=v_candidate.protocol_revision
        order by factor.ordinal,target.ordinal
        offset v_collection_offset limit p_collection_limit) page;
    elsif v_collection='locks' then
      select coalesce(jsonb_agg(jsonb_build_object(
        'assignmentRef',jsonb_build_object(
          'id',page.assignment_id,'version',page.assignment_version
        ),
        'definitionRef',jsonb_build_object(
          'id',page.parameter_id,'version',page.parameter_version
        ),
        'factorId',page.factor_id,'targetOrdinal',page.target_ordinal,
        'scope',jsonb_build_object(
          'kind',page.scope_kind,'ref',page.scope_ref
        ),
        'resourceSetRef',null
      ) order by page.factor_id,page.target_ordinal),'[]'::jsonb) into v_items
      from (select lock.*,assignment.parameter_id,assignment.parameter_version,
          assignment.scope_kind,assignment.scope_ref
        from private.authoring_experiment_variant_parameter_locks lock
        join private.authoring_design_parameter_assignments assignment
          on assignment.workspace_id=v_candidate.child_workspace_id
         and assignment.assignment_id=lock.assignment_id
         and assignment.assignment_version=lock.assignment_version
        where lock.variant_revision_id=v_candidate.id
        order by lock.factor_id,lock.target_ordinal
        offset v_collection_offset limit p_collection_limit) page;
    elsif v_collection='target_paths' then
      select coalesce(jsonb_agg(jsonb_build_object(
        'entityType','microsequence','entityPath',to_jsonb(page.scope_path),
        'label',page.microsequence_ref
      ) order by page.ordinal),'[]'::jsonb) into v_items
      from (select * from private.authoring_experiment_base_microsequences micro
        where micro.base_revision_id=v_base.id order by micro.ordinal
        offset v_collection_offset limit p_collection_limit) page;
    elsif v_collection='resource_sets' then
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',page.resource_set_id,'version',page.resource_set_version
      ) order by page.resource_set_id,page.resource_set_version),'[]'::jsonb)
      into v_items
      from (select distinct allowed.resource_set_id,allowed.resource_set_version
        from private.authoring_experiment_variant_allowed_resource_sets allowed
        where allowed.variant_revision_id=v_candidate.id
        order by allowed.resource_set_id,allowed.resource_set_version
        offset v_collection_offset limit p_collection_limit) page;
    else
      select coalesce(jsonb_agg(jsonb_build_object(
        'differenceRunRef',jsonb_build_object(
          'id',page.id,'version',page.factual_hash
        ),
        'baselineRef',jsonb_build_object(
          'kind',page.baseline_kind,
          'ref',jsonb_build_object(
            'id',coalesce(page.base_revision_id,
              page.baseline_variant_revision_id),
            'version',page.baseline_artifact_hash
          )
        ),
        'hunkCount',page.hunk_count,
        'recordedCount',page.recorded_count,
        'classifiedCount',page.classified_count,
        'status',case
          when page.recorded_count<page.hunk_count then 'partial'
          when page.classified_count<page.hunk_count then 'classification_pending'
          else 'classified' end
      ) order by page.created_at,page.id),'[]'::jsonb) into v_items
      from (select run.*,
          (select count(*) from private.authoring_experiment_difference_hunks hunk
            where hunk.difference_run_id=run.id) recorded_count,
          (select count(*) from private.authoring_experiment_diff_classifications classification
            where classification.difference_run_id=run.id) classified_count
        from private.authoring_experiment_difference_runs run
        where run.candidate_variant_revision_id=v_candidate.id
        order by run.created_at,run.id
        offset v_collection_offset limit p_collection_limit) page;
    end if;
  end if;

  if p_difference_run_ref is not null then
    select * into v_run from private.authoring_experiment_difference_runs run
    where run.id=(p_difference_run_ref->>'id')::uuid
      and run.candidate_variant_revision_id=v_candidate.id;
    if not found or v_run.factual_hash<>p_difference_run_ref->>'version' then
      raise exception 'differenceRunRef mudou.' using errcode='40001';
    end if;
    v_offset:=private.require_authoring_experiment_page_ref_v1(
      p_difference_run_ref,p_difference_run_ref,p_difference_cursor,
      'A rodada factual do contexto'
    );
    select coalesce(jsonb_agg(jsonb_build_object(
      'differenceRef',jsonb_build_object(
        'id',page.difference_ref_id,'version',page.hunk_hash
      ),
      'differenceId',page.hunk_id,
      'path',to_jsonb(page.path),'kind',page.change_kind,
      'factualSummary',page.factual_summary,
      'beforeHash',page.before_hash,'afterHash',page.after_hash,
      'evidenceRefs',to_jsonb(page.evidence_refs),
      'classification',page.classification
    ) order by page.ordinal),'[]'::jsonb) into v_items
    from (select hunk.*,classification.classification
      from private.authoring_experiment_difference_hunks hunk
      left join private.authoring_experiment_diff_classifications classification
        on classification.difference_run_id=hunk.difference_run_id
       and classification.hunk_id=hunk.hunk_id
      where hunk.difference_run_id=v_run.id
      order by hunk.ordinal offset v_offset limit p_difference_limit) page;
  end if;

  return jsonb_build_object(
    'mode','target',
    'workspace',jsonb_build_object(
      'id',p_workspace_id,
      'title',(select title from private.authoring_workspaces where id=p_workspace_id),
      'revision',(select revision from private.authoring_workspaces where id=p_workspace_id)
    ),
    'parentWorkspaceId',v_experiment.workspace_id,
    'targetWorkspaceId',v_candidate.child_workspace_id,
    'experimentRef',jsonb_build_object(
      'id',v_experiment.id,'version',v_experiment.revision::text
    ),
    'experimentRevision',v_experiment.revision,
    'status',v_experiment.state,
    'baseRef',jsonb_build_object('id',v_base.id,'version',v_base.artifact_hash),
    'protocolRef',jsonb_build_object(
      'id',v_experiment.id,'version',v_protocol.protocol_revision::text
    ),
    'conditionRef',jsonb_build_object(
      'id',v_candidate.condition_id,'version',v_candidate.protocol_revision::text
    ),
    'variantRevisionRef',jsonb_build_object(
      'id',v_candidate.id,'version',v_candidate.variant_revision::text
    ),
    'scope',jsonb_build_object('kind',v_base.scope_kind,'ref',v_base.scope_ref),
    'factors',v_factors,
    'factorTargets',jsonb_build_object(
      'setRef',v_factor_target_ref,
      'items',case when p_difference_run_ref is null
          and v_collection='factor_targets' then v_items else '[]'::jsonb end,
      'count',v_factor_target_count,
      'nextCursor',case when p_difference_run_ref is null
          and v_collection='factor_targets'
          and v_collection_offset+jsonb_array_length(v_items)<v_factor_target_count
        then (v_collection_offset+jsonb_array_length(v_items))::text else null end,
      'truncated',case when p_difference_run_ref is null
          and v_collection='factor_targets'
        then v_collection_offset+jsonb_array_length(v_items)<v_factor_target_count
        else v_factor_target_count>0 end
    ),
    'invariants',(select coalesce(jsonb_agg(invariant.invariant_kind
      order by invariant.ordinal),'[]'::jsonb)
      from private.authoring_experiment_invariants invariant
      where invariant.experiment_id=v_experiment.id
        and invariant.protocol_revision=v_protocol.protocol_revision),
    'locks',jsonb_build_object(
      'setRef',v_lock_ref,
      'items',case when p_difference_run_ref is null
          and v_collection='locks' then v_items else '[]'::jsonb end,
      'count',v_lock_count,
      'nextCursor',case when p_difference_run_ref is null
          and v_collection='locks'
          and v_collection_offset+jsonb_array_length(v_items)<v_lock_count
        then (v_collection_offset+jsonb_array_length(v_items))::text else null end,
      'truncated',case when p_difference_run_ref is null and v_collection='locks'
        then v_collection_offset+jsonb_array_length(v_items)<v_lock_count
        else v_lock_count>0 end
    ),
    'resourceSetRefs',jsonb_build_object(
      'setRef',v_resource_set_ref,
      'items',case when p_difference_run_ref is null
          and v_collection='resource_sets' then v_items else '[]'::jsonb end,
      'count',v_resource_set_count,
      'nextCursor',case when p_difference_run_ref is null
          and v_collection='resource_sets'
          and v_collection_offset+jsonb_array_length(v_items)<v_resource_set_count
        then (v_collection_offset+jsonb_array_length(v_items))::text else null end,
      'truncated',case when p_difference_run_ref is null
          and v_collection='resource_sets'
        then v_collection_offset+jsonb_array_length(v_items)<v_resource_set_count
        else v_resource_set_count>0 end
    ),
    'currentness',jsonb_build_object(
      'base',v_experiment.current_base_revision_id=v_base.id,
      'protocol',v_experiment.current_protocol_revision=v_protocol.protocol_revision,
      'condition',v_variant.current_variant_revision_id=v_candidate.id,
      'variant',v_variant.current_variant_revision_id=v_candidate.id,
      'design',v_candidate.status in ('generating','ready')
        and v_child.deleted_at is null
    ),
    'mandate',case when v_child.authoring_state->'mandate' is null
        or v_child.authoring_state->'mandate'='null'::jsonb then null
      else jsonb_build_object(
        'mandateRef',jsonb_build_object(
          'id',v_child.authoring_state#>>'{mandate,id}',
          'version',v_child.authoring_state#>>'{mandate,decidedAtRevision}'
        ),
        'status','active',
        'conditionRef',jsonb_build_object(
          'id',v_candidate.condition_id,'version',v_candidate.protocol_revision::text
        ),
        'variantRevisionRef',jsonb_build_object(
          'id',v_candidate.id,'version',v_candidate.variant_revision::text
        )
      ) end,
    'targetPaths',jsonb_build_object(
      'setRef',v_target_path_ref,
      'items',case when p_difference_run_ref is null
          and v_collection='target_paths' then v_items else '[]'::jsonb end,
      'count',v_target_path_count,
      'nextCursor',case when p_difference_run_ref is null
          and v_collection='target_paths'
          and v_collection_offset+jsonb_array_length(v_items)<v_target_path_count
        then (v_collection_offset+jsonb_array_length(v_items))::text else null end,
      'truncated',case when p_difference_run_ref is null
          and v_collection='target_paths'
        then v_collection_offset+jsonb_array_length(v_items)<v_target_path_count
        else v_target_path_count>0 end
    ),
    'differenceRuns',jsonb_build_object(
      'setRef',v_difference_run_set_ref,
      'items',case when p_difference_run_ref is null
          and v_collection='difference_runs' then v_items else '[]'::jsonb end,
      'count',v_difference_run_count,
      'nextCursor',case when p_difference_run_ref is null
          and v_collection='difference_runs'
          and v_collection_offset+jsonb_array_length(v_items)<v_difference_run_count
        then (v_collection_offset+jsonb_array_length(v_items))::text else null end,
      'truncated',case when p_difference_run_ref is null
          and v_collection='difference_runs'
        then v_collection_offset+jsonb_array_length(v_items)<v_difference_run_count
        else v_difference_run_count>0 end
    ),
    'collection',case when p_difference_run_ref is null then v_collection else null end,
    'collectionSetRef',case when p_difference_run_ref is null then v_ref else null end,
    'differenceRunRef',p_difference_run_ref,
    'differences',case when p_difference_run_ref is null then null
      else jsonb_build_object(
        'items',v_items,'count',v_run.hunk_count,
        'nextCursor',case when v_offset+jsonb_array_length(v_items)<v_run.hunk_count
          then (v_offset+jsonb_array_length(v_items))::text else null end,
        'truncated',v_offset+jsonb_array_length(v_items)<v_run.hunk_count
      ) end
  );
end;
$function$;

create or replace function public.list_unreferenced_artifacts_v4(
  p_older_than interval default interval '7 days',
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
begin
  perform private.require_service_role();
  if p_older_than is null or p_older_than<interval '1 hour'
     or p_limit is null or p_limit not between 1 and 1000 then
    raise exception 'Parâmetros de limpeza inválidos.' using errcode='22023';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'hash',artifact.hash,'bucket',artifact.bucket,
    'objectKey',artifact.object_key,'sizeBytes',artifact.size_bytes
  ) order by artifact.created_at)
  from (select ref.* from private.artifact_refs ref
    where ref.created_at<now()-p_older_than
      and not exists(select 1 from private.course_revisions revision
        where revision.artifact_hash=ref.hash)
      and not exists(select 1 from public.courses course
        where course.revision_artifact_hash=ref.hash)
      and not exists(select 1 from private.catalog_review_submissions submission
        where submission.artifact_hash=ref.hash)
      and not exists(select 1 from private.authoring_experiment_base_revisions base
        where base.artifact_hash=ref.hash)
      and not exists(select 1
        from private.authoring_experiment_variant_revisions variant
        where variant.initial_artifact_hash=ref.hash
          or variant.final_artifact_hash=ref.hash)
      and not exists(select 1
        from private.authoring_experiment_difference_runs run
        where run.baseline_artifact_hash=ref.hash
          or run.variant_artifact_hash=ref.hash)
      and not exists(select 1 from private.authoring_experiment_variant_freezes frozen
        where frozen.artifact_hash=ref.hash)
    order by ref.created_at limit p_limit) artifact),'[]'::jsonb);
end;
$function$;

create or replace function public.claim_unreferenced_artifacts_v4(
  p_claim_token uuid,
  p_older_than interval default interval '7 days',
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_artifact private.artifact_refs%rowtype;
  v_reclaimed integer:=0;
begin
  perform private.require_service_role();
  if p_claim_token is null or p_older_than is null
     or p_older_than<interval '1 hour'
     or p_limit is null or p_limit not between 1 and 500 then
    raise exception 'Parâmetros de coleta inválidos.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('aralearn-artifact-gc-v4',0));
  with stale as materialized (
    select tombstone.hash from private.artifact_gc_tombstones tombstone
    where tombstone.claimed_at<now()-interval '15 minutes'
    order by tombstone.claimed_at,tombstone.hash
    for update skip locked limit p_limit
  ) update private.artifact_gc_tombstones tombstone
    set claim_token=p_claim_token,claimed_at=now()
    from stale where tombstone.hash=stale.hash;
  get diagnostics v_reclaimed=row_count;
  for v_artifact in
    select ref.* from private.artifact_refs ref
    where ref.created_at<now()-p_older_than
      and not exists(select 1 from private.course_revisions revision
        where revision.artifact_hash=ref.hash)
      and not exists(select 1 from public.courses course
        where course.revision_artifact_hash=ref.hash)
      and not exists(select 1 from private.catalog_review_submissions submission
        where submission.artifact_hash=ref.hash)
      and not exists(select 1 from private.authoring_experiment_base_revisions base
        where base.artifact_hash=ref.hash)
      and not exists(select 1
        from private.authoring_experiment_variant_revisions variant
        where variant.initial_artifact_hash=ref.hash
          or variant.final_artifact_hash=ref.hash)
      and not exists(select 1
        from private.authoring_experiment_difference_runs run
        where run.baseline_artifact_hash=ref.hash
          or run.variant_artifact_hash=ref.hash)
      and not exists(select 1 from private.authoring_experiment_variant_freezes frozen
        where frozen.artifact_hash=ref.hash)
    order by ref.created_at for update skip locked
    limit greatest(p_limit-v_reclaimed,0)
  loop
    insert into private.artifact_gc_tombstones(
      hash,bucket,object_key,artifact_type,media_type,size_bytes,claim_token
    ) values(
      v_artifact.hash,v_artifact.bucket,v_artifact.object_key,
      v_artifact.artifact_type,v_artifact.media_type,v_artifact.size_bytes,
      p_claim_token
    ) on conflict(hash) do nothing;
    delete from private.artifact_refs ref where ref.hash=v_artifact.hash;
  end loop;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'hash',tombstone.hash,'bucket',tombstone.bucket,
    'objectKey',tombstone.object_key,'sizeBytes',tombstone.size_bytes
  ) order by tombstone.claimed_at,tombstone.hash)
  from private.artifact_gc_tombstones tombstone
  where tombstone.claim_token=p_claim_token),'[]'::jsonb);
end;
$function$;

create function private.authoring_experiment_only_actor_anonymization_v1(
  p_old jsonb,
  p_new jsonb
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $function$
declare
  v_field text;
  v_fields constant text[] := array[
    'created_by', 'updated_by', 'validated_by', 'classified_by',
    'decided_by', 'requested_by', 'frozen_by', 'assigned_by', 'authority_actor_id',
    'authority_ref'
  ];
begin
  if (p_new - v_fields) is distinct from (p_old - v_fields) then
    return false;
  end if;
  foreach v_field in array v_fields loop
    if p_new->v_field is distinct from p_old->v_field
       and not (
         coalesce(p_old->v_field, 'null'::jsonb) <> 'null'::jsonb
         and coalesce(p_new->v_field, 'null'::jsonb) = 'null'::jsonb
       ) then
      return false;
    end if;
  end loop;
  return p_new is distinct from p_old;
end;
$function$;

create function private.reject_authoring_experiment_history_update_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, private
as $function$
begin
  if private.authoring_experiment_only_actor_anonymization_v1(
    to_jsonb(old), to_jsonb(new)
  ) then
    return new;
  end if;
  raise exception 'O histórico do experimento é imutável.' using errcode = '55000';
end;
$function$;

create function private.guard_authoring_experiment_variant_revision_update_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, private
as $function$
begin
  if private.authoring_experiment_only_actor_anonymization_v1(
    to_jsonb(old), to_jsonb(new)
  ) then
    return new;
  end if;
  if exists (
    select 1
    from private.authoring_experiment_variant_freezes frozen
    where frozen.variant_revision_id = old.id
  ) then
    if old.status='frozen' and new.status='invalidated'
       and (to_jsonb(new)-'status')=(to_jsonb(old)-'status')
       and exists (
         select 1
         from private.authoring_experiment_lock_write_tokens token
         where token.transaction_id=txid_current()
           and token.variant_revision_id=old.id
           and token.child_workspace_id=old.child_workspace_id
       ) then
      return new;
    end if;
    raise exception 'VariantRevision congelada é imutável.' using errcode = '55000';
  end if;
  if not exists (
    select 1
    from private.authoring_experiment_lock_write_tokens token
    where token.transaction_id = txid_current()
      and token.variant_revision_id = old.id
      and token.child_workspace_id = old.child_workspace_id
  ) then
    raise exception 'VariantRevision só pode mudar pelo control plane.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

create trigger authoring_experiment_variant_revision_update_v1
before update on private.authoring_experiment_variant_revisions
for each row execute function
  private.guard_authoring_experiment_variant_revision_update_v1();

do $immutable_experiment_history$
declare
  v_table text;
begin
  foreach v_table in array array[
    'authoring_research_consent_policy_definitions',
    'authoring_research_instrument_definitions',
    'authoring_experiment_protocol_revisions',
    'authoring_experiment_factors',
    'authoring_experiment_factor_targets',
    'authoring_experiment_factor_levels',
    'authoring_experiment_conditions',
    'authoring_experiment_condition_levels',
    'authoring_experiment_condition_resource_sets',
    'authoring_experiment_invariants',
    'authoring_experiment_instruments',
    'authoring_experiment_base_revisions',
    'authoring_experiment_base_microsequences',
    'authoring_experiment_base_invariants',
    'authoring_experiment_variant_parameter_locks',
    'authoring_experiment_variant_allowed_resource_sets',
    'authoring_experiment_variant_microsequences',
    'authoring_experiment_difference_runs',
    'authoring_experiment_difference_hunks',
    'authoring_experiment_difference_pages',
    'authoring_experiment_diff_classifications',
    'authoring_experiment_difference_decisions',
    'authoring_experiment_variant_freezes',
    'authoring_experiment_requests',
    'authoring_experiment_participant_requests'
  ] loop
    execute format(
      'create trigger %I before update on private.%I for each row execute function private.reject_authoring_experiment_history_update_v1()',
      v_table || '_immutable_v1', v_table
    );
  end loop;
end;
$immutable_experiment_history$;

create trigger authoring_experiment_variant_corrections_immutable_v1
before update or delete on private.authoring_experiment_variant_corrections
for each row execute function
  private.reject_authoring_experiment_history_update_v1();

create function private.reject_authoring_experiment_assignment_update_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, private
as $function$
begin
  if private.authoring_experiment_only_actor_anonymization_v1(
    to_jsonb(old), to_jsonb(new)
  ) then
    return new;
  end if;
  if old.selection_id is not null
     and new.selection_id is null
     and (to_jsonb(new) - 'selection_id') is not distinct from
       (to_jsonb(old) - 'selection_id') then
    return new;
  end if;
  raise exception 'O assignment experimental é imutável.' using errcode = '55000';
end;
$function$;

create trigger authoring_experiment_assignments_immutable_v1
before update on private.authoring_experiment_assignments
for each row execute function
  private.reject_authoring_experiment_assignment_update_v1();

create function private.guard_authoring_research_lock_write_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_old jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  v_workspace_id uuid := coalesce(
    nullif(v_new->>'workspace_id', '')::uuid,
    nullif(v_old->>'workspace_id', '')::uuid
  );
  v_assignment_id text := coalesce(
    nullif(v_new->>'assignment_id', ''), nullif(v_old->>'assignment_id', '')
  );
  v_authority_ref text := coalesce(
    nullif(v_new->>'authority_ref', ''), nullif(v_old->>'authority_ref', '')
  );
begin
  -- A anonimização referencial não altera autoridade nem conteúdo do lock.
  -- Ela precisa atravessar este guard pela mesma exceção estreita aceita pelo
  -- trigger de imutabilidade de #106; caso contrário ON DELETE SET NULL torna
  -- impossível excluir a conta de quem materializou a variante.
  if tg_op = 'UPDATE'
     and (
       coalesce(
         v_old->'created_by' <> 'null'::jsonb
         and v_new->'created_by' = 'null'::jsonb,
         false
       )
       or coalesce(
         v_old->'authority_actor_id' <> 'null'::jsonb
         and v_new->'authority_actor_id' = 'null'::jsonb,
         false
       )
     )
     and (
       v_new->'created_by' is not distinct from v_old->'created_by'
       or (
         v_old->'created_by' <> 'null'::jsonb
         and v_new->'created_by' = 'null'::jsonb
       )
     )
     and (
       v_new->'authority_actor_id' is not distinct from
         v_old->'authority_actor_id'
       or (
         v_old->'authority_actor_id' <> 'null'::jsonb
         and v_new->'authority_actor_id' = 'null'::jsonb
       )
     )
     and (
       v_new->'authority_ref' is not distinct from v_old->'authority_ref'
       or (
         v_old->>'authority_kind' = 'author'
         and v_old->'authority_actor_id' <> 'null'::jsonb
         and v_new->'authority_actor_id' = 'null'::jsonb
         and v_new->'authority_ref' = 'null'::jsonb
       )
     )
     and (
       v_new - array['created_by', 'authority_actor_id', 'authority_ref']
     ) is not distinct from (
       v_old - array['created_by', 'authority_actor_id', 'authority_ref']
     ) then
    return new;
  end if;
  if (
       v_new->>'mode' = 'research_lock'
       or v_old->>'mode' = 'research_lock'
       or v_new->>'authority_kind' = 'research_protocol'
       or v_old->>'authority_kind' = 'research_protocol'
     )
     and not exists (
       select 1
       from private.authoring_experiment_lock_write_tokens token
       join private.authoring_experiment_variant_parameter_locks variant_lock
         on variant_lock.variant_revision_id=token.variant_revision_id
        and variant_lock.assignment_id=token.assignment_id
        and variant_lock.authority_ref=token.authority_ref
       where token.transaction_id = txid_current()
         and token.child_workspace_id = v_workspace_id
         and token.assignment_id = v_assignment_id
         and token.authority_ref = v_authority_ref
     ) then
    raise exception 'research_lock só pode ser criado, alterado ou removido pelo control plane experimental.'
      using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

create trigger authoring_research_lock_control_plane_v1
before insert or update or delete on private.authoring_design_parameter_assignments
for each row execute function private.guard_authoring_research_lock_write_v1();

create function private.preserve_authoring_experiment_resource_set_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  if exists (
    select 1
    from private.authoring_experiment_condition_resource_sets reference
    where reference.workspace_id = old.workspace_id
      and reference.resource_set_id = old.resource_set_id
      and reference.resource_set_version = old.resource_set_version
  ) then
    raise exception 'ResourceSet é referenciado por um protocolo experimental.'
      using errcode = '23503';
  end if;
  return old;
end;
$function$;

create trigger preserve_authoring_experiment_resource_set_v1
before delete on private.authoring_resource_sets
for each row execute function
  private.preserve_authoring_experiment_resource_set_v1();

create function private.authoring_experiment_json_resource_refs_v1(p_value jsonb)
returns table(package_id text, package_version text)
language sql
immutable
set search_path = pg_catalog
as $function$
  with recursive nodes(value) as (
    select p_value
    union all
    select child.value
    from nodes parent
    cross join lateral (
      select object_value.value
      from jsonb_each(
        case when jsonb_typeof(parent.value) = 'object'
          then parent.value else '{}'::jsonb end
      ) object_value
      union all
      select array_value.value
      from jsonb_array_elements(
        case when jsonb_typeof(parent.value) = 'array'
          then parent.value else '[]'::jsonb end
      ) array_value
    ) child
  )
  select distinct
    coalesce(value->>'packageId', value->>'package'),
    value->>'version'
  from nodes
  where jsonb_typeof(value) = 'object'
    and coalesce(value->>'packageId', value->>'package', '')
      ~ '^aralearn[.](resource|response)[.]'
$function$;

create function private.guard_authoring_experiment_child_entity_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_workspace_id uuid := case when tg_op = 'DELETE'
    then old.workspace_id else new.workspace_id end;
  v_content jsonb := case when tg_op = 'DELETE' then null else new.content end;
  v_variant_revision_id uuid;
  v_protocol_revision integer;
  v_condition_id text;
  v_entity_path text[];
  v_ref record;
begin
  select revision.id, variant.protocol_revision, variant.condition_id
  into v_variant_revision_id, v_protocol_revision, v_condition_id
  from private.authoring_experiment_variant_revisions revision
  join private.authoring_experiment_variants variant on variant.id = revision.variant_id
  where revision.child_workspace_id = v_workspace_id;
  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if exists (
    select 1 from private.authoring_experiment_variant_freezes frozen
    where frozen.variant_revision_id = v_variant_revision_id
  ) then
    raise exception 'O workspace de uma variante congelada é imutável.'
      using errcode = '55000';
  end if;
  if tg_op <> 'DELETE' and new.entity_type = 'card' then
    v_entity_path := private.authoring_design_scope_path_v1(
      v_workspace_id, 'microsequence', new.parent_id
    );
    if v_entity_path is null then
      raise exception 'Card experimental aponta para microsequência inexistente.'
        using errcode = '23503';
    end if;
    for v_ref in
      select * from private.authoring_experiment_json_resource_refs_v1(v_content)
    loop
      if v_ref.package_version is null
         or v_ref.package_version !~
           '^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)$'
         or not exists (
           select 1
           from private.authoring_experiment_variant_allowed_resource_sets allowed_set
           join private.authoring_resource_set_members member
             on member.workspace_id = allowed_set.workspace_id
            and member.resource_set_id = allowed_set.resource_set_id
            and member.resource_set_version = allowed_set.resource_set_version
           where allowed_set.variant_revision_id = v_variant_revision_id
             and cardinality(v_entity_path) >= cardinality(allowed_set.scope_path)
             and v_entity_path[1:cardinality(allowed_set.scope_path)] =
               allowed_set.scope_path
             and member.package_id = v_ref.package_id
             and member.package_version = v_ref.package_version
         ) then
        raise exception 'Package fora do ResourceSet exato da condição: %@%.',
          v_ref.package_id, coalesce(v_ref.package_version, '?')
          using errcode = '23514';
      end if;
    end loop;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

create trigger authoring_experiment_child_entity_guard_v1
before insert or update or delete on private.authoring_workspace_entities
for each row execute function
  private.guard_authoring_experiment_child_entity_v1();

create function private.guard_authoring_experiment_child_row_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_workspace_id uuid := coalesce(
    nullif(v_new->>'workspace_id', '')::uuid,
    nullif(v_old->>'workspace_id', '')::uuid
  );
begin
  if exists (
    select 1
    from private.authoring_experiment_variant_revisions revision
    join private.authoring_experiment_variant_freezes frozen
      on frozen.variant_revision_id = revision.id
    where revision.child_workspace_id = v_workspace_id
  ) then
    if tg_op = 'UPDATE'
       and private.authoring_experiment_only_actor_anonymization_v1(
         v_old, v_new
       ) then
      return new;
    end if;
    raise exception 'O workspace de uma variante congelada é imutável.'
      using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

do $guard_experiment_child_tables$
declare
  v_table text;
begin
  foreach v_table in array array[
    'authoring_workspace_publications',
    'authoring_instructional_analyses',
    'authoring_design_parameter_assignments',
    'authoring_resource_sets',
    'authoring_resource_set_members',
    'authoring_effective_design_snapshots',
    'authoring_effective_design_snapshot_values',
    'authoring_effective_design_snapshot_resource_sets',
    'authoring_pedagogical_blueprints',
    'authoring_pedagogical_blueprint_bindings',
    'authoring_microsequence_design_bindings',
    'authoring_materialization_states',
    'authoring_materialization_manifests',
    'authoring_manifest_resource_selections',
    'authoring_manifest_materialized_resources',
    'authoring_manifest_coverage',
    'authoring_manifest_metrics'
  ] loop
    execute format(
      'create trigger %I before insert or update or delete on private.%I for each row execute function private.guard_authoring_experiment_child_row_v1()',
      v_table || '_experiment_child_guard_v1', v_table
    );
  end loop;
end;
$guard_experiment_child_tables$;

create function private.guard_frozen_experiment_course_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_course_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  if exists (
    select 1
    from private.authoring_experiment_variant_revisions revision
    join private.authoring_experiment_variant_freezes frozen
      on frozen.variant_revision_id = revision.id
    where revision.publication_course_id = v_course_id
  ) then
    if tg_op = 'UPDATE'
       and old.owner_id is not null
       and new.owner_id is null
       and (to_jsonb(new) - 'owner_id') is not distinct from
         (to_jsonb(old) - 'owner_id') then
      return new;
    end if;
    raise exception 'O curso de uma variante congelada é imutável.'
      using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

create trigger frozen_experiment_course_guard_v1
before update or delete on public.courses
for each row execute function private.guard_frozen_experiment_course_v1();

-- Um owner nulo significa catálogo somente para cursos comuns. Variantes
-- anonimizadas continuam privadas: o descritor do objeto imutável só pode ser
-- obtido pelo owner ainda existente ou por uma seleção participante viva.
create or replace function public.get_course_revision_artifact_v4(
  p_actor_id uuid,
  p_course_id uuid,
  p_revision_hash text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $function$
declare
  v_course public.courses%rowtype;
begin
  perform private.require_service_role();
  if p_actor_id is null or not exists (
    select 1 from auth.users account where account.id = p_actor_id
  ) then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  select * into v_course from public.courses course
  where course.id = p_course_id;
  if not found then return null; end if;
  if v_course.experiment_variant or v_course.experiment_base then
    if not (
      coalesce(v_course.owner_id = p_actor_id, false)
      or (v_course.experiment_variant and exists (
        select 1
        from public.user_course_selections selection
        where selection.course_id = v_course.id
          and selection.user_id = p_actor_id
      ))
      or (v_course.experiment_variant and exists (
        select 1
        from private.authoring_experiment_variant_revisions revision
        where revision.publication_course_id = v_course.id
          and private.educational_workspace_can_v1(
            revision.child_workspace_id, p_actor_id, 'research'
          )
      ))
      or (v_course.experiment_base and exists (
        select 1
        from private.authoring_experiment_base_revisions base
        join private.authoring_experiments experiment
          on experiment.id=base.experiment_id
        where base.publication_course_id=v_course.id
          and private.educational_workspace_can_v1(
            experiment.workspace_id,p_actor_id,'research'
          )
      ))
    ) then
      raise exception 'Revisão experimental não autorizada.'
        using errcode = '42501';
    end if;
  elsif not (
    v_course.owner_id is null or v_course.owner_id = p_actor_id
  ) then
    raise exception 'Revisão não autorizada.' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'courseId', v_course.id,
      'revisionHash', revision.revision_hash,
      'hash', artifact.hash,
      'bucket', artifact.bucket,
      'objectKey', artifact.object_key,
      'artifactType', artifact.artifact_type,
      'mediaType', artifact.media_type,
      'sizeBytes', artifact.size_bytes
    )
    from private.course_revisions revision
    join private.artifact_refs artifact on artifact.hash = revision.artifact_hash
    where revision.course_id = v_course.id
      and revision.revision_hash = p_revision_hash
      and revision.validation_status = 'validated'
      and revision.published_at is not null
  );
end;
$function$;

revoke all on function public.get_course_revision_artifact_v4(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.get_course_revision_artifact_v4(uuid,uuid,text)
  to service_role;

create or replace function public.get_course_document_artifact_v4(
  p_owner_id uuid,
  p_course_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_course public.courses%rowtype;
  v_result jsonb;
begin
  perform private.require_workspace_actor_v5(p_owner_id, 'authoring:read');
  select * into v_course
  from public.courses course
  where course.id = p_course_id
    and course.deleted_at is null
    and course.document_storage_enabled
    and course.current_revision_hash is not null
    and course.revision_artifact_hash is not null;
  if not found then
    raise exception 'Curso inacessível ou sem documento.' using errcode = 'P0002';
  end if;
  if v_course.experiment_variant or v_course.experiment_base then
    if not (
      coalesce(v_course.owner_id = p_owner_id, false)
      or (v_course.experiment_variant and (
        v_course.status = 'published'
        and exists (
          select 1 from public.user_course_selections selection
          where selection.user_id = p_owner_id
            and selection.course_id = v_course.id
        )
      ))
      or (v_course.experiment_variant and exists (
        select 1
        from private.authoring_experiment_variant_revisions revision
        where revision.publication_course_id = v_course.id
          and private.educational_workspace_can_v1(
            revision.child_workspace_id, p_owner_id, 'research'
          )
      ))
      or (v_course.experiment_base and exists (
        select 1
        from private.authoring_experiment_base_revisions base
        join private.authoring_experiments experiment
          on experiment.id=base.experiment_id
        where base.publication_course_id=v_course.id
          and private.educational_workspace_can_v1(
            experiment.workspace_id,p_owner_id,'research'
          )
      ))
    ) then
      raise exception 'Documento experimental não autorizado.'
        using errcode = '42501';
    end if;
  elsif not (
    v_course.owner_id = p_owner_id
    or (
      v_course.status = 'published'
      and exists (
        select 1 from public.user_course_selections selection
        where selection.user_id = p_owner_id
          and selection.course_id = v_course.id
      )
    )
    or (
      v_course.owner_id is null
      and (
        private.can_review_catalog_v5(p_owner_id)
        or private.can_publish_catalog_v5(p_owner_id)
      )
    )
  ) then
    raise exception 'Documento do curso não autorizado.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'courseId', v_course.id,
    'contractKey', v_course.contract_key,
    'title', v_course.title,
    'goal', v_course.goal,
    'completionState', v_course.completion_state,
    'revisionHash', v_course.current_revision_hash,
    'artifact', jsonb_build_object(
      'hash', artifact.hash,
      'bucket', artifact.bucket,
      'objectKey', artifact.object_key,
      'artifactType', artifact.artifact_type,
      'mediaType', artifact.media_type,
      'sizeBytes', artifact.size_bytes
    )
  ) into v_result
  from private.artifact_refs artifact
  where artifact.hash = v_course.revision_artifact_hash;
  if v_result is null then
    raise exception 'Documento corrente do curso indisponível.'
      using errcode = 'P0002';
  end if;
  return v_result;
end;
$function$;

revoke all on function public.get_course_document_artifact_v4(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.get_course_document_artifact_v4(uuid,uuid)
  to service_role;

-- Projeções canônicas derivam `research` no servidor. O wrapper preserva toda
-- a composição vigente de #105/#106 sem duplicá-la nesta migration.
alter function public.get_authoring_workspace_v5(uuid,uuid,text[],boolean)
  rename to get_authoring_workspace_before_experiments_v1;

create function public.get_authoring_workspace_v5(
  p_owner_id uuid,
  p_workspace_id uuid,
  p_course_ids text[] default null,
  p_include_card_content boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_result jsonb;
begin
  v_result := public.get_authoring_workspace_before_experiments_v1(
    p_owner_id, p_workspace_id, p_course_ids, p_include_card_content
  );
  return v_result || jsonb_build_object(
    'capabilities', coalesce(v_result->'capabilities', '{}'::jsonb)
      || jsonb_build_object(
        'research', private.educational_workspace_can_v1(
          p_workspace_id, p_owner_id, 'research'
        )
      )
  );
end;
$function$;

alter function private.educational_workspace_details_v1(uuid,uuid)
  rename to educational_workspace_details_before_experiments_v1;

create function private.educational_workspace_details_v1(
  p_actor_id uuid,
  p_workspace_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_result jsonb;
begin
  v_result := private.educational_workspace_details_before_experiments_v1(
    p_actor_id, p_workspace_id
  );
  return v_result || jsonb_build_object(
    'capabilities', coalesce(v_result->'capabilities', '{}'::jsonb)
      || jsonb_build_object(
        'research', private.educational_workspace_can_v1(
          p_workspace_id, p_actor_id, 'research'
        )
      )
  );
end;
$function$;

revoke all on function public.get_authoring_workspace_v5(
  uuid,uuid,text[],boolean
) from public, anon, authenticated;
grant execute on function public.get_authoring_workspace_v5(
  uuid,uuid,text[],boolean
) to service_role;

-- Children são detalhes internos do experimento: não entram na listagem de
-- workspaces nem na projeção de Trilhas. A seleção do participante continua
-- aparecendo normalmente pelo ramo `selected_items`.
do $hide_authoring_experiment_children$
declare
  v_signature regprocedure;
  v_definition text;
  v_rewritten text;
begin
  v_signature := to_regprocedure(
    'public.list_authoring_workspaces_v5(uuid,integer,timestamptz,uuid)'
  );
  if v_signature is not null then
    select pg_get_functiondef(v_signature) into v_definition;
    v_rewritten := regexp_replace(
      v_definition,
      'workspace[.]deleted_at IS NULL',
      'workspace.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM private.authoring_experiment_variant_revisions experiment_child WHERE experiment_child.child_workspace_id = workspace.id)',
      'i'
    );
    if v_rewritten = v_definition then
      raise exception 'Não foi possível ocultar children da listagem de workspaces.'
        using errcode = '55000';
    end if;
    execute v_rewritten;
  end if;

  v_signature := to_regprocedure(
    'private.list_trail_items_for_actor_v1(uuid,integer,uuid)'
  );
  if v_signature is not null then
    select pg_get_functiondef(v_signature) into v_definition;
    v_rewritten := regexp_replace(
      v_definition,
      'workspace[.]deleted_at IS NULL',
      'workspace.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM private.authoring_experiment_variant_revisions experiment_child WHERE experiment_child.child_workspace_id = workspace.id)',
      'i'
    );
    if v_rewritten = v_definition then
      raise exception 'Não foi possível ocultar children de Trilhas.'
        using errcode = '55000';
    end if;
    v_definition := v_rewritten;
    v_rewritten := replace(
      v_definition,
      'case when course.owner_id is null then ''catalog'' else ''private'' end as course_origin',
      'case when course.experiment_variant or course.experiment_base then ''private'' when course.owner_id is null then ''catalog'' else ''private'' end as course_origin'
    );
    if v_rewritten = v_definition then
      raise exception 'Origem de curso experimental incompatível com Trilhas.'
        using errcode = '55000';
    end if;
    v_definition := v_rewritten;
    v_rewritten := replace(
      v_definition,
      'case when course.owner_id is null then private.can_publish_catalog_v5(v_user_id)
        else course.owner_id = v_user_id end as can_edit',
      'case when course.experiment_variant or course.experiment_base then false when course.owner_id is null then private.can_publish_catalog_v5(v_user_id) else course.owner_id = v_user_id end as can_edit'
    );
    if v_rewritten = v_definition then
      raise exception 'Permissão de edição experimental incompatível com Trilhas.'
        using errcode = '55000';
    end if;
    v_definition := v_rewritten;
    v_rewritten := replace(
      v_definition,
      'case when course.owner_id is null then private.can_publish_catalog_v5(v_user_id)
        else course.owner_id = v_user_id end as can_delete',
      'case when course.experiment_variant or course.experiment_base then false when course.owner_id is null then private.can_publish_catalog_v5(v_user_id) else course.owner_id = v_user_id end as can_delete'
    );
    if v_rewritten = v_definition then
      raise exception 'Permissão de remoção experimental incompatível com Trilhas.'
        using errcode = '55000';
    end if;
    v_definition := v_rewritten;
    v_rewritten := replace(
      v_definition,
      'true as can_remove,',
      'not exists (select 1 from private.authoring_experiment_assignments experiment_assignment where experiment_assignment.selection_id = selection.id) as can_remove,'
    );
    if v_rewritten = v_definition then
      raise exception 'Retirada de seleção experimental incompatível com Trilhas.'
        using errcode = '55000';
    end if;
    execute v_rewritten;
  end if;
end;
$hide_authoring_experiment_children$;

-- Toda entrada pública do control plane é chamada apenas pela Edge Function
-- com service_role. Participantes continuam autenticados no app, mas sua
-- identidade é resolvida e passada explicitamente pela mesma fronteira.
do $authoring_experiment_rpc_privileges$
declare
  v_function regprocedure;
begin
  for v_function in
    select routine.oid::regprocedure
    from pg_proc routine
    join pg_namespace namespace on namespace.oid=routine.pronamespace
    where namespace.nspname='public'
      and routine.proname = any(array[
        'prepare_authoring_experiment_variant_evidence_v1',
        'get_authoring_experiment_variant_evidence_progress_v1',
        'register_authoring_experiment_variant_evidence_v1',
        'record_authoring_experiment_diff_classification_v1',
        'manage_authoring_experiment_v1',
        'assign_authoring_experiment_participant_v1',
        'manage_authoring_experiment_enrollment_v1',
        'list_authoring_experiments_v1',
        'list_authoring_experiment_options_v1',
        'get_authoring_experiment_v1',
        'get_authoring_experiment_context_v1'
      ])
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated',v_function
    );
    execute format('grant execute on function %s to service_role',v_function);
  end loop;
end;
$authoring_experiment_rpc_privileges$;

commit;
