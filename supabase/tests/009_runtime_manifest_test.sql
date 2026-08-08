begin;

select plan(48);

select has_function(
  'public',
  'get_aralearn_runtime_manifest',
  array[]::text[],
  'o banco expõe o manifesto público do runtime'
);

select hasnt_function(
  'public',
  'get_current_state_central_v1',
  array[]::text[],
  'a projeção categórica antiga da Central foi retirada'
);

select hasnt_function(
  'public',
  'list_current_state_central_v1',
  array['text', 'integer', 'timestamp with time zone', 'uuid', 'integer', 'uuid', 'text'],
  'a listagem categórica antiga da Central foi retirada'
);

select has_function(
  'public',
  'list_trail_items_v1',
  array['integer', 'uuid'],
  'Trilhas expõe planos e cursos em uma projeção paginada'
);

select function_privs_are(
  'public',
  'list_trail_items_v1',
  array['integer', 'uuid'],
  'authenticated',
  array['EXECUTE'],
  'somente uma conta autenticada lê Trilhas'
);

select has_function(
  'public',
  'reuse_unchanged_authoring_publication_v5',
  array[
    'uuid', 'uuid', 'text', 'text', 'bigint', 'text',
    'text', 'text', 'text', 'uuid', 'text', 'uuid'
  ],
  'o banco confirma publicação idêntica sem nova revisão'
);

select function_privs_are(
  'public',
  'reuse_unchanged_authoring_publication_v5',
  array[
    'uuid', 'uuid', 'text', 'text', 'bigint', 'text',
    'text', 'text', 'text', 'uuid', 'text', 'uuid'
  ],
  'service_role',
  array['EXECUTE'],
  'somente o executor interno chama a confirmação de publicação inalterada'
);

select has_function(
  'public',
  'delete_authoring_workspace_v5',
  array['uuid', 'uuid', 'text', 'text', 'bigint'],
  'a exclusão de workspace exige a revisão corrente'
);

select hasnt_function(
  'public',
  'delete_authoring_workspace_v5',
  array['uuid', 'uuid', 'text', 'text'],
  'a exclusão sem CAS foi retirada'
);

select is(
  public.get_aralearn_runtime_manifest() ->> 'schemaRevision',
  '20260808022000',
  'a revisão corresponde à migration mais recente exigida'
);

select is(
  public.get_aralearn_runtime_manifest() ->> 'contractVersion',
  '4',
  'o manifesto anuncia o contrato v4'
);

select ok(
  (public.get_aralearn_runtime_manifest() -> 'features') ? 'granular-sync',
  'o manifesto anuncia sincronização relacional granular'
);

select ok(
  (public.get_aralearn_runtime_manifest() -> 'features') ? 'atomic-card-assistance',
  'o manifesto anuncia assistência atômica de cards'
);

select ok(
  (public.get_aralearn_runtime_manifest() -> 'features') ? 'pre-registered-publication-artifacts',
  'o manifesto anuncia pré-registro coletável dos artefatos de publicação'
);

select ok(
  (public.get_aralearn_runtime_manifest() -> 'features') ? 'automatic-sync-history-maintenance',
  'o manifesto anuncia manutenção automática do histórico de sincronização'
);

select ok(
  (public.get_aralearn_runtime_manifest() -> 'features') ? 'workspace-publication-bindings',
  'o manifesto anuncia continuidade enxuta entre workspace e publicação'
);

select ok(
  (public.get_aralearn_runtime_manifest() -> 'features')
    ? 'unchanged-publication-short-circuit',
  'o manifesto anuncia republicação inalterada sem nova sincronização'
);

select ok(
  (public.get_aralearn_runtime_manifest() -> 'features')
    ? 'alphabetic-trails-v1',
  'o manifesto anuncia a ordenação alfabética de Trilhas'
);

select ok(
  (public.get_aralearn_runtime_manifest() -> 'features')
    ? 'alphabetic-catalog-v1',
  'o manifesto anuncia Coleções alfabéticas sem posição manual'
);

select hasnt_function(
  'public',
  'move_catalog_collection_v5',
  array['uuid', 'uuid', 'text', 'bigint', 'integer'],
  'o catálogo não expõe mais reordenação manual de Coleções'
);

select function_privs_are(
  'public',
  'move_catalog_course_v5',
  array['uuid', 'uuid', 'text', 'bigint', 'uuid'],
  'service_role',
  array['EXECUTE'],
  'somente o executor interno transfere cursos entre Coleções'
);

select has_function(
  'private',
  'protect_structural_catalog_collection_v1',
  array[]::text[],
  'o banco protege a identidade semântica da coleção Outros'
);

select has_trigger(
  'public',
  'catalog_collections',
  'catalog_collections_protect_structural_other_v1',
  'a proteção estrutural cobre toda mutação da coleção Outros'
);

select has_function(
  'public',
  'apply_situated_comment_batch_v1',
  array['uuid', 'jsonb'],
  'observações situadas usam uma RPC própria'
);

select function_privs_are(
  'public',
  'apply_situated_comment_batch_v1',
  array['uuid', 'jsonb'],
  'authenticated',
  array['EXECUTE'],
  'somente a conta autenticada sincroniza suas observações'
);

select ok(
  (public.get_aralearn_runtime_manifest() -> 'features')
    ? 'situated-personal-comments-v1',
  'o manifesto anuncia observações pessoais situadas'
);

select ok(
  (public.get_aralearn_runtime_manifest() -> 'features')
    ? 'workspace-pedagogical-comments-v1',
  'o manifesto anuncia triagem contextual das observações'
);

select ok(
  (public.get_aralearn_runtime_manifest() -> 'features')
    ? 'workspace-course-state-projection-v1',
  'o manifesto anuncia a composição corrente dos cursos do workspace'
);

select function_privs_are(
  'public',
  'list_current_educational_workspace_comments_v1',
  array['uuid', 'integer', 'timestamp with time zone', 'uuid', 'text[]', 'text[]'],
  'authenticated',
  array['EXECUTE'],
  'participantes autenticados consultam observações conforme o papel local'
);

select function_privs_are(
  'public',
  'manage_current_educational_workspace_comment_v1',
  array['text', 'uuid', 'uuid', 'text', 'jsonb'],
  'authenticated',
  array['EXECUTE'],
  'responsáveis autenticados respondem por uma operação contextual'
);

select function_privs_are(
  'public',
  'list_educational_workspace_comments_for_actor_v1',
  array['uuid', 'uuid', 'integer', 'timestamp with time zone', 'uuid', 'text[]', 'text[]'],
  'service_role',
  array['EXECUTE'],
  'somente o executor interno lista observações em nome do OAuth'
);

select function_privs_are(
  'public',
  'manage_educational_workspace_comment_for_actor_v1',
  array['uuid', 'text', 'uuid', 'uuid', 'text', 'jsonb'],
  'service_role',
  array['EXECUTE'],
  'somente o executor interno responde em nome do OAuth'
);

select ok(
  (public.get_aralearn_runtime_manifest() -> 'features') ? 'workspace-cursor-pagination',
  'o manifesto anuncia paginação completa dos workspaces'
);

select ok(
  (public.get_aralearn_runtime_manifest() -> 'features')
    ? 'workspace-microsequence-card-pagination',
  'o manifesto anuncia paginação leve dos cards de uma microssequência'
);

select ok(
  (public.get_aralearn_runtime_manifest() -> 'features')
    ? 'global-catalog-course-search',
  'o manifesto anuncia busca global e leve dos cursos do catálogo'
);

select ok(
  (public.get_aralearn_runtime_manifest() -> 'features') ? 'oauth-only-authoring-mcp',
  'o manifesto anuncia autoria remota exclusivamente por MCP OAuth'
);

select ok(
  (public.get_aralearn_runtime_manifest() -> 'features') ? 'default-catalog-collection',
  'o manifesto anuncia a coleção padrão para a primeira publicação oficial'
);

select ok(
  (public.get_aralearn_runtime_manifest() -> 'features') ? 'alphabetic-catalog-v1',
  'o manifesto anuncia Coleções alfabéticas sem posição manual'
);

select ok(
  not ((public.get_aralearn_runtime_manifest() -> 'features')
    ? 'catalog-collection-ordering-v1'),
  'o manifesto não anuncia o contrato retirado de ordenação manual'
);

select ok(
  (public.get_aralearn_runtime_manifest() -> 'features') ? 'confidential-gpt-action-oauth',
  'o manifesto anuncia a concessão confidencial específica da Action'
);

select ok(
  (public.get_aralearn_runtime_manifest() -> 'features') ? 'gpt-action-oauth-linking',
  'o manifesto anuncia o vínculo posterior do GPT salvo'
);

select ok(
  (public.get_aralearn_runtime_manifest() -> 'features') ? 'gpt-action-oauth-relinking',
  'o manifesto anuncia a substituição segura de um vínculo anterior'
);

select ok(
  (public.get_aralearn_runtime_manifest() -> 'features') ? 'gpt-action-oauth-stable-callback',
  'o manifesto anuncia callbacks oficiais estáveis da Action'
);

select ok(
  (public.get_aralearn_runtime_manifest() -> 'features') ? 'workspace-card-metadata',
  'o manifesto anuncia metadados de card no workspace composto'
);

select ok(
  (public.get_aralearn_runtime_manifest() -> 'features') ? 'structured-authoring-errors',
  'o manifesto anuncia diagnóstico estruturado da autoria'
);

select enum_has_labels(
  'public',
  'card_resource',
  array[
    'paragraph', 'choice', 'composite', 'code', 'table', 'flow',
    'tree', 'graph', 'relation_map', 'matrix', 'plane', 'formula',
    'chart', 'sequence', 'annotated_text', 'linguistic_example',
    'system_map', 'reaction'
  ],
  'o banco reconhece os dezoito resources canônicos'
);

select function_privs_are(
  'public',
  'get_aralearn_runtime_manifest',
  array[]::text[],
  'anon',
  array['EXECUTE'],
  'anon pode ler somente o manifesto constante de implantação'
);

select function_privs_are(
  'public',
  'get_aralearn_runtime_manifest',
  array[]::text[],
  'authenticated',
  array['EXECUTE'],
  'usuários autenticados também podem conferir o manifesto'
);

select * from finish();
rollback;
