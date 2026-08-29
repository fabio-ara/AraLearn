import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const fixtureUrl = new URL(
  "../fixtures/conversational-authoring-resumption.v1.json",
  import.meta.url
);

test("fixture conversacional Dataprev é sintética, segura e cobre a retomada planejada", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));

  assert.equal(fixture.contract, "aralearn.conversational-authoring-regression.v1");
  assert.deepEqual(fixture.safety, {
    synthetic: true,
    mutableTargetAllowed: false,
    liveCourseLookupAllowed: false,
    pdfBytes: "generated-minimal-pdf-only"
  });
  assert.equal(fixture.course.title, "Dataprev: Gestão de Servidores");
  assert.equal(fixture.course.plan.complete, false);
  assert.equal(fixture.course.plan.partCount, 12);
  assert.equal(fixture.course.plan.parts.length, 12);
  assert.equal(fixture.course.materializationCount, 0);
  assert.deepEqual(fixture.sources.map(({ key }) => key), [
    "edital", "prova", "gabarito", "ppc"
  ]);
  assert.deepEqual(
    fixture.sources.flatMap(({ anchors }) => anchors.map(({ humanLocator }) => humanLocator)),
    ["p. 44", "questões 45–51", "questões 45–51", "pp. 112–114", "pp. 123–124"]
  );
  assert.ok(fixture.sources.every(({ title, pdfFileName }) =>
    /fixture sintética/u.test(title) && pdfFileName.startsWith("fixture-") &&
    pdfFileName.endsWith(".pdf")));
  assert.equal(fixture.resumption.expected.doesNotExpose.includes("requestId"), true);
  assert.deepEqual(fixture.fileIntentCases.map(({ expected }) => expected), [
    "ingest", "do_not_persist", "ask_once", "ingest"
  ]);
});
