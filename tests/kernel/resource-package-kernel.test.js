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
import { gapResponsePackage, paragraphPackage, RESOURCE_PACKAGE_REGISTRY } from "../../src/resources/packages/index.js";
import { plainGraphvizLabel } from "../../src/resources/sdk/graphviz.js";

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
    feedback: [],
    topics: [],
    sources: []
  };
}

function readTargetPath(root, path) {
  return (String(path).match(/[^.[\]]+|\[(\d+)\]/gu) || [])
    .map((segment) => segment.startsWith("[") ? Number(segment.slice(1, -1)) : segment)
    .reduce((current, segment) => current?.[segment], root);
}

function choiceResponse(question = "Qual protocolo confirma a entrega?") {
  return {
    id: "response-1",
    package: "aralearn.response.choice",
    version: "1.0.0",
    data: {
      question,
      selectionMode: "single",
      selectionCriterion: "correct",
      options: [
        { id: "tcp", text: "TCP" },
        { id: "udp", text: "UDP" }
      ],
      answerIds: ["tcp"]
    }
  };
}

test("kernel registra package sem conhecer paragraph", () => {
  const catalog = RESOURCE_PACKAGE_REGISTRY.listCatalog();
  assert.ok(catalog.length > 0);
  assert.equal(new Set(catalog.map(({ id, version }) => `${id}@${version}`)).size, catalog.length);
  assert.equal(catalog[0].id, "aralearn.resource.paragraph");
  assert.equal(Object.hasOwn(catalog[0], "schema"), false);
  assert.equal(Object.hasOwn(catalog[0], "example"), false);
  catalog.forEach((manifest) => {
    assert.ok(manifest.academic.domains.length, manifest.id);
    assert.ok(manifest.academic.knowledgeObjects.length, manifest.id);
    assert.ok(manifest.academic.conventions.length, manifest.id);
    assert.ok(manifest.academic.appropriateWhen.length, manifest.id);
    assert.ok(manifest.academic.avoidWhen.length, manifest.id);
    assert.equal(manifest.academic.authoring.manualTextEditing, true, manifest.id);
    assert.equal(manifest.academic.authoring.aiSelection, true, manifest.id);
    assert.equal(manifest.academic.authoring.structureEditing, false, manifest.id);
    if (manifest.slots.includes("content")) {
      assert.ok(manifest.academic.practiceModes.includes("exposition"), manifest.id);
      const contract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(manifest.id, manifest.version);
      const instance = RESOURCE_PACKAGE_REGISTRY.normalizeInstance({
        id: `selection-${manifest.id}`,
        package: manifest.id,
        version: manifest.version,
        data: contract.contract.example
      }, "content");
      const targets = RESOURCE_PACKAGE_REGISTRY.editableTargets(instance, "content");
      assert.ok(targets.length, `${manifest.id} precisa expor texto selecionável.`);
      targets.forEach((target) => {
        assert.ok(target.path, manifest.id);
        assert.ok(target.label, manifest.id);
      });
      const practiceTargets = RESOURCE_PACKAGE_REGISTRY.practiceTargets(instance);
      practiceTargets.forEach((target) => {
        assert.notEqual(target.path, "prompt", `${manifest.id} não pode usar o enunciado como lacuna.`);
        assert.ok(target.modes.length, manifest.id);
        target.modes.forEach((mode) => assert.ok(["gap", "typing"].includes(mode), manifest.id));
      });
    }
  });
});

test("code e table declaram lacunas dentro da representação", () => {
  const cases = [
    ["aralearn.resource.code", "code"],
    ["aralearn.resource.table", "rows[0][0]"]
  ];
  cases.forEach(([packageId, expectedPath], index) => {
    const manifest = RESOURCE_PACKAGE_REGISTRY.listCatalog().find(({ id }) => id === packageId);
    const contract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(packageId, manifest.version);
    const instance = RESOURCE_PACKAGE_REGISTRY.normalizeInstance({
      id: `practice-target-${index}`,
      package: packageId,
      version: manifest.version,
      data: contract.contract.example
    }, "content");
    const targets = RESOURCE_PACKAGE_REGISTRY.practiceTargets(instance);
    assert.equal(targets[0].path, expectedPath);
    assert.equal(targets.some(({ path }) => path === "prompt"), false);
  });
});

test("lacuna reserva no Graphviz a resposta válida mais larga antes de ser preenchida", () => {
  const instance = {
    id: "bpmn-1",
    data: { nodes: [{ label: "Enviar solicitação" }] }
  };
  const prepared = gapResponsePackage.prepareContentInstance(instance, {
    blanks: [{
      id: "blank-1",
      targetInstanceId: "bpmn-1",
      targetPath: "nodes[0].label",
      answer: "solicitação",
      acceptedAnswers: ["pedido formal"],
      responseMode: "choice"
    }]
  }, { responseBlockKey: "response-1", responseState: { values: {} } });
  assert.equal(plainGraphvizLabel(prepared.nodes[0].label), "Enviar pedido formal");
});

test("diagramas acadêmicos expõem somente texto e preservam estrutura autoral", () => {
  const packageIds = [
    "aralearn.resource.graph",
    "aralearn.resource.software_system_context",
    "aralearn.resource.software_container",
    "aralearn.resource.system_internal_block"
  ];
  const structuralSegment = /(?:^|\.)(?:id|from|to|fromPort|toPort|partId|kind|direction|flowDirection|layout|directed)(?:$|\[)/u;

  packageIds.forEach((packageId) => {
    const contract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(packageId, "1.0.0");
    const instance = RESOURCE_PACKAGE_REGISTRY.normalizeInstance({
      id: `authoring-${packageId}`,
      package: packageId,
      version: "1.0.0",
      data: contract.contract.example
    }, "content");
    const editable = RESOURCE_PACKAGE_REGISTRY.editableTargets(instance, "content");
    const practice = RESOURCE_PACKAGE_REGISTRY.practiceTargets(instance);

    assert.ok(editable.length > 0, packageId);
    assert.ok(practice.length > 0, packageId);
    editable.forEach(({ path }) => assert.doesNotMatch(path, structuralSegment, `${packageId}: ${path}`));
    practice.forEach(({ path, modes }) => {
      assert.doesNotMatch(path, structuralSegment, `${packageId}: ${path}`);
      assert.ok(modes.includes("gap"), `${packageId}: ${path}`);
      assert.ok(modes.includes("typing"), `${packageId}: ${path}`);
    });
  });
});

test("gap rejeita campo editável que o package não declarou para prática", () => {
  const content = {
    id: "code-content",
    package: "aralearn.resource.code",
    version: "1.0.0",
    data: { prompt: "Explique TCP.", language: "javascript", code: "const protocol = 'TCP';" }
  };
  const response = {
    id: "invalid-gap",
    package: "aralearn.response.gap",
    version: "1.0.0",
    data: { blanks: [{ id: "bad", targetInstanceId: content.id, targetPath: "prompt", responseMode: "text", answer: "TCP" }] }
  };
  const card = { ...theoryCard(), id: "invalid-target", role: "practice", content: [content], response };
  assert.match(
    validateCardEnvelope(card, RESOURCE_PACKAGE_REGISTRY).errors.join(" "),
    /campo não declarado pelo package/u
  );
});

test("todo alvo de prática do catálogo materializa a lacuna dentro do resource", () => {
  const readPath = (root, path) => (
    (String(path).match(/[^.[\]]+|\[(\d+)\]/gu) || [])
      .map((segment) => segment.startsWith("[") ? Number(segment.slice(1, -1)) : segment)
      .reduce((current, segment) => current?.[segment], root)
  );
  RESOURCE_PACKAGE_REGISTRY.listCatalog({ slot: "content" }).forEach((manifest, index) => {
    const contract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(manifest.id, manifest.version);
    const content = RESOURCE_PACKAGE_REGISTRY.normalizeInstance({
      id: `render-target-${index}`,
      package: manifest.id,
      version: manifest.version,
      data: contract.contract.example
    }, "content");
    const target = RESOURCE_PACKAGE_REGISTRY.practiceTargets(content)[0];
    if (!target) return;
    const answer = readPath(content.data, target.path);
    const responseMode = target.modes.includes("gap") ? "choice" : "text";
    const response = RESOURCE_PACKAGE_REGISTRY.normalizeInstance({
      id: `render-gap-${index}`,
      package: "aralearn.response.gap",
      version: "1.0.0",
      data: {
        blanks: [{
          id: "target",
          targetInstanceId: content.id,
          targetPath: target.path,
          responseMode,
          answer,
          ...(responseMode === "choice" ? { distractors: [`outro ${answer}`] } : {})
        }]
      }
    }, "response");
    const practiceCard = {
      ...theoryCard(),
      id: `render-practice-${index}`,
      role: "practice",
      content: [content],
      response
    };
    const validation = validateCardEnvelope(practiceCard, RESOURCE_PACKAGE_REGISTRY);
    assert.equal(validation.valid, true, `${manifest.id}: ${validation.errors.join(" ")}`);
    const rendered = renderCardEnvelope(practiceCard, RESOURCE_PACKAGE_REGISTRY, {
      cardResponse: response,
      responseBlockKey: `gap-${index}`,
      blockKey: `gap-${index}`,
      responseState: { values: [] }
    });
    assert.match(rendered.contentHtml, /data-action="(?:text-gap-open-choice|complete-input)"/u, manifest.id);
  });
});

test("kernel rejeita alvo declarado que o renderer mantém invisível", () => {
  const hiddenTargetPackage = {
    ...paragraphPackage,
    manifest: {
      ...paragraphPackage.manifest,
      id: "aralearn.resource.hidden_target_fixture"
    },
    authoringContract: {
      ...paragraphPackage.authoringContract,
      example: { text: "Texto visível.", hidden: "resposta" }
    },
    schema: {
      ...paragraphPackage.schema,
      required: ["text", "hidden"],
      properties: {
        ...paragraphPackage.schema.properties,
        hidden: { type: "string", minLength: 1 }
      }
    },
    normalize(data) {
      return { text: String(data?.text || "").trim(), hidden: String(data?.hidden || "").trim() };
    },
    practiceTargets() {
      return [{ path: "hidden", label: "Alvo invisível", modes: ["gap", "typing"] }];
    }
  };
  const registry = createPackageRegistry([hiddenTargetPackage, gapResponsePackage]);
  const content = registry.normalizeInstance({
    id: "hidden-content",
    package: hiddenTargetPackage.manifest.id,
    version: hiddenTargetPackage.manifest.version,
    data: hiddenTargetPackage.authoringContract.example
  }, "content");
  const response = registry.normalizeInstance({
    id: "hidden-response",
    package: "aralearn.response.gap",
    version: "1.0.0",
    data: { blanks: [{ id: "hidden", targetInstanceId: content.id, targetPath: "hidden", responseMode: "text", answer: "resposta" }] }
  }, "response");
  const result = validateCardEnvelope({
    ...theoryCard(), id: "hidden-card", role: "practice", content: [content], response
  }, registry);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /não materializa um controle visível/u);
});

test("lacunas múltiplas no mesmo campo não corrompem os marcadores umas das outras", () => {
  const content = RESOURCE_PACKAGE_REGISTRY.normalizeInstance({
    id: "code-with-overlapping-marker-terms",
    package: "aralearn.resource.code",
    version: "1.0.0",
    data: {
      prompt: "Complete o trecho.",
      language: "python",
      code: "contagem_setor = df[\"setor\"].value_counts()\nplt.bar(contagem_setor.index, contagem_setor.values)"
    }
  }, "content");
  const answers = ["setor", "value_counts()", "index", "values"];
  const response = RESOURCE_PACKAGE_REGISTRY.normalizeInstance({
    id: "code-with-four-gaps",
    package: "aralearn.response.gap",
    version: "1.0.0",
    data: {
      blanks: answers.map((answer, index) => ({
        id: `blank-${index + 1}`,
        targetInstanceId: content.id,
        targetPath: "code",
        responseMode: "choice",
        answer,
        distractors: [`distrator-${index + 1}`]
      }))
    }
  }, "response");
  const card = {
    ...theoryCard(), id: "multiple-gaps-card", role: "practice", content: [content], response
  };
  const validation = validateCardEnvelope(card, RESOURCE_PACKAGE_REGISTRY);
  assert.equal(validation.valid, true, validation.errors.join(" "));
  const rendered = renderCardEnvelope(card, RESOURCE_PACKAGE_REGISTRY, {
    cardResponse: response,
    responseBlockKey: "multiple-gaps",
    blockKey: "multiple-gaps",
    responseState: { values: [] }
  });
  answers.forEach((_, index) => {
    assert.match(rendered.contentHtml, new RegExp(`data-complete-blank-index="${index}"`, "u"));
  });
});

test("destinos repetidos da tabela de transição viram lacunas independentes com labels dos estados", () => {
  const contract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(
    "aralearn.resource.state_transition_table",
    "1.0.0"
  );
  const content = RESOURCE_PACKAGE_REGISTRY.normalizeInstance({
    id: "transition-table-content",
    package: "aralearn.resource.state_transition_table",
    version: "1.0.0",
    data: contract.contract.example
  }, "content");
  const destinationPaths = ["transitions[1].to", "transitions[5].to"];
  const practiceTargets = RESOURCE_PACKAGE_REGISTRY.practiceTargets(content);
  const declaredPaths = practiceTargets.filter(({ modes }) => modes.includes("gap"))
    .map(({ path }) => path);
  destinationPaths.forEach((path) => assert.ok(declaredPaths.includes(path), path));
  assert.deepEqual(
    practiceTargets.find(({ path }) => path === destinationPaths[0]),
    {
      path: destinationPaths[0],
      label: "Lacuna no destino 2",
      modes: ["gap"],
      preserveReference: true
    }
  );
  assert.equal(
    RESOURCE_PACKAGE_REGISTRY.practiceValueLabel(content, destinationPaths[0], "q0"),
    "q₀"
  );

  const stateLabelResponse = RESOURCE_PACKAGE_REGISTRY.normalizeInstance({
    id: "transition-state-label-response",
    package: "aralearn.response.gap",
    version: "1.0.0",
    data: { blanks: [{
      id: "state-label",
      targetInstanceId: content.id,
      targetPath: "states[0].label",
      responseMode: "choice",
      answer: "q₀",
      distractors: ["q₁", "q₂"]
    }] }
  }, "response");
  const derivedReferences = renderCardEnvelope({
    ...theoryCard(),
    id: "transition-state-label-card",
    role: "practice",
    content: [content],
    response: stateLabelResponse
  }, RESOURCE_PACKAGE_REGISTRY, {
    cardResponse: stateLabelResponse,
    responseBlockKey: "transition-state-label",
    blockKey: "transition-state-label",
    responseState: { values: [] }
  }).contentHtml;
  assert.equal((derivedReferences.match(/…/gu) || []).length, 2);

  const response = RESOURCE_PACKAGE_REGISTRY.normalizeInstance({
    id: "transition-destinations-response",
    package: "aralearn.response.gap",
    version: "1.0.0",
    data: { blanks: destinationPaths.map((targetPath, index) => ({
      id: `destination-${index + 1}`,
      targetInstanceId: content.id,
      targetPath,
      responseMode: "choice",
      answer: "q0",
      distractors: ["q1", "q2"]
    })) }
  }, "response");
  const card = {
    ...theoryCard(),
    id: "transition-destinations-card",
    role: "practice",
    content: [content],
    response
  };
  const validation = validateCardEnvelope(card, RESOURCE_PACKAGE_REGISTRY);
  assert.equal(validation.valid, true, validation.errors.join(" "));
  const labelAsStructuralAnswer = structuredClone(card);
  labelAsStructuralAnswer.response.data.blanks[0].answer = "q₀";
  assert.match(
    validateCardEnvelope(labelAsStructuralAnswer, RESOURCE_PACKAGE_REGISTRY).errors.join(" "),
    /referência estrutural precisa usar o valor integral do campo/u
  );
  const contradictoryEquivalent = structuredClone(card);
  contradictoryEquivalent.response.data.blanks[0].acceptedAnswers = ["q1"];
  assert.match(
    validateCardEnvelope(contradictoryEquivalent, RESOURCE_PACKAGE_REGISTRY).errors.join(" "),
    /não admite resposta equivalente que altere a referência/u
  );
  const duplicateVisibleOption = structuredClone(card);
  duplicateVisibleOption.content[0].data.states[1].label = "q₀";
  assert.match(
    validateCardEnvelope(duplicateVisibleOption, RESOURCE_PACKAGE_REGISTRY).errors.join(" "),
    /precisa de rótulos de opção distintos/u
  );
  const semanticCard = RESOURCE_PACKAGE_REGISTRY.prepareCardForSemantics(card);
  assert.equal(semanticCard.content[0].data.transitions[1].to, "q0");
  assert.equal(semanticCard.content[0].data.transitions[5].to, "q0");
  assert.equal(
    (RESOURCE_PACKAGE_REGISTRY.accessibleText(semanticCard.content[0], "content")
      .match(/vai para lacuna/gu) || []).length,
    2
  );

  const renderWithValues = (values, activeBlankIndex = null) => renderCardEnvelope(
    card,
    RESOURCE_PACKAGE_REGISTRY,
    {
      cardResponse: response,
      responseBlockKey: "transition-destinations",
      blockKey: "transition-destinations",
      responseState: { values },
      ...(activeBlankIndex === null ? {} : {
        activeTextGapPrompt: {
          blockKey: "transition-destinations",
          blankIndex: activeBlankIndex
        }
      })
    }
  );
  const firstFilled = renderWithValues(["q0", ""]);
  assert.equal(content.data.transitions[1].to, "q0");
  assert.equal(content.data.transitions[5].to, "q0");
  assert.equal((firstFilled.contentHtml.match(/data-action="text-gap-open-choice"/gu) || []).length, 2);
  assert.match(
    firstFilled.contentHtml,
    /data-complete-blank-index="0"[^>]+data-empty="false"[^>]*>q₀<\/span>/u
  );
  assert.match(
    firstFilled.contentHtml,
    /data-complete-blank-index="1"[^>]+data-empty="true"[^>]*><\/span>/u
  );
  assert.doesNotMatch(firstFilled.contentHtml, /…/u);

  const prompt = renderWithValues(["q0", ""], 1).responseHtml;
  assert.match(prompt, /data-text-gap-value="q0"[^>]*>q₀<\/button>/u);
  assert.match(prompt, /data-text-gap-value="q1"[^>]*>q₁<\/button>/u);
  assert.match(prompt, /data-text-gap-value="q2"[^>]*>q₂<\/button>/u);
  assert.equal(
    RESOURCE_PACKAGE_REGISTRY.evaluateResponse(response, {
      values: { "destination-1": "q0", "destination-2": "q0" }
    }).correct,
    true
  );
});

test("todo package materializa cada alvo como uma lacuna única e independente", () => {
  RESOURCE_PACKAGE_REGISTRY.listCatalog({ slot: "content" }).forEach((manifest, packageIndex) => {
    const contract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(manifest.id, manifest.version);
    const content = RESOURCE_PACKAGE_REGISTRY.normalizeInstance({
      id: `independent-content-${packageIndex}`,
      package: manifest.id,
      version: manifest.version,
      data: contract.contract.example
    }, "content");
    const targets = RESOURCE_PACKAGE_REGISTRY.practiceTargets(content)
      .filter((target) => target.modes.includes("gap"));
    assert.equal(
      new Set(targets.map(({ path }) => path)).size,
      targets.length,
      `${manifest.id}: caminhos de prática precisam ser únicos`
    );

    for (let offset = 0; offset < targets.length; offset += 12) {
      const group = targets.slice(offset, offset + 12);
      if (!group.length) continue;
      const blanks = group.map((target, index) => ({
        id: `blank-${offset + index}`,
        targetInstanceId: content.id,
        targetPath: target.path,
        responseMode: "choice",
        answer: String(readTargetPath(content.data, target.path)),
        distractors: [`distrator-${offset + index}`]
      }));
      const response = RESOURCE_PACKAGE_REGISTRY.normalizeInstance({
        id: `independent-response-${packageIndex}-${offset}`,
        package: "aralearn.response.gap",
        version: "1.0.0",
        data: { blanks }
      }, "response");
      const card = {
        ...theoryCard(),
        id: `independent-card-${packageIndex}-${offset}`,
        role: "practice",
        content: [content],
        response
      };
      const validation = validateCardEnvelope(card, RESOURCE_PACKAGE_REGISTRY);
      assert.equal(validation.valid, true, `${manifest.id}: ${validation.errors.join(" ")}`);

      const renderWithValues = (values) => renderCardEnvelope(card, RESOURCE_PACKAGE_REGISTRY, {
        cardResponse: response,
        responseBlockKey: "independent-response",
        blockKey: "independent-response",
        responseState: { values }
      }).contentHtml;
      const firstFilled = renderWithValues(group.map((target, index) => (
        index === 0 ? String(readTargetPath(content.data, target.path)) : ""
      )));
      group.forEach((_, index) => {
        const controls = firstFilled.match(new RegExp(
          `<span[^>]+data-complete-blank-index="${index}"[^>]+data-empty="${index === 0 ? "false" : "true"}"[^>]*>`,
          "gu"
        )) || [];
        assert.equal(controls.length, 1, `${manifest.id}: lacuna ${index} precisa de um único estado próprio`);
      });

      if (group.length > 1) {
        const secondFilled = renderWithValues(group.map((target, index) => (
          index === 1 ? String(readTargetPath(content.data, target.path)) : ""
        )));
        assert.match(secondFilled, /data-complete-blank-index="0"[^>]+data-empty="true"/u, manifest.id);
        assert.match(secondFilled, /data-complete-blank-index="1"[^>]+data-empty="false"/u, manifest.id);
      }
    }
  });
});

test("packages de resposta avaliam escolha, lacuna, ordenação e encaixe", () => {
  const cases = [
    ["aralearn.response.choice", { selectedIds: ["tcp"] }],
    ["aralearn.response.gap", { values: { protocol: "protocolo" } }],
    ["aralearn.response.ordering", { order: ["s1", "s2"] }],
    ["aralearn.response.matching", { matches: { tcp: "transport", ip: "network" } }]
  ];
  cases.forEach(([packageId, answer], index) => {
    const manifest = RESOURCE_PACKAGE_REGISTRY.listCatalog().find(({ id }) => id === packageId);
    const contract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(packageId, manifest.version);
    const instance = RESOURCE_PACKAGE_REGISTRY.normalizeInstance({ id: `response-${index}`, package: packageId, version: manifest.version, data: contract.contract.example }, "response");
    assert.equal(RESOURCE_PACKAGE_REGISTRY.evaluateResponse(instance, answer).correct, true, packageId);
  });
});

test("ordering possui blocos próprios e não depende da estrutura de conteúdo", () => {
  const contract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(
    "aralearn.response.ordering",
    "2.0.0"
  );
  assert.deepEqual(contract.contract.required, ["prompt", "items", "answerOrder"]);
  assert.equal(Object.hasOwn(contract.schema.properties, "targetInstanceId"), false);
  assert.equal(Object.hasOwn(contract.schema.properties, "itemIds"), false);
  const instance = RESOURCE_PACKAGE_REGISTRY.normalizeInstance({
    id: "ordering-independent",
    package: "aralearn.response.ordering",
    version: "2.0.0",
    data: contract.contract.example
  }, "response");
  const card = { ...theoryCard(), role: "practice", response: instance };
  assert.equal(validateCardEnvelope(card, RESOURCE_PACKAGE_REGISTRY).valid, true);
});

test("contrato completo é obtido somente para o package escolhido", () => {
  const contract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(
    "aralearn.resource.paragraph",
    "1.0.0"
  );
  assert.equal(contract.package, "aralearn.resource.paragraph");
  assert.deepEqual(contract.contract.required, ["text"]);
  assert.equal(contract.schema.properties.text.type, "string");
  assert.deepEqual(contract.practiceTargets, [{
    path: "text",
    label: "Lacuna na explicação",
    modes: ["gap", "typing"]
  }]);
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
    const rendered = RESOURCE_PACKAGE_REGISTRY.renderInstance(instance, slot);
    if (slot !== "response") assert.match(rendered, /(?:runtime-|package-)/u, manifest.id);
    else assert.equal(typeof rendered, "string", manifest.id);
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

test("card de prática pode concentrar o enunciado apenas no package de resposta", () => {
  const card = {
    ...theoryCard(),
    id: "practice-1",
    role: "practice",
    content: [],
    response: choiceResponse()
  };
  assert.equal(validateCardEnvelope(card, RESOURCE_PACKAGE_REGISTRY).valid, true);
});

test("envelope rejeita repetição do enunciado de choice em paragraph", () => {
  const question = "Qual protocolo confirma a entrega?";
  const card = {
    ...theoryCard(),
    id: "practice-duplicate",
    role: "practice",
    content: [paragraphInstance({ text: `  ${question.toUpperCase()}  ` })],
    response: choiceResponse(question)
  };
  assert.match(
    validateCardEnvelope(card, RESOURCE_PACKAGE_REGISTRY).errors.join(" "),
    /não pode repetir a mesma pergunta/u
  );
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

test("kernel delega hidratação opcional apenas ao package da instância", async () => {
  const hydrated = [];
  const fixture = {
    ...paragraphPackage,
    manifest: {
      ...paragraphPackage.manifest,
      id: "aralearn.resource.hydrated",
      label: "Hidratado"
    },
    async hydrate(root) {
      hydrated.push(root);
    }
  };
  const registry = createPackageRegistry([paragraphPackage, fixture]);
  const instanceRoot = {
    getAttribute(name) {
      return name === "data-package" ? fixture.manifest.id : fixture.manifest.version;
    }
  };
  await registry.hydrate({
    matches() { return false; },
    querySelectorAll() { return [instanceRoot]; }
  });
  assert.deepEqual(hydrated, [instanceRoot]);
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
