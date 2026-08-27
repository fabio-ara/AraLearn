import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import {
  AUTHORING_PROTOCOL_V1_TOOLS,
  AUTHORING_PROTOCOL_V1_VOCABULARY,
  COURSE_COMPONENT_CATALOG_VERSION
} from "../../supabase/functions/_shared/aralearn-authoring/authoringProtocolV1.js";
import {
  ACTION_SCHEMA_RULE_CATEGORIES,
  findSchemaKeywordPaths,
  projectActionInputSchema,
  projectActionInputSchemaWithAudit,
  projectAuthoringProtocolToolsForActions
} from "../../scripts/projectChatGptActionSchemas.mjs";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const SECOND_ID = "20000000-0000-4000-8000-000000000002";
const THIRD_ID = "30000000-0000-4000-8000-000000000003";
const REQUEST_ID = "action-schema-projection-0001";

const actionTools = projectAuthoringProtocolToolsForActions(AUTHORING_PROTOCOL_V1_TOOLS);
const canonicalByName = Object.fromEntries(
  AUTHORING_PROTOCOL_V1_TOOLS.map((tool) => [tool.name, tool])
);
const actionByName = Object.fromEntries(actionTools.map((tool) => [tool.name, tool]));

function sorted(values) {
  return [...new Set(values)].sort();
}

function walkSchema(value, visit) {
  if (!value || typeof value !== "object") return;
  visit(value);
  if (Array.isArray(value)) value.forEach((entry) => walkSchema(entry, visit));
  else Object.values(value).forEach((entry) => walkSchema(entry, visit));
}

function jsonPointerToken(value) {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function resolveLocalReference(document, reference) {
  assert.match(reference, /^#\//u);
  return reference.slice(2).split("/").reduce((value, token) => {
    const property = token.replaceAll("~1", "/").replaceAll("~0", "~");
    assert.ok(
      value && typeof value === "object" && Object.hasOwn(value, property),
      `Referência OpenAPI não resolvida: ${reference}`
    );
    return value[property];
  }, document);
}

function directBranchLiterals(schema, property) {
  return sorted((schema.oneOf || []).flatMap((branch) => {
    const marker = branch.properties?.[property];
    return marker?.type === "string" && marker.enum?.length === 1
      ? marker.enum
      : [];
  }));
}

function nestedDiscriminatorLiterals(schema, containerProperty, discriminator) {
  const values = [];
  walkSchema(schema, (node) => {
    const container = node.properties?.[containerProperty];
    if (!container) return;
    walkSchema(container, (nested) => {
      const marker = nested.properties?.[discriminator];
      if (marker?.type === "string" && marker.enum?.length === 1) {
        values.push(marker.enum[0]);
      }
    });
  });
  return sorted(values);
}

function validatorsFor(tools) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return Object.fromEntries(tools.map((tool) => [tool.name, ajv.compile(tool.inputSchema)]));
}

const canonicalValidators = validatorsFor(AUTHORING_PROTOCOL_V1_TOOLS);
const actionValidators = validatorsFor(actionTools);

function assertParity(label, toolName, payload, expected) {
  const canonical = canonicalValidators[toolName];
  const action = actionValidators[toolName];
  const canonicalResult = canonical(payload);
  const actionResult = action(payload);
  assert.equal(
    canonicalResult,
    expected,
    `${label}: catálogo canônico: ${JSON.stringify(canonical.errors)}`
  );
  assert.equal(
    actionResult,
    expected,
    `${label}: projeção de Actions: ${JSON.stringify(action.errors)}`
  );
}

test("projeção de Actions deriva todos os vocabulários discriminados do protocolo v1", () => {
  assert.deepEqual(
    actionTools.map(({ name }) => name),
    AUTHORING_PROTOCOL_V1_VOCABULARY.tools
  );
  assert.deepEqual(
    directBranchLiterals(actionByName.lerCurso.inputSchema, "view"),
    sorted(AUTHORING_PROTOCOL_V1_VOCABULARY.readViews)
  );
  assert.deepEqual(
    directBranchLiterals(actionByName.alterarCurso.inputSchema, "operation"),
    sorted(AUTHORING_PROTOCOL_V1_VOCABULARY.changeOperations)
  );
  for (const [property, vocabulary] of [
    ["planCommand", "planCommandTypes"],
    ["designCommand", "designCommandTypes"],
    ["sourceCommand", "sourceCommandTypes"],
    ["annotationCommand", "annotationCommandTypes"],
    ["auditCommand", "auditCommandTypes"],
    ["variantCommand", "variantCommandTypes"]
  ]) {
    assert.deepEqual(
      nestedDiscriminatorLiterals(actionByName.alterarCurso.inputSchema, property, "type"),
      sorted(AUTHORING_PROTOCOL_V1_VOCABULARY[vocabulary]),
      property
    );
  }
  assert.deepEqual(
    nestedDiscriminatorLiterals(
      actionByName.alterarCurso.inputSchema,
      "materializationCommand",
      "operation"
    ),
    sorted(AUTHORING_PROTOCOL_V1_VOCABULARY.materializationOperations)
  );
  assert.deepEqual(
    directBranchLiterals(
      actionByName.consultarComponentesDidaticos.inputSchema,
      "operation"
    ),
    sorted(AUTHORING_PROTOCOL_V1_VOCABULARY.componentOperations)
  );
});

test("projeção Action-safe não deixa allOf, const nem discriminador sem tipo", () => {
  for (const tool of actionTools) {
    assert.deepEqual(findSchemaKeywordPaths(tool.inputSchema, "allOf"), [], tool.name);
    assert.deepEqual(findSchemaKeywordPaths(tool.inputSchema, "const"), [], tool.name);
    walkSchema(tool.inputSchema, (node) => {
      for (const discriminator of ["type", "operation", "view"]) {
        const marker = node.properties?.[discriminator];
        if (marker?.enum?.length === 1) {
          assert.equal(marker.type, "string", `${tool.name}.${discriminator}`);
        }
      }
    });
  }
});

test("OpenAPI final resolve referências pela raiz e usa components.schemas", async () => {
  const openApi = JSON.parse(await fs.readFile(
    new URL("../../docs/downloads/aralearn-chatgpt-action-openapi.yaml", import.meta.url),
    "utf8"
  ));
  assert.deepEqual(findSchemaKeywordPaths(openApi, "$defs"), []);
  const references = [];
  walkSchema(openApi, (node) => {
    if (typeof node.$ref === "string") references.push(node.$ref);
  });
  assert.ok(references.length > 0);
  assert.ok(references.every((reference) => !reference.startsWith("#/$defs")));
  references.filter((reference) => reference.startsWith("#/"))
    .forEach((reference) => resolveLocalReference(openApi, reference));
  assert.deepEqual(
    Object.keys(openApi.components.schemas)
      .filter((name) => name.startsWith("AlterarCurso"))
      .sort(),
    [
      "AlterarCursoCourseEntity",
      "AlterarCursoCourseEntityDelete",
      "AlterarCursoSourceAttributionApplications",
      "AlterarCursoSourceLinks"
    ]
  );

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const documentId = "urn:aralearn:chatgpt-action-openapi";
  ajv.addSchema(openApi, documentId);
  for (const [pathName, pathItem] of Object.entries(openApi.paths)) {
    if (!pathItem.post?.requestBody) continue;
    const schemaReference = `${documentId}#/paths/${jsonPointerToken(pathName)}` +
      "/post/requestBody/content/application~1json/schema";
    assert.doesNotThrow(
      () => ajv.compile({ $ref: schemaReference }),
      `O request schema de ${pathName} precisa compilar no documento OpenAPI completo.`
    );
  }
});

test("projetor classifica dinamicamente toda regra allOf e descarta só a redundante", () => {
  const rules = AUTHORING_PROTOCOL_V1_TOOLS.flatMap((tool) =>
    projectActionInputSchemaWithAudit(tool).rules
  );
  const redundant = rules.filter(({ category }) =>
    category === ACTION_SCHEMA_RULE_CATEGORIES.REDUNDANT
  );
  const documentationOnly = rules.filter(({ category }) =>
    category === ACTION_SCHEMA_RULE_CATEGORIES.DOCUMENTATION_ONLY
  );
  const required = rules.filter(({ category }) =>
    category === ACTION_SCHEMA_RULE_CATEGORIES.REQUIRED
  );
  assert.equal(redundant.length, 1);
  assert.match(redundant[0].reason, /anchors já exige/iu);
  assert.equal(documentationOnly.length, 0);
  assert.equal(required.length, rules.length - 1);
  assert.ok(required.every(({ path, reason }) => path && reason));
});

test("projetor falha diante de allOf público sem compilador conhecido", () => {
  assert.throws(() => projectActionInputSchema({
    name: "regraSintetica",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean" },
        value: { type: "string" }
      },
      allOf: [{
        if: { properties: { enabled: { const: true } }, required: ["enabled"] },
        then: { required: ["value"] }
      }]
    }
  }), /não possui projeção Action-safe/iu);
});

test("AJV preserva CAS, comandos e condicionais nas chamadas de alteração", () => {
  const planEnvelope = {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 1,
    expectedPlanVersion: 1,
    operation: "update_instructional_plan"
  };
  assertParity("update_plan", "alterarCurso", {
    ...planEnvelope,
    planCommand: { type: "update_plan", objective: "Objetivo revisto" }
  }, true);
  assertParity("add_part", "alterarCurso", {
    ...planEnvelope,
    planCommand: {
      type: "add_part",
      id: SECOND_ID,
      position: 0,
      title: "Fundamentos",
      intent: "Organizar a progressão."
    }
  }, true);
  assertParity("tipo de plano inexistente", "alterarCurso", {
    ...planEnvelope,
    planCommand: { type: "tipo_inexistente" }
  }, false);
  assertParity("plano sem CAS", "alterarCurso", {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    operation: "update_instructional_plan",
    planCommand: { type: "update_plan", objective: "Objetivo revisto" }
  }, false);

  const designEnvelope = {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 1,
    operation: "update_course_design"
  };
  const integerParameter = {
    type: "set_parameter",
    scope: { kind: "course", ref: COURSE_ID },
    parameterId: "new_analysis_unit_ceiling_per_expository_study_unit",
    value: 2,
    mode: "automatic",
    reason: "Adequar a granularidade."
  };
  assertParity("parâmetro automático", "alterarCurso", {
    ...designEnvelope,
    designCommand: integerParameter
  }, true);
  assertParity("automático com origem", "alterarCurso", {
    ...designEnvelope,
    designCommand: { ...integerParameter, origin: "author" }
  }, false);
  assertParity("explícito com origem", "alterarCurso", {
    ...designEnvelope,
    designCommand: { ...integerParameter, mode: "explicit", origin: "author" }
  }, true);
  assertParity("explícito sem origem", "alterarCurso", {
    ...designEnvelope,
    designCommand: { ...integerParameter, mode: "explicit" }
  }, false);
  assertParity("valor incompatível com parâmetro", "alterarCurso", {
    ...designEnvelope,
    designCommand: {
      ...integerParameter,
      parameterId: "required_explanation_forms"
    }
  }, false);

  const policy = {
    catalogVersion: COURSE_COMPONENT_CATALOG_VERSION,
    availability: "all",
    allowedRefs: [],
    excludedRefs: [],
    preferredRefs: []
  };
  const policyCommand = {
    type: "set_component_policy",
    scope: { kind: "course", ref: COURSE_ID },
    policy,
    origin: "author",
    reason: "Manter o catálogo completo."
  };
  assertParity("política all", "alterarCurso", {
    ...designEnvelope,
    designCommand: policyCommand
  }, true);
  assertParity("política all não aceita allowlist", "alterarCurso", {
    ...designEnvelope,
    designCommand: {
      ...policyCommand,
      policy: { ...policy, allowedRefs: ["core.item@1.0.0"] }
    }
  }, false);
  assertParity("política allow_only exige allowlist", "alterarCurso", {
    ...designEnvelope,
    designCommand: {
      ...policyCommand,
      policy: { ...policy, availability: "allow_only" }
    }
  }, false);
});

test("AJV preserva Fontes, Observações, variantes e materialização", () => {
  const sourceEnvelope = {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 1,
    operation: "update_course_sources"
  };
  const source = {
    kind: "web_page",
    title: "Fonte",
    authorship: null,
    publicationDate: null,
    identifier: null,
    language: null,
    citationText: null,
    url: null,
    editionOrVersion: null,
    origin: "external",
    availability: "open_access",
    verificationStatus: "unverified",
    studyVisibility: "hidden"
  };
  assertParity("Fonte oculta", "alterarCurso", {
    ...sourceEnvelope,
    sourceCommand: {
      type: "save_source",
      sourceId: "source-1",
      expectedSourceRevision: 0,
      source
    }
  }, true);
  assertParity("Fonte citável exige citação", "alterarCurso", {
    ...sourceEnvelope,
    sourceCommand: {
      type: "save_source",
      sourceId: "source-1",
      expectedSourceRevision: 0,
      source: { ...source, studyVisibility: "citation" }
    }
  }, false);

  const sourceLink = {
    sourceId: "source-1",
    sourceRevision: 1,
    relation: "supported_by",
    anchors: [{ anchorId: "anchor-1", anchorRevision: 1 }]
  };
  const annotationEnvelope = {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    operation: "update_anchored_annotations"
  };
  const answer = {
    type: "respond_to_anchored_annotation",
    annotationId: SECOND_ID,
    expectedAnnotationVersion: 1,
    ownerResponse: "Resposta",
    responseKind: "answer",
    consideredSourceLinks: []
  };
  assertParity("resposta sem Fontes", "alterarCurso", {
    ...annotationEnvelope,
    annotationCommand: answer
  }, true);
  assertParity("resposta não aceita Fontes", "alterarCurso", {
    ...annotationEnvelope,
    annotationCommand: { ...answer, consideredSourceLinks: [sourceLink] }
  }, false);
  assertParity("reformulação exige Fontes", "alterarCurso", {
    ...annotationEnvelope,
    annotationCommand: { ...answer, responseKind: "reformulation" }
  }, false);
  assertParity("reformulação com Fontes", "alterarCurso", {
    ...annotationEnvelope,
    annotationCommand: {
      ...answer,
      responseKind: "reformulation",
      consideredSourceLinks: [sourceLink]
    }
  }, true);
  assertParity("resposta não usa CAS do Curso", "alterarCurso", {
    ...annotationEnvelope,
    expectedRevision: 1,
    annotationCommand: answer
  }, false);

  const variant = {
    type: "create_comparison_variants",
    comparisonSetId: SECOND_ID,
    expectedCourseRevision: 1,
    variants: [
      {
        label: "A",
        title: "A",
        goal: "A",
        parameterDifferences: [],
        componentPolicyDifference: null
      },
      {
        label: "B",
        title: "B",
        goal: "B",
        parameterDifferences: [],
        componentPolicyDifference: null
      }
    ]
  };
  const variantEnvelope = {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    operation: "update_course_variants",
    variantCommand: variant
  };
  assertParity("criação de variantes usa CAS", "alterarCurso", {
    ...variantEnvelope,
    expectedRevision: 1
  }, true);
  assertParity("criação de variantes sem CAS", "alterarCurso", variantEnvelope, false);
  const detachEnvelope = {
    ...variantEnvelope,
    variantCommand: {
      type: "detach_comparison_variant",
      comparisonSetId: SECOND_ID,
      courseId: COURSE_ID
    }
  };
  assertParity("detach sem CAS do Curso", "alterarCurso", detachEnvelope, true);
  assertParity("detach rejeita CAS do Curso", "alterarCurso", {
    ...detachEnvelope,
    expectedRevision: 1
  }, false);

  const materializationEnvelope = {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 1,
    operation: "advance_part_materialization"
  };
  const start = {
    operation: "start",
    authoringPartId: SECOND_ID,
    materializationId: THIRD_ID,
    expectedMaterializationVersion: 0,
    authoringPartVersion: 1,
    steps: [{
      id: THIRD_ID,
      position: 0,
      kind: "context_load",
      targetDidacticMicrosequenceId: null,
      productionPosition: null
    }]
  };
  assertParity("materialização start", "alterarCurso", {
    ...materializationEnvelope,
    materializationCommand: start
  }, true);
  assertParity("materialização start incompleta", "alterarCurso", {
    ...materializationEnvelope,
    materializationCommand: {
      operation: "start",
      authoringPartId: SECOND_ID,
      materializationId: THIRD_ID,
      expectedMaterializationVersion: 0
    }
  }, false);
  assertParity("materialização start versão inicial", "alterarCurso", {
    ...materializationEnvelope,
    materializationCommand: { ...start, expectedMaterializationVersion: 1 }
  }, false);
  assertParity("materialização record_step", "alterarCurso", {
    ...materializationEnvelope,
    materializationCommand: {
      operation: "record_step",
      authoringPartId: SECOND_ID,
      materializationId: THIRD_ID,
      expectedMaterializationVersion: 1,
      stepId: THIRD_ID,
      expectedStepVersion: 1,
      status: "completed",
      resultFacts: {},
      designApplication: null,
      sourceAttributionApplication: null,
      entityChanges: { upserts: [], deletes: [] }
    }
  }, true);
  assertParity("materialização finish", "alterarCurso", {
    ...materializationEnvelope,
    materializationCommand: {
      operation: "finish",
      authoringPartId: SECOND_ID,
      materializationId: THIRD_ID,
      expectedMaterializationVersion: 2,
      status: "completed",
      resultFacts: {}
    }
  }, true);
});

test("AJV preserva vistas, paginação e operações de componentes", () => {
  assertParity("Fontes exigem revisão", "lerCurso", {
    courseId: COURSE_ID,
    view: "course_sources"
  }, false);
  assertParity("plan_item exige UUID", "lerCurso", {
    courseId: COURSE_ID,
    view: "course_sources",
    expectedRevision: 1,
    mode: "target",
    targetKind: "plan_item",
    targetId: "plan-1"
  }, false);
  assertParity("plan_item com UUID", "lerCurso", {
    courseId: COURSE_ID,
    view: "course_sources",
    expectedRevision: 1,
    mode: "target",
    targetKind: "plan_item",
    targetId: SECOND_ID
  }, true);
  assertParity("escopo idless", "lerCurso", {
    courseId: COURSE_ID,
    view: "study_units",
    expectedRevision: 1,
    scope: { kind: "course" }
  }, true);
  assertParity("escopo idless rejeita id", "lerCurso", {
    courseId: COURSE_ID,
    view: "study_units",
    expectedRevision: 1,
    scope: { kind: "course", id: SECOND_ID }
  }, false);
  assertParity("cursor e âncora são exclusivos", "lerCurso", {
    courseId: COURSE_ID,
    view: "study_units",
    expectedRevision: 1,
    cursor: { studyUnitId: "unit-1" },
    anchorStudyUnitId: "unit-1"
  }, false);
  assertParity("entities limita cem itens", "lerCurso", {
    courseId: COURSE_ID,
    view: "entities",
    expectedRevision: 1,
    limit: 101
  }, false);

  assertParity("contracts exige package", "consultarComponentesDidaticos", {
    operation: "contracts"
  }, false);
  assertParity("contracts", "consultarComponentesDidaticos", {
    operation: "contracts",
    packages: ["core.item@1.0.0"]
  }, true);
  assertParity("inspect exige package", "consultarComponentesDidaticos", {
    operation: "inspect"
  }, false);
  assertParity("validate exige JSON", "consultarComponentesDidaticos", {
    operation: "validate_study_unit"
  }, false);
  assertParity("preview local", "consultarComponentesDidaticos", {
    operation: "preview_study_unit",
    studyUnitJson: "{}"
  }, true);
  assertParity("preview rejeita alvo parcial", "consultarComponentesDidaticos", {
    operation: "preview_study_unit",
    studyUnitJson: "{}",
    courseId: COURSE_ID
  }, false);
  assertParity("preview com alvo", "consultarComponentesDidaticos", {
    operation: "preview_study_unit",
    studyUnitJson: "{}",
    courseId: COURSE_ID,
    studyUnitId: "unit-1"
  }, true);
});

test("catálogo canônico permanece separado da projeção Action-safe", () => {
  assert.notStrictEqual(
    actionByName.alterarCurso.inputSchema,
    canonicalByName.alterarCurso.inputSchema
  );
  assert.ok(findSchemaKeywordPaths(canonicalByName.alterarCurso.inputSchema, "allOf").length);
  assert.deepEqual(findSchemaKeywordPaths(actionByName.alterarCurso.inputSchema, "allOf"), []);
});
