import { buildScopedKey } from "../../core/ids.js";
import { buildContextPacket } from "./buildContextPacket.js";
import { findSelection, cloneProject } from "./_shared.js";
import { supportMicrosequenceSchema } from "../schemas/bottomUpSchema.js";
import { validateMicrosequenceCards } from "./validateMicrosequenceCards.js";
import { buildBottomUpSystemPrompt } from "../prompts/bottomUpPrompt.js";
import { buildSupportPrompt } from "../prompts/supportPrompt.js";
import { createMicrosequenceVersion } from "../../domain/microsequenceVersion.js";

export async function createSupportMicrosequence({
  project,
  selection,
  provider,
  modelId,
  density = "standard",
  userRequest = "",
  providerOptions = {},
  source = "llm"
} = {}) {
  const info = findSelection(project, selection);
  if (!info) {
    throw new Error("Microssequência não encontrada.");
  }
  const packet = buildContextPacket(project, selection, { density, userRequest });
  const payload = await provider.generateStructured({
    ...providerOptions,
    modelId,
    mode: "create-support",
    system: buildBottomUpSystemPrompt(),
    prompt: buildSupportPrompt(packet, userRequest),
    schema: supportMicrosequenceSchema,
    temperature: 0.3
  });
  const validation = validateMicrosequenceCards({ summary: payload.summary, cards: payload.cards }, density, { packet });
  if (!validation.ok) {
    throw new Error(validation.errors.map((error) => error.message).join("; "));
  }
  const version = createMicrosequenceVersion({
    source,
    mode: "support",
    userRequest,
    cards: validation.value.cards,
    summary: validation.value.summary,
    validationReport: validation.report
  });
  const previous = info.microsequenceIndex > 0 ? info.lesson.microsequences[info.microsequenceIndex - 1] : null;
  const supportDependsOn = [
    ...new Set(
      (Array.isArray(info.microsequence.dependsOn) && info.microsequence.dependsOn.length
        ? info.microsequence.dependsOn
        : [previous?.key]
      ).filter(Boolean)
    )
  ];
  const supportMicrosequence = {
    key: buildScopedKey("microsequence", payload.title),
    title: payload.title,
    goal: payload.goal,
    type: "support",
    status: "generated",
    dependsOn: supportDependsOn,
    scopeRefs: [...(info.microsequence.scopeRefs || [])],
    parentMicrosequenceKey: info.microsequence.key,
    supportReason: payload.supportReason,
    versions: [version],
    activeVersionKey: version.key
  };
  const nextProject = cloneProject(project);
  const list =
    nextProject.courses[info.courseIndex].modules[info.moduleIndex].lessons[info.lessonIndex].microsequences;
  list.splice(info.microsequenceIndex + 1, 0, supportMicrosequence);
  return {
    project: nextProject,
    selection: {
      ...selection,
      microsequenceKey: supportMicrosequence.key
    }
  };
}

