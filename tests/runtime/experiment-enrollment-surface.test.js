import assert from "node:assert/strict";
import test from "node:test";

import { consumeExperimentEnrollmentFragment } from "../../src/ui/ExperimentEnrollmentSurface.js";

test("fragmento de ingresso é consumido uma vez sem persistir o código na URL", () => {
  const locationValue = {
    pathname: "/estudo",
    search: "?tema=escuro",
    hash: "#experiment=ESTUDO_2026-A&painel=trilhas"
  };
  const calls = [];
  const historyValue = {
    state: { route: "study" },
    replaceState(...args) { calls.push(args); }
  };

  assert.equal(consumeExperimentEnrollmentFragment({ locationValue, historyValue }), "ESTUDO_2026-A");
  assert.deepEqual(calls, [[{ route: "study" }, "", "/estudo?tema=escuro#painel=trilhas"]]);
});

test("fragmento curto ou unicode é limpo e nunca vira código de ingresso", () => {
  for (const hash of ["#experiment=curto", "#experiment=ESTUDO-á-2026"]) {
    const calls = [];
    const code = consumeExperimentEnrollmentFragment({
      locationValue: { pathname: "/", search: "", hash },
      historyValue: { replaceState(...args) { calls.push(args); } }
    });
    assert.equal(code, "");
    assert.equal(calls.length, 1);
    assert.equal(calls[0][2], "/");
  }
});
