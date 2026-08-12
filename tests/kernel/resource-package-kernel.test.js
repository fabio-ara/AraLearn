import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeCardEnvelope,
  renderCardEnvelope,
  validateCardEnvelope
} from "../../src/resources/kernel/cardEnvelope.js";
import {
  normalizeCourseDocument,
  validateCourseDocument
} from "../../src/resources/kernel/courseContract.js";
import { createPackageRegistry } from "../../src/resources/kernel/packageRegistry.js";
import { validatePackageSchema } from "../../src/resources/kernel/schemaValidation.js";
import { paragraphPackage, RESOURCE_PACKAGE_REGISTRY } from "../../src/resources/packages/index.js";

function paragraphInstance(overrides = {}) {
  return {
    id: "body-1",
    package: "aralearn.resource.paragraph",
    version: "1.0.0",
    data: { text: "Uma explicação concreta.", ...overrides }
  };
}

function theoryCard() {
  return {
    id: "card-1",
    position: 1,
    title: "Primeiro contato",
    role: "theory",
    content: [paragraphInstance()],
    response: null,
    feedback: []
  };
}

test("kernel registra package sem conhecer paragraph", () => {
  const catalog = RESOURCE_PACKAGE_REGISTRY.listCatalog();
  assert.equal(catalog.length, 17);
  assert.equal(catalog[0].id, "aralearn.resource.paragraph");
  assert.equal(Object.hasOwn(catalog[0], "schema"), false);
  assert.equal(Object.hasOwn(catalog[0], "example"), false);
});

test("packages de resposta avaliam escolha exata, lacuna e ordenação", () => {
  const cases = [
    ["aralearn.response.choice", { selectedIds: ["tcp"] }],
    ["aralearn.response.gap", { values: { protocol: "protocolo" } }],
    ["aralearn.response.ordering", { order: ["s1", "s2"] }]
  ];
  cases.forEach(([packageId, answer], index) => {
    const manifest = RESOURCE_PACKAGE_REGISTRY.listCatalog().find(({ id }) => id === packageId);
    const contract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(packageId, manifest.version);
    const instance = RESOURCE_PACKAGE_REGISTRY.normalizeInstance({ id: `response-${index}`, package: packageId, version: manifest.version, data: contract.contract.example }, "response");
    assert.equal(RESOURCE_PACKAGE_REGISTRY.evaluateResponse(instance, answer).correct, true, packageId);
  });
});

test("contrato completo é obtido somente para o package escolhido", () => {
  const contract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(
    "aralearn.resource.paragraph",
    "1.0.0"
  );
  assert.equal(contract.package, "aralearn.resource.paragraph");
  assert.deepEqual(contract.contract.required, ["text"]);
  assert.equal(contract.schema.properties.text.type, "string");
});

test("exemplos autorais de todos os packages instalados normalizam, validam e renderizam", () => {
  RESOURCE_PACKAGE_REGISTRY.listCatalog().forEach((manifest, index) => {
    const contract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(manifest.id, manifest.version);
    const slot = manifest.slots[0];
    const instance = RESOURCE_PACKAGE_REGISTRY.normalizeInstance({
      id: `example-${index + 1}`,
      package: manifest.id,
      version: manifest.version,
      data: contract.contract.example
    }, slot);
    assert.equal(RESOURCE_PACKAGE_REGISTRY.validateInstance(instance, slot).valid, true, manifest.id);
    assert.match(RESOURCE_PACKAGE_REGISTRY.renderInstance(instance, slot), /(?:runtime-|package-)/u, manifest.id);
    assert.ok(RESOURCE_PACKAGE_REGISTRY.accessibleText(instance, slot), manifest.id);
  });
});

test("envelope valida slots e renderiza por delegação", () => {
  const card = normalizeCardEnvelope(theoryCard(), RESOURCE_PACKAGE_REGISTRY);
  assert.equal(validateCardEnvelope(card, RESOURCE_PACKAGE_REGISTRY).valid, true);
  const rendered = renderCardEnvelope(card, RESOURCE_PACKAGE_REGISTRY);
  assert.match(rendered.contentHtml, /data-package="aralearn\.resource\.paragraph"/u);
  assert.match(rendered.contentHtml, /Uma explicação concreta\./u);
  assert.equal(rendered.responseHtml, "");
  assert.equal(rendered.accessibleText, "Uma explicação concreta.");
});

test("package ausente e slot incompatível falham explicitamente", () => {
  const absent = theoryCard();
  absent.content[0].package = "aralearn.resource.absent";
  assert.match(
    validateCardEnvelope(absent, RESOURCE_PACKAGE_REGISTRY).errors.join(" "),
    /Package não instalado/u
  );
  const response = theoryCard();
  response.role = "practice";
  response.response = paragraphInstance();
  response.response.id = "response-1";
  assert.match(
    validateCardEnvelope(response, RESOURCE_PACKAGE_REGISTRY).errors.join(" "),
    /não pode ocupar o slot response/u
  );
});

test("adicionar package de fixture não exige alteração no kernel", () => {
  const fixture = {
    ...paragraphPackage,
    manifest: {
      ...paragraphPackage.manifest,
      id: "aralearn.resource.fixture",
      label: "Fixture"
    }
  };
  const registry = createPackageRegistry([paragraphPackage, fixture]);
  assert.deepEqual(
    registry.listCatalog().map(({ id }) => id),
    ["aralearn.resource.paragraph", "aralearn.resource.fixture"]
  );
});

test("texto técnico não transforma expansão com sigla em literal parcial", () => {
  const card = theoryCard();
  card.content[0].data.text = "Transmission Control Protocol (TCP) transporta segmentos.";
  const rendered = renderCardEnvelope(card, RESOURCE_PACKAGE_REGISTRY);
  assert.doesNotMatch(rendered.contentHtml, /<code>/u);
  assert.match(rendered.contentHtml, /Transmission Control Protocol \(TCP\)/u);
});

test("literal autoral precisa ser completo e ter crases inequívocas", () => {
  const valid = theoryCard();
  valid.content[0].data.text = "Use `Transmission Control Protocol (TCP)` como literal completo.";
  const validResult = validateCardEnvelope(valid, RESOURCE_PACKAGE_REGISTRY);
  assert.equal(validResult.valid, true, validResult.errors.join(" "));
  const invalid = theoryCard();
  invalid.content[0].data.text = "Use Transmission Control `Protocol (TCP) sem fechamento.";
  assert.match(
    validateCardEnvelope(invalid, RESOURCE_PACKAGE_REGISTRY).errors.join(" "),
    /crase sem par/u
  );
});

test("validador do SDK cobre objetos fechados, arrays e uniões sem depender do app", () => {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      items: {
        type: "array",
        minItems: 1,
        items: { anyOf: [{ type: "string", minLength: 1 }, { type: "integer", minimum: 1 }] }
      }
    }
  };
  assert.equal(validatePackageSchema({ items: ["A", 2] }, schema).valid, true);
  assert.equal(validatePackageSchema({ items: [0], extra: true }, schema).valid, false);
});

test("paragraph atravessa documento de curso, JSON e validação sem união global", () => {
  const input = {
    course: {
      id: "course-network",
      title: "Redes",
      goal: "Compreender redes progressivamente.",
      modules: [{
        id: "module-1",
        title: "Fundamentos",
        goal: "Situar a comunicação.",
        lessons: [{
          id: "lesson-1",
          title: "Protocolos",
          goal: "Entender o problema resolvido por protocolos.",
          microsequences: [{
            id: "micro-1",
            title: "Primeiro contato",
            goal: "Dar referente concreto ao termo.",
            cards: [theoryCard()]
          }]
        }]
      }]
    }
  };
  const normalized = normalizeCourseDocument(input, RESOURCE_PACKAGE_REGISTRY);
  const persisted = JSON.parse(JSON.stringify(normalized));
  assert.equal(validateCourseDocument(persisted, RESOURCE_PACKAGE_REGISTRY).valid, true);
  assert.equal(persisted.contract, "aralearn.course.v1");
  assert.equal(
    persisted.course.modules[0].lessons[0].microsequences[0].cards[0].content[0].package,
    "aralearn.resource.paragraph"
  );
});
