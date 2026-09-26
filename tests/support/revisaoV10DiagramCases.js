import { bpmnProcessPackage } from "../../src/resources/packages/bpmn-process/index.js";
import { softwareContainerPackage } from "../../src/resources/packages/software-container/index.js";
import { stateMachinePackage } from "../../src/resources/packages/state-machine/index.js";

// Casos sintéticos dos diagramas de sistema desta revisão. Nenhum dado de curso é
// importado: os cenários densos trazem apenas os campos que o desenho consome.
function caseOf(definition, data) {
  return { packageId: definition.manifest.id, version: definition.manifest.version, data };
}

// Duas áreas vizinhas com raias próprias e um fluxo de mensagem rotulado entre
// elas: a geometria em que o rótulo de aresta disputa espaço com o rótulo do
// participante seguinte (caso denso de O073, com texto sintético).
function denseBpmn() {
  return {
    prompt: "Acompanhe o pedido entre duas áreas e o aviso trocado entre elas.",
    participants: [
      { id: "requester", label: "Solicitante", lanes: [{ id: "request_lane", label: "Pedido" }] },
      { id: "service", label: "Atendimento ao público", lanes: [{ id: "service_lane", label: "Triagem inicial" }] }
    ],
    nodes: [
      { id: "start", kind: "start_event", participant: "requester", lane: "request_lane", label: "Pedido recebido" },
      { id: "send", kind: "user_task", participant: "requester", lane: "request_lane", label: "Enviar pedido" },
      { id: "receive", kind: "start_event", participant: "service", lane: "service_lane", label: "Pedido em triagem" },
      { id: "register", kind: "user_task", participant: "service", lane: "service_lane", label: "Registrar pedido" },
      { id: "finish", kind: "end_event", participant: "service", lane: "service_lane", label: "Pedido resolvido" }
    ],
    flows: [
      { id: "f1", from: "start", to: "send", kind: "sequence" },
      { id: "m1", from: "send", to: "receive", kind: "message", label: "confirmação registrada" },
      { id: "f2", from: "receive", to: "register", kind: "sequence" },
      { id: "f3", from: "register", to: "finish", kind: "sequence" }
    ]
  };
}

// Transição com guarda/ação, self-loop e exploração: o caso que exige vínculo
// inequívoco entre rótulo e aresta.
function guardedMachine() {
  const data = structuredClone(stateMachinePackage.authoringContract.example);
  data.states.push({ id: "retry", label: "Aguardando nova tentativa", initial: false, accepting: false });
  data.events.push({ id: "retry_event", label: "receber evento de nova tentativa" });
  data.transitions.push({ id: "loop", from: "retry", event: "retry_event", to: "retry",
    guard: "limite ainda não atingido", action: "registrar a nova tentativa" });
  data.transitions[0].guard = "condição de sessão pronta";
  return data;
}

function longLabelBpmn() {
  const data = structuredClone(bpmnProcessPackage.authoringContract.example);
  data.flows.find(({ id }) => id === "f7").label = "dados recebidos após validação do formulário";
  return data;
}

export const REVISAO_V10_DIAGRAM_CASES = Object.freeze(["container", "bpmn-long-label", "dense-bpmn", "guarded-machine"]);

export function revisaoV10DiagramCase(name) {
  if (name === "container") {
    return caseOf(softwareContainerPackage, structuredClone(softwareContainerPackage.authoringContract.example));
  }
  if (name === "bpmn-long-label") return caseOf(bpmnProcessPackage, longLabelBpmn());
  if (name === "dense-bpmn") return caseOf(bpmnProcessPackage, denseBpmn());
  if (name === "guarded-machine") return caseOf(stateMachinePackage, guardedMachine());
  throw new RangeError("Caso de diagrama desconhecido: " + String(name));
}
