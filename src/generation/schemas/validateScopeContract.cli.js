import fs from "node:fs";

import { validateScopeContractDocument } from "../../domain/scopeContract.js";

const target = process.argv[2];
if (!target) {
  console.error("Uso: node ./src/generation/schemas/validateScopeContract.cli.js caminho.json");
  process.exit(1);
}

const parsed = JSON.parse(fs.readFileSync(target, "utf8"));
const result = validateScopeContractDocument(parsed);
if (!result.ok) {
  console.error(result.errors.map((error) => `${error.path}: ${error.message}`).join("\n"));
  process.exit(1);
}

console.log(JSON.stringify(result.value, null, 2));

