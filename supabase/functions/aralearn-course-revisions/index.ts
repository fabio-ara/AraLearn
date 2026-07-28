import {
  createCourseRevisionHandler
} from "../_shared/aralearn-authoring/courseRevisionHandler.js";
import {
  readSupabaseServerEnvironment
} from "../_shared/aralearn-authoring/supabaseEnvironment.js";

const environment = readSupabaseServerEnvironment((name: string) => Deno.env.get(name));

Deno.serve(createCourseRevisionHandler({
  supabaseUrl: environment.supabaseUrl,
  serverApiKey: environment.serverApiKey,
  publishableKey: environment.publishableKey
}));
