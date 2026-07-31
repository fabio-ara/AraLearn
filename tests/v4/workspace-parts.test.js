import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateProjectDocument } from "../../supabase/functions/_shared/aralearn/runtime/domain/aralearnProject.js";
import { AuthoringApiError } from "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import {
  buildWorkspaceOutline
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceModel.js";
import {
  buildWorkspaceOutlineFromRows,
  composeWorkspaceDocument,
  diffWorkspaceDocument,
  flattenWorkspaceDocument
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceParts.js";

async function fixture() {
  return JSON.parse(await readFile(
    new URL("../../docs/examples/aralearn-contract.logic-plane-matrix-course.json", import.meta.url),
    "utf8"
  ));
}

function normalized(document) {
  const validation = validateProjectDocument(document);
  assert.equal(validation.ok, true);
  return validation.value;
}

function cloneCourse(course, suffix) {
  const result = structuredClone(course);
  result.id = `${result.id}-${suffix}`;
  result.modules.forEach((moduleValue) => {
    moduleValue.id = `${moduleValue.id}-${suffix}`;
    moduleValue.lessons.forEach((lesson) => {
      lesson.id = `${lesson.id}-${suffix}`;
      lesson.topics.forEach((topic) => {
        topic.id = `${topic.id}-${suffix}`;
      });
      lesson.microsequences.forEach((microsequence) => {
        const previousId = microsequence.id;
        microsequence.id = `${microsequence.id}-${suffix}`;
        microsequence.dependsOn = microsequence.dependsOn.map(
          (id) => `${id}-${suffix}`
        );
        if (microsequence.branchOf) {
          microsequence.branchOf = `${microsequence.branchOf}-${suffix}`;
        }
        microsequence.cards.forEach((card) => {
          card.id = `${card.id}-${suffix}`;
        });
        assert.notEqual(microsequence.id, previousId);
      });
    });
  });
  return result;
}

function versioned(rows) {
  return rows.map((row, index) => ({ ...row, version: index + 11 }));
}

function rowKey(row) {
  return `${row.entityType}:${row.entityId}`;
}

test("partes fazem round-trip v4 sem duplicar identidade, posição ou filhos", async () => {
  const project = await fixture();
  const rows = flattenWorkspaceDocument(project);

  assert.equal(rows[0].entityType, "project");
  assert.equal(rows[0].entityId, "project");
  assert.equal(new Set(rows.map(rowKey)).size, rows.length);
  for (const row of rows) {
    assert.equal(Object.hasOwn(row.content, "id"), false);
    assert.equal(Object.hasOwn(row.content, "position"), false);
  }
  assert.equal(Object.hasOwn(rows[0].content, "courses"), false);
  assert.equal(
    Object.hasOwn(rows.find((row) => row.entityType === "lesson").content, "microsequences"),
    false
  );
  assert.equal(
    Object.hasOwn(rows.find((row) => row.entityType === "lesson").content, "topics"),
    false
  );
  assert.equal(
    Object.hasOwn(rows.find((row) => row.entityType === "microsequence").content, "cards"),
    false
  );
  assert.deepEqual(composeWorkspaceDocument(rows), normalized(project));
});

test("outline usa somente estrutura e contagem, sem carregar conteúdo dos cards", async () => {
  const project = normalized(await fixture());
  const rows = flattenWorkspaceDocument(project).map((row) =>
    row.entityType === "card"
      ? { ...row, content: {} }
      : row
  );

  assert.deepEqual(
    buildWorkspaceOutlineFromRows(rows),
    buildWorkspaceOutline(project)
  );
  assert.equal(
    rows.filter((row) => row.entityType === "card").every(
      (row) => Object.keys(row.content).length === 0
    ),
    true
  );
});

test("rename produz um único upsert e preserva a versão corrente", async () => {
  const project = normalized(await fixture());
  const currentRows = versioned(flattenWorkspaceDocument(project));
  const next = structuredClone(project);
  next.courses[0].title = "Curso renomeado";

  const diff = diffWorkspaceDocument(currentRows, next);
  assert.equal(diff.upserts.length, 1);
  assert.equal(diff.upserts[0].entityType, "course");
  assert.equal(diff.upserts[0].content.title, "Curso renomeado");
  assert.equal(
    diff.upserts[0].version,
    currentRows.find((row) => row.entityType === "course").version
  );
  assert.deepEqual(diff.deletes, []);
  assert.deepEqual(
    diff.nextRows.map((row) => row.version),
    currentRows.map((row) => row.version)
  );
});

test("mover curso na raiz altera somente a entidade e os irmãos reposicionados", async () => {
  const project = normalized(await fixture());
  const baseCourse = project.courses[0];
  project.courses = [
    baseCourse,
    cloneCourse(baseCourse, "second"),
    cloneCourse(baseCourse, "third")
  ];
  const currentRows = versioned(flattenWorkspaceDocument(project));
  const next = structuredClone(project);
  next.courses = [next.courses[2], next.courses[0], next.courses[1]];

  const diff = diffWorkspaceDocument(currentRows, next);
  assert.deepEqual(
    diff.upserts.map((row) => row.entityType),
    ["course", "course", "course"]
  );
  assert.deepEqual(diff.upserts.map((row) => row.position), [0, 1, 2]);
  assert.equal(diff.upserts.some((row) => row.entityType === "project"), false);
  assert.deepEqual(diff.deletes, []);
});

test("excluir curso remove a subárvore e atualiza somente irmãos deslocados", async () => {
  const project = normalized(await fixture());
  const baseCourse = project.courses[0];
  project.courses = [
    baseCourse,
    cloneCourse(baseCourse, "second"),
    cloneCourse(baseCourse, "third")
  ];
  const currentRows = versioned(flattenWorkspaceDocument(project));
  const deletedCourseId = project.courses[1].id;
  const next = structuredClone(project);
  next.courses.splice(1, 1);

  const diff = diffWorkspaceDocument(currentRows, next);
  const deletedKeys = new Set(diff.deletes.map(rowKey));
  const deletedCourse = project.courses[1];
  assert.equal(deletedKeys.has(`course:${deletedCourseId}`), true);
  assert.equal(deletedKeys.has(`module:${deletedCourse.modules[0].id}`), true);
  assert.equal(deletedKeys.has(`lesson:${deletedCourse.modules[0].lessons[0].id}`), true);
  assert.equal(
    deletedKeys.has(
      `microsequence:${deletedCourse.modules[0].lessons[0].microsequences[0].id}`
    ),
    true
  );
  deletedCourse.modules[0].lessons[0].microsequences[0].cards.forEach((card) => {
    assert.equal(deletedKeys.has(`card:${card.id}`), true);
  });
  assert.deepEqual(diff.upserts.map((row) => [
    row.entityType,
    row.entityId,
    row.position
  ]), [["course", project.courses[2].id, 1]]);
  assert.ok(diff.deletes.every((row) => Number.isInteger(row.version)));
});

test("identidade repetida do mesmo tipo é recusada mesmo em pais diferentes", async () => {
  const project = normalized(await fixture());
  const copied = cloneCourse(project.courses[0], "copy");
  copied.modules[0].id = project.courses[0].modules[0].id;
  project.courses.push(copied);

  assert.throws(
    () => flattenWorkspaceDocument(project),
    (error) => error instanceof AuthoringApiError
      && error.code === "duplicate_workspace_part_identity"
  );

  const rows = flattenWorkspaceDocument(normalized(await fixture()));
  rows.push({ ...structuredClone(rows.find((row) => row.entityType === "card")) });
  assert.throws(
    () => composeWorkspaceDocument(rows),
    (error) => error instanceof AuthoringApiError
      && error.code === "duplicate_workspace_part_identity"
  );
});
