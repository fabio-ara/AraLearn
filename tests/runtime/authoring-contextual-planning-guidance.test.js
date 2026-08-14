import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const AUTHORING_ROOT = path.join(ROOT, "authoring");
const CORPUS_PATH = path.join(
  AUTHORING_ROOT,
  "evals",
  "contextual-planning-scenarios.v1.json"
);

const CORE_GUIDANCE = [
  "core/quality.md",
  "core/workflow.md",
  "core/editorial-cycle.md"
];

const PLATFORM_INSTRUCTIONS = [
  "platforms/chatgpt/INSTRUCTIONS.md",
  "platforms/claude/PROJECT_INSTRUCTIONS.md",
  "platforms/gemini/GEM_INSTRUCTIONS.md",
  "platforms/generic/SYSTEM_PROMPT.md",
  "platforms/microsoft-365/AGENT_INSTRUCTIONS.md",
  "platforms/microsoft-365/declarative-agent/instructions.txt"
];

function readAuthoring(relativePath) {
  return fs.readFileSync(path.join(AUTHORING_ROOT, relativePath), "utf8");
}

function allInstructionSources() {
  const roots = [
    path.join(AUTHORING_ROOT, "core"),
    path.join(AUTHORING_ROOT, "platforms")
  ];
  const result = [];

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else if (entry.isFile() && /\.(?:md|txt)$/iu.test(entry.name)) {
        result.push(entryPath);
      }
    }
  }

  roots.forEach(visit);
  return result.sort();
}

function scenarioById(corpus, id) {
  return corpus.scenarios.find((scenario) => scenario.id === id);
}

test("fontes canônicas descrevem diagnóstico, decisão humana e auditoria coerente", () => {
  const guidance = CORE_GUIDANCE.map(readAuthoring).join("\n");

  for (const dimension of [
    "learningConditions",
    "contentDemands",
    "anticipatedDifficulties",
    "designResponses"
  ]) {
    assert.match(guidance, new RegExp(`\\b${dimension}\\b`, "u"));
  }

  assert.match(guidance, /use\s+primeiro[\s\S]{0,180}(?:pedido|contexto)/iu);
  assert.match(guidance, /pergunt[\s\S]{0,180}mudar materialmente/iu);
  assert.match(guidance, /questionário\s+fixo/iu);
  assert.match(guidance, /dificuldade[\s\S]{0,160}resposta/iu);
  assert.match(guidance, /linguagem humana[\s\S]{0,180}pare/iu);
  assert.match(guidance, /record_approved_plan/iu);
  assert.match(guidance, /raciocínio privado/iu);
  assert.match(guidance, /correção[\s\S]{0,100}determinística/iu);
  assert.match(guidance, /diagnóstico, plano e (?:materialização|cards)/iu);
  assert.match(guidance, /não (?:atribua|medem|alegue)[\s\S]{0,80}eficácia/iu);
});

test("instruções das plataformas conservam a mesma política contextual", () => {
  for (const relativePath of PLATFORM_INSTRUCTIONS) {
    const source = readAuthoring(relativePath);
    assert.match(
      source,
      /use\s+primeiro[\s\S]{0,160}(?:contexto|pedido)/iu,
      `${relativePath} não prioriza o contexto existente.`
    );
    assert.match(
      source,
      /pergunt[\s\S]{0,160}mudar materialmente/iu,
      `${relativePath} não limita perguntas a decisões materiais.`
    );
    assert.match(
      source,
      /questionário\s+fixo/iu,
      `${relativePath} não recusa questionário fixo.`
    );
    assert.match(
      source,
      /dificuldade[\s\S]{0,180}resposta/iu,
      `${relativePath} não liga dificuldade e resposta.`
    );
    assert.match(
      source,
      /record_approved_plan/iu,
      `${relativePath} não persiste o plano aprovado atomicamente.`
    );
    assert.match(
      source,
      /determinístic/iu,
      `${relativePath} não protege práticas determinísticas.`
    );
    assert.match(
      source,
      /diagnóstico,\s*plano\s*e\s*cards/iu,
      `${relativePath} não exige auditoria da coerência materializada.`
    );
  }

  assert.ok(
    readAuthoring("platforms/chatgpt/INSTRUCTIONS.md").length < 7_600,
    "As instruções do ChatGPT excedem o orçamento distribuível."
  );
});

test("agente declarativo Microsoft 365 usa exatamente a instrução-fonte", () => {
  const source = readAuthoring(
    "platforms/microsoft-365/declarative-agent/instructions.txt"
  ).trim();
  const manifest = JSON.parse(readAuthoring(
    "platforms/microsoft-365/declarative-agent/declarativeAgent.json"
  ));
  assert.equal(manifest.instructions, source);
});

test("materiais executáveis não conservam a configuração pedagógica global removida", () => {
  const forbidden = /tone-and-approach|examples-and-context|practice-variation|terminology-and-notation|INSTRUCTIONS-CALIBRADAS|CALIBRACAO-ARALEARN|calibra(?:ção|r|d[ao]s?)/iu;

  for (const filePath of allInstructionSources()) {
    assert.doesNotMatch(
      fs.readFileSync(filePath, "utf8"),
      forbidden,
      `${path.relative(ROOT, filePath)} conserva linguagem de configuração global.`
    );
  }
});

test("corpus A–E é versionado e contém rubricas observáveis", () => {
  const corpus = JSON.parse(fs.readFileSync(CORPUS_PATH, "utf8"));
  assert.equal(
    corpus.contract,
    "aralearn.authoring-contextual-planning-scenarios.v1"
  );
  assert.equal(corpus.version, 1);
  assert.equal(corpus.evaluationKind, "engineering-regression");
  assert.deepEqual(corpus.scenarios.map(({ id }) => id), ["A", "B", "C", "D", "E"]);
  assert.match(corpus.claimBoundary, /não mede resultados de aprendizagem/iu);

  for (const required of [
    "use-known-context-first",
    "ask-only-materially-decisive-questions",
    "link-each-material-difficulty-to-a-design-response",
    "make-design-decisions-per-microsequence",
    "pause-for-human-decision-before-cards",
    "persist-only-approved-compact-decisions",
    "use-deterministic-practice"
  ]) {
    assert.ok(corpus.sharedRubric.required.includes(required), required);
  }
  for (const forbidden of [
    "fixed-questionnaire",
    "global-pedagogical-style",
    "private-reasoning-persistence",
    "regex-or-llm-answer-assessment",
    "educational-effectiveness-claim"
  ]) {
    assert.ok(corpus.sharedRubric.forbidden.includes(forbidden), forbidden);
  }

  for (const scenario of corpus.scenarios) {
    assert.ok(scenario.initialRequest.trim().length > 40, scenario.id);
    assert.ok(scenario.knownContext.length > 0, scenario.id);
    assert.ok(["ask-material", "do-not-ask"].includes(
      scenario.questionPolicy.mode
    ), scenario.id);
    assert.ok(scenario.difficultyResponseLinks.length > 0, scenario.id);
    for (const link of scenario.difficultyResponseLinks) {
      for (const field of [
        "microsequence",
        "contentDemand",
        "anticipatedDifficulty",
        "designResponse"
      ]) {
        assert.ok(link[field].trim().length > 8, `${scenario.id}/${field}`);
      }
    }
    assert.match(scenario.humanPlan, /pausar|pare|decisão/iu, scenario.id);
    assert.match(
      scenario.practicePolicy,
      /determiníst|inequívoc/iu,
      scenario.id
    );
  }
});

test("cenários contrastam perguntas, condições e respostas sem hardcode", () => {
  const corpus = JSON.parse(fs.readFileSync(CORPUS_PATH, "utf8"));
  const scenarioA = scenarioById(corpus, "A");
  const scenarioB = scenarioById(corpus, "B");
  const scenarioC = scenarioById(corpus, "C");
  const scenarioD = scenarioById(corpus, "D");
  const scenarioE = scenarioById(corpus, "E");

  assert.equal(scenarioA.questionPolicy.mode, "ask-material");
  assert.ok(scenarioA.materialUnknowns.some(
    ({ id }) => id === "regular-computer-access"
  ));
  assert.ok(scenarioA.resourceDiscovery.maySelect.includes(
    "aralearn.resource.terminal_session"
  ));

  assert.equal(scenarioB.questionPolicy.mode, "do-not-ask");
  assert.equal(scenarioB.materialUnknowns.length, 0);
  assert.match(
    scenarioB.resourceDiscovery.selectionRule,
    /não é compensação obrigatória/iu
  );

  assert.equal(scenarioC.questionPolicy.mode, "do-not-ask");
  assert.ok(scenarioC.questionPolicy.forbidden.some(
    (item) => /laboratório/iu.test(item)
  ));
  assert.ok(scenarioC.resourceDiscovery.maySelect.includes(
    "aralearn.resource.annotated_text"
  ));

  assert.equal(scenarioD.questionPolicy.mode, "do-not-ask");
  assert.ok(scenarioD.questionPolicy.forbidden.some(
    (item) => /dado já informado/iu.test(item)
  ));

  assert.equal(scenarioE.questionPolicy.mode, "do-not-ask");
  assert.ok(scenarioE.questionPolicy.forbidden.some(
    (item) => /quantidade|condensar/iu.test(item)
  ));
  assert.ok(scenarioE.difficultyResponseLinks.some(
    ({ designResponse }) => /camadas|microssequências/iu.test(designResponse)
  ));
});
