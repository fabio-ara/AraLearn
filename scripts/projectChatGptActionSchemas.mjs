function literalType(value) {
  if (value === null) return "null";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return ["string", "boolean"].includes(typeof value) ? typeof value : null;
}

export function actionLiteralSchema(value) {
  const type = literalType(value);
  if (!type) throw new TypeError("O literal público não pode ser projetado para Actions.");
  return { type, enum: [value] };
}

export function forChatGptActionDocumentation(value) {
  if (typeof value === "string") {
    return value
      .replaceAll("cliente MCP conectado", "GPT conectado por Actions")
      .replaceAll("superfície MCP", "superfície de Actions");
  }
  if (Array.isArray(value)) return value.map(forChatGptActionDocumentation);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        forChatGptActionDocumentation(entry)
      ])
    );
  }
  return value;
}

export function forChatGptActionImporter(value) {
  if (Array.isArray(value)) return value.map(forChatGptActionImporter);
  if (!value || typeof value !== "object") return value;
  const ignoresObjectUnion = value.type === "object" &&
    value.properties && typeof value.properties === "object" &&
    Array.isArray(value.oneOf);
  return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) =>
    key === "oneOf" && ignoresObjectUnion
      ? []
      : [[key, forChatGptActionImporter(entry)]]
  ));
}

function own(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function schemaProperties(value) {
  return object(value?.properties) ? value.properties : {};
}

function singleton(value) {
  if (object(value) && own(value, "const")) return value.const;
  if (Array.isArray(value?.enum) && value.enum.length === 1) return value.enum[0];
  return undefined;
}

function forbiddenFields(schema) {
  const values = schema?.not?.anyOf;
  if (!Array.isArray(values)) return [];
  const fields = [];
  for (const value of values) {
    if (!Array.isArray(value?.required) || value.required.length !== 1) return [];
    fields.push(value.required[0]);
  }
  return fields;
}

function collectConditionalRules(root) {
  const visited = new WeakSet();
  const rules = new Set();
  function visit(value) {
    if (!value || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value.allOf)) value.allOf.forEach((rule) => rules.add(rule));
    if (Array.isArray(value)) value.forEach(visit);
    else Object.values(value).forEach(visit);
  }
  visit(root);
  return rules;
}

export const ACTION_SCHEMA_RULE_CATEGORIES = Object.freeze({
  REDUNDANT: "redundant",
  DOCUMENTATION_ONLY: "documentation_only",
  REQUIRED: "required"
});

function projectionContext(root) {
  const expected = collectConditionalRules(root);
  const consumed = new Set();
  const classifications = new Map();
  return {
    consume(node, path, {
      category = ACTION_SCHEMA_RULE_CATEGORIES.REQUIRED,
      reason = "Condição necessária para construir uma chamada válida."
    } = {}) {
      if (!Array.isArray(node?.allOf)) {
        throw new TypeError(`A projeção esperava allOf em ${path}.`);
      }
      if (!Object.values(ACTION_SCHEMA_RULE_CATEGORIES).includes(category)) {
        throw new TypeError(`A classificação ${category} em ${path} é inválida.`);
      }
      node.allOf.forEach((rule) => {
        const previous = classifications.get(rule);
        if (previous && previous.category !== category) {
          throw new TypeError(`A regra compartilhada em ${path} recebeu classificações divergentes.`);
        }
        consumed.add(rule);
        classifications.set(rule, previous || { path, category, reason });
      });
      return node.allOf;
    },
    assertComplete() {
      const missing = [...expected].filter((rule) => !consumed.has(rule));
      if (missing.length) {
        throw new TypeError(
          `A projeção de Actions deixou ${missing.length} regra(s) allOf sem compilação.`
        );
      }
    },
    report() {
      return [...expected].map((rule) => {
        const classification = classifications.get(rule);
        if (!classification) {
          throw new TypeError("Uma regra allOf pública ficou sem classificação.");
        }
        return { ...classification };
      });
    }
  };
}

function conditionMatches(schema, values, present = new Set(Object.keys(values))) {
  if (!object(schema)) return true;
  if (Array.isArray(schema.required) &&
      !schema.required.every((field) => present.has(field))) return false;
  if (own(schema, "const") && values !== schema.const) return false;
  if (Array.isArray(schema.enum) && !schema.enum.includes(values)) return false;
  if (object(schema.properties)) {
    for (const [field, child] of Object.entries(schema.properties)) {
      if (!present.has(field)) continue;
      const childValue = values?.[field];
      const childPresent = object(childValue)
        ? new Set(Object.keys(childValue))
        : new Set();
      if (!conditionMatches(child, childValue, childPresent)) return false;
    }
  }
  if (Array.isArray(schema.anyOf) &&
      !schema.anyOf.some((entry) => conditionMatches(entry, values, present))) return false;
  if (Array.isArray(schema.oneOf) &&
      schema.oneOf.filter((entry) => conditionMatches(entry, values, present)).length !== 1) {
    return false;
  }
  if (object(schema.not) && conditionMatches(schema.not, values, present)) return false;
  return true;
}

function freshState(node) {
  return {
    allowed: new Set(Object.keys(schemaProperties(node))),
    required: new Set(Array.isArray(node.required) ? node.required : []),
    overrides: new Map(),
    extras: {},
    nested: []
  };
}

function copyState(source) {
  return {
    allowed: new Set(source.allowed),
    required: new Set(source.required),
    overrides: new Map([...source.overrides].map(([key, value]) => [key, { ...value }])),
    extras: { ...source.extras },
    nested: [...source.nested]
  };
}

function mergeOverride(state, field, value) {
  state.overrides.set(field, { ...value, ...(state.overrides.get(field) || {}) });
}

function applyConstraint(state, constraint, values, present, path) {
  if (!object(constraint)) return;
  if (object(constraint.if)) {
    const selected = conditionMatches(constraint.if, values, present)
      ? constraint.then
      : constraint.else;
    applyConstraint(state, selected, values, present, `${path}.conditional`);
  }
  if (Array.isArray(constraint.required)) {
    constraint.required.forEach((field) => state.required.add(field));
  }
  for (const field of forbiddenFields(constraint)) state.allowed.delete(field);
  if (object(constraint.properties)) {
    for (const [field, value] of Object.entries(constraint.properties)) {
      mergeOverride(state, field, value);
    }
  }
  if (Array.isArray(constraint.anyOf)) {
    if (state.extras.anyOf) throw new TypeError(`Há dois anyOf conjuntivos em ${path}.`);
    state.extras.anyOf = constraint.anyOf;
  }
  if (Array.isArray(constraint.oneOf)) {
    if (state.extras.oneOf) throw new TypeError(`Há dois oneOf conjuntivos em ${path}.`);
    state.extras.oneOf = constraint.oneOf;
  }
  if (Array.isArray(constraint.allOf)) state.nested.push(constraint);
}

function stateFor(node, rules, values, present, path) {
  const state = freshState(node);
  for (const [index, rule] of rules.entries()) {
    const selected = conditionMatches(rule.if, values, present) ? rule.then : rule.else;
    applyConstraint(state, selected, values, present, `${path}.allOf.${index}`);
  }
  return state;
}

function withLiteral(state, field, value, { required = true } = {}) {
  const next = copyState(state);
  next.allowed.add(field);
  next.overrides.set(field, actionLiteralSchema(value));
  if (required) next.required.add(field);
  return next;
}

function withoutFields(state, fields) {
  const next = copyState(state);
  fields.forEach((field) => {
    next.allowed.delete(field);
    next.required.delete(field);
    next.overrides.delete(field);
  });
  return next;
}

function requiring(state, fields) {
  const next = copyState(state);
  fields.forEach((field) => next.required.add(field));
  return next;
}

function nonStructuralEntries(node) {
  return Object.entries(node).filter(([key]) => ![
    "allOf", "properties", "required", "$defs", "oneOf", "anyOf"
  ].includes(key));
}

function buildObjectVariant(node, state, context, path) {
  const properties = {};
  const sourceProperties = schemaProperties(node);
  for (const field of state.allowed) {
    if (!own(sourceProperties, field)) continue;
    const source = state.overrides.has(field)
      ? { ...sourceProperties[field], ...state.overrides.get(field) }
      : sourceProperties[field];
    properties[field] = projectNode(source, context, `${path}.properties.${field}`);
  }
  const required = [...state.required].filter((field) => own(properties, field));
  const result = Object.fromEntries(nonStructuralEntries(node).map(
    ([key, value]) => [key, projectNode(value, context, `${path}.${key}`)]
  ));
  result.type = "object";
  result.additionalProperties = false;
  result.properties = properties;
  result.required = required;
  for (const [key, value] of Object.entries(state.extras)) {
    result[key] = projectNode(value, context, `${path}.${key}`);
  }
  return result;
}

function buildConstraintVariant(node, state, context, path) {
  const properties = {};
  for (const [field, value] of state.overrides) {
    properties[field] = projectNode(value, context, `${path}.properties.${field}`);
  }
  const forbidden = Object.keys(schemaProperties(node)).filter((field) => !state.allowed.has(field));
  const result = {
    properties,
    required: [...state.required]
  };
  if (forbidden.length) {
    result.not = { anyOf: forbidden.map((field) => ({ required: [field] })) };
  }
  for (const [key, value] of Object.entries(state.extras)) {
    result[key] = projectNode(value, context, `${path}.${key}`);
  }
  return result;
}

function projectConditionalBase(node, context, path, variants) {
  const result = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "allOf") continue;
    result[key] = projectNode(value, context, `${path}.${key}`);
  }
  result.oneOf = variants;
  return result;
}

function allOfDiscriminator(rule, field) {
  return singleton(rule?.if?.properties?.[field]);
}

function projectSetParameter(node, context, path) {
  const rules = context.consume(node, path);
  const modes = node.properties.mode.enum;
  const parameterIds = node.properties.parameterId.enum;
  const variants = [];
  for (const mode of modes) {
    for (const parameterId of parameterIds) {
      const values = { mode, parameterId };
      const present = new Set(Object.keys(values));
      let state = stateFor(node, rules, values, present, path);
      state = withLiteral(state, "mode", mode);
      state = withLiteral(state, "parameterId", parameterId);
      variants.push(buildConstraintVariant(
        node,
        state,
        context,
        `${path}.${mode}.${parameterId}`
      ));
    }
  }
  return projectConditionalBase(node, context, path, variants);
}

function projectEnumConditionalObject(node, context, path, field) {
  const rules = context.consume(node, path);
  const values = node.properties[field].enum;
  const variants = values.map((value) => {
      const assignment = { [field]: value };
      let state = stateFor(node, rules, assignment, new Set([field]), path);
      state = withLiteral(state, field, value);
      return buildConstraintVariant(node, state, context, `${path}.${value}`);
    });
  return projectConditionalBase(node, context, path, variants);
}

function redundantSourceLinkConditional(node) {
  if (!node.properties?.relation || !node.properties?.anchors || node.allOf?.length !== 1) {
    return false;
  }
  const requiredMinimum = node.allOf[0]?.then?.properties?.anchors?.minItems;
  return Number.isInteger(requiredMinimum) &&
    Number(node.properties.anchors.minItems) >= requiredMinimum;
}

function projectKnownConditionalObject(node, context, path) {
  if (redundantSourceLinkConditional(node)) {
    context.consume(node, path, {
      category: ACTION_SCHEMA_RULE_CATEGORIES.REDUNDANT,
      reason: "anchors já exige ao menos um item para qualquer relação."
    });
    const clone = { ...node };
    delete clone.allOf;
    return projectNode(clone, context, `${path}.redundant`);
  }
  if (node.properties?.parameterId && node.properties?.value && node.properties?.mode) {
    return projectSetParameter(node, context, path);
  }
  if (node.properties?.availability && node.properties?.allowedRefs) {
    return projectEnumConditionalObject(node, context, path, "availability");
  }
  if (node.properties?.studyVisibility && node.properties?.citationText) {
    return projectEnumConditionalObject(node, context, path, "studyVisibility");
  }
  if (node.properties?.responseKind && node.properties?.consideredSourceLinks) {
    return projectEnumConditionalObject(node, context, path, "responseKind");
  }
  if (node.properties?.kind && node.properties?.targetDidacticMicrosequenceId &&
      node.properties?.productionPosition) {
    return projectEnumConditionalObject(node, context, path, "kind");
  }
  if (node.properties?.kind && node.properties?.id && node.allOf?.length === 2) {
    return projectEnumConditionalObject(node, context, path, "kind");
  }
  if (node.properties?.operation && node.properties?.authoringPartId &&
      node.properties?.materializationId && node.properties?.expectedMaterializationVersion) {
    const rules = context.consume(node, path);
    return {
      oneOf: node.properties.operation.enum.map((operation) => {
        let state = stateFor(
          node,
          rules,
          { operation },
          new Set(["operation"]),
          `${path}.${operation}`
        );
        state = withLiteral(state, "operation", operation);
        return buildObjectVariant(node, state, context, `${path}.${operation}`);
      })
    };
  }
  throw new TypeError(`O allOf público em ${path} não possui projeção Action-safe.`);
}

function flattenProjectedUnion(entries) {
  return entries.flatMap((entry) => {
    if (object(entry) && Array.isArray(entry.oneOf) && Object.keys(entry).length === 1) {
      return entry.oneOf;
    }
    return [entry];
  });
}

function projectNode(value, context, path) {
  if (Array.isArray(value)) {
    return value.map((entry, index) => projectNode(entry, context, `${path}.${index}`));
  }
  if (!object(value)) return value;
  if (Array.isArray(value.allOf)) {
    return projectKnownConditionalObject(value, context, path);
  }
  const result = {};
  const literal = own(value, "const") ? value.const : undefined;
  for (const [key, entry] of Object.entries(value)) {
    if (key === "const" && literalType(literal)) continue;
    if (key === "oneOf") {
      result.oneOf = flattenProjectedUnion(entry.map(
        (branch, index) => projectNode(branch, context, `${path}.oneOf.${index}`)
      ));
    } else {
      result[key] = projectNode(entry, context, `${path}.${key}`);
    }
  }
  if (own(value, "const") && literalType(literal)) {
    result.type ??= literalType(literal);
    result.enum = [literal];
  }
  return result;
}

function topLevelOperationState(node, rules, operation, path) {
  const values = { operation };
  const present = new Set(["operation"]);
  let state = stateFor(node, rules, values, present, path);
  state = withLiteral(state, "operation", operation);
  return state;
}

function commandDiscriminatorTypes(schema, path) {
  if (!Array.isArray(schema?.oneOf)) {
    throw new TypeError(`O comando público em ${path} não declara variantes oneOf.`);
  }
  const values = schema.oneOf.map((branch) => singleton(branch.properties?.type));
  if (values.some((value) => value === undefined) || new Set(values).size !== values.length) {
    throw new TypeError(`As variantes de ${path} precisam de type literal exclusivo.`);
  }
  return values;
}

function subsetCommandSchema(schema, allowed, context, path) {
  const branches = schema.oneOf.filter((branch) => allowed.has(singleton(branch.properties?.type)));
  if (!branches.length) throw new TypeError(`Nenhum comando público corresponde a ${path}.`);
  return {
    oneOf: flattenProjectedUnion(branches.map(
      (branch, index) => projectNode(branch, context, `${path}.${index}`)
    ))
  };
}

function nestedCommandField(node, state, rules, path) {
  const candidates = new Set();
  for (const rule of rules) {
    for (const field of Object.keys(rule?.if?.properties || {})) {
      if (rule.if.properties[field]?.properties?.type &&
          Array.isArray(node.properties?.[field]?.oneOf) &&
          state.allowed.has(field)) {
        candidates.add(field);
      }
    }
  }
  if (candidates.size !== 1) {
    throw new TypeError(`A condição aninhada em ${path} não discrimina um único comando.`);
  }
  return [...candidates][0];
}

function commandStateSignature(state, commandField) {
  return JSON.stringify({
    allowed: [...state.allowed].sort(),
    required: [...state.required].sort(),
    overrides: [...state.overrides]
      .filter(([field]) => field !== commandField)
      .sort(([left], [right]) => left.localeCompare(right)),
    extras: state.extras
  });
}

function projectNestedCommandOperation(node, baseState, conditional, context, path) {
  const rules = context.consume(conditional, path);
  const commandField = nestedCommandField(node, baseState, rules, path);
  const sourceCommandSchema = node.properties[commandField];
  const commandTypes = commandDiscriminatorTypes(sourceCommandSchema, `${path}.${commandField}`);
  const groups = new Map();
  for (const commandType of commandTypes) {
    const values = { [commandField]: { type: commandType } };
    const present = new Set([commandField]);
    const state = copyState(baseState);
    state.nested = [];
    for (const [index, rule] of rules.entries()) {
      const selected = conditionMatches(rule.if, values, present) ? rule.then : rule.else;
      applyConstraint(state, selected, values, present, `${path}.${commandType}.${index}`);
    }
    if (state.nested.length) {
      throw new TypeError(`O comando ${commandType} em ${path} possui condição não projetada.`);
    }
    const signature = commandStateSignature(state, commandField);
    if (!groups.has(signature)) groups.set(signature, { state, commandTypes: [] });
    groups.get(signature).commandTypes.push(commandType);
  }
  return [...groups.values()].map(({ state, commandTypes: groupedTypes }, index) => {
    const grouped = copyState(state);
    grouped.overrides.set(commandField, subsetCommandSchema(
      sourceCommandSchema,
      new Set(groupedTypes),
      context,
      `${path}.${commandField}.${index}`
    ));
    return buildObjectVariant(node, grouped, context, `${path}.group-${index}`);
  });
}

function projectChangeSchema(node, context, path) {
  const rules = context.consume(node, path);
  const operations = node.properties.operation.enum;
  const branches = [];
  for (const operation of operations) {
    let state = topLevelOperationState(node, rules, operation, path);
    const nested = state.nested;
    state.nested = [];
    if (!nested.length) {
      branches.push(buildObjectVariant(node, state, context, `${path}.${operation}`));
      continue;
    }
    if (nested.length !== 1) {
      throw new TypeError(`A operação ${operation} possui condição aninhada não projetada.`);
    }
    branches.push(...projectNestedCommandOperation(
      node,
      state,
      nested[0],
      context,
      `${path}.${operation}`
    ));
  }
  const result = { oneOf: branches };
  if (object(node.$defs)) result.$defs = projectNode(node.$defs, context, `${path}.$defs`);
  return result;
}

function targetKindVariants(node, baseState, context, path, {
  requireMode = null,
  conditionalRules = []
} = {}) {
  const targetSchema = baseState.overrides.get("targetKind") || node.properties.targetKind;
  const targetKinds = targetSchema.enum;
  if (!Array.isArray(targetKinds) || !targetKinds.length) {
    throw new TypeError(`O vocabulário de alvo em ${path} está vazio.`);
  }
  const groups = new Map();
  for (const targetKind of targetKinds) {
    let state = copyState(baseState);
    for (const rule of conditionalRules) {
      for (const constraint of [rule.then, rule.else]) {
        for (const field of Object.keys(constraint?.properties || {})) {
          state.overrides.delete(field);
        }
      }
    }
    const values = { targetKind };
    const present = new Set(["targetKind"]);
    for (const rule of conditionalRules) {
      applyConstraint(
        state,
        conditionMatches(rule.if, values, present) ? rule.then : rule.else,
        values,
        present,
        `${path}.${targetKind}.constraint`
      );
    }
    state = requiring(state, ["targetKind", "targetId"]);
    if (requireMode !== null) state = withLiteral(state, "mode", requireMode);
    const signature = JSON.stringify({
      targetId: state.overrides.get("targetId") || null,
      allowed: [...state.allowed].sort(),
      required: [...state.required].sort()
    });
    if (!groups.has(signature)) groups.set(signature, { state, targetKinds: [] });
    groups.get(signature).targetKinds.push(targetKind);
  }
  return [...groups.values()].map(({ state, targetKinds: groupedKinds }, index) => {
    const grouped = copyState(state);
    grouped.overrides.set("targetKind", {
      type: "string",
      enum: groupedKinds
    });
    return buildObjectVariant(node, grouped, context, `${path}.group-${index}`);
  });
}

function projectCourseSourcesView(node, baseState, conditional, context, path) {
  const rules = context.consume(conditional, path);
  const sourceRule = rules.find((rule) => allOfDiscriminator(rule, "mode") === "source");
  const targetRule = rules.find((rule) => allOfDiscriminator(rule, "mode") === "target");
  if (!sourceRule || !targetRule) throw new TypeError("Os modos de Fontes estão incompletos.");
  const inner = sourceRule.then;
  context.consume(inner, `${path}.source-pair`);
  const targetKindRules = rules.filter((rule) =>
    JSON.stringify(rule.if || {}).includes('"targetKind"')
  );
  const modes = (baseState.overrides.get("mode") || node.properties.mode).enum;
  const branches = [];
  for (const mode of modes) {
    const values = { mode };
    let state = copyState(baseState);
    for (const rule of rules) {
      applyConstraint(
        state,
        conditionMatches(rule.if, values, new Set(["mode"])) ? rule.then : rule.else,
        values,
        new Set(["mode"]),
        `${path}.${mode}`
      );
    }
    state.nested = [];
    state = withLiteral(state, "mode", mode);
    if (mode === allOfDiscriminator(sourceRule, "mode")) {
      branches.push(buildObjectVariant(
        node,
        withoutFields(state, ["targetKind", "targetId"]),
        context,
        `${path}.${mode}.plain`
      ));
      let contextual = requiring(state, ["targetKind", "targetId"]);
      contextual = withoutFields(contextual, ["cursor"]);
      branches.push(...targetKindVariants(node, contextual, context, `${path}.${mode}.target`, {
        requireMode: mode,
        conditionalRules: targetKindRules
      }));
    } else if (mode === allOfDiscriminator(targetRule, "mode")) {
      branches.push(...targetKindVariants(node, state, context, `${path}.${mode}`, {
        requireMode: mode,
        conditionalRules: targetKindRules
      }));
    } else {
      branches.push(buildObjectVariant(node, state, context, `${path}.${mode}`));
    }
  }
  const defaultValues = {};
  let defaultState = copyState(baseState);
  for (const rule of rules) {
    applyConstraint(
      defaultState,
      conditionMatches(rule.if, defaultValues, new Set()) ? rule.then : rule.else,
      defaultValues,
      new Set(),
      `${path}.default`
    );
  }
  defaultState.nested = [];
  branches.push(buildObjectVariant(
    node,
    withoutFields(defaultState, ["mode"]),
    context,
    `${path}.default`
  ));
  return branches;
}

function projectAnnotationsView(node, baseState, conditional, context, path) {
  const rules = context.consume(conditional, path);
  const modes = (baseState.overrides.get("mode") || node.properties.mode).enum;
  const detailRule = rules.find((rule) => allOfDiscriminator(rule, "mode") === "detail");
  const targetRule = rules.find((rule) => allOfDiscriminator(rule, "mode") === "target");
  if (!detailRule || !targetRule) throw new TypeError("Os modos de Observações estão incompletos.");
  const branches = [];
  const buildMode = (mode, present) => {
    const values = present ? { mode } : {};
    const presence = new Set(Object.keys(values));
    let state = copyState(baseState);
    for (const rule of rules) {
      applyConstraint(
        state,
        conditionMatches(rule.if, values, presence) ? rule.then : rule.else,
        values,
        presence,
        `${path}.${present ? mode : "default"}`
      );
    }
    state = present ? withLiteral(state, "mode", mode) : withoutFields(state, ["mode"]);
    if (mode === allOfDiscriminator(detailRule, "mode")) {
      branches.push(buildObjectVariant(node, state, context, `${path}.${mode}`));
      return;
    }
    if (mode !== allOfDiscriminator(targetRule, "mode")) {
      branches.push(buildObjectVariant(
        node,
        withoutFields(state, ["targetKind", "targetId", "includeDescendants"]),
        context,
        `${path}.${present ? mode : "default"}.plain`
      ));
    }
    branches.push(...targetKindVariants(node, state, context, `${path}.${present ? mode : "default"}.target`, {
      requireMode: present ? mode : null,
      conditionalRules: rules.filter((rule) =>
        JSON.stringify(rule.if || {}).includes('"targetKind"')
      )
    }));
  };
  modes.forEach((mode) => buildMode(mode, true));
  const defaultMode = modes.find((mode) =>
    mode !== allOfDiscriminator(detailRule, "mode") &&
    mode !== allOfDiscriminator(targetRule, "mode")
  );
  if (!defaultMode) throw new TypeError("O modo padrão de Observações não está definido.");
  buildMode(defaultMode, false);
  return branches;
}

function projectAuditView(node, baseState, conditional, context, path) {
  const rules = context.consume(conditional, path);
  const modes = (baseState.overrides.get("mode") || node.properties.mode).enum;
  const branches = [];
  for (const mode of modes) {
    const values = { mode };
    const present = new Set(["mode"]);
    let state = copyState(baseState);
    const matchingRule = rules.find((rule) => allOfDiscriminator(rule, "mode") === mode);
    if (!matchingRule) throw new TypeError(`O modo de auditoria ${mode} não possui regra.`);
    for (const rule of rules) {
      applyConstraint(
        state,
        conditionMatches(rule.if, values, present) ? rule.then : rule.else,
        values,
        present,
        `${path}.${mode}`
      );
    }
    state = withLiteral(state, "mode", mode);
    if (matchingRule.then?.allOf) {
      context.consume(matchingRule.then, `${path}.${mode}.annotations`);
      const withoutAnnotations = withoutFields(state, ["annotationIds", "includeObservationText"]);
      withoutAnnotations.nested = [];
      branches.push(buildObjectVariant(node, withoutAnnotations, context, `${path}.${mode}.plain`));
      let withAnnotations = requiring(state, ["annotationIds", "includeObservationText"]);
      withAnnotations.nested = [];
      branches.push(buildObjectVariant(node, withAnnotations, context, `${path}.${mode}.annotations`));
    } else if (Array.isArray(matchingRule.then?.oneOf)) {
      for (const [index, detail] of matchingRule.then.oneOf.entries()) {
        let detailState = copyState(state);
        delete detailState.extras.oneOf;
        applyConstraint(detailState, detail, values, present, `${path}.${mode}.detail.${index}`);
        branches.push(buildObjectVariant(node, detailState, context, `${path}.${mode}.${index}`));
      }
    } else {
      branches.push(buildObjectVariant(node, state, context, `${path}.${mode}`));
    }
  }
  return branches;
}

function projectMutuallyExclusiveReadView(node, baseState, conditional, context, path) {
  const rules = context.consume(conditional, path);
  let state = copyState(baseState);
  state.nested = [];
  let exclusiveFields = null;
  for (const [index, rule] of rules.entries()) {
    if (Array.isArray(rule?.not?.required) && rule.not.required.length === 2) {
      if (exclusiveFields) {
        throw new TypeError(`A vista ${path} possui mais de um par mutuamente exclusivo.`);
      }
      exclusiveFields = [...rule.not.required];
      continue;
    }
    applyConstraint(state, rule, {}, new Set(), `${path}.${index}`);
  }
  if (!exclusiveFields || exclusiveFields.some((field) => !state.allowed.has(field))) {
    throw new TypeError(`A vista ${path} não declara o par mutuamente exclusivo esperado.`);
  }
  const [left, right] = exclusiveFields;
  return [
    buildObjectVariant(node, withoutFields(state, exclusiveFields), context, `${path}.plain`),
    buildObjectVariant(
      node,
      requiring(withoutFields(state, [right]), [left]),
      context,
      `${path}.${left}`
    ),
    buildObjectVariant(
      node,
      requiring(withoutFields(state, [left]), [right]),
      context,
      `${path}.${right}`
    )
  ];
}

function projectReadSchema(node, context, path) {
  const rules = context.consume(node, path);
  const views = node.properties.view.enum;
  const branches = [];
  for (const view of views) {
    const values = { view };
    let state = stateFor(node, rules, values, new Set(["view"]), `${path}.${view}`);
    state = withLiteral(state, "view", view);
    if (!state.nested.length) {
      branches.push(buildObjectVariant(node, state, context, `${path}.${view}`));
    } else {
      if (state.nested.length !== 1) {
        throw new TypeError(`A vista ${view} possui condicionais aninhadas inesperadas.`);
      }
      const [conditional] = state.nested;
      state.nested = [];
      if (view === "course_sources") {
        branches.push(...projectCourseSourcesView(node, state, conditional, context, `${path}.${view}`));
      } else if (view === "anchored_annotations") {
        branches.push(...projectAnnotationsView(node, state, conditional, context, `${path}.${view}`));
      } else if (view === "audit_cycle") {
        branches.push(...projectAuditView(node, state, conditional, context, `${path}.${view}`));
      } else if (view === "study_units") {
        branches.push(...projectMutuallyExclusiveReadView(
          node,
          state,
          conditional,
          context,
          `${path}.${view}`
        ));
      } else {
        throw new TypeError(`A vista ${view} não possui projetor aninhado.`);
      }
    }
  }
  let defaultState = stateFor(node, rules, {}, new Set(), `${path}.default`);
  defaultState = withoutFields(defaultState, ["view"]);
  branches.push(buildObjectVariant(node, defaultState, context, `${path}.default`));
  return { oneOf: branches };
}

function projectComponentsSchema(node, context, path) {
  if (!Array.isArray(node.allOf)) {
    return projectNode(node, context, path);
  }
  const rules = context.consume(node, path);
  const operations = node.properties.operation.enum;
  const branches = [];
  for (const operation of operations) {
    const values = { operation };
    let state = stateFor(node, rules, values, new Set(["operation"]), `${path}.${operation}`);
    state = withLiteral(state, "operation", operation);
    if (!state.nested.length) {
      branches.push(buildObjectVariant(node, state, context, `${path}.${operation}`));
      continue;
    }
    if (state.nested.length !== 1) {
      throw new TypeError(`A operação de componentes ${operation} possui condição inesperada.`);
    }
    const [targetPair] = state.nested;
    context.consume(targetPair, `${path}.${operation}.target`);
    const withoutTarget = withoutFields(state, ["courseId", "studyUnitId"]);
    withoutTarget.nested = [];
    branches.push(buildObjectVariant(node, withoutTarget, context, `${path}.${operation}.plain`));
    const withTarget = requiring(state, ["courseId", "studyUnitId"]);
    withTarget.nested = [];
    branches.push(buildObjectVariant(node, withTarget, context, `${path}.${operation}.target`));
  }
  return { oneOf: branches };
}

function schemaIdentity(value) {
  if (Array.isArray(value)) return `[${value.map(schemaIdentity).join(",")}]`;
  if (!object(value)) return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${schemaIdentity(value[key])}`
  ).join(",")}}`;
}

function uniqueSchemas(values) {
  return [...new Map(values.map((value) => [schemaIdentity(value), value])).values()];
}

function commonValue(schemas, field) {
  const values = schemas.map((schema) => schema[field]);
  return values.every((value) => value !== undefined &&
      schemaIdentity(value) === schemaIdentity(values[0]))
    ? values[0]
    : undefined;
}

function scalarSurface(schemas) {
  const type = schemas[0].type;
  const result = { type };
  if (schemas.every((schema) => Array.isArray(schema.enum))) {
    result.enum = [...new Set(schemas.flatMap((schema) => schema.enum))];
  }
  for (const field of ["format", "pattern"]) {
    const value = commonValue(schemas, field);
    if (value !== undefined) result[field] = value;
  }
  for (const field of ["minimum", "minLength", "minItems"]) {
    const values = schemas.map((schema) => schema[field]);
    if (values.every(Number.isFinite)) result[field] = Math.min(...values);
  }
  for (const field of ["maximum", "maxLength", "maxItems"]) {
    const values = schemas.map((schema) => schema[field]);
    if (values.every(Number.isFinite)) result[field] = Math.max(...values);
  }
  for (const field of ["uniqueItems"]) {
    const value = commonValue(schemas, field);
    if (value !== undefined) result[field] = value;
  }
  const description = commonValue(schemas, "description");
  if (description !== undefined) result.description = description;
  return result;
}

function branchDiscriminator(branches) {
  for (const field of [
    "operation", "view", "type", "entityType", "mode", "responseKind", "availability", "kind"
  ]) {
    const values = branches.map((branch) => singleton(branch.properties?.[field]));
    if (new Set(values.filter((value) => value !== undefined)).size > 1) {
      return { field, values };
    }
  }
  return null;
}

function mergedForbiddenNot(...values) {
  const constraints = values.filter(Boolean);
  if (!constraints.length) return null;
  const entries = constraints.flatMap((constraint) => {
    if (!Array.isArray(constraint?.anyOf) || forbiddenFields({ not: constraint }).length === 0) {
      throw new TypeError("A variante aninhada contém uma proibição não projetável.");
    }
    return constraint.anyOf;
  });
  return { anyOf: entries };
}

function effectiveObjectBranch(branch) {
  const forbidden = forbiddenFields(branch);
  if (!forbidden.length) return branch;
  const properties = { ...schemaProperties(branch) };
  forbidden.forEach((field) => delete properties[field]);
  const result = {
    ...branch,
    properties,
    required: (branch.required || []).filter((field) => !forbidden.includes(field))
  };
  delete result.not;
  return result;
}

function mergeObjectVariantConstraint(branch, constraint, path) {
  const unsupported = Object.keys(constraint).filter((key) =>
    !["properties", "required", "not"].includes(key)
  );
  if (unsupported.length) {
    throw new TypeError(`A variante aninhada em ${path} usa ${unsupported[0]} sem projeção.`);
  }
  const result = {
    ...branch,
    properties: Object.fromEntries([...new Set([
      ...Object.keys(schemaProperties(branch)),
      ...Object.keys(schemaProperties(constraint))
    ])].map((field) => [
      field,
      (() => {
        const base = schemaProperties(branch)[field] || {};
        const narrowed = schemaProperties(constraint)[field] || {};
        const result = { ...base, ...narrowed };
        if (Array.isArray(base.anyOf) &&
            (narrowed.type || narrowed.$ref || Array.isArray(narrowed.anyOf))) {
          delete result.anyOf;
        }
        return result;
      })()
    ])),
    required: [...new Set([...(branch.required || []), ...(constraint.required || [])])]
  };
  delete result.oneOf;
  const not = mergedForbiddenNot(branch.not, constraint.not);
  if (not) result.not = not;
  else delete result.not;
  return effectiveObjectBranch(result);
}

function expandNestedObjectVariants(branch, path) {
  if (!Array.isArray(branch?.oneOf) || !object(branch.properties)) {
    return [effectiveObjectBranch(branch)];
  }
  return branch.oneOf.flatMap((constraint, index) =>
    expandNestedObjectVariants(
      mergeObjectVariantConstraint(branch, constraint, `${path}.oneOf.${index}`),
      `${path}.oneOf.${index}`
    )
  );
}

function branchEnumQualifier(value, branch, matching, discriminator) {
  const qualifiers = [`${discriminator.field}=${value}`];
  const fields = new Set(matching.flatMap((candidate) =>
    Object.keys(schemaProperties(candidate))
  ));
  fields.delete(discriminator.field);
  for (const field of fields) {
    const variants = matching.map((candidate) => {
      const values = schemaProperties(candidate)[field]?.enum;
      return Array.isArray(values) && values.length <= 16 ? values : null;
    });
    const signatures = new Set(variants.map((values) => JSON.stringify(values)));
    const current = schemaProperties(branch)[field]?.enum;
    if (signatures.size > 1 && Array.isArray(current) && current.length <= 16) {
      qualifiers.push(`${field}=${current.join("|")}`);
    }
  }
  return qualifiers.join(", ");
}

function branchQualifier(value, branch, matching, discriminator) {
  const qualifiers = [branchEnumQualifier(value, branch, matching, discriminator)];
  const fields = new Set(matching.flatMap((candidate) =>
    Object.keys(schemaProperties(candidate))
  ));
  fields.delete(discriminator.field);
  const enumSignature = (candidate) => {
    return branchEnumQualifier(value, candidate, matching, discriminator);
  };
  const currentSignature = enumSignature(branch);
  if (matching.filter((candidate) => enumSignature(candidate) === currentSignature).length > 1) {
    const varyingRequired = new Set(matching.flatMap((candidate) => candidate.required || []));
    for (const field of varyingRequired) {
      const presence = new Set(matching.map((candidate) => candidate.required?.includes(field)));
      if (presence.size > 1 && branch.required?.includes(field)) qualifiers.push(`com ${field}`);
    }
  }
  return qualifiers.join(", ");
}

function exclusiveRequiredAlternativeDescriptions(groups, property, discriminator) {
  const descriptions = [];
  for (const [value, matching] of groups) {
    const byContext = new Map();
    for (const branch of matching) {
      const context = branchEnumQualifier(value, branch, matching, discriminator);
      if (!byContext.has(context)) byContext.set(context, []);
      byContext.get(context).push(branch);
    }
    for (const [context, alternatives] of byContext) {
      if (alternatives.length < 2) continue;
      const requiredFields = new Set(alternatives.flatMap((branch) => branch.required || []));
      const varying = [...requiredFields].filter((field) => {
        const values = alternatives.map((branch) => branch.required?.includes(field) === true);
        return values.some(Boolean) && values.some((entry) => !entry);
      });
      if (varying.length < 2 || !varying.includes(property)) continue;
      if (!alternatives.every((branch) =>
        varying.filter((field) => branch.required?.includes(field)).length === 1
      )) continue;
      if (!varying.every((field) =>
        alternatives.some((branch) => branch.required?.includes(field))
      )) continue;
      const fields = varying.map((field) => `\`${field}\``);
      descriptions.push(
        `Em \`${context}\`, envie exatamente um de ${fields.slice(0, -1).join(", ")} ou ${fields.at(-1)}; não envie mais de um.`
      );
    }
  }
  return [...new Set(descriptions)];
}

function validationSchemaIdentity(value) {
  if (Array.isArray(value)) return `[${value.map(validationSchemaIdentity).join(",")}]`;
  if (!object(value)) return JSON.stringify(value);
  return `{${Object.keys(value).filter((key) => key !== "description").sort().map((key) =>
    `${JSON.stringify(key)}:${validationSchemaIdentity(value[key])}`
  ).join(",")}}`;
}

function schemaForm(schema) {
  if (!object(schema)) return "valor JSON";
  if (typeof schema.$ref === "string") {
    const bounds = [
      Number.isFinite(schema.minItems) ? `mínimo ${schema.minItems}` : null,
      Number.isFinite(schema.maxItems) ? `máximo ${schema.maxItems}` : null
    ].filter(Boolean).join(", ");
    return `schema ${schema.$ref.split("/").at(-1)}${bounds ? ` (${bounds})` : ""}`;
  }
  if (schema.type === "integer" || schema.type === "number") {
    if (Array.isArray(schema.enum)) {
      return `${schema.type === "integer" ? "inteiro" : "número"} ${schema.enum.join(" | ")}`;
    }
    const bounds = [
      Number.isFinite(schema.minimum) ? `mínimo ${schema.minimum}` : null,
      Number.isFinite(schema.maximum) ? `máximo ${schema.maximum}` : null
    ].filter(Boolean).join(", ");
    return `${schema.type === "integer" ? "inteiro" : "número"}${bounds ? ` (${bounds})` : ""}`;
  }
  if (schema.type === "array") {
    const bounds = [
      Number.isFinite(schema.minItems) ? `mínimo ${schema.minItems}` : null,
      Number.isFinite(schema.maxItems) ? `máximo ${schema.maxItems}` : null
    ].filter(Boolean).join(", ");
    return `lista${bounds ? ` (${bounds})` : ""} de ${schemaForm(schema.items)}`;
  }
  if (schema.type === "object") {
    const required = Array.isArray(schema.required) && schema.required.length
      ? `; campos obrigatórios ${schema.required.join(", ")}`
      : "";
    return `objeto${required}`;
  }
  if (schema.type === "string") {
    return Array.isArray(schema.enum)
      ? `texto entre ${schema.enum.join(" | ")}`
      : "texto";
  }
  if (schema.type === "boolean") return "booleano";
  if (schema.type === "null") return "null";
  if (Array.isArray(schema.anyOf)) {
    return schema.anyOf.map(schemaForm).join(" ou ");
  }
  return "valor JSON";
}

function combineDescriptionText(...values) {
  const sentences = values.filter(Boolean).flatMap((value) =>
    String(value).split(/(?<=\.)\s+/u).map((sentence) => sentence.trim()).filter(Boolean)
  );
  return [...new Set(sentences)].join(" ");
}

function variantFieldDescription(branches, property, discriminator) {
  if (!discriminator) return null;
  const groups = new Map();
  branches.forEach((branch, index) => {
    const value = discriminator.values[index];
    if (value === undefined) return;
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(branch);
  });
  const conditions = (predicate) => [...groups].flatMap(([value, matching]) => {
    const selected = matching.filter(predicate);
    if (!selected.length) return [];
    if (selected.length === matching.length) return [`${discriminator.field}=${value}`];
    return selected.map((branch) => branchQualifier(value, branch, matching, discriminator));
  });
  const allowed = [...new Set(conditions((branch) => own(schemaProperties(branch), property)))];
  const required = [...new Set(conditions((branch) => branch.required?.includes(property)))];
  const allowedEverywhere = [...groups.values()].every((matching) =>
    matching.every((branch) => own(schemaProperties(branch), property))
  );
  const requiredEverywhere = [...groups.values()].every((matching) =>
    matching.every((branch) => branch.required?.includes(property))
  );
  if (!allowed.length) return null;
  const format = (values) => [...values].map((value) => `\`${value}\``).join(", ");
  const details = [];
  if (!allowedEverywhere) {
    details.push(`Use somente em ${format(allowed)}.`);
  }
  if (required.length && !requiredEverywhere) {
    details.push(`Obrigatório em ${format(required)}.`);
  }
  details.push(...exclusiveRequiredAlternativeDescriptions(
    groups,
    property,
    discriminator
  ));
  const documented = [...groups].flatMap(([value, matching]) => {
    const descriptions = [...new Set(matching
      .map((branch) => schemaProperties(branch)[property]?.description)
      .filter(Boolean))];
    return descriptions.map((description) =>
      `Em \`${discriminator.field}=${value}\`: ${description}`
    );
  });
  const propertyDescriptions = branches
    .filter((branch) => own(schemaProperties(branch), property))
    .map((branch) => schemaProperties(branch)[property]?.description);
  if (new Set(propertyDescriptions.filter(Boolean)).size > 1 ||
      propertyDescriptions.some((description) => !description)) {
    details.push(...documented);
  }
  const schemas = branches.flatMap((branch, index) => {
    const schema = schemaProperties(branch)[property];
    const value = discriminator.values[index];
    if (!schema || value === undefined) return [];
    return [{ schema, value, branch }];
  });
  const schemaGroups = new Map();
  for (const entry of schemas) {
    const identity = validationSchemaIdentity(entry.schema);
    if (!schemaGroups.has(identity)) schemaGroups.set(identity, []);
    schemaGroups.get(identity).push(entry);
  }
  const onlyEnumAlternatives = schemas.length > 0 && schemas.every(({ schema }) =>
    Array.isArray(schema.enum)
  );
  if (schemaGroups.size > 1 && !onlyEnumAlternatives) {
    for (const matchingSchemas of schemaGroups.values()) {
      const labels = [...new Set(matchingSchemas.map(({ value, branch }) =>
        branchQualifier(value, branch, groups.get(value), discriminator)
      ))];
      details.push(
        `Formato em ${format(labels)}: ${schemaForm(matchingSchemas[0].schema)}.`
      );
    }
  }
  return details.join(" ") || null;
}

function mergeActionSurfaceSchemas(values, path) {
  const schemas = uniqueSchemas(values.map((value, index) =>
    projectActionObjectSurfaces(value, `${path}.${index}`)
  ));
  if (schemas.length === 1) return schemas[0];
  const references = schemas.map((schema) => schema.$ref);
  if (references.every((reference) => reference && reference === references[0])) {
    const surface = { $ref: references[0] };
    for (const field of ["minimum", "minLength", "minItems"]) {
      const valuesForField = schemas.map((schema) => schema[field]);
      if (valuesForField.every(Number.isFinite)) {
        surface[field] = Math.min(...valuesForField);
      }
    }
    for (const field of ["maximum", "maxLength", "maxItems"]) {
      const valuesForField = schemas.map((schema) => schema[field]);
      if (valuesForField.every(Number.isFinite)) {
        surface[field] = Math.max(...valuesForField);
      }
    }
    return surface;
  }
  if (schemas.every((schema) => schema.type === "object")) {
    const surface = factorActionObjectUnion({ oneOf: schemas }, path);
    delete surface.oneOf;
    return surface;
  }
  const types = new Set(schemas.map((schema) => schema.type));
  if (types.size === 1 && ["string", "integer", "number", "boolean", "array"]
    .includes(schemas[0].type)) {
    const surface = scalarSurface(schemas);
    if (schemas[0].type === "array") {
      const itemSchemas = schemas.map((schema) => schema.items).filter(Boolean);
      if (itemSchemas.length === schemas.length) {
        surface.items = mergeActionSurfaceSchemas(itemSchemas, `${path}.items`);
      }
    }
    return surface;
  }
  return { anyOf: schemas };
}

function factorActionObjectUnion(node, path) {
  const branchSources = node.oneOf.flatMap((branch, branchIndex) =>
    expandNestedObjectVariants(branch, `${path}.oneOf.${branchIndex}`)
  );
  const branches = branchSources.map((branch, branchIndex) => ({
    ...branch,
    properties: Object.fromEntries(Object.entries(schemaProperties(branch)).map(
      ([field, schema]) => [
        field,
        projectActionObjectSurfaces(schema, `${path}.oneOf.${branchIndex}.${field}`)
      ]
    ))
  }));
  const propertySchemas = new Map();
  for (const branch of branches) {
    for (const [field, schema] of Object.entries(schemaProperties(branch))) {
      if (!propertySchemas.has(field)) propertySchemas.set(field, []);
      propertySchemas.get(field).push(schema);
    }
  }
  const baseProperties = Object.fromEntries([...propertySchemas].map(([field, schemas]) => [
    field,
    mergeActionSurfaceSchemas(schemas, `${path}.properties.${field}`)
  ]));
  const discriminator = branchDiscriminator(branches);
  const properties = Object.fromEntries(Object.entries(baseProperties).map(([field, surface]) => {
    const description = variantFieldDescription(branches, field, discriminator);
    const combinedDescription = combineDescriptionText(surface.description, description);
    return [field, combinedDescription ? { ...surface, description: combinedDescription } : surface];
  }));
  const required = Object.keys(baseProperties).filter((field) =>
    branches.every((branch) => branch.required?.includes(field))
  );
  const propertyNames = new Set(Object.keys(baseProperties));
  const constraints = branches.map((branch) => {
    const branchProperties = schemaProperties(branch);
    const narrowed = Object.fromEntries(Object.entries(branchProperties).filter(
      ([field, schema]) => schemaIdentity(schema) !== schemaIdentity(baseProperties[field])
    ));
    const branchRequired = (branch.required || []).filter((field) => !required.includes(field));
    const forbidden = [...propertyNames].filter((field) => !own(branchProperties, field));
    const constraint = Object.fromEntries(Object.entries(branch).filter(([key]) =>
      !["type", "additionalProperties", "properties", "required"].includes(key)
    ));
    if (Object.keys(narrowed).length) constraint.properties = narrowed;
    if (branchRequired.length) constraint.required = branchRequired;
    if (forbidden.length) {
      const forbiddenConstraint = {
        anyOf: forbidden.map((field) => ({ required: [field] }))
      };
      constraint.not = constraint.not
        ? { anyOf: [constraint.not, forbiddenConstraint] }
        : forbiddenConstraint;
    }
    return constraint;
  });
  const result = Object.fromEntries(Object.entries(node)
    .filter(([key]) =>
      !["type", "additionalProperties", "properties", "required", "oneOf"].includes(key)
    )
    .map(([key, value]) => [
      key,
      projectActionObjectSurfaces(value, `${path}.${key}`)
    ]));
  result.type = "object";
  result.additionalProperties = false;
  result.properties = properties;
  result.required = required;
  result.oneOf = constraints;
  return result;
}

function projectActionObjectSurfaces(value, path) {
  if (Array.isArray(value)) {
    return value.map((entry, index) => projectActionObjectSurfaces(entry, `${path}.${index}`));
  }
  if (!object(value)) return value;
  if (value.type === "object" && object(value.properties) &&
      Array.isArray(value.oneOf) && value.oneOf.length &&
      value.oneOf.every((constraint) => Object.keys(constraint).every((key) =>
        ["properties", "required", "not"].includes(key)
      ))) {
    const base = { ...value };
    delete base.oneOf;
    const variants = value.oneOf.map((constraint, index) =>
      mergeObjectVariantConstraint(base, constraint, `${path}.oneOf.${index}`)
    );
    return factorActionObjectUnion({
      ...Object.fromEntries(Object.entries(value).filter(([key]) =>
        !["type", "additionalProperties", "properties", "required", "oneOf"].includes(key)
      )),
      oneOf: variants
    }, path);
  }
  if (Array.isArray(value.oneOf) && value.oneOf.length &&
      value.oneOf.every((branch) => branch?.type === "object")) {
    return factorActionObjectUnion(value, path);
  }
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    projectActionObjectSurfaces(entry, `${path}.${key}`)
  ]));
}

export function findSchemaKeywordPaths(value, keyword) {
  const paths = [];
  function visit(entry, path) {
    if (!entry || typeof entry !== "object") return;
    if (!Array.isArray(entry) && own(entry, keyword)) paths.push(`${path}.${keyword}`);
    if (Array.isArray(entry)) entry.forEach((child, index) => visit(child, `${path}.${index}`));
    else Object.entries(entry).forEach(([key, child]) => visit(child, `${path}.${key}`));
  }
  visit(value, "$input");
  return paths;
}

export function projectActionInputSchemaWithAudit(toolDefinition) {
  if (!object(toolDefinition?.inputSchema)) {
    throw new TypeError("A ferramenta pública precisa declarar inputSchema.");
  }
  const context = projectionContext(toolDefinition.inputSchema);
  let projected;
  if (toolDefinition.name === "alterarCurso") {
    projected = projectChangeSchema(toolDefinition.inputSchema, context, toolDefinition.name);
  } else if (toolDefinition.name === "lerCurso") {
    projected = projectReadSchema(toolDefinition.inputSchema, context, toolDefinition.name);
  } else if (toolDefinition.name === "consultarComponentesDidaticos") {
    projected = projectComponentsSchema(toolDefinition.inputSchema, context, toolDefinition.name);
  } else {
    projected = projectNode(toolDefinition.inputSchema, context, toolDefinition.name);
  }
  projected = projectActionObjectSurfaces(projected, toolDefinition.name);
  if (projected.type !== "object") {
    throw new TypeError(
      `A raiz de entrada de ${toolDefinition.name} precisa ser um objeto para Actions.`
    );
  }
  context.assertComplete();
  const remaining = findSchemaKeywordPaths(projected, "allOf");
  if (remaining.length) {
    throw new TypeError(`A projeção de Actions ainda contém allOf em ${remaining[0]}.`);
  }
  const remainingConstants = findSchemaKeywordPaths(projected, "const");
  if (remainingConstants.length) {
    throw new TypeError(`A projeção de Actions ainda contém const em ${remainingConstants[0]}.`);
  }
  return {
    inputSchema: projected,
    rules: context.report()
  };
}

export function projectActionInputSchema(toolDefinition) {
  return projectActionInputSchemaWithAudit(toolDefinition).inputSchema;
}

export function projectAuthoringProtocolToolsForActions(tools) {
  if (!Array.isArray(tools)) throw new TypeError("O catálogo público de Autoria é inválido.");
  return tools.map((tool) => ({
    ...tool,
    inputSchema: projectActionInputSchema(tool)
  }));
}

function uniqueRequired(...values) {
  return [...new Set(values.flatMap((value) => Array.isArray(value) ? value : []))];
}

function singletonVariant(schema, property, literal, label) {
  const matches = (schema?.oneOf || []).filter((branch) => {
    const marker = branch?.properties?.[property];
    return marker?.type === "string" && marker.enum?.length === 1 &&
      marker.enum[0] === literal;
  });
  if (matches.length !== 1) {
    throw new TypeError(`${label} não possui uma variante única para ${literal}.`);
  }
  return matches[0];
}

function selectedProperties(properties, names, overrides = {}) {
  return Object.fromEntries(names.map((name) => {
    const schema = overrides[name] || properties?.[name];
    if (!schema) throw new TypeError(`A projeção dedicada perdeu a propriedade ${name}.`);
    return [name, structuredClone(schema)];
  }));
}

function variantPropertyNames(properties, variant, label) {
  const forbidden = new Set(forbiddenFields(variant));
  if (!forbidden.size) {
    throw new TypeError(`${label} não declara os campos incompatíveis.`);
  }
  const names = Object.keys(properties || {}).filter((name) => !forbidden.has(name));
  const required = new Set(variant.required || []);
  if ([...required].some((name) => !names.includes(name))) {
    throw new TypeError(`${label} proíbe um campo obrigatório.`);
  }
  return names;
}

function reachableDefinitions(definitions, schema, label) {
  if (!definitions) return {};
  const selected = new Map();
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (typeof value.$ref === "string" && value.$ref.startsWith("#/$defs/")) {
      const token = value.$ref.slice("#/$defs/".length).split("/")[0];
      const name = token.replaceAll("~1", "/").replaceAll("~0", "~");
      if (!Object.hasOwn(definitions, name)) {
        throw new TypeError(`${label} referencia a definição ausente ${name}.`);
      }
      if (!selected.has(name)) {
        selected.set(name, structuredClone(definitions[name]));
        visit(definitions[name]);
      }
    }
    for (const entry of Object.values(value)) visit(entry);
  };
  visit(schema);
  return Object.fromEntries(selected);
}

function specializeActionCommandTool(tool, projection) {
  const input = tool.inputSchema;
  const operationVariant = singletonVariant(
    input,
    "operation",
    projection.operation,
    projection.operationId
  );
  const command = input.properties?.[projection.commandProperty];
  const commandVariant = singletonVariant(
    command,
    "type",
    projection.commandType,
    projection.operationId
  );
  const rootRequired = uniqueRequired(input.required, operationVariant.required);
  const commandRequired = uniqueRequired(command.required, commandVariant.required);
  const commandPropertyNames = variantPropertyNames(
    command.properties,
    commandVariant,
    `${projection.operationId}.${projection.commandProperty}`
  );
  const specializedCommand = {
    type: "object",
    additionalProperties: false,
    properties: selectedProperties(command.properties, commandPropertyNames, {
      type: commandVariant.properties.type
    }),
    required: commandRequired,
    ...(command.description ? { description: command.description } : {})
  };
  const rootPropertyNames = variantPropertyNames(
    input.properties,
    operationVariant,
    projection.operationId
  );
  const specializedInput = {
    type: "object",
    additionalProperties: false,
    properties: selectedProperties(input.properties, rootPropertyNames, {
      operation: operationVariant.properties.operation,
      [projection.commandProperty]: specializedCommand
    }),
    required: rootRequired
  };
  const definitions = reachableDefinitions(
    input.$defs,
    specializedInput,
    projection.operationId
  );
  return {
    ...tool,
    name: projection.operationId,
    title: projection.title,
    description: projection.description,
    inputSchema: {
      ...(Object.keys(definitions).length ? { $defs: definitions } : {}),
      ...specializedInput
    }
  };
}

function omitDedicatedCommandVariants(tool, projections) {
  if (!projections.length) return tool;
  const clone = structuredClone(tool);
  const byCommandProperty = Map.groupBy(
    projections,
    (projection) => projection.commandProperty
  );
  for (const [commandProperty, commandProjections] of byCommandProperty) {
    const command = clone.inputSchema.properties?.[commandProperty];
    if (!command || !Array.isArray(command.oneOf)) {
      throw new TypeError(`${tool.name}.${commandProperty} não possui variantes públicas.`);
    }
    const omittedTypes = new Set(commandProjections.map(({ commandType }) => commandType));
    const omittedBranches = [];
    const remainingBranches = [];
    for (const branch of command.oneOf) {
      const types = branch?.properties?.type?.enum || [];
      (types.some((type) => omittedTypes.has(type)) ? omittedBranches : remainingBranches)
        .push(branch);
    }
    if (omittedBranches.length !== omittedTypes.size) {
      throw new TypeError(`${tool.name}.${commandProperty} perdeu uma projeção dedicada.`);
    }
    command.oneOf = remainingBranches;
    command.properties.type.enum = command.properties.type.enum.filter(
      (type) => !omittedTypes.has(type)
    );
    const fields = (branches) => new Set(branches.flatMap((branch) => [
      ...Object.keys(branch.properties || {}),
      ...(branch.required || [])
    ]));
    const omittedFields = fields(omittedBranches);
    const remainingFields = fields(remainingBranches);
    const baseRequired = new Set(command.required || []);
    for (const field of omittedFields) {
      if (!remainingFields.has(field) && !baseRequired.has(field)) {
        delete command.properties[field];
      }
    }
  }
  return clone;
}

export function projectChatGptActionTransportTools(actionTools, projections) {
  if (!Array.isArray(actionTools) || !Array.isArray(projections)) {
    throw new TypeError("A projeção de transporte das Actions é inválida.");
  }
  const toolsByName = new Map(actionTools.map((tool) => [tool.name, tool]));
  const projectionsByTool = Map.groupBy(
    projections,
    (projection) => projection.canonicalToolName
  );
  const genericTools = actionTools.map((tool) => omitDedicatedCommandVariants(
    tool,
    projectionsByTool.get(tool.name) || []
  ));
  const dedicatedTools = projections.map((projection) => {
    const canonical = toolsByName.get(projection.canonicalToolName);
    if (!canonical) {
      throw new TypeError(`A Action ${projection.operationId} não possui ferramenta canônica.`);
    }
    return specializeActionCommandTool(canonical, projection);
  });
  const names = [...genericTools, ...dedicatedTools].map(({ name }) => name);
  if (new Set(names).size !== names.length) {
    throw new TypeError("A projeção de transporte das Actions possui operationId duplicado.");
  }
  return [...genericTools, ...dedicatedTools];
}
