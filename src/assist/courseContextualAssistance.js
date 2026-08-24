import {
  buildStudyUnitProviderRequest,
  callStudyUnitProvider,
  normalizeStudyUnitProviderConfig,
  StudyUnitProviderError
} from "../generation/providers/studyUnitAssistanceProviders.js";
import {
  RESOURCE_CATALOG,
  RESOURCE_PACKAGE_REGISTRY
} from "../resources/catalog/resourceCatalog.js";
import {
  renderStudyUnitEnvelope,
  validateStudyUnitEnvelope
} from "../resources/kernel/studyUnitEnvelope.js";
import { validateProjectDocument } from "../domain/aralearnProject.js";

const SCOPES = new Set(["study_unit", "didactic_microsequence", "lesson"]);
const MAX_TURNS = 8;
const MAX_REQUEST_LENGTH = 4_000;
const MAX_CONTEXT_BYTES = 96 * 1024;
const MAX_REPAIR_ATTEMPTS = 2;

function clone(value) {
  return structuredClone(value);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function byteLength(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function bounded(value, maximum) {
  return String(value ?? "").slice(0, maximum);
}

function exactKeys(value, allowed) {
  return plainObject(value) && Object.keys(value).every((key) => allowed.has(key));
}

function targetLabel(scope) {
  return ({
    study_unit: "Unidade",
    didactic_microsequence: "Microssequência",
    lesson: "Lição"
  })[scope];
}

function findPath(project, selection = {}) {
  const course = list(project?.courses).find(({ id }) => id === selection.courseId);
  const moduleValue = list(course?.modules).find(({ id }) => id === selection.moduleId);
  const lesson = list(moduleValue?.lessons).find(({ id }) => id === selection.lessonId);
  const microsequence = list(lesson?.microsequences)
    .find(({ id }) => id === selection.microsequenceId);
  const studyUnit = list(microsequence?.studyUnits)
    .find(({ id }) => id === selection.studyUnitId);
  if (!course || !moduleValue || !lesson ||
      (selection.microsequenceId && !microsequence) ||
      (selection.studyUnitId && !studyUnit)) {
    throw new StudyUnitProviderError(
      "assistance_target_unavailable",
      "O alvo da assistência deixou de existir no Curso."
    );
  }
  return { course, moduleValue, lesson, microsequence, studyUnit };
}

function compactOutline(course, selection) {
  return list(course?.modules).map((moduleValue) => ({
    id: moduleValue.id,
    title: bounded(moduleValue.title, 180),
    selected: moduleValue.id === selection.moduleId,
    lessons: list(moduleValue.lessons).map((lesson) => ({
      id: lesson.id,
      title: bounded(lesson.title, 180),
      selected: lesson.id === selection.lessonId,
      microsequences: list(lesson.microsequences).map((microsequence) => ({
        id: microsequence.id,
        title: bounded(microsequence.title, 180),
        role: bounded(microsequence.role, 80),
        selected: microsequence.id === selection.microsequenceId,
        studyUnitCount: list(microsequence.studyUnits).length
      }))
    }))
  }));
}

function compactConversation(turns) {
  return list(turns).slice(-MAX_TURNS).map((turn) => ({
    role: turn?.role === "assistant" ? "assistant" : "user",
    message: bounded(turn?.message, 1_400)
  })).filter(({ message }) => message);
}

function targetForScope(path, scope) {
  if (scope === "study_unit") return path.studyUnit;
  if (scope === "didactic_microsequence") return path.microsequence;
  return path.lesson;
}

export function buildCourseAssistanceContext({
  project,
  selection,
  scope = "study_unit",
  writeTargetId = ""
} = {}) {
  if (!SCOPES.has(scope)) throw new TypeError("Escopo de assistência inválido.");
  const path = findPath(project, selection);
  const target = targetForScope(path, scope);
  if (!target) {
    throw new StudyUnitProviderError(
      "assistance_target_unavailable",
      `A ${targetLabel(scope)} não está disponível para assistência.`
    );
  }
  const context = {
    contract: "aralearn.course-contextual-assistance.v1",
    scope,
    writeTarget: {
      kind: scope,
      id: target.id,
      ...(scope === "study_unit" && text(writeTargetId)
        ? { selectedComponentId: text(writeTargetId) }
        : {})
    },
    readOnlyContext: {
      target: clone(target),
      ...(path.studyUnit ? { completeStudyUnit: clone(path.studyUnit) } : {}),
      microsequence: path.microsequence ? {
        id: path.microsequence.id,
        position: path.microsequence.position,
        title: path.microsequence.title,
        goal: path.microsequence.goal,
        role: path.microsequence.role || "",
        studyUnitCount: list(path.microsequence.studyUnits).length
      } : null,
      curriculumPath: {
        course: { id: path.course.id, title: path.course.title, goal: path.course.goal },
        module: { id: path.moduleValue.id, title: path.moduleValue.title, goal: path.moduleValue.goal },
        lesson: { id: path.lesson.id, title: path.lesson.title, goal: path.lesson.goal }
      },
      courseOutline: compactOutline(path.course, selection)
    }
  };
  if (byteLength(context.writeTarget) + byteLength(context.readOnlyContext.target) >
      MAX_CONTEXT_BYTES) {
    throw new StudyUnitProviderError(
      "assistance_target_too_large",
      `A ${targetLabel(scope)} é grande demais para ser enviada sem truncar o alvo de escrita.`
    );
  }
  while (byteLength(context) > MAX_CONTEXT_BYTES &&
      context.readOnlyContext.courseOutline.length > 1) {
    const selectedIndex = context.readOnlyContext.courseOutline
      .findIndex(({ selected }) => selected);
    const removeIndex = selectedIndex === 0
      ? context.readOnlyContext.courseOutline.length - 1
      : 0;
    context.readOnlyContext.courseOutline.splice(removeIndex, 1);
  }
  if (byteLength(context) > MAX_CONTEXT_BYTES) {
    context.readOnlyContext.courseOutline = context.readOnlyContext.courseOutline
      .filter(({ selected }) => selected)
      .map((moduleValue) => ({
        ...moduleValue,
        lessons: moduleValue.lessons.filter(({ selected }) => selected)
      }));
  }
  if (byteLength(context) > MAX_CONTEXT_BYTES) {
    throw new StudyUnitProviderError(
      "assistance_context_too_large",
      "O contexto curricular não cabe no limite seguro sem reduzir o alvo de escrita."
    );
  }
  return Object.freeze({ context: clone(context), path: clone(path) });
}

const componentNeedSchema = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["query", "slot"],
  properties: {
    query: { type: "string", minLength: 1, maxLength: 500 },
    slot: { type: "string", enum: ["content", "response", "feedback"] }
  }
});

const discussionSchema = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["message", "proposal"],
  properties: {
    message: { type: "string", minLength: 1, maxLength: 1_600 },
    proposal: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["summary", "scope", "componentNeeds"],
          properties: {
            summary: { type: "string", minLength: 1, maxLength: 1_600 },
            scope: {
              type: "string",
              enum: ["study_unit", "didactic_microsequence", "lesson"]
            },
            componentNeeds: {
              type: "array",
              maxItems: 6,
              items: componentNeedSchema
            }
          }
        }
      ]
    }
  }
});

function normalizeDiscussion(value, scope) {
  if (!exactKeys(value, new Set(["message", "proposal"])) ||
      !text(value.message) || text(value.message).length > 1_600) {
    throw new StudyUnitProviderError(
      "provider_structured_output_invalid",
      "A resposta da assistência não respeitou o formato da conversa."
    );
  }
  if (value.proposal === null) {
    return Object.freeze({ message: text(value.message), proposal: null });
  }
  const proposal = value.proposal;
  if (!exactKeys(proposal, new Set(["summary", "scope", "componentNeeds"])) ||
      proposal.scope !== scope || !text(proposal.summary) ||
      !Array.isArray(proposal.componentNeeds) || proposal.componentNeeds.length > 6 ||
      proposal.componentNeeds.some((need) =>
        !exactKeys(need, new Set(["query", "slot"])) ||
        !text(need.query) || text(need.query).length > 500 ||
        !new Set(["content", "response", "feedback"]).has(need.slot))) {
    throw new StudyUnitProviderError(
      "provider_scope_violation",
      "A proposta tentou sair do escopo de escrita autorizado."
    );
  }
  return Object.freeze({
    message: text(value.message),
    proposal: Object.freeze({
      summary: text(proposal.summary),
      scope,
      componentNeeds: Object.freeze(proposal.componentNeeds.map((need) => Object.freeze({
        query: text(need.query),
        slot: need.slot
      })))
    })
  });
}

async function providerCall({ providerConfig, runtimeConfig, fetchImpl, signal, prompt }) {
  const config = normalizeStudyUnitProviderConfig(providerConfig, runtimeConfig);
  const request = buildStudyUnitProviderRequest(config, prompt);
  return callStudyUnitProvider({ config, request, fetchImpl, signal });
}

export async function requestCourseAssistanceDiscussion({
  project,
  selection,
  scope = "study_unit",
  writeTargetId = "",
  message,
  conversation = [],
  providerConfig,
  runtimeConfig = globalThis.__ARALEARN_ENV__ || {},
  fetchImpl = globalThis.fetch,
  signal
} = {}) {
  const request = text(message);
  if (!request || request.length > MAX_REQUEST_LENGTH) {
    throw new StudyUnitProviderError(
      "assistance_instruction_invalid",
      `Escreva uma mensagem em até ${MAX_REQUEST_LENGTH} caracteres.`
    );
  }
  const { context } = buildCourseAssistanceContext({
    project, selection, scope, writeTargetId
  });
  const envelope = {
    ...context,
    conversation: compactConversation(conversation),
    message: request
  };
  const raw = await providerCall({
    providerConfig,
    runtimeConfig,
    fetchImpl,
    signal,
    prompt: {
      system: "Você participa de uma conversa curta de edição curricular situada. " +
        "Pode explicar e discutir sem propor mudança. Quando houver proposta suficientemente definida, " +
        "resuma-a no escopo recebido e liste somente as necessidades de representação por linguagem comum. " +
        "Não invente Fontes, não exponha JSON ao usuário e nunca amplie o escopo de escrita.",
      prompt: JSON.stringify(envelope),
      schema: discussionSchema
    }
  });
  return normalizeDiscussion(raw, scope);
}

function instanceIdentities(value) {
  const found = new Map();
  const visitUnit = (unit) => {
    for (const instance of [
      ...list(unit?.content),
      ...(unit?.response ? [unit.response] : []),
      ...list(unit?.feedback)
    ]) {
      const packageId = text(instance?.package);
      const version = text(instance?.version);
      if (packageId && version) found.set(`${packageId}@${version}`, { packageId, version });
    }
  };
  if (Array.isArray(value?.studyUnits)) list(value.studyUnits).forEach(visitUnit);
  else if (Array.isArray(value?.microsequences)) {
    list(value.microsequences).forEach((micro) => list(micro.studyUnits).forEach(visitUnit));
  } else visitUnit(value);
  return [...found.values()];
}

function discoverContracts(target, proposal) {
  const trace = [];
  const identities = new Map(instanceIdentities(target)
    .map((identity) => [`${identity.packageId}@${identity.version}`, identity]));
  for (const need of proposal.componentNeeds) {
    const explored = RESOURCE_CATALOG.explore({ slot: need.slot });
    trace.push({ operation: "explore", slot: need.slot, packageCount: explored.packageCount });
    const searched = RESOURCE_CATALOG.search({
      query: need.query,
      slot: need.slot,
      limit: 3
    });
    trace.push({
      operation: "search",
      slot: need.slot,
      query: need.query,
      candidates: searched.candidates.map(({ packageId, version }) => ({ packageId, version }))
    });
    const requested = searched.candidates.slice(0, 3)
      .map(({ packageId, version }) => ({ packageId, version }));
    if (!requested.length) {
      throw new StudyUnitProviderError(
        "assistance_component_not_found",
        `Nenhum componente instalado corresponde a “${need.query}”.`
      );
    }
    const inspected = RESOURCE_CATALOG.inspect(requested);
    trace.push({
      operation: "inspect",
      items: inspected.items.map(({ status, profile }) => ({
        status,
        packageId: profile?.packageId || "",
        version: profile?.version || ""
      }))
    });
    const chosen = inspected.items.find(({ status }) => status === "ok")?.profile;
    if (chosen) identities.set(`${chosen.packageId}@${chosen.version}`, {
      packageId: chosen.packageId,
      version: chosen.version
    });
  }
  const contracts = [];
  for (const identity of identities.values()) {
    const result = RESOURCE_CATALOG.contracts([identity]);
    trace.push({ operation: "contracts", packages: [identity] });
    const item = result.items[0];
    if (item?.status !== "ok") {
      throw new StudyUnitProviderError(
        "assistance_component_contract_unavailable",
        `O contrato de ${identity.packageId}@${identity.version} não está disponível.`
      );
    }
    contracts.push(item.definition);
  }
  return { contracts, trace };
}

function instanceSchema(slot, contracts) {
  const alternatives = contracts.filter(({ manifest }) => manifest.slots.includes(slot))
    .map((definition) => ({
      type: "object",
      additionalProperties: false,
      required: ["id", "package", "version", "data"],
      properties: {
        id: { type: "string", minLength: 1, maxLength: 240 },
        package: { const: definition.package },
        version: { const: definition.version },
        data: strictComponentSchema(definition.schema)
      }
    }));
  return alternatives.length === 1 ? alternatives[0] : { oneOf: alternatives };
}

function schemaAllowsNull(schema) {
  return schema?.type === "null" ||
    Array.isArray(schema?.type) && schema.type.includes("null") ||
    list(schema?.anyOf).some(schemaAllowsNull) ||
    list(schema?.oneOf).some(schemaAllowsNull);
}

function strictComponentSchema(schema) {
  const result = clone(schema);
  if (!plainObject(result)) return result;
  if (result.type === "object" && plainObject(result.properties)) {
    const originallyRequired = new Set(list(result.required));
    result.properties = Object.fromEntries(Object.entries(result.properties)
      .map(([key, property]) => {
        const strict = strictComponentSchema(property);
        return [key, originallyRequired.has(key) || schemaAllowsNull(strict)
          ? strict
          : { anyOf: [strict, { type: "null" }] }];
      }));
    result.required = Object.keys(result.properties);
    result.additionalProperties = false;
  }
  if (result.type === "array" && result.items) {
    result.items = strictComponentSchema(result.items);
  }
  for (const keyword of ["anyOf", "oneOf", "allOf"]) {
    if (Array.isArray(result[keyword])) {
      result[keyword] = result[keyword].map(strictComponentSchema);
    }
  }
  return result;
}

function normalizeComponentData(value, schema) {
  if (schema?.type === "object" && plainObject(value) && plainObject(schema.properties)) {
    const result = clone(value);
    const required = new Set(list(schema.required));
    for (const [key, property] of Object.entries(schema.properties)) {
      if (!Object.hasOwn(result, key)) continue;
      if (result[key] === null && !required.has(key)) delete result[key];
      else result[key] = normalizeComponentData(result[key], property);
    }
    return result;
  }
  if (schema?.type === "array" && Array.isArray(value)) {
    return value.map((item) => normalizeComponentData(item, schema.items));
  }
  return clone(value);
}

function normalizeCandidateComponents(candidate, scope, contracts) {
  const definitions = new Map(contracts.map((definition) => [
    `${definition.package}@${definition.version}`,
    definition
  ]));
  const normalizeUnit = (unit) => {
    const result = clone(unit);
    const normalizeInstance = (instance) => {
      if (!plainObject(instance)) return instance;
      const definition = definitions.get(`${instance.package}@${instance.version}`);
      if (!definition) return instance;
      return { ...instance, data: normalizeComponentData(instance.data, definition.schema) };
    };
    result.content = list(result.content).map(normalizeInstance);
    if (result.response) result.response = normalizeInstance(result.response);
    result.feedback = list(result.feedback).map(normalizeInstance);
    return result;
  };
  if (scope === "study_unit") return normalizeUnit(candidate);
  if (scope === "didactic_microsequence") {
    return {
      ...normalizeOptionalMicrosequenceFields(candidate),
      studyUnits: list(candidate.studyUnits).map(normalizeUnit)
    };
  }
  return {
    microsequences: list(candidate.microsequences).map((microsequence) => ({
      ...normalizeOptionalMicrosequenceFields(microsequence),
      studyUnits: list(microsequence.studyUnits).map(normalizeUnit)
    }))
  };
}

function studyUnitSchema(contracts) {
  const content = instanceSchema("content", contracts);
  const response = instanceSchema("response", contracts);
  const feedback = instanceSchema("feedback", contracts);
  return {
    type: "object",
    additionalProperties: false,
    required: ["id", "position", "title", "role", "content", "response", "feedback", "topics"],
    properties: {
      id: { type: "string", minLength: 1, maxLength: 240 },
      position: { type: "integer", minimum: 1 },
      title: { type: "string", minLength: 1, maxLength: 300 },
      role: { type: "string", enum: ["theory", "practice"] },
      content: { type: "array", maxItems: 24, items: content },
      response: response.oneOf?.length || response.properties
        ? { anyOf: [{ type: "null" }, response] }
        : { type: "null" },
      feedback: feedback.oneOf?.length || feedback.properties
        ? { type: "array", maxItems: 12, items: feedback }
        : { type: "array", maxItems: 0 },
      topics: {
        type: "array",
        maxItems: 32,
        uniqueItems: true,
        items: { type: "string", minLength: 1, maxLength: 300 }
      }
    }
  };
}

function microsequenceSchema(contracts) {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "id", "title", "goal", "role", "branchOf", "dependsOn", "covers",
      "checks", "errors", "studyUnits"
    ],
    properties: {
      id: { type: "string", minLength: 1, maxLength: 240 },
      title: { type: "string", minLength: 1, maxLength: 300 },
      goal: { type: "string", minLength: 1, maxLength: 2_000 },
      role: { type: "string", enum: ["explain", "practice", "review", "support"] },
      branchOf: {
        anyOf: [
          { type: "null" },
          { type: "string", minLength: 1, maxLength: 240 }
        ]
      },
      dependsOn: { type: "array", uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 300 } },
      covers: { type: "array", uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 300 } },
      checks: { type: "array", uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 300 } },
      errors: { type: "array", uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 300 } },
      studyUnits: { type: "array", minItems: 1, maxItems: 48, items: studyUnitSchema(contracts) }
    }
  };
}

function candidateSchema(scope, contracts) {
  const candidate = scope === "study_unit"
    ? studyUnitSchema(contracts)
    : scope === "didactic_microsequence"
      ? microsequenceSchema(contracts)
      : {
          type: "object",
          additionalProperties: false,
          required: ["microsequences"],
          properties: {
            microsequences: {
              type: "array",
              minItems: 1,
              maxItems: 48,
              items: microsequenceSchema(contracts)
            }
          }
        };
  return {
    type: "object",
    additionalProperties: false,
    required: ["message", "candidate"],
    properties: {
      message: { type: "string", minLength: 1, maxLength: 1_600 },
      candidate
    }
  };
}

function normalizeOptionalMicrosequenceFields(value) {
  const normalized = clone(value);
  if (normalized.branchOf === "" || normalized.branchOf === null) delete normalized.branchOf;
  return normalized;
}

function replaceScope(project, selection, scope, candidate) {
  const result = clone(project);
  const path = findPath(result, selection);
  if (scope === "study_unit") {
    const index = path.microsequence.studyUnits.findIndex(({ id }) => id === path.studyUnit.id);
    path.microsequence.studyUnits[index] = clone(candidate);
  } else if (scope === "didactic_microsequence") {
    const index = path.lesson.microsequences.findIndex(({ id }) => id === path.microsequence.id);
    path.lesson.microsequences[index] = normalizeOptionalMicrosequenceFields(candidate);
  } else {
    path.lesson.microsequences = candidate.microsequences
      .map(normalizeOptionalMicrosequenceFields);
  }
  return result;
}

function unitsInTarget(scope, candidate) {
  if (scope === "study_unit") return [candidate];
  if (scope === "didactic_microsequence") return list(candidate.studyUnits);
  return list(candidate.microsequences).flatMap(({ studyUnits }) => list(studyUnits));
}

function validateRenderableCandidate({ project, selection, scope, candidate, intent }) {
  const errors = [];
  const current = findPath(project, selection);
  if (scope === "study_unit" && candidate.id !== current.studyUnit.id) {
    errors.push("A proposta deve preservar a identidade da Unidade escolhida.");
  }
  if (scope === "didactic_microsequence" && candidate.id !== current.microsequence.id) {
    errors.push("A proposta deve preservar a identidade da Microssequência escolhida.");
  }
  const proposedProject = replaceScope(project, selection, scope, candidate);
  for (const unit of unitsInTarget(scope, candidate)) {
    const validation = validateStudyUnitEnvelope(unit, RESOURCE_PACKAGE_REGISTRY);
    if (!validation.valid) errors.push(...validation.errors);
  }
  const projectValidation = validateProjectDocument(proposedProject);
  if (!projectValidation.ok) {
    errors.push(...projectValidation.errors.map(({ path, message }) => `${path}: ${message}`));
  }
  const previews = [];
  const audits = [];
  if (!errors.length) {
    for (const unit of unitsInTarget(scope, candidate)) {
      try {
        const descriptor = RESOURCE_CATALOG.previewStudyUnitDescriptor(unit);
        if (!descriptor.structural.valid || descriptor.previewMode !== "client_renderer") {
          errors.push(...descriptor.structural.errors);
          continue;
        }
        const rendered = renderStudyUnitEnvelope(unit, RESOURCE_PACKAGE_REGISTRY);
        if (!text(rendered.accessibleText) && !text(rendered.contentHtml)) {
          errors.push(`A Unidade ${unit.id} não produziu conteúdo renderizável.`);
          continue;
        }
        previews.push({ studyUnit: clone(unit), descriptor, rendered });
        audits.push(RESOURCE_CATALOG.auditRepresentation({
          studyUnit: unit,
          intent: { query: intent }
        }));
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "A prévia não pôde ser renderizada.");
      }
    }
  }
  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)].slice(0, 24),
    proposedProject,
    previews,
    audits
  };
}

function normalizedGenerated(raw) {
  if (!exactKeys(raw, new Set(["message", "candidate"])) ||
      !text(raw.message) || !plainObject(raw.candidate)) {
    throw new StudyUnitProviderError(
      "provider_structured_output_invalid",
      "A proposta não respeitou o contrato estruturado exigido."
    );
  }
  return { message: text(raw.message), candidate: clone(raw.candidate) };
}

export async function prepareCourseAssistanceProposal({
  project,
  selection,
  confirmedProposal,
  conversation = [],
  providerConfig,
  runtimeConfig = globalThis.__ARALEARN_ENV__ || {},
  fetchImpl = globalThis.fetch,
  signal
} = {}) {
  const scope = confirmedProposal?.scope;
  if (!SCOPES.has(scope) || !text(confirmedProposal?.summary) ||
      !Array.isArray(confirmedProposal?.componentNeeds)) {
    throw new TypeError("Confirme uma proposta válida antes de preparar a mudança.");
  }
  const { context, path } = buildCourseAssistanceContext({ project, selection, scope });
  const target = targetForScope(path, scope);
  const { contracts, trace } = discoverContracts(target, confirmedProposal);
  if (!contracts.length) {
    throw new StudyUnitProviderError(
      "assistance_component_contract_unavailable",
      "A proposta não possui contratos de componentes suficientes para ser gerada."
    );
  }
  const schema = candidateSchema(scope, contracts);
  const contractContext = contracts.map(({ package: packageId, version, contract, schema: dataSchema }) => ({
    package: packageId,
    version,
    contract,
    schema: dataSchema
  }));
  let priorCandidate = null;
  let validationErrors = [];
  for (let attempt = 0; attempt <= MAX_REPAIR_ATTEMPTS; attempt += 1) {
    let raw;
    try {
      raw = await providerCall({
        providerConfig,
        runtimeConfig,
        fetchImpl,
        signal,
        prompt: {
          system: "Prepare uma composição curricular tipada somente no escopo confirmado. " +
            "Use exclusivamente os contratos exatos fornecidos. Preserve identidades existentes quando o objeto continuar existindo, " +
            "use posições consecutivas a partir de 1 e não invente Fontes. Devolva somente o objeto do schema.",
          prompt: JSON.stringify({
            ...context,
            confirmedProposal: confirmedProposal.summary,
            conversation: compactConversation(conversation),
            exactComponentContracts: contractContext,
            repair: attempt === 0 ? null : {
              attempt,
              maximumAttempts: MAX_REPAIR_ATTEMPTS,
              errors: validationErrors,
              rejectedCandidate: priorCandidate
            }
          }),
          schema
        }
      });
      const generated = normalizedGenerated(raw);
      generated.candidate = normalizeCandidateComponents(
        generated.candidate,
        scope,
        contracts
      );
      priorCandidate = generated.candidate;
      const validation = validateRenderableCandidate({
        project,
        selection,
        scope,
        candidate: generated.candidate,
        intent: confirmedProposal.summary
      });
      trace.push({
        operation: "validate_study_unit",
        attempt,
        valid: validation.valid,
        errors: validation.errors
      });
      if (!validation.valid) {
        validationErrors = validation.errors;
        continue;
      }
      trace.push({ operation: "audit_representation", count: validation.audits.length });
      trace.push({ operation: "preview_study_unit", count: validation.previews.length });
      return Object.freeze({
        contract: "aralearn.course-assistance-proposal.v1",
        scope,
        message: generated.message,
        candidate: clone(generated.candidate),
        proposedProject: clone(validation.proposedProject),
        previews: clone(validation.previews),
        audits: clone(validation.audits),
        catalogTrace: clone(trace),
        repairCount: attempt,
        renderable: true
      });
    } catch (error) {
      if (error instanceof StudyUnitProviderError &&
          error.code === "provider_structured_output_invalid" &&
          attempt < MAX_REPAIR_ATTEMPTS) {
        validationErrors = [{
          code: error.code,
          message: "A saída não pôde ser lida como a composição estruturada exigida."
        }];
        priorCandidate = null;
        trace.push({
          operation: "validate_study_unit",
          attempt,
          valid: false,
          errors: clone(validationErrors)
        });
        continue;
      }
      throw error;
    }
  }
  const invalidCandidateError = new StudyUnitProviderError(
    "assistance_candidate_invalid",
    "A proposta não pôde ser validada e renderizada. O conteúdo original foi preservado."
  );
  invalidCandidateError.validationErrors = Object.freeze(clone(validationErrors));
  throw invalidCandidateError;
}

export const COURSE_ASSISTANCE_LIMITS = Object.freeze({
  maximumConversationTurns: MAX_TURNS,
  maximumRequestLength: MAX_REQUEST_LENGTH,
  maximumContextBytes: MAX_CONTEXT_BYTES,
  maximumRepairAttempts: MAX_REPAIR_ATTEMPTS
});
