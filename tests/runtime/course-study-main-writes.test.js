import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "espree";
import { isAmbiguousManualStudyUnitWriteFailure } from "../../src/ui/manualStudyUnitEdit.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const mainSource = await readFile(new URL("../../public/main.js", import.meta.url), "utf8");
const tree = parse(mainSource, { ecmaVersion: "latest", sourceType: "module", range: true });

function mainDeclaration(name) {
  const pending = [tree];
  while (pending.length) {
    const node = pending.pop();
    if (!node || typeof node !== "object") continue;
    if (node.type === "VariableDeclaration" && node.declarations.some((entry) => entry.id.name === name)) {
      return mainSource.slice(...node.range);
    }
    Object.values(node).forEach((value) => {
      if (Array.isArray(value)) pending.push(...value);
      else if (value && typeof value === "object") pending.push(value);
    });
  }
  assert.fail(`Declaração ausente: ${name}`);
}

function harness({ write, refresh = async () => {} } = {}) {
  const writes = [];
  const loaded = [];
  let ids = 0;
  const controller = {
    async commitCourseStructuralComposition(request) {
      writes.push(structuredClone(request));
      return write ? write(request) : { courseId: request.courseId, courseRevision: request.expectedCourseRevision + 1 };
    }
  };
  const repository = {
    refreshCourses: refresh,
    async loadCourse(courseId) { loaded.push(courseId); },
    loadProject() { return { courses: [{ id: COURSE_ID }] }; }
  };
  // Executa a callback real do shell sem inicializar autenticação, DOM ou rede.
  const build = new Function("authoringController", "repository", "createUuid", "isAmbiguousManualStudyUnitWriteFailure",
    `${mainDeclaration("pendingStudyStructure")}\n${mainDeclaration("saveStudyAssistedStructure")}\nreturn saveStudyAssistedStructure;`);
  return { writes, loaded, save: build(controller, repository, () => `request-structural-${++ids}`, isAmbiguousManualStudyUnitWriteFailure) };
}

function change(overrides = {}) {
  return { courseId: COURSE_ID, expectedCourseRevision: 3, scope: "course",
    metadataChanged: true, title: "Título revisado", objective: "Objetivo revisado.",
    upserts: [{ entityType: "module", entityId: "module-a", parentType: null,
      parentId: null, position: 1, content: { title: "Módulo" } }], deletes: [], ...overrides };
}

function manualHarness({ write, reconcile = async () => true } = {}) {
  const writes = [];
  const reconciliations = [];
  let ids = 0;
  const controller = {
    async commitCourseComposition(request) {
      writes.push(structuredClone(request));
      return write ? write(request) : { courseId: request.courseId, courseRevision: 4,
        studyUnit: request.studyUnit, version: 2, reconciled: true };
    }
  };
  const repository = {
    async reconcileSavedCourse(...args) {
      reconciliations.push(args);
      return reconcile(...args);
    }
  };
  const build = new Function("authoringController", "repository", "createUuid",
    `${mainDeclaration("pendingStudyComposition")}\n${mainDeclaration("saveStudyManualEdit")}\nreturn saveStudyManualEdit;`);
  return { writes, reconciliations, save: build(controller, repository, () => `request-manual-${++ids}`) };
}

const manualChange = { courseId: COURSE_ID, expectedCourseRevision: 3, expectedVersion: 1,
  didacticMicrosequenceId: "microsequence-a", studyUnit: { id: "unit-a", content: "Texto revisado." },
  origin: "manual" };

test("edição manual adota a revisão confirmada antes de devolver a Unidade à sessão atual", async () => {
  let adopted = false;
  const { save, writes, reconciliations } = manualHarness({ reconcile: async () => { adopted = true; return true; } });
  const result = await save(manualChange);
  assert.equal(adopted, true);
  assert.deepEqual(reconciliations, [[COURSE_ID, 4]]);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].expectedStudyUnitVersion, 1);
  assert.equal(result.reconciled, true);
  assert.deepEqual(result.studyUnit, manualChange.studyUnit);
});

test("cache ausente ou leitura local interrompida conserva a gravação confirmada como sincronização pendente", async () => {
  for (const reconcile of [async () => false, async () => { throw new Error("Leitura local indisponível."); }]) {
    const { save, writes } = manualHarness({ reconcile });
    const result = await save(manualChange);
    assert.equal(result.reconciled, false);
    assert.equal(result.courseRevision, 4);
    assert.equal(result.version, 2);
    assert.deepEqual(result.studyUnit, manualChange.studyUnit);
    assert.equal(writes.length, 1);
  }
});

test("adoção local não declara concluída uma releitura que o Controller deixou pendente", async () => {
  const { save } = manualHarness({ write: async () => ({ courseId: COURSE_ID,
    courseRevision: 4, studyUnit: manualChange.studyUnit, version: 2, reconciled: false }) });
  assert.equal((await save(manualChange)).reconciled, false);
});

test("falha antes da confirmação manual não reconcilia e preserva a identidade do pedido na repetição", async () => {
  let attempts = 0;
  const { save, writes, reconciliations } = manualHarness({ write: async (request) => {
    if (++attempts === 1) throw new TypeError("Failed to fetch");
    return { courseId: request.courseId, courseRevision: 4, studyUnit: request.studyUnit, version: 2, reconciled: true };
  } });
  await assert.rejects(() => save(manualChange), /Failed to fetch/u);
  assert.deepEqual(reconciliations, []);
  assert.equal((await save(manualChange)).reconciled, true);
  assert.equal(writes[0].requestId, writes[1].requestId);
  assert.deepEqual(reconciliations, [[COURSE_ID, 4]]);
});

test("título, objetivo e ordem usam uma composição canônica com a revisão da edição", async () => {
  const { save, writes, loaded } = harness();
  const receipt = await save(change());
  assert.deepEqual(writes, [{ requestId: "request-structural-1", courseId: COURSE_ID,
    expectedCourseRevision: 3, upserts: change().upserts, deletes: [],
    courseMetadata: { title: "Título revisado", objective: "Objetivo revisado." } }]);
  assert.equal(receipt.courseRevision, 4);
  assert.equal(receipt.project.courses[0].id, COURSE_ID);
  assert.deepEqual(loaded, [COURSE_ID]);
});

test("edição somente de identidade do curso também passa pelo writer canônico", async () => {
  const { save, writes } = harness();
  await save(change({ upserts: [], deletes: [] }));
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].courseMetadata, { title: "Título revisado", objective: "Objetivo revisado." });
});

test("proposta estrutural deriva título e objetivo do projeto e mantém outros níveis separados", async () => {
  const { save, writes } = harness();
  const proposal = change({ metadataChanged: undefined, title: undefined, objective: undefined,
    originalProject: { courses: [{ id: COURSE_ID, title: "Antes", goal: "Antes." }] },
    proposedProject: { courses: [{ id: COURSE_ID, title: "Depois", goal: "Depois." }] } });
  await save(proposal);
  assert.deepEqual(writes[0].courseMetadata, { title: "Depois", objective: "Depois." });
  await save(change({ scope: "module", expectedCourseRevision: 4 }));
  assert.equal("courseMetadata" in writes[1], false);
});

test("resposta incerta conserva pedido e revisão e recusa payload diferente", async () => {
  let attempts = 0;
  const { save, writes } = harness({ write: async (request) => {
    if (++attempts === 1) throw new TypeError("Failed to fetch");
    return { courseId: request.courseId, courseRevision: 4, idempotent: true };
  } });
  await assert.rejects(() => save(change()), /Failed to fetch/u);
  await assert.rejects(() => save(change({ title: "Outra edição" })), /mesma edição anterior/u);
  assert.equal(writes.length, 1);
  const result = await save(change());
  assert.deepEqual(writes[1], writes[0]);
  assert.equal(result.idempotent, true);
});

test("conflito definitivo permite novo pedido somente com a revisão fornecida pela nova edição", async () => {
  let attempts = 0;
  const { save, writes } = harness({ write: async (request) => {
    if (++attempts === 1) throw Object.assign(new Error("O curso mudou."), { status: 409, code: "course_revision_changed" });
    return { courseId: request.courseId, courseRevision: request.expectedCourseRevision + 1 };
  } });
  await assert.rejects(() => save(change()), /O curso mudou/u);
  await save(change({ expectedCourseRevision: 7 }));
  assert.equal(writes[0].expectedCourseRevision, 3);
  assert.equal(writes[1].expectedCourseRevision, 7);
  assert.notEqual(writes[0].requestId, writes[1].requestId);
});

test("falha de leitura após commit retoma a leitura sem repetir a composição confirmada", async () => {
  let reads = 0;
  const { save, writes } = harness({ refresh: async () => {
    if (++reads === 1) throw new TypeError("Failed to fetch");
  } });
  await assert.rejects(() => save(change()), /Failed to fetch/u);
  const result = await save(change());
  assert.equal(writes.length, 1);
  assert.equal(reads, 2);
  assert.equal(result.courseRevision, 4);
});

test("ausência de alteração não fabrica uma gravação", async () => {
  const { save, writes } = harness();
  const result = await save(change({ metadataChanged: false, upserts: [], deletes: [] }));
  assert.equal(writes.length, 0);
  assert.equal(result.courseRevision, 3);
});
