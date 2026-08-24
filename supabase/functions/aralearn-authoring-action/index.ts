import { createAuthoringActionHandler } from "../_shared/aralearn-authoring/actionServer.js";
import { parseAllowedOrigins } from "../_shared/aralearn-authoring/security.js";
import { CourseSupabaseAdapter } from "../_shared/aralearn-authoring/courseSupabaseAdapter.js";
import {
  readSupabaseServerEnvironment,
  resolvePublicSupabaseUrl
} from "../_shared/aralearn-authoring/supabaseEnvironment.js";

const environment = readSupabaseServerEnvironment((name: string) => Deno.env.get(name));
const publicSupabaseUrl = resolvePublicSupabaseUrl(environment);
const publicAppUrl = String(Deno.env.get("ARALEARN_PUBLIC_APP_URL") || (
  environment.local ? "http://127.0.0.1:4182" : "https://fabio-ara.github.io/AraLearn/"
)).trim();
const adapter = new CourseSupabaseAdapter({
  supabaseUrl: environment.supabaseUrl,
  publicSupabaseUrl,
  oauthIssuer: `${publicSupabaseUrl}/auth/v1`,
  serverApiKey: environment.serverApiKey,
  publishableKey: environment.publishableKey,
  publicAppUrl
});
const origins = Deno.env.get("ARALEARN_AUTHORING_ACTION_ALLOWED_ORIGINS") || [
  "https://chatgpt.com",
  "https://chat.openai.com",
  "http://127.0.0.1:4182",
  "http://localhost:4182",
  "https://fabio-ara.github.io",
  "https://appassets.androidplatform.net"
].join(",");

Deno.serve(createAuthoringActionHandler({
  adapter,
  actionBaseUrl: `${publicSupabaseUrl}/functions/v1/aralearn-authoring-action`,
  publicAppUrl,
  allowedOrigins: parseAllowedOrigins(origins)
}));
