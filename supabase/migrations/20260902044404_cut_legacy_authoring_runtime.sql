-- #274: substitui histórico técnico de Autoria por estado corrente factual.
-- A migration preserva o Curso, seu desenho pedagógico e operações humanas;
-- runs, steps, snapshots integrais e logs narrativos deixam de ser produto.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '5min';
select pg_advisory_xact_lock(hashtextextended('aralearn:#274:authoring-runtime-cut',0));

do $authoring_runtime_cut_preflight$
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision' <> '20260902040050' then
    raise exception 'A revisão anterior do runtime não corresponde à esperada.'
      using errcode = '55000';
  end if;
  if to_regclass('private.course_entities') is null
     or to_regclass('private.course_authoring_part_materializations') is null
     or to_regclass('private.course_design_parameter_changes') is null
     or to_regclass('private.course_source_revisions') is null then
    raise exception 'O runtime legado necessário ao backfill não está íntegro.'
      using errcode = '55000';
  end if;
end;
$authoring_runtime_cut_preflight$;

-- O vínculo corrente aceita somente identidades atuais. Uma referência
-- importada sem Âncora sobrevive como needs_verification; qualquer relação
-- afirmativa continua exigindo ao menos uma Âncora verificável.
create function private.valid_course_source_links_shape_v2(p_links jsonb)
returns boolean
language sql
immutable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(
    jsonb_typeof(p_links) = 'array'
    and jsonb_array_length(p_links) <= 32
    and octet_length(p_links::text) <= 131072
    and not exists(
      select 1
      from jsonb_array_elements(p_links) link(value)
      where jsonb_typeof(link.value) <> 'object'
        or link.value - 'sourceId' - 'relation' - 'anchors'
          <> '{}'::jsonb
        or not (link.value ?& array[
          'sourceId','relation','anchors'
        ])
        or jsonb_typeof(link.value->'sourceId') <> 'string'
        or char_length(link.value->>'sourceId') not between 1 and 240
        or link.value->>'sourceId' <> btrim(link.value->>'sourceId')
        or link.value->>'sourceId' ~ '[[:cntrl:]]'
        or link.value->>'relation' not in (
          'informed_by','supported_by','adapted_from','quoted_from',
          'contrasted_with','exemplified_by','inspired_by','needs_verification'
        )
        or jsonb_typeof(link.value->'anchors') <> 'array'
        or jsonb_array_length(link.value->'anchors') > 8
        or link.value->>'relation' <> 'needs_verification'
          and jsonb_array_length(link.value->'anchors') = 0
        or exists(
          select 1
          from jsonb_array_elements(link.value->'anchors') anchor(value)
          where jsonb_typeof(anchor.value) <> 'object'
            or anchor.value - 'anchorId' <> '{}'::jsonb
            or not (anchor.value ? 'anchorId')
            or jsonb_typeof(anchor.value->'anchorId') <> 'string'
            or char_length(anchor.value->>'anchorId') not between 1 and 240
            or anchor.value->>'anchorId' <> btrim(anchor.value->>'anchorId')
            or anchor.value->>'anchorId' ~ '[[:cntrl:]]'
        )
    )
    and (
      select count(*) = count(distinct link.value->>'sourceId')
      from jsonb_array_elements(p_links) link(value)
    )
    and (
      select count(*) = count(distinct anchor.value->>'anchorId')
      from jsonb_array_elements(p_links) link(value)
      cross join lateral jsonb_array_elements(link.value->'anchors') anchor(value)
    ),false
  )
$function$;

revoke all on function private.valid_course_source_links_shape_v2(jsonb)
from public,anon,authenticated,service_role;

-- A StudyUnit passa a carregar somente o recorte pedagógico que foi aplicado
-- nela. O snapshot exclui Curso, catálogo, outras targets, hashes e payloads
-- operacionais. Null significa ausência factual, nunca um valor fabricado.
alter table private.course_entities
  add column design_snapshot jsonb,
  add column design_application jsonb,
  add column created_origin text,
  add column last_revision_origin text;

alter table private.course_entities
  add constraint course_entities_design_current_v1 check(
    entity_type = 'study_unit'
      and (
        design_snapshot is null and design_application is null
        or jsonb_typeof(design_snapshot) = 'object'
          and design_snapshot->>'contract'
            = 'aralearn.study-unit-design-snapshot.v1'
          and octet_length(design_snapshot::text) <= 65536
          and jsonb_typeof(design_application) = 'object'
          and design_application->>'contract'
            = 'aralearn.study-unit-design-application.v1'
          and octet_length(design_application::text) <= 65536
      )
      and (created_origin is null or created_origin in ('human','gpt'))
      and (last_revision_origin is null or last_revision_origin in ('human','gpt'))
    or entity_type <> 'study_unit'
      and design_snapshot is null
      and design_application is null
      and created_origin is null
      and last_revision_origin is null
  );

with candidates as materialized (
  select entity.course_id,
    entity.entity_id,
    entity.created_at,
    materialization.channel,
    materialization.started_at,
    step.completed_at,
    materialization.design_context,
    target.value as target,
    applied.value as application,
    row_number() over(
      partition by entity.course_id,entity.entity_id
      order by step.completed_at desc,step.id desc
    ) as candidate_order
  from private.course_entities entity
  join private.course_authoring_part_materialization_steps step
    on step.course_id = entity.course_id
   and step.status = 'completed'
   and step.completed_at is not null
   and step.completed_at >= entity.updated_at
  join private.course_authoring_part_materializations materialization
    on materialization.course_id = step.course_id
   and materialization.id = step.materialization_id
  cross join lateral jsonb_array_elements(
    coalesce(step.result_facts#>'{designApplication,studyUnits}','[]'::jsonb)
  ) applied(value)
  left join lateral (
    select target_value.value
    from jsonb_array_elements(
      coalesce(materialization.design_context->'targets','[]'::jsonb)
    ) target_value(value)
    where target_value.value->>'didacticMicrosequenceId' = entity.parent_id
    limit 1
  ) target on true
  where entity.entity_type = 'study_unit'
    and applied.value->>'studyUnitId' = entity.entity_id
), latest as materialized (
  select candidate.*
  from candidates candidate
  where candidate.candidate_order = 1
), focal as materialized (
  select latest.*,
    jsonb_build_object(
      'contract','aralearn.study-unit-design-snapshot.v1',
      'didacticMicrosequenceId',latest.target->>'didacticMicrosequenceId',
      'instructionalAnalysisUnitIds',coalesce(
        latest.target->'instructionalAnalysisUnitIds','[]'::jsonb
      ),
      'evidenceRequirementIds',coalesce(
        latest.target->'evidenceRequirementIds','[]'::jsonb
      ),
      'parameters',coalesce((
        select jsonb_agg(jsonb_build_object(
          'parameterId',parameter.value->>'parameterId',
          'value',parameter.value->'value',
          'origin',parameter.value->>'origin',
          'sourceScopeKind',parameter.value#>>'{sourceScope,kind}'
        ) order by parameter.ordinal)
        from jsonb_array_elements(coalesce(latest.target->'parameters','[]'::jsonb))
          with ordinality parameter(value,ordinal)
      ),'[]'::jsonb),
      'editorialDirections',coalesce((
        select jsonb_agg(jsonb_build_object(
          'direction',revision.value->>'guidance',
          'origin',revision.value->>'origin',
          'sourceScopeKind',revision.value#>>'{sourceScope,kind}'
        ) order by guidance_id.ordinal)
        from jsonb_array_elements_text(
          coalesce(latest.target->'guidanceRevisionIds','[]'::jsonb)
        ) with ordinality guidance_id(value,ordinal)
        join lateral (
          select dictionary.value
          from jsonb_array_elements(
            coalesce(latest.design_context->'guidanceRevisions','[]'::jsonb)
          ) dictionary(value)
          where dictionary.value->>'revisionId' = guidance_id.value
          limit 1
        ) revision on true
      ),'[]'::jsonb),
      'componentPolicy',case
        when jsonb_typeof(latest.target->'componentPolicy') = 'object'
          then jsonb_build_object(
            'policy',latest.target#>'{componentPolicy,policy}',
            'origin',latest.target#>>'{componentPolicy,origin}',
            'sourceScopeKind',latest.target#>>'{componentPolicy,sourceScope,kind}'
          )
        else null
      end,
      'appliedAt',latest.completed_at
    ) as snapshot,
    jsonb_build_object(
      'contract','aralearn.study-unit-design-application.v1'
    ) || (latest.application - 'studyUnitId') as application_value
  from latest
  where latest.target is not null
)
update private.course_entities entity
set design_snapshot = focal.snapshot,
  design_application = focal.application_value,
  created_origin = case
    when entity.created_origin is not null then entity.created_origin
    when focal.channel in ('mcp','actions')
      and focal.created_at between focal.started_at - interval '1 second'
      and focal.completed_at + interval '1 second' then 'gpt'
    else null
  end,
  last_revision_origin = case
    when focal.channel in ('mcp','actions') then 'gpt'
    else null
  end
from focal
where entity.course_id = focal.course_id
  and entity.entity_type = 'study_unit'
  and entity.entity_id = focal.entity_id;

-- Partes retiradas eram tombstones sem qualquer writer vivo. O estado final
-- conserva apenas Partes correntes; Microssequências permanecem no Curso e
-- passam a estar sem Parte quando não houver outro vínculo.
create temporary table retired_authoring_part_courses(
  course_id uuid primary key
) on commit drop;
insert into retired_authoring_part_courses(course_id)
select distinct part.course_id
from private.course_authoring_parts part
where part.retired_at is not null;
alter table private.course_authoring_parts
  drop constraint course_authoring_parts_position_v1;
delete from private.course_authoring_parts part
where part.retired_at is not null;
with ranked as materialized(
  select part.id,row_number() over(
    partition by part.instructional_plan_id
    order by part.position,part.id
  )::integer-1 as position
  from private.course_authoring_parts part
  where exists(
    select 1 from retired_authoring_part_courses affected
    where affected.course_id=part.course_id
  )
)
update private.course_authoring_parts part
set position=ranked.position,version=part.version+1,updated_at=now()
from ranked where ranked.id=part.id;
update private.course_instructional_plans plan
set version=plan.version+1,updated_at=now()
where exists(
  select 1 from retired_authoring_part_courses affected
  where affected.course_id=plan.course_id
);
update public.courses course
set revision=course.revision+1,updated_at=now()
where exists(
  select 1 from retired_authoring_part_courses affected
  where affected.course_id=course.id
);
delete from private.course_change_receipts receipt
where exists(
  select 1 from retired_authoring_part_courses affected
  where affected.course_id=receipt.course_id
);
alter table private.course_authoring_parts
  drop column retired_at,
  add constraint course_authoring_parts_position_v2 check(
    position between 0 and 63
  );

-- Configuração corrente: uma atribuição por conceito e escopo. Limpar herança
-- passa a significar DELETE; não se persiste uma linha narrativa de "clear".
create table private.course_design_parameter_assignments(
  course_id uuid not null references public.courses(id) on delete cascade,
  parameter_id text not null references private.course_design_parameter_definitions(parameter_id),
  scope_kind text not null,
  scope_ref text not null,
  value jsonb not null,
  origin text not null,
  reason text not null,
  updated_at timestamptz not null default now(),
  primary key(course_id,parameter_id,scope_kind,scope_ref),
  constraint course_design_parameter_assignments_scope_v1 check(
    scope_kind in ('course','lesson','didactic_microsequence','study_unit')
      and nullif(btrim(scope_ref),'') is not null
      and scope_ref = btrim(scope_ref)
      and char_length(scope_ref) <= 240
      and scope_ref !~ '[[:cntrl:]]'
  ),
  constraint course_design_parameter_assignments_value_v1 check(
    octet_length(value::text) <= 4096
      and private.valid_course_design_parameter_value_v1(parameter_id,value)
  ),
  constraint course_design_parameter_assignments_origin_v1 check(
    origin in ('automatic','author','research_condition','migration')
  ),
  constraint course_design_parameter_assignments_reason_v1 check(
    nullif(btrim(reason),'') is not null
      and char_length(reason) <= 1000
      and translate(reason,E'\n\r\t','') !~ '[[:cntrl:]]'
  )
);
alter table private.course_design_parameter_assignments enable row level security;
alter table private.course_design_parameter_assignments force row level security;

with latest as materialized (
  select distinct on(
    change.course_id,change.parameter_id,change.scope_kind,change.scope_ref
  ) change.*
  from private.course_design_parameter_changes change
  order by change.course_id,change.parameter_id,change.scope_kind,change.scope_ref,
    change.course_revision desc,change.id desc
)
insert into private.course_design_parameter_assignments(
  course_id,parameter_id,scope_kind,scope_ref,value,origin,reason,updated_at
)
select course_id,parameter_id,scope_kind,scope_ref,value,origin,reason,created_at
from latest where action = 'set' and (
  scope_kind='course' and scope_ref=course_id::text
  or exists(
    select 1 from private.course_entities entity
    where entity.course_id=latest.course_id and entity.entity_id=latest.scope_ref
      and entity.entity_type=case latest.scope_kind
        when 'lesson' then 'lesson'
        when 'didactic_microsequence' then 'microsequence'
        when 'study_unit' then 'study_unit'
      end
  )
);

create table private.course_authoring_guidance_assignments(
  course_id uuid not null references public.courses(id) on delete cascade,
  scope_kind text not null,
  scope_ref text not null,
  guidance text not null,
  origin text not null,
  reason text not null,
  updated_at timestamptz not null default now(),
  primary key(course_id,scope_kind,scope_ref),
  constraint course_authoring_guidance_assignments_scope_v1 check(
    scope_kind in ('course','module','lesson','didactic_microsequence','study_unit')
      and nullif(btrim(scope_ref),'') is not null
      and scope_ref = btrim(scope_ref)
      and char_length(scope_ref) <= 240
      and scope_ref !~ '[[:cntrl:]]'
  ),
  constraint course_authoring_guidance_assignments_text_v1 check(
    nullif(btrim(guidance),'') is not null
      and octet_length(guidance) <= 16384
      and translate(guidance,E'\n\r\t','') !~ '[[:cntrl:]]'
  ),
  constraint course_authoring_guidance_assignments_origin_v1 check(
    origin in ('migration','automatic','author','research_condition')
  ),
  constraint course_authoring_guidance_assignments_reason_v1 check(
    nullif(btrim(reason),'') is not null
      and char_length(reason) <= 1000
      and translate(reason,E'\n\r\t','') !~ '[[:cntrl:]]'
  )
);
alter table private.course_authoring_guidance_assignments enable row level security;
alter table private.course_authoring_guidance_assignments force row level security;

with latest as materialized (
  select distinct on(change.course_id,change.scope_kind,change.scope_ref) change.*
  from private.course_authoring_guidance_revisions change
  order by change.course_id,change.scope_kind,change.scope_ref,
    change.course_revision desc,change.id desc
)
insert into private.course_authoring_guidance_assignments(
  course_id,scope_kind,scope_ref,guidance,origin,reason,updated_at
)
select course_id,scope_kind,scope_ref,guidance,origin,reason,created_at
from latest where action = 'set' and (
  scope_kind='course' and scope_ref=course_id::text
  or exists(
    select 1 from private.course_entities entity
    where entity.course_id=latest.course_id and entity.entity_id=latest.scope_ref
      and entity.entity_type=case latest.scope_kind
        when 'module' then 'module'
        when 'lesson' then 'lesson'
        when 'didactic_microsequence' then 'microsequence'
        when 'study_unit' then 'study_unit'
      end
  )
);

create table private.course_component_policy_assignments(
  course_id uuid not null references public.courses(id) on delete cascade,
  scope_kind text not null,
  scope_ref text not null,
  policy jsonb not null,
  origin text not null,
  reason text not null,
  updated_at timestamptz not null default now(),
  primary key(course_id,scope_kind,scope_ref),
  constraint course_component_policy_assignments_scope_v1 check(
    scope_kind in ('course','module','lesson','didactic_microsequence','study_unit')
      and nullif(btrim(scope_ref),'') is not null
      and scope_ref = btrim(scope_ref)
      and char_length(scope_ref) <= 240
      and scope_ref !~ '[[:cntrl:]]'
  ),
  constraint course_component_policy_assignments_policy_v1 check(
    jsonb_typeof(policy) = 'object'
      and octet_length(policy::text) <= 4096
      and private.valid_course_component_policy_v1(policy)
  ),
  constraint course_component_policy_assignments_origin_v1 check(
    origin in ('automatic','author','research_condition')
  ),
  constraint course_component_policy_assignments_reason_v1 check(
    nullif(btrim(reason),'') is not null
      and char_length(reason) <= 1000
      and translate(reason,E'\n\r\t','') !~ '[[:cntrl:]]'
  )
);
alter table private.course_component_policy_assignments enable row level security;
alter table private.course_component_policy_assignments force row level security;

with latest as materialized (
  select distinct on(change.course_id,change.scope_kind,change.scope_ref) change.*
  from private.course_component_policy_changes change
  order by change.course_id,change.scope_kind,change.scope_ref,
    change.course_revision desc,change.id desc
)
insert into private.course_component_policy_assignments(
  course_id,scope_kind,scope_ref,policy,origin,reason,updated_at
)
select course_id,scope_kind,scope_ref,policy,origin,reason,created_at
from latest where action = 'set' and (
  scope_kind='course' and scope_ref=course_id::text
  or exists(
    select 1 from private.course_entities entity
    where entity.course_id=latest.course_id and entity.entity_id=latest.scope_ref
      and entity.entity_type=case latest.scope_kind
        when 'module' then 'module'
        when 'lesson' then 'lesson'
        when 'didactic_microsequence' then 'microsequence'
        when 'study_unit' then 'study_unit'
      end
  )
);

create function private.delete_course_design_assignments_before_entity_v1()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,private
as $function$
declare
  v_scope_kind text:=case old.entity_type
    when 'microsequence' then 'didactic_microsequence'
    else old.entity_type
  end;
begin
  delete from private.course_design_parameter_assignments assignment
  where assignment.course_id=old.course_id
    and assignment.scope_kind=v_scope_kind
    and assignment.scope_ref=old.entity_id;
  delete from private.course_authoring_guidance_assignments assignment
  where assignment.course_id=old.course_id
    and assignment.scope_kind=v_scope_kind
    and assignment.scope_ref=old.entity_id;
  delete from private.course_component_policy_assignments assignment
  where assignment.course_id=old.course_id
    and assignment.scope_kind=v_scope_kind
    and assignment.scope_ref=old.entity_id;
  return old;
end;
$function$;

revoke all on function
  private.delete_course_design_assignments_before_entity_v1()
from public,anon,authenticated,service_role;
create trigger course_entities_delete_design_assignments_v1
before delete on private.course_entities
for each row execute function
  private.delete_course_design_assignments_before_entity_v1();

create function private.invalidate_course_source_attribution_after_target_v1()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,private
as $function$
declare
  v_target_kind text;
  v_target_id text;
begin
  if tg_table_name='course_entities' then
    if old.entity_type<>'study_unit'
       or tg_op='UPDATE' and row(new.version,new.content)
         is not distinct from row(old.version,old.content) then
      if tg_op='DELETE' then return old; else return new; end if;
    end if;
    v_target_kind:='study_unit';
    v_target_id:=old.entity_id;
  else
    if tg_op='UPDATE' and row(new.version,new.statement)
         is not distinct from row(old.version,old.statement) then
      if tg_op='DELETE' then return old; else return new; end if;
    end if;
    v_target_kind:='plan_item';
    v_target_id:=old.id::text;
  end if;
  delete from private.course_source_attributions attribution
  where attribution.course_id=old.course_id
    and attribution.target_kind=v_target_kind
    and attribution.target_id=v_target_id;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$function$;

revoke all on function
  private.invalidate_course_source_attribution_after_target_v1()
from public,anon,authenticated,service_role;
create trigger course_entities_invalidate_source_attribution_v1
after update of version,content or delete on private.course_entities
for each row execute function
  private.invalidate_course_source_attribution_after_target_v1();
create trigger course_plan_items_invalidate_source_attribution_v1
after update of version,statement or delete
on private.course_instructional_plan_items
for each row execute function
  private.invalidate_course_source_attribution_after_target_v1();

create or replace function private.course_design_scope_path_v1(
  p_course_id uuid,
  p_scope_kind text,
  p_scope_ref text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog,public,private
as $function$
declare
  v_course public.courses%rowtype;
  v_module private.course_entities%rowtype;
  v_lesson private.course_entities%rowtype;
  v_microsequence private.course_entities%rowtype;
  v_study_unit private.course_entities%rowtype;
  v_path jsonb;
begin
  if p_course_id is null or p_scope_kind not in(
       'course','module','lesson','didactic_microsequence','study_unit'
     )
     or nullif(btrim(p_scope_ref),'') is null
     or p_scope_ref<>btrim(p_scope_ref) or char_length(p_scope_ref)>240
     or p_scope_ref~'[[:cntrl:]]' then
    return null;
  end if;
  select * into v_course from public.courses course where course.id=p_course_id;
  if not found then return null; end if;
  v_path:=jsonb_build_array(jsonb_build_object(
    'kind','course','ref',p_course_id::text,'label',v_course.title
  ));
  if p_scope_kind='course' then
    return case when p_scope_ref=p_course_id::text then v_path else null end;
  end if;
  if p_scope_kind='study_unit' then
    select * into v_study_unit from private.course_entities entity
    where entity.course_id=p_course_id and entity.entity_type='study_unit'
      and entity.entity_id=p_scope_ref;
    if found then
      select * into v_microsequence from private.course_entities entity
      where entity.course_id=p_course_id and entity.entity_type='microsequence'
        and entity.entity_id=v_study_unit.parent_id;
    end if;
  elsif p_scope_kind='didactic_microsequence' then
    select * into v_microsequence from private.course_entities entity
    where entity.course_id=p_course_id and entity.entity_type='microsequence'
      and entity.entity_id=p_scope_ref;
  end if;
  if p_scope_kind in('didactic_microsequence','study_unit')
     and v_microsequence.course_id is not null then
    select * into v_lesson from private.course_entities entity
    where entity.course_id=p_course_id and entity.entity_type='lesson'
      and entity.entity_id=v_microsequence.parent_id;
  elsif p_scope_kind='lesson' then
    select * into v_lesson from private.course_entities entity
    where entity.course_id=p_course_id and entity.entity_type='lesson'
      and entity.entity_id=p_scope_ref;
  end if;
  if p_scope_kind in('lesson','didactic_microsequence','study_unit')
     and v_lesson.course_id is not null then
    select * into v_module from private.course_entities entity
    where entity.course_id=p_course_id and entity.entity_type='module'
      and entity.entity_id=v_lesson.parent_id;
  elsif p_scope_kind='module' then
    select * into v_module from private.course_entities entity
    where entity.course_id=p_course_id and entity.entity_type='module'
      and entity.entity_id=p_scope_ref;
  end if;
  if v_module.course_id is null
     or p_scope_kind in('lesson','didactic_microsequence','study_unit')
       and v_lesson.course_id is null
     or p_scope_kind in('didactic_microsequence','study_unit')
       and v_microsequence.course_id is null
     or p_scope_kind='study_unit' and v_study_unit.course_id is null then
    return null;
  end if;
  v_path:=v_path||jsonb_build_array(jsonb_build_object(
    'kind','module','ref',v_module.entity_id,'label',v_module.content->>'title'
  ));
  if v_lesson.course_id is not null then
    v_path:=v_path||jsonb_build_array(jsonb_build_object(
      'kind','lesson','ref',v_lesson.entity_id,'label',v_lesson.content->>'title'
    ));
  end if;
  if v_microsequence.course_id is not null then
    v_path:=v_path||jsonb_build_array(jsonb_build_object(
      'kind','didactic_microsequence','ref',v_microsequence.entity_id,
      'label',v_microsequence.content->>'title'
    ));
  end if;
  if v_study_unit.course_id is not null then
    v_path:=v_path||jsonb_build_array(jsonb_build_object(
      'kind','study_unit','ref',v_study_unit.entity_id,
      'label',v_study_unit.content->>'title'
    ));
  end if;
  return v_path;
end;
$function$;

revoke all on function private.course_design_scope_path_v1(uuid,text,text)
from public,anon,authenticated,service_role;

create or replace function private.course_design_scope_context_v1(
  p_course_id uuid,
  p_scope_kind text,
  p_scope_ref text,
  p_child_limit integer,
  p_child_cursor text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog,private
as $function$
declare
  v_path jsonb;
  v_parent_type text;
  v_parent_id text;
  v_child_type text;
  v_cursor_position integer;
  v_children jsonb;
  v_child_count integer;
  v_has_more boolean;
  v_next_cursor text;
begin
  v_path:=private.course_design_scope_path_v1(
    p_course_id,p_scope_kind,p_scope_ref
  );
  if v_path is null or p_child_limit not between 1 and 64
     or p_child_cursor is not null and(
       nullif(btrim(p_child_cursor),'') is null
       or p_child_cursor<>btrim(p_child_cursor)
       or char_length(p_child_cursor)>240 or p_child_cursor~'[[:cntrl:]]'
     ) then
    raise exception 'Navegação do escopo de desenho inválida.'
      using errcode='22023';
  end if;
  v_child_type:=case p_scope_kind
    when 'course' then 'module'
    when 'module' then 'lesson'
    when 'lesson' then 'microsequence'
    when 'didactic_microsequence' then 'study_unit'
    else null end;
  v_parent_type:=case p_scope_kind
    when 'course' then null
    when 'didactic_microsequence' then 'microsequence'
    else p_scope_kind end;
  v_parent_id:=case when p_scope_kind='course' then null else p_scope_ref end;
  if p_child_cursor is not null then
    select entity.position into v_cursor_position
    from private.course_entities entity
    where entity.course_id=p_course_id and entity.entity_type=v_child_type
      and entity.entity_id=p_child_cursor
      and entity.parent_type is not distinct from v_parent_type
      and entity.parent_id is not distinct from v_parent_id;
    if not found then
      raise exception 'Cursor de filho não pertence ao escopo.' using errcode='22023';
    end if;
  end if;
  select count(*)::integer into v_child_count
  from private.course_entities entity
  where v_child_type is not null and entity.course_id=p_course_id
    and entity.entity_type=v_child_type
    and entity.parent_type is not distinct from v_parent_type
    and entity.parent_id is not distinct from v_parent_id;
  with candidates as materialized(
    select entity.* from private.course_entities entity
    where v_child_type is not null and entity.course_id=p_course_id
      and entity.entity_type=v_child_type
      and entity.parent_type is not distinct from v_parent_type
      and entity.parent_id is not distinct from v_parent_id
      and (p_child_cursor is null or (entity.position,entity.entity_id)>
        (v_cursor_position,p_child_cursor))
    order by entity.position,entity.entity_id limit p_child_limit+1
  ), page as materialized(
    select * from candidates order by position,entity_id limit p_child_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'kind',case page.entity_type when 'microsequence'
        then 'didactic_microsequence' else page.entity_type end,
      'ref',page.entity_id,'label',page.content->>'title','position',page.position
    ) order by page.position,page.entity_id),'[]'::jsonb),
    exists(select 1 from candidates offset p_child_limit),
    (select entity_id from page order by position desc,entity_id desc limit 1)
  into v_children,v_has_more,v_next_cursor from page;
  return jsonb_build_object(
    'current',v_path->(jsonb_array_length(v_path)-1),
    'ancestors',v_path-(jsonb_array_length(v_path)-1),
    'children',v_children,'childCount',v_child_count,
    'hasMoreChildren',coalesce(v_has_more,false),
    'nextChildCursor',case when v_has_more then v_next_cursor else null end
  );
end;
$function$;

revoke all on function private.course_design_scope_context_v1(
  uuid,text,text,integer,text
) from public,anon,authenticated,service_role;

create function private.course_current_design_parameters_v1(
  p_course_id uuid,
  p_scope_path jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog,private
as $function$
  with path_scopes as materialized (
    select scope.value->>'kind' as scope_kind,
      scope.value->>'ref' as scope_ref,
      scope.ordinal::integer as depth
    from jsonb_array_elements(p_scope_path)
      with ordinality scope(value,ordinal)
  ), applicable as materialized (
    select assignment.*,scope.depth
    from private.course_design_parameter_assignments assignment
    join path_scopes scope
      on scope.scope_kind = assignment.scope_kind
     and scope.scope_ref = assignment.scope_ref
    where assignment.course_id = p_course_id
  ), target as materialized (
    select scope_kind,scope_ref
    from path_scopes order by depth desc limit 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'parameterId',definition.parameter_id,
    'localAssignment',case when local_assignment.parameter_id is null then null
      else jsonb_build_object(
        'value',local_assignment.value,
        'origin',local_assignment.origin,
        'reason',local_assignment.reason
      ) end,
    'effectiveAssignment',case when effective.parameter_id is null then
      jsonb_build_object(
        'value',definition.default_value,
        'origin','system_default',
        'reason','Valor padrão usado porque não há atribuição neste percurso.',
        'sourceScope',null,
        'inherited',false
      ) else jsonb_build_object(
        'value',effective.value,
        'origin',effective.origin,
        'reason',effective.reason,
        'sourceScope',jsonb_build_object(
          'kind',effective.scope_kind,'ref',effective.scope_ref
        ),
        'inherited',effective.scope_kind <> target.scope_kind
          or effective.scope_ref <> target.scope_ref
      ) end
  ) order by definition.ordinal),'[]'::jsonb)
  from private.course_design_parameter_definitions definition
  cross join target
  left join lateral (
    select assignment.*
    from applicable assignment
    where assignment.parameter_id = definition.parameter_id
    order by case assignment.origin
        when 'author' then 2
        when 'research_condition' then 2
        when 'migration' then 2
        else 1
      end desc,
      assignment.depth desc
    limit 1
  ) effective on true
  left join lateral (
    select assignment.*
    from applicable assignment
    where assignment.parameter_id = definition.parameter_id
      and assignment.scope_kind = target.scope_kind
      and assignment.scope_ref = target.scope_ref
    limit 1
  ) local_assignment on true
$function$;

create function private.course_current_authoring_guidance_v1(
  p_course_id uuid,
  p_scope_path jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog,private
as $function$
  with scopes as materialized (
    select scope.value->>'kind' as scope_kind,
      scope.value->>'ref' as scope_ref,
      scope.ordinal::integer as depth
    from jsonb_array_elements(p_scope_path)
      with ordinality scope(value,ordinal)
  ), applicable as materialized (
    select assignment.*,scope.depth
    from private.course_authoring_guidance_assignments assignment
    join scopes scope
      on scope.scope_kind = assignment.scope_kind
     and scope.scope_ref = assignment.scope_ref
    where assignment.course_id = p_course_id
  ), target as materialized (
    select scope_kind,scope_ref from scopes order by depth desc limit 1
  )
  select jsonb_build_object(
    'localAssignment',(
      select jsonb_build_object(
        'guidance',assignment.guidance,
        'origin',assignment.origin,
        'reason',assignment.reason
      )
      from applicable assignment,target
      where assignment.scope_kind = target.scope_kind
        and assignment.scope_ref = target.scope_ref
    ),
    'effectiveAssignments',coalesce((
      select jsonb_agg(jsonb_build_object(
        'guidance',assignment.guidance,
        'origin',assignment.origin,
        'reason',assignment.reason,
        'sourceScope',jsonb_build_object(
          'kind',assignment.scope_kind,'ref',assignment.scope_ref
        ),
        'inherited',assignment.scope_kind <> target.scope_kind
          or assignment.scope_ref <> target.scope_ref
      ) order by assignment.depth)
      from applicable assignment cross join target
    ),'[]'::jsonb)
  )
$function$;

create function private.course_current_component_policy_v1(
  p_course_id uuid,
  p_scope_path jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog,private
as $function$
  with scopes as materialized (
    select scope.value->>'kind' as scope_kind,
      scope.value->>'ref' as scope_ref,
      scope.ordinal::integer as depth
    from jsonb_array_elements(p_scope_path)
      with ordinality scope(value,ordinal)
  ), applicable as materialized (
    select assignment.*,scope.depth
    from private.course_component_policy_assignments assignment
    join scopes scope
      on scope.scope_kind = assignment.scope_kind
     and scope.scope_ref = assignment.scope_ref
    where assignment.course_id = p_course_id
  ), target as materialized (
    select scope_kind,scope_ref from scopes order by depth desc limit 1
  ), effective as materialized (
    select assignment.*
    from applicable assignment
    order by case assignment.origin
        when 'author' then 2
        when 'research_condition' then 2
        else 1
      end desc,
      assignment.depth desc
    limit 1
  )
  select jsonb_build_object(
    'localAssignment',(
      select jsonb_build_object(
        'policy',assignment.policy,
        'origin',assignment.origin,
        'reason',assignment.reason
      )
      from applicable assignment,target
      where assignment.scope_kind = target.scope_kind
        and assignment.scope_ref = target.scope_ref
    ),
    'effectiveAssignment',coalesce((
      select jsonb_build_object(
        'policy',assignment.policy,
        'origin',assignment.origin,
        'reason',assignment.reason,
        'sourceScope',jsonb_build_object(
          'kind',assignment.scope_kind,'ref',assignment.scope_ref
        ),
        'inherited',assignment.scope_kind <> target.scope_kind
          or assignment.scope_ref <> target.scope_ref
      )
      from effective assignment cross join target
    ),jsonb_build_object(
      'policy',jsonb_build_object(
        'catalogVersion',private.course_component_catalog_v1()->>'version',
        'availability','all',
        'allowedRefs','[]'::jsonb,
        'excludedRefs','[]'::jsonb,
        'preferredRefs','[]'::jsonb
      ),
      'origin','system_default',
      'reason','Todos os componentes permanecem disponíveis sem política local.',
      'sourceScope',null,
      'inherited',false
    ))
  )
$function$;

revoke all on function private.course_current_design_parameters_v1(
  uuid,jsonb
) from public,anon,authenticated,service_role;
revoke all on function private.course_current_authoring_guidance_v1(
  uuid,jsonb
) from public,anon,authenticated,service_role;
revoke all on function private.course_current_component_policy_v1(
  uuid,jsonb
) from public,anon,authenticated,service_role;

create function public.get_owned_course_design_for_actor_v2(
  p_actor_id uuid,
  p_course_id uuid,
  p_scope_kind text,
  p_scope_ref text,
  p_child_limit integer default 32,
  p_child_cursor text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog,public,private
as $function$
declare
  v_course public.courses%rowtype;
  v_path jsonb;
  v_target_microsequence_ref text;
  v_result jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  select * into strict v_course
  from public.courses course where course.id = p_course_id;
  v_path := private.course_design_scope_path_v1(
    p_course_id,p_scope_kind,p_scope_ref
  );
  if v_path is null then
    raise exception 'Escopo de desenho inexistente.' using errcode = 'PT404';
  end if;
  v_target_microsequence_ref:=case when p_scope_kind='didactic_microsequence'
    then p_scope_ref else null end;
  if p_scope_kind='study_unit' then
    select unit.parent_id into v_target_microsequence_ref
    from private.course_entities unit
    where unit.course_id=p_course_id and unit.entity_type='study_unit'
      and unit.entity_id=p_scope_ref;
  end if;
  v_result := jsonb_build_object(
    'contract','aralearn.course-design.v2',
    'courseId',p_course_id,
    'courseRevision',v_course.revision,
    'parameterCatalogVersion','1.0.0',
    'scopeContext',private.course_design_scope_context_v1(
      p_course_id,p_scope_kind,p_scope_ref,p_child_limit,p_child_cursor
    ),
    'targetPlanItems',case
      when p_scope_kind in('didactic_microsequence','study_unit')
        then jsonb_build_object(
        'instructionalAnalysisUnitIds',coalesce((
          select jsonb_agg(to_jsonb(item.id) order by item.position,item.id)
          from private.course_design_target_plan_items assignment
          join private.course_instructional_plan_items item
            on item.course_id = assignment.course_id
           and item.id = assignment.plan_item_id
           and item.item_kind = assignment.plan_item_kind
          where assignment.course_id = p_course_id
            and assignment.didactic_microsequence_id = v_target_microsequence_ref
            and assignment.plan_item_kind = 'instructional_analysis_unit'
        ),'[]'::jsonb),
        'evidenceRequirementIds',coalesce((
          select jsonb_agg(to_jsonb(item.id) order by item.position,item.id)
          from private.course_design_target_plan_items assignment
          join private.course_instructional_plan_items item
            on item.course_id = assignment.course_id
           and item.id = assignment.plan_item_id
           and item.item_kind = assignment.plan_item_kind
          where assignment.course_id = p_course_id
            and assignment.didactic_microsequence_id = v_target_microsequence_ref
            and assignment.plan_item_kind = 'evidence_requirement'
        ),'[]'::jsonb)
      ) else null end,
    'definitions',coalesce((
      select jsonb_agg(definition.definition order by definition.ordinal)
      from private.course_design_parameter_definitions definition
    ),'[]'::jsonb),
    'parameters',private.course_current_design_parameters_v1(p_course_id,v_path),
    'guidance',private.course_current_authoring_guidance_v1(p_course_id,v_path),
    'componentCatalog',private.course_component_catalog_v1(),
    'componentPolicy',private.course_current_component_policy_v1(p_course_id,v_path)
  );
  if octet_length(v_result::text) > 262144 then
    raise exception 'Leitura de desenho excede 256 KiB.' using errcode = '54000';
  end if;
  return v_result;
end;
$function$;



revoke all on function public.get_owned_course_design_for_actor_v2(
  uuid,uuid,text,text,integer,text
) from public,anon,authenticated,service_role;
grant execute on function public.get_owned_course_design_for_actor_v2(
  uuid,uuid,text,text,integer,text
) to service_role;

create function public.apply_course_design_command_for_actor_v2(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_course_revision bigint,
  p_command jsonb,
  p_request_id text,
  p_request_hash text,
  p_channel text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private
as $function$
declare
  v_receipt private.course_change_receipts%rowtype;
  v_course public.courses%rowtype;
  v_type text;
  v_scope_kind text;
  v_scope_ref text;
  v_changed boolean := false;
  v_result jsonb;
  v_affected_rows bigint;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_course_revision is null or p_expected_course_revision < 1
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
     or p_channel not in ('application','mcp','actions')
     or jsonb_typeof(p_command) is distinct from 'object'
     or octet_length(p_command::text) > 32768 then
    raise exception 'Comando de desenho inválido.' using errcode = '22023';
  end if;
  v_type := p_command->>'type';
  if v_type not in(
    'set_parameter','clear_parameter',
    'set_guidance','clear_guidance',
    'set_component_policy','clear_component_policy'
  ) or jsonb_typeof(p_command->'scope') is distinct from 'object'
     or not (p_command->'scope' ?& array['kind','ref'])
     or (p_command->'scope') - 'kind' - 'ref' <> '{}'::jsonb then
    raise exception 'Tipo ou escopo do desenho inválido.' using errcode = '22023';
  end if;
  v_scope_kind := p_command#>>'{scope,kind}';
  v_scope_ref := p_command#>>'{scope,ref}';
  if private.course_design_scope_path_v1(
    p_course_id,v_scope_kind,v_scope_ref
  ) is null then
    raise exception 'Escopo de desenho inexistente.' using errcode = 'PT404';
  end if;
  if v_type in('set_parameter','clear_parameter')
     and v_scope_kind not in('course','lesson','didactic_microsequence','study_unit') then
    raise exception 'Escopo de parâmetro inválido.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:' || p_actor_id::text || ':' || p_request_id,0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  select * into v_receipt from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'apply_course_design_command_v2'
       or v_receipt.course_id <> p_course_id
       or v_receipt.request_hash <> p_request_hash then
      raise exception 'requestId reutilizado com desenho incompatível.'
        using errcode = '23514';
    end if;
    return (v_receipt.result - 'idempotent')
      || jsonb_build_object('idempotent',true);
  end if;

  perform 1 from auth.users actor where actor.id=p_actor_id for key share;
  if not found then
    raise exception 'Pessoa inexistente ou inacessível.' using errcode='PT404';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'course-row:'||p_course_id::text,0
  ));
  select * into strict v_course
  from public.courses course where course.id = p_course_id for update;
  if v_course.revision <> p_expected_course_revision then
    raise exception 'O Curso mudou; releia antes de alterar o desenho.'
      using errcode = '40001';
  end if;

  if v_type in('set_parameter','clear_parameter') then
    if not (p_command ? 'parameterId')
       or p_command - 'type' - 'scope' - 'parameterId'
         - 'value' - 'origin' - 'reason' <> '{}'::jsonb
       or not exists(
         select 1 from private.course_design_parameter_definitions definition
         where definition.parameter_id = p_command->>'parameterId'
       ) then
      raise exception 'Parâmetro pedagógico inválido.' using errcode = '22023';
    end if;
    if v_type = 'set_parameter' then
      if not (p_command ?& array['value','origin','reason'])
         or not private.valid_course_design_parameter_value_v1(
           p_command->>'parameterId',p_command->'value'
         )
         or p_command->>'origin' not in('automatic','author','research_condition')
         or nullif(btrim(p_command->>'reason'),'') is null
         or char_length(p_command->>'reason') > 1000 then
        raise exception 'Atribuição de parâmetro inválida.' using errcode = '22023';
      end if;
      insert into private.course_design_parameter_assignments(
        course_id,parameter_id,scope_kind,scope_ref,value,origin,reason
      ) values(
        p_course_id,p_command->>'parameterId',v_scope_kind,v_scope_ref,
        p_command->'value',p_command->>'origin',p_command->>'reason'
      ) on conflict(course_id,parameter_id,scope_kind,scope_ref) do update set
        value=excluded.value,origin=excluded.origin,reason=excluded.reason,
        updated_at=now()
      where row(
        course_design_parameter_assignments.value,
        course_design_parameter_assignments.origin,
        course_design_parameter_assignments.reason
      ) is distinct from row(excluded.value,excluded.origin,excluded.reason);
      get diagnostics v_affected_rows = row_count;
      v_changed := v_affected_rows > 0;
    else
      if p_command - 'type' - 'scope' - 'parameterId' <> '{}'::jsonb then
        raise exception 'Limpeza de parâmetro inválida.' using errcode = '22023';
      end if;
      delete from private.course_design_parameter_assignments assignment
      where assignment.course_id = p_course_id
        and assignment.parameter_id = p_command->>'parameterId'
        and assignment.scope_kind = v_scope_kind
        and assignment.scope_ref = v_scope_ref;
      get diagnostics v_affected_rows = row_count;
      v_changed := v_affected_rows > 0;
    end if;
  elsif v_type in('set_guidance','clear_guidance') then
    if p_command - 'type' - 'scope' - 'guidance' - 'origin' - 'reason'
         <> '{}'::jsonb then
      raise exception 'Direção editorial inválida.' using errcode = '22023';
    end if;
    if v_type = 'set_guidance' then
      if not (p_command ?& array['guidance','origin','reason'])
         or nullif(btrim(p_command->>'guidance'),'') is null
         or octet_length(p_command->>'guidance') > 8192
         or p_command->>'origin' not in('automatic','author','research_condition')
         or nullif(btrim(p_command->>'reason'),'') is null
         or char_length(p_command->>'reason') > 1000 then
        raise exception 'Direção editorial inválida.' using errcode = '22023';
      end if;
      insert into private.course_authoring_guidance_assignments(
        course_id,scope_kind,scope_ref,guidance,origin,reason
      ) values(
        p_course_id,v_scope_kind,v_scope_ref,p_command->>'guidance',
        p_command->>'origin',p_command->>'reason'
      ) on conflict(course_id,scope_kind,scope_ref) do update set
        guidance=excluded.guidance,origin=excluded.origin,reason=excluded.reason,
        updated_at=now()
      where row(
        course_authoring_guidance_assignments.guidance,
        course_authoring_guidance_assignments.origin,
        course_authoring_guidance_assignments.reason
      ) is distinct from row(excluded.guidance,excluded.origin,excluded.reason);
      get diagnostics v_affected_rows = row_count;
      v_changed := v_affected_rows > 0;
    else
      if p_command - 'type' - 'scope' <> '{}'::jsonb then
        raise exception 'Limpeza da direção editorial inválida.' using errcode = '22023';
      end if;
      delete from private.course_authoring_guidance_assignments assignment
      where assignment.course_id = p_course_id
        and assignment.scope_kind = v_scope_kind
        and assignment.scope_ref = v_scope_ref;
      get diagnostics v_affected_rows = row_count;
      v_changed := v_affected_rows > 0;
    end if;
  else
    if p_command - 'type' - 'scope' - 'policy' - 'origin' - 'reason'
         <> '{}'::jsonb then
      raise exception 'Política de componentes inválida.' using errcode = '22023';
    end if;
    if v_type = 'set_component_policy' then
      if not (p_command ?& array['policy','origin','reason'])
         or not private.valid_course_component_policy_v1(p_command->'policy')
         or p_command->>'origin' not in('automatic','author','research_condition')
         or nullif(btrim(p_command->>'reason'),'') is null
         or char_length(p_command->>'reason') > 1000 then
        raise exception 'Política de componentes inválida.' using errcode = '22023';
      end if;
      insert into private.course_component_policy_assignments(
        course_id,scope_kind,scope_ref,policy,origin,reason
      ) values(
        p_course_id,v_scope_kind,v_scope_ref,p_command->'policy',
        p_command->>'origin',p_command->>'reason'
      ) on conflict(course_id,scope_kind,scope_ref) do update set
        policy=excluded.policy,origin=excluded.origin,reason=excluded.reason,
        updated_at=now()
      where row(
        course_component_policy_assignments.policy,
        course_component_policy_assignments.origin,
        course_component_policy_assignments.reason
      ) is distinct from row(excluded.policy,excluded.origin,excluded.reason);
      get diagnostics v_affected_rows = row_count;
      v_changed := v_affected_rows > 0;
    else
      if p_command - 'type' - 'scope' <> '{}'::jsonb then
        raise exception 'Limpeza da política de componentes inválida.' using errcode = '22023';
      end if;
      delete from private.course_component_policy_assignments assignment
      where assignment.course_id = p_course_id
        and assignment.scope_kind = v_scope_kind
        and assignment.scope_ref = v_scope_ref;
      get diagnostics v_affected_rows = row_count;
      v_changed := v_affected_rows > 0;
    end if;
  end if;

  if v_changed then
    update public.courses course
    set revision = course.revision + 1,updated_at = now()
    where course.id = p_course_id returning * into v_course;
  end if;
  v_result := jsonb_build_object(
    'contract','aralearn.course-design-change.v2',
    'courseId',p_course_id,
    'courseRevision',v_course.revision,
    'requestId',p_request_id,
    'idempotent',false,
    'changed',v_changed,
    'change',case when v_changed then jsonb_build_object(
      'type',v_type,
      'scope',jsonb_build_object('kind',v_scope_kind,'ref',v_scope_ref),
      'parameterId',case when v_type in('set_parameter','clear_parameter')
        then p_command->>'parameterId' else null end
    ) else null end
  );
  insert into private.course_change_receipts(
    actor_id,request_id,operation,course_id,request_hash,result
  ) values(
    p_actor_id,p_request_id,'apply_course_design_command_v2',
    p_course_id,p_request_hash,v_result
  );
  return v_result;
end;
$function$;

revoke all on function public.apply_course_design_command_for_actor_v2(
  uuid,uuid,bigint,jsonb,text,text,text
) from public,anon,authenticated,service_role;
grant execute on function public.apply_course_design_command_for_actor_v2(
  uuid,uuid,bigint,jsonb,text,text,text
) to service_role;

create function private.assert_course_materialization_pedagogy_v1(
  p_course_id uuid,
  p_units jsonb
)
returns void
language plpgsql
stable
set search_path = pg_catalog,private
as $function$
begin
  if exists(
    select 1
    from jsonb_array_elements(p_units) unit(value)
    cross join lateral jsonb_array_elements(
      unit.value#>'{designApplication,explanationApplications}'
    ) explanation(value)
    where jsonb_typeof(explanation.value)<>'object'
      or not (explanation.value ?& array[
        'instructionalAnalysisUnitId','developedForms','notApplicable'
      ])
      or explanation.value-'instructionalAnalysisUnitId'-'developedForms'
        -'notApplicable'<>'{}'::jsonb
      or jsonb_typeof(explanation.value->'developedForms')<>'array'
      or jsonb_typeof(explanation.value->'notApplicable')<>'array'
      or exists(
        select 1 from jsonb_array_elements_text(
          explanation.value->'developedForms'
        ) form(value)
        where form.value not in(
          'plain_definition','concrete_example','mechanism','contrast',
          'application_condition','limit_or_exception','worked_example',
          'representation_link'
        )
      )
      or exists(
        select 1 from jsonb_array_elements(
          explanation.value->'notApplicable'
        ) excluded(value)
        where jsonb_typeof(excluded.value)<>'object'
          or not (excluded.value ?& array['form','reason'])
          or excluded.value-'form'-'reason'<>'{}'::jsonb
          or excluded.value->>'form' not in(
            'plain_definition','concrete_example','mechanism','contrast',
            'application_condition','limit_or_exception','worked_example',
            'representation_link'
          )
          or nullif(btrim(excluded.value->>'reason'),'') is null
          or char_length(excluded.value->>'reason')>240
      )
      or exists(
        select 1
        from jsonb_array_elements_text(
          explanation.value->'developedForms'
        ) developed(value)
        join jsonb_array_elements(
          explanation.value->'notApplicable'
        ) excluded(value) on excluded.value->>'form'=developed.value
      )
  ) or exists(
    select 1
    from jsonb_array_elements(p_units) unit(value)
    cross join lateral jsonb_array_elements(
      unit.value#>'{designApplication,practiceApplications}'
    ) practice(value)
    where jsonb_typeof(practice.value)<>'object'
      or not (practice.value ?& array[
        'evidenceRequirementId','opportunityId',
        'invariantTaskOperation','variedDimensions'
      ])
      or practice.value-'evidenceRequirementId'-'opportunityId'
        -'invariantTaskOperation'-'variedDimensions'<>'{}'::jsonb
      or nullif(btrim(practice.value->>'opportunityId'),'') is null
      or char_length(practice.value->>'opportunityId')>240
      or nullif(btrim(practice.value->>'invariantTaskOperation'),'') is null
      or char_length(practice.value->>'invariantTaskOperation')>2000
      or jsonb_typeof(practice.value->'variedDimensions')<>'array'
      or exists(
        select 1 from jsonb_array_elements_text(
          practice.value->'variedDimensions'
        ) dimension(value)
        where dimension.value not in(
          'case_or_data','context','task_feature',
          'external_representation','support_level'
        )
      )
  ) then
    raise exception 'A aplicação pedagógica possui forma inválida.'
      using errcode='22023';
  end if;

  if exists(
    select 1 from jsonb_array_elements(p_units) unit(value)
    where unit.value#>>'{designApplication,mode}'='practice'
      and (jsonb_array_length(
        unit.value#>'{designApplication,introducedInstructionalAnalysisUnitIds}'
      )>0 or jsonb_array_length(
        unit.value#>'{designApplication,explanationApplications}'
      )>0)
      or unit.value#>>'{designApplication,mode}'='expository'
        and jsonb_array_length(
          unit.value#>'{designApplication,practiceApplications}'
        )>0
      or unit.value#>>'{designApplication,mode}'='mixed'
        and (jsonb_array_length(
          unit.value#>'{designApplication,explanationApplications}'
        )=0 or jsonb_array_length(
          unit.value#>'{designApplication,practiceApplications}'
        )=0)
  ) or exists(
    select 1 from jsonb_array_elements(p_units) unit(value)
    cross join lateral(
      select (parameter.value->>'value')::integer as ceiling
      from jsonb_array_elements(
        unit.value#>'{designSnapshot,parameters}'
      ) parameter(value)
      where parameter.value->>'parameterId'
        ='new_analysis_unit_ceiling_per_expository_study_unit'
    ) parameter
    where jsonb_array_length(
      unit.value#>'{designApplication,introducedInstructionalAnalysisUnitIds}'
    )>parameter.ceiling
  ) then
    raise exception 'Modo, snapshot ou teto de novidade foi violado.'
      using errcode='23514';
  end if;

  if exists(
    with units as materialized(
      select unit.value,unit.value->>'didacticMicrosequenceId' as microsequence_id
      from jsonb_array_elements(p_units) unit(value)
    ), targets as materialized(
      select distinct unit.microsequence_id,analysis_id.value as analysis_id
      from units unit
      cross join lateral jsonb_array_elements_text(
        unit.value#>'{designSnapshot,instructionalAnalysisUnitIds}'
      ) analysis_id(value)
    ), introductions as materialized(
      select unit.microsequence_id,introduction.value as analysis_id,
        unit.value->>'studyUnitId' as study_unit_id,
        (unit.value->>'position')::integer as unit_position
      from units unit
      cross join lateral jsonb_array_elements_text(
        unit.value#>'{designApplication,introducedInstructionalAnalysisUnitIds}'
      ) introduction(value)
    )
    select 1 from targets target
    left join introductions introduction
      on introduction.microsequence_id=target.microsequence_id
     and introduction.analysis_id=target.analysis_id
    group by target.microsequence_id,target.analysis_id
    having count(introduction.analysis_id)<>1
  ) or exists(
    with units as materialized(
      select unit.value,unit.value->>'didacticMicrosequenceId' as microsequence_id
      from jsonb_array_elements(p_units) unit(value)
    ), introductions as materialized(
      select unit.microsequence_id,unit.value->>'studyUnitId' as study_unit_id,
        introduction.value as analysis_id
      from units unit cross join lateral jsonb_array_elements_text(
        unit.value#>'{designApplication,introducedInstructionalAnalysisUnitIds}'
      ) introduction(value)
    )
    select 1 from introductions introduction
    where not exists(
      select 1 from units unit
      cross join lateral jsonb_array_elements(
        unit.value#>'{designApplication,explanationApplications}'
      ) explanation(value)
      where unit.value->>'studyUnitId'=introduction.study_unit_id
        and explanation.value->>'instructionalAnalysisUnitId'
          =introduction.analysis_id
    )
  ) or exists(
    with units as materialized(
      select unit.value,unit.value->>'didacticMicrosequenceId' as microsequence_id,
        (unit.value->>'position')::integer as unit_position
      from jsonb_array_elements(p_units) unit(value)
    ), introductions as materialized(
      select unit.microsequence_id,introduction.value as analysis_id,
        min(unit.unit_position) as introduction_position
      from units unit cross join lateral jsonb_array_elements_text(
        unit.value#>'{designApplication,introducedInstructionalAnalysisUnitIds}'
      ) introduction(value)
      group by unit.microsequence_id,introduction.value
    ), explanations as materialized(
      select unit.microsequence_id,unit.unit_position,
        explanation.value->>'instructionalAnalysisUnitId' as analysis_id
      from units unit cross join lateral jsonb_array_elements(
        unit.value#>'{designApplication,explanationApplications}'
      ) explanation(value)
    )
    select 1 from explanations explanation
    left join introductions introduction
      on introduction.microsequence_id=explanation.microsequence_id
     and introduction.analysis_id=explanation.analysis_id
    where introduction.analysis_id is null
      or explanation.unit_position<introduction.introduction_position
  ) then
    raise exception 'AnalysisUnit precisa ser introduzida uma vez e antes do desenvolvimento.'
      using errcode='23514';
  end if;

  if exists(
    with explanations as materialized(
      select unit.value->>'didacticMicrosequenceId' as microsequence_id,
        unit.value->>'studyUnitId' as study_unit_id,
        explanation.value->>'instructionalAnalysisUnitId' as analysis_id,
        explanation.value
      from jsonb_array_elements(p_units) unit(value)
      cross join lateral jsonb_array_elements(
        unit.value#>'{designApplication,explanationApplications}'
      ) explanation(value)
    )
    select 1 from explanations
    group by microsequence_id,study_unit_id,analysis_id
    having count(*)>1
  ) or exists(
    with explanations as materialized(
      select unit.value->>'didacticMicrosequenceId' as microsequence_id,
        explanation.value->>'instructionalAnalysisUnitId' as analysis_id,
        explanation.value
      from jsonb_array_elements(p_units) unit(value)
      cross join lateral jsonb_array_elements(
        unit.value#>'{designApplication,explanationApplications}'
      ) explanation(value)
    ), developed as materialized(
      select explanation.microsequence_id,explanation.analysis_id,form.value as form
      from explanations explanation cross join lateral jsonb_array_elements_text(
        explanation.value->'developedForms'
      ) form(value)
    ), excluded as materialized(
      select explanation.microsequence_id,explanation.analysis_id,
        form.value->>'form' as form
      from explanations explanation cross join lateral jsonb_array_elements(
        explanation.value->'notApplicable'
      ) form(value)
    )
    select 1 from developed join excluded using(microsequence_id,analysis_id,form)
  ) then
    raise exception 'A contribuição explicativa é repetida ou contraditória.'
      using errcode='23514';
  end if;

  if exists(
    with units as materialized(
      select unit.value,unit.value->>'didacticMicrosequenceId' as microsequence_id
      from jsonb_array_elements(p_units) unit(value)
    ), explanation_units as materialized(
      select unit.microsequence_id,
        explanation.value->>'instructionalAnalysisUnitId' as analysis_id,
        unit.value->'designSnapshot' as snapshot
      from units unit
      cross join lateral jsonb_array_elements(
        unit.value#>'{designApplication,explanationApplications}'
      ) explanation(value)
    ), required as materialized(
      select distinct explanation.microsequence_id,explanation.analysis_id,
        form.value as form
      from explanation_units explanation
      cross join lateral jsonb_array_elements(
        explanation.snapshot->'parameters'
      ) parameter(value)
      cross join lateral jsonb_array_elements_text(parameter.value->'value') form(value)
      where parameter.value->>'parameterId'='required_explanation_forms'
    )
    select 1 from required requirement
    where not exists(
      select 1 from units unit
      cross join lateral jsonb_array_elements(
        unit.value#>'{designApplication,explanationApplications}'
      ) explanation(value)
      where unit.microsequence_id=requirement.microsequence_id
        and explanation.value->>'instructionalAnalysisUnitId'=requirement.analysis_id
        and (explanation.value->'developedForms' ? requirement.form
          or exists(select 1 from jsonb_array_elements(
            explanation.value->'notApplicable'
          ) excluded(value) where excluded.value->>'form'=requirement.form))
    )
  ) then
    raise exception 'As formas requeridas não foram desenvolvidas nem justificadas.'
      using errcode='23514';
  end if;

  if exists(
    with units as materialized(
      select unit.value,unit.value->>'didacticMicrosequenceId' as microsequence_id
      from jsonb_array_elements(p_units) unit(value)
    ), requirements as materialized(
      select distinct unit.microsequence_id,evidence.value as evidence_id
      from units unit
      cross join lateral jsonb_array_elements_text(
        unit.value#>'{designSnapshot,evidenceRequirementIds}'
      ) evidence(value)
    ), practices as materialized(
      select unit.microsequence_id,
        practice.value->>'evidenceRequirementId' as evidence_id,
        practice.value->>'opportunityId' as opportunity_id,
        practice.value->>'invariantTaskOperation' as operation,
        practice.value->'variedDimensions' as dimensions,
        (minimum.value->>'value')::integer as minimum_count
      from units unit cross join lateral jsonb_array_elements(
        unit.value#>'{designApplication,practiceApplications}'
      ) practice(value)
      cross join lateral jsonb_array_elements(
        unit.value#>'{designSnapshot,parameters}'
      ) minimum(value)
      where minimum.value->>'parameterId'
        ='minimum_distinct_practice_opportunities_per_evidence_requirement'
    )
    select 1 from requirements requirement
    left join practices practice
      on practice.microsequence_id=requirement.microsequence_id
     and practice.evidence_id=requirement.evidence_id
    group by requirement.microsequence_id,requirement.evidence_id
    having count(distinct practice.opportunity_id)=0
      or count(distinct practice.opportunity_id)<max(practice.minimum_count)
  ) or exists(
    select 1
    from jsonb_array_elements(p_units) unit(value)
    cross join lateral jsonb_array_elements(
      unit.value#>'{designApplication,practiceApplications}'
    ) practice(value)
    group by unit.value->>'didacticMicrosequenceId',
      practice.value->>'evidenceRequirementId',practice.value->>'opportunityId'
    having count(*)>1
  ) or exists(
    with units as materialized(
      select unit.value,unit.value->>'didacticMicrosequenceId' as microsequence_id
      from jsonb_array_elements(p_units) unit(value)
    )
    select 1 from units unit
    cross join lateral jsonb_array_elements(
      unit.value#>'{designApplication,practiceApplications}'
    ) practice(value)
    join private.course_instructional_plan_items requirement
      on requirement.course_id=p_course_id
     and requirement.item_kind='evidence_requirement'
     and requirement.id::text=practice.value->>'evidenceRequirementId'
    where practice.value->>'invariantTaskOperation'<>requirement.statement
  ) or exists(
    with units as materialized(
      select unit.value,unit.value->>'didacticMicrosequenceId' as microsequence_id
      from jsonb_array_elements(p_units) unit(value)
    ), practices as materialized(
      select unit.microsequence_id,
        practice.value->>'evidenceRequirementId' as evidence_id,
        practice.value->'variedDimensions' as dimensions,
        unit.value->'designSnapshot' as snapshot
      from units unit
      cross join lateral jsonb_array_elements(
        unit.value#>'{designApplication,practiceApplications}'
      ) practice(value)
    ), required as materialized(
      select distinct practice.microsequence_id,practice.evidence_id,
        dimension.value as dimension
      from practices practice
      cross join lateral jsonb_array_elements(
        practice.snapshot->'parameters'
      ) parameter(value)
      cross join lateral jsonb_array_elements_text(parameter.value->'value') dimension(value)
      where parameter.value->>'parameterId'='required_practice_variation_dimensions'
    )
    select 1 from required requirement
    where not exists(
      select 1 from practices practice
      where practice.microsequence_id=requirement.microsequence_id
        and practice.evidence_id=requirement.evidence_id
        and practice.dimensions ? requirement.dimension
    )
  ) then
    raise exception 'Prática mínima, operação invariável ou variação requerida foi violada.'
      using errcode='23514';
  end if;

  if exists(
    select 1 from jsonb_array_elements(p_units) unit(value)
    cross join lateral jsonb_array_elements_text(
      unit.value#>'{designApplication,componentRefs}'
    ) component(value)
    where not private.course_component_policy_allows_v1(
      unit.value#>'{designSnapshot,componentPolicy,policy}',component.value
    )
  ) then
    raise exception 'Um componente viola a política pedagógica efetiva.'
      using errcode='23514';
  end if;
end;
$function$;

revoke all on function private.assert_course_materialization_pedagogy_v1(
  uuid,jsonb
) from public,anon,authenticated,service_role;

create function public.materialize_course_authoring_part_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_authoring_part_id uuid,
  p_expected_course_revision bigint,
  p_expected_authoring_part_version bigint,
  p_units jsonb,
  p_request_id text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private
as $function$
declare
  v_receipt private.course_change_receipts%rowtype;
  v_course public.courses%rowtype;
  v_part private.course_authoring_parts%rowtype;
  v_unit record;
  v_snapshot jsonb;
  v_application jsonb;
  v_expected_parameters jsonb;
  v_expected_directions jsonb;
  v_expected_policy jsonb;
  v_expected_analysis_ids jsonb;
  v_expected_evidence_ids jsonb;
  v_design_scope_kind text;
  v_design_scope_ref text;
  v_design_path jsonb;
  v_upserts jsonb := '[]'::jsonb;
  v_current_units jsonb := '[]'::jsonb;
  v_source_applications jsonb := '[]'::jsonb;
  v_existing_study_unit_ids text[] := array[]::text[];
  v_existing_unit private.course_entities%rowtype;
  v_composition jsonb;
  v_result jsonb;
  v_design_changes bigint := 0;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_actor_id is null or p_course_id is null or p_authoring_part_id is null
     or p_expected_course_revision is null or p_expected_course_revision < 1
     or p_expected_authoring_part_version is null
     or p_expected_authoring_part_version < 1
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_units) is distinct from 'array'
     or jsonb_array_length(p_units) not between 1 and 64
     or octet_length(p_units::text) > 1572864 then
    raise exception 'Materialização da Parte inválida.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:' || p_actor_id::text || ':' || p_request_id,0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  select * into v_receipt from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'materialize_course_authoring_part_v1'
       or v_receipt.course_id <> p_course_id
       or v_receipt.request_hash <> p_request_hash then
      raise exception 'requestId reutilizado com materialização incompatível.'
        using errcode = '23514';
    end if;
    return (v_receipt.result - 'idempotent')
      || jsonb_build_object('idempotent',true);
  end if;

  perform 1 from auth.users actor where actor.id=p_actor_id for key share;
  if not found then
    raise exception 'Pessoa inexistente ou inacessível.' using errcode='PT404';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'course-row:'||p_course_id::text,0
  ));
  select * into strict v_course
  from public.courses course where course.id = p_course_id for update;
  if v_course.revision <> p_expected_course_revision then
    raise exception 'O Curso mudou; releia antes de materializar a Parte.'
      using errcode = '40001';
  end if;
  select * into v_part
  from private.course_authoring_parts part
  where part.course_id = p_course_id
    and part.id = p_authoring_part_id
  for update;
  if not found then
    raise exception 'Parte inexistente.' using errcode = 'PT404';
  end if;
  if v_part.version <> p_expected_authoring_part_version then
    raise exception 'A Parte mudou; releia antes de materializá-la.'
      using errcode = '40001';
  end if;
  if (
    select count(*) <> count(distinct unit.value->>'studyUnitId')
      or count(*) <> count(distinct concat_ws(
        chr(31),unit.value->>'didacticMicrosequenceId',unit.value->>'position'
      ))
    from jsonb_array_elements(p_units) unit(value)
  ) then
    raise exception 'A materialização repete Unidade ou posição.'
      using errcode = '22023';
  end if;
  if exists(
    select 1
    from private.course_authoring_part_didactic_microsequences membership
    where membership.course_id=p_course_id
      and membership.authoring_part_id=p_authoring_part_id
      and not exists(
        select 1 from jsonb_array_elements(p_units) unit(value)
        where unit.value->>'didacticMicrosequenceId'
          =membership.didactic_microsequence_id
      )
  ) then
    raise exception 'A materialização precisa cobrir toda Microssequência da Parte.'
      using errcode='23514';
  end if;

  for v_unit in
    select unit.value,unit.ordinal
    from jsonb_array_elements(p_units) with ordinality unit(value,ordinal)
    order by unit.ordinal
  loop
    if jsonb_typeof(v_unit.value) is distinct from 'object'
       or not (v_unit.value ?& array[
         'studyUnitId','position','didacticMicrosequenceId','content',
         'designSnapshot','designApplication','sourceLinks'
       ])
       or v_unit.value - 'studyUnitId' - 'position'
         - 'didacticMicrosequenceId' - 'content' - 'designSnapshot'
         - 'designApplication' - 'sourceLinks' <> '{}'::jsonb
       or jsonb_typeof(v_unit.value->'studyUnitId')<>'string'
       or nullif(btrim(v_unit.value->>'studyUnitId'),'') is null
       or v_unit.value->>'studyUnitId'<>btrim(v_unit.value->>'studyUnitId')
       or char_length(v_unit.value->>'studyUnitId')>240
       or octet_length(v_unit.value->>'studyUnitId')>960
       or v_unit.value->>'studyUnitId'~'[[:cntrl:]]'
       or jsonb_typeof(v_unit.value->'position') <> 'number'
       or (v_unit.value->>'position') !~ '^[1-9][0-9]*$'
       or (v_unit.value->>'position')::bigint > 2147483647
       or nullif(btrim(v_unit.value->>'didacticMicrosequenceId'),'') is null
       or v_unit.value->>'didacticMicrosequenceId'
         <>btrim(v_unit.value->>'didacticMicrosequenceId')
       or char_length(v_unit.value->>'didacticMicrosequenceId') > 240
       or octet_length(v_unit.value->>'didacticMicrosequenceId')>960
       or v_unit.value->>'didacticMicrosequenceId'~'[[:cntrl:]]'
       or jsonb_typeof(v_unit.value->'content') is distinct from 'object'
       or v_unit.value->'content' ? 'id'
       or v_unit.value->'content' ? 'position'
       or v_unit.value->'content' ? 'sources'
       or jsonb_typeof(v_unit.value->'designSnapshot') is distinct from 'object'
       or jsonb_typeof(v_unit.value->'designApplication') is distinct from 'object'
       or not private.valid_course_source_links_shape_v2(
         v_unit.value->'sourceLinks'
       ) then
      raise exception 'Unidade materializada inválida.' using errcode = '22023';
    end if;
    if not exists(
      select 1
      from private.course_authoring_part_didactic_microsequences membership
      join private.course_entities microsequence
        on microsequence.course_id = membership.course_id
       and microsequence.entity_type = 'microsequence'
       and microsequence.entity_id = membership.didactic_microsequence_id
      where membership.course_id = p_course_id
        and membership.authoring_part_id = p_authoring_part_id
        and membership.didactic_microsequence_id
          = v_unit.value->>'didacticMicrosequenceId'
    ) then
      raise exception 'A Unidade aponta para Microssequência fora da Parte.'
        using errcode = '22023';
    end if;
    if exists(
      select 1 from private.course_entities entity
      where entity.course_id=p_course_id and entity.entity_type='study_unit'
        and entity.entity_id=v_unit.value->>'studyUnitId'
        and row(entity.parent_type,entity.parent_id,entity.position)
          is distinct from row(
            'microsequence'::text,
            v_unit.value->>'didacticMicrosequenceId',
            (v_unit.value->>'position')::integer
          )
    ) then
      raise exception 'A identidade da Unidade já pertence a outra posição.'
        using errcode='23514';
    end if;
    select * into v_existing_unit
    from private.course_entities entity
    where entity.course_id=p_course_id and entity.entity_type='study_unit'
      and entity.parent_type='microsequence'
      and entity.parent_id=v_unit.value->>'didacticMicrosequenceId'
      and entity.position=(v_unit.value->>'position')::integer
    for update;
    if found then
      if v_existing_unit.entity_id<>v_unit.value->>'studyUnitId' then
        raise exception 'A posição já possui outra Unidade; releia antes de substituir.'
          using errcode='40001';
      end if;
      v_design_scope_kind:='study_unit';
      v_design_scope_ref:=v_existing_unit.entity_id;
    else
      v_design_scope_kind:='didactic_microsequence';
      v_design_scope_ref:=v_unit.value->>'didacticMicrosequenceId';
    end if;
    v_design_path:=private.course_design_scope_path_v1(
      p_course_id,v_design_scope_kind,v_design_scope_ref
    );
    if v_design_path is null then
      raise exception 'O escopo focal da Unidade deixou de existir.'
        using errcode='40001';
    end if;

    v_snapshot := v_unit.value->'designSnapshot';
    v_application := v_unit.value->'designApplication';
    if v_snapshot - 'contract' - 'didacticMicrosequenceId'
         - 'instructionalAnalysisUnitIds' - 'evidenceRequirementIds'
         - 'parameters' - 'editorialDirections' - 'componentPolicy' <> '{}'::jsonb
       or not (v_snapshot ?& array[
         'contract','didacticMicrosequenceId','instructionalAnalysisUnitIds',
         'evidenceRequirementIds','parameters','editorialDirections',
         'componentPolicy'
       ])
       or v_snapshot->>'contract'
         <> 'aralearn.study-unit-design-snapshot.v1'
       or v_snapshot->>'didacticMicrosequenceId'
         <> v_unit.value->>'didacticMicrosequenceId'
       or jsonb_typeof(v_snapshot->'instructionalAnalysisUnitIds') <> 'array'
       or jsonb_typeof(v_snapshot->'evidenceRequirementIds') <> 'array'
       or jsonb_typeof(v_snapshot->'parameters') <> 'array'
       or jsonb_array_length(v_snapshot->'parameters') <> 4
       or jsonb_typeof(v_snapshot->'editorialDirections') <> 'array'
       or jsonb_typeof(v_snapshot->'componentPolicy') <> 'object'
       or octet_length(v_snapshot::text) > 65536
       or v_application - 'mode'
         - 'introducedInstructionalAnalysisUnitIds'
         - 'explanationApplications' - 'practiceApplications'
         - 'componentRefs' <> '{}'::jsonb
       or not (v_application ?& array[
         'mode','introducedInstructionalAnalysisUnitIds',
         'explanationApplications','practiceApplications','componentRefs'
       ])
       or v_application->>'mode' not in('expository','practice','mixed')
       or jsonb_typeof(v_application->'introducedInstructionalAnalysisUnitIds') <> 'array'
       or jsonb_typeof(v_application->'explanationApplications') <> 'array'
       or jsonb_typeof(v_application->'practiceApplications') <> 'array'
       or jsonb_typeof(v_application->'componentRefs') <> 'array'
       or octet_length(v_application::text) > 65536 then
      raise exception 'Aplicação pedagógica focal inválida.' using errcode = '22023';
    end if;

    select coalesce(jsonb_agg(to_jsonb(assignment.plan_item_id)
      order by item.position,item.id),'[]'::jsonb)
      into v_expected_analysis_ids
    from private.course_design_target_plan_items assignment
    join private.course_instructional_plan_items item
      on item.course_id = assignment.course_id
     and item.id = assignment.plan_item_id
     and item.item_kind = assignment.plan_item_kind
    where assignment.course_id = p_course_id
      and assignment.didactic_microsequence_id
        = v_unit.value->>'didacticMicrosequenceId'
      and assignment.plan_item_kind = 'instructional_analysis_unit';
    select coalesce(jsonb_agg(to_jsonb(assignment.plan_item_id)
      order by item.position,item.id),'[]'::jsonb)
      into v_expected_evidence_ids
    from private.course_design_target_plan_items assignment
    join private.course_instructional_plan_items item
      on item.course_id = assignment.course_id
     and item.id = assignment.plan_item_id
     and item.item_kind = assignment.plan_item_kind
    where assignment.course_id = p_course_id
      and assignment.didactic_microsequence_id
        = v_unit.value->>'didacticMicrosequenceId'
      and assignment.plan_item_kind = 'evidence_requirement';
    if v_snapshot->'instructionalAnalysisUnitIds' <> v_expected_analysis_ids
       or v_snapshot->'evidenceRequirementIds' <> v_expected_evidence_ids then
      raise exception 'O recorte pedagógico divergiu do plano corrente.'
        using errcode = '40001';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'parameterId',parameter.value->>'parameterId',
      'value',parameter.value#>'{effectiveAssignment,value}',
      'origin',parameter.value#>>'{effectiveAssignment,origin}',
      'sourceScopeKind',parameter.value#>>'{effectiveAssignment,sourceScope,kind}'
    ) order by parameter.ordinal),'[]'::jsonb)
      into v_expected_parameters
    from jsonb_array_elements(private.course_current_design_parameters_v1(
      p_course_id,v_design_path
    )) with ordinality parameter(value,ordinal);
    select coalesce(jsonb_agg(jsonb_build_object(
      'direction',direction.value->>'guidance',
      'origin',direction.value->>'origin',
      'sourceScopeKind',direction.value#>>'{sourceScope,kind}'
    ) order by direction.ordinal),'[]'::jsonb)
      into v_expected_directions
    from jsonb_array_elements(private.course_current_authoring_guidance_v1(
      p_course_id,v_design_path
    )->'effectiveAssignments') with ordinality direction(value,ordinal);
    select jsonb_build_object(
      'policy',effective.value->'policy',
      'origin',effective.value->>'origin',
      'sourceScopeKind',effective.value#>>'{sourceScope,kind}'
    ) into v_expected_policy
    from jsonb_array_elements(jsonb_build_array(
      private.course_current_component_policy_v1(
        p_course_id,v_design_path
      )->'effectiveAssignment'
    )) effective(value);
    if v_snapshot->'parameters' <> v_expected_parameters
       or v_snapshot->'editorialDirections' <> v_expected_directions
       or v_snapshot->'componentPolicy' <> v_expected_policy then
      raise exception 'A configuração usada divergiu da configuração corrente.'
        using errcode = '40001';
    end if;
    if exists(
      select 1
      from jsonb_array_elements_text(
        v_application->'introducedInstructionalAnalysisUnitIds'
      ) introduced(value)
      where not (v_expected_analysis_ids ? introduced.value::text)
    ) or exists(
      select 1
      from jsonb_array_elements(v_application->'explanationApplications') explanation(value)
      where not (v_expected_analysis_ids
        ? (explanation.value->>'instructionalAnalysisUnitId')::text)
    ) or exists(
      select 1
      from jsonb_array_elements(v_application->'practiceApplications') practice(value)
      where not (v_expected_evidence_ids
        ? (practice.value->>'evidenceRequirementId')::text)
    ) or v_application->'componentRefs'
      <> to_jsonb(private.course_component_refs_from_content_v1(
        v_unit.value->'content'
      )) then
      raise exception 'A aplicação pedagógica referencia fatos fora do recorte.'
        using errcode = '22023';
    end if;

    v_upserts := v_upserts || jsonb_build_array(jsonb_build_object(
      'entityType','study_unit',
      'entityId',v_unit.value->>'studyUnitId',
      'parentType','microsequence',
      'parentId',v_unit.value->>'didacticMicrosequenceId',
      'position',(v_unit.value->>'position')::integer,
      'content',v_unit.value->'content'
    ));
    v_source_applications := v_source_applications || jsonb_build_array(
      jsonb_build_object(
        'studyUnitId',v_unit.value->>'studyUnitId',
        'sourceLinks',v_unit.value->'sourceLinks'
      )
    );
    v_current_units:=v_current_units||jsonb_build_array(v_unit.value);
  end loop;

  perform private.assert_course_materialization_pedagogy_v1(
    p_course_id,p_units
  );
  if exists(
    select 1 from private.course_entities entity
    where entity.course_id=p_course_id and entity.entity_type='study_unit'
      and entity.parent_type='microsequence'
      and exists(
        select 1
        from private.course_authoring_part_didactic_microsequences membership
        where membership.course_id=p_course_id
          and membership.authoring_part_id=p_authoring_part_id
          and membership.didactic_microsequence_id=entity.parent_id
      )
      and not exists(
        select 1 from jsonb_array_elements(v_current_units) unit(value)
        where unit.value->>'studyUnitId'=entity.entity_id
      )
  ) then
    raise exception 'A substituição precisa representar toda Unidade corrente da Parte.'
      using errcode='23514';
  end if;
  select coalesce(array_agg(entity.entity_id),array[]::text[])
    into v_existing_study_unit_ids
  from private.course_entities entity
  where entity.course_id=p_course_id and entity.entity_type='study_unit'
    and exists(
      select 1 from jsonb_array_elements(v_current_units) unit(value)
      where unit.value->>'studyUnitId'=entity.entity_id
    );
  v_composition := public.commit_course_composition_for_actor_v1(
    p_actor_id,p_course_id,p_expected_course_revision,
    v_upserts,'[]'::jsonb,v_source_applications,p_request_id
  );
  update private.course_entities entity
  set design_snapshot = jsonb_set(
        unit.value->'designSnapshot','{appliedAt}',to_jsonb(statement_timestamp()),true
      ),
      design_application = jsonb_build_object(
        'contract','aralearn.study-unit-design-application.v1'
      ) || unit.value->'designApplication',
      created_origin = case
        when not (entity.entity_id=any(v_existing_study_unit_ids))
          then coalesce(entity.created_origin,'gpt')
        else entity.created_origin end,
      last_revision_origin = 'gpt'
  from jsonb_array_elements(v_current_units) unit(value)
  where entity.course_id = p_course_id
    and entity.entity_type = 'study_unit'
    and entity.entity_id = unit.value->>'studyUnitId'
    and row(entity.design_snapshot-'appliedAt',entity.design_application,
      entity.last_revision_origin) is distinct from row(
        unit.value->'designSnapshot',
        jsonb_build_object(
          'contract','aralearn.study-unit-design-application.v1'
        ) || unit.value->'designApplication',
        'gpt'::text
      );
  get diagnostics v_design_changes = row_count;
  if v_design_changes > 0
     and coalesce((v_composition->>'createdCount')::integer,0)
       + coalesce((v_composition->>'updatedCount')::integer,0)
       + coalesce((v_composition->>'deletedCount')::integer,0) = 0 then
    update public.courses course
    set revision = course.revision + 1,updated_at = now()
    where course.id = p_course_id returning * into v_course;
  else
    select * into strict v_course
    from public.courses course where course.id = p_course_id;
  end if;

  v_result := jsonb_build_object(
    'contract','aralearn.course-part-materialization.v1',
    'courseId',p_course_id,
    'courseRevision',v_course.revision,
    'authoringPartId',p_authoring_part_id,
    'changed',coalesce((v_composition->>'createdCount')::integer,0)
      + coalesce((v_composition->>'updatedCount')::integer,0)
      + coalesce((v_composition->>'deletedCount')::integer,0)
      + v_design_changes > 0,
    'studyUnitCount',jsonb_array_length(p_units),
    'idempotent',false
  );
  update private.course_change_receipts receipt
  set operation = 'materialize_course_authoring_part_v1',
      request_hash = p_request_hash,
      result = v_result
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id
    and receipt.course_id = p_course_id;
  if not found then
    raise exception 'A materialização não produziu receipt atômico.'
      using errcode = '55000';
  end if;
  return v_result;
end;
$function$;

revoke all on function public.materialize_course_authoring_part_for_actor_v1(
  uuid,uuid,uuid,bigint,bigint,jsonb,text,text
) from public,anon,authenticated,service_role;
grant execute on function public.materialize_course_authoring_part_for_actor_v1(
  uuid,uuid,uuid,bigint,bigint,jsonb,text,text
) to service_role;

create function private.get_course_instructional_plan_for_actor_v2(
  p_actor_id uuid,
  p_course_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog,public,private
as $function$
declare
  v_course public.courses%rowtype;
  v_plan private.course_instructional_plans%rowtype;
  v_outcomes jsonb;
  v_analysis_units jsonb;
  v_evidence_requirements jsonb;
  v_parts jsonb;
  v_counts jsonb;
  v_result jsonb;
begin
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  select * into strict v_course
  from public.courses course where course.id = p_course_id;
  select * into strict v_plan
  from private.course_instructional_plans plan
  where plan.course_id = p_course_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',item.id,'position',item.position,'statement',item.statement,
    'version',item.version
  ) order by item.position,item.id),'[]'::jsonb)
  into v_outcomes
  from private.course_instructional_plan_items item
  where item.instructional_plan_id = v_plan.id
    and item.item_kind = 'intended_learning_outcome';

  with introduced as materialized(
    select introduced_id.value as analysis_id,
      min(part.position)::integer as introduced_part_position
    from private.course_entities study_unit
    cross join lateral jsonb_array_elements_text(coalesce(
      study_unit.design_application->'introducedInstructionalAnalysisUnitIds',
      '[]'::jsonb
    )) introduced_id(value)
    join private.course_authoring_part_didactic_microsequences membership
      on membership.course_id=study_unit.course_id
     and membership.didactic_microsequence_id=study_unit.parent_id
    join private.course_authoring_parts part
      on part.course_id=membership.course_id
     and part.id=membership.authoring_part_id
    where study_unit.course_id=p_course_id
      and study_unit.entity_type='study_unit'
      and study_unit.design_application is not null
    group by introduced_id.value
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',item.id,'position',item.position,'statement',item.statement,
    'version',item.version,'introduced',introduced.analysis_id is not null,
    'introducedPartPosition',introduced.introduced_part_position
  ) order by item.position,item.id),'[]'::jsonb)
  into v_analysis_units
  from private.course_instructional_plan_items item
  left join introduced on introduced.analysis_id=item.id::text
  where item.instructional_plan_id = v_plan.id
    and item.item_kind = 'instructional_analysis_unit';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',item.id,'position',item.position,'statement',item.statement,
    'version',item.version
  ) order by item.position,item.id),'[]'::jsonb)
  into v_evidence_requirements
  from private.course_instructional_plan_items item
  where item.instructional_plan_id = v_plan.id
    and item.item_kind = 'evidence_requirement';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',part.id,
    'position',part.position,
    'title',part.title,
    'intent',part.intent,
    'version',part.version,
    'microsequences',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',microsequence.entity_id,
        'productionPosition',membership.production_position,
        'title',coalesce(
          nullif(microsequence.content->>'title',''),microsequence.entity_id
        ),
        'goal',microsequence.content->>'goal',
        'role',microsequence.content->>'role',
        'curriculumPath',jsonb_build_object(
          'moduleId',module_value.entity_id,
          'moduleTitle',coalesce(
            nullif(module_value.content->>'title',''),module_value.entity_id
          ),
          'lessonId',lesson.entity_id,
          'lessonTitle',coalesce(
            nullif(lesson.content->>'title',''),lesson.entity_id
          )
        ),
        'studyUnitCount',(
          select count(*)::integer
          from private.course_entities study_unit
          where study_unit.course_id = microsequence.course_id
            and study_unit.entity_type = 'study_unit'
            and study_unit.parent_type = 'microsequence'
            and study_unit.parent_id = microsequence.entity_id
        )
      ) order by membership.production_position,
        membership.didactic_microsequence_id)
      from private.course_authoring_part_didactic_microsequences membership
      join private.course_entities microsequence
        on microsequence.course_id = membership.course_id
       and microsequence.entity_type = 'microsequence'
       and microsequence.entity_id = membership.didactic_microsequence_id
      join private.course_entities lesson
        on lesson.course_id = microsequence.course_id
       and lesson.entity_type = 'lesson'
       and lesson.entity_id = microsequence.parent_id
      join private.course_entities module_value
        on module_value.course_id = lesson.course_id
       and module_value.entity_type = 'module'
       and module_value.entity_id = lesson.parent_id
      where membership.course_id = part.course_id
        and membership.authoring_part_id = part.id
    ),'[]'::jsonb),
    'progress',jsonb_build_object(
      'state',case
        when progress.microsequence_count = 0
          or progress.study_unit_count = 0 then 'planned'
        when progress.empty_microsequence_count = 0 then 'materialized'
        else 'partially_materialized'
      end,
      'microsequenceCount',progress.microsequence_count,
      'studyUnitCount',progress.study_unit_count
    )
  ) order by part.position,part.id),'[]'::jsonb)
  into v_parts
  from private.course_authoring_parts part
  cross join lateral (
    select count(*)::integer as microsequence_count,
      coalesce(sum(membership.study_unit_count),0)::integer as study_unit_count,
      count(*) filter(where membership.study_unit_count = 0)::integer
        as empty_microsequence_count
    from (
      select assignment.didactic_microsequence_id,
        count(study_unit.entity_id)::integer as study_unit_count
      from private.course_authoring_part_didactic_microsequences assignment
      left join private.course_entities study_unit
        on study_unit.course_id = assignment.course_id
       and study_unit.entity_type = 'study_unit'
       and study_unit.parent_type = 'microsequence'
       and study_unit.parent_id = assignment.didactic_microsequence_id
      where assignment.course_id = part.course_id
        and assignment.authoring_part_id = part.id
      group by assignment.didactic_microsequence_id
    ) membership
  ) progress
  where part.instructional_plan_id = v_plan.id;

  select jsonb_build_object(
    'intendedLearningOutcomeCount',jsonb_array_length(v_outcomes),
    'instructionalAnalysisUnitCount',jsonb_array_length(v_analysis_units),
    'evidenceRequirementCount',jsonb_array_length(v_evidence_requirements),
    'authoringPartCount',jsonb_array_length(v_parts),
    'linkedDidacticMicrosequenceCount',
      count(distinct membership.didactic_microsequence_id)::integer,
    'studyUnitCount',count(distinct study_unit.entity_id)::integer
  ) into v_counts
  from private.course_authoring_parts part
  left join private.course_authoring_part_didactic_microsequences membership
    on membership.course_id = part.course_id
   and membership.authoring_part_id = part.id
  left join private.course_entities study_unit
    on study_unit.course_id = membership.course_id
   and study_unit.entity_type = 'study_unit'
   and study_unit.parent_type = 'microsequence'
   and study_unit.parent_id = membership.didactic_microsequence_id
  where part.instructional_plan_id = v_plan.id;

  v_result := jsonb_build_object(
    'contract','aralearn.course-instructional-plan.v2',
    'courseId',v_course.id,
    'courseRevision',v_course.revision,
    'plan',jsonb_build_object(
      'id',v_plan.id,
      'version',v_plan.version,
      'title',v_course.title,
      'objective',v_course.goal,
      'audience',v_plan.audience,
      'scope',v_plan.instructional_scope,
      'preferredPartCount',jsonb_build_object(
        'minimum',v_plan.preferred_authoring_part_min,
        'maximum',v_plan.preferred_authoring_part_max,
        'origin',v_plan.part_count_origin
      ),
      'intendedLearningOutcomes',v_outcomes,
      'instructionalAnalysisUnits',v_analysis_units,
      'evidenceRequirements',v_evidence_requirements,
      'parts',v_parts,
      'counts',v_counts,
      'updatedAt',v_plan.updated_at
    )
  );
  if octet_length(v_result::text) > 1835008 then
    raise exception 'Planejamento excede o limite de leitura.'
      using errcode = '54000';
  end if;
  return v_result;
end;
$function$;

revoke all on function private.get_course_instructional_plan_for_actor_v2(
  uuid,uuid
) from public,anon,authenticated,service_role;

create function public.get_owned_course_instructional_plan_for_actor_v2(
  p_actor_id uuid,
  p_course_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog,public,private
as $function$
begin
  perform private.require_service_role();
  return private.get_course_instructional_plan_for_actor_v2(
    p_actor_id,p_course_id
  );
end;
$function$;

revoke all on function public.get_owned_course_instructional_plan_for_actor_v2(
  uuid,uuid
) from public,anon,authenticated,service_role;
grant execute on function public.get_owned_course_instructional_plan_for_actor_v2(
  uuid,uuid
) to service_role;

create function public.save_course_authoring_part_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_course_revision bigint,
  p_expected_plan_version bigint,
  p_part jsonb,
  p_request_id text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private,extensions
as $function$
declare
  v_receipt private.course_change_receipts%rowtype;
  v_course public.courses%rowtype;
  v_plan private.course_instructional_plans%rowtype;
  v_existing_part private.course_authoring_parts%rowtype;
  v_part_existed boolean := false;
  v_part_id uuid;
  v_microsequence record;
  v_item record;
  v_old_microsequence_ids text[] := array[]::text[];
  v_old_plan_item_ids uuid[] := array[]::uuid[];
  v_new_microsequence_ids text[] := array[]::text[];
  v_prunable_lesson_ids text[] := array[]::text[];
  v_prunable_module_ids text[] := array[]::text[];
  v_old_target_map jsonb := '[]'::jsonb;
  v_new_target_map jsonb := '[]'::jsonb;
  v_module_position integer;
  v_lesson_position integer;
  v_microsequence_position integer;
  v_rows bigint;
  v_changed boolean := false;
  v_result jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_course_revision is null or p_expected_course_revision < 1
     or p_expected_plan_version is null or p_expected_plan_version < 1
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_part) is distinct from 'object'
     or not (p_part ?& array[
       'partId','position','title','intent','microsequences'
     ])
     or p_part - 'partId' - 'position' - 'title' - 'intent'
       - 'microsequences' <> '{}'::jsonb
     or p_part->'partId' <> 'null'::jsonb
       and (
         jsonb_typeof(p_part->'partId') <> 'string'
         or (p_part->>'partId') !~
           '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       )
     or jsonb_typeof(p_part->'position') <> 'number'
     or (p_part->>'position') !~ '^(0|[1-9][0-9]*)$'
     or (p_part->>'position')::integer not between 0 and 63
     or nullif(btrim(p_part->>'title'),'') is null
     or char_length(p_part->>'title') > 300
     or jsonb_typeof(p_part->'intent') <> 'string'
     or char_length(p_part->>'intent') > 4000
     or jsonb_typeof(p_part->'microsequences') <> 'array'
     or jsonb_array_length(p_part->'microsequences') not between 1 and 32
     or octet_length(p_part::text) > 524288 then
    raise exception 'Parte autoral inválida.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:' || p_actor_id::text || ':' || p_request_id,0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  select * into v_receipt from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'save_course_authoring_part_v1'
       or v_receipt.course_id <> p_course_id
       or v_receipt.request_hash <> p_request_hash then
      raise exception 'requestId reutilizado com Parte incompatível.'
        using errcode = '23514';
    end if;
    return (v_receipt.result - 'idempotent')
      || jsonb_build_object('idempotent',true);
  end if;

  perform 1 from auth.users actor where actor.id=p_actor_id for key share;
  if not found then
    raise exception 'Pessoa inexistente ou inacessível.' using errcode='PT404';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'course-row:'||p_course_id::text,0
  ));
  select * into strict v_course
  from public.courses course where course.id = p_course_id for update;
  if v_course.revision <> p_expected_course_revision then
    raise exception 'O Curso mudou; releia antes de salvar a Parte.'
      using errcode = '40001';
  end if;
  select * into strict v_plan
  from private.course_instructional_plans plan
  where plan.course_id = p_course_id for update;
  if v_plan.version <> p_expected_plan_version then
    raise exception 'O planejamento mudou; releia antes de salvar a Parte.'
      using errcode = '40001';
  end if;

  v_part_id := case when p_part->'partId' = 'null'::jsonb
    then extensions.gen_random_uuid()
    else (p_part->>'partId')::uuid end;
  select * into v_existing_part
  from private.course_authoring_parts part
  where part.id = v_part_id;
  v_part_existed := found;
  if found and (v_existing_part.course_id <> p_course_id
      or v_existing_part.instructional_plan_id <> v_plan.id) then
    raise exception 'A Parte pertence a outro planejamento.' using errcode = '23514';
  end if;

  if (
    select count(*) <> count(distinct microsequence.value->>'microsequenceId')
      or count(*) <> count(distinct (microsequence.value->>'position'))
    from jsonb_array_elements(p_part->'microsequences') microsequence(value)
  ) then
    raise exception 'A Parte repete Microssequência ou posição.'
      using errcode = '22023';
  end if;
  if exists(
    select 1
    from jsonb_array_elements(p_part->'microsequences') microsequence(value)
    group by microsequence.value->>'moduleId'
    having count(distinct row(
      microsequence.value->>'moduleTitle',microsequence.value->>'moduleGoal'
    )) > 1
  ) or exists(
    select 1
    from jsonb_array_elements(p_part->'microsequences') microsequence(value)
    group by microsequence.value->>'lessonId'
    having count(distinct row(
      microsequence.value->>'moduleId',microsequence.value->>'lessonTitle',
      microsequence.value->>'lessonGoal'
    )) > 1
  ) then
    raise exception 'Módulo ou Lição repetido possui conteúdo divergente.'
      using errcode = '22023';
  end if;
  if exists(
    select 1
    from jsonb_array_elements(p_part->'microsequences') microsequence(value)
    where jsonb_typeof(microsequence.value) <> 'object'
      or not (microsequence.value ?& array[
        'moduleId','moduleTitle','moduleGoal','lessonId','lessonTitle','lessonGoal','microsequenceId',
        'title','goal','role','position','analysisUnits','evidenceRequirements'
      ])
      or microsequence.value - 'moduleId' - 'moduleTitle' - 'moduleGoal' - 'lessonId'
        - 'lessonTitle' - 'lessonGoal' - 'microsequenceId' - 'title' - 'goal' - 'role'
        - 'position' - 'analysisUnits' - 'evidenceRequirements' <> '{}'::jsonb
      or exists(
        select 1 from (values(
          (microsequence.value->'moduleId'),
          (microsequence.value->'lessonId'),
          (microsequence.value->'microsequenceId')
        )) identifier(value)
        where jsonb_typeof(identifier.value)<>'string'
          or nullif(btrim(identifier.value#>>'{}'),'') is null
          or (identifier.value#>>'{}')<>btrim(identifier.value#>>'{}')
          or char_length(identifier.value#>>'{}')>240
          or octet_length(identifier.value#>>'{}')>960
          or (identifier.value#>>'{}')~'[[:cntrl:]]'
      )
      or nullif(btrim(microsequence.value->>'moduleTitle'),'') is null
      or char_length(microsequence.value->>'moduleTitle') > 300
      or nullif(btrim(microsequence.value->>'moduleGoal'),'') is null
      or char_length(microsequence.value->>'moduleGoal') > 2000
      or nullif(btrim(microsequence.value->>'lessonTitle'),'') is null
      or char_length(microsequence.value->>'lessonTitle') > 300
      or nullif(btrim(microsequence.value->>'lessonGoal'),'') is null
      or char_length(microsequence.value->>'lessonGoal') > 2000
      or nullif(btrim(microsequence.value->>'title'),'') is null
      or char_length(microsequence.value->>'title') > 300
      or jsonb_typeof(microsequence.value->'goal') <> 'string'
      or char_length(microsequence.value->>'goal') > 4000
      or microsequence.value->>'role' not in('explain','practice','review','support')
      or microsequence.value->>'role'='explain' and case
        when jsonb_typeof(microsequence.value->'analysisUnits')='array'
          then jsonb_array_length(microsequence.value->'analysisUnits')=0
        else false end
      or jsonb_typeof(microsequence.value->'position') <> 'number'
      or (microsequence.value->>'position') !~ '^(0|[1-9][0-9]*)$'
      or (microsequence.value->>'position')::integer not between 0 and 63
      or jsonb_typeof(microsequence.value->'analysisUnits') <> 'array'
      or jsonb_array_length(microsequence.value->'analysisUnits') > 64
      or jsonb_typeof(microsequence.value->'evidenceRequirements') <> 'array'
      or jsonb_array_length(microsequence.value->'evidenceRequirements') > 64
  ) then
    raise exception 'Microssequência planejada inválida.' using errcode = '22023';
  end if;
  if exists(
    select 1
    from jsonb_array_elements(p_part->'microsequences') microsequence(value)
    cross join lateral (
      select 'instructional_analysis_unit'::text as kind,item.value
      from jsonb_array_elements(microsequence.value->'analysisUnits') item(value)
      union all
      select 'evidence_requirement',item.value
      from jsonb_array_elements(microsequence.value->'evidenceRequirements') item(value)
    ) item
    where jsonb_typeof(item.value) <> 'object'
      or not (item.value ?& array['id','position','statement'])
      or item.value - 'id' - 'position' - 'statement' <> '{}'::jsonb
      or (item.value->>'id') !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(item.value->'position') <> 'number'
      or (item.value->>'position') !~ '^(0|[1-9][0-9]*)$'
      or nullif(btrim(item.value->>'statement'),'') is null
      or char_length(item.value->>'statement') > 2000
  ) or exists(
    select 1
    from (
      select item.value->>'id' as id,item.value->>'statement' as statement,
        item.value->>'position' as position,'instructional_analysis_unit' as kind
      from jsonb_array_elements(p_part->'microsequences') microsequence(value)
      cross join lateral jsonb_array_elements(
        microsequence.value->'analysisUnits'
      ) item(value)
      union all
      select item.value->>'id',item.value->>'statement',item.value->>'position',
        'evidence_requirement'
      from jsonb_array_elements(p_part->'microsequences') microsequence(value)
      cross join lateral jsonb_array_elements(
        microsequence.value->'evidenceRequirements'
      ) item(value)
    ) item
    group by item.id
    having count(distinct row(item.kind,item.position,item.statement)) <> 1
  ) then
    raise exception 'Inventário semântico da Parte é inconsistente.'
      using errcode = '22023';
  end if;
  if exists(
    select 1
    from jsonb_array_elements(p_part->'microsequences') microsequence(value)
    cross join lateral jsonb_array_elements(
      microsequence.value->'analysisUnits'
    ) analysis(value)
    group by analysis.value->>'id'
    having count(distinct microsequence.value->>'microsequenceId')>1
  ) or exists(
    select 1
    from jsonb_array_elements(p_part->'microsequences') microsequence(value)
    cross join lateral jsonb_array_elements(
      microsequence.value->'analysisUnits'
    ) analysis(value)
    join private.course_design_target_plan_items assignment
      on assignment.course_id=p_course_id
     and assignment.plan_item_kind='instructional_analysis_unit'
     and assignment.plan_item_id=(analysis.value->>'id')::uuid
    where assignment.didactic_microsequence_id
      <> microsequence.value->>'microsequenceId'
  ) then
    raise exception 'AnalysisUnit pertence a outra Microssequência.'
      using errcode='23514';
  end if;

  select coalesce(array_agg(membership.didactic_microsequence_id
    order by membership.production_position),array[]::text[])
    into v_old_microsequence_ids
  from private.course_authoring_part_didactic_microsequences membership
  where membership.course_id = p_course_id
    and membership.authoring_part_id = v_part_id;
  select coalesce(array_agg(distinct assignment.plan_item_id),array[]::uuid[])
    into v_old_plan_item_ids
  from private.course_design_target_plan_items assignment
  where assignment.course_id = p_course_id
    and assignment.didactic_microsequence_id = any(v_old_microsequence_ids);
  select coalesce(jsonb_agg(jsonb_build_object(
    'microsequenceId',assignment.didactic_microsequence_id,
    'planItemId',assignment.plan_item_id,
    'kind',assignment.plan_item_kind
  ) order by assignment.didactic_microsequence_id,
    assignment.plan_item_kind,assignment.plan_item_id),'[]'::jsonb)
    into v_old_target_map
  from private.course_design_target_plan_items assignment
  where assignment.course_id = p_course_id
    and assignment.didactic_microsequence_id = any(v_old_microsequence_ids);
  select coalesce(array_agg(distinct microsequence.parent_id),array[]::text[])
    into v_prunable_lesson_ids
  from private.course_entities microsequence
  where microsequence.course_id = p_course_id
    and microsequence.entity_type = 'microsequence'
    and microsequence.entity_id = any(v_old_microsequence_ids);
  select coalesce(array_agg(distinct lesson.parent_id),array[]::text[])
    into v_prunable_module_ids
  from private.course_entities lesson
  where lesson.course_id = p_course_id and lesson.entity_type = 'lesson'
    and lesson.entity_id = any(v_prunable_lesson_ids);

  insert into private.course_authoring_parts(
    id,course_id,instructional_plan_id,position,title,intent
  ) values(
    v_part_id,p_course_id,v_plan.id,(p_part->>'position')::integer,
    p_part->>'title',p_part->>'intent'
  ) on conflict(id) do update set
    position=excluded.position,title=excluded.title,intent=excluded.intent,
    updated_at=now()
  where row(
    course_authoring_parts.position,course_authoring_parts.title,
    course_authoring_parts.intent
  ) is distinct from row(excluded.position,excluded.title,excluded.intent);
  get diagnostics v_rows = row_count;
  v_changed := v_changed or v_rows > 0;

  delete from private.course_authoring_part_didactic_microsequences membership
  where membership.course_id = p_course_id
    and membership.authoring_part_id = v_part_id;

  for v_microsequence in
    select microsequence.value,microsequence.ordinal
    from jsonb_array_elements(p_part->'microsequences')
      with ordinality microsequence(value,ordinal)
    order by microsequence.ordinal
  loop
    if exists(
      select 1 from private.course_entities entity
      where entity.course_id = p_course_id
        and entity.entity_id = v_microsequence.value->>'moduleId'
        and entity.entity_type <> 'module'
    ) then
      raise exception 'A identidade do Módulo conflita com outra entidade.'
        using errcode = '23514';
    end if;
    select coalesce((
      select existing.position
      from private.course_entities existing
      where existing.course_id = p_course_id
        and existing.entity_type = 'module'
        and existing.entity_id = v_microsequence.value->>'moduleId'
    ),(
      select coalesce(max(entity.position),-1)+1
      from private.course_entities entity
      where entity.course_id = p_course_id and entity.entity_type = 'module'
    )) into v_module_position;
    insert into private.course_entities(
      course_id,entity_type,entity_id,parent_type,parent_id,position,content
    ) values(
      p_course_id,'module',v_microsequence.value->>'moduleId',null,null,
      v_module_position,jsonb_build_object(
        'title',v_microsequence.value->>'moduleTitle',
        'guide',jsonb_build_object(
          'goal',v_microsequence.value->>'moduleGoal',
          'include','[]'::jsonb,'exclude','[]'::jsonb,
          'notation','[]'::jsonb,'avoid','[]'::jsonb
        )
      )
    ) on conflict(course_id,entity_type,entity_id) do update set
      content=jsonb_set(
        course_entities.content||jsonb_build_object(
          'title',excluded.content->'title'
        ),
        '{guide,goal}',excluded.content#>'{guide,goal}',true
      ),
      version=course_entities.version+1,updated_at=now()
    where course_entities.content is distinct from jsonb_set(
      course_entities.content||jsonb_build_object(
        'title',excluded.content->'title'
      ),
      '{guide,goal}',excluded.content#>'{guide,goal}',true
    );
    get diagnostics v_rows = row_count;
    v_changed := v_changed or v_rows > 0;

    if exists(
      select 1 from private.course_entities entity
      where entity.course_id = p_course_id
        and entity.entity_id = v_microsequence.value->>'lessonId'
        and (entity.entity_type <> 'lesson'
          or entity.parent_id <> v_microsequence.value->>'moduleId')
    ) then
      raise exception 'A identidade da Lição conflita com outra hierarquia.'
        using errcode = '23514';
    end if;
    select coalesce((
      select existing.position
      from private.course_entities existing
      where existing.course_id = p_course_id
        and existing.entity_type = 'lesson'
        and existing.entity_id = v_microsequence.value->>'lessonId'
    ),(
      select coalesce(max(entity.position),-1)+1
      from private.course_entities entity
      where entity.course_id = p_course_id and entity.entity_type = 'lesson'
        and entity.parent_type = 'module'
        and entity.parent_id = v_microsequence.value->>'moduleId'
    )) into v_lesson_position;
    insert into private.course_entities(
      course_id,entity_type,entity_id,parent_type,parent_id,position,content
    ) values(
      p_course_id,'lesson',v_microsequence.value->>'lessonId','module',
      v_microsequence.value->>'moduleId',v_lesson_position,jsonb_build_object(
        'title',v_microsequence.value->>'lessonTitle',
        'guide',jsonb_build_object(
          'goal',v_microsequence.value->>'lessonGoal',
          'include','[]'::jsonb,'exclude','[]'::jsonb,
          'notation','[]'::jsonb,'avoid','[]'::jsonb
        )
      )
    ) on conflict(course_id,entity_type,entity_id) do update set
      content=jsonb_set(
        course_entities.content||jsonb_build_object(
          'title',excluded.content->'title'
        ),
        '{guide,goal}',excluded.content#>'{guide,goal}',true
      ),
      version=course_entities.version+1,updated_at=now()
    where course_entities.content is distinct from jsonb_set(
      course_entities.content||jsonb_build_object(
        'title',excluded.content->'title'
      ),
      '{guide,goal}',excluded.content#>'{guide,goal}',true
    );
    get diagnostics v_rows = row_count;
    v_changed := v_changed or v_rows > 0;

    if exists(
      select 1 from private.course_entities entity
      where entity.course_id = p_course_id
        and entity.entity_id = v_microsequence.value->>'microsequenceId'
        and (entity.entity_type <> 'microsequence'
          or entity.parent_id <> v_microsequence.value->>'lessonId')
    ) then
      raise exception 'A identidade da Microssequência conflita com outra hierarquia.'
        using errcode = '23514';
    end if;
    select coalesce((
      select existing.position
      from private.course_entities existing
      where existing.course_id = p_course_id
        and existing.entity_type = 'microsequence'
        and existing.entity_id = v_microsequence.value->>'microsequenceId'
    ),(
      select coalesce(max(entity.position),-1)+1
      from private.course_entities entity
      where entity.course_id = p_course_id and entity.entity_type = 'microsequence'
        and entity.parent_type = 'lesson'
        and entity.parent_id = v_microsequence.value->>'lessonId'
    )) into v_microsequence_position;
    insert into private.course_entities(
      course_id,entity_type,entity_id,parent_type,parent_id,position,content
    ) values(
      p_course_id,'microsequence',v_microsequence.value->>'microsequenceId',
      'lesson',v_microsequence.value->>'lessonId',v_microsequence_position,
      jsonb_build_object(
        'title',v_microsequence.value->>'title',
        'goal',v_microsequence.value->>'goal',
        'role',v_microsequence.value->>'role',
        'dependsOn','[]'::jsonb,
        'covers',coalesce((
          select jsonb_agg(to_jsonb(item.value->>'statement')
            order by (item.value->>'position')::integer,item.value->>'id')
          from jsonb_array_elements(
            v_microsequence.value->'analysisUnits'
          ) item(value)
        ),'[]'::jsonb),
        'checks',coalesce((
          select jsonb_agg(to_jsonb(item.value->>'statement')
            order by (item.value->>'position')::integer,item.value->>'id')
          from jsonb_array_elements(
            v_microsequence.value->'evidenceRequirements'
          ) item(value)
        ),'[]'::jsonb),
        'errors','[]'::jsonb
      )
    ) on conflict(course_id,entity_type,entity_id) do update set
      content=course_entities.content||jsonb_build_object(
        'title',excluded.content->'title',
        'goal',excluded.content->'goal',
        'role',excluded.content->'role',
        'covers',excluded.content->'covers',
        'checks',excluded.content->'checks'
      ),version=course_entities.version+1,updated_at=now()
    where course_entities.content is distinct from (
      course_entities.content||jsonb_build_object(
        'title',excluded.content->'title',
        'goal',excluded.content->'goal',
        'role',excluded.content->'role',
        'covers',excluded.content->'covers',
        'checks',excluded.content->'checks'
      )
    );
    get diagnostics v_rows = row_count;
    v_changed := v_changed or v_rows > 0;
    v_new_microsequence_ids := array_append(
      v_new_microsequence_ids,v_microsequence.value->>'microsequenceId'
    );

    insert into private.course_authoring_part_didactic_microsequences(
      course_id,authoring_part_id,didactic_microsequence_id,production_position
    ) values(
      p_course_id,v_part_id,v_microsequence.value->>'microsequenceId',
      (v_microsequence.value->>'position')::integer
    );

    delete from private.course_design_target_plan_items assignment
    where assignment.course_id = p_course_id
      and assignment.didactic_microsequence_id
        = v_microsequence.value->>'microsequenceId';
    for v_item in
      select 'instructional_analysis_unit'::text as kind,item.value
      from jsonb_array_elements(v_microsequence.value->'analysisUnits') item(value)
      union all
      select 'evidence_requirement',item.value
      from jsonb_array_elements(v_microsequence.value->'evidenceRequirements') item(value)
    loop
      if exists(
        select 1 from private.course_instructional_plan_items item
        where item.id = (v_item.value->>'id')::uuid
          and (item.course_id <> p_course_id
            or item.instructional_plan_id <> v_plan.id
            or item.item_kind <> v_item.kind)
      ) then
        raise exception 'A identidade do item pertence a outro inventário.'
          using errcode = '23514';
      end if;
      insert into private.course_instructional_plan_items(
        id,course_id,instructional_plan_id,item_kind,position,statement
      ) values(
        (v_item.value->>'id')::uuid,p_course_id,v_plan.id,v_item.kind,
        (v_item.value->>'position')::integer,v_item.value->>'statement'
      ) on conflict(id) do update set
        position=excluded.position,statement=excluded.statement,
        version=course_instructional_plan_items.version+1,updated_at=now()
      where row(
        course_instructional_plan_items.position,
        course_instructional_plan_items.statement
      ) is distinct from row(excluded.position,excluded.statement);
      get diagnostics v_rows = row_count;
      v_changed := v_changed or v_rows > 0;
      insert into private.course_design_target_plan_items(
        course_id,didactic_microsequence_id,plan_item_id,plan_item_kind
      ) values(
        p_course_id,v_microsequence.value->>'microsequenceId',
        (v_item.value->>'id')::uuid,v_item.kind
      );
    end loop;
  end loop;

  if v_old_microsequence_ids is distinct from v_new_microsequence_ids then
    v_changed := true;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'microsequenceId',assignment.didactic_microsequence_id,
    'planItemId',assignment.plan_item_id,
    'kind',assignment.plan_item_kind
  ) order by assignment.didactic_microsequence_id,
    assignment.plan_item_kind,assignment.plan_item_id),'[]'::jsonb)
    into v_new_target_map
  from private.course_design_target_plan_items assignment
  where assignment.course_id = p_course_id
    and assignment.didactic_microsequence_id = any(v_new_microsequence_ids);
  v_changed := v_changed or v_old_target_map is distinct from v_new_target_map;
  delete from private.course_entities microsequence
  where microsequence.course_id = p_course_id
    and microsequence.entity_type = 'microsequence'
    and microsequence.entity_id = any(v_old_microsequence_ids)
    and not (microsequence.entity_id = any(v_new_microsequence_ids))
    and not exists(
      select 1
      from private.course_authoring_part_didactic_microsequences membership
      where membership.course_id = microsequence.course_id
        and membership.didactic_microsequence_id = microsequence.entity_id
    )
    and not exists(
      select 1 from private.course_entities unit
      where unit.course_id = microsequence.course_id
        and unit.entity_type = 'study_unit'
        and unit.parent_type = 'microsequence'
        and unit.parent_id = microsequence.entity_id
    );
  get diagnostics v_rows = row_count;
  v_changed := v_changed or v_rows > 0;
  delete from private.course_instructional_plan_items item
  where item.course_id = p_course_id
    and item.id = any(v_old_plan_item_ids)
    and item.item_kind in('instructional_analysis_unit','evidence_requirement')
    and not exists(
      select 1 from private.course_design_target_plan_items assignment
      where assignment.course_id = item.course_id
        and assignment.plan_item_id = item.id
    );
  get diagnostics v_rows = row_count;
  v_changed := v_changed or v_rows > 0;
  delete from private.course_entities lesson
  where lesson.course_id = p_course_id and lesson.entity_type = 'lesson'
    and lesson.entity_id = any(v_prunable_lesson_ids)
    and not exists(
      select 1 from private.course_entities child
      where child.course_id = lesson.course_id
        and child.parent_type = 'lesson' and child.parent_id = lesson.entity_id
    );
  delete from private.course_entities module_value
  where module_value.course_id = p_course_id and module_value.entity_type = 'module'
    and module_value.entity_id = any(v_prunable_module_ids)
    and not exists(
      select 1 from private.course_entities child
      where child.course_id = module_value.course_id
        and child.parent_type = 'module' and child.parent_id = module_value.entity_id
    );
  with ranked as materialized (
    select entity.course_id,entity.entity_type,entity.entity_id,
      row_number() over(order by entity.position,entity.entity_id)::integer-1
        as next_position
    from private.course_entities entity
    where entity.course_id = p_course_id and entity.entity_type = 'module'
  )
  update private.course_entities entity
  set position = ranked.next_position,version = entity.version+1,updated_at = now()
  from ranked
  where entity.course_id = ranked.course_id
    and entity.entity_type = ranked.entity_type
    and entity.entity_id = ranked.entity_id
    and entity.position <> ranked.next_position;
  with ranked as materialized (
    select entity.course_id,entity.entity_type,entity.entity_id,
      row_number() over(
        partition by entity.parent_id order by entity.position,entity.entity_id
      )::integer-1 as next_position
    from private.course_entities entity
    where entity.course_id = p_course_id and entity.entity_type = 'lesson'
  )
  update private.course_entities entity
  set position = ranked.next_position,version = entity.version+1,updated_at = now()
  from ranked
  where entity.course_id = ranked.course_id
    and entity.entity_type = ranked.entity_type
    and entity.entity_id = ranked.entity_id
    and entity.position <> ranked.next_position;
  with ranked as materialized (
    select entity.course_id,entity.entity_type,entity.entity_id,
      row_number() over(
        partition by entity.parent_id order by entity.position,entity.entity_id
      )::integer-1 as next_position
    from private.course_entities entity
    where entity.course_id = p_course_id and entity.entity_type = 'microsequence'
  )
  update private.course_entities entity
  set position = ranked.next_position,version = entity.version+1,updated_at = now()
  from ranked
  where entity.course_id = ranked.course_id
    and entity.entity_type = ranked.entity_type
    and entity.entity_id = ranked.entity_id
    and entity.position <> ranked.next_position;

  if v_changed then
    if v_part_existed then
      update private.course_authoring_parts part
      set version = part.version+1,updated_at = now()
      where part.id = v_part_id;
    end if;
    update private.course_instructional_plans plan
    set version = plan.version+1,updated_at = now()
    where plan.id = v_plan.id returning * into v_plan;
    update public.courses course
    set revision = course.revision+1,updated_at = now()
    where course.id = p_course_id returning * into v_course;
  end if;
  v_result := jsonb_build_object(
    'contract','aralearn.course-authoring-part-change.v1',
    'courseId',p_course_id,
    'courseRevision',v_course.revision,
    'planVersion',v_plan.version,
    'authoringPartId',v_part_id,
    'changed',v_changed,
    'idempotent',false
  );
  insert into private.course_change_receipts(
    actor_id,request_id,operation,course_id,request_hash,result
  ) values(
    p_actor_id,p_request_id,'save_course_authoring_part_v1',
    p_course_id,p_request_hash,v_result
  );
  return v_result;
end;
$function$;

revoke all on function public.save_course_authoring_part_for_actor_v1(
  uuid,uuid,bigint,bigint,jsonb,text,text
) from public,anon,authenticated,service_role;
grant execute on function public.save_course_authoring_part_for_actor_v1(
  uuid,uuid,bigint,bigint,jsonb,text,text
) to service_role;

create or replace function private.course_authoring_part_progress_v1(
  p_course_id uuid,
  p_authoring_part_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,private
as $function$
  with membership as materialized(
    select link.didactic_microsequence_id
    from private.course_authoring_part_didactic_microsequences link
    where link.course_id=p_course_id
      and link.authoring_part_id=p_authoring_part_id
  ), counts as(
    select count(*)::integer as microsequence_count,
      count(*) filter(where exists(
        select 1 from private.course_entities study_unit
        where study_unit.course_id=p_course_id
          and study_unit.entity_type='study_unit'
          and study_unit.parent_type='microsequence'
          and study_unit.parent_id=membership.didactic_microsequence_id
      ))::integer as materialized_microsequence_count,
      coalesce((select count(*)::integer
        from private.course_entities study_unit
        where study_unit.course_id=p_course_id
          and study_unit.entity_type='study_unit'
          and study_unit.parent_type='microsequence'
          and exists(select 1 from membership selected
            where selected.didactic_microsequence_id=study_unit.parent_id)
      ),0) as study_unit_count
    from membership
  )
  select jsonb_build_object(
    'state',case
      when counts.study_unit_count=0 then 'planned'
      when counts.microsequence_count>0
        and counts.materialized_microsequence_count=counts.microsequence_count
        then 'materialized'
      else 'partially_materialized'
    end,
    'microsequenceCount',counts.microsequence_count,
    'studyUnitCount',counts.study_unit_count
  ) from counts
$function$;

revoke all on function private.course_authoring_part_progress_v1(uuid,uuid)
from public,anon,authenticated,service_role;


create or replace function private.decorate_course_inspection_page_v2(
  p_course_id uuid,
  p_expected_revision bigint,
  p_result jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog,private
as $function$
declare
  v_result jsonb := p_result;
  v_items jsonb;
begin
  if p_expected_revision is null or p_expected_revision<1
     or (p_result->>'courseRevision')::bigint<>p_expected_revision then
    raise exception 'A inspeção não corresponde à revisão solicitada.'
      using errcode='40001';
  end if;
  select coalesce(jsonb_agg(
    item.value || jsonb_build_object(
      'authorship',jsonb_build_object(
        'createdOrigin',entity.created_origin,
        'lastRevisionOrigin',entity.last_revision_origin,
        'design',jsonb_build_object(
          'snapshot',entity.design_snapshot,
          'application',entity.design_application
        )
      )
    ) order by item.ordinal
  ),'[]'::jsonb) into v_items
  from jsonb_array_elements(v_result->'items')
    with ordinality item(value,ordinal)
  join private.course_entities entity
    on entity.course_id = p_course_id
   and entity.entity_type = 'study_unit'
   and entity.entity_id = item.value#>>'{studyUnit,id}';
  v_result := jsonb_set(v_result,'{items}',v_items,true);
  v_result := jsonb_set(
    v_result,'{contract}',
    to_jsonb('aralearn.course-study-unit-inspection-page.v2'::text),true
  );
  v_result := jsonb_set(
    v_result,'{pageBytes}',to_jsonb(octet_length(v_items::text)),true
  );
  if octet_length(v_result::text) > 1835008 then
    raise exception 'Página de Unidades excede o limite de leitura.'
      using errcode = '54000';
  end if;
  return v_result;
end;
$function$;

revoke all on function private.decorate_course_inspection_page_v2(
  uuid,bigint,jsonb
) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.list_course_study_units_for_actor_v1(p_actor_id uuid, p_course_id uuid, p_expected_revision bigint, p_scope_kind text DEFAULT 'course'::text, p_scope_id text DEFAULT NULL::text, p_anchor_study_unit_id text DEFAULT NULL::text, p_cursor_study_unit_id text DEFAULT NULL::text, p_direction text DEFAULT 'forward'::text, p_limit integer DEFAULT 12, p_max_bytes integer DEFAULT 524288)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_course_revision bigint;
  v_scope_part_id uuid;
  v_pivot_study_unit_id text;
  v_pivot_ordinal bigint;
  v_total_count integer;
  v_items jsonb := '[]'::jsonb;
  v_scope_options jsonb;
  v_first_ordinal bigint;
  v_last_ordinal bigint;
  v_first_study_unit_id text;
  v_last_study_unit_id text;
  v_has_previous boolean := false;
  v_has_more boolean := false;
  v_previous_cursor jsonb;
  v_next_cursor jsonb;
  v_page_bytes integer;
  v_result jsonb;
begin
  perform private.require_course_access_v1(p_course_id, p_actor_id, true);
  if p_expected_revision is null or p_expected_revision < 1
     or p_scope_kind is null
     or p_scope_kind not in (
       'course', 'authoring_part', 'unassigned', 'module', 'lesson',
       'didactic_microsequence'
     )
     or p_direction is null or p_direction not in ('forward', 'backward')
     or p_limit is null or p_limit not between 1 and 24
     or p_max_bytes is null or p_max_bytes not between 65536 and 1500000
     or (p_anchor_study_unit_id is not null and p_cursor_study_unit_id is not null)
     or (
       p_scope_kind in ('course', 'unassigned')
       and p_scope_id is not null
     )
     or (
       p_scope_kind not in ('course', 'unassigned')
       and (
         nullif(btrim(p_scope_id), '') is null
         or p_scope_id <> btrim(p_scope_id)
         or char_length(p_scope_id) > 240
         or p_scope_id ~ '[[:cntrl:]]'
       )
     )
     or (
       p_anchor_study_unit_id is not null
       and (
         nullif(btrim(p_anchor_study_unit_id), '') is null
         or p_anchor_study_unit_id <> btrim(p_anchor_study_unit_id)
         or char_length(p_anchor_study_unit_id) > 240
         or p_anchor_study_unit_id ~ '[[:cntrl:]]'
       )
     )
     or (
       p_cursor_study_unit_id is not null
       and (
         nullif(btrim(p_cursor_study_unit_id), '') is null
         or p_cursor_study_unit_id <> btrim(p_cursor_study_unit_id)
         or char_length(p_cursor_study_unit_id) > 240
         or p_cursor_study_unit_id ~ '[[:cntrl:]]'
       )
     ) then
    raise exception 'Consulta de Unidades de estudo inválida.'
      using errcode = '22023';
  end if;
  if p_scope_kind = 'authoring_part' then
    if p_scope_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'Identidade da Parte de autoria inválida.'
        using errcode = '22023';
    end if;
    v_scope_part_id := p_scope_id::uuid;
  end if;

  select course.revision into strict v_course_revision
  from public.courses course where course.id = p_course_id;
  if v_course_revision is distinct from p_expected_revision then
    raise exception 'O Curso mudou; releia antes de continuar.'
      using errcode = '40001';
  end if;

  if p_scope_kind = 'authoring_part' and not exists(
    select 1 from private.course_authoring_parts part
    where part.course_id = p_course_id
      and part.id = v_scope_part_id

  ) then
    raise exception 'Parte de autoria inexistente no Curso.' using errcode = 'PT404';
  elsif p_scope_kind in ('module', 'lesson', 'didactic_microsequence')
      and not exists(
        select 1 from private.course_entities entity
        where entity.course_id = p_course_id
          and entity.entity_type = case p_scope_kind
            when 'module' then 'module'
            when 'lesson' then 'lesson'
            else 'microsequence'
          end
          and entity.entity_id = p_scope_id
      ) then
    raise exception 'Escopo curricular inexistente no Curso.' using errcode = 'PT404';
  end if;

  v_pivot_study_unit_id := coalesce(
    p_anchor_study_unit_id, p_cursor_study_unit_id
  );

  with ordered as materialized (
    select study_unit.entity_id,
      row_number() over(order by
        module_value.position, module_value.entity_id,
        lesson.position, lesson.entity_id,
        microsequence.position, microsequence.entity_id,
        study_unit.position, study_unit.entity_id
      ) as ordinal
    from private.course_entities module_value
    join private.course_entities lesson
      on lesson.course_id = module_value.course_id
     and lesson.entity_type = 'lesson'
     and lesson.parent_type = 'module'
     and lesson.parent_id = module_value.entity_id
    join private.course_entities microsequence
      on microsequence.course_id = lesson.course_id
     and microsequence.entity_type = 'microsequence'
     and microsequence.parent_type = 'lesson'
     and microsequence.parent_id = lesson.entity_id
    join private.course_entities study_unit
      on study_unit.course_id = microsequence.course_id
     and study_unit.entity_type = 'study_unit'
     and study_unit.parent_type = 'microsequence'
     and study_unit.parent_id = microsequence.entity_id
    left join private.course_authoring_part_didactic_microsequences membership
      on membership.course_id = microsequence.course_id
     and membership.didactic_microsequence_id = microsequence.entity_id
    left join private.course_authoring_parts part
      on part.course_id = membership.course_id
     and part.id = membership.authoring_part_id

    where module_value.course_id = p_course_id
      and module_value.entity_type = 'module'
      and module_value.parent_type is null
      and module_value.parent_id is null
      and case p_scope_kind
        when 'course' then true
        when 'authoring_part' then part.id = v_scope_part_id
        when 'unassigned' then part.id is null
        when 'module' then module_value.entity_id = p_scope_id
        when 'lesson' then lesson.entity_id = p_scope_id
        when 'didactic_microsequence' then microsequence.entity_id = p_scope_id
        else false
      end
  )
  select count(*)::integer,
    max(ordered.ordinal) filter(
      where ordered.entity_id = v_pivot_study_unit_id
    )
  into v_total_count, v_pivot_ordinal
  from ordered;

  if v_pivot_study_unit_id is not null and v_pivot_ordinal is null then
    if p_anchor_study_unit_id is not null then
      raise exception 'Unidade âncora inexistente no escopo.'
        using errcode = 'PT404';
    end if;
    raise exception 'Cursor de Unidade não pertence ao escopo.'
      using errcode = '22023';
  end if;

  select jsonb_build_object(
    'authoringParts', coalesce(jsonb_agg(jsonb_build_object(
      'id', part.id,
      'position', part.position,
      'title', part.title,
      'state', private.course_authoring_part_progress_v1(
        part.course_id, part.id
      )->>'state'
    ) order by part.position, part.id), '[]'::jsonb),
    'unassignedStudyUnitCount', (
      select count(*)::integer
      from private.course_entities study_unit
      join private.course_entities microsequence
        on microsequence.course_id = study_unit.course_id
       and microsequence.entity_type = 'microsequence'
       and microsequence.entity_id = study_unit.parent_id
      where study_unit.course_id = p_course_id
        and study_unit.entity_type = 'study_unit'
        and not exists(
          select 1
          from private.course_authoring_part_didactic_microsequences membership
          where membership.course_id = microsequence.course_id
            and membership.didactic_microsequence_id = microsequence.entity_id
        )
    )
  ) into v_scope_options
  from private.course_authoring_parts part
  where part.course_id = p_course_id ;

  with part_rows as materialized (
    select part.id, part.position, part.title,
      private.course_authoring_part_progress_v1(
        part.course_id, part.id
      )->>'state' as state
    from private.course_authoring_parts part
    where part.course_id = p_course_id
  ), ordered as materialized (
    select study_unit.entity_id,
      study_unit.position as study_unit_position,
      study_unit.content as study_unit_content,
      study_unit.version as study_unit_version,
      study_unit.updated_at as study_unit_updated_at,
      module_value.entity_id as module_id,
      module_value.position as module_position,
      module_value.content->>'title' as module_title,
      lesson.entity_id as lesson_id,
      lesson.position as lesson_position,
      lesson.content->>'title' as lesson_title,
      microsequence.entity_id as microsequence_id,
      microsequence.position as microsequence_position,
      microsequence.content->>'title' as microsequence_title,
      part.id as authoring_part_id,
      part.position as authoring_part_position,
      part.title as authoring_part_title,
      part.state as authoring_part_state,
      row_number() over(order by
        module_value.position, module_value.entity_id,
        lesson.position, lesson.entity_id,
        microsequence.position, microsequence.entity_id,
        study_unit.position, study_unit.entity_id
      ) as ordinal
    from private.course_entities module_value
    join private.course_entities lesson
      on lesson.course_id = module_value.course_id
     and lesson.entity_type = 'lesson'
     and lesson.parent_type = 'module'
     and lesson.parent_id = module_value.entity_id
    join private.course_entities microsequence
      on microsequence.course_id = lesson.course_id
     and microsequence.entity_type = 'microsequence'
     and microsequence.parent_type = 'lesson'
     and microsequence.parent_id = lesson.entity_id
    join private.course_entities study_unit
      on study_unit.course_id = microsequence.course_id
     and study_unit.entity_type = 'study_unit'
     and study_unit.parent_type = 'microsequence'
     and study_unit.parent_id = microsequence.entity_id
    left join private.course_authoring_part_didactic_microsequences membership
      on membership.course_id = microsequence.course_id
     and membership.didactic_microsequence_id = microsequence.entity_id
    left join part_rows part on part.id = membership.authoring_part_id
    where module_value.course_id = p_course_id
      and module_value.entity_type = 'module'
      and module_value.parent_type is null
      and module_value.parent_id is null
      and case p_scope_kind
        when 'course' then true
        when 'authoring_part' then part.id = v_scope_part_id
        when 'unassigned' then part.id is null
        when 'module' then module_value.entity_id = p_scope_id
        when 'lesson' then lesson.entity_id = p_scope_id
        when 'didactic_microsequence' then microsequence.entity_id = p_scope_id
        else false
      end
  ), candidate_pool as materialized (
    select ordered.*
    from ordered
    where v_pivot_ordinal is null
       or (
         p_direction = 'forward'
         and (
           ordered.ordinal > v_pivot_ordinal
           or (
             p_anchor_study_unit_id is not null
             and ordered.ordinal = v_pivot_ordinal
           )
         )
       )
       or (
         p_direction = 'backward'
         and (
           ordered.ordinal < v_pivot_ordinal
           or (
             p_anchor_study_unit_id is not null
             and ordered.ordinal = v_pivot_ordinal
           )
         )
       )
    order by
      case when p_direction = 'forward' then ordered.ordinal end,
      case when p_direction = 'backward' then ordered.ordinal end desc
    limit p_limit
  ), projected as materialized (
    select candidate_pool.*,
      jsonb_build_object(
        'studyUnit', candidate_pool.study_unit_content || jsonb_build_object(
          'id', candidate_pool.entity_id,
          'position', candidate_pool.study_unit_position
        ),
        'version', candidate_pool.study_unit_version,
        'updatedAt', candidate_pool.study_unit_updated_at,
        'ordinal', candidate_pool.ordinal,
        'curriculumPath', jsonb_build_object(
          'module', jsonb_build_object(
            'id', candidate_pool.module_id,
            'position', candidate_pool.module_position,
            'title', candidate_pool.module_title
          ),
          'lesson', jsonb_build_object(
            'id', candidate_pool.lesson_id,
            'position', candidate_pool.lesson_position,
            'title', candidate_pool.lesson_title
          ),
          'didacticMicrosequence', jsonb_build_object(
            'id', candidate_pool.microsequence_id,
            'position', candidate_pool.microsequence_position,
            'title', candidate_pool.microsequence_title
          )
        ),
        'authoringPart', case
          when candidate_pool.authoring_part_id is null then null
          else jsonb_build_object(
            'id', candidate_pool.authoring_part_id,
            'position', candidate_pool.authoring_part_position,
            'title', candidate_pool.authoring_part_title,
            'state', candidate_pool.authoring_part_state
          )
        end
      ) as item
    from candidate_pool
  ), running as materialized (
    select projected.*,
      row_number() over(order by
        case when p_direction = 'forward' then projected.ordinal end,
        case when p_direction = 'backward' then projected.ordinal end desc
      ) as directional_rank,
      sum(octet_length(projected.item::text)) over(order by
        case when p_direction = 'forward' then projected.ordinal end,
        case when p_direction = 'backward' then projected.ordinal end desc
      ) as cumulative_bytes
    from projected
  ), chosen as materialized (
    select * from running
    where directional_rank = 1
       or cumulative_bytes + directional_rank * 2 <= p_max_bytes
  )
  select
    coalesce(jsonb_agg(chosen.item order by chosen.ordinal), '[]'::jsonb),
    min(chosen.ordinal), max(chosen.ordinal),
    (array_agg(chosen.entity_id order by chosen.ordinal))[1],
    (array_agg(chosen.entity_id order by chosen.ordinal desc))[1]
  into v_items, v_first_ordinal, v_last_ordinal,
    v_first_study_unit_id, v_last_study_unit_id
  from chosen;

  v_has_previous := coalesce(v_first_ordinal > 1, false);
  v_has_more := coalesce(v_last_ordinal < v_total_count, false);
  v_previous_cursor := case when v_has_previous then jsonb_build_object(
    'studyUnitId', v_first_study_unit_id
  ) else null end;
  v_next_cursor := case when v_has_more then jsonb_build_object(
    'studyUnitId', v_last_study_unit_id
  ) else null end;
  v_page_bytes := octet_length(v_items::text);

  v_result := jsonb_build_object(
    'contract', 'aralearn.course-study-unit-inspection-page.v1',
    'courseId', p_course_id,
    'courseRevision', v_course_revision,
    'scope', jsonb_build_object(
      'kind', p_scope_kind,
      'id', case when p_scope_kind in ('course', 'unassigned')
        then null else p_scope_id end
    ),
    'totalCount', v_total_count,
    'scopeOptions', v_scope_options,
    'items', v_items,
    'hasPrevious', v_has_previous,
    'hasMore', v_has_more,
    'previousCursor', v_previous_cursor,
    'nextCursor', v_next_cursor,
    'pageBytes', v_page_bytes
  );
  if octet_length(v_result::text) > 1835008 then
    raise exception 'Página de Unidades excede o limite de leitura.'
      using errcode = '54000';
  end if;
  return v_result;
end;
$function$;

revoke all on function private.list_course_study_units_for_actor_v1(
  uuid,uuid,bigint,text,text,text,text,text,integer,integer
) from public,anon,authenticated,service_role;

create or replace function private.list_course_study_units_for_actor_continuous_v2(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_revision bigint,
  p_scope_kind text default 'course',
  p_scope_id text default null,
  p_anchor_study_unit_id text default null,
  p_cursor_study_unit_id text default null,
  p_direction text default 'forward',
  p_limit integer default 12,
  p_max_bytes integer default 524288
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog,private
as $function$
  select private.decorate_course_inspection_page_v2(
    p_course_id,p_expected_revision,
    private.list_course_study_units_for_actor_v1(
      p_actor_id,p_course_id,p_expected_revision,p_scope_kind,p_scope_id,
      p_anchor_study_unit_id,p_cursor_study_unit_id,p_direction,p_limit,p_max_bytes
    )
  )
$function$;

revoke all on function private.list_course_study_units_for_actor_continuous_v2(
  uuid,uuid,bigint,text,text,text,text,text,integer,integer
) from public,anon,authenticated,service_role;

create or replace function public.get_owned_course_authoring_analytics_for_actor_v2(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_course_revision bigint,
  p_query jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog,public,private
as $function$
declare
  v_course public.courses%rowtype;
  v_scope_kind text;
  v_scope_ref text;
  v_scope_label text;
  v_result jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_course_revision is null or p_expected_course_revision < 1
     or p_query is null or jsonb_typeof(p_query) <> 'object'
     or not (p_query ? 'scope') or p_query - 'scope' <> '{}'::jsonb
     or jsonb_typeof(p_query->'scope') <> 'object'
     or not (p_query->'scope' ?& array['kind','ref'])
     or (p_query->'scope') - 'kind' - 'ref' <> '{}'::jsonb
     or jsonb_typeof(p_query#>'{scope,kind}') <> 'string'
     or p_query#>>'{scope,kind}' not in(
       'course','authoring_part','didactic_microsequence','study_unit'
     ) then
    raise exception 'Consulta de Analytics inválida.' using errcode = '22023';
  end if;
  v_scope_kind := p_query#>>'{scope,kind}';
  if v_scope_kind = 'course' then
    if p_query#>'{scope,ref}' <> 'null'::jsonb then
      raise exception 'O escopo Curso não recebe referência.' using errcode = '22023';
    end if;
    v_scope_ref := null;
  else
    if jsonb_typeof(p_query#>'{scope,ref}') <> 'string' then
      raise exception 'O escopo exige referência corrente.' using errcode = '22023';
    end if;
    v_scope_ref := p_query#>>'{scope,ref}';
    if nullif(btrim(v_scope_ref),'') is null
       or v_scope_ref <> btrim(v_scope_ref)
       or char_length(v_scope_ref) > 240
       or v_scope_ref ~ '[[:cntrl:]]' then
      raise exception 'A referência do escopo é inválida.' using errcode = '22023';
    end if;
  end if;
  select * into v_course from public.courses course where course.id = p_course_id;
  if not found then raise exception 'Curso inexistente.' using errcode = 'PT404'; end if;
  if v_course.revision is distinct from p_expected_course_revision then
    raise exception 'O Curso mudou durante a leitura de Analytics.'
      using errcode = '40001';
  end if;
  if v_scope_kind = 'course' then
    v_scope_label := v_course.title;
  elsif v_scope_kind = 'authoring_part' then
    select part.title into v_scope_label
    from private.course_authoring_parts part
    where part.course_id = p_course_id and part.id::text = v_scope_ref;
  elsif v_scope_kind = 'didactic_microsequence' then
    select microsequence.content->>'title' into v_scope_label
    from private.course_entities microsequence
    where microsequence.course_id = p_course_id
      and microsequence.entity_type = 'microsequence'
      and microsequence.entity_id = v_scope_ref;
  else
    select unit.content->>'title' into v_scope_label
    from private.course_entities unit
    where unit.course_id = p_course_id and unit.entity_type = 'study_unit'
      and unit.entity_id = v_scope_ref;
  end if;
  if v_scope_label is null then
    raise exception 'Escopo de Analytics inexistente.' using errcode = 'PT404';
  end if;

  with
  selected_microsequences as materialized (
    select microsequence.entity_id,microsequence.parent_id as lesson_id,
      microsequence.position,microsequence.content->>'title' as title
    from private.course_entities microsequence
    where microsequence.course_id = p_course_id
      and microsequence.entity_type = 'microsequence'
      and (
        v_scope_kind = 'course'
        or v_scope_kind = 'authoring_part' and exists(
          select 1
          from private.course_authoring_part_didactic_microsequences membership
          where membership.course_id = microsequence.course_id
            and membership.authoring_part_id::text = v_scope_ref
            and membership.didactic_microsequence_id = microsequence.entity_id
        )
        or v_scope_kind = 'didactic_microsequence'
          and microsequence.entity_id = v_scope_ref
        or v_scope_kind = 'study_unit' and exists(
          select 1 from private.course_entities selected_unit
          where selected_unit.course_id = microsequence.course_id
            and selected_unit.entity_type = 'study_unit'
            and selected_unit.entity_id = v_scope_ref
            and selected_unit.parent_id = microsequence.entity_id
        )
      )
  ),
  scope_units_unordered as materialized (
    select unit.entity_id,unit.parent_id as microsequence_id,unit.position,
      unit.content,unit.version,unit.created_at,unit.updated_at,
      unit.design_snapshot,unit.design_application,
      unit.created_origin,unit.last_revision_origin,
      microsequence.lesson_id,lesson.parent_id as module_id,
      microsequence.position as microsequence_position,
      lesson.position as lesson_position,module_value.position as module_position
    from private.course_entities unit
    join selected_microsequences microsequence
      on microsequence.entity_id = unit.parent_id
    join private.course_entities lesson
      on lesson.course_id = unit.course_id and lesson.entity_type = 'lesson'
     and lesson.entity_id = microsequence.lesson_id
    join private.course_entities module_value
      on module_value.course_id = lesson.course_id
     and module_value.entity_type = 'module'
     and module_value.entity_id = lesson.parent_id
    where unit.course_id = p_course_id and unit.entity_type = 'study_unit'
      and (v_scope_kind <> 'study_unit' or unit.entity_id = v_scope_ref)
  ),
  scope_units as materialized (
    select unit.*,
      row_number() over(order by unit.module_position,unit.lesson_position,
        unit.microsequence_position,unit.position,unit.entity_id)::integer
        as analytics_position
    from scope_units_unordered unit
  ),
  scope_options as materialized (
    select 'course'::text as kind,null::text as ref,v_course.title as label,
      0::integer as kind_order,0::integer as first_order,0::integer as second_order,
      0::integer as third_order,0::integer as fourth_order,''::text as tie
    union all
    select 'authoring_part',part.id::text,part.title,1,part.position,0,0,0,part.id::text
    from private.course_authoring_parts part
    where part.course_id = p_course_id
    union all
    select 'didactic_microsequence',microsequence.entity_id,
      microsequence.content->>'title',2,module_value.position,lesson.position,
      microsequence.position,0,microsequence.entity_id
    from private.course_entities microsequence
    join private.course_entities lesson
      on lesson.course_id = microsequence.course_id and lesson.entity_type = 'lesson'
     and lesson.entity_id = microsequence.parent_id
    join private.course_entities module_value
      on module_value.course_id = lesson.course_id and module_value.entity_type = 'module'
     and module_value.entity_id = lesson.parent_id
    where microsequence.course_id = p_course_id
      and microsequence.entity_type = 'microsequence'
    union all
    select 'study_unit',unit.entity_id,unit.content->>'title',3,
      module_value.position,lesson.position,microsequence.position,unit.position,
      unit.entity_id
    from private.course_entities unit
    join private.course_entities microsequence
      on microsequence.course_id = unit.course_id
     and microsequence.entity_type = 'microsequence'
     and microsequence.entity_id = unit.parent_id
    join private.course_entities lesson
      on lesson.course_id = microsequence.course_id and lesson.entity_type = 'lesson'
     and lesson.entity_id = microsequence.parent_id
    join private.course_entities module_value
      on module_value.course_id = lesson.course_id and module_value.entity_type = 'module'
     and module_value.entity_id = lesson.parent_id
    where unit.course_id = p_course_id and unit.entity_type = 'study_unit'
  ),
  current_design as materialized (
    select unit.entity_id as study_unit_id,
      unit.design_snapshot as snapshot,unit.design_application as application
    from scope_units unit
    where jsonb_typeof(unit.design_snapshot) = 'object'
      and jsonb_typeof(unit.design_application) = 'object'
      and jsonb_typeof(unit.design_snapshot->'appliedAt') = 'string'
      and (unit.design_snapshot->>'appliedAt')::timestamptz >= unit.updated_at
  ),
  parameter_value_rows as materialized (
    select parameter.value->>'parameterId' as parameter_id,
      parameter.value->'value' as value,parameter.value->>'origin' as origin,
      count(distinct design.study_unit_id)::integer as study_unit_count
    from current_design design
    cross join lateral jsonb_array_elements(design.snapshot->'parameters') parameter(value)
    group by parameter.value->>'parameterId',parameter.value->'value',
      parameter.value->>'origin'
  ),
  editorial_per_unit as materialized (
    select design.study_unit_id,
      case when char_length(editorial.raw_direction) <= 4000
        then editorial.raw_direction else null end as direction,
      case when char_length(editorial.raw_direction) > 4000 then null
        when editorial.origin_count = 1 then editorial.single_origin
        when editorial.origin_count > 1 then 'mixed' else null end as origin,
      char_length(editorial.raw_direction) > 4000 as truncated
    from current_design design
    left join lateral (
      select string_agg(direction.value->>'direction',E'\n\n'
          order by direction.ordinal) as raw_direction,
        count(distinct direction.value->>'origin')::integer as origin_count,
        min(direction.value->>'origin') as single_origin
      from jsonb_array_elements(design.snapshot->'editorialDirections')
        with ordinality direction(value,ordinal)
    ) editorial on true
  ),
  editorial_rows as materialized (
    select editorial.direction,editorial.origin,count(*)::integer as study_unit_count
    from editorial_per_unit editorial
    group by editorial.direction,editorial.origin
  ),
  authorized_analysis as materialized (
    select distinct item.id as analysis_id,item.position+1 as position,item.statement
    from current_design design
    cross join lateral jsonb_array_elements_text(
      design.snapshot->'instructionalAnalysisUnitIds'
    ) requested(value)
    join private.course_instructional_plan_items item
      on item.course_id = p_course_id
     and item.item_kind = 'instructional_analysis_unit'
     and item.id::text = requested.value
  ),
  introduction_rows as materialized (
    select design.study_unit_id,introduction.value as analysis_id
    from current_design design
    cross join lateral jsonb_array_elements_text(
      design.application->'introducedInstructionalAnalysisUnitIds'
    ) introduction(value)
  ),
  explanation_rows as materialized (
    select design.study_unit_id,form.value as form
    from current_design design
    cross join lateral jsonb_array_elements(
      design.application->'explanationApplications'
    ) explanation(value)
    cross join lateral jsonb_array_elements_text(
      explanation.value->'developedForms'
    ) form(value)
  ),
  component_rows as materialized (
    select unit.entity_id as study_unit_id,
      (instance.value->>'package')||'@'||(instance.value->>'version') as component_ref
    from scope_units unit
    cross join lateral (
      select content.value from jsonb_array_elements(unit.content->'content') content(value)
      union all
      select unit.content->'response'
      where jsonb_typeof(unit.content->'response') = 'object'
      union all
      select feedback.value
      from jsonb_array_elements(unit.content->'feedback') feedback(value)
    ) instance(value)
    where jsonb_typeof(instance.value) = 'object'
      and nullif(instance.value->>'package','') is not null
      and nullif(instance.value->>'version','') is not null
  ),
  authorized_evidence as materialized (
    select distinct item.id as evidence_id,item.position+1 as position,item.statement
    from current_design design
    cross join lateral jsonb_array_elements_text(
      design.snapshot->'evidenceRequirementIds'
    ) requested(value)
    join private.course_instructional_plan_items item
      on item.course_id = p_course_id
     and item.item_kind = 'evidence_requirement'
     and item.id::text = requested.value
  ),
  practice_rows as materialized (
    select design.study_unit_id,
      practice.value->>'evidenceRequirementId' as evidence_id,
      practice.value->>'opportunityId' as opportunity_id,
      practice.value->'variedDimensions' as varied_dimensions
    from current_design design
    cross join lateral jsonb_array_elements(
      design.application->'practiceApplications'
    ) practice(value)
  ),
  variation_rows as materialized (
    select practice.evidence_id,practice.opportunity_id,dimension.value as dimension
    from practice_rows practice
    cross join lateral jsonb_array_elements_text(
      practice.varied_dimensions
    ) dimension(value)
  ),
  effective_attributions as materialized (
    select unit.entity_id as study_unit_id,attribution.id as attribution_id
    from scope_units unit
    join lateral (
      select effective.id
      from private.course_effective_source_attribution_v1(
        p_course_id,'study_unit',unit.entity_id
      ) effective
    ) attribution on true
  ),
  source_role_rows as materialized (
    select source_link.relation as role,
      count(distinct source_link.source_id)::integer as source_count,
      count(distinct anchor_link.anchor_id)::integer as anchor_count,
      count(distinct attribution.study_unit_id)::integer as study_unit_count
    from effective_attributions attribution
    join private.course_source_attribution_sources source_link
      on source_link.course_id = p_course_id
     and source_link.attribution_id = attribution.attribution_id
    left join private.course_source_attribution_anchors anchor_link
      on anchor_link.course_id = source_link.course_id
     and anchor_link.attribution_id = source_link.attribution_id
     and anchor_link.source_ordinal = source_link.source_ordinal
    group by source_link.relation
  ),
  scope_annotations as materialized (
    select annotation.*
    from private.course_anchored_annotations annotation
    where annotation.course_id = p_course_id
      and annotation.origin in('author','learner','reviewer')
      and (
        v_scope_kind = 'course'
        or annotation.target_kind = 'study_unit' and exists(
          select 1 from scope_units unit where unit.entity_id = annotation.target_id
        )
        or v_scope_kind in('authoring_part','didactic_microsequence')
          and annotation.target_kind = 'didactic_microsequence' and exists(
          select 1 from selected_microsequences microsequence
          where microsequence.entity_id = annotation.target_id
        )
      )
  ),
  relevant_parameter_assignments as materialized (
    select assignment.parameter_id,assignment.scope_kind,assignment.scope_ref
    from private.course_design_parameter_assignments assignment
    where assignment.course_id = p_course_id
      and assignment.origin in('author','research_condition')
      and (
        v_scope_kind = 'course'
        or assignment.scope_kind = 'course'
        or assignment.scope_kind = 'lesson' and exists(
          select 1 from selected_microsequences microsequence
          where microsequence.lesson_id = assignment.scope_ref
        )
        or assignment.scope_kind = 'didactic_microsequence' and exists(
          select 1 from selected_microsequences microsequence
          where microsequence.entity_id = assignment.scope_ref
        )
        or assignment.scope_kind = 'study_unit' and exists(
          select 1 from scope_units unit where unit.entity_id=assignment.scope_ref
        )
      )
  ),
  origin_changes as materialized (
    select origin.origin,
      count(*) filter(where unit.created_origin = origin.origin)::integer as created_count,
      count(*) filter(where unit.version > 1
        and unit.last_revision_origin = origin.origin)::integer as revised_count
    from (values('human'::text),('gpt'::text)) origin(origin)
    cross join scope_units unit
    group by origin.origin
    having count(*) filter(where unit.created_origin = origin.origin
      or unit.version > 1 and unit.last_revision_origin = origin.origin) > 0
  ),
  missing_rows as materialized (
    select format('%s StudyUnits não possuem aplicação pedagógica corrente.',
      count(*)::integer) as message
    from scope_units unit
    where not exists(
      select 1 from current_design design where design.study_unit_id = unit.entity_id
    )
    having count(*) > 0
    union all
    select format('%s StudyUnits não possuem os quatro parâmetros usados.',
      count(*)::integer)
    from scope_units unit
    left join current_design design on design.study_unit_id = unit.entity_id
    where design.study_unit_id is null
      or jsonb_array_length(design.snapshot->'parameters') <> 4
    having count(*) > 0
    union all
    select format('%s direções editoriais excederam o limite do snapshot.',
      count(*)::integer)
    from editorial_per_unit editorial where editorial.truncated
    having count(*) > 0
    union all
    select 'Há mudanças de StudyUnit sem origem explicitamente observável.'
    where exists(
      select 1 from scope_units unit
      where unit.created_origin is null
        or unit.version > 1 and unit.last_revision_origin is null
    )
  )
  select jsonb_build_object(
    'contract','aralearn.course-authoring-analytics.v2',
    'course',jsonb_build_object(
      'id',v_course.id,'revision',v_course.revision,'title',v_course.title
    ),
    'scope',jsonb_build_object(
      'selected',jsonb_build_object(
        'kind',v_scope_kind,'ref',v_scope_ref,'label',v_scope_label
      ),
      'options',coalesce((select jsonb_agg(jsonb_build_object(
        'kind',option_value.kind,'ref',option_value.ref,'label',option_value.label
      ) order by option_value.kind_order,option_value.first_order,
        option_value.second_order,option_value.third_order,
        option_value.fourth_order,option_value.tie)
        from scope_options option_value),'[]'::jsonb)
    ),
    'design',jsonb_build_object(
      'studyUnitCount',(select count(*)::integer from scope_units),
      'parameters',coalesce((select jsonb_agg(jsonb_build_object(
        'parameterId',definition.parameter_id,
        'label',definition.definition->>'label',
        'valueKind',case definition.value_kind when 'set' then 'string_list'
          else definition.value_kind end,
        'effectiveValues',coalesce((select jsonb_agg(jsonb_build_object(
          'value',value_row.value,'origin',value_row.origin,
          'studyUnitCount',value_row.study_unit_count
        ) order by value_row.value::text,value_row.origin nulls first)
          from parameter_value_rows value_row
          where value_row.parameter_id = definition.parameter_id),'[]'::jsonb)
      ) order by definition.ordinal)
      from private.course_design_parameter_definitions definition),'[]'::jsonb),
      'editorialDirections',coalesce((select jsonb_agg(jsonb_build_object(
        'direction',editorial.direction,'origin',editorial.origin,
        'studyUnitCount',editorial.study_unit_count
      ) order by editorial.direction nulls first,editorial.origin nulls first)
        from editorial_rows editorial),'[]'::jsonb),
      'analysisUnits',coalesce((select jsonb_agg(jsonb_build_object(
        'position',analysis.position,'statement',analysis.statement,
        'introductionCount',coalesce((select count(*)::integer
          from introduction_rows introduction
          where introduction.analysis_id = analysis.analysis_id::text),0)
      ) order by analysis.position)
        from authorized_analysis analysis),'[]'::jsonb),
      'introductionsByStudyUnit',coalesce((select jsonb_agg(jsonb_build_object(
        'studyUnitRef',unit.entity_id,'position',unit.analytics_position,
        'title',unit.content->>'title','introducedCount',coalesce((
          select count(*)::integer from introduction_rows introduction
          where introduction.study_unit_id = unit.entity_id
        ),0)
      ) order by unit.analytics_position)
        from scope_units unit),'[]'::jsonb),
      'explanationForms',coalesce((select jsonb_agg(jsonb_build_object(
        'form',form.form,'studyUnitCount',form.study_unit_count,
        'applicationCount',form.application_count
      ) order by form.form)
        from (select explanation.form,
          count(distinct explanation.study_unit_id)::integer as study_unit_count,
          count(*)::integer as application_count
          from explanation_rows explanation group by explanation.form) form),'[]'::jsonb),
      'components',coalesce((select jsonb_agg(jsonb_build_object(
        'componentRef',component.component_ref,
        'studyUnitCount',component.study_unit_count,
        'instanceCount',component.instance_count
      ) order by component.component_ref)
        from (select instance.component_ref,
          count(distinct instance.study_unit_id)::integer as study_unit_count,
          count(*)::integer as instance_count
          from component_rows instance group by instance.component_ref) component),'[]'::jsonb),
      'practiceByRequirement',coalesce((select jsonb_agg(jsonb_build_object(
        'position',evidence.position,'statement',evidence.statement,
        'opportunityCount',coalesce((select count(distinct practice.opportunity_id)::integer
          from practice_rows practice
          where practice.evidence_id = evidence.evidence_id::text),0)
      ) order by evidence.position)
        from authorized_evidence evidence),'[]'::jsonb),
      'practiceVariationDimensions',coalesce((select jsonb_agg(jsonb_build_object(
        'dimension',variation.dimension,
        'opportunityCount',variation.opportunity_count
      ) order by variation.dimension)
        from (select item.dimension,
          count(distinct (item.evidence_id,item.opportunity_id))::integer
            as opportunity_count
          from variation_rows item group by item.dimension) variation),'[]'::jsonb),
      'sourcesByRole',coalesce((select jsonb_agg(jsonb_build_object(
        'role',source_role.role,'sourceCount',source_role.source_count,
        'anchorCount',source_role.anchor_count,
        'studyUnitCount',source_role.study_unit_count
      ) order by source_role.role)
        from source_role_rows source_role),'[]'::jsonb)
    ),
    'authorship',jsonb_build_object(
      'observations',jsonb_build_object(
        'createdCount',(select count(*)::integer from scope_annotations),
        'openCount',(select count(*)::integer from scope_annotations
          where state in('open','considered')),
        'resolvedCount',(select count(*)::integer from scope_annotations
          where state = 'resolved')
      ),
      'explicitParameterOverrideCount',(
        select count(*)::integer from relevant_parameter_assignments
      ),
      'manuallyRevisedStudyUnitCount',(
        select count(*)::integer from scope_units unit
        where unit.version > 1 and unit.last_revision_origin = 'human'
      ),
      'studyUnitsByOrigin',coalesce((select jsonb_agg(jsonb_build_object(
        'origin',change.origin,'createdCount',change.created_count,
        'lastRevisedCount',change.revised_count
      ) order by change.origin) from origin_changes change),'[]'::jsonb)
    ),
    'missingData',coalesce((select jsonb_agg(missing.message order by missing.message)
      from missing_rows missing),'[]'::jsonb),
    'deepLink',null
  ) into v_result;
  return v_result;
end;
$function$;

revoke all on function public.get_owned_course_authoring_analytics_for_actor_v2(
  uuid,uuid,bigint,jsonb
) from public,anon,authenticated,service_role;
grant execute on function public.get_owned_course_authoring_analytics_for_actor_v2(
  uuid,uuid,bigint,jsonb
) to service_role;

-- Estado final explícito de public.create_course_for_actor_v1(uuid,text,text,text)
CREATE OR REPLACE FUNCTION public.create_course_for_actor_v1(p_actor_id uuid, p_title text, p_objective text, p_request_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'auth', 'extensions'
AS $function$
declare
  v_hash text;
  v_receipt private.course_change_receipts%rowtype;
  v_course public.courses%rowtype;
  v_plan private.course_instructional_plans%rowtype;
  v_result jsonb;
begin
  perform private.require_service_role();
  if p_actor_id is null
     or not exists(select 1 from auth.users account where account.id = p_actor_id)
     or coalesce(p_title ~ '[^[:space:]]', false) is not true
     or char_length(btrim(p_title)) > 300
     or translate(btrim(p_title), E'\n\r\t', '') ~ '[[:cntrl:]]'
     or coalesce(p_objective ~ '[^[:space:]]', false) is not true
     or char_length(btrim(p_objective)) > 2000
     or translate(btrim(p_objective), E'\n\r\t', '') ~ '[[:cntrl:]]'
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'Criação de Curso inválida.' using errcode = '22023';
  end if;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'operation', 'create_course',
    'actorId', p_actor_id,
    'title', btrim(p_title),
    'objective', btrim(p_objective)
  )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:' || p_actor_id::text || ':' || p_request_id, 0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  select * into v_receipt
  from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'create_course'
       or v_receipt.request_hash <> v_hash then
      raise exception 'requestId reutilizado com comando incompatível.'
        using errcode = '23514';
    end if;
    return (v_receipt.result - 'idempotent') || jsonb_build_object(
      'idempotent', true
    );
  end if;
  insert into public.courses(id, owner_id, title, goal, revision)
  values(
    extensions.gen_random_uuid(), p_actor_id,
    btrim(p_title), btrim(p_objective), 1
  ) returning * into v_course;
  insert into private.course_instructional_plans(
    course_id, audience, instructional_scope,
    preferred_authoring_part_min, preferred_authoring_part_max,
    part_count_origin, version
  ) values(
    v_course.id, '', '', 7, 12, 'automatic', 1
  ) returning * into v_plan;
  null;
  v_result := jsonb_build_object(
    'courseId', v_course.id,
    'title', v_course.title,
    'goal', v_course.goal,
    'revision', v_course.revision,
    'instructionalPlanId', v_plan.id,
    'instructionalPlanVersion', v_plan.version,
    'ownership', 'owned',
    'idempotent', false,
    'createdAt', v_course.created_at,
    'updatedAt', v_course.updated_at
  );
  insert into private.course_change_receipts(
    actor_id, request_id, operation, course_id, request_hash, result
  ) values(
    p_actor_id, p_request_id, 'create_course',
    v_course.id, v_hash, v_result
  );
  return v_result;
end;
$function$;

-- Estado final explícito de public.manage_course_access_for_actor_v1(uuid,uuid,text,text,uuid,boolean,text)
CREATE OR REPLACE FUNCTION public.manage_course_access_for_actor_v1(p_actor_id uuid, p_course_id uuid, p_operation text, p_target_email text, p_target_user_id uuid, p_confirmed boolean, p_request_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'auth', 'extensions'
AS $function$
declare
  v_course public.courses%rowtype;
  v_target_user_id uuid;
  v_target_email text;
  v_hash text;
  v_receipt private.course_change_receipts%rowtype;
  v_profile public.person_profiles%rowtype;
  v_changed boolean:=false;
  v_attempt_count bigint;
  v_rate_allowed boolean:=true;
  v_grant_outcome text:='unchanged';
  v_result jsonb;
  v_now timestamptz:=statement_timestamp();
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_operation not in('grant_access','revoke_access')
     or p_confirmed is distinct from true
     or p_request_id is null
     or p_request_id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'Alteracao de acesso invalida.' using errcode='22023';
  end if;
  if p_operation='grant_access' then
    if p_target_user_id is not null
       or p_target_email is null
       or p_target_email<>btrim(p_target_email)
       or char_length(p_target_email) not between 3 and 254
       or p_target_email!~'^[^[:space:]@]+@[^[:space:]@]+$' then
      raise exception 'E-mail exato invalido.' using errcode='22023';
    end if;
    v_target_email:=lower(p_target_email);
  else
    if p_target_user_id is null or p_target_email is not null then
      raise exception 'Pessoa de acesso invalida.' using errcode='22023';
    end if;
    v_target_user_id:=p_target_user_id;
  end if;

  -- O replay de uma concessao nao precisa conservar sequer um hash de e-mail.
  -- Reutilizar o mesmo requestId devolve o primeiro aceite e nao tenta outro alvo.
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'courseId',p_course_id,
    'operation',p_operation,
    'target',case when p_operation='grant_access'
      then null else v_target_user_id::text end,
    'confirmed',true
  )::text,'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:'||p_actor_id::text||':'||p_request_id,0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id=p_actor_id and receipt.request_id=p_request_id
    and receipt.expires_at<=v_now;
  select * into v_receipt
  from private.course_change_receipts receipt
  where receipt.actor_id=p_actor_id and receipt.request_id=p_request_id
    and receipt.expires_at>v_now;
  if found then
    if v_receipt.operation<>p_operation or v_receipt.course_id<>p_course_id
       or (p_operation='revoke_access' and v_receipt.request_hash<>v_hash) then
      raise exception 'requestId reutilizado com comando incompativel.'
        using errcode='23514';
    end if;
    if p_operation='grant_access' then
      return jsonb_build_object(
        'contract','aralearn.course-access-grant-request.v1',
        'courseId',p_course_id,'operation','grant_access',
        'accepted',true,'idempotent',true
      );
    end if;
    return (v_receipt.result-'idempotent')||jsonb_build_object(
      'idempotent',true
    );
  end if;

  select * into strict v_course
  from public.courses course where course.id=p_course_id;

  if p_operation='grant_access' then
    perform pg_advisory_xact_lock(hashtextextended(
      'course-access-grant-rate:'||p_actor_id::text,0
    ));
    insert into private.course_access_grant_rate_limits(
      actor_id,window_started_at,attempt_count,last_attempt_at
    ) values(p_actor_id,v_now,1,v_now)
    on conflict(actor_id) do update set
      window_started_at=case
        when private.course_access_grant_rate_limits.window_started_at
          <=v_now-interval '10 minutes' then v_now
        else private.course_access_grant_rate_limits.window_started_at end,
      attempt_count=case
        when private.course_access_grant_rate_limits.window_started_at
          <=v_now-interval '10 minutes' then 1
        else private.course_access_grant_rate_limits.attempt_count+1 end,
      granted_count=case
        when private.course_access_grant_rate_limits.window_started_at
          <=v_now-interval '10 minutes' then 0
        else private.course_access_grant_rate_limits.granted_count end,
      no_match_count=case
        when private.course_access_grant_rate_limits.window_started_at
          <=v_now-interval '10 minutes' then 0
        else private.course_access_grant_rate_limits.no_match_count end,
      unchanged_count=case
        when private.course_access_grant_rate_limits.window_started_at
          <=v_now-interval '10 minutes' then 0
        else private.course_access_grant_rate_limits.unchanged_count end,
      rate_limited_count=case
        when private.course_access_grant_rate_limits.window_started_at
          <=v_now-interval '10 minutes' then 0
        else private.course_access_grant_rate_limits.rate_limited_count end,
      last_attempt_at=v_now
    returning attempt_count into v_attempt_count;
    v_rate_allowed:=v_attempt_count<=10;
    if v_rate_allowed then
      select auth_user.id into v_target_user_id
      from auth.users auth_user
      join public.person_profiles profile on profile.user_id=auth_user.id
      where lower(auth_user.email)=v_target_email;
      if not found then
        v_grant_outcome:='no_match';
      else
        perform pg_advisory_xact_lock(hashtextextended(
          'account-delete:'||v_target_user_id::text,0
        ));
        -- A exclusao da conta usa o mesmo lock. Depois da espera, releia Auth
        -- e perfil antes de persistir relacao, evento ou receipt com esse UUID.
        perform 1
        from auth.users auth_user
        join public.person_profiles profile on profile.user_id=auth_user.id
        where auth_user.id=v_target_user_id
          and lower(auth_user.email)=v_target_email;
        if not found then
          v_target_user_id:=null;
          v_grant_outcome:='no_match';
        elsif v_target_user_id=v_course.owner_id then
          v_grant_outcome:='unchanged';
        else
          perform pg_advisory_xact_lock(hashtextextended(
            'course-access:'||p_course_id::text||':'||v_target_user_id::text,0
          ));
          insert into public.course_access(course_id,user_id,granted_by)
          values(p_course_id,v_target_user_id,p_actor_id)
          on conflict(course_id,user_id) do nothing;
          v_changed:=found;
          v_grant_outcome:=case when v_changed then 'granted' else 'unchanged' end;
        end if;
      end if;
    else
      v_grant_outcome:='rate_limited';
    end if;
    update private.course_access_grant_rate_limits rate_value set
      granted_count=rate_value.granted_count+
        case when v_grant_outcome='granted' then 1 else 0 end,
      no_match_count=rate_value.no_match_count+
        case when v_grant_outcome='no_match' then 1 else 0 end,
      unchanged_count=rate_value.unchanged_count+
        case when v_grant_outcome='unchanged' then 1 else 0 end,
      rate_limited_count=rate_value.rate_limited_count+
        case when v_grant_outcome='rate_limited' then 1 else 0 end
    where rate_value.actor_id=p_actor_id;
  else
    if v_target_user_id=v_course.owner_id then
      raise exception 'O proprietario ja possui acesso ao Curso.'
        using errcode='23514';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(
      'account-delete:'||v_target_user_id::text,0
    ));
    perform pg_advisory_xact_lock(hashtextextended(
      'course-access:'||p_course_id::text||':'||v_target_user_id::text,0
    ));
    select profile.* into v_profile
    from auth.users auth_user
    join public.person_profiles profile on profile.user_id=auth_user.id
    where auth_user.id=v_target_user_id;
    if not found then
      raise exception 'Perfil inexistente.' using errcode='PT404';
    end if;
    delete from public.course_access access_value
    where access_value.course_id=p_course_id
      and access_value.user_id=v_target_user_id;
    v_changed:=found;
  end if;

  if v_changed then
    null;
  end if;

  if p_operation='grant_access' then
    v_result:=jsonb_build_object(
      'contract','aralearn.course-access-grant-request.v1',
      'courseId',p_course_id,'operation','grant_access',
      'accepted',true,'idempotent',false
    );
  else
    v_result:=jsonb_build_object(
      'contract','aralearn.course-access-change.v1',
      'courseId',p_course_id,'operation',p_operation,
      'changed',v_changed,
      'person',jsonb_build_object(
        'userId',v_profile.user_id,
        'displayName',v_profile.display_name,
        'avatarObjectKey',v_profile.avatar_object_key
      ),
      'idempotent',false
    );
  end if;
  insert into private.course_change_receipts(
    actor_id,request_id,operation,course_id,request_hash,result
  ) values(p_actor_id,p_request_id,p_operation,p_course_id,v_hash,v_result);
  return v_result;
end;
$function$;

-- Estado final explícito de private.commit_course_composition_core_v1(uuid,uuid,bigint,jsonb,jsonb,text)
CREATE OR REPLACE FUNCTION private.commit_course_composition_core_v1(p_actor_id uuid, p_course_id uuid, p_expected_revision bigint, p_upserts jsonb, p_deletes jsonb, p_request_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'auth', 'extensions'
AS $function$
declare
  v_hash text;
  v_receipt private.course_change_receipts%rowtype;
  v_course public.courses%rowtype;
  v_upserts jsonb := coalesce(p_upserts, '[]'::jsonb);
  v_deletes jsonb := coalesce(p_deletes, '[]'::jsonb);
  v_created_count integer := 0;
  v_updated_count integer := 0;
  v_deleted_count integer := 0;
  v_before_entity_count integer;
  v_changed boolean;
  v_affected_lesson_ids text[] := '{}'::text[];
  v_result jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id, p_actor_id, true);
  if p_expected_revision is null or p_expected_revision < 1
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or jsonb_typeof(v_upserts) is distinct from 'array'
     or jsonb_typeof(v_deletes) is distinct from 'array'
     or jsonb_array_length(v_upserts) > 200
     or jsonb_array_length(v_deletes) > 200
     or jsonb_array_length(v_upserts) + jsonb_array_length(v_deletes) < 1
     or pg_column_size(jsonb_build_object(
       'upserts', v_upserts, 'deletes', v_deletes
     )) > 524288 then
    raise exception 'Lote de composição do Curso inválido.' using errcode = '22023';
  end if;
  if exists(
    select 1 from jsonb_array_elements(v_upserts) item(value)
    where jsonb_typeof(item.value) is distinct from 'object'
      or item.value - 'entityType' - 'entityId' - 'parentType'
        - 'parentId' - 'position' - 'content' <> '{}'::jsonb
      or not (item.value ?& array[
        'entityType', 'entityId', 'parentType', 'parentId',
        'position', 'content'
      ])
      or item.value->>'entityType' not in (
        'module', 'lesson', 'topic', 'microsequence', 'study_unit'
      )
      or nullif(btrim(item.value->>'entityId'), '') is null
      or item.value->>'entityId' <> btrim(item.value->>'entityId')
      or char_length(item.value->>'entityId') > 240
      or item.value->>'entityId' ~ '[[:cntrl:]]'
      or jsonb_typeof(item.value->'position') is distinct from 'number'
      or item.value->>'position' !~ '^-?[0-9]+$'
      or jsonb_typeof(item.value->'content') is distinct from 'object'
      or (
        item.value->>'entityType' in ('module', 'lesson', 'microsequence')
        and (
          jsonb_typeof(item.value->'content'->'title')
            is distinct from 'string'
          or coalesce(
            item.value#>>'{content,title}' ~ '[^[:space:]]', false
          ) is not true
          or char_length(item.value#>>'{content,title}') > 300
          or translate(item.value#>>'{content,title}', E'\n\r\t', '')
            ~ '[[:cntrl:]]'
        )
      )
  ) or exists(
    select 1 from jsonb_array_elements(v_deletes) item(value)
    where jsonb_typeof(item.value) is distinct from 'object'
      or item.value - 'entityType' - 'entityId' <> '{}'::jsonb
      or not (item.value ?& array['entityType', 'entityId'])
      or item.value->>'entityType' not in (
        'module', 'lesson', 'topic', 'microsequence', 'study_unit'
      )
      or nullif(btrim(item.value->>'entityId'), '') is null
      or item.value->>'entityId' <> btrim(item.value->>'entityId')
      or char_length(item.value->>'entityId') > 240
      or item.value->>'entityId' ~ '[[:cntrl:]]'
  ) or (
    select count(*) <> count(distinct (
      item.value->>'entityType', item.value->>'entityId'
    )) from jsonb_array_elements(v_upserts) item(value)
  ) or (
    select count(*) <> count(distinct (
      item.value->>'entityType', item.value->>'entityId'
    )) from jsonb_array_elements(v_deletes) item(value)
  ) or exists(
    select 1
    from jsonb_array_elements(v_upserts) upsert_item(value)
    join jsonb_array_elements(v_deletes) delete_item(value)
      on delete_item.value->>'entityType' = upsert_item.value->>'entityType'
     and delete_item.value->>'entityId' = upsert_item.value->>'entityId'
  ) then
    raise exception 'Entidade da composição inválida ou repetida.'
      using errcode = '22023';
  end if;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'courseId', p_course_id,
    'expectedRevision', p_expected_revision,
    'upserts', v_upserts,
    'deletes', v_deletes
  )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:' || p_actor_id::text || ':' || p_request_id, 0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  select * into v_receipt
  from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'commit_course_composition'
       or v_receipt.course_id <> p_course_id
       or v_receipt.request_hash <> v_hash then
      raise exception 'requestId reutilizado com comando incompatível.'
        using errcode = '23514';
    end if;
    return (v_receipt.result - 'idempotent') || jsonb_build_object(
      'idempotent', true
    );
  end if;
  perform 1 from auth.users actor where actor.id=p_actor_id for key share;
  if not found then
    raise exception 'Pessoa inexistente ou inacessível.' using errcode='PT404';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'course-row:' || p_course_id::text, 0
  ));
  select * into strict v_course
  from public.courses course where course.id = p_course_id for update;
  if v_course.revision <> p_expected_revision then
    raise exception 'O Curso mudou; releia antes de salvar.'
      using errcode = '40001';
  end if;
  select count(*)::integer into v_before_entity_count
  from private.course_entities entity where entity.course_id = p_course_id;
  with changed as materialized (
    select item.value->>'entityType' as entity_type,
      item.value->>'entityId' as entity_id
    from jsonb_array_elements(v_upserts) item(value)
    union all
    select item.value->>'entityType', item.value->>'entityId'
    from jsonb_array_elements(v_deletes) item(value)
  ), current_affected as materialized (
    select case
      when entity.entity_type = 'lesson' then entity.entity_id
      when entity.entity_type in ('topic', 'microsequence')
        then entity.parent_id
      when entity.entity_type = 'study_unit'
        then current_microsequence.parent_id
    end as lesson_id
    from changed
    join private.course_entities entity
      on entity.course_id = p_course_id
     and entity.entity_type = changed.entity_type
     and entity.entity_id = changed.entity_id
    left join private.course_entities current_microsequence
      on entity.entity_type = 'study_unit'
     and current_microsequence.course_id = entity.course_id
     and current_microsequence.entity_type = 'microsequence'
     and current_microsequence.entity_id = entity.parent_id
  ), upsert_microsequence_parents as materialized (
    select item.value->>'entityId' as microsequence_id,
      nullif(item.value->>'parentId', '') as lesson_id
    from jsonb_array_elements(v_upserts) item(value)
    where item.value->>'entityType' = 'microsequence'
  ), next_affected as materialized (
    select case item.value->>'entityType'
      when 'lesson' then item.value->>'entityId'
      when 'topic' then nullif(item.value->>'parentId', '')
      when 'microsequence' then nullif(item.value->>'parentId', '')
      when 'study_unit' then coalesce(
        upsert_parent.lesson_id, current_parent.parent_id
      )
    end as lesson_id
    from jsonb_array_elements(v_upserts) item(value)
    left join upsert_microsequence_parents upsert_parent
      on item.value->>'entityType' = 'study_unit'
     and upsert_parent.microsequence_id = item.value->>'parentId'
    left join private.course_entities current_parent
      on item.value->>'entityType' = 'study_unit'
     and current_parent.course_id = p_course_id
     and current_parent.entity_type = 'microsequence'
     and current_parent.entity_id = item.value->>'parentId'
  ), affected as (
    select lesson_id from current_affected
    union all
    select lesson_id from next_affected
  )
  select coalesce(
    array_agg(distinct affected.lesson_id order by affected.lesson_id),
    '{}'::text[]
  ) into v_affected_lesson_ids
  from affected where affected.lesson_id is not null;
  select
    count(*) filter(where entity.course_id is null)::integer,
    count(*) filter(
      where entity.course_id is not null
        and row(
          entity.parent_type, entity.parent_id,
          entity.position, entity.content
        ) is distinct from row(
          nullif(item.value->>'parentType', ''),
          nullif(item.value->>'parentId', ''),
          (item.value->>'position')::integer,
          item.value->'content'
        )
    )::integer
  into v_created_count, v_updated_count
  from jsonb_array_elements(v_upserts) item(value)
  left join private.course_entities entity
    on entity.course_id = p_course_id
   and entity.entity_type = item.value->>'entityType'
   and entity.entity_id = item.value->>'entityId';
  delete from private.course_entities entity
  using jsonb_array_elements(v_deletes) deletion(value)
  where entity.course_id = p_course_id
    and entity.entity_type = deletion.value->>'entityType'
    and entity.entity_id = deletion.value->>'entityId';
  select v_before_entity_count - count(*)::integer
  into v_deleted_count
  from private.course_entities entity where entity.course_id = p_course_id;
  insert into private.course_entities(
    course_id, entity_type, entity_id, parent_type, parent_id,
    position, content, version, created_at, updated_at
  )
  select p_course_id, item.value->>'entityType', item.value->>'entityId',
    nullif(item.value->>'parentType', ''),
    nullif(item.value->>'parentId', ''),
    (item.value->>'position')::integer, item.value->'content',
    1, now(), now()
  from jsonb_array_elements(v_upserts) item(value)
  on conflict(course_id, entity_type, entity_id) do update set
    parent_type = excluded.parent_type,
    parent_id = excluded.parent_id,
    position = excluded.position,
    content = excluded.content,
    version = private.course_entities.version + 1,
    updated_at = now()
  where row(
    private.course_entities.parent_type,
    private.course_entities.parent_id,
    private.course_entities.position,
    private.course_entities.content
  ) is distinct from row(
    excluded.parent_type, excluded.parent_id,
    excluded.position, excluded.content
  );
  if exists(
    select 1 from private.course_entities entity
    where entity.course_id = p_course_id
      and entity.parent_type is not null
      and not exists(
        select 1 from private.course_entities parent
        where parent.course_id = entity.course_id
          and parent.entity_type = entity.parent_type
          and parent.entity_id = entity.parent_id
      )
  ) or exists(
    select 1 from private.course_entities entity
    where entity.course_id = p_course_id and entity.entity_type <> 'study_unit'
    group by entity.parent_type, entity.parent_id, entity.entity_type
    having min(entity.position) <> 0
      or max(entity.position) <> count(*) - 1
      or count(distinct entity.position) <> count(*)
  ) then
    raise exception 'A alteração produziria estrutura de Curso inválida.'
      using errcode = '23514';
  end if;
  perform private.assert_course_lesson_dependencies_v1(
    p_course_id, v_affected_lesson_ids
  );
  v_changed := v_created_count + v_updated_count + v_deleted_count > 0;
  if v_changed then
    update public.courses course
    set revision = course.revision + 1, updated_at = now()
    where course.id = p_course_id returning * into v_course;
    null;
  end if;
  v_result := jsonb_build_object(
    'courseId', p_course_id,
    'revision', v_course.revision,
    'operation', 'commit_course_composition',
    'createdCount', v_created_count,
    'updatedCount', v_updated_count,
    'upsertedCount', v_created_count + v_updated_count,
    'deletedCount', v_deleted_count,
    'idempotent', false,
    'updatedAt', v_course.updated_at
  );
  insert into private.course_change_receipts(
    actor_id, request_id, operation, course_id, request_hash, result
  ) values(
    p_actor_id, p_request_id, 'commit_course_composition',
    p_course_id, v_hash, v_result
  );
  return v_result;
end;
$function$;

-- Estado final explícito de public.commit_course_composition_for_actor_v1(uuid,uuid,bigint,jsonb,jsonb,jsonb,text)
CREATE OR REPLACE FUNCTION public.commit_course_composition_for_actor_v1(p_actor_id uuid, p_course_id uuid, p_expected_revision bigint, p_upserts jsonb, p_deletes jsonb, p_source_attribution_applications jsonb, p_request_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'extensions'
AS $function$
declare
  v_hash text;
  v_receipt private.course_change_receipts%rowtype;
  v_result jsonb;
  v_application record;
  v_entity private.course_entities%rowtype;
  v_upsert jsonb;
  v_application_states jsonb := '[]'::jsonb;
  v_state jsonb;
  v_assignment jsonb;
  v_attribution_changed_count integer := 0;
  v_course public.courses%rowtype;
  v_target_version bigint;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_revision is null or p_expected_revision < 1
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or jsonb_typeof(p_upserts) <> 'array'
     or jsonb_typeof(p_deletes) <> 'array'
     or jsonb_typeof(p_source_attribution_applications) <> 'array'
     or jsonb_array_length(p_source_attribution_applications) > 64
     or octet_length(p_source_attribution_applications::text) > 196608
     or exists(
       select 1
       from jsonb_array_elements(p_source_attribution_applications)
         application(value)
       where jsonb_typeof(application.value) <> 'object'
         or application.value - 'studyUnitId' - 'sourceLinks' <> '{}'::jsonb
         or not (application.value ?& array['studyUnitId','sourceLinks'])
         or jsonb_typeof(application.value->'studyUnitId') <> 'string'
         or char_length(application.value->>'studyUnitId') not between 1 and 240
         or not private.valid_course_source_links_shape_v2(
           application.value->'sourceLinks'
         )
     )
     or (
       select count(*) <> count(distinct application.value->>'studyUnitId')
       from jsonb_array_elements(p_source_attribution_applications)
         application(value)
     )
     or (
       select count(*)
       from jsonb_array_elements(p_upserts) upsert_item(value)
       where upsert_item.value->>'entityType' = 'study_unit'
     ) <> jsonb_array_length(p_source_attribution_applications)
     or exists(
       select 1
       from (
         select candidate.value
         from jsonb_array_elements(p_upserts) candidate(value)
         where candidate.value->>'entityType' = 'study_unit'
       ) upsert_item
       full join jsonb_array_elements(p_source_attribution_applications)
         application(value)
         on application.value->>'studyUnitId' = upsert_item.value->>'entityId'
       where (
         upsert_item.value is not null and application.value is null
       ) or (
         application.value is not null and upsert_item.value is null
       )
     )
     or exists(
       select 1 from jsonb_array_elements(p_upserts) upsert_item(value)
       where upsert_item.value->>'entityType' = 'study_unit'
         and upsert_item.value->'content' ? 'sources'
     ) then
    raise exception 'Composição exige proveniência explícita para cada Unidade.'
      using errcode = '22023';
  end if;
  v_hash := private.course_source_json_hash_v1(jsonb_build_object(
    'courseId',p_course_id,'expectedRevision',p_expected_revision,
    'upserts',p_upserts,'deletes',p_deletes,
    'sourceAttributionApplications',p_source_attribution_applications
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
    if v_receipt.operation <> 'commit_course_composition'
       or v_receipt.course_id <> p_course_id
       or v_receipt.request_hash <> v_hash then
      raise exception 'requestId reutilizado com composição incompatível.'
        using errcode = '23514';
    end if;
    return (v_receipt.result - 'idempotent')
      || jsonb_build_object('idempotent',true);
  end if;

  for v_application in
    select application.value
    from jsonb_array_elements(p_source_attribution_applications)
      with ordinality application(value,ordinal)
    order by application.ordinal
  loop
    select upsert_item.value into strict v_upsert
    from jsonb_array_elements(p_upserts) upsert_item(value)
    where upsert_item.value->>'entityType' = 'study_unit'
      and upsert_item.value->>'entityId'
        = v_application.value->>'studyUnitId';
    select * into v_entity
    from private.course_entities entity
    where entity.course_id = p_course_id
      and entity.entity_type = 'study_unit'
      and entity.entity_id = v_application.value->>'studyUnitId';
    if found then
      v_target_version := v_entity.version + case when row(
        v_entity.parent_type,v_entity.parent_id,v_entity.position,v_entity.content
      ) is distinct from row(
        nullif(v_upsert->>'parentType',''),nullif(v_upsert->>'parentId',''),
        (v_upsert->>'position')::integer,v_upsert->'content'
      ) then 1 else 0 end;
    else
      v_target_version := 1;
    end if;
    v_application_states := v_application_states || jsonb_build_array(
      jsonb_build_object(
        'application',v_application.value,
        'targetVersion',v_target_version
      )
    );
  end loop;

  v_result := private.commit_course_composition_core_v1(
    p_actor_id,p_course_id,p_expected_revision,p_upserts,p_deletes,p_request_id
  );
  for v_application in
    select application.value
    from jsonb_array_elements(v_application_states)
      with ordinality application(value,ordinal)
    order by application.ordinal
  loop
    v_state := private.course_source_target_state_v1(
      p_course_id,'study_unit',
      v_application.value#>>'{application,studyUnitId}'
    );
    if v_state is null then
      raise exception 'A composição não preservou o alvo de proveniência.'
        using errcode = '55000';
    end if;
    v_assignment := private.apply_course_source_attribution_v2(
      p_course_id,'study_unit',
      v_application.value#>>'{application,studyUnitId}',
      (v_state->>'version')::bigint,
      v_application.value#>'{application,sourceLinks}',
      v_state->>'hash'
    );
    if (v_assignment->>'changed')::boolean then
      v_attribution_changed_count := v_attribution_changed_count + 1;
    end if;
  end loop;
  if v_attribution_changed_count > 0 then
    if coalesce((v_result->>'createdCount')::integer,0)
         + coalesce((v_result->>'updatedCount')::integer,0)
         + coalesce((v_result->>'deletedCount')::integer,0) = 0 then
      update public.courses course
      set revision = course.revision + 1,updated_at = now()
      where course.id = p_course_id returning * into v_course;
      null;
      v_result := jsonb_set(v_result,'{revision}',
        to_jsonb(v_course.revision),true);
      v_result := jsonb_set(v_result,'{updatedAt}',
        to_jsonb(v_course.updated_at),true);
    else
      null;
    end if;
    for v_application in
      select application.value
      from jsonb_array_elements(p_source_attribution_applications)
        with ordinality application(value,ordinal)
      order by application.ordinal
    loop
      perform private.assert_course_source_target_citation_budget_v1(
        p_course_id,'study_unit',v_application.value->>'studyUnitId'
      );
    end loop;
  end if;
  update private.course_change_receipts receipt
  set request_hash = v_hash,result = v_result
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  return v_result;
end;
$function$;

-- Estado final explícito de public.commit_course_composition_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,text)
CREATE OR REPLACE FUNCTION public.commit_course_composition_for_actor_v1(p_actor_id uuid, p_course_id uuid, p_expected_revision bigint, p_expected_study_unit_version bigint, p_upserts jsonb, p_deletes jsonb, p_source_attribution_applications jsonb, p_channel text, p_application_origin text, p_request_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'extensions'
AS $function$
declare
  v_entity private.course_entities%rowtype;
  v_upsert jsonb;
  v_result jsonb;
  v_existing_channel text;
  v_existing_origin text;
  v_existing_expected_version bigint;
  v_created_study_unit_ids text[] := array[]::text[];
  v_changed_study_unit_ids text[] := array[]::text[];
  v_change_origin text;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_channel not in ('mcp','application')
     or p_channel = 'mcp' and (
       p_application_origin is not null
       or p_expected_study_unit_version is not null
     )
     or p_channel = 'application' and (
       (p_application_origin is null) <>
         (p_expected_study_unit_version is null)
       or p_application_origin is not null and (
         p_application_origin not in ('manual','provider_assistance')
         or p_expected_study_unit_version < 1
         or jsonb_typeof(p_upserts) <> 'array'
         or jsonb_array_length(p_upserts) <> 1
         or p_upserts->0->>'entityType' <> 'study_unit'
         or jsonb_typeof(p_deletes) <> 'array'
         or jsonb_array_length(p_deletes) <> 0
         or jsonb_typeof(p_source_attribution_applications) <> 'array'
         or jsonb_array_length(p_source_attribution_applications) <> 1
         or p_source_attribution_applications->0->>'studyUnitId'
            <> p_upserts->0->>'entityId'
       )
     ) then
    raise exception 'Canal, origem ou escopo da composição inválido.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:' || p_actor_id::text || ':' || p_request_id,0
  ));
  perform 1
  from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id
    and receipt.expires_at > statement_timestamp();

  if not found and p_channel = 'application'
     and p_application_origin is not null then
    v_upsert := p_upserts->0;
    select * into v_entity
    from private.course_entities entity
    where entity.course_id = p_course_id
      and entity.entity_type = 'study_unit'
      and entity.entity_id = v_upsert->>'entityId';
    if not found then
      raise exception 'Unidade de estudo inexistente.' using errcode = 'PT404';
    end if;
    if v_entity.version <> p_expected_study_unit_version then
      raise exception 'A Unidade mudou; releia antes de salvar.'
        using errcode = '40001';
    end if;
  end if;

  if jsonb_typeof(p_upserts)='array' then
    select coalesce(array_agg(item.value->>'entityId') filter(
        where item.value->>'entityType'='study_unit' and entity.course_id is null
      ),array[]::text[]),
      coalesce(array_agg(item.value->>'entityId') filter(
        where item.value->>'entityType'='study_unit' and(
          entity.course_id is null or row(
            entity.parent_type,entity.parent_id,entity.position,entity.content
          ) is distinct from row(
            nullif(item.value->>'parentType',''),nullif(item.value->>'parentId',''),
            case when item.value->>'position'~'^[0-9]+$'
              then (item.value->>'position')::integer end,item.value->'content'
          )
        )
      ),array[]::text[])
    into v_created_study_unit_ids,v_changed_study_unit_ids
    from jsonb_array_elements(p_upserts) item(value)
    left join private.course_entities entity
      on entity.course_id=p_course_id and entity.entity_type='study_unit'
     and entity.entity_id=item.value->>'entityId';
  end if;

  v_result := public.commit_course_composition_for_actor_v1(
    p_actor_id,p_course_id,p_expected_revision,p_upserts,p_deletes,
    p_source_attribution_applications,p_request_id
  );

  v_existing_channel := v_result->>'channel';
  v_existing_origin := v_result->>'applicationOrigin';
  v_existing_expected_version := case
    when jsonb_typeof(v_result->'expectedStudyUnitVersion') = 'number'
      then (v_result->>'expectedStudyUnitVersion')::bigint
    else null
  end;
  if (v_result->>'idempotent')::boolean and v_existing_channel is not null and (
    v_existing_channel <> p_channel
    or v_existing_origin is distinct from p_application_origin
    or v_existing_expected_version is distinct from p_expected_study_unit_version
  ) then
    raise exception 'requestId reutilizado com origem incompatível.'
      using errcode = '23514';
  end if;
  if (v_result->>'idempotent')::boolean and v_existing_channel is null
     and p_channel <> 'mcp' then
    raise exception 'Receipt anterior não comprova a origem da aplicação.'
      using errcode = '23514';
  end if;

  v_change_origin:=case when p_application_origin='manual'
    then 'human' else 'gpt' end;
  if not (v_result->>'idempotent')::boolean
     and cardinality(v_changed_study_unit_ids)>0 then
    update private.course_entities entity
    set created_origin=case when entity.entity_id=any(v_created_study_unit_ids)
          then coalesce(entity.created_origin,v_change_origin)
        else entity.created_origin end,
      last_revision_origin=v_change_origin,
      design_snapshot=null,
      design_application=null
    where entity.course_id=p_course_id and entity.entity_type='study_unit'
      and entity.entity_id=any(v_changed_study_unit_ids);
  end if;

  v_result := (v_result - 'channel' - 'applicationOrigin'
    - 'expectedStudyUnitVersion') || jsonb_build_object(
      'channel',p_channel,
      'applicationOrigin',p_application_origin,
      'expectedStudyUnitVersion',p_expected_study_unit_version
    );
  update private.course_change_receipts receipt
  set result = v_result
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  null;
  if p_channel = 'mcp' then
    return v_result - 'channel' - 'applicationOrigin'
      - 'expectedStudyUnitVersion';
  end if;
  return v_result;
end;
$function$;

-- Estado final explícito de public.commit_personal_course_copy_edit_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,text,text)
CREATE OR REPLACE FUNCTION public.commit_personal_course_copy_edit_for_actor_v1(p_actor_id uuid, p_source_course_id uuid, p_expected_source_revision bigint, p_expected_study_unit_version bigint, p_upsert jsonb, p_application_origin text, p_request_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_hash text;
  v_receipt private.course_change_receipts%rowtype;
  v_mapping private.course_personal_copies%rowtype;
  v_source_course public.courses%rowtype;
  v_source_unit private.course_entities%rowtype;
  v_target_course public.courses%rowtype;
  v_target_unit private.course_entities%rowtype;
  v_ownership text;
  v_inner_result jsonb;
  v_result jsonb;
begin
  perform private.require_service_role();
  if p_actor_id is null
     or p_source_course_id is null
     or p_expected_source_revision is null
     or p_expected_source_revision < 1
     or p_expected_study_unit_version is null
     or p_expected_study_unit_version < 1
     or p_application_origin not in ('manual','provider_assistance')
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or jsonb_typeof(p_upsert) is distinct from 'object'
     or p_upsert - 'entityType' - 'entityId' - 'parentType'
       - 'parentId' - 'position' - 'content' <> '{}'::jsonb
     or not (p_upsert ?& array[
       'entityType','entityId','parentType','parentId','position','content'
     ])
     or jsonb_typeof(p_upsert->'entityType') is distinct from 'string'
     or p_upsert->>'entityType' <> 'study_unit'
     or jsonb_typeof(p_upsert->'entityId') is distinct from 'string'
     or nullif(btrim(p_upsert->>'entityId'),'') is null
     or p_upsert->>'entityId' <> btrim(p_upsert->>'entityId')
     or char_length(p_upsert->>'entityId') > 240
     or p_upsert->>'entityId' ~ '[[:cntrl:]]'
     or jsonb_typeof(p_upsert->'parentType') is distinct from 'string'
     or p_upsert->>'parentType' <> 'microsequence'
     or jsonb_typeof(p_upsert->'parentId') is distinct from 'string'
     or nullif(btrim(p_upsert->>'parentId'),'') is null
     or p_upsert->>'parentId' <> btrim(p_upsert->>'parentId')
     or char_length(p_upsert->>'parentId') > 240
     or p_upsert->>'parentId' ~ '[[:cntrl:]]'
     or jsonb_typeof(p_upsert->'position') is distinct from 'number'
     or p_upsert->>'position' !~ '^[0-9]+$'
     or (p_upsert->>'position')::numeric > 2147483647
     or jsonb_typeof(p_upsert->'content') is distinct from 'object'
     or p_upsert->'content' ? 'sources' then
    raise exception 'Edição da cópia pessoal inválida.'
      using errcode = '22023';
  end if;

  v_hash := private.course_source_json_hash_v1(jsonb_build_object(
    'operation','commit_personal_course_copy_edit',
    'actorId',p_actor_id,
    'sourceCourseId',p_source_course_id,
    'expectedSourceRevision',p_expected_source_revision,
    'expectedStudyUnitVersion',p_expected_study_unit_version,
    'upsert',p_upsert,
    'applicationOrigin',p_application_origin
  ));

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'course-change-request:' || p_actor_id::text || ':' || p_request_id,0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  select * into v_receipt
  from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'commit_personal_course_copy_edit'
       or v_receipt.request_hash <> v_hash
       or v_receipt.result->>'sourceCourseId' <> p_source_course_id::text then
      raise exception 'requestId reutilizado com comando incompatível.'
        using errcode = '23514';
    end if;
    return jsonb_set(v_receipt.result,'{idempotent}','true'::jsonb,false);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'personal-course-copy:' || p_actor_id::text || ':'
      || p_source_course_id::text,0
  ));
  select * into v_mapping
  from private.course_personal_copies copy_value
  where copy_value.actor_id = p_actor_id
    and copy_value.source_course_ref = p_source_course_id
  for update;
  if found then
    if v_mapping.creation_hash <> v_hash then
      raise exception 'Já existe uma cópia pessoal para este Curso.'
        using errcode = 'P1490',
          detail = v_mapping.target_course_id::text;
    end if;
    v_result := jsonb_build_object(
      'contract','aralearn.personal-course-copy-edit.v1',
      'operation','commit_personal_course_copy_edit',
      'sourceCourseId',v_mapping.source_course_ref,
      'sourceCourseRevision',v_mapping.source_course_revision,
      'targetCourseId',v_mapping.target_course_id,
      'targetCourseRevision',v_mapping.initial_course_revision,
      'studyUnitId',v_mapping.study_unit_id,
      'studyUnitVersion',v_mapping.initial_study_unit_version,
      'applicationOrigin',v_mapping.application_origin,
      'channel','application',
      'createdCopy',true,
      'changed',true,
      'idempotent',true,
      'updatedAt',v_mapping.initial_updated_at
    );
    insert into private.course_change_receipts(
      actor_id,request_id,operation,course_id,request_hash,result
    ) values(
      p_actor_id,p_request_id,'commit_personal_course_copy_edit',
      v_mapping.target_course_id,v_hash,v_result
    );
    return v_result;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'course-access:' || p_source_course_id::text || ':' || p_actor_id::text,0
  ));
  v_ownership := private.require_course_access_v1(
    p_source_course_id,p_actor_id,false
  );
  if v_ownership <> 'shared' then
    raise exception 'O proprietário deve editar o Curso original.'
      using errcode = '42501';
  end if;
  perform 1
  from public.course_access access_value
  where access_value.course_id = p_source_course_id
    and access_value.user_id = p_actor_id
  for share;
  if not found then
    raise exception 'Curso inexistente ou inacessível.' using errcode = 'PT404';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'course-row:' || p_source_course_id::text,0
  ));
  select * into v_source_course
  from public.courses course
  where course.id = p_source_course_id
  for share;
  if not found then
    raise exception 'Curso inexistente ou inacessível.' using errcode = 'PT404';
  end if;
  if v_source_course.revision <> p_expected_source_revision then
    raise exception 'O Curso mudou; releia antes de salvar.'
      using errcode = '40001';
  end if;
  select * into v_source_unit
  from private.course_entities entity
  where entity.course_id = p_source_course_id
    and entity.entity_type = 'study_unit'
    and entity.entity_id = p_upsert->>'entityId'
  for share;
  if not found then
    raise exception 'Unidade de estudo inexistente.' using errcode = 'PT404';
  end if;
  if v_source_unit.version <> p_expected_study_unit_version
     or v_source_unit.parent_type is distinct from p_upsert->>'parentType'
     or v_source_unit.parent_id is distinct from p_upsert->>'parentId'
     or v_source_unit.position <> (p_upsert->>'position')::integer then
    raise exception 'A Unidade mudou; releia antes de salvar.'
      using errcode = '40001';
  end if;

  if v_source_unit.content = p_upsert->'content' then
    v_result := jsonb_build_object(
      'contract','aralearn.personal-course-copy-edit.v1',
      'operation','commit_personal_course_copy_edit',
      'sourceCourseId',p_source_course_id,
      'sourceCourseRevision',v_source_course.revision,
      'targetCourseId',null,
      'targetCourseRevision',null,
      'studyUnitId',v_source_unit.entity_id,
      'studyUnitVersion',v_source_unit.version,
      'applicationOrigin',p_application_origin,
      'channel','application',
      'createdCopy',false,
      'changed',false,
      'idempotent',false,
      'updatedAt',v_source_course.updated_at
    );
    insert into private.course_change_receipts(
      actor_id,request_id,operation,course_id,request_hash,result
    ) values(
      p_actor_id,p_request_id,'commit_personal_course_copy_edit',
      p_source_course_id,v_hash,v_result
    );
    return v_result;
  end if;

  insert into public.courses(
    id,owner_id,title,goal,revision
  ) values(
    extensions.gen_random_uuid(),p_actor_id,v_source_course.title,
    v_source_course.goal,1
  ) returning * into v_target_course;

  insert into private.course_instructional_plans(
    course_id,audience,instructional_scope,
    preferred_authoring_part_min,preferred_authoring_part_max,
    part_count_origin,version
  ) values(
    v_target_course.id,'','',7,12,'automatic',1
  );

  insert into private.course_entities(
    course_id,entity_type,entity_id,parent_type,parent_id,position,
    content,version,created_at,updated_at,design_snapshot,design_application,
    created_origin,last_revision_origin
  )
  select v_target_course.id,entity.entity_type,entity.entity_id,
    entity.parent_type,entity.parent_id,entity.position,entity.content,1,
    v_target_course.created_at,v_target_course.created_at,
    case when entity.design_snapshot is null then null else jsonb_set(
      entity.design_snapshot,'{appliedAt}',to_jsonb(v_target_course.created_at),true
    ) end,entity.design_application,
    entity.created_origin,entity.last_revision_origin
  from private.course_entities entity
  where entity.course_id = p_source_course_id;

  null;

  v_inner_result := public.commit_course_composition_for_actor_v1(
    p_actor_id,v_target_course.id,1,1,
    jsonb_build_array(p_upsert),'[]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'studyUnitId',v_source_unit.entity_id,'sourceLinks','[]'::jsonb
    )),
    'application',p_application_origin,p_request_id
  );
  if (v_inner_result->>'revision')::bigint <> 2
     or coalesce((v_inner_result->>'updatedCount')::integer,0) <> 1 then
    raise exception 'A edição inicial da cópia pessoal não foi materializada.'
      using errcode = '55000';
  end if;

  select * into strict v_target_course
  from public.courses course where course.id = v_target_course.id;
  select * into strict v_target_unit
  from private.course_entities entity
  where entity.course_id = v_target_course.id
    and entity.entity_type = 'study_unit'
    and entity.entity_id = v_source_unit.entity_id;
  if v_target_course.revision <> 2 or v_target_unit.version <> 2 then
    raise exception 'Versões iniciais da cópia pessoal divergiram.'
      using errcode = '55000';
  end if;

  delete from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id
    and receipt.operation = 'commit_course_composition'
    and receipt.course_id = v_target_course.id;
  if not found then
    raise exception 'Recibo interno da cópia pessoal ausente.'
      using errcode = '55000';
  end if;

  insert into private.course_personal_copies(
    target_course_id,actor_id,source_course_ref,source_course_revision,
    study_unit_id,creation_hash,initial_course_revision,
    initial_study_unit_version,application_origin,initial_updated_at
  ) values(
    v_target_course.id,p_actor_id,p_source_course_id,v_source_course.revision,
    v_target_unit.entity_id,v_hash,v_target_course.revision,
    v_target_unit.version,p_application_origin,v_target_course.updated_at
  ) returning * into v_mapping;

  v_result := jsonb_build_object(
    'contract','aralearn.personal-course-copy-edit.v1',
    'operation','commit_personal_course_copy_edit',
    'sourceCourseId',p_source_course_id,
    'sourceCourseRevision',v_source_course.revision,
    'targetCourseId',v_target_course.id,
    'targetCourseRevision',v_target_course.revision,
    'studyUnitId',v_target_unit.entity_id,
    'studyUnitVersion',v_target_unit.version,
    'applicationOrigin',p_application_origin,
    'channel','application',
    'createdCopy',true,
    'changed',true,
    'idempotent',false,
    'updatedAt',v_target_course.updated_at
  );
  insert into private.course_change_receipts(
    actor_id,request_id,operation,course_id,request_hash,result
  ) values(
    p_actor_id,p_request_id,'commit_personal_course_copy_edit',
    v_target_course.id,v_hash,v_result
  );
  return v_result;
end;
$function$;

-- Estado final explícito de public.delete_my_account_v1(text)
CREATE OR REPLACE FUNCTION public.delete_my_account_v1(p_confirmation text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'auth', 'storage'
 SET statement_timeout TO '60s'
AS $function$
declare
  v_user_id uuid:=auth.uid();
begin
  if v_user_id is null then
    raise exception 'Autenticacao obrigatoria.' using errcode='42501';
  end if;
  if nullif(btrim(coalesce(auth.jwt()->>'client_id','')),'') is not null then
    raise exception 'A exclusao de conta exige a sessao da aplicacao.'
      using errcode='42501';
  end if;
  if p_confirmation is distinct from 'EXCLUIR MINHA CONTA' then
    raise exception 'Confirmacao invalida.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'account-delete:'||v_user_id::text,0
  ));
  if not exists(select 1 from auth.users auth_user where auth_user.id=v_user_id) then
    return jsonb_build_object(
      'contract','aralearn.account-deletion.v1','status','deleted'
    );
  end if;
  if not private.current_auth_session_is_active_v1() then
    raise exception 'A exclusao de conta exige uma sessao ativa da aplicacao.'
      using errcode='42501';
  end if;
  if exists(
    select 1 from storage.objects object_value
    where object_value.bucket_id='person-avatars'
      and split_part(object_value.name,'/',1)=v_user_id::text
  ) then
    raise exception 'Remova os objetos privados de avatar antes de excluir a conta.'
      using errcode='AR001';
  end if;
  if exists(
    select 1 from storage.objects object_value
    join public.courses course
      on course.id::text=split_part(object_value.name,'/',1)
    where object_value.bucket_id='course-source-pdfs'
      and course.owner_id=v_user_id
  ) then
    raise exception 'Remova os PDFs privados dos Cursos antes de excluir a conta.'
      using errcode='AR001';
  end if;
  delete from public.course_access access_value
  where access_value.granted_by=v_user_id;
  null;
  update private.course_change_receipts receipt
  set result=jsonb_set(
    receipt.result,'{person}',jsonb_build_object('accountDeleted',true),false
  )
  where receipt.result#>>'{person,userId}'=v_user_id::text;
  delete from private.course_authoring_part_didactic_microsequences membership
  using public.courses course
  where course.owner_id=v_user_id and membership.course_id=course.id;
  delete from auth.sessions session_value where session_value.user_id=v_user_id;
  delete from auth.users auth_user where auth_user.id=v_user_id;
  if not found then
    raise exception 'Conta inexistente.' using errcode='PT404';
  end if;
  return jsonb_build_object(
    'contract','aralearn.account-deletion.v1','status','deleted'
  );
end;
$function$;

create or replace function private.delete_course_authoring_relations_before_course_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog,private
as $function$
begin
  delete from private.course_design_target_plan_items assignment
  where assignment.course_id = old.id;
  delete from private.course_authoring_part_didactic_microsequences membership
  where membership.course_id = old.id;
  return old;
end;
$function$;

revoke all on function private.delete_course_authoring_relations_before_course_v1()
from public,anon,authenticated,service_role;

delete from private.course_change_receipts receipt
where receipt.operation in(
  'commit_instructional_plan','advance_authoring_part_materialization',
  'apply_course_design_command','update_audit_cycle',
  'create_course_variants','detach_course_variant','create_inspection_focus'
);
alter table private.course_change_receipts
  drop constraint course_change_receipts_operation_v10,
  add constraint course_change_receipts_operation_v11 check(operation in(
    'create_course','commit_course_composition','apply_course_design_command_v2',
    'execute_course_source_command','execute_course_anchored_annotation',
    'create_course_anchored_annotations',
    'grant_access','revoke_access','commit_personal_course_copy_edit',
    'ingest_course_source_pdf',
    'save_course_authoring_part_v1','materialize_course_authoring_part_v1'
  ));

do $merge_annotation_receipts$
begin
  if exists(
    select 1
    from private.course_anchored_annotation_receipts annotation_receipt
    join private.course_change_receipts receipt
      on receipt.actor_id=annotation_receipt.actor_id
     and receipt.request_id=annotation_receipt.request_id
    where annotation_receipt.expires_at>statement_timestamp()
      and (receipt.course_id,receipt.request_hash)
        is distinct from (annotation_receipt.course_id,annotation_receipt.request_hash)
  ) then
    raise exception 'Receipts ativos possuem identidades incompatíveis.'
      using errcode='23514';
  end if;
  insert into private.course_change_receipts(
    actor_id,request_id,operation,course_id,request_hash,result,created_at,expires_at
  )
  select receipt.actor_id,receipt.request_id,'execute_course_anchored_annotation',
    receipt.course_id,receipt.request_hash,jsonb_build_object(
      'contract','aralearn.course-anchored-annotation-receipt.v1',
      'annotationId',receipt.annotation_id,
      'annotationVersion',receipt.result_annotation_version,
      'annotationSetVersion',receipt.result_annotation_set_version,
      'changed',receipt.result_changed
    ),receipt.created_at,receipt.expires_at
  from private.course_anchored_annotation_receipts receipt
  where receipt.expires_at>statement_timestamp()
  on conflict(actor_id,request_id) do nothing;
end;
$merge_annotation_receipts$;

alter table private.course_anchored_annotations
  drop constraint course_anchored_annotations_provenance_v1,
  drop constraint course_anchored_annotations_classification_v1,
  drop constraint course_anchored_annotations_observed_revision_v1;
update private.course_anchored_annotations annotation
set origin=case when annotation.origin in('author','learner')
      and annotation.channel<>'unknown_legacy' then annotation.origin
    when annotation.origin='human_audit' then 'reviewer'
    else 'imported' end,
  channel=case
    when annotation.origin='author' and annotation.channel in(
      'authoring_interface','authoring_chat'
    ) then annotation.channel
    when annotation.origin='learner' and annotation.channel='study_interface'
      then annotation.channel
    when annotation.origin='human_audit' then 'imported'
    else 'imported' end,
  automatic_method=case when annotation.automatic_method='legacy_unclassified'
    then 'imported_unclassified' else annotation.automatic_method end,
  effective_method=case when annotation.effective_method='legacy_unclassified'
    then 'imported_unclassified' else annotation.effective_method end,
  observed_revision_certainty=case
    when annotation.observed_revision_certainty='legacy_unknown' then 'unknown'
    else annotation.observed_revision_certainty end;
alter table private.course_anchored_annotations
  add constraint course_anchored_annotations_provenance_v2 check(
    origin='author' and channel in('authoring_interface','authoring_chat')
    or origin='learner' and channel='study_interface'
    or origin='reviewer' and channel='imported'
    or origin='imported' and channel='imported'
  ),
  add constraint course_anchored_annotations_classification_v2 check(
    automatic_method in(
      'exact_topic_target','target_scope_unclassified','imported_unclassified'
    ) and automatic_method_version>0
      and effective_method in(
        'exact_topic_target','target_scope_unclassified','imported_unclassified',
        'human_topic_selection'
      )
      and effective_method_version>0
      and private.valid_course_annotation_subject_refs_v1(automatic_subject_refs)
      and private.valid_course_annotation_subject_refs_v1(effective_subject_refs)
      and (automatic_method='imported_unclassified'
        and automatic_taxonomy_revision is null
        or automatic_method<>'imported_unclassified'
          and automatic_taxonomy_revision>0)
      and (effective_method='imported_unclassified'
        and effective_taxonomy_revision is null
        or effective_method<>'imported_unclassified'
          and effective_taxonomy_revision>0)
      and (
        classification_corrected_at is null
          and effective_method=automatic_method
          and effective_method_version=automatic_method_version
          and effective_taxonomy_revision is not distinct from
            automatic_taxonomy_revision
          and effective_subject_refs=automatic_subject_refs
        or classification_corrected_at is not null
          and effective_method='human_topic_selection'
      )
  ),
  add constraint course_anchored_annotations_observed_revision_v2 check(
    observed_revision_certainty='known'
      and observed_course_revision>0 and observed_target_version>0
      and (target_kind<>'course'
        or observed_course_revision=observed_target_version)
    or observed_revision_certainty='unknown'
      and observed_course_revision is null and observed_target_version is null
  );

-- Observação corrente sem ledger narrativo e com o receipt TTL comum.
CREATE OR REPLACE FUNCTION private.execute_course_anchored_annotation_command_core_v1(p_actor_id uuid, p_course_id uuid, p_expected_course_revision bigint, p_command jsonb, p_origin text, p_channel text, p_request_id text, p_actor_is_owner boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'auth', 'extensions'
AS $function$
declare
  v_type text;
  v_hash text;
  v_receipt private.course_change_receipts%rowtype;
  v_course public.courses%rowtype;
  v_annotation private.course_anchored_annotations%rowtype;
  v_snapshot jsonb;
  v_changed boolean := false;
  v_category text;
  v_raw_text text;
  v_summary text;
  v_response text;
  v_response_kind text;
  v_response_source_links jsonb;
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
  delete from private.course_change_receipts receipt
  where receipt.actor_id=p_actor_id and receipt.request_id=p_request_id
    and receipt.expires_at<=v_now;
  select * into v_receipt
  from private.course_change_receipts receipt
  where receipt.actor_id=p_actor_id and receipt.request_id=p_request_id;
  if found then
    if v_receipt.course_id<>p_course_id or v_receipt.request_hash<>v_hash
       or v_receipt.operation<>'execute_course_anchored_annotation' then
      raise exception 'requestId reutilizado com comando incompatível.'
        using errcode='23514';
    end if;
    perform private.cleanup_course_anchored_annotations_v1(p_course_id);
    select * into v_course from public.courses course where course.id=p_course_id;
    select * into v_annotation from private.course_anchored_annotations annotation
    where annotation.id=(v_receipt.result->>'annotationId')::uuid
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

  -- Um requestId novo precisa de receipt mesmo quando o comando é no-op. Sem
  -- este teto, uma pessoa poderia inflar a tabela durante a janela de 14 dias
  -- e transformar a limpeza oportunista em trabalho ilimitado sob o lock do
  -- Curso. A retirada permanece sempre possível; cada anotação só pode ser
  -- retirada uma vez e a quota de 512 limita esse excedente terminal.
  if v_type<>'withdraw_anchored_annotation' and (
    select count(*)
    from private.course_change_receipts receipt
    where receipt.actor_id=p_actor_id and receipt.course_id=p_course_id
      and receipt.operation='execute_course_anchored_annotation'
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
       or v_category is not null and v_category not in(
         'question','possible_error','confusing','suggestion','reformulation_request'
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
           'question','possible_error','confusing','suggestion','reformulation_request'
         ) then
        raise exception 'Conteúdo revisado inválido.' using errcode='22023';
      end if;
      v_changed:=v_annotation.raw_text is distinct from v_raw_text
        or v_annotation.category is distinct from v_category
        or v_annotation.brief_summary is distinct from v_summary
        or v_annotation.state<>'open'
        or v_annotation.owner_response is not null
        or v_annotation.owner_response_kind is not null
        or v_annotation.owner_response_source_links<>'[]'::jsonb;
      if v_changed then
        update private.course_anchored_annotations annotation set
          raw_text=v_raw_text,category=v_category,brief_summary=v_summary,
          state='open',owner_response=null,owner_response_kind=null,
          owner_response_source_links='[]'::jsonb,
          responded_at=null,resolved_at=null,
          updated_at=v_now,version=annotation.version+1
        where annotation.id=v_annotation.id returning * into v_annotation;
      end if;
    elsif v_type='withdraw_anchored_annotation' then
      if p_command-'type'-'annotationId'-'expectedAnnotationVersion'<>'{}'::jsonb
         or v_annotation.state='withdrawn' then
        raise exception 'Retirada da observação inválida.' using errcode='22023';
      end if;
      update private.course_anchored_annotations annotation set
        raw_text=null,brief_summary=null,owner_response=null,
        owner_response_kind=null,owner_response_source_links='[]'::jsonb,
        state='withdrawn',responded_at=null,resolved_at=null,
        withdrawn_at=v_now,hard_delete_after=v_now+interval '14 days',
        updated_at=v_now,version=annotation.version+1
      where annotation.id=v_annotation.id returning * into v_annotation;
      v_changed:=true;
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
      end if;
    elsif v_type='respond_to_anchored_annotation' then
      if p_command-'type'-'annotationId'-'expectedAnnotationVersion'-
           'ownerResponse'-'responseKind'-'consideredSourceLinks'<>'{}'::jsonb
         or not (p_command ?& array[
           'ownerResponse','responseKind','consideredSourceLinks'
         ])
         or v_annotation.state='withdrawn' then
        raise exception 'Resposta à observação inválida.' using errcode='22023';
      end if;
      v_response:=p_command->>'ownerResponse';
      v_response_kind:=p_command->>'responseKind';
      v_response_source_links:=p_command->'consideredSourceLinks';
      if not private.valid_course_annotation_text_v1(v_response,2000,16384,false)
         or v_response_kind not in('answer','reformulation')
         or not private.valid_course_source_links_shape_v2(
           v_response_source_links
         )
         or v_response_kind='answer'
           and v_response_source_links<>'[]'::jsonb
         or v_response_kind='reformulation'
           and jsonb_array_length(case
             when jsonb_typeof(v_response_source_links)='array'
               then v_response_source_links else '[]'::jsonb end
           )=0
         or v_response_kind='reformulation'
           and not private.course_annotation_source_links_resolved_v1(
             p_course_id,v_response_source_links
           ) then
        raise exception 'Resposta à observação inválida.' using errcode='22023';
      end if;
      v_changed:=v_annotation.owner_response is distinct from v_response
        or v_annotation.owner_response_kind is distinct from v_response_kind
        or v_annotation.owner_response_source_links is distinct from
          v_response_source_links
        or v_annotation.state='open';
      if v_changed then
        update private.course_anchored_annotations annotation set
          owner_response=v_response,owner_response_kind=v_response_kind,
          owner_response_source_links=v_response_source_links,responded_at=v_now,
          state=case when state='open' then 'considered' else state end,
          first_considered_at=coalesce(first_considered_at,v_now),
          updated_at=v_now,version=annotation.version+1
        where annotation.id=v_annotation.id returning * into v_annotation;
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
            when 'source' then true
            when 'source_anchor' then true
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
    null;
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
  insert into private.course_change_receipts(
    actor_id,request_id,course_id,operation,request_hash,result
  ) values(
    p_actor_id,p_request_id,p_course_id,'execute_course_anchored_annotation',v_hash,
    jsonb_build_object(
      'contract','aralearn.course-anchored-annotation-receipt.v1',
      'annotationId',v_annotation.id,
      'annotationVersion',v_annotation.version,
      'annotationSetVersion',v_result_set_version,
      'changed',v_changed
    )
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

create function public.create_course_anchored_annotations_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_course_revision bigint,
  p_commands jsonb,
  p_channel text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $function$
declare
  v_hash text;
  v_receipt private.course_change_receipts%rowtype;
  v_course_revision bigint;
  v_command record;
  v_child_request_id text;
  v_child_result jsonb;
  v_annotation_set_version bigint;
  v_created_count integer:=0;
  v_result jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_actor_id is null or p_course_id is null
     or p_expected_course_revision is null or p_expected_course_revision<1
     or p_channel not in('authoring_interface','authoring_chat')
     or p_request_id is null
     or p_request_id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or jsonb_typeof(p_commands)<>'array'
     or jsonb_array_length(p_commands) not between 1 and 64
     or octet_length(p_commands::text)>1048576
     or exists(
       select 1 from jsonb_array_elements(p_commands) command(value)
       where jsonb_typeof(command.value)<>'object'
         or command.value->>'type'<>'create_anchored_annotation'
         or jsonb_typeof(command.value->'annotationId')<>'string'
     )
     or (
       select count(*)<>count(distinct command.value->>'annotationId')
       from jsonb_array_elements(p_commands) command(value)
     ) then
    raise exception 'Registro de Observações inválido.' using errcode='22023';
  end if;
  v_hash:=private.course_annotation_hash_v1(jsonb_build_object(
    'courseId',p_course_id,'expectedCourseRevision',p_expected_course_revision,
    'commands',p_commands,'channel',p_channel
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:'||p_actor_id::text||':'||p_request_id,0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id=p_actor_id and receipt.request_id=p_request_id
    and receipt.expires_at<=statement_timestamp();
  select * into v_receipt from private.course_change_receipts receipt
  where receipt.actor_id=p_actor_id and receipt.request_id=p_request_id;
  if found then
    if v_receipt.operation<>'create_course_anchored_annotations'
       or v_receipt.course_id<>p_course_id
       or v_receipt.request_hash<>v_hash then
      raise exception 'requestId reutilizado com Observações incompatíveis.'
        using errcode='23514';
    end if;
    return (v_receipt.result-'idempotent')
      ||jsonb_build_object('idempotent',true);
  end if;
  perform 1 from auth.users actor
  where actor.id=p_actor_id for key share;
  if not found then
    raise exception 'Pessoa inexistente ou inacessível.' using errcode='PT404';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'course-row:'||p_course_id::text,0
  ));
  select course.revision into strict v_course_revision
  from public.courses course where course.id=p_course_id for update;
  if v_course_revision<>p_expected_course_revision then
    raise exception 'O Curso mudou; releia antes de registrar Observações.'
      using errcode='40001';
  end if;
  for v_command in
    select command.value,command.ordinal
    from jsonb_array_elements(p_commands)
      with ordinality command(value,ordinal)
    order by command.ordinal
  loop
    v_child_request_id:='ann:'||substr(private.course_annotation_hash_v1(
      jsonb_build_object('requestId',p_request_id,'ordinal',v_command.ordinal)
    ),1,48);
    v_child_result:=private.execute_course_anchored_annotation_command_core_v1(
      p_actor_id,p_course_id,p_expected_course_revision,v_command.value,
      'author',p_channel,v_child_request_id,true
    );
    if not coalesce((v_child_result->>'changed')::boolean,false) then
      raise exception 'Uma Observação do lote não foi criada.' using errcode='55000';
    end if;
    v_created_count:=v_created_count+1;
    v_annotation_set_version:=(v_child_result->>'annotationSetVersion')::bigint;
  end loop;
  v_result:=jsonb_build_object(
    'contract','aralearn.course-anchored-annotations-change.v1',
    'courseId',p_course_id,'courseRevision',v_course_revision,
    'annotationSetVersion',v_annotation_set_version,
    'requestId',p_request_id,'idempotent',false,
    'changed',v_created_count>0,'createdCount',v_created_count
  );
  insert into private.course_change_receipts(
    actor_id,request_id,operation,course_id,request_hash,result
  ) values(
    p_actor_id,p_request_id,'create_course_anchored_annotations',
    p_course_id,v_hash,v_result
  );
  return v_result;
exception when serialization_failure then
  raise sqlstate 'PGRST' using
    message=jsonb_build_object(
      'code','40001','message',sqlerrm,'details',null,'hint',null
    )::text,
    detail=jsonb_build_object(
      'status',409,'headers',jsonb_build_object()
    )::text;
end;
$function$;

revoke all on function public.create_course_anchored_annotations_for_actor_v1(
  uuid,uuid,bigint,jsonb,text,text
) from public,anon,authenticated,service_role;
grant execute on function public.create_course_anchored_annotations_for_actor_v1(
  uuid,uuid,bigint,jsonb,text,text
) to service_role;

-- Projeções de Observações usam somente proveniência corrente/importada.
CREATE OR REPLACE FUNCTION private.get_course_anchored_annotations_core_v1(p_viewer_id uuid, p_course_id uuid, p_expected_course_revision bigint, p_annotation_set_version bigint, p_mode text, p_origins text[], p_channels text[], p_states text[], p_categories text[], p_include_uncategorized boolean, p_subject_ids text[], p_target_kind text, p_target_id text, p_include_descendants boolean, p_annotation_id uuid, p_cursor text, p_limit integer, p_viewer_is_owner boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
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
     or cardinality(p_origins)>4 or cardinality(p_channels)>5
     or cardinality(p_states)>4 or cardinality(p_categories)>5
     or cardinality(p_subject_ids)>16
     or exists(select 1 from unnest(p_origins) value where value is null or value not in(
       'author','learner','reviewer','imported'
     ))
     or exists(select 1 from unnest(p_channels) value where value is null or value not in(
       'authoring_interface','authoring_chat','study_interface','imported'
     ))
     or exists(select 1 from unnest(p_states) value where value is null or value not in(
       'open','considered','resolved','withdrawn'
     ))
     or exists(select 1 from unnest(p_categories) value where value is null or value not in(
       'question','possible_error','confusing','suggestion','reformulation_request'
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
       'course','module','lesson','topic','didactic_microsequence','study_unit',
       'source','source_anchor'
     )
     or p_target_id is not null and(
       nullif(btrim(p_target_id),'') is null
       or p_target_id<>btrim(p_target_id)
       or char_length(p_target_id)>240 or octet_length(p_target_id)>960
       or p_target_id ~ '[[:cntrl:]]'
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

CREATE OR REPLACE FUNCTION private.course_anchored_annotation_item_v1(p_annotation private.course_anchored_annotations, p_viewer_id uuid, p_viewer_is_owner boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'extensions'
AS $function$
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
  v_contributor_role:=case when p_annotation.origin='imported'
    then 'imported' else p_annotation.origin end;
  if p_annotation.origin='imported' then
    v_contributor_kind:='imported';
    v_contributor_label:='Conteúdo importado';
  elsif p_annotation.actor_id=p_viewer_id then
    v_contributor_kind:='self';
    v_contributor_label:=case when p_annotation.origin='author'
      then 'Você · pessoa autora' else 'Você' end;
  elsif p_annotation.actor_id is null then
    v_contributor_kind:='imported';
    v_contributor_label:='Conteúdo importado';
  else
    v_contributor_kind:='protected_person';
    v_contributor_label:=case when p_annotation.origin='learner'
      then 'Estudante '||upper(substr(v_ref,8,4))
      when p_annotation.origin='reviewer' then 'Pessoa revisora'
      else 'Pessoa autora' end;
  end if;
  v_target_deep_link:=case when v_current is null or not p_viewer_is_owner then null
    when p_annotation.target_kind='course' then
      '#/authoring/courses/'||p_annotation.course_id::text||'?section=content'
    when p_annotation.target_kind='module' then
      '#/authoring/courses/'||p_annotation.course_id::text||
      '?section=content&moduleId='||private.course_annotation_urlencode_v1(p_annotation.target_id)
    when p_annotation.target_kind='lesson' then
      '#/authoring/courses/'||p_annotation.course_id::text||
      '?section=content&lessonId='||private.course_annotation_urlencode_v1(p_annotation.target_id)
    when p_annotation.target_kind='didactic_microsequence' then
      '#/authoring/courses/'||p_annotation.course_id::text||
      '?section=content&didacticMicrosequenceId='||
      private.course_annotation_urlencode_v1(p_annotation.target_id)
    when p_annotation.target_kind='study_unit' then
      '#/authoring/courses/'||p_annotation.course_id::text||
      '?section=content&studyUnitId='||private.course_annotation_urlencode_v1(p_annotation.target_id)
    when p_annotation.target_kind='source' then
      '#/authoring/courses/'||p_annotation.course_id::text||
      '?section=sources&sourceId='||private.course_annotation_urlencode_v1(
        p_annotation.target_id
      )
    when p_annotation.target_kind='source_anchor' then
      '#/authoring/courses/'||p_annotation.course_id::text||
      '?section=sources&sourceId='||private.course_annotation_urlencode_v1(
        v_current#>>'{path,1,id}'
      )||'&anchorId='||private.course_annotation_urlencode_v1(p_annotation.target_id)
    else
      '#/authoring/courses/'||p_annotation.course_id::text||
      '?section=content&lessonId='||private.course_annotation_urlencode_v1(
        coalesce((select entry->>'id' from jsonb_array_elements(v_current->'path') entry
          where entry->>'kind'='lesson' limit 1),p_annotation.target_id)
      )
  end;
  v_deep_link:=case when p_viewer_is_owner then
    '#/authoring/courses/'||p_annotation.course_id::text||
    '?section=review&annotationId='||p_annotation.id::text
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
        'text',p_annotation.owner_response,'kind',p_annotation.owner_response_kind,
        'consideredSourceLinks',p_annotation.owner_response_source_links,
        'updatedAt',p_annotation.responded_at
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

CREATE OR REPLACE FUNCTION private.redact_course_annotations_before_account_deletion_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
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
      owner_response_kind=null,owner_response_source_links='[]'::jsonb,
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
    null;
  end loop;
  return old;
end;
$function$;

create or replace function private.cleanup_course_anchored_annotations_v1(
  p_course_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog,public,private
as $function$
declare
  v_count integer;
begin
  perform 1 from public.courses course
  where course.id=p_course_id for update;
  if not found then return 0; end if;
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
  delete from private.course_change_receipts receipt
  where receipt.course_id=p_course_id
    and receipt.expires_at<=statement_timestamp();
  return v_count;
end;
$function$;

revoke all on function private.cleanup_course_anchored_annotations_v1(uuid)
from public,anon,authenticated,service_role;

-- Retenção corrente usa apenas o receipt TTL comum.
CREATE OR REPLACE FUNCTION private.run_current_data_retention_v1(p_limit integer DEFAULT 512)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_annotations integer:=0;
  v_change_receipts integer:=0;
  v_state_receipts integer:=0;
  v_upload_intents integer:=0;
  v_access_windows integer:=0;
  v_now timestamptz:=statement_timestamp();
begin
  if p_limit is null or p_limit not between 1 and 1000 then
    raise exception 'Limite de retencao invalido.' using errcode='22023';
  end if;
  with candidate_courses as materialized(
    select course.id from public.courses course
    where exists(
      select 1 from private.course_anchored_annotations annotation
      where annotation.course_id=course.id
        and annotation.hard_delete_after<=v_now
    )
    order by course.id
    limit p_limit
    for update skip locked
  ), expired as materialized(
    select annotation.id
    from private.course_anchored_annotations annotation
    join candidate_courses candidate on candidate.id=annotation.course_id
    where annotation.hard_delete_after<=v_now
    order by annotation.hard_delete_after,annotation.id
    limit p_limit
    for update of annotation skip locked
  ), removed as materialized(
    delete from private.course_anchored_annotations annotation
    using expired where annotation.id=expired.id
    returning annotation.course_id,annotation.actor_id
  ), affected_courses as materialized(
    select removed.course_id,count(*)::bigint removed_count
    from removed group by removed.course_id
  ), bumped_courses as(
    update public.courses course set
      annotation_set_version=course.annotation_set_version+
        affected_courses.removed_count
    from affected_courses where course.id=affected_courses.course_id
    returning course.id
  ), affected_viewers as materialized(
    select removed.course_id,removed.actor_id,count(*)::bigint removed_count
    from removed where removed.actor_id is not null
    group by removed.course_id,removed.actor_id
  ), bumped_viewers as(
    update private.course_anchored_annotation_viewer_versions viewer set
      version=viewer.version+affected_viewers.removed_count
    from affected_viewers
    where viewer.course_id=affected_viewers.course_id
      and viewer.actor_id=affected_viewers.actor_id
    returning viewer.actor_id
  )
  select count(*)::integer into v_annotations from removed;



  with expired as materialized(
    select receipt.ctid from private.course_change_receipts receipt
    where receipt.expires_at<=v_now
    order by receipt.expires_at,receipt.actor_id,receipt.request_id
    limit p_limit for update skip locked
  ), removed as(
    delete from private.course_change_receipts receipt
    using expired where receipt.ctid=expired.ctid returning 1
  ) select count(*)::integer into v_change_receipts from removed;

  with expired as materialized(
    select receipt.ctid from private.course_personal_state_receipts receipt
    where receipt.expires_at<=v_now
    order by receipt.expires_at,receipt.user_id,receipt.request_id
    limit p_limit for update skip locked
  ), removed as(
    delete from private.course_personal_state_receipts receipt
    using expired where receipt.ctid=expired.ctid returning 1
  ) select count(*)::integer into v_state_receipts from removed;

  with expired as materialized(
    select intent.ctid from private.course_source_pdf_upload_intents intent
    where intent.expires_at<=v_now
    order by intent.expires_at,intent.actor_id,intent.course_id,intent.storage_path
    limit p_limit for update skip locked
  ), removed as(
    delete from private.course_source_pdf_upload_intents intent
    using expired where intent.ctid=expired.ctid returning 1
  ) select count(*)::integer into v_upload_intents from removed;

  with expired as materialized(
    select rate_value.ctid from private.course_access_grant_rate_limits rate_value
    where rate_value.window_started_at<=v_now-interval '30 days'
    order by rate_value.window_started_at,rate_value.actor_id
    limit p_limit for update skip locked
  ), removed as(
    delete from private.course_access_grant_rate_limits rate_value
    using expired where rate_value.ctid=expired.ctid returning 1
  ) select count(*)::integer into v_access_windows from removed;

  return jsonb_build_object(
    'contract','aralearn.current-data-retention.v1',
    'ranAt',v_now,'limitPerClass',p_limit,
    'removed',jsonb_build_object(
      'withdrawnAnnotations',v_annotations,
      'courseChangeReceipts',v_change_receipts,
      'personalStateReceipts',v_state_receipts,
      'pdfUploadIntents',v_upload_intents,
      'accessGrantWindows',v_access_windows
    )
  );
end;
$function$;

create function private.reject_course_design_parameter_definition_change_v1()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  raise exception 'O catálogo pedagógico é imutável.' using errcode = '55000';
end;
$function$;

revoke all on function private.reject_course_design_parameter_definition_change_v1()
from public,anon,authenticated,service_role;
drop trigger course_design_parameter_definitions_immutable_v1
  on private.course_design_parameter_definitions;
alter table private.course_design_parameter_definitions
  drop constraint course_design_parameter_definitions_scope_v1;
update private.course_design_parameter_definitions definition
set supported_scopes=array[
      'course','lesson','didactic_microsequence','study_unit'
    ]::text[],
    definition=jsonb_set(
      definition.definition,'{supportedScopes}',
      '["course","lesson","didactic_microsequence","study_unit"]'::jsonb,
      false
    );
alter table private.course_design_parameter_definitions
  add constraint course_design_parameter_definitions_scope_v2 check(
    supported_scopes=array[
      'course','lesson','didactic_microsequence','study_unit'
    ]::text[]
  );
create trigger course_design_parameter_definitions_immutable_v1
before update or delete on private.course_design_parameter_definitions
for each row execute function
  private.reject_course_design_parameter_definition_change_v1();

-- Fontes e Âncoras mantêm uma linha corrente por identidade. `revision` passa
-- a ser somente o CAS dessa linha; não existem revisões consultáveis.
drop policy if exists course_source_pdfs_owner_insert_v1 on storage.objects;
drop policy if exists course_source_pdfs_owner_select_v1 on storage.objects;
drop function public.attach_course_source_pdf_for_actor_v1(
  uuid,uuid,bigint,jsonb,text,text
);
drop function private.attach_course_source_pdf_before_lifecycle_v1(
  uuid,uuid,bigint,jsonb,text,text
);
drop function public.get_course_source_attachment_access_for_actor_v1(
  uuid,uuid,bigint,text,text,bigint,text,bigint,text
);
drop function private.can_upload_course_source_pdf_v1(text,jsonb);
drop function private.can_read_course_source_pdf_v1(text);
drop trigger course_source_revisions_append_only_v1
  on private.course_source_revisions;
drop trigger course_source_anchor_revisions_append_only_v1
  on private.course_source_anchor_revisions;
drop trigger course_source_attributions_append_only_v1
  on private.course_source_attributions;
drop trigger course_source_attribution_sources_append_only_v1
  on private.course_source_attribution_sources;
drop trigger course_source_attribution_anchors_append_only_v1
  on private.course_source_attribution_anchors;
drop trigger course_source_attachments_lifecycle_v1
  on private.course_source_attachments;

alter table private.course_source_anchor_revisions
  drop constraint course_source_anchor_revisions_source_fk_v1;
alter table private.course_source_attachments
  drop constraint course_source_attachments_source_fk_v1;
alter table private.course_source_attribution_sources
  drop constraint course_source_attribution_sources_source_fk_v1;
alter table private.course_source_attribution_anchors
  drop constraint course_source_attribution_anchors_anchor_fk_v1,
  drop constraint course_source_attribution_anchors_source_link_fk_v1;

with ranked as materialized (
  select attribution.course_id,attribution.id,
    row_number() over(
      partition by attribution.course_id,attribution.target_kind,attribution.target_id
      order by attribution.revision desc,attribution.id desc
    ) as current_order
  from private.course_source_attributions attribution
)
delete from private.course_source_attributions attribution
using ranked
where attribution.course_id = ranked.course_id
  and attribution.id = ranked.id
  and ranked.current_order > 1;
delete from private.course_source_attributions attribution
where private.course_source_target_state_v1(
    attribution.course_id,attribution.target_kind,attribution.target_id
  ) is null
  or (private.course_source_target_state_v1(
    attribution.course_id,attribution.target_kind,attribution.target_id
  )->>'version')::bigint <> attribution.target_version
  or private.course_source_target_state_v1(
    attribution.course_id,attribution.target_kind,attribution.target_id
  )->>'hash' <> attribution.target_hash;

with ranked as materialized (
  select attachment.ctid,
    row_number() over(
      partition by attachment.course_id,attachment.source_id,attachment.content_hash
      order by (attachment.status = 'active') desc,
        attachment.source_revision desc,attachment.updated_at desc
    ) as current_order
  from private.course_source_attachments attachment
)
delete from private.course_source_attachments attachment
using ranked
where attachment.ctid = ranked.ctid and ranked.current_order > 1;

with current_source as materialized (
  select source.course_id,source.source_id,max(source.revision) as revision
  from private.course_source_revisions source
  group by source.course_id,source.source_id
)
update private.course_source_anchor_revisions anchor_value
set source_revision = current_source.revision
from current_source
where anchor_value.course_id = current_source.course_id
  and anchor_value.source_id = current_source.source_id
  and anchor_value.source_revision <> current_source.revision;
with current_source as materialized (
  select source.course_id,source.source_id,max(source.revision) as revision
  from private.course_source_revisions source
  group by source.course_id,source.source_id
)
update private.course_source_attachments attachment
set source_revision = current_source.revision
from current_source
where attachment.course_id = current_source.course_id
  and attachment.source_id = current_source.source_id
  and attachment.source_revision <> current_source.revision;
with current_source as materialized (
  select source.course_id,source.source_id,max(source.revision) as revision
  from private.course_source_revisions source
  group by source.course_id,source.source_id
)
update private.course_source_attribution_sources source_link
set source_revision = current_source.revision
from current_source
where source_link.course_id = current_source.course_id
  and source_link.source_id = current_source.source_id
  and source_link.source_revision <> current_source.revision;
with current_source as materialized (
  select source.course_id,source.source_id,max(source.revision) as revision
  from private.course_source_revisions source
  group by source.course_id,source.source_id
)
update private.course_source_attribution_anchors anchor_link
set source_revision = current_source.revision
from current_source
where anchor_link.course_id = current_source.course_id
  and anchor_link.source_id = current_source.source_id
  and anchor_link.source_revision <> current_source.revision;
with current_source as materialized (
  select source.course_id,source.source_id,max(source.revision) as revision
  from private.course_source_revisions source
  group by source.course_id,source.source_id
)
update private.course_source_pdf_upload_intents intent
set source_revision = current_source.revision
from current_source
where intent.course_id = current_source.course_id
  and intent.source_id = current_source.source_id
  and intent.source_revision <> current_source.revision;

with current_anchor as materialized (
  select anchor_value.course_id,anchor_value.anchor_id,
    max(anchor_value.revision) as revision
  from private.course_source_anchor_revisions anchor_value
  group by anchor_value.course_id,anchor_value.anchor_id
)
update private.course_source_attribution_anchors anchor_link
set anchor_revision = current_anchor.revision
from current_anchor
where anchor_link.course_id = current_anchor.course_id
  and anchor_link.anchor_id = current_anchor.anchor_id
  and anchor_link.anchor_revision <> current_anchor.revision;
delete from private.course_source_attribution_anchors anchor_link
where not exists(
  select 1
  from private.course_source_attribution_sources source_link
  where source_link.course_id=anchor_link.course_id
    and source_link.attribution_id=anchor_link.attribution_id
    and source_link.source_ordinal=anchor_link.source_ordinal
    and source_link.source_id=anchor_link.source_id
    and source_link.source_revision=anchor_link.source_revision
);

delete from private.course_source_anchor_revisions anchor_value
where exists(
  select 1 from private.course_source_anchor_revisions newer
  where newer.course_id = anchor_value.course_id
    and newer.anchor_id = anchor_value.anchor_id
    and row(newer.revision,newer.created_at)
      > row(anchor_value.revision,anchor_value.created_at)
);
delete from private.course_source_revisions source
where exists(
  select 1 from private.course_source_revisions newer
  where newer.course_id = source.course_id
    and newer.source_id = source.source_id
    and row(newer.revision,newer.created_at)
      > row(source.revision,source.created_at)
);

alter table private.course_source_revisions
  drop constraint course_source_revisions_pkey,
  add constraint course_sources_pkey primary key(course_id,source_id),
  add constraint course_sources_version_identity_v1
    unique(course_id,source_id,revision);
alter table private.course_source_anchor_revisions
  drop constraint course_source_anchor_revisions_pkey,
  drop constraint course_source_anchor_revision_course_id_anchor_id_revision__key,
  add constraint course_source_anchors_pkey primary key(course_id,anchor_id),
  add constraint course_source_anchors_version_identity_v1
    unique(course_id,anchor_id,revision,source_id,source_revision);
alter table private.course_source_attributions
  drop constraint course_source_attributions_course_id_target_kind_target_id__key,
  add constraint course_source_attributions_current_target_v1
    unique(course_id,target_kind,target_id);
alter table private.course_source_attachments
  drop constraint course_source_attachments_pkey,
  add constraint course_source_attachments_pkey
    primary key(course_id,source_id,content_hash);

alter table private.course_source_anchor_revisions
  add constraint course_source_anchors_source_fk_v1
    foreign key(course_id,source_id,source_revision)
    references private.course_source_revisions(course_id,source_id,revision)
    on update cascade on delete cascade;
alter table private.course_source_attachments
  add constraint course_source_attachments_source_fk_v2
    foreign key(course_id,source_id,source_revision)
    references private.course_source_revisions(course_id,source_id,revision)
    on update cascade on delete cascade;
alter table private.course_source_attribution_sources
  add constraint course_source_attribution_sources_source_fk_v2
    foreign key(course_id,source_id,source_revision)
    references private.course_source_revisions(course_id,source_id,revision)
    on update cascade on delete cascade;
alter table private.course_source_attribution_anchors
  add constraint course_source_attribution_anchors_source_link_fk_v2
    foreign key(
      course_id,attribution_id,source_ordinal,source_id,source_revision
    ) references private.course_source_attribution_sources(
      course_id,attribution_id,source_ordinal,source_id,source_revision
    ) on update cascade on delete cascade,
  add constraint course_source_attribution_anchors_anchor_fk_v2
    foreign key(
      course_id,anchor_id,anchor_revision,source_id,source_revision
    ) references private.course_source_anchor_revisions(
      course_id,anchor_id,revision,source_id,source_revision
    ) on update cascade on delete cascade;

delete from private.course_change_receipts receipt
where receipt.expires_at <= statement_timestamp();
delete from private.course_source_pdf_upload_intents intent
where intent.expires_at <= statement_timestamp();

alter table private.course_source_revisions rename to course_sources;
alter table private.course_source_anchor_revisions rename to course_source_anchors;
alter index private.course_source_revisions_catalog_v1_idx
  rename to course_sources_catalog_v1_idx;
alter index private.course_source_anchor_revisions_source_v1_idx
  rename to course_source_anchors_source_v1_idx;
alter table private.course_sources
  drop constraint course_source_revisions_identity_v1,
  drop constraint course_source_revisions_metadata_v1,
  drop constraint course_source_revisions_status_v1;
update private.course_sources source
set status='active',kind='other',title='Referência importada',
  citation_text=nullif(btrim(left(source.source_id,2048)),''),origin='imported',
  availability='unknown',verification_status='unverified',
  study_visibility='hidden'
where source.status='unresolved_legacy';
update private.course_sources source
set origin='imported' where source.origin='imported_legacy';
update private.course_source_attribution_sources source_link
set relation='needs_verification' where source_link.relation='legacy_reference';
create temporary table course_source_identity_cut(
  course_id uuid not null,
  previous_source_id text not null,
  current_source_id text not null,
  primary key(course_id,previous_source_id),
  unique(course_id,current_source_id)
) on commit drop;
insert into course_source_identity_cut(
  course_id,previous_source_id,current_source_id
)
select source.course_id,source.source_id,extensions.gen_random_uuid()::text
from private.course_sources source
where char_length(source.source_id)>240 or source.source_id<>btrim(source.source_id);
delete from private.course_source_pdf_upload_intents intent
using course_source_identity_cut identity
where intent.course_id=identity.course_id
  and intent.source_id=identity.previous_source_id;
update private.course_source_pdf_delete_intents intent
set source_id=identity.current_source_id
from course_source_identity_cut identity
where intent.course_id=identity.course_id
  and intent.source_id=identity.previous_source_id;
update private.course_anchored_annotations annotation
set target_id=identity.current_source_id,
  observed_path=(
    select jsonb_agg(case
      when entry.value->>'kind'='source'
        and entry.value->>'id'=identity.previous_source_id
        then jsonb_set(
          entry.value,'{id}',to_jsonb(identity.current_source_id),false
        )
      else entry.value
    end order by entry.ordinal)
    from jsonb_array_elements(annotation.observed_path)
      with ordinality entry(value,ordinal)
  )
from course_source_identity_cut identity
where annotation.course_id=identity.course_id
  and annotation.target_kind='source'
  and annotation.target_id=identity.previous_source_id;
update private.course_anchored_annotations annotation
set observed_path=(
  select jsonb_agg(case
    when entry.value->>'kind'='source' and identity.current_source_id is not null
      then jsonb_set(entry.value,'{id}',to_jsonb(identity.current_source_id),false)
    else entry.value
  end order by entry.ordinal)
  from jsonb_array_elements(annotation.observed_path)
    with ordinality entry(value,ordinal)
  left join course_source_identity_cut identity
    on identity.course_id=annotation.course_id
   and identity.previous_source_id=entry.value->>'id'
)
where exists(
  select 1
  from jsonb_array_elements(annotation.observed_path) entry(value)
  join course_source_identity_cut identity
    on identity.course_id=annotation.course_id
   and identity.previous_source_id=entry.value->>'id'
  where entry.value->>'kind'='source'
);
alter table private.course_anchored_annotations
  drop constraint course_anchored_annotations_owner_response_v1;
update private.course_anchored_annotations annotation
set owner_response_source_links=(
  select jsonb_agg(
    (link.value-'sourceRevision'-'anchors')
      ||jsonb_build_object(
        'sourceId',coalesce(
          identity.current_source_id,link.value->>'sourceId'
        ),
        'anchors',coalesce((
          select jsonb_agg(anchor.value-'anchorRevision' order by anchor.ordinal)
          from jsonb_array_elements(link.value->'anchors')
            with ordinality anchor(value,ordinal)
        ),'[]'::jsonb)
      )
    order by link.ordinal
  )
  from jsonb_array_elements(annotation.owner_response_source_links)
    with ordinality link(value,ordinal)
  left join course_source_identity_cut identity
    on identity.course_id=annotation.course_id
   and identity.previous_source_id=link.value->>'sourceId'
)
where annotation.owner_response_source_links<>'[]'::jsonb;
-- Recibos são idempotência efêmera, não autoridade. Um replay anterior ao
-- rekey devolveria a identidade substituída; invalide-o no corte atômico.
delete from private.course_change_receipts receipt
where receipt.operation in(
    'execute_course_source_command','ingest_course_source_pdf'
  ) and exists(
    select 1 from course_source_identity_cut identity
    where identity.course_id=receipt.course_id and (
      receipt.result#>>'{change,subjectId}'=identity.previous_source_id
      or receipt.result->>'sourceId'=identity.previous_source_id
      or receipt.result#>>'{source,sourceId}'=identity.previous_source_id
    )
  );
update private.course_sources source
set source_id=identity.current_source_id
from course_source_identity_cut identity
where source.course_id=identity.course_id
  and source.source_id=identity.previous_source_id;
create or replace function private.course_source_links_v1(
  p_course_id uuid,
  p_attribution_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,private
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'sourceId',source_link.source_id,
    'relation',source_link.relation,
    'anchors',coalesce((
      select jsonb_agg(jsonb_build_object(
        'anchorId',anchor_link.anchor_id
      ) order by anchor_link.anchor_ordinal)
      from private.course_source_attribution_anchors anchor_link
      where anchor_link.course_id=source_link.course_id
        and anchor_link.attribution_id=source_link.attribution_id
        and anchor_link.source_ordinal=source_link.source_ordinal
    ),'[]'::jsonb)
  ) order by source_link.source_ordinal),'[]'::jsonb)
  from private.course_source_attribution_sources source_link
  where source_link.course_id=p_course_id
    and source_link.attribution_id=p_attribution_id
$function$;
revoke all on function private.course_source_links_v1(uuid,uuid)
from public,anon,authenticated,service_role;
alter table private.course_source_attribution_anchors
  drop constraint course_source_attribution_anchors_source_link_fk_v2,
  drop constraint course_source_attribution_anchors_anchor_fk_v2,
  drop constraint course_source_attribution_anchors_value_v1;
alter table private.course_source_attribution_sources
  drop constraint course_source_attribution_sources_source_fk_v2,
  drop constraint course_source_attribution_sou_course_id_attribution_id_sour_key,
  drop constraint course_source_attribution_sources_value_v1;
alter table private.course_source_attribution_sources
  drop column source_revision,
  add constraint course_source_attribution_sources_current_identity_v1
    unique(course_id,attribution_id,source_ordinal,source_id),
  add constraint course_source_attribution_sources_value_v3 check(
    source_ordinal between 0 and 31
      and nullif(btrim(source_id),'') is not null
      and source_id=btrim(source_id) and char_length(source_id)<=240
      and source_id!~'[[:cntrl:]]'
      and relation in(
        'informed_by','supported_by','adapted_from','quoted_from',
        'contrasted_with','exemplified_by','inspired_by','needs_verification'
      )
  );
alter table private.course_source_attribution_anchors
  drop column source_revision,
  drop column anchor_revision,
  add constraint course_source_attribution_anchors_value_v2 check(
    source_ordinal between 0 and 31 and anchor_ordinal between 0 and 7
      and nullif(btrim(source_id),'') is not null
      and source_id=btrim(source_id) and char_length(source_id)<=240
      and source_id!~'[[:cntrl:]]'
      and nullif(btrim(anchor_id),'') is not null
      and anchor_id=btrim(anchor_id) and char_length(anchor_id)<=240
      and anchor_id!~'[[:cntrl:]]'
  );
alter table private.course_source_anchors
  add constraint course_source_anchors_current_source_identity_v1
    unique(course_id,anchor_id,source_id);
alter table private.course_source_attribution_sources
  add constraint course_source_attribution_sources_current_source_fk_v1
    foreign key(course_id,source_id)
    references private.course_sources(course_id,source_id)
    on update cascade on delete cascade;
alter table private.course_source_attribution_anchors
  add constraint course_source_attribution_anchors_current_source_link_fk_v1
    foreign key(course_id,attribution_id,source_ordinal,source_id)
    references private.course_source_attribution_sources(
      course_id,attribution_id,source_ordinal,source_id
    ) on update cascade on delete cascade,
  add constraint course_source_attribution_anchors_current_anchor_fk_v1
    foreign key(course_id,anchor_id,source_id)
    references private.course_source_anchors(course_id,anchor_id,source_id)
    on update cascade on delete cascade;
alter table private.course_sources
  add constraint course_sources_identity_v2 check(
    nullif(btrim(source_id),'') is not null and source_id=btrim(source_id)
      and char_length(source_id)<=240 and source_id!~'[[:cntrl:]]'
      and revision>0
  ),
  add constraint course_sources_status_v2 check(
    status in('active','retired')
      and kind in('web_page','article','book','document','media','other')
      and origin in('external','author_provided','imported')
      and availability in('open_access','restricted','private','unknown')
      and verification_status in('unverified','author_verified')
      and study_visibility in('hidden','citation','citation_and_link')
  ),
  add constraint course_sources_metadata_v2 check(
    nullif(btrim(title),'') is not null and title=btrim(title)
      and char_length(title)<=300 and title!~'[[:cntrl:]]'
      and (authorship is null or nullif(btrim(authorship),'') is not null
        and authorship=btrim(authorship) and char_length(authorship)<=500
        and authorship!~'[[:cntrl:]]')
      and private.valid_course_source_publication_date_v1(publication_date)
      and (identifier is null or nullif(btrim(identifier),'') is not null
        and identifier=btrim(identifier) and char_length(identifier)<=240
        and identifier!~'[[:cntrl:]]')
      and (citation_text is null or nullif(btrim(citation_text),'') is not null
        and char_length(citation_text)<=2048
        and translate(citation_text,E'\n\r\t','')!~'[[:cntrl:]]')
      and (url is null or url=btrim(url) and char_length(url)<=2048
        and url~'^https://[^[:space:]]+$')
      and (edition_or_version is null
        or nullif(btrim(edition_or_version),'') is not null
          and edition_or_version=btrim(edition_or_version)
          and char_length(edition_or_version)<=120
          and edition_or_version!~'[[:cntrl:]]')
      and (study_visibility='hidden' or citation_text is not null)
  );
alter table private.course_sources drop column actor_id;
alter table private.course_source_anchors drop column actor_id;
create or replace function private.course_effective_source_attribution_v1(
  p_course_id uuid,
  p_target_kind text,
  p_target_id text
)
returns private.course_source_attributions
language sql
stable
security definer
set search_path=pg_catalog,private
as $function$
  select attribution
  from private.course_source_attributions attribution
  cross join lateral private.course_source_target_state_v1(
    p_course_id,p_target_kind,p_target_id
  ) state
  where attribution.course_id=p_course_id
    and attribution.target_kind=p_target_kind
    and attribution.target_id=p_target_id
    and attribution.target_version=(state->>'version')::bigint
    and attribution.target_hash=state->>'hash'
$function$;
revoke all on function private.course_effective_source_attribution_v1(
  uuid,text,text
) from public,anon,authenticated,service_role;
drop index private.course_source_attributions_target_v1_idx;
alter table private.course_source_attributions drop column actor_id;
alter table private.course_source_attributions
  drop constraint course_source_attributions_target_v1,
  drop column attribution_hash,
  drop column revision,
  add constraint course_source_attributions_target_v2 check(
    target_kind in('plan_item','study_unit')
      and nullif(btrim(target_id),'') is not null
      and target_id=btrim(target_id) and char_length(target_id)<=240
      and target_id!~'[[:cntrl:]]'
      and target_version>0
      and target_hash~'^[a-f0-9]{64}$'
  );
alter table private.course_source_attachments
  drop column actor_id,
  drop column updated_by,
  drop column removed_by;
alter table private.course_source_attachments
  drop constraint course_source_attachments_value_v2,
  add constraint course_source_attachments_value_v3 check(
    nullif(btrim(source_id),'') is not null and source_id=btrim(source_id)
      and char_length(source_id)<=240 and source_id!~'[[:cntrl:]]'
      and source_revision>0 and content_hash~'^[a-f0-9]{64}$'
      and byte_size between 1 and 20971520 and media_type='application/pdf'
      and storage_path~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[a-f0-9]{64}[.]pdf$'
      and split_part(storage_path,'/',2)=content_hash||'.pdf'
  );
create function private.valid_course_annotation_path_v2(p_value jsonb)
returns boolean
language sql
immutable
security definer
set search_path=pg_catalog
as $function$
  select coalesce(
    jsonb_typeof(p_value)='array'
    and jsonb_array_length(p_value) between 1 and 5
    and octet_length(p_value::text)<=16384
    and p_value->0->>'kind'='course'
    and not exists(
      select 1 from jsonb_array_elements(p_value) entry(value)
      where jsonb_typeof(entry.value)<>'object'
        or not (entry.value ?& array['kind','id','label','version'])
        or entry.value-'kind'-'id'-'label'-'version'<>'{}'::jsonb
        or entry.value->>'kind' not in(
          'course','module','lesson','topic','didactic_microsequence',
          'study_unit','source','source_anchor'
        )
        or nullif(btrim(entry.value->>'id'),'') is null
        or entry.value->>'id'<>btrim(entry.value->>'id')
        or char_length(entry.value->>'id')>240
        or octet_length(entry.value->>'id')>960
        or entry.value->>'id'~'[[:cntrl:]]'
        or entry.value->'label'<>'null'::jsonb and (
          jsonb_typeof(entry.value->'label')<>'string'
          or not private.valid_course_annotation_text_v1(
            entry.value->>'label',300,1200,false
          )
        )
        or entry.value->'version'<>'null'::jsonb and (
          jsonb_typeof(entry.value->'version')<>'number'
          or entry.value->>'version'!~'^[1-9][0-9]*$'
        )
    ),false
  )
$function$;
revoke all on function private.valid_course_annotation_path_v2(jsonb)
from public,anon,authenticated,service_role;
alter table private.course_anchored_annotations
  drop constraint course_anchored_annotations_target_v1,
  add constraint course_anchored_annotations_target_v2 check(
    target_kind in(
      'course','module','lesson','topic','didactic_microsequence','study_unit',
      'source','source_anchor'
    )
      and nullif(btrim(target_id),'') is not null
      and target_id=btrim(target_id)
      and char_length(target_id)<=240
      and octet_length(target_id)<=960
      and target_id!~'[[:cntrl:]]'
      and private.valid_course_annotation_path_v2(observed_path)
      and observed_path->0->>'id'=course_id::text
      and observed_path->-1->>'kind'=target_kind
      and observed_path->-1->>'id'=target_id
  );
alter table private.course_anchored_annotations
  add constraint course_anchored_annotations_owner_response_v2 check(
    private.valid_course_source_links_shape_v2(owner_response_source_links)
      and (
        owner_response is null and owner_response_kind is null
          and owner_response_source_links='[]'::jsonb
        or owner_response is not null and owner_response_kind='answer'
          and owner_response_source_links='[]'::jsonb
        or owner_response is not null and owner_response_kind='reformulation'
          and jsonb_array_length(owner_response_source_links)>0
      )
  );
alter table private.course_source_pdf_upload_intents
  drop constraint course_source_pdf_upload_intents_values_v2,
  add constraint course_source_pdf_upload_intents_values_v3 check(
    storage_path~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[a-f0-9]{64}[.]pdf$'
      and split_part(storage_path,'/',2)=content_hash||'.pdf'
      and content_hash~'^[a-f0-9]{64}$' and byte_size between 1 and 20971520
      and media_type='application/pdf' and nullif(btrim(source_id),'') is not null
      and source_id=btrim(source_id) and char_length(source_id)<=240
      and source_revision>0 and course_revision>0
  );
alter table private.course_source_pdf_delete_intents
  drop constraint course_source_pdf_delete_intents_value_v1,
  add constraint course_source_pdf_delete_intents_value_v2 check(
    request_id~'^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
      and nullif(btrim(source_id),'') is not null and source_id=btrim(source_id)
      and char_length(source_id)<=240 and source_id!~'[[:cntrl:]]'
      and content_hash~'^[a-f0-9]{64}$'
      and storage_path~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[a-f0-9]{64}[.]pdf$'
      and split_part(storage_path,'/',2)=content_hash||'.pdf'
      and state in('pending','deleting')
  );
alter table private.course_sources
  rename constraint course_source_revisions_course_id_fkey
    to course_sources_course_id_fkey;
alter table private.course_source_anchors
  rename constraint course_source_anchor_revisions_course_id_fkey
    to course_source_anchors_course_id_fkey;
alter table private.course_source_anchors
  rename constraint course_source_anchor_revisions_excerpt_v1
    to course_source_anchors_excerpt_v1;
alter table private.course_source_anchors
  rename constraint course_source_anchor_revisions_human_locator_v1
    to course_source_anchors_human_locator_v1;
alter table private.course_source_anchors
  rename constraint course_source_anchor_revisions_identity_v1
    to course_source_anchors_identity_v1;
alter table private.course_source_anchors
  rename constraint course_source_anchor_revisions_selector_v1
    to course_source_anchors_selector_v1;

drop function private.reject_course_source_fact_change_v1();

create function private.valid_course_source_pdf_ingestion_intent_v2(
  p_source_intent jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog,private
as $function$
declare
  v_source jsonb;
begin
  if jsonb_typeof(p_source_intent) is distinct from 'object'
     or octet_length(p_source_intent::text)>196608
     or jsonb_typeof(p_source_intent->'mode')<>'string'
     or jsonb_typeof(p_source_intent->'sourceId')<>'string'
     or char_length(p_source_intent->>'sourceId') not between 1 and 240
     or p_source_intent->>'sourceId'<>btrim(p_source_intent->>'sourceId')
     or p_source_intent->>'sourceId'~'[[:cntrl:]]' then
    return false;
  end if;
  if p_source_intent->>'mode'='existing' then
    return p_source_intent-'mode'-'sourceId'-'sourceRevision'='{}'::jsonb
      and p_source_intent ?& array['mode','sourceId','sourceRevision']
      and jsonb_typeof(p_source_intent->'sourceRevision')='number'
      and p_source_intent->>'sourceRevision'~'^[1-9][0-9]*$';
  end if;
  if p_source_intent->>'mode'<>'save'
     or p_source_intent-'mode'-'sourceId'-'expectedSourceRevision'-'source'
       <>'{}'::jsonb
     or not (p_source_intent ?& array[
       'mode','sourceId','expectedSourceRevision','source'
     ])
     or jsonb_typeof(p_source_intent->'expectedSourceRevision')<>'number'
     or p_source_intent->>'expectedSourceRevision'!~'^[0-9]+$'
     or jsonb_typeof(p_source_intent->'source')<>'object' then
    return false;
  end if;
  v_source:=p_source_intent->'source';
  return v_source-'kind'-'title'-'authorship'-'publicationDate'-'identifier'
      -'language'-'citationText'-'url'-'editionOrVersion'-'origin'
      -'availability'-'verificationStatus'-'studyVisibility'='{}'::jsonb
    and v_source ?& array[
      'kind','title','authorship','publicationDate','identifier','language',
      'citationText','url','editionOrVersion','origin','availability',
      'verificationStatus','studyVisibility'
    ]
    and v_source->>'kind' in(
      'web_page','article','book','document','media','other'
    )
    and jsonb_typeof(v_source->'title')='string'
    and nullif(btrim(v_source->>'title'),'') is not null
    and v_source->>'title'=btrim(v_source->>'title')
    and char_length(v_source->>'title')<=300
    and v_source->>'title'!~'[[:cntrl:]]'
    and jsonb_typeof(v_source->'authorship') in('string','null')
    and (v_source->>'authorship' is null or (
      nullif(btrim(v_source->>'authorship'),'') is not null
      and v_source->>'authorship'=btrim(v_source->>'authorship')
      and char_length(v_source->>'authorship')<=500
      and v_source->>'authorship'!~'[[:cntrl:]]'
    ))
    and jsonb_typeof(v_source->'publicationDate') in('string','null')
    and private.valid_course_source_publication_date_v1(
      v_source->>'publicationDate'
    )
    and jsonb_typeof(v_source->'identifier') in('string','null')
    and (v_source->>'identifier' is null or (
      nullif(btrim(v_source->>'identifier'),'') is not null
      and v_source->>'identifier'=btrim(v_source->>'identifier')
      and char_length(v_source->>'identifier')<=240
      and v_source->>'identifier'!~'[[:cntrl:]]'
    ))
    and jsonb_typeof(v_source->'language') in('string','null')
    and (v_source->>'language' is null or (
      v_source->>'language'=btrim(v_source->>'language')
      and char_length(v_source->>'language')<=35
      and v_source->>'language'~'^[A-Za-z]{2,3}(-[A-Za-z]{4})?(-([A-Za-z]{2}|[0-9]{3}))?(-([A-Za-z0-9]{5,8}|[0-9][A-Za-z0-9]{3}))*$'
    ))
    and jsonb_typeof(v_source->'citationText') in('string','null')
    and (v_source->>'citationText' is null or (
      nullif(btrim(v_source->>'citationText'),'') is not null
      and char_length(v_source->>'citationText')<=2048
      and translate(v_source->>'citationText',E'\n\r\t','')!~'[[:cntrl:]]'
    ))
    and jsonb_typeof(v_source->'url') in('string','null')
    and (v_source->>'url' is null or (
      v_source->>'url'=btrim(v_source->>'url')
      and char_length(v_source->>'url')<=2048
      and v_source->>'url'~'^https://[^[:space:]]+$'
    ))
    and jsonb_typeof(v_source->'editionOrVersion') in('string','null')
    and (v_source->>'editionOrVersion' is null or (
      nullif(btrim(v_source->>'editionOrVersion'),'') is not null
      and v_source->>'editionOrVersion'=btrim(v_source->>'editionOrVersion')
      and char_length(v_source->>'editionOrVersion')<=120
      and v_source->>'editionOrVersion'!~'[[:cntrl:]]'
    ))
    and v_source->>'origin' in('external','author_provided','imported')
    and v_source->>'availability' in(
      'open_access','restricted','private','unknown'
    )
    and v_source->>'verificationStatus' in(
      'unverified','author_verified'
    )
    and v_source->>'studyVisibility' in(
      'hidden','citation','citation_and_link'
    )
    and (v_source->>'studyVisibility'='hidden'
      or v_source->>'citationText' is not null);
exception when others then
  return false;
end;
$function$;

revoke all on function
  private.valid_course_source_pdf_ingestion_intent_v2(jsonb)
from public,anon,authenticated,service_role;

create function public.get_course_source_pdf_download_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_course_revision bigint,
  p_source_id text,
  p_source_revision bigint,
  p_content_hash text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog,public,private
as $function$
declare
  v_course public.courses%rowtype;
  v_source private.course_sources%rowtype;
  v_attachment private.course_source_attachments%rowtype;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_course_revision is null or p_expected_course_revision<1
     or p_source_id is null or char_length(p_source_id) not between 1 and 240
     or p_source_id<>btrim(p_source_id) or p_source_id~'[[:cntrl:]]'
     or p_source_revision is null or p_source_revision<1
     or p_content_hash is null or p_content_hash!~'^[a-f0-9]{64}$' then
    raise exception 'Pedido de download do PDF inválido.' using errcode='22023';
  end if;
  select * into strict v_course
  from public.courses course where course.id=p_course_id;
  if v_course.revision<>p_expected_course_revision then
    raise exception 'O Curso mudou; releia a Fonte antes do download.'
      using errcode='40001';
  end if;
  select * into v_source from private.course_sources source
  where source.course_id=p_course_id and source.source_id=p_source_id;
  if not found or v_source.status<>'active'
     or v_source.revision<>p_source_revision then
    raise exception 'Fonte inexistente ou desatualizada.' using errcode='PT404';
  end if;
  select * into v_attachment
  from private.course_source_attachments attachment
  where attachment.course_id=p_course_id and attachment.source_id=p_source_id
    and attachment.source_revision=p_source_revision
    and attachment.content_hash=p_content_hash and attachment.status='active';
  if not found then
    raise exception 'PDF ativo inexistente.' using errcode='PT404';
  end if;
  return jsonb_build_object(
    'contract','aralearn.course-source-pdf-download.v1',
    'courseId',p_course_id,'courseRevision',v_course.revision,
    'sourceId',p_source_id,'sourceRevision',p_source_revision,
    'storageOriginCourseId',split_part(v_attachment.storage_path,'/',1),
    'attachment',jsonb_build_object(
      'contentHash',v_attachment.content_hash,
      'byteSize',v_attachment.byte_size,
      'mediaType',v_attachment.media_type,
      'storagePath',v_attachment.storage_path,
      'createdAt',v_attachment.created_at
    )
  );
end;
$function$;

revoke all on function public.get_course_source_pdf_download_for_actor_v1(
  uuid,uuid,bigint,text,bigint,text
) from public,anon,authenticated,service_role;
grant execute on function public.get_course_source_pdf_download_for_actor_v1(
  uuid,uuid,bigint,text,bigint,text
) to service_role;

-- Ingestão server-side grava Fonte e PDF numa única operação corrente.
CREATE OR REPLACE FUNCTION private.ingest_course_source_pdf_core_v1(p_actor_id uuid, p_course_id uuid, p_expected_revision bigint, p_source_intent jsonb, p_attachment jsonb, p_channel text, p_request_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_source_result jsonb;
  v_attachment private.course_source_attachments%rowtype;
  v_attachment_changed boolean := false;
  v_source_id text;
  v_source_revision bigint;
  v_content_hash text;
  v_byte_size bigint;
  v_media_type text;
  v_storage_path text;
  v_linked_storage_path text;
  v_course_revision bigint;
  v_internal_token text;
  v_request_fingerprint text;
  v_prepared_fingerprint text;
  v_preparation_found boolean;
  v_changed boolean;
  v_idempotent boolean;
  v_source_changed boolean := false;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_revision is null or p_expected_revision < 1
     or not private.valid_course_source_pdf_ingestion_intent_v2(p_source_intent)
     or p_channel not in('application','mcp')
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or jsonb_typeof(p_attachment) is distinct from 'object'
     or p_attachment
       - 'contentHash' - 'byteSize' - 'mediaType' - 'storagePath'
       <> '{}'::jsonb
     or not (p_attachment ?& array[
       'contentHash','byteSize','mediaType','storagePath'
     ])
     or jsonb_typeof(p_attachment->'contentHash') <> 'string'
     or p_attachment->>'contentHash' !~ '^[a-f0-9]{64}$'
     or jsonb_typeof(p_attachment->'byteSize') <> 'number'
     or p_attachment->>'byteSize' !~ '^[1-9][0-9]*$'
     or (p_attachment->>'byteSize')::bigint not between 1 and 20971520
     or p_attachment->>'mediaType' <> 'application/pdf'
     or jsonb_typeof(p_attachment->'storagePath') <> 'string' then
    raise exception 'Finalização de ingestão PDF inválida.' using errcode = '22023';
  end if;
  v_source_id := p_source_intent->>'sourceId';
  v_source_revision := case when p_source_intent->>'mode' = 'existing'
    then (p_source_intent->>'sourceRevision')::bigint
    else (p_source_intent->>'expectedSourceRevision')::bigint + 1
  end;
  v_content_hash := p_attachment->>'contentHash';
  v_byte_size := (p_attachment->>'byteSize')::bigint;
  v_media_type := p_attachment->>'mediaType';
  v_storage_path := p_attachment->>'storagePath';
  v_request_fingerprint := private.course_source_json_hash_v1(
    jsonb_build_object(
      'courseId',p_course_id,
      'expectedRevision',p_expected_revision,
      'sourceIntent',p_source_intent,
      'contentHash',v_content_hash,
      'byteSize',v_byte_size,
      'mediaType',v_media_type
    )
  );
  v_internal_token := substr(private.course_source_json_hash_v1(
    jsonb_build_object(
      'actorId',p_actor_id,'requestId',p_request_id,
      'operation','course_source_pdf_ingestion'
    )
  ),1,48);
  select linked_attachment.storage_path into v_linked_storage_path
  from private.course_source_attachments linked_attachment
  where linked_attachment.course_id = p_course_id
    and linked_attachment.source_id = v_source_id
    and linked_attachment.source_revision = v_source_revision
    and linked_attachment.content_hash = v_content_hash
    and linked_attachment.byte_size = v_byte_size
    and linked_attachment.media_type = v_media_type;
  if found then
    v_storage_path := v_linked_storage_path;
  end if;
  if v_storage_path is null
     or v_storage_path
       !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[a-f0-9]{64}[.]pdf$'
     or split_part(v_storage_path,'/',2) <> v_content_hash || '.pdf'
     or split_part(v_storage_path,'/',1) <> p_course_id::text and not exists(
       select 1 from private.course_source_attachments linked_attachment
       where linked_attachment.course_id = p_course_id
         and linked_attachment.source_id = v_source_id
         and linked_attachment.source_revision = v_source_revision
         and linked_attachment.content_hash = v_content_hash
         and linked_attachment.byte_size = v_byte_size
         and linked_attachment.media_type = v_media_type
         and linked_attachment.storage_path = v_storage_path
     ) then
    raise exception 'O path do PDF não corresponde ao Curso e ao hash.'
      using errcode = '23514';
  end if;
  select intent.request_fingerprint into v_prepared_fingerprint
  from private.course_source_pdf_upload_intents intent
  where intent.actor_id = p_actor_id
    and intent.course_id = p_course_id
    and intent.storage_path = v_storage_path
    and intent.request_id = p_request_id
    and intent.expires_at > statement_timestamp();
  v_preparation_found := found;
  if v_preparation_found
     and v_prepared_fingerprint is distinct from v_request_fingerprint then
    raise exception 'A finalização diverge do preparo do PDF.'
      using errcode = '23514';
  end if;
  if not v_preparation_found then
    raise exception 'O preparo do PDF expirou; prepare novamente.'
      using errcode = '40001';
  end if;
  if p_source_intent->>'mode' = 'save' then
    v_source_result := public.execute_course_source_command_for_actor_v1(
      p_actor_id,p_course_id,p_expected_revision,
      jsonb_build_object(
        'type','save_source',
        'sourceId',v_source_id,
        'expectedSourceRevision',
          (p_source_intent->>'expectedSourceRevision')::bigint,
        'source',p_source_intent->'source'
      ),
      p_channel,'pdfsrc:' || v_internal_token
    );
    v_course_revision := (v_source_result->>'courseRevision')::bigint;
    v_source_changed := (v_source_result->>'changed')::boolean;
  else
    v_course_revision := p_expected_revision;
  end if;
  if not exists(
    select 1 from private.course_sources source
    where source.course_id=p_course_id and source.source_id=v_source_id
      and source.revision=v_source_revision and source.status='active'
  ) or not private.valid_course_source_pdf_object_v1(
    v_storage_path,v_byte_size,v_media_type
  ) then
    raise exception 'A Fonte ou o objeto PDF corrente é inválido.'
      using errcode='23514';
  end if;
  select * into v_attachment
  from private.course_source_attachments attachment
  where attachment.course_id=p_course_id and attachment.source_id=v_source_id
    and attachment.content_hash=v_content_hash
  for update;
  if found and row(v_attachment.byte_size,v_attachment.media_type,v_attachment.storage_path)
       is distinct from row(v_byte_size,v_media_type,v_storage_path) then
    raise exception 'O PDF corrente divergiu do objeto preparado.'
      using errcode='23514';
  elsif not found then
    insert into private.course_source_attachments(
      course_id,source_id,source_revision,content_hash,byte_size,media_type,
      storage_path
    ) values(
      p_course_id,v_source_id,v_source_revision,v_content_hash,v_byte_size,
      v_media_type,v_storage_path
    ) returning * into v_attachment;
    v_attachment_changed:=true;
  elsif v_attachment.status='removed' then
    if exists(
      select 1 from private.course_source_pdf_delete_intents intent
      where intent.storage_path=v_storage_path and intent.state='deleting'
    ) then
      raise exception 'A remoção física deste PDF já começou.'
        using errcode='40001';
    end if;
    delete from private.course_source_pdf_delete_intents intent
    where intent.storage_path=v_storage_path and intent.state='pending';
    update private.course_source_attachments attachment set
      status='active',version=attachment.version+1,updated_at=clock_timestamp(),
      removed_at=null,
      removed_course_revision=null
    where attachment.course_id=p_course_id and attachment.source_id=v_source_id
      and attachment.content_hash=v_content_hash
    returning * into v_attachment;
    v_attachment_changed:=true;
  end if;
  if v_attachment_changed and not v_source_changed then
    update public.courses course
    set revision=course.revision+1,updated_at=now()
    where course.id=p_course_id returning revision into v_course_revision;
  elsif v_attachment_changed then
    select course.revision into v_course_revision
    from public.courses course where course.id=p_course_id;
  end if;
  v_changed:=v_source_changed or v_attachment_changed;
  v_idempotent:=false;
  delete from private.course_source_pdf_upload_intents intent
  where intent.actor_id = p_actor_id
    and intent.course_id = p_course_id
    and intent.storage_path = v_storage_path
    and intent.request_id = p_request_id;

  return jsonb_build_object(
    'contract','aralearn.course-source-pdf-ingestion.v1',
    'courseId',p_course_id,
    'courseRevision',v_course_revision,
    'requestId',p_request_id,
    'idempotent',v_idempotent,
    'changed',v_changed,
    'change',case when v_changed then jsonb_build_object(
      'type','ingest_pdf','subjectId',v_source_id,'revision',v_source_revision
    ) else null end,
    'source',jsonb_build_object(
      'sourceId',v_source_id,'sourceRevision',v_source_revision,
      'bibliographyChanged',v_source_changed
    ),
    'attachment',jsonb_build_object(
      'contentHash',v_content_hash,'byteSize',v_byte_size,
      'mediaType',v_media_type,'storagePath',v_storage_path
    ),
    'stored',true
  );
end;
$function$;


create or replace function private.guard_course_source_attachment_lifecycle_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog,public,private
as $function$
begin
  if tg_op = 'DELETE' then
    if not exists(select 1 from public.courses course where course.id=old.course_id) then
      return old;
    end if;
    raise exception 'O vínculo corrente do PDF não pode ser apagado diretamente.'
      using errcode='55000';
  end if;
  if tg_op = 'INSERT' then
    new.updated_at:=coalesce(new.updated_at,new.created_at,now());
    if new.status='active' and exists(
      select 1 from private.course_source_pdf_delete_intents intent
      where intent.storage_path=new.storage_path
    ) then
      raise exception 'A remoção física deste PDF ainda está em andamento.'
        using errcode='40001';
    end if;
    return new;
  end if;
  if new.source_revision<>old.source_revision
     and (to_jsonb(new)-'source_revision')=(to_jsonb(old)-'source_revision')
     and exists(
       select 1 from private.course_sources source
       where source.course_id=new.course_id and source.source_id=new.source_id
         and source.revision=new.source_revision
     ) then
    return new;
  end if;
  if row(new.course_id,new.source_id,new.source_revision,new.content_hash,
      new.byte_size,new.media_type,new.storage_path,new.created_at)
     is distinct from row(old.course_id,old.source_id,old.source_revision,
      old.content_hash,old.byte_size,old.media_type,old.storage_path,old.created_at)
     or new.status=old.status or new.version<>old.version+1
     or new.updated_at<=old.updated_at then
    raise exception 'A transição do vínculo PDF é inválida.' using errcode='55000';
  end if;
  if new.status='removed' and(
       new.removed_at is null or new.removed_course_revision is null
     ) then
    raise exception 'O tombstone do PDF está incompleto.' using errcode='55000';
  end if;
  if new.status='active' then
    if new.removed_at is not null or new.removed_course_revision is not null then
      raise exception 'A reativação precisa limpar o tombstone do PDF.'
        using errcode='55000';
    end if;
    if exists(
      select 1 from private.course_source_pdf_delete_intents intent
      where intent.storage_path=new.storage_path
    ) then
      raise exception 'A remoção física deste PDF ainda está em andamento.'
        using errcode='40001';
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function private.guard_course_source_attachment_lifecycle_v1()
from public,anon,authenticated,service_role;
create trigger course_source_attachments_lifecycle_v1
before insert or update or delete on private.course_source_attachments
for each row execute function private.guard_course_source_attachment_lifecycle_v1();

-- Fonte corrente: uma única implementação de comandos.
create or replace function public.execute_course_source_command_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_revision bigint,
  p_command jsonb,
  p_channel text,
  p_request_id text
)
returns jsonb
language sql
volatile
security definer
set search_path=pg_catalog,private
as $function$
  select private.execute_course_source_command_core_v1(
    p_actor_id,p_course_id,p_expected_revision,p_command,p_channel,p_request_id
  )
$function$;

revoke all on function public.execute_course_source_command_for_actor_v1(
  uuid,uuid,bigint,jsonb,text,text
) from public,anon,authenticated,service_role;
grant execute on function public.execute_course_source_command_for_actor_v1(
  uuid,uuid,bigint,jsonb,text,text
) to service_role;
-- Fonte corrente: public.get_course_study_citations_v1(uuid,bigint,text)
create or replace function public.get_course_study_citations_v1(
  p_course_id uuid,
  p_expected_revision bigint,
  p_study_unit_id text
)
returns jsonb
language sql
volatile
security definer
set search_path=pg_catalog,private
as $function$
  select private.get_course_study_citations_core_v1(
    p_course_id,p_expected_revision,p_study_unit_id
  )
$function$;

revoke all on function public.get_course_study_citations_v1(uuid,bigint,text)
from public,anon,service_role;
grant execute on function public.get_course_study_citations_v1(uuid,bigint,text)
to authenticated;
-- Fonte corrente: preparo server-side único, inclusive para reativação.
create or replace function public.prepare_course_source_pdf_ingestion_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_revision bigint,
  p_source_intent jsonb,
  p_content_hash text,
  p_byte_size bigint,
  p_media_type text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
begin
  return private.prepare_course_source_pdf_ingestion_core_v1(
    p_actor_id,p_course_id,p_expected_revision,p_source_intent,p_content_hash,
    p_byte_size,p_media_type,p_request_id
  );
end;
$function$;

revoke all on function public.prepare_course_source_pdf_ingestion_for_actor_v1(
  uuid,uuid,bigint,jsonb,text,bigint,text,text
) from public,anon,authenticated,service_role;
grant execute on function public.prepare_course_source_pdf_ingestion_for_actor_v1(
  uuid,uuid,bigint,jsonb,text,bigint,text,text
) to service_role;
CREATE OR REPLACE FUNCTION public.get_course_source_pdf_ingestion_receipt_for_actor_v1(p_actor_id uuid, p_course_id uuid, p_expected_revision bigint, p_source_intent jsonb, p_file_identity jsonb, p_channel text, p_request_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_context_hash text;
  v_receipt private.course_change_receipts%rowtype;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_revision is null or p_expected_revision < 1
     or not private.valid_course_source_pdf_ingestion_intent_v2(p_source_intent)
     or not private.valid_course_source_pdf_file_identity_v1(p_file_identity)
     or p_channel not in('application','mcp')
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'Consulta de recibo de ingestão PDF inválida.'
      using errcode = '22023';
  end if;
  v_context_hash := private.course_source_json_hash_v1(jsonb_build_object(
    'courseId',p_course_id,
    'expectedRevision',p_expected_revision,
    'sourceIntent',p_source_intent,
    'fileIdentity',p_file_identity,
    'channel',p_channel
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:' || p_actor_id::text || ':' || p_request_id,0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  select * into v_receipt
  from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id;
  if not found then
    return null;
  end if;
  if v_receipt.operation <> 'ingest_course_source_pdf'
     or v_receipt.course_id <> p_course_id
     or v_receipt.result->>'_ingestionContextHash' is distinct from v_context_hash then
    raise exception 'requestId reutilizado com ingestão de PDF incompatível.'
      using errcode = '23514';
  end if;
  return (v_receipt.result - '_ingestionContextHash' - 'idempotent')
    || jsonb_build_object('idempotent',true);
end;
$function$;

revoke all on function public.get_course_source_pdf_ingestion_receipt_for_actor_v1(
  uuid,uuid,bigint,jsonb,jsonb,text,text
) from public,anon,authenticated,service_role;
grant execute on function public.get_course_source_pdf_ingestion_receipt_for_actor_v1(
  uuid,uuid,bigint,jsonb,jsonb,text,text
) to service_role;

-- Fonte corrente: substitui a atribuição do alvo sem revisão histórica.
create function private.apply_course_source_attribution_v2(
  p_course_id uuid,
  p_target_kind text,
  p_target_id text,
  p_expected_target_version bigint,
  p_links jsonb,
  p_explicit_target_hash text default null
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private', 'extensions'
AS $function$
declare
  v_state jsonb;
  v_previous private.course_source_attributions%rowtype;
  v_attribution private.course_source_attributions%rowtype;
  v_link record;
  v_anchor record;
begin
  if p_course_id is null
     or p_target_kind not in ('plan_item','study_unit')
     or p_target_id is null or char_length(p_target_id) not between 1 and 240
     or p_target_id<>btrim(p_target_id) or p_target_id~'[[:cntrl:]]'
     or p_expected_target_version is null or p_expected_target_version < 1
     or p_explicit_target_hash is not null
       and p_explicit_target_hash !~ '^[a-f0-9]{64}$'
     or not private.valid_course_source_links_shape_v2(p_links) then
    raise exception 'Aplicação de proveniência inválida.'
      using errcode = '22023';
  end if;
  v_state := private.course_source_target_state_v1(
    p_course_id,p_target_kind,p_target_id
  );
  if v_state is null then
    raise exception 'Alvo de proveniência inexistente.' using errcode = 'PT404';
  end if;
  if (v_state->>'version')::bigint <> p_expected_target_version then
    raise exception 'O alvo de proveniência mudou; releia antes de salvar.'
      using errcode = '40001';
  end if;
  if p_explicit_target_hash is not null
     and v_state->>'hash' <> p_explicit_target_hash then
    raise exception 'O alvo de proveniência divergiu do estado materializado.'
      using errcode = '40001';
  end if;
  select * into v_previous
  from private.course_source_attributions attribution
  where attribution.course_id = p_course_id
    and attribution.target_kind = p_target_kind
    and attribution.target_id = p_target_id;
  if v_previous.id is not null and private.course_source_links_v1(
    p_course_id,v_previous.id
  ) = p_links
     and v_previous.target_version=p_expected_target_version
     and v_previous.target_hash=v_state->>'hash' then
    return jsonb_build_object(
      'changed',false,'targetVersion',p_expected_target_version
    );
  end if;
  if jsonb_array_length(p_links) > 0 then
    for v_link in
      select link.value,link.ordinal::integer - 1 as ordinal
      from jsonb_array_elements(p_links) with ordinality link(value,ordinal)
    loop
      if not exists(
        select 1 from private.course_sources source
        where source.course_id=p_course_id
          and source.source_id=v_link.value->>'sourceId'
          and source.status='active'
      ) then
        raise exception 'Vínculo exige Fonte corrente e ativa.'
          using errcode = '23514';
      end if;
      for v_anchor in
        select anchor.value
        from jsonb_array_elements(v_link.value->'anchors') anchor(value)
      loop
        if not exists(
          select 1 from private.course_source_anchors anchor_value
          where anchor_value.course_id=p_course_id
            and anchor_value.anchor_id=v_anchor.value->>'anchorId'
            and anchor_value.source_id=v_link.value->>'sourceId'
            and anchor_value.status='active'
        ) then
          raise exception 'Âncora precisa ser corrente, ativa e presa à Fonte.'
            using errcode = '23514';
        end if;
      end loop;
    end loop;
  end if;

  if v_previous.id is null then
    insert into private.course_source_attributions(
      course_id,id,target_kind,target_id,target_version,target_hash
    ) values(
      p_course_id,extensions.gen_random_uuid(),p_target_kind,p_target_id,
      p_expected_target_version,v_state->>'hash'
    ) returning * into v_attribution;
  else
    delete from private.course_source_attribution_sources source_link
    where source_link.course_id = p_course_id
      and source_link.attribution_id = v_previous.id;
    update private.course_source_attributions attribution
    set target_version=p_expected_target_version,target_hash=v_state->>'hash',
      created_at=now()
    where attribution.course_id=p_course_id and attribution.id=v_previous.id
    returning * into v_attribution;
  end if;

  insert into private.course_source_attribution_sources(
    course_id,attribution_id,source_ordinal,source_id,relation
  )
  select p_course_id,v_attribution.id,link.ordinal::integer - 1,
    link.value->>'sourceId',link.value->>'relation'
  from jsonb_array_elements(p_links) with ordinality link(value,ordinal);

  insert into private.course_source_attribution_anchors(
    course_id,attribution_id,source_ordinal,anchor_ordinal,
    source_id,anchor_id
  )
  select p_course_id,v_attribution.id,link.ordinal::integer - 1,
    anchor.ordinal::integer - 1,link.value->>'sourceId',
    anchor.value->>'anchorId'
  from jsonb_array_elements(p_links) with ordinality link(value,ordinal)
  cross join lateral jsonb_array_elements(link.value->'anchors')
    with ordinality anchor(value,ordinal);

  return jsonb_build_object(
    'changed',true,'targetVersion',p_expected_target_version
  );
end;
$function$;

revoke all on function private.apply_course_source_attribution_v2(
  uuid,text,text,bigint,jsonb,text
) from public,anon,authenticated,service_role;

-- Fonte corrente: private.course_annotation_source_links_resolved_v1(uuid,jsonb)
CREATE OR REPLACE FUNCTION private.course_annotation_source_links_resolved_v1(p_course_id uuid, p_links jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private'
AS $function$
declare
  v_link jsonb;
  v_anchor jsonb;
begin
  if not private.valid_course_source_links_shape_v2(p_links) then
    return false;
  end if;
  for v_link in select value from jsonb_array_elements(p_links)
  loop
    if not exists(
      select 1 from private.course_sources source
      where source.course_id=p_course_id
        and source.source_id=v_link->>'sourceId'
        and source.status='active'
    ) then return false; end if;
    for v_anchor in select value from jsonb_array_elements(v_link->'anchors')
    loop
      if not exists(
        select 1 from private.course_source_anchors anchor
        where anchor.course_id=p_course_id
          and anchor.anchor_id=v_anchor->>'anchorId'
          and anchor.source_id=v_link->>'sourceId'
          and anchor.status='active'
      ) then return false; end if;
    end loop;
  end loop;
  return true;
exception when others then return false;
end;
$function$;

-- Fonte corrente: private.course_annotation_target_snapshot_v1(uuid,text,text)
CREATE OR REPLACE FUNCTION private.course_annotation_target_snapshot_v1(p_course_id uuid, p_target_kind text, p_target_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_course public.courses%rowtype;
  v_entity private.course_entities%rowtype;
  v_module private.course_entities%rowtype;
  v_lesson private.course_entities%rowtype;
  v_microsequence private.course_entities%rowtype;
  v_source private.course_sources%rowtype;
  v_anchor private.course_source_anchors%rowtype;
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
    from private.course_sources source
    where source.course_id=p_course_id and source.source_id=p_target_id;
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
    from private.course_source_anchors anchor
    where anchor.course_id=p_course_id and anchor.anchor_id=p_target_id
    order by anchor.revision desc limit 1;
    if not found then return null; end if;
    select * into strict v_source
    from private.course_sources source
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

-- Fonte corrente: private.course_study_citations_payload_v1(uuid,text,bigint)
create or replace function private.course_study_citations_payload_v1(
  p_course_id uuid,
  p_study_unit_id text,
  p_course_revision bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,private
as $function$
declare
  v_attribution private.course_source_attributions%rowtype;
  v_citations jsonb:='[]'::jsonb;
  v_result jsonb;
begin
  if p_course_id is null or p_study_unit_id is null
     or char_length(p_study_unit_id) not between 1 and 240
     or p_study_unit_id<>btrim(p_study_unit_id)
     or p_study_unit_id~'[[:cntrl:]]'
     or p_course_revision is null or p_course_revision<1 then
    raise exception 'Cerca de citações de Estudo inválida.'
      using errcode='22023';
  end if;
  select * into v_attribution
  from private.course_effective_source_attribution_v1(
    p_course_id,'study_unit',p_study_unit_id
  );
  if v_attribution.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'sourceId',source_link.source_id,
      'title',source.title,
      'citationText',source.citation_text,
      'url',case when source.study_visibility='citation_and_link'
        then source.url else null end,
      'editionOrVersion',source.edition_or_version,
      'anchors',coalesce((
        select jsonb_agg(jsonb_build_object(
          'anchorId',anchor_link.anchor_id,
          'selector',anchor_value.selector,
          'humanLocator',anchor_value.human_locator,
          'verificationExcerpt',anchor_value.verification_excerpt
        ) order by anchor_link.anchor_ordinal)
        from private.course_source_attribution_anchors anchor_link
        join private.course_source_anchors anchor_value
          on anchor_value.course_id=anchor_link.course_id
         and anchor_value.anchor_id=anchor_link.anchor_id
         and anchor_value.source_id=anchor_link.source_id
         and anchor_value.status='active'
        where anchor_link.course_id=source_link.course_id
          and anchor_link.attribution_id=source_link.attribution_id
          and anchor_link.source_ordinal=source_link.source_ordinal
      ),'[]'::jsonb)
    ) order by source_link.source_ordinal),'[]'::jsonb)
    into v_citations
    from private.course_source_attribution_sources source_link
    join private.course_sources source
      on source.course_id=source_link.course_id
     and source.source_id=source_link.source_id
     and source.status='active'
     and source.study_visibility in('citation','citation_and_link')
    where source_link.course_id=p_course_id
      and source_link.attribution_id=v_attribution.id
      and source_link.relation<>'needs_verification'
      and exists(
        select 1
        from private.course_source_attribution_anchors anchor_link
        join private.course_source_anchors anchor_value
          on anchor_value.course_id=anchor_link.course_id
         and anchor_value.anchor_id=anchor_link.anchor_id
         and anchor_value.source_id=anchor_link.source_id
         and anchor_value.status='active'
        where anchor_link.course_id=source_link.course_id
          and anchor_link.attribution_id=source_link.attribution_id
          and anchor_link.source_ordinal=source_link.source_ordinal
      );
  end if;
  v_result:=jsonb_build_object(
    'contract','aralearn.course-study-citations.v1',
    'courseId',p_course_id,'courseRevision',p_course_revision,
    'studyUnitId',p_study_unit_id,'citations',v_citations
  );
  if octet_length(v_result::text)>262144 then
    raise exception 'Citações de Estudo excedem 256 KiB.' using errcode='54000';
  end if;
  return v_result;
end;
$function$;

revoke all on function private.course_study_citations_payload_v1(
  uuid,text,bigint
) from public,anon,authenticated,service_role;
-- Fonte corrente: private.execute_course_source_command_core_v1(uuid,uuid,bigint,jsonb,text,text)
CREATE OR REPLACE FUNCTION private.execute_course_source_command_core_v1(p_actor_id uuid, p_course_id uuid, p_expected_revision bigint, p_command jsonb, p_channel text, p_request_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'auth', 'extensions'
AS $function$
declare
  v_hash text;
  v_receipt private.course_change_receipts%rowtype;
  v_course public.courses%rowtype;
  v_type text;
  v_source record;
  v_anchor record;
  v_changed boolean := false;
  v_subject_id text;
  v_subject_revision bigint;
  v_assignment jsonb;
  v_result jsonb;
  v_study_unit record;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_revision is null or p_expected_revision < 1
     or p_channel not in ('application','mcp')
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or jsonb_typeof(p_command) is distinct from 'object'
     or octet_length(p_command::text) > 196608 then
    raise exception 'Comando de Fonte inválido.' using errcode = '22023';
  end if;
  v_type := p_command->>'type';
  if v_type not in (
    'save_source','retire_source','save_anchor','retire_anchor',
    'set_target_sources'
  ) then
    raise exception 'Tipo do comando de Fonte inválido.' using errcode = '22023';
  end if;
  v_hash := private.course_source_json_hash_v1(jsonb_build_object(
    'courseId',p_course_id,'expectedRevision',p_expected_revision,
    'channel',p_channel,'command',p_command
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
    return (v_receipt.result - 'idempotent')
      || jsonb_build_object('idempotent',true);
  end if;
  perform 1 from auth.users actor where actor.id=p_actor_id for key share;
  if not found then
    raise exception 'Pessoa inexistente ou inacessível.' using errcode='PT404';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'course-row:' || p_course_id::text,0
  ));
  select * into strict v_course from public.courses course
  where course.id = p_course_id for update;
  if v_course.revision <> p_expected_revision then
    raise exception 'O Curso mudou; releia antes de salvar a Fonte.'
      using errcode = '40001';
  end if;

  if v_type = 'save_source' then
    if p_command - 'type' - 'sourceId' - 'expectedSourceRevision' - 'source'
         <> '{}'::jsonb
       or not (p_command ?& array[
         'type','sourceId','expectedSourceRevision','source'
       ])
       or jsonb_typeof(p_command->'sourceId') <> 'string'
       or char_length(p_command->>'sourceId') not between 1 and 240
       or p_command->>'sourceId' <> btrim(p_command->>'sourceId')
       or p_command->>'sourceId' ~ '[[:cntrl:]]'
       or jsonb_typeof(p_command->'expectedSourceRevision') <> 'number'
       or p_command->>'expectedSourceRevision' !~ '^[0-9]+$'
       or jsonb_typeof(p_command->'source') <> 'object'
       or (p_command->'source') - 'kind' - 'title' - 'authorship'
         - 'publicationDate' - 'identifier' - 'language' - 'citationText' - 'url'
         - 'editionOrVersion' - 'origin' - 'availability' - 'verificationStatus'
         - 'studyVisibility' <> '{}'::jsonb
       or not (p_command->'source' ?& array[
         'kind','title','authorship','publicationDate','identifier','language',
         'citationText','url','editionOrVersion','origin','availability',
         'verificationStatus','studyVisibility'
       ]) then
      raise exception 'save_source possui shape inválido.' using errcode = '22023';
    end if;
    select * into v_source from private.course_sources source
    where source.course_id = p_course_id
      and source.source_id = p_command->>'sourceId'
    ;
    if coalesce(v_source.revision,0)
         <> (p_command->>'expectedSourceRevision')::bigint then
      raise exception 'A Fonte mudou; releia antes de salvar.'
        using errcode = '40001';
    end if;
    if found and v_source.status = 'active' and row(
      v_source.kind,v_source.title,v_source.authorship,v_source.publication_date,
      v_source.identifier,v_source.language,v_source.citation_text,v_source.url,
      v_source.edition_or_version,v_source.origin,v_source.availability,
      v_source.verification_status,v_source.study_visibility
    ) is not distinct from row(
      p_command#>>'{source,kind}',p_command#>>'{source,title}',
      p_command#>>'{source,authorship}',p_command#>>'{source,publicationDate}',
      p_command#>>'{source,identifier}',p_command#>>'{source,language}',
      p_command#>>'{source,citationText}',p_command#>>'{source,url}',
      p_command#>>'{source,editionOrVersion}',
      p_command#>>'{source,origin}',p_command#>>'{source,availability}',
      p_command#>>'{source,verificationStatus}',
      p_command#>>'{source,studyVisibility}'
    ) then
      v_subject_revision := v_source.revision;
    else
      insert into private.course_sources(
        course_id,source_id,revision,status,kind,title,authorship,
        publication_date,identifier,language,citation_text,url,
        edition_or_version,origin,availability,verification_status,
        study_visibility
      ) values(
        p_course_id,p_command->>'sourceId',coalesce(v_source.revision,0)+1,
        'active',p_command#>>'{source,kind}',p_command#>>'{source,title}',
        p_command#>>'{source,authorship}',p_command#>>'{source,publicationDate}',
        p_command#>>'{source,identifier}',p_command#>>'{source,language}',
        p_command#>>'{source,citationText}',p_command#>>'{source,url}',
        p_command#>>'{source,editionOrVersion}',
        p_command#>>'{source,origin}',p_command#>>'{source,availability}',
        p_command#>>'{source,verificationStatus}',
        p_command#>>'{source,studyVisibility}'
      ) on conflict(course_id,source_id) do update set
        revision=excluded.revision,status=excluded.status,kind=excluded.kind,
        title=excluded.title,authorship=excluded.authorship,
        publication_date=excluded.publication_date,identifier=excluded.identifier,
        language=excluded.language,citation_text=excluded.citation_text,
        url=excluded.url,edition_or_version=excluded.edition_or_version,
        origin=excluded.origin,availability=excluded.availability,
        verification_status=excluded.verification_status,
        study_visibility=excluded.study_visibility,created_at=now()
      returning * into v_source;
      v_changed := true;
      v_subject_revision := v_source.revision;
    end if;
    v_subject_id := p_command->>'sourceId';
  elsif v_type = 'retire_source' then
    if p_command - 'type' - 'sourceId' - 'expectedSourceRevision'
         <> '{}'::jsonb
       or not (p_command ?& array['type','sourceId','expectedSourceRevision'])
       or jsonb_typeof(p_command->'sourceId') <> 'string'
       or char_length(p_command->>'sourceId') not between 1 and 240
       or p_command->>'sourceId' <> btrim(p_command->>'sourceId')
       or p_command->>'sourceId' ~ '[[:cntrl:]]'
       or jsonb_typeof(p_command->'expectedSourceRevision') <> 'number'
       or p_command->>'expectedSourceRevision' !~ '^[1-9][0-9]*$' then
      raise exception 'retire_source possui shape inválido.' using errcode = '22023';
    end if;
    select * into v_source from private.course_sources source
    where source.course_id = p_course_id
      and source.source_id = p_command->>'sourceId'
    ;
    if not found then raise exception 'Fonte inexistente.' using errcode = 'PT404'; end if;
    if v_source.revision <> (p_command->>'expectedSourceRevision')::bigint then
      raise exception 'A Fonte mudou; releia antes de retirar.' using errcode = '40001';
    end if;
    if v_source.status = 'retired' then
      v_subject_revision := v_source.revision;
    else
      insert into private.course_sources(
        course_id,source_id,revision,status,kind,title,authorship,
        publication_date,identifier,language,citation_text,url,
        edition_or_version,origin,availability,verification_status,
        study_visibility
      ) values(
        p_course_id,v_source.source_id,v_source.revision+1,'retired',
        v_source.kind,v_source.title,v_source.authorship,v_source.publication_date,
        v_source.identifier,v_source.language,v_source.citation_text,v_source.url,
        v_source.edition_or_version,v_source.origin,v_source.availability,
        v_source.verification_status,v_source.study_visibility
      ) on conflict(course_id,source_id) do update set
        revision=excluded.revision,status=excluded.status,created_at=now()
      returning * into v_source;
      v_changed := true;
      v_subject_revision := v_source.revision;
    end if;
    v_subject_id := p_command->>'sourceId';
  elsif v_type = 'save_anchor' then
    if p_command - 'type' - 'anchorId' - 'sourceId' - 'sourceRevision'
         - 'expectedAnchorRevision' - 'selector' - 'humanLocator'
         - 'verificationExcerpt'
         <> '{}'::jsonb
       or not (p_command ?& array[
         'type','anchorId','sourceId','sourceRevision',
         'expectedAnchorRevision','selector','humanLocator','verificationExcerpt'
       ])
       or jsonb_typeof(p_command->'anchorId') <> 'string'
       or char_length(p_command->>'anchorId') not between 1 and 240
       or p_command->>'anchorId' <> btrim(p_command->>'anchorId')
       or p_command->>'anchorId' ~ '[[:cntrl:]]'
       or jsonb_typeof(p_command->'sourceId') <> 'string'
       or char_length(p_command->>'sourceId') not between 1 and 240
       or p_command->>'sourceId' <> btrim(p_command->>'sourceId')
       or p_command->>'sourceId' ~ '[[:cntrl:]]'
       or jsonb_typeof(p_command->'sourceRevision') <> 'number'
       or p_command->>'sourceRevision' !~ '^[1-9][0-9]*$'
       or jsonb_typeof(p_command->'expectedAnchorRevision') <> 'number'
       or p_command->>'expectedAnchorRevision' !~ '^[0-9]+$'
       or jsonb_typeof(p_command->'selector') <> 'object'
       or jsonb_typeof(p_command->'humanLocator') not in('string','null')
       or jsonb_typeof(p_command->'humanLocator')='string' and (
         nullif(btrim(p_command->>'humanLocator'),'') is null
         or p_command->>'humanLocator'<>btrim(p_command->>'humanLocator')
         or char_length(p_command->>'humanLocator')>500
         or p_command->>'humanLocator'~'[[:cntrl:]]'
       )
       or jsonb_typeof(p_command->'verificationExcerpt')
         not in ('string','null') then
      raise exception 'save_anchor possui shape inválido.' using errcode = '22023';
    end if;
    select * into v_source from private.course_sources source
    where source.course_id = p_course_id
      and source.source_id = p_command->>'sourceId'
    ;
    if not found or v_source.status <> 'active'
       or v_source.revision <> (p_command->>'sourceRevision')::bigint then
      raise exception 'Âncora exige a revisão corrente e ativa da Fonte.'
        using errcode = '23514';
    end if;
    select * into v_anchor from private.course_source_anchors anchor_value
    where anchor_value.course_id = p_course_id
      and anchor_value.anchor_id = p_command->>'anchorId'
    ;
    if coalesce(v_anchor.revision,0)
         <> (p_command->>'expectedAnchorRevision')::bigint then
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
      select 1
      from private.course_source_anchors existing_anchor
      where existing_anchor.course_id = p_course_id
        and existing_anchor.source_id = p_command->>'sourceId'
        and existing_anchor.source_revision
          = (p_command->>'sourceRevision')::bigint
        and existing_anchor.anchor_id = p_command->>'anchorId'
    ) and (
      select count(distinct existing_anchor.anchor_id)
      from private.course_source_anchors existing_anchor
      where existing_anchor.course_id = p_course_id
        and existing_anchor.source_id = p_command->>'sourceId'
        and existing_anchor.source_revision
          = (p_command->>'sourceRevision')::bigint
    ) >= 8 then
      raise exception 'Uma revisão de Fonte aceita no máximo oito identidades de Âncora.'
        using errcode = '23514';
    end if;
    if v_anchor.revision is not null and v_anchor.status = 'active'
       and v_anchor.source_id = p_command->>'sourceId'
       and v_anchor.source_revision = (p_command->>'sourceRevision')::bigint
       and v_anchor.selector = p_command->'selector'
       and v_anchor.human_locator is not distinct from
         p_command#>>'{humanLocator}'
       and v_anchor.verification_excerpt is not distinct from
         p_command#>>'{verificationExcerpt}' then
      v_subject_revision := v_anchor.revision;
    else
      insert into private.course_source_anchors(
        course_id,anchor_id,revision,source_id,source_revision,status,
        selector,human_locator,verification_excerpt
      ) values(
        p_course_id,p_command->>'anchorId',coalesce(v_anchor.revision,0)+1,
        p_command->>'sourceId',(p_command->>'sourceRevision')::bigint,
        'active',p_command->'selector',p_command#>>'{humanLocator}',
        p_command#>>'{verificationExcerpt}'
      ) on conflict(course_id,anchor_id) do update set
        revision=excluded.revision,source_id=excluded.source_id,
        source_revision=excluded.source_revision,status=excluded.status,
        selector=excluded.selector,human_locator=excluded.human_locator,
        verification_excerpt=excluded.verification_excerpt,
        created_at=now()
      returning * into v_anchor;
      v_changed := true;
      v_subject_revision := v_anchor.revision;
    end if;
    v_subject_id := p_command->>'anchorId';
  elsif v_type = 'retire_anchor' then
    if p_command - 'type' - 'anchorId' - 'expectedAnchorRevision'
         <> '{}'::jsonb
       or not (p_command ?& array['type','anchorId','expectedAnchorRevision'])
       or jsonb_typeof(p_command->'anchorId') <> 'string'
       or char_length(p_command->>'anchorId') not between 1 and 240
       or p_command->>'anchorId' <> btrim(p_command->>'anchorId')
       or p_command->>'anchorId' ~ '[[:cntrl:]]'
       or jsonb_typeof(p_command->'expectedAnchorRevision') <> 'number'
       or p_command->>'expectedAnchorRevision' !~ '^[1-9][0-9]*$' then
      raise exception 'retire_anchor possui shape inválido.' using errcode = '22023';
    end if;
    select * into v_anchor from private.course_source_anchors anchor_value
    where anchor_value.course_id = p_course_id
      and anchor_value.anchor_id = p_command->>'anchorId'
    ;
    if not found then raise exception 'Âncora inexistente.' using errcode = 'PT404'; end if;
    if v_anchor.revision <> (p_command->>'expectedAnchorRevision')::bigint then
      raise exception 'A Âncora mudou; releia antes de retirar.' using errcode = '40001';
    end if;
    if v_anchor.status = 'retired' then
      v_subject_revision := v_anchor.revision;
    else
      insert into private.course_source_anchors(
        course_id,anchor_id,revision,source_id,source_revision,status,
        selector,human_locator,verification_excerpt
      ) values(
        p_course_id,v_anchor.anchor_id,v_anchor.revision+1,
        v_anchor.source_id,v_anchor.source_revision,'retired',
        v_anchor.selector,v_anchor.human_locator,v_anchor.verification_excerpt
      ) on conflict(course_id,anchor_id) do update set
        revision=excluded.revision,status=excluded.status,created_at=now()
      returning * into v_anchor;
      v_changed := true;
      v_subject_revision := v_anchor.revision;
    end if;
    v_subject_id := p_command->>'anchorId';
  else
    if p_command - 'type' - 'targetKind' - 'targetId'
         - 'expectedTargetVersion' - 'sourceLinks' <> '{}'::jsonb
       or not (p_command ?& array[
         'type','targetKind','targetId','expectedTargetVersion','sourceLinks'
       ])
       or p_command->>'targetKind' not in ('plan_item','study_unit')
       or jsonb_typeof(p_command->'targetId') <> 'string'
       or char_length(p_command->>'targetId') not between 1 and 240
       or p_command->>'targetId' <> btrim(p_command->>'targetId')
       or p_command->>'targetId' ~ '[[:cntrl:]]'
       or jsonb_typeof(p_command->'expectedTargetVersion') <> 'number'
       or p_command->>'expectedTargetVersion' !~ '^[1-9][0-9]*$'
       or not private.valid_course_source_links_shape_v2(
         p_command->'sourceLinks'
       ) then
      raise exception 'set_target_sources possui shape inválido.' using errcode = '22023';
    end if;
    v_assignment := private.apply_course_source_attribution_v2(
      p_course_id,p_command->>'targetKind',p_command->>'targetId',
      (p_command->>'expectedTargetVersion')::bigint,p_command->'sourceLinks'
    );
    v_changed := (v_assignment->>'changed')::boolean;
    v_subject_id := p_command->>'targetId';
    v_subject_revision := (v_assignment->>'targetVersion')::bigint;
  end if;

  if v_changed then
    update public.courses course
    set revision = course.revision + 1,updated_at = now()
    where course.id = p_course_id returning * into v_course;
    null;
    if v_type = 'set_target_sources' then
      perform private.assert_course_source_target_citation_budget_v1(
        p_course_id,p_command->>'targetKind',p_command->>'targetId'
      );
    elsif v_type = 'save_source'
       and v_source.status = 'active'
       and v_source.study_visibility in ('citation','citation_and_link') then
      for v_study_unit in
        select distinct attribution.target_id
        from private.course_source_attributions attribution
        join private.course_source_attribution_sources source_link
          on source_link.course_id = attribution.course_id
         and source_link.attribution_id = attribution.id
        where attribution.course_id = p_course_id
          and attribution.target_kind = 'study_unit'
          and source_link.source_id = v_source.source_id
      loop
        perform private.assert_course_source_target_citation_budget_v1(
          p_course_id,'study_unit',v_study_unit.target_id
        );
      end loop;
    end if;
  end if;
  v_result := jsonb_build_object(
    'contract','aralearn.course-source-change.v1',
    'courseId',p_course_id,'courseRevision',v_course.revision,
    'requestId',p_request_id,'idempotent',false,'changed',v_changed,
    'change',case when not v_changed then null
      when v_type='set_target_sources' then jsonb_build_object(
        'type',v_type,'subjectId',v_subject_id,
        'targetVersion',v_subject_revision
      )
      else jsonb_build_object(
        'type',v_type,'subjectId',v_subject_id,'revision',v_subject_revision
      ) end
  );
  insert into private.course_change_receipts(
    actor_id,request_id,operation,course_id,request_hash,result
  ) values(
    p_actor_id,p_request_id,'execute_course_source_command',
    p_course_id,v_hash,v_result
  );
  return v_result;
exception when serialization_failure then
  raise sqlstate 'PGRST' using
    message = jsonb_build_object(
      'code','40001',
      'message',sqlerrm,
      'details',null,
      'hint',null
    )::text,
    detail = jsonb_build_object(
      'status',409,
      'headers',jsonb_build_object()
    )::text;
end;
$function$;

-- Fonte corrente: uma leitura direta, sem revisões históricas nem wrappers.
create or replace function public.get_owned_course_sources_for_actor_v1(
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
  v_course_revision bigint;
  v_items jsonb := '[]'::jsonb;
  v_next_cursor text;
  v_cursor_payload jsonb;
  v_after_source_id text;
  v_query_hash text;
  v_has_more boolean := false;
  v_last_source_id text;
  v_result jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_revision is null or p_expected_revision<1
     or p_mode not in('catalog','source','target')
     or p_limit is null or p_limit not between 1 and 24
     or p_mode='catalog' and (
       p_source_id is not null or p_target_kind is not null
       or p_target_id is not null
     )
     or p_mode='source' and (
       p_source_id is null or char_length(p_source_id) not between 1 and 240
       or p_source_id<>btrim(p_source_id) or p_source_id~'[[:cntrl:]]'
       or (p_target_kind is null)<>(p_target_id is null)
       or p_target_kind is not null and (
         p_target_kind not in('plan_item','study_unit')
         or p_target_id is null
         or char_length(p_target_id) not between 1 and 240
         or p_target_id<>btrim(p_target_id) or p_target_id~'[[:cntrl:]]'
       )
       or p_cursor is not null
     )
     or p_mode='target' and (
       p_source_id is not null
       or p_target_kind not in('plan_item','study_unit')
       or p_target_id is null
       or char_length(p_target_id) not between 1 and 240
       or p_target_id<>btrim(p_target_id) or p_target_id~'[[:cntrl:]]'
       or p_cursor is not null
     )
     or p_cursor is not null and (
       char_length(p_cursor) not between 1 and 240
       or p_cursor!~'^[A-Za-z0-9+/_-]+={0,2}$'
     ) then
    raise exception 'Consulta de Fontes inválida.' using errcode='22023';
  end if;

  select course.revision into strict v_course_revision
  from public.courses course
  where course.id=p_course_id
  for share;
  if v_course_revision<>p_expected_revision then
    raise exception 'O Curso mudou durante a leitura de Fontes.'
      using errcode='40001';
  end if;

  v_query_hash:=private.course_source_json_hash_v1(jsonb_build_object(
    'courseId',p_course_id,'expectedRevision',p_expected_revision,
    'mode',p_mode,'sourceId',p_source_id,
    'targetKind',p_target_kind,'targetId',p_target_id,'limit',p_limit
  ));
  if p_cursor is not null then
    begin
      v_cursor_payload:=convert_from(
        decode(translate(p_cursor,'-_','+/'),'base64'),'UTF8'
      )::jsonb;
    exception when others then
      raise exception 'Cursor de Fontes inválido.' using errcode='22023';
    end;
    if jsonb_typeof(v_cursor_payload)<>'object'
       or v_cursor_payload-'q'-'s'<>'{}'::jsonb
       or not (v_cursor_payload ?& array['q','s'])
       or v_cursor_payload->>'q'<>v_query_hash
       or jsonb_typeof(v_cursor_payload->'s')<>'string'
       or char_length(v_cursor_payload->>'s') not between 1 and 240
       or v_cursor_payload->>'s'<>btrim(v_cursor_payload->>'s')
       or v_cursor_payload->>'s'~'[[:cntrl:]]' then
      raise exception 'Cursor de Fontes inválido.' using errcode='22023';
    end if;
    v_after_source_id:=v_cursor_payload->>'s';
  end if;

  if p_mode='catalog' then
    with page as materialized (
      select source.*,
        row_number() over(order by source.source_id) as ordinal
      from private.course_sources source
      where source.course_id=p_course_id
        and (v_after_source_id is null
          or source.source_id>v_after_source_id)
      order by source.source_id
      limit p_limit+1
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'sourceId',page.source_id,'revision',page.revision,
      'status',page.status,'kind',page.kind,'title',page.title,
      'authorship',page.authorship,
      'publicationDate',page.publication_date,
      'identifier',page.identifier,'language',page.language,
      'citationText',page.citation_text,'url',page.url,
      'editionOrVersion',page.edition_or_version,
      'origin',page.origin,'availability',page.availability,
      'verificationStatus',page.verification_status,
      'studyVisibility',page.study_visibility,
      'anchorCount',(
        select count(*)::integer
        from private.course_source_anchors anchor_value
        where anchor_value.course_id=page.course_id
          and anchor_value.source_id=page.source_id
          and anchor_value.status='active'
      ),
      'createdAt',page.created_at
    ) order by page.source_id) filter(where page.ordinal<=p_limit),'[]'::jsonb),
      count(*)>p_limit,
      max(page.source_id) filter(where page.ordinal=p_limit)
    into v_items,v_has_more,v_last_source_id
    from page;
    if v_has_more then
      v_next_cursor:=replace(replace(encode(convert_to(jsonb_build_object(
        'q',v_query_hash,'s',v_last_source_id
      )::text,'UTF8'),'base64'),E'\n',''),E'\r','');
    end if;
  elsif p_mode='source' then
    if not exists(
      select 1 from private.course_sources source
      where source.course_id=p_course_id and source.source_id=p_source_id
    ) then
      raise exception 'Fonte inexistente.' using errcode='PT404';
    end if;
    if p_target_kind is not null and private.course_source_target_state_v1(
      p_course_id,p_target_kind,p_target_id
    ) is null then
      raise exception 'Alvo de proveniência inexistente.' using errcode='PT404';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'sourceId',source.source_id,'revision',source.revision,
      'status',source.status,'kind',source.kind,'title',source.title,
      'authorship',source.authorship,
      'publicationDate',source.publication_date,
      'identifier',source.identifier,'language',source.language,
      'citationText',source.citation_text,'url',source.url,
      'editionOrVersion',source.edition_or_version,
      'origin',source.origin,'availability',source.availability,
      'verificationStatus',source.verification_status,
      'studyVisibility',source.study_visibility,
      'anchorCount',(
        select count(*)::integer
        from private.course_source_anchors active_anchor
        where active_anchor.course_id=source.course_id
          and active_anchor.source_id=source.source_id
          and active_anchor.status='active'
      ),
      'createdAt',source.created_at,
      'anchors',coalesce((
        select jsonb_agg(jsonb_build_object(
          'anchorId',anchor_value.anchor_id,
          'revision',anchor_value.revision,
          'sourceRevision',anchor_value.source_revision,
          'status',anchor_value.status,
          'selector',anchor_value.selector,
          'humanLocator',anchor_value.human_locator,
          'verificationExcerpt',anchor_value.verification_excerpt,
          'needsReverification',anchor_value.selector->>'kind'
            in('page_range','text_quote') and exists(
              select 1
              from private.course_source_attachments active_pdf
              join private.course_source_attachments removed_pdf
                on removed_pdf.course_id=active_pdf.course_id
               and removed_pdf.source_id=active_pdf.source_id
               and removed_pdf.status='removed'
               and removed_pdf.content_hash<>active_pdf.content_hash
              where active_pdf.course_id=source.course_id
                and active_pdf.source_id=source.source_id
                and active_pdf.status='active'
            ),
          'createdAt',anchor_value.created_at
        ) order by anchor_value.anchor_id)
        from private.course_source_anchors anchor_value
        where anchor_value.course_id=source.course_id
          and anchor_value.source_id=source.source_id
      ),'[]'::jsonb),
      'attachments',coalesce((
        select jsonb_agg(jsonb_build_object(
          'contentHash',attachment.content_hash,
          'byteSize',attachment.byte_size,
          'mediaType',attachment.media_type,
          'storagePath',attachment.storage_path,
          'createdAt',attachment.created_at
        ) order by attachment.created_at,attachment.content_hash)
        from private.course_source_attachments attachment
        where attachment.course_id=source.course_id
          and attachment.source_id=source.source_id
          and attachment.status='active'
      ),'[]'::jsonb)
    )),'[]'::jsonb)
    into v_items
    from private.course_sources source
    where source.course_id=p_course_id and source.source_id=p_source_id
      and (
        p_target_kind is null
        or exists(
          select 1
          from private.course_effective_source_attribution_v1(
            p_course_id,p_target_kind,p_target_id
          ) attribution
          join private.course_source_attribution_sources source_link
            on source_link.course_id=attribution.course_id
           and source_link.attribution_id=attribution.id
          where attribution.course_id=p_course_id
            and attribution.target_kind=p_target_kind
            and attribution.target_id=p_target_id
            and source_link.source_id=p_source_id
        )
      );
  else
    if private.course_source_target_state_v1(
      p_course_id,p_target_kind,p_target_id
    ) is null then
      raise exception 'Alvo de proveniência inexistente.' using errcode='PT404';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'targetKind',attribution.target_kind,
      'targetId',attribution.target_id,
      'targetVersion',attribution.target_version,
      'sourceLinks',private.course_source_links_v1(
        attribution.course_id,attribution.id
      ),
      'createdAt',attribution.created_at
    )),'[]'::jsonb)
    into v_items
    from private.course_effective_source_attribution_v1(
      p_course_id,p_target_kind,p_target_id
    ) attribution;
  end if;

  v_result:=jsonb_build_object(
    'contract','aralearn.course-sources.v2',
    'courseId',p_course_id,'courseRevision',v_course_revision,
    'mode',p_mode,
    'query',jsonb_build_object(
      'sourceId',case when p_mode='source' then p_source_id else null end,
      'targetKind',case when p_mode in('source','target')
        then p_target_kind else null end,
      'targetId',case when p_mode in('source','target')
        then p_target_id else null end
    ),
    'pdfStorage',jsonb_build_object(
      'uniqueBytes',private.course_source_pdf_unique_bytes_v1(p_course_id),
      'maxUniqueBytes',67108864
    ),
    'items',coalesce(v_items,'[]'::jsonb),'nextCursor',v_next_cursor
  );
  if octet_length(v_result::text)>262144 then
    raise exception 'Leitura de Fontes excede 256 KiB.' using errcode='54000';
  end if;
  return v_result;
end;
$function$;

revoke all on function public.get_owned_course_sources_for_actor_v1(
  uuid,uuid,bigint,text,text,text,text,text,integer
) from public,anon,authenticated,service_role;
grant execute on function public.get_owned_course_sources_for_actor_v1(
  uuid,uuid,bigint,text,text,text,text,text,integer
) to service_role;

drop function private.get_owned_course_sources_before_pdf_lifecycle_v1(
  uuid,uuid,bigint,text,text,text,text,text,integer
);
drop function private.get_owned_course_sources_with_attachments_v1(
  uuid,uuid,bigint,text,text,text,text,text,integer
);
drop function private.get_owned_course_sources_core_v1(
  uuid,uuid,bigint,text,text,text,text,text,integer
);
drop function private.course_source_cursor_v1(text,integer);
-- Fonte corrente: private.prepare_course_source_pdf_ingestion_core_v1(uuid,uuid,bigint,jsonb,text,bigint,text,text)
create function private.prepare_course_source_pdf_ingestion_core_v1(p_actor_id uuid, p_course_id uuid, p_expected_revision bigint, p_source_intent jsonb, p_content_hash text, p_byte_size bigint, p_media_type text, p_request_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_course_revision bigint;
  v_source private.course_sources%rowtype;
  v_attachment private.course_source_attachments%rowtype;
  v_conflicting_intent private.course_source_pdf_upload_intents%rowtype;
  v_source_id text;
  v_source_revision bigint;
  v_expected_source_revision bigint;
  v_request_fingerprint text;
  v_storage_path text;
  v_object_exists boolean;
  v_hash_already_counted boolean;
  v_upload_required boolean;
  v_already_linked boolean;
  v_attachment_found boolean;
  v_path_intent_found boolean;
  v_reserved_bytes bigint;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_revision is null or p_expected_revision < 1
     or not private.valid_course_source_pdf_ingestion_intent_v2(p_source_intent)
     or p_content_hash is null or p_content_hash !~ '^[a-f0-9]{64}$'
     or p_byte_size is null or p_byte_size not between 1 and 20971520
     or p_media_type is distinct from 'application/pdf'
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'Preparo de ingestão PDF inválido.' using errcode = '22023';
  end if;
  v_source_id := p_source_intent->>'sourceId';
  v_request_fingerprint := private.course_source_json_hash_v1(
    jsonb_build_object(
      'courseId',p_course_id,
      'expectedRevision',p_expected_revision,
      'sourceIntent',p_source_intent,
      'contentHash',p_content_hash,
      'byteSize',p_byte_size,
      'mediaType',p_media_type
    )
  );
  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:'||p_actor_id::text||':'||p_request_id,0
  ));
  perform 1 from auth.users actor where actor.id=p_actor_id for key share;
  if not found then
    raise exception 'Pessoa inexistente ou inacessível.' using errcode='PT404';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'course-row:' || p_course_id::text,0
  ));
  select course.revision into strict v_course_revision
  from public.courses course
  where course.id = p_course_id
  for update;
  if v_course_revision <> p_expected_revision then
    raise exception 'O Curso mudou; releia antes de preparar o PDF.'
      using errcode = '40001';
  end if;

  select * into v_source
  from private.course_sources source
  where source.course_id = p_course_id and source.source_id = v_source_id;
  if p_source_intent->>'mode' = 'existing' then
    v_source_revision := (p_source_intent->>'sourceRevision')::bigint;
    if not found then
      raise exception 'Fonte inexistente.' using errcode = 'PT404';
    end if;
    if v_source.status <> 'active' or v_source.revision <> v_source_revision then
      raise exception 'O PDF exige a revisão corrente e ativa da Fonte.'
        using errcode = '23514';
    end if;
  else
    v_expected_source_revision :=
      (p_source_intent->>'expectedSourceRevision')::bigint;
    if coalesce(v_source.revision,0) <> v_expected_source_revision then
      raise exception 'A Fonte mudou; releia antes de preparar o PDF.'
        using errcode = '40001';
    end if;
    if found and v_source.status = 'active' and row(
      v_source.kind,v_source.title,v_source.authorship,v_source.publication_date,
      v_source.identifier,v_source.language,v_source.citation_text,v_source.url,
      v_source.edition_or_version,v_source.origin,v_source.availability,
      v_source.verification_status,v_source.study_visibility
    ) is not distinct from row(
      p_source_intent#>>'{source,kind}',p_source_intent#>>'{source,title}',
      p_source_intent#>>'{source,authorship}',
      p_source_intent#>>'{source,publicationDate}',
      p_source_intent#>>'{source,identifier}',
      p_source_intent#>>'{source,language}',
      p_source_intent#>>'{source,citationText}',p_source_intent#>>'{source,url}',
      p_source_intent#>>'{source,editionOrVersion}',
      p_source_intent#>>'{source,origin}',
      p_source_intent#>>'{source,availability}',
      p_source_intent#>>'{source,verificationStatus}',
      p_source_intent#>>'{source,studyVisibility}'
    ) then
      raise exception 'A Fonte já é corrente; use o modo existing para anexá-la.'
        using errcode = '23514';
    end if;
    v_source_revision := v_expected_source_revision + 1;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'course-source-pdf-quota:' || p_course_id::text,0
  ));
  delete from private.course_source_pdf_upload_intents intent
  where intent.actor_id = p_actor_id
    and intent.request_id = p_request_id
    and intent.expires_at <= statement_timestamp();
  select * into v_attachment
  from private.course_source_attachments attachment
  where attachment.course_id = p_course_id
    and attachment.source_id = v_source_id
    and attachment.source_revision = v_source_revision
    and attachment.content_hash = p_content_hash;
  v_attachment_found := found;
  v_already_linked := v_attachment_found and v_attachment.status='active';
  v_storage_path := case when v_attachment_found
    then v_attachment.storage_path
    else p_course_id::text || '/' || p_content_hash || '.pdf'
  end;
  if v_storage_path
       !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[a-f0-9]{64}[.]pdf$'
     or split_part(v_storage_path,'/',2) <> p_content_hash || '.pdf' then
    raise exception 'O path deduplicado do PDF é incompatível.'
      using errcode = '23514';
  end if;
  if v_already_linked and(
    v_attachment.byte_size <> p_byte_size
    or v_attachment.media_type <> p_media_type
  ) or exists(
    select 1 from private.course_source_attachments existing
    where existing.course_id = p_course_id
      and existing.content_hash = p_content_hash
      and (existing.byte_size <> p_byte_size
        or existing.media_type <> p_media_type)
  ) or exists(
    select 1 from private.course_source_pdf_upload_intents intent
    where intent.course_id = p_course_id
      and intent.content_hash = p_content_hash
      and intent.expires_at > statement_timestamp()
      and (intent.byte_size <> p_byte_size
        or intent.media_type <> p_media_type)
  ) then
    raise exception 'O hash já possui metadados binários incompatíveis.'
      using errcode = '23514';
  end if;
  select exists(
    select 1 from private.course_source_attachments existing
    where existing.course_id = p_course_id
      and existing.content_hash = p_content_hash
  ) or exists(
    select 1 from storage.objects object_value
    where object_value.bucket_id = 'course-source-pdfs'
      and object_value.name = v_storage_path
  ) or exists(
    select 1 from private.course_source_pdf_upload_intents intent
    where intent.course_id = p_course_id
      and intent.content_hash = p_content_hash
      and intent.expires_at > statement_timestamp()
  ) into v_hash_already_counted;
  v_reserved_bytes := private.course_source_pdf_reserved_bytes_v1(p_course_id);
  if not v_hash_already_counted
     and v_reserved_bytes + p_byte_size > 67108864 then
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
  if v_attachment_found and v_attachment.status='removed' and exists(
    select 1 from private.course_source_pdf_delete_intents intent
    where intent.storage_path=v_storage_path
  ) then
    raise exception 'A remoção física deste PDF ainda está em andamento.'
      using errcode='40001';
  end if;
  if v_already_linked and not v_object_exists then
    raise exception 'O objeto vinculado está ausente.' using errcode = '55000';
  end if;
  v_upload_required := not v_object_exists;

  select * into v_conflicting_intent
  from private.course_source_pdf_upload_intents intent
  where intent.actor_id = p_actor_id
    and intent.course_id = p_course_id
    and intent.storage_path = v_storage_path
    and intent.expires_at > statement_timestamp();
  v_path_intent_found := found;
  if v_path_intent_found
     and v_conflicting_intent.request_id is distinct from p_request_id then
    raise exception 'Outro envio deste PDF está em andamento; tente novamente.'
      using errcode = '40001';
  end if;
  if v_path_intent_found
     and v_conflicting_intent.request_fingerprint
       is distinct from v_request_fingerprint then
    raise exception 'requestId reutilizado com preparo de PDF incompatível.'
      using errcode = '23514';
  end if;
  if exists(
    select 1 from private.course_source_pdf_upload_intents intent
    where intent.actor_id = p_actor_id
      and intent.request_id = p_request_id
      and intent.expires_at > statement_timestamp()
      and (intent.course_id <> p_course_id
        or intent.storage_path <> v_storage_path)
  ) then
    raise exception 'requestId reutilizado para outro envio de PDF.'
      using errcode = '23514';
  end if;
  insert into private.course_source_pdf_upload_intents(
    actor_id,course_id,storage_path,content_hash,byte_size,media_type,
    source_id,source_revision,course_revision,created_at,expires_at,request_id,
    request_fingerprint
  ) values(
    p_actor_id,p_course_id,v_storage_path,p_content_hash,p_byte_size,
    p_media_type,v_source_id,v_source_revision,v_course_revision,
    statement_timestamp(),statement_timestamp()+interval '10 minutes',
    p_request_id,v_request_fingerprint
  )
  on conflict(actor_id,course_id,storage_path) do update set
    content_hash = excluded.content_hash,
    byte_size = excluded.byte_size,
    media_type = excluded.media_type,
    source_id = excluded.source_id,
    source_revision = excluded.source_revision,
    course_revision = excluded.course_revision,
    created_at = excluded.created_at,
    expires_at = excluded.expires_at,
    request_id = excluded.request_id,
    request_fingerprint = excluded.request_fingerprint;

  return jsonb_build_object(
    'contract','aralearn.course-source-pdf-ingestion-preparation.v1',
    'courseId',p_course_id,
    'courseRevision',v_course_revision,
    'requestId',p_request_id,
    'sourceId',v_source_id,
    'sourceRevision',v_source_revision,
    'attachment',jsonb_build_object(
      'contentHash',p_content_hash,
      'byteSize',p_byte_size,
      'mediaType',p_media_type,
      'storagePath',v_storage_path
    ),
    'uploadRequired',v_upload_required,
    'alreadyLinked',v_already_linked
  );
end;
$function$;

revoke all on function private.prepare_course_source_pdf_ingestion_core_v1(
  uuid,uuid,bigint,jsonb,text,bigint,text,text
) from public,anon,authenticated,service_role;
drop function private.prepare_course_source_pdf_ingestion_before_lifecycle_v1(
  uuid,uuid,bigint,jsonb,text,bigint,text,text
);

-- Fonte corrente: public.remove_course_source_pdf_for_actor_v1(uuid,uuid,bigint,jsonb,text,text)
CREATE OR REPLACE FUNCTION public.remove_course_source_pdf_for_actor_v1(p_actor_id uuid, p_course_id uuid, p_expected_revision bigint, p_command jsonb, p_channel text, p_request_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_hash text; v_receipt private.course_change_receipts%rowtype;
  v_course public.courses%rowtype; v_source private.course_sources%rowtype;
  v_attachment private.course_source_attachments%rowtype;
  v_source_id text; v_source_revision bigint; v_content_hash text;
  v_changed boolean:=false; v_result jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_revision is null or p_expected_revision<1
     or p_channel not in('application','mcp')
     or p_request_id is null
     or p_request_id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or jsonb_typeof(p_command) is distinct from 'object'
     or p_command-'type'-'sourceId'-'expectedSourceRevision'-'contentHash'<>'{}'::jsonb
     or not(p_command?&array['type','sourceId','expectedSourceRevision','contentHash'])
     or p_command->>'type'<>'remove_pdf'
     or jsonb_typeof(p_command->'sourceId')<>'string'
     or jsonb_typeof(p_command->'expectedSourceRevision')<>'number'
     or p_command->>'expectedSourceRevision'!~'^[1-9][0-9]*$'
     or p_command->>'contentHash'!~'^[a-f0-9]{64}$' then
    raise exception 'Comando remove_pdf inválido.' using errcode='22023';
  end if;
  v_source_id:=p_command->>'sourceId';
  v_source_revision:=(p_command->>'expectedSourceRevision')::bigint;
  v_content_hash:=p_command->>'contentHash';
  v_hash:=private.course_source_json_hash_v1(jsonb_build_object(
    'courseId',p_course_id,'expectedRevision',p_expected_revision,
    'channel',p_channel,'command',p_command
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:'||p_actor_id::text||':'||p_request_id,0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id=p_actor_id and receipt.request_id=p_request_id
    and receipt.expires_at<=statement_timestamp();
  select * into v_receipt from private.course_change_receipts receipt
  where receipt.actor_id=p_actor_id and receipt.request_id=p_request_id
    and receipt.expires_at>statement_timestamp();
  if found then
    if v_receipt.operation<>'execute_course_source_command'
       or v_receipt.course_id<>p_course_id or v_receipt.request_hash<>v_hash then
      raise exception 'requestId reutilizado com remoção de PDF incompatível.'
        using errcode='23514';
    end if;
    return (v_receipt.result-'idempotent')||jsonb_build_object('idempotent',true);
  end if;
  perform 1 from auth.users actor where actor.id=p_actor_id for key share;
  if not found then
    raise exception 'Pessoa inexistente ou inacessível.' using errcode='PT404';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('course-row:'||p_course_id::text,0));
  select * into strict v_course from public.courses course
  where course.id=p_course_id for update;
  if v_course.revision<>p_expected_revision then
    raise exception 'O Curso mudou; releia antes de remover o PDF.' using errcode='40001';
  end if;
  select * into v_source from private.course_sources source
  where source.course_id=p_course_id and source.source_id=v_source_id;
  if not found or v_source.status<>'active' or v_source.revision<>v_source_revision then
    raise exception 'A remoção exige a revisão corrente e ativa da Fonte.'
      using errcode='23514';
  end if;
  select * into v_attachment from private.course_source_attachments attachment
  where attachment.course_id=p_course_id and attachment.source_id=v_source_id
    and attachment.content_hash=v_content_hash and attachment.status='active'
  order by attachment.source_revision desc,attachment.created_at desc limit 1
  for update;
  if found then
    perform pg_advisory_xact_lock(hashtextextended(
      'course-source-pdf-object:'||v_attachment.storage_path,0
    ));
    update private.course_source_attachments attachment set
      status='removed',version=attachment.version+1,updated_at=clock_timestamp(),
      removed_at=clock_timestamp(),
      removed_course_revision=v_course.revision+1
    where attachment.course_id=v_attachment.course_id
      and attachment.source_id=v_attachment.source_id
      and attachment.source_revision=v_attachment.source_revision
      and attachment.content_hash=v_attachment.content_hash;
    update public.courses course set revision=course.revision+1,updated_at=now()
    where course.id=p_course_id returning * into v_course;
    null;
    if not exists(select 1 from private.course_source_attachments active_link
      where active_link.storage_path=v_attachment.storage_path
        and active_link.status='active') then
      insert into private.course_source_pdf_delete_intents(
        actor_id,request_id,course_id,source_id,content_hash,storage_path
      ) values(p_actor_id,p_request_id,p_course_id,v_source_id,v_content_hash,
        v_attachment.storage_path)
      on conflict(actor_id,request_id) do nothing;
    end if;
    v_changed:=true;
  end if;
  v_result:=jsonb_build_object(
    'contract','aralearn.course-source-change.v1','courseId',p_course_id,
    'courseRevision',v_course.revision,'requestId',p_request_id,
    'idempotent',false,'changed',v_changed,
    'change',case when v_changed then jsonb_build_object(
      'type','remove_pdf','subjectId',v_source_id,'revision',v_source_revision
    ) else null end
  );
  insert into private.course_change_receipts(
    actor_id,request_id,operation,course_id,request_hash,result
  ) values(p_actor_id,p_request_id,'execute_course_source_command',p_course_id,v_hash,v_result);
  return v_result;
end;
$function$;



-- Funções substituídas são nomeadas uma a uma; não há DROP CASCADE nem
-- reescrita dinâmica de corpos legados.
drop function if exists public.create_course_inspection_focus_for_actor_v1(
  uuid,uuid,bigint,text,jsonb,text
);
drop function if exists public.get_course_inspection_focus_for_actor_v1(
  uuid,uuid,uuid
);
drop function if exists public.list_owned_course_inspection_focus_units_for_actor_v1(
  uuid,uuid,bigint,uuid,text,text,integer,integer
);
drop function if exists public.list_owned_course_study_units_for_actor_v1(
  uuid,uuid,bigint,text,text,text,text,text,integer,integer
);
drop function if exists public.commit_course_instructional_plan_for_actor_v1(
  uuid,uuid,bigint,bigint,jsonb,jsonb,text,text
);
drop function if exists public.advance_course_authoring_part_materialization_for_actor_v1(uuid,uuid,uuid,uuid,bigint,bigint,text,jsonb,text,text);
drop function if exists public.advance_course_authoring_part_materialization_for_actor_v2(uuid,uuid,uuid,uuid,bigint,bigint,text,jsonb,text,text);
drop function if exists public.apply_course_design_command_for_actor_v1(uuid,uuid,bigint,jsonb,text,text);
drop function if exists public.create_course_variants_for_actor_v1(uuid,uuid,bigint,jsonb,text);
drop function if exists public.detach_course_variant_for_actor_v1(uuid,uuid,uuid,uuid,text);
drop function if exists public.execute_course_audit_cycle_command_for_actor_v1(uuid,uuid,bigint,jsonb,text,text);
drop function if exists public.get_owned_course_audit_cycle_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,text,integer);
drop function if exists public.get_owned_course_authoring_part_materialization_for_actor_v1(uuid,uuid,uuid,uuid);
drop function if exists public.get_owned_course_design_for_actor_v1(uuid,uuid,text,text,integer,text);
drop function if exists public.get_owned_course_instructional_plan_for_actor_v1(uuid,uuid,integer);
drop function if exists public.get_owned_course_instructional_plan_v1(uuid,integer);
drop function if exists public.get_owned_course_variant_comparison_for_actor_v1(uuid,uuid,bigint,uuid);
drop function if exists public.list_owned_course_variant_comparisons_for_actor_v1(uuid,uuid,bigint);
drop function if exists private.advance_course_authoring_part_materialization_core_v1(uuid,uuid,uuid,uuid,bigint,bigint,text,jsonb,text,text);
drop function if exists private.list_course_inspection_focus_units_for_actor_v1(
  uuid,uuid,bigint,uuid,text,text,integer,integer
);
drop function if exists private.assert_course_design_application_materialized_v1(
  uuid,text,jsonb,jsonb,jsonb
);
drop function if exists private.course_design_application_summary_v1(jsonb);
drop function if exists private.course_design_context_with_sources_v1(jsonb);
drop function if exists private.course_instructional_plan_command_document_v1(uuid);
drop function if exists private.course_instructional_plan_command_document_core_v1(uuid);
drop function if exists private.get_course_instructional_plan_for_actor_v1(
  uuid,uuid,integer
);
drop function if exists private.valid_course_design_application_v1(
  jsonb,text,jsonb
);
drop function if exists private.valid_course_design_application_v2(
  jsonb,text,jsonb
);
drop function if exists private.commit_course_instructional_plan_sources_core_v1(
  uuid,uuid,bigint,bigint,jsonb,jsonb,text,text
);
drop function if exists private.commit_course_instructional_plan_core_v1(
  uuid,uuid,bigint,bigint,jsonb,jsonb,text,text
);
drop function if exists private.advance_course_authoring_part_materialization_design_core_v1(uuid,uuid,uuid,uuid,bigint,bigint,text,jsonb,text,text);
drop function if exists private.apply_course_audit_source_snapshot_v1(uuid,text,bigint,jsonb,uuid,boolean);
drop function if exists private.clone_course_variant_from_source_v1(uuid,uuid,text,text,jsonb,jsonb);
drop function if exists private.course_audit_change_from_receipt_v1(jsonb,boolean);
drop function if exists private.course_audit_check_refs_current_v1(uuid,text,jsonb);
drop function if exists private.course_audit_context_v1(uuid,text,jsonb);
drop function if exists private.course_audit_correction_projection_v1(uuid,uuid,bigint);
drop function if exists private.course_audit_finding_matches_v1(private.course_audit_findings,jsonb);
drop function if exists private.course_audit_finding_projection_v1(uuid,uuid,bigint);
drop function if exists private.course_audit_json_hash_v1(jsonb);
drop function if exists private.course_audit_public_command_binding_v1(jsonb);
drop function if exists private.course_audit_run_focal_projection_v1(uuid,uuid,text,text,text,text);
drop function if exists private.course_audit_run_projection_v1(uuid,uuid);
drop function if exists private.course_audit_run_summary_projection_v1(uuid,uuid);
drop function if exists private.course_audit_selected_annotations_v1(uuid,text,jsonb);
drop function if exists private.course_audit_snapshot_v1(uuid,text);
drop function if exists private.course_audit_source_evidence_v1(uuid,jsonb);
drop function if exists private.course_audit_source_links_current_v1(uuid,text,jsonb);
drop function if exists private.course_audit_source_links_resolved_v1(uuid,jsonb);
drop function if exists private.course_audit_target_path_v1(uuid,text);
drop function if exists private.course_materialization_design_context_core_v1(uuid,uuid,bigint,jsonb);
drop function if exists private.course_materialization_design_context_v1(uuid,uuid,bigint,jsonb);
drop function if exists private.course_variant_comparison_differences_v1(jsonb);
drop function if exists private.course_variant_member_facts_v1(uuid);
drop function if exists private.course_variant_plan_checkpoint_snapshot_v1(uuid);
drop function if exists private.execute_course_audit_cycle_command_core_v1(uuid,uuid,bigint,jsonb,text,text);
drop function if exists private.execute_course_audit_cycle_command_pre_continuous_inspection_v1(uuid,uuid,bigint,jsonb,text,text);
drop function if exists private.get_course_audit_cycle_v1(uuid,uuid,bigint,bigint,jsonb,text,integer);
drop function if exists private.get_owned_course_authoring_part_materialization_core_v1(uuid,uuid,uuid,uuid);
drop function if exists private.get_owned_course_authoring_part_materialization_design_core_v1(uuid,uuid,uuid,uuid);
drop function if exists private.record_course_annotation_event_v1(private.course_anchored_annotations,text,uuid,text,jsonb);
drop function if exists private.valid_course_audit_check_v1(jsonb);
drop function if exists private.valid_course_audit_resource_instance_v1(jsonb,text);
drop function if exists private.valid_course_audit_source_links_v1(jsonb);
drop function if exists private.valid_course_source_materialization_application_v1(jsonb,text,jsonb,jsonb);
drop function if exists private.course_authoring_guidance_for_scope_v1(uuid,jsonb);
drop function if exists private.course_component_policy_for_scope_v1(uuid,jsonb);
drop function if exists private.course_design_parameters_for_scope_v1(uuid,jsonb);
drop function if exists private.course_design_target_human_snapshot_v1(jsonb,text);
drop function if exists private.course_relevant_design_fingerprint_v1(jsonb);
drop function if exists private.course_relevant_design_fingerprint_v2(jsonb,text);
drop function if exists private.recent_course_design_applications_v1(uuid,text,text);
drop function if exists private.get_course_instructional_plan_for_actor_core_v1(uuid,uuid,integer);
drop function if exists private.course_plan_sources_projection_v1(uuid,jsonb);
drop function if exists private.course_plan_item_sources_projection_v1(uuid,jsonb);
drop function if exists private.course_plan_without_sources_v1(jsonb);
drop function if exists private.course_effective_source_links_v1(uuid,text,text);
drop function if exists private.course_source_context_plan_items_v1(uuid,jsonb);

drop table private.course_audit_finding_annotations;
drop table private.course_authoring_corrections;
drop table private.course_audit_findings;
drop table private.course_instructional_audit_runs;
drop table private.course_variant_comparison_members;
drop table private.course_variant_comparison_sets;
drop table private.course_variant_plan_checkpoints;
drop table private.course_authoring_part_materialization_steps;
drop table private.course_authoring_part_materializations;
drop table private.course_authoring_guidance_interpretations;
drop table private.course_design_parameter_changes;
drop table private.course_authoring_guidance_revisions;
drop table private.course_component_policy_changes;
drop table private.course_anchored_annotation_events;
drop table private.course_anchored_annotation_receipts;
drop table private.course_inspection_focuses;
drop table private.course_events;

drop function if exists private.valid_course_guidance_interpretation_v1(jsonb);

drop function if exists private.course_variant_plan_snapshot_hash_v1(jsonb);
drop function if exists private.guard_course_audit_annotation_link_v1();
drop function if exists private.guard_course_audit_fact_v1();
drop function if exists private.preserve_course_annotation_event_v1();
drop function if exists private.reject_course_design_update_v1();
drop function if exists private.reject_course_variant_history_change_v1();
drop function if exists private.valid_course_audit_checks_v1(jsonb);
drop function if exists private.valid_course_audit_study_unit_content_v1(jsonb);
drop function if exists private.valid_course_audit_text_v1(text,integer,integer,boolean,boolean);
drop function if exists private.valid_course_audit_timestamp_v1(text);
drop function private.apply_course_source_attribution_v1(
  uuid,text,text,bigint,jsonb,uuid,boolean,text
);
drop function private.valid_course_source_links_shape_v1(jsonb,boolean);
drop function private.valid_course_source_pdf_ingestion_intent_v1(jsonb);
drop function private.valid_course_annotation_path_v1(jsonb);

do $advance_authoring_runtime_cut_manifest$
declare
  v_manifest jsonb;
  v_features jsonb;
  v_body text;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  select coalesce(jsonb_agg(to_jsonb(feature.value) order by feature.value),'[]'::jsonb)
    into v_features
  from (
    select distinct value
    from jsonb_array_elements_text(v_manifest->'features') feature(value)
    where value not in(
      'authenticated-course-source-pdf-upload-v1',
      'continuous-authoring-inspection-v1',
      'course-audit-annotation-links-v1',
      'course-audit-cycle-v1',
      'course-authoring-corrections-v1',
      'course-authoring-guidance-v1',
      'course-authoring-part-materialization-history-v1',
      'course-authoring-part-materialization-v1',
      'course-component-policy-v1',
      'course-design-parameters-v1',
      'course-inspection-focus-v1',
      'course-instructional-plan-v1',
      'course-study-unit-inspection-v1',
      'course-variant-comparison-list-v1',
      'course-variant-comparisons-v1',
      'course-variant-factual-comparison-v1'
    )
    union
    select unnest(array[
      'course-anchored-annotations-atomic-create-v1',
      'course-authoring-configuration-v2',
      'course-authoring-part-materialization-atomic-v1',
      'course-authoring-part-save-v1',
      'course-instructional-plan-v2',
      'course-source-current-state-v1',
      'course-study-unit-inspection-v2',
      'single-authoring-runtime-v1'
    ])
  ) feature;
  v_manifest := jsonb_set(v_manifest,'{features}',v_features,true);
  v_manifest := jsonb_set(
    v_manifest,'{schemaRevision}',to_jsonb('20260902044404'::text),true
  );
  v_body := 'select ' || quote_literal(v_manifest::text) || '::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      || 'returns jsonb language sql stable security definer '
      || 'set search_path = pg_catalog as %L',
    v_body
  );
end;
$advance_authoring_runtime_cut_manifest$;

do $authoring_runtime_cut_postflight$
declare
  v_manifest jsonb;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision' <> '20260902044404'
     or not (v_manifest->'features' @> '[
       "course-anchored-annotations-atomic-create-v1",
       "course-authoring-configuration-v2",
       "course-authoring-part-materialization-atomic-v1",
       "course-authoring-part-save-v1",
       "course-instructional-plan-v2",
       "course-source-current-state-v1",
       "course-study-unit-inspection-v2",
       "single-authoring-runtime-v1"
     ]'::jsonb)
     or v_manifest->'features' ?| array[
       'course-audit-cycle-v1','course-authoring-corrections-v1',
       'course-authoring-part-materialization-v1',
       'course-authoring-part-materialization-history-v1',
       'course-variant-comparisons-v1','course-design-parameters-v1'
     ] then
    raise exception 'O manifesto final do corte de Autoria divergiu.'
      using errcode='55000';
  end if;
  if to_regclass('private.course_events') is not null
     or to_regclass('private.course_authoring_part_materializations') is not null
     or to_regclass('private.course_instructional_audit_runs') is not null
     or to_regclass('private.course_variant_comparison_sets') is not null
     or to_regclass('private.course_design_parameter_changes') is not null
     or to_regclass('private.course_anchored_annotation_receipts') is not null
     or to_regclass('private.course_inspection_focuses') is not null
     or to_regclass('private.course_source_revisions') is not null
     or to_regclass('private.course_source_anchor_revisions') is not null
     or to_regclass('private.course_sources') is null
     or to_regclass('private.course_source_anchors') is null
     or exists(
       select 1 from information_schema.columns column_value
       where column_value.table_schema='private'
         and (
           column_value.table_name='course_authoring_parts'
             and column_value.column_name='retired_at'
           or column_value.table_name in(
             'course_source_attributions','course_source_attribution_sources',
             'course_source_attribution_anchors'
           ) and column_value.column_name in(
             'revision','attribution_hash','source_revision','anchor_revision'
           )
         )
     ) then
    raise exception 'O schema final ainda contém autoridade substituída.'
      using errcode='55000';
  end if;
  if to_regprocedure(
       'public.materialize_course_authoring_part_for_actor_v1(uuid,uuid,uuid,bigint,bigint,jsonb,text,text)'
     ) is null
     or to_regprocedure(
       'public.save_course_authoring_part_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,text,text)'
     ) is null
     or to_regprocedure(
       'public.get_owned_course_design_for_actor_v2(uuid,uuid,text,text,integer,text)'
     ) is null
     or to_regprocedure(
       'public.apply_course_design_command_for_actor_v2(uuid,uuid,bigint,jsonb,text,text,text)'
     ) is null
     or to_regprocedure(
       'public.get_owned_course_instructional_plan_for_actor_v2(uuid,uuid)'
     ) is null
     or to_regprocedure(
       'public.create_course_anchored_annotations_for_actor_v1(uuid,uuid,bigint,jsonb,text,text)'
     ) is null
     or to_regprocedure(
       'public.get_course_source_pdf_download_for_actor_v1(uuid,uuid,bigint,text,bigint,text)'
     ) is null
     or to_regprocedure(
       'public.attach_course_source_pdf_for_actor_v1(uuid,uuid,bigint,jsonb,text,text)'
     ) is not null
     or to_regprocedure(
       'public.get_course_source_attachment_access_for_actor_v1(uuid,uuid,bigint,text,text,bigint,text,bigint,text)'
     ) is not null then
    raise exception 'Uma fronteira final de Autoria está ausente.' using errcode='55000';
  end if;
  if exists(
    with candidate as materialized (
      select procedure_value.oid
      from pg_proc procedure_value
      join pg_namespace namespace_value
        on namespace_value.oid=procedure_value.pronamespace
      where namespace_value.nspname in('public','private')
        and procedure_value.prokind='f'
    )
    select 1 from candidate
    where pg_get_functiondef(candidate.oid) ~
        '(course_events|course_authoring_part_materializations|course_authoring_part_materialization_steps|course_instructional_audit_runs|course_audit_findings|course_authoring_corrections|course_variant_comparison_sets|course_design_parameter_changes|course_authoring_guidance_revisions|course_authoring_guidance_interpretations|course_component_policy_changes|course_source_revisions|course_source_anchor_revisions|course_anchored_annotation_receipts|course_inspection_focuses|attach_course_source_pdf_for_actor_v1|get_course_source_attachment_access_for_actor_v1|unresolved_legacy|imported_legacy|legacy_reference|before_pdf_lifecycle|valid_course_source_links_shape_v1)'
  ) then
    raise exception 'Uma função final ainda referencia o runtime substituído.'
      using errcode='55000';
  end if;
  if has_function_privilege(
       'authenticated',
       'public.materialize_course_authoring_part_for_actor_v1(uuid,uuid,uuid,bigint,bigint,jsonb,text,text)',
       'execute'
     ) or has_function_privilege(
       'anon',
       'public.save_course_authoring_part_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,text,text)',
       'execute'
     ) or has_function_privilege(
       'authenticated',
       'public.create_course_anchored_annotations_for_actor_v1(uuid,uuid,bigint,jsonb,text,text)',
       'execute'
     ) or not has_function_privilege(
       'service_role',
       'public.get_owned_course_design_for_actor_v2(uuid,uuid,text,text,integer,text)',
       'execute'
     ) or not has_function_privilege(
       'service_role',
       'public.create_course_anchored_annotations_for_actor_v1(uuid,uuid,bigint,jsonb,text,text)',
       'execute'
     ) then
    raise exception 'Privilégios das fronteiras finais divergem.' using errcode='55000';
  end if;
  if exists(
    select 1 from pg_policy policy_value
    join pg_class relation on relation.oid=policy_value.polrelid
    join pg_namespace namespace_value on namespace_value.oid=relation.relnamespace
    where namespace_value.nspname='storage' and relation.relname='objects'
      and (coalesce(pg_get_expr(policy_value.polqual,policy_value.polrelid),'')
        || coalesce(pg_get_expr(policy_value.polwithcheck,policy_value.polrelid),''))
        like '%course-source-pdfs%'
  ) then
    raise exception 'O bucket PDF ainda possui acesso direto por policy.'
      using errcode='55000';
  end if;
end;
$authoring_runtime_cut_postflight$;

commit;
