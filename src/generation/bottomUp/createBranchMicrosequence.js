import { buildScopedKey } from "../../core/ids.js";
import { buildBranchMicrosequenceContract } from "../contracts/buildBranchMicrosequenceContract.js";
import { validateBranchMicrosequencePlan } from "../validation/validateBranchMicrosequencePlan.js";
import { buildContextPacket } from "./buildContextPacket.js";
import { cloneProject, findSelection } from "./_shared.js";
import { generateMicrosequenceCards } from "./generateMicrosequenceCards.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function summarizeErrors(errors = []) {
  return errors.map((error) => (typeof error === "string" ? error : error?.message || String(error))).join("; ");
}

function buildBranchPlanningPrompt(branchContract = {}, didacticPolicy = {}) {
  return [
    "Fase: branch_microsequence_structure",
    "Planeje somente uma microssequência curta de apoio local.",
    "Responda somente JSON pequeno com: title, goal, role, covers, checks.",
    "A etapa deve resolver uma lacuna local e voltar à trilha principal sem ampliar o escopo.",
    `Diretrizes didáticas: ${JSON.stringify(didacticPolicy)}`,
    JSON.stringify(branchContract, null, 2)
  ].join("\n\n");
}

const BRANCH_MICROSEQUENCE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["title", "goal", "role", "covers", "checks"],
  properties: {
    title: { type: "string", minLength: 1 },
    goal: { type: "string", minLength: 1 },
    role: { type: "string", enum: ["explain", "practice", "review", "support"] },
    covers: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: { type: "string", minLength: 1 }
    },
    checks: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: { type: "string", minLength: 1 }
    }
  }
});

export async function createBranchMicrosequence({
  project,
  selection,
  provider,
  modelId,
  density = "standard",
  userRequest = "",
  requestContext = null,
  didacticPolicy = {},
  onProgress,
  ...options
} = {}) {
  const info = findSelection(project, selection);
  if (!info) {
    throw new Error("Microssequência não encontrada.");
  }
  if (typeof provider?.generateStructured !== "function") {
    throw new Error("Provider sem saída estruturada para criar a microssequência de apoio.");
  }

  const contextPacket = buildContextPacket(project, selection, {
    density,
    userRequest,
    selectedRefIds: Array.isArray(requestContext?.selectedRefs) ? requestContext.selectedRefs : []
  });
  const branchContract = buildBranchMicrosequenceContract({
    selectedCourse: info.course,
    selectedModule: info.moduleValue,
    selectedLesson: info.lesson,
    currentMicrosequence: info.microsequence,
    userPrompt: userRequest,
    contextPacket
  });

  onProgress?.({
    stage: "prepare-branch",
    status: "started",
    message: "Planejando a nova microssequência fora da trilha principal.",
    artifacts: { branchContract }
  });

  let rawBranch;
  try {
    const result = await provider.generateStructured({
      modelId,
      phase: "branch_microsequence_structure",
      system: "Planeje somente a microssequência solicitada no schema fornecido.",
      prompt: buildBranchPlanningPrompt(branchContract, didacticPolicy),
      schemaName: "aralearn_branch_microsequence_v4",
      schema: BRANCH_MICROSEQUENCE_SCHEMA,
      temperature: 0.1,
      maxTokens: 1500
    });
    rawBranch = result.value;
  } catch (error) {
    onProgress?.({
      stage: "prepare-branch",
      status: "failed",
      message: error instanceof Error ? error.message : "Falha ao planejar a nova microssequência.",
      resumeFrom: "prepare",
      artifacts: { branchContract }
    });
    throw error;
  }

  const validatedBranch = validateBranchMicrosequencePlan(rawBranch, branchContract);
  if (!validatedBranch.ok) {
    onProgress?.({
      stage: "prepare-branch",
      status: "failed",
      message: summarizeErrors(validatedBranch.errors),
      resumeFrom: "prepare",
      artifacts: { branchContract, validatedBranch }
    });
    throw new Error(summarizeErrors(validatedBranch.errors));
  }

  onProgress?.({
    stage: "prepare-branch",
    status: "ok",
    message: "Nova microssequência planejada.",
    artifacts: { branchContract, validatedBranch }
  });

  const nextProject = cloneProject(project);
  const lessonMicrosequences =
    nextProject.courses[info.courseIndex].modules[info.moduleIndex].lessons[info.lessonIndex].microsequences;
  const branchMicrosequence = {
    id: buildScopedKey("microsequence", text(validatedBranch.value.title) || "microsequence-branch"),
    title: validatedBranch.value.title,
    goal: validatedBranch.value.goal,
    role: validatedBranch.value.role,
    status: "planned",
    branchOf: info.microsequence.id,
    dependsOn: [info.microsequence.id],
    covers: validatedBranch.value.covers,
    checks: validatedBranch.value.checks,
    cards: []
  };

  lessonMicrosequences.splice(info.microsequenceIndex + 1, 0, branchMicrosequence);

  const generated = await generateMicrosequenceCards({
    ...options,
    project: nextProject,
    selection: {
      ...selection,
      microsequenceKey: branchMicrosequence.id
    },
    provider,
    modelId,
    density,
    userRequest,
    requestContext,
    didacticPolicy,
    onProgress
  });

  return {
    ...generated,
    selection: {
      ...selection,
      microsequenceKey: branchMicrosequence.id
    }
  };
}
