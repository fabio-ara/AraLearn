import {
  applyManualStudyUnitEdit,
  listManualStudyUnitEditablePaths
} from "../ui/manualStudyUnitEdit.js";
import {
  buildStudyUnitProviderRequest,
  callStudyUnitProvider,
  normalizeStudyUnitProviderConfig,
  StudyUnitProviderError
} from "../generation/providers/studyUnitAssistanceProviders.js";

const MAX_INSTRUCTION_LENGTH = 4_000;
const MAX_PATH_VALUE_LENGTH = 6_000;
const MAX_WRITABLE_CONTEXT_LENGTH = 12_000;
const MAX_CONVERSATION_TURNS = 8;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function bounded(value, maximum) {
  return String(value ?? "").slice(0, maximum);
}

function plainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function projectedTopics(studyUnit) {
  return (Array.isArray(studyUnit?.topics) ? studyUnit.topics : [])
    .filter((value) => typeof value === "string")
    .slice(0, 20)
    .map((value) => bounded(value, 160));
}

function compactConversation(turns) {
  return (Array.isArray(turns) ? turns : [])
    .slice(-MAX_CONVERSATION_TURNS)
    .map((turn) => ({
      request: bounded(turn?.request, 1_000),
      response: bounded(turn?.response, 800),
      outcome: new Set(["applied", "discarded", "no-op"]).has(turn?.outcome)
        ? turn.outcome
        : "applied"
    }));
}

function editableSnapshot(studyUnit, targetId, currentPathValues) {
  const editable = listManualStudyUnitEditablePaths(studyUnit, targetId);
  if (!editable.length) {
    throw new StudyUnitProviderError(
      "assistance_target_unavailable",
      "O conteúdo selecionado não oferece texto editável."
    );
  }
  const allowedPaths = editable.map(({ path }) => path);
  const current = Object.fromEntries(editable.map(({ path, value }) => [
    path,
    Object.hasOwn(currentPathValues || {}, path) ? String(currentPathValues[path] ?? "") : value
  ]));
  if (Object.values(current).some((value) => value.length > MAX_PATH_VALUE_LENGTH) ||
      JSON.stringify(current).length > MAX_WRITABLE_CONTEXT_LENGTH) {
    throw new StudyUnitProviderError(
      "assistance_target_too_large",
      "O trecho selecionado é grande demais para a assistência contextual."
    );
  }
  return { editable, allowedPaths, current };
}

export function studyUnitAssistanceTargetAvailability({
  studyUnit,
  targetId = "study_unit",
  currentPathValues = {}
} = {}) {
  try {
    const snapshot = editableSnapshot(studyUnit, targetId, currentPathValues);
    return Object.freeze({
      available: true,
      reason: "",
      editablePathCount: snapshot.allowedPaths.length
    });
  } catch (error) {
    if (!(error instanceof StudyUnitProviderError) || !new Set([
      "assistance_target_unavailable",
      "assistance_target_too_large"
    ]).has(error.code)) {
      throw error;
    }
    return Object.freeze({
      available: false,
      reason: error.message,
      editablePathCount: 0
    });
  }
}

function candidateSchema(editable) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["message", "changes"],
    properties: {
      message: { type: "string", minLength: 1, maxLength: 800 },
      changes: {
        type: "array",
        minItems: 0,
        maxItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["path", "value"],
          properties: {
            path: { type: "string", enum: editable.map(({ path }) => path) },
            value: { type: "string", maxLength: MAX_PATH_VALUE_LENGTH }
          }
        }
      }
    }
  };
}

function assistanceEnvelope({ studyUnit, targetId, instruction, snapshot, conversationTurns }) {
  void targetId;
  return {
    contract: "aralearn.study-unit-contextual-assistance.v1",
    instruction,
    writableTarget: {
      pathValues: snapshot.current
    },
    readOnlyContext: {
      title: bounded(studyUnit?.title, 300),
      role: bounded(studyUnit?.role, 40),
      topics: projectedTopics(studyUnit)
    },
    priorConversation: compactConversation(conversationTurns)
  };
}

function normalizeCandidate(value, snapshot) {
  if (!plainObject(value) || Object.keys(value).some((key) =>
    !["message", "changes"].includes(key)
  )) {
    throw new StudyUnitProviderError(
      "provider_structured_output_invalid",
      "A sugestão não respeitou o formato estruturado exigido."
    );
  }
  const message = text(value.message);
  if (!message || message.length > 800 || !Array.isArray(value.changes) ||
      value.changes.length > 1) {
    throw new StudyUnitProviderError(
      "provider_structured_output_invalid",
      "A sugestão não respeitou o formato estruturado exigido."
    );
  }
  const allowed = new Set(snapshot.allowedPaths);
  const pathValues = { ...snapshot.current };
  for (const change of value.changes) {
    if (!plainObject(change) || Object.keys(change).some((key) =>
      !["path", "value"].includes(key)
    ) || typeof change.path !== "string" || !allowed.has(change.path)) {
      throw new StudyUnitProviderError(
        "provider_scope_violation",
        "A sugestão tentou alterar conteúdo fora do trecho autorizado."
      );
    }
    if (typeof change.value !== "string" || change.value.length > MAX_PATH_VALUE_LENGTH) {
      throw new StudyUnitProviderError(
        "provider_structured_output_invalid",
        "A sugestão não respeitou o formato estruturado exigido."
      );
    }
    pathValues[change.path] = change.value;
  }
  return { message, pathValues };
}

export function buildStudyUnitAssistancePrompt({
  studyUnit,
  targetId,
  instruction,
  currentPathValues = {},
  conversationTurns = []
} = {}) {
  const normalizedInstruction = text(instruction);
  if (!normalizedInstruction || normalizedInstruction.length > MAX_INSTRUCTION_LENGTH) {
    throw new StudyUnitProviderError(
      "assistance_instruction_invalid",
      `Descreva a alteração em até ${MAX_INSTRUCTION_LENGTH} caracteres.`
    );
  }
  const snapshot = editableSnapshot(studyUnit, targetId, currentPathValues);
  const schema = candidateSchema(snapshot.editable);
  const envelope = assistanceEnvelope({
    studyUnit,
    targetId,
    instruction: normalizedInstruction,
    snapshot,
    conversationTurns
  });
  return Object.freeze({
    snapshot,
    schema,
    system: "Você auxilia a editar um único trecho textual de uma Unidade de estudo. " +
      "Devolva no máximo uma alteração em changes, usando somente um path autorizado; preserve fatos e intenção " +
      "pedagógica quando o autor não pedir mudança, não invente fontes e devolva apenas o objeto JSON do schema.",
    prompt: JSON.stringify(envelope)
  });
}

export async function requestStudyUnitAssistanceCandidate({
  studyUnit,
  targetId,
  currentPathValues = {},
  instruction,
  conversationTurns = [],
  providerConfig,
  runtimeConfig = globalThis.__ARALEARN_ENV__ || {},
  fetchImpl = globalThis.fetch,
  signal,
  retryDelayMs
} = {}) {
  const baseStudyUnit = applyManualStudyUnitEdit(studyUnit, targetId, {
    pathValues: currentPathValues
  });
  const prompt = buildStudyUnitAssistancePrompt({
    studyUnit: baseStudyUnit,
    targetId,
    instruction,
    currentPathValues,
    conversationTurns
  });
  const config = normalizeStudyUnitProviderConfig(providerConfig, runtimeConfig);
  const request = buildStudyUnitProviderRequest(config, prompt);
  const rawCandidate = await callStudyUnitProvider({
    config,
    request,
    fetchImpl,
    signal,
    retryDelayMs
  });
  const candidate = normalizeCandidate(rawCandidate, prompt.snapshot);
  let previewStudyUnit;
  try {
    previewStudyUnit = applyManualStudyUnitEdit(baseStudyUnit, targetId, {
      pathValues: candidate.pathValues
    });
  } catch {
    throw new StudyUnitProviderError(
      "provider_candidate_invalid",
      "A sugestão deixaria a Unidade de estudo inválida."
    );
  }
  const noOp = prompt.snapshot.allowedPaths.every((path) =>
    Object.is(prompt.snapshot.current[path], candidate.pathValues[path])
  );
  return Object.freeze({
    message: candidate.message,
    pathValues: Object.freeze({ ...candidate.pathValues }),
    previewStudyUnit,
    noOp,
    providerId: config.providerId,
    model: config.model
  });
}

export const STUDY_UNIT_ASSISTANCE_LIMITS = Object.freeze({
  maximumInstructionLength: MAX_INSTRUCTION_LENGTH,
  maximumConversationTurns: MAX_CONVERSATION_TURNS,
  maximumPathValueLength: MAX_PATH_VALUE_LENGTH,
  maximumWritableContextLength: MAX_WRITABLE_CONTEXT_LENGTH
});
