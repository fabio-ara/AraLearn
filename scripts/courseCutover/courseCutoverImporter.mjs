import { createHash } from "node:crypto";

import {
  composeCourseDocument,
  flattenCourseDocument
} from "../../src/domain/courseEntities.js";
import { validateProjectDocument } from "../../src/domain/aralearnProject.js";
import { canonicalRevisionString } from "../../src/storage/canonicalRevision.js";

const SOURCE_KINDS = new Set([
  "root_only",
  "root_and_publication"
]);

const TASK_OPERATION_TERMINOLOGY_MIGRATION_VERSION = "20260817130000";
const TASK_OPERATION_TERMINOLOGY_MIGRATION_NAME = "task_operation_terminology";
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
const COURSE_SOURCES_MIGRATION_VERSION = "20260817190000";
const COURSE_SOURCES_MIGRATION_NAME = "course_sources_provenance";
const COURSE_ANNOTATIONS_MIGRATION_VERSION = "20260817200000";
const COURSE_ANNOTATIONS_MIGRATION_NAME = "course_anchored_annotations";
const COURSE_AUDIT_MIGRATION_VERSION = "20260817210000";
const COURSE_AUDIT_MIGRATION_NAME = "course_audit_corrections";

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

export const COURSE_CUTOVER_LEGACY_AUDIT_COUNT_FIELDS = Object.freeze([
  "audit_findings",
  "audit_runs",
  "audit_run_microsequences",
  "audit_run_completions",
  "audit_run_components",
  "audit_requests",
  "audit_events",
  "active_audit_mandates",
  "observation_threads",
  "observation_thread_corrections",
  "instructional_analyses",
  "design_parameter_assignments",
  "resource_sets",
  "resource_set_members",
  "effective_design_snapshots",
  "effective_design_snapshot_values",
  "effective_design_snapshot_resource_sets",
  "pedagogical_blueprints",
  "pedagogical_blueprint_bindings",
  "microsequence_design_bindings",
  "materialization_states",
  "materialization_state_workspaces",
  "materialization_state_unmapped_workspaces",
  "materialization_state_orphans",
  "materialization_manifests",
  "manifest_coverage",
  "manifest_metrics",
  "manifest_resource_selections",
  "manifest_materialized_resources"
]);

const COURSE_CUTOVER_LEGACY_AUDIT_ALLOWED_NONZERO = new Set([
  "observation_threads",
  "materialization_states",
  "materialization_state_workspaces"
]);

const PREPARATION_SEALS = new WeakMap();

const LEGACY_CONTENT_FIELDS = Object.freeze({
  paragraph: Object.freeze(["text"]),
  table: Object.freeze(["columns", "rows"]),
  code: Object.freeze(["prompt", "language", "code"]),
  sequence: Object.freeze(["prompt", "variant", "items"]),
  tree: Object.freeze(["prompt", "variant", "nodes"]),
  system_map: Object.freeze(["prompt", "groups", "nodes", "links"]),
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

function hasControl(value) {
  return [...value].some((character) => {
    const point = character.codePointAt(0);
    return point < 32 || (point >= 127 && point <= 159);
  });
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function postgresJsonbKeyOrder(left, right) {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.byteLength - rightBytes.byteLength || Buffer.compare(leftBytes, rightBytes);
}

function postgresJsonbObjectText(entries) {
  return `{${entries
    .sort(([left], [right]) => postgresJsonbKeyOrder(left, right))
    .map(([key, value]) => `${JSON.stringify(key)}: ${value}`)
    .join(", ")}}`;
}

export function courseCutoverLegacyAuditHash(value) {
  const countText = postgresJsonbObjectText(Object.entries(value?.counts || {})
    .map(([key, count]) => [key, JSON.stringify(count)]));
  const envelopeText = postgresJsonbObjectText([
    ["contract", JSON.stringify(value?.contract)],
    ["counts", countText]
  ]);
  return sha256Bytes(Buffer.from(envelopeText, "utf8"));
}

export function assertCourseCutoverLegacyAudit(value, hash) {
  const countFields = new Set(COURSE_CUTOVER_LEGACY_AUDIT_COUNT_FIELDS);
  const materializationStateIsEmpty =
    value?.counts?.materialization_states === 0 &&
    value?.counts?.materialization_state_workspaces === 0;
  const materializationStateIsKnown =
    value?.counts?.materialization_states === 247 &&
    value?.counts?.materialization_state_workspaces === 2;
  if (!isObject(value) ||
      value.contract !==
        "aralearn.legacy-authoring-audit-cutover-preflight.v1" ||
      !isObject(value.counts) ||
      Object.keys(value).length !== 2 ||
      !Object.hasOwn(value, "contract") || !Object.hasOwn(value, "counts") ||
      Object.keys(value.counts).length !== countFields.size ||
      Object.keys(value.counts).some((field) => !countFields.has(field)) ||
      Object.values(value.counts).some((count) =>
        !Number.isSafeInteger(count) || count < 0) ||
      COURSE_CUTOVER_LEGACY_AUDIT_COUNT_FIELDS.some((field) =>
        !Object.hasOwn(value.counts, field)) ||
      COURSE_CUTOVER_LEGACY_AUDIT_COUNT_FIELDS.some((field) =>
        !COURSE_CUTOVER_LEGACY_AUDIT_ALLOWED_NONZERO.has(field) &&
        value.counts[field] !== 0) ||
      (!materializationStateIsEmpty && !materializationStateIsKnown) ||
      !/^[0-9a-f]{64}$/u.test(hash || "") ||
      courseCutoverLegacyAuditHash(value) !== hash) {
    fail(
      "legacy_authoring_audit_cutover_blocked",
      "O corte encontrou auditoria ou correção legada sem equivalência canônica; exporte a evidência antes de prosseguir."
    );
  }
  return value;
}

function entityVersion(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    fail("invalid_entity_metadata", `${label} possui versão inválida.`);
  }
  return value;
}

function entityTimestamp(value, label) {
  const normalized = typeof value === "string" ? value.trim() : "";
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
    .exec(normalized);
  if (!match || !Number.isFinite(Date.parse(normalized))) {
    fail("invalid_entity_metadata", `${label} possui instante inválido.`);
  }
  return normalized;
}

function entityTimestampMicroseconds(value) {
  const [, seconds, fraction = "", offset] =
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
      .exec(value);
  return BigInt(Date.parse(`${seconds}${offset}`)) * 1000n +
    BigInt(fraction.padEnd(6, "0") || "0");
}

function normalizedEntityMetadata(value, label) {
  if (!isObject(value)) {
    fail("invalid_entity_metadata", `${label} não possui metadados técnicos.`);
  }
  const version = entityVersion(value.entityVersion ?? value.version, label);
  const createdAt = entityTimestamp(value.entityCreatedAt ?? value.createdAt, label);
  const updatedAt = entityTimestamp(value.entityUpdatedAt ?? value.updatedAt, label);
  if (entityTimestampMicroseconds(createdAt) > entityTimestampMicroseconds(updatedAt)) {
    fail("invalid_entity_metadata", `${label} possui ordem temporal inválida.`);
  }
  return { version, createdAt, updatedAt };
}

function entityMetadataForRows(entry, rows) {
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
    if (option.kind !== undefined && option.kind !== "text") {
      fail(
        "ambiguous_choice_option",
        "O tipo declarado da alternativa antiga diverge do conteúdo textual.",
        { optionIndex: index }
      );
    }
    assertExactFields(
      option,
      new Set(["id", "kind", "text", "feedback", "misconceptionId"]),
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
    if (option.kind !== undefined && option.kind !== "code") {
      fail(
        "ambiguous_choice_option",
        "O tipo declarado da alternativa antiga diverge do conteúdo de código.",
        { optionIndex: index }
      );
    }
    assertExactFields(
      option,
      new Set(["id", "kind", "language", "code", "feedback", "misconceptionId"]),
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

const SYSTEM_MAP_RESOLUTION_STRATEGY = "hierarchy_and_tables.v1";
const SEQUENCE_RESOLUTION_STRATEGY = "cycle_table.v1";
const INLINE_GAP_RESOLUTION_STRATEGY = "escaped_colon.v1";

function systemMapSourceData(card) {
  const data = {
    prompt: card.prompt,
    groups: card.groups === undefined ? null : clone(card.groups),
    nodes: card.nodes === undefined ? null : clone(card.nodes),
    links: card.links === undefined ? null : clone(card.links)
  };
  if (!Array.isArray(data.groups) || !Array.isArray(data.nodes) ||
      !Array.isArray(data.links) || data.nodes.length < 1) {
    fail("invalid_legacy_system_map", "Mapa de sistema antigo está incompleto.");
  }
  data.groups.forEach((group, index) => {
    if (!isObject(group)) {
      fail("invalid_legacy_system_map", "Grupo antigo não é um objeto.", {
        groupIndex: index
      });
    }
    assertExactFields(
      group,
      new Set(["id", "label", "kind", "parentId"]),
      "invalid_legacy_system_map",
      "Grupo antigo"
    );
  });
  data.nodes.forEach((node, index) => {
    if (!isObject(node)) {
      fail("invalid_legacy_system_map", "Nó antigo não é um objeto.", {
        nodeIndex: index
      });
    }
    assertExactFields(
      node,
      new Set(["id", "label", "kind", "groupId"]),
      "invalid_legacy_system_map",
      "Nó antigo"
    );
  });
  data.links.forEach((link, index) => {
    if (!isObject(link)) {
      fail("invalid_legacy_system_map", "Conexão antiga não é um objeto.", {
        linkIndex: index
      });
    }
    assertExactFields(
      link,
      new Set(["id", "from", "to", "label", "directed"]),
      "invalid_legacy_system_map",
      "Conexão antiga"
    );
  });
  const groupIds = data.groups.map(({ id }) => text(id));
  const nodeIds = data.nodes.map(({ id }) => text(id));
  const linkIds = data.links.map(({ id }) => text(id));
  const groups = new Set(groupIds);
  const nodes = new Set(nodeIds);
  if (groupIds.some((id) => !id) || nodeIds.some((id) => !id) ||
      linkIds.some((id) => !id) || groups.size !== groupIds.length ||
      nodes.size !== nodeIds.length || new Set(linkIds).size !== linkIds.length ||
      groupIds.some((id) => nodes.has(id)) ||
      data.groups.some(({ label, kind, parentId }) =>
        !text(label) || !text(kind) || (parentId !== null && !groups.has(text(parentId)))) ||
      data.nodes.some(({ label, kind, groupId }) =>
        !text(label) || !text(kind) || (groupId !== null && !groups.has(text(groupId)))) ||
      data.links.some(({ from, to, label, directed }) =>
        !nodes.has(text(from)) || !nodes.has(text(to)) || !text(label) ||
        typeof directed !== "boolean")) {
    fail(
      "invalid_legacy_system_map",
      "Mapa de sistema antigo possui identidade, relação ou rótulo inválido."
    );
  }
  return data;
}

function systemMapInventoryLabel(value) {
  return /\[\[[^\x5B\x5D]*?::[^\x5B\x5D]*?\]\]/u.test(String(value))
    ? "Ver rótulo no diagrama"
    : value;
}

function systemMapResolution(card, resolutions) {
  const data = systemMapSourceData(card);
  const fingerprint = canonicalSha256(data);
  const resolution = resolutions?.systemMaps?.[fingerprint];
  if (!isObject(resolution)) {
    fail(
      "system_map_resolution_required",
      "Mapa de sistema antigo exige resolução semântica explícita.",
      { sourceFingerprint: fingerprint }
    );
  }
  if (resolution.sourceFingerprint !== fingerprint) {
    fail(
      "system_map_resolution_mismatch",
      "A resolução do mapa de sistema não corresponde à origem.",
      { sourceFingerprint: fingerprint }
    );
  }
  assertExactFields(
    resolution,
    new Set(["sourceFingerprint", "strategy"]),
    "invalid_system_map_resolution",
    "Resolução do mapa de sistema"
  );
  if (resolution.strategy !== SYSTEM_MAP_RESOLUTION_STRATEGY) {
    fail(
      "invalid_system_map_resolution",
      "A resolução do mapa de sistema não declara a estratégia comprovada."
    );
  }
  const elementRows = [
    ...data.groups.map((group) => [
      "Grupo",
      group.id,
      systemMapInventoryLabel(group.label),
      group.kind,
      group.parentId ?? ""
    ]),
    ...data.nodes.map((node) => [
      "Componente",
      node.id,
      systemMapInventoryLabel(node.label),
      node.kind,
      node.groupId ?? ""
    ])
  ];
  if (elementRows.length > 30) {
    fail(
      "invalid_system_map_resolution",
      "Mapa de sistema excede a tabela aprovada para esta resolução."
    );
  }
  const content = [{
    id: `${card.id}-content-hierarchy`,
    package: "aralearn.resource.tree",
    version: "1.0.0",
    data: {
      prompt: data.prompt,
      variant: "hierarchy",
      nodes: [
        ...data.groups.map((group) => ({
          id: group.id,
          label: group.label,
          parentId: group.parentId
        })),
        ...data.nodes.map((node) => ({
          id: node.id,
          label: node.label,
          parentId: node.groupId
        }))
      ]
    }
  }, {
    id: `${card.id}-content-elements`,
    package: "aralearn.resource.table",
    version: "1.0.0",
    data: {
      caption: "Limites e componentes",
      layout: "wide",
      columns: ["Classe", "Identificador", "Rótulo", "Tipo", "Pertence a"],
      rows: elementRows
    }
  }];
  if (data.links.length) {
    content.push({
      id: `${card.id}-content-links`,
      package: "aralearn.resource.table",
      version: "1.0.0",
      data: {
        caption: "Conexões",
        layout: "wide",
        columns: ["Identificador", "Origem", "Relação", "Destino", "Direcionada"],
        rows: data.links.map((link) => [
          link.id,
          link.from,
          link.label,
          link.to,
          link.directed ? "Sim" : "Não"
        ])
      }
    });
  }
  return content;
}

function sequenceResolution(card, resolutions) {
  const data = {
    prompt: card.prompt,
    variant: card.variant,
    items: card.items === undefined ? null : clone(card.items)
  };
  if (data.variant !== "cycle" || !Array.isArray(data.items) ||
      data.items.length < 2 || data.items.length > 20) {
    fail(
      "invalid_legacy_sequence",
      "Sequência antiga não corresponde ao ciclo observado no corte."
    );
  }
  const ids = new Set();
  data.items.forEach((item, index) => {
    if (!isObject(item)) {
      fail("invalid_legacy_sequence", "Etapa antiga não é um objeto.", {
        itemIndex: index
      });
    }
    assertExactFields(
      item,
      new Set(["id", "label", "detail"]),
      "invalid_legacy_sequence",
      "Etapa antiga"
    );
    const id = text(item.id);
    if (!id || ids.has(id) || !text(item.label) ||
        (item.detail !== undefined && typeof item.detail !== "string")) {
      fail(
        "invalid_legacy_sequence",
        "Etapa antiga possui identidade, rótulo ou detalhe inválido.",
        { itemIndex: index }
      );
    }
    ids.add(id);
  });
  const fingerprint = canonicalSha256(data);
  const resolution = resolutions?.sequences?.[fingerprint];
  if (!isObject(resolution)) {
    fail(
      "sequence_resolution_required",
      "Sequência antiga exige resolução semântica explícita.",
      { sourceFingerprint: fingerprint }
    );
  }
  if (resolution.sourceFingerprint !== fingerprint) {
    fail(
      "sequence_resolution_mismatch",
      "A resolução da sequência não corresponde à origem.",
      { sourceFingerprint: fingerprint }
    );
  }
  assertExactFields(
    resolution,
    new Set(["sourceFingerprint", "strategy"]),
    "invalid_sequence_resolution",
    "Resolução da sequência"
  );
  if (resolution.strategy !== SEQUENCE_RESOLUTION_STRATEGY) {
    fail(
      "invalid_sequence_resolution",
      "A resolução da sequência não declara a estratégia comprovada."
    );
  }
  return [{
    id: `${card.id}-content-cycle`,
    package: "aralearn.resource.table",
    version: "1.0.0",
    data: {
      prompt: data.prompt,
      caption: "Ciclo: depois da última etapa, a leitura retorna à primeira.",
      layout: "wide",
      columns: ["Ordem", "Identificador", "Etapa", "Detalhe"],
      rows: data.items.map((item, index) => [
        String(index + 1),
        item.id,
        item.label,
        item.detail ?? ""
      ])
    }
  }];
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

function legacyContent(card, resolutions) {
  if (card.resource === "system_map") {
    return systemMapResolution(card, resolutions);
  }
  if (card.resource === "sequence") {
    return sequenceResolution(card, resolutions);
  }
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

function resolvedInlineGap(location, resolutions) {
  if (!location.answer.includes("\\") && !location.optionSource.includes("\\")) {
    return location;
  }
  const sourceFingerprint = canonicalSha256({
    path: location.path,
    source: location.source,
    token: location.token
  });
  const resolution = resolutions?.inlineGaps?.[sourceFingerprint];
  if (!isObject(resolution)) {
    fail(
      "inline_gap_resolution_required",
      "Lacuna antiga com escape exige resolução semântica explícita.",
      { sourceFingerprint }
    );
  }
  if (resolution.sourceFingerprint !== sourceFingerprint) {
    fail(
      "inline_gap_resolution_mismatch",
      "A resolução da lacuna não corresponde à origem.",
      { sourceFingerprint }
    );
  }
  assertExactFields(
    resolution,
    new Set(["sourceFingerprint", "strategy"]),
    "invalid_inline_gap_resolution",
    "Resolução da lacuna"
  );
  if (resolution.strategy !== INLINE_GAP_RESOLUTION_STRATEGY ||
      /\\(?!:)/u.test(location.answer + location.optionSource)) {
    fail(
      "invalid_inline_gap_resolution",
      "A resolução da lacuna não corresponde ao escape de dois-pontos comprovado."
    );
  }
  return {
    ...location,
    answer: location.answer.replaceAll("\\:", ":"),
    optionSource: location.optionSource.replaceAll("\\:", ":")
  };
}

function convertInlineGap(card, content, resolutions) {
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
  const location = resolvedInlineGap(locations[0], resolutions);
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

function convertLegacyCard(card, resolutions) {
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
  const content = legacyContent(card, resolutions);
  if (card.exercise === "gap" && !hasInlineGap) {
    fail("ambiguous_inline_gap", "Exercício antigo de lacuna não possui alvo.");
  }
  const response = role === "theory"
    ? null
    : card.exercise === "gap"
      ? convertInlineGap(card, content, resolutions)
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
    return convertLegacyCard(card, resolutions);
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

function countCourse(document, { sourceReferenceCount = null } = {}) {
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
            if (sourceReferenceCount === null) {
              counts.sourceReferences += (studyUnit.sources || []).length;
            }
            counts.topicReferences += (studyUnit.topics || []).length;
          }
        }
      }
    }
  }
  if (sourceReferenceCount !== null) {
    counts.sourceReferences = sourceReferenceCount;
  }
  return counts;
}

function legacySourceReferences(course) {
  const references = [];
  for (const moduleValue of course.modules || []) {
    for (const lesson of moduleValue.lessons || []) {
      for (const microsequence of lesson.microsequences || []) {
        for (const studyUnit of microsequence.studyUnits || []) {
          const sources = studyUnit.sources === undefined ? [] : studyUnit.sources;
          if (!Array.isArray(sources) || sources.length > 128) {
            fail(
              "invalid_legacy_source_references",
              "Referências legadas de uma Unidade excedem o contrato de preservação."
            );
          }
          sources.forEach((sourceId, sourceOrdinal) => {
            if (typeof sourceId !== "string" || sourceId.length < 1 ||
                [...sourceId].length > 2048 || hasControl(sourceId)) {
              fail(
                "invalid_legacy_source_references",
                "Referência legada vazia, com controle ou acima do limite."
              );
            }
            references.push({ studyUnitId: studyUnit.id, sourceOrdinal, sourceId });
          });
          const sourceLinks = sources.map((sourceId) => ({
            sourceId,
            sourceRevision: 1,
            relation: "legacy_reference",
            anchors: []
          }));
          if (Buffer.byteLength(JSON.stringify(sourceLinks), "utf8") > 131_072) {
            fail(
              "invalid_legacy_source_references",
              "Referências legadas de uma Unidade excedem o envelope preservável."
            );
          }
        }
      }
    }
  }
  return references.sort((left, right) =>
    Buffer.compare(
      Buffer.from(left.studyUnitId, "utf8"),
      Buffer.from(right.studyUnitId, "utf8")
    ) || left.sourceOrdinal - right.sourceOrdinal);
}

function withoutLegacySources(course) {
  const result = clone(course);
  for (const moduleValue of result.modules || []) {
    for (const lesson of moduleValue.lessons || []) {
      for (const microsequence of lesson.microsequences || []) {
        for (const studyUnit of microsequence.studyUnits || []) {
          delete studyUnit.sources;
        }
      }
    }
  }
  return result;
}

function sourceReferencesByStudyUnit(references) {
  const result = new Map();
  for (const reference of references) {
    if (!result.has(reference.studyUnitId)) result.set(reference.studyUnitId, []);
    result.get(reference.studyUnitId).push(reference.sourceId);
  }
  return result;
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

function preservationSignature(course, {
  legacy = false,
  sourceReferences = null
} = {}) {
  const structure = [];
  const references = [];
  const sourcesByStudyUnit = sourceReferences === null
    ? null
    : sourceReferencesByStudyUnit(sourceReferences);
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
        sources: clone(sourcesByStudyUnit?.get(entity.id) ?? entity.sources ?? []),
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

function assertPreservedCounts(beforeCourse, document, sourceReferences) {
  const before = countStructuralSource(beforeCourse);
  const after = countCourse(document, {
    sourceReferenceCount: sourceReferences.length
  });
  const comparableAfter = { ...after };
  delete comparableAfter.packageInstances;
  if (canonicalRevisionString(before) !== canonicalRevisionString(comparableAfter)) {
    fail("course_cardinality_drift", "A conversão alterou cardinalidade ou referências.", {
      before,
      after: comparableAfter
    });
  }
  const beforeSignature = preservationSignature(beforeCourse, { legacy: true });
  const afterSignature = preservationSignature(document.courses[0], {
    sourceReferences
  });
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
  const transitionalCourse = convertCourseTree(beforeCourse, targetCourseId, resolutions);
  const sourceReferences = legacySourceReferences(transitionalCourse);
  const convertedCourse = withoutLegacySources(transitionalCourse);
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
  const counts = assertPreservedCounts(beforeCourse, document, sourceReferences);
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
    sourceReferences,
    sourceReferenceHash: canonicalSha256(sourceReferences),
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
  assertCourseCutoverLegacyAudit(snapshot.legacyAudit, snapshot.legacyAuditHash);
  const totals = { root_only: 0, root_and_publication: 0 };
  const ids = new Set();
  let artifactCount = 0;
  for (const entry of snapshot.topology) {
    if (!text(entry.courseId) || !SOURCE_KINDS.has(entry.sourceKind) ||
        ids.has(entry.courseId)) {
      fail("invalid_cutover_topology", "Topologia contém identidade ou origem inválida.");
    }
    ids.add(entry.courseId);
    totals[entry.sourceKind] += 1;
    const needsArtifact = entry.sourceKind !== "root_only";
    const header = entry.targetHeader;
    if (!text(entry.workspaceId) || !text(entry.workspaceCourseId) ||
        !Number.isInteger(entry.workspaceRevision) || entry.workspaceRevision < 0 ||
        !Array.isArray(entry.workspaceEntities) ||
        entry.workspaceEntities.length < 1 ||
        Boolean(text(entry.legacyCourseId)) !== needsArtifact ||
        Boolean(text(entry.legacyRevisionHash)) !== needsArtifact ||
        Boolean(isObject(entry.artifact)) !== needsArtifact) {
      fail(
        "invalid_cutover_topology",
        "Topologia não corresponde aos metadados de sua origem."
      );
    }
    if (entry.workspaceEntities.some((row) => {
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
    if (!isObject(header) || !text(header.title) || !text(header.goal) ||
        header.title !== text(header.title) || header.goal !== text(header.goal) ||
        header.title.length > 300 || header.goal.length > 2000) {
      fail("invalid_target_header", "Cabeçalho relacional não é canônico.");
    }
    if (needsArtifact) artifactCount += 1;
  }
  if (snapshot.topology.length !== 8 || totals.root_only !== 4 ||
      totals.root_and_publication !== 4 || artifactCount !== 4) {
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
    sourceReferenceHash: converted.sourceReferenceHash,
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
    const sourcesByStudyUnit = sourceReferencesByStudyUnit(
      converted.sourceReferences
    );
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
      content: row.entityType === "study_unit"
        ? { ...row.content, sources: clone(sourcesByStudyUnit.get(row.entityId) || []) }
        : row.content
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
        canonicalSha256(converted.sourceReferences) !==
          converted.sourceReferenceHash ||
        canonicalRevisionString(countCourse(converted.document, {
          sourceReferenceCount: converted.sourceReferences.length
        })) !==
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
    expectedInputs.workspaceHash = canonicalSha256(assembleWorkspaceCourse(entry));
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
        !Array.isArray(course.entities) || !Array.isArray(course.sourceReferences)) {
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
    const sourceReferences = source.sourceReferences.map((reference) => {
      if (!isObject(reference) || !text(reference.studyUnitId) ||
          !Number.isInteger(reference.sourceOrdinal) ||
          reference.sourceOrdinal < 0 || typeof reference.sourceId !== "string") {
        fail(
          "invalid_cutover_verification",
          "Verificação pós-corte contém referência de Fonte inválida."
        );
      }
      return {
        studyUnitId: reference.studyUnitId,
        sourceOrdinal: reference.sourceOrdinal,
        sourceId: reference.sourceId
      };
    });
    const actual = {
      courseId: source.courseId,
      manifestHash: expected.manifest.manifestHash,
      documentHash: canonicalSha256(document),
      rowHash: canonicalSha256(flattened.rows),
      sourceReferenceHash: canonicalSha256(sourceReferences),
      entityStateHash: canonicalSha256(entityMetadata),
      counts: countCourse(document, {
        sourceReferenceCount: sourceReferences.length
      })
    };
    if (actual.documentHash !== expected.manifest.documentHash ||
        actual.rowHash !== expected.manifest.rowHash ||
        actual.sourceReferenceHash !== expected.manifest.sourceReferenceHash ||
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
    let artifact = null;
    const inputs = {};
    const liveSource = assembleWorkspaceCourse(entry);
    inputs.workspaceHash = canonicalSha256(liveSource);
    const live = convertCourseDocument(liveSource, {
      targetCourseId: entry.courseId,
      resolutions
    });
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
        live.sourceReferenceHash !== artifact.sourceReferenceHash ||
        canonicalRevisionString(live.document) !==
          canonicalRevisionString(artifact.document) ||
        canonicalRevisionString(live.sourceReferences) !==
          canonicalRevisionString(artifact.sourceReferences))) {
      fail(
        "course_overlap_drift",
        "Raiz viva e publicação sobrepostas não são semanticamente idênticas."
      );
    }
    const converted = live;
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

function transactionlessMigrationBody(migrationSql, label) {
  if (typeof migrationSql !== "string" || !migrationSql.trim()) {
    fail("migration_transaction_drift", `Limites transacionais de ${label} mudaram.`);
  }
  const beginCount = [...migrationSql.matchAll(/^begin;\s*$/gimu)].length;
  const commitCount = [...migrationSql.matchAll(/^commit;\s*$/gimu)].length;
  if (beginCount === 0 && commitCount === 0) {
    return withoutTransactionGuards(migrationSql.trim());
  }
  if (beginCount === 1 && commitCount === 1) {
    return withoutTransactionGuards(transactionBody(migrationSql, label).body);
  }
  fail("migration_transaction_drift", `Limites transacionais de ${label} mudaram.`);
}

function preparePostCutoverMigrations(migrations) {
  if (!Array.isArray(migrations) || migrations.length < 1) {
    fail("invalid_cutover_execution", "Migrations posteriores ao corte estão ausentes.");
  }
  let previousVersion = COURSE_AUDIT_MIGRATION_VERSION;
  return migrations.map((migration) => {
    if (!isObject(migration) || Object.keys(migration).length !== 3 ||
        !/^\d{14}$/u.test(migration.version || "") ||
        !/^[a-z][a-z0-9_]*$/u.test(migration.name || "") ||
        typeof migration.sql !== "string" ||
        migration.version <= previousVersion) {
      fail(
        "invalid_cutover_execution",
        "A sequência de migrations posteriores ao corte é inválida."
      );
    }
    previousVersion = migration.version;
    return {
      version: migration.version,
      name: migration.name,
      body: transactionlessMigrationBody(migration.sql, `a migration ${migration.name}`)
    };
  });
}

export function buildCourseCutoverSql(
  preparation,
  taskOperationTerminologyMigrationSql,
  migrationSql,
  profileAccessMigrationSql,
  authoringPlanMigrationSql,
  studyUnitInspectionMigrationSql,
  courseDesignMigrationSql,
  courseSourcesMigrationSql,
  courseAnnotationsMigrationSql,
  courseAuditMigrationSql,
  postCutoverMigrations
) {
  if (!isObject(preparation) || !Array.isArray(preparation.rows) ||
      !preparation.rows.length ||
      typeof taskOperationTerminologyMigrationSql !== "string" ||
      typeof migrationSql !== "string" ||
      typeof profileAccessMigrationSql !== "string" ||
      typeof authoringPlanMigrationSql !== "string" ||
      typeof studyUnitInspectionMigrationSql !== "string" ||
      typeof courseDesignMigrationSql !== "string" ||
      typeof courseSourcesMigrationSql !== "string" ||
      typeof courseAnnotationsMigrationSql !== "string" ||
      typeof courseAuditMigrationSql !== "string") {
    fail(
      "invalid_cutover_execution",
      "Linhas ou migrations do corte estão ausentes."
    );
  }
  attestPreparedCourseCutover(preparation);
  assertMigrationStagingSchema(migrationSql);
  const rows = preparation.rows;
  const taskOperationTerminologyTransaction = transactionBody(
    taskOperationTerminologyMigrationSql,
    "a migration de terminologia das operações-alvo"
  );
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
  const courseSourcesTransaction = transactionBody(
    courseSourcesMigrationSql,
    "a migration de Fontes e proveniência"
  );
  const courseSourcesExecutionBody = withoutTransactionGuards(
    courseSourcesTransaction.body
  );
  const courseAnnotationsTransaction = transactionBody(
    courseAnnotationsMigrationSql,
    "a migration de observações ancoradas"
  );
  const courseAnnotationsExecutionBody = withoutTransactionGuards(
    courseAnnotationsTransaction.body
  );
  const courseAuditTransaction = transactionBody(
    courseAuditMigrationSql,
    "a migration de auditoria e correções"
  );
  const courseAuditExecutionBody = withoutTransactionGuards(
    courseAuditTransaction.body
  );
  const preparedPostCutoverMigrations = preparePostCutoverMigrations(
    postCutoverMigrations
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
    taskOperationTerminologyTransaction.body,
    identityExecutionBody,
    profileAccessTransaction.body,
    authoringPlanExecutionBody,
    studyUnitInspectionExecutionBody,
    courseDesignExecutionBody,
    courseSourcesExecutionBody,
    courseAnnotationsExecutionBody,
    courseAuditExecutionBody,
    ...preparedPostCutoverMigrations.map(({ body }) => body),
    "insert into supabase_migrations.schema_migrations(version,statements,name)",
    `values (${sqlText(TASK_OPERATION_TERMINOLOGY_MIGRATION_VERSION)},` +
      `array[${sqlText(taskOperationTerminologyTransaction.body)}]::text[],` +
      `${sqlText(TASK_OPERATION_TERMINOLOGY_MIGRATION_NAME)});`,
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
    "insert into supabase_migrations.schema_migrations(version,statements,name)",
    `values (${sqlText(COURSE_SOURCES_MIGRATION_VERSION)},` +
      `array[${sqlText(courseSourcesTransaction.body)}]::text[],` +
      `${sqlText(COURSE_SOURCES_MIGRATION_NAME)});`,
    "insert into supabase_migrations.schema_migrations(version,statements,name)",
    `values (${sqlText(COURSE_ANNOTATIONS_MIGRATION_VERSION)},` +
      `array[${sqlText(courseAnnotationsTransaction.body)}]::text[],` +
      `${sqlText(COURSE_ANNOTATIONS_MIGRATION_NAME)});`,
    "insert into supabase_migrations.schema_migrations(version,statements,name)",
    `values (${sqlText(COURSE_AUDIT_MIGRATION_VERSION)},` +
      `array[${sqlText(courseAuditTransaction.body)}]::text[],` +
      `${sqlText(COURSE_AUDIT_MIGRATION_NAME)});`,
    ...preparedPostCutoverMigrations.flatMap(({ version, name, body }) => [
      "insert into supabase_migrations.schema_migrations(version,statements,name)",
      `values (${sqlText(version)},array[${sqlText(body)}]::text[],${sqlText(name)});`
    ]),
    "commit;",
    ""
  ].join("\n");
}
