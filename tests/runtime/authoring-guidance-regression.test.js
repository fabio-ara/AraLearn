import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DESIGN_PARAMETER_CATALOG
} from "../../src/authoring/instructionalDesignContracts.js";
import {
  DESIGN_SCOPE_ORDER,
  resolveEffectiveDesignParameters
} from "../../src/authoring/designParameterResolution.js";
import {
  prepareAuthoringContext
} from "../../supabase/functions/_shared/aralearn-authoring/authoringKnowledge.js";
import {
  mapAuthoringMcpToolCall
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceMcpTools.js";

// Regressão determinística de engenharia. Estes checks conferem protocolo e
// orientação versionada; não validam aprendizagem, eficácia ou qualidade docente.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const MICROSEQUENCE_PATH = ["course-a", "module-a", "lesson-a", "micro-a"];

async function authoringSource(relativePath) {
  return readFile(path.join(ROOT, "authoring", relativePath), "utf8");
}

const [
  prompt,
  semanticGranularity,
  complexProfessionalTask,
  parameterResolution,
  resourceSetDiscovery
] = await Promise.all([
  authoringSource("platforms/chatgpt/INSTRUCTIONS.md"),
  authoringSource("knowledge/semantic-granularity.md"),
  authoringSource("knowledge/complex-professional-task.md"),
  authoringSource("knowledge/parameter-resolution.md"),
  authoringSource("knowledge/resource-set-discovery.md")
]);

const fixture = JSON.parse(await readFile(
  path.join(ROOT, "tests", "fixtures", "pedagogy", "instructional-design-scenarios.v1.json"),
  "utf8"
));
const canonicalAnalysis = fixture.scenarios.find(
  ({ id }) => id === fixture.canonicalLifecycle.analysisScenarioRef
).analysis;
const fallbackDefinition = structuredClone(DESIGN_PARAMETER_CATALOG.find(
  ({ id }) => id === "representation_fallback_policy"
));

function guidanceIds(intent, context) {
  return prepareAuthoringContext({
    intent,
    targetEntity: "microsequence",
    context
  }).guidance.map(({ id }) => id);
}

function resolutionPath(microsequenceRef) {
  const refs = {
    workspace: "workspace-guidance-regression",
    course: "course-guidance-regression",
    module: "module-guidance-regression",
    lesson: "lesson-guidance-regression",
    microsequence: microsequenceRef
  };
  return DESIGN_SCOPE_ORDER.map((kind) => ({ kind, ref: refs[kind] }));
}

function analysisFor(microsequenceRef) {
  const analysis = structuredClone(canonicalAnalysis);
  analysis.id = `analysis-${microsequenceRef}`;
  analysis.scope = { kind: "microsequence", ref: microsequenceRef };
  analysis.derivedFrom = { workspaceRevision: 11, scopeEntityVersion: 3 };
  return analysis;
}

function parameterAssignment({ id, mode, scope, value }) {
  const authority = mode === "research_lock"
    ? { kind: "research_protocol", actorRef: "protocol:guidance", locked: true }
    : mode === "manual_override"
      ? { kind: "author", actorRef: "author:guidance", locked: false }
      : { kind: "gpt", actorRef: null, locked: false };
  return {
    contract: "DesignParameterAssignment@1",
    modelVersion: "1.0.0",
    id,
    version: "1.0.0",
    definitionRef: { id: fallbackDefinition.id, version: fallbackDefinition.version },
    scope: structuredClone(scope),
    mode,
    value: { kind: "enum", value },
    authority,
    rationale: "Regressão determinística de engenharia da #104.",
    provenanceRefs: [`test:${id}`]
  };
}

function resolveScenario(microsequenceRef, assignments) {
  const analysis = analysisFor(microsequenceRef);
  return resolveEffectiveDesignParameters({
    analysis,
    definitions: [fallbackDefinition],
    assignments,
    defaults: [],
    resolutionPath: resolutionPath(microsequenceRef),
    resourceSets: [],
    requiredDefinitionRefs: [{
      id: fallbackDefinition.id,
      version: fallbackDefinition.version
    }],
    workspaceRevision: 19,
    scopeEntityVersion: 3,
    snapshotId: `snapshot-${microsequenceRef}`,
    snapshotVersion: "1.0.0",
    resolutionVersion: "1.0.0",
    frozenAt: "2026-08-15T12:00:00Z"
  });
}

function mapAssignment(operation, assignment, requestId) {
  return mapAuthoringMcpToolCall("gerirDesenhoInstrucional", {
    operation,
    workspaceId: WORKSPACE_ID,
    microsequencePath: MICROSEQUENCE_PATH,
    requestId,
    expectedRevision: 19,
    payloadJson: JSON.stringify(assignment)
  });
}

test("regressão de engenharia #104: ciclo JIT precede cards e manifesto", () => {
  const cycle = prompt.slice(
    prompt.indexOf("## Ciclo just-in-time"),
    prompt.indexOf("## Resources e cards")
  );
  assert.match(cycle, /1\.[^\n]*`read_slice`/u);
  assert.match(cycle, /1\.[^\n]*`overview`[^\n]*`availableViews`/u);
  assert.match(cycle, /`analysis`[^\n]*`parameters`[^\n]*`blueprint`[^\n]*`binding`[^\n]*`materialization`/u);
  assert.match(cycle, /2\.[^\n]*knowledge[^\n]*`save_analysis`/iu);
  assert.match(cycle, /3\.[^\n]*`save_resource_set`/u);
  assert.match(cycle, /4\.[^\n]*`set_parameter`/u);
  assert.match(cycle, /5\.[^\n]*`resolve_effective`/u);
  assert.match(cycle, /6\.[^\n]*ResourceSet[^\n]*`explore`[^\n]*`search`[^\n]*`inspect`[^\n]*`contracts`/u);
  assert.match(cycle, /7\.[^\n]*`save_blueprint`/u);
  assert.match(cycle, /8\.[^\n]*em memória/iu);
  assert.match(cycle, /9\.[^\n]*`validate_card`[^\n]*`audit_representation`/u);
  const orderedOperations = [
    "`read_slice`",
    "`save_analysis`",
    "`save_resource_set`",
    "`set_parameter`",
    "`resolve_effective`",
    "`explore`",
    "`save_blueprint`",
    "em memória",
    "`validate_card`",
    "`salvarCardsNaMicrossequencia`",
    "releia o estado persistido",
    "`register_manifest`"
  ];
  let previousIndex = -1;
  for (const marker of orderedOperations) {
    const index = cycle.indexOf(marker);
    assert.ok(index > previousIndex, `${marker} está fora da ordem segura.`);
    previousIndex = index;
  }
  assert.match(prompt, /exatamente uma microssequência por vez/iu);
  assert.match(prompt, /nova sessão[^.]*workspace[^.]*sem reconstruir estado pela conversa/iu);
});

test("regressão de engenharia #104: cards e contagens permanecem derivados", () => {
  assert.match(
    prompt,
    /Quantidade de cards, palavras, caracteres, práticas e resources é consequência[^.]*nunca meta pedagógica/iu
  );
  assert.match(
    semanticGranularity,
    /Conte cards, palavras, caracteres, práticas e resources somente depois da materialização/iu
  );
});

test("regressão de engenharia #104: prepareAuthoringContext recupera guidance JIT e tool coesa", () => {
  const extend = prepareAuthoringContext({
    intent: "extend",
    targetEntity: "microsequence",
    context: "elaboração explicativa de uma relação com evidência e ResourceSet"
  });
  const extendIds = extend.guidance.map(({ id }) => id);
  for (const id of [
    "instructional-analysis",
    "parameter-resolution",
    "resource-set-discovery",
    "evidence-and-practice"
  ]) {
    assert.ok(extendIds.includes(id), id);
  }
  assert.ok(extend.recommendedTools.includes("gerirDesenhoInstrucional"));
  assert.ok(extend.guidance.length <= 8);

  const audit = prepareAuthoringContext({
    intent: "audit",
    targetEntity: "microsequence",
    context: "comparar planejamento, snapshot, blueprint e materialização"
  });
  assert.ok(audit.guidance.some(({ id }) => id === "design-conformance-audit"));
  assert.ok(audit.guidance.some(({ id }) => id === "resource-set-discovery"));
  assert.ok(audit.recommendedTools.includes("gerirDesenhoInstrucional"));
  assert.ok(audit.guidance.length <= 8);

  const planning = prepareAuthoringContext({
    intent: "create",
    targetEntity: "course",
    context: "planejar estrutura e Partes"
  });
  assert.equal(planning.recommendedTools.includes("salvarCardsNaMicrossequencia"), false);
  assert.equal(planning.guidance.some(({ id }) => id === "resource-set-discovery"), false);
});

test("regressão de engenharia #104 cenário A: texto curto semanticamente denso", () => {
  assert.match(semanticGranularity, /Texto curto e denso/iu);
  assert.match(semanticGranularity, /definição, exceção e relação causal/iu);
  assert.match(semanticGranularity, /parágrafo hermético/iu);
  assert.ok(guidanceIds("extend", "texto curto semanticamente denso e compressão")
    .includes("semantic-granularity"));
});

test("regressão de engenharia #104 cenário B: capítulo longo com pouca novidade", () => {
  assert.match(semanticGranularity, /Capítulo longo com pouca novidade/iu);
  assert.match(semanticGranularity, /não criam novas unidades por página/iu);
  assert.match(semanticGranularity, /sem gerar cards para acompanhar caracteres/iu);
  assert.ok(guidanceIds("extend", "capítulo longo com pouca novidade por página")
    .includes("semantic-granularity"));
});

test("regressão de engenharia #104 cenário C: matemática sem template de TI", () => {
  assert.match(semanticGranularity, /Matemática/iu);
  assert.match(
    semanticGranularity,
    /definição, relação entre grandezas, procedimento, representação e evidência de resolução/iu
  );
  assert.match(semanticGranularity, /Não aplique um template de tecnologia da informação/iu);
  assert.ok(guidanceIds("extend", "matemática: definição, relação e procedimento")
    .includes("semantic-granularity"));
});

test("regressão de engenharia #104 cenário D: programação sem ambiente executável", () => {
  assert.match(complexProfessionalTask, /Programação sem ambiente executável/iu);
  assert.match(complexProfessionalTask, /prática estática pode ser proxy/iu);
  assert.match(complexProfessionalTask, /limitação de fidelidade/iu);
  assert.ok(guidanceIds("extend", "programação sem ambiente executável; usar proxy")
    .includes("complex-professional-task"));
});

test("regressão de engenharia #104 cenário E: tarefa técnico-profissional não se reduz a escolha", () => {
  assert.match(complexProfessionalTask, /Treinamento técnico ou profissional/iu);
  assert.match(
    complexProfessionalTask,
    /conhecimento conceitual, procedimento, diagnóstico, decisão e verificação/iu
  );
  assert.match(complexProfessionalTask, /Não reduza todo o desempenho[^.]*múltipla escolha/iu);
  assert.ok(guidanceIds("extend", "treinamento profissional: procedimento e diagnóstico")
    .includes("complex-professional-task"));
});

test("regressão de engenharia #104 cenário F: Auto varia localmente", () => {
  assert.match(
    parameterResolution,
    /Microssequências do mesmo curso podem resolver valores automáticos diferentes/iu
  );
  assert.match(parameterResolution, /justificativa local/iu);
  assert.match(prompt, /Parâmetros podem variar por microssequência/iu);
  const microAPath = resolutionPath("micro-guidance-a");
  const microBPath = resolutionPath("micro-guidance-b");
  const assignmentA = parameterAssignment({
    id: "fallback-auto-guidance-a",
    mode: "auto",
    scope: microAPath.at(-1),
    value: "block"
  });
  const assignmentB = parameterAssignment({
    id: "fallback-auto-guidance-b",
    mode: "auto",
    scope: microBPath.at(-1),
    value: "allow_versatile_with_limitation"
  });
  const resolvedA = resolveScenario("micro-guidance-a", [assignmentA]);
  const resolvedB = resolveScenario("micro-guidance-b", [assignmentB]);
  assert.equal(resolvedA.ok, true, JSON.stringify(resolvedA.conflicts));
  assert.equal(resolvedB.ok, true, JSON.stringify(resolvedB.conflicts));
  assert.equal(resolvedA.snapshot.resolvedValues[0].resolution.assignmentMode, "auto");
  assert.equal(resolvedB.snapshot.resolvedValues[0].resolution.assignmentMode, "auto");
  assert.notEqual(
    resolvedA.snapshot.resolvedValues[0].value.value,
    resolvedB.snapshot.resolvedValues[0].value.value
  );
  const mapped = mapAssignment("set_parameter", assignmentA, "guidance-auto-f-0001");
  assert.equal(mapped.body.operation, "set_parameter");
  assert.equal(mapped.body.payload.mode, "auto");
});

test("regressão de engenharia #104 cenário G: override humano é preservado", () => {
  assert.match(parameterResolution, /linguagem natural[^.]*preserve o modo manual/iu);
  assert.match(prompt, /Nunca substitua valor manual/iu);
  assert.match(prompt, /Traduza-a para a mesma estrutura persistida/iu);
  const path = resolutionPath("micro-guidance-manual");
  const manual = parameterAssignment({
    id: "fallback-manual-guidance",
    mode: "manual_override",
    scope: path.at(-2),
    value: "allow_versatile_with_limitation"
  });
  const lowerAuto = parameterAssignment({
    id: "fallback-auto-below-manual",
    mode: "auto",
    scope: path.at(-1),
    value: "block"
  });
  const resolved = resolveScenario("micro-guidance-manual", [manual, lowerAuto]);
  assert.equal(resolved.ok, true, JSON.stringify(resolved.conflicts));
  assert.equal(
    resolved.snapshot.resolvedValues[0].resolution.assignmentMode,
    "manual_override"
  );
  assert.equal(resolved.snapshot.resolvedValues[0].value.value, manual.value.value);
  const mapped = mapAssignment("set_parameter", manual, "guidance-manual-g-0001");
  assert.equal(mapped.body.payload.mode, "manual_override");
  assert.deepEqual(mapped.body.payload.value, manual.value);
});

test("regressão de engenharia #104 cenário H: research lock domina", () => {
  assert.match(parameterResolution, /`research_lock`[^.]*não tente adaptá-lo/iu);
  assert.match(parameterResolution, /research_lock > manual_override > auto > default/u);
  assert.match(prompt, /Nunca substitua[^.]*lock de pesquisa/iu);
  const path = resolutionPath("micro-guidance-lock");
  const lock = parameterAssignment({
    id: "fallback-lock-guidance",
    mode: "research_lock",
    scope: path[1],
    value: "block"
  });
  const forbiddenManual = parameterAssignment({
    id: "fallback-manual-below-lock",
    mode: "manual_override",
    scope: path.at(-2),
    value: "allow_substitute_with_limitation"
  });
  const resolved = resolveScenario("micro-guidance-lock", [lock, forbiddenManual]);
  assert.equal(resolved.ok, false);
  assert.equal(resolved.snapshot, null);
  assert.ok(resolved.conflicts.some(({ code }) => (
    code === "research_lock_blocks_lower_assignment"
  )));
  const mapped = mapAssignment("set_parameter", lock, "guidance-lock-h-0001");
  assert.equal(mapped.body.payload.mode, "research_lock");
  assert.equal(mapped.body.payload.authority.locked, true);
});

test("regressão de engenharia #104: ResourceSet é autoridade persistida", () => {
  assert.match(resourceSetDiscovery, /não aceite allowlist fornecida pelo modelo/iu);
  assert.match(resourceSetDiscovery, /`workspaceId` e a referência do snapshot/iu);
  assert.match(resourceSetDiscovery, /mesmo ResourceSet[^.]*package/iu);
  assert.match(resourceSetDiscovery, /Nunca finja equivalência/iu);
  const prepared = prepareAuthoringContext({
    intent: "extend",
    targetEntity: "microsequence",
    context: "Resolver parâmetros e ResourceSet antes de selecionar representação"
  });
  assert.ok(prepared.guidance.some(({ id }) => id === "instructional-analysis"));
  assert.ok(prepared.guidance.some(({ id }) => id === "parameter-resolution"));
  assert.ok(prepared.guidance.some(({ id }) => id === "resource-set-discovery"));
  assert.ok(prepared.recommendedTools.includes("gerirDesenhoInstrucional"));
  const bootstrap = mapAuthoringMcpToolCall("gerirDesenhoInstrucional", {
    operation: "save_resource_set",
    workspaceId: WORKSPACE_ID,
    microsequencePath: MICROSEQUENCE_PATH,
    requestId: "guidance-resource-set-0001",
    expectedRevision: 19,
    payloadJson: JSON.stringify({
      mode: "auto",
      facets: {
        families: [],
        disciplines: [],
        structures: [],
        taskOperations: [],
        practiceModalities: []
      },
      provenanceRefs: ["test:guidance-resource-set-auto"]
    })
  });
  assert.equal(bootstrap.body.operation, "save_resource_set");
  assert.equal(bootstrap.body.payload.mode, "auto");
  assert.deepEqual(bootstrap.body.payload.facets.families, []);
  assert.deepEqual(bootstrap.body.payload.provenanceRefs, [
    "test:guidance-resource-set-auto"
  ]);
});
