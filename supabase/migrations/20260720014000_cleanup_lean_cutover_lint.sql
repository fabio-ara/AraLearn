begin;

-- These helpers belonged exclusively to the cloned-tree/authoring path removed
-- by the lean cutover. Repository-wide call-site review found no live caller.
-- Do not use CASCADE here: an unexpected database dependency must stop the
-- migration instead of silently removing another object.
drop function if exists private.validate_microsequence_fragment_scope(uuid,uuid,jsonb);
drop function if exists private.fragment_entity_microsequence_id(text,uuid);
drop function if exists private.position_findings(uuid);

-- Earlier releases created different signatures of these helpers. Remove every
-- surviving overload, still without CASCADE, so none can remain lintable against
-- the now lean didactic tables.
do $$
declare
  v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private'
      and p.proname in ('soft_delete_course_tree','soft_delete_microsequence_cards')
  loop
    execute format('drop function %s',v_function);
  end loop;
end;
$$;

-- A FOR integer loop owns its index variable. The former explicit declaration
-- shadowed that variable and was never read.
create or replace function private.camel_key(p_key text)
returns text
language plpgsql
immutable
strict
set search_path=pg_catalog
as $$
declare
  v_parts text[]:=string_to_array(p_key,'_');
  v_result text:=lower(v_parts[1]);
begin
  for v_index in 2..coalesce(array_length(v_parts,1),1) loop
    v_result:=v_result||upper(left(v_parts[v_index],1))||substr(v_parts[v_index],2);
  end loop;
  return v_result;
end;
$$;

-- These adapters call PostgreSQL routines with the indicated volatility. Their
-- former declarations were stricter than their expressions and could permit an
-- invalid planner assumption.
alter function private.shape_store_payload(text,jsonb,text) stable;
alter function private.local_row(text,jsonb) stable;
alter function public.sync_storage_diagnostics() volatile;

-- plpgsql_check traces a constant FOREACH text[] as one array-shaped relation.
-- Iterate over ordered VALUES instead: runtime order and quoting are unchanged,
-- while every possible identifier remains visible to the static checker.
create or replace function private.prepare_official_course_replacement(
  p_import_id uuid,
  p_course_id uuid
)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare
  v_table_name text;
  v_position_floor constant bigint:=1000000000;
begin
  if not public.is_app_admin() or p_import_id is null or p_course_id is null then
    raise exception 'Preparação de publicação oficial não autorizada ou inválida.' using errcode='42501';
  end if;
  if not exists(
    select 1 from private.official_catalog_imports i
    where i.import_id=p_import_id and i.course_id=p_course_id and i.status='staging'
  ) then
    raise exception 'Importação oficial em staging não corresponde ao curso.' using errcode='23514';
  end if;
  if exists(
    select 1 from private.official_catalog_import_stage_rows s
    where s.import_id=p_import_id
      and s.store_name in ('modules','lessons','microsequences','cards')
      and (
        coalesce(s.payload->>'contractKey','') like '__aralearn_stage_%'
        or case
          when coalesce(s.payload->>'position','')~'^\d+$'
            then (s.payload->>'position')::numeric>=v_position_floor
          else true
        end
      )
  ) then
    raise exception 'Chave ou posição canônica usa a faixa reservada da publicação.' using errcode='23514';
  end if;

  -- Child-first deletion frees every immediate invariant before staged rows are
  -- materialized. Ordinal is explicit so a planner change cannot alter order.
  for v_table_name in
    select config.table_name from (values
      (1,'card_refs'),(2,'block_highlights'),(3,'block_lines'),
      (4,'block_points'),(5,'block_cells'),(6,'block_matrix_items'),
      (7,'block_edges'),(8,'node_practice_items'),(9,'node_practices'),
      (10,'flow_practices'),(11,'flow_cases'),(12,'flow_nodes'),
      (13,'block_nodes'),(14,'block_options'),(15,'card_blocks'),
      (16,'microsequence_statements'),(17,'microsequence_dependencies'),
      (18,'topic_statements'),(19,'lesson_topics'),(20,'guide_items'),
      (21,'course_guides')
    ) config(ordinal,table_name)
    order by config.ordinal
  loop
    execute format('delete from public.%I where course_id=$1',v_table_name)
      using p_course_id;
  end loop;

  -- Vacate every immediate natural-key/position invariant of progress-bearing
  -- rows. Final positions are below this reserved range.
  for v_table_name in
    select config.table_name from (values
      (1,'modules'),(2,'lessons'),(3,'microsequences'),(4,'cards')
    ) config(ordinal,table_name)
    order by config.ordinal
  loop
    execute format($sql$
      with displaced as (
        select id,
          (1000000000::bigint+row_number() over(order by id))::integer as temporary_position,
          '__aralearn_stage_'||replace(id::text,'-','') as temporary_key
        from public.%I where course_id=$1
      )
      update public.%I target set
        position=displaced.temporary_position,
        contract_key=displaced.temporary_key
      from displaced where target.id=displaced.id
    $sql$,v_table_name,v_table_name) using p_course_id;
  end loop;
end;
$$;

revoke all on function private.prepare_official_course_replacement(uuid,uuid)
  from public,anon,authenticated;

create or replace function public.finalize_official_course_import(p_import_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
set statement_timeout='0'
as $$
declare
  v_import private.official_catalog_imports%rowtype;
  v_store text; v_expected integer; v_staged integer; v_row record;
  v_result jsonb; v_validation jsonb;
  v_staging_truncated boolean:=false;
  v_table_name text; v_stores text[];
begin
  if not public.is_app_admin() then raise exception 'Importação oficial exige administrador.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('aralearn-official-import-staging',0));
  select * into v_import from private.official_catalog_imports where import_id=p_import_id for update;
  if not found then raise exception 'Importação oficial não encontrada.' using errcode='22023'; end if;
  if v_import.status in ('draft','published') then
    v_staging_truncated:=private.release_empty_official_import_staging();
    return jsonb_build_object('status',v_import.status,'importId',p_import_id,'courseId',v_import.course_id,
      'contentHash',v_import.source_hash,'stagingTruncated',v_staging_truncated,'idempotent',true);
  end if;
  foreach v_store in array private.official_import_store_names() loop
    v_expected:=(v_import.expected_counts->>v_store)::integer;
    select count(*)::integer into v_staged from private.official_catalog_import_stage_rows
      where import_id=p_import_id and store_name=v_store;
    if v_staged<>v_expected then
      raise exception 'Importação incompleta em %: % de % linhas.',v_store,v_staged,v_expected using errcode='23514';
    end if;
  end loop;

  if not v_import.publish_requested and exists(
    select 1 from public.courses c
    where c.id=v_import.course_id
      and c.status='published' and c.deleted_at is null
  ) then
    raise exception 'Draft não pode substituir uma publicação ativa.' using errcode='23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('official-publication:'||v_import.course_id::text,0));
  perform set_config('aralearn.suppress_sync_changes','on',true);
  perform set_config('aralearn.suppress_course_dirty','on',true);
  set constraints all deferred;
  if exists(select 1 from public.courses where id=v_import.course_id) then
    update public.courses set
      contract_key=v_import.course_payload->>'contractKey',
      title=v_import.course_payload->>'title',goal=v_import.course_payload->>'goal',
      contract_scope=v_import.course_payload->>'contractScope',
      project_id=private.try_uuid(v_import.course_payload->>'projectId'),
      position=coalesce((v_import.course_payload->>'position')::integer,0),deleted_at=null
    where id=v_import.course_id;
  else
    insert into public.courses(
      id,status,contract_key,title,goal,contract_scope,project_id,position
    ) values(
      v_import.course_id,'draft',v_import.course_payload->>'contractKey',
      v_import.course_payload->>'title',v_import.course_payload->>'goal',
      v_import.course_payload->>'contractScope',
      private.try_uuid(v_import.course_payload->>'projectId'),
      coalesce((v_import.course_payload->>'position')::integer,0)
    );
  end if;

  perform private.prepare_official_course_replacement(p_import_id,v_import.course_id);

  foreach v_store in array private.official_import_store_names() loop
    for v_row in select entity_id,payload from private.official_catalog_import_stage_rows
      where import_id=p_import_id and store_name=v_store order by entity_id
    loop
      v_result:=private.apply_official_stage_row(
        v_store,v_import.course_id,v_row.entity_id,v_row.payload
      );
      if v_result is null then raise exception 'Falha atômica ao materializar %/%',v_store,v_row.entity_id using errcode='23514'; end if;
    end loop;
  end loop;

  -- Content tables have no feed trigger. Re-enable the personal feed before
  -- hard-deleting stale canonical rows so cascaded progress/comment removals
  -- reach every affected replica. Store aliases are data beside the relation,
  -- eliminating both the former array and its CASE mapping.
  perform set_config('aralearn.suppress_sync_changes','off',true);
  for v_table_name,v_stores in
    select config.table_name,config.stores from (values
      (1,'card_refs',array['cardSources','cardTopics']::text[]),
      (2,'block_highlights',array['highlights']::text[]),
      (3,'block_lines',array['lines']::text[]),
      (4,'block_points',array['points']::text[]),
      (5,'block_cells',array['cells']::text[]),
      (6,'block_matrix_items',array['matrixItems']::text[]),
      (7,'block_edges',array['edges']::text[]),
      (8,'node_practice_items',array[
        'flowPracticeOptions','flowPracticeVariants','flowShapeOptions'
      ]::text[]),
      (9,'node_practices',array['flowPracticeEntries']::text[]),
      (10,'flow_practices',array['flowPractices']::text[]),
      (11,'flow_cases',array['flowCases']::text[]),
      (12,'flow_nodes',array['flowNodes']::text[]),
      (13,'block_nodes',array['nodes']::text[]),
      (14,'block_options',array['options']::text[]),
      (15,'card_blocks',array['blocks']::text[]),
      (16,'cards',array['cards']::text[]),
      (17,'microsequence_statements',array['microsequenceStatements']::text[]),
      (18,'microsequence_dependencies',array['dependencies']::text[]),
      (19,'microsequences',array['microsequences']::text[]),
      (20,'topic_statements',array['topicStatements']::text[]),
      (21,'lesson_topics',array['topics']::text[]),
      (22,'guide_items',array['guideItems']::text[]),
      (23,'course_guides',array['guides']::text[]),
      (24,'lessons',array['lessons']::text[]),
      (25,'modules',array['modules']::text[])
    ) config(ordinal,table_name,stores)
    order by config.ordinal
  loop
    execute format(
      'delete from public.%I t where t.course_id=$1 and not exists ('||
      'select 1 from private.official_catalog_import_stage_rows s '
      'where s.import_id=$2 and s.store_name=any($3) and s.entity_id=t.id)',v_table_name
    ) using v_import.course_id,p_import_id,v_stores;
  end loop;

  perform private.reconcile_official_course_progress(v_import.course_id);

  v_validation:=public.validate_course_graph(v_import.course_id);
  if not coalesce((v_validation->>'valid')::boolean,false) then
    raise exception 'Curso importado é inválido: %',v_validation->'errors' using errcode='23514';
  end if;
  if v_import.publish_requested then
    update public.courses set status='published',publication_seq=case
      when content_hash is distinct from v_import.source_hash then publication_seq+1 else publication_seq end,
      content_hash=v_import.source_hash
    where id=v_import.course_id;
  end if;
  update private.official_catalog_imports set
    status=case when publish_requested then 'published' else 'draft' end,
    updated_at=now(),completed_at=now()
  where import_id=p_import_id;
  delete from private.official_catalog_import_stage_rows where import_id=p_import_id;
  delete from private.official_catalog_import_chunks where import_id=p_import_id;
  v_staging_truncated:=private.release_empty_official_import_staging();
  return jsonb_build_object(
    'status',case when v_import.publish_requested then 'published' else 'draft' end,
    'importId',p_import_id,'courseId',v_import.course_id,'validation',v_validation,
    'contentHash',v_import.source_hash,'publication',jsonb_build_object(
      'status',case when v_import.publish_requested then 'published' else 'draft' end,
      'courseId',v_import.course_id,'contentHash',v_import.source_hash,
      'publicationSeq',(select publication_seq from public.courses where id=v_import.course_id)
    ),'stagingTruncated',v_staging_truncated,'idempotent',false
  );
end;
$$;

revoke all on function public.finalize_official_course_import(uuid)
  from public,anon,authenticated;
grant execute on function public.finalize_official_course_import(uuid) to service_role;

commit;
