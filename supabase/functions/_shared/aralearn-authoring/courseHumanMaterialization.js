import { AuthoringApiError } from "./errors.js";
import {
  executeTrustedCourseWrite,
  resolveHumanCourseContext
} from "./courseHumanTaskExecutor.js";
import { validateCourseEntityContent } from
  "../aralearn/runtime/domain/courseEntities.js";
import {
  EXPLANATION_FORMS,
  PRACTICE_VARIATION_DIMENSIONS
} from "../aralearn/runtime/domain/courseDesignParameters.js";

const MODE = Object.freeze({
  expositiva: "expository",
  pratica: "practice",
  mista: "mixed"
});
const MAX_PART_STUDY_UNIT_PAGES = 100;

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
      "Uma Unidade existente da Parte não possui posição curricular válida.",
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
      fail("course_service_unavailable", "A paginação da Parte repetiu o mesmo ponto.", 503);
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
      fail("course_service_unavailable", "A lista de Unidades da Parte é inválida.", 503);
    }
    for (const item of page.items) {
      const slot = existingStudyUnitSlot(item);
      if (seenIds.has(slot.studyUnitId) || bySlot.has(slot.key)) {
        fail("course_service_unavailable", "A Parte possui posições de Unidade duplicadas.", 503);
      }
      seenIds.add(slot.studyUnitId);
      bySlot.set(slot.key, { studyUnitId: slot.studyUnitId });
    }
    if (page.hasMore !== true) return bySlot;
    const next = page.nextCursor?.studyUnitId;
    if (typeof next !== "string" || !next) {
      fail("course_service_unavailable", "A paginação da Parte perdeu o ponto de retomada.", 503);
    }
    cursorStudyUnitId = next;
  }
  fail("course_service_unavailable", "A Parte excedeu o limite seguro de paginação.", 503);
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

function resolveAnchor(anchors, value) {
  return resolveReference(anchors, value, {
    position: () => Number.NaN,
    texts: (anchor) => [
      anchor.humanLocator,
      anchor.verificationExcerpt
    ],
    label: "A Âncora"
  });
}

export async function resolveHumanSourceLinks({
  adapter,
  principal,
  courseContext,
  requested,
  deadlineAt,
  sourceCache = new Map()
}) {
  if (!requested?.length) return [];
  const links = [];
  for (const entry of requested) {
    if (!plainObject(entry) || !Object.hasOwn(entry, "fonte") ||
        typeof entry.relacao !== "string") {
      fail("invalid_human_materialization", "Um vínculo de Fonte da Unidade é inválido.");
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
        fail("human_reference_not_found", "A Fonte corrente não foi localizada.", 404);
      }
      source = {
        sourceId: current.sourceId,
        anchors: (Array.isArray(current.anchors) ? current.anchors : [])
          .filter((anchor) => anchor.status == null || anchor.status === "active")
      };
      sourceCache.set(cacheKey, source);
    }
    const requestedAnchors = Array.isArray(entry.ancoras) ? entry.ancoras : [];
    const selectedAnchors = requestedAnchors.length
      ? requestedAnchors.map((anchor) => resolveAnchor(source.anchors, anchor))
      : entry.relacao === "needs_verification"
        ? []
        : source.anchors.length === 1
        ? [source.anchors[0]]
        : source.anchors.length === 0
          ? fail("human_reference_not_found", "A Fonte não possui Âncora ativa.", 404)
          : fail(
              "ambiguous_human_reference",
              "A Fonte possui várias Âncoras; indique a posição ou o localizador humano.",
              409
            );
    links.push({
      sourceId: source.sourceId,
      relation: entry.relacao,
      anchors: selectedAnchors.map((anchor) => ({
        anchorId: anchor.anchorId
      }))
    });
  }
  if (new Set(links.map(({ sourceId }) => sourceId)).size !== links.length) {
    fail("duplicate_human_reference", "A Unidade repete a mesma Fonte.");
  }
  return links;
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

function validateUnits(units) {
  if (!Array.isArray(units) || units.length < 1 || units.length > 64) {
    fail("invalid_human_materialization", "A materialização precisa conter de 1 a 64 Unidades.");
  }
  for (const [index, unit] of units.entries()) {
    if (!plainObject(unit) || !plainObject(unit.conteudo) ||
        !plainObject(unit.aplicacaoPedagogica) ||
        !Number.isSafeInteger(unit.posicao) || unit.posicao < 1 ||
        !Object.hasOwn(MODE, unit.aplicacaoPedagogica.modo) ||
        !Array.isArray(unit.aplicacaoPedagogica.novidadesIntroduzidas) ||
        !Array.isArray(unit.aplicacaoPedagogica.explicacoes) ||
        !Array.isArray(unit.aplicacaoPedagogica.praticas) ||
        unit.fontes != null && !Array.isArray(unit.fontes)) {
      fail(
        "invalid_human_materialization",
        `A Unidade ${index + 1} possui conteúdo ou aplicação pedagógica inválida.`
      );
    }
  }
}

async function prepareUnits({ adapter, principal, context, units, deadlineAt }) {
  const microsequences = partMicrosequences(context.part);
  if (!microsequences.length) {
    fail("human_part_has_no_microsequences", "A Parte ainda não possui Microssequências para materializar.");
  }
  const groups = new Map();
  const sourceCache = new Map();
  for (const [unitIndex, unit] of units.entries()) {
    const microsequence = resolveReference(microsequences, unit.microssequencia, {
      position: (item) => item.productionPosition ?? item.position,
      texts: (item) => [item.title],
      label: "A Microssequência"
    });
    const noveltyIds = unit.aplicacaoPedagogica.novidadesIntroduzidas.map((value) => (
      resolvePlanItem(
        context.plan,
        "instructionalAnalysisUnits",
        value,
        "A unidade da análise instrucional"
      ).id
    ));
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
          entry.novidade,
          "A unidade da análise instrucional"
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
      fail(
        "invalid_human_study_unit",
        `A Unidade ${unit.posicao} é inválida: ${validation.errors.join(" ")}`
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
      explanations,
      practices,
      content,
      sourceLinks: await resolveHumanSourceLinks({
        adapter,
        principal,
        courseContext: context,
        requested: unit.fontes || [],
        deadlineAt,
        sourceCache
      })
    };
    if (!groups.has(microsequence.id)) groups.set(microsequence.id, []);
    groups.get(microsequence.id).push(prepared);
  }
  return [...groups.entries()].map(([microsequenceId, values]) => {
    if (new Set(values.map(({ source }) => source.posicao)).size !== values.length) {
      fail(
        "invalid_human_materialization",
        "A mesma Microssequência não pode repetir a posição de uma Unidade."
      );
    }
    return {
      microsequenceId,
      units: values.sort((left, right) => left.source.posicao - right.source.posicao)
    };
  });
}

function designSnapshot(design, microsequenceId) {
  const parameters = Array.isArray(design?.parameters) ? design.parameters : [];
  const directions = Array.isArray(design?.guidance?.effectiveAssignments)
    ? design.guidance.effectiveAssignments
    : [];
  const targetPlanItems = design?.targetPlanItems;
  const policy = design?.componentPolicy?.effectiveAssignment;
  if (parameters.length !== 4 || !plainObject(targetPlanItems) || !plainObject(policy)) {
    fail(
      "course_service_unavailable",
      "A configuração corrente da Microssequência está incompleta.",
      503
    );
  }
  return {
    contract: "aralearn.study-unit-design-snapshot.v1",
    didacticMicrosequenceId: microsequenceId,
    instructionalAnalysisUnitIds: [...targetPlanItems.instructionalAnalysisUnitIds],
    evidenceRequirementIds: [...targetPlanItems.evidenceRequirementIds],
    parameters: parameters.map((parameter) => ({
      parameterId: parameter.parameterId,
      value: structuredClone(parameter.effectiveAssignment.value),
      origin: parameter.effectiveAssignment.origin,
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
    mode: MODE[unit.source.aplicacaoPedagogica.modo],
    introducedInstructionalAnalysisUnitIds: unit.noveltyIds,
    explanationApplications: unit.explanations,
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
      "Uma Unidade usa componente fora da política efetiva."
    );
  }
}

function validatePedagogicalGroup(group) {
  const firstDesign = group.units[0]?.design;
  const targets = firstDesign?.targetPlanItems;
  if (!plainObject(targets)) {
    fail("course_service_unavailable", "O recorte pedagógico corrente está incompleto.", 503);
  }
  const targetAnalysis = new Set(targets.instructionalAnalysisUnitIds || []);
  const targetEvidence = new Set(targets.evidenceRequirementIds || []);

  const introducedAt = new Map();
  const developedByAnalysis = new Map([...targetAnalysis].map((id) => [id, new Set()]));
  const notApplicableByAnalysis = new Map([...targetAnalysis].map((id) => [id, new Set()]));
  const requiredFormsByAnalysis = new Map([...targetAnalysis].map((id) => [id, new Set()]));
  const explanationsAtIntroduction = new Set();
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
      fail("course_service_unavailable", "Os quatro parâmetros efetivos são inválidos.", 503);
    }
    const mode = MODE[unit.source.aplicacaoPedagogica.modo];
    if (mode === "expository" && unit.content.role !== "theory" ||
        mode !== "expository" && unit.content.role !== "practice") {
      fail(
        "human_materialization_mode_mismatch",
        "O papel da StudyUnit não corresponde ao modo da aplicação pedagógica."
      );
    }
    if (new Set(unit.noveltyIds).size !== unit.noveltyIds.length ||
        new Set(unit.explanations.map((entry) => entry.instructionalAnalysisUnitId)).size !==
          unit.explanations.length) {
      fail("invalid_human_materialization", "Uma Unidade repete novidade ou explicação.");
    }
    if (unit.noveltyIds.some((id) => !targetAnalysis.has(id)) ||
        unit.explanations.some(({ instructionalAnalysisUnitId }) =>
          !targetAnalysis.has(instructionalAnalysisUnitId)) ||
        unit.practices.some(({ evidenceRequirementId }) =>
          !targetEvidence.has(evidenceRequirementId))) {
      fail(
        "human_materialization_outside_plan",
        "A aplicação pedagógica referencia item fora do inventário da Microssequência."
      );
    }
    if (["expository", "mixed"].includes(mode) && unit.noveltyIds.length > ceiling) {
      fail(
        "human_materialization_analysis_unit_ceiling_exceeded",
        `A Unidade ${unit.source.posicao} excede o teto de novidades.`
      );
    }
    if (mode === "practice" && (unit.noveltyIds.length || unit.explanations.length) ||
        mode === "expository" && unit.practices.length > 0 ||
        mode === "mixed" && (unit.explanations.length === 0 || unit.practices.length === 0)) {
      fail("human_materialization_mode_mismatch", "O modo da Unidade não corresponde à aplicação declarada.");
    }
    for (const id of unit.noveltyIds) {
      if (introducedAt.has(id)) {
        fail("human_materialization_duplicate_introduction", "Uma AnalysisUnit foi introduzida mais de uma vez.");
      }
      introducedAt.set(id, unit.source.posicao);
    }
    for (const explanation of unit.explanations) {
      const id = explanation.instructionalAnalysisUnitId;
      requiredForms.forEach((form) => requiredFormsByAnalysis.get(id)?.add(form));
      const introductionPosition = introducedAt.get(id);
      if (introductionPosition === undefined || introductionPosition > unit.source.posicao) {
        fail(
          "human_materialization_explanation_before_introduction",
          "Uma explicação aparece antes da introdução da AnalysisUnit."
        );
      }
      if (introductionPosition === unit.source.posicao) explanationsAtIntroduction.add(id);
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

  if ([...targetAnalysis].some((id) => !introducedAt.has(id) ||
      !explanationsAtIntroduction.has(id))) {
    fail(
      "human_materialization_incomplete_analysis_inventory",
      "Toda AnalysisUnit da Microssequência precisa ser introduzida uma vez e explicada na Unit de introdução."
    );
  }
  for (const id of targetAnalysis) {
    const covered = new Set([
      ...developedByAnalysis.get(id),
      ...notApplicableByAnalysis.get(id)
    ]);
    if ([...requiredFormsByAnalysis.get(id)].some((form) => !covered.has(form))) {
      fail(
        "human_materialization_missing_explanation_form",
        "As formas de explicação requeridas não foram desenvolvidas nem justificadas como não aplicáveis."
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

export async function materializeHumanCoursePart({
  adapter,
  principal,
  course,
  part,
  units,
  deadlineAt = null
}) {
  validateUnits(units);
  let preparedCount = 0;
  const receipt = await executeTrustedCourseWrite({
    load: () => resolveHumanCourseContext({
      adapter,
      principal,
      course,
      part,
      deadlineAt
    }),
    async build(context, { newId }) {
      const groups = await prepareUnits({
        adapter,
        principal,
        context,
        units,
        deadlineAt
      });
      const plannedMicrosequenceIds = new Set(
        partMicrosequences(context.part).map(({ id }) => id)
      );
      const suppliedMicrosequenceIds = new Set(groups.map(({ microsequenceId }) =>
        microsequenceId));
      if (suppliedMicrosequenceIds.size !== plannedMicrosequenceIds.size ||
          [...plannedMicrosequenceIds].some((id) => !suppliedMicrosequenceIds.has(id))) {
        fail(
          "human_materialization_incomplete_part",
          "A materialização precisa incluir ao menos uma Unidade de cada Microssequência da Parte."
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
          "A revisão da Parte precisa representar todas as Unidades já existentes; nenhuma é removida implicitamente."
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
      const preparedUnits = [];
      for (const group of groups) {
        for (const unit of group.units) {
          const slot = `${group.microsequenceId}\0${unit.source.posicao}`;
          const scope = scopeBySlot.get(slot);
          unit.design = designByScope.get(`${scope.kind}\0${scope.ref}`);
        }
        validatePedagogicalGroup(group);
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
      preparedCount = preparedUnits.length;
      return {
        principal,
        courseId: context.course.id,
        authoringPartId: context.part.id,
        expectedCourseRevision: context.course.revision,
        expectedAuthoringPartVersion: context.part.version,
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
    result: `${preparedCount} ${preparedCount === 1
      ? "Unidade foi produzida"
      : "Unidades foram produzidas"} na Parte ${String(part)}.`,
    deepLink: receipt.deepLink ?? null,
    nextDecision: "Quer revisar as Unidades produzidas?",
    context: {
      part: String(part),
      studyUnitCount: preparedCount
    }
  };
}
