import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const OWNER = "10000000-0000-4000-8000-000000000001";
const OTHER = "10000000-0000-4000-8000-000000000002";
const COURSE = "20000000-0000-4000-8000-000000000001";
const SCOPE = "30000000-0000-4000-8000-000000000001";
const migrations = new URL("../../supabase/migrations/", import.meta.url);
const load = async name => (await fs.readFile(new URL(name, migrations), "utf8")).replaceAll("\r\n", "\n");
function functionSql(source, name) {
  const start = new RegExp(`create(?: or replace)? function ${name.replaceAll(".", "\\.")}\\(`, "u").exec(source)?.index;
  assert.notEqual(start, undefined, name);
  const delimiter = /\bas\s+(\$[a-z_]*\$)/iu.exec(source.slice(start))?.[1];
  assert.ok(delimiter, name);
  return source.slice(start, source.indexOf(`${delimiter};`, start) + delimiter.length + 1);
}
const value = async (db, sql, args = []) => (await db.query(sql, args)).rows[0].value;
const code = expected => error => error.code === expected;
const micro = (id = "micro-a", position = 0) => ({
  microsequenceId: id, position, title: id, objective: "Objetivo delimitado", dependencyMicrosequenceIds: [], scopeItemIds: [SCOPE],
  explanationPlan: { purpose: "Objetivo delimitado", prerequisites: [], relations: [], sourceIds: [] }
});
const map = () => ({ audience: "Público do curso", prerequisites: [], scopeItems: [{ id: SCOPE, position: 0, statement: "Escopo A" }],
  modules: [{ moduleId: "module-a", position: 0, title: "Módulo A", objective: "Objetivo A",
    lessons: [{ lessonId: "lesson-a", position: 0, title: "Lição A", objective: "Objetivo A", microsequences: [micro()] }] }] });
const micros = data => data.modules[0].lessons[0].microsequences;

// Executa a migration completa e os corpos correntes do writer/shape/grafo/leitor
// sobre relações locais com FK, ordem diferível e recibo reais. A sessão JWT é
// simulada; não prova PostgREST, Storage, navegador nem o banco hospedado.
async function fixture({ approvalReference = false } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema private; create schema auth; create schema extensions;
    create function extensions.gen_random_uuid() returns uuid language sql volatile as $$select gen_random_uuid()$$;
    create table auth.users(id uuid primary key,deleted_at timestamptz,is_anonymous boolean default false,banned_until timestamptz);
    create table public.person_profiles(user_id uuid primary key);
    create table public.courses(id uuid primary key,owner_id uuid,revision bigint not null default 1,visibility text default 'private',updated_at timestamptz);
    create table public.course_access(course_id uuid,user_id uuid,can_copy boolean default false);
    create table private.course_instructional_plans(id uuid primary key default gen_random_uuid(),course_id uuid unique references public.courses(id),
      audience text not null default '' check(char_length(audience)<=4000),
      instructional_scope text not null default '' check(char_length(instructional_scope)<=8000),
      version bigint not null default 1,curriculum_map_status text not null default 'absent'
        check(curriculum_map_status in('absent','draft','approved')),updated_at timestamptz,unique(course_id,id));
    create table private.course_instructional_plan_items(id uuid primary key,course_id uuid,instructional_plan_id uuid,item_kind text,
      position integer not null,statement text not null,description text not null default '',version bigint not null default 1,updated_at timestamptz,
      unique(course_id,id,item_kind),foreign key(course_id,instructional_plan_id) references private.course_instructional_plans(course_id,id),
      unique(instructional_plan_id,item_kind,position) deferrable initially deferred);
    create table private.course_entities(course_id uuid references public.courses(id),entity_type text,entity_id text,parent_type text,parent_id text,
      position integer not null,content jsonb not null,version bigint not null default 1,updated_at timestamptz,
      design_snapshot jsonb,design_application jsonb,content_review jsonb,
      primary key(course_id,entity_type,entity_id),
      foreign key(course_id,parent_type,parent_id) references private.course_entities(course_id,entity_type,entity_id) deferrable initially deferred,
      unique nulls not distinct(course_id,entity_type,parent_type,parent_id,position) deferrable initially deferred);
    create table private.course_design_target_plan_items(course_id uuid,didactic_microsequence_id text,
      didactic_microsequence_entity_type text generated always as ('microsequence') stored,plan_item_id uuid,plan_item_kind text,
      primary key(course_id,didactic_microsequence_id,plan_item_id),
      foreign key(course_id,didactic_microsequence_entity_type,didactic_microsequence_id) references private.course_entities(course_id,entity_type,entity_id) on delete cascade,
      foreign key(course_id,plan_item_id,plan_item_kind) references private.course_instructional_plan_items(course_id,id,item_kind) on delete cascade);
    create table private.course_authoring_parts(id uuid primary key,course_id uuid,position integer,version bigint default 1,updated_at timestamptz);
    create table private.course_authoring_part_didactic_microsequences(course_id uuid,authoring_part_id uuid,didactic_microsequence_id text);
    create table private.course_source_attributions(course_id uuid,id uuid primary key default gen_random_uuid(),target_kind text,target_id text);
    create table private.course_change_receipts(actor_id uuid,request_id text,operation text,course_id uuid,request_hash text,result jsonb,
      expires_at timestamptz not null default now()+interval '1 day',primary key(actor_id,request_id));
    create function auth.jwt() returns jsonb language sql stable as $$select current_setting('fixture.jwt')::jsonb$$;
    create function private.require_service_role() returns void language plpgsql as $$begin
      if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'service role required' using errcode='42501'; end if; end$$;
    create function private.get_course_instructional_plan_for_actor_v3(uuid,uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
  `);
  for (const [migration, name] of [
    ["20260905062817_public_course_access_and_identity.sql", "private.course_ownership_v1"],
    ["20260817140000_course_identity_cutover.sql", "private.require_course_access_v1"]
  ]) await db.exec(functionSql(await load(migration), name));
  const global = await load("20260903160000_global_curriculum_authoring_flow.sql");
  for (const name of ["private.assert_course_lesson_dependencies_v1", "private.current_course_curricular_map_v1",
    "private.valid_course_curricular_map_shape_v1", "public.save_course_curricular_map_for_actor_v1"]) {
    // A migration 20260907013604 troca os dois conflitos de negócio para PT409.
    await db.exec(functionSql(global, name).replaceAll("errcode='40001'", "errcode='PT409'"));
  }
  const review = await load("20260907222912_shared_explanations_human_content_review.sql");
  await db.exec(functionSql(review, "private.valid_course_explanation_plan_v1"));
  await db.exec(review.slice(review.indexOf("do $map$"), review.indexOf("end $map$;") + "end $map$;".length));
  await db.exec(`
    revoke all on function public.save_course_curricular_map_for_actor_v1(uuid,uuid,bigint,bigint,boolean,jsonb,text,text) from public,anon,authenticated,service_role;
    grant execute on function public.save_course_curricular_map_for_actor_v1(uuid,uuid,bigint,bigint,boolean,jsonb,text,text) to service_role;
    revoke all on function private.assert_course_lesson_dependencies_v1(uuid,text[]),private.current_course_curricular_map_v1(uuid),
      private.valid_course_curricular_map_shape_v1(jsonb) from public,anon,authenticated,service_role;
    insert into auth.users(id) values('${OWNER}'),('${OTHER}');
    insert into public.person_profiles(user_id) values('${OWNER}'),('${OTHER}');
    insert into public.courses(id,owner_id) values('${COURSE}','${OWNER}');
    insert into private.course_instructional_plans(course_id) values('${COURSE}');
    select set_config('fixture.jwt','{"role":"service_role"}',false);
  `);
  await db.exec(await load("20260909031450_contextual_curricular_map_drafts.sql"));
  if (approvalReference) {
    // O reader v3 publicado é uma fixture estrutural que lê as mesmas versões
    // persistidas. Os novos readers/approve/receipt e o writer/grafo são reais;
    // não se afirma cobertura de toda a projeção histórica de planejamento.
    await db.exec(`
      create function extensions.digest(bytea,text) returns bytea language sql immutable as $$select sha256($1)$$;
      create function public.get_owned_course_instructional_plan_for_actor_v3(p_actor_id uuid,p_course_id uuid)
      returns jsonb language sql stable as $$select jsonb_build_object('courseId',c.id,'courseRevision',c.revision,
        'plan',jsonb_build_object('version',p.version,'curriculumMapStatus',p.curriculum_map_status))
        from public.courses c join private.course_instructional_plans p on p.course_id=c.id where c.id=p_course_id$$;
    `);
    await db.exec(await load("20260909025135_contextual_curricular_map_reference.sql"));
  }
  return db;
}
const revisions = db => value(db, `select jsonb_build_array(course.revision,plan.version) value from public.courses course
  join private.course_instructional_plans plan on plan.course_id=course.id where course.id=$1`, [COURSE]);
const canonical = db => value(db, "select private.current_course_curricular_map_v1($1) value", [COURSE]);
let serial = 0;
async function save(db, data, { approved = false, actor = OWNER, requestId = `map-draft-${++serial}`, hash = "a".repeat(64), expected } = {}) {
  const [courseRevision, planVersion] = expected || await revisions(db);
  return value(db, "select public.save_course_curricular_map_for_actor_v1($1,$2,$3,$4,$5,$6,$7,$8) value",
    [actor, COURSE, courseRevision, planVersion, approved, data, requestId, hash]);
}

const readApproval = (db, actor = OWNER) => value(db, "select public.get_owned_course_curricular_map_for_actor_v1($1,$2) value", [actor, COURSE]);
const approveReference = (db, basis, { actor = OWNER, requestId = `map-reference-${++serial}`, hash = "c".repeat(64) } = {}) => value(db,
  "select public.approve_course_curricular_map_for_actor_v1($1,$2,$3,$4,$5,$6,$7) value",
  [actor, COURSE, basis.courseRevision, basis.planVersion, basis.basisHash, requestId, hash]);
const readReceipt = (db, requestId, hash = "c".repeat(64), operation = "save_course_curricular_map_v1", actor = OWNER) => value(db,
  "select public.get_course_change_receipt_for_actor_v1($1,$2,$3,$4,$5) value", [actor, COURSE, operation, requestId, hash]);

const scopeIntegrityMigration = "20260910134141_copied_curriculum_scope_integrity.sql";
const SCOPE_B = "30000000-0000-4000-8000-000000000002";
// O escritor de cópia e o writer/leitor curricular são os corpos SQL reais.
// Relações auxiliares vazias delimitam a prova a cobertura e recuperação local;
// arquivos, permissões HTTP e base aplicada têm os gates próprios de integração.
async function copyFixture() {
  const db = await fixture();
  await db.exec(`
    create schema storage;
    create table storage.objects(bucket_id text,name text,metadata jsonb);
    alter table public.courses add title text,add goal text,add copy_origin jsonb,
      add public_file_access text,add bibliography_style text,add audio_config jsonb;
    alter table private.course_instructional_plans add preferred_authoring_part_min integer,add preferred_authoring_part_max integer,
      add part_count_origin text,add created_at timestamptz default now();
    alter table private.course_instructional_plan_items add created_at timestamptz default now();
    alter table private.course_entities add created_at timestamptz default now(),add created_origin text,
      add last_revision_origin text,add applied_explanation_basis jsonb;
    alter table private.course_authoring_parts add instructional_plan_id uuid,add title text,add intent text,
      add created_at timestamptz,add progression jsonb;
    alter table private.course_authoring_part_didactic_microsequences add production_position integer,add created_at timestamptz;
    alter table private.course_source_attributions add target_version bigint,add target_hash text,add created_at timestamptz;
    alter table private.course_change_receipts add created_at timestamptz default now();
    create table private.course_design_parameter_assignments(course_id uuid,parameter_id text,scope_kind text,scope_ref text,
      value jsonb,origin text,reason text,updated_at timestamptz,mode text);
    create table private.course_authoring_guidance_assignments(course_id uuid,scope_kind text,scope_ref text,guidance jsonb,
      origin text,reason text,updated_at timestamptz);
    create table private.course_component_policy_assignments(course_id uuid,scope_kind text,scope_ref text,policy jsonb,
      origin text,reason text,updated_at timestamptz);
    create table private.course_sources(course_id uuid,source_id uuid,revision bigint,status text,kind text,title text,
      publication_date jsonb,identifier jsonb,language text,citation_text text,url text,edition_or_version text,origin jsonb,
      availability text,verification_status text,study_visibility text,created_at timestamptz,public_file_access text,
      authors jsonb,default_roles jsonb,citation_mode text,bibliographic jsonb);
    create table private.course_source_anchors(course_id uuid,anchor_id uuid,revision bigint,source_id uuid,source_revision bigint,
      status text,selector jsonb,verification_excerpt text,created_at timestamptz,human_locator text,content_hash text);
    create table private.course_source_attachments(course_id uuid,source_id uuid,source_revision bigint,content_hash text,byte_size bigint,
      media_type text,storage_path text,created_at timestamptz,status text,version bigint,updated_at timestamptz,
      removed_at timestamptz,removed_course_revision bigint,public_file_access text);
    create table private.course_source_attribution_sources(course_id uuid,attribution_id uuid,source_ordinal integer,source_id uuid,
      relation text,link_id text,roles jsonb,occurrences jsonb);
    create table private.course_source_attribution_anchors(course_id uuid,attribution_id uuid,source_ordinal integer,
      anchor_ordinal integer,source_id uuid,anchor_id uuid);
    create table private.course_media(course_id uuid,content_hash text,byte_size bigint,media_type text,file_name text,
      status text,created_at timestamptz,updated_at timestamptz,storage_path text);
    create table private.course_source_pdf_delete_intents(storage_path text);
    create table private.course_media_delete_intents(storage_path text);
    create table private.fixture_observations(course_id uuid,id uuid,version bigint,state text,body text);
    create function private.course_source_json_hash_v1(jsonb) returns text language sql immutable as $$select encode(sha256(convert_to($1::text,'UTF8')),'hex')$$;
    create function public.get_aralearn_runtime_manifest() returns jsonb language sql as $$select '{"schemaRevision":"20260910054749"}'::jsonb$$;
  `);
  const copySql = await load("20260905145236_independent_course_copies.sql");
  for (const name of ["private.can_copy_course_v1", "private.remap_copied_design_v1", "public.copy_course_for_actor_v1"]) {
    await db.exec(functionSql(copySql, name).replaceAll("errcode='40001'", "errcode='PT409'"));
  }
  const data = map();
  data.scopeItems.push({ id: SCOPE_B, position: 1, statement: "Escopo B" });
  micros(data)[0].scopeItemIds = [SCOPE_B, SCOPE];
  micros(data).push(micro("micro-b", 1));
  await save(db, data);
  await db.exec(`update private.course_instructional_plans set curriculum_map_status='approved';`);
  return db;
}
async function copyCourse(db) {
  const requestedAt = new Date();
  const uuid = await value(db, "select gen_random_uuid()::text value");
  return value(db, "select public.copy_course_for_actor_v1($1,$2,$3,'Cópia útil',true,$4,$5) value",
    [OWNER, COURSE, (await revisions(db))[0], `copy:${requestedAt.getTime()}:${uuid}`, requestedAt.toISOString()]);
}
const copiedMap = (db, courseId) => value(db, "select private.current_course_curricular_map_v1($1) value", [courseId]);
async function editCopy(db, courseId) {
  const data = await copiedMap(db, courseId);
  data.modules[0].lessons.push({ lessonId: "lesson-new", position: 1, title: "Organização temporária", objective: "Organizar o percurso", microsequences: [] });
  return value(db, `select public.save_course_curricular_map_for_actor_v1($1,$2,c.revision,p.version,false,$3,$4,$5) value
    from public.courses c join private.course_instructional_plans p on p.course_id=c.id where c.id=$2`,
  [OWNER, courseId, data, `copy-edit-${++serial}`, "d".repeat(64)]);
}
const copyState = (db, courseId) => value(db, `select jsonb_build_object(
  'course',(select to_jsonb(c) from public.courses c where id=$1),
  'plan',(select to_jsonb(p) from private.course_instructional_plans p where course_id=$1),
  'entities',(select jsonb_agg(to_jsonb(e) order by entity_type,entity_id) from private.course_entities e where course_id=$1),
  'items',(select jsonb_agg(to_jsonb(i) order by id) from private.course_instructional_plan_items i where course_id=$1),
  'targets',(select jsonb_agg(to_jsonb(t) order by didactic_microsequence_id,plan_item_id) from private.course_design_target_plan_items t where course_id=$1),
  'sources',(select jsonb_agg(to_jsonb(s) order by source_id) from private.course_sources s where course_id=$1),
  'attributions',(select jsonb_agg(to_jsonb(a) order by id) from private.course_source_attributions a where course_id=$1),
  'files',(select jsonb_agg(to_jsonb(f) order by source_id) from private.course_source_attachments f where course_id=$1),
  'observations',(select jsonb_agg(to_jsonb(o) order by id) from private.fixture_observations o where course_id=$1)
) value`, [courseId]);

test("cópia remapeia cobertura não vazia e conserva ordem; mapa novo permanece editável", async () => {
  const db = await copyFixture();
  try {
    const oldCopy = (await copyCourse(db)).targetCourseId;
    assert.deepEqual(micros(await copiedMap(db, oldCopy))[0].scopeItemIds, [SCOPE_B, SCOPE]);
    await assert.rejects(editCopy(db, oldCopy), error => error.code === "23514"
      && error.message.includes("referencia item de escopo inexistente"));
    const original = await copyState(db, COURSE);
    await db.exec(await load(scopeIntegrityMigration));
    const newCopy = (await copyCourse(db)).targetCourseId;
    const data = await copiedMap(db, newCopy);
    const [scopeA, scopeB] = data.scopeItems;
    assert.notEqual(scopeA.id, SCOPE);
    assert.notEqual(scopeB.id, SCOPE_B);
    assert.deepEqual(micros(data)[0].scopeItemIds, [scopeB.id, scopeA.id]);
    assert.deepEqual(micros(data)[1].scopeItemIds, [scopeA.id]);
    assert.equal((await editCopy(db, newCopy)).changed, true);
    assert.equal((await copiedMap(db, newCopy)).modules[0].lessons[1].title, "Organização temporária");
    assert.deepEqual(await copyState(db, COURSE), original);
  } finally { await db.close(); }
});

test("upgrade repara cópia útil renomeada pelos vínculos locais, preserva demais dados e é idempotente", async () => {
  const db = await copyFixture();
  try {
    const courseId = (await copyCourse(db)).targetCourseId;
    await db.query("update public.courses set title='Laboratório renomeado',revision=revision+1 where id=$1", [courseId]);
    await db.query(`update private.course_entities set content=content||'{"explanation":{"title":"Base útil","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Texto Wi‑Fi útil e exato"}}]}}',
      content_review='{"basisHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","reviewedBy":"10000000-0000-4000-8000-000000000001","reviewedAt":"2026-09-10T13:00:00Z","reviewedVersion":1}'
      where course_id=$1 and entity_type='microsequence'`, [courseId]);
    await db.query(`insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content,version,created_origin,last_revision_origin,applied_explanation_basis)
      values($1,'study_unit','unit-useful','microsequence','micro-a',0,'{"title":"Unidade útil","role":"theory","content":[{"id":"p","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Conteúdo útil preservado."}}],"response":null,"feedback":[],"topics":[]}',3,'gpt','human',
        '{"contract":"aralearn.applied-explanation-basis.v1","microsequenceId":"micro-a","basisHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","entityVersion":1}');
    `, [courseId]);
    await db.query(`insert into private.fixture_observations values($1,gen_random_uuid(),2,'open','Observação preservada')`, [courseId]);
    await db.query(`insert into private.course_sources(course_id,source_id,title) values($1,'40000000-0000-4000-8000-000000000001','Fonte preservada')`, [courseId]);
    await db.query(`insert into private.course_source_attachments(course_id,source_id,storage_path,status)
      values($1,'40000000-0000-4000-8000-000000000001','original/hash.pdf','active')`, [courseId]);
    await db.query(`insert into private.course_source_attributions(course_id,target_kind,target_id,target_version,target_hash)
      values($1,'microsequence_explanation','micro-a',1,'preserved-hash')`, [courseId]);
    // A origem pode evoluir; a recuperação não consulta seus textos nem versões.
    await db.query("update private.course_instructional_plan_items set statement='Origem posterior' where id=$1", [SCOPE]);
    const original = await copyState(db, COURSE);
    const before = await copyState(db, courseId);
    await db.exec(await load(scopeIntegrityMigration));
    const after = await copyState(db, courseId);
    const expected = structuredClone(before);
    expected.course.revision++;
    expected.course.updated_at = after.course.updated_at;
    expected.plan.version++;
    expected.plan.updated_at = after.plan.updated_at;
    expected.plan.curriculum_map_status = "draft";
    for (const entity of expected.entities.filter(item => item.entity_type === "microsequence")) {
      entity.content.scopeItemIds = before.items.filter(item => item.item_kind === "curriculum_scope_item"
        && before.targets.some(target => target.didactic_microsequence_id === entity.entity_id && target.plan_item_id === item.id))
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)).map(item => item.id);
      entity.version++;
      entity.updated_at = after.entities.find(item => item.entity_type === entity.entity_type && item.entity_id === entity.entity_id).updated_at;
      assert.ok(entity.updated_at);
    }
    assert.deepEqual(after, expected);
    assert.deepEqual(await copyState(db, COURSE), original);
    await db.exec(await load(scopeIntegrityMigration));
    assert.deepEqual(await copyState(db, courseId), after);
    assert.equal((await editCopy(db, courseId)).changed, true);
  } finally { await db.close(); }
});

test("upgrade recusa perda de associações, duplicidade e referência local incompatível sem alteração parcial", async () => {
  const db = await copyFixture();
  try {
    const courseId = (await copyCourse(db)).targetCourseId;
    const before = await copyState(db, courseId);
    const badCases = [
      { sql: "delete from private.course_design_target_plan_items where course_id=$1 and didactic_microsequence_id='micro-b'", args: [courseId] },
      { sql: "update private.course_entities set content=jsonb_set(content,'{scopeItemIds}',$2) where course_id=$1 and entity_id='micro-a'", args: [courseId, [SCOPE, SCOPE]] },
      { sql: `with extra as (insert into private.course_instructional_plan_items(id,course_id,instructional_plan_id,item_kind,position,statement)
          select gen_random_uuid(),$1,id,'curriculum_scope_item',2,'Outro escopo local sem vínculo' from private.course_instructional_plans where course_id=$1 returning id)
        update private.course_entities set content=jsonb_set(content,'{scopeItemIds}',jsonb_build_array((select id::text from extra),$2::text))
          where course_id=$1 and entity_id='micro-a'`, args: [courseId, SCOPE] }
    ];
    const migration = await load(scopeIntegrityMigration);
    for (const bad of badCases) {
      await db.exec("begin");
      await db.query(bad.sql, bad.args);
      const corrupted = await copyState(db, courseId);
      // Mesmo bloco transacional da migration, dentro de savepoint para inspecionar
      // que nenhuma micro anterior ficou reparada após o erro da próxima.
      await db.exec("savepoint repair");
      await assert.rejects(db.exec(migration.replace(/^begin;\n/u, "").replace(/commit;\s*$/u, "")), code("23514"));
      await db.exec("rollback to savepoint repair");
      assert.deepEqual(await copyState(db, courseId), corrupted);
      await db.exec("rollback");
      assert.deepEqual(await copyState(db, courseId), before);
    }
  } finally { await db.close(); }
});

test("rascunho persiste público e arrays pendentes, dependências inexistentes/futuras e cobertura incompleta", async () => {
  const db = await fixture();
  try {
    const drafts = [];
    const empty = { audience: "", prerequisites: [], scopeItems: [], modules: [] };
    drafts.push(empty);
    const audiencePending = map(); audiencePending.audience = ""; drafts.push(audiencePending);
    const scopePending = map(); scopePending.scopeItems = []; micros(scopePending)[0].scopeItemIds = []; drafts.push(scopePending);
    const moduleOnly = map(); moduleOnly.audience = ""; moduleOnly.scopeItems = []; moduleOnly.modules[0].lessons = [];
    drafts.push(moduleOnly);
    const lessonOnly = map(); micros(lessonOnly).length = 0; drafts.push(lessonOnly);
    const uncovered = map(); micros(uncovered)[0].scopeItemIds = []; drafts.push(uncovered);
    const missing = map(); micros(missing)[0].dependencyMicrosequenceIds = ["next-micro"];
    drafts.push(missing);
    const future = structuredClone(missing); micros(future).push(micro("next-micro", 1)); drafts.push(future);
    const cycle = structuredClone(future); micros(cycle)[1].dependencyMicrosequenceIds = ["micro-a"]; drafts.push(cycle);
    for (const data of drafts) {
      assert.equal((await save(db, data)).approval, "draft");
      assert.deepEqual(await canonical(db), data);
      const before = await revisions(db);
      await assert.rejects(save(db, data, { approved: true }), code("23514"));
      assert.deepEqual(await revisions(db), before);
    }
    const complete = structuredClone(future); micros(complete)[0].dependencyMicrosequenceIds = [];
    micros(complete)[1].dependencyMicrosequenceIds = ["micro-a"];
    await save(db, complete);
    const approved = await save(db, complete, { approved: true });
    assert.equal(approved.approval, "approved");
    const excessiveScope = structuredClone(complete);
    excessiveScope.scopeItems = Array.from({ length: 5 }, (_, i) => ({
      id: i === 0 ? SCOPE : `30000000-0000-4000-8000-00000000000${i + 1}`,
      position: i, statement: `${i}${"x".repeat(1899)}`
    }));
    // A restrição agregada do plano falha depois dos upserts e da passagem
    // interna para draft: a transação restaura árvore, aprovação e versões.
    await assert.rejects(save(db, excessiveScope), code("23514"));
    assert.deepEqual(await canonical(db), complete);
    assert.deepEqual(await revisions(db), [approved.courseRevision, approved.planVersion]);
    assert.equal(await value(db, "select curriculum_map_status value from private.course_instructional_plans"), "approved");
    // Uma edição após aprovação volta a draft na mesma transação, inclusive se
    // introduz dependência pendente. Não depende de configuração de sessão.
    await save(db, future);
    assert.equal(await value(db, "select curriculum_map_status value from private.course_instructional_plans"), "draft");
    assert.deepEqual(await canonical(db), future);
    await db.exec("select private.assert_course_lesson_dependencies_v1('" + COURSE + "',array['lesson-a'])");
    await db.exec("update private.course_instructional_plans set curriculum_map_status='approved'");
    await assert.rejects(db.query("select private.assert_course_lesson_dependencies_v1($1,array['lesson-a'])", [COURSE]), code("23514"));
  } finally { await db.close(); }
});

test("tipos, limites, IDs, owner, CAS, grants e recibo da mesma tentativa permanecem obrigatórios", async () => {
  const db = await fixture();
  try {
    const data = map();
    const invalid = [];
    for (const mutate of [
      item => { item.modules[0].objective = ""; }, item => { item.audience = "x".repeat(2001); },
      item => { item.extra = true; }, item => { item.scopeItems[0].id = "not-an-id"; },
      item => { item.modules[0].position = 5; }, item => { micros(item)[0].dependencyMicrosequenceIds = ["x", "x"]; },
      item => { micros(item)[0].dependencyMicrosequenceIds = [1]; },
      item => { micros(item)[0].explanationPlan.purpose = ""; },
      item => { micros(item)[0].scopeItemIds = [OTHER]; },
      item => { micros(item).push(micro("micro-a", 1)); },
      item => { item.modules = Array.from({ length: 65 }, (_, i) => ({ ...item.modules[0], moduleId: `m-${i}`, position: i, lessons: [] })); }
    ]) { const changed = structuredClone(data); mutate(changed); invalid.push(changed); }
    for (const item of invalid) await assert.rejects(save(db, item));
    await assert.rejects(save(db, data, { actor: OTHER }), error => ["PT404", "42501"].includes(error.code));
    await db.exec("select set_config('fixture.jwt','{\"role\":\"authenticated\"}',false)");
    await assert.rejects(save(db, data), code("42501"));
    await db.exec("select set_config('fixture.jwt','{\"role\":\"service_role\"}',false)");
    const expected = await revisions(db);
    const first = await save(db, data, { expected, requestId: "same-map-attempt" });
    assert.equal(first.changed, true);
    const replay = await save(db, data, { expected, requestId: "same-map-attempt" });
    assert.deepEqual(replay, { ...first, idempotent: true });
    assert.deepEqual(await revisions(db), [first.courseRevision, first.planVersion]);
    await assert.rejects(save(db, data, { expected, requestId: "same-map-attempt", hash: "b".repeat(64) }), code("23514"));
    await assert.rejects(save(db, data, { expected }), code("PT409"));
    const fresh = await revisions(db);
    await assert.rejects(save(db, data, { expected: [fresh[0], fresh[1] - 1] }), code("PT409"));
    await assert.rejects(save(db, data, { requestId: "bad" }), code("22023"));
    const unchanged = await save(db, data);
    assert.equal(unchanged.changed, false);
    assert.deepEqual(await revisions(db), [first.courseRevision, first.planVersion]);
    for (const role of ["anon", "authenticated", "service_role"]) {
      assert.equal(await value(db, "select has_function_privilege($1,'public.save_course_curricular_map_for_actor_v1(uuid,uuid,bigint,bigint,boolean,jsonb,text,text)','EXECUTE') value", [role]), role === "service_role");
      assert.equal(await value(db, "select has_function_privilege($1,'private.valid_course_curricular_map_shape_v1(jsonb)','EXECUTE') value", [role]), false);
    }
    // O estado draft só adia a topologia; tipos e duplicação continuam barrados
    // pelo guard também para os outros writers que o consomem.
    await db.query("update private.course_entities set content=jsonb_set(content,'{dependsOn}',$1) where entity_id='micro-a'", [["missing", "missing"]]);
    await assert.rejects(db.query("select private.assert_course_lesson_dependencies_v1($1,array['lesson-a'])", [COURSE]), code("23514"));
  } finally { await db.close(); }
});

test("rename, ordem e intenção preservam Explicação, unidades, fontes, guias e aplicado; remoção útil é recusada", async () => {
  const db = await fixture();
  try {
    const data = map(); micros(data).push(micro("base-only", 1), micro("source-only", 2), micro("empty", 3));
    data.modules.push({ moduleId: "module-b", title: "Módulo B", objective: "Objetivo B", position: 1,
      lessons: [{ lessonId: "lesson-b", title: "Lição B", objective: "Objetivo B", position: 0, microsequences: [] }] });
    await save(db, data);
    await db.exec(`
      insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content,design_snapshot,design_application)
        values('${COURSE}','study_unit','unit-a','microsequence','micro-a',1,'{"title":"Unidade","content":[{"text":"Conteúdo útil"}]}',
          '{"applied":"decisão anterior"}','{"scopeItemIds":["${SCOPE}"]}');
      update private.course_entities set content=content||'{"explanation":{"title":"Base salva","content":[{"text":"Base útil"}]},"role":"practice","checks":["Verificação"],"errors":["Erro previsto"]}'::jsonb,
        design_snapshot='{"applied":"base"}',design_application='{"from":"materialization"}' where entity_id in('micro-a','base-only');
      update private.course_entities set content=jsonb_set(content,'{guide,include}','["Repertório útil"]') where entity_type in('module','lesson');
      insert into private.course_source_attributions(course_id,target_kind,target_id) values('${COURSE}','microsequence_explanation','source-only'),('${COURSE}','plan_item','${SCOPE}');
    `);
    const unitBefore = await value(db, "select to_jsonb(entity) value from private.course_entities entity where entity_id='unit-a'");
    const sourceBefore = await value(db, "select jsonb_agg(to_jsonb(a) order by id) value from private.course_source_attributions a");
    const baseBefore = await value(db, "select jsonb_build_object('content',content,'snapshot',design_snapshot,'application',design_application) value from private.course_entities where entity_id='micro-a'");
    const changed = structuredClone(data);
    changed.modules.reverse().forEach((item, i) => { item.position = i; item.title += " revisto"; item.objective += " corrente"; });
    const lesson = changed.modules[1].lessons[0]; lesson.title = "Lição renomeada"; lesson.objective = "Intenção corrente";
    lesson.microsequences.reverse().forEach((item, i) => { item.position = i; item.title += " revisto"; item.objective = "Objetivo corrente"; });
    lesson.microsequences.find(item => item.microsequenceId === "micro-a").dependencyMicrosequenceIds = ["future"];
    changed.scopeItems[0].statement = "Escopo corrente";
    await save(db, changed);
    assert.deepEqual(await canonical(db), changed);
    assert.deepEqual(await value(db, "select to_jsonb(entity) value from private.course_entities entity where entity_id='unit-a'"), unitBefore);
    assert.deepEqual(await value(db, "select jsonb_agg(to_jsonb(a) order by id) value from private.course_source_attributions a"), sourceBefore);
    const baseAfter = await value(db, "select jsonb_build_object('content',content,'snapshot',design_snapshot,'application',design_application) value from private.course_entities where entity_id='micro-a'");
    for (const field of ["explanation", "role", "checks", "errors"]) assert.deepEqual(baseAfter.content[field], baseBefore.content[field]);
    assert.deepEqual(baseAfter.snapshot, baseBefore.snapshot); assert.deepEqual(baseAfter.application, baseBefore.application);
    assert.deepEqual(baseAfter.content.covers, ["Escopo corrente"]);
    assert.equal(await value(db, "select bool_and(content#>'{guide,include}'='[\"Repertório útil\"]'::jsonb) value from private.course_entities where entity_type in('module','lesson')"), true);
    for (const id of ["micro-a", "base-only", "source-only"]) {
      const removal = structuredClone(changed);
      removal.modules[1].lessons[0].microsequences = removal.modules[1].lessons[0].microsequences.filter(item => item.microsequenceId !== id);
      removal.modules[1].lessons[0].microsequences.forEach((item, i) => { item.position = i; });
      await assert.rejects(save(db, removal), code("23514"));
    }
    const removeModule = structuredClone(changed); removeModule.modules.pop();
    await assert.rejects(save(db, removeModule), code("23514"));
    const removeLesson = structuredClone(changed); removeLesson.modules[1].lessons = [];
    await assert.rejects(save(db, removeLesson), code("23514"));
    const moved = structuredClone(changed);
    const movedMicro = moved.modules[1].lessons[0].microsequences.pop(); movedMicro.position = 0;
    moved.modules[0].lessons[0].microsequences.push(movedMicro);
    await assert.rejects(save(db, moved), code("23514"));
    const scopeRemoval = structuredClone(changed); scopeRemoval.scopeItems = [];
    scopeRemoval.modules[1].lessons[0].microsequences.forEach(item => { item.scopeItemIds = []; });
    await assert.rejects(save(db, scopeRemoval), code("23514"));
    const emptyRemoval = structuredClone(changed);
    emptyRemoval.modules[1].lessons[0].microsequences = emptyRemoval.modules[1].lessons[0].microsequences.filter(item => item.microsequenceId !== "empty");
    emptyRemoval.modules[1].lessons[0].microsequences.forEach((item, i) => { item.position = i; });
    await save(db, emptyRemoval);
    assert.deepEqual(await canonical(db), emptyRemoval);
    assert.deepEqual(await value(db, "select to_jsonb(entity) value from private.course_entities entity where entity_id='unit-a'"), unitBefore);
  } finally { await db.close(); }
});

test("aprovação por referência relê mapa persistido, vincula hash e versões, salva e recupera a mesma tentativa", async () => {
  const db = await fixture({ approvalReference: true });
  try {
    const data = map();
    const saved = await save(db, data);
    const read = await readApproval(db);
    assert.equal(read.contract, "aralearn.course-curricular-map.v1");
    assert.equal(read.courseId, COURSE);
    assert.deepEqual(read.map, data);
    assert.deepEqual(read.approvalBasis, { courseRevision: saved.courseRevision, planVersion: saved.planVersion,
      basisHash: await value(db, "select encode(sha256(convert_to(private.current_course_curricular_map_v1($1)::text,'UTF8')),'hex') value", [COURSE]) });
    const projected = await value(db, "select public.get_owned_course_instructional_plan_for_actor_v4($1,$2) value", [OWNER, COURSE]);
    assert.deepEqual(projected.approvalBasis, read.approvalBasis);
    assert.equal(projected.plan.curriculumMapStatus, "draft");
    assert.deepEqual(await readReceipt(db, "inspect-and-approve-001"), { status: "absent" });
    const approved = await approveReference(db, read.approvalBasis, { requestId: "inspect-and-approve-001" });
    assert.equal(approved.approval, "approved");
    assert.equal(approved.idempotent, false);
    assert.deepEqual(await canonical(db), data);
    const afterApproval = await revisions(db);
    const receipt = await readReceipt(db, "inspect-and-approve-001");
    assert.deepEqual(receipt, { status: "confirmed", result: { ...approved, idempotent: true } });
    assert.deepEqual(await approveReference(db, read.approvalBasis, { requestId: "inspect-and-approve-001" }), receipt.result);
    assert.deepEqual(await revisions(db), afterApproval);
    // O replay reconcilia a declaração anterior; nunca aprova edição posterior.
    const changed = map(); changed.audience = "Público alterado após a aprovação";
    await save(db, changed);
    assert.deepEqual(await approveReference(db, read.approvalBasis, { requestId: "inspect-and-approve-001" }), receipt.result);
    assert.equal(await value(db, "select curriculum_map_status value from private.course_instructional_plans"), "draft");
    assert.deepEqual(await canonical(db), changed);
  } finally { await db.close(); }
});

test("referência desatualizada, incompleta ou de outro ator não aprova; recibos validam identidade e autoridade", async () => {
  const db = await fixture({ approvalReference: true });
  try {
    const data = map();
    await save(db, data);
    const inspected = await readApproval(db);
    const changed = structuredClone(data); changed.audience = "Público mais recente";
    await save(db, changed);
    const beforeStale = await revisions(db);
    await assert.rejects(approveReference(db, inspected.approvalBasis), code("40001"));
    assert.deepEqual(await revisions(db), beforeStale);
    const fresh = await readApproval(db);
    await assert.rejects(approveReference(db, { ...fresh.approvalBasis, courseRevision: fresh.courseRevision - 1 }), code("PT409"));
    await assert.rejects(approveReference(db, { ...fresh.approvalBasis, planVersion: fresh.planVersion - 1 }), code("PT409"));
    await assert.rejects(approveReference(db, { ...fresh.approvalBasis, basisHash: "invalid" }), code("22023"));
    for (const action of [() => readApproval(db, OTHER), () => approveReference(db, fresh.approvalBasis, { actor: OTHER }),
      () => readReceipt(db, "unauthorized-receipt", "c".repeat(64), "save_course_curricular_map_v1", OTHER)]) {
      await assert.rejects(action, error => ["PT404", "42501"].includes(error.code));
    }
    await approveReference(db, fresh.approvalBasis, { requestId: "reference-bound-receipt" });
    await assert.rejects(readReceipt(db, "reference-bound-receipt", "d".repeat(64)), code("23514"));
    await assert.rejects(readReceipt(db, "reference-bound-receipt", "c".repeat(64), "commit_course_composition"), code("23514"));
    await assert.rejects(approveReference(db, fresh.approvalBasis, { requestId: "reference-bound-receipt", hash: "d".repeat(64) }), code("23514"));
    const partial = { audience: "", prerequisites: [], scopeItems: [], modules: [] };
    await save(db, partial);
    const incomplete = await readApproval(db);
    await assert.rejects(approveReference(db, incomplete.approvalBasis), code("23514"));
    assert.deepEqual(await canonical(db), partial);
    assert.equal(await value(db, "select curriculum_map_status value from private.course_instructional_plans"), "draft");
    await db.exec("select set_config('fixture.jwt','{\"role\":\"authenticated\"}',false)");
    for (const action of [() => readApproval(db), () => approveReference(db, fresh.approvalBasis), () => readReceipt(db, "reference-bound-receipt")]) {
      await assert.rejects(action, code("42501"));
    }
    for (const signature of ["public.get_owned_course_curricular_map_for_actor_v1(uuid,uuid)",
      "public.get_owned_course_instructional_plan_for_actor_v4(uuid,uuid)",
      "public.approve_course_curricular_map_for_actor_v1(uuid,uuid,bigint,bigint,text,text,text)",
      "public.get_course_change_receipt_for_actor_v1(uuid,uuid,text,text,text)"]) {
      for (const role of ["anon", "authenticated", "service_role"]) {
        assert.equal(await value(db, "select has_function_privilege($1,$2,'execute') value", [role, signature]), role === "service_role");
      }
    }
  } finally { await db.close(); }
});
