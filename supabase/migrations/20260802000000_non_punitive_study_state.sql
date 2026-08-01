begin;

-- O estado de estudo conserva somente decisões funcionais correntes. Abertura,
-- tempo, tentativa e resultado não são evidências pedagógicas e deixam de ser
-- persistidos deliberadamente, sem migração ou fallback do contrato anterior.
alter table public.lesson_progress
  drop constraint if exists lesson_progress_completion_order,
  drop column if exists first_viewed_at,
  drop column if exists last_activity_at;

alter table public.card_progress
  drop constraint if exists card_progress_attempts_nonnegative,
  drop constraint if exists card_progress_completion_order,
  drop column if exists first_viewed_at,
  drop column if exists attempts,
  drop column if exists last_result,
  drop column if exists last_activity_at,
  add column review_marked_at timestamptz;

drop index if exists public.lesson_progress_user_activity_idx;
drop index if exists public.card_progress_user_activity_idx;
create index lesson_progress_user_updated_idx
  on public.lesson_progress(user_id, updated_at desc, id);
create index card_progress_user_review_idx
  on public.card_progress(user_id, review_marked_at desc nulls last, id);

create or replace function public.apply_non_punitive_study_state_batch_v1(
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
  v_entity_type text;
  v_course_id uuid;
  v_selection_id uuid;
  v_content_id uuid;
  v_operation text;
  v_requested_operation text;
  v_payload jsonb;
  v_changed jsonb;
  v_hash text;
  v_existing private.sync_idempotency%rowtype;
  v_selection public.user_course_selections%rowtype;
  v_existing_selection_id uuid;
  v_existing_course_id uuid;
  v_existing_content_id uuid;
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
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) > 500 then
    raise exception 'Lote de estado de estudo inválido.' using errcode = '22023';
  end if;

  insert into private.sync_devices(id, user_id, last_seen_at, inactive_at)
  values(p_device_id, v_user_id, now(), null)
  on conflict(user_id, id) do update
    set last_seen_at = now(), inactive_at = null;
  select last_processed_mutation_sequence into v_device_processed
  from private.sync_devices
  where user_id = v_user_id and id = p_device_id
  for update;

  for v_mutation in select value from jsonb_array_elements(v_items)
  loop
    begin
      v_mutation_id := private.try_uuid(v_mutation ->> 'mutationId');
      v_entity_id := private.try_uuid(v_mutation ->> 'entityId');
      v_entity_type := v_mutation ->> 'entityType';
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
        select * into v_existing from private.sync_idempotency
        where user_id = v_user_id and mutation_id = v_mutation_id;
        if found then
          if v_existing.request_hash <> v_hash then
            raise exception 'mutationId reutilizado com payload incompatível.'
              using errcode = '23514';
          end if;
          if v_existing.outcome = 'rejected' then
            v_results := v_results || jsonb_build_array(jsonb_build_object(
              'status', 'rejected', 'mutationId', v_existing.mutation_id,
              'entityType', v_existing.entity_type, 'entityId', v_existing.entity_id,
              'code', v_existing.error_code, 'reason', 'invalid_mutation',
              'message', v_existing.error_message, 'idempotent', true
            ));
          else
            v_row := private.current_personal_row(
              v_existing.entity_type, v_existing.entity_id, v_user_id
            );
            v_results := v_results || jsonb_build_array(jsonb_build_object(
              'status', 'applied', 'mutationId', v_existing.mutation_id,
              'entityType', v_existing.entity_type, 'entityId', v_existing.entity_id,
              'operation', v_existing.operation, 'idempotent', true, 'row', v_row
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

      if v_mutation_id is null or v_entity_id is null
         or coalesce(v_client_sequence, 0) <= 0
         or v_entity_type not in ('lessonProgress', 'cardProgress')
         or v_operation not in ('upsert', 'delete')
         or jsonb_typeof(v_payload) <> 'object'
         or jsonb_typeof(v_changed) <> 'array'
         or exists(
           select 1 from jsonb_array_elements(v_changed) field
           where jsonb_typeof(field) <> 'string'
         ) then
        raise exception 'Envelope de estado de estudo inválido.' using errcode = '22023';
      end if;

      if exists(
        select 1 from jsonb_object_keys(v_payload) field
        where field <> all(case v_entity_type
          when 'lessonProgress' then array[
            'id','userId','courseId','selectionId','lessonId','moduleId',
            'courseKey','moduleKey','lessonKey','pathKey','cursor','completedAt',
            'createdAt','updatedAt','deletedAt'
          ]
          else array[
            'id','userId','courseId','selectionId','moduleId','lessonId',
            'microsequenceId','lessonProgressId','cardId','courseKey','moduleKey',
            'lessonKey','microsequenceKey','pathKey','cardKey','position',
            'completedAt','reviewMarkedAt','createdAt','updatedAt','deletedAt'
          ]
        end)
      ) or exists(
        select 1 from jsonb_array_elements_text(v_changed) field
        where field <> all(case v_entity_type
          when 'lessonProgress' then array['cursor','completedAt']
          else array['completedAt','reviewMarkedAt']
        end)
      ) then
        raise exception 'Payload contém campo comportamental ou desconhecido.'
          using errcode = '22023';
      end if;

      if v_requested_operation = 'update' and jsonb_array_length(v_changed) = 0 then
        raise exception 'Update exige changedFields.' using errcode = '22023';
      end if;
      if v_requested_operation = 'update' and (
        exists(
          select 1 from jsonb_array_elements_text(v_changed) field
          where not (v_payload ? field)
        ) or exists(
          select 1 from jsonb_object_keys(v_payload) field
          where field = any(case v_entity_type
            when 'lessonProgress' then array['cursor','completedAt']
            else array['completedAt','reviewMarkedAt']
          end)
          and not exists(
            select 1 from jsonb_array_elements_text(v_changed) changed
            where changed = field
          )
        )
      ) then
        raise exception 'Payload patch diverge de changedFields.' using errcode = '22023';
      end if;

      if v_client_sequence <= v_device_processed then
        v_row := private.current_personal_row(v_entity_type, v_entity_id, v_user_id);
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'status', 'applied', 'mutationId', v_mutation_id,
          'entityType', v_entity_type, 'entityId', v_entity_id,
          'operation', v_operation, 'idempotent', true,
          'deduplicatedByDeviceSequence', true, 'row', v_row
        ));
        continue;
      end if;

      v_existing_selection_id := null;
      v_existing_course_id := null;
      v_existing_content_id := null;
      if v_entity_type = 'lessonProgress' then
        select selection_id, course_id, lesson_id
        into v_existing_selection_id, v_existing_course_id, v_existing_content_id
        from public.lesson_progress
        where id = v_entity_id and user_id = v_user_id;
      else
        select selection_id, course_id, card_id
        into v_existing_selection_id, v_existing_course_id, v_existing_content_id
        from public.card_progress
        where id = v_entity_id and user_id = v_user_id;
      end if;

      if v_operation = 'delete' then
        if v_existing_course_id is not null and (
          (v_course_id is not null and v_existing_course_id <> v_course_id)
          or (v_entity_type = 'lessonProgress'
            and private.try_uuid(v_payload ->> 'lessonId') is not null
            and v_existing_content_id <> private.try_uuid(v_payload ->> 'lessonId'))
          or (v_entity_type = 'cardProgress'
            and private.try_uuid(v_payload ->> 'cardId') is not null
            and v_existing_content_id <> private.try_uuid(v_payload ->> 'cardId'))
        ) then
          raise exception 'Identidade imutável do estado não corresponde ao envelope.'
            using errcode = '23514';
        end if;
        if v_entity_type = 'lessonProgress' then
          delete from public.lesson_progress where id = v_entity_id and user_id = v_user_id;
        else
          delete from public.card_progress where id = v_entity_id and user_id = v_user_id;
        end if;
      else
        v_selection_id := private.try_uuid(v_payload ->> 'selectionId');
        if v_selection_id is null then
          select id into v_selection_id from public.user_course_selections
          where user_id = v_user_id and course_id = v_course_id;
        end if;
        select * into v_selection from public.user_course_selections
        where id = v_selection_id and user_id = v_user_id;
        if not found or (v_course_id is not null and v_selection.course_id <> v_course_id) then
          raise exception 'Seleção de curso não autorizada.' using errcode = '42501';
        end if;
        v_course_id := v_selection.course_id;
        v_content_id := private.try_uuid(v_payload ->> case v_entity_type
          when 'lessonProgress' then 'lessonId' else 'cardId' end);
        if v_content_id is null then
          raise exception 'Estado de estudo exige a identidade do conteúdo.' using errcode = '22023';
        end if;
        if v_existing_course_id is not null and (
          v_existing_selection_id <> v_selection.id
          or v_existing_course_id <> v_selection.course_id
          or v_existing_content_id <> v_content_id
        ) then
          raise exception 'Identidade imutável do estado não corresponde à seleção.'
            using errcode = '23514';
        end if;

        if v_entity_type = 'lessonProgress' then
          insert into public.lesson_progress(
            id, selection_id, user_id, course_id, lesson_id, cursor, completed_at
          ) values(
            v_entity_id, v_selection.id, v_user_id, v_selection.course_id, v_content_id,
            (v_payload ->> 'cursor')::integer,
            (v_payload ->> 'completedAt')::timestamptz
          ) on conflict(id) do update set
            cursor = case when 'cursor' in (select jsonb_array_elements_text(v_changed))
              then excluded.cursor else lesson_progress.cursor end,
            completed_at = case when 'completedAt' in (select jsonb_array_elements_text(v_changed))
              then excluded.completed_at else lesson_progress.completed_at end,
            updated_at = now();
        else
          insert into public.card_progress(
            id, selection_id, user_id, course_id, card_id, completed_at, review_marked_at
          ) values(
            v_entity_id, v_selection.id, v_user_id, v_selection.course_id, v_content_id,
            (v_payload ->> 'completedAt')::timestamptz,
            (v_payload ->> 'reviewMarkedAt')::timestamptz
          ) on conflict(id) do update set
            completed_at = case when 'completedAt' in (select jsonb_array_elements_text(v_changed))
              then excluded.completed_at else card_progress.completed_at end,
            review_marked_at = case when 'reviewMarkedAt' in (select jsonb_array_elements_text(v_changed))
              then excluded.review_marked_at else card_progress.review_marked_at end,
            updated_at = now();
        end if;
      end if;

      select max(sequence) into v_sequence from private.sync_changes
      where audience_user_id = v_user_id
        and entity_type = v_entity_type and entity_id = v_entity_id;
      insert into private.sync_idempotency(
        user_id, mutation_id, request_hash, entity_type, entity_id, operation,
        device_id, client_sequence, applied_sequence
      ) values(
        v_user_id, v_mutation_id, v_hash, v_entity_type, v_entity_id, v_operation,
        p_device_id, v_client_sequence, v_sequence
      );
      v_device_processed := greatest(v_device_processed, v_client_sequence);
      update private.sync_devices set last_processed_mutation_sequence = v_device_processed
      where user_id = v_user_id and id = p_device_id;
      v_row := private.current_personal_row(v_entity_type, v_entity_id, v_user_id);
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'status', 'applied', 'mutationId', v_mutation_id,
        'entityType', v_entity_type, 'entityId', v_entity_id,
        'operation', v_operation, 'idempotent', false, 'row', v_row
      ));
    exception when others then
      get stacked diagnostics v_code = returned_sqlstate, v_message = message_text;
      if left(v_code, 2) not in ('22', '23') and v_code <> '42501' then raise; end if;
      if v_mutation_id is not null and coalesce(v_client_sequence, 0) > 0 then
        insert into private.sync_idempotency(
          user_id, mutation_id, request_hash, entity_type, entity_id, operation,
          device_id, client_sequence, outcome, error_code, error_message
        ) values(
          v_user_id, v_mutation_id, v_hash, coalesce(v_entity_type, 'lessonProgress'),
          v_entity_id, case when v_operation in ('upsert','delete') then v_operation else 'upsert' end,
          p_device_id, v_client_sequence, 'rejected', v_code,
          coalesce(v_message, 'Estado de estudo rejeitado.')
        ) on conflict do nothing;
        v_device_processed := greatest(v_device_processed, v_client_sequence);
        update private.sync_devices set last_processed_mutation_sequence = v_device_processed
        where user_id = v_user_id and id = p_device_id;
      end if;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'status', 'rejected', 'mutationId', v_mutation ->> 'mutationId',
        'entityType', v_mutation ->> 'entityType', 'entityId', v_mutation ->> 'entityId',
        'code', v_code, 'reason', 'invalid_mutation', 'message', v_message
      ));
    end;
  end loop;
  return jsonb_build_object('status', 'applied', 'results', v_results);
end;
$$;

create function private.apply_study_path_batch_v1(
  p_user_id uuid,
  p_device_id uuid,
  p_mutations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_items jsonb := coalesce(p_mutations, '[]'::jsonb);
  v_mutation jsonb;
  v_mutation_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_operation text;
  v_requested_operation text;
  v_payload jsonb;
  v_changed jsonb;
  v_hash text;
  v_existing private.sync_idempotency%rowtype;
  v_path_course public.study_path_courses%rowtype;
  v_path_id uuid;
  v_selection_id uuid;
  v_row jsonb;
  v_sequence bigint;
  v_client_sequence bigint;
  v_device_processed bigint;
  v_deleted_count bigint;
  v_results jsonb := '[]'::jsonb;
  v_code text;
  v_message text;
begin
  if p_user_id is null or p_device_id is null then
    raise exception 'Autenticação e deviceId são obrigatórios.' using errcode = '42501';
  end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) > 500 then
    raise exception 'Lote de Trilhas inválido.' using errcode = '22023';
  end if;

  insert into private.sync_devices(id, user_id, last_seen_at, inactive_at)
  values(p_device_id, p_user_id, now(), null)
  on conflict(user_id, id) do update set last_seen_at = now(), inactive_at = null;
  select last_processed_mutation_sequence into v_device_processed
  from private.sync_devices
  where user_id = p_user_id and id = p_device_id
  for update;

  for v_mutation in select value from jsonb_array_elements(v_items)
  loop
    begin
      v_deleted_count := 0;
      v_mutation_id := private.try_uuid(v_mutation ->> 'mutationId');
      v_entity_type := v_mutation ->> 'entityType';
      v_entity_id := private.try_uuid(v_mutation ->> 'entityId');
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
        extensions.digest(convert_to(v_mutation::text, 'UTF8'), 'sha256'), 'hex'
      );

      if v_mutation_id is not null then
        perform pg_advisory_xact_lock(hashtextextended(
          'sync-mutation:' || p_user_id::text || ':' || v_mutation_id::text, 0
        ));
        select * into v_existing
        from private.sync_idempotency
        where user_id = p_user_id and mutation_id = v_mutation_id;
        if found then
          if v_existing.request_hash <> v_hash then
            raise exception 'mutationId reutilizado com payload incompatível.'
              using errcode = '23514';
          end if;
          if v_existing.outcome = 'rejected' then
            v_results := v_results || jsonb_build_array(jsonb_build_object(
              'status', 'rejected', 'mutationId', v_existing.mutation_id,
              'entityType', v_existing.entity_type, 'entityId', v_existing.entity_id,
              'code', v_existing.error_code, 'reason', 'invalid_mutation',
              'message', v_existing.error_message, 'idempotent', true
            ));
          else
            v_results := v_results || jsonb_build_array(jsonb_build_object(
              'status', 'applied', 'mutationId', v_existing.mutation_id,
              'entityType', v_existing.entity_type, 'entityId', v_existing.entity_id,
              'operation', v_existing.operation, 'idempotent', true,
              'row', private.current_personal_row(
                v_existing.entity_type, v_existing.entity_id, p_user_id
              )
            ));
          end if;
          if coalesce(v_client_sequence, 0) > 0 then
            v_device_processed := greatest(v_device_processed, v_client_sequence);
            update private.sync_devices
            set last_processed_mutation_sequence = v_device_processed
            where user_id = p_user_id and id = p_device_id;
          end if;
          continue;
        end if;
      end if;

      if v_mutation_id is null
         or v_entity_id is null
         or coalesce(v_client_sequence, 0) <= 0
         or v_entity_type not in ('studyPaths', 'studyPathCourses')
         or v_operation not in ('upsert', 'delete')
         or jsonb_typeof(v_payload) <> 'object'
         or jsonb_typeof(v_changed) <> 'array'
         or exists(
           select 1 from jsonb_array_elements(v_changed) field
           where jsonb_typeof(field) <> 'string'
         ) then
        raise exception 'Envelope de Trilha inválido.' using errcode = '22023';
      end if;
      if exists(
        select 1 from jsonb_object_keys(v_payload) field
        where field not in (
          'id', 'ownerId', 'title', 'position', 'pathId', 'selectionId',
          'courseId', 'createdAt', 'updatedAt', 'deletedAt'
        )
      ) or exists(
        select 1 from jsonb_array_elements_text(v_changed) field
        where (v_entity_type = 'studyPaths' and field not in ('title', 'position'))
           or (v_entity_type = 'studyPathCourses'
             and field not in ('pathId', 'selectionId', 'courseId', 'position'))
      ) then
        raise exception 'Payload de Trilha contém campo desconhecido.' using errcode = '22023';
      end if;
      if v_requested_operation = 'update' and jsonb_array_length(v_changed) = 0 then
        raise exception 'Update exige changedFields.' using errcode = '22023';
      end if;
      if v_requested_operation = 'update' and exists(
        select 1 from jsonb_array_elements_text(v_changed) field
        where not (v_payload ? field)
      ) then
        raise exception 'Payload patch diverge de changedFields.' using errcode = '22023';
      end if;

      if v_client_sequence <= v_device_processed then
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'status', 'applied', 'mutationId', v_mutation_id,
          'entityType', v_entity_type, 'entityId', v_entity_id,
          'operation', v_operation, 'idempotent', true,
          'deduplicatedByDeviceSequence', true,
          'row', private.current_personal_row(v_entity_type, v_entity_id, p_user_id)
        ));
        continue;
      end if;

      if v_operation = 'delete' then
        if v_entity_type = 'studyPaths' then
          delete from public.study_paths where id = v_entity_id and owner_id = p_user_id;
        else
          delete from public.study_path_courses where id = v_entity_id and owner_id = p_user_id;
        end if;
        get diagnostics v_deleted_count = row_count;
        v_row := null;
      elsif v_entity_type = 'studyPaths' then
        if (v_payload ? 'title') and (
          nullif(btrim(v_payload ->> 'title'), '') is null
          or char_length(v_payload ->> 'title') > 160
        ) then
          raise exception 'Título da Trilha inválido.' using errcode = '22023';
        end if;
        if (v_payload ? 'position') and coalesce(v_payload ->> 'position', '') !~ '^[0-9]+$' then
          raise exception 'Posição da Trilha inválida.' using errcode = '22023';
        end if;
        perform 1 from public.study_paths
        where id = v_entity_id and owner_id = p_user_id;
        if found then
          update public.study_paths set
            title = case when v_payload ? 'title' then v_payload ->> 'title' else title end,
            position = case when v_payload ? 'position'
              then (v_payload ->> 'position')::integer else position end
          where id = v_entity_id and owner_id = p_user_id;
        else
          if exists(select 1 from public.study_paths where id = v_entity_id) then
            raise exception 'Trilha pertence a outra conta.' using errcode = '42501';
          end if;
          if not (v_payload ? 'title') then
            raise exception 'Nova Trilha exige título.' using errcode = '22023';
          end if;
          insert into public.study_paths(id, owner_id, title, position)
          values(
            v_entity_id, p_user_id, v_payload ->> 'title',
            coalesce((v_payload ->> 'position')::integer, 0)
          );
        end if;
        v_row := private.current_personal_row(v_entity_type, v_entity_id, p_user_id);
      else
        select * into v_path_course
        from public.study_path_courses
        where id = v_entity_id and owner_id = p_user_id;
        v_path_id := case
          when found and not (v_payload ? 'pathId') then v_path_course.path_id
          else private.try_uuid(v_payload ->> 'pathId')
        end;
        v_selection_id := case
          when found and not (v_payload ? 'selectionId' or v_payload ? 'courseId')
            then v_path_course.selection_id
          else private.try_uuid(v_payload ->> 'selectionId')
        end;
        if v_selection_id is null and private.try_uuid(v_payload ->> 'courseId') is not null then
          select selection.id into v_selection_id
          from public.user_course_selections selection
          where selection.user_id = p_user_id
            and selection.course_id = private.try_uuid(v_payload ->> 'courseId');
        end if;
        if not exists(
          select 1 from public.study_paths path
          where path.id = v_path_id and path.owner_id = p_user_id
        ) or not exists(
          select 1 from public.user_course_selections selection
          where selection.id = v_selection_id and selection.user_id = p_user_id
        ) then
          raise exception 'Trilha ou seleção não autorizada.' using errcode = '42501';
        end if;
        insert into public.study_path_courses(id, path_id, owner_id, selection_id, position)
        values(
          v_entity_id, v_path_id, p_user_id, v_selection_id,
          coalesce((v_payload ->> 'position')::integer, 0)
        )
        on conflict(id) do update set
          path_id = excluded.path_id,
          selection_id = excluded.selection_id,
          position = case when v_payload ? 'position'
            then excluded.position else public.study_path_courses.position end
        where public.study_path_courses.owner_id = p_user_id;
        if not found then
          raise exception 'Vínculo de Trilha pertence a outra conta.' using errcode = '42501';
        end if;
        v_row := private.current_personal_row(v_entity_type, v_entity_id, p_user_id);
      end if;

      select max(sequence) into v_sequence
      from private.sync_changes
      where audience_user_id = p_user_id
        and entity_type = v_entity_type and entity_id = v_entity_id;
      insert into private.sync_idempotency(
        user_id, mutation_id, request_hash, entity_type, entity_id, operation,
        device_id, client_sequence, applied_sequence
      ) values(
        p_user_id, v_mutation_id, v_hash, v_entity_type, v_entity_id, v_operation,
        p_device_id, v_client_sequence, v_sequence
      );
      v_device_processed := greatest(v_device_processed, v_client_sequence);
      update private.sync_devices set last_processed_mutation_sequence = v_device_processed
      where user_id = p_user_id and id = p_device_id;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'status', 'applied', 'mutationId', v_mutation_id,
        'entityType', v_entity_type, 'entityId', v_entity_id,
        'operation', v_operation,
        'idempotent', v_operation = 'delete' and v_deleted_count = 0,
        'row', v_row
      ));
    exception when others then
      get stacked diagnostics v_code = returned_sqlstate, v_message = message_text;
      if left(v_code, 2) not in ('22', '23') and v_code <> '42501' then raise; end if;
      if v_mutation_id is not null and coalesce(v_client_sequence, 0) > 0 then
        insert into private.sync_idempotency(
          user_id, mutation_id, request_hash, entity_type, entity_id, operation,
          device_id, client_sequence, outcome, error_code, error_message
        ) values(
          p_user_id, v_mutation_id, v_hash, coalesce(v_entity_type, 'studyPaths'),
          v_entity_id, case when v_operation in ('upsert', 'delete') then v_operation else 'upsert' end,
          p_device_id, v_client_sequence, 'rejected', v_code,
          coalesce(v_message, 'Mutação de Trilha rejeitada.')
        ) on conflict do nothing;
        v_device_processed := greatest(v_device_processed, v_client_sequence);
        update private.sync_devices set last_processed_mutation_sequence = v_device_processed
        where user_id = p_user_id and id = p_device_id;
      end if;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'status', 'rejected', 'mutationId', v_mutation ->> 'mutationId',
        'entityType', v_mutation ->> 'entityType', 'entityId', v_mutation ->> 'entityId',
        'code', v_code, 'reason', 'invalid_mutation', 'message', v_message
      ));
    end;
  end loop;
  return jsonb_build_object('status', 'applied', 'results', v_results);
end;
$$;

create or replace function public.apply_sync_batch(p_device_id uuid, p_mutations jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare v_user_id uuid := auth.uid();
begin
  return private.apply_study_path_batch_v1(v_user_id, p_device_id, p_mutations);
end;
$$;

drop function public.apply_sync_batch_without_situated_comments_v1(uuid, jsonb);
revoke all on function private.apply_study_path_batch_v1(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.bootstrap_replica(p_device_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_high_water bigint;
  v_snapshot jsonb;
  v_selected jsonb;
begin
  if v_user_id is null or p_device_id is null then
    raise exception 'Autenticação e deviceId são obrigatórios.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('aralearn-sync-feed-commit-order', 0));
  select greatest(
    (select compacted_through_sequence from private.sync_retention_policy where singleton),
    coalesce(max(sequence), 0)
  ) into v_high_water from private.sync_changes;
  insert into private.sync_devices(id, user_id, last_pulled_sequence, last_seen_at, inactive_at)
  values(p_device_id, v_user_id, v_high_water, now(), null)
  on conflict(user_id, id) do update set
    last_pulled_sequence = excluded.last_pulled_sequence,
    last_seen_at = now(), inactive_at = null;

  select jsonb_build_object(
    'courseSelections', coalesce((select jsonb_agg(private.selection_row(s.id) order by s.position,s.id)
      from public.user_course_selections s join public.courses c on c.id=s.course_id
      where s.user_id=v_user_id and c.status='published' and c.deleted_at is null
        and c.document_storage_enabled),'[]'::jsonb),
    'lessonProgress', coalesce((select jsonb_agg(private.local_row('lessonProgress',to_jsonb(t)) order by t.id)
      from public.lesson_progress t join public.user_course_selections s on s.id=t.selection_id and s.user_id=t.user_id
      join public.courses c on c.id=s.course_id where t.user_id=v_user_id and c.status='published'
        and c.deleted_at is null and c.document_storage_enabled),'[]'::jsonb),
    'cardProgress', coalesce((select jsonb_agg(private.local_row('cardProgress',to_jsonb(t)) order by t.id)
      from public.card_progress t join public.user_course_selections s on s.id=t.selection_id and s.user_id=t.user_id
      join public.courses c on c.id=s.course_id where t.user_id=v_user_id and c.status='published'
        and c.deleted_at is null and c.document_storage_enabled),'[]'::jsonb),
    'comments', coalesce((select jsonb_agg(private.local_row('comments',to_jsonb(t)) order by t.id)
      from public.card_comments t join public.user_course_selections s on s.id=t.selection_id and s.user_id=t.user_id
      join public.courses c on c.id=s.course_id where t.user_id=v_user_id and c.status='published'
        and c.deleted_at is null and c.document_storage_enabled),'[]'::jsonb),
    'studyPaths', coalesce((select jsonb_agg(private.jsonb_to_camel(to_jsonb(t)) order by t.position,t.id)
      from public.study_paths t where t.owner_id=v_user_id),'[]'::jsonb),
    'studyPathCourses', coalesce((select jsonb_agg(private.jsonb_to_camel(to_jsonb(t)) ||
        jsonb_build_object('courseId',s.course_id) order by t.position,t.id)
      from public.study_path_courses t join public.user_course_selections s on s.id=t.selection_id
      join public.courses c on c.id=s.course_id where t.owner_id=v_user_id and c.status='published'
        and c.deleted_at is null and c.document_storage_enabled),'[]'::jsonb)
  ) into v_snapshot;
  select coalesce(jsonb_agg(jsonb_build_object(
    'courseId',c.id,'publicationSeq',c.publication_seq,'contentHash',c.content_hash
  ) order by s.position,s.id),'[]'::jsonb) into v_selected
  from public.user_course_selections s join public.courses c on c.id=s.course_id
  where s.user_id=v_user_id and c.status='published' and c.deleted_at is null
    and c.document_storage_enabled;
  return jsonb_build_object(
    'snapshot',v_snapshot,'selectedCourses',v_selected,'highWaterSequence',v_high_water
  );
end;
$$;

revoke all on function public.apply_non_punitive_study_state_batch_v1(uuid,jsonb)
  from public, anon;
grant execute on function public.apply_non_punitive_study_state_batch_v1(uuid,jsonb)
  to authenticated;
revoke all on function public.apply_sync_batch(uuid,jsonb) from public, anon;
grant execute on function public.apply_sync_batch(uuid,jsonb) to authenticated;
revoke all on function public.bootstrap_replica(uuid) from public, anon;
grant execute on function public.bootstrap_replica(uuid) to authenticated;

create or replace function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'schemaRevision', '20260802000000',
    'contractVersion', 4,
    'features', jsonb_build_array(
      'lean-shared-catalog','artifact-offline-replica','granular-sync',
      'private-authoring','text-language-metadata','storage-artifact-control-plane',
      'pre-registered-publication-artifacts','single-current-course-revision',
      'storage-only-course-content','canonical-resource-registry','atomic-resource-authoring',
      'atomic-card-assistance','composed-authoring-workspaces','workspace-publication-bindings',
      'unchanged-publication-short-circuit','bounded-authoring-events','partial-private-publication',
      'microtheory-review-projection','workspace-cursor-pagination','workspace-event-cursor-pagination',
      'workspace-microsequence-card-pagination','global-catalog-course-search',
      'catalog-review-submissions','catalog-management','personal-library-course-removal',
      'course-revision-sync-compaction','automatic-sync-history-maintenance','compact-authoring-brief',
      'account-derived-authoring-capabilities','oauth-only-authoring-mcp','default-catalog-collection',
      'confidential-gpt-action-oauth','gpt-action-oauth-linking','gpt-action-oauth-relinking',
      'gpt-action-oauth-stable-callback','workspace-card-metadata','structured-authoring-errors',
      'current-state-central-v1','situated-personal-comments-v1',
      'educational-workspace-membership-v1','educational-workspace-invitations-v1',
      'workspace-capability-enforcement-v1','workspace-member-course-access-v1',
      'workspace-contextual-current-state-v1','workspace-pedagogical-comments-v1',
      'workspace-course-state-projection-v1','non-punitive-study-state-v1'
    )
  );
$function$;

revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest() to anon, authenticated;

commit;
