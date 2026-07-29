begin;

select plan(6);

select has_function(
  'public',
  'get_aralearn_runtime_manifest',
  array[]::text[],
  'o banco expõe o manifesto público do runtime'
);

select is(
  public.get_aralearn_runtime_manifest() ->> 'schemaRevision',
  '20260729020000',
  'a revisão corresponde à migration mais recente exigida'
);

select is(
  public.get_aralearn_runtime_manifest() ->> 'contractVersion',
  '4',
  'o manifesto anuncia o contrato v4'
);

select ok(
  (public.get_aralearn_runtime_manifest() -> 'features') ? 'granular-sync',
  'o manifesto anuncia sincronização granular'
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
