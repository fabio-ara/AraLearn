import { createHash } from "node:crypto";

import {
  composeCourseDocument,
  flattenCourseDocument
} from "../../src/domain/courseEntities.js";
import { validateProjectDocument } from "../../src/domain/aralearnProject.js";
import { canonicalRevisionString } from "../../src/storage/canonicalRevision.js";

const SOURCE_KINDS = new Set([
  "root_only",
  "root_and_publication",
  "publication_only"
]);

const CUTOVER_MIGRATION_VERSION = "20260817140000";
const CUTOVER_MIGRATION_NAME = "course_identity_cutover";
const PROFILE_ACCESS_MIGRATION_VERSION = "20260817150000";
const PROFILE_ACCESS_MIGRATION_NAME = "course_profiles_access";
const AUTHORING_PLAN_MIGRATION_VERSION = "20260817160000";
const AUTHORING_PLAN_MIGRATION_NAME = "course_authoring_plan";
const STUDY_UNIT_INSPECTION_MIGRATION_VERSION = "20260817170000";
const STUDY_UNIT_INSPECTION_MIGRATION_NAME = "course_study_unit_inspection";
const COURSE_DESIGN_MIGRATION_VERSION = "20260817180000";
const COURSE_DESIGN_MIGRATION_NAME = "course_design_parameters";

export const COURSE_CUTOVER_STAGING_SCHEMA = Object.freeze([
  Object.freeze({ name: "course_id", sql: "uuid not null" }),
  Object.freeze({ name: "source_kind", sql: "text not null" }),
  Object.freeze({ name: "workspace_id", sql: "uuid" }),
  Object.freeze({ name: "workspace_revision", sql: "bigint" }),
  Object.freeze({ name: "legacy_course_id", sql: "uuid" }),
  Object.freeze({ name: "legacy_revision_hash", sql: "text" }),
  Object.freeze({ name: "manifest_hash", sql: "text not null" }),
  Object.freeze({ name: "course_title", sql: "text not null" }),
  Object.freeze({ name: "course_goal", sql: "text not null" }),
  Object.freeze({ name: "entity_type", sql: "text not null" }),
  Object.freeze({ name: "entity_id", sql: "text not null" }),
  Object.freeze({ name: "parent_type", sql: "text" }),
  Object.freeze({ name: "parent_id", sql: "text" }),
  Object.freeze({ name: "position", sql: "integer not null" }),
  Object.freeze({ name: "entity_version", sql: "bigint not null" }),
  Object.freeze({ name: "entity_created_at", sql: "timestamptz not null" }),
  Object.freeze({ name: "entity_updated_at", sql: "timestamptz not null" }),
  Object.freeze({ name: "content", sql: "jsonb not null" })
]);

export const COURSE_CUTOVER_TRANSACTION_GUARDS = Object.freeze([
  "set local lock_timeout = '15s';",
  "set local statement_timeout = '10min';"
]);

const PREPARATION_SEALS = new WeakMap();

const LEGACY_CONTENT_FIELDS = Object.freeze({
  paragraph: Object.freeze(["text"]),
  table: Object.freeze(["columns", "rows"]),
  code: Object.freeze(["prompt", "language", "code"]),
  tree: Object.freeze(["prompt", "variant", "nodes"]),
  relation_map: Object.freeze([
    "prompt", "leftSet", "rightSet", "relations"
  ]),
  graph: Object.freeze([
    "prompt", "layout", "vertices", "edges"
  ])
});

const LEGACY_CARD_BASE_FIELDS = Object.freeze([
  "id", "position", "resource", "kind", "exercise", "title", "after",
  "sources", "topics"
]);

const LEGACY_CHOICE_FIELDS = Object.freeze([
  "question", "options", "selectionMode", "selectionCriterion", "answerIds"
]);

const LEGACY_CARD_FIELDS = new Set([
  ...LEGACY_CARD_BASE_FIELDS,
  ...LEGACY_CHOICE_FIELDS,
  "groups", "items", "links",
  ...Object.values(LEGACY_CONTENT_FIELDS).flat()
]);

const CURRENT_GRAPH_LAYOUT = Object.freeze({
  auto: "auto",
  force: "force",
  network: "force",
  hierarchical: "hierarchical",
  path: "hierarchical",
  causal: "hierarchical",
  circular: "circular",
  cycle: "circular",
  radial: "radial",
  star: "radial"
});

const LEGACY_ENTITY_CHILDREN = Object.freeze({
  course: Object.freeze([
    Object.freeze({ type: "module", field: "modules" })
  ]),
  module: Object.freeze([
    Object.freeze({ type: "lesson", field: "lessons" })
  ]),
  lesson: Object.freeze([
    Object.freeze({ type: "topic", field: "topics" }),
    Object.freeze({ type: "microsequence", field: "microsequences" })
  ]),
  topic: Object.freeze([]),
  microsequence: Object.freeze([
    Object.freeze({ type: "card", field: "cards" })
  ]),
  card: Object.freeze([])
});

const CURRENT_ENTITY_CHILDREN = Object.freeze({
  course: Object.freeze([
    Object.freeze({ type: "module", field: "modules" })
  ]),
  module: Object.freeze([
    Object.freeze({ type: "lesson", field: "lessons" })
  ]),
  lesson: Object.freeze([
    Object.freeze({ type: "topic", field: "topics" }),
    Object.freeze({ type: "microsequence", field: "microsequences" })
  ]),
  topic: Object.freeze([]),
  microsequence: Object.freeze([
    Object.freeze({ type: "study_unit", field: "studyUnits" })
  ]),
  study_unit: Object.freeze([])
});

export class CourseCutoverImportError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "CourseCutoverImportError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new CourseCutoverImportError(code, message, details);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function entityVersion(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    fail("invalid_entity_metadata", `${label} possui versão inválida.`);
  }
  return value;
}

function entityTimestamp(value, label) {
  if (typeof value !== "string" || !value.trim() ||
      !Number.isFinite(Date.parse(value))) {
    fail("invalid_entity_metadata", `${label} possui instante inválido.`);
  }
  return new Date(value).toISOString().replace(/\.000Z$/u, "Z");
}

function normalizedEntityMetadata(value, label) {
  if (!isObject(value)) {
    fail("invalid_entity_metadata", `${label} não possui metadados técnicos.`);
  }
  const version = entityVersion(value.entityVersion ?? value.version, label);
  const createdAt = entityTimestamp(value.entityCreatedAt ?? value.createdAt, label);
  const updatedAt = entityTimestamp(value.entityUpdatedAt ?? value.updatedAt, label);
  if (Date.parse(createdAt) > Date.parse(updatedAt)) {
    fail("invalid_entity_metadata", `${label} possui ordem temporal inválida.`);
  }
  return { version, createdAt, updatedAt };
}

function entityMetadataForRows(entry, rows) {
  if (entry.sourceKind === "publication_only") {
    if (entry.entityDefaults?.basis !== "course_record") {
      fail(
        "invalid_entity_metadata_defaults",
        "Curso sem origem relacional não declara a base temporal dos defaults."
      );
    }
    const defaults = normalizedEntityMetadata(
      entry.entityDefaults,
      "Defaults do Curso sem origem relacional"
    );
    if (defaults.version !== 1) {
      fail(
        "invalid_entity_metadata_defaults",
        "Curso sem origem relacional deve iniciar entidades na versão 1."
      );
    }
    return rows.map((row) => ({
      entityType: row.entityType,
      entityId: row.entityId,
      ...defaults
    }));
  }

  const source = new Map();
  for (const row of entry.workspaceEntities || []) {
    const key = entityIdentity(row.entityType, row.entityId);
    if (source.has(key)) {
      fail("duplicate_workspace_entity", "Entidade viva está duplicada.");
    }
    source.set(key, normalizedEntityMetadata(
      row,
      `Entidade ${row.entityType || "desconhecida"}/${row.entityId || "sem-id"}`
    ));
  }
  return rows.map((row) => {
    const sourceType = row.entityType === "study_unit" ? "card" : row.entityType;
    const metadata = source.get(entityIdentity(sourceType, row.entityId));
    if (!metadata) {
      fail(
        "missing_entity_metadata",
        "Entidade convertida não possui estado técnico unívoco na origem."
      );
    }
    return { entityType: row.entityType, entityId: row.entityId, ...metadata };
  });
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalSha256(value) {
  // Única regra do corte: JSON canônico do repositório, UTF-8 e SHA-256 hex.
  return sha256Bytes(Buffer.from(canonicalRevisionString(value), "utf8"));
}

function assertExactFields(value, allowed, code, label) {
  const unknown = Object.keys(value || {}).filter((field) => !allowed.has(field));
  if (unknown.length) {
    fail(code, `${label} contém campo sem regra de conversão.`, {
      fieldCount: unknown.length
    });
  }
}

function mapChoiceOption(option, index) {
  if (!isObject(option)) {
    fail("ambiguous_choice_option", "Alternativa antiga não possui estrutura explícita.", {
      optionIndex: index
    });
  }
  const id = text(option.id);
  if (!id) {
    fail("ambiguous_choice_option", "Alternativa antiga não possui identidade.", {
      optionIndex: index
    });
  }
  if (typeof option.text === "string") {
    assertExactFields(
      option,
      new Set(["id", "text", "feedback", "misconceptionId"]),
      "ambiguous_choice_option",
      "Alternativa textual"
    );
    return {
      id,
      kind: "text",
      text: option.text,
      ...(text(option.feedback) ? { feedback: option.feedback } : {}),
      ...(text(option.misconceptionId)
        ? { misconceptionId: option.misconceptionId }
        : {})
    };
  }
  if (typeof option.code === "string" && text(option.language)) {
    assertExactFields(
      option,
      new Set(["id", "language", "code", "feedback", "misconceptionId"]),
      "ambiguous_choice_option",
      "Alternativa de código"
    );
    return {
      id,
      kind: "code",
      language: option.language,
      code: option.code,
      ...(text(option.feedback) ? { feedback: option.feedback } : {}),
      ...(text(option.misconceptionId)
        ? { misconceptionId: option.misconceptionId }
        : {})
    };
  }
  fail("ambiguous_choice_option", "Alternativa antiga não define texto nem código.", {
    optionIndex: index
  });
}

function choiceResponse(card) {
  if (!text(card.question) || !Array.isArray(card.options) ||
      !Array.isArray(card.answerIds)) {
    fail("ambiguous_choice_response", "Exercício de escolha antigo está incompleto.");
  }
  return {
    id: `${card.id}-response`,
    package: "aralearn.response.choice",
    version: "1.0.0",
    data: {
      question: card.question,
      selectionMode: card.selectionMode,
      selectionCriterion: card.selectionCriterion,
      options: card.options.map(mapChoiceOption),
      answerIds: clone(card.answerIds)
    }
  };
}

function mapGraphData(card) {
  const edges = Array.isArray(card.edges) ? card.edges : [];
  const directions = new Set(edges.map((edge) => edge?.directed !== false));
  if (directions.size > 1) {
    fail(
      "ambiguous_graph_direction",
      "Grafo antigo mistura arestas dirigidas e não dirigidas."
    );
  }
  const layout = CURRENT_GRAPH_LAYOUT[card.layout || "auto"];
  if (!layout) {
    fail("ambiguous_graph_layout", "Layout antigo de grafo não possui mapeamento.");
  }
  return {
    prompt: card.prompt,
    name: "G",
    directed: directions.size ? [...directions][0] : false,
    layout,
    vertices: clone(card.vertices),
    edges: edges.map((edge, index) => {
      if (!isObject(edge)) {
        fail("ambiguous_graph_edge", "Aresta antiga não é um objeto.", {
          edgeIndex: index
        });
      }
      assertExactFields(
        edge,
        new Set(["id", "from", "to", "label", "directed"]),
        "ambiguous_graph_edge",
        "Aresta antiga"
      );
      return {
        id: text(edge.id) || `edge-${index + 1}`,
        from: edge.from,
        to: edge.to,
        ...(text(edge.label) ? { label: edge.label } : {})
      };
    })
  };
}

function mapRelationData(card) {
  return {
    prompt: card.prompt,
    name: "R",
    leftSet: clone(card.leftSet),
    rightSet: clone(card.rightSet),
    relations: (card.relations || []).map((relation, index) => {
      if (!isObject(relation)) {
        fail("ambiguous_relation", "Relação antiga não é um objeto.", {
          relationIndex: index
        });
      }
      assertExactFields(
        relation,
        new Set(["from", "to"]),
        "ambiguous_relation",
        "Relação antiga"
      );
      return {
        id: `relation-${index + 1}`,
        from: relation.from,
        to: relation.to
      };
    })
  };
}

function assertLegacyFieldContract(card) {
  const contentFields = card.resource === "choice"
    ? ["text"]
    : LEGACY_CONTENT_FIELDS[card.resource];
  if (!contentFields) return;
  const responseFields = card.exercise === "choice" ? LEGACY_CHOICE_FIELDS : [];
  assertExactFields(
    card,
    new Set([...LEGACY_CARD_BASE_FIELDS, ...contentFields, ...responseFields]),
    "unclassified_legacy_card_field",
    "Unidade antiga"
  );
}

function legacyContentData(card) {
  if (card.resource === "graph") return mapGraphData(card);
  if (card.resource === "relation_map") return mapRelationData(card);
  const fields = LEGACY_CONTENT_FIELDS[card.resource];
  if (!fields) {
    fail(
      "unsupported_legacy_resource",
      "Resource antigo não possui package de destino comprovado.",
      { resource: text(card.resource) || "unknown" }
    );
  }
  return Object.fromEntries(
    fields
      .filter((field) => card[field] !== undefined)
      .map((field) => [field, clone(card[field])])
  );
}

function legacyContent(card) {
  if (card.resource === "choice") {
    if (typeof card.text !== "string" || card.text === card.question) return [];
    return [{
      id: `${card.id}-context`,
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: card.text }
    }];
  }
  const data = legacyContentData(card);
  return [{
    id: `${card.id}-content`,
    package: `aralearn.resource.${card.resource}`,
    version: "1.0.0",
    data
  }];
}

function containsInlineGap(value) {
  if (typeof value === "string") return /\[\[[\s\S]*?::[\s\S]*?\]\]/u.test(value);
  if (Array.isArray(value)) return value.some(containsInlineGap);
  if (isObject(value)) return Object.values(value).some(containsInlineGap);
  return false;
}

function containsMalformedInlineMarker(value) {
  if (typeof value === "string") {
    const remainder = value.replace(
      /\[\[([^\x5B\x5D]*?)::([^\x5B\x5D]*?)\]\]/gu,
      ""
    );
    return remainder.includes("[[") || remainder.includes("]]");
  }
  if (Array.isArray(value)) return value.some(containsMalformedInlineMarker);
  if (isObject(value)) return Object.values(value).some(containsMalformedInlineMarker);
  return false;
}

function inlineGapLocations(value, path = "") {
  if (typeof value === "string") {
    const matches = [...value.matchAll(
      /\[\[([^\x5B\x5D]*?)::([^\x5B\x5D]*?)\]\]/gu
    )];
    return matches.map((match) => ({
      path,
      source: value,
      token: match[0],
      answer: match[1],
      optionSource: match[2]
    }));
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      inlineGapLocations(item, `${path}[${index}]`));
  }
  if (isObject(value)) {
    return Object.entries(value).flatMap(([field, item]) =>
      inlineGapLocations(item, path ? `${path}.${field}` : field));
  }
  return [];
}

function pathSegments(path) {
  return [...path.matchAll(/(?:^|\.)([^.[\]]+)|\[(\d+)\]/gu)].map((match) =>
    match[1] ?? Number(match[2]));
}

function replaceAtPath(root, path, before, after) {
  const segments = pathSegments(path);
  let target = root;
  for (const segment of segments.slice(0, -1)) target = target?.[segment];
  const field = segments.at(-1);
  if (target == null || typeof target[field] !== "string" ||
      target[field].split(before).length !== 2) {
    fail("ambiguous_inline_gap", "Alvo da lacuna antiga não é único.");
  }
  target[field] = target[field].replace(before, after);
}

function convertInlineGap(card, content) {
  const locations = content.flatMap((instance) =>
    inlineGapLocations(instance.data).map((location) => ({
      ...location,
      instance
    }))
  );
  if (locations.length !== 1) {
    fail(
      "ambiguous_inline_gap",
      "Exercício antigo de lacuna precisa conter exatamente um alvo.",
      { gapCount: locations.length }
    );
  }
  const [location] = locations;
  if (!location.answer || location.answer !== location.answer.trim() ||
      !location.optionSource || location.optionSource !== location.optionSource.trim() ||
      ["\\", "[", "]"].some((marker) =>
        (location.answer + location.optionSource).includes(marker))) {
    fail("ambiguous_inline_gap", "Metassintaxe antiga de lacuna é ambígua.");
  }
  const options = location.optionSource.split("|");
  if (options.some((option) => !option || option !== option.trim()) ||
      new Set(options).size !== options.length ||
      !options.includes(location.answer) || options.length < 2) {
    fail("ambiguous_inline_gap", "Opções da lacuna antiga não são inequívocas.");
  }
  replaceAtPath(
    location.instance.data,
    location.path,
    location.token,
    location.answer
  );
  return {
    id: `${card.id}-response`,
    package: "aralearn.response.gap",
    version: "1.0.0",
    data: {
      prompt: card.title,
      blanks: [{
        id: "blank-1",
        targetInstanceId: location.instance.id,
        targetPath: location.path,
        responseMode: "choice",
        answer: location.answer,
        distractors: options.filter((option) => option !== location.answer)
      }]
    }
  };
}

function convertLegacyCard(card) {
  if (!isObject(card)) fail("invalid_legacy_card", "Unidade antiga não é um objeto.");
  assertExactFields(
    card,
    LEGACY_CARD_FIELDS,
    "unclassified_legacy_card_field",
    "Unidade antiga"
  );
  assertLegacyFieldContract(card);
  if (!text(card.id) || !Number.isInteger(card.position) || card.position < 1 ||
      !text(card.title)) {
    fail("invalid_legacy_card", "Unidade antiga não possui cabeçalho íntegro.");
  }
  const hasInlineGap = containsInlineGap(card);
  if (containsMalformedInlineMarker(card)) {
    fail("ambiguous_inline_gap", "Metassintaxe antiga de lacuna é malformada.");
  }
  if (hasInlineGap && card.exercise !== "gap") {
    fail(
      "ambiguous_inline_gap",
      "Metassintaxe de lacuna antiga exige resolução semântica explícita."
    );
  }
  const role = card.kind === "theory"
    ? "theory"
    : card.kind === "exercise"
      ? "practice"
      : null;
  if (!role) fail("invalid_legacy_card_role", "Papel antigo da unidade é inválido.");
  if ((role === "theory" && card.exercise !== "none") ||
      (role === "practice" && !new Set(["choice", "gap"]).has(card.exercise))) {
    fail(
      "unsupported_legacy_exercise",
      "Exercício antigo não possui conversão semântica inequívoca.",
      { exercise: text(card.exercise) || "unknown" }
    );
  }
  const sources = card.sources === undefined ? [] : clone(card.sources);
  const topics = card.topics === undefined ? [] : clone(card.topics);
  const content = legacyContent(card);
  if (card.exercise === "gap" && !hasInlineGap) {
    fail("ambiguous_inline_gap", "Exercício antigo de lacuna não possui alvo.");
  }
  const response = role === "theory"
    ? null
    : card.exercise === "gap"
      ? convertInlineGap(card, content)
      : choiceResponse(card);
  const converted = {
    id: card.id,
    position: card.position,
    title: card.title,
    role,
    content,
    response,
    feedback: text(card.after) ? [{
      id: `${card.id}-feedback-text`,
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: card.after }
    }] : [],
    topics,
    sources
  };
  if (canonicalRevisionString(converted.sources) !== canonicalRevisionString(sources) ||
      canonicalRevisionString(converted.topics) !== canonicalRevisionString(topics)) {
    fail("reference_drift", "Fontes ou tópicos mudaram durante a conversão.");
  }
  return converted;
}

function planeResolution(data, resolutions) {
  const fingerprint = canonicalSha256(data);
  const resolution = resolutions?.planeAxes?.[fingerprint];
  if (!isObject(resolution?.xAxis) || !isObject(resolution?.yAxis)) {
    fail(
      "plane_axes_resolution_required",
      "Plano antigo exige eixos e domínio definidos semanticamente.",
      { unresolvedPlaneCount: 1 }
    );
  }
  return {
    ...clone(data),
    xAxis: clone(resolution.xAxis),
    yAxis: clone(resolution.yAxis)
  };
}

function repairPackageInstance(instance, resolutions) {
  if (!isObject(instance) || !isObject(instance.data)) return clone(instance);
  const next = clone(instance);
  if (next.package === "aralearn.resource.graph" && !text(next.data.name)) {
    next.data.name = "G";
  }
  if (next.package === "aralearn.resource.relation_map" && !text(next.data.name)) {
    next.data.name = "R";
  }
  if (next.package === "aralearn.resource.plane" &&
      (!isObject(next.data.xAxis) || !isObject(next.data.yAxis))) {
    next.data = planeResolution(next.data, resolutions);
  }
  return next;
}

function convertCard(card, resolutions) {
  if (Object.hasOwn(card || {}, "resource") || Object.hasOwn(card || {}, "exercise") ||
      Object.hasOwn(card || {}, "kind")) {
    return convertLegacyCard(card);
  }
  const next = clone(card);
  next.content = (next.content || []).map((instance) =>
    repairPackageInstance(instance, resolutions));
  next.response = next.response
    ? repairPackageInstance(next.response, resolutions)
    : null;
  next.feedback = (next.feedback || []).map((instance) =>
    repairPackageInstance(instance, resolutions));
  return next;
}

function convertCourseTree(courseValue, targetCourseId, resolutions) {
  if (!isObject(courseValue)) fail("invalid_course_source", "Curso de origem ausente.");
  const course = clone(courseValue);
  course.id = targetCourseId;
  for (const moduleValue of course.modules || []) {
    for (const lesson of moduleValue.lessons || []) {
      for (const microsequence of lesson.microsequences || []) {
        delete microsequence.status;
        if (!Array.isArray(microsequence.errors)) microsequence.errors = [];
        if (!Array.isArray(microsequence.cards) || Object.hasOwn(microsequence, "studyUnits")) {
          fail(
            "invalid_course_source",
            "Microssequência antiga precisa declarar somente a coleção cards."
          );
        }
        microsequence.studyUnits = microsequence.cards.map((card) =>
          convertCard(card, resolutions));
        delete microsequence.cards;
      }
    }
  }
  return course;
}

function sourceCourse(value) {
  if (isObject(value) && Array.isArray(value.courses)) {
    if (value.courses.length !== 1) {
      fail("ambiguous_course_artifact", "Artefato precisa conter exatamente um Curso.");
    }
    return value.courses[0];
  }
  if (isObject(value) && Array.isArray(value.modules)) return value;
  fail("invalid_course_artifact", "Artefato não contém um Curso reconhecível.");
}

function countCourse(document) {
  const counts = {
    modules: 0,
    lessons: 0,
    topics: 0,
    microsequences: 0,
    studyUnits: 0,
    packageInstances: 0,
    sourceReferences: 0,
    topicReferences: 0
  };
  for (const course of document.courses || []) {
    for (const moduleValue of course.modules || []) {
      counts.modules += 1;
      for (const lesson of moduleValue.lessons || []) {
        counts.lessons += 1;
        counts.topics += (lesson.topics || []).length;
        for (const microsequence of lesson.microsequences || []) {
          counts.microsequences += 1;
          for (const studyUnit of microsequence.studyUnits || []) {
            counts.studyUnits += 1;
            counts.packageInstances += (studyUnit.content || []).length +
              (studyUnit.response ? 1 : 0) + (studyUnit.feedback || []).length;
            counts.sourceReferences += (studyUnit.sources || []).length;
            counts.topicReferences += (studyUnit.topics || []).length;
          }
        }
      }
    }
  }
  return counts;
}

function countStructuralSource(course) {
  const counts = {
    modules: 0,
    lessons: 0,
    topics: 0,
    microsequences: 0,
    studyUnits: 0,
    sourceReferences: 0,
    topicReferences: 0
  };
  for (const moduleValue of course.modules || []) {
    counts.modules += 1;
    for (const lesson of moduleValue.lessons || []) {
      counts.lessons += 1;
      counts.topics += (lesson.topics || []).length;
      for (const microsequence of lesson.microsequences || []) {
        counts.microsequences += 1;
        for (const legacyStudyUnit of microsequence.cards || []) {
          counts.studyUnits += 1;
          counts.sourceReferences += (legacyStudyUnit.sources || []).length;
          counts.topicReferences += (legacyStudyUnit.topics || []).length;
        }
      }
    }
  }
  return counts;
}

function preservationSignature(course, { legacy = false } = {}) {
  const structure = [];
  const references = [];
  const visit = (type, entity, parentType, parentId, position) => {
    const currentType = type === "card" ? "study_unit" : type;
    const currentParentType = parentType === "card" ? "study_unit" : parentType;
    structure.push({
      type: currentType,
      id: entity.id,
      parentType: currentParentType,
      parentId,
      position
    });
    if (currentType === "study_unit") {
      references.push({
        id: entity.id,
        sources: clone(entity.sources ?? []),
        topics: clone(entity.topics ?? [])
      });
    }
    const children = legacy ? LEGACY_ENTITY_CHILDREN : CURRENT_ENTITY_CHILDREN;
    for (const child of children[type] || []) {
      (entity[child.field] || []).forEach((value, index) => visit(
        child.type,
        value,
        type,
        entity.id,
        new Set(["card", "study_unit"]).has(child.type) ? value.position : index
      ));
    }
  };
  visit("course", course, null, null, 0);
  structure[0].id = "$course";
  for (const item of structure) {
    if (item.parentType === "course") item.parentId = "$course";
  }
  return { structure, references };
}

function assertPreservedCounts(beforeCourse, document) {
  const before = countStructuralSource(beforeCourse);
  const after = countCourse(document);
  const comparableAfter = { ...after };
  delete comparableAfter.packageInstances;
  if (canonicalRevisionString(before) !== canonicalRevisionString(comparableAfter)) {
    fail("course_cardinality_drift", "A conversão alterou cardinalidade ou referências.", {
      before,
      after: comparableAfter
    });
  }
  const beforeSignature = preservationSignature(beforeCourse, { legacy: true });
  const afterSignature = preservationSignature(document.courses[0]);
  if (canonicalRevisionString(beforeSignature.structure) !==
      canonicalRevisionString(afterSignature.structure)) {
    fail(
      "course_identity_order_drift",
      "A conversão alterou identidades, relações ou ordem didática."
    );
  }
  if (canonicalRevisionString(beforeSignature.references) !==
      canonicalRevisionString(afterSignature.references)) {
    fail("reference_drift", "A conversão alterou fontes ou tópicos.");
  }
  return after;
}

export function convertCourseDocument(value, {
  targetCourseId,
  resolutions = {}
} = {}) {
  if (!text(targetCourseId)) {
    fail("missing_target_course_id", "Identidade de destino do Curso ausente.");
  }
  const beforeCourse = clone(sourceCourse(value));
  const convertedCourse = convertCourseTree(beforeCourse, targetCourseId, resolutions);
  const candidate = {
    contract: "aralearn.course.v1",
    courses: [convertedCourse]
  };
  const validation = validateProjectDocument(candidate);
  if (!validation.ok) {
    fail("invalid_converted_course", "Curso convertido viola o contrato atual.", {
      errorCount: validation.errors?.length || 0,
      errorPaths: (validation.errors || []).map((error) => error.path || "$invalid")
    });
  }
  const document = validation.value || candidate;
  const header = document.courses[0];
  if (!text(header.title) || !text(header.goal)) {
    fail("invalid_course_header", "Curso convertido exige título e objetivo não vazios.");
  }
  const counts = assertPreservedCounts(beforeCourse, document);
  const flattened = flattenCourseDocument(document);
  const recomposed = composeCourseDocument(flattened.course, flattened.rows);
  if (canonicalRevisionString(recomposed) !== canonicalRevisionString(document)) {
    fail("course_roundtrip_drift", "Flatten/compose alterou o Curso convertido.");
  }
  return {
    document,
    course: flattened.course,
    rows: flattened.rows,
    documentHash: canonicalSha256(document),
    rowHash: canonicalSha256(flattened.rows),
    counts
  };
}

function entityIdentity(type, id) {
  return `${type}\u0000${id}`;
}

export function assembleWorkspaceCourse(entry) {
  const rows = Array.isArray(entry.workspaceEntities) ? entry.workspaceEntities : [];
  const root = rows.filter((row) =>
    row.entityType === "course" && row.entityId === entry.workspaceCourseId);
  if (root.length !== 1) {
    fail("workspace_course_root_mismatch", "Raiz viva do Curso não é única.", {
      rootCount: root.length
    });
  }
  const entities = new Map();
  for (const row of rows) {
    if (!isObject(row.content) || !text(row.entityType) || !text(row.entityId)) {
      fail("invalid_workspace_entity", "Entidade viva possui forma inválida.");
    }
    const key = entityIdentity(row.entityType, row.entityId);
    if (entities.has(key)) {
      fail("duplicate_workspace_entity", "Entidade viva está duplicada.");
    }
    const entity = { ...clone(row.content), id: row.entityId };
    for (const child of LEGACY_ENTITY_CHILDREN[row.entityType] || []) entity[child.field] = [];
    if (row.entityType === "card") entity.position = row.position;
    entities.set(key, { row, entity });
  }
  const relevant = new Set([entityIdentity("course", entry.workspaceCourseId)]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const { row } of entities.values()) {
      if (relevant.has(entityIdentity(row.entityType, row.entityId))) continue;
      if (row.parentType && relevant.has(entityIdentity(row.parentType, row.parentId))) {
        relevant.add(entityIdentity(row.entityType, row.entityId));
        changed = true;
      }
    }
  }
  for (const [key, { row, entity }] of entities) {
    if (!relevant.has(key) || row.entityType === "course") continue;
    const parent = entities.get(entityIdentity(row.parentType, row.parentId));
    if (!parent || !relevant.has(entityIdentity(row.parentType, row.parentId))) {
      fail("workspace_entity_orphan", "Entidade viva não possui pai no Curso.");
    }
    const child = (LEGACY_ENTITY_CHILDREN[row.parentType] || []).find((item) =>
      item.type === row.entityType);
    if (!child) fail("workspace_entity_parent_mismatch", "Relação viva é incompatível.");
    parent.entity[child.field].push({ entity, position: row.position });
  }
  for (const { row, entity } of entities.values()) {
    for (const { field } of LEGACY_ENTITY_CHILDREN[row.entityType] || []) {
      entity[field] = entity[field]
        .sort((left, right) => left.position - right.position)
        .map((item) => item.entity);
    }
  }
  const course = entities.get(entityIdentity("course", entry.workspaceCourseId)).entity;
  return {
    contract: "aralearn.library.v1",
    courses: [course]
  };
}

function validateTopology(snapshot) {
  if (!isObject(snapshot) || snapshot.contract !== "aralearn.course-cutover-source.v1" ||
      !Array.isArray(snapshot.topology)) {
    fail("invalid_cutover_snapshot", "Snapshot de origem possui contrato inválido.");
  }
  const totals = { root_only: 0, root_and_publication: 0, publication_only: 0 };
  const ids = new Set();
  let artifactCount = 0;
  for (const entry of snapshot.topology) {
    if (!text(entry.courseId) || !SOURCE_KINDS.has(entry.sourceKind) ||
        ids.has(entry.courseId)) {
      fail("invalid_cutover_topology", "Topologia contém identidade ou origem inválida.");
    }
    ids.add(entry.courseId);
    totals[entry.sourceKind] += 1;
    const needsWorkspace = entry.sourceKind !== "publication_only";
    const needsArtifact = entry.sourceKind !== "root_only";
    const header = entry.targetHeader;
    if (Boolean(text(entry.workspaceId)) !== needsWorkspace ||
        Boolean(text(entry.workspaceCourseId)) !== needsWorkspace ||
        (Number.isInteger(entry.workspaceRevision) && entry.workspaceRevision >= 0) !==
          needsWorkspace ||
        !Array.isArray(entry.workspaceEntities) ||
        (entry.workspaceEntities.length > 0) !== needsWorkspace ||
        Boolean(text(entry.legacyCourseId)) !== needsArtifact ||
        Boolean(text(entry.legacyRevisionHash)) !== needsArtifact ||
        Boolean(isObject(entry.artifact)) !== needsArtifact) {
      fail(
        "invalid_cutover_topology",
        "Topologia não corresponde aos metadados de sua origem."
      );
    }
    if (needsWorkspace) {
      if (entry.entityDefaults !== null || entry.workspaceEntities.some((row) => {
        try {
          normalizedEntityMetadata(
            row,
            `Entidade ${row?.entityType || "desconhecida"}/${row?.entityId || "sem-id"}`
          );
          return false;
        } catch {
          return true;
        }
      })) {
        fail(
          "invalid_cutover_topology",
          "Topologia relacional não preserva metadados por entidade."
        );
      }
    } else {
      if (!isObject(entry.entityDefaults) ||
          entry.entityDefaults.basis !== "course_record") {
        fail(
          "invalid_cutover_topology",
          "Topologia sem raiz não declara defaults técnicos auditáveis."
        );
      }
      const defaults = normalizedEntityMetadata(
        entry.entityDefaults,
        "Defaults do Curso sem origem relacional"
      );
      if (defaults.version !== 1) {
        fail(
          "invalid_cutover_topology",
          "Topologia sem raiz deve iniciar entidades na versão 1."
        );
      }
    }
    if (!isObject(header) || !text(header.title) || !text(header.goal) ||
        header.title !== text(header.title) || header.goal !== text(header.goal) ||
        header.title.length > 300 || header.goal.length > 2000) {
      fail("invalid_target_header", "Cabeçalho relacional não é canônico.");
    }
    if (needsArtifact) artifactCount += 1;
  }
  if (snapshot.topology.length !== 8 || totals.root_only !== 4 ||
      totals.root_and_publication !== 2 || totals.publication_only !== 2 ||
      artifactCount !== 4) {
    fail("unexpected_cutover_topology", "Topologia não corresponde ao corte conhecido.", {
      courseCount: snapshot.topology.length,
      totals
    });
  }
}

function assertHeader(entry, converted) {
  const target = entry.targetHeader;
  if (!isObject(target) || !text(target.title) || !text(target.goal)) {
    fail("invalid_target_header", "Cabeçalho que a migration persistiria está incompleto.");
  }
  if (target.title !== text(target.title) || target.goal !== text(target.goal) ||
      target.title.length > 300 || target.goal.length > 2000) {
    fail(
      "invalid_target_header",
      "Cabeçalho que a migration persistiria não é canônico."
    );
  }
  if (target.title !== converted.course.title || target.goal !== converted.course.goal) {
    fail(
      "course_header_drift",
      "Cabeçalho relacional diverge do conteúdo convertido."
    );
  }
}

async function loadArtifact(entry, artifactLoader) {
  if (!isObject(entry.artifact) || !/^[0-9a-f]{64}$/u.test(entry.artifact.hash || "") ||
      typeof artifactLoader !== "function") {
    fail("missing_course_artifact", "Referência ou leitor do artefato está ausente.");
  }
  if (entry.artifact.hash !== entry.legacyRevisionHash) {
    fail("artifact_revision_hash_drift", "Hash do artefato diverge da revisão corrente.");
  }
  const loaded = await artifactLoader(clone(entry.artifact), {
    legacyCourseId: entry.legacyCourseId,
    legacyRevisionHash: entry.legacyRevisionHash
  });
  const bytes = Buffer.isBuffer(loaded) ? loaded : Buffer.from(loaded);
  if (Number(entry.artifact.sizeBytes) !== bytes.byteLength ||
      sha256Bytes(bytes) !== entry.artifact.hash) {
    fail("artifact_bytes_drift", "Bytes, tamanho ou hash do artefato divergiram.");
  }
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("invalid_artifact_json", "Artefato não contém JSON UTF-8 válido.");
  }
  if (canonicalSha256(value) !== entry.artifact.hash) {
    fail(
      "artifact_canonical_hash_drift",
      "JSON canônico do artefato diverge de sua revisão."
    );
  }
  return {
    value,
    byteHash: entry.artifact.hash,
    canonicalHash: entry.artifact.hash
  };
}

function buildManifest(entry, converted, entityMetadata, inputs) {
  const value = {
    contract: "aralearn.course-cutover-manifest.v1",
    courseId: entry.courseId,
    sourceKind: entry.sourceKind,
    workspaceRevision: entry.workspaceRevision ?? null,
    legacyRevisionHash: entry.legacyRevisionHash ?? null,
    inputs,
    documentHash: converted.documentHash,
    rowHash: converted.rowHash,
    entityStateHash: canonicalSha256(entityMetadata),
    counts: converted.counts
  };
  return { ...value, manifestHash: canonicalSha256(value) };
}

function stagingRows(prepared) {
  return prepared.flatMap(({ entry, converted, entityMetadata, manifest }) => {
    const metadataByIdentity = new Map(entityMetadata.map((metadata) => [
      entityIdentity(metadata.entityType, metadata.entityId),
      metadata
    ]));
    return converted.rows.map((row) => {
      const metadata = metadataByIdentity.get(entityIdentity(row.entityType, row.entityId));
      if (!metadata) {
        fail("missing_entity_metadata", "Staging perdeu metadados de uma entidade.");
      }
      return {
      course_id: entry.courseId,
      source_kind: entry.sourceKind,
      workspace_id: entry.workspaceId ?? null,
      workspace_revision: entry.workspaceRevision ?? null,
      legacy_course_id: entry.legacyCourseId ?? null,
      legacy_revision_hash: entry.legacyRevisionHash ?? null,
      manifest_hash: manifest.manifestHash,
      course_title: converted.course.title,
      course_goal: converted.course.goal,
      entity_type: row.entityType === "study_unit" ? "card" : row.entityType,
      entity_id: row.entityId,
      parent_type: row.parentType === "study_unit" ? "card" : row.parentType,
      parent_id: row.parentId,
      position: row.position,
      entity_version: metadata.version,
      entity_created_at: metadata.createdAt,
      entity_updated_at: metadata.updatedAt,
      content: row.content
      };
    });
  });
}

function preparationSeal(preparation) {
  return canonicalSha256({
    snapshotHash: preparation.snapshotHash,
    sourceSnapshot: preparation.sourceSnapshot,
    prepared: preparation.prepared,
    rows: preparation.rows
  });
}

export function attestPreparedCourseCutover(preparation) {
  if (!isObject(preparation) || !PREPARATION_SEALS.has(preparation)) {
    fail(
      "cutover_attestation_failed",
      "O staging não veio da preparação verificada desta sessão."
    );
  }
  if (PREPARATION_SEALS.get(preparation) !== preparationSeal(preparation) ||
      preparation.snapshotHash !== canonicalSha256(preparation.sourceSnapshot)) {
    fail(
      "cutover_attestation_failed",
      "A preparação mudou depois de ser verificada."
    );
  }
  validateTopology(preparation.sourceSnapshot);
  if (!Array.isArray(preparation.prepared) || preparation.prepared.length !== 8) {
    fail("cutover_attestation_failed", "A preparação não contém os oito Cursos.");
  }
  const sourceEntries = new Map(preparation.sourceSnapshot.topology.map((entry) => [
    entry.courseId,
    entry
  ]));
  for (const item of preparation.prepared) {
    const { entry, converted, entityMetadata, manifest } = item;
    const sourceEntry = sourceEntries.get(entry?.courseId);
    if (!sourceEntry || canonicalRevisionString(sourceEntry) !==
        canonicalRevisionString(entry)) {
      fail("cutover_attestation_failed", "Metadados da origem mudaram após a leitura.");
    }
    assertHeader(entry, converted);
    const validation = validateProjectDocument(converted.document);
    if (!validation.ok || canonicalRevisionString(validation.value || converted.document) !==
        canonicalRevisionString(converted.document)) {
      fail("cutover_attestation_failed", "Documento convertido deixou de ser válido.");
    }
    const flattened = flattenCourseDocument(converted.document);
    const recomposed = composeCourseDocument(flattened.course, flattened.rows);
    if (canonicalRevisionString(recomposed) !==
          canonicalRevisionString(converted.document) ||
        canonicalRevisionString(flattened.course) !==
          canonicalRevisionString(converted.course) ||
        canonicalRevisionString(flattened.rows) !==
          canonicalRevisionString(converted.rows) ||
        canonicalSha256(converted.document) !== converted.documentHash ||
        canonicalSha256(converted.rows) !== converted.rowHash ||
        canonicalRevisionString(countCourse(converted.document)) !==
          canonicalRevisionString(converted.counts)) {
      fail(
        "cutover_attestation_failed",
        "Roundtrip, hash ou cardinalidade do Curso mudou após a conversão."
      );
    }
    const expectedEntityMetadata = entityMetadataForRows(entry, converted.rows);
    if (canonicalRevisionString(expectedEntityMetadata) !==
        canonicalRevisionString(entityMetadata)) {
      fail(
        "cutover_attestation_failed",
        "Estado técnico das entidades mudou depois da preparação."
      );
    }
    const expectedInputs = {};
    if (entry.sourceKind !== "publication_only") {
      expectedInputs.workspaceHash = canonicalSha256(assembleWorkspaceCourse(entry));
    }
    if (entry.sourceKind !== "root_only") {
      if (!isObject(entry.artifact) || entry.artifact.hash !== entry.legacyRevisionHash) {
        fail("cutover_attestation_failed", "Referência de artefato mudou após a leitura.");
      }
      expectedInputs.artifactByteHash = entry.artifact.hash;
      expectedInputs.artifactCanonicalHash = entry.artifact.hash;
    }
    const expectedManifest = buildManifest(
      entry,
      converted,
      expectedEntityMetadata,
      expectedInputs
    );
    if (canonicalRevisionString(expectedManifest) !== canonicalRevisionString(manifest)) {
      fail("cutover_attestation_failed", "Manifesto não corresponde ao conteúdo preparado.");
    }
  }
  if (canonicalRevisionString(stagingRows(preparation.prepared)) !==
      canonicalRevisionString(preparation.rows)) {
    fail("cutover_attestation_failed", "Linhas da staging não correspondem aos manifestos.");
  }
  return true;
}

export function verifyAppliedCourseCutover(preparation, verification) {
  attestPreparedCourseCutover(preparation);
  if (!isObject(verification) ||
      verification.contract !== "aralearn.course-cutover-verification.v1" ||
      !Array.isArray(verification.courses)) {
    fail(
      "invalid_cutover_verification",
      "Contrato da verificação pós-corte é inválido."
    );
  }
  const courses = new Map();
  for (const course of verification.courses) {
    if (!text(course?.courseId) || courses.has(course.courseId) ||
        !Array.isArray(course.entities)) {
      fail(
        "invalid_cutover_verification",
        "Verificação pós-corte contém Curso duplicado ou inválido."
      );
    }
    courses.set(course.courseId, course);
  }
  if (courses.size !== preparation.prepared.length) {
    fail(
      "cutover_verification_drift",
      "Quantidade de Cursos divergiu depois da aplicação."
    );
  }

  const evidence = [];
  for (const expected of preparation.prepared) {
    const source = courses.get(expected.entry.courseId);
    if (!source) {
      fail("cutover_verification_drift", "Curso aplicado não foi reencontrado.");
    }
    const rows = source.entities.map((entity) => ({
      entityType: entity.entityType,
      entityId: entity.entityId,
      parentType: entity.parentType,
      parentId: entity.parentId,
      position: entity.position,
      content: entity.content,
      version: entity.version
    }));
    const document = composeCourseDocument({
      id: source.courseId,
      title: source.title,
      goal: source.goal
    }, rows);
    const flattened = flattenCourseDocument(document);
    const metadataByIdentity = new Map(source.entities.map((entity) => [
      entityIdentity(entity.entityType, entity.entityId),
      normalizedEntityMetadata(entity, "Entidade aplicada")
    ]));
    const entityMetadata = flattened.rows.map((row) => {
      const metadata = metadataByIdentity.get(entityIdentity(
        row.entityType,
        row.entityId
      ));
      if (!metadata) {
        fail(
          "cutover_verification_drift",
          "Entidade aplicada não possui metadados verificáveis."
        );
      }
      return { entityType: row.entityType, entityId: row.entityId, ...metadata };
    });
    const actual = {
      courseId: source.courseId,
      manifestHash: expected.manifest.manifestHash,
      documentHash: canonicalSha256(document),
      rowHash: canonicalSha256(flattened.rows),
      entityStateHash: canonicalSha256(entityMetadata),
      counts: countCourse(document)
    };
    if (actual.documentHash !== expected.manifest.documentHash ||
        actual.rowHash !== expected.manifest.rowHash ||
        actual.entityStateHash !== expected.manifest.entityStateHash ||
        canonicalRevisionString(actual.counts) !==
          canonicalRevisionString(expected.manifest.counts)) {
      fail(
        "cutover_verification_drift",
        "Curso aplicado divergiu dos hashes atestados."
      );
    }
    evidence.push(actual);
  }
  return evidence.sort((left, right) => left.courseId.localeCompare(right.courseId));
}

export async function prepareCourseCutover(snapshot, {
  artifactLoader,
  resolutions = {}
} = {}) {
  validateTopology(snapshot);
  const prepared = [];
  for (const entry of snapshot.topology) {
    let live = null;
    let artifact = null;
    const inputs = {};
    if (entry.sourceKind !== "publication_only") {
      const liveSource = assembleWorkspaceCourse(entry);
      inputs.workspaceHash = canonicalSha256(liveSource);
      live = convertCourseDocument(liveSource, {
        targetCourseId: entry.courseId,
        resolutions
      });
    }
    if (entry.sourceKind !== "root_only") {
      const loaded = await loadArtifact(entry, artifactLoader);
      inputs.artifactByteHash = loaded.byteHash;
      inputs.artifactCanonicalHash = loaded.canonicalHash;
      artifact = convertCourseDocument(loaded.value, {
        targetCourseId: entry.courseId,
        resolutions
      });
    }
    if (live && artifact && (live.documentHash !== artifact.documentHash ||
        canonicalRevisionString(live.document) !==
          canonicalRevisionString(artifact.document))) {
      fail(
        "course_overlap_drift",
        "Raiz viva e publicação sobrepostas não são semanticamente idênticas."
      );
    }
    const converted = live || artifact;
    assertHeader(entry, converted);
    const entityMetadata = entityMetadataForRows(entry, converted.rows);
    const manifest = buildManifest(entry, converted, entityMetadata, inputs);
    prepared.push({ entry: clone(entry), converted, entityMetadata, manifest });
  }
  const rows = stagingRows(prepared);
  const preparation = {
    snapshotHash: canonicalSha256(snapshot),
    sourceSnapshot: clone(snapshot),
    prepared,
    rows,
    summary: {
      courseCount: prepared.length,
      artifactCount: prepared.filter(({ entry }) => entry.artifact).length,
      overlapCount: prepared.filter(({ entry }) =>
        entry.sourceKind === "root_and_publication").length,
      entityCount: rows.length,
      counts: prepared.map(({ converted }) => converted.counts)
    }
  };
  PREPARATION_SEALS.set(preparation, preparationSeal(preparation));
  attestPreparedCourseCutover(preparation);
  return preparation;
}

function csvValue(value) {
  if (value === null || value === undefined) return "\\N";
  const serialized = typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${serialized.replaceAll('"', '""')}"`;
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function assertMigrationStagingSchema(migrationSql) {
  const match = migrationSql.match(
    /create temporary table course_content_import_v1\(\s*([\s\S]*?)\s*\)\s*\$ddl\$/u
  );
  const actual = match?.[1].split(/,\s*\r?\n/u).map((line) =>
    line.trim().replace(/\s+/gu, " "));
  const expected = COURSE_CUTOVER_STAGING_SCHEMA.map(({ name, sql }) =>
    `${name} ${sql}`);
  if (!actual || canonicalRevisionString(actual) !== canonicalRevisionString(expected)) {
    fail(
      "migration_staging_schema_drift",
      "Schema TEMP do importador diverge da migration."
    );
  }
}

function transactionBody(migrationSql, label) {
  if (typeof migrationSql !== "string") {
    fail("invalid_cutover_execution", `${label} está ausente.`);
  }
  const beginMatches = [...migrationSql.matchAll(/^begin;\s*$/gimu)];
  const commitMatches = [...migrationSql.matchAll(/^commit;\s*$/gimu)];
  if (beginMatches.length !== 1 || commitMatches.length !== 1 ||
      beginMatches[0].index > commitMatches[0].index) {
    fail(
      "migration_transaction_drift",
      `Limites transacionais de ${label} mudaram.`
    );
  }
  const beginStart = beginMatches[0].index;
  const beginEnd = beginStart + beginMatches[0][0].length;
  const commitStart = commitMatches[0].index;
  const commitEnd = commitStart + commitMatches[0][0].length;
  return {
    beginStart,
    beginEnd,
    commitStart,
    commitEnd,
    body: (
      migrationSql.slice(0, beginStart) +
      migrationSql.slice(beginEnd, commitStart) +
      migrationSql.slice(commitEnd)
    ).trim()
  };
}

function withoutTransactionGuards(body) {
  const guards = new Set(COURSE_CUTOVER_TRANSACTION_GUARDS);
  return body.split(/\r?\n/u)
    .filter((line) => !guards.has(line.trim()))
    .join("\n")
    .trim();
}

export function buildCourseCutoverSql(
  preparation,
  migrationSql,
  profileAccessMigrationSql,
  authoringPlanMigrationSql,
  studyUnitInspectionMigrationSql,
  courseDesignMigrationSql
) {
  if (!isObject(preparation) || !Array.isArray(preparation.rows) ||
      !preparation.rows.length || typeof migrationSql !== "string" ||
      typeof profileAccessMigrationSql !== "string" ||
      typeof authoringPlanMigrationSql !== "string" ||
      typeof studyUnitInspectionMigrationSql !== "string" ||
      typeof courseDesignMigrationSql !== "string") {
    fail(
      "invalid_cutover_execution",
      "Linhas ou migrations do corte estão ausentes."
    );
  }
  attestPreparedCourseCutover(preparation);
  assertMigrationStagingSchema(migrationSql);
  const rows = preparation.rows;
  const identityTransaction = transactionBody(
    migrationSql,
    "a migration de identidade"
  );
  const profileAccessTransaction = transactionBody(
    profileAccessMigrationSql,
    "a migration de perfil e acesso"
  );
  const authoringPlanTransaction = transactionBody(
    authoringPlanMigrationSql,
    "a migration do plano instrucional"
  );
  const authoringPlanExecutionBody = withoutTransactionGuards(
    authoringPlanTransaction.body
  );
  const studyUnitInspectionTransaction = transactionBody(
    studyUnitInspectionMigrationSql,
    "a migration da inspeção de Unidades de estudo"
  );
  const studyUnitInspectionExecutionBody = withoutTransactionGuards(
    studyUnitInspectionTransaction.body
  );
  const courseDesignTransaction = transactionBody(
    courseDesignMigrationSql,
    "a migration do desenho pedagógico"
  );
  const courseDesignExecutionBody = withoutTransactionGuards(
    courseDesignTransaction.body
  );
  const guardPositions = COURSE_CUTOVER_TRANSACTION_GUARDS.map((guard) =>
    migrationSql.indexOf(guard));
  if (COURSE_CUTOVER_TRANSACTION_GUARDS.some((guard) =>
      migrationSql.split(guard).length !== 2) ||
      guardPositions.some((position) =>
        position < identityTransaction.beginEnd ||
        position > identityTransaction.commitStart) ||
      guardPositions.some((position, index) => index > 0 &&
        position <= guardPositions[index - 1])) {
    fail(
      "migration_transaction_guard_drift",
      "Limites de espera da migration mudaram."
    );
  }
  let identityExecutionBody = identityTransaction.body;
  for (const guard of COURSE_CUTOVER_TRANSACTION_GUARDS) {
    const position = identityExecutionBody.indexOf(guard);
    if (position < 0) {
      fail(
        "migration_transaction_guard_drift",
        "Limites de espera da migration mudaram."
      );
    }
    identityExecutionBody = (
      identityExecutionBody.slice(0, position) +
      identityExecutionBody.slice(position + guard.length)
    );
  }
  identityExecutionBody = identityExecutionBody.trim();
  const columns = COURSE_CUTOVER_STAGING_SCHEMA.map(({ name }) => name);
  const csv = rows.map((row) =>
    columns.map((column) => csvValue(row[column])).join(",")).join("\n");
  return [
    "\\set ON_ERROR_STOP on",
    "begin;",
    ...COURSE_CUTOVER_TRANSACTION_GUARDS,
    "create temporary table course_content_import_v1(",
    ...COURSE_CUTOVER_STAGING_SCHEMA.map(({ name, sql }, index, schema) =>
      `  ${name} ${sql}${index === schema.length - 1 ? "" : ","}`),
    ") on commit drop;",
    `copy course_content_import_v1(${columns.join(",")}) from stdin with (format csv, null '\\N');`,
    csv,
    "\\.",
    identityExecutionBody,
    profileAccessTransaction.body,
    authoringPlanExecutionBody,
    studyUnitInspectionExecutionBody,
    courseDesignExecutionBody,
    "insert into supabase_migrations.schema_migrations(version,statements,name)",
    `values (${sqlText(CUTOVER_MIGRATION_VERSION)},` +
      `array[${sqlText(identityTransaction.body)}]::text[],` +
      `${sqlText(CUTOVER_MIGRATION_NAME)});`,
    "insert into supabase_migrations.schema_migrations(version,statements,name)",
    `values (${sqlText(PROFILE_ACCESS_MIGRATION_VERSION)},` +
      `array[${sqlText(profileAccessTransaction.body)}]::text[],` +
      `${sqlText(PROFILE_ACCESS_MIGRATION_NAME)});`,
    "insert into supabase_migrations.schema_migrations(version,statements,name)",
    `values (${sqlText(AUTHORING_PLAN_MIGRATION_VERSION)},` +
      `array[${sqlText(authoringPlanTransaction.body)}]::text[],` +
      `${sqlText(AUTHORING_PLAN_MIGRATION_NAME)});`,
    "insert into supabase_migrations.schema_migrations(version,statements,name)",
    `values (${sqlText(STUDY_UNIT_INSPECTION_MIGRATION_VERSION)},` +
      `array[${sqlText(studyUnitInspectionTransaction.body)}]::text[],` +
      `${sqlText(STUDY_UNIT_INSPECTION_MIGRATION_NAME)});`,
    "insert into supabase_migrations.schema_migrations(version,statements,name)",
    `values (${sqlText(COURSE_DESIGN_MIGRATION_VERSION)},` +
      `array[${sqlText(courseDesignTransaction.body)}]::text[],` +
      `${sqlText(COURSE_DESIGN_MIGRATION_NAME)});`,
    "commit;",
    ""
  ].join("\n");
}
