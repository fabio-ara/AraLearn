import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";

import {
  CourseCutoverImportError,
  COURSE_CUTOVER_LEGACY_AUDIT_COUNT_FIELDS,
  COURSE_CUTOVER_STAGING_SCHEMA,
  COURSE_CUTOVER_TRANSACTION_GUARDS,
  assembleWorkspaceCourse,
  attestPreparedCourseCutover,
  buildCourseCutoverSql,
  canonicalSha256,
  courseCutoverLegacyAuditHash,
  convertCourseDocument,
  prepareCourseCutover,
  verifyAppliedCourseCutover
} from "../../scripts/courseCutover/courseCutoverImporter.mjs";
import { canonicalRevisionString } from "../../src/storage/canonicalRevision.js";

const fixture = JSON.parse(fs.readFileSync(new URL(
  "../fixtures/course-cutover/synthetic-course-cutover.json",
  import.meta.url
), "utf8"));

const clone = (value) => JSON.parse(JSON.stringify(value));
const legacyAudit = Object.freeze({
  contract: "aralearn.legacy-authoring-audit-cutover-preflight.v1",
  counts: Object.freeze(Object.fromEntries(
    COURSE_CUTOVER_LEGACY_AUDIT_COUNT_FIELDS.map((field) => [field, 0])
  ))
});
const legacyAuditHash = courseCutoverLegacyAuditHash(legacyAudit);

function replaceCard(document, card) {
  const next = clone(document);
  next.courses[0].modules[0].lessons[0].microsequences[0].cards = [card];
  return next;
}

function legacyCard(kind) {
  if (kind === "table_gap") {
    return {
      id: "legacy-table-gap",
      position: 1,
      resource: "table",
      kind: "exercise",
      exercise: "gap",
      title: "Complete a tabela",
      columns: ["Conceito", "Valor"],
      rows: [["A", "[[alfa::alfa|beta]]"]],
      after: "A resposta esperada era alfa.",
      topics: ["topic-1"],
      sources: ["source:synthetic:gap"]
    };
  }
  return {
    id: "legacy-graph-choice",
    position: 1,
    resource: "graph",
    kind: "exercise",
    exercise: "choice",
    title: "Leia o grafo",
    prompt: "Observe a relação.",
    layout: "network",
    vertices: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
    edges: [{ id: "edge-ab", from: "a", to: "b", label: "liga", directed: false }],
    question: "Qual ligação aparece?",
    selectionMode: "single",
    selectionCriterion: "correct",
    options: [
      { id: "ab", kind: "text", text: "A–B" },
      { id: "ba", kind: "text", text: "B–A" }
    ],
    answerIds: ["ab"],
    after: "A ligação é A–B.",
    topics: ["topic-1"],
    sources: ["source:synthetic:graph"]
  };
}

function legacySystemMapCard(exercise = "choice") {
  const card = {
    id: `legacy-system-map-${exercise}`,
    position: 1,
    resource: "system_map",
    kind: "exercise",
    exercise,
    title: exercise === "gap" ? "Complete o limite" : "Leia o mapa",
    prompt: "Compare os limites e acompanhe as conexões.",
    groups: [
      { id: "region", label: "Região", kind: "region", parentId: null },
      {
        id: "zone",
        label: exercise === "gap"
          ? "[[Zona::Zona|Região|Rede]]"
          : "Zona",
        kind: "zone",
        parentId: "region"
      }
    ],
    nodes: [
      { id: "api", label: "API", kind: "service", groupId: "zone" },
      { id: "store", label: "Dados", kind: "database", groupId: "zone" }
    ],
    links: exercise === "gap" ? [] : [{
      id: "read",
      from: "api",
      to: "store",
      label: "lê",
      directed: true
    }, {
      id: "sync",
      from: "store",
      to: "api",
      label: "sincroniza",
      directed: false
    }],
    after: "Os limites e as conexões determinam a leitura.",
    topics: ["topic-1"],
    sources: ["source:synthetic:system-map"]
  };
  if (exercise === "choice") {
    Object.assign(card, {
      question: "Qual componente lê os dados?",
      selectionMode: "single",
      selectionCriterion: "correct",
      options: [
        { id: "api", kind: "text", text: "API" },
        { id: "store", kind: "text", text: "Dados" }
      ],
      answerIds: ["api"]
    });
  }
  return card;
}

function systemMapResolutionFor(card) {
  const source = Object.fromEntries(
    ["prompt", "groups", "nodes", "links"].map((field) => [field, clone(card[field])])
  );
  const sourceFingerprint = canonicalSha256(source);
  return {
    fingerprint: sourceFingerprint,
    resolutions: {
      systemMaps: {
        [sourceFingerprint]: {
          sourceFingerprint,
          strategy: "hierarchy_and_tables.v1"
        }
      }
    }
  };
}

function legacySequenceCard() {
  return {
    id: "legacy-sequence-gap",
    position: 1,
    resource: "sequence",
    kind: "exercise",
    exercise: "gap",
    title: "Complete o ciclo",
    prompt: "Complete a etapa antes de reiniciar o ciclo.",
    variant: "cycle",
    items: [
      { id: "start", label: "Demanda normal" },
      { id: "peak", label: "Adicionar capacidade", detail: "Pico de demanda" },
      { id: "fall", label: "[[Remover excedente::Remover excedente|Manter pico]]" },
      { id: "return", label: "Retornar ao nível normal" }
    ],
    after: "A capacidade acompanha a demanda.",
    topics: ["topic-1"],
    sources: ["source:synthetic:sequence"]
  };
}

function sequenceResolutionFor(card) {
  const source = Object.fromEntries(
    ["prompt", "variant", "items"].map((field) => [field, clone(card[field])])
  );
  const sourceFingerprint = canonicalSha256(source);
  return {
    fingerprint: sourceFingerprint,
    resolutions: {
      sequences: {
        [sourceFingerprint]: {
          sourceFingerprint,
          strategy: "cycle_table.v1"
        }
      }
    }
  };
}

function escapedColonGapCard() {
  const card = legacyCard("table_gap");
  card.id = "legacy-escaped-colon-gap";
  card.rows[0][1] = "[[52\\:54::52\\:54|192.168.0.1|FF\\:FF]]";
  return card;
}

function inlineGapResolutionFor(card) {
  const source = card.rows[0][1];
  const token = source.match(/\[\[[\s\S]*?::[\s\S]*?\]\]/u)?.[0];
  const sourceFingerprint = canonicalSha256({
    path: "rows[0][1]",
    source,
    token
  });
  return {
    fingerprint: sourceFingerprint,
    resolutions: {
      inlineGaps: {
        [sourceFingerprint]: {
          sourceFingerprint,
          strategy: "escaped_colon.v1"
        }
      }
    }
  };
}

function planeDocument(base) {
  return replaceCard(base, {
    id: "plane-card",
    position: 1,
    title: "Plano",
    role: "theory",
    content: [{
      id: "plane-content",
      package: "aralearn.resource.plane",
      version: "1.0.0",
      data: {
        prompt: "Compare os vetores.",
        vectors: [
          { id: "u", label: "u", from: [0, 0], to: [1, 2] },
          { id: "v", label: "v", from: [0, 0], to: [-1, 1] }
        ]
      }
    }],
    response: null,
    feedback: [],
    topics: ["topic-1"],
    sources: ["source:synthetic:plane"]
  });
}

function missingNamesDocument(base) {
  const next = clone(base);
  next.courses[0].modules[0].lessons[0].microsequences[0].cards = [{
    id: "graph-card", position: 1, title: "Grafo", role: "theory",
    content: [{
      id: "graph-content", package: "aralearn.resource.graph", version: "1.0.0",
      data: {
        prompt: "Observe o grafo.", directed: false, layout: "auto",
        vertices: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
        edges: [{ id: "ab", from: "a", to: "b" }]
      }
    }], response: null, feedback: [], topics: [], sources: []
  }, {
    id: "relation-card", position: 2, title: "Relação", role: "theory",
    content: [{
      id: "relation-content", package: "aralearn.resource.relation_map", version: "1.0.0",
      data: {
        prompt: "Observe a relação.",
        leftSet: { label: "A", items: [{ id: "a", label: "a" }] },
        rightSet: { label: "B", items: [{ id: "b", label: "b" }] },
        relations: [{ id: "ab", from: "a", to: "b" }]
      }
    }], response: null, feedback: [], topics: [], sources: []
  }];
  return next;
}

function decomposeWorkspace(document, workspaceCourseId) {
  const course = clone(document.courses[0]);
  course.id = workspaceCourseId;
  const rows = [];
  const visit = (type, entity, parentType, parentId, position) => {
    const content = clone(entity);
    delete content.id;
    delete content.position;
    const children = {
      course: [["module", "modules"]],
      module: [["lesson", "lessons"]],
      lesson: [["topic", "topics"], ["microsequence", "microsequences"]],
      topic: [],
      microsequence: [["card", "cards"]],
      card: []
    }[type];
    children.forEach(([, field]) => delete content[field]);
    rows.push({
      entityType: type,
      entityId: entity.id,
      parentType,
      parentId,
      position,
      entityVersion: rows.length + 1,
      entityCreatedAt: `2026-07-${String(rows.length + 1).padStart(2, "0")}T10:00:00Z`,
      entityUpdatedAt: `2026-07-${String(rows.length + 1).padStart(2, "0")}T12:00:00Z`,
      content
    });
    children.forEach(([childType, field]) => {
      (entity[field] || []).forEach((child, index) => visit(
        childType,
        child,
        type,
        entity.id,
        childType === "card" ? child.position : index
      ));
    });
  };
  visit("course", course, "project", "project", 0);
  return rows;
}

function syntheticSources() {
  const base = clone(fixture.entries[0].liveDocument);
  const artifactBytes = new Map();
  const resolutions = { planeAxes: {} };
  const topology = fixture.entries.map((definition, index) => {
    let liveDocument = definition.liveDocument
      ? clone(definition.liveDocument)
      : definition.liveDocumentRef
        ? clone(base)
        : null;
    if (definition.legacyLive) {
      liveDocument = replaceCard(base, legacyCard(definition.legacyLive));
      liveDocument.courses[0].modules[0].lessons[0].microsequences[0].status = "ready";
    }
    let artifactDocument = definition.artifactDocumentRef ? clone(base) : null;
    if (definition.artifactVariant === "plane_without_axes") {
      artifactDocument = planeDocument(base);
      const plane = artifactDocument.courses[0].modules[0].lessons[0]
        .microsequences[0].cards[0].content[0].data;
      resolutions.planeAxes[canonicalSha256(plane)] = {
        xAxis: { label: "Eixo x", domain: [-2, 2] },
        yAxis: { label: "Eixo y", domain: [-1, 3] }
      };
    }
    if (definition.artifactVariant === "graph_and_relation_without_names") {
      artifactDocument = missingNamesDocument(base);
    }
    if (definition.liveDocumentRef && definition.artifactVariant) {
      liveDocument = clone(artifactDocument);
    }
    const workspaceId = liveDocument
      ? `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
      : null;
    const workspaceCourseId = liveDocument ? `workspace-course-${index + 1}` : null;
    let artifact = null;
    let legacyCourseId = null;
    let legacyRevisionHash = null;
    if (artifactDocument) {
      const bytes = Buffer.from(canonicalRevisionString(artifactDocument), "utf8");
      const hash = canonicalSha256(JSON.parse(bytes.toString("utf8")));
      artifact = {
        hash,
        bucket: "synthetic-private-bucket",
        objectKey: `synthetic/${index + 1}.json`,
        sizeBytes: bytes.byteLength
      };
      artifactBytes.set(hash, bytes);
      legacyCourseId = `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
      legacyRevisionHash = hash;
    }
    const headerDocument = liveDocument || artifactDocument;
    return {
      courseId: definition.courseId,
      sourceKind: definition.sourceKind,
      workspaceId,
      workspaceCourseId,
      workspaceRevision: liveDocument ? index + 1 : null,
      legacyCourseId,
      legacyRevisionHash,
      targetHeader: {
        title: headerDocument.courses[0].title,
        goal: headerDocument.courses[0].goal
      },
      workspaceEntities: liveDocument
        ? decomposeWorkspace(liveDocument, workspaceCourseId)
        : [],
      artifact
    };
  });
  return {
    snapshot: {
      contract: "aralearn.course-cutover-source.v1",
      legacyAudit,
      legacyAuditHash,
      topology
    },
    resolutions,
    artifactLoader: async ({ hash }) => artifactBytes.get(hash)
  };
}

test("converte a topologia sintética inteira, compara overlaps e gera staging", async () => {
  const source = syntheticSources();
  const result = await prepareCourseCutover(source.snapshot, source);
  assert.equal(result.summary.courseCount, 8);
  assert.equal(result.summary.artifactCount, 4);
  assert.equal(result.summary.overlapCount, 4);
  assert.ok(result.rows.length > 8);
  assert.equal(new Set(result.prepared.map(({ manifest }) =>
    manifest.manifestHash)).size, 8);
  assert.ok(result.prepared.every(({ converted }) =>
    converted.document.contract === "aralearn.course.v1" &&
    converted.rows.some((row) => row.entityType === "study_unit") &&
    converted.rows.every((row) => row.entityType !== "card") &&
    converted.rows.filter((row) => row.entityType === "study_unit")
      .every((row) => !Object.hasOwn(row.content, "sources"))));
  assert.ok(result.rows.some((row) => row.entity_type === "card"));
  assert.ok(result.rows.filter((row) => row.entity_type === "card").every((row) =>
    Array.isArray(row.content.sources)));
  assert.ok(result.rows.every((row) => /^[0-9a-f]{64}$/u.test(row.manifest_hash)));
  assert.ok(result.rows.every((row) => row.course_title && row.course_goal));
  const relationalRow = result.rows.find((row) =>
    row.course_id === fixture.entries[0].courseId && row.entity_type === "module");
  assert.equal(relationalRow.entity_version, 2);
  assert.equal(relationalRow.entity_created_at, "2026-07-02T10:00:00Z");
  assert.equal(relationalRow.entity_updated_at, "2026-07-02T12:00:00Z");
  const overlapRows = result.rows.filter((row) =>
    row.course_id === fixture.entries[6].courseId);
  assert.ok(overlapRows.length > 0);
  assert.equal(
    overlapRows.find((row) => row.entity_type === "module").entity_version,
    2
  );
  assert.equal(attestPreparedCourseCutover(result), true);

  const gap = result.prepared[2].converted.document.courses[0].modules[0]
    .lessons[0].microsequences[0].studyUnits[0];
  assert.equal(gap.response.package, "aralearn.response.gap");
  assert.equal(gap.content[0].data.rows[0][1], "alfa");
  assert.equal(Object.hasOwn(gap, "sources"), false);
  assert.deepEqual(result.prepared[2].converted.sourceReferences, [{
    studyUnitId: gap.id,
    sourceOrdinal: 0,
    sourceId: "source:synthetic:gap"
  }]);
  assert.match(result.prepared[2].converted.sourceReferenceHash, /^[0-9a-f]{64}$/u);
  assert.deepEqual(gap.topics, ["topic-1"]);

  const graph = result.prepared[3].converted.document.courses[0].modules[0]
    .lessons[0].microsequences[0].studyUnits[0];
  assert.equal(graph.content[0].data.name, "G");
  assert.equal(graph.content[0].data.directed, false);
  assert.equal(graph.content[0].data.layout, "force");

  const names = result.prepared[7].converted.document.courses[0].modules[0]
    .lessons[0].microsequences[0].studyUnits;
  assert.equal(names[0].content[0].data.name, "G");
  assert.equal(names[1].content[0].data.name, "R");
});

test("recompõe uma árvore relacional viva sem carregar outro Curso", () => {
  const source = syntheticSources();
  const first = source.snapshot.topology[0];
  const unrelated = clone(first.workspaceEntities);
  unrelated.forEach((row) => {
    row.entityId = `other-${row.entityId}`;
    if (row.parentId !== "project") row.parentId = `other-${row.parentId}`;
  });
  first.workspaceEntities.push(...unrelated);
  const assembled = assembleWorkspaceCourse(first);
  assert.equal(assembled.courses.length, 1);
  assert.equal(assembled.courses[0].id, first.workspaceCourseId);
  assert.equal(assembled.courses[0].modules.length, 1);
});

test("converte o tipo explícito das alternativas e recusa tipo divergente", () => {
  const document = replaceCard(
    fixture.entries[0].liveDocument,
    legacyCard("graph_choice")
  );
  const converted = convertCourseDocument(document, {
    targetCourseId: fixture.entries[0].courseId
  });
  const options = converted.document.courses[0].modules[0].lessons[0]
    .microsequences[0].studyUnits[0].response.data.options;
  assert.deepEqual(options.map(({ kind }) => kind), ["text", "text"]);

  const divergent = legacyCard("graph_choice");
  divergent.options[0].kind = "code";
  assert.throws(
    () => convertCourseDocument(replaceCard(
      fixture.entries[0].liveDocument,
      divergent
    ), { targetCourseId: fixture.entries[0].courseId }),
    (error) => error.code === "ambiguous_choice_option"
  );
});

test("aborta plano sem resolução semântica explícita", async () => {
  const source = syntheticSources();
  await assert.rejects(
    prepareCourseCutover(source.snapshot, {
      artifactLoader: source.artifactLoader,
      resolutions: {}
    }),
    (error) => error instanceof CourseCutoverImportError &&
      error.code === "plane_axes_resolution_required"
  );
});

test("aborta bytes, overlap, cabeçalho e metassintaxe ambíguos", async () => {
  const source = syntheticSources();
  await assert.rejects(
    prepareCourseCutover(source.snapshot, {
      ...source,
      artifactLoader: async () => Buffer.from("{}", "utf8")
    }),
    (error) => error.code === "artifact_bytes_drift"
  );

  const overlap = syntheticSources();
  overlap.snapshot.topology[4].workspaceEntities.find((row) =>
    row.entityType === "card").content.title = "Divergência sintética";
  await assert.rejects(
    prepareCourseCutover(overlap.snapshot, overlap),
    (error) => error.code === "course_overlap_drift"
  );

  const sourceOverlap = syntheticSources();
  sourceOverlap.snapshot.topology[4].workspaceEntities.find((row) =>
    row.entityType === "card").content.sources = ["fonte-divergente"];
  await assert.rejects(
    prepareCourseCutover(sourceOverlap.snapshot, sourceOverlap),
    (error) => error.code === "course_overlap_drift"
  );

  const header = syntheticSources();
  header.snapshot.topology[0].targetHeader.goal = "";
  await assert.rejects(
    prepareCourseCutover(header.snapshot, header),
    (error) => error.code === "invalid_target_header"
  );

  const publicationOnly = syntheticSources();
  publicationOnly.snapshot.topology[7].sourceKind = "publication_only";
  await assert.rejects(
    prepareCourseCutover(publicationOnly.snapshot, publicationOnly),
    (error) => error.code === "invalid_cutover_topology"
  );

  const invalidGap = legacyCard("table_gap");
  invalidGap.rows[0][1] = "[[alfa::beta]]";
  assert.throws(
    () => convertCourseDocument(replaceCard(
      fixture.entries[0].liveDocument,
      invalidGap
    ), { targetCourseId: fixture.entries[0].courseId }),
    (error) => error.code === "ambiguous_inline_gap"
  );

  const malformedGap = legacyCard("table_gap");
  malformedGap.rows[0][1] = "[[alfa|beta]]";
  assert.throws(
    () => convertCourseDocument(replaceCard(
      fixture.entries[0].liveDocument,
      malformedGap
    ), { targetCourseId: fixture.entries[0].courseId }),
    (error) => error.code === "ambiguous_inline_gap"
  );
});

test("preserva espaços, Unicode e duplicatas nas referências, mas recusa controle", () => {
  const spaced = legacyCard("table_gap");
  spaced.sources = ["  fonte:Árvore  ", "https://example.test/a:b"];
  const converted = convertCourseDocument(replaceCard(
    fixture.entries[0].liveDocument,
    spaced
  ), { targetCourseId: fixture.entries[0].courseId });
  assert.deepEqual(converted.sourceReferences.map(({ sourceId }) => sourceId),
    spaced.sources);
  assert.equal(Object.hasOwn(
    converted.document.courses[0].modules[0].lessons[0].microsequences[0]
      .studyUnits[0],
    "sources"
  ), false);

  const duplicate = legacyCard("table_gap");
  duplicate.sources = ["fonte-1", "fonte-1"];
  const duplicated = convertCourseDocument(replaceCard(
    fixture.entries[0].liveDocument,
    duplicate
  ), { targetCourseId: fixture.entries[0].courseId });
  assert.deepEqual(duplicated.sourceReferences.map(({ sourceId }) => sourceId),
    duplicate.sources);

  const astral = legacyCard("table_gap");
  astral.sources = ["😀".repeat(1500)];
  const astralConverted = convertCourseDocument(replaceCard(
    fixture.entries[0].liveDocument,
    astral
  ), { targetCourseId: fixture.entries[0].courseId });
  assert.deepEqual(astralConverted.sourceReferences.map(({ sourceId }) => sourceId),
    astral.sources);

  const tooManyScalars = legacyCard("table_gap");
  tooManyScalars.sources = ["界".repeat(2049)];
  assert.throws(() => convertCourseDocument(replaceCard(
    fixture.entries[0].liveDocument,
    tooManyScalars
  ), { targetCourseId: fixture.entries[0].courseId }),
  (error) => error.code === "invalid_legacy_source_references");

  const oversizedEnvelope = legacyCard("table_gap");
  oversizedEnvelope.sources = Array.from({ length: 128 }, (_, index) =>
    `${String(index).padStart(3, "0")}-${"界".repeat(2044)}`);
  assert.throws(() => convertCourseDocument(replaceCard(
    fixture.entries[0].liveDocument,
    oversizedEnvelope
  ), { targetCourseId: fixture.entries[0].courseId }),
  (error) => error.code === "invalid_legacy_source_references");

  const control = legacyCard("table_gap");
  control.sources = ["fonte\u0085incompatível"];
  assert.throws(() => convertCourseDocument(replaceCard(
    fixture.entries[0].liveDocument,
    control
  ), { targetCourseId: fixture.entries[0].courseId }),
  (error) => error.code === "invalid_legacy_source_references");
});

test("aborta metadados técnicos ausentes", async () => {
  const missing = syntheticSources();
  delete missing.snapshot.topology[0].workspaceEntities[1].entityVersion;
  await assert.rejects(
    prepareCourseCutover(missing.snapshot, missing),
    (error) => error.code === "invalid_cutover_topology"
  );

});

test("preserva a precisão de microssegundos dos metadados técnicos", async () => {
  const input = syntheticSources();
  const entity = input.snapshot.topology[0].workspaceEntities[1];
  entity.entityCreatedAt = "2026-07-02T10:00:00.123456Z";
  entity.entityUpdatedAt = "2026-07-02T10:00:00.123457+00:00";

  const result = await prepareCourseCutover(input.snapshot, input);
  const row = result.rows.find(({ course_id: courseId, entity_id: entityId }) =>
    courseId === input.snapshot.topology[0].courseId && entityId === entity.entityId);

  assert.equal(row.entity_created_at, entity.entityCreatedAt);
  assert.equal(row.entity_updated_at, entity.entityUpdatedAt);

  entity.entityUpdatedAt = "2026-07-02T10:00:00.123455Z";
  await assert.rejects(
    prepareCourseCutover(input.snapshot, input),
    (error) => error.code === "invalid_cutover_topology"
  );
});

test("converte mapas de sistema aprovados sem perder hierarquia, tipos ou conexões", () => {
  const card = legacySystemMapCard();
  const { resolutions } = systemMapResolutionFor(card);
  const converted = convertCourseDocument(replaceCard(
    fixture.entries[0].liveDocument,
    card
  ), {
    targetCourseId: fixture.entries[0].courseId,
    resolutions
  });
  const unit = converted.document.courses[0].modules[0].lessons[0]
    .microsequences[0].studyUnits[0];
  assert.deepEqual(unit.content.map(({ package: packageId }) => packageId), [
    "aralearn.resource.tree",
    "aralearn.resource.table",
    "aralearn.resource.table"
  ]);
  assert.deepEqual(unit.content[0].data.nodes, [
    { id: "region", label: "Região", parentId: null },
    { id: "zone", label: "Zona", parentId: "region" },
    { id: "api", label: "API", parentId: "zone" },
    { id: "store", label: "Dados", parentId: "zone" }
  ]);
  assert.deepEqual(unit.content[1].data.rows, [
    ["Grupo", "region", "Região", "region", ""],
    ["Grupo", "zone", "Zona", "zone", "region"],
    ["Componente", "api", "API", "service", "zone"],
    ["Componente", "store", "Dados", "database", "zone"]
  ]);
  assert.deepEqual(unit.content[2].data.rows, [
    ["read", "api", "lê", "store", "Sim"],
    ["sync", "store", "sincroniza", "api", "Não"]
  ]);
  assert.equal(unit.response.package, "aralearn.response.choice");
  assert.deepEqual(unit.response.data.answerIds, ["api"]);
});

test("mantém uma lacuna de mapa ligada ao rótulo hierárquico", () => {
  const card = legacySystemMapCard("gap");
  const { resolutions } = systemMapResolutionFor(card);
  const converted = convertCourseDocument(replaceCard(
    fixture.entries[0].liveDocument,
    card
  ), {
    targetCourseId: fixture.entries[0].courseId,
    resolutions
  });
  const unit = converted.document.courses[0].modules[0].lessons[0]
    .microsequences[0].studyUnits[0];
  assert.equal(unit.content[0].data.nodes[1].label, "Zona");
  assert.equal(unit.content[1].data.rows[1][2], "Ver rótulo no diagrama");
  assert.equal(unit.response.package, "aralearn.response.gap");
  assert.equal(unit.response.data.blanks[0].targetInstanceId,
    `${card.id}-content-hierarchy`);
  assert.equal(unit.response.data.blanks[0].targetPath, "nodes[1].label");
});

test("recusa resolução ausente ou vinculada a outro mapa de sistema", () => {
  const card = legacySystemMapCard();
  const { fingerprint, resolutions } = systemMapResolutionFor(card);
  assert.throws(
    () => convertCourseDocument(replaceCard(
      fixture.entries[0].liveDocument,
      card
    ), { targetCourseId: fixture.entries[0].courseId }),
    (error) => error.code === "system_map_resolution_required" &&
      error.details?.sourceFingerprint === fingerprint
  );

  resolutions.systemMaps[fingerprint].sourceFingerprint = "0".repeat(64);
  assert.throws(
    () => convertCourseDocument(replaceCard(
      fixture.entries[0].liveDocument,
      card
    ), { targetCourseId: fixture.entries[0].courseId, resolutions }),
    (error) => error.code === "system_map_resolution_mismatch"
  );
});

test("converte o ciclo antigo aprovado e mantém a lacuna na etapa", () => {
  const card = legacySequenceCard();
  const { resolutions } = sequenceResolutionFor(card);
  const converted = convertCourseDocument(replaceCard(
    fixture.entries[0].liveDocument,
    card
  ), {
    targetCourseId: fixture.entries[0].courseId,
    resolutions
  });
  const unit = converted.document.courses[0].modules[0].lessons[0]
    .microsequences[0].studyUnits[0];
  assert.equal(unit.content.length, 1);
  assert.equal(unit.content[0].package, "aralearn.resource.table");
  assert.match(unit.content[0].data.caption, /retorna à primeira/u);
  assert.deepEqual(unit.content[0].data.rows, [
    ["1", "start", "Demanda normal", ""],
    ["2", "peak", "Adicionar capacidade", "Pico de demanda"],
    ["3", "fall", "Remover excedente", ""],
    ["4", "return", "Retornar ao nível normal", ""]
  ]);
  assert.equal(unit.response.package, "aralearn.response.gap");
  assert.equal(unit.response.data.blanks[0].targetInstanceId,
    `${card.id}-content-cycle`);
  assert.equal(unit.response.data.blanks[0].targetPath, "rows[2][2]");
});

test("recusa ciclo antigo sem resolução ou com hash divergente", () => {
  const card = legacySequenceCard();
  const { fingerprint, resolutions } = sequenceResolutionFor(card);
  assert.throws(
    () => convertCourseDocument(replaceCard(
      fixture.entries[0].liveDocument,
      card
    ), { targetCourseId: fixture.entries[0].courseId }),
    (error) => error.code === "sequence_resolution_required" &&
      error.details?.sourceFingerprint === fingerprint
  );

  resolutions.sequences[fingerprint].sourceFingerprint = "0".repeat(64);
  assert.throws(
    () => convertCourseDocument(replaceCard(
      fixture.entries[0].liveDocument,
      card
    ), { targetCourseId: fixture.entries[0].courseId, resolutions }),
    (error) => error.code === "sequence_resolution_mismatch"
  );
});

test("converte a codificação antiga de dois-pontos somente com resolução", () => {
  const card = escapedColonGapCard();
  const { resolutions } = inlineGapResolutionFor(card);
  const converted = convertCourseDocument(replaceCard(
    fixture.entries[0].liveDocument,
    card
  ), {
    targetCourseId: fixture.entries[0].courseId,
    resolutions
  });
  const unit = converted.document.courses[0].modules[0].lessons[0]
    .microsequences[0].studyUnits[0];
  assert.equal(unit.content[0].data.rows[0][1], "52:54");
  assert.equal(unit.response.data.blanks[0].answer, "52:54");
  assert.deepEqual(unit.response.data.blanks[0].distractors,
    ["192.168.0.1", "FF:FF"]);
});

test("recusa lacuna escapada sem resolução ou com hash divergente", () => {
  const card = escapedColonGapCard();
  const { fingerprint, resolutions } = inlineGapResolutionFor(card);
  assert.throws(
    () => convertCourseDocument(replaceCard(
      fixture.entries[0].liveDocument,
      card
    ), { targetCourseId: fixture.entries[0].courseId }),
    (error) => error.code === "inline_gap_resolution_required" &&
      error.details?.sourceFingerprint === fingerprint
  );

  resolutions.inlineGaps[fingerprint].sourceFingerprint = "0".repeat(64);
  assert.throws(
    () => convertCourseDocument(replaceCard(
      fixture.entries[0].liveDocument,
      card
    ), { targetCourseId: fixture.entries[0].courseId, resolutions }),
    (error) => error.code === "inline_gap_resolution_mismatch"
  );
});

test("aborta resource antigo sem package atual em vez de criar fallback", () => {
  const card = {
    ...legacyCard("graph_choice"),
    id: "unsupported-card",
    resource: "legacy_system_diagram",
    prompt: "Sistema sintético.",
    groups: [],
    nodes: [],
    links: []
  };
  delete card.vertices;
  delete card.edges;
  delete card.layout;
  assert.throws(
    () => convertCourseDocument(replaceCard(
      fixture.entries[0].liveDocument,
      card
    ), { targetCourseId: fixture.entries[0].courseId }),
    (error) => error.code === "unsupported_legacy_resource"
  );
});

test("converte relações L3 com ids determinísticos e rejeita campos não comprovados", () => {
  const relationCard = {
    id: "legacy-relation",
    position: 1,
    resource: "relation_map",
    kind: "theory",
    exercise: "none",
    title: "Relação sintética",
    prompt: "Associe os elementos.",
    leftSet: { label: "A", items: [{ id: "a", label: "a" }] },
    rightSet: { label: "B", items: [{ id: "b", label: "b" }] },
    relations: [{ from: "a", to: "b" }],
    after: "",
    topics: ["topic-1"],
    sources: ["source:synthetic:relation"]
  };
  const converted = convertCourseDocument(replaceCard(
    fixture.entries[0].liveDocument,
    relationCard
  ), { targetCourseId: fixture.entries[0].courseId });
  assert.equal(
    converted.document.courses[0].modules[0].lessons[0].microsequences[0]
      .studyUnits[0].content[0].data.relations[0].id,
    "relation-1"
  );

  relationCard.relations[0].id = "legacy-id-not-observed";
  assert.throws(
    () => convertCourseDocument(replaceCard(
      fixture.entries[0].liveDocument,
      relationCard
    ), { targetCourseId: fixture.entries[0].courseId }),
    (error) => error.code === "ambiguous_relation"
  );
});

test("distingue hash dos bytes de hash do JSON canônico", async () => {
  const source = syntheticSources();
  const entry = source.snapshot.topology.find((item) => item.artifact);
  const canonicalBytes = await source.artifactLoader(entry.artifact);
  const prettyBytes = Buffer.from(
    JSON.stringify(JSON.parse(canonicalBytes.toString("utf8")), null, 2),
    "utf8"
  );
  const byteHash = createHash("sha256").update(prettyBytes).digest("hex");
  const previousLoader = source.artifactLoader;
  entry.artifact.hash = byteHash;
  entry.artifact.sizeBytes = prettyBytes.byteLength;
  entry.legacyRevisionHash = byteHash;
  await assert.rejects(prepareCourseCutover(source.snapshot, {
    ...source,
    artifactLoader: async (artifact, context) => artifact.hash === byteHash
      ? prettyBytes
      : previousLoader(artifact, context)
  }), (error) => error.code === "artifact_canonical_hash_drift");
});

test("gera o mesmo script transacional e hash com migrations LF ou CRLF", async () => {
  const source = syntheticSources();
  const result = await prepareCourseCutover(source.snapshot, source);
  const taskOperationTerminologyMigration = fs.readFileSync(new URL(
    "../../supabase/migrations/20260817130000_task_operation_terminology.sql",
    import.meta.url
  ), "utf8");
  const migration = fs.readFileSync(new URL(
    "../../supabase/migrations/20260817140000_course_identity_cutover.sql",
    import.meta.url
  ), "utf8");
  const profileAccessMigration = fs.readFileSync(new URL(
    "../../supabase/migrations/20260817150000_course_profiles_access.sql",
    import.meta.url
  ), "utf8");
  const authoringPlanMigration = fs.readFileSync(new URL(
    "../../supabase/migrations/20260817160000_course_authoring_plan.sql",
    import.meta.url
  ), "utf8");
  const studyUnitInspectionMigration = fs.readFileSync(new URL(
    "../../supabase/migrations/20260817170000_course_study_unit_inspection.sql",
    import.meta.url
  ), "utf8");
  const courseDesignMigration = fs.readFileSync(new URL(
    "../../supabase/migrations/20260817180000_course_design_parameters.sql",
    import.meta.url
  ), "utf8");
  const courseSourcesMigration = fs.readFileSync(new URL(
    "../../supabase/migrations/20260817190000_course_sources_provenance.sql",
    import.meta.url
  ), "utf8");
  const courseAnnotationsMigration = fs.readFileSync(new URL(
    "../../supabase/migrations/20260817200000_course_anchored_annotations.sql",
    import.meta.url
  ), "utf8");
  const courseAuditMigration = fs.readFileSync(new URL(
    "../../supabase/migrations/20260817210000_course_audit_corrections.sql",
    import.meta.url
  ), "utf8");
  const courseVariantsMigration = fs.readFileSync(new URL(
    "../../supabase/migrations/20260818042341_course_variant_comparisons.sql",
    import.meta.url
  ), "utf8");
  const courseVariantListingMigration = fs.readFileSync(new URL(
    "../../supabase/migrations/20260818051209_course_variant_comparison_listing.sql",
    import.meta.url
  ), "utf8");
  const courseVariantManifestMigration = fs.readFileSync(new URL(
    "../../supabase/migrations/20260818052044_course_variant_listing_manifest.sql",
    import.meta.url
  ), "utf8");
  const courseSourcePdfMigration = fs.readFileSync(new URL(
    "../../supabase/migrations/20260820061206_course_source_pdf_attachments.sql",
    import.meta.url
  ), "utf8");
  const courseAuthoringAnalyticsMigration = fs.readFileSync(new URL(
    "../../supabase/migrations/20260820063156_course_authoring_analytics.sql",
    import.meta.url
  ), "utf8");
  const completeCourseVariantComparisonMigration = fs.readFileSync(new URL(
    "../../supabase/migrations/20260820065720_complete_course_variant_comparison.sql",
    import.meta.url
  ), "utf8");
  const personAvatarPathMigration = fs.readFileSync(new URL(
    "../../supabase/migrations/20260820101500_fix_person_avatar_path_validation.sql",
    import.meta.url
  ), "utf8");
  const variantMigrations = [
    {
      version: "20260818042341",
      name: "course_variant_comparisons",
      sql: courseVariantsMigration
    },
    {
      version: "20260818051209",
      name: "course_variant_comparison_listing",
      sql: courseVariantListingMigration
    },
    {
      version: "20260818052044",
      name: "course_variant_listing_manifest",
      sql: courseVariantManifestMigration
    },
    {
      version: "20260820061206",
      name: "course_source_pdf_attachments",
      sql: courseSourcePdfMigration
    },
    {
      version: "20260820063156",
      name: "course_authoring_analytics",
      sql: courseAuthoringAnalyticsMigration
    },
    {
      version: "20260820065720",
      name: "complete_course_variant_comparison",
      sql: completeCourseVariantComparisonMigration
    },
    {
      version: "20260820101500",
      name: "fix_person_avatar_path_validation",
      sql: personAvatarPathMigration
    }
  ];
  const sql = buildCourseCutoverSql(
    result,
    taskOperationTerminologyMigration,
    migration,
    profileAccessMigration,
    authoringPlanMigration,
    studyUnitInspectionMigration,
    courseDesignMigration,
    courseSourcesMigration,
    courseAnnotationsMigration,
    courseAuditMigration,
    variantMigrations
  );
  const migrationWithLineEnding = (value, lineEnding) =>
    value.replace(/\r\n?/gu, "\n").replaceAll("\n", lineEnding);
  const buildSqlWithLineEnding = (lineEnding) => buildCourseCutoverSql(
    result,
    migrationWithLineEnding(taskOperationTerminologyMigration, lineEnding),
    migrationWithLineEnding(migration, lineEnding),
    migrationWithLineEnding(profileAccessMigration, lineEnding),
    migrationWithLineEnding(authoringPlanMigration, lineEnding),
    migrationWithLineEnding(studyUnitInspectionMigration, lineEnding),
    migrationWithLineEnding(courseDesignMigration, lineEnding),
    migrationWithLineEnding(courseSourcesMigration, lineEnding),
    migrationWithLineEnding(courseAnnotationsMigration, lineEnding),
    migrationWithLineEnding(courseAuditMigration, lineEnding),
    variantMigrations.map((entry) => ({
      ...entry,
      sql: migrationWithLineEnding(entry.sql, lineEnding)
    }))
  );
  const lfSql = buildSqlWithLineEnding("\n");
  const crlfSql = buildSqlWithLineEnding("\r\n");
  const lfBytes = Buffer.from(lfSql, "utf8");
  const crlfBytes = Buffer.from(crlfSql, "utf8");
  const sqlHash = (value) => createHash("sha256").update(value).digest("hex");
  assert.deepEqual(crlfBytes, lfBytes);
  assert.equal(sqlHash(crlfBytes), sqlHash(lfBytes));
  assert.equal(sql, lfSql);
  assert.match(sql, /^\\set ON_ERROR_STOP on\nbegin;/u);
  const copyPosition = sql.indexOf("copy course_content_import_v1(");
  for (const guard of COURSE_CUTOVER_TRANSACTION_GUARDS) {
    assert.equal((sql.split(guard).length - 1), 1);
    assert.ok(sql.indexOf(guard) > sql.indexOf("begin;") &&
      sql.indexOf(guard) < copyPosition);
  }
  assert.match(sql, /create temporary table course_content_import_v1/u);
  assert.match(sql, /copy course_content_import_v1\(/u);
  assert.equal((sql.match(/^begin;$/gmu) || []).length, 1);
  assert.equal((sql.match(/^commit;$/gmu) || []).length, 1);
  assert.match(sql, /drop table pg_temp\.course_content_import_v1/u);
  assert.match(
    sql,
    /insert into supabase_migrations\.schema_migrations\(version,statements,name\)[\s\S]*20260817130000[\s\S]*task_operation_terminology/u
  );
  assert.match(
    sql,
    /insert into supabase_migrations\.schema_migrations\(version,statements,name\)[\s\S]*20260817140000[\s\S]*course_identity_cutover/u
  );
  assert.match(
    sql,
    /insert into supabase_migrations\.schema_migrations\(version,statements,name\)[\s\S]*20260817150000[\s\S]*course_profiles_access/u
  );
  assert.match(
    sql,
    /insert into supabase_migrations\.schema_migrations\(version,statements,name\)[\s\S]*20260817160000[\s\S]*course_authoring_plan/u
  );
  assert.match(
    sql,
    /insert into supabase_migrations\.schema_migrations\(version,statements,name\)[\s\S]*20260817170000[\s\S]*course_study_unit_inspection/u
  );
  assert.match(
    sql,
    /insert into supabase_migrations\.schema_migrations\(version,statements,name\)[\s\S]*20260817180000[\s\S]*course_design_parameters/u
  );
  assert.match(
    sql,
    /insert into supabase_migrations\.schema_migrations\(version,statements,name\)[\s\S]*20260817190000[\s\S]*course_sources_provenance/u
  );
  assert.match(
    sql,
    /insert into supabase_migrations\.schema_migrations\(version,statements,name\)[\s\S]*20260817200000[\s\S]*course_anchored_annotations/u
  );
  assert.match(
    sql,
    /insert into supabase_migrations\.schema_migrations\(version,statements,name\)[\s\S]*20260817210000[\s\S]*course_audit_corrections/u
  );
  assert.match(
    sql,
    /insert into supabase_migrations\.schema_migrations\(version,statements,name\)[\s\S]*20260818042341[\s\S]*course_variant_comparisons/u
  );
  assert.match(
    sql,
    /insert into supabase_migrations\.schema_migrations\(version,statements,name\)[\s\S]*20260818051209[\s\S]*course_variant_comparison_listing/u
  );
  assert.match(
    sql,
    /insert into supabase_migrations\.schema_migrations\(version,statements,name\)[\s\S]*20260818052044[\s\S]*course_variant_listing_manifest/u
  );
  assert.match(
    sql,
    /insert into supabase_migrations\.schema_migrations\(version,statements,name\)[\s\S]*20260820061206[\s\S]*course_source_pdf_attachments/u
  );
  assert.match(
    sql,
    /insert into supabase_migrations\.schema_migrations\(version,statements,name\)[\s\S]*20260820063156[\s\S]*course_authoring_analytics/u
  );
  assert.match(
    sql,
    /insert into supabase_migrations\.schema_migrations\(version,statements,name\)[\s\S]*20260820065720[\s\S]*complete_course_variant_comparison/u
  );
  assert.match(
    sql,
    /insert into supabase_migrations\.schema_migrations\(version,statements,name\)[\s\S]*20260820101500[\s\S]*fix_person_avatar_path_validation/u
  );
  assert.ok(
    sql.indexOf("advance_task_operation_runtime_manifest") <
      sql.indexOf("create table public.courses") &&
    sql.indexOf("create table public.person_profiles") >
      sql.indexOf("create table public.courses") &&
    sql.indexOf("create table public.person_profiles") <
      sql.indexOf("create table private.course_instructional_plans") &&
    sql.indexOf("create table private.course_instructional_plans") <
      sql.indexOf("create table private.course_design_parameter_definitions") &&
    sql.indexOf("create table private.course_design_parameter_definitions") <
      sql.indexOf("create table private.course_source_revisions") &&
    sql.indexOf("create table private.course_source_revisions") <
      sql.indexOf("create table private.course_anchored_annotations") &&
    sql.indexOf("create table private.course_anchored_annotations") <
      sql.indexOf("create table private.course_instructional_audit_runs") &&
    sql.indexOf("create table private.course_instructional_audit_runs") <
      sql.indexOf("create table private.course_variant_plan_checkpoints") &&
    sql.indexOf("create table private.course_variant_plan_checkpoints") <
      sql.indexOf("create function public.list_owned_course_variant_comparisons_for_actor_v1") &&
    sql.indexOf("create function public.list_owned_course_variant_comparisons_for_actor_v1") <
      sql.indexOf("advance_course_variant_listing_manifest") &&
    sql.indexOf("advance_course_variant_listing_manifest") <
      sql.indexOf("aralearn-course-source-pdf-attachments-v1") &&
    sql.indexOf("aralearn-course-source-pdf-attachments-v1") <
      sql.indexOf("get_owned_course_authoring_analytics_for_actor_v1") &&
    sql.indexOf("get_owned_course_authoring_analytics_for_actor_v1") <
      sql.indexOf("advance_course_variant_factual_comparison_runtime_manifest") &&
    sql.indexOf("advance_course_variant_factual_comparison_runtime_manifest") <
      sql.indexOf("advance_person_avatar_path_runtime_manifest") &&
    sql.indexOf("advance_person_avatar_path_runtime_manifest") <
      sql.lastIndexOf("commit;")
  );
  const migrationRecordPositions = [
    "20260817130000", "20260817140000", "20260817150000", "20260817160000",
    "20260817170000", "20260817180000", "20260817190000", "20260817200000",
    "20260817210000", ...variantMigrations.map(({ version }) => version)
  ].map((version) => sql.indexOf(`values ('${version}',`));
  assert.ok(migrationRecordPositions.every((position) => position >= 0));
  assert.deepEqual(
    migrationRecordPositions,
    [...migrationRecordPositions].sort((left, right) => left - right)
  );
  const extendedSql = buildCourseCutoverSql(
    result,
    taskOperationTerminologyMigration,
    migration,
    profileAccessMigration,
    authoringPlanMigration,
    studyUnitInspectionMigration,
    courseDesignMigration,
    courseSourcesMigration,
    courseAnnotationsMigration,
    courseAuditMigration,
    [...variantMigrations, {
      version: "20260821000000",
      name: "future_cutover_step",
      sql: "select 1;"
    }]
  );
  assert.match(
    extendedSql,
    /20260820101500[\s\S]*20260821000000[\s\S]*future_cutover_step/u
  );
  assert.throws(
    () => buildCourseCutoverSql(
      result,
      taskOperationTerminologyMigration,
      migration,
      profileAccessMigration,
      authoringPlanMigration,
      studyUnitInspectionMigration,
      courseDesignMigration,
      courseSourcesMigration,
      courseAnnotationsMigration,
      courseAuditMigration,
      [...variantMigrations, {
        version: "20260820065000",
        name: "out_of_order",
        sql: "select 1;"
      }]
    ),
    (error) => error.code === "invalid_cutover_execution"
  );

  const migrationSchema = migration.match(
    /create temporary table course_content_import_v1\(\s*([\s\S]*?)\s*\)\s*\$ddl\$/u
  );
  assert.ok(migrationSchema, "migration deve declarar a staging TEMP");
  const migrationColumns = migrationSchema[1].split(/,\s*\r?\n/u).map((line) =>
    line.trim().replace(/\s+/gu, " "));
  assert.deepEqual(
    migrationColumns,
    COURSE_CUTOVER_STAGING_SCHEMA.map(({ name, sql: type }) => `${name} ${type}`)
  );
  const copyColumns = sql.match(
    /copy course_content_import_v1\(([^)]+)\) from stdin/u
  )[1].split(",");
  assert.deepEqual(
    copyColumns,
    COURSE_CUTOVER_STAGING_SCHEMA.map(({ name }) => name)
  );
  assert.throws(
    () => buildCourseCutoverSql(
      result,
      taskOperationTerminologyMigration.replace(/^commit;\s*$/mu, ""),
      migration,
      profileAccessMigration,
      authoringPlanMigration,
      studyUnitInspectionMigration,
      courseDesignMigration,
      courseSourcesMigration,
      courseAnnotationsMigration,
      courseAuditMigration,
      variantMigrations
    ),
    (error) => error.code === "migration_transaction_drift"
  );
  assert.throws(
    () => buildCourseCutoverSql(
      result,
      taskOperationTerminologyMigration,
      migration.replace("        course_goal text not null,", "        course_goal text,"),
      profileAccessMigration,
      authoringPlanMigration,
      studyUnitInspectionMigration,
      courseDesignMigration,
      courseSourcesMigration,
      courseAnnotationsMigration,
      courseAuditMigration,
      variantMigrations
    ),
    (error) => error.code === "migration_staging_schema_drift"
  );
  assert.throws(
    () => buildCourseCutoverSql(
      result,
      taskOperationTerminologyMigration,
      migration.replace("set local lock_timeout = '15s';", ""),
      profileAccessMigration,
      authoringPlanMigration,
      studyUnitInspectionMigration,
      courseDesignMigration,
      courseSourcesMigration,
      courseAnnotationsMigration,
      courseAuditMigration,
      variantMigrations
    ),
    (error) => error.code === "migration_transaction_guard_drift"
  );
  assert.throws(
    () => buildCourseCutoverSql(
      result,
      taskOperationTerminologyMigration,
      migration.replace(
        "set local lock_timeout = '15s';",
        "set local lock_timeout = '15s';\nset local lock_timeout = '15s';"
      ),
      profileAccessMigration,
      authoringPlanMigration,
      studyUnitInspectionMigration,
      courseDesignMigration,
      courseSourcesMigration,
      courseAnnotationsMigration,
      courseAuditMigration,
      variantMigrations
    ),
    (error) => error.code === "migration_transaction_guard_drift"
  );
  assert.throws(
    () => buildCourseCutoverSql(
      result,
      taskOperationTerminologyMigration,
      migration,
      profileAccessMigration.replace(/^commit;\s*$/mu, ""),
      authoringPlanMigration,
      studyUnitInspectionMigration,
      courseDesignMigration,
      courseSourcesMigration,
      courseAnnotationsMigration,
      courseAuditMigration,
      variantMigrations
    ),
    (error) => error.code === "migration_transaction_drift"
  );
  assert.throws(
    () => buildCourseCutoverSql(
      result,
      taskOperationTerminologyMigration,
      migration,
      profileAccessMigration,
      authoringPlanMigration.replace(/^commit;\s*$/mu, ""),
      studyUnitInspectionMigration,
      courseDesignMigration,
      courseSourcesMigration,
      courseAnnotationsMigration,
      courseAuditMigration,
      variantMigrations
    ),
    (error) => error.code === "migration_transaction_drift"
  );
  assert.throws(
    () => buildCourseCutoverSql(
      result,
      taskOperationTerminologyMigration,
      migration,
      profileAccessMigration,
      authoringPlanMigration,
      studyUnitInspectionMigration.replace(/^commit;\s*$/mu, ""),
      courseDesignMigration,
      courseSourcesMigration,
      courseAnnotationsMigration,
      courseAuditMigration,
      variantMigrations
    ),
    (error) => error.code === "migration_transaction_drift"
  );
  assert.throws(
    () => buildCourseCutoverSql(
      result,
      taskOperationTerminologyMigration,
      migration,
      profileAccessMigration,
      authoringPlanMigration,
      studyUnitInspectionMigration,
      courseDesignMigration.replace(/^commit;\s*$/mu, ""),
      courseSourcesMigration,
      courseAnnotationsMigration,
      courseAuditMigration,
      variantMigrations
    ),
    (error) => error.code === "migration_transaction_drift"
  );
  assert.throws(
    () => buildCourseCutoverSql(
      result,
      taskOperationTerminologyMigration,
      migration,
      profileAccessMigration,
      authoringPlanMigration,
      studyUnitInspectionMigration,
      courseDesignMigration,
      courseSourcesMigration.replace(/^commit;\s*$/mu, ""),
      courseAnnotationsMigration,
      courseAuditMigration,
      variantMigrations
    ),
    (error) => error.code === "migration_transaction_drift"
  );
  assert.throws(
    () => buildCourseCutoverSql(
      result,
      taskOperationTerminologyMigration,
      migration,
      profileAccessMigration,
      authoringPlanMigration,
      studyUnitInspectionMigration,
      courseDesignMigration,
      courseSourcesMigration,
      courseAnnotationsMigration.replace(/^commit;\s*$/mu, ""),
      courseAuditMigration,
      variantMigrations
    ),
    (error) => error.code === "migration_transaction_drift"
  );
  assert.throws(
    () => buildCourseCutoverSql(
      result,
      taskOperationTerminologyMigration,
      migration,
      profileAccessMigration,
      authoringPlanMigration,
      studyUnitInspectionMigration,
      courseDesignMigration,
      courseSourcesMigration,
      courseAnnotationsMigration,
      courseAuditMigration.replace(/^commit;\s*$/mu, ""),
      variantMigrations
    ),
    (error) => error.code === "migration_transaction_drift"
  );
});

test("recusa staging ou manifesto alterados depois da atestação", async () => {
  const source = syntheticSources();
  const changedRow = await prepareCourseCutover(source.snapshot, source);
  changedRow.rows[0].course_goal = "Objetivo adulterado";
  assert.throws(
    () => attestPreparedCourseCutover(changedRow),
    (error) => error.code === "cutover_attestation_failed"
  );

  const changedManifest = await prepareCourseCutover(source.snapshot, source);
  changedManifest.prepared[0].manifest.manifestHash = "0".repeat(64);
  assert.throws(
    () => buildCourseCutoverSql(
      changedManifest,
      "begin;\ncommit;\n",
      "begin;\ncommit;\n",
      "begin;\ncommit;\n",
      "begin;\ncommit;\n",
      "begin;\ncommit;\n",
      "begin;\ncommit;\n",
      "begin;\ncommit;\n",
      "begin;\ncommit;\n",
      "begin;\ncommit;\n",
      [{ version: "20260818042341", name: "variant_one", sql: "variant-one" }]
    ),
    (error) => error.code === "cutover_attestation_failed"
  );

  const changedMetadata = await prepareCourseCutover(source.snapshot, source);
  changedMetadata.rows[0].entity_version += 1;
  assert.throws(
    () => attestPreparedCourseCutover(changedMetadata),
    (error) => error.code === "cutover_attestation_failed"
  );
});

test("recompõe o estado aplicado e confirma hashes sem incluir conteúdo na evidência", async () => {
  const source = syntheticSources();
  const preparation = await prepareCourseCutover(source.snapshot, source);
  const verification = {
    contract: "aralearn.course-cutover-verification.v1",
    courses: preparation.prepared.map(({ entry, converted, entityMetadata }) => {
      const metadata = new Map(entityMetadata.map((item) => [
        `${item.entityType}\u0000${item.entityId}`,
        item
      ]));
      return {
        courseId: entry.courseId,
        title: converted.course.title,
        goal: converted.course.goal,
        sourceReferences: clone(converted.sourceReferences),
        entities: converted.rows.map((row) => ({
          ...row,
          content: clone(row.content),
          version: metadata.get(`${row.entityType}\u0000${row.entityId}`).version,
          createdAt: metadata.get(`${row.entityType}\u0000${row.entityId}`).createdAt,
          updatedAt: metadata.get(`${row.entityType}\u0000${row.entityId}`).updatedAt
        }))
      };
    })
  };
  const evidence = verifyAppliedCourseCutover(preparation, verification);
  assert.equal(evidence.length, 8);
  assert.deepEqual(Object.keys(evidence[0]).sort(), [
    "counts", "courseId", "documentHash", "entityStateHash", "manifestHash",
    "rowHash", "sourceReferenceHash"
  ]);
  assert.equal(JSON.stringify(evidence).includes("Módulo"), false);

  verification.courses[0].entities[0].content.title = "Conteúdo divergente";
  assert.throws(
    () => verifyAppliedCourseCutover(preparation, verification),
    (error) => error.code === "cutover_verification_drift"
  );

  verification.courses[0].entities[0].content.title =
    preparation.prepared[0].converted.rows[0].content.title;
  verification.courses[0].sourceReferences[0].sourceId += "-drift";
  assert.throws(
    () => verifyAppliedCourseCutover(preparation, verification),
    (error) => error.code === "cutover_verification_drift"
  );
});
