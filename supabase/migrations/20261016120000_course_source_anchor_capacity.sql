begin;

-- A capacidade de Âncoras de uma Fonte era oito identidades por revisão, sem
-- distinguir de outros dois contratos: o lote de comandos por requisição (8) e a
-- seleção de âncoras de um vínculo (8 por link). Um material extenso precisa de
-- mais localizadores na mesma revisão sem perder os vínculos já feitos.
--
-- O teto agora e explicito e proporcional ao orcamento de leitura: a leitura de
-- Fontes e recusada acima de 262144 octetos (256 KiB) em
-- get_owned_course_sources_for_actor_v1, e a leitura embute as ancoras da fonte.
-- As ancoras de uma revisao ficam limitadas a 128 KiB (metade do orcamento, para
-- sobrar espaco a metadados, vinculos e ocorrencias) e a 64 identidades, que com
-- o localizador humano de ate 500 caracteres mantem cada ancora na casa de KiB.
-- O lote de comandos e a selecao por vinculo continuam iguais.

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
  'Orçamento em octetos das âncoras de uma revisão de Fonte (128 KiB), metade do limite de 256 KiB da leitura de Fontes.';

-- A guarda fica no ponto de escrita da tabela, então vale para o produtor atual
-- e para qualquer consumidor futuro, sem repetir a checagem em cada função.
create function private.assert_course_source_anchor_capacity_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog as $function$
declare
  v_identities integer;
  v_bytes bigint;
  v_new_bytes bigint;
begin
  select count(distinct anchor.anchor_id) into v_identities
  from private.course_source_anchors anchor
  where anchor.course_id = new.course_id
    and anchor.source_id = new.source_id
    and anchor.source_revision = new.source_revision;
  if not exists (
    select 1 from private.course_source_anchors anchor
    where anchor.course_id = new.course_id
      and anchor.anchor_id = new.anchor_id
  ) and v_identities >= private.course_source_anchor_count_limit_v1() then
    raise exception 'Uma revisão de Fonte aceita no máximo % identidades de Âncora.',
      private.course_source_anchor_count_limit_v1() using errcode = '23514';
  end if;
  select coalesce(sum(octet_length(to_jsonb(anchor)::text)), 0) into v_bytes
  from private.course_source_anchors anchor
  where anchor.course_id = new.course_id
    and anchor.source_id = new.source_id
    and anchor.source_revision = new.source_revision
    and anchor.anchor_id <> new.anchor_id;
  v_new_bytes := octet_length(to_jsonb(new)::text);
  if v_bytes + v_new_bytes > private.course_source_anchor_bytes_limit_v1() then
    raise exception 'As âncoras desta revisão de Fonte excedem o orçamento de % KiB.',
      private.course_source_anchor_bytes_limit_v1() / 1024 using errcode = '23514';
  end if;
  return new;
end $function$;

create trigger assert_course_source_anchor_capacity_v1
before insert or update on private.course_source_anchors
for each row execute function private.assert_course_source_anchor_capacity_v1();

-- O produtor ja validava a capacidade com oito fixo antes de inserir. O numero
-- passa a vir do contrato acima, sem duplicar o corpo da funcao: a definicao
-- viva e ajustada no lugar e o texto da excecao passa a citar o limite corrente.
do $anchor_capacity_patch$
declare
  signature regprocedure;
  definition text;
  patched text;
begin
  for signature in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'execute_course_source_command_without_interventions_v1'
  loop
    definition := pg_get_functiondef(signature);
    if definition like '%course_source_anchor_count_limit_v1%' then continue; end if;
    if definition not like '%) >= 8 then%' or definition not like '%oito identidades de Âncora%' then
      raise exception 'Capacidade de Âncoras esperada ausente em %.', signature;
    end if;
    patched := replace(definition, ') >= 8 then',
      ') >= private.course_source_anchor_count_limit_v1() then');
    patched := replace(patched, 'oito identidades de Âncora',
      private.course_source_anchor_count_limit_v1()::text || ' identidades de Âncora');
    execute patched;
  end loop;
end $anchor_capacity_patch$;

revoke all on function private.course_source_anchor_count_limit_v1(),
  private.course_source_anchor_bytes_limit_v1(),
  private.assert_course_source_anchor_capacity_v1() from public, anon, authenticated;

commit;

