import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { prepareSingleCourseImport } from "../../src/ui/externalJsonImport.js";

const fixture = JSON.parse(fs.readFileSync(
  new URL("../fixtures/v4/project-minimal.json", import.meta.url),
  "utf8"
));

test("intercâmbio local aceita exatamente um curso AraLearn 4 válido", () => {
  const prepared = prepareSingleCourseImport(JSON.stringify(fixture), {
    sourceName: "curso.json"
  });
  assert.equal(prepared.detectedFormat, "contract");
  assert.equal(prepared.course.id, fixture.courses[0].id);

  const twoCourses = structuredClone(fixture);
  twoCourses.courses.push({ ...structuredClone(fixture.courses[0]), id: "outro-curso" });
  assert.throws(
    () => prepareSingleCourseImport(JSON.stringify(twoCourses)),
    /exatamente um curso/u
  );
});

test("intercâmbio local rejeita campo interno que seria perdido", () => {
  const project = structuredClone(fixture);
  const card = project.courses[0].modules[0].lessons[0].microsequences[0].cards[0];
  Object.assign(card, {
    resource: "graph",
    kind: "theory",
    exercise: "none",
    prompt: "Observe.",
    vertices: [{ id: "A", label: "A", color: "red" }],
    edges: []
  });
  delete card.text;
  assert.throws(
    () => prepareSingleCourseImport(JSON.stringify(project)),
    /vertices\[0\]\.color: Campo fora do schema/u
  );
});
