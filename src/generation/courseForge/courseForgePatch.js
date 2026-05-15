import { patchTargetWithinScope, resolveCourseForgeScope } from "./courseForgeScope.js";
import { COURSE_FORGE_PATCH_TYPE } from "./courseForgeSchemas.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOperation(operation = {}) {
  return {
    ...structuredClone(operation),
    op: text(operation.op)
  };
}

export function compileCourseStructureToPatch({ intent, architectureDraft }) {
  if (architectureDraft?.patch) {
    return structuredClone(architectureDraft.patch);
  }

  const course = architectureDraft?.course;
  if (!course) {
    throw new Error("Arquitetura sem curso para compilar patch.");
  }

  const operations = [
    {
      op: "add_course",
      course: {
        key: text(course.key),
        title: text(course.title) || "Novo curso",
        description: text(course.description),
        modules: []
      }
    }
  ];

  (course.modules || []).forEach((moduleValue) => {
    operations.push({
      op: "add_module",
      courseKey: text(course.key),
      module: {
        key: text(moduleValue.key),
        title: text(moduleValue.title) || "Novo módulo",
        description: text(moduleValue.description)
      }
    });
    (moduleValue.lessons || []).forEach((lesson) => {
      operations.push({
        op: "add_lesson",
        courseKey: text(course.key),
        moduleKey: text(moduleValue.key) || "",
        lesson: structuredClone(lesson)
      });
    });
  });

  return {
    patchType: COURSE_FORGE_PATCH_TYPE,
    target: structuredClone(intent?.scope || { level: "project" }),
    operations
  };
}

export function validateCourseForgePatch(patch = {}, { intent = {} } = {}) {
  const errors = [];
  if (patch?.patchType !== COURSE_FORGE_PATCH_TYPE) {
    errors.push(`patchType inválido: ${patch?.patchType || ""}.`);
  }

  const operations = Array.isArray(patch?.operations) ? patch.operations.map(normalizeOperation) : [];
  if (!operations.length) {
    errors.push("Patch sem operações.");
  }

  const scope = resolveCourseForgeScope(intent);
  operations.forEach((operation, index) => {
    if (!operation.op) {
      errors.push(`operations[${index}] sem op.`);
      return;
    }
    const target = {
      courseKey: text(operation.courseKey || patch?.target?.courseKey),
      moduleKey: text(operation.moduleKey || patch?.target?.moduleKey),
      lessonKey: text(operation.lessonKey || patch?.target?.lessonKey),
      microsequenceKey: text(operation.microsequenceKey || patch?.target?.microsequenceKey)
    };
    if (!patchTargetWithinScope(scope, target) && operation.op !== "add_course") {
      errors.push(`operations[${index}] toca fora do escopo selecionado.`);
    }
  });

  return {
    ok: errors.length === 0,
    errors,
    patch: {
      patchType: patch?.patchType,
      target: structuredClone(patch?.target || {}),
      operations
    }
  };
}
