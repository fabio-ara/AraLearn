import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import process from "node:process";

import {
  AUTH_PKCE_STATE_KEY,
  SupabaseAuthClient
} from "../../src/supabase/SupabaseAuthClient.js";

function readLocalSupabaseStatus() {
  const executable = process.platform === "win32" ? "npx.cmd" : "npx";
  try {
    const output = execFileSync(
      executable,
      ["--yes", "supabase@2.109.1", "status", "-o", "json"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
    const objectStart = output.indexOf("{");
    return objectStart >= 0 ? JSON.parse(output.slice(objectStart)) : {};
  } catch {
    return {};
  }
}

function createSessionStore() {
  const state = new Map();
  return {
    async getSyncState(key) {
      return state.get(key) ?? null;
    },
    async putSyncState(key, value) {
      state.set(key, structuredClone(value));
    }
  };
}

function assertLocalUrl(value, label) {
  const url = new URL(value);
  assert(
    ["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname),
    `${label} aceita somente o stack local.`
  );
  return url.toString().replace(/\/$/u, "");
}

function decodeHtmlAttribute(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&#x3D;", "=")
    .replaceAll("&#61;", "=")
    .replaceAll("&quot;", "\"");
}

function findVerificationLink(html, type) {
  const decoded = decodeHtmlAttribute(html);
  const links = decoded.match(/https?:\/\/[^\s"'<>]+/gu) ?? [];
  return links.find((candidate) => {
    try {
      const url = new URL(candidate);
      return url.pathname.endsWith("/auth/v1/verify") && url.searchParams.get("type") === type;
    } catch {
      return false;
    }
  }) ?? "";
}

async function waitForVerificationLink(mailpitUrl, email, type, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  const query = encodeURIComponent(`to:"${email}"`);
  while (Date.now() < deadline) {
    const response = await fetch(`${mailpitUrl}/view/latest.html?query=${query}`, {
      headers: { Accept: "text/html" },
      cache: "no-store"
    });
    if (response.ok) {
      const link = findVerificationLink(await response.text(), type);
      if (link) return link;
    } else {
      assert.equal(response.status, 404, `Mailpit respondeu com HTTP ${response.status}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.fail(`O e-mail de ${type} não chegou ao Mailpit dentro do prazo.`);
}

async function openVerificationLink(link, expectedRedirectOrigin) {
  const response = await fetch(link, { redirect: "manual", cache: "no-store" });
  assert(
    [301, 302, 303, 307, 308].includes(response.status),
    `O link de autenticação respondeu com HTTP ${response.status}.`
  );
  const location = response.headers.get("location");
  assert(location, "O link de autenticação não retornou o callback.");
  const callback = new URL(location, link);
  assert.equal(callback.origin, expectedRedirectOrigin, "O callback saiu da origem permitida.");
  assert(callback.searchParams.get("auth_state"), "O callback perdeu auth_state.");
  assert(callback.searchParams.get("code"), "O callback PKCE não contém code.");
  return callback;
}

function callbackLocation(callback) {
  return {
    pathname: callback.pathname,
    search: callback.search,
    hash: callback.hash
  };
}

async function deleteTemporaryUser(apiUrl, serviceRoleKey, userId) {
  if (!userId || !serviceRoleKey) return;
  const response = await fetch(
    `${apiUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}?should_soft_delete=true`,
    {
      method: "DELETE",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`
      }
    }
  );
  assert(response.ok, `O teardown do usuário temporário respondeu com HTTP ${response.status}.`);
}

const localStatus = readLocalSupabaseStatus();
const apiUrl = assertLocalUrl(
  String(process.env.SUPABASE_URL || process.env.API_URL || localStatus.API_URL || ""),
  "O smoke de e-mail"
);
const mailpitUrl = assertLocalUrl(
  String(process.env.MAILPIT_URL || process.env.INBUCKET_URL || localStatus.INBUCKET_URL || "http://127.0.0.1:54324"),
  "A consulta ao Mailpit"
);
const publishableKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.ANON_KEY ||
  localStatus.ANON_KEY;
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SERVICE_ROLE_KEY ||
  localStatus.SERVICE_ROLE_KEY;

assert(publishableKey, "Inicie o Supabase local para obter a publishable key de teste.");
assert(serviceRoleKey, "Inicie o Supabase local para permitir o teardown do usuário de teste.");

const suffix = `${Date.now()}-${process.pid}`;
const email = `smoke-email-${suffix}@aralearn.local`;
const initialPassword = `AraLearn-email-${suffix}-A9!`;
const replacementPassword = `AraLearn-email-${suffix}-B8!`;
const redirectUrl = "http://127.0.0.1:4182/";
const store = createSessionStore();
let userId = "";

try {
  const auth = new SupabaseAuthClient({
    projectUrl: apiUrl,
    publishableKey,
    sessionStore: store
  });
  const signup = await auth.signUp({ email, password: initialPassword, redirectTo: redirectUrl });
  userId = signup?.user?.id || signup?.id || "";
  assert(userId, "O cadastro local não retornou o usuário pendente.");
  assert.equal(auth.getSession(), null, "Cadastro sem confirmação não deve abrir sessão.");

  const signupState = await store.getSyncState(AUTH_PKCE_STATE_KEY);
  assert.equal(signupState?.type, "signup");
  const signupLink = await waitForVerificationLink(mailpitUrl, email, "signup");
  const signupCallback = await openVerificationLink(signupLink, new URL(redirectUrl).origin);
  assert.equal(signupCallback.searchParams.get("auth_state"), signupState.state);

  const confirmedAuth = new SupabaseAuthClient({
    projectUrl: apiUrl,
    publishableKey,
    sessionStore: store,
    locationValue: callbackLocation(signupCallback),
    historyValue: { replaceState() {} }
  });
  const confirmedSession = await confirmedAuth.initialize();
  assert.equal(confirmedSession?.user?.email, email);

  await confirmedAuth.requestPasswordReset({ email, redirectTo: redirectUrl });
  const recoveryState = await store.getSyncState(AUTH_PKCE_STATE_KEY);
  assert.equal(recoveryState?.type, "recovery");
  const recoveryLink = await waitForVerificationLink(mailpitUrl, email, "recovery");
  const recoveryCallback = await openVerificationLink(recoveryLink, new URL(redirectUrl).origin);
  assert.equal(recoveryCallback.searchParams.get("auth_state"), recoveryState.state);

  const recoveryAuth = new SupabaseAuthClient({
    projectUrl: apiUrl,
    publishableKey,
    sessionStore: store,
    locationValue: callbackLocation(recoveryCallback),
    historyValue: { replaceState() {} }
  });
  const recoverySession = await recoveryAuth.initialize();
  assert(recoverySession?.access_token, "O callback de recuperação não abriu a sessão protegida.");
  assert.equal(recoveryAuth.recoveryMode, true);
  await recoveryAuth.updatePassword(replacementPassword);
  await recoveryAuth.signOut();

  const signInAuth = new SupabaseAuthClient({
    projectUrl: apiUrl,
    publishableKey,
    sessionStore: createSessionStore()
  });
  const signedIn = await signInAuth.signIn({ email, password: replacementPassword });
  assert.equal(signedIn?.user?.id, userId, "A nova senha não autenticou o mesmo usuário.");
  await signInAuth.signOut();

  console.log("Smoke de e-mail Auth: cadastro, confirmação PKCE e recuperação aprovados.");
} finally {
  await deleteTemporaryUser(apiUrl, serviceRoleKey, userId);
}
