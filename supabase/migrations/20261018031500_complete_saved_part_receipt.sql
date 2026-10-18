begin;
set local lock_timeout='5s';
set local statement_timeout='5min';

-- O fechamento reaproveita o acumulado validado pelo wrapper. Não há composição
-- de conteúdo a executar, mas continua obrigatório produzir o recibo atômico.
-- O guard geral de composição vazia permanece intacto.
do $complete_saved_receipt$
declare definition text; before_fragment text; after_fragment text; fragment_count integer;
begin
  select replace(pg_get_functiondef(
    'private.materialize_course_authoring_part_core_v1(uuid,uuid,uuid,bigint,bigint,jsonb,text,text)'::regprocedure
  ),E'\r\n',E'\n') into definition;
  before_fragment:=$before$  v_composition := public.commit_course_composition_for_actor_v1(
    p_actor_id,p_course_id,p_expected_course_revision,
    v_upserts,'[]'::jsonb,v_source_applications,p_request_id
  );$before$;
  after_fragment:=$after$  if jsonb_array_length(p_units)=0 then
    -- Owner/service role, CAS e locks já foram verificados acima. O wrapper
    -- só admite lote vazio para conclusão explícita do acumulado validado.
    insert into private.course_change_receipts(
      actor_id,request_id,operation,course_id,request_hash,result
    ) values(p_actor_id,p_request_id,'materialize_course_authoring_part_v1',
      p_course_id,p_request_hash,'{}'::jsonb);
    v_composition:=jsonb_build_object('createdCount',0,'updatedCount',0,'deletedCount',0);
  else
    v_composition := public.commit_course_composition_for_actor_v1(
      p_actor_id,p_course_id,p_expected_course_revision,
      v_upserts,'[]'::jsonb,v_source_applications,p_request_id
    );
  end if;$after$;
  fragment_count:=(length(definition)-length(replace(definition,before_fragment,'')))/length(before_fragment);
  if fragment_count<>1 then
    raise exception 'Chamada de composição do materializador divergiu: % ocorrência(s).',fragment_count;
  end if;
  execute replace(definition,before_fragment,after_fragment);
end $complete_saved_receipt$;

do $manifest$
declare manifest jsonb:=public.get_aralearn_runtime_manifest();
begin
  manifest:=manifest||jsonb_build_object('schemaRevision','20261018031500');
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(manifest::text)||'::jsonb'
  );
end $manifest$;
notify pgrst,'reload schema';
commit;
