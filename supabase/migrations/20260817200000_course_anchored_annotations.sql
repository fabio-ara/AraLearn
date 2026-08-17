-- #124: observações situadas e rastreáveis compartilhadas por Autoria, MCP e Estudo.
-- Texto bruto permanece na autoridade corrente; eventos guardam somente hashes e metadados.

begin;

set local lock_timeout = '15s';
set local statement_timeout = '10min';

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-course-anchored-annotations-v1', 0
));

do $course_anchored_annotations_preflight$
declare
  v_manifest jsonb;
begin
  if to_regclass('public.courses') is null
     or to_regclass('private.course_entities') is null
     or to_regclass('public.course_personal_states') is null
     or to_regclass('public.legacy_trail_personal_states') is null
     or to_regclass('private.trail_observation_threads') is null
     or to_regclass('private.authoring_workspace_observations') is null
     or to_regclass('private.legacy_trail_items') is null
     or to_regclass('private.legacy_authoring_workspaces') is null
     or to_regprocedure('private.require_service_role()') is null
     or to_regprocedure('private.require_course_access_v1(uuid,uuid,boolean)') is null
     or to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception 'Dependências da autoridade de observações do Curso ausentes.'
      using errcode = '55000';
  end if;
  if to_regclass('private.course_anchored_annotations') is not null
     or to_regclass('private.course_anchored_annotation_events') is not null
     or to_regclass('private.course_anchored_annotation_receipts') is not null
     or to_regclass('private.course_anchored_annotation_viewer_versions') is not null then
    raise exception 'A autoridade de observações já existe parcialmente.'
      using errcode = '55000';
  end if;
  if exists(
    select 1 from private.authoring_workspace_observations observation
    where observation.kind = 'audit_finding'
  ) then
    raise exception 'Achados de auditoria exigem o conversor de #125 antes de #124.'
      using errcode = '55000';
  end if;
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision' <> '20260817190000'
     or (v_manifest->>'contractVersion')::integer <> 1
     or not (v_manifest->'features' ?& array[
       'course-sources-v1','course-source-provenance-v1'
     ]) then
    raise exception 'Manifesto anterior a observações é incompatível.'
      using errcode = '55000';
  end if;
end;
$course_anchored_annotations_preflight$;

lock table public.courses in share row exclusive mode;
lock table private.course_entities in share row exclusive mode;
lock table public.course_personal_states in share row exclusive mode;
lock table public.legacy_trail_personal_states in share row exclusive mode;
lock table private.trail_observation_threads in share row exclusive mode;
lock table private.authoring_workspace_observations in share row exclusive mode;

alter table public.courses
  add column annotation_set_version bigint not null default 0,
  add constraint courses_annotation_set_version_v1 check(annotation_set_version >= 0);

create function private.valid_course_annotation_text_v1(
  p_value text,
  p_maximum_characters integer,
  p_maximum_bytes integer,
  p_nullable boolean default false
)
returns boolean
language sql
immutable
security definer
set search_path = pg_catalog
as $function$
  select case
    when p_value is null then p_nullable
    else p_maximum_characters > 0
      and p_maximum_bytes > 0
      and p_value ~ '[^[:space:]]'
      and char_length(p_value) <= p_maximum_characters
      and octet_length(p_value) <= p_maximum_bytes
      and translate(p_value,E'\n\r\t','') !~ '[[:cntrl:]]'
  end
$function$;

create function private.valid_course_annotation_path_v1(p_value jsonb)
returns boolean
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $function$
declare
  v_entry jsonb;
  v_expected text[] := array['course','module','lesson'];
  v_ordinal integer := 0;
  v_last_kind text;
begin
  if jsonb_typeof(p_value) is distinct from 'array'
     or jsonb_array_length(p_value) not between 1 and 5
     or pg_column_size(p_value) > 16384 then
    return false;
  end if;
  for v_entry in select value from jsonb_array_elements(p_value)
  loop
    v_ordinal := v_ordinal + 1;
    if jsonb_typeof(v_entry) is distinct from 'object'
       or not (v_entry ?& array['kind','id','label','version'])
       or v_entry - 'kind' - 'id' - 'label' - 'version' <> '{}'::jsonb
       or v_entry->>'kind' not in(
         'course','module','lesson','topic','didactic_microsequence','study_unit'
       )
       or nullif(btrim(v_entry->>'id'),'') is null
       or v_entry->>'id' <> btrim(v_entry->>'id')
       or char_length(v_entry->>'id') > 240
       or (v_entry->>'id') ~ '[[:cntrl:]]'
       or (
         v_entry->'label' <> 'null'::jsonb and (
           jsonb_typeof(v_entry->'label') is distinct from 'string'
           or not private.valid_course_annotation_text_v1(
             v_entry->>'label',300,1200,false
           )
         )
       )
       or (
         v_entry->'version' <> 'null'::jsonb and (
           jsonb_typeof(v_entry->'version') is distinct from 'number'
           or (v_entry->>'version') !~ '^[1-9][0-9]*$'
         )
       ) then
      return false;
    end if;
    v_last_kind := v_entry->>'kind';
  end loop;
  return (p_value->0->>'kind') = 'course'
    and v_last_kind in(
      'course','module','lesson','topic','didactic_microsequence','study_unit'
    );
end;
$function$;

create function private.valid_course_annotation_rfc3339_v1(
  p_value text,
  p_nullable boolean default false
)
returns boolean
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $function$
declare
  v_timestamp timestamptz;
begin
  if p_value is null then return p_nullable; end if;
  if p_value !~
    '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]+)?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$' then
    return false;
  end if;
  if left(p_value,4)='0000' then return false; end if;
  begin
    v_timestamp:=p_value::timestamptz;
    return isfinite(v_timestamp);
  exception when datetime_field_overflow or invalid_datetime_format then
    return false;
  end;
end;
$function$;

create function private.valid_course_annotation_subject_refs_v1(p_value jsonb)
returns boolean
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $function$
declare
  v_ref jsonb;
begin
  if jsonb_typeof(p_value) is distinct from 'array'
     or jsonb_array_length(p_value) > 64
     or pg_column_size(p_value) > 65536
     or exists(
       select 1 from jsonb_array_elements(p_value) ref
       group by ref->>'topicId' having count(*) > 1
     ) then
    return false;
  end if;
  for v_ref in select value from jsonb_array_elements(p_value)
  loop
    if jsonb_typeof(v_ref) is distinct from 'object'
       or not (v_ref ?& array['topicId','label','topicVersion'])
       or v_ref - 'topicId' - 'label' - 'topicVersion' <> '{}'::jsonb
       or nullif(btrim(v_ref->>'topicId'),'') is null
       or v_ref->>'topicId' <> btrim(v_ref->>'topicId')
       or char_length(v_ref->>'topicId') > 240
       or (v_ref->>'topicId') ~ '[[:cntrl:]]'
       or not private.valid_course_annotation_text_v1(
         v_ref->>'label',300,1200,false
       )
       or jsonb_typeof(v_ref->'topicVersion') is distinct from 'number'
       or (v_ref->>'topicVersion') !~ '^[1-9][0-9]*$' then
      return false;
    end if;
  end loop;
  return true;
end;
$function$;

create table private.course_anchored_annotations(
  id uuid primary key,
  course_id uuid not null references public.courses(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  origin text not null,
  channel text not null,
  target_kind text not null,
  target_id text not null,
  observed_path jsonb not null,
  observed_course_revision bigint,
  observed_target_version bigint,
  observed_revision_certainty text not null,
  raw_text text,
  category text,
  brief_summary text,
  automatic_method text not null,
  automatic_method_version bigint not null,
  automatic_taxonomy_revision bigint,
  automatic_subject_refs jsonb not null default '[]'::jsonb,
  effective_method text not null,
  effective_method_version bigint not null,
  effective_taxonomy_revision bigint,
  effective_subject_refs jsonb not null default '[]'::jsonb,
  classification_corrected_at timestamptz,
  state text not null default 'open',
  owner_response text,
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  first_considered_at timestamptz,
  responded_at timestamptz,
  resolved_at timestamptz,
  withdrawn_at timestamptz,
  hard_delete_after timestamptz,
  version bigint not null default 1,
  constraint course_anchored_annotations_version_v1 check(version > 0),
  constraint course_anchored_annotations_course_identity_v1 unique(course_id,id),
  constraint course_anchored_annotations_provenance_v1 check(
    (origin='author' and channel in('authoring_interface','authoring_chat','unknown_legacy'))
    or (origin='learner' and channel in('study_interface','unknown_legacy'))
    or (origin='human_audit' and channel in('audit_interface','unknown_legacy'))
    or (origin='automatic_audit' and channel in('audit_automation','unknown_legacy'))
    or (origin='unknown_legacy' and channel='unknown_legacy')
  ),
  constraint course_anchored_annotations_target_v1 check(
    target_kind in(
      'course','module','lesson','topic','didactic_microsequence','study_unit'
    )
    and nullif(btrim(target_id),'') is not null
    and target_id=btrim(target_id)
    and char_length(target_id)<=240
    and target_id !~ '[[:cntrl:]]'
    and private.valid_course_annotation_path_v1(observed_path)
    and observed_path->0->>'id'=course_id::text
    and observed_path->-1->>'kind'=target_kind
    and observed_path->-1->>'id'=target_id
  ),
  constraint course_anchored_annotations_observed_revision_v1 check(
    (observed_revision_certainty='known'
      and observed_course_revision>0 and observed_target_version>0
      and (target_kind<>'course' or observed_course_revision=observed_target_version))
    or (observed_revision_certainty='legacy_unknown'
      and observed_course_revision is null and observed_target_version is null)
  ),
  constraint course_anchored_annotations_text_v1 check(
    (state='withdrawn' and raw_text is null and brief_summary is null and owner_response is null)
    or (state<>'withdrawn'
      and private.valid_course_annotation_text_v1(raw_text,2000,16384,false)
      and private.valid_course_annotation_text_v1(brief_summary,500,4096,true)
      and private.valid_course_annotation_text_v1(owner_response,2000,16384,true))
  ),
  constraint course_anchored_annotations_category_v1 check(
    category is null or category in(
      'question','possible_error','confusing','suggestion'
    )
  ),
  constraint course_anchored_annotations_classification_v1 check(
    automatic_method in(
      'exact_topic_target','target_scope_unclassified','legacy_unclassified'
    )
    and automatic_method_version>0
    and effective_method in(
      'exact_topic_target','target_scope_unclassified','legacy_unclassified',
      'human_topic_selection'
    )
    and effective_method_version>0
    and private.valid_course_annotation_subject_refs_v1(automatic_subject_refs)
    and private.valid_course_annotation_subject_refs_v1(effective_subject_refs)
    and (
      automatic_method='legacy_unclassified' and automatic_taxonomy_revision is null
      or automatic_method<>'legacy_unclassified' and automatic_taxonomy_revision>0
    )
    and (
      effective_method='legacy_unclassified' and effective_taxonomy_revision is null
      or effective_method<>'legacy_unclassified' and effective_taxonomy_revision>0
    )
    and (
      classification_corrected_at is null
      and effective_method=automatic_method
      and effective_method_version=automatic_method_version
      and effective_taxonomy_revision is not distinct from automatic_taxonomy_revision
      and effective_subject_refs=automatic_subject_refs
      or classification_corrected_at is not null
        and effective_method='human_topic_selection'
    )
  ),
  constraint course_anchored_annotations_state_v1 check(
    state in('open','considered','resolved','withdrawn')
    and (first_considered_at is null or state in('considered','resolved','withdrawn','open'))
    and (responded_at is null)=(owner_response is null)
    and (state='resolved')=(resolved_at is not null)
    and (
      state='withdrawn' and withdrawn_at is not null
        and hard_delete_after=withdrawn_at+interval '14 days'
      or state<>'withdrawn' and withdrawn_at is null and hard_delete_after is null
    )
  )
);

create index course_anchored_annotations_inbox_v1_idx
  on private.course_anchored_annotations(
    course_id,state,updated_at desc,id desc
  );
create index course_anchored_annotations_target_v1_idx
  on private.course_anchored_annotations(
    course_id,target_kind,target_id,updated_at desc,id desc
  );
create index course_anchored_annotations_actor_v1_idx
  on private.course_anchored_annotations(
    actor_id,course_id,updated_at desc,id desc
  ) where actor_id is not null;
create index course_anchored_annotations_cleanup_v1_idx
  on private.course_anchored_annotations(hard_delete_after,id)
  where hard_delete_after is not null;
create index course_anchored_annotations_subjects_v1_idx
  on private.course_anchored_annotations using gin(effective_subject_refs jsonb_path_ops);

create table private.course_anchored_annotation_events(
  id bigint generated always as identity primary key,
  course_id uuid not null references public.courses(id) on delete cascade,
  annotation_id uuid not null,
  annotation_version bigint not null,
  event_type text not null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text not null,
  event_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint course_anchored_annotation_events_version_v1 check(annotation_version>0),
  constraint course_anchored_annotation_events_annotation_version_v1
    unique(annotation_id,annotation_version),
  constraint course_anchored_annotation_events_annotation_course_v1
    foreign key(course_id,annotation_id)
    references private.course_anchored_annotations(course_id,id) on delete cascade,
  constraint course_anchored_annotation_events_type_v1 check(event_type in(
    'created','revised','classification_corrected','considered','responded',
    'resolved','reopened','withdrawn'
  )),
  constraint course_anchored_annotation_events_actor_role_v1 check(actor_role in(
    'author','learner','auditor','unknown_legacy'
  )),
  constraint course_anchored_annotation_events_hash_v1 check(
    event_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint course_anchored_annotation_events_metadata_v1 check(
    jsonb_typeof(metadata)='object'
    and pg_column_size(metadata)<=16384
    and metadata::text !~ '"(rawText|ownerResponse|briefSummary|body|response)"[[:space:]]*:'
  )
);
create index course_anchored_annotation_events_annotation_v1_idx
  on private.course_anchored_annotation_events(annotation_id,id);
create index course_anchored_annotation_events_course_v1_idx
  on private.course_anchored_annotation_events(course_id,created_at,id);

create table private.course_anchored_annotation_receipts(
  actor_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null,
  course_id uuid not null references public.courses(id) on delete cascade,
  annotation_id uuid not null,
  operation text not null,
  request_hash text not null,
  result_annotation_version bigint not null,
  result_annotation_set_version bigint not null,
  result_changed boolean not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '14 days',
  primary key(actor_id,request_id),
  constraint course_anchored_annotation_receipts_request_v1 check(
    request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
  ),
  constraint course_anchored_annotation_receipts_operation_v1 check(operation in(
    'create_anchored_annotation','revise_anchored_annotation',
    'withdraw_anchored_annotation','consider_anchored_annotation',
    'respond_to_anchored_annotation','resolve_anchored_annotation',
    'reopen_anchored_annotation','correct_anchored_annotation_subjects'
  )),
  constraint course_anchored_annotation_receipts_hash_v1 check(
    request_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint course_anchored_annotation_receipts_result_v1 check(
    result_annotation_version>0 and result_annotation_set_version>=0
  ),
  constraint course_anchored_annotation_receipts_expiry_v1 check(
    expires_at>created_at and expires_at<=created_at+interval '14 days'
  )
);
create index course_anchored_annotation_receipts_expiry_v1_idx
  on private.course_anchored_annotation_receipts(expires_at,actor_id,request_id);

-- O contador global do Curso é útil à pessoa autora, mas revelaria a atividade
-- de outras pessoas no Estudo. Esta relação guarda apenas o contador monotônico
-- da própria projeção e um pseudônimo aleatório não derivável do UUID listado
-- no roster, sem texto, classificação ou novo histórico de domínio.
create table private.course_anchored_annotation_viewer_versions(
  course_id uuid not null references public.courses(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  protected_ref text not null default (
    'person-'||substr(replace(gen_random_uuid()::text,'-',''),1,16)
  ),
  version bigint not null default 0,
  primary key(course_id,actor_id),
  constraint course_annotation_viewer_protected_ref_v1
    unique(course_id,protected_ref),
  constraint course_anchored_annotation_viewer_versions_ref_v1 check(
    protected_ref ~ '^person-[0-9a-f]{16}$'
  ),
  constraint course_anchored_annotation_viewer_versions_value_v1 check(
    version between 0 and 9007199254740991
  )
);
create index course_anchored_annotation_viewer_versions_actor_v1_idx
  on private.course_anchored_annotation_viewer_versions(actor_id,course_id);

alter table private.course_anchored_annotations enable row level security;
alter table private.course_anchored_annotations force row level security;
alter table private.course_anchored_annotation_events enable row level security;
alter table private.course_anchored_annotation_events force row level security;
alter table private.course_anchored_annotation_receipts enable row level security;
alter table private.course_anchored_annotation_receipts force row level security;
alter table private.course_anchored_annotation_viewer_versions enable row level security;
alter table private.course_anchored_annotation_viewer_versions force row level security;
revoke all on table private.course_anchored_annotations,
  private.course_anchored_annotation_events,
  private.course_anchored_annotation_receipts,
  private.course_anchored_annotation_viewer_versions
  from public,anon,authenticated,service_role;

create function private.course_anchored_annotation_item_v1(
  p_annotation private.course_anchored_annotations,
  p_viewer_id uuid,
  p_viewer_is_owner boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog,public,private,extensions
as $function$
declare
  v_current jsonb;
  v_ref text;
  v_contributor_kind text;
  v_contributor_role text;
  v_contributor_label text;
  v_target_deep_link text;
  v_deep_link text;
begin
  v_current:=private.course_annotation_target_snapshot_v1(
    p_annotation.course_id,p_annotation.target_kind,p_annotation.target_id
  );
  v_ref:=case when p_annotation.actor_id is null then null else (
    select viewer.protected_ref
    from private.course_anchored_annotation_viewer_versions viewer
    where viewer.course_id=p_annotation.course_id
      and viewer.actor_id=p_annotation.actor_id
  ) end;
  v_contributor_role:=case
    when p_annotation.origin in('human_audit','automatic_audit') then 'auditor'
    else p_annotation.origin
  end;
  if p_annotation.origin='automatic_audit' then
    v_contributor_kind:='software';
    v_contributor_label:='Auditoria automática';
  elsif p_annotation.actor_id=p_viewer_id then
    v_contributor_kind:='self';
    v_contributor_label:=case when p_annotation.origin='author'
      then 'Você · pessoa autora' else 'Você' end;
  elsif p_annotation.actor_id is null then
    v_contributor_kind:='unknown_legacy';
    v_contributor_label:='Origem legada';
  else
    v_contributor_kind:='protected_person';
    v_contributor_label:=case when p_annotation.origin='learner'
      then 'Estudante '||upper(substr(v_ref,8,4)) else 'Pessoa autora' end;
  end if;
  v_target_deep_link:=case when v_current is null or not p_viewer_is_owner then null
    when p_annotation.target_kind='course' then
      '#/authoring/courses/'||p_annotation.course_id::text||'?section=inspection'
    when p_annotation.target_kind='module' then
      '#/authoring/courses/'||p_annotation.course_id::text||
      '?section=inspection&moduleId='||private.course_annotation_urlencode_v1(p_annotation.target_id)
    when p_annotation.target_kind='lesson' then
      '#/authoring/courses/'||p_annotation.course_id::text||
      '?section=inspection&lessonId='||private.course_annotation_urlencode_v1(p_annotation.target_id)
    when p_annotation.target_kind='didactic_microsequence' then
      '#/authoring/courses/'||p_annotation.course_id::text||
      '?section=inspection&didacticMicrosequenceId='||
      private.course_annotation_urlencode_v1(p_annotation.target_id)
    when p_annotation.target_kind='study_unit' then
      '#/authoring/courses/'||p_annotation.course_id::text||
      '?section=inspection&studyUnitId='||private.course_annotation_urlencode_v1(p_annotation.target_id)
    else
      '#/authoring/courses/'||p_annotation.course_id::text||
      '?section=inspection&lessonId='||private.course_annotation_urlencode_v1(
        coalesce((select entry->>'id' from jsonb_array_elements(v_current->'path') entry
          where entry->>'kind'='lesson' limit 1),p_annotation.target_id)
      )
  end;
  v_deep_link:=case when p_viewer_is_owner then
    '#/authoring/courses/'||p_annotation.course_id::text||
    '?section=observations&annotationId='||p_annotation.id::text
    else null end;
  return jsonb_build_object(
    'contract','aralearn.course-anchored-annotation.v1',
    'annotationId',p_annotation.id,
    'annotationVersion',p_annotation.version,
    'courseId',p_annotation.course_id,
    'provenance',jsonb_build_object(
      'origin',p_annotation.origin,'channel',p_annotation.channel
    ),
    'contributor',jsonb_build_object(
      'kind',v_contributor_kind,'role',v_contributor_role,
      'ref',case when v_contributor_kind='protected_person' then v_ref else null end,
      'label',v_contributor_label
    ),
    'target',jsonb_build_object(
      'kind',p_annotation.target_kind,'id',p_annotation.target_id,
      'observedPath',p_annotation.observed_path,
      'currentAvailable',v_current is not null,
      'currentPath',v_current->'path',
      'deepLink',v_target_deep_link
    ),
    'observedRevision',jsonb_build_object(
      'certainty',p_annotation.observed_revision_certainty,
      'courseRevision',p_annotation.observed_course_revision,
      'targetVersion',p_annotation.observed_target_version
    ),
    'rawText',p_annotation.raw_text,
    'category',p_annotation.category,
    'briefSummary',p_annotation.brief_summary,
    'subjectClassification',jsonb_build_object(
      'status',case when jsonb_array_length(p_annotation.effective_subject_refs)>0
        then 'classified' else 'unclassified' end,
      'automatic',jsonb_build_object(
        'method',p_annotation.automatic_method,
        'methodVersion',p_annotation.automatic_method_version,
        'taxonomyRevision',p_annotation.automatic_taxonomy_revision,
        'subjects',p_annotation.automatic_subject_refs
      ),
      'effective',jsonb_build_object(
        'method',p_annotation.effective_method,
        'methodVersion',p_annotation.effective_method_version,
        'taxonomyRevision',p_annotation.effective_taxonomy_revision,
        'subjects',p_annotation.effective_subject_refs
      ),
      'correctedAt',p_annotation.classification_corrected_at
    ),
    'state',p_annotation.state,
    'ownerResponse',case when p_annotation.owner_response is null then null
      else jsonb_build_object(
        'text',p_annotation.owner_response,'updatedAt',p_annotation.responded_at
      ) end,
    'timestamps',jsonb_build_object(
      'capturedAt',p_annotation.captured_at,
      'createdAt',p_annotation.created_at,
      'updatedAt',p_annotation.updated_at,
      'firstConsideredAt',p_annotation.first_considered_at,
      'respondedAt',p_annotation.responded_at,
      'resolvedAt',p_annotation.resolved_at,
      'withdrawnAt',p_annotation.withdrawn_at
    ),
    'capabilities',jsonb_build_object(
      'canRevise',coalesce(
        p_annotation.actor_id=p_viewer_id and p_annotation.state<>'withdrawn',false
      ),
      'canWithdraw',coalesce(
        p_annotation.actor_id=p_viewer_id and p_annotation.state<>'withdrawn',false
      ),
      'canConsider',p_viewer_is_owner and p_annotation.state='open',
      'canRespond',p_viewer_is_owner and p_annotation.state<>'withdrawn',
      'canResolve',p_viewer_is_owner and p_annotation.state in('open','considered'),
      'canReopen',p_viewer_is_owner and p_annotation.state in('considered','resolved'),
      'canCorrectSubjects',p_viewer_is_owner and p_annotation.state<>'withdrawn'
    ),
    'deepLink',v_deep_link
  );
end;
$function$;

create function private.raise_course_anchored_annotation_not_found_v1()
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  raise sqlstate 'PGRST' using
    message=jsonb_build_object(
      'code','course_anchored_annotation_not_found',
      'message','A observação situada não existe.',
      'details',null,'hint',null
    )::text,
    detail=jsonb_build_object(
      'status',404,'headers',jsonb_build_object()
    )::text;
end;
$function$;

create function private.raise_course_anchored_annotation_target_not_found_v1()
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  raise sqlstate 'PGRST' using
    message=jsonb_build_object(
      'code','course_anchored_annotation_target_not_found',
      'message','O alvo situado da observação não existe.',
      'details',null,'hint',null
    )::text,
    detail=jsonb_build_object(
      'status',404,'headers',jsonb_build_object()
    )::text;
end;
$function$;

revoke all on function private.course_anchored_annotation_item_v1(
  private.course_anchored_annotations,uuid,boolean
), private.raise_course_anchored_annotation_not_found_v1()
 , private.raise_course_anchored_annotation_target_not_found_v1()
from public,anon,authenticated,service_role;

revoke all on function private.valid_course_annotation_text_v1(text,integer,integer,boolean),
  private.valid_course_annotation_path_v1(jsonb),
  private.valid_course_annotation_rfc3339_v1(text,boolean),
  private.valid_course_annotation_subject_refs_v1(jsonb)
  from public,anon,authenticated,service_role;

create function private.course_annotation_urlencode_v1(p_value text)
returns text
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $function$
declare
  v_bytes bytea := convert_to(p_value,'UTF8');
  v_result text := '';
  v_index integer;
  v_byte integer;
begin
  for v_index in 0..octet_length(v_bytes)-1 loop
    v_byte := get_byte(v_bytes,v_index);
    if v_byte between 65 and 90 or v_byte between 97 and 122
       or v_byte between 48 and 57 or v_byte in(45,46,95,126) then
      v_result := v_result || chr(v_byte);
    else
      v_result := v_result || '%' || upper(lpad(to_hex(v_byte),2,'0'));
    end if;
  end loop;
  return v_result;
end;
$function$;

create function private.course_annotation_target_snapshot_v1(
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
      if jsonb_typeof(v_entity.content->'topics') is distinct from 'array'
         or exists(
           select 1
           from jsonb_array_elements_text(v_entity.content->'topics') topic_id
           left join private.course_entities topic
             on topic.course_id=p_course_id and topic.entity_type='topic'
            and topic.parent_id=v_lesson.entity_id and topic.entity_id=topic_id
           where topic.course_id is null
         ) then
        raise exception 'Os Tópicos explícitos da Unidade não pertencem à Lição corrente.'
          using errcode='55000';
      end if;
      -- A associação da Unidade delimita o escopo permitido para correção humana;
      -- ela não prova que o texto da observação trata de todos esses Tópicos.
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

create function private.course_annotation_hash_v1(p_value jsonb)
returns text
language sql
immutable
security definer
set search_path = pg_catalog,extensions
as $function$
  select encode(extensions.digest(convert_to(p_value::text,'UTF8'),'sha256'),'hex')
$function$;

create function private.record_course_annotation_event_v1(
  p_annotation private.course_anchored_annotations,
  p_event_type text,
  p_actor_id uuid,
  p_actor_role text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog,private
as $function$
declare
  v_hash text;
begin
  v_hash:=private.course_annotation_hash_v1(jsonb_build_object(
    'annotationId',p_annotation.id,'annotationVersion',p_annotation.version,
    'courseId',p_annotation.course_id,'eventType',p_event_type,
    'state',p_annotation.state,'targetKind',p_annotation.target_kind,
    'targetId',p_annotation.target_id,'rawTextHash',case when p_annotation.raw_text is null
      then null else private.course_annotation_hash_v1(to_jsonb(p_annotation.raw_text)) end,
    'briefSummaryHash',case when p_annotation.brief_summary is null
      then null else private.course_annotation_hash_v1(to_jsonb(p_annotation.brief_summary)) end,
    'responseHash',case when p_annotation.owner_response is null
      then null else private.course_annotation_hash_v1(to_jsonb(p_annotation.owner_response)) end,
    'automaticClassificationHash',private.course_annotation_hash_v1(
      jsonb_build_object(
        'method',p_annotation.automatic_method,
        'methodVersion',p_annotation.automatic_method_version,
        'taxonomyRevision',p_annotation.automatic_taxonomy_revision,
        'subjectRefs',p_annotation.automatic_subject_refs
      )
    ),
    'effectiveClassificationHash',private.course_annotation_hash_v1(
      jsonb_build_object(
        'method',p_annotation.effective_method,
        'methodVersion',p_annotation.effective_method_version,
        'taxonomyRevision',p_annotation.effective_taxonomy_revision,
        'subjectRefs',p_annotation.effective_subject_refs
      )
    ),
    'metadata',p_metadata
  ));
  insert into private.course_anchored_annotation_events(
    course_id,annotation_id,annotation_version,event_type,
    actor_id,actor_role,event_hash,metadata
  ) values(
    p_annotation.course_id,p_annotation.id,p_annotation.version,p_event_type,
    p_actor_id,p_actor_role,v_hash,p_metadata
  );
end;
$function$;

create function private.bump_course_annotation_viewer_version_v1(
  p_course_id uuid,
  p_actor_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog,private
as $function$
declare
  v_version bigint;
begin
  if p_course_id is null or p_actor_id is null then
    raise exception 'Identidade da projeção pessoal de observações ausente.'
      using errcode='22023';
  end if;
  insert into private.course_anchored_annotation_viewer_versions(
    course_id,actor_id,version
  ) values(p_course_id,p_actor_id,1)
  on conflict(course_id,actor_id) do update set
    version=course_anchored_annotation_viewer_versions.version+1
  where course_anchored_annotation_viewer_versions.version<9007199254740991
  returning version into v_version;
  if v_version is null then
    raise exception 'A versão pessoal das observações atingiu o limite.'
      using errcode='54000';
  end if;
  return v_version;
end;
$function$;

create function private.cleanup_course_anchored_annotations_v1(p_course_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog,private
as $function$
declare
  v_count integer;
begin
  -- Toda mutação segue Course -> annotation; o lock também impede que uma
  -- leitura de um Curso faça manutenção em outro Curso.
  perform 1 from public.courses course
  where course.id=p_course_id for update;
  if not found then return 0; end if;
  -- Expiração lógica é autoritativa nas leituras e quotas. A remoção física é
  -- oportunista e estritamente limitada para que nenhum Curso transforme uma
  -- leitura comum em coleta ilimitada sob lock.
  with expired as materialized(
    select annotation.id
    from private.course_anchored_annotations annotation
    where annotation.course_id=p_course_id
      and annotation.hard_delete_after<=statement_timestamp()
    order by annotation.hard_delete_after,annotation.id
    limit 128 for update skip locked
  ), removed as(
    delete from private.course_anchored_annotations annotation
    using expired where annotation.id=expired.id returning annotation.actor_id
  ), affected as materialized(
    select removed.actor_id,count(*)::bigint removed_count
    from removed where removed.actor_id is not null group by removed.actor_id
  ), bumped as(
    update private.course_anchored_annotation_viewer_versions viewer set
      version=viewer.version+affected.removed_count
    from affected
    where viewer.course_id=p_course_id and viewer.actor_id=affected.actor_id
    returning viewer.actor_id
  )
  select count(*)::integer into v_count from removed;
  if v_count>0 then
    update public.courses course
    set annotation_set_version=course.annotation_set_version+v_count
    where course.id=p_course_id;
  end if;
  with expired as materialized(
    select receipt.ctid
    from private.course_anchored_annotation_receipts receipt
    where receipt.course_id=p_course_id
      and receipt.expires_at<=statement_timestamp()
    order by receipt.expires_at,receipt.actor_id,receipt.request_id
    limit 256 for update skip locked
  )
  delete from private.course_anchored_annotation_receipts receipt
  using expired where receipt.ctid=expired.ctid;
  return v_count;
end;
$function$;

revoke all on function private.course_annotation_urlencode_v1(text),
  private.course_annotation_target_snapshot_v1(uuid,text,text),
  private.course_annotation_hash_v1(jsonb),
  private.record_course_annotation_event_v1(
    private.course_anchored_annotations,text,uuid,text,jsonb
  ),
  private.bump_course_annotation_viewer_version_v1(uuid,uuid),
  private.cleanup_course_anchored_annotations_v1(uuid)
  from public,anon,authenticated,service_role;

create function private.execute_course_anchored_annotation_command_core_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_course_revision bigint,
  p_command jsonb,
  p_origin text,
  p_channel text,
  p_request_id text,
  p_actor_is_owner boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private,auth,extensions
as $function$
declare
  v_type text;
  v_hash text;
  v_receipt private.course_anchored_annotation_receipts%rowtype;
  v_course public.courses%rowtype;
  v_annotation private.course_anchored_annotations%rowtype;
  v_snapshot jsonb;
  v_changed boolean := false;
  v_event_type text;
  v_actor_role text;
  v_category text;
  v_raw_text text;
  v_summary text;
  v_response text;
  v_subject_ids jsonb;
  v_subject_refs jsonb;
  v_now timestamptz := statement_timestamp();
  v_item jsonb;
  v_result_set_version bigint;
begin
  if p_actor_id is null or p_course_id is null or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or jsonb_typeof(p_command) is distinct from 'object'
     or p_actor_is_owner is null then
    raise exception 'Comando de observação inválido.' using errcode='22023';
  end if;
  v_type:=p_command->>'type';
  if v_type not in(
    'create_anchored_annotation','revise_anchored_annotation',
    'withdraw_anchored_annotation','consider_anchored_annotation',
    'respond_to_anchored_annotation','resolve_anchored_annotation',
    'reopen_anchored_annotation','correct_anchored_annotation_subjects'
  ) or (p_origin,p_channel) not in(
    ('author','authoring_interface'),('author','authoring_chat'),
    ('learner','study_interface')
  ) then
    raise exception 'Tipo ou proveniência do comando inválida.' using errcode='22023';
  end if;
  if (v_type in(
       'create_anchored_annotation','correct_anchored_annotation_subjects'
     ) and (p_expected_course_revision is null or p_expected_course_revision<1))
     or (v_type not in(
       'create_anchored_annotation','correct_anchored_annotation_subjects'
     ) and p_expected_course_revision is not null) then
    raise exception 'A revisão esperada do Curso não corresponde ao comando.'
      using errcode='22023';
  end if;
  if p_actor_is_owner is distinct from (p_origin='author')
     or not p_actor_is_owner and v_type not in(
       'create_anchored_annotation','revise_anchored_annotation',
       'withdraw_anchored_annotation'
     ) then
    raise exception 'Operação incompatível com o papel no Curso.' using errcode='42501';
  end if;
  if pg_column_size(p_command)>32768 then
    raise exception 'Comando de observação excede o limite.' using errcode='54000';
  end if;
  v_hash:=private.course_annotation_hash_v1(jsonb_build_object(
    'courseId',p_course_id,'expectedCourseRevision',p_expected_course_revision,
    'command',p_command,'origin',p_origin,'channel',p_channel
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'course-annotation-request:'||p_actor_id::text||':'||p_request_id,0
  ));
  -- Exclusão de conta já segura a linha da pessoa antes de travar seus Cursos.
  -- Manter a mesma ordem aqui evita o ciclo Course -> auth.users nos FKs de
  -- eventos/recibos contra auth.users -> Course no trigger de redação.
  perform 1 from auth.users actor where actor.id=p_actor_id for key share;
  if not found then
    raise exception 'Pessoa inexistente ou inacessível.' using errcode='PT404';
  end if;
  delete from private.course_anchored_annotation_receipts receipt
  where receipt.actor_id=p_actor_id and receipt.request_id=p_request_id
    and receipt.expires_at<=v_now;
  select * into v_receipt
  from private.course_anchored_annotation_receipts receipt
  where receipt.actor_id=p_actor_id and receipt.request_id=p_request_id;
  if found then
    if v_receipt.course_id<>p_course_id or v_receipt.request_hash<>v_hash
       or v_receipt.operation<>v_type then
      raise exception 'requestId reutilizado com comando incompatível.'
        using errcode='23514';
    end if;
    perform private.cleanup_course_anchored_annotations_v1(p_course_id);
    select * into v_course from public.courses course where course.id=p_course_id;
    select * into v_annotation from private.course_anchored_annotations annotation
    where annotation.id=v_receipt.annotation_id
      and (annotation.hard_delete_after is null
        or annotation.hard_delete_after>statement_timestamp());
    v_item:=case when v_annotation.id is null then null else
      private.course_anchored_annotation_item_v1(
        v_annotation,p_actor_id,p_actor_is_owner
      ) end;
    v_result_set_version:=case when p_actor_is_owner
      then v_course.annotation_set_version else coalesce((
        select viewer.version
        from private.course_anchored_annotation_viewer_versions viewer
        where viewer.course_id=p_course_id and viewer.actor_id=p_actor_id
      ),0) end;
    return jsonb_build_object(
      'contract','aralearn.course-anchored-annotation-change.v1',
      'courseId',p_course_id,'courseRevision',v_course.revision,
      'annotationSetVersion',v_result_set_version,
      'requestId',p_request_id,'idempotent',true,'changed',false,
      'annotation',v_item
    );
  end if;

  perform private.cleanup_course_anchored_annotations_v1(p_course_id);
  select * into v_course from public.courses course
  where course.id=p_course_id for update;
  if not found then
    raise exception 'Curso inexistente ou inacessível.' using errcode='PT404';
  end if;
  if v_type in('create_anchored_annotation','correct_anchored_annotation_subjects')
     and (p_expected_course_revision is null
       or p_expected_course_revision<>v_course.revision) then
    raise exception 'A revisão do Curso mudou; releia o alvo antes de salvar.'
      using errcode='40001';
  end if;
  v_actor_role:=case when p_origin='author' then 'author' else 'learner' end;

  -- Um requestId novo precisa de receipt mesmo quando o comando é no-op. Sem
  -- este teto, uma pessoa poderia inflar a tabela durante a janela de 14 dias
  -- e transformar a limpeza oportunista em trabalho ilimitado sob o lock do
  -- Curso. A retirada permanece sempre possível; cada anotação só pode ser
  -- retirada uma vez e a quota de 512 limita esse excedente terminal.
  if v_type<>'withdraw_anchored_annotation' and (
    select count(*)
    from private.course_anchored_annotation_receipts receipt
    where receipt.actor_id=p_actor_id and receipt.course_id=p_course_id
      and receipt.expires_at>v_now
  )>=1024 then
    raise exception 'Limite temporário de pedidos de observação atingido.'
      using errcode='54000';
  end if;

  if v_type='create_anchored_annotation' then
    if not (p_command ?& array[
         'type','annotationId','target','rawText','category','capturedAt','briefSummary'
       ]) or p_command-'type'-'annotationId'-'target'-'rawText'-'category'-
         'capturedAt'-'briefSummary'<>'{}'::jsonb
       or (p_command->>'annotationId') is null
       or (p_command->>'annotationId') !~
         '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or jsonb_typeof(p_command->'target') is distinct from 'object'
       or not (p_command->'target' ?& array['kind','id'])
       or (p_command->'target')-'kind'-'id'<>'{}'::jsonb then
      raise exception 'Shape de criação de observação inválido.' using errcode='22023';
    end if;
    if not p_actor_is_owner and p_command#>>'{target,kind}'<>'study_unit' then
      raise exception 'O Estudo cria observações somente na Unidade atual.'
        using errcode='22023';
    end if;
    begin
      v_annotation.id:=(p_command->>'annotationId')::uuid;
    exception when invalid_text_representation then
      raise exception 'annotationId inválido.' using errcode='22023';
    end;
    if exists(select 1 from private.course_anchored_annotations where id=v_annotation.id) then
      raise exception 'annotationId já pertence a outra criação.' using errcode='23505';
    end if;
    v_snapshot:=private.course_annotation_target_snapshot_v1(
      p_course_id,p_command#>>'{target,kind}',p_command#>>'{target,id}'
    );
    if v_snapshot is null then
      perform private.raise_course_anchored_annotation_target_not_found_v1();
    end if;
    v_raw_text:=p_command->>'rawText';
    v_category:=case when p_command->'category'='null'::jsonb then null
      else p_command->>'category' end;
    v_summary:=case when p_command->'briefSummary'='null'::jsonb then null
      else p_command->>'briefSummary' end;
    if not private.valid_course_annotation_text_v1(v_raw_text,2000,16384,false)
       or not private.valid_course_annotation_text_v1(v_summary,500,4096,true)
       or p_channel='authoring_chat' and v_summary is null
       or v_category is not null and v_category not in(
         'question','possible_error','confusing','suggestion'
       )
       or p_command->'capturedAt'<>'null'::jsonb
          and jsonb_typeof(p_command->'capturedAt') is distinct from 'string'
       or not private.valid_course_annotation_rfc3339_v1(
         p_command->>'capturedAt',true
       ) then
      raise exception 'Texto, categoria ou instante capturado inválido.' using errcode='22023';
    end if;
    begin
      v_annotation.captured_at:=case when p_command->'capturedAt'='null'::jsonb
        then null else (p_command->>'capturedAt')::timestamptz end;
      if v_annotation.captured_at is not null
         and not isfinite(v_annotation.captured_at) then
        raise exception 'capturedAt inválido.' using errcode='22023';
      end if;
    exception when datetime_field_overflow or invalid_datetime_format then
      raise exception 'capturedAt inválido.' using errcode='22023';
    end;
    insert into private.course_anchored_annotations(
      id,course_id,actor_id,origin,channel,target_kind,target_id,
      observed_path,observed_course_revision,observed_target_version,
      observed_revision_certainty,raw_text,category,brief_summary,
      automatic_method,automatic_method_version,automatic_taxonomy_revision,
      automatic_subject_refs,effective_method,effective_method_version,
      effective_taxonomy_revision,effective_subject_refs,captured_at,
      created_at,updated_at
    ) values(
      v_annotation.id,p_course_id,p_actor_id,p_origin,p_channel,
      v_snapshot->>'kind',v_snapshot->>'id',v_snapshot->'path',
      v_course.revision,(v_snapshot->>'targetVersion')::bigint,'known',
      v_raw_text,v_category,v_summary,v_snapshot->>'method',
      (v_snapshot->>'methodVersion')::bigint,
      (v_snapshot->>'taxonomyRevision')::bigint,v_snapshot->'subjectRefs',
      v_snapshot->>'method',(v_snapshot->>'methodVersion')::bigint,
      (v_snapshot->>'taxonomyRevision')::bigint,v_snapshot->'subjectRefs',
    v_annotation.captured_at,v_now,v_now
    ) returning * into v_annotation;
    if (
      select count(*)>128
      from private.course_anchored_annotations annotation
      where annotation.course_id=p_course_id
        and annotation.actor_id is not distinct from p_actor_id
        and annotation.target_kind=v_snapshot->>'kind'
        and annotation.target_id=v_snapshot->>'id'
        and (annotation.hard_delete_after is null
          or annotation.hard_delete_after>statement_timestamp())
    ) or (
      select count(*)>512
      from private.course_anchored_annotations annotation
      where annotation.course_id=p_course_id
        and annotation.actor_id is not distinct from p_actor_id
        and (annotation.hard_delete_after is null
          or annotation.hard_delete_after>statement_timestamp())
    ) then
      -- A inserção acima é revertida junto com a chamada; contar a nova linha
      -- fecha a corrida sob o lock do Curso e limita também tombstones de 14d.
      raise exception 'Limite de observações por pessoa e Curso atingido.'
        using errcode='54000';
    end if;
    v_changed:=true;
    v_event_type:='created';
  else
    if not (p_command ?& array['type','annotationId','expectedAnnotationVersion']) then
      raise exception 'Shape de comando de observação inválido.' using errcode='22023';
    end if;
    begin
      select * into v_annotation
      from private.course_anchored_annotations annotation
      where annotation.id=(p_command->>'annotationId')::uuid
        and annotation.course_id=p_course_id
        and (annotation.hard_delete_after is null
          or annotation.hard_delete_after>statement_timestamp())
      for update;
    exception when invalid_text_representation then
      perform private.raise_course_anchored_annotation_not_found_v1();
    end;
    if not found then perform private.raise_course_anchored_annotation_not_found_v1(); end if;
    if not p_actor_is_owner
       and v_annotation.actor_id is distinct from p_actor_id then
      -- A projeção de Estudo é self-only. Negar antes do CAS evita que uma
      -- pessoa use versões candidatas para inferir a existência de anotação alheia.
      perform private.raise_course_anchored_annotation_not_found_v1();
    end if;
    if jsonb_typeof(p_command->'expectedAnnotationVersion') is distinct from 'number'
       or (p_command->>'expectedAnnotationVersion') !~ '^[1-9][0-9]*$'
       or (p_command->>'expectedAnnotationVersion')::bigint<>v_annotation.version then
      raise exception 'A observação mudou; releia antes de salvar.' using errcode='40001';
    end if;

    if v_type in('revise_anchored_annotation','withdraw_anchored_annotation')
       and v_annotation.actor_id is distinct from p_actor_id then
      raise exception 'Somente quem criou pode revisar ou retirar a observação.'
        using errcode='42501';
    elsif v_type not in('revise_anchored_annotation','withdraw_anchored_annotation')
       and not p_actor_is_owner then
      raise exception 'Triagem exige a pessoa autora do Curso.' using errcode='42501';
    end if;

    if v_type='revise_anchored_annotation' then
      if p_command-'type'-'annotationId'-'expectedAnnotationVersion'-'rawText'-
           'category'-'briefSummary'<>'{}'::jsonb
         or not (p_command ?& array['rawText','category','briefSummary'])
         or v_annotation.state='withdrawn' then
        raise exception 'Revisão da observação inválida.' using errcode='22023';
      end if;
      v_raw_text:=p_command->>'rawText';
      v_category:=case when p_command->'category'='null'::jsonb then null
        else p_command->>'category' end;
      v_summary:=case when p_command->'briefSummary'='null'::jsonb then null
        else p_command->>'briefSummary' end;
      if not private.valid_course_annotation_text_v1(v_raw_text,2000,16384,false)
         or not private.valid_course_annotation_text_v1(v_summary,500,4096,true)
         or v_category is not null and v_category not in(
           'question','possible_error','confusing','suggestion'
         ) then
        raise exception 'Conteúdo revisado inválido.' using errcode='22023';
      end if;
      v_changed:=v_annotation.raw_text is distinct from v_raw_text
        or v_annotation.category is distinct from v_category
        or v_annotation.brief_summary is distinct from v_summary
        or v_annotation.state<>'open'
        or v_annotation.owner_response is not null;
      if v_changed then
        update private.course_anchored_annotations annotation set
          raw_text=v_raw_text,category=v_category,brief_summary=v_summary,
          state='open',owner_response=null,responded_at=null,resolved_at=null,
          updated_at=v_now,version=annotation.version+1
        where annotation.id=v_annotation.id returning * into v_annotation;
        v_event_type:='revised';
      end if;
    elsif v_type='withdraw_anchored_annotation' then
      if p_command-'type'-'annotationId'-'expectedAnnotationVersion'<>'{}'::jsonb
         or v_annotation.state='withdrawn' then
        raise exception 'Retirada da observação inválida.' using errcode='22023';
      end if;
      update private.course_anchored_annotations annotation set
        raw_text=null,brief_summary=null,owner_response=null,
        state='withdrawn',responded_at=null,resolved_at=null,
        withdrawn_at=v_now,hard_delete_after=v_now+interval '14 days',
        updated_at=v_now,version=annotation.version+1
      where annotation.id=v_annotation.id returning * into v_annotation;
      v_changed:=true; v_event_type:='withdrawn';
    elsif v_type='consider_anchored_annotation' then
      if p_command-'type'-'annotationId'-'expectedAnnotationVersion'<>'{}'::jsonb
         or v_annotation.state in('resolved','withdrawn') then
        raise exception 'Consideração da observação inválida.' using errcode='22023';
      end if;
      v_changed:=v_annotation.state='open';
      if v_changed then
        update private.course_anchored_annotations annotation set
          state='considered',first_considered_at=coalesce(first_considered_at,v_now),
          updated_at=v_now,version=annotation.version+1
        where annotation.id=v_annotation.id returning * into v_annotation;
        v_event_type:='considered';
      end if;
    elsif v_type='respond_to_anchored_annotation' then
      if p_command-'type'-'annotationId'-'expectedAnnotationVersion'-
           'ownerResponse'<>'{}'::jsonb or not (p_command ? 'ownerResponse')
         or v_annotation.state='withdrawn' then
        raise exception 'Resposta à observação inválida.' using errcode='22023';
      end if;
      v_response:=p_command->>'ownerResponse';
      if not private.valid_course_annotation_text_v1(v_response,2000,16384,false) then
        raise exception 'Resposta à observação inválida.' using errcode='22023';
      end if;
      v_changed:=v_annotation.owner_response is distinct from v_response
        or v_annotation.state='open';
      if v_changed then
        update private.course_anchored_annotations annotation set
          owner_response=v_response,responded_at=v_now,
          state=case when state='open' then 'considered' else state end,
          first_considered_at=coalesce(first_considered_at,v_now),
          updated_at=v_now,version=annotation.version+1
        where annotation.id=v_annotation.id returning * into v_annotation;
        v_event_type:='responded';
      end if;
    elsif v_type='resolve_anchored_annotation' then
      if p_command-'type'-'annotationId'-'expectedAnnotationVersion'<>'{}'::jsonb
         or v_annotation.state='withdrawn' then
        raise exception 'Resolução da observação inválida.' using errcode='22023';
      end if;
      v_changed:=v_annotation.state<>'resolved';
      if v_changed then
        update private.course_anchored_annotations annotation set
          state='resolved',first_considered_at=coalesce(first_considered_at,v_now),
          resolved_at=v_now,updated_at=v_now,version=annotation.version+1
        where annotation.id=v_annotation.id returning * into v_annotation;
        v_event_type:='resolved';
      end if;
    elsif v_type='reopen_anchored_annotation' then
      if p_command-'type'-'annotationId'-'expectedAnnotationVersion'<>'{}'::jsonb
         or v_annotation.state='withdrawn' then
        raise exception 'Reabertura da observação inválida.' using errcode='22023';
      end if;
      v_changed:=v_annotation.state<>'open';
      if v_changed then
        update private.course_anchored_annotations annotation set
          state='open',resolved_at=null,updated_at=v_now,
          version=annotation.version+1
        where annotation.id=v_annotation.id returning * into v_annotation;
        v_event_type:='reopened';
      end if;
    else
      if p_command-'type'-'annotationId'-'expectedAnnotationVersion'-
           'subjectIds'<>'{}'::jsonb
         or jsonb_typeof(p_command->'subjectIds') is distinct from 'array'
         or jsonb_array_length(p_command->'subjectIds')>64
         or exists(
           select 1 from jsonb_array_elements(p_command->'subjectIds') subject
           where jsonb_typeof(subject) is distinct from 'string'
              or nullif(btrim(subject#>>'{}'),'') is null
              or subject#>>'{}'<>btrim(subject#>>'{}')
              or char_length(subject#>>'{}')>240
              or subject#>>'{}' ~ '[[:cntrl:]]'
         ) or exists(
           select 1 from jsonb_array_elements_text(p_command->'subjectIds') subject
           group by subject having count(*)>1
         ) or v_annotation.state='withdrawn' then
        raise exception 'Correção de assuntos inválida.' using errcode='22023';
      end if;
      v_snapshot:=private.course_annotation_target_snapshot_v1(
        p_course_id,v_annotation.target_kind,v_annotation.target_id
      );
      if v_snapshot is null then
        perform private.raise_course_anchored_annotation_target_not_found_v1();
      end if;
      with requested as(
        select subject.value as topic_id,subject.ordinal
        from jsonb_array_elements_text(p_command->'subjectIds')
          with ordinality subject(value,ordinal)
      ), allowed as(
        select topic.entity_id,topic.content->>'label' as label,topic.version
        from private.course_entities topic
        where topic.course_id=p_course_id and topic.entity_type='topic'
          and case v_annotation.target_kind
            when 'course' then true
            when 'module' then exists(
              select 1 from private.course_entities lesson
              where lesson.course_id=p_course_id and lesson.entity_type='lesson'
                and lesson.parent_id=v_annotation.target_id
                and topic.parent_id=lesson.entity_id
            )
            when 'lesson' then topic.parent_id=v_annotation.target_id
            when 'topic' then topic.entity_id=v_annotation.target_id
            when 'didactic_microsequence' then topic.entity_id in(
              select cover.value from private.course_entities microsequence
              cross join lateral jsonb_array_elements_text(
                coalesce(microsequence.content->'covers','[]'::jsonb)
              ) cover(value)
              where microsequence.course_id=p_course_id
                and microsequence.entity_type='microsequence'
                and microsequence.entity_id=v_annotation.target_id
            )
            else topic.entity_id in(
              select membership.value from private.course_entities unit_value
              cross join lateral jsonb_array_elements_text(
                coalesce(unit_value.content->'topics','[]'::jsonb)
              ) membership(value)
              where unit_value.course_id=p_course_id
                and unit_value.entity_type='study_unit'
                and unit_value.entity_id=v_annotation.target_id
            )
          end
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'topicId',allowed.entity_id,'label',allowed.label,
        'topicVersion',allowed.version
      ) order by requested.ordinal),'[]'::jsonb)
      into v_subject_refs
      from requested join allowed on allowed.entity_id=requested.topic_id;
      if jsonb_array_length(v_subject_refs)<>
         jsonb_array_length(p_command->'subjectIds') then
        raise exception 'A correção contém Tópico fora do escopo do alvo.'
          using errcode='23503';
      end if;
      v_changed:=v_annotation.effective_method<>'human_topic_selection'
        or v_annotation.effective_taxonomy_revision<>v_course.revision
        or v_annotation.effective_subject_refs<>v_subject_refs;
      if v_changed then
        update private.course_anchored_annotations annotation set
          effective_method='human_topic_selection',effective_method_version=1,
          effective_taxonomy_revision=v_course.revision,
          effective_subject_refs=v_subject_refs,classification_corrected_at=v_now,
          updated_at=v_now,version=annotation.version+1
        where annotation.id=v_annotation.id returning * into v_annotation;
        v_event_type:='classification_corrected';
      end if;
    end if;
  end if;

  if v_changed and v_type<>'withdraw_anchored_annotation'
     and v_annotation.version>256 then
    raise exception 'Limite de versões da observação atingido.'
      using errcode='54000';
  end if;
  if v_changed then
    update public.courses course
    set annotation_set_version=course.annotation_set_version+1
    where course.id=p_course_id returning * into v_course;
    perform private.record_course_annotation_event_v1(
      v_annotation,v_event_type,p_actor_id,v_actor_role,
      jsonb_build_object(
        'category',v_annotation.category,
        'state',v_annotation.state,
        'subjectCount',jsonb_array_length(v_annotation.effective_subject_refs)
      )
    );
    if v_annotation.actor_id is not null then
      perform private.bump_course_annotation_viewer_version_v1(
        p_course_id,v_annotation.actor_id
      );
    end if;
  end if;
  v_result_set_version:=case when p_actor_is_owner
    then v_course.annotation_set_version else coalesce((
      select viewer.version
      from private.course_anchored_annotation_viewer_versions viewer
      where viewer.course_id=p_course_id and viewer.actor_id=p_actor_id
    ),0) end;
  v_item:=private.course_anchored_annotation_item_v1(
    v_annotation,p_actor_id,p_actor_is_owner
  );
  insert into private.course_anchored_annotation_receipts(
    actor_id,request_id,course_id,annotation_id,operation,request_hash,
    result_annotation_version,result_annotation_set_version,result_changed
  ) values(
    p_actor_id,p_request_id,p_course_id,v_annotation.id,v_type,v_hash,
    v_annotation.version,v_result_set_version,v_changed
  );
  return jsonb_build_object(
    'contract','aralearn.course-anchored-annotation-change.v1',
    'courseId',p_course_id,'courseRevision',v_course.revision,
    'annotationSetVersion',v_result_set_version,
    'requestId',p_request_id,'idempotent',false,'changed',v_changed,
    'annotation',v_item
  );
end;
$function$;

revoke all on function private.execute_course_anchored_annotation_command_core_v1(
  uuid,uuid,bigint,jsonb,text,text,text,boolean
) from public,anon,authenticated,service_role;

create function public.execute_course_anchored_annotation_command_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_course_revision bigint,
  p_command jsonb,
  p_channel text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private
as $function$
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_channel not in('authoring_interface','authoring_chat') then
    raise exception 'Canal autoral inválido.' using errcode='22023';
  end if;
  return private.execute_course_anchored_annotation_command_core_v1(
    p_actor_id,p_course_id,p_expected_course_revision,p_command,'author',
    p_channel,p_request_id,true
  );
exception when serialization_failure then
  raise sqlstate 'PGRST' using
    message=jsonb_build_object(
      'code','40001','message',sqlerrm,'details',null,'hint',null
    )::text,
    detail=jsonb_build_object('status',409,'headers',jsonb_build_object())::text;
end;
$function$;

create function public.execute_my_course_anchored_annotation_command_v1(
  p_course_id uuid,
  p_expected_course_revision bigint,
  p_command jsonb,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private,auth
as $function$
declare
  v_actor_id uuid:=auth.uid();
begin
  perform private.require_course_access_v1(p_course_id,v_actor_id,false);
  return private.execute_course_anchored_annotation_command_core_v1(
    v_actor_id,p_course_id,p_expected_course_revision,p_command,'learner',
    'study_interface',p_request_id,false
  );
exception when serialization_failure then
  raise sqlstate 'PGRST' using
    message=jsonb_build_object(
      'code','40001','message',sqlerrm,'details',null,'hint',null
    )::text,
    detail=jsonb_build_object('status',409,'headers',jsonb_build_object())::text;
end;
$function$;

revoke all on function public.execute_course_anchored_annotation_command_for_actor_v1(
  uuid,uuid,bigint,jsonb,text,text
) from public,anon,authenticated;
grant execute on function public.execute_course_anchored_annotation_command_for_actor_v1(
  uuid,uuid,bigint,jsonb,text,text
) to service_role;
revoke all on function public.execute_my_course_anchored_annotation_command_v1(
  uuid,bigint,jsonb,text
) from public,anon,service_role;
grant execute on function public.execute_my_course_anchored_annotation_command_v1(
  uuid,bigint,jsonb,text
) to authenticated;

create function private.course_anchored_annotation_matches_v1(
  p_annotation private.course_anchored_annotations,
  p_mode text,
  p_origins text[],
  p_channels text[],
  p_states text[],
  p_categories text[],
  p_include_uncategorized boolean,
  p_subject_ids text[],
  p_target_kind text,
  p_target_id text,
  p_include_descendants boolean,
  p_annotation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select
    (cardinality(p_origins)=0 or p_annotation.origin=any(p_origins))
    and (cardinality(p_channels)=0 or p_annotation.channel=any(p_channels))
    and (cardinality(p_states)=0 or p_annotation.state=any(p_states))
    and (
      cardinality(p_categories)=0 and (
        p_include_uncategorized or p_annotation.category is not null
      )
      or p_annotation.category=any(p_categories)
      or p_include_uncategorized and p_annotation.category is null
    )
    and (
      cardinality(p_subject_ids)=0 or exists(
        select 1 from jsonb_array_elements(p_annotation.effective_subject_refs) subject
        where subject->>'topicId'=any(p_subject_ids)
      )
    )
    and (
      p_mode='detail' and p_annotation.id=p_annotation_id
      or p_mode<>'detail' and (
        p_target_kind is null
        or (
        p_annotation.target_kind=p_target_kind and p_annotation.target_id=p_target_id
        or p_include_descendants and exists(
          select 1 from jsonb_array_elements(p_annotation.observed_path) path_entry
          where path_entry->>'kind'=p_target_kind
            and path_entry->>'id'=p_target_id
        ))
      )
    )
$function$;

create function private.get_course_anchored_annotations_core_v1(
  p_viewer_id uuid,
  p_course_id uuid,
  p_expected_course_revision bigint,
  p_annotation_set_version bigint,
  p_mode text,
  p_origins text[],
  p_channels text[],
  p_states text[],
  p_categories text[],
  p_include_uncategorized boolean,
  p_subject_ids text[],
  p_target_kind text,
  p_target_id text,
  p_include_descendants boolean,
  p_annotation_id uuid,
  p_cursor text,
  p_limit integer,
  p_viewer_is_owner boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private
as $function$
declare
  v_course public.courses%rowtype;
  v_query jsonb;
  v_query_hash text;
  v_cursor jsonb;
  v_after_updated_at timestamptz;
  v_after_id uuid;
  v_items jsonb := '[]'::jsonb;
  v_item jsonb;
  v_summary jsonb;
  v_has_more boolean := false;
  v_next_cursor text;
  v_row private.course_anchored_annotations%rowtype;
  v_count integer := 0;
  v_set_version bigint;
begin
  if p_viewer_id is null or p_course_id is null
     or p_expected_course_revision is null or p_expected_course_revision<1
     or p_annotation_set_version is not null and p_annotation_set_version<0
     or p_mode is null or p_mode not in('inbox','target','detail')
     or p_origins is null or p_channels is null or p_states is null
     or p_categories is null or p_subject_ids is null
     or p_include_uncategorized is null or p_include_descendants is null
     or p_limit is null or p_limit not between 1 and 24
     or cardinality(p_origins)>5 or cardinality(p_channels)>6
     or cardinality(p_states)>4 or cardinality(p_categories)>4
     or cardinality(p_subject_ids)>16
     or exists(select 1 from unnest(p_origins) value where value is null or value not in(
       'author','learner','human_audit','automatic_audit','unknown_legacy'
     ))
     or exists(select 1 from unnest(p_channels) value where value is null or value not in(
       'authoring_interface','authoring_chat','study_interface','audit_interface',
       'audit_automation','unknown_legacy'
     ))
     or exists(select 1 from unnest(p_states) value where value is null or value not in(
       'open','considered','resolved','withdrawn'
     ))
     or exists(select 1 from unnest(p_categories) value where value is null or value not in(
       'question','possible_error','confusing','suggestion'
     ))
     or (select count(*)<>count(distinct value) from unnest(p_origins) value)
     or (select count(*)<>count(distinct value) from unnest(p_channels) value)
     or (select count(*)<>count(distinct value) from unnest(p_states) value)
     or (select count(*)<>count(distinct value) from unnest(p_categories) value)
     or (select count(*)<>count(distinct value) from unnest(p_subject_ids) value)
     or exists(select 1 from unnest(p_subject_ids) value
       where value is null or nullif(btrim(value),'') is null or value<>btrim(value)
         or char_length(value)>240 or value ~ '[[:cntrl:]]')
     or ((p_target_kind is null)<>(p_target_id is null))
     or p_target_kind is null and p_include_descendants
     or p_mode='target' and p_target_kind is null
     or p_mode='detail' and (p_annotation_id is null or p_target_kind is not null)
     or p_mode<>'detail' and p_annotation_id is not null
     or p_annotation_id is not null and p_annotation_id::text !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or p_target_kind is not null and p_target_kind not in(
       'course','module','lesson','topic','didactic_microsequence','study_unit'
     )
     or p_target_id is not null and(
       nullif(btrim(p_target_id),'') is null or p_target_id<>btrim(p_target_id)
       or char_length(p_target_id)>240 or p_target_id ~ '[[:cntrl:]]'
     )
     or p_cursor is not null and(
       char_length(p_cursor)>240 or p_cursor!~'^[A-Za-z0-9+/_-]+={0,2}$'
     ) then
    raise exception 'Consulta de observações inválida.' using errcode='22023';
  end if;
  perform private.cleanup_course_anchored_annotations_v1(p_course_id);
  select * into v_course from public.courses course
  where course.id=p_course_id for share;
  if not found then raise exception 'Curso inexistente ou inacessível.' using errcode='PT404'; end if;
  if v_course.revision<>p_expected_course_revision then
    raise exception 'A revisão do Curso mudou; releia antes de paginar.'
      using errcode='40001';
  end if;
  v_set_version:=case when p_viewer_is_owner
    then v_course.annotation_set_version else coalesce((
      select viewer.version
      from private.course_anchored_annotation_viewer_versions viewer
      where viewer.course_id=p_course_id and viewer.actor_id=p_viewer_id
    ),0) end;
  if p_annotation_set_version is not null
     and p_annotation_set_version<>v_set_version then
    raise exception 'O conjunto de observações mudou; reinicie a paginação.'
      using errcode='40001';
  end if;
  v_query:=jsonb_build_object(
    'mode',p_mode,'origins',to_jsonb(p_origins),'channels',to_jsonb(p_channels),
    'states',to_jsonb(p_states),'categories',to_jsonb(p_categories),
    'includeUncategorized',p_include_uncategorized,
    'subjectIds',to_jsonb(p_subject_ids),
    'hierarchy',case when p_target_kind is not null then jsonb_build_object(
      'target',jsonb_build_object('kind',p_target_kind,'id',p_target_id),
      'includeDescendants',p_include_descendants
    ) else null end,
    'annotationId',p_annotation_id
  );
  v_query_hash:=substr(private.course_annotation_hash_v1(jsonb_build_object(
    'courseId',p_course_id,'courseRevision',v_course.revision,
    'annotationSetVersion',v_set_version,
    'query',v_query,'limit',p_limit,'viewer',case when p_viewer_is_owner
      then 'owner' else p_viewer_id::text end
  )),1,32);
  if p_cursor is not null then
    if p_annotation_set_version is null then
      raise exception 'Cursor exige a versão do conjunto.' using errcode='22023';
    end if;
    begin
      v_cursor:=convert_from(decode(p_cursor,'base64'),'UTF8')::jsonb;
      if jsonb_typeof(v_cursor)<>'object'
         or not (v_cursor ?& array['r','s','q','t','i','l'])
         or v_cursor-'r'-'s'-'q'-'t'-'i'-'l'<>'{}'::jsonb
         or (v_cursor->>'r')::bigint<>v_course.revision
         or (v_cursor->>'s')::bigint<>v_set_version
         or v_cursor->>'q'<>v_query_hash
         or (v_cursor->>'l')::integer<>p_limit then
        raise exception 'Cursor de observações não corresponde à consulta.'
          using errcode='22023';
      end if;
      v_after_updated_at:=(v_cursor->>'t')::timestamptz;
      v_after_id:=(v_cursor->>'i')::uuid;
    exception when others then
      raise exception 'Cursor de observações inválido.' using errcode='22023';
    end;
  end if;

  select jsonb_build_object(
    'matchingTotal',count(*)::integer,
    'byOrigin',coalesce((select jsonb_object_agg(origin,count_value)
      from(select origin,count(*)::integer count_value
        from private.course_anchored_annotations annotation
        where annotation.course_id=p_course_id
          and (annotation.hard_delete_after is null
            or annotation.hard_delete_after>statement_timestamp())
          and (p_viewer_is_owner or annotation.actor_id=p_viewer_id)
          and private.course_anchored_annotation_matches_v1(
            annotation,p_mode,p_origins,p_channels,p_states,p_categories,
            p_include_uncategorized,p_subject_ids,p_target_kind,p_target_id,
            p_include_descendants,p_annotation_id
          ) group by origin) grouped),'{}'::jsonb),
    'byChannel',coalesce((select jsonb_object_agg(channel,count_value)
      from(select channel,count(*)::integer count_value
        from private.course_anchored_annotations annotation
        where annotation.course_id=p_course_id
          and (annotation.hard_delete_after is null
            or annotation.hard_delete_after>statement_timestamp())
          and (p_viewer_is_owner or annotation.actor_id=p_viewer_id)
          and private.course_anchored_annotation_matches_v1(
            annotation,p_mode,p_origins,p_channels,p_states,p_categories,
            p_include_uncategorized,p_subject_ids,p_target_kind,p_target_id,
            p_include_descendants,p_annotation_id
          ) group by channel) grouped),'{}'::jsonb),
    'byState',coalesce((select jsonb_object_agg(state,count_value)
      from(select state,count(*)::integer count_value
        from private.course_anchored_annotations annotation
        where annotation.course_id=p_course_id
          and (annotation.hard_delete_after is null
            or annotation.hard_delete_after>statement_timestamp())
          and (p_viewer_is_owner or annotation.actor_id=p_viewer_id)
          and private.course_anchored_annotation_matches_v1(
            annotation,p_mode,p_origins,p_channels,p_states,p_categories,
            p_include_uncategorized,p_subject_ids,p_target_kind,p_target_id,
            p_include_descendants,p_annotation_id
          ) group by state) grouped),'{}'::jsonb),
    'unclassifiedTotal',count(*) filter(
      where jsonb_array_length(annotation.effective_subject_refs)=0
    )::integer
  ) into v_summary
  from private.course_anchored_annotations annotation
  where annotation.course_id=p_course_id
    and (annotation.hard_delete_after is null
      or annotation.hard_delete_after>statement_timestamp())
    and (p_viewer_is_owner or annotation.actor_id=p_viewer_id)
    and private.course_anchored_annotation_matches_v1(
      annotation,p_mode,p_origins,p_channels,p_states,p_categories,
      p_include_uncategorized,p_subject_ids,p_target_kind,p_target_id,
      p_include_descendants,p_annotation_id
    );

  for v_row in
    select annotation.* from private.course_anchored_annotations annotation
    where annotation.course_id=p_course_id
      and (annotation.hard_delete_after is null
        or annotation.hard_delete_after>statement_timestamp())
      and (p_viewer_is_owner or annotation.actor_id=p_viewer_id)
      and private.course_anchored_annotation_matches_v1(
        annotation,p_mode,p_origins,p_channels,p_states,p_categories,
        p_include_uncategorized,p_subject_ids,p_target_kind,p_target_id,
        p_include_descendants,p_annotation_id
      )
      and (v_after_updated_at is null
        or (annotation.updated_at,annotation.id)<(v_after_updated_at,v_after_id))
    order by annotation.updated_at desc,annotation.id desc
    limit p_limit+1
  loop
    if v_count>=p_limit then v_has_more:=true; exit; end if;
    v_item:=private.course_anchored_annotation_item_v1(
      v_row,p_viewer_id,p_viewer_is_owner
    );
    if octet_length(jsonb_build_object(
      'contract','aralearn.course-anchored-annotation-page.v1',
      'courseId',p_course_id,'courseRevision',v_course.revision,
      'annotationSetVersion',v_set_version,
      'query',v_query,'summary',v_summary,'items',v_items||jsonb_build_array(v_item),
      'hasMore',true,'nextCursor',repeat('x',240)
    )::text)>258048 then
      if v_count=0 then
        raise exception 'Uma observação excede o orçamento da página.' using errcode='54000';
      end if;
      v_has_more:=true; exit;
    end if;
    v_items:=v_items||jsonb_build_array(v_item);
    v_count:=v_count+1;
    v_after_updated_at:=v_row.updated_at;
    v_after_id:=v_row.id;
  end loop;
  if v_has_more then
    v_next_cursor:=encode(convert_to(jsonb_build_object(
      'r',v_course.revision,'s',v_set_version,
      'q',v_query_hash,'t',v_after_updated_at,'i',v_after_id,'l',p_limit
    )::text,'UTF8'),'base64');
    v_next_cursor:=replace(replace(v_next_cursor,E'\n',''),E'\r','');
    if char_length(v_next_cursor)>240 then
      raise exception 'Cursor de observações excedeu o limite.' using errcode='54000';
    end if;
  end if;
  v_item:=jsonb_build_object(
    'contract','aralearn.course-anchored-annotation-page.v1',
    'courseId',p_course_id,'courseRevision',v_course.revision,
    'annotationSetVersion',v_set_version,
    'query',v_query,'summary',v_summary,'items',v_items,
    'hasMore',v_has_more,'nextCursor',v_next_cursor
  );
  if octet_length(v_item::text)>262144 then
    raise exception 'Página de observações excedeu 256 KiB.' using errcode='54000';
  end if;
  return v_item;
end;
$function$;

revoke all on function private.course_anchored_annotation_matches_v1(
  private.course_anchored_annotations,text,text[],text[],text[],text[],boolean,
  text[],text,text,boolean,uuid
), private.get_course_anchored_annotations_core_v1(
  uuid,uuid,bigint,bigint,text,text[],text[],text[],text[],boolean,text[],
  text,text,boolean,uuid,text,integer,boolean
) from public,anon,authenticated,service_role;

create function public.get_owned_course_anchored_annotations_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_course_revision bigint,
  p_annotation_set_version bigint,
  p_mode text,
  p_origins text[],
  p_channels text[],
  p_states text[],
  p_categories text[],
  p_include_uncategorized boolean,
  p_subject_ids text[],
  p_target_kind text,
  p_target_id text,
  p_include_descendants boolean,
  p_annotation_id uuid,
  p_cursor text,
  p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private
as $function$
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  return private.get_course_anchored_annotations_core_v1(
    p_actor_id,p_course_id,p_expected_course_revision,p_annotation_set_version,
    p_mode,p_origins,p_channels,p_states,p_categories,p_include_uncategorized,
    p_subject_ids,p_target_kind,p_target_id,p_include_descendants,p_annotation_id,
    p_cursor,p_limit,true
  );
exception when serialization_failure then
  raise sqlstate 'PGRST' using
    message=jsonb_build_object(
      'code','40001','message',sqlerrm,'details',null,'hint',null
    )::text,
    detail=jsonb_build_object('status',409,'headers',jsonb_build_object())::text;
end;
$function$;

create function public.get_my_course_anchored_annotations_v1(
  p_course_id uuid,
  p_expected_course_revision bigint,
  p_annotation_set_version bigint,
  p_target_kind text,
  p_target_id text,
  p_cursor text,
  p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private,auth
as $function$
declare
  v_actor_id uuid:=auth.uid();
begin
  perform private.require_course_access_v1(p_course_id,v_actor_id,false);
  if p_target_kind<>'study_unit' then
    raise exception 'O Estudo lê observações somente na Unidade atual.' using errcode='22023';
  end if;
  return private.get_course_anchored_annotations_core_v1(
    v_actor_id,p_course_id,p_expected_course_revision,p_annotation_set_version,
    'target','{}'::text[],'{}'::text[],'{}'::text[],'{}'::text[],true,
    '{}'::text[],p_target_kind,p_target_id,false,null,p_cursor,p_limit,false
  );
exception when serialization_failure then
  raise sqlstate 'PGRST' using
    message=jsonb_build_object(
      'code','40001','message',sqlerrm,'details',null,'hint',null
    )::text,
    detail=jsonb_build_object('status',409,'headers',jsonb_build_object())::text;
end;
$function$;

revoke all on function public.get_owned_course_anchored_annotations_for_actor_v1(
  uuid,uuid,bigint,bigint,text,text[],text[],text[],text[],boolean,text[],
  text,text,boolean,uuid,text,integer
) from public,anon,authenticated;
grant execute on function public.get_owned_course_anchored_annotations_for_actor_v1(
  uuid,uuid,bigint,bigint,text,text[],text[],text[],text[],boolean,text[],
  text,text,boolean,uuid,text,integer
) to service_role;
revoke all on function public.get_my_course_anchored_annotations_v1(
  uuid,bigint,bigint,text,text,text,integer
) from public,anon,service_role;
grant execute on function public.get_my_course_anchored_annotations_v1(
  uuid,bigint,bigint,text,text,text,integer
) to authenticated;

-- Migração fechada das duas fontes legadas. A revisão histórica do Curso/alvo
-- não era registrada; por isso nenhum valor corrente é promovido a fato antigo.
do $validate_legacy_course_annotations$
begin
  if exists(
    select 1 from private.trail_observation_threads thread
    where thread.id::text !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or not isfinite(thread.created_at) or not isfinite(thread.updated_at)
       or thread.responded_at is not null and not isfinite(thread.responded_at)
       or thread.resolved_at is not null and not isfinite(thread.resolved_at)
  ) or exists(
    select 1 from private.authoring_workspace_observations observation
    where observation.kind='note' and(
      observation.id::text !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or not isfinite(observation.created_at)
      or not isfinite(observation.updated_at)
    )
  ) then
    raise exception 'Identidade ou instante legado de observação é inválido.'
      using errcode='55000';
  end if;
  if exists(
    select 1
    from public.course_personal_states state_row
    cross join lateral jsonb_each(state_row.state->'observations') observation
    where not private.valid_course_annotation_rfc3339_v1(
      observation.value->>'updatedAt',false
    )
  ) then
    raise exception 'capturedAt legado não é RFC3339 finito.' using errcode='55000';
  end if;
  if exists(
    select 1
    from public.course_personal_states current_state
    full join public.legacy_trail_personal_states legacy_state
      on legacy_state.user_id=current_state.user_id
     and legacy_state.trail_item_id=current_state.course_id
    where legacy_state.user_id is not null and current_state.user_id is null
       or current_state.user_id is not null
          and current_state.state->'observations'<>'{}'::jsonb
          and legacy_state.user_id is null
       or current_state.user_id is not null and legacy_state.user_id is not null
          and current_state.state->'observations'
            is distinct from legacy_state.state->'observations'
  ) then
    raise exception 'Estado pessoal legado e corrente divergem nas observações.'
      using errcode='55000';
  end if;
  if exists(
    select 1
    from public.course_personal_states state_row
    cross join lateral jsonb_each(state_row.state->'observations') observation
    left join private.trail_observation_threads thread
      on thread.user_id=state_row.user_id
     and thread.trail_item_id=state_row.course_id
     and thread.card_id=observation.key
    where thread.id is null
  ) or exists(
    select 1 from private.trail_observation_threads thread
    left join public.course_personal_states state_row
      on state_row.user_id=thread.user_id
     and state_row.course_id=thread.trail_item_id
    where state_row.user_id is null
       or state_row.state#>array['observations',thread.card_id] is null
  ) then
    raise exception 'Thread e texto pessoal de observação estão órfãos ou divergentes.'
      using errcode='55000';
  end if;
  if exists(
    select observation.workspace_id
    from private.authoring_workspace_observations observation
    left join private.legacy_trail_items item
      on item.workspace_id=observation.workspace_id
     and item.workspace_course_id=observation.entity_path[1]
    where observation.kind='note'
    group by observation.id,observation.workspace_id
    having count(item.id)<>1
  ) then
    raise exception 'Nota autoral não possui mapeamento exato para um Curso.'
      using errcode='55000';
  end if;
  if exists(
    select 1 from private.authoring_workspace_observations observation
    where observation.kind='note'
      and observation.entity_type not in(
        'course','module','lesson','microsequence','card'
      )
  ) then
    raise exception 'Nota autoral possui alvo sem conversão exata.' using errcode='55000';
  end if;
  if exists(
    select thread.id from private.trail_observation_threads thread
    intersect
    select observation.id from private.authoring_workspace_observations observation
    where observation.kind='note'
  ) then
    raise exception 'Identidade de observação colide entre fontes legadas.'
      using errcode='55000';
  end if;
end;
$validate_legacy_course_annotations$;

create temporary table course_legacy_anchored_annotations_v1(
  id uuid primary key,
  course_id uuid not null,
  actor_id uuid,
  origin text not null,
  channel text not null,
  target_kind text not null,
  target_id text not null,
  observed_path jsonb not null,
  raw_text text not null,
  category text,
  brief_summary text,
  state text not null,
  owner_response text,
  captured_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  first_considered_at timestamptz,
  responded_at timestamptz,
  resolved_at timestamptz
) on commit drop;

insert into course_legacy_anchored_annotations_v1(
  id,course_id,actor_id,origin,channel,target_kind,target_id,observed_path,
  raw_text,category,brief_summary,state,owner_response,captured_at,
  created_at,updated_at,first_considered_at,responded_at,resolved_at
)
select
  thread.id,state_row.course_id,state_row.user_id,'learner','study_interface',
  'study_unit',observation.key,
  jsonb_build_array(
    jsonb_build_object(
      'kind','course','id',state_row.course_id::text,'label',null,'version',null
    ),
    jsonb_build_object(
      'kind','study_unit','id',observation.key,'label',null,'version',null
    )
  ),
  observation.value->>'body',
  case observation.value->>'category'
    when 'observation' then null else observation.value->>'category' end,
  null,
  case when thread.status='open' and thread.response is not null then 'considered'
    when thread.status='considered' then 'considered'
    when thread.status='resolved' then 'resolved'
    when thread.status='incorporated' then 'resolved'
    else 'open' end,
  thread.response,
  null,
  thread.created_at,
  greatest(thread.updated_at,(observation.value->>'updatedAt')::timestamptz),
  case when thread.status<>'open' or thread.response is not null
    then coalesce(thread.responded_at,thread.resolved_at,thread.updated_at) else null end,
  case when thread.response is not null
    then coalesce(thread.responded_at,thread.updated_at) else null end,
  case when thread.status in('resolved','incorporated')
    then coalesce(thread.resolved_at,thread.updated_at) else null end
from public.course_personal_states state_row
join public.courses course on course.id=state_row.course_id
cross join lateral jsonb_each(state_row.state->'observations') observation
join private.trail_observation_threads thread
  on thread.user_id=state_row.user_id
 and thread.trail_item_id=state_row.course_id
 and thread.card_id=observation.key;

do $stage_legacy_author_notes$
declare
  v_note private.authoring_workspace_observations%rowtype;
  v_course_id uuid;
  v_target_kind text;
  v_target_id text;
  v_snapshot jsonb;
  v_legacy_suffix text[];
  v_current_suffix text[];
  v_path jsonb;
  v_owner_id uuid;
begin
  for v_note in
    select * from private.authoring_workspace_observations observation
    where observation.kind='note'
    order by observation.id
  loop
    select item.id into strict v_course_id
    from private.legacy_trail_items item
    where item.workspace_id=v_note.workspace_id
      and item.workspace_course_id=v_note.entity_path[1];
    select course.owner_id into strict v_owner_id
    from public.courses course where course.id=v_course_id;
    v_target_kind:=case v_note.entity_type
      when 'course' then 'course'
      when 'microsequence' then 'didactic_microsequence'
      when 'card' then 'study_unit'
      else v_note.entity_type
    end;
    v_target_id:=case when v_target_kind='course' then v_course_id::text
      else v_note.entity_path[cardinality(v_note.entity_path)] end;
    v_snapshot:=private.course_annotation_target_snapshot_v1(
      v_course_id,v_target_kind,v_target_id
    );
    if v_snapshot is null then
      raise exception 'Alvo da nota % não existe no Curso convertido.',v_note.id
        using errcode='55000';
    end if;
    if v_target_kind<>'course' then
      v_legacy_suffix:=v_note.entity_path[2:cardinality(v_note.entity_path)];
      select array_agg(entry.value->>'id' order by entry.ordinal)
      into v_current_suffix
      from jsonb_array_elements(v_snapshot->'path')
        with ordinality entry(value,ordinal)
      where entry.ordinal>1;
      if v_legacy_suffix is distinct from v_current_suffix then
        raise exception 'Caminho legado da nota % diverge do alvo convertido.',v_note.id
          using errcode='55000';
      end if;
    end if;
    select jsonb_agg(entry.value||jsonb_build_object('label',null,'version',null)
      order by entry.ordinal) into v_path
    from jsonb_array_elements(v_snapshot->'path')
      with ordinality entry(value,ordinal);
    insert into course_legacy_anchored_annotations_v1(
      id,course_id,actor_id,origin,channel,target_kind,target_id,
      observed_path,raw_text,category,brief_summary,state,owner_response,
      captured_at,created_at,updated_at,first_considered_at,responded_at,resolved_at
    ) values(
      v_note.id,v_course_id,v_note.author_id,
      'author',
      'unknown_legacy',v_target_kind,v_target_id,v_path,v_note.body,null,null,
      'open',null,null,v_note.created_at,v_note.updated_at,null,null,null
    );
  end loop;
end;
$stage_legacy_author_notes$;

do $validate_legacy_annotation_payloads$
begin
  if exists(
    select 1 from course_legacy_anchored_annotations_v1 legacy
    where not private.valid_course_annotation_text_v1(
        legacy.raw_text,2000,16384,false
      )
       or not private.valid_course_annotation_text_v1(
        legacy.owner_response,2000,16384,true
      )
       or legacy.category is not null and legacy.category not in(
         'question','possible_error','confusing','suggestion'
       )
       or not private.valid_course_annotation_path_v1(legacy.observed_path)
       or legacy.observed_path->0->>'id'<>legacy.course_id::text
       or legacy.observed_path->-1->>'kind'<>legacy.target_kind
       or legacy.observed_path->-1->>'id'<>legacy.target_id
       or not isfinite(legacy.created_at) or not isfinite(legacy.updated_at)
       or legacy.first_considered_at is not null
          and not isfinite(legacy.first_considered_at)
       or legacy.responded_at is not null and not isfinite(legacy.responded_at)
       or legacy.resolved_at is not null and not isfinite(legacy.resolved_at)
  ) then
    raise exception 'Payload legado de observação não cabe no contrato #124.'
      using errcode='55000';
  end if;
end;
$validate_legacy_annotation_payloads$;

do $validate_legacy_annotation_quotas$
begin
  if exists(
    select 1 from course_legacy_anchored_annotations_v1 legacy
    group by legacy.course_id,legacy.actor_id,legacy.target_kind,legacy.target_id
    having count(*)>128
  ) or exists(
    select 1 from course_legacy_anchored_annotations_v1 legacy
    group by legacy.course_id,legacy.actor_id
    having count(*)>512
  ) then
    raise exception 'Observações legadas excedem a quota de #124; exporte antes do cutover.'
      using errcode='55000';
  end if;
end;
$validate_legacy_annotation_quotas$;

insert into private.course_anchored_annotations(
  id,course_id,actor_id,origin,channel,target_kind,target_id,observed_path,
  observed_course_revision,observed_target_version,observed_revision_certainty,
  raw_text,category,brief_summary,automatic_method,automatic_method_version,
  automatic_taxonomy_revision,automatic_subject_refs,effective_method,
  effective_method_version,effective_taxonomy_revision,effective_subject_refs,
  state,owner_response,captured_at,created_at,updated_at,first_considered_at,
  responded_at,resolved_at
)
select
  legacy.id,legacy.course_id,legacy.actor_id,legacy.origin,legacy.channel,
  legacy.target_kind,legacy.target_id,legacy.observed_path,
  null,null,'legacy_unknown',legacy.raw_text,legacy.category,legacy.brief_summary,
  'legacy_unclassified',1,null,'[]'::jsonb,
  'legacy_unclassified',1,null,'[]'::jsonb,legacy.state,legacy.owner_response,
  legacy.captured_at,legacy.created_at,legacy.updated_at,
  legacy.first_considered_at,legacy.responded_at,legacy.resolved_at
from course_legacy_anchored_annotations_v1 legacy;

insert into private.course_anchored_annotation_events(
  course_id,annotation_id,annotation_version,event_type,actor_id,actor_role,
  event_hash,metadata,created_at
)
select annotation.course_id,annotation.id,annotation.version,'created',
  annotation.actor_id,case when annotation.origin='learner' then 'learner'
    when annotation.origin='author' then 'author' else 'unknown_legacy' end,
  private.course_annotation_hash_v1(jsonb_build_object(
    'annotationId',annotation.id,'annotationVersion',annotation.version,
    'courseId',annotation.course_id,'eventType','created',
    'state',annotation.state,'targetKind',annotation.target_kind,
    'targetId',annotation.target_id,
    'rawTextHash',private.course_annotation_hash_v1(to_jsonb(annotation.raw_text)),
    'briefSummaryHash',case when annotation.brief_summary is null then null
      else private.course_annotation_hash_v1(to_jsonb(annotation.brief_summary)) end,
    'responseHash',case when annotation.owner_response is null then null
      else private.course_annotation_hash_v1(to_jsonb(annotation.owner_response)) end,
    'automaticClassificationHash',private.course_annotation_hash_v1(
      jsonb_build_object(
        'method',annotation.automatic_method,
        'methodVersion',annotation.automatic_method_version,
        'taxonomyRevision',annotation.automatic_taxonomy_revision,
        'subjectRefs',annotation.automatic_subject_refs
      )
    ),
    'effectiveClassificationHash',private.course_annotation_hash_v1(
      jsonb_build_object(
        'method',annotation.effective_method,
        'methodVersion',annotation.effective_method_version,
        'taxonomyRevision',annotation.effective_taxonomy_revision,
        'subjectRefs',annotation.effective_subject_refs
      )
    ),
    'metadata',jsonb_build_object('migration','legacy_unclassified')
  )),jsonb_build_object('migration','legacy_unclassified'),annotation.created_at
from private.course_anchored_annotations annotation;

insert into private.course_anchored_annotation_viewer_versions(
  course_id,actor_id,version
)
select annotation.course_id,annotation.actor_id,count(*)::bigint
from private.course_anchored_annotations annotation
where annotation.actor_id is not null
group by annotation.course_id,annotation.actor_id;

update public.courses course
set annotation_set_version=source.annotation_count
from(
  select annotation.course_id,count(*)::bigint annotation_count
  from private.course_anchored_annotations annotation group by annotation.course_id
) source where source.course_id=course.id;

delete from private.authoring_workspace_observations observation
where observation.kind='note';

do $verify_legacy_course_annotations$
declare
  v_stage_count bigint;
  v_final_count bigint;
  v_stage_hash text;
  v_final_hash text;
begin
  select count(*),private.course_annotation_hash_v1(coalesce(jsonb_agg(
    jsonb_build_object(
      'id',legacy.id,'courseId',legacy.course_id,'actorId',legacy.actor_id,
      'origin',legacy.origin,'channel',legacy.channel,
      'targetKind',legacy.target_kind,'targetId',legacy.target_id,
      'observedPath',legacy.observed_path,
      'rawText',legacy.raw_text,'category',legacy.category,'state',legacy.state,
      'ownerResponse',legacy.owner_response,'createdAt',legacy.created_at,
      'updatedAt',legacy.updated_at,'capturedAt',legacy.captured_at,
      'firstConsideredAt',legacy.first_considered_at,
      'respondedAt',legacy.responded_at,'resolvedAt',legacy.resolved_at
    ) order by legacy.id
  ),'[]'::jsonb)) into v_stage_count,v_stage_hash
  from course_legacy_anchored_annotations_v1 legacy;
  select count(*),private.course_annotation_hash_v1(coalesce(jsonb_agg(
    jsonb_build_object(
      'id',annotation.id,'courseId',annotation.course_id,'actorId',annotation.actor_id,
      'origin',annotation.origin,'channel',annotation.channel,
      'targetKind',annotation.target_kind,'targetId',annotation.target_id,
      'observedPath',annotation.observed_path,
      'rawText',annotation.raw_text,'category',annotation.category,'state',annotation.state,
      'ownerResponse',annotation.owner_response,'createdAt',annotation.created_at,
      'updatedAt',annotation.updated_at,'capturedAt',annotation.captured_at,
      'firstConsideredAt',annotation.first_considered_at,
      'respondedAt',annotation.responded_at,'resolvedAt',annotation.resolved_at
    ) order by annotation.id
  ),'[]'::jsonb)) into v_final_count,v_final_hash
  from private.course_anchored_annotations annotation;
  if (v_stage_count,v_stage_hash) is distinct from(v_final_count,v_final_hash) then
    raise exception 'Auditoria da migração de observações divergiu.' using errcode='55000';
  end if;
  if exists(
    select 1 from private.authoring_workspace_observations observation
    where observation.kind='note'
  ) then
    raise exception 'Nota legada permaneceu ativa após a migração.' using errcode='55000';
  end if;
end;
$verify_legacy_course_annotations$;

update public.legacy_trail_personal_states legacy_state
set state=jsonb_set(legacy_state.state,'{observations}','{}'::jsonb,true),
  updated_at=greatest(legacy_state.updated_at,statement_timestamp())
where legacy_state.state->'observations' is distinct from '{}'::jsonb;

-- O estado pessoal volta a ser somente progresso e marcações. Observações já
-- foram copiadas acima e nunca recebem dual-write.
create function private.valid_course_personal_state_v2(p_state jsonb)
returns boolean
language sql
immutable
security definer
set search_path = pg_catalog,private
as $function$
  select p_state is not null
    and jsonb_typeof(p_state)='object'
    and p_state ?& array['version','progress','reviewMarks']
    and p_state-'version'-'progress'-'reviewMarks'='{}'::jsonb
    and p_state->'version'='2'::jsonb
    and private.valid_course_personal_state_v1(jsonb_build_object(
      'version',1,'progress',p_state->'progress',
      'reviewMarks',p_state->'reviewMarks','observations','{}'::jsonb
    ))
    and pg_column_size(p_state)<=524288
$function$;

alter table public.course_personal_states
  drop constraint course_personal_states_state_v1;
update public.course_personal_states state_row
set state=jsonb_build_object(
  'version',2,
  'progress',state_row.state->'progress',
  'reviewMarks',state_row.state->'reviewMarks'
), updated_at=greatest(state_row.updated_at,statement_timestamp());
alter table public.course_personal_states
  add constraint course_personal_states_state_v2 check(
    private.valid_course_personal_state_v2(state)
  );

-- O mesmo requestId pode existir nos dois protocolos durante a TTL residual,
-- mas o v2 nunca consulta nem conflita com uma evidência v1.
alter table private.course_personal_state_receipts
  add column protocol_version smallint not null default 1,
  drop constraint course_personal_state_receipts_pkey,
  add constraint course_personal_state_receipts_protocol_v2 check(
    protocol_version in(1,2)
  ),
  add primary key(user_id,request_id,protocol_version);
delete from private.course_personal_state_receipts receipt
where receipt.expires_at<=statement_timestamp();
alter table private.course_personal_state_receipts
  alter column protocol_version set default 2;

drop function public.load_course_personal_state_v1(uuid);
drop function public.mutate_course_personal_state_v1(uuid,bigint,jsonb,uuid);

create function public.load_course_personal_state_v2(p_course_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog,public,private,auth
as $function$
declare
  v_actor_id uuid:=auth.uid();
  v_state public.course_personal_states%rowtype;
begin
  perform private.require_course_access_v1(p_course_id,v_actor_id,false);
  select * into v_state from public.course_personal_states state_row
  where state_row.user_id=v_actor_id and state_row.course_id=p_course_id;
  if not found then return null; end if;
  return jsonb_build_object(
    'contract','aralearn.course-personal-state.v2',
    'courseId',v_state.course_id,'revision',v_state.revision,
    'state',v_state.state,'updatedAt',v_state.updated_at
  );
end;
$function$;

create function public.mutate_course_personal_state_v2(
  p_course_id uuid,
  p_expected_revision bigint,
  p_operations jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private,auth,extensions
as $function$
declare
  v_actor_id uuid:=auth.uid();
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
     or p_expected_revision is null or p_expected_revision<0
     or jsonb_typeof(p_operations) is distinct from 'array'
     or jsonb_array_length(p_operations) not between 1 and 512
     or pg_column_size(p_operations)>65536 then
    raise exception 'Mutação do estado pessoal inválida.' using errcode='22023';
  end if;
  perform private.require_course_access_v1(p_course_id,v_actor_id,false);
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'courseId',p_course_id,'expectedRevision',p_expected_revision,
    'operations',p_operations,'contract','aralearn.course-personal-state.v2'
  )::text,'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'course-state-request:'||v_actor_id::text||':'||p_request_id::text,0
  ));
  delete from private.course_personal_state_receipts receipt
  where receipt.user_id=v_actor_id and receipt.request_id=p_request_id
    and receipt.expires_at<=statement_timestamp();
  with expired as materialized(
    select receipt.ctid from private.course_personal_state_receipts receipt
    where receipt.expires_at<=statement_timestamp()
    order by receipt.expires_at,receipt.user_id,receipt.request_id
    limit 256 for update skip locked
  ) delete from private.course_personal_state_receipts receipt
    using expired where receipt.ctid=expired.ctid;
  select * into v_receipt from private.course_personal_state_receipts receipt
  where receipt.user_id=v_actor_id and receipt.request_id=p_request_id
    and receipt.protocol_version=2;
  if found then
    if v_receipt.request_hash<>v_hash or v_receipt.course_id<>p_course_id then
      raise exception 'requestId reutilizado com estado incompatível.'
        using errcode='23514';
    end if;
    return jsonb_build_object(
      'courseId',v_receipt.course_id,'revision',v_receipt.result_revision,
      'updatedAt',v_receipt.result_updated_at,'idempotent',true
    );
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'course-state-row:'||v_actor_id::text||':'||p_course_id::text,0
  ));
  select * into v_row from public.course_personal_states state_row
  where state_row.user_id=v_actor_id and state_row.course_id=p_course_id
  for update;
  if not found then
    if p_expected_revision<>0 then
      raise exception 'O estado pessoal mudou; releia antes de salvar.'
        using errcode='40001';
    end if;
    v_state:=jsonb_build_object(
      'version',2,
      'progress',jsonb_build_object('version',3,'lessons','{}'::jsonb),
      'reviewMarks','{}'::jsonb
    );
  else
    if v_row.revision<>p_expected_revision then
      raise exception 'O estado pessoal mudou; releia antes de salvar.'
        using errcode='40001';
    end if;
    v_state:=v_row.state;
  end if;
  for v_operation in select value from jsonb_array_elements(p_operations)
  loop
    if jsonb_typeof(v_operation)<>'object'
       or not (v_operation ?& array['kind','collection','path'])
       or v_operation-'kind'-'collection'-'path'-'value'<>'{}'::jsonb then
      raise exception 'Operação do estado pessoal inválida.' using errcode='22023';
    end if;
    v_kind:=v_operation->>'kind';
    v_collection:=v_operation->>'collection';
    v_path:=v_operation->>'path';
    if v_kind is null or v_kind not in('set','delete')
       or v_collection is null
       or v_collection not in('progress.lessons','reviewMarks')
       or nullif(btrim(v_path),'') is null or v_path<>btrim(v_path)
       or char_length(v_path)>240 or v_path ~ '[[:cntrl:]]'
       or v_kind='set' and not (v_operation ? 'value')
       or v_kind='delete' and v_operation ? 'value' then
      raise exception 'Operação do estado pessoal inválida.' using errcode='22023';
    end if;
    v_json_path:=case v_collection when 'progress.lessons'
      then array['progress','lessons',v_path] else array['reviewMarks',v_path] end;
    v_state:=case when v_kind='delete' then v_state#-v_json_path
      else jsonb_set(v_state,v_json_path,v_operation->'value',true) end;
  end loop;
  if not private.valid_course_personal_state_v2(v_state) then
    raise exception 'A mutação produziria estado pessoal inválido.' using errcode='22023';
  end if;
  if v_row.user_id is null then
    insert into public.course_personal_states(user_id,course_id,revision,state)
    values(v_actor_id,p_course_id,1,v_state) returning * into v_row;
  else
    update public.course_personal_states state_row set
      revision=state_row.revision+1,state=v_state,updated_at=now()
    where state_row.user_id=v_actor_id and state_row.course_id=p_course_id
    returning * into v_row;
  end if;
  v_result:=jsonb_build_object(
    'courseId',v_row.course_id,'revision',v_row.revision,
    'updatedAt',v_row.updated_at,'idempotent',false
  );
  insert into private.course_personal_state_receipts(
    user_id,request_id,protocol_version,course_id,request_hash,
    result_revision,result_updated_at
  ) values(
    v_actor_id,p_request_id,2,p_course_id,v_hash,v_row.revision,v_row.updated_at
  );
  return v_result;
exception when serialization_failure then
  raise sqlstate 'PGRST' using
    message=jsonb_build_object(
      'code','40001','message',sqlerrm,'details',null,'hint',null
    )::text,
    detail=jsonb_build_object('status',409,'headers',jsonb_build_object())::text;
end;
$function$;

revoke all on function private.valid_course_personal_state_v2(jsonb)
  from public,anon,authenticated,service_role;
revoke all on function public.load_course_personal_state_v2(uuid),
  public.mutate_course_personal_state_v2(uuid,bigint,jsonb,uuid)
  from public,anon,service_role;
grant execute on function public.load_course_personal_state_v2(uuid),
  public.mutate_course_personal_state_v2(uuid,bigint,jsonb,uuid)
  to authenticated;

create function private.redact_course_annotations_before_account_deletion_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog,public,private
as $function$
declare
  v_annotation private.course_anchored_annotations%rowtype;
  v_now timestamptz:=statement_timestamp();
begin
  perform 1
  from public.courses course
  where exists(
    select 1 from private.course_anchored_annotations annotation
    where annotation.course_id=course.id and annotation.actor_id=old.id
  )
  order by course.id
  for update;
  for v_annotation in
    update private.course_anchored_annotations annotation set
      actor_id=null,raw_text=null,brief_summary=null,owner_response=null,
      state='withdrawn',responded_at=null,resolved_at=null,
      withdrawn_at=case when annotation.state='withdrawn'
        then annotation.withdrawn_at else v_now end,
      hard_delete_after=case when annotation.state='withdrawn'
        then annotation.hard_delete_after else v_now+interval '14 days' end,
      updated_at=v_now,version=annotation.version+1
    where annotation.actor_id=old.id
    returning *
  loop
    update public.courses course
    set annotation_set_version=course.annotation_set_version+1
    where course.id=v_annotation.course_id;
    perform private.record_course_annotation_event_v1(
      v_annotation,'withdrawn',old.id,
      case when v_annotation.origin='learner' then 'learner'
        when v_annotation.origin='author' then 'author'
        when v_annotation.origin in('human_audit','automatic_audit') then 'auditor'
        else 'unknown_legacy' end,
      jsonb_build_object('accountDeletion',true,'state','withdrawn')
    );
  end loop;
  return old;
end;
$function$;

create trigger redact_course_annotations_before_account_deletion_v1
before delete on auth.users
for each row execute function private.redact_course_annotations_before_account_deletion_v1();
revoke all on function private.redact_course_annotations_before_account_deletion_v1()
  from public,anon,authenticated,service_role;

create function private.preserve_course_annotation_event_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog,public,private,auth
as $function$
begin
  if tg_op='UPDATE'
     and old.actor_id is not null and new.actor_id is null
     and (to_jsonb(new)-'actor_id')=(to_jsonb(old)-'actor_id')
     and not exists(select 1 from auth.users actor where actor.id=old.actor_id) then
    return new;
  end if;
  if tg_op='DELETE' and (
    not exists(select 1 from public.courses course where course.id=old.course_id)
    or not exists(
      select 1 from private.course_anchored_annotations annotation
      where annotation.id=old.annotation_id
    )
    or exists(
      select 1 from private.course_anchored_annotations annotation
      where annotation.id=old.annotation_id and annotation.state='withdrawn'
        and annotation.hard_delete_after<=statement_timestamp()
    )
  ) then
    return old;
  end if;
  raise exception 'Eventos de observação são append-only.' using errcode='55000';
end;
$function$;

create trigger preserve_course_annotation_event_v1
before update or delete on private.course_anchored_annotation_events
for each row execute function private.preserve_course_annotation_event_v1();
revoke all on function private.preserve_course_annotation_event_v1()
  from public,anon,authenticated,service_role;

comment on column public.courses.annotation_set_version is
  'Versão independente do conjunto de observações; não altera a revisão do conteúdo do Curso.';
comment on table private.course_anchored_annotations is
  'Anotações ancoradas correntes; texto retirado é redigido imediatamente e o tombstone expira em 14 dias.';
comment on table private.course_anchored_annotation_events is
  'Histórico append-only sem texto bruto, resposta ou síntese; conserva somente hashes e metadados limitados.';
comment on table private.course_anchored_annotation_receipts is
  'Idempotência por ator/requestId por 14 dias, sem copiar texto da observação.';
comment on table private.course_anchored_annotation_viewer_versions is
  'Contador monotônico e pseudônimo aleatório privados por pessoa/Curso; impedem correlação pelo roster e sinal de atividade alheia.';

do $course_anchored_annotations_postflight$
declare
  v_signature text;
  v_definition text;
begin
  if exists(
    select 1 from public.course_personal_states state_row
    where state_row.state ? 'observations'
       or state_row.state->>'version'<>'2'
       or not private.valid_course_personal_state_v2(state_row.state)
  ) then
    raise exception 'Estado pessoal v1 permaneceu ativo após a migração.' using errcode='55000';
  end if;
  if exists(
    select 1 from public.legacy_trail_personal_states legacy_state
    where legacy_state.state->'observations' is distinct from '{}'::jsonb
  ) then
    raise exception 'Texto de observação permaneceu duplicado no estado legado.'
      using errcode='55000';
  end if;
  if exists(
    select 1 from private.course_anchored_annotations annotation
    where annotation.observed_path->-1->>'kind'<>annotation.target_kind
       or annotation.observed_path->-1->>'id'<>annotation.target_id
       or annotation.state='withdrawn' and(
         annotation.raw_text is not null or annotation.brief_summary is not null
         or annotation.owner_response is not null
        )
  ) then
    raise exception 'Invariante final de observação situada falhou.' using errcode='55000';
  end if;
  if exists(
    select 1 from private.course_anchored_annotations annotation
    where annotation.actor_id is not null and not exists(
      select 1 from private.course_anchored_annotation_viewer_versions viewer
      where viewer.course_id=annotation.course_id and viewer.actor_id=annotation.actor_id
    )
  ) then
    raise exception 'Contador privado ausente para pessoa com observação.' using errcode='55000';
  end if;
  foreach v_signature in array array[
    'public.get_owned_course_anchored_annotations_for_actor_v1(uuid,uuid,bigint,bigint,text,text[],text[],text[],text[],boolean,text[],text,text,boolean,uuid,text,integer)',
    'public.execute_course_anchored_annotation_command_for_actor_v1(uuid,uuid,bigint,jsonb,text,text)',
    'public.get_my_course_anchored_annotations_v1(uuid,bigint,bigint,text,text,text,integer)',
    'public.execute_my_course_anchored_annotation_command_v1(uuid,bigint,jsonb,text)',
    'public.load_course_personal_state_v2(uuid)',
    'public.mutate_course_personal_state_v2(uuid,bigint,jsonb,uuid)'
  ] loop
    if to_regprocedure(v_signature) is null then
      raise exception 'RPC final de observações ausente: %.',v_signature
        using errcode='55000';
    end if;
  end loop;
  if to_regprocedure('public.load_course_personal_state_v1(uuid)') is not null
     or to_regprocedure(
       'public.mutate_course_personal_state_v1(uuid,bigint,jsonb,uuid)'
     ) is not null then
    raise exception 'RPC de estado pessoal v1 permaneceu ativa.' using errcode='55000';
  end if;
  if exists(
    select 1
    from pg_policy policy_value
    where policy_value.polrelid in(
      'private.course_anchored_annotations'::regclass,
      'private.course_anchored_annotation_events'::regclass,
      'private.course_anchored_annotation_receipts'::regclass,
      'private.course_anchored_annotation_viewer_versions'::regclass
    )
  ) then
    raise exception 'Autoridade privada de observações recebeu policy direta.'
      using errcode='55000';
  end if;
  if exists(
    select 1
    from unnest(array['anon','authenticated','service_role']::text[]) role_name
    cross join unnest(array['select','insert','update','delete']::text[]) privilege
    cross join unnest(array[
      'private.course_anchored_annotations',
      'private.course_anchored_annotation_events',
      'private.course_anchored_annotation_receipts',
      'private.course_anchored_annotation_viewer_versions'
    ]::text[]) relation_name
    where has_table_privilege(role_name,relation_name,privilege)
  ) then
    raise exception 'Autoridade privada de observações expõe privilégio direto.'
      using errcode='55000';
  end if;
  select pg_get_functiondef(
    'public.execute_course_anchored_annotation_command_for_actor_v1(uuid,uuid,bigint,jsonb,text,text)'::regprocedure::oid
  ) into v_definition;
  if strpos(v_definition,'''authoring_interface''')=0
     or strpos(v_definition,'''authoring_chat''')=0
     or strpos(lower(v_definition),'when serialization_failure')=0
     or strpos(v_definition,'PGRST')=0 then
    raise exception 'Writer autoral não deriva canal ou CAS HTTP corretamente.'
      using errcode='55000';
  end if;
  select pg_get_functiondef(
    'private.execute_course_anchored_annotation_command_core_v1(uuid,uuid,bigint,jsonb,text,text,text,boolean)'::regprocedure::oid
  ) into v_definition;
  if strpos(v_definition,'authoring_chat')=0
     or strpos(v_definition,'briefSummary')=0
     or strpos(v_definition,'annotation_set_version+1')=0
     or strpos(v_definition,'for update')=0
     or strpos(v_definition,'from auth.users actor')=0
     or strpos(v_definition,'for key share')=0
     or strpos(v_definition,'hard_delete_after>statement_timestamp()')=0 then
    raise exception 'Core de observações não contém as cercas congeladas.'
      using errcode='55000';
  end if;
end;
$course_anchored_annotations_postflight$;

do $advance_course_anchored_annotations_manifest$
declare
  v_manifest jsonb;
  v_features jsonb;
  v_body text;
begin
  v_manifest:=public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision'<>'20260817190000'
     or (v_manifest->>'contractVersion')::integer<>1 then
    raise exception 'Manifesto concorrente à autoridade de observações.'
      using errcode='55000';
  end if;
  select jsonb_agg(feature.value order by feature.ordinal) into v_features
  from(
    select existing.value,existing.ordinal
    from jsonb_array_elements_text(v_manifest->'features')
      with ordinality existing(value,ordinal)
    where existing.value<>'course-personal-state-v1'
    union all select 'course-anchored-annotations-v1',1000008::bigint
    union all select 'course-annotation-subject-classification-v1',1000009::bigint
    union all select 'course-personal-state-v2',1000010::bigint
  ) feature;
  v_manifest:=jsonb_build_object(
    'schemaRevision','20260817200000','contractVersion',1,'features',v_features
  );
  v_body:='select '||quote_literal(v_manifest::text)||'::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      ||'returns jsonb language sql stable security definer '
      ||'set search_path = pg_catalog as %L',v_body
  );
  revoke all on function public.get_aralearn_runtime_manifest()
    from public,anon,authenticated,service_role;
  grant execute on function public.get_aralearn_runtime_manifest()
    to anon,authenticated,service_role;
end;
$advance_course_anchored_annotations_manifest$;

do $verify_course_anchored_annotations_manifest$
declare
  v_manifest jsonb:=public.get_aralearn_runtime_manifest();
begin
  if v_manifest->>'schemaRevision'<>'20260817200000'
     or v_manifest->'features' ? 'course-personal-state-v1'
     or not (v_manifest->'features' ?& array[
       'course-personal-state-v2','course-anchored-annotations-v1',
       'course-annotation-subject-classification-v1'
     ]) then
    raise exception 'Manifesto final manteve o estado pessoal v1 ou perdeu #124.'
      using errcode='55000';
  end if;
end;
$verify_course_anchored_annotations_manifest$;

commit;
