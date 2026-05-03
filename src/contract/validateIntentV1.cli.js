import fs from "node:fs";
import process from "node:process";

import { validateIntentV1Document } from "./validateIntentV1.js";

const filePath = process.argv[2];

if (!filePath) {
  console.error("Informe o caminho de um arquivo JSON.");
  process.exit(1);
}

let rawContent;
try {
  rawContent = fs.readFileSync(filePath, "utf8");
} catch (error) {
  console.error(`Não foi possível ler o arquivo: ${filePath}`);
  console.error(error.message);
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(rawContent);
} catch (error) {
  console.error(`JSON inválido em: ${filePath}`);
  console.error(error.message);
  process.exit(1);
}

const result = validateIntentV1Document(parsed);

if (!result.ok) {
  console.error(`Documento inválido: ${filePath}`);
  for (const error of result.errors) {
    console.error(`- ${error.path}: ${error.message}`);
  }
  process.exit(1);
}

console.log(`Documento válido: ${filePath}`);
console.log(JSON.stringify(result.value, null, 2));
