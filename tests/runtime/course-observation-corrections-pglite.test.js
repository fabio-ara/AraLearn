import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { normalizeCourseAnchoredAnnotationChange, normalizeCourseAnchoredAnnotationPage,
  normalizeCourseObservationCorrection } from "../../src/domain/courseAnchoredAnnotations.js";
import { normalizeCourseContentReviewState } from "../../src/domain/courseContentReview.js";

const OWNER = "10000000-0000-4000-8000-000000000001";
const OTHER = "10000000-0000-4000-8000-000000000002";
const COURSE = "20000000-0000-4000-8000-000000000001";
const ids = [1, 2, 3].map(n => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
const load = name => fs.readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
function functionSql(source, name) {
  const match = new RegExp(`create(?: or replace)? function ${name.replaceAll(".", "\\.")}\\(`, "iu").exec(source);
  assert.ok(match, name);
  return source.slice(match.index, source.indexOf("$function$;", match.index) + "$function$;".length);
}
const value = async (db, sql, parameters = []) => (await db.query(sql, parameters)).rows[0]?.value;
const code = expected => error => error.code === expected;

// Executes the entire migration and the real current annotation read/write
// functions. Platform claims/hash and the existing composition writer are
// bounded fixtures. This proves queue transactions, not PostgREST or hosted IO.
async function fixture() {
  const db = new PGlite();
  const previous = await load("20260817200000_course_anchored_annotations.sql");
  const cutover = await load("20260902044404_cut_legacy_authoring_runtime.sql");
  const curriculum = await load("20260903160000_global_curriculum_authoring_flow.sql");
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema private; create schema auth;
    create table auth.users(id uuid primary key);
    create table public.courses(id uuid primary key,owner_id uuid,title text,revision bigint default 1,annotation_set_version bigint default 0);
    create table private.course_entities(course_id uuid,entity_type text,entity_id text,parent_id text,parent_type text,
      position integer default 0,content jsonb not null,version bigint default 1,updated_at timestamptz default now(),
      content_review jsonb,design_application jsonb,created_origin text,last_revision_origin text,primary key(course_id,entity_type,entity_id));
    create table private.course_instructional_plan_items(course_id uuid,id uuid,item_kind text,statement text,description text);
    create table private.course_instructional_plans(id uuid);
    create table private.course_sources(course_id uuid,source_id text,title text,revision bigint);
    create table private.course_source_anchors(course_id uuid,anchor_id text,source_id text,source_revision bigint,revision bigint);
    create table private.course_source_attributions(course_id uuid,id uuid default gen_random_uuid(),target_kind text,target_id text,links jsonb default '[]',
      unique(course_id,target_kind,target_id));
    create table private.course_change_receipts(actor_id uuid,request_id text,operation text,course_id uuid,request_hash text,result jsonb,
      created_at timestamptz default now(),expires_at timestamptz default now()+interval '14 days',primary key(actor_id,request_id),
      constraint course_change_receipts_result_v1 check(jsonb_typeof(result)='object' and pg_column_size(result)<=65536));
    create table private.course_anchored_annotation_viewer_versions(course_id uuid,actor_id uuid,version bigint default 0,
      protected_ref text default 'person-aaaaaaaaaaaaaaaa',primary key(course_id,actor_id));
    create table private.fixture_composition_calls(request_id text);
    create function private.require_service_role() returns void language plpgsql as $$begin
      if current_setting('fixture.role',true) is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if; end$$;
    create function private.require_course_access_v1(uuid,uuid,boolean) returns void language plpgsql as $$begin
      if not exists(select 1 from public.courses where id=$1 and owner_id=$2) then raise exception 'Not owner' using errcode='42501'; end if; end$$;
    create function private.course_source_json_hash_v1(jsonb) returns text language sql immutable as $$select repeat(md5($1::text),2)$$;
    create function private.course_annotation_hash_v1(jsonb) returns text language sql immutable as $$select repeat(md5($1::text),2)$$;
    create function private.course_content_basis_hash_v1(uuid,text,text) returns text language sql stable as $$
      select repeat(md5(content::text),2) from private.course_entities where course_id=$1 and entity_id=$3$$;
    create function private.valid_course_source_links_shape_v1(jsonb,boolean) returns boolean language sql immutable as $$select jsonb_typeof($1)='array'$$;
    create function private.valid_course_source_links_shape_v2(jsonb) returns boolean language sql immutable as $$select jsonb_typeof($1)='array'$$;
    create function private.course_annotation_source_links_resolved_v1(uuid,jsonb) returns boolean language sql stable as $$select true$$;
    create function private.course_source_links_v1(uuid,uuid) returns jsonb language sql stable as $$select links from private.course_source_attributions where course_id=$1 and id=$2$$;
    create function public.get_aralearn_runtime_manifest() returns jsonb language sql stable as $$select '{"schemaRevision":"20260909031450"}'::jsonb$$;
  `);
  for (const name of ["private.valid_course_annotation_text_v1", "private.valid_course_annotation_subject_refs_v1",
    "private.valid_course_annotation_rfc3339_v1", "private.course_annotation_urlencode_v1",
    "private.raise_course_anchored_annotation_not_found_v1", "private.raise_course_anchored_annotation_target_not_found_v1",
    "private.bump_course_annotation_viewer_version_v1"]) await db.exec(functionSql(previous, name));
  await db.exec(functionSql(cutover, "private.valid_course_annotation_path_v2"));
  const table = previous.slice(previous.indexOf("create table private.course_anchored_annotations("),
    previous.indexOf("create index course_anchored_annotations_inbox_v1_idx"));
  await db.exec(table.replaceAll("valid_course_annotation_path_v1", "valid_course_annotation_path_v2")
    .replace("course_anchored_annotations_target_v1", "course_anchored_annotations_target_v2"));
  for (const name of ["private.course_annotation_target_snapshot_v1", "private.course_anchored_annotation_item_v1",
    "private.cleanup_course_anchored_annotations_v1", "private.execute_course_anchored_annotation_command_core_v1",
    "private.get_course_anchored_annotations_core_v1"]) await db.exec(functionSql(cutover, name));
  await db.exec(functionSql(previous, "private.course_anchored_annotation_matches_v1"));
  // Existing owner reader is tested with its actual SQL, including page budget.
  await db.exec(`create table private.course_authoring_parts(course_id uuid,id uuid,position integer,title text,state text);
    create table private.course_authoring_part_didactic_microsequences(course_id uuid,authoring_part_id uuid,didactic_microsequence_id text,position integer);
    create function private.course_authoring_part_progress_v1(uuid,uuid) returns jsonb language sql stable as $$select '{"state":"draft"}'::jsonb$$;`);
  await db.exec(functionSql(await load("20260905125617_reorganize_authoring_parts.sql"), "private.list_course_study_units_for_actor_v1"));
  await db.exec(functionSql(curriculum, "private.decorate_course_inspection_page_v2"));
  await db.exec(functionSql(await load("20260909025232_contextual_content_review_access.sql"), "private.course_content_review_v1"));
  // The queue migration also upgrades the existing plan reader. Load its real
  // definition and the prior explanation projection; unrelated map operations
  // remain fixture boundaries and are not exercised by these queue tests.
  await db.exec(functionSql(curriculum, "private.get_course_instructional_plan_for_actor_v3"));
  await db.exec(`
    create function private.current_course_curricular_map_v1(uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
    create function private.valid_course_curricular_map_shape_v1(jsonb) returns boolean language sql as $$select true$$;
    create function public.save_course_curricular_map_for_actor_v1(uuid,uuid,bigint,bigint,boolean,jsonb,text,text)
      returns jsonb language sql as $$select '{}'::jsonb$$;
  `);
  const review = await load("20260907222912_shared_explanations_human_content_review.sql");
  await db.exec(review.slice(review.indexOf("do $map$"), review.indexOf("end $map$;") + "end $map$;".length));
  await db.exec(`
    create function public.commit_course_composition_for_actor_v1(p_actor_id uuid,p_course_id uuid,p_expected_revision bigint,p_expected_study_unit_version bigint,
      p_upserts jsonb,p_deletes jsonb,p_source_attribution_applications jsonb,p_channel text,p_application_origin text,p_request_id text,p_course_metadata jsonb)
    returns jsonb language plpgsql as $function$
    declare u jsonb; a jsonb; result jsonb; revision bigint; touched boolean:=false;
    begin
      if p_deletes<>'[]' or p_course_metadata is not null then raise exception 'Focal scope violated'; end if;
      select c.revision into revision from public.courses c where c.id=p_course_id;
      if revision<>p_expected_revision then raise exception 'CAS' using errcode='40001'; end if;
      insert into private.fixture_composition_calls values(p_request_id);
      for u in select * from jsonb_array_elements(p_upserts) loop
        update private.course_entities e set content=u->'content',version=e.version+1 where e.course_id=p_course_id
          and e.entity_type=u->>'entityType' and e.entity_id=u->>'entityId' and e.content is distinct from u->'content';
        touched:=touched or found;
      end loop;
      for a in select * from jsonb_array_elements(p_source_attribution_applications) loop
        insert into private.course_source_attributions(course_id,target_kind,target_id,links)
          values(p_course_id,coalesce(a->>'targetKind','study_unit'),coalesce(a->>'targetId',a->>'studyUnitId'),a->'sourceLinks')
          on conflict(course_id,target_kind,target_id) do update set links=excluded.links where course_source_attributions.links is distinct from excluded.links;
      end loop;
      if touched then update public.courses c set revision=c.revision+1 where c.id=p_course_id returning c.revision into revision; end if;
      result:=jsonb_build_object('courseId',p_course_id,'revision',revision,'idempotent',false,'channel',p_channel,'applicationOrigin',p_application_origin);
      insert into private.course_change_receipts(actor_id,request_id,operation,course_id,request_hash,result)
        values(p_actor_id,p_request_id,'commit_course_composition',p_course_id,repeat('a',64),result);
      return result;
    end $function$;
    insert into auth.users values('${OWNER}'),('${OTHER}');
    insert into public.courses(id,owner_id,title) values('${COURSE}','${OWNER}','Curso');
    insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,content) values
      ('${COURSE}','module','module',null,null,'{"title":"Módulo"}'),
      ('${COURSE}','lesson','lesson','module','module','{"title":"Lição"}'),
      ('${COURSE}','microsequence','micro','lesson','lesson','{"title":"Micro","covers":[],"explanation":{"title":"Base","content":[{"text":"original"}]}}'),
      ('${COURSE}','study_unit','u1','microsequence','micro','{"title":"Unidade","role":"theory","topics":[],"content":[{"text":"original"}]}');
    select set_config('fixture.role','service_role',false);
  `);
  // Existing pending author note is created before migration; its identity,
  // text, version and legacy target remain intact after the new target exists.
  await create(db, ids[2], "didactic_microsequence", "micro", "Preservar nota anterior", "before-migration-001");
  await db.exec(await load("20260909032748_contextual_observation_correction_queue.sql"));
  return db;
}

async function command(db, body, request, revision = null) {
  return normalizeCourseAnchoredAnnotationChange(await value(db,
    "select private.execute_course_anchored_annotation_command_core_v1($1,$2,$3,$4,'author','authoring_interface',$5,true) value",
    [OWNER, COURSE, revision, body, request]));
}
const create = (db, id, kind = "study_unit", targetId = "u1", text = "Corrigir trecho", request = `create-${id}`) => command(db,
  { type: "create_anchored_annotation", annotationId: id, target: { kind, id: targetId }, rawText: text, category: null, capturedAt: null, briefSummary: null }, request, 1);
const reference = (index = 0, kind = "study_unit", targetId = "u1") => ({ annotationId: ids[index], annotationVersion: 1, targetKind: kind, targetId });
const entity = (kind = "study_unit", targetId = "u1", text = "corrigido") => ({ entityType: kind === "study_unit" ? "study_unit" : "microsequence",
  entityId: targetId, parentType: kind === "study_unit" ? "microsequence" : "lesson", parentId: kind === "study_unit" ? "micro" : "lesson", position: 0,
  content: kind === "study_unit" ? { title: "Unidade", role: "theory", topics: [], content: [{ text }] }
    : { title: "Micro", covers: [], explanation: { title: "Base", content: [{ text }] } } });
const commit = (db, refs, upserts, request = "correction-request-001", revision = 1, actor = OWNER, applications = []) => value(db,
  "select public.commit_course_observation_corrections_for_actor_v1($1,$2,$3,null,$4,$5,'mcp',null,$6,$7) value",
  [actor, COURSE, revision, upserts, applications, request, refs]).then(normalizeCourseObservationCorrection);
const read = (db, request = "correction-request-001") => value(db,
  "select public.get_course_observation_correction_for_actor_v1($1,$2,$3) value", [OWNER, COURSE, request]).then(normalizeCourseObservationCorrection);
const confirm = (db, receipt, selected = receipt.observations) => value(db,
  "select public.confirm_course_observation_correction_for_actor_v1($1,$2,$3,$4) value", [OWNER, COURSE, receipt.requestId,
    selected.map(({ annotationId, annotationVersion, effectHash }) => ({ annotationId, annotationVersion, effectHash }))]).then(normalizeCourseObservationCorrection);
const state = (db, id = ids[0]) => value(db, "select jsonb_build_object('state',state,'version',version,'rawText',raw_text) value from private.course_anchored_annotations where id=$1", [id]);
const ownerPage = db => value(db, "select private.list_course_study_units_for_actor_v1($1,$2,(select revision from public.courses where id=$2)) value", [OWNER, COURSE]);

test("fila migra pendências, aceita base independente e bloqueia retirada/resolução manual", async () => {
  const db = await fixture();
  try {
    assert.deepEqual(await state(db, ids[2]), { state: "open", version: 1, rawText: "Preservar nota anterior" });
    const base = await create(db, ids[0], "microsequence_explanation", "micro");
    await create(db, ids[1]);
    assert.equal(base.annotation.target.currentPath.at(-1).kind, "microsequence_explanation");
    assert.equal(base.annotation.capabilities.canWithdraw, false);
    assert.equal(base.annotation.capabilities.canResolve, false);
    assert.equal((await ownerPage(db)).items[0].pendingAuthoringObservationCount, 1);
    const page = normalizeCourseAnchoredAnnotationPage(await value(db,
      "select private.get_course_anchored_annotations_core_v1($1,$2,1,null,'target',array['author'],'{}',array['open','considered'],'{}',true,'{}','microsequence_explanation','micro',false,null,null,24,true) value", [OWNER, COURSE]));
    assert.equal(page.items.length, 1);
    for (const type of ["withdraw_anchored_annotation", "resolve_anchored_annotation"]) {
      await assert.rejects(command(db, { type, annotationId: ids[0], expectedAnnotationVersion: 1 }, `forbidden-${type}`), code("42501"));
    }
    await command(db, { type: "respond_to_anchored_annotation", annotationId: ids[0], expectedAnnotationVersion: 1,
      ownerResponse: "Uma resposta não salva a correção.", responseKind: "answer", consideredSourceLinks: [] }, "answer-keeps-pending-001");
    assert.equal((await state(db)).state, "considered");
    assert.equal((await state(db)).version, 2);
  } finally { await db.close(); }
});

test("associa antes de corrigir, confirma subconjunto e recupera resposta perdida sem reaplicar", async () => {
  const db = await fixture();
  try {
    await create(db, ids[0]); await create(db, ids[1]);
    const receipt = await commit(db, [reference(0), reference(1)], [entity()]);
    assert.equal((await state(db)).state, "open");
    assert.equal(receipt.observations[0].changed, true);
    assert.equal(receipt.observations[0].confirmed, false);
    assert.deepEqual(await read(db), { ...receipt, idempotent: true });
    const subset = await confirm(db, receipt, [receipt.observations[0]]);
    assert.deepEqual(subset.observations.map(o => o.confirmed), [true, false]);
    assert.equal((await state(db)).version, 2);
    assert.equal((await state(db, ids[1])).state, "open");
    assert.equal((await ownerPage(db)).items[0].pendingAuthoringObservationCount, 1);
    const recovered = await confirm(db, await read(db));
    assert.deepEqual(recovered.observations.map(o => o.confirmed), [true, true]);
    const again = await commit(db, [reference(0), reference(1)], [entity()]);
    assert.equal(again.idempotent, true);
    assert.equal(await value(db, "select count(*)::integer value from private.fixture_composition_calls"), 1);
    assert.equal((await confirm(db, recovered)).idempotent, true);
    assert.equal((await state(db)).version, 2);
    await assert.rejects(commit(db, [reference(0)], [entity()]), code("23514"));
  } finally { await db.close(); }
});

test("no-op, versão posterior, conteúdo posterior, pedido parcial e recibo ausente permanecem pendentes", async () => {
  const db = await fixture();
  try {
    await create(db, ids[0]); await create(db, ids[1]);
    const noop = await commit(db, [reference(0)], [entity("study_unit", "u1", "original")], "noop-correction-001");
    assert.equal(noop.observations[0].changed, false);
    assert.equal((await confirm(db, noop)).observations[0].confirmed, false);
    const changed = await commit(db, [reference(0), reference(1)], [entity()], "edited-observation-001");
    await command(db, { type: "revise_anchored_annotation", annotationId: ids[0], expectedAnnotationVersion: 1,
      rawText: "Nova edição pendente", category: null, briefSummary: null }, "edit-pending-001");
    await db.exec("update private.course_entities set content=jsonb_set(content,'{title}','\"Conteúdo posterior\"') where entity_id='u1'");
    const pending = await confirm(db, changed);
    assert.deepEqual(pending.observations.map(o => o.confirmed), [false, false]);
    assert.equal((await state(db)).rawText, "Nova edição pendente");
    await assert.rejects(confirm(db, changed, [{ ...changed.observations[0], effectHash: "0".repeat(64) }]), code("23514"));
    await assert.rejects(commit(db, [reference(0)], [entity()], "stale-observation-001", 2), code("40001"));
    await assert.rejects(commit(db, [reference(1)], [entity("microsequence_explanation", "micro")], "wrong-target-001", 2), code("22023"));
    assert.equal((await read(db, "missing-request-001")).status, "absent");
    await db.query("update private.course_change_receipts set expires_at=now()-interval '1 second' where request_id=$1", [changed.requestId]);
    assert.equal((await confirm(db, changed)).status, "absent");
    assert.equal((await state(db, ids[1])).state, "open");
    assert.equal(await value(db, "select count(*)::integer value from private.fixture_composition_calls"), 2);
  } finally { await db.close(); }
});

test("base e fontes têm efeitos próprios; rollback e direitos conservam conteúdo e fila", async () => {
  const db = await fixture();
  try {
    await create(db, ids[0], "microsequence_explanation", "micro"); await create(db, ids[1]);
    await assert.rejects(commit(db, [{ ...reference(1), targetKind: null }], [entity()], "invalid-kind-001"), code("22023"));
    await assert.rejects(commit(db, [reference(0, "microsequence_explanation", "micro")], [entity("microsequence_explanation", "micro")], "other-owner-001", 1, OTHER), code("42501"));
    await assert.rejects(commit(db, [reference(0, "microsequence_explanation", "micro")], [entity("microsequence_explanation", "micro")], "stale-content-001", 8), code("40001"));
    assert.equal(await value(db, "select count(*)::integer value from private.fixture_composition_calls"), 0);
    const base = await commit(db, [reference(0, "microsequence_explanation", "micro")], [entity("microsequence_explanation", "micro")]);
    assert.equal((await confirm(db, base)).observations[0].confirmed, true);
    assert.equal((await state(db, ids[1])).state, "open");
    const source = await commit(db, [reference(1)], [entity("study_unit", "u1", "original")], "source-correction-001", 2, OWNER,
      [{ studyUnitId: "u1", sourceLinks: [{ sourceId: "source", relation: "supported_by" }] }]);
    assert.equal(source.observations[0].changed, true);
    assert.equal((await confirm(db, source)).observations[0].confirmed, true);
    assert.equal(await value(db, "select has_function_privilege('authenticated','public.confirm_course_observation_correction_for_actor_v1(uuid,uuid,text,jsonb)','execute') value"), false);
    assert.equal(await value(db, "select has_function_privilege('anon','public.get_course_observation_correction_for_actor_v1(uuid,uuid,text)','execute') value"), false);
    await db.exec("select set_config('fixture.role','authenticated',false)");
    await assert.rejects(read(db), code("42501"));
  } finally { await db.close(); }
});

test("owner recebe contagem, revisão por objeto e evidência praticada na página decorada", async () => {
  const db = await fixture();
  try {
    const page = async () => value(db, "select private.decorate_course_inspection_page_v2($1,1,$2) value", [COURSE, await ownerPage(db)]);
    await create(db, ids[0]); await create(db, ids[1]);
    let item = (await page()).items[0];
    assert.equal(item.pendingAuthoringObservationCount, 2);
    assert.deepEqual(normalizeCourseContentReviewState(item.contentReview), { state: "unregistered" });
    assert.equal(item.authorship.design.application, null);
    await db.query("update private.course_entities set content_review='{}' where entity_id='u1'");
    assert.deepEqual(normalizeCourseContentReviewState((await page()).items[0].contentReview), { state: "draft" });
    await db.query("update private.course_entities set content_review=jsonb_build_object('basisHash',private.course_content_basis_hash_v1(course_id,'study_unit',entity_id),'reviewedAt','2026-09-09T04:00:00Z') where entity_id='u1'");
    assert.deepEqual(normalizeCourseContentReviewState((await page()).items[0].contentReview), { state: "current", reviewedAt: "2026-09-09T04:00:00Z" });
    await db.query("update private.course_entities set content=content||'{\"title\":\"Título posterior\"}',design_application=$1 where entity_id='u1'", [{
      mode: "practice", componentRefs: [], practiceApplications: [{ evidenceRequirementId: ids[1] }, { evidenceRequirementId: ids[0] }, { evidenceRequirementId: ids[2] }] }]);
    await db.query("insert into private.course_instructional_plan_items values($1,$2,'evidence_requirement','Evidência um','Descrição um'),($1,$3,'evidence_requirement','Evidência dois','Descrição dois'),($1,$4,'instructional_analysis_unit','Ideia não é evidência','Descrição de ideia'),($5,$2,'evidence_requirement','Outro curso','Privado')", [COURSE, ids[0], ids[1], ids[2], OTHER]);
    item = (await page()).items[0];
    assert.deepEqual(normalizeCourseContentReviewState(item.contentReview), { state: "stale", reviewedAt: "2026-09-09T04:00:00Z" });
    assert.deepEqual(item.authorship.design.application.practiceEvidence, [
      { name: "Evidência dois", description: "Descrição dois" }, { name: "Evidência um", description: "Descrição um" }]);
    assert.equal(Object.hasOwn(item.studyUnit, "contentReview"), false);
    assert.equal(Object.hasOwn(item.studyUnit, "practiceEvidence"), false);
    await db.query("update private.course_entities set design_application='{\"mode\":\"expository\",\"componentRefs\":[]}' where entity_id='u1'");
    assert.deepEqual((await page()).items[0].authorship.design.application.practiceEvidence, []);
  } finally { await db.close(); }
});
