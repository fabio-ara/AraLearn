import { academicProfile } from "../../sdk/academic.js";
import { escapePackageAttribute, renderPackageInline, renderPackageProse } from "../../sdk/html.js";

function text(value) {
  return String(value ?? "").trim();
}


const FIELD_ROLE_LABELS = Object.freeze({
  parameter: "parâmetro",
  local: "variável local",
  saved_register: "registrador salvo",
  temporary: "temporário"
});

export const callStackPackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.resource.call_stack",
    version: "1.0.0",
    label: "Pilha de chamadas",
    purpose: "Representar quadros de ativação, parâmetros, variáveis locais e continuações durante chamadas de função.",
    slots: Object.freeze(["content", "feedback"]),
    taskOperations: Object.freeze(["trace-call", "inspect-frame", "locate-local-variable", "explain-return"]),
    academic: academicProfile({
      domains: ["programação", "compiladores", "sistemas operacionais", "segurança de software"],
      knowledgeObjects: ["quadro de ativação", "pilha de chamadas", "parâmetro", "variável local", "continuação no chamador"],
      conventions: ["quadro ativo no topo", "chamada inicial na base", "função nomeada", "parâmetros e locais agrupados", "continuação explícita"],
      appropriateWhen: ["o encadeamento de chamadas e o conteúdo de cada quadro participam do raciocínio"],
      avoidWhen: ["endereços e segmentos do espaço de memória são o objeto", "a estrutura é uma pilha abstrata sem chamadas"],
      technologies: ["HTML semântico", "CSS Grid"],
      practiceModes: ["exposition", "gap", "typing", "selection"]
    }),
    responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.choice"]),
    limitations: Object.freeze(["Recursões profundas devem ser recortadas aos quadros relevantes."]),
    accessibility: "Os quadros são lidos do topo ativo até a base; campos têm nome, papel e valor."
  }),
  authoringContract: Object.freeze({
    intent: "Declare quadros na ordem da chamada inicial para a chamada ativa; o renderer apresenta a chamada ativa no topo e conserva a base embaixo.",
    required: Object.freeze(["frames"]),
    optional: Object.freeze(["prompt"]),
    fieldSemantics: Object.freeze({
      frames: "Quadros na ordem temporal da chamada inicial para a chamada atualmente em execução; o último item sempre ocupa o topo.",
      functionName: "Nome da função e argumentos relevantes que identificam a invocação representada.",
      continuation: "Ação que o chamador retomará quando este quadro concluir; no quadro inicial, descreve o encerramento.",
      fields: "Parâmetros, variáveis locais, registradores salvos ou temporários pertencentes somente ao quadro declarado."
    }),
    rules: Object.freeze(["Cada quadro identifica função, continuação e campos relevantes.", "Não use mapa de memória para simular chamadas.", "O último quadro declarado é o ativo."]),
    example: Object.freeze({
      prompt: "Observe o estado da pilha logo após fatorial(4) chamar fatorial(3).",
      frames: [
        { id: "main", functionName: "main", continuation: "encerrar o programa", fields: [{ id: "n", role: "local", name: "n", value: "4" }] },
        { id: "fact4", functionName: "fatorial(4)", continuation: "retomar main com o resultado", fields: [{ id: "n", role: "parameter", name: "n", value: "4" }, { id: "partial", role: "local", name: "parcial", value: "aguarda fatorial(3)" }] },
        { id: "fact3", functionName: "fatorial(3)", continuation: "retomar fatorial(4) e calcular 4 × resultado", fields: [{ id: "n", role: "parameter", name: "n", value: "3" }] }
      ]
    })
  }),
  schema: Object.freeze({ type: "object", additionalProperties: false, required: ["frames"], properties: {
    prompt: { type: "string" },
    frames: { type: "array", minItems: 1, maxItems: 12, items: { type: "object", additionalProperties: false, required: ["id", "functionName", "continuation", "fields"], properties: { id: { type: "string", minLength: 1 }, functionName: { type: "string", minLength: 1 }, continuation: { type: "string", minLength: 1 }, fields: { type: "array", maxItems: 10, items: { type: "object", additionalProperties: false, required: ["id", "role", "name", "value"], properties: { id: { type: "string", minLength: 1 }, role: { type: "string", enum: ["parameter", "local", "saved_register", "temporary"] }, name: { type: "string", minLength: 1 }, value: { type: "string" } } } } } } }
  } }),
  normalize(data) {
    return { ...(data?.prompt ? { prompt: text(data.prompt) } : {}), frames: (data?.frames || []).map((frame) => ({ id: text(frame?.id), functionName: text(frame?.functionName), continuation: text(frame?.continuation), fields: (frame?.fields || []).map((field) => ({ id: text(field?.id), role: text(field?.role), name: text(field?.name), value: String(field?.value ?? "") })) })) };
  },
  validate(data) {
    const errors = [];
    if (new Set(data.frames.map(({ id }) => id)).size !== data.frames.length) errors.push("Quadros precisam de ids únicos.");
    data.frames.forEach((frame) => { if (new Set(frame.fields.map(({ id }) => id)).size !== frame.fields.length) errors.push(`Campos de ${frame.id} precisam de ids únicos.`); });
    return errors;
  },
  render(data) {
    const frames = [...data.frames].reverse();
    return `<div class="runtime-block package-call-stack">${data.prompt ? renderPackageProse(data.prompt) : ""}<figure><figcaption>Topo: chamada em execução</figcaption><ol>${frames.map((frame, index) => `<li data-frame-id="${escapePackageAttribute(frame.id)}"${index === 0 ? ' class="is-active"' : ""}><header><strong>${renderPackageInline(frame.functionName)}</strong>${index === 0 ? "<small>em execução</small>" : "<small>aguarda retorno</small>"}</header><dl>${frame.fields.map((field) => `<div><dt><small>${renderPackageInline(FIELD_ROLE_LABELS[field.role] || field.role)}</small>${renderPackageInline(field.name)}</dt><dd><code>${renderPackageInline(field.value || "—")}</code></dd></div>`).join("")}<div class="is-continuation"><dt>ao concluir</dt><dd>${renderPackageInline(frame.continuation)}</dd></div></dl></li>`).join("")}</ol><p>Base: chamada inicial</p></figure></div>`;
  },
  accessibleText(data) {
    return `${data.prompt || "Pilha de chamadas."} ${[...data.frames].reverse().map((frame, index) => `${index === 0 ? "Quadro em execução" : "Quadro suspenso"} ${frame.functionName}: ${frame.fields.map((field) => `${field.name} vale ${field.value}`).join(", ")}; ao concluir, ${frame.continuation}`).join(". ")}.`;
  },
  editableTargets(data) {
    return [...(data.prompt ? [{ path: "prompt", label: "Editar orientação" }] : []), ...data.frames.flatMap((frame, frameIndex) => [{ path: `frames[${frameIndex}].functionName`, label: `Editar função ${frameIndex + 1}` }, { path: `frames[${frameIndex}].continuation`, label: `Editar continuação ${frameIndex + 1}` }, ...frame.fields.flatMap((_, fieldIndex) => [{ path: `frames[${frameIndex}].fields[${fieldIndex}].name`, label: `Editar campo ${frameIndex + 1}.${fieldIndex + 1}` }, { path: `frames[${frameIndex}].fields[${fieldIndex}].value`, label: `Editar valor ${frameIndex + 1}.${fieldIndex + 1}` }])])];
  },
  practiceTargets(data) {
    return data.frames.flatMap((frame, frameIndex) => [{ path: `frames[${frameIndex}].functionName`, label: `Lacuna na função ${frameIndex + 1}`, modes: ["gap", "typing"] }, { path: `frames[${frameIndex}].continuation`, label: `Lacuna na continuação ${frameIndex + 1}`, modes: ["gap", "typing"] }, ...frame.fields.flatMap((_, fieldIndex) => [{ path: `frames[${frameIndex}].fields[${fieldIndex}].name`, label: `Lacuna no campo ${frameIndex + 1}.${fieldIndex + 1}`, modes: ["gap", "typing"] }, { path: `frames[${frameIndex}].fields[${fieldIndex}].value`, label: `Lacuna no valor ${frameIndex + 1}.${fieldIndex + 1}`, modes: ["gap", "typing"] }])]);
  }
});
