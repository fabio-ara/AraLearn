import test from "node:test";
import assert from "node:assert/strict";

import { buildScopeErrors, buildScopePacket, detectExcludedTerms, validateCardScope } from "../../src/generation/engine/scopeGuard.js";

test("scopeGuard bloqueia exclude", () => {
  const packet = buildScopePacket({
    guide: {
      include: ["matriz"],
      exclude: ["determinante"]
    },
    microsequence: {
      covers: ["matriz"]
    }
  });
  const card = {
    title: "Determinante",
    text: "Fale sobre determinante."
  };
  assert.deepEqual(detectExcludedTerms(card, packet), ["determinante"]);
  const validation = validateCardScope(card, packet);
  assert.equal(validation.ok, false);
  assert.match(buildScopeErrors({ cardErrors: validation.errors }).join("\n"), /determinante/);
});
