import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildResourceCatalogCourse,
  RESOURCE_CATALOG_COURSE_PATH,
  serializeResourceCatalogCourse
} from "../../scripts/buildResourceCatalogCourse.mjs";
import { validateProjectDocument } from "../../src/domain/aralearnProject.js";
import { RESOURCE_CATALOG } from "../../src/resources/catalog/resourceCatalog.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../../src/resources/packages/index.js";

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

test("curso apresenta operações cognitivas com rótulos pedagógicos, não ids internos", async () => {
  const course = await buildResourceCatalogCourse();
  const serialized = JSON.stringify(course);
  for (const internalId of [
    "annotate", "inspect-code", "locate-coordinate", "trace-control-flow"
  ]) {
    assert.doesNotMatch(serialized, new RegExp(`operação cognitiva[^.]*${internalId}`, "iu"));
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
  const cardIds = new Set();

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
      assert.equal(microsequence.cards.length, 2);
      const [theory, practice] = microsequence.cards;
      assert.equal(theory.position, 1);
      assert.equal(theory.role, "theory");
      assert.equal(theory.response, null);
      assert.ok(theory.content.length > 0);
      assert.equal(practice.position, 2);
      assert.equal(practice.role, "practice");
      assert.ok(practice.response);
      assert.ok(practice.feedback.length > 0);

      for (const card of microsequence.cards) {
        assert.equal(cardIds.has(card.id), false, `card duplicado: ${card.id}`);
        cardIds.add(card.id);
      }
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
        if (packageId === "aralearn.response.matching") {
          assert.ok(practice.response.data.leftItems.length >= 4);
          assert.ok(practice.response.data.rightItems.length >= 4);
        }
        if (packageId === "aralearn.response.ordering") {
          assert.ok(practice.response.data.items.length >= 4);
          assert.notDeepEqual(
            practice.response.data.items.map(({ id }) => id),
            practice.response.data.answerOrder,
            "A prática de ordenação não pode começar resolvida."
          );
        }
      }
    });
  });

  assert.equal(coveredPackageIds.length, manifests.length);
  assert.deepEqual(new Set(coveredPackageIds), new Set(manifests.map(({ id }) => id)));
  assert.equal(new Set(coveredPackageIds).size, coveredPackageIds.length);
  assert.equal(cardIds.size, manifests.length * 2);
});
