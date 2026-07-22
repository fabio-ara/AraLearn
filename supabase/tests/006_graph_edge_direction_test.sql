begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;
select no_plan();

select has_column(
  'public', 'block_edges', 'has_directed',
  'aresta preserva a presença opcional de directed'
);
select col_not_null(
  'public', 'block_edges', 'has_directed',
  'has_directed não aceita nulo'
);
select col_default_is(
  'public', 'block_edges', 'has_directed', 'false',
  'arestas anteriores mantêm directed omitido no contrato'
);
select ok(exists(
  select 1
  from pg_constraint constraint_row
  where constraint_row.conrelid = 'public.block_edges'::regclass
    and constraint_row.conname = 'block_edges_directed_presence'
    and constraint_row.contype = 'c'
    and constraint_row.convalidated
), 'directed explícito é exclusivo de arestas de grafo');

select is(
  private.local_row(
    'edges',
    jsonb_build_object(
      'contract_key', 'edge-1',
      'edge_role', 'graph',
      'edge_scope', 'graph',
      'directed', false,
      'has_directed', true,
      'created_at', '2026-07-23T00:00:00Z'
    )
  ),
  jsonb_build_object(
    'edgeScope', 'graph',
    'directed', false,
    'hasDirected', true
  ),
  'réplica recebe directed e hasDirected sem metadados internos'
);

select is(
  (select procedure.provolatile::text
   from pg_proc procedure
   where procedure.oid = 'private.local_row(text,jsonb)'::regprocedure),
  's',
  'serialização local mantém volatilidade coerente com o catálogo'
);

select * from finish();
rollback;
