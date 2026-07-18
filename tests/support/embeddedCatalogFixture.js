import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  loadEmbeddedCourseFromJson,
  loadEmbeddedSeedManifest
} from "../../src/ui/embeddedSeedCourseLoader.js";
import { loadEmbeddedSeedProjectDocument } from "../../src/ui/embeddedSeedProjectDocument.js";

async function fetchLocalFile(url) {
  try {
    const sourceText = await fs.readFile(fileURLToPath(url), "utf8");
    return {
      ok: true,
      status: 200,
      async text() {
        return sourceText;
      }
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        ok: false,
        status: 404,
        async text() {
          return "";
        }
      };
    }
    throw error;
  }
}

const loaderOptions = { fetchImpl: fetchLocalFile };
const [projectFixture, manifestFixture] = await Promise.all([
  loadEmbeddedSeedProjectDocument(loaderOptions),
  loadEmbeddedSeedManifest(loaderOptions)
]);
const courseFixtures = new Map(
  await Promise.all(
    manifestFixture.courseFiles.map(async (fileName) => [
      fileName,
      await loadEmbeddedCourseFromJson(fileName, loaderOptions)
    ])
  )
);

export function getEmbeddedSeedProjectFixture() {
  return structuredClone(projectFixture);
}

export function getEmbeddedSeedManifestFixture() {
  return structuredClone(manifestFixture);
}

export function getEmbeddedCourseFixture(fileName) {
  if (!courseFixtures.has(fileName)) {
    throw new Error(`Curso embarcado ausente das fixtures: "${fileName}".`);
  }
  return structuredClone(courseFixtures.get(fileName));
}

export { fetchLocalFile };
