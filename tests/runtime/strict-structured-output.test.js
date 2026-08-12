import test from "node:test";
import assert from "node:assert/strict";

import {
  stripStructuredNulls,
  toStrictJsonSchema
} from "../../src/generation/providers/structuredOutput.js";
import { createOpenAiCompatibleProvider } from "../../src/generation/providers/openAiCompatibleProvider.js";

test("schema estrito exige todas as propriedades e torna opcionais anuláveis", () => {
  const schema = toStrictJsonSchema({
    type: "object",
    additionalProperties: false,
    required: ["id"],
    properties: {
      id: { type: "string" },
      feedback: { type: "string" },
      nested: {
        type: "object",
        properties: {
          answer: { type: "string" },
          note: { type: "string" }
        },
        required: ["answer"]
      }
    }
  });

  assert.deepEqual(schema.required, ["id", "feedback", "nested"]);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.feedback.anyOf[1], { type: "null" });
  assert.deepEqual(
    schema.properties.nested.anyOf[0].required,
    ["answer", "note"]
  );
});

test("schema estrito fecha também objetos sem propriedades declaradas", () => {
  const schema = toStrictJsonSchema({
    type: "array",
    items: { type: "object" }
  });

  assert.equal(schema.items.additionalProperties, false);
});

test("schema estrito projeta oneOf e gramática recursiva para o subconjunto do provider", () => {
  const schema = toStrictJsonSchema({
    $id: "urn:aralearn:schema:flowchart-structure:v1",
    allOf: [{ $ref: "#/$defs/node" }],
    $defs: {
      node: {
        oneOf: [{
          type: "object",
          additionalProperties: false,
          required: ["kind", "items"],
          properties: {
            kind: { const: "sequence" },
            items: { type: "array", items: { $ref: "#/$defs/node" } }
          }
        }]
      }
    }
  });

  assert.equal(schema.$id, undefined);
  assert.equal(schema.allOf, undefined);
  assert.equal(schema.properties.kind.const, "sequence");
  assert.ok(Array.isArray(schema.$defs.node.anyOf));
  assert.equal(JSON.stringify(schema).includes("\"oneOf\""), false);
});

test("schema estrito remove wrapper de união sem propriedades próprias", () => {
  const schema = toStrictJsonSchema({
    type: "object",
    required: ["id"],
    anyOf: [{
      type: "object",
      additionalProperties: false,
      required: ["id", "text"],
      properties: {
        id: { type: "string" },
        text: { type: "string" }
      }
    }]
  });

  assert.equal(schema.type, undefined);
  assert.equal(schema.required, undefined);
  assert.deepEqual(schema.anyOf[0].required, ["id", "text"]);
});

test("schema estrito materializa allOf estrutural e descarta apenas coerência local", () => {
  const schema = toStrictJsonSchema({
    type: "object",
    additionalProperties: false,
    required: ["structure"],
    properties: {
      structure: {
        allOf: [
          { $ref: "#/$defs/node" },
          {
            type: "object",
            required: ["kind", "items"],
            properties: {
              kind: { const: "sequence" },
              items: {
                type: "array",
                minItems: 1,
                items: { type: "string" }
              }
            }
          }
        ]
      }
    },
    $defs: {
      node: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: ["sequence", "process"] },
          items: { type: "array", items: { type: "string" } }
        }
      }
    },
    allOf: [{
      anyOf: [
        { required: ["structure"] },
        { required: ["fallback"] }
      ]
    }]
  });

  assert.equal(JSON.stringify(schema).includes("\"allOf\""), false);
  assert.deepEqual(
    Object.keys(schema.properties.structure.properties).sort(),
    ["id", "items", "kind"]
  );
  assert.equal(schema.properties.structure.properties.kind.const, "sequence");
  assert.equal(schema.properties.structure.properties.kind.type, "string");
  assert.deepEqual(
    [...schema.properties.structure.required].sort(),
    ["id", "items", "kind"]
  );
});

test("schema estrito não envia `{}` nem required sem propriedades ao provider", () => {
  const schema = toStrictJsonSchema({
    type: "object",
    properties: {
      cells: {
        type: "array",
        items: {}
      },
      tuple: {
        type: "array",
        minItems: 2,
        prefixItems: [{ type: "string" }, { type: "number" }],
        items: false
      }
    },
    anyOf: [
      { required: ["cells"] },
      { required: ["tuple"] }
    ]
  });

  assert.equal(JSON.stringify(schema).includes("\"anyOf\":[{\"required\""), false);
  assert.deepEqual(
    schema.properties.cells.anyOf[0].items.anyOf.map((branch) => branch.type),
    ["string", "number", "boolean", "null"]
  );
  assert.equal(schema.properties.tuple.anyOf[0].maxItems, 2);
  assert.equal(schema.properties.tuple.anyOf[0].items.anyOf.length, 2);
});

test("normalização da saída estrita remove somente opcionais nulos", () => {
  assert.deepEqual(stripStructuredNulls({
    id: "item",
    feedback: null,
    nested: { answer: "42", note: null },
    values: [1, null, 2]
  }), {
    id: "item",
    nested: { answer: "42" },
    values: [1, null, 2]
  });

  const schema = {
    type: "object",
    required: ["id", "root"],
    properties: {
      id: { type: "string" },
      optional: { type: "string" },
      root: {
        type: "object",
        required: ["parentId", "label"],
        properties: {
          parentId: { type: ["string", "null"] },
          label: { type: "string" },
          note: { type: "string" }
        }
      }
    }
  };
  assert.deepEqual(stripStructuredNulls({
    id: "item",
    optional: null,
    root: {
      parentId: null,
      label: "Raiz",
      note: null
    }
  }, schema), {
    id: "item",
    root: {
      parentId: null,
      label: "Raiz"
    }
  });
});

test("provider Responses envia schema estrito e remove nulos instrumentais", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({
      status: "completed",
      output: [{
        type: "message",
        content: [{
          type: "output_text",
          text: JSON.stringify({ id: "card-1", feedback: null })
        }]
      }],
      usage: { input_tokens: 10, output_tokens: 4 }
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  try {
    const provider = createOpenAiCompatibleProvider({
      endpoint: "https://api.openai.com/v1/responses",
      apiKey: "test-key"
    });
    const result = await provider.generateStructured({
      modelId: "test-model",
      schemaName: "strict_test",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["id"],
        properties: {
          id: { type: "string" },
          feedback: { type: "string" }
        }
      },
      prompt: "Teste."
    });

    const sentSchema = requestBody.text.format.schema;
    assert.deepEqual(sentSchema.required, ["id", "feedback"]);
    assert.equal(requestBody.text.format.strict, true);
    assert.deepEqual(result.value, { id: "card-1" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("provider Responses revalida no schema canônico após a projeção strict", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    status: "completed",
    output_text: JSON.stringify({ id: "texto-longo" })
  }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
  try {
    const provider = createOpenAiCompatibleProvider({
      endpoint: "https://api.openai.com/v1/responses",
      apiKey: "test-key"
    });
    await assert.rejects(
      provider.generateStructured({
        modelId: "test-model",
        schemaName: "canonical_validation",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["id"],
          properties: {
            id: { type: "string", maxLength: 3 }
          }
        },
        prompt: "Teste."
      }),
      (error) =>
        error?.category === "invalid_structured_output"
        && /schema canônico/u.test(error.message)
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
