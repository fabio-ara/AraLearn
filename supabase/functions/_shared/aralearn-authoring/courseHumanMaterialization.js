import { AuthoringApiError } from "./errors.js";
import {
  executeTrustedCourseWrite,
  resolveHumanCourseContext
} from "./courseHumanTaskExecutor.js";
import { validateCourseEntityContent } from
  "../aralearn/runtime/domain/courseEntities.js";
import { observeCoursePracticeDistribution } from
  "../aralearn/runtime/domain/coursePracticeDistribution.js";
import { normalizeCourseSourceLinks } from "../aralearn/runtime/domain/courseSources.js";
import { normalizeCourseSourceOccurrence } from "../aralearn/runtime/domain/courseSourceOccurrences.js";
import {
  COURSE_DESIGN_PARAMETER_DEFINITIONS,
  COURSE_DESIGN_PARAMETER_CATALOG_VERSION,
  EXPLANATION_FORMS,
  PRACTICE_VARIATION_DIMENSIONS,
  normalizeCourseDesignParameterValue
} from "../aralearn/runtime/domain/courseDesignParameters.js";

const MAX_PART_STUDY_UNIT_PAGES = 100;
export const HUMAN_SOURCE_ROLES = Object.freeze({
  escopo_curricular: "curricular_scope", evidencia_de_avaliacao: "assessment_evidence",
  tecnica_conceitual: "technical_conceptual", leitura_complementar: "recommended_reading"
});

export function resolveHumanSourceRoles(value, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || value.length > 4 || (!allowEmpty && value.length === 0) ||
      value.some((role) => !Object.hasOwn(HUMAN_SOURCE_ROLES, role)) || new Set(value).size !== value.length) {
    fail("invalid_human_source_roles", "Informe explicitamente os papéis de uso da fonte, sem repetições.");
  }
  return value.map((role) => HUMAN_SOURCE_ROLES[role]);
}

export async function resolveHumanSourceOccurrences({ requested = [], content, newId, identityPrefix }) {
  if (!Array.isArray(requested) || requested.length > 16) fail("invalid_human_source_occurrence", "Informe até 16 ocorrências.");
  const slots = { conteudo: "content", resposta: "response", feedback: "feedback" };
  const fields = new Set(["lugar", "recurso", "folha", "trecho", "prefixo", "sufixo"]);
  return await Promise.all(requested.map(async (entry, index) => {
    if (!plainObject(entry) || Object.keys(entry).some((key) => !fields.has(key)) ||
        !Object.hasOwn(slots, entry.lugar) || !Number.isSafeInteger(entry.recurso) || entry.recurso < 1) {
      fail("invalid_human_source_occurrence", "Informe o lugar, a posição do recurso e o trecho literal da ocorrência.");
    }
    const slot = slots[entry.lugar];
    const instances = slot === "response" ? (content?.response ? [content.response] : []) : content?.[slot];
    const resource = Array.isArray(instances) ? instances[entry.recurso - 1] : null;
    if (!resource?.id) fail("human_reference_not_found", "O recurso da ocorrência não foi localizado.", 404);
    return normalizeCourseSourceOccurrence({ occurrenceId: await newId(`${identityPrefix}:occurrence:${index}`),
      slot, resourceId: resource.id, path: entry.folha, quote: entry.trecho,
      prefix: entry.prefixo ?? null, suffix: entry.sufixo ?? null });
  }));
}
const UNIT_PARAMETER_FIELD_TO_ID = Object.freeze(Object.fromEntries(
  COURSE_DESIGN_PARAMETER_DEFINITIONS.map(({ humanField, id }) => [humanField, id])
));
const EXPLANATION_FORM_LABELS = COURSE_DESIGN_PARAMETER_DEFINITIONS
  .find(({ id }) => id === "required_explanation_forms").optionLabels;

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizedText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function fail(code, message, status = 422) {
  throw new AuthoringApiError(status, code, message);
}

function reference(value, label) {
  if (Number.isSafeInteger(value) && value >= 1) return { kind: "position", value };
  if (typeof value === "string" && value === value.trim() && normalizedText(value)) {
    return { kind: "text", value: normalizedText(value) };
  }
  return fail("invalid_human_reference", `${label} precisa ser um título ou posição a partir de 1.`);
}

function resolveReference(items, value, { position, texts, label }) {
  const requested = reference(value, label);
  let matches;
  if (requested.kind === "position") {
    matches = items.filter((item, index) => {
      const stored = Number(position(item));
      return Number.isSafeInteger(stored)
        ? stored + 1 === requested.value
        : index + 1 === requested.value;
    });
  } else {
    matches = items.filter((item) => texts(item).some((text) =>
      normalizedText(text) === requested.value));
  }
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    return fail("ambiguous_human_reference", `${label} é ambígua.`, 409);
  }
  return fail("human_reference_not_found", `${label} não foi localizada.`, 404);
}

function partMicrosequences(part) {
  return Array.isArray(part?.microsequences) ? part.microsequences : [];
}

function existingStudyUnitSlot(item) {
  const microsequenceId = item?.curriculumPath?.didacticMicrosequence?.id;
  const position = Number(item?.studyUnit?.position);
  const studyUnitId = item?.studyUnit?.id;
  if (typeof microsequenceId !== "string" || !microsequenceId ||
      !Number.isSafeInteger(position) || position < 1 ||
      typeof studyUnitId !== "string" || !studyUnitId) {
    fail(
      "course_service_unavailable",
      "Uma unidade de estudo existente da parte não possui posição curricular válida.",
      503
    );
  }
  return { key: `${microsequenceId}\0${position}`, studyUnitId };
}

async function listExistingPartStudyUnits({ adapter, principal, context, deadlineAt }) {
  const bySlot = new Map();
  const seenIds = new Set();
  const seenCursors = new Set();
  let cursorStudyUnitId = null;
  for (let pageIndex = 0; pageIndex < MAX_PART_STUDY_UNIT_PAGES; pageIndex += 1) {
    const cursorKey = cursorStudyUnitId ?? "null";
    if (seenCursors.has(cursorKey)) {
      fail("course_service_unavailable", "A paginação da parte repetiu o mesmo ponto.", 503);
    }
    seenCursors.add(cursorKey);
    const page = await adapter.listCourseStudyUnits({
      principal,
      courseId: context.course.id,
      expectedRevision: context.course.revision,
      scopeKind: "authoring_part",
      scopeId: context.part.id,
      cursorStudyUnitId,
      direction: "forward",
      limit: 24,
      maxBytes: 512 * 1024,
      inspectionVersion: 2,
      deadlineAt
    });
    if (!plainObject(page) || !Array.isArray(page.items)) {
      fail("course_service_unavailable", "A lista de unidades de estudo da parte é inválida.", 503);
    }
    for (const item of page.items) {
      const slot = existingStudyUnitSlot(item);
      if (seenIds.has(slot.studyUnitId) || bySlot.has(slot.key)) {
        fail("course_service_unavailable", "A parte possui posições de unidade de estudo duplicadas.", 503);
      }
      seenIds.add(slot.studyUnitId);
      bySlot.set(slot.key, { studyUnitId: slot.studyUnitId });
    }
    if (page.hasMore !== true) return bySlot;
    const next = page.nextCursor?.studyUnitId;
    if (typeof next !== "string" || !next) {
      fail("course_service_unavailable", "A paginação da parte perdeu o ponto de retomada.", 503);
    }
    cursorStudyUnitId = next;
  }
  fail("course_service_unavailable", "A parte excedeu o limite seguro de paginação.", 503);
}

function planItems(plan, collection) {
  return Array.isArray(plan?.plan?.[collection]) ? plan.plan[collection] : [];
}

function resolvePlanItem(plan, collection, value, label) {
  return resolveReference(planItems(plan, collection), value, {
    position: () => Number.NaN,
    texts: (item) => [item.statement],
    label
  });
}

function boundedText(value, label, maximum) {
  if (typeof value !== "string" || value !== value.trim() || !value ||
      [...value].length > maximum || [...value].some((character) => {
        const code = character.codePointAt(0);
        return code <= 8 || code === 11 || code === 12 ||
          code >= 14 && code <= 31 || code === 127;
      })) {
    fail("invalid_human_materialization", `${label} é inválido.`);
  }
  return value;
}

function analysisDefinition(value) {
  if (!plainObject(value) ||
      Object.keys(value).length !== 2 ||
      !Object.hasOwn(value, "nome") || !Object.hasOwn(value, "descricao")) {
    return null;
  }
  return {
    statement: boundedText(value.nome, "O nome da ideia", 2_000),
    description: boundedText(value.descricao, "A descrição da ideia", 4_000)
  };
}

async function preparePlanInventory({ context, units, newId }) {
  const analysisUnits = planItems(context.plan, "instructionalAnalysisUnits")
    .map((item) => ({ ...item }));
  const evidenceRequirements = planItems(context.plan, "evidenceRequirements")
    .map((item) => ({ ...item }));
  const upserts = [];

  const uniqueMatch = (items, statement, label) => {
    const matches = items.filter((item) =>
      normalizedText(item?.statement) === normalizedText(statement));
    if (matches.length > 1) {
      fail("ambiguous_semantic_inventory_item", `${label} aparece mais de uma vez no repertório.`, 409);
    }
    return matches[0] ?? null;
  };

  for (const unit of units) {
    for (const requested of unit.aplicacaoPedagogica.ideiasIntroduzidas) {
      const definition = analysisDefinition(requested);
      if (!definition) continue;
      let item = uniqueMatch(analysisUnits, definition.statement, "A ideia");
      if (item) {
        const currentDescription = String(item.description || "").trim();
        if (currentDescription &&
            normalizedText(currentDescription) !== normalizedText(definition.description)) {
          fail(
            "analysis_unit_description_mismatch",
            `A ideia “${definition.statement}” já existe com outra descrição.`,
            409
          );
        }
        if (!currentDescription) {
          item.description = definition.description;
          upserts.push({
            id: item.id,
            kind: "instructional_analysis_unit",
            position: Number(item.position),
            statement: item.statement,
            description: item.description
          });
        }
      } else {
        item = {
          id: await newId(`analysis-unit:${normalizedText(definition.statement)}`),
          position: analysisUnits.reduce((maximum, entry) => {
            const position = Number(entry?.position);
            return Math.max(maximum, Number.isSafeInteger(position) ? position : -1);
          }, -1) + 1,
          statement: definition.statement,
          description: definition.description,
          introducedAt: null,
          usedBy: [],
          revisitedBy: []
        };
        analysisUnits.push(item);
        upserts.push({
          id: item.id,
          kind: "instructional_analysis_unit",
          position: item.position,
          statement: item.statement,
          description: item.description
        });
      }
    }
  }

  for (const unit of units) {
    for (const practice of unit.aplicacaoPedagogica.praticas) {
      if (typeof practice?.requisito !== "string") continue;
      const statement = boundedText(practice.requisito, "O critério da prática", 2_000);
      if (uniqueMatch(evidenceRequirements, statement, "O critério da prática")) continue;
      const item = {
        id: await newId(`evidence-requirement:${normalizedText(statement)}`),
        position: evidenceRequirements.reduce((maximum, entry) => {
          const position = Number(entry?.position);
          return Math.max(maximum, Number.isSafeInteger(position) ? position : -1);
        }, -1) + 1,
        statement
      };
      evidenceRequirements.push(item);
      upserts.push({
        id: item.id,
        kind: "evidence_requirement",
        position: item.position,
        statement: item.statement,
        description: ""
      });
    }
  }

  context.plan.plan.instructionalAnalysisUnits = analysisUnits;
  context.plan.plan.evidenceRequirements = evidenceRequirements;
  return { analysisUnits, evidenceRequirements, upserts };
}

function resolveAnchor(anchors, value) {
  return resolveReference(anchors, value, {
    position: () => Number.NaN,
    texts: (anchor) => [
      anchor.humanLocator,
      anchor.verificationExcerpt
    ],
    label: "A âncora"
  });
}

export async function resolveHumanSourceLinks({
  adapter,
  principal,
  courseContext,
  requested,
  deadlineAt,
  sourceCache = new Map(),
  newId,
  content,
  identityPrefix = "source-link"
}) {
  if (!Array.isArray(requested) || requested.length > 32) {
    fail("invalid_human_materialization", "Informe até 32 vínculos de fontes.");
  }
  if (!requested.length) return [];
  const links = [];
  for (const [index, entry] of requested.entries()) {
    if (!plainObject(entry) || !Object.hasOwn(entry, "fonte") ||
        typeof entry.relacao !== "string" ||
        Object.keys(entry).some((key) => !["fonte", "relacao", "papeis", "ancoras", "ocorrencias"].includes(key))) {
      fail("invalid_human_materialization", "Um vínculo de fonte da unidade de estudo é inválido.");
    }
    const cacheKey = `${typeof entry.fonte}:${String(entry.fonte)}`;
    let source = sourceCache.get(cacheKey);
    if (!source) {
      const resolved = await resolveHumanCourseContext({
        adapter,
        principal,
        course: courseContext.course.title,
        source: entry.fonte,
        deadlineAt
      });
      const detail = await adapter.getCourseSources({
        principal,
        courseId: courseContext.course.id,
        expectedRevision: courseContext.course.revision,
        mode: "source",
        sourceId: resolved.source.sourceId,
        targetKind: null,
        targetId: null,
        cursor: null,
        limit: 1,
        deadlineAt
      });
      const current = Array.isArray(detail?.items) && detail.items.length === 1
        ? detail.items[0]
        : null;
      if (!current || current.sourceId !== resolved.source.sourceId ||
          Number(current.revision) !== Number(resolved.source.revision)) {
        fail("human_reference_not_found", "A fonte corrente não foi localizada.", 404);
      }
      source = {
        sourceId: current.sourceId,
        anchors: (Array.isArray(current.anchors) ? current.anchors : [])
          .filter((anchor) => anchor.status == null || anchor.status === "active")
      };
      sourceCache.set(cacheKey, source);
    }
    if (entry.ancoras !== undefined && (!Array.isArray(entry.ancoras) || entry.ancoras.length > 8)) {
      fail("invalid_human_source_anchor", "Informe até oito âncoras do vínculo.");
    }
    const requestedAnchors = entry.ancoras ?? [];
    const selectedAnchors = requestedAnchors.map((anchor) => resolveAnchor(source.anchors, anchor));
    if (entry.relacao === "quoted_from" && !selectedAnchors.length) {
      fail("invalid_human_source_anchor", "Uma citação direta exige a localização informada na fonte.");
    }
    links.push({
      linkId: await newId(`${identityPrefix}:${index}`),
      sourceId: source.sourceId,
      relation: entry.relacao,
      roles: resolveHumanSourceRoles(entry.papeis),
      occurrences: await resolveHumanSourceOccurrences({ requested: entry.ocorrencias, content, newId,
        identityPrefix: `${identityPrefix}:${index}` }),
      anchors: selectedAnchors.map((anchor) => ({
        anchorId: anchor.anchorId
      }))
    });
  }
  return normalizeCourseSourceLinks(links);
}

function componentRefs(content) {
  const instances = [
    ...(Array.isArray(content?.content) ? content.content : []),
    ...(content?.response ? [content.response] : []),
    ...(Array.isArray(content?.feedback) ? content.feedback : [])
  ];
  return [...new Set(instances.map((instance) => {
    const packageId = String(instance?.package || "");
    const version = String(instance?.version || "");
    return packageId && version ? `${packageId}@${version}` : "";
  }).filter(Boolean))].sort((left, right) => left.localeCompare(right, "en"));
}

function validateUnitConfiguration(configuration) {
  if (configuration === undefined) return;
  if (!plainObject(configuration) || Object.keys(configuration).some((field) =>
    !["parametros", "motivo", "direcaoEditorial"].includes(field)) ||
    !plainObject(configuration.parametros) || !Object.keys(configuration.parametros).length ||
    Object.keys(configuration.parametros).some((field) => !Object.hasOwn(UNIT_PARAMETER_FIELD_TO_ID, field))) {
    fail("invalid_human_materialization", "A calibração da unidade de estudo é inválida.");
  }
  boundedText(configuration.motivo, "O motivo da escolha contextual", 1000);
  for (const [field, value] of Object.entries(configuration.parametros)) {
    try { normalizeCourseDesignParameterValue(UNIT_PARAMETER_FIELD_TO_ID[field], value); }
    catch { fail("invalid_human_materialization", "A escolha contextual diverge do catálogo."); }
  }
  if (configuration.direcaoEditorial !== undefined) {
    boundedText(configuration.direcaoEditorial, "A direção editorial", 4000);
  }
}

function pedagogicalMode(unit) {
  if (unit.conteudo.role === "theory") return "expository";
  return unit.aplicacaoPedagogica.explicacoes.length ? "mixed" : "practice";
}

function validateUnits(units) {
  if (!Array.isArray(units) || units.length < 1 || units.length > 64) {
    fail("invalid_human_materialization", "A materialização precisa conter de 1 a 64 unidades de estudo.");
  }
  for (const [index, unit] of units.entries()) {
    if (!plainObject(unit) || !plainObject(unit.conteudo) ||
        !plainObject(unit.aplicacaoPedagogica) ||
        !Number.isSafeInteger(unit.posicao) || unit.posicao < 1 ||
        !Array.isArray(unit.aplicacaoPedagogica.ideiasIntroduzidas) ||
        !Array.isArray(unit.aplicacaoPedagogica.ideiasUtilizadas) ||
        !Array.isArray(unit.aplicacaoPedagogica.explicacoes) ||
        !Array.isArray(unit.aplicacaoPedagogica.praticas) ||
        !Array.isArray(unit.aplicacaoPedagogica.cobertura) ||
        unit.fontes != null && !Array.isArray(unit.fontes)) {
      fail(
        "invalid_human_materialization",
        `A unidade de estudo ${index + 1} possui conteúdo ou aplicação pedagógica inválida.`
      );
    }
    validateUnitConfiguration(unit.configuracao);
  }
}

async function prepareUnits({ adapter, principal, context, units, deadlineAt, newId }) {
  const microsequences = partMicrosequences(context.part);
  if (!microsequences.length) {
    fail("human_part_has_no_microsequences", "A parte ainda não possui microssequências para materializar.");
  }
  const inventory = await preparePlanInventory({ context, units, newId });
  const groups = new Map();
  const sourceCache = new Map();
  for (const [unitIndex, unit] of units.entries()) {
    const microsequence = resolveReference(microsequences, unit.microssequencia, {
      position: (item) => item.productionPosition ?? item.position,
      texts: (item) => [item.title],
      label: "A microssequência"
    });
    const noveltyIds = unit.aplicacaoPedagogica.ideiasIntroduzidas.map((value) => (
      resolvePlanItem(
        context.plan,
        "instructionalAnalysisUnits",
        analysisDefinition(value)?.statement ?? value,
        "A ideia do repertório"
      ).id
    ));
    const usedIds = unit.aplicacaoPedagogica.ideiasUtilizadas.map((value) => (
      resolvePlanItem(
        context.plan,
        "instructionalAnalysisUnits",
        value,
        "A ideia do repertório"
      ).id
    ));
    const curriculumScopeItemIds = unit.aplicacaoPedagogica.cobertura.map((value) => {
      const scopeItem = resolvePlanItem(
        context.plan,
        "curriculumScopeItems",
        value,
        "O item de cobertura curricular"
      );
      const belongsToMicrosequence = Array.isArray(scopeItem.curriculumTargets) &&
        scopeItem.curriculumTargets.some((target) =>
          Array.isArray(target?.didacticMicrosequenceIds) &&
          target.didacticMicrosequenceIds.includes(microsequence.id));
      if (!belongsToMicrosequence) {
        fail(
          "human_materialization_scope_outside_map",
          "Um item de cobertura não pertence à microssequência desta unidade de estudo."
        );
      }
      return scopeItem.id;
    });
    if (new Set(curriculumScopeItemIds).size !== curriculumScopeItemIds.length) {
      fail("duplicate_human_reference", "A unidade de estudo repete o mesmo item de cobertura.");
    }
    const explanations = unit.aplicacaoPedagogica.explicacoes.map((entry) => {
      if (!plainObject(entry) || !Array.isArray(entry.formas)) {
        fail("invalid_human_materialization", "Uma aplicação de explicação é inválida.");
      }
      if (entry.formas.length > EXPLANATION_FORMS.length ||
          new Set(entry.formas).size !== entry.formas.length ||
          entry.formas.some((form) => !EXPLANATION_FORMS.includes(form))) {
        fail("invalid_human_materialization", "As formas de explicação são inválidas.");
      }
      const notApplicable = entry.formasNaoAplicaveis == null
        ? []
        : Array.isArray(entry.formasNaoAplicaveis)
          ? entry.formasNaoAplicaveis.map((item) => {
              if (!plainObject(item) || !EXPLANATION_FORMS.includes(item.forma) ||
                  typeof item.motivo !== "string" || !item.motivo.trim() ||
                  [...item.motivo.trim()].length > 240) {
                fail("invalid_human_materialization", "Uma forma não aplicável é inválida.");
              }
              return { form: item.forma, reason: item.motivo.trim() };
            })
          : fail("invalid_human_materialization", "As formas não aplicáveis são inválidas.");
      if (!entry.formas.length && !notApplicable.length ||
          new Set(notApplicable.map(({ form }) => form)).size !== notApplicable.length ||
          notApplicable.some(({ form }) => entry.formas.includes(form))) {
        fail("invalid_human_materialization", "As formas aplicadas e não aplicáveis são incoerentes.");
      }
      return {
        instructionalAnalysisUnitId: resolvePlanItem(
          context.plan,
          "instructionalAnalysisUnits",
          entry.ideia,
          "A ideia do repertório"
        ).id,
        developedForms: [...entry.formas],
        notApplicable
      };
    });
    const practices = unit.aplicacaoPedagogica.praticas.map((entry) => {
      if (!plainObject(entry) || typeof entry.oportunidade !== "string" ||
          !entry.oportunidade.trim() || [...entry.oportunidade.trim()].length > 240 ||
          !Array.isArray(entry.dimensoesVariadas) ||
          new Set(entry.dimensoesVariadas).size !== entry.dimensoesVariadas.length ||
          entry.dimensoesVariadas.some((dimension) =>
            !PRACTICE_VARIATION_DIMENSIONS.includes(dimension))) {
        fail("invalid_human_materialization", "Uma aplicação de prática é inválida.");
      }
      const requirement = resolvePlanItem(
        context.plan,
        "evidenceRequirements",
        entry.requisito,
        "O requisito de evidência"
      );
      return {
        evidenceRequirementId: requirement.id,
        opportunityId: entry.oportunidade.trim(),
        invariantTaskOperation: requirement.statement,
        variedDimensions: [...entry.dimensoesVariadas]
      };
    });
    const validation = validateCourseEntityContent("study_unit", {
      ...unit.conteudo,
      id: `human-preflight-${unitIndex + 1}`,
      position: unit.posicao
    });
    if (!validation.valid) {
      const reasons = validation.errors
        .map((error) => typeof error === "string" ? error : error?.message)
        .filter((message) => typeof message === "string" && message.trim());
      fail(
        "invalid_human_study_unit",
        `A unidade de estudo ${unit.posicao} é inválida: ${reasons.join(" ")}`
      );
    }
    const content = structuredClone(validation.normalized);
    delete content.id;
    delete content.position;
    const prepared = {
      inputIndex: unitIndex,
      source: unit,
      microsequence,
      noveltyIds,
      usedIds,
      curriculumScopeItemIds,
      explanations,
      practices,
      content,
      sourceLinks: await resolveHumanSourceLinks({
        adapter,
        principal,
        courseContext: context,
        requested: unit.fontes || [],
        deadlineAt,
        sourceCache,
        newId,
        content,
        identityPrefix: `study-unit:${unitIndex}:source-link`
      })
    };
    if (!groups.has(microsequence.id)) groups.set(microsequence.id, []);
    groups.get(microsequence.id).push(prepared);
  }
  const productionPositionById = new Map(microsequences.map((item, index) => [
    item.id,
    Number(item.productionPosition ?? item.position ?? index)
  ]));
  return {
    inventory,
    groups: [...groups.entries()].map(([microsequenceId, values]) => {
    if (new Set(values.map(({ source }) => source.posicao)).size !== values.length) {
      fail(
        "invalid_human_materialization",
        "A mesma microssequência não pode repetir a posição de uma unidade de estudo."
      );
    }
      return {
      microsequenceId,
      units: values.sort((left, right) => left.source.posicao - right.source.posicao)
      };
    }).sort((left, right) => (
      productionPositionById.get(left.microsequenceId) -
      productionPositionById.get(right.microsequenceId)
    ))
  };
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function existingConfigurationConflict() {
  fail(
    "human_materialization_existing_configuration_conflict",
    "Esta unidade já possui outra configuração. Ajuste a configuração antes de revisar o conteúdo."
  );
}

function applyUnitContextualCalibration(design, configuration, { existing = false } = {}) {
  if (design?.parameters?.some((parameter) => parameter.conflicts?.length)) {
    fail("human_materialization_configuration_conflict", "Resolva a condição fixa e sua exceção antes de produzir.", 409);
  }
  if (configuration === undefined) return design;
  const calibrated = structuredClone(design);
  const requestedParameters = Object.entries(configuration.parametros);
  const fixedOrigins = new Set(["author", "research_condition"]);
  for (const [field, requestedValue] of requestedParameters) {
    if (requestedValue === null) continue;
    const parameterId = UNIT_PARAMETER_FIELD_TO_ID[field];
    const parameter = calibrated.parameters?.find((entry) =>
      entry.parameterId === parameterId);
    if (!parameter?.effectiveAssignment) {
      fail("course_service_unavailable", "A configuração da unidade divergiu do catálogo.", 503);
    }
    let value;
    try {
      value = normalizeCourseDesignParameterValue(parameterId, requestedValue);
    } catch (error) {
      fail(
        "invalid_human_materialization",
        error instanceof Error ? error.message : "Um parâmetro da unidade é inválido."
      );
    }
    if (existing) {
      if (!sameJson(parameter.effectiveAssignment.value, value)) {
        existingConfigurationConflict();
      }
      continue;
    }
    if (parameter.effectiveAssignment.mode === "fixed" && fixedOrigins.has(parameter.effectiveAssignment.origin)) {
      if (!sameJson(parameter.effectiveAssignment.value, value)) {
        fail(
          "human_materialization_fixed_configuration_conflict",
          "A calibração automática da unidade não pode substituir uma condição fixada."
        );
      }
      continue;
    }
    const definition = COURSE_DESIGN_PARAMETER_DEFINITIONS.find(({ id }) => id === parameterId);
    parameter.effectiveAssignment = {
      mode: "automatic",
      value: structuredClone(value),
      inherited: false,
      origin: "automatic",
      reason: configuration.motivo.trim(),
      sourceScope: definition.supportedScopes.includes("study_unit")
        ? { kind: "study_unit", ref: "pending-study-unit" }
        : { kind: "course", ref: design.courseId }
    };
  }
  if (configuration.direcaoEditorial !== undefined) {
    const guidance = boundedText(
      configuration.direcaoEditorial,
      "A direção editorial da unidade",
      4_000
    );
    const effective = Array.isArray(calibrated.guidance?.effectiveAssignments)
      ? calibrated.guidance.effectiveAssignments
      : [];
    if (existing) {
      if (!effective.some((assignment) => assignment?.guidance === guidance)) {
        existingConfigurationConflict();
      }
      return calibrated;
    }
    const fixed = effective.filter((assignment) => fixedOrigins.has(assignment?.origin));
    if (fixed.length && !fixed.some((assignment) => assignment.guidance === guidance)) {
      fail(
        "human_materialization_fixed_configuration_conflict",
        "A direção automática da unidade não pode substituir uma condição fixada."
      );
    }
    if (!fixed.length && !effective.some((assignment) =>
      assignment?.guidance === guidance)) {
      effective.push({
        guidance,
        inherited: false,
        origin: "automatic",
        reason: "Direção editorial calibrada automaticamente para esta unidade de estudo.",
        sourceScope: { kind: "study_unit", ref: "pending-study-unit" }
      });
    }
    calibrated.guidance = {
      ...(calibrated.guidance ?? {}),
      effectiveAssignments: effective
    };
  }
  return calibrated;
}

function designSnapshot(design, microsequenceId) {
  const parameters = Array.isArray(design?.parameters) ? design.parameters : [];
  const directions = Array.isArray(design?.guidance?.effectiveAssignments)
    ? design.guidance.effectiveAssignments
    : [];
  const targetPlanItems = design?.targetPlanItems;
  const policy = design?.componentPolicy?.effectiveAssignment;
  if (parameters.length !== COURSE_DESIGN_PARAMETER_DEFINITIONS.length ||
      !plainObject(targetPlanItems) || !plainObject(policy)) {
    fail(
      "course_service_unavailable",
      "A configuração corrente da microssequência está incompleta.",
      503
    );
  }
  if (parameters.some((parameter) =>
    parameter?.effectiveAssignment?.value === null ||
    parameter?.effectiveAssignment?.value === undefined)) {
    fail(
      "human_materialization_contextual_calibration_required",
      "Uma unidade nova ainda está sem calibração contextual.",
      409
    );
  }
  return {
    contract: "aralearn.study-unit-design-snapshot.v2",
    parameterCatalogVersion: COURSE_DESIGN_PARAMETER_CATALOG_VERSION,
    didacticMicrosequenceId: microsequenceId,
    instructionalAnalysisUnitIds: [...targetPlanItems.instructionalAnalysisUnitIds],
    evidenceRequirementIds: [...targetPlanItems.evidenceRequirementIds],
    parameters: parameters.map((parameter) => ({
      parameterId: parameter.parameterId,
      value: structuredClone(parameter.effectiveAssignment.value),
      origin: parameter.effectiveAssignment.origin,
      reason: parameter.effectiveAssignment.reason,
      sourceScopeKind: parameter.effectiveAssignment.sourceScope?.kind ?? null
    })),
    editorialDirections: directions.map((direction) => ({
      direction: direction.guidance,
      origin: direction.origin,
      sourceScopeKind: direction.sourceScope?.kind ?? null
    })),
    componentPolicy: {
      policy: structuredClone(policy.policy),
      origin: policy.origin,
      sourceScopeKind: policy.sourceScope?.kind ?? null
    }
  };
}

function unitDesignApplication(unit) {
  return {
    mode: pedagogicalMode(unit.source),
    introducedInstructionalAnalysisUnitIds: unit.noveltyIds,
    explanationApplications: unit.explanations,
    usedInstructionalAnalysisUnitIds: unit.usedIds,
    curriculumScopeItemIds: unit.curriculumScopeItemIds,
    practiceApplications: unit.practices,
    componentRefs: componentRefs(unit.content)
  };
}

const PARAMETER_IDS = Object.freeze({
  ceiling: "new_analysis_unit_ceiling_per_expository_study_unit",
  explanationForms: "required_explanation_forms",
  practiceMinimum: "minimum_distinct_practice_opportunities_per_evidence_requirement",
  variationDimensions: "required_practice_variation_dimensions"
});

function effectiveParameter(design, parameterId) {
  const parameter = Array.isArray(design?.parameters)
    ? design.parameters.find((item) => item.parameterId === parameterId)
    : null;
  if (!plainObject(parameter?.effectiveAssignment)) {
    fail("course_service_unavailable", "A configuração pedagógica efetiva está incompleta.", 503);
  }
  return parameter.effectiveAssignment.value;
}

function validateComponentPolicy(componentRefsValue, policy) {
  const componentRefsSet = new Set(componentRefsValue);
  const excluded = new Set(policy.excludedRefs || []);
  const allowed = new Set(policy.allowedRefs || []);
  if ([...componentRefsSet].some((ref) => excluded.has(ref) ||
      policy.availability === "allow_only" && !allowed.has(ref))) {
    fail(
      "human_materialization_component_policy_violation",
      "Uma unidade de estudo usa um componente fora da política efetiva."
    );
  }
}

function curriculumMicrosequenceOrder(plan) {
  const result = new Map();
  const body = plainObject(plan?.plan) ? plan.plan : plan;
  const modules = Array.isArray(body?.curriculum?.modules) ? body.curriculum.modules : [];
  for (const moduleValue of modules) {
    const lessons = Array.isArray(moduleValue?.lessons) ? moduleValue.lessons : [];
    for (const lesson of lessons) {
      const microsequences = Array.isArray(lesson?.microsequences) ? lesson.microsequences : [];
      for (const microsequence of microsequences) {
        if (typeof microsequence?.id !== "string" || !microsequence.id ||
            result.has(microsequence.id)) {
          fail("course_service_unavailable", "A ordem curricular das microssequências é inválida.", 503);
        }
        result.set(microsequence.id, result.size);
      }
    }
  }
  return result;
}

function plannedCurriculumScopeIds(plan, microsequenceId) {
  return planItems(plan, "curriculumScopeItems")
    .filter((item) => Array.isArray(item?.curriculumTargets) &&
      item.curriculumTargets.some((target) =>
        Array.isArray(target?.didacticMicrosequenceIds) &&
        target.didacticMicrosequenceIds.includes(microsequenceId)))
    .map(({ id }) => id);
}

function establishedAnalysisUnitIds(
  plan,
  replacedStudyUnitIds,
  beforeMicrosequence,
  curriculumOrder
) {
  return new Set(planItems(plan, "instructionalAnalysisUnits")
    .filter((item) => {
      const introducedAt = item?.introducedAt;
      const studyUnitId = introducedAt?.studyUnitId;
      if (!(typeof item?.id === "string" && item.id &&
        plainObject(introducedAt) && typeof studyUnitId === "string" && studyUnitId &&
        !replacedStudyUnitIds.has(studyUnitId))) return false;
      const introductionOrder = curriculumOrder.get(introducedAt.didacticMicrosequenceId);
      if (!Number.isSafeInteger(introductionOrder)) {
        fail("course_service_unavailable", "A introdução de uma ideia não pertence ao mapa curricular.", 503);
      }
      return introductionOrder < beforeMicrosequence;
    })
    .map(({ id }) => id));
}

function introducedAnalysisUnitIds(plan, replacedStudyUnitIds) {
  return new Set(planItems(plan, "instructionalAnalysisUnits")
    .filter((item) => typeof item?.id === "string" && item.id &&
      plainObject(item?.introducedAt) &&
      typeof item.introducedAt.studyUnitId === "string" &&
      item.introducedAt.studyUnitId &&
      !replacedStudyUnitIds.has(item.introducedAt.studyUnitId))
    .map(({ id }) => id));
}

function orderedPlanItemIds(items, requestedIds) {
  const requested = new Set(requestedIds);
  const ordered = items
    .filter((item) => requested.has(item?.id))
    .sort((left, right) => Number(left.position) - Number(right.position))
    .map(({ id }) => id);
  if (ordered.length !== requested.size) {
    fail("course_service_unavailable", "O repertório focal divergiu do planejamento.", 503);
  }
  return ordered;
}

function applyGroupTargetPlans(groups, plan) {
  const analysisItems = planItems(plan, "instructionalAnalysisUnits");
  const evidenceItems = planItems(plan, "evidenceRequirements");
  return groups.map((group) => {
    const analysisIds = new Set();
    const evidenceIds = new Set();
    for (const unit of group.units) {
      const current = unit.design?.targetPlanItems;
      for (const id of current?.instructionalAnalysisUnitIds || []) analysisIds.add(id);
      for (const id of current?.evidenceRequirementIds || []) evidenceIds.add(id);
      for (const id of unit.noveltyIds) analysisIds.add(id);
      for (const id of unit.usedIds) analysisIds.add(id);
      for (const explanation of unit.explanations) {
        analysisIds.add(explanation.instructionalAnalysisUnitId);
      }
      for (const practice of unit.practices) {
        evidenceIds.add(practice.evidenceRequirementId);
      }
    }
    const targetPlanItems = {
      instructionalAnalysisUnitIds: orderedPlanItemIds(analysisItems, analysisIds),
      evidenceRequirementIds: orderedPlanItemIds(evidenceItems, evidenceIds)
    };
    for (const unit of group.units) {
      unit.design = { ...unit.design, targetPlanItems };
    }
    return {
      didacticMicrosequenceId: group.microsequenceId,
      ...targetPlanItems
    };
  });
}

function validatePedagogicalGroup(
  group,
  establishedAnalysis,
  introducedAnywhere,
  analysisLabels
) {
  const firstDesign = group.units[0]?.design;
  const targets = firstDesign?.targetPlanItems;
  if (!plainObject(targets)) {
    fail("course_service_unavailable", "O recorte pedagógico corrente está incompleto.", 503);
  }
  const targetAnalysis = new Set(targets.instructionalAnalysisUnitIds || []);
  const targetEvidence = new Set(targets.evidenceRequirementIds || []);

  const representedAnalysis = new Set();
  const introducedInGroup = new Set();
  const developedByAnalysis = new Map([...targetAnalysis].map((id) => [id, new Set()]));
  const notApplicableByAnalysis = new Map([...targetAnalysis].map((id) => [id, new Set()]));
  const requiredFormsByAnalysis = new Map();
  const practiceByEvidence = new Map([...targetEvidence].map((id) => [id, {
    opportunities: new Set(),
    operation: null,
    dimensions: new Set(),
    minimum: 1,
    requiredDimensions: new Set()
  }]));

  for (const unit of group.units) {
    const design = unit.design;
    const policy = design?.componentPolicy?.effectiveAssignment?.policy;
    const unitTargets = design?.targetPlanItems;
    const ceiling = effectiveParameter(design, PARAMETER_IDS.ceiling);
    const requiredForms = effectiveParameter(design, PARAMETER_IDS.explanationForms);
    const practiceMinimum = effectiveParameter(design, PARAMETER_IDS.practiceMinimum);
    const requiredDimensions = effectiveParameter(design, PARAMETER_IDS.variationDimensions);
    if (!plainObject(policy) || !plainObject(unitTargets) ||
        JSON.stringify(unitTargets.instructionalAnalysisUnitIds || []) !==
          JSON.stringify([...targetAnalysis]) ||
        JSON.stringify(unitTargets.evidenceRequirementIds || []) !==
          JSON.stringify([...targetEvidence]) ||
        !Number.isSafeInteger(ceiling) || ceiling < 1 ||
        !Array.isArray(requiredForms) || !Number.isSafeInteger(practiceMinimum) ||
        practiceMinimum < 1 || !Array.isArray(requiredDimensions)) {
      fail("course_service_unavailable", "Os parâmetros efetivos essenciais são inválidos.", 503);
    }
    const mode = pedagogicalMode(unit.source);
    const noveltySet = new Set(unit.noveltyIds);
    const usedSet = new Set(unit.usedIds);
    const explanationIds = unit.explanations.map((entry) =>
      entry.instructionalAnalysisUnitId);
    const explanationSet = new Set(explanationIds);
    if (new Set(unit.noveltyIds).size !== unit.noveltyIds.length ||
        usedSet.size !== unit.usedIds.length ||
        explanationSet.size !== unit.explanations.length) {
      fail("invalid_human_materialization", "Uma unidade repete ideia introduzida, usada ou explicada.");
    }
    if ([...usedSet].some((id) => noveltySet.has(id) || explanationSet.has(id))) {
      fail(
        "invalid_human_materialization",
        "Uma ideia usada sem reexplicação não pode ser também introduzida ou retomada na mesma unidade."
      );
    }
    if (unit.noveltyIds.some((id) => !targetAnalysis.has(id)) ||
        unit.usedIds.some((id) => !targetAnalysis.has(id)) ||
        unit.explanations.some(({ instructionalAnalysisUnitId }) =>
          !targetAnalysis.has(instructionalAnalysisUnitId)) ||
        unit.practices.some(({ evidenceRequirementId }) =>
          !targetEvidence.has(evidenceRequirementId))) {
      fail(
        "human_materialization_outside_plan",
        "A aplicação pedagógica referencia uma ideia fora do repertório da microssequência."
      );
    }
    if (["expository", "mixed"].includes(mode) && unit.noveltyIds.length > ceiling) {
      fail(
        "human_materialization_analysis_unit_ceiling_exceeded",
        `A unidade de estudo ${unit.source.posicao} excede o teto de novidades.`
      );
    }
    if (mode === "practice" && (unit.noveltyIds.length || unit.explanations.length) ||
        mode === "expository" && unit.practices.length > 0 ||
        mode === "mixed" && (unit.explanations.length === 0 || unit.practices.length === 0)) {
      fail(
        "human_materialization_mode_mismatch",
        "A função didática da unidade não corresponde ao conteúdo e às aplicações informadas."
      );
    }

    const knownBeforeUnit = new Set(establishedAnalysis);
    for (const id of unit.usedIds) {
      if (!knownBeforeUnit.has(id)) {
        fail(
          "human_materialization_use_before_introduction",
          "Uma unidade usa uma ideia antes que ela tenha sido estabelecida no percurso."
        );
      }
    }
    for (const id of unit.noveltyIds) {
      if (introducedAnywhere.has(id)) {
        fail("human_materialization_duplicate_introduction", "Uma ideia foi introduzida mais de uma vez.");
      }
      if (!explanationSet.has(id)) {
        fail(
          "human_materialization_incomplete_analysis_inventory",
          "Toda ideia nova precisa ser explicada na unidade em que é introduzida."
        );
      }
      introducedInGroup.add(id);
      requiredFormsByAnalysis.set(id, new Set(requiredForms));
    }
    for (const explanation of unit.explanations) {
      const id = explanation.instructionalAnalysisUnitId;
      if (!noveltySet.has(id) && !knownBeforeUnit.has(id)) {
        fail(
          "human_materialization_explanation_before_introduction",
          "Uma explicação retoma uma ideia antes que ela tenha sido estabelecida no percurso."
        );
      }
      const developed = developedByAnalysis.get(id);
      const notApplicable = notApplicableByAnalysis.get(id);
      for (const form of explanation.developedForms) {
        if (notApplicable.has(form)) {
          fail("human_materialization_explanation_form_conflict", "Uma forma foi aplicada e marcada como não aplicável.");
        }
        developed.add(form);
      }
      for (const { form } of explanation.notApplicable) {
        if (developed.has(form)) {
          fail("human_materialization_explanation_form_conflict", "Uma forma foi aplicada e marcada como não aplicável.");
        }
        notApplicable.add(form);
      }
    }
    unit.noveltyIds.forEach((id) => {
      establishedAnalysis.add(id);
      introducedAnywhere.add(id);
    });
    unit.noveltyIds.forEach((id) => representedAnalysis.add(id));
    unit.usedIds.forEach((id) => representedAnalysis.add(id));
    explanationIds.forEach((id) => representedAnalysis.add(id));
    for (const practice of unit.practices) {
      const state = practiceByEvidence.get(practice.evidenceRequirementId);
      state.minimum = Math.max(state.minimum, practiceMinimum);
      requiredDimensions.forEach((dimension) => state.requiredDimensions.add(dimension));
      if (state.opportunities.has(practice.opportunityId)) {
        fail("human_materialization_duplicate_practice", "Uma oportunidade de prática foi repetida.");
      }
      state.opportunities.add(practice.opportunityId);
      if (state.operation !== null && state.operation !== practice.invariantTaskOperation) {
        fail("human_materialization_practice_operation_changed", "A operação-alvo mudou entre práticas do mesmo requisito.");
      }
      state.operation = practice.invariantTaskOperation;
      practice.variedDimensions.forEach((dimension) => state.dimensions.add(dimension));
    }
    validateComponentPolicy(componentRefs(unit.content), policy);
  }

  if ([...targetAnalysis].some((id) => !representedAnalysis.has(id))) {
    fail(
      "human_materialization_incomplete_analysis_inventory",
      "Toda ideia focal da microssequência precisa aparecer como introdução, uso ou retomada."
    );
  }
  for (const id of introducedInGroup) {
    const covered = new Set([
      ...developedByAnalysis.get(id),
      ...notApplicableByAnalysis.get(id)
    ]);
    const missing = [...(requiredFormsByAnalysis.get(id) || [])]
      .filter((form) => !covered.has(form));
    if (missing.length) {
      const idea = analysisLabels.get(id) || "ideia nova";
      const forms = missing.map((form) => EXPLANATION_FORM_LABELS[form] || form)
        .join(", ");
      fail(
        "human_materialization_missing_explanation_form",
        `A ideia “${idea}” ainda precisa destas formas: ${forms}. Desenvolva-as ou justifique as que não se aplicam.`
      );
    }
  }
  for (const state of practiceByEvidence.values()) {
    if (state.opportunities.size < state.minimum ||
        [...state.requiredDimensions].some((dimension) => !state.dimensions.has(dimension))) {
      fail(
        "human_materialization_insufficient_practice",
        "A prática não cumpre o mínimo ou as dimensões de variação efetivas."
      );
    }
  }
}

function validatePedagogicalPart(groups, plan, replacedStudyUnitIds) {
  const curriculumOrder = curriculumMicrosequenceOrder(plan);
  const orderedGroups = [...groups].map((group) => {
    const order = curriculumOrder.get(group.microsequenceId);
    if (!Number.isSafeInteger(order)) {
      fail("course_service_unavailable", "Uma microssequência da parte não pertence ao mapa curricular.", 503);
    }
    return { group, order };
  }).sort((left, right) => left.order - right.order);
  const establishedAnalysis = new Set();
  const introducedAnywhere = introducedAnalysisUnitIds(plan, replacedStudyUnitIds);
  const analysisLabels = new Map(planItems(plan, "instructionalAnalysisUnits")
    .map((item) => [item.id, item.statement]));
  for (const { group, order } of orderedGroups) {
    for (const id of establishedAnalysisUnitIds(
      plan,
      replacedStudyUnitIds,
      order,
      curriculumOrder
    )) establishedAnalysis.add(id);
    validatePedagogicalGroup(
      group,
      establishedAnalysis,
      introducedAnywhere,
      analysisLabels
    );
    const coveredScopeIds = new Set(group.units.flatMap((unit) =>
      unit.curriculumScopeItemIds));
    if (plannedCurriculumScopeIds(plan, group.microsequenceId)
      .some((id) => !coveredScopeIds.has(id))) {
      fail(
        "human_materialization_incomplete_scope_coverage",
        "A microssequência precisa desenvolver os itens de escopo que o mapa curricular atribuiu a ela."
      );
    }
  }
}

export async function materializeHumanCoursePart({
  adapter,
  principal,
  course,
  part,
  units,
  deadlineAt = null
}) {
  validateUnits(units);
  let producedPartPosition = null;
  let practiceObservations = [];
  const receipt = await executeTrustedCourseWrite({
    load: () => resolveHumanCourseContext({
      adapter,
      principal,
      course,
      part,
      deadlineAt
    }),
    async build(context, { newId }) {
      producedPartPosition = Number(context.part.position) + 1;
      const prepared = await prepareUnits({
        adapter,
        principal,
        context,
        units,
        deadlineAt,
        newId
      });
      const groups = prepared.groups;
      const plannedMicrosequenceIds = new Set(
        partMicrosequences(context.part).map(({ id }) => id)
      );
      const suppliedMicrosequenceIds = new Set(groups.map(({ microsequenceId }) =>
        microsequenceId));
      if (suppliedMicrosequenceIds.size !== plannedMicrosequenceIds.size ||
          [...plannedMicrosequenceIds].some((id) => !suppliedMicrosequenceIds.has(id))) {
        fail(
          "human_materialization_incomplete_part",
          "A materialização precisa incluir ao menos uma unidade de estudo de cada microssequência da parte."
        );
      }
      const existingBySlot = await listExistingPartStudyUnits({
        adapter,
        principal,
        context,
        deadlineAt
      });
      const suppliedSlots = new Set(groups.flatMap(({ microsequenceId, units: groupUnits }) =>
        groupUnits.map((unit) => `${microsequenceId}\0${unit.source.posicao}`)));
      if ([...existingBySlot.keys()].some((slot) => !suppliedSlots.has(slot))) {
        fail(
          "human_materialization_existing_unit_omitted",
          "A revisão da parte precisa representar todas as unidades de estudo já existentes; nenhuma é removida implicitamente."
        );
      }
      const scopeBySlot = new Map();
      for (const group of groups) {
        for (const unit of group.units) {
          const slot = `${group.microsequenceId}\0${unit.source.posicao}`;
          const existing = existingBySlot.get(slot) ?? null;
          scopeBySlot.set(slot, existing
            ? { kind: "study_unit", ref: existing.studyUnitId }
            : { kind: "didactic_microsequence", ref: group.microsequenceId });
        }
      }
      const designByScope = new Map(await Promise.all(
        [...new Map([...scopeBySlot.values()].map((scope) => [
          `${scope.kind}\0${scope.ref}`, scope
        ])).entries()].map(async ([key, scope]) => [key, await adapter.getCourseDesign({
          principal,
          courseId: context.course.id,
          scopeKind: scope.kind,
          scopeRef: scope.ref,
          childLimit: 1,
          childCursor: null,
          deadlineAt
        })])
      ));
      for (const group of groups) {
        for (const unit of group.units) {
          const slot = `${group.microsequenceId}\0${unit.source.posicao}`;
          const scope = scopeBySlot.get(slot);
          unit.design = applyUnitContextualCalibration(
            designByScope.get(`${scope.kind}\0${scope.ref}`),
            unit.source.configuracao,
            { existing: scope.kind === "study_unit" }
          );
        }
      }
      const targetPlanItems = applyGroupTargetPlans(groups, context.plan);
      practiceObservations = groups.map((group, index) => ({
        microssequencia: index + 1,
        observacao: observeCoursePracticeDistribution(group.units.map((unit) => ({
          studyUnitRef: String(unit.inputIndex), position: unit.source.posicao,
          mode: pedagogicalMode(unit.source)
        })))
      }));
      validatePedagogicalPart(
        groups,
        context.plan,
        new Set([...existingBySlot.values()].map(({ studyUnitId }) => studyUnitId))
      );
      const preparedUnits = [];
      for (const group of groups) {
        for (const unit of group.units) {
          const slot = `${group.microsequenceId}\0${unit.source.posicao}`;
          const existing = existingBySlot.get(slot) ?? null;
          preparedUnits.push({
            inputIndex: unit.inputIndex,
            studyUnitId: existing?.studyUnitId ??
              await newId(`study-unit:${unit.inputIndex}`),
            position: unit.source.posicao,
            didacticMicrosequenceId: group.microsequenceId,
            content: structuredClone(unit.content),
            designSnapshot: designSnapshot(unit.design, group.microsequenceId),
            designApplication: unitDesignApplication(unit),
            sourceLinks: structuredClone(unit.sourceLinks)
          });
        }
      }
      preparedUnits.sort((left, right) => left.inputIndex - right.inputIndex);
      return {
        principal,
        courseId: context.course.id,
        authoringPartId: context.part.id,
        expectedCourseRevision: context.course.revision,
        expectedAuthoringPartVersion: context.part.version,
        planItemUpserts: prepared.inventory.upserts,
        targetPlanItems,
        units: preparedUnits.map((entry) => {
          const unit = { ...entry };
          delete unit.inputIndex;
          return unit;
        }),
        deadlineAt
      };
    },
    commit: (request) => adapter.materializeCourseAuthoringPart(request)
  });
  return {
    result: producedPartPosition === 1
      ? "Primeira parte produzida."
      : `Parte ${producedPartPosition} produzida.`,
    deepLink: receipt.deepLink ?? null,
    nextDecision: "Posso preparar a próxima parte.",
    context: { distribuicaoDaPratica: practiceObservations }
  };
}
