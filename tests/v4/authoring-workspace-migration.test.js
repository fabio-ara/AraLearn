import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function readProjectText(path) {
  return fs.readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/gu, "\n");
}

const composedMigration = readProjectText(
  "../../supabase/migrations/20260730140000_composed_authoring_and_catalog_review.sql"
);
const workspaceCardTopicsMigration = readProjectText(
  "../../supabase/migrations/20260731120000_fix_workspace_card_topics.sql"
);
const unchangedPublicationMigration = readProjectText(
  "../../supabase/migrations/20260731160000_skip_unchanged_workspace_publication.sql"
);
const atomicPrivateCourseRemovalMigration = readProjectText(
  "../../supabase/migrations/20260804160000_atomic_private_course_removal.sql"
);
const catalogCollectionReorderingMigration = readProjectText(
  "../../supabase/migrations/20260804170000_catalog_collection_reordering.sql"
);
const engine = readProjectText(
  "../../supabase/functions/_shared/aralearn-authoring/workspaceEngine.js"
);
const privateScopeMigration = readProjectText(
  "../../supabase/migrations/20260729030000_accept_private_workspace_scopes.sql"
);
const ownerIsolationMigration = readProjectText(
  "../../supabase/migrations/20260729040000_deny_cross_owner_workspace_reads.sql"
);
const oauthPublicationMigration = readProjectText(
  "../../supabase/migrations/20260729050000_authoring_mcp_oauth_and_publication.sql"
);
const hardeningMigration = readProjectText(
  "../../supabase/migrations/20260729070000_authoring_workspace_hardening.sql"
);
const oauthOnlyMigration = readProjectText(
  "../../supabase/migrations/20260729080000_remove_static_authoring_api.sql"
);
const defaultCollectionMigration = readProjectText(
  "../../supabase/migrations/20260729090000_catalog_default_collection.sql"
);
const actionOAuthMigration = readProjectText(
  "../../supabase/migrations/20260730100000_authoring_action_oauth.sql"
);
const actionOAuthLinkMigration = readProjectText(
  "../../supabase/migrations/20260730110000_link_chatgpt_action_oauth.sql"
);
const actionOAuthRelinkMigration = readProjectText(
  "../../supabase/migrations/20260730120000_allow_relink_chatgpt_action_oauth.sql"
);
const actionOAuthStableCallbackMigration = readProjectText(
  "../../supabase/migrations/20260730130000_stabilize_chatgpt_action_callback.sql"
);
const supabaseConfig = readProjectText("../../supabase/config.toml");

function functionBlock(source, qualifiedName) {
  const escaped = qualifiedName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const definition = source.match(
    new RegExp(
      `create(?: or replace)? function ${escaped}\\([\\s\\S]*?\\nas (\\$[A-Za-z_]*\\$)[\\s\\S]*?\\n\\1;`,
      "u"
    )
  )?.[0];
  assert.ok(definition, `Definição ausente: ${qualifiedName}`);
  return definition;
}

test("migração v5 substitui snapshots de workspace por partes correntes", () => {
  for (const retired of [
    "private.authoring_workspace_revisions",
    "private.authoring_workspace_requests",
    "private.authoring_workspaces"
  ]) {
    assert.match(
      composedMigration,
      new RegExp(`drop table if exists ${retired.replace(".", "\\.")} cascade`, "u")
    );
  }
  for (const table of [
    "private.authoring_workspaces",
    "private.authoring_workspace_entities",
    "private.authoring_workspace_requests",
    "private.authoring_workspace_events"
  ]) {
    assert.match(
      composedMigration,
      new RegExp(`create table ${table.replace(".", "\\.")}`, "u")
    );
  }
  const workspaceTable = composedMigration.slice(
    composedMigration.indexOf("create table private.authoring_workspaces"),
    composedMigration.indexOf("create index authoring_workspaces_owner_v5_idx")
  );
  assert.match(workspaceTable, /revision bigint not null default 1/u);
  assert.doesNotMatch(workspaceTable, /artifact|snapshot|document_hash/u);
  assert.match(
    composedMigration,
    /primary key\(workspace_id, entity_type, entity_id\)/u
  );
  assert.match(
    composedMigration,
    /not \(content \? 'courses'\)[\s\S]+not \(content \? 'cards'\)/u
  );
  assert.doesNotMatch(
    composedMigration,
    /create table private\.authoring_workspace_revisions/u
  );
});

test("migração corretiva admite topics somente como conteúdo atômico de card", () => {
  assert.match(
    workspaceCardTopicsMigration,
    /drop constraint if exists authoring_workspace_entities_content_v5/u
  );
  assert.match(
    workspaceCardTopicsMigration,
    /entity_type = 'lesson'[\s\S]+content \? 'topics'/u
  );
  assert.doesNotMatch(
    workspaceCardTopicsMigration,
    /and not \(content \? 'topics'\)/u
  );
  assert.match(
    workspaceCardTopicsMigration,
    /preserva topics, languageTag e textDirection válidos dos cards/u
  );
  assert.match(
    workspaceCardTopicsMigration,
    /create or replace function private\.validate_authoring_workspace_entity_content_v5\(\)[\s\S]+workspace_entity_content_separation/u
  );
  assert.match(
    workspaceCardTopicsMigration,
    /before insert or update of entity_type, entity_id, content/u
  );
  assert.match(
    workspaceCardTopicsMigration,
    /'schemaRevision', '20260731120000'[\s\S]+'workspace-card-metadata'[\s\S]+'structured-authoring-errors'/u
  );
});

test("republicação idêntica confirma a intenção sem nova revisão ou sincronização", () => {
  const reuse = functionBlock(
    unchangedPublicationMigration,
    "public.reuse_unchanged_authoring_publication_v5"
  );
  assert.match(
    reuse,
    /publication\.content_hash = p_content_hash[\s\S]+course\.current_revision_hash = v_publication\.content_hash/u
  );
  assert.match(reuse, /course\.completion_state = p_completion_state/u);
  assert.match(reuse, /'publicationSeq', v_publication_seq/u);
  assert.match(reuse, /'unchanged', true/u);
  assert.doesNotMatch(reuse, /course_revisions|course_revision_sync_changes/u);
  assert.match(
    unchangedPublicationMigration,
    /'schemaRevision', '20260731160000'[\s\S]+'unchanged-publication-short-circuit'/u
  );
});

test("mutação composta usa replay v5, compare-and-swap e diffs pequenos", () => {
  assert.match(composedMigration, /replay_authoring_workspace_request_v5/u);
  assert.match(composedMigration, /commit_authoring_workspace_changes_v5/u);
  assert.match(composedMigration, /for update;/u);
  assert.match(composedMigration, /v_workspace\.revision <> p_expected_revision/u);
  assert.match(composedMigration, /p_changes->'upserts'/u);
  assert.match(composedMigration, /p_changes->'deletes'/u);
  assert.match(composedMigration, /requestId reutilizado com dados diferentes/u);

  const replayPosition = engine.indexOf("const replayed = await this.#replay");
  const readPosition = engine.indexOf(
    "const current = await this.#workspaceDocument",
    replayPosition
  );
  assert.ok(replayPosition >= 0 && readPosition > replayPosition);
});

test("publicação parcial é privada e o catálogo exige curso completo", () => {
  assert.match(
    composedMigration,
    /p_target = 'catalog' and p_completion_state <> 'complete'/u
  );
  assert.match(
    composedMigration,
    /completion_state in \('partial', 'complete'\)/u
  );
  assert.match(composedMigration, /publish_private_preview/u);
  assert.match(composedMigration, /publish_catalog_complete/u);
});

test("cada raiz do workspace conserva vínculos independentes de publicação por destino", () => {
  const publicationTable = composedMigration.slice(
    composedMigration.indexOf(
      "create table private.authoring_workspace_publications"
    ),
    composedMigration.indexOf(
      "create index authoring_workspace_publications_course_v5_idx"
    )
  );
  assert.match(
    publicationTable,
    /primary key\(workspace_id, workspace_course_id, target\)/u
  );
  assert.match(
    publicationTable,
    /unique\(workspace_id, target, course_id\)/u
  );
  assert.match(publicationTable, /target in \('private', 'catalog'\)/u);
  assert.match(publicationTable, /content_hash ~ '\^\[0-9a-f\]\{64\}\$'/u);
  assert.doesNotMatch(publicationTable, /document|artifact|snapshot/u);
});

test("uma publicação possui uma única composição ativa sem comparar títulos", () => {
  const reserve = functionBlock(
    atomicPrivateCourseRemovalMigration,
    "public.resume_or_reserve_authoring_workspace_v1"
  );
  const finalize = functionBlock(
    atomicPrivateCourseRemovalMigration,
    "public.finalize_reserved_authoring_workspace_v1"
  );
  assert.match(
    atomicPrivateCourseRemovalMigration,
    /create unique index authoring_workspace_publications_current_course_v1_idx[\s\S]+\(course_id, target\)/u
  );
  assert.match(
    atomicPrivateCourseRemovalMigration,
    /create unique index authoring_workspaces_current_source_course_v1_idx[\s\S]+on private\.authoring_workspaces\(source_course_id\)[\s\S]+source_submission_id is null/u
  );
  assert.match(
    atomicPrivateCourseRemovalMigration,
    /partition by publication\.course_id, publication\.target[\s\S]+publication\.content_hash = course\.current_revision_hash[\s\S]+delete from private\.authoring_workspace_publications[\s\S]+returning publication\.workspace_id, publication\.course_id/u
  );
  assert.match(
    atomicPrivateCourseRemovalMigration,
    /resume_or_reserve_authoring_workspace_v1[\s\S]+publication\.course_id = p_course_id[\s\S]+educational_workspace_can_v1/u
  );
  assert.match(
    atomicPrivateCourseRemovalMigration,
    /finalize_reserved_authoring_workspace_v1[\s\S]+pg_advisory_xact_lock[\s\S]+create_authoring_workspace_v5/u
  );
  assert.match(
    reserve,
    /v_reservation\.owner_id <> p_actor_id[\s\S]+v_reservation\.request_id <> p_request_id[\s\S]+v_reservation\.payload_hash <> p_payload_hash[\s\S]+errcode = '40001'/u
  );
  assert.match(
    reserve,
    /expires_at <= statement_timestamp\(\)[\s\S]+limit 256[\s\S]+for update skip locked/u
  );
  assert.match(
    finalize,
    /reservation\.request_id = p_request_id[\s\S]+reservation\.payload_hash = p_payload_hash/u
  );
  assert.ok(
    reserve.indexOf("for share;")
      < reserve.indexOf("perform pg_advisory_xact_lock"),
    "a abertura deve travar o curso antes da chave de composição"
  );
  assert.ok(
    finalize.indexOf("for share;")
      < finalize.indexOf("perform pg_advisory_xact_lock"),
    "a finalização deve manter a mesma ordem de locks"
  );
  assert.doesNotMatch(
    atomicPrivateCourseRemovalMigration,
    /partition by[^\n]*title|where[^\n]*title\s*=/u
  );
});

test("conflito de identidade da publicação é serializado e explicativo", () => {
  const guard = functionBlock(
    atomicPrivateCourseRemovalMigration,
    "private.guard_authoring_workspace_publication_identity_v1"
  );
  assert.match(
    guard,
    /pg_advisory_xact_lock[\s\S]+new\.course_id[\s\S]+new\.target/u
  );
  assert.match(
    guard,
    /publication\.course_id = new\.course_id[\s\S]+is distinct from[\s\S]+workspace\.source_course_id = new\.course_id[\s\S]+workspace\.id <> new\.workspace_id[\s\S]+errcode = '40001'/u
  );
  assert.match(
    atomicPrivateCourseRemovalMigration,
    /before insert or update of workspace_id, workspace_course_id, target, course_id[\s\S]+guard_authoring_workspace_publication_identity_v1/u
  );
});

test("publicador do catálogo acessa dinamicamente a composição oficial", () => {
  const capability = functionBlock(
    atomicPrivateCourseRemovalMigration,
    "private.educational_workspace_can_v1"
  );
  assert.match(
    capability,
    /p_capability in \('read', 'author', 'review', 'comment', 'publish', 'manage'\)[\s\S]+can_publish_catalog_v5\(p_actor_id\)[\s\S]+publication\.target = 'catalog'/u
  );
  assert.doesNotMatch(
    capability,
    /p_capability in \([^)]*transfer/u
  );
});

test("retirada privada encerra a composição antes de o binding desaparecer", () => {
  const trigger = functionBlock(
    atomicPrivateCourseRemovalMigration,
    "private.close_archived_course_compositions_v1"
  );
  const detach = functionBlock(
    atomicPrivateCourseRemovalMigration,
    "private.detach_course_compositions_v1"
  );
  assert.match(
    atomicPrivateCourseRemovalMigration,
    /before update of status, deleted_at, document_storage_enabled or delete[\s\S]+on public\.courses/u
  );
  assert.match(
    trigger,
    /tg_op = 'DELETE'[\s\S]+detach_course_compositions_v1[\s\S]+return old/u
  );
  assert.doesNotMatch(trigger, /old\.owner_id is not null/u);
  assert.match(trigger, /detach_course_compositions_v1/u);
  assert.match(
    detach,
    /publication\.course_id = p_course_id[\s\S]+workspace\.deleted_at is null/u
  );
  assert.match(
    detach,
    /delete from private\.authoring_course_workspace_reservations[\s\S]+reservation\.course_id = p_course_id/u
  );
  assert.match(
    detach,
    /if v_course_count <= 1 then[\s\S]+discard_authoring_workspace_v1/u
  );
  assert.match(
    detach,
    /with recursive subtree[\s\S]+delete from private\.authoring_workspace_entities/u
  );
  assert.match(detach, /row_number\(\) over \([\s\S]+\)::integer - 1/u);
  assert.match(
    detach,
    /perform 1\s+from private\.authoring_workspaces workspace[\s\S]+for update;[\s\S]+perform 1\s+from private\.authoring_workspace_publications publication[\s\S]+for update;/u
  );
  assert.match(
    atomicPrivateCourseRemovalMigration,
    /close_preexisting_archived_compositions[\s\S]+detach_course_compositions_v1[\s\S]+source_revision_hash is not null[\s\S]+source_course\.status <> 'published'[\s\S]+set source_course_id = null/u
  );
  assert.match(
    atomicPrivateCourseRemovalMigration,
    /reconcile_preexisting_course_compositions[\s\S]+source_course_id = v_course\.id[\s\S]+source_revision_hash = v_course\.current_revision_hash[\s\S]+insert into private\.authoring_workspace_publications/u
  );
  assert.match(
    atomicPrivateCourseRemovalMigration,
    /workspace\.id is distinct from v_canonical_workspace_id[\s\S]+set source_course_id = null/u
  );
});

test("retirada oficial limpa todas as seleções diretas", () => {
  const capture = functionBlock(
    atomicPrivateCourseRemovalMigration,
    "private.capture_catalog_publication"
  );
  const selectionGuard = functionBlock(
    atomicPrivateCourseRemovalMigration,
    "private.guard_active_course_selection_v1"
  );
  assert.match(
    capture,
    /delete from public\.user_course_selections selection[\s\S]+selection\.course_id = new\.id/u
  );
  assert.match(
    capture,
    /old\.document_storage_enabled[\s\S]+not new\.document_storage_enabled/u
  );
  assert.match(
    capture,
    /insert into private\.sync_changes[\s\S]+'coursePublication'[\s\S]+'publish'/u
  );
  assert.match(
    selectionGuard,
    /course\.status = 'published'[\s\S]+course\.deleted_at is null[\s\S]+course\.document_storage_enabled[\s\S]+for share/u
  );
  assert.match(
    atomicPrivateCourseRemovalMigration,
    /before insert or update of course_id on public\.user_course_selections[\s\S]+guard_active_course_selection_v1/u
  );
});

test("exclusão do workspace aplica expectedRevision até o RPC SQL", () => {
  const deletion = functionBlock(
    atomicPrivateCourseRemovalMigration,
    "public.delete_authoring_workspace_v5"
  );
  assert.match(
    atomicPrivateCourseRemovalMigration,
    /drop function public\.delete_authoring_workspace_v5\(uuid, uuid, text, text\)/u
  );
  assert.match(deletion, /p_expected_revision bigint/u);
  assert.match(
    deletion,
    /v_workspace\.revision <> p_expected_revision[\s\S]+errcode = '40001'/u
  );
  assert.match(
    deletion,
    /educational_workspace_can_v1\([\s\S]+p_owner_id, 'manage'/u
  );
  assert.match(
    atomicPrivateCourseRemovalMigration,
    /discard_authoring_workspace_v1[\s\S]+authoring_workspace_observation_receipts[\s\S]+educational_workspace_receipts[\s\S]+authoring_workspace_requests/u
  );
  assert.match(
    atomicPrivateCourseRemovalMigration,
    /'schemaRevision', '20260804160000'[\s\S]+'workspace-delete-cas-v1'[\s\S]+'atomic-private-course-removal-v1'/u
  );
});

test("Trilhas projeta CAS e capacidades sem reconstruir identidade", () => {
  const trails = functionBlock(
    atomicPrivateCourseRemovalMigration,
    "public.list_trail_items_v1"
  );
  assert.match(trails, /'contentHash', page\.content_hash/u);
  assert.match(trails, /'canRemove', page\.can_remove/u);
  assert.match(
    trails,
    /publication\.target = 'catalog'[\s\S]+private\.can_publish_catalog_v5\(v_user_id\)/u
  );
  assert.match(
    trails,
    /educational_workspace_can_v1\([\s\S]+workspace\.id, v_user_id, 'author'[\s\S]+as can_edit/u
  );
  assert.match(
    trails,
    /selection\.id is not null and \([\s\S]+publication\.target = 'catalog'[\s\S]+publication\.course_owner_id = v_user_id[\s\S]+\) as can_remove/u
  );
  assert.match(
    trails,
    /when link\.target = 'catalog'[\s\S]+can_publish_catalog_v5\(v_user_id\) then 0[\s\S]+when link\.target = 'private' then 1/u
  );
  assert.match(
    trails,
    /null::text as content_hash[\s\S]+false as can_remove/u
  );
  assert.match(
    trails,
    /accessible_workspaces as materialized \([\s\S]+educational_workspace_can_v1\([\s\S]+workspace\.id, v_user_id, 'read'/u
  );
  assert.doesNotMatch(
    trails,
    /accessible_workspaces as materialized \([\s\S]{0,300}join private\.educational_workspace_members/u
  );
});

test("abertura por publicação semeia o destino real e importação permanece cópia", () => {
  const create = functionBlock(
    composedMigration,
    "public.create_authoring_workspace_v5"
  );
  assert.match(
    create,
    /select case when course\.owner_id is null then 'catalog' else 'private' end\s+into v_source_target/u
  );
  assert.match(
    create,
    /if v_source_target is not null then[\s\S]+v_course_count <> 1[\s\S]+insert into private\.authoring_workspace_publications/u
  );
  assert.ok(
    create.indexOf("perform private.validate_authoring_workspace_v5")
      < create.indexOf("insert into private.authoring_workspace_publications")
  );
  const importStart = engine.indexOf("  async importCourse({");
  const importEnd = engine.indexOf("  async publish({", importStart);
  const importCourse = engine.slice(importStart, importEnd);
  assert.match(importCourse, /p_operation: operation/u);
  assert.doesNotMatch(
    importCourse,
    /authoring_workspace_publications|publicationMode|existingCourseId/u
  );
});

test("leitura expõe vínculos e listagem resume sua quantidade", () => {
  const read = functionBlock(
    composedMigration,
    "public.get_authoring_workspace_v5"
  );
  const list = functionBlock(
    composedMigration,
    "public.list_authoring_workspaces_v5"
  );
  assert.match(
    read,
    /'publications', coalesce\([\s\S]+workspaceCourseId[\s\S]+contentHash[\s\S]+completionState[\s\S]+updatedAt/u
  );
  assert.match(
    read,
    /from private\.authoring_workspace_publications publication[\s\S]+publication\.workspace_id = v_workspace\.id/u
  );
  assert.match(
    list,
    /'publicationCount', \([\s\S]+count\(\*\)[\s\S]+private\.authoring_workspace_publications/u
  );
});

test("publicação escolhe create/update pelo vínculo e aplica CAS sem modo legado", () => {
  const publish = functionBlock(
    composedMigration,
    "public.publish_authoring_workspace_course_v5"
  );
  assert.doesNotMatch(publish, /p_publication_mode|publicationMode/u);
  assert.match(
    publish,
    /\(p_existing_course_id is null\) <>\s+\(p_expected_content_hash is null\)/u
  );
  assert.match(
    publish,
    /from private\.authoring_workspace_publications publication[\s\S]+publication\.workspace_course_id = v_workspace_course_id[\s\S]+publication\.target = p_target[\s\S]+for update/u
  );
  assert.match(
    publish,
    /if found then[\s\S]+v_course_id := v_publication\.course_id;[\s\S]+v_baseline_hash := v_publication\.content_hash/u
  );
  assert.match(
    publish,
    /course\.current_revision_hash is not distinct from v_baseline_hash[\s\S]+course\.revision_artifact_hash is not distinct from v_baseline_hash/u
  );
  assert.match(
    publish,
    /insert into private\.authoring_workspace_publications\([\s\S]+on conflict\(workspace_id, workspace_course_id, target\) do update[\s\S]+set content_hash = excluded\.content_hash/u
  );
});

test("remoção da raiz ou arquivamento da publicação elimina o vínculo", () => {
  const cleanup = functionBlock(
    atomicPrivateCourseRemovalMigration,
    "private.cleanup_workspace_course_publication_v5"
  );
  assert.match(
    composedMigration,
    /create trigger authoring_workspace_course_publication_cleanup_v5[\s\S]+after delete on private\.authoring_workspace_entities/u
  );
  assert.match(
    composedMigration,
    /if old\.entity_type = 'course' then[\s\S]+delete from private\.authoring_workspace_publications/u
  );
  assert.match(
    cleanup,
    /publication\.course_id = workspace\.source_course_id[\s\S]+delete from private\.authoring_workspace_publications/u
  );
  assert.match(
    cleanup,
    /set source_course_id = null,[\s\S]+source_revision_hash = null/u
  );
  assert.match(
    composedMigration,
    /create trigger archived_course_publication_cleanup_v5[\s\S]+after update of status, deleted_at, document_storage_enabled on public\.courses[\s\S]+new\.status <> 'published'/u
  );
});

test("abertura composta usa o mesmo teto de 32 MiB da publicação", () => {
  const create = functionBlock(
    composedMigration,
    "public.create_authoring_workspace_v5"
  );
  assert.match(create, /pg_column_size\(p_rows\) > 33554432/u);
  assert.doesNotMatch(create, /16777216/u);
});

test("conta editorial publica direto e submissão continua vinculada ao workspace de revisão", () => {
  const publish = functionBlock(
    composedMigration,
    "public.publish_authoring_workspace_course_v5"
  );
  assert.doesNotMatch(
    publish,
    /p_target = 'catalog' and p_submission_id is null/u
  );
  assert.match(
    publish,
    /p_target = 'catalog'[\s\S]+v_workspace\.source_submission_id is distinct from p_submission_id/u
  );
  assert.match(
    publish,
    /if p_submission_id is not null then[\s\S]+v_submission\.status <> 'in_review'[\s\S]+v_submission\.review_workspace_id is distinct from p_workspace_id/u
  );
});

test("GC retém somente cursos publicados e submissões, nunca snapshots de workspace", () => {
  const collector = functionBlock(
    composedMigration,
    "public.list_unreferenced_artifacts_v4"
  );
  assert.match(
    collector,
    /private\.course_revisions revision\s+where revision\.artifact_hash = ref\.hash/u
  );
  assert.match(
    collector,
    /private\.catalog_review_submissions submission\s+where submission\.artifact_hash = ref\.hash/u
  );
  assert.doesNotMatch(collector, /authoring_workspace_revisions|authoring_workspaces/u);
});

test("publicação pré-registra o objeto para que qualquer falha permaneça coletável", () => {
  const register = functionBlock(
    composedMigration,
    "public.register_authoring_artifact_v5"
  );
  assert.match(register, /private\.require_service_role\(\)/u);
  assert.match(
    register,
    /p_artifact->>'artifactType' <> 'aralearn\.course-revision'/u
  );
  assert.match(register, /private\.register_artifact_v4\(p_artifact\)/u);
  assert.match(
    register,
    /update private\.artifact_refs artifact[\s\S]+set artifact_type = 'aralearn\.course-revision',[\s\S]+media_type = 'application\/json',[\s\S]+created_at = now\(\)/u
  );
  assert.match(
    register,
    /return jsonb_build_object\([\s\S]+'hash', v_artifact\.hash,[\s\S]+'bucket', v_artifact\.bucket,[\s\S]+'objectKey', v_artifact\.object_key,[\s\S]+'artifactType', v_artifact\.artifact_type,[\s\S]+'mediaType', v_artifact\.media_type,[\s\S]+'sizeBytes', v_artifact\.size_bytes,[\s\S]+'registered', true/u
  );
  assert.match(
    composedMigration,
    /revoke all on function public\.register_authoring_artifact_v5\(jsonb\)[\s\S]+grant execute on function public\.register_authoring_artifact_v5\(jsonb\)\s+to service_role/u
  );
  assert.match(
    engine,
    /putJson\(prepared\.document,[\s\S]+registerReference: async \(artifact\)[\s\S]+this\.rpc\("register_authoring_artifact_v5"[\s\S]+p_artifact: artifact/u
  );
});

test("cada curso conserva somente a revisão corrente e nenhuma cadeia histórica", () => {
  assert.match(
    composedMigration,
    /add constraint courses_document_storage_v5 check \([\s\S]+content_hash = current_revision_hash[\s\S]+current_revision_hash = revision_artifact_hash[\s\S]+not document_storage_enabled[\s\S]+content_hash is null/u
  );
  assert.match(
    composedMigration,
    /add constraint courses_published_document_v5 check \([\s\S]+status <> 'published'[\s\S]+or document_storage_enabled/u
  );
  assert.match(
    composedMigration,
    /set content_hash = course\.current_revision_hash[\s\S]+course\.current_revision_hash = course\.revision_artifact_hash[\s\S]+course\.content_hash is distinct from course\.current_revision_hash/u
  );
  assert.match(
    composedMigration,
    /update public\.courses course[\s\S]+current_revision_hash = null[\s\S]+where \(course\.deleted_at is not null or course\.status <> 'published'\)/u
  );
  assert.match(
    composedMigration,
    /Curso publicado aponta para artefato corrente inválido/u
  );
  assert.match(
    composedMigration,
    /delete from private\.course_revisions revision[\s\S]+course\.current_revision_hash = revision\.revision_hash[\s\S]+course\.revision_artifact_hash = revision\.artifact_hash/u
  );
  assert.match(
    composedMigration,
    /create unique index course_revisions_single_current_v5_uidx\s+on private\.course_revisions\(course_id\)/u
  );
  assert.match(
    composedMigration,
    /add constraint course_revisions_no_history_v5 check \(\s*base_revision_hash is null\s*\)/u
  );
  assert.match(
    composedMigration,
    /insert into private\.course_revisions\([\s\S]+from public\.courses course[\s\S]+not exists \([\s\S]+revision\.course_id = course\.id/u
  );
  const publish = functionBlock(
    composedMigration,
    "public.publish_authoring_workspace_course_v5"
  );
  const deletePosition = publish.indexOf(
    "delete from private.course_revisions revision"
  );
  const insertPosition = publish.indexOf(
    "insert into private.course_revisions"
  );
  assert.ok(deletePosition >= 0 && insertPosition > deletePosition);
  assert.match(
    publish,
    /v_course_id, v_hash, v_hash, null,\s+'validated'/u
  );
  assert.doesNotMatch(
    publish,
    /v_course_id, v_hash, v_hash, p_expected_content_hash/u
  );
});

test("publicação materializa somente o curso selecionado, não o workspace", () => {
  const publishStart = engine.indexOf("  async publish({");
  const publishEnd = engine.indexOf("  async submitForReview({", publishStart);
  const publish = engine.slice(publishStart, publishEnd);
  assert.match(
    publish,
    /selectCourseDocument\(document, courseId\)/u
  );
  assert.match(
    publish,
    /this\.artifacts\.putJson\(prepared\.document,[\s\S]+COURSE_REVISION_BUCKET/u
  );
  assert.match(publish, /publish_authoring_workspace_course_v5/u);
  assert.doesNotMatch(publish, /control\.artifact|workspace-revision|p_rows|p_changes/u);
});

test("leitura do documento respeita Trilhas e capacidade editorial", () => {
  const readCourse = functionBlock(
    composedMigration,
    "public.get_course_document_artifact_v4"
  );
  assert.match(
    readCourse,
    /course\.owner_id = p_owner_id/u
  );
  assert.match(
    readCourse,
    /public\.user_course_selections selection[\s\S]+selection\.user_id = p_owner_id[\s\S]+selection\.course_id = course\.id/u
  );
  assert.match(
    readCourse,
    /course\.owner_id is null[\s\S]+private\.can_review_catalog_v5\(p_owner_id\)[\s\S]+private\.can_publish_catalog_v5\(p_owner_id\)/u
  );
  assert.doesNotMatch(
    readCourse,
    /course\.owner_id is null\s+or course\.owner_id = p_owner_id/u
  );
  assert.match(
    readCourse,
    /course\.status = 'published'[\s\S]+exists \(\s+select 1\s+from public\.user_course_selections/u
  );

  const createWorkspace = functionBlock(
    composedMigration,
    "public.create_authoring_workspace_v5"
  );
  assert.match(
    createWorkspace,
    /course\.owner_id = p_owner_id[\s\S]+public\.user_course_selections selection[\s\S]+private\.can_review_catalog_v5\(p_owner_id\)[\s\S]+private\.can_publish_catalog_v5\(p_owner_id\)/u
  );
  assert.doesNotMatch(
    createWorkspace,
    /course\.owner_id is null[\s\S]+course\.status = 'published'\s+or/u
  );
});

test("workspace guarda somente eventos resumidos e limita o histórico corrente", () => {
  const eventTable = composedMigration.slice(
    composedMigration.indexOf("create table private.authoring_workspace_events"),
    composedMigration.indexOf("create index authoring_workspace_events_recent_v5_idx")
  );
  assert.match(eventTable, /summary jsonb not null/u);
  assert.match(eventTable, /pg_column_size\(summary\) <= 32768/u);
  assert.doesNotMatch(eventTable, /artifact|snapshot|document|content/u);
  assert.match(
    composedMigration,
    /delete from private\.authoring_workspace_events[\s\S]+limit 200/u
  );
  assert.match(
    composedMigration,
    /create index authoring_workspaces_deleted_v5_idx\s+on private\.authoring_workspaces\(deleted_at, id\)\s+where deleted_at is not null/u
  );
  const prune = functionBlock(
    composedMigration,
    "private.prune_authoring_workspace_state_v5"
  );
  assert.match(
    prune,
    /p_owner_id uuid default null,[\s\S]+p_request_id text default null/u
  );
  assert.match(
    prune,
    /request\.owner_id = p_owner_id[\s\S]+request\.request_id = p_request_id[\s\S]+request\.expires_at <= statement_timestamp\(\)/u
  );
  assert.match(
    prune,
    /with expired_requests as materialized \([\s\S]+request\.ctid[\s\S]+order by request\.expires_at, request\.owner_id, request\.request_id[\s\S]+limit 256[\s\S]+for update skip locked[\s\S]+using expired_requests expired[\s\S]+request\.ctid = expired\.ctid/u
  );
  assert.match(
    prune,
    /with expired_workspaces as materialized \([\s\S]+workspace\.ctid[\s\S]+workspace\.deleted_at\s+<= statement_timestamp\(\) - interval '14 days'[\s\S]+not exists[\s\S]+order by workspace\.deleted_at, workspace\.id[\s\S]+limit 256[\s\S]+for update skip locked[\s\S]+using expired_workspaces expired[\s\S]+workspace\.ctid = expired\.ctid/u
  );
  assert.equal((prune.match(/limit 256/gu) || []).length, 2);
  assert.equal((prune.match(/for update skip locked/gu) || []).length, 2);
  assert.match(
    composedMigration,
    /create index authoring_workspace_requests_expiry_v5_idx\s+on private\.authoring_workspace_requests\(expires_at, owner_id, request_id\)/u
  );
});

test("coletas oportunistas são limitadas sem perder a chave exata de replay", () => {
  const beginCatalog = functionBlock(
    composedMigration,
    "private.begin_catalog_management_v5"
  );
  assert.match(
    beginCatalog,
    /receipt\.actor_id = p_actor_id[\s\S]+receipt\.request_id = p_request_id[\s\S]+receipt\.expires_at <= statement_timestamp\(\)/u
  );
  assert.match(
    beginCatalog,
    /with expired_receipts as materialized \([\s\S]+receipt\.ctid[\s\S]+order by receipt\.expires_at, receipt\.actor_id, receipt\.request_id[\s\S]+limit 256[\s\S]+for update skip locked[\s\S]+using expired_receipts expired[\s\S]+receipt\.ctid = expired\.ctid/u
  );
  assert.match(
    composedMigration,
    /create index catalog_management_receipts_expiry_v5_idx\s+on private\.catalog_management_receipts_v5\(\s*expires_at, actor_id, request_id\s*\)/u
  );
  const removePersonal = functionBlock(
    composedMigration,
    "public.remove_course_from_personal_library_v5"
  );
  assert.match(
    removePersonal,
    /receipt\.actor_id = p_actor_id[\s\S]+receipt\.request_id = p_request_id[\s\S]+receipt\.expires_at <= statement_timestamp\(\)/u
  );
  assert.match(
    removePersonal,
    /with expired_receipts as materialized \([\s\S]+receipt\.ctid[\s\S]+order by receipt\.expires_at, receipt\.actor_id, receipt\.request_id[\s\S]+limit 256[\s\S]+for update skip locked/u
  );
  assert.match(
    composedMigration,
    /create index personal_library_receipts_expiry_v5_idx\s+on private\.personal_library_receipts_v5\(\s*expires_at, actor_id, request_id\s*\)/u
  );

  for (const functionName of [
    "replay_authoring_workspace_request_v5",
    "create_authoring_workspace_v5",
    "commit_authoring_workspace_changes_v5",
    "update_authoring_workspace_brief_v5",
    "delete_authoring_workspace_v5",
    "publish_authoring_workspace_course_v5"
  ]) {
    const definition = functionBlock(
      composedMigration,
      `public.${functionName}`
    );
    const lockPosition = definition.indexOf("pg_advisory_xact_lock");
    const prunePosition = definition.indexOf(
      "prune_authoring_workspace_state_v5(\n    p_owner_id,\n    p_request_id"
    );
    const replayPosition = definition.indexOf(
      "from private.authoring_workspace_requests"
    );
    assert.ok(lockPosition >= 0, functionName);
    assert.ok(prunePosition > lockPosition, functionName);
    assert.ok(replayPosition > prunePosition, functionName);
  }

  assert.equal(
    (composedMigration.match(/expires_at <= statement_timestamp\(\)/gu) || []).length,
    6
  );
});

test("retirada de Trilhas preserva seleção oficial e libera publicação privada", () => {
  const removePersonal = functionBlock(
    composedMigration,
    "public.remove_course_from_personal_library_v5"
  );
  assert.match(
    removePersonal,
    /selection\.id = p_selection_id[\s\S]+selection\.user_id = p_actor_id[\s\S]+selection\.course_id = p_course_id[\s\S]+for update/u
  );
  assert.match(
    removePersonal,
    /v_course\.owner_id is null[\s\S]+v_kind := 'official'[\s\S]+v_course\.owner_id = p_actor_id[\s\S]+v_kind := 'personal'[\s\S]+using errcode = 'P0002'/u
  );
  assert.match(
    removePersonal,
    /v_course\.current_revision_hash is distinct from\s+p_expected_content_hash[\s\S]+using errcode = '40001'/u
  );
  assert.match(
    removePersonal,
    /submission\.source_course_id = p_course_id[\s\S]+submission\.status in \('submitted', 'in_review'\)[\s\S]+using errcode = 'AS409'/u
  );
  const activeSubmissionCheck = removePersonal.slice(
    removePersonal.indexOf("select submission.id into v_active_submission_id"),
    removePersonal.indexOf("if found then", removePersonal.indexOf(
      "select submission.id into v_active_submission_id"
    ))
  );
  assert.doesNotMatch(activeSubmissionCheck, /source_revision_hash/u);
  assert.doesNotMatch(
    removePersonal,
    /submission\.status in \([^)]*changes_requested/u
  );
  assert.match(
    removePersonal,
    /set_config\('aralearn\.suppress_sync_changes', 'on', true\)[\s\S]+delete from public\.user_course_selections[\s\S]+entity_type, entity_id, operation[\s\S]+'courseSelections', p_selection_id, 'delete'/u
  );
  const personalBranch = removePersonal.slice(
    removePersonal.indexOf("if v_kind = 'personal' then", 1)
  );
  assert.match(
    personalBranch,
    /delete from private\.course_revisions[\s\S]+set status = 'archived'[\s\S]+current_revision_hash = null[\s\S]+document_storage_enabled = false/u
  );
  assert.match(
    personalBranch,
    /private\.course_revision_sync_changes[\s\S]+p_actor_id, 'private', p_course_id, 'delete', null/u
  );
  assert.match(
    removePersonal,
    /v_receipt\.payload_hash <> v_payload_hash[\s\S]+using errcode = 'PL409'[\s\S]+jsonb_build_object\('idempotent', true\)/u
  );
});

test("feed de revisões conserva só a mudança mais recente por audiência e curso", () => {
  assert.match(
    composedMigration,
    /row_number\(\) over \(\s*partition by change\.scope, change\.user_id, change\.entity_id\s*order by change\.sequence desc\s*\)[\s\S]+ranked\.recency > 1/u
  );
  assert.match(
    composedMigration,
    /create index course_revision_sync_audience_entity_v5_idx\s+on private\.course_revision_sync_changes\(\s*scope, user_id, entity_id, sequence desc\s*\)/u
  );
  const compact = functionBlock(
    composedMigration,
    "private.compact_course_revision_sync_changes_v5"
  );
  assert.match(compact, /pg_advisory_xact_lock/u);
  assert.match(
    compact,
    /change\.scope = new\.scope[\s\S]+change\.user_id is not distinct from new\.user_id[\s\S]+change\.entity_id = new\.entity_id[\s\S]+change\.sequence < \(\s*select max\(latest\.sequence\)[\s\S]+latest\.scope = new\.scope[\s\S]+latest\.user_id is not distinct from new\.user_id[\s\S]+latest\.entity_id = new\.entity_id/u
  );
  assert.match(
    composedMigration,
    /create trigger course_revision_sync_compact_v5\s+after insert on private\.course_revision_sync_changes/u
  );
});

test("feed pessoal executa a política de retenção automaticamente no máximo uma vez por dia", () => {
  const maintenance = functionBlock(
    composedMigration,
    "private.maintain_sync_history_v5"
  );
  assert.match(
    maintenance,
    /pg_try_advisory_xact_lock\(hashtextextended\(\s*'aralearn-sync-history-maintenance-v5'/u
  );
  assert.match(
    maintenance,
    /pg_try_advisory_xact_lock\(hashtextextended\(\s*'aralearn-sync-feed-commit-order'/u
  );
  assert.match(
    maintenance,
    /from private\.sync_retention_policy policy[\s\S]+for update[\s\S]+v_policy\.updated_at > v_now - interval '1 day'/u
  );
  assert.match(
    maintenance,
    /update private\.sync_devices device[\s\S]+device\.last_seen_at < v_now - v_policy\.device_inactive_after/u
  );
  assert.match(
    maintenance,
    /min\(device\.last_pulled_sequence\) filter \([\s\S]+device\.inactive_at is null[\s\S]+max\(change\.sequence\)/u
  );
  assert.match(
    maintenance,
    /coalesce\(min\(change\.sequence\) - 1, v_watermark\)[\s\S]+change\.changed_at >= v_now - v_policy\.minimum_retention/u
  );
  assert.match(
    maintenance,
    /delete from private\.sync_changes change[\s\S]+change\.sequence <= v_compact_through/u
  );
  assert.match(
    maintenance,
    /delete from private\.sync_idempotency ledger[\s\S]+ledger\.applied_at < v_now - v_policy\.idempotency_retention[\s\S]+ledger\.applied_sequence <= v_compact_through/u
  );
  assert.match(
    maintenance,
    /set compacted_through_sequence = v_compact_through,[\s\S]+updated_at = v_now/u
  );
  assert.match(
    composedMigration,
    /create trigger sync_history_maintenance_v5\s+after insert on private\.sync_changes\s+for each statement execute function private\.maintain_sync_history_v5\(\)/u
  );
  assert.match(
    composedMigration,
    /revoke all on function private\.maintain_sync_history_v5\(\)\s+from public, anon, authenticated, service_role/u
  );
});

test("brief autoral é texto compacto, atualizável por CAS e não vira snapshot", () => {
  const workspaceTable = composedMigration.slice(
    composedMigration.indexOf("create table private.authoring_workspaces"),
    composedMigration.indexOf("create index authoring_workspaces_owner_v5_idx")
  );
  assert.match(workspaceTable, /brief text not null default ''/u);
  assert.match(workspaceTable, /char_length\(brief\) <= 16000/u);
  assert.doesNotMatch(workspaceTable, /brief jsonb/u);

  const updateBrief = functionBlock(
    composedMigration,
    "public.update_authoring_workspace_brief_v5"
  );
  assert.match(updateBrief, /v_workspace\.revision <> p_expected_revision/u);
  assert.match(updateBrief, /set brief = v_brief,[\s\S]+revision = v_next_revision/u);
  assert.match(updateBrief, /v_workspace\.brief is distinct from v_brief/u);
  assert.match(updateBrief, /'operation', 'update_brief'/u);
  assert.doesNotMatch(updateBrief, /artifact|snapshot/u);
});

test("administração v5 do catálogo é estreita, serializada e idempotente", () => {
  assert.match(
    composedMigration,
    /create table private\.catalog_management_receipts_v5/u
  );
  const beginCommand = functionBlock(
    composedMigration,
    "private.begin_catalog_management_v5"
  );
  assert.match(beginCommand, /catalog:manage/u);
  assert.match(beginCommand, /private\.can_publish_catalog_v5\(p_actor_id\)/u);
  assert.match(
    beginCommand,
    /aralearn-catalog-management-v5:global/u
  );
  assert.match(
    beginCommand,
    /v_receipt\.payload_hash <> p_payload_hash[\s\S]+errcode = '23505'/u
  );

  for (const functionName of [
    "create_catalog_collection_v5",
    "update_catalog_collection_v5",
    "retire_catalog_collection_v5",
    "move_catalog_course_v5",
    "remove_catalog_course_v5"
  ]) {
    const definition = functionBlock(
      composedMigration,
      `public.${functionName}`
    );
    assert.match(
      definition,
      /private\.catalog_management_payload_hash_v5/u
    );
    assert.match(definition, /private\.begin_catalog_management_v5/u);
    assert.match(definition, /private\.complete_catalog_management_v5/u);
  }

  const createCollection = functionBlock(
    composedMigration,
    "public.create_catalog_collection_v5"
  );
  assert.match(
    createCollection,
    /nullif\(v_contract_key, ''\) is null/u
  );
  const moveCourse = functionBlock(
    composedMigration,
    "public.move_catalog_course_v5"
  );
  assert.match(
    moveCourse,
    /v_placement\.revision <> p_expected_placement_revision/u
  );
  assert.match(
    moveCourse,
    /Coleção de origem inexistente ou inativa/u
  );
  const removeCourse = functionBlock(
    composedMigration,
    "public.remove_catalog_course_v5"
  );
  assert.match(
    removeCourse,
    /v_course\.current_revision_hash is distinct from p_expected_content_hash/u
  );
  assert.match(
    removeCourse,
    /delete from private\.course_revisions/u
  );
  assert.doesNotMatch(
    removeCourse,
    /delete from private\.catalog_review_submissions/u
  );
});

test("reordenação de coleções aplica CAS, idempotência e mantém Outros no final", () => {
  const beginCommand = functionBlock(
    catalogCollectionReorderingMigration,
    "private.begin_catalog_management_v5"
  );
  const moveCollection = functionBlock(
    catalogCollectionReorderingMigration,
    "public.move_catalog_collection_v5"
  );
  const protectStructuralCollection = functionBlock(
    catalogCollectionReorderingMigration,
    "private.protect_structural_catalog_collection_v1"
  );

  assert.match(beginCommand, /private\.can_publish_catalog_v5\(p_actor_id\)/u);
  assert.match(beginCommand, /'move_collection'/u);
  assert.match(moveCollection, /p_expected_revision bigint/u);
  assert.match(
    moveCollection,
    /v_collection\.revision <> p_expected_revision[\s\S]+errcode = '40001'/u
  );
  assert.match(moveCollection, /private\.begin_catalog_management_v5/u);
  assert.match(moveCollection, /private\.complete_catalog_management_v5/u);
  assert.match(
    moveCollection,
    /v_collection\.contract_key = 'outros'[\s\S]+Outros permanece no final/u
  );
  assert.match(
    moveCollection,
    /private\.normalize_catalog_collection_positions_v5\(\)/u
  );
  assert.match(
    catalogCollectionReorderingMigration,
    /create trigger catalog_collections_protect_structural_other_v1[\s\S]+before insert or update or delete/u
  );
  assert.match(
    protectStructuralCollection,
    /old\.contract_key = 'outros'[\s\S]+new\.contract_key is distinct from 'outros'/u
  );
  assert.match(
    protectStructuralCollection,
    /new\.title is distinct from 'Outros cursos'[\s\S]+new\.description is distinct from/u
  );
  assert.match(
    protectStructuralCollection,
    /catalog_structural_collection_semantics/u
  );
  assert.doesNotMatch(
    protectStructuralCollection,
    /new\.(?:position|revision|updated_at)/u
  );
  assert.match(
    catalogCollectionReorderingMigration,
    /'schemaRevision', '20260804170000'[\s\S]+'catalog-collection-ordering-v1'/u
  );
});

test("revisão editorial referencia a publicação submetida e um workspace composto", () => {
  assert.match(
    composedMigration,
    /create table private\.catalog_review_submissions/u
  );
  assert.match(
    composedMigration,
    /artifact_hash text\s+references private\.artifact_refs\(hash\)/u
  );
  assert.match(
    composedMigration,
    /source_submission_id[\s\S]+references private\.catalog_review_submissions\(id\)/u
  );
  assert.match(
    composedMigration,
    /claim_expires_at timestamptz/u
  );
  assert.match(
    composedMigration,
    /status in \([\s\S]*'superseded'[\s\S]*\)/u
  );
  assert.match(
    composedMigration,
    /create unique index catalog_review_submissions_active_course_v5_uidx[\s\S]+on private\.catalog_review_submissions\(author_id, source_course_id\)[\s\S]+where status in \('submitted', 'in_review'\)/u
  );
  assert.doesNotMatch(
    composedMigration,
    /catalog_review_submissions_revision_unique_v5/u
  );
  for (const functionName of [
    "submit_private_course_for_catalog_review_v5",
    "list_catalog_reviews_v5",
    "get_catalog_review_artifact_v5",
    "claim_catalog_review_v5",
    "link_catalog_review_workspace_v5",
    "decide_catalog_review_v5",
    "withdraw_catalog_review_v5"
  ]) {
    assert.match(
      composedMigration,
      new RegExp(`create function public\\.${functionName}\\(`, "u")
    );
  }
  assert.match(
    composedMigration,
    /v_workspace\.source_submission_id is distinct from p_submission_id/u
  );
  assert.match(
    composedMigration,
    /catalog_review_submissions_artifact_lifecycle_v5[\s\S]+status in \('submitted', 'in_review'\)[\s\S]+artifact_hash is not null[\s\S]+artifact_hash is null/u
  );
  const submit = functionBlock(
    composedMigration,
    "public.submit_private_course_for_catalog_review_v5"
  );
  assert.match(
    submit,
    /aralearn-catalog-review-submission-v5:/u
  );
  assert.match(
    submit,
    /aralearn-catalog-review-source-v5:/u
  );
  assert.match(
    submit,
    /aralearn-catalog-review-source-v5:'[\s\S]+\|\| p_actor_id::text \|\| ':' \|\| p_course_id::text/u
  );
  assert.match(
    submit,
    /submission\.status in \('submitted', 'in_review'\)[\s\S]+for update/u
  );
  assert.match(
    submit,
    /v_active_submission\.source_revision_hash = p_expected_content_hash[\s\S]+'idempotent', true/u
  );
  assert.match(
    submit,
    /v_active_submission\.status = 'in_review'[\s\S]+using errcode = 'RS409'/u
  );
  assert.match(
    submit,
    /set status = 'superseded',[\s\S]+artifact_hash = null,[\s\S]+decided_at = now\(\)/u
  );
  const listReviews = functionBlock(
    composedMigration,
    "public.list_catalog_reviews_v5"
  );
  assert.match(
    listReviews,
    /p_before_submitted_at timestamptz default null,[\s\S]+p_before_id uuid default null/u
  );
  assert.match(
    listReviews,
    /\(p_before_submitted_at is null\)[\s\S]+<> \(p_before_id is null\)/u
  );
  assert.match(
    listReviews,
    /\(submission\.submitted_at, submission\.id\)[\s\S]+< \(p_before_submitted_at, p_before_id\)/u
  );
  assert.match(listReviews, /limit p_limit \+ 1/u);
  assert.match(
    listReviews,
    /'hasMore', v_has_more,[\s\S]+'beforeSubmittedAt', v_last_submitted_at,[\s\S]+'beforeId', v_last_id/u
  );
  for (const field of [
    "sourceRevisionHash",
    "authorNote",
    "reviewerNote",
    "decidedAt"
  ]) {
    assert.match(listReviews, new RegExp(`'${field}'`, "u"));
  }
  const claim = functionBlock(
    composedMigration,
    "public.claim_catalog_review_v5"
  );
  assert.match(
    claim,
    /now\(\) \+ interval '30 minutes'/u
  );
  assert.match(
    claim,
    /reviewer_id = p_actor_id[\s\S]+set claim_expires_at = v_lease_expires_at[\s\S]+'idempotent', true/u
  );
  assert.match(
    claim,
    /claim_expires_at > now\(\)[\s\S]+using errcode = 'RC409'/u
  );
  assert.match(
    claim,
    /workspace\.source_submission_id = p_submission_id[\s\S]+private\.close_catalog_review_workspace_v5/u
  );
  const link = functionBlock(
    composedMigration,
    "public.link_catalog_review_workspace_v5"
  );
  assert.match(
    link,
    /claim_expires_at = v_lease_expires_at/u
  );
  for (const functionName of [
    "decide_catalog_review_v5",
    "withdraw_catalog_review_v5",
    "publish_authoring_workspace_course_v5"
  ]) {
    const definition = functionBlock(
      composedMigration,
      `public.${functionName}`
    );
    assert.match(definition, /artifact_hash = null/u);
    assert.match(definition, /claim_expires_at = null/u);
    assert.match(
      definition,
      /private\.close_catalog_review_workspace_v5/u
    );
  }
  const closeWorkspace = functionBlock(
    composedMigration,
    "private.close_catalog_review_workspace_v5"
  );
  assert.match(
    closeWorkspace,
    /delete from private\.authoring_workspace_entities/u
  );
  assert.match(
    closeWorkspace,
    /delete from private\.authoring_workspace_requests/u
  );
});

test("workspace aceita os escopos privados usados pela sessão OAuth", () => {
  assert.match(
    privateScopeMigration,
    /replace\(p_scope, 'authoring:', 'authoring:private:'\)/u
  );
  assert.match(
    privateScopeMigration,
    /p_scope in \('authoring:read', 'authoring:write'\)/u
  );
  assert.doesNotMatch(
    privateScopeMigration,
    /replace\(p_scope, 'catalog:',/u
  );
});

test("leitura distingue workspace ausente de tentativa por outra conta", () => {
  assert.match(
    ownerIsolationMigration,
    /where id = p_workspace_id and deleted_at is null;/u
  );
  assert.match(
    ownerIsolationMigration,
    /v_workspace\.owner_id <> p_owner_id[\s\S]+errcode = '42501'/u
  );
});

test("hook OAuth limita a alteração aos tokens de cliente e fixa audience do MCP", () => {
  assert.match(oauthPublicationMigration, /aralearn_mcp_access_token_hook\(event jsonb\)/u);
  assert.match(oauthPublicationMigration, /v_claims->>'client_id'/u);
  assert.match(
    oauthPublicationMigration,
    /\/functions\/v1\/aralearn-authoring-mcp/u
  );
  assert.match(oauthPublicationMigration, /jsonb_set\(v_claims, '\{aud\}'/u);
  assert.match(
    oauthPublicationMigration,
    /grant execute on function public\.aralearn_mcp_access_token_hook\(jsonb\)\s+to supabase_auth_admin/u
  );
  assert.match(
    oauthPublicationMigration,
    /revoke execute on function public\.aralearn_mcp_access_token_hook\(jsonb\)\s+from authenticated, anon, public/u
  );
  assert.match(
    supabaseConfig,
    /\[auth\.hook\.custom_access_token\][\s\S]+enabled = true[\s\S]+aralearn_mcp_access_token_hook/u
  );
  assert.match(
    supabaseConfig,
    /\[auth\.oauth_server\][\s\S]+enabled = true[\s\S]+authorization_url_path = "\/"[\s\S]+allow_dynamic_registration = true/u
  );
});

test("Action usa concessão confidencial separada, códigos únicos e somente hashes persistidos", () => {
  for (const table of [
    "private.authoring_action_oauth_clients",
    "private.authoring_action_oauth_authorizations",
    "private.authoring_action_oauth_tokens"
  ]) {
    assert.match(
      actionOAuthMigration,
      new RegExp(`create table ${table.replace(".", "\\.")}`, "u")
    );
  }
  assert.match(actionOAuthMigration, /client_secret_hash text not null/u);
  assert.match(actionOAuthMigration, /code_hash text/u);
  assert.match(actionOAuthMigration, /token_hash text primary key/u);
  assert.doesNotMatch(actionOAuthMigration, /\bclient_secret text\b/u);
  assert.doesNotMatch(actionOAuthMigration, /\baccess_token text\b/u);
  assert.doesNotMatch(actionOAuthMigration, /\brefresh_token text\b/u);
  assert.match(
    actionOAuthMigration,
    /status = 'consumed'[\s\S]+consumed_at = statement_timestamp\(\)/u
  );
  assert.match(
    actionOAuthMigration,
    /revoke all on table private\.authoring_action_oauth_tokens[\s\S]+from public, anon, authenticated/u
  );
  assert.match(
    actionOAuthMigration,
    /grant execute on function public\.resolve_authoring_action_oauth_principal_v4\(text\)[\s\S]+to service_role/u
  );
  assert.match(actionOAuthMigration, /'schemaRevision', '20260730100000'/u);
  assert.match(actionOAuthMigration, /'confidential-gpt-action-oauth'/u);
  assert.match(
    actionOAuthLinkMigration,
    /create function public\.create_authoring_action_oauth_client_setup_v4\(/u
  );
  assert.match(
    actionOAuthLinkMigration,
    /create function public\.link_authoring_action_oauth_client_v4\(/u
  );
  assert.match(actionOAuthLinkMigration, /'schemaRevision', '20260730110000'/u);
  assert.match(actionOAuthLinkMigration, /'gpt-action-oauth-linking'/u);
  assert.match(
    actionOAuthRelinkMigration,
    /drop constraint authoring_action_oauth_clients_creator_user_id_gpt_id_key/u
  );
  assert.match(
    actionOAuthRelinkMigration,
    /create unique index authoring_action_oauth_one_active_gpt_per_creator_idx/u
  );
  assert.match(actionOAuthRelinkMigration, /'schemaRevision', '20260730120000'/u);
  assert.match(actionOAuthRelinkMigration, /'gpt-action-oauth-relinking'/u);
  assert.match(
    actionOAuthStableCallbackMigration,
    /coalesce\(p_redirect_uri, ''\) !~ '\^https:\/\/\(chatgpt\[\.\]com\|chat\[\.\]openai\[\.\]com\)\/aip\/g-\[A-Za-z0-9-\]\{6,150\}\/oauth\/callback\$'/u
  );
  assert.doesNotMatch(
    actionOAuthStableCallbackMigration,
    /p_redirect_uri = any\(v_client\.redirect_uris\)/u
  );
  assert.match(actionOAuthStableCallbackMigration, /'schemaRevision', '20260730130000'/u);
  assert.match(actionOAuthStableCallbackMigration, /'gpt-action-oauth-stable-callback'/u);
});

test("publicação exige coleção ativa no catálogo e a proíbe em prévia privada", () => {
  assert.match(
    oauthPublicationMigration,
    /if p_target = 'catalog'[\s\S]+if p_collection_id is null/u
  );
  assert.match(
    oauthPublicationMigration,
    /catalog_collections collection[\s\S]+collection\.is_published[\s\S]+collection\.deleted_at is null/u
  );
  assert.match(
    oauthPublicationMigration,
    /elsif p_collection_id is not null[\s\S]+A publicação privada não recebe coleção/u
  );
});

test("manifesto vigente separa assistência atômica da sincronização relacional", () => {
  assert.match(oauthPublicationMigration, /'schemaRevision', '20260729050000'/u);
  assert.match(oauthPublicationMigration, /'atomic-card-assistance'/u);
  assert.match(oauthPublicationMigration, /'granular-sync'/u);
  assert.doesNotMatch(oauthPublicationMigration, /'structured-bottom-up-generation'/u);
});

test("corte OAuth instala RPCs nativos e remove a identidade paralela", () => {
  assert.match(
    oauthOnlyMigration,
    /create function public\.resolve_authoring_oauth_principal\(/
  );
  assert.match(
    oauthOnlyMigration,
    /drop table if exists private\.authoring_api_clients cascade/u
  );
  assert.match(
    oauthOnlyMigration,
    /alter table private\.authoring_workspaces\s+drop column api_client_id/u
  );
  assert.match(
    oauthOnlyMigration,
    /create function private\.require_workspace_actor_v4\(\s+p_owner_id uuid,\s+p_scope text/u
  );
  assert.match(
    oauthOnlyMigration,
    /public\.list_personal_library_courses\(\s+uuid,integer,integer,uuid,text\s*\)/u
  );
  assert.match(oauthOnlyMigration, /'schemaRevision', '20260729080000'/u);
  assert.match(oauthOnlyMigration, /'oauth-only-authoring-mcp'/u);
});

test("criação v5 persiste controle e rows sem identidade ou artefato paralelos", () => {
  const definition = functionBlock(
    composedMigration,
    "public.create_authoring_workspace_v5"
  );
  assert.doesNotMatch(definition, /p_client_id|api_client_id|current_artifact_hash/u);
  assert.match(
    definition,
    /insert into private\.authoring_workspaces\(\s*id, owner_id, title, source_course_id, source_revision_hash,\s*source_submission_id/u
  );
  assert.match(
    definition,
    /jsonb_array_elements\(p_rows\)[\s\S]+insert into private\.authoring_workspace_entities/u
  );
  assert.match(definition, /private\.require_workspace_actor_v5\(p_owner_id, 'authoring:write'\)/u);
});

test("corte v5 recompila leitores de Trilhas e Coleções contra a autoridade atual", () => {
  const cutover = composedMigration.match(
    /do \$recompile_current_course_readers\$[\s\S]+?\$recompile_current_course_readers\$;/u
  )?.[0] || "";
  assert.match(
    cutover,
    /public\.list_personal_library_courses\(uuid,integer,integer,uuid,text\)/u
  );
  assert.match(
    cutover,
    /public\.list_authoring_catalog_collections_v4\(uuid,integer,integer,uuid,text\)/u
  );
  assert.match(
    cutover,
    /public\.list_authoring_catalog_courses_v4\(uuid,uuid,integer,integer,uuid,text\)/u
  );
  assert.match(
    cutover,
    /replace\([\s\S]+private\.require_workspace_actor_v4[\s\S]+private\.require_workspace_actor_v5/u
  );
  assert.match(
    cutover,
    /list_personal_library_courses\(uuid,integer,integer,uuid,text\)'::regprocedure[\s\S]+replace\(\s*v_rewritten,\s*'''authoring:private:read''',\s*'''authoring:read'''/u
  );
  assert.match(
    cutover,
    /v_rewritten like '%''authoring:private:read''%'[\s\S]+v_rewritten not like '%''authoring:read''%'/u
  );
  assert.match(
    cutover,
    /v_rewritten like '%private\.require_workspace_actor_v4%'/u
  );
});

test("publicação v5 deriva autoridade da conta e valida o destino editorial", () => {
  const publication = functionBlock(
    composedMigration,
    "public.publish_authoring_workspace_course_v5"
  );
  assert.doesNotMatch(publication, /p_client_id|api_client_id/u);
  assert.match(
    publication,
    /private\.require_workspace_actor_v5\(\s*p_owner_id,[\s\S]+catalog:publish/u
  );
  assert.match(
    publication,
    /from private\.app_role_assignments assignment[\s\S]+assignment\.role in \('owner', 'catalog_publisher'\)[\s\S]+for share;[\s\S]+from public\.catalog_collections/u
  );
  assert.match(
    publication,
    /v_workspace\.source_submission_id is distinct from p_submission_id/u
  );
});

test("remoção da superfície anterior é nominal e falha fechada", () => {
  const cleanup = oauthOnlyMigration.slice(
    oauthOnlyMigration.indexOf("-- Remove RPCs, auxiliares e tabelas"),
    oauthOnlyMigration.indexOf("-- As assinaturas antigas são removidas")
  );
  assert.match(cleanup, /and p\.proname in \(/u);
  assert.doesNotMatch(cleanup, /p\.prosrc|p\.proargnames/u);
  assert.match(
    oauthOnlyMigration,
    /from unnest\(array\[[\s\S]+public\.create_authoring_workspace_v4\(uuid,uuid,text,text,text,text,jsonb,uuid,text\)[\s\S]+where to_regprocedure\(required\.signature\) is null/u
  );
  assert.match(
    oauthOnlyMigration,
    /where to_regprocedure\(retired\.signature\) is not null/u
  );
});

test("autoria privada consulta metadados do catálogo ativo sem ganhar publicação", () => {
  for (const functionName of [
    "list_authoring_catalog_collections_v4",
    "list_authoring_catalog_courses_v4"
  ]) {
    assert.match(
      oauthPublicationMigration,
      new RegExp(`create function public\\.${functionName}\\(`, "u")
    );
    assert.match(
      oauthPublicationMigration,
      new RegExp(
        `revoke all on function public\\.${functionName}\\([\\s\\S]+\\) from public, anon, authenticated`,
        "u"
      )
    );
  }
  assert.match(
    oauthOnlyMigration,
    /public\.list_authoring_catalog_collections_v4\(\s+uuid,integer,integer,uuid,text\s*\)/u
  );
  assert.match(
    oauthPublicationMigration,
    /collection\.is_published[\s\S]+course\.document_storage_enabled/u
  );
});

test("corte final renomeia RPCs públicas do plano de artefatos sem aliases antigos", () => {
  for (const name of [
    "resolve_catalog_artifact_publisher",
    "get_course_revision_artifact",
    "list_unreferenced_artifacts",
    "claim_unreferenced_artifacts",
    "complete_artifact_gc"
  ]) {
    assert.match(
      oauthPublicationMigration,
      new RegExp(`alter function public\\.${name}_v3[\\s\\S]+rename to ${name}_v4`, "u")
    );
    assert.match(
      oauthPublicationMigration,
      new RegExp(`grant execute on function public\\.${name}_v4`, "u")
    );
  }
});

test("publicação inicial resolve a coleção padrão sem reativar a API administrativa", () => {
  assert.match(
    defaultCollectionMigration,
    /insert into public\.catalog_collections[\s\S]+'outros'[\s\S]+on conflict \(contract_key\) do nothing/u
  );
  assert.match(
    defaultCollectionMigration,
    /create or replace function public\.resolve_catalog_artifact_publisher_v4[\s\S]+collection\.contract_key = 'outros'[\s\S]+collection\.is_published/u
  );
  assert.match(defaultCollectionMigration, /'schemaRevision', '20260729090000'/u);
});

test("plano v5 expõe somente RPCs compostas e recibos temporários", () => {
  assert.match(
    composedMigration,
    /expires_at timestamptz not null default now\(\) \+ interval '14 days'/u
  );
  assert.match(
    composedMigration,
    /return v_request\.result \|\| jsonb_build_object\('idempotent', true\)/u
  );
  for (const functionName of [
    "create_authoring_workspace_v5",
    "commit_authoring_workspace_changes_v5",
    "get_authoring_workspace_v5",
    "list_authoring_workspace_events_v5",
    "publish_authoring_workspace_course_v5"
  ]) {
    assert.match(
      composedMigration,
      new RegExp(`public\\.${functionName}`, "u")
    );
  }
  assert.match(
    composedMigration,
    /limit p_limit \+ 1[\s\S]+'nextCursor'/u
  );
  assert.match(
    composedMigration,
    /p_before_revision bigint default null/u
  );
  assert.match(
    composedMigration,
    /public\.get_authoring_workspace_v5\([\s\S]+p_course_ids text\[\] default null[\s\S]+p_include_card_content boolean default true/u
  );
  assert.match(
    composedMigration,
    /with recursive selected_entities[\s\S]+child\.entity_type = 'course'[\s\S]+parent\.entity_id = any\(p_course_ids\)/u
  );
  assert.match(
    composedMigration,
    /when not p_include_card_content[\s\S]+entity\.entity_type = 'card'[\s\S]+then '\{\}'::jsonb/u
  );
  assert.match(
    composedMigration,
    /'schemaRevision', '20260730140000'/u
  );
});

test("create e commit v5 revalidam recibos sob a mesma chave serializada", () => {
  const create = functionBlock(
    composedMigration,
    "public.create_authoring_workspace_v5"
  );
  const commit = functionBlock(
    composedMigration,
    "public.commit_authoring_workspace_changes_v5"
  );
  for (const definition of [create, commit]) {
    assert.match(
      definition,
      /pg_advisory_xact_lock\(hashtextextended\([\s\S]+aralearn-workspace-request-v5:/u
    );
    assert.match(
      definition,
      /where request\.owner_id = p_owner_id and request\.request_id = p_request_id/u
    );
    assert.match(
      definition,
      /v_request\.payload_hash <> p_payload_hash/u
    );
  }
  assert.match(
    commit,
    /where workspace\.id = p_workspace_id[\s\S]+for update;/u
  );
});

test("importação usa o mesmo commit de diffs do workspace composto", () => {
  assert.match(
    engine,
    /const operation = "import_course"[\s\S]+diffWorkspaceDocument\(current\.rows, nextDocument\)/u
  );
  assert.match(
    engine,
    /commit_authoring_workspace_changes_v5[\s\S]+p_changes: \{ upserts: diff\.upserts, deletes: \[\] \}/u
  );
  assert.doesNotMatch(engine, /commit_authoring_workspace_revision_v4/u);
});

test("leitura de artefato preserva privado do autor e fecha catálogo não publicado", () => {
  const guard = hardeningMigration.match(
    /v_signature regprocedure :=\s*'public\.get_course_document_artifact_v4\(uuid,uuid,uuid\)'::regprocedure;[\s\S]+?v_after text := \$patch\$([\s\S]+?)\$patch\$;/u
  )?.[1] || "";
  assert.match(guard, /course\.owner_id = p_owner_id/u);
  assert.match(
    guard,
    /course\.owner_id is null[\s\S]+course\.status = 'published'/u
  );
  assert.match(guard, /private\.has_active_app_role\(p_owner_id, 'owner'\)/u);
  assert.match(
    guard,
    /private\.has_active_app_role\(p_owner_id, 'catalog_publisher'\)/u
  );
  assert.doesNotMatch(guard, /user_course_selections/u);

  const canRead = ({ ownerId, status }, actorId, editorial = false) =>
    ownerId === actorId || (ownerId == null && (status === "published" || editorial));
  const matrix = [
    [{ ownerId: null, status: "published" }, "author", false, true],
    [{ ownerId: null, status: "draft" }, "author", false, false],
    [{ ownerId: null, status: "archived" }, "author", false, false],
    [{ ownerId: null, status: "draft" }, "editor", true, true],
    [{ ownerId: null, status: "archived" }, "editor", true, true],
    [{ ownerId: "author", status: "published" }, "author", false, true],
    [{ ownerId: "author", status: "archived" }, "author", false, true],
    [{ ownerId: "other", status: "published" }, "author", false, false]
  ];
  for (const [course, actorId, editorial, expected] of matrix) {
    assert.equal(canRead(course, actorId, editorial), expected);
  }
});

test("plano de controle limita novas referências de artefato a 32 MiB", () => {
  assert.match(
    hardeningMigration,
    /add constraint artifact_refs_size_v4\s+check \(size_bytes between 1 and 33554432\)/u
  );
});

test("revisões offline não expõem catálogo não publicado ou curso excluído", () => {
  const guard = hardeningMigration.match(
    /v_signature regprocedure :=\s*'public\.get_course_revision_artifact_v4\(uuid,uuid,text\)'::regprocedure;[\s\S]+?v_after text := \$patch\$([\s\S]+?)\$patch\$;/u
  )?.[1] || "";
  assert.match(
    guard,
    /where id = p_course_id\s+and deleted_at is null\s+and document_storage_enabled/u
  );
  assert.match(guard, /v_course\.owner_id = p_actor_id/u);
  assert.match(
    guard,
    /v_course\.owner_id is null and v_course\.status = 'published'/u
  );
  assert.doesNotMatch(
    guard,
    /v_course\.owner_id is null or v_course\.owner_id = p_actor_id/u
  );

  const canRead = ({ ownerId, status, deleted }, actorId) =>
    !deleted && (
      ownerId === actorId
      || (ownerId == null && status === "published")
    );
  const matrix = [
    [{ ownerId: null, status: "published", deleted: false }, "author", true],
    [{ ownerId: null, status: "draft", deleted: false }, "author", false],
    [{ ownerId: null, status: "archived", deleted: false }, "editor", false],
    [{ ownerId: null, status: "published", deleted: true }, "author", false],
    [{ ownerId: "author", status: "published", deleted: false }, "author", true],
    [{ ownerId: "author", status: "archived", deleted: false }, "author", true],
    [{ ownerId: "author", status: "published", deleted: true }, "author", false],
    [{ ownerId: "other", status: "published", deleted: false }, "author", false]
  ];
  for (const [course, actorId, expected] of matrix) {
    assert.equal(canRead(course, actorId), expected);
  }
});

test("mutações serializam requestId antes de consultar ou gravar recibo", () => {
  for (const qualifiedName of [
    "public.create_authoring_workspace_v5",
    "public.commit_authoring_workspace_changes_v5",
    "public.publish_authoring_workspace_course_v5",
    "public.delete_authoring_workspace_v5"
  ]) {
    const definition = functionBlock(composedMigration, qualifiedName);
    assert.match(
      definition,
      /pg_advisory_xact_lock\(hashtextextended\([\s\S]+aralearn-workspace-request-v5:/u
    );
    assert.ok(
      definition.indexOf("pg_advisory_xact_lock")
        < definition.indexOf("from private.authoring_workspace_requests")
    );
  }
});

test("publicação editorial v5 trava coleção e vincula a submissão assumida", () => {
  const publication = functionBlock(
    composedMigration,
    "public.publish_authoring_workspace_course_v5"
  );
  assert.match(
    publication,
    /from public\.catalog_collections collection[\s\S]+for share;[\s\S]+if not found/u
  );
  assert.match(
    publication,
    /from private\.catalog_review_submissions submission[\s\S]+for update;/u
  );
  assert.match(
    publication,
    /set status = 'accepted'[\s\S]+official_course_id = v_course_id/u
  );
  assert.match(
    publication,
    /if p_target = 'private' then[\s\S]+aralearn-private-course-publication-v5:/u
  );
});

test("coleta vigente usa uma chave única e ignora snapshots de workspace", () => {
  assert.match(
    composedMigration,
    /public\.claim_unreferenced_artifacts_v4\([\s\S]+aralearn-artifact-gc-v4/u
  );
  const collector = functionBlock(
    composedMigration,
    "public.claim_unreferenced_artifacts_v4"
  );
  assert.doesNotMatch(collector, /authoring_workspace_revisions|authoring_workspaces/u);
});
