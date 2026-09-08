begin;

-- Leitura restrita à escolha da origem: não reativa os wrappers de Estudo
-- retirados da API de autoria e não amplia a autorização para copiar.
create function public.list_copyable_courses_for_actor_v1(
  p_actor_id uuid,p_query text default null,p_limit integer default 24,
  p_before_updated_at timestamptz default null,p_before_id uuid default null,
  p_course_id uuid default null
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,private as $function$
declare v_items jsonb; v_more boolean; v_cursor jsonb;
begin
  perform private.require_service_role();
  if p_actor_id is null or not exists(select 1 from public.person_profiles where user_id=p_actor_id) then
    raise exception 'Perfil de pessoa obrigatório.' using errcode='42501';
  end if;
  if p_limit is null or p_limit not between 1 and 50
    or ((p_before_updated_at is null)<>(p_before_id is null))
    or (p_query is not null and char_length(btrim(p_query))>120) then
    raise exception 'Consulta de cursos inválida.' using errcode='22023';
  end if;
  with candidates as materialized (
    select c.id,c.updated_at from public.courses c
    join private.course_instructional_plans p on p.course_id=c.id
    where private.can_copy_course_v1(c.id,p_actor_id)
      and (p_course_id is null or c.id=p_course_id)
      and (nullif(btrim(p_query),'') is null or lower(c.title||' '||c.goal) like '%'||lower(btrim(p_query))||'%')
      and (p_before_updated_at is null or (c.updated_at,c.id)<(p_before_updated_at,p_before_id))
    order by c.updated_at desc,c.id desc limit p_limit+1
  ), page as materialized (
    select * from candidates order by updated_at desc,id desc limit p_limit
  )
  select coalesce(jsonb_agg(private.course_list_projection_v2(id,p_actor_id) order by updated_at desc,id desc),'[]'::jsonb),
    (select count(*)>p_limit from candidates),
    case when (select count(*)>p_limit from candidates) then
      (select jsonb_build_object('beforeUpdatedAt',updated_at,'beforeId',id) from page order by updated_at,id limit 1)
    end into v_items,v_more,v_cursor from page;
  return jsonb_build_object('contract','aralearn.course-list.v2','items',v_items,'hasMore',v_more,'nextCursor',v_cursor);
end $function$;
revoke all on function public.list_copyable_courses_for_actor_v1(uuid,text,integer,timestamptz,uuid,uuid) from public,anon,authenticated;
grant execute on function public.list_copyable_courses_for_actor_v1(uuid,text,integer,timestamptz,uuid,uuid) to service_role;
comment on function public.list_copyable_courses_for_actor_v1(uuid,text,integer,timestamptz,uuid,uuid) is
  'Escolha de origem copiável pelo ator autenticado pela Edge. Reutiliza projeção e autorização; filtra antes da paginação e não concede edição do curso alheio.';

do $manifest$
declare manifest jsonb;
begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260908105357');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L','select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
notify pgrst,'reload schema';
commit;
