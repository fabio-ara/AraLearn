-- A política explícita de arquivo controla o PDF público; a visibilidade
-- editorial continua controlando a apresentação da referência e de sua URL.
begin;

create or replace function private.can_read_course_file_v1(p_course_id uuid,p_actor_id uuid,p_source_id text,p_content_hash text)
returns boolean language sql stable security definer set search_path=pg_catalog,public,private as $function$
  select coalesce((select c.owner_id=p_actor_id
    or (c.visibility='private' and s.study_visibility='citation_and_link'
      and private.course_ownership_v1(c.id,p_actor_id)='shared')
    or (c.visibility='public' and coalesce(nullif(a.public_file_access,'inherit'),
      nullif(s.public_file_access,'inherit'),c.public_file_access)='available')
    from public.courses c join private.course_sources s on s.course_id=c.id
    join private.course_source_attachments a on a.course_id=s.course_id and a.source_id=s.source_id and a.source_revision=s.revision
    where c.id=p_course_id and s.source_id=p_source_id and a.content_hash=p_content_hash
      and s.status='active' and a.status='active'),false);
$function$;

do $migration$
declare v_manifest jsonb;
begin
  v_manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260905071622');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(v_manifest::text)||'::jsonb');
end $migration$;
commit;
