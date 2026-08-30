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
  AUTHORING_ACTION_V1_DEDICATED_PROJECTIONS
} from "../../supabase/functions/_shared/aralearn-authoring/authoringActionProjectionV1.js";
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

function resolveSchema(document, schema) {
  const visited = new Set();
  let resolved = schema;
  while (typeof resolved?.$ref === "string") {
    assert.equal(visited.has(resolved.$ref), false, `Referência circular: ${resolved.$ref}`);
    visited.add(resolved.$ref);
    resolved = resolveLocalReference(document, resolved.$ref);
  }
  return resolved;
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

test("Actions projeta o PDF canônico somente pelo transporte oficial de arquivos", () => {
  const canonical = canonicalByName.incorporarPdfComoFonte.inputSchema;
  const action = actionByName.incorporarPdfComoFonte.inputSchema;

  assert.ok(canonical.properties.pdf);
  assert.ok(canonical.required.includes("pdf"));
  assert.equal(action.properties.pdf, undefined);
  assert.equal(action.required.includes("pdf"), false);
  assert.deepEqual(action.properties.openaiFileIdRefs, {
    type: "array",
    minItems: 1,
    maxItems: 1,
    items: { type: "string" },
    description:
      "Referência ao único PDF enviado pela pessoa nesta conversa. O ChatGPT preenche este campo com a referência temporária do arquivo."
  });
  assert.ok(action.required.includes("openaiFileIdRefs"));

  const source = {
    kind: "document",
    title: "Edital Dataprev 2026",
    authorship: null,
    publicationDate: "2026",
    identifier: null,
    language: "pt-BR",
    citationText: "Edital Dataprev 2026",
    url: null,
    editionOrVersion: null,
    origin: "author_provided",
    availability: "private",
    verificationStatus: "author_verified",
    studyVisibility: "citation"
  };
  const payload = {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 1,
    sourceIntent: {
      newSource: source
    },
    openaiFileIdRefs: ["file-synthetic"]
  };
  const validate = actionValidators.incorporarPdfComoFonte;
  assert.equal(validate(payload), false);
  assert.ok(validate.errors.some((error) =>
    error.keyword === "additionalProperties" &&
    ["kind", "origin", "availability", "verificationStatus", "studyVisibility"]
      .includes(error.params.additionalProperty)
  ));
  const minimalCreation = {
    ...payload,
    sourceIntent: {
      newSource: { title: "Edital Dataprev 2026" }
    }
  };
  assert.equal(validate(minimalCreation), true, JSON.stringify(validate.errors));
  assert.deepEqual(
    Object.keys(action.properties.sourceIntent.properties.newSource.properties),
    [
      "title", "authorship", "publicationDate", "identifier", "language",
      "citationText", "url", "editionOrVersion"
    ]
  );
  assert.equal(validate({
    ...minimalCreation,
    sourceIntent: {
      ...minimalCreation.sourceIntent,
      existingSource: { sourceId: "source-existing", sourceRevision: 1 }
    }
  }), false);
  assert.equal(validate({ ...minimalCreation, sourceIntent: {} }), false);
  assert.equal(validate({
    ...payload,
    sourceIntent: {
      revisedSource: {
        sourceId: "source-existing",
        expectedSourceRevision: 1,
        source: { title: "Edital Dataprev 2026" }
      }
    }
  }), false);
  assert.equal(validate({
    ...payload,
    sourceIntent: {
      revisedSource: {
        sourceId: "source-existing",
        expectedSourceRevision: 1,
        source: { ...source, citationText: null }
      }
    }
  }), false);
  assert.equal(validate({
    ...payload,
    sourceIntent: {
      revisedSource: {
        sourceId: "source-existing",
        expectedSourceRevision: 1,
        source
      }
    }
  }), true, JSON.stringify(validate.errors));
  assert.equal(validate({
    ...payload,
    sourceIntent: {
      existingSource: { sourceId: "source-existing", sourceRevision: 1 }
    }
  }), true, JSON.stringify(validate.errors));
});

test("projeção Action-safe não deixa allOf, const nem discriminador sem tipo", () => {
  for (const tool of actionTools) {
    assert.equal(tool.inputSchema.type, "object", `${tool.name}: raiz importável`);
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

test("OpenAPI entrega propriedades completas na raiz que o importador preserva", async () => {
  const openApi = JSON.parse(await fs.readFile(
    new URL("../../docs/downloads/aralearn-chatgpt-action-openapi.yaml", import.meta.url),
    "utf8"
  ));
  assert.deepEqual(
    openApi.components.schemas.IncorporarPdfComoFonteSourceIntent
      .properties.newSource.required,
    ["title"],
    "a Action publicada deve aceitar a criação de Fonte sem metadados inventados"
  );
  assert.equal(
    openApi.components.schemas.IncorporarPdfComoFonteSourceIntent
      .properties.newSource.properties.studyVisibility,
    undefined,
    "controles operacionais não podem reaparecer na criação publicada"
  );
  const publishedSourceIntent =
    openApi.components.schemas.IncorporarPdfComoFonteSourceIntent;
  assert.equal(publishedSourceIntent.minProperties, 1);
  assert.equal(publishedSourceIntent.maxProperties, 1);
  assert.equal(publishedSourceIntent.properties.mode, undefined);
  const validatePublishedSourceIntent = new Ajv2020({ allErrors: true, strict: false })
    .compile(publishedSourceIntent);
  assert.equal(validatePublishedSourceIntent({
    newSource: { title: "Edital Dataprev 2026" }
  }), true, JSON.stringify(validatePublishedSourceIntent.errors));
  assert.equal(validatePublishedSourceIntent({}), false);
  assert.equal(validatePublishedSourceIntent({ mode: "create" }), false);
  assert.equal(validatePublishedSourceIntent({
    newSource: { title: "Edital Dataprev 2026" },
    existingSource: { sourceId: "source-existing", sourceRevision: 1 }
  }), false);
  for (const [pathName, pathItem] of Object.entries(openApi.paths)) {
    const schema = pathItem.post?.requestBody?.content?.["application/json"]?.schema;
    if (!schema) continue;
    assert.equal(
      schema.type,
      "object",
      `${pathName}: o importador do ChatGPT exige raiz de request body do tipo object.`
    );
    assert.ok(
      schema.properties && Object.keys(schema.properties).length,
      `${pathName}: o importador do ChatGPT exige properties na raiz.`
    );
  }
  for (const [pathName, discriminator, vocabulary] of [
    ["/lerCurso", "view", "readViews"],
    ["/alterarCurso", "operation", "changeOperations"],
    ["/consultarComponentesDidaticos", "operation", "componentOperations"]
  ]) {
    const schema = openApi.paths[pathName].post.requestBody
      .content["application/json"].schema;
    assert.deepEqual(
      sorted(schema.properties[discriminator].enum),
      sorted(AUTHORING_PROTOCOL_V1_VOCABULARY[vocabulary]),
      `${pathName}: o vocabulário discriminado precisa chegar à superfície importada.`
    );
    assert.equal(schema.properties[discriminator].type, "string", pathName);
    assert.equal(schema.oneOf, undefined, `${pathName}: o importador ignora o union raiz.`);
  }

  const change = openApi.paths["/alterarCurso"].post.requestBody
    .content["application/json"].schema;
  for (const field of [
    "expectedRevision",
    "expectedPlanVersion",
    "planCommand",
    "designCommand",
    "sourceCommand",
    "annotationCommand",
    "auditCommand",
    "variantCommand",
    "materializationCommand"
  ]) {
    assert.ok(change.properties[field], `alterarCurso.${field}`);
  }
  for (const [field, vocabulary] of [
    ["planCommand", "planCommandTypes"],
    ["designCommand", "designCommandTypes"],
    ["sourceCommand", "sourceCommandTypes"],
    ["annotationCommand", "annotationCommandTypes"],
    ["auditCommand", "auditCommandTypes"],
    ["variantCommand", "variantCommandTypes"]
  ]) {
    const command = resolveSchema(openApi, change.properties[field]);
    assert.equal(command.type, "object", field);
    assert.ok(command.required.includes("type"), `${field}.type obrigatório`);
    assert.equal(command.properties.type.type, "string", `${field}.type`);
    const dedicatedTypes = new Set(AUTHORING_ACTION_V1_DEDICATED_PROJECTIONS
      .filter(({ commandProperty }) => commandProperty === field)
      .map(({ commandType }) => commandType));
    if (field === "sourceCommand") dedicatedTypes.add("attach_pdf");
    assert.deepEqual(
      sorted(command.properties.type.enum),
      sorted(AUTHORING_PROTOCOL_V1_VOCABULARY[vocabulary]
        .filter((type) => !dedicatedTypes.has(type))),
      field
    );
  }
  const planCommand = resolveSchema(openApi, change.properties.planCommand);
  const materializationCommand = resolveSchema(
    openApi,
    change.properties.materializationCommand
  );
  assert.deepEqual(
    sorted(materializationCommand.properties.operation.enum),
    sorted(AUTHORING_PROTOCOL_V1_VOCABULARY.materializationOperations)
  );
  assert.match(change.properties.expectedRevision.description, /update_instructional_plan/u);
  assert.match(change.properties.expectedPlanVersion.description, /update_instructional_plan/u);
  assert.match(planCommand.description, /update_instructional_plan/u);
  for (const field of ["id", "position", "title", "intent"]) {
    assert.doesNotMatch(
      planCommand.properties[field].description,
      /add_part/u,
      `${field} genérico não anuncia a operação dedicada removida`
    );
  }
  const addPart = resolveSchema(
    openApi,
    openApi.paths["/add_part"].post.requestBody
      .content["application/json"].schema.properties.planCommand
  );
  assert.equal(addPart.properties.id, undefined);
  assert.deepEqual(addPart.properties.type.enum, ["add_part"]);
  assert.equal(addPart.properties.position.maximum, 63);
  assert.match(addPart.properties.position.description, /zero-based.*primeira Parte/iu);
  assert.deepEqual(
    sorted(resolveSchema(openApi, change.properties.designCommand).properties.mode.enum),
    ["automatic", "explicit"]
  );
  const design = resolveSchema(openApi, change.properties.designCommand).properties;
  assert.match(
    design.value.description,
    /Formato em [^.]*parameterId=new_analysis_unit_ceiling[^.]*: inteiro \(mínimo 1, máximo 64\)\./iu
  );
  assert.match(
    design.value.description,
    /Formato em [^.]*parameterId=minimum_distinct_practice_opportunities[^.]*: inteiro \(mínimo 1, máximo 64\)\./iu
  );
  assert.match(
    design.value.description,
    /Formato em [^.]*parameterId=required_explanation_forms[^.]*: lista \(mínimo 1, máximo 8\) de texto entre plain_definition[^.]*representation_link\./iu
  );
  assert.match(
    design.value.description,
    /Formato em [^.]*parameterId=required_practice_variation_dimensions[^.]*: lista \(mínimo 1, máximo 5\) de texto entre case_or_data[^.]*support_level\./iu
  );
  assert.match(design.value.description, /mode=automatic/iu);
  assert.match(design.value.description, /mode=explicit/iu);
  assert.match(design.origin.description, /mode=explicit/iu);
  assert.doesNotMatch(design.origin.description, /mode=automatic/iu);
  assert.match(
    design.policy.properties.allowedRefs.description,
    /availability=all.*máximo 0/iu
  );
  assert.match(
    design.policy.properties.allowedRefs.description,
    /availability=allow_only.*mínimo 1/iu
  );

  const read = openApi.paths["/lerCurso"].post.requestBody
    .content["application/json"].schema;
  for (const field of ["expectedRevision", "scope", "mode", "cursor"]) {
    assert.ok(read.properties[field], `lerCurso.${field}`);
  }
  assert.match(read.properties.sourceId.description, /view=course_sources, mode=source/iu);
  assert.match(
    read.properties.findingId.description,
    /view=audit_cycle, mode=detail, com findingId/iu
  );
  assert.match(
    read.properties.auditRunId.description,
    /view=audit_cycle, mode=detail, com auditRunId/iu
  );
  for (const field of ["findingId", "auditRunId"]) {
    assert.match(
      read.properties[field].description,
      /view=audit_cycle, mode=detail`, envie exatamente um de `findingId` ou `auditRunId`; não envie mais de um\./u
    );
  }
  assert.match(read.properties.targetStudyUnitId.description, /view=audit_cycle, mode=context/iu);
  const materialization = resolveSchema(
    openApi,
    change.properties.materializationCommand
  ).properties;
  assert.equal(materialization.materializationId.type, "string");
  assert.equal(materialization.materializationId.anyOf, undefined);
  assert.match(
    materialization.materializationId.description,
    /Ao iniciar, omita.*record_step.*finish.*preserve/iu
  );
  assert.match(
    materialization.expectedMaterializationVersion.description,
    /operation=start`: inteiro 0\./u
  );
  assert.match(
    materialization.steps.items.properties.targetDidacticMicrosequenceId.description,
    /kind=context_load`, `kind=validation`: null\. Formato em `kind=didactic_microsequence_materialization`: texto\./u
  );
  assert.match(
    materialization.steps.items.properties.productionPosition.description,
    /kind=context_load`, `kind=validation`: null\. Formato em `kind=didactic_microsequence_materialization`: inteiro \(mínimo 0, máximo 63\)\./u
  );
  const components = openApi.paths["/consultarComponentesDidaticos"].post.requestBody
    .content["application/json"].schema;
  for (const field of ["packages", "studyUnitJson", "courseId", "studyUnitId"]) {
    assert.ok(components.properties[field], `consultarComponentesDidaticos.${field}`);
  }
  const courseEntity = openApi.components.schemas.AlterarCursoCourseEntity;
  assert.equal(courseEntity.type, "object");
  assert.equal(courseEntity.oneOf, undefined);
  assert.deepEqual(
    sorted(courseEntity.properties.entityType.enum),
    ["lesson", "microsequence", "module", "study_unit", "topic"]
  );
  assert.match(courseEntity.properties.content.description, /entityType=module/iu);
  assert.match(courseEntity.properties.content.description, /entityType=study_unit/iu);
  assert.equal(
    courseEntity.properties.content.properties.branchOfUpsertIndex.maximum,
    199
  );
  assert.equal(
    courseEntity.properties.content.properties.dependsOnUpsertIndexes.items.type,
    "integer"
  );
  assert.deepEqual(findSchemaKeywordPaths(openApi, "oneOf"), []);
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
      "AlterarCursoAnnotationCommand",
      "AlterarCursoAuditCommand",
      "AlterarCursoCourseEntity",
      "AlterarCursoCourseEntityDelete",
      "AlterarCursoDesignCommand",
      "AlterarCursoMaterializationCommand",
      "AlterarCursoPlanCommand",
      "AlterarCursoSourceAttributionApplications",
      "AlterarCursoSourceCommand",
      "AlterarCursoSourceLinks",
      "AlterarCursoVariantCommand"
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

test("OpenAPI final especializa os comandos de item do plano sem unions condicionais", async () => {
  const openApi = JSON.parse(await fs.readFile(
    new URL("../../docs/downloads/aralearn-chatgpt-action-openapi.yaml", import.meta.url),
    "utf8"
  ));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const documentId = "urn:aralearn:chatgpt-action-plan-items";
  ajv.addSchema(openApi, documentId);
  const genericSchema = resolveSchema(
    openApi,
    openApi.paths["/alterarCurso"].post.requestBody
      .content["application/json"].schema.properties.planCommand
  );
  const dedicatedTypes = AUTHORING_ACTION_V1_DEDICATED_PROJECTIONS
    .map(({ commandType }) => commandType);
  const genericTypes = genericSchema.properties.type.enum;
  const projectedTypes = [...genericTypes, ...dedicatedTypes];
  assert.deepEqual(
    dedicatedTypes.filter((type) => genericTypes.includes(type)),
    [],
    "alterarCurso não deve competir com as Actions dedicadas."
  );
  assert.equal(
    new Set(projectedTypes).size,
    projectedTypes.length,
    "Cada comando do plano precisa pertencer a uma única operação de Actions."
  );
  assert.deepEqual(
    sorted(projectedTypes),
    sorted(AUTHORING_PROTOCOL_V1_VOCABULARY.planCommandTypes),
    "A projeção genérica e as dedicadas precisam cobrir juntas o vocabulário canônico."
  );
  assert.equal(genericSchema.anyOf, undefined);
  assert.equal(genericSchema.oneOf, undefined);
  assert.equal(
    resolveSchema(
      openApi,
      openApi.paths["/alterarCurso"].post.requestBody.content["application/json"]
        .schema.properties.sourceCommand
    ).properties.type.enum.includes("attach_pdf"),
    false,
    "Actions não deve oferecer o comando que pressupõe metadados internos de Storage."
  );

  const base = {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    operation: "update_instructional_plan",
    expectedRevision: 3,
    expectedPlanVersion: 2
  };
  const canonicalPlanCommand = canonicalByName.alterarCurso.inputSchema
    .properties.planCommand;
  const addPlanItem = canonicalPlanCommand.oneOf.find(
    (branch) => branch.properties.type.const === "add_plan_item"
  );
  const planItemKinds = addPlanItem.properties.kind.enum;
  assert.deepEqual(planItemKinds, [
    "intended_learning_outcome",
    "instructional_analysis_unit",
    "evidence_requirement"
  ]);

  for (const projection of AUTHORING_ACTION_V1_DEDICATED_PROJECTIONS) {
    const pathItem = openApi.paths[projection.path];
    assert.equal(pathItem.post.operationId, projection.operationId);
    const schema = pathItem.post.requestBody.content["application/json"].schema;
    for (const keyword of ["oneOf", "anyOf", "allOf"]) {
      assert.deepEqual(
        findSchemaKeywordPaths(schema, keyword),
        [],
        `${projection.operationId} não pode depender de ${keyword}.`
      );
    }
    assert.deepEqual(schema.properties.operation.enum, [projection.operation]);
    const planCommand = resolveSchema(openApi, schema.properties.planCommand);
    assert.deepEqual(
      planCommand.properties.type.enum,
      [projection.commandType]
    );
    assert.equal(schema.additionalProperties, false);
    assert.equal(planCommand.additionalProperties, false);
    const projectedCanonicalPlanCommand = actionByName.alterarCurso.inputSchema
      .properties.planCommand;
    const canonicalVariant = projectedCanonicalPlanCommand.oneOf.find(
      (branch) => branch.properties.type.enum[0] === projection.commandType
    );
    const forbiddenProperties = new Set(
      canonicalVariant.not.anyOf.map((rule) => rule.required[0])
    );
    const generatedIdentityFields = new Set(projection.generatedIdentityFields || []);
    assert.deepEqual(
      sorted(Object.keys(planCommand.properties)),
      sorted(Object.keys(projectedCanonicalPlanCommand.properties)
        .filter((name) =>
          !forbiddenProperties.has(name) && !generatedIdentityFields.has(name)
        )),
      `${projection.operationId} precisa conservar todos os campos permitidos pela variante.`
    );
    assert.ok(schema.required.includes("expectedRevision"));
    assert.ok(schema.required.includes("expectedPlanVersion"));
    assert.ok(schema.required.includes("planCommand"));
    const validate = ajv.compile({
      $ref: `${documentId}#/paths/${jsonPointerToken(projection.path)}` +
        "/post/requestBody/content/application~1json/schema"
    });

    const commands = projection.commandType === "add_plan_item"
      ? planItemKinds.map((kind) => ({
          type: "add_plan_item",
          kind,
          position: 0,
          statement: `Item ${kind}`,
          sourceLinks: []
        }))
      : projection.commandType === "update_plan_item"
        ? planItemKinds.map((kind) => ({
            type: "update_plan_item",
            kind,
            id: SECOND_ID,
            statement: `Item ${kind}`,
            sourceLinks: []
          }))
        : [{
            type: "add_part",
            position: 0,
            title: "Fundamentos de Linux",
            intent: "Introduzir terminal, arquivos e permissões."
          }];
    for (const command of commands) {
      const type = projection.commandType;
      assert.equal(
        validate({ ...base, planCommand: command }),
        true,
        `${type}: ${JSON.stringify(validate.errors)}`
      );
      assert.equal(Object.hasOwn(command, "id"), type === "update_plan_item");
      if (Object.hasOwn(command, "sourceLinks")) {
        const { sourceLinks, ...withoutSourceLinks } = command;
        assert.deepEqual(sourceLinks, []);
        assert.equal(
          validate({ ...base, planCommand: withoutSourceLinks }),
          false,
          `${type} não pode omitir sourceLinks.`
        );
      }
      assert.equal(
        validate({
          ...base,
          planCommand: {
            ...command,
            type: type === "add_plan_item" ? "update_plan_item" : "add_plan_item"
          }
        }),
        false,
        `${projection.operationId} não aceita o discriminador da outra Action.`
      );
      assert.equal(
        validate({ ...base, planCommand: { ...command, extra: true } }),
        false,
        `${projection.operationId} não aceita campo extra no comando.`
      );
      assert.equal(
        validate({ ...base, planCommand: command, extra: true }),
        false,
        `${projection.operationId} não aceita campo extra no envelope.`
      );
    }
  }

  const validateGeneric = ajv.compile({
    $ref: `${documentId}#/paths/~1alterarCurso/post/requestBody/content/application~1json/schema`
  });
  for (const planCommandValue of [
    { type: "update_plan", objective: "Objetivo preservado" },
    {
      type: "update_part",
      id: THIRD_ID,
      title: "Parte preservada",
      intent: "Organizar a progressão."
    }
  ]) {
    assert.equal(
      validateGeneric({ ...base, planCommand: planCommandValue }),
      true,
      JSON.stringify(validateGeneric.errors)
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
  assertParity("Fonte nova dispensa identidade", "alterarCurso", {
    ...sourceEnvelope,
    sourceCommand: {
      type: "save_source",
      expectedSourceRevision: 0,
      source
    }
  }, true);
  assertParity("Fonte existente preserva identidade", "alterarCurso", {
    ...sourceEnvelope,
    sourceCommand: {
      type: "save_source",
      expectedSourceRevision: 1,
      source
    }
  }, false);
  assertParity("Âncora nova dispensa identidade", "alterarCurso", {
    ...sourceEnvelope,
    sourceCommand: {
      type: "save_anchor",
      sourceId: "source-1",
      sourceRevision: 1,
      expectedAnchorRevision: 0,
      selector: { kind: "page_range", startPage: 44, endPage: 44 },
      verificationExcerpt: "Gestão de Servidores"
    }
  }, true);
  assertParity("Âncora existente preserva identidade", "alterarCurso", {
    ...sourceEnvelope,
    sourceCommand: {
      type: "save_anchor",
      sourceId: "source-1",
      sourceRevision: 1,
      expectedAnchorRevision: 1,
      selector: { kind: "page_range", startPage: 44, endPage: 44 },
      verificationExcerpt: "Gestão de Servidores"
    }
  }, false);
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
  assertParity("Observação nova dispensa identidade", "alterarCurso", {
    ...annotationEnvelope,
    expectedRevision: 1,
    annotationCommand: {
      type: "create_anchored_annotation",
      target: { kind: "course", id: COURSE_ID },
      rawText: "Revisar a progressão desta Parte.",
      category: "suggestion",
      capturedAt: null,
      briefSummary: "Revisar progressão",
      confirmed: true
    }
  }, true);
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
  const naturalVariantEnvelope = structuredClone(variantEnvelope);
  delete naturalVariantEnvelope.variantCommand.comparisonSetId;
  assertParity("comparação nova dispensa identidade", "alterarCurso", {
    ...naturalVariantEnvelope,
    expectedRevision: 1
  }, true);
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

  const auditCheck = (dimension, index) => ({
    dimension,
    criterion: {
      code: `${dimension}.review-${index}`,
      version: "1",
      statement: `Critério público ${index}.`
    },
    result: index === 1 ? "failed" : "not_checked",
    publicEvidence: `Evidência pública ${index}.`,
    adequacy: index === 1 ? "insufficient" : "not_assessed",
    planItemRefs: [],
    parameterRefs: [],
    sourceLinks: []
  });
  assertParity("auditoria e achado novos dispensam identidades", "alterarCurso", {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 1,
    operation: "update_audit_cycle",
    auditCommand: {
      type: "record_audit",
      targetStudyUnitId: "study-unit-1",
      contextHash: "a".repeat(64),
      origin: "human_audit",
      method: { id: "manual-review", version: "1" },
      checks: [
        auditCheck("pedagogical_quality", 0),
        auditCheck("factual_quality", 1),
        auditCheck("editorial_quality", 2)
      ],
      findings: [{
        checkIndex: 1,
        code: "factual_quality.missing-source",
        severity: "high",
        annotationRefs: []
      }]
    }
  }, true);
  assertParity("correção nova dispensa identidade", "alterarCurso", {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 1,
    operation: "update_audit_cycle",
    auditCommand: {
      type: "propose_authoring_correction",
      findingId: SECOND_ID,
      expectedFindingVersion: 1,
      expectedCorrectionVersion: 0,
      afterContent: {},
      afterSourceLinks: [],
      rationale: "Corrigir o achado confirmado."
    }
  }, true);

  assertParity("composição nova dispensa identidades técnicas", "alterarCurso", {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 1,
    operation: "commit_course_composition",
    upserts: [{
      entityType: "module",
      parentType: null,
      position: 0,
      content: {
        title: "Fundamentos",
        guide: { goal: "Introduzir Linux.", include: [], exclude: [], notation: [], avoid: [] }
      }
    }, {
      entityType: "lesson",
      parentType: "module",
      parentUpsertIndex: 0,
      position: 0,
      content: {
        title: "Terminal",
        guide: { goal: "Usar o terminal.", include: [], exclude: [], notation: [], avoid: [] }
      }
    }, {
      entityType: "topic",
      parentType: "lesson",
      parentUpsertIndex: 1,
      position: 0,
      content: { label: "Permissões", kind: "concept", checks: [], errors: [] }
    }, {
      entityType: "microsequence",
      parentType: "lesson",
      parentUpsertIndex: 1,
      position: 0,
      content: {
        title: "Permissões no terminal",
        goal: "Interpretar permissões.",
        role: "explain",
        dependsOn: [],
        covers: [],
        checks: [],
        errors: []
      }
    }, {
      entityType: "study_unit",
      parentType: "microsequence",
      parentUpsertIndex: 3,
      position: 1,
      content: {}
    }],
    deletes: [],
    sourceAttributionApplications: [{ studyUnitUpsertIndex: 4, sourceLinks: [] }]
  }, true);

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
  const naturalStart = structuredClone(start);
  delete naturalStart.materializationId;
  delete naturalStart.steps[0].id;
  assertParity("materialização start sem IDs novos", "alterarCurso", {
    ...materializationEnvelope,
    materializationCommand: naturalStart
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
  assertParity("materialização record_step preserva identidade", "alterarCurso", {
    ...materializationEnvelope,
    materializationCommand: {
      operation: "record_step",
      authoringPartId: SECOND_ID,
      expectedMaterializationVersion: 1,
      stepId: THIRD_ID,
      expectedStepVersion: 1,
      status: "completed",
      resultFacts: {},
      designApplication: null,
      sourceAttributionApplication: null,
      entityChanges: { upserts: [], deletes: [] }
    }
  }, false);
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
  for (const invalidIdentity of [null, { generated: "não" }]) {
    assertParity("materialização finish rejeita identidade inválida", "alterarCurso", {
      ...materializationEnvelope,
      materializationCommand: {
        operation: "finish",
        authoringPartId: SECOND_ID,
        materializationId: invalidIdentity,
        expectedMaterializationVersion: 2,
        status: "completed",
        resultFacts: {}
      }
    }, false);
  }
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
