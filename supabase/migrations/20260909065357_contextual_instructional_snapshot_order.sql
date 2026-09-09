begin;

-- A ordem do snapshot segue o mesmo position/id usado pela leitura e pela
-- materialização. Identidades não são uma ordem pedagógica alternativa.
do $instructional_snapshot_order$
declare definition text; old_fragment text; new_fragment text; kind text;
begin
  select replace(pg_get_functiondef('public.apply_course_design_command_for_actor_v3(uuid,uuid,bigint,jsonb,text,text,text)'::regprocedure),E'\r\n',E'\n') into definition;
  foreach kind in array array['instructional_analysis_unit','evidence_requirement'] loop
    old_fragment:=format($old$coalesce((select jsonb_agg(plan_item_id order by plan_item_id) from private.course_design_target_plan_items
         where course_id=p_course_id and didactic_microsequence_id=target and plan_item_kind=%L),'[]'::jsonb)$old$,kind);
    new_fragment:=format($new$coalesce((select jsonb_agg(a.plan_item_id order by i.position,i.id)
         from private.course_design_target_plan_items a join private.course_instructional_plan_items i
           on i.course_id=a.course_id and i.id=a.plan_item_id and i.item_kind=a.plan_item_kind
         where a.course_id=p_course_id and a.didactic_microsequence_id=target and a.plan_item_kind=%L),'[]'::jsonb)$new$,kind);
    if position(old_fragment in definition)=0 then raise exception 'O escritor instrucional corrente divergiu no snapshot de %.',kind; end if;
    definition:=replace(definition,old_fragment,new_fragment);
  end loop;
  execute definition;
end $instructional_snapshot_order$;

do $manifest$
declare manifest jsonb;
begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260909065357');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
commit;
