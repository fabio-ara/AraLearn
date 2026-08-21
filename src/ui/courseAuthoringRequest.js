import { UUID_PATTERN } from "../domain/identifiers.js";
import { parseCourseAuthoringRoute } from "./courseAuthoringRoute.js";

export const COURSE_AUTHORING_REQUEST_TARGET_TYPES = Object.freeze([
  "course",
  "module",
  "lesson",
  "topic",
  "didactic_microsequence",
  "study_unit",
  "source",
  "source_anchor",
  "authoring_part",
  "audit_finding",
  "audit_run",
  "authoring_correction"
]);

export const COURSE_AUTHORING_REQUEST_ACTIONS = Object.freeze([
  "plan",
  "prepare_structure",
  "review",
  "discuss",
  "verify_source",
  "correct_study_unit",
  "materialize_authoring_part"
]);

const REQUEST_FIELDS = new Set([
  "course", "target", "action", "instruction", "deepLink", "limits", "references"
]);
const COURSE_FIELDS = new Set(["id", "title", "revision"]);
const TARGET_FIELDS = new Set(["type", "id", "title", "path"]);
const REFERENCE_FIELDS = new Set(["materializationId", "auditRunId", "annotationId"]);
const TARGET_LABELS = Object.freeze({
  course: "Curso",
  module: "Módulo",
  lesson: "Lição",
  topic: "Tópico",
  didactic_microsequence: "Microssequência didática",
  study_unit: "Unidade de estudo",
  source: "Fonte",
  source_anchor: "Âncora",
  authoring_part: "Parte de autoria",
  audit_finding: "Achado de auditoria",
  audit_run: "Rodada de auditoria",
  authoring_correction: "Correção autoral"
});
const ACTION_LABELS = Object.freeze({
  plan: "planejar",
  prepare_structure: "preparar a estrutura",
  review: "revisar",
  discuss: "discutir",
  verify_source: "verificar a Fonte",
  correct_study_unit: "corrigir a Unidade de estudo",
  materialize_authoring_part: "materializar a Parte de autoria"
});
const ACTION_TARGET_TYPES = Object.freeze({
  verify_source: new Set(["source", "source_anchor"]),
  correct_study_unit: new Set(["study_unit"]),
  materialize_authoring_part: new Set(["authoring_part"])
});
const REFERENCE_LABELS = Object.freeze({
  materializationId: "Execução de materialização",
  auditRunId: "Rodada de auditoria",
  annotationId: "Observação vinculada"
});
const BASE_LIMITS = Object.freeze([
  "Releia no AraLearn o estado persistido do Curso e confira a revisão antes de agir; se ela mudou, reconcilie a intenção com a pessoa autora.",
  "Atue somente no alvo e na instrução deste pedido; não altere outros escopos.",
  "Use apenas os contratos e as operações atuais do AraLearn; não invente identidades, vínculos, Fontes, Âncoras, conteúdo ou fatos ausentes.",
  "Divida o trabalho em chamadas ou lotes menores quando os limites devolvidos pelas ferramentas, pela rede, pelo modelo ou pela transação exigirem.",
  "Depois de qualquer alteração, releia o estado persistido e descreva somente o que foi confirmado."
]);
const ACTION_LIMITS = Object.freeze({
  prepare_structure: Object.freeze([
    "Persista a composição somente pelos contratos estruturais atuais do AraLearn.",
    "Vincule as Microssequências às Partes previstas no planejamento persistido.",
    "Não invente conteúdo ou fatos nem materialize Unidades de estudo sem uma solicitação explícita."
  ]),
  materialize_authoring_part: Object.freeze([
    "Limite a produção à Parte identificada e ao planejamento persistido; não avance outra Parte."
  ])
});

const MAX_TARGET_ID_LENGTH = 4_096;
const MAX_TITLE_LENGTH = 300;
const MAX_PATH_LENGTH = 2_000;
const MAX_INSTRUCTION_LENGTH = 12_000;
const MAX_DEEP_LINK_LENGTH = 2_048;
const MAX_LIMIT_LENGTH = 1_000;
const MAX_LIMIT_COUNT = 12;

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactRecord(value, fields, message) {
  if (!isPlainObject(value) || Object.keys(value).some((field) => !fields.has(field))) {
    throw new TypeError(message);
  }
}

function containsControlCharacters(value, { allowLayout = false } = {}) {
  return [...value].some((character) => {
    const point = character.codePointAt(0);
    if (point >= 127 && point <= 159) return true;
    if (point >= 32) return false;
    return !allowLayout || ![9, 10, 13].includes(point);
  });
}

function text(value, label, maximum, { allowLayout = false } = {}) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > maximum ||
      containsControlCharacters(normalized, { allowLayout })) {
    throw new TypeError(`${label} é inválida.`);
  }
  return normalized;
}

function optionalText(value, label, maximum, options = {}) {
  if (value == null) return null;
  return text(value, label, maximum, options);
}

function normalizeCourse(value) {
  exactRecord(value, COURSE_FIELDS, "O Curso do pedido de Autoria é inválido.");
  if (typeof value.id !== "string" || !UUID_PATTERN.test(value.id)) {
    throw new TypeError("A identidade do Curso do pedido de Autoria é inválida.");
  }
  if (!Number.isSafeInteger(value.revision) || value.revision < 1) {
    throw new TypeError("A revisão do Curso do pedido de Autoria é inválida.");
  }
  return {
    id: value.id.toLowerCase(),
    title: text(value.title, "O título do Curso", MAX_TITLE_LENGTH),
    revision: value.revision
  };
}

function normalizePath(value) {
  if (value == null) return null;
  if (typeof value === "string") {
    return text(value, "O caminho do alvo", MAX_PATH_LENGTH);
  }
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) {
    throw new TypeError("O caminho do alvo é inválido.");
  }
  const path = value.map((segment) => text(segment, "Um segmento do caminho", MAX_TITLE_LENGTH));
  const joined = path.join(" › ");
  if (joined.length > MAX_PATH_LENGTH) throw new TypeError("O caminho do alvo é inválido.");
  return joined;
}

function normalizeTarget(value, course) {
  exactRecord(value, TARGET_FIELDS, "O alvo do pedido de Autoria é inválido.");
  if (!COURSE_AUTHORING_REQUEST_TARGET_TYPES.includes(value.type)) {
    throw new TypeError("O tipo do alvo do pedido de Autoria é inválido.");
  }
  const target = {
    type: value.type,
    id: optionalText(value.id, "A identidade do alvo", MAX_TARGET_ID_LENGTH),
    title: optionalText(value.title, "O título do alvo", MAX_TITLE_LENGTH),
    path: normalizePath(value.path)
  };
  if (target.type === "course") {
    if (target.id && target.id.toLowerCase() !== course.id) {
      throw new TypeError("O alvo não pertence ao Curso do pedido de Autoria.");
    }
    target.id = course.id;
    target.title ??= course.title;
  }
  return target;
}

function normalizeDeepLink(value, courseId) {
  const deepLink = text(value, "O deep link do pedido de Autoria", MAX_DEEP_LINK_LENGTH);
  let hash;
  if (deepLink.startsWith("#/")) {
    hash = deepLink;
  } else {
    let parsed;
    try {
      parsed = new URL(deepLink);
    } catch {
      throw new TypeError("O deep link do pedido de Autoria é inválido.");
    }
    if (!["https:", "http:"].includes(parsed.protocol)) {
      throw new TypeError("O deep link do pedido de Autoria é inválido.");
    }
    hash = parsed.hash;
  }
  const route = parseCourseAuthoringRoute(hash);
  if (route?.courseId.toLowerCase() !== courseId) {
    throw new TypeError("O deep link não pertence ao Curso do pedido de Autoria.");
  }
  return deepLink;
}

function normalizeReferences(value) {
  if (value == null) return {};
  exactRecord(value, REFERENCE_FIELDS, "As referências do pedido de Autoria são inválidas.");
  const references = {};
  for (const field of REFERENCE_FIELDS) {
    if (value[field] == null) continue;
    if (typeof value[field] !== "string" || !UUID_PATTERN.test(value[field])) {
      throw new TypeError(`${REFERENCE_LABELS[field]} é inválida.`);
    }
    references[field] = value[field].toLowerCase();
  }
  return references;
}

function normalizeLimits(value, action) {
  if (value != null && (!Array.isArray(value) || value.length > MAX_LIMIT_COUNT)) {
    throw new TypeError("Os limites do pedido de Autoria são inválidos.");
  }
  const supplied = (value || []).map((limit) =>
    text(limit, "Um limite do pedido de Autoria", MAX_LIMIT_LENGTH)
  );
  const limits = [...BASE_LIMITS, ...(ACTION_LIMITS[action] || []), ...supplied];
  const seen = new Set();
  return limits.filter((limit) => {
    const key = limit.toLocaleLowerCase("pt-BR");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeCourseAuthoringRequest(value) {
  exactRecord(value, REQUEST_FIELDS, "O pedido de Autoria é inválido.");
  const course = normalizeCourse(value.course);
  if (!COURSE_AUTHORING_REQUEST_ACTIONS.includes(value.action)) {
    throw new TypeError("A ação do pedido de Autoria é inválida.");
  }
  const target = normalizeTarget(value.target, course);
  if (ACTION_TARGET_TYPES[value.action] && !ACTION_TARGET_TYPES[value.action].has(target.type)) {
    throw new TypeError("A ação não corresponde ao tipo de alvo do pedido de Autoria.");
  }
  return {
    course,
    target,
    action: value.action,
    instruction: text(
      value.instruction,
      "A instrução do pedido de Autoria",
      MAX_INSTRUCTION_LENGTH,
      { allowLayout: true }
    ),
    deepLink: normalizeDeepLink(value.deepLink, course.id),
    limits: normalizeLimits(value.limits, value.action),
    references: normalizeReferences(value.references)
  };
}

function targetDescription(target) {
  const details = [];
  if (target.title) details.push(`“${target.title}”`);
  if (target.id) details.push(`identidade ${target.id}`);
  return `${TARGET_LABELS[target.type]}${details.length ? ` ${details.join(", ")}` : ""}`;
}

export function buildCourseAuthoringRequestText(value) {
  const request = normalizeCourseAuthoringRequest(value);
  const lines = [
    "Pedido de Autoria no AraLearn",
    "",
    `Ação: ${ACTION_LABELS[request.action]}.`,
    `Curso: “${request.course.title}”.`,
    `Identidade do Curso: ${request.course.id}.`,
    `Revisão observada ao copiar: ${request.course.revision}.`,
    `Alvo: ${targetDescription(request.target)}.`
  ];
  if (request.target.path) lines.push(`Caminho: ${request.target.path}.`);
  for (const [field, reference] of Object.entries(request.references)) {
    lines.push(`${REFERENCE_LABELS[field]}: ${reference}.`);
  }
  lines.push(
    "",
    "Instrução da pessoa autora:",
    request.instruction,
    "",
    `Abra o alvo no AraLearn: ${request.deepLink}`,
    "",
    "Limites deste pedido:",
    ...request.limits.map((limit) => `- ${limit}`),
    "",
    "Esta cópia não alterou o Curso. Use o AraLearn conectado para ler ou confirmar qualquer mudança."
  );
  return lines.join("\n");
}
