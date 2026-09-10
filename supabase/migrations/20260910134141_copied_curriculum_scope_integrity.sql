begin;
set local lock_timeout='5s';
set local statement_timeout='5min';

-- scopeItemIds e as associações curriculum_scope_item são duas projeções do
-- mesmo conjunto. O writer curricular grava ambas; a associação não tem ordem.
-- Reparar somente cópias identificadas, usando seus próprios alvos remapeados.
-- Não consultar a origem, que pode ter mudado ou deixado de existir.
do $repair_copied_scope$
declare
  v_course record; v_micro record; v_plan_id uuid; v_ids jsonb;
  v_local_ids jsonb; v_count integer; v_changed boolean;
begin
  for v_course in select id from public.courses
    where copy_origin->>'contract'='aralearn.course-copy-origin.v1' order by id loop
    perform pg_advisory_xact_lock(hashtextextended('course-row:'||v_course.id::text,0));
    perform 1 from public.courses where id=v_course.id for update;
    v_changed:=false;
    for v_micro in select * from private.course_entities
      where course_id=v_course.id and entity_type='microsequence' and content ? 'scopeItemIds'
      order by entity_id for update loop
      v_ids:=v_micro.content->'scopeItemIds';
      if jsonb_typeof(v_ids) is distinct from 'array' then
        raise exception 'Cobertura da cópia % / % não é uma lista.',v_course.id,v_micro.entity_id using errcode='23514';
      end if;
      -- Uma referência só é válida no plano deste curso e na natureza de escopo.
      if not exists(select 1 from jsonb_array_elements(v_ids) ref(value)
        where not exists(select 1 from private.course_instructional_plan_items item
          join private.course_instructional_plans plan on plan.id=item.instructional_plan_id and plan.course_id=item.course_id
          where item.course_id=v_course.id and item.item_kind='curriculum_scope_item'
            and to_jsonb(item.id::text)=ref.value)) then continue; end if;

      v_count:=jsonb_array_length(v_ids);
      if v_count not between 1 and 64 or exists(select 1 from jsonb_array_elements(v_ids) ref(value)
        where jsonb_typeof(ref.value)<>'string' or ref.value#>>'{}'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
        or (select count(distinct value) from jsonb_array_elements(v_ids))<>v_count then
        raise exception 'Cobertura da cópia % / % tem identidades ambíguas.',v_course.id,v_micro.entity_id using errcode='23514';
      end if;
      select id into v_plan_id from private.course_instructional_plans where course_id=v_course.id;
      if v_plan_id is null then raise exception 'Plano da cópia % ausente.',v_course.id using errcode='23514'; end if;
      if exists(select 1 from private.course_design_target_plan_items target
        left join private.course_instructional_plan_items item on item.course_id=target.course_id
          and item.id=target.plan_item_id and item.item_kind=target.plan_item_kind
        where target.course_id=v_course.id and target.didactic_microsequence_id=v_micro.entity_id
          and (target.plan_item_kind='curriculum_scope_item' or item.item_kind='curriculum_scope_item')
          and (item.id is null or item.instructional_plan_id<>v_plan_id
            or target.didactic_microsequence_entity_type<>'microsequence')) then
        raise exception 'Associação de escopo da cópia % / % incompatível.',v_course.id,v_micro.entity_id using errcode='23514';
      end if;
      select coalesce(jsonb_agg(item.id::text order by item.position,item.id),'[]'::jsonb) into v_local_ids
      from private.course_design_target_plan_items target
      join private.course_instructional_plan_items item on item.course_id=target.course_id
        and item.id=target.plan_item_id and item.item_kind=target.plan_item_kind
      where target.course_id=v_course.id and target.didactic_microsequence_id=v_micro.entity_id
        and target.plan_item_kind='curriculum_scope_item' and item.instructional_plan_id=v_plan_id;
      if jsonb_array_length(v_local_ids)<>v_count
        or (select count(distinct value) from jsonb_array_elements(v_local_ids))<>v_count
        or exists(select 1 from jsonb_array_elements(v_ids) ref(value)
          join private.course_instructional_plan_items item on to_jsonb(item.id::text)=ref.value
            and item.course_id=v_course.id
          where item.item_kind<>'curriculum_scope_item' or not(v_local_ids @> jsonb_build_array(ref.value))) then
        raise exception 'Associações insuficientes ou incompatíveis para a cobertura da cópia % / %.',v_course.id,v_micro.entity_id using errcode='23514';
      end if;
      update private.course_entities set content=jsonb_set(content,'{scopeItemIds}',v_local_ids),
        version=version+1,updated_at=now()
      where course_id=v_course.id and entity_type='microsequence' and entity_id=v_micro.entity_id;
      v_changed:=true;
    end loop;
    if v_changed then
      -- A referência de aprovação antiga já não descreve o mapa reparado.
      -- Declarações de revisão e proveniência do conteúdo permanecem intactas.
      update private.course_instructional_plans set curriculum_map_status='draft',version=version+1,updated_at=now()
        where course_id=v_course.id;
      update public.courses set revision=revision+1,updated_at=now() where id=v_course.id;
    end if;
  end loop;
end $repair_copied_scope$;

-- Alteração focal no escritor vigente: preserva recibos, acesso, locks, arquivos
-- e a captura posterior da base aplicada, sem reinstalar uma versão histórica.
do $copy_scope$
declare v_definition text; v_before text; v_after text;
begin
  select replace(pg_get_functiondef('public.copy_course_for_actor_v1(uuid,uuid,bigint,text,boolean,text,timestamptz)'::regprocedure),E'\r\n',E'\n') into v_definition;
  v_before:='select v_id,entity_type,entity_id,parent_type,parent_id,position,content,version,created_at,updated_at,';
  v_after:=$copy_content$select v_id,entity_type,entity_id,parent_type,parent_id,position,
      case when entity_type='microsequence' and content ? 'scopeItemIds' then
        jsonb_set(content,'{scopeItemIds}',private.remap_copied_design_v1(
          jsonb_build_object('curriculumScopeItemIds',content->'scopeItemIds'),v_items,true)->'curriculumScopeItemIds')
        else content end,version,created_at,updated_at,$copy_content$;
  if position(v_before in v_definition)>0 then
    v_definition:=replace(v_definition,v_before,v_after);
  elsif position(v_after in v_definition)=0 then
    raise exception 'Escritor de cópia divergiu na projeção do conteúdo.';
  end if;
  v_before:='if not found then raise exception ''O mapa do curso não está disponível.'' using errcode=''23514''; end if;';
  v_after:=v_before||$copy_guard$
  -- Recusar projeções incoerentes antes de criar qualquer identidade de cópia.
  if exists(select 1 from private.course_entities micro
    where micro.course_id=p_source_course_id and micro.entity_type='microsequence' and micro.content ? 'scopeItemIds'
      and (jsonb_typeof(micro.content->'scopeItemIds') is distinct from 'array'
        or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(micro.content->'scopeItemIds')='array'
          then micro.content->'scopeItemIds' else '[]'::jsonb end) ref(value)
          where not exists(select 1 from private.course_instructional_plan_items item
            join private.course_design_target_plan_items target on target.course_id=item.course_id
              and target.plan_item_id=item.id and target.plan_item_kind=item.item_kind
            where item.course_id=p_source_course_id and item.instructional_plan_id=v_plan.id
              and item.item_kind='curriculum_scope_item' and target.didactic_microsequence_id=micro.entity_id
              and to_jsonb(item.id::text)=ref.value)))) then
    raise exception 'A cobertura do curso não corresponde às associações locais.' using errcode='23514';
  end if;$copy_guard$;
  if position(v_after in v_definition)=0 then
    if position(v_before in v_definition)=0 then raise exception 'Escritor de cópia divergiu na leitura do plano.'; end if;
    v_definition:=replace(v_definition,v_before,v_after);
  end if;
  execute v_definition;
end $copy_scope$;

do $manifest$
declare manifest jsonb;
begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260910134141');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
commit;
