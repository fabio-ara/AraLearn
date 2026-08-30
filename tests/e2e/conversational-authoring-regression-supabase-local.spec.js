import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { CourseApiClient } from "../../src/supabase/CourseApiClient.js";
import { createAuthoringActionHandler } from
  "../../supabase/functions/_shared/aralearn-authoring/courseActionServer.js";
import {
  ARALEARN_MCP_PROTOCOL_VERSION,
  createAuthoringMcpHandler
} from "../../supabase/functions/_shared/aralearn-authoring/mcpServer.js";
import { CourseSupabaseAdapter } from
  "../../supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";
import {
  authorizeLocalActionSession,
  authorizeLocalMcpSession,
  CHATGPT_ACTION_ORIGIN,
  chatGptAction,
  cleanupLocalMcpSession,
  courseAction,
  createConfirmedLocalUser,
  createLocalMcpClient,
  LOCAL_APPLICATION_ORIGIN,
  localSupabaseConfiguration,
  localSupabaseFailure,
  localSupabaseRequest,
  queryLocalPostgresJson,
  removeLocalUser,
  signInLocalUser
} from "../support/localSupabaseE2e.js";

const ENABLED = process.env.ARALEARN_E2E_REAL_SUPABASE === "1";
const PASSWORD = "AraLearn-regression-local-A9!";
const SOURCE_BUCKET = "course-source-pdfs";
const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu;
const HASH_PATTERN = /\b[a-f0-9]{64}\b/iu;
const NOMINAL_CONTROL_PATTERN =
  /\b(?:courseId|sourceId|sourceRevision|anchorId|anchorRevision|expectedRevision|expectedPlanVersion|requestId|storagePath|contentHash|planVersion|CAS|payload|schema)\b/iu;
const fixtureUrl = new URL(
  "../fixtures/conversational-authoring-resumption.v1.json",
  import.meta.url
);
const editalPdfFixtureUrl = new URL(
  "../fixtures/pdf/edital-dataprev-2026-perfil-13-pagina-44.pdf",
  import.meta.url
);

let config = null;
let fixture = null;
let owner = null;
let outsider = null;
let ownerToken = "";
let outsiderToken = "";
let courseId = "";
let mcpLifecycle = {};
let actionLifecycle = {};
let editalPdfBytes = null;

function failure(label, result) {
  return localSupabaseFailure(label, result);
}

async function expectSuccessful(label, promise, status = 200) {
  const result = await promise;
  expect(result.response.status, failure(label, result)).toBe(status);
  return result.payload;
}

function fixturePdfBytes(key) {
  if (key === "edital") return editalPdfBytes;
  return Buffer.from(
    "%PDF-1.4\n" +
    "1 0 obj\n<< /Type /Catalog >>\nendobj\n" +
    "xref\n0 2\n0000000000 65535 f \n0000000009 00000 n \n" +
    "trailer\n<< /Size 2 /Root 1 0 R >>\n" +
    `% AraLearn fixture sintética: ${key}\n` +
    "startxref\n45\n%%EOF\n",
    "utf8"
  );
}

function minimalPersistedPdfSource(title) {
  return {
    kind: "document",
    title,
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
  };
}

function conversationalNewPdfSource(source) {
  const {
    title,
    authorship,
    publicationDate,
    identifier,
    language,
    citationText,
    url,
    editionOrVersion
  } = source;
  return {
    title,
    authorship,
    publicationDate,
    identifier,
    language,
    citationText,
    url,
    editionOrVersion
  };
}

async function discoverPublishedAction(operationId) {
  const response = await fetch(
    `${LOCAL_APPLICATION_ORIGIN}/docs/downloads/aralearn-chatgpt-action-openapi.yaml`,
    { cache: "no-store" }
  );
  expect(response.status).toBe(200);
  const openApi = JSON.parse(await response.text());
  const match = Object.entries(openApi.paths).find(([, pathItem]) =>
    pathItem?.post?.operationId === operationId
  );
  expect(match, `A discovery publicada não contém ${operationId}.`).toBeTruthy();
  return { openApi, path: match[0], operation: match[1].post };
}

function createBoundActionHarness(pdfBytes) {
  const downloadLink =
    "https://sdmntprbrazilsouth.oaiusercontent.com/aralearn-edital-fixture.pdf?temporary=1";
  const adapter = new CourseSupabaseAdapter({
    supabaseUrl: config.projectUrl,
    publicSupabaseUrl: config.projectUrl,
    serverApiKey: config.adminKey,
    publishableKey: config.publishableKey,
    publicAppUrl: LOCAL_APPLICATION_ORIGIN,
    attempts: 1,
    fetchImpl: async (url, init) => {
      if (String(url) === downloadLink) {
        return new Response(pdfBytes, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Length": String(pdfBytes.byteLength)
          }
        });
      }
      return globalThis.fetch(url, init);
    }
  });
  const handler = createAuthoringActionHandler({
    adapter,
    allowedOrigins: new Set([CHATGPT_ACTION_ORIGIN]),
    actionBaseUrl: `${config.projectUrl}/functions/v1/aralearn-authoring-action`,
    publicAppUrl: LOCAL_APPLICATION_ORIGIN
  });
  return {
    downloadLink,
    async call(path, body, token = actionLifecycle.accessToken) {
      const response = await handler(new Request(
        `${config.projectUrl}/functions/v1/aralearn-authoring-action${path}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Origin: CHATGPT_ACTION_ORIGIN
          },
          body: JSON.stringify(body)
        }
      ));
      return { response, payload: await response.json() };
    }
  };
}

function createBoundMcpHarness(pdfBytes) {
  const downloadUrl =
    "https://files.oaiusercontent.com/aralearn-mcp-edital-fixture.pdf?temporary=1";
  const resourceUrl = `${config.projectUrl}/functions/v1/aralearn-authoring-mcp`;
  const authorizationServer = `${config.projectUrl}/auth/v1`;
  const adapter = new CourseSupabaseAdapter({
    supabaseUrl: config.projectUrl,
    publicSupabaseUrl: config.projectUrl,
    oauthIssuer: authorizationServer,
    serverApiKey: config.adminKey,
    publishableKey: config.publishableKey,
    publicAppUrl: LOCAL_APPLICATION_ORIGIN,
    attempts: 1,
    fetchImpl: async (url, init) => {
      if (String(url) === downloadUrl) {
        return new Response(pdfBytes, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Length": String(pdfBytes.byteLength)
          }
        });
      }
      return globalThis.fetch(url, init);
    }
  });
  const handler = createAuthoringMcpHandler({
    adapter,
    allowedOrigins: new Set([LOCAL_APPLICATION_ORIGIN]),
    resourceUrl,
    authorizationServer
  });
  let rpcId = 0;
  return {
    downloadUrl,
    async callTool(name, argumentsValue, token = mcpLifecycle.accessToken) {
      rpcId += 1;
      const response = await handler(new Request(resourceUrl, {
        method: "POST",
        headers: {
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Origin: LOCAL_APPLICATION_ORIGIN,
          "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: rpcId,
          method: "tools/call",
          params: { name, arguments: argumentsValue }
        })
      }));
      return { response, payload: await response.json() };
    }
  };
}

function expectNominalConversation(conversation, internalValues = []) {
  const serialized = JSON.stringify(conversation);
  expect(conversation?.message).toEqual(expect.any(String));
  expect(serialized).not.toMatch(UUID_PATTERN);
  expect(serialized).not.toMatch(HASH_PATTERN);
  expect(serialized).not.toMatch(NOMINAL_CONTROL_PATTERN);
  for (const value of internalValues.filter(Boolean)) {
    expect(serialized).not.toContain(String(value));
  }
}

async function listPdfObjects(prefix = `${courseId}/`) {
  return expectSuccessful(
    "listar PDFs sintéticos no Storage local",
    localSupabaseRequest(config, `/storage/v1/object/list/${SOURCE_BUCKET}`, {
      method: "POST",
      token: config.adminKey,
      body: {
        prefix,
        limit: 100,
        offset: 0,
        sortBy: { column: "name", order: "asc" }
      }
    })
  );
}

function persistenceEvidence() {
  return queryLocalPostgresJson(`
    select json_build_object(
      'courseRevision', (select revision::integer from public.courses
        where id='${courseId}'::uuid),
      'planVersion', (select version::integer from private.course_instructional_plans
        where course_id='${courseId}'::uuid),
      'parts', (select count(*)::integer from private.course_authoring_parts
        where course_id='${courseId}'::uuid and retired_at is null),
      'formalItems', (select count(*)::integer
        from private.course_instructional_plan_items where course_id='${courseId}'::uuid),
      'studyUnits', (select count(*)::integer from private.course_entities
        where course_id='${courseId}'::uuid and entity_type='study_unit'),
      'materializations', (select count(*)::integer
        from private.course_authoring_part_materializations
        where course_id='${courseId}'::uuid),
      'sources', (select count(*)::integer from private.course_source_revisions
        where course_id='${courseId}'::uuid),
      'anchors', (select count(*)::integer from private.course_source_anchor_revisions
        where course_id='${courseId}'::uuid),
      'attachments', (select count(*)::integer from private.course_source_attachments
        where course_id='${courseId}'::uuid),
      'distinctHashes', (select count(distinct content_hash)::integer
        from private.course_source_attachments where course_id='${courseId}'::uuid),
      'storageObjects', (select count(*)::integer from storage.objects
        where bucket_id='${SOURCE_BUCKET}' and name like '${courseId}/%'),
      'objectLinks', (select count(*)::integer
        from private.course_source_attachments attachment
        join storage.objects object on object.bucket_id='${SOURCE_BUCKET}'
          and object.name=attachment.storage_path
        where attachment.course_id='${courseId}'::uuid),
      'ownerSourceFacts', (select count(*)::integer from private.course_source_revisions
        where course_id='${courseId}'::uuid and actor_id='${owner.id}'::uuid),
      'ownerAnchorFacts', (select count(*)::integer
        from private.course_source_anchor_revisions
        where course_id='${courseId}'::uuid and actor_id='${owner.id}'::uuid),
      'ownerAttachments', (select count(*)::integer
        from private.course_source_attachments
        where course_id='${courseId}'::uuid and actor_id='${owner.id}'::uuid)
    )::text;
  `);
}

function cleanupEvidence() {
  if (!courseId || !owner?.id || !outsider?.id) return null;
  return queryLocalPostgresJson(`
    select json_build_object(
      'courses', (select count(*)::integer from public.courses
        where id='${courseId}'::uuid),
      'sources', (select count(*)::integer from private.course_source_revisions
        where course_id='${courseId}'::uuid),
      'attachments', (select count(*)::integer from private.course_source_attachments
        where course_id='${courseId}'::uuid),
      'storageObjects', (select count(*)::integer from storage.objects
        where bucket_id='${SOURCE_BUCKET}' and name like '${courseId}/%'),
      'users', (select count(*)::integer from auth.users
        where id in ('${owner.id}'::uuid,'${outsider.id}'::uuid))
    )::text;
  `);
}

test.describe("regressão conversacional integrada #223 no Supabase local", () => {
  test.skip(!ENABLED, "A regressão integrada roda somente com a stack Supabase local explícita.");
  test.setTimeout(240_000);

  test.beforeAll(async ({ browserName }, testInfo) => {
    void browserName;
    testInfo.setTimeout(120_000);
    config = localSupabaseConfiguration();
    fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
    editalPdfBytes = await readFile(editalPdfFixtureUrl);
    const suffix = `${Date.now()}-${process.pid}`;
    owner = await expectSuccessful(
      "criar pessoa autora sintética",
      createConfirmedLocalUser(config, {
        email: `regression-223-owner-${suffix}@aralearn.local`,
        password: PASSWORD,
        marker: "conversational-authoring-regression-223"
      })
    );
    outsider = await expectSuccessful(
      "criar conta externa sintética",
      createConfirmedLocalUser(config, {
        email: `regression-223-outsider-${suffix}@aralearn.local`,
        password: PASSWORD,
        marker: "conversational-authoring-regression-223"
      })
    );
    ownerToken = (await expectSuccessful(
      "autenticar pessoa autora sintética",
      signInLocalUser(config, { email: owner.email, password: PASSWORD })
    )).access_token;
    outsiderToken = (await expectSuccessful(
      "autenticar conta externa sintética",
      signInLocalUser(config, { email: outsider.email, password: PASSWORD })
    )).access_token;

    mcpLifecycle = {};
    await authorizeLocalMcpSession(config, {
      userAccessToken: ownerToken,
      userId: owner.id,
      lifecycle: mcpLifecycle
    });
    actionLifecycle = {};
    await authorizeLocalActionSession(config, {
      userAccessToken: ownerToken,
      userId: owner.id,
      lifecycle: actionLifecycle
    });
  });

  test.afterAll(async ({ browserName }, testInfo) => {
    void browserName;
    testInfo.setTimeout(120_000);
    const mcpCleanupFailure = config && mcpLifecycle.clientId
      ? await cleanupLocalMcpSession(config, mcpLifecycle).then(() => null, (error) => error)
      : null;
    const deletion = ownerToken
      ? await courseAction(config, "excluirMinhaConta", {
          confirmation: "EXCLUIR MINHA CONTA"
        }, ownerToken).catch(() => null)
      : null;
    const outsiderRemoval = config
      ? await removeLocalUser(config, outsider?.id).catch(() => null)
      : null;
    const ownerRemoval = config
      ? await removeLocalUser(config, owner?.id).catch(() => null)
      : null;

    if (courseId) await expect.poll(() => listPdfObjects()).toEqual([]);
    if (courseId && owner?.id && outsider?.id) {
      await expect.poll(cleanupEvidence).toEqual({
        courses: 0,
        sources: 0,
        attachments: 0,
        storageObjects: 0,
        users: 0
      });
    }
    if (deletion) {
      expect(deletion.response.status, failure("excluir conta autora sintética", deletion))
        .toBe(200);
    }
    if (outsiderRemoval) {
      expect([200, 204, 404], failure("remover conta externa residual", outsiderRemoval))
        .toContain(outsiderRemoval.response.status);
    }
    if (ownerRemoval) {
      expect([200, 204, 404], failure("remover conta autora residual", ownerRemoval))
        .toContain(ownerRemoval.response.status);
    }
    if (mcpCleanupFailure) throw mcpCleanupFailure;
  });

  test("retoma 12 Partes, quatro PDFs e cinco Âncoras em outra sessão", async () => {
    expect(fixture.course.title).toBe("Dataprev: Gestão de Servidores");
    expect(fixture.course.plan.parts).toHaveLength(12);
    expect(fixture.sources).toHaveLength(4);
    expect(fixture.sources.flatMap(({ anchors }) => anchors)).toHaveLength(5);

    const created = await expectSuccessful(
      "criar Curso sintético descartável pela aplicação",
      courseAction(config, "criarCurso", {
        requestId: randomUUID(),
        title: fixture.course.title,
        objective: fixture.course.objective
      }, ownerToken)
    );
    courseId = created.data.courseId;
    expect(courseId).toMatch(UUID_PATTERN);

    let planRead = await expectSuccessful(
      "Actions lê plano sintético inicial",
      chatGptAction(config, "lerCurso", {
        courseId,
        view: "instructional_plan"
      }, actionLifecycle.accessToken)
    );
    let currentRevision = planRead.data.courseRevision;
    let planVersion = planRead.data.plan.version;
    expect(currentRevision).toBe(1);
    expect(planVersion).toBe(1);

    const persistedPartIds = [];
    for (const [position, title] of fixture.course.plan.parts.entries()) {
      const changed = await expectSuccessful(
        `Actions cria Parte sintética ${position + 1}`,
        chatGptAction(config, "add_part", {
          requestId: `e2e223-part-${String(position + 1).padStart(2, "0")}`,
          courseId,
          expectedRevision: currentRevision,
          expectedPlanVersion: planVersion,
          operation: "update_instructional_plan",
          planCommand: {
            type: "add_part",
            position,
            title,
            intent: `Delimitar ${title} antes de qualquer produção de conteúdo.`
          }
        }, actionLifecycle.accessToken)
      );
      expect(changed.data.courseRevision).toBe(currentRevision + 1);
      expect(changed.data.planVersion).toBe(planVersion + 1);
      currentRevision = changed.data.courseRevision;
      planVersion = changed.data.planVersion;
    }
    const generatedParts = await expectSuccessful(
      "Actions relê as Partes com identidades geradas",
      chatGptAction(config, "lerCurso", {
        courseId,
        view: "instructional_plan"
      }, actionLifecycle.accessToken)
    );
    persistedPartIds.push(...generatedParts.data.plan.parts.map(({ id }) => id));
    expect(persistedPartIds).toHaveLength(12);
    persistedPartIds.forEach((id) => expect(id).toMatch(UUID_PATTERN));
    expect(new Set(persistedPartIds).size).toBe(12);

    const discoveredIngestion = await discoverPublishedAction("incorporarPdfComoFonte");
    const ingestionSchema = discoveredIngestion.operation.requestBody
      .content["application/json"].schema;
    expect(ingestionSchema.required).toContain("openaiFileIdRefs");
    expect(ingestionSchema.properties.openaiFileIdRefs).toMatchObject({
      type: "array",
      minItems: 1,
      maxItems: 1,
      items: { type: "string" }
    });
    const visibleIngestionSchema = JSON.stringify(ingestionSchema);
    expect(visibleIngestionSchema).not.toContain("storagePath");
    expect(visibleIngestionSchema).not.toContain("contentHash");
    expect(visibleIngestionSchema).not.toContain("byteSize");
    expect(visibleIngestionSchema).not.toContain('"pdf"');
    const actionSourceIntent = discoveredIngestion.openApi.components.schemas
      .IncorporarPdfComoFonteSourceIntent;
    expect(actionSourceIntent.minProperties).toBe(1);
    expect(actionSourceIntent.maxProperties).toBe(1);
    expect(Object.keys(actionSourceIntent.properties)).toEqual([
      "existingSource", "newSource", "revisedSource"
    ]);
    expect(Object.keys(actionSourceIntent.properties.newSource.properties)).toEqual([
      "title", "authorship", "publicationDate", "identifier", "language",
      "citationText", "url", "editionOrVersion"
    ]);
    expect(actionSourceIntent.properties.newSource.properties.studyVisibility).toBeUndefined();

    const ingestionClient = await createLocalMcpClient(config, mcpLifecycle.accessToken);
    expect(ingestionClient.toolNames).toEqual(expect.arrayContaining([
      "listarCursos", "lerCurso", "alterarCurso", "incorporarPdfComoFonte"
    ]));
    const mcpIngestionDefinition = ingestionClient.toolDefinitions.find(
      ({ name }) => name === "incorporarPdfComoFonte"
    );
    expect(
      mcpIngestionDefinition.inputSchema.properties.sourceIntent.oneOf
        .map(({ properties }) => properties.mode.const)
    ).toEqual(["existing", "create", "revise"]);
    const webClient = new CourseApiClient({
      projectUrl: config.projectUrl,
      publishableKey: config.publishableKey,
      authClient: {
        async getAccessToken() {
          return ownerToken;
        },
        async clearSession() {},
        emit() {}
      }
    });
    let uploadCount = 0;
    const persistedSources = new Map();

    for (const [sourceIndex, sourceFixture] of fixture.sources.entries()) {
      const pdfBytes = fixturePdfBytes(sourceFixture.key);
      expect(pdfBytes.byteLength).toBe(sourceFixture.attachment.byteSize);
      expect(createHash("sha256").update(pdfBytes).digest("hex"))
        .toBe(sourceFixture.attachment.contentHash);

      if (sourceIndex === 0) {
        const httpBindingProbe = await chatGptAction(
          config,
          discoveredIngestion.operation.operationId,
          {
            requestId: "e2e223-public-pdf-binding-probe",
            courseId,
            expectedRevision: currentRevision,
            sourceIntent: {
              newSource: conversationalNewPdfSource(sourceFixture.source)
            },
            openaiFileIdRefs: [{
              name: sourceFixture.attachment.fileName,
              id: "file-aralearn-binding-probe",
              mime_type: "application/pdf",
              download_link: "https://example.invalid/not-an-openai-file.pdf"
            }]
          },
          actionLifecycle.accessToken
        );
        expect(httpBindingProbe.response.status).toBe(422);
        expect(httpBindingProbe.payload.error?.code).toBe("invalid_openai_file");

        const boundAction = createBoundActionHarness(pdfBytes);
        const ingested = await expectSuccessful(
          "handler público da Action recebe o arquivo do ChatGPT e o persiste como Fonte",
          boundAction.call(discoveredIngestion.path, {
            requestId: "e2e223-public-pdf-edital",
            courseId,
            expectedRevision: currentRevision,
            sourceIntent: {
              newSource: conversationalNewPdfSource(sourceFixture.source)
            },
            openaiFileIdRefs: [{
              name: sourceFixture.attachment.fileName,
              id: "file-aralearn-edital-fixture",
              mime_type: "application/pdf",
              download_link: boundAction.downloadLink
            }]
          })
        );
        expect(ingested.data).toMatchObject({
          stored: true,
          changed: true,
          source: {
            sourceId: expect.stringMatching(UUID_PATTERN),
            sourceRevision: 1,
            bibliographyChanged: true
          }
        });
        expect(ingested.data.courseRevision).toBe(currentRevision + 2);
        expectNominalConversation(ingested.conversation, [
          courseId,
          ingested.data.source.sourceId,
          sourceFixture.attachment.contentHash,
          boundAction.downloadLink
        ]);
        currentRevision = ingested.data.courseRevision;
        persistedSources.set(sourceFixture.key, {
          ...sourceFixture,
          source: {
            ...minimalPersistedPdfSource(sourceFixture.source.title),
            ...conversationalNewPdfSource(sourceFixture.source)
          },
          sourceId: ingested.data.source.sourceId
        });
        uploadCount += 1;
        continue;
      }

      if (sourceIndex === 1) {
        const boundMcp = createBoundMcpHarness(pdfBytes);
        const mcpIngestion = await boundMcp.callTool("incorporarPdfComoFonte", {
          requestId: "e2e223-mcp-public-pdf-source-02",
          courseId,
          expectedRevision: currentRevision,
          sourceIntent: {
            mode: "create",
            newSource: { title: sourceFixture.source.title }
          },
          pdf: {
            download_url: boundMcp.downloadUrl,
            file_id: "file-aralearn-mcp-source-02",
            mime_type: "application/pdf",
            file_name: sourceFixture.attachment.fileName
          }
        });
        expect(
          mcpIngestion.response.status,
          `MCP público não ingeriu o PDF: ${JSON.stringify(mcpIngestion.payload)}`
        ).toBe(200);
        expect(mcpIngestion.payload.error).toBeUndefined();
        expect(mcpIngestion.payload.result).toMatchObject({
          isError: false,
          structuredContent: {
            ok: true,
            data: {
              stored: true,
              changed: true,
              source: {
                sourceId: expect.stringMatching(UUID_PATTERN),
                sourceRevision: 1,
                bibliographyChanged: true
              }
            }
          }
        });
        const ingested = mcpIngestion.payload.result.structuredContent.data;
        expect(ingested.courseRevision).toBe(currentRevision + 2);
        expect(mcpIngestion.payload.result.content[0].text)
          .toMatch(/mantido entre as Fontes do Curso/iu);
        expectNominalConversation(
          { message: mcpIngestion.payload.result.content[0].text },
          [
            courseId,
            ingested.source.sourceId,
            sourceFixture.attachment.contentHash,
            boundMcp.downloadUrl
          ]
        );
        currentRevision = ingested.courseRevision;
        persistedSources.set(sourceFixture.key, {
          ...sourceFixture,
          source: minimalPersistedPdfSource(sourceFixture.source.title),
          sourceId: ingested.source.sourceId
        });
        uploadCount += 1;
        continue;
      }

      const saved = await ingestionClient.callTool("alterarCurso", {
        requestId: `e2e223-source-${sourceFixture.key}`,
        courseId,
        expectedRevision: currentRevision,
        operation: "update_course_sources",
        sourceCommand: {
          type: "save_source",
          sourceId: sourceFixture.sourceId,
          expectedSourceRevision: 0,
          source: sourceFixture.source
        }
      });
      expect(saved).toMatchObject({
        courseRevision: currentRevision + 1,
        idempotent: false,
        changed: true,
        change: {
          type: "save_source",
          subjectId: sourceFixture.sourceId,
          revision: 1
        }
      });
      currentRevision = saved.courseRevision;

      uploadCount += 1;
      const uploaded = await webClient.uploadCourseSourcePdf({
        requestId: `e2e223-upload-${sourceFixture.key}`,
        courseId,
        expectedRevision: currentRevision,
        sourceId: sourceFixture.sourceId,
        sourceRevision: sourceFixture.revision,
        file: new File([pdfBytes], sourceFixture.attachment.fileName, {
          type: sourceFixture.attachment.mediaType
        })
      });
      expect(uploaded).toMatchObject({
        courseRevision: currentRevision + 1,
        idempotent: false,
        changed: true,
        change: {
          type: "attach_pdf",
          subjectId: sourceFixture.sourceId,
          revision: sourceFixture.revision
        }
      });
      currentRevision = uploaded.courseRevision;
      persistedSources.set(sourceFixture.key, sourceFixture);
    }
    expect(uploadCount).toBe(4);

    let anchorOrdinal = 0;
    let replayArguments = null;
    let replayAnchorId = null;
    const persistedAnchorIds = [];
    for (const sourceFixture of fixture.sources) {
      const persistedSource = persistedSources.get(sourceFixture.key);
      for (const anchor of sourceFixture.anchors) {
        anchorOrdinal += 1;
        const argumentsValue = {
          requestId: `e2e223-anchor-${String(anchorOrdinal).padStart(2, "0")}`,
          courseId,
          expectedRevision: currentRevision,
          operation: "update_course_sources",
          sourceCommand: {
            type: "save_anchor",
            sourceId: persistedSource.sourceId,
            sourceRevision: anchor.sourceRevision,
            expectedAnchorRevision: 0,
            selector: anchor.selector,
            humanLocator: anchor.humanLocator,
            verificationExcerpt: anchor.verificationExcerpt
          }
        };
        const saved = anchorOrdinal === 1
          ? (await expectSuccessful(
              "Actions cria Âncora sem identidade fornecida pelo chamador",
              chatGptAction(
                config,
                "alterarCurso",
                argumentsValue,
                actionLifecycle.accessToken
              )
            )).data
          : await ingestionClient.callTool("alterarCurso", argumentsValue);
        expect(saved.change.subjectId).toMatch(UUID_PATTERN);
        expect(saved).toMatchObject({
          courseRevision: currentRevision + 1,
          idempotent: false,
          changed: true,
          change: {
            type: "save_anchor",
            subjectId: expect.stringMatching(UUID_PATTERN),
            revision: 1
          }
        });
        persistedAnchorIds.push(saved.change.subjectId);
        currentRevision = saved.courseRevision;
        replayArguments = structuredClone(argumentsValue);
        replayAnchorId = saved.change.subjectId;
      }
    }
    expect(anchorOrdinal).toBe(5);
    expect(new Set(persistedAnchorIds).size).toBe(5);

    const replay = await ingestionClient.callTool("alterarCurso", replayArguments);
    expect(replay).toMatchObject({
      courseRevision: currentRevision,
      idempotent: true,
      changed: true,
      change: {
        type: "save_anchor",
        subjectId: replayAnchorId,
        revision: 1
      }
    });

    const stale = await chatGptAction(config, "alterarCurso", {
      requestId: "e2e223-stale-plan-write",
      courseId,
      expectedRevision: currentRevision - 1,
      expectedPlanVersion: planVersion,
      operation: "update_instructional_plan",
      planCommand: {
        type: "update_plan",
        objective: "Esta escrita obsoleta não pode substituir o objetivo sintético."
      }
    }, actionLifecycle.accessToken);
    expect(stale.response.status, failure("Actions recusa CAS obsoleto", stale)).toBe(409);
    expect(stale.payload).toMatchObject({
      ok: false,
      error: { code: "stale_course_state" },
      conversation: {
        classification: "conflict",
        writeState: "none",
        concurrencyConflict: true
      }
    });
    expectNominalConversation(stale.payload.conversation, [courseId]);

    const resumedActionLifecycle = {};
    await authorizeLocalActionSession(config, {
      userAccessToken: ownerToken,
      userId: owner.id,
      lifecycle: resumedActionLifecycle
    });
    expect(resumedActionLifecycle.accessToken).not.toBe(actionLifecycle.accessToken);

    const discovered = await expectSuccessful(
      "Actions descobre Curso sintético somente pelo título",
      chatGptAction(config, "listarCursos", {
        query: fixture.course.title,
        limit: 10
      }, resumedActionLifecycle.accessToken)
    );
    const discoveredCourse = discovered.data.items.find(
      ({ title }) => title === fixture.course.title
    );
    expect(discoveredCourse).toMatchObject({ courseId, title: fixture.course.title });
    const resumedActionCourseId = discoveredCourse.courseId;
    expectNominalConversation(discovered.conversation, [courseId]);

    planRead = await expectSuccessful(
      "Actions relê plano sintético consolidado",
      chatGptAction(config, "lerCurso", {
        courseId: resumedActionCourseId,
        view: "instructional_plan"
      }, resumedActionLifecycle.accessToken)
    );
    expect(planRead.data).toMatchObject({ courseId, courseRevision: currentRevision });
    expect(planRead.data.plan.parts).toHaveLength(12);
    expect(planRead.data.plan.intendedLearningOutcomes).toEqual([]);
    expect(planRead.data.plan.instructionalAnalysisUnits).toEqual([]);
    expect(planRead.data.plan.evidenceRequirements).toEqual([]);
    expect(planRead.data.plan.parts.every(({ progress }) =>
      progress.materializations.length === 0)).toBe(true);
    expect(planRead.conversation.message).toMatch(/Planejamento incompleto/u);
    expect(planRead.conversation.message).toMatch(/12 Partes/u);
    expect(planRead.conversation.message).toMatch(/Nenhum conteúdo foi produzido/u);
    expectNominalConversation(planRead.conversation, [courseId]);

    const actionCatalog = await expectSuccessful(
      "Actions resume as Fontes persistentes",
      chatGptAction(config, "lerCurso", {
        courseId: resumedActionCourseId,
        view: "course_sources",
        expectedRevision: currentRevision,
        mode: "catalog",
        limit: 10
      }, resumedActionLifecycle.accessToken)
    );
    expect(actionCatalog.data.items).toHaveLength(4);
    for (const { key } of fixture.sources) {
      const source = persistedSources.get(key).source;
      expect(actionCatalog.conversation.message).toContain(source.citationText || source.title);
    }
    expectNominalConversation(actionCatalog.conversation, [
      courseId,
      ...fixture.sources.map(({ key }) => persistedSources.get(key).sourceId),
      ...fixture.sources.map(({ attachment }) => attachment.contentHash)
    ]);

    const resumedClient = await createLocalMcpClient(config, mcpLifecycle.accessToken);
    expect(resumedClient).not.toBe(ingestionClient);
    const resumedCourses = await resumedClient.callTool("listarCursos", {
      query: fixture.course.title,
      limit: 10
    });
    const resumedCourse = resumedCourses.items.find(({ title }) => title === fixture.course.title);
    expect(resumedCourse).toMatchObject({ courseId, title: fixture.course.title });

    const resumedPlan = await resumedClient.callTool("lerCurso", {
      courseId: resumedCourse.courseId,
      view: "instructional_plan"
    });
    expect(resumedPlan.courseRevision).toBe(currentRevision);
    expect(resumedPlan.plan.parts).toHaveLength(12);
    expect(resumedPlan.plan.intendedLearningOutcomes).toEqual([]);
    expect(resumedPlan.plan.instructionalAnalysisUnits).toEqual([]);
    expect(resumedPlan.plan.evidenceRequirements).toEqual([]);

    const resumedCatalog = await resumedClient.callTool("lerCurso", {
      courseId: resumedCourse.courseId,
      view: "course_sources",
      expectedRevision: currentRevision,
      mode: "catalog",
      limit: 10
    });
    expect(resumedCatalog.items).toHaveLength(4);
    const storageBeforeDownloads = await listPdfObjects();
    expect(storageBeforeDownloads).toHaveLength(4);

    for (const sourceFixture of fixture.sources) {
      const persistedSource = persistedSources.get(sourceFixture.key);
      const catalogItem = resumedCatalog.items.find(
        ({ citationText }) => citationText === persistedSource.source.citationText
      );
      expect(catalogItem).toEqual(expect.objectContaining({
        citationText: persistedSource.source.citationText,
        status: "active"
      }));
      const detail = await resumedClient.callTool("lerCurso", {
        courseId: resumedCourse.courseId,
        view: "course_sources",
        expectedRevision: currentRevision,
        mode: "source",
        sourceId: catalogItem.sourceId,
        limit: 10
      });
      expect(detail.items).toHaveLength(1);
      const recoveredSource = detail.items[0];
      expect(recoveredSource).toMatchObject({
        sourceId: catalogItem.sourceId,
        revision: persistedSource.revision,
        status: "active",
        citationText: persistedSource.source.citationText
      });
      expect(recoveredSource.attachments).toEqual([
        expect.objectContaining({
          contentHash: sourceFixture.attachment.contentHash,
          byteSize: sourceFixture.attachment.byteSize,
          mediaType: "application/pdf"
        })
      ]);
      expect(recoveredSource.anchors.map(({ humanLocator }) => humanLocator).sort())
        .toEqual(sourceFixture.anchors.map(({ humanLocator }) => humanLocator).sort());

      const access = await resumedClient.callTool("lerCurso", {
        courseId: resumedCourse.courseId,
        view: "course_source_attachment",
        expectedRevision: currentRevision,
        attachmentOperation: "download",
        sourceId: recoveredSource.sourceId,
        sourceRevision: recoveredSource.revision,
        contentHash: recoveredSource.attachments[0].contentHash,
        includeAttachmentDownloadUrl: true
      });
      expect(access).toMatchObject({
        operation: "download",
        sourceId: recoveredSource.sourceId,
        sourceRevision: recoveredSource.revision,
        attachment: {
          contentHash: sourceFixture.attachment.contentHash,
          byteSize: sourceFixture.attachment.byteSize,
          mediaType: "application/pdf"
        },
        signedUrl: expect.stringMatching(/^https?:\/\//u),
        expiresAt: expect.any(String)
      });
      const downloaded = await fetch(access.signedUrl);
      expect(downloaded.status).toBe(200);
      const downloadedBytes = Buffer.from(await downloaded.arrayBuffer());
      expect(downloadedBytes).toEqual(fixturePdfBytes(sourceFixture.key));
      expect(createHash("sha256").update(downloadedBytes).digest("hex"))
        .toBe(sourceFixture.attachment.contentHash);
    }
    expect(uploadCount).toBe(4);
    expect((await listPdfObjects()).map(({ name }) => name))
      .toEqual(storageBeforeDownloads.map(({ name }) => name));

    const firstSource = persistedSources.get("edital");
    const firstActionCatalogItem = actionCatalog.data.items.find(
      ({ citationText }) => citationText === firstSource.source.citationText
    );
    const nominalDetail = await expectSuccessful(
      "Actions apresenta Fonte focal sem controles internos",
      chatGptAction(config, "lerCurso", {
        courseId: resumedActionCourseId,
        view: "course_sources",
        expectedRevision: currentRevision,
        mode: "source",
        sourceId: firstActionCatalogItem.sourceId,
        limit: 10
      }, resumedActionLifecycle.accessToken)
    );
    expect(nominalDetail.conversation.message).toContain(firstSource.source.citationText);
    expect(nominalDetail.conversation.message).toContain(
      firstSource.anchors[0].humanLocator
    );
    expect(nominalDetail.conversation.message).toContain("p. 44");
    expectNominalConversation(nominalDetail.conversation, [
      courseId,
      firstSource.sourceId,
      persistedAnchorIds[0],
      firstSource.attachment.contentHash
    ]);

    const firstRecoveredSource = nominalDetail.data.items[0];
    const actionAttachment = await expectSuccessful(
      "Actions da segunda sessão recupera o PDF persistido",
      chatGptAction(config, "lerCurso", {
        courseId: resumedActionCourseId,
        view: "course_source_attachment",
        expectedRevision: currentRevision,
        attachmentOperation: "download",
        sourceId: firstRecoveredSource.sourceId,
        sourceRevision: firstRecoveredSource.revision,
        contentHash: firstRecoveredSource.attachments[0].contentHash,
        includeAttachmentDownloadUrl: true
      }, resumedActionLifecycle.accessToken)
    );
    expect(actionAttachment.data.signedUrl).toMatch(/^https?:\/\//u);
    expectNominalConversation(actionAttachment.conversation, [
      courseId,
      firstRecoveredSource.sourceId,
      firstRecoveredSource.attachments[0].contentHash,
      actionAttachment.data.signedUrl
    ]);
    const actionDownloaded = await fetch(actionAttachment.data.signedUrl);
    expect(actionDownloaded.status).toBe(200);
    expect(Buffer.from(await actionDownloaded.arrayBuffer()))
      .toEqual(fixturePdfBytes("edital"));

    expect(persistenceEvidence()).toEqual({
      courseRevision: currentRevision,
      planVersion,
      parts: 12,
      formalItems: 0,
      studyUnits: 0,
      materializations: 0,
      sources: 4,
      anchors: 5,
      attachments: 4,
      distinctHashes: 4,
      storageObjects: 4,
      objectLinks: 4,
      ownerSourceFacts: 4,
      ownerAnchorFacts: 5,
      ownerAttachments: 4
    });

    const deniedCourse = await courseAction(config, "lerCurso", {
      courseId,
      view: "instructional_plan"
    }, outsiderToken);
    expect([400, 403, 404], failure("conta externa lê Curso privado", deniedCourse))
      .toContain(deniedCourse.response.status);
    const deniedPdf = await localSupabaseRequest(
      config,
      `/storage/v1/object/authenticated/${SOURCE_BUCKET}/${courseId}/` +
        `${firstSource.attachment.contentHash}.pdf`,
      { token: outsiderToken }
    );
    expect([400, 401, 403, 404], failure("conta externa lê PDF privado", deniedPdf))
      .toContain(deniedPdf.response.status);

    const finalPlan = await expectSuccessful(
      "reler plano depois do conflito e das tentativas negadas",
      courseAction(config, "lerCurso", {
        courseId,
        view: "instructional_plan"
      }, ownerToken)
    );
    expect(finalPlan.data.courseRevision).toBe(currentRevision);
    expect(finalPlan.data.plan.objective).toBe(fixture.course.objective);
    expect(finalPlan.data.plan.parts).toHaveLength(12);
  });
});
