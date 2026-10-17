// Fixture PGlite do escritor instrucional para o orçamento do comando.
// Reutiliza o esqueleto de tests/runtime/course-instructional-design-commands-pglite.test.js
// e a cadeia real de migrações; sem serviço hospedado e sem curso real.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { COURSE_COMPONENT_CATALOG, COURSE_DESIGN_PARAMETER_DEFINITIONS } from "../../src/domain/courseDesignParameters.js";

export const owner = "10000000-0000-4000-8000-000000000001";
export const other = "10000000-0000-4000-8000-000000000002";
export const courseId = "20000000-0000-4000-8000-000000000001";
export const analysisId = "30000000-0000-4000-8000-000000000001";
export const evidenceId = "30000000-0000-4000-8000-000000000002";
export const BUDGET_MIGRATION = "20261017120000_instructional_command_budget.sql";
export const BUDGET_REVISION = "20261017120000";
export const BUDGET_OCTETS = 262144;
const migrations = new URL("../../supabase/migrations/", import.meta.url);
export const loadMigration = name => fs.readFile(new URL(name, migrations), "utf8");
export function functionSql(sql, name) {
  const start = new RegExp(`create(?: or replace)? function ${name.replaceAll(".", "\\.")}\\(`, "iu").exec(sql)?.index;
  assert.notEqual(start, undefined, name);
  return sql.slice(start, sql.indexOf("$function$;", start) + "$function$;".length);
}
export const content = { title: "Base observável", role: "theory", content: [{ id: "p", package: "aralearn.resource.paragraph", version: "1.0.0", data: { text: "A ligação permite interação." } }], response: null, feedback: [], topics: [] };
export const savedApplication = () => ({ mode: "expository", introducedInstructionalAnalysisUnitIds: [], usedInstructionalAnalysisUnitIds: [],
  curriculumScopeItemIds: [], explanationApplications: [], practiceApplications: [], contract: "aralearn.study-unit-design-application.v1" });
export const savedSnapshot = () => ({ contract: "aralearn.study-unit-design-snapshot.v2", parameterCatalogVersion: "1.2.1", didacticMicrosequenceId: "micro",
  appliedAt: "2026-09-09T00:00:00Z", instructionalAnalysisUnitIds: [], evidenceRequirementIds: [], editorialDirections: [],
  parameters: [], componentPolicy: { policy: { availability: "all", allowedRefs: [], excludedRefs: [], preferredRefs: [] } } });
export const studyUnitParameterDefinitions = () => COURSE_DESIGN_PARAMETER_DEFINITIONS.filter(definition => definition.supportedScopes.includes("study_unit"));
export const parameterValue = definition => definition.id === "required_explanation_forms" ? ["plain_definition"] : definition.defaultValue;

export async function openInstructionalFixture({ unitIds = [] } = {}) {
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
      ('${courseId}','microsequence','micro','lesson',0,'{"title":"Relações","explanation":{"title":"Base salva","content":[]}}');`);
  const design = await loadMigration("20260817180000_course_design_parameters.sql");
  for (const fn of ["private.course_component_refs_from_content_v1", "private.course_component_policy_allows_v1"]) await db.exec(functionSql(design, fn));
  await db.exec(functionSql(await loadMigration("20260903160000_global_curriculum_authoring_flow.sql"), "private.assert_course_materialization_pedagogy_v1"));
  try { await db.exec(await loadMigration("20260909061332_contextual_instructional_design_commands.sql")); }
  catch (error) { await db.close(); throw new Error(`${error.code}: ${error.message}; position ${error.position}`, { cause: error }); }
  await db.exec(`create function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path = pg_catalog as $$
    select '{"schemaRevision":"20260909063859","contractVersion":1,"features":["fixture-manifest-v1"]}'::jsonb$$`);
  await db.exec(await loadMigration("20260909065357_contextual_instructional_snapshot_order.sql"));
  await db.exec(await loadMigration("20260928125507_contextual_design_writer_edges.sql"));
  await installCurrentConfiguration(db);
  await db.exec("alter table private.course_design_parameter_definitions add column supported_scopes text[]");
  for (const definition of COURSE_DESIGN_PARAMETER_DEFINITIONS) {
    await db.query("update private.course_design_parameter_definitions set supported_scopes=$2 where parameter_id=$1", [definition.id, definition.supportedScopes]);
  }
  await db.exec(functionSql(await loadMigration("20260905083846_contextual_automatic_design_application.sql"), "private.valid_applied_course_design_parameters_v1"));
  await db.exec(await loadMigration("20260909071110_contextual_calibration_provenance.sql"));
  await db.exec(await loadMigration("20260910045104_contextual_explanation_forms_across_units.sql"));
  await db.exec(await loadMigration("20260910054749_contextual_recorded_practice_integrity.sql"));
  await db.exec(await loadMigration("20261015021933_contextual_design_course_scope_applications.sql"));
  for (const [index, id] of unitIds.entries()) {
    await db.query(`insert into private.course_entities(course_id,entity_type,entity_id,parent_id,position,content,
      design_snapshot,design_application,applied_explanation_basis,content_review) values($1,'study_unit',$2,'micro',$3,$4,$5,$6,$7,$8)`,
      [courseId, id, index + 1, content, savedSnapshot(), savedApplication(),
        { version: 1, explanation: "base salva literal" }, { reviewedBy: owner, basisHash: "a".repeat(64) }]);
  }
  return db;
}

export async function applyInstructionalCommandBudget(db) {
  await db.exec(await loadMigration(BUDGET_MIGRATION));
}

export async function installCurrentConfiguration(db) {
  await db.exec(`create table private.course_design_parameter_definitions(parameter_id text primary key,ordinal integer,value_kind text,definition jsonb);
    create table private.course_design_parameter_assignments(course_id uuid,parameter_id text,scope_kind text,scope_ref text,mode text,value jsonb,origin text,reason text);
    create table private.course_authoring_guidance_assignments(course_id uuid,scope_kind text,scope_ref text,guidance text,origin text,reason text);
    create table private.course_component_policy_assignments(course_id uuid,scope_kind text,scope_ref text,policy jsonb,origin text,reason text);
    create function private.course_component_catalog_v1() returns jsonb language sql stable as $$select current_setting('fixture.component_catalog')::jsonb$$;`);
  await db.query("select set_config('fixture.component_catalog',$1,false)", [JSON.stringify(COURSE_COMPONENT_CATALOG)]);
  for (const [index, definition] of COURSE_DESIGN_PARAMETER_DEFINITIONS.entries()) {
    await db.query("insert into private.course_design_parameter_definitions values($1,$2,$3,$4)", [definition.id, index, definition.valueSchema.type, definition]);
    await db.query("insert into private.course_design_parameter_assignments values($1,$2,'course',$3,'fixed',$4,'author','Escolha expressa.')",
      [courseId, definition.id, courseId, JSON.stringify(parameterValue(definition))]);
  }
  const cut = await loadMigration("20260902044404_cut_legacy_authoring_runtime.sql");
  for (const fn of ["private.course_design_scope_path_v1", "private.course_current_authoring_guidance_v1", "private.course_current_component_policy_v1"]) await db.exec(functionSql(cut, fn));
  const current = await loadMigration("20260905080544_scoped_authoring_preferences_and_profiles.sql");
  for (const fn of ["private.valid_course_design_parameter_value_v1", "private.course_current_design_parameters_v1"]) await db.exec(functionSql(current, fn));
}

export async function delegateParametersToContext(db, definitions) {
  await db.query("update private.course_design_parameter_assignments set mode='automatic',origin='author',reason='Delegado ao contexto.' where parameter_id=any($1)",
    [definitions.map(definition => definition.id)]);
}

export const value = async (db, sql, params = []) => (await db.query(sql, params)).rows[0].value;
export const commandOctets = async (db, command) => Number(await value(db, "select octet_length($1::jsonb::text)::integer value", [JSON.stringify(command)]));
export const jsonUtf8Bytes = command => new TextEncoder().encode(JSON.stringify(command)).byteLength;
export const jsonbChars = async (db, command) => Number(await value(db, "select length($1::jsonb::text)::integer value", [JSON.stringify(command)]));
export const planVersion = db => value(db, "select version value from private.course_instructional_plans where course_id=$1", [courseId]);
export const courseRevision = db => value(db, "select revision value from public.courses where id=$1", [courseId]);
export const receiptCount = (db, requestIds) => value(db, `select count(*)::integer value from private.course_change_receipts where request_id = any($1)`,
  [requestIds]);
export async function writeCommand(db, command, requestId, { actor = owner, revision = null } = {}) {
  const revisions = (await db.query("select c.revision,p.version from public.courses c join private.course_instructional_plans p on p.course_id=c.id where c.id=$1", [courseId])).rows[0];
  const full = { scope: { kind: "course", ref: courseId }, expectedPlanVersion: revisions.version, ...command };
  const expectedRevision = revision ?? revisions.revision;
  const hash = createHash("sha256").update(JSON.stringify({ courseId, revision: expectedRevision, full })).digest("hex");
  return value(db, "select public.apply_course_design_command_for_actor_v3($1,$2,$3,$4,$5,$6,'mcp') value",
    [actor, courseId, expectedRevision, full, requestId, hash]);
}
export const savePlanItem = (id, kind = "instructional_analysis_unit") => ({ type: "save_plan_item", itemId: id,
  itemKind: kind, expectedItemVersion: 0, statement: "Relação", description: "Conexão entre elementos." });
export const linkAnalysis = ids => ({ type: "set_target_plan_items", scope: { kind: "didactic_microsequence", ref: "micro" },
  instructionalAnalysisUnitIds: ids, evidenceRequirementIds: [] });
export const configurationCommand = units => ({ type: "apply_study_unit_configuration",
  scope: { kind: "didactic_microsequence", ref: "micro" }, units });
export const snapshotsOfUnits = db => value(db, `select jsonb_agg(jsonb_build_object('id',e.entity_id,'snapshot',e.design_snapshot-'appliedAt') order by e.position) value
  from private.course_entities e where e.entity_type='study_unit'`);

