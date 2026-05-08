import test from "node:test";
import assert from "node:assert/strict";

import { createExampleProjectDocument } from "../src/ui/exampleProjectDocument.js";
import {
  EXAMPLE_SEED_VERSION,
  shouldHydrateExampleSeed,
  shouldStoreExampleSeedMetadata
} from "../src/ui/exampleSeed.js";

test("hidrata o conteúdo inicial quando ainda não existe projeto local", () => {
  assert.equal(
    shouldHydrateExampleSeed({
      project: null,
      storedSeedVersion: ""
    }),
    true
  );
});

test("não hidrata o conteúdo inicial quando já existe projeto local", () => {
  assert.equal(
    shouldHydrateExampleSeed({
      project: createExampleProjectDocument(),
      storedSeedVersion: "contract-runtime-directory-tree-v3"
    }),
    false
  );
});

test("não hidrata o conteúdo inicial quando a versão atual já foi registrada", () => {
  assert.equal(
    shouldHydrateExampleSeed({
      project: null,
      storedSeedVersion: EXAMPLE_SEED_VERSION
    }),
    false
  );
});

test("grava metadados do conteúdo inicial quando existe projeto e a versão ainda não foi registrada", () => {
  const seedProject = createExampleProjectDocument();

  assert.equal(
    shouldStoreExampleSeedMetadata({
      project: seedProject,
      storedSeedVersion: ""
    }),
    true
  );
});

test("não grava metadados do conteúdo inicial quando a versão atual já foi registrada", () => {
  assert.equal(
    shouldStoreExampleSeedMetadata({
      project: createExampleProjectDocument(),
      storedSeedVersion: EXAMPLE_SEED_VERSION
    }),
    false
  );
});
