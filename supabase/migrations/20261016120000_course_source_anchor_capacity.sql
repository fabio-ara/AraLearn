begin;

-- A capacidade de Âncoras de uma Fonte era oito identidades por revisão na
-- cláusula viva do produtor, sem distinguir de outros dois contratos: o lote de
-- comandos por requisição (8) e a seleção de âncoras de um vínculo (8 por link).
-- Um material extenso precisa de mais localizadores na mesma revisão sem perder
-- vínculos já feitos, então o teto passa a ser um contrato nomeado.
--
-- O teto é proporcional ao que a leitura de Fontes transporta: as âncoras da
-- revisão já viajam embutidas no payload de get_owned_course_sources_for_actor_v1,
-- que é recusado acima de 262144 octetos (256 KiB), e cada âncora carrega seletor,
-- hash, localizador humano de até 500 caracteres e trecho de conferência. A
-- medição do caso extremo permitido pelos demais guardas (8 anexos PDF com
-- metadados e âncoras de trecho máximo) está em
-- verify/source-anchor-capacity-473.json; os tetos abaixo mantêm a leitura dentro
-- do orçamento e deixam as âncoras com margem para revisão.
--
-- A guarda vive no produtor oficial, como as demais verificações desse contrato;
-- não há trigger na tabela, para não prometer proteção que outros caminhos não
-- exercem. Escrita que não cresce (revisão de um localizador já usado, retirada)
-- nunca é recusada pelo orçamento.

create function private.course_source_anchor_count_limit_v1() returns integer
language sql immutable set search_path=pg_catalog as $function$
  select 64
$function$;

create function private.course_source_anchor_bytes_limit_v1() returns bigint
language sql immutable set search_path=pg_catalog as $function$
  select 131072::bigint
$function$;

comment on function private.course_source_anchor_count_limit_v1() is
  'Capacidade de identidades de Âncora por revisão de Fonte (64). O lote de comandos e a seleção de âncoras por vínculo continuam em 8.';
comment on function private.course_source_anchor_bytes_limit_v1() is
  'Orçamento em octetos das âncoras de uma revisão de Fonte (128 KiB). Revisar ou retirar âncora já usada não cresce o conjunto e não é recusado.';

do $anchor_capacity_patch$
declare
  signature regprocedure := to_regprocedure('private.execute_course_source_command_without_interventions_v1(uuid,uuid,bigint,jsonb,text,text)');
  definition text;
  patched text;
  occurrences integer;
  old_block text := E'    ) >= 8 then\n      raise exception ''Uma revisão de Fonte aceita no máximo oito identidades de Âncora.''\n        using errcode = ''23514'';';
  new_block text := E'    ) >= private.course_source_anchor_count_limit_v1() then\n      raise exception ''Esta revisão de Fonte já usa % identidades de Âncora, o máximo aceito. Reaproveite as âncoras existentes: revisar um localizador já usado não consome capacidade e nenhuma âncora precisa ser removida.'',\n        private.course_source_anchor_count_limit_v1()\n        using errcode = ''23514'';\n    end if;\n    if (\n      (select coalesce(sum(octet_length(to_jsonb(existing_anchor)::text)), 0)\n       from private.course_source_anchors existing_anchor\n       where existing_anchor.course_id = p_course_id\n         and existing_anchor.source_id = p_command->>''sourceId''\n         and existing_anchor.source_revision = (p_command->>''sourceRevision'')::bigint\n         and existing_anchor.anchor_id <> p_command->>''anchorId'')\n      + octet_length(to_jsonb(jsonb_build_object(\n          ''course_id'', p_course_id, ''anchor_id'', p_command->>''anchorId'',\n          ''source_id'', p_command->>''sourceId'',\n          ''source_revision'', (p_command->>''sourceRevision'')::bigint,\n          ''selector'', p_command->''selector'', ''content_hash'', p_command->>''contentHash'',\n          ''human_locator'', p_command#>>''{humanLocator}'',\n          ''verification_excerpt'', p_command#>>''{verificationExcerpt}''))::text)\n      > private.course_source_anchor_bytes_limit_v1()\n      and octet_length(to_jsonb(jsonb_build_object(\n          ''course_id'', p_course_id, ''anchor_id'', p_command->>''anchorId'',\n          ''source_id'', p_command->>''sourceId'',\n          ''source_revision'', (p_command->>''sourceRevision'')::bigint,\n          ''selector'', p_command->''selector'', ''content_hash'', p_command->>''contentHash'',\n          ''human_locator'', p_command#>>''{humanLocator}'',\n          ''verification_excerpt'', p_command#>>''{verificationExcerpt}''))::text)\n        > coalesce((select octet_length(to_jsonb(existing_anchor)::text)\n           from private.course_source_anchors existing_anchor\n           where existing_anchor.course_id = p_course_id\n             and existing_anchor.source_id = p_command->>''sourceId''\n             and existing_anchor.source_revision = (p_command->>''sourceRevision'')::bigint\n             and existing_anchor.anchor_id = p_command->>''anchorId''), 0) then\n      raise exception ''As âncoras desta revisão de Fonte somam mais de % KiB, o orçamento aceito. Revise os trechos de conferência redundantes; a localização das âncoras já usadas permanece.'',\n        private.course_source_anchor_bytes_limit_v1() / 1024\n        using errcode = ''23514'';';
begin
  if signature is null then
    raise exception 'Produtor de Fontes ausente: a capacidade de Âncoras não tem onde ser aplicada.' using errcode = '23514';
  end if;
  definition := pg_get_functiondef(signature);
  if definition like '%course_source_anchor_count_limit_v1%' then return; end if;
  occurrences := (length(definition) - length(replace(definition, old_block, ''))) / length(old_block);
  if occurrences <> 1 or definition not like '%oito identidades de Âncora%' then
    raise exception 'Bloco de capacidade de Âncoras inesperado (ocorrências: %).', occurrences using errcode = '23514';
  end if;
  patched := replace(definition, old_block, new_block);
  if patched = definition
     or patched not like '%course_source_anchor_count_limit_v1%'
     or patched not like '%course_source_anchor_bytes_limit_v1%'
     or patched like '%oito identidades de Âncora%' then
    raise exception 'A capacidade de Âncoras não foi atualizada como esperado.' using errcode = '23514';
  end if;
  execute patched;
end $anchor_capacity_patch$;

revoke all on function private.course_source_anchor_count_limit_v1(),
  private.course_source_anchor_bytes_limit_v1() from public, anon, authenticated;

commit;

