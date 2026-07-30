import { createAuthoringMcpHandler } from "../_shared/aralearn-authoring/mcpServer.js";
import { parseAllowedOrigins } from "../_shared/aralearn-authoring/security.js";
import { SupabaseAuthoringAdapter } from "../_shared/aralearn-authoring/supabaseAdapter.js";
import { readSupabaseServerEnvironment } from "../_shared/aralearn-authoring/supabaseEnvironment.js";

const serverEnvironment = readSupabaseServerEnvironment((name: string) => Deno.env.get(name));

const adapter = new SupabaseAuthoringAdapter({
  supabaseUrl: serverEnvironment.supabaseUrl,
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

// No Supabase local, SUPABASE_URL aponta para o Kong interno. O resource OAuth,
// contudo, precisa anunciar a rota pública que o cliente efetivamente acessa.
// Sem URL fixa nesse ambiente, o handler a deriva da requisição encaminhada.
const resourceUrl = serverEnvironment.local
  ? ""
  : `${serverEnvironment.supabaseUrl}/functions/v1/aralearn-authoring-mcp`;

const handler = createAuthoringMcpHandler({
  adapter,
  resourceUrl,
  authorizationServer: `${serverEnvironment.supabaseUrl}/auth/v1`,
  allowedOrigins: parseAllowedOrigins(
    Deno.env.get("ARALEARN_AUTHORING_MCP_ALLOWED_ORIGINS")
      || Deno.env.get("ARALEARN_AUTHORING_ALLOWED_ORIGINS")
      || defaultOrigins
  )
});

Deno.serve(handler);
