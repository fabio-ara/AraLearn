begin;

-- A declaração de aplicações de unidades existentes passa a aceitar um lote
-- atômico de unidades de várias microssequências do mesmo curso. A guarda de
-- "introdução anterior no curso" valida o curso inteiro, mas o comando cobria
-- uma única microssequência: quando duas microssequências perdiam a introdução
-- na mesma correção de prosa, nenhuma ordem de comandos passava. O escopo
-- 'course' localiza cada unidade pela própria identidade no curso e conserva o
-- escopo 'didactic_microsequence' corrente, em que as unidades pertencem ao
-- alvo. O escopo de curso vale somente para set_study_unit_applications: a
-- configuração não tem consumidor humano para o lote e segue exigindo a
-- microssequência. A validação pedagógica passa a observar as microssequências
-- presentes no lote, como antes observava a única microssequência do recorte.
do $course_scope_applications$
declare definition text; marker_start text; marker_end text;
        start_position integer; end_position integer;
        old_block text; new_block text;
begin
  select replace(pg_get_functiondef(
    'public.apply_course_design_command_for_actor_v3(uuid,uuid,bigint,jsonb,text,text,text)'::regprocedure),
    E'\r\n',E'\n') into definition;

  marker_start:=$m$   if p_command#>>'{scope,kind}'<>'didactic_microsequence' or p_command-array['type','scope','expectedPlanVersion','units']<>'{}'::jsonb$m$;
  marker_end:=$m$then raise exception 'O uso ou desenvolvimento precisa conservar sua introdução anterior no curso.' using errcode='23514'; end if;$m$;
  start_position:=position(marker_start in definition);
  if start_position=0 then
    raise exception 'O escritor instrucional corrente divergiu na declaração de aplicações.';
  end if;
  end_position:=position(marker_end in definition);
  if end_position=0 then
    raise exception 'O escritor instrucional corrente divergiu na guarda de introdução.';
  end if;
  end_position:=end_position+length(marker_end)-1;
  old_block:=substr(definition,start_position,end_position-start_position+1);
  new_block:=old_block;

  -- 1. O escopo aceito passa a incluir 'course', com o próprio curso como alvo.
  new_block:=replace(new_block,marker_start,
    $n$   if p_command#>>'{scope,kind}' not in('didactic_microsequence','course')
     or (p_command#>>'{scope,kind}'='course'
       and (command_type<>'set_study_unit_applications' or target<>p_course_id::text))
     or p_command-array['type','scope','expectedPlanVersion','units']<>'{}'::jsonb$n$);

  -- 2. No escopo de curso, a unidade é localizada pela identidade, sem exigir
  --    que ela pertença ao alvo do comando.
  new_block:=replace(new_block,
    $u$     select * into unit from private.course_entities where course_id=p_course_id and entity_type='study_unit'
       and entity_id=entry->>'studyUnitId' and parent_id=target for update;$u$,
    $u$     if p_command#>>'{scope,kind}'='course' then
       select * into unit from private.course_entities where course_id=p_course_id and entity_type='study_unit'
         and entity_id=entry->>'studyUnitId' for update;
     else
       select * into unit from private.course_entities where course_id=p_course_id and entity_type='study_unit'
         and entity_id=entry->>'studyUnitId' and parent_id=target for update;
     end if;$u$);

  -- 3. Cada unidade declara a própria microssequência; no escopo de uma
  --    microssequência ela continua sendo o alvo.
  new_block:=replace(new_block,$s$'didacticMicrosequenceId',target,$s$,$s$'didacticMicrosequenceId',unit.parent_id,$s$);
  new_block:=replace(new_block,$s$didactic_microsequence_id=target$s$,$s$didactic_microsequence_id=unit.parent_id$s$);

  -- 4. A validação pedagógica cobre as microssequências efetivamente
  --    declaradas no lote, sem ampliar nem reduzir o conjunto de unidades.
  new_block:=replace(new_block,
    $a$       and e.parent_id=target and e.design_application is not null;$a$,
    $a$       and e.design_application is not null and e.parent_id in(
         select distinct parent.parent_id from private.course_entities parent
         where parent.course_id=p_course_id and parent.entity_type='study_unit'
           and parent.entity_id in(select batch.value->>'studyUnitId'
             from jsonb_array_elements(p_command->'units') batch));$a$);

  if position($s$didactic_microsequence_id=target$s$ in new_block)>0
    or position($s$'didacticMicrosequenceId',target,$s$ in new_block)>0 then
    raise exception 'O escritor instrucional corrente divergiu no escopo de curso.';
  end if;
  if position($s$didactic_microsequence_id=unit.parent_id$s$ in new_block)=0
    or position($s$'didacticMicrosequenceId',unit.parent_id,$s$ in new_block)=0
    or position($s$not in('didactic_microsequence','course')$s$ in new_block)=0
    or position($s$if p_command#>>'{scope,kind}'='course' then$s$ in new_block)=0
    or position($s$e.design_application is not null and e.parent_id in($s$ in new_block)=0 then
    raise exception 'O escritor instrucional corrente divergiu nas substituições de escopo.';
  end if;

  execute replace(definition,old_block,new_block);
end $course_scope_applications$;

do $manifest$
declare manifest jsonb:=public.get_aralearn_runtime_manifest();
begin
  if manifest->>'schemaRevision' is distinct from '20261015021933' then
    manifest:=manifest||jsonb_build_object('schemaRevision','20261015021933',
      'features',(select jsonb_agg(value order by value collate "C") from jsonb_array_elements_text(
        (manifest->'features')||'["contextual-design-course-scope-applications-v1"]'::jsonb)));
    execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
      'select '||quote_literal(manifest::text)||'::jsonb');
  end if;
end $manifest$;

notify pgrst,'reload schema';
commit;
