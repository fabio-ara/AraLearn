begin;

-- The semantic inspector sees the same focal context that invalidates its
-- report. Human review retains its existing, independent scope.
create function private.course_pedagogical_basis_v1(p_course_id uuid,p_target_kind text,p_target_id text)
returns jsonb language sql stable security definer set search_path=pg_catalog as $function$
  with recursive target as materialized (
    select * from private.course_entities where course_id=p_course_id and entity_id=p_target_id
      and entity_type=case p_target_kind when 'study_unit' then 'study_unit'
        when 'microsequence_explanation' then 'microsequence' end
  ), micro as materialized (
    select m.* from private.course_entities m join target t on m.entity_id=
      case when t.entity_type='microsequence' then t.entity_id else t.parent_id end
      where m.course_id=p_course_id and m.entity_type='microsequence'
  ), dependencies(id) as (
    select entity_id from micro
    union select d.value from dependencies s join private.course_entities e on e.course_id=p_course_id
      and e.entity_type='microsequence' and e.entity_id=s.id
      cross join lateral jsonb_array_elements_text(coalesce(e.content->'dependsOn','[]')) d(value)
  ), units as materialized (
    select u.* from private.course_entities u where u.course_id=p_course_id and u.entity_type='study_unit'
      and u.parent_id in(select entity_id from micro)
  ), item_ids(id) as (
    select a.plan_item_id::text from private.course_design_target_plan_items a where a.course_id=p_course_id
      and a.didactic_microsequence_id in(select id from dependencies)
    union select p.value->>'evidenceRequirementId' from units u cross join lateral
      jsonb_array_elements(coalesce(u.design_application->'practiceApplications','[]')) p(value)
  ), citation_targets(kind,id,title) as (
    select 'microsequence_explanation',e.entity_id,e.content->>'title' from private.course_entities e
      where e.course_id=p_course_id and e.entity_type='microsequence' and e.entity_id in(select id from dependencies)
    union all select 'study_unit',entity_id,content->>'title' from units
      where p_target_kind='microsequence_explanation' or entity_id=p_target_id
    union all select 'plan_item',i.id::text,i.statement from private.course_instructional_plan_items i
      where i.course_id=p_course_id and i.id::text in(select id from item_ids)
  ), citations as materialized (
    select a.*,t.title,private.course_source_links_v1(p_course_id,a.id) links
      from private.course_source_attributions a join citation_targets t on t.kind=a.target_kind and t.id=a.target_id
      where a.course_id=p_course_id
  ) select case when exists(select 1 from target) then jsonb_build_object(
    'targetKind',p_target_kind,'targetId',p_target_id,
    'audience',(select audience from private.course_instructional_plans where course_id=p_course_id),
    'microsequence',(select jsonb_build_object('id',entity_id,'title',content->'title','goal',content->'goal',
      'explanationPlan',content->'explanationPlan','explanation',content->'explanation') from micro),
    'planItems',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'kind',i.item_kind,
      'statement',i.statement,'description',i.description) order by i.item_kind,i.id)
      from private.course_instructional_plan_items i where i.course_id=p_course_id and i.id::text in(select id from item_ids)),'[]'),
    'dependencies',coalesce((select jsonb_agg(jsonb_build_object('title',e.content->'title','goal',e.content->'goal',
      'explanation',e.content->'explanation') order by e.entity_id) from private.course_entities e
      where e.course_id=p_course_id and e.entity_type='microsequence' and e.entity_id in(select id from dependencies)
      and e.entity_id not in(select entity_id from micro)),'[]'),
    'citations',coalesce((select jsonb_agg(jsonb_build_object(
      'targetKind',c.target_kind,'targetId',c.target_id,'targetTitle',c.title,
      'links',coalesce((select jsonb_agg(l.value||jsonb_build_object(
        'source',coalesce((select jsonb_build_object('title',s.title,'citationText',s.citation_text,
          'url',s.url,'status',s.status,'verificationStatus',s.verification_status)
          from private.course_sources s where s.course_id=p_course_id and s.source_id=l.value->>'sourceId'),
          jsonb_build_object('located',false)),
        'anchors',coalesce((select jsonb_agg(coalesce((select jsonb_build_object(
          'status',a.status,'selector',a.selector,'humanLocator',a.human_locator,
          'verificationExcerpt',a.verification_excerpt,
          'needsReverification',a.selector->>'kind' in('page_range','text_quote') and exists(
            select 1 from private.course_source_attachments active_pdf
              join private.course_source_attachments removed_pdf on removed_pdf.course_id=active_pdf.course_id
                and removed_pdf.source_id=active_pdf.source_id and removed_pdf.status='removed'
                and removed_pdf.content_hash<>active_pdf.content_hash
              where active_pdf.course_id=p_course_id and active_pdf.source_id=a.source_id and active_pdf.status='active'))
          from private.course_source_anchors a where a.course_id=p_course_id
            and a.source_id=l.value->>'sourceId' and a.anchor_id=r.value->>'anchorId'),
          jsonb_build_object('located',false)) order by r.ordinal)
          from jsonb_array_elements(coalesce(l.value->'anchors','[]')) with ordinality r(value,ordinal)),'[]'))
        order by l.ordinal) from jsonb_array_elements(c.links) with ordinality l(value,ordinal)),'[]'))
      order by c.target_kind,c.target_id) from citations c),'[]'),
    'studyUnits',coalesce((select jsonb_agg(jsonb_build_object('id',entity_id,'content',content,
      'application',design_application,'design',design_snapshot-'appliedAt')
      order by (content->>'position')::integer,entity_id) from units),'[]')) end
$function$;

create or replace function private.course_ai_inspection_basis_hash_v1(p_course_id uuid,p_target_kind text,p_target_id text)
returns text language sql stable security definer set search_path=pg_catalog as $function$
  select case when private.course_content_basis_hash_v1(p_course_id,p_target_kind,p_target_id) is not null
    then private.course_source_json_hash_v1(jsonb_build_object(
      'contentBasis',private.course_content_basis_hash_v1(p_course_id,p_target_kind,p_target_id),
      'pedagogicalBasis',private.course_pedagogical_basis_v1(p_course_id,p_target_kind,p_target_id),
      'bibliographyStyle',case when exists(select 1 from private.course_source_attributions a
        join private.course_source_attribution_sources l on l.course_id=a.course_id and l.attribution_id=a.id
        where a.course_id=p_course_id and a.target_kind=p_target_kind and a.target_id=p_target_id)
        then (select bibliography_style from public.courses where id=p_course_id) end)) end
$function$;

create or replace function private.course_ai_inspection_payload_v1(p_course_id uuid,p_target_kind text,p_target_id text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $function$
declare state jsonb; revision bigint;
begin
  state:=private.course_ai_inspection_state_v1(p_course_id,p_target_kind,p_target_id);
  if state is null then raise exception 'Objeto de inspeção não encontrado.' using errcode='22023'; end if;
  select c.revision into revision from public.courses c where c.id=p_course_id;
  return jsonb_build_object('contract','aralearn.course-ai-inspection.v1','courseId',p_course_id,
    'courseRevision',revision,'targetKind',p_target_kind,'targetId',p_target_id,'basisHash',state->'basisHash','inspection',state,
    'pedagogicalBasis',private.course_pedagogical_basis_v1(p_course_id,p_target_kind,p_target_id));
end $function$;

-- Quotes ground a judgment; matching a quote does not certify that judgment.
create function private.course_pedagogical_report_grounded_v1(p_report jsonb,p_basis jsonb)
returns boolean language sql immutable set search_path=pg_catalog as $function$
  select p_basis is not null and not exists(
    select 1 from jsonb_array_elements(p_report->'checks') c(value)
      cross join lateral jsonb_array_elements_text(c.value->'evidence') q(quote)
    where not exists(select 1 from jsonb_path_query(p_basis,'strict $.** ? (@.type() == "string")') s(value)
      where position(lower(regexp_replace(btrim(normalize(q.quote)), '\s+', ' ', 'g')) in
        lower(regexp_replace(btrim(normalize(s.value#>>'{}')), '\s+', ' ', 'g')))>0))
$function$;

do $ground_report$
declare definition text; fragment text := 'select ai_inspection into previous from private.course_entities';
begin
  definition:=pg_get_functiondef('private.record_course_ai_inspection_v1(uuid,uuid,text,text,text,jsonb,text)'::regprocedure);
  if position(fragment in definition)=0 then raise exception 'Comando precursor de inspeção não encontrado.'; end if;
  execute replace(definition,fragment,
    'if not private.course_pedagogical_report_grounded_v1(p_report,payload->''pedagogicalBasis'') then
       raise exception ''O parecer precisa citar trechos da base pedagógica lida.'' using errcode=''22023'';
     end if;
     '||fragment);
end $ground_report$;

create or replace function private.course_ai_inspection_pending_v1(p_course_id uuid,p_target_kind text,p_target_id text)
returns boolean language sql stable security definer set search_path=pg_catalog as $function$
  select coalesce(s->>'state'<>'current' or s#>>'{report,outcome}'<>'consistent'
    or not coalesce(private.valid_course_ai_inspection_report_v1(s->'report'),false),true)
  from (select private.course_ai_inspection_state_v1(p_course_id,p_target_kind,p_target_id) s) state
$function$;

revoke all on function private.course_pedagogical_basis_v1(uuid,text,text),
  private.course_pedagogical_report_grounded_v1(jsonb,jsonb) from public,anon,authenticated,service_role;

commit;
