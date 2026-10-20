import { AuthoringApiError } from "./errors.js";
import { resolveHumanCourseContext } from "./courseHumanTaskExecutor.js";
import { openHumanReadContinuation, paginateHumanReadContext, paginatePreparedHumanReadLiteral,
  prepareSerializedAuthoringExportLiteral } from "./courseHumanReadContext.js";
import { createCourseCopyRequestIdentity, normalizeCourseCopyRequest } from "../aralearn/runtime/domain/courseCopy.js";
import { COURSE_AUTHORING_EXPORT_CONTRACT, normalizeCourseAuthoringComparison,
  normalizeCourseAuthoringExport, isValidatedCourseAuthoringExport,
  serializeCourseAuthoringExport, takeSerializedCourseAuthoringExport } from "../aralearn/runtime/domain/courseAuthoringComparison.js";
import { createHumanNavigation, buildHumanNavigationEnvelope } from "./courseHumanNavigation.js";
import { presentPersistedHumanRead } from "./coursePreparedHumanRead.js";

const fail = message => { throw new AuthoringApiError(422, "invalid_human_course_operation", message); };
const MAX_CACHED_EXPORT_LITERAL_CHARACTERS = 12 * 1024 * 1024;
const humanExportCache = new WeakMap();
function humanText(value, field) {
  if (typeof value !== "string" || !value.trim() || [...value].length > 300 || /\p{Cc}/u.test(value)) fail(`Informe ${field}.`);
  return value.trim();
}
function encodeCopy(value) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}
function decodeCopy(value, principal, courseTitle, title) {
  try {
    if (typeof value !== "string" || value.length > 4096 || !/^[A-Za-z0-9_-]+$/u.test(value)) throw Error();
    const decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(
      atob(value.replaceAll("-", "+").replaceAll("_", "/")), character => character.charCodeAt(0))));
    if (!decoded || Object.keys(decoded).sort().join(",") !== "actor,courseTitle,request" ||
        decoded.actor !== principal.actorId || decoded.courseTitle !== courseTitle || decoded.request?.title !== title) throw Error();
    return normalizeCourseCopyRequest(decoded.request);
  } catch { fail("A confirmação da cópia não corresponde à conta ou à intenção. Reutilize o valor original sem editá-lo."); }
}

// The opaque preparation is not an authorization credential. The single SQL
// writer verifies current permission/CAS or the original owned-copy proof.
export async function copyHumanCourse({ adapter, principal, args, deadlineAt }) {
  const courseTitle = humanText(args.curso, "o curso"), title = humanText(args.titulo, "o título da cópia");
  if (args.confirmacao === undefined) {
    const resolved = await resolveHumanCourseContext({ adapter, principal, course: courseTitle, copySourcesOnly: true, deadlineAt });
    const request = normalizeCourseCopyRequest({ sourceCourseId: resolved.course.id, expectedSourceRevision: resolved.course.revision,
      title, confirmed: true, ...createCourseCopyRequestIdentity() });
    return { result: "Preparei uma cópia independente, privada e com arquivos restritos.",
      ...buildHumanNavigationEnvelope(createHumanNavigation(adapter, { courseId: resolved.course.id, relation: "content" })),
      nextDecision: "Após a escolha de copiar, repita a tarefa com a confirmação devolvida. Reutilize-a se a resposta se perder.",
      context: { curso: resolved.course.title, titulo: title,
        inclui: "Mapa, conteúdo, configuração, fontes, PDFs e áudios autorizados.",
        preservaNaOrigem: "Acessos, progresso e anotações pessoais.",
        confirmacao: encodeCopy({ actor: principal.actorId, courseTitle, request }) } };
  }
  const request = decodeCopy(args.confirmacao, principal, courseTitle, title);
  const receipt = await adapter.copyCourse({ principal, ...request, deadlineAt });
  return { result: receipt.idempotent ? "Recuperei a mesma cópia já criada." : "Criei a cópia independente.",
    ...buildHumanNavigationEnvelope(createHumanNavigation(adapter, { courseId: receipt.targetCourseId, relation: "planning" })),
    nextDecision: null, context: { titulo: title, confirmacao: args.confirmacao } };
}

async function selection(adapter, principal, input, deadlineAt) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some(key => !["curso", "parte", "microssequencia", "unidade"].includes(key))) fail("Selecione curso e recorte legíveis.");
  const resolved = await resolveHumanCourseContext({ adapter, principal, course: humanText(input.curso, "o curso"),
    part: input.parte ?? null, microsequence: input.microssequencia ?? null,
    studyUnits: input.unidade === undefined ? [] : [input.unidade],
    studyUnitReferenceIndex: input.unidade !== undefined,
    outlineReader: input.parte !== undefined || input.microssequencia !== undefined
      ? request => adapter.getCourseInspectionTriageOutline(request) : null,
    deadlineAt });
  const selectedStudyUnit = resolved.studyUnits[0] ?? resolved.studyUnitReferences[0] ?? null;
  return { courseId: resolved.course.id, expectedRevision: resolved.course.revision,
    scope: selectedStudyUnit ? { kind: "study_unit", ref: selectedStudyUnit.studyUnit?.id ?? selectedStudyUnit.id }
      : resolved.microsequence ? { kind: "didactic_microsequence", ref: resolved.microsequence.id }
        : resolved.part ? { kind: "authoring_part", ref: resolved.part.id } : { kind: "course", ref: null } };
}
function selectedContentLink(adapter, selected) {
  return createHumanNavigation(adapter, { courseId: selected.courseId, relation: "content",
    target: selected.scope.kind === "course" ? null : { kind: selected.scope.kind, id: selected.scope.ref } });
}
export async function compareHumanCourses({ adapter, principal, args, deadlineAt }) {
  const left = await selection(adapter, principal, args.esquerda, deadlineAt);
  const right = await selection(adapter, principal, args.direita, deadlineAt);
  const state = await openHumanReadContinuation({ args, task: "comparar_cursos",
    course: { id: `${left.courseId}:${right.courseId}`, revision: `${left.expectedRevision}:${right.expectedRevision}` } });
  const comparison = normalizeCourseAuthoringComparison(await adapter.compareCourseAuthoring({ principal, left, right, deadlineAt }),
    { expectedRequest: { left, right } });
  return { result: "Comparei os recortes pelo inventário e pelas dimensões declaradas, sem certificar equivalência pedagógica.",
    ...buildHumanNavigationEnvelope(selectedContentLink(adapter, left), [selectedContentLink(adapter, right)]),
    context: await paginateHumanReadContext({ authoringComparison: comparison }, { state }) };
}
function humanExportCacheKey(principal, selected, state, annotationSetVersion) {
  return [humanExportCacheIdentity(principal, selected, state), selected.scope.kind,
    selected.scope.ref ?? "", annotationSetVersion].join("\u0000");
}
function humanExportCacheIdentity(principal, selected, state) {
  return [principal.actorId, selected.courseId, selected.expectedRevision, state.q].join("\u0000");
}
function reusedHumanExport(adapter, identity, key, state) {
  const entry = humanExportCache.get(adapter);
  if (!entry) return null;
  if (state.o > 0 && entry.identity === identity && entry.key !== key) {
    throw new AuthoringApiError(409, "human_read_context_changed", "A seleção ou as observações do Curso mudaram. Recomece a exportação.");
  }
  if (entry.identity !== identity || entry.key !== key) {
    humanExportCache.delete(adapter);
    return null;
  }
  return entry.prepared;
}
function rememberHumanExport(adapter, identity, key, prepared) {
  humanExportCache.delete(adapter);
  if (prepared.literal.length <= MAX_CACHED_EXPORT_LITERAL_CHARACTERS) {
    humanExportCache.set(adapter, { identity, key, prepared });
  }
}
async function readExportAnnotationSetVersion(adapter, principal, selected, deadlineAt) {
  const course = await adapter.getCourse({ principal, courseId: selected.courseId, includeOutline: false, deadlineAt });
  if (!course || course.courseId !== selected.courseId || course.revision !== selected.expectedRevision ||
      !Number.isSafeInteger(course.annotationSetVersion) || course.annotationSetVersion < 0) {
    throw new AuthoringApiError(503, "course_service_unavailable", "A versão das observações não corresponde ao Curso selecionado.");
  }
  return course.annotationSetVersion;
}
function assertSelectedExport(value, selected) {
  if (!value || value.contract !== COURSE_AUTHORING_EXPORT_CONTRACT ||
      value.course?.id !== selected.courseId || value.course?.revision !== selected.expectedRevision ||
      value.scope?.kind !== selected.scope.kind || value.scope?.ref !== selected.scope.ref) {
    throw new AuthoringApiError(503, "course_service_unavailable", "A exportação não corresponde à edição e ao recorte selecionados.");
  }
}
export async function exportHumanCourse({ adapter, principal, args, deadlineAt, preparedRead = null }) {
  const selected = await selection(adapter, principal, args.recorte, deadlineAt);
  const annotationSetVersion = await readExportAnnotationSetVersion(adapter, principal, selected, deadlineAt);
  const state = await openHumanReadContinuation({ args, task: "exportar_autoria",
    course: { id: selected.courseId, revision: selected.expectedRevision },
    queryContext: { annotationSetVersion } });
  const cacheIdentity = humanExportCacheIdentity(principal, selected, state);
  const cacheKey = humanExportCacheKey(principal, selected, state, annotationSetVersion);
  let prepared = preparedRead ? null : reusedHumanExport(adapter, cacheIdentity, cacheKey, state);
  if (!prepared) {
    {
      let exported = await adapter.getCourseAuthoringExport({ principal, ...selected, deadlineAt });
      assertSelectedExport(exported, selected);
      if (!isValidatedCourseAuthoringExport(exported)) {
        exported = normalizeCourseAuthoringExport(exported, { expectedSelection: {
          courseId: selected.courseId, expectedRevision: selected.expectedRevision, scope: selected.scope
        } });
      }
      let serialized = takeSerializedCourseAuthoringExport(exported);
      try {
        if (serialized === null) {
          serialized = serializeCourseAuthoringExport(exported);
          takeSerializedCourseAuthoringExport(exported);
        }
      }
      catch (error) {
        if (error instanceof RangeError) throw new AuthoringApiError(413, "course_export_too_large", "A exportação excede o limite de 32 MiB.");
        throw error;
      }
      prepared = await prepareSerializedAuthoringExportLiteral(serialized);
    }
    const finalAnnotationSetVersion = await readExportAnnotationSetVersion(adapter, principal, selected, deadlineAt);
    if (finalAnnotationSetVersion !== annotationSetVersion) {
      throw new AuthoringApiError(409, "human_read_context_changed", "As observações mudaram durante a exportação. Recomece a consulta.");
    }
  }
  const envelope = { result: "Preparei a exportação literal do artefato e da leitura autoral; continue até receber todos os trechos.",
    ...buildHumanNavigationEnvelope(selectedContentLink(adapter, selected)), nextDecision: null };
  if (preparedRead) return presentPersistedHumanRead({ adapter, principal, preparedRead, prepared,
    state, envelope, deadlineAt });
  const context = await paginatePreparedHumanReadLiteral(prepared, { state });
  if (!humanExportCache.has(adapter) || humanExportCache.get(adapter)?.key !== cacheKey) {
    rememberHumanExport(adapter, cacheIdentity, cacheKey, prepared);
  }
  return { ...envelope, context };
}
