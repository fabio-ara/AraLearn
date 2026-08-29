import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { CourseApiClient } from "../../src/supabase/CourseApiClient.js";
import {
  authorizeLocalActionSession,
  authorizeLocalMcpSession,
  chatGptAction,
  cleanupLocalMcpSession,
  courseAction,
  createConfirmedLocalUser,
  createLocalMcpClient,
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

let config = null;
let fixture = null;
let owner = null;
let outsider = null;
let ownerToken = "";
let outsiderToken = "";
let courseId = "";
let mcpLifecycle = {};
let actionLifecycle = {};

function failure(label, result) {
  return localSupabaseFailure(label, result);
}

async function expectSuccessful(label, promise, status = 200) {
  const result = await promise;
  expect(result.response.status, failure(label, result)).toBe(status);
  return result.payload;
}

function syntheticPdfBytes(key) {
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

    for (const [position, title] of fixture.course.plan.parts.entries()) {
      const changed = await expectSuccessful(
        `Actions cria Parte sintética ${position + 1}`,
        chatGptAction(config, "alterarCurso", {
          requestId: `e2e223-part-${String(position + 1).padStart(2, "0")}`,
          courseId,
          expectedRevision: currentRevision,
          expectedPlanVersion: planVersion,
          operation: "update_instructional_plan",
          planCommand: {
            type: "add_part",
            id: fixture.machineState.partIds[position],
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

    const ingestionClient = await createLocalMcpClient(config, mcpLifecycle.accessToken);
    expect(ingestionClient.toolNames).toEqual(expect.arrayContaining([
      "listarCursos", "lerCurso", "alterarCurso"
    ]));
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

    for (const sourceFixture of fixture.sources) {
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

      const pdfBytes = syntheticPdfBytes(sourceFixture.key);
      expect(pdfBytes.byteLength).toBe(sourceFixture.attachment.byteSize);
      expect(createHash("sha256").update(pdfBytes).digest("hex"))
        .toBe(sourceFixture.attachment.contentHash);
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
    }
    expect(uploadCount).toBe(4);

    let anchorOrdinal = 0;
    let replayArguments = null;
    for (const sourceFixture of fixture.sources) {
      for (const anchor of sourceFixture.anchors) {
        anchorOrdinal += 1;
        const argumentsValue = {
          requestId: `e2e223-anchor-${String(anchorOrdinal).padStart(2, "0")}`,
          courseId,
          expectedRevision: currentRevision,
          operation: "update_course_sources",
          sourceCommand: {
            type: "save_anchor",
            anchorId: anchor.anchorId,
            sourceId: sourceFixture.sourceId,
            sourceRevision: anchor.sourceRevision,
            expectedAnchorRevision: 0,
            selector: anchor.selector,
            humanLocator: anchor.humanLocator,
            verificationExcerpt: anchor.verificationExcerpt
          }
        };
        const saved = await ingestionClient.callTool("alterarCurso", argumentsValue);
        expect(saved).toMatchObject({
          courseRevision: currentRevision + 1,
          idempotent: false,
          changed: true,
          change: { type: "save_anchor", subjectId: anchor.anchorId, revision: 1 }
        });
        currentRevision = saved.courseRevision;
        replayArguments = structuredClone(argumentsValue);
      }
    }
    expect(anchorOrdinal).toBe(5);

    const replay = await ingestionClient.callTool("alterarCurso", replayArguments);
    expect(replay).toMatchObject({
      courseRevision: currentRevision,
      idempotent: true,
      changed: true,
      change: replayArguments.sourceCommand && {
        type: "save_anchor",
        subjectId: replayArguments.sourceCommand.anchorId,
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

    const discovered = await expectSuccessful(
      "Actions descobre Curso sintético somente pelo título",
      chatGptAction(config, "listarCursos", {
        query: fixture.course.title,
        limit: 10
      }, actionLifecycle.accessToken)
    );
    expect(discovered.data.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ courseId, title: fixture.course.title })
    ]));
    expectNominalConversation(discovered.conversation, [courseId]);

    planRead = await expectSuccessful(
      "Actions relê plano sintético consolidado",
      chatGptAction(config, "lerCurso", {
        courseId,
        view: "instructional_plan"
      }, actionLifecycle.accessToken)
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
        courseId,
        view: "course_sources",
        expectedRevision: currentRevision,
        mode: "catalog",
        limit: 10
      }, actionLifecycle.accessToken)
    );
    expect(actionCatalog.data.items).toHaveLength(4);
    for (const { source } of fixture.sources) {
      expect(actionCatalog.conversation.message).toContain(source.citationText);
    }
    expectNominalConversation(actionCatalog.conversation, [
      courseId,
      ...fixture.sources.map(({ sourceId }) => sourceId),
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
      const catalogItem = resumedCatalog.items.find(
        ({ citationText }) => citationText === sourceFixture.source.citationText
      );
      expect(catalogItem).toEqual(expect.objectContaining({
        citationText: sourceFixture.source.citationText,
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
        revision: sourceFixture.revision,
        status: "active",
        citationText: sourceFixture.source.citationText
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
      expect(downloadedBytes).toEqual(syntheticPdfBytes(sourceFixture.key));
      expect(createHash("sha256").update(downloadedBytes).digest("hex"))
        .toBe(sourceFixture.attachment.contentHash);
    }
    expect(uploadCount).toBe(4);
    expect((await listPdfObjects()).map(({ name }) => name))
      .toEqual(storageBeforeDownloads.map(({ name }) => name));

    const firstSource = fixture.sources[0];
    const nominalDetail = await expectSuccessful(
      "Actions apresenta Fonte focal sem controles internos",
      chatGptAction(config, "lerCurso", {
        courseId,
        view: "course_sources",
        expectedRevision: currentRevision,
        mode: "source",
        sourceId: firstSource.sourceId,
        limit: 10
      }, actionLifecycle.accessToken)
    );
    expect(nominalDetail.conversation.message).toContain(firstSource.source.citationText);
    expect(nominalDetail.conversation.message).toContain(
      firstSource.anchors[0].humanLocator
    );
    expectNominalConversation(nominalDetail.conversation, [
      courseId,
      firstSource.sourceId,
      firstSource.anchors[0].anchorId,
      firstSource.attachment.contentHash
    ]);

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
