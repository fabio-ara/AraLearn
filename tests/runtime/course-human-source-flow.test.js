// Testes focais das responsabilidades do worker de integração:
// H1 manter_fonte (pacote transacional único, rollback, repetição idempotente),
// H2 clareza do resumo de retomada, H3 orientação da busca paginada vazia e
// F2 envelope tools/list do outputSchema. Sem dependências externas.
import test from "node:test";
import assert from "node:assert/strict";
import { executeHumanCourseTask } from
  "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
import { ARALEARN_MCP_PROTOCOL_VERSION, createAuthoringMcpHandler } from
  "../../supabase/functions/_shared/aralearn-authoring/mcpServer.js";
import { AuthoringApiError } from
  "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import { courseDesignFixture } from "../helpers/courseDesignFixture.js";
import { defaultAuthoringProcessPreferences } from
  "../../src/domain/authoringProcessPreferences.js";
import { createEmptyCourseSourceBibliographicMetadata, normalizeCourseSourceBundleChange,
  normalizeCourseSourceCommand } from "../../src/domain/courseSources.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const TITLE = "Curso sintético";
const ORIGIN = "https://chatgpt.com";
const MCP_URL = "https://project.example/functions/v1/aralearn-authoring-mcp";
const PRINCIPAL = Object.freeze({ actorId: "20000000-0000-4000-8000-000000000001",
  authenticationKind: "oauth", scopes: Object.freeze(["authoring:read", "authoring:write"]) });

function fixture({ sources = [] } = {}) {
  const commands = [];
  const calls = { sources: [] };
  const adapter = {
    publicAppUrl: "https://app.example/", commands, calls, sources, revision: 7,
    async resolvePrincipal() { return PRINCIPAL; },
    async listCourses() {
      return { items: [{ courseId: COURSE_ID, title: TITLE, revision: adapter.revision }],
        hasMore: false, nextCursor: null };
    },
    async getCourse({ courseId }) { return { courseId, revision: adapter.revision, title: TITLE }; },
    async getCourseInstructionalPlan() {
      return { courseRevision: adapter.revision, plan: { title: TITLE, parts: [] } };
    },
    async getAuthoringProcessPreferences() {
      return { contract: "aralearn.authoring-process-preferences.v1", revision: 0, updatedAt: null,
        preferences: defaultAuthoringProcessPreferences() };
    },
    async getCourseDesign({ courseId, scopeKind = "course", scopeRef }) {
      return courseDesignFixture({ courseId, moduleId: "module", lessonId: "lesson",
        microsequenceId: scopeKind === "didactic_microsequence" ? scopeRef : "ms",
        studyUnitId: scopeKind === "study_unit" ? scopeRef : "unit-1" },
        { scope: scopeKind, revision: adapter.revision });
    },
    async listCourseStudyUnits() { return { items: [], hasMore: false, nextCursor: null }; },
    async getCourseSources(input) {
      calls.sources.push(input);
      if (input.mode === "source") {
        const source = sources.find(item => item.sourceId === input.sourceId);
        return { items: source ? [structuredClone(source)] : [], nextCursor: null };
      }
      if (input.mode === "target") return { items: [{ sourceLinks: [] }], nextCursor: null };
      const start = input.cursor === null ? 0 : Number(String(input.cursor).split("-").at(-1));
      const items = sources.slice(start, start + input.limit);
      const end = start + items.length;
      return { items: structuredClone(items), nextCursor: end < sources.length ? `source-${end}` : null };
    },
    async executeCourseSourceCommand(request) {
      commands.push(structuredClone(request));
      return { changed: true };
    }
  };
  return adapter;
}

const bundleCommands = (request) => request.command.type === "apply_source_bundle"
  ? request.command.commands : [request.command];

// Materializa o pacote na fixture como o backend transacional faria e devolve o
// recibo com os fatos aplicados, para o handler reler a fonte gravada.
function persistSourceWrites(adapter, { loseFirstResponse = false } = {}) {
  const attempts = [];
  adapter.executeCourseSourceCommand = async (request) => {
    attempts.push(structuredClone(request));
    const changes = [];
    for (const command of bundleCommands(request)) {
      if (command.type === "save_source") {
        if (!adapter.sources.some(item => item.sourceId === command.sourceId)) {
          adapter.sources.push({ sourceId: command.sourceId, revision: 1, status: "active",
            ...structuredClone(command.source), anchors: [] });
        }
        changes.push({ type: "save_source", subjectId: command.sourceId, revision: 1 });
      }
      if (command.type === "save_anchor") {
        const source = adapter.sources.find(item => item.sourceId === command.sourceId);
        if (source && !source.anchors.some(anchor => anchor.anchorId === command.anchorId)) {
          source.anchors.push({ anchorId: command.anchorId, revision: 1,
            selector: command.selector, contentHash: command.contentHash,
            humanLocator: command.humanLocator, verificationExcerpt: command.verificationExcerpt });
        }
        changes.push({ type: "save_anchor", subjectId: command.anchorId, revision: 1 });
      }
      if (command.type === "set_target_sources") {
        changes.push({ type: "set_target_sources", subjectId: command.targetId, targetVersion: 1 });
      }
    }
    if (loseFirstResponse && attempts.length === 1) {
      throw new AuthoringApiError(503, "course_service_unavailable", "Resposta perdida.");
    }
    return { contract: "aralearn.course-source-change.v1", courseId: request.courseId,
      courseRevision: request.expectedCourseRevision + (changes.length ? 1 : 0),
      requestId: request.requestId, idempotent: attempts.length > 1,
      changed: changes.length > 0, changes };
  };
  return attempts;
}

const manterFonte = (adapter, args) => executeHumanCourseTask({ adapter, principal: PRINCIPAL,
  name: "manter_fonte", rawArguments: { curso: TITLE, ...args } });
const consultarFontes = (adapter, args) => executeHumanCourseTask({ adapter, principal: PRINCIPAL,
  name: "consultar_fontes", rawArguments: { curso: TITLE, ...args } });

const METADADOS = { titulo: "RFC 3261 — SIP", url: "https://www.rfc-editor.org/rfc/rfc3261" };

test("H1 manter_fonte recusa âncora inválida sem gravar nada nem duplicar na repetição", async () => {
  const adapter = fixture();
  const ancorasInvalidas = [{ seletor: { tipo: "paginas", paginaInicial: 1 } }];
  await assert.rejects(() => manterFonte(adapter, { metadados: METADADOS, ancoras: ancorasInvalidas }),
    error => error.code === "invalid_human_task_argument");
  assert.equal(adapter.commands.length, 0, "a validação prévia não pode gravar nada");
  await assert.rejects(() => manterFonte(adapter, { metadados: METADADOS, ancoras: ancorasInvalidas }),
    error => error.code === "invalid_human_task_argument");
  assert.equal(adapter.commands.length, 0);
  await assert.rejects(() => manterFonte(adapter, { metadados: METADADOS,
    ancoras: [{ seletor: { tipo: "trecho", trechoExato: "texto" }, campoExtra: true }] }),
  error => error.code === "unknown_human_task_argument");
  await assert.rejects(() => manterFonte(adapter, { metadados: METADADOS,
    ancoras: [{ seletor: { tipo: "paginas", paginaInicial: 3, paginaFinal: 1 } }] }),
  error => error.code === "invalid_human_task_argument");
  await assert.rejects(() => manterFonte(adapter, { metadados: METADADOS,
    vinculos: [{ unidade: 1, relacao: "supported_by", papeis: [] }] }),
  error => error.code === "invalid_human_source_roles");
  assert.equal(adapter.commands.length, 0);
  assert.equal(adapter.sources.length, 0, "nenhuma fonte equivalente foi criada");
});

test("H1 manter_fonte aplica metadados e âncora num único pacote transacional", async () => {
  const adapter = fixture();
  const attempts = persistSourceWrites(adapter);
  const output = await manterFonte(adapter, {
    metadados: METADADOS,
    ancoras: [{ seletor: { tipo: "paginas", paginaInicial: 1, paginaFinal: 2 },
      localizadorHumano: "p. 1-2" }]
  });
  assert.equal(attempts.length, 1, "metadados e âncora vão no mesmo pacote");
  assert.equal(attempts[0].command.type, "apply_source_bundle");
  assert.deepEqual(attempts[0].command.commands.map(command => command.type),
    ["save_source", "save_anchor"]);
  assert.equal(adapter.sources.length, 1);
  assert.equal(adapter.sources[0].anchors.length, 1);
  assert.match(output.result, /Atualizei a fonte/u);
});

test("H1 metadados parciais preservam os campos anteriores sem regressão", async () => {
  const { adapter, source } = bindingFixture();
  const attempts = persistSourceWrites(adapter);
  await manterFonte(adapter, { fonte: 1, metadados: { titulo: "Título novo" } });
  const save = bundleCommands(attempts[0]).find(command => command.type === "save_source");
  assert.equal(save.sourceId, source.sourceId);
  assert.equal(save.expectedSourceRevision, 3);
  assert.equal(save.source.title, "Título novo");
  assert.equal(save.source.citationText, source.citationText, "campo omitido permanece");
  assert.deepEqual(save.source.defaultRoles, source.defaultRoles, "papéis anteriores permanecem");
});

test("H1 âncora nova com referência de âncora é recusada antes de montar o pacote", async () => {
  const adapter = fixture();
  await assert.rejects(() => manterFonte(adapter, {
    metadados: { titulo: "Fonte nova com referência" },
    ancoras: [{ ancora: 1, seletor: { tipo: "paginas", paginaInicial: 1, paginaFinal: 1 } }]
  }), error => error.code === "invalid_human_task_argument");
  assert.equal(adapter.commands.length, 0);
  assert.equal(adapter.sources.length, 0);
});

test("H1 resposta perdida do pacote repete a mesma tentativa sem duplicar", async () => {
  const adapter = fixture();
  const attempts = persistSourceWrites(adapter, { loseFirstResponse: true });
  const output = await manterFonte(adapter, { metadados: METADADOS,
    ancoras: [{ seletor: { tipo: "paginas", paginaInicial: 1, paginaFinal: 2 }, localizadorHumano: "p. 1-2" }] });
  assert.equal(attempts.length, 2, "a resposta perdida é reconciliada com a mesma tentativa");
  assert.equal(attempts[0].requestId, attempts[1].requestId);
  assert.deepEqual(attempts[0].command, attempts[1].command, "o mesmo pacote é reenviado");
  assert.equal(adapter.sources.length, 1, "a repetição não cria fonte equivalente");
  assert.equal(adapter.sources[0].anchors.length, 1);
  assert.match(output.result, /Atualizei a fonte/u);
});

test("H1 falha da parte final do pacote não persiste nada", async () => {
  const adapter = fixture();
  adapter.listCourseStudyUnits = async () => ({ items: [{ ordinal: 1, version: 4,
    studyUnit: { id: "unit-bind", title: "Unidade sintética", version: 4,
      content: [{ id: "paragraph-bind", package: "aralearn.resource.paragraph", version: "1.0.0",
        data: { text: "Texto literal do curso." } }], response: null, feedback: [] } }],
    hasMore: false, nextCursor: null });
  const attempts = persistSourceWrites(adapter);
  adapter.executeCourseSourceCommand = async (request) => {
    attempts.push(structuredClone(request));
    throw new AuthoringApiError(422, "invalid_human_source_occurrence", "Uma ocorrência não corresponde ao conteúdo salvo.");
  };
  await assert.rejects(() => manterFonte(adapter, { metadados: METADADOS,
    ancoras: [{ seletor: { tipo: "paginas", paginaInicial: 1, paginaFinal: 2 }, localizadorHumano: "p. 1-2" }],
    vinculos: [{ unidade: 1, relacao: "supported_by", papeis: ["tecnica_conceitual"],
      ancoras: [1], ocorrencias: [{ lugar: "conteudo", recurso: 1, trecho: "Texto literal do curso." }] }] }),
  error => error.code === "invalid_human_source_occurrence");
  assert.equal(attempts.length, 1);
  assert.equal(adapter.sources.length, 0, "falha transacional não deixa fonte parcial");
});

test("H1 alvo semântico inválido é apurado antes do commit, sem fonte oculta", async () => {
  const adapter = fixture();
  const attempts = persistSourceWrites(adapter);
  await assert.rejects(() => manterFonte(adapter, { metadados: { titulo: "Fonte com vínculo quebrado" },
    vinculos: [{ unidade: 999, relacao: "supported_by", papeis: ["tecnica_conceitual"] }] }),
  error => error.code === "human_reference_not_found");
  assert.equal(attempts.length, 0, "nada é enviado quando o alvo não resolve");
  assert.equal(adapter.sources.length, 0);
});

test("H1 repetição externa idêntica sem fonte reconcilia e não duplica Fonte/âncora", async () => {
  const adapter = fixture();
  const attempts = persistSourceWrites(adapter);
  const args = { metadados: METADADOS,
    ancoras: [{ seletor: { tipo: "paginas", paginaInicial: 1, paginaFinal: 2 }, localizadorHumano: "p. 1-2" }] };
  await manterFonte(adapter, args);
  await manterFonte(adapter, args);
  assert.equal(attempts.length, 2, "cada chamada externa tem a própria tentativa");
  assert.notEqual(attempts[0].requestId, attempts[1].requestId, "são chamadas externas distintas");
  const first = attempts[0].command.commands.find(command => command.type === "save_source");
  const second = attempts[1].command.commands.find(command => command.type === "save_source");
  assert.equal(second.sourceId, first.sourceId, "a repetição reusa a mesma identidade");
  assert.equal(second.expectedSourceRevision, 1);
  assert.equal(adapter.sources.length, 1, "a chamada externa repetida não cria segunda Fonte");
  assert.equal(adapter.sources[0].anchors.length, 1, "a âncora equivalente não duplica");
});

test("H1 fontes equivalentes duplicadas recusam a criação com 409 sem gravar", async () => {
  const adapter = fixture();
  const document = { kind: "document", defaultRoles: [], title: METADADOS.titulo, authors: [],
    bibliographic: createEmptyCourseSourceBibliographicMetadata(), citationMode: "manual",
    publicationDate: null, identifier: null, language: null, citationText: null, url: METADADOS.url,
    editionOrVersion: null, origin: "external", availability: "unknown",
    verificationStatus: "unverified", studyVisibility: "hidden" };
  adapter.sources.push({ sourceId: "source-a", revision: 1, status: "active", ...structuredClone(document), anchors: [] },
    { sourceId: "source-b", revision: 1, status: "active", ...structuredClone(document), anchors: [] });
  await assert.rejects(() => manterFonte(adapter, { metadados: METADADOS }),
    error => error.code === "ambiguous_human_reference" && error.status === 409);
  assert.equal(adapter.commands.length, 0, "o conflito ambíguo não grava");
});

test("H2 resumo de retomada declara o alcance e não sugere ausência de conteúdo", async () => {
  const adapter = fixture();
  const output = await executeHumanCourseTask({ adapter, principal: PRINCIPAL,
    name: "retomar_curso", rawArguments: { titulo: TITLE } });
  const alcance = output.context.alcanceDoResumo;
  assert.ok(alcance, "a retomada sem foco precisa declarar o alcance do resumo");
  assert.match(alcance.resumo, /mapa curricular/iu);
  assert.match(alcance.naoInclui, /rascunho/iu);
  assert.match(alcance.naoInclui, /não indica ausência no curso/iu);
  assert.match(alcance.comoLerConteudo, /microssequência/iu);
  assert.equal(Object.hasOwn(output.context, "studyUnits"), false);
});

test("H3 busca paginada vazia orienta continuar e só conclui ao esgotar as páginas", async () => {
  const sources = Array.from({ length: 25 }, (_, index) => ({ sourceId: `source-${index}`,
    title: index === 24 ? "Fonética IPA" : `Fonte ${index + 1}` }));
  const adapter = fixture({ sources });
  const first = await consultarFontes(adapter, { busca: "IPA" });
  assert.deepEqual(first.context.sources.items, []);
  assert.equal(first.context.temMais, true);
  assert.match(first.result, /ainda não terminou/u);
  assert.match(first.nextDecision, /continuação/u);
  const second = await consultarFontes(adapter, { busca: "IPA", continuacao: first.context.continuacao });
  assert.deepEqual(second.context.sources.items.map(item => item.title), ["Fonética IPA"]);
  assert.equal(second.context.temMais, false);
  assert.doesNotMatch(second.nextDecision, /continuação|ainda não terminou/u);
  const emptyFirst = await consultarFontes(adapter, { busca: "inexistente" });
  assert.deepEqual(emptyFirst.context.sources.items, []);
  assert.equal(emptyFirst.context.temMais, true);
  assert.match(emptyFirst.nextDecision, /continuação/u);
  const emptyLast = await consultarFontes(adapter, { busca: "inexistente",
    continuacao: emptyFirst.context.continuacao });
  assert.deepEqual(emptyLast.context.sources.items, []);
  assert.equal(emptyLast.context.temMais, false);
  assert.match(emptyLast.result, /Nenhuma fonte corresponde à busca neste trecho\./u);
  assert.doesNotMatch(emptyLast.result, /ainda não terminou/u);
});

test("F2 tools/list anuncia outputSchema com raiz type:object e ramos sucesso/erro", async () => {
  const handler = createAuthoringMcpHandler({ adapter: fixture(), allowedOrigins: new Set([ORIGIN]),
    resourceUrl: MCP_URL, authorizationServer: "https://project.example/auth/v1" });
  const response = await handler(new Request(MCP_URL, { method: "POST",
    headers: { Origin: ORIGIN, Authorization: "Bearer synthetic-token", "Content-Type": "application/json",
      Accept: "application/json, text/event-stream", "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) }));
  const body = await response.json();
  const tool = body.result.tools.find(({ name }) => name === "manter_fonte");
  assert.ok(tool?.outputSchema, "tools/list precisa anunciar outputSchema");
  assert.equal(tool.outputSchema.type, "object", "a raiz do outputSchema precisa ser objeto");
  assert.equal(tool.outputSchema.oneOf.length, 2);
  const branches = tool.outputSchema.oneOf.map((branch) => branch.required.join(","));
  assert.ok(branches.includes("result,deepLink,nextDecision"));
  assert.ok(branches.includes("error,nextDecision"));
  assert.deepEqual(tool.outputSchema.properties.error.required, ["code", "message", "retryable"]);
});

// Fonte existente com âncora e uma unidade cujo texto contém o trecho literal.
function bindingFixture() {
  const source = { sourceId: "source-bind", revision: 3, title: "Referência de vínculo", kind: "article",
    defaultRoles: ["technical_conceptual"], authors: [], publicationDate: null, identifier: null, language: null,
    citationMode: "manual", citationText: "Citação deliberada.", url: null, editionOrVersion: null,
    bibliographic: createEmptyCourseSourceBibliographicMetadata(), origin: "external", availability: "unknown",
    verificationStatus: "unverified", studyVisibility: "citation",
    anchors: [{ anchorId: "anchor-bind", revision: 2, humanLocator: "Seção 2", verificationExcerpt: "Trecho",
      contentHash: null }] };
  const adapter = fixture();
  adapter.sources = [source];
  adapter.listCourseStudyUnits = async () => ({ items: [{ ordinal: 1, version: 4,
    studyUnit: { id: "unit-bind", title: "Unidade sintética", version: 4,
      content: [{ id: "paragraph-bind", package: "aralearn.resource.paragraph", version: "1.0.0",
        data: { text: "Texto literal do curso." } }], response: null, feedback: [] } }],
    hasMore: false, nextCursor: null });
  adapter.getCourseSources = async (input) => {
    if (input.mode === "source") {
      return { items: input.sourceId === source.sourceId ? [structuredClone(source)] : [], nextCursor: null };
    }
    if (input.mode === "target") return { items: [{ sourceLinks: [] }], nextCursor: null };
    return { items: [structuredClone(source)], nextCursor: null };
  };
  return { adapter, source };
}

// Fixture persistente que aplica o pacote como o backend: guarda fontes, âncoras
// e vínculos por alvo, permitindo provar replay externo e coalescing por alvo.
function statefulSourceFixture() {
  const adapter = fixture();
  adapter.targetLinks = new Map();
  adapter.listCourseStudyUnits = async () => ({ items: [{ ordinal: 1, version: 4,
    studyUnit: { id: "unit-bind", title: "Unidade sintética", version: 4,
      content: [{ id: "paragraph-bind", package: "aralearn.resource.paragraph", version: "1.0.0",
        data: { text: "Texto literal do curso." } }], response: null, feedback: [] } }],
    hasMore: false, nextCursor: null });
  adapter.getCourseSources = async (input) => {
    if (input.mode === "source") {
      const source = adapter.sources.find(item => item.sourceId === input.sourceId);
      return { items: source ? [structuredClone(source)] : [], nextCursor: null };
    }
    if (input.mode === "target") {
      const key = `${input.targetKind}\0${input.targetId}`;
      return { items: [{ sourceLinks: structuredClone(adapter.targetLinks.get(key) ?? []) }], nextCursor: null };
    }
    const start = input.cursor === null ? 0 : Number(String(input.cursor).split("-").at(-1));
    const items = adapter.sources.slice(start, start + input.limit);
    const end = start + items.length;
    return { items: structuredClone(items), nextCursor: end < adapter.sources.length ? `source-${end}` : null };
  };
  adapter.executeCourseSourceCommand = async (request) => {
    adapter.commands.push(structuredClone(request));
    const changes = [];
    for (const command of bundleCommands(request)) {
      if (command.type === "save_source") {
        const existing = adapter.sources.find(item => item.sourceId === command.sourceId);
        if (existing) Object.assign(existing, structuredClone(command.source));
        else adapter.sources.push({ sourceId: command.sourceId, revision: 1, status: "active",
          ...structuredClone(command.source), anchors: [] });
        changes.push({ type: "save_source", subjectId: command.sourceId, revision: 1 });
      }
      if (command.type === "save_anchor") {
        const source = adapter.sources.find(item => item.sourceId === command.sourceId);
        if (source && !source.anchors.some(anchor => anchor.anchorId === command.anchorId)) {
          source.anchors.push({ anchorId: command.anchorId, revision: 1, status: "active",
            selector: command.selector, contentHash: command.contentHash,
            humanLocator: command.humanLocator, verificationExcerpt: command.verificationExcerpt });
        }
        changes.push({ type: "save_anchor", subjectId: command.anchorId, revision: 1 });
      }
      if (command.type === "set_target_sources") {
        adapter.targetLinks.set(`${command.targetKind}\0${command.targetId}`, structuredClone(command.sourceLinks));
        changes.push({ type: "set_target_sources", subjectId: command.targetId, targetVersion: 1 });
      }
    }
    return { contract: "aralearn.course-source-change.v1", courseId: request.courseId,
      courseRevision: request.expectedCourseRevision + (changes.length ? 1 : 0),
      requestId: request.requestId, idempotent: false, changed: changes.length > 0, changes };
  };
  return adapter;
}

test("H1 repetição externa com metadados+âncora+vínculo+estilo não duplica nada", async () => {
  const adapter = statefulSourceFixture();
  const args = { estilo: "abnt-2025", metadados: METADADOS,
    ancoras: [{ seletor: { tipo: "paginas", paginaInicial: 1, paginaFinal: 2 }, localizadorHumano: "p. 1-2" }],
    vinculos: [{ unidade: 1, relacao: "supported_by", papeis: ["tecnica_conceitual"], ancoras: [1],
      ocorrencias: [{ lugar: "conteudo", recurso: 1, trecho: "Texto literal do curso." }] }] };
  await manterFonte(adapter, args);
  await manterFonte(adapter, args);
  assert.equal(adapter.sources.length, 1, "uma única Fonte");
  assert.equal(adapter.sources[0].anchors.length, 1, "uma única âncora");
  assert.equal(adapter.targetLinks.get("study_unit\0unit-bind").length, 1, "um único vínculo");
  assert.equal(adapter.commands.length, 2, "duas chamadas externas distintas");
  assert.notEqual(adapter.commands[0].requestId, adapter.commands[1].requestId);
});

test("H1 dois vínculos no mesmo alvo viram um único set_target_sources", async () => {
  const adapter = statefulSourceFixture();
  adapter.targetLinks.set("study_unit\0unit-bind", [{ linkId: "link-existing", sourceId: "source-keep",
    relation: "informed_by", roles: ["curricular_scope"], anchors: [], occurrences: [] }]);
  await manterFonte(adapter, { metadados: METADADOS, vinculos: [
    { unidade: 1, relacao: "informed_by", papeis: ["escopo_curricular"] },
    { unidade: 1, relacao: "adapted_from", papeis: ["leitura_complementar"] }] });
  const commands = adapter.commands[0].command.commands.filter(command => command.type === "set_target_sources");
  assert.equal(commands.length, 1, "um único comando por alvo");
  const links = commands[0].sourceLinks;
  assert.equal(links.length, 3, "vínculo existente + dois novos");
  assert.equal(links[0].linkId, "link-existing");
  assert.equal(links[0].relation, "informed_by");
  assert.deepEqual(links[0].roles, ["curricular_scope"], "o vínculo existente permanece intacto");
  assert.deepEqual(links.slice(1).map(link => link.relation).sort(), ["adapted_from", "informed_by"]);
});

test("H1 catálogo sem fim recusa 503 antes de gravar", async () => {
  const adapter = fixture();
  let page = 0;
  adapter.getCourseSources = async (input) => {
    if (input.mode === "catalog") { page += 1; return { items: [], nextCursor: `cursor-${page}` }; }
    return { items: [], nextCursor: null };
  };
  await assert.rejects(() => manterFonte(adapter, { metadados: METADADOS }),
    error => error.status === 503);
  assert.equal(adapter.commands.length, 0, "o catálogo parcial não grava");
});

test("H1 equivalente em página posterior do catálogo é reconciliada", async () => {
  const others = Array.from({ length: 24 }, (_, index) => ({ sourceId: `other-${index}`, revision: 1,
    status: "active", kind: "article", defaultRoles: [], title: `Outra ${index}`, authors: [],
    bibliographic: createEmptyCourseSourceBibliographicMetadata(), citationMode: "manual",
    publicationDate: null, identifier: null, language: null, citationText: null, url: null,
    editionOrVersion: null, origin: "external", availability: "unknown", verificationStatus: "unverified",
    studyVisibility: "hidden", anchors: [] }));
  const equivalent = { sourceId: "source-late", revision: 1, status: "active", kind: "document",
    defaultRoles: [], title: METADADOS.titulo, authors: [],
    bibliographic: createEmptyCourseSourceBibliographicMetadata(), citationMode: "manual",
    publicationDate: null, identifier: null, language: null, citationText: null, url: METADADOS.url,
    editionOrVersion: null, origin: "external", availability: "unknown", verificationStatus: "unverified",
    studyVisibility: "hidden", anchors: [] };
  const adapter = fixture({ sources: [...others, equivalent] });
  const attempts = persistSourceWrites(adapter);
  await manterFonte(adapter, { metadados: METADADOS });
  const save = attempts[0].command.commands.find(command => command.type === "save_source");
  assert.equal(save.sourceId, "source-late", "a equivalente da página 2 é reusada");
  assert.equal(adapter.sources.length, 25, "nenhuma Fonte nova");
});

test("H1 pacote aceita 74 comandos e recusa 75", () => {
  const style = { type: "set_bibliography_style", style: "abnt-2025" };
  const bundle = (count) => ({ type: "apply_source_bundle",
    commands: Array.from({ length: count }, () => ({ ...style })) });
  assert.equal(normalizeCourseSourceCommand(bundle(74)).commands.length, 74);
  assert.throws(() => normalizeCourseSourceCommand(bundle(75)),
    error => error.code === "invalid_course_source_command");
});

test("H1 pacote aceita soma acima de 196608 e mantém o limite individual", () => {
  const link = (index) => ({ linkId: `link-${index}`, sourceId: "source-x", relation: "supported_by",
    roles: ["technical_conceptual"], anchors: [],
    occurrences: [{ occurrenceId: `occ-${index}`, slot: "content", resourceId: "r", path: "text",
      quote: "x".repeat(4000), prefix: null, suffix: null }] });
  const command = (offset) => ({ type: "set_target_sources", targetKind: "study_unit",
    targetId: `unit-${offset}`, expectedTargetVersion: 1,
    sourceLinks: Array.from({ length: 28 }, (_, index) => link(offset + index)) });
  const accepted = normalizeCourseSourceCommand({ type: "apply_source_bundle",
    commands: [command(0), command(100)] });
  assert.equal(accepted.commands.length, 2);
  const oversized = { type: "set_target_sources", targetKind: "study_unit", targetId: "unit-x",
    expectedTargetVersion: 1, sourceLinks: Array.from({ length: 32 }, (_, index) => link(200 + index)) };
  assert.throws(() => normalizeCourseSourceCommand(oversized),
    error => error.code === "course_source_links_too_large");
});

test("H1 recibo do pacote aceita 74 fatos e recusa 75", () => {
  const fact = (index) => ({ type: "save_anchor", subjectId: `anchor-${index}`, revision: 1 });
  const receipt = (count) => ({ contract: "aralearn.course-source-change.v1",
    courseId: "10000000-0000-4000-8000-000000000001", courseRevision: 2,
    requestId: "req-receipt-000001", idempotent: false, changed: count > 0,
    changes: Array.from({ length: count }, (_, index) => fact(index)) });
  const accepted = normalizeCourseSourceBundleChange(receipt(74));
  assert.equal(accepted.changes.length, 74);
  assert.ok(new TextEncoder().encode(JSON.stringify(accepted.changes)).byteLength < 262144,
    "os fatos do recibo cabem no orçamento de resposta");
  assert.throws(() => normalizeCourseSourceBundleChange(receipt(75)),
    error => error.code === "invalid_course_source_change");
});
