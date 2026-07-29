import assert from "node:assert/strict";
import test from "node:test";

import {
  BUILT_IN_ASSIST_ORIGINS,
  buildAssistAllowedOrigins,
  normalizeNetworkOrigin,
  parseNetworkOriginList
} from "../../src/config/networkOrigins.js";
import { readSupabaseRuntimeConfig } from "../../src/supabase/runtimeConfig.js";

test("origens de assistência são exatas, únicas e ordenadas", () => {
  const origins = buildAssistAllowedOrigins({
    configured: "https://assist.example.org, https://api.deepseek.com/"
  });
  assert.deepEqual(origins, [...new Set([
    ...BUILT_IN_ASSIST_ORIGINS,
    "https://assist.example.org"
  ])].sort((left, right) => left.localeCompare(right)));
  assert.equal(normalizeNetworkOrigin("https://assist.example.org/"), "https://assist.example.org");
});

test("origens amplas, caminhos, credenciais e HTTP remoto são rejeitados", () => {
  for (const value of [
    "https:",
    "https://example.org/v1",
    "https://user:password@example.org",
    "https://example.org?token=abc",
    "http://example.org"
  ]) {
    assert.throws(() => normalizeNetworkOrigin(value));
  }
  assert.equal(
    normalizeNetworkOrigin("http://127.0.0.1:4183", { allowLocalHttp: true }),
    "http://127.0.0.1:4183"
  );
});

test("runtime público não aceita HTTP local fora do desenvolvimento", () => {
  assert.throws(() => readSupabaseRuntimeConfig({
    assistAllowedOrigins: ["http://127.0.0.1:4183"]
  }));
  const development = readSupabaseRuntimeConfig({
    developmentRuntime: true,
    assistAllowedOrigins: parseNetworkOriginList(
      ["http://127.0.0.1:4183", "https://api.deepseek.com"],
      { allowLocalHttp: true }
    )
  });
  assert.deepEqual(development.assistAllowedOrigins, [
    "http://127.0.0.1:4183",
    "https://api.deepseek.com"
  ]);

  const android = readSupabaseRuntimeConfig({
    supabaseUrl: "https://projeto.supabase.co",
    supabasePublishableKey: "sb_publishable_teste",
    assistAllowedOrigins: ["http://127.0.0.1:4183"],
    androidRuntime: true
  });
  assert.deepEqual(android.assistAllowedOrigins, ["http://127.0.0.1:4183"]);
});
