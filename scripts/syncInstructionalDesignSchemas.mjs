import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { instructionalDesignContracts } from "../src/authoring/instructionalDesignContracts.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "authoring", "schemas");
const FILES = Object.freeze({
  instructionalAnalysis: "instructional-analysis.schema.json",
  designParameterDefinition: "design-parameter-definition.schema.json",
  designParameterAssignment: "design-parameter-assignment.schema.json",
  effectiveDesignSnapshot: "effective-design-snapshot.schema.json",
  materializationManifest: "materialization-manifest.schema.json",
  resourceSet: "resource-set.schema.json"
});
const checkOnly = process.argv.includes("--check");

if (!checkOnly) await mkdir(OUTPUT, { recursive: true });
const contracts = instructionalDesignContracts();
const divergent = [];

for (const [contractName, fileName] of Object.entries(FILES)) {
  const contract = contracts[contractName];
  if (!contract) throw new Error(`Contrato de desenho ausente: ${contractName}.`);
  const expected = `${JSON.stringify(contract, null, 2)}\n`;
  const target = path.join(OUTPUT, fileName);
  const current = await readFile(target, "utf8").catch(() => null);
  if (current === expected) continue;
  divergent.push(fileName);
  if (!checkOnly) await writeFile(target, expected, "utf8");
}

if (checkOnly && divergent.length) {
  throw new Error(`Schemas de desenho divergentes: ${divergent.join(", ")}.`);
}

if (!checkOnly) {
  console.log(`Schemas de desenho sincronizados: ${Object.keys(FILES).length} arquivos.`);
}
