import test from "node:test";
import assert from "node:assert/strict";

import { normalizeGuide, GUIDE_LEVELS } from "../../src/sourceGuides/sourceGuideStructured.js";
import { getEmbeddedSeedProjectFixture } from "../support/embeddedCatalogFixture.js";

test("a normalização preserva todas as listas da fonte-guia", () => {
  const guide = normalizeGuide({
    goal: "Delimitar o tema.",
    include: ["conceito central"],
    exclude: ["tópico avançado"],
    notation: ["usar a notação definida"],
    avoid: ["antecipar conteúdo"]
  }, { level: GUIDE_LEVELS.LESSON });

  assert.deepEqual(guide, {
    goal: "Delimitar o tema.",
    include: ["conceito central"],
    exclude: ["tópico avançado"],
    notation: ["usar a notação definida"],
    avoid: ["antecipar conteúdo"]
  });
});

test("o catálogo validado mantém as orientações do campo avoid", () => {
  const project = getEmbeddedSeedProjectFixture();
  const avoidEntries = project.courses.flatMap((course) =>
    course.modules.flatMap((moduleValue) => [
      ...(moduleValue.guide?.avoid || []),
      ...moduleValue.lessons.flatMap((lesson) => lesson.guide?.avoid || [])
    ])
  );

  assert.ok(avoidEntries.length > 0);
});
