begin;

do $course_source_human_locators_preflight$
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision' <> '20260824174101' then
    raise exception 'A revisão anterior do runtime não corresponde à esperada.'
      using errcode = '55000';
  end if;
end;
$course_source_human_locators_preflight$;

alter table private.course_source_anchor_revisions
  add column human_locator text;

alter table private.course_source_anchor_revisions
  add constraint course_source_anchor_revisions_human_locator_v1 check(
    human_locator is null or (
      char_length(human_locator) between 1 and 500
      and octet_length(human_locator) <= 2000
      and human_locator = btrim(human_locator)
      and human_locator !~ '[[:cntrl:]]'
    )
  );

alter function public.get_owned_course_sources_for_actor_v1(
  uuid,uuid,bigint,text,text,text,text,text,integer
) set schema private;

alter function private.get_owned_course_sources_for_actor_v1(
  uuid,uuid,bigint,text,text,text,text,text,integer
) rename to get_owned_course_sources_with_attachments_v1;

create function public.get_owned_course_sources_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_revision bigint,
  p_mode text,
  p_source_id text default null,
  p_target_kind text default null,
  p_target_id text default null,
  p_cursor text default null,
  p_limit integer default 10
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog,public,private
as $function$
declare
  v_result jsonb;
  v_items jsonb;
begin
  perform private.require_service_role();
  -- O núcleo chamado abaixo conserva o bloqueio for share da leitura canônica.
  v_result := private.get_owned_course_sources_with_attachments_v1(
    p_actor_id,p_course_id,p_expected_revision,p_mode,p_source_id,
    p_target_kind,p_target_id,p_cursor,p_limit
  );
  if p_mode = 'source' then
    select coalesce(jsonb_agg(
      item.value || jsonb_build_object(
        'anchors',coalesce((
          select jsonb_agg(
            anchor.value || case when anchor_revision.human_locator is null
              then '{}'::jsonb
              else jsonb_build_object('humanLocator',anchor_revision.human_locator)
            end order by anchor.ordinal
          )
          from jsonb_array_elements(item.value->'anchors')
            with ordinality anchor(value,ordinal)
          join private.course_source_anchor_revisions anchor_revision
            on anchor_revision.course_id = p_course_id
           and anchor_revision.anchor_id = anchor.value->>'anchorId'
           and anchor_revision.revision = (anchor.value->>'revision')::bigint
        ),'[]'::jsonb)
      ) order by item.ordinal
    ),'[]'::jsonb) into v_items
    from jsonb_array_elements(v_result->'items')
      with ordinality item(value,ordinal);
    v_result := jsonb_set(v_result,'{items}',v_items,false);
  end if;
  if octet_length(v_result::text) > 262144 then
    raise exception 'Leitura de Fontes excede 256 KiB.' using errcode = '54000';
  end if;
  return v_result;
end;
$function$;

alter function public.get_course_study_citations_v1(uuid,bigint,text)
  set schema private;

alter function private.get_course_study_citations_v1(uuid,bigint,text)
  rename to get_course_study_citations_core_v1;

create function public.get_course_study_citations_v1(
  p_course_id uuid,
  p_expected_revision bigint,
  p_study_unit_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog,public,private,auth
as $function$
declare
  v_result jsonb;
  v_citations jsonb;
begin
  -- O núcleo chamado abaixo conserva o bloqueio for share da leitura canônica.
  v_result := private.get_course_study_citations_core_v1(
    p_course_id,p_expected_revision,p_study_unit_id
  );
  select coalesce(jsonb_agg(
    citation.value || jsonb_build_object(
      'anchors',coalesce((
        select jsonb_agg(
          anchor.value || case when anchor_revision.human_locator is null
            then '{}'::jsonb
            else jsonb_build_object('humanLocator',anchor_revision.human_locator)
          end order by anchor.ordinal
        )
        from jsonb_array_elements(citation.value->'anchors')
          with ordinality anchor(value,ordinal)
        join private.course_source_anchor_revisions anchor_revision
          on anchor_revision.course_id = p_course_id
         and anchor_revision.anchor_id = anchor.value->>'anchorId'
         and anchor_revision.revision = (anchor.value->>'anchorRevision')::bigint
      ),'[]'::jsonb)
    ) order by citation.ordinal
  ),'[]'::jsonb) into v_citations
  from jsonb_array_elements(v_result->'citations')
    with ordinality citation(value,ordinal);
  v_result := jsonb_set(v_result,'{citations}',v_citations,false);
  if octet_length(v_result::text) > 262144 then
    raise exception 'Citações públicas excedem 256 KiB.' using errcode = '54000';
  end if;
  return v_result;
end;
$function$;

alter function public.execute_course_source_command_for_actor_v1(
  uuid,uuid,bigint,jsonb,text,text
) set schema private;

alter function private.execute_course_source_command_for_actor_v1(
  uuid,uuid,bigint,jsonb,text,text
) rename to execute_course_source_command_core_v1;

create function public.execute_course_source_command_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_revision bigint,
  p_command jsonb,
  p_channel text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private,auth,extensions
as $function$
declare
  v_hash text;
  v_hash_command jsonb;
  v_receipt private.course_change_receipts%rowtype;
  v_course public.courses%rowtype;
  v_source record;
  v_anchor record;
  v_changed boolean := false;
  v_subject_revision bigint;
  v_result jsonb;
begin
  if jsonb_typeof(p_command) is distinct from 'object'
     or p_command->>'type' is distinct from 'save_anchor' then
    return private.execute_course_source_command_core_v1(
      p_actor_id,p_course_id,p_expected_revision,p_command,p_channel,p_request_id
    );
  end if;
  v_hash_command := p_command;
  if not p_command ? 'humanLocator' then
    p_command := p_command || jsonb_build_object('humanLocator',null);
  end if;
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_revision is null or p_expected_revision < 1
     or p_channel not in ('application','mcp')
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or octet_length(p_command::text) > 196608 then
    raise exception 'Comando de Fonte inválido.' using errcode = '22023';
  end if;
  if p_command - 'type' - 'anchorId' - 'sourceId' - 'sourceRevision'
       - 'expectedAnchorRevision' - 'selector' - 'humanLocator'
       - 'verificationExcerpt' <> '{}'::jsonb
     or not (p_command ?& array[
       'type','anchorId','sourceId','sourceRevision','expectedAnchorRevision',
       'selector','humanLocator','verificationExcerpt'
     ])
     or jsonb_typeof(p_command->'anchorId') <> 'string'
     or char_length(p_command->>'anchorId') not between 1 and 240
     or p_command->>'anchorId' <> btrim(p_command->>'anchorId')
     or p_command->>'anchorId' ~ '[[:cntrl:]]'
     or jsonb_typeof(p_command->'sourceId') <> 'string'
     or char_length(p_command->>'sourceId') not between 1 and 2048
     or p_command->>'sourceId' ~ '[[:cntrl:]]'
     or jsonb_typeof(p_command->'sourceRevision') <> 'number'
     or p_command->>'sourceRevision' !~ '^[1-9][0-9]*$'
     or jsonb_typeof(p_command->'expectedAnchorRevision') <> 'number'
     or p_command->>'expectedAnchorRevision' !~ '^[0-9]+$'
     or jsonb_typeof(p_command->'selector') <> 'object'
     or jsonb_typeof(p_command->'humanLocator') not in ('string','null')
     or jsonb_typeof(p_command->'verificationExcerpt') not in ('string','null')
     or (jsonb_typeof(p_command->'humanLocator') = 'string' and (
       char_length(p_command->>'humanLocator') not between 1 and 500
       or p_command->>'humanLocator' <> btrim(p_command->>'humanLocator')
       or p_command->>'humanLocator' ~ '[[:cntrl:]]'
     )) then
    raise exception 'save_anchor possui shape inválido.' using errcode = '22023';
  end if;
  v_hash := private.course_source_json_hash_v1(jsonb_build_object(
    'courseId',p_course_id,'expectedRevision',p_expected_revision,
    'channel',p_channel,'command',v_hash_command
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:' || p_actor_id::text || ':' || p_request_id,0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  select * into v_receipt from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'execute_course_source_command'
       or v_receipt.course_id <> p_course_id
       or v_receipt.request_hash <> v_hash then
      raise exception 'requestId reutilizado com comando de Fonte incompatível.'
        using errcode = '23514';
    end if;
    return (v_receipt.result - 'idempotent') || jsonb_build_object('idempotent',true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('course-row:' || p_course_id::text,0));
  select * into strict v_course from public.courses course
  where course.id = p_course_id for update;
  if v_course.revision <> p_expected_revision then
    raise exception 'O Curso mudou; releia antes de salvar a Fonte.' using errcode = '40001';
  end if;
  select * into v_source from private.course_source_revisions source
  where source.course_id = p_course_id
    and source.source_id = p_command->>'sourceId'
  order by source.revision desc limit 1;
  if not found or v_source.status <> 'active'
     or v_source.revision <> (p_command->>'sourceRevision')::bigint then
    raise exception 'Âncora exige a revisão corrente e ativa da Fonte.' using errcode = '23514';
  end if;
  select * into v_anchor from private.course_source_anchor_revisions anchor_value
  where anchor_value.course_id = p_course_id
    and anchor_value.anchor_id = p_command->>'anchorId'
  order by anchor_value.revision desc limit 1;
  if coalesce(v_anchor.revision,0) <> (p_command->>'expectedAnchorRevision')::bigint then
    raise exception 'A Âncora mudou; releia antes de salvar.' using errcode = '40001';
  end if;
  if v_anchor.revision is not null and (
    v_anchor.source_id <> p_command->>'sourceId'
    or v_anchor.source_revision <> (p_command->>'sourceRevision')::bigint
  ) then
    raise exception 'A identidade da Âncora permanece presa à revisão original da Fonte.'
      using errcode = '23514';
  end if;
  if not exists(
    select 1 from private.course_source_anchor_revisions existing_anchor
    where existing_anchor.course_id = p_course_id
      and existing_anchor.source_id = p_command->>'sourceId'
      and existing_anchor.source_revision = (p_command->>'sourceRevision')::bigint
      and existing_anchor.anchor_id = p_command->>'anchorId'
  ) and (
    select count(distinct existing_anchor.anchor_id)
    from private.course_source_anchor_revisions existing_anchor
    where existing_anchor.course_id = p_course_id
      and existing_anchor.source_id = p_command->>'sourceId'
      and existing_anchor.source_revision = (p_command->>'sourceRevision')::bigint
  ) >= 8 then
    raise exception 'Uma revisão de Fonte aceita no máximo oito identidades de Âncora.'
      using errcode = '23514';
  end if;
  if v_anchor.revision is not null and v_anchor.status = 'active'
     and v_anchor.source_id = p_command->>'sourceId'
     and v_anchor.source_revision = (p_command->>'sourceRevision')::bigint
     and v_anchor.selector = p_command->'selector'
     and v_anchor.human_locator is not distinct from p_command#>>'{humanLocator}'
     and v_anchor.verification_excerpt is not distinct from p_command#>>'{verificationExcerpt}' then
    v_subject_revision := v_anchor.revision;
  else
    insert into private.course_source_anchor_revisions(
      course_id,anchor_id,revision,source_id,source_revision,status,
      selector,human_locator,verification_excerpt,actor_id
    ) values(
      p_course_id,p_command->>'anchorId',coalesce(v_anchor.revision,0)+1,
      p_command->>'sourceId',(p_command->>'sourceRevision')::bigint,'active',
      p_command->'selector',p_command#>>'{humanLocator}',
      p_command#>>'{verificationExcerpt}',p_actor_id
    ) returning * into v_anchor;
    v_changed := true;
    v_subject_revision := v_anchor.revision;
  end if;
  if v_changed then
    update public.courses course
    set revision = course.revision + 1,updated_at = now()
    where course.id = p_course_id returning * into v_course;
    insert into private.course_events(course_id,revision,operation,summary,actor_id)
    values(
      p_course_id,v_course.revision,'update_course_sources',
      jsonb_build_object(
        'activityKind','course_source_changed','channel',p_channel,
        'commandType','save_anchor','subjectIdHash',
          private.course_source_json_hash_v1(to_jsonb(p_command->>'anchorId')),
        'subjectRevision',v_subject_revision
      ),p_actor_id
    );
  end if;
  v_result := jsonb_build_object(
    'contract','aralearn.course-source-change.v1',
    'courseId',p_course_id,'courseRevision',v_course.revision,
    'requestId',p_request_id,'idempotent',false,'changed',v_changed,
    'change',case when v_changed then jsonb_build_object(
      'type','save_anchor','subjectId',p_command->>'anchorId','revision',v_subject_revision
    ) else null end
  );
  insert into private.course_change_receipts(
    actor_id,request_id,operation,course_id,request_hash,result
  ) values(
    p_actor_id,p_request_id,'execute_course_source_command',p_course_id,v_hash,v_result
  );
  return v_result;
exception when serialization_failure then
  raise sqlstate 'PGRST' using
    message = jsonb_build_object(
      'code','40001','message',sqlerrm,'details',null,'hint',null
    )::text,
    detail = jsonb_build_object(
      'status',409,'headers',jsonb_build_object()
    )::text;
end;
$function$;

comment on column private.course_source_anchor_revisions.human_locator is
  'Localizador humano declarado pelo material, distinto do seletor técnico exato.';

comment on function public.get_course_study_citations_v1(uuid,bigint,text) is
  'Leitura autenticada redigida de referências humanas e localizadores das Fontes efetivas.';

revoke all on function private.get_owned_course_sources_with_attachments_v1(
  uuid,uuid,bigint,text,text,text,text,text,integer
), private.get_course_study_citations_core_v1(
  uuid,bigint,text
), private.execute_course_source_command_core_v1(
  uuid,uuid,bigint,jsonb,text,text
), public.get_owned_course_sources_for_actor_v1(
  uuid,uuid,bigint,text,text,text,text,text,integer
), public.get_course_study_citations_v1(
  uuid,bigint,text
), public.execute_course_source_command_for_actor_v1(
  uuid,uuid,bigint,jsonb,text,text
) from public,anon,authenticated,service_role;

grant execute on function public.get_owned_course_sources_for_actor_v1(
  uuid,uuid,bigint,text,text,text,text,text,integer
), public.execute_course_source_command_for_actor_v1(
  uuid,uuid,bigint,jsonb,text,text
) to service_role;

grant execute on function public.get_course_study_citations_v1(uuid,bigint,text)
to authenticated;

do $advance_course_source_human_locators_manifest$
declare
  v_manifest jsonb;
  v_body text;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  if not (v_manifest->'features' ? 'course-source-human-locators-v1') then
    v_manifest := jsonb_set(
      v_manifest,
      '{features}',
      (v_manifest->'features') || to_jsonb('course-source-human-locators-v1'::text)
    );
  end if;
  v_manifest := jsonb_set(
    v_manifest,
    '{schemaRevision}',
    to_jsonb('20260825190000'::text)
  );
  v_body := 'select ' || quote_literal(v_manifest::text) || '::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      || 'returns jsonb language sql stable security definer '
      || 'set search_path = pg_catalog as %L',
    v_body
  );
end;
$advance_course_source_human_locators_manifest$;

do $course_source_human_locators_postflight$
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision' <> '20260825190000'
     or not (public.get_aralearn_runtime_manifest()->'features'
       @> '["course-source-human-locators-v1"]'::jsonb) then
    raise exception 'O manifesto não anunciou os localizadores humanos de Fontes.'
      using errcode = '55000';
  end if;
  if not exists(
    select 1
    from pg_attribute attribute_value
    where attribute_value.attrelid = 'private.course_source_anchor_revisions'::regclass
      and attribute_value.attname = 'human_locator'
      and not attribute_value.attisdropped
  ) then
    raise exception 'O histórico de Âncoras não recebeu o localizador humano.'
      using errcode = '55000';
  end if;
  if to_regprocedure(
    'private.execute_course_source_command_core_v1(uuid,uuid,bigint,jsonb,text,text)'
  ) is null or to_regprocedure(
    'public.execute_course_source_command_for_actor_v1(uuid,uuid,bigint,jsonb,text,text)'
  ) is null then
    raise exception 'A fronteira compatível de comandos de Fontes não foi criada.'
      using errcode = '55000';
  end if;
end;
$course_source_human_locators_postflight$;

commit;
