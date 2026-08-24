import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveSupabaseServerEnvironment,
  supabaseServerHeaders
} from "../supabase/functions/_shared/aralearn-authoring/supabaseEnvironment.js";

const REPOSITORY_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const SUPABASE_CLI_VERSION = "2.115.0";
const APPLICATION_ORIGIN = "https://fabio-ara.github.io";
const COURSE_SOURCE_PDF_BUCKET = "course-source-pdfs";
const COURSE_SOURCE_PDF_PATH_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[a-f0-9]{64}\.pdf$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const JWT_PATTERN = /^[^.]+\.[^.]+\.[^.]+$/u;
const TRANSIENT_EDGE_STATUSES = new Set([502, 503, 504]);
const textEncoder = new TextEncoder();

export const HOSTED_COURSE_SOURCE_PDF_SMOKE_CONTRACT =
  "aralearn.hosted-course-source-pdf-smoke.v1";

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function jsonObject(value, message) {
  ensure(value && typeof value === "object" && !Array.isArray(value), message);
  return value;
}

function text(value) {
  return String(value || "").trim();
}

function sanitizedStatusError(label, status) {
  return new Error(`${label} devolveu HTTP ${status}.`);
}

async function fetchSafely(fetchImpl, input, init, label) {
  try {
    return await fetchImpl(input, {
      ...init,
      signal: init?.signal || AbortSignal.timeout(45_000)
    });
  } catch {
    throw new Error(`${label} não pôde ser concluído.`);
  }
}

async function parseJson(response, label) {
  const source = await response.text();
  try {
    return source ? JSON.parse(source) : null;
  } catch {
    const contentType = text(response.headers.get("content-type")) || "sem Content-Type";
    throw new Error(
      `${label} não devolveu JSON válido (HTTP ${response.status}; ${contentType}).`
    );
  }
}

async function requestJson(fetchImpl, input, init, label, acceptedStatuses = [200]) {
  const response = await fetchSafely(fetchImpl, input, init, label);
  const payload = await parseJson(response, label);
  if (!acceptedStatuses.includes(response.status)) {
    throw sanitizedStatusError(label, response.status);
  }
  return { response, payload };
}

function applicationHeaders(configuration, accessToken, { contentType = true } = {}) {
  return {
    apikey: configuration.publishableKey,
    Authorization: `Bearer ${accessToken}`,
    Origin: APPLICATION_ORIGIN,
    ...(contentType ? { "Content-Type": "application/json" } : {})
  };
}

function validateUuid(value, message) {
  const normalized = text(value).toLowerCase();
  ensure(UUID_PATTERN.test(normalized), message);
  return normalized;
}

function normalizeHostedEnvironment(environment) {
  ensure(
    !text(environment?.SUPABASE_SERVICE_ROLE_KEY) &&
      !text(environment?.SERVICE_ROLE_KEY),
    "O smoke hospedado aceita somente sb_secret_ como credencial administrativa."
  );
  const configuration = resolveSupabaseServerEnvironment(environment);
  ensure(!configuration.local, "O smoke hospedado recusa a stack Supabase local.");
  const projectUrl = new URL(configuration.supabaseUrl);
  ensure(
    projectUrl.protocol === "https:" &&
      projectUrl.username === "" && projectUrl.password === "" &&
      projectUrl.search === "" && projectUrl.hash === "" &&
      /^[a-z0-9]{20}\.supabase\.co$/u.test(projectUrl.hostname),
    "O smoke hospedado exige a Project URL HTTPS canônica do Supabase."
  );
  return {
    ...configuration,
    projectRef: projectUrl.hostname.slice(0, 20),
    projectUrl: projectUrl.origin
  };
}

export function createHostedPdfFixture(byteSize = 512) {
  ensure(
    Number.isSafeInteger(byteSize) && byteSize >= 256 && byteSize <= 20 * 1024 * 1024,
    "O PDF sintético não respeita o limite do fluxo hospedado."
  );
  const prefix = textEncoder.encode(
    "%PDF-1.4\n" +
    "1 0 obj\n<< /Type /Catalog >>\nendobj\n" +
    "% hosted-course-source-pdf-smoke "
  );
  let fillerLength = 0;
  let trailer;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const xrefOffset = prefix.byteLength + fillerLength + 1;
    trailer = textEncoder.encode(
      "xref\n0 2\n" +
      "0000000000 65535 f \n" +
      "0000000009 00000 n \n" +
      "trailer\n<< /Size 2 /Root 1 0 R >>\n" +
      `startxref\n${xrefOffset}\n%%EOF\n`
    );
    const nextFillerLength = byteSize - prefix.byteLength - 1 - trailer.byteLength;
    ensure(nextFillerLength >= 0, "O tamanho solicitado não comporta o PDF sintético.");
    if (nextFillerLength === fillerLength) break;
    fillerLength = nextFillerLength;
  }
  const xrefOffset = prefix.byteLength + fillerLength + 1;
  trailer = textEncoder.encode(
    "xref\n0 2\n" +
    "0000000000 65535 f \n" +
    "0000000009 00000 n \n" +
    "trailer\n<< /Size 2 /Root 1 0 R >>\n" +
    `startxref\n${xrefOffset}\n%%EOF\n`
  );
  ensure(
    prefix.byteLength + fillerLength + 1 + trailer.byteLength === byteSize,
    "O PDF sintético não alcançou o tamanho declarado."
  );
  const bytes = new Uint8Array(byteSize);
  bytes.set(prefix, 0);
  bytes.fill(0x20, prefix.byteLength, prefix.byteLength + fillerLength);
  bytes[prefix.byteLength + fillerLength] = 0x0a;
  bytes.set(trailer, xrefOffset);
  return {
    bytes,
    byteSize: bytes.byteLength,
    contentHash: createHash("sha256").update(bytes).digest("hex"),
    mediaType: "application/pdf"
  };
}

async function courseAction(
  fetchImpl,
  configuration,
  accessToken,
  name,
  body,
  { attempts = 2 } = {}
) {
  const label = `Course API/${name}`;
  let lastStatus = 0;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let response;
    try {
      response = await fetchSafely(
        fetchImpl,
        `${configuration.projectUrl}/functions/v1/aralearn-course-api/app/${
          encodeURIComponent(name)
        }`,
        {
          method: "POST",
          headers: applicationHeaders(configuration, accessToken),
          body: JSON.stringify(body)
        },
        label
      );
    } catch (error) {
      if (attempt + 1 < attempts) continue;
      throw error;
    }
    lastStatus = response.status;
    const payload = await parseJson(response, label);
    if (response.status === 200) {
      ensure(payload?.ok === true, `${label} não confirmou a operação.`);
      return jsonObject(payload.data, `${label} não devolveu dados válidos.`);
    }
    const edgeCode = text(response.headers.get("sb-error-code"));
    const applicationCode = text(payload?.error?.code || payload?.code);
    if (
      attempt + 1 < attempts &&
      TRANSIENT_EDGE_STATUSES.has(response.status) &&
      !edgeCode && !applicationCode
    ) continue;
    throw sanitizedStatusError(label, response.status);
  }
  throw sanitizedStatusError(label, lastStatus);
}

async function provisionApplicationSession({
  configuration,
  fetchImpl,
  createId,
  createBytes,
  lifecycle
}) {
  const runId = validateUuid(createId(), "A execução não gerou identidade válida.");
  const passwordMaterial = Buffer.from(createBytes(24)).toString("base64url");
  ensure(passwordMaterial.length >= 24, "A senha efêmera não recebeu entropia suficiente.");
  const password = `Ara!${passwordMaterial}9a`;
  const email = `course-pdf-smoke-${runId.replaceAll("-", "")}@aralearn.local`;
  const { payload: createdUser } = await requestJson(
    fetchImpl,
    `${configuration.projectUrl}/auth/v1/admin/users`,
    {
      method: "POST",
      headers: supabaseServerHeaders(configuration.serverApiKey),
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { test: "course-source-pdf-hosted-smoke" }
      })
    },
    "Criação da conta efêmera",
    [200, 201]
  );
  lifecycle.userId = validateUuid(
    createdUser?.id,
    "A criação da conta efêmera não devolveu identidade válida."
  );

  const { payload: session } = await requestJson(
    fetchImpl,
    `${configuration.projectUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: configuration.publishableKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    },
    "Login da conta efêmera"
  );
  ensure(
    validateUuid(session?.user?.id, "O login não devolveu identidade válida.") ===
      lifecycle.userId,
    "O login não corresponde à conta efêmera."
  );
  const accessToken = text(session?.access_token);
  ensure(JWT_PATTERN.test(accessToken), "O login não devolveu uma sessão JWT válida.");
  lifecycle.accessToken = accessToken;
}

async function executePdfFlow({
  configuration,
  fetchImpl,
  createId,
  lifecycle
}) {
  const created = await courseAction(
    fetchImpl,
    configuration,
    lifecycle.accessToken,
    "criarCurso",
    {
      requestId: validateUuid(createId(), "A criação do Curso não recebeu requestId válido."),
      title: "Curso efêmero do smoke PDF hospedado",
      objective: "Validar o upload autenticado e o download assinado de uma Fonte."
    }
  );
  lifecycle.courseId = validateUuid(
    created.courseId,
    "A criação do Curso não devolveu identidade válida."
  );
  ensure(
    created.revision === 1 && created.ownership === "owned",
    "A criação do Curso não devolveu o estado inicial esperado."
  );

  const sourceId = "source-hosted-pdf-smoke";
  const savedSource = await courseAction(
    fetchImpl,
    configuration,
    lifecycle.accessToken,
    "alterarCurso",
    {
      requestId: validateUuid(createId(), "A Fonte não recebeu requestId válido."),
      courseId: lifecycle.courseId,
      expectedRevision: 1,
      operation: "update_course_sources",
      sourceCommand: {
        type: "save_source",
        sourceId,
        expectedSourceRevision: 0,
        source: {
          kind: "web_page",
          title: "Fonte efêmera do smoke PDF hospedado",
          authorship: "AraLearn",
          publicationDate: "2026-08-21",
          identifier: null,
          language: "pt-BR",
          citationText: "AraLearn. Fonte efêmera do smoke PDF hospedado, 2026.",
          url: "https://example.test/aralearn/hosted-pdf-smoke",
          editionOrVersion: "2026-08-21",
          origin: "external",
          availability: "open_access",
          verificationStatus: "author_verified",
          studyVisibility: "citation_and_link"
        }
      }
    }
  );
  ensure(
    savedSource.courseId === lifecycle.courseId &&
      savedSource.courseRevision === 2 && savedSource.changed === true &&
      savedSource.change?.type === "save_source" &&
      savedSource.change?.subjectId === sourceId &&
      savedSource.change?.revision === 1,
    "A Fonte efêmera não foi persistida na revisão esperada."
  );

  const pdf = createHostedPdfFixture();
  const prepared = await courseAction(
    fetchImpl,
    configuration,
    lifecycle.accessToken,
    "lerCurso",
    {
      courseId: lifecycle.courseId,
      view: "course_source_attachment",
      attachmentOperation: "prepare_upload",
      expectedRevision: 2,
      sourceId,
      sourceRevision: 1,
      contentHash: pdf.contentHash,
      byteSize: pdf.byteSize,
      mediaType: pdf.mediaType
    }
  );
  const attachment = jsonObject(
    prepared.attachment,
    "A preparação do PDF não devolveu o descritor do anexo."
  );
  const expectedStoragePath = `${lifecycle.courseId}/${pdf.contentHash}.pdf`;
  ensure(
    prepared.contract === "aralearn.course-source-attachment-access.v2" &&
      prepared.courseId === lifecycle.courseId &&
      prepared.operation === "prepare_upload" &&
      prepared.courseRevision === 2 &&
      prepared.sourceId === sourceId && prepared.sourceRevision === 1 &&
      prepared.storageOriginCourseId === lifecycle.courseId &&
      prepared.uploadRequired === true && prepared.alreadyLinked === false &&
      prepared.signedUrl === null && prepared.expiresAt === null &&
      attachment.contentHash === pdf.contentHash &&
      attachment.byteSize === pdf.byteSize &&
      attachment.mediaType === pdf.mediaType &&
      attachment.storagePath === expectedStoragePath &&
      COURSE_SOURCE_PDF_PATH_PATTERN.test(attachment.storagePath),
    "A preparação hospedada não respeitou o contrato de upload v2."
  );
  lifecycle.storagePaths.add(attachment.storagePath);

  const uploadResponse = await fetchSafely(
    fetchImpl,
    `${configuration.projectUrl}/storage/v1/object/${COURSE_SOURCE_PDF_BUCKET}/${
      attachment.storagePath
    }`,
    {
      method: "POST",
      headers: {
        apikey: configuration.publishableKey,
        Authorization: `Bearer ${lifecycle.accessToken}`,
        "Content-Type": pdf.mediaType,
        "cache-control": "max-age=3600",
        "x-upsert": "false"
      },
      body: pdf.bytes
    },
    "Upload autenticado do PDF"
  );
  await parseJson(uploadResponse, "Upload autenticado do PDF");
  ensure(uploadResponse.ok, sanitizedStatusError(
    "Upload autenticado do PDF",
    uploadResponse.status
  ).message);

  const attached = await courseAction(
    fetchImpl,
    configuration,
    lifecycle.accessToken,
    "alterarCurso",
    {
      requestId: validateUuid(createId(), "O vínculo do PDF não recebeu requestId válido."),
      courseId: lifecycle.courseId,
      expectedRevision: 2,
      operation: "update_course_sources",
      sourceCommand: {
        type: "attach_pdf",
        sourceId,
        sourceRevision: 1,
        attachment
      }
    }
  );
  ensure(
    attached.courseId === lifecycle.courseId &&
      attached.changed === true && attached.courseRevision === 3 &&
      attached.change?.type === "attach_pdf" &&
      attached.change?.subjectId === sourceId && attached.change?.revision === 1,
    "O PDF não foi vinculado à Fonte na revisão esperada."
  );

  const download = await courseAction(
    fetchImpl,
    configuration,
    lifecycle.accessToken,
    "lerCurso",
    {
      courseId: lifecycle.courseId,
      view: "course_source_attachment",
      attachmentOperation: "download",
      expectedRevision: 3,
      sourceId,
      sourceRevision: 1,
      contentHash: pdf.contentHash
    }
  );
  ensure(
    download.contract === "aralearn.course-source-attachment-access.v1" &&
      download.courseId === lifecycle.courseId &&
      download.operation === "download" && download.courseRevision === 3 &&
      download.sourceId === sourceId && download.sourceRevision === 1 &&
      download.storageOriginCourseId === lifecycle.courseId &&
      download.alreadyLinked === true &&
      download.attachment?.contentHash === pdf.contentHash &&
      download.attachment?.byteSize === pdf.byteSize &&
      download.attachment?.mediaType === pdf.mediaType &&
      download.attachment?.storagePath === expectedStoragePath,
    "O download hospedado não respeitou o contrato transitório v1."
  );
  let signedUrl;
  try {
    signedUrl = new URL(text(download.signedUrl));
  } catch {
    throw new Error("O download hospedado não devolveu URL assinada válida.");
  }
  ensure(
    signedUrl.protocol === "https:" && signedUrl.origin === configuration.projectUrl &&
      signedUrl.pathname.startsWith(
        `/storage/v1/object/sign/${COURSE_SOURCE_PDF_BUCKET}/`
      ) && signedUrl.searchParams.has("token") &&
      signedUrl.searchParams.has("download"),
    "A URL assinada não pertence ao Storage hospedado esperado."
  );
  const signedResponse = await fetchSafely(
    fetchImpl,
    signedUrl,
    { headers: { Accept: "application/pdf" } },
    "Download assinado do PDF"
  );
  ensure(
    signedResponse.ok,
    sanitizedStatusError("Download assinado do PDF", signedResponse.status).message
  );
  const downloadedBytes = new Uint8Array(await signedResponse.arrayBuffer());
  ensure(
    Buffer.from(downloadedBytes).equals(Buffer.from(pdf.bytes)),
    "O download assinado não devolveu os bytes enviados."
  );
}

async function deleteAccountThroughApplication({ configuration, fetchImpl, lifecycle }) {
  if (!lifecycle.accessToken || lifecycle.accountDeleted) return;
  const deleted = await courseAction(
    fetchImpl,
    configuration,
    lifecycle.accessToken,
    "excluirMinhaConta",
    { confirmation: "EXCLUIR MINHA CONTA" },
    { attempts: 3 }
  );
  ensure(
    deleted.contract === "aralearn.account-deletion.v1" &&
      deleted.status === "deleted",
    "A exclusão integral da conta efêmera não foi confirmada."
  );
  lifecycle.accountDeleted = true;
}

export function inspectHostedCourseSourcePdfResiduals({
  configuration,
  lifecycle,
  executeSupabase = runSupabase
}) {
  const projectRef = text(configuration?.projectRef);
  ensure(/^[a-z0-9]{20}$/u.test(projectRef), "O project ref do inventário é inválido.");
  const courseId = lifecycle?.courseId
    ? validateUuid(lifecycle.courseId, "O Curso do inventário é inválido.")
    : "00000000-0000-4000-8000-000000000000";
  const userId = lifecycle?.userId
    ? validateUuid(lifecycle.userId, "A conta do inventário é inválida.")
    : "00000000-0000-4000-8000-000000000000";
  const query = `
select jsonb_build_object(
  'courseCount', (select count(*) from public.courses where id = '${courseId}'::uuid),
  'objectCount', (
    select count(*) from storage.objects
    where bucket_id = '${COURSE_SOURCE_PDF_BUCKET}'
      and name like '${courseId}/%'
  ),
  'userCount', (select count(*) from auth.users where id = '${userId}'::uuid)
) as residuals;
`;
  let result;
  try {
    result = JSON.parse(executeSupabase(
      ["db", "query", "--linked", "--project-ref", projectRef, "--output", "json"],
      { input: query }
    ));
  } catch {
    throw new Error("O banco hospedado não forneceu o inventário do smoke PDF.");
  }
  const counts = result?.rows?.[0]?.residuals;
  ensure(
    counts && [counts.courseCount, counts.objectCount, counts.userCount].every(
      (value) => Number.isSafeInteger(value) && value >= 0
    ),
    "O banco hospedado devolveu um inventário inválido."
  );
  return {
    course: counts.courseCount !== 0,
    object: counts.objectCount !== 0,
    user: counts.userCount !== 0
  };
}

async function administrativeFallbackCleanup({ configuration, fetchImpl, lifecycle }) {
  const failures = [];
  if (lifecycle.storagePaths.size) {
    try {
      await requestJson(
        fetchImpl,
        `${configuration.projectUrl}/storage/v1/object/${COURSE_SOURCE_PDF_BUCKET}`,
        {
          method: "DELETE",
          headers: supabaseServerHeaders(configuration.serverApiKey),
          body: JSON.stringify({ prefixes: [...lifecycle.storagePaths] })
        },
        "Limpeza administrativa dos PDFs efêmeros",
        [200, 404]
      );
    } catch (error) {
      failures.push(error);
    }
  }
  if (lifecycle.userId) {
    try {
      await requestJson(
        fetchImpl,
        `${configuration.projectUrl}/auth/v1/admin/users/${
          encodeURIComponent(lifecycle.userId)
        }`,
        {
          method: "DELETE",
          headers: supabaseServerHeaders(configuration.serverApiKey, { contentType: false })
        },
        "Limpeza administrativa da conta efêmera",
        [200, 204, 404]
      );
    } catch (error) {
      failures.push(error);
    }
  }
  return failures;
}

async function cleanupAndVerify({
  configuration,
  fetchImpl,
  inspectResiduals,
  lifecycle
}) {
  const failures = [];
  try {
    await deleteAccountThroughApplication({ configuration, fetchImpl, lifecycle });
  } catch (error) {
    failures.push(error);
  }

  let residuals;
  try {
    residuals = await inspectResiduals({ configuration, lifecycle });
  } catch (error) {
    failures.push(error);
    residuals = { course: true, object: true, user: true };
  }

  if (failures.length || Object.values(residuals).some(Boolean)) {
    if (Object.values(residuals).some(Boolean)) {
      failures.push(new Error("A limpeza normal deixou resíduo hospedado."));
    }
    failures.push(...await administrativeFallbackCleanup({
      configuration,
      fetchImpl,
      lifecycle
    }));
    try {
      const finalResiduals = await inspectResiduals({ configuration, lifecycle });
      if (Object.values(finalResiduals).some(Boolean)) {
        failures.push(new Error("A limpeza de recuperação deixou resíduo hospedado."));
      }
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) {
    throw new AggregateError(failures, "A limpeza hospedada do smoke PDF falhou.");
  }
}

export async function runHostedCourseSourcePdfSmoke({
  environment = process.env,
  fetchImpl = globalThis.fetch,
  createId = randomUUID,
  createBytes = randomBytes,
  inspectResiduals = inspectHostedCourseSourcePdfResiduals
} = {}) {
  ensure(typeof fetchImpl === "function", "fetch não está disponível para o smoke hospedado.");
  ensure(typeof createId === "function", "O gerador de identidades do smoke é inválido.");
  ensure(typeof createBytes === "function", "O gerador criptográfico do smoke é inválido.");
  ensure(typeof inspectResiduals === "function", "O inventário hospedado é inválido.");
  const configuration = normalizeHostedEnvironment(environment);
  const lifecycle = {
    accessToken: null,
    accountDeleted: false,
    courseId: null,
    storagePaths: new Set(),
    userId: null
  };
  let primaryFailure = null;
  try {
    await provisionApplicationSession({
      configuration,
      fetchImpl,
      createId,
      createBytes,
      lifecycle
    });
    await executePdfFlow({
      configuration,
      fetchImpl,
      createId,
      lifecycle
    });
  } catch (error) {
    primaryFailure = error;
  }

  let cleanupFailure = null;
  try {
    await cleanupAndVerify({ configuration, fetchImpl, inspectResiduals, lifecycle });
  } catch (error) {
    cleanupFailure = error;
  }
  if (primaryFailure && cleanupFailure) {
    throw new AggregateError(
      [primaryFailure, cleanupFailure],
      "O smoke PDF hospedado e sua limpeza falharam."
    );
  }
  if (primaryFailure) throw primaryFailure;
  if (cleanupFailure) throw cleanupFailure;
  return Object.freeze({
    contract: HOSTED_COURSE_SOURCE_PDF_SMOKE_CONTRACT,
    cleanup: Object.freeze({ courseCount: 0, objectCount: 0, userCount: 0 }),
    downloadContract: "aralearn.course-source-attachment-access.v1",
    uploadContract: "aralearn.course-source-attachment-access.v2"
  });
}

function runSupabase(argumentsValue, { input } = {}) {
  const windows = process.platform === "win32";
  try {
    return execFileSync(
      windows ? (process.env.ComSpec || "cmd.exe") : "npx",
      windows
        ? [
            "/d", "/s", "/c",
            `npx --yes supabase@${SUPABASE_CLI_VERSION} ${argumentsValue.join(" ")}`
          ]
        : ["--yes", `supabase@${SUPABASE_CLI_VERSION}`, ...argumentsValue],
      {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8",
        input,
        stdio: ["pipe", "pipe", "pipe"]
      }
    );
  } catch {
    throw new Error("O Supabase CLI não forneceu a configuração hospedada do smoke PDF.");
  }
}

export async function readHostedCourseSourcePdfEnvironment(environment = process.env) {
  const configuredRef = text(environment.ARALEARN_SUPABASE_PROJECT_REF);
  let projectRef = configuredRef;
  if (!projectRef) {
    try {
      projectRef = text(await readFile(
        path.join(REPOSITORY_ROOT, "supabase", ".temp", "project-ref"),
        "utf8"
      ));
    } catch {
      throw new Error("O project ref hospedado não está configurado para o smoke PDF.");
    }
  }
  ensure(/^[a-z0-9]{20}$/u.test(projectRef), "O project ref hospedado é inválido.");
  let keys;
  try {
    keys = JSON.parse(runSupabase([
      "projects", "api-keys", "--project-ref", projectRef, "--output", "json"
    ]));
  } catch {
    throw new Error("As chaves hospedadas não puderam ser lidas para o smoke PDF.");
  }
  ensure(Array.isArray(keys), "A lista de chaves hospedadas é inválida.");
  const secret = text(keys.find((entry) => entry?.type === "secret")?.api_key);
  const publishable = text(
    keys.find((entry) => entry?.type === "publishable")?.api_key
  );
  ensure(secret.startsWith("sb_secret_"), "A chave secreta hospedada está indisponível.");
  ensure(
    publishable.startsWith("sb_publishable_"),
    "A chave publicável hospedada está indisponível."
  );
  return {
    SUPABASE_URL: `https://${projectRef}.supabase.co`,
    SUPABASE_SECRET_KEY: secret,
    SUPABASE_PUBLISHABLE_KEY: publishable
  };
}

const entryPoint = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entryPoint === fileURLToPath(import.meta.url)) {
  const environment = await readHostedCourseSourcePdfEnvironment();
  await runHostedCourseSourcePdfSmoke({ environment });
  console.log("Smoke PDF hospedado: upload v2, download v1 e limpeza integral aprovados.");
}
