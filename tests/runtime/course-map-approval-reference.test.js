import test from "node:test";
import assert from "node:assert/strict";
import { createMapApprovalReference, openMapApprovalReference } from "../../supabase/functions/_shared/aralearn-authoring/courseMapApproval.js";

const principal = { actorId: "10000000-0000-4000-8000-000000000001" };
const courseId = "20000000-0000-4000-8000-000000000001";
const basis = { courseRevision: 7, planVersion: 4, basisHash: "a".repeat(64) };

test("aprovação conserva base, ator e identidade para reconciliar perda de resposta", () => {
  const reference = createMapApprovalReference({ principal, courseId, basis });
  assert.ok(reference.length < 600);
  const opened = openMapApprovalReference(reference, principal);
  assert.deepEqual(opened, { actor: principal.actorId, courseId, ...basis, requestId: opened.requestId });
  assert.deepEqual(openMapApprovalReference(reference, principal), opened);
  assert.equal(createMapApprovalReference({ principal, courseId, basis }), reference,
    "Fragmentos sucessivos da mesma leitura conservam a referência e o hash do contexto.");
  assert.throws(() => openMapApprovalReference(reference, { actorId: courseId }), /referência/u);
});

test("referência não aceita estrutura arbitrária, revisão inválida ou substituição de identidade", () => {
  for (const value of ["", "{mapa:1}", "a".repeat(2049), btoa(JSON.stringify({ actor: principal.actorId }))]) {
    assert.throws(() => openMapApprovalReference(value, principal), /referência/u);
  }
  assert.throws(() => createMapApprovalReference({ principal, courseId, basis: { ...basis, planVersion: 0 } }));
  assert.throws(() => createMapApprovalReference({ principal, courseId, basis, requestId: "outro" }));
});
