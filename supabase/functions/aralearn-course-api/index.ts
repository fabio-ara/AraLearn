import { createCourseApiHandler } from "../_shared/aralearn-authoring/courseApiServer.js";
import { parseAllowedOrigins } from "../_shared/aralearn-authoring/security.js";
import { CourseSupabaseAdapter } from "../_shared/aralearn-authoring/courseSupabaseAdapter.js";
import {
  readSupabaseServerEnvironment
} from "../_shared/aralearn-authoring/supabaseEnvironment.js";

const serverEnvironment = readSupabaseServerEnvironment((name: string) => Deno.env.get(name));

const publicAppUrl = String(
  Deno.env.get("ARALEARN_PUBLIC_APP_URL")
    || (serverEnvironment.local
      ? "http://127.0.0.1:4182"
      : "https://fabio-ara.github.io/AraLearn/")
).trim();

const adapter = new CourseSupabaseAdapter({
  supabaseUrl: serverEnvironment.supabaseUrl,
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

const handler = createCourseApiHandler({
  adapter,
  allowedOrigins: parseAllowedOrigins(
    Deno.env.get("ARALEARN_COURSE_API_ALLOWED_ORIGINS")
      || defaultOrigins
  )
});

Deno.serve(handler);
