import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUTHORING_PROTOCOL_ID,
  AUTHORING_PROTOCOL_SCHEMA_VERSION,
  AUTHORING_PROTOCOL_V1_SCHEMA_HASH,
  AUTHORING_PROTOCOL_V1_TOOLS
} from "../../supabase/functions/_shared/aralearn-authoring/authoringProtocolV1.js";
import {
  AUTHORING_PROTOCOL_COMPATIBILITY_RULESET_VERSION,
  authoringProtocolSnapshotFileName,
  canonicalJson,
  compareAuthoringProtocolVersions,
  computeAuthoringProtocolSchemaHash,
  createAuthoringProtocolSnapshot,
  decodeAuthoringProtocolSnapshot,
  findBreakingAuthoringProtocolChanges,
  findBreakingAuthoringProtocolSnapshotChanges,
  parseAuthoringProtocolIdMajor,
  parseAuthoringProtocolVersion,
  writeNewAuthoringProtocolSnapshot
} from "../../scripts/authoringProtocolCompatibilityV1.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIRECTORY = path.resolve(__dirname, "../fixtures/authoring-protocol");
const SNAPSHOT_FILE_PATTERN = /^v(\d+\.\d+\.\d+)\.snapshot\.json$/u;

const outputSchema = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: { ok: { type: "boolean" } },
  required: ["ok"]
});

const syntheticTool = (inputSchema, name = "alterarCurso") => ({
  name,
  title: name,
  description: name,
  inputSchema,
  outputSchema,
  annotations: { readOnlyHint: false }
});

const objectSchema = (properties, required = []) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required
});

const commandVariant = (type, properties = {}) => objectSchema({
  type: { const: type },
  ...properties
}, ["type"]);

const issueCodes = (issues) => new Set(issues.map(({ code }) => code));

const loadApprovedSnapshots = () => readdirSync(SNAPSHOT_DIRECTORY)
  .flatMap((fileName) => {
    const match = SNAPSHOT_FILE_PATTERN.exec(fileName);
    if (!match) {
      return [];
    }
    return [{
      fileName,
      fileVersion: match[1],
      snapshot: JSON.parse(readFileSync(path.join(SNAPSHOT_DIRECTORY, fileName), "utf8"))
    }];
  })
  .sort((left, right) => compareAuthoringProtocolVersions(
    left.fileVersion,
    right.fileVersion
  ));

test("fingerprint canônico e snapshot aprovado permanecem idênticos ao catálogo público", () => {
  const protocolMajor = parseAuthoringProtocolIdMajor(AUTHORING_PROTOCOL_ID);
  assert.equal(parseAuthoringProtocolVersion(AUTHORING_PROTOCOL_SCHEMA_VERSION).major, protocolMajor);
  const computedHash = computeAuthoringProtocolSchemaHash({
    id: AUTHORING_PROTOCOL_ID,
    schemaVersion: AUTHORING_PROTOCOL_SCHEMA_VERSION,
    tools: AUTHORING_PROTOCOL_V1_TOOLS
  });
  assert.equal(computedHash, AUTHORING_PROTOCOL_V1_SCHEMA_HASH);

  const snapshots = loadApprovedSnapshots();
  assert.ok(snapshots.length > 0, "o protocolo público precisa de ao menos um snapshot aprovado");

  for (const { fileName, fileVersion, snapshot } of snapshots) {
    assert.equal(snapshot.schemaVersion, fileVersion, `${fileName} precisa refletir sua versão`);
    assert.equal(snapshot.protocolId, AUTHORING_PROTOCOL_ID, `${fileName} pertence a outro protocolo`);
    assert.equal(
      snapshot.rulesetVersion,
      AUTHORING_PROTOCOL_COMPATIBILITY_RULESET_VERSION,
      `${fileName} usa outro ruleset semântico`
    );
    const decoded = decodeAuthoringProtocolSnapshot(snapshot);
    assert.equal(decoded.schemaVersion, fileVersion);
    assert.equal(parseAuthoringProtocolVersion(fileVersion).major, protocolMajor);
  }

  for (let index = 1; index < snapshots.length; index += 1) {
    const previous = snapshots[index - 1];
    const current = snapshots[index];
    assert.ok(
      compareAuthoringProtocolVersions(previous.fileVersion, current.fileVersion) < 0,
      "snapshots precisam ter versões estritamente crescentes"
    );
    assert.deepEqual(
      findBreakingAuthoringProtocolSnapshotChanges(previous.snapshot, current.snapshot),
      [],
      `o snapshot ${current.fileName} quebra o contrato público v${protocolMajor}`
    );
  }

  const latest = snapshots.at(-1);
  assert.equal(latest.fileVersion, AUTHORING_PROTOCOL_SCHEMA_VERSION);
  assert.equal(latest.snapshot.schemaHash, AUTHORING_PROTOCOL_V1_SCHEMA_HASH);
  const approved = decodeAuthoringProtocolSnapshot(latest.snapshot);
  assert.equal(canonicalJson(approved.tools), canonicalJson(AUTHORING_PROTOCOL_V1_TOOLS));
});

test("detector permite somente ampliações conhecidas do idioma público", () => {
  const previous = [syntheticTool(objectSchema({
    operation: { type: "string", enum: ["read"] },
    value: { type: ["string", "null"], minLength: 2, maxLength: 20 },
    command: { oneOf: [commandVariant("alpha", { note: { type: "string" } })] }
  }, ["operation"]))];
  const next = [syntheticTool(objectSchema({
    operation: { type: "string", enum: ["read", "write"] },
    value: { type: ["string", "number", "null"], minLength: 1, maxLength: 40 },
    optional: { type: "boolean" },
    command: { oneOf: [
      commandVariant("alpha", { note: { type: "string" } }),
      commandVariant("beta", { count: { type: "integer" } })
    ] }
  }, ["operation"]))];

  assert.deepEqual(findBreakingAuthoringProtocolChanges(previous, next), []);

  assert.deepEqual(findBreakingAuthoringProtocolChanges(
    [syntheticTool(objectSchema({ value: { type: "string" } }))],
    [syntheticTool(objectSchema({
      value: { anyOf: [{ type: "string" }, { type: "null" }] }
    }))]
  ), []);
});

test("detector compara todas as variantes que compartilham o mesmo discriminador", () => {
  const localPreview = objectSchema({
    operation: { const: "preview" },
    payload: { type: "string" }
  }, ["operation", "payload"]);
  const targetedPreview = objectSchema({
    operation: { const: "preview" },
    payload: { type: "string" },
    courseId: { type: "string" },
    unitId: { type: "string" }
  }, ["operation", "payload", "courseId", "unitId"]);
  const search = objectSchema({
    operation: { const: "search" },
    query: { type: "string" }
  }, ["operation"]);
  const widenedSearch = objectSchema({
    ...search.properties,
    facets: { type: "array", items: { type: "string" } }
  }, ["operation"]);

  assert.deepEqual(findBreakingAuthoringProtocolChanges(
    [syntheticTool({ oneOf: [localPreview, targetedPreview, search] })],
    [syntheticTool({ oneOf: [localPreview, targetedPreview, widenedSearch] })]
  ), []);

  const issues = findBreakingAuthoringProtocolChanges(
    [syntheticTool({ oneOf: [localPreview, targetedPreview, search] })],
    [syntheticTool({ oneOf: [localPreview, widenedSearch] })]
  );
  assert.ok(issueCodes(issues).has("property_removed"));
});

test("detector bloqueia remoções e estreitamentos de schema no mesmo major", () => {
  const previous = [syntheticTool(objectSchema({
    operation: { type: "string", enum: ["read", "write"] },
    status: { type: "string", enum: ["open", "closed"] },
    payload: {
      type: ["string", "null"],
      minLength: 1,
      maxLength: 100,
      pattern: ".*"
    },
    legacy: { type: "boolean" },
    optional: { type: "string" },
    command: { oneOf: [commandVariant("alpha"), commandVariant("beta")] }
  }, ["operation"]))];
  const next = [syntheticTool({
    ...objectSchema({
      operation: { type: "string", enum: ["read"] },
      status: { type: "string", enum: ["open"] },
      payload: {
        type: "string",
        minLength: 2,
        maxLength: 10,
        pattern: "^x$"
      },
      optional: { type: "string" },
      command: { oneOf: [commandVariant("alpha")] }
    }, ["operation", "optional"]),
    not: { required: ["forbidden"] }
  })];

  const codes = issueCodes(findBreakingAuthoringProtocolChanges(previous, next));
  for (const expected of [
    "enum_narrowed",
    "type_incompatible",
    "lower_limit_narrowed",
    "upper_limit_narrowed",
    "pattern_narrowed",
    "property_removed",
    "required_added",
    "discriminator_removed",
    "prohibition_added"
  ]) {
    assert.ok(codes.has(expected), `faltou detectar ${expected}`);
  }
});

test("detector bloqueia remoção de tool e rejeita salto de major no mesmo protocolo", () => {
  const previousTools = [syntheticTool(objectSchema({ value: { type: "string" } }), "lerCurso")];
  const nextTools = [];
  assert.ok(issueCodes(
    findBreakingAuthoringProtocolChanges(previousTools, nextTools)
  ).has("tool_removed"));

  const previous = createAuthoringProtocolSnapshot({
    id: "example.protocol.v1",
    schemaVersion: "1.0.0",
    tools: previousTools
  });
  const sameMajor = createAuthoringProtocolSnapshot({
    id: "example.protocol.v1",
    schemaVersion: "1.1.0",
    tools: nextTools
  });
  assert.ok(issueCodes(
    findBreakingAuthoringProtocolSnapshotChanges(previous, sameMajor)
  ).has("tool_removed"));
  assert.throws(
    () => createAuthoringProtocolSnapshot({
      id: "example.protocol.v1",
      schemaVersion: "2.0.0",
      tools: nextTools
    }),
    /exige schemaVersion 1\.x/u
  );

  const separateProtocol = createAuthoringProtocolSnapshot({
    id: "example.protocol.v2",
    schemaVersion: "2.0.0",
    tools: nextTools
  });
  assert.ok(issueCodes(
    findBreakingAuthoringProtocolSnapshotChanges(previous, separateProtocol)
  ).has("protocol_changed"));
});

test("condicional de operação nova amplia o contrato, mas regra nova para operação existente bloqueia", () => {
  const previousSchema = {
    ...objectSchema({ operation: { enum: ["read"] } }, ["operation"]),
    allOf: [{
      if: { properties: { operation: { const: "read" } }, required: ["operation"] },
      then: { required: ["operation"] }
    }]
  };
  const widenedSchema = {
    ...objectSchema({ operation: { enum: ["read", "write"] } }, ["operation"]),
    allOf: [
      ...previousSchema.allOf,
      {
        if: { properties: { operation: { const: "write" } }, required: ["operation"] },
        then: { required: ["operation"] }
      }
    ]
  };
  assert.deepEqual(
    findBreakingAuthoringProtocolChanges(
      [syntheticTool(previousSchema)],
      [syntheticTool(widenedSchema)]
    ),
    []
  );

  const narrowedSchema = {
    ...previousSchema,
    allOf: [
      ...previousSchema.allOf,
      {
        if: { properties: { operation: { const: "read" } }, required: ["operation"] },
        then: { not: { required: ["legacy"] } }
      }
    ]
  };
  assert.ok(issueCodes(findBreakingAuthoringProtocolChanges(
    [syntheticTool(previousSchema)],
    [syntheticTool(narrowedSchema)]
  )).has("prohibition_added"));
});

test("gravador de snapshots recusa sobrescrever uma versão aprovada", () => {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "aralearn-protocol-"));
  try {
    const snapshot = createAuthoringProtocolSnapshot({
      id: "example.protocol.v1",
      schemaVersion: "1.0.0",
      tools: []
    });
    const filePath = writeNewAuthoringProtocolSnapshot({
      directory: temporaryDirectory,
      snapshot
    });
    assert.equal(path.basename(filePath), authoringProtocolSnapshotFileName("1.0.0"));
    assert.throws(
      () => writeNewAuthoringProtocolSnapshot({ directory: temporaryDirectory, snapshot }),
      /já existe/u
    );
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
