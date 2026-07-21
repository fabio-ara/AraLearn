import { buildGuideEditorFields, GUIDE_LEVELS } from "../sourceGuides/sourceGuideStructured.js";
import {
  collectAssistRefs,
  findCourse,
  findLesson,
  findMicrosequence,
  findModule
} from "./lessonEditorPaths.js";
import { renderUiIcon } from "./renderUiIcons.js";

export const ASSIST_CARD_CONTAINER_OPTIONS = Object.freeze([
  { value: "", label: "Automático", icon: renderUiIcon("sparkles", "action-menu-svg-icon") },
  { value: "paragraph", label: "Parágrafo", icon: renderUiIcon("prompt", "action-menu-svg-icon") },
  { value: "choice", label: "Escolha", icon: renderUiIcon("intent", "action-menu-svg-icon") },
  { value: "code", label: "Código", icon: renderUiIcon("title", "action-menu-svg-icon") },
  { value: "table", label: "Tabela", icon: renderUiIcon("module", "action-menu-svg-icon") },
  { value: "tree", label: "Árvore de diretórios", icon: renderUiIcon("folder", "action-menu-svg-icon") },
  { value: "flow", label: "Fluxograma", icon: renderUiIcon("microsequence", "action-menu-svg-icon") },
  { value: "graph", label: "Grafo", icon: renderUiIcon("graph", "action-menu-svg-icon") },
  { value: "plane", label: "Plano cartesiano", icon: renderUiIcon("card", "action-menu-svg-icon") },
  { value: "matrix", label: "Matriz", icon: renderUiIcon("card", "action-menu-svg-icon") }
]);

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
      { key: "import-json", label: "Importar", icon: "&#8679;" },
      { key: "export-backup", label: "Exportar backup", icon: "&#8681;" }
    ]
  },
  "course-screen-actions": {
    title: "Ações",
    placement: "side",
    actions: [
      { key: "create-module", label: "Novo módulo", icon: "&#43;" },
      { key: "import-module", label: "Importar módulo", icon: "&#8679;" }
    ]
  },
  "module-screen-actions": {
    title: "Ações",
    placement: "side",
    actions: [
      { key: "create-lesson", label: "Nova lição", icon: "&#43;" },
      { key: "import-lesson", label: "Importar lição", icon: "&#8679;" }
    ]
  },
  "lesson-screen-actions": {
    title: "Ações",
    placement: "side",
    actions: [
      { key: "create-microsequence", label: "Nova microssequência", icon: "&#43;" },
      { key: "import-microsequence", label: "Importar microssequência", icon: "&#8679;" }
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
          ? { key: "edit-course-metadata", label: "Editar curso", icon: "&#9998;" }
          : null,
        { key: "reset-course-progress", label: "Zerar progresso do curso", icon: "&#8635;" },
        { key: "export-course", label: "Exportar curso", icon: "&#8681;" },
        permissions.canDelete
          ? { key: "delete-course", label: "Excluir curso", icon: "&#128465;", tone: "danger" }
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
          ? { key: "edit-module-metadata", label: "Editar módulo", icon: "&#9998;" }
          : null,
        permissions.canEdit
          ? { key: "create-lesson", label: "Adicionar lição", icon: "&#43;" }
          : null,
        { key: "reset-module-progress", label: "Zerar progresso do módulo", icon: "&#8635;" },
        { key: "export-module", label: "Exportar módulo", icon: "&#8681;" },
        permissions.canEdit
          ? { key: "delete-module", label: "Excluir módulo", icon: "&#128465;", tone: "danger" }
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
          ? { key: "edit-lesson-metadata", label: "Editar lição", icon: "&#9998;" }
          : null,
        { key: "reset-lesson-progress", label: "Zerar progresso da lição", icon: "&#8635;" },
        { key: "export-lesson", label: "Exportar lição", icon: "&#8681;" },
        permissions.canEdit
          ? { key: "delete-lesson", label: "Excluir lição", icon: "&#128465;", tone: "danger" }
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
    const refOptions = collectAssistRefs(course, moduleValue, lesson, microsequence).map((item) => ({
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
          label: "Refs de dependência",
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
          ? { key: "edit-microsequence-metadata", label: "Editar microssequência", icon: "&#9998;" }
          : null,
        permissions.canEdit
          ? { key: "create-card", label: "Novo card", icon: "&#43;" }
          : null,
        { key: "export-microsequence", label: "Exportar microssequência", icon: "&#8681;" },
        permissions.canEdit
          ? { key: "delete-microsequence", label: "Excluir microssequência", icon: "&#128465;", tone: "danger" }
          : null
      ].filter(Boolean)
    });
  }

  if (entityEditor.kind === "assist-container-picker") {
    if (!permissions.canEdit) return null;
    return actionMenu({
      title: "Adicionar recursos",
      placement: "bottom",
      actions: ASSIST_CARD_CONTAINER_OPTIONS.map((item) => ({
        key: `set-assist-container:${item.value}`,
        label: item.label,
        icon: item.icon
      }))
    });
  }

  return null;
}
