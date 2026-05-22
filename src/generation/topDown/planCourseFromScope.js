import { applyProjectPatch } from "../../core/patch.js";
import { createEmptyProjectDocument } from "../../domain/aralearnProject.js";
import { validateScopeContractDocument } from "../../domain/scopeContract.js";
import { plannedCourseSchema } from "../schemas/plannedCourseSchema.js";
import { buildTopDownPrompt } from "./buildTopDownPrompt.js";
import { plannedCourseToProjectPatch } from "./plannedCourseToProjectPatch.js";
import { validatePlannedCourse } from "./validatePlannedCourse.js";

function uniqueList(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean))];
}

function buildTopDownCorrectionPrompt(basePrompt = "", issues = []) {
  const normalizedIssues = uniqueList(issues);
  if (!normalizedIssues.length) {
    return basePrompt;
  }
  return [
    basePrompt,
    "",
    "CORRECOES OBRIGATORIAS:",
    ...normalizedIssues.map((issue) => `- ${issue}`),
    "- Reescreva a resposta inteira em JSON valido, sem comentários."
  ].join("\n");
}

export async function planCourseFromScope({
  scopeContract,
  provider,
  modelId,
  density = "standard",
  project = createEmptyProjectDocument(),
  providerOptions = {}
} = {}) {
  const scopeResult = validateScopeContractDocument(scopeContract);
  if (!scopeResult.ok) {
    const summary = scopeResult.errors.map((error) => `${error.path}: ${error.message}`).join("; ");
    throw new Error(summary);
  }
  const normalizedScope = scopeResult.value;
  const prompt = buildTopDownPrompt(normalizedScope, density);
  let lastError = null;
  let currentPrompt = prompt.prompt;
  let validation = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let plannedCourse;
    try {
      plannedCourse = await provider.generateStructured({
        ...providerOptions,
        modelId,
        mode: "plan-scope",
        phase: attempt === 1 ? "top-down-plan" : "top-down-repair",
        system: prompt.system,
        prompt: currentPrompt,
        schema: plannedCourseSchema,
        temperature: 0.2
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt >= 3 || lastError?.category !== "response_truncated") {
        throw lastError;
      }
      currentPrompt = buildTopDownCorrectionPrompt(prompt.prompt, [lastError.message]);
      continue;
    }
    validation = validatePlannedCourse(plannedCourse, normalizedScope);
    if (validation.ok) {
      break;
    }
    const issues = validation.errors.map((error) => `${error.path}: ${error.message}`);
    lastError = new Error(issues.join("; "));
    currentPrompt = buildTopDownCorrectionPrompt(prompt.prompt, issues);
  }
  if (!validation?.ok) {
    throw lastError || new Error("Falha ao validar o planejamento top-down.");
  }
  const patch = plannedCourseToProjectPatch(validation.value, normalizedScope);
  return {
    scopeContract: normalizedScope,
    plannedCourse: validation.value,
    patch,
    project: applyProjectPatch(project, patch)
  };
}
