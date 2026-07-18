import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateContractDocument } from "../src/contract/validateContract.js";
import { createExampleProjectDocument, createTeoriaDosGrafosProvaProjectDocument } from "../tests/support/exampleProjectDocument.js";
import { getCatalogFixtureProject } from "../tests/support/catalogPublicationFixture.js";

function assertValid(label, document) {
  const result = validateContractDocument(document);
  if (!result.ok) {
    throw new Error(`${label} inválido: ${result.error}`);
  }

  return {
    label,
    courseCount: result.value.courses.length
  };
}

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const examplesDirectory = path.join(repositoryRoot, "docs", "examples");
const publicExampleNames = (await fs.readdir(examplesDirectory))
  .filter((fileName) => fileName.startsWith("aralearn-contract.") && fileName.endsWith(".json"))
  .sort();
const publicExamples = await Promise.all(publicExampleNames.map(async (fileName) => [
  fileName,
  JSON.parse(await fs.readFile(path.join(examplesDirectory, fileName), "utf8"))
]));

const summaries = [
  assertValid("exampleProjectDocument", createExampleProjectDocument()),
  assertValid("teoriaDosGrafosProvaProjectDocument", createTeoriaDosGrafosProvaProjectDocument()),
  assertValid("catalogPublicationFixtures", getCatalogFixtureProject()),
  ...publicExamples.map(([fileName, document]) => assertValid(`docs/examples/${fileName}`, document))
];

console.log(JSON.stringify(summaries, null, 2));
