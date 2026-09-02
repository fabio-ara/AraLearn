import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CourseSourcesError,
  normalizeCourseSourceAttachment,
  normalizeCourseSourcePdfDownload,
  normalizeCourseSourceCommand,
  normalizeCourseSourceChange,
  normalizeCourseSourcePdfIngestion,
  normalizeCourseSourcePdfIngestionPreparation,
  normalizeCourseSourcePdfIngestionRequest,
  normalizeCourseSourcePdfSourceIntent,
  normalizeCourseSourceLinks,
  normalizeCourseSourceSelector,
  normalizeCourseSourcesRead,
  normalizeCourseStudyCitationsRead,
} from "../../src/domain/courseSources.js";

const IDS = {
  course: "10000000-0000-4000-8000-000000000001",
  part: "10000000-0000-4000-8000-000000000002",
  planItem: "10000000-0000-4000-8000-000000000003"
};
const HASH_A = "a".repeat(64);

function anchor(anchorId = "anchor-a") {
  return { anchorId };
}

function sourceLink(overrides = {}) {
  return {
    sourceId: "source-a",
    relation: "supported_by",
    anchors: [anchor()],
    ...overrides
  };
}

function attachment(overrides = {}) {
  return {
    contentHash: HASH_A,
    byteSize: 1_024,
    mediaType: "application/pdf",
    storagePath: `${IDS.course}/${HASH_A}.pdf`,
    ...overrides
  };
}

function sourceDocument(overrides = {}) {
  return {
    kind: "article",
    title: "Artigo de referência",
    authorship: "Autoria",
    publicationDate: "2026-08",
    identifier: "doi:10.0000/exemplo",
    language: "pt-BR",
    citationText: "AUTORIA. Artigo de referência.",
    url: "https://example.test/article",
    editionOrVersion: null,
    origin: "external",
    availability: "open_access",
    verificationStatus: "author_verified",
    studyVisibility: "citation_and_link",
    ...overrides
  };
}

function pdfStorage(uniqueBytes = 0) {
  return { uniqueBytes, maxUniqueBytes: 64 * 1024 * 1024 };
}

test("ingestão de PDF fecha intenção bibliográfica, preparação e resultado factual", () => {
  const existing = {
    mode: "existing",
    sourceId: "source-a",
    sourceRevision: 2
  };
  assert.deepEqual(normalizeCourseSourcePdfSourceIntent(existing), existing);
  const save = {
    mode: "save",
    sourceId: null,
    expectedSourceRevision: 0,
    source: sourceDocument({
      authorship: null,
      publicationDate: null,
      identifier: null,
      language: null,
      citationText: null,
      url: null,
      studyVisibility: "hidden"
    })
  };
  assert.deepEqual(normalizeCourseSourcePdfIngestionRequest({
    courseId: IDS.course,
    expectedCourseRevision: 7,
    requestId: "request-pdf-ingestion-1",
    sourceIntent: save
  }).sourceIntent, save);
  assert.deepEqual(normalizeCourseSourcePdfSourceIntent({
    mode: "save",
    sourceId: null,
    expectedSourceRevision: 0,
    source: { title: "Edital Dataprev 2026" }
  }), {
    mode: "save",
    sourceId: null,
    expectedSourceRevision: 0,
    source: {
      kind: "document",
      title: "Edital Dataprev 2026",
      authorship: null,
      publicationDate: null,
      identifier: null,
      language: null,
      citationText: null,
      url: null,
      editionOrVersion: null,
      origin: "author_provided",
      availability: "unknown",
      verificationStatus: "unverified",
      studyVisibility: "hidden"
    }
  });
  assert.throws(
    () => normalizeCourseSourcePdfSourceIntent({
      mode: "save",
      sourceId: "source-a",
      expectedSourceRevision: 1,
      source: { title: "Título novo sem o estado anterior" }
    }),
    (error) => error.code === "invalid_course_source"
  );
  assert.deepEqual(normalizeCourseSourcePdfSourceIntent({
    mode: "save",
    sourceId: "source-a",
    expectedSourceRevision: 1,
    source: sourceDocument()
  }).source, sourceDocument());
  assert.throws(
    () => normalizeCourseSourcePdfSourceIntent({
      ...save,
      expectedSourceRevision: 1
    }),
    (error) => error.code === "invalid_course_source_pdf_ingestion"
  );
  assert.throws(
    () => normalizeCourseSourcePdfSourceIntent({
      ...save,
      source: { ...save.source, author: "Autoria inventada" }
    }),
    (error) => error.code === "invalid_course_source"
  );

  const preparation = {
    contract: "aralearn.course-source-pdf-ingestion-preparation.v1",
    courseId: IDS.course,
    courseRevision: 7,
    requestId: "request-pdf-ingestion-1",
    sourceId: "source-a",
    sourceRevision: 2,
    attachment: attachment(),
    uploadRequired: true,
    alreadyLinked: false
  };
  assert.deepEqual(
    normalizeCourseSourcePdfIngestionPreparation(preparation),
    preparation
  );
  const inheritedPreparation = {
    ...preparation,
    attachment: {
      ...preparation.attachment,
      storagePath: `${IDS.part}/${HASH_A}.pdf`
    },
    uploadRequired: false,
    alreadyLinked: true
  };
  assert.deepEqual(
    normalizeCourseSourcePdfIngestionPreparation(inheritedPreparation),
    inheritedPreparation
  );
  const removedBytesPreparation = {
    ...inheritedPreparation,
    uploadRequired: true
  };
  assert.deepEqual(
    normalizeCourseSourcePdfIngestionPreparation(removedBytesPreparation),
    removedBytesPreparation
  );

  const result = {
    contract: "aralearn.course-source-pdf-ingestion.v1",
    courseId: IDS.course,
    courseRevision: 8,
    requestId: "request-pdf-ingestion-1",
    idempotent: false,
    changed: true,
    change: { type: "ingest_pdf", subjectId: "source-a", revision: 2 },
    source: {
      sourceId: "source-a",
      sourceRevision: 2,
      bibliographyChanged: false
    },
    attachment: attachment(),
    stored: true
  };
  assert.deepEqual(normalizeCourseSourcePdfIngestion(result), result);
  assert.throws(
    () => normalizeCourseSourcePdfIngestion({
      ...result,
      stored: false
    }),
    (error) => error.code === "invalid_course_source_pdf_ingestion"
  );
  assert.throws(
    () => normalizeCourseSourcePdfIngestion({
      ...result,
      change: { ...result.change, subjectId: "source-b" }
    }),
    (error) => error.code === "invalid_course_source_pdf_ingestion"
  );
});

test("PDF usa ingestão server-side e expõe somente download autorizado", () => {
  assert.deepEqual(normalizeCourseSourceAttachment(attachment()), attachment());
  assert.throws(() => normalizeCourseSourceCommand({
    type: "attach_pdf",
    sourceId: "source-a",
    sourceRevision: 2,
    attachment: attachment()
  }), (error) => error.code === "invalid_course_source_command");
  assert.deepEqual(normalizeCourseSourceCommand({
    type: "remove_pdf",
    sourceId: "source-a",
    expectedSourceRevision: 2,
    contentHash: HASH_A
  }), {
    type: "remove_pdf",
    sourceId: "source-a",
    expectedSourceRevision: 2,
    contentHash: HASH_A
  });
  const download = {
    contract: "aralearn.course-source-pdf-download.v1",
    courseId: IDS.course,
    courseRevision: 7,
    sourceId: "source-a",
    sourceRevision: 2,
    storageOriginCourseId: IDS.course,
    attachment: attachment({
      createdAt: "2026-08-20T12:00:00.000Z"
    }),
    signedUrl: `https://storage.example.test/object/${HASH_A}.pdf?token=sealed`,
    expiresAt: "2026-08-20T12:01:00.000Z"
  };
  assert.deepEqual(normalizeCourseSourcePdfDownload(download), download);
  assert.throws(
    () => normalizeCourseSourcePdfDownload({
      ...download,
      storageOriginCourseId: "10000000-0000-4000-8000-000000000099"
    }),
    (error) => error.code === "invalid_course_source_pdf_download"
  );
  assert.throws(
    () => normalizeCourseSourcePdfDownload({ ...download, signedUrl: null }),
    (error) => error.code === "invalid_course_source_pdf_download"
  );
});


test("normaliza comandos fechados, metadados e seletores exatos", () => {
  assert.deepEqual(normalizeCourseSourceCommand({
    type: "save_source",
    sourceId: "source-a",
    expectedSourceRevision: 0,
    source: sourceDocument()
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
      source: sourceDocument({ title: "Artigo", citationText: null, url: null,
        studyVisibility: "citation" })
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

  for (const invalidSourceId of [`  ${"fonte-ç".repeat(36)}  `, "🔎".repeat(241)]) {
    assert.throws(() => normalizeCourseSourceCommand({
      type: "save_source",
      sourceId: invalidSourceId,
      expectedSourceRevision: 1,
      source: sourceDocument()
    }), (error) => error.code === "invalid_course_source_id");
  }
  assert.throws(
    () => normalizeCourseSourceLinks([
      sourceLink({ sourceId: "界".repeat(241) })
    ]),
    (error) => error.code === "invalid_course_source_id"
  );
  assert.throws(() => normalizeCourseSourceCommand({
    type: "save_source",
    sourceId: "source-imported",
    expectedSourceRevision: 1,
    source: sourceDocument({ origin: "imported_legacy" })
  }), (error) => error.code === "invalid_course_source");
});

test("metadados estruturados aceitam precisão declarada e rejeitam valores inventados", () => {
  const heterogeneousSources = [{
    kind: "article",
    citationText: "ARA, F. Fontes educacionais auditáveis. Revista Exemplo, v. 2, 2026.",
    overrides: {}
  }, {
    kind: "book",
    citationText: "ARA, F. Manual do AraLearn. 2. ed. 2026.",
    overrides: { editionOrVersion: "2ª edição" }
  }, {
    kind: "document",
    citationText: "ARA, F. Proveniência no ensino [slides]. Encontro Exemplo, 2026.",
    overrides: { identifier: null, url: null, availability: "private" }
  }, {
    kind: "web_page",
    citationText: "AraLearn. Guia de Fontes. 2026. Disponível em: https://example.test/guia.",
    overrides: { identifier: null, url: "https://example.test/guia" }
  }, {
    kind: "document",
    citationText: "Material de síntese fornecido pela pessoa autora; não publicado.",
    overrides: {
      authorship: null,
      publicationDate: null,
      identifier: null,
      url: null,
      origin: "author_provided",
      availability: "private"
    }
  }, {
    kind: "media",
    citationText: "Imagem sem autoria ou data declaradas, fornecida pela pessoa autora.",
    overrides: {
      authorship: null,
      publicationDate: null,
      identifier: null,
      url: null,
      origin: "author_provided",
      availability: "private"
    }
  }];
  for (const [index, entry] of heterogeneousSources.entries()) {
    const normalized = normalizeCourseSourceCommand({
      type: "save_source",
      sourceId: `source-kind-${index}`,
      expectedSourceRevision: 0,
      source: sourceDocument({
        kind: entry.kind,
        citationText: entry.citationText,
        ...entry.overrides
      })
    });
    assert.equal(normalized.source.citationText, entry.citationText);
  }
  assert.throws(
    () => normalizeCourseSourceCommand({
      type: "save_source",
      sourceId: "source-visible-without-reference",
      expectedSourceRevision: 0,
      source: sourceDocument({ citationText: null, studyVisibility: "citation" })
    }),
    (error) => error.code === "invalid_course_source"
  );
  for (const publicationDate of ["0001", "2026", "2026-08", "2024-02-29"]) {
    assert.equal(normalizeCourseSourceCommand({
      type: "save_source",
      sourceId: `source-date-${publicationDate}`,
      expectedSourceRevision: 0,
      source: sourceDocument({ publicationDate })
    }).source.publicationDate, publicationDate);
  }
  for (const language of ["pt", "pt-BR", "sr-Latn", "zh-Hant-TW", "es-419"]) {
    assert.equal(normalizeCourseSourceCommand({
      type: "save_source",
      sourceId: `source-language-${language}`,
      expectedSourceRevision: 0,
      source: sourceDocument({ language })
    }).source.language, language);
  }
  for (const publicationDate of ["0000", "2026-00", "2026-13", "2026-02-29", "2024-02-30"]) {
    assert.throws(
      () => normalizeCourseSourceCommand({
        type: "save_source",
        sourceId: "source-invalid-date",
        expectedSourceRevision: 0,
        source: sourceDocument({ publicationDate })
      }),
      (error) => error.code === "invalid_course_source"
    );
  }
  for (const language of ["pt_BR", "portuguese", "p", "pt-brasil!"]) {
    assert.throws(
      () => normalizeCourseSourceCommand({
        type: "save_source",
        sourceId: "source-invalid-language",
        expectedSourceRevision: 0,
        source: sourceDocument({ language })
      }),
      (error) => error.code === "invalid_course_source"
    );
  }
  assert.throws(
    () => normalizeCourseSourceCommand({
      type: "save_source",
      sourceId: "source-without-origin",
      expectedSourceRevision: 0,
      source: { ...sourceDocument(), origin: undefined }
    }),
    (error) => error.code === "invalid_course_source"
  );

  const locatedAnchor = normalizeCourseSourceCommand({
    type: "save_anchor",
    anchorId: "anchor-human-locator",
    sourceId: "source-book",
    sourceRevision: 1,
    expectedAnchorRevision: 0,
    selector: { kind: "page_range", startPage: 42, endPage: 44 },
    humanLocator: "Capítulo 3 · Seção 2.1 · Figura 5",
    verificationExcerpt: null
  });
  assert.equal(locatedAnchor.humanLocator, "Capítulo 3 · Seção 2.1 · Figura 5");
  assert.throws(
    () => normalizeCourseSourceCommand({
      ...locatedAnchor,
      humanLocator: "Slide 12\nmetadado inventado"
    }),
    (error) => error.code === "invalid_course_source_command"
  );
});

test("relações de proveniência preservam as vigentes e expressam o uso factual", () => {
  for (const relation of [
    "informed_by", "supported_by", "adapted_from", "quoted_from",
    "contrasted_with", "exemplified_by", "inspired_by", "needs_verification"
  ]) {
    assert.equal(normalizeCourseSourceLinks([
      sourceLink({ relation })
    ])[0].relation, relation);
  }
  assert.throws(
    () => normalizeCourseSourceLinks([sourceLink({ relation: "related_to" })]),
    (error) => error.code === "invalid_course_source_link"
  );
});

test("limites textuais de Fontes contam escalares Unicode e preservam o teto em bytes", () => {
  const sourceCommand = (title) => ({
    type: "save_source",
    sourceId: "source-unicode",
    expectedSourceRevision: 0,
    source: sourceDocument({ kind: "document", title, citationText: null, url: null,
      studyVisibility: "hidden" })
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
    source: sourceDocument({
      kind: "document", title: "Documento controlado",
      citationText: "Linha 1\nLinha 2\tcontinua\rfinal", url: null,
      editionOrVersion: "2ª edição", studyVisibility: "citation", ...overrides
    })
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

test("vínculos exigem Âncora salvo quando aguardam verificação", () => {
  assert.deepEqual(normalizeCourseSourceLinks([sourceLink()]), [sourceLink()]);
  assert.throws(
    () => normalizeCourseSourceLinks([{ ...sourceLink(), sourceRevision: 1 }]),
    (error) => error.code === "invalid_course_source_link"
  );
  assert.throws(
    () => normalizeCourseSourceLinks([{
      ...sourceLink(),
      anchors: [{ anchorId: "anchor-a", anchorRevision: 1 }]
    }]),
    (error) => error.code === "invalid_course_source_link"
  );
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
  assert.deepEqual(
    normalizeCourseSourceLinks([sourceLink({ relation: "needs_verification", anchors: [] })]),
    [sourceLink({ relation: "needs_verification", anchors: [] })]
  );
  assert.throws(
    () => normalizeCourseSourceLinks([
      sourceLink({ relation: "quoted_from", anchors: [] })
    ]),
    (error) => error.code === "invalid_course_source_link"
  );
});

test("mudança de proveniência confirma a versão do alvo sem contador paralelo", () => {
  const base = {
    contract: "aralearn.course-source-change.v1",
    courseId: IDS.course,
    courseRevision: 3,
    requestId: "request-source-target-1",
    idempotent: false,
    changed: true
  };
  const current = {
    ...base,
    change: {
      type: "set_target_sources",
      subjectId: "study-a",
      targetVersion: 2
    }
  };
  assert.deepEqual(normalizeCourseSourceChange(current), current);
  assert.throws(
    () => normalizeCourseSourceChange({
      ...base,
      change: { type: "set_target_sources", subjectId: "study-a", revision: 1 }
    }),
    (error) => error.code === "invalid_course_source_change"
  );
});



test("read owner discrimina modo/cursor e Study reconstrói DTO redigido", () => {
  const createdAt = "2026-08-17T12:00:00.000Z";
  const catalog = {
    contract: "aralearn.course-sources.v2",
    courseId: IDS.course,
    courseRevision: 2,
    mode: "catalog",
    query: { sourceId: null, targetKind: null, targetId: null },
    pdfStorage: pdfStorage(),
    items: [{
      sourceId: "source-imported",
      revision: 1,
      status: "active",
      kind: "other",
      title: "Referência importada",
      authorship: null,
      publicationDate: null,
      identifier: null,
      language: null,
      citationText: "Referência importada sem metadados confirmados.",
      url: null,
      editionOrVersion: null,
      origin: "imported",
      availability: "unknown",
      verificationStatus: "unverified",
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
      targetKind: "study_unit",
      targetId: "study-a",
      targetVersion: 1,
      sourceLinks: [],
      createdAt
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
      authorship: "Autoria",
      publicationDate: "2026",
      identifier: null,
      language: "pt-BR",
      citationText: "AUTOR. Fonte pinada.",
      url: null,
      editionOrVersion: null,
      origin: "external",
      availability: "restricted",
      verificationStatus: "author_verified",
      studyVisibility: "citation",
      anchorCount: 1,
      createdAt,
      anchors: [{
        anchorId: "anchor-a",
        revision: 1,
        sourceRevision: 105,
        status: "active",
        selector: { kind: "page_range", startPage: 3, endPage: 4 },
        humanLocator: null,
        verificationExcerpt: null,
        needsReverification: true,
        createdAt
      }],
      attachments: []
    }],
    nextCursor: null
  };
  assert.deepEqual(normalizeCourseSourcesRead(contextualSource), contextualSource);
  assert.throws(
    () => normalizeCourseSourcesRead({
      ...contextualSource,
      items: [{
        ...contextualSource.items[0],
        anchors: [{ ...contextualSource.items[0].anchors[0], needsReverification: "sim" }]
      }]
    }),
    (error) => error.code === "invalid_course_sources_read"
  );
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
      title: "Artigo",
      citationText: "AUTOR. Artigo.",
      url: null,
      editionOrVersion: null,
      anchors: [{
        anchorId: "anchor-a",
        selector: { kind: "page_range", startPage: 3, endPage: 4 },
        humanLocator: "Capítulo 1 · Tabela 2"
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
