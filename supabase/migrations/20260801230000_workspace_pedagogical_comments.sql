-- Integra observações situadas aos papéis locais sem duplicar card ou curso.

begin;

alter table public.card_comments
  add column workspace_id uuid references private.authoring_workspaces(id) on delete set null,
  add column course_revision_hash text,
  add column response text,
  add column responded_by uuid references auth.users(id) on delete set null,
  add column responded_at timestamptz,
  add column resolution_note text,
  add column resolved_by uuid references auth.users(id) on delete set null,
  add column resolved_at timestamptz,
  add column correction_request_id text,
  add column correction_entity_path text[],
  add column correction_linked_at timestamptz;

alter table public.card_comments
  drop constraint card_comments_status_v1,
  add constraint card_comments_status_v2 check (
    status in ('open', 'considered', 'resolved', 'incorporated')
  ),
  add constraint card_comments_revision_hash_v2 check (
    course_revision_hash is null or course_revision_hash ~ '^[0-9a-f]{64}$'
  ),
  add constraint card_comments_response_v2 check (
    response is null or (btrim(response) <> '' and char_length(response) <= 2000)
  ),
  add constraint card_comments_response_actor_v2 check (
    (response is null and responded_by is null and responded_at is null)
    or (response is not null and responded_by is not null and responded_at is not null)
  ),
  add constraint card_comments_resolution_v2 check (
    resolution_note is null or char_length(resolution_note) <= 1000
  ),
  add constraint card_comments_resolution_actor_v2 check (
    (resolved_at is null and resolved_by is null)
    or (resolved_at is not null and resolved_by is not null)
  ),
  add constraint card_comments_correction_request_v2 check (
    correction_request_id is null
    or correction_request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
  ),
  add constraint card_comments_correction_path_v2 check (
    (correction_request_id is null and correction_entity_path is null
      and correction_linked_at is null)
    or (
      correction_request_id is not null
      and cardinality(correction_entity_path) between 1 and 5
      and correction_linked_at is not null
    )
  );

create index card_comments_workspace_triage_v2_idx
  on public.card_comments(workspace_id, status, category, updated_at desc, id)
  where workspace_id is not null;

create function private.infer_situated_comment_workspace_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_workspace_ids uuid[];
begin
  if new.course_revision_hash is null then
    select course.current_revision_hash into new.course_revision_hash
    from public.courses course
    where course.id = new.course_id;
  end if;
  if new.workspace_id is null then
    select array_agg(distinct publication.workspace_id)
    into v_workspace_ids
    from private.authoring_workspace_publications publication
    join private.educational_workspace_members member
      on member.workspace_id = publication.workspace_id
     and member.user_id = new.user_id
    where publication.course_id = new.course_id;
    if cardinality(v_workspace_ids) = 1 then
      new.workspace_id := v_workspace_ids[1];
    end if;
  end if;
  return new;
end;
$function$;

create trigger infer_situated_comment_workspace_v2
before insert on public.card_comments
for each row execute function private.infer_situated_comment_workspace_v2();

with candidates as (
  select comment.id,
    array_agg(distinct publication.workspace_id) as workspace_ids
  from public.card_comments comment
  join private.authoring_workspace_publications publication
    on publication.course_id = comment.course_id
  join private.educational_workspace_members member
    on member.workspace_id = publication.workspace_id
   and member.user_id = comment.user_id
  where comment.workspace_id is null
  group by comment.id
)
update public.card_comments comment
set workspace_id = candidates.workspace_ids[1]
from candidates
where comment.id = candidates.id and cardinality(candidates.workspace_ids) = 1;

update public.card_comments comment
set course_revision_hash = course.current_revision_hash
from public.courses course
where course.id = comment.course_id and comment.course_revision_hash is null;

alter table private.educational_workspace_receipts
  drop constraint educational_workspace_receipts_operation_v1,
  add constraint educational_workspace_receipts_operation_v2 check (
    operation in (
      'create', 'update', 'invite', 'accept_invite', 'cancel_invite',
      'set_role', 'remove_member', 'transfer_owner', 'leave',
      'respond_comment', 'set_comment_status', 'link_comment_correction'
    )
  );

create function private.list_educational_workspace_comments_v1(
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
    select comment.*, coalesce(account.email, '') as author_email,
      course.title as course_title, course.contract_key as course_key,
      card.title as card_title, card.contract_key as card_key,
      module.contract_key as module_key, lesson.contract_key as lesson_key,
      microsequence.contract_key as microsequence_key,
      card.id is not null and card.deleted_at is null as target_available
    from public.card_comments comment
    join auth.users account on account.id = comment.user_id
    join public.courses course on course.id = comment.course_id
    left join public.cards card
      on card.course_id = comment.course_id and card.id = comment.card_id
    left join public.microsequences microsequence
      on microsequence.course_id = card.course_id
     and microsequence.id = card.microsequence_id
    left join public.lessons lesson
      on lesson.course_id = microsequence.course_id
     and lesson.id = microsequence.lesson_id
    left join public.modules module
      on module.course_id = lesson.course_id and module.id = lesson.module_id
    where comment.workspace_id = p_workspace_id
      and (v_can_review or comment.user_id = p_actor_id)
      and (p_categories is null or comment.category = any(p_categories))
      and (p_statuses is null or comment.status = any(p_statuses))
      and (
        p_before_updated_at is null
        or (comment.updated_at, comment.id) < (p_before_updated_at, p_before_id)
      )
    order by comment.updated_at desc, comment.id desc
    limit p_limit + 1
  ), page as materialized (
    select * from candidates
    order by updated_at desc, id desc
    limit p_limit
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'commentId', page.id,
      'workspaceId', page.workspace_id,
      'courseId', page.course_id,
      'cardId', page.card_id,
      'entityPath', case when page.card_key is null then null else jsonb_build_array(
        page.course_key, page.module_key, page.lesson_key,
        page.microsequence_key, page.card_key
      ) end,
      'courseTitle', page.course_title,
      'cardTitle', page.card_title,
      'author', jsonb_build_object('userId', page.user_id, 'email', page.author_email),
      'category', page.category,
      'body', page.body,
      'status', page.status,
      'response', page.response,
      'resolutionNote', page.resolution_note,
      'courseRevisionHash', page.course_revision_hash,
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

create function private.manage_educational_workspace_comment_v1(
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
  v_comment public.card_comments%rowtype;
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
  v_hash := encode(extensions.digest(convert_to(
    jsonb_build_object(
      'workspaceId', p_workspace_id, 'commentId', p_comment_id,
      'operation', p_operation, 'payload', p_payload
    )::text, 'UTF8'
  ), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'workspace-comment:' || p_actor_id::text || ':' || p_request_id, 0
  ));
  select * into v_receipt
  from private.educational_workspace_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.payload_hash <> v_hash or v_receipt.operation <> p_operation then
      raise exception 'requestId reutilizado com comando incompatível.'
        using errcode = '23505';
    end if;
    return v_receipt.result || jsonb_build_object('idempotent', true);
  end if;

  select * into v_comment
  from public.card_comments comment
  where comment.id = p_comment_id and comment.workspace_id = p_workspace_id
  for update;
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
    update public.card_comments comment
    set response = btrim(p_payload->>'response'),
        responded_by = p_actor_id,
        responded_at = now(),
        status = case when comment.status = 'open' then 'considered' else comment.status end,
        updated_at = now()
    where comment.id = p_comment_id;
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
    update public.card_comments comment
    set status = v_status,
        resolution_note = nullif(btrim(p_payload->>'note'), ''),
        resolved_by = case when v_status in ('resolved', 'incorporated')
          then p_actor_id else null end,
        resolved_at = case when v_status in ('resolved', 'incorporated')
          then now() else null end,
        updated_at = now()
    where comment.id = p_comment_id;
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
    select array_agg(value order by ordinal)
    into v_path
    from jsonb_array_elements_text(p_payload->'entityPath') with ordinality item(value, ordinal);
    update public.card_comments comment
    set correction_request_id = p_payload->>'correctionRequestId',
        correction_entity_path = v_path,
        correction_linked_at = now(),
        status = 'incorporated',
        resolved_by = p_actor_id,
        resolved_at = now(),
        updated_at = now()
    where comment.id = p_comment_id;
  end if;

  select * into strict v_comment from public.card_comments where id = p_comment_id;
  v_result := jsonb_build_object(
    'workspaceId', p_workspace_id,
    'commentId', p_comment_id,
    'operation', p_operation,
    'status', v_comment.status,
    'updatedAt', v_comment.updated_at,
    'idempotent', false
  );
  insert into private.educational_workspace_receipts(
    actor_id, request_id, operation, payload_hash, result
  ) values (p_actor_id, p_request_id, p_operation, v_hash, v_result);
  return v_result;
end;
$function$;

create function public.list_current_educational_workspace_comments_v1(
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
  )
$function$;

create function public.list_educational_workspace_comments_for_actor_v1(
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
  )
$function$;

create function public.manage_current_educational_workspace_comment_v1(
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

create function public.manage_educational_workspace_comment_for_actor_v1(
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

-- O navegador sincroniza por RPC. A tabela não pode aceitar escrita direta,
-- pois resposta, resolução e vínculo de correção pertencem ao contrato contextual.
revoke all on table public.card_comments from public, anon, authenticated;

create or replace function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'schemaRevision', '20260801230000',
    'contractVersion', 4,
    'features', jsonb_build_array(
      'lean-shared-catalog', 'artifact-offline-replica', 'granular-sync',
      'private-authoring', 'text-language-metadata',
      'storage-artifact-control-plane', 'pre-registered-publication-artifacts',
      'single-current-course-revision', 'storage-only-course-content',
      'canonical-resource-registry', 'atomic-resource-authoring',
      'atomic-card-assistance', 'composed-authoring-workspaces',
      'workspace-publication-bindings', 'unchanged-publication-short-circuit',
      'bounded-authoring-events', 'partial-private-publication',
      'microtheory-review-projection', 'workspace-cursor-pagination',
      'workspace-event-cursor-pagination',
      'workspace-microsequence-card-pagination',
      'global-catalog-course-search', 'catalog-review-submissions',
      'catalog-management', 'personal-library-course-removal',
      'course-revision-sync-compaction', 'automatic-sync-history-maintenance',
      'compact-authoring-brief', 'account-derived-authoring-capabilities',
      'oauth-only-authoring-mcp', 'default-catalog-collection',
      'confidential-gpt-action-oauth', 'gpt-action-oauth-linking',
      'gpt-action-oauth-relinking', 'gpt-action-oauth-stable-callback',
      'workspace-card-metadata', 'structured-authoring-errors',
      'current-state-central-v1', 'situated-personal-comments-v1',
      'educational-workspace-membership-v1',
      'educational-workspace-invitations-v1',
      'workspace-capability-enforcement-v1',
      'workspace-member-course-access-v1',
      'workspace-contextual-current-state-v1',
      'workspace-pedagogical-comments-v1'
    )
  );
$function$;

revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest() to anon, authenticated;

commit;
