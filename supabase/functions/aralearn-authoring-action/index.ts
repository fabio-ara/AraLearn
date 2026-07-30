import { createAuthoringActionHandler } from "../_shared/aralearn-authoring/actionServer.js";
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
  "https://chatgpt.com",
  "https://chat.openai.com",
  "http://127.0.0.1:4182",
  "http://localhost:4182",
  "https://fabio-ara.github.io",
  "https://appassets.androidplatform.net"
].join(",");

const configuredPublicSupabaseUrl = String(
  Deno.env.get("ARALEARN_AUTHORING_MCP_PUBLIC_SUPABASE_URL") || ""
).trim().replace(/\/+$/u, "");
const publicSupabaseUrl = configuredPublicSupabaseUrl
  || (serverEnvironment.local ? "http://127.0.0.1:54321" : serverEnvironment.supabaseUrl);
const publicAppUrl = String(
  Deno.env.get("ARALEARN_AUTHORING_ACTION_PUBLIC_APP_URL")
    || (serverEnvironment.local
      ? "http://127.0.0.1:4182"
      : "https://fabio-ara.github.io/AraLearn/")
).trim();

const handler = createAuthoringActionHandler({
  adapter,
  actionBaseUrl: `${publicSupabaseUrl}/functions/v1/aralearn-authoring-action`,
  publicAppUrl,
  allowedOrigins: parseAllowedOrigins(
    Deno.env.get("ARALEARN_AUTHORING_ACTION_ALLOWED_ORIGINS")
      || defaultOrigins
  )
});

Deno.serve(handler);
