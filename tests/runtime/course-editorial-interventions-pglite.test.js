import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { normalizeEditorialOrigin, normalizeEditorialInterventions } from "../../src/domain/courseEditorialProvenance.js";

const course = "20000000-0000-4000-8000-000000000001";
const actor = "10000000-0000-4000-8000-000000000001";
const scalar = async (db, sql, params = []) => (await db.query(sql, params)).rows[0]?.value;
async function fixture() {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create schema private;
    create table public.courses(id uuid primary key,owner_id uuid);
    create table private.course_entities(course_id uuid,entity_type text,entity_id text,content jsonb,version bigint default 1,
      created_origin text,last_revision_origin text,design_snapshot jsonb,design_application jsonb);
    create table private.course_sources(course_id uuid,source_id text);
    create table private.course_source_anchors(course_id uuid,source_id text,anchor_id text);
    create table private.course_source_attributions(course_id uuid,id uuid,target_kind text,target_id text);
    create table private.course_source_attribution_sources(course_id uuid,attribution_id uuid,source_id text);
    create table private.course_source_attachments(course_id uuid,source_id text,storage_path text,content_hash text,media_type text,status text);
    create table private.course_media(course_id uuid,content_hash text,storage_path text,media_type text,status text);
    create table private.course_media_delete_intents(course_id uuid,content_hash text,media_type text,storage_path text,primary key(course_id,content_hash));
    create table private.course_source_pdf_delete_intents(actor_id uuid,request_id text,course_id uuid,source_id text,content_hash text,storage_path text,
      state text default 'pending',created_at timestamptz default now(),updated_at timestamptz default now(),primary key(actor_id,request_id));
    create table private.course_observation_bases(course_id uuid,target_kind text,target_id text,basis_hash text,snapshot jsonb,
      primary key(course_id,target_kind,target_id,basis_hash));
    create table private.course_observation_targets(course_id uuid,target_kind text,target_id text,basis_hash text);
    create function private.require_service_role() returns void language sql as $$select$$;
    create function private.require_course_access_v1(uuid,uuid,boolean) returns void language sql as $$select$$;
    create function private.course_source_json_hash_v1(jsonb) returns text language sql immutable as $$select repeat(md5($1::text),2)$$;
    create function private.course_observation_basis_hash_v1(uuid,text,text) returns text language sql stable as $$
      select private.course_source_json_hash_v1(content) from private.course_entities where course_id=$1 and entity_id=$3$$;
    create function public.commit_course_composition_for_actor_v1(p_actor_id uuid,p_course_id uuid,p_channel text,p_application_origin text,p_content jsonb)
      returns void language plpgsql as $$begin perform private.require_service_role();
      update private.course_entities set content=p_content,version=version+1,last_revision_origin='gpt'
      where course_id=p_course_id and entity_type='study_unit' and content is distinct from p_content;end$$;
    create function private.execute_course_source_command_core_v1(uuid,uuid,bigint,jsonb,text,text) returns jsonb language sql as $$
      select jsonb_build_object('changed',coalesce(($4->>'changed')::boolean,true),'idempotent',coalesce(($4->>'idempotent')::boolean,false))$$;
    create function private.decorate_course_inspection_page_v2(p_course_id uuid,p_revision bigint,p_page jsonb) returns jsonb language sql as $$
      select jsonb_build_object('lastRevisionOrigin',entity.last_revision_origin,'version',entity.version)
      from private.course_entities entity where entity.course_id=p_course_id limit 1$$;
    create function public.get_owned_course_authoring_analytics_for_actor_v4(uuid,uuid,bigint,jsonb) returns jsonb language sql as $$
      with scope_units as(select unit.created_origin,unit.last_revision_origin,unit.version from private.course_entities unit where course_id=$2)
      select jsonb_build_object('studyUnitsByOrigin',coalesce('[]'::jsonb,'[]'::jsonb))$$;
    create function private.course_observation_snapshot_v1(uuid,text,text) returns jsonb language sql as $$
      select jsonb_build_object('hash',private.course_observation_basis_hash_v1($1,$2,$3),'content',content,'sourceLinks','[]'::jsonb,
        'sources',(select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) from private.course_sources s where s.course_id=$1))
      from private.course_entities where course_id=$1 and entity_id=$3$$;
    create function private.course_content_media_hashes_v1(jsonb) returns setof text language sql as $$select $1->>'contentHash' where $1 ? 'contentHash'$$;
    create function private.course_file_is_referenced_v1(text,text) returns boolean language sql as $$select
      exists(select 1 from private.course_media where storage_path=$2 and status='active') or
      exists(select 1 from private.course_source_attachments where storage_path=$2 and status='active')$$;
    create function private.collect_course_observation_bases_v1(uuid) returns void language sql as $$select$$;
    insert into public.courses values('${course}','${actor}');
    insert into private.course_entities(course_id,entity_type,entity_id,content,version,created_origin,last_revision_origin)
      values('${course}','study_unit','u1','{"text":"old"}',4,'gpt','gpt');
  `);
  const constraintSql = await fs.readFile(new URL("../../supabase/migrations/20260905094109_preserve_applied_design_on_focal_edits.sql", import.meta.url), "utf8");
  const constraintStart = constraintSql.indexOf("alter table private.course_entities add constraint course_entities_design_current_v1");
  const constraintEnd = constraintSql.indexOf(") is true);", constraintStart) + ") is true);".length;
  assert.ok(constraintStart >= 0 && constraintEnd > constraintStart, "Constraint anterior real disponível");
  await db.exec(constraintSql.slice(constraintStart, constraintEnd));
  const observationSql = await fs.readFile(new URL("../../supabase/migrations/20260916025032_author_observation_decisions.sql", import.meta.url), "utf8");
  const captureStart = observationSql.indexOf("create function private.capture_course_observation_basis_v1(");
  const captureEnd = observationSql.indexOf("$function$;", observationSql.indexOf("as $function$", captureStart)) + "$function$;".length;
  assert.ok(captureStart >= 0 && captureEnd > captureStart, "Captura real disponível");
  await db.exec(observationSql.slice(captureStart, captureEnd));
  for (const [migration, names] of [
    ["20260831000829_source_pdf_access_lifecycle.sql", ["claim_course_source_pdf_delete_for_actor_v1", "complete_course_source_pdf_delete_for_actor_v1"]],
    ["20260903025658_harden_course_source_pdf_lifecycle.sql", ["claim_pending_course_source_pdf_delete_for_source_for_actor_v1"]]
  ]) {
    const sql = await fs.readFile(new URL(`../../supabase/migrations/${migration}`, import.meta.url), "utf8");
    for (const name of names) {
      const start = sql.indexOf(`create function public.${name}(`);
      const end = sql.indexOf("$function$;", sql.indexOf("as $function$", start)) + "$function$;".length;
      assert.ok(start >= 0 && end > start, `Função anterior real disponível: ${name}`);
      await db.exec(sql.slice(start, end));
    }
  }
  await db.exec(await fs.readFile(new URL("../../supabase/migrations/20260916030333_editorial_interventions_and_observation_files.sql", import.meta.url), "utf8"));
  return db;
}

test("intervenções contam alternância por objeto sem inventar histórico ou contar no-op/aprovação", async () => {
  const db = await fixture();
  try {
    assert.equal(await scalar(db, "select created_origin value from private.course_entities"), "ai");
    const write = (origin, text) => db.query("select public.commit_course_composition_for_actor_v1($1,$2,'application',$3,$4)", [actor, course, origin, { text }]);
    const counts = () => scalar(db, "select editorial_interventions value from private.course_entities where entity_id='u1'");
    await write("manual", "human 1"); await write("manual", "human 2"); await write("manual", "human 2");
    let result = normalizeEditorialInterventions(await counts()); assert.equal(result.human, 1); assert.equal(result.ai, 0); assert.equal(result.historyComplete, false);
    assert.equal(await scalar(db, "select version::integer value from private.course_entities"), 6);
    await write("provider_assistance", "AI 1"); await write("provider_assistance", "AI 2"); await write("manual", "human 3");
    result = await counts(); assert.equal(result.human, 2); assert.equal(result.ai, 1); assert.equal(result.lastOrigin, "human");
    await db.exec("update private.course_entities set last_revision_origin='human'");
    assert.deepEqual(await counts(), result);
    assert.equal(normalizeEditorialOrigin("gpt"), "ai");
  } finally { await db.close(); }
});

test("mudanças efetivas de citação consolidam origem e retry não conta", async () => {
  const db = await fixture();
  try {
    const call = cmd => db.query("select private.execute_course_source_command_core_v1($1,$2,1,$3,'application','source-001')", [actor, course, cmd]);
    await call({ type: "set_target_sources", targetKind: "study_unit", targetId: "u1" });
    await call({ type: "set_target_sources", targetKind: "study_unit", targetId: "u1", idempotent: true });
    await call({ type: "set_target_sources", targetKind: "study_unit", targetId: "u1", changed: false });
    assert.equal((await scalar(db, "select editorial_interventions value from private.course_entities")).human, 1);
    assert.equal(await scalar(db, "select version::integer value from private.course_entities"), 4);
  } finally { await db.close(); }
});

test("fonte da explicação registra intervenção sem violar proveniência reservada à unidade", async () => {
  const db = await fixture();
  try {
    await db.query("insert into private.course_entities(course_id,entity_type,entity_id,content,version) values($1,'microsequence','m1',$2,3)", [course, { explanation: { content: [] } }]);
    const command = { type: "set_target_sources", targetKind: "microsequence_explanation", targetId: "m1" };
    for (const channel of ["application", "actions"]) {
      await db.query("select private.execute_course_source_command_core_v1($1,$2,1,$3,$4,'source-explanation')", [actor, course, command, channel]);
    }
    const row = (await db.query("select editorial_interventions,created_origin,last_revision_origin,version from private.course_entities where entity_id='m1'")).rows[0];
    assert.deepEqual({ human: row.editorial_interventions.human, ai: row.editorial_interventions.ai, origin: row.editorial_interventions.lastOrigin }, { human: 1, ai: 1, origin: "ai" });
    assert.equal(row.created_origin, null);
    assert.equal(row.last_revision_origin, null);
    assert.equal(Number(row.version), 3);
  } finally { await db.close(); }
});

test("bases protegem bytes compartilhados; liberar última referência apenas agenda coleta existente", async () => {
  const db = await fixture();
  try {
    const file = { bucket: "course-media", path: `${course}/sound.mp3`, hash: "b".repeat(64), media_type: "audio/mpeg" };
    await db.query("insert into private.course_observation_bases values($1,'study_unit','u1','basis1',$2),($1,'study_unit','u1','basis2',$2)", [course, { files: [file] }]);
    await db.query("insert into private.course_observation_targets values($1,'study_unit','u1','basis2')", [course]);
    await db.query("select private.collect_course_observation_bases_v1($1)", [course]);
    assert.equal(await scalar(db, "select private.course_file_is_referenced_v1('course-media',$1) value", [file.path]), true);
    assert.equal(await scalar(db, "select count(*)::integer value from private.course_media_delete_intents"), 0);
    await db.exec("delete from private.course_observation_targets");
    await db.query("select private.collect_course_observation_bases_v1($1)", [course]);
    assert.equal(await scalar(db, "select private.course_file_is_referenced_v1('course-media',$1) value", [file.path]), false);
    assert.equal(await scalar(db, "select count(*)::integer value from private.course_media_delete_intents"), 1);
    await db.query("select private.collect_course_observation_bases_v1($1)", [course]);
    assert.equal(await scalar(db, "select count(*)::integer value from private.course_media_delete_intents"), 1);
  } finally { await db.close(); }
});

test("claim de PDF conserva bases compartilhadas e retoma coleta após a última decisão", async () => {
  const db = await fixture();
  try {
    const file = { bucket: "course-source-pdfs", path: `${course}/reference.pdf`, hash: "c".repeat(64), media_type: "application/pdf" };
    await db.query("insert into private.course_observation_bases values($1,'study_unit','u1','basis1',$2),($1,'study_unit','u1','basis2',$2)", [course, { files: [file] }]);
    await db.query("insert into private.course_observation_targets values($1,'study_unit','u1','basis2')", [course]);
    await db.query("insert into private.course_source_pdf_delete_intents(actor_id,request_id,course_id,source_id,content_hash,storage_path) values($1,'original-delete',$2,'source1',$3,$4)", [actor, course, file.hash, file.path]);
    await db.query("select private.collect_course_observation_bases_v1($1)", [course]);
    await assert.rejects(db.query("select public.complete_course_source_pdf_delete_for_actor_v1($1,$2,'original-delete',$3)", [actor, course, file.path]), /referência vigente ou retida/);
    assert.equal(await scalar(db, "select public.claim_pending_course_source_pdf_delete_for_source_for_actor_v1($1,$2,'source1') value", [actor, course]), null);
    assert.equal(await scalar(db, "select count(*)::integer value from private.course_source_pdf_delete_intents"), 0);
    assert.equal(await scalar(db, "select private.course_file_is_referenced_v1('course-source-pdfs',$1) value", [file.path]), true);
    await db.exec("delete from private.course_observation_targets");
    await db.query("select private.collect_course_observation_bases_v1($1)", [course]);
    const claim = await scalar(db, "select public.claim_pending_course_source_pdf_delete_for_source_for_actor_v1($1,$2,'observation-base') value", [actor, course]);
    assert.equal(claim.storagePath, file.path);
    assert.equal(await scalar(db, "select state value from private.course_source_pdf_delete_intents"), "deleting");
    assert.equal(await scalar(db, "select public.complete_course_source_pdf_delete_for_actor_v1($1,$2,$3,$4) value", [actor, course, claim.requestId, file.path]), true);
    assert.equal(await scalar(db, "select count(*)::integer value from private.course_source_pdf_delete_intents"), 0);
  } finally { await db.close(); }
});

test("PDF anexado após uma nota cria base distinta, imutável e compartilhada até a última liberação", async () => {
  const db = await fixture();
  try {
    const attribution = "40000000-0000-4000-8000-000000000001";
    const file = { bucket: "course-source-pdfs", path: `${course}/later.pdf`, hash: "d".repeat(64), media_type: "application/pdf" };
    await db.query("insert into private.course_sources values($1,'source1')", [course]);
    await db.query("insert into private.course_source_attributions values($1,$2,'study_unit','u1')", [course, attribution]);
    await db.query("insert into private.course_source_attribution_sources values($1,$2,'source1')", [course, attribution]);
    const capture = () => scalar(db, "select private.capture_course_observation_basis_v1($1,'study_unit','u1') value", [course]);
    const before = await capture();
    const storedBefore = await scalar(db, "select snapshot value from private.course_observation_bases where basis_hash=$1", [before]);
    assert.deepEqual(storedBefore.files, []);
    await db.query("insert into private.course_source_attachments values($1,'source1',$2,$3,'application/pdf','active')", [course, file.path, file.hash]);
    const after = await capture();
    assert.notEqual(after, before);
    assert.equal(await capture(), after);
    assert.equal(await scalar(db, "select count(*)::integer value from private.course_observation_bases"), 2);
    assert.deepEqual(await scalar(db, "select snapshot value from private.course_observation_bases where basis_hash=$1", [before]), storedBefore);
    assert.deepEqual((await scalar(db, "select snapshot value from private.course_observation_bases where basis_hash=$1", [after])).files, [file]);
    await db.query("insert into private.course_observation_targets values($1,'study_unit','u1',$2),($1,'study_unit','u1',$2)", [course, after]);
    await db.exec("update private.course_source_attachments set status='removed'");
    assert.equal(await scalar(db, "select private.course_observation_basis_hash_v1($1,'study_unit','u1') value", [course]), before);
    await db.exec("delete from private.course_observation_targets where ctid=(select ctid from private.course_observation_targets limit 1)");
    await db.query("select private.collect_course_observation_bases_v1($1)", [course]);
    assert.equal(await scalar(db, "select private.course_file_is_referenced_v1('course-source-pdfs',$1) value", [file.path]), true);
    assert.equal(await scalar(db, "select count(*)::integer value from private.course_source_pdf_delete_intents"), 0);
    await db.exec("delete from private.course_observation_targets");
    await db.query("select private.collect_course_observation_bases_v1($1)", [course]);
    assert.equal(await scalar(db, "select private.course_file_is_referenced_v1('course-source-pdfs',$1) value", [file.path]), false);
    assert.equal(await scalar(db, "select count(*)::integer value from private.course_source_pdf_delete_intents"), 1);
  } finally { await db.close(); }
});
