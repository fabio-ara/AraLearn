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

const FLOW_COMMON_FIELDS = Object.freeze(["id", "kind", "comment", "practice"]);
const FLOW_FIELDS = Object.freeze({
  sequence: [...FLOW_COMMON_FIELDS, "items"],
  start: [...FLOW_COMMON_FIELDS, "text"],
  end: [...FLOW_COMMON_FIELDS, "text"],
  input: [...FLOW_COMMON_FIELDS, "text"],
  output: [...FLOW_COMMON_FIELDS, "text"],
  process: [...FLOW_COMMON_FIELDS, "text"],
  if_then: [...FLOW_COMMON_FIELDS, "condition", "thenBranch"],
  if_then_else: [...FLOW_COMMON_FIELDS, "condition", "thenBranch", "elseBranch"],
  while: [...FLOW_COMMON_FIELDS, "condition", "body"],
  do_while: [...FLOW_COMMON_FIELDS, "condition", "body"],
  for: [...FLOW_COMMON_FIELDS, "init", "condition", "update", "iterator", "iterable", "body"],
  if_chain: [...FLOW_COMMON_FIELDS, "cases", "branches", "elseBranch"],
  switch_case: [...FLOW_COMMON_FIELDS, "expression", "cases", "defaultBranch"]
});
const FLOW_SHAPE_OPTIONS = new Set([
  "terminal",
  "process",
  "input_output",
  "keyboard_input",
  "screen_output",
  "printed_output",
  "decision",
  "loop",
  "connector",
  "page_connector"
]);

function validateKnownFields(raw, allowedFields, path, findings) {
  const allowed = new Set(allowedFields);
  Object.keys(raw || {}).forEach((fieldName) => {
    if (!allowed.has(fieldName)) findings.push(`${path}.${fieldName}:unknown_field`);
  });
}

function validatePracticeOptionList(list, path, findings, kind) {
  if (!Array.isArray(list)) {
    findings.push(`${path}:expected_array`);
    return;
  }
  const ids = new Set();
  const values = new Set();
  list.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    const source = item && typeof item === "object" && !Array.isArray(item) ? item : { value: item };
    if (item && typeof item === "object" && !Array.isArray(item)) {
      validateKnownFields(source, kind === "option" ? ["id", "value", "enabled"] : ["id", "value", "regex"], itemPath, findings);
    }
    if (typeof source.value !== "string" || !source.value.trim()) findings.push(`${itemPath}.value:expected_non_empty_string`);
    if (source.id !== undefined) {
      if (typeof source.id !== "string" || !source.id.trim()) findings.push(`${itemPath}.id:expected_non_empty_string`);
      else if (ids.has(source.id)) findings.push(`${itemPath}.id:duplicate_id`);
      else ids.add(source.id);
    }
    if (kind === "option" && source.enabled !== undefined && typeof source.enabled !== "boolean") {
      findings.push(`${itemPath}.enabled:expected_boolean`);
    }
    if (kind === "variant" && source.regex !== undefined && typeof source.regex !== "boolean") {
      findings.push(`${itemPath}.regex:expected_boolean`);
    }
    if (typeof source.value === "string") {
      const value = source.value.trim();
      if (value && values.has(value)) findings.push(`${itemPath}.value:duplicate_value`);
      if (value) values.add(value);
    }
  });
}

function validatePracticeEntry(raw, path, findings, allowBoolean = false) {
  if (raw === true && allowBoolean) return;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    findings.push(`${path}:invalid_practice_entry`);
    return;
  }
  validateKnownFields(raw, ["blank", "mode", "options", "variants"], path, findings);
  if (raw.blank !== undefined && typeof raw.blank !== "boolean") findings.push(`${path}.blank:expected_boolean`);
  if (raw.mode !== undefined && raw.mode !== "choice") findings.push(`${path}.mode:unsupported_mode`);
  if (raw.options !== undefined) validatePracticeOptionList(raw.options, `${path}.options`, findings, "option");
  if (raw.variants !== undefined) validatePracticeOptionList(raw.variants, `${path}.variants`, findings, "variant");
  if (raw.blank === false && (raw.options?.length || raw.variants?.length)) {
    findings.push(`${path}.blank:incompatible_false`);
  }
}

function validatePractice(raw, path, findings) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    findings.push(`${path}:invalid_practice`);
    return;
  }
  validateKnownFields(raw, ["blankShape", "shapeOptions", "text", "labels", "blankText", "blankLabel"], path, findings);
  ["blankShape", "blankText", "blankLabel"].forEach((fieldName) => {
    if (raw[fieldName] !== undefined && typeof raw[fieldName] !== "boolean") {
      findings.push(`${path}.${fieldName}:expected_boolean`);
    }
  });
  if (raw.shapeOptions !== undefined) {
    if (!Array.isArray(raw.shapeOptions) || !raw.shapeOptions.length) {
      findings.push(`${path}.shapeOptions:expected_non_empty_array`);
    } else {
      const seen = new Set();
      raw.shapeOptions.forEach((value, index) => {
        const normalized = typeof value === "string" ? value.trim() : "";
        if (!normalized || !FLOW_SHAPE_OPTIONS.has(normalized)) {
          findings.push(`${path}.shapeOptions[${index}]:unsupported_shape`);
        } else if (seen.has(normalized)) {
          findings.push(`${path}.shapeOptions[${index}]:duplicate_value`);
        } else {
          seen.add(normalized);
        }
      });
      if (raw.blankShape === false) findings.push(`${path}.blankShape:incompatible_false`);
    }
  }
  if (raw.text !== undefined) validatePracticeEntry(raw.text, `${path}.text`, findings);
  if (raw.labels !== undefined) {
    if (!raw.labels || typeof raw.labels !== "object" || Array.isArray(raw.labels)) {
      findings.push(`${path}.labels:expected_object`);
    } else {
      Object.entries(raw.labels).forEach(([labelKey, entry]) => {
        validatePracticeEntry(entry, `${path}.labels.${labelKey}`, findings, true);
      });
    }
  }
}

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
  validateUniqueFlowNodeIds(rawStructure, findings);

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

  validateKnownFields(raw, FLOW_FIELDS[kind], path, findings);
  if (raw.practice !== undefined) validatePractice(raw.practice, `${path}.practice`, findings);

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
    validateKnownFields(item, ["id", "condition", "thenBranch", "practice"], itemPath, findings);
    ["id", "condition"].forEach((fieldName) => {
      if (hasOwn(item, fieldName) && typeof item[fieldName] !== "string") {
        findings.push(`${itemPath}.${fieldName}:expected_string`);
      }
    });
    if (item.practice !== undefined) validatePractice(item.practice, `${itemPath}.practice`, findings);
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
    validateKnownFields(item, ["id", "condition", "items", "practice"], itemPath, findings);
    ["id", "condition"].forEach((fieldName) => {
      if (hasOwn(item, fieldName) && typeof item[fieldName] !== "string") {
        findings.push(`${itemPath}.${fieldName}:expected_string`);
      }
    });
    if (item.practice !== undefined) validatePractice(item.practice, `${itemPath}.practice`, findings);
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
    validateKnownFields(item, ["id", "match", "body", "practice"], itemPath, findings);
    ["id", "match"].forEach((fieldName) => {
      if (hasOwn(item, fieldName) && typeof item[fieldName] !== "string") {
        findings.push(`${itemPath}.${fieldName}:expected_string`);
      }
    });
    if (item.practice !== undefined) validatePractice(item.practice, `${itemPath}.practice`, findings);
    validateStructureNodeList(item.body, `${itemPath}.body`, findings, unsupportedKinds);
  });
}

function validateUniqueFlowNodeIds(rawStructure, findings) {
  const ids = new Map();
  const visit = (raw, path) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    if (id) {
      if (ids.has(id)) findings.push(`${path}.id:duplicate_id`);
      else ids.set(id, path);
    }
    ["items", "thenBranch", "elseBranch", "body", "defaultBranch"].forEach((fieldName) => {
      if (Array.isArray(raw[fieldName])) {
        raw[fieldName].forEach((item, index) => visit(item, `${path}.${fieldName}[${index}]`));
      }
    });
    if (Array.isArray(raw.cases)) {
      raw.cases.forEach((caseValue, caseIndex) => {
        ["thenBranch", "body"].forEach((fieldName) => {
          if (Array.isArray(caseValue?.[fieldName])) {
            caseValue[fieldName].forEach((item, index) => visit(item, `${path}.cases[${caseIndex}].${fieldName}[${index}]`));
          }
        });
      });
    }
    if (Array.isArray(raw.branches)) {
      raw.branches.forEach((branchValue, branchIndex) => {
        if (Array.isArray(branchValue?.items)) {
          branchValue.items.forEach((item, index) => visit(item, `${path}.branches[${branchIndex}].items[${index}]`));
        }
      });
    }
  };
  visit(rawStructure, "root");
}
