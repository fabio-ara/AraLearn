begin;

select plan(103);

select has_function(
  'public',
  'get_aralearn_runtime_manifest',
  array[]::text[],
  'o banco expõe o manifesto do runtime'
);

select is(
  public.get_aralearn_runtime_manifest() ->> 'schemaRevision',
  '20260821191340',
  'o manifesto identifica a revisão final do esquema'
);

select is(
  public.get_aralearn_runtime_manifest() ->> 'contractVersion',
  '1',
  'o manifesto mantém a versão do contrato público'
);

select is(
  jsonb_array_length(public.get_aralearn_runtime_manifest() -> 'features'),
  36,
  'o manifesto não omite nem duplica capacidades correntes'
);

select ok(
  (public.get_aralearn_runtime_manifest() -> 'features') @> '[
    "flat-runtime-manifest-v1",
    "single-live-course-identity-v1",
    "paged-live-course-composition-v1",
    "direct-course-access-v1",
    "course-cas-idempotency-v1",
    "oauth-only-authoring-mcp",
    "isolated-mcp-oauth-principal-v1",
    "package-library-v1",
    "package-contract-discovery-v1",
    "person-profile-v1",
    "study-only-course-access-v1",
    "private-person-avatar-v1",
    "self-account-deletion-v1",
    "course-instructional-plan-v1",
    "course-authoring-part-materialization-v1",
    "course-study-unit-inspection-v1",
    "course-design-parameters-v1",
    "course-authoring-guidance-v1",
    "course-component-policy-v1",
    "course-sources-v1",
    "course-source-provenance-v1",
    "course-source-pdf-attachments-v1",
    "course-anchored-annotations-v1",
    "course-annotation-subject-classification-v1",
    "course-personal-state-v2",
    "course-audit-cycle-v1",
    "course-authoring-corrections-v1",
    "course-audit-annotation-links-v1",
    "course-variant-comparisons-v1",
    "course-variant-comparison-list-v1",
    "course-authoring-analytics-v1",
    "course-variant-factual-comparison-v1",
    "contextual-study-unit-edit-v1",
    "personal-course-copy-edit-v1",
    "current-data-lifecycle-v1",
    "authenticated-course-source-pdf-upload-v1"
  ]'::jsonb,
  'o manifesto anuncia todo o contrato de Curso'
);

select is(
  (
    select count(*)
    from pg_proc procedure_value
    join pg_namespace namespace_value
      on namespace_value.oid = procedure_value.pronamespace
    where namespace_value.nspname = 'public'
      and (
        procedure_value.proname like 'get_aralearn_runtime_manifest_before_%'
        or procedure_value.proname like 'get_aralearn_runtime_manifest_without_%'
      )
  ),
  0::bigint,
  'o manifesto corrente não depende de versões intermediárias'
);

select has_table('public', 'courses', 'Cursos têm uma identidade pública única');
select has_table('public', 'course_access', 'acessos diretos pertencem ao Curso');
select has_table(
  'public',
  'course_personal_states',
  'o estado pessoal de estudo pertence ao Curso'
);
select has_table('private', 'course_entities', 'a composição do Curso é relacional');
select has_table('private', 'course_revisions', 'revisões do Curso são atômicas');
select has_table(
  'private',
  'course_instructional_plans',
  'o planejamento instrucional pertence ao Curso'
);
select has_table('private', 'course_authoring_parts', 'a produção é organizada por Partes');
select has_table(
  'private',
  'course_authoring_part_materializations',
  'materializações registram o avanço de cada Parte'
);
select has_table(
  'private',
  'course_design_parameter_definitions',
  'parâmetros de desenho têm definições canônicas'
);
select has_table('private', 'course_source_revisions', 'Fontes mantêm histórico imutável');
select has_table(
  'private',
  'course_source_attachments',
  'anexos PDF são vinculados a revisões de Fonte'
);
select has_table(
  'private',
  'course_source_attributions',
  'atribuições ligam evidências à composição'
);
select has_table(
  'private',
  'course_anchored_annotations',
  'observações mantêm âncoras estruturais'
);
select has_table('private', 'course_audit_findings', 'achados de auditoria são persistidos');
select has_table(
  'private',
  'course_authoring_corrections',
  'reparos mantêm vínculo com o achado correspondente'
);
select has_table(
  'private',
  'course_variant_comparison_sets',
  'comparações de variantes têm identidade própria'
);
select has_table(
  'private',
  'course_variant_comparison_members',
  'cada Curso comparado pertence a um conjunto explícito'
);
select has_table(
  'private',
  'course_personal_copies',
  'a origem de uma cópia pessoal fica segregada da composição curricular'
);
select has_column(
  'private',
  'course_variant_comparison_members',
  'position',
  'a ordem de criação das variantes é persistida'
);
select col_not_null(
  'private',
  'course_variant_comparison_members',
  'position',
  'toda variante mantém uma posição estável'
);

select has_function(
  'public', 'create_course_for_actor_v1',
  array['uuid', 'text', 'text', 'text'],
  'a fronteira de serviço cria Cursos'
);
select has_function(
  'public', 'get_course_for_actor_v1',
  array['uuid', 'uuid', 'boolean'],
  'a fronteira de serviço lê um Curso autorizado'
);
select has_function(
  'public', 'list_course_entities_for_actor_v1',
  array['uuid', 'uuid', 'bigint', 'integer', 'text', 'text'],
  'a composição é paginada pela fronteira de serviço'
);
select has_function(
  'public', 'commit_course_composition_for_actor_v1',
  array['uuid', 'uuid', 'bigint', 'bigint', 'jsonb', 'jsonb', 'jsonb', 'text', 'text', 'text'],
  'a composição contextual usa versões esperadas e confirmação atômica'
);
select has_function(
  'public', 'commit_personal_course_copy_edit_for_actor_v1',
  array['uuid', 'uuid', 'bigint', 'bigint', 'jsonb', 'text', 'text'],
  'a primeira edição compartilhada cria a cópia pessoal atomicamente'
);
select ok(
  strpos(
    pg_get_functiondef(
      'public.commit_course_composition_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,text)'::regprocedure
    ),
    'if p_channel = ''mcp'' then'
  ) > 0,
  'a composição conserva o shape público anterior no canal MCP'
);
select has_function(
  'public', 'manage_course_access_for_actor_v1',
  array['uuid', 'uuid', 'text', 'text', 'uuid', 'boolean', 'text'],
  'o proprietário administra o acesso direto ao Curso'
);
select has_function(
  'public', 'commit_course_instructional_plan_for_actor_v1',
  array['uuid', 'uuid', 'bigint', 'bigint', 'jsonb', 'jsonb', 'text', 'text'],
  'o planejamento é confirmado com controle de concorrência'
);
select has_function(
  'public', 'advance_course_authoring_part_materialization_for_actor_v1',
  array['uuid', 'uuid', 'uuid', 'uuid', 'bigint', 'bigint', 'text', 'jsonb', 'text', 'text'],
  'uma Parte avança por operações pequenas e idempotentes'
);
select has_function(
  'public', 'apply_course_design_command_for_actor_v1',
  array['uuid', 'uuid', 'bigint', 'jsonb', 'text', 'text'],
  'parâmetros e regras de componentes usam a fronteira do Curso'
);
select has_function(
  'public', 'list_owned_course_study_units_for_actor_v1',
  array['uuid', 'uuid', 'bigint', 'text', 'text', 'text', 'text', 'text', 'integer', 'integer'],
  'a inspeção carrega Unidades em janelas limitadas'
);
select has_function(
  'public', 'execute_course_source_command_for_actor_v1',
  array['uuid', 'uuid', 'bigint', 'jsonb', 'text', 'text'],
  'Fontes e proveniência usam comandos com revisão esperada'
);
select has_function(
  'public', 'attach_course_source_pdf_for_actor_v1',
  array['uuid', 'uuid', 'bigint', 'jsonb', 'text', 'text'],
  'a confirmação do PDF é atômica e autorizada'
);
select has_function(
  'public', 'get_course_source_attachment_access_for_actor_v1',
  array['uuid', 'uuid', 'bigint', 'text', 'text', 'bigint', 'text', 'bigint', 'text'],
  'o acesso ao PDF comprova vínculo, hash e tamanho'
);
select has_function(
  'public', 'execute_course_anchored_annotation_command_for_actor_v1',
  array['uuid', 'uuid', 'bigint', 'jsonb', 'text', 'text'],
  'observações do autor e do chat compartilham o mesmo contrato'
);
select has_function(
  'public', 'execute_course_audit_cycle_command_for_actor_v1',
  array['uuid', 'uuid', 'bigint', 'jsonb', 'text', 'text'],
  'auditoria, reparo e verificação formam um único ciclo'
);
select has_function(
  'public', 'create_course_variants_for_actor_v1',
  array['uuid', 'uuid', 'bigint', 'jsonb', 'text'],
  'variantes derivam de uma revisão conhecida do Curso'
);
select has_function(
  'public', 'get_owned_course_variant_comparison_for_actor_v1',
  array['uuid', 'uuid', 'bigint', 'uuid'],
  'a comparação expõe diferenças factuais entre variantes'
);
select has_function(
  'public', 'get_owned_course_authoring_analytics_for_actor_v1',
  array['uuid', 'uuid', 'bigint', 'jsonb'],
  'Pesquisa lê fatos brutos por consulta estável'
);
select has_function(
  'public', 'load_course_personal_state_v2',
  array['uuid'],
  'o estudante lê seu estado pessoal corrente'
);
select has_function(
  'public', 'mutate_course_personal_state_v2',
  array['uuid', 'bigint', 'jsonb', 'uuid'],
  'o estudante altera o estado pessoal com revisão esperada'
);

select function_privs_are(
  'public', 'get_aralearn_runtime_manifest', array[]::text[],
  'anon', array['EXECUTE'],
  'o manifesto é legível antes da autenticação'
);
select function_privs_are(
  'public', 'create_course_for_actor_v1', array['uuid', 'text', 'text', 'text'],
  'service_role', array['EXECUTE'],
  'somente o serviço cria Cursos em nome de um ator'
);
select function_privs_are(
  'public', 'create_course_for_actor_v1', array['uuid', 'text', 'text', 'text'],
  'authenticated', array[]::text[],
  'o cliente autenticado não pode escolher outro ator na criação'
);
select function_privs_are(
  'public', 'commit_course_composition_for_actor_v1',
  array['uuid', 'uuid', 'bigint', 'bigint', 'jsonb', 'jsonb', 'jsonb', 'text', 'text', 'text'],
  'service_role', array['EXECUTE'],
  'somente a Edge confirma uma edição contextual em nome do proprietário'
);
select function_privs_are(
  'public', 'commit_personal_course_copy_edit_for_actor_v1',
  array['uuid', 'uuid', 'bigint', 'bigint', 'jsonb', 'text', 'text'],
  'service_role', array['EXECUTE'],
  'somente a API cria a cópia pessoal em nome do estudante'
);
select function_privs_are(
  'public', 'commit_personal_course_copy_edit_for_actor_v1',
  array['uuid', 'uuid', 'bigint', 'bigint', 'jsonb', 'text', 'text'],
  'authenticated', array[]::text[],
  'o cliente não escolhe outro ator ao criar a cópia pessoal'
);
select function_privs_are(
  'public', 'commit_course_composition_for_actor_v1',
  array['uuid', 'uuid', 'bigint', 'bigint', 'jsonb', 'jsonb', 'jsonb', 'text', 'text', 'text'],
  'authenticated', array[]::text[],
  'o cliente autenticado não contorna a Edge na edição contextual'
);
select function_privs_are(
  'public', 'commit_course_composition_for_actor_v1',
  array['uuid', 'uuid', 'bigint', 'jsonb', 'jsonb', 'jsonb', 'text'],
  'service_role', array[]::text[],
  'o núcleo legado da composição não permanece executável pelo serviço'
);
select function_privs_are(
  'public', 'get_owned_course_authoring_analytics_for_actor_v1',
  array['uuid', 'uuid', 'bigint', 'jsonb'],
  'service_role', array['EXECUTE'],
  'somente o serviço consulta fatos autorais em nome do proprietário'
);
select function_privs_are(
  'public', 'get_owned_course_authoring_analytics_for_actor_v1',
  array['uuid', 'uuid', 'bigint', 'jsonb'],
  'authenticated', array[]::text[],
  'o cliente não contorna a filtragem da Pesquisa'
);
select function_privs_are(
  'public', 'get_course_source_attachment_access_for_actor_v1',
  array['uuid', 'uuid', 'bigint', 'text', 'text', 'bigint', 'text', 'bigint', 'text'],
  'service_role', array['EXECUTE'],
  'somente o serviço autoriza upload ou download de PDF'
);
select function_privs_are(
  'public', 'get_course_source_attachment_access_for_actor_v1',
  array['uuid', 'uuid', 'bigint', 'text', 'text', 'bigint', 'text', 'bigint', 'text'],
  'authenticated', array[]::text[],
  'o cliente não emite acesso ao Storage diretamente'
);
select function_privs_are(
  'public', 'create_course_variants_for_actor_v1',
  array['uuid', 'uuid', 'bigint', 'jsonb', 'text'],
  'service_role', array['EXECUTE'],
  'somente o serviço cria variantes em nome do proprietário'
);
select function_privs_are(
  'public', 'create_course_variants_for_actor_v1',
  array['uuid', 'uuid', 'bigint', 'jsonb', 'text'],
  'authenticated', array[]::text[],
  'o cliente não contorna a autorização das variantes'
);
select function_privs_are(
  'public', 'load_course_personal_state_v2', array['uuid'],
  'authenticated', array['EXECUTE'],
  'a conta autenticada lê apenas o próprio estado pela RPC'
);
select function_privs_are(
  'public', 'load_course_personal_state_v2', array['uuid'],
  'anon', array[]::text[],
  'uma sessão anônima não lê estado pessoal'
);
select function_privs_are(
  'public', 'execute_my_course_anchored_annotation_command_v1',
  array['uuid', 'bigint', 'jsonb', 'text'],
  'authenticated', array['EXECUTE'],
  'o estudante registra observações pela RPC vinculada à própria conta'
);
select function_privs_are(
  'public', 'execute_my_course_anchored_annotation_command_v1',
  array['uuid', 'bigint', 'jsonb', 'text'],
  'anon', array[]::text[],
  'uma sessão anônima não registra observações'
);

select is(
  (
    select count(*)
    from pg_class relation_value
    join pg_namespace namespace_value on namespace_value.oid = relation_value.relnamespace
    where namespace_value.nspname = 'public'
      and relation_value.relname in ('courses', 'course_access', 'course_personal_states')
      and not relation_value.relrowsecurity
  ),
  0::bigint,
  'todas as relações públicas correntes de Curso usam RLS'
);

select is(
  (
    select count(*)
    from pg_class relation_value
    join pg_namespace namespace_value on namespace_value.oid = relation_value.relnamespace
    where namespace_value.nspname = 'private'
      and relation_value.relname in (
        'course_entities',
        'course_source_revisions',
        'course_source_attachments',
        'course_source_attributions',
        'course_anchored_annotations',
        'course_audit_findings',
        'course_authoring_corrections',
        'course_variant_comparison_sets',
        'course_variant_comparison_members'
      )
      and not relation_value.relrowsecurity
  ),
  0::bigint,
  'registros privados vinculados ao usuário usam RLS'
);

select ok(
  (
    select relation_value.relrowsecurity and relation_value.relforcerowsecurity
    from pg_class relation_value
    where relation_value.oid='private.course_personal_copies'::regclass
  ),
  'a relação de cópia pessoal força RLS como defesa adicional'
);

select is(
  (
    select count(*)
    from pg_constraint constraint_value
    join pg_attribute attribute_value
      on attribute_value.attrelid=constraint_value.conrelid
     and attribute_value.attnum=any(constraint_value.conkey)
    where constraint_value.conrelid='private.course_personal_copies'::regclass
      and constraint_value.contype='f'
      and attribute_value.attname='source_course_ref'
  ),
  0::bigint,
  'a referência histórica à origem não apaga a cópia com o Curso observado'
);

select ok(
  strpos(pg_get_functiondef(
    'private.list_courses_for_actor_v1(uuid,text,integer,timestamptz,uuid)'::regprocedure
  ),'''personalCopyCourseId''') > 0
  and strpos(pg_get_functiondef(
    'private.list_courses_for_actor_v1(uuid,text,integer,timestamptz,uuid)'::regprocedure
  ),'''canDerive''') > 0,
  'a lista distingue a origem compartilhada de sua cópia pessoal'
);

select ok(
  strpos(pg_get_functiondef(
    'private.get_course_for_actor_v1(uuid,uuid,boolean)'::regprocedure
  ),'''isPersonalCopy''') > 0
  and strpos(pg_get_functiondef(
    'private.get_course_for_actor_v1(uuid,uuid,boolean)'::regprocedure
  ),'''sourceCourseRevision''') > 0,
  'a leitura contextualiza uma cópia sem expor detalhes de infraestrutura'
);

select ok(
  exists(select 1 from storage.buckets where id = 'course-source-pdfs'),
  'o bucket de PDFs existe'
);

select is(
  (select public from storage.buckets where id = 'course-source-pdfs'),
  false,
  'o bucket de PDFs é privado'
);

select is(
  (select file_size_limit from storage.buckets where id = 'course-source-pdfs'),
  20971520::bigint,
  'cada PDF respeita o limite de 20 MiB'
);

select is(
  (select allowed_mime_types from storage.buckets where id = 'course-source-pdfs'),
  array['application/pdf']::text[],
  'o bucket aceita somente PDF'
);

select is(
  (
    select function_value.prosecdef
    from pg_proc function_value
    where function_value.oid =
      'private.can_read_course_source_pdf_v1(text)'::regprocedure
  ),
  true,
  'o helper de acesso ao PDF consulta o proprietário com privilégio protegido'
);

select ok(
  exists(
    select 1
    from pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname = 'course_source_pdfs_owner_select_v1'
      and strpos(policy.qual,'can_read_course_source_pdf_v1') > 0
      and strpos(policy.qual,'current_auth_session_is_active_v1') > 0
      and strpos(policy.qual,'courses') = 0
  ),
  'a leitura do PDF delega a autorização sem consultar Cursos sob authenticated'
);

select ok(
  not exists(
    select 1
    from pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname = 'course_source_pdfs_owner_delete_v1'
  ),
  'PDF vinculado não pode ser removido diretamente por sessão autenticada'
);

select has_table(
  'private',
  'course_access_grant_rate_limits',
  'a limitação de concessões mantém apenas contagens agregadas por ator'
);

select has_table(
  'private',
  'course_source_pdf_upload_intents',
  'o upload autenticado depende de uma intenção exata e temporária'
);

select has_function(
  'public',
  'derive_mcp_oauth_pairwise_id_v1',
  array['text','uuid','uuid'],
  'o token MCP deriva aliases distintos por domínio e cliente'
);

select has_function(
  'public',
  'aralearn_mcp_access_token_hook',
  array['jsonb'],
  'o Auth aplica a projeção mínima ao access token OAuth'
);

select has_function(
  'public',
  'resolve_mcp_oauth_principal_v1',
  array['uuid','uuid','uuid','uuid'],
  'a Edge resolve aliases assinados contra a sessão OAuth viva'
);

select function_privs_are(
  'public','derive_mcp_oauth_pairwise_id_v1',array['text','uuid','uuid'],
  'supabase_auth_admin',array['EXECUTE'],
  'somente o Auth deriva os aliases durante a emissão'
);

select function_privs_are(
  'public','aralearn_mcp_access_token_hook',array['jsonb'],
  'supabase_auth_admin',array['EXECUTE'],
  'somente o Auth executa o hook de access token'
);

select function_privs_are(
  'public','resolve_mcp_oauth_principal_v1',array['uuid','uuid','uuid','uuid'],
  'service_role',array['EXECUTE'],
  'somente o serviço resolve o principal OAuth'
);

select function_privs_are(
  'public','resolve_mcp_oauth_principal_v1',array['uuid','uuid','uuid','uuid'],
  'authenticated',array[]::text[],
  'a sessão comum não escolhe aliases para resolver outro ator'
);

select function_privs_are(
  'public','resolve_mcp_oauth_principal_v1',array['uuid','uuid','uuid','uuid'],
  'anon',array[]::text[],
  'uma sessão anônima não resolve principals OAuth'
);

select ok(
  strpos(
    pg_get_functiondef(
      'public.aralearn_mcp_access_token_hook(jsonb)'::regprocedure
    ),
    'offline_access'
  )>0
  and strpos(
    pg_get_functiondef(
      'public.aralearn_mcp_access_token_hook(jsonb)'::regprocedure
    ),
    '''aralearn_session_id'''
  )>0
  and strpos(
    pg_get_functiondef(
      'public.aralearn_mcp_access_token_hook(jsonb)'::regprocedure
    ),
    '''aralearn_actor_id'''
  )=0
  and strpos(
    pg_get_functiondef(
      'public.aralearn_mcp_access_token_hook(jsonb)'::regprocedure
    ),
    '''user_metadata'''
  )=0
  and strpos(
    pg_get_functiondef(
      'public.derive_mcp_oauth_pairwise_id_v1(text,uuid,uuid)'::regprocedure
    ),
    'SECURITY DEFINER'
  )>0,
  'o bearer usa offline_access, aliases pairwise e não carrega pessoa ou metadados'
);

select ok(
  strpos(
    pg_get_functiondef(
      'public.resolve_mcp_oauth_principal_v1(uuid,uuid,uuid,uuid)'::regprocedure
    ),
    'session_value.id=p_source_session_id'
  )>0
  and strpos(
    pg_get_functiondef(
      'public.resolve_mcp_oauth_principal_v1(uuid,uuid,uuid,uuid)'::regprocedure
    ),
    'oauth_consents'
  )>0
  and strpos(
    pg_get_functiondef(
      'public.resolve_mcp_oauth_principal_v1(uuid,uuid,uuid,uuid)'::regprocedure
    ),
    'offline_access'
  )>0,
  'a resolução usa lookup indexado e confronta cliente, sessão, escopo e consentimento'
);

select has_function(
  'private',
  'current_auth_session_is_active_v1',
  array[]::text[],
  'políticas sensíveis validam a sessão corrente no banco'
);

select has_function(
  'public',
  'enforce_aralearn_data_api_token_v1',
  array[]::text[],
  'a Data API possui uma barreira central para tokens OAuth do MCP'
);

select ok(
  exists(
    select 1
    from pg_roles role_value,
      unnest(coalesce(role_value.rolconfig,array[]::text[])) setting_value
    where role_value.rolname='authenticator'
      and setting_value=
        'pgrst.db_pre_request=public.enforce_aralearn_data_api_token_v1'
  )
  and strpos(
    pg_get_functiondef(
      'public.enforce_aralearn_data_api_token_v1()'::regprocedure
    ),
    'client_id'
  )>0,
  'PostgREST recusa client_id antes de despachar tabelas e RPCs'
);

select has_function(
  'private',
  'lock_current_account_storage_write_v1',
  array[]::text[],
  'uploads e exclusão da conta compartilham o mesmo lock'
);

select ok(
  strpos(
    pg_get_functiondef(
      'private.current_auth_session_is_active_v1()'::regprocedure
    ),
    'session_value.not_after'
  ) > 0
  and strpos(
    pg_get_functiondef(
      'private.current_auth_session_is_active_v1()'::regprocedure
    ),
    'client_id'
  ) > 0
  and strpos(
    pg_get_functiondef(
      'private.current_auth_session_is_active_v1()'::regprocedure
    ),
    'raise exception'
  ) > 0,
  'sessão viva inclui validade temporal e recusa explicitamente bearer OAuth do MCP'
);

select has_function(
  'private',
  'run_current_data_retention_v1',
  array['integer'],
  'a retenção corrente pode ser executada independentemente da abertura de Curso'
);

select has_function(
  'private',
  'inventory_current_data_orphans_v1',
  array['integer'],
  'órfãos são inventariados sem exclusão especulativa'
);

select ok(
  strpos(
    pg_get_functiondef(
      'public.manage_course_access_for_actor_v1(uuid,uuid,text,text,uuid,boolean,text)'::regprocedure
    ),
    'aralearn.course-access-grant-request.v1'
  ) > 0
  and strpos(
    pg_get_functiondef(
      'public.manage_course_access_for_actor_v1(uuid,uuid,text,text,uuid,boolean,text)'::regprocedure
    ),
    'account-delete:'
  ) > 0
  and strpos(
    split_part(
      split_part(
        pg_get_functiondef(
          'public.manage_course_access_for_actor_v1(uuid,uuid,text,text,uuid,boolean,text)'::regprocedure
        ),
        'v_hash :=',
        2
      ),
      'PERFORM pg_advisory_xact_lock',
      1
    ),
    'v_target_email'
  ) = 0,
  'a concessão responde genericamente, não inclui e-mail no hash e serializa com a exclusão do alvo'
);

select ok(
  exists(
    select 1
    from pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname = 'course_source_pdfs_owner_insert_v1'
      and strpos(policy.with_check, 'can_upload_course_source_pdf_v1') > 0
      and strpos(policy.with_check, 'metadata') > 0
  )
  and strpos(
    pg_get_functiondef(
      'private.can_upload_course_source_pdf_v1(text,jsonb)'::regprocedure
    ),
    'contentLength'
  ) > 0,
  'o upload de PDF autentica tamanho e tipo contra a autorização exata do banco'
);

select ok(
  (
    select count(*)
    from pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname in (
        'person_avatars_direct_relation_select_v1',
        'person_avatars_self_delete_v1'
      )
      and strpos(
        coalesce(policy.with_check, policy.qual, ''),
        'current_auth_session_is_active_v1'
      ) > 0
  ) = 2
  and exists(
    select 1
    from pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname = 'person_avatars_self_insert_v1'
      and strpos(
        policy.with_check,
        'lock_current_account_storage_write_v1'
      ) > 0
  )
  and strpos(
    pg_get_functiondef(
      'private.lock_current_account_storage_write_v1()'::regprocedure
    ),
    'pg_advisory_xact_lock'
  ) < strpos(
    pg_get_functiondef(
      'private.lock_current_account_storage_write_v1()'::regprocedure
    ),
    'current_auth_session_is_active_v1'
  ),
  'avatar confronta a sessão depois de disputar o lock de exclusão'
);

select ok(
  exists(
    select 1
    from cron.job job
    where job.jobname = 'aralearn-current-data-retention-v1'
      and job.schedule = '17 3 * * *'
      and job.command = 'select private.run_current_data_retention_v1(512);'
  ),
  'a limpeza limitada possui execução diária independente do uso de Cursos'
);

select ok(
  strpos(
    pg_get_functiondef('public.delete_my_account_v1(text)'::regprocedure),
    'delete from auth.sessions'
  ) > 0
  and strpos(
    pg_get_functiondef('public.delete_my_account_v1(text)'::regprocedure),
    'delete from auth.sessions'
  ) < strpos(
    pg_get_functiondef('public.delete_my_account_v1(text)'::regprocedure),
    'delete from auth.users'
  )
  and strpos(
    pg_get_functiondef('public.delete_my_account_v1(text)'::regprocedure),
    'client_id'
  ) > 0,
  'a exclusão exige sessão da aplicação e revoga sessões antes da conta'
);

select ok(
  strpos(
    pg_get_functiondef('public.delete_my_account_v1(text)'::regprocedure),
    'current_auth_session_is_active_v1'
  ) > strpos(
    pg_get_functiondef('public.delete_my_account_v1(text)'::regprocedure),
    'if not exists'
  )
  and strpos(
    pg_get_functiondef('public.delete_my_account_v1(text)'::regprocedure),
    'current_auth_session_is_active_v1'
  ) < strpos(
    pg_get_functiondef('public.delete_my_account_v1(text)'::regprocedure),
    'storage.objects'
  ),
  'a exclusão idempotente aceita conta ausente e exige sessão viva enquanto ela existe'
);

select * from finish();

rollback;
