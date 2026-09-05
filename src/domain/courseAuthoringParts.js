export const COURSE_AUTHORING_PART_MAX_MICROSEQUENCES = 64;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;

export class CourseAuthoringPartsError extends TypeError {
  constructor(message) {
    super(message);
    this.name = "CourseAuthoringPartsError";
    this.code = "invalid_course_authoring_part";
  }
}
const fail = (message) => { throw new CourseAuthoringPartsError(message); };
function exact(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length !== fields.length || fields.some(field => !Object.hasOwn(value, field))) {
    fail("A reorganização contém campos ausentes ou desconhecidos.");
  }
}
function text(value, maximum, label) {
  if (typeof value !== "string" || !value.trim() || [...value].length > maximum ||
      [...value].some(character => {
        const code = character.codePointAt(0);
        return code < 32 && ![9, 10, 13].includes(code) || code >= 127 && code <= 159;
      })) fail(`${label} inválido ou acima do limite.`);
  return value;
}
function uuid(value) {
  if (typeof value !== "string" || !UUID.test(value)) fail("Identidade da reorganização inválida.");
  return value;
}
function revision(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail("Revisão da reorganização inválida.");
  return value;
}
export function normalizeCourseAuthoringPart(value) {
  exact(value, ["partId", "position", "title", "intent", "progression", "microsequences"]);
  if (value.partId !== null) uuid(value.partId);
  if (!Number.isSafeInteger(value.position) || value.position < 0 || value.position > 63) fail("Posição do lote inválida.");
  text(value.title, 300, "Título"); text(value.intent, 4000, "Intenção");
  if (!Array.isArray(value.progression) || value.progression.length < 1 || value.progression.length > 64) fail("Informe de 1 a 64 passos de progressão.");
  value.progression.forEach(item => text(item, 1000, "Passo da progressão"));
  if (new TextEncoder().encode(JSON.stringify(value.progression)).length > 65536) fail("A progressão excede o limite aceito.");
  if (!Array.isArray(value.microsequences) || value.microsequences.length < 1 ||
      value.microsequences.length > COURSE_AUTHORING_PART_MAX_MICROSEQUENCES) fail("O lote aceita de 1 a 64 microssequências existentes.");
  const identities = new Set();
  value.microsequences.forEach((item, position) => {
    exact(item, ["microsequenceId", "position"]);
    text(item.microsequenceId, 240, "Microssequência");
    if (item.microsequenceId !== item.microsequenceId.trim() || item.position !== position ||
        identities.has(item.microsequenceId)) fail("A ordem do lote repete ou desloca uma microssequência.");
    identities.add(item.microsequenceId);
  });
  return structuredClone(value);
}
export function normalizeCourseAuthoringPartRequest(value) {
  exact(value, ["courseId", "expectedCourseRevision", "expectedPlanVersion", "requestId", "part"]);
  uuid(value.courseId); revision(value.expectedCourseRevision); revision(value.expectedPlanVersion);
  if (typeof value.requestId !== "string" || !REQUEST_ID.test(value.requestId)) fail("Identidade do pedido inválida.");
  return { ...value, part: normalizeCourseAuthoringPart(value.part) };
}
export function normalizeCourseAuthoringPartChange(value, request) {
  const fields = ["contract", "courseId", "courseRevision", "planVersion", "authoringPartId", "changed", "idempotent"];
  exact(value, Object.hasOwn(value || {}, "deepLink") ? [...fields, "deepLink"] : fields);
  if (value.contract !== "aralearn.course-authoring-part-change.v1") fail("A confirmação do lote é inválida.");
  uuid(value.courseId); uuid(value.authoringPartId); revision(value.courseRevision); revision(value.planVersion);
  if (typeof value.changed !== "boolean" || typeof value.idempotent !== "boolean") fail("A confirmação do lote é inválida.");
  if (request && (value.courseId !== request.courseId ||
      request.part.partId !== null && value.authoringPartId !== request.part.partId ||
      value.courseRevision !== request.expectedCourseRevision + (value.changed ? 1 : 0) ||
      value.planVersion !== request.expectedPlanVersion + (value.changed ? 1 : 0))) {
    fail("A confirmação não corresponde à reorganização enviada.");
  }
  // Navegação é construída pelo aplicativo a partir da identidade confirmada.
  return Object.fromEntries(fields.map(field => [field, value[field]]));
}

export function courseAuthoringPartDraft(part, { position = part.position } = {}) {
  return { partId: part.id, position, title: part.title, intent: part.intent,
    progression: [...part.progression], microsequences: part.microsequences.map((item, index) => ({
      microsequenceId: item.id, position: index
    })) };
}
export function splitCourseAuthoringPart(part, after) {
  if (!Number.isSafeInteger(after) || after < 1 || after >= part.microsequences.length) fail("Escolha uma divisão que mantenha microssequências nos dois lotes.");
  return { ...courseAuthoringPartDraft(part), partId: null, position: part.position + 1,
    title: `${part.title} — continuação`, microsequences: part.microsequences.slice(after).map((item, position) => ({
      microsequenceId: item.id, position
    })) };
}
export function mergeCourseAuthoringParts(parts) {
  if (!Array.isArray(parts) || parts.length < 2 || new Set(parts.map(part => part.id)).size !== parts.length) fail("Escolha ao menos dois lotes distintos.");
  const ordered = [...parts].sort((a, b) => a.position - b.position);
  return { ...courseAuthoringPartDraft(ordered[0]),
    title: ordered.map(part => part.title).join(" + "),
    intent: ordered.map(part => `${part.title}\n${part.intent}`).join("\n\n"),
    progression: ordered.flatMap(part => part.progression),
    microsequences: ordered.flatMap(part => part.microsequences).map((item, position) => ({
      microsequenceId: item.id, position
    })) };
}
