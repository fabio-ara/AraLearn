import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { validateProjectDocument } from "../src/domain/aralearnProject.js";
import { AuthoringWorkspaceEngine } from "../supabase/functions/_shared/aralearn-authoring/workspaceEngine.js";
import { prepareCourseDocument } from "../supabase/functions/_shared/aralearn-authoring/canonical.js";
import { selectCourseDocument } from "../supabase/functions/_shared/aralearn-authoring/workspaceModel.js";
import {
  resolveSupabaseAdministrativeEnvironment,
  supabaseServerHeaders
} from "../supabase/functions/_shared/aralearn-authoring/supabaseEnvironment.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDirectory = path.join(repositoryRoot, "supabase", "fixtures", "catalog");

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

function deterministicUuid(value) {
  const bytes = Buffer.from(createHash("sha256").update(value).digest("hex").slice(0, 32), "hex");
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function prepareFixture(fileName) {
  const project = await readJson(path.join(fixtureDirectory, assertFixtureName(fileName)));
  const contractValidation = validateProjectDocument(project);
  if (!contractValidation.ok) {
    const details = contractValidation.errors.map((entry) => `${entry.path}: ${entry.message}`).join("; ");
    throw new Error(`${fileName} viola o contrato por packages: ${details}`);
  }
  const prepared = await prepareCourseDocument(project);
  const publication = await prepareCourseDocument(
    selectCourseDocument(prepared.document, prepared.course.id),
    { requireReady: false }
  );
  return {
    fileName,
    course: prepared.course,
    document: prepared.document,
    hash: prepared.contentHash,
    publicationHash: publication.contentHash
  };
}

function adminConfiguration(environment = process.env) {
  const configuration = resolveSupabaseAdministrativeEnvironment(environment);
  const parsed = new URL(configuration.supabaseUrl);
  if (parsed.protocol !== "https:" && !configuration.local) {
    throw new Error("ARALEARN_SUPABASE_URL administrativa deve usar HTTPS fora do ambiente local.");
  }
  return {
    projectUrl: configuration.supabaseUrl,
    serverApiKey: configuration.serverApiKey
  };
}

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function rpc(projectUrl, serverApiKey, functionName, payload, {
  fetchImpl = globalThis.fetch,
  attempts = 5
} = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response;
    try {
      response = await fetchImpl.call(globalThis, `${projectUrl}/rest/v1/rpc/${functionName}`, {
        method: "POST",
        headers: supabaseServerHeaders(serverApiKey),
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
    lastError.status = response.status;
    if (!retryable || attempt === attempts) throw lastError;
    await wait(250 * attempt);
  }
  throw lastError || new Error(`${functionName} falhou sem resposta.`);
}

async function resolvePublisher(projectUrl, serverApiKey, contractKey, {
  fetchImpl = globalThis.fetch,
  ownerId = ""
} = {}) {
  return rpc(projectUrl, serverApiKey, "resolve_catalog_artifact_publisher_v4", {
    p_contract_key: contractKey,
    p_requested_owner_id: ownerId || null
  }, { fetchImpl });
}

export async function importPreparedCatalogFixture(fixture, {
  publish,
  fetchImpl = globalThis.fetch,
  environment = process.env,
  progress = () => {},
  engine: suppliedEngine = null,
  publisher: suppliedPublisher = null
} = {}) {
  const { projectUrl, serverApiKey } = adminConfiguration(environment);
  const publisher = suppliedPublisher || await resolvePublisher(
    projectUrl,
    serverApiKey,
    fixture.course.id,
    {
      fetchImpl,
      ownerId: String(environment.ARALEARN_CATALOG_OWNER_ID || "").trim()
    }
  );
  if (!publisher?.actorId) {
    throw new Error("Nenhum owner ou catalog_publisher ativo foi encontrado.");
  }
  if (publish
      && publisher.courseId
      && publisher.currentRevisionHash === fixture.publicationHash) {
    progress(`${fixture.fileName}: revisão ${fixture.publicationHash} já é a revisão oficial corrente`);
    return {
      courseId: publisher.courseId,
      contentHash: fixture.publicationHash,
      target: "catalog",
      unchanged: true
    };
  }
  const principal = {
    actorId: publisher.actorId,
    authenticationKind: "administrative_batch",
    scopes: ["*"]
  };
  const engine = suppliedEngine || new AuthoringWorkspaceEngine({
    supabaseUrl: projectUrl,
    serverApiKey,
    fetchImpl,
    rpc: (functionName, payload, options) =>
      rpc(projectUrl, serverApiKey, functionName, payload, { fetchImpl, ...options })
  });
  const workspaceId = publisher.workspaceId || deterministicUuid(
    `aralearn:catalog-workspace:packages-v1:${fixture.course.id}:${fixture.publicationHash}`
  );
  const publicationIntent = publisher.courseId
    ? {
        existingCourseId: publisher.courseId,
        expectedContentHash: publisher.currentRevisionHash
      }
    : {};
  progress(`${fixture.fileName}: materializando workspace canônico ${fixture.publicationHash}`);
  const workspaceArguments = {
    principal,
    workspaceId,
    requestId: "",
    title: `Catálogo: ${fixture.course.title}`,
    brief: `Importação administrativa da fixture ${fixture.fileName}; hash canônico ${fixture.publicationHash}.`,
    document: fixture.document
  };
  if (!publisher.workspaceId) {
    const cleanup = await engine.discardUnpublishedCatalogMaterialization({
      principal,
      workspaceId
    });
    if (cleanup?.discarded) {
      progress(`${fixture.fileName}: materialização administrativa interrompida removida`);
    }
  }
  let current;
  if (publisher.workspaceId) {
    current = await engine.replaceCanonicalCatalogWorkspace({
      ...workspaceArguments,
      requestId: `catalog-workspace:${deterministicUuid(
        `packages-v1:${fixture.course.id}:${fixture.publicationHash}:${publisher.workspaceRevision}`
      )}`,
      expectedRevision: publisher.workspaceRevision
    });
  } else {
    current = await engine.createCanonicalCatalogWorkspace({
      ...workspaceArguments,
      requestId: `catalog-workspace:${deterministicUuid(
        `packages-v1:${fixture.course.id}:${fixture.publicationHash}`
      )}`
    });
  }
  if (!publish) return current;
  progress(`${fixture.fileName}: publicando revisão ${fixture.publicationHash}`);
  const published = await engine.publish({
    principal,
    workspaceId,
    requestId: `catalog-publish:${deterministicUuid(
      `packages-v1:${fixture.course.id}:${fixture.publicationHash}`
    )}`,
    expectedRevision: current.currentRevision || current.revision,
    courseId: fixture.course.id,
    target: "catalog",
    completion: "complete",
    existingCourseId: publicationIntent.existingCourseId || null,
    expectedContentHash: publicationIntent.expectedContentHash || null,
    collectionId: publisher.collectionId || null
  });
  if (published.contentHash !== fixture.publicationHash) {
    throw new Error(
      `A publicação devolveu ${published.contentHash || "hash ausente"}; esperado ${fixture.publicationHash}.`
    );
  }
  return published;
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
  const prepared = await Promise.all(selectedFiles.map((fileName) => prepareFixture(fileName)));
  return Promise.all(prepared.map(async (fixture) => {
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
    return {
      fileName: fixture.fileName,
      contractKey: fixture.course.id,
      hash: fixture.publicationHash,
      documentHash: fixture.hash,
      mode: apply ? (publish ? "published" : "draft") : "validated",
      ...(remote ? { remote } : {})
    };
  }));
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
