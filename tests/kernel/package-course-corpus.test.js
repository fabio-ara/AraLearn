import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateProjectDocument } from "../../src/domain/aralearnProject.js";
import {
  composeCourseDocument,
  flattenCourseDocument
} from "../../src/domain/courseEntities.js";

const FIXTURES = [
  "tests/fixtures/package/project-minimal.json",
  "tests/fixtures/package/project-visual.json",
  "tests/fixtures/package/project-resources-gallery.json",
  "tests/fixtures/package/resource-test-course.json",
  "tests/fixtures/formulas-matematica-quimica.json",
  "tests/fixtures/course-catalog/teoria-dos-grafos-prova.json",
  "tests/fixtures/course-catalog/praticas-ferramentas-seed-course.json",
  "tests/fixtures/course-catalog/organizacao-arquitetura-computadores-seed-course.json",
  "tests/fixtures/course-catalog/logica-programacao-seed-course.json",
  "tests/fixtures/course-catalog/framework-ia-generativa-seed-course.json",
  "supabase/fixtures/catalog/aralearn-catalogo-recursos-course.json",
  "supabase/fixtures/catalog/microsoft-azure-ai-fundamentals-ai900-seed-course.json",
  "supabase/fixtures/catalog/fundamentos-ia-analise-dados-seed-course.json",
  "supabase/fixtures/catalog/dataprev-analista-processamento-seed-course.json"
];

for (const fixture of FIXTURES) {
  test(`valida e recompõe o Curso corrente de ${fixture}`, async () => {
    const source = JSON.parse(await readFile(fixture, "utf8"));
    const validation = validateProjectDocument(source);
    assert.equal(validation.ok, true, (validation.errors || []).map(({ path, message }) => `${path}: ${message}`).join("; "));
    const { course, rows } = flattenCourseDocument(validation.value);
    const expectedCourseDocument = structuredClone(validation.value);
    delete expectedCourseDocument.scope;
    assert.deepEqual(composeCourseDocument(course, rows), expectedCourseDocument);
    assert.ok(rows.some(({ entityType }) => entityType === "study_unit"));
    assert.equal(rows.some(({ content }) => Object.hasOwn(content, "sources")), false);
  });
}
