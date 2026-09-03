import { AuthoringApiError } from "./errors.js";
import {
  executeTrustedCourseWrite,
  resolveHumanCourseContext
} from "./courseHumanTaskExecutor.js";
import { resolveHumanSourceLinks } from "./courseHumanMaterialization.js";
import { validateCourseEntityContent } from
  "../aralearn/runtime/domain/courseEntities.js";

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fail(code, message, status = 422) {
  throw new AuthoringApiError(status, code, message);
}

function validateCorrections(corrections) {
  if (!Array.isArray(corrections) || corrections.length < 1 || corrections.length > 64) {
    fail("invalid_human_corrections", "Informe de 1 a 64 correções focais.");
  }
  for (const [index, correction] of corrections.entries()) {
    if (!plainObject(correction) || !Object.hasOwn(correction, "unidade") ||
        !plainObject(correction.conteudo) ||
        correction.fontes != null && !Array.isArray(correction.fontes)) {
      fail("invalid_human_corrections", `A correção ${index + 1} é inválida.`);
    }
  }
}

function microsequenceId(item) {
  const id = item?.curriculumPath?.didacticMicrosequence?.id ??
    item?.didacticMicrosequenceId ?? item?.microsequenceId;
  if (typeof id !== "string" || !id) {
    fail("course_service_unavailable", "A unidade de estudo não informa sua microssequência.", 503);
  }
  return id;
}

async function currentSourceLinks({ adapter, principal, course, unit, deadlineAt }) {
  const page = await adapter.getCourseSources({
    principal,
    courseId: course.id,
    expectedRevision: course.revision,
    mode: "target",
    sourceId: null,
    targetKind: "study_unit",
    targetId: unit.studyUnit.id,
    cursor: null,
    limit: 1,
    deadlineAt
  });
  const current = Array.isArray(page?.items) && page.items.length === 1
    ? page.items[0]
    : null;
  return Array.isArray(current?.sourceLinks) ? structuredClone(current.sourceLinks) : [];
}

async function loadCorrectionState({
  adapter,
  principal,
  course,
  corrections,
  deadlineAt
}) {
  const resolved = await resolveHumanCourseContext({
    adapter,
    principal,
    course,
    studyUnits: corrections.map(({ unidade }) => unidade),
    deadlineAt
  });
  const sourceCache = new Map();
  const prepared = await Promise.all(corrections.map(async (correction, index) => {
    const unit = resolved.studyUnits[index];
    const sourceLinks = correction.fontes === undefined
      ? await currentSourceLinks({
          adapter,
          principal,
          course: resolved.course,
          unit,
          deadlineAt
        })
      : await resolveHumanSourceLinks({
          adapter,
          principal,
          courseContext: resolved,
          requested: correction.fontes,
          deadlineAt,
          sourceCache
        });
    const candidate = {
      ...correction.conteudo,
      id: unit.studyUnit.id,
      position: unit.studyUnit.position
    };
    const validation = validateCourseEntityContent("study_unit", candidate);
    if (!validation.valid) {
      fail(
        "invalid_human_study_unit",
        `A correção da unidade de estudo ${index + 1} é inválida: ${validation.errors.join(" ")}`
      );
    }
    const currentRole = unit.studyUnit?.role;
    if (!new Set(["theory", "practice"]).has(currentRole)) {
      fail(
        "course_service_unavailable",
        "A unidade de estudo não informa sua função instrucional corrente.",
        503
      );
    }
    if (validation.normalized.role !== currentRole) {
      fail(
        "invalid_human_study_unit",
        "Uma correção focal não pode mudar a função instrucional da unidade de estudo; " +
          "rematerialize a parte para redistribuir teoria e prática."
      );
    }
    const content = structuredClone(validation.normalized);
    delete content.id;
    delete content.position;
    return { unit, content, sourceLinks };
  }));
  return { ...resolved, prepared };
}

export async function applyHumanCourseCorrections({
  adapter,
  principal,
  course,
  corrections,
  deadlineAt = null
}) {
  validateCorrections(corrections);
  let correctedCourseId = null;
  let firstCorrectedStudyUnitId = null;
  const receipt = await executeTrustedCourseWrite({
    load: async () => {
      const state = await loadCorrectionState({
        adapter,
        principal,
        course,
        corrections,
        deadlineAt
      });
      correctedCourseId = state.course.id;
      firstCorrectedStudyUnitId = state.prepared[0].unit.studyUnit.id;
      return state;
    },
    build(state) {
      const contextualApplication = principal.authenticationKind === "application" &&
        state.prepared.length === 1;
      return {
        principal,
        courseId: state.course.id,
        expectedRevision: state.course.revision,
        ...(contextualApplication
          ? {
            expectedStudyUnitVersion: Number(state.prepared[0].unit.version),
            applicationOrigin: "provider_assistance"
          }
          : {}),
        upserts: state.prepared.map(({ unit, content }) => ({
          entityType: "study_unit",
          entityId: unit.studyUnit.id,
          parentType: "microsequence",
          parentId: microsequenceId(unit),
          position: unit.studyUnit.position,
          content
        })),
        deletes: [],
        sourceAttributionApplications: state.prepared.map(({ unit, sourceLinks }) => ({
          studyUnitId: unit.studyUnit.id,
          sourceLinks
        })),
        deadlineAt
      };
    },
    commit: ({ requestId, ...request }) => adapter.commitCourseComposition({
      ...request,
      requestId
    })
  });
  return {
    result: corrections.length === 1
      ? "A correção foi aplicada à unidade de estudo afetada."
      : `As ${corrections.length} correções coerentes foram aplicadas às unidades de estudo afetadas.`,
    deepLink: correctedCourseId && firstCorrectedStudyUnitId && adapter.publicAppUrl
      ? `${String(adapter.publicAppUrl).replace(/\/+$/u, "")}` +
        `/#/authoring/courses/${encodeURIComponent(correctedCourseId)}` +
        `?section=content&studyUnitId=${encodeURIComponent(firstCorrectedStudyUnitId)}`
      : receipt.deepLink ?? null,
    nextDecision: "Quer reinspecionar o reparo ou rematerializar a parte para aplicar uma configuração alterada?",
    context: {
      correctionCount: corrections.length,
      sourceMode: corrections.some(({ fontes }) => fontes !== undefined)
        ? "explicit"
        : "preserved"
    }
  };
}
