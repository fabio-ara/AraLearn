import {
  createCourseRevisionHandler
} from "../_shared/aralearn-authoring/courseRevisionHandler.js";
import {
  parseAllowedOrigins
} from "../_shared/aralearn-authoring/security.js";
import {
  readSupabaseServerEnvironment
} from "../_shared/aralearn-authoring/supabaseEnvironment.js";

const environment = readSupabaseServerEnvironment((name: string) => Deno.env.get(name));
const defaultOrigins = [
  "http://127.0.0.1:4182",
  "http://localhost:4182",
  "https://fabio-ara.github.io",
  "https://appassets.androidplatform.net"
].join(",");

Deno.serve(createCourseRevisionHandler({
  supabaseUrl: environment.supabaseUrl,
  serverApiKey: environment.serverApiKey,
  publishableKey: environment.publishableKey,
  allowedOrigins: parseAllowedOrigins(
    Deno.env.get("ARALEARN_COURSE_REVISIONS_ALLOWED_ORIGINS")
      || Deno.env.get("ARALEARN_AUTHORING_ALLOWED_ORIGINS")
      || defaultOrigins
  )
}));
