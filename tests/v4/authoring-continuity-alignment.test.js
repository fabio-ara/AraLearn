import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  new URL(
    "../../supabase/migrations/20260723016000_authoring_concept_continuity.sql",
    import.meta.url
  ),
  "utf8"
);
const protocol = fs.readFileSync(
  new URL(
    "../../supabase/functions/_shared/aralearn-authoring/protocol.js",
    import.meta.url
  ),
  "utf8"
);

test("SQL e protocolo reconhecem foundation e worked_example como base causal", () => {
  assert.match(
    migration,
    /card->>'learningFunction'\s+in\s*\(\s*'foundation'\s*,\s*'worked_example'\s*\)/
  );
  assert.match(
    protocol,
    /card\.learningFunction\s*===\s*"foundation"\s*\|\|\s*card\.learningFunction\s*===\s*"worked_example"/
  );
});
