import { courseDesignFixture } from "../helpers/courseDesignFixture.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildCourseAssistanceContext as rawBuildContext,
  COURSE_ASSISTANCE_LIMITS,
  prepareCourseAssistanceProposal as rawPrepare,
  requestCourseAssistanceDiscussion as rawDiscussion
} from "../../src/assist/courseContextualAssistance.js";
import { buildCourseAssistanceCompositionChange } from
  "../../src/domain/courseAssistanceComposition.js";
import { validateProjectDocument } from "../../src/domain/aralearnProject.js";

const fixture = JSON.parse(readFileSync(new URL(
  "../fixtures/package/project-minimal.json",
  import.meta.url
), "utf8"));

const selection = Object.freeze({
  courseId: "10000000-0000-4000-8000-000000000001",
  moduleId: "module-fixture-minimal",
  lessonId: "lesson-fixture-minimal",
  microsequenceId: "micro-fixture-minimal",
  studyUnitId: "card-fixture-minimal-regra"
});

fixture.courses[0].id = selection.courseId;
function withConfiguration(value) {
  return { configuration: courseDesignFixture(value.selection, {
    scope: value.scope || value.confirmedProposal?.scope || "study_unit"
  }), ...value };
}
const buildCourseAssistanceContext = (value) => rawBuildContext(withConfiguration(value));
const prepareCourseAssistanceProposal = async (value) => rawPrepare(value.selection ? withConfiguration(value) : value);
const requestCourseAssistanceDiscussion = (value) => rawDiscussion(withConfiguration(value));

const runtimeConfig = Object.freeze({
  developmentRuntime: true,
  assistAllowedOrigins: Object.freeze(["https://api.openai.com"])
});

const providerConfig = Object.freeze({
  providerId: "openai",
  model: "gpt-5.6-luna",
  endpoint: "https://api.openai.com/v1/responses",
  apiKey: "stub-credential"
});

function response(value) {
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        output: [{ content: [{
          type: "output_text",
          text: typeof value === "string" ? value : JSON.stringify(value)
        }] }]
      };
    }
  };
}

function sequenceFetch(values, requests = []) {
  let index = 0;
  return async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    const value = values[Math.min(index, values.length - 1)];
    index += 1;
    return response(value);
  };
}

function currentStudyUnit() {
  return structuredClone(fixture.courses[0].modules[0].lessons[0]
    .microsequences[0].studyUnits[0]);
}

function validChangedStudyUnit() {
  const unit = currentStudyUnit();
  unit.title = "Regra central revisada";
  unit.content[0].data.text = "Uma regra relaciona condições e consequências observáveis.";
  return unit;
}

test("contexto envia configuração focal resolvida sem substituir automático por defaults", async () => {
  const configuration = courseDesignFixture(selection);
  configuration.parameters[0].effectiveAssignment = {
    mode: "fixed", value: 3, origin: "research_condition", reason: "Condição comparativa fixada.",
    sourceScope: { kind: "course", ref: selection.courseId }, inherited: true
  };
  const requests = [];
  await rawDiscussion({ project: fixture, selection, configuration, message: "Discuta esta condição.",
    providerConfig, runtimeConfig, fetchImpl: sequenceFetch([{ message: "Condição preservada.", proposal: null }], requests) });
  const sent = JSON.parse(requests[0].body.input).readOnlyContext.configuration;
  assert.equal(sent.parameters[0].value, 3);
  assert.equal(sent.parameters[0].origin, "research_condition");
  assert.equal(sent.parameters[1].value, null);
  assert.equal(sent.parameters[1].mode, "automatic");
  assert.equal(sent.courseRevision, 1);
  assert.equal(sent.parameters[0].reason, "Condição comparativa fixada.");
  assert.throws(() => rawBuildContext({ project: fixture, selection }), /leitura|desenho/iu);
  const wrongScope = courseDesignFixture(selection, { scope: "lesson" });
  assert.throws(() => rawBuildContext({ project: fixture, selection, configuration: wrongScope }),
    (error) => error.code === "assistance_configuration_mismatch");
});

test("conflito fixo permite discussão e impede preparar conteúdo antes de qualquer geração", async () => {
  const configuration = courseDesignFixture(selection);
  configuration.parameters[0].conflicts = [{ fixedScope: { kind: "course", ref: selection.courseId },
    fixedValue: 2, exceptionScope: { kind: "study_unit", ref: selection.studyUnitId }, exceptionValue: 3 }];
  const requests = [];
  await assert.rejects(() => rawPrepare({ project: fixture, selection, configuration,
    confirmedProposal: { scope: "study_unit", summary: "Explicar", changes: ["Explicar o conteúdo"], componentNeeds: [] },
    providerConfig, runtimeConfig, fetchImpl: sequenceFetch([], requests) }),
    (error) => error.code === "assistance_configuration_conflict");
  assert.equal(requests.length, 0);
});

test("contexto separa escrita de leitura e inclui Unidade inteira sem Fontes ou PDFs", () => {
  const { context } = buildCourseAssistanceContext({
    project: fixture,
    selection,
    scope: "study_unit",
    writeTargetIds: ["card-fixture-minimal-regra-content"]
  });
  assert.deepEqual(context.writeTarget, {
    kind: "study_unit",
    id: selection.studyUnitId,
    selectedIds: ["card-fixture-minimal-regra-content"]
  });
  assert.deepEqual(context.readOnlyContext.completeStudyUnit, currentStudyUnit());
  assert.equal(context.readOnlyContext.completeStudyUnit.role, "theory");
  assert.equal(context.readOnlyContext.microsequence.id, selection.microsequenceId);
  assert.equal(Object.hasOwn(context.readOnlyContext.microsequence, "role"), false);
  assert.equal(context.readOnlyContext.courseOutline.every((moduleValue) =>
    moduleValue.lessons.every((lesson) => lesson.microsequences.every((microsequence) =>
      !Object.hasOwn(microsequence, "role")))), true);
  assert.equal(context.readOnlyContext.curriculumPath.lesson.id, selection.lessonId);
  assert.ok(context.readOnlyContext.courseOutline.length > 0);
  assert.ok(new TextEncoder().encode(JSON.stringify(context)).byteLength <=
    COURSE_ASSISTANCE_LIMITS.maximumContextBytes);
  assert.doesNotMatch(JSON.stringify(context), /pdf|sourceLinks|Fontes/iu);
});

test("contexto de assistência não apresenta o papel macro interno como decisão pedagógica", () => {
  const microsequenceContext = buildCourseAssistanceContext({
    project: fixture,
    selection,
    scope: "didactic_microsequence"
  }).context;
  assert.equal(Object.hasOwn(microsequenceContext.readOnlyContext.target, "role"), false);

  const lessonContext = buildCourseAssistanceContext({
    project: fixture,
    selection,
    scope: "lesson"
  }).context;
  assert.equal(lessonContext.readOnlyContext.target.microsequences.every((microsequence) =>
    !Object.hasOwn(microsequence, "role")), true);
  assert.equal(lessonContext.readOnlyContext.target.microsequences.every((microsequence) =>
    microsequence.studyUnits.every((studyUnit) => ["theory", "practice"].includes(studyUnit.role))),
  true);
});

test("#335 assistência de microssequência preserva cobertura interna sem reparo ou escrita curricular", async () => {
  const project = validateProjectDocument(structuredClone(fixture)).value;
  const microsequence = project.courses[0].modules[0].lessons[0].microsequences[0];
  microsequence.scopeItemIds = ["33500000-0000-4000-8000-000000000001"];
  const before = structuredClone(project);
  const candidate = structuredClone(microsequence);
  candidate.branchOf = null;
  delete candidate.role;
  delete candidate.scopeItemIds;
  candidate.studyUnits[0].content[0].data.text = "Explicação focal revista com a cobertura original.";
  const requests = [];
  const result = await prepareCourseAssistanceProposal({
    project, selection,
    confirmedProposal: {
      summary: "Revisar a explicação das unidades escolhidas.",
      changes: ["Revisar a explicação sem alterar o planejamento."],
      scope: "didactic_microsequence",
      componentNeeds: [{ query: "explicação em prosa", slot: "content" }]
    },
    providerConfig, runtimeConfig,
    fetchImpl: sequenceFetch([{ message: "Explicação revisada.", candidate }], requests)
  });
  assert.equal(requests.length, 1);
  assert.deepEqual(result.candidate.scopeItemIds, microsequence.scopeItemIds);
  const updated = result.proposedProject.courses[0].modules[0].lessons[0].microsequences[0];
  assert.deepEqual(updated.scopeItemIds, microsequence.scopeItemIds);
  assert.equal(updated.studyUnits[0].content[0].data.text, candidate.studyUnits[0].content[0].data.text);
  const change = buildCourseAssistanceCompositionChange({
    originalProject: project, proposedProject: result.proposedProject,
    selection, scope: "didactic_microsequence"
  });
  assert.deepEqual(change.upserts.map(({ entityType, entityId }) => [entityType, entityId]),
    [["study_unit", selection.studyUnitId]]);
  assert.deepEqual(change.deletes, []);
  assert.equal(Object.hasOwn(JSON.parse(requests[0].body.input).readOnlyContext.target, "scopeItemIds"), false);
  assert.equal(Object.hasOwn(requests[0].body.text.format.schema.properties.candidate.properties, "scopeItemIds"), false);
  assert.deepEqual(project, before);
});

test("#335 assistência de lição conserva cobertura por identidade ao reordenar e não inventa vínculos", async () => {
  const project = validateProjectDocument(structuredClone(fixture)).value;
  const lesson = project.courses[0].modules[0].lessons[0];
  const first = lesson.microsequences[0];
  first.scopeItemIds = ["33500000-0000-4000-8000-000000000001"];
  const copyMicrosequence = (source, suffix) => {
    const copy = structuredClone(source);
    copy.id += suffix;
    copy.title += suffix;
    copy.dependsOn = [];
    copy.studyUnits.forEach((unit) => {
      unit.id += suffix;
    });
    return copy;
  };
  const second = copyMicrosequence(first, "-segunda");
  second.scopeItemIds = ["33500000-0000-4000-8000-000000000002"];
  lesson.microsequences.push(second);
  const before = structuredClone(project);
  const added = copyMicrosequence(first, "-nova");
  const candidate = { microsequences: [second, added, first].map((microsequence) => {
    const copy = structuredClone(microsequence);
    copy.branchOf = null;
    delete copy.role;
    delete copy.scopeItemIds;
    return copy;
  }) };
  const requests = [];
  const result = await prepareCourseAssistanceProposal({
    project, selection,
    confirmedProposal: {
      summary: "Reorganizar as microssequências escolhidas.",
      changes: ["Reorganizar a composição e acrescentar uma explicação."],
      scope: "lesson",
      componentNeeds: [{ query: "explicação em prosa", slot: "content" }]
    },
    providerConfig, runtimeConfig,
    fetchImpl: sequenceFetch([{ message: "Composição revisada.", candidate }], requests)
  });
  assert.equal(requests.length, 1);
  const updated = result.proposedProject.courses[0].modules[0].lessons[0].microsequences;
  assert.deepEqual(updated.map(({ id }) => id), [second.id, added.id, first.id]);
  assert.deepEqual(updated[0].scopeItemIds, second.scopeItemIds);
  assert.deepEqual(updated[2].scopeItemIds, first.scopeItemIds);
  assert.equal(Object.hasOwn(updated[1], "scopeItemIds"), false);
  const change = buildCourseAssistanceCompositionChange({
    originalProject: project, proposedProject: result.proposedProject, selection, scope: "lesson"
  });
  const rows = new Map(change.upserts.filter(({ entityType }) => entityType === "microsequence")
    .map((row) => [row.entityId, row.content]));
  assert.deepEqual(rows.get(first.id).scopeItemIds, first.scopeItemIds);
  assert.deepEqual(rows.get(second.id).scopeItemIds, second.scopeItemIds);
  assert.equal(Object.hasOwn(rows.get(added.id), "scopeItemIds"), false);
  assert.equal(JSON.parse(requests[0].body.input).readOnlyContext.target.microsequences
    .some((microsequence) => Object.hasOwn(microsequence, "scopeItemIds")), false);
  assert.equal(Object.hasOwn(requests[0].body.text.format.schema.properties.candidate
    .properties.microsequences.items.properties, "scopeItemIds"), false);
  assert.deepEqual(project, before);
});

test("#335 assistência não aceita cobertura fornecida pelo modelo como vínculo curricular", async () => {
  for (const scope of ["didactic_microsequence", "lesson"]) {
    const project = validateProjectDocument(structuredClone(fixture)).value;
    const microsequence = project.courses[0].modules[0].lessons[0].microsequences[0];
    microsequence.scopeItemIds = ["33500000-0000-4000-8000-000000000001"];
    const before = structuredClone(project);
    const generated = structuredClone(microsequence);
    generated.branchOf = null;
    delete generated.role;
    generated.scopeItemIds = ["33500000-0000-4000-8000-000000000099"];
    generated.studyUnits[0].content[0].data.text = "Explicação revista sem reatribuir a cobertura.";
    const requests = [];
    const result = await prepareCourseAssistanceProposal({
      project, selection,
      confirmedProposal: {
        summary: "Revisar a explicação escolhida.", changes: ["Revisar a explicação."], scope,
        componentNeeds: [{ query: "explicação em prosa", slot: "content" }]
      },
      providerConfig, runtimeConfig,
      fetchImpl: sequenceFetch([{ message: "Explicação revista.", candidate: scope === "lesson"
        ? { microsequences: [generated] } : generated }], requests)
    });
    assert.equal(requests.length, 1);
    assert.deepEqual(result.proposedProject.courses[0].modules[0].lessons[0].microsequences[0]
      .scopeItemIds, microsequence.scopeItemIds);
    assert.doesNotMatch(requests[0].body.input, /scopeItemIds|33500000-0000-4000-8000-000000000001/u);
    assert.deepEqual(project, before);
  }
});

test("seleção inválida ou obsoleta nunca amplia autoridade de escrita", () => {
  for (const scope of ["study_unit", "didactic_microsequence", "lesson"]) {
    assert.throws(() => buildCourseAssistanceContext({
      project: fixture,
      selection,
      scope,
      writeTargetIds: ["alvo-inexistente"]
    }), (error) => error.code === "assistance_write_target_invalid");
  }
});

test("pedido de mudança devolve e refina uma proposta concreta no escopo recebido", async () => {
  const requests = [];
  const fetchImpl = sequenceFetch([{
    message: "A Unidade apresenta a regra; proponho tornar essa função mais explícita.",
    proposal: {
      summary: "Explicitar a função da Unidade sem mudar sua representação.",
      changes: ["Reescrever a abertura com uma explicação direta."],
      scope: "study_unit",
      componentNeeds: [{ query: "explicação em prosa", slot: "content" }]
    }
  }, {
    message: "Refinei a proposta para preservar o exemplo atual.",
    proposal: {
      summary: "Reescrever a explicação mantendo a representação textual.",
      changes: ["Simplificar a explicação.", "Preservar o exemplo atual."],
      scope: "study_unit",
      componentNeeds: [{ query: "explicação em prosa", slot: "content" }]
    }
  }], requests);
  const discussed = await requestCourseAssistanceDiscussion({
    project: fixture,
    selection,
    message: "Explique primeiro o papel desta Unidade.",
    providerConfig,
    runtimeConfig,
    fetchImpl
  });
  assert.equal(discussed.proposal.changes.length, 1);
  const planned = await requestCourseAssistanceDiscussion({
    project: fixture,
    selection,
    message: "Agora proponha uma explicação mais direta.",
    conversation: [
      { role: "user", message: "Explique primeiro o papel desta Unidade." },
      { role: "assistant", message: discussed.message }
    ],
    currentProposal: discussed.proposal,
    providerConfig,
    runtimeConfig,
    fetchImpl
  });
  assert.equal(planned.proposal.scope, "study_unit");
  assert.equal(planned.proposal.changes.length, 2);
  assert.equal(planned.proposal.componentNeeds.length, 1);
  assert.deepEqual(
    JSON.parse(requests[1].body.input).currentProposal,
    discussed.proposal
  );
  assert.match(requests[0].body.instructions, /abertura ao debate/iu);
});

test("discussão sem mudança aceita resposta sem proposta e não gera conteúdo", async () => {
  const requests = [];
  const discussed = await requestCourseAssistanceDiscussion({
    project: fixture,
    selection,
    message: "Explique a Unidade.",
    providerConfig,
    runtimeConfig,
    fetchImpl: sequenceFetch([{
      message: "Apenas uma explicação.",
      proposal: null
    }], requests)
  });
  assert.equal(discussed.message, "Apenas uma explicação.");
  assert.equal(discussed.proposal, null);
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].body.text.format.schema.properties.proposal.type, ["object", "null"]);
  await assert.rejects(prepareCourseAssistanceProposal({ confirmedProposal: discussed.proposal }), TypeError);
});

test("pipeline descobre contratos, repara saída semanticamente inválida e só aceita renderer real", async () => {
  const invalid = validChangedStudyUnit();
  invalid.content[0].data.text = "";
  const valid = validChangedStudyUnit();
  valid.content[0].data.languageTag = null;
  valid.content[0].data.textDirection = null;
  const requests = [];
  const result = await prepareCourseAssistanceProposal({
    project: fixture,
    selection,
    confirmedProposal: {
      summary: "Tornar a regra mais direta em texto explicado.",
      changes: ["Reescrever a explicação em linguagem direta."],
      scope: "study_unit",
      componentNeeds: [{ query: "explicação em prosa", slot: "content" }]
    },
    providerConfig,
    runtimeConfig,
    fetchImpl: sequenceFetch([
      { message: "Primeira composição.", candidate: invalid },
      { message: "Composição reparada.", candidate: valid }
    ], requests)
  });
  assert.deepEqual(Object.keys(result), [
    "contract", "scope", "message", "candidate", "proposedProject"
  ]);
  assert.equal(result.candidate.content[0].data.text, valid.content[0].data.text);
  assert.equal(Object.hasOwn(result.candidate.content[0].data, "languageTag"), false);
  assert.equal(Object.hasOwn(result.candidate.content[0].data, "textDirection"), false);
  assert.equal(result.proposedProject.courses[0].modules[0].lessons[0]
    .microsequences[0].studyUnits[0].content[0].data.text, valid.content[0].data.text);
  assert.equal(requests.length, 2);
  assert.match(requests[1].body.input, /repair/u);
  assert.match(requests[1].body.input, /exatamente uma forma/iu);
  assert.equal(JSON.parse(requests[1].body.input).repair.rejectedCandidate.content[0].data.text, "");
  const generationPrompt = JSON.parse(requests[0].body.input);
  assert.ok(generationPrompt.exactComponentContracts.every((item) =>
    !Object.hasOwn(item, "schema")
  ));
  assert.deepEqual(generationPrompt.confirmedProposal.changes,
    ["Reescrever a explicação em linguagem direta."]);
  assert.deepEqual(currentStudyUnit(), fixture.courses[0].modules[0]
    .lessons[0].microsequences[0].studyUnits[0]);
});

test("normalização de opcionais não aceita prosa nula, ramo rich incompleto nem campo desconhecido", async () => {
  for (const data of [{ text: null }, { text: "Texto.", format: "rich", blocks: [] }, { text: "Texto.", unknown: null }]) {
    const candidate = validChangedStudyUnit();
    candidate.content[0].data = data;
    const before = structuredClone(fixture);
    await assert.rejects(prepareCourseAssistanceProposal({ project: fixture, selection,
      confirmedProposal: { summary: "Revisar explicação.", changes: ["Reescrever somente a explicação."],
        scope: "study_unit", componentNeeds: [{ query: "explicação em prosa", slot: "content" }] },
      providerConfig, runtimeConfig, fetchImpl: sequenceFetch([{ message: "Composição inválida.", candidate }])
    }), error => error.code === "assistance_candidate_invalid" && error.validationErrors.length > 0);
    assert.deepEqual(fixture, before);
  }
});

test("três composições inválidas preservam o projeto e nunca produzem prévia quebrada", async () => {
  const invalid = validChangedStudyUnit();
  invalid.content[0].package = "aralearn.resource.inexistente";
  const before = structuredClone(fixture);
  await assert.rejects(() => prepareCourseAssistanceProposal({
    project: fixture,
    selection,
    confirmedProposal: {
      summary: "Trocar a explicação.",
      changes: ["Trocar a explicação atual."],
      scope: "study_unit",
      componentNeeds: [{ query: "explicação em prosa", slot: "content" }]
    },
    providerConfig,
    runtimeConfig,
    fetchImpl: sequenceFetch([
      { message: "Tentativa 1", candidate: invalid },
      { message: "Tentativa 2", candidate: invalid },
      { message: "Tentativa 3", candidate: invalid }
    ])
  }), (error) => {
    assert.equal(error.code, "assistance_candidate_invalid");
    assert.match(error.message, /conteúdo original foi preservado/iu);
    return true;
  });
  assert.deepEqual(fixture, before);
});

test("Unidade e Microssequência preservam a identidade do alvo durante reparos", async () => {
  const changedUnit = validChangedStudyUnit();
  changedUnit.id = "unidade-fora-do-alvo";
  await assert.rejects(() => prepareCourseAssistanceProposal({
    project: fixture,
    selection,
    confirmedProposal: {
      summary: "Revisar a Unidade escolhida.",
      changes: ["Revisar somente a Unidade escolhida."],
      scope: "study_unit",
      componentNeeds: [{ query: "explicação em prosa", slot: "content" }]
    },
    providerConfig,
    runtimeConfig,
    fetchImpl: sequenceFetch(Array(3).fill({
      message: "Troquei também a identidade.",
      candidate: changedUnit
    }))
  }), (error) => {
    assert.equal(error.code, "assistance_candidate_invalid");
    assert.ok(error.validationErrors.some((message) =>
      /preservar a unidade de estudo escolhida/u.test(message)
    ));
    return true;
  });

  const changedMicrosequence = structuredClone(
    fixture.courses[0].modules[0].lessons[0].microsequences[0]
  );
  changedMicrosequence.id = "microssequencia-fora-do-alvo";
  await assert.rejects(() => prepareCourseAssistanceProposal({
    project: fixture,
    selection,
    confirmedProposal: {
      summary: "Reordenar a Microssequência escolhida.",
      changes: ["Reordenar as Unidades da Microssequência."],
      scope: "didactic_microsequence",
      componentNeeds: [{ query: "explicação em prosa", slot: "content" }]
    },
    providerConfig,
    runtimeConfig,
    fetchImpl: sequenceFetch(Array(3).fill({
      message: "Troquei também a identidade.",
      candidate: changedMicrosequence
    }))
  }), (error) => {
    assert.equal(error.code, "assistance_candidate_invalid");
    assert.ok(error.validationErrors.some((message) =>
      /preservar a microssequência escolhida/u.test(message)
    ));
    return true;
  });
});

test("seleção focal impede escrita em componentes e Unidades usados só como contexto", async () => {
  const changedTitle = validChangedStudyUnit();
  await assert.rejects(() => prepareCourseAssistanceProposal({
    project: fixture,
    selection,
    writeTargetIds: [changedTitle.content[0].id],
    confirmedProposal: {
      summary: "Revisar somente o componente textual.",
      changes: ["Revisar o componente textual selecionado."],
      scope: "study_unit",
      componentNeeds: [{ query: "explicação em prosa", slot: "content" }]
    },
    providerConfig,
    runtimeConfig,
    fetchImpl: sequenceFetch(Array(3).fill({
      message: "Também alterei o título.",
      candidate: changedTitle
    }))
  }), (error) => {
    assert.equal(error.code, "assistance_candidate_invalid");
    assert.ok(error.validationErrors.some((message) => /título|title/iu.test(message)));
    return true;
  });

  const microsequence = structuredClone(
    fixture.courses[0].modules[0].lessons[0].microsequences[0]
  );
  const [selectedUnit, readOnlyUnit] = microsequence.studyUnits;
  readOnlyUnit.title = "Alteração fora da seleção";
  await assert.rejects(() => prepareCourseAssistanceProposal({
    project: fixture,
    selection,
    writeTargetIds: [selectedUnit.id],
    confirmedProposal: {
      summary: "Revisar somente a primeira Unidade.",
      changes: ["Revisar a primeira Unidade selecionada."],
      scope: "didactic_microsequence",
      componentNeeds: [{ query: "explicação em prosa", slot: "content" }]
    },
    providerConfig,
    runtimeConfig,
    fetchImpl: sequenceFetch(Array(3).fill({
      message: "Também alterei a Unidade de contexto.",
      candidate: microsequence
    }))
  }), (error) => {
    assert.equal(error.code, "assistance_candidate_invalid");
    assert.ok(error.validationErrors.some((message) => /não foi escolhida/u.test(message)));
    return true;
  });
});

test("Lição aceita criação de Microssequência somente como proposta da própria Lição", async () => {
  const lesson = structuredClone(fixture.courses[0].modules[0].lessons[0]);
  const newMicrosequence = structuredClone(lesson.microsequences[0]);
  newMicrosequence.id = "micro-fixture-nova";
  newMicrosequence.title = "Aplicação da regra";
  newMicrosequence.studyUnits = newMicrosequence.studyUnits.slice(0, 1).map((unit, index) => ({
    ...unit,
    id: `${unit.id}-nova`,
    position: index + 1,
    content: unit.content.map((instance) => ({ ...instance, id: `${instance.id}-nova` })),
    response: unit.response ? { ...unit.response, id: `${unit.response.id}-nova` } : null,
    feedback: unit.feedback.map((instance) => ({ ...instance, id: `${instance.id}-nova` }))
  }));
  lesson.microsequences.forEach((microsequence) => { delete microsequence.role; });
  delete newMicrosequence.role;
  const requests = [];
  const result = await prepareCourseAssistanceProposal({
    project: fixture,
    selection,
    confirmedProposal: {
      summary: "Adicionar uma Microssequência depois da atual.",
      changes: ["Adicionar uma Microssequência após a atual."],
      scope: "lesson",
      componentNeeds: [{ query: "explicação em prosa", slot: "content" }]
    },
    providerConfig,
    runtimeConfig,
    fetchImpl: sequenceFetch([{
      message: "A Lição passa a ter duas Microssequências.",
      candidate: { microsequences: [lesson.microsequences[0], newMicrosequence] }
    }], requests)
  });
  assert.equal(result.scope, "lesson");
  assert.equal(result.candidate.microsequences.length, 2);
  assert.deepEqual(result.candidate.microsequences.map(({ role }) => role), [
    "explain", "explain"
  ]);
  assert.equal(result.proposedProject.courses[0].modules[0].lessons[0]
    .microsequences.length, 2);
  assert.deepEqual(result.proposedProject.courses[0].modules[0].lessons[0]
    .microsequences.map(({ role }) => role), ["explain", "explain"]);
  const prompt = JSON.parse(requests[0].body.input);
  assert.equal(prompt.readOnlyContext.target.microsequences.every((microsequence) =>
    !Object.hasOwn(microsequence, "role")), true);
  const microsequenceSchema = requests[0].body.text.format.schema.properties.candidate
    .properties.microsequences.items;
  assert.equal(microsequenceSchema.required.includes("role"), false);
  assert.equal(Object.hasOwn(microsequenceSchema.properties, "role"), false);
  assert.equal(fixture.courses[0].modules[0].lessons[0].microsequences.length, 1);
});

test("diff estrutural tipado limita upserts e exclusões ao escopo confirmado", () => {
  const proposed = structuredClone(fixture);
  const units = proposed.courses[0].modules[0].lessons[0]
    .microsequences[0].studyUnits;
  units.reverse();
  units.forEach((unit, index) => { unit.position = index + 1; });
  units.pop();
  units[0].title = "Prática primeiro";
  const change = buildCourseAssistanceCompositionChange({
    originalProject: fixture,
    proposedProject: proposed,
    selection,
    scope: "didactic_microsequence"
  });
  assert.equal(change.changed, true);
  assert.deepEqual(change.deletes, [{
    entityType: "study_unit",
    entityId: "card-fixture-minimal-regra"
  }]);
  assert.equal(change.upserts.length, 1);
  assert.equal(change.upserts[0].entityId, "card-fixture-minimal-complete");
  assert.equal(change.upserts[0].position, 1);
  assert.deepEqual(change.changedStudyUnitIds, ["card-fixture-minimal-complete"]);
  assert.equal(change.upserts.some(({ entityType }) => entityType === "lesson"), false);
});

test("diff manual inclui o alvo estrutural e somente seus descendentes", () => {
  const proposed = structuredClone(fixture);
  const moduleValue = proposed.courses[0].modules[0];
  moduleValue.title = "Módulo revisto";
  moduleValue.lessons[0].title = "Lição revista";
  const moduleChange = buildCourseAssistanceCompositionChange({
    originalProject: fixture,
    proposedProject: proposed,
    selection,
    scope: "module"
  });
  assert.deepEqual(
    moduleChange.upserts.map(({ entityType }) => entityType),
    ["module", "lesson"]
  );

  const lessonProposed = structuredClone(fixture);
  lessonProposed.courses[0].modules[0].lessons[0].title = "Lição contextual";
  const lessonChange = buildCourseAssistanceCompositionChange({
    originalProject: fixture,
    proposedProject: lessonProposed,
    selection,
    scope: "lesson"
  });
  assert.deepEqual(lessonChange.upserts.map(({ entityType }) => entityType), ["lesson"]);
});
