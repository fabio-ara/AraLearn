import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import {
  resolveSupabaseAdministrativeEnvironment,
  supabaseServerHeaders
} from "../supabase/functions/_shared/aralearn-authoring/supabaseEnvironment.js";

const ALLOWED_ROLES = new Set(["owner", "catalog_publisher", "author", "reviewer"]);
function requireValue(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${label} é obrigatório.`);
  return normalized;
}
export function readAdministrationConfiguration(environment = process.env) {
  const configuration = resolveSupabaseAdministrativeEnvironment(environment);
  const parsed = new URL(configuration.supabaseUrl);
  if (parsed.protocol !== "https:" && !configuration.local) {
    throw new Error("A URL administrativa deve usar HTTPS fora do ambiente local.");
  }
  return {
    projectUrl: configuration.supabaseUrl,
    serverApiKey: configuration.serverApiKey
  };
}

async function readResponse(response) {
  const source = await response.text();
  if (!source) return null;
  try {
    return JSON.parse(source);
  } catch {
    return source;
  }
}

async function requestJson(url, options, { fetchImpl = globalThis.fetch, label = "Requisição" } = {}) {
  const response = await fetchImpl(url, options);
  const body = await readResponse(response);
  if (!response.ok) {
    const message = body?.message || body?.msg || body?.error_description || body?.error || body;
    throw new Error(`${label} falhou (HTTP ${response.status}): ${message || "sem detalhes"}`);
  }
  return body;
}

export async function findUserByEmail(email, configuration, { fetchImpl = globalThis.fetch } = {}) {
  const expectedEmail = requireValue(email, "E-mail").toLocaleLowerCase("en-US");
  for (let page = 1; page <= 100; page += 1) {
    const body = await requestJson(
      `${configuration.projectUrl}/auth/v1/admin/users?page=${page}&per_page=1000`,
      { method: "GET", headers: supabaseServerHeaders(configuration.serverApiKey) },
      { fetchImpl, label: "Consulta de usuários" }
    );
    const users = Array.isArray(body?.users) ? body.users : [];
    const matches = users.filter((user) =>
      String(user?.email || "").trim().toLocaleLowerCase("en-US") === expectedEmail
    );
    if (matches.length > 1) throw new Error("Mais de uma conta corresponde ao e-mail informado.");
    if (matches.length === 1) return matches[0];
    if (users.length < 1000) break;
  }
  throw new Error("Conta não encontrada. Ela precisa concluir o cadastro antes de receber um papel.");
}

export async function callAdministrationRpc(functionName, payload, configuration, {
  fetchImpl = globalThis.fetch
} = {}) {
  return requestJson(
    `${configuration.projectUrl}/rest/v1/rpc/${functionName}`,
    {
      method: "POST",
      headers: supabaseServerHeaders(configuration.serverApiKey),
      body: JSON.stringify(payload)
    },
    { fetchImpl, label: functionName }
  );
}

function normalizeRole(role) {
  const normalized = requireValue(role, "Papel");
  if (!ALLOWED_ROLES.has(normalized)) {
    throw new Error(`Papel inválido: ${normalized}.`);
  }
  return normalized;
}

export async function runAuthoringAccessCommand(command, values, {
  environment = process.env,
  fetchImpl = globalThis.fetch,
  write = console.log
} = {}) {
  const configuration = readAdministrationConfiguration(environment);
  const user = async (email) => findUserByEmail(email, configuration, { fetchImpl });
  const rpc = (name, payload) => callAdministrationRpc(name, payload, configuration, { fetchImpl });

  if (command === "bootstrap-owner") {
    const target = await user(values.email);
    const result = await rpc("set_app_role", {
      p_actor_user_id: null,
      p_target_user_id: target.id,
      p_role: "owner",
      p_active: true,
      p_reason: values.reason || "Proprietário inicial"
    });
    write(`Proprietário inicial atribuído a ${target.email}.`);
    return result;
  }

  if (command === "grant-role" || command === "revoke-role") {
    const [actor, target] = await Promise.all([user(values["actor-email"]), user(values.email)]);
    const role = normalizeRole(values.role);
    const active = command === "grant-role";
    const result = await rpc("set_app_role", {
      p_actor_user_id: actor.id,
      p_target_user_id: target.id,
      p_role: role,
      p_active: active,
      p_reason: values.reason || null
    });
    write(`${active ? "Papel atribuído" : "Papel revogado"}: ${role} para ${target.email}.`);
    return result;
  }

  if (command === "list-roles") {
    const actor = await user(values["actor-email"]);
    const result = await rpc("list_app_role_assignments", { p_actor_user_id: actor.id });
    write(JSON.stringify(result, null, 2));
    return result;
  }

  throw new Error(`Comando desconhecido: ${command || "ausente"}.`);
}

function usage() {
  return [
    "Uso:",
    "  node scripts/manageAuthoringAccess.mjs bootstrap-owner --email <e-mail>",
    "  node scripts/manageAuthoringAccess.mjs grant-role --actor-email <e-mail> --email <e-mail> --role <papel>",
    "  node scripts/manageAuthoringAccess.mjs revoke-role --actor-email <e-mail> --email <e-mail> --role <papel>",
    "  node scripts/manageAuthoringAccess.mjs list-roles --actor-email <e-mail>"
  ].join("\n");
}

async function main() {
  const [command, ...argumentsList] = process.argv.slice(2);
  const { values } = parseArgs({
    args: argumentsList,
    options: {
      email: { type: "string" },
      "actor-email": { type: "string" },
      role: { type: "string" },
      reason: { type: "string" },
      help: { type: "boolean", short: "h" }
    },
    allowPositionals: false,
    strict: true
  });
  if (values.help || !command) {
    console.log(usage());
    return;
  }
  await runAuthoringAccessCommand(command, values);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
