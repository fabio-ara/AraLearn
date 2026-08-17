import { createAuthoringMcpHandler } from "../_shared/aralearn-authoring/mcpServer.js";
import { parseAllowedOrigins } from "../_shared/aralearn-authoring/security.js";
import { CourseSupabaseAdapter } from "../_shared/aralearn-authoring/courseSupabaseAdapter.js";
import {
  readSupabaseServerEnvironment,
  resolveMcpOAuthEndpoints
} from "../_shared/aralearn-authoring/supabaseEnvironment.js";

const serverEnvironment = readSupabaseServerEnvironment((name: string) => Deno.env.get(name));

// O hook deriva a audience do issuer. Resolver os dois endpoints pela mesma
// base canônica impede combinações de configuração que produziriam um token
// válido para um recurso e uma metadata que anunciasse outro.
const { authorizationServer, resourceUrl } = resolveMcpOAuthEndpoints(serverEnvironment);

const publicAppUrl = String(
  Deno.env.get("ARALEARN_PUBLIC_APP_URL")
    || (serverEnvironment.local
      ? "http://127.0.0.1:4182"
      : "https://fabio-ara.github.io/AraLearn/")
).trim();

const adapter = new CourseSupabaseAdapter({
  supabaseUrl: serverEnvironment.supabaseUrl,
  oauthIssuer: authorizationServer,
  serverApiKey: serverEnvironment.serverApiKey,
  publishableKey: serverEnvironment.publishableKey,
  publicAppUrl
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
      || defaultOrigins
  )
});

Deno.serve(handler);
