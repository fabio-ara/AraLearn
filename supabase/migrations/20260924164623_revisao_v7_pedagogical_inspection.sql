begin;

-- The existing protected report remains the second barrier. A current report
-- with unresolved findings must not release the author's observation decision.
create or replace function private.course_ai_inspection_pending_v1(p_course_id uuid,p_target_kind text,p_target_id text)
returns boolean language sql stable security definer set search_path=pg_catalog as $function$
  select coalesce(s->>'state'='pending' or s->>'state'='current' and
    (s#>>'{report,outcome}'<>'consistent' or not (s->'report' ? 'checks')),false)
  from (select private.course_ai_inspection_state_v1(p_course_id,p_target_kind,p_target_id) s) state
$function$;

create or replace function private.valid_course_ai_inspection_report_v1(p_report jsonb)
returns boolean language plpgsql immutable set search_path=pg_catalog as $function$
declare item jsonb; check_item jsonb; quote jsonb; dimensions text[] := '{}';
begin
  if jsonb_typeof(p_report) is distinct from 'object' or
    not p_report ?& array['summary','outcome','findings','checks'] or
    p_report-array['summary','outcome','findings','checks']<>'{}'::jsonb or
    jsonb_typeof(p_report->'summary') is distinct from 'string' or
    char_length(btrim(p_report->>'summary')) not between 1 and 2000 or
    p_report->>'summary' ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' or
    jsonb_typeof(p_report->'outcome') is distinct from 'string' or
    p_report->>'outcome' not in('consistent','needs_attention','human_preference_retained') or
    jsonb_typeof(p_report->'findings') is distinct from 'array' or
    jsonb_typeof(p_report->'checks') is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_report->'findings')>20 or jsonb_array_length(p_report->'checks')<>5 or
    p_report->>'outcome'='needs_attention' and jsonb_array_length(p_report->'findings')=0 or
    p_report->>'outcome'='consistent' and jsonb_array_length(p_report->'findings')<>0 then return false; end if;
  for item in select value from jsonb_array_elements(p_report->'findings') loop
    if jsonb_typeof(item)<>'string' or char_length(btrim(item#>>'{}')) not between 1 and 1000 or
      item#>>'{}' ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' then return false; end if;
  end loop;
  for check_item in select value from jsonb_array_elements(p_report->'checks') loop
    if jsonb_typeof(check_item)<>'object' or not check_item ?& array['dimension','result','reason','evidence'] or
      check_item-array['dimension','result','reason','evidence']<>'{}'::jsonb or
      jsonb_typeof(check_item->'dimension') is distinct from 'string' or
      check_item->>'dimension' not in('alignment','evidence','representation','feedback','sufficiency') or
      check_item->>'dimension'=any(dimensions) or
      jsonb_typeof(check_item->'result') is distinct from 'string' or
      check_item->>'result' not in('sufficient','insufficient','not_applicable') or
      jsonb_typeof(check_item->'reason')<>'string' or char_length(btrim(check_item->>'reason')) not between 1 and 1000 or
      check_item->>'reason' ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' or
      jsonb_typeof(check_item->'evidence') is distinct from 'array' then return false; end if;
    if check_item->>'result'='insufficient' and p_report->>'outcome'<>'needs_attention' or
      jsonb_array_length(check_item->'evidence') not between 1 and 6 then return false; end if;
    for quote in select value from jsonb_array_elements(check_item->'evidence') loop
      if jsonb_typeof(quote)<>'string' or char_length(btrim(quote#>>'{}')) not between 1 and 500 or
        quote#>>'{}' ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' then return false; end if;
    end loop;
    dimensions:=array_append(dimensions,check_item->>'dimension');
  end loop;
  return true;
end $function$;

revoke all on function private.valid_course_ai_inspection_report_v1(jsonb),
  private.course_ai_inspection_pending_v1(uuid,text,text) from public,anon,authenticated,service_role;

commit;
