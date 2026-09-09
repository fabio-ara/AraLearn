import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { APPLIED_EXPLANATION_BASIS_CONTRACT, normalizeAppliedExplanationBasis } from "../../src/domain/appliedExplanationBasis.js";

const ACTOR = "10000000-0000-4000-8000-000000000001";
const COURSE = "20000000-0000-4000-8000-000000000001";
const migrations = new URL("../../supabase/migrations/", import.meta.url);
const load = name => fs.readFile(new URL(name, migrations), "utf8");
const value = async (db, sql, args = []) => (await db.query(sql, args)).rows[0].value;
const code = expected => error => error.code === expected;
const explanation = text => ({ title: "Base", content: [{ id: "p", package: "aralearn.resource.paragraph", version: "1.0.0", data: { text } }] });
const units = [{ studyUnitId: "u1", didacticMicrosequenceId: "m1" }];
function functionSql(source, name) {
  const match = new RegExp(`create(?: or replace)? function ${name.replaceAll(".", "\\.")}\\(`, "iu").exec(source);
  assert.ok(match, `Função precursora ${name}`);
  const body = source.slice(match.index);
  const end = /\$function\$\s*;/u.exec(body);
  assert.ok(end, `Fechamento de ${name}`);
  return body.slice(0, end.index + end[0].length);
}

async function installRealComposition(db) {
  await db.exec(`
    create schema auth; create schema extensions;
    create table auth.users(id uuid primary key,deleted_at timestamptz,is_anonymous boolean default false,banned_until timestamptz);
    create table public.person_profiles(user_id uuid primary key);
    create table public.course_access(course_id uuid,user_id uuid,can_copy boolean default false);
    alter table public.courses add column owner_id uuid default '${ACTOR}',add column title text default 'Curso',
      add column goal text default 'Objetivo',add column visibility text default 'private',add column updated_at timestamptz default now(),
      add column content_review_policy text default 'saved';
    alter table private.course_entities add column created_at timestamptz default now();
    alter table private.course_source_attributions add column fixture_links jsonb;
    create table private.course_change_receipts(actor_id uuid,request_id text,operation text,course_id uuid,request_hash text,result jsonb,
      expires_at timestamptz default now()+interval '14 days',primary key(actor_id,request_id),
      check(jsonb_typeof(result)='object' and pg_column_size(result)<=65536));
    create function extensions.digest(bytea,text) returns bytea language sql immutable as $$select sha256($1)$$;
    create function private.valid_course_source_links_shape_v2(jsonb) returns boolean language sql immutable as $$select jsonb_typeof($1)='array'$$;
    create function private.assert_course_source_target_citation_budget_v1(uuid,text,text) returns void language sql as $$select$$;
    create function private.course_source_target_state_v1(p_course uuid,p_kind text,p_id text) returns jsonb language sql stable as $$
      select jsonb_build_object('version',version,'hash',private.course_source_json_hash_v1(content)) from private.course_entities
      where course_id=p_course and entity_id=p_id and entity_type=case when p_kind='microsequence_explanation' then 'microsequence' else p_kind end$$;
    create or replace function private.course_source_links_v1(p_course_id uuid,p_id uuid) returns jsonb language sql stable as $$
      select coalesce(a.fixture_links,(select coalesce(jsonb_agg(jsonb_build_object('sourceId',source_id,'relation',relation) order by source_id),'[]')
        from private.course_source_attribution_sources where course_id=p_course_id and attribution_id=p_id))
      from private.course_source_attributions a where a.course_id=p_course_id and a.id=p_id$$;
    create or replace function private.apply_course_source_attribution_v2(p_course uuid,p_kind text,p_id text,p_version bigint,p_links jsonb)
    returns jsonb language plpgsql as $$declare v_id uuid; begin
      select id into v_id from private.course_source_attributions where course_id=p_course and target_kind=p_kind and target_id=p_id;
      if v_id is null then v_id:=gen_random_uuid(); insert into private.course_source_attributions(course_id,id,target_kind,target_id) values(p_course,v_id,p_kind,p_id); end if;
      if private.course_source_links_v1(p_course,v_id)=p_links then return '{"changed":false}'::jsonb; end if;
      update private.course_source_attributions set fixture_links=p_links where course_id=p_course and id=v_id;
      delete from private.course_source_attribution_sources where course_id=p_course and attribution_id=v_id;
      insert into private.course_source_attribution_sources select p_course,v_id,value->>'sourceId',value->>'relation' from jsonb_array_elements(p_links);
      return '{"changed":true}'::jsonb; end$$;
    create function private.apply_course_source_attribution_v2(uuid,text,text,bigint,jsonb,text) returns jsonb language sql as $$
      select private.apply_course_source_attribution_v2($1,$2,$3,$4,$5)$$;
    insert into auth.users(id) values('${ACTOR}'); insert into public.person_profiles values('${ACTOR}');
  `);
  for (const [migration, name] of [
    ["20260905062817_public_course_access_and_identity.sql", "private.course_ownership_v1"],
    ["20260817140000_course_identity_cutover.sql", "private.require_course_access_v1"],
    ["20260903160000_global_curriculum_authoring_flow.sql", "private.assert_course_lesson_dependencies_v1"],
    ["20260902044404_cut_legacy_authoring_runtime.sql", "private.commit_course_composition_core_v1"]
  ]) await db.exec(functionSql(await load(migration), name));
  // Blocos SQL correntes que transformam o core: metadados atômicos e
  // preservação do desenho. Não substituímos a escrita por um simulador.
  const metadata = (await load("20260905070507_atomic_course_metadata_and_public_citations.sql")).replaceAll("\r\n", "\n");
  const start = metadata.indexOf("do $migration$");
  const end = metadata.indexOf("  execute v_definition;", start) + "  execute v_definition;".length;
  await db.exec(metadata.slice(start, end) + "\nend $migration$;");
  const design = await load("20260905094109_preserve_applied_design_on_focal_edits.sql");
  await db.exec(design.slice(design.indexOf("do $core$"), design.indexOf("end $core$;") + "end $core$;".length));
  await db.exec(functionSql(await load("20260905101903_contextual_course_sources.sql"), "public.commit_course_composition_for_actor_v1"));
  const explanationSql = await load("20260907222912_shared_explanations_human_content_review.sql");
  await db.exec(functionSql(explanationSql, "private.valid_course_composition_source_applications_v1"));
  await db.exec(functionSql(explanationSql, "private.valid_course_explanation_plan_v1"));
  await db.exec(explanationSql.slice(explanationSql.indexOf("do $composition$"), explanationSql.indexOf("end $composition$;") + "end $composition$;".length));
  const review = await load("20260909025232_contextual_content_review_access.sql");
  for (const name of ["private.mark_course_content_review_v1", "private.course_content_review_payload_v1", "private.set_course_content_review_v1"]) {
    await db.exec(functionSql(review, name));
  }
  await db.exec("create trigger course_content_review_guard before insert or update on private.course_entities for each row execute function private.mark_course_content_review_v1()");
}

// Migração completa e funções reais de hash, revisão, completude e gravação de
// Explicação. Os escritores externos e a atribuição de fontes são fixtures
// transacionais mínimas: esta prova não representa auth, PostgREST ou a stack.
async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema private;
    create table public.courses(id uuid primary key,revision bigint default 1,copy_origin jsonb);
    create table private.course_entities(course_id uuid,entity_type text,entity_id text,parent_id text,parent_type text,
      position integer default 1,content jsonb not null,version bigint default 1,design_snapshot jsonb,design_application jsonb,
      content_review jsonb,updated_at timestamptz,primary key(course_id,entity_type,entity_id));
    create table private.course_design_target_plan_items(course_id uuid,didactic_microsequence_id text,plan_item_id uuid);
    create table private.course_instructional_plan_items(course_id uuid,id uuid,item_kind text,statement text,description text);
    create table private.course_source_attributions(course_id uuid,id uuid,target_kind text,target_id text);
    create table private.course_source_attribution_sources(course_id uuid,attribution_id uuid,source_id text,relation text);
    create table private.course_source_attribution_anchors(course_id uuid,attribution_id uuid,anchor_id text);
    create table private.course_sources(course_id uuid,source_id text,title text,status text default 'active',revision bigint default 1);
    create table private.course_source_anchors(course_id uuid,anchor_id text,source_id text,content_hash text,selector jsonb);
    create table private.course_source_attachments(course_id uuid,source_id text,content_hash text,status text,public_file_access text);
    create table private.course_media(course_id uuid,content_hash text,status text,byte_size bigint,media_type text);
    create table private.fixture_receipts(course_id uuid,request_id text,result jsonb,primary key(course_id,request_id));
    create function private.require_service_role() returns void language plpgsql as $$begin
      if current_setting('fixture.role',true) is distinct from 'service_role' then
        raise exception 'service role required' using errcode='42501'; end if; end$$;
    create function private.course_source_json_hash_v1(jsonb) returns text language sql immutable
      as $$select encode(sha256(convert_to($1::text,'UTF8')),'hex')$$;
    create function private.valid_course_component_refs_in_content_v1(jsonb) returns boolean language sql immutable as $$select true$$;
    create function private.valid_course_audit_resource_instance_v1(jsonb,text) returns boolean language sql immutable as $$select true$$;
    create function private.course_component_catalog_v1() returns jsonb language sql immutable
      as $$select '{"options":[{"ref":"aralearn.resource.paragraph@1.0.0"}]}'::jsonb$$;
    create function private.course_source_links_v1(p_course_id uuid,p_id uuid) returns jsonb language sql stable as $$
      select coalesce(jsonb_agg(jsonb_build_object('sourceId',source_id,'relation',relation) order by source_id),'[]')
      from private.course_source_attribution_sources where course_id=p_course_id and attribution_id=p_id$$;
    create function private.apply_course_source_attribution_v2(p_course uuid,p_kind text,p_id text,p_version bigint,p_links jsonb)
    returns jsonb language plpgsql as $$declare v_id uuid; begin
      select id into v_id from private.course_source_attributions where course_id=p_course and target_kind=p_kind and target_id=p_id;
      if v_id is null then v_id:=gen_random_uuid();
        insert into private.course_source_attributions values(p_course,v_id,p_kind,p_id); end if;
      if private.course_source_links_v1(p_course,v_id)=p_links then return '{"changed":false}'::jsonb; end if;
      delete from private.course_source_attribution_sources where course_id=p_course and attribution_id=v_id;
      insert into private.course_source_attribution_sources select p_course,v_id,value->>'sourceId',value->>'relation' from jsonb_array_elements(p_links);
      return '{"changed":true}'::jsonb; end$$;
    create function public.materialize_course_authoring_part_for_actor_v2(p_actor_id uuid,p_course_id uuid,p_part_id uuid,
      p_expected_revision bigint,p_expected_part_revision bigint,p_plan_item_upserts jsonb,p_target_plan_items jsonb,p_units jsonb,
      p_request_id text,p_request_hash text,p_explanations jsonb) returns jsonb language plpgsql as $$
    declare v_result jsonb; v_extra_changed boolean; v_plan_changed boolean:=false; v_application_extension_changed boolean:=false;
    begin
      perform private.require_service_role();
      select result into v_result from private.fixture_receipts where course_id=p_course_id and request_id=p_request_id;
      if found then return v_result||'{"idempotent":true}'::jsonb; end if;
      v_extra_changed:=private.save_course_part_explanations_v1(p_course_id,p_units,p_explanations) or v_plan_changed or v_application_extension_changed;
      if v_extra_changed then update public.courses set revision=revision+1 where id=p_course_id; end if;
      v_result:=jsonb_build_object('changed',v_extra_changed,'idempotent',false,'revision',(select revision from public.courses where id=p_course_id));
      insert into private.fixture_receipts values(p_course_id,p_request_id,v_result);
      return v_result;
    end$$;
    create function public.copy_course_for_actor_v1(p_actor_id uuid,p_source_course_id uuid,p_expected_source_revision bigint,
      p_title text,p_include_media boolean,p_request_id text,p_copy_until timestamptz) returns jsonb language plpgsql as $$
    declare v_id uuid:=gen_random_uuid(); v_result jsonb;
    begin
      perform private.require_service_role();
      insert into public.courses(id,copy_origin) values(v_id,jsonb_build_object('sourceCourseId',p_source_course_id));
      insert into private.course_entities(course_id,entity_type,entity_id,parent_id,parent_type,content,version,design_snapshot,design_application)
        select v_id,entity_type,entity_id,parent_id,parent_type,content,version,design_snapshot,design_application
        from private.course_entities where course_id=p_source_course_id;
      insert into private.course_sources select v_id,source_id,title,status,revision from private.course_sources where course_id=p_source_course_id;
      insert into private.course_source_attributions select v_id,id,target_kind,target_id from private.course_source_attributions where course_id=p_source_course_id;
      insert into private.course_source_attribution_sources select v_id,attribution_id,source_id,relation from private.course_source_attribution_sources where course_id=p_source_course_id;
      v_result:=jsonb_build_object('contract','aralearn.course-copy.v1','sourceCourseId',p_source_course_id,'sourceCourseRevision',p_expected_source_revision,
        'courseId',v_id);
      return v_result;
    end$$;
    create function private.list_course_entities_for_actor_v1(p_actor_id uuid,p_course_id uuid,p_revision bigint,p_limit integer,p_type text,p_id text)
    returns jsonb language sql stable as $$select jsonb_build_object('version', page.version,'content',page.content)
      from private.course_entities page where page.course_id=p_course_id and page.entity_id=p_id$$;
    insert into public.courses(id) values('${COURSE}');
    insert into private.course_sources(course_id,source_id,title) values('${COURSE}','source-1','Fonte A');
  `);
  const old = await load("20260907222912_shared_explanations_human_content_review.sql");
  for (const name of ["private.course_content_media_hashes_v1", "private.valid_course_explanation_v1", "private.save_course_part_explanations_v1"]) {
    await db.exec(functionSql(old, name));
  }
  await db.exec(functionSql(await load("20260817210000_course_audit_corrections.sql"), "private.valid_course_audit_study_unit_content_v1"));
  const review = await load("20260909025232_contextual_content_review_access.sql");
  for (const name of ["private.course_content_basis_hash_v1", "private.course_content_review_v1", "private.course_content_complete_v1"]) {
    await db.exec(functionSql(review, name));
  }
  await db.query("insert into private.course_entities(course_id,entity_type,entity_id,parent_id,parent_type,content) values($1,'microsequence','m1','lesson-1','lesson',$2),($1,'study_unit','u1','m1','microsequence',$3)",
    [COURSE, { goal: "Objetivo", dependsOn: [], explanation: explanation("Base inicial") }, { title: "Unidade", content: [] }]);
  await db.exec(await load("20260909030823_contextual_applied_explanation_basis.sql"));
  await db.exec("select set_config('fixture.role','service_role',false)");
  return db;
}
const snapshot = (db, course = COURSE) => value(db, "select applied_explanation_basis value from private.course_entities where course_id=$1 and entity_id='u1'", [course]);
const hash = (db, kind = "microsequence_explanation", id = "m1", course = COURSE) => value(db, "select private.course_content_basis_hash_v1($1,$2,$3) value", [course, kind, id]);
const materialize = (db, request, content, links, course = COURSE, selectedUnits = units) => value(db,
  "select public.materialize_course_authoring_part_for_actor_v2($1,$2,null,1,1,'[]','[]',$3,$4,'fixture',$5) value",
  [ACTOR, course, selectedUnits, request, [{ microsequenceId: "m1", content, ...(links ? { sourceLinks: links } : {}) }]]);
const copy = async (db, course = COURSE) => (await value(db, "select public.copy_course_for_actor_v1($1,$2,1,'Cópia',true,'fixture',now()) value", [ACTOR, course])).courseId;

test("captura atômica usa texto e fontes salvos, conserva histórico e só reaplica por produção expressa", async () => {
  const db = await fixture();
  try {
    assert.equal(await snapshot(db), null);
    const before = await hash(db);
    const result = await materialize(db, "produce-1", explanation("Base salva"), [{ sourceId: "source-1", relation: "supports" }]);
    assert.equal(result.changed, true);
    const original = normalizeAppliedExplanationBasis(await snapshot(db));
    assert.deepEqual(original, { contract: APPLIED_EXPLANATION_BASIS_CONTRACT, microsequenceId: "m1", basisHash: await hash(db), entityVersion: 2 });
    assert.notEqual(original.basisHash, before);
    assert.equal(await value(db, "select content_review value from private.course_entities where entity_id='u1'"), null);
    const projected = await value(db, "select private.list_course_entities_for_actor_v1($1,$2,1,1,'study_unit','u1') value", [ACTOR, COURSE]);
    assert.deepEqual(projected.appliedExplanationBasis, original);
    assert.equal(Object.hasOwn(projected.content, "appliedExplanationBasis"), false);
    await db.exec("update private.course_entities set content=content||'{\"title\":\"Edição humana\"}'::jsonb,version=version+1 where entity_id='u1'");
    assert.deepEqual(await snapshot(db), original);
    await db.exec("update private.course_sources set title='Fonte corrigida',revision=revision+1");
    assert.notEqual(await hash(db), original.basisHash);
    assert.deepEqual(await snapshot(db), original);
    const replay = await materialize(db, "produce-1", explanation("Base salva"));
    assert.equal(replay.idempotent, true);
    assert.deepEqual(await snapshot(db), original);
    const unitHashBefore = await hash(db, "study_unit", "u1");
    const baseHashBefore = await hash(db);
    const reapplied = await materialize(db, "produce-2", explanation("Base salva"));
    assert.equal(reapplied.changed, true);
    assert.equal(reapplied.revision, result.revision + 1);
    assert.equal((await snapshot(db)).basisHash, baseHashBefore);
    assert.equal(await hash(db), baseHashBefore);
    assert.notEqual(await hash(db, "study_unit", "u1"), unitHashBefore);
    assert.equal((await materialize(db, "produce-3", explanation("Base salva"))).changed, false);
    const final = await snapshot(db);
    await db.query("update private.course_entities set content=jsonb_set(content,'{explanation}',$1),version=version+1 where entity_id='m1'", [explanation("Base posterior")]);
    assert.deepEqual(await snapshot(db), final);
    assert.notEqual(await hash(db), final.basisHash);
  } finally { await db.close(); }
});

test("cópia conserva origem da aplicação e nova produção substitui o snapshot no destino", async () => {
  const db = await fixture();
  try {
    await materialize(db, "produce-original", explanation("Base original"), [{ sourceId: "source-1", relation: "supports" }]);
    const original = await snapshot(db);
    assert.equal(await value(db, "select private.valid_applied_explanation_basis_v1($1) value", [original]), true);
    for (const invalid of [1, "invalid", [], {}, { ...original, entityVersion: "bad" },
      { ...original, entityVersion: -1 }, { ...original, sourceCourseId: null }, { ...original, reviewed: true }]) {
      assert.equal(await value(db, "select private.valid_applied_explanation_basis_v1($1::jsonb) value", [JSON.stringify(invalid)]), false);
    }
    await db.exec("update private.course_entities set content_review=jsonb_build_object('basisHash',private.course_content_basis_hash_v1(course_id,'study_unit',entity_id)) where entity_id='u1'");
    const first = await copy(db);
    assert.deepEqual(await snapshot(db, first), { ...original, sourceCourseId: COURSE });
    assert.equal(await value(db, "select content_review value from private.course_entities where course_id=$1 and entity_id='u1'", [first]), null);
    const second = await copy(db, first);
    assert.deepEqual(await snapshot(db, second), { ...original, sourceCourseId: COURSE });
    await materialize(db, "produce-copy", explanation("Base no destino"), undefined, first);
    const reapplied = await snapshot(db, first);
    assert.equal(Object.hasOwn(reapplied, "sourceCourseId"), false);
    assert.equal(reapplied.basisHash, await hash(db, "microsequence_explanation", "m1", first));
    assert.notEqual(reapplied.basisHash, original.basisHash);
    assert.deepEqual(await snapshot(db), original);
    assert.deepEqual(await snapshot(db, second), { ...original, sourceCourseId: COURSE });
  } finally { await db.close(); }
});

test("erro após salvar a base reverte a transação; importação e edição não fabricam aplicação", async () => {
  const db = await fixture();
  try {
    const before = await hash(db);
    await assert.rejects(materialize(db, "invalid-parent", explanation("Não deve persistir"), undefined, COURSE,
      [{ studyUnitId: "missing", didacticMicrosequenceId: "m1" }]), code("23514"));
    assert.equal(await hash(db), before);
    assert.equal(await snapshot(db), null);
    assert.equal(await value(db, "select count(*)::integer value from private.fixture_receipts"), 0);
    await materialize(db, "valid", explanation("Base aplicada"));
    const original = await snapshot(db);
    await assert.rejects(db.query("update private.course_entities set applied_explanation_basis=null where entity_id='u1'"), code("42501"));
    await assert.rejects(db.query("insert into private.course_entities(course_id,entity_type,entity_id,content,applied_explanation_basis) values($1,'study_unit','import','{}',$2)", [COURSE, original]), code("42501"));
    await assert.rejects(db.query("update private.course_entities set content=content||jsonb_build_object('appliedExplanationBasis',$1::jsonb) where entity_id='u1'", [original]), code("42501"));
    assert.deepEqual(await snapshot(db), original);
    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const fn of ["private.capture_course_applied_explanation_basis_v1(uuid,jsonb)", "private.copy_course_applied_explanation_basis_v1(uuid,uuid)"]) {
        assert.equal(await value(db, "select has_function_privilege($1,$2,'EXECUTE') value", [role, fn]), false);
      }
    }
    assert.equal(await value(db, "select coalesce(current_setting('aralearn.applied_explanation_basis_write',true),'') value"), "");
    await db.exec("select set_config('fixture.role','authenticated',false)");
    await assert.rejects(db.query("select private.capture_course_applied_explanation_basis_v1($1,$2)", [COURSE, units]), code("42501"));
  } finally { await db.close(); }
});

test("writer de composição salva e revisa base sem unidades; produção posterior reutiliza e captura sem regravar base ou fontes", async () => {
  const db = await fixture();
  try {
    await installRealComposition(db);
    await db.exec(`
      delete from private.course_entities where entity_type='study_unit';
      insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content) values
        ('${COURSE}','module','module-1',null,null,0,'{"title":"Módulo","goal":"Objetivo"}'),
        ('${COURSE}','lesson','lesson-1','module','module-1',0,'{"title":"Lição","goal":"Objetivo"}');
      update private.course_entities set position=0,content=(content-'explanation')||'{"title":"Microssequência"}' where entity_id='m1';
    `);
    const base = explanation("Explicação completa salva antes de produzir unidades. Relação: base → episódios instrucionais.");
    const links = [{ linkId: "base-link", sourceId: "source-1", relation: "supported_by", roles: ["technical_conceptual"],
      anchors: [], occurrences: [{ occurrenceId: "base-occurrence", slot: "content", resourceId: "p", path: "text", quote: "base → episódios instrucionais", prefix: null, suffix: null }] }];
    const oldContent = await value(db, "select content value from private.course_entities where entity_id='m1'");
    const upsert = { entityType: "microsequence", entityId: "m1", parentType: "lesson", parentId: "lesson-1", position: 0,
      content: { ...oldContent, explanation: base } };
    const saveBase = async (text, expected = 1, request = "base-before-units-001") => value(db,
      "select public.commit_course_composition_for_actor_v1($1,$2,$3,$4,'[]',$5,$6,null) value", [ACTOR, COURSE, expected,
        [{ ...upsert, content: { ...upsert.content, explanation: text } }], [{ targetKind: "microsequence_explanation", targetId: "m1", sourceLinks: links }], request]);
    const saved = await saveBase(base);
    assert.equal(saved.updatedCount, 1);
    assert.equal(await value(db, "select count(*)::integer value from private.course_entities where entity_type='study_unit'"), 0);
    assert.deepEqual(await value(db, "select content->'explanation' value from private.course_entities where entity_id='m1'"), base);
    assert.deepEqual(await value(db, "select private.course_source_links_v1(course_id,id) value from private.course_source_attributions where target_kind='microsequence_explanation'"), links);
    assert.equal(await value(db, "select private.course_content_review_v1($1,'microsequence_explanation','m1')->>'state' value", [COURSE]), "unregistered");
    const reviewed = await value(db, "select private.set_course_content_review_v1($1,$2,'microsequence_explanation','m1',$3,true,'base-review-before-units') value", [ACTOR, COURSE, await hash(db)]);
    assert.equal(reviewed.contentReview.state, "current");
    const baseBefore = await value(db, "select to_jsonb(e) value from private.course_entities e where entity_id='m1'");
    const sourcesBefore = await value(db, "select jsonb_agg(to_jsonb(a) order by id) value from private.course_source_attributions a");
    await db.query("insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content) values($1,'study_unit','u1','microsequence','m1',1,$2)", [COURSE,
      { title: "Unidade posterior", role: "theory", content: [{ id: "unit-body", package: "aralearn.resource.paragraph", version: "1.0.0", data: { text: "Episódio produzido a partir da base salva." } }], response: null, feedback: [], topics: [] }]);
    await materialize(db, "produce-after-saved-base", base, links);
    assert.deepEqual(await value(db, "select to_jsonb(e) value from private.course_entities e where entity_id='m1'"), baseBefore);
    assert.deepEqual(await value(db, "select jsonb_agg(to_jsonb(a) order by id) value from private.course_source_attributions a"), sourcesBefore);
    assert.deepEqual(await snapshot(db), { contract: APPLIED_EXPLANATION_BASIS_CONTRACT, microsequenceId: "m1", basisHash: await hash(db), entityVersion: baseBefore.version });
    assert.equal(await value(db, "select private.course_content_review_v1($1,'study_unit','u1')->>'state' value", [COURSE]), "draft");
    assert.equal(await value(db, "select private.course_content_review_v1($1,'microsequence_explanation','m1')->>'state' value", [COURSE]), "current");
    const nextRevision = await value(db, "select revision value from public.courses where id=$1", [COURSE]);
    await assert.rejects(saveBase({ title: "Inválida", content: [] }, nextRevision, "invalid-base-after-save"), code("22023"));
    assert.deepEqual(await value(db, "select to_jsonb(e) value from private.course_entities e where entity_id='m1'"), baseBefore);
    assert.equal((await saveBase(base)).idempotent, true);
    assert.deepEqual(await snapshot(db), { contract: APPLIED_EXPLANATION_BASIS_CONTRACT, microsequenceId: "m1", basisHash: await hash(db), entityVersion: baseBefore.version });
  } finally { await db.close(); }
});
