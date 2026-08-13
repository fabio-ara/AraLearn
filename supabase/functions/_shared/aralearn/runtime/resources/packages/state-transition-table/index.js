import { academicProfile } from "../../sdk/academic.js";
import { renderPackageInline, renderPackageProse } from "../../sdk/html.js";

function text(value) {
  return String(value ?? "").trim();
}

function destinationText(transition, stateNames) {
  return `${stateNames.get(transition.to) || transition.to}${transition.action ? ` / ${transition.action}` : ""}`;
}

export const stateTransitionTablePackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.resource.state_transition_table",
    version: "1.0.0",
    label: "Tabela de transição",
    purpose: "Comparar de forma exaustiva a função de transição por estado e evento ou símbolo.",
    slots: Object.freeze(["content", "feedback"]),
    cognitiveOperations: Object.freeze(["compare-transition-function", "locate-missing-transition", "test-determinism", "evaluate-input"]),
    academic: academicProfile({
      domains: ["linguagens formais", "sistemas digitais", "protocolos"],
      knowledgeObjects: ["função de transição", "estado", "evento", "destino"],
      conventions: ["estado por linha", "evento por coluna", "marcador de estado inicial e final", "destinos múltiplos explícitos"],
      appropriateWhen: ["é preciso comparar a cobertura ou a completude da função de transição"],
      avoidWhen: ["o percurso e a estrutura visual dos estados são o objeto"],
      technologies: ["tabela HTML semântica"],
      practiceModes: ["exposition", "gap", "typing", "selection"]
    }),
    responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.choice"]),
    limitations: Object.freeze(["Alfabetos ou conjuntos de estados extensos devem ser recortados."]),
    accessibility: "Cabeçalhos identificam eventos; cada linha declara um estado e seus destinos."
  }),
  authoringContract: Object.freeze({
    intent: "Declare a função de transição quando a comparação tabular for o gesto cognitivo; use state_machine para percursos.",
    required: Object.freeze(["states", "events", "transitions"]),
    optional: Object.freeze(["prompt"]),
    rules: Object.freeze(["Todo estado e evento referenciado existe.", "Ausência de transição é materializada por travessão.", "Destinos múltiplos permanecem na mesma célula."]),
    example: Object.freeze({
      prompt: "Compare a função de transição do autômato que reconhece cadeias binárias terminadas em 01.",
      states: [{ id: "q0", label: "q₀", initial: true, accepting: false }, { id: "q1", label: "q₁", initial: false, accepting: false }, { id: "q2", label: "q₂", initial: false, accepting: true }],
      events: [{ id: "zero", label: "0" }, { id: "one", label: "1" }],
      transitions: [{ id: "t1", from: "q0", event: "zero", to: "q1" }, { id: "t2", from: "q0", event: "one", to: "q0" }, { id: "t3", from: "q1", event: "zero", to: "q1" }, { id: "t4", from: "q1", event: "one", to: "q2" }, { id: "t5", from: "q2", event: "zero", to: "q1" }, { id: "t6", from: "q2", event: "one", to: "q0" }]
    })
  }),
  schema: Object.freeze({ type: "object", additionalProperties: false, required: ["states", "events", "transitions"], properties: {
    prompt: { type: "string" },
    states: { type: "array", minItems: 1, maxItems: 20, items: { type: "object", additionalProperties: false, required: ["id", "label", "initial", "accepting"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 }, initial: { type: "boolean" }, accepting: { type: "boolean" } } } },
    events: { type: "array", minItems: 1, maxItems: 20, items: { type: "object", additionalProperties: false, required: ["id", "label"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 } } } },
    transitions: { type: "array", minItems: 1, maxItems: 80, items: { type: "object", additionalProperties: false, required: ["id", "from", "event", "to"], properties: { id: { type: "string", minLength: 1 }, from: { type: "string", minLength: 1 }, event: { type: "string", minLength: 1 }, to: { type: "string", minLength: 1 }, action: { type: "string" } } } }
  } }),
  normalize(data) {
    return { ...(data?.prompt ? { prompt: text(data.prompt) } : {}), states: (data?.states || []).map((state) => ({ id: text(state?.id), label: text(state?.label), initial: state?.initial === true, accepting: state?.accepting === true })), events: (data?.events || []).map((event) => ({ id: text(event?.id), label: text(event?.label) })), transitions: (data?.transitions || []).map((transition) => ({ id: text(transition?.id), from: text(transition?.from), event: text(transition?.event), to: text(transition?.to), ...(transition?.action ? { action: text(transition.action) } : {}) })) };
  },
  validate(data) {
    const states = new Set(data.states.map(({ id }) => id));
    const events = new Set(data.events.map(({ id }) => id));
    const errors = [];
    if (states.size !== data.states.length || events.size !== data.events.length || new Set(data.transitions.map(({ id }) => id)).size !== data.transitions.length) errors.push("Estados, eventos e transições precisam de ids únicos.");
    if (data.transitions.some(({ from, to, event }) => !states.has(from) || !states.has(to) || !events.has(event))) errors.push("Transição referencia estado ou evento inexistente.");
    return errors;
  },
  render(data) {
    const transitions = new Map();
    data.transitions.forEach((transition) => { const key = `${transition.from}\u0000${transition.event}`; transitions.set(key, [...(transitions.get(key) || []), transition]); });
    const stateNames = new Map(data.states.map(({ id, label }) => [id, label]));
    return `<div class="runtime-block package-state-transition-table">${data.prompt ? renderPackageProse(data.prompt) : ""}<div class="runtime-table-wrap"><div class="runtime-table-frame"><table class="runtime-table"><thead><tr><th scope="col">Estado</th>${data.events.map((event) => `<th scope="col">${renderPackageInline(event.label)}</th>`).join("")}</tr></thead><tbody>${data.states.map((state) => `<tr><th scope="row"><span class="package-state-markers">${state.initial ? "→" : ""}${state.accepting ? "◎" : ""}</span>${renderPackageInline(state.label)}</th>${data.events.map((event) => `<td>${(transitions.get(`${state.id}\u0000${event.id}`) || []).map((transition) => `<span class="package-state-destination">${renderPackageInline(destinationText(transition, stateNames))}</span>`).join("") || "—"}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div><p class="package-state-legend">→ inicial · ◎ final ou aceitação</p></div>`;
  },
  accessibleText(data) {
    const stateNames = new Map(data.states.map(({ id, label }) => [id, label]));
    const eventNames = new Map(data.events.map(({ id, label }) => [id, label]));
    return `${data.prompt || "Tabela de transição."} ${data.transitions.map((transition) => `${stateNames.get(transition.from)}, com ${eventNames.get(transition.event)}, vai para ${destinationText(transition, stateNames)}`).join("; ")}.`;
  },
  editableTargets(data) {
    return [...(data.prompt ? [{ path: "prompt", label: "Editar orientação" }] : []), ...data.states.map((_, index) => ({ path: `states[${index}].label`, label: `Editar estado ${index + 1}` })), ...data.events.map((_, index) => ({ path: `events[${index}].label`, label: `Editar evento ${index + 1}` })), ...data.transitions.flatMap((transition, index) => transition.action ? [{ path: `transitions[${index}].action`, label: `Editar ação ${index + 1}` }] : [])];
  },
  practiceTargets(data) {
    return [...data.states.map((_, index) => ({ path: `states[${index}].label`, label: `Lacuna no estado ${index + 1}`, modes: ["gap", "typing"] })), ...data.events.map((_, index) => ({ path: `events[${index}].label`, label: `Lacuna no evento ${index + 1}`, modes: ["gap", "typing"] })), ...data.transitions.flatMap((transition, index) => transition.action ? [{ path: `transitions[${index}].action`, label: `Lacuna na ação ${index + 1}`, modes: ["gap", "typing"] }] : [])];
  }
});
