import test from "node:test";
import assert from "node:assert/strict";

import {
  CONTRACT_KIND_PROJECT,
  CONTRACT_NAME,
  CONTRACT_VERSION
} from "../../src/contract/validateContract.js";
import { detectJsonExchangeFormat } from "../../src/storage/jsonExchange.js";

test("a troca JSON reconhece exclusivamente o contrato de projeto atual", () => {
  assert.equal(
    detectJsonExchangeFormat({
      contract: CONTRACT_NAME,
      version: CONTRACT_VERSION,
      kind: CONTRACT_KIND_PROJECT,
      courses: []
    }),
    "contract"
  );

  assert.throws(
    () => detectJsonExchangeFormat({
      contract: CONTRACT_NAME,
      version: CONTRACT_VERSION - 1,
      kind: CONTRACT_KIND_PROJECT,
      courses: []
    }),
    new RegExp(`version: ${CONTRACT_VERSION}`)
  );
});

test("a troca JSON reconhece o pacote de armazenamento atual", () => {
  assert.equal(detectJsonExchangeFormat({ format: "aralearn.storage" }), "storage");
});
