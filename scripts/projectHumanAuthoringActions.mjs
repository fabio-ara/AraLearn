const ACTION_FILE_FIELD = "openaiFileIdRefs";

function clone(value) {
  return structuredClone(value);
}

function actionSchema(value) {
  if (Array.isArray(value)) return value.map(actionSchema);
  if (!value || typeof value !== "object") return value;
  const projected = Object.fromEntries(Object.entries(value).map(([key, entry]) => (
    [key, actionSchema(entry)]
  )));
  if (Object.hasOwn(projected, "const")) {
    projected.enum = [projected.const];
    delete projected.const;
  }
  return projected;
}

function projectPdfTransport(inputSchema) {
  const schema = clone(inputSchema);
  const pdf = schema.properties?.pdf;
  if (!pdf) throw new TypeError("A tarefa de PDF perdeu o parâmetro MCP pdf.");
  delete schema.properties.pdf;
  schema.properties[ACTION_FILE_FIELD] = {
    type: "array",
    minItems: 1,
    maxItems: 1,
    items: { type: "string" },
    description:
      "O único PDF anexado pela pessoa nesta conversa. O ChatGPT preenche " +
      "automaticamente esta referência temporária."
  };
  schema.required = (schema.required || []).map((field) => (
    field === "pdf" ? ACTION_FILE_FIELD : field
  ));
  return schema;
}

export function projectHumanAuthoringTaskForActions(task) {
  if (!task || typeof task !== "object" || Array.isArray(task) ||
      typeof task.name !== "string" || !task.inputSchema || !task.outputSchema) {
    throw new TypeError("Tarefa humana inválida para Actions.");
  }
  const inputSchema = task.name === "incorporar_pdf_como_fonte"
    ? projectPdfTransport(task.inputSchema)
    : clone(task.inputSchema);
  return Object.freeze({
    name: task.name,
    title: task.title,
    description: task.description,
    inputSchema: actionSchema(inputSchema),
    outputSchema: actionSchema(task.outputSchema),
    annotations: clone(task.annotations)
  });
}

export function projectHumanAuthoringTasksForActions(tasks) {
  if (!Array.isArray(tasks)) throw new TypeError("O catálogo humano precisa ser uma lista.");
  const projected = tasks.map(projectHumanAuthoringTaskForActions);
  if (new Set(projected.map(({ name }) => name)).size !== projected.length) {
    throw new TypeError("A projeção de Actions repete uma tarefa humana.");
  }
  return Object.freeze(projected);
}

export const HUMAN_ACTION_FILE_FIELD = ACTION_FILE_FIELD;
