import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";
import { canonicalAuthoringValue } from "./courseAuthoringBasis.js";

// These checks apply to authorship; package existence belongs to the registry.
export function inspectCoursePracticeAuthoring(content, previous = null) {
  const response = content?.response;
  if (!response) return [];
  const definition = RESOURCE_PACKAGE_REGISTRY.get(response.package, response.version);
  if (!definition?.manifest.slots.includes("response")) return [{ code: "unknown_response_component",
    message: "O componente de resposta não está disponível. Escolha uma prática avaliável do catálogo corrente." }];
  const unchanged = previous?.response &&
    canonicalAuthoringValue(previous.response) === canonicalAuthoringValue(response);
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
