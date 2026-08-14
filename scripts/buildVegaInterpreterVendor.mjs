import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const packagePath = path.join(
  repositoryRoot,
  "node_modules",
  "vega-interpreter",
  "build",
  "vega-interpreter.js"
);
const outputPath = path.join(repositoryRoot, "public", "vendor", "vega-interpreter.js");
const importStatement = "import { ascending, isString, DisallowedObjectProperties } from 'vega-util';";
const exportStatement = "export { expression as expressionInterpreter };";

export function buildClassicRuntime(source) {
  const normalizedSource = source.replace(/\r\n?/gu, "\n");
  if (!normalizedSource.startsWith(importStatement)) {
    throw new Error("A entrada de vega-interpreter mudou; revise a geração do vendor clássico.");
  }
  if (!normalizedSource.includes(exportStatement)) {
    throw new Error("A saída de vega-interpreter mudou; revise a geração do vendor clássico.");
  }

  const body = normalizedSource
    .slice(importStatement.length)
    .replace(exportStatement, "global.vega.expressionInterpreter = expression;")
    .replace(/\n?\/\/# sourceMappingURL=vega-interpreter\.js\.map\s*$/u, "")
    .trim();

  if (/\b(?:import|export)\s/u.test(body)) {
    throw new Error("O vendor de vega-interpreter ainda contém sintaxe de módulo.");
  }

  return [
    "/* vega-interpreter 2.3.1 | BSD-3-Clause | gerado por scripts/buildVegaInterpreterVendor.mjs */",
    "(function installVegaExpressionInterpreter(global) {",
    "  \"use strict\";",
    "  if (!global.vega) throw new Error(\"Vega precisa ser carregado antes do interpretador.\");",
    "  const { ascending, isString, DisallowedObjectProperties } = global.vega;",
    body,
    "})(globalThis);",
    ""
  ].join("\n");
}

async function main() {
  const expected = buildClassicRuntime(await fs.readFile(packagePath, "utf8"));
  const current = await fs.readFile(outputPath, "utf8").catch(() => null);
  const normalizedCurrent = current?.replace(/\r\n?/gu, "\n") ?? null;
  const checkOnly = process.argv.includes("--check");

  if (normalizedCurrent === expected) {
    if (!checkOnly) console.log("Vendor CSP-safe do Vega já está atualizado.");
  } else if (checkOnly) {
    throw new Error("public/vendor/vega-interpreter.js está divergente da dependência instalada.");
  } else {
    await fs.writeFile(outputPath, expected, "utf8");
    console.log("Vendor CSP-safe do Vega atualizado.");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
