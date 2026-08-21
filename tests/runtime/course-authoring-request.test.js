import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  COURSE_AUTHORING_REQUEST_ACTIONS,
  COURSE_AUTHORING_REQUEST_TARGET_TYPES,
  buildCourseAuthoringRequestText,
  normalizeCourseAuthoringRequest
} from "../../src/ui/courseAuthoringRequest.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_COURSE_ID = "20000000-0000-4000-8000-000000000002";
const TARGET_ID = "module-introducao";
const MATERIALIZATION_ID = "30000000-0000-4000-8000-000000000003";
const AUDIT_RUN_ID = "40000000-0000-4000-8000-000000000004";
const ANNOTATION_ID = "50000000-0000-4000-8000-000000000005";

function requestFixture(overrides = {}) {
  return {
    course: {
      id: COURSE_ID,
      title: "Fundamentos da alfabetização científica",
      revision: 7
    },
    target: {
      type: "module",
      id: TARGET_ID,
      title: "Investigar evidências",
      path: ["Curso", "Módulo 1"]
    },
    action: "review",
    instruction: "Confira a progressão e explique qualquer lacuna antes de propor mudanças.",
    deepLink: `https://example.test/app#/authoring/courses/${COURSE_ID}?section=research`,
    limits: ["Preserve os exemplos já aprovados pela pessoa autora."],
    ...overrides
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

test("normaliza uma cópia independente sem tocar no pedido recebido", () => {
  const input = requestFixture({
    references: {
      materializationId: MATERIALIZATION_ID,
      auditRunId: AUDIT_RUN_ID,
      annotationId: ANNOTATION_ID
    }
  });
  const snapshot = structuredClone(input);
  deepFreeze(input);

  const normalized = normalizeCourseAuthoringRequest(input);

  assert.deepEqual(input, snapshot);
  assert.notStrictEqual(normalized.course, input.course);
  assert.notStrictEqual(normalized.target, input.target);
  assert.notStrictEqual(normalized.limits, input.limits);
  assert.notStrictEqual(normalized.references, input.references);
  assert.equal(normalized.target.path, "Curso › Módulo 1");
  assert.ok(normalized.limits.length > input.limits.length);
  assert.equal(normalized.limits.at(-1), input.limits[0]);
});

test("nomeia todos os tipos de alvo em português sem expor JSON bruto", () => {
  const labels = new Map([
    ["course", "Curso"],
    ["module", "Módulo"],
    ["lesson", "Lição"],
    ["topic", "Tópico"],
    ["didactic_microsequence", "Microssequência didática"],
    ["study_unit", "Unidade de estudo"],
    ["source", "Fonte"],
    ["source_anchor", "Âncora"],
    ["authoring_part", "Parte de autoria"],
    ["audit_finding", "Achado de auditoria"],
    ["audit_run", "Rodada de auditoria"],
    ["authoring_correction", "Correção autoral"]
  ]);
  assert.deepEqual(COURSE_AUTHORING_REQUEST_TARGET_TYPES, [...labels.keys()]);

  for (const [type, label] of labels) {
    const target = type === "course"
      ? { type }
      : { type, id: `${type}-1`, title: `Título de ${label}`, path: `Curso › ${label}` };
    const prompt = buildCourseAuthoringRequestText(requestFixture({ target, action: "discuss" }));
    assert.match(prompt, new RegExp(`Alvo: ${label}`, "u"));
    assert.doesNotMatch(prompt, /[{}]|"(?:course|target|action|instruction|deepLink|limits)"\s*:/u);
  }
});

test("achado, rodada e correção preservam alvo, link e referência de auditoria", () => {
  const cases = [
    ["audit_finding", ANNOTATION_ID, "Achado factual", `findingId=${ANNOTATION_ID}`],
    ["audit_run", AUDIT_RUN_ID, "Auditoria automática", `auditRunId=${AUDIT_RUN_ID}`],
    ["authoring_correction", MATERIALIZATION_ID, "Correção v2",
      `findingId=${ANNOTATION_ID}&correctionId=${MATERIALIZATION_ID}`]
  ];
  for (const [type, id, title, query] of cases) {
    const prompt = buildCourseAuthoringRequestText(requestFixture({
      action: "review",
      target: { type, id, title, path: `Curso › ${title}` },
      deepLink: `https://example.test/app#/authoring/courses/${COURSE_ID}` +
        `?section=observations&${query}`,
      references: { auditRunId: AUDIT_RUN_ID }
    }));
    assert.match(prompt, new RegExp(id, "u"));
    assert.ok(prompt.includes(query));
    assert.match(prompt, new RegExp(`Rodada de auditoria: ${AUDIT_RUN_ID}`, "u"));
  }
});

test("traduz cada ação permitida e inclui contexto, referências e limites reais", () => {
  const actionLabels = new Map([
    ["plan", "planejar"],
    ["prepare_structure", "preparar a estrutura"],
    ["review", "revisar"],
    ["discuss", "discutir"],
    ["verify_source", "verificar a Fonte"],
    ["correct_study_unit", "corrigir a Unidade de estudo"],
    ["materialize_authoring_part", "materializar a Parte de autoria"]
  ]);
  assert.deepEqual(COURSE_AUTHORING_REQUEST_ACTIONS, [...actionLabels.keys()]);

  for (const [action, label] of actionLabels) {
    const target = action === "verify_source"
      ? { type: "source", id: "source-1", title: "Fonte 1" }
      : action === "correct_study_unit"
        ? { type: "study_unit", id: "unit-1", title: "Unidade 1" }
        : action === "materialize_authoring_part"
          ? { type: "authoring_part", id: MATERIALIZATION_ID, title: "Parte 1" }
          : requestFixture().target;
    const prompt = buildCourseAuthoringRequestText(requestFixture({ action, target }));
    assert.match(prompt, new RegExp(`Ação: ${label}\\.`, "u"));
  }

  const prompt = buildCourseAuthoringRequestText(requestFixture({
    action: "prepare_structure",
    references: {
      materializationId: MATERIALIZATION_ID,
      auditRunId: AUDIT_RUN_ID,
      annotationId: ANNOTATION_ID
    }
  }));
  assert.match(prompt, /Fundamentos da alfabetização científica/u);
  assert.match(prompt, new RegExp(COURSE_ID, "u"));
  assert.match(prompt, /Revisão observada ao copiar: 7/u);
  assert.match(prompt, new RegExp(TARGET_ID, "u"));
  assert.match(prompt, /Caminho: Curso › Módulo 1/u);
  assert.match(prompt, /Confira a progressão/u);
  assert.match(prompt, /https:\/\/example\.test\/app#\/authoring/u);
  assert.match(prompt, new RegExp(MATERIALIZATION_ID, "u"));
  assert.match(prompt, new RegExp(AUDIT_RUN_ID, "u"));
  assert.match(prompt, new RegExp(ANNOTATION_ID, "u"));
  assert.match(prompt, /estado persistido/u);
  assert.match(prompt, /contratos estruturais atuais/u);
  assert.match(prompt, /Vincule as Microssequências às Partes/u);
  assert.match(prompt, /não alterou o Curso/u);
});

test("materialização fica limitada à Parte e ao planejamento persistido", () => {
  const prompt = buildCourseAuthoringRequestText(requestFixture({
    action: "materialize_authoring_part",
    target: {
      type: "authoring_part",
      id: MATERIALIZATION_ID,
      title: "Parte 1"
    }
  }));
  assert.match(prompt, /Limite a produção à Parte identificada e ao planejamento persistido/u);
  assert.match(prompt, /não avance outra Parte/u);
});

test("rejeita contratos incompletos, tipos desconhecidos e links fora do Curso", () => {
  const invalid = [
    null,
    requestFixture({ extra: true }),
    requestFixture({ course: { id: "curso", title: "Curso", revision: 1 } }),
    requestFixture({ course: { id: COURSE_ID, title: "Curso", revision: 0 } }),
    requestFixture({ target: { type: "unknown", id: "alvo" } }),
    requestFixture({ action: "execute_anything" }),
    requestFixture({ action: "verify_source" }),
    requestFixture({ action: "correct_study_unit" }),
    requestFixture({ action: "materialize_authoring_part" }),
    requestFixture({ instruction: " \n " }),
    requestFixture({ limits: "sem limite" }),
    requestFixture({ limits: [""] }),
    requestFixture({ deepLink: "javascript:alert(1)" }),
    requestFixture({
      deepLink: `#/authoring/courses/${OTHER_COURSE_ID}?section=structure`
    }),
    requestFixture({ references: { auditRunId: "rodada" } })
  ];
  for (const candidate of invalid) {
    assert.throws(() => normalizeCourseAuthoringRequest(candidate), TypeError);
  }
});

test("gerar o texto não consulta IndexedDB nem outra persistência local", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    get() {
      throw new Error("IndexedDB não deveria ser consultado");
    }
  });
  try {
    assert.match(buildCourseAuthoringRequestText(requestFixture()), /Pedido de Autoria/u);
  } finally {
    if (original) Object.defineProperty(globalThis, "indexedDB", original);
    else delete globalThis.indexedDB;
  }
});

test("o runtime principal copia o pedido genérico e não o apresenta como materialização", async () => {
  const source = await readFile(new URL("../../public/main.js", import.meta.url), "utf8");
  const start = source.indexOf("async function deliverAuthoringRequest");
  const end = source.indexOf("async function renderAuthenticatedApplication", start);
  assert.ok(start >= 0 && end > start);
  const delivery = source.slice(start, end);
  assert.match(delivery, /navigator\?\.clipboard\?\.writeText/u);
  assert.match(delivery, /await globalThis\.navigator\.clipboard\.writeText\(text\)/u);
  assert.match(delivery, /Pedido copiado\. Cole no ChatGPT para continuar a Autoria\./u);
  assert.doesNotMatch(delivery, /materializa/iu);
  assert.match(source, /deliverAuthoringRequest\s*\n\s*\}\);/u);
  assert.doesNotMatch(source, /deliverPartMaterializationRequest/u);
});
