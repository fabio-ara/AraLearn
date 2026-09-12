import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";
import { getPackageStudyUnitResponseEntry } from "../render/renderPackageStudyUnit.js";

// Ephemeral authoring interaction: the package owns evaluation; no study repository
// or attempt/progress API participates in this preview.
export function createCourseInspectionPracticePreview({ render } = {}) {
  const entries = new Map();
  let activePrompt = null;
  let pendingFocus = null;

  function entryFor(studyUnit, prefix) {
    if (studyUnit?.response?.package !== "aralearn.response.gap") return null;
    const entry = getPackageStudyUnitResponseEntry(studyUnit, prefix);
    const signature = JSON.stringify(studyUnit);
    const current = entries.get(entry.blockKey);
    if (current?.signature === signature) return current;
    const next = { ...entry, signature, state: RESOURCE_PACKAGE_REGISTRY.createResponseState(entry.instance) };
    entries.set(entry.blockKey, next);
    if (activePrompt?.blockKey === entry.blockKey) activePrompt = null;
    return next;
  }

  function focus(selector, attributes = {}) { pendingFocus = { selector, attributes }; }

  return {
    renderOptions(studyUnit, prefix, { editing = false } = {}) {
      const entry = entryFor(studyUnit, prefix);
      return entry ? {
        authoringPracticePreview: true,
        authoringPracticeEditing: editing,
        revealPracticeAnswers: false,
        responseStateByBlockKey: { [entry.blockKey]: entry.state },
        activeTextGapPrompt: editing ? null : activePrompt
      } : {};
    },
    bind(scope, studyUnit, prefix, { editing = false } = {}) {
      const entry = entryFor(studyUnit, prefix);
      if (!entry || editing || !scope?.querySelectorAll) return;
      const host = {
        blockKey: entry.blockKey,
        getState: () => entry.state,
        setActivePrompt: prompt => { activePrompt = prompt; },
        focus,
        render: () => render?.(),
        submit: () => {
          RESOURCE_PACKAGE_REGISTRY.submitResponseState(entry.instance, entry.state, host);
          render?.();
        },
        reset: () => {
          entry.state = RESOURCE_PACKAGE_REGISTRY.createResponseState(entry.instance);
          activePrompt = null;
          render?.();
        }
      };
      RESOURCE_PACKAGE_REGISTRY.bindResponseInteraction(entry.instance, scope, host);
      if (pendingFocus) {
        const { selector, attributes } = pendingFocus;
        const node = [...scope.querySelectorAll(selector)].find(candidate =>
          Object.entries(attributes).every(([name, value]) => candidate.getAttribute(name) === String(value)));
        if (node) { pendingFocus = null; node.focus({ preventScroll: true }); }
      }
    },
    clear() { entries.clear(); activePrompt = null; pendingFocus = null; }
  };
}
