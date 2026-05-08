import test from "node:test";
import assert from "node:assert/strict";

import { detectJsonExchangeFormat } from "../src/storage/jsonExchange.js";

test("detecta contrato de curso isolado", () => {
  assert.equal(
    detectJsonExchangeFormat({
      contract: "aralearn.contract",
      version: 1,
      kind: "project",
      courses: []
    }),
    "contract"
  );
});

test("detecta backup completo do aplicativo", () => {
  assert.equal(
    detectJsonExchangeFormat({
      format: "aralearn.storage",
      project: { contract: "aralearn.contract", courses: [] },
      progress: { version: 1, lessons: {} }
    }),
    "storage"
  );
});

test("rejeita JSON que nao corresponde a curso nem backup", () => {
  assert.throws(
    () => detectJsonExchangeFormat({ foo: "bar" }),
    /aralearn\.contract|aralearn\.storage/
  );
});
