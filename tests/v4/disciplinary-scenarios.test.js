import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { CONTRACT_CARD_KINDS } from "../../src/contract/contractCard.js";
import { validateProjectDocument } from "../../src/domain/aralearnProject.js";
import { RESOURCE_TYPES } from "../../src/domain/resources.js";
import { RESOURCE_CATALOG } from "../../src/generation/engine/resourceCatalog.js";
import { CARD_RESOURCE_DEFINITIONS } from "../../src/generation/resources/cardResourceDefinitions.js";
import { ProjectDocumentAssembler } from "../../src/persistence/ProjectDocumentAssembler.js";
import { contractToRelationalRows } from "../../src/persistence/contractToRelationalRows.js";
import { CARD_RESOURCES, RelationalMappingError } from "../../src/persistence/relationalSchema.js";
import { relationalRowsToContract } from "../../src/persistence/relationalRowsToContract.js";
import { validateRelationalCourse } from "../../src/persistence/validateRelationalCourse.js";
import { renderCardRuntimeArticle } from "../../src/render/renderCardRuntime.js";
import { validateAuthoringFragment } from "../../supabase/functions/_shared/aralearn-authoring/canonical.js";
import {
  buildDisciplinaryScenarioProject,
  DISCIPLINARY_SCENARIOS
} from "../fixtures/disciplinary-scenarios.fixture.js";

const repositoryFile = (relativePath) => new URL(`../../${relativePath}`, import.meta.url);

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function projectCards(project) {
  return project.courses.flatMap((course) => course.modules)
    .flatMap((moduleValue) => moduleValue.lessons)
    .flatMap((lesson) => lesson.microsequences)
    .flatMap((microsequence) => microsequence.cards);
}

function findCard(project, cardId) {
  return projectCards(project).find((card) => card.id === cardId) || null;
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(repositoryFile(relativePath), "utf8"));
}

async function effectiveSqlCardResources() {
  const migrationsUrl = repositoryFile("supabase/migrations");
  const migrationNames = (await fs.readdir(migrationsUrl)).filter((name) => name.endsWith(".sql")).sort();
  const resources = new Set();

  for (const migrationName of migrationNames) {
    const sql = await fs.readFile(new URL(migrationName, `${migrationsUrl.href}/`), "utf8");
    const initial = /create\s+type\s+public\.card_resource\s+as\s+enum\s*\(([\s\S]*?)\);/iu.exec(sql);
    if (initial) {
      for (const match of initial[1].matchAll(/'([^']+)'/gu)) resources.add(match[1]);
    }
    for (const match of sql.matchAll(/alter\s+type\s+public\.card_resource\s+add\s+value\s+if\s+not\s+exists\s+'([^']+)'/giu)) {
      resources.add(match[1]);
    }
  }

  return sorted(resources);
}

function poisonRenderedFields(card, payload) {
  card.title = payload;

  const poisonChoice = (value) => {
    if (value.question !== undefined) value.question = payload;
    if (Array.isArray(value.options) && value.options[0]) {
      if (value.options[0].kind === "code") value.options[0].code = payload;
      else value.options[0].text = payload;
    }
  };
  const poisonFlow = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.text !== undefined) node.text = payload;
    if (node.condition !== undefined) node.condition = payload;
    ["items", "thenBranch", "elseBranch", "body", "cases", "defaultBranch"].forEach((fieldName) => {
      if (Array.isArray(node[fieldName])) node[fieldName].forEach(poisonFlow);
    });
  };
  const poisonBlock = (block) => {
    if (block.value !== undefined) block.value = payload;
    if (block.prompt !== undefined) block.prompt = payload;
    if (block.code !== undefined) block.code = payload;
    if (Array.isArray(block.columns) && block.columns.length) block.columns[0] = payload;
    if (Array.isArray(block.rows) && block.rows[0]?.length) block.rows[0][0] = payload;
    poisonChoice(block);
  };

  if (card.resource === "paragraph") card.text = payload;
  if (card.prompt !== undefined) card.prompt = payload;
  if (card.code !== undefined) card.code = payload;
  poisonChoice(card);
  if (Array.isArray(card.columns) && card.columns.length) card.columns[0] = payload;
  if (Array.isArray(card.rows) && card.rows[0]?.length) card.rows[0][0] = payload;
  if (card.structure) poisonFlow(card.structure);
  if (Array.isArray(card.nodes) && card.nodes[0]) card.nodes[0].label = payload;
  if (Array.isArray(card.vertices) && card.vertices[0]) card.vertices[0].label = payload;
  if (Array.isArray(card.edges) && card.edges[0]) card.edges[0].label = payload;
  if (card.leftSet) {
    card.leftSet.label = payload;
    if (card.leftSet.items?.[0]) card.leftSet.items[0].label = payload;
  }
  if (card.rightSet) {
    card.rightSet.label = payload;
    if (card.rightSet.items?.[0]) card.rightSet.items[0].label = payload;
  }
  if (Array.isArray(card.pairList) && card.pairList.length) card.pairList[0] = payload;
  if (card.relationTable?.columns?.length) card.relationTable.columns[0] = payload;
  if (card.relationTable?.rows?.[0]?.length) card.relationTable.rows[0][0] = payload;
  if (card.name !== undefined) card.name = payload;
  if (Array.isArray(card.values) && card.values[0]?.length) card.values[0][0] = payload;
  if (card.accessibleText !== undefined) card.accessibleText = payload;
  if (card.xAxis?.label !== undefined) card.xAxis.label = payload;
  if (card.yAxis?.label !== undefined) card.yAxis.label = payload;
  if (Array.isArray(card.series) && card.series[0]) card.series[0].name = payload;
  if (Array.isArray(card.items) && card.items[0]) card.items[0].label = payload;
  if (Array.isArray(card.segments) && card.segments[0]) card.segments[0].text = payload;
  if (Array.isArray(card.annotations) && card.annotations[0]) {
    card.annotations[0].label = payload;
    card.annotations[0].note = payload;
  }
  if (Array.isArray(card.units) && card.units[0]) {
    card.units[0].form = payload;
    card.units[0].gloss = payload;
    card.units[0].translation = payload;
  }
  if (card.expression) {
    const queue = [card.expression];
    while (queue.length) {
      const node = queue.shift();
      if (typeof node?.value === "string") {
        node.value = payload;
        break;
      }
      Object.values(node || {}).forEach((value) => {
        if (value && typeof value === "object") {
          if (Array.isArray(value)) queue.push(...value);
          else queue.push(value);
        }
      });
    }
  }
  if (Array.isArray(card.blocks)) card.blocks.forEach(poisonBlock);

  return card;
}

test("catálogos de recursos permanecem idênticos no domínio, no relacional, na geração e na autoria", async () => {
  const canonical = sorted(RESOURCE_TYPES);
  const partSpecification = await readJson("authoring/schemas/part-specification.schema.json");
  const partSubmission = await readJson("authoring/schemas/part-submission.schema.json");
  const authoringCard = await readJson("authoring/schemas/card.schema.json");

  assert.deepEqual(sorted(CONTRACT_CARD_KINDS), canonical);
  assert.deepEqual(sorted(CARD_RESOURCES), canonical);
  assert.deepEqual(sorted(RESOURCE_CATALOG.map((entry) => entry.id)), canonical);
  assert.deepEqual(sorted(CARD_RESOURCE_DEFINITIONS.map((entry) => entry.id)), canonical);
  assert.deepEqual(
    sorted(partSpecification.$defs.cardPlan.items.properties.resource.enum),
    canonical
  );
  assert.deepEqual(
    sorted(authoringCard.properties.resource.enum),
    canonical
  );
  assert.equal(
    partSubmission.properties.fragment.properties.microsequences.items.properties.cards.items.$ref,
    "card.schema.json"
  );
  assert.deepEqual(await effectiveSqlCardResources(), canonical);

  for (const resource of RESOURCE_CATALOG) {
    assert.ok(Array.isArray(resource.useWhen), `${resource.id} precisa declarar critérios de seleção.`);
    assert.ok(Array.isArray(resource.avoidWhen), `${resource.id} precisa declarar critérios de exclusão.`);
  }
});

test("matriz disciplinar valida, normaliza, remonta e renderiza todos os recursos sem perda semântica", () => {
  const source = buildDisciplinaryScenarioProject();
  const documentValidation = validateProjectDocument(source);
  assert.equal(documentValidation.ok, true, JSON.stringify(documentValidation.errors || []));

  const rows = contractToRelationalRows(source);
  const relationalValidation = validateRelationalCourse(rows);
  assert.equal(relationalValidation.ok, true, JSON.stringify(relationalValidation.errors || []));

  const rebuilt = relationalRowsToContract(rows);
  assert.deepEqual(rebuilt, source);
  assert.deepEqual(new ProjectDocumentAssembler().assemble(rows), source);
  assert.equal(validateProjectDocument(rebuilt).ok, true);

  const cards = projectCards(rebuilt);
  assert.deepEqual(sorted(new Set(cards.map((card) => card.resource))), sorted(RESOURCE_TYPES));
  cards.forEach((card) => {
    const html = renderCardRuntimeArticle(card);
    assert.match(html, new RegExp(`data-card-id="${card.id}"`, "u"));
    assert.doesNotMatch(html, /<script\b|<img\b|<iframe\b/iu);
  });

  const internationalText = JSON.stringify(rebuilt);
  ["你好", "nǐ hǎo", "こんにちは", "χαῖρε", "khaîre", "كتاب", "kitāb", "قلم", "qalam"].forEach((token) => {
    assert.ok(internationalText.includes(token), `O round-trip perdeu ${token}.`);
  });
  assert.doesNotMatch(internationalText, /[\u202A-\u202E\u2066-\u2069]/u);
  assert.match(renderCardRuntimeArticle(findCard(rebuilt, "card-texto-rtl")), /dir="auto"/u);
});

test("todo exercício disciplinar contém no próprio card os dados variáveis usados na resposta", () => {
  const project = buildDisciplinaryScenarioProject();
  const exercises = projectCards(project).filter((card) => card.kind === "exercise");
  const evidenceByCard = new Map(
    DISCIPLINARY_SCENARIOS.flatMap((scenario) => Object.entries(scenario.exerciseEvidence))
  );

  assert.deepEqual(sorted(evidenceByCard.keys()), sorted(exercises.map((card) => card.id)));

  exercises.forEach((card) => {
    const serialized = JSON.stringify(card);
    const evidence = evidenceByCard.get(card.id) || [];
    assert.ok(evidence.length > 0, `${card.id} precisa declarar os dados que tornam a prática autocontida.`);
    evidence.forEach((token) => {
      assert.ok(serialized.includes(token), `${card.id} depende do dado ausente ${token}.`);
    });
    assert.doesNotMatch(
      serialized,
      /(?:card|exemplo|tabela|figura|caso|texto)\s+(?:anterior|precedente)|como\s+(?:visto|dito)\s+(?:antes|anteriormente)/iu,
      `${card.id} depende de contexto volátil externo.`
    );
  });
});

test("a API de autoria aceita partes com todos os recursos da matriz disciplinar", () => {
  const project = buildDisciplinaryScenarioProject();
  const acceptedResources = new Set();

  for (const course of project.courses) {
    for (const moduleValue of course.modules) {
      for (const lesson of moduleValue.lessons) {
        for (const microsequence of lesson.microsequences) {
          validateAuthoringFragment({ microsequences: [microsequence] });
          microsequence.cards.forEach((card) => acceptedResources.add(card.resource));
        }
      }
    }
  }

  assert.deepEqual(sorted(acceptedResources), sorted(RESOURCE_TYPES));
});

test("campo desconhecido em qualquer recurso é rejeitado em vez de desaparecer no round-trip", () => {
  const project = buildDisciplinaryScenarioProject();

  for (const resource of RESOURCE_TYPES) {
    const changed = structuredClone(project);
    const card = projectCards(changed).find((candidate) => candidate.resource === resource);
    assert.ok(card, `Fixture ausente para ${resource}.`);
    card.campoNaoMapeado = `não perder ${resource}`;

    assert.throws(
      () => contractToRelationalRows(changed),
      (caught) => caught instanceof RelationalMappingError
        && caught.details.some((entry) => entry.path.endsWith(".campoNaoMapeado")),
      `${resource} aceitou campo sem mapeamento.`
    );
  }
});

test("renderização escapa marcação fornecida em todos os recursos", () => {
  const project = buildDisciplinaryScenarioProject();
  const payload = '<img src=x onerror="globalThis.injetado=true"><script>globalThis.injetado=true</script>';
  const representativeCards = new Map();
  projectCards(project).forEach((card) => {
    if (!representativeCards.has(card.resource)) representativeCards.set(card.resource, card);
  });

  assert.deepEqual(sorted(representativeCards.keys()), sorted(RESOURCE_TYPES));
  for (const [resource, sourceCard] of representativeCards) {
    const card = poisonRenderedFields(structuredClone(sourceCard), payload);
    const html = renderCardRuntimeArticle(card);

    assert.doesNotMatch(html, /<script\b|<img\b|<iframe\b/iu, `${resource} inseriu elemento arbitrário.`);
    assert.doesNotMatch(html, /<[^>]+\sonerror\s*=\s*["']/iu, `${resource} inseriu atributo de evento.`);
    assert.match(html, /&lt;(?:img|script)/iu, `${resource} não exibiu o conteúdo como texto escapado.`);
  }
});
