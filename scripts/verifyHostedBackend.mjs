import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MANIFEST_PATH = path.resolve(SCRIPT_DIRECTORY, "../supabase/runtime-manifest.json");
const REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_BROWSER_ORIGIN = "https://fabio-ara.github.io";
const CORS_PROBE_COURSE_ID = "00000000-0000-4000-8000-000000000000";
const CORS_PROBE_REVISION_HASH = "0".repeat(64);

function requiredText(value, label) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error(`${label} não foi informado.`);
  return normalized;
}

function decodeJwtPayload(token) {
  const segments = String(token || "").split(".");
  if (segments.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function parseJsonOrNull(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export function validatePublicProjectConfiguration({ projectUrl, publishableKey }) {
  const normalizedUrl = requiredText(projectUrl, "ARALEARN_SUPABASE_URL").replace(/\/+$/, "");
  let parsedUrl;
  try {
    parsedUrl = new URL(normalizedUrl);
  } catch {
    throw new Error("ARALEARN_SUPABASE_URL não é uma URL válida.");
  }
  if (parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash) {
    throw new Error("ARALEARN_SUPABASE_URL deve ser uma origem HTTPS sem credenciais, consulta ou fragmento.");
  }

  const normalizedKey = requiredText(publishableKey, "ARALEARN_SUPABASE_PUBLISHABLE_KEY");
  const jwtPayload = decodeJwtPayload(normalizedKey);
  if (
    normalizedKey.startsWith("sb_secret_") ||
    jwtPayload?.role === "service_role" ||
    jwtPayload?.role === "supabase_admin"
  ) {
    throw new Error("A verificação aceita somente a publishable key; uma chave administrativa foi recusada.");
  }
  return { projectUrl: normalizedUrl, publishableKey: normalizedKey };
}

export async function readExpectedRuntimeManifest(manifestPath = DEFAULT_MANIFEST_PATH) {
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  if (!/^\d{14}$/.test(String(manifest?.schemaRevision || ""))) {
    throw new Error("supabase/runtime-manifest.json contém schemaRevision inválida.");
  }
  if (!Number.isInteger(manifest?.contractVersion) || manifest.contractVersion < 1) {
    throw new Error("supabase/runtime-manifest.json contém contractVersion inválida.");
  }
  if (!Array.isArray(manifest?.requiredFeatures) || manifest.requiredFeatures.some((item) => typeof item !== "string" || !item)) {
    throw new Error("supabase/runtime-manifest.json contém requiredFeatures inválido.");
  }
  return manifest;
}

export function compareRuntimeManifest(expected, actual) {
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
    throw new Error("O banco devolveu um manifesto de runtime inválido.");
  }
  if (String(actual.schemaRevision || "") !== expected.schemaRevision) {
    throw new Error(
      `O banco está na revisão ${actual.schemaRevision || "desconhecida"}; a aplicação exige ${expected.schemaRevision}. ` +
      "Aplique as migrations antes de publicar o site."
    );
  }
  if (Number(actual.contractVersion) !== expected.contractVersion) {
    throw new Error(
      `O banco informa contrato v${actual.contractVersion || "desconhecido"}; a aplicação exige v${expected.contractVersion}.`
    );
  }
  const actualFeatures = new Set(Array.isArray(actual.features) ? actual.features : []);
  const missingFeatures = expected.requiredFeatures.filter((feature) => !actualFeatures.has(feature));
  if (missingFeatures.length) {
    throw new Error(`O banco não anuncia os recursos exigidos: ${missingFeatures.join(", ")}.`);
  }
  return {
    schemaRevision: expected.schemaRevision,
    contractVersion: expected.contractVersion,
    features: [...actualFeatures].sort()
  };
}

export async function verifyCourseRevisionCors({
  projectUrl,
  publishableKey,
  browserOrigin = DEFAULT_BROWSER_ORIGIN,
  fetchImpl = globalThis.fetch
}) {
  const normalizedOrigin = requiredText(browserOrigin, "a origem pública do navegador").replace(/\/+$/, "");
  const parsedOrigin = new URL(normalizedOrigin);
  if (
    parsedOrigin.protocol !== "https:" ||
    parsedOrigin.username ||
    parsedOrigin.password ||
    parsedOrigin.pathname !== "/" ||
    parsedOrigin.search ||
    parsedOrigin.hash
  ) {
    throw new Error("A origem pública do navegador deve ser uma origem HTTPS exata.");
  }
  const response = await fetchImpl(
    `${projectUrl}/functions/v1/aralearn-course-revisions/${CORS_PROBE_COURSE_ID}/${CORS_PROBE_REVISION_HASH}`,
    {
      method: "OPTIONS",
      headers: {
        apikey: publishableKey,
        Origin: normalizedOrigin,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "apikey, authorization"
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    }
  );
  const allowedOrigin = response.headers?.get?.("access-control-allow-origin");
  const allowedMethods = String(response.headers?.get?.("access-control-allow-methods") || "")
    .toUpperCase()
    .split(",")
    .map((value) => value.trim());
  const allowedHeaders = String(response.headers?.get?.("access-control-allow-headers") || "")
    .toLowerCase()
    .split(",")
    .map((value) => value.trim());
  if (
    !response.ok ||
    allowedOrigin !== normalizedOrigin ||
    !allowedMethods.includes("GET") ||
    !allowedHeaders.includes("apikey") ||
    !allowedHeaders.includes("authorization")
  ) {
    throw new Error(
      "A Edge Function de revisões não permite que o site público baixe cursos. " +
      "Implante aralearn-course-revisions com o CORS esperado antes de publicar."
    );
  }
  return true;
}

export async function verifyHostedBackend({
  projectUrl,
  publishableKey,
  manifestPath = DEFAULT_MANIFEST_PATH,
  browserOrigin = DEFAULT_BROWSER_ORIGIN,
  fetchImpl = globalThis.fetch
}) {
  if (typeof fetchImpl !== "function") throw new Error("fetch indisponível neste ambiente.");
  const publicConfiguration = validatePublicProjectConfiguration({ projectUrl, publishableKey });
  const expected = await readExpectedRuntimeManifest(manifestPath);
  const response = await fetchImpl(
    `${publicConfiguration.projectUrl}/rest/v1/rpc/get_aralearn_runtime_manifest`,
    {
      method: "POST",
      headers: {
        apikey: publicConfiguration.publishableKey,
        "Content-Type": "application/json"
      },
      body: "{}",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    }
  );
  const text = await response.text();
  const payload = parseJsonOrNull(text);
  if (!response.ok) {
    const missingFunction = response.status === 404 || payload?.code === "PGRST202";
    throw new Error(
      missingFunction
        ? "O banco ainda não possui get_aralearn_runtime_manifest. Aplique as migrations antes de publicar o site."
        : `A verificação do banco falhou (HTTP ${response.status}).`
    );
  }
  const manifest = compareRuntimeManifest(expected, payload);
  await verifyCourseRevisionCors({
    ...publicConfiguration,
    browserOrigin,
    fetchImpl
  });
  return { ...manifest, courseRevisionCors: true };
}

async function main() {
  const result = await verifyHostedBackend({
    projectUrl: process.env.ARALEARN_SUPABASE_URL,
    publishableKey: process.env.ARALEARN_SUPABASE_PUBLISHABLE_KEY
  });
  process.stdout.write(
    `Backend compatível: revisão ${result.schemaRevision}, contrato v${result.contractVersion}, CORS de revisões aprovado.\n`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
