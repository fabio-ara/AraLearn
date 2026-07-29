import fs from "node:fs/promises";
import path from "node:path";
import {
  migrateProjectV3ToV4,
  migrateResourceChoicesV3ToV4
} from "../src/migrations/projectV3ToV4.js";

const resourceOnly = process.argv.includes("--resources-only");
const filePaths = process.argv.slice(2).filter((argument) => argument !== "--resources-only");
if (!filePaths.length) {
  throw new Error("Uso: node scripts/migrateProjectV3ToV4.mjs [--resources-only] <arquivo.json> [...]");
}

for (const filePath of filePaths) {
  const absolutePath = path.resolve(filePath);
  const source = await fs.readFile(absolutePath, "utf8");
  const input = JSON.parse(source);
  const result = resourceOnly
    ? migrateResourceChoicesV3ToV4(input)
    : migrateProjectV3ToV4(input);
  const value = resourceOnly ? result.value : result.project;
  const changedPaths = resourceOnly ? result.changedPaths : result.report.changedPaths;
  await fs.writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  console.log(`${filePath}: ${changedPaths.length} alterações`);
}
