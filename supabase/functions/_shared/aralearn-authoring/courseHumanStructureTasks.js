import { AuthoringApiError } from "./errors.js";
import { executeTrustedCourseWrite, resolveHumanCourseContext } from "./courseHumanTaskExecutor.js";
import { mutateCourseStructure, normalizeCourseStructureCommand, reorderCourseStudyUnits } from "./courseStructureMutation.js";
import { normalizeCurricularMapSlice } from "../aralearn/runtime/domain/courseCurricularMapSlices.js";
import { sha256Hex } from "./security.js";

const fail = message => { throw new AuthoringApiError(422, "invalid_human_structure_operation", message); };
const ref = { type: ["integer", "string"], minimum: 1, maximum: 1000000, minLength: 1, maxLength: 300 };
const course = { type: "string", minLength: 1, maxLength: 300, description: "Nome do curso." };
const path = { type: "object", additionalProperties: false, minProperties: 1,
  properties: { modulo: ref, licao: ref, microssequencia: ref }, description: "Título ou posição humana; acrescente os pais para distinguir títulos repetidos." };
const refs = { type: "array", maxItems: 64, uniqueItems: true, items: ref };
const continuation = { type: "string", minLength: 1, maxLength: 480000, description: "Referência original devolvida para retomar a mesma intenção; não edite seu conteúdo." };
const kindByHuman = { modulo: "module", licao: "lesson", microssequencia: "microsequence" };
const definition = (name, title, description, required, properties, destructive = false) => ({ name, title, description,
  inputSchema: { type: "object", additionalProperties: false, required, properties: { curso: course, ...properties, retomada: continuation } },
  options: { readOnly: false, destructive } });

export const COURSE_HUMAN_STRUCTURE_TASK_DEFINITIONS = [
  definition("alterar_curso", "Alterar título ou objetivo do curso", "Altera somente os metadados indicados, preservando conteúdo, fontes e acessos.", ["curso"], {
    titulo: { type: "string", minLength: 1, maxLength: 300 }, objetivo: { type: "string", minLength: 1, maxLength: 2000 }
  }),
  definition("excluir_curso", "Excluir curso próprio", "Prepara uma referência inequívoca. Após a decisão de excluir, use a confirmação original; a limpeza de arquivos segue o ciclo de vida existente.", ["curso"], {
    confirmacao: continuation
  }, true),
  definition("salvar_ramo_curricular", "Incluir ou editar ramo curricular", "Constrói mapas extensos por recortes: módulo, lição e microssequência, após salvar contexto e escopo. Alvo ausente inclui; destino identifica o pai. Dependências, cobertura e fontes usam referências humanas. Campos omitidos e descendentes são preservados.", ["curso", "tipo"], {
    tipo: { type: "string", enum: Object.keys(kindByHuman) }, alvo: path, destino: path,
    titulo: { type: "string", minLength: 1, maxLength: 300 }, objetivo: { type: "string", minLength: 1, maxLength: 2000 },
    posicao: { type: "integer", minimum: 1, maximum: 64 }, dependencias: refs, cobertura: refs,
    explicacao: { type: "object", additionalProperties: false, minProperties: 1, properties: {
      proposito: { type: "string", minLength: 1, maxLength: 2000 }, pressupostos: { type: "array", maxItems: 64, items: { type: "string", minLength: 1, maxLength: 2000 } },
      relacoes: { type: "array", maxItems: 64, items: { type: "string", minLength: 1, maxLength: 2000 } }, fontes: refs
    } }
  }),
  definition("mover_ramo_curricular", "Mover ou reordenar ramo", "Move o ramo completo para o pai ou posição indicados. Dependências continuam válidas; unidades, fontes e registros aplicados acompanham o mesmo objeto.", ["curso", "alvo"], {
    alvo: path, destino: path, posicao: { type: "integer", minimum: 1, maximum: 64 }
  }),
  definition("duplicar_ramo_curricular", "Duplicar ramo completo", "Duplica conteúdo, descendentes, parâmetros e vínculos úteis no mesmo curso. Declarações humanas, observações, progresso e lotes de produção permanecem na origem. Reutilize a retomada se a resposta se perder.", ["curso", "alvo", "titulo"], {
    alvo: path, destino: path, titulo: { type: "string", minLength: 1, maxLength: 300 }, posicao: { type: "integer", minimum: 1, maximum: 64 }
  }),
  definition("remover_ramo_curricular", "Remover ramo explícito", "Remove o ramo e seus descendentes; fontes compartilhadas permanecem no acervo. Dependência sobrevivente impede remoção até ajuste explícito.", ["curso", "alvo"], { alvo: path }, true),
  definition("reordenar_unidades", "Reordenar unidades existentes", "Ordena todas as unidades da microssequência indicada, preservando identidades, textos, fontes e configuração aplicada. A lista completa não remove unidades por omissão.", ["curso", "alvo", "unidades"], {
    alvo: path, unidades: { type: "array", minItems: 1, uniqueItems: true, items: ref }
  })
];

const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const text = (value, maximum, label) => {
  if (typeof value !== "string" || value !== value.trim() || !value || value.length > maximum || /\p{Cc}/u.test(value)) fail(`Informe ${label} válido.`);
  return value;
};
function checkReference(value) {
  if (Number.isSafeInteger(value) && value >= 1 && value <= 1000000) return;
  text(value, 300, "uma referência humana");
}
function checkPath(value) {
  if (!plain(value) || !Object.keys(value).length || Object.keys(value).some(key => !Object.hasOwn(kindByHuman, key))) fail("Indique o ramo por módulo, lição ou microssequência.");
  Object.values(value).forEach(checkReference);
  return value.microssequencia !== undefined ? "microsequence" : value.licao !== undefined ? "lesson" : "module";
}
const normalized = value => String(value).normalize("NFD").replace(/[\u0300-\u036f]/gu, "").toLocaleLowerCase("pt-BR").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function select(items, reference, label, title = item => item.title) {
  checkReference(reference);
  const exact = items.filter(item => Number.isSafeInteger(reference) ? item.position + 1 === reference : normalized(title(item)) === normalized(reference));
  const matches = exact.length ? exact : items.filter(item => !Number.isSafeInteger(reference) && normalized(title(item)).includes(normalized(reference)));
  if (matches.length !== 1) throw new AuthoringApiError(matches.length ? 409 : 404,
    matches.length ? "ambiguous_human_reference" : "human_reference_not_found", `${label} ${matches.length ? "corresponde a mais de um objeto; especifique o ramo" : "não foi localizado"}.`);
  return matches[0];
}
function locate(map, target) {
  const kind = checkPath(target);
  let modules = map.modules;
  if (target.modulo !== undefined) modules = [select(modules, target.modulo, "O módulo")];
  if (kind === "module") return { kind, item: modules[0] };
  let lessons = modules.flatMap(item => item.lessons);
  if (target.licao !== undefined) lessons = [select(lessons, target.licao, "A lição")];
  if (kind === "lesson") return { kind, item: lessons[0] };
  return { kind, item: select(lessons.flatMap(item => item.microsequences), target.microssequencia, "A microssequência") };
}
function validateArgs(name, args) {
  const definition = COURSE_HUMAN_STRUCTURE_TASK_DEFINITIONS.find(item => item.name === name);
  if (!plain(args) || Object.keys(args).some(key => !Object.hasOwn(definition.inputSchema.properties, key)) || definition.inputSchema.required.some(key => args[key] === undefined)) fail("Os campos da operação estrutural são inválidos.");
  text(args.curso, 300, "o nome do curso");
  if (args.alvo !== undefined) checkPath(args.alvo);
  if (args.destino !== undefined) checkPath(args.destino);
  if (args.titulo !== undefined) text(args.titulo, 300, "o título");
  if (args.objetivo !== undefined) text(args.objetivo, 2000, "o objetivo");
  if (args.posicao !== undefined && (!Number.isSafeInteger(args.posicao) || args.posicao < 1 || args.posicao > 64)) fail("A posição vai de 1 a 64.");
  if (name === "alterar_curso" && args.titulo === undefined && args.objetivo === undefined) fail("Indique título ou objetivo para alterar.");
  if (name === "mover_ramo_curricular" && args.destino === undefined && args.posicao === undefined) fail("Indique destino ou posição para mover.");
  if (name === "salvar_ramo_curricular" && !Object.hasOwn(kindByHuman, args.tipo)) fail("Indique o tipo do ramo.");
  if (name === "reordenar_unidades" && (checkPath(args.alvo) !== "microsequence" || !Array.isArray(args.unidades) || !args.unidades.length)) fail("Indique a microssequência e a ordem completa de suas unidades.");
}
const canonical = value => JSON.stringify(value, function (_key, item) {
  return plain(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item;
});
function encode(value) {
  return btoa(Array.from(new TextEncoder().encode(JSON.stringify(value)), byte => String.fromCharCode(byte)).join("")).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}
function intent(args) { return Object.fromEntries(Object.entries(args).filter(([key]) => !["retomada", "confirmacao"].includes(key))); }
function validSavedRequest(name, request, args) {
  const fields = name === "alterar_curso" ? ["courseId", "expectedRevision", "courseMetadata", "requestId"]
    : name === "excluir_curso" ? ["courseId", "operation", "confirmed", "requestId"]
      : name === "reordenar_unidades" ? ["courseId", "expectedRevision", "microsequenceId", "studyUnitIds", "requestId"]
      : ["courseId", name === "salvar_ramo_curricular" ? "expectedCourseRevision" : "expectedRevision", "expectedPlanVersion", "command", "requestId"];
  if (Object.keys(request).length !== fields.length || fields.some(key => !Object.hasOwn(request, key)) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(request.courseId)) return false;
  for (const key of ["expectedRevision", "expectedCourseRevision", "expectedPlanVersion"]) {
    if (Object.hasOwn(request, key) && (!Number.isSafeInteger(request[key]) || request[key] < 1)) return false;
  }
  if (name === "excluir_curso") return request.operation === "delete_owned_course" && request.confirmed === true;
  if (name === "alterar_curso") return plain(request.courseMetadata) && Object.keys(request.courseMetadata).sort().join(",") === "objective,title" &&
    (args.titulo === undefined || args.titulo === request.courseMetadata.title) && (args.objetivo === undefined || args.objetivo === request.courseMetadata.objective);
  if (name === "reordenar_unidades") return typeof request.microsequenceId === "string" && Array.isArray(request.studyUnitIds) && request.studyUnitIds.length === args.unidades.length;
  if (name === "salvar_ramo_curricular") return normalizeCurricularMapSlice(request.command).type === `save_${kindByHuman[args.tipo]}`;
  const command = normalizeCourseStructureCommand(request.command);
  return command.operation === (name === "mover_ramo_curricular" ? "move" : name === "duplicar_ramo_curricular" ? "duplicate" : "remove") &&
    command.kind === checkPath(args.alvo) && command.title === (args.titulo ?? null) && command.position === (args.posicao === undefined ? null : args.posicao - 1);
}
async function reference(name, principal, args, request) {
  const token = encode({ actor: principal.actorId, name, intent: await sha256Hex(canonical(intent(args))), request });
  if (token.length > 480000 || new TextEncoder().encode(JSON.stringify({ ...intent(args), retomada: token })).length > 512 * 1024) {
    fail("O recorte e sua retomada excedem o transporte. Separe decisões independentes em recortes coerentes antes de salvar; nenhum conteúdo foi reduzido.");
  }
  return token;
}
async function open(value, name, principal, args) {
  try {
    if (typeof value !== "string" || value.length > 480000 || !/^[A-Za-z0-9_-]+$/u.test(value)) throw Error();
    const item = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), character => character.charCodeAt(0))));
    if (!plain(item) || Object.keys(item).sort().join(",") !== "actor,intent,name,request" || item.actor !== principal.actorId || item.name !== name ||
        item.intent !== await sha256Hex(canonical(intent(args))) || !plain(item.request) || typeof item.request.requestId !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(item.request.requestId) || !validSavedRequest(name, item.request, args)) throw Error();
    return item.request;
  } catch { fail("A retomada não corresponde à conta e à intenção. Reutilize a referência original sem editá-la."); }
}
function link(adapter, courseId) { return adapter.publicAppUrl ? `${String(adapter.publicAppUrl).replace(/\/+$/u, "")}/#/authoring/courses/${encodeURIComponent(courseId)}?section=planning` : null; }
async function loadMap(adapter, principal, args, deadlineAt) {
  const target = args.alvo ?? args.destino ?? {};
  const resolved = await resolveHumanCourseContext({ adapter, principal, course: args.curso,
    module: target.modulo ?? null, lesson: target.licao ?? null, microsequence: target.microssequencia ?? null, deadlineAt });
  const read = await adapter.getCourseCurricularMap({ principal, courseId: resolved.course.id, deadlineAt });
  if (read.courseRevision !== resolved.course.revision) throw new AuthoringApiError(409, "stale_course_state", "O curso mudou durante a leitura; releia antes de alterar.");
  return { resolved, read };
}
async function resolvedReferences(values, available, label, getTitle) {
  if (!Array.isArray(values) || values.length > 64 || new Set(values).size !== values.length) fail(`A lista de ${label} é inválida.`);
  const result = values.map(reference => select(available, reference, label, getTitle));
  if (new Set(result).size !== result.length) fail(`A lista de ${label} repete o mesmo objeto.`);
  return result;
}
async function sliceFor(state, args, context, dependencies) {
  const kind = kindByHuman[args.tipo], { map } = state.read;
  const selected = args.alvo ? locate(map, args.alvo) : null;
  if (selected && selected.kind !== kind) fail("O tipo não corresponde ao alvo.");
  const command = { type: `save_${kind}`, [`${kind}Id`]: selected?.item[`${kind}Id`] ?? await context.newId(`curricular-${kind}`) };
  for (const [human, field] of [["titulo", "title"], ["objetivo", "objective"]]) if (args[human] !== undefined) command[field] = args[human];
  if (!selected && (!command.title || !command.objective)) fail("Um novo ramo precisa de título e objetivo.");
  if (args.posicao !== undefined) command.position = args.posicao - 1;
  if (args.destino !== undefined) {
    if (selected) fail("Para mudar o pai de um ramo existente, use mover ramo; a edição preserva seus descendentes.");
    const parent = locate(map, args.destino), expected = kind === "lesson" ? "module" : kind === "microsequence" ? "lesson" : null;
    if (parent.kind !== expected) fail("O destino não é o pai necessário para esse tipo de ramo.");
    command[`${expected}Id`] = parent.item[`${expected}Id`];
  } else if (!selected && kind !== "module") fail("Indique o destino do novo ramo.");
  if (kind !== "microsequence" && ["dependencias", "cobertura", "explicacao"].some(key => args[key] !== undefined)) fail("Dependências, cobertura e plano de Explicação pertencem à microssequência.");
  if (args.dependencias !== undefined) command.dependencyMicrosequenceIds = (await resolvedReferences(args.dependencias,
    map.modules.flatMap(module => module.lessons.flatMap(lesson => lesson.microsequences)), "dependências", item => item.title)).map(item => item.microsequenceId);
  if (args.cobertura !== undefined) command.scopeItemIds = (await resolvedReferences(args.cobertura, map.scopeItems, "cobertura", item => item.statement)).map(item => item.id);
  if (args.explicacao !== undefined) {
    if (!plain(args.explicacao) || !Object.keys(args.explicacao).length || Object.keys(args.explicacao).some(key => !["proposito", "pressupostos", "relacoes", "fontes"].includes(key))) fail("O plano de Explicação é inválido.");
    command.explanationPlan = structuredClone(selected?.item.explanationPlan ?? { purpose: command.objective, prerequisites: [], relations: [], sourceIds: [] });
    for (const [human, field] of [["proposito", "purpose"], ["pressupostos", "prerequisites"], ["relacoes", "relations"]]) {
      if (args.explicacao[human] !== undefined) command.explanationPlan[field] = args.explicacao[human];
    }
    if (args.explicacao.fontes !== undefined) {
      if (!Array.isArray(args.explicacao.fontes) || args.explicacao.fontes.length > 64) fail("As fontes são uma lista de referências humanas.");
      command.explanationPlan.sourceIds = [];
      for (const source of args.explicacao.fontes) {
        checkReference(source);
        const resolved = await resolveHumanCourseContext({ ...dependencies, course: args.curso, source });
        if (resolved.course.id !== state.read.courseId || resolved.course.revision !== state.read.courseRevision) throw new AuthoringApiError(409, "stale_course_state", "O acervo mudou durante a seleção das fontes.");
        command.explanationPlan.sourceIds.push(resolved.source.sourceId);
      }
    }
  }
  try { return normalizeCurricularMapSlice(command); } catch (error) { fail(error.message); }
}
async function unitOrder(state, args, { adapter, principal, deadlineAt }) {
  const target = locate(state.read.map, args.alvo);
  const items = [], seen = new Set();
  let cursorStudyUnitId = null;
  for (;;) {
    if (seen.has(cursorStudyUnitId)) throw new AuthoringApiError(503, "course_service_unavailable", "A paginação repetiu uma posição; a ordem não foi alterada.");
    seen.add(cursorStudyUnitId);
    const page = await adapter.listCourseStudyUnits({ principal, courseId: state.read.courseId, expectedRevision: state.read.courseRevision,
      scopeKind: "didactic_microsequence", scopeId: target.item.microsequenceId, cursorStudyUnitId, direction: "forward", limit: 24,
      maxBytes: 512 * 1024, inspectionVersion: 2, deadlineAt });
    if (!plain(page) || !Array.isArray(page.items)) throw new AuthoringApiError(503, "course_service_unavailable", "A leitura das unidades é inválida.");
    for (const item of page.items) items.push({ ...item.studyUnit, position: items.length });
    if (page.hasMore !== true) break;
    cursorStudyUnitId = page.nextCursor?.studyUnitId;
    if (typeof cursorStudyUnitId !== "string" || seen.size >= 100) throw new AuthoringApiError(503, "course_service_unavailable", "A leitura completa das unidades ainda não foi concluída.");
  }
  const selected = args.unidades.map(ref => select(items, ref, "A unidade"));
  if (selected.length !== items.length || new Set(selected).size !== items.length) fail("Informe uma vez cada unidade da microssequência; omissão não remove conteúdo.");
  return { courseId: state.read.courseId, expectedRevision: state.read.courseRevision, microsequenceId: target.item.microsequenceId, studyUnitIds: selected.map(item => item.id) };
}
async function perform(name, { adapter, principal, args, deadlineAt }) {
  validateArgs(name, args);
  const resumed = args.retomada ? await open(args.retomada, name, principal, args) : null;
  let prepared = resumed;
  let continuationToken = args.retomada ?? null;
  const result = await executeTrustedCourseWrite({ operation: name, maxCasRetries: 0,
    ...(resumed ? { requestIdFactory: () => resumed.requestId } : {}),
    load: async recovery => {
      if (recovery?.recovery || resumed) {
        const original = recovery?.request ?? resumed;
        await adapter.getCourse({ principal, courseId: original.courseId, includeOutline: false, deadlineAt });
        return null;
      }
      if (name === "alterar_curso") {
        const resolved = await resolveHumanCourseContext({ adapter, principal, course: args.curso, deadlineAt });
        const current = await adapter.getCourse({ principal, courseId: resolved.course.id, includeOutline: false, deadlineAt });
        return { courseId: resolved.course.id, expectedRevision: current.revision ?? current.courseRevision,
          courseMetadata: { title: args.titulo ?? current.title, objective: args.objetivo ?? current.goal ?? current.objective } };
      }
      return loadMap(adapter, principal, args, deadlineAt);
    },
    build: async (state, context) => {
      if (resumed) return Object.fromEntries(Object.entries(resumed).filter(([key]) => key !== "requestId"));
      if (name === "alterar_curso") return state;
      if (name === "reordenar_unidades") return unitOrder(state, args, { adapter, principal, deadlineAt });
      if (name === "salvar_ramo_curricular") return { courseId: state.read.courseId, expectedCourseRevision: state.read.courseRevision,
        expectedPlanVersion: state.read.planVersion, command: await sliceFor(state, args, context, { adapter, principal, deadlineAt }) };
      const target = locate(state.read.map, args.alvo);
      const destination = args.destino ? locate(state.read.map, args.destino) : null;
      const parentKind = target.kind === "lesson" ? "module" : target.kind === "microsequence" ? "lesson" : null;
      if (destination && destination.kind !== parentKind) fail("O destino precisa identificar o pai compatível com o ramo.");
      return { courseId: state.read.courseId, expectedRevision: state.read.courseRevision, expectedPlanVersion: state.read.planVersion,
        command: normalizeCourseStructureCommand({ operation: name === "mover_ramo_curricular" ? "move" : name === "duplicar_ramo_curricular" ? "duplicate" : "remove",
          kind: target.kind, targetId: target.item[`${target.kind}Id`], parentId: destination?.item[`${parentKind}Id`] ?? null,
          position: args.posicao === undefined ? null : args.posicao - 1, title: args.titulo ?? null }) };
    },
    commit: async request => {
      prepared = request;
      continuationToken = await reference(name, principal, args, request);
      if (name === "alterar_curso") return adapter.commitCourseComposition({ principal, ...request, deadlineAt });
      if (name === "salvar_ramo_curricular") return adapter.saveCourseCurricularMapSlice({ principal, ...request, deadlineAt });
      if (name === "reordenar_unidades") return reorderCourseStudyUnits(adapter, { principal, ...request, deadlineAt });
      return mutateCourseStructure(adapter, { principal, ...request, deadlineAt });
    }
  }).catch(error => {
    if (prepared && error?.code === "course_write_uncertain") {
      error.details = { ...error.details, retomada: continuationToken };
    }
    throw error;
  });
  return { result: result.idempotent ? "Recuperei a mesma alteração confirmada." : name === "alterar_curso" ? "Atualizei os metadados indicados do curso."
    : name === "salvar_ramo_curricular" ? "Salvei o recorte curricular. A aprovação do mapa depende da inspeção da versão salva."
      : name === "remover_ramo_curricular" ? "Removi o ramo indicado e seus descendentes." : name === "duplicar_ramo_curricular" ? "Dupliquei o ramo completo."
        : name === "reordenar_unidades" ? "Salvei a ordem das unidades, preservando o conteúdo e os registros aplicados." : "Atualizei a posição do ramo completo.",
    deepLink: result.deepLink ?? link(adapter, prepared.courseId), nextDecision: null,
    context: { retomada: continuationToken,
      ...(result.affectedEntityCount === undefined ? {} : { objetosAfetados: result.affectedEntityCount }) } };
}

async function deleteCourse({ adapter, principal, args, deadlineAt }) {
  const name = "excluir_curso";
  validateArgs(name, args);
  if (args.retomada && args.confirmacao && args.retomada !== args.confirmacao) fail("A exclusão recebeu duas referências diferentes.");
  const token = args.retomada ?? args.confirmacao;
  if (!token) {
    const resolved = await resolveHumanCourseContext({ adapter, principal, course: args.curso, deadlineAt });
    const request = { courseId: resolved.course.id, operation: "delete_owned_course", confirmed: true, requestId: crypto.randomUUID() };
    return { result: "Identifiquei o curso próprio para exclusão e limpeza dos arquivos que deixarem de ser usados.", deepLink: resolved.course.deepLink,
      nextDecision: "Após a decisão de excluir este curso, repita com a confirmação original. Ela conserva o alvo mesmo se um título for reutilizado.",
      context: { curso: resolved.course.title, confirmacao: await reference(name, principal, args, request) } };
  }
  const request = await open(token, name, principal, args);
  if (Object.keys(request).sort().join(",") !== "confirmed,courseId,operation,requestId" || request.operation !== "delete_owned_course" || request.confirmed !== true) fail("A confirmação de exclusão é inválida.");
  const result = await adapter.maintainCourse({ principal, ...request, deadlineAt });
  return { result: result.status === "already_absent" ? "Confirmei a exclusão do mesmo curso." : "Excluí o curso e concluí a limpeza pertinente dos arquivos.",
    deepLink: null, nextDecision: null, context: { confirmacao: token } };
}

export const COURSE_HUMAN_STRUCTURE_TASK_HANDLERS = Object.fromEntries(COURSE_HUMAN_STRUCTURE_TASK_DEFINITIONS.map(({ name }) =>
  [name, name === "excluir_curso" ? deleteCourse : input => perform(name, input)]));
