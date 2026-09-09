import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { COURSE_COMPONENT_CATALOG, COURSE_DESIGN_PARAMETER_DEFINITIONS } from "../../src/domain/courseDesignParameters.js";

const owner = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const courseId = "20000000-0000-4000-8000-000000000001";
const analysisId = "30000000-0000-4000-8000-000000000001";
const evidenceId = "30000000-0000-4000-8000-000000000002";
const migrations = new URL("../../supabase/migrations/", import.meta.url);
const load = name => fs.readFile(new URL(name, migrations), "utf8");
function functionSql(sql, name) {
  const start = new RegExp(`create(?: or replace)? function ${name.replaceAll(".", "\\.")}\\(`, "iu").exec(sql)?.index;
  assert.notEqual(start, undefined, name);
  return sql.slice(start, sql.indexOf("$function$;", start) + "$function$;".length);
}
const content = { title: "Base observável", role: "theory", content: [{ id: "p", package: "aralearn.resource.paragraph", version: "1.0.0", data: { text: "A ligação permite interação." } }], response: null, feedback: [], topics: [] };
const application = () => ({ mode: "expository", introducedInstructionalAnalysisUnitIds: [analysisId], usedInstructionalAnalysisUnitIds: [],
  curriculumScopeItemIds: [], explanationApplications: [{ instructionalAnalysisUnitId: analysisId, developedForms: ["plain_definition"], notApplicable: [] }], practiceApplications: [] });
const snapshot = { contract: "aralearn.study-unit-design-snapshot.v2", parameterCatalogVersion: "1.2.1", didacticMicrosequenceId: "micro",
  appliedAt: "2026-09-09T00:00:00Z", instructionalAnalysisUnitIds: [], evidenceRequirementIds: [], editorialDirections: [],
  parameters: [{ parameterId: "new_analysis_unit_ceiling_per_expository_study_unit", value: 1 },
    { parameterId: "required_explanation_forms", value: ["plain_definition"] },
    { parameterId: "minimum_distinct_practice_opportunities_per_evidence_requirement", value: 1 },
    { parameterId: "required_practice_variation_dimensions", value: [] }],
  componentPolicy: { policy: { availability: "all", allowedRefs: [], excludedRefs: [], preferredRefs: [] } } };

// Full new migration + real current pedagogy/component primitives. Tables,
// session/access guards and the prior settings dispatcher are local fixtures.
// No hosted auth, PostgREST or existing materializer execution is claimed.
async function fixture({ units = false, currentOrder = false } = {}) {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;create schema auth;
    create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}');
    create table public.courses(id uuid primary key,owner_id uuid,title text default 'Curso',revision bigint default 1,updated_at timestamptz);
    insert into public.courses(id,owner_id) values('${courseId}','${owner}');
    create table private.course_instructional_plans(id uuid primary key,course_id uuid,version bigint default 1,updated_at timestamptz);
    insert into private.course_instructional_plans(id,course_id) values('40000000-0000-4000-8000-000000000001','${courseId}');
    create table private.course_instructional_plan_items(id uuid primary key,course_id uuid,instructional_plan_id uuid,item_kind text,
      position integer,statement text,description text default '',version bigint default 1,created_at timestamptz default now(),updated_at timestamptz,
      unique(instructional_plan_id,item_kind,position));
    create table private.course_entities(course_id uuid,entity_type text,entity_id text,parent_id text,position integer,content jsonb,
      version bigint default 1,design_snapshot jsonb,design_application jsonb,applied_explanation_basis jsonb,content_review jsonb,updated_at timestamptz,
      primary key(course_id,entity_type,entity_id));
    create table private.course_design_target_plan_items(course_id uuid,didactic_microsequence_id text,plan_item_id uuid,plan_item_kind text,
      primary key(course_id,didactic_microsequence_id,plan_item_id));
    create table private.course_source_attributions(course_id uuid,target_kind text,target_id text);
    create table private.course_change_receipts(actor_id uuid,request_id text,operation text,course_id uuid,request_hash text,result jsonb,
      expires_at timestamptz default now()+interval '14 days',primary key(actor_id,request_id));
    create function private.require_service_role() returns void language plpgsql as $$begin
      if current_setting('fixture.role',true)<>'service_role' then raise exception 'service required' using errcode='42501';end if;end$$;
    create function private.require_course_access_v1(uuid,uuid,boolean) returns text language plpgsql as $$begin
      if not exists(select 1 from public.courses where id=$1 and owner_id=$2) then raise exception 'owner required' using errcode='42501';end if;return 'owner';end$$;
    create function public.apply_course_design_command_for_actor_v3(uuid,uuid,bigint,jsonb,text,text,text) returns jsonb language sql as $$select jsonb_build_object('delegated',$4,'requestId',$5)$$;
    select set_config('fixture.role','service_role',false);
    insert into private.course_entities(course_id,entity_type,entity_id,parent_id,position,content) values
      ('${courseId}','module','module',null,0,'{"title":"Módulo"}'),('${courseId}','lesson','lesson','module',0,'{"title":"Lição"}'),
      ('${courseId}','microsequence','micro','lesson',0,'{"title":"Relações","explanation":{"title":"Base salva","content":[]}}');
  `);
  const design = await load("20260817180000_course_design_parameters.sql");
  for (const fn of ["private.course_component_refs_from_content_v1", "private.course_component_policy_allows_v1"]) await db.exec(functionSql(design, fn));
  await db.exec(functionSql(await load("20260903160000_global_curriculum_authoring_flow.sql"), "private.assert_course_materialization_pedagogy_v1"));
  try { await db.exec(await load("20260909061332_contextual_instructional_design_commands.sql")); }
  catch (error) { await db.close(); throw new Error(`${error.code}: ${error.message}; position ${error.position}`, { cause: error }); }
  if (currentOrder) {
    await db.exec(`create function public.get_aralearn_runtime_manifest() returns jsonb language sql as $$select '{"schemaRevision":"20260909063859","features":{"fixture":true}}'::jsonb$$;`);
    await db.exec(await load("20260909065357_contextual_instructional_snapshot_order.sql"));
  }
  if (units) {
    for (const [id, position] of [["unit-a", 1], ["unit-b", 2]]) await db.query(`insert into private.course_entities(course_id,entity_type,entity_id,parent_id,position,content,
      design_snapshot,design_application,applied_explanation_basis,content_review) values($1,'study_unit',$2,'micro',$3,$4,$5,$6,$7,$8)`,
    [courseId, id, position, content, snapshot, { ...application(), introducedInstructionalAnalysisUnitIds: [], explanationApplications: [], contract: "aralearn.study-unit-design-application.v1" },
      { version: 1, explanation: "base salva literal" }, { reviewedBy: owner, basisHash: "a".repeat(64) }]);
  }
  return db;
}
async function installCurrentConfiguration(db) {
  await db.exec(`create table private.course_design_parameter_definitions(parameter_id text primary key,ordinal integer,value_kind text,definition jsonb);
    create table private.course_design_parameter_assignments(course_id uuid,parameter_id text,scope_kind text,scope_ref text,mode text,value jsonb,origin text,reason text);
    create table private.course_authoring_guidance_assignments(course_id uuid,scope_kind text,scope_ref text,guidance text,origin text,reason text);
    create table private.course_component_policy_assignments(course_id uuid,scope_kind text,scope_ref text,policy jsonb,origin text,reason text);
    create function private.course_component_catalog_v1() returns jsonb language sql stable as $$select current_setting('fixture.component_catalog')::jsonb$$;`);
  await db.query("select set_config('fixture.component_catalog',$1,false)", [JSON.stringify(COURSE_COMPONENT_CATALOG)]);
  for (const [index, definition] of COURSE_DESIGN_PARAMETER_DEFINITIONS.entries()) {
    await db.query("insert into private.course_design_parameter_definitions values($1,$2,$3,$4)", [definition.id, index, definition.valueSchema.type, definition]);
    const selected = definition.id === "required_explanation_forms" ? ["plain_definition"] : definition.defaultValue;
    await db.query("insert into private.course_design_parameter_assignments values($1,$2,'course',$3,'fixed',$4,'author','Escolha expressa.')", [courseId, definition.id, courseId, JSON.stringify(selected)]);
  }
  const cut = await load("20260902044404_cut_legacy_authoring_runtime.sql");
  for (const fn of ["private.course_design_scope_path_v1", "private.course_current_authoring_guidance_v1", "private.course_current_component_policy_v1"]) await db.exec(functionSql(cut, fn));
  const current = await load("20260905080544_scoped_authoring_preferences_and_profiles.sql");
  for (const fn of ["private.valid_course_design_parameter_value_v1", "private.course_current_design_parameters_v1"]) await db.exec(functionSql(current, fn));
}
const value = async (db, sql, params = []) => (await db.query(sql, params)).rows[0].value;
async function write(db, command, requestId, overrides = {}) {
  const revisions = (await db.query("select c.revision,p.version from public.courses c join private.course_instructional_plans p on p.course_id=c.id where c.id=$1", [courseId])).rows[0];
  const full = { scope: { kind: "course", ref: courseId }, expectedPlanVersion: revisions.version, ...command };
  const revision = overrides.revision ?? revisions.revision;
  const hash = createHash("sha256").update(JSON.stringify({ courseId, revision, full })).digest("hex");
  return value(db, "select public.apply_course_design_command_for_actor_v3($1,$2,$3,$4,$5,$6,'mcp') value",
    [overrides.actor ?? owner, courseId, revision, full, requestId, overrides.hash ?? hash]);
}
const saveItem = (id, kind = "instructional_analysis_unit", expectedItemVersion = 0, statement = "Relação") => ({ type: "save_plan_item", itemId: id,
  itemKind: kind, expectedItemVersion, statement, description: "Conexão entre elementos." });
const links = ids => ({ type: "set_target_plan_items", scope: { kind: "didactic_microsequence", ref: "micro" }, instructionalAnalysisUnitIds: ids, evidenceRequirementIds: [] });
const apply = entries => ({ type: "set_study_unit_applications", scope: { kind: "didactic_microsequence", ref: "micro" },
  units: entries.map(([studyUnitId, supplied]) => ({ studyUnitId, expectedStudyUnitVersion: 1, application: supplied })) });

test("repertório antes das unidades usa versões/recibos e preserva vínculos, fontes e itens omitidos", async () => {
  const db = await fixture();
  try {
    assert.equal((await write(db, saveItem(analysisId), "design-create-analysis")).planVersion, 2);
    await write(db, saveItem(evidenceId, "evidence_requirement"), "design-create-evidence");
    assert.equal(await value(db, "select count(*)::integer value from private.course_entities where entity_type='study_unit'"), 0);
    const noOp = await write(db, saveItem(analysisId, "instructional_analysis_unit", 1), "design-identical-item");
    assert.equal(noOp.changed, false);
    await write(db, links([analysisId]), "design-link-analysis");
    const savedApplication = await value(db, "select content value from private.course_entities where entity_id='micro'");
    await write(db, saveItem(analysisId, "instructional_analysis_unit", 1, "Ligação corrigida"), "design-revise-analysis");
    assert.deepEqual(await value(db, "select content value from private.course_entities where entity_id='micro'"), savedApplication);
    assert.equal(await value(db, "select count(*)::integer value from private.course_instructional_plan_items"), 2);
    const remove = { type: "remove_plan_item", itemId: analysisId, itemKind: "instructional_analysis_unit", expectedItemVersion: 2 };
    await assert.rejects(write(db, remove, "design-remove-linked"), error => error.code === "PT409");
    await write(db, links([]), "design-unlink-analysis");
    await db.query("insert into private.course_source_attributions values($1,'plan_item',$2)", [courseId, analysisId]);
    await assert.rejects(write(db, remove, "design-remove-sourced"), error => error.code === "PT409");
    await db.exec("delete from private.course_source_attributions");
    assert.equal((await write(db, remove, "design-remove-analysis")).changed, true);
    assert.equal(await value(db, "select count(*)::integer value from private.course_instructional_plan_items where id=$1", [evidenceId]), 1);
    assert.deepEqual((await write(db, { type: "clear_guidance", scope: { kind: "course", ref: courseId } }, "design-existing-settings")).delegated.type, "clear_guidance");
  } finally { await db.close(); }
});

test("aplicação expressa preserva texto, base, revisão e parâmetros; valida forma e introdução no estado final", async () => {
  const db = await fixture({ units: true });
  try {
    await write(db, saveItem(analysisId), "design-create-analysis");
    await write(db, links([analysisId]), "design-link-analysis");
    const before = await value(db, "select to_jsonb(e) value from private.course_entities e where entity_id='unit-a'");
    const result = await write(db, apply([["unit-a", application()]]), "design-apply-unit");
    assert.equal(result.changed, true);
    const after = await value(db, "select to_jsonb(e) value from private.course_entities e where entity_id='unit-a'");
    for (const field of ["content", "version", "applied_explanation_basis", "content_review"]) assert.deepEqual(after[field], before[field], field);
    assert.deepEqual(after.design_snapshot.parameters, before.design_snapshot.parameters);
    assert.equal(after.design_snapshot.appliedAt, before.design_snapshot.appliedAt);
    assert.deepEqual(after.design_application.componentRefs, ["aralearn.resource.paragraph@1.0.0"]);
    assert.equal((await write(db, apply([["unit-a", application()]]), "design-apply-identical")).changed, false);
    await assert.rejects(write(db, apply([["unit-b", application()]]), "design-duplicate-intro"), error => error.code === "23514");
    assert.deepEqual(await value(db, "select design_application->'introducedInstructionalAnalysisUnitIds' value from private.course_entities where entity_id='unit-b'"), []);
    const invalid = application(); invalid.explanationApplications[0].developedForms = ["invented"];
    await assert.rejects(write(db, apply([["unit-a", invalid]]), "design-invalid-form"), error => error.code === "22023");
    const outside = application(); outside.introducedInstructionalAnalysisUnitIds = [evidenceId];
    await assert.rejects(write(db, apply([["unit-a", outside]]), "design-outside-target"), error => error.code === "23514");
  } finally { await db.close(); }
});

test("fronteira mantém dono, CAS, integridade do comando e replay por identidade exata", async () => {
  const db = await fixture();
  try {
    const command = { ...saveItem(analysisId), expectedPlanVersion: 1 };
    const first = await write(db, command, "design-replay-attempt", { revision: 1 });
    const replay = await write(db, command, "design-replay-attempt", { revision: 1 });
    assert.equal(replay.idempotent, true); assert.equal(replay.courseRevision, first.courseRevision);
    await assert.rejects(write(db, { ...command, statement: "Outra intenção" }, "design-replay-attempt", { revision: 1 }), error => error.code === "23514");
    await assert.rejects(write(db, saveItem(evidenceId), "design-stale-course", { revision: 1 }), error => error.code === "PT409");
    await assert.rejects(write(db, { ...saveItem(evidenceId), expectedPlanVersion: 1 }, "design-stale-plan"), error => error.code === "PT409");
    await assert.rejects(write(db, saveItem(evidenceId), "design-other-owner", { actor: other }), error => error.code === "42501");
    await assert.rejects(write(db, { ...saveItem(evidenceId), sql: "select 1" }, "design-extra-field"), error => error.code === "22023");
    assert.equal(await value(db, "select has_function_privilege('authenticated','public.apply_course_design_command_for_actor_v3(uuid,uuid,bigint,jsonb,text,text,text)','execute') value"), false);
    assert.equal(await value(db, "select has_function_privilege('service_role','private.apply_course_design_settings_core_v3(uuid,uuid,bigint,jsonb,text,text,text)','execute') value"), false);
  } finally { await db.close(); }
});

test("aplicações validam ordem global, evidência, política e lote atômico sem reconstruir unidades", async () => {
  const db = await fixture({ units: true });
  try {
    await write(db, saveItem(analysisId), "design-setup-analysis");
    await write(db, saveItem(evidenceId, "evidence_requirement"), "design-setup-evidence");
    await write(db, links([analysisId]), "design-setup-links");
    const use = { ...application(), introducedInstructionalAnalysisUnitIds: [], usedInstructionalAnalysisUnitIds: [analysisId], explanationApplications: [] };
    await assert.rejects(write(db, apply([["unit-a", use], ["unit-b", application()]]), "design-use-before-intro"), error => error.code === "23514");
    assert.deepEqual(await value(db, "select design_application->'introducedInstructionalAnalysisUnitIds' value from private.course_entities where entity_id='unit-b'"), []);
    await write(db, apply([["unit-a", application()], ["unit-b", use]]), "design-introduce-and-use");
    await write(db, { ...links([analysisId]), evidenceRequirementIds: [evidenceId] }, "design-evidence-link");
    const practiced = { ...use, mode: "practice", practiceApplications: [{ evidenceRequirementId: evidenceId, opportunityId: "caso-1",
      invariantTaskOperation: "Relação", variedDimensions: [] }] };
    await write(db, apply([["unit-b", practiced]]), "design-evidence-practice");
    const wrongOperation = structuredClone(practiced); wrongOperation.practiceApplications[0].invariantTaskOperation = "Outra operação";
    await assert.rejects(write(db, apply([["unit-b", wrongOperation]]), "design-wrong-operation"), error => error.code === "23514");
    const invalid = application(); invalid.explanationApplications[0].developedForms = [null];
    await assert.rejects(write(db, apply([["unit-a", invalid]]), "design-null-form"), error => ["22023", "23514"].includes(error.code));
    await db.query("update private.course_entities set design_snapshot=jsonb_set(design_snapshot,'{componentPolicy,policy,excludedRefs}',$1) where entity_id='unit-b'",
      [["aralearn.resource.paragraph@1.0.0"]]);
    await assert.rejects(write(db, apply([["unit-b", practiced]]), "design-component-excluded"), error => error.code === "23514");
    assert.equal(await value(db, "select count(*)::integer value from private.course_change_receipts where request_id in('design-use-before-intro','design-wrong-operation','design-component-excluded')"), 0);
  } finally { await db.close(); }
});

test("configuração expressa resolve intenção real e calibração, preserva conteúdo e recupera legado", async () => {
  const db = await fixture({ units: true });
  try {
    await installCurrentConfiguration(db);
    await write(db, saveItem(analysisId), "configuration-analysis");
    await write(db, links([analysisId]), "configuration-links");
    await write(db, apply([["unit-a", application()]]), "configuration-application");
    const before = await value(db, "select to_jsonb(e) value from private.course_entities e where entity_id='unit-a'");
    const configure = (studyUnitId, extra = {}) => ({ type: "apply_study_unit_configuration", scope: { kind: "didactic_microsequence", ref: "micro" },
      units: [{ studyUnitId, expectedStudyUnitVersion: 1, automaticParameters: [], ...extra }] });
    const result = await write(db, configure("unit-a"), "configuration-current");
    const after = await value(db, "select to_jsonb(e) value from private.course_entities e where entity_id='unit-a'");
    for (const field of ["content", "version", "applied_explanation_basis", "content_review", "design_application"]) assert.deepEqual(after[field], before[field], field);
    assert.equal(after.design_snapshot.parameters.length, COURSE_DESIGN_PARAMETER_DEFINITIONS.length);
    assert.equal(after.design_snapshot.parameters[0].value, 2);
    assert.notDeepEqual(after.design_snapshot, before.design_snapshot);
    assert.equal(result.planVersion, 3);
    assert.equal((await write(db, configure("unit-a"), "configuration-identical")).changed, false);
    assert.equal(await value(db, "select design_snapshot->>'appliedAt' value from private.course_entities where entity_id='unit-a'"), after.design_snapshot.appliedAt);
    const param = COURSE_DESIGN_PARAMETER_DEFINITIONS.find(item => item.valueSchema.type === "enum");
    await db.query("update private.course_design_parameter_assignments set mode='automatic',value='null',origin='author' where parameter_id=$1", [param.id]);
    await assert.rejects(write(db, configure("unit-a"), "configuration-uncalibrated"), error => error.code === "PD409");
    const calibration = { automaticParameters: [{ parameterId: param.id, value: param.defaultValue, reason: "Escolha contextual para esta unidade." }] };
    await write(db, configure("unit-a", calibration), "configuration-calibrated");
    assert.equal(await value(db, "select v->'value' value from private.course_entities e cross join lateral jsonb_array_elements(e.design_snapshot->'parameters') v where e.entity_id='unit-a' and v->>'parameterId'=$1", [param.id]), param.defaultValue);
    const fixed = { automaticParameters: [{ parameterId: "new_analysis_unit_ceiling_per_expository_study_unit", value: 3, reason: "Tentativa sobre fixação." }] };
    await assert.rejects(write(db, configure("unit-a", fixed), "configuration-fixed-denied"), error => error.code === "22023");
    await db.exec("update private.course_entities set design_snapshot=null,design_application=null where entity_id='unit-b'");
    await assert.rejects(write(db, configure("unit-b", calibration), "configuration-legacy-missing-application"), error => error.code === "22023");
    const use = { ...application(), introducedInstructionalAnalysisUnitIds: [], usedInstructionalAnalysisUnitIds: [analysisId], explanationApplications: [] };
    await write(db, configure("unit-b", { ...calibration, application: use }), "configuration-legacy-explicit");
    assert.equal(await value(db, "select design_snapshot->>'contract' value from private.course_entities where entity_id='unit-b'"), "aralearn.study-unit-design-snapshot.v2");
    await db.exec("update private.course_design_parameter_assignments set value='[\"plain_definition\",\"mechanism\"]' where parameter_id='required_explanation_forms'");
    const stable = await value(db, "select design_snapshot value from private.course_entities where entity_id='unit-a'");
    await assert.rejects(write(db, configure("unit-a", calibration), "configuration-needs-content-correction"), error => error.code === "23514");
    assert.deepEqual(await value(db, "select design_snapshot value from private.course_entities where entity_id='unit-a'"), stable);
  } finally { await db.close(); }
});

test("recorte salvo com mais de 64 unidades é validado inteiro sem ampliar o lote de escrita", async () => {
  const db = await fixture({ units: true });
  try {
    const empty = { ...application(), introducedInstructionalAnalysisUnitIds: [], explanationApplications: [] };
    for (let position = 3; position <= 65; position += 1) {
      await db.query("insert into private.course_entities(course_id,entity_type,entity_id,parent_id,position,content,design_snapshot,design_application) values($1,'study_unit',$2,'micro',$3,$4,$5,$6)",
        [courseId, `unit-${position}`, position, content, snapshot, empty]);
    }
    await write(db, saveItem(analysisId), "large-saved-analysis");
    await write(db, links([analysisId]), "large-saved-links");
    assert.equal((await write(db, apply([["unit-a", application()]]), "large-saved-one-unit")).changed, true);
    assert.equal(await value(db, "select count(*)::integer value from private.course_entities where entity_type='study_unit'"), 65);
    const all = ["unit-a", "unit-b", ...Array.from({ length: 63 }, (_, index) => `unit-${index + 3}`)];
    await assert.rejects(write(db, apply(all.map(id => [id, empty])), "large-incoming-batch"), error => error.code === "22023");
  } finally { await db.close(); }
});

test("aplicação corrente não atravessa conflito de pesquisa nem versão de outra unidade", async () => {
  const db = await fixture({ units: true });
  try {
    await installCurrentConfiguration(db);
    const command = { type: "apply_study_unit_configuration", scope: { kind: "didactic_microsequence", ref: "micro" },
      units: [{ studyUnitId: "unit-a", expectedStudyUnitVersion: 1, automaticParameters: [] },
        { studyUnitId: "unit-b", expectedStudyUnitVersion: 2, automaticParameters: [] }] };
    const before = await value(db, "select design_snapshot value from private.course_entities where entity_id='unit-a'");
    await assert.rejects(write(db, command, "configuration-batch-stale"), error => error.code === "PT409");
    assert.deepEqual(await value(db, "select design_snapshot value from private.course_entities where entity_id='unit-a'"), before);
    await db.exec("update private.course_design_parameter_assignments set origin='research_condition' where parameter_id='new_analysis_unit_ceiling_per_expository_study_unit'");
    await db.query("insert into private.course_design_parameter_assignments values($1,'new_analysis_unit_ceiling_per_expository_study_unit','study_unit','unit-a','fixed','3','author','Exceção incompatível.')", [courseId]);
    command.units.pop();
    await assert.rejects(write(db, command, "configuration-research-conflict"), error => error.code === "PD409");
    assert.equal(await value(db, "select count(*)::integer value from private.course_change_receipts where request_id in('configuration-batch-stale','configuration-research-conflict')"), 0);
    assert.deepEqual(await value(db, "select design_snapshot value from private.course_entities where entity_id='unit-a'"), before);
  } finally { await db.close(); }
});

test("snapshot conserva a ordem position/id exigida pelo reader e materializador", async () => {
  const db = await fixture({ units: true, currentOrder: true });
  try {
    const secondId = "30000000-0000-4000-8000-000000000000";
    await write(db, saveItem(analysisId), "ordered-analysis-first");
    await write(db, saveItem(secondId), "ordered-analysis-second");
    await write(db, links([secondId, analysisId]), "ordered-analysis-links");
    await write(db, apply([["unit-a", application()]]), "ordered-analysis-application");
    assert.deepEqual(await value(db, "select design_snapshot->'instructionalAnalysisUnitIds' value from private.course_entities where entity_id='unit-a'"), [analysisId, secondId]);
    await installCurrentConfiguration(db);
    await write(db, { type: "apply_study_unit_configuration", scope: { kind: "didactic_microsequence", ref: "micro" },
      units: [{ studyUnitId: "unit-a", expectedStudyUnitVersion: 1, automaticParameters: [] }] }, "ordered-current-configuration");
    assert.deepEqual(await value(db, "select design_snapshot->'instructionalAnalysisUnitIds' value from private.course_entities where entity_id='unit-a'"), [analysisId, secondId]);
    assert.deepEqual(await value(db, "select public.get_aralearn_runtime_manifest() value"), { schemaRevision: "20260909065357", features: { fixture: true } });
  } finally { await db.close(); }
});
