import { buildCourseAuthoringRoute, parseCourseAuthoringRoute } from
  "../aralearn/runtime/domain/courseAuthoringRoute.js";

const DESTINATIONS = Object.freeze({
  content: { section: "content", label: "Ler conteúdo", nextDecision: "Leia o conteúdo indicado antes de decidir o próximo passo." },
  observations: { section: "review", label: "Abrir observações", nextDecision: "Confira as observações e seus alvos." },
  sources: { section: "sources", label: "Abrir fontes", nextDecision: "Confira as fontes indicadas." },
  planning: { section: "planning", label: "Abrir planejamento", nextDecision: "Confira o planejamento antes de continuar." },
  parameters: { section: "parameters", label: "Abrir parâmetros", nextDecision: "Confira os parâmetros aplicados ao conteúdo." }
});
const TARGET_OPTIONS = Object.freeze({
  authoring_part: "authoringPartId", module: "moduleId", lesson: "lessonId", topic: "topicId",
  didactic_microsequence: "didacticMicrosequenceId", microsequence_explanation: "explanationId",
  study_unit: "studyUnitId", anchored_annotation: "annotationId", course_source: "sourceId"
});

function optionsFor({ relation, target = null, revision = null }) {
  const definition = DESTINATIONS[relation];
  if (!definition) throw new TypeError("A relação de navegação é inválida.");
  const options = { section: definition.section };
  if (target != null) {
    if (!target || typeof target !== "object" || Array.isArray(target) ||
        typeof target.id !== "string" || !target.id ||
        Object.keys(target).some(key => !["kind", "id", "anchorId"].includes(key))) {
      throw new TypeError("O alvo de navegação é inválido.");
    }
    const field = TARGET_OPTIONS[target.kind];
    if (!field) throw new TypeError("O alvo de navegação é inválido.");
    options[field] = target.id;
    if (target.anchorId != null) options.anchorId = target.anchorId;
  }
  if (revision != null) options.revision = revision;
  return options;
}

export function normalizeHumanNavigation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      !["relation", "target", "label", "url"].every(key => Object.hasOwn(value, key)) ||
      Object.keys(value).some(key => !["relation", "target", "label", "url", "revision"].includes(key)) ||
      typeof value.label !== "string" || !value.label.trim() || value.label.length > 300 ||
      typeof value.url !== "string" || value.url.length > 4096) {
    throw new TypeError("O destino humano é inválido.");
  }
  let url;
  try { url = new URL(value.url); } catch { throw new TypeError("A URL de navegação é inválida."); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
    throw new TypeError("A URL de navegação é inválida.");
  }
  const route = parseCourseAuthoringRoute(url.hash);
  if (!route || buildCourseAuthoringRoute(route.courseId, optionsFor(value)) !== url.hash) {
    throw new TypeError("A relação e o alvo discordam da rota de navegação.");
  }
  return Object.freeze({ relation: value.relation, target: route.target, label: value.label,
    url: value.url, ...(route.revision == null ? {} : { revision: route.revision }) });
}

export function normalizeHumanNavigationEnvelope({ deepLink, links = [] }) {
  if (!Array.isArray(links) || !(deepLink === null || typeof deepLink === "string")) {
    throw new TypeError("Os destinos da tarefa são inválidos.");
  }
  const normalized = links.map(normalizeHumanNavigation);
  if (deepLink !== null && normalized[0]?.url !== deepLink) {
    throw new TypeError("O destino principal precisa corresponder ao primeiro link tipado.");
  }
  return { deepLink, links: normalized };
}

export function createHumanNavigation(adapter, { courseId, relation, target = null, revision = null, label = null }) {
  const hash = buildCourseAuthoringRoute(courseId, optionsFor({ relation, target, revision }));
  if (!adapter.publicAppUrl) return null;
  const base = String(adapter.publicAppUrl).replace(/\/+$/u, "");
  return normalizeHumanNavigation({ relation, target, label: label || DESTINATIONS[relation].label,
    url: `${base}/${hash}`, ...(revision == null ? {} : { revision }) });
}

export function buildHumanNavigationEnvelope(primary, related = [], { nextDecision = null } = {}) {
  const links = [primary, ...related].filter(Boolean).map(normalizeHumanNavigation);
  return { deepLink: primary?.url ?? null, links,
    nextDecision: nextDecision ?? (primary ? DESTINATIONS[primary.relation].nextDecision :
      "Não há destino de navegação disponível para esta leitura.") };
}
