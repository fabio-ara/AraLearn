import test from "node:test";
import assert from "node:assert/strict";

import {
  applyStructureVersionSnapshot,
  buildStructureVersionKey,
  createManualStructureRestore,
  createStructureSnapshot,
  findStructureVersionEntity,
  seedStructureVersionMapFromProject,
  recordStructureVersionTransition,
  syncStructureVersionSnapshot
} from "../src/ui/structureVersioning.js";
import { getScopedVersionDisplayId } from "../src/ui/versionLineage.js";

function createProject() {
  return {
    courses: [
      {
        key: "course-a",
        title: "Curso A",
        modules: [
          {
            key: "module-a",
            title: "Módulo A",
            sourceGuide: "Escopo do módulo: base.",
            sourceGuideStructured: { moduleScope: "base." },
            lessons: [
              {
                key: "lesson-a",
                title: "Lição A",
                microsequences: [{ key: "micro-a", title: "Mic A", cards: [] }]
              }
            ]
          }
        ]
      }
    ]
  };
}

test("buildStructureVersionKey monta chaves estáveis por nível", () => {
  assert.equal(buildStructureVersionKey({ level: "course", courseKey: "course-a" }), "course::course-a");
  assert.equal(
    buildStructureVersionKey({ level: "module", courseKey: "course-a", moduleKey: "module-a" }),
    "module::course-a::module-a"
  );
  assert.equal(
    buildStructureVersionKey({
      level: "lesson",
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a"
    }),
    "lesson::course-a::module-a::lesson-a"
  );
});

test("findStructureVersionEntity resolve curso, módulo e lição", () => {
  const project = createProject();

  assert.equal(
    findStructureVersionEntity(project, { level: "course", courseKey: "course-a" })?.title,
    "Curso A"
  );
  assert.equal(
    findStructureVersionEntity(project, {
      level: "module",
      courseKey: "course-a",
      moduleKey: "module-a"
    })?.title,
    "Módulo A"
  );
  assert.equal(
    findStructureVersionEntity(project, {
      level: "lesson",
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a"
    })?.title,
    "Lição A"
  );
});

test("syncStructureVersionSnapshot cria entrada inicial e mantém a versão ativa alinhada", () => {
  const project = createProject();
  const versionMap = {};
  const reference = { level: "module", courseKey: "course-a", moduleKey: "module-a" };

  const firstEntry = syncStructureVersionSnapshot(versionMap, project, reference, {
    now: new Date("2026-05-10T12:00:00.000Z")
  });

  assert.equal(firstEntry.activeVersionId, "v1");
  assert.equal(firstEntry.versions[0].snapshot.title, "Módulo A");
  assert.deepEqual(firstEntry.versions[0].snapshot.sourceGuideStructured, { moduleScope: "base." });

  const nextProject = createProject();
  nextProject.courses[0].modules[0].title = "Módulo Atualizado";

  const updatedEntry = syncStructureVersionSnapshot(versionMap, nextProject, reference, {
    now: new Date("2026-05-10T12:10:00.000Z")
  });

  assert.equal(updatedEntry.versions.length, 1);
  assert.equal(updatedEntry.versions[0].snapshot.title, "Módulo Atualizado");
  assert.equal(updatedEntry.versions[0].updatedAt, "2026-05-10T12:10:00.000Z");
});

test("recordStructureVersionTransition cria nova iteração para entidade existente", () => {
  const beforeProject = createProject();
  const afterProject = createProject();
  afterProject.courses[0].modules[0].lessons.push({
    key: "lesson-b",
    title: "Lição B",
    microsequences: []
  });

  const versionMap = {};
  const reference = { level: "module", courseKey: "course-a", moduleKey: "module-a" };

  const entry = recordStructureVersionTransition(versionMap, {
    beforeProject,
    afterProject,
    reference,
    operationType: "create-child",
    now: new Date("2026-05-10T13:00:00.000Z")
  });

  assert.equal(entry.activeVersionId, "v2");
  assert.deepEqual(
    entry.versions.map((version) => ({
      id: version.id,
      operationType: version.operationType,
      lessonCount: version.snapshot.lessons.length
    })),
    [
      { id: "v1", operationType: "seed", lessonCount: 1 },
      { id: "v2", operationType: "create-child", lessonCount: 2 }
    ]
  );
});

test("recordStructureVersionTransition inicializa entidade nova com versão única", () => {
  const beforeProject = createProject();
  const afterProject = createProject();
  afterProject.courses[0].modules.push({
    key: "module-b",
    title: "Módulo B",
    lessons: []
  });

  const versionMap = {};
  const reference = { level: "module", courseKey: "course-a", moduleKey: "module-b" };

  const entry = recordStructureVersionTransition(versionMap, {
    beforeProject,
    afterProject,
    reference,
    operationType: "create",
    now: new Date("2026-05-10T14:00:00.000Z")
  });

  assert.equal(entry.activeVersionId, "v1");
  assert.equal(entry.versions.length, 1);
  assert.equal(entry.versions[0].snapshot.title, "Módulo B");
  assert.equal(entry.versions[0].operationType, "seed");
});

test("createStructureSnapshot grava snapshots explícitos sem atualizar versões antigas", () => {
  const versionMap = {};
  const reference = { level: "module", courseKey: "course-a", moduleKey: "module-a" };
  const firstProject = createProject();

  const firstEntry = createStructureSnapshot(versionMap, {
    project: firstProject,
    reference,
    now: new Date("2026-05-10T15:00:00.000Z")
  });

  const secondProject = createProject();
  secondProject.courses[0].modules[0].title = "Módulo B";

  const secondEntry = createStructureSnapshot(versionMap, {
    project: secondProject,
    reference,
    now: new Date("2026-05-10T16:00:00.000Z")
  });

  assert.equal(firstEntry.versions.length, 1);
  assert.equal(secondEntry.activeVersionId, "v2");
  assert.deepEqual(
    secondEntry.versions.map((version) => ({
      id: version.id,
      label: version.label,
      operationType: version.operationType,
      title: version.snapshot.title
    })),
    [
      { id: "v1", label: "Snapshot 1", operationType: "snapshot", title: "Módulo A" },
      { id: "v2", label: "Snapshot 2", operationType: "snapshot", title: "Módulo B" }
    ]
  );
});

test("applyStructureVersionSnapshot restaura o snapshot completo do nível selecionado", () => {
  const project = createProject();
  const nextProject = applyStructureVersionSnapshot(
    project,
    {
      level: "lesson",
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a"
    },
    {
      title: "Lição Restaurada",
      description: "Resumo restaurado",
      sourceGuide: "Guia restaurado",
      sourceGuideStructured: { lessonGoal: "Restaurar guia estruturada." },
      microsequences: [{ key: "micro-b", title: "Mic B", cards: [] }]
    }
  );

  assert.equal(
    nextProject.courses[0].modules[0].lessons[0].title,
    "Lição Restaurada"
  );
  assert.deepEqual(
    nextProject.courses[0].modules[0].lessons[0].microsequences.map((item) => item.key),
    ["micro-b"]
  );
  assert.deepEqual(nextProject.courses[0].modules[0].lessons[0].sourceGuideStructured, {
    lessonGoal: "Restaurar guia estruturada."
  });
  assert.equal(
    project.courses[0].modules[0].lessons[0].title,
    "Lição A"
  );
});

test("createManualStructureRestore cria nova iteração manual sem perder a ativa atual", () => {
  const project = createProject();
  const versionMap = {};
  const reference = { level: "module", courseKey: "course-a", moduleKey: "module-a" };

  recordStructureVersionTransition(versionMap, {
    beforeProject: project,
    afterProject: {
      courses: [
        {
          key: "course-a",
          title: "Curso A",
          modules: [
            {
              key: "module-a",
              title: "Módulo B",
              lessons: project.courses[0].modules[0].lessons
            }
          ]
        }
      ]
    },
    reference,
    operationType: "update",
    now: new Date("2026-05-10T15:00:00.000Z")
  });

  const restored = createManualStructureRestore(versionMap, {
    project: {
      courses: [
        {
          key: "course-a",
          title: "Curso A",
          modules: [
            {
              key: "module-a",
              title: "Módulo B",
              lessons: project.courses[0].modules[0].lessons
            }
          ]
        }
      ]
    },
    reference,
    versionId: "v1",
    now: new Date("2026-05-10T16:00:00.000Z")
  });

  assert.equal(restored.restoredVersion.operationType, "manual-restore");
  assert.equal(restored.restoredVersion.snapshot.title, "Módulo A");
  assert.equal(restored.entry.activeVersionId, "v3");
  assert.deepEqual(
    restored.entry.versions.map((item) => ({ id: item.id, operationType: item.operationType, title: item.snapshot.title })),
    [
      { id: "v1", operationType: "seed", title: "Módulo A" },
      { id: "v2", operationType: "update", title: "Módulo B" },
      { id: "v3", operationType: "manual-restore", title: "Módulo A" }
    ]
  );
});

test("seedStructureVersionMapFromProject materializa ids públicos globais para todo o projeto", () => {
  const project = {
    courses: [
      {
        key: "course-a",
        title: "Curso A",
        modules: [
          {
            key: "module-a",
            title: "Módulo A",
            lessons: [
              { key: "lesson-a", title: "Lição A", microsequences: [] }
            ]
          }
        ]
      },
      {
        key: "course-b",
        title: "Curso B",
        modules: [
          {
            key: "module-b",
            title: "Módulo B",
            lessons: [
              { key: "lesson-b", title: "Lição B", microsequences: [] }
            ]
          }
        ]
      }
    ]
  };

  const versionMap = {};
  const changed = seedStructureVersionMapFromProject(versionMap, project, {
    now: new Date("2026-05-10T10:00:00.000Z")
  });

  assert.equal(changed, true);
  assert.equal(getScopedVersionDisplayId(versionMap["course::course-a"].versions[0], "M"), "M1");
  assert.equal(getScopedVersionDisplayId(versionMap["course::course-b"].versions[0], "M"), "M2");
  assert.equal(getScopedVersionDisplayId(versionMap["module::course-a::module-a"].versions[0], "L"), "L1");
  assert.equal(getScopedVersionDisplayId(versionMap["module::course-b::module-b"].versions[0], "L"), "L2");
});
