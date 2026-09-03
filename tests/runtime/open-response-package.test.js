import assert from "node:assert/strict";
import test from "node:test";

import { renderPackageStudyUnitBlocksWithDock } from
  "../../src/render/renderPackageStudyUnit.js";
import { validateStudyUnitEnvelope } from
  "../../src/resources/kernel/studyUnitEnvelope.js";
import { RESOURCE_CATALOG, RESOURCE_PACKAGE_REGISTRY } from
  "../../src/resources/packages/index.js";

const OPEN_RESPONSE = Object.freeze({
  id: "resposta-explicada",
  package: "aralearn.response.open",
  version: "1.0.0",
  data: Object.freeze({
    prompt: "Explique com suas palavras por que o switch consulta o destino depois de aprender com a origem.",
    placeholder: "Relacione origem, tabela MAC e destino."
  })
});

function practiceUnit() {
  return {
    id: "pratica-switch",
    position: 1,
    title: "Explique a decisão do switch",
    role: "practice",
    content: [{
      id: "contexto-rede",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "A tabela está vazia quando o quadro de A para B chega à porta 1." }
    }],
    response: structuredClone(OPEN_RESPONSE),
    feedback: [{
      id: "explicacao-retorno",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: {
        text: "O endereço de origem atualiza a tabela; o endereço de destino orienta o encaminhamento."
      }
    }],
    topics: ["aprendizagem e encaminhamento"]
  };
}

test("resposta aberta é um componente genuíno, consultável pela função didática", () => {
  const manifest = RESOURCE_PACKAGE_REGISTRY.listCatalog().find(({ id }) =>
    id === "aralearn.response.open");
  assert.equal(manifest.label, "Resposta aberta");
  assert.deepEqual(manifest.slots, ["response"]);
  assert.match(manifest.purpose, /produza.*palavras|explique|justifique/iu);

  const search = RESOURCE_CATALOG.search({
    query: "Explicar com palavras próprias sem alternativas",
    slot: "response",
    studyUnitRole: "practice",
    taskOperationIds: ["task_operation.explain"],
    practiceModeIds: ["practice.typing"]
  });
  assert.equal(search.candidates[0].packageId, "aralearn.response.open");
  const openProfile = RESOURCE_CATALOG.getProfile(
    "aralearn.response.open",
    "1.0.0"
  );
  assert.deepEqual(openProfile.structureIds, ["structure.prose"]);
  assert.equal(openProfile.structureIds.includes("structure.response_options"), false);

  const optionSearch = RESOURCE_CATALOG.search({
    query: "Selecionar uma alternativa plausível",
    slot: "response",
    studyUnitRole: "practice",
    structureIds: ["structure.response_options"],
    taskOperationIds: ["task_operation.decide"],
    practiceModeIds: ["practice.selection"]
  });
  assert.equal(optionSearch.candidates[0].packageId, "aralearn.response.choice");

  const contract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(
    "aralearn.response.open",
    "1.0.0"
  );
  assert.deepEqual(contract.contract.required, ["prompt"]);
  assert.deepEqual(contract.contract.optional, ["placeholder"]);
  assert.equal(Object.hasOwn(contract.contract.example, "answer"), false);
  assert.equal(Object.hasOwn(contract.contract.example, "expectedAnswer"), false);
});

test("resposta aberta aceita produção livre sem inventar correção semântica", () => {
  const normalized = RESOURCE_PACKAGE_REGISTRY.normalizeInstance(
    structuredClone(OPEN_RESPONSE),
    "response"
  );
  assert.deepEqual(normalized.data, OPEN_RESPONSE.data);
  assert.deepEqual(
    RESOURCE_PACKAGE_REGISTRY.evaluateResponse(normalized, { text: "  " }),
    { complete: false, text: "" }
  );
  assert.deepEqual(
    RESOURCE_PACKAGE_REGISTRY.evaluateResponse(normalized, {
      text: "O switch aprende pela origem e consulta o destino para decidir a saída."
    }),
    {
      complete: true,
      text: "O switch aprende pela origem e consulta o destino para decidir a saída."
    }
  );
  assert.equal(
    Object.hasOwn(RESOURCE_PACKAGE_REGISTRY.evaluateResponse(normalized, { text: "Resposta." }), "correct"),
    false
  );
});

test("renderer mostra escrita multilinha ao estudante e inspeção honesta à autoria", () => {
  const unit = practiceUnit();
  assert.deepEqual(validateStudyUnitEnvelope(unit, RESOURCE_PACKAGE_REGISTRY), {
    valid: true,
    errors: []
  });

  const prefix = "study-unit:pratica-switch";
  const blockKey = `${prefix}::response:resposta-explicada`;
  const student = renderPackageStudyUnitBlocksWithDock(unit, {
    blockKeyPrefix: prefix,
    responseStateByBlockKey: {
      [blockKey]: {
        text: "Primeira linha.\nSegunda linha.",
        feedback: "recorded"
      }
    }
  });
  assert.match(student.bodyHtml, /Explique com suas palavras/iu);
  assert.match(student.bodyHtml, /<textarea[^>]+data-action="open-response-input"/u);
  assert.match(student.bodyHtml, /aria-labelledby=/u);
  assert.match(student.bodyHtml, /Primeira linha\.&#10;Segunda linha\./u);
  assert.match(student.bodyHtml + student.dockHtml, /Resposta preenchida\./u);
  assert.match(
    student.bodyHtml + student.dockHtml,
    /role="status"[^>]*aria-live="polite"/u
  );
  assert.doesNotMatch(student.bodyHtml + student.dockHtml, /Correto|Incorreto/iu);

  const author = renderPackageStudyUnitBlocksWithDock(unit, {
    blockKeyPrefix: prefix,
    revealPracticeAnswers: true
  });
  assert.match(author.bodyHtml, /Resposta aberta, sem correção automática\./u);
  assert.doesNotMatch(author.bodyHtml, /<textarea|data-action="open-response-input"/u);
  assert.equal(author.dockHtml, "");
});

test("prompt e placeholder da resposta aberta permanecem editáveis na autoria", () => {
  assert.deepEqual(
    RESOURCE_PACKAGE_REGISTRY.editableTargets(structuredClone(OPEN_RESPONSE), "response"),
    [{ path: "prompt", label: "Editar proposta" }, {
      path: "placeholder",
      label: "Editar pista de escrita"
    }]
  );
});

test("identificadores locais duplicados geram correção acionável antes da gravação", () => {
  const unit = practiceUnit();
  unit.response.id = unit.content[0].id;
  const validation = validateStudyUnitEnvelope(unit, RESOURCE_PACKAGE_REGISTRY);
  assert.equal(validation.valid, false);
  assert.match(
    validation.errors.join(" "),
    /repete o mesmo elemento.*refaça.*sem duplicação/iu
  );
  assert.doesNotMatch(validation.errors.join(" "), /contexto-rede|\.id\b/iu);
});
