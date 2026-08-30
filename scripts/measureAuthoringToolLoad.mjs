import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const defaultRepositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const textEncoder = new TextEncoder();
const schemaReferencePrefix = "#/components/schemas/";

function serializedSize(value) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  return {
    chars: serialized.length,
    bytes: textEncoder.encode(serialized).length,
    estimatedTokens: Math.ceil(serialized.length / 4)
  };
}

function fingerprint(value) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  return `sha256:${crypto.createHash("sha256").update(serialized).digest("hex")}`;
}

function scanJsonTree(root, { includeDuplicateDetails = false } = {}) {
  const descriptions = [];
  const result = {
    nodes: 0,
    propertyDeclarations: 0,
    descriptions: {
      occurrences: 0,
      unique: 0,
      chars: 0,
      exactDuplicateOccurrences: 0,
      exactDuplicateExcessChars: 0
    },
    oneOf: { occurrences: 0, alternatives: 0 },
    anyOf: { occurrences: 0, alternatives: 0 },
    allOf: { occurrences: 0, alternatives: 0 },
    enums: { occurrences: 0, values: 0 },
    references: 0,
    maxDepth: 0
  };

  function visit(value, depth = 0) {
    if (!value || typeof value !== "object") return;
    result.nodes += 1;
    result.maxDepth = Math.max(result.maxDepth, depth);
    if (typeof value.description === "string") {
      descriptions.push(value.description);
      result.descriptions.occurrences += 1;
      result.descriptions.chars += value.description.length;
    }
    if (value.properties && typeof value.properties === "object" &&
      !Array.isArray(value.properties)) {
      result.propertyDeclarations += Object.keys(value.properties).length;
    }
    for (const keyword of ["oneOf", "anyOf", "allOf"]) {
      if (!Array.isArray(value[keyword])) continue;
      result[keyword].occurrences += 1;
      result[keyword].alternatives += value[keyword].length;
    }
    if (Array.isArray(value.enum)) {
      result.enums.occurrences += 1;
      result.enums.values += value.enum.length;
    }
    if (typeof value.$ref === "string") result.references += 1;
    const children = Array.isArray(value) ? value : Object.values(value);
    for (const child of children) visit(child, depth + 1);
  }

  visit(root);
  const occurrencesByDescription = new Map();
  for (const description of descriptions) {
    occurrencesByDescription.set(
      description,
      (occurrencesByDescription.get(description) || 0) + 1
    );
  }
  const duplicates = [...occurrencesByDescription]
    .filter(([, occurrences]) => occurrences > 1)
    .map(([description, occurrences]) => ({
      description,
      occurrences,
      chars: description.length,
      excessChars: description.length * (occurrences - 1)
    }))
    .sort((left, right) => right.excessChars - left.excessChars);
  result.descriptions.unique = occurrencesByDescription.size;
  result.descriptions.exactDuplicateOccurrences =
    descriptions.length - occurrencesByDescription.size;
  result.descriptions.exactDuplicateExcessChars = duplicates.reduce(
    (total, duplicate) => total + duplicate.excessChars,
    0
  );
  if (includeDuplicateDetails) {
    result.descriptions.largestExactDuplicates = duplicates.slice(0, 10);
  }
  return result;
}

function actionOperations(document) {
  return Object.values(document.paths).flatMap((pathItem) =>
    Object.values(pathItem).filter((operation) => operation?.operationId)
  );
}

function schemaClosure(document, rootSchema) {
  const referencedNames = new Set();

  function visit(value) {
    if (!value || typeof value !== "object") return;
    if (typeof value.$ref === "string" &&
      value.$ref.startsWith(schemaReferencePrefix)) {
      const name = value.$ref.slice(schemaReferencePrefix.length).split("/")[0];
      if (!referencedNames.has(name)) {
        referencedNames.add(name);
        visit(document.components?.schemas?.[name]);
      }
    }
    const children = Array.isArray(value) ? value : Object.values(value);
    for (const child of children) visit(child);
  }

  visit(rootSchema);
  return {
    root: rootSchema,
    components: Object.fromEntries([...referencedNames].sort().map((name) => [
      name,
      document.components.schemas[name]
    ]))
  };
}

function actionOperationMeasurements(document) {
  return actionOperations(document).map((operation) => {
    const rootSchema = operation.requestBody?.content?.["application/json"]?.schema || {};
    const closure = schemaClosure(document, rootSchema);
    return {
      name: operation.operationId,
      operation: serializedSize(operation),
      rootSchema: serializedSize(rootSchema),
      reachableSchema: serializedSize(closure),
      rootProperties: Object.keys(rootSchema.properties || {}).length,
      referencedComponents: Object.keys(closure.components).length,
      structure: scanJsonTree(closure)
    };
  }).sort((left, right) =>
    right.reachableSchema.chars - left.reachableSchema.chars
  );
}

function mcpToolMeasurements(tools) {
  return tools.map((tool) => ({
    name: tool.name,
    tool: serializedSize(tool),
    inputSchema: serializedSize(tool.inputSchema),
    rootProperties: Object.keys(tool.inputSchema?.properties || {}).length,
    structure: scanJsonTree(tool.inputSchema)
  })).sort((left, right) =>
    right.inputSchema.chars - left.inputSchema.chars
  );
}

async function measure(repositoryRoot = defaultRepositoryRoot) {
  const [{
    COURSE_MCP_TOOLS,
    authoringMcpToolsForPrincipal
  }, {
    COURSE_AUTHORING_SERVER_INSTRUCTIONS
  }] = await Promise.all([
    import(pathToFileURL(path.join(
      repositoryRoot,
      "supabase/functions/_shared/aralearn-authoring/courseMcpTools.js"
    )).href),
    import(pathToFileURL(path.join(
      repositoryRoot,
      "supabase/functions/_shared/aralearn-authoring/courseKnowledge.js"
    )).href)
  ]);
  const openApiPath = path.join(
    repositoryRoot,
    "docs",
    "downloads",
    "aralearn-chatgpt-action-openapi.yaml"
  );
  const openApiText = await readFile(openApiPath, "utf8");
  const openApi = JSON.parse(openApiText);
  const operations = actionOperationMeasurements(openApi);
  const discoveredTools = authoringMcpToolsForPrincipal({
    actorId: "00000000-0000-4000-8000-000000000001",
    scopes: ["authoring:write"]
  });
  const toolsListEnvelope = {
    jsonrpc: "2.0",
    id: 1,
    result: { tools: discoveredTools }
  };
  const inputSchemaCorpus = Object.fromEntries(COURSE_MCP_TOOLS.map((tool) => [
    tool.name,
    tool.inputSchema
  ]));
  const mcpTools = mcpToolMeasurements(COURSE_MCP_TOOLS);
  const serverInstructions = serializedSize(COURSE_AUTHORING_SERVER_INSTRUCTIONS);
  const toolsListSize = serializedSize(toolsListEnvelope);

  return {
    format: "aralearn.authoring-model-load.v1",
    tokenEstimate: "ceil(chars / 4); aproximação comparativa, não tokenização do modelo",
    instructions: {
      versionedServerInstructions: {
        ...serverInstructions,
        paragraphs: COURSE_AUTHORING_SERVER_INSTRUCTIONS.split("\n").length,
        fingerprint: fingerprint(COURSE_AUTHORING_SERVER_INSTRUCTIONS)
      },
      actionInfoDescription: {
        ...serializedSize(openApi.info.description),
        paragraphs: openApi.info.description.split("\n").length
      }
    },
    actions: {
      document: {
        ...serializedSize(openApiText),
        fingerprint: fingerprint(openApiText),
        operationCount: operations.length,
        componentSchemaCount: Object.keys(openApi.components?.schemas || {}).length
      },
      structure: scanJsonTree(openApi, { includeDuplicateDetails: true }),
      operations,
      largestOperation: operations[0] || null
    },
    mcp: {
      registry: {
        ...serializedSize(COURSE_MCP_TOOLS),
        fingerprint: fingerprint(COURSE_MCP_TOOLS),
        toolCount: COURSE_MCP_TOOLS.length
      },
      toolsList: {
        ...toolsListSize,
        fingerprint: fingerprint(toolsListEnvelope),
        toolCount: discoveredTools.length
      },
      inputSchemas: {
        ...serializedSize(inputSchemaCorpus),
        fingerprint: fingerprint(inputSchemaCorpus)
      },
      initializeInstructionsPlusToolsList: {
        chars: serverInstructions.chars + toolsListSize.chars,
        bytes: serverInstructions.bytes + toolsListSize.bytes,
        estimatedTokens: Math.ceil(
          (serverInstructions.chars + toolsListSize.chars) / 4
        )
      },
      structure: scanJsonTree(COURSE_MCP_TOOLS, { includeDuplicateDetails: true }),
      tools: mcpTools,
      largestTool: mcpTools[0] || null
    }
  };
}

const comparisonMetrics = Object.freeze([
  ["instructions.versionedServerInstructions.chars", "Instruções versionadas — chars"],
  ["instructions.versionedServerInstructions.estimatedTokens", "Instruções versionadas — tokens estimados"],
  ["actions.document.chars", "Actions OpenAPI — chars"],
  ["actions.document.bytes", "Actions OpenAPI — bytes"],
  ["actions.document.estimatedTokens", "Actions OpenAPI — tokens estimados"],
  ["actions.document.operationCount", "Actions — operações"],
  ["actions.structure.propertyDeclarations", "Actions — propriedades"],
  ["actions.structure.oneOf.occurrences", "Actions — oneOf"],
  ["actions.structure.anyOf.occurrences", "Actions — anyOf"],
  ["actions.structure.allOf.occurrences", "Actions — allOf"],
  ["actions.structure.descriptions.chars", "Actions — chars de descrições"],
  ["actions.structure.descriptions.exactDuplicateExcessChars", "Actions — chars duplicados em descrições"],
  ["actions.largestOperation.reachableSchema.chars", "Maior operação Actions — chars alcançáveis"],
  ["mcp.toolsList.chars", "MCP tools/list — chars"],
  ["mcp.toolsList.bytes", "MCP tools/list — bytes"],
  ["mcp.toolsList.estimatedTokens", "MCP tools/list — tokens estimados"],
  ["mcp.toolsList.toolCount", "MCP — ferramentas"],
  ["mcp.inputSchemas.chars", "MCP — chars dos schemas de entrada"],
  ["mcp.structure.propertyDeclarations", "MCP — propriedades"],
  ["mcp.structure.oneOf.occurrences", "MCP — oneOf"],
  ["mcp.structure.anyOf.occurrences", "MCP — anyOf"],
  ["mcp.structure.allOf.occurrences", "MCP — allOf"],
  ["mcp.structure.descriptions.chars", "MCP — chars de descrições"],
  ["mcp.structure.descriptions.exactDuplicateExcessChars", "MCP — chars duplicados em descrições"],
  ["mcp.largestTool.inputSchema.chars", "Maior schema MCP — chars"]
]);

function valueAtPath(value, dottedPath) {
  return dottedPath.split(".").reduce((current, key) => current?.[key], value);
}

function compare(before, after) {
  return comparisonMetrics.map(([metric, label]) => {
    const beforeValue = valueAtPath(before, metric);
    const afterValue = valueAtPath(after, metric);
    return {
      metric,
      label,
      before: beforeValue,
      after: afterValue,
      delta: typeof beforeValue === "number" && typeof afterValue === "number"
        ? afterValue - beforeValue
        : null
    };
  });
}

function formatInteger(value) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
}

function summaryLines(report) {
  const actionLargest = report.actions.largestOperation;
  const mcpLargest = report.mcp.largestTool;
  return [
    "Carga dos contratos de autoria do AraLearn",
    `Estimativa de tokens: ${report.tokenEstimate}`,
    "",
    `Instruções versionadas: ${formatInteger(report.instructions.versionedServerInstructions.chars)} chars; ` +
      `~${formatInteger(report.instructions.versionedServerInstructions.estimatedTokens)} tokens`,
    `Actions OpenAPI: ${formatInteger(report.actions.document.chars)} chars; ` +
      `${formatInteger(report.actions.document.bytes)} bytes; ` +
      `~${formatInteger(report.actions.document.estimatedTokens)} tokens; ` +
      `${report.actions.document.operationCount} operações`,
    `Actions: ${formatInteger(report.actions.structure.propertyDeclarations)} propriedades; ` +
      `${report.actions.structure.oneOf.occurrences} oneOf; ` +
      `${report.actions.structure.anyOf.occurrences} anyOf; ` +
      `${report.actions.structure.allOf.occurrences} allOf; ` +
      `${formatInteger(report.actions.structure.descriptions.chars)} chars de descrições; ` +
      `${formatInteger(report.actions.structure.descriptions.exactDuplicateExcessChars)} chars duplicados`,
    `Maior operação Actions: ${actionLargest?.name || "—"}; ` +
      `${formatInteger(actionLargest?.reachableSchema?.chars || 0)} chars alcançáveis; ` +
      `~${formatInteger(actionLargest?.reachableSchema?.estimatedTokens || 0)} tokens`,
    "",
    `MCP tools/list: ${formatInteger(report.mcp.toolsList.chars)} chars; ` +
      `${formatInteger(report.mcp.toolsList.bytes)} bytes; ` +
      `~${formatInteger(report.mcp.toolsList.estimatedTokens)} tokens; ` +
      `${report.mcp.toolsList.toolCount} ferramentas`,
    `MCP: ${formatInteger(report.mcp.structure.propertyDeclarations)} propriedades; ` +
      `${report.mcp.structure.oneOf.occurrences} oneOf; ` +
      `${report.mcp.structure.anyOf.occurrences} anyOf; ` +
      `${report.mcp.structure.allOf.occurrences} allOf; ` +
      `${formatInteger(report.mcp.structure.descriptions.chars)} chars de descrições; ` +
      `${formatInteger(report.mcp.structure.descriptions.exactDuplicateExcessChars)} chars duplicados`,
    `Maior schema MCP: ${mcpLargest?.name || "—"}; ` +
      `${formatInteger(mcpLargest?.inputSchema?.chars || 0)} chars; ` +
      `~${formatInteger(mcpLargest?.inputSchema?.estimatedTokens || 0)} tokens`
  ];
}

function comparisonLines(rows, source) {
  return [
    "",
    `Comparação com ${source}`,
    ...rows.map((row) =>
      `${row.label}: ${formatInteger(row.before)} -> ${formatInteger(row.after)} ` +
      `(${row.delta >= 0 ? "+" : ""}${formatInteger(row.delta)})`
    )
  ];
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new TypeError(`${name} exige um valor.`);
  }
  return value;
}

if (process.argv.includes("--help")) {
  process.stdout.write([
    "Uso: node scripts/measureAuthoringToolLoad.mjs [--json] [--repository-root <dir>] " +
      "[--compare <relatório.json> | --compare-root <dir>]",
    "",
    "Compare diretamente duas árvores com --compare-root ou use um relatório salvo com --compare.",
    "A estimativa comparativa de tokens é sempre ceil(chars / 4).",
    ""
  ].join("\n"));
  process.exit(0);
}

const repositoryRoot = path.resolve(
  argumentValue("--repository-root") || defaultRepositoryRoot
);
const report = await measure(repositoryRoot);
const comparePath = argumentValue("--compare");
const compareRoot = argumentValue("--compare-root");
if (comparePath && compareRoot) {
  throw new TypeError("Use somente --compare ou --compare-root.");
}
const before = compareRoot
  ? await measure(path.resolve(compareRoot))
  : comparePath
    ? JSON.parse(await readFile(path.resolve(comparePath), "utf8"))
    : null;
const comparison = before ? compare(before, report) : null;
const comparisonSource = compareRoot || comparePath;

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(
    comparison ? { report, comparison } : report,
    null,
    2
  )}\n`);
} else {
  const lines = summaryLines(report);
  if (comparison) lines.push(...comparisonLines(comparison, comparisonSource));
  process.stdout.write(`${lines.join("\n")}\n`);
}
