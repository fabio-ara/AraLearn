import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const OWNER = "10000000-0000-4000-8000-000000000001";
const OTHER = "10000000-0000-4000-8000-000000000002";
const COURSE = "20000000-0000-4000-8000-000000000001";
const PART = "30000000-0000-4000-8000-000000000001";
const value = async (db, sql, args = []) => (await db.query(sql, args)).rows[0].value;
const code = expected => error => error.code === expected;
const migration = await fs.readFile(new URL("../../supabase/migrations/20260909061327_contextual_explicit_course_structure.sql", import.meta.url), "utf8");

// The entire new migration runs against relational fixtures with deferred order,
// cascading parent/child FKs and durable receipts. Existing role/access and source
// target-state helpers are bounded fixtures; full migrations/PostgREST/Storage
// are the coordinator's separate database gate, not evidence from this test.
async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema private; create schema extensions;
    create function extensions.digest(bytea,text) returns bytea language sql immutable as $$select sha256($1)$$;
    create table public.courses(id uuid primary key,owner_id uuid,revision bigint default 1,updated_at timestamptz);
    create table private.course_instructional_plans(course_id uuid primary key references public.courses(id),version bigint default 1,curriculum_map_status text default 'approved',updated_at timestamptz);
    create table private.course_entities(course_id uuid references public.courses(id),entity_type text,entity_id text,parent_type text,parent_id text,position integer not null,
      content jsonb not null,version bigint not null default 1,created_at timestamptz default now(),updated_at timestamptz,
      design_snapshot jsonb,design_application jsonb,created_origin text,last_revision_origin text,content_review jsonb default '{}',applied_explanation_basis jsonb,
      primary key(course_id,entity_type,entity_id),check(case when entity_type='study_unit' then position>0 else position>=0 end),
      foreign key(course_id,parent_type,parent_id) references private.course_entities(course_id,entity_type,entity_id) on delete cascade deferrable initially deferred,
      unique nulls not distinct(course_id,entity_type,parent_type,parent_id,position) deferrable initially deferred);
    create table private.course_change_receipts(actor_id uuid,request_id text,operation text,course_id uuid,request_hash text,result jsonb,primary key(actor_id,request_id),
      constraint course_change_receipts_operation_v17 check(operation in('set_content_review','save_authoring_process_preferences')));
    create table private.course_design_target_plan_items(course_id uuid,didactic_microsequence_id text,plan_item_id uuid,plan_item_kind text,
      entity_type text generated always as ('microsequence') stored,
      primary key(course_id,didactic_microsequence_id,plan_item_id),
      foreign key(course_id,entity_type,didactic_microsequence_id) references private.course_entities(course_id,entity_type,entity_id) on delete cascade);
    create table private.course_design_parameter_assignments(course_id uuid,parameter_id text,scope_kind text,scope_ref text,value jsonb,origin text,reason text,updated_at timestamptz,mode text);
    create table private.course_authoring_guidance_assignments(course_id uuid,scope_kind text,scope_ref text,guidance text,origin text,reason text,updated_at timestamptz);
    create table private.course_component_policy_assignments(course_id uuid,scope_kind text,scope_ref text,policy jsonb,origin text,reason text,updated_at timestamptz);
    create table private.course_authoring_parts(id uuid primary key,course_id uuid,version bigint default 1,updated_at timestamptz);
    create table private.course_authoring_part_didactic_microsequences(course_id uuid,authoring_part_id uuid,didactic_microsequence_id text,production_position integer,
      entity_type text generated always as ('microsequence') stored,
      foreign key(course_id,entity_type,didactic_microsequence_id) references private.course_entities(course_id,entity_type,entity_id),
      unique(authoring_part_id,production_position) deferrable initially deferred);
    create table private.course_sources(course_id uuid,id text primary key,data jsonb,status text default 'retained');
    create table private.course_source_attributions(course_id uuid,id uuid primary key default gen_random_uuid(),target_kind text,target_id text,target_version bigint,target_hash text,created_at timestamptz default now());
    create table private.course_source_attribution_sources(course_id uuid,attribution_id uuid references private.course_source_attributions(id) on delete cascade,
      source_ordinal integer,source_id text,relation text,link_id text,roles jsonb,occurrences jsonb);
    create table private.course_source_attribution_anchors(course_id uuid,attribution_id uuid references private.course_source_attributions(id) on delete cascade,
      source_ordinal integer,anchor_ordinal integer,source_id text,anchor_id text);
    create table private.course_anchored_annotations(course_id uuid,target_id text,body text);
    create function private.require_service_role() returns void language plpgsql as $$begin
      if current_setting('fixture.role')<>'service_role' then raise exception 'service role' using errcode='42501'; end if; end$$;
    create function private.require_course_access_v1(uuid,uuid,boolean) returns void language plpgsql as $$begin
      if not exists(select 1 from public.courses where id=$1 and owner_id=$2) then raise exception 'owner' using errcode='42501'; end if; end$$;
    create function private.course_source_target_state_v1(uuid,text,text) returns jsonb language sql as $$
      select jsonb_build_object('version',version,'hash',encode(sha256(convert_to(content::text,'UTF8')),'hex')) from private.course_entities
      where course_id=$1 and entity_type=case $2 when 'study_unit' then 'study_unit' else 'microsequence' end and entity_id=$3$$;
    select set_config('fixture.role','service_role',false);
    insert into public.courses values('${COURSE}','${OWNER}',1,now());
    insert into private.course_instructional_plans(course_id) values('${COURSE}');
    insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content) values
      ('${COURSE}','module','m1',null,null,0,'{"title":"Módulo 1","guide":"Guia"}'),
      ('${COURSE}','module','m2',null,null,1,'{"title":"Módulo 2","guide":"Guia"}'),
      ('${COURSE}','lesson','l1','module','m1',0,'{"title":"Lição 1","guide":"Guia"}'),
      ('${COURSE}','lesson','l2','module','m2',0,'{"title":"Lição 2","guide":"Guia"}'),
      ('${COURSE}','microsequence','a','lesson','l1',0,'{"title":"A","goal":"Objetivo","dependsOn":[],"scopeItemIds":["escopo"],"explanation":{"body":"Literal a"}}'),
      ('${COURSE}','microsequence','b','lesson','l1',1,'{"title":"B","goal":"Objetivo","dependsOn":["a"],"branchOf":"a","explanation":{"body":"a é texto, não referência"}}'),
      ('${COURSE}','microsequence','c','lesson','l2',0,'{"title":"C","goal":"Objetivo","dependsOn":[]}'),
      ('${COURSE}','study_unit','u1','microsequence','a',1,'{"title":"Unidade","content":"Literal a","component":{"type":"explanation"}}');
    update private.course_entities set content_review='{"reviewed":true}',design_snapshot='{"parameter":"applied"}',design_application='{"origin":"original"}',
      created_origin='mcp',last_revision_origin='human' where entity_id in('a','u1');
    update private.course_entities set applied_explanation_basis='{"microsequenceId":"a","explanationVersion":7,"hash":"original"}' where entity_id='u1';
    insert into private.course_design_target_plan_items(course_id,didactic_microsequence_id,plan_item_id,plan_item_kind) values('${COURSE}','a','${PART}','scope');
    insert into private.course_design_parameter_assignments values('${COURSE}','density','didactic_microsequence','a','2','author','motivo',now(),'override');
    insert into private.course_authoring_guidance_assignments values('${COURSE}','lesson','l1','{"text":"orientação"}','author','motivo',now());
    insert into private.course_component_policy_assignments values('${COURSE}','study_unit','u1','{"allow":["explanation"]}','author','motivo',now());
    insert into private.course_authoring_parts(id,course_id) values('${PART}','${COURSE}');
    insert into private.course_authoring_part_didactic_microsequences(course_id,authoring_part_id,didactic_microsequence_id,production_position) values
      ('${COURSE}','${PART}','a',0),('${COURSE}','${PART}','b',1),('${COURSE}','${PART}','c',2);
    insert into private.course_sources(course_id,id,data) values('${COURSE}','shared-source','{"pdf":"private-file","metadata":"útil"}');
    insert into private.course_source_attributions(course_id,target_kind,target_id,target_version,target_hash) values
      ('${COURSE}','microsequence_explanation','a',1,'original-hash'),('${COURSE}','study_unit','u1',1,'original-unit-hash');
    insert into private.course_source_attribution_sources select course_id,id,0,'shared-source','supports','original-link','["evidence"]','[{"contentElementId":"literal-a"}]'
      from private.course_source_attributions;
    insert into private.course_source_attribution_anchors select course_id,id,0,0,'shared-source','retained-anchor' from private.course_source_attributions;
    insert into private.course_anchored_annotations values('${COURSE}','a','Observação durável');
  `);
  await db.exec(migration);
  return db;
}
const revisions = db => value(db, "select jsonb_build_array(c.revision,p.version) value from public.courses c join private.course_instructional_plans p on p.course_id=c.id");
const entities = db => value(db, "select jsonb_agg(to_jsonb(e) order by entity_type,entity_id) value from private.course_entities e");
let serial = 0;
async function mutate(db, command, { actor = OWNER, requestId = `structure-${++serial}`, expected } = {}) {
  const [revision, planVersion] = expected || await revisions(db);
  return value(db, "select public.mutate_course_structure_for_actor_v1($1,$2,$3,$4,$5,$6) value", [actor, COURSE, revision, planVersion,
    { parentId: null, position: null, title: null, ...command }, requestId]);
}

test("duplicação mantém descendentes literais, origem aplicada e fontes, sem declaração humana; replay não duplica", async () => {
  const db = await fixture();
  try {
    const expected = await revisions(db);
    const command = { operation: "duplicate", kind: "module", targetId: "m1", title: "Módulo copiado" };
    const first = await mutate(db, command, { expected, requestId: "duplicate-module" });
    assert.equal(first.affectedEntityCount, 5);
    const all = await entities(db), copies = all.filter(item => item.entity_id.startsWith("copy-"));
    assert.equal(copies.length, 5);
    const copiedA = copies.find(item => item.content.title === "A"), copiedB = copies.find(item => item.content.title === "B"), unit = copies.find(item => item.entity_type === "study_unit");
    assert.deepEqual(copiedB.content.dependsOn, [copiedA.entity_id]);
    assert.equal(copiedB.content.branchOf, copiedA.entity_id);
    assert.equal(copiedB.content.explanation.body, "a é texto, não referência");
    assert.equal(unit.parent_id, copiedA.entity_id);
    assert.deepEqual(unit.design_application, { origin: "original" });
    assert.deepEqual(unit.applied_explanation_basis, { microsequenceId: "a", explanationVersion: 7, hash: "original", sourceCourseId: COURSE });
    assert.deepEqual(unit.content_review, {});
    assert.deepEqual(copiedA.content_review, {});
    assert.equal(await value(db, "select count(*)::int value from private.course_sources"), 1);
    assert.equal(await value(db, "select count(*)::int value from private.course_source_attributions"), 4);
    assert.equal(await value(db, "select count(*)::int value from private.course_source_attribution_sources where roles='[\"evidence\"]' and occurrences='[{\"contentElementId\":\"literal-a\"}]'"), 4);
    assert.equal(await value(db, "select count(*)::int value from private.course_source_attribution_anchors where anchor_id='retained-anchor'"), 4);
    assert.equal(await value(db, "select status value from private.course_sources"), "retained");
    assert.equal(await value(db, "select count(*)::int value from private.course_design_parameter_assignments"), 2);
    assert.equal(await value(db, "select count(*)::int value from private.course_authoring_guidance_assignments"), 2);
    assert.equal(await value(db, "select count(*)::int value from private.course_component_policy_assignments"), 2);
    assert.equal(await value(db, "select count(*)::int value from private.course_design_target_plan_items"), 2);
    assert.equal(await value(db, "select count(*)::int value from private.course_anchored_annotations"), 1);
    assert.equal(await value(db, "select count(*)::int value from private.course_authoring_part_didactic_microsequences"), 3);
    assert.deepEqual(await mutate(db, command, { expected, requestId: "duplicate-module" }), { ...first, idempotent: true });
    assert.deepEqual(await entities(db), all);
    await assert.rejects(mutate(db, { ...command, title: "Outra" }, { expected, requestId: "duplicate-module" }), code("23514"));
    assert.equal(await value(db, "select curriculum_map_status value from private.course_instructional_plans"), "draft");
  } finally { await db.close(); }
});

test("mover/remover exige owner e CAS; dependências bloqueiam sem perda e remoção explícita preserva fonte compartilhada", async () => {
  const db = await fixture();
  try {
    const original = await entities(db);
    const move = { operation: "move", kind: "microsequence", targetId: "a", parentId: "l2" };
    await assert.rejects(mutate(db, move, { actor: OTHER }), code("42501"));
    await assert.rejects(mutate(db, move, { expected: [1, 2] }), code("40001"));
    await assert.rejects(mutate(db, move), code("23514"));
    await assert.rejects(mutate(db, { operation: "remove", kind: "microsequence", targetId: "a" }), code("23514"));
    assert.deepEqual(await entities(db), original);
    const moved = await mutate(db, { operation: "move", kind: "lesson", targetId: "l1", parentId: "m2", position: 0 });
    assert.equal(moved.affectedEntityCount, 4);
    assert.equal((await entities(db)).find(item => item.entity_id === "l1").parent_id, "m2");
    const noOp = await mutate(db, { operation: "move", kind: "lesson", targetId: "l1", parentId: "m2", position: 0 });
    assert.equal(noOp.changed, false);
    assert.deepEqual(await revisions(db), [2, 2]);
    const removed = await mutate(db, { operation: "remove", kind: "lesson", targetId: "l1" }, { requestId: "remove-owned-branch" });
    assert.equal(removed.affectedEntityCount, 4);
    assert.deepEqual((await entities(db)).filter(item => item.entity_type === "microsequence").map(item => item.entity_id), ["c"]);
    assert.equal(await value(db, "select production_position value from private.course_authoring_part_didactic_microsequences"), 0);
    assert.equal(await value(db, "select count(*)::int value from private.course_sources"), 1);
    assert.equal(await value(db, "select count(*)::int value from private.course_source_attributions"), 0);
    assert.equal(await value(db, "select count(*)::int value from private.course_anchored_annotations"), 1);
    assert.equal((await mutate(db, { operation: "remove", kind: "lesson", targetId: "l1" }, { expected: [2, 2], requestId: "remove-owned-branch" })).idempotent, true);
    for (const role of ["anon", "authenticated", "service_role"]) {
      assert.equal(await value(db, "select has_function_privilege($1,'public.mutate_course_structure_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,text)','EXECUTE') value", [role]), role === "service_role");
    }
    for (const command of [ { operation: null, kind: "module", targetId: "m1" }, { operation: "move", kind: null, targetId: "m1" },
      { operation: "move", kind: "module", targetId: "m1", position: 0.5 }, { operation: "move", kind: "module", targetId: "m1", extra: "SQL" } ]) {
      await assert.rejects(mutate(db, command), code("22023"));
    }
  } finally { await db.close(); }
});

test("duplicação interna não trunca ramo com mais de 200 entidades ou conteúdo maior que o transporte", async () => {
  const db = await fixture();
  try {
    await db.query(`insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content)
      select $1,'study_unit','large-'||m||'-'||u,'microsequence',m,case when m='a' then u+1 else u end,jsonb_build_object('content',repeat('conteúdo íntegro ',200))
      from unnest(array['a','b']) m cross join generate_series(1,63) u`, [COURSE]);
    // Every sibling group stays within 64; complete descendants exceed the
    // composition DTO's 200-entity/512-KiB limit without crossing a data limit.
    await db.query(`insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content)
      values($1,'lesson','large-lesson','module','m1',1,'{"title":"Outra"}'),($1,'microsequence','large-micro','lesson','large-lesson',0,'{"title":"Grande","dependsOn":[]}'),
        ($1,'microsequence','large-micro2','lesson','large-lesson',1,'{"title":"Outra grande","dependsOn":[]}')`, [COURSE]);
    await db.query(`insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content)
      select $1,'study_unit','extra-'||m||'-'||u,'microsequence',m,u,jsonb_build_object('content',repeat('texto literal ',800))
      from unnest(array['large-micro','large-micro2']) m cross join generate_series(1,64) u`, [COURSE]);
    const first = await mutate(db, { operation: "duplicate", kind: "module", targetId: "m1", title: "Cópia extensa" });
    assert.equal(first.affectedEntityCount, 262);
    assert.equal(await value(db, "select count(*)::int value from private.course_entities where entity_id like 'copy-%'"), 262);
    assert.ok(await value(db, "select sum(octet_length(content::text))::int value from private.course_entities where entity_id like 'copy-%'") > 512 * 1024);
  } finally { await db.close(); }
});

test("ordenação completa de unidades preserva conteúdo e origem; omissão, alvo externo e replay divergente não removem", async () => {
  const db = await fixture();
  try {
    await db.query(`insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content)
      values($1,'study_unit','u2','microsequence','a',2,'{"title":"Outra"}'),($1,'study_unit','u3','microsequence','a',3,'{"title":"Terceira"}')`, [COURSE]);
    const original = (await entities(db)).find(item => item.entity_id === "u1");
    const reorder = (ids, expected = 1, requestId = "unit-order-attempt") => value(db,
      "select public.reorder_course_study_units_for_actor_v1($1,$2,$3,'a',$4,$5) value", [OWNER, COURSE, expected, ids, requestId]);
    await assert.rejects(reorder(["u2", "u1"]), code("23514"));
    await assert.rejects(reorder(["u1", "u1", "u2"]), code("22023"));
    await assert.rejects(reorder(["u1", "u2", "foreign"]), code("23514"));
    const first = await reorder(["u3", "u1", "u2"]);
    assert.equal(first.affectedEntityCount, 3);
    const changed = (await entities(db)).find(item => item.entity_id === "u1");
    assert.equal(changed.position, 2);
    for (const key of ["content", "content_review", "design_snapshot", "design_application", "applied_explanation_basis", "created_origin", "last_revision_origin"]) assert.deepEqual(changed[key], original[key]);
    assert.equal(await value(db, "select count(*)::int value from private.course_source_attributions"), 2);
    assert.deepEqual(await reorder(["u3", "u1", "u2"]), { ...first, idempotent: true });
    await assert.rejects(reorder(["u1", "u2", "u3"]), code("23514"));
    assert.deepEqual(await revisions(db), [2, 1]);
    const noOp = await reorder(["u3", "u1", "u2"], 2, "unchanged-unit-order");
    assert.equal(noOp.changed, false);
    assert.equal(noOp.affectedEntityCount, 0);
  } finally { await db.close(); }
});

test("cópia remapeia referências de tópicos sem substituir texto; remoção bloqueia referência sobrevivente", async () => {
  const db = await fixture();
  try {
    await db.query(`insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content)
      values($1,'topic','topic-a','lesson','l1',0,'{"label":"Tópico útil","kind":"concept"}')`, [COURSE]);
    await db.exec(`
      update private.course_entities set content=content||'{"covers":["topic-a"]}' where entity_id='a';
      update private.course_entities set content=content||'{"topics":["topic-a"],"title":"topic-a é texto"}' where entity_id='u1'`);
    await mutate(db, { operation: "duplicate", kind: "module", targetId: "m1", title: "Com tópicos" });
    const clones = (await entities(db)).filter(item => item.entity_id.startsWith("copy-"));
    const topic = clones.find(item => item.entity_type === "topic");
    assert.deepEqual(clones.find(item => item.content.title === "A").content.covers, [topic.entity_id]);
    const unit = clones.find(item => item.entity_type === "study_unit");
    assert.deepEqual(unit.content.topics, [topic.entity_id]);
    assert.equal(unit.content.title, "topic-a é texto");
    await db.exec("update private.course_entities set content=content||'{\"covers\":[\"topic-a\"]}' where entity_id='c'");
    await assert.rejects(mutate(db, { operation: "remove", kind: "module", targetId: "m1" }), code("23514"));
    await db.exec("select set_config('fixture.role','authenticated',false)");
    await assert.rejects(mutate(db, { operation: "move", kind: "module", targetId: "m1", position: 0 }), code("42501"));
  } finally { await db.close(); }
});
