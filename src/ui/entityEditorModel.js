import { buildGuideEditorFields, GUIDE_LEVELS } from "../sourceGuides/sourceGuideStructured.js";
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

const ACTION_MENUS = Object.freeze({
  "home-actions": {
    title: "Ações",
    placement: "side",
    actions: [
      { key: "import-json", label: "Importar", icon: "upload" },
      { key: "export-backup", label: "Exportar backup", icon: "download" }
    ]
  },
  "course-screen-actions": {
    title: "Ações",
    placement: "side",
    actions: [
      { key: "create-module", label: "Novo módulo", icon: "add" },
      { key: "import-module", label: "Importar módulo", icon: "upload" }
    ]
  },
  "module-screen-actions": {
    title: "Ações",
    placement: "side",
    actions: [
      { key: "create-lesson", label: "Nova lição", icon: "add" },
      { key: "import-lesson", label: "Importar lição", icon: "upload" }
    ]
  },
  "lesson-screen-actions": {
    title: "Ações",
    placement: "side",
    actions: [
      { key: "create-microsequence", label: "Nova microssequência", icon: "add" },
      { key: "import-microsequence", label: "Importar microssequência", icon: "upload" }
    ]
  }
});

function actionMenu({ title, placement, actions }) {
  return {
    variant: "action-menu",
    title,
    placement,
    fields: [],
    actions,
    showSaveButton: false
  };
}

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
  const staticActionMenu = ACTION_MENUS[entityEditor.kind];
  if (staticActionMenu) {
    if (entityEditor.kind !== "home-actions" && !permissions.canEdit) return null;
    return actionMenu(staticActionMenu);
  }

  const course = findCourse(project, courseKey);

  if (entityEditor.kind === "course-actions") {
    if (!course) return null;
    return actionMenu({
      title: "Ações do curso",
      placement: "bottom",
      actions: [
        permissions.canEdit
          ? { key: "edit-course-metadata", label: "Editar curso", icon: "edit" }
          : null,
        { key: "reset-course-progress", label: "Zerar progresso do curso", icon: "rotate" },
        { key: "export-course", label: "Exportar curso", icon: "download" },
        permissions.canDelete
          ? { key: "delete-course", label: "Excluir curso", icon: "trash", tone: "danger" }
          : null
      ].filter(Boolean)
    });
  }

  if (entityEditor.kind === "course-metadata" || entityEditor.kind === "course") {
    if (!course || !permissions.canEdit) return null;
    return {
      title: "Curso",
      fields: metadataFields(course, course.goal),
      actions: entityEditor.kind === "course"
        ? [
            { key: "create-module", label: "Novo módulo" },
            { key: "create-course", label: "Novo curso" },
            { key: "delete-course", label: "Excluir curso", tone: "danger" }
          ]
        : []
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

  if (entityEditor.kind === "module-actions") {
    if (!moduleValue) return null;
    return actionMenu({
      title: "Ações do módulo",
      placement: "bottom",
      actions: [
        permissions.canEdit
          ? { key: "edit-module-metadata", label: "Editar módulo", icon: "edit" }
          : null,
        permissions.canEdit
          ? { key: "create-lesson", label: "Adicionar lição", icon: "add" }
          : null,
        { key: "reset-module-progress", label: "Zerar progresso do módulo", icon: "rotate" },
        { key: "export-module", label: "Exportar módulo", icon: "download" },
        permissions.canEdit
          ? { key: "delete-module", label: "Excluir módulo", icon: "trash", tone: "danger" }
          : null
      ].filter(Boolean)
    });
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

  if (entityEditor.kind === "lesson-source-guide") {
    if (!lesson || !permissions.canEdit) return null;
    return {
      title: "Fonte-guia da lição",
      fields: buildGuideEditorFields(lesson.guide || {}, { level: GUIDE_LEVELS.LESSON }),
      actions: []
    };
  }

  if (entityEditor.kind === "lesson-actions") {
    if (!lesson) return null;
    return actionMenu({
      title: "Ações da lição",
      placement: "bottom",
      actions: [
        permissions.canEdit
          ? { key: "edit-lesson-metadata", label: "Editar lição", icon: "edit" }
          : null,
        { key: "reset-lesson-progress", label: "Zerar progresso da lição", icon: "rotate" },
        { key: "export-lesson", label: "Exportar lição", icon: "download" },
        permissions.canEdit
          ? { key: "delete-lesson", label: "Excluir lição", icon: "trash", tone: "danger" }
          : null
      ].filter(Boolean)
    });
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

  if (entityEditor.kind === "microsequence-actions") {
    if (!microsequence) return null;
    return actionMenu({
      title: "Ações da microssequência",
      placement: "bottom",
      actions: [
        permissions.canEdit
          ? { key: "edit-microsequence-metadata", label: "Editar microssequência", icon: "edit" }
          : null,
        permissions.canEdit
          ? { key: "create-card", label: "Novo card", icon: "add" }
          : null,
        { key: "export-microsequence", label: "Exportar microssequência", icon: "download" },
        permissions.canEdit
          ? { key: "delete-microsequence", label: "Excluir microssequência", icon: "trash", tone: "danger" }
          : null
      ].filter(Boolean)
    });
  }

  return null;
}
