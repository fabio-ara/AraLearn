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

  const microsequencePlansByLessonKey = new Map(
    (Array.isArray(architectureDraft?.microsequencePlans) ? architectureDraft.microsequencePlans : [])
      .map((entry) => [text(entry?.lessonKey), entry])
      .filter(([lessonKey]) => lessonKey)
  );

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
      const lessonMicrosequencePlan = microsequencePlansByLessonKey.get(text(lesson?.key));
      (Array.isArray(lessonMicrosequencePlan?.microsequences) ? lessonMicrosequencePlan.microsequences : []).forEach((microsequence) => {
        const publicCards = Array.isArray(microsequence?.publicCards)
          ? structuredClone(microsequence.publicCards)
          : Array.isArray(microsequence?.cards)
            ? structuredClone(microsequence.cards)
            : [];
        operations.push({
          op: "add_microsequence",
          courseKey: text(course.key),
          moduleKey: text(moduleValue.key) || "",
          lessonKey: text(lesson?.key) || "",
          microsequence: {
            key: text(microsequence?.key),
            title: text(microsequence?.title) || "Nova microssequência",
            description: text(microsequence?.description || microsequence?.objective),
            status: publicCards.length ? "ready" : "draft",
            included: publicCards.length > 0,
            tags: Array.isArray(microsequence?.tags) ? microsequence.tags.map(text).filter(Boolean) : [],
            domainRefs: Array.isArray(microsequence?.domainRefs) ? microsequence.domainRefs.map(text).filter(Boolean) : [],
            practiceVariantRefs: Array.isArray(microsequence?.practiceVariantRefs) ? microsequence.practiceVariantRefs.map(text).filter(Boolean) : [],
            didacticPurpose: text(microsequence?.didacticPurpose || microsequence?.objective),
            coverageRole: text(microsequence?.coverageRole),
            ...(publicCards.length ? { cards: publicCards } : {})
          }
        });
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
