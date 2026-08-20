-- #126 completes the existing Course-variant comparison without adding a
-- second comparison model. Variants keep the shared plan, start without
-- materialized Study Units, and refer to an existing PDF object when a source
-- attachment is inherited.

begin;

set local lock_timeout = '15s';
set local statement_timeout = '5min';

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-course-variant-factual-comparison-v1',0
));

do $course_variant_completion_preflight$
declare
  v_manifest jsonb;
begin
  if to_regprocedure(
       'private.clone_course_variant_from_source_v1(uuid,uuid,text,text,jsonb,jsonb)'
     ) is null
     or to_regprocedure(
       'public.get_owned_course_variant_comparison_for_actor_v1(uuid,uuid,bigint,uuid)'
     ) is null
     or to_regclass('private.course_source_attachments') is null
     or to_regprocedure(
       'public.get_course_source_attachment_access_for_actor_v1(uuid,uuid,bigint,text,text,bigint,text,bigint,text)'
     ) is null
     or to_regprocedure(
       'public.attach_course_source_pdf_for_actor_v1(uuid,uuid,bigint,jsonb,text,text)'
     ) is null
     or to_regprocedure(
       'private.valid_course_source_pdf_object_v1(text,bigint,text)'
     ) is null
     or to_regprocedure(
       'private.course_source_pdf_unique_bytes_v1(uuid)'
     ) is null
     or to_regprocedure(
       'private.course_design_parameters_for_scope_v1(uuid,jsonb)'
     ) is null
     or to_regprocedure(
       'private.course_component_policy_for_scope_v1(uuid,jsonb)'
     ) is null
     or to_regprocedure(
       'private.course_component_refs_from_content_v1(jsonb)'
     ) is null then
    raise exception 'A base de variantes, desenho e Fontes PDF não está instalada.';
  end if;
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision' <> '20260820063156'
     or (v_manifest->>'contractVersion')::integer <> 1
     or not (v_manifest->'features' ?& array[
       'course-source-pdf-attachments-v1',
       'course-authoring-analytics-v1',
       'course-variant-comparisons-v1'
     ]) then
    raise exception 'Manifesto anterior à comparação factual é incompatível.'
      using errcode = '55000';
  end if;
end;
$course_variant_completion_preflight$;

-- A variante owns the immutable attachment link, while storage_path may point
-- to the single object uploaded for the source Course. The hash remains part
-- of the path, so a link cannot substitute another blob.
alter table private.course_source_attachments
  drop constraint course_source_attachments_value_v1,
  add constraint course_source_attachments_value_v2 check(
    char_length(source_id) between 1 and 2048
    and source_id !~ '[[:cntrl:]]'
    and source_revision > 0
    and content_hash ~ '^[a-f0-9]{64}$'
    and byte_size between 1 and 20971520
    and media_type = 'application/pdf'
    and storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[a-f0-9]{64}\.pdf$'
    and split_part(storage_path,'/',2) = content_hash || '.pdf'
  );

-- Attachment access remains authorized by the link that belongs to the
-- requested Course. The explicit origin only identifies the immutable object
-- path; it never grants access by itself.
create or replace function public.get_course_source_attachment_access_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_course_revision bigint,
  p_operation text,
  p_source_id text,
  p_source_revision bigint,
  p_content_hash text,
  p_byte_size bigint default null,
  p_media_type text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog,public,private,storage
as $function$
declare
  v_course_revision bigint;
  v_source private.course_source_revisions%rowtype;
  v_attachment private.course_source_attachments%rowtype;
  v_storage_path text;
  v_storage_origin_course_id uuid;
  v_object_exists boolean;
  v_hash_already_counted boolean;
  v_unique_bytes bigint;
  v_upload_required boolean := false;
  v_already_linked boolean := false;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_course_revision is null or p_expected_course_revision < 1
     or p_operation not in ('prepare_upload','download')
     or p_source_id is null
     or char_length(p_source_id) not between 1 and 2048
     or p_source_id ~ '[[:cntrl:]]'
     or p_source_revision is null or p_source_revision < 1
     or p_content_hash is null or p_content_hash !~ '^[a-f0-9]{64}$'
     or p_operation = 'prepare_upload' and (
       p_byte_size is null or p_byte_size not between 1 and 20971520
       or p_media_type is distinct from 'application/pdf'
     )
     or p_operation = 'download' and (
       p_byte_size is not null or p_media_type is not null
     ) then
    raise exception 'Acesso ao anexo de Fonte inválido.' using errcode = '22023';
  end if;
  select course.revision into strict v_course_revision
  from public.courses course
  where course.id = p_course_id
  for share;
  if v_course_revision <> p_expected_course_revision then
    raise exception 'O Curso mudou; releia antes de acessar o anexo.'
      using errcode = '40001';
  end if;
  select * into v_source
  from private.course_source_revisions source
  where source.course_id = p_course_id
    and source.source_id = p_source_id
    and source.revision = p_source_revision;
  if not found then
    raise exception 'Revisão da Fonte inexistente.' using errcode = 'PT404';
  end if;

  select * into v_attachment
  from private.course_source_attachments attachment
  where attachment.course_id = p_course_id
    and attachment.source_id = p_source_id
    and attachment.source_revision = p_source_revision
    and attachment.content_hash = p_content_hash;
  v_already_linked := found;
  v_storage_path := case when v_already_linked
    then v_attachment.storage_path
    else p_course_id::text || '/' || p_content_hash || '.pdf'
  end;
  if v_storage_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[a-f0-9]{64}\.pdf$'
     or split_part(v_storage_path,'/',2) <> p_content_hash || '.pdf' then
    raise exception 'O vínculo do anexo possui caminho incompatível.'
      using errcode = '23514';
  end if;
  v_storage_origin_course_id := split_part(v_storage_path,'/',1)::uuid;

  if p_operation = 'prepare_upload' then
    perform pg_advisory_xact_lock(hashtextextended(
      'course-source-pdf-quota:' || p_course_id::text,0
    ));
    if v_source.status <> 'active' or exists(
      select 1
      from private.course_source_revisions current_source
      where current_source.course_id = p_course_id
        and current_source.source_id = p_source_id
        and current_source.revision > p_source_revision
    ) then
      raise exception 'O anexo exige a revisão corrente e ativa da Fonte.'
        using errcode = '23514';
    end if;
    if v_already_linked and (
      v_attachment.byte_size <> p_byte_size
      or v_attachment.media_type <> p_media_type
    ) then
      raise exception 'O hash já está vinculado com metadados incompatíveis.'
        using errcode = '23514';
    end if;
    select exists(
      select 1
      from private.course_source_attachments existing
      where existing.course_id = p_course_id
        and existing.content_hash = p_content_hash
    ) into v_hash_already_counted;
    v_unique_bytes := private.course_source_pdf_unique_bytes_v1(p_course_id);
    if not v_hash_already_counted
       and v_unique_bytes + p_byte_size > 67108864 then
      raise exception 'A cota de 64 MiB de PDFs únicos do Curso seria excedida.'
        using errcode = '23514';
    end if;
    select exists(
      select 1 from storage.objects object_value
      where object_value.bucket_id = 'course-source-pdfs'
        and object_value.name = v_storage_path
    ) into v_object_exists;
    if v_object_exists and not private.valid_course_source_pdf_object_v1(
      v_storage_path,p_byte_size,p_media_type
    ) then
      raise exception 'O objeto deduplicado possui tamanho ou tipo incompatível.'
        using errcode = '23514';
    end if;
    if not v_object_exists and v_already_linked then
      raise exception 'O objeto vinculado está ausente.'
        using errcode = '55000';
    end if;
    v_upload_required := not v_object_exists;
  else
    if not v_already_linked then
      raise exception 'Anexo não vinculado à revisão solicitada.' using errcode = 'PT404';
    end if;
    if not private.valid_course_source_pdf_object_v1(
      v_attachment.storage_path,v_attachment.byte_size,v_attachment.media_type
    ) then
      raise exception 'O objeto vinculado está ausente ou divergiu dos metadados.'
        using errcode = '55000';
    end if;
    p_byte_size := v_attachment.byte_size;
    p_media_type := v_attachment.media_type;
  end if;

  return jsonb_build_object(
    'contract','aralearn.course-source-attachment-access.v1',
    'courseId',p_course_id,
    'courseRevision',v_course_revision,
    'operation',p_operation,
    'sourceId',p_source_id,
    'sourceRevision',p_source_revision,
    'storageOriginCourseId',v_storage_origin_course_id,
    'attachment',jsonb_build_object(
      'contentHash',p_content_hash,
      'byteSize',p_byte_size,
      'mediaType',p_media_type,
      'storagePath',v_storage_path
    ),
    'uploadRequired',v_upload_required,
    'alreadyLinked',v_already_linked,
    'signedUrl',null,
    'expiresAt',null
  );
end;
$function$;

-- Cross-Course paths are accepted only for an attachment link that already
-- exists on the authorized Course. This keeps confirmation idempotent for a
-- cloned variant without allowing callers to mint arbitrary foreign links.
do $allow_linked_variant_pdf_confirmation$
declare
  v_definition text;
  v_original text;
begin
  select pg_get_functiondef(
    'public.attach_course_source_pdf_for_actor_v1(uuid,uuid,bigint,jsonb,text,text)'::regprocedure
  ) into v_definition;
  v_original := v_definition;
  v_definition := replace(v_definition,
$current_course_pdf_path$
  if v_storage_path is distinct from
       p_course_id::text || '/' || v_content_hash || '.pdf' then
    raise exception 'O caminho do anexo não corresponde ao Curso e ao hash.'
      using errcode = '23514';
  end if;
$current_course_pdf_path$,
$linked_or_current_pdf_path$
  if v_storage_path is null
     or v_storage_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[a-f0-9]{64}\.pdf$'
     or split_part(v_storage_path,'/',2) <> v_content_hash || '.pdf'
     or split_part(v_storage_path,'/',1) <> p_course_id::text and not exists(
       select 1
       from private.course_source_attachments linked_attachment
       where linked_attachment.course_id = p_course_id
         and linked_attachment.source_id = v_source_id
         and linked_attachment.source_revision = v_source_revision
         and linked_attachment.content_hash = v_content_hash
         and linked_attachment.byte_size = v_byte_size
         and linked_attachment.media_type = v_media_type
         and linked_attachment.storage_path = v_storage_path
     ) then
    raise exception 'O caminho do anexo não corresponde ao vínculo autorizado e ao hash.'
      using errcode = '23514';
  end if;
$linked_or_current_pdf_path$);
  if v_definition = v_original
     or v_definition not like '%linked_attachment.storage_path = v_storage_path%'
     or v_definition like '%p_course_id::text || ''/'' || v_content_hash || ''.pdf'' then%' then
    raise exception 'A confirmação de PDF vigente não corresponde ao corte esperado.';
  end if;
  execute v_definition;
end;
$allow_linked_variant_pdf_confirmation$;

-- Patch the existing clone in place. This keeps its transaction, validation,
-- receipts and all canonical copies, but excludes materialized Units and
-- their attributions. PDF metadata is linked to the same Storage object.
do $replace_course_variant_clone$
declare
  v_definition text;
  v_original text;
begin
  select pg_get_functiondef(
    'private.clone_course_variant_from_source_v1(uuid,uuid,text,text,jsonb,jsonb)'::regprocedure
  ) into v_definition;
  v_original := v_definition;

  v_definition := replace(v_definition,
$clone_all_entities$
  where entity.course_id = p_source_course_id;

  insert into private.course_instructional_plans(
$clone_all_entities$,
$clone_planning_entities$
  where entity.course_id = p_source_course_id
    and entity.entity_type <> 'study_unit';

  insert into private.course_instructional_plans(
$clone_planning_entities$);

  v_definition := replace(v_definition,
$clone_study_unit_attributions$
    where source_item.course_id = p_source_course_id
    union all
    select 'study_unit'::text,source_unit.entity_id,
      private.course_effective_source_links_v1(
        p_source_course_id,'study_unit',source_unit.entity_id
      )
    from private.course_entities source_unit
    where source_unit.course_id = p_source_course_id
      and source_unit.entity_type = 'study_unit'
$clone_study_unit_attributions$,
$clone_plan_attributions$
    where source_item.course_id = p_source_course_id
$clone_plan_attributions$);

  v_definition := replace(v_definition,
$clone_anchor_end$
  from private.course_source_anchor_revisions anchor
  where anchor.course_id = p_source_course_id;

  if exists(
$clone_anchor_end$,
$clone_shared_pdf$
  from private.course_source_anchor_revisions anchor
  where anchor.course_id = p_source_course_id;

  insert into private.course_source_attachments(
    course_id,source_id,source_revision,content_hash,byte_size,media_type,
    storage_path,actor_id,created_at
  )
  select v_target_course_id,attachment.source_id,
    attachment.source_revision,attachment.content_hash,attachment.byte_size,
    attachment.media_type,attachment.storage_path,p_actor_id,now()
  from private.course_source_attachments attachment
  where attachment.course_id = p_source_course_id;

  if exists(
$clone_shared_pdf$);

  if v_definition = v_original
     or v_definition like '%where entity.course_id = p_source_course_id;%'
     or v_definition like '%select ''study_unit''::text,source_unit.entity_id,%'
     or v_definition not like '%insert into private.course_source_attachments(%'
     or v_definition not like '%entity.entity_type <> ''study_unit''%' then
    raise exception 'A clonagem vigente não corresponde ao corte esperado de variantes.';
  end if;
  execute v_definition;
end;
$replace_course_variant_clone$;

create function private.course_variant_member_facts_v1(
  p_course_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_course_path jsonb;
  v_parameters jsonb := '[]'::jsonb;
  v_policies jsonb := '[]'::jsonb;
  v_components jsonb;
  v_parts jsonb;
  v_study_units jsonb;
  v_planned integer;
  v_not_started integer;
  v_running integer;
  v_completed integer;
  v_failed integer;
  v_study_unit_count integer;
  v_latest_updated_at timestamptz;
  v_part_fingerprint text;
  v_study_unit_fingerprint text;
  v_source_count integer;
  v_anchor_count integer;
  v_pdf_count integer;
  v_shared_pdf_count integer;
  v_reference_fingerprint text;
begin
  v_course_path := private.course_design_scope_path_v1(
    p_course_id,'course',p_course_id::text
  );
  if v_course_path is null then
    raise exception 'O Curso variante não possui escopo de desenho.'
      using errcode = '55000';
  end if;

  -- Course facts establish the baseline. Scoped facts are emitted whenever
  -- they have a local assignment or inherit a non-Course assignment, which
  -- makes undeclared Lesson and Microsequence deviations observable without
  -- repeating the unchanged baseline for every entity.
  with scopes as materialized (
    select 'course'::text as scope_kind,'course'::text as scope_id,
      v_course_path as scope_path,0 as scope_order
    union all
    select case entity.entity_type
        when 'microsequence' then 'didactic_microsequence'
        else entity.entity_type
      end,
      entity.entity_id,
      private.course_design_scope_path_v1(
        p_course_id,
        case entity.entity_type when 'microsequence'
          then 'didactic_microsequence' else entity.entity_type end,
        entity.entity_id
      ),
      case entity.entity_type when 'lesson' then 1 else 2 end
    from private.course_entities entity
    where entity.course_id = p_course_id
      and entity.entity_type in ('lesson','microsequence')
  ), facts as materialized (
    select scope.scope_kind,scope.scope_id,scope.scope_order,
      parameter.value,parameter.ordinal
    from scopes scope
    cross join lateral jsonb_array_elements(
      private.course_design_parameters_for_scope_v1(
        p_course_id,scope.scope_path
      )
    ) with ordinality parameter(value,ordinal)
    where scope.scope_path is not null
      and (
        scope.scope_kind = 'course'
        or parameter.value->'localAssignment' is distinct from 'null'::jsonb
        or parameter.value#>>'{effectiveAssignment,sourceScope,kind}'
          in ('lesson','didactic_microsequence')
      )
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'scopeKind',fact.scope_kind,'scopeId',fact.scope_id,
    'parameterId',fact.value->>'parameterId',
    'value',fact.value#>'{effectiveAssignment,value}',
    'origin',fact.value#>>'{effectiveAssignment,origin}',
    'sourceScope',case
      when fact.value#>>'{effectiveAssignment,sourceScope,kind}' = 'course'
        then jsonb_build_object('kind','course','ref','course')
      else fact.value#>'{effectiveAssignment,sourceScope}'
    end
  ) order by fact.scope_order,fact.scope_id,fact.ordinal),'[]'::jsonb)
  into v_parameters
  from facts fact;

  with scopes as materialized (
    select 'course'::text as scope_kind,'course'::text as scope_id,
      v_course_path as scope_path,0 as scope_order
    union all
    select case entity.entity_type
        when 'microsequence' then 'didactic_microsequence'
        else entity.entity_type
      end,
      entity.entity_id,
      private.course_design_scope_path_v1(
        p_course_id,
        case entity.entity_type when 'microsequence'
          then 'didactic_microsequence' else entity.entity_type end,
        entity.entity_id
      ),
      case entity.entity_type when 'lesson' then 1 else 2 end
    from private.course_entities entity
    where entity.course_id = p_course_id
      and entity.entity_type in ('lesson','microsequence')
  ), facts as materialized (
    select scope.*,
      private.course_component_policy_for_scope_v1(
        p_course_id,scope.scope_path
      ) as envelope
    from scopes scope
    where scope.scope_path is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'scopeKind',fact.scope_kind,'scopeId',fact.scope_id,
    'policy',fact.envelope#>'{effectiveChange,policy}',
    'origin',fact.envelope#>>'{effectiveChange,origin}',
    'sourceScope',case
      when fact.envelope#>>'{effectiveChange,sourceScope,kind}' = 'course'
        then jsonb_build_object('kind','course','ref','course')
      else fact.envelope#>'{effectiveChange,sourceScope}'
    end
  ) order by fact.scope_order,fact.scope_id),'[]'::jsonb)
  into v_policies
  from facts fact
  where fact.scope_kind = 'course'
     or fact.envelope->'localChange' is distinct from 'null'::jsonb
     or fact.envelope#>>'{effectiveChange,sourceScope,kind}'
       in ('lesson','didactic_microsequence');

  select coalesce(jsonb_agg(to_jsonb(component.ref)
    order by component.ref),'[]'::jsonb)
  into v_components
  from (
    select distinct unnest(
      private.course_component_refs_from_content_v1(unit.content)
    ) as ref
    from private.course_entities unit
    where unit.course_id = p_course_id
      and unit.entity_type = 'study_unit'
  ) component;

  with part_state as materialized (
    select part.*,
      materialization.id as materialization_id,
      materialization.status as materialization_status,
      materialization.version as materialization_version,
      materialization.updated_at as materialization_updated_at,
      coalesce(unit_count.value,0)::integer as study_unit_count
    from private.course_authoring_parts part
    left join lateral (
      select current_value.*
      from private.course_authoring_part_materializations current_value
      where current_value.course_id = part.course_id
        and current_value.authoring_part_id = part.id
      order by current_value.updated_at desc,current_value.id desc
      limit 1
    ) materialization on true
    left join lateral (
      select count(*)::integer as value
      from private.course_authoring_part_didactic_microsequences membership
      join private.course_entities unit
        on unit.course_id = membership.course_id
       and unit.entity_type = 'study_unit'
       and unit.parent_type = 'microsequence'
       and unit.parent_id = membership.didactic_microsequence_id
      where membership.course_id = part.course_id
        and membership.authoring_part_id = part.id
    ) unit_count on true
    where part.course_id = p_course_id and part.retired_at is null
  )
  select count(*)::integer,
    count(*) filter(where materialization_id is null)::integer,
    count(*) filter(where materialization_status = 'running')::integer,
    count(*) filter(where materialization_status = 'completed')::integer,
    count(*) filter(where materialization_status = 'failed')::integer,
    max(materialization_updated_at),
    coalesce(jsonb_agg(jsonb_build_object(
      'partId',id,'position',position,'title',title,'intent',intent,
      'version',version,
      'status',coalesce(materialization_status,'not_started'),
      'materializationId',materialization_id,
      'materializationVersion',materialization_version,
      'updatedAt',materialization_updated_at,
      'studyUnitCount',study_unit_count
    ) order by position,id),'[]'::jsonb)
  into v_planned,v_not_started,v_running,v_completed,v_failed,
    v_latest_updated_at,v_parts
  from part_state;

  select count(*)::integer into v_study_unit_count
  from private.course_entities unit
  where unit.course_id = p_course_id and unit.entity_type = 'study_unit';

  select coalesce(jsonb_agg(unit.value order by unit.position,unit.id),
    '[]'::jsonb)
  into v_study_units
  from (
    select entity.position,entity.entity_id as id,jsonb_build_object(
      'studyUnitId',entity.entity_id,
      'parentMicrosequenceId',entity.parent_id,
      'position',entity.position,
      'title',entity.content->>'title',
      'version',entity.version,
      'componentRefs',to_jsonb(
        private.course_component_refs_from_content_v1(entity.content)
      )
    ) as value
    from private.course_entities entity
    where entity.course_id = p_course_id
      and entity.entity_type = 'study_unit'
    order by entity.parent_id,entity.position,entity.entity_id
    limit 64
  ) unit;

  select private.course_variant_plan_snapshot_hash_v1(coalesce(jsonb_agg(
    jsonb_build_object(
      'position',part.value->'position','title',part.value->'title',
      'intent',part.value->'intent','version',part.value->'version',
      'status',part.value->'status',
      'materializationVersion',part.value->'materializationVersion',
      'studyUnitCount',part.value->'studyUnitCount'
    ) order by part.ordinal
  ),'[]'::jsonb)) into v_part_fingerprint
  from jsonb_array_elements(v_parts) with ordinality part(value,ordinal);

  v_study_unit_fingerprint := private.course_variant_plan_snapshot_hash_v1(
    v_study_units
  );

  select count(distinct source.source_id)::integer into v_source_count
  from private.course_source_revisions source
  where source.course_id = p_course_id;
  select count(distinct anchor.anchor_id)::integer into v_anchor_count
  from private.course_source_anchor_revisions anchor
  where anchor.course_id = p_course_id;
  select count(*)::integer,
    count(*) filter(
      where split_part(attachment.storage_path,'/',1) <> p_course_id::text
    )::integer
  into v_pdf_count,v_shared_pdf_count
  from private.course_source_attachments attachment
  where attachment.course_id = p_course_id;

  select private.course_variant_plan_snapshot_hash_v1(jsonb_build_object(
    'sources',coalesce((
      select jsonb_agg(jsonb_build_object(
        'sourceId',source.source_id,'revision',source.revision,
        'status',source.status,'kind',source.kind,'title',source.title,
        'citationText',source.citation_text,'url',source.url,
        'editionOrVersion',source.edition_or_version,
        'studyVisibility',source.study_visibility,
        'authorship',source.authorship,
        'publicationDate',source.publication_date,
        'identifier',source.identifier,
        'language',source.language,
        'origin',source.origin,
        'availability',source.availability,
        'verificationStatus',source.verification_status
      ) order by source.source_id,source.revision)
      from private.course_source_revisions source
      where source.course_id = p_course_id
    ),'[]'::jsonb),
    'anchors',coalesce((
      select jsonb_agg(jsonb_build_object(
        'anchorId',anchor.anchor_id,'revision',anchor.revision,
        'sourceId',anchor.source_id,'sourceRevision',anchor.source_revision,
        'status',anchor.status,'selector',anchor.selector,
        'verificationExcerpt',anchor.verification_excerpt
      ) order by anchor.anchor_id,anchor.revision)
      from private.course_source_anchor_revisions anchor
      where anchor.course_id = p_course_id
    ),'[]'::jsonb),
    'attachments',coalesce((
      select jsonb_agg(jsonb_build_object(
        'sourceId',attachment.source_id,
        'sourceRevision',attachment.source_revision,
        'contentHash',attachment.content_hash,
        'byteSize',attachment.byte_size,'mediaType',attachment.media_type,
        'storagePath',attachment.storage_path
      ) order by attachment.source_id,attachment.source_revision,
        attachment.content_hash)
      from private.course_source_attachments attachment
      where attachment.course_id = p_course_id
    ),'[]'::jsonb)
  )) into v_reference_fingerprint;

  return jsonb_build_object(
    'effectiveParameters',v_parameters,
    'effectiveComponentPolicies',v_policies,
    'componentsUsed',v_components,
    'references',jsonb_build_object(
      'sourceCount',coalesce(v_source_count,0),
      'anchorCount',coalesce(v_anchor_count,0),
      'pdfCount',coalesce(v_pdf_count,0),
      'sharedPdfCount',coalesce(v_shared_pdf_count,0),
      'fingerprint',v_reference_fingerprint
    ),
    'materialization',jsonb_build_object(
      'plannedPartCount',coalesce(v_planned,0),
      'notStartedPartCount',coalesce(v_not_started,0),
      'runningPartCount',coalesce(v_running,0),
      'completedPartCount',coalesce(v_completed,0),
      'failedPartCount',coalesce(v_failed,0),
      'studyUnitCount',coalesce(v_study_unit_count,0),
      'latestUpdatedAt',v_latest_updated_at,
      'partFingerprint',v_part_fingerprint,
      'studyUnitFingerprint',v_study_unit_fingerprint,
      'parts',v_parts,'studyUnits',v_study_units,
      'truncated',jsonb_build_object(
        'parts',false,'studyUnits',coalesce(v_study_unit_count,0) > 64
      )
    )
  );
end;
$function$;

create function private.course_variant_comparison_differences_v1(
  p_members jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_reference jsonb := p_members->0;
  v_member jsonb;
  v_declared_parameter jsonb;
  v_parameter_key jsonb;
  v_actual_parameter jsonb;
  v_reference_parameter jsonb;
  v_policy_key jsonb;
  v_actual_policy jsonb;
  v_reference_policy jsonb;
  v_declared jsonb := '[]'::jsonb;
  v_observed jsonb := '[]'::jsonb;
  v_accidental jsonb := '[]'::jsonb;
  v_factual jsonb := '[]'::jsonb;
  v_missing jsonb := '[]'::jsonb;
  v_has_member_declaration boolean;
  v_has_reference_declaration boolean;
  v_actual_found boolean;
  v_reference_found boolean;
  v_entry jsonb;
begin
  if jsonb_typeof(p_members) <> 'array' or jsonb_array_length(p_members) < 2
     or exists(
       select 1
       from jsonb_array_elements(p_members)
         with ordinality member(value,ordinality)
       where not case
         when jsonb_typeof(member.value->'position') = 'number'
              and member.value->>'position' ~ '^[0-7]$'
           then (member.value->>'position')::smallint = member.ordinality-1
         else false
       end
     ) then
    raise exception 'Membros comparáveis ausentes ou fora de ordem.' using errcode = '22023';
  end if;

  for v_member in select member.value from jsonb_array_elements(p_members) member(value)
  loop
    for v_declared_parameter in
      select declaration.value
      from jsonb_array_elements(v_member->'parameterDifferences') declaration(value)
    loop
      v_entry := jsonb_build_object(
        'courseId',v_member->>'courseId','referenceCourseId',null,
        'kind','parameter','scopeKind',v_declared_parameter->>'scopeKind',
        'scopeId',v_declared_parameter->>'scopeId',
        'key',v_declared_parameter->>'parameterId',
        'expectedValue',v_declared_parameter->'value','actualValue',null,
        'explanation',v_declared_parameter->>'rationale'
      );
      v_declared := v_declared || jsonb_build_array(v_entry);
      select parameter.value into v_actual_parameter
      from jsonb_array_elements(v_member->'effectiveParameters') parameter(value)
      where parameter.value->>'scopeKind' = v_declared_parameter->>'scopeKind'
        and parameter.value->>'scopeId' = case
          when v_declared_parameter->>'scopeKind' = 'course' then 'course'
          else v_declared_parameter->>'scopeId' end
        and parameter.value->>'parameterId' = v_declared_parameter->>'parameterId';
      if not found then
        v_missing := v_missing || jsonb_build_array(v_entry || jsonb_build_object(
          'kind','parameter','explanation','O valor efetivo do parâmetro declarado não está disponível.'
        ));
      elsif v_actual_parameter->'value' = v_declared_parameter->'value' then
        v_observed := v_observed || jsonb_build_array(v_entry || jsonb_build_object(
          'actualValue',v_actual_parameter->'value',
          'explanation','A diferença declarada está efetiva nesta revisão.'
        ));
      else
        v_accidental := v_accidental || jsonb_build_array(v_entry || jsonb_build_object(
          'referenceCourseId',v_reference->>'courseId',
          'actualValue',v_actual_parameter->'value',
          'explanation','O valor efetivo diverge da diferença declarada.'
        ));
      end if;
    end loop;

    if v_member->'componentPolicyDifference' <> 'null'::jsonb then
      v_entry := jsonb_build_object(
        'courseId',v_member->>'courseId','referenceCourseId',null,
        'kind','component_policy','scopeKind','course','scopeId','course',
        'key','componentPolicy','expectedValue',v_member->'componentPolicyDifference',
        'actualValue',null,
        'explanation','Política de componentes declarada para a variante.'
      );
      v_declared := v_declared || jsonb_build_array(v_entry);
      select policy.value into v_actual_policy
      from jsonb_array_elements(v_member->'effectiveComponentPolicies')
        policy(value)
      where policy.value->>'scopeKind' = 'course'
        and policy.value->>'scopeId' = 'course';
      if not found then
        v_missing := v_missing || jsonb_build_array(v_entry || jsonb_build_object(
          'explanation','A política efetiva declarada não está disponível.'
        ));
      elsif v_actual_policy->'policy' =
           v_member->'componentPolicyDifference' then
        v_observed := v_observed || jsonb_build_array(v_entry || jsonb_build_object(
          'actualValue',v_actual_policy->'policy',
          'explanation','A política declarada está efetiva nesta revisão.'
        ));
      else
        v_accidental := v_accidental || jsonb_build_array(v_entry || jsonb_build_object(
          'referenceCourseId',v_reference->>'courseId',
          'actualValue',v_actual_policy->'policy',
          'explanation','A política efetiva diverge da política declarada.'
        ));
      end if;
    end if;

    if (v_member->>'changedSinceAttached')::boolean then
      v_accidental := v_accidental || jsonb_build_array(jsonb_build_object(
        'courseId',v_member->>'courseId','referenceCourseId',null,
        'kind','course_revision','scopeKind',null,'scopeId',null,
        'key','courseRevision',
        'expectedValue',v_member->'attachedCourseRevision',
        'actualValue',v_member->'currentCourseRevision',
        'explanation','O Curso mudou depois de ser vinculado à comparação.'
      ));
    end if;

    if (v_member#>>'{materialization,truncated,studyUnits}')::boolean then
      v_missing := v_missing || jsonb_build_array(jsonb_build_object(
        'courseId',v_member->>'courseId','referenceCourseId',null,
        'kind','study_units','scopeKind',null,'scopeId',null,
        'key','studyUnits',
        'expectedValue',v_member#>'{materialization,studyUnitCount}',
        'actualValue',jsonb_array_length(v_member#>'{materialization,studyUnits}'),
        'explanation','A lista de Unidades foi limitada; a contagem total permanece disponível.'
      ));
    end if;
    if (v_member#>>'{materialization,completedPartCount}')::integer = 0
       and (v_member#>>'{materialization,runningPartCount}')::integer = 0 then
      v_missing := v_missing || jsonb_build_array(jsonb_build_object(
        'courseId',v_member->>'courseId','referenceCourseId',null,
        'kind','materialization','scopeKind',null,'scopeId',null,
        'key','materialization',
        'expectedValue',null,'actualValue',null,
        'explanation','A materialização independente ainda não foi iniciada.'
      ));
    end if;

    if v_member->>'courseId' <> v_reference->>'courseId' then
      for v_parameter_key in
        select jsonb_build_object(
          'scopeKind',candidate.scope_kind,'scopeId',candidate.scope_id,
          'parameterId',candidate.parameter_id
        )
        from (
          select parameter.value->>'scopeKind' as scope_kind,
            parameter.value->>'scopeId' as scope_id,
            parameter.value->>'parameterId' as parameter_id
          from jsonb_array_elements(v_member->'effectiveParameters') parameter(value)
          union
          select parameter.value->>'scopeKind',parameter.value->>'scopeId',
            parameter.value->>'parameterId'
          from jsonb_array_elements(v_reference->'effectiveParameters') parameter(value)
        ) candidate
        order by candidate.scope_kind,candidate.scope_id,candidate.parameter_id
      loop
        select parameter.value into v_actual_parameter
        from jsonb_array_elements(v_member->'effectiveParameters') parameter(value)
        where parameter.value->>'scopeKind' = v_parameter_key->>'scopeKind'
          and parameter.value->>'scopeId' = v_parameter_key->>'scopeId'
          and parameter.value->>'parameterId' = v_parameter_key->>'parameterId';
        if not found and v_parameter_key->>'scopeKind' <> 'course' then
          select parameter.value into v_actual_parameter
          from jsonb_array_elements(v_member->'effectiveParameters') parameter(value)
          where parameter.value->>'scopeKind' = 'course'
            and parameter.value->>'scopeId' = 'course'
            and parameter.value->>'parameterId' = v_parameter_key->>'parameterId';
        end if;
        v_actual_found := found;

        select parameter.value into v_reference_parameter
        from jsonb_array_elements(v_reference->'effectiveParameters') parameter(value)
        where parameter.value->>'scopeKind' = v_parameter_key->>'scopeKind'
          and parameter.value->>'scopeId' = v_parameter_key->>'scopeId'
          and parameter.value->>'parameterId' = v_parameter_key->>'parameterId';
        if not found and v_parameter_key->>'scopeKind' <> 'course' then
          select parameter.value into v_reference_parameter
          from jsonb_array_elements(v_reference->'effectiveParameters') parameter(value)
          where parameter.value->>'scopeKind' = 'course'
            and parameter.value->>'scopeId' = 'course'
            and parameter.value->>'parameterId' = v_parameter_key->>'parameterId';
        end if;
        v_reference_found := found;

        if not v_actual_found or not v_reference_found then
          v_missing := v_missing || jsonb_build_array(jsonb_build_object(
            'courseId',v_member->>'courseId',
            'referenceCourseId',v_reference->>'courseId',
            'kind','parameter','scopeKind',v_parameter_key->>'scopeKind',
            'scopeId',v_parameter_key->>'scopeId',
            'key',v_parameter_key->>'parameterId',
            'expectedValue',case when v_reference_found
              then v_reference_parameter->'value' else null end,
            'actualValue',case when v_actual_found
              then v_actual_parameter->'value' else null end,
            'explanation','O parâmetro efetivo não possui valor comparável nas duas variantes.'
          ));
        elsif v_reference_parameter->'value' <> v_actual_parameter->'value' then
          select exists(
            select 1 from jsonb_array_elements(v_member->'parameterDifferences') declaration(value)
            where declaration.value->>'scopeKind' = v_parameter_key->>'scopeKind'
              and (case when declaration.value->>'scopeKind' = 'course' then 'course'
                    else declaration.value->>'scopeId' end) = v_parameter_key->>'scopeId'
              and declaration.value->>'parameterId' = v_parameter_key->>'parameterId'
          ) into v_has_member_declaration;
          select exists(
            select 1 from jsonb_array_elements(v_reference->'parameterDifferences') declaration(value)
            where declaration.value->>'scopeKind' = v_parameter_key->>'scopeKind'
              and (case when declaration.value->>'scopeKind' = 'course' then 'course'
                    else declaration.value->>'scopeId' end) = v_parameter_key->>'scopeId'
              and declaration.value->>'parameterId' = v_parameter_key->>'parameterId'
          ) into v_has_reference_declaration;
          if not v_has_member_declaration and not v_has_reference_declaration then
            v_accidental := v_accidental || jsonb_build_array(jsonb_build_object(
              'courseId',v_member->>'courseId',
              'referenceCourseId',v_reference->>'courseId',
              'kind','parameter','scopeKind',v_parameter_key->>'scopeKind',
              'scopeId',v_parameter_key->>'scopeId',
              'key',v_parameter_key->>'parameterId',
              'expectedValue',v_reference_parameter->'value',
              'actualValue',v_actual_parameter->'value',
              'explanation','As variantes divergem em um parâmetro não declarado.'
            ));
          end if;
        end if;
      end loop;

      for v_policy_key in
        select jsonb_build_object(
          'scopeKind',candidate.scope_kind,'scopeId',candidate.scope_id
        )
        from (
          select policy.value->>'scopeKind' as scope_kind,
            policy.value->>'scopeId' as scope_id
          from jsonb_array_elements(v_member->'effectiveComponentPolicies') policy(value)
          union
          select policy.value->>'scopeKind',policy.value->>'scopeId'
          from jsonb_array_elements(v_reference->'effectiveComponentPolicies') policy(value)
        ) candidate
        order by candidate.scope_kind,candidate.scope_id
      loop
        select policy.value into v_actual_policy
        from jsonb_array_elements(v_member->'effectiveComponentPolicies') policy(value)
        where policy.value->>'scopeKind' = v_policy_key->>'scopeKind'
          and policy.value->>'scopeId' = v_policy_key->>'scopeId';
        if not found and v_policy_key->>'scopeKind' <> 'course' then
          select policy.value into v_actual_policy
          from jsonb_array_elements(v_member->'effectiveComponentPolicies') policy(value)
          where policy.value->>'scopeKind' = 'course'
            and policy.value->>'scopeId' = 'course';
        end if;
        v_actual_found := found;

        select policy.value into v_reference_policy
        from jsonb_array_elements(v_reference->'effectiveComponentPolicies') policy(value)
        where policy.value->>'scopeKind' = v_policy_key->>'scopeKind'
          and policy.value->>'scopeId' = v_policy_key->>'scopeId';
        if not found and v_policy_key->>'scopeKind' <> 'course' then
          select policy.value into v_reference_policy
          from jsonb_array_elements(v_reference->'effectiveComponentPolicies') policy(value)
          where policy.value->>'scopeKind' = 'course'
            and policy.value->>'scopeId' = 'course';
        end if;
        v_reference_found := found;

        if not v_actual_found or not v_reference_found then
          v_missing := v_missing || jsonb_build_array(jsonb_build_object(
            'courseId',v_member->>'courseId',
            'referenceCourseId',v_reference->>'courseId',
            'kind','component_policy','scopeKind',v_policy_key->>'scopeKind',
            'scopeId',v_policy_key->>'scopeId','key','componentPolicy',
            'expectedValue',case when v_reference_found
              then v_reference_policy->'policy' else null end,
            'actualValue',case when v_actual_found
              then v_actual_policy->'policy' else null end,
            'explanation','A política efetiva não possui valor comparável nas duas variantes.'
          ));
        elsif v_actual_policy->'policy' <> v_reference_policy->'policy' then
          v_has_member_declaration := v_policy_key->>'scopeKind' = 'course'
            and v_member->'componentPolicyDifference' <> 'null'::jsonb;
          v_has_reference_declaration := v_policy_key->>'scopeKind' = 'course'
            and v_reference->'componentPolicyDifference' <> 'null'::jsonb;
          if not v_has_member_declaration and not v_has_reference_declaration then
            v_accidental := v_accidental || jsonb_build_array(jsonb_build_object(
              'courseId',v_member->>'courseId',
              'referenceCourseId',v_reference->>'courseId',
              'kind','component_policy','scopeKind',v_policy_key->>'scopeKind',
              'scopeId',v_policy_key->>'scopeId','key','componentPolicy',
              'expectedValue',v_reference_policy->'policy',
              'actualValue',v_actual_policy->'policy',
              'explanation','As variantes divergem em uma política não declarada.'
            ));
          end if;
        end if;
      end loop;

      if v_member#>>'{references,fingerprint}' <>
           v_reference#>>'{references,fingerprint}' then
        v_accidental := v_accidental || jsonb_build_array(jsonb_build_object(
          'courseId',v_member->>'courseId',
          'referenceCourseId',v_reference->>'courseId',
          'kind','source_references','scopeKind',null,'scopeId',null,
          'key','sourceReferences',
          'expectedValue',v_reference->'references',
          'actualValue',v_member->'references',
          'explanation','As Fontes ou Âncoras disponíveis divergem entre as variantes.'
        ));
      end if;

      if v_member#>>'{materialization,partFingerprint}' <>
           v_reference#>>'{materialization,partFingerprint}' then
        v_factual := v_factual || jsonb_build_array(jsonb_build_object(
          'courseId',v_member->>'courseId',
          'referenceCourseId',v_reference->>'courseId',
          'kind','parts','scopeKind',null,'scopeId',null,'key','parts',
          'expectedValue',jsonb_build_object(
            'count',v_reference#>'{materialization,plannedPartCount}',
            'fingerprint',v_reference#>'{materialization,partFingerprint}'
          ),
          'actualValue',jsonb_build_object(
            'count',v_member#>'{materialization,plannedPartCount}',
            'fingerprint',v_member#>'{materialization,partFingerprint}'
          ),
          'explanation','As Partes ou seus estados de materialização diferem.'
        ));
      end if;
      if v_member#>>'{materialization,studyUnitFingerprint}' <>
           v_reference#>>'{materialization,studyUnitFingerprint}' then
        v_factual := v_factual || jsonb_build_array(jsonb_build_object(
          'courseId',v_member->>'courseId',
          'referenceCourseId',v_reference->>'courseId',
          'kind','study_units','scopeKind',null,'scopeId',null,
          'key','studyUnits',
          'expectedValue',jsonb_build_object(
            'count',v_reference#>'{materialization,studyUnitCount}',
            'fingerprint',v_reference#>'{materialization,studyUnitFingerprint}'
          ),
          'actualValue',jsonb_build_object(
            'count',v_member#>'{materialization,studyUnitCount}',
            'fingerprint',v_member#>'{materialization,studyUnitFingerprint}'
          ),
          'explanation','As Unidades materializadas diferem factualmente.'
        ));
      end if;
      if v_member->'componentsUsed' <> v_reference->'componentsUsed' then
        v_factual := v_factual || jsonb_build_array(jsonb_build_object(
          'courseId',v_member->>'courseId',
          'referenceCourseId',v_reference->>'courseId',
          'kind','components','scopeKind',null,'scopeId',null,
          'key','componentsUsed','expectedValue',v_reference->'componentsUsed',
          'actualValue',v_member->'componentsUsed',
          'explanation','Os componentes efetivamente usados diferem.'
        ));
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'referenceCourseId',v_reference->>'courseId',
    'declared',v_declared,
    'observedExpected',v_observed,
    'accidentalDeviations',v_accidental,
    'factual',v_factual,
    'missingData',v_missing
  );
end;
$function$;

create or replace function public.get_owned_course_variant_comparison_for_actor_v1(
  p_actor_id uuid,
  p_source_course_id uuid,
  p_expected_course_revision bigint,
  p_comparison_set_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, auth
as $function$
declare
  v_source_course public.courses%rowtype;
  v_comparison_set private.course_variant_comparison_sets%rowtype;
  v_checkpoint private.course_variant_plan_checkpoints%rowtype;
  v_members jsonb;
  v_result jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(
    p_source_course_id,p_actor_id,true
  );
  if p_expected_course_revision is null or p_expected_course_revision < 1
     or p_comparison_set_id is null then
    raise exception 'Leitura de variantes comparáveis inválida.'
      using errcode = '22023';
  end if;
  select * into strict v_source_course
  from public.courses course
  where course.id = p_source_course_id
  for share;
  if v_source_course.revision <> p_expected_course_revision then
    raise sqlstate 'PGRST' using
      message = jsonb_build_object(
        'code','40001',
        'message','O Curso mudou; releia antes de comparar variantes.',
        'details',null,'hint',null
      )::text,
      detail = jsonb_build_object('status',409,'headers',jsonb_build_object())::text;
  end if;
  select * into strict v_comparison_set
  from private.course_variant_comparison_sets comparison_set
  where comparison_set.id = p_comparison_set_id
    and comparison_set.owner_id = p_actor_id
    and comparison_set.source_course_id = p_source_course_id;
  select * into strict v_checkpoint
  from private.course_variant_plan_checkpoints checkpoint
  where checkpoint.id = v_comparison_set.checkpoint_id
    and checkpoint.owner_id = p_actor_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'courseId',course.id,'position',member.active_position,'label',member.label,
      'title',course.title,'goal',course.goal,
      'attachedCourseRevision',member.attached_course_revision,
      'currentCourseRevision',course.revision,
      'changedSinceAttached',course.revision <> member.attached_course_revision,
      'parameterDifferences',member.declared_parameter_differences,
      'componentPolicyDifference',member.declared_component_policy_difference
    ) || private.course_variant_member_facts_v1(course.id)
      order by member.active_position,course.id
  ),'[]'::jsonb) into v_members
  from (
    select membership.*,
      (row_number() over(
        order by membership.position,membership.course_id
      )-1)::smallint as active_position
    from private.course_variant_comparison_members membership
    where membership.comparison_set_id = v_comparison_set.id
      and membership.detached_at is null
  ) member
  join public.courses course on course.id = member.course_id;

  if jsonb_array_length(v_members) < 2 then
    raise exception 'A comparação exige ao menos duas variantes ativas.'
      using errcode = 'PT404';
  end if;

  v_result := jsonb_build_object(
    'contract','aralearn.course-variant-comparison.v1',
    'comparisonSetId',v_comparison_set.id,
    'planning',jsonb_build_object(
      'checkpointId',v_checkpoint.id,
      'checkpointHash',v_checkpoint.snapshot_hash,
      'courseRevision',v_checkpoint.source_course_revision,
      'planVersion',v_checkpoint.source_plan_version,
      'snapshot',v_checkpoint.plan_snapshot
    ),
    'source',jsonb_build_object(
      'courseId',v_source_course.id,'title',v_source_course.title,
      'goal',v_source_course.goal,'currentCourseRevision',v_source_course.revision,
      'checkpointCourseRevision',v_comparison_set.source_course_revision,
      'changedSinceCheckpoint',v_source_course.revision <> v_comparison_set.source_course_revision,
      'checkpointId',v_checkpoint.id,'checkpointHash',v_checkpoint.snapshot_hash
    ),
    'members',v_members,
    'differences',private.course_variant_comparison_differences_v1(v_members)
  );
  if octet_length(v_result::text) > 262144 then
    raise exception 'A comparação de variantes excede 256 KiB.'
      using errcode = '54000';
  end if;
  return v_result;
end;
$function$;

revoke all on function private.course_variant_member_facts_v1(
  uuid
), private.course_variant_comparison_differences_v1(
  jsonb
) from public,anon,authenticated,service_role;

revoke all on function public.get_owned_course_variant_comparison_for_actor_v1(
  uuid,uuid,bigint,uuid
) from public,anon,authenticated;
grant execute on function public.get_owned_course_variant_comparison_for_actor_v1(
  uuid,uuid,bigint,uuid
) to service_role;

comment on function public.get_owned_course_variant_comparison_for_actor_v1(
  uuid,uuid,bigint,uuid
) is
  'DTO owner-only comum a UI e MCP: checkpoint, configuração efetiva, materialização e diferenças declaradas, observadas, acidentais e factuais.';

do $course_variant_completion_postflight$
declare
  v_definition text;
  v_access_definition text;
  v_attach_definition text;
begin
  select pg_get_functiondef(
    'private.clone_course_variant_from_source_v1(uuid,uuid,text,text,jsonb,jsonb)'::regprocedure
  ) into v_definition;
  select pg_get_functiondef(
    'public.get_course_source_attachment_access_for_actor_v1(uuid,uuid,bigint,text,text,bigint,text,bigint,text)'::regprocedure
  ) into v_access_definition;
  select pg_get_functiondef(
    'public.attach_course_source_pdf_for_actor_v1(uuid,uuid,bigint,jsonb,text,text)'::regprocedure
  ) into v_attach_definition;
  if v_definition not like '%entity.entity_type <> ''study_unit''%'
     or v_definition like '%select ''study_unit''::text,source_unit.entity_id,%'
     or v_definition not like '%insert into private.course_source_attachments(%'
     or v_access_definition not like '%storageOriginCourseId%'
     or v_access_definition not like '%v_storage_path%'
     or v_access_definition not like '%course-source-pdf-quota:%'
     or v_access_definition not like '%course_source_pdf_unique_bytes_v1%'
     or v_access_definition not like '%67108864%'
     or v_attach_definition not like '%linked_attachment.storage_path = v_storage_path%'
     or to_regprocedure(
       'private.course_variant_member_facts_v1(uuid)'
     ) is null
     or to_regprocedure(
       'private.course_variant_comparison_differences_v1(jsonb)'
     ) is null
     or not exists(
       select 1
       from pg_proc function_value
       where function_value.oid =
         'public.get_owned_course_variant_comparison_for_actor_v1(uuid,uuid,bigint,uuid)'::regprocedure
         and function_value.provolatile = 'v'
     ) then
    raise exception 'A conclusão de variantes não foi instalada integralmente.';
  end if;
end;
$course_variant_completion_postflight$;

do $advance_course_variant_factual_comparison_runtime_manifest$
declare
  v_manifest jsonb;
  v_features jsonb;
  v_body text;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision' <> '20260820063156'
     or (v_manifest->>'contractVersion')::integer <> 1
     or not (v_manifest->'features' ?& array[
       'course-source-pdf-attachments-v1','course-authoring-analytics-v1'
     ]) then
    raise exception 'Manifesto concorrente à comparação factual.'
      using errcode = '55000';
  end if;
  select jsonb_agg(feature.value order by feature.ordinal)
  into v_features
  from (
    select existing.value,existing.ordinal
    from jsonb_array_elements_text(v_manifest->'features')
      with ordinality existing(value,ordinal)
    union all
    select 'course-variant-factual-comparison-v1',1000030::bigint
  ) feature;
  v_manifest := jsonb_build_object(
    'schemaRevision','20260820065720','contractVersion',1,
    'features',v_features
  );
  v_body := 'select ' || quote_literal(v_manifest::text) || '::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      || 'returns jsonb language sql stable security definer '
      || 'set search_path = pg_catalog as %L',v_body
  );
  revoke all on function public.get_aralearn_runtime_manifest()
    from public,anon,authenticated,service_role;
  grant execute on function public.get_aralearn_runtime_manifest()
    to anon,authenticated,service_role;
end;
$advance_course_variant_factual_comparison_runtime_manifest$;

do $course_variant_factual_manifest_postflight$
declare
  v_manifest jsonb;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision' <> '20260820065720'
     or (v_manifest->>'contractVersion')::integer <> 1
     or not (v_manifest->'features' ? 'course-variant-factual-comparison-v1') then
    raise exception 'Manifesto da comparação factual não foi consolidado.'
      using errcode = '55000';
  end if;
end;
$course_variant_factual_manifest_postflight$;

commit;
