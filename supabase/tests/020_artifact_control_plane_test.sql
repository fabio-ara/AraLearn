begin;

select plan(41);

select has_table(
  'private',
  'authoring_workspaces',
  'workspace composto conserva somente o controle atual'
);
select has_table(
  'private',
  'authoring_workspace_entities',
  'entidades correntes substituem snapshots do workspace'
);
select has_table(
  'private',
  'authoring_workspace_requests',
  'pedidos idempotentes possuem retenção limitada'
);
select has_table(
  'private',
  'authoring_workspace_events',
  'eventos resumidos tornam a autoria compreensível'
);
select has_table(
  'private',
  'authoring_workspace_publications',
  'cada curso do workspace conserva seu vínculo de publicação'
);
select hasnt_table(
  'private',
  'authoring_workspace_revisions',
  'snapshots históricos do workspace foram removidos'
);
select has_table(
  'private',
  'catalog_review_submissions',
  'submissões editoriais possuem plano de controle próprio'
);

select has_column(
  'private',
  'authoring_workspaces',
  'brief',
  'workspace conserva um brief textual compacto'
);
select has_column(
  'private',
  'authoring_workspace_entities',
  'content',
  'cada entidade possui somente seu conteúdo corrente'
);
select has_column(
  'private',
  'authoring_workspace_requests',
  'expires_at',
  'recibos temporários declaram expiração'
);
select has_column(
  'private',
  'authoring_workspace_events',
  'summary',
  'eventos guardam somente resumo limitado'
);
select has_column(
  'private',
  'authoring_workspace_publications',
  'workspace_course_id',
  'o vínculo identifica a raiz do curso no workspace'
);
select has_column(
  'private',
  'authoring_workspace_publications',
  'target',
  'o vínculo separa biblioteca privada e catálogo'
);
select has_column(
  'private',
  'authoring_workspace_publications',
  'course_id',
  'o vínculo conserva a identidade publicada'
);
select has_column(
  'private',
  'authoring_workspace_publications',
  'content_hash',
  'o vínculo conserva somente o baseline de concorrência'
);
select hasnt_column(
  'private',
  'authoring_workspaces',
  'current_artifact_hash',
  'workspace não conserva ponteiro para snapshot no Storage'
);
select has_column(
  'private',
  'catalog_review_submissions',
  'claim_expires_at',
  'claim editorial possui lease explícita'
);

select ok(
  exists (
    select 1
    from pg_indexes index_value
    where index_value.schemaname = 'private'
      and index_value.indexname =
        'catalog_review_submissions_active_course_v5_uidx'
      and index_value.indexdef like
        '%UNIQUE INDEX%author_id, source_course_id%'
      and index_value.indexdef like
        '%WHERE (status = ANY%submitted%in_review%'
  ),
  'há no máximo uma submissão ativa por autor e curso'
);
select ok(
  not exists (
    select 1
    from pg_constraint constraint_value
    where constraint_value.conname =
      'catalog_review_submissions_revision_unique_v5'
  ),
  'histórico fechado pode reenviar o mesmo hash'
);
select ok(
  (
    select pg_get_constraintdef(constraint_value.oid)
    from pg_constraint constraint_value
    where constraint_value.conname =
      'catalog_review_submissions_status_v5'
  ) like '%superseded%',
  'submissão substituída possui estado fechado explícito'
);
select ok(
  pg_get_functiondef(
    'public.list_catalog_reviews_v5(uuid,text,integer,timestamptz,uuid)'::regprocedure
  ) like '%sourceRevisionHash%'
  and pg_get_functiondef(
    'public.list_catalog_reviews_v5(uuid,text,integer,timestamptz,uuid)'::regprocedure
  ) like '%reviewerNote%'
  and pg_get_functiondef(
    'public.list_catalog_reviews_v5(uuid,text,integer,timestamptz,uuid)'::regprocedure
  ) like '%decidedAt%',
  'autor lê hash, feedback e decisão sem reter o artefato'
);
select ok(
  pg_get_functiondef(
    'public.claim_catalog_review_v5(uuid,uuid)'::regprocedure
  ) like '%interval ''30 minutes''%'
  and pg_get_functiondef(
    'public.claim_catalog_review_v5(uuid,uuid)'::regprocedure
  ) like '%close_catalog_review_workspace_v5%',
  'claim editorial expira e limpa workspace abandonado'
);

select has_function(
  'public',
  'create_authoring_workspace_v5',
  'criação composta está disponível'
);
select has_function(
  'public',
  'commit_authoring_workspace_changes_v5',
  'commit incremental com CAS está disponível'
);
select has_function(
  'public',
  'get_authoring_workspace_v5',
  'leitura recompõe as entidades correntes'
);
select has_function(
  'public',
  'list_authoring_workspaces_v5',
  'listagem paginada de workspaces está disponível'
);
select has_function(
  'public',
  'list_authoring_workspace_events_v5',
  'histórico resumido paginado está disponível'
);
select has_function(
  'public',
  'publish_authoring_workspace_course_v5',
  'publicação materializa somente o curso selecionado'
);
select has_function(
  'public',
  'delete_authoring_workspace_v5',
  'exclusão lógica do workspace está disponível'
);
select has_function(
  'public',
  'register_authoring_artifact_v5',
  'artefato de publicação pode ser pré-registrado'
);
select has_function(
  'private',
  'maintain_sync_history_v5',
  'feed pessoal possui manutenção automática limitada'
);
select has_trigger(
  'private',
  'sync_changes',
  'sync_history_maintenance_v5',
  'escritas acionam o gate diário de manutenção'
);
select has_trigger(
  'private',
  'authoring_workspace_entities',
  'authoring_workspace_course_publication_cleanup_v5',
  'remover a raiz elimina seus vínculos'
);
select has_trigger(
  'public',
  'courses',
  'archived_course_publication_cleanup_v5',
  'arquivar uma publicação elimina seus vínculos'
);

do $setup$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
end;
$setup$;

insert into private.artifact_refs(
  hash,
  bucket,
  object_key,
  artifact_type,
  media_type,
  size_bytes,
  created_at
) values (
  repeat('f', 64),
  'aralearn-authoring-artifacts',
  'artifacts/sha256/ff/ff/'
    || repeat('f', 64)
    || '.json',
  'aralearn.authoring-workspace',
  'application/json',
  17,
  now() - interval '10 days'
)
on conflict(hash) do update
set bucket = excluded.bucket,
    object_key = excluded.object_key,
    artifact_type = excluded.artifact_type,
    media_type = excluded.media_type,
    size_bytes = excluded.size_bytes,
    created_at = excluded.created_at;

create temporary table artifact_promotion_result on commit drop as
select public.register_authoring_artifact_v5(
  jsonb_build_object(
    'hash', repeat('f', 64),
    'bucket', 'aralearn-authoring-artifacts',
    'objectKey',
      'artifacts/sha256/ff/ff/'
        || repeat('f', 64)
        || '.json',
    'artifactType', 'aralearn.course-revision',
    'mediaType', 'application/json',
    'sizeBytes', 17
  )
) as value;

select is(
  (select value->>'registered' from artifact_promotion_result),
  'true',
  'pré-registro confirma a referência'
);
select is(
  (select value->>'artifactType' from artifact_promotion_result),
  'aralearn.course-revision',
  'resposta devolve a classificação canônica'
);
select is(
  (select value->>'mediaType' from artifact_promotion_result),
  'application/json',
  'resposta devolve o media type canônico'
);
select is(
  (select value->>'bucket' from artifact_promotion_result),
  'aralearn-authoring-artifacts',
  'objeto legado é reutilizado no bucket em que já existe'
);
select is(
  (
    select artifact.artifact_type
    from private.artifact_refs artifact
    where artifact.hash = repeat('f', 64)
  ),
  'aralearn.course-revision',
  'registro legado é promovido sem duplicação'
);
select is(
  (
    select count(*)
    from private.artifact_refs artifact
    where artifact.hash = repeat('f', 64)
  ),
  1::bigint,
  'promoção conserva uma só linha por conteúdo'
);
select ok(
  (
    select artifact.created_at > now() - interval '1 minute'
    from private.artifact_refs artifact
    where artifact.hash = repeat('f', 64)
  ),
  'promoção renova o prazo antes do upload'
);

select * from finish();
rollback;
