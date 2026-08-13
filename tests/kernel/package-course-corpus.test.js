import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateProjectDocument } from "../../src/domain/aralearnProject.js";
import { contractToRelationalRows } from "../../src/persistence/contractToRelationalRows.js";
import { relationalRowsToContract } from "../../src/persistence/relationalRowsToContract.js";
import { validateRelationalCourse } from "../../src/persistence/validateRelationalCourse.js";

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

let uuidCounter = 0;
const uuidFactory = () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, "0")}`;

for (const fixture of FIXTURES) {
  test(`valida e remonta integralmente ${fixture}`, async () => {
    uuidCounter = 0;
    const source = JSON.parse(await readFile(fixture, "utf8"));
    const validation = validateProjectDocument(source);
    assert.equal(validation.ok, true, (validation.errors || []).map(({ path, message }) => `${path}: ${message}`).join("; "));
    const rows = contractToRelationalRows(source, { uuidFactory });
    const relational = validateRelationalCourse(rows);
    assert.equal(relational.ok, true, JSON.stringify(relational.errors));
    assert.deepEqual(relationalRowsToContract(rows), validation.value);
    assert.ok(rows.packageInstances.length > 0);
    assert.equal(rows.blocks, undefined);
  });
}
