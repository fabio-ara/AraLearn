import assert from "node:assert/strict";
import test from "node:test";

import {
  ContextualPlanningEvaluationError,
  evaluateContextualPlanningRuns,
  loadContextualPlanningCorpora
} from "../../scripts/evaluateContextualPlanningRuns.mjs";

function fixtures() {
  return structuredClone(loadContextualPlanningCorpora());
}

function runById(runCorpus, scenarioId) {
  return runCorpus.runs.find((run) => run.scenarioId === scenarioId);
}

function roundByKind(run, kind) {
  return run.rounds.find((round) => round.kind === kind);
}

function finalRound(run) {
  return run.rounds.find(({ id }) => id === run.finalResult.planRoundId);
}

function expectFailure(mutate, expectedCode) {
  const input = fixtures();
  mutate(input);
  assert.throws(
    () => evaluateContextualPlanningRuns(input),
    (error) => {
      assert.ok(error instanceof ContextualPlanningEvaluationError);
      assert.equal(error.code, expectedCode);
      return true;
    }
  );
}

test("replay A–E atravessa protocolo real e registra cinco divergências", () => {
  const result = evaluateContextualPlanningRuns(fixtures());

  assert.deepEqual(result.scenariosEvaluated, ["A", "B", "C", "D", "E"]);
  assert.equal(result.detectedDivergences.length, 5);
  assert.equal(result.initialAudit.status, "nonconformant");
  assert.equal(result.initialAudit.findings.length, 5);
  assert.equal(result.finalAudit.status, "conformant");
  assert.equal(result.finalAudit.findings.length, 0);
  assert.equal(result.result, "pass");
});

test("avaliador falha quando A não pergunta a lacuna material", () => {
  expectFailure(({ runCorpus }) => {
    roundByKind(
      runById(runCorpus, "A"),
      "material-question"
    ).observedOutput.questions = [];
  }, "A-material-question");
});

test("avaliador falha quando A planeja antes de receber a resposta material", () => {
  expectFailure(({ runCorpus }) => {
    const run = runById(runCorpus, "A");
    const question = roundByKind(run, "material-question");
    const answer = roundByKind(run, "material-answer");
    const draft = roundByKind(run, "draft-plan");
    const remaining = run.rounds.filter((round) => (
      ![question.id, answer.id, draft.id].includes(round.id)
    ));
    run.rounds = [draft, question, answer, ...remaining];
  }, "A-question-order");
});

test("avaliador falha quando B–E introduzem perguntas repetidas", async (t) => {
  for (const scenarioId of ["B", "C", "D", "E"]) {
    await t.test(`cenário ${scenarioId}`, () => {
      expectFailure(({ runCorpus }) => {
        const run = runById(runCorpus, scenarioId);
        roundByKind(run, "draft-plan").observedOutput.questions.push({
          materialUnknownId: "already-known",
          text: "Pode repetir uma condição que já foi informada?"
        });
      }, "repeated-question");
    });
  }
});

test("avaliador falha sem vínculo dificuldade→resposta no plano final", () => {
  expectFailure(({ runCorpus }) => {
    finalRound(runById(runCorpus, "C")).observedOutput
      .difficultyResponseLinks.shift();
  }, "difficulty-response-link");
});

test("avaliador falha com perda de escopo em qualquer cenário", async (t) => {
  for (const scenarioId of ["A", "B", "C", "D", "E"]) {
    await t.test(`cenário ${scenarioId}`, () => {
      expectFailure(({ runCorpus }) => {
        finalRound(runById(runCorpus, scenarioId)).observedOutput
          .scopeCoverage.pop();
      }, "scope-coverage");
    });
  }
});

test("avaliador falha sem pausa humana antes dos cards", () => {
  expectFailure(({ runCorpus }) => {
    finalRound(runById(runCorpus, "D")).observedOutput
      .humanPause.beforeCards = false;
  }, "human-pause");
});

test("avaliador falha se a aprovação não aponta para o plano final", () => {
  expectFailure(({ runCorpus }) => {
    roundByKind(runById(runCorpus, "C"), "human-decision")
      .observedOutput.approvedPlanRoundId = "plano-inexistente";
  }, "human-pause");
});

test("avaliador falha se cards aparecem antes da aprovação", () => {
  expectFailure(({ runCorpus }) => {
    const run = runById(runCorpus, "C");
    const approvalIndex = run.rounds.findIndex(
      ({ kind }) => kind === "human-decision"
    );
    run.rounds.splice(approvalIndex, 0, {
      id: "C-premature-cards",
      participantId: run.participants.assistantId,
      kind: "cards-created",
      observedOutput: { cardsCreated: 1 }
    });
  }, "human-pause");
});

test("avaliador falha quando a persistência ultrapassa decisões aprovadas", () => {
  expectFailure(({ runCorpus }) => {
    const run = runById(runCorpus, "D");
    const persistenceRound = run.rounds.find(
      ({ id }) => id === run.finalResult.persistenceRoundId
    );
    persistenceRound.observedOutput.toolCallArguments.dialogTranscript =
      "não aprovado";
  }, "persistence-boundary");
});

test("avaliador falha com decisão canônica extra, mas não aprovada", () => {
  expectFailure(({ runCorpus }) => {
    const run = runById(runCorpus, "A");
    const persistence = run.rounds.find(
      ({ id }) => id === run.finalResult.persistenceRoundId
    );
    const extra = structuredClone(
      persistence.observedOutput.toolCallArguments.decisions[0]
    );
    extra.id = "decision-a-not-approved";
    persistence.observedOutput.toolCallArguments.decisions.push(extra);
  }, "persistence-boundary");
});

test("avaliador falha quando a prática final não é determinística", () => {
  expectFailure(({ runCorpus }) => {
    finalRound(runById(runCorpus, "A")).observedOutput
      .practiceChecks[0].evaluationMode = "llm-semantic";
  }, "deterministic-practice");
});

test("avaliador não transforma prática em requisito global", () => {
  const input = fixtures();
  const scenario = input.scenarioCorpus.scenarios.find(({ id }) => id === "C");
  scenario.practiceExpectation = {
    mode: "optional",
    whyMaterial: "Variação de contrato que não pede prática nesta rodada."
  };
  finalRound(runById(input.runCorpus, "C")).observedOutput.practiceChecks = [];

  assert.equal(evaluateContextualPlanningRuns(input).result, "pass");
});

test("avaliador falha quando B ignora o laboratório por outra representação", () => {
  expectFailure(({ runCorpus }) => {
    finalRound(runById(runCorpus, "B")).observedOutput.laboratoryRole =
      "ignore-available-laboratory";
  }, "known-context-first");
});

test("avaliador falha quando E conserva política fixa sem teto numérico", () => {
  expectFailure(({ runCorpus }) => {
    finalRound(runById(runCorpus, "E")).observedOutput
      .decomposition.countPolicy = "fixed-before-scope";
  }, "scope-coverage");
});

test("avaliador falha sem rodada de revisão independente", () => {
  expectFailure(({ runCorpus }) => {
    const run = runById(runCorpus, "B");
    run.rounds = run.rounds.filter(({ kind }) => kind !== "independent-review");
  }, "independent-review");
});

test("avaliador falha quando a revisão não detecta a divergência injetada", () => {
  expectFailure(({ runCorpus }) => {
    roundByKind(
      runById(runCorpus, "E"),
      "independent-review"
    ).observedOutput.findings = [];
  }, "divergence-detection");
});

test("avaliador falha com alegação positiva de eficácia", () => {
  expectFailure(({ runCorpus }) => {
    finalRound(runById(runCorpus, "A")).observedOutput.planText +=
      " Este plano garante domínio do conteúdo.";
  }, "claim-boundary");
});

test("avaliador falha quando o plano final não é saída do assistente", () => {
  expectFailure(({ runCorpus }) => {
    const run = runById(runCorpus, "C");
    finalRound(run).participantId = run.participants.humanId;
  }, "final-result");
});
