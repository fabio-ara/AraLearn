-- Mantém o registro de fontes alinhado ao contrato público de autoria.
-- A função original já está aplicada em instalações existentes; esta migration
-- altera somente a lista de metadados aceitos, sem reescrever seu fluxo.
do $migration$
declare
  v_function regprocedure := to_regprocedure(
    'public.apply_authoring_command(uuid,uuid,text,uuid,text,text,jsonb)'
  );
  v_definition text;
  v_patched text;
  v_old text := $fragment$'author', 'usageNotes'$fragment$;
  v_new text := $fragment$'author', 'publishedOn', 'publishedVersion', 'accessedOn',
            'usageTerms', 'usageNotes'$fragment$;
  v_occurrences integer;
begin
  if v_function is null then
    raise exception 'A função public.apply_authoring_command não existe.';
  end if;

  select pg_get_functiondef(v_function) into v_definition;
  v_occurrences := (
    length(v_definition) - length(replace(v_definition, v_old, ''))
  ) / length(v_old);
  if v_occurrences <> 1 then
    raise exception
      'A validação de fontes mudou inesperadamente; esperado 1 trecho, obtidos %.',
      v_occurrences;
  end if;

  v_patched := replace(v_definition, v_old, v_new);
  execute v_patched;
end;
$migration$;

comment on function public.apply_authoring_command(
  uuid, uuid, text, uuid, text, text, jsonb
) is
  'Aplica comandos idempotentes do fluxo de autoria e preserva metadados versionados das fontes.';
