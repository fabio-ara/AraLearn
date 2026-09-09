import { AuthoringApiError } from "./errors.js";
import { sha256Hex } from "./security.js";
import { executeTrustedCourseWrite, resolveHumanCourseContext } from "./courseHumanTaskExecutor.js";
import { EXPLANATION_FORMS, PRACTICE_VARIATION_DIMENSIONS, COURSE_DESIGN_PARAMETER_DEFINITIONS,
  normalizeCourseDesignParameterValue, normalizeCourseDesignCommand, normalizeCourseDesignChange }
  from "../aralearn/runtime/domain/courseDesignParameters.js";

const reference = { type: ["string", "integer"], minLength: 1, maxLength: 300, minimum: 1 };
const text = maxLength => ({ type: "string", minLength: 1, maxLength });
const object = (properties, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, properties, required });
const list = (items, maxItems = 256) => ({ type: "array", items, maxItems, uniqueItems: true });
const scopeFields = { curso: text(300), modulo: reference, licao: reference, microssequencia: reference, unidade: reference };
const scope = ({ studyUnits, microsequence, lesson, module, course }) => studyUnits?.length === 1
  ? { kind: "study_unit", ref: studyUnits[0].studyUnit.id }
  : microsequence ? { kind: "didactic_microsequence", ref: microsequence.id }
  : lesson ? { kind: "lesson", ref: lesson.id } : module ? { kind: "module", ref: module.id }
  : { kind: "course", ref: course.id };
const task = (name, title, description, properties, required, readOnly = false) => ({ name, title, description,
  inputSchema: object(properties, required), options: { readOnly } });
const maintainFields = { curso: text(300), operacao: { type: "string", enum: ["criar", "editar", "remover"] },
  item: reference, enunciado: text(2000), descricao: { type: "string", maxLength: 4000 } };
const explanation = object({ ideia: reference, formas: list({ type: "string", enum: EXPLANATION_FORMS }, 8),
  formasNaoAplicaveis: list(object({ forma: { type: "string", enum: EXPLANATION_FORMS }, motivo: text(240) }), 8) }, ["ideia", "formas"]);
const practice = object({ requisito: reference, oportunidade: text(240),
  dimensoesVariadas: list({ type: "string", enum: PRACTICE_VARIATION_DIMENSIONS }, 5) });
const applicationFields = { modo: { type: "string", enum: ["expository", "practice", "mixed"] },
  ideiasIntroduzidas: list(reference), ideiasUtilizadas: list(reference), cobertura: list(reference),
  explicacoes: list(explanation), praticas: list(practice) };
const calibrationFields = Object.fromEntries(COURSE_DESIGN_PARAMETER_DEFINITIONS.map(definition => {
  const value = definition.valueSchema;
  return [definition.humanField, value.type === "set" ? { ...list({ type: "string", enum: value.allowedValues }, value.maximumItems), minItems: value.minimumItems }
    : value.type === "enum" ? { type: "string", enum: value.allowedValues } : { type: value.type, minimum: value.minimum, maximum: value.maximum }];
}));
export const COURSE_HUMAN_DESIGN_TASK_DEFINITIONS = [
  task("consultar_repertorio_instrucional", "Consultar repertório instrucional", "Lê unidades de análise, requisitos de evidência e seus vínculos. Na unidade, lê a aplicação salva; posições começam em 1.",
    scopeFields, ["curso"], true),
  task("manter_unidade_analise", "Manter unidade de análise instrucional", "Cria, edita ou remove um item expresso do repertório do curso, inclusive antes das unidades de estudo. Edição preserva descrição omitida; remoção exige revisar vínculos, aplicações e fontes existentes.",
    maintainFields, ["curso", "operacao"]),
  task("manter_requisito_evidencia", "Manter requisito de evidência", "Cria, edita ou remove um requisito expresso do repertório. O enunciado define a operação observável; itens omitidos permanecem. Edição preserva descrição omitida.",
    maintainFields, ["curso", "operacao"]),
  task("vincular_repertorio_instrucional", "Vincular repertório à microssequência", "Salva a seleção completa e expressa de análise e evidência desta microssequência. Cobertura curricular e aplicações já salvas são preservadas.",
    { curso: text(300), modulo: reference, licao: reference, microssequencia: reference,
      analise: list(reference), evidencias: list(reference) }, ["curso", "microssequencia", "analise", "evidencias"]),
  task("registrar_aplicacoes_instrucionais", "Registrar aplicações instrucionais", "Registra aplicações expressas nas unidades inspecionadas de uma microssequência, mantendo texto, base explicativa e configuração aplicada. Unidades omitidas permanecem. Valida introdução, uso, formas e oportunidades no estado final.",
    { curso: text(300), modulo: reference, licao: reference, microssequencia: reference,
      unidades: { ...list(object({ unidade: reference, ...applicationFields }), 64), minItems: 1 } }, ["curso", "microssequencia", "unidades"]),
  task("aplicar_configuracao_instrucional", "Aplicar configuração às unidades existentes", "Aplica a intenção corrente às unidades inspecionadas. Calibração explicita somente parâmetros automáticos; fixações e condições de pesquisa são preservadas. A aplicação salva é validada; uma unidade sem aplicação precisa recebê-la expressamente. Preserva texto e base e não declara revisão humana.",
    { curso: text(300), modulo: reference, licao: reference, microssequencia: reference,
      unidades: { ...list(object({ unidade: reference,
        calibracao: object({ parametros: { ...object(calibrationFields, []), minProperties: 1 }, motivo: text(1000) }),
        aplicacao: object(applicationFields) }, ["unidade"]), 64), minItems: 1 } }, ["curso", "microssequencia", "unidades"]),
  task("ajustar_orientacao", "Ajustar orientação de autoria", "Salva uma orientação no objeto corrente; null retira a orientação local. A intenção passa a orientar trabalho futuro e não reescreve unidades existentes.",
    { ...scopeFields, orientacao: { type: ["string", "null"], minLength: 1, maxLength: 8192 } }, ["curso", "orientacao"]),
  task("ajustar_componentes", "Ajustar política de componentes", "Define disponibilidade, exclusões e preferências por nomes do catálogo atual. Herdar retira a política local. Não altera automaticamente o conteúdo salvo.",
    { ...scopeFields, disponibilidade: { type: "string", enum: ["todos", "somente_selecionados", "herdar"] },
      permitidos: list(reference, 64), excluidos: list(reference, 64), preferidos: list(reference, 64) }, ["curso", "disponibilidade"])
];

const fail = (message, status = 422, code = "invalid_human_design_command") => { throw new AuthoringApiError(status, code, message); };
const envelope = (result, context = null) => ({ result, deepLink: null, nextDecision: null, context });
const first = value => Array.isArray(value) ? value[0] : value;
const normalized = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/gu, "").toLocaleLowerCase("pt-BR").trim();
const sameScope = (a, b) => a != null && b != null && a.kind === b.kind && a.ref === b.ref;
function match(items, ref, label, title = item => item.statement) {
  if (!Number.isSafeInteger(ref) && (typeof ref !== "string" || !ref.trim() || ref.length > 300)) fail(`${label} precisa de título ou posição.`);
  const matches = items.filter((item, index) => Number.isSafeInteger(ref)
    ? Number(item.position ?? index) + 1 === ref : normalized(title(item)) === normalized(ref));
  if (matches.length !== 1) fail(`${label} ${matches.length ? "é ambíguo; especifique a posição" : "não foi localizado"}.`,
    matches.length ? 409 : 404, matches.length ? "ambiguous_human_reference" : "human_reference_not_found");
  return matches[0];
}
function refs(items, values, label, title) {
  if (!Array.isArray(values) || values.length > 256) fail(`${label} precisa de uma lista explícita.`);
  const resolved = values.map(value => match(items, value, label, title));
  if (new Set(resolved.map(item => item.id ?? item.ref)).size !== resolved.length) fail(`${label} repete o mesmo item.`);
  return resolved;
}
async function loadContext(values, { applications = false } = {}) {
  const { adapter, principal, args, deadlineAt } = values;
  const resolved = await resolveHumanCourseContext({ adapter, principal, course: args.curso,
    module: args.modulo ?? null, lesson: args.licao ?? null, microsequence: args.microssequencia ?? null,
    studyUnits: applications ? args.unidades.map(item => item.unidade) : args.unidade == null ? [] : [args.unidade], deadlineAt });
  resolved.plan ??= await adapter.getCourseInstructionalPlan({ principal, courseId: resolved.course.id, recentLimit: 1, deadlineAt });
  if (resolved.plan.courseId != null && resolved.plan.courseId !== resolved.course.id ||
      !Number.isSafeInteger(resolved.plan.courseRevision) || !Number.isSafeInteger(resolved.plan.plan?.version)) {
    fail("O planejamento não pôde ser confirmado.", 503, "course_service_unavailable");
  }
  resolved.course.revision = resolved.plan.courseRevision;
  return resolved;
}
const items = (resolved, kind) => resolved.plan.plan[kind] ?? [];
const itemField = kind => kind === "instructional_analysis_unit" ? "instructionalAnalysisUnits" : "evidenceRequirements";
async function readDesign(values, resolved) {
  return values.adapter.getCourseDesign({ principal: values.principal, courseId: resolved.course.id,
    scopeKind: scope(resolved).kind, scopeRef: scope(resolved).ref, childLimit: 1, deadlineAt: values.deadlineAt });
}
function checkReceipt(value, request, settings) {
  if (settings) {
    try { value = normalizeCourseDesignChange(value); } catch { fail("A confirmação da configuração é inválida.", 503, "course_service_unavailable"); }
    if (value.change !== null && (!sameScope(value.change.scope, request.command.scope) || value.change.type !== request.command.type)) {
      fail("A confirmação pertence a outro objeto.", 503, "course_service_unavailable");
    }
  } else if (value?.contract !== "aralearn.course-instructional-design-change.v1" || value.commandType !== request.command.type ||
      !sameScope(value.scope, request.command.scope) || !Number.isSafeInteger(value.planVersion) ||
      value.planVersion !== request.command.expectedPlanVersion + Number(value.changed && ["save_plan_item", "remove_plan_item", "set_target_plan_items"].includes(request.command.type)) ||
      typeof value.changed !== "boolean" || typeof value.idempotent !== "boolean") {
    fail("A confirmação instrucional é inválida.", 503, "course_service_unavailable");
  }
  if (value.courseId !== request.courseId || value.requestId !== request.requestId ||
      !Number.isSafeInteger(value.courseRevision) || value.courseRevision !== request.expectedCourseRevision + Number(value.changed)) {
    fail("A confirmação não corresponde à tentativa salva.", 503, "course_service_unavailable");
  }
  return value;
}
async function write(values, buildCommand, { applications = false, settings = false } = {}) {
  const { adapter, principal, deadlineAt } = values;
  const channel = principal.authenticationKind === "application" ? "application"
    : ["oauth", "action"].includes(principal.authenticationKind) ? "mcp" : fail("Sessão de autoria inválida.", 401, "authentication_required");
  const payload = request => ({ p_actor_id: principal.actorId, p_course_id: request.courseId,
    p_expected_course_revision: request.expectedCourseRevision, p_command: request.command,
    p_request_id: request.requestId, p_request_hash: request.requestHash, p_channel: channel });
  return executeTrustedCourseWrite({ operation: "apply_course_design_command_v3", maxCasRetries: 0,
    load: () => loadContext(values, { applications }),
    build: async (resolved, identity) => {
      let command = await buildCommand(resolved, identity);
      if (settings) command = normalizeCourseDesignCommand(command);
      else command = { ...command, expectedPlanVersion: resolved.plan.plan.version };
      const request = { courseId: resolved.course.id, expectedCourseRevision: resolved.course.revision, command };
      return { ...request, requestHash: await sha256Hex(JSON.stringify(request)) };
    },
    commit: async request => checkReceipt(first(await adapter.rpc("apply_course_design_command_for_actor_v3", payload(request),
      { deadlineAt, retry: false, timeoutMs: 40_000, responseLimitBytes: 256 * 1024 })), request, settings),
    reconcile: async ({ request }) => {
      const receipt = first(await adapter.rpc("get_course_change_receipt_for_actor_v1", { p_actor_id: principal.actorId,
        p_course_id: request.courseId, p_operation: "apply_course_design_command_v3", p_request_id: request.requestId,
        p_request_hash: request.requestHash }, { deadlineAt, responseLimitBytes: 256 * 1024 }));
      if (receipt?.status !== "confirmed") return { status: "pending" };
      const result = checkReceipt(receipt.result, request, settings);
      const current = await adapter.getCourseInstructionalPlan({ principal, courseId: request.courseId, recentLimit: 1, deadlineAt });
      if (current.courseId != null && current.courseId !== request.courseId ||
          !Number.isSafeInteger(current.courseRevision) || current.courseRevision < result.courseRevision) return { status: "pending" };
      return { status: "confirmed", result };
    }
  });
}
async function maintain(values, kind) {
  const { args } = values;
  if (!["criar", "editar", "remover"].includes(args.operacao) || args.operacao === "criar" && args.item != null ||
      args.operacao !== "criar" && args.item == null || args.operacao === "remover" && (args.enunciado != null || args.descricao != null)) {
    fail("Informe a operação e a referência correspondente; criação recebe enunciado e remoção recebe somente o item.");
  }
  const saved = await write(values, async (resolved, { newId }) => {
    const item = args.operacao === "criar" ? null : match(items(resolved, itemField(kind)), args.item, "O item instrucional");
    if (args.operacao !== "remover" && (typeof args.enunciado !== "string" || !args.enunciado.trim() || args.enunciado.length > 2000 ||
        args.descricao !== undefined && (typeof args.descricao !== "string" || args.descricao.length > 4000))) fail("Enunciado ou descrição inválido.");
    return { type: args.operacao === "remover" ? "remove_plan_item" : "save_plan_item", scope: { kind: "course", ref: resolved.course.id },
      itemId: item?.id ?? await newId(kind), itemKind: kind, expectedItemVersion: item?.version ?? 0,
      ...(args.operacao === "remover" ? {} : { statement: args.enunciado, description: args.descricao ?? item?.description ?? "" }) };
  });
  return envelope(saved.changed ? "Confirmei a alteração do item instrucional." : "O item já corresponde ao conteúdo solicitado.");
}
function applicationCommand(resolved, entry) {
  if (!entry || !["expository", "practice", "mixed"].includes(entry.modo) ||
      ["ideiasIntroduzidas", "ideiasUtilizadas", "cobertura", "explicacoes", "praticas"].some(field => !Array.isArray(entry[field]))) {
    fail("A aplicação exige modo e listas explícitas de ideias, cobertura, explicações e práticas.");
  }
  return { mode: entry.modo,
    introducedInstructionalAnalysisUnitIds: refs(items(resolved, "instructionalAnalysisUnits"), entry.ideiasIntroduzidas, "A ideia introduzida").map(item => item.id),
    usedInstructionalAnalysisUnitIds: refs(items(resolved, "instructionalAnalysisUnits"), entry.ideiasUtilizadas, "A ideia utilizada").map(item => item.id),
    curriculumScopeItemIds: refs(items(resolved, "curriculumScopeItems"), entry.cobertura, "A cobertura").map(item => item.id),
    explanationApplications: entry.explicacoes.map(item => ({ instructionalAnalysisUnitId: match(items(resolved, "instructionalAnalysisUnits"), item.ideia, "A ideia explicada").id,
      developedForms: item.formas, notApplicable: (item.formasNaoAplicaveis ?? []).map(form => ({ form: form.forma, reason: form.motivo })) })),
    practiceApplications: entry.praticas.map(item => { const requirement = match(items(resolved, "evidenceRequirements"), item.requisito, "O requisito praticado");
      return { evidenceRequirementId: requirement.id, opportunityId: item.oportunidade, invariantTaskOperation: requirement.statement,
        variedDimensions: item.dimensoesVariadas }; }) };
}
function automaticParameters(calibration) {
  if (calibration === undefined) return [];
  if (!calibration || typeof calibration.motivo !== "string" || !calibration.motivo.trim() || calibration.motivo.length > 1000 ||
      !calibration.parametros || typeof calibration.parametros !== "object" || Array.isArray(calibration.parametros)) fail("Calibração contextual inválida.");
  return Object.entries(calibration.parametros).map(([field, value]) => {
    const definition = COURSE_DESIGN_PARAMETER_DEFINITIONS.find(item => item.humanField === field);
    if (!definition) fail("A calibração contém parâmetro desconhecido.");
    return { parameterId: definition.id, value: normalizeCourseDesignParameterValue(definition.id, value), reason: calibration.motivo };
  });
}
export const COURSE_HUMAN_DESIGN_TASK_HANDLERS = {
  async consultar_repertorio_instrucional(values) {
    const resolved = await loadContext(values); const design = await readDesign(values, resolved);
    const human = field => items(resolved, field).map((item, index) => ({ posicao: (item.position ?? index) + 1,
      enunciado: item.statement, descricao: item.description ?? "" }));
    const linked = (ids, field) => (ids ?? []).map(id => items(resolved, field).find(item => item.id === id)?.statement ?? "Item ausente");
    return envelope("Li o repertório e o desenho do objeto corrente.", {
      analise: human("instructionalAnalysisUnits"), evidencias: human("evidenceRequirements"), cobertura: human("curriculumScopeItems"),
      vinculos: design.targetPlanItems ? { analise: linked(design.targetPlanItems.instructionalAnalysisUnitIds, "instructionalAnalysisUnits"),
        evidencias: linked(design.targetPlanItems.evidenceRequirementIds, "evidenceRequirements") } : null,
      aplicacao: resolved.studyUnits[0]?.authorship?.design?.application ?? null,
      configuracaoAplicada: resolved.studyUnits[0]?.authorship?.design ?? null,
      componentes: design.componentCatalog.options.map((item, index) => ({ posicao: index + 1, nome: item.label, finalidade: item.purpose }))
    });
  },
  manter_unidade_analise: values => maintain(values, "instructional_analysis_unit"),
  manter_requisito_evidencia: values => maintain(values, "evidence_requirement"),
  async vincular_repertorio_instrucional(values) {
    await write(values, resolved => {
      if (!resolved.microsequence) fail("Indique a microssequência do vínculo.");
      return { type: "set_target_plan_items", scope: scope(resolved),
        instructionalAnalysisUnitIds: refs(items(resolved, "instructionalAnalysisUnits"), values.args.analise, "A unidade de análise").map(item => item.id),
        evidenceRequirementIds: refs(items(resolved, "evidenceRequirements"), values.args.evidencias, "O requisito de evidência").map(item => item.id) };
    });
    return envelope("Confirmei os vínculos instrucionais desta microssequência.");
  },
  async registrar_aplicacoes_instrucionais(values) {
    if (!Array.isArray(values.args.unidades) || !values.args.unidades.length || values.args.unidades.length > 64) fail("Selecione de 1 a 64 unidades inspecionadas.");
    await write(values, resolved => {
      if (!resolved.microsequence) fail("Indique a microssequência das aplicações.");
      return { type: "set_study_unit_applications", scope: { kind: "didactic_microsequence", ref: resolved.microsequence.id },
        units: values.args.unidades.map((entry, index) => ({ studyUnitId: resolved.studyUnits[index].studyUnit.id,
          expectedStudyUnitVersion: resolved.studyUnits[index].version,
          application: applicationCommand(resolved, entry) })) };
    }, { applications: true });
    return envelope("Confirmei as aplicações instrucionais expressas nas unidades selecionadas.");
  },
  async aplicar_configuracao_instrucional(values) {
    if (!Array.isArray(values.args.unidades) || !values.args.unidades.length || values.args.unidades.length > 64) fail("Selecione de 1 a 64 unidades inspecionadas.");
    const saved = await write(values, async resolved => {
      if (!resolved.microsequence) fail("Indique a microssequência das unidades.");
      for (const unit of resolved.studyUnits) {
        const design = await values.adapter.getCourseDesign({ principal: values.principal, courseId: resolved.course.id,
          scopeKind: "study_unit", scopeRef: unit.studyUnit.id, childLimit: 1, deadlineAt: values.deadlineAt });
        if (design.courseRevision !== resolved.course.revision) fail("A configuração mudou; releia a unidade.", 409, "stale_course_state");
      }
      return { type: "apply_study_unit_configuration", scope: { kind: "didactic_microsequence", ref: resolved.microsequence.id },
        units: values.args.unidades.map((entry, index) => ({ studyUnitId: resolved.studyUnits[index].studyUnit.id,
          expectedStudyUnitVersion: resolved.studyUnits[index].version, automaticParameters: automaticParameters(entry.calibracao),
          ...(entry.aplicacao === undefined ? {} : { application: applicationCommand(resolved, entry.aplicacao) }) })) };
    }, { applications: true });
    return envelope(saved.changed ? "Confirmei a configuração aplicada às unidades selecionadas. O texto e a base salva foram preservados."
      : "As unidades já correspondem à configuração solicitada.");
  },
  async ajustar_orientacao(values) {
    await write(values, resolved => values.args.orientacao === null ? { type: "clear_guidance", scope: scope(resolved) }
      : { type: "set_guidance", scope: scope(resolved), guidance: values.args.orientacao,
        origin: "author", reason: "Orientação expressa da pessoa autora." }, { settings: true });
    return envelope("Confirmei a orientação de autoria do objeto corrente.");
  },
  async ajustar_componentes(values) {
    const { args } = values;
    if (!["todos", "somente_selecionados", "herdar"].includes(args.disponibilidade)) fail("Escolha uma disponibilidade válida.");
    await write(values, async resolved => {
      if (args.disponibilidade === "herdar") {
        if ([args.permitidos, args.excluidos, args.preferidos].some(value => value?.length)) fail("Herança não recebe seleções locais.");
        return { type: "clear_component_policy", scope: scope(resolved) };
      }
      const design = await readDesign(values, resolved);
      if (design.courseRevision !== resolved.course.revision) fail("O desenho mudou; releia o objeto.", 409, "stale_course_state");
      const options = design.componentCatalog.options;
      const selected = values => refs(options, values ?? [], "O componente", item => item.label).map(item => item.ref);
      return { type: "set_component_policy", scope: scope(resolved), origin: "author", reason: "Política expressa da pessoa autora.",
        policy: { catalogVersion: design.componentCatalog.version, availability: args.disponibilidade === "todos" ? "all" : "allow_only",
          allowedRefs: selected(args.permitidos), excludedRefs: selected(args.excluidos), preferredRefs: selected(args.preferidos) } };
    }, { settings: true });
    return envelope("Confirmei a política de componentes do objeto corrente.");
  }
};
