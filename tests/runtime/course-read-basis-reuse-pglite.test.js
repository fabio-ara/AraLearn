// Prova focal da migração de reuso intrarrequisição da base de inspeção.
// As migrações reais rodam em PGlite; `require_service_role` e
// `require_course_access_v1` são STUBS LOCAIS de autenticação (a rota real é
// coberta pelo CI no Postgres hospedado), e `course_source_json_hash_v1`/
// `course_content_media_hashes_v1` são stubs de digest/mídia. Nada aqui é prova
// de acesso hospedado nem de revisão semântica.
//
// Verifica: payload observável idêntico antes/depois para os estados
// current/pending/unregistered, objeto ausente, unidade com base nula e
// Explicação sem corpo; upgrade que não altera dado, revisão, recibo nem o
// carimbo `inspectedAt`; volatilidade, autoridade, `search_path` e ACL
// preservados com detector validado por controles; seis dimensões com evidência
// literal, separação IA/humana, recusa de base obsoleta, negação por papel/ator
// e replay idempotente.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const OWNER = "10000000-0000-4000-8000-000000000001";
const OTHER = "10000000-0000-4000-8000-000000000002";
const COURSE = "20000000-0000-4000-8000-000000000001";
const ATTRIBUTION = "30000000-0000-4000-8000-000000000001";
const REUSE_MIGRATION = "20261007234650_reuse_inspection_basis_within_read.sql";
const migration = (name) => fs.readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
function functionSql(source, name) {
  const start = source.search(new RegExp(`create(?: or replace)? function ${name.replaceAll(".", "\\.")}\\(`, "iu"));
  assert.ok(start >= 0, "função ausente: " + name);
  const body = source.slice(start);
  const end = /\$function\$\s*;/u.exec(body);
  assert.ok(end);
  return body.slice(0, end.index + end[0].length);
}
const queryValue = async (db, sql, params = []) => (await db.query(sql, params)).rows[0].value;
const canonical = (value) => JSON.stringify(value);

// Parecer com as seis dimensões e evidência literal presente na base ("Base" é
// o título da microssequência no fixture).
const report = { summary: "Inspeção sintética da base.", outcome: "consistent", findings: [],
  checks: ["alignment", "evidence", "representation", "feedback", "sufficiency", "configuration"]
    .map(dimension => ({ dimension, result: "sufficient", reason: "Relação exposta na base.",
      evidence: ["Base"] })) };

async function fixture({ reuse = false } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema private;
    create function public.get_aralearn_runtime_manifest() returns jsonb language sql as
      $$select '{"schemaRevision":"20261005120000","features":[]}'::jsonb$$;
    create table public.courses(id uuid primary key, owner_id uuid, revision bigint default 1,
      bibliography_style text default 'abnt-2025', content_review_policy text default 'saved', updated_at timestamptz);
    create table private.course_entities(course_id uuid,entity_type text,entity_id text,parent_id text,
      position integer,content_review jsonb,content jsonb,version bigint default 1,design_snapshot jsonb,design_application jsonb,
      primary key(course_id,entity_type,entity_id));
    create table private.course_source_attributions(course_id uuid,id uuid,target_kind text,target_id text);
    create table private.course_source_attribution_sources(course_id uuid,attribution_id uuid,source_id text,relation text,
      link_id text default 'link-a',source_ordinal integer default 0,roles text[] default '{technical_conceptual}',occurrences jsonb default '[]');
    create table private.course_source_attribution_anchors(course_id uuid,attribution_id uuid,anchor_id text,
      source_ordinal integer default 0,anchor_ordinal integer default 0);
    create table private.course_sources(course_id uuid,source_id text,title text,status text default 'active',revision bigint default 1,
      citation_text text,url text,verification_status text default 'author_verified');
    create table private.course_source_anchors(course_id uuid,anchor_id text,source_id text,content_hash text,selector jsonb,
      status text default 'active',human_locator text,verification_excerpt text);
    create table private.course_source_attachments(course_id uuid,source_id text,content_hash text,status text,public_file_access text);
    create table private.course_media(course_id uuid,content_hash text,status text,byte_size bigint,media_type text);
    create table private.course_design_target_plan_items(course_id uuid,didactic_microsequence_id text,plan_item_id uuid);
    create table private.course_instructional_plan_items(course_id uuid,id uuid,item_kind text,statement text,description text);
    create table private.course_instructional_plans(course_id uuid,audience text);
    create table private.course_change_receipts(actor_id uuid,request_id text,operation text,course_id uuid,request_hash text,result jsonb,
      primary key(actor_id,request_id), constraint course_change_receipts_operation_fixture check(operation='set_content_review'));
    create function private.course_source_json_hash_v1(jsonb) returns text language sql immutable as $$select repeat(md5($1::text),2)$$;
    create function private.course_content_media_hashes_v1(jsonb) returns setof text language sql as $$select null::text where false$$;
    create function private.require_service_role() returns void language plpgsql as $$begin
      if current_setting('fixture.role',true) is distinct from 'service_role' then raise exception 'role' using errcode='42501'; end if; end$$;
    create function private.require_course_access_v1(course uuid,actor uuid,writing boolean) returns void language plpgsql as $$begin
      if not exists(select 1 from public.courses where id=course and owner_id=actor) then raise exception 'access' using errcode='42501'; end if; end$$;
    create function private.require_course_review_session_v1(uuid) returns uuid language sql as $$select '${OWNER}'::uuid$$;
    -- Controles do detector de ACL: aberto ao PUBLIC por padrão e fechado por revoke.
    create function private.zz_acl_open_v1() returns integer language sql as $$select 1$$;
    create function private.zz_acl_closed_v1() returns integer language sql as $$select 1$$;
    revoke all on function private.zz_acl_closed_v1() from public;
    insert into public.courses(id,owner_id) values('${COURSE}','${OWNER}');
    insert into private.course_entities(course_id,entity_type,entity_id,parent_id,position,content) values
      ('${COURSE}','microsequence','ms','lesson',0,'{"title":"Base","dependsOn":[],"explanation":{"title":"Base","content":[]}}'),
      ('${COURSE}','microsequence','ms-vazia','lesson',1,'{"title":"Sem corpo","dependsOn":[],"explanation":null}'),
      ('${COURSE}','study_unit','u1','ms',1,'{"title":"Primeira","role":"theory","content":[],"response":null,"feedback":[],"topics":[]}'),
      ('${COURSE}','study_unit','u2','ms',2,'{"title":"Segunda","role":"theory","content":[],"response":null,"feedback":[],"topics":[]}'),
      ('${COURSE}','study_unit','u3','ms',3,null),
      ('${COURSE}','study_unit','u4','ms-vazia',1,'{"title":"Quarta","role":"theory","content":[],"response":null,"feedback":[],"topics":[]}');
    insert into private.course_source_attributions values('${COURSE}','${ATTRIBUTION}','study_unit','u1');
    insert into private.course_source_attribution_sources(course_id,attribution_id,source_id,relation)
      values('${COURSE}','${ATTRIBUTION}','source-a','supported_by');
    insert into private.course_source_attribution_anchors values('${COURSE}','${ATTRIBUTION}','anchor-a',0,0);
    insert into private.course_sources(course_id,source_id,title) values('${COURSE}','source-a','Fonte A');
    insert into private.course_source_anchors(course_id,anchor_id,source_id,selector,human_locator)
      values('${COURSE}','anchor-a','source-a','{"kind":"text_quote","exact":"Base"}','Seção 1');
    insert into private.course_instructional_plans(course_id,audience) values('${COURSE}','Estudantes');
    select set_config('fixture.role','service_role',false);
  `);
  const receiptDefinition = await migration("20260817140000_course_identity_cutover.sql");
  const receiptConstraint = receiptDefinition.match(/constraint course_change_receipts_result_v1 check\([\s\S]*?\n {2}\)/u)?.[0];
  assert.ok(receiptConstraint, "a fixture deve aplicar a constraint literal de tamanho do recibo");
  await db.exec(`alter table private.course_change_receipts add ${receiptConstraint}`);
  await db.exec(functionSql(await migration("20260905101903_contextual_course_sources.sql"), "private.course_source_links_v1"));
  const reviewAccess = await migration("20260909025232_contextual_content_review_access.sql");
  await db.exec(functionSql(reviewAccess, "private.course_content_basis_hash_v1"));
  await db.exec(functionSql(reviewAccess, "private.course_content_review_payload_v1"));
  await db.exec(functionSql(reviewAccess, "public.get_course_content_review_for_actor_v1"));
  await db.exec(await migration("20260916025342_contextual_ai_inspection.sql"));
  await db.exec(await migration("20260924164623_revisao_v7_pedagogical_inspection.sql"));
  const focalMigration = await migration("20260924175938_revisao_v7_focal_audit_basis.sql");
  const materializationBlock = /do \$focal_curricular_dependencies\$[\s\S]*?end \$focal_curricular_dependencies\$;/u;
  assert.match(focalMigration, materializationBlock);
  await db.exec(focalMigration.replace(materializationBlock, ""));
  await db.exec(functionSql(reviewAccess, "private.course_content_review_v1"));
  await db.exec(await migration("20260930010000_pedagogical_basis_study_order.sql"));
  await db.exec(await migration("20260928094500_compact_ai_inspection_receipts.sql"));
  await db.exec(await migration("20260928110000_configuration_realization_inspection.sql"));
  if (reuse) await db.exec(await migration(REUSE_MIGRATION));
  return db;
}

const read = (db, id = "u1", kind = "study_unit", actor = OWNER) => queryValue(db,
  "select public.get_course_ai_inspection_for_actor_v1($1,$2,$3,$4) value", [actor, COURSE, kind, id]);
const record = (db, request, { id = "u1", kind = "study_unit", hash, value = report, actor = OWNER } = {}) => queryValue(db,
  "select public.record_course_ai_inspection_for_actor_v1($1,$2,$3,$4,$5,$6,$7) value",
  [actor, COURSE, kind, id, hash ?? null, value, request]);
const basisHashOf = async (db, id, kind) => (await read(db, id, kind)).basisHash;

// `inspectedAt` é o único campo que difere entre bancos distintos (carimbo da
// gravação); o teste de upgrade no MESMO fixture compara o payload literal.
const withoutStamp = (value) => {
  const clone = structuredClone(value);
  if (clone.inspection) delete clone.inspection.inspectedAt;
  return JSON.stringify(clone);
};

// Detector de ACL baseado no ACL efetivo: cobre o caso `proacl` nulo (padrão
// aberto ao PUBLIC) porque usa acldefault('f', proowner) quando não há ACL.
const aclState = async (db, signature, role) => queryValue(db, `select jsonb_build_object(
  'publicExecute',exists(select 1 from pg_proc p cross join lateral
    aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
    where p.oid=$1::regprocedure and acl.grantee=0 and acl.privilege_type='EXECUTE'),
  'roleExecute',has_function_privilege($2,$1::regprocedure,'execute')) value`, [signature, role]);

async function fullDataSnapshot(db) {
  return await queryValue(db, `select jsonb_build_object(
    'entities',(select jsonb_agg(to_jsonb(e) order by e.entity_type,e.entity_id) from private.course_entities e),
    'sources',(select jsonb_agg(to_jsonb(s) order by s.source_id) from private.course_sources s),
    'attributions',(select jsonb_agg(to_jsonb(a) order by a.target_kind,a.target_id) from private.course_source_attributions a),
    'links',(select jsonb_agg(to_jsonb(l) order by l.attribution_id,l.link_id) from private.course_source_attribution_sources l),
    'attributionAnchors',(select jsonb_agg(to_jsonb(a) order by a.attribution_id,a.anchor_id)
      from private.course_source_attribution_anchors a),
    'sourceAnchors',(select jsonb_agg(to_jsonb(a) order by a.anchor_id) from private.course_source_anchors a),
    'planItems',(select jsonb_agg(to_jsonb(p) order by p.id) from private.course_instructional_plan_items p),
    'plans',(select jsonb_agg(to_jsonb(p) order by p.course_id) from private.course_instructional_plans p),
    'receipts',(select jsonb_agg(to_jsonb(r) order by r.request_id) from private.course_change_receipts r),
    'course',(select to_jsonb(c) from public.courses c where c.id=$1)) value`, [COURSE]);
}

async function forceLegacyBasis(db, id) {
  const hash = await basisHashOf(db, id, "study_unit");
  await db.exec("select set_config('aralearn.ai_inspection_write','semantic-inspection-command',false)");
  await db.query("update private.course_entities set ai_inspection=jsonb_build_object('legacyBasisHash',$3::text)" +
    " where course_id=$1 and entity_id=$2", [COURSE, id, hash]);
  return hash;
}

test("reuso preserva o payload em current, pending, unregistered, ausente, base nula e Explicação sem corpo", async () => {
  const base = await fixture();
  const reuse = await fixture({ reuse: true });
  try {
    const targets = [["u1", "study_unit"], ["ms", "microsequence_explanation"],
      ["u3", "study_unit"], ["ms-vazia", "microsequence_explanation"]];
    // Só os alvos cuja base contém o título "Base" recebem parecer de prova.
    const reportable = new Set(["u1|study_unit", "ms|microsequence_explanation"]);
    for (const [id, kind] of targets) {
      assert.equal(withoutStamp(await read(reuse, id, kind)), withoutStamp(await read(base, id, kind)),
        `pending difere em ${kind}/${id}`);
      const hash = await basisHashOf(base, id, kind);
      assert.equal(hash, await basisHashOf(reuse, id, kind), `basisHash difere em ${kind}/${id}`);
      if (!reportable.has(`${id}|${kind}`)) continue;
      await record(base, `current-${id}`, { id, kind, hash });
      await record(reuse, `current-${id}`, { id, kind, hash });
      const [left, right] = [await read(base, id, kind), await read(reuse, id, kind)];
      assert.equal(withoutStamp(left), withoutStamp(right), `current difere em ${kind}/${id}`);
      assert.match(left.inspection.inspectedAt, /^\d{4}-\d{2}-\d{2}T/u, "carimbo presente");
      assert.match(right.inspection.inspectedAt, /^\d{4}-\d{2}-\d{2}T/u, "carimbo presente");
      assert.equal(left.inspection.report.outcome, "consistent");
      assert.equal(await queryValue(reuse, "select private.course_ai_inspection_pending_v1($1,$2,$3) value",
        [COURSE, kind, id]), false, "parecer corrente não fica pendente");
    }
    // Base nula: a unidade u3 tem `content = null` e ainda produz payload estável.
    assert.equal((await read(reuse, "u3")).pedagogicalBasis.studyUnits
      .find(unit => unit.id === "u3").content, null);
    // unregistered: base anterior reconhecida como legado.
    const legacyHash = await forceLegacyBasis(base, "u1");
    await forceLegacyBasis(reuse, "u1");
    assert.equal((await read(base)).inspection.state, "unregistered");
    assert.equal((await read(reuse)).inspection.state, "unregistered");
    assert.equal((await read(reuse)).basisHash, legacyHash);
    assert.equal(withoutStamp(await read(reuse)), withoutStamp(await read(base)));
    // objeto ausente: mesmo erro nos dois lados.
    const failure = async db => { try { await read(db, "unit-ausente"); return null; }
      catch (error) { return { code: error.code, message: error.message }; } };
    assert.deepEqual(await failure(reuse), await failure(base));
    assert.equal((await failure(reuse)).code, "22023");
  } finally { await base.close(); await reuse.close(); }
});

test("upgrade no mesmo fixture preserva payload literal com carimbo, recibo e dados semeados", async () => {
  const db = await fixture();
  try {
    // Parecer ANTES da migração: o carimbo passa a existir nos dados.
    const unitHash = await basisHashOf(db, "u1", "study_unit");
    await record(db, "pre-upgrade-unit-01", { hash: unitHash });
    const expHash = await basisHashOf(db, "ms", "microsequence_explanation");
    await record(db, "pre-upgrade-exp-01", { id: "ms", kind: "microsequence_explanation", hash: expHash });
    const beforeUnit = await read(db, "u1");
    const beforeExp = await read(db, "ms", "microsequence_explanation");
    const beforeData = await fullDataSnapshot(db);
    const beforeFeatures = await queryValue(db, "select public.get_aralearn_runtime_manifest()->'features' value");
    assert.match(beforeUnit.inspection.inspectedAt, /^\d{4}-\d{2}-\d{2}T/u);

    await db.exec(await migration(REUSE_MIGRATION));

    assert.deepEqual(await read(db, "u1"), beforeUnit, "payload literal com carimbo permanece idêntico");
    assert.deepEqual(await read(db, "ms", "microsequence_explanation"), beforeExp);
    assert.equal(canonical(await fullDataSnapshot(db)), canonical(beforeData),
      "entidades, fontes, vínculos, âncoras, planos e recibos permanecem idênticos");
    assert.equal(beforeData.entities.filter(entity => entity.ai_inspection !== null).length >= 2, true,
      "o snapshot contém pareceres gravados, não só contagens");
    assert.equal(beforeData.receipts.length, 2, "os dois recibos integram o snapshot");
    assert.equal(await queryValue(db, "select public.get_aralearn_runtime_manifest()->>'schemaRevision' value"),
      "20261007234650");
    assert.equal(canonical(await queryValue(db, "select public.get_aralearn_runtime_manifest()->'features' value")),
      canonical(beforeFeatures), "nenhuma capacidade nova é declarada");
    assert.equal(await queryValue(db, "select private.course_ai_inspection_pending_v1($1,'study_unit','u1') value",
      [COURSE]), false, "o parecer corrente continua corrente");
  } finally { await db.close(); }
});

test("volatilidade, autoridade, search_path e ACL preservados com detector validado por controles", async () => {
  const db = await fixture();
  try {
    await db.exec(await migration(REUSE_MIGRATION));
    // Controles negativos/positivos do detector: PUBLIC aberto x fechado.
    assert.equal((await aclState(db, "private.zz_acl_open_v1()", "service_role")).publicExecute, true,
      "o detector reconhece o EXECUTE padrão do PUBLIC");
    assert.equal((await aclState(db, "private.zz_acl_closed_v1()", "service_role")).publicExecute, false,
      "o detector não confunde revoke com ACL ausente");
    for (const signature of ["private.course_ai_inspection_basis_hash_v1(uuid,text,text)",
      "private.course_ai_inspection_state_v1(uuid,text,text)",
      "private.course_ai_inspection_payload_v1(uuid,text,text)",
      "private.course_ai_inspection_hash_of_bases_v1(uuid,text,text,text,jsonb)",
      "private.course_ai_inspection_state_of_hash_v1(uuid,text,text,text)"]) {
      const metadata = await queryValue(db, `select jsonb_build_object(
        'volatile',(select provolatile from pg_proc where oid=$1::regprocedure),
        'secdef',(select prosecdef from pg_proc where oid=$1::regprocedure),
        'searchPath',(select proconfig from pg_proc where oid=$1::regprocedure)) value`, [signature]);
      assert.equal(metadata.volatile, "s", `${signature} precisa continuar stable`);
      assert.equal(metadata.secdef, true, `${signature} precisa continuar security definer`);
      assert.deepEqual(metadata.searchPath, ["search_path=pg_catalog"], `${signature} precisa manter o search_path`);
      for (const role of ["anon", "authenticated", "service_role"]) {
        const acl = await aclState(db, signature, role);
        assert.equal(acl.publicExecute, false, `${signature} não pode ter EXECUTE para PUBLIC`);
        assert.equal(acl.roleExecute, false, `${signature} não pode ter EXECUTE para ${role}`);
      }
    }
    assert.equal((await aclState(db, "public.get_course_ai_inspection_for_actor_v1(uuid,uuid,text,text)",
      "service_role")).roleExecute, true, "o canal de leitura continua acessível ao service_role");
    assert.equal((await aclState(db, "public.get_course_ai_inspection_for_actor_v1(uuid,uuid,text,text)",
      "anon")).roleExecute, false, "o canal de leitura continua fechado ao anon");
  } finally { await db.close(); }
});

test("reuso mantém seis dimensões, evidência literal, IA/humana, base obsoleta, revogação e replay", async () => {
  const db = await fixture({ reuse: true });
  try {
    const stale = await basisHashOf(db, "u1", "study_unit");
    await db.exec("update private.course_entities set content=content||'{\"goal\":\"Base posterior\"}' where entity_id='ms'");
    const current = await basisHashOf(db, "u1", "study_unit");
    assert.notEqual(current, stale, "a base mudou de fato");
    await assert.rejects(record(db, "obsolete-basis-01", { hash: stale }), { code: "PT409" });
    const refused = await read(db);
    assert.equal(refused.inspection.state, "pending", "a recusa não grava parecer");
    assert.equal(Object.hasOwn(refused.inspection, "report"), false);
    assert.equal(await queryValue(db,
      "select private.course_ai_inspection_pending_v1($1,'study_unit','u1') value", [COURSE]), true);
    assert.equal((await queryValue(db,
      "select private.course_content_review_v1($1,'study_unit','u1') value", [COURSE])).state,
    "unregistered", "inspeção de IA não vira revisão humana");
    await assert.rejects(record(db, "ungegrounded-01",
      { hash: current, value: { ...report, checks: report.checks.map(check =>
        ({ ...check, evidence: ["Trecho que não está na base."] })) } }), { code: "22023" });
    await assert.rejects(record(db, "five-dimensions-01",
      { hash: current, value: { ...report, checks: report.checks.slice(0, 5) } }), { code: "22023" });
    // Revogação pelo caminho real do stub: papel e ator negados.
    await db.exec("select set_config('fixture.role','authenticated',false)");
    await assert.rejects(read(db), { code: "42501" }, "papel sem service_role é negado");
    await db.exec("select set_config('fixture.role','service_role',false)");
    await assert.rejects(read(db, "u1", "study_unit", OTHER), { code: "42501" },
      "ator sem acesso ao curso é negado");
    // Replay idempotente: mesmo request/report conserva recibo, identidade e contadores.
    const receiptCount = async () => queryValue(db,
      "select count(*)::int value from private.course_change_receipts");
    const revision = async () => queryValue(db, "select revision value from public.courses where id=$1", [COURSE]);
    const saved = await record(db, "replay-identity-01", { hash: current });
    assert.equal(saved.inspection.state, "current");
    const counters = { receipts: await receiptCount(), revision: await revision() };
    assert.equal(counters.receipts, 1);
    const replay = await record(db, "replay-identity-01", { hash: current });
    assert.deepEqual(replay, { ...saved, idempotent: true });
    assert.deepEqual({ receipts: await receiptCount(), revision: await revision() }, counters,
      "o replay não duplica recibo nem avança a revisão");
    const stored = await queryValue(db,
      "select jsonb_build_object('actor',actor_id,'request',request_id,'hash',request_hash,'operation',operation) value" +
      " from private.course_change_receipts where request_id='replay-identity-01'");
    assert.deepEqual(stored, { actor: OWNER, request: "replay-identity-01",
      hash: stored.hash, operation: "record_ai_inspection" });
    assert.equal(stored.hash.length, 64);
    assert.equal((await read(db)).inspection.report.checks.length, 6);
  } finally { await db.close(); }
});
