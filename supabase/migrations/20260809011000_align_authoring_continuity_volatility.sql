begin;

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-align-authoring-continuity-volatility-v1',
  0
));

do $require_authoring_continuity_helpers$
begin
  if to_regprocedure(
    'private.valid_authoring_continuity_v1(jsonb)'
  ) is null
     or to_regprocedure(
       'private.normalize_authoring_continuity_v1(jsonb,jsonb,bigint)'
     ) is null
     or to_regprocedure(
       'private.remap_authoring_continuity_v1(jsonb,text,jsonb,jsonb)'
     ) is null then
    raise exception 'Helpers de continuidade autoral não encontrados.'
      using errcode = '55000';
  end if;
end;
$require_authoring_continuity_helpers$;

-- As três rotinas usam expressões STABLE do PostgreSQL. A volatilidade deve
-- refletir isso para que o planejador não trate seus resultados como constantes.
alter function private.valid_authoring_continuity_v1(jsonb) stable;
alter function private.normalize_authoring_continuity_v1(
  jsonb, jsonb, bigint
) stable;
alter function private.remap_authoring_continuity_v1(
  jsonb, text, jsonb, jsonb
) stable;

do $assert_authoring_continuity_volatility$
begin
  if exists (
    select 1
    from pg_proc procedure_value
    where procedure_value.oid in (
      'private.valid_authoring_continuity_v1(jsonb)'::regprocedure,
      'private.normalize_authoring_continuity_v1(jsonb,jsonb,bigint)'::regprocedure,
      'private.remap_authoring_continuity_v1(jsonb,text,jsonb,jsonb)'::regprocedure
    )
      and procedure_value.provolatile <> 's'
  ) then
    raise exception 'Volatilidade da continuidade autoral divergente.'
      using errcode = '55000';
  end if;
end;
$assert_authoring_continuity_volatility$;

commit;
