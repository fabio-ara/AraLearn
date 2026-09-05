-- Conserva a decisão histórica sem afirmar que conteúdo alterado mantém a análise.
begin;
set local lock_timeout='5s';
set local statement_timeout='5min';
select pg_advisory_xact_lock(hashtextextended('aralearn:preserve-applied-design',0));
lock table private.course_entities in share row exclusive mode;
do $preflight$
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision' is distinct from '20260905092640' then
    raise exception 'A revisão anterior do runtime divergiu.' using errcode='55000';
  end if;
end $preflight$;

-- A aplicação que já era excluída da análise corrente não é promovida pela
-- mudança de critério. O snapshot, inclusive appliedAt, permanece literal.
update private.course_entities set design_application=null
where entity_type='study_unit' and design_application is not null
  and (case when jsonb_typeof(design_snapshot->'appliedAt')='string'
    then (design_snapshot->>'appliedAt')::timestamptz>=updated_at
    else false end
    and design_application->>'contract'='aralearn.study-unit-design-application.v1') is not true;

alter table private.course_entities drop constraint course_entities_design_current_v1;
alter table private.course_entities add constraint course_entities_design_current_v1 check((
  entity_type='study_unit' and (
    design_snapshot is null and design_application is null
    or jsonb_typeof(design_snapshot)='object'
      and design_snapshot->>'contract'='aralearn.study-unit-design-snapshot.v2'
      and octet_length(design_snapshot::text)<=65536
      and (design_application is null or jsonb_typeof(design_application)='object'
        and design_application->>'contract'='aralearn.study-unit-design-application.v1'
        and octet_length(design_application::text)<=65536)
  ) and (created_origin is null or created_origin in('human','gpt'))
    and (last_revision_origin is null or last_revision_origin in('human','gpt'))
  or entity_type<>'study_unit' and design_snapshot is null and design_application is null
    and created_origin is null and last_revision_origin is null
) is true);

-- A decisão é tomada no core para abranger todos os escritores de composição.
-- Título sozinho não altera as declarações semânticas; prosa, resposta,
-- arquivos citados, papel e hierarquia alterados invalidam a aplicação atual.
do $core$
declare definition text; old_fragment text;
begin
  definition:=replace(pg_get_functiondef('private.commit_course_composition_core_v1(uuid,uuid,bigint,jsonb,jsonb,text,jsonb)'::regprocedure),E'\r\n',E'\n');
  old_fragment:=$before$    content = excluded.content,
    version = private.course_entities.version + 1,$before$;
  if position(old_fragment in definition)=0 then raise exception 'A definição anterior não corresponde ao recorte esperado.' using errcode='55000'; end if;
  definition:=replace(definition,old_fragment,$after$    content = excluded.content,
    design_application = case when row(
      private.course_entities.parent_type,private.course_entities.parent_id,
      private.course_entities.position,private.course_entities.content-'title'
    ) is not distinct from row(
      excluded.parent_type,excluded.parent_id,excluded.position,excluded.content-'title'
    ) then private.course_entities.design_application else null end,
    version = private.course_entities.version + 1,$after$);
  execute definition;
end $core$;

-- O wrapper registra origem e recibo; não fabrica data ou aplicação por canal.
do $wrapper$
declare definition text; old_fragment text;
begin
  definition:=replace(pg_get_functiondef('public.commit_course_composition_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,text,jsonb)'::regprocedure),E'\r\n',E'\n');
  old_fragment:=$before$  v_design_preservable_study_unit_ids text[] := array[]::text[];
$before$;
  if position(old_fragment in definition)=0 then raise exception 'A definição anterior não corresponde ao recorte esperado.' using errcode='55000'; end if;
  definition:=replace(definition,old_fragment,$after$$after$);
  old_fragment:=$before$    select coalesce(array_agg(item.value->>'entityId') filter(
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
      ),array[]::text[]),
      coalesce(array_agg(item.value->>'entityId') filter(
        where item.value->>'entityType'='study_unit'
          and entity.course_id is not null
          and row(
            entity.parent_type,entity.parent_id,entity.position,
            entity.content->>'role'
          ) is not distinct from row(
            nullif(item.value->>'parentType',''),nullif(item.value->>'parentId',''),
            case when item.value->>'position'~'^[0-9]+$'
              then (item.value->>'position')::integer end,
            item.value#>>'{content,role}'
          )
          and jsonb_typeof(entity.design_snapshot)='object'
          and jsonb_typeof(entity.design_application)='object'
          and not exists(
            select 1
            from unnest(private.course_component_refs_from_content_v1(
              item.value->'content'
            )) component(ref)
            where private.course_component_policy_allows_v1(
              entity.design_snapshot#>'{componentPolicy,policy}',component.ref
            ) is not true
          )
      ),array[]::text[])
    into v_created_study_unit_ids,v_changed_study_unit_ids,
      v_design_preservable_study_unit_ids
$before$;
  if position(old_fragment in definition)=0 then raise exception 'A definição anterior não corresponde ao recorte esperado.' using errcode='55000'; end if;
  definition:=replace(definition,old_fragment,$after$    select coalesce(array_agg(item.value->>'entityId') filter(
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
$after$);
  old_fragment:=$before$      last_revision_origin=v_change_origin,
      design_snapshot=case
        when (p_channel='mcp' or p_channel='application'
          and p_application_origin='provider_assistance')
          and entity.entity_id=any(v_design_preservable_study_unit_ids)
          then jsonb_set(
            entity.design_snapshot,'{appliedAt}',to_jsonb(entity.updated_at),true
          )
        else null
      end,
      design_application=case
        when (p_channel='mcp' or p_channel='application'
          and p_application_origin='provider_assistance')
          and entity.entity_id=any(v_design_preservable_study_unit_ids)
          then jsonb_set(
            entity.design_application,
            '{componentRefs}',
            to_jsonb(private.course_component_refs_from_content_v1(entity.content)),
            true
          )
        else null
      end
$before$;
  if position(old_fragment in definition)=0 then raise exception 'A definição anterior não corresponde ao recorte esperado.' using errcode='55000'; end if;
  definition:=replace(definition,old_fragment,$after$      last_revision_origin=v_change_origin
$after$);
  if position('v_design_preservable_study_unit_ids' in definition)>0 or position('design_snapshot=case' in definition)>0 then raise exception 'A heurística anterior não foi removida.' using errcode='55000'; end if;
  execute definition;
end $wrapper$;

-- A presença da aplicação agora é mantida pelo escritor, sem adulterar a data
-- histórica da decisão para fazê-la parecer posterior à edição de um título.
do $analytics$
declare definition text; old_fragment text;
begin
  definition:=replace(pg_get_functiondef('public.get_owned_course_authoring_analytics_for_actor_v3(uuid,uuid,bigint,jsonb)'::regprocedure),E'\r\n',E'\n');
  old_fragment:=$before$      and (unit.design_snapshot->>'appliedAt')::timestamptz >= unit.updated_at
$before$;
  if position(old_fragment in definition)=0 then raise exception 'A definição anterior não corresponde ao recorte esperado.' using errcode='55000'; end if;
  definition:=replace(definition,old_fragment,$after$$after$);
  execute definition;
end $analytics$;
do $manifest$
declare manifest jsonb;
begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260905094109');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L','select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
commit;
