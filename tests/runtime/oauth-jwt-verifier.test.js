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
      assert.equal(init.redirect, "manual");
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

test("recusa algoritmo simétrico antes da rede e não repete falha não transitória", async () => {
  let calls = 0;
  const verifier = new SupabaseOAuthJwtVerifier({
    issuer: ISSUER,
    fetchImpl: async () => {
      calls += 1;
      return json({ message: "fora" }, 404);
    },
    sleep: async () => {
      throw new Error("falha não transitória não pode aguardar repetição");
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
  assert.equal(calls, 0, "algoritmo simétrico é recusado antes da rede");

  const key = signingKey("key-a");
  await assert.rejects(
    () => verifier.verify(signedJwt(key, { sub: "subject" })),
    (error) => error.status === 503 && error.code === "oauth_verification_unavailable"
  );
  assert.equal(calls, 1, "4xx do JWKS não é repetido");
});

test("corpo do JWKS ilegível ou malformado não é repetido", async () => {
  const key = signingKey("key-a");
  for (const [description, body] of [
    ["lista malformada", { keys: "não é lista" }],
    ["JSON inválido", "não é JSON"]
  ]) {
    let calls = 0;
    const verifier = new SupabaseOAuthJwtVerifier({
      issuer: ISSUER,
      fetchImpl: async () => {
        calls += 1;
        return new Response(typeof body === "string" ? body : JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      },
      sleep: async () => {
        throw new Error(`${description} não pode aguardar repetição`);
      }
    });
    await assert.rejects(
      () => verifier.verify(signedJwt(key, { sub: "subject" })),
      (error) => error.status === 503 && error.code === "oauth_verification_unavailable"
    );
    assert.equal(calls, 1, `${description}: a leitura é única`);
  }
});

test("repetição limitada recupera JWKS transitório e preserva o cache ao suceder", async () => {
  const key = signingKey("key-a");
  let calls = 0;
  const waits = [];
  const verifier = new SupabaseOAuthJwtVerifier({
    issuer: ISSUER,
    fetchImpl: async () => {
      calls += 1;
      return calls < 3 ? json({ message: "fora" }, 504) : json({ keys: [key.jwk] });
    },
    sleep: async (milliseconds) => {
      waits.push(milliseconds);
    },
    retryBackoffMs: 10
  });

  assert.deepEqual(await verifier.verify(signedJwt(key, { sub: "recuperado" })), {
    sub: "recuperado"
  });
  assert.equal(calls, 3, "504 do JWKS é repetido até a terceira tentativa");
  assert.deepEqual(waits, [10, 20], "a espera cresce de forma limitada");

  const settled = calls;
  assert.deepEqual(await verifier.verify(signedJwt(key, { sub: "cache" })), { sub: "cache" });
  assert.equal(calls, settled, "a chave obtida é reutilizada dentro do TTL");
});

test("falha transitória persistente devolve 503 estável sem inventar chave", async () => {
  const key = signingKey("key-a");
  let calls = 0;
  const verifier = new SupabaseOAuthJwtVerifier({
    issuer: ISSUER,
    fetchImpl: async () => {
      calls += 1;
      throw new TypeError("fetch failed");
    },
    sleep: async () => {}
  });
  await assert.rejects(
    () => verifier.verify(signedJwt(key, { sub: "subject" })),
    (error) => error.status === 503 && error.code === "oauth_verification_unavailable"
  );
  assert.equal(calls, 3, "falha de rede é repetida dentro do limite");
});

test("a repetição respeita o prazo existente e não o estende", async () => {
  const key = signingKey("key-a");
  let now = 0;
  let calls = 0;
  const waits = [];
  const verifier = new SupabaseOAuthJwtVerifier({
    issuer: ISSUER,
    fetchImpl: async () => {
      calls += 1;
      return json({ message: "fora" }, 503);
    },
    now: () => now,
    sleep: async (milliseconds) => {
      waits.push(milliseconds);
      now += milliseconds;
    },
    requestTimeoutMs: 8_000,
    retryBackoffMs: 150
  });
  await assert.rejects(
    () => verifier.verify(signedJwt(key, { sub: "subject" }), { deadlineAt: 400 }),
    (error) => error.status === 503 && error.code === "oauth_verification_unavailable"
  );
  assert.deepEqual(waits, [150, 250], "a espera é limitada pelo prazo restante");
  assert.equal(now, 400, "a busca termina no deadline recebido");
  assert.equal(calls, 2, "o deadline interrompe novas tentativas");
});

test("cache vencido não é reutilizado quando o JWKS está indisponível", async () => {
  const key = signingKey("key-a");
  let now = 10_000;
  let unavailable = false;
  const verifier = new SupabaseOAuthJwtVerifier({
    issuer: ISSUER,
    fetchImpl: async () => unavailable
      ? json({ message: "fora" }, 503)
      : json({ keys: [key.jwk] }),
    now: () => now,
    sleep: async () => {},
    cacheTtlMs: 1_000,
    maxAttempts: 2
  });
  await verifier.verify(signedJwt(key, { sub: "ok" }));

  unavailable = true;
  now += 1_001;
  await assert.rejects(
    () => verifier.verify(signedJwt(key, { sub: "ok" })),
    (error) => error.status === 503 && error.code === "oauth_verification_unavailable"
  );
});

test("redirecionamento do JWKS não é seguido nem repetido", async () => {
  const key = signingKey("key-a");
  let calls = 0;
  const verifier = new SupabaseOAuthJwtVerifier({
    issuer: ISSUER,
    fetchImpl: async (url, init) => {
      calls += 1;
      assert.equal(init.redirect, "manual", "o redirecionamento não é seguido automaticamente");
      return new Response(null, {
        status: 302,
        headers: { Location: "https://outra-origem.example/jwks.json" }
      });
    },
    sleep: async () => {
      throw new Error("redirecionamento não pode aguardar repetição");
    }
  });
  await assert.rejects(
    () => verifier.verify(signedJwt(key, { sub: "subject" })),
    (error) => error.status === 503 && error.code === "oauth_verification_unavailable"
  );
  assert.equal(calls, 1, "3xx é falha única, não transitória");
});

test("queda durante a leitura do corpo é transitória e é repetida", async () => {
  const key = signingKey("key-a");
  let calls = 0;
  const verifier = new SupabaseOAuthJwtVerifier({
    issuer: ISSUER,
    fetchImpl: async () => {
      calls += 1;
      if (calls < 2) {
        return new Response(new ReadableStream({
          start(controller) {
            controller.error(new TypeError("terminated"));
          }
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return json({ keys: [key.jwk] });
    },
    sleep: async () => {}
  });
  assert.deepEqual(await verifier.verify(signedJwt(key, { sub: "corpo" })), { sub: "corpo" });
  assert.equal(calls, 2, "a leitura que cai é repetida dentro do orçamento");
});

test("retryBackoffMs 0 repete sem esperar dentro do limite", async () => {
  const key = signingKey("key-a");
  let calls = 0;
  const waits = [];
  const verifier = new SupabaseOAuthJwtVerifier({
    issuer: ISSUER,
    fetchImpl: async () => {
      calls += 1;
      return calls < 3 ? json({ message: "fora" }, 503) : json({ keys: [key.jwk] });
    },
    sleep: async (milliseconds) => {
      waits.push(milliseconds);
    },
    retryBackoffMs: 0
  });
  assert.deepEqual(await verifier.verify(signedJwt(key, { sub: "sem-espera" })), { sub: "sem-espera" });
  assert.equal(calls, 3, "a repetição continua limitada a três tentativas");
  assert.deepEqual(waits, [0, 0], "a repetição ocorre sem espera");
});

test("buscas concorrentes compartilham uma leitura e a falha não envenena a próxima", async () => {
  const key = signingKey("key-a");
  const token = signedJwt(key, { sub: "concorrente" });
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const verifier = new SupabaseOAuthJwtVerifier({
    issuer: ISSUER,
    fetchImpl: async () => {
      calls += 1;
      await gate;
      return json({ keys: [key.jwk] });
    },
    sleep: async () => {}
  });
  const pending = Promise.all([verifier.verify(token), verifier.verify(token)]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls, 1, "duas buscas concorrentes usam uma única leitura");
  release();
  const [first, second] = await pending;
  assert.deepEqual(first, { sub: "concorrente" });
  assert.deepEqual(second, { sub: "concorrente" });

  let attempts = 0;
  const flaky = new SupabaseOAuthJwtVerifier({
    issuer: ISSUER,
    fetchImpl: async () => {
      attempts += 1;
      if (attempts <= 3) throw new TypeError("fetch failed");
      return json({ keys: [key.jwk] });
    },
    sleep: async () => {},
    maxAttempts: 3
  });
  await assert.rejects(
    () => flaky.verify(token),
    (error) => error.status === 503 && error.code === "oauth_verification_unavailable"
  );
  assert.deepEqual(await flaky.verify(token), { sub: "concorrente" },
    "a falha anterior libera a próxima busca");
});
