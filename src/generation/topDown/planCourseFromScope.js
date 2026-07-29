import { createEmptyProjectDocument } from "../../domain/aralearnProject.js";
import { validateScopeContractDocument } from "../../domain/scopeContract.js";
import { createDeepSeekUsageLogger } from "../engine/deepSeekUsageLogger.js";
import { planCourseFromScopeStructured } from "../engine/topDownStructuredRuntime.js";

export async function planCourseFromScope({
  scopeContract,
  provider,
  modelId,
  project = createEmptyProjectDocument(),
  attachments = [],
  didacticPolicy = {}
} = {}) {
  const scopeResult = validateScopeContractDocument(scopeContract);
  if (!scopeResult.ok) {
    const summary = scopeResult.errors.map((error) => `${error.path}: ${error.message}`).join("; ");
    throw new Error(summary);
  }
  if (typeof provider?.generateStructured !== "function") {
    throw new Error("Provider sem saída estruturada para o planejamento.");
  }
  const logger = createDeepSeekUsageLogger();
  const result = await planCourseFromScopeStructured({
    scopeContract: scopeResult.value,
    provider,
    modelId,
    project,
    logger,
    attachments,
    didacticPolicy
  });
  return {
    ...result,
    usageReport: logger.writeReport({
      finalValidation: true,
      fail_closed: false
    })
  };
}
