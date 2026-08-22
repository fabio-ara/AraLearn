import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  createHostedPdfFixture,
  HOSTED_COURSE_SOURCE_PDF_SMOKE_CONTRACT,
  inspectHostedCourseSourcePdfResiduals,
  runHostedCourseSourcePdfSmoke
} from "../../scripts/runHostedCourseSourcePdfSmoke.mjs";

const PROJECT_URL = "https://abcdefghijklmnopqrst.supabase.co";
const SECRET_KEY = "sb_secret_hosted-pdf-smoke-secret";
const PUBLISHABLE_KEY = "sb_publishable_hosted-pdf-smoke-public";
const ACCESS_TOKEN = "header.payload.signature";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const COURSE_ID = "22222222-2222-4222-8222-222222222222";
const REQUEST_IDS = [
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
  "55555555-5555-4555-8555-555555555555",
  "66666666-6666-4666-8666-666666666666"
];
const environment = {
  SUPABASE_URL: PROJECT_URL,
  SUPABASE_SECRET_KEY: SECRET_KEY,
  SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY
};

function json(payload, { status = 200, headers = {} } = {}) {
  return new Response(payload == null ? null : JSON.stringify(payload), {
    status,
    headers: {
      ...(payload == null ? {} : { "Content-Type": "application/json" }),
      ...headers
    }
  });
}

function ids() {
  let index = 0;
  return () => REQUEST_IDS[index++];
}

function noResiduals(inspections = []) {
  return ({ configuration, lifecycle }) => {
    inspections.push({ configuration, lifecycle: structuredClone(lifecycle) });
    assert.equal(configuration.projectRef, "abcdefghijklmnopqrst");
    assert.equal(lifecycle.userId, USER_ID);
    assert.equal(lifecycle.courseId, COURSE_ID);
    return { course: false, object: false, user: false };
  };
}

function hostedFetch(requests, { uploadStatus = 200 } = {}) {
  const fixture = createHostedPdfFixture();
  const storagePath = `${COURSE_ID}/${fixture.contentHash}.pdf`;
  const signedUrl = `${PROJECT_URL}/storage/v1/object/sign/course-source-pdfs/${
    storagePath
  }?token=signed-fixture&download=true`;
  return async (input, init = {}) => {
    const url = new URL(input);
    const headers = new Headers(init.headers);
    const method = init.method || "GET";
    const request = { url, headers, method, body: init.body };
    requests.push(request);

    if (url.pathname === "/auth/v1/admin/users" && method === "POST") {
      assert.equal(headers.get("apikey"), SECRET_KEY);
      assert.equal(headers.get("authorization"), null);
      const body = JSON.parse(String(init.body));
      assert.equal(body.email_confirm, true);
      assert.equal(body.user_metadata.test, "course-source-pdf-hosted-smoke");
      assert.match(body.email, /^course-pdf-smoke-[a-f0-9]+@aralearn\.local$/u);
      assert.ok(body.password.length >= 28);
      return json({ id: USER_ID });
    }
    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
      assert.equal(headers.get("apikey"), PUBLISHABLE_KEY);
      return json({ access_token: ACCESS_TOKEN, user: { id: USER_ID } });
    }
    if (url.pathname.endsWith("/aralearn-course-api/app/criarCurso")) {
      assert.equal(headers.get("apikey"), PUBLISHABLE_KEY);
      assert.equal(headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
      assert.equal(headers.get("origin"), "https://fabio-ara.github.io");
      const body = JSON.parse(String(init.body));
      assert.equal(body.requestId, REQUEST_IDS[1]);
      return json({
        ok: true,
        requestId: null,
        data: { courseId: COURSE_ID, revision: 1, ownership: "owned" }
      });
    }
    if (url.pathname.endsWith("/aralearn-course-api/app/alterarCurso")) {
      const body = JSON.parse(String(init.body));
      if (body.sourceCommand?.type === "save_source") {
        assert.equal(body.requestId, REQUEST_IDS[2]);
        assert.equal(body.courseId, COURSE_ID);
        assert.equal(body.expectedRevision, 1);
        assert.equal(body.sourceCommand.sourceId, "source-hosted-pdf-smoke");
        return json({
          ok: true,
          requestId: null,
          data: {
            courseId: COURSE_ID,
            courseRevision: 2,
            changed: true,
            change: {
              type: "save_source",
              subjectId: "source-hosted-pdf-smoke",
              revision: 1
            }
          }
        });
      }
      assert.equal(body.sourceCommand?.type, "attach_pdf");
      assert.equal(body.requestId, REQUEST_IDS[3]);
      assert.equal(body.expectedRevision, 2);
      assert.equal(body.sourceCommand.attachment.storagePath, storagePath);
      return json({
        ok: true,
        requestId: null,
        data: {
          courseId: COURSE_ID,
          courseRevision: 3,
          changed: true,
          change: {
            type: "attach_pdf",
            subjectId: "source-hosted-pdf-smoke",
            revision: 1
          }
        }
      });
    }
    if (url.pathname.endsWith("/aralearn-course-api/app/lerCurso")) {
      const body = JSON.parse(String(init.body));
      assert.equal(body.courseId, COURSE_ID);
      assert.equal(body.sourceId, "source-hosted-pdf-smoke");
      if (body.attachmentOperation === "prepare_upload") {
        assert.equal(body.expectedRevision, 2);
        assert.equal(body.contentHash, fixture.contentHash);
        assert.equal(body.byteSize, fixture.byteSize);
        assert.equal(body.mediaType, fixture.mediaType);
        return json({
          ok: true,
          requestId: null,
          data: {
            contract: "aralearn.course-source-attachment-access.v2",
            courseId: COURSE_ID,
            courseRevision: 2,
            operation: "prepare_upload",
            sourceId: "source-hosted-pdf-smoke",
            sourceRevision: 1,
            storageOriginCourseId: COURSE_ID,
            attachment: {
              contentHash: fixture.contentHash,
              byteSize: fixture.byteSize,
              mediaType: fixture.mediaType,
              storagePath
            },
            uploadRequired: true,
            alreadyLinked: false,
            signedUrl: null,
            expiresAt: null
          }
        });
      }
      assert.equal(body.attachmentOperation, "download");
      assert.equal(body.expectedRevision, 3);
      return json({
        ok: true,
        requestId: null,
        data: {
          contract: "aralearn.course-source-attachment-access.v1",
          courseId: COURSE_ID,
          courseRevision: 3,
          operation: "download",
          sourceId: "source-hosted-pdf-smoke",
          sourceRevision: 1,
          storageOriginCourseId: COURSE_ID,
          attachment: {
            contentHash: fixture.contentHash,
            byteSize: fixture.byteSize,
            mediaType: fixture.mediaType,
            storagePath
          },
          uploadRequired: false,
          alreadyLinked: true,
          signedUrl,
          expiresAt: "2026-08-21T23:59:59.000Z"
        }
      });
    }
    if (url.pathname === `/storage/v1/object/course-source-pdfs/${storagePath}`) {
      assert.equal(method, "POST");
      assert.equal(headers.get("apikey"), PUBLISHABLE_KEY);
      assert.equal(headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
      assert.equal(headers.get("content-type"), "application/pdf");
      assert.equal(headers.get("x-upsert"), "false");
      assert.deepEqual(new Uint8Array(init.body), fixture.bytes);
      return json({}, { status: uploadStatus });
    }
    if (url.href === signedUrl) {
      assert.equal(headers.get("authorization"), null);
      return new Response(fixture.bytes, {
        status: 200,
        headers: { "Content-Type": "application/pdf" }
      });
    }
    if (url.pathname.endsWith("/aralearn-course-api/app/excluirMinhaConta")) {
      const body = JSON.parse(String(init.body));
      assert.deepEqual(body, { confirmation: "EXCLUIR MINHA CONTA" });
      return json({
        ok: true,
        requestId: null,
        data: { contract: "aralearn.account-deletion.v1", status: "deleted" }
      });
    }
    assert.fail(`Requisição inesperada: ${method} ${url.pathname}`);
  };
}

test("fixture PDF hospedada é determinística, válida e limitada", () => {
  const fixture = createHostedPdfFixture();
  assert.equal(fixture.byteSize, 512);
  assert.equal(fixture.mediaType, "application/pdf");
  assert.match(new TextDecoder().decode(fixture.bytes.slice(0, 8)), /^%PDF-1\.4/u);
  assert.equal(
    fixture.contentHash,
    createHash("sha256").update(fixture.bytes).digest("hex")
  );
  assert.throws(() => createHostedPdfFixture(64), /limite/u);
});

test("smoke percorre prepare_upload v2, upload autenticado, attach, download v1 e resíduo zero", async () => {
  const requests = [];
  const inspections = [];
  const result = await runHostedCourseSourcePdfSmoke({
    environment,
    fetchImpl: hostedFetch(requests),
    createId: ids(),
    createBytes: () => Buffer.alloc(24, 0x5a),
    inspectResiduals: noResiduals(inspections)
  });
  assert.deepEqual(result, {
    contract: HOSTED_COURSE_SOURCE_PDF_SMOKE_CONTRACT,
    cleanup: { courseCount: 0, objectCount: 0, userCount: 0 },
    downloadContract: "aralearn.course-source-attachment-access.v1",
    uploadContract: "aralearn.course-source-attachment-access.v2"
  });
  assert.equal(
    requests.some(({ url }) =>
      url.pathname.endsWith("/aralearn-course-api/app/excluirMinhaConta")),
    true
  );
  assert.equal(inspections.length, 1);
});

test("falha do fluxo ainda limpa a conta e não inclui credenciais nem identificadores no erro", async () => {
  const requests = [];
  await assert.rejects(
    () => runHostedCourseSourcePdfSmoke({
      environment,
      fetchImpl: hostedFetch(requests, { uploadStatus: 500 }),
      createId: ids(),
      createBytes: () => Buffer.alloc(24, 0x5a),
      inspectResiduals: noResiduals()
    }),
    (error) => {
      const rendered = String(error);
      assert.match(rendered, /Upload autenticado do PDF devolveu HTTP 500/u);
      for (const protectedValue of [
        SECRET_KEY,
        PUBLISHABLE_KEY,
        ACCESS_TOKEN,
        USER_ID,
        COURSE_ID,
        createHostedPdfFixture().contentHash
      ]) {
        assert.equal(rendered.includes(protectedValue), false);
      }
      return true;
    }
  );
  assert.equal(
    requests.some(({ url }) =>
      url.pathname.endsWith("/aralearn-course-api/app/excluirMinhaConta")),
    true
  );
});

test("inventário usa o banco hospedado vinculado sem depender de grants da API de dados", () => {
  let capturedInput = "";
  const residuals = inspectHostedCourseSourcePdfResiduals({
    configuration: { projectRef: "abcdefghijklmnopqrst" },
    lifecycle: { courseId: COURSE_ID, userId: USER_ID },
    executeSupabase(argumentsValue, { input }) {
      assert.deepEqual(argumentsValue, [
        "db", "query", "--linked", "--project-ref", "abcdefghijklmnopqrst",
        "--output", "json"
      ]);
      capturedInput = input;
      return JSON.stringify({
        rows: [{ residuals: { courseCount: 0, objectCount: 0, userCount: 0 } }]
      });
    }
  });
  assert.deepEqual(residuals, { course: false, object: false, user: false });
  assert.match(capturedInput, new RegExp(COURSE_ID, "u"));
  assert.match(capturedInput, new RegExp(USER_ID, "u"));
  assert.doesNotMatch(capturedInput, /sb_secret_|Bearer|access_token/u);
});

test("smoke recusa stack local e service_role hospedada", async () => {
  await assert.rejects(
    () => runHostedCourseSourcePdfSmoke({
      environment: {
        SUPABASE_URL: "http://127.0.0.1:54321",
        SUPABASE_SECRET_KEY: SECRET_KEY,
        SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY
      },
      fetchImpl: async () => assert.fail("fetch não deveria ser chamado")
    }),
    /recusa a stack Supabase local/u
  );
  await assert.rejects(
    () => runHostedCourseSourcePdfSmoke({
      environment: {
        SUPABASE_URL: PROJECT_URL,
        SUPABASE_SERVICE_ROLE_KEY: "header.service-role.signature",
        SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY
      },
      fetchImpl: async () => assert.fail("fetch não deveria ser chamado")
    }),
    /somente sb_secret_/u
  );
});
