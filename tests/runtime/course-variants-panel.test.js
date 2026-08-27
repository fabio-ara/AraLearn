import assert from "node:assert/strict";
import test from "node:test";
import { createCourseVariantsPanel } from "../../src/ui/CourseVariantsPanel.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const SET_ID = "20000000-0000-4000-8000-000000000002";

class Root {
  constructor() { this.innerHTML = ""; this.listeners = new Map(); this.focusedSelectors = []; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type) { this.listeners.delete(type); }
  contains() { return true; }
  querySelector(selector) {
    return { focus: () => this.focusedSelectors.push(selector) };
  }
}

class FakeDocument {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type) { this.listeners.delete(type); }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolveValue, rejectValue) => {
    resolve = resolveValue;
    reject = rejectValue;
  });
  return { promise, resolve, reject };
}

function editControl(root, documentValue, { name, value = "", checked = false, eventType = "input" }) {
  const control = { name, value, checked, selectionStart: value.length, selectionEnd: value.length };
  documentValue.activeElement = control;
  root.listeners.get(eventType)({ target: control });
  return control;
}

function emptyVariantList() {
  return {
    contract: "aralearn.course-variant-comparison-list.v1",
    sourceCourseId: COURSE_ID,
    sourceCourseRevision: 4,
    items: []
  };
}

function variantList(attachedCount) {
  return {
    ...emptyVariantList(),
    items: [{
      comparisonSetId: SET_ID,
      checkpointId: "30000000-0000-4000-8000-000000000003",
      checkpointHash: "a".repeat(64),
      checkpointCourseRevision: 4,
      memberCount: 2,
      attachedCount,
      detachedCount: 2 - attachedCount,
      createdAt: "2026-08-18T12:00:00Z",
      updatedAt: "2026-08-18T12:00:00Z"
    }]
  };
}

test("painel de variantes enumera conjuntos e abre uma comparação vinculada ao Curso", async () => {
  const calls = []; const openedCourses = []; let detached = false;
  const controller = {
    async listCourseVariantComparisons(courseId, revision) {
      calls.push(["list", courseId, revision]);
      return {
        contract: "aralearn.course-variant-comparison-list.v1",
        sourceCourseId: COURSE_ID, sourceCourseRevision: 4,
        items: [{ comparisonSetId: SET_ID, checkpointId: "30000000-0000-4000-8000-000000000003", checkpointHash: "a".repeat(64), checkpointCourseRevision: 4, memberCount: 2, attachedCount: detached ? 0 : 2, detachedCount: detached ? 2 : 0, createdAt: "2026-08-18T12:00:00Z", updatedAt: "2026-08-18T12:00:00Z" }]
      };
    },
    async loadCourseVariantComparison(courseId, options) {
      calls.push(["open", courseId, options.comparisonSetId, options.expectedCourseRevision]);
      return {
        contract: "aralearn.course-variant-comparison.v1", comparisonSetId: SET_ID,
        planning: {
          checkpointId: "30000000-0000-4000-8000-000000000003",
          checkpointHash: "a".repeat(64), courseRevision: 4, planVersion: 2,
          snapshot: { plan: { objective: "Planejamento comum verificável", audience: "Pesquisadores" } }
        },
        source: { courseId: COURSE_ID, title: "Origem", goal: "Objetivo", currentCourseRevision: 4, checkpointCourseRevision: 4, changedSinceCheckpoint: false, checkpointId: "30000000-0000-4000-8000-000000000003", checkpointHash: "a".repeat(64) },
        members: [{
          courseId: "40000000-0000-4000-8000-000000000004", position: 0, label: "Z", title: "Z", goal: "Objetivo",
          attachedCourseRevision: 1, currentCourseRevision: 1, changedSinceAttached: false,
          parameterDifferences: [], componentPolicyDifference: null,
          effectiveParameters: [{
            scopeKind: "course", scopeId: "course",
            parameterId: "new_analysis_unit_ceiling_per_expository_study_unit",
            value: 2, origin: "system_default", sourceScope: null
          }],
          effectiveComponentPolicies: [{
            scopeKind: "course", scopeId: "course",
            policy: { catalogVersion: "1", availability: "all", allowedRefs: [], excludedRefs: [], preferredRefs: [] },
            origin: "system_default", sourceScope: null
          }],
          componentsUsed: [],
          references: { sourceCount: 1, anchorCount: 1, pdfCount: 1, sharedPdfCount: 1, fingerprint: "d".repeat(64) },
          materialization: {
            plannedPartCount: 1, notStartedPartCount: 1, runningPartCount: 0,
            completedPartCount: 0, failedPartCount: 0, studyUnitCount: 0,
            latestUpdatedAt: null, partFingerprint: "b".repeat(64),
            studyUnitFingerprint: "c".repeat(64),
            parts: [{
              partId: "50000000-0000-4000-8000-000000000005", position: 0,
              title: "Parte comum", intent: "Materializar separadamente.", version: 1,
              status: "not_started", materializationId: null,
              materializationVersion: null, updatedAt: null, studyUnitCount: 0
            }],
            studyUnits: [], truncated: { parts: false, studyUnits: false }
          }
        }, {
          courseId: "41000000-0000-4000-8000-000000000005", position: 1,
          label: "A", title: "A", goal: "Objetivo",
          attachedCourseRevision: 1, currentCourseRevision: 1,
          changedSinceAttached: false, parameterDifferences: [],
          componentPolicyDifference: null, effectiveParameters: [],
          effectiveComponentPolicies: [], componentsUsed: [],
          references: { sourceCount: 0, anchorCount: 0, pdfCount: 0, sharedPdfCount: 0, fingerprint: "e".repeat(64) },
          materialization: {
            plannedPartCount: 0, notStartedPartCount: 0, runningPartCount: 0,
            completedPartCount: 0, failedPartCount: 0, studyUnitCount: 0,
            latestUpdatedAt: null, partFingerprint: "f".repeat(64),
            studyUnitFingerprint: "1".repeat(64), parts: [], studyUnits: [],
            truncated: { parts: false, studyUnits: false }
          }
        }],
        differences: {
          referenceCourseId: "40000000-0000-4000-8000-000000000004",
          declared: [], observedExpected: [], accidentalDeviations: [], factual: [],
          missingData: [{
            courseId: "40000000-0000-4000-8000-000000000004",
            referenceCourseId: null, kind: "materialization", scopeKind: null,
            scopeId: null, key: "materialization", expectedValue: null,
            actualValue: null,
            explanation: "A materialização independente ainda não foi iniciada."
          }]
        }
      };
    },
    async mutateCourseVariants({ command }) {
      calls.push(["detach", command.comparisonSetId, command.courseId]);
      detached = true;
      return { changed: true };
    }
  };
  const root = new Root();
  const documentValue = new FakeDocument();
  const tabMoves = [];
  const cancelControl = { focus: () => tabMoves.push("cancel") };
  const confirmControl = { focus: () => tabMoves.push("confirm") };
  root.querySelectorAll = (selector) => selector.includes("data-course-variants-confirmation")
    ? [cancelControl, confirmControl]
    : [];
  documentValue.activeElement = confirmControl;
  const panel = createCourseVariantsPanel({ root, controller, course: { courseId: COURSE_ID, title: "Origem", goal: "Objetivo", revision: 4 }, onOpenCourse: (courseId) => openedCourses.push(courseId), documentValue });
  await panel.open();
  assert.match(root.innerHTML, /Planejamento compartilhado/u);
  root.listeners.get("click")({ target: { closest: () => ({ dataset: { courseVariantsAction: "open", setId: SET_ID } }) } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, [["list", COURSE_ID, 4], ["open", COURSE_ID, SET_ID, 4]]);
  assert.match(root.innerHTML, /Comparação/u);
  assert.match(root.innerHTML, /Referência · Z: Z/u);
  assert.match(root.innerHTML, /Planejamento comum verificável/u);
  assert.match(root.innerHTML, /1 não iniciada/u);
  assert.match(root.innerHTML, /Parte comum<\/strong> · versão 1/u);
  assert.match(root.innerHTML, /1 PDF compartilhado sem duplicar o arquivo/u);
  assert.doesNotMatch(root.innerHTML, /0\/1 Partes/u);
  assert.match(root.innerHTML, /Dados ausentes ou incompletos/u);
  assert.match(root.innerHTML, /Abrir origem/u);
  root.listeners.get("click")({ target: { closest: () => ({ dataset: { courseVariantsAction: "visit", courseId: "40000000-0000-4000-8000-000000000004" } }) } });
  assert.deepEqual(openedCourses, ["40000000-0000-4000-8000-000000000004"]);
  root.listeners.get("click")({ target: { closest: () => ({ dataset: { courseVariantsAction: "detach", courseId: "40000000-0000-4000-8000-000000000004" } }) } });
  assert.match(root.innerHTML, /role="alertdialog"/u);
  assert.match(root.innerHTML, /class="course-authoring-confirm-backdrop" data-course-variants-confirmation-backdrop/u);
  assert.match(root.innerHTML, /role="alertdialog" aria-modal="true"/u);
  assert.equal(calls.some(([operation]) => operation === "detach"), false);
  assert.equal(root.focusedSelectors.at(-1), '[data-course-variants-action="cancel-confirmation"]');
  let tabPrevented = false;
  root.listeners.get("keydown")({ key: "Tab", preventDefault() { tabPrevented = true; } });
  assert.equal(tabPrevented, true);
  assert.equal(tabMoves.at(-1), "cancel");
  root.listeners.get("keydown")({ key: "Escape", preventDefault() {}, stopPropagation() {} });
  assert.doesNotMatch(root.innerHTML, /role="alertdialog"/u);
  assert.equal(root.focusedSelectors.at(-1), '[data-course-variants-action="detach"][data-course-id="40000000-0000-4000-8000-000000000004"]');
  root.listeners.get("click")({ target: { closest: () => ({ dataset: { courseVariantsAction: "detach", courseId: "40000000-0000-4000-8000-000000000004" } }) } });
  documentValue.listeners.get("click")({
    target: { matches: (selector) => selector === "[data-course-variants-confirmation-backdrop]" }
  });
  assert.doesNotMatch(root.innerHTML, /role="alertdialog"/u);
  root.listeners.get("click")({ target: { closest: () => ({ dataset: { courseVariantsAction: "detach", courseId: "40000000-0000-4000-8000-000000000004" } }) } });
  root.listeners.get("click")({ target: { closest: () => ({ dataset: { courseVariantsAction: "confirm-detach" } }) } });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls.slice(-2), [
    ["detach", SET_ID, "40000000-0000-4000-8000-000000000004"],
    ["list", COURSE_ID, 4]
  ]);
  assert.match(root.innerHTML, /Aguardando outra variante/u);
  assert.doesNotMatch(root.innerHTML, />Comparar</u);
  assert.equal(calls.filter(([operation]) => operation === "open").length, 1);
  panel.destroy();
  assert.equal(documentValue.listeners.has("click"), false);
});

test("refresh de Variantes preserva a lista visível até aplicar a nova leitura", async () => {
  const root = new Root();
  const reread = deferred();
  let reads = 0;
  const panel = createCourseVariantsPanel({
    root,
    controller: {
      async listCourseVariantComparisons() {
        reads += 1;
        return reads === 1 ? variantList(2) : reread.promise;
      }
    },
    course: { courseId: COURSE_ID, title: "Origem", goal: "Objetivo", revision: 4 }
  });

  assert.equal(await panel.open(), true);
  assert.match(root.innerHTML, /2 variantes vinculadas/u);
  const refreshing = panel.refresh({
    courseId: COURSE_ID,
    title: "Origem",
    goal: "Objetivo",
    revision: 4
  });

  assert.equal(reads, 2);
  assert.match(root.innerHTML, /2 variantes vinculadas/u);
  assert.doesNotMatch(root.innerHTML, /Carregando variantes/u);

  reread.resolve(variantList(1));
  assert.equal(await refreshing, true);
  assert.match(root.innerHTML, /Aguardando outra variante/u);
  assert.doesNotMatch(root.innerHTML, /2 variantes vinculadas/u);
});

test("painel reutiliza o catálogo real ao oferecer restrição de componentes", async () => {
  const root = new Root();
  const controller = {
    async listCourseVariantComparisons() {
      return { contract: "aralearn.course-variant-comparison-list.v1", sourceCourseId: COURSE_ID, sourceCourseRevision: 4, items: [] };
    },
    async loadCourseDesign() {
      return { componentCatalog: { version: "1-3e5629f8", options: [{ ref: "aralearn.resource.text@1.0.0", label: "Texto", purpose: "Apresenta conteúdo." }] } };
    }
  };
  const panel = createCourseVariantsPanel({ root, controller, course: { courseId: COURSE_ID, title: "Origem", goal: "Objetivo", revision: 4 } });
  await panel.open();
  root.listeners.get("click")({ target: { closest: () => ({ dataset: { courseVariantsAction: "create" } }) } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(root.innerHTML, /Restringir aos componentes selecionados/u);
  assert.match(root.innerHTML, /aralearn\.resource\.text@1\.0\.0/u);
  panel.destroy();
});

for (const catalogOutcome of ["resolve", "reject"]) {
  test(`painel preserva rascunho e foco quando o catálogo pendente ${catalogOutcome === "resolve" ? "resolve" : "falha"}`, async () => {
    const catalog = deferred();
    const root = new Root();
    const documentValue = new FakeDocument();
    const controller = {
      async listCourseVariantComparisons() { return emptyVariantList(); },
      async loadCourseDesign() { return catalog.promise; }
    };
    const panel = createCourseVariantsPanel({
      root,
      controller,
      course: { courseId: COURSE_ID, title: "Origem", goal: "Objetivo", revision: 4 },
      documentValue
    });
    await panel.open();
    root.listeners.get("click")({
      target: { closest: () => ({ dataset: { courseVariantsAction: "create" } }) }
    });
    assert.match(root.innerHTML, /Carregando o catálogo de componentes/u);
    assert.equal(panel.hasPendingDraft(), false);

    editControl(root, documentValue, { name: "title-0", value: "Base digitada & preservada" });
    editControl(root, documentValue, { name: "goal-0", value: "Objetivo próprio da base" });
    editControl(root, documentValue, { name: "title-1", value: "Variante digitada" });
    editControl(root, documentValue, { name: "goal-1", value: "Objetivo próprio da variante" });
    editControl(root, documentValue, { name: "rationale-1", value: "Justificativa ainda em edição" });
    assert.equal(panel.hasPendingDraft(), true);

    if (catalogOutcome === "resolve") {
      catalog.resolve({
        componentCatalog: {
          version: "1-3e5629f8",
          options: [{ ref: "aralearn.resource.text@1.0.0", label: "Texto", purpose: "Apresenta conteúdo." }]
        }
      });
    } else {
      catalog.reject(new Error("catálogo temporariamente indisponível"));
    }
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    assert.match(root.innerHTML, /value="Base digitada &amp; preservada"/u);
    assert.match(root.innerHTML, />Objetivo próprio da base<\/textarea>/u);
    assert.match(root.innerHTML, /value="Variante digitada"/u);
    assert.match(root.innerHTML, />Objetivo próprio da variante<\/textarea>/u);
    assert.match(root.innerHTML, />Justificativa ainda em edição<\/textarea>/u);
    assert.equal(root.focusedSelectors.at(-1), '[name="rationale-1"]');
    if (catalogOutcome === "resolve") {
      assert.match(root.innerHTML, /aralearn\.resource\.text@1\.0\.0/u);
    } else {
      assert.match(root.innerHTML, /catálogo de componentes não ficou disponível/u);
    }
    panel.destroy();
  });
}

test("voltar à lista mantém o rascunho de variantes protegido durante a releitura", async () => {
  const root = new Root();
  const documentValue = new FakeDocument();
  let listReads = 0;
  const panel = createCourseVariantsPanel({
    root,
    documentValue,
    controller: {
      async listCourseVariantComparisons() {
        listReads += 1;
        return emptyVariantList();
      },
      async loadCourseDesign() {
        return { componentCatalog: { version: "1", options: [] } };
      }
    },
    course: { courseId: COURSE_ID, title: "Origem", goal: "Objetivo", revision: 4 }
  });
  await panel.open();
  root.listeners.get("click")({
    target: { closest: () => ({ dataset: { courseVariantsAction: "create" } }) }
  });
  editControl(root, documentValue, {
    name: "title-1",
    value: "Variante ainda não enviada"
  });
  assert.equal(panel.hasPendingDraft(), true);

  root.listeners.get("click")({
    target: { closest: () => ({ dataset: { courseVariantsAction: "back" } }) }
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(root.innerHTML, /Nenhuma comparação criada/u);
  assert.equal(panel.hasPendingDraft(), true, "O rascunho oculto continua bloqueando saída e atualização.");
  assert.equal(listReads, 2);

  await panel.refresh();
  assert.equal(panel.hasPendingDraft(), true);
  root.listeners.get("click")({
    target: { closest: () => ({ dataset: { courseVariantsAction: "create" } }) }
  });
  assert.match(root.innerHTML, /value="Variante ainda não enviada"/u);
  panel.destroy();
});

test("a mudança de duas para três variantes preserva os índices existentes e inicializa apenas o novo", async () => {
  const root = new Root();
  const documentValue = new FakeDocument();
  const controller = {
    async listCourseVariantComparisons() { return emptyVariantList(); },
    async loadCourseDesign() {
      return {
        componentCatalog: {
          version: "1-3e5629f8",
          options: [
            { ref: "aralearn.resource.text@1.0.0", label: "Texto", purpose: "Apresenta conteúdo." },
            { ref: "aralearn.resource.image@1.0.0", label: "Imagem", purpose: "Representa visualmente." }
          ]
        }
      };
    }
  };
  const panel = createCourseVariantsPanel({
    root,
    controller,
    course: { courseId: COURSE_ID, title: "Origem", goal: "Objetivo", revision: 4 },
    documentValue
  });
  await panel.open();
  root.listeners.get("click")({
    target: { closest: () => ({ dataset: { courseVariantsAction: "create" } }) }
  });
  await new Promise((resolve) => setImmediate(resolve));

  editControl(root, documentValue, { name: "label-0", value: "Base fiel" });
  editControl(root, documentValue, { name: "title-0", value: "Título da base" });
  editControl(root, documentValue, { name: "goal-0", value: "Objetivo da base" });
  editControl(root, documentValue, { name: "label-1", value: "Contraste" });
  editControl(root, documentValue, { name: "title-1", value: "Título do contraste" });
  editControl(root, documentValue, { name: "goal-1", value: "Objetivo do contraste" });
  editControl(root, documentValue, { name: "parameter-value-1", value: "7" });
  editControl(root, documentValue, { name: "rationale-1", value: "Diferença justificada" });
  editControl(root, documentValue, {
    name: "policy-enabled-1", value: "true", checked: true, eventType: "change"
  });
  editControl(root, documentValue, {
    name: "policy-allowed-1", value: "aralearn.resource.text@1.0.0", checked: true, eventType: "change"
  });
  editControl(root, documentValue, {
    name: "policy-allowed-1", value: "aralearn.resource.image@1.0.0", checked: false, eventType: "change"
  });
  editControl(root, documentValue, { name: "variant-count", value: "3", eventType: "change" });

  assert.match(root.innerHTML, /name="label-0"[^>]*value="Base fiel"/u);
  assert.match(root.innerHTML, /name="title-0"[^>]*value="Título da base"/u);
  assert.match(root.innerHTML, />Objetivo da base<\/textarea>/u);
  assert.match(root.innerHTML, /name="label-1"[^>]*value="Contraste"/u);
  assert.match(root.innerHTML, /name="title-1"[^>]*value="Título do contraste"/u);
  assert.match(root.innerHTML, />Objetivo do contraste<\/textarea>/u);
  assert.match(root.innerHTML, /name="parameter-value-1"[^>]*value="7"/u);
  assert.match(root.innerHTML, />Diferença justificada<\/textarea>/u);
  assert.match(root.innerHTML, /name="policy-enabled-1" value="true" checked/u);
  assert.match(root.innerHTML, /name="policy-allowed-1" value="aralearn\.resource\.text@1\.0\.0" checked/u);
  assert.doesNotMatch(root.innerHTML, /name="policy-allowed-1" value="aralearn\.resource\.image@1\.0\.0" checked/u);
  assert.match(root.innerHTML, /name="title-2"[^>]*value="Origem: C"/u);
  assert.match(root.innerHTML, /name="goal-2"[^>]*>Objetivo<\/textarea>/u);
  assert.equal(root.focusedSelectors.at(-1), '[name="variant-count"]');
  panel.destroy();
});
