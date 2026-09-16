import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const load = name => fs.readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
function extract(source, name, delimiter = "$function$") {
  const start = new RegExp(`create(?: or replace)? function ${name.replaceAll(".", "\\.")}\\(`, "u").exec(source)?.index;
  assert.ok(start >= 0);
  return source.slice(start, source.indexOf(`${delimiter};`, start) + `${delimiter};`.length);
}
const explanation = { title: "Base preservada", content: [{ id: "a", package: "aralearn.resource.paragraph", version: "1.0.0", data: { text: "Uma ideia." } }] };
const reconciliation = { contract: "aralearn.explanation-reconciliation.v1", contentBasis: "a".repeat(64), entries: [{
  resourceId: "a", path: "text", quote: "Uma ideia.", prefix: null, suffix: null, role: "introduced",
  analysisUnitIds: ["idea-a"], evidenceRequirementIds: [], destinationMicrosequenceId: null, reason: "Ideia introduzida aqui." }] };

test("upgrade aceita declaração estrutural e conserva legado/base antiga sem validar prontidão por SQL", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema private;
      create function private.valid_course_component_refs_in_content_v1(jsonb) returns boolean language sql as $$
        select not exists(select 1 from jsonb_array_elements($1->'content') b where b->>'package'<>'aralearn.resource.paragraph')$$;`);
    await db.exec(extract(await load("20260905101903_contextual_course_sources.sql"), "private.valid_course_source_links_shape_v2", "$fn$"));
    await db.exec(extract(await load("20260907222912_shared_explanations_human_content_review.sql"), "private.valid_course_explanation_v1"));
    const valid = async value => (await db.query("select private.valid_course_explanation_v1($1) valid", [value])).rows[0].valid;
    assert.equal(await valid(explanation), true);
    assert.equal(await valid({ ...explanation, reconciliation }), false);
    await db.exec("create table private.fixture_explanations(id text primary key,content jsonb check(private.valid_course_explanation_v1(content)))");
    await db.query("insert into private.fixture_explanations values('legacy',$1)", [explanation]);
    await db.exec(await load("20260916030020_explanation_reconciliation.sql"));
    assert.deepEqual((await db.query("select content from private.fixture_explanations")).rows[0].content, explanation);
    assert.equal(await valid({ ...explanation, reconciliation }), true);
    const changed = { ...explanation, title: "Edição humana vigente", reconciliation };
    await db.query("update private.fixture_explanations set content=$1 where id='legacy'", [changed]);
    assert.deepEqual((await db.query("select content from private.fixture_explanations")).rows[0].content, changed);
    for (const change of [{ path: "__proto__.text" }, { prefix: "x".repeat(501) }, { resourceId: "x".repeat(241) },
      { role: "unknown" }, { analysisUnitIds: [] }, { reason: " " }, { extra: true }]) {
      assert.equal(await valid({ ...explanation, reconciliation: { ...reconciliation,
        entries: [{ ...reconciliation.entries[0], ...change }] } }), false);
    }
    assert.equal(await valid({ ...explanation, reconciliation: null }), false);
    assert.equal(await valid({ ...explanation, response: {} }), false);
  } finally { await db.close(); }
});
