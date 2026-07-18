import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateProjectDocument } from "../src/domain/aralearnProject.js";
import { canonicalCourseHash } from "../src/persistence/canonicalCourseHash.js";
import { contractToRelationalRows } from "../src/persistence/contractToRelationalRows.js";
import { assertValidRelationalCourse } from "../src/persistence/validateRelationalCourse.js";

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

async function prepareFixture(fileName) {
  const course = await readJson(path.join(fixtureDirectory, assertFixtureName(fileName)));
  const project = publicProject(course);
  const contractValidation = validateProjectDocument(project);
  if (!contractValidation.ok) {
    const details = contractValidation.errors.map((entry) => `${entry.path}: ${entry.message}`).join("; ");
    throw new Error(`${fileName} viola o contrato v3: ${details}`);
  }
  assertPublicationReady(course, fileName);
  const rows = contractToRelationalRows(project);
  assertValidRelationalCourse(rows);
  return {
    fileName,
    course,
    rows,
    hash: await canonicalCourseHash(course),
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

async function importFixture(fixture, { publish, fetchImpl = globalThis.fetch, environment = process.env } = {}) {
  const { projectUrl, serviceRoleKey } = adminConfiguration(environment);
  const response = await fetchImpl.call(globalThis, `${projectUrl}/rest/v1/rpc/import_official_course`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      p_envelope: { ...fixture.rows, course: fixture.rows.courses[0] },
      p_publish: publish
    })
  });
  const source = await response.text();
  let body;
  try {
    body = source ? JSON.parse(source) : null;
  } catch {
    body = source;
  }
  if (!response.ok) {
    throw new Error(`Importação de ${fixture.fileName} falhou (HTTP ${response.status}): ${body?.message || body || "sem detalhes"}`);
  }
  return body;
}

export async function publishCatalogFixtures({
  publish = false,
  apply = false,
  courseFile = "",
  fetchImpl = globalThis.fetch,
  environment = process.env
} = {}) {
  const manifest = await readJson(path.join(fixtureDirectory, "catalog-fixtures.json"));
  const selectedFiles = (courseFile ? [courseFile] : manifest.courseFiles).map(assertFixtureName);
  const prepared = [];
  for (const fileName of selectedFiles) prepared.push(await prepareFixture(fileName));
  const results = [];
  for (const fixture of prepared) {
    const remote = apply ? await importFixture(fixture, { publish, fetchImpl, environment }) : null;
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
  const results = await publishCatalogFixtures(options);
  console.log(JSON.stringify(results, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
