import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCHEMA_ROOT = path.join(ROOT, "authoring", "schemas");
const EXAMPLE_ROOT = path.join(ROOT, "authoring", "examples");

function readJson(root, name) {
  return JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
}

function planValidator() {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    allowUnionTypes: true
  });
  addFormats(ajv);
  for (const name of [
    "common.schema.json",
    "ledger-manifest.schema.json",
    "part-outline.schema.json",
    "plan.schema.json"
  ]) {
    ajv.addSchema(readJson(SCHEMA_ROOT, name));
  }
  return ajv.getSchema(
    "https://fabio-ara.github.io/AraLearn/authoring/schemas/plan.schema.json"
  );
}

test("plano exige uma política formal de representação por operação", () => {
  const validate = planValidator();
  const plan = readJson(EXAMPLE_ROOT, "02-plan.json");

  assert.equal(validate(plan), true, ajvMessage(validate));

  const missing = structuredClone(plan);
  delete missing.operations[0].representation;
  assert.equal(validate(missing), false);

  const emptyPreferred = structuredClone(plan);
  emptyPreferred.operations[0].representation.preferredResources = [];
  assert.equal(validate(emptyPreferred), false);

  const tooManyPreferred = structuredClone(plan);
  tooManyPreferred.operations[0].representation.preferredResources = [
    "paragraph", "choice", "composite", "code", "table"
  ];
  assert.equal(validate(tooManyPreferred), false);

  const unknownResource = structuredClone(plan);
  unknownResource.operations[0].representation.allowedResources = ["video"];
  assert.equal(validate(unknownResource), false);
});

function ajvMessage(validate) {
  return (validate.errors || [])
    .map((error) => `${error.instancePath || "$"} ${error.message}`)
    .join("; ");
}
