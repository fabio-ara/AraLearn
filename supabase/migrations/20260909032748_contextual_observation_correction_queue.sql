-- A fila usa as observações existentes: identidade, versão e pendências não
-- expiram. O recibo de composição guarda somente as associações e hashes.
-- Seus 14 dias de recuperação não viram prazo para consumir a observação.
begin;

do $targets$
declare definition text; original text; signature text;
begin
  foreach signature in array array[
    'private.valid_course_annotation_path_v2(jsonb)',
    'private.get_course_anchored_annotations_core_v1(uuid,uuid,bigint,bigint,text,text[],text[],text[],text[],boolean,text[],text,text,boolean,uuid,text,integer,boolean)'
  ] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    original:=definition;
    definition:=replace(definition,'''didactic_microsequence'',','''didactic_microsequence'',''microsequence_explanation'',');
    if definition=original then raise exception 'Enum de alvo não encontrado: %',signature; end if;
    execute definition;
  end loop;

  definition:=pg_get_functiondef('private.course_annotation_target_snapshot_v1(uuid,text,text)'::regprocedure);
  original:=definition;
  definition:=replace(definition,'when ''didactic_microsequence'' then ''microsequence''',
    'when ''didactic_microsequence'' then ''microsequence'' when ''microsequence_explanation'' then ''microsequence''');
  if definition=original then raise exception 'Snapshot da Explicação não foi integrado.'; end if;
  execute definition;

  definition:=pg_get_functiondef('private.course_anchored_annotation_item_v1(private.course_anchored_annotations,uuid,boolean)'::regprocedure);
  original:=definition;
  definition:=replace(definition,'when p_annotation.target_kind=''didactic_microsequence'' then',
    'when p_annotation.target_kind in(''didactic_microsequence'',''microsequence_explanation'') then');
  definition:=replace(definition,'''canWithdraw'',coalesce(',
    '''canWithdraw'',not (p_annotation.origin=''author'' and p_annotation.target_kind in(''study_unit'',''microsequence_explanation'')) and coalesce(');
  definition:=replace(definition,'''canResolve'',p_viewer_is_owner',
    '''canResolve'',not (p_annotation.origin=''author'' and p_annotation.target_kind in(''study_unit'',''microsequence_explanation'')) and p_viewer_is_owner');
  if definition=original or position('''canWithdraw'',not' in definition)=0 or position('''canResolve'',not' in definition)=0 then
    raise exception 'Capacidades da fila não foram integradas.'; end if;
  execute definition;

  definition:=pg_get_functiondef('private.execute_course_anchored_annotation_command_core_v1(uuid,uuid,bigint,jsonb,text,text,text,boolean)'::regprocedure);
  original:=definition;
  definition:=replace(definition,'    if v_type in(''revise_anchored_annotation'',''withdraw_anchored_annotation'')',
    '    if v_annotation.origin=''author'' and v_annotation.target_kind in(''study_unit'',''microsequence_explanation'')
       and v_type in(''withdraw_anchored_annotation'',''resolve_anchored_annotation'') then
      raise exception ''A observação autoral sai da fila somente após correção persistida e confirmada.'' using errcode=''42501'';
    end if;
    if v_type in(''revise_anchored_annotation'',''withdraw_anchored_annotation'')');
  -- A classificação explícita da base usa a cobertura da microssequência.
  definition:=replace(definition,'when ''didactic_microsequence'' then topic.entity_id in(',
    'when ''microsequence_explanation'' then topic.entity_id in(
      select cover.value from private.course_entities m
      cross join lateral jsonb_array_elements_text(coalesce(m.content->''covers'',''[]''::jsonb)) cover(value)
      where m.course_id=p_course_id and m.entity_type=''microsequence'' and m.entity_id=v_annotation.target_id
    ) when ''didactic_microsequence'' then topic.entity_id in(');
  if definition=original or position('A observação autoral sai da fila' in definition)=0 then
    raise exception 'Proteção de consumo da fila não foi integrada.'; end if;
  execute definition;
end $targets$;

alter table private.course_anchored_annotations drop constraint course_anchored_annotations_target_v2,
  add constraint course_anchored_annotations_target_v3 check(
    target_kind in('course','module','lesson','topic','didactic_microsequence','microsequence_explanation','study_unit','source','source_anchor')
    and nullif(btrim(target_id),'') is not null and target_id=btrim(target_id)
    and char_length(target_id)<=240 and octet_length(target_id)<=960 and target_id!~'[[:cntrl:]]'
    and private.valid_course_annotation_path_v2(observed_path)
    and observed_path->0->>'id'=course_id::text and observed_path->-1->>'kind'=target_kind and observed_path->-1->>'id'=target_id);

-- Leitura exclusiva do proprietário. O contador integra o orçamento da
-- projeção existente e não introduz chamadas por unidade no cliente.
do $owner_page$
declare definition text; original text;
begin
  definition:=pg_get_functiondef('private.list_course_study_units_for_actor_v1(uuid,uuid,bigint,text,text,text,text,text,integer,integer,text)'::regprocedure);
  original:=definition;
  definition:=replace(definition,'''version'', candidate_pool.study_unit_version,',
    '''version'', candidate_pool.study_unit_version,
        ''contentReview'',private.course_content_review_v1(p_course_id,''study_unit'',candidate_pool.entity_id),
        ''pendingAuthoringObservationCount'',(select count(*)::integer from private.course_anchored_annotations a
          where a.course_id=p_course_id and a.origin=''author'' and a.target_kind=''study_unit''
            and a.target_id=candidate_pool.entity_id and a.state in(''open'',''considered'')),');
  if definition=original then raise exception 'Projeção da fila por unidade não encontrada.'; end if;
  execute definition;
  definition:=pg_get_functiondef('private.decorate_course_inspection_page_v2(uuid,bigint,jsonb)'::regprocedure);
  original:=definition;
  definition:=replace(definition,'''analysisIdeas'',jsonb_build_object(',
    '''practiceEvidence'',coalesce((
      select jsonb_agg(jsonb_build_object(''name'',evidence.statement,''description'',evidence.description) order by practice.ordinal)
      from jsonb_array_elements(coalesce(entity.design_application->''practiceApplications'',''[]''::jsonb)) with ordinality practice(value,ordinal)
      join private.course_instructional_plan_items evidence on evidence.course_id=p_course_id
        and evidence.item_kind=''evidence_requirement'' and evidence.id::text=practice.value->>''evidenceRequirementId''
    ),''[]''::jsonb),
              ''analysisIdeas'',jsonb_build_object(');
  if definition=original then raise exception 'Projeção da evidência de prática não encontrada.'; end if;
  execute definition;
end $owner_page$;

create function private.course_observation_effect_hash_v1(p_course_id uuid,p_target_kind text,p_target_id text)
returns text language sql stable security definer set search_path=pg_catalog as $function$
  select private.course_source_json_hash_v1(jsonb_build_object(
    'targetKind',p_target_kind,'targetId',p_target_id,
    'content',case when p_target_kind='microsequence_explanation' then e.content->'explanation' else e.content end,
    'sourceLinks',coalesce((select private.course_source_links_v1(p_course_id,a.id)
      from private.course_source_attributions a where a.course_id=p_course_id
      and a.target_kind=p_target_kind and a.target_id=p_target_id),'[]'::jsonb)))
  from private.course_entities e where e.course_id=p_course_id and e.entity_id=p_target_id
    and e.entity_type=case p_target_kind when 'study_unit' then 'study_unit' when 'microsequence_explanation' then 'microsequence' end
$function$;

create function private.course_observation_correction_payload_v1(p_course_id uuid,p_request_id text,p_result jsonb,p_idempotent boolean)
returns jsonb language sql stable security definer set search_path=pg_catalog as $function$
  select jsonb_build_object('contract','aralearn.course-observation-correction.v1','status','persisted',
    'courseId',p_course_id,'requestId',p_request_id,'revision',(p_result->>'revision')::bigint,'idempotent',p_idempotent,
    'observations',(select jsonb_agg(o.value||jsonb_build_object('currentEffectHash',
      private.course_observation_effect_hash_v1(p_course_id,o.value->>'targetKind',o.value->>'targetId')) order by o.ordinal)
      from jsonb_array_elements(p_result#>'{observationCorrection,observations}') with ordinality o(value,ordinal)))
$function$;

create function public.commit_course_observation_corrections_for_actor_v1(p_actor_id uuid,p_course_id uuid,
  p_expected_revision bigint,p_expected_study_unit_version bigint,p_upserts jsonb,p_source_attribution_applications jsonb,
  p_channel text,p_application_origin text,p_request_id text,p_observations jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $function$
declare receipt private.course_change_receipts%rowtype; annotation private.course_anchored_annotations%rowtype;
  reference jsonb; associations jsonb:='[]'::jsonb; effects jsonb:='{}'::jsonb; result jsonb; input_hash text; effect_hash text;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_actor_id is null or p_course_id is null or p_request_id is null or p_request_id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
    or jsonb_typeof(p_observations) is distinct from 'array' or jsonb_array_length(p_observations) not between 1 and 64
    or octet_length(p_observations::text)>32768 or jsonb_typeof(p_upserts) is distinct from 'array'
    or jsonb_array_length(p_upserts) not between 1 and 64 then
    raise exception 'Referências da correção inválidas.' using errcode='22023'; end if;
  for reference in select value from jsonb_array_elements(p_observations) loop
    if jsonb_typeof(reference) is distinct from 'object'
      or not(reference ?& array['annotationId','annotationVersion','targetKind','targetId'])
      or reference-array['annotationId','annotationVersion','targetKind','targetId']<>'{}'::jsonb
      or jsonb_typeof(reference->'annotationId') is distinct from 'string'
      or reference->>'annotationId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(reference->'annotationVersion') is distinct from 'number' or reference->>'annotationVersion'!~'^[1-9][0-9]{0,15}$'
      or (reference->>'annotationVersion')::bigint>9007199254740991
      or jsonb_typeof(reference->'targetKind') is distinct from 'string' or reference->>'targetKind' not in('study_unit','microsequence_explanation')
      or jsonb_typeof(reference->'targetId') is distinct from 'string'
      or nullif(btrim(reference->>'targetId'),'') is null or reference->>'targetId'<>btrim(reference->>'targetId')
      or char_length(reference->>'targetId')>240 or octet_length(reference->>'targetId')>960 or reference->>'targetId'~'[[:cntrl:]]'
      then raise exception 'Versão de observação inválida.' using errcode='22023'; end if;
  end loop;
  if (select count(*)<>count(distinct value->>'annotationId') from jsonb_array_elements(p_observations)) then
    raise exception 'Observação repetida na correção.' using errcode='22023'; end if;
  input_hash:=private.course_source_json_hash_v1(jsonb_build_object('courseId',p_course_id,'revision',p_expected_revision,
    'unitVersion',p_expected_study_unit_version,'upserts',p_upserts,'sources',p_source_attribution_applications,
    'channel',p_channel,'origin',p_application_origin,'observations',p_observations));
  perform pg_advisory_xact_lock(hashtextextended('course-change-request:'||p_actor_id::text||':'||p_request_id,0));
  select * into receipt from private.course_change_receipts r where r.actor_id=p_actor_id and r.request_id=p_request_id;
  if found then
    if receipt.course_id<>p_course_id or receipt.result#>>'{observationCorrection,requestHash}' is distinct from input_hash then
      raise exception 'requestId reutilizado com correção incompatível.' using errcode='23514'; end if;
    if receipt.expires_at<=statement_timestamp() then
      raise exception 'O recibo expirou; a mesma tentativa exige reconciliação, sem reaplicar conteúdo.' using errcode='PT409'; end if;
    return private.course_observation_correction_payload_v1(p_course_id,p_request_id,receipt.result,true);
  end if;
  perform 1 from auth.users u where u.id=p_actor_id for key share;
  perform pg_advisory_xact_lock(hashtextextended('course-row:'||p_course_id::text,0));
  perform 1 from public.courses c where c.id=p_course_id for update;
  for reference in select value from jsonb_array_elements(p_observations) loop
    select * into annotation from private.course_anchored_annotations a where a.course_id=p_course_id
      and a.id=(reference->>'annotationId')::uuid for update;
    if not found or annotation.origin<>'author' or annotation.actor_id is distinct from p_actor_id then
      raise exception 'Observação autoral inexistente ou inacessível.' using errcode='PT404'; end if;
    if annotation.version<>(reference->>'annotationVersion')::bigint or annotation.state not in('open','considered')
      or annotation.target_kind<>reference->>'targetKind' or annotation.target_id<>reference->>'targetId' then
      raise exception 'A observação mudou; releia a versão e preserve a pendência.' using errcode='40001'; end if;
    if not exists(select 1 from jsonb_array_elements(p_upserts) u where u->>'entityId'=annotation.target_id
      and u->>'entityType'=case annotation.target_kind when 'study_unit' then 'study_unit' else 'microsequence' end) then
      raise exception 'A observação não pertence a um objeto corrigido.' using errcode='22023'; end if;
    effect_hash:=private.course_observation_effect_hash_v1(p_course_id,annotation.target_kind,annotation.target_id);
    if effect_hash is null then raise exception 'Objeto da correção inexistente.' using errcode='PT404'; end if;
    effects:=effects||jsonb_build_object(annotation.id::text,effect_hash);
  end loop;
  result:=public.commit_course_composition_for_actor_v1(p_actor_id,p_course_id,p_expected_revision,p_expected_study_unit_version,
    p_upserts,'[]'::jsonb,p_source_attribution_applications,p_channel,p_application_origin,p_request_id,null);
  for reference in select value from jsonb_array_elements(p_observations) loop
    effect_hash:=private.course_observation_effect_hash_v1(p_course_id,reference->>'targetKind',reference->>'targetId');
    associations:=associations||jsonb_build_array(reference||jsonb_build_object('effectHash',effect_hash,
      'changed',effects->>(reference->>'annotationId') is distinct from effect_hash,'confirmed',false));
  end loop;
  -- Conserva a origem e o recibo canônico do writer, inclusive os campos que
  -- sua projeção MCP omite. Não copia conteúdo ou texto privado para o recibo.
  update private.course_change_receipts r set result=r.result||jsonb_build_object('observationCorrection',
    jsonb_build_object('requestHash',input_hash,'observations',associations))
    where r.actor_id=p_actor_id and r.request_id=p_request_id returning r.result into result;
  if result is null then raise exception 'Composição sem recibo persistido.' using errcode='55000'; end if;
  return private.course_observation_correction_payload_v1(p_course_id,p_request_id,result,false);
end $function$;

create function public.get_course_observation_correction_for_actor_v1(p_actor_id uuid,p_course_id uuid,p_request_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $function$
declare receipt private.course_change_receipts%rowtype;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_request_id is null or p_request_id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'Identidade de correção inválida.' using errcode='22023'; end if;
  select * into receipt from private.course_change_receipts r where r.actor_id=p_actor_id and r.request_id=p_request_id
    and r.course_id=p_course_id and r.expires_at>statement_timestamp() and r.result ? 'observationCorrection';
  if not found then return jsonb_build_object('contract','aralearn.course-observation-correction.v1','status','absent',
    'courseId',p_course_id,'requestId',p_request_id); end if;
  return private.course_observation_correction_payload_v1(p_course_id,p_request_id,receipt.result,true);
end $function$;

create function public.confirm_course_observation_correction_for_actor_v1(p_actor_id uuid,p_course_id uuid,p_request_id text,p_confirmations jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $function$
declare receipt private.course_change_receipts%rowtype; annotation private.course_anchored_annotations%rowtype;
  confirmation jsonb; reference jsonb; associations jsonb; changed boolean:=false; ordinal integer;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_request_id is null or p_request_id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
    or jsonb_typeof(p_confirmations) is distinct from 'array' or jsonb_array_length(p_confirmations)>64
    or octet_length(p_confirmations::text)>32768 then
    raise exception 'Confirmações de correção inválidas.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('course-change-request:'||p_actor_id::text||':'||p_request_id,0));
  select * into receipt from private.course_change_receipts r where r.actor_id=p_actor_id and r.request_id=p_request_id
    and r.course_id=p_course_id and r.expires_at>statement_timestamp() and r.result ? 'observationCorrection';
  if not found then return jsonb_build_object('contract','aralearn.course-observation-correction.v1','status','absent',
    'courseId',p_course_id,'requestId',p_request_id); end if;
  associations:=receipt.result#>'{observationCorrection,observations}';
  perform 1 from auth.users u where u.id=p_actor_id for key share;
  perform pg_advisory_xact_lock(hashtextextended('course-row:'||p_course_id::text,0));
  perform 1 from public.courses c where c.id=p_course_id for update;
  if (select count(*)<>count(distinct value->>'annotationId') from jsonb_array_elements(p_confirmations)) then
    raise exception 'Confirmação repetida.' using errcode='22023'; end if;
  for confirmation in select value from jsonb_array_elements(p_confirmations) loop
    if jsonb_typeof(confirmation) is distinct from 'object'
      or not(confirmation ?& array['annotationId','annotationVersion','effectHash'])
      or confirmation-array['annotationId','annotationVersion','effectHash']<>'{}'::jsonb then
      raise exception 'Confirmação de versão inválida.' using errcode='22023'; end if;
    select o.value,o.n::integer-1 into reference,ordinal from jsonb_array_elements(associations) with ordinality o(value,n)
      where o.value->'annotationId'=confirmation->'annotationId' and o.value->'annotationVersion'=confirmation->'annotationVersion'
      and o.value->'effectHash'=confirmation->'effectHash';
    if not found then raise exception 'A confirmação não identifica o efeito e a versão associados.' using errcode='23514'; end if;
    if (reference->>'confirmed')::boolean or not(reference->>'changed')::boolean then continue; end if;
    select * into annotation from private.course_anchored_annotations a where a.course_id=p_course_id
      and a.id=(reference->>'annotationId')::uuid for update;
    if not found or annotation.actor_id is distinct from p_actor_id or annotation.origin<>'author'
      or annotation.version<>(reference->>'annotationVersion')::bigint or annotation.state not in('open','considered')
      or annotation.target_kind<>reference->>'targetKind' or annotation.target_id<>reference->>'targetId'
      or annotation.version>=256
      or private.course_observation_effect_hash_v1(p_course_id,annotation.target_kind,annotation.target_id) is distinct from reference->>'effectHash'
      then continue; end if;
    update private.course_anchored_annotations a set state='resolved',resolved_at=statement_timestamp(),
      first_considered_at=coalesce(a.first_considered_at,statement_timestamp()),updated_at=statement_timestamp(),version=a.version+1
      where a.id=annotation.id;
    update public.courses c set annotation_set_version=c.annotation_set_version+1 where c.id=p_course_id;
    perform private.bump_course_annotation_viewer_version_v1(p_course_id,p_actor_id);
    associations:=jsonb_set(associations,array[ordinal::text,'confirmed'],'true'::jsonb);
    changed:=true;
  end loop;
  if changed then
    update private.course_change_receipts r set result=jsonb_set(r.result,'{observationCorrection,observations}',associations)
      where r.actor_id=p_actor_id and r.request_id=p_request_id returning r.* into receipt;
  end if;
  return private.course_observation_correction_payload_v1(p_course_id,p_request_id,receipt.result,not changed);
end $function$;

revoke all on function private.course_observation_effect_hash_v1(uuid,text,text),
  private.course_observation_correction_payload_v1(uuid,text,jsonb,boolean) from public,anon,authenticated,service_role;
revoke all on function public.commit_course_observation_corrections_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,jsonb,text,text,text,jsonb),
  public.get_course_observation_correction_for_actor_v1(uuid,uuid,text),
  public.confirm_course_observation_correction_for_actor_v1(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.commit_course_observation_corrections_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,jsonb,text,text,text,jsonb),
  public.get_course_observation_correction_for_actor_v1(uuid,uuid,text),
  public.confirm_course_observation_correction_for_actor_v1(uuid,uuid,text,jsonb) to service_role;

-- A base pertence à microssequência, inclusive antes de incluí-la num lote.
-- O currículo e os lotes leem a mesma instância salva e a revisão do objeto.
do $plan_projection$
declare definition text; before_text text;
begin
  select replace(pg_get_functiondef('private.get_course_instructional_plan_for_actor_v3(uuid,uuid)'::regprocedure),E'\r\n',E'\n') into definition;
  before_text:='''objective'',coalesce(microsequence.content->>''goal'',''''),''explanationPlan'',microsequence.content->''explanationPlan'',';
  if position(before_text in definition)=0 then raise exception 'Projeção curricular da base não encontrada.'; end if;
  definition:=replace(definition,before_text,before_text||'''explanation'',microsequence.content->''explanation'',''contentReview'',private.course_content_review_v1(p_course_id,''microsequence_explanation'',microsequence.entity_id),');
  before_text:='''contentReview'',private.course_microsequence_review_v1(p_course_id,microsequence.entity_id),';
  if position(before_text in definition)=0 then raise exception 'Projeção da base no lote não encontrada.'; end if;
  definition:=replace(definition,before_text,'''contentReview'',private.course_content_review_v1(p_course_id,''microsequence_explanation'',microsequence.entity_id),');
  execute definition;
end $plan_projection$;

do $manifest$
declare manifest jsonb;
begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260909032748');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
commit;
