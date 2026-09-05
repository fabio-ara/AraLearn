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

function projectFileTransport(inputSchema, field) {
  const schema = clone(inputSchema);
  const file = schema.properties?.[field];
  if (!file) throw new TypeError("A tarefa perdeu o parâmetro MCP de arquivo.");
  delete schema.properties[field];
  schema.properties[ACTION_FILE_FIELD] = {
    type: "array",
    minItems: 1,
    maxItems: 1,
    items: { type: "string" },
    description:
      `${file.description} Um único arquivo desta conversa. O ChatGPT preenche ` +
      "automaticamente esta referência temporária."
  };
  schema.required = (schema.required || []).map((name) => (
    name === field ? ACTION_FILE_FIELD : name
  ));
  return schema;
}

export function projectHumanAuthoringTaskForActions(task) {
  if (!task || typeof task !== "object" || Array.isArray(task) ||
      typeof task.name !== "string" || !task.inputSchema || !task.outputSchema) {
    throw new TypeError("Tarefa humana inválida para Actions.");
  }
  const files = task._meta?.["openai/fileParams"];
  if (files && (!Array.isArray(files) || files.length !== 1)) {
    throw new TypeError("A projeção recebe um único arquivo por tarefa.");
  }
  const inputSchema = files
    ? projectFileTransport(task.inputSchema, files[0])
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
