import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyCourseSourceBibliographicMetadata } from "../../src/domain/courseSources.js";

import { routeCourseRequest } from "../../supabase/functions/_shared/aralearn-authoring/courseProtocol.js";
import { executeCourseRoute } from "../../supabase/functions/_shared/aralearn-authoring/courseRouter.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const PLAN_ID = "15000000-0000-4000-8000-000000000005";
const PART_ID = "20000000-0000-4000-8000-000000000002";
const PRINCIPAL = { actorId: COURSE_ID, scopes: ["authoring:write"] };

function request(path, { method = "GET", body = null, requestId = null } = {}) {
  return new Request(`https://aralearn.invalid${path}`, {
    method,
    headers: {
      ...(body == null ? {} : { "Content-Type": "application/json" }),
      ...(requestId == null ? {} : { "Idempotency-Key": requestId })
    },
    ...(body == null ? {} : { body: JSON.stringify(body) })
  });
}


test("observações chegam ao Adapter com query canônica e sem autoridade do cliente", async () => {
  const calls = [];
  const adapter = {
    async getCourseAnchoredAnnotations(value) {
      calls.push({ operation: "read", value });
      return { contract: "read-ok" };
    },
    async executeCourseAnchoredAnnotationCommand(value) {
      calls.push({ operation: "write", value });
      return { contract: "write-ok" };
    }
  };
  const read = request(
    `/v1/courses/${COURSE_ID}/anchored-annotations?` +
      "expectedRevision=7&annotationSetVersion=4&mode=target&" +
      "origin=author&origin=learner&channel=authoring_chat&state=open&" +
      "category=possible_error&includeUncategorized=false&subjectId=topic-a&" +
      "targetKind=study_unit&targetId=unit-a&includeDescendants=false&" +
      "cursor=Y3Vyc29yLTE%3D&limit=12"
  );
  const readResult = await executeCourseRoute({
    request: read,
    route: routeCourseRequest("GET", new URL(read.url).pathname),
    adapter,
    principal: PRINCIPAL
  });
  assert.deepEqual(readResult.data, { contract: "read-ok" });
  assert.deepEqual(calls[0].value.query, {
    mode: "target",
    origins: ["author", "learner"],
    channels: ["authoring_chat"],
    states: ["open"],
    categories: ["possible_error"],
    includeUncategorized: false,
    subjectIds: ["topic-a"],
    hierarchy: {
      target: { kind: "study_unit", id: "unit-a" },
      includeDescendants: false
    },
    annotationId: null
  });
  assert.equal(calls[0].value.expectedCourseRevision, 7);
  assert.equal(calls[0].value.annotationSetVersion, 4);
  assert.equal(calls[0].value.cursor, "Y3Vyc29yLTE=");
  assert.equal(calls[0].value.limit, 12);
  for (const invalidQuery of [
    "expectedRevision=7&annotationSetVersion=&mode=inbox",
    "expectedRevision=7&mode="
  ]) {
    const invalidRead = request(
      `/v1/courses/${COURSE_ID}/anchored-annotations?${invalidQuery}`
    );
    await assert.rejects(
      () => executeCourseRoute({
        request: invalidRead,
        route: routeCourseRequest("GET", new URL(invalidRead.url).pathname),
        adapter,
        principal: PRINCIPAL
      }),
      (error) => error.code === "invalid_course_anchored_annotation_read_options" ||
        error.code === "invalid_course_anchored_annotation_query"
    );
  }
  const oversizedParams = new URLSearchParams({
    expectedRevision: "7",
    mode: "inbox"
  });
  for (let index = 0; index < 16; index += 1) {
    const prefix = `s${index}-`;
    oversizedParams.append(
      "subjectId",
      `${prefix}${"é".repeat(240 - [...prefix].length)}`
    );
  }
  const oversizedRead = request(
    `/v1/courses/${COURSE_ID}/anchored-annotations?${oversizedParams}`
  );
  await assert.rejects(
    () => executeCourseRoute({
      request: oversizedRead,
      route: routeCourseRequest("GET", new URL(oversizedRead.url).pathname),
      adapter,
      principal: PRINCIPAL
    }),
    (error) => error.status === 414 &&
      error.code === "course_anchored_annotations_query_too_large"
  );

  const annotationId = "60000000-0000-4000-8000-000000000006";
  const writePath = `/v1/courses/${COURSE_ID}/anchored-annotations/changes`;
  const write = request(writePath, {
    method: "POST",
    requestId: "request-annotation-router-1",
    body: {
      requestId: "request-annotation-router-1",
      expectedCourseRevision: 7,
      command: {
        type: "create_anchored_annotation",
        annotationId,
        target: { kind: "study_unit", id: "unit-a" },
        rawText: "  Texto bruto exato.  ",
        category: null,
        capturedAt: null,
        briefSummary: null
      }
    }
  });
  await executeCourseRoute({
    request: write,
    route: routeCourseRequest("POST", writePath),
    adapter,
    principal: PRINCIPAL
  });
  assert.equal(calls[1].value.expectedCourseRevision, 7);
  assert.equal(calls[1].value.command.rawText, "  Texto bruto exato.  ");
  assert.equal(Object.hasOwn(calls[1].value.command, "origin"), false);
  assert.equal(Object.hasOwn(calls[1].value.command, "channel"), false);

  await assert.rejects(
    () => executeCourseRoute({
      request: request(writePath, {
        method: "POST",
        requestId: "request-annotation-router-course",
        body: {
          requestId: "request-annotation-router-course",
          expectedCourseRevision: 7,
          command: {
            ...JSON.parse(JSON.stringify(calls[1].value.command)),
            target: { kind: "course", id: PLAN_ID }
          }
        }
      }),
      route: routeCourseRequest("POST", writePath),
      adapter,
      principal: PRINCIPAL
    }),
    (error) => error.code === "invalid_course_anchored_annotation_command"
  );

  const reviseBody = {
    requestId: "request-annotation-router-2",
    expectedCourseRevision: null,
    command: {
      type: "revise_anchored_annotation",
      annotationId,
      expectedAnnotationVersion: 1,
      rawText: "Texto revisto",
      category: "confusing",
      briefSummary: null
    }
  };
  await executeCourseRoute({
    request: request(writePath, {
      method: "POST",
      requestId: reviseBody.requestId,
      body: reviseBody
    }),
    route: routeCourseRequest("POST", writePath),
    adapter,
    principal: PRINCIPAL
  });
  assert.equal(calls[2].value.expectedCourseRevision, null);
  assert.equal(calls[2].value.command.expectedAnnotationVersion, 1);

  await assert.rejects(
    () => executeCourseRoute({
      request: request(writePath, {
        method: "POST",
        requestId: reviseBody.requestId,
        body: { ...reviseBody, expectedCourseRevision: 7 }
      }),
      route: routeCourseRequest("POST", writePath),
      adapter,
      principal: PRINCIPAL
    }),
    (error) => error.code === "invalid_course_anchored_annotation_command"
  );
  await assert.rejects(
    () => executeCourseRoute({
      request: request(writePath, {
        method: "POST",
        requestId: "request-annotation-router-3",
        body: {
          ...reviseBody,
          requestId: "request-annotation-router-3",
          origin: "author"
        }
      }),
      route: routeCourseRequest("POST", writePath),
      adapter,
      principal: PRINCIPAL
    }),
    (error) => error.code === "unknown_course_command_field"
  );

  const sourceRead = request(
    `/v1/courses/${COURSE_ID}/anchored-annotations?` +
      "expectedRevision=7&mode=target&category=reformulation_request&" +
      "includeUncategorized=false&targetKind=source&targetId=source-a&" +
      "includeDescendants=true&limit=24"
  );
  await executeCourseRoute({
    request: sourceRead,
    route: routeCourseRequest("GET", new URL(sourceRead.url).pathname),
    adapter,
    principal: PRINCIPAL
  });
  assert.deepEqual(calls[3].value.query.hierarchy, {
    target: { kind: "source", id: "source-a" },
    includeDescendants: true
  });
  assert.deepEqual(calls[3].value.query.categories, ["reformulation_request"]);

  const consideredSourceLinks = [{
    sourceId: "source-a",
    relation: "supported_by",
    anchors: [{ anchorId: "anchor-a" }]
  }];
  await executeCourseRoute({
    request: request(writePath, {
      method: "POST",
      requestId: "request-annotation-router-4",
      body: {
        requestId: "request-annotation-router-4",
        expectedCourseRevision: null,
        command: {
          type: "respond_to_anchored_annotation",
          annotationId,
          expectedAnnotationVersion: 2,
          ownerResponse: "Interpretação reformulada.",
          responseKind: "reformulation",
          consideredSourceLinks
        }
      }
    }),
    route: routeCourseRequest("POST", writePath),
    adapter,
    principal: PRINCIPAL
  });
  assert.deepEqual(calls[4].value.command.consideredSourceLinks,
    consideredSourceLinks);
});

test("Analytics chega ao Adapter somente com o escopo atual", async () => {
  const calls = [];
  const adapter = {
    async getCourseAuthoringAnalytics(value) {
      calls.push(value);
      return { contract: "research-read-ok" };
    }
  };
  const read = request(
    `/v1/courses/${COURSE_ID}/research?expectedRevision=7&` +
      "scopeKind=didactic_microsequence&scopeRef=micro-dns"
  );
  const result = await executeCourseRoute({
    request: read,
    route: routeCourseRequest("GET", new URL(read.url).pathname),
    adapter,
    principal: PRINCIPAL
  });

  assert.deepEqual(result.data, { contract: "research-read-ok" });
  assert.equal(calls[0].courseId, COURSE_ID);
  assert.equal(calls[0].expectedCourseRevision, 7);
  assert.deepEqual(calls[0].query, {
    scope: { kind: "didactic_microsequence", ref: "micro-dns" }
  });

  for (const invalid of [
    "expectedRevision=7&expectedRevision=8",
    "expectedRevision=7&scopeKind=unknown&scopeRef=micro-dns",
    `expectedRevision=7&scopeKind=course&scopeRef=${COURSE_ID}`,
    "expectedRevision=7&dataset=annotations"
  ]) {
    const invalidRead = request(`/v1/courses/${COURSE_ID}/research?${invalid}`);
    await assert.rejects(() => executeCourseRoute({
      request: invalidRead,
      route: routeCourseRequest("GET", new URL(invalidRead.url).pathname),
      adapter,
      principal: PRINCIPAL
    }), (error) => error.status === 422);
  }
});


test("lista com paginação completa e lê outline", async () => {
  const calls = [];
  const adapter = {
    async listCourses(value) { calls.push(["list", value]); return { items: [] }; },
    async getCourse(value) { calls.push(["get", value]); return { courseId: value.courseId }; }
  };
  const listRequest = request(`/v1/courses?query=rede&limit=12&beforeUpdatedAt=2026-08-17T10%3A00%3A00Z&beforeId=${COURSE_ID}`);
  await executeCourseRoute({
    request: listRequest,
    route: routeCourseRequest("GET", new URL(listRequest.url).pathname),
    adapter,
    principal: PRINCIPAL
  });
  const getRequest = request(`/v1/courses/${COURSE_ID}?view=outline`);
  await executeCourseRoute({
    request: getRequest,
    route: routeCourseRequest("GET", new URL(getRequest.url).pathname),
    adapter,
    principal: PRINCIPAL
  });

  assert.equal(calls[0][1].query, "rede");
  assert.equal(calls[0][1].limit, 12);
  assert.equal(calls[0][1].beforeId, COURSE_ID);
  assert.equal(calls[1][1].courseId, COURSE_ID);
  assert.equal(calls[1][1].includeOutline, true);
});

test("lê entidades paginadas sob a mesma versão", async () => {
  let call = null;
  const adapter = {
    async listCourseEntities(value) {
      call = value;
      return { courseId: value.courseId, revision: value.expectedRevision, items: [] };
    }
  };
  const value = request(
    `/v1/courses/${COURSE_ID}/entities?expectedRevision=4&limit=50` +
      "&afterEntityType=microsequence&afterEntityId=micro-a"
  );
  const result = await executeCourseRoute({
    request: value,
    route: routeCourseRequest("GET", new URL(value.url).pathname),
    adapter,
    principal: PRINCIPAL
  });
  assert.equal(result.data.revision, 4);
  assert.equal(call.courseId, COURSE_ID);
  assert.equal(call.expectedRevision, 4);
  assert.equal(call.afterEntityType, "microsequence");
  assert.equal(call.afterEntityId, "micro-a");
});

test("lê Unidades de estudo por escopo com âncora e orçamento limitado", async () => {
  let call = null;
  const adapter = {
    async listCourseStudyUnits(value) {
      call = value;
      return {
        contract: "aralearn.course-study-unit-inspection-page.v2",
        courseId: value.courseId,
        courseRevision: value.expectedRevision,
        items: []
      };
    }
  };
  const value = request(
    `/v2/courses/${COURSE_ID}/study-units?expectedRevision=8` +
      `&scopeKind=authoring_part&scopeId=${PART_ID}` +
      "&anchorStudyUnitId=unit-a&direction=backward&limit=12&maxBytes=262144"
  );
  const result = await executeCourseRoute({
    request: value,
    route: routeCourseRequest("GET", new URL(value.url).pathname),
    adapter,
    principal: PRINCIPAL
  });

  assert.equal(result.data.courseRevision, 8);
  assert.equal(call.scopeKind, "authoring_part");
  assert.equal(call.scopeId, PART_ID);
  assert.equal(call.anchorStudyUnitId, "unit-a");
  assert.equal(call.cursorStudyUnitId, null);
  assert.equal(call.direction, "backward");
  assert.equal(call.maxBytes, 262144);
  const invalid = request(
    `/v2/courses/${COURSE_ID}/study-units?expectedRevision=8` +
      "&anchorStudyUnitId=unit-a&cursorStudyUnitId=unit-b"
  );
  await assert.rejects(
    () => executeCourseRoute({
      request: invalid,
      route: routeCourseRequest("GET", new URL(invalid.url).pathname),
      adapter,
      principal: PRINCIPAL
    }),
    (error) => error.code === "invalid_pagination"
  );
});


test("Fontes usam consulta cercada e comando discriminado sem campos de autoridade", async () => {
  const calls = [];
  const adapter = {
    async getCourseSources(value) {
      calls.push(["read", value]);
      return { ok: true };
    },
    async executeCourseSourceCommand(value) {
      calls.push(["write", value]);
      return { changed: true };
    }
  };
  const readPath = `/v1/courses/${COURSE_ID}/sources?expectedRevision=8` +
    "&mode=target&targetKind=study_unit&targetId=unit-a&limit=1";
  const read = request(readPath);
  await executeCourseRoute({
    request: read,
    route: routeCourseRequest("GET", new URL(read.url).pathname),
    adapter,
    principal: PRINCIPAL
  });
  assert.deepEqual({
    courseId: calls[0][1].courseId,
    expectedRevision: calls[0][1].expectedRevision,
    mode: calls[0][1].mode,
    sourceId: calls[0][1].sourceId,
    targetKind: calls[0][1].targetKind,
    targetId: calls[0][1].targetId,
    cursor: calls[0][1].cursor,
    limit: calls[0][1].limit
  }, {
    courseId: COURSE_ID,
    expectedRevision: 8,
    mode: "target",
    sourceId: null,
    targetKind: "study_unit",
    targetId: "unit-a",
    cursor: null,
    limit: 1
  });

  const currentSourceId = "source-current";
  const sourceReadPath = `/v1/courses/${COURSE_ID}/sources?expectedRevision=8` +
    `&mode=source&sourceId=${encodeURIComponent(currentSourceId)}`;
  const sourceRead = request(sourceReadPath);
  await executeCourseRoute({
    request: sourceRead,
    route: routeCourseRequest("GET", new URL(sourceRead.url).pathname),
    adapter,
    principal: PRINCIPAL
  });
  assert.equal(calls[1][1].sourceId, currentSourceId);
  assert.equal(calls[1][1].limit, 1);

  const requestId = "request-source-0001";
  const command = {
    type: "save_source",
    sourceId: "source-a",
    expectedSourceRevision: 0,
    source: {
      kind: "web_page",
      defaultRoles: ["technical_conceptual"],
      title: "Fonte A",
      authors: [{ literal: "Autoria" }],
      citationMode: "manual",
      bibliographic: createEmptyCourseSourceBibliographicMetadata(),
      publicationDate: "2026",
      identifier: null,
      language: "pt-BR",
      citationText: "Fonte A, 2026.",
      url: "https://example.test/fonte-a",
      editionOrVersion: null,
      origin: "external",
      availability: "open_access",
      verificationStatus: "author_verified",
      studyVisibility: "citation_and_link"
    }
  };
  const writePath = `/v1/courses/${COURSE_ID}/sources/changes`;
  const write = request(writePath, {
    method: "POST",
    requestId,
    body: { requestId, expectedCourseRevision: 8, command }
  });
  await executeCourseRoute({
    request: write,
    route: routeCourseRequest("POST", writePath),
    adapter,
    principal: PRINCIPAL
  });
  assert.equal(calls[2][1].expectedCourseRevision, 8);
  assert.deepEqual(calls[2][1].command, command);

  const currentWriteRequestId = "request-source-current-1";
  const currentWriteCommand = {
    ...command,
    sourceId: currentSourceId,
    expectedSourceRevision: 1
  };
  const currentWrite = request(writePath, {
    method: "POST",
    requestId: currentWriteRequestId,
    body: {
      requestId: currentWriteRequestId,
      expectedCourseRevision: 8,
      command: currentWriteCommand
    }
  });
  await executeCourseRoute({
    request: currentWrite,
    route: routeCourseRequest("POST", writePath),
    adapter,
    principal: PRINCIPAL
  });
  assert.equal(calls[3][1].command.sourceId, currentSourceId);

  const unicodeSourceId = "fonte-🔎";
  const contextualPath = `/v1/courses/${COURSE_ID}/sources?expectedRevision=8` +
    `&mode=source&sourceId=${encodeURIComponent(unicodeSourceId)}` +
    "&targetKind=study_unit&targetId=unit-a";
  const contextualRead = request(contextualPath);
  await executeCourseRoute({
    request: contextualRead,
    route: routeCourseRequest("GET", new URL(contextualRead.url).pathname),
    adapter,
    principal: PRINCIPAL
  });
  assert.deepEqual({
    sourceId: calls[4][1].sourceId,
    targetKind: calls[4][1].targetKind,
    targetId: calls[4][1].targetId,
    cursor: calls[4][1].cursor,
    limit: calls[4][1].limit
  }, {
    sourceId: unicodeSourceId,
    targetKind: "study_unit",
    targetId: "unit-a",
    cursor: null,
    limit: 1
  });

  const astralTargetId = "🔎".repeat(240);
  const astralTargetPath = `/v1/courses/${COURSE_ID}/sources?expectedRevision=8` +
    `&mode=target&targetKind=study_unit&targetId=${encodeURIComponent(astralTargetId)}`;
  const astralTargetRead = request(astralTargetPath);
  await executeCourseRoute({
    request: astralTargetRead,
    route: routeCourseRequest("GET", new URL(astralTargetRead.url).pathname),
    adapter,
    principal: PRINCIPAL
  });
  assert.equal(calls[5][1].targetId, astralTargetId);

  const oversizedTargetPath = `/v1/courses/${COURSE_ID}/sources?expectedRevision=8` +
    `&mode=target&targetKind=study_unit&targetId=${encodeURIComponent("🔎".repeat(241))}`;
  const oversizedTargetRead = request(oversizedTargetPath);
  await assert.rejects(
    () => executeCourseRoute({
      request: oversizedTargetRead,
      route: routeCourseRequest("GET", new URL(oversizedTargetRead.url).pathname),
      adapter,
      principal: PRINCIPAL
    }),
    (error) => error.code === "invalid_course_sources_query"
  );

  for (const invalidCommand of [
    { ...command, actorId: COURSE_ID },
    { ...command, source: { ...command.source, url: "http://example.test/fonte-a" } },
    { ...command, sourceId: "s".repeat(241) },
    { ...command, sourceId: "legacy\u0000source", expectedSourceRevision: 1 }
  ]) {
    const invalidRequestId = `request-source-bad-${calls.length}`;
    const invalid = request(writePath, {
      method: "POST",
      requestId: invalidRequestId,
      body: { requestId: invalidRequestId, expectedCourseRevision: 8, command: invalidCommand }
    });
    await assert.rejects(
      () => executeCourseRoute({
        request: invalid,
        route: routeCourseRequest("POST", writePath),
        adapter,
        principal: PRINCIPAL
      }),
      (error) => error.status === 422
    );
  }
});

test("Router limita comando de Fontes a 196608 bytes antes do domínio", async () => {
  const writePath = `/v1/courses/${COURSE_ID}/sources/changes`;
  const requestId = "request-source-bytes-1";
  const overhead = new TextEncoder().encode(JSON.stringify({ padding: "" })).byteLength;
  const atLimit = { padding: "x".repeat(196_608 - overhead) };
  const adapter = {
    async executeCourseSourceCommand() {
      assert.fail("comando estruturalmente inválido não deve alcançar o adaptador");
    }
  };
  for (const [command, predicate] of [
    [atLimit, (error) => error.status === 422 && error.code !== "payload_too_large"],
    [{ padding: `${atLimit.padding}x` }, (error) => error.code === "payload_too_large"]
  ]) {
    const value = request(writePath, {
      method: "POST",
      requestId,
      body: { requestId, expectedCourseRevision: 8, command }
    });
    await assert.rejects(
      () => executeCourseRoute({
        request: value,
        route: routeCourseRequest("POST", writePath),
        adapter,
        principal: PRINCIPAL
      }),
      predicate
    );
  }
});

test("Router liga download do PDF à Fonte, revisão, hash e cerca do Curso", async () => {
  const contentHash = "a".repeat(64);
  let call = null;
  const adapter = {
    async getCourseSourcePdfDownload(value) {
      call = value;
      return { allowed: true };
    }
  };
  const path = `/v1/courses/${COURSE_ID}/source-pdf/download?` +
    "expectedRevision=8&sourceId=source-pdf&" +
    `sourceRevision=2&contentHash=${contentHash}`;
  const value = request(path);
  const result = await executeCourseRoute({
    request: value,
    route: routeCourseRequest("GET", new URL(value.url).pathname),
    adapter,
    principal: PRINCIPAL
  });
  assert.deepEqual(result.data, { allowed: true });
  assert.deepEqual({
    courseId: call.courseId,
    expectedRevision: call.expectedRevision,
    sourceId: call.sourceId,
    sourceRevision: call.sourceRevision,
    contentHash: call.contentHash
  }, {
    courseId: COURSE_ID,
    expectedRevision: 8,
    sourceId: "source-pdf",
    sourceRevision: 2,
    contentHash
  });

  for (const invalidPath of [
    path.replace(contentHash, "hash-invalido"),
    path.replace("sourceRevision=2", "sourceRevision=0"),
    `${path}&operation=download`,
    `${path}&actorId=${COURSE_ID}`
  ]) {
    const invalid = request(invalidPath);
    await assert.rejects(
      () => executeCourseRoute({
        request: invalid,
        route: routeCourseRequest("GET", new URL(invalid.url).pathname),
        adapter,
        principal: PRINCIPAL
      }),
      (error) => error.code === "invalid_course_source_pdf_download" ||
        error.code === "invalid_integer"
    );
  }
});


test("cria Curso e reconcilia requestId", async () => {
  let call = null;
  const adapter = {
    async createCourse(value) { call = value; return { courseId: COURSE_ID, revision: 1 }; }
  };
  const body = {
    requestId: "request-course-0001",
    title: "Curso",
    objective: "Aprender"
  };
  const value = request("/v1/courses", {
    method: "POST",
    requestId: body.requestId,
    body
  });
  const result = await executeCourseRoute({
    request: value,
    route: routeCourseRequest("POST", "/v1/courses"),
    adapter,
    principal: PRINCIPAL
  });

  assert.equal(result.requestId, body.requestId);
  assert.equal(call.title, "Curso");
  assert.equal(call.objective, "Aprender");
});

test("criação rejeita controles e preserva quebras de layout deliberadas", async () => {
  const calls = [];
  const adapter = {
    async createCourse(value) {
      calls.push(value);
      return { courseId: COURSE_ID, revision: 1 };
    }
  };
  for (const [title, objective, requestId] of [
    ["Curso\u0001inválido", "Objetivo válido", "request-control-0001"],
    ["Curso válido", "Objetivo\u007finválido", "request-control-0002"],
    ["Curso\u0085inválido", "Objetivo válido", "request-control-0003"]
  ]) {
    const value = request("/v1/courses", {
      method: "POST",
      requestId,
      body: { requestId, title, objective }
    });
    await assert.rejects(
      executeCourseRoute({
        request: value,
        route: routeCourseRequest("POST", "/v1/courses"),
        adapter,
        principal: PRINCIPAL
      }),
      (error) => error.code === "invalid_course_command"
    );
  }
  const requestId = "request-layout-0001";
  const value = request("/v1/courses", {
    method: "POST",
    requestId,
    body: {
      requestId,
      title: "Curso válido",
      objective: "Objetivo em duas linhas.\n\tCom detalhe."
    }
  });
  await executeCourseRoute({
    request: value,
    route: routeCourseRequest("POST", "/v1/courses"),
    adapter,
    principal: PRINCIPAL
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].objective, "Objetivo em duas linhas.\n\tCom detalhe.");
});

test("commit de composição exige versão, conteúdo e escopo de escrita", async () => {
  const body = {
    requestId: "request-change-0001",
    expectedRevision: 2,
    upserts: [{
      entityType: "module",
      entityId: "module-a",
      parentType: null,
      parentId: null,
      position: 0,
      content: {
        title: "Módulo",
        guide: {
          goal: "Orientar o módulo.",
          include: [],
          exclude: [],
          notation: [],
          avoid: []
        }
      }
    }],
    deletes: [],
    sourceAttributionApplications: []
  };
  let call = null;
  const adapter = {
    async commitCourseComposition(value) {
      call = value;
      return { courseId: COURSE_ID, revision: 3 };
    }
  };
  const value = request(`/v1/courses/${COURSE_ID}/composition`, {
    method: "POST",
    requestId: body.requestId,
    body
  });
  const route = routeCourseRequest("POST", new URL(value.url).pathname);
  const result = await executeCourseRoute({ request: value, route, adapter, principal: PRINCIPAL });

  assert.equal(result.data.revision, 3);
  assert.equal(call.courseId, COURSE_ID);
  assert.equal(call.expectedRevision, 2);
  assert.equal(call.upserts.length, 1);

  const deniedRequest = request(`/v1/courses/${COURSE_ID}/composition`, {
    method: "POST",
    requestId: body.requestId,
    body
  });
  for (const scopes of [
    ["authoring:read"],
    ["authoring:private:write"],
    ["*"]
  ]) {
    await assert.rejects(
      () => executeCourseRoute({
        request: deniedRequest.clone(),
        route,
        adapter,
        principal: { actorId: COURSE_ID, scopes }
      }),
      (error) => error.status === 403
    );
  }
});

test("composição contextual encaminha somente versão e origem fechada", async () => {
  const sourceLinks = [{
    sourceId: "fonte retirada",
    relation: "needs_verification",
    anchors: []
  }];
  const body = {
    requestId: "request-contextual-edit-0001",
    expectedRevision: 4,
    expectedStudyUnitVersion: 2,
    applicationOrigin: "provider_assistance",
    upserts: [{
      entityType: "study_unit",
      entityId: "unit-a",
      parentType: "microsequence",
      parentId: "micro-a",
      position: 1,
      content: {
        title: "Unidade revista",
        role: "theory",
        content: [{
          id: "paragraph-a",
          package: "aralearn.resource.paragraph",
          version: "1.0.0",
          data: { text: "Conteúdo revisto." }
        }],
        response: null,
        feedback: [],
        topics: []
      }
    }],
    deletes: [],
    sourceAttributionApplications: [{ studyUnitId: "unit-a", sourceLinks }]
  };
  let call = null;
  const adapter = {
    async commitCourseComposition(value) {
      call = value;
      return { courseId: COURSE_ID, revision: 5 };
    }
  };
  const path = `/v1/courses/${COURSE_ID}/composition`;
  const value = request(path, {
    method: "POST",
    requestId: body.requestId,
    body
  });

  await executeCourseRoute({
    request: value,
    route: routeCourseRequest("POST", path),
    adapter,
    principal: { ...PRINCIPAL, authenticationKind: "application" }
  });

  assert.equal(call.expectedStudyUnitVersion, 2);
  assert.equal(call.applicationOrigin, "provider_assistance");
  assert.deepEqual(call.sourceAttributionApplications[0].sourceLinks, sourceLinks);
  const leaked = request(path, {
    method: "POST",
    requestId: body.requestId,
    body: { ...body, prompt: "texto livre" }
  });
  await assert.rejects(
    () => executeCourseRoute({
      request: leaked,
      route: routeCourseRequest("POST", path),
      adapter,
      principal: { ...PRINCIPAL, authenticationKind: "application" }
    }),
    (error) => error.code === "unknown_course_command_field"
  );
});

test("recuperação valida a Unidade completa e deriva autoridade somente da aplicação", async () => {
  const studyUnit = {
    id: "unit-a",
    position: 1,
    title: "Unidade revista",
    role: "theory",
    content: [{
      id: "paragraph-a",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "Conteúdo revisto." }
    }],
    response: null,
    feedback: [],
    topics: []
  };
  const body = {
    requestId: "request-personal-copy-0001",
    sourceCourseId: COURSE_ID,
    expectedSourceCourseRevision: 4,
    expectedStudyUnitVersion: 2,
    didacticMicrosequenceId: "micro-a",
    studyUnit,
    applicationOrigin: "provider_assistance"
  };
  const path = `/v1/courses/${COURSE_ID}/copy-recovery`;
  let call = null;
  const adapter = {
    async recoverOwnedCourseCopy(value) {
      call = value;
      return { contract: "aralearn.owned-course-copy-recovery.v1", changed: true };
    }
  };
  const principal = {
    ...PRINCIPAL,
    authenticationKind: "application"
  };
  const result = await executeCourseRoute({
    request: request(path, { method: "POST", requestId: body.requestId, body }),
    route: routeCourseRequest("POST", path),
    adapter,
    principal
  });

  assert.equal(result.requestId, body.requestId);
  assert.equal(call.principal, principal);
  assert.equal(call.sourceCourseId, COURSE_ID);
  assert.equal(call.expectedSourceCourseRevision, 4);
  assert.equal(call.expectedStudyUnitVersion, 2);
  assert.equal(call.didacticMicrosequenceId, "micro-a");
  assert.deepEqual(call.studyUnit, studyUnit);
  assert.equal(call.applicationOrigin, "provider_assistance");

  for (const invalidBody of [
    { ...body, sourceCourseId: PART_ID },
    { ...body, actorId: COURSE_ID },
    { ...body, studyUnit: { ...studyUnit, sourceLinks: [] } },
    { ...body, studyUnit: { ...studyUnit, position: 0 } },
    { ...body, applicationOrigin: "prompt" }
  ]) {
    await assert.rejects(
      () => executeCourseRoute({
        request: request(path, {
          method: "POST",
          requestId: invalidBody.requestId,
          body: invalidBody
        }),
        route: routeCourseRequest("POST", path),
        adapter,
        principal
      }),
      (error) => error.status === 422
    );
  }
  await assert.rejects(
    () => executeCourseRoute({
      request: request(path, { method: "POST", requestId: body.requestId, body }),
      route: routeCourseRequest("POST", path),
      adapter,
      principal: { ...PRINCIPAL, authenticationKind: "oauth" }
    }),
    (error) => error.code === "application_only_operation" && error.status === 403
  );
});

test("composição rejeita hierarquia, posição e conteúdo incompatíveis antes do banco", async () => {
  const adapter = {
    async commitCourseComposition() {
      assert.fail("O adaptador não pode receber uma entidade inválida.");
    }
  };
  const body = {
    requestId: "request-course-invalid-entity",
    expectedRevision: 1,
    upserts: [{
      entityType: "study_unit",
      entityId: "unit-a",
      parentType: "lesson",
      parentId: "lesson-a",
      position: 0,
      content: { id: "duplicated" }
    }],
    deletes: []
  };
  const value = request(`/v1/courses/${COURSE_ID}/composition`, {
    method: "POST",
    requestId: body.requestId,
    body
  });
  await assert.rejects(
    () => executeCourseRoute({
      request: value,
      route: routeCourseRequest("POST", new URL(value.url).pathname),
      adapter,
      principal: PRINCIPAL
    }),
    (error) => error.code === "invalid_course_entity"
  );
});

test("composição rejeita título curricular fora do contrato antes do banco", async () => {
  const adapter = {
    async commitCourseComposition() {
      assert.fail("O adaptador não pode receber título curricular inválido.");
    }
  };
  const invalidTitles = ["M".repeat(301), "Micro\u0001inválida", "Micro\u0085inválida"];
  for (const [index, title] of invalidTitles.entries()) {
    const body = {
      requestId: `request-course-invalid-title-${index}`,
      expectedRevision: 1,
      upserts: [{
        entityType: index === 0 ? "module" : "microsequence",
        entityId: index === 0 ? "module-a" : "micro-a",
        parentType: index === 0 ? null : "lesson",
        parentId: index === 0 ? null : "lesson-a",
        position: 0,
        content: { title }
      }],
      deletes: []
    };
    const path = `/v1/courses/${COURSE_ID}/composition`;
    const value = request(path, {
      method: "POST",
      requestId: body.requestId,
      body
    });
    await assert.rejects(
      () => executeCourseRoute({
        request: value,
        route: routeCourseRequest("POST", path),
        adapter,
        principal: PRINCIPAL
      }),
      (error) => error.code === "invalid_course_command"
    );
  }
});

test("composição valida semanticamente cada entidade do segmento alterado", async () => {
  const adapter = {
    async commitCourseComposition() {
      assert.fail("O adaptador não pode receber conteúdo didático inválido.");
    }
  };
  const path = `/v1/courses/${COURSE_ID}/composition`;
  const invalidRows = [{
    entityType: "module",
    entityId: "module-a",
    parentType: null,
    parentId: null,
    position: 0,
    content: {
      title: "Módulo",
      guide: { goal: "Orientar.", include: [], exclude: [], notation: [] }
    }
  }, {
    entityType: "microsequence",
    entityId: "micro-a",
    parentType: "lesson",
    parentId: "lesson-a",
    position: 0,
    content: {
      title: "Microssequência",
      goal: "Explicar.",
      role: "papel-inexistente",
      dependsOn: [],
      covers: [],
      checks: [],
      errors: []
    }
  }];
  for (const [index, row] of invalidRows.entries()) {
    const requestId = `request-invalid-segment-${index}`;
    const value = request(path, {
      method: "POST",
      requestId,
      body: { requestId, expectedRevision: 1, upserts: [row], deletes: [] }
    });
    await assert.rejects(
      () => executeCourseRoute({
        request: value,
        route: routeCourseRequest("POST", path),
        adapter,
        principal: PRINCIPAL
      }),
      (error) => error.code === "invalid_course_contract"
    );
  }
});

test("composição rejeita envelope inválido da Unidade sem reler o Curso inteiro", async () => {
  const adapter = {
    async commitCourseComposition() {
      assert.fail("O adaptador não pode receber uma Unidade de estudo inválida.");
    }
  };
  const path = `/v1/courses/${COURSE_ID}/composition`;
  const value = request(path, {
    method: "POST",
    requestId: "request-invalid-study-unit-envelope",
    body: {
      requestId: "request-invalid-study-unit-envelope",
      expectedRevision: 3,
      upserts: [{
        entityType: "study_unit",
        entityId: "unit-a",
        parentType: "microsequence",
        parentId: "micro-a",
        position: 1,
        content: {
          title: "Unidade incompleta",
          role: "theory",
          content: [],
          response: null,
          feedback: [],
          topics: [],
          sources: []
        }
      }],
      deletes: []
    }
  });
  await assert.rejects(
    () => executeCourseRoute({
      request: value,
      route: routeCourseRequest("POST", path),
      adapter,
      principal: PRINCIPAL
    }),
    (error) => error.code === "invalid_course_contract"
  );
});
test("rejeita cursor parcial e campos fora do comando", async () => {
  const adapter = { async listCourses() { return { items: [] }; } };
  const partial = request("/v1/courses?beforeId=10000000-0000-4000-8000-000000000001");
  await assert.rejects(
    () => executeCourseRoute({
      request: partial,
      route: routeCourseRequest("GET", "/v1/courses"),
      adapter,
      principal: PRINCIPAL
    }),
    (error) => error.code === "invalid_pagination"
  );

  const invalid = request("/v1/courses", {
    method: "POST",
    body: {
      requestId: "request-course-0001",
      title: "Curso",
      objective: "Aprender",
      workspaceId: COURSE_ID
    }
  });
  await assert.rejects(
    () => executeCourseRoute({
      request: invalid,
      route: routeCourseRequest("POST", "/v1/courses"),
      adapter: { async createCourse() { return {}; } },
      principal: PRINCIPAL
    }),
    (error) => error.code === "unknown_course_command_field"
  );
});

test("perfil próprio e acesso direto atravessam o mesmo contrato do MCP", async () => {
  const calls = [];
  const adapter = {
    async getPersonProfile(value) {
      calls.push(["read-profile", value]);
      return { userId: PRINCIPAL.actorId, handle: null };
    },
    async updatePersonProfile(value) {
      calls.push(["update-profile", value]);
      return { userId: PRINCIPAL.actorId, ...value.patch };
    },
    async listCourseAccess(value) {
      calls.push(["list-access", value]);
      return { courseId: value.courseId, items: [] };
    },
    async manageCourseAccess(value) {
      calls.push(["manage-access", value]);
      return { courseId: value.courseId, targetUserId: value.targetUserId || null };
    }
  };

  for (const value of [
    request("/v2/profile"),
    request("/v2/profile", {
      method: "PATCH",
      body: { handle: "pesquisadora", avatarObjectKey: null }
    }),
    request(`/v1/courses/${COURSE_ID}/access`)
  ]) {
    await executeCourseRoute({
      request: value,
      route: routeCourseRequest(value.method, new URL(value.url).pathname),
      adapter,
      principal: PRINCIPAL
    });
  }

  const grant = request(`/v1/courses/${COURSE_ID}/access`, {
    method: "POST",
    requestId: "request-access-0001",
    body: {
      requestId: "request-access-0001",
      handle: "@Pessoa", userId: "20000000-0000-4000-8000-000000000002",
      confirmed: true
    }
  });
  await executeCourseRoute({
    request: grant,
    route: routeCourseRequest(grant.method, new URL(grant.url).pathname),
    adapter,
    principal: PRINCIPAL
  });

  const revoke = request(
    `/v1/courses/${COURSE_ID}/access/20000000-0000-4000-8000-000000000002`,
    {
      method: "DELETE",
      requestId: "request-access-0002",
      body: { requestId: "request-access-0002", confirmed: true }
    }
  );
  await executeCourseRoute({
    request: revoke,
    route: routeCourseRequest(revoke.method, new URL(revoke.url).pathname),
    adapter,
    principal: PRINCIPAL
  });

  assert.deepEqual(calls.map(([name]) => name), [
    "read-profile", "update-profile", "list-access", "manage-access", "manage-access"
  ]);
  assert.equal(calls[3][1].handle, "pessoa");
  assert.equal(calls[4][1].targetUserId, "20000000-0000-4000-8000-000000000002");
});

test("conceder ou revogar acesso exige confirmação explícita", async () => {
  const adapter = {
    async manageCourseAccess() {
      assert.fail("O adaptador não deve receber acesso sem confirmação.");
    }
  };
  for (const [method, path, body] of [
    ["POST", `/v1/courses/${COURSE_ID}/access`, {
      requestId: "request-access-0001",
      handle: "pessoa",
      confirmed: false
    }],
    ["DELETE", `/v1/courses/${COURSE_ID}/access/20000000-0000-4000-8000-000000000002`, {
      requestId: "request-access-0002"
    }]
  ]) {
    const value = request(path, { method, body, requestId: body.requestId });
    await assert.rejects(
      () => executeCourseRoute({
        request: value,
        route: routeCourseRequest(method, path),
        adapter,
        principal: PRINCIPAL
      }),
      (error) => error.code === "access_confirmation_required"
    );
  }
});


test("lê e altera parâmetros por escopo concreto com validação fechada", async () => {
  const calls = [];
  const adapter = {
    async getCourseDesign(value) {
      calls.push(["read", value]);
      return { contract: "aralearn.course-design.v1", courseId: COURSE_ID };
    },
    async applyCourseDesignCommand(value) {
      calls.push(["write", value]);
      return { contract: "aralearn.course-design-change.v1", changed: true };
    }
  };
  const read = request(
    `/v1/courses/${COURSE_ID}/course-design?scopeKind=lesson&scopeRef=lesson-a` +
      "&limit=16&cursor=micro-a"
  );
  await executeCourseRoute({
    request: read,
    route: routeCourseRequest("GET", new URL(read.url).pathname),
    adapter,
    principal: PRINCIPAL
  });
  assert.equal(calls[0][1].scopeKind, "lesson");
  assert.equal(calls[0][1].scopeRef, "lesson-a");
  assert.equal(calls[0][1].childLimit, 16);
  assert.equal(calls[0][1].childCursor, "micro-a");

  const invalidQuery = request(
    `/v1/courses/${COURSE_ID}/course-design?scopeKind=course&scopeRef=${COURSE_ID}` +
      "&offset=16"
  );
  await assert.rejects(
    () => executeCourseRoute({
      request: invalidQuery,
      route: routeCourseRequest("GET", new URL(invalidQuery.url).pathname),
      adapter,
      principal: PRINCIPAL
    }),
    (error) => error.code === "invalid_course_design_query"
  );

  const command = {
    type: "set_guidance",
    scope: { kind: "course", ref: COURSE_ID },
    guidance: "Explique termos antes de coordená-los em mecanismos.",
    origin: "author",
    reason: "Orientação editorial explícita."
  };
  const write = request(`/v1/courses/${COURSE_ID}/course-design/changes`, {
    method: "POST",
    requestId: "request-design-0001",
    body: {
      requestId: "request-design-0001",
      expectedCourseRevision: 4,
      command
    }
  });
  const result = await executeCourseRoute({
    request: write,
    route: routeCourseRequest("POST", new URL(write.url).pathname),
    adapter,
    principal: PRINCIPAL
  });
  assert.equal(result.requestId, "request-design-0001");
  assert.equal(calls[1][1].expectedCourseRevision, 4);
  assert.deepEqual(calls[1][1].command, command);

  const targetCommand = {
    type: "set_target_plan_items",
    scope: { kind: "didactic_microsequence", ref: "micro-a" },
    instructionalAnalysisUnitIds: [PART_ID],
    evidenceRequirementIds: ["50000000-0000-4000-8000-000000000005"]
  };
  const targetWrite = request(`/v1/courses/${COURSE_ID}/course-design/changes`, {
    method: "POST",
    requestId: "request-design-targets",
    body: {
      requestId: "request-design-targets",
      expectedCourseRevision: 5,
      command: targetCommand
    }
  });
  await assert.rejects(
    () => executeCourseRoute({
      request: targetWrite,
      route: routeCourseRequest("POST", new URL(targetWrite.url).pathname),
      adapter,
      principal: PRINCIPAL
    }),
    (error) => error.code === "invalid_course_design_command"
  );

  const invalid = request(`/v1/courses/${COURSE_ID}/course-design/changes`, {
    method: "POST",
    requestId: "request-design-0002",
    body: {
      requestId: "request-design-0002",
      expectedCourseRevision: 4,
      command: { ...command, origin: "migration" }
    }
  });
  await assert.rejects(
    () => executeCourseRoute({
      request: invalid,
      route: routeCourseRequest("POST", new URL(invalid.url).pathname),
      adapter,
      principal: PRINCIPAL
    }),
    (error) => error.code === "invalid_course_design_origin"
  );

  const wrongCourse = request(`/v1/courses/${COURSE_ID}/course-design/changes`, {
    method: "POST",
    requestId: "request-design-wrong-course",
    body: {
      requestId: "request-design-wrong-course",
      expectedCourseRevision: 4,
      command: {
        ...command,
        scope: { kind: "course", ref: PART_ID }
      }
    }
  });
  await assert.rejects(
    () => executeCourseRoute({
      request: wrongCourse,
      route: routeCourseRequest("POST", new URL(wrongCourse.url).pathname),
      adapter,
      principal: PRINCIPAL
    }),
    (error) => error.code === "invalid_course_design_scope"
  );
});

test("lê parâmetros da StudyUnit sem reduzir o escopo antes do adapter", async () => {
  const calls = [];
  const adapter = {
    async getCourseDesign(value) {
      calls.push(value);
      return { contract: "aralearn.course-design.v2", courseId: COURSE_ID };
    }
  };
  const read = request(
    `/v1/courses/${COURSE_ID}/course-design?scopeKind=study_unit&scopeRef=study-unit-a&limit=16`
  );

  await executeCourseRoute({
    request: read,
    route: routeCourseRequest("GET", new URL(read.url).pathname),
    adapter,
    principal: PRINCIPAL
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].scopeKind, "study_unit");
  assert.equal(calls[0].scopeRef, "study-unit-a");
  assert.equal(calls[0].childLimit, 16);
  assert.equal(calls[0].childCursor, null);
});
