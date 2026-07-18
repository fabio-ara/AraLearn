import fs from "node:fs";
import { fileURLToPath } from "node:url";

const FIXTURE_DIRECTORY = new URL("../fixtures/course-catalog/", import.meta.url);
const FIXTURE_FILE_PATTERN = /^[a-z0-9][a-z0-9._-]*\.json$/i;

function resolveFixtureUrl(fileName) {
  const normalizedFileName = String(fileName || "").trim();
  if (!FIXTURE_FILE_PATTERN.test(normalizedFileName)) {
    throw new Error(`Nome de fixture inválido: "${normalizedFileName}".`);
  }
  return new URL(normalizedFileName, FIXTURE_DIRECTORY);
}

export function loadCourseFixture(fileName) {
  const fileUrl = resolveFixtureUrl(fileName);
  return JSON.parse(fs.readFileSync(fileURLToPath(fileUrl), "utf8"));
}

export function loadCourseFixtureManifest() {
  return loadCourseFixture("course-catalog-manifest.json");
}
