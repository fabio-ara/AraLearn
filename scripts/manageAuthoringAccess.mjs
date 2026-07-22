import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ALLOWED_ROLES = new Set(["owner", "catalog_publisher", "author", "reviewer"]);
const ALLOWED_SCOPES = new Set([
  "authoring:read",
  "authoring:write",
  "authoring:audit",
  "course:import",
  "catalog:publish",
  "roles:manage"
]);
const DEFAULT_CLIENT_SCOPES = Object.freeze([
  "authoring:read",
  "authoring:write",
  "authoring:audit",
  "catalog:publish"
]);

function requireValue(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${label} é obrigatório.`);
  return normalized;
}
export function readAdministrationConfiguration(environment = process.env) {
  const projectUrl = requireValue(
    environment.ARALEARN_SUPABASE_URL || environment.SUPABASE_URL,
    "ARALEARN_SUPABASE_URL"
  ).replace(/\/+$/u, "");
  const serviceRoleKey = requireValue(
    environment.SUPABASE_SERVICE_ROLE_KEY,
    "SUPABASE_SERVICE_ROLE_KEY"
  );
  const parsed = new URL(projectUrl);
  const localHost = new Set(["127.0.0.1", "localhost", "10.0.2.2"]).has(parsed.hostname);
  if (parsed.protocol !== "https:" && !(localHost && parsed.protocol === "http:")) {
    throw new Error("A URL administrativa deve usar HTTPS fora do ambiente local.");
  }
  return { projectUrl, serviceRoleKey };
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

function administrationHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json"
  };
}

export async function findUserByEmail(email, configuration, { fetchImpl = globalThis.fetch } = {}) {
  const expectedEmail = requireValue(email, "E-mail").toLocaleLowerCase("en-US");
  for (let page = 1; page <= 100; page += 1) {
    const body = await requestJson(
      `${configuration.projectUrl}/auth/v1/admin/users?page=${page}&per_page=1000`,
      { method: "GET", headers: administrationHeaders(configuration.serviceRoleKey) },
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
      headers: administrationHeaders(configuration.serviceRoleKey),
      body: JSON.stringify(payload)
    },
    { fetchImpl, label: functionName }
  );
}

export function generateAuthoringApiKey() {
  const secret = `arl_${randomBytes(36).toString("base64url")}`;
  return {
    secret,
    prefix: secret.slice(0, 16),
    hash: createHash("sha256").update(secret, "utf8").digest("hex")
  };
}

function normalizeRole(role) {
  const normalized = requireValue(role, "Papel");
  if (!ALLOWED_ROLES.has(normalized)) {
    throw new Error(`Papel inválido: ${normalized}.`);
  }
  return normalized;
}

function normalizeScopes(value) {
  const scopes = (value ? String(value).split(",") : DEFAULT_CLIENT_SCOPES)
    .map((scope) => scope.trim())
    .filter(Boolean);
  if (!scopes.length || scopes.some((scope) => !ALLOWED_SCOPES.has(scope))) {
    throw new Error("A lista de escopos contém um valor inválido.");
  }
  return [...new Set(scopes)];
}

function positiveInteger(value, fallback) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 600) {
    throw new Error("O limite por minuto deve ser um inteiro entre 1 e 600.");
  }
  return parsed;
}

function optionalTimestamp(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed <= new Date()) {
    throw new Error("A expiração precisa ser uma data futura válida.");
  }
  return parsed.toISOString();
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

  if (command === "create-client") {
    const [actor, owner] = await Promise.all([
      user(values["actor-email"]),
      user(values["owner-email"] || values["actor-email"])
    ]);
    const key = generateAuthoringApiKey();
    const result = await rpc("create_authoring_api_client", {
      p_actor_user_id: actor.id,
      p_owner_user_id: owner.id,
      p_name: requireValue(values.name, "Nome do cliente"),
      p_key_prefix: key.prefix,
      p_api_key_hash: key.hash,
      p_scopes: normalizeScopes(values.scopes),
      p_rate_limit_per_minute: positiveInteger(values["rate-limit"], 30),
      p_expires_at: optionalTimestamp(values["expires-at"])
    });
    write(`Cliente criado para ${owner.email}. Copie a chave agora; ela não poderá ser recuperada:`);
    write(key.secret);
    return { ...result, apiKey: key.secret };
  }

  if (command === "rotate-client") {
    const actor = await user(values["actor-email"]);
    const key = generateAuthoringApiKey();
    const result = await rpc("rotate_authoring_api_client", {
      p_actor_user_id: actor.id,
      p_client_id: requireValue(values["client-id"], "ID do cliente"),
      p_new_key_prefix: key.prefix,
      p_new_api_key_hash: key.hash,
      p_new_expires_at: optionalTimestamp(values["expires-at"])
    });
    write("Chave substituída. Copie a nova chave agora; a anterior foi revogada:");
    write(key.secret);
    return { ...result, apiKey: key.secret };
  }

  if (command === "revoke-client") {
    const actor = await user(values["actor-email"]);
    const result = await rpc("revoke_authoring_api_client", {
      p_actor_user_id: actor.id,
      p_client_id: requireValue(values["client-id"], "ID do cliente")
    });
    write("Cliente de autoria revogado.");
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
    "  node scripts/manageAuthoringAccess.mjs list-roles --actor-email <e-mail>",
    "  node scripts/manageAuthoringAccess.mjs create-client --actor-email <e-mail> --name <nome> [--scopes <lista>]",
    "  node scripts/manageAuthoringAccess.mjs rotate-client --actor-email <e-mail> --client-id <uuid>",
    "  node scripts/manageAuthoringAccess.mjs revoke-client --actor-email <e-mail> --client-id <uuid>"
  ].join("\n");
}

async function main() {
  const [command, ...argumentsList] = process.argv.slice(2);
  const { values } = parseArgs({
    args: argumentsList,
    options: {
      email: { type: "string" },
      "actor-email": { type: "string" },
      "owner-email": { type: "string" },
      role: { type: "string" },
      reason: { type: "string" },
      name: { type: "string" },
      scopes: { type: "string" },
      "rate-limit": { type: "string" },
      "expires-at": { type: "string" },
      "client-id": { type: "string" },
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
