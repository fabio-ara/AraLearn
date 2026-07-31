begin;

select plan(20);

select has_function(
  'public',
  'get_aralearn_runtime_manifest',
  array[]::text[],
  'o banco expõe o manifesto público do runtime'
);

select is(
  public.get_aralearn_runtime_manifest() ->> 'schemaRevision',
  '20260730140000',
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
