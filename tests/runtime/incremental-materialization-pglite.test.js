import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const read = async name => (await fs.readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8")).replaceAll("\r\n", "\n");
const [materializer, globalPlan, cutover, explanations, appliedBasis, forms, practice, inspection, migration] = await Promise.all([
  "20260905083846_contextual_automatic_design_application.sql", "20260903160000_global_curriculum_authoring_flow.sql",
  "20260902044404_cut_legacy_authoring_runtime.sql", "20260907222912_shared_explanations_human_content_review.sql",
  "20260909030823_contextual_applied_explanation_basis.sql", "20260910045104_contextual_explanation_forms_across_units.sql",
  "20260910054749_contextual_recorded_practice_integrity.sql", "20260905125617_reorganize_authoring_parts.sql",
  "20260916031133_incremental_materialization.sql"
].map(read));
const focalScopeMigration = await read("20260917232000_focal_materialization_dependency_scope.sql");
const discriminatorCorrection = await read("20260905095110_correct_applied_design_discriminator.sql");
const originMigration = await read("20260916030333_editorial_interventions_and_observation_files.sql");
const copyMigration = await read("20260905145236_independent_course_copies.sql");
const savedApplicationMigration = await read("20260909061332_contextual_instructional_design_commands.sql");
function definition(source, name) {
  const start = source.search(new RegExp(`create (?:or replace )?function ${name.replaceAll(".", "\\.")}\\(`, "iu"));
  assert.ok(start >= 0, name);
  const delimiter = /\bas\s+(\$\w*\$)/iu.exec(source.slice(start));
  assert.ok(delimiter, name);
  const body = start + delimiter.index + delimiter[0].length;
  const end = source.indexOf(`${delimiter[1]};`, body);
  assert.ok(end > start, name);
  return source.slice(start, end + delimiter[1].length + 1);
}
function block(source, name) {
  const start = source.indexOf(`do $${name}$`);
  const end = source.indexOf(`$${name}$;`, start + name.length + 5);
  assert.ok(start >= 0 && end > start, name);
  return source.slice(start, end + name.length + 3);
}
const COURSE = "10000000-0000-4000-8000-000000000001";
const PART = "20000000-0000-4000-8000-000000000001";
const IDEA = "30000000-0000-4000-8000-000000000001";
const EVIDENCE = "40000000-0000-4000-8000-000000000001";
const parameters = [{ parameterId: "required_explanation_forms", value: ["plain_definition", "concrete_example"] },
  { parameterId: "minimum_distinct_practice_opportunities_per_evidence_requirement", value: 1 }];
const policy = { policy: {}, origin: "automatic", sourceScopeKind: "course" };
const unit = (id, position, { introduced = false, developedForms = [], practices = [], text = id } = {}) => ({
  studyUnitId: id, didacticMicrosequenceId: "micro", position, content: { title: id, role: "theory", content: [{ text }] },
  designSnapshot: { contract: "aralearn.study-unit-design-snapshot.v2", parameterCatalogVersion: "1.2.0", didacticMicrosequenceId: "micro",
    instructionalAnalysisUnitIds: [IDEA], evidenceRequirementIds: [EVIDENCE], parameters, editorialDirections: [], componentPolicy: policy },
  designApplication: { mode: practices.length ? "mixed" : "expository", introducedInstructionalAnalysisUnitIds: introduced ? [IDEA] : [],
    usedInstructionalAnalysisUnitIds: [], curriculumScopeItemIds: [], explanationApplications: [{ instructionalAnalysisUnitId: IDEA,
      developedForms, notApplicable: [] }], practiceApplications: practices, componentRefs: [] }, sourceLinks: []
});
const placement = value => ({ studyUnitId: value.studyUnitId, didacticMicrosequenceId: value.didacticMicrosequenceId, position: value.position });
const targets = [{ didacticMicrosequenceId: "micro", instructionalAnalysisUnitIds: [IDEA], evidenceRequirementIds: [EVIDENCE] }];

async function fixtureSchema() {
  return `set check_function_bodies=off; create schema private; create schema auth; create schema extensions;
    create role anon; create role authenticated; create role service_role;
    create table auth.users(id uuid primary key); insert into auth.users values('${COURSE}');
    create table public.courses(id uuid primary key,owner_id uuid,revision bigint default 1,updated_at timestamptz);
    insert into public.courses(id,owner_id) values('${COURSE}','${COURSE}');
    create table private.course_change_receipts(actor_id uuid,request_id text,operation text,course_id uuid,request_hash text,result jsonb,
      expires_at timestamptz default now()+interval '1 day',primary key(actor_id,request_id));
    create table private.course_instructional_plans(id uuid primary key,course_id uuid,version bigint default 1,curriculum_map_status text,updated_at timestamptz);
    insert into private.course_instructional_plans(id,course_id,curriculum_map_status) values('${PART}','${COURSE}','approved');
    create table private.course_authoring_parts(id uuid primary key,course_id uuid,instructional_plan_id uuid,version bigint default 1);
    insert into private.course_authoring_parts(id,course_id,instructional_plan_id) values('${PART}','${COURSE}','${PART}');
    create table private.course_authoring_part_didactic_microsequences(course_id uuid,authoring_part_id uuid,didactic_microsequence_id text);
    insert into private.course_authoring_part_didactic_microsequences values('${COURSE}','${PART}','micro');
    create table private.course_entities(course_id uuid,entity_type text,entity_id text,parent_type text,parent_id text,position int,content jsonb,version bigint default 1,
      design_snapshot jsonb,design_application jsonb,created_origin text,last_revision_origin text,updated_at timestamptz,
      source_links jsonb default '[]',content_review jsonb default '{"state":"current"}',applied_explanation_basis jsonb,
      editorial_interventions jsonb default '{"human":1,"ai":0}',primary key(course_id,entity_type,entity_id),
      constraint course_entities_design_current_v1 check(created_origin is null or created_origin in('human','gpt')),
      unique(course_id,parent_type,parent_id,entity_type,position) deferrable initially deferred);
    insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content) values
      ('${COURSE}','module','module',null,null,0,'{}'),('${COURSE}','lesson','lesson','module','module',0,'{}'),
      ('${COURSE}','microsequence','micro','lesson','lesson',0,'{"title":"Base","dependsOn":[],"explanation":{"title":"Base anterior","content":[{"id":"body","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Prosa humana preservada."}}]}}');
    create table private.course_instructional_plan_items(id uuid primary key,course_id uuid,instructional_plan_id uuid,item_kind text,position int,statement text,description text,version bigint default 1,updated_at timestamptz);
    insert into private.course_instructional_plan_items(id,course_id,instructional_plan_id,item_kind,position,statement,description) values
      ('${IDEA}','${COURSE}','${PART}','instructional_analysis_unit',0,'Relação central',''),
      ('${EVIDENCE}','${COURSE}','${PART}','evidence_requirement',0,'Distinguir os casos','');
    create table private.course_design_target_plan_items(course_id uuid,didactic_microsequence_id text,plan_item_id uuid,plan_item_kind text);
    insert into private.course_design_target_plan_items values('${COURSE}','micro','${IDEA}','instructional_analysis_unit'),('${COURSE}','micro','${EVIDENCE}','evidence_requirement');
    create table private.course_design_parameter_definitions(parameter_id text); insert into private.course_design_parameter_definitions values('forms'),('practice');
    create table private.course_design_parameter_assignments(course_id uuid,parameter_id text,scope_kind text,scope_ref text,value jsonb,origin text,reason text,mode text,updated_at timestamptz,
      unique(course_id,parameter_id,scope_kind,scope_ref));
    create table private.course_authoring_guidance_assignments(course_id uuid,scope_kind text,scope_ref text,guidance text,origin text,reason text,updated_at timestamptz,unique(course_id,scope_kind,scope_ref));
    create function public.get_aralearn_runtime_manifest() returns jsonb language sql as $$select '{"schemaRevision":"20260905094109","features":[]}'::jsonb$$;
    create function private.require_service_role() returns void language plpgsql as $$begin
      if current_setting('test.denied',true)='service' then raise exception 'service denied' using errcode='42501'; end if; end$$;
    create function private.require_course_access_v1(c uuid,a uuid,w boolean) returns void language plpgsql as $$begin
      if not exists(select 1 from public.courses where id=c and owner_id=a) then raise exception 'owner denied' using errcode='42501'; end if; end$$;
    create function private.valid_course_source_links_shape_v2(v jsonb) returns boolean language sql as $$select jsonb_typeof(v)='array'$$;
    create function private.course_design_scope_path_v1(c uuid,k text,i text) returns jsonb language sql as $$select '[]'::jsonb$$;
    create function private.course_current_design_parameters_v1(c uuid,p jsonb) returns jsonb language sql as $$select '[]'::jsonb$$;
    create function private.valid_applied_course_design_parameters_v1(a jsonb,b jsonb) returns boolean language sql as $$select true$$;
    create function private.valid_course_design_parameter_value_v1(a text,b jsonb) returns boolean language sql as $$select true$$;
    create function private.course_current_authoring_guidance_v1(c uuid,p jsonb) returns jsonb language sql as $$select '{"effectiveAssignments":[]}'::jsonb$$;
    create function private.course_current_component_policy_v1(c uuid,p jsonb) returns jsonb language sql as $$select '{"effectiveAssignment":{"policy":{},"origin":"automatic","sourceScope":{"kind":"course"}}}'::jsonb$$;
    create function private.course_component_refs_from_content_v1(v jsonb) returns text[] language sql as $$select array[]::text[]$$;
    create function private.course_component_policy_allows_v1(v jsonb,r text) returns boolean language sql as $$select true$$;
    create function private.capture_course_applied_explanation_basis_v1(c uuid,u jsonb) returns boolean language sql as $$select false$$;
    create function private.valid_course_explanation_v1(v jsonb) returns boolean language sql as $$select jsonb_typeof(v)='object' and v ?& array['title','content']$$;
    create function private.valid_course_component_refs_in_content_v1(v jsonb) returns boolean language sql as $$select true$$;
    create function private.course_component_catalog_v1() returns jsonb language sql as $$select '{"options":[{"ref":"aralearn.resource.paragraph@1.0.0"}]}'::jsonb$$;
    create function private.apply_course_source_attribution_v2(c uuid,k text,i text,v bigint,s jsonb) returns jsonb language plpgsql as $$begin
      update private.course_entities set source_links=s where course_id=c and entity_id=i and entity_type=case k when 'study_unit' then k else 'microsequence' end;
      return '{"changed":true}'::jsonb; end$$;
    create function public.commit_course_composition_for_actor_v1(a uuid,c uuid,r bigint,u jsonb,d jsonb,s jsonb,q text) returns jsonb language plpgsql as $$
    declare item jsonb; created int:=0; updated int:=0; begin
      for item in select value from jsonb_array_elements(u) loop
        if exists(select 1 from private.course_entities where course_id=c and entity_type='study_unit' and entity_id=item->>'entityId') then
          update private.course_entities set content=item->'content',version=version+1 where course_id=c and entity_type='study_unit' and entity_id=item->>'entityId'
            and content is distinct from item->'content'; if found then updated:=updated+1; end if;
        else insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content)
          values(c,'study_unit',item->>'entityId','microsequence',item->>'parentId',(item->>'position')::int,item->'content'); created:=created+1; end if;
      end loop;
      if created+updated>0 then update public.courses set revision=revision+1 where id=c; end if;
      insert into private.course_change_receipts(actor_id,request_id,operation,course_id,request_hash,result) values(a,q,'composition',c,'', '{}');
      return jsonb_build_object('createdCount',created,'updatedCount',updated,'deletedCount',0); end$$;
    create function public.apply_course_design_command_for_actor_v3(p_actor_id uuid,p_course_id uuid,r bigint,c jsonb,a text,b text,d text) returns void language plpgsql as $$
      declare all_units jsonb; begin perform private.assert_course_materialization_pedagogy_v1(p_course_id,all_units); end$$;`;
}

async function fixture() {
  const db = new PGlite();
  // Actual materialization/core/pedagogy/reader definitions and migration run on
  // a minimal relational fixture. Auth, configuration, source storage and the
  // composition writer are explicit stubs, not a hosted/RLS proof.
  await db.exec(await fixtureSchema());
  await db.exec([
    definition(materializer, "private.materialize_course_authoring_part_core_v1"),
    definition(materializer, "public.materialize_course_authoring_part_for_actor_v2"),
    definition(globalPlan, "private.assert_course_materialization_pedagogy_v1"),
    definition(explanations, "private.save_course_part_explanations_v1"),
    definition(cutover, "private.course_authoring_part_progress_v1"),
    definition(inspection, "private.list_course_study_units_for_actor_v1"),
    definition(inspection, "public.save_course_authoring_part_for_actor_v1"),
    definition(copyMigration, "public.copy_course_for_actor_v1"),
    block(explanations, "materializer"), block(appliedBasis, "materializer"),
    block(savedApplicationMigration, "saved_application_validation"),
    block(forms, "explanation_form_coverage"), block(practice, "recorded_practice_integrity")
  ].join("\n"));
  await db.exec(discriminatorCorrection);
  await db.exec(block(originMigration, "origin"));
  await db.exec(migration);
  await db.exec(focalScopeMigration);
  return db;
}
async function write(db, units, placements, { complete = false, revision = 1, request = "fragment-0001", explanations = [], hash = "a".repeat(64), targetPlanItems = targets } = {}) {
  return (await db.query("select public.materialize_course_authoring_part_for_actor_v2($1,$1,$2,$3,1,'[]',$4,$5,$6,$7,$8,$9,$10) value",
    [COURSE, PART, revision, targetPlanItems, units, request, hash, explanations, complete, placements])).rows[0].value;
}

test("o acumulado pode ultrapassar 64 unidades e mantém exigências da base aplicada omitida", async () => {
  const db = await fixture();
  try {
    const initialUnits = Array.from({ length: 64 }, (_, index) => unit(`unit-${index + 1}`, index + 1,
      { introduced: index === 0, developedForms: ["plain_definition"] }));
    const initial = await write(db, initialUnits, initialUnits.map(placement));
    const next = unit("unit-65", 65, { developedForms: ["plain_definition"], practices: [{ evidenceRequirementId: EVIDENCE,
      opportunityId: "case-65", invariantTaskOperation: "Distinguir os casos", variedDimensions: [] }] });
    next.designSnapshot = { ...next.designSnapshot, parameters: parameters.map(parameter => parameter.parameterId === "required_explanation_forms"
      ? { ...parameter, value: ["plain_definition"] } : parameter) };
    const placements = [...initialUnits, next].map(placement);
    await assert.rejects(write(db, [next], placements,
      { revision: initial.courseRevision, request: "complete-65-stale-forms", complete: true }), /forma requerida/u);
    const saved = (await db.query("select design_snapshot value from private.course_entities where entity_id='unit-1'")).rows[0].value;
    assert.deepEqual(saved.parameters.find(item => item.parameterId === "required_explanation_forms").value, ["plain_definition", "concrete_example"]);
    const partial = await write(db, [next], placements, { revision: initial.courseRevision, request: "fragment-65" });
    assert.equal(partial.studyUnitCount, 1);
    assert.equal((await db.query("select count(*)::int total from private.course_entities where entity_type='study_unit'")).rows[0].total, 65);
    assert.equal((await db.query("select private.course_authoring_part_progress_v1($1,$2)->>'state' state", [COURSE, PART])).rows[0].state, "partially_materialized");
  } finally { await db.close(); }
});

test("fragmento ignora inconsistência independente e conclusão volta a validar a parte inteira", async () => {
  const db = await fixture();
  try {
    await db.query(`insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content)
      values($1,'microsequence','micro-legacy','lesson','lesson',1,'{"title":"Legado independente","dependsOn":[]}'::jsonb)`, [COURSE]);
    await db.query("insert into private.course_authoring_part_didactic_microsequences values($1,$2,'micro-legacy')", [COURSE, PART]);
    const legacy = unit("legacy-u", 1, { introduced: true, developedForms: ["plain_definition"] });
    legacy.didacticMicrosequenceId = "micro-legacy";
    legacy.designSnapshot.didacticMicrosequenceId = "micro-legacy";
    legacy.designApplication.mode = "practice";
    await db.query(`insert into private.course_entities(
      course_id,entity_type,entity_id,parent_type,parent_id,position,content,design_snapshot,design_application
    ) values($1,'study_unit',$2,'microsequence','micro-legacy',1,$3,$4,$5)`,
    [COURSE, legacy.studyUnitId, legacy.content, legacy.designSnapshot, legacy.designApplication]);

    const focal = unit("unit-a", 1, { introduced: true, developedForms: ["plain_definition"] });
    const placements = [placement(focal), {
      studyUnitId: legacy.studyUnitId,
      didacticMicrosequenceId: "micro-legacy",
      position: 1
    }];
    const partial = await write(db, [focal], placements, { request: "focal-independent-001" });
    assert.equal(partial.changed, true);

    await assert.rejects(write(db, [focal], placements, {
      complete: true,
      revision: partial.courseRevision,
      request: "complete-with-legacy-001"
    }), /Modo ou teto de novidade foi violado/u);
  } finally { await db.close(); }
});

test("a parte aceita os mesmos 64 alvos e explicações do contrato de autoria", async () => {
  const db = await fixture();
  try {
    await db.query(`insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content)
      select $1,'microsequence','micro-'||n,'lesson','lesson',n,'{"title":"Base","dependsOn":[]}'::jsonb from generate_series(1,63) n`, [COURSE]);
    await db.query(`insert into private.course_authoring_part_didactic_microsequences
      select $1,$2,'micro-'||n from generate_series(1,63) n`, [COURSE, PART]);
    const targetPlanItems = [...targets, ...Array.from({ length: 63 }, (_, index) => ({ didacticMicrosequenceId: `micro-${index + 1}`,
      instructionalAnalysisUnitIds: [], evidenceRequirementIds: [] }))];
    const explanations = targetPlanItems.map(item => ({ microsequenceId: item.didacticMicrosequenceId,
      content: { title: "Base atual", content: [{ id: "body", package: "aralearn.resource.paragraph", version: "1.0.0", data: { text: "Texto de apoio." } }] } }));
    const first = unit("unit-a", 1, { introduced: true });
    const result = await write(db, [first], [placement(first)], { targetPlanItems, explanations });
    assert.equal(result.changed, true);
    assert.equal((await db.query("select count(*)::int total from private.course_entities where entity_type='microsequence' and content#>>'{explanation,title}'='Base atual'")).rows[0].total, 64);
  } finally { await db.close(); }
});

test("upgrade aceita fragmentos sem sobrescrever omitidos e só conclui com o acumulado completo", async () => {
  const db = await fixture();
  try {
    const first = unit("unit-a", 1, { introduced: true, developedForms: ["plain_definition"] });
    const result = await write(db, [first], [placement(first)]);
    assert.equal(result.changed, true);
    assert.equal((await db.query("select private.course_authoring_part_progress_v1($1,$2)->>'state' state", [COURSE, PART])).rows[0].state, "partially_materialized");
    await db.query("update private.course_entities set created_origin='human',last_revision_origin='human',source_links=$1,applied_explanation_basis=$2 where entity_id='unit-a'",
      [[{ linkId: "keep" }], { basis: "keep" }]);
    const before = (await db.query("select * from private.course_entities where entity_id='unit-a'")).rows[0];
    const microBefore = (await db.query("select * from private.course_entities where entity_id='micro'")).rows[0];
    const middle = unit("unit-b", 2, { developedForms: ["concrete_example"], practices: [{ evidenceRequirementId: EVIDENCE,
      opportunityId: "case-b", invariantTaskOperation: "Distinguir os casos", variedDimensions: [] }] });
    const complete = await write(db, [middle], [placement(first), placement(middle)], { complete: true, revision: result.courseRevision, request: "fragment-0002" });
    assert.equal(complete.changed, true);
    assert.deepEqual((await db.query("select * from private.course_entities where entity_id='unit-a'")).rows[0], before);
    assert.deepEqual((await db.query("select * from private.course_entities where entity_id='micro'")).rows[0], microBefore);
    assert.equal((await db.query("select private.course_authoring_part_progress_v1($1,$2)->>'state' state", [COURSE, PART])).rows[0].state, "materialized");
    const repeated = await write(db, [middle], [placement(first), placement(middle)], { complete: true, revision: result.courseRevision, request: "fragment-0002" });
    assert.equal(repeated.idempotent, true);
    assert.equal(repeated.courseRevision, complete.courseRevision);
  } finally { await db.close(); }
});

test("inserção intermediária só reposiciona omitidas e no-op mantém autoria humana", async () => {
  const db = await fixture();
  try {
    const first = unit("unit-a", 1, { introduced: true, developedForms: ["plain_definition"] });
    const last = unit("unit-z", 2, { developedForms: ["concrete_example"] });
    const initial = await write(db, [first, last], [placement(first), placement(last)]);
    await db.query("update private.course_entities set created_origin='human',last_revision_origin='human',source_links=$1,applied_explanation_basis=$2 where entity_id='unit-z'",
      [[{ linkId: "keep" }], { basis: "keep" }]);
    await db.exec("update private.course_entities set created_origin='human',last_revision_origin='human' where entity_id='unit-a'");
    const before = (await db.query("select * from private.course_entities where entity_id='unit-z'")).rows[0];
    const middle = unit("unit-b", 2);
    const moved = await write(db, [middle], [placement(first), placement(middle), { ...placement(last), position: 3 }],
      { revision: initial.courseRevision, request: "insert-middle-001" });
    const after = (await db.query("select * from private.course_entities where entity_id='unit-z'")).rows[0];
    assert.deepEqual(after, { ...before, position: 3, version: before.version + 1 });
    const firstBefore = (await db.query("select * from private.course_entities where entity_id='unit-a'")).rows[0];
    const noop = await write(db, [first], [placement(first), placement(middle), { ...placement(last), position: 3 }],
      { revision: moved.courseRevision, request: "noop-human-001" });
    assert.equal(noop.changed, false);
    assert.equal(noop.courseRevision, moved.courseRevision);
    assert.deepEqual((await db.query("select * from private.course_entities where entity_id='unit-a'")).rows[0], firstBefore);
    const revised = unit("unit-a", 1, { introduced: true, developedForms: ["plain_definition"], text: "Texto realmente corrigido." });
    await write(db, [revised], [placement(first), placement(middle), { ...placement(last), position: 3 }],
      { revision: noop.courseRevision, request: "actual-edit-001" });
    assert.equal((await db.query("select last_revision_origin origin from private.course_entities where entity_id='unit-a'")).rows[0].origin, "ai");
  } finally { await db.close(); }
});

test("CAS, autorização, posições e completude falham sem tocar preservados ou recibos", async () => {
  const db = await fixture();
  try {
    const first = unit("unit-a", 1, { introduced: true, developedForms: ["plain_definition"] });
    const initial = await write(db, [first], [placement(first)]);
    const next = unit("unit-b", 2);
    const snapshot = async () => ({ entities: (await db.query("select * from private.course_entities order by entity_id")).rows,
      receipts: (await db.query("select * from private.course_change_receipts order by request_id")).rows,
      parts: (await db.query("select * from private.course_authoring_parts")).rows,
      courses: (await db.query("select * from public.courses")).rows });
    const before = await snapshot();
    await assert.rejects(write(db, [next], [placement(first), placement(next)], { hash: "b".repeat(64) }), /requestId reutilizado/u);
    for (const [placements, options, message] of [
      [[placement(first), placement(next)], { revision: 1 }, /Curso mudou|curso mudou/u],
      [[placement(next)], {}, /ordem final/u],
      [[placement(first), { ...placement(next), position: 1 }], {}, /distinta e consecutiva/u],
      [[placement(first), placement(next), { studyUnitId: "unwritten", didacticMicrosequenceId: "micro", position: 3 }], {}, /ordem final/u],
      [[placement(first), { ...placement(next), didacticMicrosequenceId: "outside" }], {}, /ordem final/u],
      [[placement(first), placement(next)], { complete: true }, /forma requerida/u]
    ]) {
      await assert.rejects(write(db, [next], placements, { revision: initial.courseRevision, request: "invalid-fragment-001", ...options }), message);
      assert.deepEqual(await snapshot(), before);
    }
    await db.exec("set test.denied='service'");
    await assert.rejects(write(db, [next], [placement(first), placement(next)], { revision: initial.courseRevision }), /service denied/u);
    await db.exec("reset test.denied");
    await db.query("update public.courses set owner_id=$1", [PART]);
    await assert.rejects(write(db, [next], [placement(first), placement(next)], { revision: initial.courseRevision }), /owner denied/u);
    await db.query("update public.courses set owner_id=$1", [COURSE]);
    assert.deepEqual(await snapshot(), before);
    await assert.rejects(write(db, [{ ...next, position: 1 }], [{ ...placement(first), position: 2 }, { ...placement(next), position: 1 }],
      { revision: initial.courseRevision, request: "before-introduction-001" }), /usada antes de ser ensinada/u);
    const missingPractice = unit("unit-b", 2, { developedForms: ["concrete_example"] });
    await assert.rejects(write(db, [missingPractice], [placement(first), placement(missingPractice)],
      { revision: initial.courseRevision, complete: true, request: "missing-practice-001" }), /pratica nao cumpre/u);
    assert.deepEqual(await snapshot(), before);
    await db.exec("update private.course_entities set design_application=null where entity_id='unit-a'");
    await assert.rejects(write(db, [next], [placement(first), placement(next)],
      { revision: initial.courseRevision, complete: true, request: "legacy-complete-001" }), /aplicações e cobertura/u);
  } finally { await db.close(); }
});

test("explicações explícitas aceitam reconciliação, respeitam a parte e projeções incluem decisões antes do orçamento", async () => {
  const db = await fixture();
  try {
    assert.equal((await db.query("select private.save_course_part_explanations_v1($1,$2,'[]') value", [COURSE, PART])).rows[0].value, false);
    const explanation = { title: "Base reparada", content: [{ id: "body", package: "aralearn.resource.paragraph", version: "1.0.0", data: { text: "Texto novo." } }],
      reconciliation: { contentBasis: "b".repeat(64) } };
    await db.query("select private.save_course_part_explanations_v1($1,$2,$3)", [COURSE, PART, [{ microsequenceId: "micro", content: explanation }]]);
    assert.deepEqual((await db.query("select content->'explanation' value from private.course_entities where entity_id='micro'")).rows[0].value, explanation);
    await assert.rejects(db.query("select private.save_course_part_explanations_v1($1,$2,$3)",
      [COURSE, PART, [{ microsequenceId: "outside", content: explanation }]]), /pertencer à parte/u);
    const reader = (await db.query("select pg_get_functiondef('private.list_course_study_units_for_actor_v1(uuid,uuid,bigint,text,text,text,text,text,integer,integer,text)'::regprocedure) value")).rows[0].value;
    assert.ok(reader.indexOf("'designApplication', inspected.design_application") < reader.indexOf("sum(octet_length(projected.item::text))"));
    assert.match(reader, /'designSnapshot', inspected.design_snapshot/u);
    const copied = (await db.query("select pg_get_functiondef('public.copy_course_for_actor_v1(uuid,uuid,bigint,text,boolean,text,timestamptz)'::regprocedure) value")).rows[0].value;
    assert.match(copied, /progression,materialization_complete\)\s+select[^;]+progression,materialization_complete/u);
    assert.equal((await db.query("select has_function_privilege('authenticated','public.materialize_course_authoring_part_for_actor_v2(uuid,uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,jsonb,boolean,jsonb)','execute') allowed")).rows[0].allowed, false);
  } finally { await db.close(); }
});
