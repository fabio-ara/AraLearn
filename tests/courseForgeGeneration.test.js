import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCourseForgePhaseModelOverrides,
  resolveCourseForgeGenerationScope,
  resolveCourseForgeNavigationTarget,
  summarizeCourseForgeTopDownResult
} from "../src/ui/courseForgeGeneration.js";

test("resolveCourseForgeGenerationScope usa o menor escopo existente", () => {
  assert.deepEqual(
    resolveCourseForgeGenerationScope({
      course: { key: "course-a" },
      moduleValue: { key: "module-a" },
      lesson: { key: "lesson-a" }
    }),
    {
      level: "lesson",
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a"
    }
  );

  assert.deepEqual(
    resolveCourseForgeGenerationScope({
      course: { key: "course-a" },
      moduleValue: { key: "module-a" },
      lesson: null
    }),
    {
      level: "module",
      courseKey: "course-a",
      moduleKey: "module-a"
    }
  );

  assert.deepEqual(resolveCourseForgeGenerationScope({}), { level: "project" });
});

test("buildCourseForgePhaseModelOverrides fixa o mesmo modelo nas fases roteáveis", () => {
  const overrides = buildCourseForgePhaseModelOverrides("gemini-2.5-flash");

  assert.equal(overrides.plan_architecture, "gemini-2.5-flash");
  assert.equal(overrides.repair_cards, "gemini-2.5-flash");
  assert.equal(overrides.repair_card_adherence, "gemini-2.5-flash");
});

test("resolveCourseForgeNavigationTarget usa patch e fallback do projeto final", () => {
  const target = resolveCourseForgeNavigationTarget({
    patch: {
      target: {
        courseKey: "course-a",
        moduleKey: "module-a",
        lessonKey: "lesson-a"
      }
    },
    projectDocument: {
      courses: [
        {
          key: "course-a",
          modules: [
            {
              key: "module-a",
              lessons: [{ key: "lesson-a" }]
            }
          ]
        }
      ]
    }
  });

  assert.deepEqual(target, {
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-a"
  });
});

test("summarizeCourseForgeTopDownResult resume patch aplicado", () => {
  assert.deepEqual(
    summarizeCourseForgeTopDownResult({
      patch: {
        operations: [{}, {}],
        events: [{}]
      }
    }),
    {
      message: "Fluxo top-down aplicado com 2 operações e 1 evento auditável.",
      openActionLabel: "Abrir em Cursos"
    }
  );
});
