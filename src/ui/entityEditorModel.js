import {
  collectDependencyCandidates,
  findCourse,
  findLesson,
  findMicrosequence,
  findModule
} from "./lessonEditorPaths.js";

export const MICROSEQUENCE_ROLE_OPTIONS = Object.freeze([
  { id: "explain", label: "Explicar" },
  { id: "practice", label: "Praticar" },
  { id: "review", label: "Revisar" },
  { id: "support", label: "Apoio" }
]);

function metadataFields(entity, description) {
  return [
    { name: "title", label: "Título", type: "text", value: entity.title || "" },
    { name: "description", label: "Descrição", type: "textarea", value: description || "" }
  ];
}

function resolveCoursePermissions(state, courseKey) {
  const fallback = { role: "owner", canEdit: true, canDelete: true };
  if (!courseKey) return fallback;
  const permissionsById = state?.coursePermissionsById;
  const permissions = permissionsById instanceof Map
    ? permissionsById.get(courseKey)
    : permissionsById?.[courseKey];
  return permissions || state?.coursePermissions || fallback;
}

export function buildEntityEditorModel(state = {}) {
  const { project, selection = {}, entityEditor } = state;
  if (!entityEditor) return null;

  const courseKey = entityEditor.courseKey || selection.courseKey;
  const permissions = resolveCoursePermissions(state, courseKey);
  const course = findCourse(project, courseKey);

  if (entityEditor.kind === "course-metadata" || entityEditor.kind === "course") {
    if (!course || !permissions.canEdit) return null;
    return {
      title: "Curso",
      fields: metadataFields(course, course.goal),
      actions: []
    };
  }

  const moduleValue = findModule(project, courseKey, entityEditor.moduleKey);
  if (entityEditor.kind === "module") {
    if (!moduleValue || !permissions.canEdit) return null;
    return {
      title: "Módulo",
      fields: metadataFields(moduleValue, moduleValue.guide?.goal),
      actions: []
    };
  }

  const lesson = findLesson(project, courseKey, entityEditor.moduleKey, entityEditor.lessonKey);
  if (entityEditor.kind === "lesson") {
    if (!lesson || !permissions.canEdit) return null;
    return {
      title: "Lição",
      fields: metadataFields(lesson, lesson.guide?.goal),
      actions: []
    };
  }

  const microsequence = findMicrosequence(
    project,
    courseKey,
    entityEditor.moduleKey,
    entityEditor.lessonKey,
    entityEditor.microsequenceKey
  );
  if (entityEditor.kind === "microsequence") {
    if (!course || !moduleValue || !lesson || !microsequence || !permissions.canEdit) return null;
    const refOptions = collectDependencyCandidates(course, moduleValue, lesson, microsequence).map((item) => ({
      id: item.id,
      label: item.scope ? `${item.title} · ${item.scope}` : item.title
    }));
    return {
      title: "Microssequência",
      fields: [
        { name: "title", label: "Título", type: "text", value: microsequence.title || "" },
        { name: "goal", label: "Objetivo", type: "textarea", value: microsequence.goal || "", iconName: "goal" },
        {
          name: "role",
          label: "Função didática",
          type: "select",
          value: microsequence.role || "explain",
          options: MICROSEQUENCE_ROLE_OPTIONS
        },
        {
          name: "dependsOn",
          label: "Dependências",
          type: "multiselect",
          value: Array.isArray(microsequence.dependsOn) ? microsequence.dependsOn : [],
          options: refOptions,
          iconName: "tags",
          hint: "Selecione as microssequências anteriores que esta etapa exige."
        },
        {
          name: "covers",
          label: "Covers",
          type: "tokenlist",
          value: Array.isArray(microsequence.covers) ? microsequence.covers : [],
          iconName: "tags",
          hint: "Liste os tópicos que esta microssequência cobre."
        },
        {
          name: "checks",
          label: "Checks",
          type: "tokenlist",
          value: Array.isArray(microsequence.checks) ? microsequence.checks : [],
          iconName: "tags",
          hint: "Liste as evidências de aprendizagem esperadas."
        }
      ],
      actions: []
    };
  }

  return null;
}
