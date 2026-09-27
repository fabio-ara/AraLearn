import { bpmnProcessPackage } from "../../src/resources/packages/bpmn-process/index.js";

export function bpmnInstance({ invalid = false } = {}) {
  const data = structuredClone(bpmnProcessPackage.authoringContract.example);
  if (invalid) data.flows.push({ id: "legacy", kind: "message", from: "send", to: "finish", label: "entrega" });
  return { id: "bpmn", package: bpmnProcessPackage.manifest.id, version: "1.0.0", data };
}

// All event representations supported by the subset; independent of real courses.
export function bpmnEventFixture() {
  const data = { participants: ["Solicitante", "Atendimento", "Registro"].map((label, index) => ({
    id: `p${index}`, label, lanes: [{ id: "lane", label: "Responsável" }] })), nodes: [], flows: [] };
  const node = (id, kind, label, participant) => data.nodes.push({ id, kind, label, participant, lane: "lane" });
  const sequence = (from, to) => data.flows.push({ id: `s${data.flows.length}`, kind: "sequence", from, to });
  const message = (id, from, to, label) => data.flows.push({ id, kind: "message", from, to, label });
  node("start", "start_event", "Início", "p0");
  node("send", "user_task", "Enviar pedido", "p0");
  node("catch", "intermediate_event", "Receber aviso", "p0");
  node("receive", "intermediate_event", "Receber entrega", "p0");
  node("end", "end_event", "Fim", "p0");
  node("messageStart", "start_event", "Pedido recebido", "p1");
  node("work", "task", "Preparar entrega", "p1");
  node("throw", "intermediate_event", "Enviar aviso", "p1");
  node("messageEnd", "end_event", "Enviar entrega", "p1");
  node("multipleStart", "start_event", "Receber registros", "p2");
  node("register", "service_task", "Registrar pedido", "p2");
  node("multipleEnd", "end_event", "Notificar conclusão", "p2");
  for (const chain of [["start", "send", "catch", "receive", "end"],
    ["messageStart", "work", "throw", "messageEnd"], ["multipleStart", "register", "multipleEnd"]]) {
    chain.slice(1).forEach((to, index) => sequence(chain[index], to));
  }
  message("m1", "send", "messageStart", "pedido");
  message("m2", "throw", "catch", "aviso");
  message("m3", "messageEnd", "receive", "entrega");
  message("m4", "send", "multipleStart", "solicitação");
  message("m5", "work", "multipleStart", "preparo");
  message("m6", "multipleEnd", "send", "protocolo");
  message("m7", "multipleEnd", "work", "registro");
  return { id: "event-bpmn", package: bpmnProcessPackage.manifest.id, version: "1.0.0", data };
}
