import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { mapAuthoringMcpToolCall } from "../supabase/functions/_shared/aralearn-authoring/workspaceMcpTools.js";
import { validateWorkspaceContinuityActionPayload } from "../supabase/functions/_shared/aralearn-authoring/workspaceProtocol.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCENARIOS_PATH = path.join(
  ROOT,
  "authoring",
  "evals",
  "contextual-planning-scenarios.v1.json"
);
const RUNS_PATH = path.join(
  ROOT,
  "authoring",
  "evals",
  "contextual-planning-runs.v1.json"
);

const PLAN_ROUND_KINDS = new Set(["draft-plan", "revised-plan"]);
const DETERMINISTIC_EVALUATION_MODES = new Set([
  "exact-option-id",
  "exact-order",
  "exact-pairs",
  "normalized-gap-key"
]);
const PROPOSED_PLAN_RECORD_KEYS = ["approvedScope", "decisions"];
const CONTINUITY_TOOL_ARGUMENT_KEYS = [
  "decisions",
  "expectedRevision",
  "mandate",
  "operation",
  "parts",
  "requestId",
  "workspaceId"
];
const CONTINUITY_PART_KEYS = ["id", "microsequenceIds", "title"];
const CONTINUITY_DECISION_KEYS = [
  "entityId",
  "entityType",
  "id",
  "pedagogicalDiagnosis",
  "summary"
];
const CLAIM_BOUNDARY =
  "Este replay verifica contratos e regressões observáveis; não mede aprendizagem nem eficácia educacional e não avalia qualidade docente.";
const POSITIVE_EFFECTIVENESS_CLAIM = /\b(?:garante|comprova|assegura|demonstra)\b[\s\S]{0,80}\b(?:aprendizagem|domínio|eficácia|resultado educacional)\b/iu;
const AUDIT_MESSAGES = {
  PRACTICE_NONDETERMINISTIC:
    "A prática delega a correção a julgamento semântico; o cenário exige resposta inequívoca e correção determinística.",
  KNOWN_CONDITION_IGNORED:
    "O plano substitui um laboratório que o diagnóstico declara disponível; a resposta deve usar essa condição em vez de compensar sua ausência.",
  DIFFICULTY_RESPONSE_MISMATCH:
    "A resposta observada não corresponde ao vínculo dificuldade→resposta definido no cenário.",
  PERSISTENCE_BOUNDARY:
    "A proposta persiste transcrição e raciocínio não aprovados; somente escopo e decisões compactas aprovadas podem ser registrados.",
  FIXED_CARD_TARGET:
    "O teto prévio de cards contradiz a ausência de pressão para condensar e pode reduzir silenciosamente a cobertura do escopo denso."
};

export class ContextualPlanningEvaluationError extends Error {
  constructor(code, scenarioId, detail) {
    super(`[${code}] cenário ${scenarioId}: ${detail}`);
    this.name = "ContextualPlanningEvaluationError";
    this.code = code;
    this.scenarioId = scenarioId;
  }
}

function fail(code, scenarioId, detail) {
  throw new ContextualPlanningEvaluationError(code, scenarioId, detail);
}

function ensure(condition, code, scenarioId, detail) {
  if (!condition) fail(code, scenarioId, detail);
}

function sortedKeys(value) {
  return Object.keys(value ?? {}).sort();
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function roundById(run, roundId, code = "run-structure") {
  const round = run.rounds.find(({ id }) => id === roundId);
  ensure(round, code, run.scenarioId, `rodada ausente: ${roundId}`);
  return round;
}

function roundIndex(run, roundId) {
  return run.rounds.findIndex(({ id }) => id === roundId);
}

function pointerValue(source, pointer) {
  if (pointer === "") return source;
  if (!pointer.startsWith("/")) return undefined;
  return pointer
    .slice(1)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce((value, part) => value?.[part], source);
}

function hasLink(collection, expected) {
  return collection.some((candidate) => [
    "microsequence",
    "contentDemand",
    "anticipatedDifficulty",
    "designResponse"
  ].every((key) => candidate[key] === expected[key]));
}

function partContainsMicrosequence(parts, microsequenceId) {
  return parts.some(({ microsequenceIds }) => microsequenceIds.includes(microsequenceId));
}

function allStrings(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(allStrings);
  }
  return [];
}

function validateRunStructure(run) {
  const roundIds = run.rounds.map(({ id }) => id);
  ensure(
    new Set(roundIds).size === roundIds.length,
    "run-structure",
    run.scenarioId,
    "ids de rodada devem ser únicos"
  );
  const participantIds = Object.values(run.participants);
  ensure(
    new Set(participantIds).size === participantIds.length,
    "independent-review",
    run.scenarioId,
    "assistente, pessoa e revisor devem ser papéis separados"
  );
  ensure(
    !allStrings(run.rounds).some((value) => POSITIVE_EFFECTIVENESS_CLAIM.test(value)),
    "claim-boundary",
    run.scenarioId,
    "uma saída observável contém alegação positiva de eficácia ou aprendizagem"
  );
}

function auditPlanRound(scenario, output) {
  const findings = [];
  const report = (ruleId, evidencePath) => findings.push({
    code: `${scenario.id}.${ruleId}`,
    evidencePath,
    message: AUDIT_MESSAGES[ruleId]
  });

  (output.practiceChecks ?? []).forEach((practice, index) => {
    if (!DETERMINISTIC_EVALUATION_MODES.has(practice.evaluationMode)) {
      report(
        "PRACTICE_NONDETERMINISTIC",
        `/practiceChecks/${index}/evaluationMode`
      );
    }
  });

  for (const expected of scenario.difficultyResponseLinks) {
    const index = (output.difficultyResponseLinks ?? []).findIndex(
      ({ microsequence }) => microsequence === expected.microsequence
    );
    const observed = output.difficultyResponseLinks?.[index];
    if (observed && observed.designResponse !== expected.designResponse) {
      report(
        "DIFFICULTY_RESPONSE_MISMATCH",
        `/difficultyResponseLinks/${index}/designResponse`
      );
    }
  }

  if (
    scenario.contextFacts?.laboratoryAccess === "regular" &&
    output.laboratoryRole === "replace-laboratory-with-terminal-simulation"
  ) {
    report("KNOWN_CONDITION_IGNORED", "/laboratoryRole");
  }

  const proposedRecord = output.persistenceProposal?.record;
  const unexpectedPersistenceKeys = sortedKeys(proposedRecord).filter(
    (key) => !PROPOSED_PLAN_RECORD_KEYS.includes(key)
  );
  for (const key of unexpectedPersistenceKeys) {
    report("PERSISTENCE_BOUNDARY", `/persistenceProposal/record/${key}`);
  }

  if (
    scenario.planningConstraints?.fixedCardTargetAllowed === false &&
    Number.isFinite(output.decomposition?.cardLimit)
  ) {
    report("FIXED_CARD_TARGET", "/decomposition/cardLimit");
  }

  return findings;
}

function scopeItemIds(scenarioCorpus, scenario) {
  if (!scenario.scopeSetRef) return [];
  const scopeSet = scenarioCorpus.scopeSets?.find(
    ({ id }) => id === scenario.scopeSetRef
  );
  ensure(
    scopeSet?.items?.length > 0,
    "scope-oracle",
    scenario.id,
    `scopeSetRef sem ementa versionada: ${scenario.scopeSetRef}`
  );
  return scopeSet.items.map(({ id }) => id);
}

function validateQuestionFlow(scenario, run) {
  const assistantOutputRounds = run.rounds.filter((round) => (
    round.participantId === run.participants.assistantId &&
    Array.isArray(round.observedOutput?.questions)
  ));
  const questionMode = scenario.questionPolicy?.mode;
  ensure(
    new Set(["ask-material", "do-not-ask"]).has(questionMode),
    "question-policy",
    scenario.id,
    `questionPolicy.mode inválido: ${questionMode ?? "ausente"}`
  );

  if (questionMode === "ask-material") {
    const questionRound = assistantOutputRounds.find(
      ({ kind }) => kind === "material-question"
    );
    const expectedUnknownIds = scenario.materialUnknowns.map(({ id }) => id).sort();
    const observedUnknownIds = (questionRound?.observedOutput.questions ?? [])
      .map(({ materialUnknownId }) => materialUnknownId)
      .sort();
    ensure(
      sameJson(observedUnknownIds, expectedUnknownIds),
      "A-material-question",
      scenario.id,
      "a lacuna material do corpus não foi perguntada exatamente uma vez"
    );
    ensure(
      scenario.knownContext.every((item) => (
        questionRound.observedOutput.contextUsed.includes(item)
      )),
      "known-context-first",
      scenario.id,
      "a pergunta não registra o uso do contexto já conhecido"
    );

    const answerRound = run.rounds.find(({ kind }) => kind === "material-answer");
    ensure(
      answerRound?.observedOutput?.text === scenario.authorContinuation,
      "A-material-answer",
      scenario.id,
      "a continuação que fecha a lacuna material não foi registrada"
    );
    const answerIndex = roundIndex(run, answerRound.id);
    const questionIndex = roundIndex(run, questionRound.id);
    const firstPlanIndex = run.rounds.findIndex(({ kind }) => (
      PLAN_ROUND_KINDS.has(kind)
    ));
    ensure(
      questionIndex < answerIndex && answerIndex < firstPlanIndex,
      "A-question-order",
      scenario.id,
      "a ordem deve ser pergunta material→resposta→primeiro plano"
    );
    const repeated = assistantOutputRounds.some((round) => (
      roundIndex(run, round.id) > answerIndex && round.observedOutput.questions.length > 0
    ));
    ensure(
      !repeated,
      "repeated-question",
      scenario.id,
      "a pergunta material foi repetida depois da resposta"
    );
    return;
  }

  const repeated = assistantOutputRounds.some(
    ({ observedOutput }) => observedOutput.questions.length > 0
  );
  ensure(
    !repeated,
    "repeated-question",
    scenario.id,
    "o run fez pergunta apesar de o contexto material já estar completo"
  );
}

function validateFinalPlan(scenario, run, requiredScopeItemIds) {
  const finalRound = roundById(run, run.finalResult.planRoundId, "final-result");
  ensure(
    PLAN_ROUND_KINDS.has(finalRound.kind) &&
      finalRound.participantId === run.participants.assistantId,
    "final-result",
    scenario.id,
    "o resultado final não aponta para uma rodada de plano observável"
  );
  const output = finalRound.observedOutput;
  ensure(output, "final-result", scenario.id, "a rodada final não tem saída observável");
  ensure(
    scenario.knownContext.every((item) => output.contextUsed?.includes(item)),
    "known-context-first",
    scenario.id,
    "o plano final não conserva todo o contexto fornecido"
  );
  ensure(
    scenario.difficultyResponseLinks.every((link) => (
      hasLink(output.difficultyResponseLinks ?? [], link)
    )),
    "difficulty-response-link",
    scenario.id,
    "o plano final não materializa todos os vínculos dificuldade→resposta do cenário"
  );
  ensure(
    requiredScopeItemIds.every((itemId) => output.scopeCoverage?.includes(itemId)),
    "scope-coverage",
    scenario.id,
    "o plano final não cobre toda a ementa versionada do cenário"
  );
  ensure(
    output.humanPause?.beforeCards === true &&
      output.humanPause?.status === "awaiting-human-decision" &&
      output.cardsCreated === 0,
    "human-pause",
    scenario.id,
    "o plano não pausa de modo observável antes da criação dos cards"
  );

  const practices = output.practiceChecks ?? [];
  const practiceIsRequired = scenario.practiceExpectation?.mode === "required";
  ensure(
    (!practiceIsRequired || practices.length > 0) &&
      practices.every(({ evaluationMode }) => (
      DETERMINISTIC_EVALUATION_MODES.has(evaluationMode)
      )),
    "deterministic-practice",
    scenario.id,
    "a rodada final não contém somente práticas de correção determinística"
  );
  if (scenario.contextFacts?.laboratoryAccess === "regular") {
    ensure(
      output.laboratoryRole === "external-complement-after-preparation",
      "known-context-first",
      scenario.id,
      "o papel final do laboratório não corresponde à condição já conhecida"
    );
  }
  if (scenario.planningConstraints?.fixedCardTargetAllowed === false) {
    ensure(
      output.decomposition?.cardLimit === null &&
        output.decomposition?.countPolicy === "derived-from-scope-decomposition",
      "scope-coverage",
      scenario.id,
      "a decomposição final fixa quantidade ou não deriva a quantidade do escopo"
    );
  }

  return finalRound;
}

function validateReviewAndDivergence(scenario, run, finalRound) {
  const divergence = run.injectedDivergence;
  ensure(
    divergence?.expectedFindingCode && divergence?.expectedAuditFinding,
    "divergence-detection",
    scenario.id,
    "a divergência controlada não declara o finding esperado"
  );
  const injectedRound = roundById(
    run,
    divergence.roundId,
    "divergence-detection"
  );
  ensure(
    sameJson(
      pointerValue(injectedRound.observedOutput, divergence.path),
      divergence.injectedValue
    ),
    "divergence-detection",
    scenario.id,
    "o valor divergente não está presente no caminho declarado"
  );
  const derivedInitialFindings = auditPlanRound(
    scenario,
    injectedRound.observedOutput
  );
  const derivedExpectedFinding = derivedInitialFindings.find(
    ({ code }) => code === divergence.expectedFindingCode
  );
  ensure(
    derivedExpectedFinding?.evidencePath === divergence.path &&
      derivedExpectedFinding?.message === divergence.expectedAuditFinding,
    "divergence-detection",
    scenario.id,
    "a auditoria executada não deriva o finding esperado da saída divergente"
  );

  const reviewRound = run.rounds.find((round) => (
    round.kind === "independent-review" &&
    round.observedOutput?.reviewedRoundId === injectedRound.id
  ));
  ensure(
    reviewRound &&
      run.participants.reviewerId !== run.participants.assistantId &&
      reviewRound.participantId === run.participants.reviewerId &&
      reviewRound.observedOutput.reviewBasis?.includes(
        "aralearn.authoring-contextual-planning-scenarios.v1"
      ) &&
      reviewRound.observedOutput.reviewBasis?.includes("sharedRubric"),
    "independent-review",
    scenario.id,
    "não há rodada de revisão independente vinculada ao corpus e à rubrica"
  );

  const expectedFinding = reviewRound.observedOutput.findings?.find(
    ({ code }) => code === divergence.expectedFindingCode
  );
  ensure(
    sameJson(expectedFinding, derivedExpectedFinding) &&
      sameJson(reviewRound.observedOutput.findings, derivedInitialFindings),
    "divergence-detection",
    scenario.id,
    "a revisão independente não reproduz todos os findings derivados pela auditoria"
  );
  ensure(
    roundIndex(run, injectedRound.id) < roundIndex(run, reviewRound.id) &&
      roundIndex(run, reviewRound.id) < roundIndex(run, finalRound.id),
    "independent-review",
    scenario.id,
    "a ordem injeção→revisão→ajuste não foi preservada"
  );
  ensure(
    sameJson(
      [...(finalRound.addressesFindingCodes ?? [])].sort(),
      derivedInitialFindings.map(({ code }) => code).sort()
    ),
    "divergence-detection",
    scenario.id,
    "a rodada final não registra o ajuste de todos os findings"
  );
  ensure(
    sameJson(
      pointerValue(finalRound.observedOutput, divergence.correction.path),
      divergence.correction.value
    ) && !sameJson(divergence.injectedValue, divergence.correction.value),
    "divergence-detection",
    scenario.id,
    "o resultado final não contém a correção declarada"
  );

  const derivedFinalFindings = auditPlanRound(scenario, finalRound.observedOutput);
  ensure(
    derivedFinalFindings.length === 0,
    "final-audit",
    scenario.id,
    `a reexecução final conserva findings: ${derivedFinalFindings
      .map(({ code }) => code)
      .join(", ")}`
  );

  return {
    initialFindings: derivedInitialFindings,
    finalFindings: derivedFinalFindings
  };
}

function validateApprovalAndPersistence(
  scenario,
  run,
  finalRound,
  requiredScopeItemIds
) {
  const approvalRound = roundById(
    run,
    run.finalResult.humanDecisionRoundId,
    "human-pause"
  );
  ensure(
    approvalRound.kind === "human-decision" &&
      approvalRound.participantId === run.participants.humanId &&
      approvalRound.observedOutput?.decision === "approved" &&
      approvalRound.observedOutput?.approvedPlanRoundId === finalRound.id &&
      roundIndex(run, approvalRound.id) > roundIndex(run, finalRound.id),
    "human-pause",
    scenario.id,
    "a aprovação humana não ocorre depois da pausa do plano"
  );
  const approvalIndex = roundIndex(run, approvalRound.id);
  ensure(
    !run.rounds.slice(0, approvalIndex).some((round) => (
      round.kind === "cards-created" || round.observedOutput?.cardsCreated > 0
    )),
    "human-pause",
    scenario.id,
    "há criação observável de cards antes da aprovação humana"
  );

  const persistenceRound = roundById(
    run,
    run.finalResult.persistenceRoundId,
    "persistence-boundary"
  );
  const toolName = persistenceRound.observedOutput?.toolName;
  const toolCallArguments = persistenceRound.observedOutput?.toolCallArguments;
  ensure(
    persistenceRound.kind === "approved-plan-persistence" &&
      persistenceRound.participantId === run.participants.assistantId &&
      toolName === "gerirContinuidadeDaAutoria" &&
      toolCallArguments?.operation === "record_approved_plan" &&
      persistenceRound.observedOutput?.afterHumanApproval === true &&
      roundIndex(run, persistenceRound.id) > roundIndex(run, approvalRound.id),
    "persistence-boundary",
    scenario.id,
    "a persistência não ocorre atomicamente depois da aprovação humana"
  );

  let mapped;
  let validatedPayload;
  try {
    mapped = mapAuthoringMcpToolCall(toolName, toolCallArguments);
    validatedPayload = validateWorkspaceContinuityActionPayload(mapped.body);
  } catch (error) {
    fail(
      "persistence-boundary",
      scenario.id,
      `o payload não atravessa o mapper e o protocolo reais: ${error.message}`
    );
  }
  ensure(
    mapped.method === "POST" &&
      mapped.path.endsWith("/continuity/actions") &&
      validatedPayload.operation === "record_approved_plan" &&
      sameJson(sortedKeys(toolCallArguments), CONTINUITY_TOOL_ARGUMENT_KEYS) &&
      toolCallArguments.mandate === null,
    "persistence-boundary",
    scenario.id,
    "a chamada não conserva o envelope canônico de record_approved_plan"
  );

  const { parts, decisions } = validatedPayload.arguments;
  ensure(
    parts.length > 0 &&
      parts.every((part) => sameJson(sortedKeys(part), CONTINUITY_PART_KEYS)) &&
      decisions.length > 0 &&
      decisions.every((decision) => (
        sameJson(sortedKeys(decision), CONTINUITY_DECISION_KEYS) &&
        decision.entityType === "microsequence" &&
        partContainsMicrosequence(parts, decision.entityId)
      )),
    "persistence-boundary",
    scenario.id,
    "Partes e decisões não usam a forma canônica ou não permanecem vinculadas"
  );
  ensure(
    scenario.difficultyResponseLinks.every((link) => (
      decisions.some((decision) => (
        decision.summary.includes(link.contentDemand) &&
        decision.pedagogicalDiagnosis.difficultyResponses.some((entry) => (
          entry.difficulty === link.anticipatedDifficulty &&
          entry.response === link.designResponse
        ))
      ))
    )),
    "persistence-boundary",
    scenario.id,
    "o payload aprovado não conserva os vínculos materiais do plano final"
  );
  const persistedDifficultyResponses = decisions.flatMap(
    ({ pedagogicalDiagnosis }) => pedagogicalDiagnosis.difficultyResponses
  );
  const approvedDifficultyResponses = scenario.difficultyResponseLinks.map((link) => ({
    difficulty: link.anticipatedDifficulty,
    response: link.designResponse
  }));
  const orderedPairs = (pairs) => [...pairs].sort((left, right) => (
    `${left.difficulty}\u0000${left.response}`.localeCompare(
      `${right.difficulty}\u0000${right.response}`
    )
  ));
  ensure(
    sameJson(
      orderedPairs(persistedDifficultyResponses),
      orderedPairs(approvedDifficultyResponses)
    ),
    "persistence-boundary",
    scenario.id,
    "o payload contém decisão não aprovada ou omite uma decisão aprovada"
  );
  ensure(
    requiredScopeItemIds.every((itemId) => partContainsMicrosequence(parts, itemId)),
    "scope-coverage",
    scenario.id,
    "a persistência aprovada não conserva toda a ementa versionada"
  );
}

export function evaluateContextualPlanningRuns({ scenarioCorpus, runCorpus }) {
  ensure(
    scenarioCorpus.contract === runCorpus.scenarioContract,
    "corpus-contract",
    "all",
    "o corpus de runs aponta para outro contrato de cenários"
  );
  ensure(
    runCorpus.contract === "aralearn.authoring-contextual-planning-runs.v1" &&
      runCorpus.version === 1,
    "run-contract",
    "all",
    "o artefato de runs não usa o contrato versionado esperado"
  );
  ensure(
    runCorpus.claimBoundary === CLAIM_BOUNDARY &&
      runCorpus.executionMethod?.generatorKind === "deterministic-fixture",
    "claim-boundary",
    "all",
    "o artefato não explicita o limite de alegação"
  );

  const scenarioIds = scenarioCorpus.scenarios.map(({ id }) => id);
  const runIds = runCorpus.runs.map(({ scenarioId }) => scenarioId);
  ensure(
    sameJson(runIds, scenarioIds),
    "scenario-set",
    "all",
    "os runs não cobrem A–E exatamente uma vez e na ordem do corpus"
  );

  const initialFindings = [];
  const finalFindings = [];
  for (const scenario of scenarioCorpus.scenarios) {
    const run = runCorpus.runs.find(({ scenarioId }) => scenarioId === scenario.id);
    const requiredScopeItemIds = scopeItemIds(scenarioCorpus, scenario);
    validateRunStructure(run);
    validateQuestionFlow(scenario, run);
    const finalRound = validateFinalPlan(scenario, run, requiredScopeItemIds);
    const audit = validateReviewAndDivergence(scenario, run, finalRound);
    initialFindings.push(...audit.initialFindings);
    finalFindings.push(...audit.finalFindings);
    validateApprovalAndPersistence(
      scenario,
      run,
      finalRound,
      requiredScopeItemIds
    );
  }

  const executedReviewRoundIds = runCorpus.runs.flatMap(({ rounds }) => (
    rounds
      .filter(({ kind }) => kind === "independent-review")
      .map(({ id }) => id)
  ));
  ensure(
    runCorpus.executionEvidence?.command ===
      "node scripts/evaluateContextualPlanningRuns.mjs" &&
      runCorpus.executionEvidence?.initialAudit?.status === "nonconformant" &&
      sameJson(
        runCorpus.executionEvidence.initialAudit.findingCodes,
        initialFindings.map(({ code }) => code)
      ) &&
      sameJson(
        runCorpus.executionEvidence.independentReviewRoundIds,
        executedReviewRoundIds
      ) &&
      runCorpus.executionEvidence?.reexecution?.status === "conformant" &&
      sameJson(
        runCorpus.executionEvidence.reexecution.findingCodes,
        finalFindings.map(({ code }) => code)
      ),
    "execution-evidence",
    "all",
    "o registro da execução não corresponde aos findings derivados das rodadas"
  );

  return {
    contract: runCorpus.contract,
    scenariosEvaluated: scenarioIds,
    detectedDivergences: runCorpus.runs.map(
      ({ injectedDivergence }) => injectedDivergence.expectedFindingCode
    ),
    initialAudit: {
      status: "nonconformant",
      findings: initialFindings
    },
    finalAudit: {
      status: "conformant",
      findings: finalFindings
    },
    result: "pass"
  };
}

export function loadContextualPlanningCorpora() {
  return {
    scenarioCorpus: JSON.parse(fs.readFileSync(SCENARIOS_PATH, "utf8")),
    runCorpus: JSON.parse(fs.readFileSync(RUNS_PATH, "utf8"))
  };
}

const isDirectExecution = process.argv[1] && (
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
);

if (isDirectExecution) {
  try {
    const result = evaluateContextualPlanningRuns(loadContextualPlanningCorpora());
    console.log(
      `Planejamento contextual: rodada inicial com ` +
      `${result.initialAudit.findings.length} findings; reexecução com ` +
      `${result.finalAudit.findings.length}; ${result.scenariosEvaluated.length} ` +
      `cenários aprovados (${result.result}).`
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
