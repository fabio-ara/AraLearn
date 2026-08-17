-- O Curso passa a ser a identidade viva compartilhada por Autoria e Estudo.
-- O UUID lógico já consolidado em trail_items é preservado; as tabelas
-- anteriores permanecem isoladas apenas para auditoria e remoção em #130.

begin;

set local lock_timeout = '15s';
set local statement_timeout = '10min';

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-course-identity-cutover-v1', 0
));

do $require_course_cutover_dependencies$
begin
  if to_regclass('public.courses') is null
     or to_regclass('private.authoring_workspaces') is null
     or to_regclass('private.authoring_workspace_entities') is null
     or to_regclass('private.trail_items') is null
     or to_regclass('private.trail_item_courses') is null
     or to_regclass('public.trail_personal_states') is null
     or to_regclass('private.app_role_assignments') is null
     or to_regclass('private.educational_workspace_members') is null
     or to_regclass('public.user_course_selections') is null
     or to_regclass('private.authoring_workspace_events') is null
     or to_regclass('private.authoring_workspace_requests') is null
     or to_regclass('private.authoring_workspace_publications') is null
     or to_regclass('private.catalog_review_submissions') is null
     or to_regprocedure('auth.uid()') is null
     or to_regprocedure('private.require_service_role()') is null
     or to_regprocedure('extensions.digest(bytea,text)') is null
     or to_regprocedure('extensions.gen_random_uuid()') is null then
    raise exception 'Dependências do corte de identidade de Curso ausentes.'
      using errcode = '55000';
  end if;
  if to_regclass('private.course_entities') is not null
     or to_regclass('public.course_access') is not null
     or to_regclass('public.course_personal_states') is not null then
    raise exception 'O modelo vivo de Curso já existe parcialmente.'
      using errcode = '55000';
  end if;
end;
$require_course_cutover_dependencies$;

-- Congela a origem antes de calcular o mapa e de confrontá-la com a staging.
-- A espera pela trava deixa qualquer writer anterior terminar; depois disso,
-- nenhum writer antigo pode confirmar uma revisão que o corte não tenha lido.
do $lock_course_cutover_source$
declare
  relation_value record;
begin
  for relation_value in
    select namespace_value.nspname, class_value.relname
    from pg_class class_value
    join pg_namespace namespace_value
      on namespace_value.oid = class_value.relnamespace
    where namespace_value.nspname in ('public', 'private')
      and class_value.relkind in ('r', 'p')
    order by namespace_value.nspname, class_value.relname
  loop
    execute format(
      'lock table %I.%I in access exclusive mode',
      relation_value.nspname,
      relation_value.relname
    );
  end loop;
end;
$lock_course_cutover_source$;

create temporary table course_identity_cutover_map_v1 (
  course_id uuid primary key,
  workspace_id uuid,
  workspace_course_id text,
  legacy_publication_course_id uuid,
  source_kind text not null,
  constraint course_identity_cutover_map_source_v1 check(source_kind in (
    'root_only', 'root_and_publication', 'publication_only'
  ))
) on commit drop;

insert into course_identity_cutover_map_v1(
  course_id, workspace_id, workspace_course_id,
  legacy_publication_course_id, source_kind
)
select
  item.id,
  item.workspace_id,
  item.workspace_course_id,
  item.course_id,
  case
    when item.workspace_id is not null and item.course_id is null
      then 'root_only'
    when item.workspace_id is not null and item.course_id is not null
      then 'root_and_publication'
    else 'publication_only'
  end
from private.trail_items item;

-- O corte hospedado conhecido possui quatro raízes sem publicação, duas raízes
-- com publicação e duas publicações sem raiz relacional. Banco vazio continua
-- sendo um caso válido para bootstrap/teste; qualquer outra topologia aborta.
do $validate_course_cutover_topology$
declare
  v_total integer;
  v_root_only integer;
  v_root_and_publication integer;
  v_publication_only integer;
  v_product_owner_count integer;
begin
  select
    count(*)::integer,
    count(*) filter(where source_kind = 'root_only')::integer,
    count(*) filter(where source_kind = 'root_and_publication')::integer,
    count(*) filter(where source_kind = 'publication_only')::integer
  into v_total, v_root_only, v_root_and_publication, v_publication_only
  from course_identity_cutover_map_v1;

  if v_total = 0 then return; end if;
  if (v_total, v_root_only, v_root_and_publication, v_publication_only)
     is distinct from (8, 4, 2, 2) then
    raise exception
      'Topologia inesperada no corte de Curso: total %, raízes %, combinados %, somente publicação %.',
      v_total, v_root_only, v_root_and_publication, v_publication_only
      using errcode = '55000';
  end if;

  if exists(
    select 1
    from course_identity_cutover_map_v1 mapping
    left join private.authoring_workspaces workspace
      on workspace.id = mapping.workspace_id
     and workspace.deleted_at is null
    left join private.authoring_workspace_entities root
      on root.workspace_id = mapping.workspace_id
     and root.entity_type = 'course'
     and root.entity_id = mapping.workspace_course_id
    where mapping.source_kind <> 'publication_only'
      and (
        workspace.id is null
        or workspace.owner_id is null
        or root.workspace_id is null
        or nullif(btrim(coalesce(root.content->>'title', workspace.title)), '') is null
      )
  ) then
    raise exception 'Raiz viva, owner ou título ausente no corte de Curso.'
      using errcode = '55000';
  end if;

  if exists(
    select 1
    from course_identity_cutover_map_v1 mapping
    left join public.courses publication
      on publication.id = mapping.legacy_publication_course_id
    where mapping.legacy_publication_course_id is not null
      and (
        publication.id is null
        or publication.status <> 'published'
        or publication.deleted_at is not null
        or not publication.document_storage_enabled
        or publication.current_revision_hash is null
        or publication.current_revision_hash !~ '^[0-9a-f]{64}$'
      )
  ) then
    raise exception 'Publicação viva ausente no corte de Curso.'
      using errcode = '55000';
  end if;

  select count(*)::integer into v_product_owner_count
  from private.app_role_assignments assignment
  where assignment.role = 'owner' and assignment.active;
  if v_publication_only > 0 and v_product_owner_count <> 1 then
    raise exception
      'Cursos sem raiz exigem exatamente um owner ativo de produto; encontrados %.',
      v_product_owner_count
      using errcode = '55000';
  end if;
end;
$validate_course_cutover_topology$;

-- O vocabulário histórico existe apenas neste mapa TEMP. Cada evento recebe
-- uma operação ampla do Curso e um tipo de mudança canônico que conserva a
-- distinção analítica observada, sem expor os nomes substituídos no runtime.
create temporary table course_event_cutover_map_v1 (
  source_operation text primary key,
  target_operation text not null,
  change_kind text not null unique,
  expected_count integer not null,
  constraint course_event_cutover_target_v1 check(target_operation in (
    'create_course', 'update_course_metadata', 'replace_course_composition'
  )),
  constraint course_event_cutover_count_v1 check(expected_count > 0)
) on commit drop;

insert into course_event_cutover_map_v1(
  source_operation, target_operation, change_kind, expected_count
) values
  ('create', 'create_course', 'course_initialized', 6),
  ('create_structure', 'replace_course_composition',
    'didactic_structure_materialized', 4),
  ('replace_catalog_document', 'replace_course_composition',
    'course_composition_replaced', 4),
  ('save_card', 'replace_course_composition', 'study_unit_updated', 1),
  ('save_microsequence_cards', 'replace_course_composition',
    'didactic_microsequence_study_units_updated', 16),
  ('update_brief', 'update_course_metadata',
    'authoring_guidance_updated', 4),
  ('update_metadata', 'update_course_metadata', 'course_metadata_updated', 1);

-- The hosted cutover is intentionally exact: current events remain analytics
-- authority after rekeying, while expired receipts, withdrawn reviews and
-- deleted workspaces are export-only evidence for removal with the legacy
-- graph in #130. An empty database remains a valid local bootstrap.
do $validate_course_cutover_disposition$
declare
  v_course_count integer;
  v_event_count integer;
  v_request_count integer;
  v_active_request_count integer;
  v_deleted_request_count integer;
  v_review_count integer;
  v_withdrawn_review_count integer;
  v_tombstone_count integer;
  v_member_count integer;
  v_publication_count integer;
begin
  select count(*)::integer into v_course_count
  from course_identity_cutover_map_v1;
  select count(*)::integer into v_event_count
  from private.authoring_workspace_events;
  select
    count(*)::integer,
    count(*) filter(where workspace.deleted_at is null)::integer,
    count(*) filter(where workspace.deleted_at is not null
      and request_value.operation = 'delete_workspace')::integer
  into v_request_count, v_active_request_count, v_deleted_request_count
  from private.authoring_workspace_requests request_value
  join private.authoring_workspaces workspace
    on workspace.id = request_value.workspace_id;
  select
    count(*)::integer,
    count(*) filter(where review.status = 'withdrawn')::integer
  into v_review_count, v_withdrawn_review_count
  from private.catalog_review_submissions review;
  select count(*)::integer into v_tombstone_count
  from private.authoring_workspaces workspace
  where workspace.deleted_at is not null;
  select count(*)::integer into v_member_count
  from private.educational_workspace_members;
  select count(*)::integer into v_publication_count
  from private.authoring_workspace_publications;
  if v_course_count = 0 then
    if (
      v_event_count, v_request_count, v_review_count, v_tombstone_count,
      v_member_count, v_publication_count
    ) is distinct from (0, 0, 0, 0, 0, 0) then
      raise exception 'Banco sem Cursos contém resíduos autorais não classificados.'
        using errcode = '55000';
    end if;
    return;
  end if;

  if (
    v_event_count,
    v_request_count,
    v_active_request_count,
    v_deleted_request_count,
    v_review_count,
    v_withdrawn_review_count,
    v_tombstone_count,
    v_member_count,
    v_publication_count
  ) is distinct from (36, 52, 43, 9, 2, 2, 10, 6, 2) then
    raise exception
      'Disposição legacy inesperada: eventos %, receipts % (% ativos/% tombstone), reviews % (% withdrawn), tombstones %, membros %, publicações %.',
      v_event_count, v_request_count, v_active_request_count,
      v_deleted_request_count, v_review_count, v_withdrawn_review_count,
      v_tombstone_count, v_member_count, v_publication_count
      using errcode = '55000';
  end if;
  if exists(
    select 1
    from course_event_cutover_map_v1 conversion
    left join private.authoring_workspace_events event_value
      on event_value.operation = conversion.source_operation
    group by conversion.source_operation, conversion.expected_count
    having count(event_value.id) <> conversion.expected_count
  ) or exists(
    select 1
    from private.authoring_workspace_events event_value
    left join course_event_cutover_map_v1 conversion
      on conversion.source_operation = event_value.operation
    where conversion.source_operation is null
  ) then
    raise exception 'Vocabulário ou distribuição de eventos legacy divergiu.'
      using errcode = '55000';
  end if;
  if exists(
    select 1
    from private.authoring_workspace_events event_value
    where jsonb_typeof(event_value.summary) is distinct from 'object'
      or not (event_value.summary ?& array[
        'created', 'updated', 'deleted'
      ])
      or exists(
        select 1
        from jsonb_object_keys(event_value.summary) field_name
        where field_name not in (
          'operation', 'created', 'updated', 'deleted',
          'workspaceId', 'catalog', 'publication'
        )
      )
      or (
        event_value.summary ? 'operation'
        and event_value.summary->>'operation' is distinct from event_value.operation
      )
      or (
        event_value.summary ? 'workspaceId'
        and event_value.summary->>'workspaceId'
          is distinct from event_value.workspace_id::text
      )
      or coalesce(event_value.summary->>'created', '') !~ '^[0-9]{1,9}$'
      or coalesce(event_value.summary->>'updated', '') !~ '^[0-9]{1,9}$'
      or coalesce(event_value.summary->>'deleted', '') !~ '^[0-9]{1,9}$'
  ) then
    raise exception 'Summary de evento legacy não pode ser convertido com segurança.'
      using errcode = '55000';
  end if;
  if exists(
    select 1
    from course_identity_cutover_map_v1 mapping
    join private.authoring_workspaces workspace
      on workspace.id = mapping.workspace_id
    left join private.educational_workspace_members member
      on member.workspace_id = workspace.id
    where mapping.source_kind <> 'publication_only'
    group by mapping.course_id, workspace.owner_id
    having count(member.user_id) <> 1
      or not bool_and(
        member.user_id = workspace.owner_id and member.role = 'owner'
      )
  ) then
    raise exception 'Membership legacy não corresponde exatamente ao owner do Curso.'
      using errcode = '55000';
  end if;
  if exists(
    select publication.workspace_id, publication.workspace_course_id,
      publication.course_id
    from private.authoring_workspace_publications publication
    left join course_identity_cutover_map_v1 mapping
      on mapping.workspace_id = publication.workspace_id
     and mapping.workspace_course_id = publication.workspace_course_id
     and mapping.legacy_publication_course_id = publication.course_id
    group by publication.workspace_id, publication.workspace_course_id,
      publication.course_id
    having count(mapping.course_id) <> 1
  ) then
    raise exception 'Publicação de workspace sem Curso canônico unívoco.'
      using errcode = '55000';
  end if;
  if exists(
    select 1
    from private.authoring_workspace_requests request_value
    join private.authoring_workspaces workspace
      on workspace.id = request_value.workspace_id
    where workspace.deleted_at is not null
      and request_value.operation <> 'delete_workspace'
  ) then
    raise exception 'Receipt de tombstone possui operação inesperada.'
      using errcode = '55000';
  end if;
  if exists(
    select event_value.id
    from private.authoring_workspace_events event_value
    left join course_identity_cutover_map_v1 mapping
      on mapping.workspace_id = event_value.workspace_id
     and mapping.source_kind <> 'publication_only'
    group by event_value.id
    having count(mapping.course_id) <> 1
  ) then
    raise exception 'Evento autoral sem Curso canônico unívoco.'
      using errcode = '55000';
  end if;
  if exists(
    select 1
    from private.authoring_workspace_events event_value
    join course_identity_cutover_map_v1 mapping
      on mapping.workspace_id = event_value.workspace_id
     and mapping.source_kind <> 'publication_only'
    join private.authoring_workspaces workspace
      on workspace.id = mapping.workspace_id
    where event_value.revision > workspace.revision
  ) then
    raise exception 'Evento autoral excede a revisão corrente do Curso.'
      using errcode = '55000';
  end if;
end;
$validate_course_cutover_disposition$;

-- Experimental state cannot be attached to a Course without its own explicit
-- conversion contract. The hosted preflight found all 33 relations empty, so
-- any row (or missing expected relation) is drift and aborts the cutover.
do $reject_unconverted_course_experiment_state$
declare
  v_relation_name text;
  v_relation regclass;
  v_count bigint;
begin
  foreach v_relation_name in array array[
    'private.authoring_experiments',
    'private.authoring_experiment_protocol_revisions',
    'private.authoring_experiment_factors',
    'private.authoring_experiment_factor_targets',
    'private.authoring_experiment_factor_levels',
    'private.authoring_experiment_conditions',
    'private.authoring_experiment_condition_levels',
    'private.authoring_experiment_condition_resource_sets',
    'private.authoring_experiment_invariants',
    'private.authoring_experiment_instruments',
    'private.authoring_experiment_base_revisions',
    'private.authoring_experiment_base_microsequences',
    'private.authoring_experiment_base_invariants',
    'private.authoring_experiment_variants',
    'private.authoring_experiment_variant_revisions',
    'private.authoring_experiment_variant_parameter_locks',
    'private.authoring_experiment_variant_allowed_resource_sets',
    'private.authoring_experiment_variant_microsequences',
    'private.authoring_experiment_difference_runs',
    'private.authoring_experiment_difference_hunks',
    'private.authoring_experiment_difference_pages',
    'private.authoring_experiment_diff_classifications',
    'private.authoring_experiment_difference_decisions',
    'private.authoring_experiment_variant_corrections',
    'private.authoring_experiment_variant_freezes',
    'private.authoring_experiment_enrollment_codes',
    'private.authoring_experiment_enrollments',
    'private.authoring_experiment_assignments',
    'private.authoring_experiment_requests',
    'private.authoring_experiment_participant_requests',
    'private.authoring_experiment_lock_write_tokens',
    'private.authoring_experiment_selection_write_tokens',
    'private.authoring_experiment_outcome_observations'
  ]::text[] loop
    v_relation := to_regclass(v_relation_name);
    if v_relation is null then
      raise exception 'Relação experimental esperada ausente: %.', v_relation_name
        using errcode = '55000';
    end if;
    execute format('select count(*) from %s', v_relation) into v_count;
    if v_count <> 0 then
      raise exception 'Estado experimental sem conversor em %: % linhas.',
        v_relation_name, v_count using errcode = '55000';
    end if;
  end loop;
end;
$reject_unconverted_course_experiment_state$;

-- Catch any other private table directly scoped by an active workspace. Only
-- the five explicitly converted/retired sources and trail identity may carry
-- rows into this cutover.
do $reject_unclassified_workspace_scoped_state$
declare
  v_relation record;
  v_has_rows boolean;
begin
  for v_relation in
    select namespace_value.nspname as schema_name,
      relation_value.relname as relation_name
    from pg_class relation_value
    join pg_namespace namespace_value
      on namespace_value.oid = relation_value.relnamespace
    join pg_attribute attribute_value
      on attribute_value.attrelid = relation_value.oid
     and attribute_value.attname = 'workspace_id'
     and attribute_value.attnum > 0
     and not attribute_value.attisdropped
    where namespace_value.nspname = 'private'
      and relation_value.relkind in ('r', 'p')
      and relation_value.relname not in (
        'authoring_workspace_entities',
        'authoring_workspace_events',
        'authoring_workspace_requests',
        'authoring_workspace_publications',
        'educational_workspace_members',
        'trail_items'
      )
  loop
    execute format(
      'select exists(select 1 from %I.%I scoped '
      || 'join pg_temp.course_identity_cutover_map_v1 mapping '
      || 'on mapping.workspace_id = scoped.workspace_id)',
      v_relation.schema_name, v_relation.relation_name
    ) into v_has_rows;
    if v_has_rows then
      raise exception 'Estado workspace-scoped sem conversor em %.%.',
        v_relation.schema_name, v_relation.relation_name
        using errcode = '55000';
    end if;
  end loop;
end;
$reject_unclassified_workspace_scoped_state$;

-- For a non-empty hosted cutover the importer must create and fill this TEMP
-- table in the same database session before running the migration. It is the
-- sole entity source for all eight Courses: L3/L5 require semantic conversion,
-- and the two root/publication overlaps require prior comparison. The table is
-- validated here and dropped before commit; no partial product state survives.
do $require_course_content_import_staging$
declare
  v_course_count integer;
  v_stage regclass;
  v_columns jsonb;
begin
  select count(*)::integer into v_course_count
  from course_identity_cutover_map_v1;
  v_stage := to_regclass('pg_temp.course_content_import_v1');
  if v_stage is null and v_course_count = 0 then
    execute $ddl$
      create temporary table course_content_import_v1(
        course_id uuid not null,
        source_kind text not null,
        workspace_id uuid,
        workspace_revision bigint,
        legacy_course_id uuid,
        legacy_revision_hash text,
        manifest_hash text not null,
        course_title text not null,
        course_goal text not null,
        entity_type text not null,
        entity_id text not null,
        parent_type text,
        parent_id text,
        position integer not null,
        entity_version bigint not null,
        entity_created_at timestamptz not null,
        entity_updated_at timestamptz not null,
        content jsonb not null
      )
    $ddl$;
    v_stage := to_regclass('pg_temp.course_content_import_v1');
  elsif v_stage is null then
    raise exception
      'Cutover hospedado exige staging TEMP course_content_import_v1 na mesma sessão.'
      using errcode = '55000';
  end if;

  select jsonb_object_agg(
    attribute_value.attname,
    format_type(attribute_value.atttypid, attribute_value.atttypmod)
  ) into v_columns
  from pg_attribute attribute_value
  where attribute_value.attrelid = v_stage
    and attribute_value.attnum > 0
    and not attribute_value.attisdropped;
  if v_columns is distinct from jsonb_build_object(
    'course_id', 'uuid',
    'source_kind', 'text',
    'workspace_id', 'uuid',
    'workspace_revision', 'bigint',
    'legacy_course_id', 'uuid',
    'legacy_revision_hash', 'text',
    'manifest_hash', 'text',
    'course_title', 'text',
    'course_goal', 'text',
    'entity_type', 'text',
    'entity_id', 'text',
    'parent_type', 'text',
    'parent_id', 'text',
    'position', 'integer',
    'entity_version', 'bigint',
    'entity_created_at', 'timestamp with time zone',
    'entity_updated_at', 'timestamp with time zone',
    'content', 'jsonb'
  ) then
    raise exception 'Schema da staging TEMP de conteúdo é incompatível.'
      using errcode = '55000';
  end if;
end;
$require_course_content_import_staging$;

do $validate_course_content_import_staging$
begin
  if exists(
    select 1
    from pg_temp.course_content_import_v1 staged
    left join course_identity_cutover_map_v1 mapping
      on mapping.course_id = staged.course_id
    left join private.authoring_workspaces workspace
      on workspace.id = mapping.workspace_id
    left join public.courses publication
      on publication.id = mapping.legacy_publication_course_id
    where mapping.course_id is null
      or staged.source_kind is distinct from mapping.source_kind
      or staged.workspace_id is distinct from mapping.workspace_id
      or staged.workspace_revision is distinct from case
        when mapping.workspace_id is null then null else workspace.revision
      end
      or staged.legacy_course_id is distinct from
        mapping.legacy_publication_course_id
      or staged.legacy_revision_hash is distinct from
        case when mapping.legacy_publication_course_id is null then null
          else publication.current_revision_hash end
      or staged.manifest_hash !~ '^[0-9a-f]{64}$'
      or nullif(btrim(staged.course_title), '') is null
      or staged.course_title <> btrim(staged.course_title)
      or char_length(staged.course_title) > 300
      or nullif(btrim(staged.course_goal), '') is null
      or staged.course_goal <> btrim(staged.course_goal)
      or char_length(staged.course_goal) > 2000
      or staged.entity_version < 1
      or staged.entity_created_at > staged.entity_updated_at
      or (
        mapping.source_kind <> 'publication_only'
        and not exists(
          select 1
          from private.authoring_workspace_entities source_entity
          where source_entity.workspace_id = mapping.workspace_id
            and source_entity.entity_type = staged.entity_type
            and source_entity.entity_id = staged.entity_id
            and source_entity.version = staged.entity_version
            and source_entity.created_at = staged.entity_created_at
            and source_entity.updated_at = staged.entity_updated_at
        )
      )
      or (
        mapping.source_kind = 'publication_only'
        and (
          staged.entity_version <> 1
          or staged.entity_created_at is distinct from publication.created_at
          or staged.entity_updated_at is distinct from publication.updated_at
        )
      )
  ) or exists(
    select 1
    from course_identity_cutover_map_v1 mapping
    where not exists(
        select 1 from pg_temp.course_content_import_v1 staged
        where staged.course_id = mapping.course_id
      )
  ) then
    raise exception 'Staging não cobre exatamente os 8 Cursos e seus manifestos.'
      using errcode = '55000';
  end if;

  if exists(
    select 1
    from pg_temp.course_content_import_v1 staged
    where staged.course_id is null
      or staged.source_kind is null
      or staged.manifest_hash is null
      or staged.course_title is null
      or staged.course_goal is null
      or staged.entity_type is null
      or staged.entity_type not in (
        'module', 'lesson', 'topic', 'microsequence', 'card'
      )
      or staged.position is null
      or nullif(btrim(staged.entity_id), '') is null
      or staged.entity_id <> btrim(staged.entity_id)
      or char_length(staged.entity_id) > 240
      or staged.entity_id ~ '[[:cntrl:]]'
      or (staged.parent_id is not null and (
        nullif(btrim(staged.parent_id), '') is null
        or staged.parent_id <> btrim(staged.parent_id)
        or char_length(staged.parent_id) > 240
        or staged.parent_id ~ '[[:cntrl:]]'
      ))
      or not (
        (staged.entity_type = 'module'
          and staged.parent_type is null and staged.parent_id is null)
        or (staged.entity_type = 'lesson'
          and staged.parent_type = 'module' and staged.parent_id is not null)
        or (staged.entity_type = 'topic'
          and staged.parent_type = 'lesson' and staged.parent_id is not null)
        or (staged.entity_type = 'microsequence'
          and staged.parent_type = 'lesson' and staged.parent_id is not null)
        or (staged.entity_type = 'card'
          and staged.parent_type = 'microsequence' and staged.parent_id is not null)
      )
      or (
        staged.entity_type = 'card' and staged.position <= 0
        or staged.entity_type <> 'card' and staged.position < 0
      )
      or jsonb_typeof(staged.content) is distinct from 'object'
      or staged.content ? 'id'
      or staged.content ? 'position'
      or (staged.entity_type = 'module' and staged.content ? 'lessons')
      or (staged.entity_type = 'lesson' and (
        staged.content ? 'topics' or staged.content ? 'microsequences'
      ))
      or (staged.entity_type = 'microsequence' and staged.content ? 'cards')
      or pg_column_size(staged.content) > 1048576
  ) or exists(
    select 1
    from pg_temp.course_content_import_v1 staged
    group by staged.course_id, staged.entity_type, staged.entity_id
    having count(*) > 1
  ) or exists(
    select 1
    from pg_temp.course_content_import_v1 staged
    group by staged.course_id
    having count(distinct staged.manifest_hash) <> 1
      or count(distinct staged.course_title) <> 1
      or count(distinct staged.course_goal) <> 1
  ) or exists(
    select 1
    from course_identity_cutover_map_v1 mapping
    join pg_temp.course_content_import_v1 staged
      on staged.course_id = mapping.course_id
    left join private.authoring_workspaces workspace
      on workspace.id = mapping.workspace_id
    left join private.authoring_workspace_entities root
      on root.workspace_id = mapping.workspace_id
     and root.entity_type = 'course'
     and root.entity_id = mapping.workspace_course_id
    left join public.courses publication
      on publication.id = mapping.legacy_publication_course_id
    where staged.course_title is distinct from case
        when mapping.source_kind = 'publication_only'
          then nullif(btrim(publication.title), '')
        else coalesce(
          nullif(btrim(root.content->>'title'), ''),
          nullif(btrim(workspace.title), '')
        )
      end
      or staged.course_goal is distinct from case
        when mapping.source_kind = 'publication_only'
          then nullif(btrim(publication.goal), '')
        else coalesce(
          nullif(btrim(root.content->>'goal'), ''),
          nullif(btrim(workspace.purpose), '')
        )
      end
  ) or exists(
    select 1
    from pg_temp.course_content_import_v1 staged
    group by staged.course_id, staged.parent_type, staged.parent_id,
      staged.entity_type, staged.position
    having count(*) > 1
  ) or exists(
    select 1
    from pg_temp.course_content_import_v1 staged
    where staged.parent_type is not null
      and not exists(
        select 1
        from pg_temp.course_content_import_v1 parent
        where parent.course_id = staged.course_id
          and parent.entity_type = staged.parent_type
          and parent.entity_id = staged.parent_id
      )
  ) or exists(
    select 1
    from pg_temp.course_content_import_v1 staged
    where staged.entity_type <> 'card'
    group by staged.course_id, staged.parent_type, staged.parent_id,
      staged.entity_type
    having min(staged.position) <> 0
      or max(staged.position) <> count(*) - 1
      or count(distinct staged.position) <> count(*)
  ) or exists(
    select 1
    from course_identity_cutover_map_v1 mapping
    where (
        not exists(
          select 1 from pg_temp.course_content_import_v1 staged
          where staged.course_id = mapping.course_id
            and staged.entity_type = 'module'
        )
        or not exists(
          select 1 from pg_temp.course_content_import_v1 staged
          where staged.course_id = mapping.course_id
            and staged.entity_type = 'card'
        )
      )
  ) then
    raise exception 'Estrutura convertida da staging TEMP é inválida.'
      using errcode = '55000';
  end if;
end;
$validate_course_content_import_staging$;

-- The retired experiment layer installed two triggers on auth.users. That
-- relation belongs to supabase_auth_admin, so PostgreSQL correctly refuses an
-- ALTER TABLE issued by the migration role. The trigger functions themselves
-- belong to the project migration role; dropping them with CASCADE removes the
-- two dependent triggers atomically without changing ownership or retaining a
-- no-op compatibility hook.
drop function if exists private.anonymize_owned_experiment_courses_v1() cascade;
drop function if exists
  private.cleanup_authoring_experiment_selection_tokens_v1() cascade;

-- Capture every callable or trigger routine tied to the retired graph before
-- renaming its relations. PL/pgSQL bodies are stored as source text, so relying
-- only on post-rename dependency rendering could let an old `public.courses`
-- reference bind accidentally to the new live table.
create temporary table isolated_legacy_course_functions_v1 (
  function_oid oid primary key
) on commit drop;

insert into isolated_legacy_course_functions_v1(function_oid)
select procedure_value.oid
from pg_proc procedure_value
join pg_namespace namespace_value
  on namespace_value.oid = procedure_value.pronamespace
where namespace_value.nspname in ('public', 'private')
  and procedure_value.prokind = 'f'
  and (
    procedure_value.proname like '%trail%'
    or procedure_value.proname like '%authoring%'
    or procedure_value.proname like '%workspace%'
    or procedure_value.proname like '%course%'
    or pg_get_functiondef(procedure_value.oid) ilike '%public.courses%'
    or pg_get_functiondef(procedure_value.oid)
      ilike '%private.authoring_workspaces%'
    or pg_get_functiondef(procedure_value.oid)
      ilike '%private.authoring_workspace_entities%'
    or pg_get_functiondef(procedure_value.oid) ilike '%private.trail_items%'
    or pg_get_functiondef(procedure_value.oid)
      ilike '%private.trail_item_courses%'
    or pg_get_functiondef(procedure_value.oid)
      ilike '%public.trail_personal_states%'
    or exists(
      select 1
      from pg_depend dependency
      where dependency.classid = 'pg_proc'::regclass
        and dependency.objid = procedure_value.oid
        and dependency.refclassid = 'pg_class'::regclass
        and dependency.refobjid in (
          'public.courses'::regclass,
          'private.authoring_workspaces'::regclass,
          'private.authoring_workspace_entities'::regclass,
          'private.trail_items'::regclass,
          'private.trail_item_courses'::regclass,
          'public.trail_personal_states'::regclass
        )
    )
    or exists(
      select 1
      from pg_trigger trigger_value
      where not trigger_value.tgisinternal
        and trigger_value.tgfoid = procedure_value.oid
        and trigger_value.tgrelid in (
          'public.courses'::regclass,
          'private.authoring_workspaces'::regclass,
          'private.authoring_workspace_entities'::regclass,
          'private.trail_items'::regclass,
          'private.trail_item_courses'::regclass,
          'public.trail_personal_states'::regclass
        )
    )
  );

-- Libera o nome e o índice da PK antes de criar o objeto vivo. Dependências
-- físicas continuam apontando para as tabelas legacy, nunca para a nova tabela.
do $rename_legacy_courses_primary_key$
declare
  v_primary_key name;
begin
  select constraint_value.conname into v_primary_key
  from pg_constraint constraint_value
  where constraint_value.conrelid = 'public.courses'::regclass
    and constraint_value.contype = 'p';
  if v_primary_key is not null then
    execute format(
      'alter table public.courses rename constraint %I to legacy_catalog_courses_pkey',
      v_primary_key
    );
  end if;
end;
$rename_legacy_courses_primary_key$;

alter table public.courses rename to legacy_catalog_courses;
alter table private.authoring_workspaces rename to legacy_authoring_workspaces;
alter table private.authoring_workspace_entities
  rename to legacy_authoring_workspace_entities;
alter table private.trail_items rename to legacy_trail_items;
alter table private.trail_item_courses rename to legacy_trail_item_courses;
alter table public.trail_personal_states rename to legacy_trail_personal_states;

-- The retained rows are audit-only. User triggers on the six legacy relations
-- and triggers elsewhere that call captured legacy routines are disabled; FK
-- constraint triggers remain intact through the transactional rekey.
alter table public.legacy_catalog_courses disable trigger user;
alter table private.legacy_authoring_workspaces disable trigger user;
alter table private.legacy_authoring_workspace_entities disable trigger user;
alter table private.legacy_trail_items disable trigger user;
alter table private.legacy_trail_item_courses disable trigger user;
alter table public.legacy_trail_personal_states disable trigger user;

do $disable_external_legacy_course_triggers$
declare
  v_trigger record;
begin
  for v_trigger in
    select
      namespace_value.nspname as schema_name,
      relation_value.relname as relation_name,
      trigger_value.tgname as trigger_name
    from pg_trigger trigger_value
    join pg_class relation_value on relation_value.oid = trigger_value.tgrelid
    join pg_namespace namespace_value
      on namespace_value.oid = relation_value.relnamespace
    join isolated_legacy_course_functions_v1 legacy_function
      on legacy_function.function_oid = trigger_value.tgfoid
    where not trigger_value.tgisinternal
  loop
    execute format(
      'alter table %I.%I disable trigger %I',
      v_trigger.schema_name, v_trigger.relation_name, v_trigger.trigger_name
    );
  end loop;
end;
$disable_external_legacy_course_triggers$;

comment on table public.legacy_catalog_courses is
  'Isolada pelo corte #117/#118; sem consumidor novo e destinada a remoção em #130.';
comment on table private.legacy_authoring_workspaces is
  'Isolada pelo corte #117/#118; sem consumidor novo e destinada a remoção em #130.';
comment on table private.legacy_authoring_workspace_entities is
  'Isolada pelo corte #117/#118; sem consumidor novo e destinada a remoção em #130.';
comment on table private.legacy_trail_items is
  'Isolada pelo corte #117/#118; sem consumidor novo e destinada a remoção em #130.';
comment on table private.legacy_trail_item_courses is
  'Mapa de aliases retirado pelo corte #117/#118; destinado a remoção em #130.';
comment on table public.legacy_trail_personal_states is
  'Isolada pelo corte #117/#118; sem consumidor novo e destinada a remoção em #130.';
comment on table private.authoring_workspace_events is
  'Fonte já rekeyada em private.course_events; cópia legacy apenas para export/drop em #130.';
comment on table private.authoring_workspace_requests is
  'Receipts do protocolo anterior; export-only e destinados a remoção em #130.';
comment on table private.authoring_workspace_publications is
  'Bindings já absorvidos pelo Curso/staging; export-only e destinados a remoção em #130.';
comment on table private.educational_workspace_members is
  'Memberships owner-only já absorvidos por courses.owner_id; destinados a remoção em #130.';
comment on table private.catalog_review_submissions is
  'Revisões withdrawn do catálogo anterior; export-only e destinadas a remoção em #130.';
comment on table public.user_course_selections is
  'Seleções do modelo anterior não constituem grants; export-only e destinadas a remoção em #130.';

alter table private.authoring_workspace_events disable trigger user;
alter table private.authoring_workspace_requests disable trigger user;
alter table private.authoring_workspace_publications disable trigger user;
alter table private.educational_workspace_members disable trigger user;
alter table private.catalog_review_submissions disable trigger user;
alter table public.user_course_selections disable trigger user;

revoke all on table public.legacy_catalog_courses
  from public, anon, authenticated, service_role;
revoke all on table private.legacy_authoring_workspaces
  from public, anon, authenticated, service_role;
revoke all on table private.legacy_authoring_workspace_entities
  from public, anon, authenticated, service_role;
revoke all on table private.legacy_trail_items
  from public, anon, authenticated, service_role;
revoke all on table private.legacy_trail_item_courses
  from public, anon, authenticated, service_role;
revoke all on table public.legacy_trail_personal_states
  from public, anon, authenticated, service_role;
revoke all on table private.authoring_workspace_events
  from public, anon, authenticated, service_role;
revoke all on table private.authoring_workspace_requests
  from public, anon, authenticated, service_role;
revoke all on table private.authoring_workspace_publications
  from public, anon, authenticated, service_role;
revoke all on table private.educational_workspace_members
  from public, anon, authenticated, service_role;
revoke all on table private.catalog_review_submissions
  from public, anon, authenticated, service_role;
revoke all on table public.user_course_selections
  from public, anon, authenticated, service_role;

do $isolate_legacy_course_views$
declare
  v_view record;
begin
  for v_view in
    select distinct
      namespace_value.nspname as schema_name,
      relation_value.relname as relation_name,
      relation_value.relkind
    from pg_depend dependency
    join pg_rewrite rewrite_value on rewrite_value.oid = dependency.objid
    join pg_class relation_value on relation_value.oid = rewrite_value.ev_class
    join pg_namespace namespace_value
      on namespace_value.oid = relation_value.relnamespace
    where dependency.classid = 'pg_rewrite'::regclass
      and dependency.refclassid = 'pg_class'::regclass
      and relation_value.relkind in ('v', 'm')
      and dependency.refobjid in (
        'public.legacy_catalog_courses'::regclass,
        'private.legacy_authoring_workspaces'::regclass,
        'private.legacy_authoring_workspace_entities'::regclass,
        'private.legacy_trail_items'::regclass,
        'private.legacy_trail_item_courses'::regclass,
        'public.legacy_trail_personal_states'::regclass,
        'private.authoring_workspace_events'::regclass,
        'private.authoring_workspace_requests'::regclass,
        'private.authoring_workspace_publications'::regclass,
        'private.educational_workspace_members'::regclass,
        'private.catalog_review_submissions'::regclass,
        'public.user_course_selections'::regclass
      )
  loop
    execute format(
      'revoke all on table %I.%I from public, anon, authenticated, service_role',
      v_view.schema_name, v_view.relation_name
    );
    execute format(
      'comment on %s %I.%I is %L',
      case v_view.relkind when 'm' then 'materialized view' else 'view' end,
      v_view.schema_name,
      v_view.relation_name,
      'Projeção legacy sem autoridade; substituir por dados canônicos de Curso.'
    );
  end loop;
end;
$isolate_legacy_course_views$;

-- Funções antigas ficam sem EXECUTE mesmo quando a dependência física foi
-- preservada pelo rename. Não há view, alias, fallback ou dupla leitura.
do $isolate_legacy_course_functions$
declare
  v_function record;
begin
  for v_function in
    select legacy_function.function_oid::regprocedure as signature
    from isolated_legacy_course_functions_v1 legacy_function
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      v_function.signature
    );
  end loop;
end;
$isolate_legacy_course_functions$;

create table public.courses (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  goal text not null,
  brief text not null default '',
  revision bigint not null default 1,
  authoring_state jsonb not null default
    '{"version":1,"parts":[],"decisions":[],"mandate":null}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courses_title_v1 check(
    nullif(btrim(title), '') is not null and char_length(title) <= 300
  ),
  constraint courses_goal_v1 check(
    nullif(btrim(goal), '') is not null and char_length(goal) <= 2000
  ),
  constraint courses_brief_v1 check(char_length(brief) <= 16384),
  constraint courses_revision_v1 check(revision > 0),
  constraint courses_authoring_state_v1 check(
    jsonb_typeof(authoring_state) = 'object'
    and authoring_state ?& array['version', 'parts', 'decisions', 'mandate']
    and authoring_state - 'version' - 'parts' - 'decisions' - 'mandate'
      = '{}'::jsonb
    and authoring_state->'version' = '1'::jsonb
    and jsonb_typeof(authoring_state->'parts') = 'array'
    and jsonb_array_length(authoring_state->'parts') <= 64
    and jsonb_typeof(authoring_state->'decisions') = 'array'
    and jsonb_array_length(authoring_state->'decisions') <= 512
    and (
      authoring_state->'mandate' = 'null'::jsonb
      or jsonb_typeof(authoring_state->'mandate') = 'object'
    )
    and pg_column_size(authoring_state) <= 1048576
  )
);

create index courses_owner_updated_v1_idx
  on public.courses(owner_id, updated_at desc, id desc);
create index courses_updated_v1_idx
  on public.courses(updated_at desc, id desc);

create table private.course_entities (
  course_id uuid not null references public.courses(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  parent_type text,
  parent_id text,
  position integer not null,
  content jsonb not null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(course_id, entity_type, entity_id),
  constraint course_entities_type_v1 check(entity_type in (
    'module', 'lesson', 'topic', 'microsequence', 'card'
  )),
  constraint course_entities_parent_v1 check(
    (entity_type = 'module' and parent_type is null and parent_id is null)
    or (entity_type = 'lesson' and parent_type = 'module' and parent_id is not null)
    or (entity_type = 'topic' and parent_type = 'lesson' and parent_id is not null)
    or (
      entity_type = 'microsequence'
      and parent_type = 'lesson'
      and parent_id is not null
    )
    or (
      entity_type = 'card'
      and parent_type = 'microsequence'
      and parent_id is not null
    )
  ),
  constraint course_entities_identity_v1 check(
    nullif(btrim(entity_id), '') is not null
    and entity_id = btrim(entity_id)
    and char_length(entity_id) <= 240
    and entity_id !~ '[[:cntrl:]]'
    and (
      parent_id is null
      or (
        nullif(btrim(parent_id), '') is not null
        and parent_id = btrim(parent_id)
        and char_length(parent_id) <= 240
        and parent_id !~ '[[:cntrl:]]'
      )
    )
  ),
  constraint course_entities_position_v1 check(
    (entity_type = 'card' and position > 0)
    or (entity_type <> 'card' and position >= 0)
  ),
  constraint course_entities_content_v1 check(
    jsonb_typeof(content) = 'object'
    and not (content ? 'id')
    and not (content ? 'position')
    and not (entity_type = 'module' and content ? 'lessons')
    and not (
      entity_type = 'lesson'
      and (content ? 'topics' or content ? 'microsequences')
    )
    and not (entity_type = 'microsequence' and content ? 'cards')
    and pg_column_size(content) <= 1048576
  ),
  constraint course_entities_version_v1 check(version > 0),
  constraint course_entities_sibling_position_v1 unique nulls not distinct(
    course_id, parent_type, parent_id, entity_type, position
  ) deferrable initially deferred,
  constraint course_entities_parent_fk_v1 foreign key(
    course_id, parent_type, parent_id
  ) references private.course_entities(
    course_id, entity_type, entity_id
  ) on delete cascade deferrable initially deferred
);

create index course_entities_parent_v1_idx on private.course_entities(
  course_id, parent_type, parent_id, entity_type, position, entity_id
);

create table public.course_access (
  course_id uuid not null references public.courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  granted_by uuid not null references auth.users(id) on delete restrict,
  granted_at timestamptz not null default now(),
  primary key(course_id, user_id)
);

create index course_access_user_v1_idx
  on public.course_access(user_id, course_id);

-- Events are the one historical append-only surface with a demonstrated
-- analytics consumer. Their global bigint identity and per-Course revision are
-- preserved; new writes continue in the same canonical stream.
create table private.course_events (
  id bigint generated by default as identity primary key,
  course_id uuid not null references public.courses(id) on delete cascade,
  revision bigint not null,
  operation text not null,
  summary jsonb not null,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(course_id, revision),
  constraint course_events_revision_v1 check(revision > 0),
  constraint course_events_operation_v1 check(
    operation in (
      'create_course',
      'update_course_metadata',
      'replace_course_composition'
    )
  ),
  constraint course_events_summary_v1 check(
    jsonb_typeof(summary) = 'object'
    and pg_column_size(summary) <= 32768
    and not (summary ?| array[
      'operation', 'workspaceId', 'workspace_id', 'catalog', 'publication'
    ])
  )
);

create index course_events_recent_v1_idx
  on private.course_events(course_id, created_at desc, id desc);
create index course_events_analytics_v1_idx
  on private.course_events(operation, created_at desc, id desc);

revoke all on table private.course_entities
  from public, anon, authenticated, service_role;
revoke all on table private.course_events
  from public, anon, authenticated, service_role;
revoke all on table public.courses
  from public, anon, authenticated, service_role;
revoke all on table public.course_access
  from public, anon, authenticated, service_role;

-- C1-C6: a raiz viva é a autoridade de owner e metadados; project/course não
-- são entidades do modelo final.
insert into public.courses(
  id, owner_id, title, goal, brief, revision, authoring_state,
  created_at, updated_at
)
select
  mapping.course_id,
  workspace.owner_id,
  staged_header.course_title,
  staged_header.course_goal,
  workspace.brief,
  workspace.revision,
  workspace.authoring_state,
  least(workspace.created_at, root.created_at),
  greatest(workspace.updated_at, root.updated_at)
from course_identity_cutover_map_v1 mapping
join private.legacy_authoring_workspaces workspace
  on workspace.id = mapping.workspace_id
join private.legacy_authoring_workspace_entities root
  on root.workspace_id = mapping.workspace_id
 and root.entity_type = 'course'
 and root.entity_id = mapping.workspace_course_id
join (
  select staged.course_id,
    min(staged.course_title) as course_title,
    min(staged.course_goal) as course_goal
  from pg_temp.course_content_import_v1 staged
  group by staged.course_id
) staged_header on staged_header.course_id = mapping.course_id
where mapping.source_kind <> 'publication_only';

-- C7-C8: somente o cabeçalho é criado. O owner não é inferido por e-mail nem
-- pelo owner histórico da publicação: exige exatamente um owner de produto.
insert into public.courses(
  id, owner_id, title, goal, brief, revision, authoring_state,
  created_at, updated_at
)
select
  mapping.course_id,
  product_owner.user_id,
  staged_header.course_title,
  staged_header.course_goal,
  '',
  1,
  '{"version":1,"parts":[],"decisions":[],"mandate":null}'::jsonb,
  publication.created_at,
  publication.updated_at
from course_identity_cutover_map_v1 mapping
join public.legacy_catalog_courses publication
  on publication.id = mapping.legacy_publication_course_id
join (
  select staged.course_id,
    min(staged.course_title) as course_title,
    min(staged.course_goal) as course_goal
  from pg_temp.course_content_import_v1 staged
  group by staged.course_id
) staged_header on staged_header.course_id = mapping.course_id
cross join lateral (
  select assignment.user_id
  from private.app_role_assignments assignment
  where assignment.role = 'owner' and assignment.active
) product_owner
where mapping.source_kind = 'publication_only';

insert into private.course_entities(
  course_id, entity_type, entity_id, parent_type, parent_id,
  position, content, version, created_at, updated_at
)
select
  staged.course_id,
  staged.entity_type,
  staged.entity_id,
  staged.parent_type,
  staged.parent_id,
  staged.position,
  staged.content,
  staged.entity_version,
  staged.entity_created_at,
  staged.entity_updated_at
from pg_temp.course_content_import_v1 staged
join public.courses course on course.id = staged.course_id;

-- Clear deferred self-FK trigger events before changing this table's RLS
-- properties later in the same migration transaction.
set constraints all immediate;

do $validate_migrated_course_structure$
begin
  if exists(
    select 1
    from private.course_entities entity
    where entity.entity_type <> 'card'
    group by entity.course_id, entity.parent_type, entity.parent_id,
      entity.entity_type
    having min(entity.position) <> 0
      or max(entity.position) <> count(*) - 1
      or count(distinct entity.position) <> count(*)
  ) then
    raise exception 'Estrutura migrada de Curso possui lacuna posicional.'
      using errcode = '55000';
  end if;
  if exists(
    select 1
    from pg_temp.course_content_import_v1 staged
    left join private.course_entities entity
      on entity.course_id = staged.course_id
     and entity.entity_type = staged.entity_type
     and entity.entity_id = staged.entity_id
    where entity.course_id is null
      or entity.version is distinct from staged.entity_version
      or entity.created_at is distinct from staged.entity_created_at
      or entity.updated_at is distinct from staged.entity_updated_at
  ) or exists(
    select 1
    from private.course_entities entity
    left join pg_temp.course_content_import_v1 staged
      on staged.course_id = entity.course_id
     and staged.entity_type = entity.entity_type
     and staged.entity_id = entity.entity_id
    where staged.course_id is null
  ) then
    raise exception 'Estado técnico das entidades divergiu da staging atestada.'
      using errcode = '55000';
  end if;
end;
$validate_migrated_course_structure$;

drop table pg_temp.course_content_import_v1;

-- Os seis memberships hospedados são somente a redundância do owner já
-- migrado. O preflight confirmou zero compartilhamentos reais, portanto o
-- corte não inventa grants a partir de seleção, membership ou papel legado.

insert into private.course_events(
  id, course_id, revision, operation, summary, actor_id, created_at
)
select
  event_value.id,
  mapping.course_id,
  event_value.revision,
  conversion.target_operation,
  jsonb_build_object(
    'changeKind', conversion.change_kind,
    'createdCount', (event_value.summary->>'created')::integer,
    'updatedCount', (event_value.summary->>'updated')::integer,
    'deletedCount', (event_value.summary->>'deleted')::integer
  ),
  event_value.actor_id,
  event_value.created_at
from private.authoring_workspace_events event_value
join course_identity_cutover_map_v1 mapping
  on mapping.workspace_id = event_value.workspace_id
 and mapping.source_kind <> 'publication_only'
join course_event_cutover_map_v1 conversion
  on conversion.source_operation = event_value.operation;

do $validate_migrated_course_events$
begin
  if (select count(*) from course_identity_cutover_map_v1) = 0 then
    if (select count(*) from private.course_events) <> 0 then
      raise exception 'Banco sem Cursos produziu eventos canônicos.'
        using errcode = '55000';
    end if;
    return;
  end if;
  if (select count(*) from private.course_events) <> 36
     or exists(
       select 1
       from private.authoring_workspace_events source_event
       join course_identity_cutover_map_v1 course_mapping
         on course_mapping.workspace_id = source_event.workspace_id
        and course_mapping.source_kind <> 'publication_only'
       join course_event_cutover_map_v1 conversion
         on conversion.source_operation = source_event.operation
       left join private.course_events target_event
         on target_event.id = source_event.id
       where target_event.id is null
         or target_event.course_id is distinct from course_mapping.course_id
         or target_event.revision is distinct from source_event.revision
         or target_event.operation is distinct from conversion.target_operation
         or target_event.summary->>'changeKind' is distinct from
           conversion.change_kind
         or (target_event.summary->>'createdCount')::integer is distinct from
           (source_event.summary->>'created')::integer
         or (target_event.summary->>'updatedCount')::integer is distinct from
           (source_event.summary->>'updated')::integer
         or (target_event.summary->>'deletedCount')::integer is distinct from
           (source_event.summary->>'deleted')::integer
         or target_event.summary
           - 'changeKind' - 'createdCount' - 'updatedCount' - 'deletedCount'
           <> '{}'::jsonb
         or target_event.actor_id is distinct from source_event.actor_id
         or target_event.created_at is distinct from source_event.created_at
     )
     or exists(
       select 1
       from course_event_cutover_map_v1 conversion
       left join private.course_events target_event
         on target_event.summary->>'changeKind' = conversion.change_kind
       group by conversion.change_kind, conversion.expected_count
       having count(target_event.id) <> conversion.expected_count
     )
     or exists(
       select 1
       from private.course_events target_event
       left join course_event_cutover_map_v1 conversion
         on conversion.change_kind = target_event.summary->>'changeKind'
       where conversion.change_kind is null
     ) then
    raise exception 'Eventos canônicos divergiram da distribuição atestada.'
      using errcode = '55000';
  end if;
end;
$validate_migrated_course_events$;

select setval(
  pg_get_serial_sequence('private.course_events', 'id'),
  coalesce((select max(event_value.id) + 1 from private.course_events event_value), 1),
  false
);

create function private.valid_course_personal_state_v1(p_state jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $function$
declare
  v_progress jsonb;
  v_lessons jsonb;
  v_reviews jsonb;
  v_observations jsonb;
  v_timestamp text;
begin
  if jsonb_typeof(p_state) is distinct from 'object'
     or octet_length(p_state::text) > 524288
     or p_state->>'version' is distinct from '1'
     or exists(
       select 1 from jsonb_object_keys(p_state) field
       where field not in ('version', 'progress', 'reviewMarks', 'observations')
     ) then return false; end if;
  v_progress := p_state->'progress';
  v_lessons := v_progress->'lessons';
  v_reviews := p_state->'reviewMarks';
  v_observations := p_state->'observations';
  if jsonb_typeof(v_progress) is distinct from 'object'
     or v_progress->>'version' is distinct from '3'
     or exists(
       select 1 from jsonb_object_keys(v_progress) field
       where field not in ('version', 'lessons')
     )
     or jsonb_typeof(v_lessons) is distinct from 'object'
     or jsonb_typeof(v_reviews) is distinct from 'object'
     or jsonb_typeof(v_observations) is distinct from 'object' then
    return false;
  end if;
  if (select count(*) from jsonb_object_keys(v_lessons)) > 10000
     or coalesce((
       select sum(jsonb_array_length(value->'completedStudyUnitIds'))
       from jsonb_each(v_lessons)
       where jsonb_typeof(value->'completedStudyUnitIds') = 'array'
     ), 0) > 100000
     or (select count(*) from jsonb_object_keys(v_reviews)) > 100000
     or (select count(*) from jsonb_object_keys(v_observations)) > 10000 then
    return false;
  end if;
  if exists(
    select 1 from jsonb_each(v_lessons) entry(key, value)
    where nullif(btrim(key), '') is null or char_length(key) > 240
      or key ~ '[[:cntrl:]]'
      or jsonb_typeof(value) <> 'object'
      or exists(
        select 1 from jsonb_object_keys(value) field
        where field not in ('cursorStudyUnitId', 'completedStudyUnitIds')
      )
      or not (value ?& array['cursorStudyUnitId', 'completedStudyUnitIds'])
      or jsonb_typeof(value->'completedStudyUnitIds') <> 'array'
      or jsonb_array_length(value->'completedStudyUnitIds') not between 1 and 10000
      or jsonb_typeof(value->'cursorStudyUnitId') <> 'string'
      or nullif(btrim(value->>'cursorStudyUnitId'), '') is null
      or char_length(value->>'cursorStudyUnitId') > 240
      or value->>'cursorStudyUnitId' ~ '[[:cntrl:]]'
      or not (value->'completedStudyUnitIds' ? (value->>'cursorStudyUnitId'))
      or exists(
        select 1 from jsonb_array_elements(value->'completedStudyUnitIds') study_unit_id
        where jsonb_typeof(study_unit_id) <> 'string'
          or nullif(btrim(study_unit_id #>> '{}'), '') is null
          or char_length(study_unit_id #>> '{}') > 240
          or study_unit_id #>> '{}' ~ '[[:cntrl:]]'
      )
      or (
        select count(*) <> count(distinct study_unit_id #>> '{}')
        from jsonb_array_elements(value->'completedStudyUnitIds') study_unit_id
      )
  ) then return false; end if;
  if exists(
    select 1
    from jsonb_each(v_lessons) lesson(path, value)
    cross join lateral jsonb_array_elements_text(
      lesson.value->'completedStudyUnitIds'
    ) study_unit(study_unit_id)
    group by study_unit.study_unit_id
    having count(*) > 1
  ) then return false; end if;
  if exists(
    select 1 from jsonb_each(v_reviews) entry(key, value)
    where nullif(btrim(key), '') is null or char_length(key) > 240
      or key ~ '[[:cntrl:]]'
      or jsonb_typeof(value) <> 'string'
      or value #>> '{}' !~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$'
  ) then return false; end if;
  if exists(
    select 1 from jsonb_each(v_observations) entry(key, value)
    where nullif(btrim(key), '') is null or char_length(key) > 240
      or key ~ '[[:cntrl:]]'
      or jsonb_typeof(value) <> 'object'
      or exists(
        select 1 from jsonb_object_keys(value) field
        where field not in ('category', 'body', 'updatedAt')
      )
      or not (value ?& array['category', 'body', 'updatedAt'])
      or jsonb_typeof(value->'category') <> 'string'
      or jsonb_typeof(value->'body') <> 'string'
      or jsonb_typeof(value->'updatedAt') <> 'string'
      or value->>'category' not in (
        'question', 'possible_error', 'confusing', 'suggestion', 'observation'
      )
      or nullif(btrim(value->>'body'), '') is null
      or char_length(value->>'body') > 1000
      or value->>'updatedAt' !~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$'
  ) then return false; end if;
  for v_timestamp in
    select value from jsonb_each_text(v_reviews)
    union all
    select value->>'updatedAt' from jsonb_each(v_observations)
  loop
    begin
      perform make_timestamp(
        substring(v_timestamp from 1 for 4)::integer,
        substring(v_timestamp from 6 for 2)::integer,
        substring(v_timestamp from 9 for 2)::integer,
        substring(v_timestamp from 12 for 2)::integer,
        substring(v_timestamp from 15 for 2)::integer,
        substring(v_timestamp from 18 for char_length(v_timestamp) - 18)::double precision
      );
    exception when others then
      return false;
    end;
  end loop;
  return true;
end;
$function$;

create table public.course_personal_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  revision bigint not null default 1,
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id, course_id),
  constraint course_personal_states_revision_v1 check(revision > 0),
  constraint course_personal_states_state_v1 check(
    private.valid_course_personal_state_v1(state)
  )
);

create index course_personal_states_user_updated_v1_idx
  on public.course_personal_states(user_id, updated_at desc, course_id);

create table private.course_personal_state_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  course_id uuid not null references public.courses(id) on delete cascade,
  request_hash text not null,
  result_revision bigint not null,
  result_updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  primary key(user_id, request_id),
  constraint course_personal_state_receipts_hash_v1 check(
    request_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint course_personal_state_receipts_revision_v1 check(
    result_revision > 0
  ),
  constraint course_personal_state_receipts_expiry_v1 check(
    expires_at > created_at and expires_at <= created_at + interval '7 days'
  )
);

create index course_personal_state_receipts_expiry_v1_idx
  on private.course_personal_state_receipts(expires_at);

-- Um único recibo pequeno atende criação e commits de metadados/entidades.
-- Não há ledger nem evento paralelo: o estado corrente e sua revisão bastam.
create table private.course_change_receipts (
  actor_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null,
  operation text not null,
  course_id uuid not null references public.courses(id) on delete cascade,
  request_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  primary key(actor_id, request_id),
  constraint course_change_receipts_request_v1 check(
    request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
  ),
  constraint course_change_receipts_operation_v1 check(operation in (
    'create', 'update_metadata', 'commit_entities'
  )),
  constraint course_change_receipts_hash_v1 check(
    request_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint course_change_receipts_result_v1 check(
    jsonb_typeof(result) = 'object' and pg_column_size(result) <= 65536
  ),
  constraint course_change_receipts_expiry_v1 check(
    expires_at > created_at and expires_at <= created_at + interval '14 days'
  )
);

create index course_change_receipts_expiry_v1_idx
  on private.course_change_receipts(expires_at);

revoke all on table public.course_personal_states
  from public, anon, authenticated, service_role;
revoke all on table private.course_personal_state_receipts
  from public, anon, authenticated, service_role;
revoke all on table private.course_change_receipts
  from public, anon, authenticated, service_role;
revoke all on function private.valid_course_personal_state_v1(jsonb)
  from public, anon, authenticated, service_role;

with converted_personal_state as materialized (
  select
    state_row.user_id,
    mapping.course_id,
    state_row.revision,
    jsonb_build_object(
      'version', 1,
      'progress', jsonb_build_object(
        'version', 3,
        'lessons', coalesce((
          select jsonb_object_agg(
            lesson.path,
            jsonb_build_object(
              'cursorStudyUnitId', coalesce(
                nullif(lesson.value->>'cursorCardId', ''),
                lesson.value->'completedCardIds'->>-1
              ),
              'completedStudyUnitIds', lesson.value->'completedCardIds'
            )
          )
          from jsonb_each(coalesce(
            state_row.state#>'{progress,lessons}', '{}'::jsonb
          )) lesson(path, value)
          where jsonb_typeof(lesson.value->'completedCardIds') = 'array'
            and jsonb_array_length(lesson.value->'completedCardIds') > 0
        ), '{}'::jsonb)
      ),
      'reviewMarks', coalesce(state_row.state->'reviewMarks', '{}'::jsonb),
      'observations', coalesce(state_row.state->'observations', '{}'::jsonb)
    ) as state,
    state_row.created_at,
    state_row.updated_at
  from public.legacy_trail_personal_states state_row
  join course_identity_cutover_map_v1 mapping
    on mapping.course_id = state_row.trail_item_id
)
insert into public.course_personal_states(
  user_id, course_id, revision, state, created_at, updated_at
)
select
  converted.user_id,
  converted.course_id,
  converted.revision,
  converted.state,
  converted.created_at,
  converted.updated_at
from converted_personal_state converted;

do $validate_migrated_personal_state_access$
begin
  if exists(
    select 1
    from public.course_personal_states personal
    join public.courses course on course.id = personal.course_id
    left join public.course_access access_value
      on access_value.course_id = personal.course_id
     and access_value.user_id = personal.user_id
    where personal.user_id <> course.owner_id
      and access_value.user_id is null
  ) then
    raise exception
      'Estado pessoal migrado pertence a pessoa sem acesso canônico ao Curso.'
      using errcode = '55000';
  end if;
end;
$validate_migrated_personal_state_access$;

create function private.course_ownership_v1(
  p_course_id uuid,
  p_actor_id uuid
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  select case
    when course.owner_id = p_actor_id then 'owned'
    else 'shared'
  end
  from public.courses course
  left join public.course_access access_value
    on access_value.course_id = course.id
   and access_value.user_id = p_actor_id
  where p_actor_id is not null
    and course.id = p_course_id
    and (
      course.owner_id = p_actor_id
      or access_value.user_id is not null
    )
$function$;

create function private.require_course_access_v1(
  p_course_id uuid,
  p_actor_id uuid,
  p_require_owner boolean default false
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_ownership text;
begin
  if p_actor_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if p_course_id is null or p_require_owner is null then
    raise exception 'Acesso de Curso inválido.' using errcode = '22023';
  end if;
  v_ownership := private.course_ownership_v1(p_course_id, p_actor_id);
  if v_ownership is null then
    raise exception 'Curso inexistente ou inacessível.' using errcode = 'PT404';
  end if;
  if p_require_owner and v_ownership <> 'owned' then
    raise exception 'Edição do Curso não autorizada.' using errcode = '42501';
  end if;
  return v_ownership;
end;
$function$;

create function private.list_courses_for_actor_v1(
  p_actor_id uuid,
  p_query text default null,
  p_limit integer default 24,
  p_before_updated_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_items jsonb;
  v_has_more boolean;
  v_next_cursor jsonb;
begin
  if p_actor_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 50
     or ((p_before_updated_at is null) <> (p_before_id is null))
     or (p_query is not null and char_length(btrim(p_query)) > 120) then
    raise exception 'Consulta de Cursos inválida.' using errcode = '22023';
  end if;

  with accessible as materialized (
    select
      course.id,
      course.title,
      course.goal,
      course.revision,
      course.created_at,
      course.updated_at,
      private.course_ownership_v1(course.id, p_actor_id) as ownership
    from public.courses course
    where private.course_ownership_v1(course.id, p_actor_id) is not null
      and (
        nullif(btrim(p_query), '') is null
        or lower(course.title || ' ' || course.goal || ' ' || case
          when course.owner_id = p_actor_id then course.brief else '' end)
          like '%' || lower(btrim(p_query)) || '%'
      )
      and (
        p_before_updated_at is null
        or (course.updated_at, course.id) < (p_before_updated_at, p_before_id)
      )
    order by course.updated_at desc, course.id desc
    limit p_limit + 1
  ), page as materialized (
    select * from accessible
    order by updated_at desc, id desc
    limit p_limit
  ), projected as (
    select page.*,
      count(entity.course_id) filter(where entity.entity_type = 'module')::integer
        as module_count,
      count(entity.course_id) filter(where entity.entity_type = 'lesson')::integer
        as lesson_count,
      count(entity.course_id) filter(where entity.entity_type = 'topic')::integer
        as topic_count,
      count(entity.course_id) filter(where entity.entity_type = 'microsequence')::integer
        as microsequence_count,
      count(entity.course_id) filter(where entity.entity_type = 'card')::integer
        as study_unit_count,
      coalesce((
        select count(distinct study_unit.entity_id)
        from public.course_personal_states personal_state
        cross join lateral jsonb_each(coalesce(
          personal_state.state#>'{progress,lessons}', '{}'::jsonb
        )) lesson(path, value)
        cross join lateral jsonb_array_elements_text(
          lesson.value->'completedStudyUnitIds'
        ) completed(study_unit_id)
        join private.course_entities study_unit
          on study_unit.course_id = page.id
         and study_unit.entity_type = 'card'
         and study_unit.entity_id = completed.study_unit_id
        where personal_state.course_id = page.id
          and personal_state.user_id = p_actor_id
      ), 0)::integer
        as completed_study_unit_count
    from page
    left join private.course_entities entity on entity.course_id = page.id
    group by page.id, page.title, page.goal, page.revision,
      page.created_at, page.updated_at, page.ownership
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'courseId', projected.id,
      'title', projected.title,
      'goal', projected.goal,
      'revision', projected.revision,
      'ownership', projected.ownership,
      'canEdit', projected.ownership = 'owned',
      'moduleCount', projected.module_count,
      'lessonCount', projected.lesson_count,
      'topicCount', projected.topic_count,
      'microsequenceCount', projected.microsequence_count,
      'studyUnitCount', projected.study_unit_count,
      'completedStudyUnitCount', projected.completed_study_unit_count,
      'updatedAt', projected.updated_at
    ) order by projected.updated_at desc, projected.id desc), '[]'::jsonb),
    (select count(*) from accessible) > p_limit,
    case when (select count(*) from accessible) > p_limit then (
      select jsonb_build_object(
        'beforeUpdatedAt', page.updated_at,
        'beforeId', page.id
      )
      from page order by page.updated_at, page.id limit 1
    ) end
  into v_items, v_has_more, v_next_cursor
  from projected;

  return jsonb_build_object(
    'contract', 'aralearn.course-list.v1',
    'items', v_items,
    'hasMore', v_has_more,
    'nextCursor', v_next_cursor
  );
end;
$function$;

create function private.list_course_review_items_for_actor_v1(
  p_actor_id uuid,
  p_limit integer default 50,
  p_before_marked_at timestamptz default null,
  p_before_course_id uuid default null,
  p_before_study_unit_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_items jsonb;
  v_has_more boolean;
  v_next_cursor jsonb;
begin
  if p_actor_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 100
     or not (
       (p_before_marked_at is null and p_before_course_id is null
         and p_before_study_unit_id is null)
       or (p_before_marked_at is not null and p_before_course_id is not null
         and nullif(btrim(p_before_study_unit_id), '') is not null)
     )
     or char_length(coalesce(p_before_study_unit_id, '')) > 240
     or coalesce(p_before_study_unit_id, '') ~ '[[:cntrl:]]' then
    raise exception 'Consulta de itens para rever inválida.' using errcode = '22023';
  end if;

  with review_items as materialized (
    select
      state_row.course_id,
      study_unit.entity_id as study_unit_id,
      (review_mark.value)::timestamptz as marked_at,
      coalesce(nullif(study_unit.content->>'title', ''), study_unit.entity_id) as title,
      course.title as course_title,
      coalesce(nullif(lesson.content->>'title', ''), lesson.entity_id) as lesson_title,
      module_value.entity_id as module_id,
      lesson.entity_id as lesson_id,
      microsequence.entity_id as microsequence_id
    from public.course_personal_states state_row
    join public.courses course
      on course.id = state_row.course_id
    cross join lateral jsonb_each_text(
      coalesce(state_row.state->'reviewMarks', '{}'::jsonb)
    ) review_mark(key, value)
    join private.course_entities study_unit
      on study_unit.course_id = state_row.course_id
     and study_unit.entity_type = 'card'
     and study_unit.entity_id = review_mark.key
    join private.course_entities microsequence
      on microsequence.course_id = study_unit.course_id
     and microsequence.entity_type = 'microsequence'
     and microsequence.entity_id = study_unit.parent_id
    join private.course_entities lesson
      on lesson.course_id = microsequence.course_id
     and lesson.entity_type = 'lesson'
     and lesson.entity_id = microsequence.parent_id
    join private.course_entities module_value
      on module_value.course_id = lesson.course_id
     and module_value.entity_type = 'module'
     and module_value.entity_id = lesson.parent_id
    where state_row.user_id = p_actor_id
      and private.course_ownership_v1(state_row.course_id, p_actor_id) is not null
      and (
        p_before_marked_at is null
        or ((review_mark.value)::timestamptz, state_row.course_id, study_unit.entity_id)
          < (p_before_marked_at, p_before_course_id, p_before_study_unit_id)
      )
    order by marked_at desc, state_row.course_id desc, study_unit.entity_id desc
    limit p_limit + 1
  ), page as materialized (
    select * from review_items
    order by marked_at desc, course_id desc, study_unit_id desc
    limit p_limit
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'courseId', page.course_id,
      'studyUnitId', page.study_unit_id,
      'title', page.title,
      'context', page.course_title || ' · ' || page.lesson_title,
      'entityPath', jsonb_build_array(
        page.course_id, page.module_id, page.lesson_id,
        page.microsequence_id, page.study_unit_id
      ),
      'reviewMarkedAt', page.marked_at
    ) order by page.marked_at desc, page.course_id desc, page.study_unit_id desc), '[]'::jsonb),
    (select count(*) from review_items) > p_limit,
    case when (select count(*) from review_items) > p_limit then (
      select jsonb_build_object(
        'beforeMarkedAt', page.marked_at,
        'beforeCourseId', page.course_id,
        'beforeStudyUnitId', page.study_unit_id
      ) from page order by page.marked_at, page.course_id, page.study_unit_id limit 1
    ) end
  into v_items, v_has_more, v_next_cursor
  from page;

  return jsonb_build_object(
    'contract', 'aralearn.course-review-list.v1',
    'items', v_items,
    'hasMore', v_has_more,
    'nextCursor', v_next_cursor
  );
end;
$function$;

create function private.get_course_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_include_outline boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_course public.courses%rowtype;
  v_ownership text;
  v_module_count integer;
  v_lesson_count integer;
  v_topic_count integer;
  v_microsequence_count integer;
  v_study_unit_count integer;
  v_modules jsonb;
  v_result jsonb;
begin
  if p_include_outline is null then
    raise exception 'Visualização do Curso inválida.' using errcode = '22023';
  end if;
  v_ownership := private.require_course_access_v1(
    p_course_id, p_actor_id, false
  );
  select * into strict v_course
  from public.courses course where course.id = p_course_id;

  select
    count(*) filter(where entity_type = 'module')::integer,
    count(*) filter(where entity_type = 'lesson')::integer,
    count(*) filter(where entity_type = 'topic')::integer,
    count(*) filter(where entity_type = 'microsequence')::integer,
    count(*) filter(where entity_type = 'card')::integer
  into v_module_count, v_lesson_count, v_topic_count,
    v_microsequence_count, v_study_unit_count
  from private.course_entities entity
  where entity.course_id = p_course_id;

  if p_include_outline then
    select coalesce(jsonb_agg(jsonb_build_object(
    'id', module_value.entity_id,
    'title', coalesce(nullif(module_value.content->>'title', ''), module_value.entity_id),
    'lessons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', lesson.entity_id,
        'title', coalesce(nullif(lesson.content->>'title', ''), lesson.entity_id),
        'topics', coalesce((
          select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
            'id', topic.entity_id,
            'title', coalesce(
              nullif(topic.content->>'title', ''), topic.entity_id
            ),
            'summary', nullif(topic.content->>'summary', '')
          )) order by topic.position, topic.entity_id)
          from private.course_entities topic
          where topic.course_id = p_course_id
            and topic.entity_type = 'topic'
            and topic.parent_type = 'lesson'
            and topic.parent_id = lesson.entity_id
        ), '[]'::jsonb),
        'microsequences', coalesce((
          select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
            'id', microsequence.entity_id,
            'title', coalesce(
              nullif(microsequence.content->>'title', ''),
              microsequence.entity_id
            ),
            'goal', nullif(microsequence.content->>'goal', ''),
            'role', nullif(microsequence.content->>'role', ''),
            'studyUnitCount', (
              select count(*)::integer
              from private.course_entities study_unit
              where study_unit.course_id = p_course_id
                and study_unit.entity_type = 'card'
                and study_unit.parent_type = 'microsequence'
                and study_unit.parent_id = microsequence.entity_id
            )
          )) order by microsequence.position, microsequence.entity_id)
          from private.course_entities microsequence
          where microsequence.course_id = p_course_id
            and microsequence.entity_type = 'microsequence'
            and microsequence.parent_type = 'lesson'
            and microsequence.parent_id = lesson.entity_id
        ), '[]'::jsonb)
      ) order by lesson.position, lesson.entity_id)
      from private.course_entities lesson
      where lesson.course_id = p_course_id
        and lesson.entity_type = 'lesson'
        and lesson.parent_type = 'module'
        and lesson.parent_id = module_value.entity_id
    ), '[]'::jsonb)
  ) order by module_value.position, module_value.entity_id), '[]'::jsonb)
    into v_modules
    from private.course_entities module_value
    where module_value.course_id = p_course_id
      and module_value.entity_type = 'module'
      and module_value.parent_type is null
      and module_value.parent_id is null;
  end if;

  v_result := jsonb_build_object(
    'contract', 'aralearn.course.v1',
    'courseId', v_course.id,
    'title', v_course.title,
    'goal', v_course.goal,
    'brief', case when v_ownership = 'owned'
      then v_course.brief else null end,
    'revision', v_course.revision,
    'ownership', v_ownership,
    'canEdit', v_ownership = 'owned',
    'authoringState', case when v_ownership = 'owned'
      then v_course.authoring_state else null end,
    'counts', jsonb_build_object(
      'moduleCount', v_module_count,
      'lessonCount', v_lesson_count,
      'topicCount', v_topic_count,
      'microsequenceCount', v_microsequence_count,
      'studyUnitCount', v_study_unit_count
    ),
    'createdAt', v_course.created_at,
    'updatedAt', v_course.updated_at
  );
  if p_include_outline then
    v_result := v_result || jsonb_build_object(
      'outline', jsonb_build_object(
        'courseId', v_course.id,
        'title', v_course.title,
        'goal', v_course.goal,
        'modules', v_modules
      )
    );
  end if;
  return v_result;
end;
$function$;

create function private.list_course_entities_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_revision bigint,
  p_limit integer default 500,
  p_after_entity_type text default null,
  p_after_entity_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_revision bigint;
  v_after_rank integer;
  v_items jsonb;
  v_has_more boolean;
  v_next_cursor jsonb;
begin
  perform private.require_course_access_v1(p_course_id, p_actor_id, false);
  if p_expected_revision is null or p_expected_revision < 1
     or p_limit is null or p_limit not between 1 and 1000
     or ((p_after_entity_type is null) <> (p_after_entity_id is null))
     or (
       p_after_entity_type is not null
       and p_after_entity_type not in (
         'module', 'lesson', 'topic', 'microsequence', 'card'
       )
     )
     or (
       p_after_entity_id is not null
       and (
         nullif(btrim(p_after_entity_id), '') is null
         or p_after_entity_id <> btrim(p_after_entity_id)
         or char_length(p_after_entity_id) > 240
         or p_after_entity_id ~ '[[:cntrl:]]'
       )
     ) then
    raise exception 'Paginação de entidades do Curso inválida.'
      using errcode = '22023';
  end if;
  select course.revision into v_revision
  from public.courses course where course.id = p_course_id;
  if v_revision is distinct from p_expected_revision then
    raise exception 'O Curso mudou; releia antes de continuar.'
      using errcode = '40001';
  end if;
  v_after_rank := case p_after_entity_type
    when 'module' then 1 when 'lesson' then 2 when 'topic' then 3
    when 'microsequence' then 4 when 'card' then 5
  end;

  with candidates as materialized (
    select entity.*,
      case entity.entity_type
        when 'module' then 1 when 'lesson' then 2 when 'topic' then 3
        when 'microsequence' then 4 else 5
      end as entity_rank
    from private.course_entities entity
    where entity.course_id = p_course_id
      and (
        p_after_entity_type is null
        or (
          case entity.entity_type
            when 'module' then 1 when 'lesson' then 2 when 'topic' then 3
            when 'microsequence' then 4 else 5
          end,
          entity.entity_id
        ) > (v_after_rank, p_after_entity_id)
      )
    order by entity_rank, entity.entity_id
    limit p_limit + 1
  ), page as materialized (
    select * from candidates
    order by entity_rank, entity_id
    limit p_limit
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'courseId', page.course_id,
      'entityType', page.entity_type,
      'entityId', page.entity_id,
      'parentType', page.parent_type,
      'parentId', page.parent_id,
      'position', page.position,
      'content', page.content,
      'version', page.version,
      'createdAt', page.created_at,
      'updatedAt', page.updated_at
    ) order by page.entity_rank, page.entity_id), '[]'::jsonb),
    (select count(*) from candidates) > p_limit,
    case when (select count(*) from candidates) > p_limit then (
      select jsonb_build_object(
        'entityType', page.entity_type,
        'entityId', page.entity_id
      ) from page
      order by page.entity_rank desc, page.entity_id desc
      limit 1
    ) end
  into v_items, v_has_more, v_next_cursor
  from page;

  return jsonb_build_object(
    'contract', 'aralearn.course-entities.v1',
    'courseId', p_course_id,
    'revision', v_revision,
    'items', v_items,
    'hasMore', v_has_more,
    'nextCursor', v_next_cursor
  );
end;
$function$;

create function public.list_courses_v1(
  p_query text default null,
  p_limit integer default 24,
  p_before_updated_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private, auth
as $function$
  select private.list_courses_for_actor_v1(
    auth.uid(), p_query, p_limit, p_before_updated_at, p_before_id
  )
$function$;

create function public.get_course_v1(p_course_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private, auth
as $function$
  select private.get_course_for_actor_v1(auth.uid(), p_course_id, false)
    - 'brief' - 'authoringState'
$function$;

create function public.list_course_review_items_v1(
  p_limit integer default 50,
  p_before_marked_at timestamptz default null,
  p_before_course_id uuid default null,
  p_before_study_unit_id text default null
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private, auth
as $function$
  select private.list_course_review_items_for_actor_v1(
    auth.uid(), p_limit, p_before_marked_at,
    p_before_course_id, p_before_study_unit_id
  )
$function$;

create function public.list_course_entities_v1(
  p_course_id uuid,
  p_expected_revision bigint,
  p_limit integer default 500,
  p_after_entity_type text default null,
  p_after_entity_id text default null
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private, auth
as $function$
  select private.list_course_entities_for_actor_v1(
    auth.uid(), p_course_id, p_expected_revision, p_limit,
    p_after_entity_type, p_after_entity_id
  )
$function$;

-- Wrappers exclusivos do service role permitem que Edge/MCP preserve o ator
-- real sem falsificar auth.uid(). Não são APIs alternativas ao cliente.
create function public.list_courses_for_actor_v1(
  p_actor_id uuid,
  p_query text default null,
  p_limit integer default 24,
  p_before_updated_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
begin
  perform private.require_service_role();
  return private.list_courses_for_actor_v1(
    p_actor_id, p_query, p_limit, p_before_updated_at, p_before_id
  );
end;
$function$;

create function public.get_course_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_include_outline boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
begin
  perform private.require_service_role();
  return private.get_course_for_actor_v1(
    p_actor_id, p_course_id, p_include_outline
  );
end;
$function$;

create function public.list_course_entities_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_revision bigint,
  p_limit integer default 50,
  p_after_entity_type text default null,
  p_after_entity_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
begin
  perform private.require_service_role();
  return private.list_course_entities_for_actor_v1(
    p_actor_id, p_course_id, p_expected_revision, p_limit,
    p_after_entity_type, p_after_entity_id
  );
end;
$function$;

create function public.create_course_for_actor_v1(
  p_actor_id uuid,
  p_title text,
  p_goal text,
  p_brief text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $function$
declare
  v_hash text;
  v_receipt private.course_change_receipts%rowtype;
  v_course public.courses%rowtype;
  v_result jsonb;
begin
  perform private.require_service_role();
  if p_actor_id is null
     or not exists(select 1 from auth.users account where account.id = p_actor_id)
     or nullif(btrim(p_title), '') is null
     or char_length(btrim(p_title)) > 300
     or nullif(btrim(p_goal), '') is null
     or char_length(btrim(p_goal)) > 2000
     or p_brief is null
     or char_length(p_brief) > 16384
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'Criação de Curso inválida.' using errcode = '22023';
  end if;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'operation', 'create',
    'actorId', p_actor_id,
    'title', btrim(p_title),
    'goal', btrim(p_goal),
    'brief', p_brief
  )::text, 'UTF8'), 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:' || p_actor_id::text || ':' || p_request_id, 0
  ));
  delete from private.course_change_receipts receipt
  where (receipt.actor_id, receipt.request_id) in (
    select expired.actor_id, expired.request_id
    from private.course_change_receipts expired
    where expired.expires_at <= statement_timestamp()
    order by expired.expires_at, expired.actor_id, expired.request_id
    limit 100
  );
  delete from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  select * into v_receipt
  from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'create' or v_receipt.request_hash <> v_hash then
      raise exception 'requestId reutilizado com comando incompatível.'
        using errcode = '23514';
    end if;
    return (v_receipt.result - 'idempotent') || jsonb_build_object(
      'idempotent', true
    );
  end if;

  insert into public.courses(
    id, owner_id, title, goal, brief, revision, authoring_state
  ) values(
    extensions.gen_random_uuid(), p_actor_id, btrim(p_title), btrim(p_goal),
    p_brief, 1,
    '{"version":1,"parts":[],"decisions":[],"mandate":null}'::jsonb
  ) returning * into v_course;
  insert into private.course_events(
    course_id, revision, operation, summary, actor_id
  ) values(
    v_course.id,
    v_course.revision,
    'create_course',
    jsonb_build_object(
      'changeKind', 'course_initialized',
      'createdCount', 0,
      'updatedCount', 0,
      'deletedCount', 0
    ),
    p_actor_id
  );
  v_result := jsonb_build_object(
    'courseId', v_course.id,
    'title', v_course.title,
    'goal', v_course.goal,
    'brief', v_course.brief,
    'revision', v_course.revision,
    'ownership', 'owned',
    'idempotent', false,
    'createdAt', v_course.created_at,
    'updatedAt', v_course.updated_at
  );
  insert into private.course_change_receipts(
    actor_id, request_id, operation, course_id, request_hash, result
  ) values(
    p_actor_id, p_request_id, 'create', v_course.id, v_hash, v_result
  );
  return v_result;
end;
$function$;

create function public.commit_course_changes_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_revision bigint,
  p_operation text,
  p_title text,
  p_goal text,
  p_brief text,
  p_authoring_state jsonb,
  p_upserts jsonb,
  p_deletes jsonb,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $function$
declare
  v_hash text;
  v_receipt private.course_change_receipts%rowtype;
  v_course public.courses%rowtype;
  v_upserts jsonb := coalesce(p_upserts, '[]'::jsonb);
  v_deletes jsonb := coalesce(p_deletes, '[]'::jsonb);
  v_changed_fields text[] := array[]::text[];
  v_created_count integer := 0;
  v_updated_count integer := 0;
  v_upsert_count integer := 0;
  v_delete_count integer := 0;
  v_before_entity_count integer;
  v_has_change boolean := false;
  v_result jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id, p_actor_id, true);
  if p_expected_revision is null or p_expected_revision < 1
     or p_operation is null
     or p_operation not in ('update_metadata', 'commit_entities')
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'Alteração de Curso inválida.' using errcode = '22023';
  end if;

  if p_operation = 'update_metadata' then
    if jsonb_typeof(v_upserts) <> 'array'
       or jsonb_typeof(v_deletes) <> 'array' then
      raise exception 'Metadados do Curso inválidos.' using errcode = '22023';
    end if;
    if p_title is null and p_goal is null and p_brief is null
       and p_authoring_state is null then
      raise exception 'Informe ao menos um metadado para alterar.'
        using errcode = '22023';
    end if;
    if (p_title is not null and (
          nullif(btrim(p_title), '') is null or char_length(btrim(p_title)) > 300
        ))
       or (p_goal is not null and (
          nullif(btrim(p_goal), '') is null or char_length(btrim(p_goal)) > 2000
        ))
       or (p_brief is not null and char_length(p_brief) > 16384)
       or (p_authoring_state is not null and (
          jsonb_typeof(p_authoring_state) <> 'object'
          or not (p_authoring_state ?& array[
            'version', 'parts', 'decisions', 'mandate'
          ])
          or p_authoring_state - 'version' - 'parts' - 'decisions' - 'mandate'
            <> '{}'::jsonb
          or p_authoring_state->'version' <> '1'::jsonb
          or jsonb_typeof(p_authoring_state->'parts') <> 'array'
          or jsonb_array_length(p_authoring_state->'parts') > 64
          or jsonb_typeof(p_authoring_state->'decisions') <> 'array'
          or jsonb_array_length(p_authoring_state->'decisions') > 512
          or not (
            p_authoring_state->'mandate' = 'null'::jsonb
            or jsonb_typeof(p_authoring_state->'mandate') = 'object'
          )
          or pg_column_size(p_authoring_state) > 1048576
        ))
       or jsonb_array_length(v_upserts) <> 0
       or jsonb_array_length(v_deletes) <> 0 then
      raise exception 'Metadados do Curso inválidos.' using errcode = '22023';
    end if;
  else
    if jsonb_typeof(v_upserts) <> 'array'
       or jsonb_typeof(v_deletes) <> 'array' then
      raise exception 'Lote de entidades do Curso inválido.' using errcode = '22023';
    end if;
    if p_title is not null or p_goal is not null or p_brief is not null
       or p_authoring_state is not null
       or jsonb_array_length(v_upserts) > 200
       or jsonb_array_length(v_deletes) > 200
       or jsonb_array_length(v_upserts) + jsonb_array_length(v_deletes) < 1
       or pg_column_size(jsonb_build_object(
         'upserts', v_upserts, 'deletes', v_deletes
       )) > 524288 then
      raise exception 'Lote de entidades do Curso inválido.' using errcode = '22023';
    end if;
    if exists(
      select 1
      from jsonb_array_elements(v_upserts) with ordinality item(value, ordinal)
      where jsonb_typeof(item.value) <> 'object'
        or exists(
          select 1 from jsonb_object_keys(item.value) field
          where field not in (
            'entityType', 'entityId', 'parentType', 'parentId',
            'position', 'content'
          )
        )
        or not (item.value ?& array[
          'entityType', 'entityId', 'parentType', 'parentId',
          'position', 'content'
        ])
        or item.value->>'entityType' not in (
          'module', 'lesson', 'topic', 'microsequence', 'card'
        )
        or nullif(btrim(item.value->>'entityId'), '') is null
        or item.value->>'entityId' <> btrim(item.value->>'entityId')
        or char_length(item.value->>'entityId') > 240
        or item.value->>'entityId' ~ '[[:cntrl:]]'
        or jsonb_typeof(item.value->'position') <> 'number'
        or item.value->>'position' !~ '^-?[0-9]+$'
        or (item.value->>'position')::numeric not between -2147483648 and 2147483647
        or jsonb_typeof(item.value->'content') <> 'object'
    ) or exists(
      select 1
      from jsonb_array_elements(v_deletes) with ordinality item(value, ordinal)
      where jsonb_typeof(item.value) <> 'object'
        or exists(
          select 1 from jsonb_object_keys(item.value) field
          where field not in ('entityType', 'entityId')
        )
        or not (item.value ?& array['entityType', 'entityId'])
        or item.value->>'entityType' not in (
          'module', 'lesson', 'topic', 'microsequence', 'card'
        )
        or nullif(btrim(item.value->>'entityId'), '') is null
        or item.value->>'entityId' <> btrim(item.value->>'entityId')
        or char_length(item.value->>'entityId') > 240
        or item.value->>'entityId' ~ '[[:cntrl:]]'
    ) then
      raise exception 'Entidade do Curso inválida.' using errcode = '22023';
    end if;
    if (
      select count(*) <> count(distinct (
        upsert_item.value->>'entityType', upsert_item.value->>'entityId'
      ))
      from jsonb_array_elements(v_upserts) as upsert_item(value)
    ) or (
      select count(*) <> count(distinct (
        delete_item.value->>'entityType', delete_item.value->>'entityId'
      ))
      from jsonb_array_elements(v_deletes) as delete_item(value)
    ) or exists(
      select 1
      from jsonb_array_elements(v_upserts) as upsert_item(value)
      join jsonb_array_elements(v_deletes) as delete_item(value)
        on delete_item.value->>'entityType' = upsert_item.value->>'entityType'
       and delete_item.value->>'entityId' = upsert_item.value->>'entityId'
    ) then
      raise exception 'O lote repete a mesma identidade de entidade.'
        using errcode = '22023';
    end if;
  end if;

  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'courseId', p_course_id,
    'expectedRevision', p_expected_revision,
    'operation', p_operation,
    'title', p_title,
    'goal', p_goal,
    'brief', p_brief,
    'authoringState', p_authoring_state,
    'upserts', v_upserts,
    'deletes', v_deletes
  )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:' || p_actor_id::text || ':' || p_request_id, 0
  ));
  delete from private.course_change_receipts receipt
  where (receipt.actor_id, receipt.request_id) in (
    select expired.actor_id, expired.request_id
    from private.course_change_receipts expired
    where expired.expires_at <= statement_timestamp()
    order by expired.expires_at, expired.actor_id, expired.request_id
    limit 100
  );
  delete from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  select * into v_receipt
  from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.operation <> p_operation
       or v_receipt.course_id <> p_course_id
       or v_receipt.request_hash <> v_hash then
      raise exception 'requestId reutilizado com comando incompatível.'
        using errcode = '23514';
    end if;
    return (v_receipt.result - 'idempotent') || jsonb_build_object(
      'idempotent', true
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'course-row:' || p_course_id::text, 0
  ));
  select * into v_course
  from public.courses course
  where course.id = p_course_id
  for update;
  if not found then
    raise exception 'Curso inexistente ou inacessível.' using errcode = 'PT404';
  end if;
  if v_course.revision <> p_expected_revision then
    raise exception 'O Curso mudou; releia antes de salvar.'
      using errcode = '40001';
  end if;

  if p_operation = 'update_metadata' then
    if p_title is not null and v_course.title is distinct from btrim(p_title) then
      v_changed_fields := array_append(v_changed_fields, 'title');
    end if;
    if p_goal is not null and v_course.goal is distinct from btrim(p_goal) then
      v_changed_fields := array_append(v_changed_fields, 'goal');
    end if;
    if p_brief is not null and v_course.brief is distinct from p_brief then
      v_changed_fields := array_append(v_changed_fields, 'brief');
    end if;
    if p_authoring_state is not null
       and v_course.authoring_state is distinct from p_authoring_state then
      v_changed_fields := array_append(v_changed_fields, 'authoringState');
    end if;
    v_has_change := cardinality(v_changed_fields) > 0;
    if v_has_change then
      update public.courses course
      set title = case when p_title is null then course.title else btrim(p_title) end,
          goal = case when p_goal is null then course.goal else btrim(p_goal) end,
          brief = coalesce(p_brief, course.brief),
          authoring_state = coalesce(p_authoring_state, course.authoring_state),
          revision = course.revision + 1,
          updated_at = now()
      where course.id = p_course_id
      returning * into v_course;
    end if;
  else
    select count(*)::integer into v_before_entity_count
    from private.course_entities entity
    where entity.course_id = p_course_id;

    delete from private.course_entities entity
    using jsonb_array_elements(v_deletes) as deletion(value)
    where entity.course_id = p_course_id
      and entity.entity_type = deletion.value->>'entityType'
      and entity.entity_id = deletion.value->>'entityId';
    select v_before_entity_count - count(*)::integer into v_delete_count
    from private.course_entities entity
    where entity.course_id = p_course_id;

    select
      count(*) filter(where entity.course_id is null)::integer,
      count(*) filter(
        where entity.course_id is not null
          and row(
            entity.parent_type, entity.parent_id,
            entity.position, entity.content
          ) is distinct from row(
            nullif(item.value->>'parentType', ''),
            nullif(item.value->>'parentId', ''),
            (item.value->>'position')::integer,
            item.value->'content'
          )
      )::integer
    into v_created_count, v_updated_count
    from jsonb_array_elements(v_upserts) as item(value)
    left join private.course_entities entity
      on entity.course_id = p_course_id
     and entity.entity_type = item.value->>'entityType'
     and entity.entity_id = item.value->>'entityId';
    v_upsert_count := v_created_count + v_updated_count;

    insert into private.course_entities(
      course_id, entity_type, entity_id, parent_type, parent_id,
      position, content, version, created_at, updated_at
    )
    select
      p_course_id,
      item.value->>'entityType',
      item.value->>'entityId',
      nullif(item.value->>'parentType', ''),
      nullif(item.value->>'parentId', ''),
      (item.value->>'position')::integer,
      item.value->'content',
      1,
      now(),
      now()
    from jsonb_array_elements(v_upserts) as item(value)
    where not exists(
      select 1
      from private.course_entities current_entity
      where current_entity.course_id = p_course_id
        and current_entity.entity_type = item.value->>'entityType'
        and current_entity.entity_id = item.value->>'entityId'
        and row(
          current_entity.parent_type, current_entity.parent_id,
          current_entity.position, current_entity.content
        ) is not distinct from row(
          nullif(item.value->>'parentType', ''),
          nullif(item.value->>'parentId', ''),
          (item.value->>'position')::integer,
          item.value->'content'
        )
    )
    on conflict(course_id, entity_type, entity_id) do update set
      parent_type = excluded.parent_type,
      parent_id = excluded.parent_id,
      position = excluded.position,
      content = excluded.content,
      version = private.course_entities.version + 1,
      updated_at = now()
    where row(
      private.course_entities.parent_type,
      private.course_entities.parent_id,
      private.course_entities.position,
      private.course_entities.content
    ) is distinct from row(
      excluded.parent_type,
      excluded.parent_id,
      excluded.position,
      excluded.content
    );

    if exists(
      select 1
      from private.course_entities entity
      where entity.course_id = p_course_id
        and entity.parent_type is not null
        and not exists(
          select 1 from private.course_entities parent
          where parent.course_id = entity.course_id
            and parent.entity_type = entity.parent_type
            and parent.entity_id = entity.parent_id
        )
    ) or exists(
      select 1
      from private.course_entities entity
      where entity.course_id = p_course_id and entity.entity_type <> 'card'
      group by entity.parent_type, entity.parent_id, entity.entity_type
      having min(entity.position) <> 0
        or max(entity.position) <> count(*) - 1
        or count(distinct entity.position) <> count(*)
    ) then
      raise exception 'A alteração produziria estrutura de Curso inválida.'
        using errcode = '23514';
    end if;

    v_has_change := v_created_count + v_updated_count + v_delete_count > 0;
    if v_has_change then
      update public.courses course
      set revision = course.revision + 1, updated_at = now()
      where course.id = p_course_id
      returning * into v_course;
    end if;
  end if;

  if v_has_change then
    insert into private.course_events(
      course_id, revision, operation, summary, actor_id
    ) values(
      p_course_id,
      v_course.revision,
      case p_operation
        when 'update_metadata' then 'update_course_metadata'
        else 'replace_course_composition'
      end,
      case when p_operation = 'update_metadata' then jsonb_build_object(
        'changeKind', 'course_metadata_updated',
        'changedFields', to_jsonb(v_changed_fields),
        'createdCount', 0,
        'updatedCount', 0,
        'deletedCount', 0
      ) else jsonb_build_object(
        'changeKind', 'course_composition_replaced',
        'createdCount', v_created_count,
        'updatedCount', v_updated_count,
        'deletedCount', v_delete_count
      ) end,
      p_actor_id
    );
  end if;

  v_result := jsonb_build_object(
    'courseId', v_course.id,
    'revision', v_course.revision,
    'operation', p_operation,
    'changedFields', to_jsonb(v_changed_fields),
    'createdCount', v_created_count,
    'updatedCount', v_updated_count,
    'upsertedCount', v_upsert_count,
    'deletedCount', v_delete_count,
    'idempotent', false,
    'updatedAt', v_course.updated_at
  );
  insert into private.course_change_receipts(
    actor_id, request_id, operation, course_id, request_hash, result
  ) values(
    p_actor_id, p_request_id, p_operation, p_course_id, v_hash, v_result
  );
  return v_result;
end;
$function$;

create function public.load_course_personal_state_v1(p_course_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_state public.course_personal_states%rowtype;
begin
  perform private.require_course_access_v1(p_course_id, v_actor_id, false);
  select * into v_state
  from public.course_personal_states state_row
  where state_row.user_id = v_actor_id
    and state_row.course_id = p_course_id;
  if not found then return null; end if;
  return jsonb_build_object(
    'contract', 'aralearn.course-personal-state.v1',
    'courseId', v_state.course_id,
    'revision', v_state.revision,
    'state', v_state.state,
    'updatedAt', v_state.updated_at
  );
end;
$function$;

create function public.mutate_course_personal_state_v1(
  p_course_id uuid,
  p_expected_revision bigint,
  p_operations jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_hash text;
  v_receipt private.course_personal_state_receipts%rowtype;
  v_row public.course_personal_states%rowtype;
  v_state jsonb;
  v_operation jsonb;
  v_kind text;
  v_collection text;
  v_path text;
  v_json_path text[];
  v_result jsonb;
begin
  if p_course_id is null or p_request_id is null or p_operations is null
     or p_expected_revision is null or p_expected_revision < 0
     or jsonb_typeof(p_operations) is distinct from 'array' then
    raise exception 'Mutação do estado pessoal inválida.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_operations) not between 1 and 512
     or pg_column_size(p_operations) > 65536 then
    raise exception 'Mutação do estado pessoal inválida.' using errcode = '22023';
  end if;
  perform private.require_course_access_v1(p_course_id, v_actor_id, false);
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'courseId', p_course_id,
    'expectedRevision', p_expected_revision,
    'operations', p_operations
  )::text, 'UTF8'), 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(
    'course-state-request:' || v_actor_id::text || ':' || p_request_id::text, 0
  ));
  delete from private.course_personal_state_receipts receipt
  where receipt.user_id = v_actor_id
    and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  with expired as materialized (
    select receipt.ctid
    from private.course_personal_state_receipts receipt
    where receipt.expires_at <= statement_timestamp()
    order by receipt.expires_at, receipt.user_id, receipt.request_id
    limit 256
    for update skip locked
  )
  delete from private.course_personal_state_receipts receipt
  using expired where receipt.ctid = expired.ctid;

  select * into v_receipt
  from private.course_personal_state_receipts receipt
  where receipt.user_id = v_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.request_hash <> v_hash
       or v_receipt.course_id <> p_course_id then
      raise exception 'requestId reutilizado com estado incompatível.'
        using errcode = '23514';
    end if;
    return jsonb_build_object(
      'courseId', v_receipt.course_id,
      'revision', v_receipt.result_revision,
      'updatedAt', v_receipt.result_updated_at,
      'idempotent', true
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'course-state-row:' || v_actor_id::text || ':' || p_course_id::text, 0
  ));
  select * into v_row
  from public.course_personal_states state_row
  where state_row.user_id = v_actor_id
    and state_row.course_id = p_course_id
  for update;
  if not found then
    if p_expected_revision <> 0 then
      raise exception 'O estado pessoal mudou; releia antes de salvar.'
        using errcode = '40001';
    end if;
    v_state := jsonb_build_object(
      'version', 1,
      'progress', jsonb_build_object('version', 3, 'lessons', '{}'::jsonb),
      'reviewMarks', '{}'::jsonb,
      'observations', '{}'::jsonb
    );
  else
    if v_row.revision <> p_expected_revision then
      raise exception 'O estado pessoal mudou; releia antes de salvar.'
        using errcode = '40001';
    end if;
    v_state := v_row.state;
  end if;

  for v_operation in
    select operation_item.value
    from jsonb_array_elements(p_operations) as operation_item(value)
  loop
    if jsonb_typeof(v_operation) <> 'object' or exists(
      select 1 from jsonb_object_keys(v_operation) field
      where field not in ('kind', 'collection', 'path', 'value')
    ) then
      raise exception 'Operação do estado pessoal inválida.' using errcode = '22023';
    end if;
    v_kind := v_operation->>'kind';
    v_collection := v_operation->>'collection';
    v_path := v_operation->>'path';
    if v_kind is null or v_collection is null
       or v_kind not in ('set', 'delete')
       or v_collection not in ('progress.lessons', 'reviewMarks', 'observations')
       or nullif(btrim(v_path), '') is null
       or v_path <> btrim(v_path)
       or char_length(v_path) > 240
       or v_path ~ '[[:cntrl:]]'
       or (v_kind = 'set' and not (v_operation ? 'value'))
       or (v_kind = 'delete' and v_operation ? 'value')
       or (
         v_collection = 'observations' and v_kind = 'set'
         and (
           jsonb_typeof(v_operation->'value') <> 'object'
           or exists(
             select 1 from jsonb_object_keys(v_operation->'value') field
             where field not in ('category', 'body', 'updatedAt')
           )
           or not (v_operation->'value' ?& array['category', 'body', 'updatedAt'])
         )
       ) then
      raise exception 'Operação do estado pessoal inválida.' using errcode = '22023';
    end if;
    v_json_path := case v_collection
      when 'progress.lessons' then array['progress', 'lessons', v_path]
      when 'reviewMarks' then array['reviewMarks', v_path]
      else array['observations', v_path]
    end;
    if v_kind = 'delete' then
      v_state := v_state #- v_json_path;
    else
      v_state := jsonb_set(v_state, v_json_path, v_operation->'value', true);
    end if;
  end loop;

  if not private.valid_course_personal_state_v1(v_state) then
    raise exception 'A mutação produziria estado pessoal inválido.'
      using errcode = '22023';
  end if;
  if v_row.user_id is null then
    insert into public.course_personal_states(
      user_id, course_id, revision, state
    ) values(
      v_actor_id, p_course_id, 1, v_state
    ) returning * into v_row;
  else
    update public.course_personal_states state_row
    set revision = state_row.revision + 1,
        state = v_state,
        updated_at = now()
    where state_row.user_id = v_actor_id
      and state_row.course_id = p_course_id
    returning * into v_row;
  end if;

  v_result := jsonb_build_object(
    'courseId', v_row.course_id,
    'revision', v_row.revision,
    'updatedAt', v_row.updated_at,
    'idempotent', false
  );
  insert into private.course_personal_state_receipts(
    user_id, request_id, course_id, request_hash,
    result_revision, result_updated_at
  ) values(
    v_actor_id, p_request_id, p_course_id, v_hash,
    v_row.revision, v_row.updated_at
  );
  return v_result;
end;
$function$;

revoke all on function private.course_ownership_v1(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.require_course_access_v1(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;
revoke all on function private.list_courses_for_actor_v1(
  uuid, text, integer, timestamptz, uuid
) from public, anon, authenticated, service_role;
revoke all on function private.list_course_review_items_for_actor_v1(
  uuid, integer, timestamptz, uuid, text
) from public, anon, authenticated, service_role;
revoke all on function private.get_course_for_actor_v1(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;
revoke all on function private.list_course_entities_for_actor_v1(
  uuid, uuid, bigint, integer, text, text
) from public, anon, authenticated, service_role;

revoke all on function public.list_courses_v1(text, integer, timestamptz, uuid)
  from public, anon, service_role;
grant execute on function public.list_courses_v1(text, integer, timestamptz, uuid)
  to authenticated;
revoke all on function public.list_course_review_items_v1(
  integer, timestamptz, uuid, text
) from public, anon, service_role;
grant execute on function public.list_course_review_items_v1(
  integer, timestamptz, uuid, text
) to authenticated;
revoke all on function public.get_course_v1(uuid)
  from public, anon, service_role;
grant execute on function public.get_course_v1(uuid) to authenticated;
revoke all on function public.list_course_entities_v1(
  uuid, bigint, integer, text, text
) from public, anon, service_role;
grant execute on function public.list_course_entities_v1(
  uuid, bigint, integer, text, text
) to authenticated;
revoke all on function public.load_course_personal_state_v1(uuid)
  from public, anon, service_role;
grant execute on function public.load_course_personal_state_v1(uuid)
  to authenticated;
revoke all on function public.mutate_course_personal_state_v1(
  uuid, bigint, jsonb, uuid
) from public, anon, service_role;
grant execute on function public.mutate_course_personal_state_v1(
  uuid, bigint, jsonb, uuid
) to authenticated;

revoke all on function public.list_courses_for_actor_v1(
  uuid, text, integer, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.list_courses_for_actor_v1(
  uuid, text, integer, timestamptz, uuid
) to service_role;
revoke all on function public.get_course_for_actor_v1(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.get_course_for_actor_v1(uuid, uuid, boolean)
  to service_role;
revoke all on function public.list_course_entities_for_actor_v1(
  uuid, uuid, bigint, integer, text, text
) from public, anon, authenticated;
grant execute on function public.list_course_entities_for_actor_v1(
  uuid, uuid, bigint, integer, text, text
) to service_role;
revoke all on function public.create_course_for_actor_v1(
  uuid, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_course_for_actor_v1(
  uuid, text, text, text, text
) to service_role;
revoke all on function public.commit_course_changes_for_actor_v1(
  uuid, uuid, bigint, text, text, text, text, jsonb, jsonb, jsonb, text
) from public, anon, authenticated;
grant execute on function public.commit_course_changes_for_actor_v1(
  uuid, uuid, bigint, text, text, text, text, jsonb, jsonb, jsonb, text
) to service_role;

alter table public.courses enable row level security;
alter table public.courses force row level security;
create policy courses_access_v1 on public.courses
  for select to authenticated
  using(private.course_ownership_v1(id, auth.uid()) is not null);

alter table private.course_entities enable row level security;
alter table private.course_entities force row level security;
create policy course_entities_access_v1 on private.course_entities
  for select to authenticated
  using(private.course_ownership_v1(course_id, auth.uid()) is not null);

alter table public.course_access enable row level security;
alter table public.course_access force row level security;
create policy course_access_self_v1 on public.course_access
  for select to authenticated using(user_id = auth.uid());

alter table public.course_personal_states enable row level security;
alter table public.course_personal_states force row level security;
create policy course_personal_states_owner_v1 on public.course_personal_states
  for all to authenticated
  using(
    user_id = auth.uid()
    and private.course_ownership_v1(course_id, auth.uid()) is not null
  )
  with check(
    user_id = auth.uid()
    and private.course_ownership_v1(course_id, auth.uid()) is not null
  );

do $advance_course_runtime_manifest$
declare
  v_manifest jsonb;
  v_body text;
begin
  if to_regprocedure('public.get_aralearn_runtime_manifest()') is null then
    raise exception 'Manifesto de runtime ausente.' using errcode = '55000';
  end if;
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision' <> '20260817130000'
     or (v_manifest->>'contractVersion')::integer <> 1
     or not (v_manifest->'features' ? 'task-operation-terminology-v1') then
    raise exception 'Manifesto anterior ao corte de Curso é inesperado.'
      using errcode = '55000';
  end if;
  v_manifest := jsonb_build_object(
    'schemaRevision', '20260817140000',
    'contractVersion', 1,
    'features', jsonb_build_array(
      'flat-runtime-manifest-v1',
      'single-live-course-identity-v1',
      'paged-live-course-composition-v1',
      'direct-course-access-v1',
      'course-personal-state-v1',
      'course-cas-idempotency-v1',
      'oauth-only-authoring-mcp',
      'package-library-v1',
      'package-contract-discovery-v1'
    )
  );
  v_body := 'select ' || quote_literal(v_manifest::text) || '::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      || 'returns jsonb language sql stable security definer '
      || 'set search_path = pg_catalog as %L',
    v_body
  );
  revoke all on function public.get_aralearn_runtime_manifest()
    from public, anon, authenticated, service_role;
  grant execute on function public.get_aralearn_runtime_manifest()
    to anon, authenticated, service_role;
end;
$advance_course_runtime_manifest$;

-- O corte não tenta adivinhar funções antigas pelo nome. Toda superfície
-- executável de public/private é fechada e somente o contrato corrente é
-- reaberto. Helpers SECURITY DEFINER, funções de trigger e rotinas internas
-- continuam utilizáveis por seus chamadores internos, sem RPC público.
revoke execute on all functions in schema public, private
  from public, anon, authenticated, service_role;

grant execute on function public.list_courses_v1(
  text, integer, timestamptz, uuid
) to authenticated;
grant execute on function public.list_course_review_items_v1(
  integer, timestamptz, uuid, text
) to authenticated;
grant execute on function public.get_course_v1(uuid)
  to authenticated;
grant execute on function public.list_course_entities_v1(
  uuid, bigint, integer, text, text
) to authenticated;
grant execute on function public.load_course_personal_state_v1(uuid)
  to authenticated;
grant execute on function public.mutate_course_personal_state_v1(
  uuid, bigint, jsonb, uuid
) to authenticated;

grant execute on function public.list_courses_for_actor_v1(
  uuid, text, integer, timestamptz, uuid
) to service_role;
grant execute on function public.get_course_for_actor_v1(
  uuid, uuid, boolean
) to service_role;
grant execute on function public.list_course_entities_for_actor_v1(
  uuid, uuid, bigint, integer, text, text
) to service_role;
grant execute on function public.create_course_for_actor_v1(
  uuid, text, text, text, text
) to service_role;
grant execute on function public.commit_course_changes_for_actor_v1(
  uuid, uuid, bigint, text, text, text, text, jsonb, jsonb, jsonb, text
) to service_role;

grant execute on function public.get_aralearn_runtime_manifest()
  to anon, authenticated, service_role;
grant execute on function public.aralearn_mcp_access_token_hook(jsonb)
  to supabase_auth_admin;

commit;
