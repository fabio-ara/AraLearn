begin;

-- O texto do comentário e a decisão sobre ele são fatos distintos. Revisar o
-- texto não revoga uma resposta; responder não decide a fila implicitamente.
do $preserve_observation$
declare definition text; before_fragment text; after_fragment text; pair text[];
begin
  definition := replace(pg_get_functiondef(
    'private.execute_course_single_annotation_command_v1(uuid,uuid,bigint,jsonb,text,text,text,boolean)'::regprocedure),E'\r\n',E'\n');
  foreach pair slice 1 in array array[
    array[$old$        or v_annotation.brief_summary is distinct from v_summary
        or v_annotation.state<>'open'
        or v_annotation.owner_response is not null
        or v_annotation.owner_response_kind is not null
        or v_annotation.owner_response_source_links<>'[]'::jsonb;$old$,
      $new$        or v_annotation.brief_summary is distinct from v_summary;$new$],
    array[$old$          state='open',owner_response=null,owner_response_kind=null,
          owner_response_source_links='[]'::jsonb,
          responded_at=null,resolved_at=null,
$old$, ''],
    array[$old$          v_response_source_links
        or v_annotation.state='open';$old$, $new$          v_response_source_links;$new$],
    array[$old$          state=case when state='open' then 'considered' else state end,
          first_considered_at=coalesce(first_considered_at,v_now),
$old$, '']
  ] loop
    before_fragment := pair[1]; after_fragment := pair[2];
    if (length(definition)-length(replace(definition,before_fragment,'')))/length(before_fragment) <> 1 then
      raise exception 'O escritor de observações divergiu do precursor esperado.' using errcode='55000';
    end if;
    definition := replace(definition,before_fragment,after_fragment);
  end loop;
  execute definition;
end $preserve_observation$;

commit;
