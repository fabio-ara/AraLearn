import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { evaluateContextualPlanningRuns } from "./evaluateContextualPlanningRuns.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT_PATH = path.join(
  ROOT,
  "authoring",
  "evals",
  "contextual-planning-source-iteration.v1.json"
);
const SCENARIO_CORPUS_PATH = path.join(
  ROOT,
  "authoring",
  "evals",
  "contextual-planning-scenarios.v1.json"
);
const RUN_CORPUS_PATH = path.join(
  ROOT,
  "authoring",
  "evals",
  "contextual-planning-runs.v1.json"
);
const BASELINE_COMMIT = "e720e703a2b4f491905c7be5e98967b8b7f9a470";
const CLAIM_BOUNDARY =
  "Auditoria de engenharia no nível das fontes; não é captura de provedor ou modelo e não mede aprendizagem, eficácia educacional nem qualidade docente.";
const METHOD = Object.freeze({
  id: "canonical-source-two-revision-replay",
  description: "A mesma auditoria executável lê as duas fontes no commit Git baseline e no snapshot final, calcula SHA-256, deriva findings do conteúdo e exige baseline não conforme e revisão final conforme.",
  sourceStorage: "O artefato guarda caminhos, fingerprints com finais de linha canônicos LF, observações e ajustes; não duplica o conteúdo integral das fontes.",
  historyRequirement: "O objeto Git baseline é obrigatório. O CI usa checkout com fetch-depth 0; sem o conteúdo antigo verificável, a auditoria falha."
});
const SCENARIO_CONTRACT =
  "aralearn.authoring-contextual-planning-scenarios.v1";
const RUN_CONTRACT = "aralearn.authoring-contextual-planning-runs.v1";
const SCENARIO_CORPUS_SHA256 =
  "61bd6c7b119b043bf452c22a4dcc01aae6454f5b7b4c5242fe8b4590343a352c";
const RUN_CORPUS_SHA256 =
  "0c524793de95a8715373c55679ea5f3976454832a919e8e1311c2a0bfe806685";
const SCENARIO_IDS = Object.freeze(["A", "B", "C", "D", "E"]);

const SOURCES = Object.freeze([
  Object.freeze({
    id: "chatgpt-instructions",
    path: "authoring/platforms/chatgpt/INSTRUCTIONS.md"
  }),
  Object.freeze({
    id: "authoring-knowledge",
    path: "supabase/functions/_shared/aralearn-authoring/authoringKnowledge.js"
  })
]);
const BASELINE_SOURCE_FINGERPRINTS = Object.freeze([
  Object.freeze({
    id: "chatgpt-instructions",
    path: "authoring/platforms/chatgpt/INSTRUCTIONS.md",
    sha256: "5239ed76e59bf5397dc7f627bc6185d2b183aeba7db0b23b2f810d44334ff44d",
    bytes: 7642
  }),
  Object.freeze({
    id: "authoring-knowledge",
    path: "supabase/functions/_shared/aralearn-authoring/authoringKnowledge.js",
    sha256: "772e9523d758fd6a81d26de549350183e734de4dfb54ae90d4e7b3fcad19d7bd",
    bytes: 44461
  })
]);
const SOURCE_RULE_COVERAGE = Object.freeze([
  sourceRuleCoverage("CONTEXT_FIRST_MISSING", ["use-known-context-first"]),
  sourceRuleCoverage("CONTEXTUAL_DIAGNOSIS_MISSING", [
    "link-each-material-difficulty-to-a-design-response",
    "make-design-decisions-per-microsequence"
  ]),
  sourceRuleCoverage(
    "MATERIAL_QUESTION_POLICY_MISSING",
    ["ask-only-materially-decisive-questions"],
    ["fixed-questionnaire"]
  ),
  sourceRuleCoverage("DIFFICULTY_RESPONSE_TRACE_MISSING", [
    "link-each-material-difficulty-to-a-design-response"
  ]),
  sourceRuleCoverage("HUMAN_PLAN_DIFFICULTIES_MISSING", [
    "pause-for-human-decision-before-cards"
  ]),
  sourceRuleCoverage(
    "APPROVED_DIAGNOSIS_PERSISTENCE_MISSING",
    ["persist-only-approved-compact-decisions"],
    ["private-reasoning-persistence"]
  ),
  sourceRuleCoverage(
    "DETERMINISTIC_PRACTICE_POLICY_MISSING",
    ["use-deterministic-practice"],
    ["regex-or-llm-answer-assessment"]
  ),
  sourceRuleCoverage("DIAGNOSIS_PLAN_CARDS_AUDIT_MISSING", [
    "audit-diagnosis-plan-cards-coherence"
  ]),
  sourceRuleCoverage(
    "GLOBAL_CALIBRATION_REMAINS",
    [],
    ["global-pedagogical-style"]
  )
]);

const RULES = Object.freeze([
  Object.freeze({
    code: "CONTEXT_FIRST_MISSING",
    title: "O contexto existente deve preceder perguntas e plano.",
    required: [
      requirement(
        "chatgpt-instructions",
        "context-first-in-prompt",
        /Antes\s+de\s+fechar\s+o\s+plano,\s+use\s+primeiro\s+pedido/iu
      ),
      requirement(
        "authoring-knowledge",
        "context-first-in-knowledge",
        /(?:^|[.!?:"]\s*)Use\s+primeiro\s+o\s+contexto\s+já\s+disponível;\s*não\s+repita\s+perguntas\s+respondidas/imu
      )
    ],
    forbidden: [
      prohibition(
        "chatgpt-instructions",
        "context-first-negated-in-prompt",
        /\b(?:não|nunca)\s+use\s+primeiro\s+pedido|\b(?:use|considere)\s+(?:o\s+)?(?:pedido|contexto)[^.\n]{0,50}\b(?:por\s+último|depois)\b|\bfeche\s+o\s+plano\s+antes\s+de\s+considerar\s+(?:o\s+)?contexto/iu
      ),
      prohibition(
        "authoring-knowledge",
        "context-first-negated-in-knowledge",
        /\b(?:não|nunca)\s+use\s+primeiro\s+o\s+contexto|\b(?:use|considere)\s+(?:o\s+)?(?:pedido|contexto)[^.\n]{0,50}\b(?:por\s+último|depois)\b|\bfeche\s+o\s+plano\s+antes\s+de\s+considerar\s+(?:o\s+)?contexto/iu
      )
    ]
  }),
  Object.freeze({
    code: "CONTEXTUAL_DIAGNOSIS_MISSING",
    title: "O diagnóstico contextual deve existir antes do plano.",
    required: [
      ...[
        "learningConditions",
        "contentDemands",
        "anticipatedDifficulties",
        "designResponses"
      ].map((dimension) => requirement(
        "chatgpt-instructions",
        `prompt-dimension-${dimension}`,
        new RegExp(
          `Por\\s+microssequência,\\s+relacione:[\\s\\S]{0,500}\\b${dimension}\\b`,
          "u"
        )
      )),
      requirement(
        "authoring-knowledge",
        "knowledge-contextual-diagnosis",
        /Diagnóstico\s+contextual\s+antes\s+do\s+plano/iu
      ),
      requirement(
        "authoring-knowledge",
        "knowledge-difficulties-and-responses",
        /Analise\s+o\s+que\s+o\s+conteúdo\s+exige[\s\S]{0,180}identifique\s+dificuldades\s+previsíveis[\s\S]{0,180}proponha\s+respostas\s+realizáveis/iu
      )
    ]
  }),
  Object.freeze({
    code: "MATERIAL_QUESTION_POLICY_MISSING",
    title: "Perguntas devem ser somente materiais e nunca um questionário fixo.",
    required: [
      requirement(
        "chatgpt-instructions",
        "material-change-question",
        /Pergunte\s+somente\s+quando[^.]{0,180}puder\s+mudar\s+materialmente/iu
      ),
      requirement(
        "chatgpt-instructions",
        "no-fixed-questionnaire",
        /Nunca\s+aplique\s+questionário\s+fixo/iu
      ),
      requirement(
        "authoring-knowledge",
        "material-change-question",
        /pergunte\s+apenas\s+quando[^.;]{0,180}puder\s+mudar\s+materialmente/iu
      ),
      requirement(
        "authoring-knowledge",
        "no-fixed-questionnaire",
        /não\s+aplique\s+questionário\s+fixo/iu
      )
    ],
    forbidden: SOURCES.flatMap((source) => [
      prohibition(
        source.id,
        "fixed-questionnaire-encouraged",
        /(?<!não\s)(?<!nunca\s)\baplique\s+questionário\s+fixo/iu
      ),
      prohibition(
        source.id,
        "fixed-questionnaire-synonym-encouraged",
        /\b(?:use|utilize|empregue|adote)\s+(?:sempre\s+)?(?:um\s+)?questionário\s+fixo/iu
      )
    ])
  }),
  Object.freeze({
    code: "DIFFICULTY_RESPONSE_TRACE_MISSING",
    title: "Dificuldades e respostas locais devem sobreviver ao plano e à auditoria.",
    required: [
      requirement(
        "chatgpt-instructions",
        "prompt-difficulty-response-link",
        /Vincule\s+a\s+cada\s+microssequência[\s\S]{0,220}dificuldade\s+e\s+resposta/iu
      ),
      requirement(
        "authoring-knowledge",
        "knowledge-approved-diagnosis-shape",
        /pedagogicalDiagnosis\.difficultyResponses/u
      ),
      requirement(
        "authoring-knowledge",
        "knowledge-materialization-check",
        /Para\s+cada\s+difficultyResponses\s+persistido[\s\S]{0,140}cards[\s\S]{0,100}resposta\s+prometida/iu
      )
    ],
    forbidden: [
      prohibition(
        "chatgpt-instructions",
        "difficulty-response-link-negated",
        /\b(?:não|nunca)\s+vincule[\s\S]{0,180}dificuldade[\s\S]{0,80}resposta/iu
      )
    ]
  }),
  Object.freeze({
    code: "HUMAN_PLAN_DIFFICULTIES_MISSING",
    title: "O plano humano deve mostrar dificuldades e respostas e então pausar.",
    required: [
      requirement(
        "chatgpt-instructions",
        "prompt-human-plan",
        /(?:^|[.!?]\s+)Resuma\s+dificuldades\s+materiais[\s\S]{0,120}respostas\s+planejadas[\s\S]{0,120}espere\s+a\s+decisão\s+antes\s+dos\s+cards/imu
      ),
      requirement(
        "authoring-knowledge",
        "knowledge-human-plan",
        /(?:^|[.!?:"]\s*)Mostre\s+cobertura[\s\S]{0,180}dificuldades\s+relevantes[\s\S]{0,100}respostas[\s\S]{0,100}pare\s+antes\s+dos\s+cards/imu
      )
    ],
    forbidden: SOURCES.map((source) => prohibition(
      source.id,
      "human-plan-negated",
      /\b(?:não|nunca)\s+(?:resuma|mostre)[\s\S]{0,180}dificuldade[\s\S]{0,100}resposta/iu
    ))
  }),
  Object.freeze({
    code: "APPROVED_DIAGNOSIS_PERSISTENCE_MISSING",
    title: "A persistência aprovada deve conservar o diagnóstico compacto.",
    required: [
      requirement(
        "chatgpt-instructions",
        "prompt-approved-diagnosis-persistence",
        /Após\s+aprovação\s+ou\s+ajuste,\s+use[\s\S]{0,180}record_approved_plan[\s\S]{0,220}Vincule[\s\S]{0,180}dificuldade\s+e\s+resposta/iu
      ),
      requirement(
        "authoring-knowledge",
        "knowledge-approved-diagnosis-persistence",
        /Após\s+aprovação,\s+use\s+summary[\s\S]{0,180}pedagogicalDiagnosis\.difficultyResponses/iu
      )
    ],
    forbidden: SOURCES.map((source) => prohibition(
      source.id,
      "approved-diagnosis-persistence-negated",
      /\b(?:não|nunca)\s+(?:persista|registre|vincule)[\s\S]{0,180}(?:diagnóstico|dificuldade|difficultyResponses)/iu
    ))
  }),
  Object.freeze({
    code: "DETERMINISTIC_PRACTICE_POLICY_MISSING",
    title: "Práticas presentes devem ter correção determinística.",
    required: [
      requirement(
        "chatgpt-instructions",
        "deterministic-correction",
        /Práticas\s+são\s+autocontidas\s+e\s+têm\s+correção\s+determinística/iu
      ),
      requirement(
        "chatgpt-instructions",
        "no-heuristic-assessment",
        /Não\s+use\s+regex,[\s\S]{0,100}avaliação\s+por\s+LLM[\s\S]{0,120}(?:correspondência\s+aproximada|fuzzy\s+matching)/iu
      ),
      requirement(
        "authoring-knowledge",
        "deterministic-correction",
        /Quando\s+houver\s+prática,[\s\S]{0,180}possui\s+resposta\s+determinística/iu
      ),
      requirement(
        "authoring-knowledge",
        "no-heuristic-assessment",
        /não\s+use\s+regex,\s*fuzzy\s+matching,\s*avaliação\s+por\s+LLM/iu
      )
    ],
    forbidden: SOURCES.flatMap((source) => [
      prohibition(
        source.id,
        "heuristic-assessment-encouraged",
        /(?<!não\s)(?<!nunca\s)\buse\s+regex\b/iu
      ),
      prohibition(
        source.id,
        "heuristic-assessment-synonym-encouraged",
        /\b(?:utilize|empregue|adote)\s+regex\b/iu
      )
    ])
  }),
  Object.freeze({
    code: "DIAGNOSIS_PLAN_CARDS_AUDIT_MISSING",
    title: "A auditoria deve confrontar diagnóstico, plano e cards.",
    required: [
      requirement(
        "chatgpt-instructions",
        "prompt-coherence-audit",
        /(?:^|\n)Confronte\s+diagnóstico,\s*plano\s+e\s+cards/imu
      ),
      requirement(
        "authoring-knowledge",
        "knowledge-coherence-audit",
        /Para\s+cada\s+difficultyResponses\s+persistido,\s+procure\s+nos\s+cards\s+a\s+resposta\s+prometida/iu
      )
    ],
    forbidden: SOURCES.map((source) => prohibition(
      source.id,
      "coherence-audit-negated",
      /\b(?:não|nunca)\s+(?:confronte|procure)[\s\S]{0,180}(?:diagnóstico|difficultyResponses|cards)/iu
    ))
  }),
  Object.freeze({
    code: "GLOBAL_CALIBRATION_REMAINS",
    title: "Calibração e preferências pedagógicas globais não podem permanecer.",
    forbidden: SOURCES.flatMap((source) => [prohibition(
        source.id,
        "legacy-calibration-contract",
        /AUTHORING_CALIBRATION_VERSION|AUTHORING_DEFAULT_PRESET|AUTHORING_PREFERENCE_DEFINITIONS|calibrationContract/iu
      ), prohibition(
        source.id,
        "global-pedagogical-preference",
        /\b(?:mantenha|defina|use|aplique)\b[^.\n]{0,100}\b(?:preferência|estilo|estratégia)\s+pedagógic[ao]\s+global\b/iu
      )])
  }),
  Object.freeze({
    code: "POSITIVE_EFFECTIVENESS_CLAIM_REMAINS",
    title: "As fontes não podem alegar eficácia ou aprendizagem garantida.",
    forbidden: SOURCES.map((source) => prohibition(
      source.id,
      "positive-effectiveness-claim",
      /\b(?:garante|comprova|assegura|demonstra)\b[\s\S]{0,100}\b(?:aprendizagem|domínio|eficácia|resultado\s+educacional)\b|\bé\s+eficaz\b|\b(?:produz|gera)\b[^.\n]{0,80}\b(?:aprendizagem|domínio|eficácia|resultado\s+educacional)\b/iu
    ))
  })
]);

export class AuthoringSourceIterationError extends Error {
  constructor(code, detail) {
    super(`[${code}] ${detail}`);
    this.name = "AuthoringSourceIterationError";
    this.code = code;
  }
}

function sourceRuleCoverage(
  findingCode,
  sharedRubricRequired,
  sharedRubricForbidden = []
) {
  return Object.freeze({
    findingCode,
    scenarioIds: [...SCENARIO_IDS],
    sharedRubricRequired: [...sharedRubricRequired],
    sharedRubricForbidden: [...sharedRubricForbidden]
  });
}

function requirement(sourceId, id, pattern) {
  return Object.freeze({ sourceId, id, pattern });
}

function prohibition(sourceId, id, pattern) {
  return Object.freeze({ sourceId, id, pattern });
}

function fail(code, detail) {
  throw new AuthoringSourceIterationError(code, detail);
}

function ensure(condition, code, detail) {
  if (!condition) fail(code, detail);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function lineEvidence(source, matchIndex) {
  const prefix = source.slice(0, matchIndex);
  const line = prefix.split("\n").length;
  const lineStart = source.lastIndexOf("\n", matchIndex - 1) + 1;
  const lineEndValue = source.indexOf("\n", matchIndex);
  const lineEnd = lineEndValue < 0 ? source.length : lineEndValue;
  return {
    line,
    excerpt: source.slice(lineStart, lineEnd).trim().slice(0, 180)
  };
}

function missingObservation({ sourceId, id }) {
  return {
    sourceId,
    checkId: id,
    observation: "required-content-absent"
  };
}

function forbiddenObservation(check, source, match) {
  return {
    sourceId: check.sourceId,
    checkId: check.id,
    observation: "forbidden-content-present",
    ...lineEvidence(source, match.index)
  };
}

export function auditAuthoringSourceRevision(sourceById) {
  const findings = [];
  for (const rule of RULES) {
    const observations = [];
    for (const check of rule.required ?? []) {
      const source = sourceById[check.sourceId] ?? "";
      check.pattern.lastIndex = 0;
      if (!check.pattern.test(source)) observations.push(missingObservation(check));
    }
    for (const check of rule.forbidden ?? []) {
      const source = sourceById[check.sourceId] ?? "";
      check.pattern.lastIndex = 0;
      const match = check.pattern.exec(source);
      if (match) observations.push(forbiddenObservation(check, source, match));
    }
    if (observations.length > 0) {
      findings.push({
        code: rule.code,
        title: rule.title,
        observations
      });
    }
  }
  return findings;
}

export function fingerprintCanonicalText(content) {
  const canonicalContent = content.replace(/\r\n?/gu, "\n");
  return {
    sha256: sha256(canonicalContent),
    bytes: Buffer.byteLength(canonicalContent)
  };
}

function sourceFingerprint(sourceDefinition, content) {
  return {
    id: sourceDefinition.id,
    path: sourceDefinition.path,
    ...fingerprintCanonicalText(content)
  };
}

function currentSources() {
  return Object.fromEntries(SOURCES.map((source) => [
    source.id,
    fs.readFileSync(path.join(ROOT, source.path), "utf8")
  ]));
}

function baselineSources(commit) {
  try {
    return Object.fromEntries(SOURCES.map((source) => [
      source.id,
      execFileSync("git", ["show", `${commit}:${source.path}`], {
        cwd: ROOT,
        encoding: "utf8",
        maxBuffer: 2 * 1_024 * 1_024,
        stdio: ["ignore", "pipe", "ignore"]
      })
    ]));
  } catch {
    return null;
  }
}

export function loadAuthoringSourceIteration() {
  const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, "utf8"));
  const scenarioCorpusSource = fs.readFileSync(SCENARIO_CORPUS_PATH, "utf8");
  const runCorpusSource = fs.readFileSync(RUN_CORPUS_PATH, "utf8");
  return {
    artifact,
    baselineSourceById: baselineSources(artifact.baseline.revision.id),
    finalSourceById: currentSources(),
    scenarioCorpusSource,
    runCorpusSource,
    scenarioCorpus: JSON.parse(scenarioCorpusSource),
    runCorpus: JSON.parse(runCorpusSource),
    scenarioCorpusSha256: fingerprintCanonicalText(scenarioCorpusSource).sha256,
    runCorpusSha256: fingerprintCanonicalText(runCorpusSource).sha256
  };
}

function validateFingerprints(label, expected, sourceById) {
  const actual = SOURCES.map((source) => sourceFingerprint(
    source,
    sourceById[source.id]
  ));
  ensure(
    sameJson(actual, expected),
    "source-fingerprint-mismatch",
    `${label}: os fingerprints não correspondem às fontes auditadas`
  );
}

function validateScenarioLinkage({
  artifact,
  scenarioCorpus,
  runCorpus,
  scenarioCorpusSource,
  runCorpusSource,
  scenarioCorpusSha256,
  runCorpusSha256,
  baselineFindingCodes
}) {
  const linkage = artifact.scenarioLinkage;
  let parsedScenarioCorpus;
  let parsedRunCorpus;
  try {
    parsedScenarioCorpus = JSON.parse(scenarioCorpusSource);
    parsedRunCorpus = JSON.parse(runCorpusSource);
  } catch {
    fail("scenario-linkage", "os bytes dos corpora vinculados não são JSON válido");
  }
  const scenarioIds = scenarioCorpus.scenarios.map(({ id }) => id);
  const runScenarioIds = runCorpus.runs.map(({ scenarioId }) => scenarioId);
  ensure(
    scenarioCorpus.contract === SCENARIO_CONTRACT &&
      runCorpus.contract === RUN_CONTRACT &&
      linkage?.scenarioContract === SCENARIO_CONTRACT &&
      linkage?.scenarioCorpusPath ===
        "authoring/evals/contextual-planning-scenarios.v1.json" &&
      linkage?.scenarioCorpusSha256 === SCENARIO_CORPUS_SHA256 &&
      fingerprintCanonicalText(scenarioCorpusSource).sha256 ===
        SCENARIO_CORPUS_SHA256 &&
      scenarioCorpusSha256 === SCENARIO_CORPUS_SHA256 &&
      sameJson(parsedScenarioCorpus, scenarioCorpus) &&
      linkage?.runContract === RUN_CONTRACT &&
      linkage?.runCorpusPath ===
        "authoring/evals/contextual-planning-runs.v1.json" &&
      linkage?.runCorpusSha256 === RUN_CORPUS_SHA256 &&
      fingerprintCanonicalText(runCorpusSource).sha256 ===
        RUN_CORPUS_SHA256 &&
      runCorpusSha256 === RUN_CORPUS_SHA256 &&
      sameJson(parsedRunCorpus, runCorpus) &&
      runCorpus.scenarioContract === SCENARIO_CONTRACT &&
      sameJson(linkage.scenarioIds, SCENARIO_IDS) &&
      sameJson(scenarioIds, linkage.scenarioIds) &&
      sameJson(runScenarioIds, linkage.scenarioIds),
    "scenario-linkage",
    "a iteração de fontes não está ligada aos contratos e runs A–E vigentes"
  );

  const coverage = linkage.sourceRuleCoverage ?? [];
  ensure(
    sameJson(coverage, SOURCE_RULE_COVERAGE) &&
      sameJson(
        coverage.map(({ findingCode }) => findingCode).sort(),
        [...baselineFindingCodes].sort()
      ),
    "scenario-linkage",
    "a relação com os cenários não cobre exatamente os findings do baseline"
  );
  for (const link of coverage) {
    ensure(
      link.scenarioIds.length > 0 &&
        link.scenarioIds.every((id) => linkage.scenarioIds.includes(id)) &&
        (link.sharedRubricRequired ?? []).every((criterion) => (
          scenarioCorpus.sharedRubric.required.includes(criterion)
        )) &&
        (link.sharedRubricForbidden ?? []).every((criterion) => (
          scenarioCorpus.sharedRubric.forbidden.includes(criterion)
        )),
      "scenario-linkage",
      `${link.findingCode} aponta para cenário ou rubrica inexistente`
    );
  }
  ensure(
    linkage.scenarioIds.every((id) => coverage.some(
      ({ scenarioIds: linkedIds }) => linkedIds.includes(id)
    )),
    "scenario-linkage",
    "ao menos um cenário A–E ficou sem relação com as regras de fonte"
  );

  let replayResult;
  try {
    replayResult = evaluateContextualPlanningRuns({ scenarioCorpus, runCorpus });
  } catch (error) {
    fail(
      "scenario-linkage",
      `os runs A–E ligados à iteração não passam no evaluator: ${error.message}`
    );
  }
  ensure(
    replayResult.result === "pass" &&
      sameJson(replayResult.scenariosEvaluated, SCENARIO_IDS) &&
      replayResult.finalAudit.status === "conformant" &&
      replayResult.finalAudit.findings.length === 0,
    "scenario-linkage",
    "os runs vinculados não terminam conformes nos cenários A–E"
  );
}

export function evaluateAuthoringSourceIteration({
  artifact,
  baselineSourceById,
  finalSourceById,
  scenarioCorpus,
  runCorpus,
  scenarioCorpusSource,
  runCorpusSource,
  scenarioCorpusSha256,
  runCorpusSha256
}) {
  ensure(
    artifact.contract === "aralearn.authoring-source-iteration.v1" &&
      artifact.version === 1,
    "source-iteration-contract",
    "contrato versionado ausente ou incompatível"
  );
  ensure(
    artifact.claimBoundary === CLAIM_BOUNDARY &&
      artifact.evaluationKind === "source-level-engineering" &&
      sameJson(artifact.method, METHOD),
    "claim-boundary",
    "o limite de alegação da auditoria de fontes foi alterado"
  );
  ensure(
    artifact.baseline.revision.kind === "git-commit" &&
      artifact.baseline.revision.id === BASELINE_COMMIT,
    "baseline-revision",
    "o baseline não aponta para o commit canônico esperado"
  );
  ensure(
    artifact.final.revision.kind === "workspace-source-snapshot" &&
      artifact.final.revision.label === "issue-96-final-precommit",
    "final-revision",
    "a revisão final não está identificada pelo snapshot canônico"
  );

  ensure(
    baselineSourceById,
    "baseline-content-unavailable",
    "o objeto Git baseline é obrigatório; use checkout com fetch-depth: 0"
  );
  validateFingerprints("baseline", artifact.baseline.sources, baselineSourceById);
  ensure(
    sameJson(artifact.baseline.sources, BASELINE_SOURCE_FINGERPRINTS),
    "baseline-fingerprint",
    "os fingerprints baseline não correspondem aos blobs canônicos do commit"
  );
  const baselineFindings = auditAuthoringSourceRevision(baselineSourceById);
  ensure(
    sameJson(baselineFindings, artifact.baseline.findings),
    "baseline-findings",
    "os findings registrados não são derivados do conteúdo Git do baseline"
  );

  validateFingerprints("final", artifact.final.sources, finalSourceById);
  const finalFindings = auditAuthoringSourceRevision(finalSourceById);
  ensure(
    baselineFindings.length > 0 &&
      sameJson(finalFindings, artifact.final.findings) &&
      finalFindings.length === 0,
    "final-source-findings",
    `a revisão final conserva findings: ${finalFindings
      .map(({ code }) => code)
      .join(", ")}`
  );

  const addressedCodeList = artifact.adjustments.flatMap(
    ({ addressesFindingCodes }) => addressesFindingCodes
  );
  ensure(
    sameJson(
      [...addressedCodeList].sort(),
      baselineFindings.map(({ code }) => code).sort()
    ) &&
      new Set(artifact.adjustments.map(({ id }) => id)).size ===
        artifact.adjustments.length &&
      artifact.adjustments.every(({ sourcePaths }) => (
        sourcePaths.length > 0 && sourcePaths.every((sourcePath) => (
          SOURCES.some(({ path: expectedPath }) => expectedPath === sourcePath)
        ))
      )),
    "adjustment-trace",
    "os ajustes não cobrem todos os findings ou apontam para fonte estranha"
  );

  const pathBySourceId = new Map(SOURCES.map(({ id, path: sourcePath }) => (
    [id, sourcePath]
  )));
  const baselineFingerprintByPath = new Map(artifact.baseline.sources.map(
    (source) => [source.path, source.sha256]
  ));
  const finalFingerprintByPath = new Map(artifact.final.sources.map(
    (source) => [source.path, source.sha256]
  ));
  for (const adjustment of artifact.adjustments) {
    const addressedFindings = baselineFindings.filter(({ code }) => (
      adjustment.addressesFindingCodes.includes(code)
    ));
    const observedPaths = [...new Set(addressedFindings.flatMap(({ observations }) => (
      observations.map(({ sourceId }) => pathBySourceId.get(sourceId))
    )))].sort();
    ensure(
      sameJson([...adjustment.sourcePaths].sort(), observedPaths) &&
        observedPaths.every((sourcePath) => (
          baselineFingerprintByPath.get(sourcePath) !==
            finalFingerprintByPath.get(sourcePath)
        )),
      "adjustment-trace",
      `${adjustment.id} não aponta exatamente para as fontes observadas e alteradas`
    );
  }

  const baselineCodes = baselineFindings.map(({ code }) => code);
  validateScenarioLinkage({
    artifact,
    scenarioCorpus,
    runCorpus,
    scenarioCorpusSource,
    runCorpusSource,
    scenarioCorpusSha256,
    runCorpusSha256,
    baselineFindingCodes: baselineCodes
  });
  ensure(
    artifact.executionEvidence.command ===
      "node scripts/evaluateAuthoringSourceIteration.mjs" &&
      artifact.executionEvidence.baseline.status === "nonconformant" &&
      sameJson(artifact.executionEvidence.baseline.findingCodes, baselineCodes) &&
      artifact.executionEvidence.final.status === "conformant" &&
      sameJson(artifact.executionEvidence.final.findingCodes, []),
    "execution-evidence",
    "o registro da execução não corresponde à auditoria derivada"
  );

  return {
    result: "pass",
    baselineMode: "git-object",
    baselineRevision: BASELINE_COMMIT,
    baselineFindingCodes: baselineCodes,
    finalFindingCodes: finalFindings.map(({ code }) => code),
    sourceCount: SOURCES.length
  };
}

const isDirectExecution = process.argv[1] && (
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
);

if (isDirectExecution) {
  try {
    const result = evaluateAuthoringSourceIteration(
      loadAuthoringSourceIteration()
    );
    console.log(
      `Iteração de fontes: baseline ${result.baselineRevision.slice(0, 8)} ` +
      `com ${result.baselineFindingCodes.length} findings; revisão final com ` +
      `${result.finalFindingCodes.length} (${result.result}, ${result.baselineMode}).`
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
