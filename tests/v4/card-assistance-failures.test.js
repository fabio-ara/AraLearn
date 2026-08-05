import test from "node:test";
import assert from "node:assert/strict";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import {
  buildCardAssistanceContextPacket,
  generateCardAssistanceChangeSet
} from "../../src/generation/runtime/cardAssistanceRuntime.js";
import {
  buildExactAuthoringBlockSchema,
  buildExactAuthoringCardSchema
} from "../../src/generation/engine/cardAuthoringSchema.js";
import {
  ProviderStructuredOutputError,
  toStrictJsonSchema
} from "../../src/generation/providers/structuredOutput.js";
import {
  getAuthoringResourceContract,
  listResourceIds
} from "../../src/resources/registry/index.js";

function paragraphCard(id, position, content) {
  return {
    id,
    position,
    resource: "paragraph",
    kind: "theory",
    exercise: "none",
    title: `Card ${position}`,
    text: content,
    after: ""
  };
}

function projectFixture() {
  return {
    contract: "aralearn.contract",
    version: 4,
    kind: "project",
    courses: [{
      id: "course-a",
      title: "Curso",
      goal: "Aprender.",
      modules: [{
        id: "module-a",
        title: "Módulo",
        guide: {
          goal: "Compreender.",
          include: [],
          exclude: [],
          notation: [],
          avoid: []
        },
        lessons: [{
          id: "lesson-a",
          title: "Lição",
          guide: {
            goal: "Explicar.",
            include: [],
            exclude: [],
            notation: [],
            avoid: []
          },
          topics: [],
          microsequences: [{
            id: "micro-a",
            title: "Microssequência",
            goal: "Apresentar o conceito.",
            role: "explain",
            status: "generated",
            dependsOn: [],
            covers: [],
            checks: [],
            cards: [
              paragraphCard("card-a", 1, "Texto original."),
              paragraphCard("card-b", 2, "Texto vizinho.")
            ]
          }]
        }]
      }]
    }]
  };
}

const selection = {
  courseKey: "course-a",
  moduleKey: "module-a",
  lessonKey: "lesson-a",
  microsequenceKey: "micro-a",
  cardKey: "card-a"
};

function selectedCard(project) {
  return project.courses[0].modules[0].lessons[0].microsequences[0].cards[0];
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function strictAjv() {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    allowUnionTypes: true
  });
  addFormats(ajv);
  return ajv;
}

function assertStrictObjectsAreClosed(schema, path = "$") {
  if (!schema || typeof schema !== "object") return;
  if (Array.isArray(schema)) {
    schema.forEach((item, index) => assertStrictObjectsAreClosed(item, `${path}[${index}]`));
    return;
  }
  if (schema.type === "object" && schema.properties) {
    assert.equal(schema.additionalProperties, false, path);
    assert.deepEqual(
      new Set(schema.required),
      new Set(Object.keys(schema.properties)),
      path
    );
  }
  Object.entries(schema).forEach(([key, value]) => {
    assertStrictObjectsAreClosed(value, `${path}.${key}`);
  });
}

function resolveLocalReference(rootSchema, reference) {
  assert.match(reference, /^#\//u);
  return reference
    .slice(2)
    .split("/")
    .map((token) => token.replace(/~1/gu, "/").replace(/~0/gu, "~"))
    .reduce((value, token) => value?.[token], rootSchema);
}

function typeMatches(type, value) {
  if (Array.isArray(type)) return type.some((item) => typeMatches(item, value));
  if (!type) return true;
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number";
  return typeof value === type;
}

function unionBranchScore(schema, value, rootSchema) {
  const resolved = schema?.$ref
    ? resolveLocalReference(rootSchema, schema.$ref)
    : schema;
  if (!resolved || !typeMatches(resolved.type, value)) return Number.NEGATIVE_INFINITY;
  if (Object.hasOwn(resolved, "const") && resolved.const !== value) {
    return Number.NEGATIVE_INFINITY;
  }
  if (Array.isArray(resolved.enum) && !resolved.enum.includes(value)) {
    return Number.NEGATIVE_INFINITY;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return 1;
  let score = 1;
  Object.entries(resolved.properties || {}).forEach(([fieldName, fieldSchema]) => {
    if (!Object.hasOwn(value, fieldName)) return;
    score += 2;
    if (Object.hasOwn(fieldSchema, "const")) {
      score += fieldSchema.const === value[fieldName] ? 20 : -100;
    }
    if (Array.isArray(fieldSchema.enum)) {
      score += fieldSchema.enum.includes(value[fieldName]) ? 10 : -100;
    }
  });
  Object.keys(value).forEach((fieldName) => {
    if (!Object.hasOwn(resolved.properties || {}, fieldName)) score -= 4;
  });
  return score;
}

function materializeStrictValue(schema, value, rootSchema = schema) {
  if (schema?.$ref) {
    return materializeStrictValue(
      resolveLocalReference(rootSchema, schema.$ref),
      value,
      rootSchema
    );
  }
  if (Array.isArray(schema?.anyOf)) {
    const nullBranch = schema.anyOf.find((branch) => branch?.type === "null");
    if (value === undefined && nullBranch) return null;
    const candidates = schema.anyOf.filter((branch) => branch !== nullBranch);
    const selected = candidates
      .map((branch) => ({
        branch,
        score: unionBranchScore(branch, value, rootSchema)
      }))
      .sort((left, right) => right.score - left.score)[0]?.branch;
    return materializeStrictValue(selected, value, rootSchema);
  }
  if (
    schema?.type === "object" ||
    (schema?.properties && typeof schema.properties === "object")
  ) {
    const source = value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
    return Object.fromEntries(
      Object.entries(schema.properties || {}).map(([fieldName, fieldSchema]) => [
        fieldName,
        materializeStrictValue(
          fieldSchema,
          Object.hasOwn(source, fieldName) ? source[fieldName] : undefined,
          rootSchema
        )
      ])
    );
  }
  if (schema?.type === "array" && Array.isArray(value)) {
    return value.map((item) => materializeStrictValue(schema.items, item, rootSchema));
  }
  return value;
}

test("saída semanticamente inválida tem no máximo duas tentativas de construção", async () => {
  const project = projectFixture();
  const original = structuredClone(project);
  const requests = [];
  const progress = [];
  const provider = {
    async generateStructured(request) {
      requests.push(request);
      if (request.phase === "card_assistance_representation") {
        return { value: { representation: "paragraph:theory:none" } };
      }
      return {
        value: {
          card: {
            id: "card-a",
            position: 1,
            resource: "paragraph",
            kind: "theory",
            exercise: "none",
            title: "Conceito",
            text: "",
            after: ""
          }
        }
      };
    }
  };

  await assert.rejects(
    () => generateCardAssistanceChangeSet({
      projectDocument: project,
      selection,
      request: {
        operation: "repair",
        repairScope: "card",
        promptText: "Reescreva o card."
      },
      provider,
      modelId: "fake:model",
      onProgress(event) {
        progress.push(event);
      }
    }),
    /card produzido é inválido|text é obrigatório/u
  );

  assert.deepEqual(
    requests.map((request) => request.phase),
    [
      "card_assistance_representation",
      "card_assistance_build",
      "card_assistance_build"
    ]
  );
  assert.equal(requests[1].engineContext.validationFeedback.length, 0);
  assert.equal(requests[2].engineContext.validationFeedback.length, 1);
  assert.equal(
    progress.filter((event) => event.status === "retry").length,
    1
  );
  assert.deepEqual(project, original);
});

test("recusa, truncamento e falha do provider não alteram o projeto", async (t) => {
  const failures = [
    new ProviderStructuredOutputError(
      "O modelo recusou a solicitação.",
      "structured_refusal"
    ),
    new ProviderStructuredOutputError(
      "A resposta foi truncada.",
      "response_truncated"
    ),
    Object.assign(new Error("Falha de rede."), { code: "ECONNRESET" })
  ];

  for (const failure of failures) {
    await t.test(failure.category || failure.code, async () => {
      const project = deepFreeze(projectFixture());
      const original = structuredClone(project);
      let providerCalls = 0;
      const provider = {
        async generateStructured() {
          providerCalls += 1;
          throw failure;
        }
      };

      await assert.rejects(
        () => generateCardAssistanceChangeSet({
          projectDocument: project,
          selection,
          request: {
            operation: "repair",
            repairScope: "resources",
            resourceTargetIds: ["main"],
            promptText: "Corrija somente o texto."
          },
          provider,
          modelId: "fake:model"
        }),
        (error) => error === failure
      );

      assert.equal(providerCalls, 1);
      assert.deepEqual(project, original);
    });
  }
});

test("pedido acima de 12 mil caracteres é rejeitado antes de chamar o provider", async () => {
  const project = projectFixture();
  const original = structuredClone(project);
  let providerCalls = 0;

  await assert.rejects(
    () => generateCardAssistanceChangeSet({
      projectDocument: project,
      selection,
      request: {
        operation: "repair",
        repairScope: "resources",
        resourceTargetIds: ["main"],
        promptText: "x".repeat(12001)
      },
      provider: {
        async generateStructured() {
          providerCalls += 1;
          return { value: {} };
        }
      },
      modelId: "fake:model"
    }),
    (error) => error?.code === "INVALID_CARD_ASSISTANCE_REQUEST"
  );

  assert.equal(providerCalls, 0);
  assert.deepEqual(project, original);
});

test("pacote de contexto limita hierarquia, vizinhos e política", () => {
  const project = projectFixture();
  const moduleValue = project.courses[0].modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  moduleValue.guide = {
    goal: "m".repeat(6000),
    exclude: ["barreira integral do módulo"],
    avoid: ["risco integral do módulo"]
  };
  lesson.guide = {
    goal: "l".repeat(6000),
    exclude: ["barreira integral da lição"],
    avoid: ["risco integral da lição"]
  };
  lesson.topics = [{ title: "t".repeat(6000) }];
  microsequence.dependsOn = ["d".repeat(3000)];
  microsequence.covers = ["c".repeat(3000)];
  microsequence.checks = ["k".repeat(3000)];
  microsequence.cards = [
    paragraphCard("card-previous", 1, "p".repeat(6000)),
    paragraphCard("card-a", 2, "a".repeat(20000)),
    paragraphCard("card-next", 3, "n".repeat(6000))
  ];
  const packet = buildCardAssistanceContextPacket(project, selection, {
    operation: "repair",
    didacticProfileId: "perfil-a",
    didacticPolicy: {
      targetStudentProfile: "Estudante",
      courseSemantics: { note: "s".repeat(5000) }
    }
  });

  assert.equal(packet.hierarchy.module.guide.truncated, true);
  assert.ok(
    JSON.stringify(packet.hierarchy.module.guide).length <= 3500
  );
  assert.ok(
    JSON.stringify(packet.hierarchy.lesson.guide).length <= 3500
  );
  assert.ok(packet.hierarchy.module.guide.excerpt.length < 3500);
  assert.ok(packet.hierarchy.lesson.guide.excerpt.length < 3500);
  assert.deepEqual(packet.hierarchy.module.guide.exclude, [
    "barreira integral do módulo"
  ]);
  assert.deepEqual(packet.hierarchy.module.guide.avoid, [
    "risco integral do módulo"
  ]);
  assert.deepEqual(packet.hierarchy.lesson.guide.exclude, [
    "barreira integral da lição"
  ]);
  assert.deepEqual(packet.hierarchy.lesson.guide.avoid, [
    "risco integral da lição"
  ]);
  assert.equal(packet.hierarchy.lesson.topics.excerpt.length, 3500);
  assert.equal(packet.hierarchy.microsequence.dependsOn.excerpt.length, 1800);
  assert.equal(packet.hierarchy.microsequence.covers.excerpt.length, 1800);
  assert.equal(packet.hierarchy.microsequence.checks.excerpt.length, 1800);
  assert.equal(packet.cards.previous.excerpt.length, 3500);
  assert.equal(packet.cards.current.excerpt.length, 14000);
  assert.equal(packet.cards.next.excerpt.length, 3500);
  assert.equal(packet.didacticPolicy.courseSemantics.excerpt.length, 2500);
  assert.equal(Object.hasOwn(packet, "authorizedSources"), false);
});

test("barreiras de guide acima do orçamento falham antes do provider", async () => {
  const project = projectFixture();
  project.courses[0].modules[0].guide.exclude = [
    `conceito proibido ${"x".repeat(3600)}`
  ];
  const original = structuredClone(project);
  let providerCalls = 0;

  await assert.rejects(
    () => generateCardAssistanceChangeSet({
      projectDocument: project,
      selection,
      request: {
        operation: "repair",
        repairScope: "resources",
        resourceTargetIds: ["main"],
        promptText: "Corrija o texto."
      },
      provider: {
        async generateStructured() {
          providerCalls += 1;
          return { value: {} };
        }
      },
      modelId: "fake:model"
    }),
    (error) =>
      error?.code === "INVALID_CARD_ASSISTANCE_REQUEST" &&
      /barreiras exclude\/avoid.*guide do módulo.*3500 caracteres em JSON/iu
        .test(error.message)
  );

  assert.equal(providerCalls, 0);
  assert.deepEqual(project, original);
});

test("reparo do card inteiro pode trocar representação sem trocar identidade", async () => {
  const project = projectFixture();
  const original = structuredClone(project);
  const requests = [];
  const provider = {
    async generateStructured(request) {
      requests.push(request);
      if (request.phase === "card_assistance_representation") {
        return { value: { representation: "code:theory:none" } };
      }
      return {
        value: {
          card: {
            id: "card-a",
            position: 1,
            resource: "code",
            kind: "theory",
            exercise: "none",
            title: "Exemplo atômico",
            prompt: "Leia o exemplo.",
            language: "javascript",
            code: "const valor = 1;",
            after: ""
          }
        }
      };
    }
  };

  const generated = await generateCardAssistanceChangeSet({
    projectDocument: project,
    selection,
    request: {
      operation: "repair",
      repairScope: "card",
      promptText: "Transforme em um exemplo de código."
    },
    provider,
    modelId: "fake:model"
  });

  assert.deepEqual(
    requests.map((request) => request.phase),
    ["card_assistance_representation", "card_assistance_build"]
  );
  assert.equal(generated.changeSet.card.id, "card-a");
  assert.equal(generated.changeSet.card.position, 1);
  assert.equal(generated.changeSet.card.resource, "code");
  assert.deepEqual(project, original);
});

test("um reparo pode combinar recurso do corpo e apoio sem tocar os demais", async () => {
  const project = projectFixture();
  const microsequence = project.courses[0].modules[0].lessons[0].microsequences[0];
  microsequence.cards[0] = {
    id: "card-a",
    position: 1,
    resource: "composite",
    kind: "theory",
    exercise: "none",
    title: "Conceito em partes",
    blocks: [
      { id: "part-1", kind: "paragraph", value: "Corpo original." },
      { id: "part-2", kind: "paragraph", value: "Corpo intocado." }
    ],
    afterBlocks: [
      { id: "support-1", kind: "paragraph", value: "Apoio original." },
      { id: "support-2", kind: "paragraph", value: "Apoio intocado." }
    ],
    after: ""
  };
  const original = structuredClone(project);
  let requestSeen;
  const provider = {
    async generateStructured(request) {
      requestSeen = request;
      return {
        value: {
          replacements: [
            {
              targetId: "body:part-1",
              value: {
                id: "part-1",
                kind: "paragraph",
                value: "Corpo corrigido."
              },
              gaps: []
            },
            {
              targetId: "after:support-1",
              value: {
                id: "support-1",
                kind: "paragraph",
                value: "Apoio corrigido."
              },
              gaps: []
            }
          ]
        }
      };
    }
  };

  const generated = await generateCardAssistanceChangeSet({
    projectDocument: project,
    selection,
    request: {
      operation: "repair",
      repairScope: "resources",
      resourceTargetIds: ["body:part-1", "after:support-1"],
      promptText: "Harmonize a explicação e seu apoio."
    },
    provider,
    modelId: "fake:model"
  });

  assert.equal(requestSeen.phase, "card_assistance_resource_repair");
  assert.equal(requestSeen.schema.properties.replacements.minItems, 2);
  assert.equal(requestSeen.schema.properties.replacements.maxItems, 2);
  assert.equal(requestSeen.schema.properties.replacements.items.oneOf.length, 2);
  assert.equal(generated.changeSet.card.blocks[0].value, "Corpo corrigido.");
  assert.deepEqual(generated.changeSet.card.blocks[1], selectedCard(original).blocks[1]);
  assert.equal(
    generated.changeSet.card.afterBlocks[0].value,
    "Apoio corrigido."
  );
  assert.deepEqual(
    generated.changeSet.card.afterBlocks[1],
    selectedCard(original).afterBlocks[1]
  );
  assert.equal(generated.changeSet.card.title, "Conceito em partes");
  assert.deepEqual(project, original);
});

test("schemas dos 18 recursos compilam e validam exemplos antes e após projeção estrita", () => {
  for (const resource of listResourceIds()) {
    const sourceExample = getAuthoringResourceContract(resource).example;
    const example = {
      ...sourceExample,
      id: "card-schema",
      position: 1
    };
    const schema = buildExactAuthoringCardSchema({
      id: "card-schema",
      position: 1,
      resource,
      kind: example.kind,
      exercise: example.exercise
    });
    const strictSchema = toStrictJsonSchema(schema);
    const validateOriginal = strictAjv().compile(schema);
    const validateStrict = strictAjv().compile(strictSchema);
    const strictExample = materializeStrictValue(strictSchema, example);

    assert.equal(schema.additionalProperties, false, resource);
    assert.equal(schema.properties.id.const, "card-schema", resource);
    assert.equal(schema.properties.position.const, 1, resource);
    assert.equal(schema.properties.resource.const, resource, resource);
    assertStrictObjectsAreClosed(strictSchema, `$.${resource}`);
    assert.equal(
      validateOriginal(example),
      true,
      `${resource}: ${JSON.stringify(validateOriginal.errors)}`
    );
    assert.equal(
      validateOriginal({ ...example, campoForaDoContrato: true }),
      false,
      resource
    );
    assert.equal(
      validateStrict(strictExample),
      true,
      `${resource}: ${JSON.stringify(validateStrict.errors)}`
    );
    assert.equal(
      validateStrict({ ...strictExample, campoForaDoContrato: true }),
      false,
      resource
    );
  }
});

test("schemas simples do pipeline continuam compiláveis no Ajv após projeção estrita", async () => {
  const requests = [];
  const provider = {
    async generateStructured(request) {
      requests.push(request);
      if (request.phase === "card_assistance_representation") {
        return { value: { representation: "paragraph:theory:none" } };
      }
      return {
        value: {
          card: {
            id: "card-a",
            position: 1,
            resource: "paragraph",
            kind: "theory",
            exercise: "none",
            title: "Conceito revisto",
            text: "Texto revisto.",
            after: ""
          }
        }
      };
    }
  };

  await generateCardAssistanceChangeSet({
    projectDocument: projectFixture(),
    selection,
    request: {
      operation: "repair",
      repairScope: "card",
      promptText: "Revise o card."
    },
    provider,
    modelId: "fake:model"
  });

  const representationSchema = toStrictJsonSchema(requests[0].schema);
  assert.doesNotThrow(() => strictAjv().compile(representationSchema));
  assertStrictObjectsAreClosed(representationSchema);
});

test("projeção estrita isola definições recursivas de blocos incorporados", () => {
  const formulaCard = getAuthoringResourceContract("formula").example;
  const formulaBlock = (id) => ({
    id,
    kind: "formula",
    prompt: formulaCard.prompt,
    notation: formulaCard.notation,
    accessibleText: formulaCard.accessibleText,
    expression: structuredClone(formulaCard.expression)
  });
  const blockSchema = buildExactAuthoringBlockSchema("formula");
  const responseSchema = {
    type: "object",
    additionalProperties: false,
    required: ["first", "second"],
    properties: {
      first: blockSchema,
      second: buildExactAuthoringBlockSchema("formula")
    }
  };
  const strictSchema = toStrictJsonSchema(responseSchema);
  const validateOriginalBlock = strictAjv().compile(blockSchema);
  const validateStrictResponse = strictAjv().compile(strictSchema);

  assert.equal(validateOriginalBlock(formulaBlock("formula-1")), true);
  assert.equal(
    validateStrictResponse(materializeStrictValue(strictSchema, {
      first: formulaBlock("formula-1"),
      second: formulaBlock("formula-2")
    })),
    true,
    JSON.stringify(validateStrictResponse.errors)
  );
  assert.equal(
    new Set(Object.keys(strictSchema.$defs)).size,
    Object.keys(strictSchema.$defs).length
  );
});
