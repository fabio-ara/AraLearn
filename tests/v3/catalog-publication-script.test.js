import test from "node:test";
import assert from "node:assert/strict";

import { assertPublicationReady } from "../../scripts/publishCatalogFixtures.mjs";

function courseWithStatus(status) {
  return {
    id: "course-publication-test",
    modules: [{
      id: "module-publication-test",
      lessons: [{
        id: "lesson-publication-test",
        microsequences: [{ id: "micro-publication-test", status, cards: [{ id: "card-publication-test" }] }]
      }]
    }]
  };
}

test("a publicação administrativa aceita somente microssequências ready", () => {
  assert.doesNotThrow(() => assertPublicationReady(courseWithStatus("ready"), "fixture-ready.json"));
  assert.throws(
    () => assertPublicationReady(courseWithStatus("generated"), "fixture-generated.json"),
    /fixture-generated\.json não está pronta para publicação: 1 microssequência\(s\) sem status ready/u
  );
});
