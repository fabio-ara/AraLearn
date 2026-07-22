import { createAuthoringMcpHandler } from "../_shared/aralearn-authoring/mcpServer.js";
import { parseAllowedOrigins } from "../_shared/aralearn-authoring/security.js";
import { SupabaseAuthoringAdapter } from "../_shared/aralearn-authoring/supabaseAdapter.js";

const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const adapter = new SupabaseAuthoringAdapter({
  supabaseUrl: Deno.env.get("SUPABASE_URL"),
  serviceRoleKey,
  publishableKey: Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY"),
  integrationKeySecret: Deno.env.get("ARALEARN_AUTHORING_INTEGRATION_SECRET")
    || Deno.env.get("ARALEARN_AUTHORING_RECEIPT_SECRET")
    || serviceRoleKey,
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
  receiptSecret: Deno.env.get("ARALEARN_AUTHORING_RECEIPT_SECRET") || serviceRoleKey,
  allowedOrigins: parseAllowedOrigins(
    Deno.env.get("ARALEARN_AUTHORING_MCP_ALLOWED_ORIGINS")
      || Deno.env.get("ARALEARN_AUTHORING_ALLOWED_ORIGINS")
      || defaultOrigins
  )
});

Deno.serve(handler);
