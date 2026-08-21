import assert from "node:assert/strict";
import test from "node:test";

import {
  assertAssistProviderEndpointAllowed,
  buildAssistAllowedOrigins,
  DEVELOPMENT_VENDOR_ASSIST_ORIGINS,
  DEFAULT_ASSIST_ALLOWED_ORIGINS,
  normalizeAssistProviderOrigin,
  readAssistAllowedOrigins
} from "../../src/assist/providerRuntimeSecurity.js";

test("origens da assistência são exatas, fechadas e incluem somente presets seguros", () => {
  const origins = buildAssistAllowedOrigins("https://modelos.example.edu");
  assert.deepEqual(origins, DEFAULT_ASSIST_ALLOWED_ORIGINS);
  assert.equal(Object.isFrozen(origins), true);
  assert.deepEqual(buildAssistAllowedOrigins("https://modelos.example.edu", {
    includeDirectVendors: true,
    includeConfiguredOrigins: true
  }), [
    ...DEFAULT_ASSIST_ALLOWED_ORIGINS,
    ...DEVELOPMENT_VENDOR_ASSIST_ORIGINS,
    "https://modelos.example.edu"
  ]);
  assert.throws(
    () => normalizeAssistProviderOrigin("https://modelos.example.edu/v1/responses"),
    /somente protocolo, host e porta/u
  );
  assert.throws(
    () => normalizeAssistProviderOrigin("http://modelos.example.edu"),
    /dispositivo local/u
  );
  assert.throws(
    () => normalizeAssistProviderOrigin("http://127.0.0.1:9999"),
    /porta 4183/u
  );
  assert.throws(
    () => normalizeAssistProviderOrigin("https://*.example.edu"),
    /curinga/u
  );
});

test("endpoint falha fechado quando a instalação não declara sua origem", () => {
  assert.deepEqual(readAssistAllowedOrigins({}), []);
  assert.throws(
    () => assertAssistProviderEndpointAllowed(
      "https://api.openai.com/v1/responses",
      {}
    ),
    /não está autorizada/u
  );
  assert.equal(
    assertAssistProviderEndpointAllowed(
      "https://api.openai.com/v1/responses",
      { assistAllowedOrigins: ["https://api.openai.com"] }
    ),
    "https://api.openai.com/v1/responses"
  );
  assert.throws(
    () => assertAssistProviderEndpointAllowed(
      "https://api.openai.com/v1/responses?api_key=segredo",
      { assistAllowedOrigins: ["https://api.openai.com"] }
    ),
    /consulta/u
  );
});

test("HTTP é aceito somente no serviço local previsto", () => {
  assert.equal(
    assertAssistProviderEndpointAllowed(
      "http://10.0.2.2:4183/assist",
      { assistAllowedOrigins: ["http://10.0.2.2:4183"] }
    ),
    "http://10.0.2.2:4183/assist"
  );
  assert.throws(
    () => assertAssistProviderEndpointAllowed(
      "http://bridge.example.edu:4183/assist",
      { assistAllowedOrigins: ["http://bridge.example.edu:4183"] }
    ),
    /dispositivo local/u
  );
});
