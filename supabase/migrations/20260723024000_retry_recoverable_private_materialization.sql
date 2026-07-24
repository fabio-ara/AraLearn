begin;

-- Uma falha genérica do banco não identifica uma violação do contrato. Esta
-- execução foi reproduzida integralmente em transação reversível após a falha,
-- portanto pode voltar à fila idempotente de materialização privada.
update private.authoring_runs
set publication_error = null,
    publication_lease_token = null,
    publication_lease_until = null,
    updated_at = now()
where id = '99186199-d202-5164-b737-daa86298adb6'::uuid
  and publication_target = 'private'
  and status = 'publishing'
  and publication_step = 18
  and publication_error @> jsonb_build_object(
    'kind', 'deterministic',
    'code', 'database_error',
    'message', 'A operação no banco não pôde ser concluída.'
  );

commit;
