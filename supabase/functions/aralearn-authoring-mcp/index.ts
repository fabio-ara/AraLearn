import { createAuthoringMcpHandler } from "../_shared/aralearn-authoring/mcpServer.js";
import { parseAllowedOrigins } from "../_shared/aralearn-authoring/security.js";
import { SupabaseAuthoringAdapter } from "../_shared/aralearn-authoring/supabaseAdapter.js";
import {
  readSupabaseServerEnvironment,
  resolveMcpOAuthEndpoints
} from "../_shared/aralearn-authoring/supabaseEnvironment.js";

const serverEnvironment = readSupabaseServerEnvironment((name: string) => Deno.env.get(name));

// O hook deriva a audience do issuer. Resolver os dois endpoints pela mesma
// base canônica impede combinações de configuração que produziriam um token
// válido para um recurso e uma metadata que anunciasse outro.
const { authorizationServer, resourceUrl } = resolveMcpOAuthEndpoints(serverEnvironment);

const adapter = new SupabaseAuthoringAdapter({
  supabaseUrl: serverEnvironment.supabaseUrl,
  oauthIssuer: authorizationServer,
  serverApiKey: serverEnvironment.serverApiKey,
  publishableKey: serverEnvironment.publishableKey,
  scheduleBackground(task: Promise<unknown>) {
    const runtime = Reflect.get(globalThis, "EdgeRuntime") as {
      waitUntil?: (promise: Promise<unknown>) => void;
    } | undefined;
    if (typeof runtime?.waitUntil !== "function") {
      throw new Error("EdgeRuntime.waitUntil indisponível.");
    }
    runtime.waitUntil(task);
  }
});

const defaultOrigins = [
  "http://127.0.0.1:4182",
  "http://localhost:4182",
  "https://fabio-ara.github.io",
  "https://appassets.androidplatform.net"
].join(",");

const handler = createAuthoringMcpHandler({
  adapter,
  resourceUrl,
  authorizationServer,
  allowedOrigins: parseAllowedOrigins(
    Deno.env.get("ARALEARN_AUTHORING_MCP_ALLOWED_ORIGINS")
      || Deno.env.get("ARALEARN_AUTHORING_ALLOWED_ORIGINS")
      || defaultOrigins
  )
});

Deno.serve(handler);
