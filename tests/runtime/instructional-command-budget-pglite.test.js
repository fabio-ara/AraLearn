// Provas focais do orçamento do comando instrucional (256 KiB) e do erro próprio
// de tamanho. Fixture PGlite local; nenhum serviço hospedado e nenhum curso real.
import test from "node:test";
import assert from "node:assert/strict";
import { COURSE_DESIGN_PARAMETER_DEFINITIONS } from "../../src/domain/courseDesignParameters.js";
import {
  analysisId, applyInstructionalCommandBudget, BUDGET_OCTETS, BUDGET_REVISION, commandOctets, configurationCommand,
  courseRevision, delegateParametersToContext, jsonUtf8Bytes, jsonbChars, linkAnalysis, openInstructionalFixture, other,
  parameterValue, planVersion, receiptCount, savePlanItem, snapshotsOfUnits, studyUnitParameterDefinitions, value, writeCommand
} from "../support/instructionalCommandBudgetPglite.js";

const PLAIN_REASON = "Justificativa contextual registrada para a unidade. ";
const ACCENTED_REASON = "Justificação contextual da unidade com ação, explicação e conexão. ";
const reason = (length, seed = PLAIN_REASON) => seed.repeat(Math.ceil(length / seed.length)).slice(0, length);
const unitIds = count => Array.from({ length: count }, (_, index) => index < 7
  ? `unit-${String.fromCharCode(97 + index)}`
  : `unit-${String(index + 1).padStart(2, "0")}`);
const calibrationOf = (definitions, text, overrides = {}) => definitions.map(definition => ({ parameterId: definition.id,
  value: overrides[definition.id] ?? parameterValue(definition), reason: text }));
const unitsOf = (ids, definitions, text, extra = () => ({})) => ids.map(id => ({ studyUnitId: id, expectedStudyUnitVersion: 1,
  automaticParameters: calibrationOf(definitions, text), ...extra(id) }));
const applicationOfUnitD = { mode: "expository", introducedInstructionalAnalysisUnitIds: [analysisId], usedInstructionalAnalysisUnitIds: [],
  curriculumScopeItemIds: [], explanationApplications: [{ instructionalAnalysisUnitId: analysisId, developedForms: ["plain_definition"],
    notApplicable: [{ form: "concrete_example", reason: "Esta unidade não comporta exemplo concreto." }] }], practiceApplications: [] };
const rejectedByBudget = error => error.code === "PT413" && error.message.startsWith("O comando instrucional excede o orçamento de ");
const invalidCalibration = error => error.code === "22023"
  && error.message === "Calibração inválida ou incompatível com uma fixação corrente.";

test("lote normal de sete unidades era recusado no teto herdado e passa a gravar de forma atômica", async () => {
  const ids = unitIds(7);
  const db = await openInstructionalFixture({ unitIds: ids });
  try {
    await writeCommand(db, savePlanItem(analysisId), "budget-analysis");
    await writeCommand(db, linkAnalysis([analysisId]), "budget-links");
    const definitions = studyUnitParameterDefinitions().slice(0, 6);
    await delegateParametersToContext(db, definitions);
    const units = unitsOf(ids, definitions, reason(670), id => id === "unit-d"
      ? { automaticParameters: calibrationOf(definitions, reason(670),
          { new_analysis_unit_ceiling_per_expository_study_unit: 3 }), application: applicationOfUnitD }
      : {});
    const command = configurationCommand(units);
    const octets = await commandOctets(db, { ...command, expectedPlanVersion: await planVersion(db) });
    assert.ok(octets > 32768, `o lote normal excede o teto herdado: ${octets}`);
    assert.ok(octets < BUDGET_OCTETS, `o lote normal cabe no orçamento novo: ${octets}`);
    console.log(JSON.stringify({ loteObservadoSetesUnidadesComAplicacao: octets, motivo: 670, parametros: definitions.length }));
    const before = await snapshotsOfUnits(db);
    const revisionBefore = await courseRevision(db);
    const planBefore = await planVersion(db);
    const featuresBefore = (await value(db, "select public.get_aralearn_runtime_manifest() value")).features;

    await assert.rejects(writeCommand(db, command, "budget-before"),
      error => error.code === "22023" && error.message === "Comando instrucional inválido.");
    assert.equal(await receiptCount(db, ["budget-before"]), 0, "recusa por tamanho não deixa recibo");
    assert.deepEqual(await snapshotsOfUnits(db), before, "recusa por tamanho não altera unidade alguma");
    assert.equal(await courseRevision(db), revisionBefore);

    await applyInstructionalCommandBudget(db);
    const manifest = await value(db, "select public.get_aralearn_runtime_manifest() value");
    assert.equal(manifest.schemaRevision, BUDGET_REVISION);
    assert.deepEqual(manifest.features, featuresBefore, "capacidades correntes preservadas");
    assert.equal(Number(await value(db, "select private.course_instructional_command_bytes_limit_v1() value")), BUDGET_OCTETS);

    const after = await writeCommand(db, command, "budget-after");
    assert.equal(after.changed, true);
    assert.equal(after.commandType, "apply_study_unit_configuration");
    assert.equal(after.requestId, "budget-after");
    assert.equal(await courseRevision(db), revisionBefore + 1);
    assert.equal(await planVersion(db), planBefore, "o planejamento não muda na configuração");
    assert.equal(await receiptCount(db, ["budget-after"]), 1);
    const saved = await value(db, `select jsonb_agg(jsonb_build_object('id',e.entity_id,'reason',p->>'reason','application',e.design_application) order by e.position) value
      from private.course_entities e cross join lateral jsonb_array_elements(e.design_snapshot->'parameters') p
      where e.entity_type='study_unit' and p->>'parameterId'='required_explanation_forms'`);
    assert.equal(saved.length, 7);
    for (const unit of saved) {
      assert.equal(unit.reason, reason(670), `motivo gravado em ${unit.id}`);
      if (unit.id === "unit-d") {
        assert.deepEqual(unit.application.explanationApplications[0].developedForms, ["plain_definition"]);
        assert.deepEqual(unit.application.explanationApplications[0].notApplicable,
          [{ form: "concrete_example", reason: "Esta unidade não comporta exemplo concreto." }]);
      } else {
        assert.deepEqual(unit.application.explanationApplications, []);
      }
    }
    const replay = await writeCommand(db, command, "budget-after", { revision: revisionBefore });
    assert.equal(replay.idempotent, true, "replay da mesma identidade não grava de novo");
    assert.equal(await courseRevision(db), revisionBefore + 1);

    const accentedUnits = unitsOf(ids, definitions, reason(670, ACCENTED_REASON), id => id === "unit-d"
      ? { automaticParameters: calibrationOf(definitions, reason(670, ACCENTED_REASON),
          { new_analysis_unit_ceiling_per_expository_study_unit: 3 }), application: applicationOfUnitD }
      : {});
    const accented = { ...configurationCommand(accentedUnits), expectedPlanVersion: planBefore };
    const accentedOctets = await commandOctets(db, accented);
    const accentedBytes = jsonUtf8Bytes(accented);
    const accentedChars = await jsonbChars(db, accented);
    assert.ok(accentedOctets > accentedBytes, `jsonb mede mais octetos que o JSON UTF-8: ${accentedOctets} > ${accentedBytes}`);
    assert.ok(accentedChars < accentedBytes, `no texto acentuado medido cada acentuado ocupa dois octetos: ${accentedChars} < ${accentedBytes}`);
    assert.ok(accentedOctets < BUDGET_OCTETS);
    console.log(JSON.stringify({ loteObservadoAcentuado: { octetos: accentedOctets, bytesUtf8: accentedBytes, caracteres: accentedChars } }));
  } finally { await db.close(); }
});

test("borda do orçamento, separação de entrada inválida e guardas preservadas", async () => {
  const ids = unitIds(64);
  const db = await openInstructionalFixture({ unitIds: ids });
  try {
    await applyInstructionalCommandBudget(db);
    await writeCommand(db, savePlanItem(analysisId), "boundary-analysis");
    await writeCommand(db, linkAnalysis([analysisId]), "boundary-links");
    const definitions = studyUnitParameterDefinitions().slice(0, 6);
    const fixedParameter = studyUnitParameterDefinitions()[6];
    assert.equal(COURSE_DESIGN_PARAMETER_DEFINITIONS.some(item => item.id === fixedParameter.id), true);
    await delegateParametersToContext(db, definitions);
    const commandWith = (text, extra = () => ({})) => configurationCommand(unitsOf(ids, definitions, text, extra));
    const sizeOf = async text => commandOctets(db, { ...commandWith(text), expectedPlanVersion: await planVersion(db) });
    let low = 0;
    let high = 1000;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (await sizeOf(reason(middle)) <= BUDGET_OCTETS) low = middle; else high = middle - 1;
    }
    const limit = low;
    assert.ok(limit >= 400 && limit < 1000, `motivo máximo por unidade dentro do orçamento: ${limit}`);
    assert.ok(await sizeOf(reason(limit)) <= BUDGET_OCTETS);
    assert.ok(await sizeOf(reason(limit + 1)) > BUDGET_OCTETS);
    console.log(JSON.stringify({ unidades: ids.length, parametros: definitions.length, motivoMaximoNoOrcamento: limit,
      octetosNoLimite: await sizeOf(reason(limit)), octetosAcimaDoLimite: await sizeOf(reason(limit + 1)) }));

    const accepted = await writeCommand(db, commandWith(reason(limit)), "boundary-under");
    assert.equal(accepted.changed, true);
    assert.equal(await value(db, "select count(*)::integer value from private.course_entities e cross join lateral jsonb_array_elements(e.design_snapshot->'parameters') p where e.entity_type='study_unit' and p->>'reason'=$1",
      [reason(limit)]), ids.length * definitions.length);

    const before = await snapshotsOfUnits(db);
    const revisionBefore = await courseRevision(db);
    let failure = null;
    await assert.rejects(writeCommand(db, commandWith(reason(limit + 1)), "boundary-over"),
      error => { failure = error; return rejectedByBudget(error); });
    assert.match(failure.message, new RegExp(`${BUDGET_OCTETS} octetos`, "u"));
    assert.equal(await receiptCount(db, ["boundary-over"]), 0);
    assert.deepEqual(await snapshotsOfUnits(db), before, "excesso de orçamento não grava parte do lote");
    assert.equal(await courseRevision(db), revisionBefore);

    const unknown = commandWith(reason(60));
    unknown.units[0].automaticParameters.push({ parameterId: "parametro_inexistente", value: 1, reason: reason(60) });
    await assert.rejects(writeCommand(db, unknown, "boundary-unknown"), invalidCalibration);
    const fixed = commandWith(reason(60));
    fixed.units[0].automaticParameters.push({ parameterId: fixedParameter.id, value: parameterValue(fixedParameter), reason: reason(60) });
    await assert.rejects(writeCommand(db, fixed, "boundary-fixed"), invalidCalibration);
    assert.deepEqual(await snapshotsOfUnits(db), before, "fixação preservada não muda o lote");
    const malformed = { ...commandWith(reason(limit + 1)), unexpected: true };
    await assert.rejects(writeCommand(db, malformed, "boundary-malformed"),
      error => error.code === "22023" && error.message === "Aplicações instrucionais inválidas.");
    const tooManyUnits = configurationCommand(unitsOf(ids.concat(["unit-extra"]), definitions, reason(limit + 1)));
    await assert.rejects(writeCommand(db, tooManyUnits, "boundary-too-many"),
      error => error.code === "22023" && error.message === "Aplicações instrucionais inválidas.");
    const guidance = { type: "set_guidance", scope: { kind: "course", ref: "20000000-0000-4000-8000-000000000001" },
      guidance: "o".repeat(40000) };
    const delegated = await writeCommand(db, guidance, "boundary-guidance");
    assert.equal(delegated.delegated.type, "set_guidance", "comandos delegados seguem pelo núcleo de preferências");
    assert.equal(delegated.requestId, "boundary-guidance");
    let stale = null;
    await assert.rejects(writeCommand(db, commandWith(reason(limit)), "boundary-stale", { revision: revisionBefore - 1 }),
      error => { stale = error; return error.code === "PT409"; });
    assert.equal(stale.code, "PT409");
    await assert.rejects(writeCommand(db, commandWith(reason(limit)), "boundary-foreign", { actor: other }),
      error => error.code === "42501");
    assert.deepEqual(await snapshotsOfUnits(db), before, "nenhuma recusa gravou parte do lote");
    assert.equal(await courseRevision(db), revisionBefore);
  } finally { await db.close(); }
});

