begin;

select pg_advisory_xact_lock(
  hashtextextended('aralearn-catalog-course-submissions-v1', 0)
);

create table private.catalog_course_submissions (
  id uuid primary key,
  author_user_id uuid references auth.users(id) on delete set null,
  source_course_id uuid references public.courses(id) on delete set null,
  source_content_hash text not null,
  source_contract_key text not null,
  source_title text not null,
  license_code text not null,
  attribution_text text not null,
  provenance_text text not null,
  consent_version text not null,
  consented_at timestamptz not null,
  status text not null default 'submitted',
  reviewer_user_id uuid references auth.users(id) on delete set null,
  decision_note text,
  stale_reason text,
  accepted_collection_id uuid
    references public.catalog_collections(id) on delete restrict,
  official_course_id uuid references public.courses(id) on delete restrict,
  official_contract_key text,
  submitted_at timestamptz not null default now(),
  review_started_at timestamptz,
  decided_at timestamptz,
  withdrawn_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint catalog_course_submissions_source_hash check (
    source_content_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint catalog_course_submissions_source_key check (
    btrim(source_contract_key) <> '' and char_length(source_contract_key) <= 240
  ),
  constraint catalog_course_submissions_source_title check (
    btrim(source_title) <> '' and char_length(source_title) <= 500
  ),
  constraint catalog_course_submissions_license check (
    license_code ~ '^[A-Za-z0-9][A-Za-z0-9.+-]{0,79}$'
  ),
  constraint catalog_course_submissions_attribution check (
    btrim(attribution_text) <> '' and char_length(attribution_text) <= 1000
  ),
  constraint catalog_course_submissions_provenance check (
    btrim(provenance_text) <> '' and char_length(provenance_text) <= 4000
  ),
  constraint catalog_course_submissions_consent check (
    consent_version = 'catalog-submission-v1'
  ),
  constraint catalog_course_submissions_status check (
    status in (
      'submitted', 'in_review', 'accepted', 'rejected', 'withdrawn', 'stale'
    )
  ),
  constraint catalog_course_submissions_note check (
    decision_note is null
    or (btrim(decision_note) <> '' and char_length(decision_note) <= 4000)
  ),
  constraint catalog_course_submissions_stale_reason check (
    stale_reason is null
    or stale_reason in ('source_changed', 'source_removed', 'source_invalid')
  ),
  constraint catalog_course_submissions_official_key check (
    official_contract_key is null
    or official_contract_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint catalog_course_submissions_terminal_shape check (
    (status = 'accepted'
      and official_course_id is not null
      and accepted_collection_id is not null
      and official_contract_key is not null
      and decided_at is not null
      and withdrawn_at is null)
    or (status = 'rejected'
      and official_course_id is null
      and accepted_collection_id is null
      and official_contract_key is null
      and decided_at is not null
      and decision_note is not null
      and withdrawn_at is null)
    or (status = 'withdrawn'
      and official_course_id is null
      and accepted_collection_id is null
      and official_contract_key is null
      and decided_at is null
      and withdrawn_at is not null)
    or (status = 'stale'
      and official_course_id is null
      and accepted_collection_id is null
      and official_contract_key is null
      and decided_at is null
      and withdrawn_at is null
      and stale_reason is not null)
    or (status in ('submitted', 'in_review')
      and source_course_id is not null
      and official_course_id is null
      and accepted_collection_id is null
      and official_contract_key is null
      and decided_at is null
      and withdrawn_at is null
      and stale_reason is null)
  )
);

create unique index catalog_course_submissions_active_source_uidx
  on private.catalog_course_submissions(source_course_id)
  where status in ('submitted', 'in_review');
create index catalog_course_submissions_author_idx
  on private.catalog_course_submissions(author_user_id, submitted_at desc, id);
create index catalog_course_submissions_queue_idx
  on private.catalog_course_submissions(status, submitted_at, id)
  where status in ('submitted', 'in_review');
create unique index catalog_course_submissions_official_course_uidx
  on private.catalog_course_submissions(official_course_id)
  where official_course_id is not null;

-- Root changes lock before touching the row. Child statements lock before
-- they may commit. If an editorial copy won the lock first, MVCC keeps the
-- previous committed child visible; if the edit won, the copy waits and sees
-- its new token. Statement triggers avoid one owner lookup per imported row.
create or replace function private.lock_personal_course_for_catalog_submission()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_course_id uuid;
  v_owner_id uuid;
begin
  if tg_op = 'DELETE' then
    v_course_id := old.id;
    v_owner_id := old.owner_id;
  else
    v_course_id := new.id;
    v_owner_id := new.owner_id;
  end if;

  if v_owner_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(
      'catalog-submission-source:' || v_course_id::text, 0
    ));
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function private.lock_personal_course_tree_statement()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_course_id uuid;
  v_query text;
begin
  if tg_op = 'INSERT' then
    v_query :=
      'select distinct changed_row.course_id from new_rows changed_row '
      'join public.courses course on course.id = changed_row.course_id '
      'where course.owner_id is not null order by changed_row.course_id';
  elsif tg_op = 'DELETE' then
    v_query :=
      'select distinct changed_row.course_id from old_rows changed_row '
      'join public.courses course on course.id = changed_row.course_id '
      'where course.owner_id is not null order by changed_row.course_id';
  else
    v_query :=
      'select distinct changed.course_id from ('
      'select course_id from old_rows union select course_id from new_rows'
      ') changed join public.courses course on course.id = changed.course_id '
      'where course.owner_id is not null order by changed.course_id';
  end if;

  for v_course_id in execute v_query loop
    perform pg_advisory_xact_lock(hashtextextended(
      'catalog-submission-source:' || v_course_id::text, 0
    ));
    update private.catalog_course_submissions submission
    set status = 'stale', stale_reason = 'source_changed',
        reviewer_user_id = null, review_started_at = null, updated_at = now()
    where submission.source_course_id = v_course_id
      and submission.status in ('submitted', 'in_review');
  end loop;
  return null;
end;
$$;

drop trigger if exists catalog_submission_lock_personal_tree_insert
  on public.courses;
drop trigger if exists catalog_submission_lock_personal_tree_update
  on public.courses;
drop trigger if exists catalog_submission_lock_personal_tree_delete
  on public.courses;
drop trigger if exists catalog_submission_lock_personal_tree
  on public.courses;
create trigger catalog_submission_lock_personal_tree
before insert or update or delete on public.courses
for each row execute function private.lock_personal_course_for_catalog_submission();

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'modules', 'lessons', 'course_guides', 'guide_items',
    'lesson_topics', 'topic_statements', 'microsequences',
    'microsequence_dependencies', 'microsequence_statements', 'cards',
    'card_blocks', 'block_options', 'block_nodes', 'flow_nodes', 'flow_cases',
    'flow_practices', 'node_practices', 'node_practice_items', 'block_edges',
    'block_matrix_items', 'block_cells', 'block_points', 'block_lines',
    'block_highlights', 'card_refs'
  ] loop
    execute format(
      'drop trigger if exists catalog_submission_lock_personal_tree on public.%I',
      v_table
    );
    execute format(
      'create trigger catalog_submission_lock_personal_tree_insert '
      'after insert on public.%I referencing new table as new_rows '
      'for each statement execute function private.lock_personal_course_tree_statement()',
      v_table
    );
    execute format(
      'create trigger catalog_submission_lock_personal_tree_update '
      'after update on public.%I referencing old table as old_rows new table as new_rows '
      'for each statement execute function private.lock_personal_course_tree_statement()',
      v_table
    );
    execute format(
      'create trigger catalog_submission_lock_personal_tree_delete '
      'after delete on public.%I referencing old table as old_rows '
      'for each statement execute function private.lock_personal_course_tree_statement()',
      v_table
    );
  end loop;
end;
$$;

create or replace function private.catalog_submission_tree_counts(p_course_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_table text;
  v_count bigint;
  v_counts jsonb := '{}'::jsonb;
begin
  foreach v_table in array array[
    'modules', 'lessons', 'course_guides', 'guide_items', 'lesson_topics',
    'topic_statements', 'microsequences', 'microsequence_dependencies',
    'microsequence_statements', 'cards', 'card_blocks', 'block_options',
    'block_nodes', 'flow_nodes', 'flow_cases', 'flow_practices',
    'node_practices', 'node_practice_items', 'block_edges',
    'block_matrix_items', 'block_cells', 'block_points', 'block_lines',
    'block_highlights', 'card_refs'
  ] loop
    execute format('select count(*) from public.%I where course_id = $1', v_table)
      into v_count using p_course_id;
    v_counts := v_counts || jsonb_build_object(v_table, v_count);
  end loop;
  return v_counts;
end;
$$;

create or replace function private.validate_catalog_submission_course(p_course_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_errors jsonb;
  v_course public.courses%rowtype;
  v_valid boolean;
  v_hash text;
begin
  select * into v_course from public.courses course where course.id = p_course_id;
  if not found or v_course.deleted_at is not null then
    return jsonb_build_object(
      'valid', false,
      'publishable', false,
      'errors', jsonb_build_array(jsonb_build_object('code', 'course.missing'))
    );
  end if;

  -- This is the authorization-free editorial equivalent of
  -- public.validate_course_graph. The reviewer cannot read the author's
  -- private course directly, but acceptance must enforce the exact same
  -- structural and contract rules used for ordinary publication.
  with findings as (
    select 'course.empty' code, '$.modules' path,
      'Curso precisa ter ao menos um módulo.' message
    where not exists (
      select 1 from public.modules
      where course_id = p_course_id and deleted_at is null
    )
    union all
    select 'module.guide_missing', '$.modules[' || module.contract_key || '].guide',
      'Módulo precisa de guide.'
    from public.modules module
    where module.course_id = p_course_id and module.deleted_at is null
      and not exists (
        select 1 from public.course_guides guide
        where guide.module_id = module.id and guide.deleted_at is null
      )
    union all
    select 'module.lesson_missing', '$.modules[' || module.contract_key || '].lessons',
      'Módulo precisa ter ao menos uma lição.'
    from public.modules module
    where module.course_id = p_course_id and module.deleted_at is null
      and not exists (
        select 1 from public.lessons lesson
        where lesson.module_id = module.id and lesson.deleted_at is null
      )
    union all
    select 'lesson.guide_missing', '$.lessons[' || lesson.contract_key || '].guide',
      'Lição precisa de guide.'
    from public.lessons lesson
    where lesson.course_id = p_course_id and lesson.deleted_at is null
      and not exists (
        select 1 from public.course_guides guide
        where guide.lesson_id = lesson.id and guide.deleted_at is null
      )
    union all
    select 'lesson.microsequence_missing',
      '$.lessons[' || lesson.contract_key || '].microsequences',
      'Lição precisa ter ao menos uma microssequência.'
    from public.lessons lesson
    where lesson.course_id = p_course_id and lesson.deleted_at is null
      and not exists (
        select 1 from public.microsequences microsequence
        where microsequence.lesson_id = lesson.id
          and microsequence.deleted_at is null
      )
    union all
    select 'microsequence.cards_missing',
      '$.microsequences[' || microsequence.contract_key || '].cards',
      'Microssequência materializada precisa ter cards.'
    from public.microsequences microsequence
    where microsequence.course_id = p_course_id
      and microsequence.deleted_at is null
      and microsequence.status <> 'planned'
      and not exists (
        select 1 from public.cards card
        where card.microsequence_id = microsequence.id
          and card.deleted_at is null
      )
    union all
    select 'microsequence.not_ready',
      '$.microsequences[' || microsequence.contract_key || '].status',
      'Publicação exige todas as microssequências em ready.'
    from public.microsequences microsequence
    where microsequence.course_id = p_course_id
      and microsequence.deleted_at is null
      and microsequence.status <> 'ready'
    union all
    select 'dependency.not_previous',
      '$.microsequences[' || microsequence.contract_key || '].dependsOn',
      'Dependência precisa apontar para microssequência anterior da mesma lição.'
    from public.microsequence_dependencies dependency
    join public.microsequences microsequence
      on microsequence.id = dependency.microsequence_id
    join public.microsequences predecessor
      on predecessor.id = dependency.depends_on_microsequence_id
    where dependency.course_id = p_course_id
      and dependency.deleted_at is null
      and predecessor.position >= microsequence.position
    union all
    select 'card.primary_block_missing', '$.cards[' || card.contract_key || ']',
      'Card precisa de exatamente um bloco primário.'
    from public.cards card
    where card.course_id = p_course_id
      and card.deleted_at is null
      and card.resource <> 'composite'
      and (
        select count(*) from public.card_blocks block
        where block.card_id = card.id
          and block.role = 'primary'
          and block.deleted_at is null
      ) <> 1
    union all
    select 'card.composite_blocks_invalid',
      '$.cards[' || card.contract_key || '].blocks',
      'Card composite precisa de ao menos um bloco composite e nenhum bloco primário.'
    from public.cards card
    where card.course_id = p_course_id
      and card.deleted_at is null
      and card.resource = 'composite'
      and (
        (
          select count(*) from public.card_blocks block
          where block.card_id = card.id
            and block.role = 'composite'
            and block.deleted_at is null
        ) < 1
        or (
          select count(*) from public.card_blocks block
          where block.card_id = card.id
            and block.role = 'primary'
            and block.deleted_at is null
        ) <> 0
      )
    union all
    select 'card.primary_resource_mismatch',
      '$.cards[' || card.contract_key || '].resource',
      'Tipo do bloco primário diverge do resource do card.'
    from public.cards card
    join public.card_blocks block
      on block.card_id = card.id
      and block.role = 'primary'
      and block.deleted_at is null
    where card.course_id = p_course_id
      and card.deleted_at is null
      and card.resource <> 'composite'
      and block.block_type <> card.resource::text
    union all
    select 'contract.projection_mismatch', '$.cards[' || card.contract_key || ']',
      'Projeção relacional do card diverge dos campos públicos com presença explícita.'
    from public.cards card
    where card.course_id = p_course_id
      and card.deleted_at is null
      and (
        card.card_kind is distinct from card.kind
        or card.has_after is distinct from (card.after is not null)
      )
    union all
    select 'contract.projection_mismatch', '$.blocks[' || block.contract_key || ']',
      'Projeção relacional do bloco diverge dos campos públicos com presença explícita.'
    from public.card_blocks block
    where block.course_id = p_course_id
      and block.deleted_at is null
      and (
        block.is_primary is distinct from (block.role = 'primary')
        or block.region is distinct from case block.role
          when 'primary' then 'primary'
          when 'composite' then 'content'
          else 'after'
        end
        or block.has_value is distinct from (block.value is not null)
        or block.has_prompt is distinct from (block.prompt is not null)
        or block.has_question is distinct from (block.question is not null)
        or block.has_language is distinct from (block.language is not null)
        or block.has_code is distinct from (block.code is not null)
        or block.has_name is distinct from (block.name is not null)
        or block.has_divider_after_column is distinct from
          (block.divider_after_column is not null)
        or block.has_x_range is distinct from (block.x_range is not null)
        or block.has_y_range is distinct from (block.y_range is not null)
        or block.has_scale is distinct from (block.scale_k is not null)
        or block.has_result is distinct from (block.result_text is not null)
      )
    union all
    select 'choice.options_invalid', '$.blocks[' || block.contract_key || '].options',
      'Bloco choice precisa de 3 ou 4 opções e exatamente uma correta.'
    from public.card_blocks block
    where block.course_id = p_course_id
      and block.deleted_at is null
      and block.block_type = 'choice'
      and (
        (
          select count(*) from public.block_options option
          where option.block_id = block.id and option.deleted_at is null
        ) not between 3 and 4
        or (
          select count(*) from public.block_options option
          where option.block_id = block.id
            and option.deleted_at is null
            and option.is_correct
        ) <> 1
      )
    union all
    select 'grid.cell_out_of_bounds',
      '$.matrixItems[' || matrix_item.contract_key || '].cells',
      'Célula fora das dimensões declaradas.'
    from public.block_cells cell
    join public.block_matrix_items matrix_item
      on matrix_item.id = cell.matrix_item_id
    where cell.course_id = p_course_id
      and cell.deleted_at is null
      and (
        cell.row_index >= matrix_item.row_count
        or cell.column_index >= matrix_item.column_count
      )
    union all
    select 'flow.root_invalid', '$.blocks[' || block.contract_key || '].structure',
      'Flow precisa de uma única raiz sequence.'
    from public.card_blocks block
    where block.course_id = p_course_id
      and block.deleted_at is null
      and block.block_type = 'flow'
      and (
        select count(*) from public.flow_nodes node
        where node.block_id = block.id
          and node.node_kind = 'sequence'
          and node.parent_node_id is null
          and node.parent_case_id is null
          and node.deleted_at is null
      ) <> 1
    union all
    select position_error.code, position_error.path, position_error.message
    from private.position_findings(p_course_id) position_error
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object('code', code, 'path', path, 'message', message)
      order by code, path
    ),
    '[]'::jsonb
  )
  into v_errors
  from findings;

  v_valid := jsonb_array_length(v_errors) = 0;
  v_hash := private.course_content_hash(p_course_id);
  return jsonb_build_object(
    'valid', v_valid,
    'publishable', v_valid,
    'courseId', p_course_id,
    'contentHash', v_hash,
    'errors', v_errors
  );
end;
$$;

create or replace function private.require_catalog_submission_editor()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  perform 1
  from private.app_role_assignments assignment
  where assignment.user_id = v_user_id
    and assignment.role in ('owner', 'catalog_publisher')
    and assignment.active
  for share;
  if not found then
    raise exception 'Revisão editorial não autorizada.' using errcode = '42501';
  end if;
  return v_user_id;
end;
$$;

create or replace function private.mark_catalog_submission_stale()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_reason text;
begin
  if old.owner_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    v_reason := 'source_removed';
  elsif new.deleted_at is not null or new.status <> 'published' then
    v_reason := 'source_removed';
  elsif old.content_hash is distinct from new.content_hash then
    v_reason := 'source_changed';
  else
    return new;
  end if;

  update private.catalog_course_submissions submission
  set status = 'stale',
      stale_reason = v_reason,
      reviewer_user_id = null,
      review_started_at = null,
      updated_at = now()
  where submission.source_course_id = old.id
    and submission.status in ('submitted', 'in_review');
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists courses_mark_catalog_submission_stale
  on public.courses;
create trigger courses_mark_catalog_submission_stale
after update of content_hash, status, deleted_at on public.courses
for each row execute function private.mark_catalog_submission_stale();
drop trigger if exists courses_mark_catalog_submission_stale_before_delete
  on public.courses;
create trigger courses_mark_catalog_submission_stale_before_delete
before delete on public.courses
for each row execute function private.mark_catalog_submission_stale();

create or replace function public.submit_personal_course_to_catalog(
  p_submission_id uuid,
  p_course_id uuid,
  p_consent boolean,
  p_license_code text,
  p_attribution_text text,
  p_provenance_text text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
set statement_timeout = '60s'
as $$
declare
  v_user_id uuid := auth.uid();
  v_course public.courses%rowtype;
  v_existing private.catalog_course_submissions%rowtype;
  v_validation jsonb;
  v_license text := nullif(btrim(p_license_code), '');
  v_attribution text := nullif(btrim(p_attribution_text), '');
  v_provenance text := nullif(btrim(p_provenance_text), '');
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if p_submission_id is null or p_course_id is null or p_consent is distinct from true then
    raise exception 'O consentimento editorial explícito é obrigatório.' using errcode = '22023';
  end if;
  if v_license is null or v_license !~ '^[A-Za-z0-9][A-Za-z0-9.+-]{0,79}$'
     or v_attribution is null or char_length(v_attribution) > 1000
     or v_provenance is null or char_length(v_provenance) > 4000 then
    raise exception 'Licença, atribuição ou procedência inválida.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'catalog-submission-source:' || p_course_id::text, 0
  ));
  select * into v_existing
  from private.catalog_course_submissions submission
  where submission.id = p_submission_id
  for update;
  if found then
    if v_existing.author_user_id is distinct from v_user_id
       or v_existing.source_course_id is distinct from p_course_id
       or v_existing.license_code is distinct from v_license
       or v_existing.attribution_text is distinct from v_attribution
       or v_existing.provenance_text is distinct from v_provenance then
      raise exception 'submissionId reutilizado com conteúdo diferente.' using errcode = '23514';
    end if;
    return jsonb_build_object(
      'status', v_existing.status,
      'submissionId', v_existing.id,
      'sourceCourseId', v_existing.source_course_id,
      'idempotent', true
    );
  end if;

  select * into v_course
  from public.courses course
  where course.id = p_course_id
    and course.owner_id = v_user_id
    and course.status = 'published'
    and course.deleted_at is null
  for update;
  if not found then
    raise exception 'Curso pessoal indisponível para submissão.' using errcode = '42501';
  end if;
  if v_course.content_hash is null
     or v_course.content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'O curso pessoal não possui marcador íntegro.' using errcode = '23514';
  end if;
  v_validation := private.validate_catalog_submission_course(v_course.id);
  if not coalesce((v_validation->>'publishable')::boolean, false) then
    raise exception 'O curso pessoal ainda está incompleto.' using errcode = '23514';
  end if;
  if (v_validation->>'contentHash') is distinct from v_course.content_hash then
    raise exception 'O marcador do curso pessoal está desatualizado.' using errcode = '23514';
  end if;

  insert into private.catalog_course_submissions(
    id, author_user_id, source_course_id, source_content_hash,
    source_contract_key, source_title, license_code, attribution_text,
    provenance_text, consent_version, consented_at, status
  ) values (
    p_submission_id, v_user_id, v_course.id, v_course.content_hash,
    v_course.contract_key, v_course.title, v_license, v_attribution,
    v_provenance, 'catalog-submission-v1', now(), 'submitted'
  ) returning * into v_existing;

  return jsonb_build_object(
    'status', v_existing.status,
    'submissionId', v_existing.id,
    'sourceCourseId', v_existing.source_course_id,
    'submittedAt', v_existing.submitted_at,
    'idempotent', false
  );
end;
$$;

create or replace function public.list_my_catalog_submission_candidates()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
set statement_timeout = '30s'
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'courseId', candidate.id,
        'title', candidate.title,
        'contentHash', candidate.content_hash,
        'activeSubmissionId', candidate.submission_id,
        'activeSubmissionStatus', candidate.submission_status
      )) order by candidate.title, candidate.id)
      from (
        select course.id, course.title, course.content_hash,
          submission.id submission_id,
          submission.status submission_status
        from public.courses course
        cross join lateral (
          select private.validate_catalog_submission_course(course.id) result
        ) validation
        left join lateral (
          select offer.id, offer.status
          from private.catalog_course_submissions offer
          where offer.source_course_id = course.id
            and offer.status in ('submitted', 'in_review')
          order by offer.submitted_at desc, offer.id
          limit 1
        ) submission on true
        where course.owner_id = v_user_id
          and course.status = 'published'
          and course.deleted_at is null
          and course.content_hash ~ '^[0-9a-f]{64}$'
          and coalesce((validation.result->>'publishable')::boolean, false)
          and validation.result->>'contentHash' = course.content_hash
      ) candidate
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.list_my_catalog_submissions()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'submissionId', submission.id,
        'sourceCourseId', submission.source_course_id,
        'title', submission.source_title,
        'status', submission.status,
        'staleReason', submission.stale_reason,
        'officialCourseId', submission.official_course_id,
        'officialContractKey', submission.official_contract_key,
        'submittedAt', submission.submitted_at,
        'decidedAt', submission.decided_at
      )) order by submission.submitted_at desc, submission.id)
      from private.catalog_course_submissions submission
      where submission.author_user_id = v_user_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.list_catalog_submission_queue()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, auth
as $$
declare
  v_editor_id uuid;
begin
  v_editor_id := private.require_catalog_submission_editor();
  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'submissionId', submission.id,
        'authorUserId', submission.author_user_id,
        'sourceCourseId', submission.source_course_id,
        'title', submission.source_title,
        'sourceContractKey', submission.source_contract_key,
        'sourceContentHash', submission.source_content_hash,
        'license', submission.license_code,
        'attribution', submission.attribution_text,
        'provenance', submission.provenance_text,
        'status', submission.status,
        'submittedAt', submission.submitted_at,
        'reviewStartedAt', submission.review_started_at
      ) order by submission.submitted_at, submission.id)
      from private.catalog_course_submissions submission
      where submission.status in ('submitted', 'in_review')
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.start_catalog_submission_review(p_submission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, auth
as $$
declare
  v_editor_id uuid;
  v_submission private.catalog_course_submissions%rowtype;
begin
  v_editor_id := private.require_catalog_submission_editor();
  select * into v_submission
  from private.catalog_course_submissions submission
  where submission.id = p_submission_id
  for update;
  if not found then
    raise exception 'Submissão editorial inexistente.' using errcode = 'P0002';
  end if;
  if v_submission.status = 'in_review'
     and v_submission.reviewer_user_id = v_editor_id then
    return jsonb_build_object(
      'status', 'in_review', 'submissionId', v_submission.id, 'idempotent', true
    );
  end if;
  if v_submission.status <> 'submitted' then
    raise exception 'A submissão não está disponível para revisão.' using errcode = '23514';
  end if;
  update private.catalog_course_submissions submission
  set status = 'in_review', reviewer_user_id = v_editor_id,
      review_started_at = now(), updated_at = now()
  where submission.id = v_submission.id
  returning * into v_submission;
  return jsonb_build_object(
    'status', 'in_review', 'submissionId', v_submission.id, 'idempotent', false
  );
end;
$$;

create or replace function public.withdraw_catalog_submission(p_submission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_submission private.catalog_course_submissions%rowtype;
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  select * into v_submission
  from private.catalog_course_submissions submission
  where submission.id = p_submission_id
    and submission.author_user_id = v_user_id
  for update;
  if not found then
    raise exception 'Submissão editorial inexistente.' using errcode = 'P0002';
  end if;
  if v_submission.status = 'withdrawn' then
    return jsonb_build_object(
      'status', 'withdrawn', 'submissionId', v_submission.id, 'idempotent', true
    );
  end if;
  if v_submission.status not in ('submitted', 'in_review', 'stale') then
    raise exception 'A decisão editorial já não permite retirada.' using errcode = '23514';
  end if;
  update private.catalog_course_submissions submission
  set status = 'withdrawn', withdrawn_at = now(), reviewer_user_id = null,
      review_started_at = null, updated_at = now()
  where submission.id = v_submission.id
  returning * into v_submission;
  return jsonb_build_object(
    'status', 'withdrawn', 'submissionId', v_submission.id, 'idempotent', false
  );
end;
$$;

create or replace function public.decide_catalog_submission(
  p_submission_id uuid,
  p_decision text,
  p_collection_id uuid default null,
  p_official_contract_key text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
set statement_timeout = '90s'
as $$
declare
  v_editor_id uuid;
  v_source_id uuid;
  v_submission private.catalog_course_submissions%rowtype;
  v_source public.courses%rowtype;
  v_target_id uuid := gen_random_uuid();
  v_clone_id uuid := gen_random_uuid();
  v_contract_key text := nullif(btrim(p_official_contract_key), '');
  v_note text := nullif(btrim(p_note), '');
  v_source_validation jsonb;
  v_target_validation jsonb;
  v_source_counts jsonb;
  v_target_counts jsonb;
begin
  v_editor_id := private.require_catalog_submission_editor();
  if p_submission_id is null
     or p_decision is null
     or p_decision not in ('accept', 'reject') then
    raise exception 'Decisão editorial inválida.' using errcode = '22023';
  end if;

  -- Read only the source identity before locking.  It is rechecked after the
  -- per-course lock and row lock, preventing a lock-order inversion with a
  -- concurrent personal edit that marks the submission stale.
  select submission.source_course_id into v_source_id
  from private.catalog_course_submissions submission
  where submission.id = p_submission_id;
  if not found then
    raise exception 'Submissão editorial inexistente.' using errcode = 'P0002';
  end if;
  if v_source_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(
      'catalog-submission-source:' || v_source_id::text, 0
    ));
  end if;

  select * into v_submission
  from private.catalog_course_submissions submission
  where submission.id = p_submission_id
  for update;

  if v_submission.status = 'accepted' and p_decision = 'accept' then
    if v_submission.accepted_collection_id is distinct from p_collection_id
       or v_submission.official_contract_key is distinct from v_contract_key then
      raise exception 'A submissão já foi aceita com outro destino.' using errcode = '23514';
    end if;
    return jsonb_build_object(
      'status', 'accepted', 'submissionId', v_submission.id,
      'courseId', v_submission.official_course_id,
      'contractKey', v_submission.official_contract_key, 'idempotent', true
    );
  end if;
  if v_submission.status = 'rejected' and p_decision = 'reject' then
    return jsonb_build_object(
      'status', 'rejected', 'submissionId', v_submission.id, 'idempotent', true
    );
  end if;
  if v_submission.status not in ('submitted', 'in_review') then
    raise exception 'A submissão não admite nova decisão.' using errcode = '23514';
  end if;

  if p_decision = 'reject' then
    if v_note is null or char_length(v_note) > 4000 then
      raise exception 'A rejeição exige justificativa.' using errcode = '22023';
    end if;
    update private.catalog_course_submissions submission
    set status = 'rejected', reviewer_user_id = v_editor_id,
        decision_note = v_note, decided_at = now(), updated_at = now()
    where submission.id = v_submission.id
    returning * into v_submission;
    return jsonb_build_object(
      'status', 'rejected', 'submissionId', v_submission.id, 'idempotent', false
    );
  end if;

  if p_collection_id is null
     or v_contract_key is null
     or char_length(v_contract_key) > 160
     or v_contract_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     or (v_note is not null and char_length(v_note) > 4000) then
    raise exception 'Destino editorial inválido.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'catalog-promotion-contract:' || v_contract_key, 0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'catalog-promotion-official-position', 0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'catalog-promotion-collection:' || p_collection_id::text, 0
  ));
  perform 1
  from public.catalog_collections collection
  where collection.id = p_collection_id
    and collection.is_published
    and collection.deleted_at is null
  for share;
  if not found then
    raise exception 'Coleção pública indisponível.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.courses course
    where course.owner_id is null
      and course.contract_key = v_contract_key
      and course.deleted_at is null
  ) then
    raise exception 'O identificador oficial já existe.' using errcode = '23505';
  end if;

  select * into v_source
  from public.courses course
  where course.id = v_submission.source_course_id
    and course.owner_id = v_submission.author_user_id
    and course.status = 'published'
    and course.deleted_at is null
  for update;
  if not found then
    update private.catalog_course_submissions submission
    set status = 'stale', stale_reason = 'source_removed', updated_at = now()
    where submission.id = v_submission.id;
    return jsonb_build_object(
      'status', 'stale', 'reason', 'source_removed',
      'submissionId', v_submission.id
    );
  end if;
  if v_source.content_hash is distinct from v_submission.source_content_hash then
    update private.catalog_course_submissions submission
    set status = 'stale', stale_reason = 'source_changed', updated_at = now()
    where submission.id = v_submission.id;
    return jsonb_build_object(
      'status', 'stale', 'reason', 'source_changed',
      'submissionId', v_submission.id
    );
  end if;
  v_source_validation := private.validate_catalog_submission_course(v_source.id);
  if not coalesce((v_source_validation->>'publishable')::boolean, false) then
    update private.catalog_course_submissions submission
    set status = 'stale', stale_reason = 'source_invalid', updated_at = now()
    where submission.id = v_submission.id;
    return jsonb_build_object(
      'status', 'stale', 'reason', 'source_invalid',
      'submissionId', v_submission.id
    );
  end if;
  if (v_source_validation->>'contentHash') is distinct from
      v_submission.source_content_hash then
    update private.catalog_course_submissions submission
    set status = 'stale', stale_reason = 'source_changed', updated_at = now()
    where submission.id = v_submission.id;
    return jsonb_build_object(
      'status', 'stale', 'reason', 'source_changed',
      'submissionId', v_submission.id
    );
  end if;
  v_source_counts := private.catalog_submission_tree_counts(v_source.id);

  insert into public.courses(
    id, owner_id, source_course_id, status, contract_key, title, goal,
    contract_scope, publication_seq, content_hash, project_id, position
  ) values (
    v_target_id, null, null, 'draft', v_contract_key, v_source.title,
    v_source.goal, v_source.contract_scope, 0, v_source.content_hash,
    gen_random_uuid(), coalesce((
      select max(course.position) + 1
      from public.courses course
      where course.owner_id is null and course.deleted_at is null
    ), 0)
  );

  perform set_config('aralearn.suppress_sync_changes', 'on', true);
  perform private.clone_personal_course_tree(
    v_clone_id, v_source.id, v_target_id
  );
  v_target_counts := private.catalog_submission_tree_counts(v_target_id);
  if v_target_counts is distinct from v_source_counts
     or exists (
       select 1 from private.personal_course_clone_map map
       where map.clone_id = v_clone_id and map.source_id = map.target_id
     ) then
    raise exception 'A cópia editorial não preservou integralmente a árvore.'
      using errcode = '23514';
  end if;
  v_target_validation := private.validate_catalog_submission_course(v_target_id);
  if not coalesce((v_target_validation->>'publishable')::boolean, false)
     or coalesce(v_target_validation->>'contentHash', '') !~ '^[0-9a-f]{64}$' then
    raise exception 'A cópia editorial não passou pela validação integral.'
      using errcode = '23514';
  end if;
  delete from private.personal_course_clone_map map where map.clone_id = v_clone_id;
  perform set_config('aralearn.suppress_sync_changes', 'off', true);

  update public.courses course
  set status = 'published', publication_seq = 1,
      content_hash = v_target_validation->>'contentHash',
      updated_at = now()
  where course.id = v_target_id;

  -- The publication trigger gives a new official course a deterministic
  -- default.  The editor's explicit classification replaces it atomically.
  delete from public.catalog_collection_courses item
  where item.course_id = v_target_id;
  insert into public.catalog_collection_courses(collection_id, course_id, position)
  values (
    p_collection_id, v_target_id,
    coalesce((
      select max(item.position) + 1
      from public.catalog_collection_courses item
      where item.collection_id = p_collection_id and item.deleted_at is null
    ), 0)
  );

  update private.catalog_course_submissions submission
  set status = 'accepted', reviewer_user_id = v_editor_id,
      decision_note = v_note, accepted_collection_id = p_collection_id,
      official_course_id = v_target_id,
      official_contract_key = v_contract_key,
      decided_at = now(), updated_at = now()
  where submission.id = v_submission.id
  returning * into v_submission;

  return jsonb_build_object(
    'status', 'accepted', 'submissionId', v_submission.id,
    'courseId', v_target_id, 'contractKey', v_contract_key,
    'collectionId', p_collection_id, 'idempotent', false
  );
end;
$$;

revoke all on table private.catalog_course_submissions
  from public, anon, authenticated, service_role;
revoke all on function private.lock_personal_course_for_catalog_submission()
  from public, anon, authenticated, service_role;
revoke all on function private.lock_personal_course_tree_statement()
  from public, anon, authenticated, service_role;
revoke all on function private.catalog_submission_tree_counts(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.validate_catalog_submission_course(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.require_catalog_submission_editor()
  from public, anon, authenticated, service_role;
revoke all on function private.mark_catalog_submission_stale()
  from public, anon, authenticated, service_role;

revoke all on function public.submit_personal_course_to_catalog(
  uuid, uuid, boolean, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.list_my_catalog_submission_candidates()
  from public, anon, authenticated, service_role;
revoke all on function public.list_my_catalog_submissions()
  from public, anon, authenticated, service_role;
revoke all on function public.list_catalog_submission_queue()
  from public, anon, authenticated, service_role;
revoke all on function public.start_catalog_submission_review(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.withdraw_catalog_submission(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.decide_catalog_submission(uuid, text, uuid, text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.submit_personal_course_to_catalog(
  uuid, uuid, boolean, text, text, text
) to authenticated;
grant execute on function public.list_my_catalog_submission_candidates()
  to authenticated;
grant execute on function public.list_my_catalog_submissions() to authenticated;
grant execute on function public.list_catalog_submission_queue() to authenticated;
grant execute on function public.start_catalog_submission_review(uuid) to authenticated;
grant execute on function public.withdraw_catalog_submission(uuid) to authenticated;
grant execute on function public.decide_catalog_submission(
  uuid, text, uuid, text, text
) to authenticated;

comment on table private.catalog_course_submissions is
  'Ofertas consentidas de cursos pessoais; a decisão clona a fonte sem transferir sua posse.';
comment on function public.list_my_catalog_submission_candidates() is
  'Lista apenas metadados dos cursos pessoais íntegros que a conta pode oferecer ao catálogo.';
comment on function public.decide_catalog_submission(uuid, text, uuid, text, text) is
  'Aceita ou rejeita uma oferta; a aceitação valida e publica uma nova árvore em uma única transação.';

commit;
