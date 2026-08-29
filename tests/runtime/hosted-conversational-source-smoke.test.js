import assert from "node:assert/strict";
import test from "node:test";

import {
  assertHostedHumanProjection,
  createHostedConversationalCourseTitle,
  HOSTED_CONVERSATIONAL_SOURCE_SMOKE_CONTRACT,
  runHostedConversationalSourceSmoke
} from "../../scripts/runHostedConversationalSourceSmoke.mjs";
import { createHostedPdfFixture } from "../../scripts/runHostedCourseSourcePdfSmoke.mjs";
import { EXPECTED_AUTHORING_CONTRACT_HEADER } from "../../scripts/verifyHostedBackend.mjs";

const PROJECT_URL = "https://abcdefghijklmnopqrst.supabase.co";
const SECRET_KEY = "sb_secret_hosted-conversational-smoke-secret";
const PUBLISHABLE_KEY = "sb_publishable_hosted-conversational-smoke-public";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const COURSE_ID = "22222222-2222-4222-8222-222222222222";
const REQUEST_IDS = [
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
  "55555555-5555-4555-8555-555555555555",
  "66666666-6666-4666-8666-666666666666"
];
const SOURCE_CITATION =
  "AraLearn. Documento sintético descartável do smoke conversacional, 2026.";
const HUMAN_LOCATOR = "p. 2 do PDF sintético";

function json(payload, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}

function mcpResponse(request, result) {
  return json({ jsonrpc: "2.0", id: request.id, result }, {
    headers: { "X-AraLearn-Authoring-Contract": EXPECTED_AUTHORING_CONTRACT_HEADER }
  });
}

function toolResult(data, humanText) {
  return {
    content: [{ type: "text", text: humanText }],
    structuredContent: { ok: true, requestId: null, data },
    isError: false
  };
}

test("título do smoke hospedado é sintético, inequívoco e não contém UUID", () => {
  const title = createHostedConversationalCourseTitle(() =>
    Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9])
  );
  assert.equal(
    title,
    "Curso sintético descartável do smoke conversacional AQIDBAUGBwgJ"
  );
  assert.doesNotMatch(title, /[0-9a-f]{8}-[0-9a-f-]{27}/iu);
});

test("gate humano aceita linguagem de domínio e bloqueia controles internos", () => {
  assert.equal(
    assertHostedHumanProjection(
      "Retomei o Curso sintético. A Fonte permanece disponível em p. 2 do PDF sintético."
    ),
    "Retomei o Curso sintético. A Fonte permanece disponível em p. 2 do PDF sintético."
  );

  for (const forbidden of [
    "10000000-0000-4000-8000-000000000001",
    "a".repeat(64),
    "expectedRevision",
    "requestId",
    "storagePath",
    "contentHash",
    "CAS",
    "listarCursos",
    "lerCurso",
    "criarCurso",
    "alterarCurso",
    "consultarComponentesDidaticos",
    "incorporarPdfComoFonte",
    "ingerirPdfDaFonte",
    "save_source",
    "course_source_attachment",
    "tools/call",
    "aralearn.course.v1"
  ]) {
    assert.throws(
      () => assertHostedHumanProjection(`Resultado comum: ${forbidden}`),
      /projeção humana hospedada/u
    );
  }

  assert.throws(
    () => assertHostedHumanProjection("Fonte disponível.", ["Fonte disponível."]),
    /valor interno/u
  );
});

test("falha ambígua de upload conserva o caminho para a limpeza integral", async () => {
  const pdf = createHostedPdfFixture(768);
  let title = "";
  const cleanupOrder = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith("/aralearn-authoring-mcp")) {
      const request = JSON.parse(String(init.body));
      if (request.method === "initialize") {
        return mcpResponse(request, { protocolVersion: "2025-11-25" });
      }
      const { name, arguments: argumentsValue } = request.params;
      if (name === "criarCurso") {
        title = argumentsValue.title;
        return mcpResponse(request, toolResult(
          { courseId: COURSE_ID, revision: 1 },
          "O Curso sintético foi criado."
        ));
      }
      if (name === "alterarCurso" && argumentsValue.sourceCommand?.type === "save_source") {
        return mcpResponse(request, toolResult({
          courseRevision: 2,
          changed: true,
          change: {
            type: "save_source",
            subjectId: "source-hosted-conversational-smoke",
            revision: 1
          }
        }, "A Fonte sintética foi mantida no Curso."));
      }
      assert.fail(`Ferramenta inesperada: ${name}`);
    }
    if (url.pathname.endsWith("/aralearn-course-api/app/ingerirPdfDaFonte")) {
      assert.equal(init.body.get("courseId"), COURSE_ID);
      throw new Error("Resposta perdida depois da persistência simulada.");
    }
    assert.fail(`Requisição inesperada: ${url.pathname}`);
  };
  let idIndex = 0;

  await assert.rejects(
    runHostedConversationalSourceSmoke({
      environment: {
        SUPABASE_URL: PROJECT_URL,
        SUPABASE_SECRET_KEY: SECRET_KEY,
        SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY
      },
      fetchImpl,
      createId: () => REQUEST_IDS[idIndex++],
      createBytes: () => Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9]),
      async provisionToken({ lifecycle }) {
        Object.assign(lifecycle, {
          projectUrl: PROJECT_URL,
          serverApiKey: SECRET_KEY,
          publishableKey: PUBLISHABLE_KEY,
          userAccessToken: "user.access.token",
          userId: USER_ID,
          clientId: "77777777-7777-4777-8777-777777777777",
          oauthGrantCreated: true
        });
        return {
          ...lifecycle,
          accessToken: "mcp.initial.token",
          refreshToken: "refresh-token"
        };
      },
      async cleanupHostedFixture({ lifecycle }) {
        cleanupOrder.push("hosted");
        assert.equal(lifecycle.courseId, COURSE_ID);
        assert.deepEqual(
          [...lifecycle.storagePaths],
          [`${COURSE_ID}/${pdf.contentHash}.pdf`]
        );
      },
      async cleanupOAuthProvision() {
        cleanupOrder.push("oauth");
      }
    }),
    /Resposta perdida depois da persistência simulada/u
  );

  assert.match(title, /^Curso sintético descartável do smoke conversacional /u);
  assert.deepEqual(cleanupOrder, ["hosted", "oauth"]);
});

test("smoke orquestra nova sessão, ingestão canônica, Âncora e limpeza zero", async () => {
  const pdf = createHostedPdfFixture(768);
  const signedUrl = `${PROJECT_URL}/storage/v1/object/sign/course-source-pdfs/fixture`;
  const requests = [];
  let title = "";
  let currentRevision = 1;
  let initializations = 0;
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method || "GET";
    requests.push({ url, method });
    if (url.pathname.endsWith("/aralearn-authoring-mcp")) {
      const request = JSON.parse(String(init.body));
      if (request.method === "initialize") {
        initializations += 1;
        return mcpResponse(request, { protocolVersion: "2025-11-25" });
      }
      assert.equal(request.method, "tools/call");
      const { name, arguments: argumentsValue } = request.params;
      if (name === "criarCurso") {
        title = argumentsValue.title;
        return mcpResponse(request, toolResult(
          { courseId: COURSE_ID, revision: 1 },
          "O Curso sintético foi criado."
        ));
      }
      if (name === "alterarCurso" && argumentsValue.sourceCommand?.type === "save_source") {
        currentRevision = 2;
        return mcpResponse(request, toolResult({
          courseRevision: currentRevision,
          changed: true,
          change: {
            type: "save_source",
            subjectId: "source-hosted-conversational-smoke",
            revision: 1
          }
        }, "A Fonte sintética foi mantida no Curso."));
      }
      if (name === "alterarCurso" && argumentsValue.sourceCommand?.type === "save_anchor") {
        currentRevision = 4;
        return mcpResponse(request, toolResult({
          courseRevision: currentRevision,
          changed: true,
          change: {
            type: "save_anchor",
            subjectId: "anchor-hosted-conversational-smoke",
            revision: 1
          }
        }, "O local verificável da Fonte foi mantido."));
      }
      if (name === "listarCursos") {
        assert.equal(argumentsValue.query, title);
        return mcpResponse(request, toolResult({
          items: [{ courseId: COURSE_ID, title }],
          nextCursor: null
        }, `Retomei ${title}.`));
      }
      if (name === "lerCurso" && argumentsValue.view === "course_sources") {
        assert.equal(argumentsValue.expectedRevision, currentRevision);
        return mcpResponse(request, toolResult({
          contract: "aralearn.mcp-course-sources.v1",
          courseRevision: currentRevision,
          mode: "source",
          items: [{
            sourceId: "source-hosted-conversational-smoke",
            revision: 1,
            citationText: SOURCE_CITATION,
            anchors: [{
              anchorId: "anchor-hosted-conversational-smoke",
              revision: 1,
              humanLocator: HUMAN_LOCATOR
            }],
            attachments: [{
              contentHash: pdf.contentHash,
              byteSize: pdf.byteSize,
              mediaType: "application/pdf"
            }]
          }]
        }, `A Fonte ${SOURCE_CITATION} permanece disponível em ${HUMAN_LOCATOR}.`));
      }
      if (name === "lerCurso" && argumentsValue.view === "course_source_attachment") {
        return mcpResponse(request, toolResult({
          contract: "aralearn.mcp-course-source-attachment-access.v1",
          operation: "download",
          attachment: {
            contentHash: pdf.contentHash,
            byteSize: pdf.byteSize,
            mediaType: "application/pdf"
          },
          signedUrl
        }, "O PDF sintético permanece disponível para abertura."));
      }
      assert.fail(`Ferramenta inesperada: ${name}`);
    }
    if (url.pathname.endsWith("/aralearn-course-api/app/ingerirPdfDaFonte")) {
      assert.equal(method, "POST");
      assert.equal(init.body.get("courseId"), COURSE_ID);
      assert.equal(init.body.get("expectedRevision"), "2");
      assert.equal(init.body.get("sourceRevision"), "1");
      assert.deepEqual(
        Buffer.from(await init.body.get("file").arrayBuffer()),
        Buffer.from(pdf.bytes)
      );
      currentRevision = 3;
      return json({
        ok: true,
        data: {
          contract: "aralearn.course-source-pdf-ingestion.v1",
          courseId: COURSE_ID,
          courseRevision: currentRevision,
          requestId: REQUEST_IDS[2],
          changed: true,
          change: {
            type: "attach_pdf",
            subjectId: "source-hosted-conversational-smoke",
            revision: 1
          },
          attachment: {
            contentHash: pdf.contentHash,
            byteSize: pdf.byteSize,
            mediaType: "application/pdf"
          }
        }
      });
    }
    if (url.href === signedUrl) {
      return new Response(pdf.bytes, {
        status: 200,
        headers: { "Content-Type": "application/pdf" }
      });
    }
    assert.fail(`Requisição inesperada: ${method} ${url.pathname}`);
  };
  let idIndex = 0;
  const cleanupOrder = [];
  const result = await runHostedConversationalSourceSmoke({
    environment: {
      SUPABASE_URL: PROJECT_URL,
      SUPABASE_SECRET_KEY: SECRET_KEY,
      SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY
    },
    fetchImpl,
    createId: () => REQUEST_IDS[idIndex++],
    createBytes: () => Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9]),
    async provisionToken({ lifecycle }) {
      Object.assign(lifecycle, {
        projectUrl: PROJECT_URL,
        serverApiKey: SECRET_KEY,
        publishableKey: PUBLISHABLE_KEY,
        userAccessToken: "user.access.token",
        userId: USER_ID,
        clientId: "77777777-7777-4777-8777-777777777777",
        oauthGrantCreated: true
      });
      return {
        ...lifecycle,
        accessToken: "mcp.initial.token",
        refreshToken: "refresh-token"
      };
    },
    async refreshToken({ provision }) {
      assert.equal(provision.refreshToken, "refresh-token");
      return { accessToken: "mcp.refreshed.token", refreshToken: "next-refresh-token" };
    },
    async cleanupHostedFixture({ lifecycle }) {
      cleanupOrder.push("hosted");
      assert.equal(lifecycle.courseId, COURSE_ID);
      assert.equal(lifecycle.userId, USER_ID);
      assert.equal(lifecycle.storagePaths.size, 1);
    },
    async cleanupOAuthProvision({ provision }) {
      cleanupOrder.push("oauth");
      assert.equal(provision.userId, USER_ID);
      assert.equal(provision.oauthGrantCreated, false);
    }
  });

  assert.deepEqual(result, {
    contract: HOSTED_CONVERSATIONAL_SOURCE_SMOKE_CONTRACT,
    anchorRecovered: true,
    humanProjectionProtected: true,
    pdfRecovered: true,
    resumedByTitle: true,
    cleanup: { courseCount: 0, objectCount: 0, userCount: 0 }
  });
  assert.equal(initializations, 2);
  assert.deepEqual(cleanupOrder, ["hosted", "oauth"]);
  assert.equal(
    requests.some(({ url }) => url.pathname.endsWith("/ingerirPdfDaFonte")),
    true
  );
});
