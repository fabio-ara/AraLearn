import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { normalizeCourseContentInspection, normalizeCourseContentInspectionReport } from "../../src/domain/courseContentInspection.js";
import { executeHumanCourseTask } from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
import { CourseSupabaseAdapter } from "../../supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";
import { createContentReviewReference } from "../../supabase/functions/_shared/aralearn-authoring/courseContentReviewReference.js";

const OWNER = "10000000-0000-4000-8000-000000000001";
const OTHER = "10000000-0000-4000-8000-000000000002";
const COURSE = "20000000-0000-4000-8000-000000000001";
const ATTRIBUTION = "30000000-0000-4000-8000-000000000001";
const migration = name => fs.readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
const RECEIPT_MIGRATION = "20260928094500_compact_ai_inspection_receipts.sql";
function functionSql(source, name) {
  const start = source.search(new RegExp(`create(?: or replace)? function ${name.replaceAll(".", "\\.")}\\(`, "iu"));
  assert.ok(start >= 0);
  const body = source.slice(start);
  const end = /\$function\$\s*;/u.exec(body);
  assert.ok(end);
  return body.slice(0, end.index + end[0].length);
}
const legacyReport = { summary: "Inspeção do conteúdo e correspondência das fontes realizada.", outcome: "consistent", findings: [],
  checks: ["alignment", "evidence", "representation", "feedback", "sufficiency"].map(dimension => ({
    dimension, result: "sufficient", reason: "Relação exposta na base.", evidence: ["Base"] })) };
const report = { ...legacyReport, checks: [...legacyReport.checks, { ...legacyReport.checks[0], dimension: "configuration" }] };
const CONFIGURATION_MIGRATION = "20260928110000_configuration_realization_inspection.sql";
const queryValue = async (db, sql, params = []) => (await db.query(sql, params)).rows[0].value;
const read = (db, id = "u1", actor = OWNER, kind = "study_unit") => queryValue(db,
  "select public.get_course_ai_inspection_for_actor_v1($1,$2,$3,$4) value", [actor, COURSE, kind, id]);
const record = async (db, request, { id = "u1", actor = OWNER, hash, value = report } = {}) => queryValue(db,
  "select public.record_course_ai_inspection_for_actor_v1($1,$2,'study_unit',$3,$4,$5,$6) value",
  [actor, COURSE, id, hash || (await read(db, id)).basisHash, value, request]);
const receipt = (db, request, hash, value = legacyReport, actor = OWNER, course = COURSE, id = "u1") => queryValue(db,
  "select public.get_course_ai_inspection_receipt_for_actor_v1($1,$2,'study_unit',$3,$4,$5,$6) value",
  [actor, course, id, hash, value, request]);
const swapPositions = async (db, first, second) => {
  const rows = (await db.query("select entity_id,position from private.course_entities where course_id=$1 and entity_id in($2,$3)",
    [COURSE, first, second])).rows;
  const byId = new Map(rows.map(row => [row.entity_id, row.position]));
  for (const [id, position] of [[first, byId.get(second)], [second, byId.get(first)]]) {
    await db.query("update private.course_entities set position=$3 where course_id=$1 and entity_id=$2", [COURSE, id, position]);
  }
};

// Real basis SQL and inspection migrations run in PGlite; authentication and digest
// are minimal fixture adapters, not proof of hosted access or a semantic review.
async function fixture({ receiptFix = true, configuration = receiptFix } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema private;
    create function public.get_aralearn_runtime_manifest() returns jsonb language sql as $$select '{"features":[]}'::jsonb$$;
    create table public.courses(id uuid primary key, owner_id uuid, revision bigint default 1,
      bibliography_style text default 'abnt-2025',updated_at timestamptz);
    create table private.course_entities(course_id uuid,entity_type text,entity_id text,parent_id text,
      position integer,content_review jsonb,content jsonb,version bigint default 1,design_snapshot jsonb,design_application jsonb,
      primary key(course_id,entity_type,entity_id));
    create table private.course_source_attributions(course_id uuid,id uuid,target_kind text,target_id text);
    create table private.course_source_attribution_sources(course_id uuid,attribution_id uuid,source_id text,relation text,
      link_id text default 'link-a',source_ordinal integer default 0,roles text[] default '{technical_conceptual}',occurrences jsonb default '[]');
    create table private.course_source_attribution_anchors(course_id uuid,attribution_id uuid,anchor_id text,
      source_ordinal integer default 0,anchor_ordinal integer default 0);
    create table private.course_sources(course_id uuid,source_id text,title text,status text default 'active',revision bigint default 1,
      citation_text text,url text,verification_status text default 'author_verified');
    create table private.course_source_anchors(course_id uuid,anchor_id text,source_id text,content_hash text,selector jsonb,
      status text default 'active',human_locator text,verification_excerpt text);
    create table private.course_source_attachments(course_id uuid,source_id text,content_hash text,status text,public_file_access text);
    create table private.course_media(course_id uuid,content_hash text,status text,byte_size bigint,media_type text);
    create table private.course_design_target_plan_items(course_id uuid,didactic_microsequence_id text,plan_item_id uuid);
    create table private.course_instructional_plan_items(course_id uuid,id uuid,item_kind text,statement text,description text);
    create table private.course_instructional_plans(course_id uuid,audience text);
    create table private.course_change_receipts(actor_id uuid,request_id text,operation text,course_id uuid,request_hash text,result jsonb,
      primary key(actor_id,request_id), constraint course_change_receipts_operation_fixture check(operation='set_content_review'));
    create function private.course_source_json_hash_v1(jsonb) returns text language sql immutable as $$select repeat(md5($1::text),2)$$;
    create function private.course_content_media_hashes_v1(jsonb) returns setof text language sql as $$select null::text where false$$;
    create function private.require_service_role() returns void language plpgsql as $$begin
      if current_setting('fixture.role',true) is distinct from 'service_role' then raise exception 'role' using errcode='42501'; end if; end$$;
    create function private.require_course_access_v1(course uuid,actor uuid,writing boolean) returns void language plpgsql as $$begin
      if not exists(select 1 from public.courses where id=course and owner_id=actor) then raise exception 'access' using errcode='42501'; end if; end$$;
    create function private.require_course_review_session_v1(uuid) returns uuid language sql as $$select '${OWNER}'::uuid$$;
    insert into public.courses(id,owner_id) values('${COURSE}','${OWNER}');
    insert into private.course_entities(course_id,entity_type,entity_id,parent_id,content) values
      ('${COURSE}','microsequence','ms','lesson','{"title":"Base","dependsOn":[],"explanation":{"title":"Base","content":[]}}'),
      ('${COURSE}','study_unit','u1','ms','{"title":"Primeira","content":[]}'),
      ('${COURSE}','study_unit','u2','ms','{"title":"Segunda","content":[]}');
    insert into private.course_source_attributions values('${COURSE}','${ATTRIBUTION}','study_unit','u1');
    insert into private.course_source_attribution_sources(course_id,attribution_id,source_id,relation)
      values('${COURSE}','${ATTRIBUTION}','source-a','supported_by');
    insert into private.course_sources(course_id,source_id,title) values('${COURSE}','source-a','Fonte A');
    insert into private.course_sources(course_id,source_id,title) values('${COURSE}','unused','Acervo não usado');
    select set_config('fixture.role','service_role',false);
  `);
  const receiptDefinition = await migration("20260817140000_course_identity_cutover.sql");
  const receiptConstraint = receiptDefinition.match(/constraint course_change_receipts_result_v1 check\([\s\S]*?\n {2}\)/u)?.[0];
  assert.ok(receiptConstraint, "a fixture deve executar a constraint literal de tamanho do recibo");
  await db.exec(`alter table private.course_change_receipts add ${receiptConstraint}`);
  await db.exec(functionSql(await migration("20260905101903_contextual_course_sources.sql"), "private.course_source_links_v1"));
  await db.exec(functionSql(await migration("20260909025232_contextual_content_review_access.sql"), "private.course_content_basis_hash_v1"));
  await db.exec(await migration("20260916025342_contextual_ai_inspection.sql"));
  await db.exec(await migration("20260924164623_revisao_v7_pedagogical_inspection.sql"));
  const focalMigration = await migration("20260924175938_revisao_v7_focal_audit_basis.sql");
  // Este fixture cobre inspeção; não contém o materializador. Seu bloco SQL
  // independente é executado em incremental-materialization-pglite.test.js e
  // no banco completo da integração, sem substituir a função por um stub.
  const materializationBlock = /do \$focal_curricular_dependencies\$[\s\S]*?end \$focal_curricular_dependencies\$;/u;
  assert.match(focalMigration, materializationBlock);
  await db.exec(focalMigration.replace(materializationBlock, ""));
  await db.exec(functionSql(await migration("20260909025232_contextual_content_review_access.sql"), "private.course_content_review_v1"));
  await db.exec(await migration("20260930010000_pedagogical_basis_study_order.sql"));
  if (receiptFix) await db.exec(await migration(RECEIPT_MIGRATION));
  if (configuration) await db.exec(await migration(CONFIGURATION_MIGRATION));
  return db;
}

async function largeFocalBasis(db) {
  // Synthetic MS9-shaped scope: two theory units and eight practices, with the
  // full content/application/design kept in the canonical SQL basis.
  for (let index = 1; index <= 10; index++) {
    const content = { title: `Unidade ${index}`, role: index <= 2 ? "theory" : "practice", topics: [],
      content: [{ id: `body-${index}`, package: "aralearn.resource.paragraph", version: "1.0.0",
        data: { text: `Base ${index}. ` + "A responsabilidade e a mensagem determinam quem pode agir a seguir. ".repeat(140) } }],
      response: index <= 2 ? null : { id: `response-${index}`, package: "aralearn.response.choice", version: "1.0.0",
        data: { prompt: "Quem pode agir?", mode: "single", alternatives: [
          { id: "a", text: "Quem recebeu a mensagem.", correct: true, feedback: "A mensagem libera a próxima ação." },
          { id: "b", text: "Quem ainda aguarda.", correct: false, feedback: "Essa pessoa ainda depende da resposta." }
        ] } }, feedback: [] };
    await db.query(`insert into private.course_entities(course_id,entity_type,entity_id,parent_id,content,design_application,design_snapshot)
      values($1,'study_unit',$2,'ms',$3,$4,$5) on conflict(course_id,entity_type,entity_id) do update
      set content=excluded.content,design_application=excluded.design_application,design_snapshot=excluded.design_snapshot`,
    [COURSE, `u${index}`, content, { mode: index <= 2 ? "expository" : "practice", practiceApplications: [] },
      { parameters: [{ parameterId: "practicePlacement", value: "before_and_after", origin: "author", reason: null }] }]);
  }
}

test("seis dimensões para nova gravação; legado current permanece legível e recibo atravessa base e parecer posteriores", async () => {
  const db = await fixture({ configuration: false });
  try {
    const before = await read(db);
    const principal = { actorId: OWNER, authenticationKind: "oauth", scopes: ["authoring:read", "authoring:write"] };
    const oldRequest = "50000000-0000-4000-8000-000000000001";
    const reference = await createContentReviewReference({ principal, read: before, requestId: oldRequest });
    await record(db, oldRequest, { value: legacyReport });
    const saved = await record(db, "legacy-five-01", { value: legacyReport });
    await db.exec(await migration(CONFIGURATION_MIGRATION));
    assert.deepEqual(normalizeCourseContentInspection(await read(db)).inspection.report, legacyReport);
    assert.equal((await read(db)).inspection.state, "current");
    const pending = () => queryValue(db, "select private.course_ai_inspection_pending_v1($1,'study_unit','u1') value", [COURSE]);
    assert.equal(await pending(), true, "completude separada da atualidade da base");
    for (const value of [legacyReport, { ...legacyReport, checks: undefined }]) {
      assert.equal(await queryValue(db, "select private.valid_course_ai_inspection_report_v1($1) value", [value]), true);
      await assert.rejects(record(db, "new-five-01", { value }), { code: "22023" });
    }
    assert.equal(await receipt(db, "not-saved-01", before.basisHash), null);
    assert.deepEqual(await receipt(db, "legacy-five-01", before.basisHash), { ...saved, idempotent: true });
    const current = await record(db, "new-six-01");
    assert.equal(await pending(), false);
    assert.equal(current.inspection.report.checks.length, 6);
    const insufficient = { ...report, outcome: "needs_attention", findings: ["Realização ainda não demonstrada."],
      checks: report.checks.map(check => ({ ...check, result: check.dimension === "configuration" ? "insufficient" : "sufficient" })) };
    await record(db, "configuration-attention-01", { value: insufficient });
    assert.equal(await pending(), true);
    await db.exec("update private.course_entities set content=content||'{\"goal\":\"Base posterior\"}' where entity_id='ms'");
    assert.notEqual((await read(db)).basisHash, before.basisHash);
    const later = await record(db, "new-base-six-01");
    const adapter = Object.create(CourseSupabaseAdapter.prototype);
    adapter.publicAppUrl = "https://example.test";
    adapter.rpc = async (name, input) => {
      assert.equal(name, "get_course_ai_inspection_receipt_for_actor_v1", "o replay não relê a base nem tenta gravar");
      return receipt(db, input.p_request_id, input.p_expected_basis_hash, input.p_report,
        input.p_actor_id, input.p_course_id, input.p_target_id);
    };
    const recovered = await executeHumanCourseTask({ adapter, principal, name: "registrar_inspecao",
      rawArguments: { referencia: reference, parecer: legacyReport } });
    assert.deepEqual(recovered.context.inspecaoIA.report, legacyReport);
    assert.equal(recovered.context.inspecaoIA.dimensoesAtuaisCompletas, false);
    const newReference = await createContentReviewReference({ principal, read: before,
      requestId: "50000000-0000-4000-8000-000000000002" });
    await assert.rejects(executeHumanCourseTask({ adapter, principal, name: "registrar_inspecao",
      rawArguments: { referencia: newReference, parecer: legacyReport } }), { code: "pedagogical_audit_configuration_required" });
    assert.deepEqual(await receipt(db, "legacy-five-01", before.basisHash), { ...saved, idempotent: true });
    assert.deepEqual(await record(db, "legacy-five-01", { hash: before.basisHash, value: legacyReport }), { ...saved, idempotent: true });
    assert.deepEqual((await read(db)).inspection, later.inspection);
    await assert.rejects(receipt(db, "legacy-five-01", before.basisHash, report), { code: "23514" });
    await assert.rejects(receipt(db, "legacy-five-01", "b".repeat(64)), { code: "23514" });
    await assert.rejects(receipt(db, "legacy-five-01", before.basisHash, legacyReport, OWNER, COURSE, "u2"), { code: "23514" });
    await assert.rejects(receipt(db, "legacy-five-01", before.basisHash, legacyReport, OTHER), { code: "42501" });
    const otherCourse = "20000000-0000-4000-8000-000000000002";
    await db.query("insert into public.courses(id,owner_id) values($1,$2)", [otherCourse, OWNER]);
    await assert.rejects(receipt(db, "legacy-five-01", before.basisHash, legacyReport, OWNER, otherCourse), { code: "23514" });
    await db.exec("select set_config('fixture.role','authenticated',false)");
    await assert.rejects(receipt(db, "legacy-five-01", before.basisHash), { code: "42501" });
    assert.equal(await queryValue(db, "select has_function_privilege('authenticated','public.get_course_ai_inspection_receipt_for_actor_v1(uuid,uuid,text,text,text,jsonb,text)','execute') value"), false);
    assert.equal(await queryValue(db, "select has_function_privilege('service_role','public.get_course_ai_inspection_receipt_for_actor_v1(uuid,uuid,text,text,text,jsonb,text)','execute') value"), true);
  } finally { await db.close(); }
});

test("recibo compacto registra base focal acima de 76 KiB e conserva replay histórico após outro parecer e outra base", async t => {
  const db = await fixture({ receiptFix: false });
  try {
    await largeFocalBasis(db);
    const before = await read(db);
    const bytes = await queryValue(db, "select pg_column_size(private.course_ai_inspection_payload_v1($1,'study_unit','u1')) value", [COURSE]);
    assert.ok(bytes > 76_502);
    assert.equal(before.pedagogicalBasis.studyUnits.length, 10);
    await assert.rejects(record(db, "large-original-01", { value: legacyReport }), { code: "23514", constraint: "course_change_receipts_result_v1" });
    assert.deepEqual(await read(db), before, "a recusa do recibo reverte a inspeção e a revisão na mesma transação");
    assert.equal(await queryValue(db, "select count(*)::int value from private.course_change_receipts"), 0);
    await db.exec(await migration(RECEIPT_MIGRATION));
    const saved = normalizeCourseContentInspection(await record(db, "large-original-01", { value: legacyReport }));
    assert.equal(Object.hasOwn(saved, "pedagogicalBasis"), false, "o comando retorna o parecer, a leitura retorna a base");
    assert.deepEqual((await read(db)).pedagogicalBasis, before.pedagogicalBasis);
    const receipt = await queryValue(db, "select result value from private.course_change_receipts where request_id='large-original-01'");
    assert.equal(Object.hasOwn(receipt, "pedagogicalBasis"), false);
    assert.equal(Object.hasOwn(receipt.inspection, "report"), false);
    const receiptBytes = await queryValue(db, "select pg_column_size(result) value from private.course_change_receipts where request_id='large-original-01'");
    assert.ok(receiptBytes < 4096);
    await db.exec(await migration(CONFIGURATION_MIGRATION));
    const laterReport = { ...report, summary: "Inspeção posterior sobre a mesma base." };
    const later = await record(db, "large-later-01", { value: laterReport });
    assert.ok(later.courseRevision > saved.courseRevision);
    assert.deepEqual(await record(db, "large-original-01", { hash: before.basisHash, value: legacyReport }), { ...saved, idempotent: true });
    assert.deepEqual((await read(db)).inspection, later.inspection, "replay não restaura o parecer anterior no alvo");
    await assert.rejects(record(db, "large-original-01", { hash: before.basisHash, value: laterReport }), { code: "23514" });
    await assert.rejects(record(db, "large-original-01", { id: "u2", hash: before.basisHash, value: legacyReport }), { code: "23514" });
    await assert.rejects(record(db, "large-original-01", { actor: OTHER, hash: before.basisHash, value: legacyReport }), { code: "42501" });
    await db.exec("update private.course_entities set content=content||'{\"title\":\"Base concorrente\"}' where entity_id='u2'");
    const current = await read(db);
    assert.notEqual(current.basisHash, before.basisHash);
    await assert.rejects(record(db, "stale-new-attempt", { hash: before.basisHash }), { code: "PT409" });
    assert.deepEqual(await record(db, "large-original-01", { hash: before.basisHash, value: legacyReport }), { ...saved, idempotent: true });
    assert.deepEqual(await read(db), current, "replay não altera a revisão ou a base concorrente");
    t.diagnostic(`Base completa: ${bytes} bytes; recibo compacto: ${receiptBytes} bytes.`);
  } finally { await db.close(); }
});

test("parecer máximo Unicode permanece integral e cabe no replay sem duplicação no recibo", async t => {
  const db = await fixture();
  try {
    const quote = "😀".repeat(500);
    const maximum = { summary: "😀".repeat(2000), outcome: "needs_attention", findings: Array(20).fill("😀".repeat(1000)),
      checks: report.checks.map(check => ({ ...check, result: "insufficient", reason: "😀".repeat(1000), evidence: Array(6).fill(quote) })) };
    assert.deepEqual(normalizeCourseContentInspectionReport(maximum), maximum);
    assert.equal(await queryValue(db, "select private.valid_course_ai_inspection_report_v1($1::jsonb) value", [maximum]), true);
    const reportBytes = await queryValue(db, "select pg_column_size($1::jsonb) value", [maximum]);
    assert.ok(reportBytes > 65536, "retirar somente pedagogicalBasis não basta");
    await db.query("update private.course_entities set content=content||jsonb_build_object('goal',$1::text) where entity_id='ms'", [quote]);
    const before = await read(db);
    const saved = normalizeCourseContentInspection(await record(db, "unicode-maximum-01", { value: maximum }));
    assert.deepEqual(saved.inspection.report, maximum);
    assert.deepEqual((await read(db)).inspection.report, maximum);
    assert.deepEqual((await read(db)).pedagogicalBasis, before.pedagogicalBasis);
    const receiptBytes = await queryValue(db, "select pg_column_size(result) value from private.course_change_receipts where request_id='unicode-maximum-01'");
    assert.ok(receiptBytes < 4096);
    const later = await record(db, "unicode-later-01");
    assert.deepEqual(await record(db, "unicode-maximum-01", { hash: before.basisHash, value: maximum }), { ...saved, idempotent: true });
    assert.deepEqual((await read(db)).inspection, later.inspection);
    await assert.rejects(db.query("insert into private.course_change_receipts(actor_id,request_id,operation,course_id,request_hash,result) values($1,'oversize-control','record_ai_inspection',$2,$3,$4)",
      [OWNER, COURSE, "a".repeat(64), { inspection: { report: maximum } }]), { code: "23514", constraint: "course_change_receipts_result_v1" });
    t.diagnostic(`Parecer máximo: ${reportBytes} bytes; recibo: ${receiptBytes} bytes.`);
  } finally { await db.close(); }
});

test("migração conserva recibo anterior e repetição simultânea não duplica inspeção nem revisão", async () => {
  const db = await fixture({ receiptFix: false });
  try {
    const before = await read(db);
    const legacy = await record(db, "legacy-receipt-01", { value: legacyReport });
    assert.ok(legacy.pedagogicalBasis);
    const legacyReceipt = await queryValue(db, "select result value from private.course_change_receipts where request_id='legacy-receipt-01'");
    await db.exec(await migration(RECEIPT_MIGRATION));
    await db.exec(await migration(CONFIGURATION_MIGRATION));
    const laterReport = { ...report, summary: "Parecer posterior ao recibo legado." };
    const revision = (await read(db)).courseRevision;
    // PGlite serializes these submissions on one connection. The production
    // actor/request and course locks are retained in the real function body.
    const attempts = await Promise.all([record(db, "same-request-01", { value: laterReport }),
      record(db, "same-request-01", { value: laterReport })]);
    assert.deepEqual(attempts.map(value => value.idempotent).sort(), [false, true]);
    assert.equal((await read(db)).courseRevision, revision + 1);
    assert.deepEqual(await record(db, "legacy-receipt-01", { hash: before.basisHash, value: legacyReport }), { ...legacy, idempotent: true });
    assert.deepEqual(await queryValue(db, "select result value from private.course_change_receipts where request_id='legacy-receipt-01'"), legacyReceipt);
    const current = await read(db);
    assert.deepEqual(current.inspection.report, laterReport);
    const otherCourse = "20000000-0000-4000-8000-000000000002";
    await db.query("insert into public.courses(id,owner_id) values($1,$2)", [otherCourse, OWNER]);
    await assert.rejects(queryValue(db, "select public.record_course_ai_inspection_for_actor_v1($1,$2,'study_unit','u1',$3,$4,'same-request-01') value",
      [OWNER, otherCourse, before.basisHash, laterReport]), { code: "23514" });
    await assert.rejects(queryValue(db, "select public.record_course_ai_inspection_for_actor_v1($1,$2,'microsequence_explanation','u1',$3,$4,'same-request-01') value",
      [OWNER, COURSE, before.basisHash, laterReport]), { code: "23514" });
    await db.query("update public.courses set owner_id=$1 where id=$2", [OTHER, COURSE]);
    await assert.rejects(record(db, "same-request-01", { hash: before.basisHash, value: laterReport }), { code: "42501" });
    assert.equal(await queryValue(db, "select count(*)::int value from private.course_change_receipts"), 2);
  } finally { await db.close(); }
});

test("inspeção semântica é protegida, idempotente, vinculada à base e não altera conteúdo", async () => {
  const db = await fixture();
  try {
    const legacy = normalizeCourseContentInspection(await read(db));
    assert.equal(legacy.inspection.state, "pending");
    assert.equal(legacy.pedagogicalBasis.studyUnits.length, 2);
    await db.exec("update private.course_entities set content=jsonb_set(content,'{title}','\"Edição humana\"'),version=version+1 where entity_id='u1'");
    const pending = await read(db);
    assert.equal(pending.inspection.state, "pending");
    assert.equal((await read(db, "u2")).inspection.state, "pending");
    await assert.rejects(record(db, "old-basis-01", { hash: legacy.basisHash }), { code: "PT409" });
    await assert.rejects(record(db, "other-actor-01", { actor: OTHER, hash: pending.basisHash }), { code: "42501" });
    await assert.rejects(db.exec("update private.course_entities set ai_inspection='{}' where entity_id='u1'"), { code: "42501" });
    await assert.rejects(db.exec("update private.course_entities set content=content||'{\"aiInspection\":{}}' where entity_id='u1'"), { code: "42501" });
    const before = await queryValue(db, "select jsonb_build_object('content',content,'version',version) value from private.course_entities where entity_id='u1'");
    const saved = normalizeCourseContentInspection(await record(db, "inspection-01"));
    assert.equal(saved.inspection.state, "current");
    assert.equal(saved.changed, true);
    assert.deepEqual(await queryValue(db, "select jsonb_build_object('content',content,'version',version) value from private.course_entities where entity_id='u1'"), before);
    assert.deepEqual(await record(db, "inspection-01"), { ...saved, idempotent: true });
    const noOp = await record(db, "inspection-02");
    assert.equal(noOp.changed, false);
    assert.equal(noOp.courseRevision, saved.courseRevision);
    await assert.rejects(record(db, "inspection-01", { value: { ...report, summary: "Outro parecer" } }), { code: "23514" });
    const retained = await record(db, "inspection-03", { value: { ...report, summary: "Preferência humana mantida.",
      outcome: "human_preference_retained", findings: ["Foi mantida a forma bibliográfica escolhida pelo autor."] } });
    assert.equal(retained.inspection.report.outcome, "human_preference_retained");
    assert.deepEqual((await read(db)).inspection, retained.inspection);
  } finally { await db.close(); }
});

test("fontes, citações e estilo invalidam somente consumidores pertinentes, sem fila duplicada", async () => {
  const db = await fixture();
  try {
    await record(db, "sources-before-01");
    await record(db, "other-before-01", { id: "u2" });
    await db.exec("update private.course_sources set title='Não usada corrigida' where source_id='unused'");
    assert.equal((await read(db)).inspection.state, "current");
    await db.exec("update private.course_sources set title='Fonte A corrigida' where source_id='source-a'");
    assert.equal((await read(db)).inspection.state, "pending");
    assert.equal((await read(db, "u2")).inspection.state, "current");
    await record(db, "sources-after-01");
    await db.exec("update public.courses set bibliography_style='apa7'");
    assert.equal((await read(db)).inspection.state, "pending");
    assert.equal((await read(db, "u2")).inspection.state, "current");
    await record(db, "style-after-01");
    await db.exec("update private.course_source_attribution_sources set relation='adapted_from'");
    assert.equal((await read(db)).inspection.state, "pending");
    await db.exec("update private.course_sources set title='Outra alteração' where source_id='source-a'");
    assert.equal((await read(db)).inspection.state, "pending");
    assert.equal(await queryValue(db, "select count(*)::int value from private.course_entities where ai_inspection is not null"), 3);
    await db.exec("select set_config('fixture.role','authenticated',false)");
    await assert.rejects(read(db), { code: "42501" });
  } finally { await db.close(); }
});

test("parecer acompanha objetivo, requisito, Explicação e prática focal; trechos inventados são recusados no banco", async () => {
  const db = await fixture();
  try {
    const requirementId = "40000000-0000-4000-8000-000000000004";
    await db.query("insert into private.course_instructional_plan_items values($1,$2,'evidence_requirement','Relacionar perda e recuperação','Justificar o mecanismo')", [COURSE, requirementId]);
    await db.query("insert into private.course_design_target_plan_items values($1,'ms',$2)", [COURSE, requirementId]);
    const focused = await read(db);
    assert.equal(focused.pedagogicalBasis.planItems[0].statement, "Relacionar perda e recuperação");
    const grounded = { ...report, checks: report.checks.map(check => ({ ...check, evidence: ["Justificar o mecanismo"] })) };
    await record(db, "focal-basis-01", { value: grounded });
    const invented = { ...report, checks: report.checks.map(check => ({ ...check, evidence: ["Trecho inventado"] })) };
    await assert.rejects(record(db, "focal-invented-01", { value: invented }), { code: "22023" });
    for (const [index, sql] of [
      "update private.course_entities set content=content||'{\"goal\":\"Relacionar mecanismos\"}' where entity_id='ms'",
      "update private.course_instructional_plan_items set description='Justificar com um caso de perda'",
      "update private.course_entities set content=jsonb_set(content,'{explanation,title}','\"Outra base\"') where entity_id='ms'",
      "update private.course_entities set content=content||'{\"title\":\"Outra prática\"}' where entity_id='u2'"
    ].entries()) {
      const before = await read(db);
      await db.exec(sql);
      assert.notEqual((await read(db)).basisHash, before.basisHash);
      assert.equal((await read(db)).inspection.state, "pending");
      await assert.rejects(record(db, `focal-stale-${index}`, { hash: before.basisHash }), { code: "PT409" });
      const current = { ...report, checks: report.checks.map(check => ({ ...check, evidence: ["Relacionar perda e recuperação"] })) };
      await record(db, `focal-refresh-${index}`, { value: current });
    }
  } finally { await db.close(); }
});

test("auditoria reúne ocorrência e âncora selecionada; divergência semântica permanece pendente e mudanças invalidam o parecer", async () => {
  const db = await fixture();
  try {
    const claim = "Interseção contém os elementos presentes nos dois conjuntos.";
    const wrong = "Uma tabela-verdade enumera valorações lógicas.";
    const supported = "Um elemento pertence à interseção quando está em ambos os conjuntos.";
    await db.query("update private.course_entities set content=content||$1::jsonb where entity_id='u1'",
      [JSON.stringify({ content: [{ id: "claim", package: "aralearn.resource.paragraph", version: "1.0.0", data: { text: claim } }] })]);
    await db.query("update private.course_source_attribution_sources set occurrences=$1", [[{
      occurrenceId: "occurrence-a", resourceId: "claim", slot: "content", path: "text", quote: claim, prefix: null, suffix: null
    }]]);
    await db.query("insert into private.course_source_anchors(course_id,anchor_id,source_id,selector,human_locator,verification_excerpt) values($1,'selected','source-a',$2,'seção lógica',$3),($1,'unselected','source-a',$4,'seção conjuntos',$5)",
      [COURSE, { kind: "text_quote", exact: wrong }, wrong, { kind: "text_quote", exact: supported }, supported]);
    await db.query("insert into private.course_source_attribution_anchors(course_id,attribution_id,anchor_id) values($1,$2,'selected')", [COURSE, ATTRIBUTION]);
    const before = await read(db);
    const [citation] = before.pedagogicalBasis.citations;
    assert.equal(citation.targetId, "u1");
    assert.equal(citation.targetTitle, "Primeira");
    assert.equal(citation.links[0].source.title, "Fonte A");
    assert.equal(citation.links[0].occurrences[0].quote, claim);
    assert.equal(citation.links[0].anchors[0].verificationExcerpt, wrong);
    assert.doesNotMatch(JSON.stringify(before.pedagogicalBasis), /Um elemento pertence/);
    assert.deepEqual((await read(db, "u2")).pedagogicalBasis.citations, []);
    const explanationBefore = await read(db, "ms", OWNER, "microsequence_explanation");
    assert.equal(explanationBefore.pedagogicalBasis.citations[0].links[0].anchors[0].verificationExcerpt, wrong);
    const critique = { ...report, outcome: "needs_attention", findings: ["A âncora descreve valorações, sem sustentar a afirmação de pertença simultânea."],
      checks: report.checks.map(check => check.dimension === "representation"
        ? { ...check, result: "insufficient", reason: "A obra existe, mas a passagem selecionada trata de outro conceito.", evidence: [claim, wrong] } : check) };
    await record(db, "source-semantic-01", { value: critique });
    assert.equal(await queryValue(db, "select private.course_ai_inspection_pending_v1($1,'study_unit','u1') value", [COURSE]), true);
    const wrongSelectedEvidence = { ...critique, checks: critique.checks.map(check => ({ ...check, evidence: [supported] })) };
    await assert.rejects(record(db, "source-unselected-01", { value: wrongSelectedEvidence }), { code: "22023" });
    await db.exec("update private.course_source_attribution_anchors set anchor_id='unselected'");
    const after = await read(db);
    assert.notEqual(after.basisHash, before.basisHash);
    assert.equal(after.inspection.state, "pending");
    assert.notEqual((await read(db, "ms", OWNER, "microsequence_explanation")).basisHash, explanationBefore.basisHash);
    assert.equal(after.pedagogicalBasis.citations[0].links[0].anchors[0].verificationExcerpt, supported);
    await assert.rejects(record(db, "source-stale-01", { hash: before.basisHash }), { code: "PT409" });
    const corrected = { ...report, checks: report.checks.map(check => ({ ...check, evidence: [claim, supported] })) };
    await record(db, "source-corrected-01", { value: corrected });
    assert.equal((await read(db)).inspection.state, "current");
  } finally { await db.close(); }
});

// Detector da ordem curricular na base: o conteúdo persistido não guarda
// 'position' e os IDs ficam fora da ordem curricular. O corpo anterior caía em
// entity_id; a correção expõe e ordena por course_entities.position.
test("position das Unidades entra na base/hash de inspeção", async () => {
  const db = await fixture();
  try {
    const content = (id, role) => ({ title: id, role, topics: [],
      content: [{ id: `p-${id}`, package: "aralearn.resource.paragraph", version: "1.0.0",
        data: { text: `Corpo sintético de ${id}.` } }],
      response: role === "practice" ? { id: `r-${id}`, package: "aralearn.response.choice", version: "1.0.0",
        data: { prompt: "Escolha.", mode: "single", alternatives: [
          { id: "a", text: "Certa.", correct: true, feedback: "Retoma o critério." },
          { id: "b", text: "Errada.", correct: false, feedback: "Confunde o critério." }] } } : null,
      feedback: [] });
    const design = { mode: "practice", practiceApplications: [] };
    const snapshot = { appliedAt: "2026-09-30T00:00:00Z",
      parameters: [{ parameterId: "practicePlacement", value: "after_explanation" }] };
    // Ordem curricular u1,u2,aa,ab,ac difere da ordem textual aa,ab,ac,u1,u2.
    for (const [id, position, role] of [["u1", 1, "theory"], ["u2", 2, "theory"],
      ["aa", 3, "theory"], ["ab", 4, "practice"], ["ac", 5, "practice"]]) {
      await db.query(`insert into private.course_entities(course_id,entity_type,entity_id,parent_id,position,content,design_application,design_snapshot)
        values($1,'study_unit',$2,'ms',$3,$4,$5,$6) on conflict(course_id,entity_type,entity_id) do update
        set position=excluded.position,content=excluded.content,design_application=excluded.design_application,design_snapshot=excluded.design_snapshot`,
        [COURSE, id, position, content(id, role), design, snapshot]);
    }
    await db.query(`insert into private.course_entities(course_id,entity_type,entity_id,parent_id,position,content) values
      ($1,'microsequence','ms-other','lesson',0,$2),($1,'study_unit','w1','ms-other',1,$3),($1,'study_unit','w2','ms-other',2,$4)`,
      [COURSE, { title: "Fora do foco", dependsOn: [], explanation: { title: "Fora do foco", content: [] } },
        { title: "w1", content: [] }, { title: "w2", content: [] }]);

    const hashOf = (kind, id) => queryValue(db,
      "select private.course_ai_inspection_basis_hash_v1($1,$2,$3) value", [COURSE, kind, id]);
    const orderOf = basis => basis.studyUnits.map(unit => [unit.id, unit.position]);
    const reviewState = () => queryValue(db,
      "select private.course_content_review_v1($1,'microsequence_explanation','ms')->>'state' value", [COURSE]);
    const recordExplanation = (hash, request) => queryValue(db,
      "select public.record_course_ai_inspection_for_actor_v1($1,$2,'microsequence_explanation','ms',$3,$4,$5) value",
      [OWNER, COURSE, hash, report, request]);

    // Controle de regressão: com o corpo anterior, trocar posições não mudava o hash.
    const legacyFunction = functionSql(await migration("20260924175938_revisao_v7_focal_audit_basis.sql"),
      "private.course_pedagogical_basis_v1").replace("create function", "create or replace function");
    await db.exec(legacyFunction);
    const legacyHash = await hashOf("study_unit", "u1");
    await swapPositions(db, "u1", "ac");
    assert.equal(await hashOf("study_unit", "u1"), legacyHash,
      "o corpo anterior precisa reproduzir a falha que o detector cobre");
    await swapPositions(db, "u1", "ac");

    await db.exec(await migration("20260930010000_pedagogical_basis_study_order.sql"));
    const basisOid = "'private.course_pedagogical_basis_v1(uuid,text,text)'::regprocedure";
    assert.equal(await queryValue(db, `select prosecdef value from pg_proc where oid=${basisOid}`), true,
      "a base mantém security definer");
    assert.deepEqual(await queryValue(db, `select proconfig value from pg_proc where oid=${basisOid}`),
      ["search_path=pg_catalog"], "a base mantém o search_path fixo");
    assert.equal(await queryValue(db,
      "select has_function_privilege('authenticated','private.course_pedagogical_basis_v1(uuid,text,text)','execute') value"), false,
      "a base continua revogada de anon/authenticated/service_role");
    const before = await read(db, "u1");
    assert.deepEqual(orderOf(before.pedagogicalBasis),
      [["u1", 1], ["u2", 2], ["aa", 3], ["ab", 4], ["ac", 5]],
      "a base precisa seguir a coluna position, não a ordem textual dos IDs");
    assert.ok(before.pedagogicalBasis.studyUnits.every(unit => Number.isInteger(unit.position)));
    const preservedById = new Map(before.pedagogicalBasis.studyUnits.map(unit => [unit.id,
      { content: unit.content, application: unit.application, design: unit.design }]));
    const beforeUnitHash = await hashOf("study_unit", "u1");
    const beforeExplanationHash = await hashOf("microsequence_explanation", "ms");
    const beforeOutsideHash = await hashOf("microsequence_explanation", "ms-other");
    const beforeCitations = JSON.stringify(before.pedagogicalBasis.citations);
    await db.query("update private.course_entities set content_review=$3::jsonb where course_id=$1 and entity_id=$2",
      [COURSE, "ms", { basisHash: await queryValue(db,
        "select private.course_content_basis_hash_v1($1,'microsequence_explanation','ms') value", [COURSE]),
        reviewedAt: "2026-09-30T00:00:00Z", reviewedBy: OWNER }]);
    assert.equal(await reviewState(), "current");
    await record(db, "order-unit-01");
    await recordExplanation(beforeExplanationHash, "order-explanation-01");

    await swapPositions(db, "u1", "ac");
    const after = await read(db, "u1");
    assert.deepEqual(orderOf(after.pedagogicalBasis),
      [["ac", 1], ["u2", 2], ["aa", 3], ["ab", 4], ["u1", 5]]);
    assert.notEqual(after.basisHash, before.basisHash, "trocar position precisa mudar o hash da Unidade");
    assert.equal(after.inspection.state, "pending");
    assert.notEqual(await hashOf("microsequence_explanation", "ms"), beforeExplanationHash,
      "trocar position precisa invalidar também a Explicação da microssequência");
    assert.equal((await read(db, "ms", OWNER, "microsequence_explanation")).inspection.state, "pending");
    assert.equal(await hashOf("microsequence_explanation", "ms-other"), beforeOutsideHash,
      "outra microssequência não pode ser invalidada pela ordem deste foco");
    const stored = (await db.query("select ai_inspection from private.course_entities where course_id=$1 and entity_id='u1'",
      [COURSE])).rows[0].ai_inspection;
    assert.equal(stored.basisHash, beforeUnitHash, "o parecer gravado não é reescrito nem promovido a current");
    await assert.rejects(record(db, "order-stale-01", { hash: beforeUnitHash }), { code: "PT409" });
    for (const unit of after.pedagogicalBasis.studyUnits) assert.deepEqual(
      { content: unit.content, application: unit.application, design: unit.design }, preservedById.get(unit.id),
      "conteúdo, aplicação e design não mudam ao trocar a ordem");
    assert.equal(JSON.stringify(after.pedagogicalBasis.citations), beforeCitations);
    assert.equal(await reviewState(), "current", "a revisão humana do conteúdo não depende da ordem das Unidades");
    await record(db, "order-unit-02", { hash: await hashOf("study_unit", "u1") });
    assert.equal((await read(db, "u1")).inspection.state, "current");
  } finally { await db.close(); }
});
