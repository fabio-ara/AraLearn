import fs from "node:fs/promises";

const catalogDirectory = new URL("../../supabase/fixtures/catalog/", import.meta.url);
const manifestFixture = JSON.parse(
  await fs.readFile(new URL("catalog-fixtures.json", catalogDirectory), "utf8")
);
const courseFixtures = new Map(
  await Promise.all(manifestFixture.courseFiles.map(async (fileName) => [
    fileName,
    JSON.parse(await fs.readFile(new URL(fileName, catalogDirectory), "utf8"))
  ]))
);
const projectFixture = {
  contract: "aralearn.contract",
  version: 4,
  kind: "project",
  courses: manifestFixture.courseFiles.map((fileName) => courseFixtures.get(fileName))
};

export function getCatalogFixtureProject() {
  return structuredClone(projectFixture);
}

export function getCatalogFixtureManifest() {
  return structuredClone(manifestFixture);
}

export function getCatalogCourseFixture(fileName) {
  if (!courseFixtures.has(fileName)) {
    throw new Error(`Curso ausente das fixtures de publicação: "${fileName}".`);
  }
  return structuredClone(courseFixtures.get(fileName));
}
