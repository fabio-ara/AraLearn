import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  cleanupLocalMcpOAuthProvision,
  provisionHostedMcpOAuthToken
} from "./runLocalMcpOAuthSmoke.mjs";

const REPOSITORY_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const HOSTED_ORIGIN = "https://fabio-ara.github.io";

function runSupabase(argumentsValue) {
  const windows = process.platform === "win32";
  return execFileSync(
    windows ? (process.env.ComSpec || "cmd.exe") : "npx",
    windows
      ? ["/d", "/s", "/c", `npx --yes supabase@2.109.1 ${argumentsValue.join(" ")}`]
      : ["--yes", "supabase@2.109.1", ...argumentsValue],
    { cwd: REPOSITORY_ROOT, encoding: "utf8" }
  );
}

async function hostedEnvironment() {
  const projectRef = String(
    process.env.ARALEARN_SUPABASE_PROJECT_REF
    || await readFile(path.join(REPOSITORY_ROOT, "supabase", ".temp", "project-ref"), "utf8")
  ).trim();
  assert.match(projectRef, /^[a-z0-9]{20}$/u, "Project ref hospedado inválido.");

  let keys;
  try {
    keys = JSON.parse(runSupabase([
      "projects", "api-keys", "--project-ref", projectRef, "--reveal", "--output", "json"
    ]));
  } catch (error) {
    throw new Error(
      "Não foi possível obter chaves efêmeras pelo Supabase CLI autenticado.",
      { cause: error }
    );
  }
  const secret = keys.find((entry) => entry?.type === "secret")?.api_key;
  const publishable = keys.find((entry) => entry?.type === "publishable")?.api_key;
  assert.match(String(secret || ""), /^sb_secret_/u, "Chave secreta hospedada indisponível.");
  assert.match(String(publishable || ""), /^sb_publishable_/u, "Chave publicável hospedada indisponível.");

  return {
    SUPABASE_URL: `https://${projectRef}.supabase.co`,
    SUPABASE_SECRET_KEY: secret,
    SUPABASE_PUBLISHABLE_KEY: publishable
  };
}

async function executeHostedSmoke(accessToken, projectUrl) {
  const saved = Object.fromEntries([
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SERVICE_ROLE_KEY",
    "ARALEARN_AUTHORING_MCP_OAUTH_TOKEN",
    "ARALEARN_AUTHORING_MCP_ORIGIN",
    "ARALEARN_AUTHORING_MCP_EPHEMERAL_USER"
  ].map((name) => [name, process.env[name]]));
  try {
    process.env.SUPABASE_URL = projectUrl;
    process.env.ARALEARN_AUTHORING_MCP_OAUTH_TOKEN = accessToken;
    process.env.ARALEARN_AUTHORING_MCP_ORIGIN = HOSTED_ORIGIN;
    process.env.ARALEARN_AUTHORING_MCP_EPHEMERAL_USER = "1";
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SERVICE_ROLE_KEY;
    const smokeUrl = new URL("../supabase/tests/authoring-mcp-hosted-smoke.mjs", import.meta.url);
    smokeUrl.searchParams.set("run", randomUUID());
    await import(smokeUrl.href);
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

const environment = await hostedEnvironment();
const lifecycle = {};
let primaryFailure = null;
try {
  const provision = await provisionHostedMcpOAuthToken({
    environment,
    lifecycle
  });
  await executeHostedSmoke(provision.accessToken, provision.projectUrl);
} catch (error) {
  primaryFailure = error;
}

let cleanupFailure = null;
try {
  await cleanupLocalMcpOAuthProvision({ provision: lifecycle });
} catch (error) {
  cleanupFailure = error;
}
if (primaryFailure && cleanupFailure) {
  throw new AggregateError([primaryFailure, cleanupFailure], "O smoke hospedado e sua limpeza falharam.");
}
if (primaryFailure) throw primaryFailure;
if (cleanupFailure) throw cleanupFailure;

console.log("Smoke MCP hospedado: OAuth, autoria incremental e limpeza aprovados.");
