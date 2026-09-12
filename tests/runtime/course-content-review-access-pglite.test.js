import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { normalizeCourseContentReview, normalizeCourseContentReviewChange } from "../../src/domain/courseContentReview.js";

const OWNER = "10000000-0000-4000-8000-000000000001";
const READER = "10000000-0000-4000-8000-000000000002";
const OTHER = "10000000-0000-4000-8000-000000000003";
const COURSE = "20000000-0000-4000-8000-000000000001";
const COPY = "20000000-0000-4000-8000-000000000002";
const SESSION = "30000000-0000-4000-8000-000000000001";
const EVIDENCE = "50000000-0000-4000-8000-000000000001";
const ANALYSIS = "50000000-0000-4000-8000-000000000002";
const CURRICULUM = "50000000-0000-4000-8000-000000000003";
const EVIDENCE_REVIEW_SCOPE_MIGRATION = "20260911232152_explanation_review_practice_scope.sql";
const migrations = new URL("../../supabase/migrations/", import.meta.url);
const load = name => fs.readFile(new URL(name, migrations), "utf8");
function functionSql(source, name, delimiter = "$function$") {
  const match = new RegExp(`create(?: or replace)? function ${name.replaceAll(".", "\\.")}\\(`, "u").exec(source);
  assert.ok(match, `SQL precursor ${name}`);
  return source.slice(match.index, source.indexOf(`${delimiter};`, match.index) + `${delimiter};`.length);
}
const block = text => ({ id: "body", package: "aralearn.resource.paragraph", version: "1.0.0", data: { text } });
const explanation = text => ({ title: "Base", content: [block(text)] });
const unit = text => ({ title: "Unidade", role: "theory", content: [block(text)], response: null, feedback: [], topics: [] });

// PGlite executes the complete new migration. The fixture replaces platform
// auth.claims and the digest primitive, and uses minimal relational tables;
// it is not proof of a hosted session, PostgREST or browser behavior.
async function fixture({ beforeEvidenceScope = false } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema private; create schema auth;
    create table auth.users(id uuid primary key,deleted_at timestamptz,is_anonymous boolean default false,banned_until timestamptz);
    create table auth.sessions(id uuid primary key,user_id uuid,oauth_client_id uuid,not_after timestamptz);
    create table public.person_profiles(user_id uuid primary key);
    create table public.courses(id uuid primary key,owner_id uuid,revision bigint default 1,visibility text default 'private',updated_at timestamptz);
    create table public.course_access(course_id uuid,user_id uuid,can_copy boolean default false);
    create table private.course_entities(course_id uuid,entity_type text,entity_id text,parent_id text,parent_type text,
      position integer default 1,content jsonb not null,version bigint default 1,design_snapshot jsonb,design_application jsonb,content_review jsonb,
      primary key(course_id,entity_type,entity_id),constraint course_content_review_v1 check(content_review is null or entity_type='microsequence'));
    create table private.course_design_target_plan_items(course_id uuid,didactic_microsequence_id text,plan_item_id uuid,plan_item_kind text);
    create table private.course_instructional_plan_items(course_id uuid,id uuid,item_kind text,statement text,description text);
    create table private.course_source_attributions(course_id uuid,id uuid,target_kind text,target_id text);
    create table private.course_source_attribution_sources(course_id uuid,attribution_id uuid,source_id text,relation text);
    create table private.course_source_attribution_anchors(course_id uuid,attribution_id uuid,anchor_id text);
    create table private.course_sources(course_id uuid,source_id text,title text,status text default 'active',revision bigint default 1);
    create table private.course_source_anchors(course_id uuid,anchor_id text,source_id text,content_hash text,selector jsonb);
    create table private.course_source_attachments(course_id uuid,source_id text,content_hash text,status text,public_file_access text);
    create table private.course_media(course_id uuid,content_hash text,status text,byte_size bigint,media_type text);
    create table private.course_change_receipts(actor_id uuid,request_id text,operation text,course_id uuid,request_hash text,result jsonb,
      primary key(actor_id,request_id),constraint course_change_receipts_operation_v16 check(operation='approve_microsequence_content'));
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('fixture.actor',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select current_setting('fixture.jwt',true)::jsonb$$;
    create function private.require_service_role() returns void language plpgsql as $$begin
      if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'service role required' using errcode='42501'; end if; end$$;
    create function private.course_source_json_hash_v1(jsonb) returns text language sql immutable as $$select repeat(md5($1::text),2)$$;
    create function private.course_source_links_v1(p_course_id uuid,p_id uuid) returns jsonb language sql stable as $$
      select coalesce(jsonb_agg(jsonb_build_object('sourceId',source_id,'relation',relation) order by source_id),'[]')
        from private.course_source_attribution_sources where course_id=p_course_id and attribution_id=p_id$$;
    create function public.get_aralearn_runtime_manifest() returns jsonb language sql stable as $$select '{"schemaRevision":"20260908002120","features":[]}'::jsonb$$;
    create function private.list_course_entities_for_actor_v1(p_actor_id uuid,p_course_id uuid,p_revision bigint,p_limit integer,p_type text,p_id text)
    returns jsonb language sql stable as $$select jsonb_build_object(
      'contentReview',case when page.entity_type='microsequence' then private.course_microsequence_review_v1(p_course_id,page.entity_id) end,
      'content',page.content) from private.course_entities page where page.course_id=p_course_id limit 1$$;
  `.replace(/ {4}create function private.list_course_entities[\s\S]*$/u, ""));
  const reviewSql = await load("20260907222912_shared_explanations_human_content_review.sql");
  for (const name of ["private.course_content_media_hashes_v1", "private.valid_course_explanation_v1", "private.valid_course_explanation_plan_v1", "private.require_course_review_session_v1"]) {
    await db.exec(functionSql(reviewSql, name));
  }
  await db.exec(functionSql(await load("20260905062817_public_course_access_and_identity.sql"), "private.course_ownership_v1"));
  await db.exec(functionSql(await load("20260817140000_course_identity_cutover.sql"), "private.require_course_access_v1"));
  await db.exec(functionSql(await load("20260908023156_refresh_generated_package_fingerprint.sql"), "private.course_component_catalog_v1", "$catalog$"));
  await db.exec(functionSql(await load("20260817180000_course_design_parameters.sql"), "private.valid_course_component_refs_in_content_v1"));
  await db.exec(`
    create function private.course_microsequence_basis_hash_v1(uuid,text) returns text language sql as $$select repeat('a',64)$$;
    create function private.course_microsequence_review_v1(uuid,text) returns jsonb language sql as $$select '{"state":"draft"}'::jsonb$$;
    create function public.approve_course_microsequence_content_v1(uuid,text,text,text) returns jsonb language sql as $$select '{}'::jsonb$$;
    create function public.get_course_microsequence_review_v1(uuid,text) returns jsonb language sql as $$select '{}'::jsonb$$;
    create function private.list_course_entities_for_actor_v1(p_actor_id uuid,p_course_id uuid,p_revision bigint,p_limit integer,p_type text,p_id text)
    returns jsonb language sql stable as $$select jsonb_build_object(
      'contentReview',case when page.entity_type='microsequence' then private.course_microsequence_review_v1(p_course_id,page.entity_id) end,
      'content',page.content) from private.course_entities page where page.course_id=p_course_id limit 1$$;
    insert into auth.users(id) values('${OWNER}'),('${READER}'),('${OTHER}');
    insert into auth.sessions(id,user_id) values('${SESSION}','${OWNER}');
    insert into public.person_profiles(user_id) values('${OWNER}'),('${READER}'),('${OTHER}');
    insert into public.courses(id,owner_id) values('${COURSE}','${OWNER}'),('${COPY}','${OWNER}');
    insert into public.course_access(course_id,user_id,can_copy) values('${COURSE}','${READER}',true);
  `);
  const triggerGroups = {
    "private.mark_course_content_review_v1": [["course_content_review_guard", "private.course_entities"]],
    "private.invalidate_course_content_review_v1": [["course_content_review_invalidate", "private.course_entities"]],
    "private.mark_course_source_content_review_v1": [["mark_course_review_source", "private.course_sources"], ["mark_course_review_anchor", "private.course_source_anchors"],
      ["mark_course_review_attachment", "private.course_source_attachments"], ["mark_course_review_attribution", "private.course_source_attributions"],
      ["mark_course_review_link", "private.course_source_attribution_sources"], ["mark_course_review_anchor_link", "private.course_source_attribution_anchors"]],
    "private.mark_course_media_content_review_v1": [["mark_course_review_media", "private.course_media"]],
    "private.mark_course_plan_item_content_review_v1": [["mark_course_review_plan_item", "private.course_instructional_plan_items"]]
  };
  for (const [fn, triggers] of Object.entries(triggerGroups)) {
    await db.exec(`create function ${fn}() returns trigger language plpgsql as $$begin return new; end$$;`);
    for (const [name, table] of triggers) await db.exec(`create trigger ${name} before insert or update on ${table} for each row execute function ${fn}();`);
  }
  for (const [id, content] of [["a", { title: "Microssequência A", goal: "Objetivo A", dependsOn: [], explanation: explanation("Base A") }],
    ["b", { title: "Microssequência B", goal: "Objetivo B", dependsOn: ["a"], explanation: explanation("Base B") }],
    ["solo", { title: "Base antes das unidades", goal: "Objetivo da base", dependsOn: [], explanation: explanation("Base independente") }],
    ["legacy", { title: "Acervo sem base", goal: "Objetivo legado", dependsOn: [] }]]) {
    await db.query("insert into private.course_entities(course_id,entity_type,entity_id,parent_id,parent_type,content,content_review) values($1,'microsequence',$2,'lesson','lesson',$3,$4)",
      [COURSE, id, content, id === "a" ? { approvedBasisHash: "a".repeat(64), approvedAt: "2026-09-08T00:00:00Z", approvedBy: OWNER } : null]);
  }
  await db.exec(await load("20260909025232_contextual_content_review_access.sql"));
  await db.exec(functionSql(await load("20260909060955_contextual_runtime_integration_guards.sql"), "private.course_content_complete_v1"));
  await db.exec("alter table private.course_entities add column applied_explanation_basis jsonb");
  const appliedBasisSql = await load("20260909030823_contextual_applied_explanation_basis.sql");
  await db.exec(appliedBasisSql.slice(appliedBasisSql.indexOf("do $review_basis$"), appliedBasisSql.indexOf("$review_basis$;") + "$review_basis$;".length));
  if (!beforeEvidenceScope) await db.exec(await load(EVIDENCE_REVIEW_SCOPE_MIGRATION));
  for (const [id, parent] of [["u1", "a"], ["u2", "a"], ["u3", "b"], ["old", "legacy"]]) {
    await db.query("insert into private.course_entities(course_id,entity_type,entity_id,parent_id,parent_type,content) values($1,'study_unit',$2,$3,'microsequence',$4)", [COURSE, id, parent, unit(id)]);
  }
  await db.query("select set_config('fixture.jwt',$1,false)", [JSON.stringify({ role: "service_role" })]);
  return db;
}
const queryValue = async (db, sql, params = []) => (await db.query(sql, params)).rows[0].value;
const read = (db, kind, id, actor = OWNER) => queryValue(db, "select public.get_course_content_review_for_actor_v1($1,$2,$3,$4) value", [actor, COURSE, kind, id]);
const state = async (db, kind, id) => (await read(db, kind, id)).contentReview.state;
const set = async (db, kind, id, reviewed, request, hash) => queryValue(db, "select public.set_course_content_review_for_actor_v1($1,$2,$3,$4,$5,$6,$7) value",
  [OWNER, COURSE, kind, id, hash || (await read(db, kind, id)).basisHash, reviewed, request]);
const readable = (db, actor, type, id) => queryValue(db, "select private.course_entity_readable_v1($1,$2,$3,$4,null) value", [COURSE, actor, type, id]);
const code = expected => error => error.code === expected;
const addPlanItem = async (db, id, kind, microsequence = "a") => {
  await db.query("insert into private.course_instructional_plan_items values($1,$2,$3,'Enunciado do item','Descrição do item')", [COURSE, id, kind]);
  await db.query("insert into private.course_design_target_plan_items values($1,$2,$3,$4)", [COURSE, microsequence, id, kind]);
};

test("requisito formativo de prática conserva revisão da explicação e de suas dependentes", async () => {
  const db = await fixture();
  try {
    for (const id of ["a", "b"]) await set(db, "microsequence_explanation", id, true, `explanation-before-evidence-${id}`);
    await set(db, "study_unit", "u1", true, "unit-before-evidence");
    const before = await read(db, "microsequence_explanation", "a");
    await addPlanItem(db, EVIDENCE, "evidence_requirement");
    assert.equal(await state(db, "microsequence_explanation", "a"), "current");
    assert.equal(await state(db, "microsequence_explanation", "b"), "current");
    assert.equal((await read(db, "microsequence_explanation", "a")).basisHash, before.basisHash);
    assert.equal(await state(db, "study_unit", "u1"), "stale", "o alcance da unidade permanece inalterado");
    await db.query("update private.course_instructional_plan_items set statement='Requisito formativo ajustado' where id=$1", [EVIDENCE]);
    await db.exec(`insert into private.course_source_attributions values('${COURSE}','40000000-0000-4000-8000-000000000002','plan_item','${EVIDENCE}');
      insert into private.course_sources(course_id,source_id,title) values('${COURSE}','practice-source','Fonte do requisito');
      insert into private.course_source_attribution_sources values('${COURSE}','40000000-0000-4000-8000-000000000002','practice-source','supports');`);
    for (const id of ["a", "b"]) assert.equal(await state(db, "microsequence_explanation", id), "current");
    await set(db, "study_unit", "u1", true, "unit-with-evidence");
    await db.query("update private.course_entities set design_application=$1 where entity_id='u1'", [{ practiceApplications: [{ evidenceRequirementId: EVIDENCE, opportunityId: "practice-1" }] }]);
    assert.equal(await state(db, "study_unit", "u1"), "stale", "a aplicação efetiva continua material para a unidade");
    for (const id of ["a", "b"]) assert.equal(await state(db, "microsequence_explanation", id), "current");
    await addPlanItem(db, CURRICULUM, "curriculum_scope_item");
    for (const id of ["a", "b"]) assert.equal(await state(db, "microsequence_explanation", id), "stale", "o escopo curricular continua compondo a base de revisão");
  } finally { await db.close(); }
});

test("vínculo de análise posterior à revisão conserva a base e a dependente, com alcance próprio da unidade", async () => {
  const db = await fixture();
  try {
    const before = new Map();
    for (const id of ["a", "b"]) {
      await set(db, "microsequence_explanation", id, true, `base-before-analysis-${id}`);
      before.set(id, (await read(db, "microsequence_explanation", id)).basisHash);
    }
    const assertBasesCurrent = async () => {
      for (const id of ["a", "b"]) {
        assert.equal(await state(db, "microsequence_explanation", id), "current");
        assert.equal((await read(db, "microsequence_explanation", id)).basisHash, before.get(id));
      }
    };
    await set(db, "study_unit", "u1", true, "unit-before-analysis");
    await addPlanItem(db, ANALYSIS, "instructional_analysis_unit");
    await assertBasesCurrent();
    assert.equal(await state(db, "study_unit", "u1"), "stale");
    await set(db, "study_unit", "u1", true, "unit-with-analysis");
    await db.exec(`insert into private.course_source_attributions values('${COURSE}','40000000-0000-4000-8000-000000000004','plan_item','${ANALYSIS}');
      insert into private.course_sources(course_id,source_id,title) values('${COURSE}','analysis-source','Fonte da análise');
      insert into private.course_source_attribution_sources values('${COURSE}','40000000-0000-4000-8000-000000000004','analysis-source','supports');`);
    await db.query("update private.course_instructional_plan_items set description='Análise refinada durante a produção' where id=$1", [ANALYSIS]);
    await assertBasesCurrent();
    assert.equal(await state(db, "study_unit", "u1"), "stale", "a unidade conserva os itens e as fontes de sua análise no alcance");
    await set(db, "study_unit", "u1", true, "unit-after-analysis-source");
    await db.query("update private.course_entities set design_application=$1 where entity_id='u1'", [{ mode: "expository",
      introducedInstructionalAnalysisUnitIds: [], usedInstructionalAnalysisUnitIds: [ANALYSIS],
      explanationApplications: [], practiceApplications: [] }]);
    assert.equal(await state(db, "study_unit", "u1"), "stale", "a aplicação instrucional continua material para a unidade");
    await assertBasesCurrent();
    await db.exec(`insert into private.course_source_attributions values('${COURSE}','40000000-0000-4000-8000-000000000005','microsequence_explanation','a');
      insert into private.course_source_attribution_sources values('${COURSE}','40000000-0000-4000-8000-000000000005','analysis-source','supports');`);
    for (const id of ["a", "b"]) {
      assert.equal(await state(db, "microsequence_explanation", id), "stale", "a mesma fonte é material quando também sustenta a base");
      await set(db, "microsequence_explanation", id, true, `base-with-direct-source-${id}`);
    }
    await db.exec("update private.course_sources set title='Fonte da base corrigida' where source_id='analysis-source'");
    for (const id of ["a", "b"]) assert.equal(await state(db, "microsequence_explanation", id), "stale");
  } finally { await db.close(); }
});

test("alcance corrigido conserva texto, objetivo, dependências e fontes diretas como mudanças materiais", async () => {
  const db = await fixture();
  try {
    const reviewBoth = async suffix => {
      for (const id of ["a", "b"]) await set(db, "microsequence_explanation", id, true, `material-${suffix}-${id}`);
    };
    const assertBothStale = async () => {
      for (const id of ["a", "b"]) assert.equal(await state(db, "microsequence_explanation", id), "stale");
    };
    await reviewBoth("original");
    await db.query("update private.course_entities set content=jsonb_set(content,'{explanation}',$1) where entity_id='a'", [explanation("Texto materialmente alterado")]);
    await assertBothStale();
    await reviewBoth("text");
    await db.exec("update private.course_entities set content=jsonb_set(content,'{goal}','\"Objetivo alterado\"') where entity_id='a'");
    await assertBothStale();
    await reviewBoth("goal");
    await db.exec("update private.course_entities set content=jsonb_set(content,'{dependsOn}','[\"solo\"]') where entity_id='a'");
    await assertBothStale();
    await reviewBoth("dependency");
    await db.exec(`insert into private.course_source_attributions values('${COURSE}','40000000-0000-4000-8000-000000000003','microsequence_explanation','a');
      insert into private.course_sources(course_id,source_id,title) values('${COURSE}','base-source','Fonte da base');
      insert into private.course_source_attribution_sources values('${COURSE}','40000000-0000-4000-8000-000000000003','base-source','supports');
      insert into private.course_source_anchors values('${COURSE}','base-anchor','base-source','${"a".repeat(64)}','{"kind":"page_range","startPage":1,"endPage":1}');
      insert into private.course_source_attribution_anchors values('${COURSE}','40000000-0000-4000-8000-000000000003','base-anchor');`);
    await assertBothStale();
    await reviewBoth("source");
    await db.exec("update private.course_sources set title='Fonte corrigida' where source_id='base-source'");
    await assertBothStale();
    await reviewBoth("source-correction");
    await db.exec("update private.course_source_anchors set selector='{\"kind\":\"page_range\",\"startPage\":2,\"endPage\":2}' where anchor_id='base-anchor'");
    await assertBothStale();
  } finally { await db.close(); }
});

test("migração do alcance preserva marcas atuais e não atribui inspeção a rascunhos ou bases materialmente alteradas", async () => {
  const db = await fixture({ beforeEvidenceScope: true });
  const snapshot = async () => (await db.query("select entity_id,content,version,design_snapshot,design_application,applied_explanation_basis,content_review from private.course_entities order by entity_id")).rows;
  try {
    await addPlanItem(db, EVIDENCE, "evidence_requirement");
    await addPlanItem(db, ANALYSIS, "instructional_analysis_unit");
    for (const id of ["a", "b", "solo"]) await set(db, "microsequence_explanation", id, true, `before-scope-upgrade-${id}`);
    await db.query("update private.course_entities set applied_explanation_basis=$1 where entity_id='u1'", [{ basisHash: (await read(db, "microsequence_explanation", "a")).basisHash, entityVersion: 1 }]);
    for (const id of ["u1", "u3"]) await set(db, "study_unit", id, true, `unit-before-upgrade-${id}`);
    await db.query("update private.course_entities set content=jsonb_set(content,'{explanation}',$1),version=version+1 where entity_id='solo'", [explanation("Mudança material ainda não revisada")]);
    await db.query("update private.course_entities set content=$1,version=version+1 where entity_id='u3'", [unit("Unidade ainda não revisada")]);
    for (const id of ["recoverable", "draft"]) {
      await db.query("insert into private.course_entities(course_id,entity_type,entity_id,parent_id,parent_type,content) values($1,'microsequence',$2,'lesson','lesson',$3)",
        [COURSE, id, { title: id, goal: "Objetivo", dependsOn: [], explanation: explanation(id) }]);
    }
    await set(db, "microsequence_explanation", "recoverable", true, "review-before-practice-only");
    await db.query("insert into private.course_design_target_plan_items values($1,'recoverable',$2,'evidence_requirement')", [COURSE, EVIDENCE]);
    await db.query("insert into private.course_design_target_plan_items values($1,'recoverable',$2,'instructional_analysis_unit')", [COURSE, ANALYSIS]);
    assert.equal(await state(db, "microsequence_explanation", "recoverable"), "stale");
    const before = await snapshot();
    const courseBefore = await queryValue(db, "select to_jsonb(c) value from public.courses c where id=$1", [COURSE]);
    const receiptsBefore = (await db.query("select * from private.course_change_receipts order by request_id")).rows;
    await db.exec(await load(EVIDENCE_REVIEW_SCOPE_MIGRATION));
    for (const row of await snapshot()) {
      const previous = before.find(item => item.entity_id === row.entity_id);
      if (["a", "b"].includes(row.entity_id)) {
        assert.notEqual(row.content_review.basisHash, previous.content_review.basisHash);
        assert.deepEqual({ ...row, content_review: { ...row.content_review, basisHash: previous.content_review.basisHash } }, previous);
      } else assert.deepEqual(row, previous, `${row.entity_id}: a migração não altera outras marcas ou conteúdo`);
    }
    for (const [kind, id, expected] of [["microsequence_explanation", "a", "current"], ["microsequence_explanation", "b", "current"],
      ["microsequence_explanation", "solo", "stale"], ["microsequence_explanation", "draft", "draft"],
      ["microsequence_explanation", "legacy", "unregistered"], ["microsequence_explanation", "recoverable", "current"],
      ["study_unit", "u1", "current"], ["study_unit", "u2", "draft"], ["study_unit", "u3", "stale"]]) {
      assert.equal(await state(db, kind, id), expected, `${kind}/${id}`);
    }
    assert.deepEqual(await queryValue(db, "select to_jsonb(c) value from public.courses c where id=$1", [COURSE]), courseBefore);
    assert.deepEqual((await db.query("select * from private.course_change_receipts order by request_id")).rows, receiptsBefore);
    assert.equal(await queryValue(db, "select coalesce(current_setting('aralearn.content_review_write',true),'') value"), "");
    assert.equal(await queryValue(db, "select to_regclass('pg_temp.explanation_review_scope_current') is null value"), true);
    await assert.rejects(db.query("update private.course_entities set content_review='{}' where entity_id='a'"), code("42501"));
  } finally { await db.close(); }
});

test("falha ao preservar uma marca reverte função, metadados e guarda da migração inteira", async () => {
  const db = await fixture({ beforeEvidenceScope: true });
  const definition = () => queryValue(db, "select pg_get_functiondef('private.course_content_basis_hash_v1(uuid,text,text)'::regprocedure) value");
  const savedReview = () => queryValue(db, "select content_review value from private.course_entities where entity_id='a'");
  try {
    await addPlanItem(db, ANALYSIS, "instructional_analysis_unit");
    await set(db, "microsequence_explanation", "a", true, "review-before-failed-upgrade");
    const previousDefinition = await definition();
    const previousReview = await savedReview();
    await db.exec(`create function private.reject_review_upgrade() returns trigger language plpgsql as $$begin
      raise exception 'Falha sintética de preservação' using errcode='23514'; end$$;
      create trigger reject_review_upgrade before update of content_review on private.course_entities
        for each row execute function private.reject_review_upgrade();`);
    await assert.rejects(db.exec(await load(EVIDENCE_REVIEW_SCOPE_MIGRATION)), code("23514"));
    await db.exec("rollback");
    assert.equal(await definition(), previousDefinition);
    assert.deepEqual(await savedReview(), previousReview);
    assert.equal(await state(db, "microsequence_explanation", "a"), "current");
    assert.equal(await queryValue(db, "select coalesce(current_setting('aralearn.content_review_write',true),'') value"), "");
    assert.equal(await queryValue(db, "select to_regclass('pg_temp.explanation_review_scope_current') is null value"), true);
  } finally { await db.close(); }
});

test("migração e RPCs por objeto preservam dados, recusam concessão implícita e recuperam a mesma decisão", async () => {
  const db = await fixture();
  try {
    const a = normalizeCourseContentReview(await read(db, "microsequence_explanation", "a"));
    assert.equal(a.contentReview.state, "draft");
    assert.equal(await queryValue(db, "select content_review#>>'{legacyMicrosequenceReview,approvedBy}' value from private.course_entities where entity_id='a'"), OWNER);
    assert.equal(await queryValue(db, "select visibility value from public.courses where id=$1", [COURSE]), "private");
    const solo = await set(db, "microsequence_explanation", "solo", true, "review-solo-0001");
    assert.equal(solo.contentReview.state, "current");
    assert.equal(await queryValue(db, "select count(*)::integer value from private.course_entities where parent_id='solo'"), 0);
    const approved = normalizeCourseContentReviewChange(await set(db, "microsequence_explanation", "a", true, "review-base-0001"));
    assert.equal(approved.contentReview.state, "current");
    assert.equal(await state(db, "study_unit", "u1"), "draft");
    await set(db, "study_unit", "u1", true, "review-unit-0001");
    const before = await read(db, "study_unit", "u1");
    await db.query("update private.course_entities set content=$1,version=version+1 where entity_id='u1'", [unit("Texto editado")]);
    assert.equal(await state(db, "study_unit", "u1"), "stale");
    assert.equal(await state(db, "microsequence_explanation", "a"), "current");
    const replay = await set(db, "study_unit", "u1", true, "review-unit-0001", before.basisHash);
    assert.equal(replay.idempotent, true); assert.equal(replay.contentReview.state, "current");
    assert.equal(await state(db, "study_unit", "u1"), "stale");
    await assert.rejects(set(db, "study_unit", "u1", true, "review-old-basis", before.basisHash), code("PT409"));
    await assert.rejects(set(db, "study_unit", "u1", false, "review-unit-0001"), code("23514"));
    assert.equal((await set(db, "study_unit", "u1", false, "withdraw-unit-001")).contentReview.state, "draft");
    await assert.rejects(db.query("update private.course_entities set content_review='{}' where entity_id='a'"), code("42501"));
    await assert.rejects(read(db, "study_unit", "u1", READER), code("42501"));
    await assert.rejects(read(db, "study_unit", "u1", OTHER), code("PT404"));
    await assert.rejects(read(db, "course", "a"), code("22023"));
    assert.equal(await queryValue(db, "select to_regprocedure('public.approve_course_microsequence_content_v1(uuid,text,text,text)') is null value"), true);
  } finally { await db.close(); }
});

test("fontes e bases invalidam apenas relações pertinentes; intenção e revisão de irmãos não mudam o aplicado", async () => {
  const db = await fixture();
  try {
    for (const id of ["u1", "u2", "u3"]) await set(db, "study_unit", id, true, `review-${id}-original`);
    await set(db, "microsequence_explanation", "a", true, "review-a-original");
    const before = await read(db, "study_unit", "u1");
    await db.exec("update private.course_entities set content=content||'{\"explanationPlan\":{\"purpose\":\"Outra produção\",\"prerequisites\":[],\"relations\":[],\"sourceIds\":[]}}'::jsonb where entity_id='a'");
    assert.equal((await read(db, "study_unit", "u1")).basisHash, before.basisHash);
    await db.query("update private.course_entities set content=jsonb_set(content,'{explanation}',$1) where entity_id='a'", [explanation("Base A alterada")]);
    for (const id of ["u1", "u2", "u3"]) assert.equal(await state(db, "study_unit", id), "stale");
    for (const id of ["u1", "u2", "u3"]) await set(db, "study_unit", id, true, `review-${id}-changed`);
    await db.exec(`insert into private.course_source_attributions values('${COURSE}','40000000-0000-4000-8000-000000000001','study_unit','u1');
      insert into private.course_sources(course_id,source_id,title) values('${COURSE}','source','Fonte original');
      insert into private.course_source_attribution_sources values('${COURSE}','40000000-0000-4000-8000-000000000001','source','supports');`);
    assert.equal(await state(db, "study_unit", "u1"), "stale");
    assert.equal(await state(db, "study_unit", "u2"), "current");
    assert.equal(await state(db, "study_unit", "u3"), "current");
    await set(db, "study_unit", "u1", true, "review-u1-sourced");
    await db.exec("update private.course_sources set title='Fonte corrigida',revision=revision+1");
    assert.equal(await state(db, "study_unit", "u1"), "stale");
    assert.equal(await state(db, "study_unit", "u2"), "current");
  } finally { await db.close(); }
});

test("acesso salvo, política opcional e cópia preservam direitos sem herdar inspeção", async () => {
  const db = await fixture();
  try {
    assert.equal(await readable(db, READER, "study_unit", "u1"), true);
    assert.equal(await readable(db, OTHER, "study_unit", "u1"), false);
    assert.equal(await readable(db, null, "study_unit", "u1"), false);
    await db.exec(`update public.courses set visibility='public' where id='${COURSE}'`);
    assert.equal(await readable(db, null, "study_unit", "u1"), true);
    assert.equal(await readable(db, null, "microsequence", "legacy"), true);
    const policy = await queryValue(db, "select public.set_course_content_review_policy_for_actor_v1($1,$2,1,'reviewed_only','policy-reviewed-001') value", [OWNER, COURSE]);
    assert.equal(policy.reviewPolicy, "reviewed_only");
    assert.equal(await readable(db, null, "study_unit", "u1"), false);
    assert.equal(await readable(db, OWNER, "study_unit", "u1"), true);
    await set(db, "study_unit", "u1", true, "review-public-unit");
    assert.equal(await readable(db, null, "study_unit", "u1"), true);
    assert.equal(await readable(db, null, "study_unit", "u2"), false);
    assert.equal(await readable(db, null, "microsequence", "a"), false);
    await db.exec(`insert into private.course_entities(course_id,entity_type,entity_id,parent_id,parent_type,content,version,design_snapshot,design_application)
      select '${COPY}',entity_type,entity_id,parent_id,parent_type,content,version,design_snapshot,design_application
      from private.course_entities where course_id='${COURSE}';`);
    assert.equal(await queryValue(db, "select bool_and(content_review='{}'::jsonb) value from private.course_entities where course_id=$1", [COPY]), true);
    assert.equal(await queryValue(db, "select visibility value from public.courses where id=$1", [COPY]), "private");
    await db.query("update private.course_entities set content=$1 where course_id=$2 and entity_id='u2'", [{ ...unit(""), content: [] }, COURSE]);
    await assert.rejects(set(db, "study_unit", "u2", true, "review-incomplete"), code("23514"));
  } finally { await db.close(); }
});

test("entry points separam sessão do aplicativo e ator autenticado pelos canais", async () => {
  const db = await fixture();
  try {
    assert.equal(await queryValue(db, "select has_function_privilege('authenticated','public.set_course_content_review_for_actor_v1(uuid,uuid,text,text,text,boolean,text)','execute') value"), false);
    assert.equal(await queryValue(db, "select has_function_privilege('anon','public.set_course_content_review_v1(uuid,text,text,text,boolean,text)','execute') value"), false);
    await db.query("select set_config('fixture.actor',$1,false),set_config('fixture.jwt',$2,false)", [OWNER, JSON.stringify({ role: "authenticated", session_id: SESSION })]);
    const appRead = await queryValue(db, "select public.get_course_content_review_v1($1,'microsequence_explanation','a') value", [COURSE]);
    assert.equal(appRead.targetId, "a");
    await assert.rejects(read(db, "study_unit", "u1"), code("42501"));
    await db.query("select set_config('fixture.jwt',$1,false)", [JSON.stringify({ role: "authenticated", session_id: SESSION, client_id: "oauth-client" })]);
    await assert.rejects(queryValue(db, "select public.get_course_content_review_v1($1,'microsequence_explanation','a') value", [COURSE]), code("42501"));
    await db.query("select set_config('fixture.jwt',$1,false)", [JSON.stringify({ role: "service_role" })]);
    assert.equal((await set(db, "study_unit", "u1", true, "explicit-channel-review")).contentReview.state, "current");
  } finally { await db.close(); }
});

test("completude usa catálogo vigente e envelope salvo sem dependência dos validadores de auditoria removidos", async () => {
  const db = await fixture();
  try {
    assert.equal(await queryValue(db, "select to_regprocedure('private.valid_course_audit_study_unit_content_v1(jsonb)') is null value"), true);
    assert.equal(await queryValue(db, "select to_regprocedure('private.valid_course_audit_resource_instance_v1(jsonb,text)') is null value"), true);
    const complete = () => queryValue(db, "select private.course_content_complete_v1($1,'study_unit','u1') value", [COURSE]);
    const save = content => db.query("update private.course_entities set content=$1 where course_id=$2 and entity_id='u1'", [content, COURSE]);
    assert.equal(await complete(), true);
    await save({ ...unit("Conteúdo com retorno"), feedback: [{ ...block("Retorno da prática."), id: "feedback" }] });
    assert.equal(await complete(), true, "Parágrafo no slot feedback é recurso vigente");
    const practice = { ...unit("Prática"), role: "practice", content: [], response: {
      id: "response", package: "aralearn.response.open", version: "1.0.0", data: { prompt: "Explique a relação." }
    } };
    await save(practice);
    assert.equal(await complete(), true);
    assert.equal((await set(db, "study_unit", "u1", true, "review-practice-complete")).contentReview.state, "current");
    for (const invalid of [{ ...unit("Base"), content: [] }, { ...practice, response: null },
      { ...unit("Base"), role: null }, { ...unit("Base"), content: "partial" },
      { ...unit("Base"), topics: ["tema", "tema"] }, { ...unit("Base"), title: " " },
      { ...unit("Base"), content: [{ ...block("Texto"), package: "aralearn.resource.missing" }] },
      { ...unit("Base"), content: [{ ...block("Texto"), version: "99.0.0" }] },
      { ...unit("Base"), content: [{ ...block("Texto"), data: null }] },
      { ...unit("Base"), content: [{ ...block("Texto"), secret: OWNER }] },
      { ...practice, content: [{ ...block("Texto"), id: "response" }] },
      { ...unit("Base"), content: [practice.response] }]) {
      await save(invalid);
      assert.equal(await complete(), false, JSON.stringify(invalid));
      await assert.rejects(set(db, "study_unit", "u1", true, "review-incomplete-envelope"), code("23514"));
    }
  } finally { await db.close(); }
});
