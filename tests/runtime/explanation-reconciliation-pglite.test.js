import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { explanationContentBasis, reconcileHumanExplanation } from
  "../../supabase/functions/_shared/aralearn-authoring/courseHumanMaterialization.js";
import { inspectExplanationReconciliation } from "../../src/domain/courseExplanationReconciliation.js";

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

test("reconciliação permanece vigente após JSONB e detecta alteração real da base", async () => {
  const db = new PGlite();
  try {
    const passages = ["Uma `ideia`.\n\nUma relação preservada.", "Outra ideia."];
    const authored = await reconcileHumanExplanation({ ...explanation, content: passages.map((text, index) => ({
      id: index ? "b" : "a", package: "aralearn.resource.paragraph", version: "1.0.0", data: { text }
    })) }, passages.map((trecho, index) => ({ recurso: index + 1,
      folha: "text", trecho, papel: "support", motivo: "Contexto de apoio explícito." })), {});
    const persisted = (await db.query("select $1::jsonb as explanation", [authored])).rows[0].explanation;
    const basis = await explanationContentBasis(persisted);
    assert.equal(basis, authored.reconciliation.contentBasis);
    assert.equal(inspectExplanationReconciliation(persisted, { contentBasis: basis }).ready, true);
    for (const change of [
      { ...persisted, title: "Título alterado" },
      { ...persisted, content: persisted.content.toReversed() },
      { ...persisted, content: persisted.content.map((item, index) => index ? item :
        { ...item, data: { text: "Uma ideia alterada." } }) }
    ]) {
      const changedBasis = await explanationContentBasis(change);
      assert.notEqual(changedBasis, basis);
      assert.ok(inspectExplanationReconciliation(change, { contentBasis: changedBasis }).blockers
        .some(blocker => blocker.code === "explanation_reconciliation_stale"));
    }
  } finally { await db.close(); }
});

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

test("guarda existente invalida só a declaração herdada do texto editado, sem manutenção de pares", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema private;
      create function private.valid_course_component_refs_in_content_v1(jsonb) returns boolean language sql as $$
        select not exists(select 1 from jsonb_array_elements($1->'content') b where b->>'package'<>'aralearn.resource.paragraph')$$;
      create function private.valid_course_explanation_plan_v1(jsonb) returns boolean language sql as $$select false$$;
      create table private.course_entities(entity_id text primary key,entity_type text,content jsonb,content_review jsonb);`);
    await db.exec(extract(await load("20260905101903_contextual_course_sources.sql"), "private.valid_course_source_links_shape_v2", "$fn$"));
    await db.exec(await load("20260916030020_explanation_reconciliation.sql"));
    const original = { title: "Microssequência", goal: "Distinguir as ideias", explanation: { ...explanation, reconciliation } };
    await db.query("insert into private.course_entities values('target','microsequence',$1,'{}'),('peer','microsequence',$1,'{}')", [original]);
    const read = async id => (await db.query("select content from private.course_entities where entity_id=$1", [id])).rows[0].content;
    await db.exec(await load("20260917225304_consistent_explanation_writes.sql"));
    await db.exec(`create trigger course_content_review_guard before insert or update on private.course_entities
      for each row execute function private.mark_course_content_review_v1()`);
    assert.deepEqual(await read("target"), original, "A migração não corrige nem recertifica registros antigos.");
    const changed = structuredClone(original);
    changed.explanation.content[0].data.text = "Uma ideia revista.";
    await db.query("update private.course_entities set content=$1 where entity_id='target'", [changed]);
    delete changed.explanation.reconciliation;
    assert.deepEqual(await read("target"), changed);
    assert.deepEqual(await read("peer"), original, "O conteúdo fora do alvo permanece literal.");
    const sameText = { ...original, goal: "Objetivo explicitado sem trocar o texto" };
    await db.query("update private.course_entities set content=$1 where entity_id='peer'", [sameText]);
    assert.deepEqual(await read("peer"), sameText, "Metadados antigos não são apagados por mudança fora da explicação.");
    const declared = await reconcileHumanExplanation(changed.explanation, [{ recurso: 1, folha: "text",
      trecho: changed.explanation.content[0].data.text, papel: "support", motivo: "Contexto de apoio explícito." }], {});
    await db.query("update private.course_entities set content=$1 where entity_id='target'", [{ ...changed, explanation: declared }]);
    assert.deepEqual((await read("target")).explanation, declared, "Uma declaração nova não é removida como se fosse herdada.");
    await assert.rejects(db.query("update private.course_entities set content_review='{" + '"basisHash":"invented"' + "}' where entity_id='target'"),
      error => error.code === "42501");
  } finally { await db.close(); }
});
