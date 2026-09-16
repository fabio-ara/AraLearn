import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { normalizeCourseContentInspection } from "../../src/domain/courseContentInspection.js";

const OWNER = "10000000-0000-4000-8000-000000000001";
const OTHER = "10000000-0000-4000-8000-000000000002";
const COURSE = "20000000-0000-4000-8000-000000000001";
const ATTRIBUTION = "30000000-0000-4000-8000-000000000001";
const migration = name => fs.readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
function functionSql(source, name) {
  const start = source.indexOf(`create function ${name}(`);
  assert.ok(start >= 0);
  return source.slice(start, source.indexOf("$function$;", start) + "$function$;".length);
}
const report = { summary: "Inspeção do conteúdo e correspondência das fontes realizada.", outcome: "consistent", findings: [] };
const queryValue = async (db, sql, params = []) => (await db.query(sql, params)).rows[0].value;
const read = (db, id = "u1", actor = OWNER, kind = "study_unit") => queryValue(db,
  "select public.get_course_ai_inspection_for_actor_v1($1,$2,$3,$4) value", [actor, COURSE, kind, id]);
const record = async (db, request, { id = "u1", actor = OWNER, hash, value = report } = {}) => queryValue(db,
  "select public.record_course_ai_inspection_for_actor_v1($1,$2,'study_unit',$3,$4,$5,$6) value",
  [actor, COURSE, id, hash || (await read(db, id)).basisHash, value, request]);

// Real basis SQL and complete migration run in PGlite; authentication and digest
// are minimal fixture adapters, not proof of hosted access or a semantic review.
async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema private;
    create table public.courses(id uuid primary key, owner_id uuid, revision bigint default 1,
      bibliography_style text default 'abnt-2025',updated_at timestamptz);
    create table private.course_entities(course_id uuid,entity_type text,entity_id text,parent_id text,
      content jsonb,version bigint default 1,design_snapshot jsonb,design_application jsonb,
      primary key(course_id,entity_type,entity_id));
    create table private.course_source_attributions(course_id uuid,id uuid,target_kind text,target_id text);
    create table private.course_source_attribution_sources(course_id uuid,attribution_id uuid,source_id text,relation text);
    create table private.course_source_attribution_anchors(course_id uuid,attribution_id uuid,anchor_id text);
    create table private.course_sources(course_id uuid,source_id text,title text,status text default 'active',revision bigint default 1);
    create table private.course_source_anchors(course_id uuid,anchor_id text,source_id text,content_hash text,selector jsonb);
    create table private.course_source_attachments(course_id uuid,source_id text,content_hash text,status text,public_file_access text);
    create table private.course_media(course_id uuid,content_hash text,status text,byte_size bigint,media_type text);
    create table private.course_design_target_plan_items(course_id uuid,didactic_microsequence_id text,plan_item_id uuid);
    create table private.course_instructional_plan_items(course_id uuid,id uuid,item_kind text,statement text,description text);
    create table private.course_change_receipts(actor_id uuid,request_id text,operation text,course_id uuid,request_hash text,result jsonb,
      primary key(actor_id,request_id), constraint course_change_receipts_operation_fixture check(operation='set_content_review'));
    create function private.course_source_json_hash_v1(jsonb) returns text language sql immutable as $$select repeat(md5($1::text),2)$$;
    create function private.course_content_media_hashes_v1(jsonb) returns setof text language sql as $$select null::text where false$$;
    create function private.course_source_links_v1(p_course_id uuid,p_id uuid) returns jsonb language sql stable as $$
      select coalesce(jsonb_agg(to_jsonb(l)-array['course_id','attribution_id'] order by source_id),'[]')
        from private.course_source_attribution_sources l where course_id=p_course_id and attribution_id=p_id$$;
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
    insert into private.course_source_attribution_sources values('${COURSE}','${ATTRIBUTION}','source-a','supported_by');
    insert into private.course_sources values('${COURSE}','source-a','Fonte A','active',1);
    insert into private.course_sources values('${COURSE}','unused','Acervo não usado','active',1);
    select set_config('fixture.role','service_role',false);
  `);
  await db.exec(functionSql(await migration("20260909025232_contextual_content_review_access.sql"), "private.course_content_basis_hash_v1"));
  await db.exec(await migration("20260916025342_contextual_ai_inspection.sql"));
  return db;
}

test("inspeção semântica é protegida, idempotente, vinculada à base e não altera conteúdo", async () => {
  const db = await fixture();
  try {
    const legacy = normalizeCourseContentInspection(await read(db));
    assert.equal(legacy.inspection.state, "unregistered");
    await db.exec("update private.course_entities set content=jsonb_set(content,'{title}','\"Edição humana\"'),version=version+1 where entity_id='u1'");
    const pending = await read(db);
    assert.equal(pending.inspection.state, "pending");
    assert.equal((await read(db, "u2")).inspection.state, "unregistered");
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
    const retained = await record(db, "inspection-03", { value: { summary: "Preferência humana mantida.",
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
