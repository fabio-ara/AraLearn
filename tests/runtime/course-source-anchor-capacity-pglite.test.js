import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Prova focal da issue #473: capacidade de ancoras por revisao de Fonte.
// O produtor real (private.execute_course_source_command_without_interventions_v1,
// renomeado de _core_v1 por 20260916030333) e carregado da migration com o corpo
// extraido, como nos outros testes PGlite do repositorio; so os auxiliares de
// autorizacao/hash que nao pertencem a este contrato sao substituidos.

const ACTOR = "10000000-0000-4000-8000-000000000001";
const COURSE = "20000000-0000-4000-8000-000000000001";
const SOURCE = "source-473";
const CAPACITY_MIGRATION = "20261016120000_course_source_anchor_capacity.sql";

const read = async name => (await fs.readFile(new URL("../../supabase/migrations/" + name, import.meta.url), "utf8")).replaceAll("\r\n", "\n");
function definition(source, name) {
  const start = source.search(new RegExp("create (?:or replace )?function " + name.replaceAll(".", "\\.") + "\\(", "iu"));
  assert.ok(start >= 0, name);
  const delimiter = /\bas\s+(\$\w*\$)/iu.exec(source.slice(start));
  assert.ok(delimiter, name);
  const body = start + delimiter.index + delimiter[0].length;
  const end = source.indexOf(delimiter[1] + ";", body);
  assert.ok(end > start, name);
  return source.slice(start, end + delimiter[1].length + 1);
}
const sourceMigration = await read("20260905101903_contextual_course_sources.sql");
const capacityMigration = await read(CAPACITY_MIGRATION);
const liveProducer = definition(sourceMigration, "private.execute_course_source_command_core_v1")
  .replaceAll("execute_course_source_command_core_v1", "execute_course_source_command_without_interventions_v1");
const linkShapeValidator = definition(sourceMigration, "private.valid_course_source_links_shape_v2");

async function fixture({ denyAccess = false } = {}) {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema private; create schema auth;
    create table auth.users(id uuid primary key); insert into auth.users(id) values('10000000-0000-4000-8000-000000000001');
    create table public.courses(id uuid primary key, revision bigint not null default 1,
      updated_at timestamptz not null default now(), bibliography_style text);
    create table private.course_sources(course_id uuid, source_id text, revision bigint not null default 1,
      status text not null default 'active', study_visibility text not null default 'citation', primary key(course_id, source_id));
    create table private.course_source_anchors(course_id uuid, anchor_id text, revision bigint not null default 1,
      source_id text, source_revision bigint, status text, selector jsonb, content_hash text,
      human_locator text, verification_excerpt text, created_at timestamptz not null default now(),
      primary key(course_id, anchor_id));
    create table private.course_source_attachments(course_id uuid, source_id text, content_hash text);
    create table private.course_change_receipts(actor_id uuid, request_id text, operation text, course_id uuid,
      request_hash text, result jsonb, expires_at timestamptz not null default now() + interval '1 day',
      primary key(actor_id, request_id));
    create function private.require_service_role() returns void language sql as $$select$$;
    create function private.require_course_access_v1(uuid,uuid,boolean) returns void language plpgsql as
      $$begin if ${denyAccess ? "true" : "false"} then raise exception 'Acesso negado.' using errcode='42501'; end if; end$$;
    create function private.course_source_json_hash_v1(jsonb) returns text language sql immutable as
      $$select repeat(md5($1::text),2)$$;
    insert into public.courses(id) values('${COURSE}');
    insert into private.course_sources(course_id,source_id) values('${COURSE}','${SOURCE}');
  `);
  await db.exec('set check_function_bodies=off');
  await db.exec(liveProducer);
  await db.exec(linkShapeValidator);
  return db;
}

async function revision(db) { return (await db.query("select revision from public.courses where id=$1", [COURSE])).rows[0].revision; }
function command(anchorId, { expectedAnchorRevision = 0, excerpt = null, locator = null } = {}) {
  return { type: "save_anchor", anchorId, sourceId: SOURCE, sourceRevision: 1, expectedAnchorRevision,
    selector: { kind: "page_range", startPage: 1, endPage: 1 }, contentHash: null, humanLocator: locator, verificationExcerpt: excerpt };
}
async function saveAnchor(db, anchorId, options = {}) {
  return db.query("select private.execute_course_source_command_without_interventions_v1($1,$2,$3,$4,$5,$6) as result",
    [ACTOR, COURSE, await revision(db), command(anchorId, options), "application", anchorId + "-request"]);
}
const anchorCount = async db => (await db.query("select count(*)::int as value from private.course_source_anchors")).rows[0].value;

test("producao recusa a nona identidade e preserva as oito anteriores", async () => {
  const db = await fixture();
  for (let index = 1; index <= 8; index += 1) {
    const saved = await saveAnchor(db, "anchor-" + index, { locator: "Trecho " + index });
    assert.equal(saved.rows[0].result.changed, true, "ancora " + index);
  }
  const before = (await db.query("select anchor_id, human_locator, revision from private.course_source_anchors order by anchor_id")).rows;
  assert.equal(before.length, 8);
  await assert.rejects(() => saveAnchor(db, "anchor-9"),
    error => /23514/u.test(error.code) && /no máximo oito identidades de Âncora/u.test(error.message));
  const after = (await db.query("select anchor_id, human_locator, revision from private.course_source_anchors order by anchor_id")).rows;
  assert.deepEqual(after, before, "as oito anteriores seguem intactas");
  await db.close();
});

test("a capacidade explicita libera a nona identidade e preserva os vinculos", async () => {
  const db = await fixture();
  for (let index = 1; index <= 8; index += 1) await saveAnchor(db, "anchor-" + index, { locator: "Trecho " + index });
  const before = (await db.query("select anchor_id, human_locator from private.course_source_anchors order by anchor_id")).rows;
  await db.exec(capacityMigration);
  const definitionText = await db.query("select pg_get_functiondef(p.oid) as body from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='execute_course_source_command_without_interventions_v1'");
  assert.match(definitionText.rows[0].body, /course_source_anchor_count_limit_v1/u, "produtor passa a citar o contrato");
  assert.doesNotMatch(definitionText.rows[0].body, /oito identidades/u, "texto antigo sai do produtor");
  const ninth = await saveAnchor(db, "anchor-9", { locator: "Trecho 9" });
  assert.equal(ninth.rows[0].result.changed, true);
  assert.equal(await anchorCount(db), 9);
  const preserved = (await db.query("select anchor_id, human_locator from private.course_source_anchors where anchor_id <> 'anchor-9' order by anchor_id")).rows;
  assert.deepEqual(preserved, before, "os vinculos anteriores nao mudam");
  await db.close();
});

test("o limite novo e explicito, vale para qualquer escrita e recusa com diagnostico", async () => {
  const db = await fixture();
  await db.exec(capacityMigration);
  for (let index = 1; index <= 63; index += 1) {
    await db.query("insert into private.course_source_anchors(course_id,anchor_id,revision,source_id,source_revision,status,selector) values($1,$2,1,$3,1,'active','{\"kind\":\"page_range\",\"startPage\":1,\"endPage\":1}'::jsonb)", [COURSE, "bulk-" + index, SOURCE]);
  }
  const sixtyFourth = await saveAnchor(db, "anchor-64");
  assert.equal(sixtyFourth.rows[0].result.changed, true);
  assert.equal(await anchorCount(db), 64);
  await assert.rejects(() => saveAnchor(db, "anchor-65"),
    error => /23514/u.test(error.code) && /no máximo 64 identidades de Âncora/u.test(error.message));
  await assert.rejects(() => db.query("insert into private.course_source_anchors(course_id,anchor_id,revision,source_id,source_revision,status,selector) values($1,'direct-65',1,$2,1,'active','{}'::jsonb)", [COURSE, SOURCE]),
    error => /23514/u.test(error.code) && /no máximo 64 identidades de Âncora/u.test(error.message));
  assert.equal(await anchorCount(db), 64);
  await db.close();
});

test("o orcamento de bytes das ancoras e explicito e nao desativa protecoes", async () => {
  const db = await fixture();
  await db.exec(capacityMigration);
  await saveAnchor(db, "anchor-small", { locator: "Trecho 1" });
  await assert.rejects(() => saveAnchor(db, "anchor-huge", { excerpt: "x".repeat(140 * 1024) }),
    error => /23514/u.test(error.code) && /orçamento de 128 KiB/u.test(error.message));
  // A ancora recusada nao entra e a ancora pequena permanece: a protecao nao e desativada.
  assert.equal(await anchorCount(db), 1);
  await db.close();
});

test("autorizacao negativa segue barrada sem escrever ancora", async () => {
  const db = await fixture({ denyAccess: true });
  await db.exec(capacityMigration);
  await assert.rejects(() => saveAnchor(db, "anchor-denied"), error => /42501/u.test(error.code));
  assert.equal(await anchorCount(db), 0);
  await db.close();
});

test("lote por requisicao e selecao por vinculo continuam iguais", async () => {
  const db = await fixture();
  const link = count => [{ linkId: "link-1", sourceId: SOURCE, relation: "informed_by", roles: ["curricular_scope"],
    anchors: Array.from({ length: count }, (_, index) => ({ anchorId: "anchor-" + (index + 1) })), occurrences: [] }];
  const accept = await db.query("select private.valid_course_source_links_shape_v2($1::jsonb) as value", [JSON.stringify(link(8))]);
  assert.equal(accept.rows[0].value, true, "oito ancoras por vinculo continuam aceitas");
  const refuse = await db.query("select private.valid_course_source_links_shape_v2($1::jsonb) as value", [JSON.stringify(link(9))]);
  assert.equal(refuse.rows[0].value, false, "nove ancoras por vinculo continuam recusadas");
  await assert.rejects(() => db.query("select private.execute_course_source_command_without_interventions_v1($1,$2,$3,$4,$5,$6)",
    [ACTOR, COURSE, 1, { type: "save_anchor", anchorId: "anchor-huge-command", sourceId: SOURCE, sourceRevision: 1,
      expectedAnchorRevision: 0, selector: { kind: "page_range", startPage: 1, endPage: 1 }, contentHash: null,
      humanLocator: null, verificationExcerpt: "x".repeat(200 * 1024) }, "application", "too-large-command"]),
    error => /22023/u.test(error.code) && /Comando de Fonte inválido/u.test(error.message));
  await db.close();
});

