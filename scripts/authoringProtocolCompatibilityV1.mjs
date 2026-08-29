import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";

export const AUTHORING_PROTOCOL_COMPATIBILITY_RULESET_VERSION = 1;
export const AUTHORING_PROTOCOL_SNAPSHOT_FORMAT_VERSION = 1;
export const AUTHORING_PROTOCOL_SNAPSHOT_ENCODING = "gzip-base64";

const LOWER_LIMIT_KEYWORDS = Object.freeze([
  "minLength",
  "minItems",
  "minProperties",
  "minContains"
]);
const UPPER_LIMIT_KEYWORDS = Object.freeze([
  "maxLength",
  "maxItems",
  "maxProperties",
  "maxContains"
]);
const OPAQUE_RESTRICTION_KEYWORDS = Object.freeze([
  "format",
  "contentEncoding",
  "contentMediaType",
  "propertyNames",
  "patternProperties",
  "unevaluatedItems"
]);

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export const canonicalizeJson = (value) => {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }
  if (!isObject(value)) {
    return value;
  }
  return Object.fromEntries(Object.keys(value)
    .sort()
    .map((key) => [key, canonicalizeJson(value[key])]));
};

export const canonicalJson = (value) => JSON.stringify(canonicalizeJson(value));

const sha256 = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

export const computeAuthoringProtocolSchemaHash = ({ id, schemaVersion, tools }) => sha256(
  canonicalJson({ id, schemaVersion, tools })
);

export const computeAuthoringProtocolCatalogHash = (tools) => sha256(canonicalJson(tools));

export const parseAuthoringProtocolVersion = (version) => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version));
  if (!match) {
    throw new TypeError(`Versão de contrato inválida: ${version}`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
};

export const parseAuthoringProtocolIdMajor = (protocolId) => {
  const match = /\.v(\d+)$/u.exec(String(protocolId));
  if (!match) {
    throw new TypeError(`Identificador de protocolo sem major público: ${protocolId}`);
  }
  return Number(match[1]);
};

const assertProtocolMajorMatchesSchemaVersion = (protocolId, schemaVersion) => {
  const protocolMajor = parseAuthoringProtocolIdMajor(protocolId);
  const schemaMajor = parseAuthoringProtocolVersion(schemaVersion).major;
  if (protocolMajor !== schemaMajor) {
    throw new Error(
      `O protocolo ${protocolId} exige schemaVersion ${protocolMajor}.x; recebido ${schemaVersion}.`
    );
  }
};

export const compareAuthoringProtocolVersions = (left, right) => {
  const leftVersion = parseAuthoringProtocolVersion(left);
  const rightVersion = parseAuthoringProtocolVersion(right);
  return leftVersion.major - rightVersion.major ||
    leftVersion.minor - rightVersion.minor ||
    leftVersion.patch - rightVersion.patch;
};

export const createAuthoringProtocolSnapshot = ({ id, schemaVersion, schemaHash, tools }) => {
  assertProtocolMajorMatchesSchemaVersion(id, schemaVersion);
  const computedSchemaHash = computeAuthoringProtocolSchemaHash({ id, schemaVersion, tools });
  if (schemaHash !== undefined && schemaHash !== computedSchemaHash) {
    throw new Error(
      `O hash informado (${schemaHash}) diverge do catálogo (${computedSchemaHash}).`
    );
  }
  const catalog = canonicalJson(tools);
  return {
    formatVersion: AUTHORING_PROTOCOL_SNAPSHOT_FORMAT_VERSION,
    rulesetVersion: AUTHORING_PROTOCOL_COMPATIBILITY_RULESET_VERSION,
    protocolId: id,
    schemaVersion,
    schemaHash: computedSchemaHash,
    catalogHash: sha256(catalog),
    catalogEncoding: AUTHORING_PROTOCOL_SNAPSHOT_ENCODING,
    catalog: gzipSync(Buffer.from(catalog, "utf8"), { level: 9 }).toString("base64")
  };
};

export const decodeAuthoringProtocolSnapshot = (snapshot) => {
  if (snapshot?.formatVersion !== AUTHORING_PROTOCOL_SNAPSHOT_FORMAT_VERSION) {
    throw new Error(`Formato de snapshot incompatível: ${snapshot?.formatVersion}`);
  }
  if (snapshot?.rulesetVersion !== AUTHORING_PROTOCOL_COMPATIBILITY_RULESET_VERSION) {
    throw new Error(`Ruleset de snapshot incompatível: ${snapshot?.rulesetVersion}`);
  }
  if (snapshot?.catalogEncoding !== AUTHORING_PROTOCOL_SNAPSHOT_ENCODING) {
    throw new Error(`Codificação de snapshot incompatível: ${snapshot?.catalogEncoding}`);
  }
  assertProtocolMajorMatchesSchemaVersion(snapshot.protocolId, snapshot.schemaVersion);
  const catalog = gunzipSync(Buffer.from(snapshot.catalog, "base64")).toString("utf8");
  if (sha256(catalog) !== snapshot.catalogHash) {
    throw new Error(`O catálogo do snapshot ${snapshot.schemaVersion} está corrompido.`);
  }
  const tools = JSON.parse(catalog);
  const computedSchemaHash = computeAuthoringProtocolSchemaHash({
    id: snapshot.protocolId,
    schemaVersion: snapshot.schemaVersion,
    tools
  });
  if (computedSchemaHash !== snapshot.schemaHash) {
    throw new Error(`O hash de contrato do snapshot ${snapshot.schemaVersion} está incorreto.`);
  }
  return {
    id: snapshot.protocolId,
    schemaVersion: snapshot.schemaVersion,
    schemaHash: snapshot.schemaHash,
    tools
  };
};

export const authoringProtocolSnapshotFileName = (schemaVersion) => {
  parseAuthoringProtocolVersion(schemaVersion);
  return `v${schemaVersion}.snapshot.json`;
};

export const writeNewAuthoringProtocolSnapshot = ({ directory, snapshot }) => {
  decodeAuthoringProtocolSnapshot(snapshot);
  const filePath = path.join(directory, authoringProtocolSnapshotFileName(snapshot.schemaVersion));
  mkdirSync(directory, { recursive: true });
  if (existsSync(filePath)) {
    throw new Error(
      `O snapshot ${snapshot.schemaVersion} já existe; incremente a versão e acrescente outro arquivo.`
    );
  }
  writeFileSync(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx"
  });
  return filePath;
};

const issue = (code, schemaPath, message) => ({ code, path: schemaPath, message });

const uniqueIssues = (issues) => {
  const seen = new Set();
  return issues.filter((entry) => {
    const key = canonicalJson(entry);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const asTypeSet = (schema) => {
  if (schema?.type === undefined) {
    return null;
  }
  return new Set(Array.isArray(schema.type) ? schema.type : [schema.type]);
};

const acceptedLiteralValues = (schema) => {
  if (!isObject(schema)) {
    return null;
  }
  if (Object.hasOwn(schema, "const")) {
    return [schema.const];
  }
  return Array.isArray(schema.enum) ? schema.enum : null;
};

const literalKey = (value) => canonicalJson(value);

const directDiscriminator = (schema) => {
  if (!isObject(schema?.properties)) {
    return null;
  }
  const entries = Object.entries(schema.properties)
    .flatMap(([property, propertySchema]) => {
      const values = acceptedLiteralValues(propertySchema);
      return values?.length === 1 ? [[property, values[0]]] : [];
    })
    .sort(([left], [right]) => left.localeCompare(right));
  return entries.length > 0 ? canonicalJson(entries) : null;
};

const conditionalDiscriminator = (schema) => {
  if (!isObject(schema?.properties)) {
    return null;
  }
  const entries = Object.entries(schema.properties)
    .flatMap(([property, propertySchema]) => {
      const values = acceptedLiteralValues(propertySchema);
      return values?.length === 1 ? [{ property, value: values[0] }] : [];
    });
  return entries.length === 1 ? entries[0] : null;
};

const isNewConditionalVariant = (previousParent, condition) => {
  const discriminator = conditionalDiscriminator(condition);
  if (!discriminator) {
    return false;
  }
  const previousValues = acceptedLiteralValues(
    previousParent?.properties?.[discriminator.property]
  );
  return Array.isArray(previousValues) && !previousValues.some(
    (value) => literalKey(value) === literalKey(discriminator.value)
  );
};

const compareLiteralDomain = (previous, next, schemaPath, issues) => {
  const previousValues = acceptedLiteralValues(previous);
  const nextValues = acceptedLiteralValues(next);
  if (nextValues === null) {
    return;
  }
  if (previousValues === null) {
    issues.push(issue(
      "literal_domain_narrowed",
      schemaPath,
      "Foi acrescentada uma restrição const/enum a valores antes aceitos."
    ));
    return;
  }
  const nextKeys = new Set(nextValues.map(literalKey));
  const removed = previousValues.filter((value) => !nextKeys.has(literalKey(value)));
  if (removed.length > 0) {
    issues.push(issue(
      "enum_narrowed",
      schemaPath,
      `Valores antes aceitos foram removidos: ${removed.map(literalKey).join(", ")}.`
    ));
  }
};

const numericBoundary = (schema, inclusiveKeyword, exclusiveKeyword, fallback, direction) => {
  const candidates = [];
  if (typeof schema?.[inclusiveKeyword] === "number") {
    candidates.push({ value: schema[inclusiveKeyword], exclusive: false });
  }
  if (typeof schema?.[exclusiveKeyword] === "number") {
    candidates.push({ value: schema[exclusiveKeyword], exclusive: true });
  }
  if (candidates.length === 0) {
    return { value: fallback, exclusive: false };
  }
  return candidates.reduce((selected, candidate) => {
    if (candidate.value === selected.value) {
      return candidate.exclusive ? candidate : selected;
    }
    return direction * candidate.value > direction * selected.value ? candidate : selected;
  });
};

const compareNumericBounds = (previous, next, schemaPath, issues) => {
  const previousMinimum = numericBoundary(
    previous, "minimum", "exclusiveMinimum", Number.NEGATIVE_INFINITY, 1
  );
  const nextMinimum = numericBoundary(
    next, "minimum", "exclusiveMinimum", Number.NEGATIVE_INFINITY, 1
  );
  if (nextMinimum.value > previousMinimum.value ||
      (nextMinimum.value === previousMinimum.value &&
       nextMinimum.exclusive && !previousMinimum.exclusive)) {
    issues.push(issue("minimum_narrowed", schemaPath, "O limite mínimo ficou mais restritivo."));
  }

  const previousMaximum = numericBoundary(
    previous, "maximum", "exclusiveMaximum", Number.POSITIVE_INFINITY, -1
  );
  const nextMaximum = numericBoundary(
    next, "maximum", "exclusiveMaximum", Number.POSITIVE_INFINITY, -1
  );
  if (nextMaximum.value < previousMaximum.value ||
      (nextMaximum.value === previousMaximum.value &&
       nextMaximum.exclusive && !previousMaximum.exclusive)) {
    issues.push(issue("maximum_narrowed", schemaPath, "O limite máximo ficou mais restritivo."));
  }
};

const compareSimpleLimits = (previous, next, schemaPath, issues) => {
  for (const keyword of LOWER_LIMIT_KEYWORDS) {
    const previousValue = typeof previous?.[keyword] === "number" ? previous[keyword] : 0;
    const nextValue = typeof next?.[keyword] === "number" ? next[keyword] : 0;
    if (nextValue > previousValue) {
      issues.push(issue(
        "lower_limit_narrowed",
        `${schemaPath}.${keyword}`,
        `${keyword} aumentou de ${previousValue} para ${nextValue}.`
      ));
    }
  }
  for (const keyword of UPPER_LIMIT_KEYWORDS) {
    const previousValue = typeof previous?.[keyword] === "number"
      ? previous[keyword]
      : Number.POSITIVE_INFINITY;
    const nextValue = typeof next?.[keyword] === "number"
      ? next[keyword]
      : Number.POSITIVE_INFINITY;
    if (nextValue < previousValue) {
      issues.push(issue(
        "upper_limit_narrowed",
        `${schemaPath}.${keyword}`,
        `${keyword} passou a aceitar menos valores.`
      ));
    }
  }
};

const compareRequired = (previous, next, schemaPath, issues) => {
  const previousRequired = new Set(Array.isArray(previous?.required) ? previous.required : []);
  const additions = (Array.isArray(next?.required) ? next.required : [])
    .filter((property) => !previousRequired.has(property));
  for (const property of additions) {
    issues.push(issue(
      "required_added",
      `${schemaPath}.required`,
      `A propriedade ${property} passou a ser obrigatória.`
    ));
  }
};

const compareDependentRequired = (previous, next, schemaPath, issues) => {
  const previousDependencies = isObject(previous?.dependentRequired)
    ? previous.dependentRequired
    : {};
  const nextDependencies = isObject(next?.dependentRequired) ? next.dependentRequired : {};
  for (const [property, dependencies] of Object.entries(nextDependencies)) {
    const previousSet = new Set(previousDependencies[property] ?? []);
    for (const dependency of dependencies) {
      if (!previousSet.has(dependency)) {
        issues.push(issue(
          "dependent_required_added",
          `${schemaPath}.dependentRequired.${property}`,
          `${dependency} passou a ser obrigatório quando ${property} está presente.`
        ));
      }
    }
  }
};

const compareOpaqueRestriction = (previous, next, keyword, schemaPath, issues) => {
  if (next?.[keyword] === undefined) {
    return;
  }
  if (previous?.[keyword] === undefined ||
      canonicalJson(previous[keyword]) !== canonicalJson(next[keyword])) {
    issues.push(issue(
      `${keyword}_narrowed`,
      `${schemaPath}.${keyword}`,
      `${keyword} foi acrescentado ou alterado; o detector não pode provar que a mudança amplia o contrato.`
    ));
  }
};

const compareSchemaOrBoolean = (previous, next, schemaPath, issues, compareSchema) => {
  const previousSchema = previous === undefined ? true : previous;
  const nextSchema = next === undefined ? true : next;
  if (previousSchema === false || nextSchema === true) {
    return;
  }
  if (nextSchema === false) {
    issues.push(issue("prohibition_added", schemaPath, "Valores antes aceitos passaram a ser proibidos."));
    return;
  }
  if (previousSchema === true) {
    issues.push(issue("constraint_added", schemaPath, "Foi acrescentada uma restrição a valores antes livres."));
    return;
  }
  compareSchema(previousSchema, nextSchema, schemaPath, issues);
};

const compareProperties = (previous, next, schemaPath, issues, compareSchema) => {
  const previousProperties = isObject(previous?.properties) ? previous.properties : {};
  const nextProperties = isObject(next?.properties) ? next.properties : {};
  for (const [property, previousPropertySchema] of Object.entries(previousProperties)) {
    if (!Object.hasOwn(nextProperties, property)) {
      issues.push(issue(
        "property_removed",
        `${schemaPath}.properties.${property}`,
        `A propriedade aceita ${property} foi removida do schema.`
      ));
      continue;
    }
    compareSchema(
      previousPropertySchema,
      nextProperties[property],
      `${schemaPath}.properties.${property}`,
      issues
    );
  }

  const previousAdditional = previous?.additionalProperties;
  for (const [property, nextPropertySchema] of Object.entries(nextProperties)) {
    if (Object.hasOwn(previousProperties, property) || previousAdditional === false) {
      continue;
    }
    if (previousAdditional === undefined || previousAdditional === true) {
      if (canonicalJson(nextPropertySchema) !== canonicalJson(true)) {
        issues.push(issue(
          "property_constraint_added",
          `${schemaPath}.properties.${property}`,
          `A propriedade ${property}, antes livre, passou a ter restrições.`
        ));
      }
      continue;
    }
    compareSchemaOrBoolean(
      previousAdditional,
      nextPropertySchema,
      `${schemaPath}.properties.${property}`,
      issues,
      compareSchema
    );
  }
};

const constraintGuaranteedBySchemas = (schemas, constraint, compareSchema) => {
  if (!isObject(constraint)) return false;
  const supported = new Set(["properties", "required", "not"]);
  if (Object.keys(constraint).some((key) => !supported.has(key))) return false;
  const propertySchemas = schemas.filter(isObject);
  const required = Array.isArray(constraint.required) ? constraint.required : [];
  if (required.some((field) => !propertySchemas.some((schema) =>
    Array.isArray(schema.required) && schema.required.includes(field)
  ))) {
    return false;
  }
  for (const [field, requiredSchema] of Object.entries(constraint.properties || {})) {
    const guaranteed = propertySchemas.some((schema) => {
      const existing = schema.properties?.[field];
      if (existing === undefined) {
        return schema.additionalProperties === false;
      }
      const candidateIssues = [];
      compareSchema(existing, requiredSchema, `$.constraint.${field}`, candidateIssues);
      return candidateIssues.length === 0;
    });
    if (!guaranteed) return false;
  }
  if (constraint.not !== undefined) {
    const forbidden = Array.isArray(constraint.not?.anyOf)
      ? constraint.not.anyOf.flatMap((entry) =>
          Array.isArray(entry?.required) && entry.required.length === 1
            ? entry.required
            : []
        )
      : [];
    if (!forbidden.length || forbidden.some((field) => !propertySchemas.some((schema) =>
      (schema.additionalProperties === false && !Object.hasOwn(schema.properties || {}, field)) ||
      (Array.isArray(schema.not?.anyOf) && schema.not.anyOf.some(
        (entry) => Array.isArray(entry?.required) && entry.required.includes(field)
      ))
    ))) {
      return false;
    }
  }
  return true;
};

const compareUnion = (previous, next, keyword, schemaPath, issues, compareSchema) => {
  const previousBranches = Array.isArray(previous?.[keyword]) ? previous[keyword] : null;
  const nextKeyword = Array.isArray(next?.[keyword])
    ? keyword
    : keyword === "oneOf" && previousBranches && Array.isArray(next?.anyOf)
      ? "anyOf"
      : null;
  const nextBranches = nextKeyword ? next[nextKeyword] : null;
  if (!previousBranches) {
    if (nextBranches) {
      const preservesPreviousSchema = nextBranches.some((nextBranch) => {
        const candidateIssues = [];
        compareSchema(previous, nextBranch, schemaPath, candidateIssues);
        return candidateIssues.length === 0 ||
          constraintGuaranteedBySchemas([previous], nextBranch, compareSchema);
      });
      if (preservesPreviousSchema) return;
      issues.push(issue(
        "union_constraint_added",
        `${schemaPath}.${nextKeyword}`,
        `Foi acrescentado ${nextKeyword} a um schema antes não condicionado pela união.`
      ));
    }
    return;
  }
  if (!nextBranches) {
    return;
  }
  if (keyword === "anyOf" && nextKeyword === "oneOf") {
    issues.push(issue(
      "union_mode_narrowed",
      `${schemaPath}.oneOf`,
      "anyOf foi substituído por oneOf, que pode rejeitar sobreposições antes aceitas."
    ));
  }

  for (const [index, previousBranch] of previousBranches.entries()) {
    const identity = directDiscriminator(previousBranch);
    if (identity !== null) {
      const matchIndex = nextBranches.findIndex(
        (candidate) => directDiscriminator(candidate) === identity
      );
      if (matchIndex < 0) {
        issues.push(issue(
          "discriminator_removed",
          `${schemaPath}.${keyword}[${index}]`,
          `A variante discriminada ${identity} deixou de ser aceita.`
        ));
        continue;
      }
      compareSchema(
        previousBranch,
        nextBranches[matchIndex],
        `${schemaPath}.${keyword}{${identity}}`,
        issues
      );
      continue;
    }

    const candidates = nextBranches.map((nextBranch, nextIndex) => {
      const candidateIssues = [];
      compareSchema(
        previousBranch,
        nextBranch,
        `${schemaPath}.${keyword}[${index}->${nextIndex}]`,
        candidateIssues
      );
      return candidateIssues;
    });
    const best = candidates.sort((left, right) => left.length - right.length)[0];
    if (!best) {
      issues.push(issue(
        "union_variant_removed",
        `${schemaPath}.${keyword}[${index}]`,
        "Uma variante antes aceita foi removida."
      ));
    } else {
      issues.push(...best);
    }
  }
};

const allOfBranchKey = (branch) => {
  if (isObject(branch?.if)) {
    return `if:${canonicalJson(branch.if)}`;
  }
  return `schema:${canonicalJson(branch)}`;
};

const compareAllOf = (previous, next, schemaPath, issues, compareSchema) => {
  const previousBranches = Array.isArray(previous?.allOf) ? previous.allOf : [];
  const nextBranches = Array.isArray(next?.allOf) ? next.allOf : [];
  const previousByKey = new Map(previousBranches.map((branch) => [allOfBranchKey(branch), branch]));
  for (const [index, nextBranch] of nextBranches.entries()) {
    const key = allOfBranchKey(nextBranch);
    const previousBranch = previousByKey.get(key);
    if (previousBranch) {
      const conditionalConstraintsRemainRedundant = ["then", "else"].every((keyword) =>
        nextBranch[keyword] === undefined || constraintGuaranteedBySchemas(
          [previous, previousBranch[keyword]],
          nextBranch[keyword],
          compareSchema
        )
      );
      if (conditionalConstraintsRemainRedundant) continue;
      compareSchema(previousBranch, nextBranch, `${schemaPath}.allOf[${index}]`, issues);
      continue;
    }
    if (isObject(nextBranch?.if) && isNewConditionalVariant(previous, nextBranch.if)) {
      continue;
    }
    issues.push(issue(
      "all_of_constraint_added",
      `${schemaPath}.allOf[${index}]`,
      "Foi acrescentada uma regra allOf que pode restringir chamadas antes válidas."
    ));
  }
};

const compareConditional = (previous, next, schemaPath, issues, compareSchema) => {
  if (next?.if === undefined) {
    return;
  }
  if (previous?.if === undefined || canonicalJson(previous.if) !== canonicalJson(next.if)) {
    issues.push(issue(
      "conditional_changed",
      `${schemaPath}.if`,
      "A condição de aplicação de uma regra foi acrescentada ou alterada."
    ));
    return;
  }
  for (const keyword of ["then", "else"]) {
    if (previous[keyword] === undefined && next[keyword] !== undefined) {
      issues.push(issue(
        "conditional_constraint_added",
        `${schemaPath}.${keyword}`,
        `Foi acrescentada a restrição condicional ${keyword}.`
      ));
    } else if (previous[keyword] !== undefined && next[keyword] !== undefined) {
      compareSchema(previous[keyword], next[keyword], `${schemaPath}.${keyword}`, issues);
    }
  }
};

const compareDependentSchemas = (previous, next, schemaPath, issues, compareSchema) => {
  const previousSchemas = isObject(previous?.dependentSchemas) ? previous.dependentSchemas : {};
  const nextSchemas = isObject(next?.dependentSchemas) ? next.dependentSchemas : {};
  for (const [property, nextSchema] of Object.entries(nextSchemas)) {
    if (!Object.hasOwn(previousSchemas, property)) {
      issues.push(issue(
        "dependent_schema_added",
        `${schemaPath}.dependentSchemas.${property}`,
        `Foi acrescentada uma restrição quando ${property} está presente.`
      ));
    } else {
      compareSchema(
        previousSchemas[property],
        nextSchema,
        `${schemaPath}.dependentSchemas.${property}`,
        issues
      );
    }
  }
};

const compareTypes = (previous, next, schemaPath, issues) => {
  const previousTypes = asTypeSet(previous);
  const nextTypes = asTypeSet(next);
  if (nextTypes === null) {
    return;
  }
  if (previousTypes === null) {
    issues.push(issue(
      "type_narrowed",
      `${schemaPath}.type`,
      "Foi acrescentada uma restrição de tipo a valores antes aceitos."
    ));
    return;
  }
  const removed = [...previousTypes].filter((type) => !nextTypes.has(type));
  if (removed.length > 0) {
    issues.push(issue(
      "type_incompatible",
      `${schemaPath}.type`,
      `Tipos antes aceitos foram removidos: ${removed.join(", ")}.`
    ));
  }
};

const comparePattern = (previous, next, schemaPath, issues) => {
  if (next?.pattern !== undefined && previous?.pattern !== next.pattern) {
    issues.push(issue(
      "pattern_narrowed",
      `${schemaPath}.pattern`,
      "O pattern foi acrescentado ou alterado; a inclusão do idioma anterior não pode ser provada."
    ));
  }
};

const compareMultipleOf = (previous, next, schemaPath, issues) => {
  if (next?.multipleOf !== undefined && previous?.multipleOf !== next.multipleOf) {
    issues.push(issue(
      "multiple_of_narrowed",
      `${schemaPath}.multipleOf`,
      "multipleOf foi acrescentado ou alterado."
    ));
  }
};

const compareSchema = (previous, next, schemaPath, issues) => {
  if (canonicalJson(previous) === canonicalJson(next) || previous === false || next === true) {
    return;
  }
  if (next === false) {
    issues.push(issue("schema_prohibited", schemaPath, "O schema novo proíbe valores antes aceitos."));
    return;
  }
  if (previous === true || previous === undefined) {
    issues.push(issue("schema_narrowed", schemaPath, "Um schema livre recebeu novas restrições."));
    return;
  }
  if (!isObject(previous) || !isObject(next)) {
    issues.push(issue("schema_incompatible", schemaPath, "A forma do schema mudou de modo incompatível."));
    return;
  }

  compareTypes(previous, next, schemaPath, issues);
  compareLiteralDomain(previous, next, schemaPath, issues);
  compareRequired(previous, next, schemaPath, issues);
  compareDependentRequired(previous, next, schemaPath, issues);
  compareNumericBounds(previous, next, schemaPath, issues);
  compareSimpleLimits(previous, next, schemaPath, issues);
  comparePattern(previous, next, schemaPath, issues);
  compareMultipleOf(previous, next, schemaPath, issues);
  compareProperties(previous, next, schemaPath, issues, compareSchema);

  if (next.uniqueItems === true && previous.uniqueItems !== true) {
    issues.push(issue(
      "unique_items_added",
      `${schemaPath}.uniqueItems`,
      "Itens duplicados, antes aceitos, passaram a ser proibidos."
    ));
  }
  if (next.not !== undefined && canonicalJson(previous.not) !== canonicalJson(next.not)) {
    issues.push(issue(
      "prohibition_added",
      `${schemaPath}.not`,
      "Uma proibição foi acrescentada ou alterada."
    ));
  }

  compareSchemaOrBoolean(
    previous.additionalProperties,
    next.additionalProperties,
    `${schemaPath}.additionalProperties`,
    issues,
    compareSchema
  );
  compareSchemaOrBoolean(
    previous.unevaluatedProperties,
    next.unevaluatedProperties,
    `${schemaPath}.unevaluatedProperties`,
    issues,
    compareSchema
  );
  compareSchemaOrBoolean(previous.items, next.items, `${schemaPath}.items`, issues, compareSchema);
  compareSchemaOrBoolean(previous.contains, next.contains, `${schemaPath}.contains`, issues, compareSchema);

  for (const keyword of OPAQUE_RESTRICTION_KEYWORDS) {
    compareOpaqueRestriction(previous, next, keyword, schemaPath, issues);
  }
  compareUnion(previous, next, "oneOf", schemaPath, issues, compareSchema);
  compareUnion(previous, next, "anyOf", schemaPath, issues, compareSchema);
  compareAllOf(previous, next, schemaPath, issues, compareSchema);
  compareConditional(previous, next, schemaPath, issues, compareSchema);
  compareDependentSchemas(previous, next, schemaPath, issues, compareSchema);

  const previousPrefixItems = Array.isArray(previous.prefixItems) ? previous.prefixItems : [];
  const nextPrefixItems = Array.isArray(next.prefixItems) ? next.prefixItems : [];
  for (const [index, previousItem] of previousPrefixItems.entries()) {
    if (nextPrefixItems[index] !== undefined) {
      compareSchema(
        previousItem,
        nextPrefixItems[index],
        `${schemaPath}.prefixItems[${index}]`,
        issues
      );
    } else if (next.items === false) {
      issues.push(issue(
        "tuple_item_removed",
        `${schemaPath}.prefixItems[${index}]`,
        "Uma posição de tupla antes aceita foi removida."
      ));
    }
  }
};

export const findBreakingAuthoringProtocolChanges = (previousTools, nextTools) => {
  if (!Array.isArray(previousTools) || !Array.isArray(nextTools)) {
    throw new TypeError("Os catálogos anterior e novo precisam ser arrays de tools.");
  }
  const issues = [];
  const nextByName = new Map(nextTools.map((tool) => [tool.name, tool]));
  for (const previousTool of previousTools) {
    const nextTool = nextByName.get(previousTool.name);
    if (!nextTool) {
      issues.push(issue(
        "tool_removed",
        `$.tools.${previousTool.name}`,
        `A tool pública ${previousTool.name} foi removida.`
      ));
      continue;
    }
    compareSchema(
      previousTool.inputSchema,
      nextTool.inputSchema,
      `$.tools.${previousTool.name}.inputSchema`,
      issues
    );
    compareSchema(
      previousTool.outputSchema,
      nextTool.outputSchema,
      `$.tools.${previousTool.name}.outputSchema`,
      issues
    );
  }
  return uniqueIssues(issues);
};

export const findBreakingAuthoringProtocolSnapshotChanges = (previousSnapshot, nextSnapshot) => {
  const previous = decodeAuthoringProtocolSnapshot(previousSnapshot);
  const next = decodeAuthoringProtocolSnapshot(nextSnapshot);
  if (previous.id !== next.id) {
    return [issue("protocol_changed", "$.protocolId", "O identificador do protocolo mudou.")];
  }
  if (compareAuthoringProtocolVersions(previous.schemaVersion, next.schemaVersion) >= 0) {
    return [issue("version_not_incremented", "$.schemaVersion", "A versão nova não é posterior.")];
  }
  return findBreakingAuthoringProtocolChanges(previous.tools, next.tools);
};

const runSnapshotGenerator = async () => {
  const protocol = await import(
    "../supabase/functions/_shared/aralearn-authoring/authoringProtocolV1.js"
  );
  const snapshot = createAuthoringProtocolSnapshot({
    id: protocol.AUTHORING_PROTOCOL_ID,
    schemaVersion: protocol.AUTHORING_PROTOCOL_SCHEMA_VERSION,
    schemaHash: protocol.AUTHORING_PROTOCOL_V1_SCHEMA_HASH,
    tools: protocol.AUTHORING_PROTOCOL_V1_TOOLS
  });
  const snapshotDirectory = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../tests/fixtures/authoring-protocol"
  );
  const filePath = writeNewAuthoringProtocolSnapshot({
    directory: snapshotDirectory,
    snapshot
  });
  process.stdout.write(`${filePath}\n`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runSnapshotGenerator();
}
