begin;

-- The declaration stays inside the existing explanation and remains readable
-- when its basis is stale. Saving prose never certifies materialization readiness.
create function private.valid_explanation_reconciliation_v1(v jsonb) returns boolean
language plpgsql immutable set search_path=pg_catalog as $function$
declare entry jsonb; ids jsonb; id jsonb; locator jsonb;
begin
  if jsonb_typeof(v) is distinct from 'object' or v-array['contract','contentBasis','entries']<>'{}'::jsonb
    or not(v ?& array['contract','contentBasis','entries'])
    or v->>'contract' is distinct from 'aralearn.explanation-reconciliation.v1'
    or jsonb_typeof(v->'contentBasis') is distinct from 'string' or v->>'contentBasis'!~'^[a-f0-9]{64}$'
    or jsonb_typeof(v->'entries') is distinct from 'array' or octet_length(v::text)>1572864 then return false; end if;
  if jsonb_array_length(v->'entries') not between 1 and 512 then return false; end if;
  for entry in select value from jsonb_array_elements(v->'entries') loop
    if jsonb_typeof(entry) is distinct from 'object'
      or not(entry ?& array['resourceId','path','quote','prefix','suffix','role','analysisUnitIds','evidenceRequirementIds','destinationMicrosequenceId','reason'])
      or entry-array['resourceId','path','quote','prefix','suffix','role','analysisUnitIds','evidenceRequirementIds','destinationMicrosequenceId','reason']<>'{}'::jsonb
      or jsonb_typeof(entry->'role') is distinct from 'string'
      or entry->>'role' not in('introduced','established','revisited','preview','example','support','deferred')
      or jsonb_typeof(entry->'reason') is distinct from 'string' or char_length(btrim(entry->>'reason')) not between 1 and 4000
      or translate(entry->>'reason',E'\n\r\t','')~'[[:cntrl:]]' then return false; end if;
    locator:=(entry-array['role','analysisUnitIds','evidenceRequirementIds','destinationMicrosequenceId','reason'])
      ||jsonb_build_object('occurrenceId','reconciliation','slot','content');
    -- Reuse the established locator grammar and Unicode limits, including the
    -- accessible representation path '$', rather than inventing another identity.
    if not private.valid_course_source_links_shape_v2(jsonb_build_array(jsonb_build_object(
      'linkId','reconciliation','sourceId','reconciliation','relation','informed_by','roles','[]'::jsonb,
      'anchors','[]'::jsonb,'occurrences',jsonb_build_array(locator)))) then return false; end if;
    foreach ids in array array[entry->'analysisUnitIds',entry->'evidenceRequirementIds'] loop
      if jsonb_typeof(ids) is distinct from 'array' then return false; end if;
      if jsonb_array_length(ids)>64 or (select count(*)<>count(distinct value) from jsonb_array_elements(ids)) then return false; end if;
      for id in select value from jsonb_array_elements(ids) loop
        if jsonb_typeof(id) is distinct from 'string' or char_length(id#>>'{}') not between 1 and 300
          or id#>>'{}'<>btrim(id#>>'{}') or id#>>'{}'~'[[:cntrl:]]' then return false; end if;
      end loop;
    end loop;
    id:=entry->'destinationMicrosequenceId';
    if id<>'null'::jsonb and (jsonb_typeof(id) is distinct from 'string' or char_length(id#>>'{}') not between 1 and 300
      or id#>>'{}'<>btrim(id#>>'{}') or id#>>'{}'~'[[:cntrl:]]') then return false; end if;
    if entry->>'role' in('introduced','established','revisited') and jsonb_array_length(entry->'analysisUnitIds')=0 then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $function$;

create or replace function private.valid_course_explanation_v1(p_explanation jsonb) returns boolean
language plpgsql stable security definer set search_path=pg_catalog,private as $function$
begin
  if jsonb_typeof(p_explanation) is distinct from 'object'
    or p_explanation-array['title','content','reconciliation']<>'{}'::jsonb
    or jsonb_typeof(p_explanation->'title') is distinct from 'string'
    or char_length(btrim(p_explanation->>'title')) not between 1 and 300
    or jsonb_typeof(p_explanation->'content') is distinct from 'array'
    or p_explanation ? 'reconciliation' and not private.valid_explanation_reconciliation_v1(p_explanation->'reconciliation') then return false; end if;
  return jsonb_array_length(p_explanation->'content')>0 and octet_length(p_explanation::text)<=1572864
    and private.valid_course_component_refs_in_content_v1(p_explanation)
    and not exists(select 1 from jsonb_array_elements(p_explanation->'content') b
      where jsonb_typeof(b) is distinct from 'object' or not(b ?& array['id','package','version','data'])
        or b-array['id','package','version','data']<>'{}'::jsonb
        or jsonb_typeof(b->'data') is distinct from 'object'
        or jsonb_typeof(b->'id') is distinct from 'string' or nullif(btrim(b->>'id'),'') is null
        or b->>'package' not like 'aralearn.resource.%')
    and (select count(*)=count(distinct b->>'id') from jsonb_array_elements(p_explanation->'content') b);
end $function$;

revoke all on function private.valid_explanation_reconciliation_v1(jsonb),private.valid_course_explanation_v1(jsonb)
  from public,anon,authenticated,service_role;
commit;
