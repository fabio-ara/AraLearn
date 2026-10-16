import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { normalizeCourseSourceCommand } from "../../src/domain/courseSources.js";

// Prova focal da issue #473: capacidade de Âncoras de uma revisão de Fonte.
//
// O produtor real (private.execute_course_source_command_without_interventions_v1,
// renomeado de _core_v1 por 20260916030333) e o leitor real de Fontes
// (public.get_owned_course_sources_for_actor_v1) vêm do texto das migrations.
// Autorização, hash de pedido e cota de PDF — que não pertencem a este contrato —
// são stubs, como nos demais testes PGlite do repositório: isso prova o
// encadeamento SQL, não RLS hospedada nem PostgREST.
//
// Todo tamanho de fixture passa pelo normalizador do cliente
// (src/domain/courseSources.js): trecho de conferência de até 2000 caracteres,
// localizador humano de até 500, seletor text_quote com exact de até 4000 e
// prefixo/sufixo de até 500, com o comando inteiro de até 32768 octetos.

const ACTOR = "10000000-0000-4000-8000-000000000001";
const COURSE = "20000000-0000-4000-8000-000000000001";
const SOURCE = "source-473";
const CAPACITY_MIGRATION = "20261016171317_course_source_anchor_capacity.sql";
const COUNT_LIMIT = 64;
const BYTES_LIMIT = 131072;
const READER_LIMIT = 262144;
const WIDE = "\u{1d51e}"; // quatro octetos em UTF-8
const CAPACITY_ERROR = error => /23514/u.test(error.code) && /o máximo aceito/u.test(error.message);
const BUDGET_ERROR = error => /23514/u.test(error.code) && /orçamento aceito/u.test(error.message);

const MANIFEST_BEFORE = { schemaRevision: "20261016071003", contractVersion: 1,
  features: ["course-sources-v1", "flat-runtime-manifest-v1"] };
const MANIFEST_AFTER = "20261016171317";

const read = async name => (await fs.readFile(new URL("../../supabase/migrations/" + name, import.meta.url), "utf8")).replaceAll("\r\n", "\n");

function definition(source, name) {
  const start = source.search(new RegExp("create (?:or replace )?function " + name.replaceAll(".", "\\.") + "\\(", "iu"));
  assert.ok(start >= 0, name);
  const delimiter = /\bas\s+(\$\w*\$)/iu.exec(source.slice(start));
  assert.ok(delimiter, name);
  const body = start + delimiter.index + delimiter[0].length;
  const end = source.indexOf(delimiter[1], body);
  assert.ok(end > start, name);
  let cursor = end + delimiter[1].length;
  while (/\s/u.test(source[cursor] || "")) cursor += 1;
  assert.equal(source[cursor], ";", name);
  return source.slice(start, cursor + 1);
}

const sourceMigration = await read("20260905101903_contextual_course_sources.sql");
const capacityMigration = await read(CAPACITY_MIGRATION);
// Comentários fora: o patch precisa ficar restrito ao produtor de Âncoras.
const capacitySql = capacityMigration.split("\n").filter(line => !line.trimStart().startsWith("--")).join("\n");
const liveProducer = definition(sourceMigration, "private.execute_course_source_command_core_v1")
  .replaceAll("execute_course_source_command_core_v1", "execute_course_source_command_without_interventions_v1");
const linkShapeValidator = definition(sourceMigration, "private.valid_course_source_links_shape_v2");
const liveReader = definition(sourceMigration, "public.get_owned_course_sources_for_actor_v1");
const EIGHT_BLOCK = "    ) >= 8 then\n      raise exception 'Uma revisão de Fonte aceita no máximo oito identidades de Âncora.'\n        using errcode = '23514';\n    end if;";
assert.ok(liveProducer.includes(EIGHT_BLOCK), "bloco de oito identidades presente no produtor real");

async function fixture(options) {
  const denyAccess = options && options.denyAccess === true;
  const withReader = options && options.withReader === true;
  const db = new PGlite();
  await db.exec([
    "create role anon; create role authenticated; create schema private; create schema auth;",
    "create table auth.users(id uuid primary key);",
    "insert into auth.users(id) values('" + ACTOR + "');",
    "create table public.courses(id uuid primary key, revision bigint not null default 1,",
    "  updated_at timestamptz not null default now(), bibliography_style text);",
    "create table private.course_sources(course_id uuid, source_id text, revision bigint not null default 1,",
    "  status text not null default 'active', kind text, default_roles jsonb, title text, authors jsonb,",
    "  publication_date text, identifier text, language text, citation_mode text, bibliographic jsonb,",
    "  citation_text text, url text, edition_or_version text, origin text, availability text,",
    "  verification_status text, study_visibility text not null default 'citation', public_file_access text,",
    "  created_at timestamptz not null default now(), primary key(course_id, source_id));",
    "create table private.course_source_anchors(course_id uuid, anchor_id text, revision bigint not null default 1,",
    "  source_id text, source_revision bigint, status text, selector jsonb, content_hash text, human_locator text,",
    "  verification_excerpt text, created_at timestamptz not null default now(), primary key(course_id, anchor_id));",
    "create table private.course_source_attachments(course_id uuid, source_id text, content_hash text,",
    "  public_file_access text, byte_size bigint, media_type text, storage_path text,",
    "  status text not null default 'active', created_at timestamptz not null default now());",
    "create table private.course_change_receipts(actor_id uuid, request_id text, operation text, course_id uuid,",
    "  request_hash text, result jsonb, expires_at timestamptz not null default now() + interval '1 day',",
    "  primary key(actor_id, request_id));",
    "create function private.require_service_role() returns void language sql as $$select$$;",
    "create function private.require_course_access_v1(uuid,uuid,boolean) returns void language plpgsql as",
    "  $$begin if " + (denyAccess ? "true" : "false") + " then raise exception 'Acesso negado.' using errcode='42501'; end if; end$$;",
    "create function private.course_source_json_hash_v1(jsonb) returns text language sql immutable as",
    "  $$select repeat(md5($1::text),2)$$;",
    "create function private.course_source_pdf_unique_bytes_v1(uuid) returns bigint language sql as $$select 0::bigint$$;",
    "create function private.course_source_target_state_v1(uuid,text,text) returns jsonb language sql as $$select null::jsonb$$;",
    "create table private.course_source_attributions(course_id uuid, id uuid, target_kind text, target_id text);",
    "create table private.course_source_attribution_sources(course_id uuid, attribution_id uuid, source_id text);",
    "create function private.course_effective_source_attribution_v1(p_course_id uuid, p_target_kind text, p_target_id text)",
    "  returns setof private.course_source_attributions language sql as",
    "  $$select * from private.course_source_attributions where course_id=p_course_id and target_kind=p_target_kind and target_id=p_target_id$$;",
    "create function public.get_aralearn_runtime_manifest() returns jsonb language sql stable as",
    "  $manifest$select '" + JSON.stringify(MANIFEST_BEFORE) + "'::jsonb$manifest$;",
    "insert into public.courses(id) values('" + COURSE + "');",
    "insert into private.course_sources(course_id, source_id) values('" + COURSE + "','" + SOURCE + "');"
  ].join("\n"));
  await db.exec("set check_function_bodies=off");
  await db.exec(liveProducer);
  await db.exec(linkShapeValidator);
  if (withReader) await db.exec(liveReader);
  return db;
}

let serial = 0;
const nextRequestId = prefix => { serial += 1; return prefix + "-r" + serial; };
const command = (anchorId, options) => {
  const extra = options || {};
  return {
    type: "save_anchor",
    anchorId,
    sourceId: SOURCE,
    sourceRevision: 1,
    expectedAnchorRevision: extra.expectedAnchorRevision === undefined ? 0 : extra.expectedAnchorRevision,
    selector: extra.selector || { kind: "page_range", startPage: 1, endPage: 1 },
    contentHash: extra.contentHash === undefined ? null : extra.contentHash,
    humanLocator: extra.locator === undefined ? null : extra.locator,
    verificationExcerpt: extra.excerpt === undefined ? null : extra.excerpt
  };
};
const revision = async db => (await db.query("select revision from public.courses where id=$1", [COURSE])).rows[0].revision;
const saveAnchor = async (db, anchorId, options) => db.query(
  "select private.execute_course_source_command_without_interventions_v1($1,$2,$3,$4,$5,$6) as result",
  [ACTOR, COURSE, await revision(db), command(anchorId, options), "application", nextRequestId(anchorId)]
);
const retireAnchor = async (db, anchorId, expectedAnchorRevision) => db.query(
  "select private.execute_course_source_command_without_interventions_v1($1,$2,$3,$4,$5,$6) as result",
  [ACTOR, COURSE, await revision(db), { type: "retire_anchor", anchorId, expectedAnchorRevision },
    "application", nextRequestId(anchorId + "-retire")]
);
const anchorRows = async db => (await db.query(
  "select anchor_id, revision, status, human_locator from private.course_source_anchors order by anchor_id")).rows;
const anchorCount = async db => Number((await db.query(
  "select count(*) as value from private.course_source_anchors")).rows[0].value);
const anchorBytes = async db => Number((await db.query([
  "select coalesce(sum(private.course_source_anchor_bytes_v1(course_id, anchor_id, source_id, source_revision,",
  "  selector, content_hash, human_locator, verification_excerpt)), 0) as value from private.course_source_anchors"
].join(" "))).rows[0].value);
const producerBody = async db => (await db.query([
  "select pg_get_functiondef(p.oid) as value from pg_proc p join pg_namespace n on n.oid = p.pronamespace",
  "where n.nspname = 'private' and p.proname = 'execute_course_source_command_without_interventions_v1'"
].join(" "))).rows[0].value;
const readerPayload = async db => (await db.query(
  "select public.get_owned_course_sources_for_actor_v1($1,$2,$3,'source',$4) as value",
  [ACTOR, COURSE, await revision(db), SOURCE])).rows[0].value;
const readerBytes = async db => Number((await db.query(
  "select octet_length(public.get_owned_course_sources_for_actor_v1($1,$2,$3,'source',$4)::text) as value",
  [ACTOR, COURSE, await revision(db), SOURCE])).rows[0].value);
const sourceLinks = anchorIds => [{
  linkId: "link-1", sourceId: SOURCE, relation: "informed_by", roles: ["curricular_scope"],
  anchors: anchorIds.map(anchorId => ({ anchorId })), occurrences: []
}];
const linkAccepted = async (db, anchorIds) => (await db.query(
  "select private.valid_course_source_links_shape_v2($1::jsonb) as value", [JSON.stringify(sourceLinks(anchorIds))])).rows[0].value;

test("o produtor real recusa a nona identidade e preserva as oito da mesma revisão", async () => {
  const db = await fixture();
  for (let index = 1; index <= 8; index += 1) {
    const saved = await saveAnchor(db, "anchor-" + index, { locator: "Trecho " + index });
    assert.equal(saved.rows[0].result.changed, true, "âncora " + index);
  }
  const before = await anchorRows(db);
  assert.equal(before.length, 8);
  await assert.rejects(() => saveAnchor(db, "anchor-9", { locator: "Trecho 9" }),
    error => /23514/u.test(error.code) && /no máximo oito identidades de Âncora/u.test(error.message));
  assert.deepEqual(await anchorRows(db), before, "as oito anteriores seguem intactas");
  await db.close();
});

test("a capacidade nomeada libera a nona identidade e preserva âncoras e vínculos", async () => {
  const db = await fixture();
  for (let index = 1; index <= 8; index += 1) {
    await saveAnchor(db, "anchor-" + index, { locator: "Trecho " + index });
  }
  const before = await anchorRows(db);
  await db.exec(capacityMigration);
  const body = await producerBody(db);
  assert.match(body, /course_source_anchor_count_limit_v1/u, "o produtor passa a citar o limite nomeado");
  assert.doesNotMatch(body, /oito identidades de Âncora/u, "o texto antigo sai do produtor");
  const ninth = await saveAnchor(db, "anchor-9", { locator: "Trecho 9" });
  assert.equal(ninth.rows[0].result.changed, true);
  assert.equal(await anchorCount(db), 9);
  assert.deepEqual((await anchorRows(db)).filter(row => row.anchor_id !== "anchor-9"), before,
    "as âncoras anteriores não mudam");
  const eight = ["anchor-1", "anchor-2", "anchor-3", "anchor-4", "anchor-5", "anchor-6", "anchor-7", "anchor-8"];
  assert.equal(await linkAccepted(db, eight), true, "oito âncoras por vínculo continuam aceitas");
  assert.equal(await linkAccepted(db, eight.concat("anchor-9")), false, "nove âncoras por vínculo continuam recusadas");
  await db.close();
});

test("o patch é restrito: três contratos nomeados, sem trigger e sem outros contratos de Fontes", async () => {
  assert.equal((capacitySql.match(/create function/gu) || []).length, 3);
  assert.doesNotMatch(capacitySql, /create trigger|alter table|add constraint/u);
  assert.equal((capacitySql.match(/get_aralearn_runtime_manifest/gu) || []).length, 2);
  assert.match(capacitySql, /schemaRevision[\s\S]{0,160}['"]20261016171317['"]/u);
  assert.doesNotMatch(capacitySql, /course_source_bundle|sourceLinks|link_shape|get_owned_course_sources_for_actor_v1/u);
});

test("a migration avança o manifesto preservando as capacidades correntes", async () => {
  const db = await fixture();
  const before = (await db.query("select public.get_aralearn_runtime_manifest() as value")).rows[0].value;
  assert.equal(before.schemaRevision, MANIFEST_BEFORE.schemaRevision);
  await db.exec(capacityMigration);
  const after = (await db.query("select public.get_aralearn_runtime_manifest() as value")).rows[0].value;
  assert.equal(after.schemaRevision, MANIFEST_AFTER);
  assert.equal(after.contractVersion, before.contractVersion);
  assert.deepEqual(after.features, before.features);
  await db.close();
});

test("o patch falha alto quando o produtor está ausente ou divergente", async () => {
  const missing = await fixture();
  await missing.exec("drop function private.execute_course_source_command_without_interventions_v1(uuid,uuid,bigint,jsonb,text,text)");
  await assert.rejects(() => missing.exec(capacityMigration),
    error => /23514/u.test(error.code) && /Produtor de Fontes ausente/u.test(error.message));
  await missing.close();
  const divergent = [
    EIGHT_BLOCK.replace("oito identidades de Âncora.", "oito identidades."),
    EIGHT_BLOCK.replace(") >= 8 then", ") >= 9 then")
  ];
  for (const block of divergent) {
    const db = await fixture();
    const alternativo = liveProducer.replace(EIGHT_BLOCK, block);
    assert.notEqual(alternativo, liveProducer);
    await db.exec(alternativo);
    await assert.rejects(() => db.exec(capacityMigration),
      error => /23514/u.test(error.code) && /Bloco de capacidade de Âncoras inesperado/u.test(error.message));
    try { await db.exec("rollback"); } catch { /* a recusa abortou a transação implícita do exec */ }
    assert.doesNotMatch(await producerBody(db), /course_source_anchor_count_limit_v1/u,
      "o produtor divergente segue intocado");
    await db.close();
  }
});

test("a identidade 65 é recusada pelo limite nomeado e a retirada segue aceita", async () => {
  const db = await fixture();
  await db.exec(capacityMigration);
  for (let index = 1; index <= COUNT_LIMIT; index += 1) {
    const saved = await saveAnchor(db, "anchor-" + index, { locator: "Trecho " + index });
    assert.equal(saved.rows[0].result.changed, true, "âncora " + index);
  }
  assert.equal(await anchorCount(db), COUNT_LIMIT);
  const before = await anchorRows(db);
  await assert.rejects(() => saveAnchor(db, "anchor-65", { locator: "Trecho 65" }), CAPACITY_ERROR);
  assert.deepEqual(await anchorRows(db), before, "as 64 seguem intactas após a recusa");
  const revised = await saveAnchor(db, "anchor-1", { locator: "Trecho 1 revisado", expectedAnchorRevision: 1 });
  assert.equal(revised.rows[0].result.changed, true, "revisar identidade existente não consome capacidade");
  const retired = await retireAnchor(db, "anchor-2", 1);
  assert.equal(retired.rows[0].result.changed, true, "retirada não é recusada");
  assert.equal((await db.query("select status from private.course_source_anchors where anchor_id='anchor-2'")).rows[0].status, "retired");
  await db.close();
});

test("o orçamento de 128 KiB mede octetos, aceita manutenção e recusa crescimento", async () => {
  const legacySelector = { kind: "text_quote", exact: WIDE.repeat(3000), prefix: WIDE.repeat(500), suffix: WIDE.repeat(500) };
  const grownSelector = { kind: "text_quote", exact: WIDE.repeat(4000), prefix: WIDE.repeat(500), suffix: WIDE.repeat(500) };
  const legacyExcerpt = WIDE.repeat(2000);
  const legacyLocator = WIDE.repeat(500);
  assert.doesNotThrow(() => normalizeCourseSourceCommand(
    command("legacy-1", { selector: legacySelector, excerpt: legacyExcerpt, locator: legacyLocator })),
    "o cliente aceita a âncora herdada usada aqui");
  assert.doesNotThrow(() => normalizeCourseSourceCommand(
    command("legacy-1", { selector: grownSelector, excerpt: legacyExcerpt, locator: legacyLocator })),
    "o cliente aceita o crescimento usado aqui");
  assert.throws(() => normalizeCourseSourceCommand(command("legacy-1", { excerpt: "x".repeat(140 * 1024) })),
    error => error.code === "invalid_course_source_command",
    "o cliente nunca envia um trecho de 140 KiB");
  const db = await fixture();
  for (let index = 1; index <= 8; index += 1) {
    const saved = await saveAnchor(db, "legacy-" + index,
      { selector: legacySelector, excerpt: legacyExcerpt, locator: legacyLocator });
    assert.equal(saved.rows[0].result.changed, true, "âncora herdada " + index);
  }
  await db.exec(capacityMigration);
  const legacyBytes = await anchorBytes(db);
  assert.ok(legacyBytes > BYTES_LIMIT, "acervo herdado acima do orçamento: " + legacyBytes);
  const octets = Number((await db.query("select octet_length($1::text) as value", [legacyExcerpt])).rows[0].value);
  const characters = Number((await db.query("select char_length($1::text) as value", [legacyExcerpt])).rows[0].value);
  assert.ok(octets > characters, "o orçamento mede octetos, não caracteres");
  const same = await saveAnchor(db, "legacy-1",
    { selector: legacySelector, excerpt: legacyExcerpt, locator: legacyLocator, expectedAnchorRevision: 1 });
  assert.equal(same.rows[0].result.changed, false, "revisão sem mudança não cresce o acervo");
  const smaller = await saveAnchor(db, "legacy-1",
    { selector: legacySelector, excerpt: WIDE.repeat(1000), locator: legacyLocator, expectedAnchorRevision: 1 });
  assert.equal(smaller.rows[0].result.changed, true, "reduzir o trecho é aceito mesmo acima do orçamento");
  assert.ok(await anchorBytes(db) < legacyBytes);
  const before = await anchorRows(db);
  await assert.rejects(() => saveAnchor(db, "legacy-2",
    { selector: grownSelector, excerpt: legacyExcerpt, locator: legacyLocator, expectedAnchorRevision: 1 }), BUDGET_ERROR);
  await assert.rejects(() => saveAnchor(db, "legacy-9",
    { selector: legacySelector, excerpt: legacyExcerpt, locator: legacyLocator }), BUDGET_ERROR);
  assert.deepEqual(await anchorRows(db), before, "as recusas não alteram o acervo");
  const retired = await retireAnchor(db, "legacy-3", 1);
  assert.equal(retired.rows[0].result.changed, true, "retirada nunca é recusada pelo orçamento");
  assert.equal((await db.query("select status from private.course_source_anchors where anchor_id='legacy-3'")).rows[0].status, "retired");
  await db.close();
});

test("a leitura real de Fontes cabe no orçamento com 9 e com 64 âncoras", async t => {
  const db = await fixture({ withReader: true });
  await db.exec(capacityMigration);
  for (let index = 1; index <= 8; index += 1) {
    await saveAnchor(db, "anchor-" + index, { locator: "Trecho " + index });
  }
  for (let index = 1; index <= 8; index += 1) {
    const contentHash = index.toString(16).padStart(2, "0").repeat(32);
    await db.query([
      "insert into private.course_source_attachments(course_id, source_id, content_hash, public_file_access,",
      "  byte_size, media_type, storage_path) values($1,$2,$3,'inherit',$4,'application/pdf',$5)"
    ].join(" "), [COURSE, SOURCE, contentHash, 4 * 1024 * 1024, COURSE + "/" + contentHash + ".pdf"]);
  }
  await db.query([
    "update private.course_sources set title=$1, citation_text=$2, url=$3, identifier=$4, publication_date=$5,",
    "  edition_or_version=$6 where course_id=$7 and source_id=$8"
  ].join(" "), ["Documento extenso de conferência", "Autor. Documento extenso.", "https://example.test/doc",
    "doc-473", "2020", "2ª edição", COURSE, SOURCE]);
  const eight = await readerBytes(db);
  const ninth = await saveAnchor(db, "anchor-9", { locator: "Trecho 9" });
  assert.equal(ninth.rows[0].result.changed, true);
  const nine = await readerBytes(db);
  assert.equal((await readerPayload(db)).items[0].anchors.length, 9, "a leitura devolve as nove âncoras");
  assert.equal((await readerPayload(db)).items[0].attachments.length, 8, "a leitura devolve os oito PDFs");
  for (let index = 10; index <= COUNT_LIMIT; index += 1) {
    const saved = await saveAnchor(db, "anchor-" + index, { locator: "Trecho " + index, excerpt: "a".repeat(1900) });
    assert.equal(saved.rows[0].result.changed, true, "âncora " + index);
  }
  assert.equal(await anchorCount(db), COUNT_LIMIT);
  const full = await readerBytes(db);
  const fullBytes = await anchorBytes(db);
  let refusals = 0;
  for (let index = 1; index <= COUNT_LIMIT; index += 1) {
    try {
      await saveAnchor(db, "anchor-" + index, { locator: "Trecho " + index, excerpt: "a".repeat(2000), expectedAnchorRevision: 1 });
    } catch (error) {
      assert.ok(BUDGET_ERROR(error), "recusa de orçamento esperada: " + error.message);
      refusals += 1;
      break;
    }
  }
  assert.equal(refusals, 1, "o orçamento de octetos recusou o crescimento");
  const boundaryBytes = await anchorBytes(db);
  assert.ok(boundaryBytes <= BYTES_LIMIT, "acervo no limite: " + boundaryBytes);
  const boundary = await readerBytes(db);
  assert.ok(boundary <= READER_LIMIT, "leitura de Fontes no orçamento: " + boundary);
  const refused = await saveAnchorAttempt(db, "anchor-65", { locator: "Trecho 65" });
  assert.equal(refused, false, "a 65ª identidade segue recusada");
  assert.equal(await readerBytes(db), boundary, "recusa não altera o que a leitura devolve");
  t.diagnostic("source-anchor-capacity " + JSON.stringify({
    eight, nine, full, fullBytes, boundary, boundaryBytes,
    anchors: COUNT_LIMIT, attachments: 8, countLimit: COUNT_LIMIT, anchorLimit: BYTES_LIMIT, readerLimit: READER_LIMIT
  }));
  await db.close();
});

async function saveAnchorAttempt(db, anchorId, options) {
  try {
    await saveAnchor(db, anchorId, options);
    return true;
  } catch (error) {
    assert.ok(CAPACITY_ERROR(error), "recusa de capacidade esperada: " + error.message);
    return false;
  }
}

test("autorização negativa segue barrada sem escrever âncora", async () => {
  const db = await fixture({ denyAccess: true });
  await db.exec(capacityMigration);
  await assert.rejects(() => saveAnchor(db, "anchor-denied"), error => /42501/u.test(error.code));
  assert.equal(await anchorCount(db), 0);
  await db.close();
});
