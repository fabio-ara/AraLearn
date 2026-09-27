// Static rules for the declared subset: ordinary flow events, activities and
// exclusive/parallel gateways. No boundary events, execution or reachability.
// OMG BPMN 2.0.2 §§7.6.2, 10.5.2–10.5.5.
export function inspectBpmnSemantics(data) {
  const nodes = data?.nodes ?? [];
  const flows = data?.flows ?? [];
  const byId = new Map(nodes.map(node => [node.id, node]));
  const issues = [];
  flows.forEach((flow, index) => {
    const from = byId.get(flow.from);
    const to = byId.get(flow.to);
    if (!from || !to) return; // Structural validation owns missing references.
    const target = `Fluxo ${flow.label ? `“${flow.label}”, ` : ""}de “${from.label}” para “${to.label}”`;
    const add = (code, reason) => issues.push({ code, path: `flows[${index}]`, flowId: flow.id,
      message: `${target}: ${reason}` });
    if (flow.kind === "sequence") {
      if (from.kind === "end_event") add("bpmn_sequence_from_end", "um evento final não origina sequência. Revise a origem do fluxo.");
      if (to.kind === "start_event") add("bpmn_sequence_to_start", "um evento inicial não recebe sequência. Revise o destino do fluxo.");
    } else if (flow.kind === "message") {
      if (from.kind === "start_event") add("bpmn_message_from_start", "um evento inicial não envia mensagem. Revise a origem do fluxo.");
      if (to.kind === "end_event") add("bpmn_message_to_end", "um evento final não recebe mensagem. Revise o destino do fluxo.");
      if ([from, to].some(node => ["exclusive_gateway", "parallel_gateway"].includes(node.kind))) {
        add("bpmn_message_gateway", "gateways não enviam nem recebem mensagens. Conecte a mensagem a uma atividade ou evento compatível.");
      }
    }
  });
  nodes.forEach((node, index) => {
    const incoming = flows.filter(flow => flow.to === node.id);
    const outgoing = flows.filter(flow => flow.from === node.id);
    const add = (code, reason) => issues.push({ code, path: `nodes[${index}]`, nodeId: node.id,
      message: `Evento “${node.label}”: ${reason}` });
    if (["end_event", "intermediate_event"].includes(node.kind) && !incoming.some(flow => flow.kind === "sequence")) {
      add("bpmn_event_sequence_input", "precisa receber um fluxo de sequência. Revise sua ligação ao processo.");
    }
    if (["start_event", "intermediate_event"].includes(node.kind) && !outgoing.some(flow => flow.kind === "sequence")) {
      add("bpmn_event_sequence_output", "precisa originar um fluxo de sequência. Revise sua ligação ao processo.");
    }
    if (node.kind === "intermediate_event" &&
        incoming.concat(outgoing).filter(flow => flow.kind === "message").length > 1) {
      add("bpmn_intermediate_message_direction", "o intermediário deste subconjunto recebe uma mensagem ou envia uma mensagem, sem combinar as duas direções. Revise os fluxos de mensagem.");
    }
  });
  // Each participant carries one process level in this subset (no subprocesses).
  // An end in another pool cannot complete it; lanes do not create new levels.
  for (const participant of data?.participants ?? []) {
    const index = nodes.findIndex(node => node.participant === participant.id && node.kind === "start_event");
    const endIndex = nodes.findIndex(node => node.participant === participant.id && node.kind === "end_event");
    if (index >= 0 && endIndex < 0) {
      issues.push({ code: "bpmn_start_without_end", path: `nodes[${index}]`, nodeId: nodes[index].id,
        message: `Participante “${participant.label}”, com início “${nodes[index].label}”: precisa de ao menos um evento final no mesmo processo. Revise o encerramento deste participante.` });
    } else if (endIndex >= 0 && index < 0) {
      issues.push({ code: "bpmn_end_without_start", path: `nodes[${endIndex}]`, nodeId: nodes[endIndex].id,
        message: `Participante “${participant.label}”, com final “${nodes[endIndex].label}”: precisa de ao menos um evento inicial no mesmo processo. Revise o início deste participante.` });
    }
  }
  return issues;
}

export function bpmnEventPresentation(node, data) {
  if (!["start_event", "end_event", "intermediate_event"].includes(node.kind)) return null;
  const incoming = data.flows.filter(flow => flow.kind === "message" && flow.to === node.id).length;
  const outgoing = data.flows.filter(flow => flow.kind === "message" && flow.from === node.id).length;
  // Inconsistent legacy endpoints remain literal; never invent a repaired type.
  if (node.kind === "start_event" && outgoing || node.kind === "end_event" && incoming ||
      node.kind === "intermediate_event" && incoming + outgoing > 1) return null;
  if (!incoming && !outgoing) return null;
  return { marker: incoming + outgoing > 1 ? "multiple" : "message", direction: incoming ? "catch" : "throw" };
}

function structure(data) {
  const sorted = values => values.sort((a, b) => a.id.localeCompare(b.id, "en"));
  return JSON.stringify({
    participants: sorted(data.participants.map(p => ({ id: p.id, lanes: [...p.lanes.map(l => l.id)].sort() }))),
    nodes: sorted(data.nodes.map(({ id, kind, participant, lane }) => ({ id, kind, participant, lane }))),
    flows: sorted(data.flows.map(({ id, kind, from, to }) => ({ id, kind, from, to })))
  });
}

// `previous` must come from the authorized saved scope, never request metadata.
// Text-only edits retain diagnostics, but do not make old content inaccessible.
export function inspectBpmnAuthoring(content, previous = null) {
  return ["content", "feedback"].flatMap(slot => (content?.[slot] ?? []).flatMap((instance, index) => {
    if (instance.package !== "aralearn.resource.bpmn_process") return [];
    const prior = previous?.[slot]?.find(item => item.id === instance.id && item.package === instance.package && item.version === instance.version);
    const preserved = Boolean(prior && structure(prior.data) === structure(instance.data));
    return inspectBpmnSemantics(instance.data).map(issue => ({ ...issue,
      path: `${slot}[${index}].data.${issue.path}`, resourceId: instance.id, blocking: !preserved,
      message: `${slot === "feedback" ? "Feedback" : "Conteúdo"}, diagrama ${index + 1}: ${issue.message}` }));
  }));
}

export function requireBpmnAuthoring(content, previous = null) {
  const issues = inspectBpmnAuthoring(content, previous);
  const blockers = issues.filter(issue => issue.blocking);
  if (blockers.length) {
    const error = new TypeError(blockers.map(issue => issue.message).join(" "));
    error.code = "bpmn_semantics_invalid";
    error.details = { blockers };
    throw error;
  }
  return issues;
}
