import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { normalizeCourseAnchoredAnnotationChange, normalizeCourseAnchoredAnnotationPage,
  normalizeCourseObservationCorrection } from "../../src/domain/courseAnchoredAnnotations.js";
import { normalizeCourseContentReviewState } from "../../src/domain/courseContentReview.js";
import { largeObservationContent } from "../helpers/largeObservationComparisonFixture.js";
import { validateCourseEntityContent } from "../../src/domain/aralearnProject.js";

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
async function fixture({ legacyUnitObservation = false } = {}) {
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
      select repeat(md5(jsonb_build_object('content',content,'links',(select jsonb_agg(to_jsonb(a)) from private.course_source_attributions a
        where a.course_id=$1 and a.target_kind=$2 and a.target_id=$3),'sources',(select jsonb_agg(to_jsonb(s)) from private.course_sources s where s.course_id=$1))::text),2)
      from private.course_entities where course_id=$1 and entity_id=$3$$;
    create function private.course_ai_inspection_pending_v1(uuid,text,text) returns boolean language sql stable as $$
      select coalesce(current_setting('fixture.inspection_pending',true),'false')='true'$$;
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
  await create(db, ids[2], legacyUnitObservation ? "study_unit" : "didactic_microsequence",
    legacyUnitObservation ? "u1" : "micro", "Preservar nota anterior", "before-migration-001");
  await db.exec(await load("20260909032748_contextual_observation_correction_queue.sql"));
  await db.exec(await load("20260916025032_author_observation_decisions.sql"));
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
const detail = (db, id = ids[0]) => value(db, "select private.course_anchored_annotation_item_v1(a,$1,true) value from private.course_anchored_annotations a where id=$2", [OWNER, id]);
const decision = (item, selected = item.targets.filter(t => t.state === "pending"), kind = "approve") => ({
  type: "decide_anchored_annotation", annotationId: item.annotationId, expectedAnnotationVersion: item.annotationVersion,
  expectedTargetSetVersion: item.targetSetVersion, decision: kind, reason: kind === "cancel" ? "teste" : null,
  targets: selected.map(t => ({ kind: t.kind, id: t.id, expectedBasisHash: t.current?.hash ?? null }))
});

test("seis conflitos da comparação e decisão são PT409 sem escrita, recibo ou perda de base", async () => {
  const db = await fixture();
  try {
    await create(db, ids[0]);
    const item = await detail(db);
    const counts = () => value(db, `select jsonb_build_object(
      'receipts',(select count(*) from private.course_change_receipts),
      'bases',(select count(*) from private.course_observation_bases),
      'revision',(select revision from public.courses where id='${COURSE}')) value`);
    const before = await counts();
    const conflict = message => error => error.code === "PT409" && error.message === message;
    await assert.rejects(value(db, 'select public.get_course_observation_comparison_for_actor_v1($1,$2,$3,$4,$5,$6,$7) value',
      [OWNER, COURSE, item.annotationId, 'study_unit', 'u1', 2, 1]),
    conflict("A observação ou seus alvos mudaram; atualize a central."));
    await assert.rejects(command(db, { ...decision(item), expectedAnnotationVersion: 2 }, "business-stale-intent"),
      conflict("A observação ou seus alvos mudaram; releia antes de decidir."));
    await assert.rejects(command(db, { type: "retarget_anchored_annotation", annotationId: item.annotationId,
      expectedAnnotationVersion: 1, expectedTargetSetVersion: 1, targets: [{ kind: "study_unit", id: "u1" }] },
    "business-stale-course", 2), conflict("O curso mudou."));
    await assert.rejects(command(db, { ...decision(item), targets: [{ kind: "study_unit", id: "unselected",
      expectedBasisHash: item.targets[0].current.hash }] }, "business-stale-incidence"),
    conflict("A incidência mudou ou não pertence à seleção."));
    await assert.rejects(command(db, { ...decision(item), targets: [{ kind: "study_unit", id: "u1",
      expectedBasisHash: "b".repeat(64) }] }, "business-stale-basis"),
    conflict("O conteúdo ou suas fontes mudaram depois da apresentação."));
    assert.deepEqual(await counts(), before);
    assert.deepEqual(await detail(db), item);
    await command(db, decision(item, undefined, "cancel"), "business-close-current");
    const closed = await detail(db), afterClose = await counts();
    await assert.rejects(command(db, { type: "revise_anchored_annotation", annotationId: item.annotationId,
      expectedAnnotationVersion: closed.annotationVersion, rawText: "Texto novo", category: null, briefSummary: null },
    "business-revise-closed"), conflict("Esta observação foi encerrada; crie uma nova intenção."));
    assert.deepEqual(await detail(db), closed);
    assert.deepEqual(await counts(), afterClose);
  } finally { await db.close(); }
});

test("alvo removido admite apenas cancelamento explícito com versões e ausência vigentes, inclusive legado sem base", async () => {
  const db = await fixture({ legacyUnitObservation: true });
  try {
    await create(db, ids[0]);
    const before = await detail(db);
    const originalContent = await value(db, "select content value from private.course_entities where entity_id='u1'");
    await db.exec("delete from private.course_entities where entity_id='u1'");
    const removed = await detail(db);
    assert.equal(removed.targets[0].current, null);
    assert.notEqual(removed.targets[0].basis, null);
    await assert.rejects(command(db, decision(removed), 'removed-cannot-approve'), code("PT409"));
    await assert.rejects(command(db, decision(before, undefined, 'cancel'), 'old-hash-cannot-cancel'), code("PT409"));
    const cancel = decision(removed, undefined, 'cancel');
    for (const delta of [{ expectedAnnotationVersion: 2 }, { expectedTargetSetVersion: 2 }]) {
      await assert.rejects(command(db, { ...cancel, ...delta }, `removed-stale-${Object.keys(delta)[0]}`), code("PT409"));
    }
    await db.query("insert into private.course_entities(course_id,entity_type,entity_id,parent_id,parent_type,content) values($1,'study_unit','u1','micro','microsequence',$2)", [COURSE, originalContent]);
    await assert.rejects(command(db, cancel, 'restored-target-cannot-cancel-null'), code("PT409"));
    await db.exec("delete from private.course_entities where entity_id='u1'");
    const result = await command(db, cancel, 'removed-target-cancelled');
    assert.equal(result.annotation.state, 'resolved');
    assert.equal(result.annotation.targets[0].state, 'cancelled');
    assert.equal((await command(db, cancel, 'removed-target-cancelled')).idempotent, true);
    const legacy = await detail(db, ids[2]);
    assert.equal(legacy.targets[0].basis, null); assert.equal(legacy.targets[0].current, null);
    await command(db, decision(legacy, undefined, 'cancel'), 'removed-legacy-cancelled');
    assert.equal((await state(db, ids[2])).state, 'resolved');
    assert.equal(await value(db, 'select count(*)::integer value from private.course_observation_bases'), 0);
    assert.equal(await value(db, 'select count(*)::integer value from private.fixture_composition_calls'), 0);
  } finally { await db.close(); }
});

test("uma intenção multialvo conserva antes, decide parcialmente e libera somente bases sem referência", async () => {
  const db = await fixture();
  try {
    const targets = [{ kind: "study_unit", id: "u1" }, { kind: "microsequence_explanation", id: "micro" }];
    const request = { type: "create_anchored_annotation", annotationId: ids[0], target: targets[0], targets,
      rawText: "Esclarecer o conceito nos dois textos", category: null, capturedAt: null, briefSummary: null };
    const initial = await command(db, request, "create-multiple-001", 1);
    assert.equal(initial.annotation.targets.length, 2);
    await create(db, ids[1]);
    assert.equal(await value(db, "select count(*)::integer value from private.course_observation_bases"), 2);
    await commit(db, [reference(0)], [entity()]);
    let item = await detail(db);
    const unit = item.targets.find(t => t.kind === "study_unit");
    assert.equal(unit.basis.deferred, true); assert.equal(unit.current.deferred, true);
    const comparison = await value(db, 'select public.get_course_observation_comparison_for_actor_v1($1,$2,$3,$4,$5,$6,$7) value',
      [OWNER,COURSE,item.annotationId,unit.kind,unit.id,item.annotationVersion,item.targetSetVersion]);
    assert.equal(comparison.basis.content.content[0].text, "original");
    assert.equal(comparison.current.content.content[0].text, "corrigido");
    await assert.rejects(value(db, 'select public.get_course_observation_comparison_for_actor_v1($1,$2,$3,$4,$5,$6,$7) value',
      [OWNER,COURSE,item.annotationId,unit.kind,unit.id,item.annotationVersion+1,item.targetSetVersion]), code("PT409"));
    const partialCommand = decision(item, [unit]);
    const partial = await command(db, partialCommand, "approve-partial-001");
    assert.equal(partial.annotation.state, "open");
    assert.deepEqual(partial.annotation.targets.map(t => t.state), ["pending", "approved"]);
    assert.equal(await value(db, "select count(*)::integer value from private.course_observation_bases"), 2);
    assert.equal((await command(db, partialCommand, "approve-partial-001")).idempotent, true);
    item = await detail(db);
    await command(db, decision(item), "approve-last-001");
    assert.deepEqual(await state(db), { state: "resolved", version: 3, rawText: null });
    assert.equal(await value(db, "select count(*)::integer value from private.course_observation_bases"), 1);
    await command(db, decision(await detail(db, ids[1]), undefined, "cancel"), "cancel-second-001");
    assert.equal(await value(db, "select count(*)::integer value from private.course_observation_bases"), 0);
    assert.equal(await value(db, "select count(*)::integer value from private.fixture_composition_calls"), 1);
  } finally { await db.close(); }
});

test("decisão confere base/intenção, cancelamento sem alteração não contorna inspeção nem altera conteúdo", async () => {
  const db = await fixture();
  try {
    await create(db, ids[0]);
    const shown = await detail(db); const approve = decision(shown);
    await db.exec("select set_config('fixture.inspection_pending','true',false)");
    await assert.rejects(command(db, approve, "approval-blocked-001"), code("PT409"));
    const result = await command(db, decision(shown, undefined, "cancel"), "cancel-test-note-001");
    assert.equal(result.annotation.rawText, null);
    assert.equal(result.annotation.targets[0].state, "cancelled");
    assert.equal(await value(db, "select private.course_ai_inspection_pending_v1($1,'study_unit','u1') value", [COURSE]), true);
    assert.equal(await value(db, "select count(*)::integer value from private.fixture_composition_calls"), 0);
    assert.equal(await value(db, "select content#>>'{content,0,text}' value from private.course_entities where entity_id='u1'"), "original");
    await create(db, ids[1]);
    const stale = decision(await detail(db, ids[1]));
    await db.exec("update private.course_entities set content=content||'{\"title\":\"Nova versão\"}' where entity_id='u1'");
    await assert.rejects(command(db, stale, "stale-decision-001"), code("PT409"));
    assert.equal((await state(db, ids[1])).state, "open");
  } finally { await db.close(); }
});

test("fila migra pendências, aceita base independente e bloqueia retirada/resolução manual", async () => {
  const db = await fixture();
  try {
    assert.deepEqual(await state(db, ids[2]), { state: "open", version: 1, rawText: "Preservar nota anterior" });
    const base = await create(db, ids[0], "microsequence_explanation", "micro");
    await create(db, ids[1]);
    assert.equal(base.annotation.target.currentPath.at(-1).kind, "microsequence_explanation");
    assert.equal(base.annotation.capabilities.canWithdraw, false);
    assert.equal(base.annotation.capabilities.canResolve, false);
    assert.equal((await ownerPage(db)).items[0].pendingAuthoringObservationCount, 3);
    const page = normalizeCourseAnchoredAnnotationPage(await value(db,
      "select private.get_course_anchored_annotations_core_v1($1,$2,1,null,'target',array['author'],'{}',array['open','considered'],'{}',true,'{}','microsequence_explanation','micro',false,null,null,24,true) value", [OWNER, COURSE]));
    assert.equal(page.items.length, 1);
    for (const type of ["withdraw_anchored_annotation", "resolve_anchored_annotation", "reopen_anchored_annotation"]) {
      await assert.rejects(command(db, { type, annotationId: ids[0], expectedAnnotationVersion: 1 }, `forbidden-${type}`), code("42501"));
    }
    await command(db, { type: "respond_to_anchored_annotation", annotationId: ids[0], expectedAnnotationVersion: 1,
      ownerResponse: "Uma resposta não salva a correção.", responseKind: "answer", consideredSourceLinks: [] }, "answer-keeps-pending-001");
    assert.equal((await state(db)).state, "considered");
    assert.equal((await state(db)).version, 2);
    assert.equal((await detail(db)).targets[0].state, 'pending');
    assert.equal((await detail(db)).capabilities.canReopen, false);
  } finally { await db.close(); }
});

test("confirmação técnica e releitura preservam pendências e recuperam resposta perdida sem reaplicar", async () => {
  const db = await fixture();
  try {
    await create(db, ids[0]); await create(db, ids[1]);
    const receipt = await commit(db, [reference(0), reference(1)], [entity()]);
    assert.equal((await state(db)).state, "open");
    assert.equal(receipt.observations[0].changed, true);
    assert.equal(receipt.observations[0].confirmed, false);
    assert.deepEqual(await read(db), { ...receipt, idempotent: true });
    const subset = await confirm(db, receipt, [receipt.observations[0]]);
    assert.deepEqual(subset.observations.map(o => o.confirmed), [false, false]);
    assert.equal((await state(db)).version, 1);
    assert.equal((await state(db, ids[1])).state, "open");
    assert.equal((await ownerPage(db)).items[0].pendingAuthoringObservationCount, 3);
    const recovered = await confirm(db, await read(db));
    assert.deepEqual(recovered.observations.map(o => o.confirmed), [false, false]);
    const again = await commit(db, [reference(0), reference(1)], [entity()]);
    assert.equal(again.idempotent, true);
    assert.equal(await value(db, "select count(*)::integer value from private.fixture_composition_calls"), 1);
    assert.equal((await confirm(db, recovered)).idempotent, true);
    assert.equal((await state(db)).version, 1);
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
    assert.equal((await confirm(db, changed, [{ ...changed.observations[0], effectHash: "0".repeat(64) }])).observations[0].confirmed, false);
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
    assert.equal((await confirm(db, base)).observations[0].confirmed, false);
    assert.equal((await state(db, ids[1])).state, "open");
    const source = await commit(db, [reference(1)], [entity("study_unit", "u1", "original")], "source-correction-001", 2, OWNER,
      [{ studyUnitId: "u1", sourceLinks: [{ sourceId: "source", relation: "supported_by" }] }]);
    assert.equal(source.observations[0].changed, true);
    assert.equal((await confirm(db, source)).observations[0].confirmed, false);
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
    assert.equal(item.pendingAuthoringObservationCount, 3);
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

test("lista e recibo não duplicam conteúdo extenso; comparação por alvo preserva bytes e exige proprietário", async () => {
  const db = await fixture();
  try {
    const original = largeObservationContent();
    assert.equal(validateCourseEntityContent('study_unit', { id: 'u1', position: 1, ...original }).valid, true);
    await db.query("update private.course_entities set content=$1 where entity_id='u1'", [original]);
    await db.query("insert into private.course_sources values($1,'source','Fonte preservada',1)", [COURSE]);
    await db.query("insert into private.course_source_anchors values($1,'selected','source',1,1),($1,'unrelated','source',1,1)", [COURSE]);
    await db.query("insert into private.course_source_attributions(course_id,target_kind,target_id,links) values($1,'study_unit','u1',$2)",
      [COURSE, [{ linkId: 'link', sourceId: 'source', relation: 'supported_by', roles: ['technical_conceptual'],
        anchors: [{ anchorId: 'selected' }], occurrences: [] }]]);
    const created = await create(db, ids[0]);
    assert.ok(JSON.stringify(created).length < 10000);
    const item = await detail(db); assert.ok(JSON.stringify(item).length < 10000);
    await db.query("update private.course_observation_bases set snapshot=snapshot||$1::jsonb",
      [{ files: [{ bucket: 'course-media', path: 'private-retention-reference', hash: 'a'.repeat(64), media_type: 'audio/wav' }] }]);
    const args = [OWNER, COURSE, ids[0], 'study_unit', 'u1', 1, 1];
    const sql = 'select public.get_course_observation_comparison_for_actor_v1($1,$2,$3,$4,$5,$6,$7) value';
    const comparison = await value(db, sql, args);
    assert.ok(Buffer.byteLength(JSON.stringify(comparison)) > 1048576);
    assert.deepEqual(comparison.basis.content, original);
    assert.deepEqual(comparison.current.content, original);
    assert.deepEqual(comparison.basis.sources[0].anchors.map(anchor => anchor.anchor_id), ['selected']);
    assert.equal(Object.hasOwn(comparison.basis, 'files'), false);
    assert.equal(await value(db, "select bool_and(snapshot ? 'files') value from private.course_observation_bases"), true,
      'a projeção de comparação não apaga referências privadas de retenção');
    await assert.rejects(value(db, sql, [OTHER, ...args.slice(1)]), code('42501'));
    assert.equal(await value(db, "select has_function_privilege('authenticated','public.get_course_observation_comparison_for_actor_v1(uuid,uuid,uuid,text,text,bigint,bigint)','execute') value"), false);
  } finally { await db.close(); }
});

test("replay de criação autoral antiga não ressuscita identidade depois da retenção", async () => {
  const db = await fixture();
  try {
    const stale = {type: 'create_anchored_annotation', annotationId: ids[0], target: {kind: 'study_unit', id: 'u1'},
      rawText: 'Texto cujo envio expirou', category: null, briefSummary: null, capturedAt: '2020-01-01T00:00:00.000Z'};
    await assert.rejects(command(db, stale, 'expired-old-request-1', 1), code('PT409'));
    assert.equal(await value(db, 'select count(*)::integer value from private.course_anchored_annotations where id=$1', [ids[0]]), 0);
  } finally { await db.close(); }
});

test("comandos legados não finalizam nem reabrem incidências; aprovação explícita libera e legado estrutural continua próprio", async () => {
  const db = await fixture();
  try {
    await create(db, ids[0]);
    const approved = await command(db, decision(await detail(db)), 'explicit-terminal-1');
    assert.equal(approved.annotation.state, 'resolved'); assert.equal(approved.annotation.rawText, null);
    for (const type of ['resolve_anchored_annotation', 'withdraw_anchored_annotation', 'reopen_anchored_annotation']) {
      await assert.rejects(command(db, {type, annotationId: ids[0], expectedAnnotationVersion: 2}, `legacy-${type}`), code('42501'));
    }
    assert.equal((await detail(db)).targets[0].state, 'approved');
    assert.equal(await value(db, 'select count(*)::integer value from private.course_observation_bases'), 0);
    const structural = await command(db, {type: 'resolve_anchored_annotation', annotationId: ids[2], expectedAnnotationVersion: 1}, 'legacy-structural-only');
    assert.equal(structural.annotation.state, 'resolved');
  } finally { await db.close(); }
});

test("anexo muda a base da observação e aprovação usa o parecer IA em sua própria base", async () => {
  const db = await fixture();
  try {
    await db.exec(`alter table public.courses add column bibliography_style text default 'abnt-2025',add column updated_at timestamptz;
      alter table private.course_entities add column ai_inspection jsonb;
      create table private.course_source_attribution_sources(course_id uuid,attribution_id uuid,source_id text);
      create table private.course_source_attachments(course_id uuid,source_id text,storage_path text,content_hash text,media_type text,status text);
      create table private.course_media(course_id uuid,content_hash text,storage_path text,media_type text,status text);
      create function private.course_content_media_hashes_v1(jsonb) returns setof text language sql as $$select $1->>'contentHash' where $1 ? 'contentHash'$$;`);
    const inspection = await load("20260916025342_contextual_ai_inspection.sql");
    for (const name of ["private.course_ai_inspection_basis_hash_v1", "private.course_ai_inspection_state_v1",
      "private.course_ai_inspection_pending_v1", "private.course_ai_inspection_payload_v1", "private.valid_course_ai_inspection_report_v1",
      "private.record_course_ai_inspection_v1"]) await db.exec(functionSql(inspection, name).replace("create function", "create or replace function"));
    const retention = await load("20260916030333_editorial_interventions_and_observation_files.sql");
    await db.exec(functionSql(retention, "private.course_observation_files_v1"));
    await db.exec("alter function private.course_observation_basis_hash_v1(uuid,text,text) rename to course_observation_text_basis_hash_v1");
    await db.exec(functionSql(retention, "private.course_observation_basis_hash_v1"));
    await db.exec("alter function private.course_observation_snapshot_v1(uuid,text,text) rename to course_observation_text_snapshot_v1");
    await db.exec(functionSql(retention, "private.course_observation_snapshot_v1"));
    const attribution = "40000000-0000-4000-8000-000000000001";
    await db.query("insert into private.course_sources values($1,'source1','Fonte',1)", [COURSE]);
    await db.query("insert into private.course_source_attributions(course_id,id,target_kind,target_id,links) values($1,$2,'study_unit','u1',$3)",
      [COURSE, attribution, [{ sourceId: "source1", anchors: [] }]]);
    await db.query("insert into private.course_source_attribution_sources values($1,$2,'source1')", [COURSE, attribution]);
    await create(db, ids[0]);
    const before = await detail(db);
    const beforeSnapshot = await value(db, "select snapshot value from private.course_observation_bases where basis_hash=$1", [before.targets[0].basis.hash]);
    await db.query("insert into private.course_source_attachments values($1,'source1',$2,$3,'application/pdf','active')", [COURSE, `${COURSE}/later.pdf`, "d".repeat(64)]);
    await create(db, ids[1]);
    const after = await detail(db, ids[1]);
    assert.notEqual(after.targets[0].basis.hash, before.targets[0].basis.hash);
    assert.deepEqual(await value(db, "select snapshot value from private.course_observation_bases where basis_hash=$1", [before.targets[0].basis.hash]), beforeSnapshot);
    await assert.rejects(command(db, decision(before), "approval-stale-files"), code("PT409"));
    await assert.rejects(command(db, decision(after), "approval-without-inspection"), code("PT409"));
    const inspectionHash = await value(db, "select private.course_ai_inspection_basis_hash_v1($1,'study_unit','u1') value", [COURSE]);
    assert.notEqual(inspectionHash, after.targets[0].current.hash);
    await value(db, "select private.record_course_ai_inspection_v1($1,$2,'study_unit','u1',$3,$4,'inspect-current-files') value",
      [OWNER, COURSE, inspectionHash, { summary: "Conferido", outcome: "consistent", findings: [] }]);
    assert.equal(await value(db, "select private.course_ai_inspection_pending_v1($1,'study_unit','u1') value", [COURSE]), false);
    const approved = await command(db, decision(after), "approval-inspected-files");
    assert.equal(approved.annotation.state, "resolved");
    assert.equal(approved.annotation.targets[0].state, "approved");
  } finally { await db.close(); }
});
