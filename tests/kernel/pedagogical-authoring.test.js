import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluatePedagogicalBlueprint,
  pedagogicalBlueprintContract
} from "../../src/authoring/pedagogicalBlueprint.js";
import { evaluatePedagogicalBlueprint as evaluateEdgeBlueprint } from "../../supabase/functions/_shared/aralearn/runtime/authoring/pedagogicalBlueprint.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../../src/resources/packages/index.js";
import {
  prepareAuthoringContext
} from "../../supabase/functions/_shared/aralearn-authoring/authoringKnowledge.js";
import {
  AUTHORING_WORKSPACE_MCP_TOOLS,
  mapAuthoringMcpToolCall
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceMcpTools.js";

const candidates = [
  { id: "prose", packageId: "aralearn.resource.paragraph", version: "1.0.0", reason: "Situa e explica progressivamente." },
  { id: "topology", packageId: "aralearn.resource.network_topology", version: "1.0.0", reason: "Torna equipamentos, segmentos e caminhos de pacote observáveis." },
  { id: "process", packageId: "aralearn.resource.flow", version: "1.0.0", reason: "Explicita a progressão e as decisões de um processo." },
  { id: "internal-system", packageId: "aralearn.resource.system_internal_block", version: "1.0.0", reason: "Explicita partes, portas e fluxos internos de um sistema." },
  { id: "mapping", packageId: "aralearn.resource.relation_map", version: "1.0.0", reason: "Contrasta papéis e correspondências." },
  { id: "recall", packageId: "aralearn.response.gap", version: "1.0.0", reason: "Recupera termo já ensinado." },
  { id: "choice", packageId: "aralearn.response.choice", version: "1.0.0", reason: "Discrimina conceitos próximos com distratores funcionais." }
];

function layer(id, plainLanguageReferent, formalTerms, requiresLayerIds = []) {
  return { id, plainLanguageReferent, formalTerms, requiresLayerIds };
}

function theory(id, layerIds, purpose, cognitiveOperation, packageCandidateIds) {
  return { id, layerIds, purpose, cognitiveOperation, packageCandidateIds };
}

function practice(id, targetLayerIds, decision, cognitiveOperation, packageCandidateIds) {
  return { id, targetLayerIds, decision, cognitiveOperation, packageCandidateIds, feedback: `Explica por que a decisão de ${decision.toLocaleLowerCase("pt-BR")} está correta e contrasta o erro provável.` };
}

function ledger(layers) {
  return layers.flatMap(({ id, formalTerms }) => formalTerms.map((term) => ({
    term,
    introducedInLayerId: id,
    plainMeaning: `Explicação concreta e contextualizada de ${term}.`
  })));
}

function blueprint({ goal, situation, layers, theorySteps, practiceSteps }) {
  return {
    goal,
    learnerSituation: situation,
    learningConditions: [],
    contentDemands: [{
      id: "understand-relations",
      description: "Interpretar as relações e decisões próprias deste conteúdo.",
      cognitiveOperations: ["explain", "discriminate"]
    }],
    anticipatedDifficulties: [{
      id: "missing-referent",
      description: "Os conceitos podem permanecer abstratos sem progressão suficiente.",
      contentDemandIds: ["understand-relations"],
      learningConditionIds: []
    }],
    designResponses: [{
      id: "progressive-foundation",
      difficultyIds: ["missing-referent"],
      decision: "Construir a relação em camadas antes da prática.",
      theoryStepIds: theorySteps.map(({ id }) => id),
      practiceStepIds: practiceSteps.map(({ id }) => id),
      packageCandidateIds: candidates.map(({ id }) => id),
      materializationChecks: [
        "A teoria oferece um referente antes de introduzir os termos formais."
      ]
    }],
    prerequisiteEvidence: [],
    conceptualLayers: layers,
    theorySteps,
    practiceSteps,
    feedbackPlan: "Cada prática explica a relação causal, contrasta o distrator e retoma a camada correspondente.",
    termLedger: ledger(layers),
    packageCandidates: candidates
  };
}

test("blueprint de Transporte e sistema de nomes progride antes de praticar", () => {
  const layers = [
    layer("end-to-end", "Dois programas em máquinas diferentes precisam trocar dados.", ["comunicação fim a fim"]),
    layer("ports", "O sistema precisa entregar cada mensagem ao programa certo.", ["porta", "socket"], ["end-to-end"]),
    layer("transport", "Aplicações fazem escolhas diferentes entre confirmação e rapidez.", ["Transmission Control Protocol (TCP)", "User Datagram Protocol (UDP)"], ["ports"]),
    layer("names", "Pessoas usam nomes, enquanto a rede encaminha por endereços.", ["Domain Name System (DNS)", "resolução de nomes"], ["end-to-end"])
  ];
  const result = evaluatePedagogicalBlueprint(blueprint({
    goal: "Compreender transporte, aplicações e resolução de nomes sem pressupor redes.",
    situation: "A pessoa já usou navegador e aplicativos, mas nunca estudou portas, transporte ou DNS.",
    layers,
    theorySteps: [
      theory("t1", ["end-to-end"], "Dar referente concreto à comunicação entre processos.", "situate", ["prose"]),
      theory("t2", ["ports"], "Explicar como o destino interno é identificado.", "explain", ["prose"]),
      theory("t3", ["transport"], "Contrastar decisões de transporte em cenários concretos.", "explain", ["prose"]),
      theory("t4", ["names"], "Percorrer a passagem de nome legível a endereço.", "trace-control-flow", ["process"])
    ],
    practiceSteps: [
      practice("p1", ["ports"], "Recuperar o papel da porta", "recall", ["recall"]),
      practice("p2", ["transport"], "Discriminar TCP e UDP por requisito", "discriminate", ["choice"]),
      practice("p3", ["names"], "Identificar a etapa correta da resolução", "discriminate", ["choice"])
    ]
  }), RESOURCE_PACKAGE_REGISTRY);
  assert.equal(result.valid, true, result.errors.join(" "));
  assert.equal(result.metrics.conceptualLayerCount, 4);
  assert.equal(result.metrics.practiceStepCount, 3);
});

test("blueprint de SNMP e RMON cria referentes antes das siglas", () => {
  const layers = [
    layer("problem", "Uma equipe precisa observar muitos dispositivos sem visitá-los um a um.", ["gerência de redes"]),
    layer("roles", "Um componente central pergunta e um componente local observa o dispositivo.", ["gerente", "agente"], ["problem"]),
    layer("managed-data", "Os dados gerenciáveis precisam de nomes estáveis e organização.", ["Management Information Base (MIB)", "Object Identifier (OID)"], ["roles"]),
    layer("snmp", "O gerente lê, altera ou recebe aviso sobre os objetos.", ["Simple Network Management Protocol (SNMP)", "Get", "Set", "Trap", "Inform"], ["managed-data"]),
    layer("rmon", "Uma probe observa o segmento e acumula histórico perto da origem.", ["Remote Network Monitoring (RMON)", "probe"], ["snmp"])
  ];
  const result = evaluatePedagogicalBlueprint(blueprint({
    goal: "Entender por que SNMP e RMON existem, seus componentes e suas diferenças operacionais.",
    situation: "A pessoa reconhece roteadores e switches, mas nunca administrou uma rede nem viu uma MIB.",
    layers,
    theorySteps: [
      theory("t1", ["problem"], "Situar o problema humano e operacional.", "situate", ["prose"]),
      theory("t2", ["roles"], "Visualizar a direção entre gerente, agente e dispositivo.", "trace-item-flow", ["internal-system"]),
      theory("t3", ["managed-data"], "Relacionar objetos aos identificadores que os localizam.", "map-correspondence", ["mapping"]),
      theory("t4", ["snmp"], "Explicar consultas, alterações e avisos em camadas.", "explain", ["prose"]),
      theory("t5", ["rmon"], "Contrastar coleta local e consulta central.", "explain", ["prose"])
    ],
    practiceSteps: [
      practice("p1", ["roles"], "Discriminar gerente e agente", "discriminate", ["choice"]),
      practice("p2", ["managed-data"], "Recuperar o papel de MIB e OID", "recall", ["recall"]),
      practice("p3", ["snmp"], "Escolher a operação adequada ao cenário", "discriminate", ["choice"]),
      practice("p4", ["rmon"], "Contrastar SNMP e RMON", "discriminate", ["choice"])
    ]
  }), RESOURCE_PACKAGE_REGISTRY);
  assert.equal(result.valid, true, result.errors.join(" "));
  assert.equal(result.metrics.theoryStepCount, 5);
  assert.equal(result.metrics.practicedLayerCount, 4);
});

test("blueprint aceita ausência justificada de dificuldade e prática", () => {
  const value = blueprint({
    goal: "Situar uma convenção já conhecida antes da próxima unidade.",
    situation: "A pessoa já demonstrou o pré-requisito e só precisa localizar o referente.",
    layers: [layer("referent", "Um referente já familiar.", ["referente formal"])],
    theorySteps: [
      theory("t1", ["referent"], "Localizar a convenção no contexto corrente.", "situate", ["prose"])
    ],
    practiceSteps: []
  });
  value.learningConditions = [{
    id: "short-session",
    description: "A consulta ocorrerá numa sessão curta.",
    designRelevance: "Manter o referente integral num único passo explicativo."
  }];
  value.anticipatedDifficulties = [];
  value.designResponses = [];
  const result = evaluatePedagogicalBlueprint(value, RESOURCE_PACKAGE_REGISTRY);
  assert.equal(result.valid, true, result.errors.join(" "));
  assert.equal(result.metrics.anticipatedDifficultyCount, 0);
  assert.equal(result.metrics.practiceStepCount, 0);
});

test("blueprint exige seções e listas internas explícitas mesmo quando vazias", () => {
  const value = blueprint({
    goal: "Explicitar uma decisão local.",
    situation: "A condição pertinente já foi confirmada.",
    layers: [layer("referent", "Um referente observável.", ["termo formal"])],
    theorySteps: [
      theory("t1", ["referent"], "Introduzir o referente.", "situate", ["prose"])
    ],
    practiceSteps: []
  });
  delete value.practiceSteps;
  const missingSection = evaluatePedagogicalBlueprint(value, RESOURCE_PACKAGE_REGISTRY);
  assert.equal(missingSection.valid, false);
  assert.match(missingSection.errors.join(" "), /Seções ausentes: practiceSteps/iu);

  const missingNestedList = blueprint({
    goal: "Explicitar uma decisão local.",
    situation: "A condição pertinente já foi confirmada.",
    layers: [layer("referent", "Um referente observável.", ["termo formal"])],
    theorySteps: [
      theory("t1", ["referent"], "Introduzir o referente.", "situate", ["prose"])
    ],
    practiceSteps: []
  });
  delete missingNestedList.anticipatedDifficulties[0].learningConditionIds;
  missingNestedList.anticipatedDifficulties[0].extra = true;
  const invalidNested = evaluatePedagogicalBlueprint(
    missingNestedList,
    RESOURCE_PACKAGE_REGISTRY
  );
  assert.equal(invalidNested.valid, false);
  assert.match(invalidNested.errors.join(" "), /omite campos obrigatórios: learningConditionIds/iu);
  assert.match(invalidNested.errors.join(" "), /campos desconhecidos: extra/iu);
});

test("resposta de desenho referencia somente passos e packages materializados", () => {
  const value = blueprint({
    goal: "Explicar uma relação antes de verificá-la.",
    situation: "A pessoa ainda não conhece a relação formal.",
    layers: [layer("relation", "Dois elementos mudam em conjunto.", ["relação formal"])],
    theorySteps: [
      theory("t1", ["relation"], "Tornar a relação observável.", "situate", ["prose"])
    ],
    practiceSteps: []
  });
  value.designResponses[0].theoryStepIds = ["passo-inexistente"];
  value.designResponses[0].packageCandidateIds = ["package-inexistente"];
  const result = evaluatePedagogicalBlueprint(value, RESOURCE_PACKAGE_REGISTRY);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /passo de teoria inexistente/iu);
  assert.match(result.errors.join(" "), /candidato inexistente/iu);
});

test("eval rejeita o padrão condensado observado no curso antigo", () => {
  const bad = {
    goal: "Resumir SNMP e RMON.",
    learnerSituation: "Iniciante.",
    learningConditions: [{
      id: "unused-condition",
      description: "Condição sem efeito demonstrado.",
      designRelevance: "Não definida."
    }],
    contentDemands: [{
      id: "read-dense-table",
      description: "Interpretar muitas relações simultâneas.",
      cognitiveOperations: ["explain"]
    }],
    anticipatedDifficulties: [{
      id: "dense-abstraction",
      description: "Carga terminológica sem referente.",
      contentDemandIds: ["read-dense-table"],
      learningConditionIds: []
    }],
    designResponses: [],
    prerequisiteEvidence: [],
    conceptualLayers: [
      layer("alphabet-soup", "Tabela com siglas e números.", ["SNMP", "MIB", "OID", "SMI", "PDU", "RMON"], ["missing-foundation"])
    ],
    theorySteps: [
      theory("dense", ["alphabet-soup"], "Apresentar tudo em um diagrama.", "explain", ["topology"])
    ],
    practiceSteps: [
      practice("guess", ["unseen-layer"], "Adivinhar correspondências", "map-correspondence", ["mapping"])
    ],
    feedbackPlan: "Correto ou incorreto.",
    termLedger: [],
    packageCandidates: candidates
  };
  const result = evaluatePedagogicalBlueprint(bad, RESOURCE_PACKAGE_REGISTRY);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /ausente ou posterior/iu);
  assert.match(result.errors.join(" "), /sem compatibilidade/iu);
  assert.match(result.errors.join(" "), /ainda não ensinada/iu);
  assert.match(result.errors.join(" "), /Termo formal sem explicação/iu);
});

test("MCP expõe núcleo protegido, blueprint contextual e somente contrato escolhido", () => {
  const context = prepareAuthoringContext({
    intent: "extend",
    targetEntity: "microsequence",
    context: "Ensinar SNMP e RMON progressivamente a um iniciante.",
    packageIds: ["aralearn.resource.graph"]
  });
  assert.equal(context.briefVersion, 3);
  assert.deepEqual(context.blueprintContract, pedagogicalBlueprintContract());
  assert.equal(context.blueprintContract.version, 2);
  assert.ok(context.blueprintContract.requiredSections.includes("learningConditions"));
  assert.ok(context.blueprintContract.requiredSections.includes("contentDemands"));
  assert.ok(context.blueprintContract.requiredSections.includes("anticipatedDifficulties"));
  assert.ok(context.blueprintContract.requiredSections.includes("designResponses"));
  assert.deepEqual(context.blueprintContract.designResponse.required, [
    "id", "difficultyIds", "decision", "theoryStepIds",
    "practiceStepIds", "packageCandidateIds", "materializationChecks"
  ]);
  assert.match(context.blueprintContract.anticipatedDifficulty.rule, /demanda/iu);
  assert.equal(context.protectedCore.version, 2);
  assert.ok(context.protectedCore.moduleIds.includes("contextual-learning-diagnosis"));
  assert.equal(Object.hasOwn(context, "calibrationContract"), false);
  assert.ok(context.guidance.some(({ id }) => id === "blueprint-before-materialization"));
  assert.deepEqual(context.packageContracts, [{
    packageId: "aralearn.resource.graph",
    version: "1.0.0",
    tool: "consultarBibliotecaDeResources",
    operation: "contracts"
  }]);
  const names = AUTHORING_WORKSPACE_MCP_TOOLS.map(({ name }) => name);
  assert.ok(names.includes("consultarBibliotecaDeResources"));
  assert.deepEqual(
    mapAuthoringMcpToolCall("consultarBibliotecaDeResources", {
      operation: "contracts",
      packages: [{ packageId: "aralearn.resource.graph", version: "1.0.0" }]
    }),
    {
      kind: "resource-library",
      body: {
        operation: "contracts",
        packages: [{ packageId: "aralearn.resource.graph", version: "1.0.0" }]
      },
      requestId: null
    }
  );
  assert.throws(
    () => mapAuthoringMcpToolCall("consultarBibliotecaDeResources", {
      operation: "contracts"
    }),
    /packages/iu
  );
});

test("browser e Edge aplicam o mesmo avaliador de blueprint", () => {
  const invalid = { goal: "", learnerSituation: "" };
  assert.deepEqual(
    evaluateEdgeBlueprint(invalid, RESOURCE_PACKAGE_REGISTRY),
    evaluatePedagogicalBlueprint(invalid, RESOURCE_PACKAGE_REGISTRY)
  );
});
