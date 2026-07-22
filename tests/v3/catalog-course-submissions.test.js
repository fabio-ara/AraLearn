import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = new URL(
  "../../supabase/migrations/20260722233000_catalog_course_submissions.sql",
  import.meta.url
);
const sqlTestPath = new URL(
  "../../supabase/tests/005_catalog_course_submissions_test.sql",
  import.meta.url
);
const baseMigrationPath = new URL(
  "../../supabase/migrations/001_aralearn_relational.sql",
  import.meta.url
);
const leanMigrationPath = new URL(
  "../../supabase/migrations/20260720010000_shared_catalog_lean_cutover.sql",
  import.meta.url
);
const copyOnWriteMigrationPath = new URL(
  "../../supabase/migrations/20260720023000_personal_course_copy_on_write.sql",
  import.meta.url
);
const migration = readFileSync(migrationPath, "utf8");
const sqlTests = readFileSync(sqlTestPath, "utf8");
const baseMigration = readFileSync(baseMigrationPath, "utf8");
const leanMigration = readFileSync(leanMigrationPath, "utf8");
const copyOnWriteMigration = readFileSync(copyOnWriteMigrationPath, "utf8");

function functionBodyFrom(source, name) {
  const start = source.indexOf(`create or replace function ${name}`);
  assert.notEqual(start, -1, `${name} precisa existir`);
  const end = source.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `${name} precisa terminar corretamente`);
  return source.slice(start, end + 4);
}

function functionBody(name) {
  return functionBodyFrom(migration, name);
}

test("fila editorial guarda metadados, não uma cópia JSON do curso", () => {
  const tableStart = migration.indexOf(
    "create table private.catalog_course_submissions"
  );
  const tableEnd = migration.indexOf("\n);", tableStart);
  const tableDefinition = migration.slice(tableStart, tableEnd);

  assert.ok(tableStart >= 0);
  assert.doesNotMatch(tableDefinition, /\bjsonb\b/iu);
  assert.match(tableDefinition, /license_code text not null/iu);
  assert.match(tableDefinition, /attribution_text text not null/iu);
  assert.match(tableDefinition, /provenance_text text not null/iu);
  assert.match(tableDefinition, /consent_version = 'catalog-submission-v1'/iu);
  assert.doesNotMatch(migration, /create table public\.catalog_course_submissions/iu);
});

test("aceite compara a origem bloqueada antes de criar o rascunho oficial", () => {
  const body = functionBody("public.decide_catalog_submission");
  const courseLock = body.indexOf("catalog-submission-source:");
  const sourceLock = body.indexOf("for update;", courseLock);
  const hashCheck = body.indexOf(
    "v_source.content_hash is distinct from v_submission.source_content_hash"
  );
  const draftInsert = body.indexOf("insert into public.courses");

  assert.ok(courseLock >= 0);
  assert.ok(sourceLock > courseLock);
  assert.ok(hashCheck > sourceLock);
  assert.ok(draftInsert > hashCheck);
  assert.match(body, /status = 'stale', stale_reason = 'source_changed'/iu);
});

test("publicação só ocorre depois da cópia integral e da validação", () => {
  const body = functionBody("public.decide_catalog_submission");
  const draftInsert = body.indexOf("insert into public.courses");
  const clone = body.indexOf("private.clone_personal_course_tree", draftInsert);
  const countComparison = body.indexOf(
    "v_target_counts is distinct from v_source_counts",
    clone
  );
  const validation = body.indexOf(
    "private.validate_catalog_submission_course(v_target_id)",
    countComparison
  );
  const mapCleanup = body.indexOf(
    "delete from private.personal_course_clone_map",
    validation
  );
  const publish = body.indexOf("set status = 'published'", mapCleanup);

  assert.ok(draftInsert >= 0);
  assert.ok(clone > draftInsert);
  assert.ok(countComparison > clone);
  assert.ok(validation > countComparison);
  assert.ok(mapCleanup > validation);
  assert.ok(publish > mapCleanup);
  assert.match(body, /map\.source_id = map\.target_id/iu);
  assert.doesNotMatch(body, /delete from public\.courses\s+where\s+id\s*=\s*v_source/iu);
});

test("destino oficial exige coleção explícita e identificador controlado", () => {
  const body = functionBody("public.decide_catalog_submission");

  assert.match(body, /if p_collection_id is null/iu);
  assert.match(body, /\^\[a-z0-9\]\+\(-\[a-z0-9\]\+\)\*\$/u);
  assert.match(body, /catalog-promotion-contract:/iu);
  assert.match(body, /catalog-promotion-official-position/iu);
  assert.match(body, /catalog-promotion-collection:/iu);
  assert.match(body, /owner_id is null[\s\S]+contract_key = v_contract_key/iu);
  assert.match(body, /O identificador oficial já existe\./u);
  assert.match(body, /insert into public\.catalog_collection_courses/iu);
});

test("todas as operações públicas fixam search_path e as tabelas não recebem grant", () => {
  const publicFunctions = [
    "public.submit_personal_course_to_catalog",
    "public.list_my_catalog_submission_candidates",
    "public.list_my_catalog_submissions",
    "public.list_catalog_submission_queue",
    "public.start_catalog_submission_review",
    "public.withdraw_catalog_submission",
    "public.decide_catalog_submission"
  ];

  for (const name of publicFunctions) {
    const body = functionBody(name);
    assert.match(body, /security definer/iu, name);
    assert.match(body, /set search_path = pg_catalog,/iu, name);
  }
  assert.match(
    migration,
    /revoke all on table private\.catalog_course_submissions[\s\S]+from public, anon, authenticated, service_role;/iu
  );
  assert.doesNotMatch(
    migration,
    /grant\s+(select|insert|update|delete)[\s\S]{0,120}catalog_course_submissions/iu
  );
});

test("validação editorial conserva regras completas e cobre posições atuais", () => {
  const completeValidator = functionBodyFrom(
    baseMigration,
    "public.validate_course_graph"
  );
  const currentValidator = functionBodyFrom(
    leanMigration,
    "public.validate_course_graph"
  );
  const editorial = functionBody("private.validate_catalog_submission_course");
  const findingCodes = (source) =>
    new Set(
      [...source.matchAll(/select\s+'([a-z.]+)'\s+(?:code|,)/giu)].map(
        (match) => match[1]
      )
    );

  assert.deepEqual(findingCodes(editorial), findingCodes(completeValidator));
  assert.match(currentValidator, /module\.position\.duplicate/iu);
  assert.match(currentValidator, /lesson\.position\.duplicate/iu);
  assert.match(currentValidator, /microsequence\.position\.duplicate/iu);
  assert.match(editorial, /private\.position_findings\(p_course_id\)/iu);
  assert.match(editorial, /private\.course_content_hash\(p_course_id\)/iu);
  assert.match(sqlTests, /posição duplicada impede a entrada na fila editorial/u);
});

test("lista de candidatos revela somente metadados pessoais íntegros", () => {
  const body = functionBody("public.list_my_catalog_submission_candidates");

  assert.match(body, /course\.owner_id = v_user_id/iu);
  assert.match(body, /validation\.result->>'contentHash' = course\.content_hash/iu);
  assert.match(body, /'courseId'[\s\S]+'title'[\s\S]+'contentHash'/iu);
  assert.match(body, /'activeSubmissionStatus'/iu);
  assert.doesNotMatch(body, /modules|lessons|microsequences|cards|card_blocks/iu);
  assert.match(sqlTests, /usuário B vê somente seu próprio candidato pessoal/u);
  assert.match(sqlTests, /requisição anônima não obtém candidatos pessoais/u);
});

test("toda tabela clonada da árvore compartilha o bloqueio por curso", () => {
  const cloneBody = functionBodyFrom(
    copyOnWriteMigration,
    "private.clone_personal_course_tree"
  );
  const tableArray = cloneBody.match(
    /v_tables constant text\[\] := array\[([\s\S]+?)\];/iu
  );
  assert.ok(tableArray);
  const clonedTables = new Set(
    [...tableArray[1].matchAll(/'([a-z_]+)'/gu)].map((match) => match[1])
  );
  const triggerSection = migration.slice(
    migration.indexOf("do $$\ndeclare\n  v_table text;"),
    migration.indexOf(
      "create or replace function private.catalog_submission_tree_counts"
    )
  );
  const triggeredTables = new Set(
    [...triggerSection.matchAll(/'([a-z_]+)'/gu)].map((match) => match[1])
  );
  const countBody = functionBody("private.catalog_submission_tree_counts");
  const countArray = countBody.match(/foreach v_table in array array\[([\s\S]+?)\]/iu);
  assert.ok(countArray);
  const countedTables = new Set(
    [...countArray[1].matchAll(/'([a-z_]+)'/gu)].map((match) => match[1])
  );

  assert.ok(clonedTables.size > 20);
  assert.deepEqual(triggeredTables, clonedTables);
  assert.deepEqual(countedTables, clonedTables);
  assert.match(
    functionBody("private.lock_personal_course_tree_statement"),
    /pg_advisory_xact_lock\(hashtextextended/iu
  );
  assert.match(
    migration,
    /before insert or update or delete on public\.courses[\s\S]{0,120}lock_personal_course_for_catalog_submission/iu
  );
});

test("pgTAP cobre consentimento, isolamento, stale, remoção e atomicidade", () => {
  const requiredEvidence = [
    "oferta sem consentimento explícito é recusada",
    "usuário A não oferece curso pessoal de B",
    "curso pessoal incompleto não entra na fila editorial",
    "posição duplicada impede a entrada na fila editorial",
    "lista omite curso com posições duplicadas",
    "candidato informa o estado da oferta ativa",
    "usuário B vê somente seu próprio candidato pessoal",
    "requisição anônima não obtém candidatos pessoais",
    "usuário comum não decide oferta",
    "alteração posterior invalida a oferta",
    "aceite revalida o marcador sob lock",
    "remoção da origem invalida a oferta",
    "falha estrutural não deixa raiz oficial parcial",
    "falha durante a cópia reverte raiz e árvore no mesmo comando",
    "rollback atômico também preserva a oferta",
    "aceitação não altera nem transfere a fonte pessoal",
    "publicação grava o hash canônico da nova identidade oficial",
    "filhos clonados recebem novos UUIDs",
    "contract_key oficial precisa ser único",
    "mapa transitório é apagado ao final"
  ];

  for (const evidence of requiredEvidence) {
    assert.match(sqlTests, new RegExp(evidence, "u"), evidence);
  }
});
