import { AuthoringApiError } from "./errors.js";
import {
  executeTrustedCourseWrite,
  resolveHumanCourseContext
} from "./courseHumanTaskExecutor.js";
import { validateCourseEntityContent } from
  "../aralearn/runtime/domain/courseEntities.js";

const MODE = Object.freeze({
  expositiva: "expository",
  pratica: "practice",
  mista: "mixed"
});

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

function planItems(plan, collection) {
  return Array.isArray(plan?.plan?.[collection]) ? plan.plan[collection] : [];
}

function resolvePlanItem(plan, collection, value, label) {
  return resolveReference(planItems(plan, collection), value, {
    position: (item) => item.position,
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
        limit: 24,
        deadlineAt
      });
      const revisions = Array.isArray(detail?.items) ? detail.items : [];
      const revision = revisions.find((item) =>
        item.sourceId === resolved.source.sourceId &&
        Number(item.revision) === Number(resolved.source.revision)) ||
        revisions.find((item) => item.sourceId === resolved.source.sourceId);
      if (!revision) {
        fail("human_reference_not_found", "A revisão corrente da Fonte não foi localizada.", 404);
      }
      source = {
        sourceId: revision.sourceId,
        sourceRevision: Number(revision.revision),
        anchors: (Array.isArray(revision.anchors) ? revision.anchors : [])
          .filter((anchor) => anchor.status == null || anchor.status === "active")
      };
      sourceCache.set(cacheKey, source);
    }
    const requestedAnchors = Array.isArray(entry.ancoras) ? entry.ancoras : [];
    const selectedAnchors = requestedAnchors.length
      ? requestedAnchors.map((anchor) => resolveAnchor(source.anchors, anchor))
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
      sourceRevision: source.sourceRevision,
      relation: entry.relacao,
      anchors: selectedAnchors.map((anchor) => ({
        anchorId: anchor.anchorId,
        anchorRevision: Number(anchor.revision)
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
      const notApplicable = entry.formasNaoAplicaveis == null
        ? []
        : Array.isArray(entry.formasNaoAplicaveis)
          ? entry.formasNaoAplicaveis.map((item) => {
              if (!plainObject(item) || typeof item.forma !== "string" ||
                  typeof item.motivo !== "string" || !item.motivo.trim()) {
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
          !entry.oportunidade.trim() || !Array.isArray(entry.dimensoesVariadas)) {
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

async function startMaterialization({ adapter, principal, course, part, units, deadlineAt }) {
  let prepared = null;
  const started = await executeTrustedCourseWrite({
    load: () => resolveHumanCourseContext({
      adapter,
      principal,
      course,
      part,
      deadlineAt
    }),
    async build(context, { newId }) {
      prepared = await prepareUnits({
        adapter,
        principal,
        context,
        units,
        deadlineAt
      });
      const materializationId = await newId("materialization");
      const steps = await Promise.all(prepared.map(async (group, index) => ({
        id: await newId(`materialization-step:${index}`),
        position: index,
        kind: "didactic_microsequence_materialization",
        targetDidacticMicrosequenceId: group.microsequenceId,
        productionPosition: index
      })));
      return {
        principal,
        courseId: context.course.id,
        authoringPartId: context.part.id,
        materializationId,
        expectedCourseRevision: context.course.revision,
        expectedMaterializationVersion: 0,
        operation: "start",
        payload: {
          authoringPartVersion: context.part.version,
          steps
        },
        deadlineAt
      };
    },
    commit: (request) => adapter.advanceCourseAuthoringPartMaterialization(request)
  });
  return { started, prepared };
}

async function recordGroup({
  adapter,
  principal,
  started,
  group,
  deadlineAt
}) {
  return executeTrustedCourseWrite({
    load: () => adapter.getCourseAuthoringPartMaterialization({
      principal,
      courseId: started.courseId,
      authoringPartId: started.authoringPartId,
      materializationId: started.materialization.id,
      deadlineAt
    }),
    async build(current, { newId }) {
      const materialization = current.materialization;
      const step = materialization.steps.find((candidate) =>
        candidate.targetDidacticMicrosequenceId === group.microsequenceId &&
        candidate.status === "pending");
      if (!step) {
        fail("human_materialization_step_unavailable", "A etapa da Microssequência não está pendente.", 409);
      }
      const preparedUnits = await Promise.all(group.units.map(async (unit, index) => {
        const entityId = await newId(`study-unit:${index}`);
        return { ...unit, entityId, content: structuredClone(unit.content) };
      }));
      const applicationUnits = preparedUnits.map((unit) => ({
        studyUnitId: unit.entityId,
        mode: MODE[unit.source.aplicacaoPedagogica.modo],
        introducedInstructionalAnalysisUnitIds: unit.noveltyIds,
        explanationApplications: unit.explanations,
        practiceApplications: unit.practices,
        componentRefs: componentRefs(unit.content)
      }));
      return {
        principal,
        courseId: started.courseId,
        authoringPartId: started.authoringPartId,
        materializationId: started.materialization.id,
        expectedCourseRevision: current.courseRevision,
        expectedMaterializationVersion: materialization.version,
        operation: "record_step",
        payload: {
          stepId: step.id,
          expectedStepVersion: step.version,
          status: "completed",
          resultFacts: {
            summary: `${preparedUnits.length} ${preparedUnits.length === 1 ? "Unidade produzida" : "Unidades produzidas"}.`
          },
          entityChanges: {
            upserts: preparedUnits.map((unit) => ({
              entityType: "study_unit",
              entityId: unit.entityId,
              parentType: "microsequence",
              parentId: group.microsequenceId,
              position: unit.source.posicao,
              content: unit.content
            })),
            deletes: []
          },
          designApplication: {
            contextHash: materialization.contextHash,
            didacticMicrosequenceId: group.microsequenceId,
            studyUnits: applicationUnits
          },
          sourceAttributionApplication: {
            contract: "aralearn.course-source-attribution-application.v1",
            contextHash: materialization.contextHash,
            didacticMicrosequenceId: group.microsequenceId,
            studyUnits: preparedUnits.map((unit) => ({
              studyUnitId: unit.entityId,
              sourceLinks: unit.sourceLinks
            }))
          }
        },
        deadlineAt
      };
    },
    commit: (request) => adapter.advanceCourseAuthoringPartMaterialization(request)
  });
}

async function finishMaterialization({ adapter, principal, started, deadlineAt }) {
  return executeTrustedCourseWrite({
    load: () => adapter.getCourseAuthoringPartMaterialization({
      principal,
      courseId: started.courseId,
      authoringPartId: started.authoringPartId,
      materializationId: started.materialization.id,
      deadlineAt
    }),
    build(current) {
      return {
        principal,
        courseId: started.courseId,
        authoringPartId: started.authoringPartId,
        materializationId: started.materialization.id,
        expectedCourseRevision: current.courseRevision,
        expectedMaterializationVersion: current.materialization.version,
        operation: "finish",
        payload: {
          status: "completed",
          resultFacts: { summary: "Parte materializada e pronta para revisão." }
        },
        deadlineAt
      };
    },
    commit: (request) => adapter.advanceCourseAuthoringPartMaterialization(request)
  });
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
  const { started, prepared } = await startMaterialization({
    adapter,
    principal,
    course,
    part,
    units,
    deadlineAt
  });
  for (const group of prepared) {
    await recordGroup({ adapter, principal, started, group, deadlineAt });
  }
  const finished = await finishMaterialization({ adapter, principal, started, deadlineAt });
  return {
    result: `${units.length} ${units.length === 1 ? "Unidade foi produzida" : "Unidades foram produzidas"} na Parte ${String(part)}.`,
    deepLink: finished.deepLink ?? started.deepLink ?? null,
    nextDecision: "Quer revisar as Unidades produzidas?",
    context: {
      part: String(part),
      studyUnitCount: units.length,
      microsequenceCount: prepared.length
    }
  };
}
