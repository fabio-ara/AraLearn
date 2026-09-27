import assert from "node:assert/strict";
import test from "node:test";
import { fixture, COURSE, PART, IDEA, EVIDENCE, parameters } from "../support/authoringMaterializationPglite.js";
import { COURSE_COMPONENT_CATALOG_VERSION } from "../../src/domain/courseDesignParameters.js";

const policyCompleta = { policy: { catalogVersion: COURSE_COMPONENT_CATALOG_VERSION, availability: "all",
    allowedRefs: [], excludedRefs: [], preferredRefs: [] },
  origin: "system_default", sourceScopeKind: null };

const unit = (id, position, { micro = "micro", introduced = false, developedForms = [], practices = [], text = id } = {}) => ({
  studyUnitId: id, didacticMicrosequenceId: micro, position, content: { title: id, role: "theory", content: [{ text }] },
  designSnapshot: { contract: "aralearn.study-unit-design-snapshot.v2", parameterCatalogVersion: "1.2.0", didacticMicrosequenceId: micro,
    instructionalAnalysisUnitIds: [IDEA], evidenceRequirementIds: [EVIDENCE], parameters, editorialDirections: [], componentPolicy: policyCompleta },
  designApplication: { mode: practices.length ? "mixed" : "expository", introducedInstructionalAnalysisUnitIds: introduced ? [IDEA] : [],
    usedInstructionalAnalysisUnitIds: [], curriculumScopeItemIds: [], explanationApplications: [{ instructionalAnalysisUnitId: IDEA,
      developedForms, notApplicable: [] }], practiceApplications: practices, componentRefs: [] }, sourceLinks: []
});
const placement = value => ({ studyUnitId: value.studyUnitId, didacticMicrosequenceId: value.didacticMicrosequenceId, position: value.position });
const targets = [{ didacticMicrosequenceId: "micro", instructionalAnalysisUnitIds: [IDEA], evidenceRequirementIds: [EVIDENCE] }];

async function write(db, units, placements, { complete = false, revision = 1, request = "fragment-0001", explanations = [], hash = "a".repeat(64), targetPlanItems = targets } = {}) {
  return (await db.query("select public.materialize_course_authoring_part_for_actor_v2($1,$1,$2,$3,1,'[]',$4,$5,$6,$7,$8,$9,$10) value",
    [COURSE, PART, revision, targetPlanItems, units, request, hash, explanations, complete, placements])).rows[0].value;
}
// A cadeia A→B→C ocupa a mesma parte: o foco original do fixture vira A e B/C
// entram como membros anexados, com os vínculos que o repertório exige.
async function arrangeChain(db) {
  await db.query(`update private.course_authoring_part_didactic_microsequences set didactic_microsequence_id='micro-a'
    where course_id=$1 and authoring_part_id=$2 and didactic_microsequence_id='micro'`, [COURSE, PART]);
  await db.query(`update private.course_design_target_plan_items set didactic_microsequence_id='micro-a'
    where course_id=$1 and didactic_microsequence_id='micro'`, [COURSE]);
  await db.query("insert into private.course_authoring_part_didactic_microsequences values($1,$2,'micro-b'),($1,$2,'micro-c')", [COURSE, PART]);
  await db.query(`insert into private.course_design_target_plan_items values
    ($1,'micro-b',$2,'instructional_analysis_unit'),($1,'micro-b',$3,'evidence_requirement'),
    ($1,'micro-c',$2,'instructional_analysis_unit'),($1,'micro-c',$3,'evidence_requirement')`, [COURSE, IDEA, EVIDENCE]);
  await db.query(`insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content) values
    ($1,'microsequence','micro-a','lesson','lesson',1,'{"title":"A","dependsOn":[]}'::jsonb),
    ($1,'microsequence','micro-b','lesson','lesson',2,'{"title":"B","dependsOn":["micro-a"]}'::jsonb),
    ($1,'microsequence','micro-c','lesson','lesson',3,'{"title":"C","dependsOn":["micro-b"]}'::jsonb)`, [COURSE]);
  const practice = micro => [{ evidenceRequirementId: EVIDENCE, opportunityId: `case-${micro}`,
    invariantTaskOperation: "Distinguir os casos", variedDimensions: [] }];
  return { batchTarget: micro => ({ didacticMicrosequenceId: micro,
      instructionalAnalysisUnitIds: [IDEA], evidenceRequirementIds: [EVIDENCE] }),
    a: unit("unit-a", 1, { micro: "micro-a", introduced: true, developedForms: ["plain_definition", "concrete_example"], practices: practice("micro-a") }),
    b: unit("unit-b", 1, { micro: "micro-b", developedForms: ["plain_definition"], practices: practice("micro-b") }),
    c: unit("unit-c", 1, { micro: "micro-c", developedForms: ["plain_definition"], practices: practice("micro-c") }) };
}
const materializationSnapshot = async db => ({
  entities: (await db.query("select * from private.course_entities order by entity_type,entity_id")).rows,
  receipts: (await db.query("select * from private.course_change_receipts order by request_id")).rows,
  parts: (await db.query("select * from private.course_authoring_parts")).rows,
  courses: (await db.query("select * from public.courses")).rows });

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

test("fragmento ignora metadados incompletos de unidade preservada independente", async () => {
  const db = await fixture();
  try {
    await db.query(`insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content)
      values($1,'microsequence','micro-legacy','lesson','lesson',1,'{"title":"Legado independente","dependsOn":[]}'::jsonb)`, [COURSE]);
    await db.query("insert into private.course_authoring_part_didactic_microsequences values($1,$2,'micro-legacy')", [COURSE, PART]);
    await db.query(`insert into private.course_entities(
      course_id,entity_type,entity_id,parent_type,parent_id,position,content
    ) values($1,'study_unit','legacy-u','microsequence','micro-legacy',1,
      '{"title":"Unidade antiga sem metadados de desenho","role":"theory","content":[]}'::jsonb)`, [COURSE]);

    const focal = unit("unit-a", 1, { introduced: true, developedForms: ["plain_definition"] });
    const placements = [placement(focal), {
      studyUnitId: "legacy-u",
      didacticMicrosequenceId: "micro-legacy",
      position: 1
    }];
    const partial = await write(db, [focal], placements, { request: "focal-independent-001" });
    assert.equal(partial.changed, true);

    await assert.rejects(write(db, [focal], placements, {
      complete: true,
      revision: partial.courseRevision,
      request: "complete-with-incomplete-legacy-001",
      targetPlanItems: [...targets, {
        didacticMicrosequenceId: "micro-legacy",
        instructionalAnalysisUnitIds: [],
        evidenceRequirementIds: []
      }]
    }));
  } finally { await db.close(); }
});

test("fragmento bloqueia dependência pedagógica preservada realmente afetada", async () => {
  const db = await fixture();
  try {
    const preserved = unit("legacy-dependent", 1, {
      introduced: true,
      developedForms: ["plain_definition"]
    });
    await db.query(`insert into private.course_entities(
      course_id,entity_type,entity_id,parent_type,parent_id,position,content,design_snapshot,design_application
    ) values($1,'study_unit',$2,'microsequence','micro',1,$3,$4,$5)`,
    [COURSE, preserved.studyUnitId, preserved.content, preserved.designSnapshot, preserved.designApplication]);

    const focal = unit("unit-new", 2, {
      introduced: true,
      developedForms: ["plain_definition"]
    });
    await assert.rejects(write(db, [focal], [placement(preserved), placement(focal)], {
      request: "focal-affected-001"
    }), /repete uma ideia já introduzida/u);
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
    assert.equal((await db.query("select has_function_privilege('authenticated','public.materialize_course_authoring_part_for_actor_v2(uuid,uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,jsonb,boolean,jsonb,boolean)','execute') allowed")).rows[0].allowed, false);
  } finally { await db.close(); }
});

test("cadeia A→B→C da mesma parte exige o pré-requisito produzido antes do foco seguinte", async () => {
  const db = await fixture();
  try {
    const { batchTarget, a, b, c } = await arrangeChain(db);
    const allTargets = ["micro-a", "micro-b", "micro-c"].map(batchTarget);
    // O foco A não pode ser refém da dependência futura de C.
    const first = await write(db, [a], [placement(a)], { request: "chain-a-001", targetPlanItems: [batchTarget("micro-a")] });
    assert.equal(first.changed, true);
    assert.equal((await db.query("select private.course_authoring_part_progress_v1($1,$2)->>'state' state", [COURSE, PART])).rows[0].state, "partially_materialized");

    // O lote de C não inclui B: o pré-requisito precisa existir materializado.
    const beforeSkip = await materializationSnapshot(db);
    await assert.rejects(write(db, [c], [placement(a), placement(c)],
      { revision: first.courseRevision, request: "chain-skip-b-001", targetPlanItems: [batchTarget("micro-c")] }), /dependencia curricular precisa estar produzida/u);
    assert.deepEqual(await materializationSnapshot(db), beforeSkip);

    const second = await write(db, [b], [placement(a), placement(b)],
      { revision: first.courseRevision, request: "chain-b-001", targetPlanItems: [batchTarget("micro-b")] });
    assert.equal(second.changed, true);
    const kept = async () => (await db.query("select * from private.course_entities where entity_id=any($1) order by entity_id", [["unit-a", "unit-b"]])).rows;
    const preserved = await kept();
    // A conclusão do acumulado ainda não existe: C segue não produzida.
    await assert.rejects(write(db, [b], [placement(a), placement(b)],
      { complete: true, revision: second.courseRevision, request: "chain-premature-001", targetPlanItems: allTargets }),
      /conclusão exige aplicações e cobertura/u);
    assert.deepEqual(await kept(), preserved);

    const done = await write(db, [c], [placement(a), placement(b), placement(c)],
      { complete: true, revision: second.courseRevision, request: "chain-complete-001", targetPlanItems: allTargets });
    assert.equal(done.changed, true);
    assert.deepEqual(await kept(), preserved);
    assert.equal((await db.query("select count(*)::int total from private.course_entities where entity_id='unit-c' and parent_id='micro-c'")).rows[0].total, 1);
    assert.equal((await db.query("select private.course_authoring_part_progress_v1($1,$2)->>'state' state", [COURSE, PART])).rows[0].state, "materialized");
  } finally { await db.close(); }
});

test("dependência curricular aceita quando a produção conjunta integra o mesmo lote", async () => {
  const db = await fixture();
  try {
    const { batchTarget, a, b } = await arrangeChain(db);
    // A e B integram o mesmo lote: a dependência B→A é satisfeita pela produção conjunta.
    const conjunto = await write(db, [a, b], [placement(a), placement(b)],
      { request: "chain-batch-ab-001", targetPlanItems: [batchTarget("micro-a"), batchTarget("micro-b")] });
    assert.equal(conjunto.changed, true);
    assert.equal((await db.query("select count(*)::int total from private.course_entities where entity_type='study_unit'")).rows[0].total, 2);
    assert.equal((await db.query("select count(*)::int total from private.course_entities where entity_type='study_unit' and parent_id='micro-b'")).rows[0].total, 1);
  } finally { await db.close(); }
});

test("dependência curricular ausente fora do lote recusa sem gravar unidade", async () => {
  const db = await fixture();
  try {
    const { batchTarget, a, b } = await arrangeChain(db);
    const antes = await materializationSnapshot(db);
    // B depende de A; o lote produz somente B, então o pré-requisito persistido falta.
    await assert.rejects(write(db, [b], [placement(b)],
      { request: "chain-focal-b-001", targetPlanItems: [batchTarget("micro-b")] }),
    /dependencia curricular precisa estar produzida/u);
    assert.deepEqual(await materializationSnapshot(db), antes);

    // A produzida fora do lote focal libera B no pedido seguinte.
    const primeiro = await write(db, [a], [placement(a)],
      { request: "chain-focal-a-001", targetPlanItems: [batchTarget("micro-a")] });
    const segundo = await write(db, [b], [placement(a), placement(b)],
      { revision: primeiro.courseRevision, request: "chain-focal-b-002", targetPlanItems: [batchTarget("micro-b")] });
    assert.equal(segundo.changed, true);
    assert.equal((await db.query("select count(*)::int total from private.course_entities where entity_type='study_unit' and parent_id='micro-b'")).rows[0].total, 1);
  } finally { await db.close(); }
});

test("controle negativo: sem o bloco corretivo o foco isolado da parte falha pela dependência futura", async () => {
  const db = await fixture({ focalCurricularDependencies: false });
  try {
    const { batchTarget, a } = await arrangeChain(db);
    const before = await materializationSnapshot(db);
    // Sem o escopo focal, a escrita de A valida a dependência futura de C.
    await assert.rejects(write(db, [a], [placement(a)], { request: "control-a-001", targetPlanItems: [batchTarget("micro-a")] }),
      /dependencia curricular precisa estar produzida/u);
    assert.deepEqual(await materializationSnapshot(db), before);
  } finally { await db.close(); }
});

test("mapa em rascunho aceita a primeira Parte somente com autonomia autorizada", async () => {
  const db = await fixture();
  try {
    await db.exec("create or replace function extensions.gen_random_uuid() returns uuid language sql as $fn$select pg_catalog.gen_random_uuid()$fn$");
    await db.query("update private.course_instructional_plans set curriculum_map_status='draft' where course_id=$1", [COURSE]);
    const part = { partId: null, position: 0, title: "Parte 1", intent: "Primeiro agrupamento autorizado.",
      progression: ["Produzir a primeira microssequência."], microsequences: [{ microsequenceId: "micro", position: 0 }] };
    const save = (allowDraftMap, requestId) => db.query(
      "select public.save_course_authoring_part_for_actor_v1($1,$1,1,1,$2,$3,$4,$5) value",
      [COURSE, part, requestId, "a".repeat(64), allowDraftMap]);
    const mine = async () => (await db.query(
      "select count(*)::int total from private.course_authoring_parts where course_id=$1 and title='Parte 1'", [COURSE])).rows[0].total;

    await assert.rejects(save(false, "draft-refused-001"), /aprovacao do mapa curricular/u);
    await assert.rejects(db.query(
      "select public.save_course_authoring_part_for_actor_v1($1,$1,1,1,$2,$3,$4) value",
      [COURSE, part, "draft-default-001", "a".repeat(64)]), /aprovacao do mapa curricular/u);
    await assert.rejects(db.query(
      "select public.save_course_authoring_part_for_actor_v1($1,$1,1,1,$2,$3,$4,null) value",
      [COURSE, part, "draft-null-001", "a".repeat(64)]), /aprovacao do mapa curricular/u);
    assert.equal(await mine(), 0);

    const saved = await save(true, "draft-allowed-001");
    assert.ok(saved.rows[0].value.authoringPartId);
    const again = await save(true, "draft-allowed-001");
    assert.equal(again.rows[0].value.authoringPartId, saved.rows[0].value.authoringPartId);
    assert.equal(again.rows[0].value.idempotent, true);
    assert.equal(await mine(), 1);
    assert.equal((await db.query("select curriculum_map_status status from private.course_instructional_plans where course_id=$1", [COURSE])).rows[0].status, "draft");
    assert.match((await db.query("select pg_get_functiondef('public.save_course_authoring_part_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,text,text,boolean)'::regprocedure) value")).rows[0].value,
      /curriculum_map_status is distinct from 'approved' and p_allow_draft_map is not true/u);
  } finally { await db.close(); }
});
