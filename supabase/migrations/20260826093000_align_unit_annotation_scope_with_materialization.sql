-- Unidades materializadas registram objetos de conhecimento legíveis em
-- content.topics. A Unidade, e não esses rótulos, delimita o alvo da Observação.
begin;

create or replace function private.course_annotation_target_snapshot_v1(
  p_course_id uuid,
  p_target_kind text,
  p_target_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog,public,private
as $function$
declare
  v_course public.courses%rowtype;
  v_entity private.course_entities%rowtype;
  v_module private.course_entities%rowtype;
  v_lesson private.course_entities%rowtype;
  v_microsequence private.course_entities%rowtype;
  v_source private.course_source_revisions%rowtype;
  v_anchor private.course_source_anchor_revisions%rowtype;
  v_path jsonb := '[]'::jsonb;
  v_subject_refs jsonb := '[]'::jsonb;
  v_method text;
  v_entity_type text;
begin
  select * into v_course from public.courses course
  where course.id=p_course_id;
  if not found then return null; end if;
  v_path := jsonb_build_array(jsonb_build_object(
    'kind','course','id',v_course.id,'label',v_course.title,
    'version',v_course.revision
  ));
  if p_target_kind='course' then
    if p_target_id<>p_course_id::text then return null; end if;
    return jsonb_build_object(
      'kind','course','id',p_course_id::text,'targetVersion',v_course.revision,
      'path',v_path,'method','target_scope_unclassified','methodVersion',1,
      'taxonomyRevision',v_course.revision,'subjectRefs','[]'::jsonb
    );
  end if;
  if p_target_kind='source' then
    select * into v_source
    from private.course_source_revisions source
    where source.course_id=p_course_id and source.source_id=p_target_id
    order by source.revision desc limit 1;
    if not found then return null; end if;
    v_path:=v_path||jsonb_build_array(jsonb_build_object(
      'kind','source','id',v_source.source_id,
      'label',v_source.title,
      'version',v_source.revision
    ));
    return jsonb_build_object(
      'kind','source','id',v_source.source_id,'targetVersion',v_source.revision,
      'path',v_path,'method','target_scope_unclassified','methodVersion',1,
      'taxonomyRevision',v_course.revision,'subjectRefs','[]'::jsonb
    );
  end if;
  if p_target_kind='source_anchor' then
    select * into v_anchor
    from private.course_source_anchor_revisions anchor
    where anchor.course_id=p_course_id and anchor.anchor_id=p_target_id
    order by anchor.revision desc limit 1;
    if not found then return null; end if;
    select * into strict v_source
    from private.course_source_revisions source
    where source.course_id=p_course_id
      and source.source_id=v_anchor.source_id
      and source.revision=v_anchor.source_revision;
    v_path:=v_path||jsonb_build_array(
      jsonb_build_object(
        'kind','source','id',v_source.source_id,
        'label',v_source.title,
        'version',v_source.revision
      ),
      jsonb_build_object(
        'kind','source_anchor','id',v_anchor.anchor_id,
        'label',null,'version',v_anchor.revision
      )
    );
    return jsonb_build_object(
      'kind','source_anchor','id',v_anchor.anchor_id,
      'targetVersion',v_anchor.revision,
      'path',v_path,'method','target_scope_unclassified','methodVersion',1,
      'taxonomyRevision',v_course.revision,'subjectRefs','[]'::jsonb
    );
  end if;
  v_entity_type := case p_target_kind
    when 'didactic_microsequence' then 'microsequence'
    else p_target_kind
  end;
  if v_entity_type not in('module','lesson','topic','microsequence','study_unit') then
    return null;
  end if;
  select * into v_entity from private.course_entities entity
  where entity.course_id=p_course_id and entity.entity_type=v_entity_type
    and entity.entity_id=p_target_id;
  if not found then return null; end if;

  if v_entity_type='module' then
    v_module:=v_entity;
  elsif v_entity_type='lesson' then
    v_lesson:=v_entity;
    select * into strict v_module from private.course_entities parent
    where parent.course_id=p_course_id and parent.entity_type='module'
      and parent.entity_id=v_lesson.parent_id;
  elsif v_entity_type='topic' then
    v_lesson.course_id:=v_entity.course_id;
    select * into strict v_lesson from private.course_entities parent
    where parent.course_id=p_course_id and parent.entity_type='lesson'
      and parent.entity_id=v_entity.parent_id;
    select * into strict v_module from private.course_entities parent
    where parent.course_id=p_course_id and parent.entity_type='module'
      and parent.entity_id=v_lesson.parent_id;
  elsif v_entity_type='microsequence' then
    v_microsequence:=v_entity;
    select * into strict v_lesson from private.course_entities parent
    where parent.course_id=p_course_id and parent.entity_type='lesson'
      and parent.entity_id=v_microsequence.parent_id;
    select * into strict v_module from private.course_entities parent
    where parent.course_id=p_course_id and parent.entity_type='module'
      and parent.entity_id=v_lesson.parent_id;
  else
    select * into strict v_microsequence from private.course_entities parent
    where parent.course_id=p_course_id and parent.entity_type='microsequence'
      and parent.entity_id=v_entity.parent_id;
    select * into strict v_lesson from private.course_entities parent
    where parent.course_id=p_course_id and parent.entity_type='lesson'
      and parent.entity_id=v_microsequence.parent_id;
    select * into strict v_module from private.course_entities parent
    where parent.course_id=p_course_id and parent.entity_type='module'
      and parent.entity_id=v_lesson.parent_id;
  end if;

  if v_module.course_id is not null and v_entity_type<>'module' then
    v_path:=v_path||jsonb_build_array(jsonb_build_object(
      'kind','module','id',v_module.entity_id,
      'label',v_module.content->>'title','version',v_module.version
    ));
  end if;
  if v_lesson.course_id is not null and v_entity_type<>'lesson' then
    v_path:=v_path||jsonb_build_array(jsonb_build_object(
      'kind','lesson','id',v_lesson.entity_id,
      'label',v_lesson.content->>'title','version',v_lesson.version
    ));
  end if;
  if v_entity_type='topic' then
    v_path:=v_path||jsonb_build_array(jsonb_build_object(
      'kind','topic','id',v_entity.entity_id,
      'label',v_entity.content->>'label','version',v_entity.version
    ));
    v_subject_refs:=jsonb_build_array(jsonb_build_object(
      'topicId',v_entity.entity_id,'label',v_entity.content->>'label',
      'topicVersion',v_entity.version
    ));
    v_method:='exact_topic_target';
  else
    if v_microsequence.course_id is not null and v_entity_type<>'microsequence' then
      v_path:=v_path||jsonb_build_array(jsonb_build_object(
        'kind','didactic_microsequence','id',v_microsequence.entity_id,
        'label',v_microsequence.content->>'title','version',v_microsequence.version
      ));
    end if;
    if v_entity_type='study_unit' then
      v_path:=v_path||jsonb_build_array(jsonb_build_object(
        'kind','study_unit','id',v_entity.entity_id,
        'label',v_entity.content->>'title','version',v_entity.version
      ));
      -- content.topics contém objetos de conhecimento legíveis. Eles não são
      -- IDs da taxonomia da Lição e não classificam automaticamente a anotação.
      v_subject_refs:='[]'::jsonb;
      v_method:='target_scope_unclassified';
    else
      v_path:=v_path||jsonb_build_array(jsonb_build_object(
        'kind',p_target_kind,'id',v_entity.entity_id,
        'label',case when v_entity_type='topic' then v_entity.content->>'label'
          else v_entity.content->>'title' end,'version',v_entity.version
      ));
      v_method:='target_scope_unclassified';
    end if;
  end if;
  return jsonb_build_object(
    'kind',p_target_kind,'id',p_target_id,'targetVersion',v_entity.version,
    'path',v_path,'method',v_method,'methodVersion',1,
    'taxonomyRevision',v_course.revision,'subjectRefs',v_subject_refs
  );
exception when no_data_found then
  raise exception 'A hierarquia corrente do alvo é inconsistente.' using errcode='55000';
end;
$function$;

do $advance_unit_annotation_scope_manifest$
declare
  v_manifest jsonb;
  v_body text;
begin
  v_manifest := jsonb_set(
    public.get_aralearn_runtime_manifest(),
    '{schemaRevision}',
    to_jsonb('20260826093000'::text)
  );
  v_body := 'select ' || quote_literal(v_manifest::text) || '::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      || 'returns jsonb language sql stable security definer '
      || 'set search_path = pg_catalog as %L',
    v_body
  );
end;
$advance_unit_annotation_scope_manifest$;

do $unit_annotation_scope_postflight$
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision' <> '20260826093000'
     or to_regprocedure(
       'private.course_annotation_target_snapshot_v1(uuid,text,text)'
     ) is null then
    raise exception 'O escopo de Observação da Unidade não foi alinhado.'
      using errcode='55000';
  end if;
end;
$unit_annotation_scope_postflight$;

commit;
