-- Observações pessoais situadas: categoria fechada, estado corrente e sync
-- dedicado. O comentário continua pequeno e referencia o card, sem copiar
-- conteúdo didático nem criar histórico de versões.

alter table public.card_comments
  add column category text,
  add column status text,
  add column course_key text,
  add column module_key text,
  add column lesson_key text,
  add column microsequence_key text,
  add column card_key text,
  add column card_title text;

update public.card_comments
set category = 'observation',
    status = 'open';

alter table public.card_comments
  alter column category set not null,
  alter column category drop default,
  alter column status set not null,
  alter column status drop default;

alter table public.card_comments
  drop constraint if exists card_comments_category_v1,
  drop constraint if exists card_comments_status_v1,
  drop constraint if exists card_comments_body_length_v1;

alter table public.card_comments
  add constraint card_comments_category_v1 check (
    category in ('question', 'possible_error', 'confusing', 'suggestion', 'observation')
  ),
  add constraint card_comments_status_v1 check (status in ('open', 'resolved')),
  add constraint card_comments_body_length_v1 check (char_length(body) <= 1000),
  add constraint card_comments_entity_path_v1 check (
    (course_key is null and module_key is null and lesson_key is null
      and microsequence_key is null and card_key is null)
    or (
      course_key is not null and module_key is not null and lesson_key is not null
      and microsequence_key is not null and card_key is not null
      and greatest(
        char_length(course_key), char_length(module_key), char_length(lesson_key),
        char_length(microsequence_key), char_length(card_key)
      ) <= 240
    )
  ),
  add constraint card_comments_card_title_v1 check (
    card_title is null or (btrim(card_title) <> '' and char_length(card_title) <= 240)
  );

alter function public.apply_sync_batch(uuid, jsonb)
  rename to apply_sync_batch_without_situated_comments_v1;

revoke all on function public.apply_sync_batch_without_situated_comments_v1(uuid, jsonb)
  from public, anon, authenticated;

create or replace function public.apply_situated_comment_batch_v1(
  p_device_id uuid,
  p_mutations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_items jsonb := coalesce(p_mutations, '[]'::jsonb);
  v_mutation jsonb;
  v_mutation_id uuid;
  v_entity_id uuid;
  v_course_id uuid;
  v_selection_id uuid;
  v_card_id uuid;
  v_operation text;
  v_requested_operation text;
  v_payload jsonb;
  v_changed jsonb;
  v_hash text;
  v_existing private.sync_idempotency%rowtype;
  v_existing_comment public.card_comments%rowtype;
  v_selection public.user_course_selections%rowtype;
  v_row jsonb;
  v_sequence bigint;
  v_client_sequence bigint;
  v_device_processed bigint;
  v_results jsonb := '[]'::jsonb;
  v_code text;
  v_message text;
begin
  if v_user_id is null or p_device_id is null then
    raise exception 'Autenticação e deviceId são obrigatórios.' using errcode = '42501';
  end if;
  if jsonb_typeof(v_items) <> 'array' then
    raise exception 'Mutações devem ser array.' using errcode = '22023';
  end if;
  if jsonb_array_length(v_items) > 500 then
    raise exception 'Lote excede 500 mutações.' using errcode = '22023';
  end if;

  insert into private.sync_devices(id, user_id, last_seen_at, inactive_at)
  values(p_device_id, v_user_id, now(), null)
  on conflict(user_id, id) do update
    set last_seen_at = now(), inactive_at = null;
  select last_processed_mutation_sequence
  into v_device_processed
  from private.sync_devices
  where user_id = v_user_id and id = p_device_id
  for update;

  for v_mutation in select value from jsonb_array_elements(v_items)
  loop
    begin
      v_mutation_id := private.try_uuid(v_mutation ->> 'mutationId');
      v_entity_id := private.try_uuid(v_mutation ->> 'entityId');
      v_course_id := private.try_uuid(v_mutation ->> 'courseId');
      v_client_sequence := case
        when coalesce(v_mutation ->> 'sequence', '') ~ '^[0-9]+$'
          then (v_mutation ->> 'sequence')::bigint
        else null
      end;
      v_requested_operation := lower(coalesce(v_mutation ->> 'operation', ''));
      v_operation := case
        when v_requested_operation in ('insert', 'update', 'upsert') then 'upsert'
        else v_requested_operation
      end;
      v_payload := coalesce(v_mutation -> 'payload', '{}'::jsonb);
      v_changed := coalesce(v_mutation -> 'changedFields', '[]'::jsonb);
      v_hash := encode(
        extensions.digest(convert_to(v_mutation::text, 'UTF8'), 'sha256'),
        'hex'
      );

      if v_mutation_id is not null then
        perform pg_advisory_xact_lock(hashtextextended(
          'sync-mutation:' || v_user_id::text || ':' || v_mutation_id::text,
          0
        ));
        select * into v_existing
        from private.sync_idempotency
        where user_id = v_user_id and mutation_id = v_mutation_id;
        if found then
          if v_existing.request_hash <> v_hash then
            raise exception 'mutationId reutilizado com payload incompatível.'
              using errcode = '23514';
          end if;
          if v_existing.outcome = 'rejected' then
            v_results := v_results || jsonb_build_array(jsonb_build_object(
              'status', 'rejected',
              'mutationId', v_existing.mutation_id,
              'entityType', v_existing.entity_type,
              'entityId', v_existing.entity_id,
              'code', v_existing.error_code,
              'reason', 'invalid_mutation',
              'message', v_existing.error_message,
              'idempotent', true
            ));
          else
            v_row := private.current_personal_row('comments', v_existing.entity_id, v_user_id);
            v_results := v_results || jsonb_build_array(jsonb_build_object(
              'status', 'applied',
              'mutationId', v_existing.mutation_id,
              'entityType', 'comments',
              'entityId', v_existing.entity_id,
              'operation', v_existing.operation,
              'idempotent', true,
              'row', v_row
            ));
          end if;
          if coalesce(v_client_sequence, 0) > 0 then
            v_device_processed := greatest(v_device_processed, v_client_sequence);
            update private.sync_devices
            set last_processed_mutation_sequence = v_device_processed
            where user_id = v_user_id and id = p_device_id;
          end if;
          continue;
        end if;
      end if;

      if v_mutation_id is null
         or v_entity_id is null
         or coalesce(v_client_sequence, 0) <= 0
         or v_mutation ->> 'entityType' <> 'comments'
         or v_operation not in ('upsert', 'delete')
         or jsonb_typeof(v_payload) <> 'object'
         or jsonb_typeof(v_changed) <> 'array'
         or exists(
           select 1 from jsonb_array_elements(v_changed) field
           where jsonb_typeof(field) <> 'string'
         ) then
        raise exception 'Envelope de observação inválido.' using errcode = '22023';
      end if;

      if exists(
        select 1 from jsonb_object_keys(v_payload) field
        where field not in (
          'id', 'userId', 'courseId', 'selectionId', 'moduleId', 'lessonId',
          'microsequenceId', 'cardId', 'courseKey', 'moduleKey', 'lessonKey',
          'microsequenceKey', 'cardKey', 'cardTitle', 'category', 'body',
          'createdAt', 'updatedAt', 'deletedAt'
        )
      ) or exists(
        select 1 from jsonb_array_elements_text(v_changed) field
        where field not in ('category', 'body')
      ) then
        raise exception 'Payload contém campo desconhecido para observação.'
          using errcode = '22023';
      end if;

      if v_operation = 'upsert' then
        if v_requested_operation = 'update' and jsonb_array_length(v_changed) = 0 then
          raise exception 'Update exige changedFields.' using errcode = '22023';
        end if;
        if v_requested_operation = 'update' and (
          exists(
            select 1 from jsonb_object_keys(v_payload) field
            where field in ('category', 'body') and not exists(
              select 1 from jsonb_array_elements_text(v_changed) changed
              where changed = field
            )
          ) or exists(
            select 1 from jsonb_array_elements_text(v_changed) field
            where not (v_payload ? field)
          )
        ) then
          raise exception 'Payload patch diverge de changedFields.' using errcode = '22023';
        end if;
        if not (v_payload ? 'category') or not (v_payload ? 'body') then
          raise exception 'Observação exige categoria e texto correntes.' using errcode = '22023';
        end if;
        if exists(
          select 1 from unnest(array[
            'courseKey', 'moduleKey', 'lessonKey', 'microsequenceKey', 'cardKey'
          ]) field
          where nullif(btrim(v_payload ->> field), '') is null
             or char_length(v_payload ->> field) > 240
        ) or nullif(btrim(v_payload ->> 'cardTitle'), '') is null
           or char_length(v_payload ->> 'cardTitle') > 240 then
          raise exception 'Observação exige caminho e título compactos do card.'
            using errcode = '22023';
        end if;
      end if;

      if v_client_sequence <= v_device_processed then
        v_row := private.current_personal_row('comments', v_entity_id, v_user_id);
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'status', 'applied',
          'mutationId', v_mutation_id,
          'entityType', 'comments',
          'entityId', v_entity_id,
          'operation', v_operation,
          'idempotent', true,
          'deduplicatedByDeviceSequence', true,
          'row', v_row
        ));
        continue;
      end if;

      select * into v_existing_comment
      from public.card_comments
      where id = v_entity_id and user_id = v_user_id;

      if v_operation = 'delete' then
        if found and (
          (v_course_id is not null and v_existing_comment.course_id <> v_course_id)
          or (
            private.try_uuid(v_payload ->> 'cardId') is not null
            and v_existing_comment.card_id <> private.try_uuid(v_payload ->> 'cardId')
          )
        ) then
          raise exception 'Identidade imutável da observação não corresponde ao envelope.'
            using errcode = '23514';
        end if;
        delete from public.card_comments
        where id = v_entity_id and user_id = v_user_id;
      else
        v_selection_id := private.try_uuid(v_payload ->> 'selectionId');
        if v_selection_id is null then
          select id into v_selection_id
          from public.user_course_selections
          where user_id = v_user_id and course_id = v_course_id;
        end if;
        select * into v_selection
        from public.user_course_selections
        where id = v_selection_id and user_id = v_user_id;
        if not found or (v_course_id is not null and v_selection.course_id <> v_course_id) then
          raise exception 'Seleção de curso não autorizada.' using errcode = '42501';
        end if;
        v_course_id := v_selection.course_id;
        v_card_id := private.try_uuid(v_payload ->> 'cardId');
        if v_card_id is null then
          raise exception 'Observação exige cardId.' using errcode = '22023';
        end if;
        if v_existing_comment.id is not null and (
          v_existing_comment.selection_id <> v_selection.id
          or v_existing_comment.course_id <> v_selection.course_id
          or v_existing_comment.card_id <> v_card_id
          or (v_existing_comment.card_key is not null and v_existing_comment.card_key <> v_payload ->> 'cardKey')
        ) then
          raise exception 'Identidade imutável da observação não corresponde à seleção.'
            using errcode = '23514';
        end if;

        if v_existing_comment.id is not null then
          update public.card_comments
          set category = v_payload ->> 'category',
              body = v_payload ->> 'body',
              course_key = coalesce(course_key, v_payload ->> 'courseKey'),
              module_key = coalesce(module_key, v_payload ->> 'moduleKey'),
              lesson_key = coalesce(lesson_key, v_payload ->> 'lessonKey'),
              microsequence_key = coalesce(microsequence_key, v_payload ->> 'microsequenceKey'),
              card_key = coalesce(card_key, v_payload ->> 'cardKey'),
              card_title = v_payload ->> 'cardTitle'
          where id = v_entity_id and user_id = v_user_id;
        else
          insert into public.card_comments(
            id, selection_id, user_id, course_id, card_id,
            course_key, module_key, lesson_key, microsequence_key, card_key, card_title,
            category, body, status
          ) values(
            v_entity_id, v_selection.id, v_user_id, v_selection.course_id,
            v_card_id, v_payload ->> 'courseKey', v_payload ->> 'moduleKey',
            v_payload ->> 'lessonKey', v_payload ->> 'microsequenceKey',
            v_payload ->> 'cardKey', v_payload ->> 'cardTitle',
            v_payload ->> 'category', v_payload ->> 'body', 'open'
          );
        end if;
      end if;

      select max(sequence) into v_sequence
      from private.sync_changes
      where audience_user_id = v_user_id
        and entity_type = 'comments'
        and entity_id = v_entity_id;
      insert into private.sync_idempotency(
        user_id, mutation_id, request_hash, entity_type, entity_id, operation,
        device_id, client_sequence, applied_sequence
      ) values(
        v_user_id, v_mutation_id, v_hash, 'comments', v_entity_id, v_operation,
        p_device_id, v_client_sequence, v_sequence
      );
      v_device_processed := greatest(v_device_processed, v_client_sequence);
      update private.sync_devices
      set last_processed_mutation_sequence = v_device_processed
      where user_id = v_user_id and id = p_device_id;
      v_row := private.current_personal_row('comments', v_entity_id, v_user_id);
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'status', 'applied',
        'mutationId', v_mutation_id,
        'entityType', 'comments',
        'entityId', v_entity_id,
        'operation', v_operation,
        'idempotent', false,
        'row', v_row
      ));
    exception when others then
      get stacked diagnostics v_code = returned_sqlstate, v_message = message_text;
      if left(v_code, 2) not in ('22', '23') and v_code <> '42501' then
        raise;
      end if;
      if v_mutation_id is not null and coalesce(v_client_sequence, 0) > 0 then
        insert into private.sync_idempotency(
          user_id, mutation_id, request_hash, entity_type, entity_id, operation,
          device_id, client_sequence, outcome, error_code, error_message
        ) values(
          v_user_id, v_mutation_id, v_hash, 'comments', v_entity_id,
          case when v_operation in ('upsert', 'delete') then v_operation else 'upsert' end,
          p_device_id, v_client_sequence, 'rejected', v_code,
          coalesce(v_message, 'Observação rejeitada.')
        ) on conflict do nothing;
      end if;
      if coalesce(v_client_sequence, 0) > 0 then
        v_device_processed := greatest(v_device_processed, v_client_sequence);
        update private.sync_devices
        set last_processed_mutation_sequence = v_device_processed
        where user_id = v_user_id and id = p_device_id;
      end if;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'status', 'rejected',
        'mutationId', v_mutation ->> 'mutationId',
        'entityType', 'comments',
        'entityId', v_mutation ->> 'entityId',
        'code', v_code,
        'reason', 'invalid_mutation',
        'message', v_message
      ));
    end;
  end loop;
  return jsonb_build_object('status', 'applied', 'results', v_results);
end;
$$;

create or replace function public.apply_sync_batch(
  p_device_id uuid,
  p_mutations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if exists(
    select 1
    from jsonb_array_elements(coalesce(p_mutations, '[]'::jsonb)) mutation
    where mutation ->> 'entityType' = 'comments'
  ) then
    raise exception 'Observações usam apply_situated_comment_batch_v1.'
      using errcode = '22023';
  end if;
  return public.apply_sync_batch_without_situated_comments_v1(
    p_device_id,
    p_mutations
  );
end;
$$;

revoke all on function public.apply_situated_comment_batch_v1(uuid, jsonb)
  from public, anon;
grant execute on function public.apply_situated_comment_batch_v1(uuid, jsonb)
  to authenticated;
revoke all on function public.apply_sync_batch(uuid, jsonb) from public, anon;
grant execute on function public.apply_sync_batch(uuid, jsonb) to authenticated;

comment on function public.apply_situated_comment_batch_v1(uuid, jsonb) is
  'Sincroniza observações pessoais categorizadas por card com sequência idempotente e sem histórico de conteúdo.';

create or replace function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'schemaRevision', '20260801180000',
    'contractVersion', 4,
    'features', jsonb_build_array(
      'lean-shared-catalog',
      'artifact-offline-replica',
      'granular-sync',
      'private-authoring',
      'text-language-metadata',
      'storage-artifact-control-plane',
      'pre-registered-publication-artifacts',
      'single-current-course-revision',
      'storage-only-course-content',
      'canonical-resource-registry',
      'atomic-resource-authoring',
      'atomic-card-assistance',
      'composed-authoring-workspaces',
      'workspace-publication-bindings',
      'unchanged-publication-short-circuit',
      'bounded-authoring-events',
      'partial-private-publication',
      'microtheory-review-projection',
      'workspace-cursor-pagination',
      'workspace-event-cursor-pagination',
      'workspace-microsequence-card-pagination',
      'global-catalog-course-search',
      'catalog-review-submissions',
      'catalog-management',
      'personal-library-course-removal',
      'course-revision-sync-compaction',
      'automatic-sync-history-maintenance',
      'compact-authoring-brief',
      'account-derived-authoring-capabilities',
      'oauth-only-authoring-mcp',
      'default-catalog-collection',
      'confidential-gpt-action-oauth',
      'gpt-action-oauth-linking',
      'gpt-action-oauth-relinking',
      'gpt-action-oauth-stable-callback',
      'workspace-card-metadata',
      'structured-authoring-errors',
      'current-state-central-v1',
      'situated-personal-comments-v1'
    )
  );
$function$;

revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest() to anon, authenticated;
