import assert from "node:assert/strict";
import test from "node:test";

import {
  isLocalServiceRoleJwt,
  readSupabaseServerEnvironment,
  resolveSupabaseAdministrativeEnvironment,
  resolveSupabaseServerEnvironment,
  supabaseServerHeaders
} from "../../supabase/functions/_shared/aralearn-authoring/supabaseEnvironment.js";

const HOSTED_URL = "https://project.supabase.co";
const SECRET_KEY = `sb_secret_${"a".repeat(40)}`;
const PUBLISHABLE_KEY = `sb_publishable_${"b".repeat(32)}`;
const LOCAL_SERVICE_ROLE_JWT = [
  "eyJhbGciOiJIUzI1NiJ9",
  "eyJyb2xlIjoic2VydmljZV9yb2xlIn0",
  "local-test-signature"
].join(".");
const LOCAL_ANON_JWT = [
  "eyJhbGciOiJIUzI1NiJ9",
  "eyJyb2xlIjoiYW5vbiJ9",
  "local-test-signature"
].join(".");

function hostedEnvironment(overrides = {}) {
  return {
    SUPABASE_URL: HOSTED_URL,
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: SECRET_KEY }),
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: PUBLISHABLE_KEY }),
    ...overrides
  };
}

test("ambiente hospedado lê as chaves nomeadas atuais", () => {
  assert.deepEqual(resolveSupabaseServerEnvironment(hostedEnvironment()), {
    supabaseUrl: HOSTED_URL,
    serverApiKey: SECRET_KEY,
    publishableKey: PUBLISHABLE_KEY,
    local: false
  });
});

test("ambiente hospedado aceita chave direta e permite escolher uma chave nomeada", () => {
  const direct = resolveSupabaseAdministrativeEnvironment({
    SUPABASE_URL: HOSTED_URL,
    SUPABASE_SECRET_KEY: SECRET_KEY
  });
  assert.equal(direct.serverApiKey, SECRET_KEY);

  const named = resolveSupabaseAdministrativeEnvironment({
    SUPABASE_URL: HOSTED_URL,
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: `sb_secret_${"e".repeat(40)}`, autoria: SECRET_KEY }),
    ARALEARN_SUPABASE_SECRET_KEY_NAME: "autoria"
  });
  assert.equal(named.serverApiKey, SECRET_KEY);
});

test("chave sb_secret_ segue apenas no apikey e nunca é enviada como Bearer", () => {
  assert.deepEqual(supabaseServerHeaders(SECRET_KEY), {
    apikey: SECRET_KEY,
    "Content-Type": "application/json"
  });
});

test("stack local aceita a service_role JWT da CLI e envia o Bearer exigido pela CLI", () => {
  const resolved = resolveSupabaseServerEnvironment({
    SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_SERVICE_ROLE_KEY: LOCAL_SERVICE_ROLE_JWT,
    SUPABASE_ANON_KEY: "local-anon-key"
  });
  assert.equal(resolved.local, true);
  assert.equal(resolved.serverApiKey, LOCAL_SERVICE_ROLE_JWT);
  assert.equal(isLocalServiceRoleJwt(LOCAL_SERVICE_ROLE_JWT), true);
  assert.deepEqual(supabaseServerHeaders(LOCAL_SERVICE_ROLE_JWT), {
    apikey: LOCAL_SERVICE_ROLE_JWT,
    Authorization: `Bearer ${LOCAL_SERVICE_ROLE_JWT}`,
    "Content-Type": "application/json"
  });
});

test("stack local recusa anon JWT e valor opaco no lugar da service_role", () => {
  assert.throws(
    () => resolveSupabaseAdministrativeEnvironment({
      SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_SECRET_KEY: LOCAL_ANON_JWT
    }),
    /não possui o papel service_role/u
  );
  assert.throws(
    () => resolveSupabaseAdministrativeEnvironment({
      SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_SERVICE_ROLE_KEY: "chave-opaca-no-lugar-errado"
    }),
    /não contém uma JWT service_role válida/u
  );
});

test("nome remoto que imita o serviço Docker não é tratado como stack local", () => {
  assert.throws(
    () => resolveSupabaseAdministrativeEnvironment({
      SUPABASE_URL: "http://supabase_kong_attacker.example.test",
      SUPABASE_SERVICE_ROLE_KEY: LOCAL_SERVICE_ROLE_JWT
    }),
    /SUPABASE_SECRET_KEYS|SUPABASE_SECRET_KEY/u
  );
});

test("ambiente hospedado recusa JWT privilegiada e chave pública incorreta", () => {
  assert.throws(
    () => resolveSupabaseAdministrativeEnvironment({
      SUPABASE_URL: HOSTED_URL,
      SUPABASE_SERVICE_ROLE_KEY: LOCAL_SERVICE_ROLE_JWT
    }),
    /SUPABASE_SECRET_KEYS ou SUPABASE_SECRET_KEY/u
  );
  assert.throws(
    () => resolveSupabaseServerEnvironment(hostedEnvironment({
      SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: SECRET_KEY })
    })),
    /formato sb_publishable_|não pode reutilizar/u
  );
});

test("dicionário inválido falha de forma explícita e o leitor não registra segredos", () => {
  assert.throws(
    () => resolveSupabaseAdministrativeEnvironment({
      SUPABASE_URL: HOSTED_URL,
      SUPABASE_SECRET_KEYS: "não é JSON"
    }),
    /SUPABASE_SECRET_KEYS não contém um objeto JSON válido/u
  );
  const values = hostedEnvironment();
  const read = readSupabaseServerEnvironment((name) => values[name]);
  assert.equal(read.serverApiKey, SECRET_KEY);
});
