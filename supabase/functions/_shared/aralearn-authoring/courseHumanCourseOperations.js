import { AuthoringApiError } from "./errors.js";
import { resolveHumanCourseContext } from "./courseHumanTaskExecutor.js";
import { openHumanReadContinuation, paginateHumanReadContext } from "./courseHumanReadContext.js";
import { createCourseCopyRequestIdentity, normalizeCourseCopyRequest } from "../aralearn/runtime/domain/courseCopy.js";
import { normalizeCourseAuthoringComparison, normalizeCourseAuthoringExport } from "../aralearn/runtime/domain/courseAuthoringComparison.js";

const fail = message => { throw new AuthoringApiError(422, "invalid_human_course_operation", message); };
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
    return { result: "Preparei uma cópia independente, privada e com arquivos restritos.", deepLink: resolved.course.deepLink,
      nextDecision: "Após a escolha de copiar, repita a tarefa com a confirmação devolvida. Reutilize-a se a resposta se perder.",
      context: { curso: resolved.course.title, titulo: title,
        inclui: "Mapa, conteúdo, configuração, fontes, PDFs e áudios autorizados.",
        preservaNaOrigem: "Acessos, progresso e anotações pessoais.",
        confirmacao: encodeCopy({ actor: principal.actorId, courseTitle, request }) } };
  }
  const request = decodeCopy(args.confirmacao, principal, courseTitle, title);
  const receipt = await adapter.copyCourse({ principal, ...request, deadlineAt });
  const base = String(adapter.publicAppUrl || "").replace(/\/+$/u, "");
  return { result: receipt.idempotent ? "Recuperei a mesma cópia já criada." : "Criei a cópia independente.",
    deepLink: base ? `${base}/#/authoring/courses/${encodeURIComponent(receipt.targetCourseId)}?section=planning` : null,
    nextDecision: null, context: { titulo: title, confirmacao: args.confirmacao } };
}

async function selection(adapter, principal, input, deadlineAt) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some(key => !["curso", "parte", "microssequencia", "unidade"].includes(key))) fail("Selecione curso e recorte legíveis.");
  const resolved = await resolveHumanCourseContext({ adapter, principal, course: humanText(input.curso, "o curso"),
    part: input.parte ?? null, microsequence: input.microssequencia ?? null,
    studyUnits: input.unidade === undefined ? [] : [input.unidade], deadlineAt });
  return { courseId: resolved.course.id, expectedRevision: resolved.course.revision,
    scope: resolved.studyUnits.length ? { kind: "study_unit", ref: resolved.studyUnits[0].studyUnit.id }
      : resolved.microsequence ? { kind: "didactic_microsequence", ref: resolved.microsequence.id }
        : resolved.part ? { kind: "authoring_part", ref: resolved.part.id } : { kind: "course", ref: null } };
}
export async function compareHumanCourses({ adapter, principal, args, deadlineAt }) {
  const left = await selection(adapter, principal, args.esquerda, deadlineAt);
  const right = await selection(adapter, principal, args.direita, deadlineAt);
  const state = await openHumanReadContinuation({ args, task: "comparar_cursos",
    course: { id: `${left.courseId}:${right.courseId}`, revision: `${left.expectedRevision}:${right.expectedRevision}` } });
  const comparison = normalizeCourseAuthoringComparison(await adapter.compareCourseAuthoring({ principal, left, right, deadlineAt }),
    { expectedRequest: { left, right } });
  return { result: "Comparei os recortes pelo inventário e pelas dimensões declaradas, sem certificar equivalência pedagógica.",
    deepLink: comparison.left.deepLink, nextDecision: null,
    context: await paginateHumanReadContext({ authoringComparison: comparison }, { state }) };
}
export async function exportHumanCourse({ adapter, principal, args, deadlineAt }) {
  const selected = await selection(adapter, principal, args.recorte, deadlineAt);
  const state = await openHumanReadContinuation({ args, task: "exportar_autoria",
    course: { id: selected.courseId, revision: selected.expectedRevision } });
  const exported = normalizeCourseAuthoringExport(await adapter.getCourseAuthoringExport({ principal, ...selected, deadlineAt }),
    { expectedSelection: selected });
  return { result: "Preparei a exportação literal do artefato e da leitura autoral; continue até receber todos os trechos.",
    deepLink: exported.analytics.deepLink, nextDecision: null,
    context: await paginateHumanReadContext({ authoringExport: exported }, { state }) };
}
