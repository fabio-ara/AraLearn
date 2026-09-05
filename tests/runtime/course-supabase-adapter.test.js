import { createEmptyCourseSourceBibliographicMetadata } from "../../src/domain/courseSources.js";
import { COURSE_COMPONENT_CATALOG } from "../../src/domain/courseDesignParameters.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { CourseSupabaseAdapter } from "../../supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";
import { COURSE_DESIGN_PARAMETER_DEFINITIONS, COURSE_DESIGN_PARAMETER_CATALOG_VERSION } from
  "../../src/domain/courseDesignParameters.js";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const COURSE_ID = "20000000-0000-4000-8000-000000000002";
const OTHER_COURSE_ID = "20000000-0000-4000-8000-000000000009";
const PLAN_ID = "30000000-0000-4000-8000-000000000003";
const CURRICULUM_SCOPE_ID = "30000000-0000-4000-8000-000000000033";
const PART_ID = "40000000-0000-4000-8000-000000000004";
const STEP_ID = "60000000-0000-4000-8000-000000000006";
const AUDIT_RUN_ID = "11111111-1111-5111-8111-111111111111";
const MCP_RESOURCE =
  "https://project.example/functions/v1/aralearn-authoring-mcp";
const MCP_CLIENT_ID = "90000000-0000-4000-8000-000000000009";

function analyticsSnapshot() {
  const scope = { kind: "course", ref: null, label: "Curso" };
  return {
    contract: "aralearn.course-authoring-analytics.v3",
    course: { id: COURSE_ID, revision: 7, title: "Curso" },
    scope: { selected: scope, options: [scope] },
    design: {
      studyUnitCount: 0,
      parameters: COURSE_DESIGN_PARAMETER_DEFINITIONS.map((definition) => ({
      parameterId: definition.id, label: definition.label,
      valueKind: definition.valueSchema.type === "set" ? "string_list" : definition.valueSchema.type,
      definition: structuredClone(definition), effectiveValues: []
    })),
      editorialDirections: [],
      analysisUnits: [],
      introductionsByStudyUnit: [],
      explanationForms: [],
      components: [],
      practiceByRequirement: [],
      practiceVariationDimensions: [],
      sourcesByRole: [],
      wordCountsByStudyUnit: [],
      practiceSequence: []
    },
    authorship: {
      observations: { createdCount: 0, openCount: 0, resolvedCount: 0 },
      explicitParameterOverrideCount: 0,
      manuallyRevisedStudyUnitCount: 0,
      studyUnitsByOrigin: []
    },
    missingData: [],
    deepLink: null
  };
}
const MCP_PAIRWISE_SUBJECT = "91000000-0000-5000-8000-000000000009";
const MCP_PAIRWISE_SESSION_ID = "92000000-0000-5000-8000-000000000009";
const MCP_SOURCE_SESSION_ID = "93000000-0000-4000-8000-000000000009";

function jwt(payload) {
  return [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "assinatura-de-teste"
  ].join(".");
}

const APPLICATION_TOKEN = jwt({
  aud: "authenticated",
  exp: 2_000_000_000,
  iat: 1_700_000_000,
  iss: "https://project.example/auth/v1",
  role: "authenticated",
  sub: USER_ID
});
const MCP_TOKEN = jwt({
  aud: MCP_RESOURCE,
  client_id: MCP_CLIENT_ID,
  exp: 2_000_000_000,
  iat: 1_700_000_000,
  iss: "https://project.example/auth/v1",
  role: "authenticated",
  sub: USER_ID
});

function protectedMcpClaims(overrides = {}) {
  const now = Math.floor(Date.now() / 1_000);
  return {
    aal: "aal1",
    aralearn_session_id: MCP_SOURCE_SESSION_ID,
    aud: MCP_RESOURCE,
    client_id: MCP_CLIENT_ID,
    email: "",
    exp: now + 3_600,
    iat: now - 30,
    is_anonymous: false,
    iss: "https://project.example/auth/v1",
    phone: "",
    role: "authenticated",
    scope: "offline_access",
    session_id: MCP_PAIRWISE_SESSION_ID,
    sub: MCP_PAIRWISE_SUBJECT,
    ...overrides
  };
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function syntheticPdf(label = "fixture") {
  return new TextEncoder().encode(
    `%PDF-1.7\n% ${label}\n1 0 obj\n<< /Type /Catalog >>\nendobj\n` +
      "startxref\n42\n%%EOF\n"
  );
}

function pdfSourceDocument(overrides = {}) {
  return {
    kind: "document",
    defaultRoles: ["technical_conceptual"], citationMode: "manual", bibliographic: createEmptyCourseSourceBibliographicMetadata(),
    title: "Documento autorizado",
    authors: [],
    publicationDate: null,
    identifier: null,
    language: null,
    citationText: null,
    url: null,
    editionOrVersion: null,
    origin: "author_provided",
    availability: "private",
    verificationStatus: "author_verified",
    studyVisibility: "hidden",
    ...overrides
  };
}

const ANNOTATION_ID = "80000000-0000-4000-8000-000000000008";

function anchoredAnnotation({
  channel = "authoring_interface",
  targetKind = "study_unit",
  targetId = "unit-a",
  contributorKind = "protected_person"
} = {}) {
  const path = [
    { kind: "course", id: COURSE_ID, label: "Curso", version: 7 },
    { kind: targetKind, id: targetId,
      label: targetKind === "source" ? "Fonte" : "Unidade", version: 2 }
  ];
  return {
    contract: "aralearn.course-anchored-annotation.v1",
    annotationId: ANNOTATION_ID,
    annotationVersion: 1,
    courseId: COURSE_ID,
    provenance: { origin: "author", channel },
    contributor: {
      kind: contributorKind,
      role: "author",
      ref: contributorKind === "self" ? "self" : "person-0123456789abcdef",
      label: contributorKind === "self" ? "Você" : "Pessoa autora"
    },
    target: {
      kind: targetKind,
      id: targetId,
      observedPath: path,
      currentAvailable: true,
      currentPath: path,
      deepLink: "https://sql.example/alvo-literal"
    },
    observedRevision: { certainty: "known", courseRevision: 7, targetVersion: 2 },
    rawText: "Possível erro nesta Unidade.",
    category: "possible_error",
    briefSummary: "Possível erro na Unidade",
    subjectClassification: {
      status: "unclassified",
      automatic: {
        method: "target_scope_unclassified",
        methodVersion: 1,
        taxonomyRevision: 7,
        subjects: []
      },
      effective: {
        method: "target_scope_unclassified",
        methodVersion: 1,
        taxonomyRevision: 7,
        subjects: []
      },
      correctedAt: null
    },
    state: "open",
    ownerResponse: null,
    timestamps: {
      capturedAt: null,
      createdAt: "2026-08-17T12:00:00.000Z",
      updatedAt: "2026-08-17T12:00:00.000Z",
      firstConsideredAt: null,
      respondedAt: null,
      resolvedAt: null,
      withdrawnAt: null
    },
    capabilities: {
      canRevise: true,
      canWithdraw: true,
      canConsider: true,
      canRespond: false,
      canResolve: true,
      canReopen: false,
      canCorrectSubjects: true
    },
    deepLink: "https://sql.example/observacao-literal"
  };
}

function anchoredQuery({ mode = "inbox", targetKind = "study_unit", targetId = null,
  includeDescendants = false } = {}) {
  return {
    mode,
    origins: [],
    channels: [],
    states: ["open"],
    categories: [],
    includeUncategorized: true,
    subjectIds: [],
    hierarchy: targetId === null ? null : {
      target: { kind: targetKind, id: targetId },
      includeDescendants
    },
    annotationId: null
  };
}

function anchoredPage(query, item = anchoredAnnotation()) {
  return {
    contract: "aralearn.course-anchored-annotation-page.v1",
    courseId: COURSE_ID,
    courseRevision: 7,
    annotationSetVersion: 4,
    query,
    summary: {
      matchingTotal: 1,
      byOrigin: { author: 1 },
      byChannel: { [item.provenance.channel]: 1 },
      byState: { open: 1 },
      unclassifiedTotal: 1
    },
    items: [item],
    hasMore: false,
    nextCursor: null
  };
}

function anchoredChange(item, {
  requestId = "request-annotation-adapter-1",
  courseRevision = 7,
  idempotent = false
} = {}) {
  return {
    contract: "aralearn.course-anchored-annotation-change.v1",
    courseId: COURSE_ID,
    courseRevision,
    annotationSetVersion: 5,
    requestId,
    idempotent,
    changed: !idempotent,
    annotation: item
  };
}

function adapter(fetchImpl, options = {}) {
  return new CourseSupabaseAdapter({
    supabaseUrl: "https://project.example",
    serverApiKey: "sb_secret_test",
    publishableKey: "sb_publishable_test",
    publicAppUrl: "https://app.example/AraLearn/",
    fetchImpl,
    attempts: 1,
    ...options
  });
}

test("RPCs OAuth não convertem falhas de concessão em erro de Curso", async () => {
  const value = adapter(async () => json({
    code: "22023",
    message: "O callback OAuth não é um endereço oficial vinculado ao cliente."
  }, 422));

  await assert.rejects(
    () => value.createActionOAuthAuthorization({
      clientId: MCP_CLIENT_ID,
      redirectUri: "https://example.test/callback",
      state: "estado-oauth",
      scope: "openid"
    }),
    (error) => error.status === 400 && error.code === "invalid_request"
  );
  await assert.rejects(
    () => value.exchangeActionOAuthCode({
      clientId: MCP_CLIENT_ID,
      clientSecretHash: "a".repeat(64),
      codeHash: "b".repeat(64),
      redirectUri: "https://example.test/callback",
      accessTokenHash: "c".repeat(64),
      refreshTokenHash: "d".repeat(64),
      grantId: COURSE_ID
    }),
    (error) => error.status === 400 && error.code === "invalid_grant"
  );
  await assert.rejects(
    () => value.rpc("course_command_fixture", {}),
    (error) => error.status === 422 && error.code === "invalid_course_command"
  );

  const unavailable = adapter(async () => json({
    code: "XX000",
    message: "Falha interna."
  }, 500));
  await assert.rejects(
    () => unavailable.createActionOAuthAuthorization({
      clientId: MCP_CLIENT_ID,
      redirectUri: "https://chatgpt.com/aip/g-real-callback/oauth/callback",
      state: "estado-oauth",
      scope: "openid"
    }),
    (error) => error.status === 503 && error.code === "temporarily_unavailable"
  );
  await assert.rejects(
    () => unavailable.rpc("course_command_fixture", {}),
    (error) => error.status === 503 && error.code === "course_service_unavailable"
  );

  const unreachable = adapter(async () => {
    throw new TypeError("network down");
  });
  await assert.rejects(
    () => unreachable.exchangeActionOAuthRefresh({
      clientId: MCP_CLIENT_ID,
      clientSecretHash: "a".repeat(64),
      refreshTokenHash: "b".repeat(64),
      accessTokenHash: "c".repeat(64),
      newRefreshTokenHash: "d".repeat(64)
    }),
    (error) => error.status === 503 && error.code === "temporarily_unavailable"
  );
});


test("configuração de serviço recusa schemes executáveis nos deep links", () => {
  assert.throws(() => adapter(async () => json({}), {
    publicAppUrl: "javascript:alert(1)"
  }), /URL pública do AraLearn inválida/u);
  assert.throws(() => adapter(async () => json({}), {
    supabaseUrl: "data:text/plain,segredo"
  }), /SUPABASE_URL inválida/u);
  assert.doesNotThrow(() => adapter(async () => json({}), {
    supabaseUrl: "http://127.0.0.1:54321",
    publicAppUrl: "http://127.0.0.1:4173/AraLearn/"
  }));
});

test("Analytics usa o RPC snapshot v3 e acrescenta somente o deep link fora do banco", async () => {
  const calls = [];
  const query = {
    scope: { kind: "course", ref: null }
  };
  const value = adapter(async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return json(analyticsSnapshot());
  });
  const page = await value.getCourseAuthoringAnalytics({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    expectedCourseRevision: 7,
    query
  });

  assert.match(calls[0].url, /get_owned_course_authoring_analytics_for_actor_v3$/u);
  assert.deepEqual(calls[0].body, {
    p_actor_id: USER_ID,
    p_course_id: COURSE_ID,
    p_expected_course_revision: 7,
    p_query: query
  });
  assert.equal(page.contract, "aralearn.course-authoring-analytics.v3");
  assert.equal(page.design.studyUnitCount, 0);
  assert.equal(Object.hasOwn(page, "facts"), false);
  assert.equal(page.deepLink,
    `https://app.example/AraLearn/#/authoring/courses/${COURSE_ID}` +
      "?section=research&analyticsScopeKind=course&analyticsRevision=7");
});








test("observações owner preservam projeção protegida, links literais e parâmetros ligados", async () => {
  const query = anchoredQuery({ mode: "target", targetId: "unit-a" });
  const item = anchoredAnnotation();
  let request = null;
  const value = adapter(async (url, init) => {
    assert.match(url, /get_owned_course_anchored_annotations_for_actor_v1$/u);
    request = JSON.parse(init.body);
    return json(anchoredPage(
      Object.fromEntries(Object.entries(query).reverse()),
      item
    ));
  });

  const result = await value.getCourseAnchoredAnnotations({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    expectedCourseRevision: 7,
    annotationSetVersion: null,
    query,
    cursor: null,
    limit: 12
  });

  assert.deepEqual(request, {
    p_actor_id: USER_ID,
    p_course_id: COURSE_ID,
    p_expected_course_revision: 7,
    p_annotation_set_version: null,
    p_mode: "target",
    p_origins: [],
    p_channels: [],
    p_states: ["open"],
    p_categories: [],
    p_include_uncategorized: true,
    p_subject_ids: [],
    p_target_kind: "study_unit",
    p_target_id: "unit-a",
    p_include_descendants: false,
    p_annotation_id: null,
    p_cursor: null,
    p_limit: 12
  });
  assert.equal(result.items[0].contributor.kind, "protected_person");
  assert.equal(result.items[0].contributor.ref, "person-0123456789abcdef");
  assert.equal(result.items[0].target.deepLink, "https://sql.example/alvo-literal");
  assert.equal(result.items[0].deepLink, "https://sql.example/observacao-literal");
});

test("Adapter consulta Fonte e envia a proveniência declarada da reformulação", async () => {
  const calls = [];
  const query = anchoredQuery({
    mode: "target",
    targetKind: "source",
    targetId: "source-a",
    includeDescendants: true
  });
  const consideredSourceLinks = [{
    sourceId: "source-a",
    linkId: "source-a", roles: [], occurrences: [],
    relation: "supported_by",
    anchors: [{ anchorId: "anchor-a" }]
  }];
  const responseItem = anchoredAnnotation({
    targetKind: "source",
    targetId: "source-a",
    contributorKind: "self"
  });
  responseItem.annotationVersion = 2;
  responseItem.ownerResponse = {
    text: "Interpretação reformulada.",
    kind: "reformulation",
    consideredSourceLinks,
    updatedAt: "2026-08-20T12:00:00.000Z"
  };
  responseItem.timestamps.respondedAt = "2026-08-20T12:00:00.000Z";
  const value = adapter(async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    if (/get_owned_course_anchored_annotations_for_actor_v1$/u.test(url)) {
      return json(anchoredPage(query, anchoredAnnotation({
        targetKind: "source",
        targetId: "source-a"
      })));
    }
    return json(anchoredChange(responseItem, {
      requestId: "request-source-reformulation-1"
    }));
  });

  await value.getCourseAnchoredAnnotations({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    expectedCourseRevision: 7,
    annotationSetVersion: null,
    query,
    cursor: null,
    limit: 24
  });
  assert.equal(calls[0].body.p_target_kind, "source");
  assert.equal(calls[0].body.p_target_id, "source-a");
  assert.equal(calls[0].body.p_include_descendants, true);

  const command = {
    type: "respond_to_anchored_annotation",
    annotationId: ANNOTATION_ID,
    expectedAnnotationVersion: 1,
    ownerResponse: "Interpretação reformulada.",
    responseKind: "reformulation",
    consideredSourceLinks
  };
  const result = await value.executeCourseAnchoredAnnotationCommand({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    requestId: "request-source-reformulation-1",
    expectedCourseRevision: null,
    command
  });
  assert.deepEqual(calls[1].body.p_command, command);
  assert.deepEqual(result.annotation.ownerResponse.consideredSourceLinks,
    consideredSourceLinks);
});

test("observações owner limitam cada resposta a 262144 bytes", async () => {
  const value = adapter(async () => new Response("{}", {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": "262145"
    }
  }));
  await assert.rejects(
    () => value.getCourseAnchoredAnnotations({
      principal: { actorId: USER_ID, authenticationKind: "application" },
      courseId: COURSE_ID,
      expectedCourseRevision: 7,
      annotationSetVersion: null,
      query: anchoredQuery(),
      cursor: null,
      limit: 12
    }),
    (error) => error.status === 413 &&
      error.code === "course_anchored_annotations_response_too_large"
  );
  await assert.rejects(
    () => value.executeCourseAnchoredAnnotationCommand({
      principal: { actorId: USER_ID, authenticationKind: "application" },
      courseId: COURSE_ID,
      requestId: "request-annotation-large-1",
      expectedCourseRevision: 7,
      command: {
        type: "create_anchored_annotation",
        annotationId: ANNOTATION_ID,
        target: { kind: "study_unit", id: "unit-a" },
        rawText: "Texto",
        category: null,
        capturedAt: null,
        briefSummary: null
      }
    }),
    (error) => error.status === 413 &&
      error.code === "course_anchored_annotations_response_too_large"
  );
});

test("observação ou alvo ausente não apagam o sinal distinto de acesso revogado", async () => {
  for (const code of [
    "course_anchored_annotation_not_found",
    "course_anchored_annotation_target_not_found",
    "PT404"
  ]) {
    const value = adapter(async () => json({ code, message: "ausente" }, 400));
    await assert.rejects(
      () => value.getCourseAnchoredAnnotations({
        principal: { actorId: USER_ID, authenticationKind: "application" },
        courseId: COURSE_ID,
        expectedCourseRevision: 7,
        annotationSetVersion: null,
        query: anchoredQuery(),
        cursor: null,
        limit: 12
      }),
      (error) => error.status === 404 && error.code === code
    );
  }
});

test("canal autoral deriva somente da principal e criação liga alvo confirmado", async () => {
  for (const [authenticationKind, expectedChannel, suffix] of [
    ["application", "authoring_interface", "app"],
    ["oauth", "authoring_chat", "chat"],
    ["action", "authoring_chat", "actions"]
  ]) {
    let request = null;
    const requestId = `request-annotation-${suffix}-1`;
    const value = adapter(async (url, init) => {
      assert.match(url, /execute_course_anchored_annotation_command_for_actor_v1$/u);
      request = JSON.parse(init.body);
      return json(anchoredChange(anchoredAnnotation({
        channel: expectedChannel,
        contributorKind: "self"
      }), { requestId }));
    });
    const command = {
      type: "create_anchored_annotation",
      annotationId: ANNOTATION_ID,
      target: { kind: "study_unit", id: "unit-a" },
      rawText: "Possível erro nesta Unidade.",
      category: "possible_error",
      capturedAt: null,
      briefSummary: "Possível erro na Unidade"
    };

    const result = await value.executeCourseAnchoredAnnotationCommand({
      principal: { actorId: USER_ID, authenticationKind },
      courseId: COURSE_ID,
      requestId,
      expectedCourseRevision: 7,
      command
    });
    assert.equal(result.annotation.provenance.channel, expectedChannel);
    assert.equal(request.p_channel, expectedChannel);
    assert.deepEqual(request.p_command, command);
    assert.equal(Object.hasOwn(request.p_command, "channel"), false);
    assert.equal(Object.hasOwn(request.p_command, "origin"), false);
  }

  const mismatched = adapter(async () => json(anchoredChange(
    anchoredAnnotation({ targetId: "unit-b", contributorKind: "self" }),
    { requestId: "request-annotation-target-1" }
  )));
  await assert.rejects(
    () => mismatched.executeCourseAnchoredAnnotationCommand({
      principal: { actorId: USER_ID, authenticationKind: "application" },
      courseId: COURSE_ID,
      requestId: "request-annotation-target-1",
      expectedCourseRevision: 7,
      command: {
        type: "create_anchored_annotation",
        annotationId: ANNOTATION_ID,
        target: { kind: "study_unit", id: "unit-a" },
        rawText: "Possível erro nesta Unidade.",
        category: "possible_error",
        capturedAt: null,
        briefSummary: null
      }
    }),
    (error) => error.code === "course_service_unavailable"
  );
});

test("batch de Observações usa uma transação e aceita replay do mesmo conjunto", async () => {
  const requestId = "request-annotation-batch-1";
  const commands = [ANNOTATION_ID,
    "80000000-0000-4000-8000-000000000009"].map((annotationId, index) => ({
      type: "create_anchored_annotation",
      annotationId,
      target: { kind: "study_unit", id: `unit-${index + 1}` },
      rawText: "A transição precisa ser revista.",
      category: "suggestion",
      capturedAt: "2026-09-02T10:00:00.000Z",
      briefSummary: null
    }));
  const calls = [];
  const value = adapter(async (url, init) => {
    assert.match(url, /create_course_anchored_annotations_for_actor_v1$/u);
    calls.push(JSON.parse(init.body));
    return json({
      contract: "aralearn.course-anchored-annotations-change.v1",
      courseId: COURSE_ID,
      courseRevision: 7,
      annotationSetVersion: 12,
      requestId,
      idempotent: calls.length > 1,
      changed: true,
      createdCount: 2
    });
  });
  const input = {
    principal: { actorId: USER_ID, authenticationKind: "oauth" },
    courseId: COURSE_ID,
    requestId,
    expectedCourseRevision: 7,
    commands
  };
  const first = await value.createCourseAnchoredAnnotations(input);
  const replay = await value.createCourseAnchoredAnnotations(input);

  assert.equal(first.idempotent, false);
  assert.equal(replay.idempotent, true);
  assert.equal(first.createdCount, 2);
  assert.deepEqual(calls[0], calls[1]);
  assert.deepEqual(calls[0].p_commands, commands);
  assert.equal(calls[0].p_channel, "authoring_chat");

  await assert.rejects(() => value.createCourseAnchoredAnnotations({
    ...input,
    commands: [commands[0], { ...commands[1], target: commands[0].target }]
  }), (error) => error.code === "invalid_course_anchored_annotation_batch");
  assert.equal(calls.length, 2);
});

test("replay idempotente aceita revisão corrente sem relaxar identidade e alvo", async () => {
  const requestId = "request-annotation-replay-1";
  const value = adapter(async () => json(anchoredChange(
    anchoredAnnotation({ contributorKind: "self" }),
    { requestId, courseRevision: 8, idempotent: true }
  )));
  const result = await value.executeCourseAnchoredAnnotationCommand({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    requestId,
    expectedCourseRevision: 7,
    command: {
      type: "create_anchored_annotation",
      annotationId: ANNOTATION_ID,
      target: { kind: "study_unit", id: "unit-a" },
      rawText: "Possível erro nesta Unidade.",
      category: "possible_error",
      capturedAt: null,
      briefSummary: null
    }
  });
  assert.equal(result.idempotent, true);
  assert.equal(result.courseRevision, 8);
  assert.equal(result.annotation.annotationId, ANNOTATION_ID);

  const regressed = adapter(async () => json(anchoredChange(
    anchoredAnnotation({ contributorKind: "self" }),
    { requestId, courseRevision: 6, idempotent: true }
  )));
  await assert.rejects(
    () => regressed.executeCourseAnchoredAnnotationCommand({
      principal: { actorId: USER_ID, authenticationKind: "application" },
      courseId: COURSE_ID,
      requestId,
      expectedCourseRevision: 7,
      command: {
        type: "create_anchored_annotation",
        annotationId: ANNOTATION_ID,
        target: { kind: "study_unit", id: "unit-a" },
        rawText: "Possível erro nesta Unidade.",
        category: "possible_error",
        capturedAt: null,
        briefSummary: null
      }
    }),
    (error) => error.code === "course_service_unavailable"
  );
});

function componentCatalog() {
  return structuredClone(COURSE_COMPONENT_CATALOG);
}

function defaultComponentPolicy(excludedRefs = []) {
  return {
    catalogVersion: COURSE_COMPONENT_CATALOG.version,
    availability: "all",
    allowedRefs: [],
    excludedRefs,
    preferredRefs: []
  };
}




function courseDesignRead() {
  return {
    contract: "aralearn.course-design.v3",
    courseId: COURSE_ID,
    courseRevision: 5,
    parameterCatalogVersion: COURSE_DESIGN_PARAMETER_CATALOG_VERSION,
    scopeContext: {
      current: { kind: "course", ref: COURSE_ID, label: "Curso" },
      ancestors: [],
      children: [],
      childCount: 0,
      hasMoreChildren: false,
      nextChildCursor: null
    },
    targetPlanItems: null,
    definitions: structuredClone(COURSE_DESIGN_PARAMETER_DEFINITIONS),
    parameters: COURSE_DESIGN_PARAMETER_DEFINITIONS.map((definition) => ({
      parameterId: definition.id,
      localAssignment: null,
      conflicts: [],
      effectiveAssignment: {
        mode: "automatic",
        value: null,
        origin: "system_default",
        reason: "Hipótese padrão de produto.",
        sourceScope: null,
        inherited: false
      }
    })),
    guidance: { localAssignment: null, effectiveAssignments: [] },
    componentCatalog: componentCatalog(),
    componentPolicy: {
      localAssignment: null,
      effectiveAssignment: {
        policy: defaultComponentPolicy(),
        origin: "system_default",
        reason: "Todos os componentes instalados estão disponíveis por padrão.",
        sourceScope: null,
        inherited: false
      }
    }
  };
}

function studyUnitCourseDesignRead() {
  const read = courseDesignRead();
  read.scopeContext = {
    current: { kind: "study_unit", ref: "unit-a", label: "Unidade A" },
    ancestors: [
      { kind: "course", ref: COURSE_ID, label: "Curso" },
      { kind: "module", ref: "module-a", label: "Módulo A" },
      { kind: "lesson", ref: "lesson-a", label: "Lição A" },
      {
        kind: "didactic_microsequence",
        ref: "micro-a",
        label: "Microssequência A"
      }
    ],
    children: [],
    childCount: 0,
    hasMoreChildren: false,
    nextChildCursor: null
  };
  read.targetPlanItems = {
    instructionalAnalysisUnitIds: [PLAN_ID],
    evidenceRequirementIds: [STEP_ID]
  };
  return read;
}

test("interrompe a leitura quando a resposta do banco excede o teto em bytes", async () => {
  let cancelled = false;
  const encoder = new TextEncoder();
  const value = adapter(async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('{"items":["'));
      controller.enqueue(encoder.encode("x".repeat(80)));
      controller.enqueue(encoder.encode('"]}'));
    },
    cancel() {
      cancelled = true;
    }
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  }), { responseLimitBytes: 64 });

  await assert.rejects(
    () => value.listCourses({ principal: { actorId: USER_ID } }),
    (error) => error.status === 413 && error.code === "course_response_too_large"
  );
  assert.equal(cancelled, true);
});

test("indisponibilidade do serviço não expõe o provedor na mensagem humana", async () => {
  const value = adapter(async () => {
    throw new Error("falha de rede sintética");
  });

  await assert.rejects(
    () => value.listCourses({ principal: { actorId: USER_ID } }),
    (error) => error.status === 503 && error.code === "course_service_unavailable" &&
      error.message === "Não foi possível alcançar o serviço." &&
      !/supabase/iu.test(error.message)
  );
});

test("autentica sessão do aplicativo sem resolver governança paralela", async () => {
  const calls = [];
  const value = adapter(async (url, init) => {
    calls.push({ url, init });
    return json({ id: USER_ID });
  });
  const principal = await value.resolveApplicationPrincipal(APPLICATION_TOKEN);

  assert.deepEqual(principal, {
    actorId: USER_ID,
    authenticationKind: "application",
    scopes: ["authoring:read", "authoring:write"]
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/auth\/v1\/user$/u);
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${APPLICATION_TOKEN}`);
});

test("recusa token OAuth do MCP antes de consultar a identidade do aplicativo", async () => {
  let calls = 0;
  const value = adapter(async () => {
    calls += 1;
    return json({ id: USER_ID });
  });

  await assert.rejects(
    () => value.resolveApplicationPrincipal(MCP_TOKEN),
    (error) => error.status === 401 && error.code === "invalid_application_token"
  );
  assert.equal(calls, 0);
});

test("autentica o MCP pela assinatura e pela autorização viva sem reutilizar o bearer no Auth", async () => {
  const calls = [];
  const verifierCalls = [];
  const value = adapter(async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, init, body });
    return json({
      contract: "aralearn.mcp-oauth-principal.v1",
      actorId: USER_ID,
      oauthClientId: MCP_CLIENT_ID
    });
  }, {
    oauthJwtVerifier: {
      async verify(token, options) {
        verifierCalls.push({ token, options });
        return protectedMcpClaims();
      }
    }
  });

  const principal = await value.resolvePrincipal({
    kind: "oauth",
    credential: "token-assinado",
    resource: MCP_RESOURCE
  }, { deadlineAt: 2_000_000_000_000 });

  assert.deepEqual(principal, {
    actorId: USER_ID,
    authenticationKind: "oauth",
    scopes: ["authoring:read", "authoring:write"],
    oauthClientId: MCP_CLIENT_ID
  });
  assert.deepEqual(verifierCalls, [{
    token: "token-assinado",
    options: { deadlineAt: 2_000_000_000_000 }
  }]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/rest\/v1\/rpc\/resolve_mcp_oauth_principal_v1$/u);
  assert.equal(calls[0].init.headers.apikey, "sb_secret_test");
  assert.equal(calls[0].init.headers.Authorization, undefined);
  assert.deepEqual(calls[0].body, {
    p_pairwise_sub: MCP_PAIRWISE_SUBJECT,
    p_pairwise_session_id: MCP_PAIRWISE_SESSION_ID,
    p_client_id: MCP_CLIENT_ID,
    p_source_session_id: MCP_SOURCE_SESSION_ID
  });
  assert.equal(calls.some(({ url }) => url.endsWith("/auth/v1/user")), false);
});

test("recusa scope de identidade antes do RPC e converte revogação em token inválido", async () => {
  let calls = 0;
  const scopeValue = adapter(async () => {
    calls += 1;
    return json(null);
  }, {
    oauthJwtVerifier: { async verify() { return protectedMcpClaims({ scope: "openid" }); } }
  });
  await assert.rejects(
    () => scopeValue.resolvePrincipal({
      kind: "oauth", credential: "token", resource: MCP_RESOURCE
    }),
    (error) => error.status === 401 && error.code === "invalid_oauth_token"
  );
  assert.equal(calls, 0);

  const revoked = adapter(async () => json({ code: "42501", message: "revogado" }, 403), {
    oauthJwtVerifier: { async verify() { return protectedMcpClaims(); } }
  });
  await assert.rejects(
    () => revoked.resolvePrincipal({
      kind: "oauth", credential: "token", resource: MCP_RESOURCE
    }),
    (error) => error.status === 401 && error.code === "invalid_oauth_token"
  );
});

test("exclusão da conta usa o JWT pessoal no RPC e tolera repetição após resposta perdida", async () => {
  const calls = [];
  const value = adapter(async (url, init) => {
    const body = init.body == null ? null : JSON.parse(init.body);
    calls.push({ url, init, body });
    if (url.endsWith("/auth/v1/user")) return json({ id: USER_ID });
    const rpcCalls = calls.filter((call) => call.url.endsWith("/delete_my_account_v1"));
    if (rpcCalls.length === 1) {
      return json({ code: "PGRST000", message: "Resposta perdida" }, 503);
    }
    return json({ contract: "aralearn.account-deletion.v1", status: "deleted" });
  }, { attempts: 2 });

  const result = await value.deleteMyAccount({
    accessToken: APPLICATION_TOKEN,
    confirmation: "EXCLUIR MINHA CONTA"
  });
  assert.deepEqual(result, {
    contract: "aralearn.account-deletion.v1",
    status: "deleted"
  });
  assert.equal(calls.length, 2);
  const rpcCalls = calls.filter((call) => call.url.endsWith("/delete_my_account_v1"));
  assert.equal(rpcCalls.length, 2);
  for (const call of rpcCalls) {
    assert.match(call.url, /\/rest\/v1\/rpc\/delete_my_account_v1$/u);
    assert.equal(call.init.headers.apikey, "sb_publishable_test");
    assert.equal(call.init.headers.Authorization, `Bearer ${APPLICATION_TOKEN}`);
    assert.deepEqual(call.body, { p_confirmation: "EXCLUIR MINHA CONTA" });
  }
});

test("exclusão bloqueada limpa com service_role apenas os prefixos da pessoa autenticada", async () => {
  const calls = [];
  let deletionCalls = 0;
  const pdfName = `${"a".repeat(64)}.pdf`;
  const avatarName = `${AUDIT_RUN_ID}.webp`;
  const value = adapter(async (url, init) => {
    const body = init.body == null ? null : JSON.parse(init.body);
    calls.push({ url, init, body });
    if (url.endsWith("/rest/v1/rpc/delete_my_account_v1")) {
      deletionCalls += 1;
      return deletionCalls === 1
        ? json({ code: "AR001", message: "Remova os PDFs privados dos Cursos." }, 500)
        : json({ contract: "aralearn.account-deletion.v1", status: "deleted" });
    }
    if (url.endsWith("/auth/v1/user")) return json({ id: USER_ID });
    if (url.endsWith("/rest/v1/rpc/list_owned_courses_for_actor_v1")) {
      return body.p_before_id == null
        ? json({
            contract: "aralearn.course-list.v1",
            items: [{ courseId: COURSE_ID }],
            hasMore: true,
            nextCursor: {
              beforeUpdatedAt: "2026-08-20T12:00:00Z",
              beforeId: COURSE_ID
            }
          })
        : json({
            contract: "aralearn.course-list.v1",
            items: [{ courseId: OTHER_COURSE_ID }],
            hasMore: false,
            nextCursor: null
          });
    }
    if (url.endsWith("/storage/v1/object/list/course-source-pdfs")) {
      return json(body.prefix === `${COURSE_ID}/` ? [{ name: pdfName }] : []);
    }
    if (url.endsWith("/storage/v1/object/list/person-avatars")) {
      return json([{ name: avatarName }]);
    }
    if (url.endsWith("/storage/v1/object/course-source-pdfs") ||
        url.endsWith("/storage/v1/object/person-avatars")) {
      return json({});
    }
    assert.fail(`Requisição inesperada: ${url}`);
  });

  const result = await value.deleteMyAccount({
    accessToken: APPLICATION_TOKEN,
    confirmation: "EXCLUIR MINHA CONTA"
  });
  assert.equal(result.status, "deleted");
  assert.equal(deletionCalls, 2);

  const userCalls = calls.filter(({ url }) =>
    url.endsWith("/delete_my_account_v1") || url.endsWith("/auth/v1/user"));
  for (const call of userCalls) {
    assert.equal(call.init.headers.apikey, "sb_publishable_test");
    assert.equal(call.init.headers.Authorization, `Bearer ${APPLICATION_TOKEN}`);
  }
  const privilegedCalls = calls.filter(({ url }) =>
    url.includes("list_owned_courses_for_actor_v1") || url.includes("/storage/v1/object/"));
  assert.ok(privilegedCalls.length >= 1);
  for (const call of privilegedCalls) {
    assert.equal(call.init.headers.apikey, "sb_secret_test");
    assert.equal(call.init.headers.Authorization, undefined);
  }
  const coursePages = calls.filter(({ url }) => url.endsWith("list_owned_courses_for_actor_v1"));
  assert.deepEqual(coursePages.map(({ body }) => [body.p_actor_id, body.p_before_id]), [
    [USER_ID, null],
    [USER_ID, COURSE_ID]
  ]);
  const deletes = calls.filter(({ init, url }) =>
    init.method === "DELETE" && url.includes("/storage/v1/object/"));
  assert.deepEqual(deletes.map(({ body }) => body), [
    { prefixes: [`${COURSE_ID}/${pdfName}`] },
    { prefixes: [`${USER_ID}/${avatarName}`] }
  ]);
});

test("exclusão sem resposta terminal conserva replay explícito antes de limpar o dispositivo", async () => {
  let deletionCalls = 0;
  const value = adapter(async (url) => {
    assert.match(url, /\/rest\/v1\/rpc\/delete_my_account_v1$/u);
    deletionCalls += 1;
    if (deletionCalls <= 2) {
      return json({ code: "PGRST000", message: "Resposta indisponível." }, 503);
    }
    return json({ contract: "aralearn.account-deletion.v1", status: "deleted" });
  }, { attempts: 2 });

  await assert.rejects(
    () => value.deleteMyAccount({
      accessToken: APPLICATION_TOKEN,
      confirmation: "EXCLUIR MINHA CONTA"
    }),
    (error) => error.status === 503 && error.code === "account_deletion_in_progress"
  );
  assert.equal(deletionCalls, 2);

  assert.deepEqual(await value.deleteMyAccount({
    accessToken: APPLICATION_TOKEN,
    confirmation: "EXCLUIR MINHA CONTA"
  }), {
    contract: "aralearn.account-deletion.v1",
    status: "deleted"
  });
  assert.equal(deletionCalls, 3);
});

test("exclusão iniciada informa ambiguidade retomável se a resposta do commit se perder", async () => {
  const calls = [];
  let deletionCalls = 0;
  let deletionRetried = false;
  let accountDeleted = false;
  const pdfName = `${"b".repeat(64)}.pdf`;
  const value = adapter(async (url, init) => {
    const body = init.body == null ? null : JSON.parse(init.body);
    calls.push({ url, init, body });
    if (url.endsWith("/rest/v1/rpc/delete_my_account_v1")) {
      deletionCalls += 1;
      if (deletionCalls === 1) {
        return json({ code: "AR001", message: "Remova os PDFs privados." }, 500);
      }
      if (!deletionRetried) {
        deletionRetried = true;
        accountDeleted = true;
        return json({ code: "PGRST000", message: "Resposta indisponível." }, 503);
      }
      assert.equal(accountDeleted, true, "o replay deve confirmar um commit já realizado");
      return json({ contract: "aralearn.account-deletion.v1", status: "deleted" });
    }
    if (url.endsWith("/auth/v1/user")) return json({ id: USER_ID });
    if (url.endsWith("/rest/v1/rpc/list_owned_courses_for_actor_v1")) {
      return json({
        contract: "aralearn.course-list.v1",
        items: [{ courseId: COURSE_ID }],
        hasMore: false,
        nextCursor: null
      });
    }
    if (url.endsWith("/storage/v1/object/list/course-source-pdfs")) {
      return json([{ name: pdfName }]);
    }
    if (url.endsWith("/storage/v1/object/list/person-avatars")) return json([]);
    if (url.endsWith("/storage/v1/object/course-source-pdfs")) return json({});
    assert.fail(`Requisição inesperada: ${url}`);
  });

  await assert.rejects(
    () => value.deleteMyAccount({
      accessToken: APPLICATION_TOKEN,
      confirmation: "EXCLUIR MINHA CONTA"
    }),
    (error) => error.status === 503 &&
      error.code === "account_deletion_in_progress" &&
      /pode já ter sido excluída ou ainda aguardar a etapa final/u.test(error.message)
  );
  const deletesAfterFailure = calls.filter(({ init, url }) =>
    init.method === "DELETE" && url.includes("/storage/v1/object/"));
  assert.equal(deletesAfterFailure.length, 1);

  const result = await value.deleteMyAccount({
    accessToken: APPLICATION_TOKEN,
    confirmation: "EXCLUIR MINHA CONTA"
  });
  assert.deepEqual(result, {
    contract: "aralearn.account-deletion.v1",
    status: "deleted"
  });
  assert.equal(deletionCalls, 3);
  assert.equal(calls.filter(({ init, url }) =>
    init.method === "DELETE" && url.includes("/storage/v1/object/")).length, 1);
});

test("exclusão não apaga Storage diante de violação relacional alheia", async () => {
  const calls = [];
  const value = adapter(async (url) => {
    calls.push(url);
    if (url.endsWith("/auth/v1/user")) return json({ id: USER_ID });
    return json({ code: "23514", message: "Constraint relacional não satisfeita." }, 400);
  });

  await assert.rejects(
    () => value.deleteMyAccount({
      accessToken: APPLICATION_TOKEN,
      confirmation: "EXCLUIR MINHA CONTA"
    }),
    (error) => error.status === 422 && error.code === "invalid_course_command"
  );
  assert.deepEqual(calls, [
    "https://project.example/rest/v1/rpc/delete_my_account_v1"
  ]);
});

test("lista por RPC de Curso e acrescenta deep link fora do banco", async () => {
  let payload = null;
  const value = adapter(async (url, init) => {
    assert.match(url, /\/rpc\/list_owned_courses_for_actor_v1$/u);
    payload = JSON.parse(init.body);
    return json({
      contract: "aralearn.course-list.v1",
      items: [{ courseId: COURSE_ID, title: "Curso" }],
      hasMore: false,
      nextCursor: null
    });
  });
  const result = await value.listCourses({
    principal: { actorId: USER_ID },
    query: "curso",
    limit: 12
  });

  assert.equal(payload.p_actor_id, USER_ID);
  assert.equal(payload.p_limit, 12);
  assert.equal(
    result.items[0].deepLink,
    `https://app.example/AraLearn/#/authoring/courses/${COURSE_ID}?section=planning`
  );
});

test("não transforma id genérico em identidade ou deep link de Curso", async () => {
  const value = adapter(async () => json({
    contract: "aralearn.course-list.v1",
    items: [{ id: COURSE_ID, title: "Contrato inválido" }],
    hasMore: false,
    nextCursor: null
  }));
  const result = await value.listCourses({
    principal: { actorId: USER_ID },
    limit: 12
  });

  assert.equal(result.items[0].id, COURSE_ID);
  assert.equal(Object.hasOwn(result.items[0], "deepLink"), false);
});

test("lê entidades para o MCP com ator e cerca de versão", async () => {
  let payload = null;
  const value = adapter(async (url, init) => {
    assert.match(url, /\/rpc\/list_owned_course_entities_for_actor_v1$/u);
    payload = JSON.parse(init.body);
    return json({ courseId: COURSE_ID, revision: 7, items: [], hasMore: false });
  });
  const result = await value.listCourseEntities({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    expectedRevision: 7,
    limit: 40,
    afterEntityType: "lesson",
    afterEntityId: "lesson-a"
  });
  assert.equal(result.revision, 7);
  assert.equal(payload.p_actor_id, USER_ID);
  assert.equal(payload.p_expected_revision, 7);
  assert.equal(payload.p_after_entity_id, "lesson-a");
});

test("plano v3 liga escopo ao currículo e deriva o repertório das unidades correntes", async () => {
  const introducedAt = {
    studyUnitId: "unit-introduction",
    didacticMicrosequenceId: "micro-a",
    title: "Apresentação da relação"
  };
  const usedBy = [{
    studyUnitId: "unit-application",
    didacticMicrosequenceId: "micro-b",
    title: "Aplicação imediata"
  }];
  const revisitedBy = [{
    studyUnitId: "unit-recall",
    didacticMicrosequenceId: "micro-c",
    title: "Retomada em outro contexto"
  }];
  const curriculumTargets = [{
    moduleId: "module-a",
    lessonId: "lesson-a",
    didacticMicrosequenceIds: ["micro-a", "micro-b", "micro-c"]
  }];
  const developedIn = [introducedAt, ...usedBy, ...revisitedBy];
  const read = {
    contract: "aralearn.course-instructional-plan.v3",
    courseId: COURSE_ID,
    courseRevision: 7,
    plan: {
      id: PLAN_ID,
      version: 4,
      title: "Curso",
      objective: "Compreender uma relação e aplicá-la.",
      audience: "Pessoas iniciantes.",
      scope: "Relação, mecanismo e aplicação.",
      curriculum: {
        modules: [{
          id: "module-a",
          position: 0,
          title: "Relações fundamentais",
          lessons: [{
            id: "lesson-a",
            position: 0,
            title: "Da ideia à aplicação",
            microsequences: [{
              id: "micro-a", position: 0, title: "Primeiro contato"
            }, {
              id: "micro-b", position: 1, title: "Uso imediato"
            }, {
              id: "micro-c", position: 2, title: "Retomada"
            }]
          }]
        }]
      },
      curriculumScopeItems: [{
        id: CURRICULUM_SCOPE_ID,
        position: 0,
        statement: "Compreender a relação e usá-la em outro contexto.",
        state: "developed",
        curriculumTargets,
        developedIn
      }],
      preferredPartCount: { minimum: 1, maximum: 3, origin: "automatic" },
      intendedLearningOutcomes: [],
      instructionalAnalysisUnits: [{
        id: PLAN_ID,
        position: 0,
        statement: "relação focal",
        description: "Relação entre duas propriedades que precisa ser distinguida de mera coocorrência.",
        version: 2,
        introducedAt,
        usedBy,
        revisitedBy
      }],
      evidenceRequirements: [],
      parts: [],
      counts: {
        intendedLearningOutcomeCount: 0,
        instructionalAnalysisUnitCount: 1,
        evidenceRequirementCount: 0,
        authoringPartCount: 0,
        linkedDidacticMicrosequenceCount: 0,
        studyUnitCount: 3
      },
      updatedAt: "2026-09-03T12:00:00Z"
    }
  };
  let payload = null;
  const value = adapter(async (url, init) => {
    assert.match(url, /\/rpc\/get_owned_course_instructional_plan_for_actor_v3$/u);
    payload = JSON.parse(init.body);
    return json(read);
  });

  const result = await value.getCourseInstructionalPlan({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID
  });

  assert.deepEqual(payload, { p_actor_id: USER_ID, p_course_id: COURSE_ID });
  assert.equal(result.contract, "aralearn.course-instructional-plan.v3");
  assert.deepEqual(result.plan.curriculumScopeItems[0], {
    id: CURRICULUM_SCOPE_ID,
    position: 0,
    statement: "Compreender a relação e usá-la em outro contexto.",
    state: "developed",
    curriculumTargets,
    developedIn
  });
  assert.deepEqual(result.plan.instructionalAnalysisUnits[0], {
    id: PLAN_ID,
    position: 0,
    statement: "relação focal",
    description: "Relação entre duas propriedades que precisa ser distinguida de mera coocorrência.",
    version: 2,
    introducedAt,
    usedBy,
    revisitedBy
  });
  assert.equal(
    Object.hasOwn(result.plan.instructionalAnalysisUnits[0], "introducedPartPosition"),
    false,
    "Parte não pode ser usada como posição curricular da introdução."
  );
  assert.equal(
    result.deepLink,
    `https://app.example/AraLearn/#/authoring/courses/${COURSE_ID}?section=planning`
  );

  const legacy = adapter(async () => json({ ...read,
    contract: "aralearn.course-instructional-plan.v2"
  }));
  await assert.rejects(
    () => legacy.getCourseInstructionalPlan({
      principal: { actorId: USER_ID },
      courseId: COURSE_ID
    }),
    (error) => error.status === 503 && error.code === "course_service_unavailable"
  );
});

test("grava mapa curricular e lote por contratos atômicos distintos", async () => {
  const calls = [];
  const map = {
    audience: "Pessoas iniciantes.",
    prerequisites: [],
    scopeItems: [{
      id: CURRICULUM_SCOPE_ID,
      position: 0,
      statement: "Compreender a relação fundamental."
    }],
    modules: [{
      moduleId: "module-a",
      position: 0,
      title: "Fundamentos",
      objective: "Construir a relação.",
      lessons: [{
        lessonId: "lesson-a",
        position: 0,
        title: "Primeiro percurso",
        objective: "Explicar e aplicar.",
        microsequences: [{
          microsequenceId: "micro-a",
          position: 0,
          title: "Da situação ao conceito",
          objective: "Introduzir a relação em contexto.",
          dependencyMicrosequenceIds: [],
          scopeItemIds: [CURRICULUM_SCOPE_ID]
        }]
      }]
    }]
  };
  const part = {
    partId: PART_ID,
    position: 0,
    title: "Primeiro lote",
    intent: "Produzir o início do percurso.",
    progression: ["situação concreta", "relação", "aplicação"],
    microsequences: [{ microsequenceId: "micro-a", position: 0 }]
  };
  const value = adapter(async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    if (url.endsWith("/rpc/save_course_curricular_map_for_actor_v1")) {
      return json({
        contract: "aralearn.course-curricular-map-change.v1",
        courseId: COURSE_ID,
        courseRevision: 8,
        planVersion: 5,
        approval: "draft",
        changed: true,
        idempotent: false
      });
    }
    assert.match(url, /\/rpc\/save_course_authoring_part_for_actor_v1$/u);
    return json({
      contract: "aralearn.course-authoring-part-change.v1",
      courseId: COURSE_ID,
      courseRevision: 9,
      planVersion: 6,
      authoringPartId: PART_ID,
      changed: true,
      idempotent: false
    });
  });

  await value.saveCourseCurricularMap({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    requestId: "request-curricular-map-1",
    expectedCourseRevision: 7,
    expectedPlanVersion: 4,
    approved: false,
    curricularMap: map
  });
  await value.saveCourseAuthoringPart({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    requestId: "request-production-part-1",
    expectedCourseRevision: 8,
    expectedPlanVersion: 5,
    part
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.p_approved, false);
  assert.deepEqual(calls[0].body.p_curricular_map, map);
  assert.equal(typeof calls[0].body.p_request_hash, "string");
  assert.equal(calls[0].body.p_request_hash.length, 64);
  assert.deepEqual(calls[1].body.p_part, part);
  assert.equal(Object.hasOwn(calls[1].body.p_part, "modules"), false);
  assert.equal(Object.hasOwn(calls[1].body.p_part, "analysisUnits"), false);
});

test("materialização envia repertório e alvos no mesmo commit das unidades", async () => {
  const planItemUpserts = [{
    id: PLAN_ID,
    kind: "instructional_analysis_unit",
    position: 0,
    statement: "relação focal",
    description: "Relação necessária para executar a aplicação."
  }];
  const targetPlanItems = [{
    didacticMicrosequenceId: "micro-a",
    instructionalAnalysisUnitIds: [PLAN_ID],
    evidenceRequirementIds: []
  }];
  const units = [{
    studyUnitId: "unit-a",
    position: 1,
    didacticMicrosequenceId: "micro-a",
    content: {},
    designSnapshot: {},
    designApplication: {},
    sourceLinks: []
  }];
  let payload = null;
  const value = adapter(async (url, init) => {
    assert.match(url, /\/rpc\/materialize_course_authoring_part_for_actor_v2$/u);
    payload = JSON.parse(init.body);
    return json({
      contract: "aralearn.course-part-materialization.v1",
      courseId: COURSE_ID,
      courseRevision: 8,
      authoringPartId: PART_ID,
      changed: true,
      studyUnitCount: 1,
      idempotent: false
    });
  });

  await value.materializeCourseAuthoringPart({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    authoringPartId: PART_ID,
    requestId: "request-materialization-plan-1",
    expectedCourseRevision: 7,
    expectedAuthoringPartVersion: 2,
    planItemUpserts,
    targetPlanItems,
    units
  });

  assert.deepEqual(payload.p_plan_item_upserts, planItemUpserts);
  assert.deepEqual(payload.p_target_plan_items, targetPlanItems);
  assert.deepEqual(payload.p_units, units);
  assert.equal(typeof payload.p_request_hash, "string");
  assert.equal(payload.p_request_hash.length, 64);
});

test("lê inspeção curricular limitada e acrescenta link exato da Unidade", async () => {
  let payload = null;
  const value = adapter(async (url, init) => {
    assert.match(url, /\/rpc\/list_owned_course_study_units_for_actor_v2$/u);
    payload = JSON.parse(init.body);
    return json({
      contract: "aralearn.course-study-unit-inspection-page.v2",
      courseId: COURSE_ID,
      courseRevision: 7,
      scope: { kind: "authoring_part", id: PART_ID },
      totalCount: 1,
      scopeOptions: {
        authoringParts: [{
          id: PART_ID,
          position: 0,
          title: "Parte A",
          state: "materialized"
        }],
        unassignedStudyUnitCount: 0
      },
      items: [{
        studyUnit: {
          id: "unit-a",
          position: 1,
          title: "Unidade A",
          role: "theory",
          content: [{
            id: "paragraph-a",
            package: "aralearn.resource.paragraph",
            version: "1.0.0",
            data: { text: "Conteúdo da Unidade A." }
          }],
          response: null,
          feedback: [],
          topics: []
        },
        version: 2,
        updatedAt: "2026-08-17T10:00:00Z",
        ordinal: 1,
        curriculumPath: {
          module: { id: "module-a", position: 0, title: "Módulo A" },
          lesson: { id: "lesson-a", position: 0, title: "Lição A" },
          didacticMicrosequence: { id: "micro-a", position: 0, title: "Micro A" }
        },
        authoringPart: {
          id: PART_ID,
          position: 0,
          title: "Parte A",
          state: "materialized"
        },
        authorship: {
          createdOrigin: "gpt",
          lastRevisionOrigin: "human",
          design: {
            application: {
              mode: "expository",
              componentRefs: ["aralearn.resource.paragraph@1.0.0"],
              analysisIdeas: {
                introduced: [{
                  name: "tabela MAC",
                  description: "Memória que associa endereços MAC às portas conhecidas."
                }],
                used: [{
                  name: "endereço MAC",
                  description: "Identificador já estabelecido usado na consulta."
                }],
                revisited: [{
                  name: "porta do switch",
                  description: "Conexão retomada para contrastar entrada e saída."
                }]
              }
            }
          }
        }
      }],
      hasPrevious: false,
      hasMore: false,
      previousCursor: null,
      nextCursor: null,
      pageBytes: 640
    });
  });

  const result = await value.listCourseStudyUnits({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    expectedRevision: 7,
    scopeKind: "authoring_part",
    scopeId: PART_ID,
    anchorStudyUnitId: "unit-a",
    direction: "backward",
    limit: 12,
    maxBytes: 262144
  });

  assert.equal(payload.p_actor_id, USER_ID);
  assert.equal(payload.p_scope_kind, "authoring_part");
  assert.equal(payload.p_anchor_study_unit_id, "unit-a");
  assert.equal(payload.p_max_bytes, 262144);
  assert.deepEqual(result.items[0].authorship.design.application.analysisIdeas, {
    introduced: [{
      name: "tabela MAC",
      description: "Memória que associa endereços MAC às portas conhecidas."
    }],
    used: [{
      name: "endereço MAC",
      description: "Identificador já estabelecido usado na consulta."
    }],
    revisited: [{
      name: "porta do switch",
      description: "Conexão retomada para contrastar entrada e saída."
    }]
  });
  assert.equal(Object.hasOwn(result.items[0].authorship.design, "snapshot"), false);
  assert.equal(Object.hasOwn(
    result.items[0].authorship.design.application,
    "usedInstructionalAnalysisUnitIds"
  ), false);
  assert.equal(
    result.items[0].deepLink,
    `https://app.example/AraLearn/#/authoring/courses/${COURSE_ID}` +
      "?section=content&studyUnitId=unit-a"
  );
});


test("lê e altera parâmetros por RPC owner-only com catálogo validado", async () => {
  const calls = [];
  const value = adapter(async (url, init) => {
    const payload = JSON.parse(init.body);
    calls.push({ name: url.split("/").at(-1), payload });
    if (url.endsWith("/rpc/get_owned_course_design_for_actor_v3")) {
      return json(courseDesignRead());
    }
    if (url.endsWith("/rpc/apply_course_design_command_for_actor_v3")) {
      return json({
        contract: "aralearn.course-design-change.v3",
        courseId: COURSE_ID,
        courseRevision: 6,
        requestId: "request-design-0001",
        idempotent: false,
        changed: true,
        change: {
          type: "clear_guidance",
          scope: { kind: "course", ref: COURSE_ID },
          parameterId: null
        }
      });
    }
    assert.fail(`RPC inesperado: ${url}`);
  });

  const read = await value.getCourseDesign({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    scopeKind: "course",
    scopeRef: COURSE_ID,
    childLimit: 16,
    childCursor: null
  });
  assert.equal(read.componentCatalog.options.length, 33);
  assert.equal(Object.hasOwn(read, "deepLink"), false);

  const fixedRead = courseDesignRead();
  const fixedRefs = fixedRead.componentCatalog.options.map(({ ref }) => ref);
  fixedRead.componentPolicy.effectiveAssignment = {
    policy: {
      catalogVersion: fixedRead.componentCatalog.version,
      availability: "allow_only",
      allowedRefs: fixedRefs,
      excludedRefs: [],
      preferredRefs: [fixedRefs[0]]
    },
    origin: "research_condition",
    reason: "Condição comparável.",
    sourceScope: { kind: "course", ref: COURSE_ID },
    inherited: false
  };
  const fixed = await adapter(async () => json(fixedRead)).getCourseDesign({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    scopeKind: "course",
    scopeRef: COURSE_ID
  });
  assert.equal(fixed.componentPolicy.effectiveAssignment.policy.allowedRefs.length, 33);
  assert.equal(fixed.componentPolicy.effectiveAssignment.origin, "research_condition");

  const changed = await value.applyCourseDesignCommand({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    requestId: "request-design-0001",
    expectedCourseRevision: 5,
    command: {
      type: "clear_guidance",
      scope: { kind: "course", ref: COURSE_ID }
    }
  });
  assert.equal(changed.changed, true);
  assert.equal(Object.hasOwn(changed, "deepLink"), false);
  assert.deepEqual(calls.map(({ name }) => name), [
    "get_owned_course_design_for_actor_v3",
    "apply_course_design_command_for_actor_v3"
  ]);
  assert.deepEqual(calls[0].payload, {
    p_actor_id: USER_ID,
    p_course_id: COURSE_ID,
    p_scope_kind: "course",
    p_scope_ref: COURSE_ID,
    p_child_limit: 16,
    p_child_cursor: null
  });
  assert.equal(calls[1].payload.p_channel, "application");
  assert.equal(calls[1].payload.p_expected_course_revision, 5);

  const drifted = courseDesignRead();
  drifted.componentCatalog.options[0].purpose = "Contrato divergente";
  const invalid = adapter(async () => json(drifted));
  await assert.rejects(
    () => invalid.getCourseDesign({
      principal: { actorId: USER_ID },
      courseId: COURSE_ID,
      scopeKind: "course",
      scopeRef: COURSE_ID
    }),
    (error) => error.code === "component_catalog_drift"
  );

  for (const fingerprint of [undefined, "sha256:" + "0".repeat(64)]) {
    const wrongFingerprint = courseDesignRead();
    if (fingerprint === undefined) delete wrongFingerprint.componentCatalog.schemaFingerprint;
    else wrongFingerprint.componentCatalog.schemaFingerprint = fingerprint;
    await assert.rejects(adapter(async () => json(wrongFingerprint)).getCourseDesign({
      principal: { actorId: USER_ID }, courseId: COURSE_ID, scopeKind: "course", scopeRef: COURSE_ID
    }), (error) => error.code === "component_catalog_drift");
  }

  const oversized = adapter(async () => json({
    code: "54000",
    message: "Leitura de desenho excede 256 KiB."
  }, 400));
  await assert.rejects(
    () => oversized.getCourseDesign({
      principal: { actorId: USER_ID },
      courseId: COURSE_ID,
      scopeKind: "course",
      scopeRef: COURSE_ID
    }),
    (error) => error.status === 413 && error.code === "course_design_response_too_large"
  );

  const reordered = courseDesignRead();
  [reordered.componentCatalog.options[0], reordered.componentCatalog.options[1]] =
    [reordered.componentCatalog.options[1], reordered.componentCatalog.options[0]];
  const wrongOrder = adapter(async () => json(reordered));
  await assert.rejects(
    () => wrongOrder.getCourseDesign({
      principal: { actorId: USER_ID },
      courseId: COURSE_ID,
      scopeKind: "course",
      scopeRef: COURSE_ID
    }),
    (error) => error.code === "component_catalog_drift"
  );

  const wrongScope = courseDesignRead();
  wrongScope.scopeContext.current = { kind: "lesson", ref: "lesson-a", label: "Lição A" };
  const mismatchedRead = adapter(async () => json(wrongScope));
  await assert.rejects(
    () => mismatchedRead.getCourseDesign({
      principal: { actorId: USER_ID },
      courseId: COURSE_ID,
      scopeKind: "course",
      scopeRef: COURSE_ID
    }),
    (error) => error.code === "course_service_unavailable"
  );

  const mismatchedChange = adapter(async () => json({
    contract: "aralearn.course-design-change.v1",
    courseId: "10000000-0000-4000-8000-000000000099",
    courseRevision: 6,
    requestId: "request-design-other",
    idempotent: false,
    changed: true,
    change: {
      changeId: "1",
      type: "clear_guidance",
      scope: { kind: "course", ref: "10000000-0000-4000-8000-000000000099" }
    }
  }));
  await assert.rejects(
    () => mismatchedChange.applyCourseDesignCommand({
      principal: { actorId: USER_ID, authenticationKind: "application" },
      courseId: COURSE_ID,
      requestId: "request-design-0001",
      expectedCourseRevision: 5,
      command: { type: "clear_guidance", scope: { kind: "course", ref: COURSE_ID } }
    }),
    (error) => error.code === "course_service_unavailable"
  );
});

test("Fontes usam RPC owner-only, DTO exato, bind de consulta e teto de 256 KiB", async () => {
  const calls = [];
  const currentSourceId = "source-current";
  const readResult = {
    contract: "aralearn.course-sources.v3",
    bibliographyStyle: "abnt-2025",
    courseId: COURSE_ID,
    courseRevision: 5,
    mode: "catalog",
    query: { sourceId: null, targetId: null, targetKind: null },
    pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 },
    items: [{
      sourceId: "source-a",
      revision: 1,
      status: "active",
      kind: "web_page",
      defaultRoles: ["technical_conceptual"], citationMode: "manual", bibliographic: createEmptyCourseSourceBibliographicMetadata(),
      title: "Fonte A",
      authors: [{ literal: "Autoria" }],
      publicationDate: "2026",
      identifier: null,
      language: "pt-BR",
      citationText: "Fonte A, 2026.",
      url: "https://example.test/fonte-a",
      editionOrVersion: null,
      origin: "external",
      availability: "open_access",
      verificationStatus: "author_verified",
      studyVisibility: "citation_and_link",
      publicFileAccess: "inherit",
      anchorCount: 0,
      createdAt: "2026-08-17T10:00:00Z"
    }],
    nextCursor: null
  };
  const changeResult = {
    contract: "aralearn.course-source-change.v1",
    courseId: COURSE_ID,
    courseRevision: 6,
    requestId: "request-source-0001",
    idempotent: false,
    changed: true,
    change: { type: "retire_source", subjectId: currentSourceId, revision: 2 }
  };
  const value = adapter(async (url, init) => {
    const payload = JSON.parse(init.body);
    calls.push({ name: url.split("/").at(-1), payload });
    if (url.endsWith("/get_owned_course_sources_for_actor_v1")) return json(readResult);
    if (url.endsWith("/execute_course_source_command_for_actor_v1")) {
      return json(changeResult);
    }
    assert.fail(`RPC inesperado: ${url}`);
  });

  const read = await value.getCourseSources({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    expectedRevision: 5,
    mode: "catalog"
  });
  assert.equal(read.items[0].sourceId, "source-a");
  assert.deepEqual(calls[0].payload, {
    p_actor_id: USER_ID,
    p_course_id: COURSE_ID,
    p_expected_revision: 5,
    p_mode: "catalog",
    p_source_id: null,
    p_target_kind: null,
    p_target_id: null,
    p_cursor: null,
    p_limit: 10
  });

  let contextualPayload = null;
  const contextualResult = {
    ...readResult,
    mode: "source",
    query: {
      sourceId: currentSourceId,
      targetKind: "study_unit",
      targetId: "unit-a"
    },
    items: [],
    nextCursor: null
  };
  const contextualValue = adapter(async (_url, init) => {
    contextualPayload = JSON.parse(init.body);
    return json(contextualResult);
  });
  assert.deepEqual(await contextualValue.getCourseSources({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    expectedRevision: 5,
    mode: "source",
    sourceId: currentSourceId,
    targetKind: "study_unit",
    targetId: "unit-a"
  }), contextualResult);
  assert.deepEqual(contextualPayload, {
    p_actor_id: USER_ID,
    p_course_id: COURSE_ID,
    p_expected_revision: 5,
    p_mode: "source",
    p_source_id: currentSourceId,
    p_target_kind: "study_unit",
    p_target_id: "unit-a",
    p_cursor: null,
    p_limit: 1
  });

  const changed = await value.executeCourseSourceCommand({
    principal: { actorId: USER_ID, authenticationKind: "oauth" },
    courseId: COURSE_ID,
    requestId: "request-source-0001",
    expectedCourseRevision: 5,
    command: {
      type: "retire_source",
      sourceId: currentSourceId,
      expectedSourceRevision: 1
    }
  });
  assert.equal(changed.courseRevision, 6);
  assert.equal(calls[1].payload.p_channel, "mcp");
  assert.deepEqual(calls[1].payload.p_command, {
    type: "retire_source",
    sourceId: currentSourceId,
    expectedSourceRevision: 1
  });

  let linkedPayload = null;
  const linkedValue = adapter(async (_url, init) => {
    linkedPayload = JSON.parse(init.body);
    return json({
      ...changeResult,
      requestId: "request-source-links-1",
      change: { type: "set_target_sources", subjectId: "unit-a", targetVersion: 2 }
    });
  });
  const currentLinks = [{
    sourceId: currentSourceId,
    linkId: currentSourceId, roles: [], occurrences: [],
    relation: "supported_by",
    anchors: [{ anchorId: "anchor-a" }]
  }];
  await linkedValue.executeCourseSourceCommand({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    requestId: "request-source-links-1",
    expectedCourseRevision: 5,
    command: {
      type: "set_target_sources",
      targetKind: "study_unit",
      targetId: "unit-a",
      expectedTargetVersion: 2,
      sourceLinks: currentLinks
    }
  });
  assert.deepEqual(linkedPayload.p_command.sourceLinks, currentLinks);

  const mismatchedTargetVersion = adapter(async () => json({
    ...changeResult,
    requestId: "request-source-links-2",
    change: { type: "set_target_sources", subjectId: "unit-a", targetVersion: 3 }
  }));
  await assert.rejects(
    () => mismatchedTargetVersion.executeCourseSourceCommand({
      principal: { actorId: USER_ID, authenticationKind: "application" },
      courseId: COURSE_ID,
      requestId: "request-source-links-2",
      expectedCourseRevision: 5,
      command: {
        type: "set_target_sources",
        targetKind: "study_unit",
        targetId: "unit-a",
        expectedTargetVersion: 2,
        sourceLinks: currentLinks
      }
    }),
    (error) => error.code === "course_service_unavailable"
  );

  for (const spoofed of [
    { ...readResult, courseId: USER_ID },
    { ...readResult, query: { sourceId: "source-a", targetKind: null, targetId: null } },
    { ...readResult, items: [{ ...readResult.items[0], actorId: USER_ID }] },
    { ...readResult, nextCursor: "source:cursor" }
  ]) {
    const invalid = adapter(async () => json(spoofed));
    await assert.rejects(
      () => invalid.getCourseSources({
        principal: { actorId: USER_ID },
        courseId: COURSE_ID,
        expectedRevision: 5,
        mode: "catalog"
      }),
      (error) => error.status === 503 && error.code === "course_service_unavailable"
    );
  }

  const oversized = adapter(async () => json({ payload: "x".repeat(270_000) }));
  await assert.rejects(
    () => oversized.getCourseSources({
      principal: { actorId: USER_ID },
      courseId: COURSE_ID,
      expectedRevision: 5,
      mode: "catalog"
    }),
    (error) => error.status === 413 && error.code === "course_sources_response_too_large"
  );

  await assert.rejects(
    () => value.executeCourseSourceCommand({
      principal: { actorId: USER_ID },
      courseId: COURSE_ID,
      requestId: "request-source-bad-1",
      expectedCourseRevision: 5,
      command: {
        type: "retire_source",
        sourceId: "source-a",
        expectedSourceRevision: 1,
        actorId: USER_ID
      }
    }),
    (error) => error.status === 422 && error.code === "invalid_course_source_command"
  );

  const spoofedChange = adapter(async () => json({
    ...changeResult,
    change: { ...changeResult.change, subjectId: "source-other" }
  }));
  await assert.rejects(
    () => spoofedChange.executeCourseSourceCommand({
      principal: { actorId: USER_ID, authenticationKind: "application" },
      courseId: COURSE_ID,
      requestId: "request-source-0001",
      expectedCourseRevision: 5,
      command: {
        type: "retire_source",
        sourceId: currentSourceId,
        expectedSourceRevision: 1
      }
    }),
    (error) => error.status === 503 && error.code === "course_service_unavailable"
  );
});

test("ingestão server-side deriva identidade, sela o PDF e preserva lacunas bibliográficas", async () => {
  const pdfBytes = syntheticPdf("save-new");
  const contentHash = createHash("sha256").update(pdfBytes).digest("hex");
  const storagePath = `${COURSE_ID}/${contentHash}.pdf`;
  const calls = [];
  let derivedSourceId = null;
  const value = adapter(async (url, init) => {
    const isStorageUpload = init.method === "POST" &&
      url.includes("/storage/v1/object/course-source-pdfs/");
    const body = isStorageUpload || init.body == null ? init.body : JSON.parse(init.body);
    calls.push({ url, init, body });
    if (url.endsWith("/prepare_course_source_pdf_ingestion_for_actor_v1")) {
      derivedSourceId = body.p_source_intent.sourceId;
      return json({
        contract: "aralearn.course-source-pdf-ingestion-preparation.v1",
        courseId: COURSE_ID,
        courseRevision: 5,
        requestId: "request-ingest-save-1",
        sourceId: derivedSourceId,
        sourceRevision: 1,
        attachment: {
          contentHash,
          byteSize: pdfBytes.byteLength,
          mediaType: "application/pdf",
          storagePath
        },
        uploadRequired: true,
        alreadyLinked: false
      });
    }
    if (isStorageUpload) return json({ Key: storagePath });
    if (url.includes("/storage/v1/object/authenticated/course-source-pdfs/")) {
      return new Response(pdfBytes, {
        headers: {
          "Content-Length": String(pdfBytes.byteLength),
          "Content-Type": "application/pdf"
        }
      });
    }
    if (url.endsWith("/ingest_course_source_pdf_for_actor_v1")) {
      assert.deepEqual(body.p_source_intent.source.authors, []);
      assert.equal(body.p_source_intent.source.publicationDate, null);
      assert.equal(body.p_source_intent.source.identifier, null);
      assert.equal(body.p_source_intent.source.url, null);
      return json({
        contract: "aralearn.course-source-pdf-ingestion.v1",
        courseId: COURSE_ID,
        courseRevision: 6,
        requestId: "request-ingest-save-1",
        idempotent: false,
        changed: true,
        change: { type: "ingest_pdf", subjectId: derivedSourceId, revision: 1 },
        source: {
          sourceId: derivedSourceId,
          sourceRevision: 1,
          bibliographyChanged: true
        },
        attachment: body.p_attachment,
        stored: true
      });
    }
    assert.fail(`Requisição inesperada: ${url}`);
  });

  const result = await value.ingestCourseSourcePdf({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    expectedCourseRevision: 5,
    requestId: "request-ingest-save-1",
    sourceIntent: {
      mode: "save",
      sourceId: null,
      expectedSourceRevision: 0,
      source: pdfSourceDocument()
    },
    bytes: pdfBytes.buffer,
    mediaType: "application/pdf"
  });
  assert.equal(result.stored, true);
  assert.equal(result.courseRevision, 6);
  assert.match(derivedSourceId, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  const upload = calls.find(({ url, init }) => init.method === "POST" &&
    url.includes("/storage/v1/object/course-source-pdfs/"));
  assert(upload);
  assert.deepEqual(new Uint8Array(upload.body), pdfBytes);
  assert.equal(new Headers(upload.init.headers).get("content-type"), "application/pdf");
  assert.equal(new Headers(upload.init.headers).get("x-upsert"), "false");
  assert.equal(new Headers(upload.init.headers).get("apikey"), "sb_secret_test");
  assert.match(upload.url, new RegExp(`${COURSE_ID}/${contentHash}\\.pdf$`, "u"));
});

test("adapter recupera recibo de ingestão pelo arquivo público e reverifica o PDF privado", async () => {
  const pdfBytes = syntheticPdf("receipt");
  const contentHash = createHash("sha256").update(pdfBytes).digest("hex");
  const storagePath = `${COURSE_ID}/${contentHash}.pdf`;
  const fileIdentity = {
    fileId: "file-adapter-receipt-0001",
    fileName: "edital.pdf",
    mediaType: "application/pdf"
  };
  const calls = [];
  const value = adapter(async (url, init) => {
    const body = init.body == null ? null : JSON.parse(init.body);
    calls.push({ url, method: init.method, body });
    if (url.endsWith("/get_course_source_pdf_ingestion_receipt_for_actor_v1")) {
      assert.deepEqual(body.p_file_identity, fileIdentity);
      return json({
        contract: "aralearn.course-source-pdf-ingestion.v1",
        courseId: COURSE_ID,
        courseRevision: 6,
        requestId: "request-ingest-receipt-1",
        idempotent: true,
        changed: true,
        change: { type: "ingest_pdf", subjectId: "source-pdf", revision: 2 },
        source: {
          sourceId: "source-pdf",
          sourceRevision: 2,
          bibliographyChanged: false
        },
        attachment: {
          contentHash,
          byteSize: pdfBytes.byteLength,
          mediaType: "application/pdf",
          storagePath
        },
        stored: true
      });
    }
    if (url.includes("/storage/v1/object/authenticated/course-source-pdfs/")) {
      return new Response(pdfBytes, {
        headers: {
          "Content-Length": String(pdfBytes.byteLength),
          "Content-Type": "application/pdf"
        }
      });
    }
    assert.fail(`Requisição inesperada: ${url}`);
  });

  const result = await value.getCourseSourcePdfIngestionReceipt({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    expectedCourseRevision: 5,
    requestId: "request-ingest-receipt-1",
    sourceIntent: { mode: "existing", sourceId: "source-pdf", sourceRevision: 2 },
    fileIdentity
  });
  assert.equal(result.idempotent, true);
  assert.equal(result.stored, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].method, "GET");
});

test("recibo de Fonte nova aceita uma revisão única e rejeita a contagem dupla antiga", async () => {
  const pdfBytes = syntheticPdf("new-source-receipt");
  const contentHash = createHash("sha256").update(pdfBytes).digest("hex");
  const storagePath = `${COURSE_ID}/${contentHash}.pdf`;
  const sourceId = "source-new-receipt";
  const requestId = "request-ingest-new-receipt-1";
  const sourceIntent = {
    mode: "save",
    sourceId,
    expectedSourceRevision: 0,
    source: pdfSourceDocument()
  };
  const fileIdentity = {
    fileId: "file-new-source-receipt-0001",
    fileName: "edital.pdf",
    mediaType: "application/pdf"
  };
  const receipt = (courseRevision) => ({
    contract: "aralearn.course-source-pdf-ingestion.v1",
    courseId: COURSE_ID,
    courseRevision,
    requestId,
    idempotent: true,
    changed: true,
    change: { type: "ingest_pdf", subjectId: sourceId, revision: 1 },
    source: { sourceId, sourceRevision: 1, bibliographyChanged: true },
    attachment: {
      contentHash,
      byteSize: pdfBytes.byteLength,
      mediaType: "application/pdf",
      storagePath
    },
    stored: true
  });
  const input = {
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    expectedCourseRevision: 5,
    requestId,
    sourceIntent,
    fileIdentity
  };

  const valid = adapter(async (url) => {
    if (url.endsWith("/get_course_source_pdf_ingestion_receipt_for_actor_v1")) {
      return json(receipt(6));
    }
    if (url.includes("/storage/v1/object/authenticated/course-source-pdfs/")) {
      return new Response(pdfBytes, {
        headers: { "Content-Length": String(pdfBytes.byteLength) }
      });
    }
    assert.fail(`Requisição inesperada: ${url}`);
  });
  assert.equal((await valid.getCourseSourcePdfIngestionReceipt(input)).courseRevision, 6);

  let storageReads = 0;
  const doubleCounted = adapter(async (url) => {
    if (url.endsWith("/get_course_source_pdf_ingestion_receipt_for_actor_v1")) {
      return json(receipt(7));
    }
    storageReads += 1;
    assert.fail(`A revisão inválida não pode alcançar o Storage: ${url}`);
  });
  await assert.rejects(
    () => doubleCounted.getCourseSourcePdfIngestionReceipt(input),
    (error) => error.status === 409 && error.code === "course_source_pdf_write_uncertain" &&
      /pode ter sido concluída/iu.test(error.message)
  );
  assert.equal(storageReads, 0);
});

test("reanexo idempotente reutiliza o mesmo objeto e caminho", async () => {
  const pdfBytes = syntheticPdf("reattach-removed-inherited");
  const contentHash = createHash("sha256").update(pdfBytes).digest("hex");
  const originCourseId = COURSE_ID;
  const storagePath = `${originCourseId}/${contentHash}.pdf`;
  const calls = [];
  const value = adapter(async (url, init) => {
    const isUpload = init.method === "POST" &&
      url.includes("/storage/v1/object/course-source-pdfs/");
    const body = isUpload || init.body == null ? init.body : JSON.parse(init.body);
    calls.push({ url, method: init.method, body });
    if (url.endsWith("/prepare_course_source_pdf_ingestion_for_actor_v1")) {
      return json({
        contract: "aralearn.course-source-pdf-ingestion-preparation.v1",
        courseId: COURSE_ID,
        courseRevision: 5,
        requestId: "request-ingest-reattach-1",
        sourceId: "source-pdf",
        sourceRevision: 2,
        attachment: {
          contentHash,
          byteSize: pdfBytes.byteLength,
          mediaType: "application/pdf",
          storagePath
        },
        uploadRequired: true,
        alreadyLinked: true
      });
    }
    if (isUpload) {
      assert.equal(url.endsWith(`/course-source-pdfs/${storagePath}`), true);
      return json({ Key: storagePath });
    }
    if (url.includes("/storage/v1/object/authenticated/course-source-pdfs/")) {
      assert.equal(url.endsWith(`/course-source-pdfs/${storagePath}`), true);
      return new Response(pdfBytes, {
        headers: { "Content-Length": String(pdfBytes.byteLength) }
      });
    }
    if (url.endsWith("/ingest_course_source_pdf_for_actor_v1")) {
      assert.equal(body.p_attachment.storagePath, storagePath);
      return json({
        contract: "aralearn.course-source-pdf-ingestion.v1",
        courseId: COURSE_ID,
        courseRevision: 6,
        requestId: "request-ingest-reattach-1",
        idempotent: false,
        changed: true,
        change: { type: "ingest_pdf", subjectId: "source-pdf", revision: 2 },
        source: {
          sourceId: "source-pdf",
          sourceRevision: 2,
          bibliographyChanged: false
        },
        attachment: body.p_attachment,
        stored: true
      });
    }
    assert.fail(`Requisição inesperada: ${url}`);
  });

  const result = await value.ingestCourseSourcePdf({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    expectedCourseRevision: 5,
    requestId: "request-ingest-reattach-1",
    sourceIntent: { mode: "existing", sourceId: "source-pdf", sourceRevision: 2 },
    bytes: pdfBytes,
    mediaType: "application/pdf"
  });
  assert.equal(result.stored, true);
  assert.equal(calls.filter(({ url }) =>
    url.includes("/storage/v1/object/course-source-pdfs/")).length, 1);
});

test("ingestão recusa mídia e estrutura inválidas antes de acessar Supabase", async () => {
  let calls = 0;
  const value = adapter(async () => {
    calls += 1;
    assert.fail("PDF inválido não pode acessar o Supabase.");
  });
  const input = {
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    expectedCourseRevision: 5,
    requestId: "request-ingest-invalid-1",
    sourceIntent: { mode: "existing", sourceId: "source-pdf", sourceRevision: 2 },
    bytes: syntheticPdf("invalid"),
    mediaType: "application/pdf"
  };
  await assert.rejects(
    () => value.ingestCourseSourcePdf({ ...input, mediaType: "text/plain" }),
    (error) => error.status === 422 && error.code === "invalid_course_source_pdf"
  );
  await assert.rejects(
    () => value.ingestCourseSourcePdf({
      ...input,
      requestId: "request-ingest-invalid-2",
      bytes: new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n")
    }),
    (error) => error.status === 422 && error.code === "invalid_course_source_pdf"
  );
  await assert.rejects(
    () => value.ingestCourseSourcePdf({
      ...input,
      requestId: "request-ingest-invalid-3",
      bytes: new Uint8Array()
    }),
    (error) => error.status === 422 && error.code === "invalid_course_source_pdf"
  );
  assert.equal(calls, 0);
});

test("ingestão traduz cota e limite de anexos em mensagens humanas", async () => {
  const cases = [{
    message: "A cota de 64 MiB de PDFs únicos do Curso seria excedida.",
    code: "course_source_pdf_quota_exceeded",
    pattern: /cota de 64 MiB/iu
  }, {
    message: "Uma revisão de Fonte aceita no máximo oito anexos PDF.",
    code: "course_source_pdf_attachment_limit",
    pattern: /máximo de oito PDFs/iu
  }];
  for (const [index, current] of cases.entries()) {
    const pdfBytes = syntheticPdf(`limit-${index}`);
    const value = adapter(async (url) => {
      if (url.endsWith("/prepare_course_source_pdf_ingestion_for_actor_v1")) {
        return json({ code: "23514", message: current.message }, 400);
      }
      if (url.endsWith("/cancel_course_source_pdf_ingestion_for_actor_v1")) {
        return json(true);
      }
      assert.fail(`Requisição inesperada: ${url}`);
    });
    await assert.rejects(
      () => value.ingestCourseSourcePdf({
        principal: { actorId: USER_ID, authenticationKind: "application" },
        courseId: COURSE_ID,
        expectedCourseRevision: 5,
        requestId: `request-ingest-limit-${index + 1}`,
        sourceIntent: { mode: "existing", sourceId: "source-pdf", sourceRevision: 2 },
        bytes: pdfBytes,
        mediaType: "application/pdf"
      }),
      (error) => error.status === 413 && error.code === current.code &&
        current.pattern.test(error.message),
      current.code
    );
  }
});

test("conflito de upload é deduplicação binária e ainda exige verificação e vínculo", async () => {
  const pdfBytes = syntheticPdf("dedup");
  const contentHash = createHash("sha256").update(pdfBytes).digest("hex");
  const attachment = {
    contentHash,
    byteSize: pdfBytes.byteLength,
    mediaType: "application/pdf",
    storagePath: `${COURSE_ID}/${contentHash}.pdf`
  };
  const calls = [];
  const value = adapter(async (url, init) => {
    calls.push({ url, method: init.method });
    if (url.endsWith("/prepare_course_source_pdf_ingestion_for_actor_v1")) {
      return json({
        contract: "aralearn.course-source-pdf-ingestion-preparation.v1",
        courseId: COURSE_ID,
        courseRevision: 5,
        requestId: "request-ingest-dedup-1",
        sourceId: "source-pdf",
        sourceRevision: 2,
        attachment,
        uploadRequired: true,
        alreadyLinked: false
      });
    }
    if (init.method === "POST" && url.includes("/storage/v1/object/course-source-pdfs/")) {
      return json({ statusCode: "409", error: "Duplicate", message: "The resource already exists" }, 409);
    }
    if (url.includes("/storage/v1/object/authenticated/course-source-pdfs/")) {
      return new Response(pdfBytes, {
        headers: { "Content-Length": String(pdfBytes.byteLength) }
      });
    }
    if (url.endsWith("/ingest_course_source_pdf_for_actor_v1")) {
      return json({
        contract: "aralearn.course-source-pdf-ingestion.v1",
        courseId: COURSE_ID,
        courseRevision: 6,
        requestId: "request-ingest-dedup-1",
        idempotent: false,
        changed: true,
        change: { type: "ingest_pdf", subjectId: "source-pdf", revision: 2 },
        source: {
          sourceId: "source-pdf",
          sourceRevision: 2,
          bibliographyChanged: false
        },
        attachment,
        stored: true
      });
    }
    assert.fail(`Requisição inesperada: ${url}`);
  });
  const result = await value.ingestCourseSourcePdf({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    expectedCourseRevision: 5,
    requestId: "request-ingest-dedup-1",
    sourceIntent: { mode: "existing", sourceId: "source-pdf", sourceRevision: 2 },
    bytes: pdfBytes,
    mediaType: "application/pdf"
  });
  assert.equal(result.stored, true);
  assert.equal(calls.some(({ method }) => method === "DELETE"), false);
  assert.equal(calls.filter(({ url }) =>
    url.includes("/storage/v1/object/authenticated/course-source-pdfs/")).length, 2);
});

test("upload ambíguo relê preflight e objeto antes de finalizar", async () => {
  const pdfBytes = syntheticPdf("uncertain");
  const contentHash = createHash("sha256").update(pdfBytes).digest("hex");
  const attachment = {
    contentHash,
    byteSize: pdfBytes.byteLength,
    mediaType: "application/pdf",
    storagePath: `${COURSE_ID}/${contentHash}.pdf`
  };
  let preparations = 0;
  let uploadAttempts = 0;
  const value = adapter(async (url, init) => {
    if (url.endsWith("/prepare_course_source_pdf_ingestion_for_actor_v1")) {
      preparations += 1;
      return json({
        contract: "aralearn.course-source-pdf-ingestion-preparation.v1",
        courseId: COURSE_ID,
        courseRevision: 5,
        requestId: "request-ingest-uncertain-1",
        sourceId: "source-pdf",
        sourceRevision: 2,
        attachment,
        uploadRequired: preparations === 1,
        alreadyLinked: false
      });
    }
    if (init.method === "POST" && url.includes("/storage/v1/object/course-source-pdfs/")) {
      uploadAttempts += 1;
      throw new TypeError("resposta perdida após o envio");
    }
    if (url.includes("/storage/v1/object/authenticated/course-source-pdfs/")) {
      return new Response(pdfBytes, {
        headers: { "Content-Length": String(pdfBytes.byteLength) }
      });
    }
    if (url.endsWith("/ingest_course_source_pdf_for_actor_v1")) {
      return json({
        contract: "aralearn.course-source-pdf-ingestion.v1",
        courseId: COURSE_ID,
        courseRevision: 6,
        requestId: "request-ingest-uncertain-1",
        idempotent: false,
        changed: true,
        change: { type: "ingest_pdf", subjectId: "source-pdf", revision: 2 },
        source: {
          sourceId: "source-pdf",
          sourceRevision: 2,
          bibliographyChanged: false
        },
        attachment,
        stored: true
      });
    }
    assert.fail(`Requisição inesperada: ${url}`);
  });
  const result = await value.ingestCourseSourcePdf({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    expectedCourseRevision: 5,
    requestId: "request-ingest-uncertain-1",
    sourceIntent: { mode: "existing", sourceId: "source-pdf", sourceRevision: 2 },
    bytes: pdfBytes,
    mediaType: "application/pdf"
  });
  assert.equal(result.stored, true);
  assert.equal(preparations, 2);
  assert.equal(uploadAttempts, 1);
});

test("replay pós-timeout recupera receipt e o mesmo caminho antes de confirmar stored", async () => {
  const pdfBytes = syntheticPdf("replay");
  const contentHash = createHash("sha256").update(pdfBytes).digest("hex");
  const storageOriginCourseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const inheritedAttachment = {
    contentHash,
    byteSize: pdfBytes.byteLength,
    mediaType: "application/pdf",
    storagePath: `${storageOriginCourseId}/${contentHash}.pdf`
  };
  const calls = [];
  const value = adapter(async (url, init) => {
    calls.push(url);
    if (url.endsWith("/prepare_course_source_pdf_ingestion_for_actor_v1")) {
      return json({ code: "40001", message: "O Curso mudou." }, 409);
    }
    if (url.endsWith("/ingest_course_source_pdf_for_actor_v1")) {
      const body = JSON.parse(init.body);
      assert.deepEqual(body.p_attachment, {
        contentHash,
        byteSize: pdfBytes.byteLength,
        mediaType: "application/pdf",
        storagePath: `${COURSE_ID}/${contentHash}.pdf`
      });
      return json({
        contract: "aralearn.course-source-pdf-ingestion.v1",
        courseId: COURSE_ID,
        courseRevision: 5,
        requestId: "request-ingest-replay-1",
        idempotent: true,
        changed: false,
        change: null,
        source: {
          sourceId: "source-pdf",
          sourceRevision: 2,
          bibliographyChanged: false
        },
        attachment: inheritedAttachment,
        stored: true
      });
    }
    if (url.includes("/storage/v1/object/authenticated/course-source-pdfs/")) {
      return new Response(pdfBytes, {
        headers: { "Content-Length": String(pdfBytes.byteLength) }
      });
    }
    assert.fail(`Requisição inesperada: ${url}`);
  });
  const result = await value.ingestCourseSourcePdf({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    expectedCourseRevision: 5,
    requestId: "request-ingest-replay-1",
    sourceIntent: { mode: "existing", sourceId: "source-pdf", sourceRevision: 2 },
    bytes: pdfBytes,
    mediaType: "application/pdf"
  });
  assert.equal(result.idempotent, true);
  assert.equal(calls.length, 3);
  assert.equal(calls.filter((url) =>
    url.includes("/storage/v1/object/authenticated/course-source-pdfs/")).length, 1);
  assert.equal(calls.some((url) => url.endsWith(
    `/course-source-pdfs/${storageOriginCourseId}/${contentHash}.pdf`
  )), true);
});

test("receipt com objeto ausente ou corrompido vira escrita incerta não repetível", async () => {
  const cases = [
    { label: "ausente", objectResponse: () => new Response(null, { status: 404 }) },
    {
      label: "corrompido",
      objectResponse: () => {
        const bytes = syntheticPdf("outro-binario");
        return new Response(bytes, {
          headers: { "Content-Length": String(bytes.byteLength) }
        });
      }
    }
  ];
  for (const current of cases) {
    const pdfBytes = syntheticPdf(`replay-${current.label}`);
    const contentHash = createHash("sha256").update(pdfBytes).digest("hex");
    const requestId = `request-ingest-replay-${current.label}`;
    const attachment = {
      contentHash,
      byteSize: pdfBytes.byteLength,
      mediaType: "application/pdf",
      storagePath: `${COURSE_ID}/${contentHash}.pdf`
    };
    let cancels = 0;
    const value = adapter(async (url) => {
      if (url.endsWith("/prepare_course_source_pdf_ingestion_for_actor_v1")) {
        return json({ code: "40001", message: "O Curso mudou." }, 409);
      }
      if (url.endsWith("/ingest_course_source_pdf_for_actor_v1")) {
        return json({
          contract: "aralearn.course-source-pdf-ingestion.v1",
          courseId: COURSE_ID,
          courseRevision: 6,
          requestId,
          idempotent: true,
          changed: true,
          change: { type: "ingest_pdf", subjectId: "source-pdf", revision: 2 },
          source: {
            sourceId: "source-pdf",
            sourceRevision: 2,
            bibliographyChanged: false
          },
          attachment,
          stored: true
        });
      }
      if (url.includes("/storage/v1/object/authenticated/course-source-pdfs/")) {
        return current.objectResponse();
      }
      if (url.endsWith("/cancel_course_source_pdf_ingestion_for_actor_v1")) {
        cancels += 1;
        return json(true);
      }
      assert.fail(`Requisição inesperada em ${current.label}: ${url}`);
    });
    await assert.rejects(
      () => value.ingestCourseSourcePdf({
        principal: { actorId: USER_ID, authenticationKind: "application" },
        courseId: COURSE_ID,
        expectedCourseRevision: 5,
        requestId,
        sourceIntent: { mode: "existing", sourceId: "source-pdf", sourceRevision: 2 },
        bytes: pdfBytes,
        mediaType: "application/pdf"
      }),
      (error) => error.status === 409 &&
        error.code === "course_source_pdf_write_uncertain" &&
        /pode ter sido concluída/iu.test(error.message),
      current.label
    );
    assert.equal(cancels, 1, current.label);
  }
});

test("falha após upload cancela a intent e deixa o órfão para a manutenção", async () => {
  const pdfBytes = syntheticPdf("residual-maintenance");
  const contentHash = createHash("sha256").update(pdfBytes).digest("hex");
  const attachment = {
    contentHash,
    byteSize: pdfBytes.byteLength,
    mediaType: "application/pdf",
    storagePath: `${COURSE_ID}/${contentHash}.pdf`
  };
  let uploads = 0;
  let cancels = 0;
  const calls = [];
  const value = adapter(async (url, init) => {
    calls.push({ url, method: init.method });
    if (url.endsWith("/prepare_course_source_pdf_ingestion_for_actor_v1")) {
      return json({
        contract: "aralearn.course-source-pdf-ingestion-preparation.v1",
        courseId: COURSE_ID,
        courseRevision: 5,
        requestId: "request-ingest-residual-1",
        sourceId: "source-pdf",
        sourceRevision: 2,
        attachment,
        uploadRequired: true,
        alreadyLinked: false
      });
    }
    if (init.method === "POST" && url.includes("/storage/v1/object/course-source-pdfs/")) {
      uploads += 1;
      return json({ Key: attachment.storagePath });
    }
    if (url.includes("/storage/v1/object/authenticated/course-source-pdfs/")) {
      return new Response(pdfBytes, {
        headers: { "Content-Length": String(pdfBytes.byteLength) }
      });
    }
    if (url.endsWith("/ingest_course_source_pdf_for_actor_v1")) {
      return json({ code: "XX000", message: "falha após upload" }, 500);
    }
    if (url.endsWith("/cancel_course_source_pdf_ingestion_for_actor_v1")) {
      cancels += 1;
      return json(true);
    }
    assert.fail(`Requisição inesperada: ${url}`);
  });
  await assert.rejects(
    () => value.ingestCourseSourcePdf({
      principal: { actorId: USER_ID, authenticationKind: "application" },
      courseId: COURSE_ID,
      expectedCourseRevision: 5,
      requestId: "request-ingest-residual-1",
      sourceIntent: { mode: "existing", sourceId: "source-pdf", sourceRevision: 2 },
      bytes: pdfBytes,
      mediaType: "application/pdf"
    }),
    (error) => error.status === 503 && error.code === "course_service_unavailable"
  );
  assert.equal(uploads, 1);
  assert.equal(cancels, 1);
  assert.equal(calls.some(({ method }) => method === "DELETE"), false);
  assert.equal(calls.some(({ url }) =>
    url.endsWith("/can_compensate_course_source_pdf_ingestion_for_actor_v1")), false);
});

test("Adapter assina somente download autorizado da Fonte exata", async () => {
  const contentHash = "a".repeat(64);
  const calls = [];
  const value = adapter(async (url, init) => {
    calls.push({ url, body: init.body == null ? null : JSON.parse(init.body) });
    if (url.endsWith("/rpc/get_course_source_pdf_download_for_actor_v1")) {
      return json({
        contract: "aralearn.course-source-pdf-download.v1",
        courseId: COURSE_ID,
        courseRevision: 5,
        sourceId: "source-pdf",
        sourceRevision: 2,
        storageOriginCourseId: COURSE_ID,
        attachment: {
          contentHash,
          byteSize: 1024,
          mediaType: "application/pdf",
          storagePath: `${COURSE_ID}/${contentHash}.pdf`,
          createdAt: "2026-08-20T12:00:00.000Z"
        }
      });
    }
    if (url.includes("/storage/v1/object/sign/course-source-pdfs/")) {
      return json({ signedURL: `/object/sign/course-source-pdfs/${COURSE_ID}/${contentHash}.pdf?token=sealed` });
    }
    assert.fail(`Requisição inesperada: ${url}`);
  });
  const downloaded = await value.getCourseSourcePdfDownload({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    expectedRevision: 5,
    sourceId: "source-pdf",
    sourceRevision: 2,
    contentHash
  });
  assert.equal(downloaded.contract, "aralearn.course-source-pdf-download.v2");
  assert.deepEqual(downloaded.attachment, { contentHash, byteSize: 1024, mediaType: "application/pdf" });
  assert.equal("storageOriginCourseId" in downloaded, false);
  assert.equal("storagePath" in downloaded.attachment, false);
  assert.match(downloaded.signedUrl, /token=sealed/u);
  assert.deepEqual(calls[0].body, {
    p_actor_id: USER_ID,
    p_course_id: COURSE_ID,
    p_expected_course_revision: 5,
    p_source_id: "source-pdf",
    p_source_revision: 2,
    p_content_hash: contentHash
  });
});

function recoveryInput() {
  return {
    principal: { actorId: USER_ID, authenticationKind: "application" },
    sourceCourseId: COURSE_ID,
    requestId: "recover-original-request-0001",
    expectedSourceCourseRevision: 3,
    expectedStudyUnitVersion: 2,
    didacticMicrosequenceId: "micro-a",
    studyUnit: { id: "study-a", position: 1, title: "Rascunho guardado", role: "theory",
      content: [{ id: "paragraph-a", package: "aralearn.resource.paragraph", version: "1.0.0", data: { text: "Conteúdo preservado." } }],
      response: null, feedback: [], topics: [] },
    applicationOrigin: "manual"
  };
}

function recoveryReceipt(overrides = {}) {
  return {
    contract: "aralearn.owned-course-copy-recovery.v1", status: "confirmed",
    sourceCourseId: COURSE_ID, targetCourseId: OTHER_COURSE_ID,
    currentCourseRevision: 8, currentStudyUnitVersion: null,
    studyUnitId: "study-a", initialCourseRevision: 2, initialStudyUnitVersion: 1,
    applicationOrigin: "manual", confirmedAt: "2026-09-05T12:00:00.000Z",
    ...overrides
  };
}

test("recuperação consulta apenas a prova original sem repetir o writer nem reconstruir a composição", async () => {
  const calls = [];
  const value = adapter(async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    assert.match(url, /\/rpc\/recover_owned_course_copy_for_actor_v1$/u);
    return json(recoveryReceipt());
  });
  const input = recoveryInput();
  const result = await value.recoverOwnedCourseCopy(input);
  assert.deepEqual(result, recoveryReceipt());
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.p_request_id, input.requestId);
  assert.equal(calls[0].body.p_actor_id, USER_ID);
  assert.equal(calls[0].body.p_expected_source_revision, 3);
  assert.equal(calls[0].body.p_expected_study_unit_version, 2);
  assert.equal(calls[0].body.p_application_origin, "manual");
  assert.equal(calls[0].body.p_upsert.entityId, input.studyUnit.id);
  assert.deepEqual(calls[0].body.p_upsert.content.content, input.studyUnit.content);
});

test("recuperação rejeita recibos incompatíveis e não converte ambiguidade em curso confirmado", async (context) => {
  const variants = [
    ["curso origem divergente", { sourceCourseId: OTHER_COURSE_ID }],
    ["unidade divergente", { studyUnitId: "other-unit" }],
    ["destino igual à origem", { targetCourseId: COURSE_ID }],
    ["revisão atual anterior à prova", { currentCourseRevision: 1 }],
    ["origem da alteração divergente", { applicationOrigin: "provider_assistance" }],
    ["data ausente", { confirmedAt: null }],
    ["resultado inconclusivo com destino", { status: "unresolved" }],
    ["campo inesperado", { createdCopy: true }]
  ];
  for (const [name, overrides] of variants) {
    await context.test(name, async () => {
      let calls = 0;
      const value = adapter(async () => { calls += 1; return json(recoveryReceipt(overrides)); });
      await assert.rejects(() => value.recoverOwnedCourseCopy(recoveryInput()));
      assert.equal(calls, 1);
    });
  }
  const unresolved = recoveryReceipt({ status: "unresolved", targetCourseId: null,
    currentCourseRevision: null, currentStudyUnitVersion: null, initialCourseRevision: null,
    initialStudyUnitVersion: null, confirmedAt: null });
  const value = adapter(async () => json(unresolved));
  assert.deepEqual(await value.recoverOwnedCourseCopy(recoveryInput()), unresolved);
});

test("leitura de Design da StudyUnit conserva o inventário da Microssequência", async () => {
  let payload = null;
  const value = adapter(async (url, init) => {
    assert.match(url, /\/rpc\/get_owned_course_design_for_actor_v3$/u);
    payload = JSON.parse(init.body);
    return json(studyUnitCourseDesignRead());
  });
  const result = await value.getCourseDesign({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    scopeKind: "study_unit",
    scopeRef: "unit-a",
    childLimit: 1,
    childCursor: null
  });
  assert.equal(payload.p_scope_kind, "study_unit");
  assert.equal(payload.p_scope_ref, "unit-a");
  assert.deepEqual(result.targetPlanItems, {
    instructionalAnalysisUnitIds: [PLAN_ID],
    evidenceRequirementIds: [STEP_ID]
  });
});




test("remove_pdf apaga via Storage somente após claim global e confirma a intenção", async () => {
  const contentHash = "a".repeat(64);
  const storagePath = `${COURSE_ID}/${contentHash}.pdf`;
  const calls = [];
  const value = adapter(async (url, init) => {
    const body = init.body == null ? null : JSON.parse(init.body);
    calls.push({ url, method: init.method, body });
    if (url.endsWith("/remove_course_source_pdf_for_actor_v1")) {
      return json({
        contract: "aralearn.course-source-change.v1",
        courseId: COURSE_ID,
        courseRevision: 6,
        requestId: "request-source-pdf-remove-1",
        idempotent: false,
        changed: true,
        change: { type: "remove_pdf", subjectId: "source-pdf", revision: 2 }
      });
    }
    if (url.endsWith("/claim_course_source_pdf_delete_for_actor_v1")) {
      return json({ storagePath });
    }
    if (init.method === "DELETE" &&
        url.endsWith("/storage/v1/object/course-source-pdfs")) {
      assert.deepEqual(body, { prefixes: [storagePath] });
      return json([]);
    }
    if (url.endsWith("/complete_course_source_pdf_delete_for_actor_v1")) {
      assert.equal(body.p_storage_path, storagePath);
      return json(true);
    }
    assert.fail(`Requisição inesperada: ${url}`);
  });
  const result = await value.executeCourseSourceCommand({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    requestId: "request-source-pdf-remove-1",
    expectedCourseRevision: 5,
    command: {
      type: "remove_pdf",
      sourceId: "source-pdf",
      expectedSourceRevision: 2,
      contentHash
    }
  });
  assert.equal(result.changed, true);
  assert.deepEqual(calls.map(({ method, url }) => [method, url.split("/").at(-1)]), [
    ["POST", "remove_course_source_pdf_for_actor_v1"],
    ["POST", "claim_course_source_pdf_delete_for_actor_v1"],
    ["DELETE", "course-source-pdfs"],
    ["POST", "complete_course_source_pdf_delete_for_actor_v1"]
  ]);

  let storageDelete = false;
  const shared = adapter(async (url, init) => {
    if (url.endsWith("/remove_course_source_pdf_for_actor_v1")) {
      return json({
        contract: "aralearn.course-source-change.v1",
        courseId: COURSE_ID,
        courseRevision: 6,
        requestId: "request-source-pdf-shared-1",
        idempotent: false,
        changed: true,
        change: { type: "remove_pdf", subjectId: "source-pdf", revision: 2 }
      });
    }
    if (url.endsWith("/claim_course_source_pdf_delete_for_actor_v1")) return json(null);
    if (init.method === "DELETE") storageDelete = true;
    assert.fail(`Requisição inesperada: ${url}`);
  });
  await shared.executeCourseSourceCommand({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    requestId: "request-source-pdf-shared-1",
    expectedCourseRevision: 5,
    command: {
      type: "remove_pdf",
      sourceId: "source-pdf",
      expectedSourceRevision: 2,
      contentHash
    }
  });
  assert.equal(storageDelete, false);
});

test("retomada por Fonte conclui delete físico pendente com a identidade original", async () => {
  const contentHash = "c".repeat(64);
  const storagePath = `${COURSE_ID}/${contentHash}.pdf`;
  const requestId = "request-source-pdf-pending-1";
  const calls = [];
  let claims = 0;
  const value = adapter(async (url, init) => {
    const body = init.body == null ? null : JSON.parse(init.body);
    calls.push({ url, method: init.method, body });
    if (url.endsWith(
      "/claim_pending_course_source_pdf_delete_for_source_for_actor_v1"
    )) {
      claims += 1;
      assert.deepEqual(body, {
        p_actor_id: USER_ID,
        p_course_id: COURSE_ID,
        p_source_id: "source-pdf"
      });
      return json(claims === 1 ? { requestId, storagePath } : null);
    }
    if (init.method === "DELETE" &&
        url.endsWith("/storage/v1/object/course-source-pdfs")) {
      assert.deepEqual(body, { prefixes: [storagePath] });
      return json([]);
    }
    if (url.endsWith("/complete_course_source_pdf_delete_for_actor_v1")) {
      assert.deepEqual(body, {
        p_actor_id: USER_ID,
        p_course_id: COURSE_ID,
        p_request_id: requestId,
        p_storage_path: storagePath
      });
      return json(true);
    }
    assert.fail(`Requisição inesperada: ${url}`);
  });

  const result = await value.resumeCourseSourcePdfDeletes({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    sourceId: "source-pdf"
  });
  assert.deepEqual(result, { deleted: 1 });
  assert.deepEqual(calls.map(({ method, url }) => [method, url.split("/").at(-1)]), [
    ["POST", "claim_pending_course_source_pdf_delete_for_source_for_actor_v1"],
    ["DELETE", "course-source-pdfs"],
    ["POST", "complete_course_source_pdf_delete_for_actor_v1"],
    ["POST", "claim_pending_course_source_pdf_delete_for_source_for_actor_v1"]
  ]);
});


test("normaliza targetPlanItems somente para leitura e rejeita segundo writer", async () => {
  const readFixture = courseDesignRead();
  readFixture.scopeContext = {
    current: { kind: "didactic_microsequence", ref: "micro-a", label: "Micro A" },
    ancestors: [
      { kind: "course", ref: COURSE_ID, label: "Curso" },
      { kind: "module", ref: "module-a", label: "Módulo A" },
      { kind: "lesson", ref: "lesson-a", label: "Lição A" }
    ],
    children: [],
    childCount: 0,
    hasMoreChildren: false,
    nextChildCursor: null
  };
  readFixture.targetPlanItems = {
    instructionalAnalysisUnitIds: [PLAN_ID],
    evidenceRequirementIds: [STEP_ID]
  };
  const calls = [];
  const value = adapter(async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (url.endsWith("/rpc/get_owned_course_design_for_actor_v3")) return json(readFixture);
    return json({
      contract: "aralearn.course-design-change.v3",
      courseId: COURSE_ID,
      courseRevision: 6,
      requestId: "request-target-items-0001",
      idempotent: false,
      changed: true,
      change: {
        type: "set_target_plan_items",
        scope: { kind: "didactic_microsequence", ref: "micro-a" },
        parameterId: null
      }
    });
  });
  const read = await value.getCourseDesign({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    scopeKind: "didactic_microsequence",
    scopeRef: "micro-a"
  });
  assert.deepEqual(read.targetPlanItems, readFixture.targetPlanItems);

  const command = {
    type: "set_target_plan_items",
    scope: { kind: "didactic_microsequence", ref: "micro-a" },
    instructionalAnalysisUnitIds: [PLAN_ID],
    evidenceRequirementIds: [STEP_ID]
  };
  await assert.rejects(() => value.applyCourseDesignCommand({
    principal: { actorId: USER_ID, authenticationKind: "oauth" },
    courseId: COURSE_ID,
    requestId: "request-target-items-0001",
    expectedCourseRevision: 5,
    command
  }), (error) => error.code === "invalid_course_design_command");
  assert.equal(calls.length, 1);

  const invalid = structuredClone(readFixture);
  invalid.targetPlanItems.instructionalAnalysisUnitIds.push(PLAN_ID);
  await assert.rejects(
    () => adapter(async () => json(invalid)).getCourseDesign({
      principal: { actorId: USER_ID },
      courseId: COURSE_ID,
      scopeKind: "didactic_microsequence",
      scopeRef: "micro-a"
    }),
    (error) => error.code === "course_service_unavailable"
  );
});

test("traduz concorrência do banco sem expor detalhes internos", async () => {
  let concurrencyCalls = 0;
  const value = adapter(async () => {
    concurrencyCalls += 1;
    return json({ code: "40001", message: "private.secret" }, 500);
  });
  await assert.rejects(
    () => value.commitCourseComposition({
      principal: { actorId: USER_ID, authenticationKind: "oauth" },
      courseId: COURSE_ID,
      requestId: "request-change-0001",
      expectedRevision: 2,
      upserts: [],
      deletes: []
    }),
    (error) => error.status === 409 &&
      error.code === "stale_course_state" &&
      !error.message.includes("private.secret")
  );
  assert.equal(concurrencyCalls, 1);

  const requestConflict = adapter(async () => json({
    code: "23514",
    message: "requestId reutilizado com comando incompatível."
  }, 400));
  await assert.rejects(
    () => requestConflict.applyCourseDesignCommand({
      principal: { actorId: USER_ID, authenticationKind: "application" },
      courseId: COURSE_ID,
      requestId: "request-design-conflict",
      expectedCourseRevision: 5,
      command: { type: "clear_guidance", scope: { kind: "course", ref: COURSE_ID } }
    }),
    (error) => error.status === 409 && error.code === "request_id_conflict"
  );
});

test("replay idempotente chega ao receipt mesmo após a revisão avançar", async () => {
  const calls = [];
  const value = adapter(async (url) => {
    calls.push(url);
    if (url.endsWith("/rpc/commit_course_composition_for_actor_v1")) {
      return json({ courseId: COURSE_ID, revision: 3, idempotent: true });
    }
    assert.fail("Replay não deve reler as entidades da revisão anterior.");
  });
  const result = await value.commitCourseComposition({
    principal: { actorId: USER_ID, authenticationKind: "oauth" },
    courseId: COURSE_ID,
    requestId: "request-replay-0001",
    expectedRevision: 2,
    upserts: [{
      entityType: "module",
      entityId: "module-a",
      parentType: null,
      parentId: null,
      position: 0,
      content: { title: "Módulo A" }
    }],
    deletes: []
  });
  assert.equal(result.idempotent, true);
  assert.deepEqual(calls.map((url) => url.split("/").at(-1)), [
    "commit_course_composition_for_actor_v1"
  ]);
});










test("encaminha somente o segmento alterado sem reler a composição integral", async () => {
  const calls = [];
  const value = adapter(async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    assert.match(url, /commit_course_composition_for_actor_v1$/u);
    return json({
      courseId: COURSE_ID,
      revision: 3,
      operation: "commit_course_composition",
      createdCount: 0,
      updatedCount: 1,
      upsertedCount: 1,
      deletedCount: 0,
      idempotent: false,
      updatedAt: "2026-08-20T22:45:00.000Z"
    });
  });
  const upserts = [{
    entityType: "module",
    entityId: "module-a",
    parentType: null,
    parentId: null,
    position: 0,
    content: { title: "Módulo A" }
  }];
  const result = await value.commitCourseComposition({
    principal: { actorId: USER_ID, authenticationKind: "oauth" },
    courseId: COURSE_ID,
    requestId: "request-change-segment-0001",
    expectedRevision: 2,
    upserts,
    deletes: [],
    sourceAttributionApplications: []
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body.p_upserts, upserts);
  assert.deepEqual(calls[0].body.p_source_attribution_applications, []);
  assert.equal(calls[0].body.p_channel, "mcp");
  assert.deepEqual(Object.keys(result).sort(), [
    "courseId", "createdCount", "deepLink", "deletedCount", "idempotent",
    "operation", "revision", "updatedAt", "updatedCount", "upsertedCount"
  ]);
});

test("composição da aplicação deriva canal e aceita somente metadado fechado", async () => {
  let rpc = null;
  const sourceLinks = [{
    sourceId: "fonte retirada",
    linkId: "fonte retirada", roles: [], occurrences: [],
    relation: "needs_verification",
    anchors: []
  }];
  const value = adapter(async (url, init) => {
    rpc = { url, body: JSON.parse(init.body) };
    return json({
      courseId: COURSE_ID,
      revision: 5,
      operation: "commit_course_composition",
      createdCount: 0,
      updatedCount: 1,
      upsertedCount: 1,
      deletedCount: 0,
      idempotent: false,
      updatedAt: "2026-08-20T22:45:00.000Z",
      channel: "application",
      applicationOrigin: "manual",
      expectedStudyUnitVersion: 2
    });
  });
  const input = {
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    requestId: "request-manual-edit-0001",
    expectedRevision: 4,
    expectedStudyUnitVersion: 2,
    applicationOrigin: "manual",
    upserts: [{
      entityType: "study_unit",
      entityId: "unit-a",
      parentType: "microsequence",
      parentId: "micro-a",
      position: 1,
      content: { title: "Unidade revista" }
    }],
    deletes: [],
    sourceAttributionApplications: [{ studyUnitId: "unit-a", sourceLinks }]
  };

  const result = await value.commitCourseComposition(input);

  assert.match(rpc.url, /commit_course_composition_for_actor_v1$/u);
  assert.equal(rpc.body.p_channel, "application");
  assert.equal(rpc.body.p_application_origin, "manual");
  assert.equal(rpc.body.p_expected_study_unit_version, 2);
  assert.deepEqual(
    rpc.body.p_source_attribution_applications[0].sourceLinks,
    sourceLinks
  );
  assert.equal(result.channel, "application");
  assert.match(result.deepLink, /section=planning/u);

  await assert.rejects(
    () => value.commitCourseComposition({ ...input, applicationOrigin: "prompt livre" }),
    (error) => error.code === "invalid_course_composition_origin"
  );
  await assert.rejects(
    () => value.commitCourseComposition({
      ...input,
      principal: { actorId: USER_ID, authenticationKind: "oauth" }
    }),
    (error) => error.code === "invalid_course_composition_origin"
  );
});

test("composição ampla da aplicação preserva o contrato sem metadados focais", async () => {
  let rpc = null;
  const value = adapter(async (url, init) => {
    rpc = { url, body: JSON.parse(init.body) };
    return json({
      courseId: COURSE_ID,
      revision: 3,
      operation: "commit_course_composition",
      createdCount: 1,
      updatedCount: 0,
      upsertedCount: 1,
      deletedCount: 0,
      idempotent: false,
      updatedAt: "2026-08-20T22:45:00.000Z",
      channel: "application",
      applicationOrigin: null,
      expectedStudyUnitVersion: null
    });
  });
  const result = await value.commitCourseComposition({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    requestId: "request-broad-application-composition-0001",
    expectedRevision: 2,
    upserts: [{
      entityType: "module",
      entityId: "module-a",
      parentType: null,
      parentId: null,
      position: 0,
      content: { title: "Módulo A" }
    }],
    deletes: [],
    sourceAttributionApplications: []
  });

  assert.match(rpc.url, /commit_course_composition_for_actor_v1$/u);
  assert.equal(rpc.body.p_channel, "application");
  assert.equal(rpc.body.p_application_origin, null);
  assert.equal(rpc.body.p_expected_study_unit_version, null);
  assert.equal(result.revision, 3);
});

test("perfil e acesso usam somente os RPCs canônicos para o ator autenticado", async () => {
  const calls = [];
  const value = adapter(async (url, init) => {
    calls.push({ name: url.split("/").at(-1), payload: JSON.parse(init.body) });
    if (url.endsWith("/get_person_profile_for_actor_v2")) {
      return json({ userId: USER_ID, handle: null });
    }
    if (url.endsWith("/update_person_profile_for_actor_v2")) {
      return json({ userId: USER_ID, handle: "pesquisadora" });
    }
    if (url.endsWith("/list_course_access_for_actor_v2")) {
      return json({ courseId: COURSE_ID, items: [] });
    }
    if (url.endsWith("/manage_course_access_for_actor_v2")) {
      return json({ courseId: COURSE_ID, changed: true });
    }
    assert.fail(`RPC inesperado: ${url}`);
  });
  const principal = { actorId: USER_ID };

  await value.getPersonProfile({ principal });
  await value.updatePersonProfile({ principal, patch: { handle: "pesquisadora" } });
  await value.listCourseAccess({ principal, courseId: COURSE_ID });
  await value.manageCourseAccess({
    principal,
    courseId: COURSE_ID,
    operation: "grant_access",
    handle: "pessoa", targetUserId: USER_ID,
    confirmed: true,
    requestId: "request-access-0001"
  });
  await value.manageCourseAccess({
    principal,
    courseId: COURSE_ID,
    operation: "revoke_access",
    targetUserId: USER_ID,
    confirmed: true,
    requestId: "request-access-0002"
  });

  assert.deepEqual(calls.map(({ name }) => name), [
    "get_person_profile_for_actor_v2",
    "update_person_profile_for_actor_v2",
    "list_course_access_for_actor_v2",
    "manage_course_access_for_actor_v2",
    "manage_course_access_for_actor_v2"
  ]);
  assert.equal(calls.every(({ payload }) => payload.p_actor_id === USER_ID), true);
  assert.equal(calls[3].payload.p_target_handle, "pessoa");
  assert.equal(calls[4].payload.p_target_user_id, USER_ID);
});

test("identificador público ocupado retorna conflito sem expor o erro SQL", async () => {
  const value = adapter(async (url) => {
    assert.match(url, /\/update_person_profile_for_actor_v2$/u);
    return json({ code: "PH409", message: "internal constraint person_handle_unique", details: "private row" }, 400);
  });
  await assert.rejects(() => value.updatePersonProfile({
    principal: { actorId: USER_ID }, patch: { handle: "pesquisadora" }
  }), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, "person_handle_unavailable");
    assert.doesNotMatch(JSON.stringify(error) + error.message, /constraint|private row|PH409/u);
    return true;
  });
});

test("busca de pessoas assina por 60 segundos somente o avatar do resultado autorizado", async () => {
  const avatarObjectKey = `${USER_ID}/${AUDIT_RUN_ID}.webp`;
  const calls = [];
  const value = adapter(async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    if (url.endsWith("/search_course_access_people_for_actor_v1")) {
      return json({ contract: "aralearn.course-people-search.v1", courseId: COURSE_ID,
        items: [{ userId: USER_ID, handle: "pesquisadora", avatarObjectKey }] });
    }
    assert.ok(url.endsWith(`/storage/v1/object/sign/person-avatars/${avatarObjectKey}`));
    return json({ signedURL: `/object/sign/person-avatars/${avatarObjectKey}?token=sealed` });
  });
  const result = await value.searchCourseAccessPeople({
    principal: { actorId: USER_ID }, courseId: COURSE_ID, query: "pes", limit: 5
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].body, { p_actor_id: USER_ID, p_course_id: COURSE_ID, p_query: "pes", p_limit: 5 });
  assert.deepEqual(calls[1].body, { expiresIn: 60 });
  assert.equal(result.items[0].avatarUrl,
    `https://project.example/storage/v1/object/sign/person-avatars/${avatarObjectKey}?token=sealed`);
});

test("busca recusa resultado divergente antes de assinar qualquer avatar", async (context) => {
  const person = { userId: USER_ID, handle: "pesquisadora", avatarObjectKey: `${USER_ID}/${AUDIT_RUN_ID}.webp` };
  const result = { contract: "aralearn.course-people-search.v1", courseId: COURSE_ID, items: [person] };
  for (const [name, response] of [
    ["curso", { ...result, courseId: OTHER_COURSE_ID }],
    ["proprietário do avatar", { ...result, items: [{ ...person, avatarObjectKey: `${OTHER_COURSE_ID}/${AUDIT_RUN_ID}.webp` }] }],
    ["pessoa fora do prefixo", { ...result, items: [{ ...person, handle: "outra" }] }],
    ["campo privado adicional", { ...result, items: [{ ...person, email: "private@example.test" }] }]
  ]) {
    await context.test(name, async () => {
      let calls = 0;
      const value = adapter(async (url) => {
        calls += 1;
        assert.match(url, /\/search_course_access_people_for_actor_v1$/u);
        return json(response);
      });
      await assert.rejects(() => value.searchCourseAccessPeople({
        principal: { actorId: USER_ID }, courseId: COURSE_ID, query: "pes", limit: 5
      }), (error) => error.status === 503 && error.code === "course_service_unavailable");
      assert.equal(calls, 1);
    });
  }
});

test("ciclo de vida nunca apaga por prefixo PDF que pode permanecer referenciado", async () => {
  const calls = [];
  const value = adapter(async (url, init) => {
    const body = init.body == null ? null : JSON.parse(init.body);
    calls.push({ url, init, body });
    if (url.endsWith("/rest/v1/rpc/maintain_course_for_actor_v1")) {
      return json({
        contract: "aralearn.course-lifecycle.v1",
        courseId: COURSE_ID,
        operation: "delete_owned_course",
        status: "completed",
        changed: true,
        requestId: "request-delete-course-0001"
      });
    }
    if (url.endsWith("/storage/v1/object/list/course-source-pdfs")) return json([{ name: `${"a".repeat(64)}.pdf` }]);
    assert.fail(`Requisição inesperada: ${url}`);
  });
  assert.deepEqual(await value.maintainCourse({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    operation: "delete_owned_course",
    confirmed: true,
    requestId: "request-delete-course-0001"
  }), {
    contract: "aralearn.course-lifecycle.v1",
    courseId: COURSE_ID,
    operation: "delete_owned_course",
    status: "completed",
    changed: true,
    requestId: "request-delete-course-0001",
    fileCleanupPending: true
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.includes("/storage/v1/object"), false);
  assert.equal(calls.some(call => call.init.method === "DELETE"), false);
  assert.equal(calls[1].body.limit, 1);
});

test("exclusão sem arquivos não inventa limpeza pendente", async () => {
  const value = adapter(async url => {
    if (url.endsWith("/rest/v1/rpc/maintain_course_for_actor_v1")) return json({
      contract: "aralearn.course-lifecycle.v1", courseId: COURSE_ID, operation: "delete_owned_course",
      status: "completed", changed: true, requestId: "delete-empty-course-303"
    });
    if (url.endsWith("/storage/v1/object/list/course-source-pdfs")) return json([]);
    assert.fail(url);
  });
  const result = await value.maintainCourse({ principal: { actorId: USER_ID }, courseId: COURSE_ID,
    operation: "delete_owned_course", confirmed: true, requestId: "delete-empty-course-303" });
  assert.equal(result.fileCleanupPending, false);
});

test("repetição de exclusão já concluída não ganha autoridade sobre Storage órfão", async () => {
  const calls = [];
  const value = adapter(async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/rest/v1/rpc/maintain_course_for_actor_v1")) {
      return json({
        contract: "aralearn.course-lifecycle.v1",
        courseId: COURSE_ID,
        operation: "delete_owned_course",
        status: "already_absent",
        changed: false,
        requestId: "request-delete-course-0001"
      });
    }
    assert.fail(`Requisição inesperada: ${url}`);
  });
  const result = await value.maintainCourse({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    operation: "delete_owned_course",
    confirmed: true,
    requestId: "request-delete-course-0001"
  });
  assert.equal(result.status, "already_absent");
  assert.equal(result.fileCleanupPending, false);
  assert.equal(calls.length, 1);
});

test("Manutenção remove somente o objeto revalidado e relê o inventário", async () => {
  const calls = [];
  const objectPath = `${USER_ID}/${AUDIT_RUN_ID}.png`;
  const maintenanceState = {
    contract: "aralearn.current-maintenance.v1",
    role: "administrator",
    retention: { scheduled: true, schedule: "17 3 * * *" },
    inventory: { items: [] }
  };
  const value = adapter(async (url, init) => {
    const body = init.body == null ? null : JSON.parse(init.body);
    calls.push({ url, init, body });
    if (url.endsWith("/authorize_current_orphan_removal_for_actor_v1")) {
      return json({
        contract: "aralearn.current-maintenance-removal.v1",
        classification: "avatar_profile_unlinked",
        bucketId: "person-avatars",
        objectPath,
        authorized: true
      });
    }
    if (url.endsWith("/storage/v1/object/person-avatars")) return json({});
    if (url.endsWith("/get_current_maintenance_for_actor_v1")) return json(maintenanceState);
    assert.fail(`Requisição inesperada: ${url}`);
  });
  const result = await value.executeCurrentMaintenance({
    principal: { actorId: USER_ID },
    operation: "remove_orphan_object",
    classification: "avatar_profile_unlinked",
    objectPath,
    confirmed: true
  });
  assert.equal(result.contract, "aralearn.current-maintenance-action.v1");
  assert.equal(result.result.removed, true);
  assert.deepEqual(result.state, maintenanceState);
  assert.deepEqual(calls[1].body, { prefixes: [objectPath] });
  assert.equal(calls[1].init.headers.apikey, "sb_secret_test");
});
