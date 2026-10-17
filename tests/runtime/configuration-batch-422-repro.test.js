// Evidência da investigação focal: o lote heterogêneo de sete unidades era
// recusado pelo teto herdado de 32 KiB antes da correção. O comportamento
// corrigido está em instructional-command-budget-pglite.test.js.
import test from "node:test";
import assert from "node:assert/strict";
import { analysisId, commandOctets, configurationCommand, courseRevision, delegateParametersToContext, linkAnalysis,
  openInstructionalFixture, parameterValue, planVersion, receiptCount, savePlanItem, snapshotsOfUnits,
  studyUnitParameterDefinitions, writeCommand } from "../support/instructionalCommandBudgetPglite.js";

const ids = ["unit-a", "unit-b", "unit-c", "unit-d", "unit-e", "unit-f", "unit-g"];
const motivo = length => "Justificativa contextual registrada para a unidade. ".repeat(40).slice(0, length);
const applicationOfUnitD = { mode: "expository", introducedInstructionalAnalysisUnitIds: [analysisId], usedInstructionalAnalysisUnitIds: [],
  curriculumScopeItemIds: [], explanationApplications: [{ instructionalAnalysisUnitId: analysisId, developedForms: ["plain_definition"],
    notApplicable: [{ form: "concrete_example", reason: "Esta unidade não comporta exemplo concreto." }] }], practiceApplications: [] };

test("lote heterogêneo de sete unidades: o único guard dependente do conjunto era o teto agregado", async () => {
  const db = await openInstructionalFixture({ unitIds: ids });
  try {
    await writeCommand(db, savePlanItem(analysisId), "repro-analysis");
    await writeCommand(db, linkAnalysis([analysisId]), "repro-links");
    const definitions = studyUnitParameterDefinitions().slice(0, 6);
    await delegateParametersToContext(db, definitions);
    const calibration = (length, overrides = {}) => definitions.map(definition => ({ parameterId: definition.id,
      value: overrides[definition.id] ?? parameterValue(definition), reason: motivo(length) }));
    const entries = (length, { application = false } = {}) => ids.map(id => ({ studyUnitId: id, expectedStudyUnitVersion: 1,
      automaticParameters: calibration(length, id === "unit-d" && application
        ? { new_analysis_unit_ceiling_per_expository_study_unit: 3 } : {}),
      ...(id === "unit-d" && application ? { application: applicationOfUnitD } : {}) }));
    const sizeOf = async length => commandOctets(db, { ...configurationCommand(entries(length)), expectedPlanVersion: await planVersion(db) });

    const control = await writeCommand(db, configurationCommand(entries(40)), "repro-seven-short");
    assert.equal(control.changed, true, "sete unidades com motivo curto passam no teto herdado");

    let low = 0;
    let high = 1000;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (await sizeOf(middle) <= 32768) low = middle; else high = middle - 1;
    }
    const limit = low;
    const sizeAtLimit = await sizeOf(limit);
    const sizeOverLimit = await sizeOf(limit + 1);
    assert.ok(sizeAtLimit <= 32768, `no teto herdado: ${sizeAtLimit}`);
    assert.ok(sizeOverLimit > 32768, `acima do teto herdado: ${sizeOverLimit}`);
    console.log(JSON.stringify({ motivoMaximoNoTetoHerdado: limit, octetosNoLimite: sizeAtLimit,
      octetosAcimaDoLimite: sizeOverLimit, motivoCurto: await sizeOf(40) }));

    const under = await writeCommand(db, configurationCommand(entries(limit)), "repro-seven-under");
    assert.equal(under.changed, true);
    const before = await snapshotsOfUnits(db);
    const revisionBefore = await courseRevision(db);
    await assert.rejects(writeCommand(db, configurationCommand(entries(limit + 1)), "repro-seven-over"),
      error => error.code === "22023" && error.message === "Comando instrucional inválido.");
    assert.equal(await receiptCount(db, ["repro-seven-over"]), 0);
    assert.deepEqual(await snapshotsOfUnits(db), before, "a recusa não gravou parte do lote");
    assert.equal(await courseRevision(db), revisionBefore);

    const units = entries(limit + 1, { application: true });
    let failure = null;
    await assert.rejects(writeCommand(db, configurationCommand(units), "repro-seven-together"),
      error => { failure = error; return error.code === "22023" && error.message === "Comando instrucional inválido."; });
    assert.equal(failure.code, "22023", "os mesmos objetos juntos eram recusados");
    assert.equal(await receiptCount(db, ["repro-seven-together"]), 0);
    assert.equal((await writeCommand(db, configurationCommand(units.slice(0, 6)), "repro-six")).changed, true);
    assert.equal((await writeCommand(db, configurationCommand(units.slice(6)), "repro-one")).changed, true);
    assert.equal(await receiptCount(db, ["repro-six", "repro-one"]), 2, "os mesmos objetos separados em 6 + 1 são aceitos");
  } finally { await db.close(); }
});

