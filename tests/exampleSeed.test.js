import test from "node:test";
import assert from "node:assert/strict";

import { createExampleProjectDocument } from "../src/ui/exampleProjectDocument.js";
import {
  EXAMPLE_SEED_VERSION,
  getExampleSeedSignature,
  shouldHydrateExampleSeed,
  shouldStoreExampleSeedMetadata
} from "../src/ui/exampleSeed.js";

test("hidrata seed quando ainda não existe projeto local", () => {
  const seedProject = createExampleProjectDocument();
  const currentSeedSignature = getExampleSeedSignature(seedProject);

  assert.equal(
    shouldHydrateExampleSeed({
      project: null,
      storedSeedVersion: "",
      storedSeedSignature: "",
      currentSeedSignature
    }),
    true
  );
});

test("hidrata seed apenas quando o projeto atual ainda coincide com a assinatura antiga", () => {
  const seedProject = createExampleProjectDocument();
  const storedSeedSignature = getExampleSeedSignature(seedProject);

  assert.equal(
    shouldHydrateExampleSeed({
      project: seedProject,
      storedSeedVersion: "contract-runtime-directory-tree-v3",
      storedSeedSignature,
      currentSeedSignature: "assinatura-nova"
    }),
    true
  );
});

test("nao hidrata seed quando o projeto divergiu ou quando falta assinatura anterior", () => {
  const seedProject = createExampleProjectDocument();
  const changedProject = structuredClone(seedProject);
  changedProject.courses.push({
    key: "course-importado",
    title: "Curso importado",
    modules: [
      {
        key: "module-importado",
        title: "Módulo importado",
        lessons: [
          {
            key: "lesson-importada",
            title: "Lição importada",
            microsequences: [
              {
                key: "microsequence-importada",
                title: "Microssequência importada",
                cards: [{ key: "card-importado", type: "text", text: "Conteúdo importado" }]
              }
            ]
          }
        ]
      }
    ]
  });

  assert.equal(
    shouldHydrateExampleSeed({
      project: changedProject,
      storedSeedVersion: "contract-runtime-directory-tree-v3",
      storedSeedSignature: getExampleSeedSignature(seedProject),
      currentSeedSignature: "assinatura-nova"
    }),
    false
  );

  assert.equal(
    shouldHydrateExampleSeed({
      project: seedProject,
      storedSeedVersion: "contract-runtime-directory-tree-v3",
      storedSeedSignature: "",
      currentSeedSignature: "assinatura-nova"
    }),
    false
  );
});

test("atualiza metadados do seed quando o projeto atual ainda e exatamente o seed oficial", () => {
  const seedProject = createExampleProjectDocument();
  const currentSeedSignature = getExampleSeedSignature(seedProject);

  assert.equal(
    shouldStoreExampleSeedMetadata({
      project: seedProject,
      storedSeedVersion: "",
      storedSeedSignature: "",
      currentSeedSignature
    }),
    true
  );

  assert.equal(
    shouldStoreExampleSeedMetadata({
      project: seedProject,
      storedSeedVersion: EXAMPLE_SEED_VERSION,
      storedSeedSignature: currentSeedSignature,
      currentSeedSignature
    }),
    false
  );
});
