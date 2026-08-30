import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUTHORING_PROTOCOL_ID,
  AUTHORING_PROTOCOL_SCHEMA_VERSION,
  AUTHORING_PROTOCOL_V1_SCHEMA_HASH
} from "../supabase/functions/_shared/aralearn-authoring/authoringProtocolV1.js";
import {
  AUTHORING_CONVERSATIONAL_PROJECTION_HEADER,
  AUTHORING_CONVERSATIONAL_PROJECTION_METADATA
} from "../supabase/functions/_shared/aralearn-authoring/conversationalPdfSourceProjection.js";
import {
  AUTHORING_MCP_CATALOG_HEADER,
  AUTHORING_MCP_CATALOG_METADATA
} from "../supabase/functions/_shared/aralearn-authoring/courseMcpTools.js";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MANIFEST_PATH = path.resolve(SCRIPT_DIRECTORY, "../supabase/runtime-manifest.json");
const REQUEST_TIMEOUT_MS = 20_000;
const MCP_PATH = "/functions/v1/aralearn-authoring-mcp";
const ACTION_PATH = "/functions/v1/aralearn-authoring-action";
const ACTION_ORIGIN = "https://chatgpt.com";
const AUTHORING_CONTRACT_HEADER_NAME = "X-AraLearn-Authoring-Contract";
const AUTHORING_PROJECTION_HEADER_NAME = "X-AraLearn-Authoring-Projection";
const AUTHORING_MCP_CATALOG_HEADER_NAME = "X-AraLearn-Authoring-Mcp-Catalog";
const SUPPORTED_JWT_KEYS = new Set(["EC:ES256:P-256"]);
export const EXPECTED_AUTHORING_CONTRACT_HEADER = [
  AUTHORING_PROTOCOL_ID,
  `version=${AUTHORING_PROTOCOL_SCHEMA_VERSION}`,
  `hash=${AUTHORING_PROTOCOL_V1_SCHEMA_HASH}`
].join("; ");

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
  const actualFeatureList = Array.isArray(actual.features) ? actual.features : [];
  if (actualFeatureList.some((feature) => typeof feature !== "string" || !feature) ||
      new Set(actualFeatureList).size !== actualFeatureList.length) {
    throw new Error("O banco devolveu uma lista de recursos inválida.");
  }
  const actualFeatures = new Set(actualFeatureList);
  const expectedFeatures = new Set(expected.requiredFeatures);
  const missingFeatures = expected.requiredFeatures.filter((feature) => !actualFeatures.has(feature));
  const unexpectedFeatures = actualFeatureList.filter((feature) => !expectedFeatures.has(feature));
  if (missingFeatures.length || unexpectedFeatures.length) {
    const details = [
      missingFeatures.length ? `ausentes: ${missingFeatures.join(", ")}` : "",
      unexpectedFeatures.length ? `inesperados: ${unexpectedFeatures.join(", ")}` : ""
    ].filter(Boolean).join("; ");
    throw new Error(`O manifesto remoto diverge do runtime corrente (${details}).`);
  }
  return {
    schemaRevision: expected.schemaRevision,
    contractVersion: expected.contractVersion,
    features: [...actualFeatures].sort()
  };
}

export function validateHostedOAuthBoundary({ projectUrl, jwks, metadata }) {
  const keys = Array.isArray(jwks?.keys) ? jwks.keys : [];
  const algorithms = [...new Set(keys.filter((key) => {
    const signature = `${key?.kty || ""}:${key?.alg || ""}:${key?.crv || ""}`;
    return SUPPORTED_JWT_KEYS.has(signature) && typeof key?.kid === "string" && key.kid &&
      (key.use == null || key.use === "sig") &&
      (key.key_ops == null || (Array.isArray(key.key_ops) && key.key_ops.includes("verify")));
  }).map(({ alg }) => alg))].sort();
  if (keys.length < 1 || keys.length > 16 || algorithms.length < 1) {
    throw new Error("O Auth hospedado não anuncia uma chave assimétrica compatível para o MCP.");
  }
  const resource = `${projectUrl}${MCP_PATH}`;
  if (metadata?.resource !== resource ||
      !Array.isArray(metadata?.authorization_servers) ||
      metadata.authorization_servers.length !== 1 ||
      metadata.authorization_servers[0] !== `${projectUrl}/auth/v1` ||
      !Array.isArray(metadata?.scopes_supported) ||
      metadata.scopes_supported.length !== 1 ||
      metadata.scopes_supported[0] !== "offline_access") {
    throw new Error("O MCP hospedado não anuncia a fronteira OAuth protegida corrente.");
  }
  return { algorithms, resource, scope: "offline_access" };
}

async function responseJson(response, label) {
  const source = await response.text();
  const payload = parseJsonOrNull(source);
  if (!response.ok || !payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`${label} falhou (HTTP ${response.status}).`);
  }
  return payload;
}

function validateHostedAuthoringContract(response, label, { requireMcpCatalog = false } = {}) {
  if (!response.ok) {
    throw new Error(`${label} falhou (HTTP ${response.status}).`);
  }
  if (response.headers.get(AUTHORING_CONTRACT_HEADER_NAME) !==
      EXPECTED_AUTHORING_CONTRACT_HEADER) {
    throw new Error(`${label} não corresponde ao contrato público corrente da Autoria.`);
  }
  if (response.headers.get(AUTHORING_PROJECTION_HEADER_NAME) !==
      AUTHORING_CONVERSATIONAL_PROJECTION_HEADER) {
    throw new Error(`${label} não corresponde à projeção conversacional corrente.`);
  }
  if (requireMcpCatalog &&
      response.headers.get(AUTHORING_MCP_CATALOG_HEADER_NAME) !==
        AUTHORING_MCP_CATALOG_HEADER) {
    throw new Error(`${label} não corresponde ao catálogo MCP projetado corrente.`);
  }
}

export async function verifyHostedBackend({
  projectUrl,
  publishableKey,
  manifestPath = DEFAULT_MANIFEST_PATH,
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
  const runtime = compareRuntimeManifest(expected, payload);
  const [jwksResponse, metadataResponse, actionPreflightResponse] = await Promise.all([
    fetchImpl(`${publicConfiguration.projectUrl}/auth/v1/.well-known/jwks.json`, {
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    }),
    fetchImpl(`${publicConfiguration.projectUrl}${MCP_PATH}/.well-known/oauth-protected-resource`, {
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    }),
    fetchImpl(`${publicConfiguration.projectUrl}${ACTION_PATH}/listarCursos`, {
      method: "OPTIONS",
      headers: {
        Origin: ACTION_ORIGIN,
        "Access-Control-Request-Method": "POST"
      },
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
  ]);
  validateHostedAuthoringContract(metadataResponse, "O MCP hospedado", {
    requireMcpCatalog: true
  });
  validateHostedAuthoringContract(actionPreflightResponse, "A Action hospedada");
  const oauth = validateHostedOAuthBoundary({
    projectUrl: publicConfiguration.projectUrl,
    jwks: await responseJson(jwksResponse, "A leitura do JWKS hospedado"),
    metadata: await responseJson(metadataResponse, "A leitura da metadata OAuth do MCP")
  });
  return {
    ...runtime,
    oauth,
    authoringContract: {
      id: AUTHORING_PROTOCOL_ID,
      version: AUTHORING_PROTOCOL_SCHEMA_VERSION,
      hash: AUTHORING_PROTOCOL_V1_SCHEMA_HASH
    },
    conversationalProjection: AUTHORING_CONVERSATIONAL_PROJECTION_METADATA,
    mcpCatalog: AUTHORING_MCP_CATALOG_METADATA
  };
}

async function main() {
  const result = await verifyHostedBackend({
    projectUrl: process.env.ARALEARN_SUPABASE_URL,
    publishableKey: process.env.ARALEARN_SUPABASE_PUBLISHABLE_KEY
  });
  process.stdout.write(
    `Backend compatível: revisão ${result.schemaRevision}, biblioteca v${result.contractVersion}.\n`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
