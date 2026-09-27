-- A primeira Parte de produção pode ser organizada e materializada com o mapa em
-- rascunho quando o processo validado no servidor autoriza a autonomia do curso.
-- O padrão continua exigindo aprovação e nenhuma aprovação é gravada.
begin;

do $autonomia$
declare definition text; before_fragment text; after_fragment text; ocorrencias integer;
begin
  select replace(pg_get_functiondef(
    'public.save_course_authoring_part_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,text,text)'::regprocedure
  ),E'\r\n',E'\n') into definition;
  before_fragment:='p_request_hash text)';
  ocorrencias:=(length(definition)-length(replace(definition,before_fragment,'')))/length(before_fragment);
  if ocorrencias<>1 then
    raise exception 'Assinatura da Parte divergiu.' using errcode='55000';
  end if;
  definition:=replace(definition,before_fragment,
    'p_request_hash text, p_allow_draft_map boolean default false)');
  before_fragment:=$gate$  if v_plan.curriculum_map_status<>'approved' then
    raise exception 'A producao so pode ser organizada depois da aprovacao do mapa curricular.'
      using errcode='23514';
  end if;$gate$;
  after_fragment:=$gate$  if v_plan.curriculum_map_status is distinct from 'approved' and p_allow_draft_map is not true then
    raise exception 'A producao so pode ser organizada depois da aprovacao do mapa curricular.'
      using errcode='23514';
  end if;$gate$;
  ocorrencias:=(length(definition)-length(replace(definition,before_fragment,'')))/length(before_fragment);
  if ocorrencias<>1 then
    raise exception 'Gate da Parte divergiu.' using errcode='55000';
  end if;
  definition:=replace(definition,before_fragment,after_fragment);
  execute definition;
  drop function public.save_course_authoring_part_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,text,text);

  select replace(pg_get_functiondef(
    'public.materialize_course_authoring_part_for_actor_v2(uuid,uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,jsonb,boolean,jsonb)'::regprocedure
  ),E'\r\n',E'\n') into definition;
  before_fragment:='p_placements jsonb)';
  ocorrencias:=(length(definition)-length(replace(definition,before_fragment,'')))/length(before_fragment);
  if ocorrencias<>1 then
    raise exception 'Assinatura do materializador divergiu.' using errcode='55000';
  end if;
  definition:=replace(definition,before_fragment,
    'p_placements jsonb, p_allow_draft_map boolean default false)');
  before_fragment:=$gate$  if v_plan.curriculum_map_status<>'approved' then
    raise exception 'O mapa curricular precisa estar aprovado antes da materializacao.'
      using errcode='23514';
  end if;$gate$;
  after_fragment:=$gate$  if v_plan.curriculum_map_status is distinct from 'approved' and p_allow_draft_map is not true then
    raise exception 'O mapa curricular precisa estar aprovado antes da materializacao.'
      using errcode='23514';
  end if;$gate$;
  ocorrencias:=(length(definition)-length(replace(definition,before_fragment,'')))/length(before_fragment);
  if ocorrencias<>1 then
    raise exception 'Gate do materializador divergiu.' using errcode='55000';
  end if;
  definition:=replace(definition,before_fragment,after_fragment);
  execute definition;
  drop function public.materialize_course_authoring_part_for_actor_v2(uuid,uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,jsonb,boolean,jsonb);

end $autonomia$;

revoke all on function
  public.save_course_authoring_part_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,text,text,boolean),
  public.materialize_course_authoring_part_for_actor_v2(uuid,uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,jsonb,boolean,jsonb,boolean)
  from public,anon,authenticated,service_role;
grant execute on function
  public.save_course_authoring_part_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,text,text,boolean),
  public.materialize_course_authoring_part_for_actor_v2(uuid,uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,jsonb,boolean,jsonb,boolean)
  to service_role;

notify pgrst,'reload schema';
commit;
