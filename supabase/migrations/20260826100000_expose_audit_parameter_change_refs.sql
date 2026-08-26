-- O contexto público precisa devolver a identidade da mudança efetiva para que
-- clientes possam registrar parameterRefs que o próprio servidor valida.
do $migration$
declare
  v_definition text;
  v_before text := $before$'parameterId',entry->>'parameterId','value',entry#>'{effectiveAssignment,value}',$before$;
  v_after text := $after$'parameterId',entry->>'parameterId',
    'changeId',entry#>'{effectiveAssignment,changeId}',
    'value',entry#>'{effectiveAssignment,value}',$after$;
begin
  select pg_get_functiondef(
    'private.course_audit_context_v1(uuid,text,jsonb)'::regprocedure
  ) into v_definition;
  if position(v_after in v_definition)>0 then
    return;
  end if;
  if position(v_before in v_definition)=0 then
    raise exception 'course_audit_context_v1 não possui a projeção de parâmetro esperada';
  end if;
  execute replace(v_definition,v_before,v_after);
end
$migration$;
