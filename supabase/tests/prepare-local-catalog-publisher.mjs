import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  ensureLocalCatalogPublisher,
  ensureLocalTechnicalOwner
} from "./local-role-fixtures.mjs";

const projectUrl = String(
  process.env.SUPABASE_URL
    || process.env.API_URL
    || process.env.ARALEARN_SUPABASE_URL
    || "http://127.0.0.1:54321"
).replace(/\/+$/u, "");
const serverApiKey = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SERVICE_ROLE_KEY
    || ""
).trim();
const hostname = new URL(projectUrl).hostname;

assert(
  new Set(["127.0.0.1", "localhost"]).has(hostname),
  "A fixture editorial só pode usar a stack Supabase local."
);
assert(serverApiKey, "SERVICE_ROLE_KEY local ausente.");

const serverHeaders = Object.freeze({
  apikey: serverApiKey,
  Authorization: `Bearer ${serverApiKey}`,
  "Content-Type": "application/json"
});

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const source = await response.text();
  let payload = null;
  try {
    payload = source ? JSON.parse(source) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error = new Error(
      `Fixture editorial local falhou com HTTP ${response.status}.`
    );
    error.status = response.status;
    error.code = response.status === 403 && payload?.code === "42501"
      ? "not_authorized"
      : String(payload?.code || "request_failed");
    throw error;
  }
  return payload;
}

function adminAuth(path, {
  method = "POST",
  body = undefined
} = {}) {
  return requestJson(`${projectUrl}/auth/v1/admin/${path}`, {
    method,
    headers: body === undefined
      ? {
        apikey: serverApiKey,
        Authorization: `Bearer ${serverApiKey}`
      }
      : serverHeaders,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

function rpc(name, payload) {
  return requestJson(`${projectUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: serverHeaders,
    body: JSON.stringify(payload)
  });
}

const technicalOwner = await ensureLocalTechnicalOwner({
  adminAuth,
  rpc,
  email: "action-bootstrap-owner@aralearn.local",
  password: `Arl!bootstrap-${randomUUID()}9`,
  metadata: {
    test: "catalog-publisher-fixture",
    persistentFixture: true
  },
  reason: "Owner técnico persistente da stack local de testes"
});
const publisher = await ensureLocalCatalogPublisher({
  adminAuth,
  rpc,
  technicalOwnerId: technicalOwner.userId,
  email: "catalog-publisher@aralearn.local",
  password: "Arl!CatalogPublisherLocal2026",
  metadata: {
    test: "catalog-publisher-fixture",
    persistentFixture: true
  },
  reason: "Smoke local da publicação de catálogo"
});

process.stdout.write(`${publisher.userId}\n`);
