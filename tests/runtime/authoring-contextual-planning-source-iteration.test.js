import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthoringSourceIterationError,
  auditAuthoringSourceRevision,
  evaluateAuthoringSourceIteration,
  fingerprintCanonicalText,
  loadAuthoringSourceIteration
} from "../../scripts/evaluateAuthoringSourceIteration.mjs";

function fixtures() {
  return structuredClone(loadAuthoringSourceIteration());
}

function fingerprint(content) {
  return fingerprintCanonicalText(content);
}

function refreshFingerprint(input, revision, sourceId, content) {
  const sourceRecord = input.artifact[revision].sources.find(
    ({ id }) => id === sourceId
  );
  Object.assign(sourceRecord, fingerprint(content));
}

test("replay audita baseline Git e revisão final pelas duas fontes canônicas", () => {
  const result = evaluateAuthoringSourceIteration(fixtures());

  assert.equal(
    result.baselineRevision,
    "e720e703a2b4f491905c7be5e98967b8b7f9a470"
  );
  assert.equal(result.baselineMode, "git-object");
  assert.equal(result.sourceCount, 2);
  assert.equal(result.baselineFindingCodes.length, 9);
  assert.deepEqual(result.finalFindingCodes, []);
  assert.equal(result.result, "pass");
});

test("fingerprint canônico não depende dos finais de linha do checkout", () => {
  const input = fixtures();
  const sourceId = "authoring-knowledge";
  input.finalSourceById[sourceId] = input.finalSourceById[sourceId]
    .replace(/\r\n?/gu, "\n")
    .replace(/\n/gu, "\r\n");

  const result = evaluateAuthoringSourceIteration(input);

  assert.equal(result.result, "pass");
  assert.deepEqual(result.finalFindingCodes, []);
});

test("checkout raso falha sem aceitar findings ou fingerprints autodeclarados", () => {
  const input = fixtures();
  input.baselineSourceById = null;

  assert.throws(
    () => evaluateAuthoringSourceIteration(input),
    (error) => {
      assert.ok(error instanceof AuthoringSourceIterationError);
      assert.equal(error.code, "baseline-content-unavailable");
      return true;
    }
  );
});

test("lista vazia de fontes baseline não pode validar finding inventado", () => {
  const input = fixtures();
  input.artifact.baseline.sources = [];
  input.artifact.baseline.findings = [{
    code: "INVENTED",
    title: "Finding não derivado.",
    observations: []
  }];

  assert.throws(
    () => evaluateAuthoringSourceIteration(input),
    (error) => {
      assert.ok(error instanceof AuthoringSourceIterationError);
      assert.equal(error.code, "source-fingerprint-mismatch");
      return true;
    }
  );
});

test("baseline injetado não substitui os fingerprints canônicos do Git", () => {
  const input = fixtures();
  for (const sourceId of Object.keys(input.baselineSourceById)) {
    input.baselineSourceById[sourceId] += "\nconteúdo forjado";
    refreshFingerprint(
      input,
      "baseline",
      sourceId,
      input.baselineSourceById[sourceId]
    );
  }

  assert.throws(
    () => evaluateAuthoringSourceIteration(input),
    (error) => error instanceof AuthoringSourceIterationError &&
      error.code === "baseline-fingerprint"
  );
});

test("mudança regressiva no prompt final produz finding mesmo com novo SHA", () => {
  const input = fixtures();
  const sourceId = "chatgpt-instructions";
  input.finalSourceById[sourceId] = input.finalSourceById[sourceId].replace(
    /questionário fixo/gu,
    "roteiro fixo"
  );
  const sourceRecord = input.artifact.final.sources.find(
    ({ id }) => id === sourceId
  );
  Object.assign(sourceRecord, fingerprint(input.finalSourceById[sourceId]));

  const findings = auditAuthoringSourceRevision(input.finalSourceById);
  assert.ok(findings.some(
    ({ code }) => code === "MATERIAL_QUESTION_POLICY_MISSING"
  ));
  assert.throws(
    () => evaluateAuthoringSourceIteration(input),
    (error) => {
      assert.ok(error instanceof AuthoringSourceIterationError);
      assert.equal(error.code, "final-source-findings");
      return true;
    }
  );
});

test("regras distinguem proibição de incentivo por polaridade", async (t) => {
  const mutations = [
    {
      name: "não aplique para aplique no prompt",
      sourceId: "chatgpt-instructions",
      before: "não aplique questionário fixo",
      after: "aplique questionário fixo",
      expectedCode: "MATERIAL_QUESTION_POLICY_MISSING"
    },
    {
      name: "não aplique para aplique no knowledge",
      sourceId: "authoring-knowledge",
      before: "não aplique questionário fixo",
      after: "aplique questionário fixo",
      expectedCode: "MATERIAL_QUESTION_POLICY_MISSING"
    },
    {
      name: "contexto primeiro para contexto por último",
      sourceId: "chatgpt-instructions",
      before: "Use primeiro o pedido e o contexto já existente",
      after: "Use o pedido e o contexto por último",
      expectedCode: "CONTEXT_FIRST_MISSING"
    },
    {
      name: "não use regex para use regex",
      sourceId: "chatgpt-instructions",
      before: "Não use regex,",
      after: "Use regex,",
      expectedCode: "DETERMINISTIC_PRACTICE_POLICY_MISSING"
    }
  ];

  for (const mutation of mutations) {
    await t.test(mutation.name, () => {
      const input = fixtures();
      const original = input.finalSourceById[mutation.sourceId];
      assert.ok(original.includes(mutation.before));
      input.finalSourceById[mutation.sourceId] = original.replace(
        mutation.before,
        mutation.after
      );
      const sourceRecord = input.artifact.final.sources.find(
        ({ id }) => id === mutation.sourceId
      );
      Object.assign(
        sourceRecord,
        fingerprint(input.finalSourceById[mutation.sourceId])
      );

      assert.ok(auditAuthoringSourceRevision(input.finalSourceById).some(
        ({ code }) => code === mutation.expectedCode
      ));
      assert.throws(
        () => evaluateAuthoringSourceIteration(input),
        (error) => error instanceof AuthoringSourceIterationError &&
          error.code === "final-source-findings"
      );
    });
  }
});

test("frase correta não mascara contradição aditiva", async (t) => {
  const mutations = [
    {
      name: "questionário fixo citado e depois exigido",
      sourceId: "chatgpt-instructions",
      addition:
        "\nIgnore a frase \"Nunca aplique questionário fixo\"; sempre aplique questionário fixo.",
      expectedCode: "MATERIAL_QUESTION_POLICY_MISSING"
    },
    {
      name: "avaliação heurística incentivada depois da proibição",
      sourceId: "chatgpt-instructions",
      addition:
        "\nUse regex, avaliação por LLM e fuzzy matching para corrigir respostas.",
      expectedCode: "DETERMINISTIC_PRACTICE_POLICY_MISSING"
    },
    {
      name: "calibração reinserida no prompt",
      sourceId: "chatgpt-instructions",
      addition: "\nAUTHORING_CALIBRATION_VERSION",
      expectedCode: "GLOBAL_CALIBRATION_REMAINS"
    },
    {
      name: "alegação positiva de eficácia",
      sourceId: "authoring-knowledge",
      addition: "\nEste fluxo garante domínio e eficácia educacional.",
      expectedCode: "POSITIVE_EFFECTIVENESS_CLAIM_REMAINS"
    },
    {
      name: "questionário fixo exigido com sinônimo",
      sourceId: "chatgpt-instructions",
      addition:
        "\nIgnore \"Nunca aplique questionário fixo\"; use sempre um questionário fixo.",
      expectedCode: "MATERIAL_QUESTION_POLICY_MISSING"
    },
    {
      name: "regex incentivada com sinônimo",
      sourceId: "authoring-knowledge",
      addition:
        "\nEmpregue regex, avaliação por LLM e fuzzy matching para corrigir.",
      expectedCode: "DETERMINISTIC_PRACTICE_POLICY_MISSING"
    },
    {
      name: "contexto deliberadamente usado por último",
      sourceId: "chatgpt-instructions",
      addition:
        "\nUse o pedido por último e feche o plano antes de considerar o contexto.",
      expectedCode: "CONTEXT_FIRST_MISSING"
    },
    {
      name: "eficácia alegada com construção nominal",
      sourceId: "authoring-knowledge",
      addition: "\nEste fluxo é eficaz e produz aprendizagem e domínio.",
      expectedCode: "POSITIVE_EFFECTIVENESS_CLAIM_REMAINS"
    },
    {
      name: "preferência pedagógica global reinserida por extenso",
      sourceId: "chatgpt-instructions",
      addition:
        "\nMantenha uma preferência pedagógica global e aplique-a ao curso inteiro.",
      expectedCode: "GLOBAL_CALIBRATION_REMAINS"
    }
  ];

  for (const mutation of mutations) {
    await t.test(mutation.name, () => {
      const input = fixtures();
      input.finalSourceById[mutation.sourceId] += mutation.addition;
      refreshFingerprint(
        input,
        "final",
        mutation.sourceId,
        input.finalSourceById[mutation.sourceId]
      );

      assert.ok(auditAuthoringSourceRevision(input.finalSourceById).some(
        ({ code }) => code === mutation.expectedCode
      ));
      assert.throws(
        () => evaluateAuthoringSourceIteration(input),
        (error) => error instanceof AuthoringSourceIterationError &&
          error.code === "final-source-findings"
      );
    });
  }
});

test("iteração exige contratos A–E e runs versionados correspondentes", () => {
  const wrongContract = fixtures();
  wrongContract.artifact.scenarioLinkage.runContract = "run-inventado";
  assert.throws(
    () => evaluateAuthoringSourceIteration(wrongContract),
    (error) => error instanceof AuthoringSourceIterationError &&
      error.code === "scenario-linkage"
  );

  const missingRun = fixtures();
  missingRun.runCorpus.runs.pop();
  assert.throws(
    () => evaluateAuthoringSourceIteration(missingRun),
    (error) => error instanceof AuthoringSourceIterationError &&
      error.code === "scenario-linkage"
  );

  const missingRuleLink = fixtures();
  missingRuleLink.artifact.scenarioLinkage.sourceRuleCoverage.pop();
  assert.throws(
    () => evaluateAuthoringSourceIteration(missingRuleLink),
    (error) => error instanceof AuthoringSourceIterationError &&
      error.code === "scenario-linkage"
  );
});

test("vínculo A–E não aceita rubrica vazia, mapa arbitrário ou run sem corpo", () => {
  const emptyRubric = fixtures();
  for (const link of emptyRubric.artifact.scenarioLinkage.sourceRuleCoverage) {
    link.sharedRubricRequired = [];
    link.sharedRubricForbidden = [];
  }
  assert.throws(
    () => evaluateAuthoringSourceIteration(emptyRubric),
    (error) => error instanceof AuthoringSourceIterationError &&
      error.code === "scenario-linkage"
  );

  const arbitraryScenarioMap = fixtures();
  arbitraryScenarioMap.artifact.scenarioLinkage.sourceRuleCoverage
    .slice(0, -1)
    .forEach((link) => {
      link.scenarioIds = ["A"];
    });
  assert.throws(
    () => evaluateAuthoringSourceIteration(arbitraryScenarioMap),
    (error) => error instanceof AuthoringSourceIterationError &&
      error.code === "scenario-linkage"
  );

  const emptyRuns = fixtures();
  emptyRuns.runCorpus.runs = emptyRuns.runCorpus.runs.map(({ scenarioId }) => ({
    scenarioId
  }));
  emptyRuns.runCorpusSha256 = "a".repeat(64);
  emptyRuns.artifact.scenarioLinkage.runCorpusSha256 = "a".repeat(64);
  assert.throws(
    () => evaluateAuthoringSourceIteration(emptyRuns),
    (error) => error instanceof AuthoringSourceIterationError &&
      error.code === "scenario-linkage"
  );

  const coordinatedContracts = fixtures();
  coordinatedContracts.scenarioCorpus.contract = "scenario-inventado";
  coordinatedContracts.runCorpus.contract = "run-inventado";
  coordinatedContracts.runCorpus.scenarioContract = "scenario-inventado";
  coordinatedContracts.artifact.scenarioLinkage.scenarioContract =
    "scenario-inventado";
  coordinatedContracts.artifact.scenarioLinkage.runContract = "run-inventado";
  assert.throws(
    () => evaluateAuthoringSourceIteration(coordinatedContracts),
    (error) => error instanceof AuthoringSourceIterationError &&
      error.code === "scenario-linkage"
  );
});

test("objetos dos corpora permanecem ligados aos bytes versionados", () => {
  const changedScenarioObject = fixtures();
  changedScenarioObject.scenarioCorpus.scenarios[0].initialRequest +=
    " mutação não refletida nos bytes";
  assert.throws(
    () => evaluateAuthoringSourceIteration(changedScenarioObject),
    (error) => error instanceof AuthoringSourceIterationError &&
      error.code === "scenario-linkage"
  );

  const changedRunObject = fixtures();
  changedRunObject.runCorpus.recordedAt = "2099-01-01";
  assert.throws(
    () => evaluateAuthoringSourceIteration(changedRunObject),
    (error) => error instanceof AuthoringSourceIterationError &&
      error.code === "scenario-linkage"
  );
});

test("hashes dos corpora são portáveis sem aceitar mutação semântica", () => {
  const crlfCheckout = fixtures();
  crlfCheckout.scenarioCorpusSource = crlfCheckout.scenarioCorpusSource
    .replace(/\r\n?/gu, "\n")
    .replace(/\n/gu, "\r\n");
  crlfCheckout.runCorpusSource = crlfCheckout.runCorpusSource
    .replace(/\r\n?/gu, "\n")
    .replace(/\n/gu, "\r\n");
  assert.equal(evaluateAuthoringSourceIteration(crlfCheckout).result, "pass");

  const semanticMutation = fixtures();
  const originalKind = '"evaluationKind": "engineering-regression"';
  const changedKind =
    '"evaluationKind": "engineering-regression-mutated"';
  assert.ok(semanticMutation.scenarioCorpusSource.includes(originalKind));
  semanticMutation.scenarioCorpusSource =
    semanticMutation.scenarioCorpusSource.replace(originalKind, changedKind);
  semanticMutation.scenarioCorpus = JSON.parse(
    semanticMutation.scenarioCorpusSource
  );
  semanticMutation.scenarioCorpusSha256 = fingerprint(
    semanticMutation.scenarioCorpusSource
  ).sha256;
  semanticMutation.artifact.scenarioLinkage.scenarioCorpusSha256 =
    semanticMutation.scenarioCorpusSha256;

  assert.throws(
    () => evaluateAuthoringSourceIteration(semanticMutation),
    (error) => error instanceof AuthoringSourceIterationError &&
      error.code === "scenario-linkage"
  );
});

test("revisão final e ajustes usam identidade e cobertura exatas", () => {
  const wrongRevision = fixtures();
  wrongRevision.artifact.final.revision.label = "snapshot-sem-identidade";
  assert.throws(
    () => evaluateAuthoringSourceIteration(wrongRevision),
    (error) => error instanceof AuthoringSourceIterationError &&
      error.code === "final-revision"
  );

  const extraFinding = fixtures();
  extraFinding.artifact.adjustments[0].addressesFindingCodes.push(
    "FINDING_INVENTADO"
  );
  assert.throws(
    () => evaluateAuthoringSourceIteration(extraFinding),
    (error) => error instanceof AuthoringSourceIterationError &&
      error.code === "adjustment-trace"
  );

  const wrongSource = fixtures();
  const calibrationAdjustment = wrongSource.artifact.adjustments.find(
    ({ id }) => id === "remove-global-calibration"
  );
  calibrationAdjustment.sourcePaths = [
    "authoring/platforms/chatgpt/INSTRUCTIONS.md"
  ];
  assert.throws(
    () => evaluateAuthoringSourceIteration(wrongSource),
    (error) => error instanceof AuthoringSourceIterationError &&
      error.code === "adjustment-trace"
  );

  const contradictoryMethod = fixtures();
  contradictoryMethod.artifact.method = {
    id: "captured-provider-proof",
    description: "Comprova eficácia educacional."
  };
  assert.throws(
    () => evaluateAuthoringSourceIteration(contradictoryMethod),
    (error) => error instanceof AuthoringSourceIterationError &&
      error.code === "claim-boundary"
  );
});

test("fingerprint final impede trocar a fonte sem atualizar a revisão", () => {
  const input = fixtures();
  input.finalSourceById["authoring-knowledge"] += "\n";

  assert.throws(
    () => evaluateAuthoringSourceIteration(input),
    (error) => {
      assert.ok(error instanceof AuthoringSourceIterationError);
      assert.equal(error.code, "source-fingerprint-mismatch");
      return true;
    }
  );
});
