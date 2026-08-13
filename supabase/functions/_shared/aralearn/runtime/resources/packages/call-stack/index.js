import { academicProfile } from "../../sdk/academic.js";
import { escapePackageAttribute, renderPackageInline, renderPackageProse } from "../../sdk/html.js";

function text(value) {
  return String(value ?? "").trim();
}

export const callStackPackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.resource.call_stack",
    version: "1.0.0",
    label: "Pilha de chamadas",
    purpose: "Representar quadros de ativação, parâmetros, variáveis locais e endereço de retorno durante chamadas de função.",
    slots: Object.freeze(["content", "feedback"]),
    cognitiveOperations: Object.freeze(["trace-call", "inspect-frame", "locate-local-variable", "explain-return"]),
    academic: academicProfile({
      domains: ["programação", "compiladores", "sistemas operacionais", "segurança de software"],
      knowledgeObjects: ["quadro de ativação", "pilha de chamadas", "parâmetro", "variável local", "endereço de retorno"],
      conventions: ["quadro ativo no topo", "função nomeada", "parâmetros e locais agrupados", "retorno explícito"],
      appropriateWhen: ["o encadeamento de chamadas e o conteúdo de cada quadro participam do raciocínio"],
      avoidWhen: ["endereços e segmentos do espaço de memória são o objeto", "a estrutura é uma pilha abstrata sem chamadas"],
      technologies: ["HTML semântico", "CSS Grid"],
      practiceModes: ["exposition", "gap", "typing", "selection", "ordering"]
    }),
    responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.choice"]),
    limitations: Object.freeze(["Recursões profundas devem ser recortadas aos quadros relevantes."]),
    accessibility: "Os quadros são lidos do topo ativo até a base; campos têm nome, papel e valor."
  }),
  authoringContract: Object.freeze({
    intent: "Declare quadros na ordem do mais antigo para o ativo; o renderer inverte visualmente e mantém a semântica da pilha.",
    required: Object.freeze(["frames"]),
    optional: Object.freeze(["prompt"]),
    rules: Object.freeze(["Cada quadro identifica função, retorno e campos relevantes.", "Não use mapa de memória para simular chamadas.", "O último quadro declarado é o ativo."]),
    example: Object.freeze({
      prompt: "Observe os quadros durante a segunda chamada recursiva de fatorial(4).",
      frames: [
        { id: "main", functionName: "main", returnTo: "encerrar programa", fields: [{ id: "n", role: "local", name: "n", value: "4" }] },
        { id: "fact4", functionName: "fatorial(4)", returnTo: "main: resultado = …", fields: [{ id: "n", role: "parameter", name: "n", value: "4" }, { id: "partial", role: "local", name: "parcial", value: "aguardando" }] },
        { id: "fact3", functionName: "fatorial(3)", returnTo: "fatorial(4): 4 × …", fields: [{ id: "n", role: "parameter", name: "n", value: "3" }] }
      ]
    })
  }),
  schema: Object.freeze({ type: "object", additionalProperties: false, required: ["frames"], properties: {
    prompt: { type: "string" },
    frames: { type: "array", minItems: 1, maxItems: 12, items: { type: "object", additionalProperties: false, required: ["id", "functionName", "returnTo", "fields"], properties: { id: { type: "string", minLength: 1 }, functionName: { type: "string", minLength: 1 }, returnTo: { type: "string", minLength: 1 }, fields: { type: "array", maxItems: 10, items: { type: "object", additionalProperties: false, required: ["id", "role", "name", "value"], properties: { id: { type: "string", minLength: 1 }, role: { type: "string", enum: ["parameter", "local", "saved_register", "temporary"] }, name: { type: "string", minLength: 1 }, value: { type: "string" } } } } } } }
  } }),
  normalize(data) {
    return { ...(data?.prompt ? { prompt: text(data.prompt) } : {}), frames: (data?.frames || []).map((frame) => ({ id: text(frame?.id), functionName: text(frame?.functionName), returnTo: text(frame?.returnTo), fields: (frame?.fields || []).map((field) => ({ id: text(field?.id), role: text(field?.role), name: text(field?.name), value: String(field?.value ?? "") })) })) };
  },
  validate(data) {
    const errors = [];
    if (new Set(data.frames.map(({ id }) => id)).size !== data.frames.length) errors.push("Quadros precisam de ids únicos.");
    data.frames.forEach((frame) => { if (new Set(frame.fields.map(({ id }) => id)).size !== frame.fields.length) errors.push(`Campos de ${frame.id} precisam de ids únicos.`); });
    return errors;
  },
  render(data) {
    const frames = [...data.frames].reverse();
    return `<div class="runtime-block package-call-stack">${data.prompt ? renderPackageProse(data.prompt) : ""}<figure><figcaption>topo da pilha · quadro ativo</figcaption><ol>${frames.map((frame, index) => `<li data-frame-id="${escapePackageAttribute(frame.id)}"${index === 0 ? ' class="is-active"' : ""}><header><strong>${renderPackageInline(frame.functionName)}</strong>${index === 0 ? "<small>ativo</small>" : ""}</header><dl>${frame.fields.map((field) => `<div><dt><small>${renderPackageInline(field.role)}</small>${renderPackageInline(field.name)}</dt><dd><code>${renderPackageInline(field.value || "—")}</code></dd></div>`).join("")}<div class="is-return"><dt>retorno</dt><dd>${renderPackageInline(frame.returnTo)}</dd></div></dl></li>`).join("")}</ol><p>base da pilha</p></figure></div>`;
  },
  accessibleText(data) {
    return `${data.prompt || "Pilha de chamadas."} ${[...data.frames].reverse().map((frame, index) => `${index === 0 ? "Quadro ativo" : "Quadro"} ${frame.functionName}: ${frame.fields.map((field) => `${field.name} vale ${field.value}`).join(", ")}; retorna para ${frame.returnTo}`).join(". ")}.`;
  },
  editableTargets(data) {
    return [...(data.prompt ? [{ path: "prompt", label: "Editar orientação" }] : []), ...data.frames.flatMap((frame, frameIndex) => [{ path: `frames[${frameIndex}].functionName`, label: `Editar função ${frameIndex + 1}` }, { path: `frames[${frameIndex}].returnTo`, label: `Editar retorno ${frameIndex + 1}` }, ...frame.fields.flatMap((_, fieldIndex) => [{ path: `frames[${frameIndex}].fields[${fieldIndex}].name`, label: `Editar campo ${frameIndex + 1}.${fieldIndex + 1}` }, { path: `frames[${frameIndex}].fields[${fieldIndex}].value`, label: `Editar valor ${frameIndex + 1}.${fieldIndex + 1}` }])])];
  },
  practiceTargets(data) {
    return data.frames.flatMap((frame, frameIndex) => [{ path: `frames[${frameIndex}].functionName`, label: `Lacuna na função ${frameIndex + 1}`, modes: ["gap", "typing"] }, { path: `frames[${frameIndex}].returnTo`, label: `Lacuna no retorno ${frameIndex + 1}`, modes: ["gap", "typing"] }, ...frame.fields.flatMap((_, fieldIndex) => [{ path: `frames[${frameIndex}].fields[${fieldIndex}].name`, label: `Lacuna no campo ${frameIndex + 1}.${fieldIndex + 1}`, modes: ["gap", "typing"] }, { path: `frames[${frameIndex}].fields[${fieldIndex}].value`, label: `Lacuna no valor ${frameIndex + 1}.${fieldIndex + 1}`, modes: ["gap", "typing"] }])]);
  }
});
