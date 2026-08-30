import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  cleanupLocalMcpOAuthProvision,
  provisionHostedMcpOAuthToken,
  refreshLocalMcpOAuthToken
} from "./runLocalMcpOAuthSmoke.mjs";
import {
  cleanupHostedCourseSourcePdfFixture,
  createHostedPdfFixture,
  normalizeHostedCourseSourcePdfEnvironment,
  readHostedCourseSourcePdfEnvironment
} from "./runHostedCourseSourcePdfSmoke.mjs";
import { EXPECTED_AUTHORING_CONTRACT_HEADER } from "./verifyHostedBackend.mjs";
import { AUTHORING_CONVERSATIONAL_PROJECTION_HEADER } from
  "../supabase/functions/_shared/aralearn-authoring/conversationalPdfSourceProjection.js";

const APPLICATION_ORIGIN = "https://fabio-ara.github.io";
const MCP_PROTOCOL_VERSION = "2025-11-25";
const SOURCE_ID = "source-hosted-conversational-smoke";
const ANCHOR_ID = "anchor-hosted-conversational-smoke";
const SOURCE_CITATION =
  "AraLearn. Documento sintético descartável do smoke conversacional, 2026.";
const HUMAN_LOCATOR = "p. 2 do PDF sintético";
const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu;
const HASH_PATTERN = /\b[a-f0-9]{64}\b/iu;
const NOMINAL_CONTROL_PATTERN =
  /\b(?:courseId|sourceId|sourceRevision|anchorId|anchorRevision|expectedRevision|expectedPlanVersion|requestId|storagePath|contentHash|planVersion|revision|path|hash|CAS|payload|schema|listarCursos|lerCurso|criarCurso|alterarCurso|consultarComponentesDidaticos|incorporarPdfComoFonte|ingerirPdfDaFonte|save_source|save_anchor|attach_pdf|update_course_sources|course_sources|course_source_attachment|tools\/call|aralearn\.[A-Za-z0-9._-]+)\b/iu;

export const HOSTED_CONVERSATIONAL_SOURCE_SMOKE_CONTRACT =
  "aralearn.hosted-conversational-source-smoke.v1";

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function text(value) {
  return String(value || "").trim();
}

async function responseJson(response, label) {
  const source = await response.text();
  let payload;
  try {
    payload = source ? JSON.parse(source) : null;
  } catch {
    throw new Error(`${label} não devolveu JSON válido.`);
  }
  ensure(
    payload && typeof payload === "object" && !Array.isArray(payload),
    `${label} não devolveu um objeto JSON.`
  );
  return payload;
}

export function createHostedConversationalCourseTitle(createBytes = randomBytes) {
  ensure(typeof createBytes === "function", "O gerador do título sintético é inválido.");
  const suffix = Buffer.from(createBytes(9)).toString("base64url");
  ensure(/^[A-Za-z0-9_-]{12}$/u.test(suffix), "O título sintético não recebeu entropia válida.");
  return `Curso sintético descartável do smoke conversacional ${suffix}`;
}

export function assertHostedHumanProjection(value, internalValues = []) {
  const visible = text(value);
  ensure(visible, "A projeção humana hospedada está vazia.");
  ensure(!UUID_PATTERN.test(visible), "A projeção humana hospedada expôs uma identidade interna.");
  ensure(!HASH_PATTERN.test(visible), "A projeção humana hospedada expôs um hash interno.");
  ensure(
    !NOMINAL_CONTROL_PATTERN.test(visible),
    "A projeção humana hospedada expôs um controle técnico."
  );
  for (const internalValue of internalValues.filter(Boolean)) {
    ensure(
      !visible.includes(String(internalValue)),
      "A projeção humana hospedada expôs um valor interno."
    );
  }
  return visible;
}

export function createHostedMcpClient({
  projectUrl,
  accessToken,
  clientName,
  fetchImpl = globalThis.fetch
}) {
  ensure(typeof fetchImpl === "function", "fetch não está disponível para o cliente MCP.");
  ensure(/^https:\/\/[^/]+$/u.test(text(projectUrl)), "A Project URL do cliente MCP é inválida.");
  ensure(/^[^.]+\.[^.]+\.[^.]+$/u.test(text(accessToken)), "O bearer MCP é inválido.");
  ensure(text(clientName), "O cliente MCP lógico não recebeu nome.");
  const endpoint = `${text(projectUrl)}/functions/v1/aralearn-authoring-mcp`;
  let rpcId = 0;
  let initialized = false;

  async function call(method, params = {}, { initialize = false } = {}) {
    rpcId += 1;
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Origin: APPLICATION_ORIGIN,
        ...(initialize ? {} : { "MCP-Protocol-Version": MCP_PROTOCOL_VERSION })
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: rpcId, method, params }),
      signal: AbortSignal.timeout(45_000)
    });
    const payload = await responseJson(response, `MCP/${method}`);
    ensure(response.status === 200, `MCP/${method} devolveu HTTP ${response.status}.`);
    ensure(
      payload.jsonrpc === "2.0" && payload.id === rpcId && !payload.error,
      `MCP/${method} não confirmou a chamada.`
    );
    ensure(
      response.headers.get("x-aralearn-authoring-contract") ===
        EXPECTED_AUTHORING_CONTRACT_HEADER,
      `MCP/${method} não corresponde ao contrato hospedado corrente.`
    );
    ensure(
      response.headers.get("x-aralearn-authoring-projection") ===
        AUTHORING_CONVERSATIONAL_PROJECTION_HEADER,
      `MCP/${method} não corresponde à projeção conversacional corrente.`
    );
    ensure(
      response.headers.get("mcp-session-id") === null,
      "O MCP hospedado conservou sessão de transporte inesperada."
    );
    return payload.result;
  }

  return Object.freeze({
    async initialize() {
      ensure(!initialized, "O mesmo cliente MCP lógico foi inicializado duas vezes.");
      const result = await call("initialize", {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: text(clientName), version: "1" }
      }, { initialize: true });
      ensure(
        result?.protocolVersion === MCP_PROTOCOL_VERSION,
        "O MCP hospedado não negociou o protocolo esperado."
      );
      initialized = true;
    },

    async callTool(name, argumentsValue = {}) {
      ensure(initialized, "Inicialize o cliente MCP antes de chamar uma ferramenta.");
      const result = await call("tools/call", { name, arguments: argumentsValue });
      ensure(result?.isError === false, `MCP/${name} devolveu erro.`);
      ensure(result?.structuredContent?.ok === true, `MCP/${name} não confirmou sucesso.`);
      const humanText = (Array.isArray(result.content) ? result.content : [])
        .filter((entry) => entry?.type === "text")
        .map((entry) => text(entry.text))
        .filter(Boolean)
        .join("\n");
      ensure(humanText, `MCP/${name} não devolveu projeção humana.`);
      return {
        data: result.structuredContent.data,
        humanText
      };
    }
  });
}

async function uploadHostedPdf({
  configuration,
  accessToken,
  courseId,
  expectedRevision,
  requestId,
  pdf,
  fetchImpl
}) {
  const body = new FormData();
  body.set("requestId", requestId);
  body.set("courseId", courseId);
  body.set("expectedRevision", String(expectedRevision));
  body.set("sourceId", SOURCE_ID);
  body.set("sourceRevision", "1");
  body.set(
    "file",
    new Blob([pdf.bytes], { type: "application/pdf" }),
    "documento-sintetico-descartavel.pdf"
  );
  const response = await fetchImpl(
    `${configuration.projectUrl}/functions/v1/aralearn-course-api/app/ingerirPdfDaFonte`,
    {
      method: "POST",
      headers: {
        apikey: configuration.publishableKey,
        Authorization: `Bearer ${accessToken}`,
        Origin: APPLICATION_ORIGIN
      },
      body,
      signal: AbortSignal.timeout(60_000)
    }
  );
  const payload = await responseJson(response, "Ingestão hospedada do PDF sintético");
  ensure(response.status === 200, `A ingestão hospedada devolveu HTTP ${response.status}.`);
  ensure(payload.ok === true, "A ingestão hospedada não confirmou sucesso.");
  const data = payload.data;
  ensure(
    data?.contract === "aralearn.course-source-pdf-ingestion.v1" &&
      data.courseId === courseId && data.courseRevision === expectedRevision + 1 &&
      data.requestId === requestId && data.changed === true &&
      data.change?.type === "attach_pdf" && data.change?.subjectId === SOURCE_ID &&
      data.change?.revision === 1 && data.attachment?.contentHash === pdf.contentHash &&
      data.attachment?.byteSize === pdf.byteSize &&
      data.attachment?.mediaType === "application/pdf",
    "A confirmação hospedada do PDF não corresponde ao arquivo sintético."
  );
  return data;
}

export async function runHostedConversationalSourceSmoke({
  environment = null,
  fetchImpl = globalThis.fetch,
  createId = randomUUID,
  createBytes = randomBytes,
  provisionToken = provisionHostedMcpOAuthToken,
  refreshToken = refreshLocalMcpOAuthToken,
  cleanupHostedFixture = cleanupHostedCourseSourcePdfFixture,
  cleanupOAuthProvision = cleanupLocalMcpOAuthProvision
} = {}) {
  ensure(typeof fetchImpl === "function", "fetch não está disponível para o smoke hospedado.");
  const resolvedEnvironment = environment || await readHostedCourseSourcePdfEnvironment();
  const configuration = normalizeHostedCourseSourcePdfEnvironment(resolvedEnvironment);
  const oauthLifecycle = {};
  const hostedLifecycle = {
    accessToken: null,
    accountDeleted: false,
    courseId: null,
    storagePaths: new Set(),
    userId: null
  };
  let evidence = null;
  let primaryFailure = null;

  try {
    const provision = await provisionToken({
      environment: resolvedEnvironment,
      fetchImpl,
      lifecycle: oauthLifecycle,
      createId,
      createBytes
    });
    hostedLifecycle.accessToken = provision.userAccessToken;
    hostedLifecycle.userId = provision.userId;

    const firstClient = createHostedMcpClient({
      projectUrl: provision.projectUrl,
      accessToken: provision.accessToken,
      clientName: "aralearn-hosted-conversational-source-ingestion",
      fetchImpl
    });
    await firstClient.initialize();
    const title = createHostedConversationalCourseTitle(createBytes);
    const createRequestId = createId();
    const created = await firstClient.callTool("criarCurso", {
      requestId: createRequestId,
      title,
      objective: "Validar retomada, PDF e proveniência sem conservar dados de teste."
    });
    const courseId = text(created.data?.courseId).toLowerCase();
    ensure(UUID_PATTERN.test(courseId), "A criação hospedada não devolveu Curso válido.");
    ensure(created.data?.revision === 1, "O Curso hospedado não começou na revisão esperada.");
    hostedLifecycle.courseId = courseId;
    assertHostedHumanProjection(created.humanText, [createRequestId, courseId]);

    const sourceRequestId = createId();
    const savedSource = await firstClient.callTool("alterarCurso", {
      requestId: sourceRequestId,
      courseId,
      expectedRevision: 1,
      operation: "update_course_sources",
      sourceCommand: {
        type: "save_source",
        sourceId: SOURCE_ID,
        expectedSourceRevision: 0,
        source: {
          kind: "document",
          title: "Documento sintético descartável do smoke conversacional",
          authorship: "AraLearn",
          publicationDate: "2026-08-29",
          identifier: null,
          language: "pt-BR",
          citationText: SOURCE_CITATION,
          url: null,
          editionOrVersion: "fixture hospedada",
          origin: "external",
          availability: "restricted",
          verificationStatus: "author_verified",
          studyVisibility: "citation"
        }
      }
    });
    ensure(
      savedSource.data?.courseRevision === 2 && savedSource.data?.changed === true &&
        savedSource.data?.change?.type === "save_source" &&
        savedSource.data?.change?.subjectId === SOURCE_ID,
      "A Fonte sintética hospedada não foi salva."
    );
    assertHostedHumanProjection(savedSource.humanText, [
      sourceRequestId, courseId, SOURCE_ID
    ]);

    const pdf = createHostedPdfFixture(768);
    const storagePath = `${courseId}/${pdf.contentHash}.pdf`;
    hostedLifecycle.storagePaths.add(storagePath);
    const pdfRequestId = createId();
    const uploaded = await uploadHostedPdf({
      configuration,
      accessToken: provision.userAccessToken,
      courseId,
      expectedRevision: savedSource.data.courseRevision,
      requestId: pdfRequestId,
      pdf,
      fetchImpl
    });

    const anchorRequestId = createId();
    const savedAnchor = await firstClient.callTool("alterarCurso", {
      requestId: anchorRequestId,
      courseId,
      expectedRevision: uploaded.courseRevision,
      operation: "update_course_sources",
      sourceCommand: {
        type: "save_anchor",
        anchorId: ANCHOR_ID,
        sourceId: SOURCE_ID,
        sourceRevision: 1,
        expectedAnchorRevision: 0,
        selector: { kind: "page_range", startPage: 2, endPage: 2 },
        humanLocator: HUMAN_LOCATOR,
        verificationExcerpt: "Trecho sintético descartável usado somente no smoke hospedado."
      }
    });
    ensure(
      savedAnchor.data?.courseRevision === uploaded.courseRevision + 1 &&
        savedAnchor.data?.changed === true &&
        savedAnchor.data?.change?.type === "save_anchor" &&
        savedAnchor.data?.change?.subjectId === ANCHOR_ID,
      "A Âncora sintética hospedada não foi salva."
    );
    assertHostedHumanProjection(savedAnchor.humanText, [
      anchorRequestId, courseId, SOURCE_ID, ANCHOR_ID
    ]);

    const refreshed = await refreshToken({ provision, fetchImpl });
    const resumedClient = createHostedMcpClient({
      projectUrl: provision.projectUrl,
      accessToken: refreshed.accessToken,
      clientName: "aralearn-hosted-conversational-source-resumption",
      fetchImpl
    });
    ensure(resumedClient !== firstClient, "A retomada reutilizou o cliente MCP lógico anterior.");
    await resumedClient.initialize();

    const internalValues = [
      createRequestId,
      sourceRequestId,
      pdfRequestId,
      anchorRequestId,
      courseId,
      SOURCE_ID,
      ANCHOR_ID,
      pdf.contentHash,
      storagePath
    ];
    const discovered = await resumedClient.callTool("listarCursos", {
      query: title,
      limit: 10
    });
    const matches = Array.isArray(discovered.data?.items)
      ? discovered.data.items.filter((item) => item?.title === title)
      : [];
    ensure(
      matches.length === 1 && matches[0].courseId === courseId,
      "A nova sessão não retomou unicamente o Curso sintético pelo título."
    );
    assertHostedHumanProjection(discovered.humanText, internalValues);
    ensure(discovered.humanText.includes(title), "A retomada humana omitiu o título do Curso.");

    const currentRevision = savedAnchor.data.courseRevision;
    const sourceDetail = await resumedClient.callTool("lerCurso", {
      courseId,
      view: "course_sources",
      expectedRevision: currentRevision,
      mode: "source",
      sourceId: SOURCE_ID,
      limit: 10
    });
    const recoveredSource = sourceDetail.data?.items?.[0];
    ensure(
      recoveredSource?.sourceId === SOURCE_ID && recoveredSource.revision === 1 &&
        recoveredSource.citationText === SOURCE_CITATION &&
        recoveredSource.anchors?.some((anchor) =>
          anchor.anchorId === ANCHOR_ID && anchor.humanLocator === HUMAN_LOCATOR) &&
        recoveredSource.attachments?.some((attachment) =>
          attachment.contentHash === pdf.contentHash && attachment.byteSize === pdf.byteSize),
      "A nova sessão não recuperou a Fonte, o PDF e a Âncora sintéticos."
    );
    assertHostedHumanProjection(sourceDetail.humanText, internalValues);
    ensure(
      sourceDetail.humanText.includes(SOURCE_CITATION) &&
        sourceDetail.humanText.includes(HUMAN_LOCATOR),
      "A retomada humana não apresentou a citação e o local verificável."
    );

    const attachment = await resumedClient.callTool("lerCurso", {
      courseId,
      view: "course_source_attachment",
      expectedRevision: currentRevision,
      attachmentOperation: "download",
      sourceId: SOURCE_ID,
      sourceRevision: 1,
      contentHash: pdf.contentHash,
      includeAttachmentDownloadUrl: true
    });
    assertHostedHumanProjection(attachment.humanText, internalValues);
    ensure(
      attachment.data?.operation === "download" &&
        attachment.data?.attachment?.contentHash === pdf.contentHash &&
        /^https:\/\//u.test(text(attachment.data?.signedUrl)),
      "A nova sessão não recuperou o download assinado do PDF."
    );
    const downloaded = await fetchImpl(attachment.data.signedUrl, {
      headers: { Accept: "application/pdf" },
      signal: AbortSignal.timeout(45_000)
    });
    ensure(downloaded.status === 200, `O download sintético devolveu HTTP ${downloaded.status}.`);
    ensure(
      Buffer.from(await downloaded.arrayBuffer()).equals(Buffer.from(pdf.bytes)),
      "O PDF recuperado na nova sessão difere do PDF sintético enviado."
    );

    evidence = Object.freeze({
      contract: HOSTED_CONVERSATIONAL_SOURCE_SMOKE_CONTRACT,
      anchorRecovered: true,
      humanProjectionProtected: true,
      pdfRecovered: true,
      resumedByTitle: true
    });
  } catch (error) {
    primaryFailure = error;
  }

  hostedLifecycle.accessToken ||= oauthLifecycle.userAccessToken || null;
  hostedLifecycle.userId ||= oauthLifecycle.userId || null;
  const cleanupFailures = [];
  try {
    await cleanupHostedFixture({ configuration, fetchImpl, lifecycle: hostedLifecycle });
  } catch (error) {
    cleanupFailures.push(error);
  }
  try {
    await cleanupOAuthProvision({
      provision: {
        ...oauthLifecycle,
        oauthGrantCreated: false,
        userAccessToken: null
      },
      fetchImpl
    });
  } catch (error) {
    cleanupFailures.push(error);
  }

  if (primaryFailure && cleanupFailures.length) {
    throw new AggregateError(
      [primaryFailure, ...cleanupFailures],
      "O smoke conversacional hospedado e sua limpeza falharam."
    );
  }
  if (primaryFailure) throw primaryFailure;
  if (cleanupFailures.length) {
    throw new AggregateError(
      cleanupFailures,
      "A limpeza do smoke conversacional hospedado falhou."
    );
  }
  return Object.freeze({
    ...evidence,
    cleanup: Object.freeze({ courseCount: 0, objectCount: 0, userCount: 0 })
  });
}

const entryPoint = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entryPoint === fileURLToPath(import.meta.url)) {
  await runHostedConversationalSourceSmoke();
  console.log(
    "Smoke conversacional hospedado: retomada, PDF, Âncora e limpeza integral aprovados."
  );
}
