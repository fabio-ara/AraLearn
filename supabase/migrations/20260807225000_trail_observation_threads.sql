-- Observacoes pessoais continuam no estado leve e offline de Trilhas. Esta
-- tabela guarda somente a thread editorial necessaria para resposta e triagem,
-- sem copiar card, titulo ou corpo da observacao.

begin;

create table private.trail_observation_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trail_item_id uuid not null
    references private.trail_items(id) on update cascade on delete cascade,
  card_id text not null,
  status text not null default 'open',
  response text,
  responded_by uuid references auth.users(id) on delete set null,
  responded_at timestamptz,
  resolution_note text,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  correction_request_id text,
  correction_entity_path text[],
  correction_linked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trail_observation_threads_owner_card_v1
    unique(user_id, trail_item_id, card_id),
  constraint trail_observation_threads_state_fk_v1
    foreign key(user_id, trail_item_id)
    references public.trail_personal_states(user_id, trail_item_id)
    on update cascade on delete cascade,
  constraint trail_observation_threads_card_v1 check (
    char_length(card_id) <= 240
    and nullif(btrim(card_id), '') is not null
    and card_id = btrim(card_id)
    and card_id !~ '[[:cntrl:]]'
  ),
  constraint trail_observation_threads_status_v1 check (
    status in ('open', 'considered', 'resolved', 'incorporated')
  ),
  constraint trail_observation_threads_response_v1 check (
    response is null or (btrim(response) <> '' and char_length(response) <= 2000)
  ),
  constraint trail_observation_threads_response_actor_v1 check (
    (response is null and responded_by is null and responded_at is null)
    or (response is not null and responded_at is not null)
  ),
  constraint trail_observation_threads_resolution_v1 check (
    resolution_note is null or char_length(resolution_note) <= 1000
  ),
  constraint trail_observation_threads_resolution_actor_v1 check (
    (resolved_at is null and resolved_by is null)
    or resolved_at is not null
  ),
  constraint trail_observation_threads_correction_request_v1 check (
    correction_request_id is null
    or correction_request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
  ),
  constraint trail_observation_threads_correction_path_v1 check (
    (correction_request_id is null and correction_entity_path is null
      and correction_linked_at is null)
    or (
      correction_request_id is not null
      and cardinality(correction_entity_path) between 1 and 5
      and correction_linked_at is not null
    )
  )
);

create index trail_observation_threads_triage_v1_idx
  on private.trail_observation_threads(
    trail_item_id, status, updated_at desc, id desc
  );
revoke all on table private.trail_observation_threads
  from public, anon, authenticated, service_role;

-- O estado pessoal ja recebeu o texto corrente em 20260807220000. Reutilizar o
-- UUID antigo preserva links externos e os metadados editoriais que nao cabem
-- no documento offline.
insert into private.trail_observation_threads(
  id, user_id, trail_item_id, card_id, status,
  response, responded_by, responded_at,
  resolution_note, resolved_by, resolved_at,
  correction_request_id, correction_entity_path, correction_linked_at,
  created_at, updated_at
)
select distinct on (comment.user_id, item.id, comment.card_key)
  comment.id, comment.user_id, item.id, comment.card_key,
  coalesce(comment.status, 'open'),
  comment.response, comment.responded_by, comment.responded_at,
  comment.resolution_note, comment.resolved_by, comment.resolved_at,
  comment.correction_request_id, comment.correction_entity_path,
  comment.correction_linked_at, comment.created_at, comment.updated_at
from public.card_comments comment
join private.trail_item_courses alias on alias.course_id = comment.course_id
join private.trail_items item on item.id = alias.trail_item_id
join public.trail_personal_states state_row
  on state_row.user_id = comment.user_id
 and state_row.trail_item_id = item.id
where nullif(comment.course_key, '') is not null
  and nullif(comment.module_key, '') is not null
  and nullif(comment.lesson_key, '') is not null
  and nullif(comment.microsequence_key, '') is not null
  and nullif(comment.card_key, '') is not null
  and state_row.state#>array['observations', comment.card_key] is not null
order by comment.user_id, item.id, comment.card_key,
  comment.updated_at desc, comment.id desc;

-- Garante a invariavel mesmo para um estado importado que nao veio da tabela
-- relacional antiga.
insert into private.trail_observation_threads(
  user_id, trail_item_id, card_id, created_at, updated_at
)
select state_row.user_id, state_row.trail_item_id, observation.key,
  coalesce((observation.value->>'updatedAt')::timestamptz, state_row.created_at),
  coalesce((observation.value->>'updatedAt')::timestamptz, state_row.updated_at)
from public.trail_personal_states state_row
cross join lateral jsonb_each(state_row.state->'observations') observation
on conflict(user_id, trail_item_id, card_id) do nothing;

create function private.trail_observation_target_available_v1(
  p_trail_item_id uuid,
  p_card_id text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select exists(
    select 1
    from private.trail_items item
    where item.id = p_trail_item_id
      and (
        item.workspace_id is null
        or exists(
          with recursive lineage as (
            select entity.entity_type, entity.entity_id,
              entity.parent_type, entity.parent_id
            from private.authoring_workspace_entities entity
            where entity.workspace_id = item.workspace_id
              and entity.entity_type = 'card'
              and entity.entity_id = p_card_id
            union all
            select parent.entity_type, parent.entity_id,
              parent.parent_type, parent.parent_id
            from lineage child
            join private.authoring_workspace_entities parent
              on parent.workspace_id = item.workspace_id
             and parent.entity_type = child.parent_type
             and parent.entity_id = child.parent_id
            where child.entity_type <> 'course'
          )
          select 1 from lineage
          where entity_type = 'course'
            and entity_id = item.workspace_course_id
        )
      )
  )
$function$;

create function private.current_authoring_entity_path_v1(
  p_workspace_id uuid,
  p_entity_type text,
  p_entity_id text
)
returns text[]
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  with recursive lineage as (
    select entity.entity_type, entity.entity_id,
      entity.parent_type, entity.parent_id,
      array[entity.entity_id]::text[] as entity_path
    from private.authoring_workspace_entities entity
    where entity.workspace_id = p_workspace_id
      and entity.entity_type = p_entity_type
      and entity.entity_id = p_entity_id
    union all
    select parent.entity_type, parent.entity_id,
      parent.parent_type, parent.parent_id,
      array_prepend(parent.entity_id, child.entity_path)
    from lineage child
    join private.authoring_workspace_entities parent
      on parent.workspace_id = p_workspace_id
     and parent.entity_type = child.parent_type
     and parent.entity_id = child.parent_id
    where child.entity_type <> 'course'
  )
  select entity_path from lineage
  where entity_type = 'course'
  limit 1
$function$;

revoke all on function private.trail_observation_target_available_v1(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function private.current_authoring_entity_path_v1(uuid, text, text)
  from public, anon, authenticated, service_role;

-- O estado remoto devolve ao proprio estudante a thread corrente. Esses
-- campos sao uma projecao somente leitura e nunca voltam em uma operacao set.
create or replace function public.load_trail_personal_state_v1(p_trail_item_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $function$
declare
  v_user_id uuid := auth.uid();
  v_row public.trail_personal_states%rowtype;
  v_observations jsonb;
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if p_trail_item_id is null
     or not private.trail_item_accessible_v1(p_trail_item_id, v_user_id) then
    raise exception 'Item inexistente ou inacessivel.' using errcode = '42501';
  end if;
  select * into v_row from public.trail_personal_states state_row
  where state_row.user_id = v_user_id
    and state_row.trail_item_id = p_trail_item_id;
  if not found then return null; end if;
  select coalesce(jsonb_object_agg(
    observation.key,
    observation.value || jsonb_strip_nulls(jsonb_build_object(
      'commentId', thread.id,
      'status', thread.status,
      'response', thread.response,
      'resolutionNote', thread.resolution_note,
      'respondedAt', thread.responded_at,
      'resolvedAt', thread.resolved_at,
      'correction', case when thread.correction_request_id is null then null
        else jsonb_build_object(
          'requestId', thread.correction_request_id,
          'entityPath', thread.correction_entity_path,
          'linkedAt', thread.correction_linked_at
        ) end
    ))
  ), '{}'::jsonb) into v_observations
  from jsonb_each(v_row.state->'observations') observation
  join private.trail_observation_threads thread
    on thread.user_id = v_user_id
   and thread.trail_item_id = p_trail_item_id
   and thread.card_id = observation.key;
  return jsonb_build_object(
    'trailItemId', v_row.trail_item_id,
    'revision', v_row.revision,
    'state', jsonb_set(v_row.state, '{observations}', v_observations, true),
    'updatedAt', v_row.updated_at
  );
end;
$function$;

create or replace function public.mutate_trail_personal_state_v1(
  p_trail_item_id uuid,
  p_expected_revision bigint,
  p_operations jsonb,
  p_mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $function$
declare
  v_user_id uuid := auth.uid();
  v_hash text;
  v_receipt private.trail_personal_state_receipts%rowtype;
  v_row public.trail_personal_states%rowtype;
  v_state jsonb;
  v_operation jsonb;
  v_kind text;
  v_collection text;
  v_path text;
  v_json_path text[];
  v_completed_card_count integer;
  v_has_observation_operations boolean;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if p_trail_item_id is null or p_mutation_id is null
     or p_expected_revision is null or p_expected_revision < 0
     or jsonb_typeof(p_operations) <> 'array'
     or jsonb_array_length(p_operations) not between 1 and 512
     or pg_column_size(p_operations) > 65536 then
    raise exception 'Mutação do estado pessoal inválida.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'trail-item:' || p_trail_item_id::text, 0
  ));
  if not private.trail_item_accessible_v1(p_trail_item_id, v_user_id) then
    raise exception 'Item inexistente ou inacessivel.' using errcode = '42501';
  end if;
  select exists(
    select 1 from jsonb_array_elements(p_operations) operation
    where operation->>'collection' = 'observations'
  ) into v_has_observation_operations;
  if v_has_observation_operations and not (
    exists(
      select 1
      from private.trail_item_courses alias
      join public.user_course_selections selection
        on selection.course_id = alias.course_id
      join public.courses course on course.id = selection.course_id
      where alias.trail_item_id = p_trail_item_id
        and selection.user_id = v_user_id
        and course.status = 'published'
        and course.deleted_at is null
        and course.document_storage_enabled
    )
    or exists(
      select 1 from private.trail_items item
      where item.id = p_trail_item_id
        and item.workspace_id is not null
        and private.educational_workspace_can_v1(
          item.workspace_id, v_user_id, 'comment'
        )
    )
  ) then
    raise exception 'Observação exige participação ou seleção ativa.'
      using errcode = '42501';
  end if;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'trailItemId', p_trail_item_id,
    'expectedRevision', p_expected_revision,
    'operations', p_operations
  )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'trail-state:' || v_user_id::text || ':' || p_mutation_id::text, 0
  ));
  delete from private.trail_personal_state_receipts receipt
  where receipt.user_id = v_user_id
    and receipt.mutation_id = p_mutation_id
    and receipt.expires_at <= statement_timestamp();
  with expired as materialized (
    select receipt.ctid
    from private.trail_personal_state_receipts receipt
    where receipt.expires_at <= statement_timestamp()
    order by receipt.expires_at, receipt.user_id, receipt.mutation_id
    limit 256
    for update skip locked
  )
  delete from private.trail_personal_state_receipts receipt
  using expired
  where receipt.ctid = expired.ctid;
  select * into v_receipt
  from private.trail_personal_state_receipts receipt
  where receipt.user_id = v_user_id and receipt.mutation_id = p_mutation_id;
  if found then
    if v_receipt.request_hash <> v_hash
       or v_receipt.trail_item_id <> p_trail_item_id then
      raise exception 'mutationId reutilizado com estado incompativel.'
        using errcode = '23514';
    end if;
    select * into v_row
    from public.trail_personal_states state_row
    where state_row.user_id = v_user_id
      and state_row.trail_item_id = p_trail_item_id;
    if not found then
      raise exception 'Recibo sem estado pessoal corrente.' using errcode = '23514';
    end if;
    return jsonb_build_object(
      'trailItemId', v_row.trail_item_id,
      'revision', v_row.revision,
      'updatedAt', v_row.updated_at,
      'idempotent', true
    );
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'trail-state-row:' || v_user_id::text || ':' || p_trail_item_id::text, 0
  ));
  select * into v_row
  from public.trail_personal_states state_row
  where state_row.user_id = v_user_id
    and state_row.trail_item_id = p_trail_item_id
  for update;
  if not found then
    if p_expected_revision <> 0 then
      raise exception 'O estado pessoal mudou; releia antes de salvar.'
        using errcode = '40001';
    end if;
    v_state := jsonb_build_object(
      'version', 1,
      'progress', jsonb_build_object(
        'version', 3, 'lessons', '{}'::jsonb
      ),
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

  for v_operation in select value from jsonb_array_elements(p_operations)
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
       or v_collection not in (
         'progress.lessons', 'reviewMarks', 'observations'
       )
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
           or not (v_operation->'value' ? 'category')
           or not (v_operation->'value' ? 'body')
           or not (v_operation->'value' ? 'updatedAt')
           or jsonb_typeof(v_operation#>'{value,category}') <> 'string'
           or jsonb_typeof(v_operation#>'{value,body}') <> 'string'
           or jsonb_typeof(v_operation#>'{value,updatedAt}') <> 'string'
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
  if not private.valid_trail_personal_state_v1(v_state) then
    raise exception 'A mutação produziria estado pessoal inválido.'
      using errcode = '22023';
  end if;
  select coalesce(sum(jsonb_array_length(lesson.value->'completedCardIds')), 0)::integer
  into v_completed_card_count
  from jsonb_each(coalesce(v_state#>'{progress,lessons}', '{}'::jsonb)) lesson(path, value);

  if v_row.user_id is null then
    insert into public.trail_personal_states(
      user_id, trail_item_id, revision, completed_card_count, state
    ) values(
      v_user_id, p_trail_item_id, 1, v_completed_card_count, v_state
    ) returning * into v_row;
  else
    update public.trail_personal_states state_row
    set revision = state_row.revision + 1,
        completed_card_count = v_completed_card_count,
        state = v_state,
        updated_at = now()
    where state_row.user_id = v_user_id
      and state_row.trail_item_id = p_trail_item_id
    returning * into v_row;
  end if;

  -- A thread nasce e morre na mesma transacao da observacao. O aluno nunca
  -- envia status, resposta ou vinculo editorial.
  for v_operation in
    select value from jsonb_array_elements(p_operations)
    where value->>'collection' = 'observations'
  loop
    v_path := v_operation->>'path';
    if v_operation->>'kind' = 'delete' then
      delete from private.trail_observation_threads thread
      where thread.user_id = v_user_id
        and thread.trail_item_id = p_trail_item_id
        and thread.card_id = v_path;
    else
      insert into private.trail_observation_threads(
        user_id, trail_item_id, card_id, created_at, updated_at
      ) values(
        v_user_id, p_trail_item_id, v_path, now(), now()
      )
      on conflict(user_id, trail_item_id, card_id) do update
        set status = 'open',
            response = null,
            responded_by = null,
            responded_at = null,
            resolution_note = null,
            resolved_by = null,
            resolved_at = null,
            correction_request_id = null,
            correction_entity_path = null,
            correction_linked_at = null,
            updated_at = now();
    end if;
  end loop;

  v_result := jsonb_build_object(
    'trailItemId', v_row.trail_item_id,
    'revision', v_row.revision,
    'updatedAt', v_row.updated_at,
    'idempotent', false
  );
  insert into private.trail_personal_state_receipts(
    user_id, mutation_id, trail_item_id, request_hash,
    result_revision, result_updated_at
  ) values(
    v_user_id, p_mutation_id, p_trail_item_id, v_hash,
    v_row.revision, v_row.updated_at
  );
  return v_result;
end;
$function$;

-- Submissões encerradas preservam seus metadados, mas não prendem para sempre
-- a cópia privada nem seu artefato. Ciclos ainda corrigíveis continuam com a
-- origem obrigatória.
alter table private.catalog_review_submissions
  drop constraint if exists catalog_review_submissions_source_course_id_fkey;
alter table private.catalog_review_submissions
  alter column source_course_id drop not null;
alter table private.catalog_review_submissions
  add constraint catalog_review_submissions_source_course_id_fkey
  foreign key(source_course_id) references public.courses(id) on delete set null;
alter table private.catalog_review_submissions
  add constraint catalog_review_submissions_live_source_v1 check(
    status not in ('submitted','in_review','changes_requested')
    or source_course_id is not null
  );
alter table private.catalog_review_submissions
  drop constraint if exists catalog_review_submissions_artifact_lifecycle_v5;
update private.catalog_review_submissions submission
set source_course_id = null,
    artifact_hash = null,
    updated_at = now()
where submission.status in ('rejected','accepted','withdrawn','superseded');
do $block$
begin
  if exists(
    select 1 from private.catalog_review_submissions submission
    where submission.status in ('submitted','in_review')
      and submission.artifact_hash is null
  ) then
    raise exception 'Submissão ativa sem artefato recuperável.'
      using errcode = '23514';
  end if;
end;
$block$;
alter table private.catalog_review_submissions
  add constraint catalog_review_submissions_artifact_lifecycle_v5 check(
    (
      status in ('submitted','in_review')
      and artifact_hash is not null
    ) or (
      status = 'changes_requested'
    ) or (
      status in ('rejected','accepted','withdrawn','superseded')
      and artifact_hash is null
    )
  );

create function private.clear_changes_requested_artifact_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if new.status = 'changes_requested' then
    new.artifact_hash := null;
  end if;
  return new;
end;
$function$;

create trigger catalog_review_submission_clear_changes_artifact_v1
before update of status, artifact_hash on private.catalog_review_submissions
for each row execute function private.clear_changes_requested_artifact_v1();

create function private.supersede_changes_requested_submission_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  update private.catalog_review_submissions submission
  set status = 'superseded',
      source_course_id = null,
      artifact_hash = null,
      reviewer_id = null,
      review_started_at = null,
      review_workspace_id = null,
      claim_expires_at = null,
      reviewer_note = coalesce(
        submission.reviewer_note,
        'Submissão substituída por uma revisão corrigida.'
      ),
      decided_at = coalesce(submission.decided_at, now()),
      updated_at = now()
  where submission.author_id = new.author_id
    and submission.source_course_id = new.source_course_id
    and submission.status = 'changes_requested';
  return new;
end;
$function$;

create trigger catalog_review_submission_supersede_changes_v1
before insert on private.catalog_review_submissions
for each row execute function private.supersede_changes_requested_submission_v1();

create function private.guard_active_review_source_course_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  if not exists(
    select 1 from private.catalog_review_submissions submission
    where submission.source_course_id = old.id
      and submission.status in ('submitted','in_review','changes_requested')
  ) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'O curso possui submissão editorial ativa.'
      using errcode = 'AS409';
  end if;
  if old.status = 'published' and old.deleted_at is null
     and old.document_storage_enabled
     and not (
       new.status = 'published' and new.deleted_at is null
       and new.document_storage_enabled
     ) then
    raise exception 'O curso possui submissão editorial ativa.'
      using errcode = 'AS409';
  end if;
  return new;
end;
$function$;

create trigger courses_guard_active_review_source_v1
before update of status, deleted_at, document_storage_enabled or delete
on public.courses
for each row execute function private.guard_active_review_source_course_v1();

create function private.consolidate_catalog_root_v1(
  p_workspace_id uuid,
  p_workspace_course_id text,
  p_catalog_course_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_private_course_id uuid;
begin
  for v_private_course_id in
    select publication.course_id
    from private.authoring_workspace_publications publication
    join public.courses course on course.id = publication.course_id
    where publication.workspace_id = p_workspace_id
      and publication.workspace_course_id = p_workspace_course_id
      and publication.target = 'private'
      and publication.course_id <> p_catalog_course_id
      and course.owner_id is not null
    order by publication.course_id
  loop
    -- A seleção substituta existe antes da remoção; assim o gatilho de cleanup
    -- nunca interpreta a troca de alias como perda temporária de autoridade.
    insert into public.user_course_selections(
      id, user_id, course_id, position, created_at, updated_at
    )
    select gen_random_uuid(), selection.user_id, p_catalog_course_id,
      selection.position, selection.created_at, now()
    from public.user_course_selections selection
    where selection.course_id = v_private_course_id
    on conflict(user_id, course_id) do update set
      position = least(
        public.user_course_selections.position, excluded.position
      ),
      updated_at = now();

    delete from private.authoring_workspace_publications publication
    where publication.workspace_id = p_workspace_id
      and publication.workspace_course_id = p_workspace_course_id
      and publication.target = 'private'
      and publication.course_id = v_private_course_id;
    update private.authoring_workspaces workspace
    set source_course_id = null,
        source_revision_hash = null,
        updated_at = now()
    where workspace.source_course_id = v_private_course_id;
    delete from public.user_course_selections selection
    where selection.course_id = v_private_course_id;
    delete from private.trail_item_courses alias
    where alias.course_id = v_private_course_id;
    update private.trail_items item
    set course_id = p_catalog_course_id, updated_at = now()
    where item.workspace_id = p_workspace_id
      and item.workspace_course_id = p_workspace_course_id;

    if not exists(
      select 1 from private.catalog_review_submissions submission
      where submission.source_course_id = v_private_course_id
        and submission.status in ('submitted','in_review','changes_requested')
    ) then
      update private.catalog_review_submissions submission
      set source_course_id = null,
          artifact_hash = null,
          updated_at = now()
      where submission.source_course_id = v_private_course_id;
      delete from public.courses course
      where course.id = v_private_course_id and course.owner_id is not null;
    end if;
  end loop;
end;
$function$;

create function private.release_terminal_submission_source_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_source_course_id uuid := new.source_course_id;
begin
  if v_source_course_id is null
     or new.status in ('submitted','in_review','changes_requested') then
    return new;
  end if;
  update private.catalog_review_submissions submission
  set source_course_id = null,
      artifact_hash = null,
      updated_at = now()
  where submission.id = new.id and submission.source_course_id is not null;
  update private.authoring_workspaces workspace
  set source_course_id = null,
      source_revision_hash = null,
      updated_at = now()
  where workspace.source_course_id = v_source_course_id;
  if not exists(
    select 1 from private.catalog_review_submissions submission
    where submission.source_course_id = v_source_course_id
      and submission.status in ('submitted','in_review','changes_requested')
  ) and new.status = 'accepted' and not exists(
    select 1 from private.trail_item_courses alias
    where alias.course_id = v_source_course_id
  ) then
    delete from public.courses course
    where course.id = v_source_course_id and course.owner_id is not null;
  end if;
  return new;
end;
$function$;

create trigger catalog_review_submission_release_source_v1
after update of status on private.catalog_review_submissions
for each row execute function private.release_terminal_submission_source_v1();

-- A publicacao pode fundir a identidade provisoria e a identidade do curso.
-- A thread acompanha a mesma regra de precedencia do JSON: o item mantido vence
-- quando o mesmo usuario ja observou o mesmo caminho nos dois lados.
create or replace function private.link_workspace_publication_trail_item_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_workspace_item private.trail_items%rowtype;
  v_course_item private.trail_items%rowtype;
  v_source_course_id uuid;
  v_keep_id uuid;
  v_drop_id uuid;
  v_locked_workspace_item_id uuid;
  v_locked_course_item_id uuid;
  v_lock_trail_item_id uuid;
  v_owner_id uuid;
  v_affected_paths jsonb;
  v_affected_path jsonb;
begin
  -- Duas publicações da mesma raiz não podem iniciar fusões concorrentes.
  perform pg_advisory_xact_lock(hashtextextended(
    'trail-root:' || new.workspace_id::text || ':' || new.workspace_course_id,
    0
  ));
  select * into v_workspace_item from private.trail_items item
  where item.workspace_id = new.workspace_id
    and item.workspace_course_id = new.workspace_course_id;
  select item.* into v_course_item
  from private.trail_item_courses alias
  join private.trail_items item on item.id = alias.trail_item_id
  where alias.course_id = new.course_id;
  v_locked_workspace_item_id := v_workspace_item.id;
  v_locked_course_item_id := v_course_item.id;

  -- Lifecycle de curso obtém o row lock do curso antes de chegar ao cleanup do
  -- trailItem. Repetir course -> owner -> item aqui evita ciclo entre uma
  -- publicação que consolida a cópia privada e um archive/delete concorrente.
  perform 1
  from public.courses course
  where course.id = new.course_id
     or course.id in (
       select publication.course_id
       from private.authoring_workspace_publications publication
       where publication.workspace_id = new.workspace_id
         and publication.workspace_course_id = new.workspace_course_id
     )
  order by course.id
  for update;

  -- `mutate_trails_v1` usa owner -> item. A fusão segue a mesma ordem para
  -- bloquear movimentos de placements sem criar ciclo de espera.
  for v_owner_id in
    select distinct placement.owner_id
    from public.study_path_items placement
    where placement.trail_item_id in (v_workspace_item.id, v_course_item.id)
    order by placement.owner_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(
      'trail-owner:' || v_owner_id::text, 0
    ));
  end loop;
  for v_lock_trail_item_id in
    select lock_id
    from (values (v_workspace_item.id), (v_course_item.id)) lock_row(lock_id)
    where lock_id is not null
    group by lock_id
    order by lock_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(
      'trail-item:' || v_lock_trail_item_id::text, 0
    ));
  end loop;

  -- Releia sob row locks depois dos advisory locks: lifecycle e outra mutação
  -- podem ter mudado um alias enquanto esta transação aguardava.
  select * into v_workspace_item from private.trail_items item
  where item.workspace_id = new.workspace_id
    and item.workspace_course_id = new.workspace_course_id
  for update;
  select item.* into v_course_item
  from private.trail_item_courses alias
  join private.trail_items item on item.id = alias.trail_item_id
  where alias.course_id = new.course_id
  for update;
  if v_workspace_item.id is distinct from v_locked_workspace_item_id
     or v_course_item.id is distinct from v_locked_course_item_id then
    raise exception 'A identidade de Trilhas mudou durante a publicação.'
      using errcode = '40001';
  end if;
  if v_workspace_item.id is null then
    insert into private.trail_items(workspace_id, workspace_course_id)
    values(new.workspace_id, new.workspace_course_id)
    returning * into v_workspace_item;
  end if;
  if v_course_item.id is null then
    insert into private.trail_item_courses(course_id, trail_item_id)
    values(new.course_id, v_workspace_item.id)
    on conflict(course_id) do update
      set trail_item_id = excluded.trail_item_id;
    update private.trail_items
    set course_id = case when new.target = 'catalog' or course_id is null
          then new.course_id else course_id end,
        updated_at = now()
    where id = v_workspace_item.id;
    if new.target = 'catalog' then
      perform private.consolidate_catalog_root_v1(
        new.workspace_id, new.workspace_course_id, new.course_id
      );
    end if;
    return new;
  end if;
  if v_workspace_item.id = v_course_item.id then
    update private.trail_items
    set course_id = case when new.target = 'catalog' or course_id is null
          then new.course_id else course_id end,
        updated_at = now()
    where id = v_workspace_item.id;
    if new.target = 'catalog' then
      perform private.consolidate_catalog_root_v1(
        new.workspace_id, new.workspace_course_id, new.course_id
      );
    end if;
    return new;
  end if;
  select workspace.source_course_id into v_source_course_id
  from private.authoring_workspaces workspace where workspace.id = new.workspace_id;
  if v_source_course_id = new.course_id then
    v_keep_id := v_course_item.id;
    v_drop_id := v_workspace_item.id;
  else
    v_keep_id := v_workspace_item.id;
    v_drop_id := v_course_item.id;
  end if;

  -- O lock por item impede novas escritas; os row locks antecipados tornam a
  -- leitura que alimenta o merge e os deletes seguintes uma única fotografia
  -- serializada também para threads e organização.
  perform 1
  from public.trail_personal_states state_row
  where state_row.trail_item_id in (v_keep_id, v_drop_id)
  order by state_row.user_id, state_row.trail_item_id
  for update;
  perform 1
  from private.trail_observation_threads thread
  where thread.trail_item_id in (v_keep_id, v_drop_id)
  order by thread.user_id, thread.card_id, thread.id
  for update;
  perform 1
  from public.study_path_items placement
  where placement.trail_item_id in (v_keep_id, v_drop_id)
  order by placement.owner_id, placement.path_id, placement.id
  for update;

  insert into public.trail_personal_states(
    user_id, trail_item_id, revision, completed_card_count,
    state, created_at, updated_at
  )
  select state_row.user_id, v_keep_id, state_row.revision,
    state_row.completed_card_count, state_row.state,
    state_row.created_at, state_row.updated_at
  from public.trail_personal_states state_row
  where state_row.trail_item_id = v_drop_id
  on conflict(user_id, trail_item_id) do update set
    revision = greatest(public.trail_personal_states.revision, excluded.revision) + 1,
    state = private.merge_trail_personal_state_v1(
      excluded.state, public.trail_personal_states.state
    ),
    updated_at = greatest(public.trail_personal_states.updated_at, excluded.updated_at);

  delete from private.trail_observation_threads losing
  where losing.trail_item_id = v_drop_id
    and exists(
      select 1 from private.trail_observation_threads kept
      where kept.user_id = losing.user_id
        and kept.trail_item_id = v_keep_id
        and kept.card_id = losing.card_id
    );
  update private.trail_observation_threads
  set trail_item_id = v_keep_id
  where trail_item_id = v_drop_id;

  update public.trail_personal_states state_row
  set completed_card_count = (
    select coalesce(sum(jsonb_array_length(lesson.value->'completedCardIds')), 0)::integer
    from jsonb_each(coalesce(state_row.state#>'{progress,lessons}', '{}'::jsonb)) lesson(path, value)
  )
  where state_row.trail_item_id = v_keep_id;
  delete from public.trail_personal_states where trail_item_id = v_drop_id;
  delete from private.trail_personal_state_receipts where trail_item_id = v_drop_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'ownerId', affected.owner_id, 'pathId', affected.path_id
  )), '[]'::jsonb) into v_affected_paths
  from (
    select distinct placement.owner_id, placement.path_id
    from public.study_path_items placement
    where placement.trail_item_id in (v_keep_id, v_drop_id)
  ) affected;
  delete from public.study_path_items losing
  where losing.trail_item_id = v_drop_id
    and exists(
      select 1 from public.study_path_items kept
      where kept.owner_id = losing.owner_id and kept.trail_item_id = v_keep_id
    );
  update public.study_path_items set trail_item_id = v_keep_id
  where trail_item_id = v_drop_id;
  update private.trail_item_courses
  set trail_item_id = v_keep_id
  where trail_item_id = v_drop_id;
  for v_affected_path in select value from jsonb_array_elements(v_affected_paths)
  loop
    perform private.normalize_trail_group_items_v1(
      (v_affected_path->>'ownerId')::uuid,
      (v_affected_path->>'pathId')::uuid
    );
  end loop;
  delete from private.trail_items where id = v_drop_id;
  update private.trail_items
  set workspace_id = new.workspace_id,
      workspace_course_id = new.workspace_course_id,
      course_id = case when new.target = 'catalog' or course_id is null
        then new.course_id else course_id end,
      updated_at = now()
  where id = v_keep_id;
  if new.target = 'catalog' then
    perform private.consolidate_catalog_root_v1(
      new.workspace_id, new.workspace_course_id, new.course_id
    );
  end if;
  return new;
end;
$function$;

do $block$
declare
  v_catalog record;
begin
  for v_catalog in
    select publication.workspace_id, publication.workspace_course_id,
      publication.course_id
    from private.authoring_workspace_publications publication
    where publication.target = 'catalog'
    order by publication.workspace_id, publication.workspace_course_id
  loop
    perform private.consolidate_catalog_root_v1(
      v_catalog.workspace_id,
      v_catalog.workspace_course_id,
      v_catalog.course_id
    );
  end loop;
end;
$block$;

revoke all on function private.consolidate_catalog_root_v1(uuid, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.release_terminal_submission_source_v1()
  from public, anon, authenticated, service_role;
revoke all on function private.clear_changes_requested_artifact_v1()
  from public, anon, authenticated, service_role;
revoke all on function private.supersede_changes_requested_submission_v1()
  from public, anon, authenticated, service_role;
revoke all on function private.guard_active_review_source_course_v1()
  from public, anon, authenticated, service_role;

create or replace function private.list_educational_workspace_comments_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_limit integer default 20,
  p_before_updated_at timestamptz default null,
  p_before_id uuid default null,
  p_categories text[] default null,
  p_statuses text[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $function$
declare
  v_role text;
  v_can_review boolean;
  v_items jsonb;
  v_has_more boolean;
  v_next_cursor jsonb;
begin
  v_role := private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'comment'
  );
  v_can_review := private.educational_workspace_can_v1(
    p_workspace_id, p_actor_id, 'review'
  );
  if p_limit is null or p_limit not between 1 and 50
     or ((p_before_updated_at is null) <> (p_before_id is null))
     or coalesce(cardinality(p_categories), 0) > 5
     or coalesce(cardinality(p_statuses), 0) > 4
     or exists(
       select 1 from unnest(coalesce(p_categories, '{}'::text[])) category
       where category not in (
         'question', 'possible_error', 'confusing', 'suggestion', 'observation'
       )
     )
     or exists(
       select 1 from unnest(coalesce(p_statuses, '{}'::text[])) status_value
       where status_value not in ('open', 'considered', 'resolved', 'incorporated')
     ) then
    raise exception 'Consulta de observações inválida.' using errcode = '22023';
  end if;

  with candidates as materialized (
    select thread.*, item.course_id, item.workspace_id,
      coalesce(account.email, '') as author_email,
      state_row.state#>array['observations', thread.card_id] as observation,
      private.current_authoring_entity_path_v1(
        item.workspace_id, 'card', thread.card_id
      ) as entity_path,
      private.trail_observation_target_available_v1(
        thread.trail_item_id, thread.card_id
      ) as target_available
    from private.trail_observation_threads thread
    join private.trail_items item on item.id = thread.trail_item_id
    join public.trail_personal_states state_row
      on state_row.user_id = thread.user_id
     and state_row.trail_item_id = thread.trail_item_id
    join auth.users account on account.id = thread.user_id
    where item.workspace_id = p_workspace_id
      and (v_can_review or thread.user_id = p_actor_id)
      and state_row.state#>array['observations', thread.card_id] is not null
      and (
        p_categories is null
        or state_row.state#>>array['observations', thread.card_id, 'category'] = any(p_categories)
      )
      and (p_statuses is null or thread.status = any(p_statuses))
      and (
        p_before_updated_at is null
        or (thread.updated_at, thread.id) < (p_before_updated_at, p_before_id)
      )
    order by thread.updated_at desc, thread.id desc
    limit p_limit + 1
  ), page as materialized (
    select candidates.*,
      coalesce(course.content->>'title', candidates.entity_path[1]) as course_title,
      card.content->>'title' as card_title
    from candidates
    left join private.authoring_workspace_entities course
      on course.workspace_id = candidates.workspace_id
     and course.entity_type = 'course'
     and course.entity_id = candidates.entity_path[1]
    left join private.authoring_workspace_entities card
      on card.workspace_id = candidates.workspace_id
     and card.entity_type = 'card'
     and card.entity_id = candidates.entity_path[5]
    order by candidates.updated_at desc, candidates.id desc
    limit p_limit
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'commentId', page.id,
      'workspaceId', page.workspace_id,
      'trailItemId', page.trail_item_id,
      'courseId', page.course_id,
      'cardId', page.card_id,
      'entityPath', page.entity_path,
      'courseTitle', page.course_title,
      'cardTitle', page.card_title,
      'author', jsonb_build_object('userId', page.user_id, 'email', page.author_email),
      'category', page.observation->>'category',
      'body', page.observation->>'body',
      'status', page.status,
      'response', page.response,
      'resolutionNote', page.resolution_note,
      'courseRevisionHash', null,
      'targetAvailable', page.target_available,
      'correction', case when page.correction_request_id is null then null
        else jsonb_build_object(
          'requestId', page.correction_request_id,
          'entityPath', page.correction_entity_path,
          'linkedAt', page.correction_linked_at
        ) end,
      'createdAt', page.created_at,
      'updatedAt', page.updated_at,
      'respondedAt', page.responded_at,
      'resolvedAt', page.resolved_at
    ) order by page.updated_at desc, page.id desc), '[]'::jsonb),
    (select count(*) from candidates) > p_limit,
    case when (select count(*) from candidates) > p_limit then (
      select jsonb_build_object('beforeUpdatedAt', page.updated_at, 'beforeId', page.id)
      from page order by page.updated_at, page.id limit 1
    ) end
  into v_items, v_has_more, v_next_cursor
  from page;
  return jsonb_build_object(
    'workspaceId', p_workspace_id,
    'role', v_role,
    'items', v_items,
    'hasMore', v_has_more,
    'nextCursor', v_next_cursor
  );
end;
$function$;

create or replace function private.educational_workspace_comment_summary_v1(
  p_actor_id uuid,
  p_workspace_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_can_review boolean;
  v_result jsonb;
begin
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'comment'
  );
  v_can_review := private.educational_workspace_can_v1(
    p_workspace_id, p_actor_id, 'review'
  );
  with visible as materialized (
    select thread.*, item.course_id, item.workspace_id,
      state_row.state#>array['observations', thread.card_id] as observation,
      private.current_authoring_entity_path_v1(
        item.workspace_id, 'card', thread.card_id
      ) as entity_path,
      private.trail_observation_target_available_v1(
        thread.trail_item_id, thread.card_id
      ) as target_available
    from private.trail_observation_threads thread
    join private.trail_items item on item.id = thread.trail_item_id
    join public.trail_personal_states state_row
      on state_row.user_id = thread.user_id
     and state_row.trail_item_id = thread.trail_item_id
    where item.workspace_id = p_workspace_id
      and (v_can_review or thread.user_id = p_actor_id)
      and state_row.state#>array['observations', thread.card_id] is not null
  ), totals as materialized (
    select count(*)::integer as total_count,
      count(*) filter (where status = 'open')::integer as open_count,
      jsonb_build_object(
        'question', count(*) filter (where observation->>'category' = 'question'),
        'possibleError', count(*) filter (where observation->>'category' = 'possible_error'),
        'confusing', count(*) filter (where observation->>'category' = 'confusing'),
        'suggestion', count(*) filter (where observation->>'category' = 'suggestion'),
        'observation', count(*) filter (where observation->>'category' = 'observation')
      ) as by_category,
      jsonb_build_object(
        'open', count(*) filter (where status = 'open'),
        'considered', count(*) filter (where status = 'considered'),
        'resolved', count(*) filter (where status = 'resolved'),
        'incorporated', count(*) filter (where status = 'incorporated')
      ) as by_status
    from visible
  ), focus as materialized (
    select trail_item_id, course_id, workspace_id, card_id, entity_path,
      bool_or(target_available) as target_available,
      count(*)::integer as total_count,
      count(*) filter (where status = 'open')::integer as open_count,
      jsonb_build_object(
        'question', count(*) filter (where observation->>'category' = 'question'),
        'possibleError', count(*) filter (where observation->>'category' = 'possible_error'),
        'confusing', count(*) filter (where observation->>'category' = 'confusing'),
        'suggestion', count(*) filter (where observation->>'category' = 'suggestion'),
        'observation', count(*) filter (where observation->>'category' = 'observation')
      ) as by_category
    from visible
    group by trail_item_id, course_id, workspace_id, card_id, entity_path
    order by count(*) filter (where status = 'open') desc, count(*) desc, card_id
    limit 20
  )
  select jsonb_build_object(
    'totalCount', totals.total_count,
    'openCount', totals.open_count,
    'byCategory', totals.by_category,
    'byStatus', totals.by_status,
    'focusCards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'trailItemId', focus.trail_item_id,
        'courseId', focus.course_id,
        'cardId', focus.card_id,
        'courseTitle', coalesce(course.content->>'title', focus.entity_path[1]),
        'cardTitle', card.content->>'title',
        'entityPath', focus.entity_path,
        'targetAvailable', focus.target_available,
        'totalCount', focus.total_count,
        'openCount', focus.open_count,
        'byCategory', focus.by_category
      ) order by focus.open_count desc, focus.total_count desc, focus.card_id)
      from focus
      left join private.authoring_workspace_entities course
        on course.workspace_id = focus.workspace_id
       and course.entity_type = 'course'
       and course.entity_id = focus.entity_path[1]
      left join private.authoring_workspace_entities card
        on card.workspace_id = focus.workspace_id
       and card.entity_type = 'card'
       and card.entity_id = focus.entity_path[5]
    ), '[]'::jsonb)
  ) into v_result from totals;
  return v_result;
end;
$function$;

create or replace function private.manage_educational_workspace_comment_v1(
  p_actor_id uuid,
  p_request_id text,
  p_workspace_id uuid,
  p_comment_id uuid,
  p_operation text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $function$
declare
  v_hash text;
  v_receipt private.educational_workspace_receipts%rowtype;
  v_thread private.trail_observation_threads%rowtype;
  v_result jsonb;
  v_status text;
  v_path text[];
begin
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'review'
  );
  if p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_operation not in (
       'respond_comment', 'set_comment_status', 'link_comment_correction'
     )
     or jsonb_typeof(coalesce(p_payload, 'null'::jsonb)) <> 'object'
     or pg_column_size(p_payload) > 8192 then
    raise exception 'Comando de observação inválido.' using errcode = '22023';
  end if;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'workspaceId', p_workspace_id, 'commentId', p_comment_id,
    'operation', p_operation, 'payload', p_payload
  )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'workspace-comment:' || p_actor_id::text || ':' || p_request_id, 0
  ));
  select * into v_receipt
  from private.educational_workspace_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.payload_hash <> v_hash or v_receipt.operation <> p_operation then
      raise exception 'requestId reutilizado com comando incompativel.'
        using errcode = '23505';
    end if;
    return v_receipt.result || jsonb_build_object('idempotent', true);
  end if;

  select thread.* into v_thread
  from private.trail_observation_threads thread
  join private.trail_items item on item.id = thread.trail_item_id
  join public.trail_personal_states state_row
    on state_row.user_id = thread.user_id
   and state_row.trail_item_id = thread.trail_item_id
  where thread.id = p_comment_id
    and item.workspace_id = p_workspace_id
    and state_row.state#>array['observations', thread.card_id] is not null
  for update of thread;
  if not found then
    raise exception 'Observação inexistente ou inacessível.' using errcode = 'P0002';
  end if;

  if p_operation = 'respond_comment' then
    if exists(
      select 1 from jsonb_object_keys(p_payload) field where field <> 'response'
    ) or nullif(btrim(p_payload->>'response'), '') is null
       or char_length(p_payload->>'response') > 2000 then
      raise exception 'Resposta inválida.' using errcode = '22023';
    end if;
    update private.trail_observation_threads thread
    set response = btrim(p_payload->>'response'),
        responded_by = p_actor_id,
        responded_at = now(),
        status = case when thread.status = 'open' then 'considered' else thread.status end,
        updated_at = now()
    where thread.id = p_comment_id;
  elsif p_operation = 'set_comment_status' then
    if exists(
      select 1 from jsonb_object_keys(p_payload) field
      where field not in ('status', 'note')
    ) then
      raise exception 'Estado da observação inválido.' using errcode = '22023';
    end if;
    v_status := p_payload->>'status';
    if v_status not in ('open', 'considered', 'resolved', 'incorporated')
       or char_length(coalesce(p_payload->>'note', '')) > 1000 then
      raise exception 'Estado da observação inválido.' using errcode = '22023';
    end if;
    update private.trail_observation_threads thread
    set status = v_status,
        resolution_note = nullif(btrim(p_payload->>'note'), ''),
        resolved_by = case when v_status in ('resolved', 'incorporated')
          then p_actor_id else null end,
        resolved_at = case when v_status in ('resolved', 'incorporated')
          then now() else null end,
        updated_at = now()
    where thread.id = p_comment_id;
  else
    if exists(
      select 1 from jsonb_object_keys(p_payload) field
      where field not in ('correctionRequestId', 'entityPath')
    ) or coalesce(p_payload->>'correctionRequestId', '')
       !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
       or jsonb_typeof(p_payload->'entityPath') is distinct from 'array' then
      raise exception 'Vínculo de correção inválido.' using errcode = '22023';
    end if;
    if jsonb_array_length(p_payload->'entityPath') not between 1 and 5
       or exists(
         select 1 from jsonb_array_elements_text(p_payload->'entityPath') value
         where nullif(btrim(value), '') is null or char_length(value) > 240
       ) then
      raise exception 'Vínculo de correção inválido.' using errcode = '22023';
    end if;
    select array_agg(value order by ordinal) into v_path
    from jsonb_array_elements_text(p_payload->'entityPath')
      with ordinality item(value, ordinal);
    update private.trail_observation_threads thread
    set correction_request_id = p_payload->>'correctionRequestId',
        correction_entity_path = v_path,
        correction_linked_at = now(),
        status = 'incorporated',
        resolved_by = p_actor_id,
        resolved_at = now(),
        updated_at = now()
    where thread.id = p_comment_id;
  end if;

  select * into strict v_thread
  from private.trail_observation_threads where id = p_comment_id;
  v_result := jsonb_build_object(
    'workspaceId', p_workspace_id,
    'commentId', p_comment_id,
    'operation', p_operation,
    'status', v_thread.status,
    'updatedAt', v_thread.updated_at,
    'idempotent', false
  );
  insert into private.educational_workspace_receipts(
    actor_id, request_id, operation, payload_hash, result
  ) values(p_actor_id, p_request_id, p_operation, v_hash, v_result);
  return v_result;
end;
$function$;

create or replace function public.list_current_educational_workspace_comments_v1(
  p_workspace_id uuid,
  p_limit integer default 20,
  p_before_updated_at timestamptz default null,
  p_before_id uuid default null,
  p_categories text[] default null,
  p_statuses text[] default null
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $function$
  select private.list_educational_workspace_comments_v1(
    auth.uid(), p_workspace_id, p_limit, p_before_updated_at, p_before_id,
    p_categories, p_statuses
  ) || jsonb_build_object(
    'summary', private.educational_workspace_comment_summary_v1(
      auth.uid(), p_workspace_id
    )
  )
$function$;

create or replace function public.list_educational_workspace_comments_for_actor_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_limit integer default 20,
  p_before_updated_at timestamptz default null,
  p_before_id uuid default null,
  p_categories text[] default null,
  p_statuses text[] default null
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  select private.list_educational_workspace_comments_v1(
    p_actor_id, p_workspace_id, p_limit, p_before_updated_at, p_before_id,
    p_categories, p_statuses
  ) || jsonb_build_object(
    'summary', private.educational_workspace_comment_summary_v1(
      p_actor_id, p_workspace_id
    )
  )
$function$;

create or replace function public.manage_current_educational_workspace_comment_v1(
  p_request_id text,
  p_workspace_id uuid,
  p_comment_id uuid,
  p_operation text,
  p_payload jsonb
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, private, auth
as $function$
  select private.manage_educational_workspace_comment_v1(
    auth.uid(), p_request_id, p_workspace_id, p_comment_id, p_operation, p_payload
  )
$function$;

create or replace function public.manage_educational_workspace_comment_for_actor_v1(
  p_actor_id uuid,
  p_request_id text,
  p_workspace_id uuid,
  p_comment_id uuid,
  p_operation text,
  p_payload jsonb
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, private
as $function$
  select private.manage_educational_workspace_comment_v1(
    p_actor_id, p_request_id, p_workspace_id, p_comment_id, p_operation, p_payload
  )
$function$;

revoke all on function private.list_educational_workspace_comments_v1(
  uuid, uuid, integer, timestamptz, uuid, text[], text[]
) from public, anon, authenticated, service_role;
revoke all on function private.educational_workspace_comment_summary_v1(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.manage_educational_workspace_comment_v1(
  uuid, text, uuid, uuid, text, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.list_current_educational_workspace_comments_v1(
  uuid, integer, timestamptz, uuid, text[], text[]
) from public, anon;
grant execute on function public.list_current_educational_workspace_comments_v1(
  uuid, integer, timestamptz, uuid, text[], text[]
) to authenticated;
revoke all on function public.manage_current_educational_workspace_comment_v1(
  text, uuid, uuid, text, jsonb
) from public, anon;
grant execute on function public.manage_current_educational_workspace_comment_v1(
  text, uuid, uuid, text, jsonb
) to authenticated;
revoke all on function public.list_educational_workspace_comments_for_actor_v1(
  uuid, uuid, integer, timestamptz, uuid, text[], text[]
) from public, anon, authenticated;
grant execute on function public.list_educational_workspace_comments_for_actor_v1(
  uuid, uuid, integer, timestamptz, uuid, text[], text[]
) to service_role;
revoke all on function public.manage_educational_workspace_comment_for_actor_v1(
  uuid, text, uuid, uuid, text, jsonb
) from public, anon, authenticated;
grant execute on function public.manage_educational_workspace_comment_for_actor_v1(
  uuid, text, uuid, uuid, text, jsonb
) to service_role;

alter function public.get_aralearn_runtime_manifest()
  rename to get_aralearn_runtime_manifest_without_trail_observations_v1;

create function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  with base as (
    select public.get_aralearn_runtime_manifest_without_trail_observations_v1() as value
  )
  select jsonb_set(
    jsonb_set(base.value, '{schemaRevision}', '"20260807225000"'::jsonb),
    '{features}',
    (base.value->'features') || jsonb_build_array(
      'situated-trail-observations-v1',
      'workspace-trail-observations-v1'
    )
  ) from base
$function$;

revoke all on function
  public.get_aralearn_runtime_manifest_without_trail_observations_v1()
  from public, anon, authenticated;
revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest()
  to anon, authenticated;

commit;
