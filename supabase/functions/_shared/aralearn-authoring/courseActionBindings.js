import { courseHumanTaskDefinition } from "./courseHumanTasks.js";
import { AuthoringApiError } from "./errors.js";

// Actions' editor accepts at most 30 operations. This binds transport routes
// only; task identity, schema, scopes, handlers and receipts remain canonical.
export const COURSE_ACTION_TASK_GROUPS = Object.freeze({
  acesso_do_curso: Object.freeze(["consultar_acesso", "definir_visibilidade", "alterar_acesso", "definir_acesso_arquivos", "definir_politica_revisao"]),
  estrutura_curricular: Object.freeze(["alterar_curso", "excluir_curso", "salvar_ramo_curricular", "mover_ramo_curricular", "duplicar_ramo_curricular", "remover_ramo_curricular", "reordenar_unidades"]),
  desenho_instrucional: Object.freeze(["consultar_repertorio_instrucional", "manter_unidade_analise", "manter_requisito_evidencia", "vincular_repertorio_instrucional", "registrar_aplicacoes_instrucionais", "aplicar_configuracao_instrucional", "ajustar_orientacao", "ajustar_componentes"]),
  preferencias_de_autoria: Object.freeze(["consultar_preferencias_autoria", "salvar_preferencias_autoria"]),
  perfis_de_autoria: Object.freeze(["consultar_perfis", "salvar_perfil", "excluir_perfil", "prever_aplicacao_perfil", "aplicar_perfil"]),
  observacoes_autorais: Object.freeze(["consultar_observacoes", "registrar_observacao", "editar_observacao"])
});
const GROUP_DETAILS = Object.freeze({
  acesso_do_curso: ["Acesso do curso", "Consulte ou altere visibilidade, pessoas, arquivos e política de revisão do curso. Escolha a tarefa e envie seus argumentos correspondentes."],
  estrutura_curricular: ["Estrutura curricular", "Renomeie, reorganize, copie ou remova o curso e seus ramos pelas tarefas autorizadas. Confirmações e retomadas pertencem à tarefa escolhida."],
  desenho_instrucional: ["Desenho instrucional", "Consulte e mantenha repertório, vínculos, aplicações, configuração, orientação e componentes no recorte escolhido. Envie os argumentos da tarefa indicada."],
  preferencias_de_autoria: ["Preferências de autoria", "Consulte ou salve as preferências pessoais de processo. Elas não alteram automaticamente o conteúdo ou as decisões de um curso."],
  perfis_de_autoria: ["Perfis de autoria", "Consulte, salve ou exclua perfis e prepare ou aplique um perfil ao curso. Escolha a tarefa e seus argumentos específicos."],
  observacoes_autorais: ["Observações autorais", "Consulte, acrescente ou edite observações identificadas e versionadas. Leitura e edição não consomem a fila nem declaram revisão humana."]
});
const GROUP_BY_TASK = new Map(Object.entries(COURSE_ACTION_TASK_GROUPS).flatMap(([group, names]) => names.map(name => [name, group])));
if (GROUP_BY_TASK.size !== Object.values(COURSE_ACTION_TASK_GROUPS).flat().length) throw new TypeError("Uma tarefa foi repetida nos grupos de Actions.");
const object = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const invalidBinding = () => new AuthoringApiError(422, "invalid_action_task_binding", "Escolha uma tarefa deste grupo e envie somente seus argumentos correspondentes.");
const unknownOperation = () => new AuthoringApiError(404, "unknown_human_task", "Operação de autoria inexistente.");

export function courseActionOperationName(taskName) {
  if (!courseHumanTaskDefinition(taskName)) throw unknownOperation();
  return GROUP_BY_TASK.get(taskName) || taskName;
}

export function encodeCourseActionTaskRequest(taskName, taskArguments) {
  const operationName = courseActionOperationName(taskName);
  if (!object(taskArguments)) throw invalidBinding();
  return { operationName, arguments: operationName === taskName ? structuredClone(taskArguments)
    : { tarefa: taskName, argumentos: structuredClone(taskArguments) } };
}

export function isCourseActionOperation(operationName) {
  return Object.hasOwn(COURSE_ACTION_TASK_GROUPS, operationName) ||
    Boolean(courseHumanTaskDefinition(operationName) && !GROUP_BY_TASK.has(operationName));
}

export function decodeCourseActionTaskRequest(operationName, payload) {
  if (!isCourseActionOperation(operationName)) throw unknownOperation();
  if (!Object.hasOwn(COURSE_ACTION_TASK_GROUPS, operationName)) return { taskName: operationName, arguments: payload };
  if (!object(payload) || Object.keys(payload).length !== 2 || !Object.hasOwn(payload, "tarefa") ||
      !Object.hasOwn(payload, "argumentos") || !COURSE_ACTION_TASK_GROUPS[operationName].includes(payload.tarefa) ||
      !object(payload.argumentos)) throw invalidBinding();
  // The existing task handler validates the complete canonical argument
  // contract. Check envelope/pair membership before invoking any handler.
  const schema = courseHumanTaskDefinition(payload.tarefa).inputSchema;
  if (Object.keys(payload.argumentos).some(name => !Object.hasOwn(schema.properties, name)) ||
      schema.required?.some(name => !Object.hasOwn(payload.argumentos, name))) throw invalidBinding();
  return { taskName: payload.tarefa, arguments: payload.argumentos };
}

export function courseActionOperationDefinitions(tasks) {
  if (!Array.isArray(tasks) || new Set(tasks.map(task => task.name)).size !== tasks.length) throw new TypeError("Catálogo de Actions inválido.");
  const byName = new Map(tasks.map(task => [task.name, task]));
  for (const name of GROUP_BY_TASK.keys()) if (!byName.has(name)) throw new TypeError("Uma tarefa do grupo não existe no catálogo de Actions.");
  const emitted = new Set();
  return tasks.flatMap(task => {
    const group = GROUP_BY_TASK.get(task.name);
    if (!group) return [structuredClone(task)];
    if (emitted.has(group)) return [];
    emitted.add(group);
    const members = COURSE_ACTION_TASK_GROUPS[group].map(name => byName.get(name));
    if (members.some(member => member._meta?.["openai/fileParams"] || member.inputSchema.properties?.openaiFileIdRefs)) {
      throw new TypeError("Uploads de Actions precisam conservar operação direta e campo de arquivo na raiz.");
    }
    return [{ name: group, title: GROUP_DETAILS[group][0], description: GROUP_DETAILS[group][1],
      annotations: { readOnlyHint: members.every(member => member.annotations?.readOnlyHint === true) },
      outputSchema: structuredClone(members[0].outputSchema),
      inputSchema: { type: "object", additionalProperties: false, required: ["tarefa", "argumentos"],
        properties: { tarefa: { type: "string", enum: [...COURSE_ACTION_TASK_GROUPS[group]] }, argumentos: { type: "object" } },
        oneOf: members.map(member => ({ type: "object", description: member.description,
          properties: { tarefa: { type: "string", enum: [member.name] }, argumentos: structuredClone(member.inputSchema) } }))
      }
    }];
  });
}
