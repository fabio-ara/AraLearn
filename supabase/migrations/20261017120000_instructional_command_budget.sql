begin;

-- O comando instrucional que carrega lote de unidades tinha um teto herdado de
-- 32 KiB, aplicado antes da validação de cada unidade e devolvido como 422
-- genérico. O teto passa a ser um contrato nomeado de 256 KiB, medido em
-- octetos do próprio jsonb recebido (octet_length(p_command::text)). O número
-- reusa a referência que a leitura do mesmo desenho já aplica em
-- get_owned_course_design_for_actor_v3 (262144 octetos); leitura e comando não
-- são o mesmo payload, e este teto não promete que todo desenho lido seja
-- salvável.
--
-- Medições locais das provas focais
-- (tests/runtime/instructional-command-budget-pglite.test.js), sempre sobre o
-- comando real, já com expectedPlanVersion: o lote observado de sete unidades
-- (seis com motivo de 670 caracteres e uma com aplicação explícita) mede 33279
-- octetos, acima do teto herdado de 32768 e abaixo do orçamento de 262144. No
-- mesmo formato sem a aplicação, a fronteira do teto herdado fica em 669
-- caracteres (32767 octetos, aceito) contra 670 (32809, recusado); a fronteira
-- do orçamento novo, no lote de 64 unidades com seis parâmetros calibrados,
-- fica em 574 caracteres por unidade (262021 octetos, aceito) contra 575
-- (262405, recusado). A serialização jsonb acrescenta um espaço após cada ':' e
-- ',', de modo que a contagem em octetos supera a contagem em bytes UTF-8 do
-- mesmo objeto: a variante acentuada do lote observado mede 36219 octetos
-- contra 35902 bytes; nesse texto, de faixa latina, cada caractere acentuado
-- ocupa dois octetos.
--
-- Os tetos dos canais são contratos independentes, medidos de outra forma: o
-- aplicativo e o canal de Actions aceitam corpos de 512 KiB (COURSE_BODY_LIMIT
-- e BODY_BYTE_LIMIT) e o MCP aceita 1 MiB; o canal de Actions ainda limita o
-- corpo inteiro por contagem de caracteres, que não é a medida do orçamento em
-- octetos.
--
-- A validação estrutural de superfície (envelope do comando e forma do lote)
-- precede o orçamento; a validação de cada unidade continua depois, dentro do
-- laço. Exceder o orçamento não divide o pedido nem grava parte das unidades: a
-- transação permanece igualmente atômica e o recibo só existe depois da
-- gravação inteira. Os demais comandos do mesmo escritor mantêm o teto herdado
-- de 32 KiB, e os comandos delegados ao núcleo de preferências reavaliam esse
-- teto no próprio núcleo.

create function private.course_instructional_command_bytes_limit_v1() returns bigint
language sql immutable set search_path=pg_catalog as $function$
  select 262144::bigint
$function$;

comment on function private.course_instructional_command_bytes_limit_v1() is
  'Orçamento em octetos de um comando instrucional com lote de unidades (256 KiB), referência numérica que a leitura do mesmo desenho já usa. O lote é atômico: exceder o orçamento não grava parte das unidades. Os demais comandos do escritor mantêm o teto herdado de 32 KiB.';

do $instructional_command_budget$
declare
  signature regprocedure := to_regprocedure(
    'public.apply_course_design_command_for_actor_v3(uuid,uuid,bigint,jsonb,text,text,text)'
  );
  definition text;
  patched text;
  occurrences integer;
  old_guard text := $old$   or jsonb_typeof(p_command) is distinct from 'object' or octet_length(p_command::text)>32768$old$;
  new_guard text := $old$   or jsonb_typeof(p_command) is distinct from 'object'$old$;
  old_scope_anchor text := $old$ target:=p_command#>>'{scope,ref}';$old$;
  new_scope_anchor text := $new$ if command_type not in('set_study_unit_applications','apply_study_unit_configuration')
   and octet_length(p_command::text)>32768 then
   raise exception 'Comando instrucional inválido.' using errcode='22023';
 end if;
 target:=p_command#>>'{scope,ref}';$new$;
  old_units_anchor text := $old$   for entry in select value from jsonb_array_elements(p_command->'units') loop$old$;
  new_units_anchor text := $new$   if octet_length(p_command::text)>private.course_instructional_command_bytes_limit_v1() then
     raise exception 'O comando instrucional excede o orçamento de % octetos e nada foi gravado. Divida o lote em pedidos menores, preservando o texto de cada unidade.', private.course_instructional_command_bytes_limit_v1()
       using errcode='PT413';
   end if;
   for entry in select value from jsonb_array_elements(p_command->'units') loop$new$;
begin
  if signature is null then
    raise exception 'Escritor instrucional ausente: o orçamento do comando não tem onde ser aplicado.'
      using errcode = '23514';
  end if;
  definition := replace(pg_get_functiondef(signature), E'\r\n', E'\n');
  if position(old_guard in definition)=0 then
    raise exception 'Guarda de tamanho do escritor instrucional divergiu.'
      using errcode = '23514';
  end if;
  definition := replace(definition, old_guard, new_guard);
  foreach patched in array array[old_scope_anchor, old_units_anchor] loop
    occurrences := (length(definition) - length(replace(definition, patched, ''))) / length(patched);
    if occurrences <> 1 then
      raise exception 'Âncora do escritor instrucional inesperada (ocorrências: %).', occurrences
        using errcode = '23514';
    end if;
  end loop;
  definition := replace(definition, old_scope_anchor, new_scope_anchor);
  patched := replace(definition, old_units_anchor, new_units_anchor);
  if patched = definition
     or patched like '%or octet_length(p_command::text)>32768%'
     or patched not like '%course_instructional_command_bytes_limit_v1()%'
     or patched not like '%errcode=''PT413''%'
     or (length(patched) - length(replace(patched, new_scope_anchor, ''))) <> length(new_scope_anchor)
     or (length(patched) - length(replace(patched, new_units_anchor, ''))) <> length(new_units_anchor) then
    raise exception 'O orçamento do comando instrucional não foi atualizado como esperado.'
      using errcode = '23514';
  end if;
  execute patched;
end $instructional_command_budget$;

revoke all on function private.course_instructional_command_bytes_limit_v1()
  from public, anon, authenticated;

-- Nenhuma capacidade nova é declarada: o manifesto avança a revisão de esquema
-- preservando exatamente a lista corrente, como nas demais migrações do ciclo.
do $manifest$
declare manifest jsonb:=public.get_aralearn_runtime_manifest();
begin
  if manifest->>'schemaRevision' is distinct from '20261017120000' then
    manifest:=manifest||jsonb_build_object('schemaRevision','20261017120000');
    execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
      'select '||quote_literal(manifest::text)||'::jsonb');
  end if;
end $manifest$;

commit;

