import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  new URL("../../supabase/migrations/20260725011000_authoring_catalog_submission_control.sql", import.meta.url),
  "utf8"
);

test("controle MCP de ofertas valida cliente, preserva idempotência e limita RPCs à service role", () => {
  for (const required of [
    "catalog_submission_authoring_receipts",
    "require_catalog_submission_authoring_client",
    "begin_catalog_submission_authoring_command",
    "set_config('request.jwt.claim.sub'",
    "submit_personal_course_to_catalog_authoring",
    "withdraw_catalog_submission_authoring",
    "start_catalog_submission_review_authoring",
    "decide_catalog_submission_authoring",
    "to service_role"
  ]) {
    assert.ok(migration.includes(required), `ausente: ${required}`);
  }
  assert.match(migration, /'authoring:private:read', 'authoring:private:write', 'catalog:publish'/u);
  assert.match(migration, /requestId já foi usado com outro comando de oferta ao catálogo/u);
  assert.match(migration, /revoke all on function public\.decide_catalog_submission_authoring[\s\S]+from public, anon, authenticated/u);
});
