import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLessonGuidanceEditorFields,
  buildLessonGuidanceFromPreset,
  normalizeLessonGuidance
} from "../src/generation/guidance/lessonGuidance.js";

test("buildLessonGuidanceFromPreset devolve defaults humanos do modo escolhido", () => {
  const guidance = buildLessonGuidanceFromPreset("visual");

  assert.deepEqual(guidance, {
    presetId: "visual",
    resourceTags: ["paragraph", "multiple_choice", "table", "matrix", "plane", "graph", "flowchart", "tree"],
    contentTypeTags: ["comparison", "interpretation", "classification"],
    learningActionTags: ["understand", "compare"],
    supportLevel: "guided"
  });
});

test("normalizeLessonGuidance preserva ajuste fino explícito sobre o preset", () => {
  const guidance = normalizeLessonGuidance({
    presetId: "code",
    resourceTags: ["paragraph", "code_editor"],
    contentTypeTags: ["tool_use"],
    learningActionTags: ["use_tool"],
    supportLevel: "intermediate"
  });

  assert.deepEqual(guidance, {
    presetId: "code",
    resourceTags: ["paragraph", "code_editor"],
    contentTypeTags: ["tool_use"],
    learningActionTags: ["use_tool"],
    supportLevel: "intermediate"
  });
});

test("buildLessonGuidanceEditorFields destaca modo pronto e rebaixa ajuste fino", () => {
  const fields = buildLessonGuidanceEditorFields({ presetId: "review" });
  const presetField = fields[0];

  assert.equal(presetField.label, "Modo da lição");
  assert.match(presetField.hint, /modo pronto/i);
  assert.equal(fields[1].tone, "secondary");
  assert.equal(fields[2].tone, "secondary");
  assert.equal(fields[3].tone, "secondary");
  assert.equal(fields[4].tone, "secondary");
});
