begin;

select pg_advisory_xact_lock(
  hashtextextended('aralearn-remove-relational-course-legacy-v3', 0)
);

-- A sincronização remota passa a aceitar exclusivamente estado pessoal.
-- Esta definição não referencia nenhuma tabela pedagógica e sobrevive ao corte.
create or replace function public.apply_sync_batch(p_device_id uuid, p_mutations jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_items jsonb := case when jsonb_typeof(p_mutations)='array' then p_mutations else p_mutations->'mutations' end;
  v_mutation jsonb;
  v_mutation_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_course_id uuid;
  v_operation text;
  v_requested_operation text;
  v_payload jsonb;
  v_changed jsonb;
  v_allowed_fields text[];
  v_mutable_fields text[];
  v_hash text;
  v_existing private.sync_idempotency%rowtype;
  v_selection public.user_course_selections%rowtype;
  v_path_course public.study_path_courses%rowtype;
  v_path_id uuid;
  v_selection_id uuid;
  v_existing_selection_id uuid;
  v_existing_course_id uuid;
  v_existing_content_id uuid;
  v_row jsonb;
  v_sequence bigint;
  v_was_deleted boolean;
  v_client_sequence bigint;
  v_device_processed bigint;
  v_results jsonb := '[]'::jsonb;
  v_code text;
  v_message text;
begin
  if v_user_id is null or p_device_id is null then
    raise exception 'Autenticação e deviceId são obrigatórios.' using errcode='42501';
  end if;
  if jsonb_typeof(v_items) <> 'array' then raise exception 'Mutações devem ser array.' using errcode='22023'; end if;

  insert into private.sync_devices(id,user_id,last_seen_at,inactive_at)
  values(p_device_id,v_user_id,now(),null)
  on conflict(user_id,id) do update set last_seen_at=now(),inactive_at=null;
  select last_processed_mutation_sequence into v_device_processed
    from private.sync_devices where user_id=v_user_id and id=p_device_id for update;

  for v_mutation in select value from jsonb_array_elements(v_items) loop
    begin
      v_mutation_id:=null; v_entity_type:=null; v_entity_id:=null;
      v_course_id:=null; v_client_sequence:=null;
      v_mutation_id := private.try_uuid(v_mutation->>'mutationId');
      if coalesce(v_mutation->>'sequence','')~'^[0-9]+$' then
        v_client_sequence:=(v_mutation->>'sequence')::bigint;
      end if;
      v_entity_type := v_mutation->>'entityType';
      v_entity_id := private.try_uuid(v_mutation->>'entityId');
      v_course_id := private.try_uuid(v_mutation->>'courseId');
      v_requested_operation := lower(coalesce(v_mutation->>'operation',''));
      v_operation := v_requested_operation;
      v_payload := coalesce(v_mutation->'payload','{}'::jsonb);
      v_changed := coalesce(v_mutation->'changedFields','[]'::jsonb);
      if v_operation in ('insert','update') then v_operation := 'upsert'; end if;
      v_hash := encode(extensions.digest(convert_to(v_mutation::text,'UTF8'),'sha256'),'hex');

      -- A terminal result is part of the idempotency contract too.  Consult the
      -- ledger before validating the envelope again, otherwise a lost rejected
      -- response would be re-evaluated forever (or be mistaken for an applied
      -- mutation once the device watermark had advanced).
      if v_mutation_id is not null then
        perform pg_advisory_xact_lock(hashtextextended(
          'sync-mutation:'||v_user_id::text||':'||v_mutation_id::text,0
        ));
        select * into v_existing from private.sync_idempotency
          where user_id=v_user_id and mutation_id=v_mutation_id;
        if found then
          if v_existing.request_hash<>v_hash then
            raise exception 'mutationId reutilizado com payload incompatível.' using errcode='23514';
          end if;
          if v_existing.outcome='rejected' then
            v_results := v_results || jsonb_build_array(jsonb_build_object(
              'status','rejected','mutationId',v_existing.mutation_id,
              'entityType',v_existing.entity_type,'entityId',v_existing.entity_id,
              'code',v_existing.error_code,'reason','invalid_mutation',
              'message',v_existing.error_message,'idempotent',true
            ));
          else
            v_row := private.current_personal_row(
              v_existing.entity_type,v_existing.entity_id,v_user_id
            );
            v_results := v_results || jsonb_build_array(jsonb_build_object(
              'status','applied','mutationId',v_existing.mutation_id,
              'entityType',v_existing.entity_type,'entityId',v_existing.entity_id,
              'operation',v_existing.operation,'idempotent',true,'row',v_row
            ));
          end if;
          if coalesce(v_client_sequence,0)>0 then
            v_device_processed:=greatest(v_device_processed,v_client_sequence);
            update private.sync_devices set last_processed_mutation_sequence=v_device_processed
              where user_id=v_user_id and id=p_device_id;
          end if;
          continue;
        end if;
      end if;

      if v_mutation_id is null or v_entity_id is null or coalesce(v_client_sequence,0)<=0
         or v_entity_type not in ('lessonProgress','cardProgress','comments','studyPaths','studyPathCourses')
         or v_operation not in ('upsert','delete') or jsonb_typeof(v_payload)<>'object'
         or jsonb_typeof(v_changed)<>'array'
         or exists(select 1 from jsonb_array_elements(v_changed) f where jsonb_typeof(f)<>'string') then
        raise exception 'Envelope de mutação inválido.' using errcode='22023';
      end if;
      v_mutable_fields:=case v_entity_type
        when 'lessonProgress' then array['cursor','firstViewedAt','completedAt','lastActivityAt']
        when 'cardProgress' then array['firstViewedAt','completedAt','attempts','lastResult','lastActivityAt']
        when 'comments' then array['body']
        when 'studyPaths' then array['title','position']
        when 'studyPathCourses' then array['pathId','selectionId','courseId','position']
      end;
      v_allowed_fields:=v_mutable_fields||case v_entity_type
        when 'lessonProgress' then array[
          'id','userId','courseId','selectionId','lessonId','moduleId',
          'courseKey','moduleKey','lessonKey','pathKey','createdAt','updatedAt','deletedAt'
        ]
        when 'cardProgress' then array[
          'id','userId','courseId','selectionId','moduleId','lessonId','microsequenceId',
          'lessonProgressId','cardId','courseKey','moduleKey','lessonKey','microsequenceKey',
          'pathKey','cardKey','position','createdAt','updatedAt','deletedAt'
        ]
        when 'comments' then array[
          'id','userId','courseId','selectionId','moduleId','lessonId','microsequenceId','cardId',
          'courseKey','moduleKey','lessonKey','microsequenceKey','cardKey',
          'createdAt','updatedAt','deletedAt'
        ]
        when 'studyPaths' then array['id','ownerId','createdAt','updatedAt','deletedAt']
        when 'studyPathCourses' then array['id','ownerId','createdAt','updatedAt','deletedAt']
      end;
      if exists(select 1 from jsonb_object_keys(v_payload) k where not(k=any(v_allowed_fields))) then
        raise exception 'Payload contém campo desconhecido para %.',v_entity_type using errcode='22023';
      end if;
      if exists(select 1 from jsonb_array_elements_text(v_changed) f
        where not(f=any(v_allowed_fields))) then
        raise exception 'changedFields contém campo desconhecido.' using errcode='22023';
      end if;
      if v_requested_operation='update' and exists(
        select 1 from jsonb_array_elements_text(v_changed) f
        where not(f=any(v_mutable_fields))
      ) then
        raise exception 'changedFields de update contém campo imutável.' using errcode='22023';
      end if;
      if v_requested_operation='update' then
        if jsonb_array_length(v_changed)=0 then
          raise exception 'Update exige changedFields.' using errcode='22023';
        end if;
        if exists(select 1 from jsonb_object_keys(v_payload) k
          where k=any(v_mutable_fields)
            and not exists(select 1 from jsonb_array_elements_text(v_changed) f where f=k))
          or exists(select 1 from jsonb_array_elements_text(v_changed) f where not(v_payload?f)) then
          raise exception 'Payload patch diverge de changedFields.' using errcode='22023';
        end if;
      elsif v_requested_operation='insert' then
        -- Deterministic entity IDs mean two offline devices may both believe a
        -- row is new.  If the second insert finds it already present, its full
        -- mutable state is the later LWW value.
        select coalesce(jsonb_agg(to_jsonb(field_name)),'[]'::jsonb) into v_changed
        from unnest(v_mutable_fields) field_name where v_payload?field_name;
      end if;
      if v_client_sequence<=v_device_processed then
        v_row:=private.current_personal_row(v_entity_type,v_entity_id,v_user_id);
        v_results:=v_results||jsonb_build_array(jsonb_build_object(
          'status','applied','mutationId',v_mutation_id,'entityType',v_entity_type,
          'entityId',v_entity_id,'operation',v_operation,'idempotent',true,
          'deduplicatedByDeviceSequence',true,'row',v_row
        ));
        continue;
      end if;

      if v_operation='delete' then
        v_existing_selection_id:=null;
        v_existing_course_id:=null;
        v_existing_content_id:=null;
        if v_entity_type='lessonProgress' then
          select selection_id,course_id,lesson_id
            into v_existing_selection_id,v_existing_course_id,v_existing_content_id
            from public.lesson_progress where id=v_entity_id and user_id=v_user_id;
          if found and (
            (v_course_id is not null and v_existing_course_id<>v_course_id)
            or (private.try_uuid(v_payload->>'selectionId') is not null
              and v_existing_selection_id<>private.try_uuid(v_payload->>'selectionId'))
            or (private.try_uuid(v_payload->>'lessonId') is not null
              and v_existing_content_id<>private.try_uuid(v_payload->>'lessonId'))
          ) then raise exception 'Identidade imutável da entidade não corresponde ao envelope.' using errcode='23514'; end if;
          delete from public.lesson_progress where id=v_entity_id and user_id=v_user_id;
        elsif v_entity_type='cardProgress' then
          select selection_id,course_id,card_id
            into v_existing_selection_id,v_existing_course_id,v_existing_content_id
            from public.card_progress where id=v_entity_id and user_id=v_user_id;
          if found and (
            (v_course_id is not null and v_existing_course_id<>v_course_id)
            or (private.try_uuid(v_payload->>'selectionId') is not null
              and v_existing_selection_id<>private.try_uuid(v_payload->>'selectionId'))
            or (private.try_uuid(v_payload->>'cardId') is not null
              and v_existing_content_id<>private.try_uuid(v_payload->>'cardId'))
          ) then raise exception 'Identidade imutável da entidade não corresponde ao envelope.' using errcode='23514'; end if;
          delete from public.card_progress where id=v_entity_id and user_id=v_user_id;
        elsif v_entity_type='comments' then
          select selection_id,course_id,card_id
            into v_existing_selection_id,v_existing_course_id,v_existing_content_id
            from public.card_comments where id=v_entity_id and user_id=v_user_id;
          if found and (
            (v_course_id is not null and v_existing_course_id<>v_course_id)
            or (private.try_uuid(v_payload->>'selectionId') is not null
              and v_existing_selection_id<>private.try_uuid(v_payload->>'selectionId'))
            or (private.try_uuid(v_payload->>'cardId') is not null
              and v_existing_content_id<>private.try_uuid(v_payload->>'cardId'))
          ) then raise exception 'Identidade imutável da entidade não corresponde ao envelope.' using errcode='23514'; end if;
          delete from public.card_comments where id=v_entity_id and user_id=v_user_id;
        elsif v_entity_type='studyPaths' then
          delete from public.study_paths where id=v_entity_id and owner_id=v_user_id;
        elsif v_entity_type='studyPathCourses' then
          delete from public.study_path_courses where id=v_entity_id and owner_id=v_user_id;
        end if;
        v_was_deleted:=found;
        select max(sequence) into v_sequence from private.sync_changes
          where audience_user_id=v_user_id and entity_type=v_entity_type and entity_id=v_entity_id;
        insert into private.sync_idempotency(
          user_id,mutation_id,request_hash,entity_type,entity_id,operation,
          device_id,client_sequence,applied_sequence
        ) values(v_user_id,v_mutation_id,v_hash,v_entity_type,v_entity_id,'delete',
          p_device_id,v_client_sequence,v_sequence);
        v_device_processed:=greatest(v_device_processed,v_client_sequence);
        update private.sync_devices set last_processed_mutation_sequence=v_device_processed
          where user_id=v_user_id and id=p_device_id;
        v_results:=v_results||jsonb_build_array(jsonb_build_object(
          'status','applied','mutationId',v_mutation_id,'entityType',v_entity_type,
          'entityId',v_entity_id,'operation','delete','idempotent',not v_was_deleted,'row',null
        ));
        continue;
      end if;

      if v_entity_type in ('lessonProgress','cardProgress','comments') then
        v_selection_id := private.try_uuid(coalesce(v_payload->>'selectionId',v_payload->>'selection_id'));
        if v_selection_id is null then
          select id into v_selection_id from public.user_course_selections
          where user_id=v_user_id and course_id=v_course_id;
        end if;
        select * into v_selection from public.user_course_selections
          where id=v_selection_id and user_id=v_user_id;
        if not found or (v_course_id is not null and v_selection.course_id<>v_course_id) then
          raise exception 'Seleção de curso não autorizada.' using errcode='42501';
        end if;
        v_course_id := v_selection.course_id;

        -- An entity ID is stable across devices.  A stale or malformed envelope
        -- must never use a valid selection for course B to patch an existing
        -- row that actually belongs to course A in the same account.
        v_existing_selection_id:=null;
        v_existing_course_id:=null;
        v_existing_content_id:=null;
        if v_entity_type='lessonProgress' then
          select selection_id,course_id,lesson_id
            into v_existing_selection_id,v_existing_course_id,v_existing_content_id
            from public.lesson_progress where id=v_entity_id and user_id=v_user_id;
        elsif v_entity_type='cardProgress' then
          select selection_id,course_id,card_id
            into v_existing_selection_id,v_existing_course_id,v_existing_content_id
            from public.card_progress where id=v_entity_id and user_id=v_user_id;
        elsif v_entity_type='comments' then
          select selection_id,course_id,card_id
            into v_existing_selection_id,v_existing_course_id,v_existing_content_id
            from public.card_comments where id=v_entity_id and user_id=v_user_id;
        end if;
        if v_existing_course_id is not null and (
          v_existing_selection_id<>v_selection.id or v_existing_course_id<>v_selection.course_id
          or (v_entity_type='lessonProgress' and private.try_uuid(v_payload->>'lessonId') is not null
            and v_existing_content_id<>private.try_uuid(v_payload->>'lessonId'))
          or (v_entity_type in ('cardProgress','comments') and private.try_uuid(v_payload->>'cardId') is not null
            and v_existing_content_id<>private.try_uuid(v_payload->>'cardId'))
        ) then
          raise exception 'Identidade imutável da entidade não corresponde à seleção.' using errcode='23514';
        end if;
      end if;

      if v_entity_type='lessonProgress' then
        if exists(select 1 from public.lesson_progress where id=v_entity_id and user_id=v_user_id) then
          update public.lesson_progress set
            cursor=case when private.patch_field_selected(v_changed,'cursor') and v_payload?'cursor'
              then (v_payload->>'cursor')::integer else cursor end,
            first_viewed_at=case when private.patch_field_selected(v_changed,'firstViewedAt') and v_payload?'firstViewedAt'
              then (v_payload->>'firstViewedAt')::timestamptz else first_viewed_at end,
            completed_at=case when private.patch_field_selected(v_changed,'completedAt') and v_payload?'completedAt'
              then (v_payload->>'completedAt')::timestamptz else completed_at end,
            last_activity_at=case when private.patch_field_selected(v_changed,'lastActivityAt') and v_payload?'lastActivityAt'
              then (v_payload->>'lastActivityAt')::timestamptz else last_activity_at end
          where id=v_entity_id and user_id=v_user_id;
        else
          insert into public.lesson_progress(
            id,selection_id,user_id,course_id,lesson_id,cursor,
            first_viewed_at,completed_at,last_activity_at
          ) values(
            v_entity_id,v_selection.id,v_user_id,v_selection.course_id,
            private.try_uuid(v_payload->>'lessonId'),(v_payload->>'cursor')::integer,
            (v_payload->>'firstViewedAt')::timestamptz,(v_payload->>'completedAt')::timestamptz,
            (v_payload->>'lastActivityAt')::timestamptz
          );
        end if;
      elsif v_entity_type='cardProgress' then
        if exists(select 1 from public.card_progress where id=v_entity_id and user_id=v_user_id) then
          update public.card_progress set
            first_viewed_at=case when private.patch_field_selected(v_changed,'firstViewedAt') and v_payload?'firstViewedAt'
              then (v_payload->>'firstViewedAt')::timestamptz else first_viewed_at end,
            completed_at=case when private.patch_field_selected(v_changed,'completedAt') and v_payload?'completedAt'
              then (v_payload->>'completedAt')::timestamptz else completed_at end,
            attempts=case when private.patch_field_selected(v_changed,'attempts') and v_payload?'attempts'
              then (v_payload->>'attempts')::integer else attempts end,
            last_result=case when private.patch_field_selected(v_changed,'lastResult') and v_payload?'lastResult'
              then v_payload->>'lastResult' else last_result end,
            last_activity_at=case when private.patch_field_selected(v_changed,'lastActivityAt') and v_payload?'lastActivityAt'
              then (v_payload->>'lastActivityAt')::timestamptz else last_activity_at end
          where id=v_entity_id and user_id=v_user_id;
        else
          insert into public.card_progress(
            id,selection_id,user_id,course_id,card_id,first_viewed_at,
            completed_at,attempts,last_result,last_activity_at
          ) values(
            v_entity_id,v_selection.id,v_user_id,v_selection.course_id,
            private.try_uuid(v_payload->>'cardId'),(v_payload->>'firstViewedAt')::timestamptz,
            (v_payload->>'completedAt')::timestamptz,coalesce((v_payload->>'attempts')::integer,0),
            v_payload->>'lastResult',(v_payload->>'lastActivityAt')::timestamptz
          );
        end if;
      elsif v_entity_type='comments' then
        if exists(select 1 from public.card_comments where id=v_entity_id and user_id=v_user_id) then
          update public.card_comments set body=case
            when private.patch_field_selected(v_changed,'body') and v_payload?'body' then v_payload->>'body'
            else body end
          where id=v_entity_id and user_id=v_user_id;
        else
          insert into public.card_comments(
            id,selection_id,user_id,course_id,card_id,body
          ) values(
            v_entity_id,v_selection.id,v_user_id,v_selection.course_id,
            private.try_uuid(v_payload->>'cardId'),v_payload->>'body'
          );
        end if;
      elsif v_entity_type='studyPaths' then
        if exists(select 1 from public.study_paths where id=v_entity_id and owner_id=v_user_id) then
          update public.study_paths set
            title=case when private.patch_field_selected(v_changed,'title') and v_payload?'title'
              then v_payload->>'title' else title end,
            position=case when private.patch_field_selected(v_changed,'position') and v_payload?'position'
              then (v_payload->>'position')::integer else position end
          where id=v_entity_id and owner_id=v_user_id;
        else
          insert into public.study_paths(id,owner_id,title,position)
          values(v_entity_id,v_user_id,v_payload->>'title',coalesce((v_payload->>'position')::integer,0));
        end if;
      elsif v_entity_type='studyPathCourses' then
        select * into v_path_course from public.study_path_courses
          where id=v_entity_id and owner_id=v_user_id;
        if found then
          v_path_id:=case when private.patch_field_selected(v_changed,'pathId') and v_payload?'pathId'
            then private.try_uuid(v_payload->>'pathId') else v_path_course.path_id end;
          v_selection_id:=case when private.patch_field_selected(v_changed,'selectionId')
              and v_payload?'selectionId' then private.try_uuid(v_payload->>'selectionId')
            else v_path_course.selection_id end;
          if private.patch_field_selected(v_changed,'courseId') and v_payload?'courseId'
             and not(v_payload?'selectionId') then
            select id into v_selection_id from public.user_course_selections
            where user_id=v_user_id and course_id=private.try_uuid(v_payload->>'courseId');
          end if;
        else
          v_path_id:=private.try_uuid(v_payload->>'pathId');
          v_selection_id:=private.try_uuid(v_payload->>'selectionId');
          if v_selection_id is null and private.try_uuid(v_payload->>'courseId') is not null then
            select id into v_selection_id from public.user_course_selections
            where user_id=v_user_id and course_id=private.try_uuid(v_payload->>'courseId');
          end if;
        end if;
        if not exists(select 1 from public.study_paths where id=v_path_id and owner_id=v_user_id)
           or not exists(select 1 from public.user_course_selections where id=v_selection_id and user_id=v_user_id) then
          raise exception 'Trilha ou seleção não autorizada.' using errcode='42501';
        end if;
        if v_path_course.id is not null then
          update public.study_path_courses set
            path_id=case when private.patch_field_selected(v_changed,'pathId') and v_payload?'pathId'
              then v_path_id else path_id end,
            selection_id=case when (private.patch_field_selected(v_changed,'selectionId')
              or private.patch_field_selected(v_changed,'courseId'))
              and (v_payload?'selectionId' or v_payload?'courseId') then v_selection_id else selection_id end,
            position=case when private.patch_field_selected(v_changed,'position') and v_payload?'position'
              then (v_payload->>'position')::integer else position end
          where id=v_entity_id and owner_id=v_user_id;
        else
          insert into public.study_path_courses(id,path_id,owner_id,selection_id,position)
          values(v_entity_id,v_path_id,v_user_id,v_selection_id,coalesce((v_payload->>'position')::integer,0));
        end if;
      end if;

      select max(sequence) into v_sequence from private.sync_changes
      where audience_user_id=v_user_id and entity_type=v_entity_type and entity_id=v_entity_id;
      insert into private.sync_idempotency(
        user_id,mutation_id,request_hash,entity_type,entity_id,operation,
        device_id,client_sequence,applied_sequence
      ) values(v_user_id,v_mutation_id,v_hash,v_entity_type,v_entity_id,v_operation,
        p_device_id,v_client_sequence,v_sequence);
      v_device_processed:=greatest(v_device_processed,v_client_sequence);
      update private.sync_devices set last_processed_mutation_sequence=v_device_processed
        where user_id=v_user_id and id=p_device_id;
      v_row:=private.current_personal_row(v_entity_type,v_entity_id,v_user_id);
      v_results:=v_results||jsonb_build_array(jsonb_build_object(
        'status','applied','mutationId',v_mutation_id,'entityType',v_entity_type,
        'entityId',v_entity_id,'operation',v_operation,'idempotent',false,'row',v_row
      ));
    exception when others then
      get stacked diagnostics v_code=returned_sqlstate,v_message=message_text;
      -- Convert only deterministic client/data failures into a terminal
      -- rejection.  Unknown SQLSTATEs are treated as service defects or
      -- infrastructure failures and roll the whole RPC back, so the outbox can
      -- retry safely instead of losing a valid offline mutation.
      if left(v_code,2) not in ('22','23') and v_code <> '42501' then
        raise;
      end if;
      if v_mutation_id is not null and coalesce(v_client_sequence,0)>0 then
        insert into private.sync_idempotency(
          user_id,mutation_id,request_hash,entity_type,entity_id,operation,
          device_id,client_sequence,outcome,error_code,error_message
        ) values(
          v_user_id,v_mutation_id,v_hash,coalesce(v_entity_type,'invalid'),v_entity_id,
          case when v_operation in ('upsert','delete') then v_operation else 'upsert' end,
          p_device_id,v_client_sequence,'rejected',v_code,coalesce(v_message,'Mutação rejeitada.')
        ) on conflict do nothing;
      end if;
      if coalesce(v_client_sequence,0)>0 then
        v_device_processed:=greatest(v_device_processed,v_client_sequence);
        update private.sync_devices set last_processed_mutation_sequence=v_device_processed
          where user_id=v_user_id and id=p_device_id;
      end if;
      v_results:=v_results||jsonb_build_array(jsonb_build_object(
        'status','rejected','mutationId',v_mutation->>'mutationId','entityType',v_mutation->>'entityType',
        'entityId',v_mutation->>'entityId','code',v_code,'reason','invalid_mutation','message',v_message
      ));
    end;
  end loop;
  return jsonb_build_object('status','applied','results',v_results);
end;
$$;


drop function if exists private.apply_sync_batch_core(uuid, jsonb) cascade;

do $$
declare
  v_function record;
begin
  for v_function in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and (
        p.proname like '%catalog_submission%'
        or p.proname like '%official_catalog_import%'
        or p.proname like '%course_content_revision%'
        or p.proname like '%personal_course_creation%'
        or p.proname like '%personal_course%'
        or p.proname in (
          'create_personal_course',
          'fork_catalog_course_for_editing',
          'clone_catalog_course',
          'refresh_personal_course_from_source',
          'delete_personal_course',
          'get_personal_course_graph',
          'get_selected_course_graph',
          'get_personal_library_course_structure',
          'get_catalog_course_structure_admin',
          'rename_personal_library_course',
          'update_catalog_course_metadata_admin',
          'import_official_course',
          'apply_sync_batch_legacy',
          'apply_personal_state_sync_batch',
          'select_catalog_course_lean'
        )
      )
  loop
    execute format('drop function if exists %s cascade', v_function.signature);
  end loop;
end;
$$;

drop table if exists private.catalog_submission_authoring_receipts cascade;
drop table if exists private.catalog_course_submissions cascade;
drop table if exists private.course_content_revision_receipts cascade;
drop table if exists private.course_content_revisions cascade;
drop table if exists private.official_catalog_import_stage_rows cascade;
drop table if exists private.official_catalog_import_chunks cascade;
drop table if exists private.official_catalog_imports cascade;
drop table if exists private.authoring_private_import_stage_rows cascade;
drop table if exists private.authoring_private_import_chunks cascade;
drop table if exists private.authoring_private_imports cascade;

alter table public.courses
  drop column if exists source_course_id cascade;

drop table if exists public.learning_component_placements cascade;
drop table if exists public.learning_component_relations cascade;
drop table if exists public.learning_component_topic_links cascade;
drop table if exists public.learning_components cascade;
drop table if exists public.node_practice_items cascade;
drop table if exists public.node_practices cascade;
drop table if exists public.flow_practices cascade;
drop table if exists public.flow_cases cascade;
drop table if exists public.flow_nodes cascade;
drop table if exists public.block_highlights cascade;
drop table if exists public.block_lines cascade;
drop table if exists public.block_points cascade;
drop table if exists public.block_cells cascade;
drop table if exists public.block_matrix_items cascade;
drop table if exists public.block_edges cascade;
drop table if exists public.block_nodes cascade;
drop table if exists public.block_options cascade;
drop table if exists public.card_refs cascade;
drop table if exists public.card_blocks cascade;
drop table if exists public.cards cascade;
drop table if exists public.microsequence_statements cascade;
drop table if exists public.microsequence_dependencies cascade;
drop table if exists public.microsequences cascade;
drop table if exists public.topic_statements cascade;
drop table if exists public.lesson_topics cascade;
drop table if exists public.guide_items cascade;
drop table if exists public.course_guides cascade;
drop table if exists public.lessons cascade;
drop table if exists public.modules cascade;

delete from private.sync_changes
where entity_type not in (
  'courseSelections',
  'lessonProgress',
  'cardProgress',
  'comments',
  'studyPaths',
  'studyPathCourses',
  'coursePublication'
);

create or replace function private.selection_row(p_selection_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.jsonb_to_camel(to_jsonb(selection)) || jsonb_build_object(
    'publicationSeq', course.publication_seq,
    'contentHash', course.content_hash,
    'title', course.title,
    'goal', course.goal,
    'contractKey', course.contract_key
  )
  from public.user_course_selections selection
  join public.courses course on course.id = selection.course_id
  where selection.id = p_selection_id
    and course.status = 'published'
    and course.deleted_at is null
    and course.document_storage_enabled;
$$;

create or replace function private.current_personal_row(
  p_entity_type text,
  p_entity_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_row jsonb;
begin
  if p_entity_type = 'courseSelections' then
    select private.selection_row(selection.id)
    into v_row
    from public.user_course_selections selection
    where selection.id = p_entity_id
      and selection.user_id = p_user_id;
  elsif p_entity_type = 'lessonProgress' then
    select private.local_row('lessonProgress', to_jsonb(progress))
    into v_row
    from public.lesson_progress progress
    where progress.id = p_entity_id
      and progress.user_id = p_user_id;
  elsif p_entity_type = 'cardProgress' then
    select private.local_row('cardProgress', to_jsonb(progress))
    into v_row
    from public.card_progress progress
    where progress.id = p_entity_id
      and progress.user_id = p_user_id;
  elsif p_entity_type = 'comments' then
    select private.local_row('comments', to_jsonb(comment))
    into v_row
    from public.card_comments comment
    where comment.id = p_entity_id
      and comment.user_id = p_user_id;
  elsif p_entity_type = 'studyPaths' then
    select private.jsonb_to_camel(to_jsonb(path))
    into v_row
    from public.study_paths path
    where path.id = p_entity_id
      and path.owner_id = p_user_id;
  elsif p_entity_type = 'studyPathCourses' then
    select private.jsonb_to_camel(to_jsonb(path_course))
      || jsonb_build_object('courseId', selection.course_id)
    into v_row
    from public.study_path_courses path_course
    join public.user_course_selections selection
      on selection.id = path_course.selection_id
    where path_course.id = p_entity_id
      and path_course.owner_id = p_user_id;
  end if;
  return v_row;
end;
$$;

create or replace function public.select_catalog_course(
  p_course_id uuid,
  p_mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_hash text;
  v_ledger private.sync_idempotency%rowtype;
  v_selection public.user_course_selections%rowtype;
  v_sequence bigint;
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if p_course_id is null or p_mutation_id is null then
    raise exception 'courseId e mutationId são obrigatórios.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.courses course
    where course.id = p_course_id
      and course.owner_id is null
      and course.status = 'published'
      and course.deleted_at is null
      and course.document_storage_enabled
  ) then
    raise exception 'Curso oficial publicado não encontrado.' using errcode = '22023';
  end if;

  v_hash := encode(
    extensions.digest(convert_to('select:' || p_course_id::text, 'UTF8'), 'sha256'),
    'hex'
  );
  perform pg_advisory_xact_lock(
    hashtextextended('selection:' || v_user_id::text || ':' || p_course_id::text, 0)
  );

  select *
  into v_ledger
  from private.sync_idempotency
  where user_id = v_user_id
    and mutation_id = p_mutation_id;
  if found then
    if v_ledger.request_hash <> v_hash or v_ledger.operation <> 'select' then
      raise exception 'mutationId reutilizado com operação incompatível.'
        using errcode = '23514';
    end if;
    select *
    into v_selection
    from public.user_course_selections
    where user_id = v_user_id
      and course_id = p_course_id;
    return jsonb_build_object(
      'status', 'applied',
      'mutationId', p_mutation_id,
      'idempotent', true,
      'selectionId', v_selection.id,
      'row', private.selection_row(v_selection.id),
      'desiredSelected', true,
      'currentSelected', v_selection.id is not null,
      'superseded', v_selection.id is null
    );
  end if;

  insert into public.user_course_selections(user_id, course_id, position)
  values(
    v_user_id,
    p_course_id,
    coalesce((
      select max(selection.position) + 1
      from public.user_course_selections selection
      where selection.user_id = v_user_id
    ), 0)
  )
  on conflict(user_id, course_id) do update
  set updated_at = public.user_course_selections.updated_at
  returning * into v_selection;

  select max(sequence)
  into v_sequence
  from private.sync_changes
  where audience_user_id = v_user_id
    and entity_type = 'courseSelections'
    and entity_id = v_selection.id;

  insert into private.sync_idempotency(
    user_id, mutation_id, request_hash, entity_type, entity_id, operation,
    applied_sequence
  )
  values(
    v_user_id, p_mutation_id, v_hash, 'courseSelections', v_selection.id,
    'select', v_sequence
  );

  return jsonb_build_object(
    'status', 'applied',
    'mutationId', p_mutation_id,
    'idempotent', false,
    'selectionId', v_selection.id,
    'courseId', p_course_id,
    'row', private.selection_row(v_selection.id),
    'desiredSelected', true,
    'currentSelected', true,
    'superseded', false
  );
end;
$$;

create or replace function public.unselect_catalog_course(
  p_course_id uuid,
  p_mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_hash text;
  v_ledger private.sync_idempotency%rowtype;
  v_selection public.user_course_selections%rowtype;
  v_sequence bigint;
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if p_course_id is null or p_mutation_id is null then
    raise exception 'courseId e mutationId são obrigatórios.' using errcode = '22023';
  end if;

  v_hash := encode(
    extensions.digest(convert_to('unselect:' || p_course_id::text, 'UTF8'), 'sha256'),
    'hex'
  );
  perform pg_advisory_xact_lock(
    hashtextextended('selection:' || v_user_id::text || ':' || p_course_id::text, 0)
  );
  select *
  into v_ledger
  from private.sync_idempotency
  where user_id = v_user_id
    and mutation_id = p_mutation_id;
  if found then
    if v_ledger.request_hash <> v_hash or v_ledger.operation <> 'unselect' then
      raise exception 'mutationId reutilizado com operação incompatível.'
        using errcode = '23514';
    end if;
    select *
    into v_selection
    from public.user_course_selections
    where user_id = v_user_id
      and course_id = p_course_id;
    return jsonb_build_object(
      'status', 'applied',
      'mutationId', p_mutation_id,
      'idempotent', true,
      'courseId', p_course_id,
      'selectionId', v_ledger.entity_id,
      'desiredSelected', false,
      'currentSelected', v_selection.id is not null,
      'superseded', v_selection.id is not null,
      'row', private.selection_row(v_selection.id)
    );
  end if;

  select *
  into v_selection
  from public.user_course_selections
  where user_id = v_user_id
    and course_id = p_course_id
  for update;
  if not found then
    insert into private.sync_idempotency(
      user_id, mutation_id, request_hash, entity_type, entity_id, operation,
      applied_sequence
    )
    values(
      v_user_id, p_mutation_id, v_hash, 'courseSelections', null, 'unselect', null
    );
    return jsonb_build_object(
      'status', 'applied',
      'mutationId', p_mutation_id,
      'idempotent', true,
      'courseId', p_course_id,
      'selectionId', null,
      'desiredSelected', false,
      'currentSelected', false,
      'superseded', false
    );
  end if;

  perform set_config('aralearn.suppress_sync_changes', 'on', true);
  delete from public.user_course_selections where id = v_selection.id;
  perform set_config('aralearn.suppress_sync_changes', 'off', true);
  perform pg_advisory_xact_lock(hashtextextended('aralearn-sync-feed-commit-order', 0));
  insert into private.sync_changes(
    audience_user_id, course_id, entity_type, entity_id, operation
  )
  values(v_user_id, p_course_id, 'courseSelections', v_selection.id, 'delete')
  returning sequence into v_sequence;
  insert into private.sync_idempotency(
    user_id, mutation_id, request_hash, entity_type, entity_id, operation,
    applied_sequence
  )
  values(
    v_user_id, p_mutation_id, v_hash, 'courseSelections', v_selection.id,
    'unselect', v_sequence
  );
  return jsonb_build_object(
    'status', 'applied',
    'mutationId', p_mutation_id,
    'idempotent', false,
    'courseId', p_course_id,
    'selectionId', v_selection.id,
    'desiredSelected', false,
    'currentSelected', false,
    'superseded', false
  );
end;
$$;

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
  )
  into v_high_water
  from private.sync_changes;
  insert into private.sync_devices(
    id, user_id, last_pulled_sequence, last_seen_at, inactive_at
  )
  values(p_device_id, v_user_id, v_high_water, now(), null)
  on conflict(user_id, id) do update set
    last_pulled_sequence = excluded.last_pulled_sequence,
    last_seen_at = now(),
    inactive_at = null;

  select jsonb_build_object(
    'courseSelections', coalesce((
      select jsonb_agg(private.selection_row(selection.id) order by selection.position, selection.id)
      from public.user_course_selections selection
      join public.courses course on course.id = selection.course_id
      where selection.user_id = v_user_id
        and course.status = 'published'
        and course.deleted_at is null
        and course.document_storage_enabled
    ), '[]'::jsonb),
    'lessonProgress', coalesce((
      select jsonb_agg(private.local_row('lessonProgress', to_jsonb(progress)) order by progress.id)
      from public.lesson_progress progress
      join public.user_course_selections selection
        on selection.id = progress.selection_id and selection.user_id = progress.user_id
      join public.courses course on course.id = selection.course_id
      where progress.user_id = v_user_id
        and course.status = 'published'
        and course.deleted_at is null
        and course.document_storage_enabled
    ), '[]'::jsonb),
    'cardProgress', coalesce((
      select jsonb_agg(private.local_row('cardProgress', to_jsonb(progress)) order by progress.id)
      from public.card_progress progress
      join public.user_course_selections selection
        on selection.id = progress.selection_id and selection.user_id = progress.user_id
      join public.courses course on course.id = selection.course_id
      where progress.user_id = v_user_id
        and course.status = 'published'
        and course.deleted_at is null
        and course.document_storage_enabled
    ), '[]'::jsonb),
    'comments', coalesce((
      select jsonb_agg(private.local_row('comments', to_jsonb(comment)) order by comment.id)
      from public.card_comments comment
      join public.user_course_selections selection
        on selection.id = comment.selection_id and selection.user_id = comment.user_id
      join public.courses course on course.id = selection.course_id
      where comment.user_id = v_user_id
        and course.status = 'published'
        and course.deleted_at is null
        and course.document_storage_enabled
    ), '[]'::jsonb),
    'studyPaths', coalesce((
      select jsonb_agg(private.jsonb_to_camel(to_jsonb(path)) order by path.position, path.id)
      from public.study_paths path
      where path.owner_id = v_user_id
    ), '[]'::jsonb),
    'studyPathCourses', coalesce((
      select jsonb_agg(
        private.jsonb_to_camel(to_jsonb(path_course))
          || jsonb_build_object('courseId', selection.course_id)
        order by path_course.position, path_course.id
      )
      from public.study_path_courses path_course
      join public.user_course_selections selection on selection.id = path_course.selection_id
      join public.courses course on course.id = selection.course_id
      where path_course.owner_id = v_user_id
        and course.status = 'published'
        and course.deleted_at is null
        and course.document_storage_enabled
    ), '[]'::jsonb)
  )
  into v_snapshot;

  select coalesce(jsonb_agg(jsonb_build_object(
    'courseId', course.id,
    'publicationSeq', course.publication_seq,
    'contentHash', course.content_hash
  ) order by selection.position, selection.id), '[]'::jsonb)
  into v_selected
  from public.user_course_selections selection
  join public.courses course on course.id = selection.course_id
  where selection.user_id = v_user_id
    and course.status = 'published'
    and course.deleted_at is null
    and course.document_storage_enabled;

  return jsonb_build_object(
    'snapshot', v_snapshot,
    'selectedCourses', v_selected,
    'highWaterSequence', v_high_water
  );
end;
$$;

create or replace function public.list_catalog_collections(p_query text default '')
returns table(
  collection_id uuid,
  collection_key text,
  collection_title text,
  collection_description text,
  collection_position integer,
  course_id uuid,
  contract_key text,
  title text,
  goal text,
  publication_seq bigint,
  content_hash text,
  module_count bigint,
  lesson_count bigint,
  is_selected boolean,
  selection_id uuid
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_query text := btrim(coalesce(p_query, ''));
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  return query
  select
    collection.id,
    collection.contract_key,
    collection.title,
    collection.description,
    collection.position,
    course.id,
    course.contract_key,
    course.title,
    course.goal,
    course.publication_seq,
    course.content_hash,
    course.module_count,
    course.lesson_count,
    selection.id is not null,
    selection.id
  from public.catalog_collections collection
  join public.catalog_collection_courses item
    on item.collection_id = collection.id and item.deleted_at is null
  join public.courses course
    on course.id = item.course_id
    and course.owner_id is null
    and course.status = 'published'
    and course.deleted_at is null
    and course.document_storage_enabled
  left join public.user_course_selections selection
    on selection.course_id = course.id and selection.user_id = v_user_id
  where collection.is_published
    and collection.deleted_at is null
    and (
      v_query = ''
      or collection.title ilike '%' || v_query || '%'
      or collection.description ilike '%' || v_query || '%'
      or course.title ilike '%' || v_query || '%'
      or course.goal ilike '%' || v_query || '%'
    )
  order by collection.position, collection.title, item.position, course.title, course.id;
end;
$$;

create or replace function public.list_user_course_summaries()
returns table(
  selection_id uuid,
  course_id uuid,
  contract_key text,
  title text,
  goal text,
  "position" integer,
  publication_seq bigint,
  content_hash text,
  module_count bigint,
  lesson_count bigint,
  last_activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  return query
  select
    selection.id,
    course.id,
    course.contract_key,
    course.title,
    course.goal,
    selection.position,
    course.publication_seq,
    course.content_hash,
    course.module_count,
    course.lesson_count,
    greatest(
      (select max(progress.last_activity_at)
       from public.lesson_progress progress
       where progress.selection_id = selection.id),
      (select max(progress.last_activity_at)
       from public.card_progress progress
       where progress.selection_id = selection.id)
    )
  from public.user_course_selections selection
  join public.courses course on course.id = selection.course_id
  where selection.user_id = v_user_id
    and course.status = 'published'
    and course.deleted_at is null
    and course.document_storage_enabled
  order by selection.position, selection.created_at, selection.id;
end;
$$;

create or replace function public.list_catalog_courses_admin(
  p_actor_user_id uuid,
  p_collection_id uuid,
  p_limit integer default 50,
  p_after_position integer default null,
  p_after_id uuid default null,
  p_query text default ''
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_query text := btrim(coalesce(p_query, ''));
  v_result jsonb;
begin
  perform private.require_catalog_admin_actor(p_actor_user_id, false);

  if p_collection_id is null
     or p_limit is null or p_limit < 1 or p_limit > 100
     or (p_after_position is null) <> (p_after_id is null)
     or (p_after_position is not null and p_after_position < 0)
     or char_length(v_query) > 200 then
    raise exception 'Paginação de cursos inválida.'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.catalog_collections collection
    where collection.id = p_collection_id
      and collection.is_published
      and collection.deleted_at is null
  ) then
    raise exception 'Coleção de catálogo inexistente ou indisponível.'
      using errcode = 'P0002';
  end if;

  with candidates as materialized (
    select
      item.id as placement_id,
      item.position,
      item.revision as placement_revision,
      course.id,
      course.contract_key,
      course.title,
      course.goal,
      course.publication_seq,
      course.content_hash,
      course.catalog_revision,
      course.updated_at,
      course.module_count as module_count,
      course.lesson_count as lesson_count
    from public.catalog_collection_courses item
    join public.courses course
      on course.id = item.course_id
     and course.owner_id is null
     and course.status = 'published'
     and course.deleted_at is null
     and course.document_storage_enabled
    where item.collection_id = p_collection_id
      and item.deleted_at is null
      and (
        v_query = ''
        or course.title ilike '%' || v_query || '%'
        or course.goal ilike '%' || v_query || '%'
        or course.contract_key ilike '%' || v_query || '%'
      )
      and (
        p_after_position is null
        or (item.position, course.id) > (p_after_position, p_after_id)
      )
    order by item.position, course.id
    limit p_limit + 1
  ),
  page as (
    select * from candidates
    order by position, id
    limit p_limit
  )
  select jsonb_build_object(
    'collectionId', p_collection_id,
    'items',
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'placementId', page.placement_id,
        'placementRevision', page.placement_revision,
        'position', page.position,
        'courseId', page.id,
        'contractKey', page.contract_key,
        'title', page.title,
        'goal', page.goal,
        'publicationSeq', page.publication_seq,
        'contentHash', page.content_hash,
        'revision', page.catalog_revision,
        'moduleCount', page.module_count,
        'lessonCount', page.lesson_count,
        'updatedAt', page.updated_at
      ) order by page.position, page.id)
      from page
    ), '[]'::jsonb),
    'nextCursor',
    case when (select count(*) from candidates) > p_limit then (
      select jsonb_build_object(
        'afterPosition', page.position,
        'afterId', page.id
      )
      from page
      order by page.position desc, page.id desc
      limit 1
    ) else null end
  )
  into v_result;

  return v_result;
end;
$$;


create or replace function public.get_catalog_course_admin(
  p_actor_user_id uuid,
  p_course_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_result jsonb;
begin
  perform private.require_catalog_admin_actor(p_actor_user_id, false);

  if p_course_id is null then
    raise exception 'Curso oficial inválido.'
      using errcode = '22023';
  end if;

  select jsonb_build_object(
    'courseId', course.id,
    'contractKey', course.contract_key,
    'title', course.title,
    'goal', course.goal,
    'publicationSeq', course.publication_seq,
    'contentHash', course.content_hash,
    'revision', course.catalog_revision,
    'updatedAt', course.updated_at,
    'collection', jsonb_build_object(
      'collectionId', collection.id,
      'contractKey', collection.contract_key,
      'title', collection.title,
      'position', item.position,
      'placementRevision', item.revision
    ),
    'counts', jsonb_build_object(
      'modules', course.module_count,
      'lessons', course.lesson_count,
      'microsequences', course.microsequence_count,
      'cards', course.card_count
    )
  )
  into v_result
  from public.courses course
  join public.catalog_collection_courses item
    on item.course_id = course.id
   and item.deleted_at is null
  join public.catalog_collections collection
    on collection.id = item.collection_id
   and collection.is_published
   and collection.deleted_at is null
  where course.id = p_course_id
    and course.owner_id is null
    and course.status = 'published'
    and course.deleted_at is null
   and course.document_storage_enabled;

  if v_result is null then
    raise exception 'Curso oficial inexistente ou indisponível.'
      using errcode = 'P0002';
  end if;
  return v_result;
end;
$$;


create or replace function public.list_personal_library_courses(
  p_actor_user_id uuid,
  p_client_id uuid,
  p_limit integer default 50,
  p_after_position integer default null,
  p_after_selection_id uuid default null,
  p_query text default ''
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_query text := btrim(coalesce(p_query, ''));
  v_items jsonb := '[]'::jsonb;
  v_item record;
  v_count integer := 0;
  v_has_more boolean := false;
  v_last_position integer;
  v_last_selection_id uuid;
begin
  perform private.require_personal_library_client(
    p_actor_user_id,
    p_client_id,
    'authoring:private:read'
  );

  if p_limit is null
     or p_limit not between 1 and 100
     or char_length(v_query) > 160
     or (
       (p_after_position is null) <>
       (p_after_selection_id is null)
     )
     or (
       p_after_position is not null
       and p_after_position < 0
     ) then
    raise exception 'Paginação da biblioteca pessoal inválida.'
      using errcode = '22023';
  end if;

  for v_item in
    select
      selection.position,
      selection.id as selection_id,
      jsonb_build_object(
        'selectionId', selection.id,
        'courseId', course.id,
        'kind', case
          when course.owner_id is null then 'official'
          else 'personal'
        end,
        'contractKey', course.contract_key,
        'title', course.title,
        'goal', course.goal,
        'position', selection.position,
        'publicationSeq', course.publication_seq,
        'catalogRevision', course.catalog_revision,
        'contentHash', course.content_hash,
        'moduleCount', course.module_count,
        'lessonCount', course.lesson_count,
        'pathId', path.id,
        'pathTitle', path.title,
        'lastActivityAt', greatest(
          (
            select max(progress.last_activity_at)
            from public.lesson_progress progress
            where progress.selection_id = selection.id
          ),
          (
            select max(progress.last_activity_at)
            from public.card_progress progress
            where progress.selection_id = selection.id
          )
        )
      ) as item
    from public.user_course_selections selection
    join public.courses course
      on course.id = selection.course_id
    left join public.study_path_courses path_course
      on path_course.owner_id = p_actor_user_id
      and path_course.selection_id = selection.id
    left join public.study_paths path
      on path.id = path_course.path_id
      and path.owner_id = p_actor_user_id
    where selection.user_id = p_actor_user_id
      and course.status = 'published'
      and course.deleted_at is null
      and course.document_storage_enabled
      and (
        course.owner_id is null
        or course.owner_id = p_actor_user_id
      )
      and (
        v_query = ''
        or position(lower(v_query) in lower(
          course.title || ' ' || course.goal || ' ' ||
          course.contract_key
        )) > 0
      )
      and (
        p_after_position is null
        or (selection.position, selection.id) >
          (p_after_position, p_after_selection_id)
      )
    order by selection.position, selection.id
    limit p_limit + 1
  loop
    v_count := v_count + 1;
    if v_count > p_limit then
      v_has_more := true;
      exit;
    end if;
    v_items := v_items || jsonb_build_array(v_item.item);
    v_last_position := v_item.position;
    v_last_selection_id := v_item.selection_id;
  end loop;

  return jsonb_build_object(
    'items', v_items,
    'nextCursor', case when v_has_more then jsonb_build_object(
      'afterPosition', v_last_position,
      'afterSelectionId', v_last_selection_id
    ) else null end
  );
end;
$$;



revoke all on function public.apply_sync_batch(uuid, jsonb) from public, anon;
grant execute on function public.apply_sync_batch(uuid, jsonb) to authenticated;
revoke all on function public.select_catalog_course(uuid, uuid) from public, anon;
grant execute on function public.select_catalog_course(uuid, uuid) to authenticated;
revoke all on function public.unselect_catalog_course(uuid, uuid) from public, anon;
grant execute on function public.unselect_catalog_course(uuid, uuid) to authenticated;
revoke all on function public.bootstrap_replica(uuid) from public, anon;
grant execute on function public.bootstrap_replica(uuid) to authenticated;
revoke all on function public.list_catalog_collections(text) from public, anon;
grant execute on function public.list_catalog_collections(text) to authenticated;
revoke all on function public.list_user_course_summaries() from public, anon;
grant execute on function public.list_user_course_summaries() to authenticated;
revoke all on function public.list_catalog_courses_admin(
  uuid, uuid, integer, integer, uuid, text
) from public, anon, authenticated;
grant execute on function public.list_catalog_courses_admin(
  uuid, uuid, integer, integer, uuid, text
) to service_role;
revoke all on function public.get_catalog_course_admin(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_catalog_course_admin(uuid, uuid)
  to service_role;
revoke all on function public.list_personal_library_courses(
  uuid, uuid, integer, integer, uuid, text
) from public, anon, authenticated;
grant execute on function public.list_personal_library_courses(
  uuid, uuid, integer, integer, uuid, text
) to service_role;

comment on function public.apply_sync_batch(uuid, jsonb) is
  'Sincroniza somente progresso, comentários e organização pessoal; conteúdo de curso vive no Storage.';
comment on function public.list_catalog_collections(text) is
  'Lista metadados pequenos e contagens materializadas; a revisão completa vive no Storage.';
comment on function public.list_user_course_summaries() is
  'Lista a biblioteca do usuário sem consultar uma árvore pedagógica relacional.';

commit;
