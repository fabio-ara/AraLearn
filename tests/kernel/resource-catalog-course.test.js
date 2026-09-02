import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildResourceCatalogCourse,
  RESOURCE_CATALOG_COURSE_PATH,
  serializeResourceCatalogCourse
} from "../../scripts/buildResourceCatalogCourse.mjs";
import { validateProjectDocument } from "../../src/domain/aralearnProject.js";
import { RESOURCE_CATALOG } from "../../src/resources/catalog/resourceCatalog.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../../src/resources/packages/index.js";
import { COURSE_HUMAN_TASKS } from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";

const PROJECT_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const UTF8 = new TextEncoder();
const META_QUESTION = /(?:qual (?:é )?a finalidade|para que serve|qual (?:package|componente|recurso)|recurso utilizado|componente utilizado)/iu;
const CURRENT_COURSE_CORPUS = Object.freeze([
  "tests/fixtures/package/project-minimal.json",
  "tests/fixtures/package/project-visual.json",
  "tests/fixtures/course-catalog/teoria-dos-grafos-prova.json",
  "tests/fixtures/course-catalog/praticas-ferramentas-seed-course.json",
  "tests/fixtures/course-catalog/organizacao-arquitetura-computadores-seed-course.json",
  "tests/fixtures/course-catalog/logica-programacao-seed-course.json",
  "tests/fixtures/course-catalog/framework-ia-generativa-seed-course.json",
  "supabase/fixtures/catalog/microsoft-azure-ai-fundamentals-ai900-seed-course.json",
  "supabase/fixtures/catalog/fundamentos-ia-analise-dados-seed-course.json",
  "supabase/fixtures/catalog/dataprev-analista-processamento-seed-course.json"
]);
const EXPECTED_CURRENT_USES = Object.freeze({
  "aralearn.resource.code": 859,
  "aralearn.resource.flow": 214,
  "aralearn.resource.graph": 183,
  "aralearn.resource.matrix": 46,
  "aralearn.resource.paragraph": 5370,
  "aralearn.resource.plane": 8,
  "aralearn.resource.relation_map": 125,
  "aralearn.resource.table": 541,
  "aralearn.resource.tree": 52,
  "aralearn.response.choice": 2386,
  "aralearn.response.gap": 604
});

function byteLength(value) {
  return UTF8.encode(typeof value === "string" ? value : JSON.stringify(value)).byteLength;
}

function collectPackageUses(value, uses = new Map()) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectPackageUses(item, uses));
  } else if (value && typeof value === "object") {
    if (typeof value.package === "string") {
      uses.set(value.package, (uses.get(value.package) || 0) + 1);
    }
    Object.values(value).forEach((item) => collectPackageUses(item, uses));
  }
  return uses;
}

async function javascriptRuntimeMetrics() {
  const runtimeRoot = path.join(
    PROJECT_ROOT,
    "supabase/functions/_shared/aralearn/runtime/resources"
  );
  const entries = await readdir(runtimeRoot, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".js"));
  let bytes = 0;
  for (const entry of files) {
    bytes += (await stat(path.join(entry.parentPath, entry.name))).size;
  }
  return { files: files.length, bytes };
}

function allManifests() {
  return [
    ...RESOURCE_PACKAGE_REGISTRY.listCatalog({ slot: "content" }),
    ...RESOURCE_PACKAGE_REGISTRY.listCatalog({ slot: "response" })
  ];
}

test("fixture publicada do catálogo não diverge do gerador determinístico", async () => {
  const current = await readFile(RESOURCE_CATALOG_COURSE_PATH, "utf8");
  assert.equal(current, serializeResourceCatalogCourse());
});

test("registry oferece 32 exemplos e contratos exatos estruturalmente válidos", () => {
  const manifests = allManifests();
  assert.equal(manifests.length, 32);
  assert.equal(RESOURCE_PACKAGE_REGISTRY.listCatalog({ slot: "content" }).length, 29);
  assert.equal(RESOURCE_PACKAGE_REGISTRY.listCatalog({ slot: "response" }).length, 3);

  for (const manifest of manifests) {
    const slot = manifest.slots.includes("content") ? "content" : "response";
    const contractResult = RESOURCE_CATALOG.contracts([{
      packageId: manifest.id,
      version: manifest.version
    }]);
    assert.equal(contractResult.items.length, 1, manifest.id);
    assert.equal(contractResult.items[0].status, "ok", manifest.id);
    const definition = contractResult.items[0].definition;
    assert.equal(definition.package, manifest.id);
    assert.equal(definition.version, manifest.version);
    assert.doesNotMatch(JSON.stringify(definition.contract.example), META_QUESTION, manifest.id);
    const normalized = RESOURCE_PACKAGE_REGISTRY.normalizeInstance({
      id: `acceptance-${manifest.id.split(".").at(-1)}`,
      package: manifest.id,
      version: manifest.version,
      data: structuredClone(definition.contract.example)
    }, slot);
    assert.ok(RESOURCE_PACKAGE_REGISTRY.accessibleText(normalized, slot), manifest.id);
  }

  assert.throws(() => RESOURCE_CATALOG.contracts([
    { packageId: manifests[0].id, version: manifests[0].version },
    { packageId: manifests[1].id, version: manifests[1].version }
  ]), /precisa ser 1/u);
});

test("curso apresenta operações-alvo da tarefa com rótulos pedagógicos, não ids internos", async () => {
  const course = await buildResourceCatalogCourse();
  const serialized = JSON.stringify(course);
  for (const internalId of [
    "annotate", "inspect-code", "locate-coordinate", "trace-control-flow"
  ]) {
    assert.doesNotMatch(serialized, new RegExp(`operação-alvo[^.]*${internalId}`, "iu"));
  }
});

test("curso deriva as famílias correntes sem fixar o crescimento do catálogo", () => {
  const project = buildResourceCatalogCourse();
  const validation = validateProjectDocument(project);
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));

  const course = project.courses[0];
  const families = [...RESOURCE_CATALOG.families]
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  assert.equal(course.title, "AraLearn: Catálogo de recursos");
  assert.equal(families.length, RESOURCE_CATALOG.families.length);
  assert.ok(families.length > 0);
  assert.equal(course.modules.length, families.length);

  const manifests = allManifests();
  const manifestById = new Map(manifests.map((manifest) => [manifest.id, manifest]));
  const coveredPackageIds = [];
  const studyUnitIds = new Set();

  course.modules.forEach((moduleValue, moduleIndex) => {
    const family = families[moduleIndex];
    assert.match(moduleValue.id, new RegExp(`^catalog-family-${family.id.replace(/[^a-zA-Z0-9]+/gu, "-")}`));
    assert.equal(moduleValue.lessons.length, 1);
    const { microsequences } = moduleValue.lessons[0];
    assert.ok(microsequences.length > 0, `família vazia: ${family.id}`);

    microsequences.forEach((microsequence) => {
      assert.equal(microsequence.covers.length, 1);
      const packageId = microsequence.covers[0];
      const manifest = manifestById.get(packageId);
      assert.ok(manifest, `package desconhecido: ${packageId}`);
      const profile = RESOURCE_CATALOG.getProfile(packageId, manifest.version);
      assert.equal(profile?.primaryFamilyId, family.id);
      coveredPackageIds.push(packageId);

      assert.deepEqual(microsequence.dependsOn, []);
      assert.equal(microsequence.studyUnits.length, 2);
      const [theory, practice] = microsequence.studyUnits;
      assert.equal(theory.position, 1);
      assert.equal(theory.role, "theory");
      assert.equal(theory.response, null);
      assert.ok(theory.content.length > 0);
      assert.equal(practice.position, 2);
      assert.equal(practice.role, "practice");
      assert.ok(practice.response);
      assert.ok(practice.feedback.length > 0);

      for (const studyUnit of microsequence.studyUnits) {
        assert.equal(
          studyUnitIds.has(studyUnit.id),
          false,
          `Unidade de estudo duplicada: ${studyUnit.id}`
        );
        studyUnitIds.add(studyUnit.id);
        const validation = RESOURCE_CATALOG.validateStudyUnit(studyUnit);
        assert.equal(validation.valid, true, `${packageId}: ${validation.errors.join(" ")}`);
      }
      assert.doesNotMatch(JSON.stringify(practice.response?.data || {}), META_QUESTION, packageId);
      if (manifest.slots.includes("content")) {
        assert.ok(theory.content.some((instance) => instance.package === packageId));
        assert.ok(practice.content.some((instance) => instance.package === packageId));
        if (practice.response.package === "aralearn.response.gap") {
          const contentById = new Map(practice.content.map((instance) => [instance.id, instance]));
          for (const blank of practice.response.data.blanks) {
            assert.equal(contentById.get(blank.targetInstanceId)?.package, packageId);
            assert.ok(blank.answer.length > 1, `${packageId} gerou uma resposta sem valor pedagógico.`);
            if (blank.responseMode === "choice") {
              assert.ok(blank.distractors.length > 0);
              assert.equal(new Set(blank.distractors).size, blank.distractors.length);
              assert.ok(blank.distractors.every((value) => !/^(?:não|outro)\s/iu.test(value)));
            }
          }
        } else {
          assert.ok(
            ["aralearn.resource.formula", "aralearn.resource.plane"].includes(packageId),
            `${packageId} deixou de praticar dentro do próprio resource.`
          );
          assert.equal(practice.response.package, "aralearn.response.choice");
          assert.doesNotMatch(
            practice.response.data.question,
            /(?:finalidade|para que serve|package|recurso utilizado)/iu
          );
          assert.ok(practice.response.data.options.length >= 3);
        }
      } else {
        assert.equal(practice.response.package, packageId);
        if (packageId === "aralearn.response.choice") {
          assert.ok(practice.response.data.options.length >= 4);
        }
        if (packageId === "aralearn.response.ordering") {
          assert.ok(practice.response.data.targets.length >= 4);
          const contentIds = new Set(practice.content.map(({ id }) => id));
          assert.ok(practice.response.data.targets.every(({ targetInstanceId }) => (
            contentIds.has(targetInstanceId)
          )));
          assert.equal(new Set(practice.response.data.targets.map(({ id }) => id)).size,
            practice.response.data.targets.length);
        }
      }
    });
  });

  assert.equal(coveredPackageIds.length, manifests.length);
  assert.deepEqual(new Set(coveredPackageIds), new Set(manifests.map(({ id }) => id)));
  assert.equal(new Set(coveredPackageIds).size, coveredPackageIds.length);
  assert.equal(studyUnitIds.size, manifests.length * 2);
});

test("dez Cursos correntes distinguem uso observado da cobertura do Curso de catálogo", async () => {
  assert.equal(CURRENT_COURSE_CORPUS.length, 10);
  const uses = new Map();
  for (const relativePath of CURRENT_COURSE_CORPUS) {
    const project = JSON.parse(await readFile(path.join(PROJECT_ROOT, relativePath), "utf8"));
    const validation = validateProjectDocument(project);
    assert.equal(validation.ok, true, relativePath);
    collectPackageUses(validation.value, uses);
  }
  assert.deepEqual(
    Object.fromEntries([...uses].sort(([left], [right]) => left.localeCompare(right, "en"))),
    EXPECTED_CURRENT_USES
  );
  assert.equal([...uses.values()].reduce((total, count) => total + count, 0), 10_388);

  const catalogPackages = new Set(
    buildResourceCatalogCourse().courses[0].modules.flatMap((moduleValue) => (
      moduleValue.lessons[0].microsequences.flatMap(({ covers }) => covers)
    ))
  );
  assert.equal(catalogPackages.size, 32);
  assert.deepEqual(
    catalogPackages,
    new Set(allManifests().map(({ id }) => id))
  );
  assert.equal([...catalogPackages].filter((packageId) => !uses.has(packageId)).length, 21);
});

test("descoberta progressiva limita busca, inspeção, contrato e bytes", () => {
  const manifests = allManifests();
  const explored = RESOURCE_CATALOG.explore();
  const defaultSearch = RESOURCE_CATALOG.search();
  assert.equal(defaultSearch.candidates.length, 8);
  assert.throws(() => RESOURCE_CATALOG.search({ limit: 9 }), /entre 1 e 8/u);

  const inspected = RESOURCE_CATALOG.inspect(manifests.slice(0, 8).map(({ id, version }) => ({
    packageId: id,
    version
  })));
  assert.equal(inspected.items.length, 8);
  assert.throws(() => RESOURCE_CATALOG.inspect(manifests.slice(0, 9).map(({ id, version }) => ({
    packageId: id,
    version
  }))), /entre 1 e 8/u);

  const searchCases = [
    {},
    ...explored.facets.structures.map(({ id }) => ({ structureIds: [id] })),
    ...explored.facets.disciplines.map(({ id }) => ({ disciplineIds: [id] }))
  ];
  const largestSearch = Math.max(...searchCases.map((intent) => (
    byteLength(RESOURCE_CATALOG.search({ ...intent, limit: 8 }))
  )));
  const contractBytes = manifests.map(({ id, version }) => byteLength(
    RESOURCE_CATALOG.contracts([{ packageId: id, version }])
  ));
  assert.ok(byteLength(explored) <= 10 * 1024);
  assert.ok(largestSearch <= 8 * 1024);
  assert.ok(byteLength(inspected) <= 16 * 1024);
  assert.ok(Math.max(...contractBytes) <= 16 * 1024);
  assert.ok(contractBytes.reduce((total, bytes) => total + bytes, 0) <= 200 * 1024);

  const substitute = RESOURCE_CATALOG.search({
    query: "árvore sintática",
    disciplineIds: ["discipline.language"],
    structureIds: ["structure.hierarchy"],
    notationIsLearningObject: true
  });
  assert.equal(substitute.coverage.status, "substitute");
  assert.equal(substitute.candidates[0].fit, "substitute");
  assert.match(substitute.coverage.chatDisclosure, /como aproximação/u);
  assert.ok(substitute.candidates[0].missing.length > 0);
});

test("saldo do MCP e do ambiente Edge permanece dentro dos limites correntes", async () => {
  const runtime = await javascriptRuntimeMetrics();
  assert.equal(COURSE_HUMAN_TASKS.length, 16);
  assert.ok(byteLength(COURSE_HUMAN_TASKS) <= 32_000);
  assert.equal(runtime.files, 51);
  assert.ok(runtime.bytes <= 560 * 1024);
});

test("documento registra uma decisão estática para cada pacote sem confundi-la com adequação", async () => {
  const document = await readFile(
    path.join(PROJECT_ROOT, "docs/auditoria-academica-dos-resources.md"),
    "utf8"
  );
  const rows = [...document.matchAll(
    /^\| `([a-z][a-z0-9_]*)` \| `(manter|restringir)` \|/gmu
  )].map((match) => ({ packageName: match[1], decision: match[2] }));
  assert.equal(rows.length, 32);
  assert.equal(new Set(rows.map(({ packageName }) => packageName)).size, 32);
  assert.deepEqual(
    new Set(rows.map(({ packageName }) => packageName)),
    new Set(allManifests().map(({ id }) => id.split(".").at(-1)))
  );
  assert.match(document, /adequação contextual/u);
  assert.match(document, /não mede eficácia/iu);
});
