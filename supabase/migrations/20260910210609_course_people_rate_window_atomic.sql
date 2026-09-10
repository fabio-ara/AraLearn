begin;
set local lock_timeout='5s';
set local statement_timeout='5min';

-- A renovação conserva a CHECK temporal em cada instrução, sob o lock do ator.
-- Busca e concessão mantêm os limites e contadores separados já existentes.
create or replace function private.consume_course_people_rate_v1(p_actor_id uuid,p_search boolean)
returns boolean language plpgsql security definer set search_path=pg_catalog,private as $function$
declare v_rate private.course_access_grant_rate_limits%rowtype; v_now timestamptz:=statement_timestamp();
begin
  perform pg_advisory_xact_lock(hashtextextended('course-access-grant-rate:'||p_actor_id::text,0));
  insert into private.course_access_grant_rate_limits(actor_id,window_started_at,last_attempt_at)
    values(p_actor_id,v_now,v_now) on conflict(actor_id) do nothing;
  update private.course_access_grant_rate_limits set window_started_at=v_now,last_attempt_at=v_now,
    attempt_count=0,search_attempt_count=0,granted_count=0,no_match_count=0,unchanged_count=0,rate_limited_count=0
    where actor_id=p_actor_id and window_started_at<=v_now-interval '10 minutes';
  update private.course_access_grant_rate_limits set
    attempt_count=attempt_count+case when p_search then 0 else 1 end,
    search_attempt_count=search_attempt_count+case when p_search then 1 else 0 end,last_attempt_at=v_now
    where actor_id=p_actor_id returning * into v_rate;
  return case when p_search then v_rate.search_attempt_count<=60 else v_rate.attempt_count<=10 end;
end $function$;

do $manifest$
declare manifest jsonb;
begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260910210609');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
commit;
