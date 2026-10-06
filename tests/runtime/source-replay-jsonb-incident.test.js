// Incidente H1: replay equivalente de manter_fonte duplicava Fonte e Âncora quando a
// leitura real devolvia objetos JSONB com ordem de chaves diferente do pedido.
// A comparação de equivalência passou a ser canônica (ordem de objeto invariante,
// ordem de array preservada) usando canonicalAuthoringValue.
import test from "node:test";
import assert from "node:assert/strict";
import { executeHumanCourseTask } from
  "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
import { normalizeCourseSourcesRead, createEmptyCourseSourceBibliographicMetadata } from
  "../../src/domain/courseSources.js";
import { courseDesignFixture } from "../helpers/courseDesignFixture.js";
import { defaultAuthoringProcessPreferences } from "../../src/domain/authoringProcessPreferences.js";

const COURSE_ID = "e52efb83-0006-4a7a-b96e-b8aefa009191";
const TITLE = "Curso sintético de replay";
const PRINCIPAL = Object.freeze({ actorId: "20000000-0000-4000-8000-000000000001",
  authenticationKind: "oauth", scopes: ["authoring:read", "authoring:write"] });
const NATIVE_BIBLIO_ORDER = ["doi", "isbn", "issn", "genre", "issue", "pages", "number", "volume",
  "editors", "publisher", "accessedDate", "articleNumber", "containerTitle", "publisherPlace"];
const EMPTY_BIBLIO = createEmptyCourseSourceBibliographicMetadata();
const reorderBiblio = (value) => Object.fromEntries(NATIVE_BIBLIO_ORDER.map((key) => [key, value?.[key] ?? (key === "editors" ? [] : null)]));
const reorderSelector = (selector) => selector === null || typeof selector !== "object" ? selector
  : Object.fromEntries(Object.keys(selector).slice().reverse().map((key) => [key, selector[key]]));

const METADADOS = Object.freeze({ tipo: "web_page", titulo: "Fonte sintética de replay",
  url: "https://example.org/replay-fixture", modoCitacao: "manual",
  citacao: "Fonte sintética de replay, sem valor bibliográfico real.", idioma: "pt-BR",
  disponibilidade: "aberta", verificacao: "nao_verificada", visibilidadeNoEstudo: "citacao_e_link" });
const ANCORA = Object.freeze({ seletor: { tipo: "trecho", trechoExato: "Trecho sintético de replay." },
  localizadorHumano: "trecho sintético" });

function createFixture() {
  const state = { sources: [], commands: [], revision: 7 };
  const catalogItem = (source) => ({
    sourceId: source.sourceId, revision: source.revision ?? 1, status: "active",
    kind: source.kind, defaultRoles: source.defaultRoles ?? [], title: source.title,
    authors: source.authors ?? [], publicationDate: source.publicationDate ?? null,
    identifier: source.identifier ?? null, language: source.language ?? null,
    citationMode: source.citationMode, citationText: source.citationText ?? null,
    bibliographic: reorderBiblio(source.bibliographic), url: source.url ?? null,
    editionOrVersion: source.editionOrVersion ?? null, origin: source.origin ?? "external",
    availability: source.availability ?? "unknown", verificationStatus: source.verificationStatus ?? "unverified",
    studyVisibility: source.studyVisibility ?? "hidden", publicFileAccess: "inherit",
    anchorCount: (source.anchors ?? []).length, createdAt: "2026-01-01T00:00:00+00:00"
  });
  const detailedItem = (source) => ({ ...catalogItem(source),
    anchors: (source.anchors ?? []).map((anchor) => ({ anchorId: anchor.anchorId,
      revision: anchor.revision ?? 1, sourceRevision: source.revision ?? 1, status: anchor.status ?? "active",
      selector: reorderSelector(anchor.selector), contentHash: anchor.contentHash ?? null,
      humanLocator: anchor.humanLocator ?? null, verificationExcerpt: anchor.verificationExcerpt ?? null,
      needsReverification: false, createdAt: "2026-01-01T00:00:00+00:00" })),
    attachments: [] });
  const dto = (mode, items, query) => ({ contract: "aralearn.course-sources.v3", courseId: COURSE_ID,
    courseRevision: state.revision, bibliographyStyle: "abnt-2025", mode, query,
    pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 67108864 }, items, nextCursor: null });
  const adapter = {
    publicAppUrl: "https://app.example/", revision: 7,
    async resolvePrincipal() { return PRINCIPAL; },
    async listCourses() { return { items: [{ courseId: COURSE_ID, title: TITLE, revision: state.revision }], hasMore: false, nextCursor: null }; },
    async getCourse({ courseId }) { return { courseId, revision: state.revision, title: TITLE }; },
    async getCourseInstructionalPlan() { return { courseRevision: state.revision, plan: { title: TITLE, parts: [] } }; },
    async getAuthoringProcessPreferences() { return { contract: "aralearn.authoring-process-preferences.v1",
      revision: 0, updatedAt: null, preferences: defaultAuthoringProcessPreferences() }; },
    async getCourseDesign(input) { return courseDesignFixture({ courseId: input.courseId, moduleId: "module",
      lessonId: "lesson", microsequenceId: "ms", studyUnitId: "unit-1" },
      { scope: input.scopeKind ?? "course", revision: state.revision }); },
    async listCourseStudyUnits() { return { items: [], hasMore: false, nextCursor: null }; },
    async getCourseSources(input) {
      if (input.mode === "source") {
        const source = state.sources.find((item) => item.sourceId === input.sourceId);
        return { items: source ? normalizeCourseSourcesRead(dto("source", [detailedItem(source)],
          { sourceId: input.sourceId, targetKind: null, targetId: null })).items : [], nextCursor: null };
      }
      if (input.mode === "target") return { items: [{ targetKind: input.targetKind, targetId: input.targetId, sourceLinks: [] }], nextCursor: null };
      return { items: normalizeCourseSourcesRead(dto("catalog", state.sources.map(catalogItem),
        { sourceId: null, targetKind: null, targetId: null })).items, nextCursor: null };
    },
    async executeCourseSourceCommand(request) {
      state.commands.push(structuredClone(request));
      const commands = request.command?.type === "apply_source_bundle" ? request.command.commands : [request.command];
      for (const command of commands) {
        if (command.type === "save_source") {
          const existing = state.sources.find((item) => item.sourceId === command.sourceId);
          if (!existing) state.sources.push({ sourceId: command.sourceId, revision: 1, status: "active",
            ...structuredClone(command.source), anchors: [] });
          else Object.assign(existing, structuredClone(command.source));
        }
        if (command.type === "save_anchor") {
          const source = state.sources.find((item) => item.sourceId === command.sourceId);
          if (source && !source.anchors.some((anchor) => anchor.anchorId === command.anchorId)) {
            source.anchors.push({ anchorId: command.anchorId, revision: 1, status: "active",
              selector: command.selector, contentHash: command.contentHash,
              humanLocator: command.humanLocator, verificationExcerpt: command.verificationExcerpt });
          }
        }
      }
      return { contract: "aralearn.course-source-change.v1", courseId: request.courseId,
        courseRevision: state.revision + 1, requestId: request.requestId, idempotent: false,
        changed: commands.length > 0, changes: commands.map((command) => ({ type: command.type,
          subjectId: command.sourceId ?? command.anchorId ?? command.targetId ?? "x", revision: 1 })) };
    }
  };
  return { adapter, state };
}

const run = (adapter, args) => executeHumanCourseTask({ adapter, principal: PRINCIPAL,
  name: "manter_fonte", rawArguments: { curso: TITLE, ...args } });
const saveSourceIds = (state) => state.commands.flatMap((request) =>
  (request.command?.type === "apply_source_bundle" ? request.command.commands : [request.command])
    .filter((command) => command.type === "save_source").map((command) => command.sourceId));
const saveAnchorIds = (state) => state.commands.flatMap((request) =>
  (request.command?.type === "apply_source_bundle" ? request.command.commands : [request.command])
    .filter((command) => command.type === "save_anchor").map((command) => command.anchorId));

test("a leitura real preserva a ordem JSONB do bibliographic", () => {
  const item = { sourceId: "s-1", revision: 1, status: "active", kind: "web_page", defaultRoles: [],
    title: "F", authors: [], publicationDate: null, identifier: null, language: "pt-BR",
    citationMode: "manual", citationText: "c", bibliographic: reorderBiblio(EMPTY_BIBLIO),
    url: "https://example.org/x", editionOrVersion: null, origin: "external", availability: "open_access",
    verificationStatus: "unverified", studyVisibility: "citation_and_link", publicFileAccess: "inherit",
    anchorCount: 0, createdAt: "2026-01-01T00:00:00+00:00" };
  const read = normalizeCourseSourcesRead({ contract: "aralearn.course-sources.v3", courseId: COURSE_ID,
    courseRevision: 7, bibliographyStyle: "abnt-2025", mode: "catalog",
    query: { sourceId: null, targetKind: null, targetId: null },
    pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 67108864 }, items: [item], nextCursor: null });
  assert.deepEqual(Object.keys(read.items[0].bibliographic), NATIVE_BIBLIO_ORDER,
    "o normalizador da leitura não reordena o objeto JSONB");
});

test("replay idêntico reconcilia a fonte mesmo com bibliographic em ordem JSONB", async () => {
  const { adapter, state } = createFixture();
  await run(adapter, { metadados: METADADOS, ancoras: [ANCORA] });
  const firstId = state.sources[0].sourceId;
  state.commands.length = 0;
  await run(adapter, { metadados: METADADOS, ancoras: [ANCORA] });
  assert.equal(state.sources.length, 1, "a repetição idêntica não cria uma segunda Fonte");
  assert.deepEqual(saveSourceIds(state), [firstId], "a segunda chamada reusa a identidade da Fonte");
  assert.equal(state.sources[0].anchors.length, 1, "a âncora não é duplicada");
});

test("replay idêntico reusa a âncora com fonte explícita e seletor em ordem JSONB", async () => {
  const { adapter, state } = createFixture();
  state.sources.push({ sourceId: "s-1", revision: 1, status: "active", kind: "web_page", defaultRoles: [],
    title: METADADOS.titulo, authors: [], publicationDate: null, identifier: null, language: "pt-BR",
    citationMode: "manual", citationText: METADADOS.citacao, bibliographic: EMPTY_BIBLIO,
    url: METADADOS.url, editionOrVersion: null, origin: "external", availability: "open_access",
    verificationStatus: "unverified", studyVisibility: "citation_and_link",
    anchors: [{ anchorId: "a-1", revision: 1, status: "active",
      selector: { kind: "text_quote", exact: ANCORA.seletor.trechoExato, prefix: null, suffix: null },
      contentHash: null, humanLocator: ANCORA.localizadorHumano, verificationExcerpt: null }] });
  await run(adapter, { fonte: 1, ancoras: [ANCORA] });
  state.commands.length = 0;
  await run(adapter, { fonte: 1, ancoras: [ANCORA] });
  assert.deepEqual(saveAnchorIds(state), ["a-1"], "a âncora existente é reusada pelo identificador");
  assert.equal(state.sources[0].anchors.length, 1, "nenhuma âncora nova é criada");
});

test("ordem de autores é significativa: mesma ordem reconcilia, ordem trocada cria nova ficha", async () => {
  const { adapter, state } = createFixture();
  const autores = (first, second) => [{ sobrenome: first }, { sobrenome: second }];
  await run(adapter, { metadados: { ...METADADOS, autores: autores("Alfa", "Beta") } });
  const firstId = state.sources[0].sourceId;
  state.commands.length = 0;
  await run(adapter, { metadados: { ...METADADOS, autores: autores("Alfa", "Beta") } });
  assert.deepEqual(saveSourceIds(state), [firstId], "mesma ordem de autores reusa a Fonte");
  state.commands.length = 0;
  await run(adapter, { metadados: { ...METADADOS, autores: autores("Beta", "Alfa") } });
  assert.notDeepEqual(saveSourceIds(state), [firstId], "ordem de autores diferente cria outra Ficha");
  assert.equal(state.sources.length, 2);
});

test("edição distinta permanece ficha distinta", async () => {
  const { adapter, state } = createFixture();
  await run(adapter, { metadados: { ...METADADOS, edicaoOuVersao: "1" } });
  const firstId = state.sources[0].sourceId;
  state.commands.length = 0;
  await run(adapter, { metadados: { ...METADADOS, edicaoOuVersao: "2" } });
  assert.notDeepEqual(saveSourceIds(state), [firstId], "edição diferente é outra Ficha");
  assert.equal(state.sources.length, 2);
});

test("duas fontes equivalentes já existentes recusam com 409 sem gravar", async () => {
  const { adapter, state } = createFixture();
  const base = { revision: 1, status: "active", kind: "web_page", defaultRoles: [], title: METADADOS.titulo,
    authors: [], publicationDate: null, identifier: null, language: "pt-BR", citationMode: "manual",
    citationText: METADADOS.citacao, bibliographic: EMPTY_BIBLIO, url: METADADOS.url, editionOrVersion: null,
    origin: "external", availability: "open_access", verificationStatus: "unverified",
    studyVisibility: "citation_and_link", anchors: [] };
  state.sources.push({ sourceId: "s-1", ...base }, { sourceId: "s-2", ...base });
  await assert.rejects(() => run(adapter, { metadados: METADADOS }),
    (error) => error.code === "ambiguous_human_reference" && error.status === 409);
  assert.equal(state.commands.length, 0, "o conflito ambíguo não grava nada");
});
