import test from "node:test";
import assert from "node:assert/strict";

import { assertScope } from "../../supabase/functions/_shared/aralearn-authoring/security.js";

test("escrita exige o escopo autoral explícito", () => {
  assert.doesNotThrow(() => assertScope(
    { scopes: ["authoring:write"] },
    "authoring:write"
  ));
  assert.throws(
    () => assertScope({ scopes: ["*"] }, "authoring:write"),
    (error) => error.status === 403 && error.code === "insufficient_scope"
  );
});
