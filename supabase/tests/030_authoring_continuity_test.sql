begin;

select plan(58);

select has_column(
  'private', 'authoring_workspaces', 'authoring_state',
  'workspace conserva um único estado corrente de continuidade'
);

select ok(
  (
    select column_default like '%"version": 1%'
      and column_default like '%"parts": []%'
      and column_default like '%"decisions": []%'
      and column_default like '%"mandate": null%'
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'authoring_workspaces'
      and column_name = 'authoring_state'
  ),
  'o estado corrente nasce vazio e versionado'
);

select ok(
  exists (
    select 1 from pg_constraint constraint_value
    where constraint_value.conname = 'authoring_workspaces_continuity_v1'
      and pg_get_constraintdef(constraint_value.oid)
        like '%valid_authoring_continuity_v1%'
  ),
  'o banco valida integralmente o estado de continuidade'
);

select has_column(
  'private', 'authoring_workspace_observations', 'kind',
  'observações distinguem notas de achados de auditoria'
);
select has_column(
  'private', 'authoring_workspace_observations', 'category',
  'achados guardam categoria compacta'
);
select has_column(
  'private', 'authoring_workspace_observations', 'severity',
  'achados guardam severidade'
);
select has_column(
  'private', 'authoring_workspace_observations', 'audit_part_id',
  'achados focais conservam somente a identidade compacta da Parte'
);
select has_column(
  'private', 'authoring_workspace_observations', 'status',
  'achados guardam o estado corrente do ciclo'
);
select has_column(
  'private', 'authoring_workspace_observations', 'proposed_repair',
  'achados guardam somente a reparação proposta'
);
select has_column(
  'private', 'authoring_workspace_observations', 'audit_revision',
  'achados ligam a auditoria à revisão corrente'
);
select has_column(
  'private', 'authoring_workspace_observations', 'pending_correction_request_id',
  'achados preservam o requestId do último commit autorizado ainda não ligado'
);
select has_column(
  'private', 'authoring_workspace_observations', 'pending_revision',
  'achados preservam a revisão pendente sem depender do TTL do receipt'
);
select has_column(
  'private', 'authoring_workspace_observations', 'correction_request_id',
  'achados ligam a correção ao receipt do workspace'
);
select has_column(
  'private', 'authoring_workspace_observations', 'resulting_revision',
  'achados registram a revisão produzida pela correção'
);
select has_column(
  'private', 'authoring_workspace_observations', 'verification',
  'achados guardam a síntese da reauditoria'
);
select has_column(
  'private', 'authoring_workspace_observations', 'verified_revision',
  'achados ligam a verificação à revisão corrente'
);

select ok(
  exists (
    select 1 from pg_constraint constraint_value
    where constraint_value.conname = 'authoring_workspace_observations_lifecycle_v1'
      and pg_get_constraintdef(constraint_value.oid)
        like '%note%audit_finding%'
  ),
  'somente notas e achados integram a lista estrutural'
);

select ok(
  exists (
    select 1 from pg_constraint constraint_value
    where constraint_value.conname = 'authoring_workspace_observations_lifecycle_v1'
      and pg_get_constraintdef(constraint_value.oid)
        like '%open%approved%rejected%repaired%resolved%'
  ),
  'o ciclo de achados usa somente estados correntes fechados'
);

select has_column(
  'private', 'authoring_workspace_observation_receipts', 'expires_at',
  'receipts estruturais possuem TTL'
);
select has_column(
  'private', 'authoring_workspace_observation_receipts', 'workspace_id',
  'receipts estruturais permanecem isolados por workspace'
);

select ok(
  exists (
    select 1 from pg_indexes index_value
    where index_value.schemaname = 'private'
      and index_value.indexname =
        'authoring_workspace_observation_receipts_expiry_v1_idx'
  ),
  'a poda dos receipts usa índice próprio'
);

select ok(
  exists (
    select 1 from pg_indexes index_value
    where index_value.schemaname = 'private'
      and index_value.indexname = 'authoring_workspace_active_findings_v1_idx'
      and index_value.indexdef like '%audit_finding%'
      and index_value.indexdef like '%repaired%'
  ),
  'a retomada limitada usa índice parcial de achados ativos'
);

select ok(
  exists (
    select 1 from pg_indexes index_value
    where index_value.schemaname = 'private'
      and index_value.indexname = 'authoring_workspace_terminal_findings_v1_idx'
      and index_value.indexdef like '%rejected%resolved%'
  ),
  'a retenção oportunística usa índice parcial somente para terminais'
);

select has_function(
  'private', 'prune_authoring_workspace_terminal_findings_v1',
  array['uuid'],
  'a poda terminal é isolada por workspace'
);
select has_function(
  'private', 'authoring_observation_paths_related_v1',
  array['text[]', 'text[]'],
  'o vínculo de correção compara ancestrais e descendentes'
);
select has_function(
  'private', 'remap_authoring_continuity_v1',
  array['jsonb', 'text', 'jsonb', 'jsonb'],
  'split e merge possuem remapeamento fechado de Partes'
);
select has_function(
  'private', 'authoring_part_is_materialized_v1',
  array['uuid', 'jsonb', 'text'],
  'o mandato build_part possui conclusão verificável no estado corrente'
);
select has_function(
  'private', 'authoring_jsonb_text_path_v1',
  array['jsonb'],
  'paths resumidos são validados antes de autorizarem correções'
);
select has_function(
  'private', 'authoring_post_change_path_v1',
  array['uuid', 'jsonb', 'text', 'text'],
  'o gate resolve o caminho posterior de moves no mesmo lote'
);
select has_function(
  'private', 'authoring_finding_touched_by_commit_v1',
  array['uuid', 'uuid', 'jsonb', 'jsonb'],
  'o commit identifica somente os achados efetivamente reparados'
);
select has_function(
  'private', 'authoring_audit_target_in_part_v1',
  array['uuid', 'jsonb', 'text', 'text[]'],
  'auditoria opcionalmente fecha seus alvos a uma Parte'
);
select has_column(
  'private', 'trail_observation_threads', 'correction_resulting_revision',
  'comentário situado conserva a revisão da correção comprovada'
);
select has_function(
  'private', 'authoring_comment_correction_revision_v1',
  array['uuid', 'uuid', 'text', 'text[]', 'timestamp with time zone', 'text'],
  'o vínculo de comentário comprova a correção autoral posterior'
);
select has_function(
  'private', 'manage_educational_workspace_comment_v1',
  array['uuid', 'text', 'uuid', 'uuid', 'text', 'jsonb'],
  'o ciclo de comentário passa pelo wrapper de vínculo validado'
);
select has_function(
  'private', 'educational_workspace_effective_role_v1',
  array['uuid', 'uuid'],
  'o editor global usa um papel público efetivo sem membership artificial'
);
select has_function(
  'private', 'assert_authoring_commit_mandate_v1',
  array['uuid', 'text', 'jsonb', 'jsonb', 'jsonb'],
  'o commit aplica o mandato ativo antes de persistir qualquer lote'
);

select ok(
  pg_get_functiondef(
    'public.get_authoring_workspace_v5(uuid,uuid,text[],boolean)'::regprocedure
  ) like '%educational_workspace_effective_role_v1%',
  'a leitura detalhada projeta o papel efetivo do editor global'
);
select ok(
  pg_get_functiondef(
    'public.list_authoring_workspaces_v5(uuid,integer,timestamptz,uuid)'::regprocedure
  ) like '%educational_workspace_effective_role_v1%',
  'a lista de workspaces projeta o mesmo papel efetivo'
);
select ok(
  pg_get_functiondef(
    'public.commit_authoring_workspace_changes_v5(uuid,uuid,text,text,bigint,text,jsonb,jsonb)'::regprocedure
  ) like '%pending_correction_request_id = p_request_id%'
    and pg_get_functiondef(
      'public.commit_authoring_workspace_changes_v5(uuid,uuid,text,text,bigint,text,jsonb,jsonb)'::regprocedure
    ) like '%pending_revision = (v_result->>''revision'')::bigint%'
    and pg_get_functiondef(
      'public.manage_authoring_workspace_finding_v1(uuid,uuid,text,text,bigint,text,jsonb)'::regprocedure
    ) like '%v_finding.pending_correction_request_id%'
    and pg_get_functiondef(
      'public.commit_authoring_workspace_changes_v5(uuid,uuid,text,text,bigint,text,jsonb,jsonb)'::regprocedure
    ) not like '%autoLinkedFindingCount%',
  'o commit preserva um handoff pendente e o vínculo não depende do receipt expirável'
);
select ok(
  pg_get_functiondef(
    'public.manage_authoring_workspace_finding_v1(uuid,uuid,text,text,bigint,text,jsonb)'::regprocedure
  ) like '%p_operation in (''create'', ''verify'')%'
    and pg_get_functiondef(
      'public.manage_authoring_workspace_finding_v1(uuid,uuid,text,text,bigint,text,jsonb)'::regprocedure
    ) like '%v_authoring_state#>>''{mandate,kind}'' is distinct from ''audit''%',
  'criação e reauditoria exigem mandato audit sob o lock do workspace'
);
select ok(
  pg_get_functiondef(
    'public.manage_authoring_workspace_finding_v1(uuid,uuid,text,text,bigint,text,jsonb)'::regprocedure
  ) like '%v_authoring_state#>>''{mandate,targetPartId}''%'
    and pg_get_functiondef(
      'public.manage_authoring_workspace_finding_v1(uuid,uuid,text,text,bigint,text,jsonb)'::regprocedure
    ) like '%v_finding.audit_part_id%'
    and pg_get_functiondef(
      'public.manage_authoring_workspace_finding_v1(uuid,uuid,text,text,bigint,text,jsonb)'::regprocedure
    ) like '%authoring_observation_target_available_v1%',
  'reauditoria focal conserva a Parte mesmo após apagar um ancestral'
);
select ok(
  pg_get_functiondef(
    'private.manage_educational_workspace_comment_v1(uuid,text,uuid,uuid,text,jsonb)'::regprocedure
  ) like '%incorporated exige vínculo com correção autoral validada%'
    and pg_get_functiondef(
      'private.manage_educational_workspace_comment_v1(uuid,text,uuid,uuid,text,jsonb)'::regprocedure
    ) like '%authoring_comment_correction_revision_v1%'
    and pg_get_functiondef(
      'private.authoring_comment_correction_revision_v1(uuid,uuid,text,text[],timestamptz,text)'::regprocedure
    ) like '%event.created_at > p_comment_created_at%'
    and pg_get_functiondef(
      'private.authoring_comment_correction_revision_v1(uuid,uuid,text,text[],timestamptz,text)'::regprocedure
    ) like '%changedCardPathsTruncated%',
  'incorporated só é alcançado por evento posterior, completo e no card correto'
);
select ok(
  pg_get_functiondef(
    'private.remap_authoring_continuity_v1(jsonb,text,jsonb,jsonb)'::regprocedure
  ) like '%jsonb_set(%v_decision, ''{entityId}'', to_jsonb(v_target_id)%'
    and pg_get_functiondef(
      'private.remap_authoring_continuity_v1(jsonb,text,jsonb,jsonb)'::regprocedure
    ) like '%''{decisions}'', v_decisions%',
  'merge remapeia decisões da origem para a microssequência sobrevivente'
);

select has_function(
  'public', 'get_authoring_workspace_continuity_v1',
  array['uuid', 'uuid'],
  'o executor lê a retomada corrente por ator e workspace'
);
select has_function(
  'public', 'update_authoring_workspace_continuity_v1',
  array['uuid', 'uuid', 'text', 'text', 'bigint', 'text', 'jsonb'],
  'a continuidade é atualizada com CAS e idempotência'
);
select has_function(
  'public', 'manage_authoring_workspace_finding_v1',
  array['uuid', 'uuid', 'text', 'text', 'bigint', 'text', 'jsonb'],
  'o ciclo de achados possui mutação atômica própria'
);
select has_function(
  'public', 'commit_authoring_workspace_changes_v5',
  array['uuid', 'uuid', 'text', 'text', 'bigint', 'text', 'jsonb', 'jsonb'],
  'o commit v5 público foi recompilado com continuidade atômica'
);
select has_function(
  'public', 'list_authoring_workspace_observations_for_actor_v1',
  array[
    'uuid', 'uuid', 'integer', 'timestamp with time zone', 'uuid',
    'text[]', 'text[]', 'text[]'
  ],
  'a lista estrutural oferece cursor e filtros compactos'
);
select hasnt_function(
  'public', 'list_authoring_workspace_observations_for_actor_v1',
  array['uuid', 'uuid'],
  'a listagem integral sem paginação foi retirada'
);

select function_privs_are(
  'public', 'get_authoring_workspace_continuity_v1',
  array['uuid', 'uuid'], 'service_role', array['EXECUTE'],
  'somente o executor interno lê continuidade em nome do OAuth'
);
select function_privs_are(
  'private', 'educational_workspace_effective_role_v1',
  array['uuid', 'uuid'], 'service_role', array[]::text[],
  'a projeção auxiliar de papel não é RPC pública'
);
select function_privs_are(
  'private', 'authoring_finding_touched_by_commit_v1',
  array['uuid', 'uuid', 'jsonb', 'jsonb'],
  'service_role', array[]::text[],
  'o classificador de achados não é RPC pública'
);
select function_privs_are(
  'private', 'authoring_audit_target_in_part_v1',
  array['uuid', 'jsonb', 'text', 'text[]'],
  'service_role', array[]::text[],
  'o recorte interno da auditoria não é RPC pública'
);
select function_privs_are(
  'private', 'authoring_comment_correction_revision_v1',
  array['uuid', 'uuid', 'text', 'text[]', 'timestamp with time zone', 'text'],
  'service_role', array[]::text[],
  'a prova interna do vínculo situado não é RPC pública'
);
select function_privs_are(
  'public', 'update_authoring_workspace_continuity_v1',
  array['uuid', 'uuid', 'text', 'text', 'bigint', 'text', 'jsonb'],
  'service_role', array['EXECUTE'],
  'somente o executor interno altera continuidade em nome do OAuth'
);
select function_privs_are(
  'public', 'manage_authoring_workspace_finding_v1',
  array['uuid', 'uuid', 'text', 'text', 'bigint', 'text', 'jsonb'],
  'service_role', array['EXECUTE'],
  'somente o executor interno conduz o ciclo de achados'
);
select function_privs_are(
  'public', 'commit_authoring_workspace_changes_v5',
  array['uuid', 'uuid', 'text', 'text', 'bigint', 'text', 'jsonb', 'jsonb'],
  'service_role', array['EXECUTE'],
  'somente o executor interno chama o commit v5 recompilado'
);
select function_privs_are(
  'public', 'commit_authoring_workspace_changes_without_continuity_v1',
  array['uuid', 'uuid', 'text', 'text', 'bigint', 'text', 'jsonb', 'jsonb'],
  'service_role', array[]::text[],
  'o commit anterior é delegado privado e não permanece chamável'
);

select * from finish();
rollback;
