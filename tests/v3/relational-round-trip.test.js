import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { validateProjectDocument } from "../../src/domain/aralearnProject.js";
import { canonicalCourseHash, canonicalCourseString } from "../../src/persistence/canonicalCourseHash.js";
import {
  contractToRelationalRows,
  microsequenceFragmentToRelationalRows
} from "../../src/persistence/contractToRelationalRows.js";
import { ProjectDocumentAssembler } from "../../src/persistence/ProjectDocumentAssembler.js";
import {
  relationalRowsToContract,
  relationalRowsToMicrosequenceFragment
} from "../../src/persistence/relationalRowsToContract.js";
import {
  CARD_RESOURCES,
  COMPOSITE_BLOCK_KINDS,
  RELATIONAL_ROW_COLLECTIONS,
  RelationalMappingError,
  UUID_PATTERN
} from "../../src/persistence/relationalSchema.js";
import { validateRelationalCourse } from "../../src/persistence/validateRelationalCourse.js";

const fixture = (relativePath) => new URL(`../fixtures/${relativePath}`, import.meta.url);
const repositoryFile = (relativePath) => new URL(`../../${relativePath}`, import.meta.url);

async function readJson(url) {
  return JSON.parse(await fs.readFile(url, "utf8"));
}

function asProject(course) {
  return {
    contract: "aralearn.contract",
    version: 3,
    kind: "project",
    courses: [course]
  };
}

function allRows(rows) {
  return RELATIONAL_ROW_COLLECTIONS.flatMap((collection) => rows[collection]);
}

function findCard(project, resource) {
  for (const course of project.courses) {
    for (const moduleValue of course.modules) {
      for (const lesson of moduleValue.lessons) {
        for (const microsequence of lesson.microsequences) {
          const card = microsequence.cards.find((candidate) => candidate.resource === resource);
          if (card) return card;
        }
      }
    }
  }
  return null;
}

test("fixture visual faz round-trip exato e mantém coordenadas granulares", async () => {
  const source = await readJson(fixture("v3/project-visual.json"));
  const rows = contractToRelationalRows(source);
  const rebuilt = new ProjectDocumentAssembler().assemble(rows);

  assert.deepEqual(rebuilt, source);
  assert.equal(validateProjectDocument(rebuilt).ok, true);
  assert.equal(validateRelationalCourse(rows).ok, true);
  assert.ok(rows.nodes.some((row) => row.nodeScope === "graph" && row.hasX && row.hasY));
  assert.ok(rows.points.length > 0);
  assert.ok(rows.lines.length > 0);
  assert.ok(rows.cells.length > 0);

  const ids = allRows(rows).map((row) => row.id);
  assert.ok(ids.every((id) => UUID_PATTERN.test(id)));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(rows.courses.every((row) => row.id !== row.contractKey));
});

test("todos os 11 recursos, blocos e filhos reais preservam igualdade semântica", async () => {
  const courses = await Promise.all([
    readJson(repositoryFile("supabase/fixtures/catalog/dataprev-analista-processamento-seed-course.json")),
    readJson(fixture("course-catalog/framework-ia-generativa-seed-course.json"))
  ]);
  const seenResources = new Set();
  const seenBlockKinds = new Set();

  for (const course of courses) {
    const source = asProject(course);
    const rows = contractToRelationalRows(source);
    const rebuilt = relationalRowsToContract(rows);

    assert.deepEqual(rebuilt, source);
    rows.cards.forEach((row) => seenResources.add(row.resource));
    rows.blocks.forEach((row) => seenBlockKinds.add(row.blockType));
  }

  assert.deepEqual([...seenResources].sort(), [...CARD_RESOURCES].sort());
  assert.deepEqual([...seenBlockKinds].sort(), [...COMPOSITE_BLOCK_KINDS].sort());
});

test("exemplo público com tags de tópico livres também faz round-trip relacional", async () => {
  const course = await readJson(fixture("course-catalog/teoria-dos-grafos-prova.json"));
  const source = asProject(course);
  const rows = contractToRelationalRows(source);

  assert.ok(rows.cardTopics.some((row) => row.topicId === null));
  assert.deepEqual(relationalRowsToContract(rows), source);
  assert.equal(validateRelationalCourse(rows).ok, true);
});

test("ids textuais de opções e nós ficam escopados por bloco, sem virar identidade persistida", async () => {
  const course = await readJson(repositoryFile("supabase/fixtures/catalog/dataprev-analista-processamento-seed-course.json"));
  const rows = contractToRelationalRows(asProject(course));

  const optionA = rows.options.filter((row) => row.contractKey === "a");
  assert.ok(optionA.length > 2);
  assert.equal(new Set(optionA.map((row) => row.blockId)).size, optionA.length);
  assert.equal(new Set(optionA.map((row) => row.id)).size, optionA.length);

  const duplicatedNodeKey = rows.nodes.find((candidate) => rows.nodes.some((other) => (
    other.id !== candidate.id
    && other.contractKey === candidate.contractKey
    && other.blockId !== candidate.blockId
  )))?.contractKey;
  assert.ok(duplicatedNodeKey);
  const scopedNodes = rows.nodes.filter((row) => row.contractKey === duplicatedNodeKey);
  assert.equal(new Set(scopedNodes.map((row) => row.blockId)).size, scopedNodes.length);
  assert.ok(scopedNodes.every((row) => row.id !== row.contractKey));
});

test("fragmento de microssequência faz round-trip sem scaffolding documental", async () => {
  const project = await readJson(fixture("v3/project-minimal.json"));
  const fragment = project.courses[0].modules[0].lessons[0].microsequences[0];
  const rows = microsequenceFragmentToRelationalRows(fragment);

  assert.equal(rows.projectMeta.length, 0);
  assert.equal(rows.courses.length, 0);
  assert.equal(rows.modules.length, 0);
  assert.equal(rows.lessons.length, 0);
  assert.deepEqual(relationalRowsToMicrosequenceFragment(rows), fragment);
  assert.deepEqual(new ProjectDocumentAssembler().assembleMicrosequence(rows), fragment);
});

test("hash canônico SHA-256 é estável no round-trip e sensível a alteração de domínio", async () => {
  const project = await readJson(fixture("v3/project-minimal.json"));
  const course = project.courses[0];
  const rebuiltCourse = relationalRowsToContract(contractToRelationalRows(project)).courses[0];
  const reorderedCourse = Object.fromEntries(Object.entries(course).reverse());

  const originalHash = await canonicalCourseHash(course);
  assert.match(originalHash, /^[0-9a-f]{64}$/u);
  assert.equal(await canonicalCourseHash(rebuiltCourse), originalHash);
  assert.equal(await canonicalCourseHash(reorderedCourse), originalHash);
  assert.equal(canonicalCourseString(rebuiltCourse), canonicalCourseString(course));

  const changed = structuredClone(course);
  changed.modules[0].lessons[0].microsequences[0].cards[0].text += " Alteração granular.";
  assert.notEqual(await canonicalCourseHash(changed), originalHash);
});

test("campos aninhados sem mapeamento são rejeitados em vez de desaparecer", async () => {
  const project = await readJson(fixture("v3/project-visual.json"));
  const graph = findCard(project, "graph");
  graph.vertices[0].color = "red";

  assert.throws(
    () => contractToRelationalRows(project),
    (caught) => caught instanceof RelationalMappingError
      && /campos sem mapeamento relacional/u.test(caught.message)
      && caught.details.some((entry) => entry.path.endsWith(".color"))
  );
});

test("tags de tópico livres são preservadas e referências vazias ou duplicadas são rejeitadas", async () => {
  const project = await readJson(fixture("v3/project-minimal.json"));
  const lesson = project.courses[0].modules[0].lessons[0];
  const card = lesson.microsequences[0].cards[0];
  const topicKey = lesson.topics[0].id;

  card.topics = [topicKey, topicKey, "   "];
  const duplicateValidation = validateProjectDocument(project);
  assert.equal(duplicateValidation.ok, false);
  assert.ok(duplicateValidation.errors.some((entry) => entry.path.endsWith(".topics")));

  card.topics = ["topic-inexistente"];
  const rows = contractToRelationalRows(project);
  assert.equal(rows.cardTopics[0].topicId, null);
  assert.equal(rows.cardTopics[0].topicContractKey, "topic-inexistente");
  assert.deepEqual(relationalRowsToContract(rows), project);
});

test("validação relacional detecta FK, revisão e posição inválidas", async () => {
  const project = await readJson(fixture("v3/project-minimal.json"));
  const rows = contractToRelationalRows(project);
  rows.cards[0].lessonId = crypto.randomUUID();
  rows.blocks[0].revision = 0;
  rows.cards[1].position = rows.cards[0].position;

  const result = validateRelationalCourse(rows);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => entry.code === "foreign_key"));
  assert.ok(result.errors.some((entry) => entry.code === "revision"));
  assert.ok(result.errors.some((entry) => entry.code === "position"));
});

test("identityMap reutiliza UUIDs sem acoplar identidade ao conteúdo", async () => {
  const project = await readJson(fixture("v3/project-minimal.json"));
  const identityMap = new Map();
  const before = contractToRelationalRows(project, { identityMap });
  const changed = structuredClone(project);
  changed.courses[0].modules[0].lessons[0].microsequences[0].cards[0].text += " Atualizado.";
  const after = contractToRelationalRows(changed, { identityMap });

  assert.deepEqual(
    allRows(after).map((row) => [row.identityKey, row.id]),
    allRows(before).map((row) => [row.identityKey, row.id])
  );
  assert.notEqual(after.blocks[0].value, before.blocks[0].value);
});

test("scope do contrato é remontado a partir dos cursos quando projectMeta não viaja", async () => {
  const project = await readJson(fixture("v3/project-minimal.json"));
  project.scope = "course";
  const rows = contractToRelationalRows(project);
  rows.projectMeta = [];

  assert.ok(rows.courses.every((row) => row.contractScope === "course"));
  assert.deepEqual(relationalRowsToContract(rows), project);

  rows.courses.push({
    ...rows.courses[0],
    id: crypto.randomUUID(),
    courseId: crypto.randomUUID(),
    contractKey: "outro-curso",
    contractScope: null,
    position: 1
  });
  assert.throws(
    () => relationalRowsToContract(rows, { validate: false }),
    /scopes de contrato incompatíveis/u
  );
});
