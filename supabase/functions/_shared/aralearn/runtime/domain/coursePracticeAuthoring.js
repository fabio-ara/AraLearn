import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";
import { canonicalAuthoringValue } from "./courseAuthoringBasis.js";

// Import/render/restore use the runtime contract. This check belongs to authorship:
// a legacy response can survive an unrelated edit, never a new response.
export function inspectCoursePracticeAuthoring(content, previous = null) {
  const response = content?.response;
  if (!response) return [];
  const unchanged = previous?.response &&
    canonicalAuthoringValue(previous.response) === canonicalAuthoringValue(response);
  const manifest = RESOURCE_PACKAGE_REGISTRY.listCatalog().find(item =>
    item.id === response.package && item.version === response.version);
  if (manifest?.authoringEligibility === "legacy_only") {
    if (unchanged) return [];
    return [{ code: "practice_response_legacy_only",
      message: "Resposta aberta é preservada apenas no legado. Para criar ou substituir a resposta, escolha uma prática com avaliação e feedback locais." }];
  }
  if (unchanged && canonicalAuthoringValue(previous.feedback) === canonicalAuthoringValue(content.feedback)) return [];
  const issues = [];
  if (!Array.isArray(content.feedback) || !content.feedback.length ||
      !content.feedback.some(instance => {
        try { return RESOURCE_PACKAGE_REGISTRY.accessibleText(instance, "feedback").trim(); }
        catch { return false; }
      })) {
    issues.push({ code: "practice_offline_feedback_required",
      message: "A prática precisa de feedback explicativo no conteúdo local." });
  }
  return issues;
}

export function requireCoursePracticeAuthoring(content, previous = null) {
  const issue = inspectCoursePracticeAuthoring(content, previous)[0];
  if (issue) {
    const error = new TypeError(issue.message);
    error.code = issue.code;
    throw error;
  }
}
