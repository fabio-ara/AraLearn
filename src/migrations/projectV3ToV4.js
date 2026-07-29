import {
  getChoiceOptionComparableValue,
  normalizeChoiceComparableValue
} from "../core/choiceOptions.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolveAnswerId(choice) {
  const options = Array.isArray(choice?.options) ? choice.options : [];
  const rawAnswer = choice?.answer;
  const literal = text(rawAnswer);
  const byId = options.find((option) => text(option?.id) === literal);
  if (byId) return text(byId.id);

  if (Number.isInteger(rawAnswer)) {
    return text(options[rawAnswer]?.id || options[rawAnswer - 1]?.id);
  }

  const comparableAnswer = normalizeChoiceComparableValue(literal);
  const byValue = options.find((option, index) =>
    normalizeChoiceComparableValue(getChoiceOptionComparableValue(option, index)) === comparableAnswer
  );
  return text(byValue?.id);
}

function isLegacyChoice(value) {
  return isObject(value)
    && Array.isArray(value.options)
    && Object.hasOwn(value, "answer")
    && (value.resource === "choice" || value.exercise === "choice" || value.kind === "choice");
}

function migrateChoice(value, path, changes) {
  const answerId = resolveAnswerId(value);
  if (!answerId) {
    throw new Error(`${path}.answer não corresponde a uma opção existente.`);
  }
  value.selectionMode = "single";
  value.selectionCriterion = "correct";
  value.answerIds = [answerId];
  delete value.answer;
  changes.push(`${path}: choice`);
}

function slug(value) {
  const normalized = text(value)
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return normalized || "block";
}

function assignBlockIds(blocks, path, changes) {
  if (!Array.isArray(blocks)) return;
  const used = new Set(blocks.map((block) => text(block?.id)).filter(Boolean));
  const counts = new Map();
  blocks.forEach((block, index) => {
    if (!isObject(block) || text(block.id)) return;
    const base = slug(block.kind);
    const nextCount = (counts.get(base) || 0) + 1;
    counts.set(base, nextCount);
    let candidate = `${base}-${nextCount}`;
    while (used.has(candidate)) {
      counts.set(base, (counts.get(base) || nextCount) + 1);
      candidate = `${base}-${counts.get(base)}`;
    }
    block.id = candidate;
    used.add(candidate);
    changes.push(`${path}[${index}].id`);
  });
}

function looksLikeFilesystemTree(nodes = []) {
  return nodes.some((node) => {
    const label = text(node?.label);
    return /(?:^\/|\\|\/|\.[a-z0-9]{1,8}$|readme|src|home|etc|bin|config)/iu.test(label);
  });
}

function inferTreeVariant(nodes = []) {
  const labels = nodes.map((node) => text(node?.label)).join(" ");
  if (looksLikeFilesystemTree(nodes)) return "filesystem";
  if (/(?:animalia|plantae|fungi|chordata|espécie|gênero|família|táxon)/iu.test(labels)) {
    return "taxonomy";
  }
  if (/(?:ancestral|clado|linhagem|filogen)/iu.test(labels)) return "phylogeny";
  if (/(?:sintagma|oração|sentença|verbo|substantivo|constituinte)/iu.test(labels)) {
    return "syntax";
  }
  if (/(?:diretoria|departamento|gerência|equipe|presidência)/iu.test(labels)) {
    return "organization";
  }
  return "hierarchy";
}

function migrateTree(value, path, changes) {
  if (!Array.isArray(value?.nodes) ||
      !(value.resource === "tree" || value.kind === "tree")) return;
  const variant = text(value.variant) || inferTreeVariant(value.nodes);
  value.variant = variant === "file_system" ? "filesystem" : variant;
  value.nodes.forEach((node, index) => {
    if (!isObject(node)) return;
    if (value.variant === "filesystem") {
      const legacyType = text(node.type);
      node.entryType = text(node.entryType) ||
        (legacyType === "folder" ? "directory" : legacyType === "file" ? "file" : "file");
    } else {
      delete node.entryType;
    }
    if (Object.hasOwn(node, "type")) {
      delete node.type;
      changes.push(`${path}.nodes[${index}].type->entryType`);
    }
  });
  changes.push(`${path}.variant`);
}

function inferGraphLayout(vertices = [], edges = []) {
  const ids = vertices.map((vertex) => text(vertex?.id)).filter(Boolean);
  const degree = new Map(ids.map((id) => [id, 0]));
  const incoming = new Map(ids.map((id) => [id, 0]));
  edges.forEach((edge) => {
    const from = text(edge?.from);
    const to = text(edge?.to);
    if (!degree.has(from) || !degree.has(to)) return;
    degree.set(from, degree.get(from) + 1);
    degree.set(to, degree.get(to) + 1);
    if (edge?.directed === true) incoming.set(to, incoming.get(to) + 1);
  });
  const values = [...degree.values()];
  if (ids.length >= 3 && edges.length === ids.length && values.every((value) => value === 2)) {
    return "cycle";
  }
  if (ids.length >= 3 && values.includes(ids.length - 1) &&
      values.filter((value) => value === 1).length === ids.length - 1) {
    return "star";
  }
  if (edges.length === Math.max(0, ids.length - 1) && values.every((value) => value <= 2)) {
    return "path";
  }
  if (edges.some((edge) => edge?.directed === true) &&
      [...incoming.values()].some((value) => value === 0)) {
    return "hierarchical";
  }
  return "network";
}

function migrateGraph(value, path, changes) {
  if (!Array.isArray(value?.vertices) || !Array.isArray(value?.edges) ||
      !(value.resource === "graph" || value.kind === "graph")) return;
  value.layout = text(value.layout) || inferGraphLayout(value.vertices, value.edges);
  value.vertices.forEach((vertex, index) => {
    if (!isObject(vertex)) return;
    if (Object.hasOwn(vertex, "x") || Object.hasOwn(vertex, "y")) {
      delete vertex.x;
      delete vertex.y;
      changes.push(`${path}.vertices[${index}].coordinates`);
    }
  });
  const used = new Set(value.edges.map((edge) => text(edge?.id)).filter(Boolean));
  value.edges.forEach((edge, index) => {
    if (!isObject(edge)) return;
    if (!text(edge.id)) {
      let candidate = `edge-${index + 1}`;
      let suffix = index + 1;
      while (used.has(candidate)) {
        suffix += 1;
        candidate = `edge-${suffix}`;
      }
      edge.id = candidate;
      used.add(candidate);
      changes.push(`${path}.edges[${index}].id`);
    }
  });
  if (Array.isArray(value?.highlight?.edges)) {
    value.highlight.edges = value.highlight.edges.map((entry) => {
      if (typeof entry === "string") return entry;
      if (!Array.isArray(entry) || entry.length !== 2) return "";
      return text(value.edges.find((edge) =>
        text(edge?.from) === text(entry[0]) && text(edge?.to) === text(entry[1])
      )?.id);
    }).filter(Boolean);
    changes.push(`${path}.highlight.edges`);
  }
  changes.push(`${path}.layout`);
}

function migrateTableMetadata(value, path, changes) {
  if (!Array.isArray(value?.columns) || !Array.isArray(value?.rows) ||
      !(value.resource === "table" || value.kind === "table")) return;
  const layoutMap = {
    data: "auto",
    comparison: "auto",
    timeline: "wide",
    matrix: "wide"
  };
  if (layoutMap[value.layout]) {
    value.layout = layoutMap[value.layout];
    changes.push(`${path}.layout`);
  }
  if (Array.isArray(value.columnMeta)) {
    value.columnMeta = value.columnMeta.map((meta = {}) => ({
      align: ({
        start: "left",
        end: "right",
        decimal: "numeric"
      })[meta.align] || (["left", "center", "right", "numeric"].includes(meta.align)
        ? meta.align
        : "left"),
      wrap: typeof meta.wrap === "boolean" ? meta.wrap : true
    }));
    changes.push(`${path}.columnMeta`);
  }
}

function visit(value, path, changes) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visit(item, `${path}[${index}]`, changes));
    return;
  }
  if (!isObject(value)) return;

  if (isLegacyChoice(value)) {
    migrateChoice(value, path, changes);
  }
  migrateTree(value, path, changes);
  migrateGraph(value, path, changes);
  migrateTableMetadata(value, path, changes);
  assignBlockIds(value.blocks, `${path}.blocks`, changes);
  assignBlockIds(value.afterBlocks, `${path}.afterBlocks`, changes);

  Object.entries(value).forEach(([key, child]) => visit(child, `${path}.${key}`, changes));
}

export function migrateProjectV3ToV4(input) {
  if (!isObject(input) || input.contract !== "aralearn.contract" || input.kind !== "project") {
    throw new Error("Documento não é um projeto AraLearn.");
  }
  if (input.version !== 3) {
    throw new Error("A migração exige um projeto AraLearn v3.");
  }

  const project = structuredClone(input);
  const changes = ["$.version"];
  project.version = 4;
  visit(project, "$", changes);

  return {
    project,
    report: {
      fromVersion: 3,
      toVersion: 4,
      changedPaths: changes
    }
  };
}

export function migrateResourceChoicesV3ToV4(input) {
  const value = structuredClone(input);
  const changes = [];
  visit(value, "$", changes);
  return { value, changedPaths: changes };
}
