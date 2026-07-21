function createIdFactory() {
  let counter = 0;
  return function nextId(prefix = "flow-struct") {
    counter += 1;
    return `${prefix}-${counter}`;
  };
}
const nextId = createIdFactory();

const LEAF_KINDS = Object.freeze([
  "start",
  "end",
  "input",
  "output",
  "process"
]);

const STRUCTURE_KINDS = Object.freeze(
  LEAF_KINDS.concat([
    "sequence",
    "if_then",
    "if_then_else",
    "while",
    "for",
    "do_while",
    "if_chain",
    "switch_case"
  ])
);

function cleanId(value, fallbackPrefix = "flow-struct") {
  const source = String(value || "").trim();
  return source || nextId(fallbackPrefix);
}

function normalizeText(value, fallbackValue = "") {
  const text = String(value || "").replace(/\r/g, "").trim();
  return text || String(fallbackValue || "");
}

function normalizeOptionalText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function hasOwn(value, fieldName) {
  return Object.prototype.hasOwnProperty.call(value, fieldName);
}

function normalizeStringArray(list) {
  if (!Array.isArray(list)) {
    return [];
  }

  return list
    .map((item) => String(item || "").replace(/\r/g, "").trim())
    .filter(Boolean)
    .filter((item, index, source) => source.indexOf(item) === index);
}

function normalizePracticeVariantList(list) {
  if (!Array.isArray(list)) {
    return [];
  }

  return list
    .map((item) => {
      const source = item && typeof item === "object" && !Array.isArray(item) ? item : { value: item };
      return {
        id: cleanId(source.id, "flow-variant"),
        value: String(source.value || "").replace(/\r/g, "").trim(),
        regex: !!source.regex
      };
    })
    .filter((item) => item.value);
}

function normalizePracticeChoiceOptions(list) {
  return (Array.isArray(list) ? list : [])
    .map((item, index) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        return {
          id: String(item.id || `flow-option-${index}`),
          value: String(item.value || "").replace(/\r/g, "").trim(),
          enabled: item.enabled !== false
        };
      }

      return {
        id: `flow-option-${index}`,
        value: String(item || "").replace(/\r/g, "").trim(),
        enabled: true
      };
    })
    .filter((item) => item.value);
}

function normalizePracticeEntry(raw, forceBlank = false) {
  const source =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? raw
      : raw === true
        ? { blank: true }
        : {};
  const variants = normalizePracticeVariantList(source.variants);
  const options = normalizePracticeChoiceOptions(source.options);
  const entry = {};

  if (source.blank === true || forceBlank === true || variants.length || options.length) {
    entry.blank = true;
  }
  if ((source.mode === "choice" || options.length) && entry.blank) {
    entry.mode = "choice";
  }
  if (options.length) {
    entry.options = options;
  }
  if (variants.length) {
    entry.variants = variants;
  }

  return Object.keys(entry).length ? entry : null;
}

function normalizePracticeLabels(raw, includeDefaultBlank = false) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return includeDefaultBlank ? { default: { blank: true } } : null;
  }

  const labels = {};
  Object.keys(raw).forEach((key) => {
    const entry = normalizePracticeEntry(raw[key], raw[key] === true);
    if (entry) {
      labels[String(key)] = entry;
    }
  });

  if (includeDefaultBlank && !labels.default) {
    labels.default = { blank: true };
  }

  return Object.keys(labels).length ? labels : null;
}

function normalizePractice(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const practice = {};
  const textEntry = normalizePracticeEntry(raw.text, raw.blankText === true);
  const labels = normalizePracticeLabels(raw.labels, raw.blankLabel === true);
  const shapeOptions = normalizeStringArray(raw.shapeOptions);

  if (raw.blankShape === true || shapeOptions.length) {
    practice.blankShape = true;
  }
  if (shapeOptions.length) {
    practice.shapeOptions = shapeOptions;
  }
  if (textEntry) {
    practice.text = textEntry;
  }
  if (labels) {
    practice.labels = labels;
  }

  return Object.keys(practice).length ? practice : null;
}

function normalizeStructureList(list, path) {
  return (Array.isArray(list) ? list : [])
    .map((item, index) => normalizeStructureNode(item, { path: `${path}[${index}]` }))
    .filter(Boolean);
}

function normalizeIfChainCases(list, path) {
  return (Array.isArray(list) ? list : [])
    .map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const practice = normalizePractice(item.practice);
      const next = {
        id: cleanId(item.id, "flow-case"),
        condition: normalizeText(item.condition, "Condição"),
        thenBranch: normalizeStructureList(item.thenBranch, `${path}[${index}].thenBranch`)
      };
      if (practice) {
        next.practice = practice;
      }
      return next;
    })
    .filter(Boolean);
}

function normalizeIfChainBranches(list, path) {
  return (Array.isArray(list) ? list : [])
    .map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const practice = normalizePractice(item.practice);
      const next = {
        id: cleanId(item.id, "flow-branch"),
        condition: normalizeText(item.condition, "Condição"),
        items: normalizeStructureList(item.items, `${path}[${index}].items`)
      };
      if (practice) next.practice = practice;
      return next;
    })
    .filter(Boolean);
}

function normalizeSwitchCaseCases(list, path) {
  return (Array.isArray(list) ? list : [])
    .map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const practice = normalizePractice(item.practice);
      const next = {
        id: cleanId(item.id, "flow-case"),
        match: normalizeText(item.match, "Caso"),
        body: normalizeStructureList(item.body, `${path}[${index}].body`)
      };
      if (practice) {
        next.practice = practice;
      }
      return next;
    })
    .filter(Boolean);
}

export function normalizeFlowchartStructure(raw) {
  return normalizeStructureNode(raw, { path: "root" });
}

function normalizeStructureNode(raw, context) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const kind = String(raw.kind || "").trim().toLowerCase();
  if (!STRUCTURE_KINDS.includes(kind)) {
    return null;
  }

  const base = {
    id: cleanId(raw.id, "flow-struct"),
    kind
  };
  const comment = normalizeOptionalText(raw.comment);
  const practice = normalizePractice(raw.practice);
  if (comment) {
    base.comment = comment;
  }
  if (practice) {
    base.practice = practice;
  }

  if (kind === "sequence") {
    return {
      ...base,
      items: normalizeStructureList(raw.items, `${context.path}.items`)
    };
  }

  if (LEAF_KINDS.includes(kind)) {
    const fallbackText = kind === "start" ? "Início" : kind === "end" ? "Fim" : "";
    return {
      ...base,
      text: normalizeText(raw.text, fallbackText)
    };
  }

  if (kind === "if_then") {
    return {
      ...base,
      condition: normalizeText(raw.condition, "Condição"),
      thenBranch: normalizeStructureList(raw.thenBranch, `${context.path}.thenBranch`)
    };
  }

  if (kind === "if_then_else") {
    return {
      ...base,
      condition: normalizeText(raw.condition, "Condição"),
      thenBranch: normalizeStructureList(raw.thenBranch, `${context.path}.thenBranch`),
      elseBranch: normalizeStructureList(raw.elseBranch, `${context.path}.elseBranch`)
    };
  }

  if (kind === "if_chain") {
    return {
      ...base,
      cases: normalizeIfChainCases(raw.cases, `${context.path}.cases`),
      ...(hasOwn(raw, "branches")
        ? { branches: normalizeIfChainBranches(raw.branches, `${context.path}.branches`) }
        : {}),
      elseBranch: normalizeStructureList(raw.elseBranch, `${context.path}.elseBranch`)
    };
  }

  if (kind === "switch_case") {
    return {
      ...base,
      expression: normalizeText(raw.expression, "Valor"),
      cases: normalizeSwitchCaseCases(raw.cases, `${context.path}.cases`),
      defaultBranch: normalizeStructureList(raw.defaultBranch, `${context.path}.defaultBranch`)
    };
  }

  if (kind === "while") {
    return {
      ...base,
      condition: normalizeText(raw.condition, "Condição"),
      body: normalizeStructureList(raw.body, `${context.path}.body`)
    };
  }

  if (kind === "do_while") {
    return {
      ...base,
      condition: normalizeText(raw.condition, "Condição"),
      body: normalizeStructureList(raw.body, `${context.path}.body`)
    };
  }

  if (kind === "for") {
    return {
      ...base,
      init: normalizeOptionalText(raw.init),
      condition: normalizeText(raw.condition, "Condição"),
      update: normalizeOptionalText(raw.update),
      ...(hasOwn(raw, "iterator") ? { iterator: normalizeOptionalText(raw.iterator) } : {}),
      ...(hasOwn(raw, "iterable") ? { iterable: normalizeOptionalText(raw.iterable) } : {}),
      body: normalizeStructureList(raw.body, `${context.path}.body`)
    };
  }

  return { ...base };
}

export function validateFlowchartStructureContract(rawStructure) {
  const findings = [];
  const unsupportedKinds = [];

  validateStructureNode(rawStructure, "root", true, findings, unsupportedKinds);

  return {
    valid: findings.length === 0,
    reason: findings.some((item) => item.endsWith(":root_not_sequence"))
      ? "root_not_sequence"
      : unsupportedKinds.length
        ? "unsupported_kinds"
        : findings.length
          ? "invalid_structure"
          : "supported",
    unsupportedKinds,
    findings
  };
}

function validateStructureNode(raw, path, isRoot, findings, unsupportedKinds) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    findings.push(`${path}:invalid_node`);
    return;
  }

  const kind = String(raw.kind || "").trim().toLowerCase();
  if (!kind) {
    findings.push(`${path}:missing_kind`);
    return;
  }

  if (isRoot && kind !== "sequence") {
    findings.push(`${path}:root_not_sequence`);
    if (!unsupportedKinds.includes(kind)) {
      unsupportedKinds.push(kind);
    }
  }

  if (!STRUCTURE_KINDS.includes(kind)) {
    findings.push(`${path}:unsupported_kind`);
    if (!unsupportedKinds.includes(kind)) {
      unsupportedKinds.push(kind);
    }
    return;
  }

  const scalarFields = new Set(["id", "comment"]);
  if (LEAF_KINDS.includes(kind)) scalarFields.add("text");
  if (["if_then", "if_then_else", "while", "do_while", "for"].includes(kind)) scalarFields.add("condition");
  if (kind === "switch_case") scalarFields.add("expression");
  if (kind === "for") ["init", "update", "iterator", "iterable"].forEach((field) => scalarFields.add(field));
  scalarFields.forEach((fieldName) => {
    if (hasOwn(raw, fieldName) && typeof raw[fieldName] !== "string") {
      findings.push(`${path}.${fieldName}:expected_string`);
    }
  });

  if (kind === "sequence") {
    validateStructureNodeList(raw.items, `${path}.items`, findings, unsupportedKinds);
    return;
  }
  if (kind === "if_then") {
    validateStructureNodeList(raw.thenBranch, `${path}.thenBranch`, findings, unsupportedKinds);
    return;
  }
  if (kind === "if_then_else") {
    validateStructureNodeList(raw.thenBranch, `${path}.thenBranch`, findings, unsupportedKinds);
    validateStructureNodeList(raw.elseBranch, `${path}.elseBranch`, findings, unsupportedKinds);
    return;
  }
  if (kind === "if_chain") {
    validateIfChainCasesList(raw.cases, `${path}.cases`, findings, unsupportedKinds);
    validateIfChainBranchesList(raw.branches, `${path}.branches`, findings, unsupportedKinds);
    validateStructureNodeList(raw.elseBranch, `${path}.elseBranch`, findings, unsupportedKinds);
    return;
  }
  if (kind === "switch_case") {
    validateSwitchCaseCasesList(raw.cases, `${path}.cases`, findings, unsupportedKinds);
    validateStructureNodeList(raw.defaultBranch, `${path}.defaultBranch`, findings, unsupportedKinds);
    return;
  }
  if (kind === "while" || kind === "do_while" || kind === "for") {
    validateStructureNodeList(raw.body, `${path}.body`, findings, unsupportedKinds);
  }
}

function validateStructureNodeList(list, path, findings, unsupportedKinds) {
  if (list == null) {
    return;
  }
  if (!Array.isArray(list)) {
    findings.push(`${path}:expected_array`);
    return;
  }
  list.forEach((item, index) => validateStructureNode(item, `${path}[${index}]`, false, findings, unsupportedKinds));
}

function validateIfChainCasesList(list, path, findings, unsupportedKinds) {
  if (list == null) {
    return;
  }
  if (!Array.isArray(list)) {
    findings.push(`${path}:expected_array`);
    return;
  }
  list.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      findings.push(`${itemPath}:invalid_case`);
      return;
    }
    ["id", "condition"].forEach((fieldName) => {
      if (hasOwn(item, fieldName) && typeof item[fieldName] !== "string") {
        findings.push(`${itemPath}.${fieldName}:expected_string`);
      }
    });
    validateStructureNodeList(item.thenBranch, `${itemPath}.thenBranch`, findings, unsupportedKinds);
  });
}

function validateIfChainBranchesList(list, path, findings, unsupportedKinds) {
  if (list == null) return;
  if (!Array.isArray(list)) {
    findings.push(`${path}:expected_array`);
    return;
  }
  list.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      findings.push(`${itemPath}:invalid_branch`);
      return;
    }
    ["id", "condition"].forEach((fieldName) => {
      if (hasOwn(item, fieldName) && typeof item[fieldName] !== "string") {
        findings.push(`${itemPath}.${fieldName}:expected_string`);
      }
    });
    validateStructureNodeList(item.items, `${itemPath}.items`, findings, unsupportedKinds);
  });
}

function validateSwitchCaseCasesList(list, path, findings, unsupportedKinds) {
  if (list == null) {
    return;
  }
  if (!Array.isArray(list)) {
    findings.push(`${path}:expected_array`);
    return;
  }
  list.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      findings.push(`${itemPath}:invalid_case`);
      return;
    }
    ["id", "match"].forEach((fieldName) => {
      if (hasOwn(item, fieldName) && typeof item[fieldName] !== "string") {
        findings.push(`${itemPath}.${fieldName}:expected_string`);
      }
    });
    validateStructureNodeList(item.body, `${itemPath}.body`, findings, unsupportedKinds);
  });
}
