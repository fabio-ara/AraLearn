import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function readProjectText(path) {
  return fs.readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/gu, "\n");
}

const migration = readProjectText(
  "../../supabase/migrations/20260729010000_authoring_workspaces_v4.sql"
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
const supabaseConfig = readProjectText("../../supabase/config.toml");

function functionBlock(source, qualifiedName) {
  const escaped = qualifiedName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const definition = source.match(
    new RegExp(`create(?: or replace)? function ${escaped}\\([\\s\\S]*?\\n\\$\\$;`, "u")
  )?.[0];
  assert.ok(definition, `Definição ausente: ${qualifiedName}`);
  return definition;
}

function rewriteOAuthNative(definition) {
  return definition
    .replaceAll("p_client_id uuid,", "")
    .replaceAll("p_owner_id, p_client_id", "p_owner_id")
    .replaceAll("p_client_id,", "")
    .replaceAll("api_client_id,", "");
}

test("migração substitui execuções v3 por workspaces e revisões imutáveis", () => {
  for (const table of [
    "private.authoring_workspaces",
    "private.authoring_workspace_revisions",
    "private.authoring_workspace_requests"
  ]) {
    assert.match(migration, new RegExp(`create table ${table.replace(".", "\\.")}`, "u"));
  }
  for (const retired of [
    "private.run_artifacts",
    "private.authoring_parts",
    "private.authoring_requests",
    "private.authoring_runs"
  ]) {
    assert.match(migration, new RegExp(`drop table if exists ${retired.replace(".", "\\.")}`, "u"));
  }
  assert.match(migration, /current_artifact_hash text not null/u);
  assert.match(migration, /primary key\(workspace_id, revision\)/u);
});

test("toda mutação usa compare-and-swap e replay idempotente", () => {
  assert.match(migration, /for update;/u);
  assert.match(migration, /v_workspace\.revision <> p_expected_revision/u);
  assert.match(migration, /replay_authoring_workspace_request_v4/u);
  assert.match(migration, /requestId reutilizado com dados diferentes/u);

  const replayPosition = engine.indexOf("const replayed = await this.#replay");
  const readPosition = engine.indexOf(
    "const current = await this.#workspaceDocument",
    replayPosition
  );
  assert.ok(replayPosition >= 0 && readPosition > replayPosition);
});

test("publicação parcial é privada e o catálogo exige curso completo", () => {
  assert.match(
    migration,
    /p_target = 'catalog' and p_completion_state <> 'complete'/u
  );
  assert.match(
    migration,
    /completion_state in \('partial', 'complete'\)/u
  );
  assert.match(migration, /publish_private_preview/u);
  assert.match(migration, /publish_catalog_complete/u);
});

test("artefatos de workspaces e cursos publicados permanecem alcançáveis pelo GC", () => {
  assert.match(
    migration,
    /private\.authoring_workspace_revisions revision\s+where revision\.artifact_hash = ref\.hash/u
  );
  assert.match(
    migration,
    /private\.course_revisions revision\s+where revision\.artifact_hash = ref\.hash/u
  );
});

test("publicação reutiliza o artefato imutável quando o curso já é o documento do workspace", () => {
  assert.match(
    engine,
    /prepared\.contentHash === control\.artifact\?\.hash\s+\? control\.artifact/u
  );
  assert.match(
    engine,
    /: await this\.artifacts\.putJson\(prepared\.document,[\s\S]+COURSE_REVISION_BUCKET/u
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

test("reescrita OAuth mantém alinhadas as colunas e os valores do workspace", () => {
  const rewritten = rewriteOAuthNative(
    functionBlock(migration, "public.create_authoring_workspace_v4")
  );
  assert.doesNotMatch(rewritten, /p_client_id|api_client_id/u);
  assert.match(
    rewritten,
    /insert into private\.authoring_workspaces\(\s*id,\s*owner_id,\s*title,\s*current_artifact_hash,\s*source_course_id,\s*source_revision_hash\s*\)\s*values\s*\(\s*p_workspace_id,\s*p_owner_id,\s*btrim\(p_title\),\s*v_hash,\s*p_source_course_id,\s*p_source_revision_hash\s*\)/u
  );
  assert.match(
    rewritten,
    /private\.require_workspace_actor_v4\(\s*p_owner_id,\s*'authoring:write'\s*\)/u
  );
});

test("reescrita OAuth liga publicação, trava editorial e impl somente ao owner", () => {
  const wrapper = rewriteOAuthNative(
    functionBlock(
      hardeningMigration,
      "public.publish_authoring_workspace_course_v4"
    )
  );
  const implementation = rewriteOAuthNative(
    functionBlock(migration, "public.publish_authoring_workspace_course_v4")
  );
  for (const definition of [wrapper, implementation]) {
    assert.doesNotMatch(definition, /p_client_id|api_client_id/u);
    assert.match(
      definition,
      /private\.require_workspace_actor_v4\(\s*p_owner_id,/u
    );
  }
  assert.match(
    wrapper,
    /private\.lock_workspace_catalog_publication_authority_v4\(\s*p_owner_id\s*\)/u
  );
  assert.match(
    wrapper,
    /publish_authoring_workspace_course_v4_impl\(\s*p_owner_id,\s*p_workspace_id,/u
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

test("hardening fixa recibos idempotentes, paginação e registro de artefatos no v4", () => {
  assert.match(
    hardeningMigration,
    /alter function private\.register_artifact_v3\(jsonb\)\s+rename to register_artifact_v4/u
  );
  assert.match(
    hardeningMigration,
    /add column result jsonb[\s\S]+alter column result set not null/u
  );
  assert.match(
    hardeningMigration,
    /populate_authoring_workspace_request_result_v4[\s\S]+before insert on private\.authoring_workspace_requests/u
  );
  assert.match(
    hardeningMigration,
    /return v_request\.result \|\| jsonb_build_object\('idempotent', true\)/u
  );
  for (const functionName of [
    "create_authoring_workspace_v4",
    "commit_authoring_workspace_revision_v4",
    "publish_authoring_workspace_course_v4_impl"
  ]) {
    assert.match(
      hardeningMigration,
      new RegExp(`public\\.${functionName}`, "u")
    );
  }
  assert.match(
    hardeningMigration,
    /private\.course_revisions revision[\s\S]+revision\.published_at <= request\.created_at/u
  );
  assert.match(
    hardeningMigration,
    /limit p_limit \+ 1[\s\S]+'nextCursor'/u
  );
  assert.match(
    hardeningMigration,
    /p_before_revision bigint default null/u
  );
  assert.match(
    hardeningMigration,
    /'schemaRevision', '20260729070000'/u
  );
});

test("hardening reescreve separadamente o replay idempotente de create e commit", () => {
  assert.match(
    hardeningMigration,
    /v_create_before text := \$patch\$[\s\S]+where id = v_request\.workspace_id and owner_id = p_owner_id/u
  );
  assert.match(
    hardeningMigration,
    /v_commit_before text := \$patch\$[\s\S]+where id = p_workspace_id and owner_id = p_owner_id/u
  );
  assert.match(
    hardeningMigration,
    /when v_signature =\s*'public\.create_authoring_workspace_v4\([\s\S]+then v_create_before\s+else v_commit_before/u
  );
});

test("hardening permite importar curso no workspace pela RPC de revisão", () => {
  assert.match(
    hardeningMigration,
    /commit_authoring_workspace_revision_v4\(uuid,uuid,uuid,text,text,bigint,text,jsonb\)[\s\S]+p_operation not in \([\s\S]+?'import_course'/u
  );
  assert.match(
    migration,
    /authoring_workspace_revisions_operation_v4[\s\S]+?'create', 'import_course'/u
  );
  assert.match(
    migration,
    /authoring_workspace_requests_operation_v4[\s\S]+?'create', 'import_course'/u
  );
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
  assert.match(
    hardeningMigration,
    /create function private\.lock_authoring_workspace_request_v4\([\s\S]+pg_advisory_xact_lock\(hashtextextended\([\s\S]+aralearn-workspace-request-v4:/u
  );
  for (const signature of [
    "create_authoring_workspace_v4",
    "commit_authoring_workspace_revision_v4",
    "delete_authoring_workspace_v4"
  ]) {
    assert.match(
      hardeningMigration,
      new RegExp(
        `${signature}[\\s\\S]+lock_authoring_workspace_request_v4`,
        "u"
      )
    );
  }
  const publication = hardeningMigration.match(
    /create or replace function public\.publish_authoring_workspace_course_v4\([\s\S]+?\nend;\n\$\$;/u
  )?.[0] || "";
  assert.ok(
    publication.indexOf("lock_authoring_workspace_request_v4")
      < publication.indexOf("publish_authoring_workspace_course_v4_impl")
  );
});

test("publicação editorial OAuth trava papel e coleção", () => {
  const helper = oauthOnlyMigration.match(
    /create function private\.lock_workspace_catalog_publication_authority_v4\([\s\S]+?\nend;\n\$\$;/u
  )?.[0] || "";
  assert.match(
    helper,
    /app_role_assignments[\s\S]+assignment\.active[\s\S]+assignment\.revoked_at is null[\s\S]+for share/u
  );
  assert.match(helper, /\(\s+p_owner_id uuid\s+\)/u);

  const publication = hardeningMigration.match(
    /create or replace function public\.publish_authoring_workspace_course_v4\([\s\S]+?\nend;\n\$\$;/u
  )?.[0] || "";
  assert.ok(
    publication.indexOf("lock_workspace_catalog_publication_authority_v4")
      < publication.indexOf("from public.catalog_collections")
  );
  assert.match(
    publication,
    /from public\.catalog_collections collection[\s\S]+for share;[\s\S]+if not found/u
  );
  assert.match(
    hardeningMigration,
    /revoke all on function public\.publish_authoring_workspace_course_v4_impl\([\s\S]+from public, anon, authenticated, service_role/u
  );
});

test("registro e coleta usam somente a chave advisory v4", () => {
  assert.match(
    hardeningMigration,
    /private\.register_artifact_v4\(jsonb\)[\s\S]+public\.claim_unreferenced_artifacts_v4\(uuid,interval,integer\)[\s\S]+aralearn-artifact-gc-v4/u
  );
  assert.match(
    hardeningMigration,
    /procedure_value\.prosrc like '%aralearn-artifact-gc-v3%'/u
  );
});
