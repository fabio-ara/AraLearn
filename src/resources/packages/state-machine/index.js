import { academicProfile } from "../../sdk/academic.js";
import { dotAttributes, dotQuote, wrapGraphvizLabel } from "../../sdk/graphviz.js";
import { renderPackageInline, renderPackageProse } from "../../sdk/html.js";
import {
  hydrateSystemDiagrams,
  renderSystemDiagramFigure,
  systemDiagramModelLabels
} from "../system-diagrams/shared.js";

function text(value) {
  return String(value ?? "").trim();
}

function transitionLabel(transition, eventNames) {
  return [
    eventNames.get(transition.event) || transition.event,
    transition.guard ? `[${transition.guard}]` : "",
    transition.action ? `/ ${transition.action}` : ""
  ].filter(Boolean).join(" ");
}

function transitionTemplate(transition, eventNames) {
  return `<span>${renderPackageInline(eventNames.get(transition.event) || transition.event)}${transition.guard ? ` [${renderPackageInline(transition.guard)}]` : ""}${transition.action ? ` / ${renderPackageInline(transition.action)}` : ""}</span>`;
}

function machineAccessibleText(data) {
  const stateNames = new Map(data.states.map(({ id, label }) => [id, label]));
  const eventNames = new Map(data.events.map(({ id, label }) => [id, label]));
  return [
    data.prompt,
    `Estado inicial: ${data.states.find(({ initial }) => initial)?.label}.`,
    `Estados finais ou de aceitação: ${data.states.filter(({ accepting }) => accepting).map(({ label }) => label).join(", ") || "nenhum"}.`,
    ...data.transitions.map((transition) => `${stateNames.get(transition.from)}, com ${eventNames.get(transition.event)}${transition.guard ? ` e guarda ${transition.guard}` : ""}, vai para ${stateNames.get(transition.to)}${transition.action ? ` e executa ${transition.action}` : ""}.`)
  ].filter(Boolean).join(" ");
}

function graphvizSource(data) {
  const eventNames = new Map(data.events.map(({ id, label }) => [id, label]));
  return [
    "digraph StateMachine {",
    `  graph ${dotAttributes({ bgcolor: "transparent", pad: "0.2", margin: "0", overlap: "false", splines: "spline", outputorder: "edgesfirst", rankdir: "LR", nodesep: "0.5", ranksep: "0.9" })};`,
    "  node [fontname=\"Arial\", fontsize=\"15\", penwidth=\"1.15\", color=\"#64748b\", fontcolor=\"#111827\", margin=\"0.14,0.08\"];",
    "  edge [fontname=\"Arial\", fontsize=\"13\", penwidth=\"1.15\", color=\"#64748b\", fontcolor=\"#111827\", arrowsize=\"0.72\"];",
    `  ${dotQuote("__initial__")} ${dotAttributes({ id: "state-initial-marker", class: "package-state-machine-initial", label: "", shape: "point", width: "0.12" })};`,
    ...data.states.map((state) => `  ${dotQuote(state.id)} ${dotAttributes({ id: `system-node-${state.id}`, class: `package-state-machine-state${state.accepting ? " is-accepting" : ""}`, label: wrapGraphvizLabel(state.label, 22), shape: state.accepting ? "doublecircle" : "circle", margin: "0.11,0.07" })};`),
    `  ${dotQuote("__initial__")} -> ${dotQuote(data.states.find(({ initial }) => initial)?.id)} ${dotAttributes({ id: "state-initial-edge", class: "package-state-machine-transition", arrowsize: "0.72" })};`,
    ...data.transitions.map((transition) => `  ${dotQuote(transition.from)} -> ${dotQuote(transition.to)} ${dotAttributes({ id: `system-edge-${transition.id}`, class: "package-state-machine-transition", label: wrapGraphvizLabel(transitionLabel(transition, eventNames), 22), arrowsize: "0.72" })};`),
    "}"
  ].join("\n");
}

function labels(data) {
  const eventNames = new Map(data.events.map(({ id, label }) => [id, label]));
  return [
    ...data.states.map((state) => ({ kind: "node", id: state.id, plain: state.label, html: `<span class="package-system-diagram-node-content"><strong>${renderPackageInline(state.label)}</strong></span>` })),
    ...data.transitions.map((transition) => ({ kind: "edge", id: transition.id, plain: transitionLabel(transition, eventNames), html: transitionTemplate(transition, eventNames) }))
  ];
}

export const stateMachinePackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.resource.state_machine",
    version: "1.0.0",
    label: "Diagrama de estados",
    purpose: "Representar comportamento dependente de estado com a notação gráfica de autômatos ou máquinas de estados.",
    slots: Object.freeze(["content", "feedback"]),
    cognitiveOperations: Object.freeze(["trace-transition", "recognize-state", "evaluate-input", "inspect-acceptance"]),
    academic: academicProfile({
      domains: ["linguagens formais", "engenharia de software", "redes de computadores", "sistemas digitais"],
      knowledgeObjects: ["estado", "evento ou símbolo", "transição", "guarda", "ação", "estado inicial e final"],
      conventions: ["estado como nó", "marcador inicial sem estado", "aceitação por circunferência dupla", "evento, guarda e ação na aresta"],
      appropriateWhen: ["o comportamento depende do estado corrente e de um evento ou símbolo"],
      avoidWhen: ["a tarefa exige comparar exaustivamente a função de transição em forma tabular", "a tarefa é apenas seguir um fluxo sem estado persistente"],
      technologies: ["Graphviz", "Viz.js WebAssembly", "SVG", "HTML semântico"],
      practiceModes: ["exposition", "gap", "typing", "selection"]
    }),
    responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.choice"]),
    limitations: Object.freeze(["Autômatos densos devem ser recortados por submáquina ou objetivo.", "Use tabela de transição quando a completude da função, e não o percurso, for o gesto cognitivo."]),
    accessibility: "Estados e transições possuem descrição textual equivalente."
  }),
  authoringContract: Object.freeze({
    intent: "Declare estados, eventos e transições; o renderer calcula o diagrama e aplica a notação estado-evento-guarda-ação.",
    required: Object.freeze(["machineKind", "states", "events", "transitions"]),
    optional: Object.freeze(["prompt"]),
    fieldSemantics: Object.freeze({ machineKind: "deterministic e nondeterministic representam autômatos; protocol admite guardas e ações operacionais.", states: "initial marca a única origem; accepting marca estado final ou de aceitação.", transitions: "Aresta de from para to rotulada pelo evento; guard e action são opcionais e semanticamente distintos." }),
    visualGrammar: Object.freeze(["Ponto sólido sem rótulo = início.", "Círculo = estado.", "Círculo duplo = final ou aceitação.", "Seta rotulada = transição.", "evento [guarda] / ação = ordem do rótulo."]),
    rules: Object.freeze(["Declare exatamente um estado inicial.", "Todo estado e evento referenciado existe.", "DFA não aceita dois destinos para o mesmo par estado-evento.", "Não declare coordenadas, curvas, cores ou formas."]),
    example: Object.freeze({
      prompt: "Acompanhe o ciclo simplificado de uma conexão TCP e observe a diferença entre evento recebido e ação executada.",
      machineKind: "protocol",
      states: [
        { id: "closed", label: "CLOSED", initial: true, accepting: false },
        { id: "listen", label: "LISTEN", initial: false, accepting: false },
        { id: "syn_received", label: "SYN-RECEIVED", initial: false, accepting: false },
        { id: "established", label: "ESTABLISHED", initial: false, accepting: false },
        { id: "close_wait", label: "CLOSE-WAIT", initial: false, accepting: true }
      ],
      events: [{ id: "passive_open", label: "abertura passiva" }, { id: "syn", label: "receber SYN" }, { id: "ack", label: "receber ACK" }, { id: "fin", label: "receber FIN" }],
      transitions: [
        { id: "t1", from: "closed", event: "passive_open", to: "listen", action: "aguardar conexão" },
        { id: "t2", from: "listen", event: "syn", to: "syn_received", action: "enviar SYN+ACK" },
        { id: "t3", from: "syn_received", event: "ack", to: "established", guard: "ACK válido" },
        { id: "t4", from: "established", event: "fin", to: "close_wait", action: "confirmar FIN" }
      ]
    })
  }),
  schema: Object.freeze({ type: "object", additionalProperties: false, required: ["machineKind", "states", "events", "transitions"], properties: {
    prompt: { type: "string" },
    machineKind: { type: "string", enum: ["deterministic", "nondeterministic", "protocol"] },
    states: { type: "array", minItems: 1, maxItems: 20, items: { type: "object", additionalProperties: false, required: ["id", "label", "initial", "accepting"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 }, initial: { type: "boolean" }, accepting: { type: "boolean" } } } },
    events: { type: "array", minItems: 1, maxItems: 20, items: { type: "object", additionalProperties: false, required: ["id", "label"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 } } } },
    transitions: { type: "array", minItems: 1, maxItems: 48, items: { type: "object", additionalProperties: false, required: ["id", "from", "event", "to"], properties: { id: { type: "string", minLength: 1 }, from: { type: "string", minLength: 1 }, event: { type: "string", minLength: 1 }, to: { type: "string", minLength: 1 }, guard: { type: "string" }, action: { type: "string" } } } }
  } }),
  normalize(data) {
    return { ...(data?.prompt ? { prompt: text(data.prompt) } : {}), machineKind: text(data?.machineKind) || "deterministic", states: (data?.states || []).map((state) => ({ id: text(state?.id), label: text(state?.label), initial: state?.initial === true, accepting: state?.accepting === true })), events: (data?.events || []).map((event) => ({ id: text(event?.id), label: text(event?.label) })), transitions: (data?.transitions || []).map((transition) => ({ id: text(transition?.id), from: text(transition?.from), event: text(transition?.event), to: text(transition?.to), ...(transition?.guard ? { guard: text(transition.guard) } : {}), ...(transition?.action ? { action: text(transition.action) } : {}) })) };
  },
  validate(data) {
    const states = new Set(data.states.map(({ id }) => id));
    const events = new Set(data.events.map(({ id }) => id));
    const errors = [];
    if (states.size !== data.states.length || events.size !== data.events.length || new Set(data.transitions.map(({ id }) => id)).size !== data.transitions.length) errors.push("Estados, eventos e transições precisam de ids únicos.");
    if (data.states.filter(({ initial }) => initial).length !== 1) errors.push("A máquina precisa de exatamente um estado inicial.");
    if (data.transitions.some(({ from, to, event }) => !states.has(from) || !states.has(to) || !events.has(event))) errors.push("Transição referencia estado ou evento inexistente.");
    if (data.machineKind === "deterministic" && new Set(data.transitions.map(({ from, event }) => `${from}\u0000${event}`)).size !== data.transitions.length) errors.push("Máquina determinística não aceita dois destinos para o mesmo estado e evento.");
    return errors;
  },
  render(data) {
    const diagramLabels = labels(data);
    const figure = renderSystemDiagramFigure({ source: graphvizSource(data), engine: "dot", accessibleText: machineAccessibleText(data), caption: "Diagrama de estados · evento [guarda] / ação", labels: diagramLabels, model: { labels: systemDiagramModelLabels(diagramLabels) }, focusId: `system-node-${data.states.find(({ initial }) => initial)?.id || ""}`, errorMessage: "Não foi possível diagramar a máquina de estados." });
    return `<div class="runtime-block package-state-machine">${data.prompt ? renderPackageProse(data.prompt) : ""}${figure}</div>`;
  },
  hydrate: hydrateSystemDiagrams,
  accessibleText: machineAccessibleText,
  editableTargets(data) {
    return [...(data.prompt ? [{ path: "prompt", label: "Editar orientação" }] : []), ...data.states.map((_, index) => ({ path: `states[${index}].label`, label: `Editar estado ${index + 1}` })), ...data.events.map((_, index) => ({ path: `events[${index}].label`, label: `Editar evento ${index + 1}` })), ...data.transitions.flatMap((transition, index) => [...(transition.guard ? [{ path: `transitions[${index}].guard`, label: `Editar guarda ${index + 1}` }] : []), ...(transition.action ? [{ path: `transitions[${index}].action`, label: `Editar ação ${index + 1}` }] : [])])];
  },
  practiceTargets(data) {
    return [...data.states.map((_, index) => ({ path: `states[${index}].label`, label: `Lacuna no estado ${index + 1}`, modes: ["gap", "typing"] })), ...data.events.map((_, index) => ({ path: `events[${index}].label`, label: `Lacuna no evento ${index + 1}`, modes: ["gap", "typing"] })), ...data.transitions.flatMap((transition, index) => [...(transition.guard ? [{ path: `transitions[${index}].guard`, label: `Lacuna na guarda ${index + 1}`, modes: ["gap", "typing"] }] : []), ...(transition.action ? [{ path: `transitions[${index}].action`, label: `Lacuna na ação ${index + 1}`, modes: ["gap", "typing"] }] : [])])];
  }
});
