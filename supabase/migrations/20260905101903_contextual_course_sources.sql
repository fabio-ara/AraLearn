-- Fontes canônicas, papéis por vínculo e ocorrências sem número persistido.
begin;
do $preflight$ begin
 if public.get_aralearn_runtime_manifest()->>'schemaRevision'<>'20260905095110' then
  raise exception 'Revisão anterior de fontes inesperada.' using errcode='55000'; end if;
 if exists(select 1 from private.course_source_pdf_upload_intents i left join private.course_sources s
   on s.course_id=i.course_id and s.source_id=i.source_id
   where i.expires_at>statement_timestamp() and (s.source_id is null or i.source_revision>s.revision)) then
  raise exception 'Conclua ou cancele a ingestão de fonte em andamento antes do corte bibliográfico.' using errcode='55000'; end if;
end $preflight$;
lock table private.course_sources, private.course_source_anchors, private.course_source_attributions,
 private.course_source_attribution_sources, private.course_source_attribution_anchors in share row exclusive mode;
create temporary table sources_before_302 on commit drop as
 select course_id,source_id,to_jsonb(s) as original from private.course_sources s;
create temporary table links_before_302 on commit drop as
 select course_id,attribution_id,source_ordinal,source_id,relation from private.course_source_attribution_sources;
create temporary table anchors_before_302 on commit drop as
 select course_id,anchor_id,to_jsonb(a) as original from private.course_source_anchors a;
create temporary table attachments_before_302 on commit drop as
 select course_id,source_id,content_hash,to_jsonb(a) as original from private.course_source_attachments a;
alter table public.courses add column bibliography_style text not null default 'abnt-2025'
 check(bibliography_style in('apa7','abnt-2025'));
alter table private.course_sources
 add column authors jsonb not null default '[]',
 add column default_roles jsonb not null default '[]',
 add column citation_mode text not null default 'manual',
 add column bibliographic jsonb not null default '{"editors":[],"containerTitle":null,"publisher":null,"publisherPlace":null,"volume":null,"issue":null,"pages":null,"articleNumber":null,"doi":null,"isbn":null,"issn":null,"accessedDate":null,"genre":null,"number":null}'::jsonb;
update private.course_sources set authors=case when authorship is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('literal',authorship)) end,
 default_roles=case when source_role is null then '[]'::jsonb else jsonb_build_array(source_role) end;
alter table private.course_source_attribution_sources
 add column link_id text,
 add column roles jsonb not null default '[]',
 add column occurrences jsonb not null default '[]';
update private.course_source_attribution_sources l set link_id=extensions.gen_random_uuid()::text,roles=s.default_roles
 from private.course_sources s where s.course_id=l.course_id and s.source_id=l.source_id;
alter table private.course_source_attribution_sources alter column link_id set not null;
alter table private.course_source_attribution_sources add constraint course_source_link_identity_v1 unique(course_id,attribution_id,link_id);
alter table private.course_source_anchors add column content_hash text check(content_hash is null or content_hash~'^[a-f0-9]{64}$');
-- Identidade de arquivo não é deduzida: a migração conserva seletores e permite decisão posterior.
alter table private.course_sources drop constraint course_sources_metadata_v2, drop constraint course_sources_status_v2,
 drop constraint course_sources_role_v1, alter column title drop not null;

create function private.valid_course_source_document_v3(v jsonb) returns boolean language plpgsql immutable
 set search_path=pg_catalog,private as $fn$
declare k text; n jsonb; names jsonb; val jsonb; maximum integer;
begin
 if jsonb_typeof(v) is distinct from 'object' or v-array['kind','defaultRoles','title','authors','publicationDate','identifier','language','citationMode','citationText','bibliographic','url','editionOrVersion','origin','availability','verificationStatus','studyVisibility']<>'{}'::jsonb or not(v ?& array['kind','defaultRoles','title','authors','publicationDate','identifier','language','citationMode','citationText','bibliographic','url','editionOrVersion','origin','availability','verificationStatus','studyVisibility'])
  or octet_length(v::text)>16384 then return false; end if;
 if v->>'kind'<>all(array['web_page','article','book','chapter','slides','notice','standard','internal_document','document','media','other']) or jsonb_typeof(v->'kind') is distinct from 'string'
  or v->>'citationMode' not in('manual','generated') or jsonb_typeof(v->'citationMode') is distinct from 'string'
  or v->>'origin' not in('external','author_provided','imported') or jsonb_typeof(v->'origin') is distinct from 'string'
  or v->>'availability' not in('open_access','restricted','private','unknown') or jsonb_typeof(v->'availability') is distinct from 'string'
  or v->>'verificationStatus' not in('unverified','author_verified') or jsonb_typeof(v->'verificationStatus') is distinct from 'string'
  or v->>'studyVisibility' not in('hidden','citation','citation_and_link') or jsonb_typeof(v->'studyVisibility') is distinct from 'string'
 then return false; end if;
 if jsonb_typeof(v->'defaultRoles') is distinct from 'array' or jsonb_array_length(v->'defaultRoles')>4
  or exists(select 1 from jsonb_array_elements(v->'defaultRoles') r where jsonb_typeof(r) is distinct from 'string' or r#>>'{}'<>all(array['curricular_scope','assessment_evidence','technical_conceptual','recommended_reading']))
  or (select count(*)<>count(distinct r) from jsonb_array_elements(v->'defaultRoles') r) then return false; end if;
 if jsonb_typeof(v->'bibliographic') is distinct from 'object' or (v->'bibliographic')-array['editors','containerTitle','publisher','publisherPlace','volume','issue','pages','articleNumber','doi','isbn','issn','accessedDate','genre','number']<>'{}'::jsonb
  or not(v->'bibliographic' ?& array['editors','containerTitle','publisher','publisherPlace','volume','issue','pages','articleNumber','doi','isbn','issn','accessedDate','genre','number']) then return false; end if;
 foreach names in array array[v->'authors',v#>'{bibliographic,editors}'] loop
  if jsonb_typeof(names) is distinct from 'array' or jsonb_array_length(names)>32 then return false; end if;
  for n in select value from jsonb_array_elements(names) loop
   if jsonb_typeof(n) is distinct from 'object' then return false; end if;
   if n ? 'literal' then
    if n-'literal'<>'{}'::jsonb or jsonb_typeof(n->'literal') is distinct from 'string' then return false; end if;
   elsif n-array['family','given']<>'{}'::jsonb or not(n ?& array['family','given'])
    or jsonb_typeof(n->'family') is distinct from 'string' or jsonb_typeof(n->'given') not in('string','null') then return false; end if;
   for k,val in select key,value from jsonb_each(n) loop
    if val<>'null'::jsonb and (char_length(val#>>'{}') not between 1 and case when k='literal' then 500 else 240 end
     or val#>>'{}'<>btrim(val#>>'{}') or val#>>'{}'~'[[:cntrl:]]') then return false; end if;
   end loop;
  end loop;
 end loop;
 foreach k in array array['title','publicationDate','identifier','language','citationText','url','editionOrVersion'] loop
  val:=v->k;
  if jsonb_typeof(val) not in('string','null') then return false; end if;
  if val='null'::jsonb then continue; end if;
  maximum:=case k when 'title' then 300 when 'identifier' then 240 when 'language' then 35 when 'editionOrVersion' then 120 when 'publicationDate' then 10 else 2048 end;
  if char_length(val#>>'{}') not between 1 and maximum or nullif(btrim(val#>>'{}'),'') is null
   or (k<>'citationText' and (val#>>'{}'<>btrim(val#>>'{}') or val#>>'{}'~'[[:cntrl:]]'))
   or (k='citationText' and translate(val#>>'{}',E'\n\r\t','')~'[[:cntrl:]]') then return false; end if;
 end loop;
 if not private.valid_course_source_publication_date_v1(v->>'publicationDate')
  or v->>'url' is not null and v->>'url'!~'^https://[^[:space:]]+$'
  or v->>'language' is not null and v->>'language'!~'^[A-Za-z]{2,3}(-[A-Za-z]{4})?(-([A-Za-z]{2}|[0-9]{3}))?(-([A-Za-z0-9]{5,8}|[0-9][A-Za-z0-9]{3}))*$'
  or v->>'citationMode'='manual' and v->>'studyVisibility'<>'hidden' and v->>'citationText' is null then return false; end if;
 foreach k in array array['containerTitle','publisher','publisherPlace','volume','issue','pages','articleNumber','doi','isbn','issn','accessedDate','genre','number'] loop
  val:=v->'bibliographic'->k;
  if jsonb_typeof(val) not in('string','null') then return false; end if;
  if val='null'::jsonb then continue; end if;
  maximum:=case when k in('containerTitle','publisher') then 500 else 240 end;
  if char_length(val#>>'{}') not between 1 and maximum or val#>>'{}'<>btrim(val#>>'{}') or val#>>'{}'~'[[:cntrl:]]' then return false; end if;
 end loop;
 return private.valid_course_source_publication_date_v1(v#>>'{bibliographic,accessedDate}');
exception when others then return false;
end $fn$;
revoke all on function private.valid_course_source_document_v3(jsonb) from public,anon,authenticated,service_role;

create or replace function private.valid_course_source_links_shape_v2(p_links jsonb) returns boolean
 language plpgsql immutable set search_path=pg_catalog as $fn$
declare l jsonb; a jsonb; o jsonb; k text; val text;
begin
 if jsonb_typeof(p_links) is distinct from 'array' or jsonb_array_length(p_links)>32 or octet_length(p_links::text)>131072 then return false; end if;
 if (select count(*)<>count(distinct value->>'linkId') from jsonb_array_elements(p_links)) then return false; end if;
 for l in select value from jsonb_array_elements(p_links) loop
  if jsonb_typeof(l) is distinct from 'object' or l-array['linkId','sourceId','relation','roles','anchors','occurrences']<>'{}'::jsonb
   or not(l ?& array['linkId','sourceId','relation','roles','anchors','occurrences']) then return false; end if;
  foreach k in array array['linkId','sourceId'] loop
   val:=l->>k;
   if jsonb_typeof(l->k) is distinct from 'string' or char_length(val) not between 1 and 240 or val<>btrim(val) or val~'[[:cntrl:]]' then return false; end if;
  end loop;
  if jsonb_typeof(l->'relation') is distinct from 'string' or l->>'relation' not in('informed_by','supported_by','adapted_from','quoted_from','contrasted_with','exemplified_by','inspired_by','needs_verification')
   or jsonb_typeof(l->'roles') is distinct from 'array' or jsonb_array_length(l->'roles')>4
   or exists(select 1 from jsonb_array_elements(l->'roles') r where jsonb_typeof(r) is distinct from 'string' or r#>>'{}'<>all(array['curricular_scope','assessment_evidence','technical_conceptual','recommended_reading']))
   or (select count(*)<>count(distinct value) from jsonb_array_elements(l->'roles')) then return false; end if;
  if jsonb_typeof(l->'anchors') is distinct from 'array' or jsonb_array_length(l->'anchors')>8
   or l->>'relation'='quoted_from' and jsonb_array_length(l->'anchors')=0
   or (select count(*)<>count(distinct value->>'anchorId') from jsonb_array_elements(l->'anchors')) then return false; end if;
  for a in select value from jsonb_array_elements(l->'anchors') loop
   if jsonb_typeof(a) is distinct from 'object' or a-'anchorId'<>'{}'::jsonb or jsonb_typeof(a->'anchorId') is distinct from 'string'
    or char_length(a->>'anchorId') not between 1 and 240 or a->>'anchorId'<>btrim(a->>'anchorId') or a->>'anchorId'~'[[:cntrl:]]' then return false; end if;
  end loop;
  if jsonb_typeof(l->'occurrences') is distinct from 'array' or jsonb_array_length(l->'occurrences')>16
   or (select count(*)<>count(distinct value->>'occurrenceId') from jsonb_array_elements(l->'occurrences')) then return false; end if;
  for o in select value from jsonb_array_elements(l->'occurrences') loop
   if jsonb_typeof(o) is distinct from 'object' or o-array['occurrenceId','slot','resourceId','path','quote','prefix','suffix']<>'{}'::jsonb
    or not(o ?& array['occurrenceId','slot','resourceId','path','quote','prefix','suffix'])
    or jsonb_typeof(o->'slot') is distinct from 'string' or o->>'slot' not in('content','response','feedback') then return false; end if;
   foreach k in array array['occurrenceId','resourceId','path','quote','prefix','suffix'] loop
    if k in('prefix','suffix') and o->k='null'::jsonb then continue; end if;
    val:=o->>k;
    if jsonb_typeof(o->k) is distinct from 'string'
     or char_length(val) not between 1 and (case when k='quote' then 4000 when k in('prefix','suffix') then 500 else 240 end)
     or translate(val,E'\n\r\t','')~'[[:cntrl:]]'
     or k in('occurrenceId','resourceId','path') and (val<>btrim(val) or val~'[[:cntrl:]]') then return false; end if;
   end loop;
   if o->>'path'!~'^[A-Za-z_$][A-Za-z0-9_$]*(\[[0-9]+\]|[.][A-Za-z_$][A-Za-z0-9_$]*)*$'
    or o->>'path'~'(^|[.])(__proto__|constructor|prototype)($|[.\[])' then return false; end if;
  end loop;
 end loop;
 return true;
exception when others then return false;
end $fn$;
revoke all on function private.valid_course_source_links_shape_v2(jsonb) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.course_source_links_v1(p_course_id uuid, p_attribution_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'linkId',source_link.link_id,'roles',source_link.roles,'occurrences',source_link.occurrences,
    'sourceId',source_link.source_id,
    'relation',source_link.relation,
    'anchors',coalesce((
      select jsonb_agg(jsonb_build_object(
        'anchorId',anchor_link.anchor_id
      ) order by anchor_link.anchor_ordinal)
      from private.course_source_attribution_anchors anchor_link
      where anchor_link.course_id=source_link.course_id
        and anchor_link.attribution_id=source_link.attribution_id
        and anchor_link.source_ordinal=source_link.source_ordinal
    ),'[]'::jsonb)
  ) order by source_link.source_ordinal),'[]'::jsonb)
  from private.course_source_attribution_sources source_link
  where source_link.course_id=p_course_id
    and source_link.attribution_id=p_attribution_id
$function$
;

CREATE OR REPLACE FUNCTION private.apply_course_source_attribution_v2(p_course_id uuid, p_target_kind text, p_target_id text, p_expected_target_version bigint, p_links jsonb, p_explicit_target_hash text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private', 'extensions'
AS $function$
declare
  v_state jsonb;
  v_previous private.course_source_attributions%rowtype;
  v_attribution private.course_source_attributions%rowtype;
  v_link record;
  v_anchor record;
begin
  if p_course_id is null
     or p_target_kind not in ('plan_item','study_unit')
     or p_target_id is null or char_length(p_target_id) not between 1 and 240
     or p_target_id<>btrim(p_target_id) or p_target_id~'[[:cntrl:]]'
     or p_expected_target_version is null or p_expected_target_version < 1
     or p_explicit_target_hash is not null
       and p_explicit_target_hash !~ '^[a-f0-9]{64}$'
     or not private.valid_course_source_links_shape_v2(p_links) then
    raise exception 'Aplicação de proveniência inválida.'
      using errcode = '22023';
  end if;
  v_state := private.course_source_target_state_v1(
    p_course_id,p_target_kind,p_target_id
  );
  if v_state is null then
    raise exception 'Alvo de proveniência inexistente.' using errcode = 'PT404';
  end if;
  if (v_state->>'version')::bigint <> p_expected_target_version then
    raise exception 'O alvo de proveniência mudou; releia antes de salvar.'
      using errcode = '40001';
  end if;
  if p_explicit_target_hash is not null
     and v_state->>'hash' <> p_explicit_target_hash then
    raise exception 'O alvo de proveniência divergiu do estado materializado.'
      using errcode = '40001';
  end if;
  select * into v_previous
  from private.course_source_attributions attribution
  where attribution.course_id = p_course_id
    and attribution.target_kind = p_target_kind
    and attribution.target_id = p_target_id;
  if p_explicit_target_hash is not null and v_previous.id is not null then
    -- Composition preserves omitted links; deliberate unlinking uses set_target_sources.
    p_links:=p_links||coalesce((select jsonb_agg(prior.value order by prior.ordinal)
      from jsonb_array_elements(private.course_source_links_v1(p_course_id,v_previous.id)) with ordinality prior(value,ordinal)
      where not exists(select 1 from jsonb_array_elements(p_links) incoming where incoming->>'linkId'=prior.value->>'linkId')),'[]'::jsonb);
    if not private.valid_course_source_links_shape_v2(p_links) then
      raise exception 'Os vínculos preservados excedem o limite do alvo.' using errcode='23514'; end if;
  end if;
  if v_previous.id is not null and private.course_source_links_v1(
    p_course_id,v_previous.id
  ) = p_links
     and v_previous.target_version=p_expected_target_version
     and v_previous.target_hash=v_state->>'hash' then
    return jsonb_build_object(
      'changed',false,'targetVersion',p_expected_target_version
    );
  end if;
  if jsonb_array_length(p_links) > 0 then
    for v_link in
      select link.value,link.ordinal::integer - 1 as ordinal
      from jsonb_array_elements(p_links) with ordinality link(value,ordinal)
    loop
      if not exists(
        select 1 from private.course_sources source
        where source.course_id=p_course_id
          and source.source_id=v_link.value->>'sourceId'
          and (source.status='active' or exists(select 1 from private.course_source_attribution_sources prior
            where prior.course_id=p_course_id and prior.attribution_id=v_previous.id
             and prior.link_id=v_link.value->>'linkId' and prior.source_id=source.source_id))
      ) then
        raise exception 'Vínculo exige Fonte corrente e ativa.'
          using errcode = '23514';
      end if;
      for v_anchor in
        select anchor.value
        from jsonb_array_elements(v_link.value->'anchors') anchor(value)
      loop
        if not exists(
          select 1 from private.course_source_anchors anchor_value
          where anchor_value.course_id=p_course_id
            and anchor_value.anchor_id=v_anchor.value->>'anchorId'
            and anchor_value.source_id=v_link.value->>'sourceId'
            and (anchor_value.status='active' or exists(select 1 from private.course_source_attribution_anchors prior
              where prior.course_id=p_course_id and prior.attribution_id=v_previous.id and prior.anchor_id=anchor_value.anchor_id))
        ) then
          raise exception 'Âncora precisa ser corrente, ativa e presa à Fonte.'
            using errcode = '23514';
        end if;
      end loop;
    end loop;
  end if;

  if v_previous.id is null then
    insert into private.course_source_attributions(
      course_id,id,target_kind,target_id,target_version,target_hash
    ) values(
      p_course_id,extensions.gen_random_uuid(),p_target_kind,p_target_id,
      p_expected_target_version,v_state->>'hash'
    ) returning * into v_attribution;
  else
    delete from private.course_source_attribution_sources source_link
    where source_link.course_id = p_course_id
      and source_link.attribution_id = v_previous.id;
    update private.course_source_attributions attribution
    set target_version=p_expected_target_version,target_hash=v_state->>'hash',
      created_at=now()
    where attribution.course_id=p_course_id and attribution.id=v_previous.id
    returning * into v_attribution;
  end if;

  insert into private.course_source_attribution_sources(
    course_id,attribution_id,source_ordinal,source_id,relation,link_id,roles,occurrences
  )
  select p_course_id,v_attribution.id,link.ordinal::integer - 1,
    link.value->>'sourceId',link.value->>'relation',link.value->>'linkId',link.value->'roles',link.value->'occurrences'
  from jsonb_array_elements(p_links) with ordinality link(value,ordinal);

  insert into private.course_source_attribution_anchors(
    course_id,attribution_id,source_ordinal,anchor_ordinal,
    source_id,anchor_id
  )
  select p_course_id,v_attribution.id,link.ordinal::integer - 1,
    anchor.ordinal::integer - 1,link.value->>'sourceId',
    anchor.value->>'anchorId'
  from jsonb_array_elements(p_links) with ordinality link(value,ordinal)
  cross join lateral jsonb_array_elements(link.value->'anchors')
    with ordinality anchor(value,ordinal);

  return jsonb_build_object(
    'changed',true,'targetVersion',p_expected_target_version
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION private.execute_course_source_command_core_v1(p_actor_id uuid, p_course_id uuid, p_expected_revision bigint, p_command jsonb, p_channel text, p_request_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'auth', 'extensions'
AS $function$
declare
  v_hash text;
  v_receipt private.course_change_receipts%rowtype;
  v_course public.courses%rowtype;
  v_type text;
  v_source private.course_sources%rowtype;
  v_anchor record;
  v_changed boolean := false;
  v_subject_id text;
  v_subject_revision bigint;
  v_assignment jsonb;
  v_result jsonb;
  v_study_unit record;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_revision is null or p_expected_revision < 1
     or p_channel not in ('application','mcp')
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or jsonb_typeof(p_command) is distinct from 'object'
     or octet_length(p_command::text) > 196608 then
    raise exception 'Comando de Fonte inválido.' using errcode = '22023';
  end if;
  v_type := p_command->>'type';
  if v_type not in (
    'save_source','retire_source','save_anchor','retire_anchor',
    'set_target_sources','set_bibliography_style'
  ) then
    raise exception 'Tipo do comando de Fonte inválido.' using errcode = '22023';
  end if;
  v_hash := private.course_source_json_hash_v1(jsonb_build_object(
    'courseId',p_course_id,'expectedRevision',p_expected_revision,
    'channel',p_channel,'command',p_command
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:' || p_actor_id::text || ':' || p_request_id,0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  select * into v_receipt from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'execute_course_source_command'
       or v_receipt.course_id <> p_course_id
       or v_receipt.request_hash <> v_hash then
      raise exception 'requestId reutilizado com comando de Fonte incompatível.'
        using errcode = '23514';
    end if;
    return (v_receipt.result - 'idempotent')
      || jsonb_build_object('idempotent',true);
  end if;
  perform 1 from auth.users actor where actor.id=p_actor_id for key share;
  if not found then
    raise exception 'Pessoa inexistente ou inacessível.' using errcode='PT404';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'course-row:' || p_course_id::text,0
  ));
  select * into strict v_course from public.courses course
  where course.id = p_course_id for update;
  if v_course.revision <> p_expected_revision then
    raise exception 'O Curso mudou; releia antes de salvar a Fonte.'
      using errcode = '40001';
  end if;

  if v_type = 'set_bibliography_style' then
    if p_command-array['type','style']<>'{}'::jsonb or not(p_command ?& array['type','style'])
      or jsonb_typeof(p_command->'style') is distinct from 'string' or p_command->>'style' not in('apa7','abnt-2025') then
      raise exception 'Estilo bibliográfico inválido.' using errcode='22023'; end if;
    v_changed:=v_course.bibliography_style is distinct from p_command->>'style';
    v_subject_id:=p_course_id::text;
    v_subject_revision:=v_course.revision+case when v_changed then 1 else 0 end;
  elsif v_type = 'save_source' then
    if p_command - 'type' - 'sourceId' - 'expectedSourceRevision' - 'source'
         <> '{}'::jsonb
       or not (p_command ?& array[
         'type','sourceId','expectedSourceRevision','source'
       ])
       or jsonb_typeof(p_command->'sourceId') <> 'string'
       or char_length(p_command->>'sourceId') not between 1 and 240
       or p_command->>'sourceId' <> btrim(p_command->>'sourceId')
       or p_command->>'sourceId' ~ '[[:cntrl:]]'
       or jsonb_typeof(p_command->'expectedSourceRevision') <> 'number'
       or p_command->>'expectedSourceRevision' !~ '^[0-9]+$'
       or jsonb_typeof(p_command->'source') <> 'object'
       or not private.valid_course_source_document_v3(p_command->'source') then
      raise exception 'save_source possui shape inválido.' using errcode = '22023';
    end if;
    select * into v_source from private.course_sources source
    where source.course_id = p_course_id
      and source.source_id = p_command->>'sourceId'
    ;
    if coalesce(v_source.revision,0)
         <> (p_command->>'expectedSourceRevision')::bigint then
      raise exception 'A Fonte mudou; releia antes de salvar.'
        using errcode = '40001';
    end if;
    if found and v_source.status = 'active' and row(
      v_source.kind,v_source.default_roles,v_source.title,v_source.authors,v_source.publication_date,
      v_source.identifier,v_source.language,v_source.citation_mode,v_source.bibliographic,v_source.citation_text,v_source.url,
      v_source.edition_or_version,v_source.origin,v_source.availability,
      v_source.verification_status,v_source.study_visibility
    ) is not distinct from row(
      p_command#>>'{source,kind}',p_command#>'{source,defaultRoles}',p_command#>>'{source,title}',
      p_command#>'{source,authors}',p_command#>>'{source,publicationDate}',
      p_command#>>'{source,identifier}',p_command#>>'{source,language}',
      p_command#>>'{source,citationMode}',p_command#>'{source,bibliographic}',p_command#>>'{source,citationText}',p_command#>>'{source,url}',
      p_command#>>'{source,editionOrVersion}',
      p_command#>>'{source,origin}',p_command#>>'{source,availability}',
      p_command#>>'{source,verificationStatus}',
      p_command#>>'{source,studyVisibility}'
    ) then
      v_subject_revision := v_source.revision;
    else
      insert into private.course_sources(
        course_id,source_id,revision,status,kind,default_roles,title,authors,
        publication_date,identifier,language,citation_mode,bibliographic,citation_text,url,
        edition_or_version,origin,availability,verification_status,
        study_visibility
      ) values(
        p_course_id,p_command->>'sourceId',coalesce(v_source.revision,0)+1,
        'active',p_command#>>'{source,kind}',p_command#>'{source,defaultRoles}',p_command#>>'{source,title}',
        p_command#>'{source,authors}',p_command#>>'{source,publicationDate}',
        p_command#>>'{source,identifier}',p_command#>>'{source,language}',
        p_command#>>'{source,citationMode}',p_command#>'{source,bibliographic}',p_command#>>'{source,citationText}',p_command#>>'{source,url}',
        p_command#>>'{source,editionOrVersion}',
        p_command#>>'{source,origin}',p_command#>>'{source,availability}',
        p_command#>>'{source,verificationStatus}',
        p_command#>>'{source,studyVisibility}'
      ) on conflict(course_id,source_id) do update set
        revision=excluded.revision,status=excluded.status,kind=excluded.kind,default_roles=excluded.default_roles,
        title=excluded.title,authors=excluded.authors,
        publication_date=excluded.publication_date,identifier=excluded.identifier,
        language=excluded.language,citation_mode=excluded.citation_mode,bibliographic=excluded.bibliographic,citation_text=excluded.citation_text,
        url=excluded.url,edition_or_version=excluded.edition_or_version,
        origin=excluded.origin,availability=excluded.availability,
        verification_status=excluded.verification_status,
        study_visibility=excluded.study_visibility,created_at=now()
      returning * into v_source;
      v_changed := true;
      v_subject_revision := v_source.revision;
    end if;
    v_subject_id := p_command->>'sourceId';
  elsif v_type = 'retire_source' then
    if p_command - 'type' - 'sourceId' - 'expectedSourceRevision'
         <> '{}'::jsonb
       or not (p_command ?& array['type','sourceId','expectedSourceRevision'])
       or jsonb_typeof(p_command->'sourceId') <> 'string'
       or char_length(p_command->>'sourceId') not between 1 and 240
       or p_command->>'sourceId' <> btrim(p_command->>'sourceId')
       or p_command->>'sourceId' ~ '[[:cntrl:]]'
       or jsonb_typeof(p_command->'expectedSourceRevision') <> 'number'
       or p_command->>'expectedSourceRevision' !~ '^[1-9][0-9]*$' then
      raise exception 'retire_source possui shape inválido.' using errcode = '22023';
    end if;
    select * into v_source from private.course_sources source
    where source.course_id = p_course_id
      and source.source_id = p_command->>'sourceId'
    ;
    if not found then raise exception 'Fonte inexistente.' using errcode = 'PT404'; end if;
    if v_source.revision <> (p_command->>'expectedSourceRevision')::bigint then
      raise exception 'A Fonte mudou; releia antes de retirar.' using errcode = '40001';
    end if;
    if v_source.status = 'retired' then
      v_subject_revision := v_source.revision;
    else
      insert into private.course_sources(
        course_id,source_id,revision,status,kind,default_roles,title,authors,
        publication_date,identifier,language,citation_mode,bibliographic,citation_text,url,
        edition_or_version,origin,availability,verification_status,
        study_visibility
      ) values(
        p_course_id,v_source.source_id,v_source.revision+1,'retired',
        v_source.kind,v_source.default_roles,v_source.title,v_source.authors,v_source.publication_date,
        v_source.identifier,v_source.language,v_source.citation_mode,v_source.bibliographic,v_source.citation_text,v_source.url,
        v_source.edition_or_version,v_source.origin,v_source.availability,
        v_source.verification_status,v_source.study_visibility
      ) on conflict(course_id,source_id) do update set
        revision=excluded.revision,status=excluded.status,created_at=now()
      returning * into v_source;
      v_changed := true;
      v_subject_revision := v_source.revision;
    end if;
    v_subject_id := p_command->>'sourceId';
  elsif v_type = 'save_anchor' then
    if p_command - 'type' - 'anchorId' - 'sourceId' - 'sourceRevision'
         - 'expectedAnchorRevision' - 'selector' - 'contentHash' - 'humanLocator'
         - 'verificationExcerpt'
         <> '{}'::jsonb
       or not (p_command ?& array[
         'type','anchorId','sourceId','sourceRevision',
         'expectedAnchorRevision','selector','contentHash','humanLocator','verificationExcerpt'
       ])
       or jsonb_typeof(p_command->'anchorId') <> 'string'
       or char_length(p_command->>'anchorId') not between 1 and 240
       or p_command->>'anchorId' <> btrim(p_command->>'anchorId')
       or p_command->>'anchorId' ~ '[[:cntrl:]]'
       or jsonb_typeof(p_command->'sourceId') <> 'string'
       or char_length(p_command->>'sourceId') not between 1 and 240
       or p_command->>'sourceId' <> btrim(p_command->>'sourceId')
       or p_command->>'sourceId' ~ '[[:cntrl:]]'
       or jsonb_typeof(p_command->'sourceRevision') <> 'number'
       or p_command->>'sourceRevision' !~ '^[1-9][0-9]*$'
       or jsonb_typeof(p_command->'expectedAnchorRevision') <> 'number'
       or p_command->>'expectedAnchorRevision' !~ '^[0-9]+$'
       or jsonb_typeof(p_command->'selector') <> 'object'
       or jsonb_typeof(p_command->'contentHash') not in('string','null')
       or p_command->>'contentHash' is not null and p_command->>'contentHash'!~'^[a-f0-9]{64}$'
       or jsonb_typeof(p_command->'humanLocator') not in('string','null')
       or jsonb_typeof(p_command->'humanLocator')='string' and (
         nullif(btrim(p_command->>'humanLocator'),'') is null
         or p_command->>'humanLocator'<>btrim(p_command->>'humanLocator')
         or char_length(p_command->>'humanLocator')>500
         or p_command->>'humanLocator'~'[[:cntrl:]]'
       )
       or jsonb_typeof(p_command->'verificationExcerpt')
         not in ('string','null') then
      raise exception 'save_anchor possui shape inválido.' using errcode = '22023';
    end if;
    select * into v_source from private.course_sources source
    where source.course_id = p_course_id
      and source.source_id = p_command->>'sourceId'
    ;
    if not found or v_source.status <> 'active'
       or v_source.revision <> (p_command->>'sourceRevision')::bigint then
      raise exception 'Âncora exige a revisão corrente e ativa da Fonte.'
        using errcode = '23514';
    end if;
    select * into v_anchor from private.course_source_anchors anchor_value
    where anchor_value.course_id = p_course_id
      and anchor_value.anchor_id = p_command->>'anchorId'
    ;
    if coalesce(v_anchor.revision,0)
         <> (p_command->>'expectedAnchorRevision')::bigint then
      raise exception 'A Âncora mudou; releia antes de salvar.' using errcode = '40001';
    end if;
    if v_anchor.revision is not null and (
      v_anchor.source_id <> p_command->>'sourceId'
      or v_anchor.source_revision <> (p_command->>'sourceRevision')::bigint
    ) then
      raise exception 'A identidade da Âncora permanece presa à revisão original da Fonte.'
        using errcode = '23514';
    end if;
    if not exists(
      select 1
      from private.course_source_anchors existing_anchor
      where existing_anchor.course_id = p_course_id
        and existing_anchor.source_id = p_command->>'sourceId'
        and existing_anchor.source_revision
          = (p_command->>'sourceRevision')::bigint
        and existing_anchor.anchor_id = p_command->>'anchorId'
    ) and (
      select count(distinct existing_anchor.anchor_id)
      from private.course_source_anchors existing_anchor
      where existing_anchor.course_id = p_course_id
        and existing_anchor.source_id = p_command->>'sourceId'
        and existing_anchor.source_revision
          = (p_command->>'sourceRevision')::bigint
    ) >= 8 then
      raise exception 'Uma revisão de Fonte aceita no máximo oito identidades de Âncora.'
        using errcode = '23514';
    end if;
    if p_command->>'contentHash' is not null and not exists(select 1 from private.course_source_attachments a
      where a.course_id=p_course_id and a.source_id=v_source.source_id and a.content_hash=p_command->>'contentHash') then
      raise exception 'O arquivo da âncora não pertence à fonte.' using errcode='23514'; end if;
    if v_anchor.revision is not null and v_anchor.status = 'active'
       and v_anchor.source_id = p_command->>'sourceId'
       and v_anchor.source_revision = (p_command->>'sourceRevision')::bigint
       and v_anchor.selector = p_command->'selector'
       and v_anchor.content_hash is not distinct from p_command->>'contentHash'
       and v_anchor.human_locator is not distinct from
         p_command#>>'{humanLocator}'
       and v_anchor.verification_excerpt is not distinct from
         p_command#>>'{verificationExcerpt}' then
      v_subject_revision := v_anchor.revision;
    else
      insert into private.course_source_anchors(
        course_id,anchor_id,revision,source_id,source_revision,status,
        selector,content_hash,human_locator,verification_excerpt
      ) values(
        p_course_id,p_command->>'anchorId',coalesce(v_anchor.revision,0)+1,
        p_command->>'sourceId',(p_command->>'sourceRevision')::bigint,
        'active',p_command->'selector',p_command->>'contentHash',p_command#>>'{humanLocator}',
        p_command#>>'{verificationExcerpt}'
      ) on conflict(course_id,anchor_id) do update set
        revision=excluded.revision,source_id=excluded.source_id,
        source_revision=excluded.source_revision,status=excluded.status,
        selector=excluded.selector,content_hash=excluded.content_hash,human_locator=excluded.human_locator,
        verification_excerpt=excluded.verification_excerpt,
        created_at=now()
      returning * into v_anchor;
      v_changed := true;
      v_subject_revision := v_anchor.revision;
    end if;
    v_subject_id := p_command->>'anchorId';
  elsif v_type = 'retire_anchor' then
    if p_command - 'type' - 'anchorId' - 'expectedAnchorRevision'
         <> '{}'::jsonb
       or not (p_command ?& array['type','anchorId','expectedAnchorRevision'])
       or jsonb_typeof(p_command->'anchorId') <> 'string'
       or char_length(p_command->>'anchorId') not between 1 and 240
       or p_command->>'anchorId' <> btrim(p_command->>'anchorId')
       or p_command->>'anchorId' ~ '[[:cntrl:]]'
       or jsonb_typeof(p_command->'expectedAnchorRevision') <> 'number'
       or p_command->>'expectedAnchorRevision' !~ '^[1-9][0-9]*$' then
      raise exception 'retire_anchor possui shape inválido.' using errcode = '22023';
    end if;
    select * into v_anchor from private.course_source_anchors anchor_value
    where anchor_value.course_id = p_course_id
      and anchor_value.anchor_id = p_command->>'anchorId'
    ;
    if not found then raise exception 'Âncora inexistente.' using errcode = 'PT404'; end if;
    if v_anchor.revision <> (p_command->>'expectedAnchorRevision')::bigint then
      raise exception 'A Âncora mudou; releia antes de retirar.' using errcode = '40001';
    end if;
    if v_anchor.status = 'retired' then
      v_subject_revision := v_anchor.revision;
    else
      insert into private.course_source_anchors(
        course_id,anchor_id,revision,source_id,source_revision,status,
        selector,content_hash,human_locator,verification_excerpt
      ) values(
        p_course_id,v_anchor.anchor_id,v_anchor.revision+1,
        v_anchor.source_id,v_anchor.source_revision,'retired',
        v_anchor.selector,v_anchor.content_hash,v_anchor.human_locator,v_anchor.verification_excerpt
      ) on conflict(course_id,anchor_id) do update set
        revision=excluded.revision,status=excluded.status,created_at=now()
      returning * into v_anchor;
      v_changed := true;
      v_subject_revision := v_anchor.revision;
    end if;
    v_subject_id := p_command->>'anchorId';
  else
    if p_command - 'type' - 'targetKind' - 'targetId'
         - 'expectedTargetVersion' - 'sourceLinks' <> '{}'::jsonb
       or not (p_command ?& array[
         'type','targetKind','targetId','expectedTargetVersion','sourceLinks'
       ])
       or p_command->>'targetKind' not in ('plan_item','study_unit')
       or jsonb_typeof(p_command->'targetId') <> 'string'
       or char_length(p_command->>'targetId') not between 1 and 240
       or p_command->>'targetId' <> btrim(p_command->>'targetId')
       or p_command->>'targetId' ~ '[[:cntrl:]]'
       or jsonb_typeof(p_command->'expectedTargetVersion') <> 'number'
       or p_command->>'expectedTargetVersion' !~ '^[1-9][0-9]*$'
       or not private.valid_course_source_links_shape_v2(
         p_command->'sourceLinks'
       ) then
      raise exception 'set_target_sources possui shape inválido.' using errcode = '22023';
    end if;
    v_assignment := private.apply_course_source_attribution_v2(
      p_course_id,p_command->>'targetKind',p_command->>'targetId',
      (p_command->>'expectedTargetVersion')::bigint,p_command->'sourceLinks'
    );
    v_changed := (v_assignment->>'changed')::boolean;
    v_subject_id := p_command->>'targetId';
    v_subject_revision := (v_assignment->>'targetVersion')::bigint;
  end if;

  if v_changed then
    update public.courses course
    set revision = course.revision + 1,updated_at = now(),
      bibliography_style=case when v_type='set_bibliography_style' then p_command->>'style' else course.bibliography_style end
    where course.id = p_course_id returning * into v_course;
    null;
    if v_type = 'set_target_sources' then
      perform private.assert_course_source_target_citation_budget_v1(
        p_course_id,p_command->>'targetKind',p_command->>'targetId'
      );
    elsif v_type = 'save_source'
       and v_source.status = 'active'
       and v_source.study_visibility in ('citation','citation_and_link') then
      for v_study_unit in
        select distinct attribution.target_id
        from private.course_source_attributions attribution
        join private.course_source_attribution_sources source_link
          on source_link.course_id = attribution.course_id
         and source_link.attribution_id = attribution.id
        where attribution.course_id = p_course_id
          and attribution.target_kind = 'study_unit'
          and source_link.source_id = v_source.source_id
      loop
        perform private.assert_course_source_target_citation_budget_v1(
          p_course_id,'study_unit',v_study_unit.target_id
        );
      end loop;
    end if;
  end if;
  v_result := jsonb_build_object(
    'contract','aralearn.course-source-change.v1',
    'courseId',p_course_id,'courseRevision',v_course.revision,
    'requestId',p_request_id,'idempotent',false,'changed',v_changed,
    'change',case when not v_changed then null
      when v_type='set_target_sources' then jsonb_build_object(
        'type',v_type,'subjectId',v_subject_id,
        'targetVersion',v_subject_revision
      )
      else jsonb_build_object(
        'type',v_type,'subjectId',v_subject_id,'revision',v_subject_revision
      ) end
  );
  insert into private.course_change_receipts(
    actor_id,request_id,operation,course_id,request_hash,result
  ) values(
    p_actor_id,p_request_id,'execute_course_source_command',
    p_course_id,v_hash,v_result
  );
  return v_result;
exception when serialization_failure then
  raise sqlstate 'PGRST' using
    message = jsonb_build_object(
      'code','40001',
      'message',sqlerrm,
      'details',null,
      'hint',null
    )::text,
    detail = jsonb_build_object(
      'status',409,
      'headers',jsonb_build_object()
    )::text;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.prepare_course_source_pdf_ingestion_core_v1(p_actor_id uuid, p_course_id uuid, p_expected_revision bigint, p_source_intent jsonb, p_content_hash text, p_byte_size bigint, p_media_type text, p_request_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_course_revision bigint;
  v_source private.course_sources%rowtype;
  v_attachment private.course_source_attachments%rowtype;
  v_conflicting_intent private.course_source_pdf_upload_intents%rowtype;
  v_source_id text;
  v_source_revision bigint;
  v_expected_source_revision bigint;
  v_request_fingerprint text;
  v_storage_path text;
  v_object_exists boolean;
  v_hash_already_counted boolean;
  v_upload_required boolean;
  v_already_linked boolean;
  v_attachment_found boolean;
  v_path_intent_found boolean;
  v_reserved_bytes bigint;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_revision is null or p_expected_revision < 1
     or not private.valid_course_source_pdf_ingestion_intent_v2(p_source_intent)
     or p_content_hash is null or p_content_hash !~ '^[a-f0-9]{64}$'
     or p_byte_size is null or p_byte_size not between 1 and 20971520
     or p_media_type is distinct from 'application/pdf'
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'Preparo de ingestão PDF inválido.' using errcode = '22023';
  end if;
  v_source_id := p_source_intent->>'sourceId';
  v_request_fingerprint := private.course_source_json_hash_v1(
    jsonb_build_object(
      'courseId',p_course_id,
      'expectedRevision',p_expected_revision,
      'sourceIntent',p_source_intent,
      'contentHash',p_content_hash,
      'byteSize',p_byte_size,
      'mediaType',p_media_type
    )
  );
  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:'||p_actor_id::text||':'||p_request_id,0
  ));
  perform 1 from auth.users actor where actor.id=p_actor_id for key share;
  if not found then
    raise exception 'Pessoa inexistente ou inacessível.' using errcode='PT404';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'course-row:' || p_course_id::text,0
  ));
  select course.revision into strict v_course_revision
  from public.courses course
  where course.id = p_course_id
  for update;
  if v_course_revision <> p_expected_revision then
    raise exception 'O Curso mudou; releia antes de preparar o PDF.'
      using errcode = '40001';
  end if;

  select * into v_source
  from private.course_sources source
  where source.course_id = p_course_id and source.source_id = v_source_id;
  if p_source_intent->>'mode' = 'existing' then
    v_source_revision := (p_source_intent->>'sourceRevision')::bigint;
    if not found then
      raise exception 'Fonte inexistente.' using errcode = 'PT404';
    end if;
    if v_source.status <> 'active' or v_source.revision <> v_source_revision then
      raise exception 'O PDF exige a revisão corrente e ativa da Fonte.'
        using errcode = '23514';
    end if;
  else
    v_expected_source_revision :=
      (p_source_intent->>'expectedSourceRevision')::bigint;
    if coalesce(v_source.revision,0) <> v_expected_source_revision then
      raise exception 'A Fonte mudou; releia antes de preparar o PDF.'
        using errcode = '40001';
    end if;
    if found and v_source.status = 'active' and row(
      v_source.kind,v_source.default_roles,v_source.title,v_source.authors,v_source.publication_date,
      v_source.identifier,v_source.language,v_source.citation_mode,v_source.bibliographic,v_source.citation_text,v_source.url,
      v_source.edition_or_version,v_source.origin,v_source.availability,
      v_source.verification_status,v_source.study_visibility
    ) is not distinct from row(
      p_source_intent#>>'{source,kind}',p_source_intent#>'{source,defaultRoles}',p_source_intent#>>'{source,title}',
      p_source_intent#>'{source,authors}',
      p_source_intent#>>'{source,publicationDate}',
      p_source_intent#>>'{source,identifier}',
      p_source_intent#>>'{source,language}',
      p_source_intent#>>'{source,citationMode}',p_source_intent#>'{source,bibliographic}',p_source_intent#>>'{source,citationText}',p_source_intent#>>'{source,url}',
      p_source_intent#>>'{source,editionOrVersion}',
      p_source_intent#>>'{source,origin}',
      p_source_intent#>>'{source,availability}',
      p_source_intent#>>'{source,verificationStatus}',
      p_source_intent#>>'{source,studyVisibility}'
    ) then
      raise exception 'A Fonte já é corrente; use o modo existing para anexá-la.'
        using errcode = '23514';
    end if;
    v_source_revision := v_expected_source_revision + 1;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'course-source-pdf-quota:' || p_course_id::text,0
  ));
  delete from private.course_source_pdf_upload_intents intent
  where intent.actor_id = p_actor_id
    and intent.request_id = p_request_id
    and intent.expires_at <= statement_timestamp();
  select * into v_attachment
  from private.course_source_attachments attachment
  where attachment.course_id = p_course_id
    and attachment.source_id = v_source_id
    and attachment.source_revision = v_source_revision
    and attachment.content_hash = p_content_hash;
  v_attachment_found := found;
  v_already_linked := v_attachment_found and v_attachment.status='active';
  v_storage_path := case when v_attachment_found
    then v_attachment.storage_path
    else p_course_id::text || '/' || p_content_hash || '.pdf'
  end;
  if v_storage_path
       !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[a-f0-9]{64}[.]pdf$'
     or split_part(v_storage_path,'/',2) <> p_content_hash || '.pdf' then
    raise exception 'O path deduplicado do PDF é incompatível.'
      using errcode = '23514';
  end if;
  if v_already_linked and(
    v_attachment.byte_size <> p_byte_size
    or v_attachment.media_type <> p_media_type
  ) or exists(
    select 1 from private.course_source_attachments existing
    where existing.course_id = p_course_id
      and existing.content_hash = p_content_hash
      and (existing.byte_size <> p_byte_size
        or existing.media_type <> p_media_type)
  ) or exists(
    select 1 from private.course_source_pdf_upload_intents intent
    where intent.course_id = p_course_id
      and intent.content_hash = p_content_hash
      and intent.expires_at > statement_timestamp()
      and (intent.byte_size <> p_byte_size
        or intent.media_type <> p_media_type)
  ) then
    raise exception 'O hash já possui metadados binários incompatíveis.'
      using errcode = '23514';
  end if;
  select exists(
    select 1 from private.course_source_attachments existing
    where existing.course_id = p_course_id
      and existing.content_hash = p_content_hash
  ) or exists(
    select 1 from storage.objects object_value
    where object_value.bucket_id = 'course-source-pdfs'
      and object_value.name = v_storage_path
  ) or exists(
    select 1 from private.course_source_pdf_upload_intents intent
    where intent.course_id = p_course_id
      and intent.content_hash = p_content_hash
      and intent.expires_at > statement_timestamp()
  ) into v_hash_already_counted;
  v_reserved_bytes := private.course_source_pdf_reserved_bytes_v1(p_course_id);
  if not v_hash_already_counted
     and v_reserved_bytes + p_byte_size > 67108864 then
    raise exception 'A cota de 64 MiB de PDFs únicos do Curso seria excedida.'
      using errcode = '23514';
  end if;
  select exists(
    select 1 from storage.objects object_value
    where object_value.bucket_id = 'course-source-pdfs'
      and object_value.name = v_storage_path
  ) into v_object_exists;
  if v_object_exists and not private.valid_course_source_pdf_object_v1(
    v_storage_path,p_byte_size,p_media_type
  ) then
    raise exception 'O objeto deduplicado possui tamanho ou tipo incompatível.'
      using errcode = '23514';
  end if;
  if v_attachment_found and v_attachment.status='removed' and exists(
    select 1 from private.course_source_pdf_delete_intents intent
    where intent.storage_path=v_storage_path
  ) then
    raise exception 'A remoção física deste PDF ainda está em andamento.'
      using errcode='40001';
  end if;
  if v_already_linked and not v_object_exists then
    raise exception 'O objeto vinculado está ausente.' using errcode = '55000';
  end if;
  v_upload_required := not v_object_exists;

  select * into v_conflicting_intent
  from private.course_source_pdf_upload_intents intent
  where intent.actor_id = p_actor_id
    and intent.course_id = p_course_id
    and intent.storage_path = v_storage_path
    and intent.expires_at > statement_timestamp();
  v_path_intent_found := found;
  if v_path_intent_found
     and v_conflicting_intent.request_id is distinct from p_request_id then
    raise exception 'Outro envio deste PDF está em andamento; tente novamente.'
      using errcode = '40001';
  end if;
  if v_path_intent_found
     and v_conflicting_intent.request_fingerprint
       is distinct from v_request_fingerprint then
    raise exception 'requestId reutilizado com preparo de PDF incompatível.'
      using errcode = '23514';
  end if;
  if exists(
    select 1 from private.course_source_pdf_upload_intents intent
    where intent.actor_id = p_actor_id
      and intent.request_id = p_request_id
      and intent.expires_at > statement_timestamp()
      and (intent.course_id <> p_course_id
        or intent.storage_path <> v_storage_path)
  ) then
    raise exception 'requestId reutilizado para outro envio de PDF.'
      using errcode = '23514';
  end if;
  insert into private.course_source_pdf_upload_intents(
    actor_id,course_id,storage_path,content_hash,byte_size,media_type,
    source_id,source_revision,course_revision,created_at,expires_at,request_id,
    request_fingerprint
  ) values(
    p_actor_id,p_course_id,v_storage_path,p_content_hash,p_byte_size,
    p_media_type,v_source_id,v_source_revision,v_course_revision,
    statement_timestamp(),statement_timestamp()+interval '10 minutes',
    p_request_id,v_request_fingerprint
  )
  on conflict(actor_id,course_id,storage_path) do update set
    content_hash = excluded.content_hash,
    byte_size = excluded.byte_size,
    media_type = excluded.media_type,
    source_id = excluded.source_id,
    source_revision = excluded.source_revision,
    course_revision = excluded.course_revision,
    created_at = excluded.created_at,
    expires_at = excluded.expires_at,
    request_id = excluded.request_id,
    request_fingerprint = excluded.request_fingerprint;

  return jsonb_build_object(
    'contract','aralearn.course-source-pdf-ingestion-preparation.v1',
    'courseId',p_course_id,
    'courseRevision',v_course_revision,
    'requestId',p_request_id,
    'sourceId',v_source_id,
    'sourceRevision',v_source_revision,
    'attachment',jsonb_build_object(
      'contentHash',p_content_hash,
      'byteSize',p_byte_size,
      'mediaType',p_media_type,
      'storagePath',v_storage_path
    ),
    'uploadRequired',v_upload_required,
    'alreadyLinked',v_already_linked
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION private.valid_course_source_pdf_ingestion_intent_v2(p_source_intent jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private'
AS $function$
declare
  v_source jsonb;
begin
  if jsonb_typeof(p_source_intent) is distinct from 'object'
     or octet_length(p_source_intent::text)>196608
     or jsonb_typeof(p_source_intent->'mode')<>'string'
     or jsonb_typeof(p_source_intent->'sourceId')<>'string'
     or char_length(p_source_intent->>'sourceId') not between 1 and 240
     or p_source_intent->>'sourceId'<>btrim(p_source_intent->>'sourceId')
     or p_source_intent->>'sourceId'~'[[:cntrl:]]' then
    return false;
  end if;
  if p_source_intent->>'mode'='existing' then
    return p_source_intent-'mode'-'sourceId'-'sourceRevision'='{}'::jsonb
      and p_source_intent ?& array['mode','sourceId','sourceRevision']
      and jsonb_typeof(p_source_intent->'sourceRevision')='number'
      and p_source_intent->>'sourceRevision'~'^[1-9][0-9]*$';
  end if;
  if p_source_intent->>'mode'<>'save'
     or p_source_intent-'mode'-'sourceId'-'expectedSourceRevision'-'source'
       <>'{}'::jsonb
     or not (p_source_intent ?& array[
       'mode','sourceId','expectedSourceRevision','source'
     ])
     or jsonb_typeof(p_source_intent->'expectedSourceRevision')<>'number'
     or p_source_intent->>'expectedSourceRevision'!~'^[0-9]+$'
     or jsonb_typeof(p_source_intent->'source')<>'object' then
    return false;
  end if;
  v_source:=p_source_intent->'source';
  return private.valid_course_source_document_v3(v_source);
exception when others then return false;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_owned_course_sources_for_actor_v1(p_actor_id uuid, p_course_id uuid, p_expected_revision bigint, p_mode text, p_source_id text DEFAULT NULL::text, p_target_kind text DEFAULT NULL::text, p_target_id text DEFAULT NULL::text, p_cursor text DEFAULT NULL::text, p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_course_revision bigint;
  v_items jsonb := '[]'::jsonb;
  v_next_cursor text;
  v_cursor_payload jsonb;
  v_after_source_id text;
  v_query_hash text;
  v_has_more boolean := false;
  v_last_source_id text;
  v_result jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_revision is null or p_expected_revision<1
     or p_mode not in('catalog','source','target')
     or p_limit is null or p_limit not between 1 and 24
     or p_mode='catalog' and (
       p_source_id is not null or p_target_kind is not null
       or p_target_id is not null
     )
     or p_mode='source' and (
       p_source_id is null or char_length(p_source_id) not between 1 and 240
       or p_source_id<>btrim(p_source_id) or p_source_id~'[[:cntrl:]]'
       or (p_target_kind is null)<>(p_target_id is null)
       or p_target_kind is not null and (
         p_target_kind not in('plan_item','study_unit')
         or p_target_id is null
         or char_length(p_target_id) not between 1 and 240
         or p_target_id<>btrim(p_target_id) or p_target_id~'[[:cntrl:]]'
       )
       or p_cursor is not null
     )
     or p_mode='target' and (
       p_source_id is not null
       or p_target_kind not in('plan_item','study_unit')
       or p_target_id is null
       or char_length(p_target_id) not between 1 and 240
       or p_target_id<>btrim(p_target_id) or p_target_id~'[[:cntrl:]]'
       or p_cursor is not null
     )
     or p_cursor is not null and (
       char_length(p_cursor) not between 1 and 240
       or p_cursor!~'^[A-Za-z0-9+/_-]+={0,2}$'
     ) then
    raise exception 'Consulta de Fontes inválida.' using errcode='22023';
  end if;

  select course.revision into strict v_course_revision
  from public.courses course
  where course.id=p_course_id
  for share;
  if v_course_revision<>p_expected_revision then
    raise exception 'O Curso mudou durante a leitura de Fontes.'
      using errcode='40001';
  end if;

  v_query_hash:=private.course_source_json_hash_v1(jsonb_build_object(
    'courseId',p_course_id,'expectedRevision',p_expected_revision,
    'mode',p_mode,'sourceId',p_source_id,
    'targetKind',p_target_kind,'targetId',p_target_id,'limit',p_limit
  ));
  if p_cursor is not null then
    begin
      v_cursor_payload:=convert_from(
        decode(translate(p_cursor,'-_','+/'),'base64'),'UTF8'
      )::jsonb;
    exception when others then
      raise exception 'Cursor de Fontes inválido.' using errcode='22023';
    end;
    if jsonb_typeof(v_cursor_payload)<>'object'
       or v_cursor_payload-'q'-'s'<>'{}'::jsonb
       or not (v_cursor_payload ?& array['q','s'])
       or v_cursor_payload->>'q'<>v_query_hash
       or jsonb_typeof(v_cursor_payload->'s')<>'string'
       or char_length(v_cursor_payload->>'s') not between 1 and 240
       or v_cursor_payload->>'s'<>btrim(v_cursor_payload->>'s')
       or v_cursor_payload->>'s'~'[[:cntrl:]]' then
      raise exception 'Cursor de Fontes inválido.' using errcode='22023';
    end if;
    v_after_source_id:=v_cursor_payload->>'s';
  end if;

  if p_mode='catalog' then
    with page as materialized (
      select source.*,
        row_number() over(order by source.source_id) as ordinal
      from private.course_sources source
      where source.course_id=p_course_id
        and (v_after_source_id is null
          or source.source_id>v_after_source_id)
      order by source.source_id
      limit p_limit+1
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'sourceId',page.source_id,'revision',page.revision,
      'status',page.status,'kind',page.kind,'defaultRoles',page.default_roles,'title',page.title,
      'authors',page.authors,
      'publicationDate',page.publication_date,
      'identifier',page.identifier,'language',page.language,
      'citationMode',page.citation_mode,'bibliographic',page.bibliographic,
      'citationText',page.citation_text,'url',page.url,
      'editionOrVersion',page.edition_or_version,
      'origin',page.origin,'availability',page.availability,
      'verificationStatus',page.verification_status,
      'studyVisibility',page.study_visibility,'publicFileAccess',page.public_file_access,
      'anchorCount',(
        select count(*)::integer
        from private.course_source_anchors anchor_value
        where anchor_value.course_id=page.course_id
          and anchor_value.source_id=page.source_id
          and anchor_value.status='active'
      ),
      'createdAt',page.created_at
    ) order by page.source_id) filter(where page.ordinal<=p_limit),'[]'::jsonb),
      count(*)>p_limit,
      max(page.source_id) filter(where page.ordinal=p_limit)
    into v_items,v_has_more,v_last_source_id
    from page;
    if v_has_more then
      v_next_cursor:=replace(replace(encode(convert_to(jsonb_build_object(
        'q',v_query_hash,'s',v_last_source_id
      )::text,'UTF8'),'base64'),E'\n',''),E'\r','');
    end if;
  elsif p_mode='source' then
    if not exists(
      select 1 from private.course_sources source
      where source.course_id=p_course_id and source.source_id=p_source_id
    ) then
      raise exception 'Fonte inexistente.' using errcode='PT404';
    end if;
    if p_target_kind is not null and private.course_source_target_state_v1(
      p_course_id,p_target_kind,p_target_id
    ) is null then
      raise exception 'Alvo de proveniência inexistente.' using errcode='PT404';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'sourceId',source.source_id,'revision',source.revision,
      'status',source.status,'kind',source.kind,'defaultRoles',source.default_roles,'title',source.title,
      'authors',source.authors,
      'publicationDate',source.publication_date,
      'identifier',source.identifier,'language',source.language,
      'citationMode',source.citation_mode,'bibliographic',source.bibliographic,
      'citationText',source.citation_text,'url',source.url,
      'editionOrVersion',source.edition_or_version,
      'origin',source.origin,'availability',source.availability,
      'verificationStatus',source.verification_status,
      'studyVisibility',source.study_visibility,'publicFileAccess',source.public_file_access,
      'anchorCount',(
        select count(*)::integer
        from private.course_source_anchors active_anchor
        where active_anchor.course_id=source.course_id
          and active_anchor.source_id=source.source_id
          and active_anchor.status='active'
      ),
      'createdAt',source.created_at,
      'anchors',coalesce((
        select jsonb_agg(jsonb_build_object(
          'anchorId',anchor_value.anchor_id,
          'revision',anchor_value.revision,
          'sourceRevision',anchor_value.source_revision,
          'status',anchor_value.status,
          'selector',anchor_value.selector,'contentHash',anchor_value.content_hash,
          'humanLocator',anchor_value.human_locator,
          'verificationExcerpt',anchor_value.verification_excerpt,
          'needsReverification',anchor_value.selector->>'kind'
            in('page_range','text_quote') and exists(
              select 1
              from private.course_source_attachments active_pdf
              join private.course_source_attachments removed_pdf
                on removed_pdf.course_id=active_pdf.course_id
               and removed_pdf.source_id=active_pdf.source_id
               and removed_pdf.status='removed'
               and removed_pdf.content_hash<>active_pdf.content_hash
              where active_pdf.course_id=source.course_id
                and active_pdf.source_id=source.source_id
                and active_pdf.status='active'
            ),
          'createdAt',anchor_value.created_at
        ) order by anchor_value.anchor_id)
        from private.course_source_anchors anchor_value
        where anchor_value.course_id=source.course_id
          and anchor_value.source_id=source.source_id
      ),'[]'::jsonb),
      'attachments',coalesce((
        select jsonb_agg(jsonb_build_object(
          'contentHash',attachment.content_hash,'publicFileAccess',attachment.public_file_access,
          'byteSize',attachment.byte_size,
          'mediaType',attachment.media_type,
          'storagePath',attachment.storage_path,
          'createdAt',attachment.created_at
        ) order by attachment.created_at,attachment.content_hash)
        from private.course_source_attachments attachment
        where attachment.course_id=source.course_id
          and attachment.source_id=source.source_id
          and attachment.status='active'
      ),'[]'::jsonb)
    )),'[]'::jsonb)
    into v_items
    from private.course_sources source
    where source.course_id=p_course_id and source.source_id=p_source_id
      and (
        p_target_kind is null
        or exists(
          select 1
          from private.course_effective_source_attribution_v1(
            p_course_id,p_target_kind,p_target_id
          ) attribution
          join private.course_source_attribution_sources source_link
            on source_link.course_id=attribution.course_id
           and source_link.attribution_id=attribution.id
          where attribution.course_id=p_course_id
            and attribution.target_kind=p_target_kind
            and attribution.target_id=p_target_id
            and source_link.source_id=p_source_id
        )
      );
  else
    if private.course_source_target_state_v1(
      p_course_id,p_target_kind,p_target_id
    ) is null then
      raise exception 'Alvo de proveniência inexistente.' using errcode='PT404';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'targetKind',attribution.target_kind,
      'targetId',attribution.target_id,
      'targetVersion',attribution.target_version,
      'sourceLinks',private.course_source_links_v1(
        attribution.course_id,attribution.id
      ),
      'createdAt',attribution.created_at
    )),'[]'::jsonb)
    into v_items
    from private.course_effective_source_attribution_v1(
      p_course_id,p_target_kind,p_target_id
    ) attribution;
  end if;

  v_result:=jsonb_build_object(
    'contract','aralearn.course-sources.v3',
    'bibliographyStyle',(select bibliography_style from public.courses where id=p_course_id),
    'courseId',p_course_id,'courseRevision',v_course_revision,
    'mode',p_mode,
    'query',jsonb_build_object(
      'sourceId',case when p_mode='source' then p_source_id else null end,
      'targetKind',case when p_mode in('source','target')
        then p_target_kind else null end,
      'targetId',case when p_mode in('source','target')
        then p_target_id else null end
    ),
    'pdfStorage',jsonb_build_object(
      'uniqueBytes',private.course_source_pdf_unique_bytes_v1(p_course_id),
      'maxUniqueBytes',67108864
    ),
    'items',coalesce(v_items,'[]'::jsonb),'nextCursor',v_next_cursor
  );
  if octet_length(v_result::text)>262144 then
    raise exception 'Leitura de Fontes excede 256 KiB.' using errcode='54000';
  end if;
  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.course_study_citations_payload_v1(p_course_id uuid, p_study_unit_id text, p_course_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private'
AS $function$
declare
  v_attribution private.course_source_attributions%rowtype;
  v_citations jsonb:='[]'::jsonb;
  v_result jsonb;
begin
  if p_course_id is null or p_study_unit_id is null
     or char_length(p_study_unit_id) not between 1 and 240
     or p_study_unit_id<>btrim(p_study_unit_id)
     or p_study_unit_id~'[[:cntrl:]]'
     or p_course_revision is null or p_course_revision<1 then
    raise exception 'Cerca de citações de Estudo inválida.'
      using errcode='22023';
  end if;
  select * into v_attribution
  from private.course_effective_source_attribution_v1(
    p_course_id,'study_unit',p_study_unit_id
  );
  if v_attribution.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'linkId',source_link.link_id,'relation',source_link.relation,'roles',source_link.roles,'occurrences',source_link.occurrences,
      'sourceId',source_link.source_id,'sourceRevision',source.revision,
      'kind',source.kind,'authors',source.authors,'publicationDate',source.publication_date,
      'identifier',source.identifier,'language',source.language,'bibliographic',source.bibliographic,
      'citationMode',source.citation_mode,
      'attachments',coalesce((select jsonb_agg(jsonb_build_object('contentHash',a.content_hash,
        'byteSize',a.byte_size,'mediaType',a.media_type) order by a.content_hash)
        from private.course_source_attachments a where a.course_id=source.course_id and a.source_id=source.source_id
          and private.can_read_course_file_v1(source.course_id,auth.uid(),source.source_id,a.content_hash)),'[]'::jsonb),
      'title',source.title,
      'citationText',source.citation_text,
      'url',case when source.study_visibility='citation_and_link'
        then source.url else null end,
      'editionOrVersion',source.edition_or_version,
      'anchors',coalesce((
        select jsonb_agg(jsonb_build_object(
          'anchorId',anchor_link.anchor_id,
          'selector',anchor_value.selector,'contentHash',anchor_value.content_hash,
          'humanLocator',anchor_value.human_locator
        ) order by anchor_link.anchor_ordinal)
        from private.course_source_attribution_anchors anchor_link
        join private.course_source_anchors anchor_value
          on anchor_value.course_id=anchor_link.course_id
         and anchor_value.anchor_id=anchor_link.anchor_id
         and anchor_value.source_id=anchor_link.source_id

        where anchor_link.course_id=source_link.course_id
          and anchor_link.attribution_id=source_link.attribution_id
          and anchor_link.source_ordinal=source_link.source_ordinal
      ),'[]'::jsonb)
    ) order by source_link.source_ordinal),'[]'::jsonb)
    into v_citations
    from private.course_source_attribution_sources source_link
    join private.course_sources source
      on source.course_id=source_link.course_id
     and source.source_id=source_link.source_id

     and source.study_visibility in('citation','citation_and_link')
    where source_link.course_id=p_course_id
      and source_link.attribution_id=v_attribution.id;
  end if;
  v_result:=jsonb_build_object(
    'contract','aralearn.course-study-citations.v2',
    'bibliographyStyle',(select bibliography_style from public.courses where id=p_course_id),
    'courseId',p_course_id,'courseRevision',p_course_revision,
    'studyUnitId',p_study_unit_id,'citations',v_citations
  );
  if octet_length(v_result::text)>262144 then
    raise exception 'Citações de Estudo excedem 256 KiB.' using errcode='54000';
  end if;
  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.invalidate_course_source_attribution_after_target_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private'
AS $function$
declare
  v_target_kind text;
  v_target_id text;
  v_state jsonb;
begin
  if tg_table_name='course_entities' then
    if old.entity_type<>'study_unit'
       or tg_op='UPDATE' and row(new.version,new.content)
         is not distinct from row(old.version,old.content) then
      if tg_op='DELETE' then return old; else return new; end if;
    end if;
    v_target_kind:='study_unit';
    v_target_id:=old.entity_id;
  else
    if tg_op='UPDATE' and row(new.version,new.statement)
         is not distinct from row(old.version,old.statement) then
      if tg_op='DELETE' then return old; else return new; end if;
    end if;
    v_target_kind:='plan_item';
    v_target_id:=old.id::text;
  end if;
  if tg_op='UPDATE' then
    v_state:=private.course_source_target_state_v1(old.course_id,v_target_kind,v_target_id);
    update private.course_source_attributions attribution
      set target_version=(v_state->>'version')::bigint,target_hash=v_state->>'hash'
      where attribution.course_id=old.course_id and attribution.target_kind=v_target_kind and attribution.target_id=v_target_id;
  end if;
  if tg_op='DELETE' and v_target_kind='plan_item' then
    if exists(select 1 from public.courses where id=old.course_id)
       and exists(select 1 from private.course_source_attributions a
         join private.course_source_attribution_sources l
           on l.course_id=a.course_id and l.attribution_id=a.id
         where a.course_id=old.course_id and a.target_kind=v_target_kind and a.target_id=v_target_id) then
      raise exception 'O item do plano possui referências; retire os vínculos no painel Fontes antes de excluí-lo.' using errcode='23514';
    end if;
    delete from private.course_source_attributions
      where course_id=old.course_id and target_kind=v_target_kind and target_id=v_target_id;
  end if;
  -- A study-unit DELETE is reconciled in the same composition transaction.
  if tg_op='DELETE' then return old; else return new; end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.commit_course_composition_for_actor_v1(p_actor_id uuid, p_course_id uuid, p_expected_revision bigint, p_upserts jsonb, p_deletes jsonb, p_source_attribution_applications jsonb, p_request_id text, p_course_metadata jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'extensions'
AS $function$
declare
  v_hash text;
  v_receipt private.course_change_receipts%rowtype;
  v_result jsonb;
  v_application record;
  v_entity private.course_entities%rowtype;
  v_upsert jsonb;
  v_application_states jsonb := '[]'::jsonb;
  v_state jsonb;
  v_assignment jsonb;
  v_attribution_changed_count integer := 0;
  v_course public.courses%rowtype;
  v_target_version bigint;
  v_orphan record;
  v_old_link jsonb;
  v_occurrence jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_revision is null or p_expected_revision < 1
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or jsonb_typeof(p_upserts) <> 'array'
     or jsonb_typeof(p_deletes) <> 'array'
     or jsonb_typeof(p_source_attribution_applications) <> 'array'
     or jsonb_array_length(p_source_attribution_applications) > 64
     or octet_length(p_source_attribution_applications::text) > 196608
     or exists(
       select 1
       from jsonb_array_elements(p_source_attribution_applications)
         application(value)
       where jsonb_typeof(application.value) <> 'object'
         or application.value - 'studyUnitId' - 'sourceLinks' <> '{}'::jsonb
         or not (application.value ?& array['studyUnitId','sourceLinks'])
         or jsonb_typeof(application.value->'studyUnitId') <> 'string'
         or char_length(application.value->>'studyUnitId') not between 1 and 240
         or not private.valid_course_source_links_shape_v2(
           application.value->'sourceLinks'
         )
     )
     or (
       select count(*) <> count(distinct application.value->>'studyUnitId')
       from jsonb_array_elements(p_source_attribution_applications)
         application(value)
     )
     or (
       select count(*)
       from jsonb_array_elements(p_upserts) upsert_item(value)
       where upsert_item.value->>'entityType' = 'study_unit'
     ) <> jsonb_array_length(p_source_attribution_applications)
     or exists(
       select 1
       from (
         select candidate.value
         from jsonb_array_elements(p_upserts) candidate(value)
         where candidate.value->>'entityType' = 'study_unit'
       ) upsert_item
       full join jsonb_array_elements(p_source_attribution_applications)
         application(value)
         on application.value->>'studyUnitId' = upsert_item.value->>'entityId'
       where (
         upsert_item.value is not null and application.value is null
       ) or (
         application.value is not null and upsert_item.value is null
       )
     )
     or exists(
       select 1 from jsonb_array_elements(p_upserts) upsert_item(value)
       where upsert_item.value->>'entityType' = 'study_unit'
         and upsert_item.value->'content' ? 'sources'
     ) then
    raise exception 'Composição exige proveniência explícita para cada Unidade.'
      using errcode = '22023';
  end if;
  v_hash := private.course_source_json_hash_v1(jsonb_build_object(
    'courseId',p_course_id,'expectedRevision',p_expected_revision,
    'upserts',p_upserts,'deletes',p_deletes,
    'sourceAttributionApplications',p_source_attribution_applications
  ) || case when p_course_metadata is null then '{}'::jsonb else jsonb_build_object('courseMetadata',p_course_metadata) end);
  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:' || p_actor_id::text || ':' || p_request_id,0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  select * into v_receipt from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'commit_course_composition'
       or v_receipt.course_id <> p_course_id
       or v_receipt.request_hash <> v_hash then
      raise exception 'requestId reutilizado com composição incompatível.'
        using errcode = '23514';
    end if;
    return (v_receipt.result - 'idempotent')
      || jsonb_build_object('idempotent',true);
  end if;

  for v_application in
    select application.value
    from jsonb_array_elements(p_source_attribution_applications)
      with ordinality application(value,ordinal)
    order by application.ordinal
  loop
    select upsert_item.value into strict v_upsert
    from jsonb_array_elements(p_upserts) upsert_item(value)
    where upsert_item.value->>'entityType' = 'study_unit'
      and upsert_item.value->>'entityId'
        = v_application.value->>'studyUnitId';
    select * into v_entity
    from private.course_entities entity
    where entity.course_id = p_course_id
      and entity.entity_type = 'study_unit'
      and entity.entity_id = v_application.value->>'studyUnitId';
    if found then
      v_target_version := v_entity.version + case when row(
        v_entity.parent_type,v_entity.parent_id,v_entity.position,v_entity.content
      ) is distinct from row(
        nullif(v_upsert->>'parentType',''),nullif(v_upsert->>'parentId',''),
        (v_upsert->>'position')::integer,v_upsert->'content'
      ) then 1 else 0 end;
    else
      v_target_version := 1;
    end if;
    v_application_states := v_application_states || jsonb_build_array(
      jsonb_build_object(
        'application',v_application.value,
        'targetVersion',v_target_version
      )
    );
  end loop;

  v_result := private.commit_course_composition_core_v1(
    p_actor_id,p_course_id,p_expected_revision,p_upserts,p_deletes,p_request_id,p_course_metadata
  );
  for v_application in
    select application.value
    from jsonb_array_elements(v_application_states)
      with ordinality application(value,ordinal)
    order by application.ordinal
  loop
    v_state := private.course_source_target_state_v1(
      p_course_id,'study_unit',
      v_application.value#>>'{application,studyUnitId}'
    );
    if v_state is null then
      raise exception 'A composição não preservou o alvo de proveniência.'
        using errcode = '55000';
    end if;
    v_assignment := private.apply_course_source_attribution_v2(
      p_course_id,'study_unit',
      v_application.value#>>'{application,studyUnitId}',
      (v_state->>'version')::bigint,
      v_application.value#>'{application,sourceLinks}',
      v_state->>'hash'
    );
    if (v_assignment->>'changed')::boolean then
      v_attribution_changed_count := v_attribution_changed_count + 1;
    end if;
  end loop;
  if v_attribution_changed_count > 0 then
    if (v_result->>'revision')::bigint=p_expected_revision then
      update public.courses course
      set revision = course.revision + 1,updated_at = now()
      where course.id = p_course_id returning * into v_course;
      null;
      v_result := jsonb_set(v_result,'{revision}',
        to_jsonb(v_course.revision),true);
      v_result := jsonb_set(v_result,'{updatedAt}',
        to_jsonb(v_course.updated_at),true);
    else
      null;
    end if;
    for v_application in
      select application.value
      from jsonb_array_elements(p_source_attribution_applications)
        with ordinality application(value,ordinal)
      order by application.ordinal
    loop
      perform private.assert_course_source_target_citation_budget_v1(
        p_course_id,'study_unit',v_application.value->>'studyUnitId'
      );
    end loop;
  end if;
  for v_orphan in
    select a.* from private.course_source_attributions a where a.course_id=p_course_id and a.target_kind='study_unit'
     and not exists(select 1 from private.course_entities e where e.course_id=a.course_id and e.entity_type='study_unit' and e.entity_id=a.target_id)
  loop
    for v_old_link in select value from jsonb_array_elements(private.course_source_links_v1(p_course_id,v_orphan.id)) loop
      if not exists(select 1 from private.course_source_attributions a
        cross join lateral jsonb_array_elements(private.course_source_links_v1(p_course_id,a.id)) destination
        where a.course_id=p_course_id and a.target_kind='study_unit' and a.id<>v_orphan.id
         and private.course_source_target_state_v1(p_course_id,a.target_kind,a.target_id) is not null
         and destination-'occurrences'=v_old_link-'occurrences') then
        raise exception 'A divisão exige conservar os vínculos da unidade; revise as referências pendentes.' using errcode='23514'; end if;
      for v_occurrence in select value from jsonb_array_elements(v_old_link->'occurrences') loop
        if not exists(select 1 from private.course_source_attributions a
          cross join lateral jsonb_array_elements(private.course_source_links_v1(p_course_id,a.id)) destination
          where a.course_id=p_course_id and a.target_kind='study_unit' and a.id<>v_orphan.id
           and private.course_source_target_state_v1(p_course_id,a.target_kind,a.target_id) is not null
           and destination-'occurrences'=v_old_link-'occurrences'
           and (destination->'occurrences') @> jsonb_build_array(v_occurrence)) then
          raise exception 'A divisão exige conservar cada ocorrência; revise o trecho pendente.' using errcode='23514'; end if;
      end loop;
    end loop;
    delete from private.course_source_attributions where course_id=p_course_id and id=v_orphan.id;
  end loop;
  update private.course_change_receipts receipt
  set request_hash = v_hash,result = v_result
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_owned_course_authoring_analytics_for_actor_v3(p_actor_id uuid, p_course_id uuid, p_expected_course_revision bigint, p_query jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_course public.courses%rowtype;
  v_scope_kind text;
  v_scope_ref text;
  v_scope_label text;
  v_result jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_course_revision is null or p_expected_course_revision < 1
     or p_query is null or jsonb_typeof(p_query) <> 'object'
     or not (p_query ? 'scope') or p_query - 'scope' <> '{}'::jsonb
     or jsonb_typeof(p_query->'scope') <> 'object'
     or not (p_query->'scope' ?& array['kind','ref'])
     or (p_query->'scope') - 'kind' - 'ref' <> '{}'::jsonb
     or jsonb_typeof(p_query#>'{scope,kind}') <> 'string'
     or p_query#>>'{scope,kind}' not in(
       'course','authoring_part','didactic_microsequence','study_unit'
     ) then
    raise exception 'Consulta de Analytics inválida.' using errcode = '22023';
  end if;
  v_scope_kind := p_query#>>'{scope,kind}';
  if v_scope_kind = 'course' then
    if p_query#>'{scope,ref}' <> 'null'::jsonb then
      raise exception 'O escopo Curso não recebe referência.' using errcode = '22023';
    end if;
    v_scope_ref := null;
  else
    if jsonb_typeof(p_query#>'{scope,ref}') <> 'string' then
      raise exception 'O escopo exige referência corrente.' using errcode = '22023';
    end if;
    v_scope_ref := p_query#>>'{scope,ref}';
    if nullif(btrim(v_scope_ref),'') is null
       or v_scope_ref <> btrim(v_scope_ref)
       or char_length(v_scope_ref) > 240
       or v_scope_ref ~ '[[:cntrl:]]' then
      raise exception 'A referência do escopo é inválida.' using errcode = '22023';
    end if;
  end if;
  select * into v_course from public.courses course where course.id = p_course_id;
  if not found then raise exception 'Curso inexistente.' using errcode = 'PT404'; end if;
  if v_course.revision is distinct from p_expected_course_revision then
    raise exception 'O Curso mudou durante a leitura de Analytics.'
      using errcode = '40001';
  end if;
  if v_scope_kind = 'course' then
    v_scope_label := v_course.title;
  elsif v_scope_kind = 'authoring_part' then
    select part.title into v_scope_label
    from private.course_authoring_parts part
    where part.course_id = p_course_id and part.id::text = v_scope_ref;
  elsif v_scope_kind = 'didactic_microsequence' then
    select microsequence.content->>'title' into v_scope_label
    from private.course_entities microsequence
    where microsequence.course_id = p_course_id
      and microsequence.entity_type = 'microsequence'
      and microsequence.entity_id = v_scope_ref;
  else
    select unit.content->>'title' into v_scope_label
    from private.course_entities unit
    where unit.course_id = p_course_id and unit.entity_type = 'study_unit'
      and unit.entity_id = v_scope_ref;
  end if;
  if v_scope_label is null then
    raise exception 'Escopo de Analytics inexistente.' using errcode = 'PT404';
  end if;

  with
  selected_microsequences as materialized (
    select microsequence.entity_id,microsequence.parent_id as lesson_id,
      microsequence.position,microsequence.content->>'title' as title
    from private.course_entities microsequence
    where microsequence.course_id = p_course_id
      and microsequence.entity_type = 'microsequence'
      and (
        v_scope_kind = 'course'
        or v_scope_kind = 'authoring_part' and exists(
          select 1
          from private.course_authoring_part_didactic_microsequences membership
          where membership.course_id = microsequence.course_id
            and membership.authoring_part_id::text = v_scope_ref
            and membership.didactic_microsequence_id = microsequence.entity_id
        )
        or v_scope_kind = 'didactic_microsequence'
          and microsequence.entity_id = v_scope_ref
        or v_scope_kind = 'study_unit' and exists(
          select 1 from private.course_entities selected_unit
          where selected_unit.course_id = microsequence.course_id
            and selected_unit.entity_type = 'study_unit'
            and selected_unit.entity_id = v_scope_ref
            and selected_unit.parent_id = microsequence.entity_id
        )
      )
  ),
  scope_units_unordered as materialized (
    select unit.entity_id,unit.parent_id as microsequence_id,unit.position,
      unit.content,unit.version,unit.created_at,unit.updated_at,
      unit.design_snapshot,unit.design_application,
      unit.created_origin,unit.last_revision_origin,
      microsequence.lesson_id,lesson.parent_id as module_id,
      microsequence.position as microsequence_position,
      lesson.position as lesson_position,module_value.position as module_position
    from private.course_entities unit
    join selected_microsequences microsequence
      on microsequence.entity_id = unit.parent_id
    join private.course_entities lesson
      on lesson.course_id = unit.course_id and lesson.entity_type = 'lesson'
     and lesson.entity_id = microsequence.lesson_id
    join private.course_entities module_value
      on module_value.course_id = lesson.course_id
     and module_value.entity_type = 'module'
     and module_value.entity_id = lesson.parent_id
    where unit.course_id = p_course_id and unit.entity_type = 'study_unit'
      and (v_scope_kind <> 'study_unit' or unit.entity_id = v_scope_ref)
  ),
  scope_units as materialized (
    select unit.*,
      row_number() over(order by unit.module_position,unit.lesson_position,
        unit.microsequence_position,unit.position,unit.entity_id)::integer
        as analytics_position
    from scope_units_unordered unit
  ),
  scope_options as materialized (
    select 'course'::text as kind,null::text as ref,v_course.title as label,
      0::integer as kind_order,0::integer as first_order,0::integer as second_order,
      0::integer as third_order,0::integer as fourth_order,''::text as tie
    union all
    select 'authoring_part',part.id::text,part.title,1,part.position,0,0,0,part.id::text
    from private.course_authoring_parts part
    where part.course_id = p_course_id
    union all
    select 'didactic_microsequence',microsequence.entity_id,
      microsequence.content->>'title',2,module_value.position,lesson.position,
      microsequence.position,0,microsequence.entity_id
    from private.course_entities microsequence
    join private.course_entities lesson
      on lesson.course_id = microsequence.course_id and lesson.entity_type = 'lesson'
     and lesson.entity_id = microsequence.parent_id
    join private.course_entities module_value
      on module_value.course_id = lesson.course_id and module_value.entity_type = 'module'
     and module_value.entity_id = lesson.parent_id
    where microsequence.course_id = p_course_id
      and microsequence.entity_type = 'microsequence'
    union all
    select 'study_unit',unit.entity_id,unit.content->>'title',3,
      module_value.position,lesson.position,microsequence.position,unit.position,
      unit.entity_id
    from private.course_entities unit
    join private.course_entities microsequence
      on microsequence.course_id = unit.course_id
     and microsequence.entity_type = 'microsequence'
     and microsequence.entity_id = unit.parent_id
    join private.course_entities lesson
      on lesson.course_id = microsequence.course_id and lesson.entity_type = 'lesson'
     and lesson.entity_id = microsequence.parent_id
    join private.course_entities module_value
      on module_value.course_id = lesson.course_id and module_value.entity_type = 'module'
     and module_value.entity_id = lesson.parent_id
    where unit.course_id = p_course_id and unit.entity_type = 'study_unit'
  ),
  current_design as materialized (
    select unit.entity_id as study_unit_id,
      unit.design_snapshot as snapshot,unit.design_application as application
    from scope_units unit
    where jsonb_typeof(unit.design_snapshot) = 'object'
      and jsonb_typeof(unit.design_application) = 'object'
      and jsonb_typeof(unit.design_snapshot->'appliedAt') = 'string'
  ),

  parameter_value_rows as materialized (
    select parameter.value->>'parameterId' as parameter_id,
      parameter.value->'value' as value,parameter.value->>'origin' as origin,parameter.value->>'reason' as reason,
      parameter.value->>'sourceScopeKind' as source_scope_kind,
      count(distinct design.study_unit_id)::integer as study_unit_count
    from current_design design
    cross join lateral jsonb_array_elements(design.snapshot->'parameters') parameter(value)
    where parameter.value->>'parameterId'
        <> 'new_analysis_unit_ceiling_per_expository_study_unit'
      or design.application->>'mode' in('expository','mixed')
    group by parameter.value->>'parameterId',parameter.value->'value',
      parameter.value->>'origin',parameter.value->>'reason',parameter.value->>'sourceScopeKind'
  ),
  editorial_per_unit as materialized (
    select design.study_unit_id,
      case when char_length(direction.value->>'direction') <= 4000
        then direction.value->>'direction' else null end as direction,
      case when char_length(direction.value->>'direction') <= 4000
        then direction.value->>'origin' else null end as origin,
      case when char_length(direction.value->>'direction') <= 4000
        then direction.value->>'sourceScopeKind' else null end
        as source_scope_kind,
      char_length(direction.value->>'direction') > 4000 as truncated
    from current_design design
    left join lateral jsonb_array_elements(
      design.snapshot->'editorialDirections'
    ) direction(value) on true
  ),
  editorial_rows as materialized (
    select editorial.direction,editorial.origin,editorial.source_scope_kind,
      count(distinct editorial.study_unit_id)::integer as study_unit_count
    from editorial_per_unit editorial
    group by editorial.direction,editorial.origin,editorial.source_scope_kind
  ),
  unit_word_counts as materialized (
    select unit.entity_id as study_unit_id,
      coalesce(sum(
        private.count_course_component_authorial_words_v1(
          instance.instance->'data',null
        )
      ),0)::integer as word_count
    from scope_units unit
    left join lateral (
      select content.value as instance
      from jsonb_array_elements(unit.content->'content') content(value)
      union all
      select unit.content->'response'
      where jsonb_typeof(unit.content->'response')='object'
      union all
      select feedback.value
      from jsonb_array_elements(unit.content->'feedback') feedback(value)
    ) instance on true
    group by unit.entity_id
  ),
  word_count_rows as materialized (
    select unit.word_count,count(*)::integer as study_unit_count
    from unit_word_counts unit
    group by unit.word_count
  ),
  authorized_analysis as materialized (
    select distinct item.id as analysis_id,item.position+1 as position,item.statement
    from current_design design
    cross join lateral jsonb_array_elements_text(
      design.snapshot->'instructionalAnalysisUnitIds'
    ) requested(value)
    join private.course_instructional_plan_items item
      on item.course_id = p_course_id
     and item.item_kind = 'instructional_analysis_unit'
     and item.id::text = requested.value
  ),
  introduction_rows as materialized (
    select design.study_unit_id,introduction.value as analysis_id
    from current_design design
    cross join lateral jsonb_array_elements_text(
      design.application->'introducedInstructionalAnalysisUnitIds'
    ) introduction(value)
  ),
  explanation_rows as materialized (
    select design.study_unit_id,form.value as form
    from current_design design
    cross join lateral jsonb_array_elements(
      design.application->'explanationApplications'
    ) explanation(value)
    cross join lateral jsonb_array_elements_text(
      explanation.value->'developedForms'
    ) form(value)
  ),
  component_rows as materialized (
    select unit.entity_id as study_unit_id,
      (instance.value->>'package')||'@'||(instance.value->>'version') as component_ref
    from scope_units unit
    cross join lateral (
      select content.value from jsonb_array_elements(unit.content->'content') content(value)
      union all
      select unit.content->'response'
      where jsonb_typeof(unit.content->'response') = 'object'
      union all
      select feedback.value
      from jsonb_array_elements(unit.content->'feedback') feedback(value)
    ) instance(value)
    where jsonb_typeof(instance.value) = 'object'
      and nullif(instance.value->>'package','') is not null
      and nullif(instance.value->>'version','') is not null
  ),
  authorized_evidence as materialized (
    select distinct item.id as evidence_id,item.position+1 as position,item.statement
    from current_design design
    cross join lateral jsonb_array_elements_text(
      design.snapshot->'evidenceRequirementIds'
    ) requested(value)
    join private.course_instructional_plan_items item
      on item.course_id = p_course_id
     and item.item_kind = 'evidence_requirement'
     and item.id::text = requested.value
  ),
  practice_rows as materialized (
    select design.study_unit_id,
      practice.value->>'evidenceRequirementId' as evidence_id,
      practice.value->>'opportunityId' as opportunity_id,
      practice.value->'variedDimensions' as varied_dimensions
    from current_design design
    cross join lateral jsonb_array_elements(
      design.application->'practiceApplications'
    ) practice(value)
  ),
  variation_rows as materialized (
    select practice.evidence_id,practice.opportunity_id,dimension.value as dimension
    from practice_rows practice
    cross join lateral jsonb_array_elements_text(
      practice.varied_dimensions
    ) dimension(value)
  ),
  effective_attributions as materialized (
    select unit.entity_id as study_unit_id,attribution.id as attribution_id
    from scope_units unit
    join lateral (
      select effective.id
      from private.course_effective_source_attribution_v1(
        p_course_id,'study_unit',unit.entity_id
      ) effective
    ) attribution on true
  ),

  source_role_rows as materialized (
    select role_value.value as role,
      count(distinct source_link.source_id)::integer as source_count,
      count(distinct anchor_link.anchor_id)::integer as anchor_count,
      count(distinct attribution.study_unit_id)::integer as study_unit_count
    from effective_attributions attribution
    join private.course_source_attribution_sources source_link
      on source_link.course_id = p_course_id
     and source_link.attribution_id = attribution.attribution_id
    join private.course_sources source
      on source.course_id=source_link.course_id
     and source.source_id=source_link.source_id
    left join private.course_source_attribution_anchors anchor_link
      on anchor_link.course_id = source_link.course_id
     and anchor_link.attribution_id = source_link.attribution_id
     and anchor_link.source_ordinal = source_link.source_ordinal
    cross join lateral jsonb_array_elements_text(source_link.roles) role_value(value)
    group by role_value.value
  ),
  scope_annotations as materialized (
    select annotation.*
    from private.course_anchored_annotations annotation
    where annotation.course_id = p_course_id
      and annotation.origin in('author','learner','reviewer')
      and (
        v_scope_kind = 'course'
        or annotation.target_kind = 'study_unit' and exists(
          select 1 from scope_units unit where unit.entity_id = annotation.target_id
        )
        or v_scope_kind in('authoring_part','didactic_microsequence')
          and annotation.target_kind = 'didactic_microsequence' and exists(
          select 1 from selected_microsequences microsequence
          where microsequence.entity_id = annotation.target_id
        )
      )
  ),
  relevant_parameter_assignments as materialized (
    select assignment.parameter_id,assignment.scope_kind,assignment.scope_ref
    from private.course_design_parameter_assignments assignment
    where assignment.course_id = p_course_id
      and assignment.origin in('author','research_condition')
      and (
        v_scope_kind = 'course'
        or assignment.scope_kind = 'course'
        or assignment.scope_kind = 'lesson' and exists(
          select 1 from selected_microsequences microsequence
          where microsequence.lesson_id = assignment.scope_ref
        )
        or assignment.scope_kind = 'didactic_microsequence' and exists(
          select 1 from selected_microsequences microsequence
          where microsequence.entity_id = assignment.scope_ref
        )
        or assignment.scope_kind = 'study_unit' and exists(
          select 1 from scope_units unit where unit.entity_id=assignment.scope_ref
        )
      )
  ),
  origin_changes as materialized (
    select origin.origin,
      count(*) filter(where unit.created_origin = origin.origin)::integer as created_count,
      count(*) filter(where unit.version > 1
        and unit.last_revision_origin = origin.origin)::integer as revised_count
    from (values('human'::text),('gpt'::text)) origin(origin)
    cross join scope_units unit
    group by origin.origin
    having count(*) filter(where unit.created_origin = origin.origin
      or unit.version > 1 and unit.last_revision_origin = origin.origin) > 0
  ),
  missing_rows as materialized (
    select format('Unidades de estudo sem informações pedagógicas completas: %s.',
      count(*)::integer) as message
    from scope_units unit
    where not exists(
      select 1 from current_design design where design.study_unit_id = unit.entity_id
    )
    having count(*) > 0
    union all
    select format('Unidades de estudo sem configuração aplicada completa: %s.',
      count(*)::integer)
    from scope_units unit
    left join current_design design on design.study_unit_id = unit.entity_id
    where design.study_unit_id is null
      or jsonb_array_length(design.snapshot->'parameters') <> (select count(*) from private.course_design_parameter_definitions)
    having count(*) > 0
    union all
    select format('Direções editoriais que não puderam ser mostradas integralmente: %s.',
      count(*)::integer)
    from editorial_per_unit editorial where editorial.truncated
    having count(*) > 0
    union all
    select 'Há unidades de estudo cuja origem de autoria não foi registrada.'
    where exists(
      select 1 from scope_units unit
      where unit.created_origin is null
        or unit.version > 1 and unit.last_revision_origin is null
    )
  )
  select jsonb_build_object(
    'contract','aralearn.course-authoring-analytics.v3',
    'course',jsonb_build_object(
      'id',v_course.id,'revision',v_course.revision,'title',v_course.title
    ),
    'scope',jsonb_build_object(
      'selected',jsonb_build_object(
        'kind',v_scope_kind,'ref',v_scope_ref,'label',v_scope_label
      ),
      'options',coalesce((select jsonb_agg(jsonb_build_object(
        'kind',option_value.kind,'ref',option_value.ref,'label',option_value.label
      ) order by option_value.kind_order,option_value.first_order,
        option_value.second_order,option_value.third_order,
        option_value.fourth_order,option_value.tie)
        from scope_options option_value),'[]'::jsonb)
    ),
    'design',jsonb_build_object(
      'studyUnitCount',(select count(*)::integer from scope_units),
      'practiceSequence',coalesce((select jsonb_agg(jsonb_build_object('studyUnitRef',unit.entity_id,'position',unit.analytics_position,'mode',unit.design_application->>'mode') order by unit.analytics_position) from scope_units unit),'[]'::jsonb),
      
      'parameters',coalesce((select jsonb_agg(jsonb_build_object(
        'parameterId',definition.parameter_id,
        'label',definition.definition->>'label','definition',definition.definition,
        'valueKind',case definition.value_kind when 'set' then 'string_list'
          else definition.value_kind end,
        'effectiveValues',coalesce((select jsonb_agg(jsonb_build_object(
          'value',value_row.value,'origin',value_row.origin,'reason',value_row.reason,
          'sourceScopeKind',value_row.source_scope_kind,
          'studyUnitCount',value_row.study_unit_count
        ) order by value_row.value::text,value_row.origin nulls first,
          value_row.source_scope_kind nulls first)
          from parameter_value_rows value_row
          where value_row.parameter_id = definition.parameter_id),'[]'::jsonb)
      ) order by definition.ordinal)
      from private.course_design_parameter_definitions definition),'[]'::jsonb),
      'editorialDirections',coalesce((select jsonb_agg(jsonb_build_object(
        'direction',editorial.direction,'origin',editorial.origin,
        'sourceScopeKind',editorial.source_scope_kind,
        'studyUnitCount',editorial.study_unit_count
      ) order by editorial.direction nulls first,editorial.origin nulls first,
        editorial.source_scope_kind nulls first)
        from editorial_rows editorial),'[]'::jsonb),
      'wordCountsByStudyUnit',coalesce((select jsonb_agg(jsonb_build_object(
        'wordCount',word_count.word_count,
        'studyUnitCount',word_count.study_unit_count
      ) order by word_count.word_count)
        from word_count_rows word_count),'[]'::jsonb),

      'analysisUnits',coalesce((select jsonb_agg(jsonb_build_object(
        'position',analysis.position,'statement',analysis.statement,
        'introductionCount',coalesce((select count(*)::integer
          from introduction_rows introduction
          where introduction.analysis_id=analysis.analysis_id::text),0),
        'useCount',coalesce((select count(*)::integer
          from scope_units unit
          where coalesce(
            unit.design_application->'usedInstructionalAnalysisUnitIds',
            '[]'::jsonb
          ) ? analysis.analysis_id::text),0),
        'revisitCount',coalesce((select count(*)::integer
          from scope_units unit
          where not (coalesce(
              unit.design_application->'introducedInstructionalAnalysisUnitIds',
              '[]'::jsonb
            ) ? analysis.analysis_id::text)
            and exists(
              select 1 from jsonb_array_elements(coalesce(
                unit.design_application->'explanationApplications','[]'::jsonb
              )) explanation(value)
              where explanation.value->>'instructionalAnalysisUnitId'
                =analysis.analysis_id::text
            )),0)
      ) order by analysis.position)
        from authorized_analysis analysis),'[]'::jsonb),
'introductionsByStudyUnit',coalesce((select jsonb_agg(jsonb_build_object(
        'studyUnitRef',unit.entity_id,'position',unit.analytics_position,
        'title',unit.content->>'title','introducedCount',coalesce((
          select count(*)::integer from introduction_rows introduction
          where introduction.study_unit_id = unit.entity_id
        ),0)
      ) order by unit.analytics_position)
        from scope_units unit),'[]'::jsonb),
      'explanationForms',coalesce((select jsonb_agg(jsonb_build_object(
        'form',form.form,'studyUnitCount',form.study_unit_count,
        'applicationCount',form.application_count
      ) order by form.form)
        from (select explanation.form,
          count(distinct explanation.study_unit_id)::integer as study_unit_count,
          count(*)::integer as application_count
          from explanation_rows explanation group by explanation.form) form),'[]'::jsonb),
      'components',coalesce((select jsonb_agg(jsonb_build_object(
        'componentRef',component.component_ref,
        'studyUnitCount',component.study_unit_count,
        'instanceCount',component.instance_count
      ) order by component.component_ref)
        from (select instance.component_ref,
          count(distinct instance.study_unit_id)::integer as study_unit_count,
          count(*)::integer as instance_count
          from component_rows instance group by instance.component_ref) component),'[]'::jsonb),
      'practiceByRequirement',coalesce((select jsonb_agg(jsonb_build_object(
        'position',evidence.position,'statement',evidence.statement,
        'opportunityCount',coalesce((select count(distinct practice.opportunity_id)::integer
          from practice_rows practice
          where practice.evidence_id = evidence.evidence_id::text),0)
      ) order by evidence.position)
        from authorized_evidence evidence),'[]'::jsonb),
      'practiceVariationDimensions',coalesce((select jsonb_agg(jsonb_build_object(
        'dimension',variation.dimension,
        'opportunityCount',variation.opportunity_count
      ) order by variation.dimension)
        from (select item.dimension,
          count(distinct (item.evidence_id,item.opportunity_id))::integer
            as opportunity_count
          from variation_rows item group by item.dimension) variation),'[]'::jsonb),
      'sourcesByRole',coalesce((select jsonb_agg(jsonb_build_object(
        'role',source_role.role,'sourceCount',source_role.source_count,
        'anchorCount',source_role.anchor_count,
        'studyUnitCount',source_role.study_unit_count
      ) order by source_role.role)
        from source_role_rows source_role),'[]'::jsonb)
    ),
    'authorship',jsonb_build_object(
      'observations',jsonb_build_object(
        'createdCount',(select count(*)::integer from scope_annotations),
        'openCount',(select count(*)::integer from scope_annotations
          where state in('open','considered')),
        'resolvedCount',(select count(*)::integer from scope_annotations
          where state = 'resolved')
      ),
      'explicitParameterOverrideCount',(
        select count(*)::integer from relevant_parameter_assignments
      ),
      'manuallyRevisedStudyUnitCount',(
        select count(*)::integer from scope_units unit
        where unit.version > 1 and unit.last_revision_origin = 'human'
      ),
      'studyUnitsByOrigin',coalesce((select jsonb_agg(jsonb_build_object(
        'origin',change.origin,'createdCount',change.created_count,
        'lastRevisedCount',change.revised_count
      ) order by change.origin) from origin_changes change),'[]'::jsonb)
    ),
    'missingData',coalesce((select jsonb_agg(missing.message order by missing.message)
      from missing_rows missing),'[]'::jsonb),
    'deepLink',null
  ) into v_result;
  return v_result;
end;
$function$
;

-- One-time conversion of useful links in owner responses; no old writer remains.
create function pg_temp.source_response_links_302(p_course_id uuid,p_links jsonb) returns jsonb language plpgsql as $f$
declare result jsonb:='[]'; l jsonb; r jsonb;
begin
 for l in select value from jsonb_array_elements(p_links) loop
  if l-array['sourceId','relation','anchors']<>'{}'::jsonb or not(l ?& array['sourceId','relation','anchors']) then
   raise exception 'Shape anterior de vínculo em resposta desconhecido.' using errcode='55000'; end if;
  select default_roles into r from private.course_sources where course_id=p_course_id and source_id=l->>'sourceId';
  if not found then raise exception 'A resposta referencia uma fonte inexistente.' using errcode='55000'; end if;
  result:=result||jsonb_build_array(l||jsonb_build_object('linkId',extensions.gen_random_uuid()::text,'roles',r,'occurrences','[]'::jsonb));
 end loop;
 if not private.valid_course_source_links_shape_v2(result) then raise exception 'Conversão de vínculos inválida.' using errcode='55000'; end if;
 return result;
end $f$;
update private.course_anchored_annotations set owner_response_source_links=pg_temp.source_response_links_302(course_id,owner_response_source_links)
 where owner_response_source_links<>'[]'::jsonb;

alter table private.course_sources drop column authorship, drop column source_role;
alter table private.course_sources add constraint course_sources_metadata_v3 check(
 private.valid_course_source_document_v3(jsonb_build_object('kind',kind,'defaultRoles',default_roles,'title',title,'authors',authors,'publicationDate',publication_date,'identifier',identifier,'language',language,'citationMode',citation_mode,'citationText',citation_text,'bibliographic',bibliographic,'url',url,'editionOrVersion',edition_or_version,'origin',origin,'availability',availability,'verificationStatus',verification_status,'studyVisibility',study_visibility)) is true),
 add constraint course_sources_status_v3 check(status in('active','retired'));
alter table private.course_source_attribution_sources add constraint course_source_link_identity_shape_v1
 check(char_length(link_id) between 1 and 240 and link_id=btrim(link_id) and link_id!~'[[:cntrl:]]'
  and jsonb_typeof(roles)='array' and jsonb_array_length(roles)<=4 and roles<@'["curricular_scope","assessment_evidence","technical_conceptual","recommended_reading"]'::jsonb
  and jsonb_typeof(occurrences)='array' and jsonb_array_length(occurrences)<=16);
do $postflight$ begin
 if exists(select 1 from sources_before_302 old left join private.course_sources s using(course_id,source_id)
   where s.source_id is null or to_jsonb(s)-array['authors','default_roles','citation_mode','bibliographic']
      is distinct from old.original-array['authorship','source_role']
     or s.citation_mode<>'manual' or s.authors is distinct from case when old.original->>'authorship' is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('literal',old.original->>'authorship')) end
     or s.default_roles is distinct from case when old.original->>'source_role' is null then '[]'::jsonb else jsonb_build_array(old.original->>'source_role') end)
 then raise exception 'A migração alterou metadados existentes da fonte.' using errcode='55000'; end if;
 if exists(select 1 from links_before_302 old left join private.course_source_attribution_sources l using(course_id,attribution_id,source_ordinal)
   where l.source_id is distinct from old.source_id or l.relation is distinct from old.relation or l.link_id is null)
 then raise exception 'A migração alterou vínculos existentes.' using errcode='55000'; end if;
 if exists(select 1 from anchors_before_302 old left join private.course_source_anchors a using(course_id,anchor_id)
   where a.anchor_id is null or to_jsonb(a)-'content_hash' is distinct from old.original or a.content_hash is not null)
  or exists(select 1 from attachments_before_302 old left join private.course_source_attachments a using(course_id,source_id,content_hash)
   where a.content_hash is null or to_jsonb(a) is distinct from old.original)
 then raise exception 'A migração alterou âncoras ou identidade de arquivos existentes.' using errcode='55000'; end if;
end $postflight$;
do $manifest$ declare v jsonb; begin
 v:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260905101903');
 execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
  'select '||quote_literal(v::text)||'::jsonb');
end $manifest$;
notify pgrst,'reload schema';
commit;
