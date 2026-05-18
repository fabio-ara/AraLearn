import test from "node:test";
import assert from "node:assert/strict";

import { getCourseForgePhaseResponseSchema } from "../src/generation/courseForge/courseForgePhaseResponseSchemas.js";

test("phase response schemas expõem contrato mínimo para plan_architecture e audits", () => {
  const architectureSchema = getCourseForgePhaseResponseSchema("plan_architecture");
  assert.equal(architectureSchema.type, "object");
  assert.deepEqual(Object.keys(architectureSchema.properties).sort(), ["architectureDraft", "patch"]);

  const auditSchema = getCourseForgePhaseResponseSchema("audit_architecture");
  assert.equal(auditSchema.type, "object");
  assert.equal(auditSchema.properties.approved.type, "boolean");
  assert.equal(auditSchema.properties.blockingIssues.type, "array");
  assert.equal(auditSchema.properties.warnings.type, "array");
});

test("phase response schemas retornam null quando a fase não tem contrato estruturado próprio", () => {
  assert.equal(getCourseForgePhaseResponseSchema("index_sources"), null);
});
