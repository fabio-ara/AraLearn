import assert from "node:assert/strict";
import test from "node:test";

import { evaluatePedagogicalBlueprint } from "../../src/authoring/pedagogicalBlueprint.js";
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

test("eval rejeita o padrão condensado observado no curso antigo", () => {
  const bad = {
    goal: "Resumir SNMP e RMON.",
    learnerSituation: "Iniciante.",
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

test("MCP expõe blueprint, catálogo compacto e somente contrato versionado escolhido", () => {
  const context = prepareAuthoringContext({
    intent: "extend",
    targetEntity: "microsequence",
    context: "Ensinar SNMP e RMON progressivamente a um iniciante.",
    packageIds: ["aralearn.resource.graph"]
  });
  assert.equal(context.blueprintContract.version, 1);
  assert.deepEqual(context.calibrationContract.precedence, [
    "protected_core",
    "protected_knowledge",
    "user_preferences"
  ]);
  assert.deepEqual(context.calibrationContract.editablePreferenceIds, [
    "tone-and-approach",
    "examples-and-context",
    "practice-variation",
    "terminology-and-notation"
  ]);
  assert.ok(context.guidance.some(({ id }) => id === "blueprint-before-materialization"));
  assert.deepEqual(context.packageContracts, [{
    packageId: "aralearn.resource.graph",
    version: "1.0.0",
    tool: "consultarPackagesDeCard"
  }]);
  const names = AUTHORING_WORKSPACE_MCP_TOOLS.map(({ name }) => name);
  assert.ok(names.includes("consultarPackagesDeCard"));
  assert.equal(names.includes("consultarRecursosDeCard"), false);
  assert.equal(mapAuthoringMcpToolCall("consultarPackagesDeCard", {}).path, "/v1/packages");
  assert.throws(
    () => mapAuthoringMcpToolCall("consultarPackagesDeCard", { packageId: "aralearn.resource.graph" }),
    /packageId e version/iu
  );
});

test("browser e Edge aplicam o mesmo avaliador de blueprint", () => {
  const invalid = { goal: "", learnerSituation: "" };
  assert.deepEqual(
    evaluateEdgeBlueprint(invalid, RESOURCE_PACKAGE_REGISTRY),
    evaluatePedagogicalBlueprint(invalid, RESOURCE_PACKAGE_REGISTRY)
  );
});
