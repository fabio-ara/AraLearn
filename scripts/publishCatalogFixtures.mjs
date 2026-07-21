import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { validateProjectDocument } from "../src/domain/aralearnProject.js";
import { canonicalCourseHash } from "../src/persistence/canonicalCourseHash.js";
import { contractToRelationalRows } from "../src/persistence/contractToRelationalRows.js";
import { assertValidRelationalCourse } from "../src/persistence/validateRelationalCourse.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDirectory = path.join(repositoryRoot, "supabase", "fixtures", "catalog");
const IMPORT_STORE_NAMES = Object.freeze([
  "modules", "lessons", "guides", "guideItems", "topics", "topicStatements",
  "microsequences", "dependencies", "microsequenceStatements", "cards", "blocks", "options",
  "nodes", "flowNodes", "flowCases", "flowPractices", "flowPracticeEntries",
  "flowPracticeOptions", "flowPracticeVariants", "flowShapeOptions", "edges", "matrixItems",
  "cells", "points", "lines", "highlights", "cardSources", "cardTopics"
]);
const IMPORT_CHUNK_SIZE = 200;

function parseArguments(argv) {
  const options = { publish: false, apply: false, courseFile: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--publish") {
      options.publish = true;
      options.apply = true;
    } else if (argument === "--import-draft") {
      options.apply = true;
    } else if (argument === "--dry-run") {
      options.apply = false;
      options.publish = false;
    } else if (argument === "--course") {
      options.courseFile = String(argv[index + 1] || "").trim();
      index += 1;
    } else {
      throw new Error(`Argumento desconhecido: ${argument}`);
    }
  }
  return options;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function assertFixtureName(fileName) {
  if (!fileName || path.basename(fileName) !== fileName || !fileName.endsWith(".json")) {
    throw new Error(`Nome de fixture inválido: ${fileName}.`);
  }
  return fileName;
}

function publicProject(course) {
  return { contract: "aralearn.contract", version: 3, kind: "project", courses: [course] };
}

export function assertPublicationReady(course, fileName = course?.id || "fixture") {
  const pending = [];
  for (const module of course?.modules || []) {
    for (const lesson of module?.lessons || []) {
      for (const microsequence of lesson?.microsequences || []) {
        if (microsequence?.status !== "ready") {
          pending.push(microsequence?.id || "sem-id");
        }
      }
    }
  }
  if (pending.length) {
    const preview = pending.slice(0, 5).join(", ");
    const suffix = pending.length > 5 ? ` e mais ${pending.length - 5}` : "";
    throw new Error(
      `${fileName} não está pronta para publicação: ${pending.length} microssequência(s) sem status ready (${preview}${suffix}).`
    );
  }
}

function rowCount(rows) {
  return Object.values(rows).reduce((total, entries) => total + (Array.isArray(entries) ? entries.length : 0), 0);
}

function deterministicUuid(value) {
  const bytes = Buffer.from(createHash("sha256").update(value).digest("hex").slice(0, 32), "hex");
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function catalogIdentityUuidFactory() {
  return (identityKey) => {
    const normalizedIdentityKey = String(identityKey || "").trim();
    if (!normalizedIdentityKey) {
      throw new TypeError("A publicação oficial exige identityKey para derivar o UUID estável.");
    }
    return deterministicUuid(`aralearn:official-catalog:v1:${normalizedIdentityKey}`);
  };
}

export async function prepareFixture(fileName) {
  const course = await readJson(path.join(fixtureDirectory, assertFixtureName(fileName)));
  const project = publicProject(course);
  const contractValidation = validateProjectDocument(project);
  if (!contractValidation.ok) {
    const details = contractValidation.errors.map((entry) => `${entry.path}: ${entry.message}`).join("; ");
    throw new Error(`${fileName} viola o contrato v3: ${details}`);
  }
  assertPublicationReady(course, fileName);
  const hash = await canonicalCourseHash(course);
  const rows = contractToRelationalRows(project, { uuidFactory: catalogIdentityUuidFactory() });
  assertValidRelationalCourse(rows);
  return {
    fileName,
    course,
    rows,
    hash,
    rowCount: rowCount(rows)
  };
}

function adminConfiguration(environment = process.env) {
  const projectUrl = String(environment.ARALEARN_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceRoleKey = String(environment.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!projectUrl || !serviceRoleKey) {
    throw new Error("Importação remota exige ARALEARN_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no processo administrativo.");
  }
  const parsed = new URL(projectUrl);
  const local = new Set(["127.0.0.1", "localhost", "10.0.2.2"]).has(parsed.hostname);
  if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) {
    throw new Error("ARALEARN_SUPABASE_URL administrativa deve usar HTTPS fora do ambiente local.");
  }
  return { projectUrl, serviceRoleKey };
}

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function rpc(projectUrl, serviceRoleKey, functionName, payload, {
  fetchImpl = globalThis.fetch,
  attempts = 3
} = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response;
    try {
      response = await fetchImpl.call(globalThis, `${projectUrl}/rest/v1/rpc/${functionName}`, {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await wait(250 * attempt);
        continue;
      }
      throw error;
    }
    const source = await response.text();
    let body;
    try {
      body = source ? JSON.parse(source) : null;
    } catch {
      body = source;
    }
    if (response.ok) return body;
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    lastError = new Error(
      `${functionName} falhou (HTTP ${response.status}): ${body?.message || body || "sem detalhes"}`
    );
    if (!retryable || attempt === attempts) throw lastError;
    await wait(250 * attempt);
  }
  throw lastError || new Error(`${functionName} falhou sem resposta.`);
}

async function importFlowGraphs(fixture, importId, projectUrl, serviceRoleKey, fetchImpl, progress) {
  const preparation = await rpc(projectUrl, serviceRoleKey, "begin_official_course_import_flow", {
    p_import_id: importId
  }, { fetchImpl });
  if (preparation?.status === "complete") {
    progress(`${fixture.fileName}: flowNodes/flowCases já confirmados`);
    return;
  }
  const nodesByBlock = new Map();
  const casesByBlock = new Map();
  for (const node of fixture.rows.flowNodes || []) {
    const blockId = String(node.blockId || "");
    if (!nodesByBlock.has(blockId)) nodesByBlock.set(blockId, []);
    nodesByBlock.get(blockId).push(node);
  }
  for (const flowCase of fixture.rows.flowCases || []) {
    const blockId = String(flowCase.blockId || "");
    if (!casesByBlock.has(blockId)) casesByBlock.set(blockId, []);
    casesByBlock.get(blockId).push(flowCase);
  }
  const blockIds = [...new Set([...nodesByBlock.keys(), ...casesByBlock.keys()])].sort();
  for (const [chunkIndex, blockId] of blockIds.entries()) {
    const nodes = nodesByBlock.get(blockId) || [];
    if (!nodes.length) {
      throw new Error(`Flow ${blockId || "sem bloco"} contém cases sem os nós correspondentes.`);
    }
    await rpc(projectUrl, serviceRoleKey, "apply_official_course_import_flow_chunk", {
      p_import_id: importId,
      p_chunk_index: chunkIndex,
      p_nodes: nodes,
      p_cases: casesByBlock.get(blockId) || []
    }, { fetchImpl });
  }
  if (blockIds.length) {
    progress(
      `${fixture.fileName}: flowNodes (${fixture.rows.flowNodes?.length || 0}), ` +
      `flowCases (${fixture.rows.flowCases?.length || 0})`
    );
  }
}

export async function importPreparedCatalogFixture(fixture, {
  publish,
  fetchImpl = globalThis.fetch,
  environment = process.env,
  progress = () => {}
} = {}) {
  const { projectUrl, serviceRoleKey } = adminConfiguration(environment);
  const importId = deterministicUuid(`aralearn-catalog-import:${fixture.course.id}:${fixture.hash}`);
  const expectedCounts = Object.fromEntries(
    IMPORT_STORE_NAMES.map((storeName) => [storeName, fixture.rows[storeName]?.length || 0])
  );
  const begin = await rpc(projectUrl, serviceRoleKey, "begin_official_course_import", {
    p_import_id: importId,
    p_course: fixture.rows.courses[0],
    p_source_hash: fixture.hash,
    p_expected_counts: expectedCounts,
    p_publish: publish
  }, { fetchImpl });
  if (["published", "draft"].includes(begin?.status)) return begin;

  for (const storeName of IMPORT_STORE_NAMES) {
    if (storeName === "flowNodes") {
      await importFlowGraphs(fixture, importId, projectUrl, serviceRoleKey, fetchImpl, progress);
      continue;
    }
    if (storeName === "flowCases") continue;
    const rows = fixture.rows[storeName] || [];
    for (let offset = 0; offset < rows.length; offset += IMPORT_CHUNK_SIZE) {
      const chunkIndex = Math.floor(offset / IMPORT_CHUNK_SIZE);
      await rpc(projectUrl, serviceRoleKey, "apply_official_course_import_chunk", {
        p_import_id: importId,
        p_store_name: storeName,
        p_chunk_index: chunkIndex,
        p_rows: rows.slice(offset, offset + IMPORT_CHUNK_SIZE)
      }, { fetchImpl });
    }
    if (rows.length) progress(`${fixture.fileName}: ${storeName} (${rows.length})`);
  }
  return rpc(projectUrl, serviceRoleKey, "finalize_official_course_import", {
    p_import_id: importId
  }, { fetchImpl });
}

export async function publishCatalogFixtures({
  publish = false,
  apply = false,
  courseFile = "",
  fetchImpl = globalThis.fetch,
  environment = process.env,
  progress = () => {}
} = {}) {
  const manifest = await readJson(path.join(fixtureDirectory, "catalog-fixtures.json"));
  const selectedFiles = (courseFile ? [courseFile] : manifest.courseFiles).map(assertFixtureName);
  const prepared = [];
  for (const fileName of selectedFiles) prepared.push(await prepareFixture(fileName));
  const results = [];
  for (const fixture of prepared) {
    let remote = null;
    if (apply) {
      try {
        remote = await importPreparedCatalogFixture(fixture, { publish, fetchImpl, environment, progress });
      } catch (error) {
        throw new Error(
          `Importação de ${fixture.fileName} falhou: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error }
        );
      }
    }
    results.push({
      fileName: fixture.fileName,
      contractKey: fixture.course.id,
      hash: fixture.hash,
      rowCount: fixture.rowCount,
      mode: apply ? (publish ? "published" : "draft") : "validated",
      ...(remote ? { remote } : {})
    });
  }
  return results;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const results = await publishCatalogFixtures({
    ...options,
    progress: (message) => console.error(message)
  });
  console.log(JSON.stringify(results, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
