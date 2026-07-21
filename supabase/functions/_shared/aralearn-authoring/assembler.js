import { AuthoringApiError } from "./errors.js";
import { assertFragmentMatchesSpecification } from "./canonical.js";

function clone(value) {
  return structuredClone(value);
}

function findById(values, id, label) {
  const found = (values || []).find((value) => value?.id === id);
  if (!found) {
    throw new AuthoringApiError(422, "invalid_part_target", `${label} ${id} não existe no plano.`);
  }
  return found;
}

function partMicrosequences(part) {
  const fragment = part.fragment;
  if (!fragment || typeof fragment !== "object") return [];
  if (Array.isArray(fragment.microsequences)) return fragment.microsequences;
  if (fragment.microsequence) return [fragment.microsequence];
  if (Array.isArray(fragment.cards)) return [fragment];
  return [];
}

function mergePart(document, part, assignedMicrosequences) {
  const specification = part.specification || {};
  const fragment = part.fragment || {};
  assertFragmentMatchesSpecification(fragment, specification);
  const ownership = specification.ownership || {};
  const courseId = fragment.courseId || ownership.courseId;
  const moduleId = fragment.moduleId || ownership.moduleId;
  const lessonId = fragment.lessonId || ownership.lessonId;
  if (!courseId || !moduleId || !lessonId) {
    throw new AuthoringApiError(
      422,
      "invalid_part_target",
      `A parte ${part.partKey || part.key || "sem chave"} não identifica curso, módulo e lição.`
    );
  }
  const course = findById(document.courses, courseId, "Curso");
  const moduleValue = findById(course.modules, moduleId, "Módulo");
  const lesson = findById(moduleValue.lessons, lessonId, "Lição");
  if (!Array.isArray(lesson.microsequences)) lesson.microsequences = [];
  for (const microsequence of partMicrosequences(part)) {
    if (assignedMicrosequences.has(microsequence.id)) {
      throw new AuthoringApiError(
        422,
        "duplicate_microsequence_part",
        `A microssequência ${microsequence.id} foi entregue em mais de uma parte.`
      );
    }
    assignedMicrosequences.add(microsequence.id);
    const approvedMicrosequence = { ...clone(microsequence), status: "ready" };
    const index = lesson.microsequences.findIndex((value) => value.id === microsequence.id);
    if (index >= 0) lesson.microsequences[index] = approvedMicrosequence;
    else lesson.microsequences.push(approvedMicrosequence);
  }
}

export function assembleAuthoringRun(run) {
  const parts = Array.isArray(run?.parts) ? run.parts : [];
  if (!parts.length || parts.some((part) => part.status !== "approved" || !part.fragment)) {
    throw new AuthoringApiError(
      409,
      "course_incomplete",
      "Todas as partes precisam estar aprovadas antes da validação."
    );
  }

  const plannedProject = run?.plan?.project || run?.plan?.document;
  if (!plannedProject || plannedProject.contract !== "aralearn.contract") {
    throw new AuthoringApiError(
      422,
      "missing_project_skeleton",
      "O plano deve conter project com a estrutura do curso."
    );
  }
  const document = clone(plannedProject);
  const assignedMicrosequences = new Set();
  for (const part of [...parts].sort((left, right) => left.position - right.position)) {
    mergePart(document, part, assignedMicrosequences);
  }
  return document;
}
