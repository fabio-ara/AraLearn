import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildCourseAssistanceContext,
  COURSE_ASSISTANCE_LIMITS,
  prepareCourseAssistanceProposal,
  requestCourseAssistanceDiscussion
} from "../../src/assist/courseContextualAssistance.js";
import { buildCourseAssistanceCompositionChange } from
  "../../src/domain/courseAssistanceComposition.js";

const fixture = JSON.parse(readFileSync(new URL(
  "../fixtures/package/project-minimal.json",
  import.meta.url
), "utf8"));

const selection = Object.freeze({
  courseId: "course-fixture-minimal",
  moduleId: "module-fixture-minimal",
  lessonId: "lesson-fixture-minimal",
  microsequenceId: "micro-fixture-minimal",
  studyUnitId: "card-fixture-minimal-regra"
});

const runtimeConfig = Object.freeze({
  developmentRuntime: true,
  assistAllowedOrigins: Object.freeze(["http://127.0.0.1:4183"])
});

const providerConfig = Object.freeze({
  providerId: "local",
  model: "gpt-5.6-luna",
  endpoint: "http://127.0.0.1:4183/v1/chat/completions",
  apiKey: ""
});

function response(value) {
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        choices: [{
          finish_reason: "stop",
          message: { content: typeof value === "string" ? value : JSON.stringify(value) }
        }]
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

test("contexto separa escrita de leitura e inclui Unidade inteira sem Fontes ou PDFs", () => {
  const { context } = buildCourseAssistanceContext({
    project: fixture,
    selection,
    scope: "study_unit",
    writeTargetId: "content:card-fixture-minimal-regra-content"
  });
  assert.deepEqual(context.writeTarget, {
    kind: "study_unit",
    id: selection.studyUnitId,
    selectedComponentId: "content:card-fixture-minimal-regra-content"
  });
  assert.deepEqual(context.readOnlyContext.completeStudyUnit, currentStudyUnit());
  assert.equal(context.readOnlyContext.microsequence.id, selection.microsequenceId);
  assert.equal(context.readOnlyContext.curriculumPath.lesson.id, selection.lessonId);
  assert.ok(context.readOnlyContext.courseOutline.length > 0);
  assert.ok(new TextEncoder().encode(JSON.stringify(context)).byteLength <=
    COURSE_ASSISTANCE_LIMITS.maximumContextBytes);
  assert.doesNotMatch(JSON.stringify(context), /pdf|sourceLinks|Fontes/iu);
});

test("um turno pode apenas discutir e outro forma plano no escopo recebido", async () => {
  const fetchImpl = sequenceFetch([{
    message: "Posso primeiro explicar a função da Unidade e depois preparar uma mudança.",
    proposal: null
  }, {
    message: "O plano está pronto para sua confirmação.",
    proposal: {
      summary: "Reescrever a explicação mantendo a representação textual.",
      scope: "study_unit",
      componentNeeds: [{ query: "explicação em prosa", slot: "content" }]
    }
  }]);
  const discussed = await requestCourseAssistanceDiscussion({
    project: fixture,
    selection,
    message: "Explique primeiro o papel desta Unidade.",
    providerConfig,
    runtimeConfig,
    fetchImpl
  });
  assert.equal(discussed.proposal, null);
  const planned = await requestCourseAssistanceDiscussion({
    project: fixture,
    selection,
    message: "Agora proponha uma explicação mais direta.",
    conversation: [
      { role: "user", message: "Explique primeiro o papel desta Unidade." },
      { role: "assistant", message: discussed.message }
    ],
    providerConfig,
    runtimeConfig,
    fetchImpl
  });
  assert.equal(planned.proposal.scope, "study_unit");
  assert.equal(planned.proposal.componentNeeds.length, 1);
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
  assert.equal(result.repairCount, 1);
  assert.equal(result.renderable, true);
  assert.equal(result.candidate.content[0].data.text, valid.content[0].data.text);
  assert.equal(Object.hasOwn(result.candidate.content[0].data, "languageTag"), false);
  assert.equal(Object.hasOwn(result.candidate.content[0].data, "textDirection"), false);
  assert.ok(result.previews[0].rendered.contentHtml.includes("package-instance"));
  assert.deepEqual(
    result.catalogTrace.map(({ operation }) => operation),
    [
      "explore", "search", "inspect", "contracts", "validate_study_unit",
      "validate_study_unit", "audit_representation", "preview_study_unit"
    ]
  );
  assert.equal(requests.length, 2);
  assert.match(requests[1].body.messages[1].content, /repair/u);
  assert.match(requests[1].body.messages[1].content, /curto demais/iu);
  assert.match(requests[0].body.messages[1].content,
    /"required":\["text","languageTag","textDirection"\]/u);
  assert.deepEqual(currentStudyUnit(), fixture.courses[0].modules[0]
    .lessons[0].microsequences[0].studyUnits[0]);
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
      /preservar a identidade da Unidade/u.test(message)
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
      /preservar a identidade da Microssequência/u.test(message)
    ));
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
  const result = await prepareCourseAssistanceProposal({
    project: fixture,
    selection,
    confirmedProposal: {
      summary: "Adicionar uma Microssequência depois da atual.",
      scope: "lesson",
      componentNeeds: [{ query: "explicação em prosa", slot: "content" }]
    },
    providerConfig,
    runtimeConfig,
    fetchImpl: sequenceFetch([{
      message: "A Lição passa a ter duas Microssequências.",
      candidate: { microsequences: [lesson.microsequences[0], newMicrosequence] }
    }])
  });
  assert.equal(result.scope, "lesson");
  assert.equal(result.candidate.microsequences.length, 2);
  assert.equal(result.previews.length, 3);
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
