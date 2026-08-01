import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { auditDocumentation } from "../../scripts/auditDocumentation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("documentação pública possui links, índice e exemplos neutros", () => {
  assert.deepEqual(auditDocumentation({ root }), []);
});

