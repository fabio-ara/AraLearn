import test from "node:test";
import assert from "node:assert/strict";
import { createSign, generateKeyPairSync } from "node:crypto";

import { SupabaseOAuthJwtVerifier } from
  "../../supabase/functions/_shared/aralearn-authoring/oauthJwtVerifier.js";

const ISSUER = "https://project.example/auth/v1";

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signingKey(kid) {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1"
  });
  return {
    kid,
    privateKey,
    jwk: {
      ...publicKey.export({ format: "jwk" }),
      alg: "ES256",
      kid,
      key_ops: ["verify"],
      use: "sig"
    }
  };
}

function signedJwt(key, claims, { algorithm = "ES256", kid = key.kid } = {}) {
  const protectedHeader = base64UrlJson({ alg: algorithm, kid, typ: "JWT" });
  const payload = base64UrlJson(claims);
  const input = `${protectedHeader}.${payload}`;
  const signer = createSign("SHA256");
  signer.update(input);
  signer.end();
  const signature = signer.sign({ key: key.privateKey, dsaEncoding: "ieee-p1363" });
  return `${input}.${signature.toString("base64url")}`;
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

test("verifica ES256 pelo JWKS configurado e reutiliza a chave somente dentro do TTL", async () => {
  const key = signingKey("key-a");
  let calls = 0;
  let now = 10_000;
  const verifier = new SupabaseOAuthJwtVerifier({
    issuer: ISSUER,
    fetchImpl: async (url, init) => {
      calls += 1;
      assert.equal(url, `${ISSUER}/.well-known/jwks.json`);
      assert.equal(init.redirect, "error");
      return json({ keys: [key.jwk] });
    },
    now: () => now,
    cacheTtlMs: 1_000
  });
  const claims = { iss: ISSUER, sub: "subject" };
  const token = signedJwt(key, claims);

  assert.deepEqual(await verifier.verify(token), claims);
  assert.deepEqual(await verifier.verify(token), claims);
  assert.equal(calls, 1);

  now += 1_001;
  assert.deepEqual(await verifier.verify(token), claims);
  assert.equal(calls, 2);
});

test("renova o JWKS para kid novo e nunca aceita assinatura divergente", async () => {
  const first = signingKey("key-a");
  const rotated = signingKey("key-b");
  let calls = 0;
  let now = 10_000;
  const verifier = new SupabaseOAuthJwtVerifier({
    issuer: ISSUER,
    fetchImpl: async () => {
      calls += 1;
      return json({ keys: calls === 1 ? [first.jwk] : [rotated.jwk] });
    },
    now: () => now,
    unknownKeyCooldownMs: 1_000
  });
  await verifier.verify(signedJwt(first, { sub: "first" }));
  assert.deepEqual(
    await verifier.verify(signedJwt(rotated, { sub: "rotated" })),
    { sub: "rotated" }
  );
  assert.equal(calls, 2);

  const forged = signedJwt(first, { sub: "forged" }, { kid: rotated.kid });
  await assert.rejects(
    () => verifier.verify(forged),
    (error) => error.status === 401 && error.code === "invalid_oauth_token"
  );
  assert.equal(calls, 2, "kid conhecido com assinatura inválida não relê o JWKS");

  const unknown = signedJwt(first, { sub: "unknown" }, { kid: "key-unknown" });
  await assert.rejects(
    () => verifier.verify(unknown),
    (error) => error.status === 401 && error.code === "invalid_oauth_token"
  );
  assert.equal(calls, 3);
  await assert.rejects(
    () => verifier.verify(unknown),
    (error) => error.status === 401 && error.code === "invalid_oauth_token"
  );
  assert.equal(calls, 3, "kid desconhecido respeita o cooldown negativo");
  now += 500;
  await assert.rejects(
    () => verifier.verify(unknown),
    (error) => error.status === 401 && error.code === "invalid_oauth_token"
  );
  assert.equal(calls, 3, "requisições recusadas não alongam o cooldown");
  now += 501;
  await assert.rejects(
    () => verifier.verify(unknown),
    (error) => error.status === 401 && error.code === "invalid_oauth_token"
  );
  assert.equal(calls, 4, "o JWKS volta a ser consultado após o prazo original");
});

test("recusa algoritmo simétrico antes da rede e distingue JWKS indisponível", async () => {
  let calls = 0;
  const verifier = new SupabaseOAuthJwtVerifier({
    issuer: ISSUER,
    fetchImpl: async () => {
      calls += 1;
      return json({ message: "fora" }, 503);
    }
  });
  const symmetric = [
    base64UrlJson({ alg: "HS256", kid: "shared", typ: "JWT" }),
    base64UrlJson({ sub: "subject" }),
    Buffer.from("assinatura").toString("base64url")
  ].join(".");
  await assert.rejects(
    () => verifier.verify(symmetric),
    (error) => error.status === 401 && error.code === "invalid_oauth_token"
  );
  assert.equal(calls, 0);

  const key = signingKey("key-a");
  await assert.rejects(
    () => verifier.verify(signedJwt(key, { sub: "subject" })),
    (error) => error.status === 503 && error.code === "oauth_verification_unavailable"
  );
  assert.equal(calls, 1);
});
