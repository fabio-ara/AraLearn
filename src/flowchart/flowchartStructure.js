function clone(value) {
  return structuredClone(value);
}

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
    validateStructureNodeList(item.thenBranch, `${itemPath}.thenBranch`, findings, unsupportedKinds);
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
    validateStructureNodeList(item.body, `${itemPath}.body`, findings, unsupportedKinds);
  });
}

export function convertPublicFlowToStructure(flow) {
  return {
    kind: "sequence",
    id: cleanId("", "flow-root"),
    items: convertPublicFlowList(flow)
  };
}

export function convertStructureToPublicFlow(structure) {
  if (!structure || typeof structure !== "object") {
    return [];
  }

  const rootKind = String(structure.kind || "").trim().toLowerCase();
  const source = rootKind === "sequence" && Array.isArray(structure.items) ? structure.items : [structure];
  return source.map((item) => convertStructureNodeToPublicFlow(item)).filter(Boolean);
}

function convertPublicFlowList(flow) {
  return (Array.isArray(flow) ? flow : [])
    .map((item) => convertPublicFlowItem(item))
    .filter(Boolean);
}

function convertPublicFlowItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return null;
  }

  const practice =
    item.practice && typeof item.practice === "object" && !Array.isArray(item.practice)
      ? clone(item.practice)
      : null;
  const itemId = String(item.id || "").trim() || nextId("flow-item");

  if (Object.prototype.hasOwnProperty.call(item, "start")) {
    return withPractice({ id: itemId, kind: "start", text: String(item.start || "") }, practice);
  }
  if (Object.prototype.hasOwnProperty.call(item, "end")) {
    return withPractice({ id: itemId, kind: "end", text: String(item.end || "") }, practice);
  }
  if (Object.prototype.hasOwnProperty.call(item, "input")) {
    return withPractice({ id: itemId, kind: "input", text: String(item.input || "") }, practice);
  }
  if (Object.prototype.hasOwnProperty.call(item, "output")) {
    return withPractice({ id: itemId, kind: "output", text: String(item.output || "") }, practice);
  }
  if (Object.prototype.hasOwnProperty.call(item, "process")) {
    return withPractice({ id: itemId, kind: "process", text: String(item.process || "") }, practice);
  }
  if (Object.prototype.hasOwnProperty.call(item, "if")) {
    const elseBranch = Array.isArray(item.else) ? convertPublicFlowList(item.else) : [];
    return withPractice(
      {
        id: itemId,
        kind: elseBranch.length ? "if_then_else" : "if_then",
        condition: String(item.if || ""),
        thenBranch: convertPublicFlowList(item.then),
        elseBranch
      },
      practice
    );
  }
  if (Object.prototype.hasOwnProperty.call(item, "chain")) {
    const cases = Array.isArray(item.chain) ? item.chain : [];
    return withPractice(
      {
        id: itemId,
        kind: "if_chain",
        cases: cases.map((caseItem) => {
          const source = caseItem && typeof caseItem === "object" && !Array.isArray(caseItem) ? caseItem : {};
          const casePractice =
            source.practice && typeof source.practice === "object" && !Array.isArray(source.practice)
              ? clone(source.practice)
              : null;
          return withPractice(
            {
              id: String(source.id || "").trim() || nextId("flow-case"),
              condition: String(source.if || ""),
              thenBranch: convertPublicFlowList(source.then)
            },
            casePractice
          );
        }),
        elseBranch: convertPublicFlowList(item.else)
      },
      practice
    );
  }
  if (Object.prototype.hasOwnProperty.call(item, "switch")) {
    const cases = Array.isArray(item.cases) ? item.cases : [];
    return withPractice(
      {
        id: itemId,
        kind: "switch_case",
        expression: String(item.switch || ""),
        cases: cases.map((caseItem) => {
          const source = caseItem && typeof caseItem === "object" && !Array.isArray(caseItem) ? caseItem : {};
          const casePractice =
            source.practice && typeof source.practice === "object" && !Array.isArray(source.practice)
              ? clone(source.practice)
              : null;
          return withPractice(
            {
              id: String(source.id || "").trim() || nextId("flow-case"),
              match: String(source.match || ""),
              body: convertPublicFlowList(source.do)
            },
            casePractice
          );
        }),
        defaultBranch: convertPublicFlowList(item.default)
      },
      practice
    );
  }
  if (Object.prototype.hasOwnProperty.call(item, "while")) {
    return withPractice(
      {
        id: itemId,
        kind: "while",
        condition: String(item.while || ""),
        body: convertPublicFlowList(item.do)
      },
      practice
    );
  }
  if (Object.prototype.hasOwnProperty.call(item, "do_while")) {
    return withPractice(
      {
        id: itemId,
        kind: "do_while",
        condition: String(item.do_while || ""),
        body: convertPublicFlowList(item.do)
      },
      practice
    );
  }
  if (Object.prototype.hasOwnProperty.call(item, "for")) {
    const loop = item.for && typeof item.for === "object" ? item.for : {};
    return withPractice(
      {
        id: itemId,
        kind: "for",
        init: String(loop.init || ""),
        condition: String(loop.condition || ""),
        update: String(loop.update || ""),
        body: convertPublicFlowList(item.do)
      },
      practice
    );
  }

  return null;
}

function convertStructureNodeToPublicFlow(node) {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return null;
  }

  const kind = String(node.kind || "").trim().toLowerCase();
  const practice =
    node.practice && typeof node.practice === "object" && !Array.isArray(node.practice)
      ? clone(node.practice)
      : null;
  const base = node.id ? { id: String(node.id) } : {};

  if (kind === "start") {
    return withPractice({ ...base, start: String(node.text || "") }, practice);
  }
  if (kind === "end") {
    return withPractice({ ...base, end: String(node.text || "") }, practice);
  }
  if (kind === "input") {
    return withPractice({ ...base, input: String(node.text || "") }, practice);
  }
  if (kind === "output") {
    return withPractice({ ...base, output: String(node.text || "") }, practice);
  }
  if (kind === "process") {
    return withPractice({ ...base, process: String(node.text || "") }, practice);
  }
  if (kind === "if_then") {
    return withPractice(
      {
        ...base,
        if: String(node.condition || ""),
        then: convertStructureToPublicFlow({ kind: "sequence", items: node.thenBranch || [] })
      },
      practice
    );
  }
  if (kind === "if_then_else") {
    return withPractice(
      {
        ...base,
        if: String(node.condition || ""),
        then: convertStructureToPublicFlow({ kind: "sequence", items: node.thenBranch || [] }),
        else: convertStructureToPublicFlow({ kind: "sequence", items: node.elseBranch || [] })
      },
      practice
    );
  }
  if (kind === "if_chain") {
    return withPractice(
      {
        ...base,
        chain: (Array.isArray(node.cases) ? node.cases : []).map((caseItem) =>
          withPractice(
            {
              ...(caseItem?.id ? { id: String(caseItem.id) } : {}),
              if: String(caseItem?.condition || ""),
              then: convertStructureToPublicFlow({ kind: "sequence", items: caseItem?.thenBranch || [] })
            },
            caseItem?.practice && typeof caseItem.practice === "object" && !Array.isArray(caseItem.practice)
              ? clone(caseItem.practice)
              : null
          )
        ),
        else: convertStructureToPublicFlow({ kind: "sequence", items: node.elseBranch || [] })
      },
      practice
    );
  }
  if (kind === "switch_case") {
    return withPractice(
      {
        ...base,
        switch: String(node.expression || ""),
        cases: (Array.isArray(node.cases) ? node.cases : []).map((caseItem) =>
          withPractice(
            {
              ...(caseItem?.id ? { id: String(caseItem.id) } : {}),
              match: String(caseItem?.match || ""),
              do: convertStructureToPublicFlow({ kind: "sequence", items: caseItem?.body || [] })
            },
            caseItem?.practice && typeof caseItem.practice === "object" && !Array.isArray(caseItem.practice)
              ? clone(caseItem.practice)
              : null
          )
        ),
        default: convertStructureToPublicFlow({ kind: "sequence", items: node.defaultBranch || [] })
      },
      practice
    );
  }
  if (kind === "while") {
    return withPractice(
      {
        ...base,
        while: String(node.condition || ""),
        do: convertStructureToPublicFlow({ kind: "sequence", items: node.body || [] })
      },
      practice
    );
  }
  if (kind === "do_while") {
    return withPractice(
      {
        ...base,
        do_while: String(node.condition || ""),
        do: convertStructureToPublicFlow({ kind: "sequence", items: node.body || [] })
      },
      practice
    );
  }
  if (kind === "for") {
    return withPractice(
      {
        ...base,
        for: {
          init: String(node.init || ""),
          condition: String(node.condition || ""),
          update: String(node.update || "")
        },
        do: convertStructureToPublicFlow({ kind: "sequence", items: node.body || [] })
      },
      practice
    );
  }

  return null;
}

function withPractice(record, practice) {
  if (practice) {
    return {
      ...record,
      practice
    };
  }
  return record;
}
