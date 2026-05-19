import { validateScopeContractDocument } from "../../domain/scopeContract.js";

function nextModuleId() {
  return `module-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function createScopeModuleDraft() {
  return {
    id: nextModuleId(),
    title: "",
    include: [],
    exclude: [],
    notes: "",
    assessmentStyle: "mixed"
  };
}

export function createScopeBuilderDraft() {
  return {
    courseTitle: "",
    courseGoal: "",
    evidencePriority: ["none"],
    modules: [createScopeModuleDraft()]
  };
}

export function scopeContractToDraft(scopeContract) {
  return {
    courseTitle: scopeContract?.course?.title || "",
    courseGoal: scopeContract?.course?.goal || "",
    evidencePriority: Array.isArray(scopeContract?.course?.evidencePriority) ? scopeContract.course.evidencePriority : ["none"],
    modules: (Array.isArray(scopeContract?.modules) ? scopeContract.modules : []).map((moduleValue) => ({
      id: nextModuleId(),
      title: moduleValue.title || "",
      include: Array.isArray(moduleValue.include) ? [...moduleValue.include] : [],
      exclude: Array.isArray(moduleValue.exclude) ? [...moduleValue.exclude] : [],
      notes: moduleValue.notes || "",
      assessmentStyle: moduleValue.assessmentStyle || "mixed"
    }))
  };
}

export function addScopeChip(draft, moduleIndex, fieldName, chipLabel) {
  const label = String(chipLabel || "").trim();
  if (!label) {
    return draft;
  }
  const nextDraft = structuredClone(draft);
  const moduleValue = nextDraft.modules[moduleIndex];
  if (!moduleValue) {
    return draft;
  }
  const target = fieldName === "exclude" ? "exclude" : "include";
  const other = target === "include" ? "exclude" : "include";
  const normalizedLabel = label.toLowerCase();
  if ((moduleValue[target] || []).some((item) => item.toLowerCase() === normalizedLabel)) {
    return draft;
  }
  if ((moduleValue[other] || []).some((item) => item.toLowerCase() === normalizedLabel)) {
    return draft;
  }
  moduleValue[target].push(label);
  return nextDraft;
}

export function removeScopeChip(draft, moduleIndex, fieldName, chipIndex) {
  const nextDraft = structuredClone(draft);
  const moduleValue = nextDraft.modules[moduleIndex];
  if (!moduleValue || !Array.isArray(moduleValue[fieldName])) {
    return draft;
  }
  moduleValue[fieldName].splice(chipIndex, 1);
  return nextDraft;
}

export function addScopeModule(draft) {
  return {
    ...structuredClone(draft),
    modules: [...draft.modules, createScopeModuleDraft()]
  };
}

export function removeScopeModule(draft, moduleIndex) {
  const nextDraft = structuredClone(draft);
  nextDraft.modules.splice(moduleIndex, 1);
  if (!nextDraft.modules.length) {
    nextDraft.modules.push(createScopeModuleDraft());
  }
  return nextDraft;
}

export function readScopeDraftFromDom(root, fallbackDraft) {
  const nextDraft = structuredClone(fallbackDraft);
  const courseTitle = root.querySelector("[data-scope-course-title]");
  const courseGoal = root.querySelector("[data-scope-course-goal]");
  const evidencePriority = root.querySelector("[data-scope-evidence-priority]");

  nextDraft.courseTitle = courseTitle ? courseTitle.value : nextDraft.courseTitle;
  nextDraft.courseGoal = courseGoal ? courseGoal.value : nextDraft.courseGoal;
  nextDraft.evidencePriority = evidencePriority
    ? String(evidencePriority.value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : nextDraft.evidencePriority;

  nextDraft.modules = nextDraft.modules.map((moduleValue, index) => {
    const scope = `[data-module-index="${index}"]`;
    const titleInput = root.querySelector(`${scope} [data-scope-module-title]`);
    const notesInput = root.querySelector(`${scope} [data-scope-module-notes]`);
    const styleInput = root.querySelector(`${scope} [data-scope-module-style]`);
    return {
      ...moduleValue,
      title: titleInput ? titleInput.value : moduleValue.title,
      notes: notesInput ? notesInput.value : moduleValue.notes,
      assessmentStyle: styleInput ? styleInput.value : moduleValue.assessmentStyle
    };
  });

  return nextDraft;
}

export function validateScopeBuilderDraft(draft) {
  return validateScopeContractDocument({
    schemaVersion: "aralearn.scope.v1",
    course: {
      title: draft.courseTitle,
      goal: draft.courseGoal,
      evidencePriority: draft.evidencePriority
    },
    modules: draft.modules.map((moduleValue) => ({
      title: moduleValue.title,
      include: moduleValue.include,
      exclude: moduleValue.exclude,
      notes: moduleValue.notes,
      assessmentStyle: moduleValue.assessmentStyle
    }))
  });
}

