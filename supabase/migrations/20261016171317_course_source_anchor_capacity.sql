begin;

-- A capacidade de Âncoras de uma Fonte era oito identidades por revisão, um
-- limite herdado da primeira versão do painel Fontes. Dois outros contratos
-- usam oito como fronteira e continuam intactos: o lote de comandos por
-- requisição e a seleção de âncoras de um vínculo (oito por link). Um material
-- extenso precisa de mais localizadores na mesma revisão sem perder vínculos já
-- feitos, sem duplicar a Fonte ou o PDF e sem reciclar a revisão.
--
-- O teto passa a ser um contrato nomeado, proporcional ao que a leitura de
-- Fontes transporta. get_owned_course_sources_for_actor_v1 devolve as âncoras
-- embutidas no payload e é recusado acima de 262144 octetos (256 KiB); cada
-- âncora carrega seletor, hash, localizador humano de até 500 caracteres e
-- trecho de conferência de até 2000 caracteres, o que mantém a identidade na
-- casa de KiB. As duas capacidades abaixo (64 identidades e 128 KiB de âncoras
-- por revisão) mantêm essa leitura dentro do orçamento com folga para
-- metadados, vínculos e anexos.
--
-- A guarda vive no produtor oficial, como as demais verificações desse
-- contrato, e vale também para o pacote:
-- execute_course_source_bundle_for_actor_v1 chama o mesmo produtor. Não há
-- trigger na tabela. Escrita que não cresce o acervo (revisão de um localizador
-- já usado, revisão que reduz, retirada) nunca é recusada pelo orçamento;
-- nenhuma âncora usada precisa ser removida.

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
  'Orçamento em octetos das âncoras de uma revisão de Fonte (128 KiB). Revisar ou retirar uma âncora já usada não cresce o acervo e não é recusado.';

-- Uma única projeção mede a âncora gravada e a que já existia: comparar
-- serializações diferentes recusaria manutenção legítima de um acervo herdado.
create function private.course_source_anchor_bytes_v1(
  p_course_id uuid,
  p_anchor_id text,
  p_source_id text,
  p_source_revision bigint,
  p_selector jsonb,
  p_content_hash text,
  p_human_locator text,
  p_verification_excerpt text
) returns bigint
language sql immutable set search_path=pg_catalog as $function$
  select octet_length(to_jsonb(jsonb_build_object(
    'course_id', p_course_id,
    'anchor_id', p_anchor_id,
    'source_id', p_source_id,
    'source_revision', p_source_revision,
    'selector', p_selector,
    'content_hash', p_content_hash,
    'human_locator', p_human_locator,
    'verification_excerpt', p_verification_excerpt
  ))::text)
$function$;

comment on function private.course_source_anchor_bytes_v1(uuid,text,text,bigint,jsonb,text,text,text) is
  'Octetos de uma âncora no acervo da revisão, na projeção usada para comparar a âncora nova com a que já existia.';

do $anchor_capacity_patch$
declare
  signature regprocedure := to_regprocedure(
    'private.execute_course_source_command_without_interventions_v1(uuid,uuid,bigint,jsonb,text,text)'
  );
  definition text;
  patched text;
  occurrences integer;
  old_block text := E'    ) >= 8 then\n      raise exception ''Uma revisão de Fonte aceita no máximo oito identidades de Âncora.''\n        using errcode = ''23514'';\n    end if;';
  new_block text := E'    ) >= private.course_source_anchor_count_limit_v1() then\n      raise exception ''Esta revisão de Fonte já usa % identidades de Âncora, o máximo aceito. Reaproveite as âncoras existentes: revisar um localizador já usado não consome capacidade e nenhuma âncora precisa ser removida.'',\n        private.course_source_anchor_count_limit_v1()\n        using errcode = ''23514'';\n    end if;\n    if (\n      (select coalesce(sum(private.course_source_anchor_bytes_v1(\n          existing_anchor.course_id, existing_anchor.anchor_id, existing_anchor.source_id,\n          existing_anchor.source_revision, existing_anchor.selector, existing_anchor.content_hash,\n          existing_anchor.human_locator, existing_anchor.verification_excerpt)), 0)\n         from private.course_source_anchors existing_anchor\n        where existing_anchor.course_id = p_course_id\n          and existing_anchor.source_id = p_command->>''sourceId''\n          and existing_anchor.source_revision = (p_command->>''sourceRevision'')::bigint\n          and existing_anchor.anchor_id <> p_command->>''anchorId'')\n      + private.course_source_anchor_bytes_v1(\n          p_course_id, p_command->>''anchorId'', p_command->>''sourceId'',\n          (p_command->>''sourceRevision'')::bigint, p_command->''selector'',\n          p_command->>''contentHash'', p_command#>>''{humanLocator}'',\n          p_command#>>''{verificationExcerpt}'')\n      > private.course_source_anchor_bytes_limit_v1()\n      and private.course_source_anchor_bytes_v1(\n          p_course_id, p_command->>''anchorId'', p_command->>''sourceId'',\n          (p_command->>''sourceRevision'')::bigint, p_command->''selector'',\n          p_command->>''contentHash'', p_command#>>''{humanLocator}'',\n          p_command#>>''{verificationExcerpt}'')\n        > coalesce((select private.course_source_anchor_bytes_v1(\n            existing_anchor.course_id, existing_anchor.anchor_id, existing_anchor.source_id,\n            existing_anchor.source_revision, existing_anchor.selector, existing_anchor.content_hash,\n            existing_anchor.human_locator, existing_anchor.verification_excerpt)\n           from private.course_source_anchors existing_anchor\n          where existing_anchor.course_id = p_course_id\n            and existing_anchor.source_id = p_command->>''sourceId''\n            and existing_anchor.source_revision = (p_command->>''sourceRevision'')::bigint\n            and existing_anchor.anchor_id = p_command->>''anchorId''), 0)\n    ) then\n      raise exception ''As âncoras desta revisão de Fonte somam mais de % KiB, o orçamento aceito. Revise os trechos de conferência redundantes; a localização das âncoras já usadas permanece.'',\n        private.course_source_anchor_bytes_limit_v1() / 1024\n        using errcode = ''23514'';\n    end if;';
begin
  if signature is null then
    raise exception 'Produtor de Fontes ausente: a capacidade de Âncoras não tem onde ser aplicada.'
      using errcode = '23514';
  end if;
  definition := replace(pg_get_functiondef(signature), E'\r\n', E'\n');
  if definition like '%course_source_anchor_count_limit_v1%' then
    return;
  end if;
  occurrences := (length(definition) - length(replace(definition, old_block, '')))
    / length(old_block);
  if occurrences <> 1 then
    raise exception 'Bloco de capacidade de Âncoras inesperado (ocorrências: %).', occurrences
      using errcode = '23514';
  end if;
  patched := replace(definition, old_block, new_block);
  if patched = definition
     or patched not like '%course_source_anchor_count_limit_v1%'
     or patched not like '%course_source_anchor_bytes_limit_v1%'
     or patched like '%oito identidades de Âncora%'
     or (length(patched) - length(replace(patched, new_block, ''))) <> length(new_block) then
    raise exception 'A capacidade de Âncoras não foi atualizada como esperado.'
      using errcode = '23514';
  end if;
  execute patched;
end $anchor_capacity_patch$;

revoke all on function private.course_source_anchor_count_limit_v1(),
  private.course_source_anchor_bytes_limit_v1(),
  private.course_source_anchor_bytes_v1(uuid,text,text,bigint,jsonb,text,text,text)
  from public, anon, authenticated;

commit;
