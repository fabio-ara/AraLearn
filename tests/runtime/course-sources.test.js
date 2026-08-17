import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  COURSE_DESIGN_CONTEXT_V2_CONTRACT,
  COURSE_SOURCE_ATTRIBUTION_APPLICATION_CONTRACT,
  CourseSourcesError,
  normalizeCourseSourceAttributionApplication,
  normalizeCourseSourceCommand,
  normalizeCourseSourceContext,
  normalizeCourseSourceLinks,
  normalizeCourseSourceSelector,
  normalizeCourseSourcesRead,
  normalizeCourseStudyCitationsRead,
  normalizeSourceAttributionApplications
} from "../../src/domain/courseSources.js";

const IDS = {
  course: "10000000-0000-4000-8000-000000000001",
  part: "10000000-0000-4000-8000-000000000002",
  planItem: "10000000-0000-4000-8000-000000000003",
  attribution: "10000000-0000-4000-8000-000000000004"
};
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function anchor(anchorId = "anchor-a", anchorRevision = 1) {
  return { anchorId, anchorRevision };
}

function sourceLink(overrides = {}) {
  return {
    sourceId: "source-a",
    sourceRevision: 1,
    relation: "supported_by",
    anchors: [anchor()],
    ...overrides
  };
}

test("normaliza comandos fechados, metadados e seletores exatos", () => {
  assert.deepEqual(normalizeCourseSourceCommand({
    type: "save_source",
    sourceId: "source-a",
    expectedSourceRevision: 0,
    source: {
      kind: "article",
      title: "Artigo de referência",
      citationText: "AUTOR. Artigo de referência.",
      url: "https://example.test/article",
      editionOrVersion: null,
      studyVisibility: "citation_and_link"
    }
  }).source.studyVisibility, "citation_and_link");

  assert.deepEqual(normalizeCourseSourceSelector({
    kind: "text_quote",
    exact: " trecho\nexato ",
    prefix: null,
    suffix: "continuação"
  }), {
    kind: "text_quote",
    exact: " trecho\nexato ",
    prefix: null,
    suffix: "continuação"
  });

  assert.throws(
    () => normalizeCourseSourceCommand({
      type: "save_source",
      sourceId: "source-a",
      expectedSourceRevision: 0,
      source: {
        kind: "article",
        title: "Artigo",
        citationText: null,
        url: null,
        editionOrVersion: null,
        studyVisibility: "citation"
      }
    }),
    (error) => error instanceof CourseSourcesError &&
      error.code === "invalid_course_source"
  );
  assert.throws(
    () => normalizeCourseSourceSelector({
      kind: "time_range",
      startMilliseconds: 10,
      endMilliseconds: 10
    }),
    (error) => error.code === "invalid_course_source_selector"
  );

  const legacyIdentity = `  ${"fonte-ç".repeat(36)}  `;
  assert.equal(normalizeCourseSourceCommand({
    type: "save_source",
    sourceId: legacyIdentity,
    expectedSourceRevision: 1,
    source: {
      kind: "document",
      title: "Documento legado resolvido",
      citationText: null,
      url: null,
      editionOrVersion: null,
      studyVisibility: "hidden"
    }
  }).sourceId, legacyIdentity);

  const astralLegacyIdentity = "🔎".repeat(2_048);
  assert.equal(normalizeCourseSourceCommand({
    type: "save_source",
    sourceId: astralLegacyIdentity,
    expectedSourceRevision: 1,
    source: {
      kind: "document",
      title: "Documento astral preservado",
      citationText: null,
      url: null,
      editionOrVersion: null,
      studyVisibility: "hidden"
    }
  }).sourceId, astralLegacyIdentity);
  assert.throws(
    () => normalizeCourseSourceLinks([
      sourceLink({ sourceId: "🔎".repeat(2_049) })
    ]),
    (error) => error.code === "invalid_course_source_id"
  );
  assert.throws(
    () => normalizeCourseSourceLinks([
      sourceLink({ sourceId: "界".repeat(2_049) })
    ]),
    (error) => error.code === "invalid_course_source_id"
  );
  assert.equal(normalizeCourseSourceCommand({
    type: "save_anchor",
    anchorId: "anchor-legacy",
    sourceId: legacyIdentity,
    sourceRevision: 2,
    expectedAnchorRevision: 0,
    selector: { kind: "page_range", startPage: 1, endPage: 1 },
    verificationExcerpt: null
  }).sourceId, legacyIdentity);
});

test("limites textuais de Fontes contam escalares Unicode e preservam o teto em bytes", () => {
  const sourceCommand = (title) => ({
    type: "save_source",
    sourceId: "source-unicode",
    expectedSourceRevision: 0,
    source: {
      kind: "document",
      title,
      citationText: null,
      url: null,
      editionOrVersion: null,
      studyVisibility: "hidden"
    }
  });
  assert.equal(
    normalizeCourseSourceCommand(sourceCommand("🔎".repeat(300))).source.title,
    "🔎".repeat(300)
  );
  assert.throws(
    () => normalizeCourseSourceCommand(sourceCommand("🔎".repeat(301))),
    (error) => error.code === "invalid_course_source"
  );

  const anchorCommand = ({ exact, verificationExcerpt }) => ({
    type: "save_anchor",
    anchorId: "anchor-unicode",
    sourceId: "source-unicode",
    sourceRevision: 1,
    expectedAnchorRevision: 0,
    selector: { kind: "text_quote", exact, prefix: null, suffix: null },
    verificationExcerpt
  });
  assert.deepEqual(
    normalizeCourseSourceCommand(anchorCommand({
      exact: "🔎".repeat(4_000),
      verificationExcerpt: "🧭".repeat(2_000)
    })).selector,
    {
      kind: "text_quote",
      exact: "🔎".repeat(4_000),
      prefix: null,
      suffix: null
    }
  );
  assert.throws(
    () => normalizeCourseSourceCommand(anchorCommand({
      exact: "🔎".repeat(4_001),
      verificationExcerpt: null
    })),
    (error) => error.code === "invalid_course_source_selector"
  );
  assert.throws(
    () => normalizeCourseSourceCommand(anchorCommand({
      exact: "trecho",
      verificationExcerpt: "🧭".repeat(2_001)
    })),
    (error) => error.code === "invalid_course_source_command"
  );
});

test("controles de layout seguem a mesma semântica textual do SQL", () => {
  const sourceCommand = (overrides = {}) => ({
    type: "save_source",
    sourceId: "source-controls",
    expectedSourceRevision: 0,
    source: {
      kind: "document",
      title: "Documento controlado",
      citationText: "Linha 1\nLinha 2\tcontinua\rfinal",
      url: null,
      editionOrVersion: "2ª edição",
      studyVisibility: "citation",
      ...overrides
    }
  });
  assert.equal(
    normalizeCourseSourceCommand(sourceCommand()).source.citationText,
    "Linha 1\nLinha 2\tcontinua\rfinal"
  );
  assert.throws(
    () => normalizeCourseSourceCommand(sourceCommand({ title: "Título\nquebrado" })),
    (error) => error.code === "invalid_course_source"
  );
  assert.throws(
    () => normalizeCourseSourceCommand(sourceCommand({ editionOrVersion: "2ª\tedição" })),
    (error) => error.code === "invalid_course_source"
  );
  assert.throws(
    () => normalizeCourseSourceSelector({ kind: "uri_fragment", fragment: "parte\nlinha" }),
    (error) => error.code === "invalid_course_source_selector"
  );
  assert.throws(
    () => normalizeCourseSourceSelector({ kind: "uri_fragment", fragment: " parte" }),
    (error) => error.code === "invalid_course_source_selector"
  );
  assert.deepEqual(normalizeCourseSourceSelector({
    kind: "text_quote",
    exact: " \tlinha 1\r\nlinha 2 ",
    prefix: "antes\tcontexto",
    suffix: "depois\ncontexto"
  }), {
    kind: "text_quote",
    exact: " \tlinha 1\r\nlinha 2 ",
    prefix: "antes\tcontexto",
    suffix: "depois\ncontexto"
  });
  assert.throws(
    () => normalizeCourseSourceSelector({
      kind: "text_quote",
      exact: "trecho",
      prefix: " antes",
      suffix: null
    }),
    (error) => error.code === "invalid_course_source_selector"
  );
  assert.equal(normalizeCourseSourceCommand({
    type: "save_anchor",
    anchorId: "anchor-controls",
    sourceId: "source-controls",
    sourceRevision: 1,
    expectedAnchorRevision: 0,
    selector: { kind: "page_range", startPage: 1, endPage: 1 },
    verificationExcerpt: " \ttrecho\r\nconferido "
  }).verificationExcerpt, " \ttrecho\r\nconferido ");
  assert.throws(
    () => normalizeCourseSourceCommand({
      type: "save_anchor",
      anchorId: "anchor-controls",
      sourceId: "source-controls",
      sourceRevision: 1,
      expectedAnchorRevision: 0,
      selector: { kind: "page_range", startPage: 1, endPage: 1 },
      verificationExcerpt: "trecho\u0001inválido"
    }),
    (error) => error.code === "invalid_course_source_command"
  );
});

test("vínculos novos exigem relação, Âncora e unicidade; legado preserva ordem e duplicata", () => {
  assert.deepEqual(normalizeCourseSourceLinks([sourceLink()]), [sourceLink()]);
  assert.throws(
    () => normalizeCourseSourceLinks([sourceLink({ anchors: [] })]),
    (error) => error.code === "invalid_course_source_link"
  );
  assert.throws(
    () => normalizeCourseSourceLinks([sourceLink(), sourceLink()]),
    (error) => error.code === "duplicate_course_source_link"
  );
  assert.throws(
    () => normalizeCourseSourceLinks([sourceLink({ relation: "legacy_reference" })]),
    (error) => error.code === "invalid_course_source_link"
  );

  const legacy = [
    sourceLink({
      sourceId: "  Referência ç  ",
      relation: "legacy_reference",
      anchors: []
    }),
    sourceLink({
      sourceId: "  Referência ç  ",
      relation: "legacy_reference",
      anchors: []
    })
  ];
  assert.deepEqual(
    normalizeCourseSourceLinks(legacy, { allowLegacyIds: true }),
    legacy
  );
  assert.throws(
    () => normalizeCourseSourceLinks([
      sourceLink({ sourceId: "legado\ninválido" })
    ], { allowLegacyIds: true }),
    (error) => error.code === "invalid_course_source_id"
  );
  const resolvedLegacyIdentity = `  ${"fonte-ç".repeat(36)}  `;
  assert.equal(normalizeCourseSourceLinks([
    sourceLink({ sourceId: resolvedLegacyIdentity })
  ])[0].sourceId, resolvedLegacyIdentity);
});

test("composição e materialização exigem aplicações explícitas e contrato v1", () => {
  assert.deepEqual(normalizeSourceAttributionApplications([{
    studyUnitId: "study-a",
    sourceLinks: []
  }]), [{ studyUnitId: "study-a", sourceLinks: [] }]);
  assert.throws(
    () => normalizeSourceAttributionApplications([
      { studyUnitId: "study-a", sourceLinks: [] },
      { studyUnitId: "study-a", sourceLinks: [] }
    ]),
    (error) => error.code === "duplicate_course_source_attribution_application"
  );

  const application = {
    contract: COURSE_SOURCE_ATTRIBUTION_APPLICATION_CONTRACT,
    contextHash: HASH_A,
    didacticMicrosequenceId: "micro-a",
    studyUnits: [{ studyUnitId: "study-a", sourceLinks: [] }]
  };
  assert.deepEqual(normalizeCourseSourceAttributionApplication(application), application);
  assert.throws(
    () => normalizeCourseSourceAttributionApplication({
      ...application,
      contract: "aralearn.course-source-attribution-application.v0"
    }),
    (error) => error.code === "invalid_course_source_attribution_application"
  );
  assert.throws(
    () => normalizeCourseSourceAttributionApplication({
      ...application,
      studyUnits: null
    }),
    (error) => error.code === "invalid_course_source_attribution_application"
  );
});

test("contexto v2 sela somente hashes e refs compactos com relação", () => {
  const context = {
    contract: COURSE_DESIGN_CONTEXT_V2_CONTRACT,
    courseId: IDS.course,
    courseRevision: 3,
    authoringPartId: IDS.part,
    componentCatalogVersion: "1-3e5629f8",
    instructionalAnalysisUnits: [],
    evidenceRequirements: [],
    guidanceRevisions: [],
    targets: [{
      didacticMicrosequenceId: "micro-a",
      sourceAttributions: {
        instructionalAnalysisUnits: [{
          planItemId: IDS.planItem,
          planItemVersion: 2,
          targetHash: HASH_A,
          attributionRevision: 1,
          attributionHash: HASH_B,
          sources: [{
            sourceId: "source-a",
            sourceRevision: 2,
            relation: "adapted_from",
            sourceHash: HASH_A,
            anchors: [{
              anchorId: "anchor-a",
              anchorRevision: 3,
              anchorHash: HASH_B
            }]
          }]
        }],
        evidenceRequirements: []
      }
    }]
  };
  assert.deepEqual(normalizeCourseSourceContext(context), context);
  assert.throws(
    () => normalizeCourseSourceContext({
      ...context,
      contract: "aralearn.course-design-context.v1"
    }),
    (error) => error.code === "invalid_course_source_context"
  );
});

test("read owner discrimina modo/cursor e Study reconstrói DTO redigido", () => {
  const createdAt = "2026-08-17T12:00:00.000Z";
  const catalog = {
    contract: "aralearn.course-sources.v1",
    courseId: IDS.course,
    courseRevision: 2,
    mode: "catalog",
    query: { sourceId: null, targetKind: null, targetId: null },
    items: [{
      sourceId: "  Referência ç  ",
      revision: 1,
      status: "unresolved_legacy",
      kind: null,
      title: null,
      citationText: null,
      url: null,
      editionOrVersion: null,
      studyVisibility: "hidden",
      anchorCount: 0,
      createdAt
    }],
    nextCursor: "eyJtIjoiY2F0YWxvZyIsIm8iOjI0fQ=="
  };
  assert.deepEqual(normalizeCourseSourcesRead(catalog), catalog);
  assert.throws(
    () => normalizeCourseSourcesRead({ ...catalog, nextCursor: "cursor:cru" }),
    (error) => error.code === "invalid_course_sources_read"
  );

  const target = {
    ...catalog,
    mode: "target",
    query: { sourceId: null, targetKind: "study_unit", targetId: "study-a" },
    items: [{
      attributionId: IDS.attribution,
      targetKind: "study_unit",
      targetId: "study-a",
      targetVersion: 1,
      targetHash: HASH_A,
      revision: 1,
      sourceLinks: [],
      actorId: null,
      createdAt,
      effective: true
    }],
    nextCursor: null
  };
  assert.deepEqual(normalizeCourseSourcesRead(target), target);

  const contextualSource = {
    ...catalog,
    mode: "source",
    query: {
      sourceId: "source-a",
      targetKind: "study_unit",
      targetId: "study-a"
    },
    items: [{
      sourceId: "source-a",
      revision: 105,
      status: "active",
      kind: "document",
      title: "Fonte pinada",
      citationText: "AUTOR. Fonte pinada.",
      url: null,
      editionOrVersion: null,
      studyVisibility: "citation",
      anchorCount: 1,
      createdAt,
      actorId: null,
      anchors: [{
        anchorId: "anchor-a",
        revision: 1,
        sourceRevision: 105,
        status: "active",
        selector: { kind: "page_range", startPage: 3, endPage: 4 },
        verificationExcerpt: null,
        actorId: null,
        createdAt
      }]
    }],
    nextCursor: null
  };
  assert.deepEqual(normalizeCourseSourcesRead(contextualSource), contextualSource);
  assert.throws(
    () => normalizeCourseSourcesRead({
      ...contextualSource,
      items: [...contextualSource.items, ...contextualSource.items]
    }),
    (error) => error.code === "invalid_course_sources_read"
  );
  assert.throws(
    () => normalizeCourseSourcesRead({ ...contextualSource, nextCursor: "YWZ0ZXI=" }),
    (error) => error.code === "invalid_course_sources_read"
  );

  const citations = {
    contract: "aralearn.course-study-citations.v1",
    courseId: IDS.course,
    courseRevision: 2,
    studyUnitId: "study-a",
    citations: [{
      sourceId: "source-a",
      sourceRevision: 1,
      title: "Artigo",
      citationText: "AUTOR. Artigo.",
      url: null,
      editionOrVersion: null,
      anchors: [{
        anchorId: "anchor-a",
        anchorRevision: 1,
        selector: { kind: "page_range", startPage: 3, endPage: 4 }
      }]
    }]
  };
  assert.deepEqual(normalizeCourseStudyCitationsRead(citations), citations);
  const legacyCitations = {
    ...citations,
    citations: Array.from({ length: 128 }, () => citations.citations[0])
  };
  assert.equal(
    normalizeCourseStudyCitationsRead(legacyCitations).citations.length,
    128
  );
  assert.throws(
    () => normalizeCourseStudyCitationsRead({
      ...legacyCitations,
      citations: [...legacyCitations.citations, citations.citations[0]]
    }),
    (error) => error.code === "invalid_course_study_citations"
  );
  assert.throws(
    () => normalizeCourseStudyCitationsRead({
      ...citations,
      citations: [{ ...citations.citations[0], actorId: IDS.course }]
    }),
    (error) => error.code === "invalid_course_study_citations"
  );
});

test("domínio de Fontes e mirror Edge permanecem byte a byte idênticos", async () => {
  const [browser, edge] = await Promise.all([
    readFile(new URL("../../src/domain/courseSources.js", import.meta.url), "utf8"),
    readFile(new URL(
      "../../supabase/functions/_shared/aralearn/runtime/domain/courseSources.js",
      import.meta.url
    ), "utf8")
  ]);
  assert.equal(edge, browser);
});
